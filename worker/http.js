export const SESSION_COOKIE_NAME = 'radar_session';
export const SESSION_MAX_AGE_SECONDS = 2_592_000; // 30 天

const DEFAULT_MAX_BODY_BYTES = 65_536; // 64 KB，足以容纳 36KB base64 头像且防止大包内存耗尽
const PROD_PRIMARY_ORIGIN = 'https://radarqs.fyi';

/**
 * 统一构造带 `Cache-Control: no-store` 与标准 UTF-8 JSON 头的 API 响应。
 * @param {unknown} payload
 * @param {number} [status=200]
 * @param {HeadersInit} [extraHeaders={}]
 * @returns {Response}
 */
export function jsonResponse(payload, status = 200, extraHeaders = {}) {
  const headers = new Headers(extraHeaders);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(JSON.stringify(payload), { status, headers });
}

/**
 * 统一构造 429 限频响应（同时设置 JSON retry_after 字段与 HTTP Retry-After 响应头）。
 * @param {string} message
 * @param {number} retryAfterSeconds
 * @returns {Response}
 */
export function rateLimitResponse(message, retryAfterSeconds) {
  const retryAfter = Math.max(1, Math.ceil(retryAfterSeconds));
  return jsonResponse(
    { error: message, retry_after: retryAfter },
    429,
    { 'Retry-After': String(retryAfter) },
  );
}

/**
 * 判断主机名是否为本地环回地址。
 * @param {string} hostname
 * @returns {boolean}
 */
export function isLocalhostHost(hostname) {
  const h = (hostname || '').toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
}

/**
 * 校验状态变更请求（POST/PATCH/PUT/DELETE）的 Origin 头，防御跨站请求伪造（CSRF）。
 * 允许 `https://radarqs.fyi`（及 TURNSTILE_HOSTNAMES 中配置的非本地正式域名 HTTPS 来源）与本地 `localhost`/`127.0.0.1`。
 * @param {Request} request
 * @param {Record<string, unknown>} env
 * @returns {{ ok: true } | { ok: false, response: Response }}
 */
export function verifyOrigin(request, env) {
  const originHeader = request.headers.get('Origin');
  if (!originHeader || originHeader === 'null') {
    return {
      ok: false,
      response: jsonResponse({ error: '缺少或非法的请求来源 (Origin)' }, 403),
    };
  }

  let originUrl;
  try {
    originUrl = new URL(originHeader);
  } catch {
    return {
      ok: false,
      response: jsonResponse({ error: '非法的请求来源格式 (Origin)' }, 403),
    };
  }

  if (originUrl.origin === PROD_PRIMARY_ORIGIN) {
    return { ok: true };
  }

  const host = originUrl.hostname.toLowerCase();
  if (
    (originUrl.protocol === 'http:' || originUrl.protocol === 'https:') &&
    (host === 'localhost' || host === '127.0.0.1')
  ) {
    return { ok: true };
  }

  const configuredHosts = String(env?.TURNSTILE_HOSTNAMES || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s && !isLocalhostHost(s));

  if (
    originUrl.protocol === 'https:' &&
    originUrl.port === '' &&
    configuredHosts.includes(host)
  ) {
    return { ok: true };
  }

  return {
    ok: false,
    response: jsonResponse({ error: '请求来源未在白名单内 (Origin)' }, 403),
  };
}

/**
 * 安全流式读取并解析 JSON 请求体（强制要求 Content-Type: application/json 并限制最大字节数）。
 * @param {Request} request
 * @param {{ allowEmpty?: boolean, maxBytes?: number }} [options]
 * @returns {Promise<{ ok: true, data: Record<string, any> } | { ok: false, response: Response }>}
 */
export async function readJsonBody(request, options = {}) {
  const { allowEmpty = false, maxBytes = DEFAULT_MAX_BODY_BYTES } = options;

  const contentTypeRaw = request.headers.get('Content-Type') || '';
  const mediaType = contentTypeRaw.split(';')[0].trim().toLowerCase();
  const isJsonContentType = mediaType === 'application/json';

  // 非空载荷接口强制要求 application/json；无参变更接口（logout / PUT|DELETE bookmark）允许无 body 的纯 fetch，但严禁表单类 Content-Type
  if (mediaType && !isJsonContentType) {
    return {
      ok: false,
      response: jsonResponse({ error: '请求必须使用 application/json 格式' }, 415),
    };
  }
  if (!isJsonContentType && !allowEmpty) {
    return {
      ok: false,
      response: jsonResponse({ error: '请求必须使用 application/json 格式' }, 415),
    };
  }

  const contentLengthHeader = request.headers.get('Content-Length');
  if (contentLengthHeader !== null) {
    const declaredLength = Number.parseInt(contentLengthHeader, 10);
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      return {
        ok: false,
        response: jsonResponse({ error: '请求体超出最大体积限制' }, 413),
      };
    }
  }

  let rawText = '';
  if (request.body) {
    const reader = request.body.getReader();
    const chunks = [];
    let totalBytes = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          totalBytes += value.byteLength;
          if (totalBytes > maxBytes) {
            await reader.cancel();
            return {
              ok: false,
              response: jsonResponse({ error: '请求体超出最大体积限制' }, 413),
            };
          }
          chunks.push(value);
        }
      }
    } catch {
      return {
        ok: false,
        response: jsonResponse({ error: '读取请求体失败' }, 400),
      };
    }

    const merged = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }

    try {
      rawText = new TextDecoder('utf-8', { fatal: true }).decode(merged);
    } catch {
      return {
        ok: false,
        response: jsonResponse({ error: '请求体编码必须为有效 UTF-8' }, 400),
      };
    }
  }

  const trimmed = rawText.trim();
  if (!trimmed) {
    if (allowEmpty) {
      return { ok: true, data: {} };
    }
    return {
      ok: false,
      response: jsonResponse({ error: '请求体不能为空，需提供 JSON 对象' }, 400),
    };
  }

  if (!isJsonContentType) {
    return {
      ok: false,
      response: jsonResponse({ error: '携带请求体时必须指定 Content-Type: application/json' }, 415),
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return {
      ok: false,
      response: jsonResponse({ error: '请求体不是合法的 JSON' }, 400),
    };
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      ok: false,
      response: jsonResponse({ error: '请求体必须为 JSON 对象' }, 400),
    };
  }

  return { ok: true, data: parsed };
}

/**
 * 解析请求头中的指定 Cookie 值。
 * @param {Request} request
 * @param {string} cookieName
 * @returns {string | null}
 */
export function getCookieValue(request, cookieName) {
  const header = request.headers.get('Cookie');
  if (!header) return null;

  const parts = header.split(';');
  for (const part of parts) {
    const eqIndex = part.indexOf('=');
    if (eqIndex === -1) continue;
    const key = part.slice(0, eqIndex).trim();
    if (key === cookieName) {
      return part.slice(eqIndex + 1).trim();
    }
  }
  return null;
}

/**
 * 判断当前请求响应是否应附带 Cookie `Secure` 属性（仅非 localhost 的 HTTPS 响应附加）。
 * @param {Request} request
 * @returns {boolean}
 */
function shouldUseSecureCookie(request) {
  try {
    const url = new URL(request.url);
    return url.protocol === 'https:' && !isLocalhostHost(url.hostname);
  } catch {
    return true;
  }
}

/**
 * 构造登录态 Set-Cookie 字符串。
 * @param {string} token
 * @param {Request} request
 * @returns {string}
 */
export function buildSessionCookie(token, request) {
  const base = `${SESSION_COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}`;
  return shouldUseSecureCookie(request) ? `${base}; Secure` : base;
}

/**
 * 构造清除登录态的 Set-Cookie 字符串。
 * @param {Request} request
 * @returns {string}
 */
export function buildClearSessionCookie(request) {
  const base = `${SESSION_COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
  return shouldUseSecureCookie(request) ? `${base}; Secure` : base;
}

/**
 * 获取可信客户端 IP（仅读取 Cloudflare 边缘注入的 CF-Connecting-IP，绝不信任客户端可伪造的 X-Forwarded-For）。
 * @param {Request} request
 * @returns {string}
 */
export function getClientIp(request) {
  const cfIp = request.headers.get('CF-Connecting-IP');
  if (cfIp && cfIp.trim()) {
    return cfIp.trim();
  }
  try {
    const url = new URL(request.url);
    if (isLocalhostHost(url.hostname)) {
      return '127.0.0.1';
    }
  } catch {
    // ignore URL parse error
  }
  return 'unknown';
}
