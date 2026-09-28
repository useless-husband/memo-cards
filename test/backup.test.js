import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBackup, validateBackup } from '../src/backup.js';
import { createMemoryStore } from '../src/store.js';
import { normalizeSettings } from '../src/settings.js';
import { T0, mkCards } from './helpers.js';

const sample = () => {
  const cards = mkCards(3);
  return {
    decks: [{ id: 'd1', name: '牌組', created: T0 }],
    cards,
    revlog: [{ id: 'l1', cardId: 'c000', deckId: 'd1', ts: T0, rating: 3, prevState: 'new', newState: 'learning' }],
    settings: normalizeSettings({}),
  };
};

test('備份可通過驗證，內容原樣還原', () => {
  const b = JSON.parse(JSON.stringify(makeBackup(sample(), T0)));
  const v = validateBackup(b);
  assert.equal(v.ok, true, v.errors.join());
  assert.equal(v.data.cards.length, 3);
  assert.equal(v.data.revlog.length, 1);
  assert.equal(b.exportedAt, '2026-01-15T02:00:00.000Z');
});

test('拒絕非本 App 的檔案與未來版本', () => {
  assert.equal(validateBackup({ app: 'other', version: 1, decks: [], cards: [], revlog: [] }).ok, false);
  assert.equal(validateBackup({ app: 'memo-cards', version: 99, decks: [], cards: [], revlog: [] }).ok, false);
  assert.equal(validateBackup(null).ok, false);
  assert.equal(validateBackup([]).ok, false);
});

test('缺少陣列時報錯', () => {
  const v = validateBackup({ app: 'memo-cards', version: 1, decks: [] });
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => e.includes('cards')));
});

test('卡片指向不存在的牌組、狀態無效、id 重複都會被擋下', () => {
  const b = makeBackup(sample(), T0);
  b.cards[0].deckId = 'nope';
  b.cards[1].state = 'weird';
  b.cards.push({ ...b.cards[2] });
  const v = validateBackup(b);
  assert.equal(v.ok, false);
  assert.equal(v.errors.length, 3);
});

test('正面或背面是空的會報錯', () => {
  const b = makeBackup(sample(), T0);
  b.cards[0].front = '  ';
  assert.equal(validateBackup(b).ok, false);
});

test('壞掉的複習紀錄會被略過而不是讓整份備份失敗', () => {
  const b = makeBackup(sample(), T0);
  b.revlog.push({ cardId: 'ghost', ts: 1, rating: 3 }, { cardId: 'c000', ts: 'x', rating: 3 });
  const v = validateBackup(b);
  assert.equal(v.ok, true);
  assert.equal(v.data.revlog.length, 1);
});

test('缺少的數值欄位會補預設值；設定會被正規化', () => {
  const b = makeBackup(sample(), T0);
  delete b.cards[0].ease;
  b.settings = { newPerDay: -5, algorithm: 'zzz' };
  const v = validateBackup(b);
  assert.equal(v.data.cards[0].ease, 2.5);
  assert.equal(v.data.settings.newPerDay, 0);
  assert.equal(v.data.settings.algorithm, 'fsrs');
});

test('記憶體儲存：寫入、讀取、刪除牌組連帶刪除卡片與紀錄、整批取代', async () => {
  const st = createMemoryStore();
  const s = sample();
  await st.replaceAll(s);
  let d = await st.load();
  assert.equal(d.cards.length, 3);
  await st.deleteCards(['c000']);
  d = await st.load();
  assert.equal(d.cards.length, 2);
  assert.equal(d.revlog.length, 0);
  await st.addLog({ id: 'z', cardId: 'c001', deckId: 'd1', ts: T0, rating: 3 });
  await st.deleteDeck('d1');
  d = await st.load();
  assert.deepEqual([d.decks.length, d.cards.length, d.revlog.length], [0, 0, 0]);
});
