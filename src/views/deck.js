import { clear, el, download } from '../dom.js';
import { cardsToCSV, splitTags, LIMITS } from '../importer.js';
import { createCard } from '../scheduler.js';
import { dayIndex } from '../dates.js';

const STATE_LABEL = { new: '新卡', learning: '學習中', review: '複習', relearning: '已遺忘' };
const PAGE = 100;

function dueText(card, ctx, rollover) {
  if (card.state === 'new') return '新卡';
  if (card.state === 'learning' || card.state === 'relearning') return STATE_LABEL[card.state];
  const off = dayIndex(card.due, ctx.tz, rollover) - dayIndex(ctx.now, ctx.tz, rollover);
  return off <= 0 ? '今天到期' : `${off} 天後`;
}

/** 新增 / 編輯卡片的對話框。 */
export function openCardDialog(app, { card, deckId }, onSaved) {
  const front = el('input', { type: 'text', id: 'f-front', value: card?.front || '', maxlength: String(LIMITS.front), required: true, autocomplete: 'off', autocapitalize: 'none' });
  const back = el('textarea', { id: 'f-back', maxlength: String(LIMITS.back), required: true }, card?.back || '');
  const example = el('textarea', { id: 'f-example', maxlength: String(LIMITS.example) }, card?.example || '');
  const tags = el('input', { type: 'text', id: 'f-tags', value: (card?.tags || []).join(' '), autocomplete: 'off' });
  const err = el('p', { class: 'danger', role: 'status' });
  const dlg = el('dialog', { 'aria-labelledby': 'dlg-title' });
  const save = async (again) => {
    const f = front.value.trim();
    const b = back.value.trim();
    err.className = 'danger';
    if (!f || !b) {
      err.textContent = '正面和背面都要填。';
      (f ? back : front).focus();
      return;
    }
    const fields = { front: f, back: b, example: example.value.trim(), tags: splitTags(tags.value) };
    if (again && !card) {
      // 先清空欄位再寫入，避免使用者已經開始輸入下一張時被覆蓋
      front.value = back.value = example.value = '';
      err.className = 'muted';
      err.textContent = `已新增「${f}」。可以繼續輸入下一張。`;
      front.focus();
    }
    if (card) {
      await app.saveCards([{ ...card, ...fields }]);
    } else {
      const order = app.cards.reduce((m, c) => Math.max(m, c.order), -1) + 1;
      await app.saveCards([createCard({ id: app.makeId(), deckId, ...fields, order }, Date.now())]);
    }
    onSaved();
    if (!(again && !card)) dlg.close();
  };
  dlg.append(
    el('form', { method: 'dialog', onSubmit: (e) => { e.preventDefault(); save(false); } },
      el('h2', { id: 'dlg-title', style: 'margin-top:0' }, card ? '編輯卡片' : '新增卡片'),
      el('div', { class: 'field' }, el('label', { for: 'f-front' }, '正面（單字）'), front),
      el('div', { class: 'field' }, el('label', { for: 'f-back' }, '背面（詞性與意思）'), back),
      el('div', { class: 'field' }, el('label', { for: 'f-example' }, '例句 ', el('span', { class: 'hint' }, '（選填）')), example),
      el('div', { class: 'field' }, el('label', { for: 'f-tags' }, '標籤 ', el('span', { class: 'hint' }, '（選填，用空白分隔）')), tags),
      err,
      el('div', { class: 'row' },
        el('button', { class: 'primary', type: 'submit' }, '儲存'),
        !card && el('button', { type: 'button', onClick: () => save(true) }, '儲存並新增下一張'),
        el('button', { type: 'button', onClick: () => dlg.close() }, '取消'),
      ),
    ),
  );
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  front.focus();
}

export function deckView(app, root, [deckId]) {
  const deck = app.decks.find((d) => d.id === deckId);
  if (!deck) {
    root.append(el('h1', {}, '找不到這個牌組'), el('a', { href: '#/' }, '回到牌組'));
    return;
  }
  let query = '';
  let shown = PAGE;
  const listBox = el('div');
  const countEl = el('span', { class: 'muted' });

  const draw = () => {
    clear(listBox);
    const ctx = app.clock();
    const q = query.trim().toLowerCase();
    const all = app.cardsOf(deckId).sort((a, b) => a.order - b.order);
    const hit = q ? all.filter((c) => `${c.front} ${c.back} ${c.example} ${c.tags.join(' ')}`.toLowerCase().includes(q)) : all;
    countEl.textContent = q ? `符合 ${hit.length} / 共 ${all.length} 張` : `共 ${all.length} 張`;
    if (!hit.length) {
      listBox.append(el('p', { class: 'muted' }, all.length ? '沒有符合的卡片。' : '這個牌組還沒有卡片。'));
      return;
    }
    const ul = el('ul', { class: 'list' });
    for (const c of hit.slice(0, shown)) {
      ul.append(
        el('li', {},
          el('div', { class: 'cardrow' },
            el('div', {},
              el('div', { class: 'front' }, c.front),
              el('div', { class: 'back' }, c.back),
              c.example && el('div', { class: 'small muted' }, c.example),
              el('div', {}, c.tags.map((t) => el('span', { class: 'tag' }, t)), el('span', { class: 'state' }, dueText(c, ctx, app.settings.rolloverHour))),
            ),
            el('div', { class: 'ops' },
              el('button', { class: 'linklike', 'aria-label': `編輯 ${c.front}`, onClick: () => openCardDialog(app, { card: c, deckId }, draw) }, '編輯'),
              el('button', { class: 'linklike danger', 'aria-label': `刪除 ${c.front}`, onClick: async () => {
                if (!confirm(`刪除「${c.front}」？這張卡的複習紀錄也會一併刪除。`)) return;
                await app.deleteCard(c.id);
                draw();
              } }, '刪除'),
            ),
          ),
        ),
      );
    }
    listBox.append(ul);
    if (hit.length > shown) listBox.append(el('p', {}, el('button', { onClick: () => { shown += PAGE; draw(); } }, `顯示更多（還有 ${hit.length - shown} 張）`)));
  };

  const search = el('input', { type: 'search', 'aria-label': '搜尋卡片', placeholder: '搜尋單字、意思、標籤', onInput: (e) => { query = e.target.value; shown = PAGE; draw(); } });
  root.append(
    el('p', {}, el('a', { href: '#/' }, '← 全部牌組')),
    el('h1', {}, deck.name),
    el('div', { class: 'row' },
      el('a', { class: 'btn primary', href: `#/review/${encodeURIComponent(deckId)}` }, '開始複習'),
      el('button', { onClick: () => openCardDialog(app, { deckId }, draw) }, '新增卡片'),
      el('a', { class: 'btn', href: `#/import/${encodeURIComponent(deckId)}` }, '匯入 CSV'),
      el('button', { onClick: () => download(`${deck.name}.csv`, cardsToCSV(app.cardsOf(deckId)), 'text/csv;charset=utf-8') }, '匯出 CSV'),
    ),
    el('div', { class: 'row', style: 'margin-top:8px' },
      el('button', { class: 'linklike', onClick: async () => {
        const name = prompt('牌組名稱', deck.name)?.trim();
        if (!name) return;
        await app.saveDeck({ ...deck, name: name.slice(0, 60) });
        app.go(`#/deck/${encodeURIComponent(deckId)}`);
      } }, '改名'),
      el('button', { class: 'linklike danger', onClick: async () => {
        if (!confirm(`刪除牌組「${deck.name}」和裡面全部 ${app.cardsOf(deckId).length} 張卡片？無法復原。`)) return;
        await app.deleteDeck(deckId);
        app.go('#/');
      } }, '刪除牌組'),
    ),
    el('h2', {}, '卡片'),
    el('div', { class: 'field' }, search),
    el('p', {}, countEl),
    listBox,
  );
  draw();
}
