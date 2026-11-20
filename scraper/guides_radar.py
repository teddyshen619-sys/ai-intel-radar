"""按通用主题生成只读线索，可关联现有教程，但从不生成或改写教程。"""

import hashlib
import re
from datetime import timedelta
from pathlib import Path
from urllib.parse import quote

if __package__:
    from .models_catalog import write_snapshot
else:
    from models_catalog import write_snapshot


OUTPUT = Path(__file__).with_name("guides_updates.md")
README = "https://raw.githubusercontent.com/openai/codex/main/README.md"
TOPICS = (
    {
        "title": "地区、支付与订阅",
        "pattern": re.compile(
            r"\b(?:virtual[- ]cards?|billing|payments?|subscriptions?|regions?|countr(?:y|ies))\b"
            r"|地区|区域|国家|虚拟卡|支付|订阅|续费", re.I),
        "repos": (),
        "readme": False,
        "check": "核对服务地区、付款入口及续费条件；涉及账户的反馈先找厂商依据。",
    },
    {
        "title": "安装与认证",
        "pattern": re.compile(
            r"\bWSL2?\b|\b(?:login|oauth|auth\w*|install\w*|setup|sign[- ]in)\b"
            r"|安装|认证|登录|授权|环境配置", re.I),
        "repos": ("openai/codex",),
        "readme": True,
        "check": "核对各工具的安装命令、认证入口与 WSL 排障步骤；版本号变化本身不代表安装命令失效。",
    },
    {
        "title": "实战、沙盒与批处理",
        "pattern": re.compile(
            r"\b(?:codex|sandbox\w*|approvals?|workflows?|batch\w*|automation|headless)\b"
            r"|AGENTS\.md|\bworkspace-write\b|实战|沙盒|批处理|批量|审批|自动执行", re.I),
        "repos": ("openai/codex", "anthropics/claude-code", "cline/cline", "OpenHands/OpenHands"),
        "readme": False,
        "check": "核对沙盒、审批、审查及自动执行示例；区分各工具的适用条件与行为差异。",
    },
)
REPOS = tuple(dict.fromkeys(repo for topic in TOPICS for repo in topic["repos"]))


def install_sections(markdown):
    """按标题层级取安装/版本小节，遇到同级或上级标题结束。"""
    selected = []
    level = None
    fence = ""
    for line in markdown.splitlines():
        marker = re.match(r"^ {0,3}(`{3,}|~{3,})", line)
        if marker:
            if not fence:
                fence = marker[1]
            elif line.strip().startswith(fence) and set(line.strip()) == {fence[0]}:
                fence = ""
        heading = None if fence or marker else re.match(r"^(#{1,6})\s+(.+)", line)
        if heading:
            depth = len(heading[1])
            if level and depth <= level:
                level = None
            if level is None and re.search(r"\b(?:install\w*|upgrad\w*|versions?)\b", heading[2], re.I):
                level = depth
        if level:
            selected.append(line)
    return "\n".join(selected).strip()


def readme_note(fetch, previous):
    try:
        section = install_sections(fetch(README, "text/plain").decode("utf-8"))
        if not section:
            raise ValueError("未识别安装或版本小节，需核对上游标题")
        digest = hashlib.sha256(section.encode()).hexdigest()
        old = re.search(r"<!-- codex-readme-sha256: ([0-9a-f]{64}) -->", previous)
        if not old:
            status = "首次记录安装与版本段落"
        elif old[1] == digest:
            status = "安装与版本段落同上次成功采集一致"
        else:
            status = "安装或版本段落已有改动，请核对安装与认证主题下的相关步骤"
        # 摘录安装入口；其他标题、授权、致谢等内容不进入报告。
        samples = [line.strip() for line in section.splitlines() if re.match(
            r"^(curl .*install\.sh\s*\|\s*sh$|npm (?:i|install) .*codex|brew install .*codex)", line.strip())]
        if not samples:
            samples = [re.sub(r"<[^>]+>", "", line).strip() for line in section.splitlines()
                       if line and line[0].isalpha()][:2]
        return [f"- [Codex 官方 README]({README}) · {status}。",
                *[f"  - 摘录 · `{line.replace(chr(96), '')[:180]}`" for line in samples[:4]],
                f"<!-- codex-readme-sha256: {digest} -->"]
    except Exception as exc:  # 网络、压缩或上游格式异常只影响该参考源。
        lines = [f"- [Codex 官方 README]({README}) · 降级，{exc}。"]
        marker = re.search(r"<!-- codex-readme-sha256: [0-9a-f]{64} -->", previous)
        if marker:
            lines.append(marker[0])
        return lines


def topic_clues(entries, pattern, now):
    by_url = {}
    for entry in entries:
        if not now - timedelta(hours=72) <= entry.published <= now or entry.kind == "release":
            continue
        context = f"{entry.title} {entry.body} {entry.source}"
        match = pattern.search(entry.title) or pattern.search(context)
        if not match:
            continue
        by_url.setdefault(entry.url, (entry, match[0]))
    return sorted(by_url.values(), key=lambda pair: pair[0].published, reverse=True)[:5]


def guide_links(output, pattern, escape_text):
    root = output.parent.parent
    guides = root / "guides"
    if not guides.is_dir():
        return []
    links = []
    for guide in sorted(guides.glob("*.md")):
        try:
            if not guide.is_file() or not guide.resolve().is_relative_to(guides.resolve()):
                continue
            content = guide.read_text(encoding="utf-8")
        except (OSError, UnicodeError):  # 文件删除、不可读或编码异常不阻断主题线索。
            continue
        if pattern.search(guide.name.replace("_", " ")) or pattern.search(content):
            relative = Path("..") / guide.relative_to(root)
            url = quote(relative.as_posix(), safe="/")
            links.append(f"[{escape_text(guide.stem)}](<{url}>)")
    return links


def write_updates(batches, now, fetch, releases, escape_text, output=OUTPUT):
    output = Path(output)
    by_source = dict(batches)
    releases_by_repo = {}
    for repo in REPOS:
        batch = by_source.get(f"Release · {repo}")
        try:
            if batch is None:
                batch = releases(repo, now)
            releases_by_repo[repo] = (batch.entries, batch.status())
        except Exception as exc:  # 单一来源失败时仍保留其他主题线索。
            releases_by_repo[repo] = ([], f"降级 · {exc}")

    previous = output.read_text(encoding="utf-8") if output.exists() else ""
    note = readme_note(fetch, previous)
    entries = [entry for _, batch in batches for entry in batch.entries]
    lines = ["# 教程更新线索", "", f"采集时间 {now:%Y-%m-%d %H:%M} UTC。"
             "版本与日常线索使用近 72 小时窗口。README 单独核对安装与版本段落。",
             "", "以下按通用主题汇总只读待审阅素材，不依赖课程数量，也不会生成或改写教程。"
             "仅关联 guides/ 下实际存在且文件名或内容命中关键词的 Markdown；无匹配时仅保留主题线索。"
             "社区反馈仅代表报告者遇到的情况。", ""]
    degraded = [f"{source}（{batch.status()}）" for source, batch in batches if batch.notes]
    if degraded:
        lines += ["本轮部分来源降级 · " + escape_text("；".join(degraded)), ""]
    for topic in TOPICS:
        lines += [f"## {topic['title']}", ""]
        links = guide_links(output, topic["pattern"], escape_text)
        if links:
            lines += ["关联教程 · " + "、".join(links), ""]
        else:
            lines += ["关联教程 · 暂无匹配的 Markdown 教程，仅保留主题线索。", ""]
        if topic["readme"]:
            lines += [*note, ""]
        for repo in topic["repos"]:
            items, status = releases_by_repo[repo]
            lines += [f"**[{repo} 官方发布](https://github.com/{repo}/releases.atom)** · {escape_text(status)}", ""]
            recent = [entry for entry in items if now - timedelta(hours=72) <= entry.published <= now]
            for entry in sorted(recent, key=lambda e: e.published, reverse=True)[:2]:
                excerpt = entry.body
                if len(excerpt) > 180:
                    excerpt = excerpt[:180].rsplit(" ", 1)[0] + "…"
                lines.append(f"- [{escape_text(entry.title)}](<{entry.url}>) · {entry.time_label} "
                             f"{entry.published:%Y-%m-%d %H:%M} UTC。{escape_text(excerpt)}")
            lines.append("")
        clues = topic_clues(entries, topic["pattern"], now)
        for entry, keyword in clues:
            url = quote(entry.url, safe=":/?#&=%.~_-")
            lines.append(f"- [{escape_text(entry.title)}](<{url}>) · {entry.source} · "
                         f"{entry.published:%Y-%m-%d} · 命中 {escape_text(keyword)}")
        if not clues:
            lines.append("本轮日常采集未发现匹配线索。")
        lines += ["", f"编辑核查 · {topic['check']}", ""]
    write_snapshot(output, ("\n".join(lines).rstrip() + "\n").encode("utf-8"))
    print(f"已写入 {output.name}，追踪 {len(REPOS)} 个官方发布订阅及 Codex README。")
