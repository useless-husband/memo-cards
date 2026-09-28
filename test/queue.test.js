import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '../src/session.js';
import { buildQueue, dueCounts, pickNext, usageToday } from '../src/queue.js';
import { State } from '../src/scheduler.js';
import { DAY, MIN, T0, TW, ctxAt, mkCards, settings } from './helpers.js';

function session(cards, revlog, s, clockRef, persist) {
  return new Session({ cards, revlog, settings: s, deckId: 'd1', clock: () => ctxAt(clockRef.now), persist });
}

test('每日新卡上限：做完 5 張後今天不再出新卡，隔天恢復', () => {
  const s = settings({ newPerDay: 5 });
  const cards = mkCards(30);
  const revlog = [];
  const clock = { now: T0 };
  const ses = session(cards, revlog, s, clock);
  assert.equal(ses.remaining(), 5);
  for (let i = 0; i < 5; i++) ses.answer(4); // 簡單 → 直接畢業
  assert.equal(ses.current(), null);
  assert.equal(usageToday(revlog, 'd1', ctxAt(T0), s).newDone, 5);
  clock.now = T0 + DAY;
  assert.equal(buildQueue(cards, revlog, 'd1', ctxAt(clock.now), s).fresh.length, 5);
});

test('每日複習上限', () => {
  const s = settings({ reviewPerDay: 3 });
  const cards = mkCards(10).map((c) => ({ ...c, state: State.Review, due: T0 - DAY, stability: 5, difficulty: 5, interval: 5, lastReview: T0 - 6 * DAY, algo: 'fsrs' }));
  const q = buildQueue(cards, [], 'd1', ctxAt(T0), s);
  assert.equal(q.review.length, 3);
});

test('已做的複習會扣掉今天的額度', () => {
  const s = settings({ reviewPerDay: 3 });
  const cards = mkCards(10).map((c) => ({ ...c, state: State.Review, due: T0 - DAY, stability: 5, difficulty: 5, interval: 5, lastReview: T0 - 6 * DAY, algo: 'fsrs' }));
  const revlog = [{ ts: T0 - MIN, deckId: 'd1', prevState: 'review', rating: 3 }];
  assert.equal(buildQueue(cards, revlog, 'd1', ctxAt(T0), s).review.length, 2);
});

test('昨天的紀錄不算今天的額度；換日以凌晨 4 點為界', () => {
  const s = settings({ newPerDay: 2 });
  const beforeRollover = Date.UTC(2026, 0, 14, 19, 59); // 台灣 15 日 03:59，仍屬 14 日
  const afterRollover = Date.UTC(2026, 0, 14, 20, 0); // 台灣 15 日 04:00
  const revlog = [{ ts: beforeRollover, deckId: 'd1', prevState: 'new', rating: 3 }];
  assert.equal(usageToday(revlog, 'd1', ctxAt(afterRollover), s).newDone, 0);
  assert.equal(usageToday(revlog, 'd1', ctxAt(beforeRollover + 1000), s).newDone, 1);
});

test('不同時區的「今天」不同', () => {
  const s = settings();
  const ts = Date.UTC(2026, 0, 15, 2, 0); // 台灣 10:00 / 紐約前一天 21:00
  const revlog = [{ ts, deckId: 'd1', prevState: 'new', rating: 3 }];
  const now = Date.UTC(2026, 0, 15, 12, 0); // 台灣 20:00 / 紐約 07:00
  assert.equal(usageToday(revlog, 'd1', { now, tz: 480 }, s).newDone, 1);
  assert.equal(usageToday(revlog, 'd1', { now, tz: -300 }, s).newDone, 0);
});

test('出題順序：學習中（到期）→ 待複習 → 新卡', () => {
  const s = settings();
  const [a, b, c] = mkCards(3);
  const learning = { ...a, state: State.Learning, due: T0 - MIN, step: 0 };
  const review = { ...b, state: State.Review, due: T0 - DAY, stability: 5, difficulty: 5, interval: 5 };
  const q = buildQueue([c, review, learning], [], 'd1', ctxAt(T0), s);
  assert.equal(pickNext(q).id, learning.id);
  assert.equal(pickNext({ ...q, learning: [] }).id, review.id);
  assert.equal(pickNext({ ...q, learning: [], review: [] }).id, c.id);
});

test('尚未到期的學習卡：20 分鐘內才會提前出現', () => {
  const s = settings();
  const [a, b] = mkCards(2);
  const soon = { ...a, state: State.Learning, due: T0 + 10 * MIN };
  const later = { ...b, state: State.Learning, due: T0 + 30 * MIN };
  const q = buildQueue([soon, later], [], 'd1', ctxAt(T0), s);
  assert.deepEqual(q.ahead.map((c) => c.id), [soon.id]);
  assert.equal(q.learning.length, 0);
});

test('明天才到期的複習卡今天不出現；到期日的換日時刻起才出現', () => {
  const s = settings();
  let cards = mkCards(1);
  const session1 = session(cards, [], s, { now: T0 });
  session1.answer(3);
  session1.clock = () => ctxAt(T0 + 10 * MIN);
  session1.answer(3); // 畢業：4 天
  const due = cards[0].due;
  assert.equal(pickNext(buildQueue(cards, [], 'd1', ctxAt(due - 1), s)), null);
  assert.equal(pickNext(buildQueue(cards, [], 'd1', ctxAt(due), s)).id, cards[0].id);
});

test('dueCounts 回傳新卡 / 學習中 / 待複習數量', () => {
  const s = settings({ newPerDay: 3 });
  const cards = mkCards(10);
  assert.deepEqual(dueCounts(cards, [], 'd1', ctxAt(T0), s), { fresh: 3, learning: 0, review: 0 });
});

test('Session：作答、進度、完成', () => {
  const s = settings({ newPerDay: 3 });
  const cards = mkCards(3);
  const ses = session(cards, [], s, { now: T0 });
  assert.equal(ses.progress(), 0);
  ses.answer(4);
  assert.ok(Math.abs(ses.progress() - 1 / 3) < 1e-9);
  ses.answer(4);
  ses.answer(4);
  assert.equal(ses.finished(), true);
  assert.equal(ses.progress(), 1);
});

test('Session：復原會還原卡片並刪除紀錄，額度也還回來', () => {
  const s = settings({ newPerDay: 2 });
  const cards = mkCards(5);
  const revlog = [];
  const calls = [];
  const ses = session(cards, revlog, s, { now: T0 }, {
    putCard: (c) => calls.push(['put', c.id, c.state]),
    addLog: (l) => calls.push(['add', l.id]),
    removeLog: (id) => calls.push(['remove', id]),
  });
  const first = ses.current().id;
  ses.answer(4);
  assert.equal(revlog.length, 1);
  assert.equal(ses.canUndo(), true);
  ses.undo();
  assert.equal(revlog.length, 0);
  assert.equal(cards.find((c) => c.id === first).state, State.New);
  assert.equal(ses.current().id, first);
  assert.equal(ses.canUndo(), false);
  assert.deepEqual(calls.map((c) => c[0]), ['put', 'add', 'put', 'remove']);
  assert.equal(ses.undo(), null);
});

test('Session：學習中的卡在 1 分鐘後回來', () => {
  const s = settings({ newPerDay: 1 });
  const cards = mkCards(1);
  const clock = { now: T0 };
  const ses = session(cards, [], s, clock);
  ses.answer(1);
  assert.equal(ses.current().id, cards[0].id); // 1 分鐘在 20 分鐘提前窗口內
  clock.now += MIN;
  assert.equal(ses.queue().learning.length, 1);
});

test('Session：按鈕預覽對應目前這張卡', () => {
  const ses = session(mkCards(2), [], settings(), { now: T0 });
  assert.deepEqual(ses.labels(), ['1 分', '6 分', '10 分', '14 天']);
});

test('完全確定性：相同輸入重播兩次結果相同', () => {
  const run = () => {
    const cards = mkCards(6);
    const revlog = [];
    const clock = { now: T0 };
    const ses = session(cards, revlog, settings(), clock);
    const pattern = [3, 1, 4, 2, 3, 3, 3, 4, 3, 3];
    for (const r of pattern) {
      if (!ses.current()) break;
      ses.answer(r);
      clock.now += 5 * MIN;
    }
    return JSON.stringify([cards, revlog]);
  };
  assert.equal(run(), run());
});

test('時區常數', () => assert.equal(TW, 480));
