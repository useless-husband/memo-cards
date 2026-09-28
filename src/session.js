// 一次複習流程：取下一張、作答、復原、進度。
import { buildQueue, pickNext } from './queue.js';
import { previewLabels, schedule } from './scheduler.js';

export class Session {
  /**
   * @param {object} o
   * @param {object[]} o.cards 此牌組所有卡片（陣列元素會被就地替換）
   * @param {object[]} o.revlog 全域複習紀錄（會 push / pop）
   * @param {object} o.settings
   * @param {() => {now:number, tz:number}} o.clock
   * @param {{putCard?:Function, addLog?:Function, removeLog?:Function}} [o.persist]
   */
  constructor({ cards, revlog, settings, deckId = null, clock, persist = {} }) {
    this.cards = cards;
    this.revlog = revlog;
    this.settings = settings;
    this.deckId = deckId;
    this.clock = clock;
    this.persist = persist;
    this.undoStack = [];
    this.answered = 0;
    this.initialTotal = this.remaining();
  }

  queue() {
    return buildQueue(this.cards, this.revlog, this.deckId, this.clock(), this.settings);
  }

  remaining() {
    const q = this.queue();
    return q.learning.length + q.review.length + q.fresh.length + q.ahead.length;
  }

  current() {
    return pickNext(this.queue());
  }

  labels(card = this.current()) {
    return card ? previewLabels(card, this.clock(), this.settings) : null;
  }

  answer(rating) {
    const card = this.current();
    if (!card) return null;
    const res = schedule(card, rating, this.clock(), this.settings);
    res.log.id = `${res.log.ts}-${card.id}-${this.revlog.length}`;
    const idx = this.cards.findIndex((c) => c.id === card.id);
    this.cards[idx] = res.card;
    this.revlog.push(res.log);
    this.undoStack.push({ prev: card, log: res.log, idx });
    this.answered++;
    this.persist.putCard?.(res.card);
    this.persist.addLog?.(res.log);
    return res;
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  undo() {
    const e = this.undoStack.pop();
    if (!e) return null;
    const i = this.cards.findIndex((c) => c.id === e.prev.id);
    this.cards[i] = e.prev;
    const li = this.revlog.lastIndexOf(e.log);
    if (li >= 0) this.revlog.splice(li, 1);
    this.answered--;
    this.persist.putCard?.(e.prev);
    this.persist.removeLog?.(e.log.id);
    return e.prev;
  }

  /** 0..1；學習中卡片重來會使分母變大，因此以「已完成 / (已完成 + 剩餘)」計算。 */
  progress() {
    const rem = this.remaining();
    const done = Math.max(0, this.initialTotal - rem);
    const total = Math.max(this.initialTotal, done + rem);
    return total === 0 ? 1 : Math.min(1, done / total);
  }

  finished() {
    return this.current() === null;
  }
}
