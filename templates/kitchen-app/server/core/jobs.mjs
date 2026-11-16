// Heavy work (the language model, speech, video) runs here, one job at a time. Two heavy jobs at once
// can slow both to a crawl or, on some graphics drivers, crash the computer (field notes). While a
// job runs, the desktop shell keeps the screen on, because a sleeping screen can make the machine
// several times slower.
import { broadcast, notify, toShell } from './events.mjs';
import { route } from './http.mjs';
import { newId } from './store.mjs';

const jobs = []; // newest last; the last 50 are kept
let running = null;

const view = (j) => ({
  id: j.id, dish: j.dish, title: j.title, status: j.status, progress: j.progress, detail: j.detail,
  error: j.error, result: j.result, createdAt: j.createdAt, startedAt: j.startedAt, endedAt: j.endedAt,
});

function changed(j) {
  broadcast('jobs', view(j));
}

// jobs.start({ dish: 'voice', title: 'Speaking your text', run: async (ctx) => result, done: 'Your clip is ready' })
// ctx.progress(0.5, 'sentence 3 of 6') · ctx.signal (aborted when cancelled) · ctx.log(text)
export function startJob({ dish, title, run, done }) {
  const j = {
    id: newId(), dish, title, run, done, status: 'queued', progress: 0, detail: '', error: '', result: null,
    createdAt: new Date().toISOString(), startedAt: null, endedAt: null, controller: new AbortController(),
  };
  jobs.push(j);
  while (jobs.length > 50) jobs.shift();
  changed(j);
  pump();
  return view(j);
}

async function pump() {
  if (running) return;
  const j = jobs.find((x) => x.status === 'queued');
  if (!j) { toShell({ type: 'awake', on: false }); return; }
  running = j;
  j.status = 'running';
  j.startedAt = new Date().toISOString();
  toShell({ type: 'awake', on: true });
  changed(j);
  const ctx = {
    signal: j.controller.signal,
    progress: (p, detail = '') => { j.progress = Math.max(0, Math.min(1, p)); j.detail = detail; changed(j); },
    log: (text) => console.log(`[${j.dish}] ${text}`),
  };
  try {
    j.result = await j.run(ctx);
    j.status = 'done';
    j.progress = 1;
    if (j.done) notify(j.done, j.title, `#/dish/${j.dish}`);
  } catch (e) {
    j.status = j.controller.signal.aborted ? 'cancelled' : 'failed';
    j.error = e.message || String(e);
    if (j.status === 'failed') notify(`Something went wrong: ${j.title}`, j.error, `#/dish/${j.dish}`);
  } finally {
    j.endedAt = new Date().toISOString();
    running = null;
    changed(j);
    setImmediate(pump);
  }
}

export const listJobs = (dish) => jobs.filter((j) => !dish || j.dish === dish).map(view).reverse();
export const isBusy = () => !!running;

export function cancelJob(id) {
  const j = jobs.find((x) => x.id === id);
  if (!j) return false;
  if (j.status === 'queued') { j.status = 'cancelled'; j.endedAt = new Date().toISOString(); changed(j); }
  else if (j.status === 'running') j.controller.abort();
  return true;
}

export async function stopAll() {
  for (const j of jobs) if (j.status === 'queued') j.status = 'cancelled';
  running?.controller.abort();
}

route('GET', '/api/jobs', ({ query }) => listJobs(query.dish));
route('POST', '/api/jobs/:id/cancel', ({ params }) => ({ ok: cancelJob(params.id) }));
