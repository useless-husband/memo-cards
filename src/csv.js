// RFC 4180 風格的 CSV / TSV 解析與輸出。支援引號、跳脫引號、欄位內換行、BOM、CRLF。

export function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** 依第一個非空列，在引號外數 , Tab ; 出現次數，選最多者；預設逗號。 */
export function detectDelimiter(text) {
  const t = stripBom(text);
  let inQuote = false;
  const count = { ',': 0, '\t': 0, ';': 0 };
  let seen = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (ch === '"') inQuote = !inQuote;
    else if (!inQuote) {
      if (ch === '\n' || ch === '\r') {
        if (seen) break;
      } else {
        seen = true;
        if (ch in count) count[ch]++;
      }
    }
  }
  let best = ',';
  for (const d of ['\t', ';']) if (count[d] > count[best]) best = d;
  return count[best] === 0 ? ',' : best;
}

/**
 * @returns {string[][]} 每列一個陣列；完全空白的列會被略過。
 */
export function parseCSV(text, { delimiter } = {}) {
  const t = stripBom(String(text));
  const d = delimiter || detectDelimiter(t);
  const rows = [];
  let row = [];
  let field = '';
  let inQuote = false;
  let quoted = false;
  const endField = () => {
    row.push(field);
    field = '';
    quoted = false;
  };
  const endRow = () => {
    endField();
    if (!(row.length === 1 && row[0] === '' )) rows.push(row);
    row = [];
  };
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (inQuote) {
      if (ch === '"') {
        if (t[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuote = false;
      } else field += ch;
    } else if (ch === '"' && field === '' && !quoted) {
      inQuote = true;
      quoted = true;
    } else if (ch === d) endField();
    else if (ch === '\r') {
      if (t[i + 1] === '\n') i++;
      endRow();
    } else if (ch === '\n') endRow();
    else field += ch;
  }
  if (field !== '' || row.length > 0 || quoted) endRow();
  return rows;
}

function quoteField(v, d) {
  const s = v == null ? '' : String(v);
  if (s === '' ) return s;
  if (s.includes('"') || s.includes(d) || s.includes('\n') || s.includes('\r') || /^\s|\s$/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function stringifyCSV(rows, { delimiter = ',', bom = false, eol = '\r\n' } = {}) {
  const body = rows.map((r) => r.map((v) => quoteField(v, delimiter)).join(delimiter)).join(eol);
  return (bom ? '﻿' : '') + body + (rows.length ? eol : '');
}
