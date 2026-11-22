import {
  buildUserPayload,
  isAdminEmail,
  ITEM_ID_REGEX,
  normalizeAndValidateEmail,
  pickRandomAvatarColor,
  requireAdmin,
  requireAuth,
  requireDb,
  resolveInitialUsername,
  resolveSessionUser,
  validateProfilePatch,
} from './auth.js';
import {
  ConfigError,
  constantTimeEqualBytes,
  generateOtpCode,
  generateSessionToken,
  hashBytesWithSecret,
  hashHexWithSecret,
  hexToBytes,
  requireSessionSecret,
} from './crypto.js';
import {
  sendAdminMessageNotification,
  sendOtpEmail,
  verifyTurnstileToken,
} from './external.js';
import {
  buildClearSessionCookie,
  buildSessionCookie,
  getClientIp,
  getCookieValue,
  jsonResponse,
  rateLimitResponse,
  readJsonBody,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from './http.js';

const OTP_COOLDOWN_SECONDS = 60;
const OTP_EXPIRES_IN_SECONDS = 600;
const OTP_EMAIL_HOURLY_LIMIT = 5;
const OTP_IP_HOURLY_LIMIT = 15;
const OTP_MAX_ATTEMPTS = 5;

const BOOKMARK_SYNC_BATCH_LIMIT = 200;
const BOOKMARK_USER_TOTAL_LIMIT = 500;

const MSG_MAX_LENGTH = 1000;
const MSG_HISTORY_LIMIT = 100;
const MSG_PER_MINUTE_LIMIT = 5;
const MSG_PER_DAY_LIMIT = 30;
const ADMIN_MAIL_THROTTLE_MS = 15 * 60_000;

/**
 * 异步清理过期超过 7 天的验证码记录与已过期会话，保持 D1 存储精简。
 * @param {Record<string, any>} env
 */
async function cleanupStaleAuthRecords(env) {
  try {
    const nowMs = Date.now();
    const sevenDaysAgoIso = new Date(nowMs - 7 * 86_400_000).toISOString();
    const nowIso = new Date(nowMs).toISOString();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM otp_codes WHERE created_at < ?').bind(sevenDaysAgoIso),
      env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(nowIso),
    ]);
  } catch (err) {
    console.error(
      JSON.stringify({
        message: 'stale auth cleanup failed',
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}

/**
 * 查询指定用户当前的全部收藏 ID 列表（按收藏时间倒序）。
 * @param {Record<string, any>} env
 * @param {string} userId
 * @returns {Promise<string[]>}
 */
async function listBookmarkIds(env, userId) {
  const { results = [] } = await env.DB.prepare(
    'SELECT item_id FROM bookmarks WHERE user_id = ? ORDER BY created_at DESC, item_id ASC LIMIT ?',
  )
    .bind(userId, BOOKMARK_USER_TOTAL_LIMIT)
    .all();
  return results.map((row) => row.item_id);
}

/**
 * 校验并规范化私信正文（去除首尾空白后 1~1000 字，禁止 NUL 字符）。
 * @param {unknown} rawBody
 * @returns {{ ok: true, text: string } | { ok: false, error: string }}
 */
function validateMessageBody(rawBody) {
  if (typeof rawBody !== 'string') {
    return { ok: false, error: '私信内容必须为字符串' };
  }
  if (rawBody.includes('\x00')) {
    return { ok: false, error: '私信内容包含非法字符' };
  }
  const normalized = rawBody.replace(/\r\n?/g, '\n').trim();
  if (normalized.length < 1 || normalized.length > MSG_MAX_LENGTH) {
    return { ok: false, error: `私信内容去首尾空白后需为 1~${MSG_MAX_LENGTH} 字` };
  }
  return { ok: true, text: normalized };
}

/**
 * 1. `GET /api/config`
 */
export async function handleGetConfig(_request, env) {
  const siteKey = typeof env?.TURNSTILE_SITE_KEY === 'string' ? env.TURNSTILE_SITE_KEY : '';
  return jsonResponse({
    enabled: true,
    turnstile_site_key: siteKey,
  });
}

/**
 * 2. `GET /api/me`
 * 未登录或 Cookie 失效时一律返回 `200 { "user": null }`，避免匿名访客浏览器控制台出现 401 报错。
 */
export async function handleGetMe(request, env) {
  const { userRow, hadCookie } = await resolveSessionUser(request, env);
  if (!userRow) {
    const extraHeaders = hadCookie
      ? { 'Set-Cookie': buildClearSessionCookie(request) }
      : {};
    return jsonResponse({ user: null }, 200, extraHeaders);
  }

  const user = await buildUserPayload(env, userRow);
  return jsonResponse({ user }, 200);
}

/**
 * 3. `POST /api/auth/request-otp`
 */
export async function handleRequestOtp(request, env, ctx) {
  const dbCheck = requireDb(env);
  if (!dbCheck.ok) return dbCheck.response;

  try {
    requireSessionSecret(env);
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(JSON.stringify({ message: err.message }));
      return jsonResponse({ error: '服务端认证密钥尚未配置完成' }, 503);
    }
    throw err;
  }

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;

  const email = normalizeAndValidateEmail(parsed.data.email);
  if (!email) {
    return jsonResponse({ error: '请输入有效的邮箱地址' }, 400);
  }

  const clientIp = getClientIp(request);
  const turnstile = await verifyTurnstileToken({
    token: parsed.data.turnstile_token,
    remoteIp: clientIp,
    env,
  });
  if (!turnstile.ok) {
    return jsonResponse({ error: turnstile.error }, turnstile.status);
  }

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const oneHourAgoIso = new Date(nowMs - 3_600_000).toISOString();

  // 同邮箱限频：60 秒最多 1 次，每小时最多 5 次
  const { results: emailRecent = [] } = await env.DB.prepare(
    'SELECT created_at FROM otp_codes WHERE email = ? AND created_at > ? ORDER BY created_at ASC',
  )
    .bind(email, oneHourAgoIso)
    .all();

  if (emailRecent.length > 0) {
    const latestMs = Date.parse(emailRecent[emailRecent.length - 1].created_at);
    if (Number.isFinite(latestMs) && latestMs > nowMs - OTP_COOLDOWN_SECONDS * 1000) {
      const retryAfter = (latestMs + OTP_COOLDOWN_SECONDS * 1000 - nowMs) / 1000;
      return rateLimitResponse('验证码发送过于频繁，请稍后再试', retryAfter);
    }
  }

  if (emailRecent.length >= OTP_EMAIL_HOURLY_LIMIT) {
    const windowAnchorMs = Date.parse(
      emailRecent[emailRecent.length - OTP_EMAIL_HOURLY_LIMIT].created_at,
    );
    const retryAfter = Number.isFinite(windowAnchorMs)
      ? (windowAnchorMs + 3_600_000 - nowMs) / 1000
      : 3600;
    return rateLimitResponse('该邮箱每小时最多发送 5 次验证码，请稍后再试', retryAfter);
  }

  // 同 IP（哈希落库）限频：每小时最多 15 次
  const ipHash = await hashHexWithSecret(env, 'ip', clientIp);
  const { results: ipRecent = [] } = await env.DB.prepare(
    'SELECT created_at FROM otp_codes WHERE ip_hash = ? AND created_at > ? ORDER BY created_at ASC',
  )
    .bind(ipHash, oneHourAgoIso)
    .all();

  if (ipRecent.length >= OTP_IP_HOURLY_LIMIT) {
    const ipAnchorMs = Date.parse(ipRecent[ipRecent.length - OTP_IP_HOURLY_LIMIT].created_at);
    const retryAfter = Number.isFinite(ipAnchorMs)
      ? (ipAnchorMs + 3_600_000 - nowMs) / 1000
      : 3600;
    return rateLimitResponse('当前网络请求验证码次数过多，请稍后再试', retryAfter);
  }

  const code = generateOtpCode();
  const otpId = crypto.randomUUID();
  const codeHash = await hashHexWithSecret(env, 'otp', `${email}:${code}`);
  const expiresAtIso = new Date(nowMs + OTP_EXPIRES_IN_SECONDS * 1000).toISOString();

  await env.DB.prepare(
    `INSERT INTO otp_codes (id, email, code_hash, attempts, expires_at, consumed_at, ip_hash, created_at)
     VALUES (?, ?, ?, 0, ?, NULL, ?, ?)`,
  )
    .bind(otpId, email, codeHash, expiresAtIso, ipHash, nowIso)
    .run();

  const sendResult = await sendOtpEmail({ env, toEmail: email, code });
  if (!sendResult.ok) {
    // 邮件未发出时回滚本次验证码记录，避免用户未收到邮件却被冷却期锁死
    await env.DB.prepare('DELETE FROM otp_codes WHERE id = ?').bind(otpId).run();
    return jsonResponse({ error: sendResult.error }, sendResult.status);
  }

  // 使同一邮箱此前尚未消耗的旧验证码失效（保留记录本身以维持限频统计准确）
  await env.DB.prepare(
    'UPDATE otp_codes SET consumed_at = ? WHERE email = ? AND id != ? AND consumed_at IS NULL',
  )
    .bind(nowIso, email, otpId)
    .run();

  if (ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(cleanupStaleAuthRecords(env));
  }

  return jsonResponse({
    ok: true,
    cooldown_seconds: OTP_COOLDOWN_SECONDS,
    expires_in: OTP_EXPIRES_IN_SECONDS,
  });
}

/**
 * 4. `POST /api/auth/verify-otp`
 */
export async function handleVerifyOtp(request, env) {
  const dbCheck = requireDb(env);
  if (!dbCheck.ok) return dbCheck.response;

  try {
    requireSessionSecret(env);
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(JSON.stringify({ message: err.message }));
      return jsonResponse({ error: '服务端认证密钥尚未配置完成' }, 503);
    }
    throw err;
  }

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;

  const email = normalizeAndValidateEmail(parsed.data.email);
  if (!email) {
    return jsonResponse({ error: '请输入有效的邮箱地址' }, 400);
  }

  const rawCode = typeof parsed.data.code === 'string' ? parsed.data.code.trim() : '';
  if (!/^\d{6}$/.test(rawCode)) {
    return jsonResponse({ error: '请输入 6 位数字验证码' }, 400);
  }

  const usernameCheck = resolveInitialUsername(email, parsed.data.username);
  if (!usernameCheck.ok) {
    return jsonResponse({ error: usernameCheck.error }, 400);
  }

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const otpRow = await env.DB.prepare(
    `SELECT id, code_hash, attempts, expires_at
     FROM otp_codes
     WHERE email = ? AND consumed_at IS NULL AND expires_at > ?
     ORDER BY created_at DESC
     LIMIT 1`,
  )
    .bind(email, nowIso)
    .first();

  if (!otpRow || Number(otpRow.attempts) >= OTP_MAX_ATTEMPTS) {
    return jsonResponse({ error: '验证码无效或已过期，请重新获取' }, 400);
  }

  const candidateBytes = await hashBytesWithSecret(env, 'otp', `${email}:${rawCode}`);
  const storedBytes = hexToBytes(otpRow.code_hash);
  const isValidCode = constantTimeEqualBytes(candidateBytes, storedBytes);

  if (!isValidCode) {
    const nextAttempts = Number(otpRow.attempts) + 1;
    await env.DB.prepare(
      `UPDATE otp_codes
       SET attempts = attempts + 1,
           consumed_at = CASE WHEN attempts + 1 >= ? THEN ? ELSE consumed_at END
       WHERE id = ?`,
    )
      .bind(OTP_MAX_ATTEMPTS, nowIso, otpRow.id)
      .run();

    if (nextAttempts >= OTP_MAX_ATTEMPTS) {
      return jsonResponse({ error: '验证码错误已达 5 次上限，已自动作废，请重新获取' }, 400);
    }
    return jsonResponse(
      { error: `验证码不正确，还可尝试 ${OTP_MAX_ATTEMPTS - nextAttempts} 次` },
      400,
    );
  }

  // 原子标记验证码已消耗，防止并发重复核验
  const consumeRes = await env.DB.prepare(
    `UPDATE otp_codes
     SET consumed_at = ?
     WHERE id = ? AND consumed_at IS NULL AND attempts < ? AND expires_at > ?`,
  )
    .bind(nowIso, otpRow.id, OTP_MAX_ATTEMPTS, nowIso)
    .run();

  if ((consumeRes?.meta?.changes ?? 0) !== 1) {
    return jsonResponse({ error: '验证码已被使用或已过期，请重新获取' }, 400);
  }

  let userRow = await env.DB.prepare(
    'SELECT id, email, username, avatar_data, avatar_color FROM users WHERE email = ? LIMIT 1',
  )
    .bind(email)
    .first();

  let isNewUser = false;
  if (!userRow) {
    const newUserId = crypto.randomUUID();
    const avatarColor = pickRandomAvatarColor();
    const insertRes = await env.DB.prepare(
      `INSERT OR IGNORE INTO users (id, email, username, avatar_data, avatar_color, created_at, updated_at)
       VALUES (?, ?, ?, NULL, ?, ?, ?)`,
    )
      .bind(newUserId, email, usernameCheck.username, avatarColor, nowIso, nowIso)
      .run();

    isNewUser = (insertRes?.meta?.changes ?? 0) === 1;
    userRow = await env.DB.prepare(
      'SELECT id, email, username, avatar_data, avatar_color FROM users WHERE email = ? LIMIT 1',
    )
      .bind(email)
      .first();
  }

  if (!userRow) {
    return jsonResponse({ error: '账号初始化失败，请重试' }, 500);
  }

  const sessionToken = generateSessionToken();
  const sessionTokenHash = await hashHexWithSecret(env, 'session', sessionToken);
  const sessionExpiresAt = new Date(nowMs + SESSION_MAX_AGE_SECONDS * 1000).toISOString();

  await env.DB.prepare(
    'INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
  )
    .bind(sessionTokenHash, userRow.id, sessionExpiresAt, nowIso)
    .run();

  const user = await buildUserPayload(env, userRow);
  return jsonResponse(
    {
      ok: true,
      is_new_user: isNewUser,
      user,
    },
    200,
    { 'Set-Cookie': buildSessionCookie(sessionToken, request) },
  );
}

/**
 * 5. `POST /api/auth/logout`
 */
export async function handleLogout(request, env) {
  const parsed = await readJsonBody(request, { allowEmpty: true });
  if (!parsed.ok) return parsed.response;

  const rawToken = getCookieValue(request, SESSION_COOKIE_NAME);
  const hasSecret = typeof env?.SESSION_SECRET === 'string' && env.SESSION_SECRET.trim().length > 0;
  if (
    rawToken &&
    /^[0-9a-f]{64}$/.test(rawToken) &&
    env?.DB &&
    typeof env.DB.prepare === 'function' &&
    hasSecret
  ) {
    const tokenHash = await hashHexWithSecret(env, 'session', rawToken);
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
  }

  return jsonResponse(
    { ok: true },
    200,
    { 'Set-Cookie': buildClearSessionCookie(request) },
  );
}

/**
 * 6. `PATCH /api/profile`
 */
export async function handlePatchProfile(request, env) {
  const auth = await requireAuth(request, env);
  if (!auth.ok) return auth.response;

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;

  const validation = validateProfilePatch(parsed.data, auth.userRow);
  if (!validation.ok) {
    return jsonResponse({ error: validation.error }, 400);
  }

  if (validation.changed) {
    const nowIso = new Date().toISOString();
    await env.DB.prepare(
      'UPDATE users SET username = ?, avatar_data = ?, avatar_color = ?, updated_at = ? WHERE id = ?',
    )
      .bind(
        validation.username,
        validation.avatar_data ?? null,
        validation.avatar_color,
        nowIso,
        auth.userRow.id,
      )
      .run();
  }

  const updatedRow = {
    id: auth.userRow.id,
    email: auth.userRow.email,
    username: validation.username,
    avatar_data: validation.avatar_data ?? null,
    avatar_color: validation.avatar_color,
  };
  const user = await buildUserPayload(env, updatedRow);
  return jsonResponse({ ok: true, user }, 200);
}

/**
 * 7a. `GET /api/bookmarks`
 */
export async function handleGetBookmarks(request, env) {
  const auth = await requireAuth(request, env);
  if (!auth.ok) return auth.response;

  const ids = await listBookmarkIds(env, auth.userRow.id);
  return jsonResponse({ ids }, 200);
}

/**
 * 7b. `POST /api/bookmarks/sync`
 */
export async function handleSyncBookmarks(request, env) {
  const auth = await requireAuth(request, env);
  if (!auth.ok) return auth.response;

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;

  const incoming = parsed.data.ids;
  if (!Array.isArray(incoming)) {
    return jsonResponse({ error: 'ids 字段必须为字符串数组' }, 400);
  }
  if (incoming.length > BOOKMARK_SYNC_BATCH_LIMIT) {
    return jsonResponse(
      { error: `单次同步收藏最多支持 ${BOOKMARK_SYNC_BATCH_LIMIT} 条` },
      400,
    );
  }

  const uniqueIncoming = [];
  const seenIncoming = new Set();
  for (const item of incoming) {
    if (typeof item !== 'string' || !ITEM_ID_REGEX.test(item)) {
      return jsonResponse({ error: '存在格式不合法的收藏条目 ID' }, 400);
    }
    if (!seenIncoming.has(item)) {
      seenIncoming.add(item);
      uniqueIncoming.push(item);
    }
  }

  const existingIds = await listBookmarkIds(env, auth.userRow.id);
  const existingSet = new Set(existingIds);
  const newToInsert = uniqueIncoming.filter((id) => !existingSet.has(id));

  if (existingSet.size + newToInsert.length > BOOKMARK_USER_TOTAL_LIMIT) {
    return jsonResponse(
      { error: `单用户收藏总量上限为 ${BOOKMARK_USER_TOTAL_LIMIT} 条` },
      400,
    );
  }

  if (newToInsert.length > 0) {
    const baseMs = Date.now();
    const statements = newToInsert.map((itemId, idx) =>
      env.DB.prepare(
        'INSERT OR IGNORE INTO bookmarks (user_id, item_id, created_at) VALUES (?, ?, ?)',
      ).bind(auth.userRow.id, itemId, new Date(baseMs - idx).toISOString()),
    );
    await env.DB.batch(statements);
  }

  const ids = await listBookmarkIds(env, auth.userRow.id);
  return jsonResponse({ ids }, 200);
}

/**
 * 7c. `PUT /api/bookmarks/:itemId`
 */
export async function handlePutBookmark(request, env, itemId) {
  const auth = await requireAuth(request, env);
  if (!auth.ok) return auth.response;

  const parsed = await readJsonBody(request, { allowEmpty: true });
  if (!parsed.ok) return parsed.response;

  if (!ITEM_ID_REGEX.test(itemId)) {
    return jsonResponse({ error: '收藏条目 ID 格式不合法' }, 400);
  }

  const existingIds = await listBookmarkIds(env, auth.userRow.id);
  if (!existingIds.includes(itemId) && existingIds.length >= BOOKMARK_USER_TOTAL_LIMIT) {
    return jsonResponse(
      { error: `单用户收藏总量上限为 ${BOOKMARK_USER_TOTAL_LIMIT} 条` },
      400,
    );
  }

  const nowIso = new Date().toISOString();
  await env.DB.prepare(
    'INSERT OR IGNORE INTO bookmarks (user_id, item_id, created_at) VALUES (?, ?, ?)',
  )
    .bind(auth.userRow.id, itemId, nowIso)
    .run();

  const ids = await listBookmarkIds(env, auth.userRow.id);
  return jsonResponse({ ok: true, ids }, 200);
}

/**
 * 7d. `DELETE /api/bookmarks/:itemId`
 */
export async function handleDeleteBookmark(request, env, itemId) {
  const auth = await requireAuth(request, env);
  if (!auth.ok) return auth.response;

  const parsed = await readJsonBody(request, { allowEmpty: true });
  if (!parsed.ok) return parsed.response;

  if (!ITEM_ID_REGEX.test(itemId)) {
    return jsonResponse({ error: '收藏条目 ID 格式不合法' }, 400);
  }

  await env.DB.prepare('DELETE FROM bookmarks WHERE user_id = ? AND item_id = ?')
    .bind(auth.userRow.id, itemId)
    .run();

  const ids = await listBookmarkIds(env, auth.userRow.id);
  return jsonResponse({ ok: true, ids }, 200);
}

/**
 * 8a. `GET /api/messages`
 */
export async function handleGetMessages(request, env) {
  const auth = await requireAuth(request, env);
  if (!auth.ok) return auth.response;

  const [, selectResult] = await env.DB.batch([
    env.DB.prepare(
      "UPDATE messages SET read_by_user = 1 WHERE user_id = ? AND sender_role = 'admin' AND read_by_user = 0",
    ).bind(auth.userRow.id),
    env.DB.prepare(
      `SELECT id, sender_role, body, created_at
       FROM (
         SELECT id, sender_role, body, created_at, rowid AS _rid
         FROM messages
         WHERE user_id = ?
         ORDER BY created_at DESC, _rid DESC
         LIMIT ?
       )
       ORDER BY created_at ASC, _rid ASC`,
    ).bind(auth.userRow.id, MSG_HISTORY_LIMIT),
  ]);

  const messages = (selectResult?.results || []).map((row) => ({
    id: row.id,
    sender_role: row.sender_role,
    body: row.body,
    created_at: row.created_at,
  }));

  return jsonResponse({ messages }, 200);
}

/**
 * 8b. `POST /api/messages`
 */
export async function handlePostMessage(request, env, ctx) {
  const auth = await requireAuth(request, env);
  if (!auth.ok) return auth.response;

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;

  const bodyCheck = validateMessageBody(parsed.data.body);
  if (!bodyCheck.ok) {
    return jsonResponse({ error: bodyCheck.error }, 400);
  }

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const dayAgoIso = new Date(nowMs - 86_400_000).toISOString();

  // 查询该用户近 24 小时发送的私信记录，用于每分钟 5 条 / 24 小时 30 条限频，以及 15 分钟发信提醒节流
  const { results: recentSent = [] } = await env.DB.prepare(
    `SELECT created_at
     FROM messages
     WHERE user_id = ? AND sender_role = 'user' AND created_at > ?
     ORDER BY created_at ASC`,
  )
    .bind(auth.userRow.id, dayAgoIso)
    .all();

  const lastMinuteSent = recentSent.filter(
    (r) => Date.parse(r.created_at) > nowMs - 60_000,
  );
  if (lastMinuteSent.length >= MSG_PER_MINUTE_LIMIT) {
    const anchorMs = Date.parse(
      lastMinuteSent[lastMinuteSent.length - MSG_PER_MINUTE_LIMIT].created_at,
    );
    const retryAfter = Number.isFinite(anchorMs) ? (anchorMs + 60_000 - nowMs) / 1000 : 60;
    return rateLimitResponse('发送私信过于频繁（每分钟最多 5 条），请稍后再试', retryAfter);
  }

  if (recentSent.length >= MSG_PER_DAY_LIMIT) {
    const anchorMs = Date.parse(recentSent[recentSent.length - MSG_PER_DAY_LIMIT].created_at);
    const retryAfter = Number.isFinite(anchorMs) ? (anchorMs + 86_400_000 - nowMs) / 1000 : 3600;
    return rateLimitResponse('今日私信发送已达上限（24 小时内最多 30 条）', retryAfter);
  }

  const sentWithin15Min = recentSent.some(
    (r) => Date.parse(r.created_at) > nowMs - ADMIN_MAIL_THROTTLE_MS,
  );

  const msgId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO messages (id, user_id, sender_role, body, read_by_admin, read_by_user, created_at)
     VALUES (?, ?, 'user', ?, 0, 1, ?)`,
  )
    .bind(msgId, auth.userRow.id, bodyCheck.text, nowIso)
    .run();

  const messagePayload = {
    id: msgId,
    sender_role: 'user',
    body: bodyCheck.text,
    created_at: nowIso,
  };

  if (
    !sentWithin15Min &&
    !isAdminEmail(auth.userRow.email, env) &&
    ctx &&
    typeof ctx.waitUntil === 'function'
  ) {
    ctx.waitUntil(
      sendAdminMessageNotification({
        env,
        sender: auth.userRow,
        message: messagePayload,
      }),
    );
  }

  return jsonResponse({ ok: true, message: messagePayload }, 201);
}

/**
 * 8c. `GET /api/admin/threads`
 */
export async function handleAdminGetThreads(request, env) {
  const admin = await requireAdmin(request, env);
  if (!admin.ok) return admin.response;

  const { results = [] } = await env.DB.prepare(
    `WITH thread_stats AS (
       SELECT
         user_id,
         SUM(CASE WHEN sender_role = 'user' AND read_by_admin = 0 THEN 1 ELSE 0 END) AS unread_count
       FROM messages
       GROUP BY user_id
     ),
     latest_msg AS (
       SELECT
         user_id,
         body,
         created_at,
         ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC, rowid DESC) AS rn
       FROM messages
     )
     SELECT
       u.id AS user_id,
       u.username,
       u.email,
       u.avatar_data,
       u.avatar_color,
       lm.body AS last_message,
       lm.created_at AS last_at,
       ts.unread_count
     FROM thread_stats ts
     INNER JOIN latest_msg lm ON lm.user_id = ts.user_id AND lm.rn = 1
     INNER JOIN users u ON u.id = ts.user_id
     ORDER BY lm.created_at DESC
     LIMIT 200`,
  ).all();

  const threads = results.map((row) => ({
    user_id: row.user_id,
    username: row.username,
    email: row.email,
    avatar_data: row.avatar_data ?? null,
    avatar_color: row.avatar_color || '#1D1D1F',
    last_message: row.last_message,
    last_at: row.last_at,
    unread_count: Number(row.unread_count || 0),
  }));

  return jsonResponse({ threads }, 200);
}

/**
 * 8d. `GET /api/admin/messages/:userId`
 */
export async function handleAdminGetMessages(request, env, targetUserId) {
  const admin = await requireAdmin(request, env);
  if (!admin.ok) return admin.response;

  if (!targetUserId || targetUserId.length > 64 || /[\x00-\x1F\x7F]/.test(targetUserId)) {
    return jsonResponse({ error: '无效的用户 ID' }, 400);
  }

  const peerRow = await env.DB.prepare(
    'SELECT id, username, email, avatar_data, avatar_color FROM users WHERE id = ? LIMIT 1',
  )
    .bind(targetUserId)
    .first();

  if (!peerRow) {
    return jsonResponse({ error: '目标用户不存在' }, 404);
  }

  const [, selectResult] = await env.DB.batch([
    env.DB.prepare(
      "UPDATE messages SET read_by_admin = 1 WHERE user_id = ? AND sender_role = 'user' AND read_by_admin = 0",
    ).bind(targetUserId),
    env.DB.prepare(
      `SELECT id, sender_role, body, created_at
       FROM (
         SELECT id, sender_role, body, created_at, rowid AS _rid
         FROM messages
         WHERE user_id = ?
         ORDER BY created_at DESC, _rid DESC
         LIMIT ?
       )
       ORDER BY created_at ASC, _rid ASC`,
    ).bind(targetUserId, MSG_HISTORY_LIMIT),
  ]);

  const messages = (selectResult?.results || []).map((row) => ({
    id: row.id,
    sender_role: row.sender_role,
    body: row.body,
    created_at: row.created_at,
  }));

  return jsonResponse(
    {
      peer: {
        id: peerRow.id,
        username: peerRow.username,
        email: peerRow.email,
        avatar_data: peerRow.avatar_data ?? null,
        avatar_color: peerRow.avatar_color || '#1D1D1F',
      },
      messages,
    },
    200,
  );
}

/**
 * 8e. `POST /api/admin/messages/:userId`
 */
export async function handleAdminPostMessage(request, env, targetUserId) {
  const admin = await requireAdmin(request, env);
  if (!admin.ok) return admin.response;

  if (!targetUserId || targetUserId.length > 64 || /[\x00-\x1F\x7F]/.test(targetUserId)) {
    return jsonResponse({ error: '无效的用户 ID' }, 400);
  }

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;

  const bodyCheck = validateMessageBody(parsed.data.body);
  if (!bodyCheck.ok) {
    return jsonResponse({ error: bodyCheck.error }, 400);
  }

  const peerExists = await env.DB.prepare('SELECT id FROM users WHERE id = ? LIMIT 1')
    .bind(targetUserId)
    .first();
  if (!peerExists) {
    return jsonResponse({ error: '目标用户不存在' }, 404);
  }

  const msgId = crypto.randomUUID();
  const nowIso = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO messages (id, user_id, sender_role, body, read_by_admin, read_by_user, created_at)
     VALUES (?, ?, 'admin', ?, 1, 0, ?)`,
  )
    .bind(msgId, targetUserId, bodyCheck.text, nowIso)
    .run();

  const messagePayload = {
    id: msgId,
    sender_role: 'admin',
    body: bodyCheck.text,
    created_at: nowIso,
  };

  return jsonResponse({ ok: true, message: messagePayload }, 201);
}
