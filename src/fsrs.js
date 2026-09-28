// FSRS-4.5（Free Spaced Repetition Scheduler）
// 公式來源：open-spaced-repetition 的公開文件與論文
//   Ye, J. et al. "A Stochastic Shortest Path Algorithm for Optimizing Spaced
//   Repetition Scheduling", KDD 2022；FSRS-4.5 見
//   https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm
// 這裡是依公開公式自行實作，預設參數為 FSRS-4.5 預設值。

export const DEFAULT_W = [
  0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474,
  0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755,
];

export const Rating = Object.freeze({ Again: 1, Hard: 2, Good: 3, Easy: 4 });

const DECAY = -0.5;
const FACTOR = 19 / 81;

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/** 經過 t 天後的可提取性 R(t, S)。 */
export function retrievability(t, s) {
  return Math.pow(1 + (FACTOR * t) / s, DECAY);
}

/** 達到目標保留率所需的間隔（天，四捨五入，至少 1）。 */
export function nextInterval(s, retention = 0.9, maxInterval = 36500) {
  const i = (s / FACTOR) * (Math.pow(retention, 1 / DECAY) - 1);
  return clamp(Math.round(i), 1, maxInterval);
}

export function initStability(g, w = DEFAULT_W) {
  return Math.max(w[g - 1], 0.1);
}

export function initDifficulty(g, w = DEFAULT_W) {
  return clamp(w[4] - (g - 3) * w[5], 1, 10);
}

export function nextDifficulty(d, g, w = DEFAULT_W) {
  const next = d - w[6] * (g - 3);
  // 向「Good 的初始難度」均值回歸
  return clamp(w[7] * initDifficulty(3, w) + (1 - w[7]) * next, 1, 10);
}

export function nextRecallStability(d, s, r, g, w = DEFAULT_W) {
  const hardPenalty = g === Rating.Hard ? w[15] : 1;
  const easyBonus = g === Rating.Easy ? w[16] : 1;
  return (
    s *
    (1 +
      Math.exp(w[8]) *
        (11 - d) *
        Math.pow(s, -w[9]) *
        (Math.exp((1 - r) * w[10]) - 1) *
        hardPenalty *
        easyBonus)
  );
}

export function nextForgetStability(d, s, r, w = DEFAULT_W) {
  return (
    w[11] *
    Math.pow(d, -w[12]) *
    (Math.pow(s + 1, w[13]) - 1) *
    Math.exp((1 - r) * w[14])
  );
}

/**
 * 一次複習後的新記憶狀態。
 * @param {{stability:number, difficulty:number}|null} mem 第一次複習傳 null
 * @param {number} elapsedDays 距離上次複習的天數（可為小數）
 */
export function reviewMemory(mem, g, elapsedDays, w = DEFAULT_W) {
  if (!mem || !(mem.stability > 0)) {
    return { stability: initStability(g, w), difficulty: initDifficulty(g, w) };
  }
  const r = retrievability(Math.max(0, elapsedDays), mem.stability);
  const difficulty = nextDifficulty(mem.difficulty, g, w);
  const stability =
    g === Rating.Again
      ? nextForgetStability(mem.difficulty, mem.stability, r, w)
      : nextRecallStability(mem.difficulty, mem.stability, r, g, w);
  return { stability: Math.max(stability, 0.01), difficulty };
}
