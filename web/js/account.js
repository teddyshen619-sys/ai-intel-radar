/**
 * 前哨 Radar — 账号、个人资料、云端收藏同步与站内私信模块
 * Pure ES6 Module · Zero build step · Strict textContent / DOM API (XSS-safe) · Zero Emojis
 * Turnstile script is loaded ONLY on demand when login modal opens AND /api/config provides non-empty turnstile_site_key.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
const TURNSTILE_SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const STATIC_ENV_NOTICE = '账号功能需在线上站点或 Workers 环境下使用';
const MAX_AVATAR_DATA_URL_LENGTH = 32000;
const AVATAR_DIMENSION = 128;

export const AVATAR_PALETTE = Object.freeze([
  { hex: '#1D1D1F', label: '石墨黑' },
  { hex: '#0066CC', label: '前哨蓝' },
  { hex: '#2F5D50', label: '松石绿' },
  { hex: '#6B4C3B', label: '胡桃棕' },
  { hex: '#4A4E69', label: '岩灰紫' },
  { hex: '#52525B', label: '铅锡灰' },
]);

const DEFAULT_AVATAR_COLOR = '#1D1D1F';
const AVATAR_COLOR_ALLOWLIST = new Set(AVATAR_PALETTE.map((item) => item.hex));
const VALID_ITEM_ID_RE = /^[A-Za-z0-9_-]{3,64}$/;
const BOOKMARK_SYNC_LIMIT = 200;
const MSG_MAX_LENGTH = 1000;

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = String(text);
  return node;
}

function createIcon(kind, className = 'account-svg-icon') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.65');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', className);

  const add = (tag, attrs) => {
    const shape = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) {
      shape.setAttribute(k, v);
    }
    svg.appendChild(shape);
  };

  switch (kind) {
    case 'user':
      add('circle', { cx: '12', cy: '8.25', r: '3.6' });
      add('path', { d: 'M5.2 19.5c1.35-3.1 3.85-4.7 6.8-4.7s5.45 1.6 6.8 4.7' });
      break;
    case 'close':
      add('line', { x1: '18', y1: '6', x2: '6', y2: '18' });
      add('line', { x1: '6', y1: '6', x2: '18', y2: '18' });
      break;
    case 'back':
      add('line', { x1: '19', y1: '12', x2: '5', y2: '12' });
      add('polyline', { points: '11 18 5 12 11 6' });
      break;
    case 'upload':
      add('line', { x1: '12', y1: '15', x2: '12', y2: '4' });
      add('polyline', { points: '7.5 8.5 12 4 16.5 8.5' });
      add('line', { x1: '4.5', y1: '19.5', x2: '19.5', y2: '19.5' });
      break;
    case 'check':
      add('polyline', { points: '20 6 9 17 4 12' });
      break;
    default:
      add('circle', { cx: '12', cy: '12', r: '8' });
      break;
  }

  return svg;
}

export function sanitizeAvatarColor(raw) {
  const upper = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  if (AVATAR_COLOR_ALLOWLIST.has(upper)) {
    return upper;
  }
  return DEFAULT_AVATAR_COLOR;
}

export function sanitizeAvatarData(raw) {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.trim();
  if (!cleaned || cleaned.length > 36000) return null;
  if (!/^data:image\/(?:webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(cleaned)) {
    return null;
  }
  return cleaned;
}

/**
 * Compute clean avatar initials:
 * - CJK (Chinese/Japanese/Korean) leading letter -> first character (e.g. "陈")
 * - English / alphanumeric -> first 1~2 uppercase characters (e.g. "AL")
 */
export function getAvatarInitials(username, email = '') {
  const fallbackPrefix = String(email ?? '').split('@')[0]?.trim() || '';
  const raw = String(username ?? '').trim() || fallbackPrefix;
  if (!raw) return 'R';

  const chars = Array.from(raw);
  const firstIdx = chars.findIndex((ch) => /[\p{L}\p{N}]/u.test(ch));
  const slice = firstIdx >= 0 ? chars.slice(firstIdx) : chars;
  const first = slice[0] || '';
  if (!first) return 'R';

  if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(first)) {
    return first;
  }

  if (/^[A-Za-z0-9]$/.test(first)) {
    const second = slice[1] && /^[A-Za-z0-9]$/.test(slice[1]) ? slice[1] : '';
    return (first + second).toUpperCase();
  }

  return first.toUpperCase();
}

function normalizeUser(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const email = String(raw.email ?? '').trim();
  const emailPrefix = email.split('@')[0]?.trim() || '用户';
  const username = String(raw.username ?? '').trim() || emailPrefix;
  return {
    id: raw.id,
    email,
    username,
    avatar_data: sanitizeAvatarData(raw.avatar_data),
    avatar_color: sanitizeAvatarColor(raw.avatar_color),
    is_admin: Boolean(raw.is_admin === true || raw.is_admin === 1),
    unread_messages: Math.max(0, Math.floor(Number(raw.unread_messages) || 0)),
  };
}

function renderAvatarSurface(container, { avatarData, avatarColor, username, email }) {
  container.replaceChildren();
  const safeData = sanitizeAvatarData(avatarData);
  const safeColor = sanitizeAvatarColor(avatarColor);
  if (safeData) {
    container.style.backgroundColor = '';
    container.dataset.mode = 'image';
    const img = document.createElement('img');
    img.className = 'account-avatar-img';
    img.alt = '';
    img.decoding = 'async';
    img.src = safeData;
    container.appendChild(img);
  } else {
    container.style.backgroundColor = safeColor;
    container.dataset.mode = 'initials';
    const span = el('span', 'account-avatar-initials', getAvatarInitials(username, email));
    container.appendChild(span);
  }
}

function parseTimestampMs(raw) {
  if (raw == null || raw === '') return 0;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw < 1e12 ? raw * 1000 : raw;
  }
  const str = String(raw).trim();
  if (!str) return 0;
  if (/^\d+$/.test(str)) {
    const num = Number(str);
    return num < 1e12 ? num * 1000 : num;
  }
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(str)) {
    const utc = Date.parse(str.replace(' ', 'T') + 'Z');
    if (Number.isFinite(utc)) return utc;
  }
  const parsed = Date.parse(str);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMessageTime(raw) {
  const ms = parseTimestampMs(raw);
  if (!ms) return typeof raw === 'string' ? raw.trim() : '';
  const date = new Date(ms);
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const hhmm = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  if (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  ) {
    return `今日 ${hhmm}`;
  }
  if (date.getFullYear() === now.getFullYear()) {
    return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${hhmm}`;
  }
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${hhmm}`;
}

function isMessageFromAdmin(msg, { currentUser, threadUserId = null } = {}) {
  if (!msg || typeof msg !== 'object') return false;
  if (typeof msg.from_admin === 'boolean') return msg.from_admin;
  if (typeof msg.from_admin === 'number') return msg.from_admin === 1;
  if (typeof msg.is_from_admin === 'boolean') return msg.is_from_admin;
  if (typeof msg.is_from_admin === 'number') return msg.is_from_admin === 1;
  if (typeof msg.sender_is_admin === 'boolean') return msg.sender_is_admin;
  if (typeof msg.sender_is_admin === 'number') return msg.sender_is_admin === 1;

  const role = String(msg.sender_role ?? msg.role ?? (typeof msg.sender === 'string' ? msg.sender : '') ?? '')
    .trim()
    .toLowerCase();
  if (role === 'admin' || role === 'owner' || role === 'staff') return true;
  if (role === 'user' || role === 'member') return false;

  const dir = String(msg.direction ?? '').trim().toLowerCase();
  if (dir === 'from_admin' || dir === 'admin_to_user' || dir === 'outbound_admin' || dir === 'reply') return true;
  if (dir === 'to_admin' || dir === 'user_to_admin' || dir === 'inbound_user') return false;

  if (msg.sender_id != null) {
    if (threadUserId != null) {
      return String(msg.sender_id) !== String(threadUserId);
    }
    if (currentUser && !currentUser.is_admin && currentUser.id != null) {
      return String(msg.sender_id) !== String(currentUser.id);
    }
    if (currentUser && currentUser.is_admin && currentUser.id != null) {
      return String(msg.sender_id) === String(currentUser.id);
    }
  }
  return false;
}

function normalizeMessagesList(payload, context) {
  const rawList = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.messages)
      ? payload.messages
      : Array.isArray(payload?.items)
        ? payload.items
        : [];

  return rawList
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry, idx) => {
      const createdRaw = entry.created_at ?? entry.sent_at ?? entry.timestamp ?? entry.updated_at ?? '';
      return {
        id: entry.id ?? `msg-${idx}`,
        body: String(entry.body ?? entry.content ?? entry.text ?? ''),
        fromAdmin: isMessageFromAdmin(entry, context),
        createdAt: createdRaw,
        sortMs: parseTimestampMs(createdRaw),
        orderIdx: idx,
      };
    })
    .sort((a, b) => {
      if (a.sortMs !== b.sortMs) return a.sortMs - b.sortMs;
      const numA = Number(a.id);
      const numB = Number(b.id);
      if (Number.isFinite(numA) && Number.isFinite(numB) && numA !== numB) {
        return numA - numB;
      }
      return a.orderIdx - b.orderIdx;
    });
}

function normalizeAdminThreads(payload) {
  const rawList = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.threads)
      ? payload.threads
      : Array.isArray(payload?.items)
        ? payload.items
        : [];

  return rawList
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => {
      const nestedUser = entry.user && typeof entry.user === 'object' ? entry.user : null;
      const userId = entry.user_id ?? nestedUser?.id ?? entry.id;
      const email = String(entry.email ?? nestedUser?.email ?? '').trim();
      const username =
        String(entry.username ?? nestedUser?.username ?? '').trim() ||
        email.split('@')[0]?.trim() ||
        `用户 #${userId}`;
      const rawPreview =
        entry.last_message && typeof entry.last_message === 'object'
          ? entry.last_message.body ?? entry.last_message.content ?? ''
          : entry.last_message ??
            entry.last_message_body ??
            entry.last_body ??
            entry.latest_message ??
            entry.preview ??
            entry.body ??
            '';
      const lastAt =
        entry.last_message_at ??
        entry.last_at ??
        entry.updated_at ??
        entry.created_at ??
        (entry.last_message && typeof entry.last_message === 'object' ? entry.last_message.created_at : '') ??
        '';
      const unreadCount = Math.max(
        0,
        Math.floor(Number(entry.unread_count ?? entry.unread_messages ?? entry.unread ?? 0) || 0)
      );

      return {
        userId,
        email,
        username,
        avatar_data: sanitizeAvatarData(entry.avatar_data ?? nestedUser?.avatar_data),
        avatar_color: sanitizeAvatarColor(entry.avatar_color ?? nestedUser?.avatar_color),
        lastPreview: String(rawPreview ?? '').replace(/\s+/g, ' ').trim(),
        lastAt,
        sortMs: parseTimestampMs(lastAt),
        unreadCount,
      };
    })
    .filter((item) => item.userId != null && String(item.userId) !== '');
}

/**
 * Same-origin API client with silent graceful fallback on static servers (404 / 405 / 501 / HTML).
 */
async function apiRequest(path, { method = 'GET', body = undefined } = {}) {
  if (typeof window === 'undefined' || !/^https?:$/.test(window.location.protocol)) {
    return {
      ok: false,
      status: 0,
      unavailable: true,
      data: null,
      error: STATIC_ENV_NOTICE,
    };
  }

  const upperMethod = String(method || 'GET').toUpperCase();
  const isMutating = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(upperMethod);
  const headers = { Accept: 'application/json' };
  const init = {
    method: upperMethod,
    credentials: 'same-origin',
    headers,
    cache: 'no-store',
  };

  if (body !== undefined || isMutating) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body !== undefined ? body : {});
  }

  let response;
  try {
    response = await fetch(path, init);
  } catch {
    return {
      ok: false,
      status: 0,
      unavailable: true,
      data: null,
      error: STATIC_ENV_NOTICE,
    };
  }

  if (response.status === 204) {
    return { ok: true, status: 204, unavailable: false, data: {}, error: '' };
  }

  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  const isJsonHeader = contentType.includes('application/json');
  let data = null;

  try {
    const text = await response.text();
    const trimmed = text.trim();
    if (trimmed && (isJsonHeader || trimmed.startsWith('{') || trimmed.startsWith('['))) {
      data = JSON.parse(trimmed);
    }
  } catch {
    data = null;
  }

  if (
    data === null &&
    (response.status === 404 || response.status === 405 || response.status === 501 || !isJsonHeader)
  ) {
    return {
      ok: false,
      status: response.status,
      unavailable: true,
      data: null,
      error: STATIC_ENV_NOTICE,
    };
  }

  const logicalOk = response.ok && !(data && typeof data === 'object' && data.ok === false);
  if (!logicalOk) {
    const serverMessage =
      data && typeof data === 'object'
        ? typeof data.error === 'string' && data.error.trim()
          ? data.error.trim()
          : typeof data.message === 'string' && data.message.trim()
            ? data.message.trim()
            : ''
        : '';

    const fallbackError =
      response.status === 429
        ? '操作过于频繁，请稍后再试'
        : response.status === 401
          ? '登录状态已失效，请重新登录'
          : response.status === 403
            ? '当前账号无权执行该操作'
            : `请求未成功（HTTP ${response.status}）`;

    return {
      ok: false,
      status: response.status,
      unavailable: false,
      data,
      error: serverMessage || fallbackError,
    };
  }

  return {
    ok: true,
    status: response.status,
    unavailable: false,
    data,
    error: '',
  };
}

let turnstileScriptPromise = null;

function loadTurnstileScriptOnce() {
  if (typeof window === 'undefined') return Promise.reject(new Error('No window'));
  if (window.turnstile && typeof window.turnstile.render === 'function') {
    return Promise.resolve(window.turnstile);
  }
  if (turnstileScriptPromise) return turnstileScriptPromise;

  turnstileScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${TURNSTILE_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(window.turnstile), { once: true });
      existing.addEventListener(
        'error',
        () => {
          turnstileScriptPromise = null;
          reject(new Error('Turnstile load failed'));
        },
        { once: true }
      );
      return;
    }

    const script = document.createElement('script');
    script.src = TURNSTILE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.turnstile && typeof window.turnstile.render === 'function') {
        resolve(window.turnstile);
      } else {
        turnstileScriptPromise = null;
        reject(new Error('Turnstile API unavailable'));
      }
    };
    script.onerror = () => {
      script.remove();
      turnstileScriptPromise = null;
      reject(new Error('Turnstile script blocked'));
    };
    document.head.appendChild(script);
  });

  return turnstileScriptPromise;
}

/**
 * Center-crop any local PNG/JPEG/WebP image to 128x128 square and compress below 32000 bytes.
 */
async function cropAndCompressAvatarFile(file, fallbackBgHex = '#FFFFFF') {
  if (!file || typeof file !== 'object') {
    throw new Error('请选择有效的图片文件');
  }
  const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
  const nameLower = String(file.name || '').toLowerCase();
  const extAllowed = /\.(?:png|jpe?g|webp)$/.test(nameLower);
  if (file.type && !allowedTypes.includes(file.type.toLowerCase()) && !extAllowed) {
    throw new Error('仅支持 PNG、JPG 或 WebP 格式图片');
  }
  if (file.size > 15 * 1024 * 1024) {
    throw new Error('图片体积过大，请选择 15MB 以内的图片');
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('无法解码所选图片，请更换文件重试'));
      image.src = objectUrl;
    });

    const sw = img.naturalWidth || img.width;
    const sh = img.naturalHeight || img.height;
    if (!sw || !sh) {
      throw new Error('图片尺寸无效');
    }

    const side = Math.min(sw, sh);
    const sx = Math.floor((sw - side) / 2);
    const sy = Math.floor((sh - side) / 2);

    const renderSquare = (dim) => {
      const canvas = document.createElement('canvas');
      canvas.width = dim;
      canvas.height = dim;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('当前浏览器不支持 Canvas 图像处理');
      ctx.fillStyle = sanitizeAvatarColor(fallbackBgHex);
      ctx.fillRect(0, 0, dim, dim);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx, sy, side, side, 0, 0, dim, dim);
      return canvas;
    };

    const canvas128 = renderSquare(AVATAR_DIMENSION);

    for (const quality of [0.86, 0.74, 0.62, 0.5, 0.38]) {
      const webpUrl = canvas128.toDataURL('image/webp', quality);
      if (
        webpUrl.startsWith('data:image/webp;base64,') &&
        webpUrl.length < MAX_AVATAR_DATA_URL_LENGTH
      ) {
        return webpUrl;
      }
    }

    for (const quality of [0.85, 0.72, 0.6, 0.48, 0.36]) {
      const jpegUrl = canvas128.toDataURL('image/jpeg', quality);
      if (
        jpegUrl.startsWith('data:image/jpeg;base64,') &&
        jpegUrl.length < MAX_AVATAR_DATA_URL_LENGTH
      ) {
        return jpegUrl;
      }
    }

    const canvas96 = renderSquare(96);
    const compactJpeg = canvas96.toDataURL('image/jpeg', 0.55);
    if (compactJpeg.length < MAX_AVATAR_DATA_URL_LENGTH) {
      return compactJpeg;
    }

    throw new Error('头像压缩后仍超出长度限制，请更换一张简洁图片');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function isValidEmail(email) {
  const trimmed = String(email ?? '').trim();
  return trimmed.length >= 5 && trimmed.length <= 160 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

/**
 * Initialize account controller and bind top-right circular trigger.
 */
export function initAccount({
  triggerButton,
  menuRoot,
  modalRoot,
  getLocalBookmarkIds,
  onSyncBookmarks,
  onToast,
  getTheme,
} = {}) {
  if (!triggerButton || !menuRoot || !modalRoot) {
    return null;
  }

  const notify = (msg, type = 'info') => {
    if (typeof onToast === 'function') onToast(msg, type);
  };

  let currentUser = null;
  let menuOpen = false;
  let activeModal = null; // null | 'login' | 'account'
  let activeAccountTab = 'profile'; // 'profile' | 'messages'
  let lastTriggerEl = null;

  // Auth config & OTP state
  let authConfig = {
    loaded: false,
    loading: false,
    available: true,
    enabled: true,
    turnstileSiteKey: '',
  };
  let loginStep = 'request'; // 'request' | 'verify'
  let loginEmail = '';
  let cooldownSeconds = 0;
  let cooldownTimer = null;
  let turnstileWidgetId = null;
  let turnstileToken = '';
  const cooldownCallbacks = new Set();

  // Admin inbox & messages state
  let cachedThreads = [];
  let activeThreadUserId = null;
  let adminMobilePane = 'list'; // 'list' | 'detail'

  const avatarClipEl =
    triggerButton.querySelector('[data-account-avatar-clip]') ||
    (() => {
      const clip = el('span', 'account-avatar-clip');
      clip.dataset.accountAvatarClip = '';
      triggerButton.prepend(clip);
      return clip;
    })();

  const unreadDotEl =
    triggerButton.querySelector('[data-account-unread-dot]') ||
    (() => {
      const dot = el('span', 'account-unread-dot');
      dot.dataset.accountUnreadDot = '';
      dot.hidden = true;
      triggerButton.appendChild(dot);
      return dot;
    })();

  function startCooldown(seconds) {
    const total = Math.max(1, Math.floor(Number(seconds) || 60));
    cooldownSeconds = total;
    if (cooldownTimer) clearInterval(cooldownTimer);
    const emit = () => {
      for (const fn of cooldownCallbacks) {
        try {
          fn(cooldownSeconds);
        } catch {
          // Ignore stale callback errors
        }
      }
    };
    emit();
    cooldownTimer = setInterval(() => {
      cooldownSeconds = Math.max(0, cooldownSeconds - 1);
      emit();
      if (cooldownSeconds <= 0) {
        clearInterval(cooldownTimer);
        cooldownTimer = null;
      }
    }, 1000);
  }

  function cleanupTurnstileWidget() {
    turnstileToken = '';
    if (turnstileWidgetId !== null && window.turnstile && typeof window.turnstile.remove === 'function') {
      try {
        window.turnstile.remove(turnstileWidgetId);
      } catch {
        // Ignore widget teardown errors
      }
    }
    turnstileWidgetId = null;
  }

  function resetTurnstileWidget() {
    turnstileToken = '';
    if (turnstileWidgetId !== null && window.turnstile && typeof window.turnstile.reset === 'function') {
      try {
        window.turnstile.reset(turnstileWidgetId);
      } catch {
        // Ignore reset errors
      }
    }
  }

  function syncTriggerButton() {
    if (!currentUser) {
      triggerButton.dataset.authenticated = 'false';
      delete triggerButton.dataset.darkInk;
      triggerButton.setAttribute('aria-label', '登录账号');
      triggerButton.setAttribute('aria-haspopup', 'dialog');
      triggerButton.setAttribute('aria-expanded', String(activeModal === 'login'));
      avatarClipEl.style.backgroundColor = '';
      delete avatarClipEl.dataset.mode;
      avatarClipEl.replaceChildren(createIcon('user', 'account-trigger-icon'));
      unreadDotEl.hidden = true;
      return;
    }

    triggerButton.dataset.authenticated = 'true';
    const isDarkInk =
      !currentUser.avatar_data && currentUser.avatar_color.toUpperCase() === '#1D1D1F';
    triggerButton.dataset.darkInk = isDarkInk ? 'true' : 'false';

    const unread = currentUser.unread_messages || 0;
    triggerButton.setAttribute(
      'aria-label',
      unread > 0
        ? `账号菜单（${currentUser.username}，${unread} 条未读私信）`
        : `账号菜单（${currentUser.username}）`
    );
    triggerButton.setAttribute('aria-haspopup', 'menu');
    triggerButton.setAttribute('aria-expanded', String(menuOpen));

    renderAvatarSurface(avatarClipEl, {
      avatarData: currentUser.avatar_data,
      avatarColor: currentUser.avatar_color,
      username: currentUser.username,
      email: currentUser.email,
    });
    unreadDotEl.hidden = !(unread > 0);
  }

  async function syncCloudBookmarks() {
    if (!currentUser) return;
    const localIds =
      typeof getLocalBookmarkIds === 'function'
        ? getLocalBookmarkIds()
            .filter((id) => typeof id === 'string' && VALID_ITEM_ID_RE.test(id.trim()))
            .map((id) => id.trim())
            .slice(0, BOOKMARK_SYNC_LIMIT)
        : [];

    const res = await apiRequest('/api/bookmarks/sync', {
      method: 'POST',
      body: { ids: localIds },
    });

    if (res.ok && Array.isArray(res.data?.ids) && typeof onSyncBookmarks === 'function') {
      onSyncBookmarks(res.data.ids);
    }
  }

  async function syncBookmarkChange(itemId, shouldSave) {
    if (!currentUser || !itemId) return;
    const cleanId = String(itemId).trim();
    if (!VALID_ITEM_ID_RE.test(cleanId)) return;
    const encoded = encodeURIComponent(cleanId);
    const res = await apiRequest(`/api/bookmarks/${encoded}`, {
      method: shouldSave ? 'PUT' : 'DELETE',
    });
    if (!res.ok) {
      notify('云端收藏同步暂未成功，已保留在本地', 'warning');
    }
  }

  function closeMenu() {
    if (!menuOpen) return;
    menuOpen = false;
    menuRoot.replaceChildren();
    syncTriggerButton();
  }

  function closeModal({ restoreFocus = true } = {}) {
    if (!activeModal) return;
    cleanupTurnstileWidget();
    cooldownCallbacks.clear();
    activeModal = null;
    modalRoot.replaceChildren();
    document.documentElement.classList.remove('account-modal-lock');
    syncTriggerButton();
    if (restoreFocus && lastTriggerEl && typeof lastTriggerEl.focus === 'function') {
      try {
        lastTriggerEl.focus({ preventScroll: true });
      } catch {
        // Ignore focus errors
      }
    }
  }

  async function handleLogout() {
    closeMenu();
    const res = await apiRequest('/api/auth/logout', { method: 'POST' });
    if (!res.ok && !res.unavailable && res.status !== 401) {
      notify(res.error || '退出登录失败，请重试', 'error');
      return;
    }
    currentUser = null;
    cachedThreads = [];
    activeThreadUserId = null;
    closeModal({ restoreFocus: true });
    syncTriggerButton();
    notify('已退出账号，恢复本地浏览模式', 'info');
  }

  function openMenu() {
    if (!currentUser) return;
    menuOpen = true;
    syncTriggerButton();

    const menu = el('div', 'account-dropdown');
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', '账号操作菜单');

    const identity = el('div', 'account-dropdown-identity');
    const nameRow = el('div', 'account-dropdown-name-row');
    nameRow.appendChild(el('span', 'account-dropdown-name', currentUser.username));
    if (currentUser.is_admin) {
      nameRow.appendChild(el('span', 'account-role-tag', '站主'));
    }
    identity.appendChild(nameRow);
    if (currentUser.email) {
      identity.appendChild(el('p', 'account-dropdown-email', currentUser.email));
    }

    const actions = el('div', 'account-dropdown-list');

    const profileBtn = el('button', 'account-dropdown-item');
    profileBtn.type = 'button';
    profileBtn.setAttribute('role', 'menuitem');
    profileBtn.appendChild(el('span', '', '个人资料设置'));
    profileBtn.addEventListener('click', () => {
      closeMenu();
      openAccountModal('profile', triggerButton);
    });

    const msgBtn = el('button', 'account-dropdown-item');
    msgBtn.type = 'button';
    msgBtn.setAttribute('role', 'menuitem');
    msgBtn.appendChild(el('span', '', currentUser.is_admin ? '站主收件箱' : '私信站主'));
    if (currentUser.unread_messages > 0) {
      const unreadBadge = el('span', 'account-inline-unread');
      const dot = el('span', 'account-inline-unread-dot');
      dot.setAttribute('aria-hidden', 'true');
      unreadBadge.append(dot, el('span', '', String(currentUser.unread_messages)));
      msgBtn.appendChild(unreadBadge);
    }
    msgBtn.addEventListener('click', () => {
      closeMenu();
      openAccountModal('messages', triggerButton);
    });

    const divider = el('div', 'account-dropdown-divider');
    divider.setAttribute('aria-hidden', 'true');

    const logoutBtn = el('button', 'account-dropdown-item account-dropdown-logout');
    logoutBtn.type = 'button';
    logoutBtn.setAttribute('role', 'menuitem');
    logoutBtn.appendChild(el('span', '', '退出登录'));
    logoutBtn.addEventListener('click', () => {
      handleLogout();
    });

    actions.append(profileBtn, msgBtn, divider, logoutBtn);
    menu.append(identity, actions);
    menuRoot.replaceChildren(menu);
  }

  /* ==========================================================================
     Login Modal (Passwordless Email OTP + On-Demand Explicit Turnstile)
     ========================================================================== */

  async function ensureAuthConfigLoaded() {
    if (authConfig.loaded) return authConfig;
    if (authConfig.loading) return authConfig;
    authConfig.loading = true;
    const res = await apiRequest('/api/config', { method: 'GET' });
    authConfig.loading = false;
    authConfig.loaded = true;

    if (res.unavailable || !res.data || typeof res.data !== 'object') {
      authConfig.available = false;
      authConfig.enabled = false;
      authConfig.turnstileSiteKey = '';
      return authConfig;
    }

    authConfig.available = true;
    authConfig.enabled = res.data.enabled !== false;
    authConfig.turnstileSiteKey =
      typeof res.data.turnstile_site_key === 'string' ? res.data.turnstile_site_key.trim() : '';
    return authConfig;
  }

  function buildBackdrop(dialogEl) {
    const backdrop = el('div', 'account-backdrop');
    backdrop.addEventListener('mousedown', (event) => {
      if (event.target === backdrop) {
        closeModal({ restoreFocus: true });
      }
    });
    backdrop.appendChild(dialogEl);
    return backdrop;
  }

  function openLoginModal(trigger = triggerButton) {
    closeMenu();
    cleanupTurnstileWidget();
    cooldownCallbacks.clear();
    lastTriggerEl = trigger;
    activeModal = 'login';
    loginStep = 'request';
    document.documentElement.classList.add('account-modal-lock');
    syncTriggerButton();

    const dialog = el('div', 'account-dialog account-login-dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'account-login-title');

    const header = el('div', 'account-dialog-header');
    const titleWrap = el('div', 'account-dialog-heading');
    titleWrap.append(
      el('p', 'account-kicker', 'RADAR ACCOUNT'),
      (() => {
        const h2 = el('h2', 'account-dialog-title', '邮箱验证码登录');
        h2.id = 'account-login-title';
        return h2;
      })()
    );

    const closeBtn = el('button', 'account-close-btn');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', '关闭登录窗口');
    closeBtn.appendChild(createIcon('close', 'account-svg-icon'));
    closeBtn.addEventListener('click', () => closeModal({ restoreFocus: true }));

    header.append(titleWrap, closeBtn);

    const body = el('div', 'account-dialog-body');
    const lead = el(
      'p',
      'account-lead-copy',
      '无需密码，验证常用邮箱即可登录或自动创建账号，并在多端同步本地收藏。'
    );
    const noticeEl = el('div', 'account-notice');
    noticeEl.setAttribute('role', 'alert');
    noticeEl.hidden = true;

    const setNotice = (msg, tone = 'error') => {
      if (!msg) {
        noticeEl.hidden = true;
        noticeEl.textContent = '';
        delete noticeEl.dataset.tone;
        return;
      }
      noticeEl.dataset.tone = tone;
      noticeEl.textContent = msg;
      noticeEl.hidden = false;
    };

    const stageHost = el('div', 'account-stage-host');
    body.append(lead, noticeEl, stageHost);
    dialog.append(header, body);
    modalRoot.replaceChildren(buildBackdrop(dialog));

    const mountTurnstileIfNeeded = async (slotEl, mountEl) => {
      const cfg = await ensureAuthConfigLoaded();
      if (activeModal !== 'login' || loginStep !== 'request') return;
      if (!cfg.available || !cfg.enabled || !cfg.turnstileSiteKey) {
        slotEl.hidden = true;
        return;
      }

      slotEl.hidden = false;
      try {
        const turnstile = await loadTurnstileScriptOnce();
        if (activeModal !== 'login' || loginStep !== 'request' || !mountEl.isConnected) return;
        cleanupTurnstileWidget();
        mountEl.replaceChildren();
        const theme = typeof getTheme === 'function' && getTheme() === 'dark' ? 'dark' : 'light';
        turnstileWidgetId = turnstile.render(mountEl, {
          sitekey: cfg.turnstileSiteKey,
          action: 'login_otp',
          theme,
          callback: (token) => {
            turnstileToken = String(token || '');
            setNotice('');
          },
          'expired-callback': () => {
            turnstileToken = '';
          },
          'error-callback': () => {
            turnstileToken = '';
          },
        });
      } catch {
        if (activeModal === 'login') {
          setNotice('人机验证组件加载受阻，请检查网络或广告拦截设置后重试');
        }
      }
    };

    const renderLoginStage = () => {
      cleanupTurnstileWidget();
      cooldownCallbacks.clear();
      stageHost.replaceChildren();

      if (loginStep === 'request') {
        const form = el('form', 'account-form');
        form.noValidate = true;

        const emailField = el('label', 'account-field');
        emailField.appendChild(el('span', 'account-label', '步骤 01 · 输入电子邮箱'));
        const emailInput = el('input', 'account-input');
        emailInput.type = 'email';
        emailInput.name = 'email';
        emailInput.autocomplete = 'email';
        emailInput.spellcheck = false;
        emailInput.placeholder = 'name@example.com';
        emailInput.value = loginEmail;
        emailField.appendChild(emailInput);

        const turnstileSlot = el('div', 'account-turnstile-slot');
        turnstileSlot.hidden = true;
        const turnstileMount = el('div', 'account-turnstile-mount');
        turnstileSlot.appendChild(turnstileMount);

        const submitBtn = el('button', 'account-btn-primary account-btn-full');
        submitBtn.type = 'submit';

        let submitting = false;
        const updateSubmitLabel = (rem) => {
          if (submitting) {
            submitBtn.disabled = true;
            submitBtn.textContent = '正在发送验证码...';
            return;
          }
          if (rem > 0) {
            submitBtn.disabled = true;
            submitBtn.textContent = `${rem} 秒后可重新发送`;
          } else {
            submitBtn.disabled = false;
            submitBtn.textContent = '发送验证码';
          }
        };
        cooldownCallbacks.add(updateSubmitLabel);
        updateSubmitLabel(cooldownSeconds);

        const jumpRow = el('div', 'account-aux-row');
        const hasCodeBtn = el('button', 'account-text-link', '已收到 6 位验证码？直接核验 →');
        hasCodeBtn.type = 'button';
        hasCodeBtn.addEventListener('click', () => {
          const val = emailInput.value.trim();
          if (!isValidEmail(val)) {
            setNotice('请先填写有效的电子邮箱地址');
            emailInput.focus();
            return;
          }
          loginEmail = val;
          setNotice('');
          loginStep = 'verify';
          renderLoginStage();
        });
        jumpRow.appendChild(hasCodeBtn);

        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          if (submitting || cooldownSeconds > 0) return;

          const email = emailInput.value.trim();
          if (!isValidEmail(email)) {
            setNotice('请输入格式正确的电子邮箱地址');
            emailInput.focus();
            return;
          }

          loginEmail = email;
          setNotice('');

          const cfg = await ensureAuthConfigLoaded();
          if (!cfg.available) {
            setNotice(STATIC_ENV_NOTICE, 'info');
            notify(STATIC_ENV_NOTICE, 'info');
            return;
          }
          if (!cfg.enabled) {
            setNotice(STATIC_ENV_NOTICE, 'info');
            notify(STATIC_ENV_NOTICE, 'info');
            return;
          }
          if (cfg.turnstileSiteKey && !turnstileToken) {
            setNotice('请先完成下方人机验证后再发送验证码');
            return;
          }

          submitting = true;
          updateSubmitLabel(cooldownSeconds);

          const res = await apiRequest('/api/auth/request-otp', {
            method: 'POST',
            body: {
              email,
              turnstile_token: turnstileToken || '',
            },
          });

          submitting = false;

          if (!res.ok) {
            resetTurnstileWidget();
            const retryAfter = Number(res.data?.retry_after) || 0;
            if (res.status === 429 && retryAfter > 0 && retryAfter <= 120) {
              startCooldown(retryAfter);
            } else {
              updateSubmitLabel(cooldownSeconds);
            }
            const msg = res.unavailable ? STATIC_ENV_NOTICE : res.error;
            setNotice(msg, res.unavailable ? 'info' : 'error');
            if (res.unavailable) notify(STATIC_ENV_NOTICE, 'info');
            return;
          }

          const cd = Number(res.data?.cooldown_seconds) || 60;
          startCooldown(cd);
          setNotice('');
          notify('验证码已发送，请查收邮件', 'success');
          loginStep = 'verify';
          renderLoginStage();
        });

        form.append(emailField, turnstileSlot, submitBtn, jumpRow);
        stageHost.appendChild(form);
        mountTurnstileIfNeeded(turnstileSlot, turnstileMount);
        requestAnimationFrame(() => emailInput.focus({ preventScroll: true }));
        return;
      }

      // Step 2: Verify 6-digit OTP + optional registration username
      const form = el('form', 'account-form');
      form.noValidate = true;

      const summaryBar = el('div', 'account-step-bar');
      const emailInfo = el('div', 'account-step-bar-email');
      emailInfo.append(
        el('span', 'account-step-bar-caption', '发往邮箱'),
        el('span', 'account-step-bar-value', loginEmail)
      );

      const barActions = el('div', 'account-step-bar-actions');
      const resendBtn = el('button', 'account-text-link');
      resendBtn.type = 'button';
      const syncResendBtn = (rem) => {
        if (rem > 0) {
          resendBtn.disabled = true;
          resendBtn.textContent = `${rem}s 后可重发`;
        } else {
          resendBtn.disabled = false;
          resendBtn.textContent = '重新发送';
        }
      };
      cooldownCallbacks.add(syncResendBtn);
      syncResendBtn(cooldownSeconds);

      resendBtn.addEventListener('click', async () => {
        if (cooldownSeconds > 0) return;
        setNotice('');
        if (authConfig.turnstileSiteKey) {
          loginStep = 'request';
          renderLoginStage();
          return;
        }
        resendBtn.disabled = true;
        resendBtn.textContent = '发送中...';
        const res = await apiRequest('/api/auth/request-otp', {
          method: 'POST',
          body: { email: loginEmail, turnstile_token: '' },
        });
        if (!res.ok) {
          syncResendBtn(cooldownSeconds);
          setNotice(res.unavailable ? STATIC_ENV_NOTICE : res.error, res.unavailable ? 'info' : 'error');
          return;
        }
        startCooldown(Number(res.data?.cooldown_seconds) || 60);
        notify('已重新发送验证码', 'success');
      });

      const changeEmailBtn = el('button', 'account-text-link', '更换邮箱');
      changeEmailBtn.type = 'button';
      changeEmailBtn.addEventListener('click', () => {
        setNotice('');
        loginStep = 'request';
        renderLoginStage();
      });

      barActions.append(resendBtn, changeEmailBtn);
      summaryBar.append(emailInfo, barActions);

      const codeField = el('label', 'account-field');
      codeField.appendChild(el('span', 'account-label', '步骤 02 · 输入 6 位数字验证码'));
      const codeInput = el('input', 'account-input account-otp-input');
      codeInput.type = 'text';
      codeInput.inputMode = 'numeric';
      codeInput.pattern = '[0-9]{6}';
      codeInput.maxLength = 6;
      codeInput.autocomplete = 'one-time-code';
      codeInput.placeholder = '000000';
      codeInput.addEventListener('input', () => {
        const digits = codeInput.value.replace(/\D+/g, '').slice(0, 6);
        if (codeInput.value !== digits) codeInput.value = digits;
      });
      codeField.appendChild(codeInput);

      const nameField = el('label', 'account-field');
      nameField.appendChild(
        el('span', 'account-label', '用户名（首次注册可用，留空自动用邮箱前缀）')
      );
      const nameInput = el('input', 'account-input');
      nameInput.type = 'text';
      nameInput.maxLength = 24;
      nameInput.autocomplete = 'nickname';
      nameInput.placeholder = '选填，1–24 字自定义昵称';
      nameField.appendChild(nameInput);

      const verifyBtn = el('button', 'account-btn-primary account-btn-full', '登录');
      verifyBtn.type = 'submit';

      let verifying = false;
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (verifying) return;

        const code = codeInput.value.replace(/\D+/g, '').trim();
        if (code.length !== 6) {
          setNotice('请输入完整的 6 位数字验证码');
          codeInput.focus();
          return;
        }

        const customUsername = nameInput.value.trim();
        const payload = { email: loginEmail, code };
        if (customUsername) {
          payload.username = customUsername;
        }

        verifying = true;
        verifyBtn.disabled = true;
        verifyBtn.textContent = '正在核验登录...';
        setNotice('');

        const res = await apiRequest('/api/auth/verify-otp', {
          method: 'POST',
          body: payload,
        });

        verifying = false;
        verifyBtn.disabled = false;
        verifyBtn.textContent = '登录';

        if (!res.ok || !res.data?.user) {
          const msg = res.unavailable ? STATIC_ENV_NOTICE : res.error || '验证码无效或已过期';
          setNotice(msg, res.unavailable ? 'info' : 'error');
          if (res.unavailable) notify(STATIC_ENV_NOTICE, 'info');
          return;
        }

        currentUser = normalizeUser(res.data.user);
        closeModal({ restoreFocus: true });
        syncTriggerButton();
        notify(
          res.data.is_new_user
            ? `注册并登录成功，欢迎 ${currentUser.username}`
            : `已登录：${currentUser.username}`,
          'success'
        );
        syncCloudBookmarks();
      });

      form.append(summaryBar, codeField, nameField, verifyBtn);
      stageHost.appendChild(form);
      requestAnimationFrame(() => codeInput.focus({ preventScroll: true }));
    };

    renderLoginStage();
  }

  /* ==========================================================================
     Authenticated Account Panel: Profile Settings & Direct Messages / Admin Inbox
     ========================================================================== */

  function openAccountModal(initialTab = 'profile', trigger = triggerButton) {
    if (!currentUser) {
      openLoginModal(trigger);
      return;
    }

    closeMenu();
    cleanupTurnstileWidget();
    cooldownCallbacks.clear();
    lastTriggerEl = trigger;
    activeModal = 'account';
    activeAccountTab = initialTab === 'messages' ? 'messages' : 'profile';
    adminMobilePane = 'list';
    document.documentElement.classList.add('account-modal-lock');
    syncTriggerButton();

    const dialog = el('div', 'account-dialog account-panel-dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', '账号中心');

    const header = el('div', 'account-dialog-header account-panel-header');
    const tabsWrap = el('div', 'account-panel-tabs');
    tabsWrap.setAttribute('role', 'tablist');

    const profileTabBtn = el('button', 'account-panel-tab', '个人资料');
    profileTabBtn.type = 'button';
    profileTabBtn.setAttribute('role', 'tab');

    const messagesTabBtn = el('button', 'account-panel-tab');
    messagesTabBtn.type = 'button';
    messagesTabBtn.setAttribute('role', 'tab');

    const renderMessagesTabLabel = () => {
      messagesTabBtn.replaceChildren();
      messagesTabBtn.appendChild(
        el('span', '', currentUser?.is_admin ? '站主收件箱' : '私信站主')
      );
      if (currentUser && currentUser.unread_messages > 0) {
        const dot = el('span', 'account-tab-unread-dot');
        dot.setAttribute('aria-hidden', 'true');
        messagesTabBtn.appendChild(dot);
      }
    };
    renderMessagesTabLabel();

    tabsWrap.append(profileTabBtn, messagesTabBtn);

    const headerRight = el('div', 'account-panel-header-right');
    const headerLogoutBtn = el('button', 'account-text-link account-header-logout', '退出登录');
    headerLogoutBtn.type = 'button';
    headerLogoutBtn.addEventListener('click', () => handleLogout());

    const closeBtn = el('button', 'account-close-btn');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', '关闭面板');
    closeBtn.appendChild(createIcon('close', 'account-svg-icon'));
    closeBtn.addEventListener('click', () => closeModal({ restoreFocus: true }));

    headerRight.append(headerLogoutBtn, closeBtn);
    header.append(tabsWrap, headerRight);

    const contentHost = el('div', 'account-panel-content');
    dialog.append(header, contentHost);
    modalRoot.replaceChildren(buildBackdrop(dialog));

    const updateTabState = () => {
      const isProfile = activeAccountTab === 'profile';
      profileTabBtn.dataset.active = String(isProfile);
      profileTabBtn.setAttribute('aria-selected', String(isProfile));
      messagesTabBtn.dataset.active = String(!isProfile);
      messagesTabBtn.setAttribute('aria-selected', String(!isProfile));
      dialog.dataset.wide = !isProfile && currentUser?.is_admin ? 'true' : 'false';
      dialog.dataset.mode = activeAccountTab;
      renderMessagesTabLabel();
    };

    const renderProfileView = () => {
      contentHost.replaceChildren();
      if (!currentUser) return;

      let draftUsername = currentUser.username;
      let draftAvatarData = currentUser.avatar_data;
      let draftAvatarColor = currentUser.avatar_color;

      const wrap = el('form', 'account-profile-form');
      wrap.noValidate = true;

      const noticeEl = el('div', 'account-notice');
      noticeEl.setAttribute('role', 'alert');
      noticeEl.hidden = true;
      const setNotice = (msg, tone = 'error') => {
        if (!msg) {
          noticeEl.hidden = true;
          noticeEl.textContent = '';
          return;
        }
        noticeEl.dataset.tone = tone;
        noticeEl.textContent = msg;
        noticeEl.hidden = false;
      };

      // Avatar preview & upload section
      const avatarSection = el('div', 'account-avatar-editor');
      const previewCircle = el('div', 'account-avatar-preview');
      const avatarControls = el('div', 'account-avatar-controls');
      const btnRow = el('div', 'account-avatar-btn-row');

      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/png,image/jpeg,image/webp';
      fileInput.className = 'sr-only';

      const uploadBtn = el('button', 'account-btn-secondary');
      uploadBtn.type = 'button';
      uploadBtn.append(createIcon('upload', 'account-btn-icon'), el('span', '', '更换图片头像'));
      uploadBtn.addEventListener('click', () => fileInput.click());

      const resetAvatarBtn = el('button', 'account-btn-ghost', '恢复默认简写头像');
      resetAvatarBtn.type = 'button';

      const avatarMeta = el(
        'p',
        'account-hint',
        '支持 PNG / JPG / WebP，浏览器端自动居中裁切为 128×128 正方形。'
      );

      const colorSection = el('div', 'account-color-section');
      colorSection.appendChild(el('span', 'account-label', '默认头像底色'));
      const swatchRow = el('div', 'account-color-swatches');
      swatchRow.setAttribute('role', 'group');
      swatchRow.setAttribute('aria-label', '选择默认简写头像底色');

      const swatchButtons = AVATAR_PALETTE.map((entry) => {
        const swatch = el('button', 'account-color-swatch');
        swatch.type = 'button';
        swatch.style.backgroundColor = entry.hex;
        swatch.dataset.colorHex = entry.hex;
        swatch.setAttribute('aria-label', `头像底色：${entry.label}`);
        swatch.addEventListener('click', () => {
          draftAvatarColor = entry.hex;
          if (draftAvatarData !== null) {
            draftAvatarData = null;
            avatarMeta.textContent = '已切换为默认简写头像预览，点击「保存资料」生效。';
          }
          syncProfilePreview();
        });
        swatchRow.appendChild(swatch);
        return swatch;
      });
      colorSection.appendChild(swatchRow);

      const syncProfilePreview = () => {
        renderAvatarSurface(previewCircle, {
          avatarData: draftAvatarData,
          avatarColor: draftAvatarColor,
          username: draftUsername,
          email: currentUser.email,
        });
        previewCircle.dataset.darkInk =
          !draftAvatarData && draftAvatarColor.toUpperCase() === '#1D1D1F' ? 'true' : 'false';
        resetAvatarBtn.disabled = draftAvatarData === null;
        for (const btn of swatchButtons) {
          const selected = btn.dataset.colorHex === draftAvatarColor.toUpperCase();
          btn.setAttribute('aria-pressed', String(selected));
          btn.dataset.selected = String(selected);
        }
      };

      fileInput.addEventListener('change', async () => {
        const file = fileInput.files?.[0];
        fileInput.value = '';
        if (!file) return;
        setNotice('');
        try {
          const dataUrl = await cropAndCompressAvatarFile(file, draftAvatarColor);
          draftAvatarData = dataUrl;
          const kb = (dataUrl.length / 1024).toFixed(1);
          avatarMeta.textContent = `已居中裁切为 128×128（约 ${kb} KB），点击下方「保存资料」生效。`;
          syncProfilePreview();
        } catch (err) {
          setNotice(err instanceof Error ? err.message : '图片处理失败，请重试');
        }
      });

      resetAvatarBtn.addEventListener('click', () => {
        if (draftAvatarData === null) return;
        draftAvatarData = null;
        avatarMeta.textContent = '已恢复默认简写头像预览，点击下方「保存资料」生效。';
        syncProfilePreview();
      });

      btnRow.append(fileInput, uploadBtn, resetAvatarBtn);
      avatarControls.append(btnRow, avatarMeta);
      avatarSection.append(previewCircle, avatarControls);

      // Username field
      const nameField = el('label', 'account-field');
      const nameLabelRow = el('div', 'account-label-row');
      nameLabelRow.appendChild(el('span', 'account-label', '用户名（1–24 字）'));
      const charCount = el('span', 'account-char-count', `${draftUsername.trim().length} / 24`);
      nameLabelRow.appendChild(charCount);

      const nameInput = el('input', 'account-input');
      nameInput.type = 'text';
      nameInput.maxLength = 24;
      nameInput.required = true;
      nameInput.value = draftUsername;
      nameInput.placeholder = '输入 1–24 字昵称';
      nameInput.addEventListener('input', () => {
        draftUsername = nameInput.value;
        charCount.textContent = `${draftUsername.trim().length} / 24`;
        syncProfilePreview();
      });
      nameField.append(nameLabelRow, nameInput);

      // Bound email display
      const emailReadonly = el('div', 'account-readonly-row');
      emailReadonly.append(
        el('span', 'account-label', '登录邮箱'),
        el('span', 'account-readonly-email', currentUser.email || '--')
      );

      const footer = el('div', 'account-profile-footer');
      const saveBtn = el('button', 'account-btn-primary', '保存资料');
      saveBtn.type = 'submit';
      footer.appendChild(saveBtn);

      let saving = false;
      wrap.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (saving || !currentUser) return;

        const trimmed = draftUsername.replace(/[\x00-\x1F\x7F]/g, '').trim();
        if (trimmed.length < 1 || trimmed.length > 24) {
          setNotice('用户名长度需在 1 到 24 个字符之间');
          nameInput.focus();
          return;
        }

        saving = true;
        saveBtn.disabled = true;
        saveBtn.textContent = '正在保存...';
        setNotice('');

        const res = await apiRequest('/api/profile', {
          method: 'PATCH',
          body: {
            username: trimmed,
            avatar_data: draftAvatarData,
            avatar_color: draftAvatarColor,
          },
        });

        saving = false;
        saveBtn.disabled = false;
        saveBtn.textContent = '保存资料';

        if (!res.ok) {
          setNotice(res.unavailable ? STATIC_ENV_NOTICE : res.error);
          return;
        }

        if (res.data?.user) {
          currentUser = normalizeUser({
            ...currentUser,
            ...res.data.user,
            unread_messages:
              res.data.user.unread_messages ?? currentUser.unread_messages,
          });
        } else {
          currentUser = normalizeUser({
            ...currentUser,
            username: trimmed,
            avatar_data: draftAvatarData,
            avatar_color: draftAvatarColor,
          });
        }

        draftUsername = currentUser.username;
        draftAvatarData = currentUser.avatar_data;
        draftAvatarColor = currentUser.avatar_color;
        nameInput.value = draftUsername;
        charCount.textContent = `${draftUsername.trim().length} / 24`;
        avatarMeta.textContent = '个人资料已更新并同步至云端。';
        syncProfilePreview();
        syncTriggerButton();
        notify('个人资料已保存', 'success');
      });

      syncProfilePreview();
      wrap.append(noticeEl, avatarSection, colorSection, nameField, emailReadonly, footer);
      contentHost.appendChild(wrap);
    };

    const renderMessageItems = (scrollEl, messages, { viewerIsAdmin, peerLabel }) => {
      scrollEl.replaceChildren();
      if (!messages.length) {
        const empty = el(
          'div',
          'account-msg-empty',
          viewerIsAdmin
            ? '暂无对话消息，可在下方直接向该用户发送回复。'
            : '暂无私信往来。如需反馈情报线索、勘误或站点建议，可在下方直接给站主留言。'
        );
        scrollEl.appendChild(empty);
        return;
      }

      const frag = document.createDocumentFragment();
      for (const msg of messages) {
        const isOwn = viewerIsAdmin ? msg.fromAdmin : !msg.fromAdmin;
        const item = el('article', 'account-msg-item');
        item.dataset.own = String(isOwn);

        const meta = el('div', 'account-msg-meta');
        const author = el(
          'span',
          'account-msg-author',
          msg.fromAdmin
            ? viewerIsAdmin
              ? '我 · 站主'
              : '站主 · 前哨 Radar'
            : viewerIsAdmin
              ? peerLabel || '来信用户'
              : `我 · ${currentUser?.username || '读者'}`
        );
        const time = el('time', 'account-msg-time', formatMessageTime(msg.createdAt));
        meta.append(author, time);

        const bubble = el('div', 'account-msg-bubble', msg.body);
        item.append(meta, bubble);
        frag.appendChild(item);
      }
      scrollEl.appendChild(frag);
      requestAnimationFrame(() => {
        scrollEl.scrollTop = scrollEl.scrollHeight;
      });
    };

    const renderUserMessagesView = () => {
      contentHost.replaceChildren();
      const shell = el('div', 'account-chat-shell');

      const subbar = el('div', 'account-chat-subbar');
      subbar.appendChild(el('span', 'account-chat-subtitle', '与站主一对一私信 · 回复在此展示'));
      const refreshBtn = el('button', 'account-text-link', '刷新');
      refreshBtn.type = 'button';
      subbar.appendChild(refreshBtn);

      const scrollEl = el('div', 'account-msg-scroll');
      const composer = el('form', 'account-msg-composer');
      const textarea = el('textarea', 'account-msg-textarea');
      textarea.rows = 2;
      textarea.maxLength = MSG_MAX_LENGTH;
      textarea.placeholder = '输入给站主的留言（1–1000 字，Ctrl / Cmd + Enter 快速发送）...';

      const sendBtn = el('button', 'account-btn-primary account-send-btn', '发送');
      sendBtn.type = 'submit';

      textarea.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          composer.requestSubmit();
        }
      });

      composer.append(textarea, sendBtn);
      shell.append(subbar, scrollEl, composer);
      contentHost.appendChild(shell);

      let messagesList = [];

      const loadMessages = async () => {
        if (!messagesList.length) {
          scrollEl.replaceChildren(el('div', 'account-msg-empty', '正在加载对话记录...'));
        }
        const res = await apiRequest('/api/messages', { method: 'GET' });
        if (activeModal !== 'account' || activeAccountTab !== 'messages' || !scrollEl.isConnected) {
          return;
        }
        if (!res.ok) {
          scrollEl.replaceChildren(
            el('div', 'account-msg-empty', res.unavailable ? STATIC_ENV_NOTICE : res.error)
          );
          return;
        }
        messagesList = normalizeMessagesList(res.data, { currentUser });
        if (currentUser) {
          const nextUnread =
            typeof res.data?.unread_messages === 'number' ? res.data.unread_messages : 0;
          currentUser.unread_messages = Math.max(0, nextUnread);
          syncTriggerButton();
          renderMessagesTabLabel();
        }
        renderMessageItems(scrollEl, messagesList, {
          viewerIsAdmin: false,
          peerLabel: '站主',
        });
      };

      refreshBtn.addEventListener('click', () => loadMessages());

      let sending = false;
      composer.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (sending) return;
        const bodyText = textarea.value.trim();
        if (!bodyText) {
          textarea.focus();
          return;
        }

        sending = true;
        sendBtn.disabled = true;
        sendBtn.textContent = '发送中...';

        const res = await apiRequest('/api/messages', {
          method: 'POST',
          body: { body: bodyText },
        });

        sending = false;
        sendBtn.disabled = false;
        sendBtn.textContent = '发送';

        if (!res.ok) {
          notify(res.unavailable ? STATIC_ENV_NOTICE : res.error, 'error');
          return;
        }

        textarea.value = '';
        if (Array.isArray(res.data?.messages)) {
          messagesList = normalizeMessagesList(res.data, { currentUser });
          renderMessageItems(scrollEl, messagesList, { viewerIsAdmin: false, peerLabel: '站主' });
        } else if (res.data?.message && typeof res.data.message === 'object') {
          const appended = normalizeMessagesList([res.data.message], { currentUser });
          messagesList = [...messagesList, ...appended];
          renderMessageItems(scrollEl, messagesList, { viewerIsAdmin: false, peerLabel: '站主' });
        } else {
          await loadMessages();
        }
        textarea.focus({ preventScroll: true });
      });

      loadMessages();
    };

    const renderAdminInboxView = () => {
      contentHost.replaceChildren();
      const layout = el('div', 'account-inbox-layout');
      layout.dataset.mobilePane = adminMobilePane;

      // Left pane: All incoming user threads
      const threadsPane = el('aside', 'account-threads-pane');
      threadsPane.setAttribute('aria-label', '来信用户列表');

      const threadsHeader = el('div', 'account-chat-subbar');
      const threadsTitle = el('span', 'account-chat-subtitle', '来信用户');
      const refreshThreadsBtn = el('button', 'account-text-link', '刷新');
      refreshThreadsBtn.type = 'button';
      threadsHeader.append(threadsTitle, refreshThreadsBtn);

      const threadsListEl = el('div', 'account-threads-scroll');
      threadsPane.append(threadsHeader, threadsListEl);

      // Right pane: Conversation context & reply box
      const chatPane = el('section', 'account-chat-pane');
      chatPane.setAttribute('aria-label', '私信上下文与回复');

      layout.append(threadsPane, chatPane);
      contentHost.appendChild(layout);

      const syncTotalAdminUnread = () => {
        if (!currentUser) return;
        const sum = cachedThreads.reduce((acc, item) => acc + (item.unreadCount || 0), 0);
        currentUser.unread_messages = sum;
        syncTriggerButton();
        renderMessagesTabLabel();
      };

      const renderThreadsList = () => {
        threadsListEl.replaceChildren();
        threadsTitle.textContent = cachedThreads.length
          ? `全部来信（${cachedThreads.length}）`
          : '全部来信';

        if (!cachedThreads.length) {
          threadsListEl.appendChild(el('div', 'account-msg-empty', '收件箱暂无用户来信。'));
          return;
        }

        const frag = document.createDocumentFragment();
        for (const thread of cachedThreads) {
          const isSelected = String(thread.userId) === String(activeThreadUserId);
          const row = el('button', 'account-thread-row');
          row.type = 'button';
          row.dataset.selected = String(isSelected);

          const avatar = el('span', 'account-thread-avatar');
          renderAvatarSurface(avatar, {
            avatarData: thread.avatar_data,
            avatarColor: thread.avatar_color,
            username: thread.username,
            email: thread.email,
          });

          const info = el('span', 'account-thread-info');
          const topLine = el('span', 'account-thread-top');
          topLine.appendChild(el('span', 'account-thread-name', thread.username));
          if (thread.lastAt) {
            topLine.appendChild(el('span', 'account-thread-time', formatMessageTime(thread.lastAt)));
          }

          const emailLine = el('span', 'account-thread-email', thread.email || `ID: ${thread.userId}`);

          const previewLine = el('span', 'account-thread-bottom');
          previewLine.appendChild(
            el('span', 'account-thread-preview', thread.lastPreview || '点击查看对话详情')
          );
          if (thread.unreadCount > 0) {
            const badge = el('span', 'account-inline-unread');
            const dot = el('span', 'account-inline-unread-dot');
            dot.setAttribute('aria-hidden', 'true');
            badge.append(dot, el('span', '', String(thread.unreadCount)));
            previewLine.appendChild(badge);
          }

          info.append(topLine, emailLine, previewLine);
          row.append(avatar, info);

          row.addEventListener('click', () => {
            activeThreadUserId = thread.userId;
            adminMobilePane = 'detail';
            layout.dataset.mobilePane = 'detail';
            if (thread.unreadCount > 0) {
              thread.unreadCount = 0;
              syncTotalAdminUnread();
            }
            renderThreadsList();
            renderActiveThreadConversation();
          });

          frag.appendChild(row);
        }
        threadsListEl.appendChild(frag);
      };

      const renderActiveThreadConversation = () => {
        chatPane.replaceChildren();
        const selectedThread = cachedThreads.find(
          (item) => String(item.userId) === String(activeThreadUserId)
        );

        if (!selectedThread) {
          chatPane.appendChild(
            el('div', 'account-msg-empty', '请从左侧列表选择一位来信用户以查看上下文并回复。')
          );
          return;
        }

        const peerSubbar = el('div', 'account-chat-subbar account-admin-peer-bar');
        const peerLeft = el('div', 'account-admin-peer-left');

        const mobileBackBtn = el('button', 'account-mobile-back-btn');
        mobileBackBtn.type = 'button';
        mobileBackBtn.append(createIcon('back', 'account-btn-icon'), el('span', '', '收件箱'));
        mobileBackBtn.addEventListener('click', () => {
          adminMobilePane = 'list';
          layout.dataset.mobilePane = 'list';
        });

        const peerIdentity = el('div', 'account-admin-peer-meta');
        peerIdentity.append(
          el('span', 'account-admin-peer-name', selectedThread.username),
          el('span', 'account-admin-peer-email', selectedThread.email || '')
        );

        peerLeft.append(mobileBackBtn, peerIdentity);

        const reloadChatBtn = el('button', 'account-text-link', '刷新对话');
        reloadChatBtn.type = 'button';
        peerSubbar.append(peerLeft, reloadChatBtn);

        const scrollEl = el('div', 'account-msg-scroll');
        const composer = el('form', 'account-msg-composer');
        const textarea = el('textarea', 'account-msg-textarea');
        textarea.rows = 2;
        textarea.maxLength = MSG_MAX_LENGTH;
        textarea.placeholder = `回复 ${selectedThread.username}（1–1000 字，Ctrl / Cmd + Enter 发送）...`;

        const sendBtn = el('button', 'account-btn-primary account-send-btn', '回复');
        sendBtn.type = 'submit';

        textarea.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            composer.requestSubmit();
          }
        });

        composer.append(textarea, sendBtn);
        chatPane.append(peerSubbar, scrollEl, composer);

        let threadMessages = [];
        const targetId = selectedThread.userId;

        const loadThreadMessages = async () => {
          if (!threadMessages.length) {
            scrollEl.replaceChildren(el('div', 'account-msg-empty', '正在读取对话上下文...'));
          }
          const res = await apiRequest(
            `/api/admin/messages/${encodeURIComponent(String(targetId))}`,
            { method: 'GET' }
          );
          if (
            activeModal !== 'account' ||
            activeAccountTab !== 'messages' ||
            String(activeThreadUserId) !== String(targetId) ||
            !scrollEl.isConnected
          ) {
            return;
          }
          if (!res.ok) {
            scrollEl.replaceChildren(
              el('div', 'account-msg-empty', res.unavailable ? STATIC_ENV_NOTICE : res.error)
            );
            return;
          }

          const peerObj =
            res.data?.peer && typeof res.data.peer === 'object'
              ? res.data.peer
              : res.data?.user && typeof res.data.user === 'object'
                ? res.data.user
                : null;
          if (peerObj) {
            selectedThread.username =
              String(peerObj.username || selectedThread.username).trim() ||
              selectedThread.username;
            selectedThread.email =
              String(peerObj.email || selectedThread.email).trim() || selectedThread.email;
          }

          threadMessages = normalizeMessagesList(res.data, {
            currentUser,
            threadUserId: targetId,
          });
          renderMessageItems(scrollEl, threadMessages, {
            viewerIsAdmin: true,
            peerLabel: selectedThread.username,
          });
        };

        reloadChatBtn.addEventListener('click', () => loadThreadMessages());

        let replying = false;
        composer.addEventListener('submit', async (event) => {
          event.preventDefault();
          if (replying) return;
          const bodyText = textarea.value.trim();
          if (!bodyText) {
            textarea.focus();
            return;
          }

          replying = true;
          sendBtn.disabled = true;
          sendBtn.textContent = '发送中...';

          const res = await apiRequest(
            `/api/admin/messages/${encodeURIComponent(String(targetId))}`,
            {
              method: 'POST',
              body: { body: bodyText },
            }
          );

          replying = false;
          sendBtn.disabled = false;
          sendBtn.textContent = '回复';

          if (!res.ok) {
            notify(res.unavailable ? STATIC_ENV_NOTICE : res.error, 'error');
            return;
          }

          textarea.value = '';
          selectedThread.lastPreview = bodyText;
          selectedThread.lastAt = new Date().toISOString();
          renderThreadsList();

          if (Array.isArray(res.data?.messages)) {
            threadMessages = normalizeMessagesList(res.data, {
              currentUser,
              threadUserId: targetId,
            });
            renderMessageItems(scrollEl, threadMessages, {
              viewerIsAdmin: true,
              peerLabel: selectedThread.username,
            });
          } else if (res.data?.message && typeof res.data.message === 'object') {
            const appended = normalizeMessagesList([res.data.message], {
              currentUser,
              threadUserId: targetId,
            });
            threadMessages = [...threadMessages, ...appended];
            renderMessageItems(scrollEl, threadMessages, {
              viewerIsAdmin: true,
              peerLabel: selectedThread.username,
            });
          } else {
            await loadThreadMessages();
          }
          textarea.focus({ preventScroll: true });
        });

        loadThreadMessages();
      };

      const fetchThreads = async () => {
        if (!cachedThreads.length) {
          threadsListEl.replaceChildren(el('div', 'account-msg-empty', '正在加载收件箱...'));
        }
        const res = await apiRequest('/api/admin/threads', { method: 'GET' });
        if (activeModal !== 'account' || activeAccountTab !== 'messages' || !layout.isConnected) {
          return;
        }
        if (!res.ok) {
          threadsListEl.replaceChildren(
            el('div', 'account-msg-empty', res.unavailable ? STATIC_ENV_NOTICE : res.error)
          );
          return;
        }
        cachedThreads = normalizeAdminThreads(res.data);
        syncTotalAdminUnread();
        renderThreadsList();
        renderActiveThreadConversation();
      };

      refreshThreadsBtn.addEventListener('click', () => fetchThreads());
      renderActiveThreadConversation();
      fetchThreads();
    };

    const renderCurrentTab = () => {
      updateTabState();
      if (activeAccountTab === 'profile') {
        renderProfileView();
      } else if (currentUser?.is_admin) {
        renderAdminInboxView();
      } else {
        renderUserMessagesView();
      }
    };

    profileTabBtn.addEventListener('click', () => {
      if (activeAccountTab === 'profile') return;
      activeAccountTab = 'profile';
      renderCurrentTab();
    });

    messagesTabBtn.addEventListener('click', () => {
      if (activeAccountTab === 'messages') return;
      activeAccountTab = 'messages';
      renderCurrentTab();
    });

    renderCurrentTab();
  }

  /* ==========================================================================
     Global Event Listeners & Initial Session Check (/api/me)
     ========================================================================== */

  triggerButton.addEventListener('click', (event) => {
    event.stopPropagation();
    if (!currentUser) {
      if (activeModal === 'login') {
        closeModal({ restoreFocus: true });
      } else {
        openLoginModal(triggerButton);
      }
      return;
    }

    if (menuOpen) {
      closeMenu();
    } else {
      openMenu();
    }
  });

  document.addEventListener('mousedown', (event) => {
    if (!menuOpen) return;
    const target = event.target;
    if (
      target instanceof Node &&
      !menuRoot.contains(target) &&
      !triggerButton.contains(target)
    ) {
      closeMenu();
    }
  });

  window.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape') return;
      if (menuOpen) {
        event.preventDefault();
        event.stopPropagation();
        closeMenu();
        triggerButton.focus({ preventScroll: true });
        return;
      }
      if (activeModal) {
        event.preventDefault();
        event.stopPropagation();
        closeModal({ restoreFocus: true });
      }
    },
    true
  );

  syncTriggerButton();

  // Silent non-blocking session check on load; gracefully degrades on static servers.
  (async () => {
    const res = await apiRequest('/api/me', { method: 'GET' });
    if (!res.ok || !res.data || typeof res.data !== 'object') {
      if (res.unavailable) {
        authConfig = {
          loaded: true,
          loading: false,
          available: false,
          enabled: false,
          turnstileSiteKey: '',
        };
      }
      return;
    }
    const user = normalizeUser(res.data.user);
    if (!user) return;
    currentUser = user;
    syncTriggerButton();
    syncCloudBookmarks();
  })();

  return {
    getUser: () => (currentUser ? { ...currentUser } : null),
    isAuthenticated: () => Boolean(currentUser),
    openLogin: () => openLoginModal(triggerButton),
    openProfile: () => openAccountModal('profile', triggerButton),
    openMessages: () => openAccountModal('messages', triggerButton),
    closeAll: () => {
      closeMenu();
      closeModal({ restoreFocus: false });
    },
    syncBookmarkChange,
    syncCloudBookmarks,
  };
}
