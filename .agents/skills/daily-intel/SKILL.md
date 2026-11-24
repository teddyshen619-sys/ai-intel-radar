---
name: daily-intel
description: >-
  《前哨 Radar》每日 AI 情报采编、候选筛选、一手源交叉核查、双层正文（details + story）撰写、数据合入与本地预览核验规范（Daily AI intel curation, candidate screening, primary-source fact-checking, two-tier editorial writing, schema-validated merge, and local preview verification for Radar）. 当需要执行每日新闻抓取备料、筛选撰写 AI 情报草稿、降级旧置顶条目或同步静态数据源时启用。
---

# 《前哨 Radar》每日 AI 情报采编与合入规范（Daily Intel SOP）

## 一、定位与资产保护红线

本规范用于指导《前哨》（英文名唯一固定为 `Radar` / `RADAR`）的日常 AI 情报采编、事实核验、结构化撰稿与双份静态数据发布闭环。

1. **工具链唯一入口**：日常采编统一通过 `python scraper/daily_news.py`（子命令 `status` / `prep` / `apply`）完成，严禁绕过门禁手工拼接 `data/intel_data.json` 或漏同步 `web/data/`。
2. **原创课程隔离红线**：日常新闻流水线绝不创建、覆盖或删除 `guides/*.md` 与 `web/guides-media/*`。`apply` 仅在 `data/guides.json` 与 `web/data/guides.json` 字节不一致时做只读字节镜像，绝不反向改写课程手稿。
3. **品牌与排版铁律**：
   - **零 Emoji 铁律**：所有标题、摘要、要点、深度正文、指标徽章、代码块及提示词中，严禁出现任何 Emoji 表情字符、装饰性符号或变体选择符（`\uFE0F` / `\u200D`）。
   - **品牌词洁净铁律**：项目中文名唯一固定为「前哨」，英文名唯一固定为 `Radar` / `RADAR`，严禁在任何文稿、注释或标签中使用任何历史旧英文品牌词。

---

## 二、双模标准作业流程（Dual-Mode SOP）

### 模式一：站内直出闭环流程（Agent 联网核查 + 直接成稿）

适用于具备联网搜索与网页读取能力的本地 Agent 直接完成当日采编：

1. **状态巡检（可选）**：
   ```bash
   python scraper/daily_news.py status --days 7
   ```
   核查当前情报总数、今日起始可用 ID（如 `ai-20261122-01`）、当前全部 `URGENT` 置顶条目及 `scraper/raw_digest.md` 更新时间。
2. **采集与备料**：
   ```bash
   python scraper/daily_news.py prep
   ```
   自动调用 `fetch_radar.py` 刷新 `scraper/raw_digest.md`（含官方博客 RSS、GitHub Release/Issue、Hacker News、YouTube、Hugging Face Daily Papers，以及经公开检索接口与官方 oEmbed 自动补全正文的 `X · @账号` 推文动态）、`data/models_catalog.json` 与 `data/catalog_changes.json`，生成清洗完 Emoji 的候选与契约文档 `scraper/.daily_prompt.md`，并初始化空草稿 `scraper/.daily_draft.json`（若草稿非空默认保留，需重置时显式传 `--reset-draft`；若仅基于已有摘要重生成提示词可加 `--no-fetch`）。
3. **一手信源交叉核实与 X 官号补充巡检**：
   - 阅读 `scraper/.daily_prompt.md` 中的「模型价格与免费额度异动速报」、「大众实用与免费福利精选」与三频道高分候选（含 `X · @账号` 推文候选），对照近 7 天防重清单剔除重复线索。
   - **X 首发动态补充巡检（免登录、零风控）**：使用网页搜索工具定向检索核心厂商与主创近 24~48 小时公开推文（如 `site:x.com (OpenAI OR ChatGPT OR AnthropicAI OR claudeai OR GoogleDeepMind OR xai OR deepseek_ai OR Alibaba_Qwen)`），补齐尚未发博客的突发官宣、功能灰度、模型退役通知或限时订阅福利；如需核对某条公开推文的逐字原文，可读取官方公开 oEmbed 接口 `https://publish.twitter.com/oembed?url=https://twitter.com/<账号>/status/<ID>&omit_script=true&dnt=true`，严禁使用任何账号 Cookie 爬虫或绕过反爬验证。
   - 对拟入选条目逐一联网访问官方博客、原始论文/PDF、GitHub Release/Issue、官方 X 推文或独立基准页面核实参数细节。
4. **筛选撰稿与置顶维护**：
   精选当日 **3~8 条**高信噪比情报，按双层正文规范写入 `scraper/.daily_draft.json`；同时审视现有 `URGENT` 置顶列表，将已过 24~48 小时突发窗口的条目写入 `status_updates` 降级为 `ACTIVE`（若福利已截止或漏洞已修复则标为 `FIXED`）。
5. **门禁预检与正式合入**：
   ```bash
   python scraper/daily_news.py apply --dry-run
   python scraper/daily_news.py apply
   ```
   `apply` 会依次执行零 Emoji 与品牌词扫描、ID 与归一化 `source_url` 防重检查、前端同构四级排序、北京时间秒级 `updated_at` 刷新、`data/intel_data.json` 原子写入、`web/data/` 双份字节同步，并自动调用 `validate_data.py` 确认三项核心数据全部 `[OK]`。
6. **回归单测与本地预览审阅**：
   ```bash
   python scraper/validate_data.py
   python scraper/test_studio.py
   python -m http.server 8080 --directory web
   ```
   确认单测零失败并在本地浏览器核验头条卡片、频道筛选与深度长文折叠展开渲染无误，交由站主审阅。

### 模式二：外部助手协作流程（导出提示词 -> 外部撰稿 -> 本地合入）

适用于将候选线索交由外部联网大模型撰稿后再合入本地仓库：

1. 执行 `python scraper/daily_news.py prep` 生成自包含提示词文件 `scraper/.daily_prompt.md`。
2. 将 `scraper/.daily_prompt.md` 全文整段复制给外部联网采编助手，要求其联网核实一手源并输出纯 JSON 结果。
3. 将外部助手输出的 JSON 粘贴保存至 `scraper/.daily_draft.json`。
4. 执行 `python scraper/daily_news.py apply --dry-run` 预检，通过后运行 `python scraper/daily_news.py apply` 完成校验、排序与双份静态文件同步。

---

## 三、选题优先级与频道分类规范

### 1. 三频道与子类型严格映射（跨频道混配直接拦截）

| 一级频道 (`channel`) | 允许子类型 (`type`) | 收录定位 |
| --- | --- | --- |
| `RADAR` | `DEAL` / `BUG` / `HACK` | 免费算力与模型额度、API 大幅降价福利、影响开发者的严重故障/CVE 预警、高价值工程提效技巧 |
| `INTEL` | `MODEL` / `PRODUCT` / `POLICY` | 旗舰与开源权重模型发布、核心开发工具/Agent 重大产品迭代、厂商定价策略/合规/服务条款重大变更 |
| `REVIEW` | `BENCHMARK` / `VIDEO` | 独立第三方硬核横向评测、长上下文/推理成本实测报告、一手官方演示或技术主创深度拆解视频 |

### 2. 优先级评分（`priority`）与状态（`status`）标尺

- **`priority: 92 ~ 100`（头版重磅）**：一线大厂旗舰模型/开源底座发布、颠覆性算力价格跳水或重磅免费额度、轰动学界/工业界的技术突破或重大生产事故。当日仅挑选最核心的 **1~2 条**配置 `story` 深度报道。
- **`priority: 80 ~ 91`（高价值重点）**：主流编码 Agent 重要版本发布、权威第三方首日实测、明确的开发者省钱通道或高频排障方案。
- **`priority: 70 ~ 79`（常规精选）**：值得关注的生态工具更新、垂直领域基准或细分功能开放。低于 70 分或缺乏实质参数/信源支撑的公关软文不予收录。
- **`status` 置顶纪律**：仅限强时效限时福利、突发重大发布或紧急故障预警使用 `URGENT`；常规有效情报一律使用 `ACTIVE`；每次日更时主动在 `status_updates` 中清理过期的旧 `URGENT` 条目，保持头版焦点清晰。

---

## 四、事实核查与双层正文写作边界

### 1. 事实核查铁律

- **一手人类可读信源**：`source_url` 必须指向人类可直接阅读的原始网页（官方公告、arXiv/个人论文 PDF、GitHub Release/Issue 页面、OpenRouter 模型页、YouTube 观看页、公开 X 推文页 `https://x.com/<账号>/status/<推文ID>` 等），严禁填入 `api.github.com`、`hacker-news.firebaseio.com`、`hn.algolia.com`、`publish.twitter.com`、`t.co` 短链、含 `/api/` 路径或 `.json/.xml/.rss/.atom/.feed` 机器订阅地址。以 X 推文为一手源时，`source_platform` 统一填 `X (@账号)`；若推文指向参数更详尽的官方博客、论文或 GitHub Release，优先采用该长文一手链接。
- **确定性严格分级**：必须明确区分**「官方正式发布 / 独立第三方实测验证」**与**「个人单方宣称 / 社区传闻 / 尚未验证」**。对于未经同行评审或独立团队完整复现的重大宣称，必须在 `title`、`value_tag`、`tldr` 与 `details` 中显式标注“作者宣称 / 尚未验证 / 待独立复核”，严禁把单方声明直接写成既成定论。
- **数据逐项对齐**：模型上下文窗口、总参量/激活参量、百万 Token 输入/缓存/输出单价、涨跌百分比、开源许可证与申请门槛必须与一手原文核对无误。

### 2. 双层正文分工边界（`details` vs `story`）

- **第一层 `details`（所有条目必填）**：
  - 严格保持 **3~5 条**精炼硬核事实要点。
  - 每条聚焦一个独立维度（如“核心规格”、“定价与缓存”、“实测基准”、“资格门槛”、“风险与避坑”），直接给出可核查数字与结论，严禁铺垫寒暄或堆砌形容词水文。
- **第二层 `story`（仅重磅条目可选）**：
  - **触发门槛**：仅限当日头版重磅事件（通常 **1~2 条**，`priority >= 92`）附带 `story` 数组；常规条目省略 `story` 键。
  - **结构要求**：由 **2~4 个小节**组成，每节包含精炼小标题 `heading`（`1~80` 字符）与非空段落数组 `paragraphs`（每节建议 2~4 段）。
  - **叙事职责**：交代事件的行业前因后果、核心技术路线或数学/系统机制拆解、多方独立验证进展及技术社区的正反审视，与卡片区的 `tldr` / `details` 形成“一分钟速览 + 五分钟深度阅读”的清晰分层，避免将 `details` 原句机械扩写。

---

## 五、Schema 字段长度硬上限速查

撰稿与自检时必须确保以下字符数上限（Python `len()` 计字符数）：

- `title`: `1 ~ 120`
- `tldr`: `1 ~ 240`
- `impact`: `1 ~ 80`
- `vendor`: `1 ~ 40`
- `value_tag`: `1 ~ 40`
- `metric_badge`（可选）: `<= 40`
- `source_platform`: `1 ~ 60`
- `story[].heading`（可选）: `1 ~ 80`
- `action_snippet`: 无可执行代码/命令/模型标识时必须填 `""`（空字符串）
