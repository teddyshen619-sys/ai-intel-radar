/**
 * AI Intel Radar — Google DeepMind & Apple Newsroom Editorial Components
 * Front face: Radical stillness (only Vendor anchor + Light-weight Display Title + Regular Summary).
 * Reader: Full structured briefing, metrics, code snippet with one-click copy, and source link.
 * Pure ES6 Module · Zero external dependencies · Strict textContent / createElementNS (XSS-safe) · Zero Emojis
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
const TOAST_CONTAINER_ID = 'toast-container';
const TOAST_DURATION_MS = 2400;
const TOAST_FADE_MS = 220;
const MAX_ACTIVE_TOASTS = 4;

const CHANNEL_META = {
  RADAR: '算力与避坑',
  INTEL: '厂商情报站',
  REVIEW: '测评与视频',
};

const TYPE_META = {
  BENCHMARK: { label: '深度评测' },
  VIDEO: { label: '视频拆解' },
  DEAL: { label: '算力羊毛' },
  BUG: { label: '漏洞避坑' },
  HACK: { label: '极客技巧' },
  MODEL: { label: '新模型' },
  PRODUCT: { label: '新产品' },
  POLICY: { label: '新条款与定价' },
};

const STATUS_META = {
  URGENT: {
    label: '紧急',
    dotClass: 'bg-[#D93025] dark:bg-[#FF453A]',
    textClass: 'text-[#C5221F] dark:text-[#FF6961]',
    strikethrough: false,
  },
  ACTIVE: {
    label: '当前有效',
    dotClass: 'bg-[#188038] dark:bg-[#30D158]',
    textClass: 'text-[#188038] dark:text-[#30D158]',
    strikethrough: false,
  },
  FIXED: {
    label: '已归档',
    dotClass: 'bg-[#86868B] dark:bg-[#636366]',
    textClass: 'text-[#6E6E73] dark:text-[#8E8E93]',
    strikethrough: true,
  },
};

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
}

function formatEditorialDate(dateStr, { includeYear = false } = {}) {
  const raw = String(dateStr ?? '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return raw;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return includeYear ? `${year}年${month}月${day}日` : `${month}月${day}日`;
}

function createSvgIcon(kind, className = 'w-3.5 h-3.5 shrink-0') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.75');
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
    case 'bookmark':
      addShape('path', { d: 'M6 3h12v18l-6-4-6 4z' });
      break;
    case 'copy':
      addShape('rect', { x: '9', y: '9', width: '13', height: '13', rx: '1', ry: '1' });
      addShape('path', { d: 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1' });
      break;
    case 'check':
      addShape('polyline', { points: '20 6 9 17 4 12' });
      break;
    case 'close':
      addShape('line', { x1: '18', y1: '6', x2: '6', y2: '18' });
      addShape('line', { x1: '6', y1: '6', x2: '18', y2: '18' });
      break;
    case 'external':
      addShape('path', { d: 'M7 17L17 7' });
      addShape('polyline', { points: '9 7 17 7 17 15' });
      break;
    default:
      addShape('circle', { cx: '12', cy: '12', r: '9' });
      break;
  }

  return svg;
}

/**
 * Restrained Google DeepMind / Apple Keynote inspired geometric optical plate artwork.
 */
function createLeadVisualArtwork(isUrgent) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 420 320');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute(
    'class',
    'pointer-events-none absolute inset-0 h-full w-full select-none'
  );

  const strokePrimary = isUrgent
    ? 'text-[#C5221F] dark:text-[#FF6961]'
    : 'text-[#0066CC] dark:text-[#2997FF]';
  const strokeNeutral = 'text-[#1D1D1F] dark:text-[#F5F5F7]';

  const add = (tag, attrs, cls = '') => {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) {
      node.setAttribute(k, v);
    }
    if (cls) node.setAttribute('class', cls);
    svg.appendChild(node);
  };

  for (const x of [104, 208, 312]) {
    add(
      'line',
      {
        x1: String(x),
        y1: '0',
        x2: String(x),
        y2: '320',
        stroke: 'currentColor',
        'stroke-width': '0.75',
        'stroke-opacity': '0.05',
      },
      strokeNeutral
    );
  }
  for (const y of [80, 160, 240]) {
    add(
      'line',
      {
        x1: '0',
        y1: String(y),
        x2: '420',
        y2: String(y),
        stroke: 'currentColor',
        'stroke-width': '0.75',
        'stroke-opacity': '0.05',
      },
      strokeNeutral
    );
  }

  const cx = '348';
  const cy = '68';
  const rings = [
    { r: '56', op: '0.22', w: '1' },
    { r: '112', op: '0.14', w: '1' },
    { r: '172', op: '0.09', w: '1' },
    { r: '236', op: '0.055', w: '1' },
  ];
  for (const ring of rings) {
    add(
      'circle',
      {
        cx,
        cy,
        r: ring.r,
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': ring.w,
        'stroke-opacity': ring.op,
      },
      strokePrimary
    );
  }

  add(
    'circle',
    { cx, cy, r: '3.2', fill: 'currentColor', 'fill-opacity': '0.7' },
    strokePrimary
  );

  return svg;
}

function sanitizeHttpUrl(rawUrl) {
  if (typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  try {
    const base =
      typeof window !== 'undefined' &&
      window.location &&
      /^https?:$/.test(window.location.protocol)
        ? window.location.href
        : 'https://example.invalid/';
    const parsed = new URL(trimmed, base);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.href;
    }
    return '';
  } catch {
    return '';
  }
}

function readableSourceUrl(rawUrl) {
  const raw = String(rawUrl ?? '').trim();
  const url = sanitizeHttpUrl(/^(?:www\.)?openrouter\.ai\//i.test(raw) ? 'https://' + raw : raw);
  if (!url) return '';
  const { hostname, pathname } = new URL(url);
  return /^(?:www\.)?openrouter\.ai$/i.test(hostname) && /^\/api(?:\/|$)/i.test(pathname)
    ? 'https://openrouter.ai/models'
    : url;
}

export function bilibiliSearchUrl(keyword) {
  const url = new URL('https://search.bilibili.com/all');
  url.searchParams.set('keyword', keyword.trim() || 'AI 模型测评');
  return url.href;
}

function videoKeyword(item) {
  const title = String(item.title || '');
  const modelId = title.match(/\b[\w-]+\/([a-z][\w.-]*-[\w.-]+)/i)?.[1];
  if (modelId) return modelId.replace(/-/g, ' ');
  const terms = title.match(/[A-Za-z][A-Za-z0-9.-]*(?: [A-Za-z0-9][A-Za-z0-9.-]*)*/g) || [];
  const subject = terms.find(term => /\d/.test(term)) || terms[0] || title.slice(0, 28);
  const vendor = String(item.vendor || '').trim();
  return !vendor || subject.toLowerCase().includes(vendor.toLowerCase())
    ? subject : [vendor, subject].filter(Boolean).join(' ');
}

export async function copyTextToClipboard(text) {
  const value = String(text ?? '');
  if (!value) return false;

  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function'
  ) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // Fall back to execCommand below
    }
  }

  if (typeof document === 'undefined' || !document.body) {
    return false;
  }

  const previouslyFocused =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '-9999px';
  textarea.style.left = '-9999px';
  textarea.style.opacity = '0';

  document.body.appendChild(textarea);
  let copied = false;

  try {
    textarea.focus({ preventScroll: true });
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  } finally {
    if (textarea.parentNode) textarea.parentNode.removeChild(textarea);
    if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
      try {
        previouslyFocused.focus({ preventScroll: true });
      } catch {
        // Ignore focus restore errors
      }
    }
  }

  return copied;
}

/* ==========================================================================
   Toast Notifications
   ========================================================================== */

function ensureToastContainer() {
  let container = document.getElementById(TOAST_CONTAINER_ID);
  if (!container) {
    container = document.createElement('div');
    container.id = TOAST_CONTAINER_ID;
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-atomic', 'false');
    container.className =
      'pointer-events-none fixed top-[74px] right-5 left-5 sm:left-auto z-50 flex max-w-full sm:max-w-sm flex-col items-end gap-2';
    document.body.appendChild(container);
  }
  return container;
}

export function showToast(message, type = 'info') {
  if (typeof document === 'undefined' || !document.body) return null;

  const container = ensureToastContainer();
  while (container.children.length >= MAX_ACTIVE_TOASTS) {
    container.firstElementChild?.remove();
  }

  const dotColor =
    type === 'success'
      ? 'bg-[#188038] dark:bg-[#30D158]'
      : type === 'warning'
        ? 'bg-[#B25E00] dark:bg-[#FF9F0A]'
        : type === 'error'
          ? 'bg-[#D93025] dark:bg-[#FF453A]'
          : 'bg-[#0066CC] dark:bg-[#2997FF]';

  const toast = el(
    'div',
    [
      'pointer-events-auto flex items-center gap-2.5 border px-4 py-2.5 cursor-pointer select-none',
      'rounded-[2px] border-black/[0.12] bg-white/[0.96] text-[#1D1D1F] shadow-[0_8px_28px_rgba(0,0,0,0.08)]',
      'dark:border-white/[0.14] dark:bg-[#141414]/[0.96] dark:text-[#F5F5F7] dark:shadow-[0_12px_32px_rgba(0,0,0,0.55)]',
      'backdrop-blur-md transition-all duration-200 ease-out opacity-0 translate-y-1',
    ].join(' ')
  );
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
  toast.dataset.toastType = type;

  const dot = el('span', `h-1.5 w-1.5 rounded-full shrink-0 ${dotColor}`);
  dot.setAttribute('aria-hidden', 'true');

  const msgEl = el(
    'span',
    'text-[13px] font-normal leading-snug text-current',
    String(message ?? '')
  );

  toast.append(dot, msgEl);
  container.appendChild(toast);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      toast.classList.remove('opacity-0', 'translate-y-1');
      toast.classList.add('opacity-100', 'translate-y-0');
    });
  });

  let dismissed = false;
  let hideTimer = null;

  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    if (hideTimer) clearTimeout(hideTimer);
    toast.classList.remove('opacity-100', 'translate-y-0');
    toast.classList.add('opacity-0', '-translate-y-1');
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, TOAST_FADE_MS);
  };

  toast.addEventListener('click', dismiss, { once: true });
  hideTimer = setTimeout(dismiss, TOAST_DURATION_MS);

  return toast;
}

/* ==========================================================================
   Editorial Reader (Complete Details, Metrics, Code & Source)
   ========================================================================== */

let readerActions = {};
export function configureReader(actions) {
  readerActions = actions;
}

const GUIDE_TOPICS = {
  network: /网络|联网|连通|连接失败|无法连接|代理|地区限制|地域限制|区域限制|不支持的(?:国家|地区)|\b(?:network|proxy|vpn|dns|ip)\b/i,
  payment: /支付|付款|信用卡|银行卡|借记卡|虚拟卡|外币卡|海外卡|充值|账单|扣款|续费|订阅|\b(?:visa|mastercard|payment|billing|subscription)\b/i,
  agent: /智能体|命令行|\b(?:agents?|cli|codex)\b|\bclaude[\s-]*code\b/i,
};
const GUIDE_PRACTICE = /实战|实践|教程|指南|入门|上手|安装|配置|搭建|部署|工作流|脚本|命令|\b(?:tutorial|guide|setup|install|configure|workflow|hands-on)\b/i;
const GUIDE_AGENT_TOOLS = [/\bcodex\b/i, /\bclaude[\s-]*code\b/i, /\bgemini[\s-]*cli\b/i];
const GUIDE_ACCOUNT_RISK = /风控|封号|封禁|(?:账号|账户).{0,8}(?:异常|风险|受限|限制|验证)|\b(?:account (?:risk|ban|suspension)|suspended|banned)\b/i;
const GUIDE_SUBSCRIPTION_OFFER = /优惠|折扣|促销|限免|试用|会员|\b(?:discount|offer|trial|promotion)\b/i;

// Earlier fields always outrank later ones; a payment lesson mentioning networks stays a payment lesson.
function guideTopicRank(pattern, fields) {
  const index = fields.findIndex(text => pattern.test(text));
  return index < 0 ? 0 : fields.length - index;
}

function guideAgentTools(fields) {
  return fields.map(text => GUIDE_AGENT_TOOLS.filter(pattern => pattern.test(text)))
    .find(tools => tools.length) || [];
}

function matchReaderGuide(item) {
  if (typeof readerActions.getGuides !== 'function' || typeof readerActions.openGuides !== 'function') return null;
  const guides = readerActions.getGuides();
  if (!Array.isArray(guides) || !guides.length) return null;

  const fields = [
    String(item.title ?? ''),
    String(item.tldr ?? ''),
    [...(Array.isArray(item.details) ? item.details : []), item.action_snippet || ''].join('\n'),
  ];
  const text = [item.vendor, ...fields].join('\n');
  const basicType = ['DEAL', 'POLICY', 'BUG'].includes(String(item.type ?? '').trim().toUpperCase());
  const overseasVendor = /\b(?:openai|google|anthropic|chatgpt|gemini|claude|perplexity)\b/i.test(text);
  const networkRank = Math.max(
    guideTopicRank(GUIDE_TOPICS.network, fields) * 2,
    guideTopicRank(GUIDE_ACCOUNT_RISK, fields) * 2 - 1
  );
  const paymentRank = Math.max(
    guideTopicRank(GUIDE_TOPICS.payment, fields) * 2,
    guideTopicRank(GUIDE_SUBSCRIPTION_OFFER, fields) * 2 - 1
  );
  let topic;
  if (basicType && overseasVendor && Math.max(networkRank, paymentRank) > 0) {
    topic = networkRank >= paymentRank ? 'network' : 'payment';
  } else if (GUIDE_TOPICS.agent.test(fields.slice(0, 2).join('\n')) && GUIDE_PRACTICE.test(fields.join('\n'))) {
    topic = 'agent';
  } else {
    return null;
  }

  const itemTools = topic === 'agent' ? guideAgentTools(fields) : [];
  let best = null;
  let bestRank = 0;
  for (const guide of guides) {
    if (!guide || typeof guide.id !== 'string' || !guide.id.trim()) continue;
    const guideFields = [
      String(guide.title ?? ''),
      String(guide.summary ?? ''),
      (Array.isArray(guide.steps) ? guide.steps : [])
        .map(step => [step?.title, step?.markdown].filter(Boolean).join('\n')).join('\n'),
      guide.id,
    ];
    const ranks = Object.fromEntries(Object.entries(GUIDE_TOPICS)
      .map(([key, pattern]) => [key, guideTopicRank(pattern, guideFields)]));
    let rank = ranks[topic];
    if (!rank || rank < Math.max(...Object.values(ranks))) continue;
    if (topic === 'agent') {
      if (!GUIDE_PRACTICE.test(guideFields.slice(0, 3).join('\n'))) continue;
      const tools = guideAgentTools(guideFields);
      const sameTool = itemTools.some(tool => tools.includes(tool));
      if (itemTools.length && tools.length && !sameTool) continue;
      if (sameTool) rank += guideFields.length;
    }
    if (rank > bestRank) {
      best = { id: guide.id, topic };
      bestRank = rank;
    }
  }
  return best;
}

function buildReaderGuideLink(item) {
  const guide = matchReaderGuide(item);
  if (!guide) return null;
  const label = guide.topic === 'agent'
    ? '动手用 Agent？查看实战教程 →'
    : guide.topic === 'network' ? '网络有疑问？查看实战教程 →' : '支付有疑问？查看实战教程 →';
  const link = el('a', 'reader-guide-link', label);
  link.href = '?' + new URLSearchParams({ channel: 'GUIDES', guide: guide.id });
  link.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    readerActions.openGuides(guide.id);
  });
  return link;
}

export function itemMarkdown(item) {
  const source = readableSourceUrl(item.source_url);
  return [
    '## ' + item.title,
    [item.date, item.vendor, item.metric_badge].filter(Boolean).join(' · '),
    item.tldr,
    (item.details || []).map(detail => '- ' + detail).join('\n'),
    source && '[原文 · ' + item.source_platform + '](<' + source + '>)'
  ].filter(Boolean).join('\n\n');
}

function buildReaderSnippetBlock(snippet) {
  const outer = el(
    'div',
    'min-w-0 max-w-full overflow-hidden border border-black/[0.09] bg-[#F5F5F7] dark:border-white/[0.11] dark:bg-[#121212]'
  );
  outer.dataset.snippetBlock = 'true';

  const header = el(
    'div',
    'flex items-center justify-between gap-3 border-b border-black/[0.07] px-4 py-2.5 dark:border-white/[0.09]'
  );

  const label = el(
    'span',
    'text-[12px] text-[#6E6E73] dark:text-[#8E8E93]',
    '可执行片段与配置'
  );

  const copyBtn = el(
    'button',
    'inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[#0066CC] hover:opacity-70 dark:text-[#2997FF] transition-opacity cursor-pointer focus:outline-none shrink-0'
  );
  copyBtn.type = 'button';
  copyBtn.setAttribute('data-copy-btn', '');
  copyBtn.setAttribute('aria-label', '一键复制代码片段');

  const renderCopyState = (copied) => {
    copyBtn.replaceChildren();
    if (copied) {
      copyBtn.dataset.copied = 'true';
      copyBtn.append(
        createSvgIcon('check', 'w-3.5 h-3.5 shrink-0'),
        el('span', '', '已复制')
      );
    } else {
      delete copyBtn.dataset.copied;
      copyBtn.append(
        createSvgIcon('copy', 'w-3.5 h-3.5 shrink-0'),
        el('span', '', '一键复制')
      );
    }
  };

  renderCopyState(false);

  let resetTimer = null;
  copyBtn.addEventListener('click', async () => {
    const ok = await copyTextToClipboard(snippet);
    if (ok) {
      renderCopyState(true);
      showToast('已复制到剪贴板', 'success');
      if (resetTimer) clearTimeout(resetTimer);
      resetTimer = setTimeout(() => {
        renderCopyState(false);
        resetTimer = null;
      }, 2000);
    } else {
      showToast('复制失败，请手动选中复制', 'error');
    }
  });

  header.append(label, copyBtn);

  const pre = el(
    'pre',
    'w-full max-w-full min-w-0 overflow-x-auto px-4 py-3.5 text-[12.5px] leading-[1.68] text-[#1D1D1F] dark:text-[#E5E5EA]'
  );
  const code = el('code', 'block font-mono whitespace-pre text-left');
  code.textContent = snippet;
  pre.appendChild(code);

  outer.append(header, pre);
  return outer;
}

function buildReaderDetailRow(text, idx, isFixed) {
  const li = el('li', 'flex items-start gap-4 min-w-0 max-w-full');

  const num = el(
    'span',
    'mt-[3px] font-mono text-[11.5px] tabular-nums text-[#86868B] dark:text-[#6E6E73] select-none shrink-0',
    String(idx + 1).padStart(2, '0')
  );

  const content = el(
    'p',
    `min-w-0 flex-1 text-[15px] leading-[1.74] break-words [overflow-wrap:anywhere] ${
      isFixed
        ? 'text-[#86868B] dark:text-[#8E8E93]'
        : 'text-[#424245] dark:text-[#D1D1D6]'
    }`
  );

  const raw = String(text ?? '');
  const prefixMatch = raw.match(/^([\u4e00-\u9fa5A-Za-z0-9\s/+-]{2,14}：)\s*(.+)$/);
  if (prefixMatch) {
    const leadSpan = el(
      'span',
      isFixed
        ? 'font-medium text-[#6E6E73] dark:text-[#8E8E93]'
        : 'font-medium text-[#1D1D1F] dark:text-[#F5F5F7]',
      prefixMatch[1]
    );
    const bodySpan = el('span', '', prefixMatch[2]);
    content.append(leadSpan, bodySpan);
  } else {
    content.textContent = raw;
  }

  li.append(num, content);
  return li;
}

export function closeIntelReader(options = {}) {
  readerActions.onClose?.(options);
}

export function openIntelReader(item, triggerEl = null) {
  if (!item || typeof item !== 'object') return;
  const panel = document.getElementById('intel-detail-panel');
  if (!panel) return;
  const date = String(item.date ?? '').trim();
  const channelKey = String(item.channel ?? '').trim().toUpperCase();
  const channelLabel = CHANNEL_META[channelKey] || '';
  const typeKey = String(item.type ?? '').trim().toUpperCase();
  const typeMeta = TYPE_META[typeKey] || { label: typeKey || '动态' };
  const statusKey = String(item.status ?? 'ACTIVE').trim().toUpperCase();
  const statusMeta = STATUS_META[statusKey] || STATUS_META.ACTIVE;
  const isUrgent = statusKey === 'URGENT';
  const isFixed = statusKey === 'FIXED';

  const vendor = String(item.vendor ?? '').trim();
  const impact = String(item.impact ?? '').trim();
  const title = String(item.title ?? '').trim() || '未命名情报';
  const valueTag = String(item.value_tag ?? '').trim();
  const tldr = String(item.tldr ?? '').trim();
  const details = Array.isArray(item.details)
    ? item.details.filter((entry) => typeof entry === 'string' && entry.trim())
    : [];
  const rawSnippet = typeof item.action_snippet === 'string' ? item.action_snippet : '';
  const hasSnippet = rawSnippet.trim().length > 0;
  const sourcePlatform = String(item.source_platform ?? '').trim();
  const safeSourceUrl = readableSourceUrl(item.source_url);

  const shell = el('article', 'guide-lesson-shell intel-reader');
  const topbar = el('div', 'guide-lesson-topbar');
  const back = el('button', 'guide-back-btn', readerActions.backLabel?.() || '← 返回情报列表');
  back.type = 'button';
  back.setAttribute('data-reader-close', '');
  back.addEventListener('click', () => closeIntelReader());
  const bookmark = el('button', 'reader-bookmark');
  bookmark.type = 'button';
  bookmark.dataset.bookmark = item.id;
  topbar.append(back, bookmark);
  const body = el('div', 'reader-body');
  shell.append(topbar, body);

  const frag = document.createDocumentFragment();

  // 1. Quiet status & date metadata
  const eyebrow = el(
    'div',
    'flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px]'
  );
  const statusBadge = el('span', `inline-flex items-center gap-1.5 ${statusMeta.textClass}`);
  const dot = el('span', `h-1.5 w-1.5 rounded-full shrink-0 ${statusMeta.dotClass}`);
  dot.setAttribute('aria-hidden', 'true');
  statusBadge.append(dot, el('span', '', statusMeta.label));
  eyebrow.appendChild(statusBadge);

  for (const label of [channelLabel, typeMeta.label, vendor].filter(Boolean)) {
    const value = el('span', 'reader-meta-part', label);
    if (label === vendor) value.classList.add('font-editorial-vendor');
    eyebrow.append(value);
  }
  if (date) {
    const time = el('time', 'reader-meta-part tabular-nums', formatEditorialDate(date, { includeYear: true }));
    time.dateTime = date;
    eyebrow.append(time);
  }
  frag.appendChild(eyebrow);

  // 2. Refined Light-Weight Display Article Title
  const heading = el(
    'h1',
    'font-editorial-display mt-4 text-[26px] sm:text-[31px] tracking-[-0.024em] leading-[1.24] text-[#1D1D1F] dark:text-[#F5F5F7] break-words [overflow-wrap:anywhere]',
    title
  );
  heading.id = 'intel-detail-title';
  frag.appendChild(heading);
  if (item.metric_badge) frag.append(el('p', 'reader-metric', item.metric_badge));
  const preview = el('div', 'reader-preview');
  appendCover(preview, item);
  if (preview.childElementCount) frag.append(preview);

  // 3. Flat Tonal Value & Audience Strip
  if (valueTag || impact) {
    const summaryBand = el(
      'div',
      'mt-6 grid grid-cols-1 gap-5 bg-[#F5F5F7] px-6 py-5 sm:grid-cols-2 dark:bg-[#111111]'
    );

    if (valueTag) {
      const col = el('div', 'min-w-0');
      col.append(
        el('p', 'text-[11.5px] text-[#86868B] dark:text-[#8E8E93]', '核心价值'),
        el(
          'p',
          `font-editorial-display mt-1.5 text-[22px] tracking-[-0.02em] ${
            isFixed
              ? 'text-[#6E6E73] line-through dark:text-[#8E8E93]'
              : isUrgent
                ? 'text-[#C5221F] dark:text-[#FF6961]'
                : 'text-[#0066CC] dark:text-[#2997FF]'
          }`,
          valueTag
        )
      );
      summaryBand.appendChild(col);
    }

    if (impact) {
      const col = el('div', 'min-w-0');
      col.append(
        el('p', 'text-[11.5px] text-[#86868B] dark:text-[#8E8E93]', '适用对象'),
        el(
          'p',
          'mt-1.5 text-[14.5px] leading-[1.58] text-[#1D1D1F] dark:text-[#F5F5F7] break-words',
          impact
        )
      );
      summaryBand.appendChild(col);
    }

    frag.appendChild(summaryBand);
  }

  // 4. Full Lead Summary
  if (tldr) {
    frag.appendChild(
      el(
        'p',
        'mt-7 max-w-[60ch] text-[15.5px] leading-[1.78] text-[#1D1D1F] dark:text-[#E5E5EA] break-words [overflow-wrap:anywhere]',
        tldr
      )
    );
  }

  // 5. Structured Key Details
  if (details.length > 0) {
    const detailsSection = el(
      'section',
      'mt-8 border-t border-black/[0.08] pt-7 dark:border-white/[0.10]'
    );
    detailsSection.appendChild(
      el(
        'h2',
        'text-[12.5px] tracking-[0.04em] text-[#6E6E73] dark:text-[#8E8E93]',
        '关键要点'
      )
    );

    const list = el('ol', 'mt-5 space-y-4 min-w-0 max-w-full');
    details.forEach((entry, idx) => {
      list.appendChild(buildReaderDetailRow(entry, idx, isFixed));
    });
    detailsSection.appendChild(list);
    frag.appendChild(detailsSection);
  }

  // 6. Executable Action Snippet + One-Click Copy
  if (hasSnippet) {
    const snippetSection = el(
      'section',
      'mt-8 border-t border-black/[0.08] pt-7 dark:border-white/[0.10]'
    );
    snippetSection.appendChild(buildReaderSnippetBlock(rawSnippet));
    frag.appendChild(snippetSection);
  }

  // 7. Clean Source Link Only (Zero archive ID / date micro-text clutter)
  if (safeSourceUrl) {
    const colophon = el(
      'footer',
      'mt-10 border-t border-black/[0.08] pt-6 dark:border-white/[0.10]'
    );

    const link = el(
      'a',
      'inline-flex w-fit items-center gap-1.5 text-[14px] text-[#0066CC] hover:underline underline-offset-4 dark:text-[#2997FF]'
    );
    link.href = safeSourceUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.append(
      el('span', '', sourcePlatform ? `阅读原始来源（${sourcePlatform}）` : '阅读原始来源'),
      createSvgIcon('external', 'w-4 h-4 shrink-0')
    );
    colophon.appendChild(link);
    frag.appendChild(colophon);
  }

  const actions = el('div', 'reader-actions');
  function action(label, handler) {
    const button = el('button', '', label);
    button.type = 'button';
    button.addEventListener('click', handler);
    actions.append(button);
  }
  async function copy(text, label) {
    const ok = await copyTextToClipboard(text);
    showToast(ok ? label : '复制失败，请检查剪贴板权限', ok ? 'success' : 'error');
  }
  action('复制直达链接', () => copy(location.href, '已复制直达链接'));
  action('复制本条 Markdown', () => copy(itemMarkdown(item), '已复制本条 Markdown'));
  action('生成本条速报', () => readerActions.openPoster(item));
  const video = el('a', '', '在 B 站搜相关视频 ↗');
  video.href = bilibiliSearchUrl(videoKeyword(item));
  video.target = '_blank';
  video.rel = 'noopener noreferrer';
  actions.append(video);
  const matched = readerActions.matchVendor?.(item);
  if (matched) {
    const link = el('a', '', '查看该厂商模型实时价格 →');
    const params = new URLSearchParams({ channel: 'MODELS', vendor: matched });
    link.href = '?' + params;
    link.addEventListener('click', event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      readerActions.openPrices(params);
    });
    actions.append(link);
  }
  const guideLink = buildReaderGuideLink(item);
  if (guideLink) actions.append(guideLink);
  frag.append(actions);
  body.append(frag);
  panel.replaceChildren(shell);
  readerActions.onOpen?.(item, triggerEl);
  back.focus({ preventScroll: true });
}

/* ==========================================================================
   Front-Face Editorial Surfaces (Zero Noise: Quiet Anchor + Light Display Title + Summary)
   ========================================================================== */

/**
 * Precision technical mono anchor for vendor names (distinct from serif nav, light display titles, and sans body).
 */
function buildWhisperAnchor(statusKey, vendor, fallbackLabel, date) {
  const wrap = el(
    'div',
    'flex items-center gap-2 text-[#6E6E73] dark:text-[#8E8E93] min-w-0'
  );

  if (statusKey === 'URGENT') {
    const dot = el('span', 'h-1.5 w-1.5 rounded-full shrink-0 bg-[#D93025] dark:bg-[#FF453A]');
    dot.setAttribute('aria-hidden', 'true');
    wrap.appendChild(dot);
  }

  const label = vendor || fallbackLabel;
  const vendorSpan = el('span', 'font-editorial-vendor truncate', label);
  wrap.appendChild(vendorSpan);
  if (date) {
    const time = el('time', 'story-date', date);
    time.dateTime = date;
    wrap.append(el('span', 'story-date', '·'), time);
  }

  if (statusKey === 'FIXED') {
    wrap.append(
      el('span', 'text-[11px] text-black/25 dark:text-white/25 select-none', '·'),
      el('span', 'text-[11.5px] text-[#86868B] dark:text-[#6E6E73] shrink-0', '已归档')
    );
  }

  return wrap;
}

function attachCardInteraction(article, item, title) {
  const heading = article.querySelector('h2, h3');
  const trigger = el('button', 'story-title-button', title);
  trigger.type = 'button';
  trigger.setAttribute('aria-controls', 'intel-detail-panel');
  heading.replaceChildren(trigger);
  trigger.addEventListener('click', () => openIntelReader(item, trigger));
  article.addEventListener('click', event => {
    if (event.target.closest('a, button') || String(window.getSelection()).trim()) return;
    openIntelReader(item, trigger);
  });
}

/**
 * Primary Flagship Lead Feature (#1 Spotlight — Google DeepMind / Apple Hero Composition)
 */
function createPrimaryLeadFeature(item) {
  const safeItem = item && typeof item === 'object' ? item : {};
  const id = String(safeItem.id ?? '').trim();
  const typeKey = String(safeItem.type ?? 'HACK').trim().toUpperCase();
  const typeMeta = TYPE_META[typeKey] || { label: typeKey };
  const statusKey = String(safeItem.status ?? 'ACTIVE').trim().toUpperCase();
  const isUrgent = statusKey === 'URGENT';
  const isFixed = statusKey === 'FIXED';
  const vendor = String(safeItem.vendor ?? '').trim();
  const title = String(safeItem.title ?? '').trim() || '未命名情报';
  const valueTag = String(safeItem.value_tag ?? '').trim();
  const tldr = String(safeItem.tldr ?? '').trim();

  const article = el(
    'article',
    'editorial-lead-surface grid grid-cols-1 lg:grid-cols-12 cursor-pointer min-w-0 max-w-full'
  );
  article.dataset.intelId = id;
  article.dataset.type = typeKey;
  article.dataset.status = statusKey;
  article.dataset.variant = 'headline-primary';

  // Left 7 Columns: Pure Light-Weight Display Headline + Clean Summary (Zero Extra Annotations)
  const copyCol = el(
    'div',
    'lg:col-span-7 flex flex-col justify-center p-8 sm:p-11 lg:p-14 min-w-0 max-w-full'
  );

  copyCol.appendChild(buildWhisperAnchor(statusKey, vendor, typeMeta.label, safeItem.date));

  copyCol.appendChild(
    el(
      'h2',
      'font-editorial-display editorial-headline-text mt-4 max-w-[24ch] text-[28px] sm:text-[34px] lg:text-[38px] tracking-[-0.026em] leading-[1.2] text-[#1D1D1F] dark:text-[#F5F5F7] break-words [overflow-wrap:anywhere]',
      title
    )
  );

  if (tldr) {
    copyCol.appendChild(
      el(
        'p',
        'mt-5 max-w-[54ch] clamp-3 text-[15px] sm:text-[15.5px] leading-[1.72] text-[#515154] dark:text-[#A1A1A6] break-words [overflow-wrap:anywhere]',
        tldr
      )
    );
  }

  // Right 5 Columns: Serene Geometric Optical Plate + Single Sculptural UltraLight Value Monument
  const visualCol = el(
    'div',
    'editorial-lead-plate lg:col-span-5 flex items-center p-8 sm:p-10 lg:p-12 min-h-[180px] sm:min-h-[220px] lg:min-h-[340px] min-w-0 max-w-full'
  );
  visualCol.dataset.tone = isUrgent ? 'urgent' : 'focus';
  visualCol.appendChild(createLeadVisualArtwork(isUrgent));

  const monument = el(
    'p',
    `font-editorial-ultralight relative z-10 text-[32px] sm:text-[38px] lg:text-[42px] tracking-[-0.03em] leading-[1.18] [text-wrap:balance] break-words ${
      isFixed
        ? 'text-[#6E6E73] line-through'
        : isUrgent
          ? 'text-[#C5221F] dark:text-[#FF6961]'
          : 'text-[#1D1D1F] dark:text-[#F5F5F7]'
    }`,
    valueTag || vendor || typeMeta.label
  );
  visualCol.appendChild(monument);

  article.append(copyCol, visualCol);
  return article;
}

/**
 * Secondary Spotlight (#2 — Asymmetric Full-Width Editorial Feature Band)
 */
function createSecondaryLeadFeature(item) {
  const safeItem = item && typeof item === 'object' ? item : {};
  const id = String(safeItem.id ?? '').trim();
  const typeKey = String(safeItem.type ?? 'HACK').trim().toUpperCase();
  const typeMeta = TYPE_META[typeKey] || { label: typeKey };
  const statusKey = String(safeItem.status ?? 'ACTIVE').trim().toUpperCase();
  const isUrgent = statusKey === 'URGENT';
  const isFixed = statusKey === 'FIXED';
  const vendor = String(safeItem.vendor ?? '').trim();
  const title = String(safeItem.title ?? '').trim() || '未命名情报';
  const valueTag = String(safeItem.value_tag ?? '').trim();
  const tldr = String(safeItem.tldr ?? '').trim();

  const article = el(
    'article',
    'editorial-secondary-lead grid grid-cols-1 lg:grid-cols-12 items-center gap-6 lg:gap-10 p-8 sm:p-10 lg:px-14 lg:py-11 cursor-pointer min-w-0 max-w-full'
  );
  article.dataset.intelId = id;
  article.dataset.type = typeKey;
  article.dataset.status = statusKey;
  article.dataset.variant = 'headline-secondary';

  const leftCol = el('div', 'lg:col-span-8 min-w-0 max-w-full');
  leftCol.appendChild(buildWhisperAnchor(statusKey, vendor, typeMeta.label, safeItem.date));

  leftCol.appendChild(
    el(
      'h3',
      'font-editorial-display editorial-headline-text mt-3.5 max-w-[32ch] text-[23px] sm:text-[27px] lg:text-[29px] tracking-[-0.022em] leading-[1.26] text-[#1D1D1F] dark:text-[#F5F5F7] break-words [overflow-wrap:anywhere]',
      title
    )
  );

  if (tldr) {
    leftCol.appendChild(
      el(
        'p',
        'mt-3.5 max-w-[58ch] clamp-2 text-[14.5px] sm:text-[15px] leading-[1.7] text-[#515154] dark:text-[#A1A1A6] break-words [overflow-wrap:anywhere]',
        tldr
      )
    );
  }

  const rightCol = el(
    'div',
    'lg:col-span-4 border-t border-black/[0.07] pt-5 dark:border-white/[0.09] lg:border-t-0 lg:pt-0 lg:border-l lg:pl-10 flex items-center min-w-0 max-w-full'
  );

  rightCol.appendChild(
    el(
      'p',
      `font-editorial-display text-[24px] sm:text-[28px] lg:text-[30px] tracking-[-0.026em] leading-[1.2] [text-wrap:balance] ${
        isFixed
          ? 'text-[#86868B] line-through'
          : isUrgent
            ? 'text-[#C5221F] dark:text-[#FF6961]'
            : 'text-[#0066CC] dark:text-[#2997FF]'
      }`,
      valueTag || typeMeta.label
    )
  );

  article.append(leftCol, rightCol);
  return article;
}

/**
 * Standard Editorial Tile — Pure Stillness: Quiet Vendor + Light Display Title + 2-Line Summary
 */
function buildEditorialCard(item, options = {}) {
  const opts = options && typeof options === 'object' ? options : {};
  if (opts.variant === 'headline-primary') {
    return createPrimaryLeadFeature(item);
  }
  if (opts.variant === 'headline-secondary') {
    return createSecondaryLeadFeature(item);
  }

  const safeItem = item && typeof item === 'object' ? item : {};
  const id = String(safeItem.id ?? '').trim();
  const typeKey = String(safeItem.type ?? 'HACK').trim().toUpperCase();
  const typeMeta = TYPE_META[typeKey] || { label: typeKey };
  const statusKey = String(safeItem.status ?? 'ACTIVE').trim().toUpperCase();
  const isFixed = statusKey === 'FIXED';
  const vendor = String(safeItem.vendor ?? '').trim();
  const title = String(safeItem.title ?? '').trim() || '未命名情报';
  const tldr = String(safeItem.tldr ?? '').trim();

  const article = el(
    'article',
    'editorial-tile flex flex-col justify-start p-8 sm:p-10 cursor-pointer min-w-0 max-w-full'
  );
  article.dataset.intelId = id;
  article.dataset.type = typeKey;
  article.dataset.status = statusKey;
  article.dataset.variant = 'standard';

  article.appendChild(buildWhisperAnchor(statusKey, vendor, typeMeta.label, safeItem.date));

  article.appendChild(
    el(
      'h3',
      isFixed
        ? 'font-editorial-display editorial-headline-text mt-3.5 text-[21px] sm:text-[23px] leading-[1.34] tracking-[-0.018em] text-[#6E6E73] line-through decoration-black/25 dark:text-[#8E8E93] dark:decoration-white/25 break-words [overflow-wrap:anywhere]'
        : 'font-editorial-display editorial-headline-text mt-3.5 text-[21px] sm:text-[23px] leading-[1.34] tracking-[-0.018em] text-[#1D1D1F] dark:text-[#F5F5F7] break-words [overflow-wrap:anywhere]',
      title
    )
  );

  if (tldr) {
    article.appendChild(
      el(
        'p',
        `mt-3.5 max-w-[54ch] clamp-2 text-[14.5px] leading-[1.7] break-words [overflow-wrap:anywhere] ${
          isFixed
            ? 'text-[#86868B] dark:text-[#8E8E93]'
            : 'text-[#515154] dark:text-[#A1A1A6]'
        }`,
        tldr
      )
    );
  }

  return article;
}


function appendCover(parent, item) {
  const url = sanitizeHttpUrl(item.media_url);
  if (!url) return;
  const image = el('img', 'review-cover');
  image.alt = '';
  image.loading = 'lazy';
  image.addEventListener('error', () => image.remove(), { once: true });
  image.src = url;
  parent.prepend(image);
}

export function createIntelCard(item, options = {}) {
  const brief = options.variant === 'brief';
  let article;
  if (brief) {
    article = el('article', 'brief-row');
    article.dataset.intelId = item.id;
    const vendor = el('div', 'brief-vendor');
    if (String(item.status ?? '').trim().toUpperCase() === 'URGENT') {
      const dot = el('span', 'brief-urgent-dot');
      dot.setAttribute('aria-label', '紧急');
      dot.setAttribute('role', 'img');
      vendor.append(dot);
    }
    vendor.append(el('span', 'font-editorial-vendor', String(item.vendor ?? '').trim()));
    article.append(el('time', 'brief-date', item.date), vendor, el('h3', 'brief-title', item.title));
  } else {
    // Image-led reviews use the standard editorial layout even in the spotlight.
    const variant = item.channel === 'REVIEW' ? 'standard' : options.variant;
    article = buildEditorialCard(item, { variant });
    appendCover(article, item);
  }

  const actions = el('div', 'story-actions');
  if (item.metric_badge) actions.append(el('span', 'story-metric', item.metric_badge));
  const url = readableSourceUrl(item.source_url);
  if (url && item.channel === 'REVIEW') {
    const link = el('a', 'story-link', item.type === 'VIDEO' ? '观看原视频' : '阅读原评测');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    actions.append(link);
  }
  const bookmark = el('button', 'bookmark');
  bookmark.type = 'button';
  bookmark.dataset.bookmark = item.id;
  bookmark.setAttribute('aria-pressed', String(options.saved?.has(item.id) || false));
  bookmark.setAttribute('aria-label', '收藏：' + item.title);
  bookmark.append(createSvgIcon('bookmark', 'bookmark-icon'));
  actions.append(bookmark);
  const copyColumn = article.dataset.variant === 'headline-primary' || article.dataset.variant === 'headline-secondary'
    ? article.firstElementChild : article;
  copyColumn.append(actions);
  attachCardInteraction(article, item, item.title);
  return article;
}

export function renderIntelCards(container, items, options = {}) {
  if (!container || typeof container.appendChild !== 'function') return 0;

  if (typeof container.replaceChildren === 'function') {
    container.replaceChildren();
  } else {
    container.textContent = '';
  }

  if (!Array.isArray(items) || items.length === 0) return 0;

  const cardOptions =
    options && typeof options === 'object'
      ? { variant: 'standard', ...options }
      : { variant: 'standard' };

  const fragment = document.createDocumentFragment();
  let rendered = 0;

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    fragment.appendChild(createIntelCard(item, cardOptions));
    rendered += 1;
  }

  container.appendChild(fragment);
  return rendered;
}

export function renderHeadlineCards(container, items, options = {}) {
  if (!container || typeof container.appendChild !== 'function') return 0;

  if (typeof container.replaceChildren === 'function') {
    container.replaceChildren();
  } else {
    container.textContent = '';
  }

  const validItems = Array.isArray(items)
    ? items.filter((item) => item && typeof item === 'object').slice(0, 2)
    : [];

  container.dataset.headlineCount = String(validItems.length);
  if (validItems.length === 0) return 0;

  const fragment = document.createDocumentFragment();
  validItems.forEach((item, index) => {
    const variant = index === 0 ? 'headline-primary' : 'headline-secondary';
    fragment.appendChild(createIntelCard(item, { ...options, variant }));
  });

  container.appendChild(fragment);
  return validItems.length;
}
