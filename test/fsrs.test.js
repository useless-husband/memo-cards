import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_W, Rating, initDifficulty, initStability, nextDifficulty, nextForgetStability, nextInterval, nextRecallStability, retrievability, reviewMemory } from '../src/fsrs.js';
import { near } from './helpers.js';

// 期望值由獨立的 Python 實作依 FSRS-4.5 公式算出（見 README「測試向量」）。

test('FSRS-4.5 預設參數共 17 個', () => {
  assert.equal(DEFAULT_W.length, 17);
  assert.equal(DEFAULT_W[2], 3.7145);
});

test('初始穩定度等於 w[0..3]', () => {
  assert.equal(initStability(1), 0.4872);
  assert.equal(initStability(2), 1.4003);
  assert.equal(initStability(3), 3.7145);
  assert.equal(initStability(4), 13.8206);
});

test('初始難度：忘記 7.6214 / 困難 6.3916 / 良好 5.1618 / 簡單 3.932', () => {
  assert.ok(near(initDifficulty(1), 7.6214));
  assert.ok(near(initDifficulty(2), 6.3916));
  assert.ok(near(initDifficulty(3), 5.1618));
  assert.ok(near(initDifficulty(4), 3.932));
});

test('難度限制在 1 到 10', () => {
  const w = [...DEFAULT_W];
  w[4] = 50;
  assert.equal(initDifficulty(1, w), 10);
  w[4] = -50;
  assert.equal(initDifficulty(4, w), 1);
});

test('可提取性：t = S 時剛好 90%', () => {
  assert.ok(near(retrievability(1, 1), 0.9, 1e-12));
  assert.ok(near(retrievability(3.7145, 3.7145), 0.9, 1e-12));
  assert.equal(retrievability(0, 5), 1);
});

test('可提取性隨時間遞減', () => {
  assert.ok(retrievability(1, 5) > retrievability(10, 5));
  assert.ok(retrievability(10, 5) > retrievability(100, 5));
});

test('目標保留率 90% 時，間隔 = 穩定度（四捨五入）', () => {
  assert.equal(nextInterval(3.7145, 0.9), 4);
  assert.equal(nextInterval(13.8206, 0.9), 14);
  assert.equal(nextInterval(0.4872, 0.9), 1);
});

test('保留率越高、間隔越短；有上限', () => {
  assert.ok(nextInterval(30, 0.95) < nextInterval(30, 0.9));
  assert.ok(nextInterval(30, 0.8) > nextInterval(30, 0.9));
  assert.equal(nextInterval(1e9, 0.9, 365), 365);
});

test('向量：良好 → 4 天後良好 → 10 天後良好 …（穩定度）', () => {
  let m = reviewMemory(null, Rating.Good, 0);
  assert.ok(near(m.stability, 3.7145) && near(m.difficulty, 5.1618));
  m = reviewMemory(m, Rating.Good, 4);
  assert.ok(near(m.stability, 14.808101, 1e-4));
  assert.ok(near(m.difficulty, 5.1618, 1e-4));
  m = reviewMemory(m, Rating.Good, 10);
  assert.ok(near(m.stability, 38.716633, 1e-4));
});

test('向量：困難（20 天後）降低成長並提高難度', () => {
  let m = { stability: 38.716633, difficulty: 5.1618 };
  m = reviewMemory(m, Rating.Hard, 20);
  assert.ok(near(m.stability, 48.403332, 1e-3));
  assert.ok(near(m.difficulty, 6.031478, 1e-4));
});

test('向量：簡單（30 天後）', () => {
  const m = reviewMemory({ stability: 48.403332, difficulty: 6.031478 }, Rating.Easy, 30);
  assert.ok(near(m.stability, 198.556897, 1e-2));
  assert.ok(near(m.difficulty, 5.13484, 1e-4));
});

test('向量：忘記（5 天後）穩定度大幅下降', () => {
  const m = reviewMemory({ stability: 198.556897, difficulty: 5.13484 }, Rating.Again, 5);
  assert.ok(near(m.stability, 8.515564, 1e-3));
  assert.ok(near(m.difficulty, 6.875031, 1e-4));
});

test('同樣條件下：簡單 > 良好 > 困難 的穩定度', () => {
  const mem = { stability: 10, difficulty: 5 };
  const h = reviewMemory(mem, 2, 10).stability;
  const g = reviewMemory(mem, 3, 10).stability;
  const e = reviewMemory(mem, 4, 10).stability;
  assert.ok(h < g && g < e);
});

test('答對後穩定度變大；忘記後穩定度變小', () => {
  const mem = { stability: 20, difficulty: 5 };
  assert.ok(reviewMemory(mem, 3, 20).stability > 20);
  assert.ok(reviewMemory(mem, 1, 20).stability < 20);
});

test('太早複習（可提取性高）成長較少', () => {
  const early = nextRecallStability(5, 10, retrievability(1, 10), 3);
  const late = nextRecallStability(5, 10, retrievability(30, 10), 3);
  assert.ok(early < late);
});

test('難度越高、穩定度成長越少', () => {
  const easy = nextRecallStability(2, 10, 0.9, 3);
  const hard = nextRecallStability(9, 10, 0.9, 3);
  assert.ok(easy > hard);
});

test('難度向 Good 的初始值均值回歸', () => {
  let d = 10;
  for (let i = 0; i < 2000; i++) d = nextDifficulty(d, 3);
  assert.ok(near(d, initDifficulty(3), 1e-3));
});

test('忘記穩定度不會是負的或 NaN', () => {
  const s = nextForgetStability(10, 0.1, 0.5);
  assert.ok(Number.isFinite(s) && s > 0);
});
