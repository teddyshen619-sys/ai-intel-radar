"""OpenRouter 文本模型目录。价格单位为美元 / 百万 token。"""

import json
import math
import re
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from tempfile import NamedTemporaryFile


API = "https://openrouter.ai/api/v1/models"
ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "data" / "models_catalog.json"
STATIC_CATALOG = ROOT / "web" / "data" / CATALOG.name
VENDORS = {
    "openai": "OpenAI", "anthropic": "Anthropic", "google": "Google",
    "deepseek": "DeepSeek", "meta-llama": "Meta Llama", "qwen": "Qwen", "mistralai": "Mistral",
}
OTHER_BRANDS = {
    "baidu": "Baidu", "cohere": "Cohere", "nvidia": "NVIDIA", "inclusionai": "InclusionAI",
    "dots-studio": "Dots Studio", "particle-ai": "Particle AI", "recursive": "Recursive",
    "z-ai": "Z.ai", "x-ai": "xAI", "moonshotai": "Moonshot AI", "tencent": "Tencent",
    "thinkingmachines": "Thinking Machines", "liquid": "Liquid AI",
}
PRICE_FIELDS = {"input_per_m": "输入", "output_per_m": "输出", "cache_read_per_m": "缓存读取"}


def vendor_name(author):
    if author in VENDORS:
        return VENDORS[author]
    words = re.split(r"[-_.]+", author)
    return OTHER_BRANDS.get(author, " ".join(w.upper() if w == "ai" else w.capitalize() for w in words))


def price_per_m(value):
    price = Decimal(str(value)) * 1_000_000
    if not price.is_finite() or price < 0:
        raise ValueError("价格缺失或不适合按 token 比价")
    return float(price)


def build_catalog(rows, now):
    candidates = {}
    for row in rows:  # API 已按热度排序，相同发布时间优先保留热门模型。
        try:
            model_id = row["id"]
            author, slug = model_id.split("/", 1)
            if author == "openrouter" or (":" in slug and not slug.endswith(":free")):
                continue
            if "text" not in row["architecture"]["output_modalities"]:
                continue
            expiry = row.get("expiration_date")
            if expiry and date.fromisoformat(expiry[:10]) < now.date():
                continue
            input_price = price_per_m(row["pricing"]["prompt"])
            output_price = price_per_m(row["pricing"]["completion"])
            free = input_price == output_price == 0
            if not free and author not in VENDORS:
                continue
            context = row["context_length"]
            if type(context) is not int or context <= 0:
                continue
            created = datetime.fromtimestamp(row["created"], timezone.utc)
            cache = row["pricing"].get("input_cache_read")
            limit = (row.get("top_provider") or {}).get("max_completion_tokens")
            model = {
                "id": model_id, "name": row["name"], "vendor": vendor_name(author),
                "created_at": created.isoformat(), "context_length": context,
                "input_per_m": input_price, "output_per_m": output_price, "is_free": free,
                "cache_read_per_m": price_per_m(cache) if cache is not None else None,
                "max_completion_tokens": limit,
                "supports_tools": "tools" in (row.get("supported_parameters") or []),
                "expiration_date": expiry[:10] if expiry else None,
                "description": " ".join(row["description"].split())[:500],
            }
            if model["name"] and model["description"]:
                candidates.setdefault(model_id, model)
        except (KeyError, AttributeError, TypeError, ValueError, InvalidOperation, OverflowError, OSError):
            continue

    models = list(candidates.values())
    selected = [m for m in models if m["is_free"]][:10]
    newest = sorted(models, key=lambda m: m["created_at"], reverse=True)
    for vendor in VENDORS.values():
        selected.extend([m for m in newest if m["vendor"] == vendor and not m["is_free"]][:5])
    # 个别厂商在架型号太少时，用其余符合条件的热门模型补足。
    by_id = {m["id"]: m for m in selected}
    for model in models:
        if len(by_id) >= 45:
            break
        by_id.setdefault(model["id"], model)
    selected = sorted(by_id.values(), key=lambda m: (
        m["vendor"].casefold(), -datetime.fromisoformat(m["created_at"]).timestamp(),
        not m["is_free"], m["id"],
    ))
    catalog = {"updated_at": now.isoformat(), "source_url": API, "models": selected}
    validate_catalog(catalog)
    return catalog


def validate_catalog(catalog):
    if not isinstance(catalog, dict) or catalog.get("source_url") != API:
        raise ValueError("模型目录来源无效")
    def timestamp(value):
        if not isinstance(value, str) or datetime.fromisoformat(value.replace("Z", "+00:00")).tzinfo is None:
            raise ValueError("模型目录时间缺少日期或时区")

    timestamp(catalog.get("updated_at"))
    rows = catalog.get("models")
    if not isinstance(rows, list) or not 30 <= len(rows) <= 50:
        raise ValueError("模型目录应包含 30–50 个模型")
    seen = set()
    for row in rows:
        if not isinstance(row, dict) or any(
            not isinstance(row.get(k), str) or not row[k].strip()
            for k in ("id", "name", "vendor", "description")
        ):
            raise ValueError("模型目录缺少必要文本字段")
        model_id = row["id"]
        if "/" not in model_id or model_id in seen:
            raise ValueError(f"模型 ID 无效或重复：{model_id}")
        seen.add(model_id)
        timestamp(row.get("created_at"))
        prices = [row.get(k) for k in ("input_per_m", "output_per_m")]
        cache = row.get("cache_read_per_m")
        if cache is not None and (type(cache) not in (int, float) or not math.isfinite(cache) or cache < 0):
            raise ValueError(f"{model_id} 缓存读取价格无效")
        limit = row.get("max_completion_tokens")
        if limit is not None and (type(limit) is not int or limit <= 0):
            raise ValueError(f"{model_id} 最大输出长度无效")
        if "supports_tools" in row and type(row["supports_tools"]) is not bool:
            raise ValueError(f"{model_id} 工具调用标志无效")
        if row.get("expiration_date") is not None:
            date.fromisoformat(row["expiration_date"])
        if any(type(p) not in (float, int) or not math.isfinite(p) or p < 0 for p in prices):
            raise ValueError(f"{model_id} 单价无效")
        if row.get("is_free") is not (prices == [0, 0]):
            raise ValueError(f"{model_id} 免费标志与价格不符")
        if type(row.get("context_length")) is not int or row["context_length"] <= 0:
            raise ValueError(f"{model_id} 上下文长度无效")


def write_snapshot(path, data):
    if path.exists() and path.read_bytes() == data:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile(dir=path.parent, delete=False) as tmp:
        temp = Path(tmp.name)
    try:
        temp.write_bytes(data)
        temp.replace(path)
    finally:
        temp.unlink(missing_ok=True)


def catalog_changes(previous, current):
    old = {m["id"]: m for m in previous["models"]} if previous else {}
    today = datetime.fromisoformat(current["updated_at"]).date()
    report = {
        "updated_at": current["updated_at"], "previous_updated_at": previous["updated_at"] if previous else None,
        "source_url": API, "new_free": [], "price_changes": [], "expiring": [],
    }
    for model in current["models"]:
        model_id = model["id"]
        before = old.get(model_id)
        if previous and model["is_free"] and model_id.endswith(":free") and not (before and before["is_free"]):
            report["new_free"].append(model_id)
        if before:
            for key in PRICE_FIELDS:
                a, b = before.get(key), model.get(key)
                if a is None or b is None or a == b:
                    continue
                base, latest = Decimal(str(a)), Decimal(str(b))
                if abs(latest - base) < base * Decimal("0.2"):
                    continue
                percent = round((latest - base) * 100 / base, 2) if base else None
                report["price_changes"].append({
                    "id": model_id, "field": key, "old": a, "new": b,
                    "change_pct": float(percent) if percent is not None else None,
                })
        if model.get("expiration_date"):
            days = (date.fromisoformat(model["expiration_date"]) - today).days
            if 0 <= days <= 30:
                report["expiring"].append({
                    "id": model_id, "expiration_date": model["expiration_date"], "days_remaining": days,
                })
    report["expiring"].sort(key=lambda item: (item["days_remaining"], item["id"]))
    return report


def validate_report(report, catalog):
    if (not isinstance(report, dict) or report.get("updated_at") != catalog["updated_at"]
            or report.get("source_url") != API):
        raise ValueError("异动报告与模型目录快照不匹配")
    if not all(isinstance(report.get(k), list) for k in ("price_changes", "new_free", "expiring")):
        raise ValueError("异动报告缺少事件列表")
    snapshot = {m["id"]: m for m in catalog["models"]}
    for model_id in report["new_free"]:
        if not (model_id in snapshot and model_id.endswith(":free") and snapshot[model_id]["is_free"]):
            raise ValueError("新增免费型号与快照不符")
    if report["previous_updated_at"] is None and (report["new_free"] or report["price_changes"]):
        raise ValueError("首次快照没有可比较的历史价格")
    for p in report["price_changes"]:
        a, b = p["old"], p["new"]
        if p["field"] not in PRICE_FIELDS or snapshot[p["id"]][p["field"]] != b:
            raise ValueError("调价记录与当前报价不符")
        if any(type(n) not in (int, float) or not math.isfinite(n) or n < 0 for n in (a, b)):
            raise ValueError("调价记录的单价无效")
        base, latest = Decimal(str(a)), Decimal(str(b))
        pct = float(round(100 * (latest - base) / base, 2)) if base else None
        if a == b or abs(latest - base) < base / 5 or p["change_pct"] != pct:
            raise ValueError("调价记录的幅度不符")
    if report["expiring"] != catalog_changes(None, catalog)["expiring"]:
        raise ValueError("停服预警与快照日期不符")


def load_previous():
    for path in (CATALOG, STATIC_CATALOG):
        try:
            data = path.read_bytes()
            previous = json.loads(data)
            validate_catalog(previous)
            return previous, data
        except (OSError, ValueError, TypeError):
            continue
    return None, None


def load_report(paths, previous):
    if previous:
        for path in paths:
            try:
                report = json.loads(path.read_bytes())
                validate_report(report, previous)
                return report
            except (OSError, ValueError, KeyError, TypeError):
                continue
    return None


def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode("utf-8")


def market_state(catalog):
    fields = (*PRICE_FIELDS, "is_free", "expiration_date")
    return {m["id"]: tuple(m.get(k) for k in fields) for m in catalog["models"]}


def refresh_catalog(fetch_json, now):
    examined = 0
    note = ""
    previous, previous_data = load_previous()
    paths = [path.with_name("catalog_changes.json") for path in (CATALOG, STATIC_CATALOG)]
    report = load_report(paths, previous)
    try:
        rows = fetch_json(API + "?sort=most-popular")["data"]
        if not isinstance(rows, list):
            raise ValueError("模型接口缺少列表")
        examined = len(rows)
        catalog = build_catalog(rows, now)
        # 同日仅名称、简介或能力元数据变化时，继续展示最近一次真实行情变动。
        same_day = previous and datetime.fromisoformat(previous["updated_at"]).date() == now.date()
        if report and same_day and market_state(catalog) == market_state(previous):
            if catalog["models"] == previous["models"]:
                catalog = previous
            report = dict(report, updated_at=catalog["updated_at"])
        else:
            report = catalog_changes(previous, catalog)
        data = json_bytes(catalog)
    except Exception as exc:  # 保留最近一次校验通过的快照及其原始更新时间。
        if previous is None:
            return examined, 0, f"降级 · {exc}；无可用旧目录", None
        catalog, data = previous, previous_data
        note = f"降级 · {exc}；沿用 {catalog['updated_at']} 的目录"
    if report is not None:
        report_data = json_bytes(report)
        for path in paths:
            write_snapshot(path, report_data)
    for path in (STATIC_CATALOG, CATALOG):
        write_snapshot(path, data)
    return examined, len(catalog["models"]), note or "成功", report
