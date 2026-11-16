// The kitchen's background server. The desktop shell (desktop/main.cjs) starts it as a child process;
// for building and testing it also runs on its own: `npm run serve`, then open http://127.0.0.1:7700.
import { stopAll } from './core/jobs.mjs';
import { createServer } from './core/http.mjs';
import { dishes, loadDishes } from './core/dishes.mjs';
import { DATA_DIR, ensureDir } from './core/store.mjs';
import './core/events.mjs';
import './core/memory.mjs';
import './core/model.mjs';

const portArg = process.argv.find((a) => a.startsWith('--port='));
const port = portArg ? Number(portArg.slice(7)) : Number(process.env.KITCHEN_PORT || 0);

ensureDir(DATA_DIR);
await loadDishes();
const server = createServer();
server.listen(port, '127.0.0.1', () => {
  const p = server.address().port;
  console.log(`kitchen open at http://127.0.0.1:${p}/  (data: ${DATA_DIR})`);
  if (process.send) process.send({ type: 'ready', port: p });
});

async function shutdown() {
  await stopAll();
  for (const d of dishes) { try { await d.mod.stop?.(); } catch { /* quitting anyway */ } }
  server.close();
  setTimeout(() => process.exit(0), 300);
}
process.on('message', (m) => { if (m?.type === 'shutdown') shutdown(); });
process.on('disconnect', shutdown); // the window process is gone: don't linger in the background
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
