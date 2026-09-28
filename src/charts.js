// 自己畫的 SVG 圖表。只輸出數字與固定文字，沒有使用者輸入，可安全用 innerHTML。
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** 未來 N 天到期預測長條圖。 */
export function forecastSvg(counts) {
  const W = 360;
  const H = 170;
  const left = 30;
  const top = 12;
  const bottom = 26;
  const plotW = W - left - 6;
  const plotH = H - top - bottom;
  const max = Math.max(1, ...counts);
  const niceMax = max <= 4 ? max : Math.ceil(max / 5) * 5;
  const bw = plotW / counts.length;
  const total = counts.reduce((a, b) => a + b, 0);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="未來 ${counts.length} 天到期預測，共 ${total} 張" class="chart">`;
  for (const t of [0, niceMax]) {
    const y = top + plotH - (t / niceMax) * plotH;
    s += `<line class="grid" x1="${left}" x2="${W - 6}" y1="${y}" y2="${y}"/><text class="tick" x="${left - 4}" y="${y + 3}" text-anchor="end">${t}</text>`;
  }
  counts.forEach((n, i) => {
    const h = (n / niceMax) * plotH;
    const x = left + i * bw + 1;
    s += `<rect class="bar" x="${x.toFixed(2)}" y="${(top + plotH - h).toFixed(2)}" width="${Math.max(1, bw - 2).toFixed(2)}" height="${h.toFixed(2)}"><title>${i === 0 ? '今天' : `${i} 天後`}：${n} 張</title></rect>`;
  });
  const labels = [0, 9, 19, counts.length - 1].filter((v, i, a) => v < counts.length && a.indexOf(v) === i);
  for (const i of labels) {
    s += `<text class="tick" x="${(left + i * bw + bw / 2).toFixed(2)}" y="${H - 8}" text-anchor="middle">${i === 0 ? '今天' : `+${i}`}</text>`;
  }
  return s + '</svg>';
}

export const DIST_LABELS = { new: '新卡', learning: '學習中', review: '複習', forgotten: '已遺忘' };

/** 卡片狀態堆疊橫條。 */
export function distributionSvg(dist) {
  const W = 360;
  const total = Object.values(dist).reduce((a, b) => a + b, 0);
  let s = `<svg viewBox="0 0 ${W} 28" role="img" aria-label="卡片狀態分布，共 ${total} 張" class="chart dist">`;
  if (total === 0) return s + `<rect class="seg empty" x="0" y="4" width="${W}" height="20" rx="3"/></svg>`;
  let x = 0;
  for (const k of Object.keys(DIST_LABELS)) {
    const w = (dist[k] / total) * W;
    if (w > 0) s += `<rect class="seg ${k}" x="${x.toFixed(2)}" y="4" width="${w.toFixed(2)}" height="20"><title>${esc(DIST_LABELS[k])}：${dist[k]} 張</title></rect>`;
    x += w;
  }
  return s + '</svg>';
}
