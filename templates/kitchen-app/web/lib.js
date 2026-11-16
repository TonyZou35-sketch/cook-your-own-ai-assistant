// Small helpers shared by the kitchen's pages and every dish's page.

// h('button', { class: 'btn', onclick }, 'Save')  → an element
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

// api('/api/memory', { method: 'POST', body: { text } })   JSON in, JSON out
// api('/api/voice/reference', { method: 'POST', raw: blob }) raw bytes in
export async function api(path, { method = 'GET', body, raw, headers = {} } = {}) {
  const opts = { method, headers: { 'X-Kitchen': '1', ...headers } };
  if (raw !== undefined) opts.body = raw;
  else if (body !== undefined) { opts.body = JSON.stringify(body); opts.headers['Content-Type'] = 'application/json'; }
  const r = await fetch(path, opts);
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!r.ok) throw new Error(data?.error || `${r.status}`);
  return data;
}

// Live updates from the server: on('jobs', fn), on('voice:changed', fn). Returns an "off" function.
const listeners = new Map();
let source = null;
function connect() {
  source = new EventSource('/api/events');
  source.onerror = () => { source.close(); setTimeout(connect, 2000); };
  for (const type of listeners.keys()) attach(type);
}
function attach(type) {
  if (source && !source[`_${type}`]) {
    source[`_${type}`] = true;
    source.addEventListener(type, (e) => {
      let data = {};
      try { data = JSON.parse(e.data); } catch { /* keep {} */ }
      for (const fn of listeners.get(type) || []) fn(data);
    });
  }
}
export function on(type, fn) {
  if (!listeners.has(type)) listeners.set(type, new Set());
  listeners.get(type).add(fn);
  if (!source) connect(); else attach(type);
  return () => listeners.get(type)?.delete(fn);
}

export function toast(text, kind = '') {
  const box = document.getElementById('toasts');
  const t = h('div', { class: `toast ${kind}` }, text);
  box.append(t);
  setTimeout(() => t.classList.add('out'), 4200);
  setTimeout(() => t.remove(), 4800);
}

export const when = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};
