# AI 圈前沿情报与算力羊毛雷达站

零 API 成本、纯静态托管的 AI 前沿情报雷达站。通过 GitHub Actions 定时运行 Python 采集脚本更新静态 JSON 数据源，并由 Cloudflare Pages 自动构建与全球边缘分发。

## 架构数据流

```text
GitHub Actions (Cron)
  └─> /scraper/ (Python 采集 + schema 严格校验)
        └─> /data/intel_data.json (唯一数据源)
              └─> Git Push 触发 Cloudflare Pages 自动部署
                    └─> /web/ (纯静态前端直接 fetch JSON，零后端 API 成本)
```

## 目录结构

- `/data/schema.json`：数据源与单条情报的严格 JSON Schema（Draft 2020-12）规范
- `/data/intel_data.json`：核心静态数据源（含全局 `updated_at` 与 `items` 情报数组）
- `/scraper/`：Python 自动化采集与数据校验脚本（内置零依赖 `validate_data.py`）
- `/web/`：纯静态前端应用（原生 HTML + Tailwind CDN 极简架构，零构建负担）
- `/.github/workflows/`：GitHub Actions 定时巡检与自动提交流水线

## 本地校验数据

```bash
python scraper/validate_data.py
```

## Cloudflare Pages 部署配置

- **Framework preset**: `None`
- **Build command**: `mkdir -p web/data && cp data/intel_data.json web/data/intel_data.json`
- **Build output directory**: `web`

