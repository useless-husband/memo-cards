import { clear, el } from '../dom.js';
import { DIST_LABELS, distributionSvg, forecastSvg } from '../charts.js';
import { distribution, forecast, retention, streak, todayReviews } from '../stats.js';

export function statsView(app, root) {
  let deckId = '';
  const body = el('div');
  const select = el('select', { id: 'stats-deck', onChange: (e) => { deckId = e.target.value; draw(); } },
    el('option', { value: '' }, '全部牌組'),
    app.decks.map((d) => el('option', { value: d.id }, d.name)),
  );

  function tile(n, l) {
    return el('div', { class: 'tile' }, el('div', { class: 'n' }, n), el('div', { class: 'l' }, l));
  }

  function draw() {
    clear(body);
    const ctx = app.clock();
    const ro = app.settings.rolloverHour;
    const id = deckId || null;
    const cards = id ? app.cardsOf(id) : app.cards;
    const ret = retention(app.revlog, ctx, { rollover: ro, deckId: id });
    const f = forecast(cards, ctx, ro, 30, id);
    const dist = distribution(cards, id);
    const total = cards.length;

    const chartBox = el('div', { class: 'panel' });
    chartBox.innerHTML = forecastSvg(f);
    const distBox = el('div', { class: 'panel' });
    distBox.innerHTML = distributionSvg(dist);
    const legend = el('ul', { class: 'legend' },
      Object.keys(DIST_LABELS).map((k) => el('li', {}, el('i', { style: `background:var(--c-${k})` }), DIST_LABELS[k], el('b', {}, dist[k]))),
    );
    distBox.append(legend);

    body.append(
      el('div', { class: 'tiles' },
        tile(todayReviews(app.revlog, ctx, ro, id), '今日複習'),
        tile(`${streak(app.revlog, ctx, ro, id)} 天`, '連續天數'),
        tile(ret.rate == null ? '—' : `${Math.round(ret.rate * 100)}%`, ret.total ? `30 天保留率（${ret.total} 次複習）` : '30 天保留率（尚無資料）'),
        tile(total, '卡片總數'),
      ),
      el('h2', {}, '未來 30 天到期預測'),
      chartBox,
      el('p', { class: 'muted small' }, `今天含逾期與學習中的卡片。30 天內共 ${f.reduce((a, b) => a + b, 0)} 張到期。`),
      el('h2', {}, '卡片狀態'),
      distBox,
    );
  }

  root.append(
    el('h1', {}, '統計'),
    el('div', { class: 'field' }, el('label', { for: 'stats-deck' }, '範圍'), select),
    body,
  );
  draw();
}
