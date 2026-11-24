"""从人工编辑的 UTF-8 Markdown 生成确定性的静态课程 JSON。"""

import json
import re
import sys
from datetime import date
from pathlib import Path

if __package__:
    from .models_catalog import write_snapshot
else:
    from models_catalog import write_snapshot


ROOT = Path(__file__).resolve().parents[1]
FIELDS = ("id", "order", "track", "title", "summary", "updated_at", "author_note", "related_tags")
OPTIONAL_FIELDS = ("status",)
VALID_STATUSES = ("published", "revising")
REVISING_SUFFIXES = ("（改进中）", "(改进中)")
REVISING_PLACEHOLDER_STEPS = [
    {
        "number": 1,
        "title": "课程内容改进中",
        "markdown": "本课教程正在重新梳理与验证最新可用方案，更新完成后将恢复开放。",
        "code_blocks": [],
        "risk_notes": [],
    }
]
FENCE = re.compile(r" {0,3}(`{3,}|~{3,})([^\r\n]*)")
HEADING = re.compile(r" {0,3}##(?:[ \t]+(.*))?")
RISK = re.compile(r" {0,3}>[ \t]*风险提示[：:][ \t]*(.*)")


class GuideError(ValueError):
    def __init__(self, path, line, message):
        super().__init__(f"{path} 第 {line} 行：{message}")


def metadata(path, lines):
    if not lines or lines[0].rstrip("\r\n") != "---":
        raise GuideError(path, 1, "第一行须为 ---，用于开始元数据头")
    values, locations = {}, {}
    for i, raw in enumerate(lines[1:], 2):
        line = raw.rstrip("\r\n")
        if line == "---":
            missing = [key for key in FIELDS if key not in values]
            if missing:
                raise GuideError(path, i, "缺少必填字段 " + ", ".join(missing))
            values.setdefault("status", "published")
            return values, locations, i
        if not line.strip():
            continue
        key, colon, value = line.partition(":")
        if not colon or (key not in FIELDS and key not in OPTIONAL_FIELDS):
            raise GuideError(path, i, f"无法识别字段 {key!r}，请使用规定的英文键和半角冒号")
        if key in values:
            raise GuideError(path, i, f"{key} 重复，首次位于第 {locations[key]} 行")
        value = value.strip()
        if not value and key in {"id", "order", "title", "updated_at"}:
            raise GuideError(path, i, f"{key} 不能为空")
        if key == "status":
            value = value or "published"
            if value not in VALID_STATUSES:
                raise GuideError(path, i, "status 只能为 published 或 revising")
        if key == "id" and not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", value):
            raise GuideError(path, i, "id 只能使用小写字母、数字和分隔用的短横线")
        if key == "order":
            if not re.fullmatch(r"[1-9][0-9]*", value):
                raise GuideError(path, i, "order 应为正整数，如 1")
            try:
                value = int(value)
            except ValueError:
                raise GuideError(path, i, "order 超出可解析的整数范围") from None
        if key == "updated_at":
            try:
                if date.fromisoformat(value).isoformat() != value:
                    raise ValueError
            except ValueError:
                raise GuideError(path, i, "updated_at 应为有效的 YYYY-MM-DD 日期") from None
        if key == "related_tags":
            value = [tag.strip() for tag in re.split("[,，]", value)] if value else []
            if not all(value) or len(value) != len(set(value)):
                raise GuideError(path, i, "标签间用逗号分隔，不能留空或重复")
        values[key], locations[key] = value, i
    raise GuideError(path, len(lines) + 1, "元数据头缺少结束行 ---")


def sections(path, lines, start, *, editor=False):
    steps = []
    step = None
    marker = ""
    risk_continues = False
    risk_lines = set()

    def finish_step(end):
        step["markdown"] = "".join(lines[step_start:end])
        if not step["markdown"].strip():
            step["markdown"] = ""
        if editor:
            body = "".join(lines[n] for n in range(step_start, end) if n not in risk_lines)
            step["editor_markdown"] = body.strip("\r\n") if body.strip() else ""
    for i in range(start, len(lines)):
        line = lines[i].rstrip("\r\n")
        if marker:
            if re.fullmatch(r" {0,3}" + re.escape(marker[0]) + "{%d,}" % len(marker) + r"[ \t]*", line):
                step["code_blocks"].append({"language": language, "code": "".join(lines[block_start:i])})
                marker = ""
            continue

        header = HEADING.fullmatch(line)
        if header:
            if step:
                finish_step(i)
            step_start = i + 1
            step = {"number": len(steps) + 1, "title": (header[1] or "").strip(), "code_blocks": [], "risk_notes": []}
            steps.append(step)
            risk_continues = False
            continue
        if not step:
            if line.strip():
                raise GuideError(path, i + 1, "正文请以 ## 小节标题 开始")
            continue

        fence = FENCE.fullmatch(line)
        if fence:
            marker, language = fence[1], fence[2].strip()
            if marker.startswith("`") and "`" in language:
                raise GuideError(path, i + 1, "代码围栏的语言标记含有反引号")
            block_start = i + 1
            risk_continues = False
            continue
        warning = RISK.fullmatch(line)
        if warning:
            if not warning[1].strip():
                raise GuideError(path, i + 1, "风险提示缺少文字")
            step["risk_notes"].append(warning[1].strip())
            risk_lines.add(i)
        elif risk_continues and line.lstrip().startswith(">"):
            step["risk_notes"][-1] += "\n" + line.lstrip()[1:].lstrip()
            risk_lines.add(i)
        else:
            risk_continues = False
        if warning:
            risk_continues = True

    if marker:
        raise GuideError(path, block_start, f"代码围栏 {marker} 未闭合")
    if not steps:
        raise GuideError(path, start + 1, "至少需要一个 ## 小节标题")
    finish_step(len(lines))
    return steps


def compile_guides(root, sources, *, editor=False):
    guides = []
    seen = {"id": {}, "order": {}}
    for path, data in sorted(sources.items()):
        try:
            lines = data.decode("utf-8-sig").replace("\r\n", "\n").replace("\r", "\n").splitlines(keepends=True)
        except UnicodeDecodeError as exc:
            raise GuideError(path, data[:exc.start].count(b"\n") + 1, "请保存为 UTF-8") from None
        values, locations, start = metadata(path, lines)
        status = values.pop("status", "published")
        for key, used in seen.items():
            value = values[key]
            if value in used:
                raise GuideError(path, locations[key], f"{key}={value} 重复，首次位于 {used[value]}")
            used[value] = f"{path.name} 第 {locations[key]} 行"
        parsed_steps = sections(path, lines, start, editor=editor)
        source_rel = path.relative_to(root).as_posix()
        if editor:
            guides.append({
                **values,
                "status": status,
                "source_file": source_rel,
                "body_markdown": "".join(lines[start:]),
                "steps": parsed_steps,
            })
        elif status == "revising":
            pub_title = (
                values["title"]
                if values["title"].endswith(REVISING_SUFFIXES)
                else f"{values['title']}（改进中）"
            )
            guides.append({
                **values,
                "title": pub_title,
                "status": "revising",
                "source_file": source_rel,
                "body_markdown": "",
                "steps": [dict(step, code_blocks=[], risk_notes=[]) for step in REVISING_PLACEHOLDER_STEPS],
            })
        else:
            guides.append({
                **values,
                "source_file": source_rel,
                "body_markdown": "".join(lines[start:]),
                "steps": parsed_steps,
            })
    guides.sort(key=lambda guide: guide["order"])
    return {"schema_version": "4.0", "guides": guides}


def build(root=ROOT):
    sources = {path: path.read_bytes() for path in (root / "guides").glob("*.md")}
    bundle = compile_guides(root, sources)
    payload = (json.dumps(bundle, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    for folder in ("data", "web/data"):
        write_snapshot(root / folder / "guides.json", payload)
    print(f"已校验并同步 {len(bundle['guides'])} 篇教程，guides.json 共 {len(payload)} 字节。")


if __name__ == "__main__":
    try:
        build()
    except (GuideError, OSError) as exc:
        print(f"教程构建失败：{exc}", file=sys.stderr)
        sys.exit(1)
