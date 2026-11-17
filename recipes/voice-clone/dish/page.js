// The voice dish's page: 1. record one sentence (your voice + your consent), 2. type, 3. listen.
export default {
  async render(el, { h, api, on, toast, when }) {
    let lang = 'en';
    let state = null;
    let sayUi = null; // the "read it" button and its progress line, for job updates

    // ---------- recording in the page, saved as a WAV ----------
    let rec = null; // { ctx, stream, node, chunks, rate, timer, started }
    async function startRec(button, meter) {
      // no echo cancellation or noise suppression: they change the voice the model learns from
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const node = ctx.createScriptProcessor(4096, 1, 1);
      const chunks = [];
      node.onaudioprocess = (e) => {
        const d = e.inputBuffer.getChannelData(0);
        chunks.push(new Float32Array(d));
        let peak = 0;
        for (let i = 0; i < d.length; i += 16) peak = Math.max(peak, Math.abs(d[i]));
        meter.style.width = `${Math.min(100, peak * 140)}%`;
      };
      src.connect(node);
      node.connect(ctx.destination);
      rec = { ctx, stream, node, chunks, rate: ctx.sampleRate, started: Date.now() };
      rec.timer = setTimeout(() => button.click(), 15000); // a reference longer than 15 s doesn't help
    }
    function stopRec() {
      const r = rec;
      rec = null;
      clearTimeout(r.timer);
      r.node.disconnect();
      r.stream.getTracks().forEach((t) => t.stop());
      r.ctx.close();
      return wav(r.chunks, r.rate);
    }
    function wav(chunks, rate) {
      const n = chunks.reduce((s, c) => s + c.length, 0);
      const buf = new ArrayBuffer(44 + n * 2);
      const v = new DataView(buf);
      const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
      str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
      v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
      v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true);
      let o = 44;
      for (const c of chunks) for (let i = 0; i < c.length; i++, o += 2) v.setInt16(o, Math.max(-1, Math.min(1, c[i])) * 0x7fff, true);
      return new Blob([buf], { type: 'audio/wav' });
    }

    async function send(blob, status) {
      status.replaceChildren(h('span', { class: 'muted' }, 'Listening to your recording…'));
      try {
        const r = await api(`/api/voice/reference?lang=${lang}`, { method: 'POST', raw: blob, headers: { 'Content-Type': 'audio/wav' } });
        if (!r.ok) {
          status.replaceChildren(h('p', { class: 'voice-bad' }, r.message), h('p', { class: 'muted small' }, r.heard ? `I heard: “${r.heard}”` : 'I didn’t hear any words.'));
          return;
        }
        toast('Got it. That’s your voice now.', 'ok');
        draw();
      } catch (e) { status.replaceChildren(h('p', { class: 'voice-bad' }, e.message)); }
    }

    // ---------- the page ----------
    async function draw() {
      state = await api('/api/voice');
      const parts = [
        h('header', { class: 'hello' },
          h('h1', {}, 'Your voice'),
          h('p', { class: 'muted' }, 'Record one sentence. Then anything you type can be read aloud in your voice, made on this computer.')),
      ];
      if (!state.setup.ready) {
        parts.push(h('section', { class: 'card accent' }, h('h2', {}, 'Almost ready'),
          h('p', {}, 'This dish still needs its speech models. Ask your cook to finish the setup.'),
          h('ul', { class: 'muted small' }, state.setup.missing.map((m) => h('li', {}, m)))));
        el.replaceChildren(...parts);
        return;
      }
      parts.push(state.reference ? haveVoice() : recordCard());
      if (state.reference) parts.push(sayCard(), clipsCard());
      el.replaceChildren(...parts);
    }

    function recordCard() {
      const status = h('div', { class: 'voice-status' });
      const meter = h('i');
      const sentence = h('p', { class: 'voice-sentence' }, `“${state.consent[lang]}”`);
      const button = h('button', {
        class: 'btn big',
        onclick: async () => {
          if (!rec) {
            try { await startRec(button, meter); } catch (e) { status.replaceChildren(h('p', { class: 'voice-bad' }, `The microphone didn’t start: ${e.message}`)); return; }
            button.textContent = '■ Stop';
            button.classList.add('recording');
            status.replaceChildren(h('span', { class: 'muted' }, 'Recording… read the sentence above, then press Stop.'));
          } else {
            const secs = (Date.now() - rec.started) / 1000;
            const blob = stopRec();
            meter.style.width = '0';
            button.textContent = '● Record again';
            button.classList.remove('recording');
            if (secs < 2) { status.replaceChildren(h('p', { class: 'voice-bad' }, 'That was very short. Read the whole sentence.')); return; }
            const url = URL.createObjectURL(blob);
            status.replaceChildren(h('audio', { controls: true, src: url }), h('div', { class: 'inline' },
              h('button', { class: 'btn', onclick: () => send(blob, status) }, 'Use this recording'),
              h('span', { class: 'muted small' }, 'Listen first if you like.')));
          }
        },
      }, '● Record');
      const upload = h('input', { type: 'file', accept: '.wav,audio/wav', hidden: true, onchange: () => { if (upload.files[0]) send(upload.files[0], status); } });
      const langBtn = (code, label) => h('button', { class: `btn small ${lang === code ? '' : 'ghost'}`, onclick: () => { lang = code; draw(); } }, label);
      return h('section', { class: 'card' },
        h('div', { class: 'voice-step' }, h('span', { class: 'step' }, '1'), h('h2', {}, 'Read this sentence aloud')),
        h('div', { class: 'inline' }, langBtn('en', 'English'), langBtn('zh', '中文')),
        sentence,
        h('p', { class: 'muted small' }, 'Saying it is your consent: this dish only makes speech in the voice of the person who recorded it. Use a quiet room and your normal speaking voice.'),
        h('div', { class: 'inline' }, button, h('div', { class: 'voice-meter' }, meter), h('button', { class: 'btn ghost small', onclick: () => upload.click() }, 'Upload a WAV instead'), upload),
        status);
    }

    function haveVoice() {
      const r = state.reference;
      return h('section', { class: 'card' },
        h('div', { class: 'voice-step' }, h('span', { class: 'step done' }, '✓'), h('h2', {}, 'Your voice is ready')),
        h('div', { class: 'inline' }, h('audio', { controls: true, src: `/api/voice/reference.wav?t=${Date.parse(r.at)}` }),
          h('span', { class: 'muted small grow' }, `Recorded ${when(r.at)} · ${r.sec.toFixed(1)} s`),
          h('button', { class: 'btn ghost small', onclick: async () => { if (confirm('Record your voice again? The old recording will be replaced.')) { await api('/api/voice/reference', { method: 'DELETE' }); draw(); } } }, 'Record again')));
    }

    function sayCard() {
      const box = h('textarea', { class: 'input', placeholder: lang === 'zh' ? '写下想让你的声音读出来的话…' : 'Type what your voice should say…', maxlength: 5000 });
      box.value = sessionStorage.getItem('voice-draft') || '';
      box.addEventListener('input', () => sessionStorage.setItem('voice-draft', box.value));
      const progress = h('div', { class: 'muted small' });
      const go = h('button', {
        class: 'btn',
        onclick: async () => {
          if (!box.value.trim()) { box.focus(); return; }
          go.disabled = true;
          try {
            await api('/api/voice/say', { method: 'POST', body: { text: box.value } });
            progress.textContent = 'Queued…';
          } catch (e) { toast(e.message, 'bad'); go.disabled = false; }
        },
      }, 'Read it in my voice');
      sayUi = { go, progress };
      return h('section', { class: 'card' },
        h('div', { class: 'voice-step' }, h('span', { class: 'step' }, '2'), h('h2', {}, 'Type something')),
        box,
        h('div', { class: 'inline', style: { marginTop: '10px' } }, go, progress));
    }

    function clipsCard() {
      const list = state.clips;
      return h('section', { class: 'card' },
        h('div', { class: 'voice-step' }, h('span', { class: 'step' }, '3'), h('h2', {}, 'Listen')),
        list.length ? h('div', { class: 'list' }, list.map((c) => h('div', { class: 'row voice-clip' },
          h('div', { class: 'grow' },
            h('div', { class: 'voice-text' }, c.text.length > 160 ? `${c.text.slice(0, 160)}…` : c.text),
            h('audio', { controls: true, preload: 'none', src: `/api/voice/clips/${c.file}` }),
            h('div', { class: 'muted small' }, h('span', { class: 'pill' }, 'AI-generated'), ` ${when(c.createdAt)} · ${c.sec.toFixed(1)} s of speech, made in ${c.took.toFixed(1)} s${c.redone ? ` · ${c.redone} sentence${c.redone > 1 ? 's' : ''} redone after listening back` : ''}`)),
          h('a', { class: 'btn ghost small', href: `/api/voice/clips/${c.file}?download=1` }, 'Save'),
          h('button', { class: 'btn ghost small', onclick: async () => { await api(`/api/voice/clips/${c.id}`, { method: 'DELETE' }); draw(); } }, 'Delete'))))
          : h('p', { class: 'muted' }, 'Your clips will appear here.'));
    }

    on('changed', () => draw());
    on('jobs', (j) => {
      if (j.dish !== 'voice' || !sayUi) return;
      const { go, progress } = sayUi;
      if (j.status === 'running' || j.status === 'queued') { go.disabled = true; progress.textContent = j.detail || 'Working…'; }
      else { go.disabled = false; progress.textContent = j.status === 'failed' ? `Failed: ${j.error}` : ''; }
    });
    await draw();
    return () => { if (rec) stopRec(); };
  },
};
