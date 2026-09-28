import { el } from '../dom.js';
import { dueCounts } from '../queue.js';
import { DEMO_DECK_ID } from '../demo-deck.js';

export function decksView(app, root) {
  const { now, tz } = app.clock();
  root.append(el('h1', {}, '牌組'));

  if (app.decks.length === 0) {
    root.append(el('p', { class: 'muted' }, '還沒有牌組。新增一個，或載入示範牌組。'));
  } else {
    const ul = el('ul', { class: 'list' });
    for (const d of app.decks) {
      const cards = app.cardsOf(d.id);
      const c = dueCounts(cards, app.revlog, d.id, { now, tz }, app.settings);
      const total = c.fresh + c.learning + c.review;
      ul.append(
        el('li', {},
          el('h2', { class: 'deck-name' }, d.name),
          el('div', { class: 'counts' },
            el('span', {}, '新卡 ', el('b', {}, c.fresh)),
            el('span', {}, '學習中 ', el('b', {}, c.learning)),
            el('span', {}, '待複習 ', el('b', {}, c.review)),
            el('span', {}, '共 ', el('b', {}, cards.length), ' 張'),
          ),
          el('div', { class: 'row' },
            total > 0
              ? el('a', { class: 'btn primary', href: `#/review/${encodeURIComponent(d.id)}` }, `開始複習（${total}）`)
              : el('span', { class: 'muted' }, cards.length ? '今天的份都做完了' : '還沒有卡片'),
            el('a', { class: 'btn', href: `#/deck/${encodeURIComponent(d.id)}` }, '管理卡片'),
          ),
        ),
      );
    }
    root.append(ul);
  }

  const input = el('input', { type: 'text', id: 'new-deck', maxlength: '60', autocomplete: 'off', placeholder: '例如：日文 N5' });
  const form = el('form', { class: 'panel stack', onSubmit: async (e) => {
    e.preventDefault();
    const name = input.value.trim();
    if (!name) return input.focus();
    await app.saveDeck({ id: app.makeId(), name, created: Date.now() });
    app.go('#/');
  } },
    el('div', { class: 'field' }, el('label', { for: 'new-deck' }, '新增牌組'), input),
    el('button', { class: 'primary', type: 'submit' }, '新增'),
  );
  root.append(form);

  if (!app.decks.some((d) => d.id === DEMO_DECK_ID)) {
    root.append(
      el('h2', {}, '示範牌組'),
      el('p', { class: 'muted' }, '英文學測／多益常見單字 100 個，例句是原創的。'),
      el('button', { onClick: async () => { await app.addDemoDeck(); app.go('#/'); } }, '加入示範牌組'),
    );
  }
}
