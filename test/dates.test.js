import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAY, dayEnd, dayIndex, dayStart, formatInterval } from '../src/dates.js';
import { T0, TW } from './helpers.js';

test('凌晨 4 點前算前一天（台灣）', () => {
  const d15_10 = dayIndex(Date.UTC(2026, 0, 15, 2), TW);
  const d15_0359 = dayIndex(Date.UTC(2026, 0, 14, 19, 59), TW); // 台灣 15 日 03:59
  const d15_0400 = dayIndex(Date.UTC(2026, 0, 14, 20, 0), TW); // 台灣 15 日 04:00
  assert.equal(d15_0359, d15_0400 - 1);
  assert.equal(d15_10, d15_0400);
});

test('dayStart 與 dayIndex 互為反函數', () => {
  for (const tz of [480, -300, 0, 345]) {
    const idx = dayIndex(T0, tz);
    assert.equal(dayIndex(dayStart(idx, tz), tz), idx);
    assert.equal(dayIndex(dayStart(idx, tz) - 1, tz), idx - 1);
  }
});

test('不同時區同一時刻可能落在不同學習日', () => {
  const t = Date.UTC(2026, 0, 15, 12, 0); // UTC 12:00
  assert.equal(dayIndex(t, 480) - dayIndex(t, -300), 0); // 台灣 20:00 vs 紐約 07:00，同一天
  const t2 = Date.UTC(2026, 0, 15, 22, 0); // 台灣隔天 06:00；紐約 17:00
  assert.equal(dayIndex(t2, 480) - dayIndex(t2, -300), 1);
});

test('dayEnd 是下一個換日時刻', () => {
  assert.equal(dayEnd(T0, TW) - dayStart(dayIndex(T0, TW), TW), DAY);
});

test('可自訂換日時刻', () => {
  const t = Date.UTC(2026, 0, 14, 17, 0); // 台灣 15 日 01:00
  assert.equal(dayIndex(t, TW, 0), dayIndex(t, TW, 4) + 1);
});

test('間隔文字', () => {
  assert.equal(formatInterval({ minutes: 1 }), '1 分');
  assert.equal(formatInterval({ minutes: 5.5 }), '6 分');
  assert.equal(formatInterval({ minutes: 90 }), '1.5 小時');
  assert.equal(formatInterval({ days: 3 }), '3 天');
  assert.equal(formatInterval({ days: 45 }), '1.5 個月');
  assert.equal(formatInterval({ days: 400 }), '1.1 年');
});
