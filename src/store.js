// 資料儲存：IndexedDB（瀏覽器）與記憶體版本（測試 / 無法使用 IndexedDB 時）。
import { normalizeSettings } from './settings.js';

const DB_NAME = 'memo-cards';
const DB_VERSION = 1;

/** 兩種儲存共用的介面（全部回傳 Promise）：
 *  load, putDeck, deleteDeck, putCards, deleteCards, addLog, removeLog, putSettings, replaceAll */
export function createMemoryStore(initial = {}) {
  const decks = new Map((initial.decks || []).map((d) => [d.id, d]));
  const cards = new Map((initial.cards || []).map((c) => [c.id, c]));
  const logs = new Map((initial.revlog || []).map((l) => [l.id, l]));
  let settings = initial.settings || null;
  return {
    kind: 'memory',
    async load() {
      return {
        decks: [...decks.values()],
        cards: [...cards.values()],
        revlog: [...logs.values()].sort((a, b) => a.ts - b.ts),
        settings: normalizeSettings(settings || {}),
      };
    },
    async putDeck(d) { decks.set(d.id, { ...d }); },
    async deleteDeck(id) {
      decks.delete(id);
      for (const [k, c] of cards) if (c.deckId === id) cards.delete(k);
      for (const [k, l] of logs) if (l.deckId === id) logs.delete(k);
    },
    async putCards(list) { for (const c of list) cards.set(c.id, { ...c }); },
    async deleteCards(ids) {
      for (const id of ids) cards.delete(id);
      for (const [k, l] of logs) if (ids.includes(l.cardId)) logs.delete(k);
    },
    async addLog(l) { logs.set(l.id, { ...l }); },
    async removeLog(id) { logs.delete(id); },
    async putSettings(s) { settings = { ...s }; },
    async replaceAll(data) {
      decks.clear(); cards.clear(); logs.clear();
      data.decks.forEach((d) => decks.set(d.id, d));
      data.cards.forEach((c) => cards.set(c.id, c));
      data.revlog.forEach((l) => logs.set(l.id, l));
      settings = data.settings;
    },
  };
}

const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const done = (tx) => new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error || new Error('transaction aborted')); });

export async function openIdbStore(idb = globalThis.indexedDB) {
  if (!idb) throw new Error('IndexedDB 不可用');
  const db = await new Promise((resolve, reject) => {
    const r = idb.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore('decks', { keyPath: 'id' });
      const cs = d.createObjectStore('cards', { keyPath: 'id' });
      cs.createIndex('deckId', 'deckId');
      const ls = d.createObjectStore('revlog', { keyPath: 'id' });
      ls.createIndex('ts', 'ts');
      ls.createIndex('cardId', 'cardId');
      ls.createIndex('deckId', 'deckId');
      d.createObjectStore('meta', { keyPath: 'key' });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error || new Error('IndexedDB 開啟失敗'));
    r.onblocked = () => reject(new Error('IndexedDB 被其他分頁阻擋'));
  });
  const tx = (names, mode = 'readwrite') => db.transaction(names, mode);
  const idsByIndex = (store, index, value) => req(store.index(index).getAllKeys(value));
  return {
    kind: 'idb',
    async load() {
      const t = tx(['decks', 'cards', 'revlog', 'meta'], 'readonly');
      const [decks, cards, revlog, meta] = await Promise.all([
        req(t.objectStore('decks').getAll()),
        req(t.objectStore('cards').getAll()),
        req(t.objectStore('revlog').index('ts').getAll()),
        req(t.objectStore('meta').get('settings')),
      ]);
      return { decks, cards, revlog, settings: normalizeSettings(meta?.value || {}) };
    },
    async putDeck(d) {
      const t = tx(['decks']);
      t.objectStore('decks').put(d);
      await done(t);
    },
    async deleteDeck(id) {
      const t = tx(['decks', 'cards', 'revlog']);
      t.objectStore('decks').delete(id);
      const [cardKeys, logKeys] = await Promise.all([idsByIndex(t.objectStore('cards'), 'deckId', id), idsByIndex(t.objectStore('revlog'), 'deckId', id)]);
      cardKeys.forEach((k) => t.objectStore('cards').delete(k));
      logKeys.forEach((k) => t.objectStore('revlog').delete(k));
      await done(t);
    },
    async putCards(list) {
      const t = tx(['cards']);
      list.forEach((c) => t.objectStore('cards').put(c));
      await done(t);
    },
    async deleteCards(ids) {
      const t = tx(['cards', 'revlog']);
      for (const id of ids) {
        t.objectStore('cards').delete(id);
        const keys = await idsByIndex(t.objectStore('revlog'), 'cardId', id);
        keys.forEach((k) => t.objectStore('revlog').delete(k));
      }
      await done(t);
    },
    async addLog(l) {
      const t = tx(['revlog']);
      t.objectStore('revlog').put(l);
      await done(t);
    },
    async removeLog(id) {
      const t = tx(['revlog']);
      t.objectStore('revlog').delete(id);
      await done(t);
    },
    async putSettings(s) {
      const t = tx(['meta']);
      t.objectStore('meta').put({ key: 'settings', value: s });
      await done(t);
    },
    async replaceAll(data) {
      const t = tx(['decks', 'cards', 'revlog', 'meta']);
      for (const n of ['decks', 'cards', 'revlog']) t.objectStore(n).clear();
      data.decks.forEach((d) => t.objectStore('decks').put(d));
      data.cards.forEach((c) => t.objectStore('cards').put(c));
      data.revlog.forEach((l) => t.objectStore('revlog').put(l));
      t.objectStore('meta').put({ key: 'settings', value: data.settings });
      await done(t);
    },
  };
}

/** 探測儲存空間可用性，回傳給畫面顯示錯誤提示用。 */
export function probeStorage(g = globalThis) {
  let ls = false;
  try {
    const k = '__memo_probe__';
    g.localStorage.setItem(k, '1');
    g.localStorage.removeItem(k);
    ls = true;
  } catch { /* 私密模式或被封鎖 */ }
  return { indexedDB: Boolean(g.indexedDB), localStorage: ls };
}
