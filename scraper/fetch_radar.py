"""从公开 API 和订阅源生成每日 Markdown 情报摘要（仅依赖标准库）。"""

import gzip
import json
import math
import os
import re
import time
import unicodedata
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from difflib import SequenceMatcher
from email.utils import parsedate_to_datetime
from html import escape, unescape
from http.client import HTTPException
from pathlib import Path
from tempfile import NamedTemporaryFile
from urllib.error import HTTPError
from urllib.parse import parse_qsl, quote, unquote, urlencode, urljoin, urlsplit, urlunsplit
from urllib.request import Request, urlopen

if __package__:
    from .guides_radar import write_updates
    from .models_catalog import PRICE_FIELDS, refresh_catalog
else:
    from guides_radar import write_updates
    from models_catalog import PRICE_FIELDS, refresh_catalog

OUTPUT = Path(__file__).with_name("raw_digest.md")
UTC = timezone.utc
BEIJING = timezone(timedelta(hours=8))
REPOS = (
    "langgenius/dify", "langchain-ai/langgraph", "open-webui/open-webui",
    "cline/cline", "OpenHands/OpenHands", "browser-use/browser-use",
)
RELEASE_REPOS = (
    "anthropics/claude-code", "openai/codex", "openai/openai-python",
    "google-gemini/generative-ai-python", "ollama/ollama", "vllm-project/vllm",
    "langgenius/dify", "open-webui/open-webui", "OpenHands/OpenHands",
)
FEEDS = {
    "OpenAI News": ("https://openai.com/news/rss.xml", "https://openai.com/blog/rss.xml"),
    "Google DeepMind": ("https://deepmind.google/blog/rss.xml",),
    "Google AI Blog": ("https://blog.google/technology/ai/rss/",),
    "Google Gemini": ("https://blog.google/products/gemini/rss/",),
    "The Verge AI": ("https://www.theverge.com/rss/ai-artificial-intelligence/index.xml",),
    "TechCrunch AI": ("https://techcrunch.com/category/artificial-intelligence/feed/",),
    "The Rundown AI": ("https://rss.beehiiv.com/feeds/2R3C6Bt5wj.xml",),
    "Ben's Bites": ("https://www.bensbites.com/feed",),
    "9to5Google": ("https://9to5google.com/feed/",),
    "Product Hunt": ("https://www.producthunt.com/feed",),
    "Hugging Face Blog": ("https://huggingface.co/blog/feed.xml",),
    "Anthropic News（社区镜像）": (
        "https://raw.githubusercontent.com/alan-turing-institute/ai-rss-feeds/main/feeds/anthropic-news.xml",
    ),
    "Cloudflare Blog": ("https://blog.cloudflare.com/rss/",),
}
HN_API = "https://hacker-news.firebaseio.com/v0"
REVIEW_FEEDS = {
    "Simon Willison": ("https://simonwillison.net/atom/everything/",),
    "Latent Space": ("https://www.latent.space/feed",),
    "Import AI": ("https://importai.substack.com/feed",),
}
# 已与各频道主页公布的 RSS 链接核对。
YOUTUBE = {
    "OpenAI": "UCXZCJLdBC09xxGZ6gcdrc6A",
    "Google DeepMind": "UCP7jMXSY2xbc3KCAE0MHQ-A",
    "Anthropic": "UCrDwWp7EBBv4NwvScIpBDOA",
    "Andrej Karpathy": "UCXUPKJO5MZQN11PqgIvyuvQ",
    "Matthew Berman": "UCawZsQWqfGSbCI5yjkdVkTA",
    "AI Engineer": "UCLKPca3kwwd-B59HNr-_lvA",
}
MEDIA = "{http://search.yahoo.com/mrss/}"
YT = "{http://www.youtube.com/xml/schemas/2015}"
REVIEW_TOPIC = re.compile(
    r"\b(?:benchmarks?|evals?|reviews?|comparisons?|compared|versus|vs|leaderboards?|hands[- ]on)\b", re.I,
)
AI_TOPIC = re.compile(
    r"\b(?:AI|LLMs?|GPT|ChatGPT|OpenAI|Anthropic|Claude|Gemini|DeepSeek|Llama|Qwen|"
    r"coding agents?|language models?|machine learning)\b", re.I,
)
HN_LIMIT, HN_MIN_SCORE = 80, 50
HARD_FAULT = re.compile(
    r"\b(?:OOM|out[- ]of[- ]memory|memory leaks?|deadlocks?|regressions?|404|500|CVE|"
    r"breaking|crash(?:es|ed|ing)?|security)\b", re.I,
)
DEV_TOPIC = re.compile(
    r"\b(?:Codex|APIs?|SDKs?|GPUs?|TPUs?|CUDA|inference|open[- ]source|software|developers?|"
    r"programming|compilers?|databases?|Linux|Python|JavaScript|Rust|GitHub|Kubernetes|"
    r"neural networks?|computer science|model weights|source code)\b"
    r"|\b(?:GPT|Llama|DeepSeek|Claude|Gemini)(?=\d)", re.I,
)
HN_KEYWORDS = re.compile(
    r"\b(?:AI|OpenAI|Anthropic|Codex|LLMs?|Claude|(?:Chat)?GPT|Gemini|DeepSeek|Llama|free|credits?|APIs?|"
    r"bugs?|open[- ]source|compute|GPUs?|TPUs?|pricing|prices?|polic(?:y|ies)|regulat(?:ion|ions|ory)|terms)\b"
    r"|\b(?:GPT|Llama|DeepSeek|Claude|Gemini)(?=\d)", re.I,
)
CF_KEYWORDS = re.compile(r"\b(?:AI|Workers?|Pages|Models?)\b", re.I)
PAPER_TOPICS = re.compile(
    r"\b(?:models?|LLMs?|VLMs?|transformers?|diffusion|pre[- ]?training|post[- ]?training|"
    r"fine[- ]?tuning|open[- ](?:source|weights?)|mixture of experts|weights released)\b", re.I,
)
# 每组最多加一次分，防止模板、重复词和长日志挤占排名。
BASE_SCORE = {
    "blog": 56, "release": 55, "video": 49, "review_blog": 47,
    "paper": 43, "community_blog": 39, "hn": 32, "issue": 18,
}
FEED_FILTERS = {
    "9to5Google": re.compile(r"\b(?:AI|artificial intelligence|Gemini|NotebookLM|Google One|"
                             r"ChatGPT|Claude|Perplexity)\b", re.I),
    "Product Hunt": re.compile(r"\b(?:AI|artificial intelligence|agents?|LLMs?|(?:Chat)?GPT|"
                              r"Claude|Gemini|videos?|images?|workflows?)\b", re.I),
}
BENEFIT = (r"\b(?:free[- ](?:tiers?|trials?|access|credits?|plans?|usage|API|compute|GPUs?)|"
           r"for free|free for students|discounts?|promo(?:tions?| codes?)?|perks?|"
           r"student (?:offers?|plans?|benefits?)|(?:API|GPU|compute) credits?)\b")
PRODUCT = (r"\b(?:Google (?:One|AI (?:Pro|Ultra))|Gemini(?: (?:Ultra|Pro))?|"
           r"ChatGPT(?: Plus)?|Claude(?: Pro)?|Perplexity|NotebookLM|Workspace|Chrome extensions?)\b")
FEATURE = re.compile(r"\b(?:new|launch\w*|introduc\w*|releas\w*|roll(?:s|ing)? out|"
                     r"now available|add(?:s|ed|ing)?|gets?|can now)\b", re.I)
KEYWORD_WEIGHTS = [
    (re.compile(pattern, re.I), points) for pattern, points in (
        (r"\b(?:CVE(?:-\d+)?|security|outages?)\b", 15),
        (r"\b(?:breaking|deprecated|deprecations?)\b", 12),
        (r"\b(?:polic(?:y|ies)|terms|pricing|prices?)\b", 9),
        (BENEFIT, 16),
        (PRODUCT, 10),
        (r"\b(?:free|credits?|students?|iPhone|Mac)\b", 6),
        (r"\b(?:ChatGPT|GPT|Claude|Gemini|DeepSeek|Llama)(?:\b|(?=\d))", 6),
        (r"\brelease[sd]?\b", 4),
    )
]
RADAR_TOPIC = re.compile(
    BENEFIT + r"|\b(?:outages?|CVE-\d+|vulnerabilit(?:y|ies)|workarounds?|bugs?)\b", re.I,
)
BENEFIT_TOPIC = re.compile(BENEFIT, re.I)
PRODUCT_TOPIC = re.compile(PRODUCT, re.I)
ATOM = "{http://www.w3.org/2005/Atom}"
USER_AGENT = "public-intel-radar/3.0"
if os.environ.get("GITHUB_REPOSITORY"):
    USER_AGENT += f" (+https://github.com/{os.environ['GITHUB_REPOSITORY']})"


def clean_text(value):
    value = re.sub(r"<!--.*?-->|<(script|style)\b[^>]*>.*?</\1>", " ", value or "", flags=re.I | re.S)
    value = re.sub(r"</?[a-zA-Z][\w:-]*(?:\s+[^>]*)?\s*/?>", " ", value)
    value = re.sub(r"!?\[([^\]]*)\]\(https?://[^)\s]+\)", r"\1", unescape(value))
    value = re.sub(r"(?m)^\s*#{1,6}\s+|\*\*|`{1,3}", "", value)
    return " ".join(value.split())


def web_url(value):
    url = value.strip()
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise ValueError("无有效 HTTP(S) 链接")
    return url


def parse_date(value):
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        dt = parsedate_to_datetime(value)
    if dt.tzinfo is None:
        raise ValueError("发布时间缺少时区")
    return dt.astimezone(UTC)


@dataclass
class Entry:
    kind: str
    source: str
    title: str
    url: str
    published: datetime
    body: str
    heat: int = 0
    metrics: str = ""
    related_url: str = ""
    time_label: str = "发布时间"
    media_url: str = ""

    def __post_init__(self):
        self.title = clean_text(self.title)
        if not self.title:
            raise ValueError("缺少标题")
        self.url = web_url(self.url)
        self.body = clean_text(self.body)[:300]
        if self.related_url:
            self.related_url = web_url(self.related_url)
        if self.media_url:
            self.media_url = web_url(self.media_url)


@dataclass
class Batch:
    examined: int = 0
    entries: list = field(default_factory=list)
    notes: list = field(default_factory=list)
    available: bool = True

    def status(self):
        if self.notes:
            return "降级 · " + "；".join(self.notes)
        return "成功" if self.entries else "成功 · 无符合条件的条目"


def parse_rows(rows, convert):
    if not isinstance(rows, list):
        raise ValueError("响应缺少条目列表")
    result = Batch(examined=len(rows))
    errors = []
    for row in rows:
        try:
            entry = convert(row)
            if entry is not None:
                result.entries.append(entry)
        except (ValueError, TypeError, AttributeError, KeyError, OverflowError, OSError) as exc:
            errors.append(str(exc))
    if errors:
        result.notes.append(f"{len(errors)} 条解析异常，首例 {errors[0]}")
        if len(errors) == len(rows):
            result.available = False
    return result


def fetch(url, accept):
    request = Request(url, headers={"User-Agent": USER_AGENT, "Accept": accept, "Accept-Encoding": "gzip"})
    for attempt in range(2):
        try:
            with urlopen(request, timeout=15) as response:
                data = response.read()
                if response.headers.get("Content-Encoding", "").lower() == "gzip":
                    data = gzip.decompress(data)
                return data
        except HTTPError as exc:
            if attempt or exc.code not in (500, 502, 503, 504):
                raise
        except (OSError, HTTPException):
            if attempt:
                raise
        time.sleep(1)


def fetch_json(url):
    return json.loads(fetch(url, "application/json"))


def issue_body(body):
    lines = []
    checklist = False
    for line in (body or "").splitlines():
        if re.match(r"^\s*#{1,6}\s", line):
            checklist = bool(re.search(r"\b(?:self[- ]checks?|checklist|prerequisites|before submitting)\b", line, re.I))
            if checklist:
                continue
        box = re.match(r"^\s*[-*]\s*\[[ xX]\]\s*(.*)", line)
        if box and (checklist or re.match(
            r"I (?:have (?:read|search|check|confirm|fill)|agree|confirm)|"
            r"please (?:read|do not modify)|this (?:report is in|is only for)", box[1], re.I,
        )):
            continue
        lines.append(line)
    return clean_text("\n".join(lines))


def github(repo, now):
    cutoff = (now - timedelta(hours=48)).strftime("%Y-%m-%dT%H:%M:%SZ")
    query = urlencode({
        "q": f"repo:{repo} is:issue is:open created:>={cutoff}",
        "sort": "interactions", "order": "desc", "per_page": 10,
    })
    response = fetch_json(f"https://api.github.com/search/issues?{query}")

    def convert(issue):
        comments = issue["comments"]
        reactions = issue["reactions"]["total_count"]
        body = issue_body(issue.get("body"))
        min_interactions = 2 if HARD_FAULT.search(f"{issue['title']} {body}") else 5
        if comments + reactions < min_interactions:
            return None
        return Entry("issue", f"GitHub · {repo}", issue["title"], issue["html_url"],
                     parse_date(issue["created_at"]), body, comments + reactions,
                     f"{comments} 条评论 · {reactions} 个表情回应")

    batch = parse_rows(response["items"], convert)
    batch.entries = sorted(batch.entries, key=lambda entry: entry.heat, reverse=True)[:2]
    if response.get("incomplete_results"):
        batch.notes.append("GitHub 返回部分搜索结果")
    return batch


def relevant_hn(item):
    title = item["title"]
    if item["score"] < HN_MIN_SCORE or not (HN_KEYWORDS.search(title) or REVIEW_TOPIC.search(title)):
        return False
    context = f"{title} {clean_text(item.get('text'))[:1000]}"
    if AI_TOPIC.search(context) or DEV_TOPIC.search(context):
        return True
    host = urlsplit(item.get("url") or "").hostname or ""
    return any(host == domain or host.endswith("." + domain) for domain in (
        "github.com", "huggingface.co", "openai.com", "anthropic.com", "deepmind.google",
        "openrouter.ai", "developer.apple.com", "developer.nvidia.com",
    ))


def hacker_news():
    ids = fetch_json(f"{HN_API}/topstories.json")[:HN_LIMIT]
    items, failures = [], []
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(fetch_json, f"{HN_API}/item/{i}.json"): i for i in ids}
        for future in as_completed(futures):
            try:
                items.append(future.result())
            except Exception as exc:  # 单条网络响应失败不丢弃其他已读帖子。
                failures.append(f"{futures[future]} ({exc})")

    def convert(item):
        if not item or item.get("type") != "story" or item.get("dead") or item.get("deleted"):
            return None
        if not relevant_hn(item):
            return None
        discussion = f"https://news.ycombinator.com/item?id={item['id']}"
        return Entry("hn", "Hacker News", item["title"], item.get("url") or discussion,
                     datetime.fromtimestamp(item["time"], UTC), item.get("text"), item["score"],
                     f"{item['score']} 分 · {item.get('descendants', 0)} 条评论", discussion)

    batch = parse_rows(items, convert)
    if failures:
        batch.notes.append(f"{len(failures)}/{len(ids)} 个详情读取失败，首例 {failures[0]}")
        batch.available = bool(items) and batch.available
    return batch


def child_text(node, *paths):
    for path in paths:
        child = node.find(path)
        if child is not None:
            text = " ".join(child.itertext()).strip()
            if text:
                return text
    return ""


def parse_feed(data, url, source, now, *, release_repo=None, video_channel=None):
    root = ET.fromstring(data)
    atom = root.tag == ATOM + "feed"
    if atom:
        rows = root.findall(ATOM + "entry")
    elif not (release_repo or video_channel) and root.tag == "rss" and root.find("channel") is not None:
        rows = root.findall("./channel/item")
    else:
        raise ValueError("响应不是 RSS 2.0 或 Atom 订阅")

    cutoff = now - (timedelta(hours=72) if release_repo else timedelta(days=7))
    if video_channel:
        # YouTube 的订阅元数据有时省略 UC 前缀。
        feed_id = child_text(root, YT + "channelId").removeprefix("UC")
        if feed_id != video_channel.removeprefix("UC"):
            raise ValueError("订阅返回的频道 ID 不匹配")
        cutoff = now - timedelta(days=14)

    def convert(node):
        prefix = ATOM if atom else ""
        published = parse_date(child_text(node, ATOM + "published", ATOM + "updated", "pubDate",
                                          "{http://purl.org/dc/elements/1.1/}date"))
        if not cutoff <= published <= now:
            return None
        title = child_text(node, prefix + "title")
        categories = [c.get("term") or c.text or "" for c in node.findall(prefix + "category")]
        if source == "Cloudflare Blog" and not CF_KEYWORDS.search(" ".join([title, *categories])):
            return None
        if atom:
            link = next((c.get("href") for c in node.findall(ATOM + "link")
                         if c.get("rel", "alternate") == "alternate" and c.get("href")), "")
        else:
            link = child_text(node, "link") or child_text(node, "guid")
        if not link:
            raise ValueError("条目缺少链接")
        base = "{http://www.w3.org/XML/1998/namespace}base"
        link = urljoin(urljoin(urljoin(url, root.get(base, "")), node.get(base, "")), link)
        if video_channel:
            group = MEDIA + "group/"
            thumbnail = node.find(group + MEDIA + "thumbnail")
            return Entry("video", source, title, link, published, child_text(node, group + MEDIA + "description"),
                         media_url=thumbnail.get("url", "") if thumbnail is not None else "")
        body = child_text(node, "description", ATOM + "summary", ATOM + "content",
                          "{http://purl.org/rss/1.0/modules/content/}encoded")
        if source in FEED_FILTERS:
            full_text = child_text(node, ATOM + "content", "{http://purl.org/rss/1.0/modules/content/}encoded")
            topic = " ".join([title, *categories, clean_text(body), clean_text(full_text)])
            if not FEED_FILTERS[source].search(topic):
                return None
        if release_repo:
            tag_path = urlsplit(link).path.partition("/releases/tag/")[2]
            if not tag_path:
                raise ValueError("发布链接缺少版本标签")
            tag = unquote(tag_path)
            if PRERELEASE.search(" ".join([tag, title, *categories])):
                return None
            notes = re.sub(r"</(?:li|p)>|<br\s*/?>", "\n", body, flags=re.I)
            if minor_patch(tag, notes):
                return None
            label = "发布时间" if child_text(node, ATOM + "published") else "订阅更新时间"
            return Entry("release", source, f"{release_repo} · {title or tag}", link, published,
                         notes, metrics=f"版本 {tag}", time_label=label)
        kind = "review_blog" if source in REVIEW_FEEDS else "blog"
        if source == "Simon Willison":
            topic = " ".join([title, *categories, clean_text(body)[:300]])
            if not (AI_TOPIC.search(topic) or REVIEW_TOPIC.search(topic)):
                return None
        if source == "Hugging Face Blog" and len(urlsplit(link).path.strip("/").split("/")) > 2:
            kind = "community_blog"
        return Entry(kind, source, title, link, published, body)

    return parse_rows(rows, convert)


def fetch_feed(source, urls, now):
    failures = []
    for url in urls:
        try:
            data = fetch(url, "application/rss+xml, application/atom+xml, application/xml, text/xml")
            batch = parse_feed(data, url, source, now)
            if not batch.available and url != urls[-1]:
                failures.append(f"{url}：{batch.status()}")
                continue
        except Exception as exc:  # 同时处理请求失败、损坏的压缩内容和 XML 解析异常。
            failures.append(f"{url}：{exc}")
            continue
        if failures:
            batch.notes.insert(0, "；".join(failures) + f"；已使用备用源 {url}")
        return batch
    return Batch(notes=failures, available=False)


def daily_papers(now):
    def convert(row):
        paper = row["paper"]
        published = parse_date(paper["publishedAt"])
        if not now - timedelta(days=7) <= published <= now:
            return None
        title, summary = paper["title"], paper.get("summary") or ""
        votes = int(paper["upvotes"])
        if votes <= 0 or not PAPER_TOPICS.search(f"{title} {summary}"):
            return None
        return Entry("paper", "Hugging Face Daily Papers", title,
                     f"https://huggingface.co/papers/{quote(paper['id'], safe='')}",
                     published, summary, votes, f"{votes} 票")

    batch = parse_rows(fetch_json("https://huggingface.co/api/daily_papers"), convert)
    batch.entries.sort(key=lambda e: (-e.heat, -e.published.timestamp(), e.url))
    batch.entries = batch.entries[:8]
    return batch


# 仅剔除变更说明全属文档、CI、格式或依赖维护的补丁；安全修复与功能变更保留。
PATCH_TAG = re.compile(r"(?:^|[^0-9])\d+\.\d+\.([1-9]\d*)(?:$|\+)")
# 公开发布订阅没有 REST 的 prerelease 布尔字段，检查标签、标题和 Atom 分类。
PRERELEASE = re.compile(
    r"(?<![a-z])(?:alpha|beta|rc|pre[- ]?release|preview|nightly|canary|dev)(?![a-z])"
    r"|(?<=\d)[ab](?=\d)|\brelease candidate\b", re.I,
)
MAINTENANCE = re.compile(
    r"^(?:docs?|documentation|chore|ci|build|style|deps|tests?)(?:\([^)]*\))?[:\s]|"
    r"\b(?:typos?|lint(?:ing)?|formatting|readme|dependabot|bump(?:ed)? [\w@/-]+ from)\b", re.I,
)
IMPORTANT_CHANGE = re.compile(
    r"\b(?:breaking|outages?|CVE|security|vulnerabilit(?:y|ies)|critical|deprecat\w*|"
    r"regression|crash(?:es)?)\b", re.I,
)


def minor_patch(tag, notes):
    if not PATCH_TAG.search(tag) or IMPORTANT_CHANGE.search(notes):
        return False
    changes = []
    for line in notes.splitlines():
        line = clean_text(line).strip(" -+*")
        if not line or re.match(r"^(?:what.s changed|changelog|full changelog|new contributors|"
                                r"changes|bug fixes|maintenance|https?://|compare:|@)", line, re.I):
            continue
        changes.append(line)
    return bool(changes) and all(MAINTENANCE.search(line) for line in changes)


def releases(repo, now):
    url = f"https://github.com/{repo}/releases.atom"
    data = fetch(url, "application/atom+xml")
    return parse_feed(data, url, f"Release · {repo}", now, release_repo=repo)


def videos(name, channel_id, now):
    url = f"https://www.youtube.com/feeds/videos.xml?channel_id={channel_id}"
    data = fetch(url, "application/atom+xml")
    return parse_feed(data, url, f"YouTube · {name}", now, video_channel=channel_id)


def value_score(entry, now):
    age_hours = max(0, (now - entry.published).total_seconds() / 3600)
    freshness = max(0, math.ceil(16 * (1 - age_hours / 24)))
    interaction = min(22, round(3 * math.log2(1 + max(0, entry.heat))))
    text = f"{entry.title} {entry.body}"
    keywords = sum(weight for pattern, weight in KEYWORD_WEIGHTS if pattern.search(text))
    if REVIEW_TOPIC.search(entry.title):
        keywords += 8
    return min(100, BASE_SCORE[entry.kind] + freshness + interaction + min(30, keywords))


def consumer_channel(entry):
    if (entry.kind not in {"blog", "community_blog", "review_blog", "hn"}
            or re.search(r"\b(?:APIs?|SDKs?)\b", entry.title, re.I)):
        return None
    text = f"{entry.title} {entry.body}"
    if BENEFIT_TOPIC.search(text):
        return "RADAR"
    if REVIEW_TOPIC.search(entry.title) or RADAR_TOPIC.search(entry.title):
        return None
    if entry.source == "Product Hunt" or (PRODUCT_TOPIC.search(text) and FEATURE.search(text)):
        return "INTEL"
    return None


def channel(entry):
    consumer = consumer_channel(entry)
    if consumer:
        return consumer
    if entry.kind == "video":
        return "REVIEW"
    if entry.kind in {"review_blog", "hn", "paper", "blog"} and REVIEW_TOPIC.search(entry.title):
        return "REVIEW"
    if entry.kind == "review_blog" and REVIEW_TOPIC.search(entry.body):
        return "REVIEW"
    if entry.kind == "issue" or RADAR_TOPIC.search(entry.title):
        return "RADAR"
    return "INTEL"


def url_key(url):
    parts = urlsplit(url)
    query = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True)
             if not k.lower().startswith("utm_") and k.lower() not in {"fbclid", "gclid"}]
    return urlunsplit(("", parts.netloc.lower(), parts.path.rstrip("/"), urlencode(sorted(query)), ""))


def event_title(entry):
    title = unicodedata.normalize("NFKC", entry.title).casefold()
    if entry.kind == "release":
        # 官方 Atom 标题常为 owner/repo · v1.2.3；保留项目名及精确版本。
        title = title.split("/", 1)[-1]
    title = re.sub(r"^\s*(?:\[ainews\]|show hn:|launch hn:)\s*", "", title)
    title, launched = re.subn(r"^(?:(?:openai|google(?: deepmind)?|anthropic|meta|microsoft)\s+)?"
                              r"(?:introducing|introduces|announc(?:es|ing)|launch(?:es|ing)|releases?|unveils?)\s+", "", title)
    if launched:
        title = title.split(":", 1)[0]
    title = re.split(r"[—–]\s*(?:models?\s+(?:built|designed)\b|official launch\b|release notes\b)", title)[0]
    title = re.sub(r"\s+(?:(?:is |are )?(?:now )?available|released|launched)$", "", title)
    words = re.findall(r"\d+(?:\.\d+)*|[^\W\d_]+", title)
    return tuple(w for w in words if w != "v")


def same_headline(left, right):
    if len(set(left)) < 2 or len(set(right)) < 2:
        return False
    # 不同版本、数值和限定词经常只有一个 token 的差别。
    if {w for w in left if w[0].isdigit()} != {w for w in right if w[0].isdigit()}:
        return False
    if tuple(dict.fromkeys(left)) == tuple(dict.fromkeys(right)):
        return True
    qualifiers = {"not", "no", "mini", "pro", "lite", "preview", "beta", "alpha", "review", "vs"}
    a, b = set(left), set(right)
    if (a ^ b) & qualifiers or min(len(a), len(b)) < 5:
        return False
    # 允许报道加上少量修饰词；替换实体名的两个标题保持独立。
    return (a <= b or b <= a) and SequenceMatcher(None, left, right).ratio() >= 0.88


@dataclass
class Event:
    entry: Entry
    base_score: int
    urls: set
    title: tuple
    sources: dict

    @property
    def score(self):
        return min(100, self.base_score + min(9, 3 * (len(self.sources) - 1)))


def ranked_unique(entries, now):
    ranked = [(value_score(entry, now), entry) for entry in entries]
    ranked.sort(key=lambda pair: (-pair[0], -pair[1].published.timestamp(), pair[1].url))
    events = []
    for score, entry in ranked:
        keys = {url_key(url) for url in (entry.url, entry.related_url) if url}
        title = event_title(entry)
        matches = [event for event in events if not keys.isdisjoint(event.urls)]
        if not matches:
            for event in events:
                if entry.source == event.entry.source or abs(entry.published - event.entry.published) > timedelta(days=4):
                    continue
                if entry.kind in {"issue", "release"} and entry.kind == event.entry.kind:
                    continue
                if same_headline(title, event.title):
                    matches.append(event)
                    break
        if not matches:
            events.append(Event(entry, score, keys, title, {entry.source: entry.related_url or entry.url}))
            continue
        winner = matches[0]  # 已按原始价值分排序，保留分数最高的报道。
        winner.urls.update(keys)
        winner.sources.setdefault(entry.source, entry.related_url or entry.url)
        for other in matches[1:]:
            winner.urls.update(other.urls)
            for source, url in other.sources.items():
                winner.sources.setdefault(source, url)
            events.remove(other)
    return sorted(events, key=lambda e: (-e.score, -e.entry.published.timestamp(), e.entry.url))


def markdown_text(value):
    return re.sub(r"([\\`*_\[\]~|])", r"\\\1", escape(" ".join(value.split()), quote=False))


def model_link(model_id):
    url = "https://openrouter.ai/models?" + urlencode({"q": model_id})
    return f"[{markdown_text(model_id)}]({url})"


def model_bulletin(report, status):
    lines = ["## 模型价格与免费额度异动速报", ""]
    if status != "成功":
        lines.extend([markdown_text(status), ""])
    if report is None:
        return lines + ["本轮没有可比较的模型快照。", ""]
    if report["previous_updated_at"] is None:
        lines.extend(["首次建立精选目录基线。", ""])
    lines += [f"精选目录新增免费型号 **{len(report['new_free'])}** 个 · "
              f"显著调价 **{len({p['id'] for p in report['price_changes']})}** 个模型 · "
              f"30 天内到期 **{len(report['expiring'])}** 个", ""]
    for model_id in report["new_free"]:
        lines.append(f"- **新增免费** · {model_link(model_id)}")
    for p in report["price_changes"]:
        delta = f"{p['change_pct']:+g}%" if p["change_pct"] is not None else "由零价转为收费"
        lines.append(f"- **{PRICE_FIELDS[p['field']]}调价** · {model_link(p['id'])} · "
                     f"{p['old']:g} → {p['new']:g} 美元 / 百万 token（{delta}）")
    for model in report["expiring"]:
        lines.append(f"- **停服预警** · {model_link(model['id'])} · "
                     f"{model['expiration_date']} 到期（距快照日 {model['days_remaining']} 天）")
    return lines + [""]


def render(ranked, batches, now, catalog_stats):
    examined, count, status, report = catalog_stats
    lines = [
        "# 每日开源与厂商情报雷达", "",
        f"北京时间 {now.astimezone(BEIJING):%Y-%m-%d %H:%M} · 去重后 **{len(ranked)}** 条", "",
        *model_bulletin(report, status),
        "## 采集情况", "",
        "| 来源 | 检查条目 | 入选（去重前） | 状态 |", "| --- | ---: | ---: | --- |",
    ]
    for source, batch in batches:
        lines.append(f"| {source} | {batch.examined} | {len(batch.entries)} | {markdown_text(batch.status())} |")
    lines.append(f"| OpenRouter 模型目录（独立 JSON） | {examined} | {count} | {markdown_text(status)} |")
    lines += ["", "## 大众实用与免费福利精选", ""]
    picks = [event.entry for event in ranked if consumer_channel(event.entry)][:8]
    for entry in picks:
        link = quote(entry.url, safe=":/?#&=%~._-")
        lines.append(f"- [建议: {channel(entry)}] [{markdown_text(entry.title)}](<{link}>) · "
                     f"{markdown_text(entry.source)}")
        if entry.body:
            lines.append(f"  > {markdown_text(entry.body[:140])}")
    if not picks:
        lines.append("本轮暂无符合条件的条目。")
    lines += ["", "## 价值排行", "",
              "价值分为 1–100 分，综合来源、互动量、24 小时内的新鲜度与关键词。同分时按发布时间倒序。", ""]
    for rank, event in enumerate(ranked, 1):
        score, entry = event.score, event.entry
        published = entry.published.astimezone(BEIJING).strftime("%Y-%m-%d %H:%M")
        link = quote(entry.url, safe=":/?#[]@!$&'()*+,;=%~-._")
        lines += [
            f"### {rank}. {markdown_text(entry.title)}", "",
            f"**价值分 {score}** · [建议: {channel(entry)}] · {entry.source}", "",
            f"{entry.time_label} {published}（北京）" + (f" · {markdown_text(entry.metrics)}" if entry.metrics else ""),
            "", f"原始 URL · <{link}>", "",
        ]
        if len(event.sources) > 1:
            refs = [f"[{markdown_text(name)}](<{quote(url, safe=':/?#&=%~._-')}>)" for name, url in event.sources.items()]
            lines += [f"多源印证（+{score - event.base_score} 分） · " + " · ".join(refs), ""]
        if entry.media_url:
            cover = quote(entry.media_url, safe=":/?&=%~.-_")
            lines += [f"[![视频封面](<{cover}>)](<{link}>)", ""]
        lines += ["> " + (markdown_text(entry.body) or "来源未提供正文。"), ""]
    return "\n".join(lines)


def main():
    now = datetime.now(UTC)
    jobs = [(f"GitHub · {repo}", github, (repo, now)) for repo in REPOS]
    jobs.append(("Hacker News", hacker_news, ()))
    jobs.extend((source, fetch_feed, (source, urls, now)) for source, urls in FEEDS.items())
    jobs.append(("Hugging Face Daily Papers", daily_papers, (now,)))
    jobs.extend((f"Release · {repo}", releases, (repo, now)) for repo in RELEASE_REPOS)
    jobs.extend((f"YouTube · {name}", videos, (name, channel_id, now)) for name, channel_id in YOUTUBE.items())
    jobs.extend((name, fetch_feed, (name, urls, now)) for name, urls in REVIEW_FEEDS.items())

    batches = []
    for source, collect, args in jobs:
        try:
            batch = collect(*args)
        except Exception as exc:  # 在来源边界隔离网络或响应格式变化，继续下一来源。
            batch = Batch(notes=[f"{type(exc).__name__}: {exc}"], available=False)
        batches.append((source, batch))
        print(f"{source}: {len(batch.entries)}/{batch.examined} | {batch.status()}", flush=True)

    write_updates(batches, now, fetch, releases, markdown_text)
    catalog_stats = refresh_catalog(fetch_json, now)
    print(f"OpenRouter: {catalog_stats[1]}/{catalog_stats[0]} | {catalog_stats[2]}", flush=True)
    ranked = ranked_unique([entry for _, batch in batches for entry in batch.entries], now)
    content = render(ranked, batches, now, catalog_stats)
    with NamedTemporaryFile(dir=OUTPUT.parent, delete=False) as temp:
        path = Path(temp.name)
    try:
        path.write_text(content, encoding="utf-8", newline="\n")
        path.replace(OUTPUT)
    finally:
        path.unlink(missing_ok=True)
    print(f"已写入 {OUTPUT.name}，共 {len(ranked)} 条。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
