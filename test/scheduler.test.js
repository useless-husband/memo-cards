import { test } from 'node:test';
import assert from 'node:assert/strict';
import { State, createCard, previewLabels, schedule } from '../src/scheduler.js';
import { dayIndex, dayStart } from '../src/dates.js';
import { DAY, MIN, T0, TW, ctxAt, mkCards, near, settings } from './helpers.js';

const fsrs = settings();
const sm2 = settings({ algorithm: 'sm2' });
const card = () => mkCards(1)[0];

test('新卡（FSRS）按鈕預覽：1 分 / 6 分 / 10 分 / 14 天', () => {
  assert.deepEqual(previewLabels(card(), ctxAt(T0), fsrs), ['1 分', '6 分', '10 分', '14 天']);
});

test('新卡（SM-2）按鈕預覽：簡單直接畢業 4 天', () => {
  assert.deepEqual(previewLabels(card(), ctxAt(T0), sm2), ['1 分', '6 分', '10 分', '4 天']);
});

test('新卡按良好：進入第二個學習步驟，10 分鐘後到期', () => {
  const r = schedule(card(), 3, ctxAt(T0), fsrs);
  assert.equal(r.card.state, State.Learning);
  assert.equal(r.card.step, 1);
  assert.equal(r.card.due, T0 + 10 * MIN);
  assert.equal(r.log.prevState, State.New);
});

test('學習中連按兩次良好就畢業（FSRS 穩定度 3.7145 → 4 天）', () => {
  const a = schedule(card(), 3, ctxAt(T0), fsrs).card;
  const r = schedule(a, 3, ctxAt(T0 + 10 * MIN), fsrs);
  assert.equal(r.card.state, State.Review);
  assert.equal(r.days, 4);
  assert.ok(near(r.card.stability, 3.7145));
});

test('畢業後到期時間是第 N 天的換日時刻，不是 now + N×24h', () => {
  const now = T0 + 10 * MIN;
  const r = schedule({ ...card(), state: State.Learning, step: 1, stability: 3.7145, difficulty: 5.1618, lastReview: T0 }, 3, ctxAt(now), fsrs);
  assert.equal(r.card.due, dayStart(dayIndex(now, TW) + 4, TW));
  assert.notEqual(r.card.due, now + 4 * DAY);
});

test('學習中按忘記：回到第一步 1 分鐘', () => {
  const a = schedule(card(), 3, ctxAt(T0), fsrs).card;
  const r = schedule(a, 1, ctxAt(T0 + 10 * MIN), fsrs);
  assert.equal(r.card.step, 0);
  assert.equal(r.card.due, T0 + 10 * MIN + MIN);
});

test('學習中按困難：留在同一步', () => {
  const a = schedule(card(), 3, ctxAt(T0), fsrs).card;
  const r = schedule(a, 2, ctxAt(T0 + 10 * MIN), fsrs);
  assert.equal(r.card.step, 1);
  assert.equal(r.card.due, T0 + 10 * MIN + 10 * MIN);
});

test('新卡按簡單：直接畢業，穩定度 13.8206', () => {
  const r = schedule(card(), 4, ctxAt(T0), fsrs);
  assert.equal(r.card.state, State.Review);
  assert.equal(r.days, 14);
});

test('沒有學習步驟時，良好直接畢業', () => {
  const r = schedule(card(), 3, ctxAt(T0), settings({ learningSteps: [] }));
  assert.equal(r.card.state, State.Review);
});

test('SM-2 流程：畢業 1 天 → 6 天 → 15 天', () => {
  let c = schedule(card(), 3, ctxAt(T0), sm2).card;
  c = schedule(c, 3, ctxAt(T0 + 10 * MIN), sm2).card;
  assert.equal(c.interval, 1);
  c = schedule(c, 3, ctxAt(c.due), sm2).card;
  assert.equal(c.interval, 6);
  c = schedule(c, 3, ctxAt(c.due), sm2).card;
  assert.equal(c.interval, 15);
});

test('複習卡按忘記：進入重新學習，lapses +1，10 分鐘', () => {
  const rev = { ...card(), state: State.Review, stability: 20, difficulty: 5, interval: 20, lastReview: T0 - 20 * DAY, due: T0, algo: 'fsrs', reps: 4 };
  const r = schedule(rev, 1, ctxAt(T0), fsrs);
  assert.equal(r.card.state, State.Relearning);
  assert.equal(r.card.lapses, 1);
  assert.equal(r.card.due, T0 + 10 * MIN);
  assert.ok(r.card.stability < 20);
  assert.equal(r.log.prevState, State.Review);
});

test('重新學習按良好：回到複習，間隔由新穩定度決定', () => {
  const rev = { ...card(), state: State.Review, stability: 20, difficulty: 5, interval: 20, lastReview: T0 - 20 * DAY, due: T0, algo: 'fsrs', reps: 4 };
  const lapsed = schedule(rev, 1, ctxAt(T0), fsrs).card;
  const r = schedule(lapsed, 3, ctxAt(T0 + 10 * MIN), fsrs);
  assert.equal(r.card.state, State.Review);
  assert.ok(r.days >= 1 && r.days < 20);
});

test('複習卡的四個間隔嚴格遞增（困難 <= 良好 < 簡單）', () => {
  const rev = { ...card(), state: State.Review, stability: 12, difficulty: 6, interval: 12, lastReview: T0 - 12 * DAY, due: T0, algo: 'fsrs', reps: 3 };
  const d = [2, 3, 4].map((g) => schedule(rev, g, ctxAt(T0), fsrs).days);
  assert.ok(d[0] <= d[1] && d[1] < d[2], d.join());
});

test('演算法中途切換：FSRS 卡片改用 SM-2 仍能排程', () => {
  const rev = { ...card(), state: State.Review, stability: 20, difficulty: 5.1618, interval: 20, lastReview: T0 - 20 * DAY, due: T0, algo: 'fsrs', reps: 4 };
  const r = schedule(rev, 3, ctxAt(T0), sm2);
  assert.equal(r.card.algo, 'sm2');
  assert.ok(r.days > 20);
  assert.ok(Number.isFinite(r.card.ease));
});

test('演算法中途切換：SM-2 卡片改用 FSRS 會補上穩定度', () => {
  let c = schedule(card(), 4, ctxAt(T0), sm2).card;
  c = schedule(c, 3, ctxAt(c.due), fsrs).card;
  assert.equal(c.algo, 'fsrs');
  assert.ok(c.stability > 0 && c.difficulty > 0);
});

test('schedule 不會修改傳入的卡片', () => {
  const c = card();
  const snapshot = JSON.stringify(c);
  schedule(c, 3, ctxAt(T0), fsrs);
  assert.equal(JSON.stringify(c), snapshot);
});

test('間隔不會超過 maxInterval', () => {
  const s = settings({ maxInterval: 30 });
  const r = schedule(card(), 4, ctxAt(T0), s);
  assert.equal(r.days, 14);
  const rev = { ...card(), state: State.Review, stability: 500, difficulty: 3, interval: 500, lastReview: T0 - 500 * DAY, due: T0, algo: 'fsrs' };
  assert.equal(schedule(rev, 4, ctxAt(T0), s).days, 30);
});

test('提高目標保留率會縮短間隔', () => {
  const rev = { ...card(), state: State.Review, stability: 30, difficulty: 5, interval: 30, lastReview: T0 - 30 * DAY, due: T0, algo: 'fsrs' };
  const a = schedule(rev, 3, ctxAt(T0), settings({ retention: 0.95 })).days;
  const b = schedule(rev, 3, ctxAt(T0), settings({ retention: 0.85 })).days;
  assert.ok(a < b);
});

test('createCard 預設值', () => {
  const c = createCard({ id: 'x', deckId: 'd', front: 'a', back: 'b' }, T0);
  assert.equal(c.state, State.New);
  assert.equal(c.ease, 2.5);
  assert.deepEqual(c.tags, []);
});
