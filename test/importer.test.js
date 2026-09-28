import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV } from '../src/csv.js';
import { analyzeRows, buildCards, cardsToCSV, defaultMapping, dupKey, guessMapping, splitTags } from '../src/importer.js';
import { T0, mkCards } from './helpers.js';

test('依標題猜欄位（中英文同義詞）', () => {
  assert.deepEqual(guessMapping(['單字', '意思', '例句', '標籤']), ['front', 'back', 'example', 'tags']);
  assert.deepEqual(guessMapping(['Word', 'Meaning', 'foo']), ['front', 'back', 'skip']);
});

test('同一欄位不會被對應兩次', () => {
  assert.deepEqual(guessMapping(['front', '正面']), ['front', 'skip']);
});

test('沒有標題時的預設對應', () => {
  assert.deepEqual(defaultMapping(6), ['front', 'back', 'example', 'tags', 'skip', 'skip']);
});

test('分析：正常、缺欄位、重複', () => {
  const rows = parseCSV('front,back\napple,蘋果\n,空正面\npear,\nApple ,又一個');
  const r = analyzeRows(rows, { mapping: ['front', 'back'], hasHeader: true });
  assert.deepEqual(r.items.map((i) => i.status), ['ok', 'invalid', 'invalid', 'duplicate']);
  assert.deepEqual(r.counts, { ok: 1, invalid: 2, duplicate: 1 });
  assert.equal(r.items[1].reason, '缺少正面');
  assert.equal(r.items[0].line, 2);
});

test('與既有卡片重複偵測（忽略大小寫、全形、空白）', () => {
  const existing = mkCards(1).map((c) => ({ ...c, front: 'ｈｅｌｌｏ  world' }));
  const r = analyzeRows([['Hello World', 'x']], { mapping: ['front', 'back'], hasHeader: false, existing });
  assert.equal(r.items[0].status, 'duplicate');
});

test('重複處理選「仍然匯入」', () => {
  const r = analyzeRows([['a', '1'], ['a', '2']], { mapping: ['front', 'back'], hasHeader: false, dupMode: 'keep' });
  assert.deepEqual(r.items.map((i) => i.status), ['ok', 'ok']);
  assert.equal(r.items[1].reason, '已存在相同的正面');
});

test('欄位對應可以調換與略過', () => {
  const r = analyzeRows([['蘋果', 'apple', '忽略我']], { mapping: ['back', 'front', 'skip'], hasHeader: false });
  assert.deepEqual(r.items[0].fields, { front: 'apple', back: '蘋果', example: '', tags: '' });
});

test('太長的欄位視為無效', () => {
  const r = analyzeRows([['x'.repeat(201), 'b']], { mapping: ['front', 'back'], hasHeader: false });
  assert.equal(r.items[0].status, 'invalid');
});

test('標籤切分並去重', () => {
  assert.deepEqual(splitTags('學測;多益 學測|動詞、'), ['學測', '多益', '動詞']);
  assert.deepEqual(splitTags(''), []);
});

test('dupKey 正規化', () => {
  assert.equal(dupKey('  Ｈello   World '), 'hello world');
});

test('buildCards 只建立 ok 的列，並依序給 order', () => {
  const r = analyzeRows([['a', '1', 'ex', 't1;t2'], ['', '2'], ['b', '3']], { mapping: ['front', 'back', 'example', 'tags'], hasHeader: false });
  let n = 0;
  const cards = buildCards(r.items, { deckId: 'd', now: T0, makeId: () => `id${n++}`, startOrder: 10 });
  assert.equal(cards.length, 2);
  assert.deepEqual(cards.map((c) => [c.id, c.order, c.state]), [['id0', 10, 'new'], ['id1', 11, 'new']]);
  assert.deepEqual(cards[0].tags, ['t1', 't2']);
  assert.equal(cards[0].example, 'ex');
});

test('匯出 CSV 再匯入，內容一致', () => {
  const cards = mkCards(3).map((c, i) => ({ ...c, front: `詞,${i}`, back: `說 "${i}"\n換行`, example: `ex ${i}`, tags: ['a', 'b'] }));
  const csv = cardsToCSV(cards);
  assert.ok(csv.startsWith('﻿正面,背面,例句,標籤'));
  const rows = parseCSV(csv);
  const r = analyzeRows(rows, { mapping: guessMapping(rows[0]), hasHeader: true });
  assert.equal(r.counts.ok, 3);
  const back = buildCards(r.items, { deckId: 'd', now: T0, makeId: () => 'x' });
  assert.deepEqual(back.map((c) => [c.front, c.back, c.example, c.tags]), cards.map((c) => [c.front, c.back, c.example, c.tags]));
});
