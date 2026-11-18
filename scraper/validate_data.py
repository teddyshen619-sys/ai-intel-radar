"""严格校验 /data/intel_data.json 是否完全符合 /data/schema.json 规范。

支持零第三方依赖运行（纯 Python 标准库实现全部核心约束校验）；
若运行环境安装了 `jsonschema`，则额外执行 Draft 2020-12 Schema 全量校验。
"""

from __future__ import annotations

import json
import re
import sys
from datetime import date, datetime
from pathlib import Path
from urllib.parse import urlparse

ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT_DIR / "data" / "intel_data.json"
SCHEMA_PATH = ROOT_DIR / "data" / "schema.json"

REQUIRED_ROOT_KEYS = {"updated_at", "items"}
ALLOWED_ROOT_KEYS = {"$schema", "updated_at", "items"}
REQUIRED_ITEM_KEYS = {
    "id",
    "date",
    "type",
    "status",
    "title",
    "value_tag",
    "tldr",
    "details",
    "action_snippet",
    "source_platform",
    "source_url",
}
VALID_TYPES = {"DEAL", "BUG", "HACK"}
VALID_STATUSES = {"ACTIVE", "URGENT", "FIXED"}
ID_PATTERN = re.compile(r"^ai-\d{8}-\d{2,}$")
DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")
ISO_DT_PATTERN = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$"
)


def validate_stdlib(data: object) -> list[str]:
    errors: list[str] = []

    if not isinstance(data, dict):
        return ["根节点必须为 JSON Object"]

    keys = set(data.keys())
    missing_root = REQUIRED_ROOT_KEYS - keys
    extra_root = keys - ALLOWED_ROOT_KEYS
    if missing_root:
        errors.append(f"根节点缺少必填字段: {sorted(missing_root)}")
    if extra_root:
        errors.append(f"根节点包含未定义字段: {sorted(extra_root)}")

    updated_at = data.get("updated_at")
    if not isinstance(updated_at, str) or not ISO_DT_PATTERN.match(updated_at):
        errors.append("updated_at 必须为带时区的 ISO-8601 时间字符串")
    else:
        try:
            datetime.fromisoformat(updated_at.replace("Z", "+00:00"))
        except ValueError as exc:
            errors.append(f"updated_at 不是有效时间戳: {exc}")

    items = data.get("items")
    if not isinstance(items, list):
        errors.append("items 必须为数组")
        return errors

    seen_ids: set[str] = set()
    for idx, item in enumerate(items):
        prefix = f"items[{idx}]"
        if not isinstance(item, dict):
            errors.append(f"{prefix} 必须为 JSON Object")
            continue

        item_keys = set(item.keys())
        missing = REQUIRED_ITEM_KEYS - item_keys
        extra = item_keys - REQUIRED_ITEM_KEYS
        if missing:
            errors.append(f"{prefix} 缺少必填字段: {sorted(missing)}")
        if extra:
            errors.append(f"{prefix} 包含未定义字段: {sorted(extra)}")

        item_id = item.get("id")
        if not isinstance(item_id, str) or not ID_PATTERN.match(item_id):
            errors.append(f"{prefix}.id 格式非法（期望 ai-YYYYMMDD-NN）: {item_id!r}")
        elif item_id in seen_ids:
            errors.append(f"{prefix}.id 重复: {item_id!r}")
        else:
            seen_ids.add(item_id)

        item_date = item.get("date")
        if not isinstance(item_date, str) or not DATE_PATTERN.match(item_date):
            errors.append(f"{prefix}.date 格式非法（期望 YYYY-MM-DD）: {item_date!r}")
        else:
            try:
                date.fromisoformat(item_date)
            except ValueError as exc:
                errors.append(f"{prefix}.date 不是有效日期: {exc}")

        if item.get("type") not in VALID_TYPES:
            errors.append(f"{prefix}.type 枚举非法: {item.get('type')!r}")

        if item.get("status") not in VALID_STATUSES:
            errors.append(f"{prefix}.status 枚举非法: {item.get('status')!r}")

        for field, max_len in (
            ("title", 120),
            ("value_tag", 40),
            ("tldr", 240),
            ("source_platform", 60),
        ):
            val = item.get(field)
            if not isinstance(val, str) or not (1 <= len(val) <= max_len):
                errors.append(
                    f"{prefix}.{field} 必须为 1~{max_len} 字符的非空字符串"
                )

        details = item.get("details")
        if (
            not isinstance(details, list)
            or len(details) < 1
            or not all(isinstance(d, str) and len(d) >= 1 for d in details)
        ):
            errors.append(f"{prefix}.details 必须为至少包含 1 条非空字符串的数组")

        if not isinstance(item.get("action_snippet"), str):
            errors.append(f"{prefix}.action_snippet 必须为字符串（无则为空字符串）")

        source_url = item.get("source_url")
        if not isinstance(source_url, str):
            errors.append(f"{prefix}.source_url 必须为字符串")
        else:
            parsed = urlparse(source_url)
            if parsed.scheme not in {"http", "https"} or not parsed.netloc:
                errors.append(f"{prefix}.source_url 必须为合法 HTTP/HTTPS URL: {source_url!r}")

    return errors


def validate_with_jsonschema(data: object, schema: dict) -> list[str]:
    try:
        from jsonschema import Draft202012Validator
    except ImportError:
        return []

    validator = Draft202012Validator(schema)
    return [
        f"jsonschema({'.'.join(str(p) for p in err.absolute_path) or '<root>'}): {err.message}"
        for err in sorted(validator.iter_errors(data), key=lambda e: list(e.absolute_path))
    ]


def main() -> int:
    if not DATA_PATH.exists():
        print(f"[ERROR] 找不到数据文件: {DATA_PATH}", file=sys.stderr)
        return 1
    if not SCHEMA_PATH.exists():
        print(f"[ERROR] 找不到规范文件: {SCHEMA_PATH}", file=sys.stderr)
        return 1

    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))

    errors = validate_stdlib(data)
    errors.extend(validate_with_jsonschema(data, schema))

    if errors:
        print(f"[FAIL] 数据校验未通过，共发现 {len(errors)} 处问题：", file=sys.stderr)
        for err in errors:
            print(f"  - {err}", file=sys.stderr)
        return 1

    items = data["items"]
    types = {item["type"] for item in items}
    statuses = {item["status"] for item in items}
    print(
        f"[OK] {DATA_PATH.relative_to(ROOT_DIR)} 校验通过："
        f"{len(items)} 条情报 | types={sorted(types)} | statuses={sorted(statuses)}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
