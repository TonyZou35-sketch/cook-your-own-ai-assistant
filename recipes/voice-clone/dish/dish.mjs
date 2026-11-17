// The first dish: your own voice. Record one sentence, which is also your consent, then hear the app
// read anything you type in that voice. Everything runs on this computer, on the processor.
//
// Settings (data/settings.json → dishes.voice): { python: "<venv python>", who: "<their name>" }
// Models: <kitchen>/models (recipes/voice-clone/setup/get_models.py puts them there).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// What the person reads to make their voice. Saying it is the consent (kitchen rule 7: only your own
// voice). 6–9 seconds, which is what the voice model wants as a reference.
const CONSENT = {
  en: 'This is my own voice. I agree to let my computer use it to read text aloud for me.',
  zh: '这是我本人的声音，我同意让我的电脑用它来为我朗读文字。',
};
const NEED = [
  'sherpa-onnx-zipvoice-distill-int8-zh-en-emilia/encoder.int8.onnx',
  'sherpa-onnx-zipvoice-distill-int8-zh-en-emilia/decoder.int8.onnx',
  'sherpa-onnx-zipvoice-distill-int8-zh-en-emilia/tokens.txt',
  'sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09/model.int8.onnx',
  'vocos_24khz.onnx',
  'zipvoice-extra/lexicon-en.txt',
];

let k; // the kitchen's tools
let worker = null; // { child, ready, pending: Map }
let idle = null;
let seq = 0;

const dir = () => k.dataDir;
const refFile = () => path.join(dir(), 'reference.wav');
const refInfo = () => { try { return JSON.parse(fs.readFileSync(path.join(dir(), 'reference.json'), 'utf8')); } catch { return null; } };
const clipsDir = () => path.join(dir(), 'clips');

function python() {
  const s = k.settings().python;
  if (s) return s;
  const venv = path.join(k.modelsDir, '..', 'voice-env');
  return process.platform === 'win32' ? path.join(venv, 'Scripts', 'python.exe') : path.join(venv, 'bin', 'python');
}

function setupStatus() {
  const missing = NEED.filter((f) => !fs.existsSync(path.join(k.modelsDir, f)));
  if (!fs.existsSync(python())) missing.unshift(`Python environment (${python()})`);
  return { ready: !missing.length, missing };
}

// ---------- the worker process ----------
function startWorker() {
  const child = spawn(python(), ['-u', '-I', '-X', 'utf8', path.join(k.dishDir, 'voice_worker.py'), '--models', k.modelsDir], { windowsHide: true });
  const w = { child, pending: new Map(), tail: '' };
  let buf = '';
  w.ready = new Promise((resolve, reject) => { w.ok = resolve; w.fail = reject; });
  w.ready.catch(() => {});
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (d) => {
    buf += d;
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith('@@ ')) continue;
      let m;
      try { m = JSON.parse(line.slice(3)); } catch { continue; }
      if (m.type === 'ready') { w.ok(); continue; }
      if (m.type === 'fatal') { w.fail(new Error(`The voice models could not load: ${m.error}`)); continue; }
      const p = w.pending.get(m.id);
      if (!p) continue;
      if (m.type === 'progress') { p.progress?.(m); continue; }
      w.pending.delete(m.id);
      if (m.ok === false) p.reject(new Error(m.error)); else p.resolve(m);
    }
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (d) => { w.tail = (w.tail + d).slice(-2000); });
  child.on('error', (e) => w.fail(e));
  child.on('exit', (code) => {
    w.fail(new Error(`The voice worker stopped (${code}). ${w.tail.slice(-300)}`));
    for (const p of w.pending.values()) p.reject(new Error('The voice worker stopped'));
    if (worker === w) worker = null;
  });
  return w;
}

async function ask(msg, progress) {
  const st = setupStatus();
  if (!st.ready) k.fail(`The voice dish is not set up yet. Missing: ${st.missing.join(', ')}`, 409);
  clearTimeout(idle);
  if (!worker) worker = startWorker();
  const w = worker;
  await w.ready;
  const id = ++seq;
  const result = new Promise((resolve, reject) => w.pending.set(id, { resolve, reject, progress }));
  w.child.stdin.write(`${JSON.stringify({ ...msg, id })}\n`);
  try {
    return await result;
  } finally {
    // the models take a few seconds to load: keep the worker for 10 minutes after the last use
    clearTimeout(idle);
    idle = setTimeout(stopWorker, 10 * 60 * 1000);
    idle.unref?.();
  }
}

function stopWorker() {
  const w = worker;
  worker = null;
  if (!w) return;
  try { w.child.stdin.write('{"op":"quit"}\n'); } catch { /* gone */ }
  setTimeout(() => { try { w.child.kill(); } catch { /* gone */ } }, 3000).unref?.();
}

// ---------- clips ----------
function clips() {
  if (!fs.existsSync(clipsDir())) return [];
  return fs.readdirSync(clipsDir()).filter((f) => f.endsWith('.json')).map((f) => {
    try { return JSON.parse(fs.readFileSync(path.join(clipsDir(), f), 'utf8')); } catch { return null; }
  }).filter(Boolean).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

const similar = (a, b) => {
  const n = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const x = n(a);
  const y = n(b);
  if (!x || !y) return 0;
  // share of the expected characters found in order (longest common subsequence)
  const prev = new Array(y.length + 1).fill(0);
  for (let i = 1; i <= x.length; i++) {
    let diag = 0;
    for (let j = 1; j <= y.length; j++) {
      const tmp = prev[j];
      prev[j] = x[i - 1] === y[j - 1] ? diag + 1 : Math.max(prev[j], prev[j - 1]);
      diag = tmp;
    }
  }
  return prev[y.length] / x.length;
};

export default {
  title: 'Your voice',
  icon: '🎙',
  about: 'Hear anything you type, read in your own voice.',

  setup(tools) {
    k = tools;
    fs.mkdirSync(clipsDir(), { recursive: true });

    k.route('GET', '/', () => ({ setup: setupStatus(), consent: CONSENT, reference: fs.existsSync(refFile()) ? refInfo() : null, clips: clips() }));

    // The person's recording of the consent sentence (WAV from the page, or an uploaded file).
    k.route('POST', '/reference', async ({ raw, query }) => {
      const lang = query.lang === 'zh' ? 'zh' : 'en';
      const buf = await raw();
      if (buf.length < 1000 || buf.toString('ascii', 0, 4) !== 'RIFF') k.fail('Please record again, or upload a WAV file.');
      const tmp = path.join(dir(), 'reference-new.wav');
      fs.writeFileSync(tmp, buf);
      let heard;
      try {
        heard = await ask({ op: 'hear', file: tmp, lang, trim: true });
      } catch (e) {
        fs.rmSync(tmp, { force: true });
        throw e;
      }
      const score = similar(CONSENT[lang], heard.text);
      if (heard.sec < 3) { fs.rmSync(tmp, { force: true }); return { ok: false, heard: heard.text, match: score, message: 'That was too short. Read the whole sentence, at a normal pace.' }; }
      if (score < 0.6) { fs.rmSync(tmp, { force: true }); return { ok: false, heard: heard.text, match: score, message: 'I couldn’t hear the sentence clearly. Try again in a quiet place, a little closer to the microphone.' }; }
      fs.renameSync(tmp, refFile());
      // the voice model needs the words of the clip: what they were asked to read, or what was heard
      // when they said something a bit different
      const info = { lang, text: score >= 0.85 ? CONSENT[lang] : heard.text, heard: heard.text, match: Math.round(score * 100) / 100, sec: heard.sec, at: new Date().toISOString() };
      fs.writeFileSync(path.join(dir(), 'reference.json'), JSON.stringify(info, null, 2));
      k.broadcast('changed', {});
      return { ok: true, ...info };
    });

    k.route('GET', '/reference.wav', ({ res }) => {
      if (!fs.existsSync(refFile())) k.fail('No recording yet', 404);
      res.writeHead(200, { 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store' });
      fs.createReadStream(refFile()).pipe(res);
    });

    k.route('DELETE', '/reference', () => {
      fs.rmSync(refFile(), { force: true });
      fs.rmSync(path.join(dir(), 'reference.json'), { force: true });
      k.broadcast('changed', {});
      return { ok: true };
    });

    k.route('POST', '/say', async ({ body }) => {
      const { text } = await body();
      const t = String(text || '').trim().slice(0, 5000);
      if (!t) k.fail('Type something for your voice to say.');
      const ref = refInfo();
      if (!ref || !fs.existsSync(refFile())) k.fail('Record your voice first.');
      // to the millisecond, so two quick requests never share a file name
      const id = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 17);
      const out = path.join(clipsDir(), `${id}-ai-voice.wav`);
      return k.jobs.start({
        title: `Reading in your voice: “${t.slice(0, 40)}${t.length > 40 ? '…' : ''}”`,
        done: 'Your voice clip is ready',
        run: async (ctx) => {
          ctx.progress(0.02, 'Warming up the voice model');
          const r = await ask({ op: 'say', text: t, ref: refFile(), ref_text: ref.text, out, who: k.settings().who || '' },
            (m) => ctx.progress(m.done / m.total, `Sentence ${m.done} of ${m.total}`));
          const clip = { id, file: path.basename(out), text: t, sec: r.sec, took: r.took, redone: r.redone, sentences: r.sentences, createdAt: new Date().toISOString(), ai: true };
          fs.writeFileSync(path.join(clipsDir(), `${id}.json`), JSON.stringify(clip, null, 2));
          k.broadcast('changed', {});
          return clip;
        },
      });
    });

    k.route('GET', '/clips/:file', ({ params, res, query }) => {
      const f = path.join(clipsDir(), path.basename(params.file));
      if (!f.endsWith('.wav') || !fs.existsSync(f)) k.fail('Not found', 404);
      const headers = { 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store' };
      if (query.download) headers['Content-Disposition'] = `attachment; filename="${path.basename(f)}"`;
      res.writeHead(200, headers);
      fs.createReadStream(f).pipe(res);
    });

    k.route('DELETE', '/clips/:id', ({ params }) => {
      const id = path.basename(params.id);
      fs.rmSync(path.join(clipsDir(), `${id}.json`), { force: true });
      fs.rmSync(path.join(clipsDir(), `${id}-ai-voice.wav`), { force: true });
      k.broadcast('changed', {});
      return { ok: true };
    });
  },

  home() {
    const st = setupStatus();
    if (!st.ready) return [{ title: 'Your voice: setup isn’t finished', detail: 'Ask your cook to finish the voice dish (models or Python are missing).' }];
    if (!fs.existsSync(refFile())) return [{ title: 'Record your voice', detail: 'One sentence, about eight seconds. It is also your consent.' }];
    return [];
  },

  stop() { stopWorker(); },
};
