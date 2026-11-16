"""The voice dish's worker: speaks text in the person's own voice and listens back to check itself.

Runs on the processor only (sherpa-onnx, no PyTorch, no graphics card), so it can run beside a
language model on the GPU. Models (see ../setup/get_models.py), all from the sherpa-onnx project:
  ZipVoice distill int8 (zh + en)   zero-shot voice cloning from one short clip
  Vocos 24 kHz                      turns ZipVoice's output into sound
  SenseVoice int8                   speech-to-text, to check the reference and every generated sentence

Protocol: one JSON object per line on stdin; replies are stdout lines starting with "@@ ".
  {"op": "hear", "id": 1, "file": ".../ref.wav"}
      -> {"type": "heard", "id": 1, "text": "...", "sec": 7.9}
  {"op": "say", "id": 2, "text": "...", "ref": ".../ref.wav", "ref_text": "...", "out": ".../clip.wav", "who": "Ana"}
      -> {"type": "progress", "id": 2, "done": 1, "total": 4}
      -> {"type": "said", "id": 2, "ok": true, "file": "...", "sec": 21.4, "took": 9.8, "redone": 1, "sentences": [...]}
  {"op": "quit"}
"""
import argparse
import difflib
import json
import os
import re
import struct
import sys
import time
import traceback

p = argparse.ArgumentParser()
p.add_argument('--models', required=True, help='the kitchen models folder')
p.add_argument('--threads', type=int, default=max(2, min(8, (os.cpu_count() or 4) // 2)))
p.add_argument('--steps', type=int, default=4, help='ZipVoice steps: more is slower and a little cleaner')
a = p.parse_args()


def send(obj):
    sys.stdout.write('@@ ' + json.dumps(obj, ensure_ascii=False) + '\n')
    sys.stdout.flush()


t0 = time.time()
try:
    import numpy as np
    import sherpa_onnx as so
    import soundfile as sf

    M = a.models
    ZV = os.path.join(M, 'sherpa-onnx-zipvoice-distill-int8-zh-en-emilia')
    SV = os.path.join(M, 'sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09')
    # ZipVoice in sherpa-onnx reads English only from a lexicon, and the model ships a Chinese one only:
    # English words without an entry are skipped silently. lexicon-en.txt (from this recipe) fixes that.
    LEX = [os.path.join(ZV, 'lexicon.txt'), os.path.join(M, 'zipvoice-extra', 'lexicon-en.txt')]

    tts = so.OfflineTts(so.OfflineTtsConfig(
        model=so.OfflineTtsModelConfig(
            zipvoice=so.OfflineTtsZipvoiceModelConfig(
                tokens=os.path.join(ZV, 'tokens.txt'), encoder=os.path.join(ZV, 'encoder.int8.onnx'),
                decoder=os.path.join(ZV, 'decoder.int8.onnx'), vocoder=os.path.join(M, 'vocos_24khz.onnx'),
                lexicon=','.join(LEX)),
            num_threads=a.threads, provider='cpu'),
        max_num_sentences=1))

    ears = {}

    def ear(lang):
        lang = 'en' if lang == 'en' else 'zh'
        if lang not in ears:
            ears[lang] = so.OfflineRecognizer.from_sense_voice(
                model=os.path.join(SV, 'model.int8.onnx'), tokens=os.path.join(SV, 'tokens.txt'),
                num_threads=2, language=lang, use_itn=True)
        return ears[lang]

    words = set()
    for f in LEX:
        with open(f, encoding='utf8') as fh:
            for line in fh:
                w = line.split(' ', 1)[0].strip().lower()
                if w and w.isascii():
                    words.add(w)
except Exception as e:  # noqa: BLE001 - reported to the app
    send({'type': 'fatal', 'error': f'{type(e).__name__}: {e}', 'trace': traceback.format_exc()[-1500:]})
    sys.exit(1)


# ---------- text ----------
CJK = re.compile(r'[㐀-鿿]')
ONES = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split()
TENS = 'zero ten twenty thirty forty fifty sixty seventy eighty ninety'.split()
ZH_D = '零一二三四五六七八九'


def lang_of(text):
    return 'zh' if len(CJK.findall(text)) >= max(2, len(text) // 10) else 'en'


def en_number(n):
    if n < 20:
        return ONES[n]
    if n < 100:
        return TENS[n // 10] + ('' if n % 10 == 0 else '-' + ONES[n % 10])
    if n < 1000:
        return ONES[n // 100] + ' hundred' + ('' if n % 100 == 0 else ' ' + en_number(n % 100))
    for size, name in ((10 ** 9, 'billion'), (10 ** 6, 'million'), (1000, 'thousand')):
        if n >= size:
            return en_number(n // size) + ' ' + name + ('' if n % size == 0 else ' ' + en_number(n % size))
    return str(n)


def zh_small(n):
    """1..9999 in Chinese, with 零 where a place is skipped (1005 -> 一千零五)."""
    s, gap = '', False
    for i, unit in ((1000, '千'), (100, '百'), (10, '十'), (1, '')):
        d = n // i % 10
        if d:
            s += ('零' if gap else '') + ZH_D[d] + unit
            gap = False
        elif s:
            gap = True
    return s


def zh_number(n):
    if n == 0:
        return '零'
    groups = [(n // 10 ** 8, '亿'), (n // 10 ** 4 % 10 ** 4, '万'), (n % 10 ** 4, '')]
    out = ''
    for g, name in groups:
        if g:
            if out and g < 1000:
                out += '零'
            out += zh_small(g) + name
        elif out and not out.endswith('零'):
            out += '零'
    out = out.rstrip('零')
    return out[1:] if out.startswith('一十') else out


def numbers(text, lang):
    def year(m):
        y = int(m.group(0))
        if lang == 'zh':
            return ''.join(ZH_D[int(c)] for c in m.group(0))
        return en_number(y // 100) + (' hundred' if y % 100 == 0 else (' oh ' + ONES[y % 100] if y % 100 < 10 else ' ' + en_number(y % 100)))

    def num(m):
        s = m.group(0).replace(',', '')
        if '.' in s:
            whole, frac = s.split('.', 1)
            w = int(whole or 0)
            return (zh_number(w) + '点' + ''.join(ZH_D[int(c)] for c in frac)) if lang == 'zh' else (en_number(w) + ' point ' + ' '.join(ONES[int(c)] for c in frac))
        n = int(s)
        return zh_number(n) if lang == 'zh' else en_number(n)

    text = re.sub(r'(\d+(?:\.\d+)?)\s?%', lambda m: ('百分之' + m.group(1)) if lang == 'zh' else (m.group(1) + ' percent'), text)
    text = re.sub(r'(?<![\d.])(1[5-9]\d\d|20\d\d)(?![\d.])(?=\s*(年|$|[^\d]))', year, text)
    return re.sub(r'\d[\d,]*(?:\.\d+)?', num, text)


LETTER_WORD = re.compile(r"[A-Za-z][A-Za-z']*")
CAMEL = re.compile(r"[A-Z]+(?=[A-Z][a-z])|[A-Z]?[a-z']+|[A-Z]+")


def spell(word):
    return ' '.join(f'letter{c.lower()}' for c in word if c.isalpha())


def english_word(w):
    """A word ZipVoice can say: known words as they are, acronyms letter by letter (API -> A P I),
    CamelCase split, unknown short words spelled."""
    if w.isupper() and 1 < len(w) <= 6:
        return spell(w)
    if w.lower() in words:
        return w
    parts = CAMEL.findall(w)
    if len(parts) > 1:
        return ' '.join(english_word(x) for x in parts)
    return spell(w) if len(w) <= 4 else w


def speakable(text, lang):
    text = re.sub(r'[*_#>`~|]+', ' ', text)  # markdown
    text = re.sub(r'https?://\S+', ' ', text)
    text = numbers(text, lang)
    text = LETTER_WORD.sub(lambda m: english_word(m.group(0)), text)
    return re.sub(r'[ \t]+', ' ', text).strip()


def pieces(text):
    """[(sentence, pause after in seconds)]: one sentence at a time sounds more natural and lets each
    one be checked; a blank line is a longer pause; very long sentences are cut at a comma."""
    out = []
    for para in re.split(r'\n\s*\n', text.strip()):
        para = para.replace('\n', ' ').strip()
        if not para:
            continue
        sents = [s.strip() for s in re.split(r'(?<=[。！？!?；;])\s*|(?<=\.)\s+(?=[A-Z0-9"“])', para) if s.strip()]
        for s in sents:
            limit = 60 if lang_of(s) == 'zh' else 180
            if len(s) > limit:
                parts = [x.strip() for x in re.split(r'(?<=[，,、：:])\s*', s) if x.strip()]
                buf = ''
                for x in parts:
                    if buf and len(buf) + len(x) > limit:
                        out.append((buf, 0.18))
                        buf = x
                    else:
                        buf = (buf + (' ' if buf and lang_of(x) == 'en' else '') + x)
                if buf:
                    out.append((buf, 0.38))
            else:
                out.append((s, 0.38))
        if out:
            out[-1] = (out[-1][0], 0.75)
    if out:
        out[-1] = (out[-1][0], 0.0)
    return out


def norm(text, lang):
    """Letters only, numbers written out, acronyms as their letters: the listener splits and joins
    words differently ("AP I", "TWENTYWENTY SIX"), so the check compares characters, not words."""
    t = numbers(text, lang).lower()
    t = re.sub(r'letter([a-z])', r'\1', t)
    return [c for c in t if c.isalpha() or CJK.match(c)]


def match(said, heard, lang):
    a_, b_ = norm(said, lang), norm(heard, lang)
    if not a_:
        return 1.0
    return round(difflib.SequenceMatcher(None, a_, b_, autojunk=False).ratio(), 3)


# ---------- sound ----------
def load(path):
    y, sr = sf.read(path, dtype='float32', always_2d=True)
    return y.mean(axis=1), sr


def trim(y, sr):
    """Cut silence off both ends of a recording, keeping a little margin."""
    win = int(sr * 0.03)
    if len(y) < win * 4:
        return y
    rms = np.sqrt(np.convolve(y ** 2, np.ones(win) / win, mode='same'))
    gate = max(0.008, float(np.percentile(rms, 95)) * 0.08)
    on = np.where(rms > gate)[0]
    if not len(on):
        return y
    pad = int(sr * 0.15)
    return y[max(0, on[0] - pad):min(len(y), on[-1] + pad)]


def hear(y, sr, lang):
    r = ear(lang)
    s = r.create_stream()
    s.accept_waveform(sr, y.astype(np.float32))
    r.decode_stream(s)
    return s.result.text.strip()


def room_noise(y, sr, n):
    """Quiet noise like the clip's own background, for pauses: pure digital silence between
    sentences sounds cut off (field notes)."""
    edge = np.concatenate([y[:int(sr * 0.06)], y[-int(sr * 0.06):]]) if len(y) > sr * 0.2 else y
    level = float(np.sqrt(np.mean(edge ** 2))) if len(edge) else 0.0
    level = min(level, 0.004)
    return (np.random.default_rng().standard_normal(n) * level).astype(np.float32)


def write_wav(path, y, sr, comment, title):
    """16-bit WAV with an INFO chunk that says it is AI-generated (kitchen rule 7)."""
    pcm = (np.clip(y, -1, 1) * 32767).astype('<i2').tobytes()

    def sub(tag, text):
        b = text.encode('utf8') + b'\0'
        if len(b) % 2:
            b += b'\0'
        return tag + struct.pack('<I', len(b)) + b

    info = b'INFO' + sub(b'INAM', title) + sub(b'ICMT', comment) + sub(b'ISFT', 'cook-your-own-ai-assistant voice dish')
    fmt = struct.pack('<4sIHHIIHH', b'fmt ', 16, 1, 1, sr, sr * 2, 2, 16)
    lst = b'LIST' + struct.pack('<I', len(info)) + info
    data = b'data' + struct.pack('<I', len(pcm)) + pcm
    body = b'WAVE' + fmt + lst + data
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + '.part'
    with open(tmp, 'wb') as f:
        f.write(b'RIFF' + struct.pack('<I', len(body)) + body)
    os.replace(tmp, path)


def say(req):
    t = time.time()
    ref, ref_sr = load(req['ref'])
    ref_text = req['ref_text']
    parts = pieces(req['text'])
    if not parts:
        raise ValueError('nothing to say')
    out, sr, report, redone = [], 24000, [], 0
    for i, (sent, pause) in enumerate(parts):
        lang = lang_of(sent)
        text = speakable(sent, lang)
        best = None
        # one sentence at a time, listened back; a sentence that doesn't match what was asked is made
        # again once with more steps, and the closer of the two is kept
        for attempt, steps in enumerate((a.steps, a.steps + 4)):
            audio = tts.generate(text, ref_text, ref.tolist(), ref_sr, 1.0, steps)
            y = np.asarray(audio.samples, dtype=np.float32)
            sr = audio.sample_rate
            heard = hear(y, sr, lang) if len(y) else ''
            # compared with the sentence as written: the listener writes numbers as digits too
            score = match(sent, heard, lang)
            if best is None or score > best[1]:
                best = (y, score, heard)
            if score >= (0.75 if lang == 'zh' else 0.8) or attempt == 1:
                break
            redone += 1
        y, score, heard = best
        out.append(y)
        if pause:
            out.append(room_noise(y, sr, int(sr * pause)))
        report.append({'text': sent, 'heard': heard, 'match': score})
        send({'type': 'progress', 'id': req['id'], 'done': i + 1, 'total': len(parts)})
    y = np.concatenate(out) if out else np.zeros(1, dtype=np.float32)
    peak = float(np.max(np.abs(y))) or 1.0
    y = y * min(1.0, 0.95 / peak)
    who = req.get('who') or 'the person who recorded it'
    write_wav(req['out'], y, sr, f'AI-generated speech in the voice of {who}, made on their own computer.', 'AI-generated voice')
    return {'file': req['out'], 'sec': round(len(y) / sr, 2), 'took': round(time.time() - t, 2), 'redone': redone, 'sentences': report}


send({'type': 'ready', 'loadSec': round(time.time() - t0, 1), 'pid': os.getpid()})

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    req = {}
    try:
        req = json.loads(line)
        op = req.get('op')
        if op == 'quit':
            break
        if op == 'hear':
            y, sr = load(req['file'])
            if req.get('trim'):
                y = trim(y, sr)
                sf.write(req['file'], y, sr, subtype='PCM_16')
            send({'type': 'heard', 'id': req['id'], 'text': hear(y, sr, req.get('lang') or 'en'), 'sec': round(len(y) / sr, 2)})
        elif op == 'say':
            send({'type': 'said', 'id': req['id'], 'ok': True, **say(req)})
    except Exception as e:  # noqa: BLE001 - one bad request must not end the worker
        send({'type': 'said' if req.get('op') == 'say' else 'heard', 'id': req.get('id'), 'ok': False, 'error': f'{type(e).__name__}: {e}'})
