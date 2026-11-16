"""Downloads the voice dish's speech models into <kitchen>/models (about 315 MB to download).

    python get_models.py <kitchen>/models            show what would be downloaded, then stop
    python get_models.py <kitchen>/models --yes      download and unpack

All models come from the sherpa-onnx project's GitHub releases (Apache-2.0):
https://github.com/k2-fsa/sherpa-onnx/releases
Uses only Python's standard library, so it can run before anything else is installed.
"""
import gzip
import shutil
import sys
import tarfile
import time
import urllib.request
from pathlib import Path

GH = 'https://github.com/k2-fsa/sherpa-onnx/releases/download'
ITEMS = [
    # (what, url, size in MB, folder or file it makes)
    ('ZipVoice, the voice-cloning model (Chinese + English)', f'{GH}/tts-models/sherpa-onnx-zipvoice-distill-int8-zh-en-emilia.tar.bz2', 104,
     'sherpa-onnx-zipvoice-distill-int8-zh-en-emilia'),
    ('Vocos, turns the model output into sound', f'{GH}/vocoder-models/vocos_24khz.onnx', 52, 'vocos_24khz.onnx'),
    ('SenseVoice, listens back to check each sentence', f'{GH}/asr-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09.tar.bz2', 158,
     'sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09'),
]
LEXICON = Path(__file__).resolve().parent.parent / 'lexicon' / 'lexicon-en.txt.gz'


def fetch(url, to):
    part = to.with_name(to.name + '.part')
    t = time.time()
    with urllib.request.urlopen(url, timeout=60) as r, open(part, 'wb') as f:
        total = int(r.headers.get('Content-Length') or 0)
        got = 0
        while True:
            chunk = r.read(1 << 20)
            if not chunk:
                break
            f.write(chunk)
            got += len(chunk)
            if total:
                print(f'\r  {got / 1e6:6.0f} / {total / 1e6:.0f} MB', end='', flush=True)
    part.replace(to)
    print(f'\r  done in {time.time() - t:.0f} s{" " * 20}')


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    models = Path(sys.argv[1]).expanduser().resolve()
    go = '--yes' in sys.argv
    todo = [it for it in ITEMS if not (models / it[3]).exists()]
    lex_out = models / 'zipvoice-extra' / 'lexicon-en.txt'
    print(f'Models folder: {models}')
    for what, url, mb, _ in ITEMS:
        state = 'to download' if any(t[1] == url for t in todo) else 'already here'
        print(f'  {mb:4d} MB  {what}  ({state})')
    print(f'  English pronunciation list: {"already here" if lex_out.exists() else "unpacked from this recipe"}')
    if not go:
        print(f'\nAbout {sum(t[2] for t in todo)} MB to download. Run again with --yes to download.')
        return
    models.mkdir(parents=True, exist_ok=True)
    for what, url, mb, name in todo:
        print(f'{what} ({mb} MB)')
        file = models / url.rsplit('/', 1)[1]
        fetch(url, file)
        if file.name.endswith('.tar.bz2'):
            with tarfile.open(file, 'r:bz2') as tar:
                try:
                    tar.extractall(models, filter='data')  # refuses paths outside the folder
                except TypeError:  # Python without extraction filters
                    tar.extractall(models)
            file.unlink()
    if not lex_out.exists():
        lex_out.parent.mkdir(parents=True, exist_ok=True)
        with gzip.open(LEXICON, 'rb') as src, open(lex_out, 'wb') as dst:
            shutil.copyfileobj(src, dst)
    print('All voice models are in place.')


if __name__ == '__main__':
    main()
