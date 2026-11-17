// The kitchen's shell: sidebar, home, memory, settings, and each dish's page (dishes/<id>/page.js).
import { api, h, on, toast, when } from './lib.js';

const page = document.getElementById('page');
const nav = document.getElementById('nav');
let dishes = [];
let cleanup = [];

const RULES = [
  ['Nothing is remembered until you confirm it.', 'Suggestions wait in Memory for your yes.'],
  ['Steps that can’t be undone are your click.', 'Send, submit, pay, publish, delete: the kitchen prepares, you press.'],
  ['When unsure, it asks.', 'Questions wait on the home page instead of guesses.'],
  ['Your data stays on this computer.', 'Dishes use the AI model on this machine only.'],
  ['On other people’s sites, it reads and prepares.', 'It doesn’t act for you in bulk, and it follows each site’s rules.'],
  ['What the AI made is labelled.', 'A cloned voice or a draft always says so.'],
];

function greeting() {
  const hr = new Date().getHours();
  return hr < 5 ? 'Still up' : hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
}

async function loadNav() {
  dishes = await api('/api/dishes');
  for (const d of dishes) {
    if (d.css && !document.querySelector(`link[data-dish="${d.id}"]`)) {
      document.head.append(h('link', { rel: 'stylesheet', href: `/dishes/${d.id}/page.css`, 'data-dish': d.id }));
    }
  }
  const link = (href, icon, label, extra) => h('a', { href, class: 'nav-item', 'data-href': href }, h('span', { class: 'nav-icon' }, icon), h('span', {}, label), extra || null);
  nav.replaceChildren(
    link('#/home', '⌂', 'Home'),
    h('div', { class: 'nav-label' }, 'Dishes'),
    ...(dishes.length ? dishes.map((d) => link(`#/dish/${d.id}`, d.icon, d.title)) : [h('div', { class: 'nav-empty' }, 'No dishes yet')]),
    h('div', { class: 'nav-label' }, 'Kitchen'),
    link('#/memory', '✎', 'Memory', h('span', { class: 'badge', id: 'mem-badge', hidden: true })),
    link('#/settings', '⚙', 'Settings'),
  );
  markNav();
}

function markNav() {
  const hash = location.hash || '#/home';
  for (const a of nav.querySelectorAll('.nav-item')) a.classList.toggle('on', hash.startsWith(a.dataset.href));
}

async function refreshBadges() {
  try {
    const items = await api('/api/memory');
    const n = items.filter((i) => i.status === 'pending').length;
    const b = document.getElementById('mem-badge');
    if (b) { b.hidden = !n; b.textContent = n; }
  } catch { /* the next event will try again */ }
}

function modelDot(m) {
  const el = document.getElementById('model-dot');
  el.className = `side-foot ${m.ok ? 'ok' : 'off'}`;
  el.textContent = m.ok ? `${m.app} · ${m.model}` : 'AI model not answering';
}

// ---------- home ----------
async function home() {
  const data = await api('/api/home');
  modelDot(data.model);
  document.getElementById('brand-name').textContent = data.name || 'My Kitchen';
  document.title = data.name || 'My Kitchen';
  const jobsBox = h('div', { class: 'list' });
  const drawJobs = (jobs) => {
    const live = jobs.filter((j) => j.status === 'running' || j.status === 'queued');
    const recent = jobs.filter((j) => !live.includes(j)).slice(0, 4);
    jobsBox.replaceChildren(...(live.length || recent.length ? [...live, ...recent].map(jobRow) : [h('p', { class: 'muted' }, 'Nothing cooking right now.')]));
  };
  drawJobs(data.jobs);
  cleanup.push(on('jobs', async () => drawJobs((await api('/api/home')).jobs)));

  page.replaceChildren(
    h('header', { class: 'hello' }, h('h1', {}, `${greeting()}.`), h('p', { class: 'muted' }, 'Your kitchen runs on this computer. Here is what needs you.')),
    h('section', { class: 'card' },
      h('h2', {}, 'Waiting for you'),
      data.waiting.length
        ? h('div', { class: 'list' }, data.waiting.map((w) => h('a', { class: 'row link', href: w.open }, h('div', {}, h('div', { class: 'row-title' }, w.title), w.detail ? h('div', { class: 'muted small' }, w.detail) : null), h('span', { class: 'chev' }, '›'))))
        : h('p', { class: 'muted' }, 'All clear. Nothing needs a decision.')),
    h('section', { class: 'card' }, h('h2', {}, 'Cooking'), jobsBox),
    h('section', { class: 'card' },
      h('h2', {}, 'Your dishes'),
      dishes.length
        ? h('div', { class: 'grid' }, dishes.map((d) => h('a', { class: 'dish-tile', href: `#/dish/${d.id}` }, h('div', { class: 'tile-icon' }, d.icon), h('div', { class: 'row-title' }, d.title), h('div', { class: 'muted small' }, d.about))))
        : h('p', { class: 'muted' }, 'No dishes yet. Ask your cook for the first one.')),
    modelCard(data.model),
  );
}

function jobRow(j) {
  const pct = Math.round((j.progress || 0) * 100);
  const state = { queued: 'Waiting its turn', running: j.detail || 'Cooking…', done: `Done ${when(j.endedAt)}`, failed: `Failed: ${j.error}`, cancelled: 'Cancelled' }[j.status];
  return h('div', { class: `row job ${j.status}` },
    h('div', { class: 'grow' }, h('div', { class: 'row-title' }, j.title), h('div', { class: 'muted small' }, state),
      j.status === 'running' ? h('div', { class: 'bar' }, h('i', { style: { width: `${pct}%` } })) : null),
    j.status === 'running' || j.status === 'queued' ? h('button', { class: 'btn ghost small', onclick: async () => { await api(`/api/jobs/${j.id}/cancel`, { method: 'POST' }); } }, 'Stop') : null);
}

function modelCard(m) {
  const out = h('p', { class: 'muted small' });
  const tryBtn = h('button', {
    class: 'btn small',
    onclick: async () => {
      tryBtn.disabled = true;
      out.textContent = 'Asking the model…';
      try { const r = await api('/api/model/try', { method: 'POST' }); out.textContent = `“${r.text}” (${r.sec.toFixed(1)} s)`; } catch (e) { out.textContent = e.message; }
      tryBtn.disabled = false;
    },
  }, 'Say hello');
  return h('section', { class: 'card' },
    h('h2', {}, 'The AI model on this computer'),
    m.ok
      ? h('div', {}, h('p', {}, h('b', {}, m.model), ` through ${m.app}`,
          m.loaded === false ? h('span', { class: 'muted small' }, ' · not loaded yet, so the first answer takes longer') : null), tryBtn, out)
      : h('div', {}, h('p', {}, m.problem === 'no-model' ? `${m.app} is running, but no model is downloaded or loaded.` : 'No local model app is answering.'),
          h('p', { class: 'muted small' }, 'Open LM Studio and start its server (Developer → Start Server), or start Ollama. Then come back here.')));
}

// ---------- memory ----------
async function memory() {
  const items = await api('/api/memory');
  const pending = items.filter((i) => i.status === 'pending');
  const kept = items.filter((i) => i.status === 'confirmed');
  const input = h('input', { class: 'input', placeholder: 'Something your assistant should know about you…', maxlength: 500 });
  const add = async () => {
    if (!input.value.trim()) return;
    await api('/api/memory', { method: 'POST', body: { text: input.value } });
    input.value = '';
    memory();
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });

  const itemRow = (i) => {
    const text = h('div', { class: 'grow' }, h('div', {}, i.text), h('div', { class: 'muted small' }, `${i.source === 'you' ? 'You wrote this' : `Suggested by ${i.source}`} · ${when(i.createdAt)}`));
    const edit = () => {
      const box = h('input', { class: 'input', value: i.text, maxlength: 500 });
      const save = async () => { await api(`/api/memory/${i.id}`, { method: 'PUT', body: { text: box.value } }); memory(); };
      box.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
      text.replaceChildren(box);
      box.focus();
    };
    return h('div', { class: 'row' }, text,
      i.status === 'pending' ? h('button', { class: 'btn small', onclick: async () => { await api(`/api/memory/${i.id}/confirm`, { method: 'POST' }); memory(); } }, 'Keep') : null,
      h('button', { class: 'btn ghost small', onclick: edit }, 'Edit'),
      h('button', { class: 'btn ghost small', onclick: async () => { await api(`/api/memory/${i.id}`, { method: 'DELETE' }); memory(); } }, i.status === 'pending' ? 'Drop' : 'Forget'));
  };

  // (replaceChildren would print a null as the text "null", so leave it out instead)
  page.replaceChildren(...[
    h('header', { class: 'hello' }, h('h1', {}, 'Memory'), h('p', { class: 'muted' }, 'What your assistant knows about you. Dishes can only suggest; nothing is kept until you say yes.')),
    pending.length ? h('section', { class: 'card accent' }, h('h2', {}, `Suggestions (${pending.length})`), h('div', { class: 'list' }, pending.map(itemRow))) : null,
    h('section', { class: 'card' }, h('h2', {}, 'Tell it something'), h('div', { class: 'inline' }, input, h('button', { class: 'btn', onclick: add }, 'Remember'))),
    h('section', { class: 'card' }, h('h2', {}, `Remembered (${kept.length})`), kept.length ? h('div', { class: 'list' }, kept.map(itemRow)) : h('p', { class: 'muted' }, 'Nothing yet.')),
  ].filter(Boolean));
  refreshBadges();
}

// ---------- settings ----------
async function settings() {
  const [m, homeData] = await Promise.all([api('/api/model'), api('/api/home')]);
  const name = h('input', { class: 'input', value: homeData.name || '', placeholder: 'My Kitchen', maxlength: 40 });
  const pick = h('select', { class: 'input' }, m.models.map((id) => h('option', { value: id, selected: id === m.model }, id)));
  page.replaceChildren(
    h('header', { class: 'hello' }, h('h1', {}, 'Settings')),
    h('section', { class: 'card' }, h('h2', {}, 'Name'), h('div', { class: 'inline' }, name, h('button', { class: 'btn', onclick: async () => { await api('/api/name', { method: 'PUT', body: { name: name.value } }); toast('Saved'); home(); location.hash = '#/home'; } }, 'Save'))),
    h('section', { class: 'card' }, h('h2', {}, 'Model'),
      m.ok ? h('div', { class: 'inline' }, pick, h('button', { class: 'btn', onclick: async () => { await api('/api/model', { method: 'PUT', body: { id: pick.value } }); toast('The dishes will use this model'); } }, 'Use this one'))
        : h('p', { class: 'muted' }, 'No local model app is answering right now.')),
    h('section', { class: 'card' }, h('h2', {}, 'Kitchen rules'), h('p', { class: 'muted small' }, 'Every dish in this kitchen follows these.'),
      h('ol', { class: 'rules' }, RULES.map(([a, b]) => h('li', {}, h('b', {}, a), ' ', h('span', { class: 'muted' }, b))))),
  );
}

// ---------- a dish ----------
async function dish(id) {
  const d = dishes.find((x) => x.id === id);
  if (!d) { page.replaceChildren(h('p', {}, 'No such dish.')); return; }
  if (d.broken) { page.replaceChildren(h('section', { class: 'card' }, h('h2', {}, d.title), h('p', {}, d.about))); return; }
  const mod = (await import(`/dishes/${id}/page.js?v=${Date.now()}`)).default;
  const box = h('div', { class: 'dish' });
  page.replaceChildren(box);
  const kit = {
    dish: d, h, api, toast, when,
    on: (event, fn) => { const off = on(event.includes(':') || event === 'jobs' ? event : `${id}:${event}`, fn); cleanup.push(off); return off; },
  };
  const r = await mod.render(box, kit);
  if (typeof r === 'function') cleanup.push(r);
}

// ---------- router ----------
async function route() {
  for (const off of cleanup.splice(0)) { try { off(); } catch { /* already gone */ } }
  markNav();
  const hash = location.hash || '#/home';
  try {
    if (hash.startsWith('#/dish/')) await dish(hash.slice(7));
    else if (hash.startsWith('#/memory')) await memory();
    else if (hash.startsWith('#/settings')) await settings();
    else await home();
  } catch (e) {
    page.replaceChildren(h('section', { class: 'card' }, h('h2', {}, 'Something went wrong'), h('p', {}, e.message)));
  }
  page.scrollTop = 0;
}

window.addEventListener('hashchange', route);
on('memory', () => { refreshBadges(); if ((location.hash || '#/home') === '#/home') home(); });
on('jobs', (j) => {
  if (j.status === 'done' && document.hasFocus()) toast(`${j.title}: done`, 'ok');
  if (j.status === 'failed') toast(`${j.title}: ${j.error}`, 'bad');
});
await loadNav();
refreshBadges();
api('/api/home').then((d) => {
  modelDot(d.model);
  document.getElementById('brand-name').textContent = d.name || 'My Kitchen';
  document.title = d.name || 'My Kitchen';
}).catch(() => {});
route();
