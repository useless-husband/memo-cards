// 極小的 DOM 建立工具。文字一律用 textContent，避免卡片內容造成 XSS。
const PROPS = new Set(['value', 'checked', 'disabled', 'selected', 'hidden', 'open', 'required', 'multiple']);

export function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2).toLowerCase(), v);
    else if (PROPS.has(k)) n[k] = v;
    else n.setAttribute(k, v === true ? '' : v);
  }
  append(n, kids);
  return n;
}

function append(n, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    n.append(k.nodeType ? k : document.createTextNode(String(k)));
  }
}

export function clear(n) {
  while (n.firstChild) n.removeChild(n.firstChild);
  return n;
}

export function download(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = el('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
