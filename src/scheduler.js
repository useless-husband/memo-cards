// 單張卡片的排程：學習步驟 + FSRS-4.5 或 SM-2。所有函式都是純函式，時間由呼叫端傳入。
import { DAY, MIN, dayIndex, dayStart, formatInterval } from './dates.js';
import { DEFAULT_W, Rating, initDifficulty, initStability, nextDifficulty, nextInterval, reviewMemory } from './fsrs.js';
import { START_EASE, sm2Next, sm2RelearnInterval } from './sm2.js';

export const State = Object.freeze({ New: 'new', Learning: 'learning', Review: 'review', Relearning: 'relearning' });

/** 建立一張新卡。id 與 now 由呼叫端提供（方便測試）。 */
export function createCard({ id, deckId, front, back, example = '', tags = [], order = 0 }, now) {
  return {
    id,
    deckId,
    front,
    back,
    example,
    tags,
    order,
    created: now,
    state: State.New,
    step: 0,
    due: now,
    lastReview: 0,
    stability: 0,
    difficulty: 0,
    ease: START_EASE,
    interval: 0, // 目前排定的天數
    reps: 0,
    lapses: 0,
    algo: null,
  };
}

// FSRS 的難度 5.16 對應 SM-2 的 EF 2.5，線性換算（僅用於中途切換演算法）
const D_PER_EASE = 4.03;
const easeToDifficulty = (e) => Math.min(10, Math.max(1, 5.1618 - (e - START_EASE) * D_PER_EASE));
const difficultyToEase = (d) => Math.min(3, Math.max(1.3, START_EASE - (d - 5.1618) / D_PER_EASE));

/** 使用者中途切換演算法時，把既有複習卡的狀態換算過去。 */
function migrate(card, algorithm) {
  if (card.state === State.New || card.state === State.Learning) return card;
  if (card.algo === algorithm || !card.algo) return card;
  const c = { ...card };
  if (algorithm === 'fsrs') {
    c.stability = Math.max(0.5, c.interval || 1);
    c.difficulty = easeToDifficulty(c.ease);
  } else {
    c.ease = difficultyToEase(c.difficulty || 5.1618);
    c.reps = Math.max(c.reps, 2);
  }
  c.algo = algorithm;
  return c;
}

function stepDelay(steps, idx, rating) {
  const cur = steps[Math.min(idx, steps.length - 1)] ?? 1;
  if (rating === Rating.Hard) {
    if (idx === 0 && steps.length > 1) return (steps[0] + steps[1]) / 2;
    if (steps.length === 1) return cur * 1.5;
  }
  return cur;
}

/**
 * 依評分算出下一個狀態。
 * @param {object} card
 * @param {1|2|3|4} rating
 * @param {{now:number, tz:number}} ctx
 * @param {object} settings
 * @returns {{card:object, log:object, minutes:number, days:number}}
 *   minutes 為 0 且 days > 0 表示以「天」排定。
 */
export function schedule(card, rating, ctx, settings) {
  const { now, tz } = ctx;
  const ro = settings.rolloverHour;
  const fsrs = settings.algorithm === 'fsrs';
  const w = settings.w || DEFAULT_W;
  const prev = migrate(card, settings.algorithm);
  const n = { ...prev, tags: [...(prev.tags || [])] };
  const elapsed = prev.lastReview ? Math.max(0, (now - prev.lastReview) / DAY) : 0;
  let minutes = 0;
  let days = 0;

  const toReview = (d) => {
    days = Math.max(1, Math.min(settings.maxInterval, d));
    n.state = State.Review;
    n.step = 0;
    n.interval = days;
    n.due = dayStart(dayIndex(now, tz, ro) + days, tz, ro);
  };
  const toStep = (state, step, delay) => {
    minutes = delay;
    n.state = state;
    n.step = step;
    n.interval = 0;
    n.due = now + Math.round(delay * MIN);
  };

  if (prev.state === State.New || prev.state === State.Learning) {
    const steps = settings.learningSteps;
    const isNew = prev.state === State.New;
    const cur = isNew ? 0 : prev.step;
    if (fsrs) {
      if (isNew || !(prev.stability > 0)) {
        n.stability = initStability(rating, w);
        n.difficulty = initDifficulty(rating, w);
      } else {
        n.difficulty = nextDifficulty(prev.difficulty, rating, w);
      }
    }
    const graduate = () => {
      if (fsrs) {
        if (rating === Rating.Easy) n.stability = Math.max(n.stability, initStability(4, w));
        toReview(nextInterval(n.stability, settings.retention, settings.maxInterval));
      } else {
        toReview(rating === Rating.Easy ? 4 : 1);
        n.reps = 1;
      }
    };
    if (rating === Rating.Again) toStep(State.Learning, 0, stepDelay(steps, 0, 1));
    else if (rating === Rating.Hard) toStep(State.Learning, Math.min(cur, Math.max(0, steps.length - 1)), stepDelay(steps, cur, 2));
    else if (rating === Rating.Good) {
      if (cur + 1 < steps.length) toStep(State.Learning, cur + 1, steps[cur + 1]);
      else graduate();
    } else graduate();
  } else if (prev.state === State.Relearning) {
    const steps = settings.relearnSteps;
    const cur = prev.step;
    if (fsrs) n.difficulty = nextDifficulty(prev.difficulty, rating, w);
    const graduate = () => {
      if (fsrs) {
        const good = nextInterval(n.stability, settings.retention, settings.maxInterval);
        toReview(rating === Rating.Easy ? Math.max(good + 1, Math.round(good * 1.3)) : good);
      } else {
        toReview(sm2RelearnInterval(rating));
        n.reps = 1;
      }
    };
    if (rating === Rating.Again) toStep(State.Relearning, 0, stepDelay(steps, 0, 1));
    else if (rating === Rating.Hard) toStep(State.Relearning, Math.min(cur, Math.max(0, steps.length - 1)), stepDelay(steps, cur, 2));
    else if (rating === Rating.Good && cur + 1 < steps.length) toStep(State.Relearning, cur + 1, steps[cur + 1]);
    else graduate();
  } else {
    // Review
    n.reps = prev.reps + 1;
    if (fsrs) {
      const mem = { stability: prev.stability > 0 ? prev.stability : 1, difficulty: prev.difficulty || 5.1618 };
      const res = reviewMemory(mem, rating, elapsed, w);
      n.stability = res.stability;
      n.difficulty = res.difficulty;
      if (rating === Rating.Again) {
        n.lapses = prev.lapses + 1;
        toStep(State.Relearning, 0, stepDelay(settings.relearnSteps, 0, 1));
      } else {
        // 保證 困難 <= 良好 < 簡單 的間隔順序
        const sFor = (g) => reviewMemory(mem, g, elapsed, w).stability;
        const iv = (s) => nextInterval(s, settings.retention, settings.maxInterval);
        const hard = iv(sFor(2));
        const good = Math.max(iv(sFor(3)), hard);
        const easy = Math.max(iv(sFor(4)), good + 1);
        toReview(rating === 2 ? Math.min(hard, good) : rating === 3 ? good : easy);
      }
    } else {
      const res = sm2Next({ ease: prev.ease, interval: prev.interval, reps: prev.reps }, rating, settings.maxInterval);
      n.ease = res.ease;
      if (res.lapsed) {
        n.reps = 0;
        n.lapses = prev.lapses + 1;
        toStep(State.Relearning, 0, stepDelay(settings.relearnSteps, 0, 1));
      } else {
        n.reps = res.reps;
        toReview(res.interval);
      }
    }
  }

  n.lastReview = now;
  n.algo = settings.algorithm;
  const log = {
    cardId: prev.id,
    deckId: prev.deckId,
    ts: now,
    rating,
    prevState: prev.state,
    newState: n.state,
    elapsedDays: elapsed,
    scheduledDays: days,
    algo: settings.algorithm,
  };
  return { card: n, log, minutes, days };
}

/** 四個按鈕各自的預覽文字，例如 ['1 分','6 分','10 分','14 天']。 */
export function previewLabels(card, ctx, settings) {
  return [1, 2, 3, 4].map((r) => {
    const s = schedule(card, r, ctx, settings);
    return formatInterval({ minutes: s.minutes, days: s.days });
  });
}
