#!/usr/bin/env node
/*
 * ship.cjs — 上線一條龍（11/27 站長在小幫手串選了「第 1、2 名交實驗室主串」，這是第 1 名 A1）
 *
 * 取代各串每次手打的「pull --rebase → stamp → 還原別人的頁 → 查衝突標記 → 測試 → push → curl 輪詢」。
 * 擋 11/21「rebase 衝突了還照推」那類事故：任何一步失敗就停，不會帶著衝突標記推上線。
 *
 * 三種用法（都在 repo 任一工作樹裡執行，或用 --repo 指定）：
 *   1. 直接推送：目前工作樹已經 commit 好（tracked 檔不可有未 commit 的改動）
 *        node tools/ship.cjs
 *        node tools/ship.cjs --add js/foo.js,foo.html -m "foo 修正"   先只 add 指名的檔並 commit，再推
 *   2. 主串推別串的分支（不碰對方的工作樹）：
 *        node tools/ship.cjs --from lab-chem-1127
 *      在 F:\測試暫存\ship_<日期>_<時間>\ 開乾淨工作樹（接在 origin/main），只挑出 main 還沒有的 commit，推完自動收掉。
 *   3. 子串只產交件單（不蓋版本號、不推送；推送交主串）：
 *        node tools/ship.cjs --handoff G:/physics-lab-wt/交件/化學-xxx.md -m "一句話說明"
 *
 * 選項：
 *   --retries N     push 被拒（別人先推）或連線暫時失敗時重來幾次，預設 5（11/27 同時有 4 件在推，3 次曾用完）
 *   --no-test       不跑 npm test（只在純文字、純設定時用；預設一定跑）
 *   --no-stamp      不蓋版本號
 *   --no-verify     推完不去正式站比對
 *   --dry           做到測試為止，不 push（用來試跑；--from 的暫存工作樹也會收掉）
 *   --keep          --from 模式推完不收暫存工作樹（除錯用）
 *   --timeout 秒    正式站比對最多等多久，預設 480
 *   --check-live <commit>  只查：這個 commit 改到的檔，正式站是不是已經一樣（不推、不改任何東西）
 *
 * 版本號衝突的統一做法（小幫手整合清單 D 段）：衝突區塊兩邊只差 ?v=、<meta name="lab-updated"> 或 tools/page-updated.json 時，
 * 自動取 main 那一邊，最後再重蓋受影響的頁。其他衝突一律停下來，請人處理。
 *
 * 結束碼：0 成功；1 失敗（訊息會說停在哪一步）；2 參數錯誤。
 */
'use strict';
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');

const SITE = 'https://lab.astroni.org/';
const PUSH_FLAGS = ['-c', 'credential.interactive=never', '-c', 'http.lowSpeedLimit=1000', '-c', 'http.lowSpeedTime=60'];
const GIT_ENV = Object.assign({}, process.env, { GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' });

// ── 參數 ──
const argv = process.argv.slice(2);
const opt = { retries: 5, timeout: 480 };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  const val = () => { if (i + 1 >= argv.length) die('參數 ' + a + ' 後面要接值', 2); return argv[++i]; };
  if (a === '--from') opt.from = val();
  else if (a === '--handoff') opt.handoff = val();
  else if (a === '--add') opt.add = val().split(',').map(s => s.trim()).filter(Boolean);
  else if (a === '-m' || a === '--msg') opt.msg = val();
  else if (a === '--retries') opt.retries = +val();
  else if (a === '--timeout') opt.timeout = +val();
  else if (a === '--repo') opt.repo = val();
  else if (a === '--no-test') opt.noTest = true;
  else if (a === '--no-stamp') opt.noStamp = true;
  else if (a === '--no-verify') opt.noVerify = true;
  else if (a === '--dry') opt.dry = true;
  else if (a === '--keep') opt.keep = true;
  else if (a === '--check-live') opt.checkLive = val();
  else if (a === '-h' || a === '--help') { console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]); process.exit(0); }
  else die('不認得的參數：' + a, 2);
}
if (opt.from && opt.handoff) die('--from 和 --handoff 不能一起用', 2);
if (opt.add && !opt.msg) die('--add 要搭配 -m "commit 說明"', 2);
if (!(opt.retries >= 0)) die('--retries 要是 0 以上的整數', 2);

function die(msg, code) { console.error('✗ ' + msg); process.exit(code || 1); }
function step(msg) { console.log('▸ ' + msg); }

let cwd = path.resolve(opt.repo || process.cwd());
function git(args, o) {
  o = o || {};
  const r = spawnSync('git', args, { cwd: o.cwd || cwd, env: GIT_ENV, encoding: 'utf8', maxBuffer: 64 << 20 });
  if (r.status !== 0 && !o.allowFail) {
    die('git ' + args.join(' ') + ' 失敗：\n' + ((r.stderr || '') + (r.stdout || '')).trim().split('\n').slice(-15).join('\n'));
  }
  return o.full ? r : (r.stdout || '').trim();
}
const lines = s => s ? s.split('\n').map(x => x.trim()).filter(Boolean) : [];
// git status --porcelain 第 1、2 碼是狀態（可能是空白），不可 trim；檔名從第 4 碼起（11/27 Antigravity 複查【高】）
const porcelain = () => { const r = git(['-c', 'core.quotepath=false', 'status', '--porcelain', '--untracked-files=no'], { full: true }); return (r.stdout || '').split(/\r?\n/).filter(Boolean); };
const porcelainFile = l => { const f = l.slice(3).trim(); const i = f.indexOf(' -> '); return i >= 0 ? f.slice(i + 4) : f; };

// ── 找 repo 根目錄、python ──
cwd = git(['rev-parse', '--show-toplevel']);
const MAIN_REPO = path.resolve(git(['rev-parse', '--git-common-dir']), '..');
function python() {
  for (const p of ['python', 'py']) {
    const r = spawnSync(p, ['-c', 'import sys;print(sys.version_info[0])'], { encoding: 'utf8' });
    if (r.status === 0 && r.stdout.trim() === '3') return p;
  }
  die('找不到 Python 3（python3 在這台是 Windows 商店空殼，不用它）');
}

// ── 衝突自動解：只差版本號的區塊取 main 那邊 ──
const normVer = s => s.replace(/\?v=[\w-]+/g, '?v=').replace(/<meta name="lab-updated" content="[^"]*">/g, '<meta name="lab-updated">');
function resolveStampConflicts() {
  const files = lines(git(['diff', '--name-only', '--diff-filter=U']));
  if (!files.length) return { ok: false, files };
  const bad = [];
  for (const f of files) {
    if (f === 'tools/page-updated.json') { git(['checkout', '--ours', '--', f]); git(['add', '--', f]); continue; }
    const p = path.join(cwd, f);
    if (!fs.existsSync(p)) { bad.push(f + '（一邊刪除一邊修改）'); continue; }
    const text = fs.readFileSync(p, 'utf8');
    const re = /^<<<<<<< [^\r\n]*\r?\n([\s\S]*?)^=======\r?\n([\s\S]*?)^>>>>>>> [^\r\n]*\r?\n/gm; // CRLF 檔也要解得開（11/27 複查【中】）
    let okFile = true, n = 0;
    const out = text.replace(re, (m, ours, theirs) => { n++; if (normVer(ours) !== normVer(theirs)) okFile = false; return ours; });
    if (!okFile || !n || /^(<<<<<<<|>>>>>>>) /m.test(out)) { bad.push(f); continue; }
    fs.writeFileSync(p, out);
    git(['add', '--', f]);
  }
  return { ok: bad.length === 0, files, bad };
}

// rebase 到 origin/main；遇到只差版本號的衝突自動解
function rebaseOntoMain() {
  git(['fetch', '-q', 'origin']);
  let r = git(['rebase', '-q', 'origin/main'], { allowFail: true, full: true });
  let guard = 0;
  while (r.status !== 0) {
    if (++guard > 50) { git(['rebase', '--abort'], { allowFail: true }); die('rebase 解衝突超過 50 輪，已放棄'); }
    const res = resolveStampConflicts();
    if (!res.files.length) { git(['rebase', '--abort'], { allowFail: true }); die('rebase 失敗（不是檔案衝突）：\n' + (r.stderr || r.stdout).trim()); }
    if (!res.ok) { git(['rebase', '--abort'], { allowFail: true }); die('rebase 有真正的內容衝突，已還原，請人工處理：' + res.bad.join('、')); }
    console.log('  已自動解版本號衝突：' + res.files.join('、'));
    r = git(['-c', 'core.editor=true', 'rebase', '--continue'], { allowFail: true, full: true });
    // 解完變成空 commit（內容 main 已有）就略過
    if (r.status !== 0 && /nothing to commit|empty/i.test((r.stdout || '') + (r.stderr || '')) && !lines(git(['diff', '--name-only', '--diff-filter=U'])).length) {
      r = git(['rebase', '--skip'], { allowFail: true, full: true });
    }
  }
}

// 這次要上線的改動（相對 origin/main）
function changedFiles() {
  const out = git(['diff', '--name-status', 'origin/main', 'HEAD']);
  const changed = [], deleted = [];
  for (const l of lines(out)) {
    const parts = l.split('\t'); const st = parts[0];
    if (st[0] === 'D') deleted.push(parts[1]);
    else changed.push(parts[parts.length - 1]);
  }
  return { changed, deleted };
}

// 受影響、要蓋版本號的頁：改到的 .html，加上載入了改到的 CSS／JS 的根目錄頁
function pagesToStamp(changed) {
  const assets = changed.filter(f => /^[\w-]+\.css$/.test(f) || /^js\/.*\.js$/.test(f));
  const pages = new Set(changed.filter(f => /\.html$/.test(f) && fs.existsSync(path.join(cwd, f))));
  if (assets.length) {
    for (const f of fs.readdirSync(cwd)) {
      if (!f.endsWith('.html')) continue;
      const s = fs.readFileSync(path.join(cwd, f), 'utf8');
      if (assets.some(a => s.includes('"' + a + '"') || s.includes('"' + a + '?v='))) pages.add(f);
    }
  }
  // stamp.py 的版本號只認根目錄 CSS 與 js/**；子資料夾頁也照給，它認得就蓋
  return [...pages].sort();
}

function stampPages(pages) {
  if (!pages.length) { console.log('  沒有要蓋版本號的頁'); return false; }
  const r = spawnSync(python(), ['-I', path.join(cwd, 'tools', 'stamp.py'), ...pages], { cwd, encoding: 'utf8' });
  if (r.status !== 0) die('stamp.py 失敗：\n' + (r.stderr || r.stdout));
  // 只收這幾頁和 page-updated.json；stamp.py 沒改到的別頁不會出現
  const touched = lines(git(['diff', '--name-only']));
  const allow = new Set(pages.concat(['tools/page-updated.json']));
  const extra = touched.filter(f => !allow.has(f));
  if (extra.length) die('stamp 後出現意料外的改動（不會推）：' + extra.join('、'));
  if (!touched.length) { console.log('  版本號已是最新'); return false; }
  git(['add', '--', ...touched]);
  git(['commit', '-q', '-m', '版本號：' + (opt.msg || '上線') + '（' + pages.length + ' 頁）\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>']);
  console.log('  蓋了 ' + touched.filter(f => f.endsWith('.html')).length + ' 頁：' + pages.slice(0, 12).join('、') + (pages.length > 12 ? '…' : ''));
  return true;
}

function checks() {
  const m = git(['grep', '-nE', '^(<<<<<<<|>>>>>>>) ', '--', '*.html', '*.js', '*.css', '*.json'], { allowFail: true });
  if (m) die('有衝突標記，不推：\n' + m.split('\n').slice(0, 10).join('\n'));
  if (opt.noTest) { console.log('  （--no-test：略過測試）'); return 'skipped'; }
  for (const t of [['tools/run-tests.cjs'], ['tests/url-permanence.test.js']]) {
    if (!fs.existsSync(path.join(cwd, t[0]))) continue;
    const r = spawnSync(process.execPath, t, { cwd, encoding: 'utf8', maxBuffer: 64 << 20 });
    const tail = (r.stdout + r.stderr).trim().split('\n').slice(-3).join('\n');
    if (r.status !== 0) die(t[0] + ' 沒過：\n' + (r.stdout + r.stderr).trim().split('\n').slice(-25).join('\n'));
    console.log('  ' + t[0] + '：' + tail.split('\n').pop());
  }
  return 'pass';
}

function fetchUrl(url) {
  return new Promise(res => {
    const req = https.get(url, { headers: { 'User-Agent': 'astro-lab-ship', 'Cache-Control': 'no-cache' }, timeout: 20000 }, r => {
      const b = []; r.on('data', c => b.push(c)); r.on('end', () => res({ status: r.statusCode, body: Buffer.concat(b) }));
    }).on('error', e => res({ status: 0, body: Buffer.from(String(e)) }));
    req.on('timeout', () => req.destroy(new Error('連線逾時 20 秒'))); // 半開連線不可卡死外層迴圈（11/27 複查【中】）
  });
}
const lf = b => Buffer.from(b.toString('binary').replace(/\r\n/g, '\n'), 'binary');

// 正式站比對：挑最多 8 個改到的檔，內容要和這次 commit 的一模一樣；刪掉的要 404
async function verifySite(changed, deleted, rev) {
  rev = rev || 'HEAD';
  const pick = changed.filter(f => /\.(html|js|css|json)$/.test(f) && !f.startsWith('tests/') && !f.startsWith('tools/') && !f.startsWith('.'))
    .sort((a, b) => (b.endsWith('.html') - a.endsWith('.html'))).slice(0, 8);
  const gone = deleted.filter(f => !f.startsWith('tests/') && !f.startsWith('tools/')).slice(0, 3);
  if (!pick.length && !gone.length) { console.log('  沒有網頁檔，不需要比對正式站'); return 'skip'; }
  const want = {}; for (const f of pick) want[f] = lf(execFileSync('git', ['show', rev + ':' + f], { cwd, maxBuffer: 64 << 20 }));
  const t0 = Date.now(); let left = pick.slice(), leftGone = gone.slice(), round = 0;
  while (Date.now() - t0 < opt.timeout * 1000) {
    round++;
    const still = [];
    for (const f of left) {
      const r = await fetchUrl(SITE + f.split('/').map(encodeURIComponent).join('/') + '?t=' + Date.now());
      if (!(r.status === 200 && lf(r.body).equals(want[f]))) still.push(f);
    }
    const stillGone = [];
    for (const f of leftGone) { const r = await fetchUrl(SITE + f.split('/').map(encodeURIComponent).join('/') + '?t=' + Date.now()); if (r.status !== 404) stillGone.push(f); }
    left = still; leftGone = stillGone;
    if (!left.length && !leftGone.length) { console.log('  正式站已更新（比對 ' + pick.length + ' 個檔' + (gone.length ? '、' + gone.length + ' 個刪除檔回 404' : '') + '，第 ' + round + ' 輪）'); return true; }
    await new Promise(r => setTimeout(r, 20000));
  }
  console.log('  ✗ 等了 ' + opt.timeout + ' 秒，正式站還不是新版：' + left.concat(leftGone.map(f => f + '（應 404）')).join('、'));
  return false;
}

function stamp8() { const d = new Date(Date.now() + 8 * 3600e3).toISOString(); return d.slice(0, 10).replace(/-/g, '') + '_' + d.slice(11, 16).replace(':', ''); }

(async function main() {
  let tmp = null;
  const cleanup = () => {
    if (tmp && !opt.keep) { git(['worktree', 'remove', '--force', tmp], { cwd: MAIN_REPO, allowFail: true }); git(['worktree', 'prune'], { cwd: MAIN_REPO, allowFail: true }); try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} }
  };
  process.on('exit', cleanup);

  if (opt.checkLive) {
    git(['fetch', '-q', 'origin']);
    const rev = git(['rev-parse', '--verify', opt.checkLive + '^{commit}']);
    const out = git(['diff', '--name-status', rev + '~1', rev]);
    const changed = [], deleted = [];
    for (const l of lines(out)) { const p = l.split('\t'); if (p[0][0] === 'D') deleted.push(p[1]); else changed.push(p[p.length - 1]); }
    // 之後的 commit 又改過同一個檔，就拿 origin/main 的版本比
    const later = new Set(lines(git(['diff', '--name-only', rev, 'origin/main'])));
    const inMain = git(['merge-base', '--is-ancestor', rev, 'origin/main'], { allowFail: true, full: true }).status === 0;
    if (!inMain) console.log('  注意：' + rev.slice(0, 8) + ' 不在 origin/main 裡，照理不會在正式站');
    const useMain = inMain && changed.some(f => later.has(f));
    step('查 ' + rev.slice(0, 8) + ' 改到的檔在正式站' + (useMain ? '（部分檔之後又改過，改用 origin/main 的內容比）' : ''));
    opt.timeout = Math.min(opt.timeout, 60);
    const ok = await verifySite(changed, deleted, useMain ? 'origin/main' : rev);
    process.exitCode = ok ? 0 : 1;
    return;
  }

  // ── 準備工作樹 ──
  if (opt.from) {
    git(['fetch', '-q', 'origin'], { cwd: MAIN_REPO });
    const ref = git(['rev-parse', '--verify', opt.from + '^{commit}'], { cwd: MAIN_REPO });
    // git cherry：只挑內容還不在 main 的 commit（rebase 過的同一份修改不會重複）
    const todo = lines(git(['cherry', 'origin/main', ref], { cwd: MAIN_REPO })).filter(l => l.startsWith('+')).map(l => l.slice(2));
    if (!todo.length) die(opt.from + ' 的修改 main 都已經有了，沒東西可推');
    const base = fs.existsSync('F:/') ? 'F:/測試暫存' : os.tmpdir();
    tmp = path.join(base, 'ship_' + stamp8() + '_' + process.pid);
    fs.mkdirSync(base, { recursive: true });
    git(['worktree', 'add', '-q', '--detach', tmp, 'origin/main'], { cwd: MAIN_REPO });
    cwd = tmp;
    step('從 ' + opt.from + ' 挑 ' + todo.length + ' 個 commit 到乾淨工作樹 ' + tmp);
    for (const c of todo) {
      const r = git(['cherry-pick', '--allow-empty', c], { allowFail: true, full: true });
      if (r.status !== 0) {
        const res = resolveStampConflicts();
        if (!res.ok) { git(['cherry-pick', '--abort'], { allowFail: true }); die('cherry-pick ' + c.slice(0, 8) + ' 有真正的內容衝突：' + (res.bad || res.files).join('、')); }
        console.log('  已自動解版本號衝突：' + res.files.join('、'));
        const c2 = git(['-c', 'core.editor=true', 'cherry-pick', '--continue'], { allowFail: true, full: true });
        if (c2.status !== 0) { git(['cherry-pick', '--skip'], { allowFail: true }); console.log('  ' + c.slice(0, 8) + ' 解完是空的，略過'); }
      }
      console.log('  ' + git(['log', '-1', '--format=%h %s']));
    }
  } else {
    const dirty = porcelain();
    if (opt.add) {
      const notMine = dirty.map(porcelainFile).filter(f => !opt.add.includes(f));
      if (lines(git(['diff', '--cached', '--name-only'])).some(f => !opt.add.includes(f))) die('暫存區已有別的檔，先處理：' + lines(git(['diff', '--cached', '--name-only'])).join('、'));
      git(['add', '--', ...opt.add]);
      git(['commit', '-q', '-m', opt.msg + '\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>']);
      if (notMine.length) console.log('  （沒 add 的改動留在原地：' + notMine.join('、') + '）');
    } else if (dirty.length) {
      die('工作樹有沒 commit 的改動，先 commit 或用 --add 指名：\n  ' + dirty.join('\n  '));
    }
    if (porcelain().length && !opt.add) die('工作樹不乾淨');
  }

  // ── 子串交件模式 ──
  if (opt.handoff) {
    step('接上最新 main');
    if (porcelain().length) die('工作樹還有沒 commit 的改動（--add 以外的檔），交件前先處理');
    rebaseOntoMain();
    const { changed, deleted } = changedFiles();
    if (!changed.length && !deleted.length) die('和 main 沒有差異，沒東西可交');
    step('檢查與測試');
    const test = checks();
    const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
    const commits = git(['log', '--format=- %h %s', 'origin/main..HEAD']);
    const pages = pagesToStamp(changed);
    const body = [
      '# 交件：' + (opt.msg || branch),
      '',
      '- 分支：' + branch + '（工作樹 ' + cwd + '），已接在 origin/main ' + git(['rev-parse', '--short', 'origin/main']) + ' 之後',
      '- 主串推送：`node tools/ship.cjs --from ' + (branch === 'HEAD' ? git(['rev-parse', '--short', 'HEAD']) : branch) + ' -m "' + (opt.msg || '') + '"`（版本號由主串蓋）',
      '- 測試：' + (test === 'pass' ? 'npm test 與 url-permanence 全過' : '略過（--no-test）'),
      '',
      '## commit',
      commits,
      '',
      '## 改到的檔（' + changed.length + '）' + (deleted.length ? '、刪除（' + deleted.length + '）' : ''),
      changed.slice(0, 60).map(f => '- ' + f).join('\n') + (changed.length > 60 ? '\n- …共 ' + changed.length + ' 個' : ''),
      deleted.length ? deleted.slice(0, 30).map(f => '- （刪）' + f).join('\n') : '',
      '',
      '## 要蓋版本號的頁（' + pages.length + '）',
      pages.join('、') || '（無）',
      '',
      '## 說明（請補）',
      '- 改了什麼、為什麼：',
      '- 自己驗過什麼（尺寸、深淺色、任務證明）：',
      ''
    ].join('\n');
    fs.mkdirSync(path.dirname(path.resolve(opt.handoff)), { recursive: true });
    if (fs.existsSync(opt.handoff)) die('交件單已存在，不覆寫：' + opt.handoff);
    fs.writeFileSync(opt.handoff, body);
    console.log('✓ 交件單已產生：' + opt.handoff + '（「說明」兩行請自己補，再傳給主串）');
    return;
  }

  // ── 推送模式 ──
  let attempt = 0, stamped = false, pages = [];
  for (;;) {
    step('接上最新 main' + (attempt ? '（第 ' + (attempt + 1) + ' 次）' : ''));
    if (stamped) { git(['reset', '-q', '--hard', 'HEAD~1']); stamped = false; }   // 重來時丟掉自己上一輪的版本號 commit，接好再重蓋
    rebaseOntoMain();
    var diff = changedFiles();
    if (!diff.changed.length && !diff.deleted.length) die('和 main 沒有差異，沒東西可推');
    if (!opt.noStamp) { step('蓋版本號'); pages = pagesToStamp(diff.changed); stamped = stampPages(pages); diff = changedFiles(); }
    step('檢查與測試');
    checks();
    const ahead = lines(git(['log', '--format=%h %s', 'origin/main..HEAD'])).map(l => '  ' + l).join('\n');
    if (opt.dry) { console.log('✓ 試跑到這裡為止，沒有 push。要推的 commit：\n' + ahead); return; }
    step('推送');
    const r = git([...PUSH_FLAGS, 'push', '-q', 'origin', 'HEAD:main'], { allowFail: true, full: true });
    if (r.status === 0) { console.log(ahead); break; }
    const err = (r.stderr || '') + (r.stdout || '');
    if ((/rejected|non-fast-forward|fetch first|timed out|Could not resolve|unable to access/i.test(err) || !err.trim()) && attempt < opt.retries) { attempt++; console.log('  別人先推了一版，重新接上再推'); continue; }
    die('push 失敗：\n' + err.trim().split('\n').slice(-8).join('\n') + (/rejected/.test(err) ? '\n（已重試 ' + attempt + ' 次；可加 --retries）' : ''));
  }
  const head = git(['rev-parse', '--short', 'HEAD']);
  let ok = true;
  if (!opt.noVerify) { step('正式站比對'); ok = await verifySite(diff.changed, diff.deleted); }
  console.log((ok ? '✓' : '△') + ' 已推上 main：' + head + (opt.from ? '（來源 ' + opt.from + '）' : '') + (pages.length ? '，蓋版本號 ' + pages.length + ' 頁' : '') + (ok === 'skip' ? '（只改了工具或測試，正式站不用比對）' : ok ? '，正式站已是新版' : '，但正式站比對逾時，請自己再看'));
  process.exitCode = ok ? 0 : 1;
})().catch(e => die(e && e.stack || String(e)));
