'use strict';
const test = require('node:test');
const assert = require('node:assert');
const F = require('../web/filters.js');
const { normalize } = require('../src/boxes.js');

const now = 1_700_000_000_000;
const mk = (o) => ({ id: o.id, t: now - 10_000, username: 'u' + o.id, kind: 'chest', coins: 875, people: 500, viewers: 76,
  availableAt: now + 60_000, ...o });

test('oran = jeton / kişi', () => {
  assert.strictEqual(F.derive(mk({ id: 'a' }), now).ratio, 1.75);
  assert.strictEqual(F.derive(mk({ id: 'b', people: 0 }), now).ratio, 0); // kişi bilinmiyorsa uydurma yok
});
test('sekme ve eşik birlikte çalışır', () => {
  const list = [mk({ id: '1' }), mk({ id: '2', kind: 'letter' }), mk({ id: '3', coins: 100 })];
  assert.strictEqual(F.apply(list, { tab: 'chest' }, now).length, 2);
  assert.strictEqual(F.apply(list, { tab: 'ratio2' }, now).length, 0); // varsayılan oran 1,75 < 2
  assert.strictEqual(F.apply([mk({ id: '4', coins: 2000 })], { tab: 'ratio2' }, now).length, 1); // oran 4 ≥ 2
  assert.strictEqual(F.apply(list, { tab: 'chest', minCoins: 500 }, now).length, 1);
});
test('açıldıktan sonra gizleme', () => {
  const l = [mk({ id: 'x', availableAt: now - 90_000 })];
  assert.strictEqual(F.apply(l, { tab: 'chest', hideLate: 60 }, now).length, 0);
  assert.strictEqual(F.apply(l, { tab: 'chest', hideLate: 120 }, now).length, 1);
});
test('businessType eşlemesi: süper fan kutusu sandık sayılmaz', () => {
  const fan = normalize('a', { envelopeInfo: { businessType: 19, diamondCount: 10, envelopeId: 'f1' } }, { now });
  assert.strictEqual(fan.kind, 'fan');
  const letter = normalize('a', { envelopeInfo: { businessType: 21, diamondCount: 10, envelopeId: 'l1' } }, { now });
  assert.strictEqual(letter.kind, 'letter');
});
test('normalize: gerçek biçim ve kimliksiz kutu', () => {
  const b = normalize('ali', { envelopeInfo: { businessType: 20, diamondCount: 875, peopleCount: 500, envelopeId: 'e1', secondsUntilOpen: 120 } }, { now });
  assert.strictEqual(b.kind, 'chest'); assert.strictEqual(b.coins, 875); assert.strictEqual(b.availableAt, now + 120_000);
  assert.strictEqual(normalize('ali', { envelopeInfo: { diamondCount: 5 } }, { now }), null);
});
