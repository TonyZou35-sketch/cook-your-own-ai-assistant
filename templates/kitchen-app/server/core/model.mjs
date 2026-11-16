// The AI model on this computer, through LM Studio or Ollama (both speak the OpenAI-style API).
// Kitchen rule 4: this is the only model the dishes talk to, unless the person chose otherwise.
import { route } from './http.mjs';
import { getSettings, updateSettings } from './store.mjs';

const KNOWN = [
  { app: 'LM Studio', base: 'http://127.0.0.1:1234' },
  { app: 'Ollama', base: 'http://127.0.0.1:11434' },
];

async function getJson(url, ms = 2500) {
  const r = await fetch(url, { signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

// Which models are in memory right now (LM Studio and Ollama each have their own way to say it).
async function loadedModels(base) {
  try {
    const j = await getJson(`${base}/api/v0/models`, 1500); // LM Studio
    return (j.data || []).filter((m) => m.state === 'loaded').map((m) => m.id);
  } catch { /* not LM Studio */ }
  try {
    const j = await getJson(`${base}/api/ps`, 1500); // Ollama
    return (j.models || []).map((m) => m.name || m.model);
  } catch { return null; }
}

// { ok, app, base, models: [ids], model, loaded } — which server answers and which model the dishes use.
// The model is the one chosen in Settings; otherwise one already in memory; otherwise the first listed.
// (LM Studio lists every downloaded model and loads one on first use, which can take a while for a
// large model, so the cook should set the choice in stage 3.)
export async function modelStatus() {
  const s = getSettings().model || {};
  const tries = s.base ? [{ app: s.app || 'Local model', base: s.base }] : KNOWN;
  for (const t of tries) {
    try {
      const j = await getJson(`${t.base}/v1/models`);
      const models = (j.data || []).map((m) => m.id).filter((id) => !/embed/i.test(id));
      const inMemory = await loadedModels(t.base);
      const model = models.includes(s.id) ? s.id : inMemory?.find((id) => models.includes(id)) || models[0] || '';
      const loaded = inMemory ? inMemory.includes(model) : null;
      return { ok: !!model, app: t.app, base: t.base, models, model, loaded, problem: model ? '' : 'no-model' };
    } catch { /* next */ }
  }
  return { ok: false, app: '', base: '', models: [], model: '', loaded: null, problem: 'no-server' };
}

const plain = (t) => String(t || '').replace(/<think>[\s\S]*?(<\/think>|$)/g, '').trim();

// chat({ messages, temperature, maxTokens, onDelta, onCutOff, signal }) → the reply text.
// Always streamed: a long answer that arrives in one piece can hit Node's five-minute limit and
// look like "the model app is off" (field notes). If the reply hits maxTokens, what was written is
// still returned (keep what is complete) and onCutOff() is called.
export async function chat({ messages, temperature = 0.3, maxTokens = 2048, onDelta, onCutOff, signal } = {}) {
  const st = await modelStatus();
  if (!st.ok) {
    throw new Error(st.problem === 'no-model'
      ? `${st.app} is running but has no model. Download or load one in ${st.app}.`
      : 'The AI model on this computer is not answering. Open LM Studio and start its server (Developer → Start Server), or start Ollama.');
  }
  const r = await fetch(`${st.base}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: st.model, messages, temperature, max_tokens: maxTokens, stream: true }),
    signal,
  });
  if (!r.ok) throw new Error(`The model app said ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const dec = new TextDecoder();
  let buf = '';
  let text = '';
  let finish = '';
  for await (const chunk of r.body) {
    buf += dec.decode(chunk, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith('data:') || line === 'data: [DONE]') continue;
      let j;
      try { j = JSON.parse(line.slice(5)); } catch { continue; }
      const c = j.choices?.[0];
      if (c?.delta?.content) { text += c.delta.content; onDelta?.(c.delta.content, text); }
      if (c?.finish_reason) finish = c.finish_reason;
    }
  }
  if (finish === 'length') onCutOff?.();
  return plain(text);
}

route('GET', '/api/model', () => modelStatus());
route('PUT', '/api/model', async ({ body }) => {
  const { id } = await body();
  updateSettings((s) => { s.model = { ...(s.model || {}), id: String(id || '') }; });
  return modelStatus();
});
route('POST', '/api/model/try', async () => {
  const t = Date.now();
  const text = await chat({ messages: [{ role: 'user', content: 'Say hello in one short, friendly sentence.' }], maxTokens: 60 });
  return { text, sec: (Date.now() - t) / 1000 };
});
