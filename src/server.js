'use strict';
// Windows/yerel çalıştırma: panel + /api/stream (SSE) + tarayıcı tek süreçte.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Scanner } = require('./scanner');

const a = Object.fromEntries(process.argv.slice(2).map((x) => x.replace(/^--/, '').split('=')));
const PORT = Number(a.port || process.env.PORT) || 8800;
const HOST = a.host || '127.0.0.1'; // telefondan erişim için --host=0.0.0.0
const WEB = path.join(__dirname, '..', 'web');
const DATA = path.join(__dirname, '..', 'data');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };

const scanner = new Scanner({ dataDir: DATA });
const clients = new Set();
scanner.on('box', (b) => clients.forEach((res) => res.write(`event: box\ndata: ${JSON.stringify(b)}\n\n`)));

function send(res, file) {
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('yok'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(buf);
  });
}

const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, rooms: scanner.rooms.size, pool: scanner.pool.size, boxes: scanner.boxes.length, ...scanner.stats }));
  }
  if (p === '/api/stream') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write('event: hello\ndata: {}\n\n');
    clients.add(res);
    const ka = setInterval(() => res.write(': ka\n\n'), 25000);
    return req.on('close', () => { clearInterval(ka); clients.delete(res); });
  }
  const root = p.startsWith('/data/') ? DATA : WEB;
  const rel = p.startsWith('/data/') ? p.slice(6) : (p === '/' ? 'index.html' : p.slice(1));
  const file = path.normalize(path.join(root, rel));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); } // dizin kaçışı engeli
  send(res, file);
});

server.listen(PORT, HOST, () => {
  console.log(`Sandık Radarı: http://${HOST === '0.0.0.0' ? '127.0.0.1' : HOST}:${PORT}`);
  if (a.scan !== '0') scanner.start();
});
process.on('SIGINT', () => { scanner.stop(); process.exit(0); });
