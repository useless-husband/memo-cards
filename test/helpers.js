import { createCard } from '../src/scheduler.js';
import { normalizeSettings } from '../src/settings.js';

export const TW = 480; // 台灣 UTC+8
export const T0 = Date.UTC(2026, 0, 15, 2, 0, 0); // 台灣 2026-01-15 10:00
export const MIN = 60_000;
export const DAY = 86_400_000;

export const ctxAt = (now, tz = TW) => ({ now, tz });
export const settings = (o = {}) => normalizeSettings(o);

export function mkCards(n, { deckId = 'd1', now = T0, prefix = 'c' } = {}) {
  return Array.from({ length: n }, (_, i) =>
    createCard({ id: `${prefix}${String(i).padStart(3, '0')}`, deckId, front: `w${i}`, back: `m${i}`, order: i }, now),
  );
}

export const near = (a, b, eps = 1e-4) => Math.abs(a - b) <= eps;
