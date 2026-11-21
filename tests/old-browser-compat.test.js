// 11/21 舊瀏覽器相容：四處後顧正規式（Safari 16.3 以前不支援）改寫後，切句結果要和原本完全相同；
// settings.js 開頭的補丁在缺函式時要補得正確。
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const SAMPLES = ['', '，', '。。', 'abc', '反應熵，平衡常數。', '第一句，第二句', 'a, b. c; d: e', '空白 分開\t還有\n換行 ', '結尾，', '，開頭', '連續，，。。', 'ΔH = −92 kJ：放熱；K 變小、', '  '];
const pairs = [
  ['chemical-equilibrium', s => s.split(/(?<=[，。,.;：:])/), s => (s.match(/[^，。,.;：:]*[，。,.;：:]|[^，。,.;：:]+$/g) || [''])],
  ['electrochemistry／hess-law', s => s.split(/(?<=[，。：；、,.;:\s])/), s => (s.match(/[^，。：；、,.;:\s]*[，。：；、,.;:\s]|[^，。：；、,.;:\s]+$/g) || [''])],
  ['study', s => s.split(/(?<=[。！？.!?])\s*/)[0], s => (s.match(/^[^。！？.!?]*[。！？.!?]?/) || [''])[0]],
];
let n = 0;
for (const [name, oldF, newF] of pairs) for (const s of SAMPLES.concat(['觀念一。 觀念二！', '沒有句號', 'Hi! there?', '？'])) {
  assert.deepStrictEqual(newF(s), oldF(s), `${name}：${JSON.stringify(s)}`); n++;
}

// 全站不可再出現後顧正規式
const bad = [];
for (const f of fs.readdirSync(path.join(ROOT, 'js'), { recursive: true })) {
  if (!String(f).endsWith('.js')) continue;
  const t = fs.readFileSync(path.join(ROOT, 'js', String(f)), 'utf8');
  if (/\(\?<[=!]/.test(t)) bad.push(f);
}
assert.deepStrictEqual(bad, [], '後顧正規式（舊 Safari 整支程式讀不進來）：' + bad.join('、'));

// 補丁：刪掉新函式後重跑，結果要對
const src = fs.readFileSync(path.join(ROOT, 'js/settings.js'), 'utf8');
const patch = src.slice(0, src.indexOf('})();') + 5);
const saved = { hasOwn: Object.hasOwn, at: Array.prototype.at, sat: String.prototype.at, ra: String.prototype.replaceAll };
delete Object.hasOwn; delete Array.prototype.at; delete String.prototype.at; delete String.prototype.replaceAll;
try {
  new Function(patch)();
  assert.strictEqual(Object.hasOwn({ a: 1 }, 'a'), true);
  assert.strictEqual(Object.hasOwn({}, 'toString'), false);
  assert.strictEqual([1, 2, 3].at(-1), 3);
  assert.strictEqual([1, 2, 3].at(5), undefined);
  assert.strictEqual('abc'.at(-2), 'b');
  assert.strictEqual('a.b.c'.replaceAll('.', '$'), 'a$b$c');
  assert.strictEqual('x+y+z'.replaceAll('+', '-'), 'x-y-z');
  assert.strictEqual('[a][b]'.replaceAll('[', '('), '(a](b]');
  assert.strictEqual('a\\b\\c'.replaceAll('\\', '/'), 'a/b/c');
  assert.strictEqual('aaa'.replaceAll(/a/g, 'b'), 'bbb');
  assert.throws(() => 'aaa'.replaceAll(/a/, 'b'), TypeError);
  n += 11;
} finally {
  Object.hasOwn = saved.hasOwn;
  Object.defineProperty(Array.prototype, 'at', { value: saved.at, configurable: true, writable: true });
  Object.defineProperty(String.prototype, 'at', { value: saved.sat, configurable: true, writable: true });
  Object.defineProperty(String.prototype, 'replaceAll', { value: saved.ra, configurable: true, writable: true });
}
console.log(`✓ 舊瀏覽器相容 ${n} 項通過`);
