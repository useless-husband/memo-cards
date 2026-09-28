// 進入點：載入資料、建立共用的 app 物件、路由、Service Worker。
import { clear, el } from './dom.js';
import { localOffsetMin } from './dates.js';
import { createMemoryStore, openIdbStore, probeStorage } from './store.js';
import { DEFAULT_SETTINGS, normalizeSettings } from './settings.js';
import { createSpeaker } from './tts.js';
import { DEMO_DECK_ID, createDemoDeck } from './demo-deck.js';
import { decksView } from './views/decks.js';
import { deckView } from './views/deck.js';
import { reviewView } from './views/review.js';
import { statsView } from './views/stats.js';
import { settingsView } from './views/settings.js';
import { importView } from './views/import.js';

const SEED_KEY = 'memo-cards:seeded';

function makeId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createApp(store, storage) {
  const bannerEl = document.getElementById('banner');
  const banners = new Map();
  const app = {
    store,
    storage,
    decks: [],
    cards: [],
    revlog: [],
    settings: normalizeSettings(DEFAULT_SETTINGS),
    speaker: createSpeaker(),
    makeId,
    clock() {
      const now = Date.now();
      return { now, tz: localOffsetMin(now) };
    },
    cardsOf: (deckId) => app.cards.filter((c) => c.deckId === deckId),
    go(hash) {
      if (location.hash === hash) route();
      else location.hash = hash;
    },
    /** 顯示 / 更新一則提示；key 相同會覆蓋。 */
    banner(key, kind, text, actions = []) {
      app.clearBanner(key);
      const box = el('div', { class: `banner ${kind}` }, el('div', {}, text));
      if (actions.length) {
        box.append(el('div', { class: 'row' }, actions.map((a) => el('button', { onClick: a.onClick, class: a.primary ? 'primary' : '' }, a.label))));
      }
      banners.set(key, box);
      bannerEl.append(box);
    },
    clearBanner(key) {
      banners.get(key)?.remove();
      banners.delete(key);
    },
    /** 執行寫入儲存空間的動作；失敗時顯示錯誤而不是默默丟失。 */
    async run(promise) {
      try {
        await promise;
        app.clearBanner('write');
      } catch (e) {
        app.banner('write', 'error', `儲存失敗：${e?.message || e}。請先用「設定 → 匯出備份」保存資料。`);
      }
    },
    replaceCard(card) {
      const i = app.cards.findIndex((c) => c.id === card.id);
      if (i >= 0) app.cards[i] = card;
      else app.cards.push(card);
    },
    async saveCards(list) {
      list.forEach((c) => app.replaceCard(c));
      await app.run(store.putCards(list));
    },
    async deleteCard(id) {
      app.cards = app.cards.filter((c) => c.id !== id);
      app.revlog = app.revlog.filter((l) => l.cardId !== id);
      await app.run(store.deleteCards([id]));
    },
    async saveDeck(deck) {
      const i = app.decks.findIndex((d) => d.id === deck.id);
      if (i >= 0) app.decks[i] = deck;
      else app.decks.push(deck);
      await app.run(store.putDeck(deck));
    },
    async deleteDeck(id) {
      app.decks = app.decks.filter((d) => d.id !== id);
      app.cards = app.cards.filter((c) => c.deckId !== id);
      app.revlog = app.revlog.filter((l) => l.deckId !== id);
      await app.run(store.deleteDeck(id));
    },
    async addDemoDeck() {
      if (app.decks.some((d) => d.id === DEMO_DECK_ID)) return;
      const { deck, cards } = createDemoDeck(Date.now());
      await app.saveDeck(deck);
      await app.saveCards(cards);
    },
    async updateSettings(patch) {
      app.settings = normalizeSettings({ ...app.settings, ...patch });
      await app.run(store.putSettings(app.settings));
    },
    async replaceAll(data) {
      await app.run(store.replaceAll(data));
      Object.assign(app, { decks: data.decks, cards: data.cards, revlog: data.revlog, settings: data.settings });
    },
  };
  return app;
}

let currentApp = null;
let destroy = null;

const ROUTES = [
  [/^#\/?$/, decksView, 'decks'],
  [/^#\/deck\/([^/]+)$/, deckView, 'decks'],
  [/^#\/review\/([^/]+)$/, reviewView, 'decks'],
  [/^#\/import\/([^/]+)$/, importView, 'decks'],
  [/^#\/stats$/, statsView, 'stats'],
  [/^#\/settings$/, settingsView, 'settings'],
];

function route() {
  const root = document.getElementById('app');
  if (typeof destroy === 'function') destroy();
  destroy = null;
  clear(root);
  const hash = location.hash || '#/';
  let match = null;
  for (const [re, view, nav] of ROUTES) {
    const m = hash.match(re);
    if (m) {
      match = { view, nav, args: m.slice(1).map(decodeURIComponent) };
      break;
    }
  }
  document.querySelectorAll('nav a').forEach((a) => {
    if (match && a.dataset.nav === match.nav) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  document.body.classList.toggle('no-anim', !currentApp.settings.animation);
  if (!match) {
    root.append(el('h1', {}, '找不到這個頁面'), el('a', { href: '#/' }, '回到牌組'));
    return;
  }
  document.title = '記憶卡';
  destroy = match.view(currentApp, root, match.args);
  window.scrollTo(0, 0);
}

async function openStore(storage) {
  if (!storage.indexedDB) return { store: createMemoryStore(), volatile: true };
  try {
    return { store: await openIdbStore(), volatile: false };
  } catch (e) {
    console.warn('IndexedDB 開啟失敗', e);
    return { store: createMemoryStore(), volatile: true };
  }
}

function registerServiceWorker(app) {
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !app.hadController) return;
    reloading = true;
    location.reload();
  });
  const offerUpdate = (reg) => {
    app.banner('update', 'info', '有新版本可以使用。', [
      { label: '立即更新', primary: true, onClick: () => reg.waiting?.postMessage('SKIP_WAITING') },
      { label: '稍後', onClick: () => app.clearBanner('update') },
    ]);
  };
  app.hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker
    .register('./sw.js')
    .then((reg) => {
      if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(reg);
        });
      });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
      window.__swReady = true;
    })
    .catch((e) => console.warn('Service worker 註冊失敗', e));
}

async function boot() {
  const storage = probeStorage();
  const { store, volatile } = await openStore(storage);
  const app = createApp(store, storage);
  currentApp = app;
  if (volatile) {
    app.banner('storage', 'error', '這個瀏覽器無法使用 IndexedDB（可能是私密瀏覽模式，或封鎖了網站資料）。目前的資料只存在這個分頁，關閉就會消失。請改用一般視窗，或隨時到「設定」匯出備份。');
  } else if (!storage.localStorage) {
    app.banner('storage', 'info', '瀏覽器封鎖了 localStorage，部分小記憶（例如是否已載入示範牌組）無法保存，但複習資料仍會存在 IndexedDB。');
  }
  const data = await store.load();
  Object.assign(app, data);
  let seeded = false;
  try { seeded = localStorage.getItem(SEED_KEY) === '1'; } catch { /* 忽略 */ }
  if (app.decks.length === 0 && !seeded) {
    await app.addDemoDeck();
    try { localStorage.setItem(SEED_KEY, '1'); } catch { /* 忽略 */ }
  }
  navigator.storage?.persist?.().catch(() => {});
  window.addEventListener('hashchange', route);
  route();
  registerServiceWorker(app);
  window.__app = app;
}

boot().catch((e) => {
  console.error(e);
  document.getElementById('app').append(el('p', {}, `啟動失敗：${e?.message || e}`));
});
