#!/usr/bin/env node
/*
 * wt.cjs — 工作樹開收＋殘留清理（11/27 小幫手清單 A10；藝能 wt-new／wt-done、地科 lab-cleanup、化學一鍵推送的開拆合併）
 * 用 Node 寫不用 sh：Windows 的 node_modules 連結點（junction）在 Node 裡建、拆、辨認都可靠，
 * sh 轉給 PowerShell 時 $ 與反斜線容易被吃掉（11/27 主串就因此建出 G:\physics-lab-wt$n 這種錯路徑）。
 *
 * 用法：
 *   node tools/wt.cjs new <名稱> [--from <ref>] [--editing]
 *       從 origin/main（或 --from）開 G:\physics-lab-wt\<名稱>（新分支 <名稱>），接上共用 node_modules 連結點；--editing 另建 .editing。
 *   node tools/wt.cjs done <名稱> [--kill] [--clean-tmp] [--delete-branch] [--dry]
 *       收工作樹（「A 的做法」）：① 查殘留行程（命令列含這個工作樹路徑的 node、瀏覽器、python…），有就停下列出，加 --kill 才收；
 *       ② 有沒 commit 的改動或沒加進 git 的檔（已忽略的不算）就停下列出，不會硬刪；③ 只拆 node_modules 連結點（不遞迴，共用檔不受影響）；
 *       ④ git worktree remove（不加 --force）＋ prune。分支預設保留；--delete-branch 只在分支內容都已在 origin/main 時才刪（git cherry 確認沒有未併的 commit）。
 *       --clean-tmp：另外刪 F:\測試暫存 裡以「<名稱>」開頭的資料夾（先列出）。--dry 只印會做什麼。
 *   node tools/wt.cjs list            列出 G:\physics-lab-wt 底下所有工作樹：分支、乾淨與否、還沒進 main 的 commit 數、最後 commit 時間、有沒有連結點
 *   node tools/wt.cjs procs <名稱>    只列殘留行程
 *   結束碼：0 完成；1 有東西擋住（殘留行程、未 commit 的改動、分支沒併完）；2 參數錯或找不到。
 * 安全：絕不 git worktree remove --force、不 rm -rf 工作樹、不碰 F:\ClaudeBackup；拆連結點前先確認它真的是連結點。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const sh = (cmd, args, o = {}) => { const r = spawnSync(cmd, args, Object.assign({ encoding: 'utf8', windowsHide: true, maxBuffer: 64 << 20 }, o)); return { ok: r.status === 0, out: (r.stdout || '').trim(), raw: r.stdout || '', err: (r.stderr || '').trim() }; };
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const validName = n => !!n && /^[\w.-]+$/.test(n) && !/^\.+$/.test(n);   // 擋 ..、/、\（11/27 Antigravity 複查【中】5）
const here = path.resolve(__dirname, '..');
const common = sh('git', ['rev-parse', '--git-common-dir'], { cwd: here });
if (!common.ok) { console.error('✗ 不在 git 倉庫裡'); process.exit(2); }
const MAIN = path.resolve(here, common.out, '..');            // 主工作區（G:\physics-lab）
const WT = path.resolve(MAIN, '..', 'physics-lab-wt');         // 工作樹都開在這裡
const NM = path.join(MAIN, 'node_modules');
const TMP = 'F:/測試暫存';
const git = (args, cwd) => sh('git', ['-c', 'core.quotepath=false'].concat(args), { cwd: cwd || MAIN });
const norm = p => path.resolve(p).replace(/\\/g, '/').toLowerCase();

const argv = process.argv.slice(2);
const cmd = argv[0];
const flags = new Set(argv.filter(a => a.startsWith('--') && !a.includes('=')));
const val = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : (argv.find(a => a.startsWith(k + '=')) || '').slice(k.length + 1) || null; };
const name = argv.slice(1).find((a, i, arr) => !a.startsWith('--') && arr[i - 1] !== '--from');
const DRY = flags.has('--dry');
const say = s => console.log(s);
const die = (s, c) => { console.error('✗ ' + s); process.exit(c || 1); };

function isJunction(p) { try { return fs.lstatSync(p).isSymbolicLink(); } catch (e) { return false; } }
function worktrees() {
  const out = git(['worktree', 'list', '--porcelain']).out.split(/\r?\n\r?\n/);
  return out.map(b => { const o = {}; for (const l of b.split(/\r?\n/)) { const [k, ...v] = l.split(' '); o[k] = v.join(' ') || true; } return o; }).filter(o => o.worktree);
}
function findWt(n) { const p = norm(path.join(WT, n)); return worktrees().find(w => norm(w.worktree) === p); }
function procsOf(dir) {
  const ps = sh('powershell', ['-NoProfile', '-Command', '[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-CimInstance Win32_Process | Select-Object ProcessId,Name,CommandLine | ConvertTo-Json -Compress']);
  if (!ps.ok) return null;
  let list = []; try { list = JSON.parse(ps.out); } catch (e) { return null; }
  if (!Array.isArray(list)) list = [list];
  // 路徑後面要接分隔符、空白、引號或結尾：procs phy 不可抓到 phy-2 的程式（11/27 Antigravity 複查【高】1，否則 --kill 會誤殺隔壁工作樹）
  const a = norm(dir), b = a.replace(/\//g, '\\');
  const re = new RegExp('(?:' + esc(a) + '|' + esc(b) + ')(?=$|[\\s"\'\\\\/])', 'i');
  return list.filter(p => p.CommandLine && p.ProcessId !== process.pid && re.test(p.CommandLine))
    .filter(p => !/wt\.cjs/.test(p.CommandLine));
}
const showProcs = l => l.forEach(p => say('    PID ' + p.ProcessId + ' ' + p.Name + '：' + p.CommandLine.replace(/\s+/g, ' ').slice(0, 160)));

if (cmd === '-h' || cmd === '--help' || !cmd) { console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]); process.exit(0); }
if (['new', 'done', 'procs'].includes(cmd) && name && !validName(name)) die('名稱只能用英數、- _ .（不可含 .. 或斜線）：' + name, 2);

if (cmd === 'new') {
  if (!name || !validName(name)) die('用法：node tools/wt.cjs new <名稱>（英數、- _ .）', 2);
  const dir = path.join(WT, name);
  if (fs.existsSync(dir)) die('已經有 ' + dir, 2);
  if (git(['rev-parse', '--verify', '--quiet', 'refs/heads/' + name]).ok) die('已經有分支 ' + name + '（換個名稱，或先 done 收掉舊的）', 2);
  const from = val('--from') || 'origin/main';
  if (DRY) { say('會從 ' + from + ' 開 ' + dir + '（分支 ' + name + '），接上 node_modules 連結點'); process.exit(0); }
  git(['fetch', '-q', 'origin']);
  const r = git(['worktree', 'add', '-q', '-b', name, dir, from]);
  if (!r.ok) die('開工作樹失敗：' + r.err);
  if (fs.existsSync(NM)) fs.symlinkSync(NM, path.join(dir, 'node_modules'), 'junction');
  if (flags.has('--editing')) fs.writeFileSync(path.join(dir, '.editing'), new Date().toISOString() + '\n');
  say('✓ 開好 ' + dir + '（分支 ' + name + '，從 ' + git(['rev-parse', '--short', from]).out + '）' + (fs.existsSync(NM) ? '，node_modules 已接上' : '，⚠ 主工作區沒有 node_modules'));
  process.exit(0);
}

if (cmd === 'procs') {
  if (!name) die('用法：node tools/wt.cjs procs <名稱>', 2);
  const l = procsOf(path.join(WT, name));
  if (l === null) die('讀不到行程清單', 2);
  if (!l.length) say('✓ 沒有殘留行程'); else { say('殘留行程 ' + l.length + ' 個：'); showProcs(l); }
  process.exit(l.length ? 1 : 0);
}

if (cmd === 'list') {
  const rows = worktrees().filter(w => norm(w.worktree).startsWith(norm(WT) + '/'));
  git(['fetch', '-q', 'origin']);
  for (const w of rows) {
    const n = path.basename(w.worktree);
    const br = w.branch ? String(w.branch).replace('refs/heads/', '') : (w.detached ? '（detached）' : '?');
    const dirty = git(['status', '--porcelain'], w.worktree).out.split('\n').filter(Boolean).filter(l => !/ node_modules\/?$/.test(l)).length;
    const ahead = w.branch ? git(['cherry', 'origin/main', w.branch]).out.split('\n').filter(l => l.startsWith('+')).length : 0;
    const when = git(['log', '-1', '--format=%cd', '--date=format:%m/%d %H:%M'], w.worktree).out;
    say((dirty ? '✎ ' : '  ') + n.padEnd(30) + br.padEnd(28) + ('未進 main ' + ahead).padEnd(12) + when + (isJunction(path.join(w.worktree, 'node_modules')) ? '  連結點' : '') + (dirty ? '  （' + dirty + ' 個檔有改動）' : ''));
  }
  say('共 ' + rows.length + ' 個工作樹（✎＝有沒 commit 的改動；未進 main＝分支上內容還不在 origin/main 的 commit 數）');
  process.exit(0);
}

if (cmd === 'done') {
  if (!name) die('用法：node tools/wt.cjs done <名稱> [--kill] [--clean-tmp] [--delete-branch] [--dry]', 2);
  const w = findWt(name);
  const dir = path.join(WT, name);
  if (!w) die('找不到工作樹 ' + dir + '（node tools/wt.cjs list 看有哪些）', 2);
  if (norm(w.worktree) === norm(MAIN)) die('不可以收主工作區', 2);
  const cwdN = norm(process.cwd()), dirN = norm(dir);
  if (cwdN === dirN || cwdN.startsWith(dirN + '/')) die('目前所在資料夾就在這個工作樹裡，先 cd 出去再收', 2);
  const br = w.branch ? String(w.branch).replace('refs/heads/', '') : null;
  let blocked = false;
  // ① 殘留行程
  const ps = procsOf(dir);
  if (ps === null) { say('✗ 讀不到行程清單（PowerShell 失敗或逾時），保險起見不收'); if (!DRY) blocked = true; }   // fail-closed（複查【中】6）
  else if (ps.length) {
    if (flags.has('--kill') && !DRY) {
      for (const p of ps) sh('taskkill', ['/PID', String(p.ProcessId), '/T', '/F']);
      const left = procsOf(dir) || [];
      if (left.length) { say('✗ 收不掉的殘留行程：'); showProcs(left); blocked = true; } else say('✓ 收掉 ' + ps.length + ' 個殘留行程');
    } else { say((DRY ? '會收' : '✗ 還有') + '殘留行程 ' + ps.length + ' 個' + (DRY ? '' : '（加 --kill 收掉）') + '：'); showProcs(ps); if (!DRY) blocked = true; }
  }
  // ② 沒 commit 的改動、沒加進 git 的檔
  const st = git(['status', '--porcelain'], dir).raw.split(/\r?\n/).filter(Boolean).filter(l => !/ node_modules\/?$/.test(l));
  if (st.length) { say('✗ 有沒 commit 的改動或新檔（先 commit、搬走或刪掉，這支不會硬刪）：'); st.slice(0, 20).forEach(l => say('    ' + l)); if (st.length > 20) say('    …共 ' + st.length + ' 個'); blocked = true; }
  // ②½ 改名探測：有程式以這個資料夾為工作目錄、或開著裡面的檔（命令列裡看不到路徑的那種），Windows 不准改名，就停下（11/27 實測：否則 git 只刪一半）
  if (!blocked && !DRY) {
    const probe = dir + '.__wt_probe';
    try { fs.renameSync(dir, probe); } catch (e) { say('✗ 還有程式在用這個資料夾（' + e.code + '）：可能是以它為工作目錄的終端機、node、瀏覽器。關掉後再收，或用工作管理員找。'); blocked = true; }
    if (!blocked) { try { fs.renameSync(probe, dir); } catch (e) { die('改名探測後改不回來！資料夾現在叫 ' + probe + '，請手動改回 ' + dir); } }
  }
  if (blocked) { say('\n✗ 沒有收：' + dir); process.exit(1); }
  // ③ 只拆連結點
  const nm = path.join(dir, 'node_modules');
  if (fs.existsSync(nm) || isJunction(nm)) {
    if (!isJunction(nm)) die(nm + ' 不是連結點而是真的資料夾，停下來（請人工確認後再處理）');
    if (DRY) say('會拆連結點 ' + nm); else { fs.rmdirSync(nm); if (!fs.existsSync(path.join(NM, '.package-lock.json')) && !fs.existsSync(path.join(NM, 'playwright'))) die('⚠ 拆完共用 node_modules 好像不見了，請立刻檢查 ' + NM); }
  }
  // ④ 移除工作樹（不加 --force）
  if (DRY) say('會 git worktree remove ' + dir);
  else {
    const r = git(['worktree', 'remove', dir]);
    if (!r.ok) { if (fs.existsSync(NM) && fs.existsSync(dir) && !fs.existsSync(nm)) fs.symlinkSync(NM, nm, 'junction'); die('git worktree remove 失敗：' + r.err + '\n  可能只刪了一半：用 git worktree list 和檔案總管看 ' + dir + ' 還剩什麼'); }
    git(['worktree', 'prune']);
  }
  // 分支
  let brMsg = br ? '分支 ' + br + ' 保留' : '原本是 detached，沒有分支';
  if (br) {
    // 先 fetch，cherry 失敗就當作「不確定」：保留分支（11/27 Antigravity 複查【高】3：origin/main 缺失時曾把未併的分支 -D 強刪）
    const fetched = git(['fetch', '-q', 'origin']).ok;
    const ch = git(['cherry', 'origin/main', br]);
    const ahead = ch.ok ? ch.out.split('\n').filter(l => l.startsWith('+')).length : null;
    if (flags.has('--delete-branch')) {
      if (!fetched || ahead === null) brMsg = '分支 ' + br + ' 保留：' + (!fetched ? 'git fetch 失敗' : 'git cherry 失敗（' + (ch.err || '找不到 origin/main') + '）') + '，無法確認內容都已進 main';
      else if (ahead) brMsg = '分支 ' + br + ' 還有 ' + ahead + ' 個 commit 不在 origin/main，不刪';
      else if (DRY) brMsg = '會刪分支 ' + br;
      else brMsg = git(['branch', '-D', br]).ok ? '分支 ' + br + ' 已刪（內容都在 origin/main）' : '分支 ' + br + ' 刪不掉';
    } else if (ahead === null) brMsg += '（無法確認是否都已進 main）';
    else if (ahead) brMsg +='（還有 ' + ahead + ' 個 commit 不在 origin/main）';
  }
  // F 槽暫存
  let tmpMsg = '';
  if (flags.has('--clean-tmp') && fs.existsSync(TMP)) {
    // 只認「<名稱>」本身或「<名稱>_…」「<名稱>-…」；若剛好是另一個現存工作樹的名稱開頭（收 phy 時遇到 phy-2_…）就跳過（11/27 Antigravity 複查【高】2）
    const others = worktrees().map(x => path.basename(x.worktree)).filter(o => o.toLowerCase() !== name.toLowerCase() && o.toLowerCase().startsWith(name.toLowerCase()));
    const mine = d => { const l = d.toLowerCase(), n = name.toLowerCase(); return l === n || l.startsWith(n + '_') || l.startsWith(n + '-'); };
    const theirs = d => others.some(o => { const l = d.toLowerCase(), n = o.toLowerCase(); return l === n || l.startsWith(n + '_') || l.startsWith(n + '-'); });
    const hits = name.length < 3 ? [] : fs.readdirSync(TMP).filter(d => mine(d) && !theirs(d) && d !== 'ClaudeBackup');
    if (name.length < 3) say('⚠ 名稱太短（少於 3 個字），不自動清 F 槽暫存');
    for (const d of hits) { if (DRY) say('會刪 ' + TMP + '/' + d); else fs.rmSync(path.join(TMP, d), { recursive: true, force: true }); }
    tmpMsg = hits.length ? '；F 槽暫存刪了 ' + hits.join('、') : '；F 槽沒有同名暫存';
  }
  say((DRY ? '（試跑）' : '✓ 收好 ') + dir + '；' + brMsg + tmpMsg);
  process.exit(0);
}

console.error('✗ 不認得的指令：' + cmd + '（node tools/wt.cjs --help 看用法）');
process.exit(2);
