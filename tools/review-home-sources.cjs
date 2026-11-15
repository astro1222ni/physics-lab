#!/usr/bin/env node
/* 搬遷來源稽核：只允許實驗頁的導覽與 SEO 改變。 */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), assert = require('assert/strict'), { execFileSync } = require('child_process');
const { ROOT, subjects, W, read } = require('./home-data.cjs');
const invariant = JSON.parse(read('tools/home-v2-invariants.json'));
const git = f => execFileSync('git', ['show', invariant.sourceCommit + ':' + f], { cwd: ROOT, encoding: 'utf8', windowsHide: true, maxBuffer: 16 << 20, stdio: ['ignore', 'pipe', 'pipe'] });
const hash = s => crypto.createHash('sha256').update(s).digest('hex');
const old = git('index.html'), index = read('index.html'), source = subjects.map(s => read(s.page + '.html')).join('\n');
const C = {}; new Function('window', read('js/catalog.js'))(C);
const cardMap = html => new Map([...html.matchAll(/<a class="module live"[^>]*data-module="([^"]+)"[^>]*>[\s\S]*?<\/a>/g)].map(m => [m[1], m[0]]));
const before = cardMap(old), after = cardMap(source);
assert.equal(after.size, invariant.count); assert.equal(before.size, after.size);
assert.equal((source.match(/class="module live"/g) || []).length, invariant.count);
for (const [s, card] of before) assert.equal(after.get(s), card, '實驗卡片內容變動 ' + s);
assert.equal(hash(read('js/chapter-map.js')), invariant.chapterSHA256);
const baseRegistry = {}; new Function('window', git('js/missions/index.js'))(baseRegistry);
for (const k of ['LAB_LIVE_MODULES', 'LAB_MISSION_MODULES', 'LAB_MODULE_BRANCH']) assert.deepEqual(W[k], baseRegistry[k]);
assert.equal(read('firebase/database.rules.json'), git('firebase/database.rules.json'));
const clean = s => s.replace(/\s*<!-- SEO-BEGIN[\s\S]*?<!-- SEO-END -->/, '').replace(/<nav class="crumbs"[\s\S]*?<\/nav>/, '');
const modules = new Set(W.LAB_LIVE_MODULES);
for (const s of subjects) for (const b of JSON.parse(read('docs/directory/' + s.id + '.json')).branches) for (const c of b.chapters) for (const m of c.modules) if (fs.existsSync(path.join(ROOT, m + '.html'))) modules.add(m);
for (const s of modules) assert.equal(clean(read(s + '.html')), clean(git(s + '.html')), '實驗頁有非導覽／SEO 變更 ' + s);
assert.equal(index.match(/<meta name="google-site-verification"[^>]+>/)[0], old.match(/<meta name="google-site-verification"[^>]+>/)[0]);
assert(Buffer.byteLength(index) < 60 * 1024);
for (const f of fs.readdirSync(ROOT).filter(f => f.endsWith('.html'))) assert(!/href=(?:"|&quot;)index\.html#/.test(read(f)), '殘留舊連結 ' + f);
const latest = [...index.matchAll(/class="entry-card" href="([^"]+)\.html"/g)].map(m => C.LAB_CATALOG.find(x => x.s === m[1]));
assert.equal(latest.length, 6); for (let i = 1; i < latest.length; i++) assert(latest[i - 1].l >= latest[i].l);
for (const s of subjects) assert(latest.filter(x => x.d === s.dom).length <= 2);
for (const s of subjects) {
  const html = read(s.page + '.html'); assert(html.includes('CollectionPage') && html.includes('BreadcrumbList') && html.includes('hreflang="en"') && html.includes('og:image'));
  assert(read('sitemap.xml').includes('https://lab.astroni.org/' + s.page + '.html'));
  assert(C.LAB_CATALOG.filter(x => x.d === s.dom).every(x => W.LAB_SUBJECT_OF(x.s) === s.id));
}
const result = { at: new Date().toISOString(), labs: before.size, moduleHTMLPages: modules.size, extraModules: [...modules].filter(s => !W.LAB_LIVE_MODULES.includes(s)), exactCards: true, exactModuleHTMLExceptCrumbsSEO: true, unchangedMissionLists: true, chapterSHA256: hash(read('js/chapter-map.js')), googleVerification: true, noOldHrefs: true, latest: latest.map(x => ({ s: x.s, d: x.d, l: x.l })), files: Object.fromEntries(['index', ...subjects.map(s => s.page)].map(s => [s + '.html', fs.statSync(path.join(ROOT, s + '.html')).size])) };
fs.mkdirSync(path.join(ROOT, '.shots/home-v2'), { recursive: true }); fs.writeFileSync(path.join(ROOT, '.shots/home-v2/source-audit.json'), JSON.stringify(result, null, 1));
console.log('來源稽核通過：' + before.size + ' 張原卡逐字相同、' + modules.size + ' 實驗頁僅導覽／SEO 變更、任務清單與章制霸不變、舊連結 0 處。');
