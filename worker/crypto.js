const TEXT_ENCODER = new TextEncoder();
const UINT32_RANGE = 0x100000000; // 2^32

export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
  }
}

/**
 * 使用拒绝采样（Rejection Sampling）从 Web Crypto CSPRNG 生成 [0, maxExclusive) 均匀分布随机整数，消除取模偏差。
 * @param {number} maxExclusive
 * @returns {number}
 */
export function randomInt(maxExclusive) {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > UINT32_RANGE) {
    throw new RangeError('maxExclusive must be an integer in (0, 2^32]');
  }
  const maxUnbiased = Math.floor(UINT32_RANGE / maxExclusive) * maxExclusive;
  const buf = new Uint32Array(1);
  while (true) {
    crypto.getRandomValues(buf);
    const candidate = buf[0];
    if (candidate < maxUnbiased) {
      return candidate % maxExclusive;
    }
  }
}

/**
 * 生成无偏 6 位数字验证码（000000 ~ 999999）。
 * @returns {string}
 */
export function generateOtpCode() {
  return randomInt(1_000_000).toString().padStart(6, '0');
}

/**
 * 生成 32 字节高熵随机 Session Token（编码为 64 位小写十六进制字符串）。
 * @returns {string}
 */
export function generateSessionToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

/**
 * 字节数组转小写十六进制字符串。
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function bytesToHex(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

/**
 * 十六进制字符串转 Uint8Array；格式非法时返回 null。
 * @param {string} hex
 * @returns {Uint8Array | null}
 */
export function hexToBytes(hex) {
  if (typeof hex !== 'string' || hex.length === 0 || hex.length % 2 !== 0) {
    return null;
  }
  if (!/^[0-9a-fA-F]+$/.test(hex)) {
    return null;
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/**
 * 读取并校验服务端 SESSION_SECRET（fail-closed）。
 * @param {Record<string, unknown>} env
 * @returns {string}
 */
export function requireSessionSecret(env) {
  const secret = typeof env?.SESSION_SECRET === 'string' ? env.SESSION_SECRET.trim() : '';
  if (!secret) {
    throw new ConfigError('Missing required secret: SESSION_SECRET');
  }
  return secret;
}

/**
 * 使用 Web Crypto SHA-256 计算摘要字节（结合 SESSION_SECRET 与用途域隔离）。
 * @param {Record<string, unknown>} env
 * @param {'otp' | 'session' | 'ip'} namespace
 * @param {string} value
 * @returns {Promise<Uint8Array>}
 */
export async function hashBytesWithSecret(env, namespace, value) {
  const secret = requireSessionSecret(env);
  const payload = `${secret}:${namespace}:${value}`;
  const digest = await crypto.subtle.digest('SHA-256', TEXT_ENCODER.encode(payload));
  return new Uint8Array(digest);
}

/**
 * 使用 Web Crypto SHA-256 计算摘要十六进制字符串。
 * @param {Record<string, unknown>} env
 * @param {'otp' | 'session' | 'ip'} namespace
 * @param {string} value
 * @returns {Promise<string>}
 */
export async function hashHexWithSecret(env, namespace, value) {
  const bytes = await hashBytesWithSecret(env, namespace, value);
  return bytesToHex(bytes);
}

/**
 * 恒定时间字节数组比对：优先调用 Workers 原生 crypto.subtle.timingSafeEqual，并提供定长异或兜底。
 * @param {Uint8Array | null} a
 * @param {Uint8Array | null} b
 * @returns {boolean}
 */
export function constantTimeEqualBytes(a, b) {
  if (!(a instanceof Uint8Array) || !(b instanceof Uint8Array)) {
    return false;
  }
  if (a.byteLength === 0 || a.byteLength !== b.byteLength) {
    return false;
  }
  if (typeof crypto?.subtle?.timingSafeEqual === 'function') {
    return crypto.subtle.timingSafeEqual(a, b);
  }
  let diff = 0;
  for (let i = 0; i < a.byteLength; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}
