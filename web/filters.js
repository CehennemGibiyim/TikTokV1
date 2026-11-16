// Filtre/sekme motoru. Tarayıcıda window.Filters, Node'da require ile kullanılır.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.Filters = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // Oran = jeton / kişi. Gerçek sandıklarda medyan ~1,7; eşik panelden değiştirilebilir.
  const TABS = [
    { id: 'chest', label: 'Sandık', filter: { kind: 'chest' } },
    { id: 'letter', label: 'Zarf', filter: { kind: 'letter' } },
    { id: 'portal', label: 'Portal', filter: { kind: 'portal' } },
    { id: 'ratio2', label: 'Oran ≥ 2', filter: { minRatio: 2 } },
    { id: 'ratio4', label: 'Oran ≥ 4', filter: { minRatio: 4 } },
    { id: 'kismet', label: 'Kısmet (oran ≥ 7)', filter: { minRatio: 7 } },
    { id: 'fresh', label: 'Yeni', filter: { maxAge: 120 } },
  ];

  function derive(b, now) {
    const people = b.people || 0;
    const delta = Math.round((b.availableAt - now) / 1000);
    return { ...b, ratio: b.coins && people ? Math.round((b.coins / people) * 100) / 100 : 0,
      left: Math.max(0, delta), delta, age: Math.round((now - b.t) / 1000),
      status: delta <= 0 ? 'open' : 'upcoming', viewersLtPeople: !!people && (b.viewers || 0) < people };
  }

  const n = (v) => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));

  // p: { tab, minCoins, minRatio, maxTime, maxViewers, viewersLtPeople, hideLate, sort, desc }
  function apply(boxes, p, now = Date.now()) {
    const tab = TABS.find((t) => t.id === p.tab);
    const tf = (tab && tab.filter) || {};
    const minRatio = Math.max(n(p.minRatio) || 0, tf.minRatio || 0); // sekme ve kullanıcı eşiğinden sıkı olan
    const minCoins = n(p.minCoins), maxTime = n(p.maxTime), maxViewers = n(p.maxViewers), hideLate = n(p.hideLate);
    const out = boxes.map((b) => derive(b, now)).filter((b) =>
      (!tf.kind || b.kind === tf.kind) &&
      (!tf.maxAge || b.age <= tf.maxAge) &&
      (!minRatio || b.ratio >= minRatio) &&
      (minCoins == null || b.coins >= minCoins) &&
      (maxTime == null || b.left <= maxTime) &&
      (maxViewers == null || b.viewers <= maxViewers) &&
      (!p.viewersLtPeople || b.viewersLtPeople) &&
      (hideLate == null || b.delta >= -hideLate));
    const key = { opens: (b) => b.availableAt, coins: (b) => b.coins, ratio: (b) => b.ratio, viewers: (b) => b.viewers }[p.sort] || ((b) => b.availableAt);
    out.sort((a, b) => key(a) - key(b));
    if (p.desc) out.reverse();
    return out;
  }

  function counts(boxes, p, now = Date.now()) {
    const c = {};
    TABS.forEach((t) => { c[t.id] = apply(boxes, { ...p, tab: t.id }, now).length; });
    return c;
  }
  return { TABS, derive, apply, counts };
});
