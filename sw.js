// Service worker：預先快取所有檔案，離線也能開。
// 更新策略：VERSION 由 scripts/stamp-sw.js 依檔案內容產生。
//   - 第一次安裝：直接啟用。
//   - 已有舊版：新版在背景安裝並等待，頁面顯示「有新版本」，使用者按下才切換並重新載入，
//     避免執行到一半 JS 與快取混版。舊版快取在新版啟用時清除。
const VERSION = '246e8ea917';
const CACHE = `memo-cards-${VERSION}`;
const ASSETS = [
  /* ASSETS:begin */
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './src/app.js',
  './src/backup.js',
  './src/charts.js',
  './src/csv.js',
  './src/dates.js',
  './src/demo-deck.js',
  './src/dom.js',
  './src/fsrs.js',
  './src/importer.js',
  './src/queue.js',
  './src/scheduler.js',
  './src/session.js',
  './src/settings.js',
  './src/sm2.js',
  './src/stats.js',
  './src/store.js',
  './src/tts.js',
  './src/views/deck.js',
  './src/views/decks.js',
  './src/views/import.js',
  './src/views/review.js',
  './src/views/settings.js',
  './src/views/stats.js',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/icon-maskable.svg',
  './icons/icon.svg',
  /* ASSETS:end */
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.all(ASSETS.map((u) => cache.add(new Request(u, { cache: 'reload' }))));
      if (!self.registration.active) await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('memo-cards-') && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
  if (event.data === 'GET_VERSION') event.source?.postMessage({ type: 'VERSION', version: VERSION });
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') {
        const shell = await cache.match('./index.html');
        if (shell) return shell;
      }
      return fetch(req);
    })(),
  );
});
