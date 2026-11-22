import {
  bytesToHex,
  constantTimeEqualBytes,
  hashBytesWithSecret,
  hexToBytes,
  randomInt,
} from './crypto.js';
import { getCookieValue, jsonResponse, SESSION_COOKIE_NAME } from './http.js';

export const AVATAR_COLORS = Object.freeze([
  '#1D1D1F',
  '#0066CC',
  '#2F5D50',
  '#6B4C3B',
  '#4A4E69',
  '#52525B',
]);

export const AVATAR_COLOR_SET = new Set(AVATAR_COLORS);
export const AVATAR_DATA_REGEX = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
export const MAX_AVATAR_DATA_LENGTH = 36_000;
export const ITEM_ID_REGEX = /^[A-Za-z0-9_-]{3,64}$/;

const SESSION_TOKEN_REGEX = /^[0-9a-f]{64}$/;
const EMAIL_REGEX =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
const CONTROL_CHARS_REGEX = /[\x00-\x1F\x7F]/;

/**
 * 校验 D1 数据库绑定是否可用。
 * @param {Record<string, any>} env
 * @returns {{ ok: true } | { ok: false, response: Response }}
 */
export function requireDb(env) {
  if (!env?.DB || typeof env.DB.prepare !== 'function') {
    console.error(JSON.stringify({ message: 'D1 binding DB is not configured' }));
    return {
      ok: false,
      response: jsonResponse({ error: '数据库服务尚未就绪' }, 503),
    };
  }
  return { ok: true };
}

/**
 * 规范化并严格校验邮箱地址格式。
 * @param {unknown} raw
 * @returns {string | null}
 */
export function normalizeAndValidateEmail(raw) {
  if (typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  if (email.length < 5 || email.length > 254) return null;
  if (!EMAIL_REGEX.test(email)) return null;

  const atIndex = email.indexOf('@');
  if (atIndex <= 0) return null;
  const localPart = email.slice(0, atIndex);
  if (
    localPart.length > 64 ||
    localPart.startsWith('.') ||
    localPart.endsWith('.') ||
    localPart.includes('..')
  ) {
    return null;
  }
  return email;
}

/**
 * 为新注册用户生成初始用户名（优先使用传入值，否则取邮箱 @ 前缀清洗后的前 16 个字符）。
 * @param {string} email
 * @param {unknown} preferredUsername
 * @returns {{ ok: true, username: string } | { ok: false, error: string }}
 */
export function resolveInitialUsername(email, preferredUsername) {
  if (preferredUsername !== undefined && preferredUsername !== null) {
    if (typeof preferredUsername !== 'string') {
      return { ok: false, error: '用户名格式不合法' };
    }
    const trimmed = preferredUsername.trim();
    if (trimmed.length > 0) {
      if (CONTROL_CHARS_REGEX.test(trimmed)) {
        return { ok: false, error: '用户名不能包含控制字符' };
      }
      if (trimmed.length < 1 || trimmed.length > 24) {
        return { ok: false, error: '用户名长度需在 1~24 个字符之间' };
      }
      return { ok: true, username: trimmed };
    }
  }

  const localPart = (email.split('@')[0] || '')
    .replace(/[\x00-\x1F\x7F<>'"\\`]/g, '')
    .trim();
  const sliced = Array.from(localPart).slice(0, 16).join('').trim();
  return { ok: true, username: sliced || 'RadarUser' };
}

/**
 * 从极简色板中无偏随机挑选默认头像背景色。
 * @returns {string}
 */
export function pickRandomAvatarColor() {
  return AVATAR_COLORS[randomInt(AVATAR_COLORS.length)];
}

/**
 * 判定指定邮箱是否为站主管理员。
 * @param {string} email
 * @param {Record<string, unknown>} env
 * @returns {boolean}
 */
export function isAdminEmail(email, env) {
  const adminEmail = String(env?.ADMIN_EMAIL || '').trim().toLowerCase();
  if (!adminEmail || typeof email !== 'string') return false;
  return email.trim().toLowerCase() === adminEmail;
}

/**
 * 统计用户的未读私信数量：
 * - 站主统计全站 `sender_role = 'user' AND read_by_admin = 0`
 * - 普通用户统计本人会话中 `sender_role = 'admin' AND read_by_user = 0`
 *
 * @param {Record<string, any>} env
 * @param {string} userId
 * @param {boolean} isAdmin
 * @returns {Promise<number>}
 */
export async function countUnreadMessages(env, userId, isAdmin) {
  if (isAdmin) {
    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS cnt FROM messages WHERE sender_role = 'user' AND read_by_admin = 0",
    ).first();
    return Number(row?.cnt || 0);
  }

  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS cnt FROM messages WHERE user_id = ? AND sender_role = 'admin' AND read_by_user = 0",
  )
    .bind(userId)
    .first();
  return Number(row?.cnt || 0);
}

/**
 * 构造统一的前端用户视图对象。
 * @param {Record<string, any>} env
 * @param {{ id: string, email: string, username: string, avatar_data: string | null, avatar_color: string }} userRow
 * @returns {Promise<{ id: string, email: string, username: string, avatar_data: string | null, avatar_color: string, is_admin: boolean, unread_messages: number }>}
 */
export async function buildUserPayload(env, userRow) {
  const isAdmin = isAdminEmail(userRow.email, env);
  const unreadMessages = await countUnreadMessages(env, userRow.id, isAdmin);
  return {
    id: userRow.id,
    email: userRow.email,
    username: userRow.username,
    avatar_data: userRow.avatar_data ?? null,
    avatar_color: userRow.avatar_color || '#1D1D1F',
    is_admin: isAdmin,
    unread_messages: unreadMessages,
  };
}

/**
 * 解析并校验请求 Cookie 中的 `radar_session` 会话（哈希查库 + 恒定时间字节比对 + 过期核验）。
 * @param {Request} request
 * @param {Record<string, any>} env
 * @returns {Promise<{ userRow: { id: string, email: string, username: string, avatar_data: string | null, avatar_color: string } | null, tokenHash: string | null, hadCookie: boolean }>}
 */
export async function resolveSessionUser(request, env) {
  const rawToken = getCookieValue(request, SESSION_COOKIE_NAME);
  if (!rawToken) {
    return { userRow: null, tokenHash: null, hadCookie: false };
  }

  if (!SESSION_TOKEN_REGEX.test(rawToken)) {
    return { userRow: null, tokenHash: null, hadCookie: true };
  }

  const hasSecret = typeof env?.SESSION_SECRET === 'string' && env.SESSION_SECRET.trim().length > 0;
  if (!env?.DB || typeof env.DB.prepare !== 'function' || !hasSecret) {
    return { userRow: null, tokenHash: null, hadCookie: true };
  }

  const computedBytes = await hashBytesWithSecret(env, 'session', rawToken);
  const computedHex = bytesToHex(computedBytes);

  const row = await env.DB.prepare(
    `SELECT
       s.token_hash,
       s.expires_at,
       u.id,
       u.email,
       u.username,
       u.avatar_data,
       u.avatar_color
     FROM sessions s
     INNER JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?
     LIMIT 1`,
  )
    .bind(computedHex)
    .first();

  if (!row) {
    return { userRow: null, tokenHash: computedHex, hadCookie: true };
  }

  const storedBytes = hexToBytes(row.token_hash);
  if (!constantTimeEqualBytes(computedBytes, storedBytes)) {
    return { userRow: null, tokenHash: null, hadCookie: true };
  }

  const nowIso = new Date().toISOString();
  if (typeof row.expires_at !== 'string' || row.expires_at <= nowIso) {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(row.token_hash).run();
    return { userRow: null, tokenHash: row.token_hash, hadCookie: true };
  }

  return {
    userRow: {
      id: row.id,
      email: row.email,
      username: row.username,
      avatar_data: row.avatar_data ?? null,
      avatar_color: row.avatar_color || '#1D1D1F',
    },
    tokenHash: row.token_hash,
    hadCookie: true,
  };
}

/**
 * 强制要求已登录用户（未登录返回 401）。
 * @param {Request} request
 * @param {Record<string, any>} env
 * @returns {Promise<{ ok: true, userRow: { id: string, email: string, username: string, avatar_data: string | null, avatar_color: string } } | { ok: false, response: Response }>}
 */
export async function requireAuth(request, env) {
  const dbCheck = requireDb(env);
  if (!dbCheck.ok) return dbCheck;

  const { userRow } = await resolveSessionUser(request, env);
  if (!userRow) {
    return {
      ok: false,
      response: jsonResponse({ error: '请先登录账号' }, 401),
    };
  }
  return { ok: true, userRow };
}

/**
 * 强制要求站主管理员权限（未登录返回 401，非站主返回 403）。
 * @param {Request} request
 * @param {Record<string, any>} env
 * @returns {Promise<{ ok: true, userRow: { id: string, email: string, username: string, avatar_data: string | null, avatar_color: string } } | { ok: false, response: Response }>}
 */
export async function requireAdmin(request, env) {
  const auth = await requireAuth(request, env);
  if (!auth.ok) return auth;

  if (!isAdminEmail(auth.userRow.email, env)) {
    return {
      ok: false,
      response: jsonResponse({ error: '无权访问站主管理接口' }, 403),
    };
  }
  return auth;
}

/**
 * 校验个人资料更新字段（username / avatar_data / avatar_color）。
 * @param {Record<string, unknown>} body
 * @param {{ username: string, avatar_data: string | null, avatar_color: string }} currentUser
 * @returns {{ ok: true, changed: boolean, username: string, avatar_data: string | null, avatar_color: string } | { ok: false, error: string }}
 */
export function validateProfilePatch(body, currentUser) {
  let nextUsername = currentUser.username;
  let nextAvatarData = currentUser.avatar_data ?? null;
  let nextAvatarColor = currentUser.avatar_color || '#1D1D1F';
  let changed = false;

  if (Object.prototype.hasOwnProperty.call(body, 'username') && body.username !== undefined) {
    if (typeof body.username !== 'string') {
      return { ok: false, error: '用户名必须为字符串' };
    }
    if (CONTROL_CHARS_REGEX.test(body.username)) {
      return { ok: false, error: '用户名包含非法控制字符' };
    }
    const trimmed = body.username.trim();
    if (trimmed.length < 1 || trimmed.length > 24) {
      return { ok: false, error: '用户名长度需在 1~24 个字符之间' };
    }
    if (trimmed !== nextUsername) {
      nextUsername = trimmed;
      changed = true;
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, 'avatar_data') && body.avatar_data !== undefined) {
    if (body.avatar_data === null || body.avatar_data === '') {
      if (nextAvatarData !== null) {
        nextAvatarData = null;
        changed = true;
      }
    } else if (typeof body.avatar_data === 'string') {
      if (
        body.avatar_data.length > MAX_AVATAR_DATA_LENGTH ||
        !AVATAR_DATA_REGEX.test(body.avatar_data)
      ) {
        return {
          ok: false,
          error: '头像仅支持 PNG/JPEG/WebP 的 Base64 Data URL，且字符串总长不超过 36000',
        };
      }
      if (body.avatar_data !== nextAvatarData) {
        nextAvatarData = body.avatar_data;
        changed = true;
      }
    } else {
      return { ok: false, error: '头像数据格式不合法' };
    }
  }

  if (
    Object.prototype.hasOwnProperty.call(body, 'avatar_color') &&
    body.avatar_color !== undefined
  ) {
    if (typeof body.avatar_color !== 'string' || !AVATAR_COLOR_SET.has(body.avatar_color)) {
      return { ok: false, error: '头像配色不在允许的极简色板白名单内' };
    }
    if (body.avatar_color !== nextAvatarColor) {
      nextAvatarColor = body.avatar_color;
      changed = true;
    }
  }

  return {
    ok: true,
    changed,
    username: nextUsername,
    avatar_data: nextAvatarData,
    avatar_color: nextAvatarColor,
  };
}
