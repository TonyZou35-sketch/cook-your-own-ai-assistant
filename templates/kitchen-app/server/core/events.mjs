// Live updates for the window (server-sent events), and messages to the desktop shell
// (notifications, keeping the screen on). Without the shell (`npm run serve`), messages go to the log.
import { route } from './http.mjs';

const clients = new Set();

route('GET', '/api/events', ({ req, res }) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
  res.write(': hello\n\n');
  clients.add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => { clearInterval(ping); clients.delete(res); });
});

// broadcast('voice:changed', { ... }) → every open page gets it
export function broadcast(type, data = {}) {
  const msg = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of clients) c.write(msg);
}

export function toShell(msg) {
  if (process.send) process.send(msg);
  else if (msg.type === 'notify') console.log(`[notify] ${msg.title}: ${msg.body || ''}`);
}

// A notification from the system tray, for when the window is not in front.
export const notify = (title, body = '', href = '') => toShell({ type: 'notify', title, body, href });
