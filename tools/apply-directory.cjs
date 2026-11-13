/*
 * apply-directory.cjs — 把各科的「目錄」（分支 → 章 → 實驗）套到首頁 index.html
 *
 * 目錄檔：docs/directory/<科目>.json（phy、chem、bio、earth、math），格式見 docs/directory/README.md。
 * 目錄裡列的是「已上線＋規劃中」的全部實驗；首頁只顯示已上線的卡片，其餘的章顯示「製作中」。
 *
 * 做的事（每個分支）：
 *   - 依目錄重建章目錄 <nav class="chapter-nav">：有已上線實驗的章是連結，其他是「製作中」。
 *   - 依目錄的順序重排章節區與卡片；卡片內容（標題、說明、關鍵字）原樣搬，不改。
 *   - 目錄只有一章時，照熱學原本的做法：不放章目錄、章節區用 .chapter.solo。
 *   - 分支沒有已上線的實驗時，保留「這個分支的實驗製作中」。
 *
 * 安全檢查（有錯就不寫檔）：
 *   - 首頁上每一張已上線的卡片都要出現在目錄裡，而且只出現一次。
 *   - 已上線的實驗不可換分支（任務、成就依賴 js/missions/index.js 的 LAB_MODULE_BRANCH）。
 *   - 章的 id 全站不可重複；已上線的章 id 不可消失。
 *
 * 用法：
 *   node tools/apply-directory.cjs            套用全部目錄檔
 *   node tools/apply-directory.cjs chem bio   只套用指定科目
 *   node tools/apply-directory.cjs --check    只檢查、列出會改什麼，不寫檔（有錯結束碼 1）
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'docs', 'directory');
const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const only = args.filter(a => !a.startsWith('--'));

const W = {};
new Function('window', fs.readFileSync(path.join(ROOT, 'js', 'missions', 'index.js'), 'utf8'))(W);
const SUBJ = {};
W.LAB_SUBJECTS.forEach(s => { SUBJ[s.id] = s; });

// 首頁的英文屬性把撇號寫成 &#x27;，照同樣寫法，套用現況目錄時首頁才會一字不差
const esc = t => String(t).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escText = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const errors = [];
const notes = [];

// 首頁上每個已上線實驗目前在哪個分支、哪一章
const CARD_RE = /^ {12}<a class="module live"[^\n]*data-module="([a-z0-9-]+)"[\s\S]*?\n {12}<\/a>\n/gm;
function branchBlock(src, id) {
  const start = src.indexOf('    <section class="branch" id="' + id + '"');
  if (start < 0) return null;
  const open = src.indexOf('      <div class="chapters">\n', start);
  const closeTag = '      </div>\n    </section>\n';
  const close = src.indexOf(closeTag, open);
  if (open < 0 || close < 0) return null;
  const next = src.indexOf('    <section class="branch" id=', start + 10);
  if (next >= 0 && close > next) return null;
  return { start: start, open: open, close: close, end: close + closeTag.length };
}
const liveWhere = {}; // 模組 → { branch, chapter }
Object.keys(W.LAB_MODULE_BRANCH).length; // 只用來確認載入成功
for (const s of W.LAB_SUBJECTS) for (const b of s.branches) {
  const blk = branchBlock(html, b);
  // 新科（newSubject）還沒放上首頁時沒有分支區塊，略過；放上首頁以後照樣檢查
  if (!blk) { if (!(s.newSubject && !html.includes('<section class="domain" id="' + s.id + '"'))) errors.push('首頁找不到分支 ' + b + ' 的區塊（或結構和預期不同）'); continue; }
  const region = html.slice(blk.open, blk.close);
  const secRe = /<section class="chapter[^"]*" id="([^"]+)"[\s\S]*?\n {8}<\/section>\n/g;
  let m;
  while ((m = secRe.exec(region))) {
    let c; const cr = new RegExp(CARD_RE.source, 'gm');
    while ((c = cr.exec(m[0]))) {
      if (liveWhere[c[1]]) errors.push('首頁有兩張 ' + c[1] + ' 的卡片');
      liveWhere[c[1]] = { branch: b, chapter: m[1], card: c[0] };
    }
  }
}

const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter(f => /^[a-z]+\.json$/.test(f)) : [];
const dirs = files.map(f => ({ f: f, d: JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')) }))
  .filter(x => !only.length || only.includes(x.d.subject));
if (!dirs.length) { console.log('沒有要套用的目錄檔（' + path.relative(ROOT, DIR) + '）'); process.exit(0); }

// 全站檢查：章 id、模組不可重複
const seenCh = {}, seenMod = {};
for (const { f, d } of dirs) {
  if (!SUBJ[d.subject]) { errors.push(f + '：科目代號 ' + d.subject + ' 不在 LAB_SUBJECTS'); continue; }
  if (d.branches.some(b => !branchBlock(html, b.id))) { errors.push(f + '：首頁還沒有 ' + d.subject + ' 的分支區塊（新科要先加科目區）'); continue; }
  for (const b of d.branches) {
    if (!SUBJ[d.subject].branches.includes(b.id)) errors.push(f + '：分支 ' + b.id + ' 不屬於 ' + d.subject + '（新分支要先加進 js/missions/index.js 的 LAB_SUBJECTS 與首頁）');
    if (!b.chapters || !b.chapters.length) errors.push(f + '：分支 ' + b.id + ' 沒有任何章');
    for (const c of b.chapters || []) {
      if (!/^ch-[a-z0-9-]+$/.test(c.id)) errors.push(f + '：章 id「' + c.id + '」格式不對（要 ch- 開頭、小寫英數與 -）');
      if (seenCh[c.id]) errors.push('章 id ' + c.id + ' 重複（' + seenCh[c.id] + '、' + f + '）');
      seenCh[c.id] = f;
      if (!c.zh || !c.en) errors.push(f + '：章 ' + c.id + ' 缺中文或英文名稱');
      for (const mo of c.modules || []) {
        if (seenMod[mo]) errors.push('實驗 ' + mo + ' 在目錄裡出現兩次（' + seenMod[mo] + '、' + c.id + '）');
        seenMod[mo] = c.id;
        const lw = liveWhere[mo];
        if (lw && lw.branch !== b.id) errors.push('已上線的 ' + mo + ' 在首頁屬於分支 ' + lw.branch + '，目錄卻放在 ' + b.id + '（已上線的實驗不可換分支）');
        if (lw && W.LAB_MODULE_BRANCH[mo] && W.LAB_MODULE_BRANCH[mo] !== b.id) errors.push(mo + '：任務清單的分支是 ' + W.LAB_MODULE_BRANCH[mo] + '，目錄是 ' + b.id);
      }
    }
  }
}
// 這些科目的每張已上線卡片都要在目錄裡；已上線的章 id 不可消失
const covered = new Set(dirs.flatMap(x => x.d.branches.map(b => b.id)));
for (const mo of Object.keys(liveWhere)) {
  if (covered.has(liveWhere[mo].branch) && !seenMod[mo]) errors.push('已上線的 ' + mo + '（' + liveWhere[mo].branch + '／' + liveWhere[mo].chapter + '）不在目錄裡');
}
const liveChapters = new Set(Object.values(liveWhere).filter(w => covered.has(w.branch)).map(w => w.chapter));
for (const ch of liveChapters) {
  const nowIn = Object.keys(liveWhere).filter(mo => liveWhere[mo].chapter === ch);
  if (!seenCh[ch]) errors.push('已上線的章 ' + ch + '（' + nowIn.join('、') + '）在目錄裡不見了：已上線的章 id 不可改');
}

if (errors.length) {
  console.log('✗ 目錄有 ' + errors.length + ' 個問題，沒有寫檔：');
  errors.forEach(e => console.log('  - ' + e));
  process.exit(1);
}

// 依目錄重建每個分支
let changed = 0;
for (const { d } of dirs) {
  let liveN = 0, planN = 0, chN = 0, soonCh = 0;
  for (const b of d.branches) {
    const blk = branchBlock(html, b.id);
    const block = html.slice(blk.start, blk.end);
    const solo = b.chapters.length === 1;
    const headEnd = block.indexOf('      </header>\n') + '      </header>\n'.length;
    const head = block.slice(0, headEnd);
    const oldNav = (block.match(/ {6}<nav class="chapter-nav"[^>]*>/) || [])[0];
    const bzh = (head.match(/<h2[^>]*>([^<]+)<\/h2>/) || [])[1] || b.id;
    const ben = (head.match(/<h2 data-en="([^"]+)"/) || [])[1] || b.id;
    let nav = '';
    if (!solo) {
      nav = (oldNav || '      <nav class="chapter-nav" aria-label="' + esc(bzh) + '的各章" data-en-aria-label="Chapters in ' + ben + '">') + '\n';
      for (const c of b.chapters) {
        const live = (c.modules || []).filter(mo => liveWhere[mo]);
        if (live.length) nav += '        <a href="#' + c.id + '" data-en="' + esc(c.en) + '">' + escText(c.zh) + '</a>\n';
        else { nav += '        <span class="soon" title="實驗製作中" data-en-title="Experiments coming soon" data-en="' + esc(c.en) + '">' + escText(c.zh) + '</span>\n'; soonCh++; }
      }
      nav += '      </nav>\n';
    }
    let chapters = '      <div class="chapters">\n';
    let anyLive = false;
    for (const c of b.chapters) {
      chN++;
      const live = (c.modules || []).filter(mo => liveWhere[mo]);
      liveN += live.length; planN += (c.modules || []).length - live.length;
      if (!live.length) continue;
      anyLive = true;
      if (solo) chapters += '        <section class="chapter solo" id="' + c.id + '" style="--n:' + live.length + '">\n';
      else chapters += '        <section class="chapter" id="' + c.id + '" aria-labelledby="h-' + c.id + '" style="--n:' + live.length + '">\n' +
        '          <h3 class="chapter-head" id="h-' + c.id + '"><span data-en="' + esc(c.en) + '">' + escText(c.zh) + '</span></h3>\n';
      chapters += '          <div class="modules">\n' + live.map(mo => liveWhere[mo].card).join('') + '          </div>\n        </section>\n';
    }
    if (!anyLive) chapters += '        <p class="branch-soon" data-en="Experiments for this branch are being built — check back soon.">這個分支的實驗製作中，敬請期待。</p>\n';
    chapters += '      </div>\n    </section>\n';
    const next = head + nav + chapters;
    if (next !== block) {
      changed++;
      html = html.slice(0, blk.start) + next + html.slice(blk.end);
    }
  }
  notes.push(SUBJ[d.subject].zh + '：' + d.branches.length + ' 個分支、' + chN + ' 章（' + soonCh + ' 章製作中）、已上線 ' + liveN + ' 個、規劃中 ' + planN + ' 個、合計 ' + (liveN + planN) + ' 個');
}

notes.forEach(n => console.log('  ' + n));
if (!changed) { console.log('✓ 首頁已經和目錄一致'); process.exit(0); }
if (CHECK) { console.log('有 ' + changed + ' 個分支和目錄不一致（--check 不寫檔）'); process.exit(1); }
fs.writeFileSync(path.join(ROOT, 'index.html'), html);
console.log('✓ 已依目錄更新首頁 ' + changed + ' 個分支（接著跑 npm run seo、python tools/stamp.py）');
