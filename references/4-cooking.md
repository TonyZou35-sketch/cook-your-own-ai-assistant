# Stage 5 · Cook a dish for each need

One need from the map becomes one dish: a folder in `app/dishes/<id>/`. Cook one at a time and serve
it before starting the next.

## 1. Say it back

Before writing anything, describe the dish to them in one short paragraph, in their words:

> "When you find a video you want to share, you paste the link here. The kitchen downloads it,
> writes subtitles in Chinese, and lets you check the lines it wasn't sure about. When you approve,
> it makes the finished video. Uploading stays with you."

Then agree, line by line, on what the dish does **on its own** and what **waits for them**.
Anything that can't be undone waits for them (kitchen rule 2).

## 2. Plan it small

- What does it need from them (a link, a file, a few words)?
- What does it produce (a file, a draft, a list, a sound)?
- Which steps need the model, which need other tools (FFmpeg, a speech model), and which are
  plain code? Use plain code wherever it is enough: it is faster and never makes things up.
- What can go wrong, and what does the dish do then? (Usually: stop and ask on the home page.)
- New downloads or installs? List them with sizes and ask.

## 3. Build it

```
app/dishes/<id>/
  dish.mjs     server side: routes, jobs, home() items
  page.js      the page: export default { render(el, kit) }
  page.css     optional
  ...          workers, prompts, anything else the dish needs
```

The tools a dish gets in `setup(k)`:

| Tool | Use it for |
|---|---|
| `k.route(method, path, handler)` | `/api/<id>/...` endpoints for the page |
| `k.fail(message)` | stop a request with a message the page shows the person (bad input, not set up yet) |
| `k.jobs.start({ title, run, done })` | anything slow; `run(ctx)` gets `ctx.progress()` and `ctx.signal` |
| `k.model.chat({ messages, ... })` | the local model; stream, keep prompts short, ask for line formats |
| `k.memory.propose(text)` | suggest something to remember (never writes memory directly) |
| `k.memory.context()` | the confirmed facts, as lines for a prompt |
| `k.dataDir`, `k.modelsDir` | where to store the dish's files and big models |
| `k.settings()`, `k.saveSettings(fn)` | the dish's own settings |
| `k.broadcast(event, data)`, `k.notify(title, body)` | update the page; a system notification |

`home()` returns the dish's "Waiting for you" items: `[{ title, detail }]`. Use it for every
question the dish has for the person.

The page gets `kit = { h, api, on, toast, when, dish }`. `api()` adds the header the server
requires; `on('changed', fn)` listens to the dish's broadcasts, `on('jobs', fn)` to job progress.
Look at `recipes/voice-clone/dish/` for a complete example: a worker process, a job with progress,
a page with three steps.

**Build and test with sample data** (kitchen rule 5). Make a small set of made-up inputs that look
like theirs. Their real files go in only when the dish is served, on their machine.

## 4. Check the rules

Go through the checklist in [kitchen-rules.md](kitchen-rules.md) with the code open. Fix what fails.

## 5. Serve it

Start the app and walk them through one real use. Then:

- Add the dish to `kitchen.json` (`dishes: [{ id, need, servedAt }]`).
- Tell them what to watch for in the first days, and that you will ask how it went (stage 6).
