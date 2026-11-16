'use strict';
// TikTok kutu olayını (envelope / superFanBox) tek şemaya çevirir. Değer uydurmaz.
const KIND = { 9: 'portal', 19: 'fan', 20: 'chest', 21: 'letter' };
// 19 = süper fan kutusu (sandık değil, ayrı pay mantığı); eşlenmeyen kod 'letter' sayılır.

const num = (...vals) => {
  for (const v of vals) {
    if (v === undefined || v === null || v === '') continue;
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) return Math.round(n);
  }
  return 0;
};
const ms = (v) => { const n = Number(v) || 0; return n > 1e12 ? n : n * 1000; };

function normalize(username, data, ctx = {}) {
  const info = (data && (data.envelopeInfo || data)) || {};
  const box = (data && data.treasureBoxData) || info.treasureBoxData || {};
  const envelopeId = String(info.envelopeId || '').trim();
  if (!envelopeId) return null; // kimliksiz kutu tekilleştirilemez
  const now = ctx.now || Date.now();
  const bt = num(info.businessType, info.envelopeType, box.businessType);
  let availableAt = ms(info.unpackAt || box.unpackAt || box.canOpen);
  if (!availableAt) availableAt = now + num(info.secondsUntilOpen, box.secondsUntilOpen) * 1000;
  return {
    id: `${username}-env-${envelopeId}`, t: now, username,
    kind: KIND[bt] || 'letter', businessType: bt,
    coins: num(info.diamondCount, info.coinCount, info.coins, box.diamondCount, box.coins),
    people: num(info.peopleCount, info.recipientCount, info.people, info.participants, box.peopleCount),
    viewers: ctx.viewers || 0, roomId: ctx.roomId || '',
    availableAt, durationSec: Math.max(0, Math.round((availableAt - now) / 1000)),
  };
}
module.exports = { normalize };
