// 列出要離線快取的檔案，並依內容算出版本字串（給 sw.js 與測試共用）。
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT_FILES = ['index.html', 'styles.css', 'manifest.webmanifest'];
const DIRS = ['src', 'icons'];

export function listAssets(root = ROOT) {
  const out = ['./', ...ROOT_FILES.map((f) => `./${f}`)];
  for (const d of DIRS) {
    const walk = (dir) => {
      for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else out.push('./' + relative(root, p).split('\\').join('/'));
      }
    };
    walk(join(root, d));
  }
  return out;
}

export function computeVersion(root = ROOT) {
  const h = createHash('sha256');
  for (const a of listAssets(root)) {
    if (a === './') continue;
    h.update(a);
    h.update(readFileSync(join(root, a)));
  }
  return h.digest('hex').slice(0, 10);
}
