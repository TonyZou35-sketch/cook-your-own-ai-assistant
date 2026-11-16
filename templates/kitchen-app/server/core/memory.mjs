// What the assistant knows about the person. Kitchen rule 1: nothing is remembered until they confirm
// it. Dishes can only *propose*; a proposal waits on the Memory page until the person keeps, edits,
// or drops it. Only confirmed items are ever given to the model.
import path from 'node:path';
import { broadcast } from './events.mjs';
import { HttpError, route } from './http.mjs';
import { DATA_DIR, newId, readJson, writeJson } from './store.mjs';

const FILE = () => path.join(DATA_DIR, 'memory.json');
const load = () => readJson(FILE(), { items: [] });
function save(m) {
  writeJson(FILE(), m);
  broadcast('memory', { pending: m.items.filter((i) => i.status === 'pending').length });
}

// From a dish: "should I remember this?" Returns the pending item (or the existing one, if the same
// text is already there).
export function propose(text, source = '') {
  const t = String(text || '').trim().slice(0, 500);
  if (!t) return null;
  const m = load();
  const same = m.items.find((i) => i.text.toLowerCase() === t.toLowerCase());
  if (same) return same;
  const item = { id: newId(), text: t, status: 'pending', source, createdAt: new Date().toISOString() };
  m.items.push(item);
  save(m);
  return item;
}

export const confirmed = () => load().items.filter((i) => i.status === 'confirmed');
export const pending = () => load().items.filter((i) => i.status === 'pending');

// The confirmed items as a few lines for a model prompt ("What I know about you: …").
export function context(limit = 40) {
  const items = confirmed().slice(-limit);
  return items.length ? items.map((i) => `- ${i.text}`).join('\n') : '';
}

route('GET', '/api/memory', () => load().items.slice().reverse());

// Typed by the person: theirs, so confirmed right away.
route('POST', '/api/memory', async ({ body }) => {
  const { text } = await body();
  const t = String(text || '').trim().slice(0, 500);
  if (!t) throw new HttpError(400, 'Write something to remember');
  const m = load();
  const item = { id: newId(), text: t, status: 'confirmed', source: 'you', createdAt: new Date().toISOString() };
  m.items.push(item);
  save(m);
  return item;
});

function change(id, fn) {
  const m = load();
  const item = m.items.find((i) => i.id === id);
  if (!item) throw new HttpError(404, 'Not found');
  fn(item, m);
  save(m);
  return item;
}

route('POST', '/api/memory/:id/confirm', ({ params }) => change(params.id, (i) => { i.status = 'confirmed'; i.confirmedAt = new Date().toISOString(); }));
route('PUT', '/api/memory/:id', async ({ params, body }) => {
  const { text } = await body();
  const t = String(text || '').trim().slice(0, 500);
  if (!t) throw new HttpError(400, 'Empty');
  return change(params.id, (i) => { i.text = t; i.status = 'confirmed'; });
});
route('DELETE', '/api/memory/:id', ({ params }) => change(params.id, (i, m) => { m.items = m.items.filter((x) => x !== i); }));
