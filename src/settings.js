export const DEFAULT_SETTINGS = Object.freeze({
  algorithm: 'fsrs', // 'fsrs' | 'sm2'
  retention: 0.9,
  newPerDay: 20,
  reviewPerDay: 200,
  learningSteps: [1, 10], // 分鐘
  relearnSteps: [10],
  rolloverHour: 4,
  maxInterval: 36500,
  animation: true,
  tts: true,
  autoSpeak: false,
});

const num = (v, lo, hi, d) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};

/** "1 10" / "1,10" → [1, 10]；無效項目丟棄，最多 8 步。 */
export function parseSteps(text) {
  return String(text)
    .split(/[\s,，、]+/)
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0 && n <= 1440)
    .slice(0, 8);
}

export function formatSteps(steps) {
  return steps.join(' ');
}

export function normalizeSettings(input = {}) {
  const d = DEFAULT_SETTINGS;
  const steps = (v, def) => (Array.isArray(v) ? parseSteps(v.join(' ')) : def);
  return {
    algorithm: input.algorithm === 'sm2' ? 'sm2' : 'fsrs',
    retention: num(input.retention, 0.7, 0.97, d.retention),
    newPerDay: Math.round(num(input.newPerDay, 0, 9999, d.newPerDay)),
    reviewPerDay: Math.round(num(input.reviewPerDay, 0, 9999, d.reviewPerDay)),
    learningSteps: steps(input.learningSteps, [...d.learningSteps]),
    relearnSteps: steps(input.relearnSteps, [...d.relearnSteps]),
    rolloverHour: Math.round(num(input.rolloverHour, 0, 23, d.rolloverHour)),
    maxInterval: Math.round(num(input.maxInterval, 1, 36500, d.maxInterval)),
    animation: input.animation !== false,
    tts: input.tts !== false,
    autoSpeak: input.autoSpeak === true,
  };
}
