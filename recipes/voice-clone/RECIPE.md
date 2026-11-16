# Recipe · Your voice (the first dish)

The person reads one sentence aloud. From then on, anything they type can be read in their own
voice, made on their computer. It is the first dish because it works for almost anyone, needs no
account anywhere, and makes the whole kitchen visible in a few minutes: a page, a job with progress,
a notification, a result labelled as AI-made.

## What makes this one different from other voice-cloning tools

- **The sentence is the consent.** "This is my own voice. I agree to let my computer use it to
  read text aloud for me." The dish checks, by listening, that this sentence was read before it
  accepts the recording. Only the person's own voice (kitchen rule 7).
- **It listens to itself.** Text is spoken one sentence at a time. Each sentence is transcribed
  again, and a sentence whose words don't match is made again (a common failure of voice models
  is dropping the last words).
- **Natural pauses.** Pauses between sentences are filled with quiet room noise, not digital
  silence; a blank line in the text makes a longer pause.
- **Labelled.** Files are named `…-ai-voice.wav`, and the WAV's metadata says it is AI-generated
  speech in their voice.
- **Processor only.** No graphics card, no PyTorch. It runs next to the language model without
  competing for the GPU (see field notes).

Measured on the laptop in the field notes (AMD Ryzen AI Max+ 395, processor only): once warm, about
as fast as real time (7.8 s of speech in 7.4 s); the first clip after starting adds about
5 seconds to load the models.

## Ingredients

| | Size | From |
|---|---|---|
| Python 3.10+ with `sherpa-onnx`, `numpy`, `soundfile` | ~70 MB | PyPI |
| ZipVoice distill int8 (zh + en): voice cloning | 104 MB | sherpa-onnx releases |
| Vocos 24 kHz: turns model output into sound | 52 MB | sherpa-onnx releases |
| SenseVoice int8: speech-to-text for the checks | 158 MB | sherpa-onnx releases |
| English pronunciation list (`lexicon/lexicon-en.txt.gz`) | 1.4 MB | this recipe |

About 380 MB to download in all. Ask before downloading.

## Steps

1. **Python environment** in `<kitchen>/voice-env` (ask before installing Python itself if it is
   missing; `uv` is the simplest way: `uv venv <kitchen>/voice-env --python 3.12`).

   ```
   python -m venv <kitchen>/voice-env
   <kitchen>/voice-env/Scripts/python -m pip install -r recipes/voice-clone/setup/requirements.txt
   ```
   (macOS/Linux: `<kitchen>/voice-env/bin/python`.)

2. **Models:**

   ```
   <venv python> recipes/voice-clone/setup/get_models.py <kitchen>/models          (shows sizes)
   <venv python> recipes/voice-clone/setup/get_models.py <kitchen>/models --yes    (downloads)
   ```

3. **The dish:** copy `recipes/voice-clone/dish/` to `<kitchen>/app/dishes/voice/`.

4. **Settings:** in `<kitchen>/data/settings.json`:

   ```json
   { "dishes": { "voice": { "python": "<kitchen>/voice-env/Scripts/python.exe", "who": "<their name>" } } }
   ```
   If the environment is at `<kitchen>/voice-env`, the dish finds it without the `python` line.

5. **Serve:** restart the app. The home page says "Record your voice". Let them do it themselves:
   choose English or 中文, press Record, read the sentence, press Stop, listen, "Use this recording".
   Then type a sentence and press "Read it in my voice".

## If something goes wrong

- *"The voice dish is not set up yet"*: the page lists what is missing; usually the Python path.
- *"I couldn't hear the sentence clearly"*: quieter room, closer to the microphone, normal pace.
  A recording can also be uploaded as WAV.
- *A word is skipped in English*: the word is missing from the pronunciation list. Short unknown
  words and acronyms are spelled out; longer ones may be skipped. Rephrase, or add the word to
  `<kitchen>/models/zipvoice-extra/lexicon-en.txt` (one line: the word, then its IPA characters
  separated by spaces).
- *The voice sounds lower or flatter than them*: record again in their usual speaking voice. The
  reference clip decides the voice (field notes).

## Languages

The voice model speaks Chinese and English, and a voice recorded in one language can speak the
other. The listening check knows Chinese, English, Japanese, Korean, and Cantonese.

## Credits

The models are downloaded from the [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) project's
releases (sherpa-onnx itself: Apache-2.0); this repository does not redistribute them. Each keeps
its own license; read it before any commercial use:

- [ZipVoice](https://github.com/k2-fsa/ZipVoice) (k2-fsa): Apache-2.0 per its model card; trained on
  the Emilia dataset, which has its own terms.
- [Vocos](https://github.com/gemelo-ai/vocos): MIT.
- [SenseVoice](https://github.com/FunAudioLLM/SenseVoice) (FunAudioLLM / Alibaba): FunASR Model
  License.

The English pronunciation list is converted from the US English lexicon shipped with sherpa-onnx's
Kokoro multi-lang model (Kokoro and its lexicon: Apache-2.0).
