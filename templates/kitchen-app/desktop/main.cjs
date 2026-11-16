// The desktop shell: a window, a tray icon, notifications. The real work happens in the background
// server (server/), which this starts as a child process, so a stuck job never freezes the window
// and closing the window doesn't stop what is cooking. Quit from the tray icon.
const { app, BrowserWindow, Menu, Notification, Tray, dialog, nativeImage, powerSaveBlocker, session } = require('electron');
const { fork } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const APP_DIR = path.resolve(__dirname, '..');
const KITCHEN_DIR = path.resolve(APP_DIR, '..');
const DATA_DIR = process.env.KITCHEN_DATA || path.join(KITCHEN_DIR, 'data');
const ICON = path.join(__dirname, 'icon.png');
const NAME = (() => { try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'settings.json'), 'utf8')).name || 'My Kitchen'; } catch { return 'My Kitchen'; } })();

let win = null;
let tray = null;
let server = null;
let base = '';
let quitting = false;
let awakeId = null;
const restarts = [];

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => show());
  app.whenReady().then(boot);
}

function log(text) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.appendFileSync(path.join(DATA_DIR, 'app.log'), `${new Date().toISOString()} ${text}\n`);
  } catch { /* logging must never stop the app */ }
}

function boot() {
  app.setName(NAME);
  if (process.platform === 'win32') app.setAppUserModelId(`kitchen.${NAME}`);
  // The microphone is allowed for the app's own page only (the voice dish records a sentence).
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => {
    cb(permission === 'media' && !!base && wc.getURL().startsWith(base));
  });
  createWindow();
  createTray();
  startServer();
}

function createWindow() {
  win = new BrowserWindow({
    width: 1180, height: 800, minWidth: 760, minHeight: 520, title: NAME, icon: ICON, show: false,
    backgroundColor: '#f7f3ec', autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent('<body style="font:16px system-ui;background:#f7f3ec;color:#3b3027;display:grid;place-items:center;height:100vh;margin:0">Warming up the kitchen…</body>')}`);
  win.once('ready-to-show', () => win.show());
  // Closing the window hides it; jobs keep cooking. Quit from the tray.
  win.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();
    win.hide();
  });
  // Links to the web open in the person's browser, not inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url) && !url.startsWith(base)) require('electron').shell.openExternal(url);
    return { action: 'deny' };
  });
}

function show(hash) {
  if (!win) createWindow();
  if (hash && base) win.loadURL(`${base}${hash}`);
  win.show();
  win.focus();
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(ICON));
  tray.setToolTip(NAME);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `Open ${NAME}`, click: () => show() },
    { type: 'separator' },
    { label: 'Quit', click: () => quit() },
  ]));
  tray.on('click', () => show());
}

function notifyPerson({ title, body, href }) {
  if (win && win.isVisible() && win.isFocused()) return; // the page shows it already
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body: body || '', icon: ICON });
  n.on('click', () => show(href));
  n.show();
}

// Keeps the screen on while a job runs: with the screen off, Windows can slow the machine down
// several times over (field notes). The same request a video player makes; no settings change.
function setAwake(on) {
  if (on && awakeId === null) awakeId = powerSaveBlocker.start('prevent-display-sleep');
  else if (!on && awakeId !== null) { powerSaveBlocker.stop(awakeId); awakeId = null; }
}

function startServer() {
  const child = fork(path.join(APP_DIR, 'server', 'child.cjs'), [], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', KITCHEN_DATA: DATA_DIR },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    windowsHide: true,
  });
  server = child;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const out = fs.createWriteStream(path.join(DATA_DIR, 'server.log'), { flags: 'a' });
  child.stdout.pipe(out);
  child.stderr.pipe(out);
  child.on('message', (msg) => {
    if (msg?.type === 'ready') {
      base = `http://127.0.0.1:${msg.port}/`;
      win?.loadURL(base);
      log(`server ready on ${msg.port}`);
    } else if (msg?.type === 'notify') notifyPerson(msg);
    else if (msg?.type === 'awake') setAwake(!!msg.on);
    else if (msg?.type === 'fatal') log(`server failed: ${msg.message}`);
  });
  child.on('exit', (code) => {
    if (server === child) { server = null; setAwake(false); }
    if (quitting) return;
    log(`server exited (${code})`);
    const now = Date.now();
    restarts.push(now);
    while (restarts.length && now - restarts[0] > 60000) restarts.shift();
    if (restarts.length <= 3) { setTimeout(startServer, 1500); return; }
    dialog.showErrorBox(NAME, `The kitchen's background service keeps stopping.\n\nSee ${path.join(DATA_DIR, 'server.log')}`);
  });
}

function quit() {
  quitting = true;
  tray?.destroy();
  if (!server) { app.quit(); return; }
  const s = server;
  const t = setTimeout(() => { try { s.kill(); } catch { /* gone */ } app.quit(); }, 4000);
  s.once('exit', () => { clearTimeout(t); app.quit(); });
  try { s.send({ type: 'shutdown' }); } catch { s.kill(); }
}

app.on('before-quit', (e) => {
  if (quitting) return;
  e.preventDefault();
  quit();
});
app.on('window-all-closed', () => { /* stay in the tray */ });
