import { clear, el } from '../dom.js';
import { Session } from '../session.js';
import { forecast } from '../stats.js';
import { formatInterval } from '../dates.js';
import { looksEnglish } from '../tts.js';

const LABELS = ['忘記', '困難', '良好', '簡單'];

export function reviewView(app, root, [deckId]) {
  const deck = app.decks.find((d) => d.id === deckId);
  if (!deck) {
    root.append(el('h1', {}, '找不到這個牌組'), el('a', { href: '#/' }, '回到牌組'));
    return;
  }
  const session = new Session({
    cards: app.cardsOf(deckId),
    revlog: app.revlog,
    settings: app.settings,
    deckId,
    clock: () => app.clock(),
    persist: {
      putCard: (c) => { app.replaceCard(c); app.run(app.store.putCards([c])); },
      addLog: (l) => app.run(app.store.addLog(l)),
      removeLog: (id) => app.run(app.store.removeLog(id)),
    },
  });
  let revealed = false;
  let current = null;

  const canSpeak = () => app.settings.tts && app.speaker.available && current && looksEnglish(current.front);
  const speak = () => canSpeak() && app.speaker.speak(current.front);

  function answer(r) {
    if (!current || !revealed) return;
    session.answer(r);
    revealed = false;
    render(true);
  }
  function undo() {
    if (!session.canUndo()) return;
    session.undo();
    revealed = false;
    render(true);
  }
  function reveal() {
    if (revealed || !current) return;
    revealed = true;
    render(false);
  }

  function header() {
    return el('div', { class: 'review-bar' },
      el('a', { class: 'exit', href: `#/deck/${encodeURIComponent(deckId)}` }, '← 離開'),
      el('span', { class: 'muted small count' }, session.finished() ? '' : `還有 ${session.remaining()} 張`),
      el('button', { onClick: undo, disabled: !session.canUndo(), 'aria-keyshortcuts': 'Control+Z' }, '復原上一張'),
    );
  }

  function progressBar() {
    const pct = Math.round(session.progress() * 100);
    return el('div', { class: 'progress', role: 'progressbar', 'aria-label': '複習進度', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct) }, el('span', { style: `width:${pct}%` }));
  }

  function renderDone() {
    const ctx = app.clock();
    const f = forecast(app.cardsOf(deckId), ctx, app.settings.rolloverHour, 30, deckId);
    const soon = session.queue();
    root.append(
      header(),
      progressBar(),
      el('section', { class: 'panel done', 'aria-labelledby': 'done-title' },
        el('h1', { id: 'done-title' }, session.answered ? '今天的複習完成了' : '目前沒有要複習的卡片'),
        el('dl', {},
          el('dt', {}, '這次作答'), el('dd', {}, `${session.answered} 張`),
          el('dt', {}, '明天到期'), el('dd', {}, `${f[1]} 張`),
          el('dt', {}, '未來 7 天到期'), el('dd', {}, `${f.slice(1, 8).reduce((a, b) => a + b, 0)} 張`),
          soon.ahead.length ? [el('dt', {}, '稍後回來'), el('dd', {}, formatInterval({ minutes: Math.max(1, Math.round((soon.ahead[0].due - ctx.now) / 60000)) }))] : null,
        ),
        el('div', { class: 'row' },
          el('a', { class: 'btn primary', href: '#/' }, '回到牌組'),
          el('a', { class: 'btn', href: '#/stats' }, '看統計'),
        ),
      ),
    );
    document.getElementById('app').focus();
  }

  function render(newCard) {
    clear(root);
    current = session.current();
    if (!current) return renderDone();
    const labels = session.labels(current);
    const study = el('article', { class: 'study', tabindex: '-1', 'aria-label': '單字卡' },
      el('p', { class: 'front', lang: looksEnglish(current.front) ? 'en' : undefined }, current.front),
      canSpeak() && el('button', { class: 'linklike', onClick: speak, 'aria-label': `朗讀 ${current.front}` }, '朗讀'),
      revealed && el('div', { class: 'answer' },
        el('hr'),
        el('p', { class: 'back' }, current.back),
        current.example && el('p', { class: 'example', lang: 'en' }, current.example),
        current.tags.length > 0 && el('div', {}, current.tags.map((t) => el('span', { class: 'tag' }, t))),
      ),
    );
    const actions = revealed
      ? el('div', { class: 'rates', role: 'group', 'aria-label': '評分' },
          LABELS.map((l, i) => el('button', { class: 'rate', 'data-r': String(i + 1), onClick: () => answer(i + 1), 'aria-keyshortcuts': String(i + 1) },
            el('span', { class: 'lbl' }, l), el('span', { class: 'int' }, labels[i]), el('span', { class: 'key' }, String(i + 1)))))
      : el('button', { class: 'primary show', onClick: reveal, 'aria-keyshortcuts': 'Space' }, '顯示答案 ', el('kbd', {}, '空白鍵'));
    root.append(header(), progressBar(), study, el('div', { class: 'actions' }, actions));
    if (revealed) study.focus({ preventScroll: true });
    if (newCard) speakAuto();
  }

  function speakAuto() {
    if (app.settings.autoSpeak) speak();
  }

  const onKey = (e) => {
    if (e.metaKey || e.altKey) return;
    const t = e.target;
    const inField = t.closest?.('input,textarea,select,dialog');
    if (inField) return;
    if ((e.ctrlKey && e.key.toLowerCase() === 'z') || e.key === 'u') {
      e.preventDefault();
      return undo();
    }
    if (e.ctrlKey) return;
    if (e.key === ' ' || e.key === 'Enter') {
      if (t.closest?.('button,a')) return; // 讓按鈕自己處理
      e.preventDefault();
      reveal();
    } else if (/^[1-4]$/.test(e.key)) {
      if (revealed) {
        e.preventDefault();
        answer(Number(e.key));
      }
    }
  };
  document.addEventListener('keydown', onKey);
  render(true);
  return () => {
    document.removeEventListener('keydown', onKey);
    app.speaker.stop();
  };
}
