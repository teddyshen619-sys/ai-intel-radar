# AI 圈前沿情报与算力羊毛雷达站

零 API 成本、纯静态托管的 AI 前沿情报雷达站。通过 GitHub Actions 定时运行 Python 采集脚本更新静态 JSON 数据源，并由 Cloudflare Pages 自动构建与全球边缘分发。

## 架构数据流

```text
GitHub Actions (Cron)
  └─> /scraper/ (Python 采集 + schema 严格校验)
        └─> /data/ (情报、精选模型价格快照与异动)
              └─> Git Push 触发 Cloudflare Pages 自动部署
                    └─> /web/ (纯静态前端直接 fetch JSON，零后端 API 成本)
```

## 目录结构

- `/data/schema.json`：数据源与单条情报的严格 JSON Schema（Draft 2020-12）规范
- `/data/intel_data.json`：核心静态数据源（含全局 `updated_at` 与 `items` 情报数组）
- `/data/models_catalog.json`：精选模型的价格、输出上限、工具调用支持和到期日期。价格单位为美元 / 百万 token，缓存价格为空表示上游未提供报价。
- `/data/catalog_changes.json`：与上一份精选目录快照比较得到的新增免费型号、输入/输出/缓存读取单价变动及 30 天内到期的模型。价格变动达到 20% 即收录，从零价转为收费时单独注明。日报顶部同步展示异动摘要。
- `/scraper/`：Python 自动化采集与数据校验脚本（内置零依赖 `validate_data.py`）
- `/web/`：纯静态前端应用（原生 HTML + Tailwind CDN 极简架构，零构建负担）
- `/.github/workflows/`：GitHub Actions 定时巡检与自动提交流水线

## 本地校验数据

```bash
python scraper/validate_data.py
```

## 维护 Agent 实战课程

教程正文的唯一人工来源是 `guides/*.md`。复制一篇作为起点，用文本编辑器保存为 UTF-8。修改内容时同步更新 `updated_at`；给新增课程分配唯一的 `id` 和正整数 `order`，排序允许留空档。

元数据的首尾各用一行 `---`。每行写一个英文键、半角冒号和原文值。必填键为 `id`、`order`、`track`、`title`、`summary`、`updated_at`、`author_note`、`related_tags`。日期使用 YYYY-MM-DD，标签以中英文逗号分隔。值按单行纯文本读取，可直接输入引号、冒号或反斜线，无需 YAML 引号或 JSON 转义。

正文从 `## 小节标题` 开始，各二级标题按顺序成为一个 step。用三反引号或波浪线围栏放多行代码，用 `> 风险提示：文字` 标识提醒。完整正文与每节 Markdown 都会保留。构建失败时按报错中的文件和行号修正后重跑。

```bash
python scraper/build_guides.py
python scraper/fetch_radar.py
python scraper/validate_data.py
```

打包器按 `data/guides_schema.json` 的课程契约生成 `data/guides.json`，并同步到 `web/data/guides.json`。两份 JSON 都是派生文件。前端可以按 `guides[].steps` 读取标题、原文、代码块和风险提示。

每日采集将官方发布、Codex README 的安装段落和课程相关故障记入 `scraper/guides_updates.md`。站长核对来源后手动编辑 Markdown，再重新打包。工作流只提交指定的生成物，公开部署加载 `web/data/` 中的副本。

## Cloudflare Pages 部署配置

- **Framework preset**: `None`
- **Build command**: `python scraper/build_guides.py && mkdir -p web/data && cp data/guides.json data/intel_data.json data/models_catalog.json web/data/ && if [ -f data/catalog_changes.json ]; then cp data/catalog_changes.json web/data/; fi`
- **Build output directory**: `web`

