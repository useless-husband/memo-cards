import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distributionSvg, forecastSvg } from '../src/charts.js';
import { DEMO_DECK_ID, DEMO_WORDS, createDemoDeck } from '../src/demo-deck.js';
import { DEFAULT_SETTINGS, formatSteps, normalizeSettings, parseSteps } from '../src/settings.js';
import { createSpeaker, looksEnglish } from '../src/tts.js';
import { probeStorage } from '../src/store.js';
import { computeVersion, listAssets } from '../scripts/assets.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../scripts/assets.js';
import { T0 } from './helpers.js';

test('預測長條圖：30 根長條，含無障礙標題', () => {
  const svg = forecastSvg(Array.from({ length: 30 }, (_, i) => i % 4));
  assert.equal((svg.match(/<rect class="bar"/g) || []).length, 30);
  assert.ok(svg.includes('role="img"') && svg.includes('aria-label'));
  assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'));
});

test('預測長條圖：全 0 也能畫，沒有 NaN', () => {
  const svg = forecastSvg(new Array(30).fill(0));
  assert.ok(!svg.includes('NaN'));
});

test('分布圖：依比例分段、空資料有底色', () => {
  const svg = distributionSvg({ new: 50, learning: 0, review: 50, forgotten: 0 });
  assert.equal((svg.match(/class="seg /g) || []).length, 2);
  assert.ok(svg.includes('width="180.00"'));
  assert.ok(distributionSvg({ new: 0, learning: 0, review: 0, forgotten: 0 }).includes('empty'));
});

test('示範牌組：剛好 100 個不重複單字，欄位齊全', () => {
  assert.equal(DEMO_WORDS.length, 100);
  assert.equal(new Set(DEMO_WORDS.map((w) => w[0])).size, 100);
  const { deck, cards } = createDemoDeck(T0);
  assert.equal(deck.id, DEMO_DECK_ID);
  assert.equal(cards.length, 100);
  assert.equal(new Set(cards.map((c) => c.id)).size, 100);
  for (const c of cards) {
    assert.ok(c.front && c.back && c.example && c.tags.length > 0, c.id);
    assert.match(c.back, /^(n|v|adj|adv)\. /);
  }
});

test('示範牌組：例句真的包含該單字（允許變化形）', () => {
  for (const [word, , , example] of DEMO_WORDS) {
    const stem = word.slice(0, Math.max(4, word.length - 3)).toLowerCase();
    assert.ok(example.toLowerCase().includes(stem), `${word}: ${example}`);
  }
});

test('設定：預設值、範圍限制、不合法輸入', () => {
  assert.deepEqual(normalizeSettings({}), { ...DEFAULT_SETTINGS, learningSteps: [1, 10], relearnSteps: [10] });
  const s = normalizeSettings({ retention: 5, newPerDay: 'abc', rolloverHour: 99, learningSteps: [0, -1], animation: false });
  assert.equal(s.retention, 0.97);
  assert.equal(s.newPerDay, 20);
  assert.equal(s.rolloverHour, 23);
  assert.deepEqual(s.learningSteps, []);
  assert.equal(s.animation, false);
});

test('學習步驟文字解析', () => {
  assert.deepEqual(parseSteps('1 10'), [1, 10]);
  assert.deepEqual(parseSteps('1, 10， 60 x'), [1, 10, 60]);
  assert.deepEqual(parseSteps(''), []);
  assert.equal(formatSteps([1, 10]), '1 10');
});

test('朗讀：呼叫 speak 並設定語言；不可用時安靜略過', () => {
  const calls = [];
  class U { constructor(t) { this.text = t; } }
  const synth = { cancel: () => calls.push('cancel'), speak: (u) => calls.push([u.text, u.lang]) };
  const sp = createSpeaker(synth, U);
  assert.equal(sp.speak('hello'), true);
  assert.deepEqual(calls, ['cancel', ['hello', 'en-US']]);
  assert.equal(sp.speak('  '), false);
  const none = createSpeaker(undefined, undefined);
  assert.equal(none.available, false);
  assert.equal(none.speak('x'), false);
});

test('判斷是否為英文', () => {
  assert.equal(looksEnglish('budget'), true);
  assert.equal(looksEnglish('預算'), false);
  assert.equal(looksEnglish('budget 預算'), false);
});

test('儲存探測：localStorage 丟例外時回報不可用', () => {
  const bad = { indexedDB: {}, get localStorage() { throw new Error('denied'); } };
  assert.deepEqual(probeStorage(bad), { indexedDB: true, localStorage: false });
  assert.deepEqual(probeStorage({}), { indexedDB: false, localStorage: false });
});

test('sw.js 的版本與快取清單與實際檔案一致（改檔後要執行 npm run stamp）', () => {
  const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  assert.equal(sw.match(/const VERSION = '([^']*)'/)[1], computeVersion());
  const listed = [...sw.matchAll(/^\s+'(\.\/[^']*)',$/gm)].map((m) => m[1]);
  assert.deepEqual(listed, listAssets());
});

test('快取清單包含 App 必要檔案', () => {
  const a = listAssets();
  for (const f of ['./', './index.html', './styles.css', './manifest.webmanifest', './src/app.js', './icons/icon-192.png']) assert.ok(a.includes(f), f);
});

test('manifest 與 index.html 的必要欄位', () => {
  const m = JSON.parse(readFileSync(join(ROOT, 'manifest.webmanifest'), 'utf8'));
  assert.equal(m.display, 'standalone');
  assert.ok(m.icons.some((i) => i.sizes === '512x512'));
  assert.ok(m.start_url.startsWith('./'));
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  assert.ok(html.includes('rel="manifest"') && html.includes('viewport'));
  assert.ok(!/https?:\/\/(?!useless)/.test(html.replace(/xmlns="[^"]*"/g, '')), '不可引用外部資源');
});
