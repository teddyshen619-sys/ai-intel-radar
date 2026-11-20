import { qrcode } from './qrcode.js';

/**
 * AI Intel Radar — Apple Keynote / Google Editorial Canvas 2D Poster Generator
 * 750x1334 portrait PNG · Zero external dependencies · Zero cross-origin assets · Zero Emojis
 * Safe DOM API + textContent throughout (XSS-safe)
 */

const POSTER_WIDTH = 750;
const POSTER_HEIGHT = 1334;

const MIN_SELECTION = 1;
const MAX_SELECTION = 4;
const DEFAULT_SELECTION_LIMIT = 3;
const DEFAULT_POSTER_STYLE = 'apple-light';

const SVG_NS = 'http://www.w3.org/2000/svg';

const FONT_DISPLAY =
  '"DM Sans", "Noto Sans SC", "SF Pro Display", "PingFang SC", "Microsoft YaHei Light", "DengXian Light", "Helvetica Neue", sans-serif';
const FONT_SANS =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Google Sans", "Helvetica Neue", "Microsoft YaHei", sans-serif';
const FONT_MONO =
  '"IBM Plex Mono", "SF Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

const STATUS_WEIGHT = Object.freeze({
  URGENT: 3,
  ACTIVE: 2,
  FIXED: 1,
});

const TYPE_LABELS = Object.freeze({
  BENCHMARK: '深度评测',
  VIDEO: '视频拆解',
  DEAL: '算力羊毛',
  BUG: '漏洞避坑',
  HACK: '极客技巧',
  MODEL: '新模型',
  PRODUCT: '新产品',
  POLICY: '新条款与定价',
});

export const POSTER_STYLES = Object.freeze({
  'apple-light': Object.freeze({
    id: 'apple-light',
    name: '极简白',
    bg: '#FFFFFF',
    panelBg: '#F5F5F7',
    leadPanelBg: '#F2F3F7',
    leadUrgentBg: '#F7F2F2',
    ink: '#1D1D1F',
    bodyInk: '#424245',
    mutedInk: '#6E6E73',
    faintInk: '#86868B',
    accent: '#0066CC',
    urgent: '#C5221F',
    urgentDot: '#D93025',
    activeDot: '#188038',
    hairline: 'rgba(0, 0, 0, 0.09)',
    strongRule: 'rgba(0, 0, 0, 0.16)',
    artPrimary: 'rgba(0, 102, 204, 0.16)',
    artSecondary: 'rgba(29, 29, 31, 0.06)',
    codeBg: '#FFFFFF',
    codeBorder: 'rgba(0, 0, 0, 0.09)',
    codeInk: '#1D1D1F',
  }),
  'space-gray': Object.freeze({
    id: 'space-gray',
    name: '深空灰',
    bg: '#0B0C0E',
    panelBg: '#141519',
    leadPanelBg: '#171921',
    leadUrgentBg: '#1E1618',
    ink: '#F5F5F7',
    bodyInk: '#C7C7CC',
    mutedInk: '#8E8E93',
    faintInk: '#6E6E73',
    accent: '#2997FF',
    urgent: '#FF6961',
    urgentDot: '#FF453A',
    activeDot: '#30D158',
    hairline: 'rgba(255, 255, 255, 0.10)',
    strongRule: 'rgba(255, 255, 255, 0.18)',
    artPrimary: 'rgba(41, 151, 255, 0.22)',
    artSecondary: 'rgba(255, 255, 255, 0.07)',
    codeBg: '#0E1014',
    codeBorder: 'rgba(255, 255, 255, 0.11)',
    codeInk: '#E5E5EA',
  }),
});

function normalizeStyleKey(styleKey) {
  return Object.prototype.hasOwnProperty.call(POSTER_STYLES, styleKey)
    ? styleKey
    : DEFAULT_POSTER_STYLE;
}

function sortItemsByValue(items) {
  if (!Array.isArray(items)) return [];
  return [...items]
    .filter((it) => it && typeof it === 'object')
    .sort((a, b) => {
      const weightDiff =
        (STATUS_WEIGHT[b.status] ?? 0) - (STATUS_WEIGHT[a.status] ?? 0);
      if (weightDiff !== 0) return weightDiff;

      const prioDiff = (Number(b.priority) || 0) - (Number(a.priority) || 0);
      if (prioDiff !== 0) return prioDiff;

      const dateCmp = String(b.date || '').localeCompare(String(a.date || ''));
      if (dateCmp !== 0) return dateCmp;

      return String(b.id || '').localeCompare(String(a.id || ''));
    });
}

function formatLocalDate(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function resolvePosterDate(meta = {}) {
  const candidates = [meta?.date, meta?.updatedAt, meta?.updated_at];
  for (const raw of candidates) {
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    const directMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
    if (directMatch) return directMatch[1];
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) return formatLocalDate(parsed);
  }
  return formatLocalDate(new Date());
}

function formatHumanCnDate(isoDateStr) {
  const match = String(isoDateStr ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return isoDateStr;
  return `${Number(match[1])}年${Number(match[2])}月${Number(match[3])}日`;
}


function tokenizeMixedText(str) {
  const normalized = String(str ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!normalized) return [];
  const regex = /[A-Za-z0-9_$%]+(?:[._\-/+,][A-Za-z0-9_$%+]+)*|\s+|./gu;
  return normalized.match(regex) || [];
}

function truncateWithEllipsis(ctx, text, maxWidth) {
  const clean = String(text ?? '').trimEnd();
  if (!clean || maxWidth <= 0) return '';
  if (ctx.measureText(clean).width <= maxWidth) return clean;

  const ellipsis = '…';
  if (ctx.measureText(ellipsis).width >= maxWidth) return ellipsis;

  const chars = Array.from(clean);
  let lo = 0;
  let hi = chars.length;

  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate = chars.slice(0, mid).join('').trimEnd();
    if (ctx.measureText(candidate + ellipsis).width <= maxWidth) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return chars.slice(0, lo).join('').trimEnd() + ellipsis;
}

const CLOSING_PUNCT_RE = /^[，。、：；！？）】》”’.,:;!?)]$/;
const CJK_CHAR_RE = /^[\u4e00-\u9fff]$/;
const TRAILING_OPEN_PUNCT_RE = /(?:^|\s)([“‘（(【《"])$/;
const TRAILING_ASCII_WORD_RE = /([A-Za-z0-9_$%][A-Za-z0-9_$%._\-/+,]*)$/;

function wrapText(ctx, text, maxWidth, maxLines = 2) {
  if (maxLines <= 0 || maxWidth <= 0) {
    return { lines: [], truncated: false };
  }
  const tokens = tokenizeMixedText(text);
  if (tokens.length === 0) return { lines: [], truncated: false };

  const lines = [];
  let current = '';
  let truncated = false;

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (current === '' && /^\s+$/.test(token)) continue;

    const candidate = current + token;
    const candidateW = ctx.measureText(candidate).width;
    const isClosingPunct = CLOSING_PUNCT_RE.test(token);

    if (
      candidateW <= maxWidth ||
      (isClosingPunct && current !== '' && candidateW <= maxWidth + 10)
    ) {
      current = candidate;
      continue;
    }

    if (lines.length === maxLines - 1) {
      const remainder = (current + tokens.slice(i).join('')).trim();
      lines.push(truncateWithEllipsis(ctx, remainder, maxWidth));
      current = '';
      truncated = true;
      break;
    }

    if (current !== '') {
      const trimmedCur = current.trimEnd();
      if (isClosingPunct) {
        const asciiMatch = trimmedCur.match(TRAILING_ASCII_WORD_RE);
        if (asciiMatch && asciiMatch.index > 0) {
          const head = trimmedCur.slice(0, asciiMatch.index).trimEnd();
          if (head) {
            lines.push(head);
            current = asciiMatch[1] + token;
            continue;
          }
        }
        const curChars = Array.from(trimmedCur);
        if (curChars.length > 2 && CJK_CHAR_RE.test(curChars[curChars.length - 1])) {
          const carried = curChars.pop();
          lines.push(curChars.join('').trimEnd());
          current = carried + token;
          continue;
        }
      }

      const openMatch = trimmedCur.match(TRAILING_OPEN_PUNCT_RE);
      if (openMatch) {
        const cutIdx = trimmedCur.length - openMatch[1].length;
        const head = trimmedCur.slice(0, cutIdx).trimEnd();
        if (head) {
          lines.push(head);
          current = openMatch[1];
          if (!/^\s+$/.test(token)) i -= 1;
          continue;
        }
      }

      lines.push(trimmedCur);
      current = '';
      if (!/^\s+$/.test(token)) i -= 1;
      continue;
    }

    const chars = Array.from(token);
    let chunk = '';
    let consumed = 0;
    for (let c = 0; c < chars.length; c += 1) {
      const nextChunk = chunk + chars[c];
      if (ctx.measureText(nextChunk).width <= maxWidth || consumed === 0) {
        chunk = nextChunk;
        consumed = c + 1;
      } else {
        break;
      }
    }
    lines.push(chunk);
    const rest = chars.slice(consumed).join('');
    if (rest) {
      tokens[i] = rest;
      i -= 1;
    }
  }

  if (!truncated && current.trim()) {
    lines.push(current.trimEnd());
  }
  return { lines, truncated };
}

function getLayoutSpec(count, isLead) {
  switch (count) {
    case 1:
      return {
        padX: 36,
        padY: 36,
        titleSize: 32,
        titleLineH: 44,
        titleMaxLines: 3,
        tldrSize: 18.5,
        tldrLineH: 30,
        tldrMaxLines: 4,
        showDetails: true,
        maxDetails: 3,
        detailSize: 15.5,
        detailLineH: 25,
        showSnippet: true,
      };
    case 2:
      return {
        padX: 34,
        padY: 30,
        titleSize: isLead ? 26 : 24,
        titleLineH: isLead ? 36 : 33,
        titleMaxLines: 2,
        tldrSize: 16.5,
        tldrLineH: 26,
        tldrMaxLines: 3,
        showDetails: true,
        maxDetails: 2,
        detailSize: 14.5,
        detailLineH: 22.5,
        showSnippet: false,
      };
    case 3:
      return {
        padX: 30,
        padY: 26,
        titleSize: isLead ? 23 : 21.5,
        titleLineH: isLead ? 31.5 : 29.5,
        titleMaxLines: 2,
        tldrSize: 15,
        tldrLineH: 23.5,
        tldrMaxLines: 3,
        showDetails: false,
        maxDetails: 0,
        detailSize: 14,
        detailLineH: 20,
        showSnippet: false,
      };
    default:
      return {
        padX: 28,
        padY: 20,
        titleSize: isLead ? 19.5 : 18.5,
        titleLineH: isLead ? 26.5 : 25,
        titleMaxLines: 2,
        tldrSize: 13.8,
        tldrLineH: 20.5,
        tldrMaxLines: 2,
        showDetails: false,
        maxDetails: 0,
        detailSize: 13,
        detailLineH: 19,
        showSnippet: false,
      };
  }
}

/**
 * Pure Canvas 2D geometric optical arcs in the masthead top-right (DeepMind / Apple Keynote inspired)
 */
function drawMastheadOpticalArcs(ctx, palette) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 72, POSTER_WIDTH, 98);
  ctx.clip();

  const cx = POSTER_WIDTH - 64;
  const cy = 118;
  const radii = [24, 48, 76, 108];
  radii.forEach((r, idx) => {
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

// Same 74 × 32 outlines and fill rules as #radar-lettering in index.html.
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

  // Whisper orbital ring with true negative-space opening around beacon
  ctx.strokeStyle = palette.hairline;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(x, y, rOuter, gapEnd, gapStart + Math.PI * 2);
  ctx.stroke();

  // Inner harmonic quadrant arc
  ctx.strokeStyle = palette.mutedInk;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(x, y, rInner, -Math.PI / 2, 0);
  ctx.stroke();

  // Leading 90-degree Radar sweep split cleanly around frontier beacon
  ctx.strokeStyle = palette.ink;
  ctx.lineWidth = 2.1;
  ctx.beginPath();
  ctx.arc(x, y, rOuter, -Math.PI / 2, gapStart);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x, y, rOuter, gapEnd, 0);
  ctx.stroke();

  // Subtle 45-degree sightline
  ctx.strokeStyle = palette.mutedInk;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(x + 2.4, y - 2.4);
  ctx.lineTo(x + 6.6, y - 6.6);
  ctx.stroke();

  // Outpost origin pinpoint
  ctx.fillStyle = palette.ink;
  ctx.beginPath();
  ctx.arc(x, y, 2.2, 0, Math.PI * 2);
  ctx.fill();

  // Frontier signal beacon at 45deg northeast
  const bx = x + rOuter * Math.SQRT1_2;
  const by = y - rOuter * Math.SQRT1_2;
  ctx.fillStyle = palette.accent;
  ctx.beginPath();
  ctx.arc(bx, by, 3.0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function buildPosterEyebrow(item) {
  const statusKey = String(item?.status || 'ACTIVE').toUpperCase();
  const typeLabel = TYPE_LABELS[String(item?.type || '').toUpperCase()] || item?.type || '动态';
  const vendor = String(item?.vendor || '').trim();

  if (item.channel === 'REVIEW') {
    return ['测评与视频', typeLabel, vendor, statusKey === 'FIXED' && '已归档'].filter(Boolean).join(' · ');
  }
  if (statusKey === 'FIXED') {
    return [vendor || typeLabel, '已归档'].filter(Boolean).join(' · ');
  }
  return vendor || typeLabel;
}

function drawEditorialPanel(ctx, item, index, bounds, totalCount, palette) {
  const { left, right, top, bottom } = bounds;
  const panelW = right - left;
  const panelH = bottom - top;
  const isLead = index === 0;
  const spec = getLayoutSpec(totalCount, isLead);

  const statusKey = String(item?.status || 'ACTIVE').toUpperCase();
  const isFixed = statusKey === 'FIXED';
  const isUrgent = statusKey === 'URGENT';
  const valueTag = String(item?.metric_badge || item?.value_tag || '').trim();

  ctx.save();

  // 1. Flat architectural tonal panel (Apple Newsroom plane contrast, zero drop shadows)
  ctx.fillStyle = isLead
    ? isUrgent
      ? palette.leadUrgentBg
      : palette.leadPanelBg
    : palette.panelBg;
  ctx.fillRect(left, top, panelW, panelH);

  // Subtle 3px architectural rail on lead #1 story
  if (isLead) {
    ctx.fillStyle = isFixed
      ? palette.faintInk
      : isUrgent
        ? palette.urgentDot
        : palette.accent;
    ctx.fillRect(left, top, 3, panelH);
  }

  const innerLeft = left + spec.padX;
  const innerRight = right - spec.padX;
  const innerW = innerRight - innerLeft;
  let y = top + spec.padY;

  // 2. Quiet Eyebrow Row (Optional vermilion dot for URGENT + Vendor | flush-right value highlight)
  ctx.textBaseline = 'middle';
  const metaY = y + 9;
  let cursorX = innerLeft;

  if (isUrgent) {
    ctx.beginPath();
    ctx.arc(cursorX + 3, metaY, 3, 0, Math.PI * 2);
    ctx.fillStyle = palette.urgentDot;
    ctx.fill();
    cursorX += 13;
  }

  const rightReserve = valueTag ? 185 : 0;
  const eyebrowStr = buildPosterEyebrow(item).toUpperCase();
  ctx.font = `400 12px ${FONT_MONO}`;
  ctx.fillStyle = isFixed ? palette.faintInk : palette.mutedInk;
  ctx.textAlign = 'left';
  ctx.fillText(
    truncateWithEllipsis(ctx, eyebrowStr, Math.max(80, innerRight - rightReserve - cursorX)),
    cursorX,
    metaY
  );

  if (valueTag) {
    ctx.font = `300 ${isLead ? 16 : 15}px ${FONT_DISPLAY}`;
    ctx.fillStyle = isFixed
      ? palette.faintInk
      : isUrgent
        ? palette.urgent
        : palette.accent;
    ctx.textAlign = 'right';
    ctx.fillText(truncateWithEllipsis(ctx, valueTag, 178), innerRight, metaY);
  }

  y += totalCount >= 4 ? 26 : 32;

  // 3. Light-Weight Display Title (Distinct from Regular body summary)
  ctx.font = `300 ${spec.titleSize + 1}px ${FONT_DISPLAY}`;
  ctx.fillStyle = isFixed ? palette.faintInk : palette.ink;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const titleWrap = wrapText(ctx, item?.title || '未命名情报', innerW, spec.titleMaxLines);
  for (let i = 0; i < titleWrap.lines.length; i += 1) {
    const lineY = y + i * spec.titleLineH;
    ctx.fillText(titleWrap.lines[i], innerLeft, lineY);
    if (isFixed) {
      const lw = ctx.measureText(titleWrap.lines[i]).width;
      ctx.strokeStyle = palette.faintInk;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(innerLeft, lineY + spec.titleSize * 0.56);
      ctx.lineTo(innerLeft + lw, lineY + spec.titleSize * 0.56);
      ctx.stroke();
    }
  }
  y += Math.max(1, titleWrap.lines.length) * spec.titleLineH + (totalCount >= 4 ? 8 : 12);

  // 4. Concise Editorial Summary (TLDR)
  // Also adjust footerReserved dynamically so 3-4 item cards gain extra serene bottom breathing room
  const footerReserved = totalCount <= 2 ? spec.padY + 26 : spec.padY;
  const availTldrH = Math.max(spec.tldrLineH, bottom - footerReserved - y);
  const tldrLinesCap = Math.max(
    1,
    Math.min(spec.tldrMaxLines, Math.floor(availTldrH / spec.tldrLineH))
  );
  ctx.font = `400 ${spec.tldrSize}px ${FONT_SANS}`;
  ctx.fillStyle = isFixed ? palette.faintInk : palette.bodyInk;
  const tldrWrap = wrapText(ctx, item?.tldr || '', innerW, tldrLinesCap);
  for (let i = 0; i < tldrWrap.lines.length; i += 1) {
    ctx.fillText(tldrWrap.lines[i], innerLeft, y + i * spec.tldrLineH);
  }
  y += Math.max(1, tldrWrap.lines.length) * spec.tldrLineH + 14;

  // 5. Spacious Mode (1-2 items): Numbered Editorial Takeaways
  if (spec.showDetails && Array.isArray(item?.details) && item.details.length > 0) {
    const safeDetailBottom = bottom - footerReserved - 12;
    const detailsList = item.details.slice(0, spec.maxDetails);

    if (safeDetailBottom - y >= spec.detailLineH + 18) {
      ctx.strokeStyle = palette.hairline;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(innerLeft, y);
      ctx.lineTo(innerRight, y);
      ctx.stroke();
      y += 18;

      for (let dIdx = 0; dIdx < detailsList.length; dIdx += 1) {
        const rem = safeDetailBottom - y;
        if (rem < spec.detailLineH) break;
        const cap = Math.min(2, Math.floor(rem / spec.detailLineH));
        ctx.font = `400 ${spec.detailSize}px ${FONT_SANS}`;
        const wrapped = wrapText(ctx, detailsList[dIdx], innerW - 30, cap);
        if (wrapped.lines.length === 0) continue;

        ctx.font = `500 12px ${FONT_MONO}`;
        ctx.fillStyle = palette.faintInk;
        ctx.fillText(`0${dIdx + 1}`, innerLeft, y + 3);

        ctx.font = `400 ${spec.detailSize}px ${FONT_SANS}`;
        ctx.fillStyle = isFixed ? palette.faintInk : palette.bodyInk;
        for (let l = 0; l < wrapped.lines.length; l += 1) {
          ctx.fillText(wrapped.lines[l], innerLeft + 30, y + l * spec.detailLineH);
        }
        y += wrapped.lines.length * spec.detailLineH + 10;
      }
    }
  }

  // 6. Single-Item Mode: Crisp Code Preview Block
  const snippet = typeof item?.action_snippet === 'string' ? item.action_snippet.trim() : '';
  if (spec.showSnippet && snippet) {
    const safeCodeBottom = bottom - footerReserved - 14;
    const availCodeH = safeCodeBottom - (y + 10);
    if (availCodeH >= 80) {
      y += 10;
      const codeLineH = 22;
      const maxLines = Math.min(5, Math.floor((availCodeH - 32) / codeLineH));
      const lines = snippet.split(/\r?\n/).slice(0, maxLines);
      const boxH = 30 + lines.length * codeLineH;

      ctx.fillStyle = palette.codeBg;
      ctx.fillRect(innerLeft, y, innerW, boxH);
      ctx.strokeStyle = palette.codeBorder;
      ctx.lineWidth = 1;
      ctx.strokeRect(innerLeft + 0.5, y + 0.5, innerW - 1, boxH - 1);

      ctx.font = `400 13px ${FONT_MONO}`;
      ctx.fillStyle = palette.codeInk;
      lines.forEach((ln, idx) => {
        ctx.fillText(
          truncateWithEllipsis(ctx, ln.replace(/\t/g, '  '), innerW - 32),
          innerLeft + 16,
          y + 16 + idx * codeLineH
        );
      });
    }
  }

  // 7. Quiet bottom attribution only in spacious 1-2 item layouts (keep 3-4 item cards whisper-clean)
  if (totalCount <= 2) {
    const footY = bottom - Math.max(18, spec.padY - 4);
    ctx.textBaseline = 'middle';
    ctx.font = `400 12px ${FONT_SANS}`;
    ctx.fillStyle = palette.faintInk;

    const sourceText = String(item?.source_platform || '').trim();
    ctx.textAlign = 'right';
    const safeSource = truncateWithEllipsis(ctx, sourceText, 180);
    const sourceW = safeSource ? ctx.measureText(safeSource).width : 0;
    if (safeSource) {
      ctx.fillText(safeSource, innerRight, footY);
    }

    const impactText = String(item?.impact || '').trim();
    if (impactText) {
      ctx.textAlign = 'left';
      ctx.fillText(
        truncateWithEllipsis(ctx, impactText, Math.max(80, innerW - sourceW - 20)),
        innerLeft,
        footY
      );
    }
  }

  ctx.restore();
}


const PUBLIC_ORIGIN = 'https://ai-intel-radar.teddyshen619.workers.dev';

function posterAddress(item) {
  const location = globalThis.location;
  const local = !location || !/^https?:$/.test(location.protocol) ||
    /^(?:localhost\.?|.*\.localhost\.?|127\.[\d.]+|0\.0\.0\.0|\[::1\])$/i.test(location.hostname);
  const url = new URL(local ? PUBLIC_ORIGIN : location.origin);
  if (item?.id) url.searchParams.set('id', item.id);
  return url;
}

function drawQr(ctx, url, right, top) {
  const code = qrcode(0, 'M');
  code.addData(url.href, 'Byte');
  code.make();
  const count = code.getModuleCount();
  const quietZone = 4;
  const unit = Math.max(1, Math.floor(132 / (count + 2 * quietZone)));
  const size = (count + 2 * quietZone) * unit;
  const left = right - size;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(left, top, size, size);
  ctx.fillStyle = '#111111';
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (code.isDark(row, col)) {
        ctx.fillRect(left + (quietZone + col) * unit, top + (quietZone + row) * unit, unit, unit);
      }
    }
  }
}

export function drawPoster(canvas, selectedItems, meta = {}) {
  if (!canvas || typeof canvas.getContext !== 'function') return;

  canvas.width = POSTER_WIDTH;
  canvas.height = POSTER_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const styleKey = normalizeStyleKey(meta?.style);
  const palette = POSTER_STYLES[styleKey];
  const items = Array.isArray(selectedItems)
    ? selectedItems.filter(Boolean).slice(0, MAX_SELECTION)
    : [];
  const dateStr = resolvePosterDate(meta);
  const humanDate = formatHumanCnDate(dateStr);

  const left = 52;
  const right = POSTER_WIDTH - 52;
  const contentW = right - left;

  // 1. Pure Gallery Canvas
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);

  // 2. Subtle DeepMind / Apple Keynote Optical Arcs
  drawMastheadOpticalArcs(ctx, palette);

  // 3. Dramatic Light-Weight Editorial Masthead (Y: 0 -> 174, zero repetitive tagline clutter)
  ctx.save();
  ctx.textBaseline = 'top';
  ctx.font = `400 12px ${FONT_MONO}`;
  ctx.fillStyle = palette.mutedInk;
  ctx.textAlign = 'left';
  ctx.fillText('RADAR', left, 52);

  ctx.font = `400 12.5px ${FONT_SANS}`;
  ctx.textAlign = 'right';
  ctx.fillText(humanDate, right, 51);

  ctx.font = `300 44px ${FONT_DISPLAY}`;
  ctx.fillStyle = palette.ink;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const baseline = 131;
  const ink = ctx.measureText('前沿速报');
  const markHeight = ink.actualBoundingBoxAscent + ink.actualBoundingBoxDescent;
  const markWidth = drawRadarWordmark(ctx, left, baseline - ink.actualBoundingBoxAscent, markHeight);
  ctx.fillText('· AI 前沿速报', left + markWidth + 12, baseline);

  ctx.strokeStyle = palette.strongRule;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(left, 170);
  ctx.lineTo(right, 170);
  ctx.stroke();
  ctx.restore();

  // 4. Story Blocks with Balanced Gutter Rhythm (Y: 196 -> 1154)
  const bodyTop = 196;
  const bodyBottom = 1154;
  const bodyH = bodyBottom - bodyTop;

  if (items.length === 0) {
    ctx.save();
    ctx.fillStyle = palette.panelBg;
    ctx.fillRect(left, bodyTop, contentW, bodyH);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `500 18px ${FONT_SANS}`;
    ctx.fillStyle = palette.mutedInk;
    ctx.fillText('请在左侧勾选 1–4 篇简报生成速报长图', POSTER_WIDTH / 2, bodyTop + bodyH / 2);
    ctx.restore();
  } else {
    const gap = items.length >= 4 ? 14 : 18;
    const totalGaps = gap * (items.length - 1);
    const availableH = bodyH - totalGaps;

    // Give lead #1 subtle editorial breathing weight when 3 items are shown
    const weights =
      items.length === 3
        ? [1.12, 0.94, 0.94]
        : items.length === 2
          ? [1.06, 0.94]
          : items.map(() => 1);
    const weightSum = weights.reduce((a, b) => a + b, 0);

    let cursorY = bodyTop;
    items.forEach((item, idx) => {
      const h =
        idx === items.length - 1
          ? bodyBottom - cursorY
          : Math.round((availableH * weights[idx]) / weightSum);
      drawEditorialPanel(
        ctx,
        item,
        idx,
        { left, right, top: cursorY, bottom: cursorY + h },
        items.length,
        palette
      );
      cursorY += h + gap;
    });
  }

  // 5. Minimal Magazine Colophon Footer (Y: 1184 -> 1292)
  const footRuleY = 1184;
  ctx.save();
  ctx.strokeStyle = palette.hairline;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(left, footRuleY);
  ctx.lineTo(right, footRuleY);
  ctx.stroke();

  drawFooterMonogram(ctx, left + 16, footRuleY + 46, palette);

  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillStyle = palette.ink;
  const markLeft = left + 44;
  const footerMarkWidth = drawRadarWordmark(ctx, markLeft, footRuleY + 35, 22);

  ctx.font = `400 13px ${FONT_MONO}`;
  ctx.fillStyle = palette.mutedInk;
  ctx.textBaseline = 'middle';
  ctx.fillText('RADAR', markLeft + footerMarkWidth + 12, footRuleY + 46);
  ctx.textBaseline = 'top';

  const address = posterAddress(items.length === 1 ? items[0] : null);
  ctx.font = `400 15px ${FONT_MONO}`;
  ctx.fillText(address.origin, left, footRuleY + 87, contentW - 150);
  drawQr(ctx, address, right, footRuleY + 8);
  ctx.restore();
}

/* ==========================================================================
   Modal UI (Apple Newsroom / Gallery Preview Studio)
   ========================================================================== */

const DRAWER_STYLE_ID = 'ai-radar-poster-drawer-styles';

function createCloseSvg() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'w-3.5 h-3.5 shrink-0');

  const l1 = document.createElementNS(SVG_NS, 'line');
  l1.setAttribute('x1', '18');
  l1.setAttribute('y1', '6');
  l1.setAttribute('x2', '6');
  l1.setAttribute('y2', '18');

  const l2 = document.createElementNS(SVG_NS, 'line');
  l2.setAttribute('x1', '6');
  l2.setAttribute('y1', '6');
  l2.setAttribute('x2', '18');
  l2.setAttribute('y2', '18');

  svg.append(l1, l2);
  return svg;
}

function ensureDrawerStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(DRAWER_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = DRAWER_STYLE_ID;
  style.textContent = `
    .poster-backdrop {
      --p-overlay: rgba(0, 0, 0, 0.34);
      --p-bg: #FFFFFF;
      --p-subtle: #F5F5F7;
      --p-border: rgba(0, 0, 0, 0.09);
      --p-ink: #1D1D1F;
      --p-muted: #6E6E73;
      --p-accent: #0066CC;
      position: fixed;
      inset: 0;
      z-index: 46;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      background: transparent;
      backdrop-filter: blur(0px);
      -webkit-backdrop-filter: blur(0px);
      transition: background-color 180ms ease, backdrop-filter 180ms ease;
    }
    html.dark .poster-backdrop,
    html[data-theme="dark"] .poster-backdrop {
      --p-overlay: rgba(0, 0, 0, 0.72);
      --p-bg: #0E0F12;
      --p-subtle: #15171C;
      --p-border: rgba(255, 255, 255, 0.11);
      --p-ink: #F5F5F7;
      --p-muted: #8E8E93;
      --p-accent: #2997FF;
    }
    .poster-backdrop[data-open="true"] {
      background: var(--p-overlay);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    }
    .poster-backdrop[hidden] { display: none !important; }
    .poster-dialog {
      width: min(1080px, 100%);
      height: min(860px, calc(100vh - 40px));
      display: flex;
      flex-direction: column;
      background: var(--p-bg);
      border: 1px solid var(--p-border);
      border-radius: 2px;
      color: var(--p-ink);
      overflow: hidden;
      min-width: 0;
      transform: translate3d(0, 10px, 0);
      transition: transform 200ms cubic-bezier(0.22, 1, 0.36, 1);
    }
    .poster-backdrop[data-open="true"] .poster-dialog {
      transform: translate3d(0, 0, 0);
    }
    .poster-header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px 20px;
      padding: 16px 24px;
      border-bottom: 1px solid var(--p-border);
    }
    .poster-header-left {
      display: flex;
      align-items: baseline;
      gap: 12px;
      min-width: 0;
    }
    .poster-style-tabs {
      display: inline-flex;
      align-items: center;
      gap: 20px;
    }
    .poster-style-btn {
      border: 0;
      border-bottom: 2px solid transparent;
      background: transparent;
      padding: 4px 0;
      font-size: 13px;
      font-weight: 500;
      color: var(--p-muted);
      cursor: pointer;
      transition: color 150ms ease, border-color 150ms ease;
    }
    .poster-style-btn:hover { color: var(--p-ink); }
    .poster-style-btn[data-active="true"] {
      color: var(--p-ink);
      font-weight: 600;
      border-bottom-color: var(--p-ink);
    }
    .poster-body {
      flex: 1 1 auto;
      min-height: 0;
      display: grid;
      grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
      overflow: hidden;
    }
    .poster-list-pane {
      display: flex;
      flex-direction: column;
      min-width: 0;
      min-height: 0;
      border-right: 1px solid var(--p-border);
    }
    .poster-list-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 12px 24px;
      border-bottom: 1px solid var(--p-border);
      font-size: 12.5px;
      color: var(--p-muted);
    }
    .poster-list-scroll {
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
    }
    .poster-item-row {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 15px 24px;
      border-bottom: 1px solid var(--p-border);
      border-left: 2px solid transparent;
      cursor: pointer;
      transition: background-color 150ms ease, border-color 150ms ease;
    }
    .poster-item-row:hover { background: var(--p-subtle); }
    .poster-item-row[data-selected="true"] {
      background: var(--p-subtle);
      border-left-color: var(--p-accent);
    }
    .poster-item-row[data-fixed="true"] { opacity: 0.6; }
    .poster-preview-pane {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-width: 0;
      min-height: 0;
      padding: 28px 24px 20px;
      background: var(--p-subtle);
      overflow-y: auto;
    }
    .poster-canvas-frame {
      flex: 1 1 0%;
      width: 100%;
      min-height: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .poster-canvas-el {
      display: block;
      aspect-ratio: 750 / 1334;
      width: auto;
      height: auto;
      max-width: min(100%, 386px);
      max-height: 100%;
      border: 1px solid var(--p-border);
      background: #FFFFFF;
    }
    .poster-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 14px 24px;
      border-top: 1px solid var(--p-border);
    }
    @media (max-width: 1023px) {
      .poster-backdrop { padding: 0; }
      .poster-dialog { width: 100%; height: 100dvh; max-height: 100vh; border-radius: 0; border: 0; }
      .poster-header { padding: 14px 18px; }
      .poster-header-left { order: 1; flex: 1 1 auto; }
      .poster-header-right { order: 2; flex-shrink: 0; }
      .poster-style-tabs { order: 3; flex: 0 0 100%; padding-top: 6px; border-top: 1px solid var(--p-border); }
      .poster-list-header { padding: 11px 18px; }
      .poster-item-row { padding: 14px 18px; }
      .poster-body { display: flex; flex-direction: column; overflow-y: auto; }
      .poster-list-pane { flex: 0 0 auto; border-right: 0; border-bottom: 1px solid var(--p-border); }
      .poster-list-scroll { max-height: 250px; }
      .poster-preview-pane { flex: 0 0 auto; overflow: visible; padding: 20px 18px; }
      .poster-canvas-frame { flex: none; height: auto; }
      .poster-canvas-el { width: min(100%, 320px); max-height: none; }
      .poster-footer { padding: 12px 18px; flex-wrap: wrap; }
      .poster-footer > span { display: none; }
    }
  `;
  document.head.appendChild(style);
}

function computeDefaultSelectedIds(sortedItems) {
  if (!Array.isArray(sortedItems) || sortedItems.length === 0) return [];
  const nonFixed = sortedItems.filter((it) => it && it.status !== 'FIXED' && it.id);
  const fixed = sortedItems.filter((it) => it && it.status === 'FIXED' && it.id);
  return [...nonFixed, ...fixed].slice(0, DEFAULT_SELECTION_LIMIT).map((it) => it.id);
}

function resolveSelectedItems(sortedItems, selectedIds) {
  if (!Array.isArray(sortedItems) || !Array.isArray(selectedIds) || selectedIds.length === 0) {
    return [];
  }
  const set = new Set(selectedIds);
  return sortedItems.filter((it) => it && set.has(it.id)).slice(0, MAX_SELECTION);
}

function exportCanvasAsPng(canvas, filename) {
  return new Promise((resolve, reject) => {
    const trigger = (href, revoke) => {
      try {
        const link = document.createElement('a');
        link.href = href;
        link.download = filename;
        link.rel = 'noopener';
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        if (revoke) {
          setTimeout(() => {
            try { URL.revokeObjectURL(href); } catch {}
          }, 1500);
        }
        resolve({ filename, method: revoke ? 'blob' : 'dataURL' });
      } catch (err) {
        reject(err);
      }
    };

    const fallback = () => {
      try {
        trigger(canvas.toDataURL('image/png'), false);
      } catch (err) {
        reject(err);
      }
    };

    if (typeof canvas.toBlob === 'function') {
      try {
        canvas.toBlob((blob) => {
          if (!blob) {
            fallback();
            return;
          }
          trigger(URL.createObjectURL(blob), true);
        }, 'image/png', 1.0);
      } catch {
        fallback();
      }
    } else {
      fallback();
    }
  });
}

function createChecklistRow(item, isSelected, onToggle) {
  const row = document.createElement('label');
  row.className = 'poster-item-row';
  row.dataset.itemId = item.id || '';
  row.dataset.selected = isSelected ? 'true' : 'false';
  row.dataset.fixed = item.status === 'FIXED' ? 'true' : 'false';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = isSelected;
  checkbox.value = item.id || '';
  checkbox.className = 'mt-1 h-3.5 w-3.5 shrink-0 accent-[#0066CC] dark:accent-[#2997FF] cursor-pointer';
  checkbox.setAttribute('aria-label', `选择简报：${item.title || item.id}`);
  checkbox.addEventListener('change', (evt) => {
    onToggle(item.id, evt.target.checked, checkbox);
  });

  const body = document.createElement('div');
  body.className = 'min-w-0 flex-1 space-y-1.5';

  const metaLine = document.createElement('div');
  metaLine.className = 'flex items-baseline justify-between gap-2 text-[12px]';

  const leftMeta = document.createElement('span');
  leftMeta.className = 'text-[#6E6E73] dark:text-[#8E8E93] truncate';
  leftMeta.textContent = buildPosterEyebrow(item);

  const rightMeta = document.createElement('span');
  rightMeta.className =
    item.status === 'URGENT'
      ? 'shrink-0 font-normal text-[#C5221F] dark:text-[#FF6961]'
      : 'shrink-0 font-normal text-[#0066CC] dark:text-[#2997FF]';
  rightMeta.textContent = item.metric_badge || item.value_tag || '';

  metaLine.append(leftMeta, rightMeta);

  const titleEl = document.createElement('p');
  titleEl.className = `font-editorial-display text-[14.5px] leading-[1.45] ${
    item.status === 'FIXED'
      ? 'text-[#86868B] line-through'
      : 'text-[#1D1D1F] dark:text-[#F5F5F7]'
  }`;
  titleEl.textContent = item.title || '未命名情报';

  body.append(metaLine, titleEl);
  row.append(checkbox, body);
  return row;
}

export function initPosterGenerator({
  getItems,
  getUpdatedAt,
  getFilteredItems,
  triggerButton,
  mountRoot,
  onToast,
} = {}) {
  ensureDrawerStyles();

  const safeGetSortedItems = () => {
    try {
      const result = typeof getItems === 'function' ? getItems() : [];
      return sortItemsByValue(Array.isArray(result) ? result : []);
    } catch {
      return [];
    }
  };

  const safeGetUpdatedAt = () => {
    try {
      return typeof getUpdatedAt === 'function' ? getUpdatedAt() || '' : '';
    } catch {
      return '';
    }
  };

  const notify = (msg, variant = 'info') => {
    if (typeof onToast === 'function') onToast(msg, variant);
  };

  const resolvedTrigger = triggerButton || document.getElementById('open-poster-btn');
  const resolvedRoot =
    mountRoot || document.getElementById('poster-drawer-root') || document.body;

  let isOpen = false;
  let hasUserModified = false;
  let selectedIds = [];
  let currentStyle = DEFAULT_POSTER_STYLE;
  let previousBodyOverflow = '';

  const backdrop = document.createElement('div');
  backdrop.className = 'poster-backdrop';
  backdrop.hidden = true;
  backdrop.dataset.open = 'false';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-labelledby', 'poster-drawer-title');

  const dialog = document.createElement('div');
  dialog.className = 'poster-dialog';

  const header = document.createElement('div');
  header.className = 'poster-header';

  const headerLeft = document.createElement('div');
  headerLeft.className = 'poster-header-left';

  const titleHeading = document.createElement('h2');
  titleHeading.id = 'poster-drawer-title';
  titleHeading.className = 'text-[16px] font-semibold tracking-[-0.02em] truncate';
  titleHeading.textContent = '生成速报长图';
  headerLeft.appendChild(titleHeading);

  const styleTabs = document.createElement('div');
  styleTabs.className = 'poster-style-tabs';
  styleTabs.setAttribute('role', 'group');
  styleTabs.setAttribute('aria-label', '选择海报版面风格');
  styleTabs.dataset.posterStyleSwitch = '';

  const styleButtons = new Map();
  for (const opt of [
    { key: 'apple-light', label: '极简白' },
    { key: 'space-gray', label: '深空灰' },
  ]) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'poster-style-btn';
    btn.dataset.posterStyle = opt.key;
    btn.dataset.active = opt.key === currentStyle ? 'true' : 'false';
    btn.textContent = opt.label;
    btn.addEventListener('click', () => setStyle(opt.key));
    styleButtons.set(opt.key, btn);
    styleTabs.appendChild(btn);
  }

  const headerRight = document.createElement('div');
  headerRight.className = 'poster-header-right flex items-center gap-4 text-[13px]';

  const countLabel = document.createElement('span');
  countLabel.className = 'text-[#6E6E73] dark:text-[#8E8E93] tabular-nums';
  countLabel.dataset.posterCount = '';
  countLabel.textContent = '已选 0 篇';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className =
    'inline-flex items-center gap-1 text-[#6E6E73] hover:text-[#1D1D1F] dark:text-[#8E8E93] dark:hover:text-[#F5F5F7] transition-colors cursor-pointer';
  closeBtn.setAttribute('aria-label', '关闭速报生成器');
  const closeText = document.createElement('span');
  closeText.textContent = '关闭';
  closeBtn.append(closeText, createCloseSvg());

  headerRight.append(countLabel, closeBtn);
  header.append(headerLeft, styleTabs, headerRight);

  const body = document.createElement('div');
  body.className = 'poster-body';

  const listPane = document.createElement('section');
  listPane.className = 'poster-list-pane';
  listPane.setAttribute('aria-label', '勾选速报条目');

  const listHeader = document.createElement('div');
  listHeader.className = 'poster-list-header';
  const listHint = document.createElement('span');
  listHint.textContent = '勾选 1–4 篇内容';

  const resetDefaultBtn = document.createElement('button');
  resetDefaultBtn.type = 'button';
  resetDefaultBtn.className = 'text-[#0066CC] hover:underline underline-offset-4 dark:text-[#2997FF] cursor-pointer';
  resetDefaultBtn.textContent = '恢复默认';
  const importBtn = document.createElement('button');
  importBtn.type = 'button';
  importBtn.textContent = '一键导入当前筛选';
  importBtn.className = resetDefaultBtn.className;
  listHeader.append(listHint, importBtn, resetDefaultBtn);

  const listContainer = document.createElement('div');
  listContainer.className = 'poster-list-scroll';
  listPane.append(listHeader, listContainer);

  const previewPane = document.createElement('section');
  previewPane.className = 'poster-preview-pane';
  previewPane.setAttribute('aria-label', '750x1334 海报预览');

  const canvasFrame = document.createElement('div');
  canvasFrame.className = 'poster-canvas-frame';
  const canvasEl = document.createElement('canvas');
  canvasEl.width = POSTER_WIDTH;
  canvasEl.height = POSTER_HEIGHT;
  canvasEl.className = 'poster-canvas-el';
  canvasEl.setAttribute('aria-label', 'AI 速报长图预览');
  canvasFrame.appendChild(canvasEl);

  const previewMeta = document.createElement('p');
  previewMeta.className = 'mt-3.5 text-[12px] text-[#6E6E73] dark:text-[#8E8E93]';
  previewMeta.textContent = '750 × 1334 竖屏高清长图';
  previewPane.append(canvasFrame, previewMeta);
  body.append(listPane, previewPane);

  const footer = document.createElement('div');
  footer.className = 'poster-footer';

  const footerMeta = document.createElement('span');
  footerMeta.className = 'font-mono text-[11.5px] text-[#86868B] dark:text-[#8E8E93] truncate';
  footerMeta.textContent = 'radar-brief.png';

  const footerActions = document.createElement('div');
  footerActions.className = 'flex flex-wrap items-center gap-4';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className =
    'text-[13px] font-medium text-[#6E6E73] hover:text-[#1D1D1F] dark:text-[#8E8E93] dark:hover:text-[#F5F5F7] transition-colors cursor-pointer';
  cancelBtn.textContent = '取消';

  const exportBtn = document.createElement('button');
  exportBtn.type = 'button';
  exportBtn.setAttribute('data-export-poster', '');
  exportBtn.className =
    'rounded-[2px] bg-[#0066CC] hover:bg-[#0052A3] text-white px-5 py-2 text-[13px] font-medium transition-colors cursor-pointer disabled:opacity-60';
  exportBtn.textContent = '保存高清 PNG';

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = cancelBtn.className;
  copyBtn.textContent = '复制图片到剪贴板';
  footerActions.append(cancelBtn, copyBtn, exportBtn);
  footer.append(footerMeta, footerActions);

  dialog.append(header, body, footer);
  backdrop.appendChild(dialog);

  if (resolvedRoot && resolvedRoot !== document.body) {
    resolvedRoot.replaceChildren(backdrop);
  } else {
    resolvedRoot.appendChild(backdrop);
  }

  function syncSelectionWithItems() {
    const sorted = safeGetSortedItems();
    if (!hasUserModified) {
      selectedIds = computeDefaultSelectedIds(sorted);
      return sorted;
    }
    const valid = new Set(sorted.map((it) => it?.id).filter(Boolean));
    selectedIds = selectedIds.filter((id) => valid.has(id)).slice(0, MAX_SELECTION);
    if (selectedIds.length === 0 && sorted.length > 0) {
      selectedIds = computeDefaultSelectedIds(sorted);
    }
    return sorted;
  }

  function syncStyleControlUi() {
    for (const [key, btn] of styleButtons.entries()) {
      const active = key === currentStyle;
      btn.dataset.active = active ? 'true' : 'false';
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
    canvasEl.style.backgroundColor = currentStyle === 'space-gray' ? '#0B0C0E' : '#FFFFFF';
  }

  function renderChecklist(sortedItems) {
    listContainer.replaceChildren();
    if (!sortedItems || sortedItems.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'p-8 text-center text-[13px] text-[#6E6E73]';
      empty.textContent = '暂无可用内容';
      listContainer.appendChild(empty);
      return;
    }
    const ordered = resolveSelectedItems(sortedItems, selectedIds);
    const selectedSet = new Set(ordered.map((it) => it.id));
    const frag = document.createDocumentFragment();
    for (const item of sortedItems) {
      if (!item) continue;
      frag.appendChild(createChecklistRow(item, selectedSet.has(item.id), handleToggleItem));
    }
    listContainer.appendChild(frag);
  }

  function handleToggleItem(itemId, wantChecked, checkboxEl) {
    const sorted = safeGetSortedItems();
    const currently = selectedIds.includes(itemId);

    if (wantChecked && !currently) {
      if (selectedIds.length >= MAX_SELECTION) {
        if (checkboxEl) checkboxEl.checked = false;
        notify(`最多选择 ${MAX_SELECTION} 篇简报`, 'warning');
        return;
      }
      selectedIds = [...selectedIds, itemId];
      hasUserModified = true;
    } else if (!wantChecked && currently) {
      if (selectedIds.length <= MIN_SELECTION) {
        if (checkboxEl) checkboxEl.checked = true;
        notify(`至少保留 ${MIN_SELECTION} 篇简报`, 'warning');
        return;
      }
      selectedIds = selectedIds.filter((id) => id !== itemId);
      hasUserModified = true;
    }

    const orderLookup = new Map(sorted.map((it, idx) => [it.id, idx]));
    selectedIds.sort((a, b) => (orderLookup.get(a) ?? 9999) - (orderLookup.get(b) ?? 9999));

    renderChecklist(sorted);
    redraw();
  }

  function redraw() {
    const sorted = syncSelectionWithItems();
    const selected = resolveSelectedItems(sorted, selectedIds);
    const updatedAt = safeGetUpdatedAt();
    const dateStr = resolvePosterDate({ updatedAt });
    syncStyleControlUi();
    drawPoster(canvasEl, selected, { date: dateStr, updatedAt, style: currentStyle });
    const styleMeta = POSTER_STYLES[currentStyle] || POSTER_STYLES[DEFAULT_POSTER_STYLE];
    countLabel.textContent = `已选 ${selected.length} 篇`;
    previewMeta.textContent = `750 × 1334 · ${styleMeta.name}`;
    footerMeta.textContent = `radar-${dateStr}.png`;
    return selected;
  }

  function setStyle(styleKey) {
    currentStyle = normalizeStyleKey(styleKey);
    syncStyleControlUi();
    redraw();
    return currentStyle;
  }

  function open() {
    const sorted = syncSelectionWithItems();
    renderChecklist(sorted);
    redraw();
    if (!isOpen) {
      isOpen = true;
      previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      backdrop.hidden = false;
      requestAnimationFrame(() => {
        backdrop.dataset.open = 'true';
      });
      closeBtn.focus({ preventScroll: true });
    }
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    backdrop.dataset.open = 'false';
    backdrop.hidden = true;
    document.body.style.overflow = previousBodyOverflow;
    if (resolvedTrigger && typeof resolvedTrigger.focus === 'function') {
      resolvedTrigger.focus({ preventScroll: true });
    }
  }

  async function exportPng() {
    const selected = redraw();
    if (selected.length === 0) {
      notify('至少保留 1 篇简报', 'warning');
      return { ok: false, filename: '', count: 0, style: currentStyle };
    }
    const dateStr = resolvePosterDate({ updatedAt: safeGetUpdatedAt() });
    const filename = `radar-${dateStr}.png`;

    exportBtn.disabled = true;
    const prev = exportBtn.textContent;
    exportBtn.textContent = '正在导出...';
    try {
      const res = await exportCanvasAsPng(canvasEl, filename);
      notify('速报长图已保存', 'success');
      return { ok: true, count: selected.length, style: currentStyle, ...res };
    } catch {
      notify('导出失败，请检查下载权限', 'error');
      return { ok: false, filename, count: selected.length, style: currentStyle };
    } finally {
      exportBtn.disabled = false;
      exportBtn.textContent = prev;
    }
  }

  if (resolvedTrigger) {
    resolvedTrigger.addEventListener('click', open);
  }
  closeBtn.addEventListener('click', close);
  cancelBtn.addEventListener('click', close);
  backdrop.addEventListener('click', (evt) => {
    if (evt.target === backdrop) close();
  });
  document.addEventListener('keydown', (evt) => {
    if (evt.key === 'Escape' && isOpen) {
      evt.preventDefault();
      close();
    }
  });
  resetDefaultBtn.addEventListener('click', () => {
    hasUserModified = false;
    const sorted = syncSelectionWithItems();
    renderChecklist(sorted);
    redraw();
    notify('已恢复默认精选', 'info');
  });
  importBtn.addEventListener('click', () => {
    const items = getFilteredItems?.() || [];
    if (!items.length) {
      notify('当前没有可导入的情报', 'info');
      return;
    }
    selectedIds = items.slice(0, MAX_SELECTION).map(item => item.id);
    hasUserModified = true;
    renderChecklist(syncSelectionWithItems());
    redraw();
    notify(items.length > MAX_SELECTION ? '已导入当前筛选的前 4 篇' : `已导入 ${items.length} 篇`, 'success');
  });
  copyBtn.addEventListener('click', async () => {
    if (!navigator.clipboard?.write || typeof ClipboardItem !== 'function') {
      notify('此浏览器不支持复制图片，可选择「保存高清 PNG」', 'info');
      return;
    }
    if (!redraw().length) return notify('请先选择简报', 'info');
    try {
      // Start the write during the click gesture, including on Safari.
      const png = new Promise((resolve, reject) => canvasEl.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error('PNG encoding failed'));
      }, 'image/png'));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
      notify('海报图片已复制', 'success');
    } catch {
      notify('图片复制失败，可选择「保存高清 PNG」', 'info');
    }
  });
  exportBtn.addEventListener('click', exportPng);

  syncSelectionWithItems();
  syncStyleControlUi();

  if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      if (isOpen) redraw();
    });
  }

  return {
    open,
    openItem(item) {
      selectedIds = [item.id];
      hasUserModified = true;
      open();
    },
    close,
    redraw,
    getSelectedIds: () => [...selectedIds],
    getStyle: () => currentStyle,
    setStyle,
    exportPng,
  };
}
