import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectDelimiter, parseCSV, stringifyCSV } from '../src/csv.js';

test('基本逗號分隔', () => {
  assert.deepEqual(parseCSV('a,b,c\n1,2,3'), [['a', 'b', 'c'], ['1', '2', '3']]);
});

test('引號內的逗號', () => {
  assert.deepEqual(parseCSV('"a,b",c'), [['a,b', 'c']]);
});

test('引號內的換行', () => {
  assert.deepEqual(parseCSV('"line1\nline2",x\ny,z'), [['line1\nline2', 'x'], ['y', 'z']]);
});

test('雙引號跳脫', () => {
  assert.deepEqual(parseCSV('"say ""hi""",b'), [['say "hi"', 'b']]);
});

test('CRLF、CR、LF 混用', () => {
  assert.deepEqual(parseCSV('a,b\r\nc,d\re,f\ng,h'), [['a', 'b'], ['c', 'd'], ['e', 'f'], ['g', 'h']]);
});

test('去除 UTF-8 BOM', () => {
  assert.deepEqual(parseCSV('﻿front,back\nx,y'), [['front', 'back'], ['x', 'y']]);
});

test('UTF-8 中文與全形標點', () => {
  assert.deepEqual(parseCSV('蘋果,"apple，水果"\n學測,"含,逗號"'), [['蘋果', 'apple，水果'], ['學測', '含,逗號']]);
});

test('略過空白行；結尾沒有換行也可', () => {
  assert.deepEqual(parseCSV('a,b\n\n\nc,d'), [['a', 'b'], ['c', 'd']]);
  assert.deepEqual(parseCSV('a,b\n'), [['a', 'b']]);
});

test('保留空欄位', () => {
  assert.deepEqual(parseCSV('a,,c\n,,'), [['a', '', 'c'], ['', '', '']]);
});

test('自動偵測 Tab 與分號', () => {
  assert.equal(detectDelimiter('a\tb\tc\n1\t2\t3'), '\t');
  assert.equal(detectDelimiter('a;b;c'), ';');
  assert.equal(detectDelimiter('a,b'), ',');
  assert.equal(detectDelimiter('single'), ',');
  assert.deepEqual(parseCSV('w\tm\nx\ty'), [['w', 'm'], ['x', 'y']]);
});

test('偵測分隔符時忽略引號內的字元', () => {
  assert.equal(detectDelimiter('"a;b;c;d",e,f'), ',');
});

test('指定分隔符優先', () => {
  assert.deepEqual(parseCSV('a;b,c', { delimiter: ';' }), [['a', 'b,c']]);
});

test('輸出：必要時加引號，可加 BOM', () => {
  const out = stringifyCSV([['a,b', 'say "x"', 'line1\nline2', 'plain']], { bom: true });
  assert.equal(out, '﻿"a,b","say ""x""","line1\nline2",plain\r\n');
});

test('輸出再解析會得到相同資料（含中文、換行、引號）', () => {
  const rows = [['正面', '背面'], ['a,b', '"引"\n第二行'], ['  空白 ', '']];
  assert.deepEqual(parseCSV(stringifyCSV(rows, { bom: true })), rows);
});
