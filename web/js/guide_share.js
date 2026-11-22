/**
 * 前哨 Radar — 实战教程分享系统（渐隐预览海报 + 精确到第 N 步直达）
 * 750x1334 竖屏 PNG · 原生 Canvas 2D · 零外部依赖 · 零跨域资源 · 零 Emoji
 * 弹窗全程 createElement + textContent 构建（XSS-safe）
 */

import { qrcode } from './qrcode.js';
import { POSTER_STYLES } from './poster.js';
import { copyTextToClipboard } from './card.js';

const POSTER_WIDTH = 750;
const POSTER_HEIGHT = 1334;
const PUBLIC_ORIGIN = 'https://radarqs.fyi';
const SVG_NS = 'http://www.w3.org/2000/svg';

const FONT_DISPLAY =
  '"SF Pro Display", "PingFang SC", "Microsoft YaHei Light", "DengXian Light", "Segoe UI", "Microsoft YaHei", "Helvetica Neue", sans-serif';
const FONT_SANS =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Microsoft YaHei", "Segoe UI", "Helvetica Neue", sans-serif';
const FONT_MONO =
  '"SF Mono", SFMono-Regular, Menlo, Monaco, "Cascadia Mono", Consolas, "Liberation Mono", monospace';

const STYLE_OPTIONS = [
  { key: 'apple-light', label: '极简白' },
  { key: 'space-gray', label: '深空灰' },
];

/* ==========================================================================
   Share URL (canonical public origin, same strategy family as poster.js)
   ========================================================================== */

export function buildGuideShareLink(guideId, step = null) {
  const url = new URL(PUBLIC_ORIGIN);
  url.pathname = '/';
  url.searchParams.set('channel', 'GUIDES');
  if (guideId) url.searchParams.set('guide', guideId);
  const stepNum = Number.parseInt(String(step ?? ''), 10);
  if (guideId && Number.isFinite(stepNum) && stepNum >= 1) {
    url.searchParams.set('step', String(stepNum));
  }
  return url.href;
}

/* ==========================================================================
   First-sentence extraction (Markdown -> one clean natural sentence)
   ========================================================================== */

const SENTENCE_END_RE = /[。！？!?]/;
const TRAILING_CLOSERS_RE = /[”’」』）)】》"']/;

function cleanInlineMarkdown(line) {
  return line
    .replace(/!\[[^\]\n]*\]\([^)\n]*\)/g, '')
    .replace(/\[([^\]\n]+)\]\([^)\n]*\)/g, '$1')
    .replace(/<((?:https?:)?\/\/[^>\s]+)>/gi, '')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/`([^`\n]*)`/g, '$1')
    .replace(/\*\*|`/g, '')
    .replace(/(^|\s)https?:\/\/\S+(?=\s|$)/gi, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function joinParagraph(lines) {
  return lines.reduce((acc, line) => {
    if (!acc) return line;
    const lastChar = acc.slice(-1);
    const firstChar = line.charAt(0);
    // A short unpunctuated lead line (e.g. a bold list label) reads as "标签：正文".
    if (Array.from(acc).length <= 20 && !/[\p{P}]$/u.test(acc)) {
      return acc + (/[\u4e00-\u9fff]/.test(acc + firstChar) ? '：' : ': ') + line;
    }
    const needsSpace = /[A-Za-z0-9,.;:!?)]/.test(lastChar) && /[A-Za-z0-9(]/.test(firstChar);
    return acc + (needsSpace ? ' ' : '') + line;
  }, '');
}

function cutFirstSentence(paragraph) {
  const chars = Array.from(paragraph);
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i];
    let isEnd = SENTENCE_END_RE.test(ch);
    // English period ends a sentence only before whitespace / end of text,
    // which keeps version numbers (v1.20) and domains (chatgpt.com) intact.
    if (!isEnd && ch === '.') {
      const next = chars[i + 1];
      isEnd = next === undefined || /\s/.test(next);
    }
    if (!isEnd) continue;
    let end = i + 1;
    while (end < chars.length && (SENTENCE_END_RE.test(chars[end]) || TRAILING_CLOSERS_RE.test(chars[end]))) {
      end += 1;
    }
    return chars.slice(0, end).join('').trim();
  }
  return paragraph.trim();
}

function clampSentence(sentence, maxChars) {
  const chars = Array.from(sentence);
  if (chars.length <= maxChars) return sentence;
  const floor = Math.floor(maxChars * 0.66);
  let cut = -1;
  for (let i = maxChars - 1; i >= floor; i -= 1) {
    if (/[，、；：,;:]/.test(chars[i])) {
      cut = i;
      break;
    }
  }
  if (cut < 0) {
    cut = maxChars - 1;
    // Never split inside an ASCII word / number run.
    if (/[A-Za-z0-9]/.test(chars[cut]) && /[A-Za-z0-9]/.test(chars[cut + 1] || '')) {
      let start = cut;
      while (start > 0 && /[A-Za-z0-9._-]/.test(chars[start - 1])) start -= 1;
      if (start > floor) cut = start;
    }
  }
  return `${chars.slice(0, cut).join('').replace(/[\s，、；：,;:]+$/, '')}…`;
}

export function extractStepFirstSentence(markdown, maxChars = 60) {
  let text = String(markdown ?? '').replace(/\r\n?/g, '\n');
  text = text
    .replace(/<!--[\s\S]*?(?:-->|$)/g, '\n')
    .replace(/^[ \t]*```[\s\S]*?(?:^[ \t]*```[^\n]*$|(?![\s\S]))/gm, '\n')
    .replace(/^[ \t]*~~~[\s\S]*?(?:^[ \t]*~~~[^\n]*$|(?![\s\S]))/gm, '\n');

  const paragraphs = [];
  const headings = [];
  let current = [];
  const flush = () => {
    if (current.length) paragraphs.push(joinParagraph(current));
    current = [];
  };

  for (const raw of text.split('\n')) {
    let line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    if (/^\|.*\|?$/.test(line) || /^(?:[-*_]\s*){3,}$/.test(line) || /^:?-{3,}:?(?:\s*\|\s*:?-{3,}:?)*$/.test(line)) {
      flush();
      continue;
    }
    while (/^>\s?/.test(line)) line = line.replace(/^>\s?/, '').trim();
    const headingMatch = line.match(/^#{1,6}\s+(.+)$/);
    if (headingMatch) {
      flush();
      const headingText = cleanInlineMarkdown(headingMatch[1]);
      if (headingText) headings.push(headingText);
      continue;
    }
    if (/^(?:[-*+]|\d+[.)、])\s+/.test(line)) {
      flush();
      line = line.replace(/^(?:[-*+]|\d+[.)、])\s+/, '');
    }
    line = line.replace(/^风险提示[：:]\s*/, '');
    // Standalone bare URLs and block-level jump links are navigation, not prose.
    if (/^https?:\/\/\S+$/i.test(line) || /^\[[^\]\n]+\]\(https?:\/\/[^)\s]+\)$/i.test(line)) {
      flush();
      continue;
    }
    line = cleanInlineMarkdown(line);
    if (!line || /^[\s\p{P}]*$/u.test(line)) {
      flush();
      continue;
    }
    current.push(line);
  }
  flush();

  const sources = paragraphs
    .map((p) => p.replace(/^\d{1,2}[.、．](?=[\u4e00-\u9fff])/, '').trim())
    .filter(Boolean);
  if (!sources.length) return headings[0] ? clampSentence(headings[0], maxChars) : '';

  // Lead-in sentences such as "什么是 Codex？" or "完整操作流程如下：" read better with
  // the sentence that follows, so keep appending until the preview carries real meaning.
  let sentence = cutFirstSentence(sources[0]);
  let rest = sources[0].slice(sentence.length).trim();
  let idx = 0;
  while (Array.from(sentence).length < 12 || /[：:]$/.test(sentence)) {
    if (!rest) {
      idx += 1;
      if (idx >= sources.length) break;
      rest = sources[idx];
    }
    rest = rest.replace(/^[\s。！？!?，、；：,.;:…]+/u, '');
    const next = cutFirstSentence(rest);
    if (!next) break;
    const joiner = /[A-Za-z0-9.!?:,]$/.test(sentence) && /^[A-Za-z0-9]/.test(next) ? ' ' : '';
    if (Array.from(sentence).length >= 12 && Array.from(sentence + joiner + next).length > maxChars) {
      sentence = sentence.replace(/[：:]$/, '…');
      break;
    }
    sentence += joiner + next;
    rest = rest.slice(next.length).trim();
    if (Array.from(sentence).length >= maxChars) break;
  }
  return clampSentence(sentence, maxChars);
}

/* ==========================================================================
   Canvas text helpers (mirrors poster.js typographic wrapping rules)
   ========================================================================== */

const CLOSING_PUNCT_RE = /^[，。、：；！？）】》”’.,:;!?)]$/;

function tokenizeMixedText(str) {
  const normalized = String(str ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!normalized) return [];
  return normalized.match(/[A-Za-z0-9_$%]+(?:[._\-/+,][A-Za-z0-9_$%+]+)*|\s+|./gu) || [];
}

function truncateWithEllipsis(ctx, text, maxWidth) {
  const clean = String(text ?? '').trimEnd();
  if (!clean || maxWidth <= 0) return '';
  if (ctx.measureText(clean).width <= maxWidth) return clean;
  const ellipsis = '…';
  const chars = Array.from(clean);
  let lo = 0;
  let hi = chars.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(chars.slice(0, mid).join('').trimEnd() + ellipsis).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return chars.slice(0, lo).join('').trimEnd() + ellipsis;
}

function wrapText(ctx, text, maxWidth, maxLines = 2) {
  const tokens = tokenizeMixedText(text);
  if (!tokens.length || maxLines <= 0) return [];
  const lines = [];
  let current = '';
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (current === '' && /^\s+$/.test(token)) continue;
    const candidate = current + token;
    const width = ctx.measureText(candidate).width;
    if (width <= maxWidth || (CLOSING_PUNCT_RE.test(token) && current && width <= maxWidth + 10)) {
      current = candidate;
      continue;
    }
    if (lines.length === maxLines - 1) {
      lines.push(truncateWithEllipsis(ctx, (current + tokens.slice(i).join('')).trim(), maxWidth));
      return lines;
    }
    if (current) {
      lines.push(current.trimEnd());
      current = '';
      if (!/^\s+$/.test(token)) i -= 1;
      continue;
    }
    // Single token wider than the line: hard-split by characters.
    const chars = Array.from(token);
    let chunk = '';
    let consumed = 0;
    for (let c = 0; c < chars.length; c += 1) {
      if (ctx.measureText(chunk + chars[c]).width <= maxWidth || consumed === 0) {
        chunk += chars[c];
        consumed = c + 1;
      } else break;
    }
    lines.push(chunk);
    const rest = chars.slice(consumed).join('');
    if (rest) {
      tokens[i] = rest;
      i -= 1;
    }
  }
  if (current.trim()) lines.push(current.trimEnd());
  return lines;
}

function hexToRgba(hex, alpha) {
  const clean = String(hex).replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const num = Number.parseInt(full, 16);
  return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`;
}

/* ==========================================================================
   Brand drawing primitives (same vector DNA as poster.js)
   ========================================================================== */

function drawMastheadOpticalArcs(ctx, palette) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 72, POSTER_WIDTH, 98);
  ctx.clip();
  const cx = POSTER_WIDTH - 64;
  const cy = 118;
  [24, 48, 76, 108].forEach((r, idx) => {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = idx < 2 ? palette.artPrimary : palette.artSecondary;
    ctx.lineWidth = 1;
    ctx.stroke();
  });
  ctx.beginPath();
  ctx.arc(cx, cy, 3.2, 0, Math.PI * 2);
  ctx.fillStyle = palette.accent;
  ctx.fill();
  ctx.restore();
}

// Same 74 x 32 outlines and fill rules as #radar-lettering in index.html.
function drawRadarWordmark(ctx, x, y, height) {
  const scale = height / 32;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fill(new Path2D('M6 1h5l3 6h-4z M24 1h5l-5 7h-4z M1 8h33l-2 2.5H1z'));
  ctx.fill(new Path2D('M4 13h14v15.5L15 32h-4l3-4V15.5H8v6.7c0 4.5-1.6 7.7-5.5 9.4 1.1-2.9 1.5-6.6 1.5-10.2z'));
  ctx.fill(new Path2D('M7 18.2h8v2H7z M7 23h8v2H7z M21 14h3.5v12H21z M28 12h4v16.5L28.5 32H24l4-4.5z'));
  ctx.fill(new Path2D('M39 9h10.5v17H43v2h-4z M43 11.5v12h3v-12z'), 'evenodd');
  ctx.fill(new Path2D('M59 0h4.5v11H59z M50.5 3H54l3.5 6H54z M68.5 2H73l-5 7h-3.5z'));
  ctx.fill(new Path2D('M52 11h19v17.5L67.5 32h-4.8l4.1-4.5V13.6H56V32h-4z M55 17.4h13v2.1H55z M55 23h13v2.1H55z'));
  ctx.restore();
  return 74 * scale;
}

function drawFooterMonogram(ctx, x, y, palette) {
  ctx.save();
  const rOuter = 14;
  const rInner = 8;
  const gapStart = -Math.PI / 4 - 0.28;
  const gapEnd = -Math.PI / 4 + 0.28;
  ctx.lineCap = 'round';
  ctx.strokeStyle = palette.hairline;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(x, y, rOuter, gapEnd, gapStart + Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = palette.mutedInk;
  ctx.beginPath();
  ctx.arc(x, y, rInner, -Math.PI / 2, 0);
  ctx.stroke();
  ctx.strokeStyle = palette.ink;
  ctx.lineWidth = 2.1;
  ctx.beginPath();
  ctx.arc(x, y, rOuter, -Math.PI / 2, gapStart);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, rOuter, gapEnd, 0);
  ctx.stroke();
  ctx.strokeStyle = palette.mutedInk;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(x + 2.4, y - 2.4);
  ctx.lineTo(x + 6.6, y - 6.6);
  ctx.stroke();
  ctx.fillStyle = palette.ink;
  ctx.beginPath();
  ctx.arc(x, y, 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = palette.accent;
  ctx.beginPath();
  ctx.arc(x + rOuter * Math.SQRT1_2, y - rOuter * Math.SQRT1_2, 3.0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawQr(ctx, href, right, top, maxSize = 132) {
  const code = qrcode(0, 'M');
  code.addData(href, 'Byte');
  code.make();
  const count = code.getModuleCount();
  const quietZone = 4;
  const unit = Math.max(1, Math.floor(maxSize / (count + 2 * quietZone)));
  const size = (count + 2 * quietZone) * unit;
  const left = right - size;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(left, top, size, size);
  ctx.fillStyle = '#111111';
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (code.isDark(row, col)) {
        ctx.fillRect(left + (quietZone + col) * unit, top + (quietZone + row) * unit, unit, unit);
      }
    }
  }
  return size;
}

/* ==========================================================================
   Poster composition
   ========================================================================== */

const pad2 = (n) => String(n).padStart(2, '0');

function measureStepRow(ctx, row, width, sentenceMaxLines, pad = 22) {
  ctx.font = `400 15.5px ${FONT_SANS}`;
  const sentenceLines = row.sentence ? wrapText(ctx, row.sentence, width, sentenceMaxLines) : [];
  // row padding + title line 26 + gap 8 + sentence lines * 25 + row padding
  const height = pad + 26 + (sentenceLines.length ? 8 + sentenceLines.length * 25 : 0) + pad;
  return { ...row, sentenceLines, height, pad };
}

export function drawGuidePoster(canvas, guide, options = {}) {
  if (!canvas || typeof canvas.getContext !== 'function' || !guide) return;
  canvas.width = POSTER_WIDTH;
  canvas.height = POSTER_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const palette = POSTER_STYLES[options.style] || POSTER_STYLES['apple-light'];
  const steps = Array.isArray(guide.steps) ? guide.steps : [];
  const totalSteps = steps.length;
  const focusStep = Number.isFinite(options.step) && options.step >= 1 && options.step <= totalSteps ? options.step : 0;
  const shareHref = options.href || buildGuideShareLink(guide.id, focusStep || null);

  const left = 52;
  const right = POSTER_WIDTH - 52;
  const contentW = right - left;

  // 1. Gallery canvas + optical arcs
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);
  drawMastheadOpticalArcs(ctx, palette);

  // 2. Masthead
  ctx.save();
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.font = `400 12px ${FONT_MONO}`;
  ctx.fillStyle = palette.mutedInk;
  ctx.fillText('RADAR · PRACTICAL GUIDE', left, 52);
  ctx.font = `400 12.5px ${FONT_SANS}`;
  ctx.textAlign = 'right';
  const orderLabel = Number(guide.order) > 0 ? `第 ${pad2(guide.order)} 课 · ` : '';
  ctx.fillText(truncateWithEllipsis(ctx, `${orderLabel}${guide.track || '实战教程'}`, 260), right, 51);

  ctx.font = `300 44px ${FONT_DISPLAY}`;
  ctx.fillStyle = palette.ink;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const baseline = 131;
  const ink = ctx.measureText('实战教程');
  const markHeight = ink.actualBoundingBoxAscent + ink.actualBoundingBoxDescent;
  const markWidth = drawRadarWordmark(ctx, left, baseline - ink.actualBoundingBoxAscent, markHeight);
  ctx.fillText('· 实战教程', left + markWidth + 12, baseline);

  ctx.strokeStyle = palette.strongRule;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(left, 170);
  ctx.lineTo(right, 170);
  ctx.stroke();
  ctx.restore();

  // 3. Course hero
  ctx.save();
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  let y = 204;
  ctx.font = `300 40px ${FONT_DISPLAY}`;
  ctx.fillStyle = palette.ink;
  const titleLines = wrapText(ctx, guide.title || '未命名课程', contentW, 3);
  titleLines.forEach((line, idx) => ctx.fillText(line, left, y + idx * 52));
  y += Math.max(1, titleLines.length) * 52 + 10;

  if (guide.summary) {
    ctx.font = `400 18px ${FONT_SANS}`;
    ctx.fillStyle = palette.bodyInk;
    const summaryLines = wrapText(ctx, guide.summary, contentW, 3);
    summaryLines.forEach((line, idx) => ctx.fillText(line, left, y + idx * 30));
    y += summaryLines.length * 30 + 12;
  }

  ctx.textBaseline = 'middle';
  const metaY = y + 10;
  ctx.font = `400 13px ${FONT_SANS}`;
  ctx.fillStyle = palette.mutedInk;
  const metaText = [`共 ${totalSteps} 个实操步骤`, guide.updated_at ? `更新于 ${guide.updated_at}` : '']
    .filter(Boolean)
    .join(' · ');
  ctx.fillText(metaText, left, metaY);
  if (focusStep) {
    ctx.font = `500 12.5px ${FONT_MONO}`;
    ctx.fillStyle = palette.accent;
    ctx.textAlign = 'right';
    ctx.fillText(`直达步骤 · STEP ${pad2(focusStep)} / ${pad2(totalSteps)}`, right, metaY);
  }
  ctx.restore();
  y = metaY + 30;

  // 4. Outline panel with first-sentence previews + fade-out veil
  const footRuleY = 1184;
  const panelTop = y;
  const panelMaxBottom = footRuleY - 32;
  const ctaH = 58;
  const panelPadX = 30;
  const innerLeft = left + panelPadX;
  const innerRight = right - panelPadX;
  const innerW = innerRight - innerLeft;
  const headerH = 46;
  const listTop = panelTop + headerH;
  const listMaxBottom = panelMaxBottom - ctaH;

  const sentenceMaxLines = totalSteps <= 4 ? 3 : 2;
  const rowSpecs = steps.map((step, idx) => ({
    num: idx + 1,
    title: String(step?.title || '').trim() || `第 ${idx + 1} 步`,
    sentence: extractStepFirstSentence(step?.markdown || ''),
  }));
  const listAreaH = Math.max(120, listMaxBottom - listTop);
  let rows = rowSpecs.map((spec) => measureStepRow(ctx, spec, innerW - 46, sentenceMaxLines));
  const fadeHFor = (h) => Math.max(160, Math.round(h * 0.38));
  const MIN_VEIL = 150;

  // Window the outline (fold the earliest steps only when necessary) so the shared step
  // and at least a minimal veil both fit, keeping the focus row in the sharp zone.
  let startIdx = 0;
  const foldNoteH = 30;
  const focusBottomFrom = (from) => {
    let acc = from > 0 ? foldNoteH : 0;
    for (let i = from; i < focusStep; i += 1) acc += rows[i].height;
    return acc;
  };
  if (focusStep) {
    while (startIdx < focusStep - 1 && focusBottomFrom(startIdx) + MIN_VEIL > listAreaH) startIdx += 1;
  }

  // Short courses: breathe the row rhythm out instead of leaving a dead gap above the colophon.
  const visibleCount = rows.length - startIdx;
  if (visibleCount > 0) {
    const afterFocusH = focusStep ? rows.slice(focusStep).reduce((sum, row) => sum + row.height, 0) : 0;
    const requiredH = focusStep
      ? focusBottomFrom(startIdx) + Math.max(MIN_VEIL, afterFocusH)
      : rows.reduce((sum, row) => sum + row.height, 0);
    const extraPad = Math.min(44, Math.floor((listAreaH - requiredH) / (visibleCount * 2)));
    if (extraPad > 0) {
      rows = rowSpecs.map((spec) => measureStepRow(ctx, spec, innerW - 46, sentenceMaxLines, 22 + extraPad));
    }
  }

  const visibleRows = rows.slice(startIdx);
  const drawnListH = Math.min(
    listAreaH,
    (startIdx > 0 ? foldNoteH : 0) + visibleRows.reduce((sum, row) => sum + row.height, 0)
  );
  let listBottom = listTop + drawnListH;
  let fadeTop = listBottom - fadeHFor(drawnListH);

  // Keep the shared step crisp even when it sits near the end of the outline.
  if (focusStep) {
    const focusBottom = listTop + focusBottomFrom(startIdx);
    if (fadeTop < focusBottom + 4) {
      fadeTop = focusBottom + 4;
      listBottom = Math.min(listMaxBottom, Math.max(listBottom, fadeTop + MIN_VEIL));
    }
  }
  const panelBottom = panelMaxBottom;

  ctx.save();
  ctx.fillStyle = palette.panelBg;
  ctx.fillRect(left, panelTop, contentW, panelBottom - panelTop);

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = `400 11.5px ${FONT_MONO}`;
  ctx.fillStyle = palette.mutedInk;
  ctx.fillText('COURSE OUTLINE · 分步大纲预览', innerLeft, panelTop + 24);
  ctx.textAlign = 'right';
  ctx.fillText(`${pad2(totalSteps)} STEPS`, innerRight, panelTop + 24);
  ctx.strokeStyle = palette.hairline;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(innerLeft, listTop - 0.5);
  ctx.lineTo(innerRight, listTop - 0.5);
  ctx.stroke();

  ctx.beginPath();
  ctx.rect(left, listTop, contentW, listBottom - listTop);
  ctx.clip();

  let rowY = listTop;
  if (startIdx > 0) {
    ctx.textAlign = 'left';
    ctx.font = `400 12px ${FONT_MONO}`;
    ctx.fillStyle = palette.faintInk;
    ctx.fillText(`STEP 01 – ${pad2(startIdx)} 已折叠 · 扫码查看完整前序步骤`, innerLeft, rowY + foldNoteH / 2);
    rowY += foldNoteH;
  }

  for (const row of visibleRows) {
    if (rowY >= listBottom) break;
    const isFocus = row.num === focusStep;
    if (row.num !== (startIdx + 1) || startIdx > 0) {
      ctx.strokeStyle = palette.hairline;
      ctx.beginPath();
      ctx.moveTo(innerLeft, rowY + 0.5);
      ctx.lineTo(innerRight, rowY + 0.5);
      ctx.stroke();
    }
    if (isFocus) {
      ctx.fillStyle = palette.accent;
      ctx.fillRect(innerLeft - 16, rowY + row.pad - 4, 2, row.height - row.pad * 2 + 8);
    }

    const titleY = rowY + row.pad + 13;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = `500 13px ${FONT_MONO}`;
    ctx.fillStyle = isFocus ? palette.accent : palette.faintInk;
    ctx.fillText(pad2(row.num), innerLeft, titleY);

    const tagW = isFocus ? 104 : 0;
    ctx.font = `500 18px ${FONT_SANS}`;
    ctx.fillStyle = palette.ink;
    ctx.fillText(truncateWithEllipsis(ctx, row.title, innerW - 46 - tagW), innerLeft + 46, titleY);

    if (isFocus) {
      ctx.font = `500 11.5px ${FONT_MONO}`;
      ctx.fillStyle = palette.accent;
      ctx.textAlign = 'right';
      ctx.fillText('当前分享步骤', innerRight, titleY);
      ctx.textAlign = 'left';
    }

    if (row.sentenceLines.length) {
      ctx.textBaseline = 'top';
      ctx.font = `400 15.5px ${FONT_SANS}`;
      ctx.fillStyle = palette.bodyInk;
      row.sentenceLines.forEach((line, idx) => {
        ctx.fillText(line, innerLeft + 46, rowY + row.pad + 26 + 8 + idx * 25);
      });
    }
    rowY += row.height;
  }
  ctx.restore();

  // Fade-out veil: multi-stop alpha ramp that melts the later steps into the panel tone.
  ctx.save();
  const veil = ctx.createLinearGradient(0, fadeTop, 0, listBottom);
  veil.addColorStop(0, hexToRgba(palette.panelBg, 0));
  veil.addColorStop(0.22, hexToRgba(palette.panelBg, 0.18));
  veil.addColorStop(0.45, hexToRgba(palette.panelBg, 0.45));
  veil.addColorStop(0.72, hexToRgba(palette.panelBg, 0.78));
  veil.addColorStop(0.88, hexToRgba(palette.panelBg, 0.94));
  veil.addColorStop(1, hexToRgba(palette.panelBg, 1));
  ctx.fillStyle = veil;
  ctx.fillRect(left, fadeTop, contentW, listBottom - fadeTop);
  ctx.fillStyle = palette.panelBg;
  ctx.fillRect(left, listBottom, contentW, panelBottom - listBottom);

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = `500 15px ${FONT_SANS}`;
  ctx.fillStyle = palette.accent;
  const cta = focusStep
    ? `扫码直达第 ${focusStep} 步并查看完整图文实操 →`
    : `扫码阅读完整 ${totalSteps} 步图文实操与命令细节 →`;
  ctx.fillText(truncateWithEllipsis(ctx, cta, innerW), innerLeft, panelBottom - ctaH / 2 - 2);
  ctx.restore();

  // 5. Colophon footer
  ctx.save();
  ctx.strokeStyle = palette.hairline;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(left, footRuleY);
  ctx.lineTo(right, footRuleY);
  ctx.stroke();

  drawFooterMonogram(ctx, left + 16, footRuleY + 40, palette);
  ctx.fillStyle = palette.ink;
  const markLeft = left + 44;
  const footerMarkWidth = drawRadarWordmark(ctx, markLeft, footRuleY + 29, 22);
  ctx.font = `400 13px ${FONT_MONO}`;
  ctx.fillStyle = palette.mutedInk;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText('RADAR', markLeft + footerMarkWidth + 12, footRuleY + 40);

  ctx.textBaseline = 'top';
  ctx.font = `400 15px ${FONT_MONO}`;
  ctx.fillStyle = palette.ink;
  ctx.fillText(PUBLIC_ORIGIN, left, footRuleY + 74, contentW - 160);
  ctx.font = `400 12.5px ${FONT_SANS}`;
  ctx.fillStyle = palette.faintInk;
  ctx.fillText('前哨 · 前沿 AI 情报与实战教程', left, footRuleY + 101, contentW - 160);
  drawQr(ctx, shareHref, right, footRuleY + 8);
  ctx.restore();
}

/* ==========================================================================
   Share dialog
   ========================================================================== */

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
}

function createCloseSvg() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'guide-share-close-icon');
  for (const [x1, y1, x2, y2] of [['18', '6', '6', '18'], ['6', '6', '18', '18']]) {
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', x1);
    line.setAttribute('y1', y1);
    line.setAttribute('x2', x2);
    line.setAttribute('y2', y2);
    svg.appendChild(line);
  }
  return svg;
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    if (typeof canvas.toBlob !== 'function') {
      reject(new Error('toBlob unavailable'));
      return;
    }
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG encoding failed'))), 'image/png');
  });
}

async function downloadCanvas(canvas, filename) {
  let href = '';
  let revoke = false;
  try {
    href = URL.createObjectURL(await canvasToBlob(canvas));
    revoke = true;
  } catch {
    href = canvas.toDataURL('image/png');
  }
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  if (revoke) setTimeout(() => URL.revokeObjectURL(href), 1500);
}

function currentSiteStyle() {
  const root = document.documentElement;
  return root.classList.contains('dark') || root.dataset.theme === 'dark' ? 'space-gray' : 'apple-light';
}

export function initGuideShare({ mountRoot, onToast } = {}) {
  const notify = (msg, type = 'info') => {
    if (typeof onToast === 'function') onToast(msg, type);
  };
  const root = mountRoot || document.getElementById('guide-share-root') || document.body;

  let isOpen = false;
  let activeGuide = null;
  let contextStep = 0;
  let scope = 'course'; // 'course' | 'step'
  let style = 'apple-light';
  let trigger = null;
  let previousOverflow = '';

  const backdrop = el('div', 'guide-share-backdrop');
  backdrop.hidden = true;
  backdrop.dataset.open = 'false';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-labelledby', 'guide-share-title');

  const dialog = el('div', 'guide-share-dialog');

  const header = el('div', 'guide-share-header');
  const headingWrap = el('div', 'guide-share-heading');
  const kicker = el('p', 'guide-share-kicker', 'SHARE · 课程分享海报');
  const heading = el('h2', 'guide-share-title', '分享本课');
  heading.id = 'guide-share-title';
  headingWrap.append(kicker, heading);
  const closeBtn = el('button', 'guide-share-close');
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', '关闭分享海报');
  closeBtn.append(el('span', '', '关闭'), createCloseSvg());
  header.append(headingWrap, closeBtn);

  const body = el('div', 'guide-share-body');
  const preview = el('section', 'guide-share-preview');
  preview.setAttribute('aria-label', '750 x 1334 课程海报预览');
  const canvas = document.createElement('canvas');
  canvas.width = POSTER_WIDTH;
  canvas.height = POSTER_HEIGHT;
  canvas.className = 'guide-share-canvas';
  canvas.setAttribute('role', 'img');
  const previewMeta = el('p', 'guide-share-preview-meta', '750 × 1334 竖屏高清海报');
  preview.append(canvas, previewMeta);

  const side = el('section', 'guide-share-side');
  side.setAttribute('aria-label', '分享设置');

  const buildSwitch = (label, options, onPick) => {
    const group = el('div', 'guide-share-field');
    const caption = el('p', 'guide-share-field-label', label);
    const tabs = el('div', 'guide-share-tabs');
    tabs.setAttribute('role', 'group');
    tabs.setAttribute('aria-label', label);
    const buttons = new Map();
    for (const opt of options) {
      const btn = el('button', 'guide-share-tab', opt.label);
      btn.type = 'button';
      btn.dataset.value = opt.key;
      btn.addEventListener('click', () => onPick(opt.key));
      buttons.set(opt.key, btn);
      tabs.appendChild(btn);
    }
    group.append(caption, tabs);
    return { group, buttons };
  };

  const scopeSwitch = buildSwitch('分享粒度', [
    { key: 'course', label: '整门课程' },
    { key: 'step', label: '当前步骤' },
  ], (key) => {
    if (key === scope) return;
    scope = key;
    redraw();
  });
  scopeSwitch.group.dataset.guideShareScope = '';

  const styleSwitch = buildSwitch('海报外观', STYLE_OPTIONS, (key) => {
    if (key === style) return;
    style = key;
    redraw();
  });
  styleSwitch.group.dataset.guideShareStyle = '';

  const linkField = el('div', 'guide-share-field');
  const linkLabel = el('p', 'guide-share-field-label', '直达链接');
  const linkText = el('p', 'guide-share-link');
  linkText.dataset.guideShareUrl = '';
  linkField.append(linkLabel, linkText);

  const note = el('p', 'guide-share-note', '海报二维码与复制链接统一指向正式站点 radarqs.fyi，扫码即可在手机端打开对应课程。');
  side.append(scopeSwitch.group, styleSwitch.group, linkField, note);
  body.append(preview, side);

  const footer = el('div', 'guide-share-footer');
  const fileMeta = el('span', 'guide-share-file', 'radar-guide.png');
  const actions = el('div', 'guide-share-actions');
  const copyImageBtn = el('button', 'guide-share-action', '复制海报图片');
  copyImageBtn.type = 'button';
  copyImageBtn.dataset.guideShareCopyImage = '';
  const copyTextBtn = el('button', 'guide-share-action', '复制推荐文案与链接');
  copyTextBtn.type = 'button';
  copyTextBtn.dataset.guideShareCopyText = '';
  const downloadBtn = el('button', 'guide-share-action guide-share-action-primary', '下载 PNG 海报');
  downloadBtn.type = 'button';
  downloadBtn.dataset.guideShareDownload = '';
  actions.append(copyTextBtn, copyImageBtn, downloadBtn);
  footer.append(fileMeta, actions);

  dialog.append(header, body, footer);
  backdrop.appendChild(dialog);
  if (root === document.body) root.appendChild(backdrop);
  else root.replaceChildren(backdrop);

  function focusStep() {
    return scope === 'step' && contextStep >= 1 ? contextStep : 0;
  }

  function currentHref() {
    return buildGuideShareLink(activeGuide?.id, focusStep() || null);
  }

  function currentFilename() {
    const step = focusStep();
    return `radar-guide-${activeGuide?.id || 'lesson'}${step ? `-step-${step}` : ''}.png`;
  }

  function syncControls() {
    const hasStep = contextStep >= 1;
    scopeSwitch.group.hidden = !hasStep;
    const stepBtn = scopeSwitch.buttons.get('step');
    if (stepBtn) stepBtn.textContent = hasStep ? `当前第 ${contextStep} 步` : '当前步骤';
    for (const [key, btn] of scopeSwitch.buttons) {
      const active = key === scope;
      btn.dataset.active = String(active);
      btn.setAttribute('aria-pressed', String(active));
    }
    for (const [key, btn] of styleSwitch.buttons) {
      const active = key === style;
      btn.dataset.active = String(active);
      btn.setAttribute('aria-pressed', String(active));
    }
  }

  function redraw() {
    if (!activeGuide) return;
    syncControls();
    const step = focusStep();
    const href = currentHref();
    drawGuidePoster(canvas, activeGuide, { style, step, href });
    canvas.dataset.style = style;
    canvas.setAttribute('aria-label', `课程海报预览：${activeGuide.title}${step ? `，直达第 ${step} 步` : ''}`);
    linkText.textContent = href;
    fileMeta.textContent = currentFilename();
    const styleName = STYLE_OPTIONS.find((opt) => opt.key === style)?.label || '';
    previewMeta.textContent = `750 × 1334 · ${styleName}${step ? ` · 直达第 ${step} 步` : ' · 整门课程'}`;
  }

  function focusables() {
    return [...dialog.querySelectorAll('button:not([disabled])')].filter((node) => !node.closest('[hidden]'));
  }

  function open(guide, { step = null, trigger: triggerEl = null } = {}) {
    if (!guide) return;
    activeGuide = guide;
    const total = Array.isArray(guide.steps) ? guide.steps.length : 0;
    const parsed = Number.parseInt(String(step ?? ''), 10);
    contextStep = Number.isFinite(parsed) && parsed >= 1 && parsed <= total ? parsed : 0;
    scope = contextStep >= 2 ? 'step' : 'course';
    style = currentSiteStyle();
    trigger = triggerEl;
    heading.textContent = `分享《${guide.title}》`;
    redraw();
    if (!isOpen) {
      isOpen = true;
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      backdrop.hidden = false;
      requestAnimationFrame(() => {
        backdrop.dataset.open = 'true';
      });
    }
    closeBtn.focus({ preventScroll: true });
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    backdrop.dataset.open = 'false';
    backdrop.hidden = true;
    document.body.style.overflow = previousOverflow;
    if (trigger && trigger.isConnected) trigger.focus({ preventScroll: true });
    trigger = null;
  }

  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', (evt) => {
    if (evt.target === backdrop) close();
  });
  document.addEventListener('keydown', (evt) => {
    if (!isOpen) return;
    if (evt.key === 'Escape') {
      evt.preventDefault();
      evt.stopPropagation();
      close();
      return;
    }
    if (evt.key === 'Tab') {
      const nodes = focusables();
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (evt.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        evt.preventDefault();
        last.focus();
      } else if (!evt.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        evt.preventDefault();
        first.focus();
      }
    }
  });
  window.addEventListener('popstate', close);

  copyImageBtn.addEventListener('click', async () => {
    if (!activeGuide) return;
    if (!navigator.clipboard?.write || typeof ClipboardItem !== 'function') {
      notify('当前浏览器不支持直接复制图片，请使用「下载 PNG 海报」', 'info');
      return;
    }
    redraw();
    try {
      // Hand the pending blob to ClipboardItem inside the click gesture (Safari-friendly).
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': canvasToBlob(canvas) })]);
      notify('已复制课程海报，可直接粘贴发送', 'success');
    } catch {
      notify('图片复制失败，请使用「下载 PNG 海报」', 'info');
    }
  });

  downloadBtn.addEventListener('click', async () => {
    if (!activeGuide) return;
    redraw();
    downloadBtn.disabled = true;
    try {
      await downloadCanvas(canvas, currentFilename());
      notify('课程海报已保存', 'success');
    } catch {
      notify('导出失败，请检查下载权限', 'error');
    } finally {
      downloadBtn.disabled = false;
    }
  });

  copyTextBtn.addEventListener('click', async () => {
    if (!activeGuide) return;
    const step = focusStep();
    const stepTitle = step ? String(activeGuide.steps?.[step - 1]?.title || '').trim() : '';
    const lines = [`【前哨 Radar · 实战教程】${activeGuide.title}`];
    if (activeGuide.summary) lines.push(activeGuide.summary);
    if (step) lines.push(`直达第 ${step} 步${stepTitle ? `：${stepTitle}` : ''}`);
    lines.push(`直达阅读：${currentHref()}`);
    const ok = await copyTextToClipboard(lines.join('\n'));
    notify(ok ? '已复制推荐文案与链接' : '复制失败，请检查剪贴板权限', ok ? 'success' : 'error');
  });

  if (document.fonts?.ready) {
    document.fonts.ready.then(() => {
      if (isOpen) redraw();
    });
  }

  return {
    open,
    close,
    redraw,
    isOpen: () => isOpen,
    getScope: () => scope,
    getStyle: () => style,
    getHref: () => (activeGuide ? currentHref() : ''),
  };
}
