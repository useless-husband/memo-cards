// 統計：今日複習數、連續天數、未來到期預測、保留率、狀態分布。
import { dayIndex } from './dates.js';
import { State } from './scheduler.js';

const inDeck = (deckId) => (x) => !deckId || x.deckId === deckId;

export function todayReviews(revlog, ctx, rollover = 4, deckId = null) {
  const today = dayIndex(ctx.now, ctx.tz, rollover);
  let n = 0;
  for (let i = revlog.length - 1; i >= 0; i--) {
    const l = revlog[i];
    if (dayIndex(l.ts, ctx.tz, rollover) < today) break;
    if (inDeck(deckId)(l)) n++;
  }
  return n;
}

/** 連續有複習的天數；今天還沒複習時，從昨天往回算（不會因為還沒開始就歸零）。 */
export function streak(revlog, ctx, rollover = 4, deckId = null) {
  const days = new Set();
  for (const l of revlog) if (inDeck(deckId)(l)) days.add(dayIndex(l.ts, ctx.tz, rollover));
  let d = dayIndex(ctx.now, ctx.tz, rollover);
  if (!days.has(d)) d--;
  let n = 0;
  while (days.has(d)) {
    n++;
    d--;
  }
  return n;
}

/** 未來 days 天每天到期的張數；逾期與今天到期的學習中卡片算在第 0 天。 */
export function forecast(cards, ctx, rollover = 4, days = 30, deckId = null) {
  const out = new Array(days).fill(0);
  const today = dayIndex(ctx.now, ctx.tz, rollover);
  for (const c of cards) {
    if (!inDeck(deckId)(c) || c.state === State.New) continue;
    const off = Math.max(0, dayIndex(c.due, ctx.tz, rollover) - today);
    if (off < days) out[off]++;
  }
  return out;
}

/** 最近 windowDays 天內，對「複習卡」的答對率（評分不是忘記）。沒有資料回 null。 */
export function retention(revlog, ctx, { windowDays = 30, rollover = 4, deckId = null } = {}) {
  const today = dayIndex(ctx.now, ctx.tz, rollover);
  let total = 0;
  let pass = 0;
  for (const l of revlog) {
    if (l.prevState !== State.Review || !inDeck(deckId)(l)) continue;
    if (today - dayIndex(l.ts, ctx.tz, rollover) >= windowDays) continue;
    total++;
    if (l.rating > 1) pass++;
  }
  return { rate: total ? pass / total : null, total };
}

export function distribution(cards, deckId = null) {
  const d = { new: 0, learning: 0, review: 0, forgotten: 0 };
  for (const c of cards) {
    if (!inDeck(deckId)(c)) continue;
    if (c.state === State.New) d.new++;
    else if (c.state === State.Learning) d.learning++;
    else if (c.state === State.Review) d.review++;
    else d.forgotten++;
  }
  return d;
}
