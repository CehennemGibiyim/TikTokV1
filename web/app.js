(function () {
  'use strict';
  const F = window.Filters, CFG = window.RADAR_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const boxes = new Map(); // id -> kutu
  let streams = []; // keşfedilen canlı yayınlar (data/live.json)
  const ids = ['minCoins', 'minRatio', 'maxTime', 'hideLate', 'sort'];
  const saved = (() => { try { return JSON.parse(localStorage.getItem('radar') || '{}'); } catch { return {}; } })();
  const st = { tab: saved.tab || 'chest', ...saved };

  ids.forEach((i) => { if (st[i] != null) $(i).value = st[i]; });
  ['viewersLtPeople', 'desc', 'sound'].forEach((i) => { $(i).checked = !!st[i]; });
  const params = () => {
    ids.forEach((i) => { st[i] = $(i).value; });
    ['viewersLtPeople', 'desc', 'sound'].forEach((i) => { st[i] = $(i).checked; });
    try { localStorage.setItem('radar', JSON.stringify(st)); } catch { /* özel mod */ }
    return st;
  };
  document.querySelector('.filters').addEventListener('input', render);

  function status(text, cls) { const s = $('status'); s.textContent = text; s.className = 'st ' + (cls || ''); }
  function add(b) { if (b && b.id && !boxes.has(b.id)) { boxes.set(b.id, b); return true; } return false; }
  const fmt = (s) => (s <= 0 ? 'açıldı' : Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const KIND = { chest: '🎁 Sandık', letter: '✉️ Zarf', portal: '🌀 Portal' };

  function render() {
    const p = params(), now = Date.now(), all = [...boxes.values()];
    const c = F.counts(all, p, now);
    $('tabs').innerHTML = F.TABS.map((t) => `<button data-t="${t.id}" class="${t.id === st.tab ? 'on' : ''}">${t.label}<b>${c[t.id]}</b></button>`).join('') + `<button data-t="streams" class="${st.tab === 'streams' ? 'on' : ''}">Yayınlar<b>${streams.length}</b></button>`;
    if (st.tab === 'streams') {
      $('list').innerHTML = streams.length ? streams.map((s) => `<div class="card"><div class="row"><span class="user">@${esc(s.username)}</span><span class="kind">${esc(s.region || '')}</span></div>
      <div class="meta">${s.watching ? '🟢 dinleniyor' : '🔴 canlı'} · ${s.viewers ? s.viewers + ' izleyici · ' : ''}${s.boxes} kutu · ${Math.max(0, Math.round((now - s.seenAt) / 60000))} dk önce · <a href="https://www.tiktok.com/@${esc(s.username)}/live" target="_blank" rel="noopener">TikTok'ta aç</a></div></div>`).join('')
        : '<div class="empty">Henüz yayın bulunamadı. Tarayıcı çalışınca burada listelenir.</div>';
      return;
    }
    const rows = F.apply(all, { ...p, tab: st.tab }, now);
    $('list').innerHTML = rows.length ? rows.map((b) => {
      const cls = b.left > 60 ? 'ok' : b.left > 20 ? 'mid' : 'hot';
      return `<div class="card ${b.ratio >= 1.75 ? 'hi' : ''}"><div class="row"><span class="user">@${esc(b.username)}</span><span class="kind">${KIND[b.kind] || b.kind}</span></div>
      <div class="row"><span class="big">${b.coins ? b.coins.toLocaleString('tr') : '?'} <small>jeton</small></span><span class="cd ${cls}">${fmt(b.left)}</span></div>
      <div class="meta">${b.people ? b.people + ' kişi · oran ' + b.ratio : 'kişi sayısı bilinmiyor'} · ${b.viewers || '?'} izleyici · <a href="https://www.tiktok.com/@${esc(b.username)}/live" target="_blank" rel="noopener">TikTok'ta aç</a></div></div>`;
    }).join('') : '<div class="empty">Bu filtreyle kutu yok. Yeni kutu düşünce kendiliğinden görünür.</div>';
  }
  $('tabs').addEventListener('click', (e) => { const t = e.target.closest('button'); if (t) { st.tab = t.dataset.t; render(); } });

  function onNew(b) {
    if (!add(b)) return;
    if (st.sound) { try { const a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(); o.connect(a.destination); o.frequency.value = 880; o.start(); o.stop(a.currentTime + 0.15); } catch { /* ses yok */ } }
    render();
  }

  async function poll() { // dosya yolu (Pages + yerel): 15 sn'de bir
    try {
      const r = await fetch('data/boxes.json?t=' + Date.now(), { cache: 'no-store' });
      const d = await r.json();
      (d.boxes || []).forEach(add);
      try { streams = (await (await fetch('data/live.json?t=' + Date.now(), { cache: 'no-store' })).json()).streamers || []; } catch { /* live.json yok */ }
      status(d.scannedAt ? 'veri: ' + new Date(d.scannedAt).toLocaleTimeString('tr') : 'henüz veri yok', 'live');
      render();
    } catch { status('veri okunamadı', 'bad'); }
  }

  function live() { // anlık akış: önce yerel SSE, yoksa ntfy
    if (!window.EventSource) return;
    const es = new EventSource('api/stream');
    es.addEventListener('box', (e) => { try { onNew(JSON.parse(e.data)); } catch { /* bozuk */ } });
    es.onopen = () => status('canlı (yerel)', 'live');
    es.onerror = () => {
      es.close();
      if (!CFG.ntfyTopic) return;
      const n = new EventSource('https://ntfy.sh/' + CFG.ntfyTopic + '/sse');
      n.onmessage = (e) => {
        try { const m = JSON.parse(JSON.parse(e.data).message); if (m.key === CFG.boxKey) onNew(m.box); } catch { /* yabancı mesaj */ }
      };
    };
  }

  poll(); setInterval(poll, 15000); live();
  setInterval(render, 1000); // geri sayım
})();
