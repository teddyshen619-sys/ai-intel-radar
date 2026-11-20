// 仅使用文本节点渲染本地 Markdown；浏览器不执行文稿中的 HTML。
export function el(tag, text) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

function externalUrl(value, forImage = false) {
  if (typeof value !== "string") return "";
  const unsafe = /[\s\\<>"'`\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f]/u;
  const authority = /^https?:\/\/([^/?#]+)/i.exec(value);
  if (!authority || /[@%]/.test(authority[1]) || unsafe.test(value)) return "";
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password) return "";
    const host = url.hostname.replace(/\.$/, "");
    if (!host.startsWith("[") && (host.length > 253 || !host.split(".").every(part =>
      /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(part)))) return "";
    if (!forImage) return url.href;
    let decoded = url.pathname + url.search + url.hash;
    for (let depth = 0; depth < 6; depth++) {
      const next = decodeURIComponent(decoded);
      if (unsafe.test(next) || /\.svgz?(?:$|[/?#;.])/i.test(next)) return "";
      if (next === decoded) return url.href;
      decoded = next;
    }
  } catch {}
  return "";
}

export function normalizeLinkUrl(value) {
  if (typeof value !== "string") return "";
  let href = externalUrl(value);
  if (!href) {
    if (!/^[^:/?#]+(?::\d{1,5})?(?:[/?#]|$)/u.test(value)) return "";
    href = externalUrl("https://" + value);
    if (!href) return "";
    const parts = new URL(href).hostname.replace(/\.$/, "").split(".");
    if (parts.length < 2 || !/^(?:[a-z]{2,63}|xn--[a-z0-9-]+)$/i.test(parts.at(-1))) return "";
  }
  // 仅编码路径、查询和片段，保留 IPv6 authority；末尾句读也需保护，避免裸链被截短。
  const url = new URL(href);
  const encode = part => part.replace(/[()[\]*_!|]|[.,;:?]+$/g, text =>
    Array.from(text, char => "%" + char.charCodeAt(0).toString(16).toUpperCase()).join(""));
  url.pathname = encode(url.pathname);
  url.search = url.search ? "?" + encode(url.search.slice(1)) : "";
  url.hash = url.hash ? "#" + encode(url.hash.slice(1)) : "";
  return url.href;
}

export function escapeMarkdownText(value) {
  return value.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, " ")
    .replace(/[\\[\]()`*_!|<>]/g, "\\$&");
}

export function imageSource(path) {
  if (typeof path !== "string") return "";
  if (path.startsWith("guides-media/")) {
    if (path.includes("..") || /[\\%]/.test(path) ||
      !/^guides-media\/(?:[A-Za-z0-9_-]+\/)+[A-Za-z0-9_.-]+\.(?:png|jpe?g|gif|webp)$/i.test(path)) return "";
    return "/" + path;
  }
  return externalUrl(path, true);
}

function unescapeMarkdown(text) {
  return text.replace(/\\([\\[\]()`*_!|<>])/g, "$1");
}

function image(alt, path) {
  const src = imageSource(path);
  if (!src) return null;
  const img = el("img");
  img.alt = unescapeMarkdown(alt);
  img.src = src;
  img.loading = "lazy";
  img.decoding = "async";
  img.referrerPolicy = "no-referrer";
  return img;
}

function externalLink(text, href) {
  const link = el("a", text || href);
  link.href = href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  return link;
}

function trimUrlEnd(value) {
  const pairs = {")": "(", "]": "[", "}": "{", "）": "（", "】": "【", "》": "《", "」": "「", "』": "『"};
  const balance = Object.fromEntries(Object.values(pairs).map(char => [char, 0]));
  for (const char of value) {
    if (Object.hasOwn(balance, char)) balance[char]++;
    else if (Object.hasOwn(pairs, char)) balance[pairs[char]]--;
  }
  let end = value.length;
  while (end) {
    const char = value[end - 1];
    if (/[.,!?;:，。！？；：、…“”‘’]/u.test(char)) { end--; continue; }
    if (Object.hasOwn(pairs, char) && balance[pairs[char]] < 0) {
      balance[pairs[char]]++; end--; continue;
    }
    break;
  }
  return value.slice(0, end);
}

function inline(node, text) {
  // 将裸网址作为完整 token：代码、已有链接和图片先消费，避免二次嵌套。
  const pattern = /\\([\\[\]()`*_!|<>])|(?<!`)(`+)(?!`)([\s\S]*?)(?<!`)\2(?!`)|\*\*([^*]+)\*\*|(!?)\[((?:\\.|[^\]\\])*)\]\(<?([^)\s<>]+)>?\)|(https?:\/\/[^\s<>"'`\\\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f，。！？；：、…“”‘’]+)/giu;
  let start = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > start) node.append(text.slice(start, match.index));
    if (match[1] !== undefined) node.append(match[1]);
    else if (match[2]) node.append(el("code", match[3]));
    else if (match[4]) {
      const bold = el("strong");
      inline(bold, match[4]);
      node.append(bold);
    } else if (match[8]) {
      const text = trimUrlEnd(match[8]), href = externalUrl(text);
      if (href) {
        node.append(externalLink(text, href));
        if (text.length < match[8].length) node.append(match[8].slice(text.length));
      } else node.append(match[0]);
    } else if (match[5]) {
      node.append(image(match[6], match[7]) || match[0]);
    } else {
      const href = externalUrl(match[7]);
      node.append(href ? externalLink(unescapeMarkdown(match[6]), href) : match[0]);
    }
    start = match.index + match[0].length;
  }
  if (start < text.length) node.append(text.slice(start));
}

function standaloneLink(line) {
  if (!/^(?:https?:\/\/|\[)/i.test(line)) return null;
  const row = el("p"); inline(row, line);
  const [link, ...rest] = row.childNodes;
  if (link?.tagName !== "A" || rest.some(node => node.nodeType !== 3 ||
    !/^[\s.,!?;:，。！？；：、…“”‘’)\]}）】》」』]*$/u.test(node.textContent))) return null;
  const label = el("span", row.textContent); label.className = "link-label";
  const action = el("span", "打开网站"); action.className = "link-action";
  link.replaceChildren(label, action);
  row.className = "link-entry"; row.replaceChildren(link);
  return row;
}

export function renderMarkdown(target, value) {
  const lines = value.replace(/\r\n/g, "\n").split("\n");
  const out = document.createDocumentFragment();
  let i = 0, block = null, list = "", comment = false;
  function reset() { block = null; list = ""; }
  while (i < lines.length) {
    let line = lines[i++];
    // 注释只在正文中解析，围栏内的注释示例应原样显示。
    if (comment) {
      if (!line.includes("-->")) continue;
      line = line.slice(line.indexOf("-->") + 3);
      comment = false;
    }
    line = line.replace(/<!--.*?-->/g, "");
    if (line.includes("<!--")) { line = line.split("<!--")[0]; comment = true; }
    if (!line.trim()) { reset(); continue; }
    const opening = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (opening) {
      const code = [], marker = opening[1];
      const close = new RegExp("^ {0,3}" + marker[0] + "{" + marker.length + ",}\\s*$");
      while (i < lines.length && !close.test(lines[i])) code.push(lines[i++]);
      i++;
      const pre = el("pre"); pre.append(el("code", code.join("\n"))); out.append(pre);
      reset(); continue;
    }
    const standalone = line.trim().match(/^!\[((?:\\.|[^\]\\])*)\]\(<?([^)\s<>]+)>?\)$/);
    if (standalone) {
      const img = image(standalone[1], standalone[2]);
      if (img) {
        const figure = el("figure"); figure.append(img);
        if (img.alt) figure.append(el("figcaption", img.alt));
        out.append(figure); reset(); continue;
      }
    }
    const linkRow = standaloneLink(line.trim());
    if (linkRow) { out.append(linkRow); reset(); continue; }
    if (/^\s*\|/.test(line) && /^\s*\|? *:?-{3,}/.test(lines[i] || "")) {
      const table = el("table");
      function row(text, tag) {
        const tr = el("tr");
        for (const cell of text.trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/)) {
          const td = el(tag); inline(td, cell.trim()); tr.append(td);
        }
        table.append(tr);
      }
      row(line, "th"); i++;
      while (i < lines.length && /^\s*\|/.test(lines[i])) row(lines[i++], "td");
      out.append(table); reset(); continue;
    }
    const heading = line.match(/^#{1,6}\s+(.+)/);
    if (heading) {
      const h = el("h3");
      inline(h, heading[1].replace(/\[([^\]]+)\]\(\.\.\/guides\/[^)]+\)/g, "$1"));
      out.append(h); reset(); continue;
    }
    if (/^>\s?/.test(line)) {
      const quote = el("blockquote"); const parts = [line.replace(/^>\s?/, "")];
      while (i < lines.length && /^>\s?/.test(lines[i])) parts.push(lines[i++].replace(/^>\s?/, ""));
      inline(quote, parts.join(" ")); out.append(quote); reset(); continue;
    }
    const item = line.match(/^\s*([-*+]|\d+\.)\s+(.*)/);
    if (item) {
      const type = /^\d/.test(item[1]) ? "ol" : "ul";
      if (type !== list) { block = el(type); list = type; out.append(block); }
      const li = el("li"); inline(li, item[2]); block.append(li); continue;
    }
    if (!block || list) { block = el("p"); list = ""; out.append(block); }
    else block.append(" ");
    inline(block, line);
  }
  target.replaceChildren(out);
}
