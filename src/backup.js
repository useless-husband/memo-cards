// JSON 備份的產生與驗證。
import { normalizeSettings } from './settings.js';
import { START_EASE } from './sm2.js';

export const BACKUP_APP = 'memo-cards';
export const BACKUP_VERSION = 1;
const STATES = ['new', 'learning', 'review', 'relearning'];

export function makeBackup({ decks, cards, revlog, settings }, now) {
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: new Date(now).toISOString(), settings, decks, cards, revlog };
}

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const str = (x, d = '') => (typeof x === 'string' ? x : d);

function normalizeCard(c) {
  return {
    id: c.id,
    deckId: c.deckId,
    front: c.front,
    back: c.back,
    example: str(c.example),
    tags: Array.isArray(c.tags) ? c.tags.filter((t) => typeof t === 'string') : [],
    order: isNum(c.order) ? c.order : 0,
    created: isNum(c.created) ? c.created : 0,
    state: c.state,
    step: isNum(c.step) ? c.step : 0,
    due: isNum(c.due) ? c.due : 0,
    lastReview: isNum(c.lastReview) ? c.lastReview : 0,
    stability: isNum(c.stability) ? c.stability : 0,
    difficulty: isNum(c.difficulty) ? c.difficulty : 0,
    ease: isNum(c.ease) ? c.ease : START_EASE,
    interval: isNum(c.interval) ? c.interval : 0,
    reps: isNum(c.reps) ? c.reps : 0,
    lapses: isNum(c.lapses) ? c.lapses : 0,
    algo: c.algo === 'fsrs' || c.algo === 'sm2' ? c.algo : null,
  };
}

/**
 * 驗證並正規化。任何一個錯誤都不還原（避免匯入到一半的壞資料）。
 * @returns {{ok:boolean, errors:string[], data?:{decks:object[], cards:object[], revlog:object[], settings:object}}}
 */
export function validateBackup(obj) {
  const errors = [];
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, errors: ['檔案內容不是備份物件'] };
  if (obj.app !== BACKUP_APP) errors.push('這不是「記憶卡」的備份檔');
  if (!isNum(obj.version) || obj.version > BACKUP_VERSION) errors.push('備份版本不支援（可能來自較新的版本）');
  for (const k of ['decks', 'cards', 'revlog']) if (!Array.isArray(obj[k])) errors.push(`缺少 ${k} 陣列`);
  if (errors.length) return { ok: false, errors };

  const deckIds = new Set();
  const decks = [];
  obj.decks.forEach((d, i) => {
    if (!d || typeof d.id !== 'string' || !d.id || typeof d.name !== 'string' || !d.name.trim()) errors.push(`牌組 #${i + 1} 資料不完整`);
    else if (deckIds.has(d.id)) errors.push(`牌組 id 重複：${d.id}`);
    else {
      deckIds.add(d.id);
      decks.push({ id: d.id, name: d.name.trim(), created: isNum(d.created) ? d.created : 0 });
    }
  });
  const cardIds = new Set();
  const cards = [];
  obj.cards.forEach((c, i) => {
    if (!c || typeof c.id !== 'string' || !c.id) errors.push(`卡片 #${i + 1} 缺少 id`);
    else if (cardIds.has(c.id)) errors.push(`卡片 id 重複：${c.id}`);
    else if (typeof c.front !== 'string' || !c.front.trim() || typeof c.back !== 'string' || !c.back.trim()) errors.push(`卡片 #${i + 1} 的正面或背面是空的`);
    else if (!STATES.includes(c.state)) errors.push(`卡片 #${i + 1} 的狀態無效`);
    else if (!deckIds.has(c.deckId)) errors.push(`卡片 #${i + 1} 指向不存在的牌組`);
    else {
      cardIds.add(c.id);
      cards.push(normalizeCard(c));
    }
  });
  const revlog = [];
  obj.revlog.forEach((l, i) => {
    if (!l || !isNum(l.ts) || ![1, 2, 3, 4].includes(l.rating) || !cardIds.has(l.cardId)) {
      // 紀錄壞掉不影響卡片本身，略過即可
      return;
    }
    revlog.push({ ...l, id: typeof l.id === 'string' ? l.id : `${l.ts}-${l.cardId}-${i}` });
  });
  revlog.sort((a, b) => a.ts - b.ts);
  if (errors.length) return { ok: false, errors };
  return { ok: true, errors: [], data: { decks, cards, revlog, settings: normalizeSettings(obj.settings || {}) } };
}
