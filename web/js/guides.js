/**
 * 前哨 Radar V4.1 — 实战教程（Agent 学院）交互模块
 * 交互流：教学主页（Course Hub）→ 单步闯关引导（Step-by-Step Walkthrough / 全文预览）→ 完成返回教学主页
 * 原生 ES6 Module · 零外部依赖 · 全程安全 DOM API + textContent · 零 Emoji
 */

import { copyTextToClipboard } from './card.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const COMPLETED_STORAGE_KEY = 'ai-intel-guides-done-v1';
const STEP_PROGRESS_STORAGE_KEY = 'ai-intel-guides-progress-v1';

const GUIDE_DATA_CANDIDATES = [
  { url: './data/guides.json', source: 'web-data' },
  { url: '../data/guides.json', source: 'root-data' },
];

const OFFLINE_GUIDES_PAYLOAD = {
  schema_version: '4.0',
  guides: [],
};

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
}

function createSvgIcon(kind, className = 'w-3.5 h-3.5 shrink-0') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
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
    case 'copy':
      add('rect', { x: '9', y: '9', width: '13', height: '13', rx: '1', ry: '1' });
      add('path', { d: 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1' });
      break;
    case 'check':
      add('polyline', { points: '20 6 9 17 4 12' });
      break;
    case 'link':
      add('path', { d: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71' });
      add('path', { d: 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' });
      break;
    case 'external':
      add('path', { d: 'M7 17L17 7' });
      add('polyline', { points: '9 7 17 7 17 15' });
      break;
    case 'arrow-left':
      add('line', { x1: '19', y1: '12', x2: '5', y2: '12' });
      add('polyline', { points: '12 19 5 12 12 5' });
      break;
    case 'arrow-right':
      add('line', { x1: '5', y1: '12', x2: '19', y2: '12' });
      add('polyline', { points: '12 5 19 12 12 19' });
      break;
    default:
      add('circle', { cx: '12', cy: '12', r: '9' });
      break;
  }

  return svg;
}

function sanitizeHttpUrl(rawUrl) {
  if (typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.href;
    }
    return '';
  } catch {
    return '';
  }
}

function sanitizeImageUrl(rawUrl) {
  if (typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();
  if (!trimmed || /[\\\u0000-\u001f\u007f]/.test(trimmed)) return '';

  const localPath = trimmed.replace(/^\.\//, '');
  if (
    /^guides-media\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.(?:png|jpg|jpeg|webp|gif)$/.test(localPath)
  ) {
    return localPath;
  }

  if (!/^https?:\/\//i.test(trimmed)) return '';
  const httpUrl = sanitizeHttpUrl(trimmed);
  if (!httpUrl) return '';
  try {
    const pathname = decodeURIComponent(new URL(httpUrl).pathname);
    return /\.svgz?(?:$|[/?#])/i.test(pathname) ? '' : httpUrl;
  } catch {
    return '';
  }
}

/* ==========================================================================
   Persistence Helpers (Completed Courses + Per-Course Step Progress)
   ========================================================================== */

function readCompletedIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(COMPLETED_STORAGE_KEY) || '[]');
    if (Array.isArray(parsed)) {
      return new Set(parsed.filter((id) => typeof id === 'string' && id.trim()));
    }
  } catch {
    // Ignore storage errors
  }
  return new Set();
}

function writeCompletedIds(set) {
  try {
    localStorage.setItem(COMPLETED_STORAGE_KEY, JSON.stringify([...set]));
    return true;
  } catch {
    return false;
  }
}

function readStepProgressMap() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STEP_PROGRESS_STORAGE_KEY) || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // Ignore storage errors
  }
  return {};
}

function writeStepProgressMap(map) {
  try {
    localStorage.setItem(STEP_PROGRESS_STORAGE_KEY, JSON.stringify(map));
    return true;
  } catch {
    return false;
  }
}

function isValidGuidesPayload(payload) {
  return (
    payload !== null &&
    typeof payload === 'object' &&
    Array.isArray(payload.guides) &&
    payload.guides.every(
      (g) =>
        g &&
        typeof g === 'object' &&
        typeof g.id === 'string' &&
        typeof g.title === 'string' &&
        Array.isArray(g.steps)
    )
  );
}

function normalizeGuides(payload) {
  const list = Array.isArray(payload?.guides) ? payload.guides : [];
  const optionalText = (value) => typeof value === 'string' ? value.trim() : '';
  return list
    .filter((g) => g && typeof g === 'object' && typeof g.id === 'string')
    .map((g) => ({
      ...g,
      track: optionalText(g.track),
      summary: optionalText(g.summary),
      author_note: optionalText(g.author_note),
      related_tags: Array.isArray(g.related_tags) ? g.related_tags : [],
      steps: g.steps.map((step) => ({
        ...step,
        title: optionalText(step?.title),
        markdown: typeof step?.markdown === 'string' ? step.markdown : '',
      })),
    }))
    .sort((a, b) => (Number(a.order) || 999) - (Number(b.order) || 999));
}

async function loadGuidesData() {
  if (typeof fetch === 'function') {
    for (const candidate of GUIDE_DATA_CANDIDATES) {
      try {
        const res = await fetch(candidate.url, { cache: 'no-cache' });
        if (!res.ok) continue;
        const parsed = await res.json();
        if (isValidGuidesPayload(parsed)) {
          return {
            guides: normalizeGuides(parsed),
            source: candidate.source,
          };
        }
      } catch {
        // Silently continue fallback chain
      }
    }
  }
  return {
    guides: normalizeGuides(OFFLINE_GUIDES_PAYLOAD),
    source: 'fallback',
  };
}

/* ==========================================================================
   Safe DOM-Only Markdown Parser (Strict createElement + textContent)
   ========================================================================== */

const IMAGE_TOKEN_SOURCE =
  '!\\[([^\\]\\n]*)\\]\\([ \\t]*([^\\s()"]+)(?:[ \\t]+"([^"\\n]*)")?[ \\t]*\\)';
const BLOCK_IMAGE_RE = new RegExp(`^${IMAGE_TOKEN_SOURCE}$`);
const BLOCK_LINK_RE = /^\[([^\]\n]+)\]\(([^)\s]+)\)$/;
const BARE_URL_SOURCE = 'https?:\\/\\/[^\\s<>"`，。；！？、：“”‘’（）【】《》]+';
const BLOCK_BARE_URL_RE = new RegExp(`^${BARE_URL_SOURCE}$`, 'i');
const INLINE_TOKEN_SOURCE =
  '(`[^`\\n]+`)|(\\*\\*[^*\\n]+?\\*\\*)|' +
  `(${IMAGE_TOKEN_SOURCE})|` +
  '(\\[[^\\]\\n]+\\]\\(([^)\\s]+)\\))|' +
  `((?<![\\w/])${BARE_URL_SOURCE})`;

function trimBareUrl(value) {
  let end = value.length;
  const pairs = { ')': '(', ']': '[', '}': '{' };
  while (end > 0) {
    const last = value[end - 1];
    if (/[.,;:!?，。；：！？、…'"’”]/.test(last)) {
      end -= 1;
      continue;
    }
    if (pairs[last]) {
      const url = value.slice(0, end);
      if (url.split(last).length > url.split(pairs[last]).length) {
        end -= 1;
        continue;
      }
    }
    break;
  }
  return value.slice(0, end);
}

function getJumpLink(line) {
  const match = BLOCK_LINK_RE.exec(line);
  if (match) {
    const href = sanitizeHttpUrl(match[2]);
    return href ? { href, title: match[1].trim() || '前往目标网站' } : null;
  }
  if (!BLOCK_BARE_URL_RE.test(line) || trimBareUrl(line) !== line) return null;
  const href = sanitizeHttpUrl(line);
  return href ? { href, title: '前往目标网站' } : null;
}

function buildGuideLink(href, label) {
  const link = el('a', 'guide-link', label);
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.appendChild(createSvgIcon('external', 'guide-link-icon'));
  return link;
}

function buildJumpCard({ href, title }) {
  const link = el('a', 'guide-jump-card');
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  const details = el('span', 'guide-jump-details');
  details.append(
    el('span', 'guide-jump-title', title),
    el('span', 'guide-jump-host', new URL(href).hostname)
  );
  const action = el('span', 'guide-jump-action');
  action.append(el('span', '', '前往网站'), createSvgIcon('external', 'guide-link-icon'));
  link.append(details, action);
  return link;
}

function getImageCaption(alt, title = '') {
  return [title, alt]
    .map((text) => text.trim())
    .find((text) => text && !/^(?:image|img|screenshot|图片|图像|截图|占位图|图)[\s\d_-]*$/i.test(text)) || '';
}

function buildGuideImage(src, alt, loading = 'lazy', onError = null) {
  const image = el('img', 'guide-image');
  image.alt = alt;
  image.loading = loading;
  image.decoding = 'async';
  image.referrerPolicy = 'no-referrer';
  image.addEventListener('error', () => {
    image.replaceWith(el(
      'span',
      'guide-image-fallback',
      alt ? `图片暂时无法加载：${alt}` : '图片暂时无法加载'
    ));
    if (onError) onError();
  }, { once: true });
  image.src = src;
  return image;
}

function openGuideLightbox(src, alt, caption, trigger) {
  const dialog = el('dialog', 'guide-lightbox');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', caption ? `图片预览：${caption}` : '图片预览');

  const content = el('div', 'guide-lightbox-content');
  const toolbar = el('div', 'guide-lightbox-toolbar');
  const closeButton = el('button', 'guide-lightbox-close', '关闭');
  closeButton.type = 'button';
  closeButton.autofocus = true;
  closeButton.setAttribute('aria-label', '关闭图片预览');
  closeButton.addEventListener('click', () => dialog.close());
  toolbar.append(el('span', 'guide-toc-track', '图片预览'), closeButton);

  const figure = el('figure', 'guide-lightbox-figure');
  figure.appendChild(buildGuideImage(src, alt, 'eager'));
  if (caption) figure.appendChild(el('figcaption', 'guide-figcaption', caption));
  content.append(toolbar, figure);
  dialog.appendChild(content);

  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') event.stopPropagation();
    if (event.key === 'Tab') {
      event.preventDefault();
      closeButton.focus({ preventScroll: true });
    }
  });
  const closeOnNavigation = () => dialog.close();
  window.addEventListener('popstate', closeOnNavigation);
  dialog.addEventListener('close', () => {
    window.removeEventListener('popstate', closeOnNavigation);
    dialog.remove();
    if (trigger.isConnected) trigger.focus({ preventScroll: true });
  }, { once: true });

  trigger.closest('#guides-panel').appendChild(dialog);
  dialog.showModal();
}

function buildImageTrigger(src, alt, caption, inline = false) {
  const trigger = el('button', `guide-image-trigger${inline ? ' guide-image-inline' : ''}`);
  trigger.type = 'button';
  trigger.setAttribute('aria-label', caption ? `放大查看：${caption}` : '放大查看图片');
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.appendChild(buildGuideImage(src, alt, 'lazy', () => {
    trigger.disabled = true;
    trigger.setAttribute('aria-label', '图片暂时无法加载');
  }));
  trigger.addEventListener('click', () => openGuideLightbox(src, alt, caption, trigger));
  return trigger;
}

function buildGuideFigure(src, alt, title) {
  const caption = getImageCaption(alt, title);
  const figure = el('figure', 'guide-figure');
  figure.appendChild(buildImageTrigger(src, alt, caption));
  if (caption) figure.appendChild(el('figcaption', 'guide-figcaption', caption));
  return figure;
}

function appendInlineMarkdown(parent, rawText, depth = 0) {
  const text = String(rawText ?? '');
  if (!text) return;

  // Use a fresh local RegExp instance per call so recursive strong/inline parsing never corrupts lastIndex
  const tokenRe = new RegExp(INLINE_TOKEN_SOURCE, 'gi');
  let lastIndex = 0;
  let match;

  while ((match = tokenRe.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parent.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    }

    if (match[1]) {
      const codeEl = el('code', 'guide-inline-code', match[1].slice(1, -1));
      parent.appendChild(codeEl);
    } else if (match[2]) {
      const strongEl = el('strong', 'guide-strong');
      const inner = match[2].slice(2, -2);
      if (depth < 4) {
        appendInlineMarkdown(strongEl, inner, depth + 1);
      } else {
        strongEl.appendChild(document.createTextNode(inner));
      }
      parent.appendChild(strongEl);
    } else if (match[3]) {
      const src = sanitizeImageUrl(match[5]);
      if (src) {
        const alt = match[4].trim();
        parent.appendChild(buildImageTrigger(src, alt, getImageCaption(alt, match[6]), true));
      } else {
        parent.appendChild(document.createTextNode(match[3]));
      }
    } else if (match[7]) {
      const fullLink = match[7];
      const splitIdx = fullLink.indexOf('](');
      const label = fullLink.slice(1, splitIdx);
      const safeHref = sanitizeHttpUrl(match[8] || '');
      if (safeHref) {
        parent.appendChild(buildGuideLink(safeHref, label));
      } else {
        parent.appendChild(document.createTextNode(label));
      }
    } else if (match[9]) {
      const url = trimBareUrl(match[9]);
      const href = sanitizeHttpUrl(url);
      parent.appendChild(href ? buildGuideLink(href, url) : document.createTextNode(url));
      parent.appendChild(document.createTextNode(match[9].slice(url.length)));
    }

    lastIndex = tokenRe.lastIndex;
  }

  if (lastIndex < text.length) {
    parent.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
}

function buildCodeBlockElement(codeText, language, onToast) {
  const cleanCode = String(codeText ?? '').replace(/\n$/, '');
  const langLabel = String(language || 'code').trim().toUpperCase() || 'CODE';

  const outer = el('div', 'guide-code-block');
  const header = el('div', 'guide-code-header');
  header.appendChild(el('span', 'guide-code-lang', langLabel));

  const copyBtn = el('button', 'guide-copy-btn');
  copyBtn.type = 'button';
  copyBtn.setAttribute('data-guide-copy', '');
  copyBtn.setAttribute('aria-label', '一键复制代码块');

  const renderBtnState = (copied) => {
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

  renderBtnState(false);

  let timer = null;
  copyBtn.addEventListener('click', async () => {
    const ok = await copyTextToClipboard(cleanCode);
    if (ok) {
      renderBtnState(true);
      if (typeof onToast === 'function') onToast('已复制到剪贴板', 'success');
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        renderBtnState(false);
        timer = null;
      }, 2000);
    } else if (typeof onToast === 'function') {
      onToast('复制失败，请手动选中复制', 'error');
    }
  });

  header.appendChild(copyBtn);

  const pre = el('pre', 'guide-code-pre');
  const code = el('code', 'guide-code-text');
  code.textContent = cleanCode;
  pre.appendChild(code);

  outer.append(header, pre);
  return outer;
}

function splitTableRow(line) {
  let trimmed = line.trim();
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
  if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
  return trimmed.split('|').map((cell) => cell.trim());
}

function isTableSeparatorLine(line) {
  if (!line || !line.includes('|')) return false;
  const cells = splitTableRow(line);
  return (
    cells.length >= 2 &&
    cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, '')))
  );
}

function buildTableElement(headerLine, bodyLines) {
  const scrollWrap = el('div', 'guide-table-scroll');
  scrollWrap.setAttribute('tabindex', '0');
  scrollWrap.setAttribute('role', 'region');
  scrollWrap.setAttribute('aria-label', '步骤对照表');

  const table = el('table', 'guide-table');
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  const headerCells = splitTableRow(headerLine);

  for (const cellText of headerCells) {
    const th = document.createElement('th');
    th.scope = 'col';
    appendInlineMarkdown(th, cellText);
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);

  const tbody = document.createElement('tbody');
  for (const rowLine of bodyLines) {
    const tr = document.createElement('tr');
    const cells = splitTableRow(rowLine);
    for (let c = 0; c < headerCells.length; c += 1) {
      const td = document.createElement('td');
      appendInlineMarkdown(td, cells[c] ?? '');
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }

  table.append(thead, tbody);
  scrollWrap.appendChild(table);
  return scrollWrap;
}

function buildBlockquoteElement(quoteLines) {
  const joined = quoteLines
    .map((ln) => ln.replace(/^>\s?/, '').trim())
    .filter(Boolean)
    .join('\n');

  const riskMatch = joined.match(/^(风险提示[：:])\s*([\s\S]+)$/);
  if (riskMatch) {
    const box = el('aside', 'guide-risk-note');
    box.setAttribute('role', 'note');
    const title = el('p', 'guide-risk-label', '风险提示');
    const body = el('p', 'guide-risk-body');
    appendInlineMarkdown(body, riskMatch[2]);
    box.append(title, body);
    return box;
  }

  const quote = el('blockquote', 'guide-quote');
  const p = el('p', 'guide-quote-body');
  appendInlineMarkdown(p, joined);
  quote.appendChild(p);
  return quote;
}

function renderSafeMarkdown(markdown, container, onToast) {
  const normalized = String(markdown ?? '').replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const total = lines.length;
  let i = 0;

  while (i < total) {
    const trimmed = lines[i].trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    // Strip HTML comments cleanly
    if (trimmed.startsWith('<!--')) {
      while (i < total && !lines[i].includes('-->')) {
        i += 1;
      }
      i += 1;
      continue;
    }

    // Fenced code blocks
    const fenceMatch = trimmed.match(/^```([A-Za-z0-9_+-]*)\s*$/);
    if (fenceMatch) {
      const lang = fenceMatch[1] || 'code';
      const codeLines = [];
      i += 1;
      while (i < total && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i += 1;
      }
      if (i < total) i += 1;
      container.appendChild(buildCodeBlockElement(codeLines.join('\n'), lang, onToast));
      continue;
    }

    const imageMatch = BLOCK_IMAGE_RE.exec(trimmed);
    if (imageMatch) {
      const src = sanitizeImageUrl(imageMatch[2]);
      container.appendChild(src
        ? buildGuideFigure(src, imageMatch[1].trim(), imageMatch[3])
        : el('p', 'guide-para', trimmed));
      i += 1;
      continue;
    }

    const jumpLink = getJumpLink(trimmed);
    if (jumpLink) {
      container.appendChild(buildJumpCard(jumpLink));
      i += 1;
      continue;
    }

    // Sub-headings
    const headingMatch = trimmed.match(/^(#{3,4})\s+(.+)$/);
    if (headingMatch) {
      const h = el(headingMatch[1].length === 3 ? 'h4' : 'h5', 'guide-sub-heading');
      appendInlineMarkdown(h, headingMatch[2].trim());
      container.appendChild(h);
      i += 1;
      continue;
    }

    // Markdown table
    if (
      trimmed.includes('|') &&
      i + 1 < total &&
      isTableSeparatorLine(lines[i + 1])
    ) {
      const headerLine = lines[i];
      i += 2;
      const bodyLines = [];
      while (i < total && lines[i].trim() && lines[i].includes('|')) {
        bodyLines.push(lines[i]);
        i += 1;
      }
      container.appendChild(buildTableElement(headerLine, bodyLines));
      continue;
    }

    // Blockquote / Risk note
    if (trimmed.startsWith('>')) {
      const quoteLines = [];
      while (i < total && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim());
        i += 1;
      }
      container.appendChild(buildBlockquoteElement(quoteLines));
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(trimmed)) {
      const ol = el('ol', 'guide-ol');
      while (i < total && /^\d+\.\s+/.test(lines[i].trim())) {
        const itemText = lines[i].trim().replace(/^\d+\.\s+/, '');
        const li = el('li', 'guide-li');
        appendInlineMarkdown(li, itemText);
        ol.appendChild(li);
        i += 1;
      }
      container.appendChild(ol);
      continue;
    }

    // Unordered list
    if (/^[-*]\s+/.test(trimmed)) {
      const ul = el('ul', 'guide-ul');
      while (i < total && /^[-*]\s+/.test(lines[i].trim())) {
        const itemText = lines[i].trim().replace(/^[-*]\s+/, '');
        const li = el('li', 'guide-li');
        appendInlineMarkdown(li, itemText);
        ul.appendChild(li);
        i += 1;
      }
      container.appendChild(ul);
      continue;
    }

    // Paragraph
    const paraLines = [];
    while (i < total) {
      const cur = lines[i].trim();
      if (
        !cur ||
        cur.startsWith('<!--') ||
        cur.startsWith('```') ||
        cur.startsWith('>') ||
        BLOCK_IMAGE_RE.test(cur) ||
        getJumpLink(cur) ||
        /^#{3,4}\s+/.test(cur) ||
        /^\d+\.\s+/.test(cur) ||
        /^[-*]\s+/.test(cur) ||
        (cur.includes('|') && i + 1 < total && isTableSeparatorLine(lines[i + 1]))
      ) {
        break;
      }
      paraLines.push(cur);
      i += 1;
    }

    if (paraLines.length > 0) {
      const p = el('p', 'guide-para');
      appendInlineMarkdown(p, paraLines.join(' '));
      container.appendChild(p);
    }
  }
}

/* ==========================================================================
   Main Module Entry: initGuides
   ========================================================================== */

export async function initGuides({ onChange, onToast } = {}) {
  const panel = document.getElementById('guides-panel');

  const loaded = await loadGuidesData();
  const guides = loaded.guides;
  const tracks = [...new Set(guides.map((guide) => guide.track).filter(Boolean))];
  const completedIds = readCompletedIds();
  const progressMap = readStepProgressMap();

  // '' means Course Hub view; non-empty string means active lesson walkthrough view
  let activeGuideId = '';
  let activeTrack = '';
  let activeStepNumber = 1;
  let viewMode = 'step'; // 'step' (default Step-by-Step) | 'all' (Full Preview)

  const notify = (msg, type = 'info') => {
    if (typeof onToast === 'function') onToast(msg, type);
  };

  function findGuide(guideId) {
    if (!guideId) return null;
    return guides.find((g) => g.id === guideId) || null;
  }

  function getStepCount(guide) {
    return Array.isArray(guide?.steps) ? guide.steps.length : 0;
  }

  function clampStep(guide, stepNum) {
    const total = Math.max(1, getStepCount(guide));
    const parsed = Number.parseInt(String(stepNum ?? '1'), 10);
    if (!Number.isFinite(parsed) || parsed < 1) return 1;
    if (parsed > total) return total;
    return parsed;
  }

  function getGuideProgress(guide) {
    const entry = progressMap[guide.id];
    const total = Math.max(1, getStepCount(guide));
    const savedStep = clampStep(guide, entry?.currentStep || 1);
    const completedSteps = new Set(
      Array.isArray(entry?.completedSteps)
        ? entry.completedSteps
            .map((n) => Number.parseInt(String(n), 10))
            .filter((n) => Number.isFinite(n) && n >= 1 && n <= total)
        : []
    );
    return { currentStep: savedStep, completedSteps };
  }

  function saveGuideStepState(guideId, currentStep, completedStepsSet) {
    progressMap[guideId] = {
      currentStep,
      completedSteps: [...completedStepsSet].sort((a, b) => a - b),
    };
    writeStepProgressMap(progressMap);
  }

  function buildGuideShareUrl(guideId, stepNum = null) {
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('channel', 'GUIDES');
    if (guideId) {
      url.searchParams.set('guide', guideId);
      if (stepNum && stepNum > 1 && viewMode === 'step') {
        url.searchParams.set('step', String(stepNum));
      }
    }
    return url.href;
  }

  function scrollToGuideTop() {
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    const navHeight = document.querySelector('.editorial-nav')?.getBoundingClientRect().height || 0;
    const targetTop = Math.max(0, window.scrollY + rect.top - navHeight - 12);
    window.scrollTo({ top: targetTop, behavior: 'smooth' });
  }

  /* ------------------------------------------------------------------------
     View 1: Course Hub (教学主页)
     ------------------------------------------------------------------------ */
  function renderHub() {
    if (guides.length === 0) {
      const empty = el('section', 'guides-hub-empty');
      empty.setAttribute('aria-labelledby', 'guides-empty-title');
      const title = el(
        'h2',
        'font-editorial-display guide-doc-title',
        '首批实战教程正在编写中'
      );
      title.id = 'guides-empty-title';
      empty.append(
        el('p', 'guide-toc-track', 'GUIDES · 课程筹备中'),
        title,
        el(
          'p',
          'guide-doc-summary',
          '作者正在从零梳理分步实操课程，完成后将在此按步发布。'
        )
      );
      panel.replaceChildren(empty);
      return;
    }

    const frag = document.createDocumentFragment();
    const visibleGuides = activeTrack ? guides.filter((guide) => guide.track === activeTrack) : guides;
    const grid = el('section', 'guides-hub-grid');
    grid.setAttribute('aria-label', '实战教程目录');
    grid.dataset.visibleCount = String(visibleGuides.length);

    for (const guide of visibleGuides) {
      const isDone = completedIds.has(guide.id);
      const totalSteps = getStepCount(guide);
      const prog = getGuideProgress(guide);
      const hasInProgress = !isDone && (prog.currentStep > 1 || prog.completedSteps.size > 0);

      const card = el('article', 'guide-hub-card');
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.dataset.guideCard = guide.id;
      card.dataset.completed = isDone ? 'true' : 'false';
      card.setAttribute('aria-label', `进入课程：${guide.title}`);

      // Top eyebrow: Order + Track on left | Progress / Completed status on right
      const topRow = el('div', 'guide-hub-card-top');
      topRow.appendChild(
        el(
          'span',
          'guide-toc-track',
          [String(guide.order).padStart(2, '0'), guide.track].filter(Boolean).join(' · ')
        )
      );

      if (isDone) {
        const doneEl = el('span', 'guide-done-indicator');
        doneEl.append(createSvgIcon('check', 'w-3.5 h-3.5 shrink-0'), el('span', '', '已完成'));
        topRow.appendChild(doneEl);
      } else if (hasInProgress) {
        topRow.appendChild(
          el(
            'span',
            'guide-hub-status-active',
            `进行到第 ${prog.currentStep} / ${totalSteps} 步`
          )
        );
      } else {
        topRow.appendChild(el('span', 'guide-hub-status-muted', `共 ${totalSteps} 步`));
      }

      // Main title & summary
      const titleEl = el('h2', 'font-editorial-display guide-hub-card-title', guide.title);

      // Quiet bottom action row
      const footer = el('div', 'guide-hub-card-footer');
      const metaLeft = el(
        'span',
        'guide-hub-card-meta',
        `共 ${totalSteps} 个步骤 · 更新于 ${guide.updated_at}`
      );
      const ctaLabel = isDone
        ? '再次复习'
        : hasInProgress
          ? `继续第 ${prog.currentStep} 步`
          : '开始学习';
      const cta = el('span', 'guide-hub-card-cta');
      cta.append(el('span', '', ctaLabel), createSvgIcon('arrow-right', 'w-3.5 h-3.5 shrink-0'));
      footer.append(metaLeft, cta);

      card.append(topRow, titleEl);
      if (guide.summary) card.appendChild(el('p', 'guide-hub-card-summary', guide.summary));
      card.appendChild(footer);

      const enterLesson = () => openGuide(guide.id);
      card.addEventListener('click', enterLesson);
      card.addEventListener('keydown', (evt) => {
        if (evt.key === 'Enter' || evt.key === ' ') {
          evt.preventDefault();
          enterLesson();
        }
      });

      grid.appendChild(card);
    }

    frag.appendChild(grid);
    panel.replaceChildren(frag);
  }

  /* ------------------------------------------------------------------------
     View 2: Lesson Walkthrough (单步引导默认 + 全文预览切换)
     ------------------------------------------------------------------------ */
  function renderLesson(guide) {
    const frag = document.createDocumentFragment();
    const steps = Array.isArray(guide.steps) ? guide.steps : [];
    const totalSteps = Math.max(1, steps.length);
    activeStepNumber = clampStep(guide, activeStepNumber);
    const prog = getGuideProgress(guide);
    const isCourseDone = completedIds.has(guide.id);

    const wrapper = el('div', 'guide-lesson-shell');

    // 1. Top Lesson Navigation Bar: ← 返回教学主页 | 单步引导 / 全文预览
    const topBar = el('div', 'guide-lesson-topbar');

    const backBtn = el('button', 'guide-back-btn');
    backBtn.type = 'button';
    backBtn.setAttribute('data-guide-back-hub', '');
    backBtn.append(
      createSvgIcon('arrow-left', 'w-3.5 h-3.5 shrink-0'),
      el('span', '', '返回教学主页')
    );
    backBtn.addEventListener('click', () => returnToHub({ scrollTop: true }));

    const modeSwitch = el('div', 'guide-mode-switch');
    modeSwitch.setAttribute('role', 'group');
    modeSwitch.setAttribute('aria-label', '阅读模式切换');

    for (const opt of [
      { key: 'step', label: '单步引导' },
      { key: 'all', label: '全文预览' },
    ]) {
      const btn = el('button', 'guide-mode-btn', opt.label);
      btn.type = 'button';
      btn.dataset.guideMode = opt.key;
      const active = viewMode === opt.key;
      btn.dataset.active = active ? 'true' : 'false';
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      btn.addEventListener('click', () => {
        if (viewMode === opt.key) return;
        viewMode = opt.key;
        render();
        if (typeof onChange === 'function') onChange();
      });
      modeSwitch.appendChild(btn);
    }

    topBar.append(backBtn, modeSwitch);
    wrapper.appendChild(topBar);

    // 2. Lesson Editorial Header
    const header = el('header', 'guide-doc-header');

    const kicker = el('div', 'guide-doc-kicker');
    kicker.appendChild(el('span', 'guide-doc-order', `第 ${String(guide.order).padStart(2, '0')} 课`));
    if (guide.track) {
      kicker.append(
        el('span', 'guide-kicker-sep', '·'),
        el('span', 'guide-doc-track', guide.track)
      );
    }
    kicker.append(
      el('span', 'guide-kicker-sep', '·'),
      el('time', 'guide-doc-date', `更新于 ${guide.updated_at}`)
    );

    const titleEl = el('h2', 'font-editorial-display guide-doc-title', guide.title);
    header.append(kicker, titleEl);
    if (guide.summary) header.appendChild(el('p', 'guide-doc-summary', guide.summary));

    if (guide.author_note) {
      const note = el('p', 'guide-author-note');
      note.append(
        el('span', 'guide-author-note-label', '编者注：'),
        document.createTextNode(guide.author_note)
      );
      header.appendChild(note);
    }

    const actions = el('div', 'guide-doc-actions');

    const copyLinkBtn = el('button', 'guide-action-link');
    copyLinkBtn.type = 'button';
    copyLinkBtn.setAttribute('data-guide-copy-link', '');
    copyLinkBtn.append(
      createSvgIcon('link', 'w-3.5 h-3.5 shrink-0'),
      el('span', '', '复制本课链接')
    );
    copyLinkBtn.addEventListener('click', async () => {
      const ok = await copyTextToClipboard(
        buildGuideShareUrl(guide.id, activeStepNumber)
      );
      notify(ok ? '已复制本课链接' : '复制失败，请检查剪贴板权限', ok ? 'success' : 'error');
    });

    const completeToggleBtn = el('button', 'guide-action-link');
    completeToggleBtn.type = 'button';
    completeToggleBtn.setAttribute('data-guide-complete-btn', '');
    completeToggleBtn.setAttribute('aria-pressed', isCourseDone ? 'true' : 'false');
    completeToggleBtn.dataset.completed = isCourseDone ? 'true' : 'false';
    completeToggleBtn.append(
      createSvgIcon('check', 'w-3.5 h-3.5 shrink-0'),
      el('span', '', isCourseDone ? '已学完（点击取消）' : '标记已学完')
    );
    completeToggleBtn.addEventListener('click', () => {
      if (completedIds.has(guide.id)) {
        completedIds.delete(guide.id);
        writeCompletedIds(completedIds);
        notify('已取消本课完成标记', 'info');
      } else {
        completedIds.add(guide.id);
        writeCompletedIds(completedIds);
        notify('已标记本课为已学完', 'success');
      }
      render();
      if (typeof onChange === 'function') onChange();
    });

    actions.append(copyLinkBtn, completeToggleBtn);
    header.appendChild(actions);
    wrapper.appendChild(header);

    // 3. Step-by-Step Walkthrough Mode OR Full Preview Mode
    if (viewMode === 'step') {
      // Step Progress Bar & Clickable Step Nodes
      const stepper = el('section', 'guide-stepper');
      stepper.setAttribute('aria-label', '步骤进度');

      const stepMetaRow = el('div', 'guide-stepper-meta');
      stepMetaRow.append(
        el('span', 'guide-stepper-counter', `步骤 ${activeStepNumber} / ${totalSteps}`),
        el(
          'span',
          'guide-stepper-current-name',
          steps[activeStepNumber - 1]?.title || `第 ${activeStepNumber} 步`
        )
      );

      const barTrack = el('div', 'guide-progress-track');
      const barFill = el('div', 'guide-progress-fill');
      barFill.style.width = `${Math.round((activeStepNumber / totalSteps) * 100)}%`;
      barTrack.appendChild(barFill);

      const nodeList = el('div', 'guide-step-nodes');
      nodeList.setAttribute('role', 'tablist');
      nodeList.setAttribute('aria-label', '步骤跳转');

      steps.forEach((s, idx) => {
        const num = idx + 1;
        const isCurrent = num === activeStepNumber;
        const isStepDone = isCourseDone || prog.completedSteps.has(num);

        const nodeBtn = el('button', 'guide-step-node');
        nodeBtn.type = 'button';
        nodeBtn.setAttribute('role', 'tab');
        nodeBtn.setAttribute('aria-selected', isCurrent ? 'true' : 'false');
        nodeBtn.dataset.stepJump = String(num);
        nodeBtn.dataset.active = isCurrent ? 'true' : 'false';
        nodeBtn.dataset.done = isStepDone ? 'true' : 'false';

        const top = el('span', 'guide-step-node-top');
        top.appendChild(el('span', 'guide-step-node-num', `第 ${num} 步`));
        if (isStepDone) {
          const checkWrap = el('span', 'guide-step-node-check');
          checkWrap.appendChild(createSvgIcon('check', 'w-3 h-3 shrink-0'));
          top.appendChild(checkWrap);
        }

        const label = el('span', 'guide-step-node-label', s.title || `第 ${num} 步`);
        nodeBtn.append(top, label);

        nodeBtn.addEventListener('click', () => {
          goToStep(num, { scrollTop: false });
        });
        nodeList.appendChild(nodeBtn);
      });

      stepper.append(stepMetaRow, barTrack, nodeList);
      wrapper.appendChild(stepper);

      // Render ONLY the current active step
      const currentStepObj = steps[activeStepNumber - 1];
      if (currentStepObj) {
        const stepArticle = el('article', 'guide-step guide-step-focused');
        stepArticle.id = `guide-step-${guide.id}-${activeStepNumber}`;
        stepArticle.dataset.stepNumber = String(activeStepNumber);

        const stepHeader = el('div', 'guide-step-header');
        stepHeader.append(
          el(
            'span',
            'guide-step-num',
            `STEP ${String(activeStepNumber).padStart(2, '0')} / ${String(totalSteps).padStart(2, '0')}`
          ),
          el('h3', 'font-editorial-display guide-step-title', currentStepObj.title || `第 ${activeStepNumber} 步`)
        );

        const stepBody = el('div', 'guide-step-body');
        renderSafeMarkdown(currentStepObj.markdown, stepBody, notify);

        stepArticle.append(stepHeader, stepBody);
        wrapper.appendChild(stepArticle);
      }

      // Bottom Walkthrough Controls: 上一步 | 完成本步，进入下一步 → / 完成本课，返回教学主页
      const navBar = el('div', 'guide-walkthrough-footer');

      const prevBtn = el('button', 'guide-walkthrough-prev');
      prevBtn.type = 'button';
      prevBtn.setAttribute('data-guide-prev-step', '');
      prevBtn.disabled = activeStepNumber <= 1;
      prevBtn.append(
        createSvgIcon('arrow-left', 'w-3.5 h-3.5 shrink-0'),
        el('span', '', '上一步')
      );
      prevBtn.addEventListener('click', () => {
        if (activeStepNumber > 1) {
          goToStep(activeStepNumber - 1, { scrollTop: true });
        }
      });

      const isLastStep = activeStepNumber >= totalSteps;
      const primaryBtn = el(
        'button',
        isLastStep
          ? 'guide-walkthrough-next guide-walkthrough-finish'
          : 'guide-walkthrough-next'
      );
      primaryBtn.type = 'button';
      primaryBtn.setAttribute(
        isLastStep ? 'data-guide-finish-lesson' : 'data-guide-next-step',
        ''
      );

      if (isLastStep) {
        primaryBtn.append(
          createSvgIcon('check', 'w-4 h-4 shrink-0'),
          el('span', '', '完成本课，返回教学主页')
        );
        primaryBtn.addEventListener('click', () => finishCurrentLesson(guide));
      } else {
        primaryBtn.append(
          el('span', '', '完成本步，进入下一步'),
          createSvgIcon('arrow-right', 'w-4 h-4 shrink-0')
        );
        primaryBtn.addEventListener('click', () => advanceStep(guide));
      }

      navBar.append(prevBtn, primaryBtn);
      wrapper.appendChild(navBar);
    } else {
      // Full Preview Mode (render all steps cleanly)
      const stepsWrap = el('div', 'guide-steps');
      steps.forEach((step, idx) => {
        const num = idx + 1;
        const stepSection = el('section', 'guide-step');
        stepSection.id = `guide-step-${guide.id}-${num}`;
        stepSection.dataset.stepNumber = String(num);

        const stepHeader = el('div', 'guide-step-header');
        stepHeader.append(
          el('span', 'guide-step-num', `STEP ${String(num).padStart(2, '0')}`),
          el('h3', 'font-editorial-display guide-step-title', step.title || `第 ${num} 步`)
        );

        const stepBody = el('div', 'guide-step-body');
        renderSafeMarkdown(step.markdown, stepBody, notify);

        stepSection.append(stepHeader, stepBody);
        stepsWrap.appendChild(stepSection);
      });
      wrapper.appendChild(stepsWrap);

      const fullFooter = el('div', 'guide-walkthrough-footer');
      const backBottomBtn = el('button', 'guide-walkthrough-prev');
      backBottomBtn.type = 'button';
      backBottomBtn.append(
        createSvgIcon('arrow-left', 'w-3.5 h-3.5 shrink-0'),
        el('span', '', '返回教学主页')
      );
      backBottomBtn.addEventListener('click', () => returnToHub({ scrollTop: true }));

      const finishBtn = el('button', 'guide-walkthrough-next guide-walkthrough-finish');
      finishBtn.type = 'button';
      finishBtn.setAttribute('data-guide-finish-lesson', '');
      finishBtn.append(
        createSvgIcon('check', 'w-4 h-4 shrink-0'),
        el('span', '', '完成本课，返回教学主页')
      );
      finishBtn.addEventListener('click', () => finishCurrentLesson(guide));

      fullFooter.append(backBottomBtn, finishBtn);
      wrapper.appendChild(fullFooter);
    }

    frag.appendChild(wrapper);
    panel.replaceChildren(frag);
  }

  /* ------------------------------------------------------------------------
     Navigation Actions & State Transitions
     ------------------------------------------------------------------------ */

  function render() {
    if (!panel) return;
    const lightbox = panel.querySelector('.guide-lightbox[open]');
    if (lightbox) lightbox.close();
    const guide = findGuide(activeGuideId);
    if (!guide) {
      activeGuideId = '';
      renderHub();
    } else {
      renderLesson(guide);
    }
    if (lightbox) {
      const focusTarget = panel.querySelector('.guide-step-title, .guide-hub-card, #guides-empty-title');
      if (focusTarget) {
        if (!focusTarget.hasAttribute('tabindex')) focusTarget.tabIndex = -1;
        focusTarget.focus({ preventScroll: true });
      }
    }
  }

  function openGuide(guideId, { step = null, scrollTop = true, silent = false } = {}) {
    const guide = findGuide(guideId);
    if (!guide) {
      returnToHub({ scrollTop, silent });
      return;
    }
    if (activeTrack && guide.track !== activeTrack) activeTrack = '';
    activeGuideId = guide.id;
    viewMode = 'step';

    if (step != null && String(step).trim() !== '') {
      activeStepNumber = clampStep(guide, step);
    } else if (completedIds.has(guide.id)) {
      activeStepNumber = 1;
    } else {
      const savedProg = getGuideProgress(guide);
      activeStepNumber = savedProg.currentStep;
    }

    render();
    if (scrollTop) scrollToGuideTop();
    if (!silent && typeof onChange === 'function') onChange({ push: true });
  }

  function goToStep(stepNum, { scrollTop = true, silent = false } = {}) {
    const guide = findGuide(activeGuideId);
    if (!guide) return;
    activeStepNumber = clampStep(guide, stepNum);
    const prog = getGuideProgress(guide);
    saveGuideStepState(guide.id, activeStepNumber, prog.completedSteps);
    render();
    if (scrollTop) scrollToGuideTop();
    if (!silent && typeof onChange === 'function') onChange();
  }

  function advanceStep(guide) {
    const total = getStepCount(guide);
    const prog = getGuideProgress(guide);
    prog.completedSteps.add(activeStepNumber);
    const nextStep = Math.min(total, activeStepNumber + 1);
    activeStepNumber = nextStep;
    saveGuideStepState(guide.id, nextStep, prog.completedSteps);
    render();
    scrollToGuideTop();
    if (typeof onChange === 'function') onChange();
  }

  function finishCurrentLesson(guide) {
    const total = getStepCount(guide);
    const prog = getGuideProgress(guide);
    for (let s = 1; s <= total; s += 1) {
      prog.completedSteps.add(s);
    }
    saveGuideStepState(guide.id, total, prog.completedSteps);
    completedIds.add(guide.id);
    writeCompletedIds(completedIds);

    notify(`已完成《${guide.title}》`, 'success');
    activeGuideId = '';
    activeStepNumber = 1;
    viewMode = 'step';
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (typeof onChange === 'function') onChange({ push: true });
  }

  function returnToHub({ scrollTop = true, silent = false } = {}) {
    activeGuideId = '';
    activeStepNumber = 1;
    viewMode = 'step';
    render();
    if (scrollTop) window.scrollTo({ top: 0, behavior: 'smooth' });
    if (!silent && typeof onChange === 'function') onChange({ push: true });
  }

  function setTrack(track, { scrollTop = true, silent = false } = {}) {
    activeTrack = tracks.includes(track) ? track : '';
    returnToHub({ scrollTop, silent });
  }

  function restore(params) {
    const requestedTrack = params?.get?.('track') || '';
    activeTrack = tracks.includes(requestedTrack) ? requestedTrack : '';
    const requestedId = params?.get?.('guide') || '';
    const requestedStep = params?.get?.('step');
    const guide = findGuide(requestedId);
    if (!guide) {
      activeGuideId = '';
      activeStepNumber = 1;
      viewMode = 'step';
      render();
      return;
    }
    openGuide(guide.id, { step: requestedStep, scrollTop: false, silent: true });
  }

  function parameters() {
    const result = {};
    if (activeTrack) result.track = activeTrack;
    if (activeGuideId) {
      result.guide = activeGuideId;
      if (viewMode === 'step' && activeStepNumber > 1) {
        result.step = String(activeStepNumber);
      }
    }
    return result;
  }

  render();

  return {
    restore,
    parameters,
    openGuide,
    returnToHub,
    setTrack,
    goToStep,
    getTracks: () => tracks.slice(),
    getActiveTrack: () => activeTrack,
    getProgress: () => ({
      completed: guides.filter((guide) => completedIds.has(guide.id)).length,
      total: guides.length,
    }),
    getActiveGuideId: () => activeGuideId,
    getActiveStep: () => activeStepNumber,
    getViewMode: () => viewMode,
    getGuides: () => guides.slice(),
    getSource: () => loaded.source,
  };
}
