import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { RequestError } from './store.js';

const MAX_BODY_BYTES = 1024 * 1024;
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon' };

export function createApp({ store, allowedOrigins = [], distDir = resolve('dist') }) {
  const json = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  return createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (path.startsWith('/api/')) {
        res.setHeader('Vary', 'Origin');
        const origin = req.headers.origin;
        // Same-origin requests work without configuration; remote frontends need an allowlist.
        const sameOrigin = origin === `http://${req.headers.host}` || origin === `https://${req.headers.host}`;
        if (origin && !sameOrigin && !allowedOrigins.includes(origin)) throw new RequestError(403, 'Origin is not allowed.');
        if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
        if (req.method === 'OPTIONS') {
          res.writeHead(204, { 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
          return res.end();
        }
        if (path === '/api/health' && req.method === 'GET') return json(res, 200, { ok: true });
        if (path !== '/api/submissions') throw new RequestError(404, 'Not found.');
        if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); throw new RequestError(405, 'Method not allowed.'); }
        if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new RequestError(415, 'Send application/json.');
        let size = 0;
        const chunks = [];
        // Drain oversized bodies without retaining them so the client receives a JSON error.
        for await (const chunk of req) {
          size += chunk.length;
          if (size > MAX_BODY_BYTES) { json(res, 413, { error: 'Submission is too large.' }); req.resume(); return; }
          chunks.push(chunk);
        }
        let body;
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
        catch { throw new RequestError(400, 'Invalid JSON.'); }
        const receipt = store.save(body);
        return json(res, receipt.duplicate ? 200 : 201, receipt);
      }
      if (!['GET', 'HEAD'].includes(req.method)) throw new RequestError(405, 'Method not allowed.');
      // Serve the built site both at / and at its default GitHub Pages base path.
      let asset = decodeURIComponent(path).replace(/^\/pairwise_human_study(?=\/|$)/, '');
      if (!asset || asset === '/') asset = '/index.html';
      const filename = resolve(distDir, `.${asset}`);
      if (!filename.startsWith(`${resolve(distDir)}${sep}`)) throw new RequestError(404, 'Not found.');
      let data;
      try { data = await readFile(filename); }
      catch { throw new RequestError(404, 'Not found. Build the frontend with npm run build.'); }
      res.writeHead(200, { 'Content-Type': mime[extname(filename)] ?? 'application/octet-stream' });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch (error) {
      if (!(error instanceof RequestError)) console.error('Request failed:', error);
      if (!res.headersSent) json(res, error.status ?? 500, { error: error instanceof RequestError ? error.message : 'Unable to save responses. Please retry.' });
    }
  });
}
