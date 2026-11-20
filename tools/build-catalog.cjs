#!/usr/bin/env node
/*
 * build-catalog.cjs — 從各科目頁產生全站實驗目錄、搜尋索引與首頁靜態入口（npm run seo）
 *
 * 每個已上線的實驗：代號、中英標題、中英說明、科目（首頁科目區塊的 id：physics／chemistry／biology／earth）、分支、章、最後更新日期 u（git）。
 * js/classroom.js 用它在每個實驗頁底部列出「相關實驗」（同章 → 同分支 → 首頁上前後相鄰的實驗）。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { W, subjects, read, asset, text, esc, readCatalogText, formulaLabel, marker, miniCard } = require('./home-data.cjs');
const { plain } = require('../js/settings.js');
const invariant = JSON.parse(read('tools/home-v2-invariants.json'));
const subjectCopy = JSON.parse(read('tools/home-subject-copy.json'));
const html = subjects.filter(s => fs.existsSync(path.join(ROOT, s.page + '.html'))).map(s => read(s.page + '.html')).join('\n');

// 科目區塊（物理、化學、生物、地球科學…）的起點：卡片屬於它前面最近的那一個區塊
const domains = [...html.matchAll(/<section class="domain" id="([^"]+)"/g)].map(m => ({ at: m.index, id: m[1] }));
const domainOf = at => { let d = 'physics'; for (const x of domains) if (x.at < at) d = x.id; return d; };

// 依序找出分支、章、卡片的位置
const marks = [];
for (const m of html.matchAll(/<section class="branch" id="([^"]+)"[\s\S]*?<h2((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/h2>/g)) {
  const en = (m[2].match(/\bdata-en(?:-html)?="([^"]*)"/) || [])[1] || '';
  marks.push({ at: m.index, kind: 'branch', id: m[1], en: readCatalogText(en), zh: readCatalogText(m[3]) });
}
// 一般的章有章名；分支只有一章時（class="chapter solo"）沒有章名，用分支名稱代替
for (const m of html.matchAll(/<section class="chapter( solo)?[^"]*" id="([^"]+)"[^>]*>\s*(?:<h3 class="chapter-head"[^>]*><span data-en(?:-html)?="([^"]*)">([\s\S]*?)<\/span>)?/g)) {
  marks.push({ at: m.index, kind: 'chapter', id: m[2], en: m[3] ? readCatalogText(m[3]) : null, zh: m[4] ? readCatalogText(m[4]) : null });
}
const KW = {};
for (const m of html.matchAll(/<a class="module live" href="([^"]+)\.html" data-module="([^"]+)"([^>]*)>([\s\S]*?)<\/a>/g)) {
  const body = m[4];
  const kw = m[3].match(/data-keywords="([^"]*)"/); if (kw) KW[m[2]] = plain(readCatalogText(kw[1]));
  const h = body.match(/<h4 data-en(?:-html)?="([^"]*)">([\s\S]*?)<\/h4>/);
  const p = body.match(/<p data-en(?:-html)?="([^"]*)">([\s\S]*?)<\/p>/);
  marks.push({ at: m.index, kind: 'card', slug: m[2], en: h ? readCatalogText(h[1]) : '', zh: h ? readCatalogText(h[2]) : m[2], den: p ? readCatalogText(p[1]) : '', dzh: p ? readCatalogText(p[2]) : '' });
}
marks.sort((a, b) => a.at - b.at);

let branch = null, chapter = null;
const list = [];
for (const k of marks) {
  if (k.kind === 'branch') { branch = k; chapter = null; }
  else if (k.kind === 'chapter') chapter = k.zh ? k : { id: k.id, zh: branch ? branch.zh : '', en: branch ? branch.en : '' };
  else if (!list.some(x => x.s === k.slug)) {
    list.push({
      s: k.slug, zh: k.zh, en: k.en, dzh: k.dzh, den: k.den,
      d: domainOf(k.at),
      b: branch ? branch.id : '', bzh: branch ? branch.zh : '', ben: branch ? branch.en : '',
      c: chapter ? chapter.id : '', czh: chapter ? chapter.zh : '', cen: chapter ? chapter.en : ''
    });
  }
}

// 跨科相關實驗（11/14 站長要「相關實驗推薦」）：比對英文標題與說明的字、首頁卡片的關鍵字，
// 依稀有程度加權，挑一個不同科目、分數夠高的實驗放在 x（實驗頁「相關實驗」的跨科卡片）
{
  const STOP = new Set('about above after again against their there these those which while where would could should other every through between using with from into your this that what when they them then than have will each such more most some very just over under also both only like make makes made watch change changes changing shows show compare learn their simulation interactive experiment explore'.split(' '));
  const toks = x => {
    const t = new Set();
    plain(x.en + ' ' + (x.den || '')).toLowerCase().replace(/[^a-z\- ]/g, ' ').split(/\s+/).forEach(w => { w = w.replace(/ies$/, 'y').replace(/s$/, ''); if (w.length >= 5 && !STOP.has(w)) t.add('e:' + w); });
    (KW[x.s] || '').split(/[\s,，、]+/).forEach(w => { if (w.length >= 2) t.add('k:' + w.toLowerCase()); });
    return t;
  };
  const T = list.map(toks), df = {};
  T.forEach(set => set.forEach(w => { df[w] = (df[w] || 0) + 1; }));
  const idf = w => Math.log(list.length / df[w]);
  const norm = T.map(set => Math.sqrt([...set].reduce((sum, w) => sum + idf(w) ** 2, 0)));
  list.forEach((a, i) => {
    let best = null;
    const similar = [];
    list.forEach((b, j) => {
      if (i === j || (a.d === b.d && a.c === b.c)) return;
      let sc = 0, k = 0, dot = 0;
      T[i].forEach(w => { if (T[j].has(w)) dot += idf(w) ** 2; });
      T[i].forEach(w => { if (T[j].has(w) && df[w] <= 12) { sc += Math.log(list.length / df[w]); if (w[0] === 'k') k++; } });
      similar.push({ sc, s: b.s, cosine: norm[i] && norm[j] ? dot / (norm[i] * norm[j]) : 0 });
      if (a.d !== b.d && ((k >= 2 && sc >= 12) || sc >= 30) && (!best || sc > best.sc)) best = { sc, s: b.s };
    });
    const ranked = similar.sort((a, b) => b.sc - a.sc || a.s.localeCompare(b.s)).slice(0, 6);
    a.r = ranked.map(x => x.s);
    a.rs = Object.fromEntries(ranked.map(x => [x.s, +x.cosine.toFixed(6)]));
    if (best) a.x = best.s;
  });
  // 手動指定（自動配對不理想或漏掉的；值為 null 表示不放跨科卡片）
  const FIX = {
    'ph-scale': 'enzyme-kinetics', 'acid-base-titration': 'exp-log', 'projectile': 'quadratic-function',
    'earthquake': 'gps-trilateration', 'chords': 'standing-waves', 'circle-of-fifths': 'temperament',
    'quadratic-function': 'projectile', 'gps-trilateration': 'earthquake', 'loudness': 'exp-log'
  };
  const has = new Set(list.map(x => x.s));
  Object.keys(FIX).forEach(k => {
    const a = list.find(x => x.s === k); if (!a) return;
    const v = FIX[k];
    if (v === null) delete a.x;
    else if (has.has(v) && list.find(x => x.s === v).d !== a.d) a.x = v;
  });
}

// 每個實驗最後更新日期：相關檔案最近一次 commit 的日期；還沒 commit 的修改算今天
const { execFileSync } = require('child_process');
const git = args => { try { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim(); } catch (e) { return ''; } };
const { historyDates, launchCohorts, checkFresh } = require('./catalog-dates.cjs');
const firstDates = historyDates(list.map(x => x.s));
const launch = JSON.parse(read('tools/catalog-launch.json'));
const { siteDates, subjectLaunches } = launchCohorts(launch, invariant.catalog, list, firstDates);
const dirty = new Set(git(['status', '--porcelain']).split(/\r?\n/).map(l => l.slice(3).trim().replace(/^"|"$/g, '')).filter(Boolean));
const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
for (const x of list) {
  const files = [x.s + '.html', 'js/' + x.s + '.js', 'js/' + x.s + '-core.js', 'js/' + x.s + '-3d.js', 'js/missions/' + x.s + '.js'].filter(f => fs.existsSync(path.join(ROOT, f)));
  x.u = files.some(f => dirty.has(f)) ? today : (git(['log', '-1', '--format=%cs', '--', ...files]) || today);
  const subject = subjects.find(s => s.dom === x.d), directory = JSON.parse(read('docs/directory/' + subject.id + '.json'));
  // 還沒進 HEAD 歷史（未 commit、準備今天上線）的實驗，上架日算今天。
  x.l = firstDates[x.s]?.date || directory.launchDate || (dirty.has(x.s + '.html') ? today : undefined);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(x.l || '') || !Number.isFinite(Date.parse(x.l)) || new Date(x.l + 'T00:00:00Z').toISOString().slice(0, 10) !== x.l || x.l > today) throw new Error('缺少有效上架日（Git 全歷史／目錄上線日）：' + x.s);
  x.n = (read('js/missions/' + x.s + '.js').match(/\bid:\s*['"][a-z0-9-]+['"]/g) || []).length;
}
// 建站舊站不顯示新徽章。新科首批顯示徽章，其餘新增站照常檢查每科 30% 上限。
const freshness = checkFresh(list, today, siteDates, subjectLaunches);

const out = '/* catalog.js — 全站實驗目錄（由 tools/build-catalog.cjs 從各科目頁產生，請勿手改；npm run seo 會更新） */\n' +
  'window.LAB_CATALOG = ' + JSON.stringify(list, null, 1).replace(/\n\s*/g, ' ').replace(/\}, \{/g, '},\n{') + ';\n';
// 章的對照表 js/chapter-map.js（成就系統的「章制霸」用；檔案小，登入後才載入）：首頁順序，每章的分支與已上線實驗
const chapters = [];
for (const x of list) {
  if (!x.c) continue;
  let c = chapters.find(y => y.id === x.c);
  if (!c) { c = { id: x.c, zh: x.czh, en: x.cen, b: x.b, m: [] }; chapters.push(c); }
  c.m.push(x.s);
}
const chapterOut =
  '/* chapter-map.js — 各章的已上線實驗（由 tools/build-catalog.cjs 從 index.html 產生，請勿手改；npm run seo 會更新） */\n' +
  'window.LAB_CHAPTERS = [\n' + chapters.map(c => JSON.stringify(c)).join(',\n') + '\n];\n';
// 搬遷防護：先完成所有檢查，再寫任何產生檔。
const baseline = new Map(invariant.catalog.map(x => [x.s, x]));
for (const s of baseline.keys()) if (!list.some(x => x.s === s)) throw new Error('搬遷前的實驗不見了 ' + s);
if (list.length !== W.LAB_LIVE_MODULES.length || list.length < invariant.count || new Set(list.map(x => x.s)).size !== list.length) throw new Error('已上線實驗遺失或重複');
for (const x of list) {
  if (!W.LAB_LIVE_MODULES.includes(x.s)) throw new Error('非已上線實驗 ' + x.s);
  const p = baseline.get(x.s);
  if (p && ['s', 'd', 'b', 'c'].some(k => p[k] !== x[k])) throw new Error('科目／分支／章對應改變 ' + x.s);
}
const reserved = new Set(subjects.map(s => s.page).concat(W.LAB_SUBJECT_GROUPS.flatMap(g => g.soon.map(s => s.page))));
if (list.some(x => reserved.has(x.s))) throw new Error('實驗代號與保留科目頁名衝突');
const hash = require('crypto').createHash('sha256').update(chapterOut).digest('hex');
if (hash !== invariant.chapterSHA256 && list.length === invariant.count) throw new Error('chapter-map.js 與搬遷前不同');
fs.writeFileSync(path.join(ROOT, 'js/catalog.js'), out);
fs.writeFileSync(path.join(ROOT, 'js/chapter-map.js'), chapterOut);
const search = list.map(x => Object.assign({}, x, { keywords: KW[x.s] || '', live: true }));
const redirects = {}, dirs = {};
for (const s of subjects) {
  const f = 'docs/directory/' + s.id + '.json';
  const d = fs.existsSync(path.join(ROOT, f)) ? JSON.parse(read(f)) : { branches: [] };
  dirs[s.id] = d;
  redirects[s.dom] = s.page;
  for (const b of d.branches) {
    redirects[b.id] = s.page;
    const bzh = readCatalogText(b.zh), ben = readCatalogText(b.en);
    for (const c of b.chapters) {
      redirects[c.id] = s.page;
      const czh = readCatalogText(c.zh), cen = readCatalogText(c.en);
      for (const mo of c.modules || []) if (!list.some(x => x.s === mo)) search.push({ s: mo, zh: czh + '・新實驗製作中', en: cen + ' · New lab in progress', dzh: '這個實驗還在製作，先試試同章已上線的實驗。', den: 'This lab is in progress. Try a live lab in the same chapter.', d: s.dom, b: b.id, bzh, ben, c: c.id, czh, cen, live: false, keywords: mo.replace(/-/g, ' ') });
    }
  }
  let page = read(s.page + '.html');
  page = page.replace(/data-subject="([^"]+)"(?! data-hans-subject)/g, 'data-subject="$1" data-hans-subject="$1"');
  // 製作中的章也提供穩定落點，不改章代號。
  page = page.replace(/<span class="soon"(?! id=)([^>]*data-en(?:-html)?="([^"]*)"[^>]*)>([\s\S]*?)<\/span>/g, (m, attrs, en, name) => {
    const c = d.branches.flatMap(b => b.chapters).find(c => readCatalogText(c.en) === readCatalogText(en));
    return c ? '<span class="soon" id="' + c.id + '"' + attrs + '>' + name + '</span>' : m;
  });
  if (fs.existsSync(path.join(ROOT, 'docs/textbook/' + s.id + '.json'))) page = page.replace('class="textbook-control" hidden', 'class="textbook-control" data-source="docs/textbook/' + s.id + '.json" hidden');
  fs.writeFileSync(path.join(ROOT, s.page + '.html'), page);
}
fs.writeFileSync(path.join(ROOT, 'js/search-index.js'), '/* 搜尋索引，由 tools/build-catalog.cjs 產生。 */\nwindow.LAB_SEARCH_INDEX = ' + JSON.stringify(search) + ';\n');
let home = read('index.html');
const ordered = list.slice().sort((a, b) => b.l.localeCompare(a.l) || a.s.localeCompare(b.s));
const latest = [], counts = {};
for (const x of ordered) if ((counts[x.d] || 0) < 2 && latest.length < 4) { latest.push(x); counts[x.d] = (counts[x.d] || 0) + 1; }
home = marker(home, 'LATEST', latest.map(x => miniCard(x, text(x.l.slice(5).replace('-', '/') + ' 上架', 'Added ' + x.l.slice(5).replace('-', '/'), 'p', 'class="entry-note"'))).join('\n'));
const groups = W.LAB_SUBJECT_GROUPS.map(g => {
  const cards = subjects.filter(s => s.group === g.id).map(s => {
    const a = asset(s), live = list.filter(x => x.d === s.dom), plan = dirs[s.id].branches.flatMap(b => b.chapters.flatMap(c => c.modules || [])).filter(m => !W.LAB_LIVE_MODULES.includes(m)).length;
    const fresh = freshness[s.dom].incremental.length;
    const branches = dirs[s.id].branches, copy = subjectCopy[s.dom] || {zh:branches.map(b => b.zh).join('・'),en:branches.map(b => b.en).join(' · ')};
    return `<a class="subject-card sb-${s.id}" href="${s.page}.html" data-subject="${s.id}" data-hans-subject="${s.id}" style="--c:${a.color}">${a.icon}<div class="subject-name">${text(s.zh, s.en, 'h3')}${text(live.length + ' 個實驗', live.length + (live.length === 1 ? ' lab' : ' labs'), 'span', 'class="subject-live"')}</div>${formulaLabel(readCatalogText(copy.zh), readCatalogText(copy.en), 'p', 'class="subject-branches"')}<div class="subject-extra">${plan ? text('另有 ' + plan + ' 個製作中', plan + ' more in progress', 'small') : ''}<span class="subject-stars" hidden></span></div>${fresh ? '<span class="subject-new">' + text('新 +' + fresh, '+' + fresh + ' new') + '</span>' : ''}</a>`;
  });
  const zh = '製作中：' + g.soon.map(s => s.zh).join('・'), en = 'Coming soon: ' + g.soon.map(s => s.en).join(' · ');
  const soon = g.soon.length ? text(esc(zh), en, 'p', 'class="subject-soon" role="note" aria-label="' + esc(zh) + '" data-en-aria-label="' + esc(en) + '"') : '';
  // 11/15 站長：四大類先收成四個區塊，點開才展開各科（details／summary；home.js 記住開合）
  const gs = subjects.filter(s => s.group === g.id), nLive = gs.reduce((n, s) => n + list.filter(x => x.d === s.dom).length, 0);
  const names = text(esc(gs.map(s => s.zh).concat(g.soon.map(s => s.zh)).join('・')), gs.map(s => s.en).concat(g.soon.map(s => s.en)).join(' · '), 'span', 'class="sg-names"');
  const meta = gs.length ? text(gs.length + ' 科・' + nLive + ' 個實驗', gs.length + (gs.length > 1 ? ' subjects' : ' subject') + ' · ' + nLive + ' labs', 'span', 'class="sg-meta"') : text('製作中', 'Coming soon', 'span', 'class="sg-meta"');
  return `<details class="subject-group group-${g.id}" data-group="${g.id}"><summary class="sg-head">${text(g.zh, g.en, 'h3', 'id="group-' + g.id + '"')}${meta}${names}<span class="sg-chev" aria-hidden="true"></span></summary>${cards.length ? '<div class="subject-grid">' + cards.join('\n') + '</div>' : ''}${soon}</details>`;
}).join('\n');
home = marker(home, 'SUBJECTS', '<div class="subject-groups">' + groups + '</div>');
const daily = require('../js/daily-core.js');
home = marker(home, 'TREASURE', daily.ITEMS.map(it => '<span data-treasure="' + it.id + '">' + daily.icon(it.id) + '</span>').join(''));
home = marker(home, 'REDIRECT', '<script>/* 舊錨點保留：由科目清單與完整目錄產生 */\n(function(){var m=' + JSON.stringify(redirects) + ';var h;try{h=decodeURIComponent(location.hash.slice(1));}catch(e){return;}if(Object.prototype.hasOwnProperty.call(m,h))location.replace(m[h]+".html"+location.search+(' + JSON.stringify(subjects.map(s => s.dom)) + '.indexOf(h)>=0?"":"#"+encodeURIComponent(h)));})();\n</script>');
fs.writeFileSync(path.join(ROOT, 'index.html'), home);
const noCh = list.filter(x => !x.c).map(x => x.s);
console.log('實驗目錄：' + list.length + ' 個實驗' + (noCh.length ? '；沒有章的：' + noCh.join('、') : ''));
