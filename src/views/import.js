import { clear, el } from '../dom.js';
import { detectDelimiter, parseCSV } from '../csv.js';
import { FIELDS, FIELD_LABELS, analyzeRows, buildCards, defaultMapping, guessMapping } from '../importer.js';

const DELIMS = [['auto', '自動偵測'], [',', '逗號 ,'], ['\t', 'Tab'], [';', '分號 ;']];
const PREVIEW = 8;

export function importView(app, root, [deckId]) {
  const deck = app.decks.find((d) => d.id === deckId);
  if (!deck) {
    root.append(el('h1', {}, '找不到這個牌組'), el('a', { href: '#/' }, '回到牌組'));
    return;
  }
  const st = { text: '', delim: 'auto', hasHeader: true, mapping: [], dupMode: 'skip', rows: [], touched: false };
  const panel = el('div');
  const result = el('p', { role: 'status' });

  const reparse = () => {
    const d = st.delim === 'auto' ? detectDelimiter(st.text) : st.delim;
    st.rows = st.text.trim() ? parseCSV(st.text, { delimiter: d }) : [];
    const cols = st.rows.reduce((m, r) => Math.max(m, r.length), 0);
    if (!st.touched || st.mapping.length !== cols) {
      st.mapping = st.hasHeader && st.rows[0] ? guessMapping(st.rows[0]) : defaultMapping(cols);
      while (st.mapping.length < cols) st.mapping.push('skip');
      // 標題猜不到任何欄位時，退回預設順序
      if (st.hasHeader && st.mapping.every((m) => m === 'skip')) st.mapping = defaultMapping(cols);
    }
  };

  function draw() {
    clear(panel);
    if (!st.rows.length) {
      panel.append(el('p', { class: 'muted' }, '貼上文字或選擇檔案後，這裡會出現預覽。'));
      return;
    }
    const analysis = analyzeRows(st.rows, { mapping: st.mapping, hasHeader: st.hasHeader, existing: app.cardsOf(deckId), dupMode: st.dupMode });
    const cols = st.mapping.length;
    const headRow = st.hasHeader ? st.rows[0] : null;
    const maps = el('div', { class: 'maprow' },
      st.mapping.map((m, i) =>
        el('div', { class: 'field' },
          el('label', { for: `map-${i}` }, headRow?.[i] ? `第 ${i + 1} 欄：${headRow[i]}` : `第 ${i + 1} 欄`),
          el('select', { id: `map-${i}`, onChange: (e) => { st.mapping[i] = e.target.value; st.touched = true; draw(); } },
            FIELDS.map((f) => el('option', { value: f, selected: f === m }, FIELD_LABELS[f]))))));
    const ok = analysis.counts.ok;
    const table = el('div', { class: 'tablewrap' }, el('table', {},
      el('thead', {}, el('tr', {}, el('th', {}, '列'), el('th', {}, '正面'), el('th', {}, '背面'), el('th', {}, '狀態'))),
      el('tbody', {}, analysis.items.slice(0, PREVIEW).map((it) =>
        el('tr', {},
          el('td', {}, it.line),
          el('td', {}, it.fields.front),
          el('td', {}, it.fields.back),
          el('td', { class: `st-${it.status}` }, it.status === 'ok' ? (it.reason ? `可匯入（${it.reason}）` : '可匯入') : it.status === 'duplicate' ? `略過：${it.reason}` : `無法匯入：${it.reason}`))))));
    panel.append(...[
      el('h2', {}, '欄位對應'),
      el('div', { class: 'field' }, el('label', { class: 'check' },
        el('input', { type: 'checkbox', checked: st.hasHeader, onChange: (e) => { st.hasHeader = e.target.checked; st.touched = false; reparse(); draw(); } }),
        el('span', {}, '第一列是標題'))),
      maps,
      cols < 2 ? el('p', { class: 'danger' }, '只偵測到一欄。請確認分隔符號是否正確。') : null,
      el('div', { class: 'field' }, el('label', { for: 'dup' }, '遇到重複的正面（與現有卡片或檔案內重複）'),
        el('select', { id: 'dup', onChange: (e) => { st.dupMode = e.target.value; draw(); } },
          el('option', { value: 'skip', selected: st.dupMode === 'skip' }, '略過'),
          el('option', { value: 'keep', selected: st.dupMode === 'keep' }, '仍然匯入'))),
      el('h2', {}, '預覽'),
      el('p', {}, `可匯入 ${ok} 張；重複略過 ${analysis.counts.duplicate} 張；無法匯入 ${analysis.counts.invalid} 張。`,
        analysis.items.length > PREVIEW ? el('span', { class: 'muted' }, `（只顯示前 ${PREVIEW} 列）`) : null),
      table,
      el('div', { class: 'row', style: 'margin-top:12px' },
        el('button', { class: 'primary', disabled: ok === 0, onClick: async () => {
          const order = app.cards.reduce((m, c) => Math.max(m, c.order), -1) + 1;
          const cards = buildCards(analysis.items, { deckId, now: Date.now(), makeId: app.makeId, startOrder: order });
          await app.saveCards(cards);
          st.text = '';
          st.rows = [];
          textarea.value = '';
          clear(result);
          result.append(`已匯入 ${cards.length} 張卡片。`, el('a', { href: `#/deck/${encodeURIComponent(deckId)}` }, ' 回到牌組查看'));
          draw();
        } }, `匯入 ${ok} 張`),
        el('a', { class: 'btn', href: `#/deck/${encodeURIComponent(deckId)}` }, '回到牌組')),
    ].filter(Boolean));
  }

  const textarea = el('textarea', { id: 'imp-text', rows: '6', placeholder: 'apple,蘋果,I ate an apple.,食物\nbanana,香蕉', onInput: (e) => { st.text = e.target.value; st.touched = false; result.textContent = ''; reparse(); draw(); } });
  const file = el('input', { type: 'file', id: 'imp-file', accept: '.csv,.tsv,.txt,text/csv,text/plain', onChange: async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    st.text = await f.text();
    textarea.value = st.text;
    st.touched = false;
    result.textContent = '';
    reparse();
    draw();
  } });

  root.append(
    el('p', {}, el('a', { href: `#/deck/${encodeURIComponent(deckId)}` }, `← ${deck.name}`)),
    el('h1', {}, '匯入 CSV／TSV'),
    el('p', { class: 'muted' }, '每一列一張卡。欄位可以是：正面、背面、例句、標籤。支援 UTF-8（含 BOM）、引號與欄位內換行。'),
    el('div', { class: 'field' }, el('label', { for: 'imp-file' }, '選擇檔案'), file),
    el('div', { class: 'field' }, el('label', { for: 'imp-text' }, '或貼上文字'), textarea),
    el('div', { class: 'field' }, el('label', { for: 'imp-delim' }, '分隔符號'),
      el('select', { id: 'imp-delim', onChange: (e) => { st.delim = e.target.value; st.touched = false; reparse(); draw(); } },
        DELIMS.map(([v, l]) => el('option', { value: v }, l)))),
    result,
    panel,
  );
  draw();
}
