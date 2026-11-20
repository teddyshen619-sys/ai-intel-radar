"""本地课程编辑器。启动：python scraper/studio.py [--port 8767] [--no-browser]。"""

import argparse
import base64
import binascii
import hashlib
import json
import re
import shutil
import threading
import uuid
import webbrowser
from datetime import date
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

if __package__:
    from . import build_guides
else:
    import build_guides

ROOT = build_guides.ROOT
ASSETS = {"index.html": "text/html", "app.js": "text/javascript",
          "markdown.js": "text/javascript", "studio.css": "text/css"}
LOCK = threading.RLock()
MAX_IMAGE_BYTES = 5 * 1024 * 1024
IMAGE_TYPES = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
               ".gif": "image/gif", ".webp": "image/webp"}


class Problem(ValueError):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def local_path(root, relative):
    path = root / relative
    if not path.is_relative_to(root) or path.resolve() != path:
        raise Problem("文件路径必须位于项目指定目录，不能使用链接或上级目录。")
    return path


def sources_at(root):
    folder = local_path(root, "guides")
    if not folder.exists():
        return {}
    return {local_path(root, p.relative_to(root)): p.read_bytes() for p in folder.glob("*.md")}


def revision(sources):
    digest = hashlib.sha256()
    for path, data in sorted(sources.items()):
        digest.update(path.name.encode() + b"\0" + hashlib.sha256(data).digest())
    return digest.hexdigest()


def library(root, sources):
    bundle = build_guides.compile_guides(root, sources, editor=True)
    report = local_path(root, "scraper/guides_updates.md")
    bundle["updates"] = report.read_text(encoding="utf-8") if report.is_file() else ""
    bundle["revision"] = revision(sources)
    return bundle


def image_extension(data):
    if (len(data) >= 45 and data.startswith(b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR")
            and int.from_bytes(data[16:20], "big") > 0 and int.from_bytes(data[20:24], "big") > 0
            and data.endswith(b"\x00\x00\x00\x00IEND\xaeB`\x82")):
        return ".png"
    if len(data) >= 20 and data.startswith(b"\xff\xd8\xff") and data.endswith(b"\xff\xd9"):
        return ".jpg"
    if (len(data) >= 14 and data[:6] in (b"GIF87a", b"GIF89a") and data.endswith(b";")
            and int.from_bytes(data[6:8], "little") > 0 and int.from_bytes(data[8:10], "little") > 0):
        return ".gif"
    if (len(data) >= 20 and data[:4] == b"RIFF" and data[8:12] == b"WEBP"
            and data[12:16] in (b"VP8 ", b"VP8L", b"VP8X")
            and int.from_bytes(data[4:8], "little") == len(data) - 8
            and 0 < int.from_bytes(data[16:20], "little") <= len(data) - 20):
        return ".webp"
    raise Problem("图片内容不是有效的 PNG、JPEG、GIF 或 WebP，不支持 SVG。", 422)


def upload_image(root, request):
    if not isinstance(request, dict):
        raise Problem("请求须为 JSON 对象。")
    guide_id = request.get("id")
    if not isinstance(guide_id, str) or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", guide_id):
        raise Problem("课程 ID 格式无效。")
    bundle = library(root, sources_at(root))
    if not any(guide["id"] == guide_id for guide in bundle["guides"]):
        raise Problem("找不到指定的课程 ID。", 404)
    if request.get("revision", bundle["revision"]) != bundle["revision"]:
        raise Problem("课程目录已被其他窗口或文本编辑器修改，请保留草稿并重新载入。", 409)
    filename = single_line(request.get("filename"), "图片文件名")
    if len(filename) > 255 or any(c in filename for c in "/\\:") or any(ord(c) < 32 for c in filename):
        raise Problem("图片文件名不能包含路径、控制字符或超过 255 个字符。")
    suffix = Path(filename).suffix.lower()
    if suffix not in IMAGE_TYPES:
        raise Problem("仅支持 PNG、JPEG、GIF、WebP 图片，不支持 SVG 或其他扩展名。", 422)
    encoded = request.get("data_base64")
    if not isinstance(encoded, str):
        raise Problem("图片 data_base64 须为 Base64 文本。")
    if len(encoded) > ((MAX_IMAGE_BYTES + 2) // 3) * 4:
        raise Problem("图片大小不能超过 5 MB。", 422)
    try:
        data = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError):
        raise Problem("图片 Base64 编码无效。") from None
    if not data or len(data) > MAX_IMAGE_BYTES:
        raise Problem("图片大小须大于 0 且不超过 5 MB。", 422)
    extension = image_extension(data)
    if extension != (".jpg" if suffix == ".jpeg" else suffix):
        raise Problem("图片扩展名与真实图片格式不一致。", 422)
    name = hashlib.sha256(data).hexdigest() + extension
    relative = f"guides-media/{guide_id}/{name}"
    path = local_path(root, "web/" + relative)
    build_guides.write_snapshot(path, data)
    stem = Path(filename).stem
    alt = " ".join(re.sub(r"[_\W]+", " ", stem).split())[:80]
    if not alt or re.fullmatch(
        r"(?:image|blob|clipboard|pasted[-_ ]?image|screenshot|屏幕截图|屏幕快照|截图)[\d\s._()-]*|[\da-f-]{12,}|[\d\s._()-]+",
        stem, re.I
    ):
        alt = "操作截图"
    return {"path": relative, "alt": alt}


def single_line(value, label, *, allow_empty=False):
    if (not isinstance(value, str) or (not value.strip() and not allow_empty)
            or (value and (len(value.splitlines(keepends=True)) != 1 or value != value.rstrip("\r\n")))):
        raise Problem(f"{label}须为一行文字。")
    return value.strip()


def step_markdown(path, item, originals):
    if not isinstance(item, dict):
        raise Problem("每个步骤须包含标题与正文。")
    title = single_line(item.get("title"), "步骤标题", allow_empty=True)
    body = item.get("markdown")
    if not isinstance(body, str):
        raise Problem(f"步骤「{title}」的正文须为文本。")
    body = body.replace("\r\n", "\n").strip("\n") if body.strip() else ""
    notes = item.get("risk_notes", [])
    if not isinstance(notes, list) or not all(isinstance(n, str) and n.strip() for n in notes):
        raise Problem(f"步骤「{title}」的风险提示须为非空文本列表。")
    number = item.get("number")
    original = originals[number - 1] if type(number) is int and 1 <= number <= len(originals) else None
    if original and original["risk_notes"] == notes and body in (
        original["editor_markdown"].replace("\r\n", "\n"), original["markdown"].replace("\r\n", "\n").strip("\n")
    ):
        body = original["markdown"].replace("\r\n", "\n").strip("\n")
    elif body:
        # 普通 API 客户端也可回传打包器的完整 markdown，其中可能已含风险提示。
        parsed = build_guides.sections(path, (f"## {title}\n" + body + "\n").splitlines(True), 0, editor=True)
        if len(parsed) != 1:
            raise Problem(f"「{title}」正文中的二级标题会拆出新步骤，请使用新增步骤按钮。")
        embedded = parsed[0]["risk_notes"]
        if "risk_notes" in item and embedded != notes:
            if original and body == original["markdown"].replace("\r\n", "\n").strip("\n"):
                body = with_notes(parsed[0]["editor_markdown"], notes)
            else:
                # 正文中新手写的提示同样属于稿件，保留原位置。
                body = with_notes(body, [note for note in notes if note not in embedded])
    else:
        body = with_notes("", notes)
    heading = f"## {title}".rstrip()
    return f"{heading}\n\n{body}" if body else heading


def with_notes(body, notes):
    paragraphs = [body] if body else []
    for note in notes:
        first, *rest = note.strip().splitlines()
        paragraphs.append("\n".join(["> 风险提示：" + first, *["> " + line for line in rest]]))
    return "\n\n".join(paragraphs)


def serialize(path, fields, originals=()):
    header = ["---"]
    for key in build_guides.FIELDS:
        value = fields.get(key)
        if key == "order":
            if type(value) is not int or value < 1:
                raise Problem("排序序号须为正整数。")
            value = str(value)
        if key == "related_tags" and isinstance(value, list):
            value = ", ".join(single_line(tag, "标签") for tag in value)
        value = single_line(value, key, allow_empty=key in {"track", "summary", "author_note", "related_tags"})
        header.append(f"{key}: {value}" if value else f"{key}:")
    items = fields.get("steps")
    if not isinstance(items, list) or not items:
        raise Problem("每门课程至少保留一个步骤。")
    sections = [step_markdown(path, item, originals) for item in items]
    return ("\n".join(header + ["---"]) + "\n\n" + "\n\n".join(sections) + "\n").encode("utf-8")


def move_order(sources, guides, current, order, root):
    orders = [g["order"] for g in guides]
    if order == current["order"] or order not in orders:
        return
    moved = list(guides)
    moved.remove(current)
    moved.insert(orders.index(order), current)
    for guide, new_order in zip(moved, orders):
        if guide is not current and guide["order"] != new_order:
            path = root / guide["source_file"]
            sources[path] = re.sub(rb"(?m)^order:[^\r\n]*", f"order: {new_order}".encode(), sources[path], count=1)


def transact(root, action, request):
    if not isinstance(request, dict):
        raise Problem("请求须为 JSON 对象。")
    before = sources_at(root)
    bundle = library(root, before)
    if request.get("revision", bundle["revision"]) != bundle["revision"]:
        raise Problem("课程目录已被其他窗口或文本编辑器修改，请保留草稿并重新载入。", 409)
    guides = bundle["guides"]
    after = before.copy()
    media_to_delete = None
    if action == "create":
        if {"source_file", "path", "filename", "id"} & request.keys():
            raise Problem("新课程的 ID 与文件名由后台自动分配。")
        order = max((g["order"] for g in guides), default=0) + 1
        guide_id = "lesson-" + uuid.uuid4().hex[:12]
        path = local_path(root, f"guides/{order:02d}-{guide_id}.md")
        fields = dict(id=guide_id, order=order, updated_at=date.today().isoformat(),
                      title=request.get("title", "未命名课程"), track=request.get("track", ""),
                      summary="", author_note="", related_tags=[],
                      steps=[{"title": "第一步", "markdown": ""}])
        if path.exists():
            raise Problem("课程文件名冲突，请重试。", 409)
        after[path] = serialize(path, fields)
    else:
        guide_id = request.get("id")
        current = next((g for g in guides if g["id"] == guide_id), None)
        if not current:
            raise Problem("找不到指定的课程 ID。", 404)
        if request.get("source_file", current["source_file"]) != current["source_file"]:
            raise Problem("课程文件名与 ID 不匹配。")
        path = local_path(root, current["source_file"])
        if action == "delete":
            media_to_delete = local_path(root, f"web/guides-media/{current['id']}")
            del after[path]
            guide_id = next((g["id"] for g in guides if g is not current), "")
        else:
            candidate = serialize(path, request, current["steps"])
            if candidate != before[path] and candidate != serialize(path, current, current["steps"]):
                after[path] = candidate
            move_order(after, guides, current, request["order"], root)

    build_guides.compile_guides(root, after)  # 校验所有候选文件后再写入。
    outputs = [local_path(root, name) for name in ("data/guides.json", "web/data/guides.json")]
    saved_outputs = {p: p.read_bytes() if p.exists() else None for p in outputs}
    changed = [p for p in before.keys() | after.keys() if before.get(p) != after.get(p)]
    if sources_at(root) != before:
        raise Problem("课程文件刚刚发生变更，请重新载入。", 409)
    applied = []
    try:
        for p in changed:
            if p in after:
                build_guides.write_snapshot(p, after[p])
            else:
                p.unlink()
            applied.append(p)
        build_guides.build(root)
    except Exception:
        for p, data in [(p, before.get(p)) for p in applied] + list(saved_outputs.items()):
            if data is None:
                p.unlink(missing_ok=True)
            else:
                build_guides.write_snapshot(p, data)
        raise
    result = {**library(root, after), "active_id": guide_id}
    if media_to_delete is not None:
        try:
            media_to_delete = local_path(root, media_to_delete.relative_to(root))
            if media_to_delete.exists():
                shutil.rmtree(media_to_delete)
        except (OSError, Problem):
            result["warning"] = "课程已删除并同步，但图片目录未能清理，请检查本地图片文件。"
    return result


class Handler(BaseHTTPRequestHandler):
    server_version = "LocalStudio/1"

    def reply(self, status, data, mime="application/json"):
        if mime == "application/json":
            data = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        content_type = mime + "; charset=utf-8" if mime.startswith("text/") or mime == "application/json" else mime
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy", "default-src 'self'; img-src 'self' data: https:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
        self.end_headers()
        self.wfile.write(data)

    def dispatch(self, post):
        try:
            host = self.headers.get("Host")
            port = self.server.server_port
            allowed_hosts = {f"127.0.0.1:{port}", f"localhost:{port}"}
            if port == 80:
                allowed_hosts.update({"127.0.0.1", "localhost"})
            if host not in allowed_hosts:
                raise Problem("只接受本机访问。", 403)
            if post and self.headers.get("Origin", "http://" + host) != "http://" + host:
                raise Problem("请从本地后台页面提交。", 403)
            root = self.server.project
            route = urlsplit(self.path).path
            if not post and route == "/api/guides":
                with LOCK:
                    return self.reply(200, library(root, sources_at(root)))
            if not post and route.startswith("/guides-media/"):
                relative = route[1:]
                if ".." in relative or not re.fullmatch(
                    r"guides-media/(?:[A-Za-z0-9_-]+/)+[A-Za-z0-9_.-]+\.(?:png|jpe?g|webp|gif)", relative, re.I
                ):
                    raise Problem("图片路径或格式不允许访问。", 403)
                with LOCK:
                    path = local_path(root, "web/" + relative)
                    if not path.is_file():
                        raise Problem("找不到此图片。", 404)
                    return self.reply(200, path.read_bytes(), IMAGE_TYPES[path.suffix.lower()])
            if post and route in {"/api/guides/save", "/api/guides/create", "/api/guides/delete", "/api/guides/upload-image"}:
                if self.headers.get_content_type() != "application/json":
                    raise Problem("请求格式须为 application/json。", 415)
                length = self.headers.get("Content-Length", "")
                if not length.isdigit() or len(length) > 8 or int(length) > 8 * 1024 * 1024:
                    raise Problem("请求长度无效或超过 8 MB。", 413)
                try:
                    request = json.loads(self.rfile.read(int(length)).decode("utf-8"))
                except (UnicodeError, json.JSONDecodeError):
                    raise Problem("请提交有效的 UTF-8 JSON。") from None
                with LOCK:
                    result = upload_image(root, request) if route == "/api/guides/upload-image" else transact(root, route.rsplit("/", 1)[1], request)
                return self.reply(200, result)
            asset = "index.html" if route in ("/", "/studio", "/studio/") else route.removeprefix("/studio/")
            if not post and asset in ASSETS:
                return self.reply(200, local_path(root, Path("studio") / asset).read_bytes(), ASSETS[asset])
            raise Problem("找不到此地址。", 404)
        except (Problem, build_guides.GuideError) as exc:
            self.reply(getattr(exc, "status", 422), {"error": str(exc)})
        except (ValueError, RecursionError):
            self.reply(400, {"error": "无法读取请求，请检查文字编码与 JSON 格式。"})
        except OSError as exc:
            self.reply(500, {"error": f"本地文件操作失败：{exc}"})

    def do_GET(self):
        self.dispatch(False)

    def do_POST(self):
        self.dispatch(True)


def main():
    parser = argparse.ArgumentParser(description="本地教程编辑器")
    parser.add_argument("--port", type=int, default=8767)
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()
    if not 0 <= args.port <= 65535:
        parser.error("端口须在 0 到 65535 之间")
    try:
        server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    except OSError as exc:
        parser.exit(1, f"无法启动，端口可能已在使用，可用 --port 更换。{exc}\n")
    with server:
        server.project = ROOT
        url = f"http://127.0.0.1:{server.server_port}/"
        print(f"Local Studio  {url}  按 Ctrl+C 停止。", flush=True)
        if not args.no_browser:
            webbrowser.open(url)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
