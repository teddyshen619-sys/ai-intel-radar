/**
 * AI Intel Radar — Static Data Engine (Native ES6 Module)
 * Strictly conforms to /data/schema.json (Draft 2020-12).
 */

/**
 * Full offline/CORS fallback dataset, synchronized verbatim with /data/intel_data.json.
 */
export const FALLBACK_DATA = {
  $schema: './schema.json',
  updated_at: '2026-11-18T12:00:00+08:00',
  items: [
    {
      id: 'ai-20261118-01',
      date: '2026-11-18',
      type: 'DEAL',
      status: 'URGENT',
      title: 'OpenRouter 开发者黑客松限时口令：免绑卡领取 $25 全模型通用推理额度',
      value_tag: '立省 $25',
      tldr: '使用注册满 90 天的 GitHub 账号登录并兑换活动口令，可直接获赠 $25 OpenRouter Credits，覆盖 Claude / Gemini / DeepSeek 主流模型。',
      details: [
        '资格门槛：GitHub 账号需注册满 90 天且至少有 1 个公开仓库，无需绑定信用卡即可激活。',
        '库存预警：总奖池限量 5,000 份，单账号限领一次，到账后 60 天内有效，手慢随时下线。',
        '调用避坑：使用免费/赠金路由时建议在请求头附带 HTTP-Referer 与 X-Title，避免触发匿名风控限速。',
      ],
      action_snippet:
        '# 1. OpenRouter 控制台 Credits -> Redeem 输入优惠码：\nBUILD2026-OR25\n\n# 2. 终端快速核验到账余额：\ncurl -s https://openrouter.ai/api/v1/auth/key \\\n  -H "Authorization: Bearer $OPENROUTER_API_KEY"',
      source_platform: 'Hacker News',
      source_url: 'https://news.ycombinator.com/item?id=42168491',
    },
    {
      id: 'ai-20261118-02',
      date: '2026-11-18',
      type: 'BUG',
      status: 'ACTIVE',
      title: 'LangGraph 0.4.x + AsyncPostgresSaver 并发流式输出偶发 Checkpoint 死锁临时修复',
      value_tag: '避坑 3 小时',
      tldr: '并发调用 astream_events 且共享 thread_id 时，psycopg 连接池默认关闭 autocommit 会引发 checkpoints 表行锁死锁，需显式透传连接参数绕过。',
      details: [
        '触发条件：langgraph>=0.4.0 搭配 langgraph-checkpoint-postgres，在 FastAPI 异步高并发下读写同一会话状态。',
        '典型报错：psycopg.errors.DeadlockDetected 或流式响应无故 hang 住 30 秒后触发 statement_timeout。',
        '临时方案：初始化 AsyncConnectionPool 时强制开启 autocommit=True 并设置 prepare_threshold=0，同时兼容 PgBouncer 事务池模式。',
      ],
      action_snippet:
        'from psycopg_pool import AsyncConnectionPool\nfrom langgraph.checkpoint.postgres.aio import AsyncPostgresSaver\n\npool = AsyncConnectionPool(\n    conninfo=DATABASE_URL,\n    max_size=20,\n    kwargs={"autocommit": True, "prepare_threshold": 0},\n)\ncheckpointer = AsyncPostgresSaver(pool)',
      source_platform: 'GitHub Issues',
      source_url: 'https://github.com/langchain-ai/langgraph/issues/3842',
    },
    {
      id: 'ai-20261117-01',
      date: '2026-11-17',
      type: 'HACK',
      status: 'ACTIVE',
      title: 'OpenAI API 隐藏参数组合：service_tier="flex" 叠加 prompt_cache_key 成本直降 50%+',
      value_tag: '成本直降 50%',
      tldr: '非实时 Agent 离线任务显式开启 flex 算力层即可按半价计费，再绑定固定 prompt_cache_key 可将跨节点前缀缓存命中率拉升至 90% 以上。',
      details: [
        '适用场景：定时爬虫抽取、批量文档摘要、离线 Eval 评测等可接受 5~15 秒首字延迟的后台流水线。',
        '组合增益：flex 档位单价直接减半，固定 prompt_cache_key 会引导路由尽量落在同一缓存分片，避免高并发下缓存击穿。',
        '兜底建议：算力紧张时段可能返回 429 Resource Unavailable，建议客户端捕获后自动降级为 service_tier="auto"。',
      ],
      action_snippet:
        '{\n  "model": "gpt-4.1-mini",\n  "service_tier": "flex",\n  "prompt_cache_key": "radar-intel-extractor-v1",\n  "messages": [\n    { "role": "system", "content": "You are a strict JSON intelligence extractor..." },\n    { "role": "user", "content": "{{raw_content}}" }\n  ]\n}',
      source_platform: 'X (Twitter)',
      source_url: 'https://x.com/OpenAIDevs/status/1989512048371920112',
    },
    {
      id: 'ai-20261117-02',
      date: '2026-11-17',
      type: 'DEAL',
      status: 'ACTIVE',
      title: 'Cerebras Free Tier + Cloudflare Workers AI 零成本组合：日均白嫖 100 万 Token 推理流',
      value_tag: '月省 $40+',
      tldr: '用 Cerebras 免费层承接高速大参数结构化提取，配合 Cloudflare Workers AI 每日 10,000 Neurons 兜底，个人 AI 雷达站可实现彻底零 API 账单。',
      details: [
        'Cerebras 免费层实测稳定给到每日 1,000,000 Tokens 配额，Llama-3.3-70B 吐字速度 1,800+ tok/s，非常适合定时批处理。',
        'Cloudflare Workers AI 免费账号每日重置 10,000 Neurons，无需绑定信用卡即可直接跑 Embedding 与短文本分类。',
        '开通方式：分别登录各自控制台在 Web 界面生成 API Token 即可，无需优惠码；建议在脚本层加上 429 自动故障切换逻辑。',
      ],
      action_snippet: '',
      source_platform: 'Reddit r/LocalLLaMA',
      source_url:
        'https://www.reddit.com/r/LocalLLaMA/comments/1gtt8x2/zero_cost_inference_stack_cerebras_cf_workers_ai/',
    },
    {
      id: 'ai-20261116-01',
      date: '2026-11-16',
      type: 'HACK',
      status: 'URGENT',
      title: 'Anthropic API 开启 1 小时扩展 Prompt Cache：长间隔多轮 Agent 账单再砍 65%',
      value_tag: '长对话省 65%',
      tldr: '在请求头注入 extended-cache-ttl Beta 标识并在 cache_control 中指定 ttl="1h"，打破默认 5 分钟缓存失效限制，拯救低频长上下文工作流。',
      details: [
        '痛点解决：人工审批流（HITL）或长代码库交互式排查往往间隔超 5 分钟，默认 5m 缓存频繁失效导致 System Prompt 反复全额计费。',
        '回本测算：1 小时缓存写入溢价略高于默认档，但 60 分钟窗口内只要命中读取 >= 2 次即净省，多轮工具调用直接砍掉 65% 输入费用。',
        '窗口提醒：该参数仍依赖 Beta Header 协议头，近期可能随 SDK 大版本合并至正式参数，上线前请锁定依赖版本并关注响应头弃用提示。',
      ],
      action_snippet:
        'curl https://api.anthropic.com/v1/messages \\\n  -H "x-api-key: $ANTHROPIC_API_KEY" \\\n  -H "anthropic-version: 2023-06-01" \\\n  -H "anthropic-beta: extended-cache-ttl-2025-04-11" \\\n  -H "content-type: application/json" \\\n  -d \'{"model":"claude-sonnet-4-5","max_tokens":1024,"system":[{"type":"text","text":"<LARGE_SYSTEM_PROMPT>","cache_control":{"type":"ephemeral","ttl":"1h"}}],"messages":[{"role":"user","content":"Analyze logs"}]}\'',
      source_platform: 'GitHub Discussions',
      source_url: 'https://github.com/anthropics/anthropic-sdk-python/discussions/914',
    },
    {
      id: 'ai-20261115-01',
      date: '2026-11-15',
      type: 'BUG',
      status: 'FIXED',
      title: 'Dify v1.2.0 Docker Compose 原地升级后 plugin_daemon 循环重启（Redis 鉴权失败）修复指南',
      value_tag: '避坑 2 小时',
      tldr: 'Dify v1.2.0 新增的插件守护进程未正确回退读取旧版 REDIS_PASSWORD 导致启动即 CrashLoop，官方已于 v1.2.1 紧急修复，旧版亦可通过补齐环境变量热修。',
      details: [
        '影响范围：从 Dify 0.15.x / 1.1.x 直接拉取镜像升级到 v1.2.0 且沿用旧 docker/.env 的自托管实例。',
        '排查特征：docker logs docker-plugin_daemon-1 刷屏报错 redis: NOAUTH Authentication required，控制台插件市场白屏。',
        '修复状态：官方已发布 v1.2.1 补丁版本；若生产环境暂无法跨小版本升级，可先显式写入 PLUGIN_REDIS_PASSWORD 后单独重建容器。',
      ],
      action_snippet:
        "# 推荐：直接升级至官方已修复版本 v1.2.1\ngit fetch origin && git checkout 1.2.1 && docker compose -f docker/docker-compose.yaml up -d --force-recreate plugin_daemon\n\n# 临时热修（仅限停留在 v1.2.0 时）：\necho 'PLUGIN_REDIS_PASSWORD=${REDIS_PASSWORD}' >> docker/.env && docker compose -f docker/docker-compose.yaml up -d plugin_daemon",
      source_platform: 'GitHub Issues',
      source_url: 'https://github.com/langgenius/dify/issues/16409',
    },
  ],
};

const DATA_CANDIDATES = [
  { url: './data/intel_data.json', source: 'web-data' },
  { url: '../data/intel_data.json', source: 'root-data' },
];

/**
 * Deep-clone helper so consumers never accidentally mutate FALLBACK_DATA.
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
            data: parsed,
            source: candidate.source,
          };
        }
      } catch {
        // Expected on file:// CORS or un-synced path; silently continue fallback chain.
      }
    }
  }

  return {
    data: cloneDataset(FALLBACK_DATA),
    source: 'fallback',
  };
}

/**
 * Compute live KPI dashboard metrics from a radar dataset.
 * @param {typeof FALLBACK_DATA | null | undefined} data
 */
export function computeStats(data) {
  const items = Array.isArray(data?.items) ? data.items : [];
  let activeDeals = 0;
  let activeBugs = 0;
  let activeHacks = 0;
  let activeTotal = 0;
  let urgentCount = 0;
  let fixedCount = 0;

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const isFixed = item.status === 'FIXED';

    if (isFixed) {
      fixedCount += 1;
    } else {
      activeTotal += 1;
      if (item.type === 'DEAL') activeDeals += 1;
      else if (item.type === 'BUG') activeBugs += 1;
      else if (item.type === 'HACK') activeHacks += 1;
    }

    if (item.status === 'URGENT') {
      urgentCount += 1;
    }
  }

  const updatedAtRaw = typeof data?.updated_at === 'string' ? data.updated_at : '';

  return {
    activeDeals,
    activeBugs,
    activeHacks,
    activeTotal,
    urgentCount,
    fixedCount,
    totalCount: items.length,
    updatedAtRaw,
    updatedAtFormatted: formatUpdatedAt(updatedAtRaw),
  };
}

/**
 * Case-insensitive search across all specified schema fields.
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
    item.value_tag,
    detailsJoined,
    item.action_snippet,
    item.source_platform,
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
 * Filter intel items by type, FIXED visibility, and keyword query.
 * @param {Array<Record<string, unknown>>} items
 * @param {{ type?: string, showFixed?: boolean, query?: string }} [options]
 */
export function filterItems(items, options = {}) {
  if (!Array.isArray(items)) return [];

  const {
    type = 'ALL',
    showFixed = false,
    query = '',
  } = options && typeof options === 'object' ? options : {};

  const normalizedType = typeof type === 'string' ? type.trim().toUpperCase() : 'ALL';
  const normalizedQuery = typeof query === 'string' ? query.trim().toLowerCase() : '';

  return items.filter((item) => {
    if (!item || typeof item !== 'object') return false;
    if (!showFixed && item.status === 'FIXED') return false;
    if (normalizedType && normalizedType !== 'ALL' && item.type !== normalizedType) {
      return false;
    }
    return matchesSearchQuery(item, normalizedQuery);
  });
}

/**
 * Compute per-category item counts under the current showFixed & query state.
 * @param {Array<Record<string, unknown>>} items
 * @param {{ showFixed?: boolean, query?: string }} [options]
 * @returns {{ ALL: number, DEAL: number, BUG: number, HACK: number }}
 */
export function computeCategoryCounts(items, options = {}) {
  const {
    showFixed = false,
    query = '',
  } = options && typeof options === 'object' ? options : {};

  const matched = filterItems(items, { type: 'ALL', showFixed, query });
  const counts = {
    ALL: 0,
    DEAL: 0,
    BUG: 0,
    HACK: 0,
  };

  for (const item of matched) {
    counts.ALL += 1;
    if (item.type === 'DEAL') counts.DEAL += 1;
    else if (item.type === 'BUG') counts.BUG += 1;
    else if (item.type === 'HACK') counts.HACK += 1;
  }

  return counts;
}
