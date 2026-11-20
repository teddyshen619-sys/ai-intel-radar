/**
 * AI Intel Radar V3.0 — Three-Channel Static Data & Value-Sorting Engine
 * Pure ES6 Module · Zero build step · Conforms strictly to /data/schema.json (Draft 2020-12).
 */

/**
 * Status priority weight for global value sorting:
 * URGENT (3) > ACTIVE (2) > FIXED (1)
 */
export const STATUS_WEIGHT = Object.freeze({
  URGENT: 3,
  ACTIVE: 2,
  FIXED: 1,
});

/**
 * Valid sub-types per primary channel (matches /data/schema.json allOf constraint).
 */
export const CHANNEL_TYPES = Object.freeze({
  RADAR: Object.freeze(['DEAL', 'BUG', 'HACK']),
  REVIEW: Object.freeze(['BENCHMARK', 'VIDEO']),
  INTEL: Object.freeze(['MODEL', 'PRODUCT', 'POLICY']),
});

// Representative offline edition.
export const FALLBACK_DATA = {
  "updated_at": "2026-11-19T19:59:00+08:00",
  "items": [
    {
      "id": "ai-20261119-05",
      "date": "2026-11-19",
      "channel": "RADAR",
      "type": "DEAL",
      "status": "URGENT",
      "vendor": "OpenAI",
      "priority": 95,
      "impact": "高校教研人员、博士后与非营利科研实验室 PI",
      "title": "OpenAI 学术科研免费计划扩容至 20 万名学者：先到先得送 3 席 ChatGPT Plus",
      "value_tag": "白嫖 3 席 Plus",
      "tldr": "OpenAI 将 ChatGPT for Academic Researchers 扩容至 200,000 人并由抽签改为先到先得，获批主申请人可携最多 2 名同机构协作者免费使用 Plus，且默认不用于模型训练。",
      "details": [
        "资格门槛：面向受认可高校、科研机构及非营利组织的研究员、博士后、PI 与实验室负责人（支持区域内开放申请）。",
        "额度变更：名额由试点期翻倍至 20 万名；由试点 Pro 调整为正式 ChatGPT Plus（主申请人 + 最多 2 名同机构协作者共 3 席），审校机制改为先到先得。",
        "隐私承诺：通过该学术通道提交的研究数据默认不参与 OpenAI 模型训练，降低未发表论文与实验数据外泄风险。"
      ],
      "action_snippet": "",
      "source_platform": "OpenAI News",
      "source_url": "https://openai.com/index/expanding-chatgpt-for-academic-researchers"
    },
    {
      "id": "ai-20261119-01",
      "date": "2026-11-19",
      "channel": "INTEL",
      "type": "MODEL",
      "status": "ACTIVE",
      "vendor": "Google",
      "priority": 98,
      "impact": "AI 编程 Agent、科研与企业多模态工作流开发者",
      "title": "Google DeepMind 发布 Gemini 4 Neon：1M 上下文旗舰推理模型，$3/$15 定价对标 Opus 5.5",
      "value_tag": "AA 指数 #3 · 61 分",
      "tldr": "Google 发布 Gemini 4 Neon（gemini-4-neon），拥有 100 万统一上下文窗口，xhigh 推理档在 Artificial Analysis 拿下 61 分（总榜第 3），输入 $3 / 缓存 $0.15 / 输出 $15 每百万 Token。",
      "details": [
        "基准表现：Vals Index 70.9%（第 2）、Agent Arena 1336 分（第 2）、Terminal-Bench Science 70.5%，在 Antigravity 内部测试中创下最低幻觉率。",
        "定价与缓存：输入 $3.00/M、输出 $15.00/M，隐式前缀缓存命中低至 $0.15/M（享 95% 折扣）；同步输出默认 64K，后台长解码可扩展至 1M。",
        "上线渠道：今日起在 Google AI Studio / Gemini API、Gemini for business、Google Antigravity（Pro/Ultra 订阅）及 Gemini App 同步开放，支持 low/medium/high/xhigh 四档思考深度。"
      ],
      "action_snippet": "",
      "source_platform": "Google AI Blog",
      "source_url": "https://blog.google/innovation-and-ai/models-and-research/gemini-models/introducing-gemini-4-neon/"
    },
    {
      "id": "ai-20261119-09",
      "date": "2026-11-19",
      "channel": "REVIEW",
      "type": "BENCHMARK",
      "metric_badge": "AA 61 分 · $2.82/任务",
      "status": "ACTIVE",
      "vendor": "Google",
      "priority": 92,
      "impact": "在 Neon、Carbon 与 Fable 5.2 间做 Agent 选型的团队",
      "title": "Latent Space 深度汇总：Gemini 4 Neon 实测对标 Carbon/Fable 5.2，高并发下偶现容量报错",
      "value_tag": "性价比追平 Carbon",
      "tldr": "Latent Space 汇总首日第三方实测：Neon 在 high 档即追平 Carbon（AA 60 分、单任务 $3.74），Agent Arena 中位成本仅 $2.82；但高并发下偶现容量错误，Code Migration 仍略逊 Carbon。",
      "details": [
        "第三方榜单：Vals Index 达 70.9%（仅落后 Fable 5.2 0.4 分且单任务成本不到一半）；CursorBench 4.1 默认档从 Hydrogen 的 57.3% 跃升至 63.7%。",
        "档位与效率：GDP.pdf 上 high 档反超 xhigh（33.4% vs 28.0%）；Code Migration 平均仅需 160 轮（Carbon 234 轮、Hydrogen 574 轮），但得分低于两者。",
        "早期实测提醒：13 轮 Antigravity 重度测试录得 93% 输入缓存命中率，但也遇到 57 次容量错误与 4 次卡死；另 1.5 个月前发布的 Argon 已悄悄退役。"
      ],
      "action_snippet": "",
      "source_platform": "Latent Space",
      "source_url": "https://latent.space/p/ainews-gemini-4-neon-gdm-s-opus-sol-contender/"
    },
    {
      "id": "ai-20261119-16",
      "date": "2026-11-19",
      "channel": "REVIEW",
      "type": "VIDEO",
      "media_url": "https://i2.ytimg.com/vi/EDp4IoAUsXY/hqdefault.jpg",
      "metric_badge": "720p 24fps 世界模型",
      "status": "ACTIVE",
      "vendor": "Google",
      "priority": 85,
      "impact": "世界模型研究者、交互仿真与多模态开发者",
      "title": "Google DeepMind 发布 Project Genie 实机视频：Genie 4 驱动 720p/24fps 实时交互与原生音效",
      "value_tag": "实时交互世界模型",
      "tldr": "DeepMind 发布 Genie 4 驱动的 Project Genie 演示，告别静态视频渲染，直接在浏览器内以键鼠实时漫游 720p 24fps 动态世界，并首次原生同步生成环境音效与角色语音。",
      "details": [
        "多模型协同架构：由 Gemini Omni / Omni Flash 锚定视觉外观与物理规律，搭配 Gemini 推理模型保持多步事件连贯性与文本实时干预。",
        "原生音频生成：首次在世界模型内实时同步生成风声海浪、背景配乐及场景人物的动态交互对话。",
        "开放进度：正逐步面向 Google AI Ultra 订阅用户及 Google AI Studio / Gemini API 早期合作测试者推送。"
      ],
      "action_snippet": "",
      "source_platform": "YouTube · Google DeepMind",
      "source_url": "https://www.youtube.com/watch?v=EDp4IoAUsXY"
    }
  ]
};

const DATA_CANDIDATES = [
  { url: './data/intel_data.json', source: 'web-data' },
  { url: '../data/intel_data.json', source: 'root-data' },
];

/**
 * Deep-clone helper so consumers never mutate FALLBACK_DATA.
 * @template T
 * @param {T} value
 * @returns {T}
 */
function cloneDataset(value) {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

/**
 * Minimal structural guard matching /data/schema.json top-level requirements.
 * @param {unknown} payload
 * @returns {boolean}
 */
function isValidDataset(payload) {
  return (
    payload !== null &&
    typeof payload === 'object' &&
    !Array.isArray(payload) &&
    typeof payload.updated_at === 'string' &&
    Array.isArray(payload.items)
  );
}

/**
 * Resolve numeric status weight (URGENT: 3 > ACTIVE: 2 > FIXED: 1).
 * @param {unknown} status
 * @returns {number}
 */
function getStatusWeight(status) {
  const key = typeof status === 'string' ? status.trim().toUpperCase() : '';
  return STATUS_WEIGHT[key] || 0;
}

/**
 * Resolve numeric priority score (defaults safely to 0).
 * @param {unknown} priority
 * @returns {number}
 */
function getPriorityScore(priority) {
  const score = Number(priority);
  return Number.isFinite(score) ? score : 0;
}

/**
 * Strictly sort intel items without mutating the input array:
 * 1) status weight desc (URGENT: 3 > ACTIVE: 2 > FIXED: 1)
 * 2) priority desc
 * 3) date desc (YYYY-MM-DD)
 * 4) id desc
 * @param {Array<Record<string, unknown>>} items
 * @returns {Array<Record<string, unknown>>}
 */
export function sortIntelItems(items) {
  if (!Array.isArray(items)) return [];

  return items
    .filter((item) => item && typeof item === 'object')
    .slice()
    .sort((a, b) => {
      const weightDiff = getStatusWeight(b.status) - getStatusWeight(a.status);
      if (weightDiff !== 0) return weightDiff;

      const priorityDiff = getPriorityScore(b.priority) - getPriorityScore(a.priority);
      if (priorityDiff !== 0) return priorityDiff;

      const dateA = typeof a.date === 'string' ? a.date : '';
      const dateB = typeof b.date === 'string' ? b.date : '';
      if (dateB !== dateA) return dateB > dateA ? 1 : -1;

      const idA = typeof a.id === 'string' ? a.id : '';
      const idB = typeof b.id === 'string' ? b.id : '';
      if (idB !== idA) return idB > idA ? 1 : -1;

      return 0;
    });
}

/**
 * Format an ISO-8601 timestamp into readable local time (YYYY-MM-DD HH:mm).
 * @param {string} isoString
 * @returns {string}
 */
export function formatUpdatedAt(isoString) {
  if (typeof isoString !== 'string' || !isoString.trim()) {
    return '--';
  }
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return isoString;
  }
  const pad = (num) => String(num).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

/**
 * Load radar intel dataset with graceful static fallback chain:
 * 1) ./data/intel_data.json ('web-data')
 * 2) ../data/intel_data.json ('root-data')
 * 3) FALLBACK_DATA ('fallback')
 * Returned items are guaranteed to be sorted by sortIntelItems().
 * @returns {Promise<{ data: typeof FALLBACK_DATA, source: 'web-data' | 'root-data' | 'fallback' }>}
 */
export async function loadIntelData() {
  if (typeof fetch === 'function') {
    for (const candidate of DATA_CANDIDATES) {
      try {
        const response = await fetch(candidate.url, { cache: 'no-cache' });
        if (!response.ok) {
          continue;
        }
        const parsed = await response.json();
        if (isValidDataset(parsed)) {
          return {
            data: {
              ...parsed,
              items: sortIntelItems(parsed.items),
            },
            source: candidate.source,
          };
        }
      } catch {
        // Expected on file:// CORS or un-synced path; silently continue fallback chain.
      }
    }
  }

  const fallback = cloneDataset(FALLBACK_DATA);
  fallback.items = sortIntelItems(fallback.items);
  return {
    data: fallback,
    source: 'fallback',
  };
}

/**
 * Determine whether an item qualifies for the featured headline spotlight:
 * Non-FIXED and (URGENT or priority >= 90).
 * @param {Record<string, unknown>} item
 * @returns {boolean}
 */
function isFeaturedItem(item) {
  if (!item || typeof item !== 'object') return false;
  const status = typeof item.status === 'string' ? item.status.toUpperCase() : '';
  if (status === 'FIXED') return false;
  return status === 'URGENT' || getPriorityScore(item.priority) >= 90;
}

/**
 * Compute live KPI dashboard metrics from a radar dataset.
 * @param {typeof FALLBACK_DATA | null | undefined} data
 */
export function computeStats(data) {
  const items = Array.isArray(data?.items) ? data.items : [];
  let activeTotal = 0;
  let featuredCount = 0;
  let urgentCount = 0;
  let fixedCount = 0;
  let radarActiveCount = 0;
  let intelActiveCount = 0;
  let reviewActiveCount = 0;

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const status = typeof item.status === 'string' ? item.status.toUpperCase() : '';
    const channel = typeof item.channel === 'string' ? item.channel.toUpperCase() : '';

    if (status === 'FIXED') {
      fixedCount += 1;
    } else {
      activeTotal += 1;
      if (channel === 'RADAR') radarActiveCount += 1;
      else if (channel === 'REVIEW') reviewActiveCount += 1;
      else if (channel === 'INTEL') intelActiveCount += 1;
      if (isFeaturedItem(item)) featuredCount += 1;
    }

    if (status === 'URGENT') {
      urgentCount += 1;
    }
  }

  const updatedAtRaw = typeof data?.updated_at === 'string' ? data.updated_at : '';

  return {
    activeTotal,
    featuredCount,
    urgentCount,
    fixedCount,
    totalCount: items.length,
    radarActiveCount,
    intelActiveCount,
    reviewActiveCount,
    updatedAtRaw,
    updatedAtFormatted: formatUpdatedAt(updatedAtRaw),
  };
}

/**
 * Extract top featured headline items (non-FIXED and URGENT or priority >= 90),
 * strictly ordered by sortIntelItems().
 * @param {Array<Record<string, unknown>>} items
 * @param {number} [limit=2]
 * @returns {Array<Record<string, unknown>>}
 */
export function getFeaturedHeadlines(items, limit = 2) {
  if (!Array.isArray(items)) return [];
  const cap = Number.isFinite(Number(limit)) ? Math.max(0, Math.floor(Number(limit))) : 2;
  if (cap === 0) return [];
  return sortIntelItems(items.filter(isFeaturedItem)).slice(0, cap);
}

/**
 * Case-insensitive search across all specified V3.0 schema fields.
 * @param {Record<string, unknown>} item
 * @param {string} normalizedQuery
 * @returns {boolean}
 */
function matchesSearchQuery(item, normalizedQuery) {
  if (!normalizedQuery) return true;

  const detailsJoined = Array.isArray(item.details)
    ? item.details.filter((entry) => typeof entry === 'string').join(' ')
    : '';

  const haystack = [
    item.title,
    item.tldr,
    item.impact,
    item.vendor,
    item.value_tag,
    item.metric_badge,
    detailsJoined,
    item.action_snippet,
    item.source_platform,
    item.channel,
    item.type,
    item.id,
  ]
    .filter((value) => typeof value === 'string' && value.length > 0)
    .join('\n')
    .toLowerCase();

  if (haystack.includes(normalizedQuery)) {
    return true;
  }

  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  if (tokens.length > 1) {
    return tokens.every((token) => haystack.includes(token));
  }

  return false;
}

/**
 * Filter intel items by channel, sub-type, vendor, FIXED visibility, and keyword query.
 * Output is strictly sorted by sortIntelItems().
 * @param {Array<Record<string, unknown>>} items
 * @param {{ channel?: string, type?: string, vendor?: string, showFixed?: boolean, query?: string }} [options]
 * @returns {Array<Record<string, unknown>>}
 */
export function filterItems(items, options = {}) {
  if (!Array.isArray(items)) return [];

  const {
    channel = 'ALL',
    type = 'ALL',
    vendor = 'ALL',
    showFixed = false,
    query = '',
  } = options && typeof options === 'object' ? options : {};

  const normalizedChannel =
    typeof channel === 'string' ? channel.trim().toUpperCase() : 'ALL';
  const normalizedType = typeof type === 'string' ? type.trim().toUpperCase() : 'ALL';
  const normalizedVendor = typeof vendor === 'string' ? vendor.trim() : 'ALL';
  const normalizedVendorLower = normalizedVendor.toLowerCase();
  const normalizedQuery = typeof query === 'string' ? query.trim().toLowerCase() : '';

  const filtered = items.filter((item) => {
    if (!item || typeof item !== 'object') return false;

    const itemStatus = typeof item.status === 'string' ? item.status.toUpperCase() : '';
    if (!showFixed && itemStatus === 'FIXED') return false;

    if (normalizedChannel && normalizedChannel !== 'ALL') {
      const itemChannel =
        typeof item.channel === 'string' ? item.channel.toUpperCase() : '';
      if (itemChannel !== normalizedChannel) return false;
    }

    if (normalizedType && normalizedType !== 'ALL') {
      const itemType = typeof item.type === 'string' ? item.type.toUpperCase() : '';
      if (itemType !== normalizedType) return false;
    }

    if (normalizedVendor && normalizedVendorLower !== 'all') {
      const itemVendor =
        typeof item.vendor === 'string' ? item.vendor.trim().toLowerCase() : '';
      if (itemVendor !== normalizedVendorLower) return false;
    }

    return matchesSearchQuery(item, normalizedQuery);
  });

  return sortIntelItems(filtered);
}

/**
 * Aggregate vendors with item counts and highest priority from filtered items.
 * Ordered by: count desc -> maxPriority desc -> alphabetical asc.
 * @param {Array<Record<string, unknown>>} items
 * @param {{ channel?: string, type?: string, showFixed?: boolean, query?: string }} [options]
 * @returns {Array<{ vendor: string, count: number, maxPriority: number }>}
 */
export function extractVendors(items, options = {}) {
  if (!Array.isArray(items)) return [];

  const {
    channel = 'ALL',
    type = 'ALL',
    showFixed = false,
    query = '',
  } = options && typeof options === 'object' ? options : {};

  const scoped = filterItems(items, {
    channel,
    type,
    vendor: 'ALL',
    showFixed,
    query,
  });

  const vendorMap = new Map();
  for (const item of scoped) {
    const rawVendor = typeof item.vendor === 'string' ? item.vendor.trim() : '';
    if (!rawVendor) continue;
    const key = rawVendor.toLowerCase();
    const score = getPriorityScore(item.priority);
    const existing = vendorMap.get(key);
    if (existing) {
      existing.count += 1;
      if (score > existing.maxPriority) {
        existing.maxPriority = score;
      }
    } else {
      vendorMap.set(key, {
        vendor: rawVendor,
        count: 1,
        maxPriority: score,
      });
    }
  }

  return Array.from(vendorMap.values()).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    if (b.maxPriority !== a.maxPriority) return b.maxPriority - a.maxPriority;
    return a.vendor.localeCompare(b.vendor, 'en', { sensitivity: 'base' });
  });
}

/**
 * Compute per-channel item counts under the current showFixed & query state.
 * @param {Array<Record<string, unknown>>} items
 * @param {{ showFixed?: boolean, query?: string }} [options]
 * @returns {{ ALL: number, RADAR: number, INTEL: number, REVIEW: number }}
 */
export function computeChannelCounts(items, options = {}) {
  const {
    showFixed = false,
    query = '',
  } = options && typeof options === 'object' ? options : {};

  const matched = filterItems(items, {
    channel: 'ALL',
    type: 'ALL',
    vendor: 'ALL',
    showFixed,
    query,
  });

  const counts = {
    ALL: 0,
    RADAR: 0,
    INTEL: 0,
    REVIEW: 0,
  };

  for (const item of matched) {
    counts.ALL += 1;
    const ch = typeof item.channel === 'string' ? item.channel.toUpperCase() : '';
    if (ch === 'RADAR') counts.RADAR += 1;
    else if (ch === 'REVIEW') counts.REVIEW += 1;
    else if (ch === 'INTEL') counts.INTEL += 1;
  }

  return counts;
}

/**
 * Compute per-sub-type item counts under the current channel, vendor, showFixed & query state.
 * @param {Array<Record<string, unknown>>} items
 * @param {{ channel?: string, vendor?: string, showFixed?: boolean, query?: string }} [options]
 * @returns {{ ALL: number, DEAL: number, BUG: number, HACK: number, MODEL: number, PRODUCT: number, POLICY: number, BENCHMARK: number, VIDEO: number }}
 */
export function computeSubTypeCounts(items, options = {}) {
  const {
    channel = 'ALL',
    vendor = 'ALL',
    showFixed = false,
    query = '',
  } = options && typeof options === 'object' ? options : {};

  const matched = filterItems(items, {
    channel,
    type: 'ALL',
    vendor,
    showFixed,
    query,
  });

  const counts = {
    ALL: 0,
    DEAL: 0,
    BUG: 0,
    HACK: 0,
    MODEL: 0,
    PRODUCT: 0,
    POLICY: 0,
    BENCHMARK: 0,
    VIDEO: 0,
  };

  for (const item of matched) {
    counts.ALL += 1;
    const t = typeof item.type === 'string' ? item.type.toUpperCase() : '';
    if (Object.prototype.hasOwnProperty.call(counts, t)) {
      counts[t] += 1;
    }
  }

  return counts;
}
