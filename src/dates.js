// 日期工具：全部以「分鐘為單位的時區位移」與「換日時刻」參數化，方便用假時鐘測試。
export const MIN = 60_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;

/** 某個時間點在本機的 UTC 位移（分鐘，台灣為 +480）。 */
export function localOffsetMin(ms) {
  return -new Date(ms).getTimezoneOffset();
}

/** 以「換日時刻」（預設凌晨 4 點）切分的日序號。 */
export function dayIndex(ms, tz, rollover = 4) {
  return Math.floor((ms + tz * MIN - rollover * HOUR) / DAY);
}

/** 某日序號開始的毫秒時間。 */
export function dayStart(idx, tz, rollover = 4) {
  return idx * DAY - tz * MIN + rollover * HOUR;
}

/** 包含 ms 的那個「學習日」結束的時間（下一個換日時刻）。 */
export function dayEnd(ms, tz, rollover = 4) {
  return dayStart(dayIndex(ms, tz, rollover) + 1, tz, rollover);
}

/** 把間隔轉成畫面文字：分 / 小時 / 天 / 個月 / 年。 */
export function formatInterval({ minutes = 0, days = 0 }) {
  if (days > 0) {
    if (days < 30) return `${days} 天`;
    if (days < 365) return `${trim1(days / 30)} 個月`;
    return `${trim1(days / 365)} 年`;
  }
  const m = Math.max(1, Math.round(minutes));
  if (m < 60) return `${m} 分`;
  if (m < 1440) return `${trim1(m / 60)} 小時`;
  return `${Math.round(m / 1440)} 天`;
}

function trim1(x) {
  return String(Math.round(x * 10) / 10);
}
