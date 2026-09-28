import { el, download } from '../dom.js';
import { formatSteps, parseSteps } from '../settings.js';
import { makeBackup, validateBackup } from '../backup.js';

function stamp(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

export function settingsView(app, root) {
  const s = app.settings;
  const msg = el('p', { role: 'status' });

  const num = (id, label, key, min, max, hint) =>
    el('div', { class: 'field' },
      el('label', { for: id }, label, hint && el('span', { class: 'hint' }, ` ${hint}`)),
      el('input', { type: 'number', id, value: s[key], min, max, step: '1', inputmode: 'numeric', onChange: (e) => app.updateSettings({ [key]: e.target.value }) }));
  const steps = (id, label, key, hint) =>
    el('div', { class: 'field' },
      el('label', { for: id }, label, el('span', { class: 'hint' }, ` ${hint}`)),
      el('input', { type: 'text', id, value: formatSteps(s[key]), inputmode: 'numeric', onChange: (e) => {
        const v = parseSteps(e.target.value);
        e.target.value = formatSteps(v);
        app.updateSettings({ [key]: v });
      } }));
  const check = (id, label, key, hint) =>
    el('div', { class: 'field' }, el('label', { class: 'check', for: id },
      el('input', { type: 'checkbox', id, checked: s[key], onChange: async (e) => { await app.updateSettings({ [key]: e.target.checked }); document.body.classList.toggle('no-anim', !app.settings.animation); } }),
      el('span', {}, label, hint && el('span', { class: 'hint' }, el('br'), hint))));

  const retention = el('input', { type: 'number', id: 's-ret', value: Math.round(s.retention * 100), min: '70', max: '97', step: '1', inputmode: 'numeric', onChange: (e) => app.updateSettings({ retention: Number(e.target.value) / 100 }) });

  const algo = (value, label, hint) =>
    el('label', {}, el('input', { type: 'radio', name: 'algo', value, checked: s.algorithm === value, onChange: () => app.updateSettings({ algorithm: value }) }), el('span', {}, label, el('span', { class: 'hint' }, ` ${hint}`)));

  const restoreInput = el('input', { type: 'file', id: 's-restore', accept: '.json,application/json', onChange: async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = validateBackup(JSON.parse(await file.text()));
      if (!data.ok) {
        msg.textContent = `還原失敗：${data.errors.slice(0, 3).join('；')}`;
        return;
      }
      if (!confirm(`這會用備份取代目前所有資料（${data.data.decks.length} 個牌組、${data.data.cards.length} 張卡片）。確定嗎？`)) return;
      await app.replaceAll(data.data);
      msg.textContent = `已還原 ${data.data.cards.length} 張卡片。`;
    } catch (err) {
      msg.textContent = `還原失敗：${err.message}`;
    }
    e.target.value = '';
  } });

  root.append(
    el('h1', {}, '設定'),
    el('h2', { style: 'margin-top:0' }, '排程'),
    el('div', { class: 'field' },
      el('label', {}, '演算法'),
      el('div', { class: 'segmented', role: 'radiogroup', 'aria-label': '演算法' },
        algo('fsrs', 'FSRS-4.5', '（預設，較新）'),
        algo('sm2', 'SM-2', '（經典）')),
      el('p', { class: 'hint muted small' }, '切換後既有的卡片會自動換算，不會重來。')),
    el('div', { class: 'field' }, el('label', { for: 's-ret' }, '目標保留率（%）', el('span', { class: 'hint' }, ' 只影響 FSRS；越高越常複習')), retention),
    num('s-new', '每日新卡上限', 'newPerDay', '0', '9999'),
    num('s-rev', '每日複習上限', 'reviewPerDay', '0', '9999'),
    steps('s-steps', '學習步驟（分鐘）', 'learningSteps', '用空白分隔，例如 1 10'),
    steps('s-relearn', '忘記後的重學步驟（分鐘）', 'relearnSteps', '例如 10'),
    num('s-roll', '每天幾點換日', 'rolloverHour', '0', '23', '（0–23 點；預設 4，熬夜背也算同一天）'),
    el('h2', {}, '介面'),
    check('s-anim', '顯示答案時使用淡入動畫', 'animation', '系統設定「減少動態效果」時一律關閉。'),
    check('s-tts', '提供英文單字朗讀', 'tts', app.speaker.available ? '使用瀏覽器內建語音。' : '這個瀏覽器不支援語音合成。'),
    check('s-auto', '出現新卡片時自動朗讀', 'autoSpeak'),
    el('h2', {}, '資料'),
    el('p', { class: 'muted' }, '資料只存在這台裝置的瀏覽器裡。換手機或清除網站資料前，請先匯出備份。'),
    el('div', { class: 'row' },
      el('button', { onClick: () => download(`memo-cards-${stamp(Date.now())}.json`, JSON.stringify(makeBackup(app, Date.now()), null, 1), 'application/json') }, '匯出 JSON 備份'),
      el('button', { class: 'danger', onClick: async () => {
        if (!confirm('刪除全部牌組、卡片與複習紀錄？無法復原。')) return;
        await app.replaceAll({ decks: [], cards: [], revlog: [], settings: app.settings });
        msg.textContent = '已清除。';
      } }, '清除全部資料'),
    ),
    el('div', { class: 'field', style: 'margin-top:14px' }, el('label', { for: 's-restore' }, '從 JSON 備份還原'), restoreInput),
    msg,
    el('h2', {}, '關於'),
    el('p', { class: 'muted small' }, 'FSRS 依 open-spaced-repetition 公開的 FSRS-4.5 公式與預設參數實作。SM-2 為 Piotr Wozniak 的經典演算法。授權：MIT。'),
  );
}
