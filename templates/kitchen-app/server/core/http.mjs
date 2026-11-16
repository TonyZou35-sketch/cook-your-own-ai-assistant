// A small web server for the app's own window. It listens on 127.0.0.1 only, and refuses requests
// that come from other web pages: a website open in the person's browser must not be able to call
// this app (kitchen rule 4).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { APP_DIR } from './store.mjs';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const routes = [];

// route('GET', '/api/memory/:id', ({ params, query, body, raw, req, res }) => result)
// The result is sent as JSON. A handler that writes to `res` itself returns nothing.
export function route(method, pattern, handler) {
  const keys = [];
  const re = new RegExp(`^${pattern.replace(/\/:(\w+)/g, (_, k) => { keys.push(k); return '/([^/]+)'; })}/?$`);
  routes.push({ method, re, keys, handler });
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.txt': 'text/plain; charset=utf-8',
};
export const typeOf = (file) => TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';

export function sendFile(res, file, { download } = {}) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new HttpError(404, 'Not found');
  const headers = { 'Content-Type': typeOf(file), 'Cache-Control': 'no-store' };
  if (download) headers['Content-Disposition'] = `attachment; filename="${encodeURIComponent(path.basename(file))}"`;
  res.writeHead(200, headers);
  fs.createReadStream(file).pipe(res);
}

function readBody(req, limit = 50 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new HttpError(413, 'Too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Static files: web/ for the shell, dishes/<id>/page.js|page.css for each dish's page.
function staticFile(urlPath) {
  const clean = path.normalize(decodeURIComponent(urlPath)).replace(/^([/\\])+/, '');
  if (clean.startsWith('dishes')) {
    if (!/^dishes[/\\][\w-]+[/\\][\w.-]+\.(js|css|svg|png)$/.test(clean)) return null;
    return path.join(APP_DIR, clean);
  }
  const file = path.join(APP_DIR, 'web', clean || 'index.html');
  return file.startsWith(path.join(APP_DIR, 'web')) ? file : null;
}

function allowed(req, port) {
  const host = String(req.headers.host || '');
  if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return false; // DNS rebinding
  if (req.method === 'GET' || req.method === 'HEAD') return true;
  return req.headers['x-kitchen'] === '1'; // only the app's own page sends this header
}

export function createServer() {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const port = server.address()?.port;
    try {
      if (!allowed(req, port)) throw new HttpError(403, 'Forbidden');
      if (url.pathname.startsWith('/api/')) {
        for (const r of routes) {
          if (r.method !== req.method) continue;
          const m = url.pathname.match(r.re);
          if (!m) continue;
          const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
          let rawBody;
          const raw = async () => (rawBody ??= await readBody(req));
          const body = async () => { const b = await raw(); return b.length ? JSON.parse(b.toString('utf8')) : {}; };
          const out = await r.handler({ req, res, params, query: Object.fromEntries(url.searchParams), body, raw });
          if (!res.writableEnded && !res.headersSent) {
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
            res.end(JSON.stringify(out ?? { ok: true }));
          }
          return;
        }
        throw new HttpError(404, 'No such API');
      }
      if (req.method !== 'GET') throw new HttpError(405, 'Method not allowed');
      const file = staticFile(url.pathname);
      if (!file) throw new HttpError(404, 'Not found');
      sendFile(res, file);
    } catch (e) {
      const status = e.status || 500;
      if (status === 500) console.error(e);
      if (!res.headersSent) res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      if (!res.writableEnded) res.end(JSON.stringify({ error: e.message || String(e) }));
    }
  });
  return server;
}
