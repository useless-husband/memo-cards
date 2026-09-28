// 修改任何要快取的檔案後執行：node scripts/stamp-sw.js
// 會把內容雜湊寫進 sw.js 的 VERSION，使用者的瀏覽器才會發現有新版本。
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, computeVersion, listAssets } from './assets.js';

const file = join(ROOT, 'sw.js');
let src = readFileSync(file, 'utf8');
const version = computeVersion();
src = src.replace(/const VERSION = '[^']*';/, `const VERSION = '${version}';`);
src = src.replace(
  /\/\* ASSETS:begin \*\/[\s\S]*?\/\* ASSETS:end \*\//,
  `/* ASSETS:begin */\n${listAssets().map((a) => `  '${a}',`).join('\n')}\n  /* ASSETS:end */`,
);
writeFileSync(file, src);
console.log(`sw.js VERSION = ${version}`);
