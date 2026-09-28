// 每日上限與出題順序：學習中（到期）→ 待複習 → 新卡 → 提前學習（20 分鐘內）。
import { MIN, dayEnd, dayIndex, dayStart } from './dates.js';
import { State } from './scheduler.js';

export const LEARN_AHEAD_MIN = 20;

/** 今天（學習日）已做的新卡數與複習數。revlog 依時間遞增排列。 */
export function usageToday(revlog, deckId, ctx, settings) {
  const start = dayStart(dayIndex(ctx.now, ctx.tz, settings.rolloverHour), ctx.tz, settings.rolloverHour);
  let newDone = 0;
  let reviewDone = 0;
  for (let i = revlog.length - 1; i >= 0; i--) {
    const l = revlog[i];
    if (l.ts < start) break;
    if (deckId && l.deckId !== deckId) continue;
    if (l.prevState === State.New) newDone++;
    else if (l.prevState === State.Review) reviewDone++;
  }
  return { newDone, reviewDone };
}

const byDue = (a, b) => a.due - b.due || a.order - b.order || (a.id < b.id ? -1 : 1);
const byOrder = (a, b) => a.order - b.order || a.created - b.created || (a.id < b.id ? -1 : 1);

/**
 * @param {object[]} cards 該牌組的卡片
 * @returns {{learning:object[], review:object[], fresh:object[], ahead:object[]}}
 */
export function buildQueue(cards, revlog, deckId, ctx, settings) {
  const { newDone, reviewDone } = usageToday(revlog, deckId, ctx, settings);
  const end = dayEnd(ctx.now, ctx.tz, settings.rolloverHour);
  const learning = [];
  const review = [];
  const fresh = [];
  const ahead = [];
  for (const c of cards) {
    if (c.state === State.Learning || c.state === State.Relearning) {
      if (c.due <= ctx.now) learning.push(c);
      else if (c.due <= ctx.now + LEARN_AHEAD_MIN * MIN) ahead.push(c);
    } else if (c.state === State.Review) {
      if (c.due < end) review.push(c);
    } else fresh.push(c);
  }
  learning.sort(byDue);
  ahead.sort(byDue);
  review.sort(byDue);
  fresh.sort(byOrder);
  return {
    learning,
    review: review.slice(0, Math.max(0, settings.reviewPerDay - reviewDone)),
    fresh: fresh.slice(0, Math.max(0, settings.newPerDay - newDone)),
    ahead,
  };
}

export function pickNext(queue) {
  return queue.learning[0] || queue.review[0] || queue.fresh[0] || queue.ahead[0] || null;
}

/** 牌組清單上顯示的三個數字。 */
export function dueCounts(cards, revlog, deckId, ctx, settings) {
  const q = buildQueue(cards, revlog, deckId, ctx, settings);
  return { fresh: q.fresh.length, learning: q.learning.length, review: q.review.length };
}
