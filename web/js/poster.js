/**
 * AI 圈前沿情报与算力羊毛雷达站 — 零依赖原生 Canvas 2D 病毒战报生成器
 *
 * 严格零外部库依赖、零外部跨域图片，100% 纯 HTML5 Canvas 2D API 绘制，
 * 保证 canvas.toBlob() / canvas.toDataURL('image/png') 永不触发 Tainted Canvas SecurityError。
 */

const POSTER_WIDTH = 750;
const POSTER_HEIGHT = 1334;

const MIN_SELECTION = 1;
const MAX_SELECTION = 4;
const DEFAULT_SELECTION_LIMIT = 3;

const FONT_SANS =
  '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", "Hiragino Sans GB", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const FONT_MONO =
  '"JetBrains Mono", "Fira Code", "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace';

const TYPE_THEMES = {
  DEAL: {
    code: 'DEAL',
    label: 'DEAL · 算力羊毛',
    shortLabel: '算力羊毛',
    accent: '#10B981',
    text: '#34D399',
    softBg: 'rgba(16, 185, 129, 0.15)',
    border: 'rgba(16, 185, 129, 0.48)',
    valueBgStart: '#059669',
    valueBgEnd: '#10B981',
    valueText: '#ECFDF5',
  },
  BUG: {
    code: 'BUG',
    label: 'BUG · 漏洞避坑',
    shortLabel: '漏洞避坑',
    accent: '#EF4444',
    text: '#F87171',
    softBg: 'rgba(239, 68, 68, 0.15)',
    border: 'rgba(239, 68, 68, 0.48)',
    valueBgStart: '#DC2626',
    valueBgEnd: '#EF4444',
    valueText: '#FEF2F2',
  },
  HACK: {
    code: 'HACK',
    label: 'HACK · 极客技巧',
    shortLabel: '极客技巧',
    accent: '#06B6D4',
    text: '#22D3EE',
    softBg: 'rgba(6, 182, 212, 0.15)',
    border: 'rgba(6, 182, 212, 0.48)',
    valueBgStart: '#0284C7',
    valueBgEnd: '#06B6D4',
    valueText: '#ECFEFF',
  },
};

const STATUS_THEMES = {
  URGENT: {
    code: 'URGENT',
    label: '手慢无',
    barColor: '#F59E0B',
    dotColor: '#FBBF24',
    text: '#FCD34D',
    softBg: 'rgba(245, 158, 11, 0.16)',
    border: 'rgba(245, 158, 11, 0.52)',
    strikethrough: false,
  },
  ACTIVE: {
    code: 'ACTIVE',
    label: '亲测有效',
    barColor: '#10B981',
    dotColor: '#34D399',
    text: '#6EE7B7',
    softBg: 'rgba(16, 185, 129, 0.15)',
    border: 'rgba(16, 185, 129, 0.45)',
    strikethrough: false,
  },
  FIXED: {
    code: 'FIXED',
    label: '已失效',
    barColor: '#64748B',
    dotColor: '#94A3B8',
    text: '#94A3B8',
    softBg: 'rgba(100, 116, 139, 0.18)',
    border: 'rgba(100, 116, 139, 0.42)',
    strikethrough: true,
  },
};

const DEFAULT_TYPE_THEME = TYPE_THEMES.HACK;
const DEFAULT_STATUS_THEME = STATUS_THEMES.ACTIVE;

/**
 * 解析战报日期：优先 meta.date，其次 meta.updatedAt 的 YYYY-MM-DD，最后回退当天本地日期
 */
function resolvePosterDate(meta = {}) {
  const candidates = [meta?.date, meta?.updatedAt, meta?.updated_at];
  for (const raw of candidates) {
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    const directMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
    if (directMatch) {
      return directMatch[1];
    }
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return formatLocalDate(parsed);
    }
  }
  return formatLocalDate(new Date());
}

function formatLocalDate(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 确定性 FNV-1a 32-bit 哈希 + Mulberry32 伪随机数生成器（用于纯矢量二维码数据区）
 */
function hashString(input) {
  let h = 0x811c9dc5;
  const str = String(input ?? 'ai-intel-radar');
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function createPrng(seed) {
  let state = seed >>> 0 || 0x1a2b3c4d;
  return function nextRandom() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 跨浏览器圆角矩形路径
 */
function drawRoundedRectPath(ctx, x, y, w, h, radius) {
  const radii = Array.isArray(radius)
    ? radius
    : [radius, radius, radius, radius];
  const maxR = Math.min(w / 2, h / 2);
  const [tl, tr, br, bl] = radii.map((r) => Math.max(0, Math.min(r, maxR)));

  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  ctx.arcTo(x + w, y, x + w, y + tr, tr);
  ctx.lineTo(x + w, y + h - br);
  ctx.arcTo(x + w, y + h, x + w - br, y + h, br);
  ctx.lineTo(x + bl, y + h);
  ctx.arcTo(x, y + h, x, y + h - bl, bl);
  ctx.lineTo(x, y + tl);
  ctx.arcTo(x, y, x + tl, y, tl);
  ctx.closePath();
}

/**
 * 中英文混排分词：保持常规英文/数字/符号词组完整，同时逐字切分中文与标点
 */
function tokenizeMixedText(str) {
  const normalized = String(str ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!normalized) return [];
  const regex =
    /[A-Za-z0-9_$%]+(?:[._\-/+,][A-Za-z0-9_$%+]+)*|\s+|./gu;
  return normalized.match(regex) || [];
}

/**
 * 严格基于 ctx.measureText 的单行省略号截断（二分查找，支持 Unicode 代理对）
 */
function truncateWithEllipsis(ctx, text, maxWidth) {
  const clean = String(text ?? '').trimEnd();
  if (!clean) return '';
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

/**
 * 严谨的中英文混排自动折行算法（基于 ctx.measureText + 避头标点优化 + 最大行数省略号截断）
 */
function wrapText(ctx, text, maxWidth, maxLines = 2) {
  if (maxLines <= 0 || maxWidth <= 0) {
    return { lines: [], truncated: false };
  }

  const tokens = tokenizeMixedText(text);
  if (tokens.length === 0) {
    return { lines: [], truncated: false };
  }

  const lines = [];
  let current = '';
  let truncated = false;

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];

    // 跳过行首空白
    if (current === '' && /^\s+$/.test(token)) {
      continue;
    }

    const candidate = current + token;
    const candidateW = ctx.measureText(candidate).width;
    // 避头标点（如句号/逗号）：允许极轻微光学悬挂（<=8px）避免孤立标点独占一行
    const isClosingPunct = CLOSING_PUNCT_RE.test(token);
    if (
      candidateW <= maxWidth ||
      (isClosingPunct && current !== '' && candidateW <= maxWidth + 8)
    ) {
      current = candidate;
      continue;
    }

    const isLastLine = lines.length === maxLines - 1;

    if (isLastLine) {
      // 最后一行：合并剩余文本并在精确像素边界处加省略号，避免半行留白
      const remainder = (current + tokens.slice(i).join('')).trim();
      lines.push(truncateWithEllipsis(ctx, remainder, maxWidth));
      current = '';
      truncated = true;
      break;
    }

    if (current !== '') {
      // 若触发换行的是行首禁则标点，将上一行末尾 1 个字符带入下一行避免孤标点
      if (isClosingPunct) {
        const curChars = Array.from(current.trimEnd());
        if (curChars.length > 2) {
          const carried = curChars.pop();
          lines.push(curChars.join('').trimEnd());
          current = carried + token;
          continue;
        }
      }
      lines.push(current.trimEnd());
      current = '';
      if (!/^\s+$/.test(token)) {
        i -= 1;
      }
      continue;
    }

    // 单个超长 token 本身超出 maxWidth：按 Unicode 字符逐字拆分
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

/**
 * 绘制背景：#0B0F19 深灰黑底色 + 精细赛博网格 + 四角霓虹低饱和径向光晕
 */
function drawBackground(ctx) {
  // 1. 深邃底色渐变
  const baseGrad = ctx.createLinearGradient(0, 0, 0, POSTER_HEIGHT);
  baseGrad.addColorStop(0, '#0D1322');
  baseGrad.addColorStop(0.28, '#0B0F19');
  baseGrad.addColorStop(0.78, '#0B0F19');
  baseGrad.addColorStop(1, '#080C15');
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);

  // 2. 低饱和赛博光晕（顶部双色 + 底部双色）
  const glows = [
    { x: 645, y: 105, r: 380, color: 'rgba(16, 185, 129, 0.14)' },
    { x: 110, y: 85, r: 320, color: 'rgba(6, 182, 212, 0.11)' },
    { x: 145, y: 1210, r: 340, color: 'rgba(16, 185, 129, 0.12)' },
    { x: 635, y: 1230, r: 310, color: 'rgba(14, 165, 233, 0.09)' },
  ];

  for (const g of glows) {
    const rad = ctx.createRadialGradient(g.x, g.y, 6, g.x, g.y, g.r);
    rad.addColorStop(0, g.color);
    rad.addColorStop(1, 'rgba(11, 15, 25, 0)');
    ctx.fillStyle = rad;
    ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);
  }

  // 3. 精细赛博网格线
  ctx.save();
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.048)';
  ctx.lineWidth = 1;
  const gridStep = 30;
  ctx.beginPath();
  for (let x = gridStep; x < POSTER_WIDTH; x += gridStep) {
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, POSTER_HEIGHT);
  }
  for (let y = gridStep; y < POSTER_HEIGHT; y += gridStep) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(POSTER_WIDTH, y + 0.5);
  }
  ctx.stroke();

  // 4. 网格交叉点微弱 HUD 十字星标
  ctx.strokeStyle = 'rgba(16, 185, 129, 0.15)';
  ctx.lineWidth = 1;
  const crossStep = 120;
  ctx.beginPath();
  for (let x = crossStep; x < POSTER_WIDTH; x += crossStep) {
    for (let y = crossStep; y < POSTER_HEIGHT; y += crossStep) {
      ctx.moveTo(x - 3.5, y + 0.5);
      ctx.lineTo(x + 4.5, y + 0.5);
      ctx.moveTo(x + 0.5, y - 3.5);
      ctx.lineTo(x + 0.5, y + 4.5);
    }
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * 绘制四角终端 HUD 装饰框线与微弱遥测文字
 */
function drawHudFrame(ctx) {
  const pad = 18;
  const x = pad;
  const y = pad;
  const w = POSTER_WIDTH - pad * 2;
  const h = POSTER_HEIGHT - pad * 2;
  const arm = 24;

  ctx.save();
  // 外框细线
  ctx.strokeStyle = 'rgba(51, 65, 85, 0.45)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

  // 四角高亮 L 型 HUD 支架
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'square';

  // 左上（霓虹绿）
  ctx.strokeStyle = '#10B981';
  ctx.beginPath();
  ctx.moveTo(x, y + arm);
  ctx.lineTo(x, y);
  ctx.lineTo(x + arm, y);
  ctx.stroke();

  // 右上（赛博青）
  ctx.strokeStyle = '#06B6D4';
  ctx.beginPath();
  ctx.moveTo(x + w - arm, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + arm);
  ctx.stroke();

  // 左下（赛博青）
  ctx.strokeStyle = '#06B6D4';
  ctx.beginPath();
  ctx.moveTo(x, y + h - arm);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x + arm, y + h);
  ctx.stroke();

  // 右下（霓虹绿）
  ctx.strokeStyle = '#10B981';
  ctx.beginPath();
  ctx.moveTo(x + w - arm, y + h);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + w, y + h - arm);
  ctx.stroke();

  // 顶部遥测角标
  ctx.font = `600 10px ${FONT_MONO}`;
  ctx.fillStyle = 'rgba(100, 116, 139, 0.72)';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText('SYS.RADAR // STATIC-EDGE', x + 32, y + 9);
  ctx.textAlign = 'right';
  ctx.fillText('FRAME 750×1334 · ZERO-API', x + w - 32, y + 9);
  ctx.restore();
}

/**
 * 绘制紧凑胶囊标签
 */
function drawBadgePill(
  ctx,
  {
    x,
    y,
    height,
    text,
    font,
    textColor,
    bgColor,
    borderColor,
    dotColor = null,
    strikethrough = false,
    paddingX = 11,
    radius = 6,
    maxWidth = null,
  }
) {
  ctx.save();
  ctx.font = font;
  const dotSpace = dotColor ? 13 : 0;
  let displayText = String(text ?? '');
  if (maxWidth !== null) {
    const availTextW = Math.max(24, maxWidth - paddingX * 2 - dotSpace);
    displayText = truncateWithEllipsis(ctx, displayText, availTextW);
  }
  const textW = ctx.measureText(displayText).width;
  const width = Math.ceil(paddingX * 2 + dotSpace + textW);

  drawRoundedRectPath(ctx, x, y, width, height, radius);
  ctx.fillStyle = bgColor;
  ctx.fill();
  if (borderColor) {
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  let textX = x + paddingX;
  const centerY = y + height / 2;

  if (dotColor) {
    ctx.beginPath();
    ctx.arc(textX + 3.5, centerY, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = dotColor;
    ctx.fill();
    textX += dotSpace;
  }

  ctx.fillStyle = textColor;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(displayText, textX, centerY + 0.5);

  if (strikethrough && textW > 0) {
    ctx.strokeStyle = textColor;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(textX - 1, centerY + 0.5);
    ctx.lineTo(textX + textW + 1, centerY + 0.5);
    ctx.stroke();
  }

  ctx.restore();
  return width;
}

/**
 * 绘制顶部铭牌区（Y: 38 -> 236）
 */
function drawHeader(ctx, items, dateStr) {
  const leftX = 36;
  const rightX = POSTER_WIDTH - 36;
  const contentW = rightX - leftX;

  ctx.save();

  // 1. 顶部 Eyebrow 与日期/数量徽章行（Y = 46..72）
  const eyebrowY = 58;
  // 霓虹绿状态灯
  ctx.beginPath();
  ctx.arc(leftX + 6, eyebrowY, 9, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(16, 185, 129, 0.22)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(leftX + 6, eyebrowY, 4.5, 0, Math.PI * 2);
  ctx.fillStyle = '#10B981';
  ctx.fill();

  ctx.font = `700 13px ${FONT_MONO}`;
  ctx.fillStyle = '#34D399';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText('AI INTEL RADAR // DAILY DISPATCH', leftX + 22, eyebrowY + 0.5);

  // 右侧：精选条数角标 + 日期胶囊
  const countText = `精选 ${items.length} 条`;
  const countFont = `700 13px ${FONT_SANS}`;
  ctx.font = countFont;
  const countPillW = Math.ceil(ctx.measureText(countText).width + 22);
  const countPillX = rightX - countPillW;

  drawBadgePill(ctx, {
    x: countPillX,
    y: 45,
    height: 26,
    text: countText,
    font: countFont,
    textColor: '#34D399',
    bgColor: 'rgba(16, 185, 129, 0.16)',
    borderColor: 'rgba(16, 185, 129, 0.52)',
    paddingX: 11,
    radius: 6,
  });

  const dateFont = `600 13px ${FONT_MONO}`;
  ctx.font = dateFont;
  const datePillW = Math.ceil(ctx.measureText(dateStr).width + 22);
  const datePillX = countPillX - 8 - datePillW;

  drawBadgePill(ctx, {
    x: datePillX,
    y: 45,
    height: 26,
    text: dateStr,
    font: dateFont,
    textColor: '#E2E8F0',
    bgColor: 'rgba(15, 23, 42, 0.85)',
    borderColor: 'rgba(71, 85, 105, 0.72)',
    paddingX: 11,
    radius: 6,
  });

  // 2. 主标题（自适应字号防超宽）
  const mainTitle = 'AI 圈前沿情报与算力羊毛速报';
  let titleSize = 41;
  while (titleSize > 30) {
    ctx.font = `800 ${titleSize}px ${FONT_SANS}`;
    if (ctx.measureText(mainTitle).width <= contentW) {
      break;
    }
    titleSize -= 1;
  }

  const titleGrad = ctx.createLinearGradient(leftX, 88, rightX, 140);
  titleGrad.addColorStop(0, '#FFFFFF');
  titleGrad.addColorStop(0.65, '#F1F5F9');
  titleGrad.addColorStop(1, '#A7F3D0');

  ctx.save();
  ctx.font = `800 ${titleSize}px ${FONT_SANS}`;
  ctx.fillStyle = titleGrad;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.shadowColor = 'rgba(16, 185, 129, 0.24)';
  ctx.shadowBlur = 14;
  ctx.fillText(mainTitle, leftX, 114);
  ctx.restore();

  // 标题下方双色霓虹指示细条
  ctx.fillStyle = '#10B981';
  ctx.fillRect(leftX, 146, 68, 3);
  ctx.fillStyle = '#06B6D4';
  ctx.fillRect(leftX + 74, 146, 26, 3);
  ctx.fillStyle = 'rgba(51, 65, 85, 0.65)';
  ctx.fillRect(leftX + 106, 147, contentW - 106, 1);

  // 3. 终端副标题与分类统计信息条（Y = 162..210）
  const stripY = 164;
  const stripH = 44;
  drawRoundedRectPath(ctx, leftX, stripY, contentW, stripH, 10);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(51, 65, 85, 0.72)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // 左侧绿竖条
  drawRoundedRectPath(ctx, leftX + 1, stripY + 9, 3, stripH - 18, 2);
  ctx.fillStyle = '#10B981';
  ctx.fill();

  // 右侧统计本次包含的分类胶囊（先绘制以精确计算左侧副标题安全宽度）
  const typeCounts = { DEAL: 0, BUG: 0, HACK: 0 };
  for (const it of items) {
    if (it && typeCounts[it.type] !== undefined) {
      typeCounts[it.type] += 1;
    }
  }
  const activeTypes = ['HACK', 'BUG', 'DEAL'].filter((t) => typeCounts[t] > 0);
  let cursorRight = rightX - 12;
  for (const typeKey of activeTypes) {
    const theme = TYPE_THEMES[typeKey];
    const label = `${typeKey} ×${typeCounts[typeKey]}`;
    const pillFont = `700 12px ${FONT_MONO}`;
    ctx.font = pillFont;
    const pillW = Math.ceil(ctx.measureText(label).width + 16);
    cursorRight -= pillW;
    drawBadgePill(ctx, {
      x: cursorRight,
      y: stripY + 10,
      height: 24,
      text: label,
      font: pillFont,
      textColor: theme.text,
      bgColor: theme.softBg,
      borderColor: theme.border,
      paddingX: 8,
      radius: 5,
    });
    cursorRight -= 6;
  }

  ctx.font = `500 15px ${FONT_SANS}`;
  ctx.fillStyle = '#CBD5E1';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const subCopyMaxW = Math.max(120, cursorRight - (leftX + 16) - 8);
  const subCopy = truncateWithEllipsis(
    ctx,
    '高纯度硬核信息差 · 省钱算力 · 避坑预警 · 隐藏参数',
    subCopyMaxW
  );
  ctx.fillText(subCopy, leftX + 16, stripY + stripH / 2 + 0.5);

  // 4. 分割光束线（Y = 228）
  const lineGrad = ctx.createLinearGradient(leftX, 228, rightX, 228);
  lineGrad.addColorStop(0, 'rgba(16, 185, 129, 0.65)');
  lineGrad.addColorStop(0.45, 'rgba(6, 182, 212, 0.35)');
  lineGrad.addColorStop(1, 'rgba(51, 65, 85, 0.15)');
  ctx.strokeStyle = lineGrad;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(leftX, 228);
  ctx.lineTo(rightX, 228);
  ctx.stroke();

  ctx.restore();
}

/**
 * 绘制右上角高亮 value_tag 胶囊
 */
function drawValueTagCapsule(ctx, { rightX, y, height, text, theme, isFixed, maxWidth = 215 }) {
  const font = `700 ${height >= 30 ? 15 : 13.5}px ${FONT_SANS}`;
  ctx.save();
  ctx.font = font;
  const paddingX = height >= 30 ? 14 : 11;
  const display = truncateWithEllipsis(ctx, text || '精选情报', maxWidth - paddingX * 2);
  const textW = ctx.measureText(display).width;
  const pillW = Math.ceil(textW + paddingX * 2);
  const x = rightX - pillW;

  drawRoundedRectPath(ctx, x, y, pillW, height, height / 2);
  if (isFixed) {
    ctx.fillStyle = 'rgba(71, 85, 105, 0.45)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
  } else {
    const grad = ctx.createLinearGradient(x, y, x + pillW, y + height);
    grad.addColorStop(0, theme.valueBgStart);
    grad.addColorStop(1, theme.valueBgEnd);
    ctx.shadowColor = theme.border;
    ctx.shadowBlur = 10;
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  ctx.fillStyle = isFixed ? '#CBD5E1' : theme.valueText;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(display, x + pillW / 2, y + height / 2 + 0.5);
  ctx.restore();
  return pillW;
}

/**
 * 根据选定条目数量（1–4）获取自适应排版规格
 */
function getCardLayoutConfig(count) {
  switch (count) {
    case 1:
      return {
        padTop: 26,
        padLeft: 26,
        padRight: 24,
        badgeHeight: 32,
        badgeFontSize: 14,
        titleSize: 31,
        titleLineHeight: 43,
        titleMaxLines: 3,
        titleGapTop: 22,
        tldrSize: 20,
        tldrLineHeight: 31,
        tldrMaxLines: 4,
        tldrBoxPadY: 16,
        tldrGapTop: 20,
        showTldrHeader: true,
        showDetails: true,
        maxDetails: 3,
        detailSize: 17.5,
        detailLineHeight: 26,
        detailMaxLines: 2,
        showSnippet: true,
        footerHeight: 50,
        footerFontSize: 14,
      };
    case 2:
      return {
        padTop: 20,
        padLeft: 24,
        padRight: 22,
        badgeHeight: 28,
        badgeFontSize: 13,
        titleSize: 25,
        titleLineHeight: 35,
        titleMaxLines: 2,
        titleGapTop: 15,
        tldrSize: 18,
        tldrLineHeight: 26,
        tldrMaxLines: 3,
        tldrBoxPadY: 11,
        tldrGapTop: 12,
        showTldrHeader: false,
        showDetails: true,
        maxDetails: 2,
        detailSize: 15.5,
        detailLineHeight: 22,
        detailMaxLines: 2,
        showSnippet: false,
        footerHeight: 44,
        footerFontSize: 13.5,
      };
    case 3:
      return {
        padTop: 16,
        padLeft: 22,
        padRight: 20,
        badgeHeight: 27,
        badgeFontSize: 12.5,
        titleSize: 22.5,
        titleLineHeight: 30,
        titleMaxLines: 2,
        titleGapTop: 11,
        tldrSize: 17,
        tldrLineHeight: 24,
        tldrMaxLines: 3,
        tldrBoxPadY: 9,
        tldrGapTop: 10,
        showTldrHeader: false,
        showDetails: false,
        maxDetails: 0,
        detailSize: 15,
        detailLineHeight: 21,
        detailMaxLines: 1,
        showSnippet: false,
        footerHeight: 37,
        footerFontSize: 13,
      };
    default: // 4 items
      return {
        padTop: 13,
        padLeft: 22,
        padRight: 18,
        badgeHeight: 25,
        badgeFontSize: 12,
        titleSize: 20.5,
        titleLineHeight: 27,
        titleMaxLines: 2,
        titleGapTop: 8,
        tldrSize: 15.5,
        tldrLineHeight: 21.5,
        tldrMaxLines: 2,
        tldrBoxPadY: 5,
        tldrGapTop: 7,
        showTldrHeader: false,
        showDetails: false,
        maxDetails: 0,
        detailSize: 14,
        detailLineHeight: 19,
        detailMaxLines: 1,
        showSnippet: false,
        footerHeight: 30,
        footerFontSize: 12.5,
      };
  }
}

/**
 * 绘制单条情报战报卡片（严格游标边界保护，绝不越界重叠）
 */
function drawIntelCard(ctx, item, index, rect, totalCount) {
  const { x, y, w, h } = rect;
  const cfg = getCardLayoutConfig(totalCount);
  const typeTheme = TYPE_THEMES[item?.type] || DEFAULT_TYPE_THEME;
  const statusTheme = STATUS_THEMES[item?.status] || DEFAULT_STATUS_THEME;
  const isFixed = item?.status === 'FIXED';

  ctx.save();

  // 1. 卡片背景与阴影
  ctx.save();
  drawRoundedRectPath(ctx, x, y, w, h, 14);
  ctx.shadowColor = 'rgba(2, 6, 23, 0.52)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 8;
  const cardGrad = ctx.createLinearGradient(x, y, x, y + h);
  if (isFixed) {
    cardGrad.addColorStop(0, 'rgba(17, 24, 39, 0.88)');
    cardGrad.addColorStop(1, 'rgba(11, 15, 25, 0.92)');
  } else {
    cardGrad.addColorStop(0, 'rgba(21, 31, 50, 0.95)');
    cardGrad.addColorStop(1, 'rgba(14, 21, 36, 0.96)');
  }
  ctx.fillStyle = cardGrad;
  ctx.fill();
  ctx.restore();

  // 卡片边框与顶部高光
  drawRoundedRectPath(ctx, x, y, w, h, 14);
  ctx.strokeStyle = isFixed
    ? 'rgba(71, 85, 105, 0.48)'
    : 'rgba(51, 65, 85, 0.88)';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // 左侧状态竖条
  drawRoundedRectPath(ctx, x + 1.5, y + 12, 4.5, h - 24, 3);
  ctx.fillStyle = statusTheme.barColor;
  ctx.fill();

  const innerLeft = x + cfg.padLeft;
  const innerRight = x + w - cfg.padRight;
  const contentW = innerRight - innerLeft;
  const footerLineY = y + h - cfg.footerHeight;

  // 2. 顶部标签行：类型标签 + 状态标（左） | value_tag 胶囊（右）
  const badgeY = y + cfg.padTop;
  const badgeFont = `700 ${cfg.badgeFontSize}px ${FONT_SANS}`;

  const typePillW = drawBadgePill(ctx, {
    x: innerLeft,
    y: badgeY,
    height: cfg.badgeHeight,
    text: typeTheme.label,
    font: badgeFont,
    textColor: isFixed ? '#94A3B8' : typeTheme.text,
    bgColor: isFixed ? 'rgba(71, 85, 105, 0.22)' : typeTheme.softBg,
    borderColor: isFixed ? 'rgba(100, 116, 139, 0.38)' : typeTheme.border,
    paddingX: 10,
    radius: 6,
  });

  drawBadgePill(ctx, {
    x: innerLeft + typePillW + 8,
    y: badgeY,
    height: cfg.badgeHeight,
    text: statusTheme.label,
    font: badgeFont,
    textColor: statusTheme.text,
    bgColor: statusTheme.softBg,
    borderColor: statusTheme.border,
    dotColor: statusTheme.dotColor,
    strikethrough: statusTheme.strikethrough,
    paddingX: 10,
    radius: 6,
  });

  drawValueTagCapsule(ctx, {
    rightX: innerRight,
    y: badgeY,
    height: cfg.badgeHeight,
    text: item?.value_tag || '高价值情报',
    theme: typeTheme,
    isFixed,
    maxWidth: 210,
  });

  let cursorY = badgeY + cfg.badgeHeight + cfg.titleGapTop;

  // 3. 情报硬核标题（中英混排自动折行）
  ctx.font = `700 ${cfg.titleSize}px ${FONT_SANS}`;
  const titleWrap = wrapText(ctx, item?.title || '未命名情报', contentW, cfg.titleMaxLines);
  ctx.fillStyle = isFixed ? '#94A3B8' : '#F8FAFC';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';

  for (let i = 0; i < titleWrap.lines.length; i += 1) {
    const lineText = titleWrap.lines[i];
    const lineY = cursorY + i * cfg.titleLineHeight;
    ctx.fillText(lineText, innerLeft, lineY);
    if (isFixed) {
      const lw = ctx.measureText(lineText).width;
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(innerLeft, lineY + cfg.titleSize * 0.54);
      ctx.lineTo(innerLeft + lw, lineY + cfg.titleSize * 0.54);
      ctx.stroke();
    }
  }

  cursorY += Math.max(1, titleWrap.lines.length) * cfg.titleLineHeight;

  // 1 条特写模式下增加细霓虹装饰线
  if (totalCount === 1) {
    cursorY += 12;
    ctx.fillStyle = isFixed ? '#64748B' : typeTheme.accent;
    ctx.fillRect(innerLeft, cursorY, 54, 3);
    ctx.fillStyle = 'rgba(51, 65, 85, 0.6)';
    ctx.fillRect(innerLeft + 62, cursorY + 1, contentW - 62, 1);
    cursorY += 6;
  }

  // 4. 省流结论 TL;DR 区块
  cursorY += cfg.tldrGapTop;
  const tldrInnerPadLeft = 14;
  const tldrInnerPadRight = 12;
  const tldrTextW = contentW - tldrInnerPadLeft - tldrInnerPadRight;
  const tldrHeaderH = cfg.showTldrHeader ? 24 : 0;

  ctx.font = `400 ${cfg.tldrSize}px ${FONT_SANS}`;
  // 预检查可用空间动态约束最大行数，绝对防止触碰底部线
  const maxAvailForTldr = Math.max(
    cfg.tldrLineHeight,
    footerLineY - 8 - cursorY - cfg.tldrBoxPadY * 2 - tldrHeaderH
  );
  const safeTldrMaxLines = Math.max(
    1,
    Math.min(cfg.tldrMaxLines, Math.floor(maxAvailForTldr / cfg.tldrLineHeight))
  );
  const tldrWrap = wrapText(ctx, item?.tldr || '', tldrTextW, safeTldrMaxLines);
  const tldrLinesCount = Math.max(1, tldrWrap.lines.length);
  const tldrBoxH = cfg.tldrBoxPadY * 2 + tldrHeaderH + tldrLinesCount * cfg.tldrLineHeight;

  // 绘制 TL;DR 暗色嵌板
  drawRoundedRectPath(ctx, innerLeft, cursorY, contentW, tldrBoxH, 8);
  ctx.fillStyle = 'rgba(7, 11, 20, 0.58)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(51, 65, 85, 0.45)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // TL;DR 左侧主题竖线
  drawRoundedRectPath(
    ctx,
    innerLeft + 1,
    cursorY + 6,
    3,
    Math.max(8, tldrBoxH - 12),
    2
  );
  ctx.fillStyle = isFixed ? '#64748B' : typeTheme.accent;
  ctx.fill();

  let tldrTextY = cursorY + cfg.tldrBoxPadY;
  if (cfg.showTldrHeader) {
    ctx.font = `700 12.5px ${FONT_MONO}`;
    ctx.fillStyle = isFixed ? '#94A3B8' : typeTheme.text;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText('TL;DR // 核心省流结论', innerLeft + tldrInnerPadLeft, tldrTextY);
    tldrTextY += tldrHeaderH;
  }

  ctx.font = `400 ${cfg.tldrSize}px ${FONT_SANS}`;
  ctx.fillStyle = isFixed ? '#94A3B8' : '#CBD5E1';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  for (let i = 0; i < tldrWrap.lines.length; i += 1) {
    ctx.fillText(
      tldrWrap.lines[i],
      innerLeft + tldrInnerPadLeft,
      tldrTextY + i * cfg.tldrLineHeight + 2
    );
  }

  cursorY += tldrBoxH;

  // 5. 关键要点 Details（仅 1 条 / 2 条宽松版式，严格按剩余高度裁剪）
  if (cfg.showDetails && Array.isArray(item?.details) && item.details.length > 0) {
    const safeBottom = footerLineY - 14;
    const headerNeed = totalCount === 1 ? 34 : 16;

    if (cursorY + headerNeed + cfg.detailLineHeight <= safeBottom) {
      cursorY += totalCount === 1 ? 22 : 12;

      if (totalCount === 1) {
        ctx.font = `700 13px ${FONT_MONO}`;
        ctx.fillStyle = '#94A3B8';
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        ctx.fillText('KEY DETAILS // 关键门槛与执行要点', innerLeft, cursorY);
        cursorY += 24;
      }

      const bulletIndent = 18;
      const detailTextW = contentW - bulletIndent;
      ctx.font = `400 ${cfg.detailSize}px ${FONT_SANS}`;

      const detailsToDraw = item.details.slice(0, cfg.maxDetails);
      for (const rawDetail of detailsToDraw) {
        const remainH = safeBottom - cursorY;
        if (remainH < cfg.detailLineHeight) break;

        const allowedLines = Math.min(
          cfg.detailMaxLines,
          Math.floor(remainH / cfg.detailLineHeight)
        );
        if (allowedLines < 1) break;

        const wrapped = wrapText(ctx, rawDetail, detailTextW, allowedLines);
        if (wrapped.lines.length === 0) continue;

        // 霓虹三角指示符
        ctx.fillStyle = isFixed ? '#64748B' : typeTheme.text;
        ctx.font = `700 ${cfg.detailSize}px ${FONT_SANS}`;
        ctx.fillText('▸', innerLeft, cursorY);

        ctx.fillStyle = isFixed ? '#94A3B8' : '#CBD5E1';
        ctx.font = `400 ${cfg.detailSize}px ${FONT_SANS}`;
        for (let l = 0; l < wrapped.lines.length; l += 1) {
          ctx.fillText(
            wrapped.lines[l],
            innerLeft + bulletIndent,
            cursorY + l * cfg.detailLineHeight
          );
        }
        cursorY += wrapped.lines.length * cfg.detailLineHeight + (totalCount === 1 ? 10 : 6);
      }
    }
  }

  // 6. 单条特写模式下的 Action Snippet 终端代码块预览（仅当有内容且剩余高度充足）
  const snippetRaw = typeof item?.action_snippet === 'string' ? item.action_snippet.trim() : '';
  if (cfg.showSnippet && snippetRaw) {
    const safeBottom = footerLineY - 16;
    const availH = safeBottom - (cursorY + 14);
    if (availH >= 102) {
      cursorY += 14;
      const codeHeaderH = 30;
      const codePadY = 10;
      const codeLineH = 21;
      const maxCodeLines = Math.min(
        5,
        Math.max(2, Math.floor((availH - codeHeaderH - codePadY * 2) / codeLineH))
      );

      const rawLines = snippetRaw
        .split(/\r?\n/)
        .map((line) => line.replace(/\t/g, '  '));
      const visibleLines = rawLines.slice(0, maxCodeLines);
      if (rawLines.length > maxCodeLines && visibleLines.length > 0) {
        visibleLines[visibleLines.length - 1] = `${visibleLines[visibleLines.length - 1]} …`;
      }

      const boxH = codeHeaderH + codePadY * 2 + visibleLines.length * codeLineH;
      drawRoundedRectPath(ctx, innerLeft, cursorY, contentW, boxH, 10);
      ctx.fillStyle = '#070B14';
      ctx.fill();
      ctx.strokeStyle = 'rgba(51, 65, 85, 0.78)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // 代码框头部栏
      drawRoundedRectPath(ctx, innerLeft, cursorY, contentW, codeHeaderH, [10, 10, 0, 0]);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
      ctx.fill();

      // 模拟终端三点指示灯
      const dotY = cursorY + codeHeaderH / 2;
      const dotColors = ['#EF4444', '#F59E0B', '#10B981'];
      dotColors.forEach((c, idx) => {
        ctx.beginPath();
        ctx.arc(innerLeft + 14 + idx * 12, dotY, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = c;
        ctx.fill();
      });

      ctx.font = `600 11.5px ${FONT_MONO}`;
      ctx.fillStyle = '#94A3B8';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillText('ACTION SNIPPET // 可在雷达站一键复制', innerLeft + 56, dotY + 0.5);

      // 代码内容（单行截断防横向溢出）
      ctx.font = `400 14px ${FONT_MONO}`;
      ctx.fillStyle = '#A7F3D0';
      ctx.textBaseline = 'top';
      const codeInnerW = contentW - 28;
      visibleLines.forEach((line, idx) => {
        const safeLine = truncateWithEllipsis(ctx, line, codeInnerW);
        ctx.fillText(safeLine, innerLeft + 14, cursorY + codeHeaderH + codePadY + idx * codeLineH);
      });
    }
  }

  // 7. 卡片底部分割线与来源/日期信息
  ctx.strokeStyle = 'rgba(51, 65, 85, 0.52)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(innerLeft, footerLineY);
  ctx.lineTo(innerRight, footerLineY);
  ctx.stroke();

  const footerCenterY = footerLineY + cfg.footerHeight / 2;
  const idxTag = `#0${index + 1}`;
  const sourceText = `来源：${item?.source_platform || '未知渠道'}`;
  const rightMeta = [item?.id, item?.date].filter(Boolean).join(' · ');

  ctx.textBaseline = 'middle';

  // 右侧 ID + 日期
  ctx.font = `500 ${cfg.footerFontSize}px ${FONT_MONO}`;
  ctx.fillStyle = '#64748B';
  ctx.textAlign = 'right';
  const rightW = ctx.measureText(rightMeta).width;
  ctx.fillText(rightMeta, innerRight, footerCenterY + 0.5);

  // 左侧序号 + 来源平台
  ctx.font = `700 ${cfg.footerFontSize}px ${FONT_MONO}`;
  ctx.fillStyle = isFixed ? '#64748B' : typeTheme.text;
  ctx.textAlign = 'left';
  const idxW = ctx.measureText(idxTag).width;
  ctx.fillText(idxTag, innerLeft, footerCenterY + 0.5);

  ctx.font = `500 ${cfg.footerFontSize}px ${FONT_SANS}`;
  ctx.fillStyle = '#94A3B8';
  const availSourceW = Math.max(80, contentW - idxW - rightW - 24);
  const safeSource = truncateWithEllipsis(ctx, sourceText, availSourceW);
  ctx.fillText(safeSource, innerLeft + idxW + 10, footerCenterY + 0.5);

  ctx.restore();
}

/**
 * 空选中态卡片（防御性兜底）
 */
function drawEmptyStateCard(ctx, rect) {
  const { x, y, w, h } = rect;
  ctx.save();
  drawRoundedRectPath(ctx, x, y, w, h, 16);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(71, 85, 105, 0.6)';
  ctx.setLineDash([8, 6]);
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 24px ${FONT_SANS}`;
  ctx.fillStyle = '#CBD5E1';
  ctx.fillText('暂未勾选情报条目', x + w / 2, y + h / 2 - 20);
  ctx.font = `400 16px ${FONT_SANS}`;
  ctx.fillStyle = '#64748B';
  ctx.fillText('请在左侧勾选 1–4 条高价值情报，实时渲染高清赛博战报', x + w / 2, y + h / 2 + 20);
  ctx.restore();
}

/**
 * 纯原生 Canvas 2D 高仿真矢量二维码矩阵（25×25 Version 2 规范结构 + 确定性伪随机点阵）
 */
function drawVectorQrCode(ctx, x, y, boxSize, seedText) {
  const modules = 25;
  const quietZone = 8;
  const innerSize = boxSize - quietZone * 2;
  const cellSize = Math.floor(innerSize / modules);
  const matrixPx = cellSize * modules;
  const startX = Math.round(x + (boxSize - matrixPx) / 2);
  const startY = Math.round(y + (boxSize - matrixPx) / 2);

  ctx.save();

  // 霓虹扫码角标外框
  const bracketOffset = 5;
  const bracketArm = 16;
  const bx1 = x - bracketOffset;
  const by1 = y - bracketOffset;
  const bx2 = x + boxSize + bracketOffset;
  const by2 = y + boxSize + bracketOffset;

  ctx.lineWidth = 2.5;
  ctx.lineCap = 'square';
  ctx.strokeStyle = '#10B981';
  // 左上
  ctx.beginPath();
  ctx.moveTo(bx1, by1 + bracketArm);
  ctx.lineTo(bx1, by1);
  ctx.lineTo(bx1 + bracketArm, by1);
  ctx.stroke();
  // 右下
  ctx.beginPath();
  ctx.moveTo(bx2 - bracketArm, by2);
  ctx.lineTo(bx2, by2);
  ctx.lineTo(bx2, by2 - bracketArm);
  ctx.stroke();

  ctx.strokeStyle = '#06B6D4';
  // 右上
  ctx.beginPath();
  ctx.moveTo(bx2 - bracketArm, by1);
  ctx.lineTo(bx2, by1);
  ctx.lineTo(bx2, by1 + bracketArm);
  ctx.stroke();
  // 左下
  ctx.beginPath();
  ctx.moveTo(bx1, by2 - bracketArm);
  ctx.lineTo(bx1, by2);
  ctx.lineTo(bx1 + bracketArm, by2);
  ctx.stroke();

  // 白色安全静音区底板
  drawRoundedRectPath(ctx, x, y, boxSize, boxSize, 10);
  ctx.fillStyle = '#F8FAFC';
  ctx.fill();

  // 构建 25×25 模块矩阵（null=未分配，0=白，1=黑）
  const grid = Array.from({ length: modules }, () => Array(modules).fill(null));

  const placeFinder = (topR, leftC) => {
    for (let r = -1; r <= 7; r += 1) {
      for (let c = -1; c <= 7; c += 1) {
        const rr = topR + r;
        const cc = leftC + c;
        if (rr < 0 || rr >= modules || cc < 0 || cc >= modules) continue;
        if (r === -1 || r === 7 || c === -1 || c === 7) {
          grid[rr][cc] = 0; // 1 模块白色分隔区
        } else if (
          r === 0 ||
          r === 6 ||
          c === 0 ||
          c === 6 ||
          (r >= 2 && r <= 4 && c >= 2 && c <= 4)
        ) {
          grid[rr][cc] = 1;
        } else {
          grid[rr][cc] = 0;
        }
      }
    }
  };

  // 3 个标准定位回字格
  placeFinder(0, 0);
  placeFinder(0, modules - 7);
  placeFinder(modules - 7, 0);

  // Version 2 对齐校正格（中心 18, 18 -> 16..20）
  for (let r = 16; r <= 20; r += 1) {
    for (let c = 16; c <= 20; c += 1) {
      const dr = Math.abs(r - 18);
      const dc = Math.abs(c - 18);
      grid[r][c] = Math.max(dr, dc) === 2 || (dr === 0 && dc === 0) ? 1 : 0;
    }
  }

  // 时序校准线（行 6 / 列 6）
  for (let i = 8; i <= modules - 9; i += 1) {
    if (grid[6][i] === null) grid[6][i] = i % 2 === 0 ? 1 : 0;
    if (grid[i][6] === null) grid[i][6] = i % 2 === 0 ? 1 : 0;
  }

  // 标准暗模块
  grid[modules - 8][8] = 1;

  // 确定性伪随机填充数据编码区
  const rand = createPrng(hashString(seedText));
  for (let r = 0; r < modules; r += 1) {
    for (let c = 0; c < modules; c += 1) {
      if (grid[r][c] === null) {
        grid[r][c] = rand() < 0.52 ? 1 : 0;
      }
    }
  }

  // 纯 fillRect 渲染黑色模块
  ctx.fillStyle = '#0B0F19';
  for (let r = 0; r < modules; r += 1) {
    for (let c = 0; c < modules; c += 1) {
      if (grid[r][c] === 1) {
        ctx.fillRect(
          startX + c * cellSize,
          startY + r * cellSize,
          cellSize,
          cellSize
        );
      }
    }
  }

  // 极轻微扫码激光横线点缀（不遮挡识别对比度）
  const scanGrad = ctx.createLinearGradient(x, y + boxSize * 0.36, x, y + boxSize * 0.56);
  scanGrad.addColorStop(0, 'rgba(16, 185, 129, 0)');
  scanGrad.addColorStop(0.5, 'rgba(16, 185, 129, 0.14)');
  scanGrad.addColorStop(1, 'rgba(16, 185, 129, 0)');
  ctx.fillStyle = scanGrad;
  ctx.fillRect(x + 4, y + boxSize * 0.36, boxSize - 8, boxSize * 0.2);

  ctx.restore();
}

/**
 * 绘制底部引导扫码框与品牌水印（Y: 1110 -> 1310）
 */
function drawFooter(ctx, items, dateStr) {
  const leftX = 36;
  const rightX = POSTER_WIDTH - 36;
  const panelW = rightX - leftX;
  const panelY = 1112;
  const panelH = 152;

  ctx.save();

  // 底部扫码面板
  drawRoundedRectPath(ctx, leftX, panelY, panelW, panelH, 16);
  const footGrad = ctx.createLinearGradient(leftX, panelY, rightX, panelY + panelH);
  footGrad.addColorStop(0, 'rgba(15, 23, 42, 0.92)');
  footGrad.addColorStop(1, 'rgba(13, 25, 42, 0.88)');
  ctx.fillStyle = footGrad;
  ctx.fill();

  const borderGrad = ctx.createLinearGradient(leftX, panelY, rightX, panelY);
  borderGrad.addColorStop(0, 'rgba(16, 185, 129, 0.52)');
  borderGrad.addColorStop(0.5, 'rgba(6, 182, 212, 0.42)');
  borderGrad.addColorStop(1, 'rgba(51, 65, 85, 0.65)');
  ctx.strokeStyle = borderGrad;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // 左侧纯矢量二维码
  const qrSize = 116;
  const qrX = leftX + 20;
  const qrY = panelY + Math.round((panelH - qrSize) / 2);
  const seedKey = [
    'AI-INTEL-RADAR',
    dateStr,
    ...items.map((it) => it?.id || ''),
  ].join('|');
  drawVectorQrCode(ctx, qrX, qrY, qrSize, seedKey);

  // 右侧扫码引导文案
  const textX = qrX + qrSize + 28;
  const textMaxW = rightX - 20 - textX;

  ctx.font = `700 12px ${FONT_MONO}`;
  ctx.fillStyle = '#34D399';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText('SCAN TO ACCESS // LIVE STATIC RADAR', textX, panelY + 20);

  ctx.font = `800 24px ${FONT_SANS}`;
  ctx.fillStyle = '#F8FAFC';
  ctx.fillText('长按识别 / 扫码直达雷达站', textX, panelY + 41);

  ctx.font = `400 15px ${FONT_SANS}`;
  ctx.fillStyle = '#94A3B8';
  const desc = '每日零成本同步 AI 算力羊毛、高危避坑与隐藏参数，一键复制直达实操';
  const descWrap = wrapText(ctx, desc, textMaxW, 2);
  descWrap.lines.forEach((line, idx) => {
    ctx.fillText(line, textX, panelY + 73 + idx * 21);
  });

  // 右下角特性胶囊
  const tags = ['0 API 成本', '每日巡检', '一键复制指令'];
  let tagCursorX = textX;
  const tagY = panelY + 122;
  for (const label of tags) {
    const tagFont = `600 11.5px ${FONT_SANS}`;
    const w = drawBadgePill(ctx, {
      x: tagCursorX,
      y: tagY,
      height: 21,
      text: label,
      font: tagFont,
      textColor: '#94A3B8',
      bgColor: 'rgba(30, 41, 59, 0.78)',
      borderColor: 'rgba(71, 85, 105, 0.55)',
      paddingX: 8,
      radius: 4,
    });
    tagCursorX += w + 8;
  }

  // 底部品牌水印行（Y = 1288）
  const watermarkY = 1288;
  const watermarkText = 'AI 圈前沿情报与算力羊毛雷达站  ·  ZERO-API STATIC RADAR';
  ctx.font = `600 12.5px ${FONT_MONO}`;
  ctx.fillStyle = '#64748B';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  const wmW = ctx.measureText(watermarkText).width;
  ctx.fillText(watermarkText, POSTER_WIDTH / 2, watermarkY);

  // 两侧装饰细线
  const lineGap = 14;
  const sideEndLeft = POSTER_WIDTH / 2 - wmW / 2 - lineGap;
  const sideStartRight = POSTER_WIDTH / 2 + wmW / 2 + lineGap;
  ctx.strokeStyle = 'rgba(51, 65, 85, 0.55)';
  ctx.lineWidth = 1;
  if (sideEndLeft > leftX + 8) {
    ctx.beginPath();
    ctx.moveTo(leftX, watermarkY);
    ctx.lineTo(sideEndLeft, watermarkY);
    ctx.stroke();
  }
  if (sideStartRight < rightX - 8) {
    ctx.beginPath();
    ctx.moveTo(sideStartRight, watermarkY);
    ctx.lineTo(rightX, watermarkY);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * 契约接口 1：在指定 Canvas 2D 上绘制 750×1334 暗黑赛博战报长图
 * @param {HTMLCanvasElement} canvas
 * @param {Array<object>} selectedItems
 * @param {object} meta
 */
export function drawPoster(canvas, selectedItems, meta = {}) {
  if (!canvas || typeof canvas.getContext !== 'function') {
    return;
  }

  canvas.width = POSTER_WIDTH;
  canvas.height = POSTER_HEIGHT;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const items = Array.isArray(selectedItems)
    ? selectedItems.filter(Boolean).slice(0, MAX_SELECTION)
    : [];
  const dateStr = resolvePosterDate(meta);

  // 1. 暗黑网格背景与 HUD 框线
  drawBackground(ctx);
  drawHudFrame(ctx);

  // 2. 顶部铭牌区
  drawHeader(ctx, items, dateStr);

  // 3. 中部自适应情报卡片区（Y: 250 -> 1094，总高 844px）
  const zoneX = 36;
  const zoneW = POSTER_WIDTH - 72; // 678px
  const zoneTop = 248;
  const zoneHeight = 846;

  if (items.length === 0) {
    drawEmptyStateCard(ctx, { x: zoneX, y: zoneTop + 20, w: zoneW, h: zoneHeight - 40 });
  } else if (items.length === 1) {
    const cardH = 816;
    const cardY = zoneTop + Math.round((zoneHeight - cardH) / 2);
    drawIntelCard(ctx, items[0], 0, { x: zoneX, y: cardY, w: zoneW, h: cardH }, 1);
  } else {
    const gapMap = { 2: 26, 3: 21, 4: 16 };
    const gap = gapMap[items.length] ?? 16;
    const totalGap = gap * (items.length - 1);
    const cardH = Math.floor((zoneHeight - totalGap) / items.length);
    const usedH = cardH * items.length + totalGap;
    const startY = zoneTop + Math.floor((zoneHeight - usedH) / 2);

    items.forEach((item, idx) => {
      const cardY = startY + idx * (cardH + gap);
      drawIntelCard(
        ctx,
        item,
        idx,
        { x: zoneX, y: cardY, w: zoneW, h: cardH },
        items.length
      );
    });
  }

  // 4. 底部扫码区与品牌水印
  drawFooter(ctx, items, dateStr);
}

/* ============================================================================
 * 抽屉交互模块与导出控制器
 * ========================================================================== */

const DRAWER_STYLE_ID = 'ai-radar-poster-drawer-styles';

function ensureDrawerStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(DRAWER_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = DRAWER_STYLE_ID;
  style.textContent = `
    .poster-backdrop {
      position: fixed;
      inset: 0;
      z-index: 45;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      background: rgba(3, 7, 18, 0.82);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      opacity: 0;
      transition: opacity 180ms ease;
    }
    .poster-backdrop[data-open="true"] {
      opacity: 1;
    }
    .poster-backdrop[hidden] {
      display: none !important;
    }
    .poster-dialog {
      width: min(1120px, 100%);
      max-width: 100%;
      height: min(880px, calc(100vh - 32px));
      max-height: calc(100vh - 32px);
      display: flex;
      flex-direction: column;
      background: #0B0F19;
      border: 1px solid rgba(51, 65, 85, 0.9);
      border-radius: 16px;
      box-shadow: 0 24px 64px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(16, 185, 129, 0.14);
      overflow: hidden;
      color: #E2E8F0;
      transform: translateY(10px) scale(0.99);
      transition: transform 200ms ease;
    }
    .poster-backdrop[data-open="true"] .poster-dialog {
      transform: translateY(0) scale(1);
    }
    .poster-header {
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 14px 20px;
      border-bottom: 1px solid rgba(30, 41, 59, 0.95);
      background: #0D1322;
    }
    .poster-list-header {
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 10px 16px;
      border-bottom: 1px solid rgba(30, 41, 59, 0.85);
      background: rgba(2, 6, 23, 0.55);
    }
    .poster-footer {
      flex: 0 0 auto;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 20px;
      border-top: 1px solid rgba(30, 41, 59, 0.95);
      background: #0D1322;
    }
    .poster-body {
      flex: 1 1 auto;
      min-height: 0;
      display: grid;
      grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
      overflow: hidden;
    }
    .poster-list-pane {
      display: flex;
      flex-direction: column;
      min-width: 0;
      min-height: 0;
      border-right: 1px solid rgba(30, 41, 59, 0.95);
      background: rgba(11, 15, 25, 0.96);
    }
    .poster-list-scroll {
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 12px 16px 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .poster-preview-pane {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-width: 0;
      min-height: 0;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 16px 20px;
      background:
        radial-gradient(circle at 50% 0%, rgba(16, 185, 129, 0.08), transparent 60%),
        #070B13;
    }
    .poster-canvas-frame {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      flex: 1 1 0%;
      min-height: 0;
      height: 100%;
    }
    .poster-canvas-el {
      display: block;
      aspect-ratio: 750 / 1334;
      width: auto;
      height: auto;
      max-width: min(100%, 400px);
      max-height: 100%;
      object-fit: contain;
      border-radius: 10px;
      border: 1px solid rgba(51, 65, 85, 0.85);
      box-shadow: 0 18px 42px rgba(0, 0, 0, 0.65);
      background: #0B0F19;
    }
    .poster-item-row {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 11px 12px;
      border-radius: 10px;
      border: 1px solid rgba(30, 41, 59, 0.95);
      background: rgba(15, 23, 42, 0.72);
      cursor: pointer;
      transition: border-color 140ms ease, background-color 140ms ease;
      min-width: 0;
      max-width: 100%;
    }
    .poster-item-row:hover {
      border-color: rgba(71, 85, 105, 0.95);
      background: rgba(15, 23, 42, 0.95);
    }
    .poster-item-row[data-selected="true"] {
      border-color: rgba(16, 185, 129, 0.65);
      background: rgba(6, 78, 59, 0.18);
      box-shadow: inset 0 0 0 1px rgba(16, 185, 129, 0.18);
    }
    .poster-item-row[data-fixed="true"] {
      opacity: 0.76;
    }
    .poster-item-title {
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      word-break: break-word;
    }
    .poster-scroll::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }
    .poster-scroll::-webkit-scrollbar-track {
      background: rgba(15, 23, 42, 0.6);
    }
    .poster-scroll::-webkit-scrollbar-thumb {
      background: rgba(71, 85, 105, 0.7);
      border-radius: 999px;
    }
    .poster-scroll::-webkit-scrollbar-thumb:hover {
      background: rgba(100, 116, 139, 0.9);
    }
    @media (max-width: 1023px) {
      .poster-backdrop {
        padding: 0;
        align-items: flex-end;
      }
      .poster-dialog {
        width: 100%;
        height: 100dvh;
        max-height: 100vh;
        border-radius: 0;
        border-left: none;
        border-right: none;
        border-bottom: none;
      }
      .poster-body {
        display: block;
        overflow-y: auto;
        overflow-x: hidden;
        -webkit-overflow-scrolling: touch;
      }
      .poster-list-pane {
        border-right: none;
        border-bottom: 1px solid rgba(30, 41, 59, 0.95);
      }
      .poster-list-scroll {
        overflow: visible;
        max-height: none;
      }
      .poster-preview-pane {
        overflow: visible;
        padding: 16px 14px 20px;
      }
      .poster-canvas-frame {
        flex: none;
      }
      .poster-canvas-el {
        width: min(100%, 332px);
        max-width: 100%;
        height: auto;
        max-height: none;
      }
    }
  `;
  document.head.appendChild(style);
}

/**
 * 默认选中规则：前 3 条 ACTIVE/URGENT；不足 3 条全选有效项；全为 FIXED 则选第 1 条
 */
function computeDefaultSelectedIds(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }
  const activeOrUrgent = items.filter(
    (it) => it && (it.status === 'ACTIVE' || it.status === 'URGENT')
  );
  if (activeOrUrgent.length > 0) {
    return activeOrUrgent.slice(0, DEFAULT_SELECTION_LIMIT).map((it) => it.id);
  }
  return items[0]?.id ? [items[0].id] : [];
}

/**
 * 按当前 items 顺序提取已选条目
 */
function resolveSelectedItems(items, selectedIds) {
  if (!Array.isArray(items) || !Array.isArray(selectedIds) || selectedIds.length === 0) {
    return [];
  }
  const selectedSet = new Set(selectedIds);
  return items.filter((it) => it && selectedSet.has(it.id)).slice(0, MAX_SELECTION);
}

/**
 * 触发浏览器下载 PNG 文件（优先 canvas.toBlob，失败或不支持时回退 canvas.toDataURL）
 */
function exportCanvasAsPng(canvas, filename) {
  return new Promise((resolve, reject) => {
    const triggerAnchor = (href, shouldRevoke) => {
      try {
        const link = document.createElement('a');
        link.href = href;
        link.download = filename;
        link.rel = 'noopener';
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        if (shouldRevoke) {
          setTimeout(() => {
            try {
              URL.revokeObjectURL(href);
            } catch {
              // ignore revoke error
            }
          }, 1500);
        }
        resolve({ filename, method: shouldRevoke ? 'blob' : 'dataURL' });
      } catch (err) {
        reject(err);
      }
    };

    const fallbackDataUrl = () => {
      try {
        const dataUrl = canvas.toDataURL('image/png');
        triggerAnchor(dataUrl, false);
      } catch (err) {
        reject(err);
      }
    };

    if (typeof canvas.toBlob === 'function') {
      try {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              fallbackDataUrl();
              return;
            }
            const objectUrl = URL.createObjectURL(blob);
            triggerAnchor(objectUrl, true);
          },
          'image/png',
          1.0
        );
      } catch {
        fallbackDataUrl();
      }
    } else {
      fallbackDataUrl();
    }
  });
}

/**
 * 创建单条勾选列表项（100% DOM API + textContent，杜绝 XSS）
 */
function createChecklistItemRow(item, isSelected, orderIndex, onToggle) {
  const row = document.createElement('label');
  row.className = 'poster-item-row';
  row.dataset.itemId = item.id || '';
  row.dataset.selected = isSelected ? 'true' : 'false';
  row.dataset.fixed = item.status === 'FIXED' ? 'true' : 'false';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = isSelected;
  checkbox.value = item.id || '';
  checkbox.className =
    'mt-1 h-4 w-4 shrink-0 rounded border-slate-600 bg-slate-900 accent-emerald-500 cursor-pointer';
  checkbox.setAttribute('aria-label', `选择情报：${item.title || item.id}`);
  checkbox.addEventListener('change', (evt) => {
    onToggle(item.id, evt.target.checked, checkbox);
  });

  const content = document.createElement('div');
  content.className = 'min-w-0 flex-1 space-y-1.5';

  // 顶部元信息行
  const metaRow = document.createElement('div');
  metaRow.className = 'flex flex-wrap items-center gap-1.5';

  if (isSelected && orderIndex >= 0) {
    const orderBadge = document.createElement('span');
    orderBadge.className =
      'inline-flex items-center rounded bg-emerald-500/20 px-1.5 py-0.5 font-mono text-[11px] font-bold text-emerald-300 border border-emerald-500/40';
    orderBadge.textContent = `#${orderIndex + 1}`;
    metaRow.appendChild(orderBadge);
  }

  const typeTheme = TYPE_THEMES[item.type] || DEFAULT_TYPE_THEME;
  const typeBadge = document.createElement('span');
  typeBadge.className =
    'inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold border';
  typeBadge.style.color = typeTheme.text;
  typeBadge.style.backgroundColor = typeTheme.softBg;
  typeBadge.style.borderColor = typeTheme.border;
  typeBadge.textContent = item.type || 'INTEL';
  metaRow.appendChild(typeBadge);

  const statusTheme = STATUS_THEMES[item.status] || DEFAULT_STATUS_THEME;
  const statusBadge = document.createElement('span');
  statusBadge.className =
    'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium border';
  statusBadge.style.color = statusTheme.text;
  statusBadge.style.backgroundColor = statusTheme.softBg;
  statusBadge.style.borderColor = statusTheme.border;
  if (statusTheme.strikethrough) {
    statusBadge.classList.add('line-through');
  }
  statusBadge.textContent = statusTheme.label;
  metaRow.appendChild(statusBadge);

  if (item.value_tag) {
    const valBadge = document.createElement('span');
    valBadge.className =
      'ml-auto inline-flex items-center rounded-full bg-slate-800/90 px-2 py-0.5 text-[11px] font-semibold text-emerald-300 border border-slate-700 shrink-0';
    valBadge.textContent = item.value_tag;
    metaRow.appendChild(valBadge);
  }

  const titleEl = document.createElement('p');
  titleEl.className = `poster-item-title text-[13px] font-semibold leading-snug ${
    item.status === 'FIXED' ? 'text-slate-400 line-through' : 'text-slate-100'
  }`;
  titleEl.textContent = item.title || '未命名情报';

  const footRow = document.createElement('div');
  footRow.className =
    'flex items-center justify-between gap-2 font-mono text-[11px] text-slate-400';
  const sourceSpan = document.createElement('span');
  sourceSpan.className = 'truncate';
  sourceSpan.textContent = item.source_platform || '';
  const dateSpan = document.createElement('span');
  dateSpan.className = 'shrink-0';
  dateSpan.textContent = item.date || '';
  footRow.append(sourceSpan, dateSpan);

  content.append(metaRow, titleEl, footRow);
  row.append(checkbox, content);
  return row;
}

/**
 * 契约接口 2：初始化悬浮战报生成器抽屉、实时预览与一键导出 PNG 控制器
 * @param {object} options
 * @param {() => Array<object>} options.getItems
 * @param {() => string} options.getUpdatedAt
 * @param {HTMLElement|null} options.triggerButton
 * @param {HTMLElement|null} options.mountRoot
 * @param {(message: string, variant?: string) => void} options.onToast
 */
export function initPosterGenerator({
  getItems,
  getUpdatedAt,
  triggerButton,
  mountRoot,
  onToast,
} = {}) {
  ensureDrawerStyles();

  const safeGetItems = () => {
    try {
      const result = typeof getItems === 'function' ? getItems() : [];
      return Array.isArray(result) ? result : [];
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
    if (typeof onToast === 'function') {
      onToast(msg, variant);
    }
  };

  const resolvedTrigger =
    triggerButton || document.getElementById('open-poster-btn');
  const resolvedRoot =
    mountRoot || document.getElementById('poster-drawer-root') || document.body;

  let isOpen = false;
  let hasUserModified = false;
  let selectedIds = [];
  let previousBodyOverflow = '';

  // 构建抽屉 DOM 结构
  const backdrop = document.createElement('div');
  backdrop.className = 'poster-backdrop';
  backdrop.hidden = true;
  backdrop.dataset.open = 'false';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-labelledby', 'poster-drawer-title');

  const dialog = document.createElement('div');
  dialog.className = 'poster-dialog';

  // Header
  const header = document.createElement('div');
  header.className =
    'poster-header shrink-0 flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5 border-b border-slate-800 bg-[#0D1322]';

  const headerLeft = document.createElement('div');
  headerLeft.className = 'min-w-0';
  const titleHeading = document.createElement('h2');
  titleHeading.id = 'poster-drawer-title';
  titleHeading.className =
    'text-base sm:text-lg font-bold text-slate-100 tracking-tight truncate';
  titleHeading.textContent = '⚡ 生成群聊速报长图';
  const titleSub = document.createElement('p');
  titleSub.className = 'font-mono text-[11px] text-slate-400 truncate mt-0.5';
  titleSub.textContent = 'NATIVE CANVAS 2D · 750×1334 HD · ZERO EXTERNAL ASSETS';
  headerLeft.append(titleHeading, titleSub);

  const headerRight = document.createElement('div');
  headerRight.className = 'flex items-center gap-2.5 shrink-0';

  const countBadge = document.createElement('span');
  countBadge.className =
    'inline-flex items-center rounded-md border border-emerald-500/45 bg-emerald-500/15 px-2.5 py-1 font-mono text-xs font-semibold text-emerald-300';
  countBadge.dataset.posterCount = '';
  countBadge.textContent = '已选 0 / 4 条';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className =
    'inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-900/80 text-slate-300 hover:border-slate-500 hover:text-white transition cursor-pointer';
  closeBtn.setAttribute('aria-label', '关闭战报生成器');
  closeBtn.textContent = '✕';

  headerRight.append(countBadge, closeBtn);
  header.append(headerLeft, headerRight);

  // Body
  const body = document.createElement('div');
  body.className = 'poster-body poster-scroll';

  // Left Pane: 勾选清单
  const listPane = document.createElement('section');
  listPane.className = 'poster-list-pane';
  listPane.setAttribute('aria-label', '选择要生成战报的情报条目');

  const listHeader = document.createElement('div');
  listHeader.className =
    'poster-list-header shrink-0 flex items-center justify-between gap-2 px-4 py-2.5 border-b border-slate-800/80 bg-slate-950/60';
  const listHint = document.createElement('span');
  listHint.className = 'text-xs font-medium text-slate-300';
  listHint.textContent = '勾选 1–4 条高价值情报，右侧实时重绘';

  const resetDefaultBtn = document.createElement('button');
  resetDefaultBtn.type = 'button';
  resetDefaultBtn.className =
    'shrink-0 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] font-medium text-slate-300 hover:border-emerald-500/60 hover:text-emerald-300 transition cursor-pointer';
  resetDefaultBtn.textContent = '恢复默认精选';

  listHeader.append(listHint, resetDefaultBtn);

  const listContainer = document.createElement('div');
  listContainer.className = 'poster-list-scroll poster-scroll';
  listPane.append(listHeader, listContainer);

  // Right Pane: 高清 Canvas 预览
  const previewPane = document.createElement('section');
  previewPane.className = 'poster-preview-pane poster-scroll';
  previewPane.setAttribute('aria-label', '750x1334 战报高清预览');

  const canvasFrame = document.createElement('div');
  canvasFrame.className = 'poster-canvas-frame';

  const canvasEl = document.createElement('canvas');
  canvasEl.width = POSTER_WIDTH;
  canvasEl.height = POSTER_HEIGHT;
  canvasEl.className = 'poster-canvas-el';
  canvasEl.setAttribute('aria-label', 'AI 情报速报长图 Canvas 预览');
  canvasFrame.appendChild(canvasEl);

  const previewMeta = document.createElement('p');
  previewMeta.className =
    'mt-2.5 text-center font-mono text-[11px] text-slate-400 shrink-0';
  previewMeta.textContent = '750 × 1334 px 高清竖屏 · 纯矢量无外链防污染';

  previewPane.append(canvasFrame, previewMeta);
  body.append(listPane, previewPane);

  // Footer
  const footer = document.createElement('div');
  footer.className =
    'poster-footer shrink-0 flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5 border-t border-slate-800 bg-[#0D1322]';

  const footerMeta = document.createElement('div');
  footerMeta.className = 'font-mono text-xs text-slate-400 truncate min-w-0';
  footerMeta.textContent = 'ai-intel-radar.png';

  const footerActions = document.createElement('div');
  footerActions.className = 'flex items-center gap-2.5 ml-auto shrink-0';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className =
    'rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs sm:text-sm font-medium text-slate-300 hover:border-slate-500 hover:text-white transition cursor-pointer';
  cancelBtn.textContent = '关闭';

  const exportBtn = document.createElement('button');
  exportBtn.type = 'button';
  exportBtn.setAttribute('data-export-poster', '');
  exportBtn.className =
    'inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-xs sm:text-sm font-bold text-slate-950 shadow-lg shadow-emerald-500/25 hover:bg-emerald-400 active:scale-[0.99] transition cursor-pointer';
  exportBtn.textContent = '⬇ 一键保存 PNG 战报';

  footerActions.append(cancelBtn, exportBtn);
  footer.append(footerMeta, footerActions);

  dialog.append(header, body, footer);
  backdrop.appendChild(dialog);

  // 挂载前清空旧挂载点内容（防止重复初始化产生双弹窗）
  if (resolvedRoot && resolvedRoot !== document.body) {
    resolvedRoot.replaceChildren(backdrop);
  } else {
    resolvedRoot.appendChild(backdrop);
  }

  /**
   * 校验并同步选中状态
   */
  function syncSelectionWithItems() {
    const items = safeGetItems();
    if (!hasUserModified) {
      selectedIds = computeDefaultSelectedIds(items);
      return items;
    }
    const validIdSet = new Set(items.map((it) => it?.id).filter(Boolean));
    selectedIds = selectedIds.filter((id) => validIdSet.has(id)).slice(0, MAX_SELECTION);
    if (selectedIds.length === 0 && items.length > 0) {
      selectedIds = computeDefaultSelectedIds(items);
    }
    return items;
  }

  function updateSummaryLabels(selectedItems, dateStr) {
    const count = selectedItems.length;
    countBadge.textContent = `已选 ${count} / ${MAX_SELECTION} 条`;
    footerMeta.textContent = `已选 ${count} / ${MAX_SELECTION} 条 · ai-intel-radar-${dateStr}.png`;
  }

  function handleToggleItem(itemId, wantChecked, checkboxEl) {
    const items = safeGetItems();
    const currentlySelected = selectedIds.includes(itemId);

    if (wantChecked && !currentlySelected) {
      if (selectedIds.length >= MAX_SELECTION) {
        if (checkboxEl) checkboxEl.checked = false;
        notify(`最多支持勾选 ${MAX_SELECTION} 条情报，请先取消 1 条后再选`, 'warning');
        return;
      }
      selectedIds = [...selectedIds, itemId];
      hasUserModified = true;
    } else if (!wantChecked && currentlySelected) {
      if (selectedIds.length <= MIN_SELECTION) {
        if (checkboxEl) checkboxEl.checked = true;
        notify(`至少保留 ${MIN_SELECTION} 条情报才能生成战报长图`, 'warning');
        return;
      }
      selectedIds = selectedIds.filter((id) => id !== itemId);
      hasUserModified = true;
    }

    // 保持选中顺序与原始情报列表顺序一致，便于阅读排版
    const orderLookup = new Map(items.map((it, idx) => [it.id, idx]));
    selectedIds.sort(
      (a, b) => (orderLookup.get(a) ?? 9999) - (orderLookup.get(b) ?? 9999)
    );

    renderChecklist(items);
    redraw();

    // 保留键盘操作焦点在刚切换的复选框上
    const safeEscapedId =
      typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
        ? CSS.escape(itemId)
        : String(itemId).replace(/["\\]/g, '\\$&');
    const restored = listContainer.querySelector(
      `input[type="checkbox"][value="${safeEscapedId}"]`
    );
    if (restored && typeof restored.focus === 'function') {
      restored.focus({ preventScroll: true });
    }
  }

  function renderChecklist(items) {
    listContainer.replaceChildren();
    if (!items || items.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.className =
        'rounded-lg border border-dashed border-slate-700 p-6 text-center text-xs text-slate-400';
      emptyMsg.textContent = '当前暂无可用情报条目';
      listContainer.appendChild(emptyMsg);
      return;
    }

    const orderedSelected = resolveSelectedItems(items, selectedIds);
    const orderIndexMap = new Map(
      orderedSelected.map((it, idx) => [it.id, idx])
    );

    const frag = document.createDocumentFragment();
    for (const item of items) {
      if (!item) continue;
      const isSelected = orderIndexMap.has(item.id);
      const orderIdx = isSelected ? orderIndexMap.get(item.id) : -1;
      frag.appendChild(
        createChecklistItemRow(item, isSelected, orderIdx, handleToggleItem)
      );
    }
    listContainer.appendChild(frag);
  }

  function redraw() {
    const items = syncSelectionWithItems();
    const selectedItems = resolveSelectedItems(items, selectedIds);
    const updatedAt = safeGetUpdatedAt();
    const dateStr = resolvePosterDate({ updatedAt });
    drawPoster(canvasEl, selectedItems, { date: dateStr, updatedAt });
    updateSummaryLabels(selectedItems, dateStr);
    return selectedItems;
  }

  function open() {
    const items = syncSelectionWithItems();
    renderChecklist(items);
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
    const selectedItems = redraw();
    if (selectedItems.length === 0) {
      notify('至少保留 1 条情报才能导出战报长图', 'warning');
      return { ok: false, filename: '', count: 0 };
    }

    const updatedAt = safeGetUpdatedAt();
    const dateStr = resolvePosterDate({ updatedAt });
    const filename = `ai-intel-radar-${dateStr}.png`;

    exportBtn.disabled = true;
    const prevLabel = exportBtn.textContent;
    exportBtn.textContent = '正在导出高清 PNG...';

    try {
      const result = await exportCanvasAsPng(canvasEl, filename);
      notify('战报长图 PNG 已生成并开始保存', 'success');
      return { ok: true, count: selectedItems.length, ...result };
    } catch {
      notify('战报导出失败，请检查浏览器下载权限后重试', 'error');
      return { ok: false, filename, count: selectedItems.length };
    } finally {
      exportBtn.disabled = false;
      exportBtn.textContent = prevLabel;
    }
  }

  function getSelectedIds() {
    return [...selectedIds];
  }

  // 事件绑定
  if (resolvedTrigger) {
    resolvedTrigger.addEventListener('click', () => {
      open();
    });
  }

  closeBtn.addEventListener('click', close);
  cancelBtn.addEventListener('click', close);

  backdrop.addEventListener('click', (evt) => {
    if (evt.target === backdrop) {
      close();
    }
  });

  document.addEventListener('keydown', (evt) => {
    if (evt.key === 'Escape' && isOpen) {
      evt.preventDefault();
      close();
    }
  });

  resetDefaultBtn.addEventListener('click', () => {
    hasUserModified = false;
    const items = syncSelectionWithItems();
    renderChecklist(items);
    redraw();
    notify('已恢复默认精选条目', 'info');
  });

  exportBtn.addEventListener('click', () => {
    exportPng();
  });

  // 初始化时预同步默认选中项（供外部提前调用 getSelectedIds/exportPng）
  syncSelectionWithItems();

  return {
    open,
    close,
    redraw,
    getSelectedIds,
    exportPng,
  };
}
