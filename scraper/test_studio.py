"""在临时课程库中验收 Local Studio。运行 python scraper/test_studio.py。"""

import base64
import json
import re
import struct
import tempfile
import threading
import unittest
import zlib
from datetime import datetime, timedelta, timezone
from http.server import ThreadingHTTPServer
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import quote
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

if __package__:
    from . import guides_radar, studio
else:
    import guides_radar
    import studio


EMPTY = {"schema_version": "4.0", "guides": []}
EMPTY_BYTES = b'{\n  "schema_version": "4.0",\n  "guides": []\n}\n'
FIXTURE = """---
id: test-lesson
order: 1
track: 临时测试
title: 测试课程
summary: 验证 Markdown 的往返保存。
updated_at: 2026-11-19
author_note: 仅用于临时课程库。
related_tags: test, Markdown
---

## 准备环境

正文含有 **强调**、`内联代码` 与 [Python](https://www.python.org/)。

> 风险提示：备份原稿
> 确认路径

| 项目 | 状态 |
| --- | --- |
| 原稿 | 已备份 |

```text
## 围栏内不是步骤
> 风险提示：围栏内不是提示
"quoted" \\path
```

<!-- 保留原稿注释 -->

## 验证结果

~~~bash
python --version
~~~

> 风险提示：检查输出
"""


IMAGES = {extension: base64.b64decode(data) for extension, data in {
    ".png": "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR4AWJiiz/6H4SZGKAAAAAA//9gkhnQAAAABklEQVQDADdKBFc38KIzAAAAAElFTkSuQmCC",
    ".jpg": "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAACAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AJVAA//Z",
    ".webp": "UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoCAAIAAUAmJaQAA3AA/v02aAA=",
    ".gif": "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
}.items()}


class StudioTest(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name).resolve()
        (self.root / "scraper").mkdir()
        (self.root / "scraper/guides_updates.md").write_text("教学更新线索", encoding="utf-8")
        studio.build_guides.build(self.root)
        server = ThreadingHTTPServer(("127.0.0.1", 0), studio.Handler)
        server.project = self.root
        self.url = f"http://127.0.0.1:{server.server_port}/api/guides"
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(server.server_close)
        self.addCleanup(thread.join)
        self.addCleanup(server.shutdown)

    def seed(self, count=2):
        folder = self.root / "guides"
        folder.mkdir(exist_ok=True)
        for order in range(1, count + 1):
            text = FIXTURE.replace("id: test-lesson", f"id: test-lesson-{order}")
            text = text.replace("order: 1", f"order: {order}")
            if order % 2 == 0:
                text = "\ufeff" + text.replace("\n", "\r\n")
            (folder / f"{order:02d}-test.md").write_bytes(text.encode("utf-8"))
        studio.build_guides.build(self.root)

    def call(self, action="", payload=None, status=200, headers=None):
        data = json.dumps(payload).encode() if payload is not None else None
        request = Request(self.url + action, data, {"Content-Type": "application/json", **(headers or {})})
        try:
            response = urlopen(request, timeout=5)
        except HTTPError as exc:
            response = exc
        with response:
            result = json.load(response)
            self.assertEqual(response.status, status, result.get("error"))
            self.assertEqual(response.headers["Cache-Control"], "no-store")
            self.assertEqual(response.headers["X-Content-Type-Options"], "nosniff")
            self.assertIn("default-src 'self'", response.headers["Content-Security-Policy"])
            self.assertIn("frame-ancestors 'none'", response.headers["Content-Security-Policy"])
        return result

    def upload(self, guide_id, extension=".png", filename=None, data=None):
        return self.call("/upload-image", {"id": guide_id, "filename": filename or "操作截图" + extension,
                                         "data_base64": base64.b64encode(IMAGES[extension] if data is None else data).decode()})

    def media(self, path, status=200, mime=None):
        url = self.url.removesuffix("/api/guides") + "/" + path
        try:
            response = urlopen(url, timeout=5)
        except HTTPError as exc:
            response = exc
        with response:
            data = response.read()
            self.assertEqual(response.status, status, data[:200])
            self.assertEqual(response.headers["X-Content-Type-Options"], "nosniff")
            self.assertIn("img-src 'self' data: https:", response.headers["Content-Security-Policy"])
            if mime:
                self.assertEqual(response.headers["Content-Type"], mime)
        return data

    def snapshots(self):
        return {p: p.read_bytes() for p in self.root.rglob("*") if p.is_file()}

    def assert_empty_outputs(self):
        main = (self.root / "data/guides.json").read_bytes()
        self.assertEqual(main, (self.root / "web/data/guides.json").read_bytes())
        self.assertEqual(main, EMPTY_BYTES)
        self.assertEqual(json.loads(main), EMPTY)

    def test_empty_missing_directory_and_gitkeep(self):
        self.assertFalse((self.root / "guides").exists())
        self.assertEqual(studio.sources_at(self.root), {})
        self.assertEqual(studio.build_guides.compile_guides(self.root, {}), EMPTY)
        self.assertEqual(self.call()["guides"], [])
        self.assert_empty_outputs()
        folder = self.root / "guides"
        folder.mkdir()
        for placeholder in (None, ".gitkeep"):
            with self.subTest(placeholder=placeholder):
                if placeholder:
                    (folder / placeholder).write_bytes(b"")
                studio.build_guides.build(self.root)
                self.assertEqual(studio.sources_at(self.root), {})
                self.assertEqual(self.call()["guides"], [])
                self.assert_empty_outputs()

    def test_round_trip_and_rejected_edits(self):
        self.seed()
        initial = self.snapshots()
        catalog = self.call()
        self.assertEqual(catalog["updates"], "教学更新线索")
        self.assertEqual(len(catalog["guides"]), 2)
        for guide in catalog["guides"]:
            self.call("/save", guide)
            for step in guide["steps"]:
                step["markdown"] = step["editor_markdown"]
            self.call("/save", guide)
        self.assertEqual(self.snapshots(), initial)
        guide = catalog["guides"][0]
        guide["steps"][0]["markdown"] = "```bash\npython --version"
        self.assertIn("未闭合", self.call("/save", guide, 422)["error"])
        self.call("/delete", {"id": guide["id"], "source_file": "../data/guides.json"}, 400)
        self.assertEqual(self.snapshots(), initial)

    def test_empty_create_move_edit_and_delete_all(self):
        initial = self.call()
        self.assertEqual(initial["guides"], [])
        added = self.call("/create", {"title": "第一门课", "revision": initial["revision"]})
        first = added["guides"][0]
        self.assertEqual(first["order"], 1)
        self.assertEqual(first["id"], added["active_id"])
        added = self.call("/create", {"title": "第二门课", "revision": added["revision"]})
        guide = next(g for g in added["guides"] if g["id"] == added["active_id"])
        self.assertEqual(guide["order"], 2)
        guide["order"] = 1
        guide["title"] = "编辑后的第二门课"
        guide["revision"] = added["revision"]
        guide["steps"] = [dict(title="终端练习", markdown="```text\n## 示例\n> 风险提示：示例\n```",
                               risk_notes=["备份原稿\n确认路径"]),
                          dict(title="检查结果", markdown="核对输出。", risk_notes=[])]
        result = self.call("/save", guide)
        self.assertEqual([g["id"] for g in result["guides"]], [guide["id"], first["id"]])
        self.assertEqual([g["order"] for g in result["guides"]], [1, 2])
        self.assertEqual(result["guides"][0]["title"], guide["title"])
        step = result["guides"][0]["steps"][0]
        self.assertEqual(step["risk_notes"], ["备份原稿\n确认路径"])
        self.assertIn("## 示例", step["code_blocks"][0]["code"])
        guide = result["guides"][0]
        guide["steps"].reverse()
        result = self.call("/save", {**guide, "revision": result["revision"]})
        self.assertEqual([s["title"] for s in result["guides"][0]["steps"]], ["检查结果", "终端练习"])
        self.assertEqual([s["number"] for s in result["guides"][0]["steps"]], [1, 2])
        saved = self.snapshots()
        self.call("/delete", {"id": guide["id"], "revision": added["revision"]}, 409)
        self.assertEqual(self.snapshots(), saved)
        while result["guides"]:
            result = self.call("/delete", {"id": result["guides"][-1]["id"], "revision": result["revision"]})
        self.assertIn(result["active_id"], ("", None))
        self.assertEqual(self.call()["guides"], [])
        self.assertEqual(result["revision"], initial["revision"])
        self.assertEqual(studio.sources_at(self.root), {})
        self.assert_empty_outputs()
        recreated = self.call("/create", {"title": "重新开始", "revision": result["revision"]})
        self.assertEqual(recreated["guides"][0]["order"], 1)
        self.call("/delete", {"id": recreated["active_id"], "revision": recreated["revision"]})
        self.assert_empty_outputs()

    def test_invalid_source_does_not_replace_outputs(self):
        self.seed(1)
        path = self.root / "guides/01-test.md"
        valid = path.read_bytes()
        main = (self.root / "data/guides.json").read_bytes()
        for invalid in (valid.replace(b"order: 1", b"order: 0"), valid + b"\n```bash\nunclosed"):
            with self.subTest(invalid=invalid[-30:]):
                path.write_bytes(invalid)
                with self.assertRaises(studio.build_guides.GuideError):
                    studio.build_guides.build(self.root)
                self.assertEqual((self.root / "data/guides.json").read_bytes(), main)
                self.assertEqual((self.root / "web/data/guides.json").read_bytes(), main)
        path.write_bytes(valid)

    def test_partial_build_rollback(self):
        self.seed(1)
        initial = self.snapshots()
        guide = self.call()["guides"][0]
        guide["title"] += "（临时编辑）"

        def failed_build(root):
            (root / "data/guides.json").write_bytes(b"partial")
            raise OSError("模拟同步中断")

        for action, payload in (("/save", guide), ("/delete", {"id": guide["id"]}),
                                ("/create", {"title": "失败的新课"})):
            with self.subTest(action=action), patch.object(studio.build_guides, "build", failed_build):
                self.assertIn("模拟同步中断", self.call(action, payload, 500)["error"])
                self.assertEqual(self.snapshots(), initial)

    def test_first_creation_rollback(self):
        initial = self.snapshots()
        write_snapshot = studio.build_guides.write_snapshot

        def failed_write(path, data):
            if path == self.root / "web/data/guides.json" and data != EMPTY_BYTES:
                raise OSError("模拟网页同步失败")
            write_snapshot(path, data)

        with patch.object(studio.build_guides, "write_snapshot", failed_write):
            self.assertIn("模拟网页同步失败", self.call("/create", {"title": "第一门课"}, 500)["error"])
        self.assertEqual(self.snapshots(), initial)
        self.assertEqual(self.call()["guides"], [])
        self.assert_empty_outputs()

    def test_localhost_security_and_empty_revision_conflict(self):
        initial = self.call()
        self.call(headers={"Host": "untrusted.invalid"}, status=403)
        self.call("/create", {"title": "不允许"}, 403, {"Origin": "https://untrusted.invalid"})
        self.call("/create", {"title": "不允许"}, 415, {"Content-Type": "text/plain"})
        self.call("/create", {"title": "不允许", "filename": "../outside.md"}, 400)
        self.assertEqual(self.call()["guides"], [])
        self.call("/create", {"title": "第一门课", "revision": initial["revision"]})
        saved = self.snapshots()
        self.call("/create", {"title": "过期窗口", "revision": initial["revision"]}, 409)
        self.assertEqual(self.snapshots(), saved)

    def test_clear_optional_fields_and_steps_round_trip(self):
        self.seed()
        catalog = self.call()
        guide = catalog["guides"][0]
        for key in ("track", "summary", "author_note"):
            guide[key] = ""
        guide["related_tags"] = []
        guide["steps"] = [{**step, "title": "", "markdown": "", "risk_notes": []}
                          for step in guide["steps"]]
        result = self.call("/save", {**guide, "revision": catalog["revision"]})
        saved = result["guides"][0]
        for key in ("track", "summary", "author_note"):
            self.assertEqual(saved[key], "")
        self.assertEqual(saved["related_tags"], [])
        self.assertEqual(len(saved["steps"]), 2)
        for step in saved["steps"]:
            for key in ("title", "markdown", "editor_markdown"):
                self.assertEqual(step[key], "")
            self.assertEqual(step["risk_notes"], [])
            self.assertEqual(step["code_blocks"], [])
        source = (self.root / saved["source_file"]).read_bytes()
        for key in ("track", "summary", "author_note", "related_tags"):
            self.assertIn((key + ":\n").encode(), source)
        self.assertTrue(source.endswith(b"---\n\n##\n\n##\n"))
        self.assertFalse(any(line.endswith((b" ", b"\t")) for line in source.splitlines()))
        initial = self.snapshots()
        self.call("/save", {**saved, "revision": result["revision"]})
        saved["related_tags"] = ""
        for key in ("track", "summary", "author_note"):
            saved[key] = " \t"
        for step in saved["steps"]:
            step.update(title=" \t", markdown=" \t\n\n \n")
        self.call("/save", saved)
        self.assertEqual(self.snapshots(), initial)
        self.assertEqual((self.root / "data/guides.json").read_bytes(),
                         (self.root / "web/data/guides.json").read_bytes())

    def test_empty_source_round_trip_and_structural_validation(self):
        self.seed(1)
        path = self.root / "guides/01-test.md"
        guide = self.call()["guides"][0]
        guide.update(track="", summary="", author_note="", related_tags=[],
                     steps=[{"title": "", "markdown": "", "risk_notes": []}])
        canonical = studio.serialize(path, guide).decode()
        source = ("\ufeff" + canonical.replace("##\n", "##   \n \t\n\n")).replace("\n", "\r\n").encode()
        path.write_bytes(source)
        studio.build_guides.build(self.root)
        initial = self.snapshots()
        saved = self.call()["guides"][0]
        self.assertEqual(saved["steps"][0]["markdown"], "")
        self.assertEqual(saved["steps"][0]["editor_markdown"], "")
        self.call("/save", saved)
        saved["steps"][0]["markdown"] = saved["steps"][0]["editor_markdown"]
        self.call("/save", saved)
        self.assertEqual(self.snapshots(), initial)
        invalid = [canonical.replace("\n##\n", "\nstray\n##\n"),
                   canonical.replace("\n##\n", "\n"), canonical + "```bash\nopen fence\n",
                   canonical.replace("related_tags:", "related_tags: a, a"),
                   canonical.replace("related_tags:", "related_tags: a,"),
                   canonical.replace("track:\n", "")]
        invalid += [re.sub(rf"(?m)^{key}:.*$", f"{key}:", canonical)
                    for key in ("id", "order", "title", "updated_at")]
        for text in invalid:
            with self.subTest(text=text), self.assertRaises(studio.build_guides.GuideError):
                studio.build_guides.compile_guides(self.root, {path: text.encode()})
        valid_tags = canonical.replace("related_tags:", "related_tags: first， second")
        parsed = studio.build_guides.compile_guides(self.root, {path: valid_tags.encode()})
        self.assertEqual(parsed["guides"][0]["related_tags"], ["first", "second"])
        for changes in ({"track": None}, {"summary": "line one\nline two"}, {"related_tags": [""]},
                        {"steps": []}, {"steps": [{"title": None, "markdown": ""}]}):
            self.call("/save", {**saved, **changes}, 400)
        self.assertEqual(self.snapshots(), initial)

    def test_new_courses_start_with_empty_content(self):
        for track in ("", "自定义赛道"):
            result = self.call("/create", {"title": "空白新课程", "track": track})
            guide = next(g for g in result["guides"] if g["id"] == result["active_id"])
            self.assertEqual(guide["track"], track)
            self.assertEqual(guide["summary"], "")
            self.assertEqual(guide["author_note"], "")
            self.assertEqual(guide["related_tags"], [])
            self.assertEqual(len(guide["steps"]), 1)
            self.assertEqual(guide["steps"][0]["title"], "第一步")
            self.assertEqual(guide["steps"][0]["markdown"], "")
            self.assertEqual(guide["steps"][0]["editor_markdown"], "")
            initial = self.snapshots()
            self.call("/save", guide)
            self.assertEqual(self.snapshots(), initial)
        guide["steps"][0]["risk_notes"] = ["仍需检查入口"]
        result = self.call("/save", guide)
        saved = next(g for g in result["guides"] if g["id"] == guide["id"])
        self.assertEqual(saved["steps"][0]["editor_markdown"], "")
        self.assertEqual(saved["steps"][0]["risk_notes"], ["仍需检查入口"])
        initial = self.snapshots()
        saved["steps"][0]["markdown"] = ""
        self.call("/save", saved)
        self.assertEqual(self.snapshots(), initial)

    def test_save_jump_links_and_bare_urls(self):
        self.seed(1)
        guide = self.call()["guides"][0]
        markdown = ("[打开网站](https://example.invalid/start?q=a%20b)\n\n"
                    "https://example.invalid/docs?step=1&lang=zh\n\n"
                    "查看 https://example.invalid/guide_(intro)。以及 [说明](https://example.invalid/help)。\n\n"
                    "`https://example.invalid/inline-code`\n\n"
                    "```text\nhttps://example.invalid/fenced-code\n```\n\n"
                    "![截图](guides-media/test-lesson-1/image.png)")
        guide["steps"] = [{"title": "", "markdown": markdown, "risk_notes": []}]
        saved = self.call("/save", guide)["guides"][0]
        self.assertEqual(saved["steps"][0]["editor_markdown"], markdown)
        self.assertIn(markdown, saved["body_markdown"])
        self.assertEqual(saved["steps"][0]["code_blocks"][0]["code"], "https://example.invalid/fenced-code\n")
        initial = self.snapshots()
        self.call("/save", saved)
        saved["steps"][0]["markdown"] = saved["steps"][0]["editor_markdown"]
        self.call("/save", saved)
        self.assertEqual(self.snapshots(), initial)
        main = (self.root / "data/guides.json").read_bytes()
        self.assertEqual(main, (self.root / "web/data/guides.json").read_bytes())
        self.assertIn(markdown, json.loads(main)["guides"][0]["body_markdown"])

    def test_upload_images_and_read_correct_mime(self):
        self.seed(1)
        catalog = self.call()
        guide = catalog["guides"][0]
        initial = self.snapshots()
        for extension, data in IMAGES.items():
            with self.subTest(extension=extension):
                result = self.upload(guide["id"], extension)
                self.assertEqual(result["alt"], "操作截图")
                self.assertRegex(result["path"], rf"^guides-media/{guide['id']}/[a-f0-9]{{64}}{re.escape(extension)}$")
                self.assertEqual((self.root / "web" / result["path"]).read_bytes(), data)
                self.assertEqual(self.media(result["path"], mime=studio.IMAGE_TYPES[extension]), data)
                self.assertEqual(self.call()["revision"], catalog["revision"])
        before_repeat = self.snapshots()
        repeated = self.upload(guide["id"], ".jpg", filename="安装入口.JPEG")
        self.assertEqual(repeated["alt"], "安装入口")
        self.assertTrue(repeated["path"].endswith(".jpg"))
        self.assertEqual(self.snapshots(), before_repeat)
        for filename in ("image.png", "Screenshot 2026-11-19.png", "12345678.png", "a4f603faa894112b.png"):
            self.assertEqual(self.upload(guide["id"], filename=filename)["alt"], "操作截图")
        cleaned = self.upload(guide["id"], filename="安装[入口](示意)_图.png")
        self.assertEqual(cleaned["alt"], "安装 入口 示意 图")
        self.assertEqual({p: p.read_bytes() for p in initial}, initial)

    def test_reject_invalid_images_ids_and_filenames(self):
        self.seed(1)
        guide_id = self.call()["guides"][0]["id"]
        initial = self.snapshots()
        valid = {"id": guide_id, "filename": "shot.png", "data_base64": base64.b64encode(IMAGES[".png"]).decode()}
        bad = [({"filename": "shot.svg"}, 422), ({"filename": "shot.jpg"}, 422),
               ({"filename": "../shot.png"}, 400), ({"filename": "..\\shot.png"}, 400),
               ({"filename": "C:shot.png"}, 400), ({"filename": "shot\x00.png"}, 400),
               ({"filename": None}, 400), ({"data_base64": []}, 400),
               ({"data_base64": "not base64"}, 400), ({"data_base64": "中文"}, 400),
               ({"data_base64": ""}, 422), ({"id": "no-such-course"}, 404)]
        bad += [({"id": value}, 400) for value in (None, "../outside", "UPPER", "a--b", "a/b", "a\\b", "a%2fb")]
        bad += [({"data_base64": base64.b64encode(data).decode()}, 422)
                for data in (b"plain text", b'<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>',
                             b"\x89PNG\r\n\x1a\n", IMAGES[".png"][:-12])]
        for changes, expected in bad:
            with self.subTest(changes=changes):
                self.assertIn("error", self.call("/upload-image", {**valid, **changes}, expected))
        self.call("/upload-image", [], 400)
        self.assertEqual(self.snapshots(), initial)
        self.assertFalse((self.root / "web/guides-media").exists())

    def test_image_size_boundary_with_base64_request(self):
        self.seed(1)
        guide_id = self.call()["guides"][0]["id"]
        png = IMAGES[".png"]
        padding = b"note\0" + b"a" * (studio.MAX_IMAGE_BYTES - len(png) - 17)
        chunk = b"tEXt" + padding
        data = png[:-12] + struct.pack(">I", len(padding)) + chunk + struct.pack(">I", zlib.crc32(chunk)) + png[-12:]
        self.assertEqual(len(data), studio.MAX_IMAGE_BYTES)
        result = self.upload(guide_id, data=data)
        self.assertEqual((self.root / "web" / result["path"]).read_bytes(), data)
        initial = self.snapshots()
        payload = {"id": guide_id, "filename": "large.png", "data_base64": base64.b64encode(data + b"a").decode()}
        self.assertLess(len(json.dumps(payload).encode()), 8 * 1024 * 1024)
        self.assertIn("5 MB", self.call("/upload-image", payload, 422)["error"])
        self.assertEqual(self.snapshots(), initial)

    def test_media_path_traversal_and_missing_files(self):
        self.seed(1)
        guide_id = self.call()["guides"][0]["id"]
        uploaded = self.upload(guide_id)
        for path in ("guides-media/../data/guides.json", "guides-media/%2e%2e/secret.png",
                     "guides-media/%252e%252e/secret.png", "guides-media/test/..%2fsecret.png",
                     "guides-media/test/%5csecret.png", "guides-media/test/image.svg",
                     "guides-media/test/image.html", "guides-media/test/image.png:secret"):
            with self.subTest(path=path):
                self.media(path, 403)
        self.media(f"guides-media/{guide_id}/missing.png", 404)
        self.assertEqual(self.media(uploaded["path"], mime="image/png"), IMAGES[".png"])
        image_path = self.root / "web" / uploaded["path"]
        original_resolve = Path.resolve

        def outside(path, *args, **kwargs):
            return self.root / "outside.png" if path == image_path else original_resolve(path, *args, **kwargs)

        with patch.object(Path, "resolve", outside):
            self.media(uploaded["path"], 400)
            self.call("/upload-image", {"id": guide_id, "filename": "shot.png",
                                       "data_base64": base64.b64encode(IMAGES[".png"]).decode()}, 400)

    def test_image_markdown_save_delete_and_rollback(self):
        self.seed()
        catalog = self.call()
        first, second = catalog["guides"]
        first_image = self.upload(first["id"])
        second_image = self.upload(second["id"])
        self.assertNotEqual(first_image["path"], second_image["path"])
        self.assertEqual(self.call()["revision"], catalog["revision"])
        markdown = f"图片说明。\n\n![操作截图]({first_image['path']})"
        first["steps"][0]["markdown"] = markdown
        first["steps"][0]["risk_notes"] = []
        saved = self.call("/save", {**first, "revision": catalog["revision"]})
        self.assertIn(markdown, saved["guides"][0]["steps"][0]["markdown"])
        main = (self.root / "data/guides.json").read_bytes()
        self.assertEqual(main, (self.root / "web/data/guides.json").read_bytes())
        self.assertIn(first_image["path"], json.loads(main)["guides"][0]["body_markdown"])
        initial = self.snapshots()

        def failed_build(root):
            (root / "data/guides.json").write_bytes(b"partial")
            raise OSError("模拟构建失败")

        with patch.object(studio.build_guides, "build", failed_build):
            self.call("/delete", {"id": first["id"], "revision": saved["revision"]}, 500)
        self.assertEqual(self.snapshots(), initial)
        deleted = self.call("/delete", {"id": first["id"], "revision": saved["revision"]})
        self.assertFalse((self.root / "web/guides-media" / first["id"]).exists())
        self.assertTrue((self.root / "web" / second_image["path"]).is_file())
        self.media(first_image["path"], 404)
        self.call("/delete", {"id": second["id"], "revision": deleted["revision"]})
        self.assert_empty_outputs()
        self.assertEqual(list((self.root / "web/guides-media").iterdir()), [])

    def test_upload_atomic_write_failure(self):
        self.seed(1)
        guide_id = self.call()["guides"][0]["id"]
        initial = self.snapshots()
        media = self.root / "web/guides-media"
        original_replace = Path.replace

        def failed_replace(path, target):
            if Path(target).is_relative_to(media):
                raise OSError("模拟图片原子写入失败")
            return original_replace(path, target)

        with patch.object(Path, "replace", failed_replace):
            self.assertIn("图片原子写入失败", self.call("/upload-image", {
                "id": guide_id, "filename": "image.png", "data_base64": base64.b64encode(IMAGES[".png"]).decode()}, 500)["error"])
        self.assertEqual(self.snapshots(), initial)
        self.assertEqual(list(media.rglob("*.png")), [])

    def test_media_cleanup_failure_reports_committed_deletion(self):
        self.seed(1)
        catalog = self.call()
        guide = catalog["guides"][0]
        image = self.upload(guide["id"])
        with patch.object(studio.shutil, "rmtree", side_effect=OSError("模拟目录被占用")):
            deleted = self.call("/delete", {"id": guide["id"], "revision": catalog["revision"]})
        self.assertEqual(deleted["guides"], [])
        self.assertIn("课程已删除并同步", deleted["warning"])
        self.assertTrue((self.root / "web" / image["path"]).exists())
        self.assert_empty_outputs()

    def test_upload_host_origin_and_revision_checks(self):
        self.seed(1)
        catalog = self.call()
        guide = catalog["guides"][0]
        payload = {"id": guide["id"], "filename": "image.png", "data_base64": base64.b64encode(IMAGES[".png"]).decode()}
        initial = self.snapshots()
        self.call("/upload-image", payload, 403, {"Host": "untrusted.invalid"})
        self.call("/upload-image", payload, 403, {"Origin": "https://untrusted.invalid"})
        self.call("/upload-image", payload, 415, {"Content-Type": "text/plain"})
        self.call("/upload-image", {**payload, "revision": "stale"}, 409)
        self.assertEqual(self.snapshots(), initial)


class GuidesRadarTest(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.output = self.root / "scraper/guides_updates.md"
        self.now = datetime(2026, 11, 19, 13, 0, tzinfo=timezone.utc)
        self.readme = b"# Tool\n## Installing\nnpm install -g @openai/codex\n## Other\nUnrelated\n"

    def report(self, batches=(), releases=None):
        guides_radar.write_updates(
            batches, self.now, lambda *_: self.readme,
            releases or (lambda *_: SimpleNamespace(entries=[], status=lambda: "成功")),
            lambda text: re.sub(r"([\\`*_\[\]~|])", r"\\\1", text), self.output)
        return self.output.read_text(encoding="utf-8")

    def test_reports_only_link_existing_matching_markdown(self):
        report = self.report()
        self.assertNotIn("../guides/", report)
        for topic in guides_radar.TOPICS:
            self.assertIn("## " + topic["title"], report)
        folder = self.root / "guides"
        folder.mkdir()
        self.assertNotIn("../guides/", self.report())
        (folder / ".gitkeep").write_bytes(b"")
        self.assertNotIn("../guides/", self.report())
        matched = folder / "安装 [auth](new).md"
        matched.write_text("登录教程", encoding="utf-8")
        (folder / "journal.md").write_text("地区与订阅的支付核查", encoding="utf-8")
        (folder / "other.md").write_text("普通笔记", encoding="utf-8")
        (folder / "nested").mkdir()
        (folder / "nested/install.md").write_text("安装", encoding="utf-8")
        sources = {p: p.read_bytes() for p in folder.rglob("*") if p.is_file()}
        report = self.report()
        self.assertIn("../guides/" + quote(matched.name, safe=""), report)
        self.assertIn("../guides/journal.md", report)
        self.assertNotIn("../guides/other.md", report)
        self.assertNotIn("nested/install.md", report)
        self.assertNotIn(".gitkeep", report)
        self.assertEqual(sources, {p: p.read_bytes() for p in folder.rglob("*") if p.is_file()})
        matched.unlink()
        self.assertNotIn(quote(matched.name, safe=""), self.report())

    def test_generic_auth_clues_and_time_window(self):
        def entry(name, hours, kind="issue"):
            return SimpleNamespace(title=f"Other tool OAuth login {name}", body="", source="Community",
                                   url=f"https://example.invalid/{name}", published=self.now - timedelta(hours=hours),
                                   kind=kind)
        current, boundary = entry("current", 1), entry("boundary", 72)
        entries = [entry("old", 73), entry("future", -1), entry("release", 1, "release"),
                   boundary, current, current]
        clues = guides_radar.topic_clues(entries, guides_radar.TOPICS[1]["pattern"], self.now)
        self.assertEqual([item.url for item, _ in clues], [current.url, boundary.url])
        batch = SimpleNamespace(entries=entries, notes=[], status=lambda: "成功")
        report = self.report([("Community", batch)])
        self.assertIn(current.url, report)
        self.assertNotIn("https://example.invalid/old", report)
        self.assertNotIn("https://example.invalid/future", report)

    def test_readme_hash_and_source_failure(self):
        previous = self.report()
        self.assertIn("首次记录", previous)
        self.assertIn("同上次成功采集一致", self.report())
        self.readme = self.readme.replace(b"@openai/codex", b"@openai/codex@latest")
        changed = self.report()
        self.assertIn("已有改动", changed)
        self.assertNotRegex(changed, r"第\s*\d+\s*课")
        marker = re.search(r"<!-- codex-readme-sha256: [0-9a-f]{64} -->", changed)[0]
        with patch.object(guides_radar, "install_sections", side_effect=ValueError("模拟上游不可用")):
            degraded = self.report()
        self.assertIn(marker, degraded)
        self.assertIn("降级，模拟上游不可用", degraded)
        def failed_releases(*_):
            raise OSError("模拟发布源不可用")

        report = self.report(releases=failed_releases)
        self.assertIn("降级 · 模拟发布源不可用", report)
        self.assertNotIn("../guides/", report)


if __name__ == "__main__":
    unittest.main()
