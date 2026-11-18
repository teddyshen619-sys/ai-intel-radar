"""从公开 API 生成每日 Markdown 情报摘要。仅依赖 Python 标准库。"""

import json
import os
import platform
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from html import escape, unescape
from http.client import HTTPException
from pathlib import Path
from tempfile import NamedTemporaryFile
from urllib.error import HTTPError
from urllib.parse import quote, urlencode, urlsplit, urlunsplit
from urllib.request import Request, urlopen


OUTPUT = Path(__file__).with_name("raw_digest.md")
BEIJING = timezone(timedelta(hours=8))
REPOS = (
    "langgenius/dify", "langchain-ai/langgraph", "open-webui/open-webui",
    "cline/cline", "OpenHands/OpenHands", "browser-use/browser-use",
)  # All-Hands-AI/OpenHands 已迁移至 OpenHands/OpenHands。
HN_API = "https://hacker-news.firebaseio.com/v0"
HN_KEYWORDS = re.compile(
    r"\b(?:AI|OpenAI|LLMs?|Claude|(?:Chat)?GPT|DeepSeek|free|credits?|APIs?|bugs?|open[- ]source)",
    re.IGNORECASE,
)
HN_MIN_SCORE = 50
CONTACT = os.environ.get("GITHUB_REPOSITORY")
USER_AGENT = f"{platform.system().lower()}:public-intel-radar:1.0"
if CONTACT:
    USER_AGENT += f" (+https://github.com/{CONTACT})"
FETCH_ERRORS = (OSError, HTTPException, ValueError, KeyError, TypeError)


@dataclass
class Entry:
    source: str
    title: str
    url: str
    heat: int
    metrics: str
    body: str
    timestamp: float
    related_url: str = ""


def fetch_json(url):
    request = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    for attempt in range(2):
        try:
            with urlopen(request, timeout=15) as response:
                return json.load(response)
        except HTTPError as exc:
            if attempt or exc.code not in (500, 502, 503, 504):
                raise
        except (OSError, HTTPException):
            if attempt:
                raise
        time.sleep(1)


def github(repo, cutoff):
    query = urlencode({
        "q": f"repo:{repo} is:issue is:open created:>={cutoff}",
        "sort": "interactions", "order": "desc", "per_page": 10,
    })
    result = fetch_json(f"https://api.github.com/search/issues?{query}")
    entries = []
    for issue in result["items"]:
        comments = issue["comments"]
        reactions = issue["reactions"]["total_count"]
        entries.append(Entry(
            f"GitHub · {repo}", issue["title"], issue["html_url"], comments + reactions,
            f"{comments} 条评论 · {reactions} 个表情回应", issue.get("body") or "",
            datetime.fromisoformat(issue["created_at"].replace("Z", "+00:00")).timestamp(),
        ))
    return entries, "搜索结果可能不完整" if result.get("incomplete_results") else ""


def hacker_news():
    ids = fetch_json(f"{HN_API}/topstories.json")[:60]
    entries = []
    failures = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(fetch_json, f"{HN_API}/item/{i}.json"): i for i in ids}
        for future in as_completed(futures):
            try:
                item = future.result()
                if not item or item.get("type") != "story" or item.get("dead") or item.get("deleted"):
                    continue
                if item["score"] < HN_MIN_SCORE or not HN_KEYWORDS.search(item["title"]):
                    continue
                discussion = f"https://news.ycombinator.com/item?id={item['id']}"
                comments = item.get("descendants", 0)
                body = unescape(re.sub(r"<[^>]+>", " ", item.get("text") or ""))
                entries.append(Entry(
                    "Hacker News", item["title"], item.get("url") or discussion,
                    item["score"], f"{item['score']} 分 · {comments} 条评论", body,
                    item["time"], discussion,
                ))
            except FETCH_ERRORS as exc:
                failures.append(f"{futures[future]} ({exc})")
    note = f"{len(failures)}/{len(ids)} 条详情读取失败，首例 {failures[0]}" if failures else ""
    return entries, note


def url_key(url):
    parts = urlsplit(url)
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), parts.path.rstrip("/"), parts.query, ""))


def ranked_unique(entries):
    ranked = sorted(entries, key=lambda entry: (-entry.heat, -entry.timestamp, entry.url))
    seen = set()
    unique = []
    for entry in ranked:
        keys = {url_key(url) for url in (entry.url, entry.related_url) if url}
        if keys.isdisjoint(seen):
            unique.append(entry)
        seen.update(keys)
    return unique


def markdown_text(value):
    return re.sub(r"([\\`*_\[\]~|])", r"\\\1", escape(" ".join(value.split()), quote=False))


def render(entries, source_counts, now):
    lines = [
        "# 每日开源与社区雷达", "",
        f"北京时间 {now.astimezone(BEIJING):%Y-%m-%d %H:%M} · 去重后 **{len(entries)}** 条", "",
        "GitHub 取近 48 小时新建且仍开放的 Issue，每仓最多 10 条。"
        f"Hacker News 从热门榜前 60 条中筛选标题命中关键词且至少 {HN_MIN_SCORE} 分的帖子。", "",
        "## 采集情况", "", "| 来源 | 入选条数（去重前） |", "| --- | ---: |",
    ]
    for name, count in source_counts:
        lines.append(f"| {name} | {count} |")
    lines += ["", "## 热度排行", "",
              "按热度数值降序，同分时新帖优先。GitHub 使用评论数与表情回应数之和，"
              "Hacker News 使用帖子分数。", ""]
    for rank, entry in enumerate(entries, 1):
        body = re.sub(r"<!--.*?-->", " ", entry.body, flags=re.DOTALL)
        excerpt = " ".join(body.split())[:300]
        link = quote(entry.url, safe=":/?#[]@!$&'()*+,;=%~-._")
        lines += [
            f"### {rank}. {markdown_text(entry.title)}", "",
            f"**{entry.source}** · 热度 **{entry.heat}** · {entry.metrics}", "",
            f"原始 URL · <{link}>", "",
            "> " + (markdown_text(excerpt) if excerpt else "原帖未提供正文。"), "",
        ]
    return "\n".join(lines)


def main():
    now = datetime.now(timezone.utc)
    cutoff = (now - timedelta(hours=48)).strftime("%Y-%m-%dT%H:%M:%SZ")
    jobs = [(f"GitHub · {repo}", github, (repo, cutoff)) for repo in REPOS]
    jobs.append(("Hacker News", hacker_news, ()))

    entries = []
    source_counts = []
    incomplete = False
    for name, collect, args in jobs:
        try:
            batch, note = collect(*args)
            entries.extend(batch)
            count = len(batch)
        except FETCH_ERRORS as exc:
            count, note = 0, f"读取失败（{exc}）"
        incomplete = incomplete or bool(note)
        source_counts.append((name, count))
        print(f"{name}: {count} | {note or '成功'}", flush=True)

    if not entries and incomplete:
        print("采集不完整且没有可用条目，保留上一份日报。", file=sys.stderr)
        return 1
    unique = ranked_unique(entries)
    content = render(unique, source_counts, now)
    with NamedTemporaryFile(dir=OUTPUT.parent, delete=False) as temp:
        path = Path(temp.name)
    try:
        path.write_text(content, encoding="utf-8", newline="\n")
        path.replace(OUTPUT)
    finally:
        path.unlink(missing_ok=True)
    print(f"已写入 {OUTPUT.name}，共 {len(unique)} 条。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
