const TURNSTILE_SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const RESEND_EMAILS_URL = 'https://api.resend.com/emails';
const DEFAULT_MAIL_FROM = '前哨 Radar <noreply@radarqs.fyi>';
const EXTERNAL_TIMEOUT_MS = 10_000;

/**
 * HTML 实体转义，防止邮件模板出现标签注入。
 * @param {string} input
 * @returns {string}
 */
function escapeHtml(input) {
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 受限读取上游错误响应片段（最多读取 maxBytes 字节后立即取消流，避免无界缓冲）。
 * @param {Response} response
 * @param {number} [maxBytes=512]
 * @returns {Promise<string>}
 */
async function readBoundedSnippet(response, maxBytes = 512) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        const take = Math.min(value.byteLength, maxBytes - total);
        chunks.push(value.subarray(0, take));
        total += take;
        if (total >= maxBytes) {
          await reader.cancel();
          break;
        }
      }
    }
  } catch {
    // ignore stream read error on error body
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

/**
 * 向 Cloudflare Turnstile Siteverify 校验人机验证令牌（严格 fail-closed）。
 * 强制核验：
 * 1. `result.success === true`
 * 2. `result.action === "login_otp"`
 * 3. `result.hostname` 属于 `env.TURNSTILE_HOSTNAMES` 白名单
 *
 * @param {{ token: unknown, remoteIp: string, env: Record<string, unknown> }} params
 * @returns {Promise<{ ok: true } | { ok: false, status: number, error: string }>}
 */
export async function verifyTurnstileToken({ token, remoteIp, env }) {
  if (typeof token !== 'string' || token.trim().length === 0 || token.length > 2048) {
    return { ok: false, status: 400, error: '请先完成人机验证' };
  }

  const secret = typeof env?.TURNSTILE_SECRET === 'string' ? env.TURNSTILE_SECRET.trim() : '';
  const allowedHostnames = new Set(
    String(env?.TURNSTILE_HOSTNAMES || '')
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  );

  if (!secret || allowedHostnames.size === 0) {
    console.error(
      JSON.stringify({
        message: 'turnstile configuration missing',
        has_secret: Boolean(secret),
        hostnames_count: allowedHostnames.size,
      }),
    );
    return { ok: false, status: 503, error: '人机验证服务未配置完成，请稍后再试' };
  }

  const form = new URLSearchParams();
  form.set('secret', secret);
  form.set('response', token.trim());
  if (remoteIp && remoteIp !== 'unknown') {
    form.set('remoteip', remoteIp);
  }
  form.set('idempotency_key', crypto.randomUUID());

  let result;
  try {
    const response = await fetch(TURNSTILE_SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
      signal: AbortSignal.timeout(EXTERNAL_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`siteverify HTTP ${response.status}`);
    }
    result = await response.json();
  } catch (err) {
    console.error(
      JSON.stringify({
        message: 'turnstile siteverify request failed',
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    return { ok: false, status: 403, error: '人机验证校验失败，请刷新重试' };
  }

  const returnedHostname = typeof result?.hostname === 'string' ? result.hostname.toLowerCase() : '';
  if (
    !result ||
    result.success !== true ||
    result.action !== 'login_otp' ||
    !returnedHostname ||
    !allowedHostnames.has(returnedHostname)
  ) {
    console.warn(
      JSON.stringify({
        message: 'turnstile verification rejected',
        success: Boolean(result?.success),
        action: result?.action ?? null,
        hostname: returnedHostname || null,
        error_codes: Array.isArray(result?.['error-codes']) ? result['error-codes'] : [],
      }),
    );
    return { ok: false, status: 403, error: '人机验证未通过，请重新验证' };
  }

  return { ok: true };
}

/**
 * 调用 Resend API 发送简洁中英文对照的 6 位登录验证码邮件（同时附带 html 与纯文本 text）。
 * @param {{ env: Record<string, unknown>, toEmail: string, code: string }} params
 * @returns {Promise<{ ok: true } | { ok: false, status: number, error: string }>}
 */
export async function sendOtpEmail({ env, toEmail, code }) {
  const apiKey = typeof env?.RESEND_API_KEY === 'string' ? env.RESEND_API_KEY.trim() : '';
  if (!apiKey) {
    console.error(JSON.stringify({ message: 'missing RESEND_API_KEY secret' }));
    return { ok: false, status: 503, error: '邮件服务尚未配置完成，请稍后再试' };
  }

  const mailFrom =
    typeof env?.MAIL_FROM === 'string' && env.MAIL_FROM.trim()
      ? env.MAIL_FROM.trim()
      : DEFAULT_MAIL_FROM;

  const safeCode = escapeHtml(code);

  const text = [
    '【前哨 Radar】登录验证码 / Login Verification Code',
    '',
    `您的验证码为 / Your verification code is: ${code}`,
    '',
    '该验证码将在 10 分钟后失效，请勿向他人泄露。如非本人操作，请直接忽略本邮件。',
    'This code expires in 10 minutes. Do not share it with anyone. If you did not request this email, you can safely ignore it.',
    '',
    '— 前哨 Radar (https://radarqs.fyi)',
  ].join('\n');

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:24px;background-color:#F5F5F7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'PingFang SC','Microsoft YaHei',sans-serif;color:#1D1D1F;">
  <div style="max-width:480px;margin:0 auto;background:#FFFFFF;border:1px solid #E5E5EA;padding:32px;">
    <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#6E6E73;margin-bottom:12px;">前哨 RADAR · SECURITY</div>
    <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#1D1D1F;">邮箱登录验证码 / Verification Code</h1>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#3A3A3C;">
      您正在登录《前哨 Radar》，请在验证窗口输入以下 6 位数字验证码：<br>
      <span style="color:#6E6E73;">Enter the 6-digit code below to sign in to Radar:</span>
    </p>
    <div style="margin:20px 0;padding:16px;background:#F5F5F7;border-top:1px solid #D2D2D7;border-bottom:1px solid #D2D2D7;text-align:center;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:28px;font-weight:700;letter-spacing:0.25em;color:#1D1D1F;">
      ${safeCode}
    </div>
    <p style="margin:0;font-size:12px;line-height:1.6;color:#6E6E73;">
      验证码有效期为 10 分钟，单次有效。如非本人操作，请忽略此邮件。<br>
      Valid for 10 minutes (one-time use). Ignore this message if you did not request it.
    </p>
  </div>
</body>
</html>`;

  try {
    const response = await fetch(RESEND_EMAILS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: mailFrom,
        to: [toEmail],
        subject: `【前哨 Radar】验证码 ${code} / Verification Code`,
        text,
        html,
      }),
      signal: AbortSignal.timeout(EXTERNAL_TIMEOUT_MS),
    });

    if (!response.ok) {
      const errSnippet = await readBoundedSnippet(response, 300);
      console.error(
        JSON.stringify({
          message: 'resend otp email failed',
          status: response.status,
          detail: errSnippet,
        }),
      );
      return { ok: false, status: 502, error: '验证码邮件发送失败，请稍后重试' };
    }

    return { ok: true };
  } catch (err) {
    console.error(
      JSON.stringify({
        message: 'resend otp email network error',
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    return { ok: false, status: 502, error: '验证码邮件发送超时，请稍后重试' };
  }
}

/**
 * 异步向站主邮箱发送新私信提醒（供 `ctx.waitUntil()` 调用，内部吞并异常并记录结构化日志）。
 * @param {{ env: Record<string, unknown>, sender: { id: string, username: string, email: string }, message: { body: string, created_at: string } }} params
 * @returns {Promise<void>}
 */
export async function sendAdminMessageNotification({ env, sender, message }) {
  try {
    const apiKey = typeof env?.RESEND_API_KEY === 'string' ? env.RESEND_API_KEY.trim() : '';
    const adminEmail = typeof env?.ADMIN_EMAIL === 'string' ? env.ADMIN_EMAIL.trim() : '';
    if (!apiKey || !adminEmail) {
      return;
    }

    const mailFrom =
      typeof env?.MAIL_FROM === 'string' && env.MAIL_FROM.trim()
        ? env.MAIL_FROM.trim()
        : DEFAULT_MAIL_FROM;

    const preview = message.body.length > 300 ? `${message.body.slice(0, 300)}...` : message.body;
    const safeUsername = escapeHtml(sender.username);
    const safeEmail = escapeHtml(sender.email);
    const safePreview = escapeHtml(preview).replace(/\n/g, '<br>');

    const text = [
      `【前哨 Radar】收到来自 ${sender.username} (${sender.email}) 的新私信`,
      `时间：${message.created_at}`,
      '',
      preview,
      '',
      '请登录 https://radarqs.fyi 查看并回复完整对话。',
    ].join('\n');

    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:24px;background-color:#F5F5F7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'PingFang SC',sans-serif;color:#1D1D1F;">
  <div style="max-width:520px;margin:0 auto;background:#FFFFFF;border:1px solid #E5E5EA;padding:28px;">
    <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#6E6E73;margin-bottom:8px;">前哨 RADAR · INBOX</div>
    <h2 style="margin:0 0 12px;font-size:18px;font-weight:600;color:#1D1D1F;">收到新私信：${safeUsername}</h2>
    <div style="font-size:12px;color:#6E6E73;margin-bottom:16px;">发件账号：${safeEmail} · ${escapeHtml(message.created_at)}</div>
    <div style="padding:14px 16px;background:#F5F5F7;border-left:2px solid #1D1D1F;font-size:14px;line-height:1.6;color:#1D1D1F;">
      ${safePreview}
    </div>
    <p style="margin:18px 0 0;font-size:12px;color:#6E6E73;">
      前往 <a href="https://radarqs.fyi" style="color:#0066CC;text-decoration:none;">radarqs.fyi</a> 站主私信台直接回复。
    </p>
  </div>
</body>
</html>`;

    const response = await fetch(RESEND_EMAILS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: mailFrom,
        to: [adminEmail],
        subject: `【前哨 Radar】新私信：${sender.username}`,
        text,
        html,
      }),
      signal: AbortSignal.timeout(EXTERNAL_TIMEOUT_MS),
    });

    if (!response.ok) {
      const detail = await readBoundedSnippet(response, 200);
      console.error(
        JSON.stringify({
          message: 'resend admin notification failed',
          status: response.status,
          detail,
        }),
      );
    }
  } catch (err) {
    console.error(
      JSON.stringify({
        message: 'admin notification exception',
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}
