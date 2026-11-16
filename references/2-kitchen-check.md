# Stage 2 · Check the kitchen: what can this computer run?

## 1. Look at the machine

Run from this skill's folder:

```
node scripts/check-kitchen.mjs
```

If Node.js is missing, ask before installing it (Windows: `winget install OpenJS.NodeJS.LTS`;
macOS: `brew install node`, or the installer from nodejs.org). The script only reads. It reports
the system, memory, graphics card and its memory, free disk space, and whether Node, Python,
LM Studio, Ollama, and FFmpeg are present.

Tell the person in one or two sentences what their computer can do. Example: "Your laptop has 32 GB
of memory and no separate graphics card, so it can run a mid-sized model at a comfortable pace."

## 2. Where the kitchen lives

```
<kitchen>/
  kitchen.json     the cook's notes: stage, choices, dishes (you keep this up to date)
  needs-map.md     from stage 1
  app/             the app (stage 3)
  models/          speech and other models the dishes download
  data/            everything the app stores: memory, recordings, results
```

Default `<kitchen>` is `~/my-kitchen`. **Not** inside OneDrive, iCloud Drive, Dropbox, or Google
Drive: models are hundreds of megabytes to tens of gigabytes, and syncing them wastes hours and
space. Create `kitchen.json`:

```json
{
  "name": "<their name for the assistant>",
  "language": "en",
  "stage": 2,
  "machine": { "os": "...", "memoryGB": 32, "gpu": "...", "vramGB": 0 },
  "modelApp": "lmstudio",
  "model": "",
  "dishes": [],
  "log": [ { "at": "2026-11-16", "note": "kitchen created" } ]
}
```

## 3. The local model app

Two good choices; pick one.

| | LM Studio | Ollama |
|---|---|---|
| Best for | People who like a window to see and choose models | People fine with a background service |
| Server address | `http://127.0.0.1:1234` | `http://127.0.0.1:11434` |
| Install | lmstudio.ai installer | ollama.com installer, `winget install Ollama.Ollama` |

Both speak the same "OpenAI-compatible" language, which the kitchen app uses. In LM Studio the
local server must be started (Developer tab → Start Server, or `lms server start`).

## 4. Choosing a model that fits

Rules of thumb for the memory the model needs (4-bit versions, which are the usual download):

| Model size | Memory it needs | Feels like |
|---|---|---|
| 3–4B parameters | 3–4 GB | Quick, fine for short rewrites and sorting |
| 7–9B | 6–8 GB | Good everyday helper |
| 12–14B | 9–12 GB | Noticeably better at following longer instructions |
| 24–32B | 16–22 GB | Strong; needs a big graphics card or 32 GB+ of shared memory |
| 70B | 40–45 GB | Strongest you can run at home; slow unless the hardware is big |

- Graphics card memory (VRAM) is what counts if there is a separate card. On Apple Silicon, use
  about two-thirds of total memory. On AMD/Intel laptops with shared memory, the script reads how
  much the driver gives to graphics. The usual Windows query for this tops out at 4 GB, so the
  script reads the driver's own record instead.
- Leave room: the app, the browser, and speech models need memory too.
- If [llmfit](https://github.com/AlexsJones/llmfit) is installed, `llmfit recommend` ranks models
  for this exact machine.
- Prefer a recent instruction-tuned model from a well-known family (Qwen, Gemma, Llama, Mistral,
  Phi). Turn "thinking" mode off for dishes that need quick answers; it can be several times slower
  for the same quality on everyday tasks.

Download the model only after they agree on which one and how large. Then check that the server
answers:

```
curl http://127.0.0.1:1234/v1/models     (LM Studio)
curl http://127.0.0.1:11434/v1/models    (Ollama)
```

Record the choice in `kitchen.json` (`modelApp`, `model`) and move to stage 3.
