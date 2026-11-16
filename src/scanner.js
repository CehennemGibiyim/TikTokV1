'use strict';
// Havuzdaki canlı yayınlara bağlanır, kutu olaylarını data/boxes.json'a yazar.
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const { normalize } = require('./boxes');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36';
const DISCOVERY = ['https://api.tik.tools/api/live/top-channels', 'https://api.tik.tools/api/live/top-channels?region=US'];

class Scanner extends EventEmitter {
  constructor(o = {}) {
    super();
    this.o = { dataDir: path.join(__dirname, '..', 'data'), maxRooms: 12, watchSec: 300, startsPerMin: 4,
      hourBudget: 25, discoverSec: 60, maxPool: 3000, keep: 300, ntfyTopic: '', ntfyKey: '', ...o };
    this.file = path.join(this.o.dataDir, 'boxes.json');
    this.pool = new Map();      // username -> { roomId, seenAt }
    this.rooms = new Map();     // aktif oturumlar
    this.backoff = new Map();   // username -> { until, step }
    this.attempts = [];         // son saatteki bağlantı denemeleri
    this.seen = new Set();
    this.boxes = [];
    this.variant = 0;
    this.live = new Map();      // keşifte görülen canlı yayınlar
    this.boxCount = new Map();  // yayıncı -> yakalanan kutu
    this.stats = { sessions: 0, boxes: 0, errors: 0, lastError: '' };
    try {
      this.boxes = JSON.parse(fs.readFileSync(this.file, 'utf8')).boxes || [];
      this.boxes.forEach((b) => this.seen.add(b.id));
      const t = JSON.parse(fs.readFileSync(path.join(this.o.dataDir, 'targets.json'), 'utf8')).targets || [];
      t.forEach((u) => this.pool.set(String(u).replace(/^@/, '').toLowerCase(), { roomId: '', seenAt: 0 }));
    } catch { /* ilk çalıştırma */ }
  }

  start() {
    this.stopped = false;
    this.timers = [
      setInterval(() => this.discover().catch((e) => this.fail(e)), this.o.discoverSec * 1000),
      setInterval(() => this.tick(), Math.round(60000 / this.o.startsPerMin)),
    ];
    this.discover().catch((e) => this.fail(e));
  }
  stop() {
    this.stopped = true;
    (this.timers || []).forEach(clearInterval);
    this.rooms.forEach((r) => r.end('durduruldu'));
    this.save(true);
  }
  fail(e) { this.stats.errors++; this.stats.lastError = String(e.message || e).slice(0, 120); }

  async discover() {
    const url = DISCOVERY[this.variant++ % DISCOVERY.length];
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error('keşif http ' + res.status);
    const list = ((await res.json()) || {}).channels || [];
    for (const c of list) {
      const u = String(c.uniqueId || c.unique_id || c.username || (c.owner && c.owner.uniqueId) || '').replace(/^@/, '').toLowerCase();
      if (!u) continue;
      this.pool.set(u, { roomId: String(c.roomId || c.room_id || ''), seenAt: Date.now() });
      this.live.set(u, { username: u, roomId: String(c.roomId || ''), region: String(c.region || ''), seenAt: Date.now() });
    }
    while (this.pool.size > this.o.maxPool) this.pool.delete(this.pool.keys().next().value);
    this.save();
  }

  tick() {
    const now = Date.now();
    this.attempts = this.attempts.filter((t) => now - t < 3600e3);
    if (this.stopped || this.rooms.size >= this.o.maxRooms || this.attempts.length >= this.o.hourBudget) return;
    // taze oda kimliği olanlar (yayında oldukları kesin) önce
    const cand = [...this.pool].filter(([u, v]) => v.seenAt && now - v.seenAt < 900e3 && !this.rooms.has(u) && !(this.backoff.get(u)?.until > now))
      .sort((a, b) => b[1].seenAt - a[1].seenAt)[0];
    if (cand) { this.attempts.push(now); this.session(cand[0], cand[1]); }
  }

  async session(username, meta) {
    const { TikTokLiveConnection } = require('tiktok-live-connector');
    const c = new TikTokLiveConnection(username, { processInitialData: false, fetchRoomInfoOnConnect: true });
    let ok = false, viewers = 0, done = false;
    const end = (why) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { c.disconnect(); } catch { /* zaten kapalı */ }
      this.rooms.delete(username);
      this.save();
      if (!ok) { // bağlanılamayan odaya ceza: 10 dk, 20, 40, en çok 60
        const step = Math.min(60, (this.backoff.get(username)?.step || 5) * 2);
        this.backoff.set(username, { step, until: Date.now() + step * 60e3 });
        this.stats.errors++; this.stats.lastError = username + ': ' + why;
      } else this.backoff.delete(username);
      this.emit('session', { username, why, ok });
    };
    const timer = setTimeout(() => end('süre doldu'), this.o.watchSec * 1000);
    const rec = { end, viewers: 0, startedAt: Date.now() };
    this.rooms.set(username, rec);
    this.stats.sessions++;
    const onBox = (d) => { ok = true; this.add(normalize(username, d, { roomId: meta.roomId, viewers })); };
    c.on('connected', () => { ok = true; });
    c.on('envelope', onBox);
    c.on('superFanBox', onBox);
    c.on('roomUser', (d) => { viewers = Number(d && d.viewerCount) || viewers; rec.viewers = viewers; });
    c.on('streamEnd', () => end('yayın bitti'));
    c.on('disconnected', () => end('koptu'));
    c.on('error', () => {});
    try { await c.connect(meta.roomId || undefined); } catch (e) { end('bağlanamadı: ' + String(e.message || e).slice(0, 80)); }
  }

  add(box) {
    if (!box || this.seen.has(box.id)) return;
    this.seen.add(box.id);
    this.boxes.unshift(box);
    this.boxes.length = Math.min(this.boxes.length, this.o.keep);
    this.stats.boxes++;
    this.boxCount.set(box.username, (this.boxCount.get(box.username) || 0) + 1);
    this.emit('box', box);
    this.save();
    if (this.o.ntfyTopic) {
      fetch('https://ntfy.sh/' + this.o.ntfyTopic, { method: 'POST', body: JSON.stringify({ key: this.o.ntfyKey, box }),
        signal: AbortSignal.timeout(10000) }).catch(() => {});
    }
  }
  save(now) {
    clearTimeout(this._w);
    const write = () => {
      try {
        fs.mkdirSync(this.o.dataDir, { recursive: true });
        const at = new Date().toISOString(), now = Date.now();
        fs.writeFileSync(this.file, JSON.stringify({ scannedAt: at, boxes: this.boxes }));
        const streamers = [...this.live.values()].filter((v) => now - v.seenAt < 900e3).map((v) => {
          const r = this.rooms.get(v.username);
          return { ...v, watching: !!r, viewers: r ? r.viewers : 0, boxes: this.boxCount.get(v.username) || 0 };
        });
        fs.writeFileSync(path.join(this.o.dataDir, 'live.json'), JSON.stringify({ scannedAt: at, stats: this.stats, streamers }));
      } catch (e) { this.fail(e); }
    };
    if (now) write(); else this._w = setTimeout(write, 1500);
  }
}

module.exports = { Scanner };

if (require.main === module) { // CLI: node src/scanner.js --minutes=230 --ntfy-topic=...
  const a = Object.fromEntries(process.argv.slice(2).map((x) => x.replace(/^--/, '').split('=')));
  const s = new Scanner({ ntfyTopic: a['ntfy-topic'] || process.env.NTFY_TOPIC || '', ntfyKey: a['ntfy-key'] || process.env.NTFY_KEY || '',
    hourBudget: Number(a['hour-budget']) || 25, maxRooms: Number(a['max-rooms']) || 12, watchSec: Number(a['watch-sec']) || 300 });
  s.on('box', (b) => console.log('kutu', b.username, b.kind, b.coins, '/', b.people));
  s.on('session', (e) => console.log('oturum', e.username, e.ok ? 'ok' : 'başarısız', e.why));
  s.start();
  const stop = () => { s.stop(); process.exit(0); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  if (Number(a.minutes) > 0) setTimeout(stop, Number(a.minutes) * 60e3);
}
