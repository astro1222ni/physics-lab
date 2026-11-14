#!/usr/bin/env node
/*
 * build-catalog.cjs — 從首頁 index.html 產生全站實驗目錄 js/catalog.js（npm run seo 會一起跑）
 *
 * 每個已上線的實驗：代號、中英標題、中英說明、科目（首頁科目區塊的 id：physics／chemistry／biology／earth）、分支、章、最後更新日期 u（git）。
 * js/classroom.js 用它在每個實驗頁底部列出「相關實驗」（同章 → 同分支 → 首頁上前後相鄰的實驗）。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const unesc = s => s.replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(+d)).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const strip = s => unesc(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
// 科目區塊（物理、化學、生物、地球科學…）的起點：卡片屬於它前面最近的那一個區塊
const domains = [...html.matchAll(/<section class="domain" id="([^"]+)"/g)].map(m => ({ at: m.index, id: m[1] }));
const domainOf = at => { let d = 'physics'; for (const x of domains) if (x.at < at) d = x.id; return d; };

// 依序找出分支、章、卡片的位置
const marks = [];
for (const m of html.matchAll(/<section class="branch" id="([^"]+)"[\s\S]*?<h2([^>]*)>([\s\S]*?)<\/h2>/g)) {
  const en = (m[2].match(/data-en="([^"]*)"/) || [])[1] || '';
  marks.push({ at: m.index, kind: 'branch', id: m[1], en: unesc(en), zh: strip(m[3]) });
}
// 一般的章有章名；分支只有一章時（class="chapter solo"）沒有章名，用分支名稱代替
for (const m of html.matchAll(/<section class="chapter( solo)?[^"]*" id="([^"]+)"[^>]*>\s*(?:<h3 class="chapter-head"[^>]*><span data-en="([^"]*)">([^<]*)<\/span>)?/g)) {
  marks.push({ at: m.index, kind: 'chapter', id: m[2], en: m[3] ? unesc(m[3]) : null, zh: m[4] ? m[4].trim() : null });
}
const KW = {};
for (const m of html.matchAll(/<a class="module live" href="([^"]+)\.html" data-module="([^"]+)"([^>]*)>([\s\S]*?)<\/a>/g)) {
  const body = m[4];
  const kw = m[3].match(/data-keywords="([^"]*)"/); if (kw) KW[m[2]] = unesc(kw[1]);
  const h = body.match(/<h4 data-en="([^"]*)">([\s\S]*?)<\/h4>/);
  const p = body.match(/<p data-en="([^"]*)">([\s\S]*?)<\/p>/);
  marks.push({ at: m.index, kind: 'card', slug: m[2], en: h ? unesc(h[1]) : '', zh: h ? strip(h[2]) : m[2], den: p ? unesc(p[1]) : '', dzh: p ? strip(p[2]) : '' });
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
    (x.en + ' ' + (x.den || '')).toLowerCase().replace(/[^a-z\- ]/g, ' ').split(/\s+/).forEach(w => { w = w.replace(/ies$/, 'y').replace(/s$/, ''); if (w.length >= 5 && !STOP.has(w)) t.add('e:' + w); });
    (KW[x.s] || '').split(/[\s,，、]+/).forEach(w => { if (w.length >= 2) t.add('k:' + w.toLowerCase()); });
    return t;
  };
  const T = list.map(toks), df = {};
  T.forEach(set => set.forEach(w => { df[w] = (df[w] || 0) + 1; }));
  list.forEach((a, i) => {
    let best = null;
    list.forEach((b, j) => {
      if (a.d === b.d) return;
      let sc = 0, k = 0;
      T[i].forEach(w => { if (T[j].has(w) && df[w] <= 12) { sc += Math.log(list.length / df[w]); if (w[0] === 'k') k++; } });
      if (((k >= 2 && sc >= 12) || sc >= 30) && (!best || sc > best.sc)) best = { sc, s: b.s };
    });
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
const git = args => { try { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim(); } catch (e) { return ''; } };
const dirty = new Set(git(['status', '--porcelain']).split(/\r?\n/).map(l => l.slice(3).trim().replace(/^"|"$/g, '')).filter(Boolean));
const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
for (const x of list) {
  const files = [x.s + '.html', 'js/' + x.s + '.js', 'js/' + x.s + '-core.js', 'js/' + x.s + '-3d.js', 'js/missions/' + x.s + '.js'].filter(f => fs.existsSync(path.join(ROOT, f)));
  x.u = files.some(f => dirty.has(f)) ? today : (git(['log', '-1', '--format=%cs', '--', ...files]) || today);
}

const out = '/* catalog.js — 全站實驗目錄（由 tools/build-catalog.cjs 從 index.html 產生，請勿手改；npm run seo 會更新） */\n' +
  'window.LAB_CATALOG = ' + JSON.stringify(list, null, 1).replace(/\n\s*/g, ' ').replace(/\}, \{/g, '},\n{') + ';\n';
fs.writeFileSync(path.join(ROOT, 'js', 'catalog.js'), out);
// 章的對照表 js/chapter-map.js（成就系統的「章制霸」用；檔案小，登入後才載入）：首頁順序，每章的分支與已上線實驗
const chapters = [];
for (const x of list) {
  if (!x.c) continue;
  let c = chapters.find(y => y.id === x.c);
  if (!c) { c = { id: x.c, zh: x.czh, en: x.cen, b: x.b, m: [] }; chapters.push(c); }
  c.m.push(x.s);
}
fs.writeFileSync(path.join(ROOT, 'js', 'chapter-map.js'),
  '/* chapter-map.js — 各章的已上線實驗（由 tools/build-catalog.cjs 從 index.html 產生，請勿手改；npm run seo 會更新） */\n' +
  'window.LAB_CHAPTERS = [\n' + chapters.map(c => JSON.stringify(c)).join(',\n') + '\n];\n');
const noCh = list.filter(x => !x.c).map(x => x.s);
console.log('實驗目錄：' + list.length + ' 個實驗' + (noCh.length ? '；沒有章的：' + noCh.join('、') : ''));
