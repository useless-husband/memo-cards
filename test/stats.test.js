import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distribution, forecast, retention, streak, todayReviews } from '../src/stats.js';
import { dayIndex, dayStart } from '../src/dates.js';
import { State } from '../src/scheduler.js';
import { DAY, T0, TW, ctxAt, mkCards } from './helpers.js';

const log = (ts, extra = {}) => ({ ts, deckId: 'd1', rating: 3, prevState: 'review', ...extra });

test('今日複習數只算今天（換日 4 點）', () => {
  const logs = [log(T0 - DAY), log(T0 - 1000), log(T0), log(T0 + 1000)];
  assert.equal(todayReviews(logs, ctxAt(T0 + 5000)), 3);
});

test('今日複習數可依牌組篩選', () => {
  const logs = [log(T0, { deckId: 'a' }), log(T0, { deckId: 'b' })];
  assert.equal(todayReviews(logs, ctxAt(T0), 4, 'a'), 1);
});

test('連續天數：今天、昨天、前天都有 → 3', () => {
  const logs = [log(T0 - 2 * DAY), log(T0 - DAY), log(T0)];
  assert.equal(streak(logs, ctxAt(T0)), 3);
});

test('連續天數：今天還沒複習，從昨天往回算', () => {
  const logs = [log(T0 - 2 * DAY), log(T0 - DAY)];
  assert.equal(streak(logs, ctxAt(T0)), 2);
});

test('連續天數：中斷一天就重算', () => {
  const logs = [log(T0 - 5 * DAY), log(T0 - 4 * DAY), log(T0 - DAY), log(T0)];
  assert.equal(streak(logs, ctxAt(T0)), 2);
});

test('連續天數：昨天也沒有 → 0', () => {
  assert.equal(streak([log(T0 - 3 * DAY)], ctxAt(T0)), 0);
  assert.equal(streak([], ctxAt(T0)), 0);
});

test('連續天數跨時區（同一批紀錄，不同時區算出不同天數）', () => {
  // 台灣 23:00 與隔天 01:00：台灣算 2 天前後但仍是同一個學習日（換日 4 點）
  const a = Date.UTC(2026, 0, 14, 15, 0); // 台灣 14 日 23:00
  const b = Date.UTC(2026, 0, 14, 17, 0); // 台灣 15 日 01:00（仍屬 14 日）
  assert.equal(streak([log(a), log(b)], ctxAt(b + 1000, 480)), 1);
  // 換成 UTC，兩者在不同天
  assert.equal(streak([log(a), log(b)], ctxAt(b + 1000, 0)), 1);
  assert.equal(dayIndex(a, 0), dayIndex(b, 0) - 0);
});

test('到期預測：逾期算今天、超出 30 天不算、新卡不算', () => {
  const today = dayIndex(T0, TW);
  const cards = mkCards(6).map((c, i) => ({
    ...c,
    state: i === 5 ? State.New : State.Review,
    due: [dayStart(today - 3, TW), dayStart(today, TW), dayStart(today + 1, TW), dayStart(today + 29, TW), dayStart(today + 30, TW), T0][i],
  }));
  const f = forecast(cards, ctxAt(T0));
  assert.equal(f.length, 30);
  assert.deepEqual([f[0], f[1], f[29]], [2, 1, 1]);
  assert.equal(f.reduce((a, b) => a + b, 0), 4);
});

test('到期預測可依牌組篩選', () => {
  const cards = mkCards(2).map((c, i) => ({ ...c, deckId: i ? 'b' : 'a', state: State.Review, due: T0 }));
  assert.equal(forecast(cards, ctxAt(T0), 4, 30, 'a').reduce((x, y) => x + y, 0), 1);
});

test('保留率：只算複習卡、最近 30 天、評分大於忘記', () => {
  const logs = [
    log(T0, { rating: 3 }),
    log(T0, { rating: 1 }),
    log(T0, { rating: 4 }),
    log(T0, { rating: 2 }),
    log(T0, { rating: 1, prevState: 'learning' }),
    log(T0 - 40 * DAY, { rating: 1 }),
  ];
  const r = retention(logs, ctxAt(T0));
  assert.equal(r.total, 4);
  assert.equal(r.rate, 0.75);
});

test('保留率：沒有資料時為 null', () => {
  assert.deepEqual(retention([], ctxAt(T0)), { rate: null, total: 0 });
});

test('狀態分布：重新學習的卡算「已遺忘」', () => {
  const states = [State.New, State.New, State.Learning, State.Review, State.Review, State.Review, State.Relearning];
  const cards = mkCards(7).map((c, i) => ({ ...c, state: states[i] }));
  assert.deepEqual(distribution(cards), { new: 2, learning: 1, review: 3, forgotten: 1 });
});
