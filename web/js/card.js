/**
 * 高信息密度情报卡片组件与赛博终端 Toast 通知模块
 * 原生 ES6 Module · 零外部依赖 · 全程 textContent 防 XSS
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
const TOAST_CONTAINER_ID = 'toast-container';
const TOAST_DURATION_MS = 2400;
const TOAST_FADE_MS = 240;
const MAX_ACTIVE_TOASTS = 4;

const TOAST_VARIANTS = {
  success: {
    tag: 'OK',
    role: 'status',
    panelClass:
      'border-emerald-500/45 bg-[#0b1520]/95 text-emerald-50 shadow-[0_12px_32px_-8px_rgba(16,185,129,0.35)]',
    accentBarClass: 'bg-emerald-400',
    tagClass: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
    iconClass: 'text-emerald-400',
  },
  warning: {
    tag: 'WARN',
    role: 'status',
    panelClass:
      'border-amber-500/45 bg-[#171316]/95 text-amber-50 shadow-[0_12px_32px_-8px_rgba(245,158,11,0.35)]',
    accentBarClass: 'bg-amber-400',
    tagClass: 'border-amber-500/40 bg-amber-500/15 text-amber-300',
    iconClass: 'text-amber-400',
  },
  error: {
    tag: 'ERR',
    role: 'alert',
    panelClass:
      'border-red-500/45 bg-[#181018]/95 text-red-50 shadow-[0_12px_32px_-8px_rgba(239,68,68,0.35)]',
    accentBarClass: 'bg-red-400',
    tagClass: 'border-red-500/40 bg-red-500/15 text-red-300',
    iconClass: 'text-red-400',
  },
  info: {
    tag: 'INFO',
    role: 'status',
    panelClass:
      'border-cyan-500/45 bg-[#0b1524]/95 text-cyan-50 shadow-[0_12px_32px_-8px_rgba(6,182,212,0.35)]',
    accentBarClass: 'bg-cyan-400',
    tagClass: 'border-cyan-500/40 bg-cyan-500/15 text-cyan-300',
    iconClass: 'text-cyan-400',
  },
};

const TYPE_CONFIG = {
  DEAL: {
    label: 'DEAL',
    badgeClass: 'border-emerald-500/40 bg-emerald-950/75 text-emerald-300',
    topBarClass: 'from-emerald-400/80 via-emerald-500/35 to-transparent',
    hoverBorderClass: 'hover:border-emerald-500/45',
    tldrBorderClass: 'border-emerald-400/80',
    tldrTagClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    bulletClass: 'text-emerald-400/85',
    valuePillClass:
      'border-emerald-400/55 bg-emerald-500/15 text-emerald-200 shadow-[0_0_16px_-4px_rgba(16,185,129,0.5)]',
  },
  BUG: {
    label: 'BUG',
    badgeClass: 'border-red-500/40 bg-red-950/75 text-red-300',
    topBarClass: 'from-red-500/80 via-rose-500/35 to-transparent',
    hoverBorderClass: 'hover:border-red-500/45',
    tldrBorderClass: 'border-red-400/80',
    tldrTagClass: 'bg-red-500/15 text-red-300 border-red-500/30',
    bulletClass: 'text-red-400/85',
    valuePillClass:
      'border-rose-400/55 bg-rose-500/15 text-rose-200 shadow-[0_0_16px_-4px_rgba(239,68,68,0.45)]',
  },
  HACK: {
    label: 'HACK',
    badgeClass: 'border-cyan-500/40 bg-cyan-950/75 text-cyan-300',
    topBarClass: 'from-cyan-400/80 via-sky-500/35 to-transparent',
    hoverBorderClass: 'hover:border-cyan-500/45',
    tldrBorderClass: 'border-cyan-400/80',
    tldrTagClass: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
    bulletClass: 'text-cyan-400/85',
    valuePillClass:
      'border-cyan-400/55 bg-cyan-500/15 text-cyan-200 shadow-[0_0_16px_-4px_rgba(6,182,212,0.5)]',
  },
};

const DEFAULT_TYPE_CONFIG = TYPE_CONFIG.HACK;

const STATUS_CONFIG = {
  ACTIVE: {
    label: '亲测有效',
    badgeClass:
      'border-emerald-500/35 bg-emerald-500/10 text-emerald-300',
    dotCoreClass:
      'bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.9)]',
    dotRingClass: 'bg-emerald-400 opacity-75 animate-ping',
    pulseDuration: '2.2s',
    strikeLabel: false,
  },
  URGENT: {
    label: '手慢无',
    badgeClass:
      'border-amber-500/45 bg-amber-500/15 text-amber-300 font-semibold',
    dotCoreClass:
      'bg-amber-400 shadow-[0_0_9px_rgba(245,158,11,0.95)]',
    dotRingClass: 'bg-amber-400 opacity-85 animate-ping',
    pulseDuration: '0.95s',
    strikeLabel: false,
  },
  FIXED: {
    label: '已失效',
    badgeClass:
      'border-slate-700/80 bg-slate-800/75 text-slate-400',
    dotCoreClass: 'bg-slate-500',
    dotRingClass: '',
    pulseDuration: '',
    strikeLabel: true,
  },
};

/**
 * 安全创建带类名与文本的 DOM 元素
 */
function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text !== '') {
    node.textContent = text;
  }
  return node;
}

/**
 * 纯原生 createElementNS 构建内置静态 SVG 图标（零 innerHTML）
 */
function createSvgIcon(kind, className = 'w-3.5 h-3.5 shrink-0') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', className);

  const addShape = (tag, attrs) => {
    const shape = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) {
      shape.setAttribute(k, v);
    }
    svg.appendChild(shape);
  };

  switch (kind) {
    case 'copy':
      addShape('rect', { x: '9', y: '9', width: '13', height: '13', rx: '2', ry: '2' });
      addShape('path', { d: 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1' });
      break;
    case 'check':
      addShape('polyline', { points: '20 6 9 17 4 12' });
      break;
    case 'warning':
      addShape('path', { d: 'M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z' });
      addShape('line', { x1: '12', y1: '9', x2: '12', y2: '13' });
      addShape('line', { x1: '12', y1: '17', x2: '12.01', y2: '17' });
      break;
    case 'error':
      addShape('circle', { cx: '12', cy: '12', r: '10' });
      addShape('line', { x1: '15', y1: '9', x2: '9', y2: '15' });
      addShape('line', { x1: '9', y1: '9', x2: '15', y2: '15' });
      break;
    case 'info':
      addShape('circle', { cx: '12', cy: '12', r: '10' });
      addShape('line', { x1: '12', y1: '16', x2: '12', y2: '12' });
      addShape('line', { x1: '12', y1: '8', x2: '12.01', y2: '8' });
      break;
    case 'terminal':
      addShape('polyline', { points: '4 17 10 11 4 5' });
      addShape('line', { x1: '12', y1: '19', x2: '20', y2: '19' });
      break;
    default:
      break;
  }

  return svg;
}

/**
 * 严格校验 HTTP / HTTPS 外部链接，杜绝 javascript: 等协议注入
 */
function sanitizeHttpUrl(rawUrl) {
  if (typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();
  if (!/^https?:\/\//i.test(trimmed)) return '';
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.href;
    }
  } catch {
    return '';
  }
  return '';
}

/**
 * 轻量识别代码片段类型徽标，增强终端观感
 */
function detectSnippetLang(snippet) {
  const trimmed = snippet.trim();
  if (!trimmed) return 'SNIPPET';
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    return 'JSON';
  }
  if (/^\s*(from\s+\S+\s+import|import\s+\S+|def\s+\S+|async\s+def\s+)/m.test(trimmed)) {
    return 'PYTHON';
  }
  if (/^\s*curl\b/m.test(trimmed)) {
    return 'CURL';
  }
  if (
    /^\s*(git|docker|npm|npx|pip|uv|export|echo|chmod|sudo)\b/m.test(trimmed) ||
    trimmed.startsWith('#')
  ) {
    return 'SHELL';
  }
  return 'CODE';
}

/**
 * 剪贴板写入（优先 Clipboard API，非 HTTPS / 本地环境自动回退隐藏 textarea + execCommand）
 */
async function copyTextToClipboard(text) {
  const payload = String(text ?? '');

  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function'
  ) {
    try {
      await navigator.clipboard.writeText(payload);
      return true;
    } catch {
      // Fall through to execCommand fallback
    }
  }

  if (typeof document === 'undefined' || !document.body) {
    return false;
  }

  const textarea = document.createElement('textarea');
  textarea.value = payload;
  textarea.setAttribute('readonly', '');
  textarea.setAttribute('aria-hidden', 'true');
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.left = '-9999px';
  textarea.style.width = '2em';
  textarea.style.height = '2em';
  textarea.style.padding = '0';
  textarea.style.border = 'none';
  textarea.style.outline = 'none';
  textarea.style.boxShadow = 'none';
  textarea.style.background = 'transparent';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';

  const previouslyFocused =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;

  document.body.appendChild(textarea);

  let copied = false;
  try {
    try {
      textarea.focus({ preventScroll: true });
    } catch {
      textarea.focus();
    }
    textarea.select();
    textarea.setSelectionRange(0, payload.length);
    copied = Boolean(document.execCommand('copy'));
  } catch {
    copied = false;
  } finally {
    if (textarea.parentNode) {
      textarea.parentNode.removeChild(textarea);
    }
    if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
      try {
        previouslyFocused.focus({ preventScroll: true });
      } catch {
        // Ignore focus restoration error
      }
    }
  }

  return copied;
}

/**
 * 获取或动态创建 #toast-container
 */
function ensureToastContainer() {
  let container = document.getElementById(TOAST_CONTAINER_ID);
  if (!container) {
    container = document.createElement('div');
    container.id = TOAST_CONTAINER_ID;
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-atomic', 'false');
    container.className =
      'fixed top-4 right-4 z-50 flex flex-col items-end gap-2.5 pointer-events-none max-w-[calc(100vw-2rem)]';
    document.body.appendChild(container);
  }
  return container;
}

/**
 * 在 #toast-container 中展示暗黑赛博终端风格 Toast 提示
 * @param {string} message - 提示文本
 * @param {'success' | 'warning' | 'error' | 'info'} [variant='success'] - 提示类型
 */
export function showToast(message, variant = 'success') {
  if (typeof document === 'undefined' || !document.body) return null;

  const normalizedVariant = Object.prototype.hasOwnProperty.call(TOAST_VARIANTS, variant)
    ? variant
    : 'info';
  const style = TOAST_VARIANTS[normalizedVariant];
  const container = ensureToastContainer();

  // 防止短时间高频触发堆叠过多
  while (container.children.length >= MAX_ACTIVE_TOASTS) {
    container.firstElementChild?.remove();
  }

  const toast = el(
    'div',
    [
      'pointer-events-auto relative flex items-center gap-2.5 overflow-hidden rounded-lg border',
      'px-3.5 py-2.5 backdrop-blur-md cursor-pointer select-none',
      'w-fit max-w-[calc(100vw-2rem)] sm:max-w-sm',
      'transition-all duration-200 ease-out opacity-0 translate-y-2 scale-95',
      style.panelClass,
    ].join(' ')
  );
  toast.setAttribute('role', style.role);
  toast.dataset.toastVariant = normalizedVariant;
  toast.title = '点击关闭提示';

  // 左侧霓虹竖条
  const accentBar = el(
    'span',
    `absolute inset-y-0 left-0 w-1 ${style.accentBarClass}`
  );
  accentBar.setAttribute('aria-hidden', 'true');

  // 图标
  const iconKind =
    normalizedVariant === 'success'
      ? 'check'
      : normalizedVariant === 'warning'
        ? 'warning'
        : normalizedVariant === 'error'
          ? 'error'
          : 'info';
  const iconWrap = el('span', `shrink-0 pl-0.5 ${style.iconClass}`);
  iconWrap.appendChild(createSvgIcon(iconKind, 'w-4 h-4'));

  // 终端状态微标
  const tagBadge = el(
    'span',
    `shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wider ${style.tagClass}`,
    style.tag
  );

  // 正文消息（严格 textContent）
  const msgEl = el(
    'span',
    'min-w-0 text-xs sm:text-[13px] font-medium leading-snug break-words [overflow-wrap:anywhere]',
    String(message ?? '')
  );

  toast.append(accentBar, iconWrap, tagBadge, msgEl);
  container.appendChild(toast);

  // 下一帧触发平滑进入动效
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      toast.classList.remove('opacity-0', 'translate-y-2', 'scale-95');
      toast.classList.add('opacity-100', 'translate-y-0', 'scale-100');
    });
  });

  let dismissed = false;
  let hideTimer = null;

  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    if (hideTimer) clearTimeout(hideTimer);
    toast.classList.add('toast-exit');
    toast.style.animation = 'none';
    // 强制读取一次布局后再切换终态，确保与 terminal.css 的 #toast-container > * 动画兼容并平滑淡出
    void toast.offsetWidth;
    toast.classList.remove('opacity-100', 'translate-y-0', 'scale-100');
    toast.classList.add('opacity-0', '-translate-y-1', 'scale-95');
    toast.style.opacity = '0';
    toast.style.transform = 'translate3d(10px, -4px, 0) scale(0.96)';
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, TOAST_FADE_MS);
  };

  toast.addEventListener('click', dismiss, { once: true });
  hideTimer = setTimeout(dismiss, TOAST_DURATION_MS);

  return toast;
}

/**
 * 构建左上角动态呼吸灯状态徽章
 */
function buildStatusBadge(statusKey) {
  const cfg = STATUS_CONFIG[statusKey] || STATUS_CONFIG.ACTIVE;
  const badge = el(
    'span',
    `inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] leading-none tracking-wide shrink-0 ${cfg.badgeClass}`
  );
  badge.dataset.statusBadge = statusKey;

  const dotWrap = el('span', 'relative flex h-2 w-2 shrink-0 items-center justify-center');
  dotWrap.setAttribute('aria-hidden', 'true');

  if (cfg.dotRingClass) {
    const ring = el(
      'span',
      `absolute inline-flex h-full w-full rounded-full motion-reduce:animate-none ${cfg.dotRingClass}`
    );
    if (cfg.pulseDuration) {
      ring.style.animationDuration = cfg.pulseDuration;
    }
    dotWrap.appendChild(ring);
  }

  const core = el('span', `relative inline-flex h-2 w-2 rounded-full ${cfg.dotCoreClass}`);
  dotWrap.appendChild(core);

  const label = el(
    'span',
    cfg.strikeLabel ? 'line-through decoration-slate-400/90' : '',
    cfg.label
  );

  badge.append(dotWrap, label);
  return badge;
}

/**
 * 构建单条详情要点（自动对中文前缀标签如“资格门槛：”做轻高亮，全程 textContent）
 */
function buildDetailItem(text, bulletClass, isFixed) {
  const li = el('li', 'flex items-start gap-2 min-w-0 max-w-full');

  const bullet = el(
    'span',
    `font-mono text-xs leading-5 select-none shrink-0 ${isFixed ? 'text-slate-600' : bulletClass}`,
    '›'
  );
  bullet.setAttribute('aria-hidden', 'true');

  const content = el(
    'span',
    `min-w-0 flex-1 text-[13px] leading-relaxed break-words [overflow-wrap:anywhere] ${
      isFixed ? 'text-slate-400' : 'text-slate-300'
    }`
  );

  const raw = String(text ?? '');
  const prefixMatch = raw.match(/^([\u4e00-\u9fa5A-Za-z0-9\s/+-]{2,12}：)\s*(.+)$/);
  if (prefixMatch) {
    const labelSpan = el(
      'span',
      isFixed ? 'font-medium text-slate-400' : 'font-semibold text-slate-100',
      prefixMatch[1]
    );
    const bodySpan = el('span', '', prefixMatch[2]);
    content.append(labelSpan, bodySpan);
  } else {
    content.textContent = raw;
  }

  li.append(bullet, content);
  return li;
}

/**
 * 构建底部等宽可执行代码块与【一键复制】按钮
 */
function buildSnippetBlock(snippet, isFixed) {
  const lang = detectSnippetLang(snippet);

  const outer = el(
    'div',
    [
      'min-w-0 max-w-full overflow-hidden rounded-lg border',
      isFixed
        ? 'border-slate-800/80 bg-[#070B14]/80'
        : 'border-slate-800/95 bg-[#070B14] shadow-inner',
    ].join(' ')
  );
  outer.dataset.snippetBlock = 'true';

  // 终端头部栏
  const header = el(
    'div',
    'flex items-center justify-between gap-2 border-b border-slate-800/90 bg-slate-900/80 px-3 py-1.5 min-w-0 max-w-full'
  );

  const headerLeft = el('div', 'flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden');
  const termIcon = el('span', 'text-emerald-400/80 shrink-0');
  termIcon.appendChild(createSvgIcon('terminal', 'w-3.5 h-3.5'));
  const titleLabel = el(
    'span',
    'font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-400 truncate',
    'ACTION SNIPPET'
  );
  const langPill = el(
    'span',
    'hidden sm:inline-flex shrink-0 rounded bg-slate-800/90 px-1.5 py-0.5 font-mono text-[9px] font-medium uppercase tracking-wider text-slate-400 border border-slate-700/70',
    lang
  );
  headerLeft.append(termIcon, titleLabel, langPill);

  // 一键复制按钮
  const copyBtnBaseClass =
    'shrink-0 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-[11px] font-medium transition-all duration-150 cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500/40 active:scale-[0.98]';
  const copyBtnIdleClass =
    'border-slate-700/90 bg-slate-800/90 text-slate-200 hover:border-emerald-500/60 hover:bg-emerald-500/15 hover:text-emerald-300';
  const copyBtnSuccessClass =
    'border-emerald-500/70 bg-emerald-500/20 text-emerald-300 shadow-[0_0_12px_-3px_rgba(16,185,129,0.55)]';

  const copyBtn = el('button', `${copyBtnBaseClass} ${copyBtnIdleClass}`);
  copyBtn.type = 'button';
  copyBtn.setAttribute('data-copy-btn', '');
  copyBtn.setAttribute('aria-label', '一键复制可执行片段');

  const renderCopyBtnState = (copied) => {
    copyBtn.replaceChildren();
    if (copied) {
      copyBtn.className = `${copyBtnBaseClass} ${copyBtnSuccessClass}`;
      copyBtn.dataset.copied = 'true';
      copyBtn.append(
        createSvgIcon('check', 'w-3.5 h-3.5 shrink-0'),
        el('span', '', '已复制 ✓')
      );
    } else {
      copyBtn.className = `${copyBtnBaseClass} ${copyBtnIdleClass}`;
      delete copyBtn.dataset.copied;
      copyBtn.append(
        createSvgIcon('copy', 'w-3.5 h-3.5 shrink-0'),
        el('span', '', '一键复制')
      );
    }
  };

  renderCopyBtnState(false);

  let resetTimer = null;
  copyBtn.addEventListener('click', async () => {
    const ok = await copyTextToClipboard(snippet);
    if (ok) {
      renderCopyBtnState(true);
      showToast('已复制可执行片段到剪贴板', 'success');
      if (resetTimer) clearTimeout(resetTimer);
      resetTimer = setTimeout(() => {
        renderCopyBtnState(false);
        resetTimer = null;
      }, 2000);
    } else {
      showToast('复制失败，请手动选中代码片段复制', 'error');
    }
  });

  header.append(headerLeft, copyBtn);

  // 代码滚动区：超长单行仅在 <pre> 内部横向滚动，绝不撑破卡片
  const pre = el(
    'pre',
    [
      'w-full max-w-full min-w-0 overflow-x-auto overscroll-x-contain',
      'px-3 py-2.5 text-[12px] leading-relaxed',
      '[scrollbar-width:thin] [scrollbar-color:#334155_transparent]',
      isFixed ? 'text-slate-400' : 'text-emerald-300/95',
    ].join(' ')
  );
  const code = el('code', 'block font-mono whitespace-pre text-left');
  code.textContent = snippet;
  pre.appendChild(code);

  outer.append(header, pre);
  return outer;
}

/**
 * 根据单条符合 schema.json 的 IntelItem 构建高信息密度情报卡片 <article>
 * @param {object} item - 单条情报对象
 * @returns {HTMLElement} <article> DOM 节点
 */
export function createIntelCard(item) {
  const safeItem = item && typeof item === 'object' ? item : {};
  const id = String(safeItem.id ?? '');
  const date = String(safeItem.date ?? '');
  const typeKey = String(safeItem.type ?? 'HACK').toUpperCase();
  const statusKey = String(safeItem.status ?? 'ACTIVE').toUpperCase();
  const title = String(safeItem.title ?? '');
  const valueTag = String(safeItem.value_tag ?? '');
  const tldr = String(safeItem.tldr ?? '');
  const details = Array.isArray(safeItem.details) ? safeItem.details : [];
  const rawSnippet =
    typeof safeItem.action_snippet === 'string' ? safeItem.action_snippet : '';
  const hasSnippet = rawSnippet.trim().length > 0;
  const sourcePlatform = String(safeItem.source_platform ?? '');
  const safeSourceUrl = sanitizeHttpUrl(safeItem.source_url);

  const typeCfg = TYPE_CONFIG[typeKey] || DEFAULT_TYPE_CONFIG;
  const isUrgent = statusKey === 'URGENT';
  const isFixed = statusKey === 'FIXED';

  // 1. 卡片外框（强制 min-w-0 max-w-full overflow-hidden 防止 375px 溢出）
  const cardSurfaceClass = isFixed
    ? 'bg-[#0f1523]/75 border-slate-800/75 opacity-75 hover:opacity-90 hover:border-slate-700/90'
    : isUrgent
      ? 'bg-[#111827]/90 border-amber-500/35 hover:border-amber-400/65 shadow-[0_10px_30px_-14px_rgba(245,158,11,0.22)] hover:shadow-[0_12px_34px_-12px_rgba(245,158,11,0.32)]'
      : `bg-[#111827]/90 border-slate-800/90 ${typeCfg.hoverBorderClass} shadow-[0_10px_28px_-16px_rgba(0,0,0,0.75)] hover:bg-[#131c2e]/95`;

  const article = el(
    'article',
    `group relative flex flex-col min-w-0 max-w-full overflow-hidden rounded-xl border transition-all duration-200 ${cardSurfaceClass}`
  );
  article.dataset.intelId = id;
  article.dataset.intelType = typeKey;
  article.dataset.intelStatus = statusKey;

  // 顶部 2px 霓虹能量条
  const topAccentClass = isFixed
    ? 'from-slate-600/50 via-slate-700/20 to-transparent'
    : isUrgent
      ? 'from-amber-400/90 via-amber-500/45 to-transparent'
      : typeCfg.topBarClass;
  const topAccent = el(
    'div',
    `h-[2px] w-full shrink-0 bg-gradient-to-r ${topAccentClass}`
  );
  topAccent.setAttribute('aria-hidden', 'true');

  // 卡片内部内容容器
  const inner = el(
    'div',
    'flex flex-1 flex-col gap-3.5 p-4 sm:p-5 min-w-0 max-w-full overflow-hidden'
  );

  // 2. 顶部元信息栏：左上状态灯 + 类型徽标 + 日期 | 右上高亮价值胶囊
  const topRow = el(
    'header',
    'flex items-start justify-between gap-2.5 min-w-0 max-w-full'
  );

  const metaLeft = el(
    'div',
    'flex flex-wrap items-center gap-1.5 min-w-0 flex-1'
  );
  metaLeft.appendChild(buildStatusBadge(statusKey));

  const typeBadge = el(
    'span',
    `inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider leading-none shrink-0 ${
      isFixed
        ? 'border-slate-700/80 bg-slate-800/70 text-slate-400'
        : typeCfg.badgeClass
    }`,
    typeCfg.label
  );
  metaLeft.appendChild(typeBadge);

  if (date) {
    const timeEl = el(
      'time',
      'font-mono text-[11px] text-slate-500 tabular-nums shrink-0',
      date
    );
    timeEl.setAttribute('datetime', date);
    metaLeft.appendChild(timeEl);
  }

  topRow.appendChild(metaLeft);

  if (valueTag) {
    const valueCapsuleClass = isFixed
      ? 'border-slate-700/80 bg-slate-800/70 text-slate-400 line-through decoration-slate-500/70'
      : isUrgent
        ? 'border-amber-400/60 bg-amber-400/15 text-amber-200 shadow-[0_0_16px_-4px_rgba(245,158,11,0.55)]'
        : typeCfg.valuePillClass;

    const valueCapsule = el(
      'span',
      `shrink-0 max-w-[48%] sm:max-w-[55%] truncate inline-block rounded-full border px-2.5 py-1 font-mono text-[11px] sm:text-xs font-bold leading-none tracking-tight ${valueCapsuleClass}`,
      valueTag
    );
    valueCapsule.title = valueTag;
    valueCapsule.dataset.valueTag = valueTag;
    topRow.appendChild(valueCapsule);
  }

  // 3. 中部核心信息区：标题 + 省流 TL;DR + 要点列表
  const body = el('div', 'flex flex-col gap-3 min-w-0 max-w-full');

  const heading = el(
    'h3',
    isFixed
      ? 'text-[16px] sm:text-[17px] font-semibold leading-snug tracking-tight text-slate-400 line-through decoration-slate-500/80 break-words [overflow-wrap:anywhere]'
      : 'text-[16px] sm:text-[17px] font-bold leading-snug tracking-tight text-slate-50 group-hover:text-white transition-colors break-words [overflow-wrap:anywhere]',
    title
  );
  body.appendChild(heading);

  if (tldr) {
    const tldrBox = el(
      'div',
      `min-w-0 max-w-full rounded-r-lg border-l-2 bg-[#0B0F19]/85 px-3 py-2.5 ${
        isFixed
          ? 'border-slate-600/80'
          : isUrgent
            ? 'border-amber-400/85'
            : typeCfg.tldrBorderClass
      }`
    );

    const tldrParagraph = el(
      'p',
      `text-[13.5px] leading-relaxed break-words [overflow-wrap:anywhere] ${
        isFixed ? 'font-medium text-slate-400' : 'font-semibold text-slate-100'
      }`
    );

    const tldrTag = el(
      'span',
      `inline-block mr-1.5 align-baseline rounded border px-1.5 py-[1px] font-mono text-[10px] font-bold uppercase tracking-wider ${
        isFixed
          ? 'border-slate-700 bg-slate-800/80 text-slate-400'
          : isUrgent
            ? 'border-amber-500/35 bg-amber-500/15 text-amber-300'
            : typeCfg.tldrTagClass
      }`,
      'TL;DR'
    );

    const tldrText = el('span', '', tldr);
    tldrParagraph.append(tldrTag, tldrText);
    tldrBox.appendChild(tldrParagraph);
    body.appendChild(tldrBox);
  }

  if (details.length > 0) {
    const list = el('ul', 'space-y-1.5 min-w-0 max-w-full');
    const bulletTone = isUrgent ? 'text-amber-400/85' : typeCfg.bulletClass;
    for (const entry of details) {
      if (typeof entry !== 'string' || !entry.trim()) continue;
      list.appendChild(buildDetailItem(entry, bulletTone, isFixed));
    }
    if (list.children.length > 0) {
      body.appendChild(list);
    }
  }

  // 4. 底部锚定区：可选可执行代码块 + 来源底栏（保证多列网格卡片底部齐平）
  const bottomStack = el('div', 'mt-auto flex flex-col gap-3 pt-1 min-w-0 max-w-full');

  if (hasSnippet) {
    bottomStack.appendChild(buildSnippetBlock(rawSnippet, isFixed));
  }

  const footer = el(
    'footer',
    'flex items-center justify-between gap-2 border-t border-slate-800/80 pt-3 min-w-0 max-w-full'
  );

  const idLabel = el(
    'span',
    'font-mono text-[11px] text-slate-500 truncate min-w-0',
    id || '--'
  );
  idLabel.title = id;

  const sourceWrap = el(
    'div',
    'flex items-center gap-1.5 shrink-0 max-w-[68%] min-w-0'
  );

  if (sourcePlatform) {
    const platformEl = el(
      'span',
      'text-[11px] text-slate-400 truncate min-w-0',
      sourcePlatform
    );
    platformEl.title = sourcePlatform;
    sourceWrap.appendChild(platformEl);
  }

  if (sourcePlatform && safeSourceUrl) {
    const sep = el('span', 'text-slate-700 select-none shrink-0', '·');
    sep.setAttribute('aria-hidden', 'true');
    sourceWrap.appendChild(sep);
  }

  if (safeSourceUrl) {
    const link = el(
      'a',
      'shrink-0 inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 font-mono text-[11px] font-medium text-cyan-400 transition-colors hover:bg-cyan-500/10 hover:text-cyan-300 focus:outline-none focus:ring-1 focus:ring-cyan-400/50',
      '原文 ↗'
    );
    link.href = safeSourceUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute(
      'aria-label',
      `打开原始来源：${sourcePlatform || safeSourceUrl}`
    );
    sourceWrap.appendChild(link);
  } else if (safeItem.source_url) {
    const invalidLabel = el(
      'span',
      'shrink-0 font-mono text-[11px] text-slate-600',
      '链接无效'
    );
    sourceWrap.appendChild(invalidLabel);
  }

  footer.append(idLabel, sourceWrap);
  bottomStack.appendChild(footer);

  inner.append(topRow, body, bottomStack);
  article.append(topAccent, inner);
  return article;
}

/**
 * 清空容器并通过 DocumentFragment 批量渲染全部情报卡片
 * @param {HTMLElement} container - 列表容器（如 #intel-feed）
 * @param {Array<object>} items - 情报数组
 * @returns {number} 实际渲染卡片数
 */
export function renderIntelCards(container, items) {
  if (!container || typeof container.appendChild !== 'function') {
    return 0;
  }

  if (typeof container.replaceChildren === 'function') {
    container.replaceChildren();
  } else {
    container.textContent = '';
  }

  if (!Array.isArray(items) || items.length === 0) {
    return 0;
  }

  const fragment = document.createDocumentFragment();
  let rendered = 0;

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    fragment.appendChild(createIntelCard(item));
    rendered += 1;
  }

  container.appendChild(fragment);
  return rendered;
}
