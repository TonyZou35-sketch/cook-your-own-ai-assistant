# Stage 3 · Build the stove: the app itself

The stove is the part every dish shares: a desktop window, a tray icon, notifications, the home
page, memory, the job queue, and the connection to the local model. You build it once.

## 1. Copy and install

```
<kitchen>/app/      ← copy of this skill's templates/kitchen-app/
```

Then, in `<kitchen>/app`:

```
npm install          downloads Electron (about 150 MB): ask first
npm start            opens the app
```

`npm run serve` runs the same app without the desktop shell, at http://127.0.0.1:7700; use it
while building and testing dishes.

## 2. Make it theirs

- **Name:** ask what they want to call their assistant. Set it in Settings, or write
  `"name"` in `<kitchen>/data/settings.json`. It appears in the window, the tray, and notifications.
- **Language:** if they don't use English, translate the text in `web/app.js` (the home, memory,
  and settings pages) and in each dish's `page.js`. Keep the meaning of the kitchen rules exact.
- **Model:** set the model chosen in stage 2 in Settings → Model (or `"model": { "id": "..." }`
  in settings.json). Without a choice, the app uses whatever model is already loaded, and LM Studio
  may otherwise load the first one it lists, which can be a very large one.
- **A shortcut:** offer a desktop shortcut that runs `npm start` in `<kitchen>/app` (Windows: a
  `.lnk` to `cmd /c npm start` or to `node_modules\electron\dist\electron.exe .`). Don't add it to
  start at login unless they ask.

## 3. How the app is built

```
app/
  desktop/main.cjs        window, tray, notifications, keeps the screen on while a job runs
  server/main.mjs         the background server (a child process of the window)
  server/core/
    http.mjs              tiny router; listens on 127.0.0.1 only, refuses other websites
    events.mjs            live updates to the page; notify() → system notification
    jobs.mjs              heavy work, one job at a time, with progress
    memory.mjs            propose → confirm; only confirmed items reach the model
    model.mjs             finds LM Studio or Ollama, streams chat replies
    dishes.mjs            loads app/dishes/*/dish.mjs and gives each one the shared tools
    store.mjs             folders and safe JSON writes
  web/                    the shell page: home, memory, settings, and each dish's page
  dishes/<id>/            one folder per dish (see 4-cooking.md)
```

Data lives in `<kitchen>/data`, never inside `app/`, so the app can be replaced without losing
anything.

## 4. Check it works

Show the person, don't just tell them:

1. `npm start`. The window opens on the home page.
2. The model card says which model answers. Press **Say hello** and wait for one sentence.
3. Close the window: the app stays in the tray. Open it from the tray.
4. Memory: type one fact about them, and see it under "Remembered".

If the model card says nothing is answering, start LM Studio's server or Ollama, then reload.
Update `kitchen.json` (`stage: 4`) and serve the first dish.
