// Every folder in app/dishes/ with a dish.mjs is a dish. This file finds them and hands each one the
// kitchen's shared tools, so a dish never needs to know how the kitchen works inside.
//
// A dish (dishes/<id>/dish.mjs):
//   export default {
//     title: 'Your voice',                  // shown in the sidebar
//     icon: '🎙',                           // one emoji or character
//     about: 'Hear any text in your own voice',
//     setup(k) { k.route('GET', '/hello', () => ({ hi: 1 })) },   // → GET /api/<id>/hello
//     home() { return [{ title, detail, open }] },               // "Waiting for you" items
//     stop() {},                                                  // the app is quitting
//   }
// Its page: dishes/<id>/page.js (export default { render(el, kit) }) and optional page.css.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { broadcast, notify } from './events.mjs';
import { route } from './http.mjs';
import { startJob, listJobs } from './jobs.mjs';
import * as memory from './memory.mjs';
import { chat, modelStatus } from './model.mjs';
import { APP_DIR, DATA_DIR, MODELS_DIR, ensureDir, getSettings, updateSettings } from './store.mjs';

export const dishes = [];

function toolsFor(id) {
  return {
    id,
    dataDir: ensureDir(path.join(DATA_DIR, id)), // this dish's own folder for what it stores
    modelsDir: MODELS_DIR,
    dishDir: path.join(APP_DIR, 'dishes', id),
    route: (method, sub, handler) => route(method, `/api/${id}${sub === '/' ? '' : sub}`, handler),
    settings: () => getSettings().dishes?.[id] || {},
    saveSettings: (fn) => updateSettings((s) => {
      s.dishes = s.dishes || {};
      s.dishes[id] = fn({ ...(s.dishes[id] || {}) }) || s.dishes[id];
    }).dishes[id],
    jobs: { start: (opts) => startJob({ ...opts, dish: id }), list: () => listJobs(id) },
    memory: { propose: (text) => memory.propose(text, id), context: memory.context },
    model: { chat, status: modelStatus },
    broadcast: (event, data) => broadcast(`${id}:${event}`, data),
    notify: (title, body) => notify(title, body, `#/dish/${id}`),
  };
}

export async function loadDishes() {
  const dir = path.join(APP_DIR, 'dishes');
  if (!fs.existsSync(dir)) return dishes;
  for (const id of fs.readdirSync(dir).sort()) {
    const file = path.join(dir, id, 'dish.mjs');
    if (!/^[\w-]+$/.test(id) || !fs.existsSync(file)) continue;
    try {
      const mod = (await import(pathToFileURL(file).href)).default;
      await mod.setup?.(toolsFor(id));
      dishes.push({ id, mod, title: mod.title || id, icon: mod.icon || '🍲', about: mod.about || '',
        css: fs.existsSync(path.join(dir, id, 'page.css')) });
      console.log(`dish ready: ${id}`);
    } catch (e) {
      // one broken dish must not stop the kitchen
      console.error(`dish ${id} failed to load:`, e);
      dishes.push({ id, mod: {}, title: id, icon: '⚠', about: `Could not load: ${e.message}`, broken: true });
    }
  }
  return dishes;
}

route('GET', '/api/dishes', () => dishes.map(({ id, title, icon, about, css, broken }) => ({ id, title, icon, about, css, broken: !!broken })));

// Home: what is waiting for the person, what is cooking, and whether the model answers.
route('GET', '/api/home', async () => {
  const waiting = [];
  const p = memory.pending().length;
  if (p) waiting.push({ dish: 'memory', title: `${p} thing${p > 1 ? 's' : ''} to confirm in Memory`, detail: 'Nothing is remembered until you say yes.', open: '#/memory' });
  for (const d of dishes) {
    try {
      for (const w of (await d.mod.home?.()) || []) waiting.push({ dish: d.id, open: `#/dish/${d.id}`, ...w });
    } catch (e) { console.error(`home of ${d.id}:`, e); }
  }
  return { name: getSettings().name || '', waiting, jobs: listJobs().slice(0, 8), model: await modelStatus() };
});

route('PUT', '/api/name', async ({ body }) => {
  const { name } = await body();
  updateSettings((s) => { s.name = String(name || '').trim().slice(0, 40); });
  return { name: getSettings().name };
});
