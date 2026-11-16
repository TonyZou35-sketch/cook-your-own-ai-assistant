// Entry for the background process when the desktop shell starts it: Electron running as plain Node
// (ELECTRON_RUN_AS_NODE) with a message channel to the window. The server itself is ES modules.
const path = require('node:path');
const { pathToFileURL } = require('node:url');

import(pathToFileURL(path.join(__dirname, 'main.mjs')).href).catch((e) => {
  if (process.send) process.send({ type: 'fatal', message: String(e?.stack || e) });
  setTimeout(() => process.exit(1), 300);
});
