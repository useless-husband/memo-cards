// 把 CSV 列轉成卡片：欄位對應、驗證、重複偵測。
import { stringifyCSV } from './csv.js';
import { createCard } from './scheduler.js';

export const FIELD_LABELS = { front: '正面', back: '背面', example: '例句', tags: '標籤', skip: '（略過）' };
export const FIELDS = Object.keys(FIELD_LABELS);
export const LIMITS = { front: 200, back: 1000, example: 1000, tag: 40 };

const SYNONYMS = {
  front: ['front', '正面', 'word', '單字', '字', 'term', 'question', '問題', 'english', '英文'],
  back: ['back', '背面', 'meaning', '意思', '中文', 'definition', '解釋', 'answer', '答案', 'translation', '翻譯'],
  example: ['example', '例句', 'sentence', '句子', 'context'],
  tags: ['tags', 'tag', '標籤', '分類', 'category'],
};

/** 依標題列猜欄位對應；猜不到的欄位標為 skip。 */
export function guessMapping(header) {
  const used = new Set();
  return header.map((h) => {
    const key = String(h).trim().toLowerCase();
    for (const [field, names] of Object.entries(SYNONYMS)) {
      if (!used.has(field) && names.includes(key)) {
        used.add(field);
        return field;
      }
    }
    return 'skip';
  });
}

/** 沒有標題列時的預設對應：正面、背面、例句、標籤。 */
export function defaultMapping(columns) {
  const order = ['front', 'back', 'example', 'tags'];
  return Array.from({ length: columns }, (_, i) => order[i] || 'skip');
}

export function splitTags(text) {
  const seen = new Set();
  const out = [];
  for (const t of String(text || '').split(/[;；|、\s]+/)) {
    const s = t.trim().slice(0, LIMITS.tag);
    if (s && !seen.has(s.toLowerCase())) {
      seen.add(s.toLowerCase());
      out.push(s);
    }
  }
  return out;
}

export function dupKey(front) {
  return String(front).normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * @param {string[][]} rows 已解析的列（含標題列則需 hasHeader）
 * @param {{mapping:string[], hasHeader:boolean, existing?:object[], dupMode?:'skip'|'keep'}} opt
 * @returns {{items:object[], counts:{ok:number, invalid:number, duplicate:number}}}
 *   items[i] = { line, fields, status: 'ok'|'invalid'|'duplicate', reason }
 */
export function analyzeRows(rows, { mapping, hasHeader, existing = [], dupMode = 'skip' }) {
  const seen = new Set(existing.map((c) => dupKey(c.front)));
  const items = [];
  const counts = { ok: 0, invalid: 0, duplicate: 0 };
  rows.forEach((row, i) => {
    if (hasHeader && i === 0) return;
    const fields = { front: '', back: '', example: '', tags: '' };
    mapping.forEach((f, ci) => {
      if (f !== 'skip' && fields[f] === '') fields[f] = String(row[ci] ?? '').trim();
    });
    const item = { line: i + 1, fields, status: 'ok', reason: '' };
    if (!fields.front) {
      item.status = 'invalid';
      item.reason = '缺少正面';
    } else if (!fields.back) {
      item.status = 'invalid';
      item.reason = '缺少背面';
    } else if (fields.front.length > LIMITS.front) {
      item.status = 'invalid';
      item.reason = `正面超過 ${LIMITS.front} 字`;
    } else if (fields.back.length > LIMITS.back || fields.example.length > LIMITS.example) {
      item.status = 'invalid';
      item.reason = '背面或例句太長';
    } else {
      const key = dupKey(fields.front);
      if (seen.has(key)) {
        item.reason = '已存在相同的正面';
        if (dupMode === 'skip') item.status = 'duplicate';
      }
      seen.add(key);
    }
    counts[item.status]++;
    items.push(item);
  });
  return { items, counts };
}

/** 把分析結果中 status==='ok' 的列建成卡片。 */
export function buildCards(items, { deckId, now, makeId, startOrder = 0 }) {
  let order = startOrder;
  return items
    .filter((it) => it.status === 'ok')
    .map((it) =>
      createCard(
        { id: makeId(), deckId, front: it.fields.front, back: it.fields.back, example: it.fields.example, tags: splitTags(it.fields.tags), order: order++ },
        now,
      ),
    );
}

export function cardsToCSV(cards, { bom = true } = {}) {
  const rows = [['正面', '背面', '例句', '標籤']];
  for (const c of cards) rows.push([c.front, c.back, c.example || '', (c.tags || []).join(';')]);
  return stringifyCSV(rows, { bom });
}
