// 經典 SM-2（SuperMemo 2，Piotr Wozniak, 1987）的四按鈕版本。
// 忘記=品質 1（失敗）、困難=3、良好=4、簡單=5。
export const MIN_EASE = 1.3;
export const START_EASE = 2.5;

const QUALITY = { 1: 1, 2: 3, 3: 4, 4: 5 };

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/**
 * @param {{ease:number, interval:number, reps:number}} s
 * @param {1|2|3|4} rating
 * @returns {{ease:number, interval:number, reps:number, lapsed:boolean}}
 */
export function sm2Next(s, rating, maxInterval = 36500) {
  if (rating === 1) {
    // 失敗：重頭來過；EF 依 Anki 慣例降 0.2（原始論文不動 EF）
    return { ease: Math.max(MIN_EASE, s.ease - 0.2), interval: 1, reps: 0, lapsed: true };
  }
  const q = QUALITY[rating];
  const ease = Math.max(MIN_EASE, s.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  const reps = s.reps + 1;
  let interval;
  if (reps === 1) interval = rating === 4 ? 4 : 1;
  else if (reps === 2) interval = rating === 2 ? 4 : 6;
  else if (rating === 2) interval = Math.max(s.interval + 1, Math.round(s.interval * 1.2));
  else if (rating === 3) interval = Math.max(s.interval + 1, Math.round(s.interval * ease));
  else interval = Math.max(s.interval + 1, Math.round(s.interval * ease * 1.3));
  return { ease, interval: clamp(interval, 1, maxInterval), reps, lapsed: false };
}

/** 從失敗中「重新學習」畢業時的間隔（天）。 */
export function sm2RelearnInterval(rating) {
  return rating === 4 ? 2 : 1;
}
