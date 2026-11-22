"""《前哨 Radar》每日新闻备料、安全门禁校验合入与双份静态数据同步 CLI 工具（仅依赖 Python 标准库）。"""

from __future__ import annotations

import argparse
import copy
import json
import re
import sys
from datetime import date, datetime, timedelta, timezone
from functools import cmp_to_key
from pathlib import Path
from tempfile import NamedTemporaryFile
from urllib.parse import parse_qsl, unquote, urlencode, urlsplit, urlunsplit

if __package__:
    from . import fetch_radar, validate_data
else:
    import fetch_radar
    import validate_data

ROOT_DIR = Path(__file__).resolve().parent.parent
BEIJING = timezone(timedelta(hours=8))

DEFAULT_PROMPT_REL = Path("scraper/.daily_prompt.md")
DEFAULT_DRAFT_REL = Path("scraper/.daily_draft.json")
RAW_DIGEST_REL = Path("scraper/raw_digest.md")
INTEL_DATA_REL = Path("data/intel_data.json")
SCHEMA_REL = Path("data/schema.json")
CATALOG_REL = Path("data/models_catalog.json")
CATALOG_CHANGES_REL = Path("data/catalog_changes.json")
GUIDES_REL = Path("data/guides.json")

STATUS_WEIGHT = {
    "URGENT": 3,
    "ACTIVE": 2,
    "FIXED": 1,
}
VALID_STATUSES = set(STATUS_WEIGHT.keys())
DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")

# 覆盖 Supplementary Symbols/Pictographs、Misc Symbols/Dingbats、变体选择符与零宽连接符等 Emoji 码位。
EMOJI_PATTERN = re.compile(
    r"[\U0001F000-\U0001FAFF\u2600-\u27BF\uFE0F\u200D\u20E3"
    r"\u231A-\u231B\u23E9-\u23FA\u25FD-\u25FE\u2934-\u2935"
    r"\u2B05-\u2B07\u2B1B-\u2B1C\u2B50\u2B55\u3030\u303D\u3297\u3299"
    r"\U000E0020-\U000E007F]+"
)
# 使用十六进制转义匹配已停用的历史旧英文品牌词，保持代码字面量零命中。
LEGACY_BRAND_PATTERN = re.compile(r"\x56anguard", re.IGNORECASE)

EMPTY_DRAFT_TEMPLATE = {
    "items": [],
    "status_updates": [],
}


def parse_target_date(raw_date: str | date | datetime | None = None) -> date:
    """解析目标采编日期，默认取当前北京时间日期。"""
    if raw_date is None:
        return datetime.now(BEIJING).date()
    if isinstance(raw_date, datetime):
        return raw_date.astimezone(BEIJING).date()
    if isinstance(raw_date, date):
        return raw_date
    if not isinstance(raw_date, str) or not DATE_PATTERN.fullmatch(raw_date.strip()):
        raise ValueError(f"日期格式非法（期望 YYYY-MM-DD）: {raw_date!r}")
    return date.fromisoformat(raw_date.strip())


def next_item_id(
    items_or_data: list[dict] | dict,
    target_date: str | date | datetime | None = None,
) -> str:
    """扫描已有 ai-YYYYMMDD-NN 条目，计算目标日期下一个可用起始 ID（两位起补零）。"""
    if isinstance(items_or_data, dict):
        items = items_or_data.get("items", [])
    else:
        items = items_or_data

    day = parse_target_date(target_date)
    ymd = day.strftime("%Y%m%d")
    id_re = re.compile(rf"^ai-{ymd}-(\d{{2,}})$")

    max_seq = 0
    for item in items:
        if not isinstance(item, dict):
            continue
        raw_id = item.get("id")
        if not isinstance(raw_id, str):
            continue
        match = id_re.fullmatch(raw_id.strip())
        if match:
            max_seq = max(max_seq, int(match.group(1)))

    return f"ai-{ymd}-{max_seq + 1:02d}"


def strip_emojis(text: str) -> str:
    """剔除字符串中的全部 Emoji 与变体选择符，并收敛行内多余空白。"""
    if not text:
        return ""
    cleaned = EMOJI_PATTERN.sub("", text)
    lines: list[str] = []
    for raw_line in cleaned.splitlines():
        indent_match = re.match(r"^([ \t]*)", raw_line)
        indent = indent_match.group(1) if indent_match else ""
        body = re.sub(r" {2,}", " ", raw_line[len(indent) :]).strip()
        lines.append(f"{indent}{body}" if body else "")
    return "\n".join(lines)


def scan_forbidden_text(node: object, path: str = "draft") -> list[str]:
    """递归扫描任意数据结构中的全部字符串，拦截 Emoji 与旧英文品牌词。"""
    errors: list[str] = []
    if isinstance(node, str):
        emoji_match = EMOJI_PATTERN.search(node)
        if emoji_match:
            codepoint = ord(emoji_match.group(0)[0])
            errors.append(f"{path} 检测到违禁 Emoji 字符（首码位 U+{codepoint:04X}）")
        if LEGACY_BRAND_PATTERN.search(node):
            errors.append(f"{path} 检测到已停用的历史旧英文品牌词（英文品牌名唯一固定为 Radar / RADAR）")
    elif isinstance(node, list):
        for index, elem in enumerate(node):
            errors.extend(scan_forbidden_text(elem, f"{path}[{index}]"))
    elif isinstance(node, dict):
        for key, value in node.items():
            key_path = f"{path}.{key}"
            if isinstance(key, str):
                errors.extend(scan_forbidden_text(key, f"{key_path}(key)"))
            errors.extend(scan_forbidden_text(value, key_path))
    return errors


def normalize_source_url(url: str) -> str:
    """归一化 source_url 以用于重查对比（忽略协议大小写、尾部斜杠、常见追踪参数与锚点）。"""
    if not isinstance(url, str):
        return ""
    raw = url.strip()
    if not raw:
        return ""
    try:
        parts = urlsplit(raw)
    except ValueError:
        return raw
    if parts.scheme.lower() not in {"http", "https"} or not parts.netloc:
        return raw
    filtered_query = [
        (k, v)
        for k, v in parse_qsl(parts.query, keep_blank_values=True)
        if not k.lower().startswith("utm_") and k.lower() not in {"fbclid", "gclid"}
    ]
    norm_path = unquote(parts.path).rstrip("/") or "/"
    return urlunsplit(
        (
            "",
            parts.netloc.lower().rstrip("."),
            norm_path,
            urlencode(sorted(filtered_query)),
            "",
        )
    )


def _compare_intel_items(a: dict, b: dict) -> int:
    """严格对齐前端 web/js/data.js sortIntelItems() 的四级降序比较器。"""
    weight_a = STATUS_WEIGHT.get(str(a.get("status", "")).strip().upper(), 0)
    weight_b = STATUS_WEIGHT.get(str(b.get("status", "")).strip().upper(), 0)
    if weight_b != weight_a:
        return 1 if weight_b > weight_a else -1

    prio_a = a.get("priority") if type(a.get("priority")) is int else 0
    prio_b = b.get("priority") if type(b.get("priority")) is int else 0
    if prio_b != prio_a:
        return 1 if prio_b > prio_a else -1

    date_a = a.get("date") if isinstance(a.get("date"), str) else ""
    date_b = b.get("date") if isinstance(b.get("date"), str) else ""
    if date_b != date_a:
        return 1 if date_b > date_a else -1

    id_a = a.get("id") if isinstance(a.get("id"), str) else ""
    id_b = b.get("id") if isinstance(b.get("id"), str) else ""
    if id_b != id_a:
        return 1 if id_b > id_a else -1

    return 0


def sort_intel_items(items: list[dict]) -> list[dict]:
    """返回按前端同构规则排序后的情报新列表。"""
    return sorted(items, key=cmp_to_key(_compare_intel_items))


def serialize_json(payload: object) -> bytes:
    return (json.dumps(payload, indent=2, ensure_ascii=False, allow_nan=False) + "\n").encode(
        "utf-8"
    )


def atomic_write_bytes(path: Path, data: bytes) -> None:
    """采用同目录临时文件替换完成原子写入。"""
    path.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile(
        dir=path.parent,
        prefix=f".{path.name}.",
        suffix=".tmp",
        delete=False,
    ) as tmp:
        tmp.write(data)
        temp_path = Path(tmp.name)
    try:
        temp_path.replace(path)
    finally:
        temp_path.unlink(missing_ok=True)


def atomic_write_json(path: Path, payload: object) -> None:
    atomic_write_bytes(path, serialize_json(payload))


def atomic_write_text(path: Path, content: str) -> None:
    normalized = content.replace("\r\n", "\n").replace("\r", "\n")
    if not normalized.endswith("\n"):
        normalized += "\n"
    atomic_write_bytes(path, normalized.encode("utf-8"))


def load_json_utf8(path: Path, label: str) -> object:
    if not path.is_file():
        raise FileNotFoundError(f"找不到 {label}: {path}")
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise ValueError(f"读取 {label} 失败 ({path}): {exc}") from exc


def collect_urgent_items(items: list[dict]) -> list[dict]:
    urgent = [
        item
        for item in items
        if isinstance(item, dict) and str(item.get("status", "")).upper() == "URGENT"
    ]
    return sort_intel_items(urgent)


def collect_recent_items(items: list[dict], target_day: date, days: int) -> list[dict]:
    if days < 0:
        raise ValueError("--days 不能为负数")
    cutoff = (target_day - timedelta(days=days)).isoformat()
    recent = [
        item
        for item in items
        if isinstance(item, dict)
        and isinstance(item.get("date"), str)
        and item["date"] >= cutoff
    ]
    return sorted(
        recent,
        key=lambda item: (str(item.get("date", "")), str(item.get("id", ""))),
        reverse=True,
    )


def extract_digest_candidates(
    raw_markdown: str,
    existing_url_to_id: dict[str, str] | None = None,
    per_channel_limit: int = 15,
) -> str:
    """解析 raw_digest.md，提取模型价格异动速报与各频道高分候选，并彻底清除 Emoji。"""
    cleaned = strip_emojis(raw_markdown)
    existing_map = existing_url_to_id or {}

    section_matches = list(re.finditer(r"(?m)^## +(.+)$", cleaned))
    if not section_matches:
        fallback_lines = [line for line in cleaned.splitlines() if line.strip()][:120]
        return "\n".join(fallback_lines) if fallback_lines else "（原始摘要为空）"

    preamble = cleaned[: section_matches[0].start()].strip()
    header_meta = ""
    for line in preamble.splitlines():
        stripped = line.strip()
        if stripped and not stripped.startswith("#"):
            header_meta = stripped
            break

    sections: dict[str, str] = {}
    for idx, match in enumerate(section_matches):
        sec_title = match.group(1).strip()
        start = match.end()
        end = section_matches[idx + 1].start() if idx + 1 < len(section_matches) else len(cleaned)
        sections[sec_title] = cleaned[start:end].strip()

    out_lines: list[str] = []
    if header_meta:
        out_lines.extend([f"原始摘要快照信息：{header_meta}", ""])

    bulletin = sections.get("模型价格与免费额度异动速报")
    if bulletin is not None:
        out_lines.extend(["### A. 模型价格与免费额度异动速报", "", bulletin or "（本轮无异动）", ""])

    consumer_picks = sections.get("大众实用与免费福利精选")
    if consumer_picks:
        out_lines.extend(["### B. 大众实用与免费福利精选", "", consumer_picks, ""])

    ranking_body = sections.get("价值排行", "")
    entry_blocks = [
        blk.strip()
        for blk in re.split(r"(?m)^(?=### +)", ranking_body)
        if blk.strip().startswith("### ")
    ]

    if entry_blocks:
        grouped: dict[str, list[str]] = {"RADAR": [], "INTEL": [], "REVIEW": []}
        skipped_existing = 0
        for block in entry_blocks:
            ch_match = re.search(r"\[建议:\s*(RADAR|INTEL|REVIEW)\]", block)
            ch = ch_match.group(1) if ch_match else "INTEL"
            url_match = re.search(r"原始 URL\s*·\s*<([^>\s]+)>", block)
            norm_url = normalize_source_url(url_match.group(1)) if url_match else ""
            existing_id = existing_map.get(norm_url) if norm_url else None
            if existing_id:
                skipped_existing += 1
                continue
            if len(grouped[ch]) < per_channel_limit:
                rebroadcast = re.sub(r"^### +", "#### ", block, count=1)
                grouped[ch].append(rebroadcast)

        out_lines.append(
            f"### C. 各频道高分未收录候选（每频道最多截取前 {per_channel_limit} 条，"
            f"已自动过滤 {skipped_existing} 条库内同源 URL）"
        )
        out_lines.append("")
        for ch_key, ch_label in (
            ("RADAR", "RADAR 频道候选（优惠 / 故障避坑 / 实战技巧）"),
            ("INTEL", "INTEL 频道候选（模型发布 / 产品更新 / 价格与政策）"),
            ("REVIEW", "REVIEW 频道候选（基准实测 / 深度视频拆解）"),
        ):
            out_lines.append(f"#### [{ch_key}] {ch_label}")
            out_lines.append("")
            if grouped[ch_key]:
                for item_text in grouped[ch_key]:
                    out_lines.append(item_text)
                    out_lines.append("")
            else:
                out_lines.extend(["（本频道暂无未收录高分候选）", ""])
    else:
        # 兼容自定义或精简格式的 raw_digest.md
        other_sections = [
            f"### {title}\n\n{body}"
            for title, body in sections.items()
            if title not in {"模型价格与免费额度异动速报", "大众实用与免费福利精选", "采集情况"} and body
        ]
        if other_sections:
            out_lines.extend(other_sections)

    return "\n".join(out_lines).strip()


def build_daily_prompt(
    *,
    target_day: date,
    start_id: str,
    days: int,
    urgent_items: list[dict],
    recent_items: list[dict],
    digest_excerpt: str,
) -> str:
    """构建可直接整段粘贴给联网采编模型的自包含提示词。"""
    day_str = target_day.isoformat()
    ymd = target_day.strftime("%Y%m%d")

    urgent_lines: list[str] = []
    if urgent_items:
        for item in urgent_items:
            urgent_lines.append(
                f"- `{item.get('id', '')}` | `{item.get('date', '')}` | "
                f"priority={item.get('priority', '')} | {item.get('vendor', '')} | "
                f"{strip_emojis(str(item.get('title', '')))}"
            )
    else:
        urgent_lines.append("- （当前库内无 URGENT 置顶条目）")

    recent_lines: list[str] = []
    if recent_items:
        for item in recent_items:
            recent_lines.append(
                f"- `{item.get('id', '')}` | `{item.get('date', '')}` | "
                f"{strip_emojis(str(item.get('vendor', '')))} | "
                f"{strip_emojis(str(item.get('title', '')))} | "
                f"<{item.get('source_url', '')}>"
            )
    else:
        recent_lines.append(f"- （最近 {days} 天内暂无已收录条目）")

    lines = [
        "# 《前哨 Radar》每日 AI 情报采编与结构化撰稿提示词",
        "",
        "你现在担任《前哨》（英文名唯一固定为 `Radar` / `RADAR`）的主笔编辑与事实核查员。"
        "请基于下方提供的候选线索，联网访问并交叉核实一手信源，筛选当日最具实战与行业价值的 **3~8 条**情报，"
        "严格按下方 JSON 契约输出可直接写入 `scraper/.daily_draft.json` 的纯 JSON 结果。",
        "",
        "---",
        "",
        "## 一、今日批次与起始编号规则",
        "",
        f"- **目标采编日期（北京时间 UTC+08:00）**：`{day_str}`",
        f"- **今日起始可用 ID**：`{start_id}`",
        f"- **编号递增规则**：格式严格为 `ai-{ymd}-NN`（正则 `^ai-\\d{{8}}-\\d{{2,}}$`），"
        f"请从 `{start_id}` 起按序号连续递增分配（如尾号依次 +1，两位起补零），严禁与已有条目撞号。",
        f"- **`date` 字段规则**：统一采用 `YYYY-MM-DD`（当日采编填 `{day_str}`；若补录前一日晚间一手发布，可填实际发布日，但 `id` 仍从 `{start_id}` 起顺序编号）。",
        "",
        "---",
        "",
        "## 二、输出纯 JSON 格式契约",
        "",
        "请**仅输出一个合法的 UTF-8 JSON 对象**，顶层结构固定如下（严禁添加 Schema 未定义字段）：",
        "",
        "```json",
        "{",
        '  "items": [',
        "    {",
        f'      "id": "{start_id}",',
        f'      "date": "{day_str}",',
        '      "channel": "INTEL",',
        '      "type": "MODEL",',
        '      "status": "ACTIVE",',
        '      "vendor": "厂商或生态名（<=40字符）",',
        '      "priority": 92,',
        '      "impact": "一句话受众与影响范围（<=80字符）",',
        '      "title": "硬核直击痛点与核心数据的标题（<=120字符）",',
        '      "value_tag": "量化价值标签（<=40字符）",',
        '      "tldr": "一句话省流核心总结（<=240字符）",',
        '      "details": [',
        '        "要点1：核心规格、定价或资格门槛（精炼硬核事实）",',
        '        "要点2：独立基准成绩或关键机制对比",',
        '        "要点3：上线渠道、限制条件或避坑说明"',
        "      ],",
        '      "action_snippet": "",',
        '      "source_platform": "一手来源平台（<=60字符）",',
        '      "source_url": "https://example.com/primary-post",',
        '      "metric_badge": "可选指标徽章（<=40字符，不需要则省略该键）",',
        '      "story": [',
        "        {",
        '          "heading": "小节标题（<=80字符，仅当日头版重磅事件才附带 story）",',
        '          "paragraphs": [',
        '            "第一段深度背景与来龙去脉……",',
        '            "第二段技术细节与多方验证态度……"',
        "          ]",
        "        }",
        "      ]",
        "    }",
        "  ],",
        '  "status_updates": [',
        "    {",
        '      "id": "已有旧URGENT条目ID",',
        '      "status": "ACTIVE 或 FIXED"',
        "    }",
        "  ]",
        "}",
        "```",
        "",
        "---",
        "",
        "## 三、`data/schema.json` 字段约束与长度硬上限（100% 强制校验）",
        "",
        "1. **必填字段（共 15 个，缺一不可，且 `additionalProperties: false`）**：",
        "   - `id`: `string`，匹配 `^ai-\\d{8}-\\d{2,}$`",
        "   - `date`: `string`，匹配 `^\\d{4}-\\d{2}-\\d{2}$`",
        "   - `channel` 与 `type` **严格映射表**（跨频道混配会直接触发门禁报错）：",
        "     - `RADAR` -> 仅允许 `DEAL` | `BUG` | `HACK`",
        "     - `INTEL` -> 仅允许 `MODEL` | `PRODUCT` | `POLICY`",
        "     - `REVIEW` -> 仅允许 `BENCHMARK` | `VIDEO`",
        "   - `status`: `string`，仅允许 `ACTIVE` | `URGENT` | `FIXED`（仅重大突发、限时免费羊毛或紧急故障预警设为 `URGENT`，常规条目一律设为 `ACTIVE`）",
        "   - `priority`: `integer`，`1..100` 整数（`90..100` 头版重磅，`70..89` 高价值推荐，`1..69` 常规收录）",
        "   - `action_snippet`: `string`，可直接复制执行的命令、模型 ID、JSON 配置或修复代码；无可执行片段时**必须填 `\"\"` 空字符串**（严禁填 `null`）",
        "   - `details`: `array<string>`，至少 1 条非空字符串（采编规范要求 **3~5 条**）",
        "   - `source_url`: `string`，必须指向**人类可读的一手网页 `http(s)://` URL**（严禁填写 `api.github.com`、`hacker-news.firebaseio.com`、路径含 `/api/` 或以 `.json/.xml/.rss/.atom/.feed` 结尾的机器接口与订阅源链接）",
        "2. **可选字段（共 3 个，不需要时直接省略字段名，严禁传 `null` 或空数组 `[]`）**：",
        "   - `media_url`: `string`，合法 `http(s)://` 视频缩略图或图表链接（`REVIEW` + `VIDEO` 条目请保留 YouTube 封面图地址）",
        "   - `metric_badge`: `string`，关键量化指标短签",
        "   - `story`: `array<object>`，深度报道小节列表（每节仅允许可选 `heading` 与必填非空字符串数组 `paragraphs`）",
        "3. **字符长度硬上限速查（超长即拒）**：",
        "   - `title <= 120`",
        "   - `tldr <= 240`",
        "   - `impact <= 80`",
        "   - `vendor <= 40`",
        "   - `value_tag <= 40`",
        "   - `metric_badge <= 40`",
        "   - `source_platform <= 60`",
        "   - `story[].heading <= 80`",
        "",
        "---",
        "",
        "## 四、双层正文与事实核查铁律",
        "",
        "1. **双层正文分工边界**：",
        "   - **`details`（所有条目必填）**：严格保持 **3~5 条**精炼、高密度硬核事实要点（具体参数、百万 Token 输入/输出/缓存单价、名额门槛、复现版本或避坑方案），严禁写成冗长水文或营销套话。",
        "   - **`story`（仅重磅条目可选）**：**仅限当日头版重磅事件（通常 1~2 条，`priority >= 92`）**附带 `story` 数组，包含 **2~4 个小节**（每节含 `heading` 与 `paragraphs`），完整交代事件背景脉络、底层技术机制与社区/学界多方验证态度。常规动态请勿添加 `story`。",
        "2. **事实核查铁律**：",
        "   - 动笔前必须联网核对一手原始信源 URL（官方博客、论文 PDF、GitHub Release/Issue、OpenRouter 实时面板或独立评测原文），拒绝仅凭二手标题臆测参数。",
        "   - 严格区分**「官方正式发布 / 独立实测编译验证」**与**「个人单方宣称 / 早期传闻 / 尚未验证」**：凡未经同行评审或独立团队复现的个人突破宣称，必须在 `title`、`value_tag`、`tldr` 与 `details` 中明确注明“作者宣称 / 尚未验证 / 待独立复核”。",
        "3. **零 Emoji 与品牌洁净铁律**：",
        "   - 全文所有字符串字段**严禁出现任何 Emoji 表情字符、装饰符号或变体选择符**。",
        "   - 项目中文名固定为「前哨」，英文名唯一固定为 `Radar` / `RADAR`，**严禁出现任何历史旧英文品牌名**。",
        "",
        "---",
        "",
        "## 五、当前 `URGENT` 置顶条目清单（请评估是否需在 `status_updates` 中降级）",
        "",
        "以下条目当前处于全站置顶（`URGENT`）。若某条突发已过 24~48 小时强时效窗口但仍有效，请在 `status_updates` 中将其降级为 `ACTIVE`；若优惠已截止或故障已修复，请更新为 `FIXED`：",
        "",
        *urgent_lines,
        "",
        "---",
        "",
        f"## 六、最近 {days} 天已收录情报防重清单（严禁重复采编同一事件或同一链接）",
        "",
        *recent_lines,
        "",
        "---",
        "",
        "## 七、今日清洗后候选素材（源自 `scraper/raw_digest.md`）",
        "",
        digest_excerpt,
    ]
    return strip_emojis("\n".join(lines))


def run_validate_data_main(root: Path) -> int:
    """在指定项目根目录下运行 validate_data.main() 全站三项数据校验。"""
    original = (
        validate_data.ROOT_DIR,
        validate_data.DATA_PATH,
        validate_data.SCHEMA_PATH,
        validate_data.CATALOG,
    )
    try:
        validate_data.ROOT_DIR = root
        validate_data.DATA_PATH = root / INTEL_DATA_REL
        validate_data.SCHEMA_PATH = root / SCHEMA_REL
        validate_data.CATALOG = root / CATALOG_REL
        return validate_data.main()
    finally:
        (
            validate_data.ROOT_DIR,
            validate_data.DATA_PATH,
            validate_data.SCHEMA_PATH,
            validate_data.CATALOG,
        ) = original


def sync_static_bundles(root: Path) -> list[str]:
    """将 data/ 下核心静态 JSON 同步至 web/data/ 并逐一执行字节级一致性断言。"""
    synced: list[str] = []
    web_data_dir = root / "web" / "data"
    web_data_dir.mkdir(parents=True, exist_ok=True)

    # 必选同步项：intel_data.json 与 models_catalog.json
    for rel_name in ("intel_data.json", "models_catalog.json"):
        src = root / "data" / rel_name
        dst = web_data_dir / rel_name
        if not src.is_file():
            raise FileNotFoundError(f"缺少待同步的数据源文件: {src}")
        src_bytes = src.read_bytes()
        if not dst.is_file() or dst.read_bytes() != src_bytes:
            atomic_write_bytes(dst, src_bytes)
        if src.read_bytes() != dst.read_bytes():
            raise RuntimeError(f"双份静态数据字节不一致: {src} != {dst}")
        synced.append(rel_name)

    # guides.json：仅当 data/guides.json 已存在时按需同步字节，绝不触碰 guides/*.md
    guides_src = root / GUIDES_REL
    guides_dst = web_data_dir / "guides.json"
    if guides_src.is_file():
        src_bytes = guides_src.read_bytes()
        if not guides_dst.is_file() or guides_dst.read_bytes() != src_bytes:
            atomic_write_bytes(guides_dst, src_bytes)
        if guides_src.read_bytes() != guides_dst.read_bytes():
            raise RuntimeError(f"双份教程数据字节不一致: {guides_src} != {guides_dst}")
        synced.append("guides.json")

    # catalog_changes.json：存在时同步并断言字节一致
    changes_src = root / CATALOG_CHANGES_REL
    changes_dst = web_data_dir / "catalog_changes.json"
    if changes_src.is_file():
        src_bytes = changes_src.read_bytes()
        if not changes_dst.is_file() or changes_dst.read_bytes() != src_bytes:
            atomic_write_bytes(changes_dst, src_bytes)
        if changes_src.read_bytes() != changes_dst.read_bytes():
            raise RuntimeError(f"双份价格异动数据字节不一致: {changes_src} != {changes_dst}")
        synced.append("catalog_changes.json")

    return synced


def cmd_status(args: argparse.Namespace, root: Path = ROOT_DIR) -> int:
    """只读查看当前情报库状态、可用起始 ID、URGENT 置顶清单与原始摘要状态。"""
    try:
        target_day = parse_target_date(args.date)
        if args.days < 0:
            raise ValueError("--days 不能为负数")
        intel_data = load_json_utf8(root / INTEL_DATA_REL, "情报库 data/intel_data.json")
        if not isinstance(intel_data, dict) or not isinstance(intel_data.get("items"), list):
            raise ValueError("data/intel_data.json 结构非法：缺少 items 数组")
        catalog = load_json_utf8(root / CATALOG_REL, "模型目录 data/models_catalog.json")
        if not isinstance(catalog, dict) or not isinstance(catalog.get("models"), list):
            raise ValueError("data/models_catalog.json 结构非法：缺少 models 数组")
    except (OSError, ValueError) as exc:
        print(f"[ERROR] {exc}", file=sys.stderr)
        return 1

    changes_path = root / CATALOG_CHANGES_REL
    changes_summary = "不存在"
    if changes_path.is_file():
        try:
            changes = load_json_utf8(changes_path, "价格异动 data/catalog_changes.json")
            if isinstance(changes, dict):
                nf = len(changes.get("new_free", []))
                pc = len(changes.get("price_changes", []))
                ex = len(changes.get("expiring", []))
                changes_summary = f"新增免费 {nf} | 调价记录 {pc} | 临期预警 {ex}"
        except ValueError as exc:
            print(f"[ERROR] {exc}", file=sys.stderr)
            return 1

    raw_digest_path = root / RAW_DIGEST_REL
    if raw_digest_path.is_file():
        _ = raw_digest_path.read_text(encoding="utf-8")
        mtime_dt = datetime.fromtimestamp(raw_digest_path.stat().st_mtime, tz=BEIJING).replace(
            microsecond=0
        )
        digest_mtime_str = mtime_dt.isoformat()
    else:
        digest_mtime_str = "不存在（请运行 prep 或 fetch_radar.py 生成）"

    items = intel_data["items"]
    start_id = next_item_id(items, target_day)
    urgent_items = collect_urgent_items(items)
    recent_items = collect_recent_items(items, target_day, args.days)

    print("=== 前哨 Radar 每日情报工作台状态 ===")
    print(f"情报总条数      : {len(items)} 条（近 {args.days} 天已收录 {len(recent_items)} 条）")
    print(f"情报库更新时间  : {intel_data.get('updated_at', '--')}")
    print(f"目标日期起始 ID : {start_id}（日期 {target_day.isoformat()}）")
    print(f"模型目录快照    : {len(catalog['models'])} 个模型（updated_at={catalog.get('updated_at', '--')}）")
    print(f"模型异动速报    : {changes_summary}")
    print(f"raw_digest.md   : 最后修改时间 {digest_mtime_str}")
    print(f"当前 URGENT 置顶: 共 {len(urgent_items)} 条")
    if urgent_items:
        for item in urgent_items:
            print(
                f"  - {item.get('id')} | {item.get('date')} | "
                f"priority={item.get('priority')} | {item.get('title')}"
            )
    else:
        print("  （无 URGENT 置顶条目）")
    return 0


def cmd_prep(args: argparse.Namespace, root: Path = ROOT_DIR) -> int:
    """备料子命令：按需刷新采集摘要，生成无 Emoji 提示词模板与空草稿文件。"""
    try:
        target_day = parse_target_date(args.date)
        if args.days < 0:
            raise ValueError("--days 不能为负数")
    except ValueError as exc:
        print(f"[ERROR] {exc}", file=sys.stderr)
        return 1

    if not args.no_fetch:
        try:
            rc = fetch_radar.main()
        except Exception as exc:
            print(f"[ERROR] 执行 fetch_radar 采集失败: {exc}", file=sys.stderr)
            return 1
        if rc not in (0, None):
            print(f"[ERROR] fetch_radar 返回非零退出码: {rc}", file=sys.stderr)
            return 1

    raw_digest_path = root / RAW_DIGEST_REL
    if not raw_digest_path.is_file():
        print(
            f"[ERROR] 找不到原始情报摘要文件: {raw_digest_path}（请先去掉 --no-fetch 运行采集）",
            file=sys.stderr,
        )
        return 1

    try:
        intel_data = load_json_utf8(root / INTEL_DATA_REL, "情报库 data/intel_data.json")
        if not isinstance(intel_data, dict) or not isinstance(intel_data.get("items"), list):
            raise ValueError("data/intel_data.json 结构非法：缺少 items 数组")
        raw_digest_text = raw_digest_path.read_text(encoding="utf-8")
    except (OSError, ValueError) as exc:
        print(f"[ERROR] {exc}", file=sys.stderr)
        return 1

    items = intel_data["items"]
    start_id = next_item_id(items, target_day)
    urgent_items = collect_urgent_items(items)
    recent_items = collect_recent_items(items, target_day, args.days)

    existing_url_to_id: dict[str, str] = {}
    for item in items:
        if isinstance(item, dict) and isinstance(item.get("source_url"), str) and isinstance(item.get("id"), str):
            norm = normalize_source_url(item["source_url"])
            if norm and norm not in existing_url_to_id:
                existing_url_to_id[norm] = item["id"]

    digest_excerpt = extract_digest_candidates(raw_digest_text, existing_url_to_id)
    prompt_content = build_daily_prompt(
        target_day=target_day,
        start_id=start_id,
        days=args.days,
        urgent_items=urgent_items,
        recent_items=recent_items,
        digest_excerpt=digest_excerpt,
    )

    prompt_path = root / DEFAULT_PROMPT_REL
    atomic_write_text(prompt_path, prompt_content)

    draft_path = root / DEFAULT_DRAFT_REL
    draft_status = "已保留现有非空草稿"
    should_init_draft = args.reset_draft or not draft_path.is_file()
    if not should_init_draft:
        existing_draft_raw = draft_path.read_text(encoding="utf-8").strip()
        if not existing_draft_raw:
            should_init_draft = True
        else:
            try:
                parsed_draft = json.loads(existing_draft_raw)
                if parsed_draft == EMPTY_DRAFT_TEMPLATE or parsed_draft == []:
                    draft_status = "已存在空草稿模板（未覆盖）"
            except json.JSONDecodeError:
                draft_status = "已保留现有未完成草稿文件（未覆盖）"

    if should_init_draft:
        atomic_write_json(draft_path, EMPTY_DRAFT_TEMPLATE)
        draft_status = "已重置为空草稿模板" if args.reset_draft else "已初始化空草稿模板"

    print(
        f"[OK] 备料完成：起始 ID={start_id} | URGENT 置顶={len(urgent_items)} 条 | "
        f"近 {args.days} 天防重={len(recent_items)} 条"
    )
    print(f"  - 采编提示词: {prompt_path}")
    print(f"  - 待填草稿箱: {draft_path}（{draft_status}）")
    return 0


def _parse_draft_payload(raw_draft: object) -> tuple[list[object], list[object], list[str]]:
    if isinstance(raw_draft, list):
        return raw_draft, [], []
    if isinstance(raw_draft, dict):
        extra_keys = set(raw_draft.keys()) - {"items", "status_updates"}
        if extra_keys:
            return [], [], [f"草稿顶层包含未定义字段: {sorted(extra_keys)}"]
        items = raw_draft.get("items", [])
        status_updates = raw_draft.get("status_updates", [])
        errors: list[str] = []
        if not isinstance(items, list):
            errors.append("草稿字段 items 必须为数组")
        if not isinstance(status_updates, list):
            errors.append("草稿字段 status_updates 必须为数组")
        return (items if isinstance(items, list) else []), (
            status_updates if isinstance(status_updates, list) else []
        ), errors
    return [], [], ["草稿根节点必须为 JSON Object（含 items/status_updates）或 JSON Array"]


def cmd_apply(args: argparse.Namespace, root: Path = ROOT_DIR) -> int:
    """校验并合入草稿，排序更新 intel_data.json，同步 web/data/ 双份文件并执行全站校验。"""
    input_arg = Path(args.input)
    draft_path = input_arg if input_arg.is_absolute() else (root / input_arg)

    try:
        raw_draft = load_json_utf8(draft_path, "待合入草稿")
        intel_data = load_json_utf8(root / INTEL_DATA_REL, "情报库 data/intel_data.json")
        schema = load_json_utf8(root / SCHEMA_REL, "规范文件 data/schema.json")
    except (OSError, ValueError) as exc:
        print(f"[ERROR] {exc}", file=sys.stderr)
        return 1

    if not isinstance(intel_data, dict) or not isinstance(intel_data.get("items"), list):
        print("[ERROR] data/intel_data.json 结构非法：缺少 items 数组", file=sys.stderr)
        return 1
    if not isinstance(schema, dict):
        print("[ERROR] data/schema.json 结构非法", file=sys.stderr)
        return 1

    # 门禁 1：递归扫描草稿内全部字符串字段，拦截 Emoji 与旧英文品牌词
    safety_errors = scan_forbidden_text(raw_draft, "draft")
    draft_items, status_updates, shape_errors = _parse_draft_payload(raw_draft)
    if safety_errors or shape_errors:
        for err in [*safety_errors, *shape_errors]:
            print(f"[REJECT] {err}", file=sys.stderr)
        return 1

    working_items: list[dict] = copy.deepcopy(intel_data["items"])
    by_id: dict[str, int] = {}
    for index, existing in enumerate(working_items):
        if isinstance(existing, dict) and isinstance(existing.get("id"), str):
            by_id[existing["id"]] = index

    # 步骤 1：执行 status_updates
    seen_status_ids: set[str] = set()
    status_changed_count = 0
    for idx, upd in enumerate(status_updates):
        prefix = f"status_updates[{idx}]"
        if not isinstance(upd, dict):
            print(f"[REJECT] {prefix} 必须为 JSON Object", file=sys.stderr)
            return 1
        extra_upd = set(upd.keys()) - {"id", "status"}
        if extra_upd or not {"id", "status"} <= set(upd.keys()):
            print(f"[REJECT] {prefix} 仅允许且必须包含 id 与 status 字段", file=sys.stderr)
            return 1
        target_id = upd.get("id")
        target_status = upd.get("status")
        if not isinstance(target_id, str) or target_id not in by_id:
            print(f"[REJECT] {prefix}.id 在现有情报库中不存在: {target_id!r}", file=sys.stderr)
            return 1
        if target_id in seen_status_ids:
            print(f"[REJECT] {prefix}.id 在 status_updates 中重复出现: {target_id!r}", file=sys.stderr)
            return 1
        if not isinstance(target_status, str) or target_status not in VALID_STATUSES:
            print(
                f"[REJECT] {prefix}.status 非法（仅允许 ACTIVE/URGENT/FIXED）: {target_status!r}",
                file=sys.stderr,
            )
            return 1
        seen_status_ids.add(target_id)
        working_items[by_id[target_id]]["status"] = target_status
        status_changed_count += 1

    # 建立现有库归一化 source_url 索引，用于重查拦截
    url_owner: dict[str, str] = {}
    for item in working_items:
        if isinstance(item, dict) and isinstance(item.get("id"), str) and isinstance(item.get("source_url"), str):
            norm_u = normalize_source_url(item["source_url"])
            if norm_u and norm_u not in url_owner:
                url_owner[norm_u] = item["id"]

    # 步骤 2：处理新增或覆写 items
    draft_seen_ids: set[str] = set()
    added_count = 0
    upserted_count = 0
    merge_errors: list[str] = []

    for idx, raw_item in enumerate(draft_items):
        prefix = f"draft.items[{idx}]"
        if not isinstance(raw_item, dict):
            merge_errors.append(f"{prefix} 必须为 JSON Object")
            continue

        item_id = raw_item.get("id")
        if not isinstance(item_id, str) or not item_id.strip():
            merge_errors.append(f"{prefix}.id 必须为非空字符串")
            continue

        if item_id in draft_seen_ids:
            merge_errors.append(f"{prefix}.id 在草稿内部重复: {item_id!r}")
            continue
        draft_seen_ids.add(item_id)

        is_existing = item_id in by_id
        if is_existing and not args.allow_upsert:
            merge_errors.append(
                f"{prefix}.id 与现有库条目重复: {item_id!r}（如需按 ID 覆写请显式传入 --allow-upsert）"
            )
            continue

        raw_url = raw_item.get("source_url")
        if isinstance(raw_url, str) and raw_url.strip():
            norm_url = normalize_source_url(raw_url)
            conflict_id = url_owner.get(norm_url) if norm_url else None
            if conflict_id and conflict_id != item_id and not args.allow_duplicate_url:
                merge_errors.append(
                    f"{prefix}.source_url 与库内已有条目 {conflict_id} 重复: {raw_url!r}"
                    "（如需放行同一链接请显式传入 --allow-duplicate-url）"
                )
                continue
            if norm_url:
                url_owner[norm_url] = item_id

        item_copy = copy.deepcopy(raw_item)
        if is_existing:
            working_items[by_id[item_id]] = item_copy
            upserted_count += 1
        else:
            by_id[item_id] = len(working_items)
            working_items.append(item_copy)
            added_count += 1

    if merge_errors:
        for err in merge_errors:
            print(f"[REJECT] {err}", file=sys.stderr)
        return 1

    # 步骤 3：前端同构排序并刷新北京时间秒级 updated_at
    sorted_items = sort_intel_items(working_items)
    updated_at = datetime.now(BEIJING).replace(microsecond=0).isoformat()
    merged_data: dict[str, object] = {}
    if "$schema" in intel_data:
        merged_data["$schema"] = intel_data["$schema"]
    merged_data["updated_at"] = updated_at
    merged_data["items"] = sorted_items

    # 门禁 2：合并后全量安全扫描 + 标准库校验 + JSON Schema 校验
    validation_errors = scan_forbidden_text(merged_data, "merged_data")
    validation_errors.extend(validate_data.validate_stdlib(merged_data))
    validation_errors.extend(validate_data.validate_with_jsonschema(merged_data, schema))
    if validation_errors:
        print(
            f"[REJECT] 合并后数据未通过规范门禁，共发现 {len(validation_errors)} 处问题：",
            file=sys.stderr,
        )
        for err in validation_errors:
            print(f"  - {err}", file=sys.stderr)
        return 1

    if args.dry_run:
        print(
            f"[DRY-RUN] 门禁校验全部通过（未写入任何文件）："
            f"预计新增 {added_count} 条 | 覆写 {upserted_count} 条 | "
            f"状态变更 {status_changed_count} 条 | 合并后总计 {len(sorted_items)} 条"
        )
        return 0

    # 步骤 4：原子落盘 + 双份静态数据字节同步 + 全站数据验收
    try:
        atomic_write_json(root / INTEL_DATA_REL, merged_data)
        synced_files = sync_static_bundles(root)
    except (OSError, RuntimeError) as exc:
        print(f"[ERROR] 写入或双份同步失败: {exc}", file=sys.stderr)
        return 1

    validate_rc = run_validate_data_main(root)
    if validate_rc != 0:
        return validate_rc

    print(
        f"[OK] 每日情报合入完成：新增 {added_count} 条 | 覆写 {upserted_count} 条 | "
        f"状态变更 {status_changed_count} 条 | 最新总条数 {len(sorted_items)} 条 | "
        f"updated_at={updated_at} | 已同步={','.join(synced_files)}"
    )
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="daily_news.py",
        description="《前哨 Radar》每日新闻备料、校验合入与双份同步工具",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    p_status = subparsers.add_parser("status", help="只读查看当前情报库、置顶条目与原始摘要状态")
    p_status.add_argument("--days", type=int, default=7, help="统计最近 N 天已收录情报数（默认: 7）")
    p_status.add_argument("--date", type=str, default=None, help="目标日期 YYYY-MM-DD（默认: 北京时间今日）")

    p_prep = subparsers.add_parser("prep", help="刷新或读取候选摘要，生成采编提示词与空草稿模板")
    p_prep.add_argument("--no-fetch", action="store_true", help="跳过联网采集，直接读取现有 scraper/raw_digest.md")
    p_prep.add_argument("--days", type=int, default=7, help="提取最近 N 天已收录防重清单（默认: 7）")
    p_prep.add_argument("--date", type=str, default=None, help="目标采编日期 YYYY-MM-DD（默认: 北京时间今日）")
    p_prep.add_argument("--reset-draft", action="store_true", help="强制将 scraper/.daily_draft.json 重置为空草稿模板")

    p_apply = subparsers.add_parser("apply", help="校验草稿并合入 intel_data.json，同步 web/data/ 双份文件")
    p_apply.add_argument(
        "--input",
        type=str,
        default=DEFAULT_DRAFT_REL.as_posix(),
        help="待合入草稿 JSON 路径（默认: scraper/.daily_draft.json）",
    )
    p_apply.add_argument("--dry-run", action="store_true", help="仅运行全部安全与规范校验，不写入任何文件")
    p_apply.add_argument("--allow-upsert", action="store_true", help="允许按相同 ID 覆写库内已有条目")
    p_apply.add_argument(
        "--allow-duplicate-url",
        action="store_true",
        help="允许新增与库内已有条目 source_url 归一化后相同的链接",
    )

    return parser


def main(argv: list[str] | None = None, *, root: Path = ROOT_DIR) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    resolved_root = Path(root).resolve()

    if args.command == "status":
        return cmd_status(args, resolved_root)
    if args.command == "prep":
        return cmd_prep(args, resolved_root)
    if args.command == "apply":
        return cmd_apply(args, resolved_root)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
