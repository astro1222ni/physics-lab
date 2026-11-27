#!/usr/bin/env node
/*
 * mission-guard.cjs — 任務不變檢查（11/27 小幫手清單 A9；物理串暫存的 cmp.cjs 轉正）
 * 規則（CLAUDE.md「已上線任務的代號與等級不改」）：已完成的紀錄與總分都靠任務代號與等級，要調難度只能改判定條件或容許值。
 *
 * 用法：
 *   node tools/mission-guard.cjs                 比這個分支（含還沒 commit 的改動）和 origin/main 的分叉點，所有改過的任務檔
 *   node tools/mission-guard.cjs ohms-law tides  只比這幾站（代號用空格或逗號分開）
 *   --base <ref>   比較基準（預設 HEAD 與 origin/main 的分叉點 merge-base，只看本分支自己的改動）
 *   --list         另外列出每題改了什麼（標題、提示句、說明、判定程式、還差什麼）
 *   結束碼：0 沒有不合格；1 有不合格；2 參數錯或任務檔讀不進來。
 *
 * 不合格（擋上線）：
 *   ① 基準裡有的任務代號不見了　② 等級變了　③ hidden（隱藏與否）變了（星星數 = 等級 × 2 會跟著變）
 *   ④ study（自學任務）變了　⑤ 同一站有重複的代號　⑥ 新任務的代號沒有以「<代號>-」開頭
 * 只列出（不擋）：新增的任務、改了標題／提示句／說明／判定（加 --list 才逐題印）。
 * 讀法：用 vm 沙盒執行任務檔，攔 LabMission.register（同 tests/mission-hidden-riddle.test.js），不開瀏覽器、不連網路。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
let base = null, list = false;
const only = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--base' || a.startsWith('--base=')) {
    base = a === '--base' ? argv[++i] : a.slice(7);
    if (!base || base.startsWith('--')) { console.error('✗ --base 後面要接 commit 或分支名'); process.exit(2); }   // 漏值不可靜默退回預設（11/27 Antigravity 複查【中】1）
  }
  else if (a === '--list') list = true;
  else if (a === '-h' || a === '--help') { console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]); process.exit(0); }
  else if (a.startsWith('--')) { console.error('✗ 不認得的參數：' + a); process.exit(2); }
  else only.push(...a.split(',').map(s => s.trim().replace(/\.(html|js)$/, '')).filter(Boolean));
}
const git = (...a) => { const r = spawnSync('git', ['-c', 'core.quotepath=false'].concat(a), { cwd: ROOT, encoding: 'utf8', windowsHide: true, maxBuffer: 64 << 20 }); return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() }; };
if (!base) {
  const mb = git('merge-base', 'HEAD', 'origin/main');
  if (!mb.ok) { console.error('✗ 找不到 HEAD 與 origin/main 的分叉點（先 git fetch，或用 --base 指定）：' + mb.err); process.exit(2); }
  base = mb.out;
} else if (!git('rev-parse', '--verify', base + '^{commit}').ok) { console.error('✗ 找不到基準：' + base); process.exit(2); }

// 要比的任務檔：基準到現在（含工作區）改過的，加上還沒加進 git 的新檔
let files;
if (only.length) {
  files = only.map(s => 'js/missions/' + s + '.js');
  const miss = only.filter(s => !fs.existsSync(path.join(ROOT, 'js/missions', s + '.js')) && !git('cat-file', '-e', base + ':js/missions/' + s + '.js').ok);
  if (miss.length) { console.error('✗ 找不到任務檔：' + miss.join('、')); process.exit(2); }
} else {
  const d = git('diff', '--name-only', base, '--', 'js/missions/');
  const u = git('ls-files', '--others', '--exclude-standard', '--', 'js/missions/');
  files = [...new Set((d.out + '\n' + u.out).split('\n').map(s => s.trim()).filter(Boolean))];
}
files = files.filter(f => /^js\/missions\/[^/]+\.js$/.test(f) && !f.endsWith('/index.js')).sort();

function load(src, name) {
  const reg = [];
  const LabMission = { register: (id, l) => reg.push({ id, list: l }), starsOf: (level, m) => (m && m.hidden ? level * 2 : level) };
  const sb = { LabMission, console: { log() {}, warn() {}, error() {} }, Math, JSON, Number, Object, Array, String, Boolean, Set, Map, RegExp, Date, Infinity, NaN, isFinite, isNaN, parseFloat, parseInt };
  sb.window = sb; sb.globalThis = sb; sb.self = sb;
  vm.runInContext(src, vm.createContext(sb), { filename: name, timeout: 3000 });
  const out = [];
  for (const r of reg) for (const m of r.list || []) out.push(m);
  out.ids = reg.map(r => r.id);
  return out;
}
const txt = v => (v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));
const fn = v => (typeof v === 'function' ? v.toString().replace(/\s+/g, ' ') : txt(v));

const bad = [], notes = [];
let nOld = 0, nNew = 0, nAdd = 0, nChanged = 0, broken = 0;
for (const f of files) {
  const slug = path.basename(f, '.js');
  const now = fs.existsSync(path.join(ROOT, f)) ? fs.readFileSync(path.join(ROOT, f), 'utf8') : null;
  const was = git('show', base + ':' + f);
  let A = [], B = [];
  try { if (was.ok) A = load(was.out, 'base:' + f); } catch (e) { console.error('✗ 基準版 ' + f + ' 讀不進來：' + e.message.split('\n')[0]); broken++; continue; }
  if (now == null) { if (A.length) bad.push(slug + '：整個任務檔被刪掉了（基準有 ' + A.length + ' 題）'); continue; }
  try { B = load(now, f); } catch (e) { console.error('✗ ' + f + ' 讀不進來：' + e.message.split('\n')[0]); broken++; continue; }
  nOld += A.length; nNew += B.length;
  // register 的第一個參數要等於檔名代號：複製任務檔忘了改，任務會掛到別的實驗（11/27 複查【中】3）
  for (const id of B.ids || []) if (id !== slug && !String(id).startsWith(slug + '-') && !(A.ids || []).includes(id)) bad.push(slug + '：LabMission.register 的實驗代號是「' + id + '」，和檔名不符');
  const seen = new Set();
  for (const m of B) { if (seen.has(m.id)) bad.push(slug + '：代號 ' + m.id + ' 重複'); seen.add(m.id); }
  const byId = new Map(B.map(m => [m.id, m]));
  for (const a of A) {
    const b = byId.get(a.id);
    if (!b) { bad.push(slug + '：任務 ' + a.id + '（' + a.level + ' 級' + (a.hidden ? '，隱藏' : '') + '）不見了'); continue; }
    if (a.level !== b.level) bad.push(slug + '：' + a.id + ' 等級 ' + a.level + ' → ' + b.level);
    if (!!a.hidden !== !!b.hidden) bad.push(slug + '：' + a.id + (a.hidden ? ' 從隱藏任務變成一般任務' : ' 從一般任務變成隱藏任務'));
    if (!!a.study !== !!b.study) bad.push(slug + '：' + a.id + (a.study ? ' 不再是自學任務' : ' 變成自學任務'));
    const diff = [];
    if (txt(a.title) !== txt(b.title)) diff.push('標題');
    if (txt(a.riddle) !== txt(b.riddle)) diff.push('提示句');
    if (txt(a.desc) !== txt(b.desc)) diff.push('說明');
    if (fn(a.check) !== fn(b.check)) diff.push('判定');
    if (fn(a.need) !== fn(b.need) || txt(a.needOn) !== txt(b.needOn)) diff.push('還差什麼');
    if (diff.length) { nChanged++; notes.push(slug + '：' + a.id + ' 改了' + diff.join('、')); }
  }
  const oldIds = new Set(A.map(m => m.id));
  for (const b of B) {
    if (oldIds.has(b.id)) continue;
    nAdd++;
    if (!Number.isInteger(b.level) || b.level < 1 || b.level > 10) bad.push(slug + '：新任務 ' + b.id + ' 的等級 ' + JSON.stringify(b.level) + ' 不是 1–10 的整數');
    if (!String(b.id).startsWith(slug + '-')) bad.push(slug + '：新任務代號 ' + b.id + ' 沒有以「' + slug + '-」開頭');
    notes.push(slug + '：新增 ' + b.id + '（' + b.level + ' 級' + (b.hidden ? '，隱藏' : '') + (b.study ? '，自學' : '') + '）');
  }
}

bad.forEach(b => console.log('✗ ' + b));
if (list) notes.forEach(n => console.log('  · ' + n));
const head = '比了 ' + files.length + ' 個任務檔（基準 ' + base.slice(0, 8) + '）';
if (broken) { console.log((bad.length ? '\n' : '') + '✗ ' + head + '：' + broken + ' 個讀不進來'); process.exit(2); }
console.log((bad.length ? '\n✗ ' : '✓ ') + head + '：' + (bad.length ? bad.length + ' 項不合格（已上線任務的代號、等級、隱藏與否不可改）' : '已上線任務的代號、等級都沒變') +
  '；原有 ' + nOld + ' 題、改了內容 ' + nChanged + ' 題、新增 ' + nAdd + ' 題' + (!list && notes.length ? '（加 --list 看明細）' : ''));
process.exit(bad.length ? 1 : 0);
