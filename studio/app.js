import {el, escapeMarkdownText, imageSource, normalizeLinkUrl, renderMarkdown} from "./markdown.js";

const $ = id => document.getElementById(id);
const editor = $("editor");
const fields = ["title", "track", "summary", "author_note", "related_tags", "order", "updated_at"];
let library, draft = null, currentStep = 0, dirty = false, busy = false;

function status(text, kind = "") {
  $("status").textContent = text;
  $("status").dataset.kind = kind;
}
function error(message) {
  $("message").textContent = message;
  $("message").hidden = !message;
}
function pending(yes) {
  busy = yes;
  $("workspace").inert = yes;
  $("workspace").setAttribute("aria-busy", String(yes));
  for (const button of document.querySelectorAll(".mobile button")) button.disabled = yes;
  editor.inert = yes || !draft;
  $("save").disabled = yes || !draft;
  $("delete").disabled = yes || !draft;
  $("add").disabled = yes || !draft;
  $("new").disabled = yes || !library;
  $("create-form").querySelector(".primary").disabled = yes;
}
async function api(route, payload) {
  const options = payload ? {method: "POST", headers: {"Content-Type": "application/json"},
    body: JSON.stringify({...payload, revision: library.revision})} : {};
  const r = await fetch("/api/guides" + route, options);
  const result = await r.json();
  if (!r.ok) throw new Error(result.error || "本地后台请求失败。");
  return result;
}
function mayLeave() {
  return !dirty || window.confirm("当前课程有未保存的修改，确定放弃这些修改吗？");
}
function markDirty(keepDate = false) {
  if (!dirty && !keepDate) {
    const today = new Date();
    draft.updated_at = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, "0"),
      String(today.getDate()).padStart(2, "0")].join("-");
    editor.elements.updated_at.value = draft.updated_at;
  }
  dirty = true; status("待保存", "dirty"); error(""); preview();
}
function pane(name) {
  $("workspace").dataset.pane = name;
  for (const button of document.querySelectorAll(".mobile button")) {
    button.setAttribute("aria-pressed", String(button.dataset.pane === name));
  }
}
for (const button of document.querySelectorAll(".mobile button")) {
  button.onclick = () => pane(button.dataset.pane);
}
function courseNav() {
  const buttons = library.guides.map(g => {
    const b = el("button"); b.className = "course";
    b.setAttribute("aria-current", String(draft?.id === g.id));
    const num = el("span", String(g.order).padStart(2, "0")); num.className = "ord";
    const info = el("span");
    info.append(el("small", [g.track, g.steps.length + " 步"].filter(Boolean).join(" · ")), el("strong", g.title));
    b.append(num, info);
    b.onclick = () => {
      if (busy) return;
      if (draft?.id !== g.id && !mayLeave()) return;
      if (draft?.id !== g.id) select(g.id);
      pane("edit");
    };
    return b;
  });
  $("courses").replaceChildren(...buttons);
  $("count").textContent = library.guides.length + " 门";
}
function select(id) {
  const guide = library.guides.find(g => g.id === id) || library.guides[0];
  draft = guide ? structuredClone(guide) : null;
  editor.reset();
  if (guide) {
    draft.steps = guide.steps.map(s => ({number: s.number, title: s.title,
      markdown: s.editor_markdown, risk_notes: [...s.risk_notes]}));
    draft.related_tags = guide.related_tags.join(", ");
    for (const key of fields) editor.elements[key].value = draft[key];
  }
  currentStep = 0; dirty = false; error(""); status("已同步");
  $("filelabel").textContent = guide ? guide.source_file.split("/").pop() : "";
  $("empty").hidden = !!draft;
  pending(busy);
  courseNav(); drawSteps(); preview(); referenceTab(false);
  $("updates").replaceChildren();
  renderMarkdown($("updates"), library.updates || "暂无采集线索。");
  document.querySelector(".edit").scrollTop = 0;
}
function btn(title, handler, className = "") {
  const b = el("button", title); b.type = "button"; b.className = className;
  b.onclick = handler; return b;
}
function input(label, value, multiline, change, rows) {
  const field = el("label", label);
  const control = el(multiline ? "textarea" : "input");
  if (multiline) control.rows = rows;
  control.value = value;
  control.oninput = () => { change(control.value); markDirty(); };
  field.append(control); return {field, control};
}
function reposition(i, offset) {
  const j = i + offset;
  [draft.steps[i], draft.steps[j]] = [draft.steps[j], draft.steps[i]];
  currentStep = j; drawSteps(); markDirty(); focusStep(j);
}
function focusStep(i) {
  $("steps").children[i]?.querySelector("input")?.focus();
}
function readImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("无法读取图片，请重新选择文件。"));
    reader.onabort = () => reject(new Error("图片读取已取消。"));
    reader.onload = () => {
      const result = typeof reader.result === "string" && reader.result.match(/^data:[^,]*;base64,([A-Za-z0-9+/]+={0,2})$/);
      if (!result || result[1].length % 4 !== 0) {
        reject(new Error("图片读取格式不正确，请重新选择文件。"));
      } else resolve(result[1]);
    };
    reader.readAsDataURL(file);
  });
}

async function uploadImage(files, step, textarea, feedback) {
  if (busy || !draft || !draft.steps.includes(step) || !textarea.isConnected) return;
  const guide = draft, original = textarea.value;
  let start = textarea.selectionStart, end = textarea.selectionEnd, direction = textarea.selectionDirection;
  pending(true); error("");
  textarea.classList.remove("drag-over");
  textarea.classList.add("uploading");
  textarea.setAttribute("aria-busy", "true");
  try {
    if (files.length > 1) throw new Error("每次只能插入一张图片，本次未上传任何文件，请逐张操作。");
    const file = files[0];
    if (!file) throw new Error("未能读取图片文件，请使用「插入图片」重新选择。");
    if (!/\.(?:png|jpe?g|gif|webp)$/i.test(file.name) ||
      (file.type && !["image/png", "image/jpeg", "image/gif", "image/webp"].includes(file.type))) {
      throw new Error("仅支持 PNG、JPEG、GIF、WebP 图片，请检查文件类型和扩展名。");
    }
    if (!file.size || file.size > 5 * 1024 * 1024) throw new Error("请选择非空且不超过 5 MB 的图片。");
    feedback.textContent = "正在读取图片…"; status("正在读取图片", "busy");
    const data_base64 = await readImage(file);
    feedback.textContent = "正在上传图片…"; status("正在上传图片", "busy");
    const result = await api("/upload-image", {id: guide.id, filename: file.name, data_base64});
    if (!result || typeof result.path !== "string" || typeof result.alt !== "string" ||
      !result.path.startsWith("guides-media/" + guide.id + "/") || imageSource(result.path) !== "/" + result.path) {
      throw new Error("后台返回的图片信息无效，请重新选择图片。");
    }
    if (draft !== guide || !guide.steps.includes(step) || !textarea.isConnected || textarea.value !== original) {
      throw new Error("当前草稿已变化，未插入图片，请在目标步骤重试。");
    }
    const before = original.slice(0, start), after = original.slice(end);
    const prefix = !before || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
    const suffix = after.startsWith("\n\n") ? "" : after.startsWith("\n") ? "\n" : "\n\n";
    const alt = escapeMarkdownText(result.alt);
    const insertion = prefix + "![" + alt + "](" + result.path + ")" + suffix;
    textarea.setRangeText(insertion, start, end, "end");
    start += insertion.length; end = start; direction = "none";
    step.markdown = textarea.value;
    currentStep = guide.steps.indexOf(step);
    referenceTab(false); markDirty();
    feedback.textContent = "图片已插入，保存后同步。";
  } catch (e) {
    error("图片插入失败：" + (e.message || "请稍后重试。") + " 正文未修改。");
    status("图片插入失败", "error");
    feedback.textContent = "未插入图片，请重试。";
  } finally {
    pending(false);
    textarea.classList.remove("uploading", "drag-over");
    textarea.removeAttribute("aria-busy");
    if (draft === guide && textarea.isConnected) {
      textarea.focus({preventScroll: true});
      textarea.setSelectionRange(start, end, direction);
    }
  }
}

function hasFiles(data) {
  return !!data && (data.files?.length > 0 || Array.from(data.types || []).includes("Files") ||
    Array.from(data.items || []).some(item => item.kind === "file"));
}

function transferredFiles(data) {
  const files = Array.from(data.files || []);
  const items = Array.from(data.items || []).filter(item => item.kind === "file");
  return items.length > files.length ? items.map(item => item.getAsFile()) : files;
}

let linkTarget = null;
function linkError(message) {
  $("link-error").textContent = message;
  $("link-error").hidden = !message;
  if (message) $("link-url").setAttribute("aria-invalid", "true");
  else $("link-url").removeAttribute("aria-invalid");
}
function validLinkTarget(target) {
  if (!target || busy || draft !== target.guide) return false;
  const index = draft.steps.indexOf(target.step);
  return index >= 0 && target.textarea.isConnected &&
    $("steps").children[index]?.contains(target.textarea) &&
    target.textarea.value === target.original && target.step.markdown === target.original;
}
function openLinkDialog(step, textarea, feedback) {
  if (busy || !draft || $("create-dialog").open || $("link-dialog").open) return;
  const target = {guide: draft, step, textarea, feedback, original: textarea.value,
    start: textarea.selectionStart, end: textarea.selectionEnd, direction: textarea.selectionDirection};
  if (!validLinkTarget(target)) return;
  linkTarget = target;
  $("link-form").reset(); linkError(""); $("link-dialog").showModal();
}
$("link-url").oninput = () => linkError("");
$("link-cancel").onclick = () => $("link-dialog").close();
$("link-dialog").addEventListener("close", () => {
  const target = linkTarget;
  linkTarget = null;
  if (!validLinkTarget(target)) return;
  target.textarea.focus({preventScroll: true});
  target.textarea.setSelectionRange(target.start, target.end, target.direction);
});
$("link-form").onsubmit = e => {
  e.preventDefault();
  const target = linkTarget;
  if (!validLinkTarget(target)) {
    linkError("目标步骤或正文已变化，未插入链接。请取消后在目标步骤重新操作。");
    return;
  }
  const href = normalizeLinkUrl($("link-url").value);
  if (!href) {
    linkError($("link-url").value ?
      "网址无效。请填写 HTTP(S) 网址或完整域名；不支持其他协议、空格、控制字符、用户信息或反斜杠。" :
      "请填写目标网址，例如 example.com。");
    $("link-url").focus();
    return;
  }
  const label = escapeMarkdownText($("link-text").value.trim());
  const content = label ? "[" + label + "](" + href + ")" : href;
  const {textarea, step, original, start, end} = target;
  const before = original.slice(0, start), after = original.slice(end);
  let prefix = "", suffix = "";
  if ($("link-standalone").checked) {
    prefix = !before || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
    suffix = !after || after.startsWith("\n\n") ? "" : after.startsWith("\n") ? "\n" : "\n\n";
  }
  const insertion = prefix + content + suffix;
  textarea.setRangeText(insertion, start, end, "end");
  step.markdown = textarea.value;
  target.original = textarea.value;
  target.start = target.end = start + insertion.length;
  target.direction = "none";
  currentStep = draft.steps.indexOf(step);
  referenceTab(false);
  if (textarea.value !== original) markDirty();
  else preview();
  target.feedback.textContent = "链接已插入，保存后同步。";
  $("link-dialog").close();
};

function drawSteps() {
  const steps = draft?.steps || [];
  $("step-count").textContent = steps.length + " 步";
  $("steps").replaceChildren(...steps.map((s, i) => {
    const card = el("section"); card.className = "step";
    card.addEventListener("focusin", () => { if (currentStep !== i) { currentStep = i; preview(); } });
    const head = el("div"); head.className = "heading-row";
    const seq = el("span", "STEP " + String(i + 1).padStart(2, "0")); seq.className = "sequence";
    const tools = el("div"); tools.className = "tools";
    const up = btn("上移", () => reposition(i, -1)), down = btn("下移", () => reposition(i, 1));
    up.disabled = i === 0; down.disabled = i === draft.steps.length - 1;
    const remove = btn("删除此步", () => {
      if (!confirm("从草稿移除第 " + (i + 1) + " 步？保存后生效。")) return;
      draft.steps.splice(i, 1); currentStep = Math.min(i, draft.steps.length - 1);
      drawSteps(); markDirty(); focusStep(currentStep);
    });
    remove.disabled = draft.steps.length <= 1;
    tools.append(up, down, remove); head.append(seq, tools);
    const title = input("步骤标题", s.title, false, v => s.title = v);
    title.control.placeholder = "可选，简要概括这一步";
    const body = input("步骤正文", s.markdown, true, v => s.markdown = v, 7);
    body.control.placeholder = "可选，支持 Markdown、链接、图片与代码块";
    const insert = btn("插入终端代码块", () => {
      const t = body.control;
      const at = t.selectionStart, end = t.selectionEnd;
      const snippet = t.value.slice(at, end) || "在这里填写命令";
      const prefix = (at && !t.value.slice(0, at).endsWith("\n\n") ? "\n\n" : "") + "```bash\n";
      t.setRangeText(prefix + snippet + "\n```\n", at, end, "end");
      t.focus(); t.setSelectionRange(at + prefix.length, at + prefix.length + snippet.length);
      s.markdown = t.value; markDirty();
    }, "insert");
    const imageTools = el("div"); imageTools.className = "insert-tools";
    const picker = el("input"); picker.type = "file"; picker.hidden = true;
    picker.accept = "image/png,image/jpeg,image/webp,image/gif";
    const feedback = el("span"); feedback.className = "image-status";
    feedback.setAttribute("role", "status");
    const imageHint = el("p", "可在光标处粘贴或拖入一张图片；支持 PNG、JPEG、GIF、WebP，不超过 5 MB。");
    imageHint.className = "image-hint"; imageHint.id = "image-hint-" + i;
    body.control.setAttribute("aria-describedby", imageHint.id);
    const insertImage = btn("插入图片", () => { if (!busy) picker.click(); }, "insert");
    const insertLink = btn("插入链接", () => openLinkDialog(s, body.control, feedback), "insert");
    insertLink.setAttribute("aria-haspopup", "dialog");
    insertLink.setAttribute("aria-controls", "link-dialog");
    picker.onchange = () => {
      const files = Array.from(picker.files || []);
      picker.value = "";
      if (files.length) uploadImage(files, s, body.control, feedback);
    };
    body.control.onpaste = e => {
      if (!hasFiles(e.clipboardData)) return;
      e.preventDefault();
      uploadImage(transferredFiles(e.clipboardData), s, body.control, feedback);
    };
    body.control.ondragenter = body.control.ondragover = e => {
      if (!hasFiles(e.dataTransfer)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = busy ? "none" : "copy";
      if (!busy) body.control.classList.add("drag-over");
    };
    body.control.ondragleave = body.control.ondragend = () => body.control.classList.remove("drag-over");
    body.control.ondrop = e => {
      body.control.classList.remove("drag-over");
      if (!hasFiles(e.dataTransfer)) return;
      e.preventDefault();
      uploadImage(transferredFiles(e.dataTransfer), s, body.control, feedback);
    };
    imageTools.append(insert, insertImage, insertLink, picker, feedback);
    card.append(head, title.field, body.field, imageTools, imageHint);
    const risks = el("div");
    const riskFields = () => {
      risks.replaceChildren();
      if (!s.risk_notes.length) s.risk_notes.push("");
      s.risk_notes.forEach((note, n) => {
        const f = input(n ? "风险提示 " + (n + 1) : "风险提示（可选）",
          note, true, v => s.risk_notes[n] = v, 2);
        f.control.placeholder = "可选，仅在需要提醒时填写";
        risks.append(f.field);
      });
    };
    riskFields();
    card.append(risks, btn("添加另一条提示", () => {
      s.risk_notes.push(""); riskFields(); risks.lastElementChild.querySelector("textarea").focus();
    }, "insert"));
    return card;
  }));
}
function preview() {
  if (!draft) {
    $("preview-track").textContent = "";
    $("preview-title").textContent = "还没有课程";
    $("preview-summary").textContent = "点击「＋ 新建课程」，从头创建第 1 课。";
    $("position").textContent = "0 步";
    $("prev").disabled = true; $("next").disabled = true;
    $("preview-step").textContent = "";
    $("preview-body").replaceChildren();
    return;
  }
  const s = draft.steps[currentStep];
  $("preview-track").textContent = draft.track.trim();
  $("preview-title").textContent = draft.title.trim();
  $("preview-summary").textContent = draft.summary.trim();
  $("position").textContent = "第 " + (currentStep + 1) + " / " + draft.steps.length + " 步";
  $("prev").disabled = currentStep === 0; $("next").disabled = currentStep === draft.steps.length - 1;
  $("preview-step").textContent = s.title.trim();
  renderMarkdown($("preview-body"), s.markdown);
  const notes = s.risk_notes.filter(n => n.trim());
  if (!s.markdown.trim() && !notes.length) {
    const empty = el("p", "本步骤正文暂为空"); empty.className = "preview-empty";
    $("preview-body").append(empty);
  }
  for (const note of notes) {
    $("preview-body").append(el("blockquote", "风险提示：" + note));
  }
}
function referenceTab(updates) {
  $("preview").hidden = updates; $("updates").hidden = !updates;
  $("preview-tab").setAttribute("aria-pressed", String(!updates));
  $("updates-tab").setAttribute("aria-pressed", String(updates));
}
$("preview-tab").onclick = () => referenceTab(false);
$("updates-tab").onclick = () => referenceTab(true);
$("prev").onclick = () => { if (currentStep > 0) { currentStep--; preview(); } };
$("next").onclick = () => { if (currentStep < draft.steps.length - 1) { currentStep++; preview(); } };
for (const key of fields) {
  editor.elements[key].addEventListener("input", e => {
    draft[key] = key === "order" ? e.target.valueAsNumber : e.target.value;
    markDirty(key === "updated_at");
  });
}
$("add").onclick = () => {
  draft.steps.push({title: "", markdown: "", risk_notes: []}); currentStep = draft.steps.length - 1;
  drawSteps(); markDirty(); focusStep(currentStep);
};
async function mutate(route, payload) {
  if (busy) return;
  pending(true); error(""); status("正在同步");
  try {
    const data = await api(route, payload);
    library = data;
    if ($("create-dialog").open) $("create-dialog").close();
    select(data.active_id); status("已同步"); pane("edit");
    if (data.warning) error(data.warning);
  } catch (e) {
    if ($("create-dialog").open) $("create-dialog").close();
    error(e.message); status("同步失败", "error");
  } finally { pending(false); }
}
editor.onsubmit = e => {
  e.preventDefault();
  if (busy || !draft || $("create-dialog").open || $("link-dialog").open) return;
  const payload = {id: draft.id};
  for (const key of fields) payload[key] = draft[key];
  payload.steps = draft.steps.map(s => ({...s, risk_notes: s.risk_notes.filter(n => n.trim())}));
  mutate("/save", payload);
};
$("new").onclick = () => {
  if (busy || !mayLeave()) return;
  $("create-form").reset(); $("create-dialog").showModal();
};
$("cancel").onclick = () => $("create-dialog").close();
$("create-form").onsubmit = e => {
  e.preventDefault(); mutate("/create", Object.fromEntries(new FormData(e.target)));
};
$("delete").onclick = () => {
  if (confirm("确定删除《" + draft.title + "》的本地源文件及上传图片，并同步到网页吗？")) {
    mutate("/delete", {id: draft.id});
  }
};
async function load() {
  if (busy || !mayLeave()) return;
  pending(true); status("正在读取"); error("");
  try {
    library = await api(""); select(draft?.id); pane("edit");
  } catch (e) { error(e.message); status("读取失败", "error"); }
  finally { pending(false); }
}
$("reload").onclick = load;
window.addEventListener("beforeunload", e => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });
window.addEventListener("keydown", e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
    e.preventDefault();
    if (draft && !busy && !$("create-dialog").open && !$("link-dialog").open) editor.requestSubmit();
  }
});
pane("edit"); load();
