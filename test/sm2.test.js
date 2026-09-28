import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MIN_EASE, START_EASE, sm2Next, sm2RelearnInterval } from '../src/sm2.js';
import { near } from './helpers.js';

const base = { ease: START_EASE, interval: 0, reps: 0 };

test('第一次答對 1 天、第二次 6 天、之後乘以 EF', () => {
  let s = sm2Next(base, 3);
  assert.deepEqual([s.interval, s.reps], [1, 1]);
  s = sm2Next(s, 3);
  assert.equal(s.interval, 6);
  s = sm2Next(s, 3);
  assert.equal(s.interval, 15);
  s = sm2Next(s, 3);
  assert.equal(s.interval, 38);
});

test('良好（品質 4）不改變 EF', () => {
  assert.ok(near(sm2Next({ ease: 2.5, interval: 6, reps: 2 }, 3).ease, 2.5, 1e-12));
});

test('簡單 +0.10、困難 −0.14（經典公式）', () => {
  assert.ok(near(sm2Next({ ease: 2.5, interval: 6, reps: 2 }, 4).ease, 2.6, 1e-12));
  assert.ok(near(sm2Next({ ease: 2.5, interval: 6, reps: 2 }, 2).ease, 2.36, 1e-12));
});

test('EF 不會低於 1.3', () => {
  let s = { ease: 1.35, interval: 10, reps: 5 };
  for (let i = 0; i < 5; i++) s = sm2Next(s, 2);
  assert.equal(s.ease, MIN_EASE);
  assert.equal(sm2Next({ ease: 1.3, interval: 10, reps: 5 }, 1).ease, MIN_EASE);
});

test('忘記：重來、間隔 1 天、標記 lapsed', () => {
  const s = sm2Next({ ease: 2.5, interval: 30, reps: 6 }, 1);
  assert.deepEqual([s.interval, s.reps, s.lapsed], [1, 0, true]);
  assert.ok(near(s.ease, 2.3, 1e-12));
});

test('第三次以後：困難 < 良好 < 簡單，且都至少多一天', () => {
  const st = { ease: 2.5, interval: 10, reps: 4 };
  const h = sm2Next(st, 2).interval;
  const g = sm2Next(st, 3).interval;
  const e = sm2Next(st, 4).interval;
  assert.ok(h > 10 && h < g && g < e);
});

test('間隔有上限', () => {
  assert.equal(sm2Next({ ease: 3, interval: 30000, reps: 9 }, 4, 36500).interval, 36500);
});

test('重新學習畢業間隔', () => {
  assert.equal(sm2RelearnInterval(3), 1);
  assert.equal(sm2RelearnInterval(4), 2);
});
