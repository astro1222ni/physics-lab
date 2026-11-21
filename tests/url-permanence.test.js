// 以 Node 執行：node tests/url-permanence.test.js
// 11/21 站長：分享的 QR code 直接連現在的網址，加上「網址不改、要搬就留轉址」兩條規矩，套用到整個 Astro Ni Lab。
// 這個測試守住「網址不改」：程式庫歷史上發布過的每一個 .html，現在都必須還在——
// 要嘛是原本的頁面，要嘛是 tools/make-redirect.cjs 產生的轉址頁，而且轉址的目的地也要存在。
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}

let ever = null;
try {
  const out = execFileSync('git', ['-c', 'core.quotepath=off', 'log', '--format=', '--name-only', '--', '*.html'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  ever = [...new Set(out.split('\n').map(s => s.trim()).filter(s => s.endsWith('.html') && !s.startsWith('.claude/') && !s.startsWith('node_modules/') && !s.startsWith('.shots/')))];
} catch (e) {
  console.log('  （沒有 git 歷史可查，略過網址不改檢查）');
}

if (ever) {
  test('發布過的網頁全部還在（共 ' + ever.length + ' 個）：要改網址請用 tools/make-redirect.cjs 在舊網址留轉址頁', () => {
    const gone = ever.filter(f => !fs.existsSync(path.join(ROOT, f)));
    assert.deepStrictEqual(gone, [], '這些網址不見了，請在原路徑留轉址頁：' + gone.join('、'));
  });
  test('轉址頁的目的地都存在', () => {
    const bad = [];
    for (const f of ever) {
      const p = path.join(ROOT, f);
      if (!fs.existsSync(p)) continue;
      const s = fs.readFileSync(p, 'utf8');
      const m = s.match(/<meta name="lab-redirect" content="([^"]+)">/);
      if (!m) continue;
      const target = m[1].split(/[?#]/)[0];
      if (!fs.existsSync(path.join(ROOT, path.dirname(f), target))) bad.push(f + ' → ' + m[1]);
    }
    assert.deepStrictEqual(bad, [], '轉址目的地不存在：' + bad.join('、'));
  });
}

console.log('  ' + passed + ' 項通過');
