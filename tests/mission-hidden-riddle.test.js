'use strict';
/*
 * mission-hidden-riddle.test.js — 隱藏任務的防線（11/27 主串要求）
 * 起因：Codex 草稿曾在任務檔結尾把 riddle 寫成 getter、讀 LabMission._state，完成後把 riddle 換成 desc，
 *       違反「隱藏任務只顯示隱晦提示，完成時也不說明原因」；另有站的隱藏任務沒有 riddle，面板只剩空引號。
 * 規則：
 *   1. 任務檔不可讀共用檔的私有狀態 LabMission._state。
 *   2. riddle 不可用 getter（get zh()／get en()／Object.defineProperty）。
 *   3. 每個 hidden: true 的任務都要有 riddle.zh 與 riddle.en，而且是非空的單純字串。
 * 隱藏任務的 desc 只是給證明與維護看的內部說明，不會顯示給學生。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dir = path.join(__dirname, '..', 'js', 'missions');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js') && f !== 'index.js').sort();
const problems = [];
let hiddenCount = 0;

function makeSandbox(registered) {
  const LabMission = {
    register: function (id, list) { registered.push({ id: id, list: list }); },
    starsOf: function (level) { return level * 2; }
  };
  const sb = { LabMission: LabMission, console: console, Math: Math, JSON: JSON, Number: Number, Object: Object, Array: Array, String: String, Set: Set, Map: Map, Infinity: Infinity, NaN: NaN, isFinite: isFinite, parseFloat: parseFloat, parseInt: parseInt };
  sb.window = sb;
  sb.globalThis = sb;
  return vm.createContext(sb);
}

for (const f of files) {
  const src = fs.readFileSync(path.join(dir, f), 'utf8');
  if (/LabMission\s*(\?\.|\.)\s*_state|\[\s*['"]_state['"]\s*\]/.test(src)) problems.push(f + '：讀了共用檔私有狀態 LabMission._state');
  if (/\bget\s+(zh|en)\s*\(/.test(src)) problems.push(f + '：用 getter 定義文字（get zh()／get en()）');
  if (/defineProperty\s*\([^)]*['"](riddle|zh|en)['"]/.test(src)) problems.push(f + '：用 defineProperty 改寫 riddle');

  const registered = [];
  try {
    vm.runInContext(src, makeSandbox(registered), { filename: f, timeout: 2000 });
  } catch (e) {
    problems.push(f + '：載入失敗（' + String(e && e.message || e).slice(0, 120) + '）');
    continue;
  }
  registered.forEach(function (r) {
    (r.list || []).forEach(function (m) {
      if (!m || !m.hidden) return;
      hiddenCount++;
      const rd = m.riddle;
      if (!rd || typeof rd !== 'object') { problems.push(f + '：' + m.id + ' 沒有 riddle'); return; }
      ['zh', 'en'].forEach(function (k) {
        const d = Object.getOwnPropertyDescriptor(rd, k);
        if (!d) problems.push(f + '：' + m.id + ' 沒有 riddle.' + k);
        else if (d.get || d.set) problems.push(f + '：' + m.id + ' 的 riddle.' + k + ' 是 getter');
        else if (typeof d.value !== 'string' || !d.value.trim()) problems.push(f + '：' + m.id + ' 的 riddle.' + k + ' 不是非空字串');
      });
    });
  });
}

if (problems.length) {
  console.log('隱藏任務防線不通過（' + problems.length + ' 項）：\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log(files.length + ' 個任務檔、' + hiddenCount + ' 個隱藏任務的 riddle 都是非空單純字串，沒有讀私有狀態');
