// Tiny static file server for local development.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.png': 'image/png' };

http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400); return res.end('bad request'); }
  if (p === '/') p = '/index.html';
  const file = path.join(dir, path.normalize(p).replace(/^([.][.][/\\])+/, ''));
  readFile(file)
    .then(buf => { res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }); res.end(buf); })
    .catch(() => { res.writeHead(404); res.end('not found'); });
}).listen(8321, '127.0.0.1', () => console.log('static server on http://127.0.0.1:8321'));
