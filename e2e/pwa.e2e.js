// PWA 端對端測試（Playwright）。Playwright 不是專案依賴：
//   本機/CI：npm install --no-save playwright && npx playwright install chromium
//   node e2e/pwa.e2e.js
// 若 Playwright 裝在別處，可用 PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs 指定。
import assert from 'node:assert/strict';
import { createStaticServer } from '../scripts/serve.js';
import { listAssets } from '../scripts/assets.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

let swVersionOverride = null;
const server = createStaticServer(undefined, (path, body) => {
  if (path === '/sw.js' && swVersionOverride) {
    return Buffer.from(body.toString().replace(/const VERSION = '[^']*';/, `const VERSION = '${swVersionOverride}';`));
  }
  return null;
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch();
let failed = false;
const step = async (name, fn) => {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    failed = true;
    console.log(`FAIL ${name}\n${e.stack}`);
  }
};

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 800 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await step('service worker 註冊成功並控制頁面', async () => {
    await page.goto(base);
    await page.waitForSelector('.deck-name');
    const state = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      await new Promise((r) => (navigator.serviceWorker.controller ? r() : navigator.serviceWorker.addEventListener('controllerchange', r)));
      return { scope: reg.scope, active: reg.active?.state, controlled: Boolean(navigator.serviceWorker.controller) };
    });
    assert.ok(['activating', 'activated'].includes(state.active), state.active);
    assert.equal(state.controlled, true);
    assert.equal(state.scope, base);
  });

  await step('所有檔案都已預先快取', async () => {
    const cached = await page.evaluate(async () => {
      const keys = await caches.keys();
      const c = await caches.open(keys[0]);
      return (await c.keys()).map((r) => new URL(r.url).pathname);
    });
    for (const a of listAssets()) assert.ok(cached.includes(new URL(a, 'http://x/').pathname), `未快取 ${a}`);
  });

  await step('複習一張卡後資料寫入 IndexedDB', async () => {
    await page.goto(`${base}#/review/demo-deck`);
    await page.waitForSelector('.study');
    await page.keyboard.press('Space');
    await page.waitForSelector('.rates');
    await page.keyboard.press('4');
    await page.waitForSelector('.study');
    await page.waitForTimeout(200);
    const n = await page.evaluate(() => window.__app.revlog.length);
    assert.equal(n, 1);
  });

  await step('離線重新整理後頁面仍可開啟，資料還在', async () => {
    await context.setOffline(true);
    await page.goto(base);
    await page.reload();
    await page.waitForSelector('.deck-name');
    assert.match(await page.textContent('.deck-name'), /單字/);
    await page.goto(`${base}#/stats`);
    await page.reload();
    await page.waitForSelector('.tile');
    assert.equal(await page.textContent('.tile .n'), '1');
    // 離線也能複習
    await page.goto(`${base}#/review/demo-deck`);
    await page.reload();
    await page.waitForSelector('.study');
    await context.setOffline(false);
  });

  await step('新版本：出現更新提示，按下後切換並清掉舊快取', async () => {
    const before = await page.evaluate(() => caches.keys());
    assert.equal(before.length, 1);
    swVersionOverride = 'e2e-next';
    await page.goto(base);
    await page.waitForSelector('.deck-name');
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    await page.waitForSelector('#banner button.primary', { timeout: 10000 });
    assert.match(await page.textContent('#banner'), /新版本/);
    // 按下前，舊版仍在服務（不會偷偷換掉正在用的檔案）
    assert.equal((await page.evaluate(() => caches.keys())).length, 2);
    await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), page.click('#banner button.primary')]);
    await page.waitForSelector('.deck-name');
    await page.waitForFunction(async () => (await caches.keys()).length === 1);
    assert.deepEqual(await page.evaluate(() => caches.keys()), ['memo-cards-e2e-next']);
  });

  await step('頁面沒有 console 錯誤或例外', async () => {
    assert.deepEqual(errors, []);
  });
} finally {
  await browser.close();
  server.close();
}
if (failed) process.exit(1);
console.log('E2E 全部通過');
