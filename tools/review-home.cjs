#!/usr/bin/env node
/* 首頁改版審稿素材：完整原圖、首屏、互動特寫與可點開的總表。 */
'use strict';
const fs = require('fs'), path = require('path'), assert = require('assert/strict');
const H = require('./home-browser.cjs'), { ROOT, W, read } = require('./home-data.cjs');
const OUT = path.join(ROOT, '.shots/home-v2-r2'), RAW = path.join(OUT, 'raw');
const LANG = { 'zh-Hant': '繁體', 'zh-Hans': '簡體', en: 'English' };
const NAME = { index: '首頁', ...Object.fromEntries(H.subjects.map(s => [s.page, s.zh])) };
const STATE = { guest: '未登入', member: '已登入', admin: '管理員', history: '有本機紀錄' };
const specs = [];
for (const slug of ['index', 'physics']) for (const w of [390, 1280]) for (const theme of ['light', 'dark']) for (const lang of Object.keys(LANG)) specs.push({ slug, w, theme, lang, state: 'guest', kind: 'matrix' });
for (const slug of ['mathematics', 'music']) for (const [w, theme, lang] of [[390, 'light', 'zh-Hant'], [1280, 'dark', 'en'], [390, 'dark', 'zh-Hans']]) specs.push({ slug, w, theme, lang, state: 'guest', kind: 'matrix' });
// 八科均看 390/1280、淺/深完整頁；原本三語矩陣照留。
for(const subject of H.subjects) for(const w of [390,1280]) for(const theme of ['light','dark']) {
  if(!specs.some(s=>s.slug===subject.page&&s.w===w&&s.theme===theme&&s.lang==='zh-Hant')) specs.push({slug:subject.page,w,theme,lang:'zh-Hant',state:'guest',kind:'matrix'});
}
for(const w of [390,1280]) for(const theme of ['light','dark']) for(const lang of Object.keys(LANG)) specs.push({slug:'index',w,theme,lang,state:'member',kind:'member-matrix'});
for (const [state, mode] of [['member', 'status'], ['admin', 'status'], ['guest', 'cold'], ['history', 'recommend'], ['guest', 'search']]) for (const w of [390, 1280]) specs.push({ slug: 'index', w, theme: 'light', lang: 'zh-Hant', state, mode, kind: mode });
for (const slug of ['index', 'physics']) specs.push({ slug, w: 390, theme: 'light', lang: 'zh-Hant', state: 'guest', fs: 1.3, kind: 'large' });
for(const slug of ['index','physics']) for(const w of [390,1280]) for(const theme of ['light','dark']) for(const lang of Object.keys(LANG)) {
  if(!specs.some(s=>s.slug===slug&&s.w===w&&s.theme===theme&&s.lang===lang&&s.fs===1.3))specs.push({slug,w,theme,lang,state:'guest',fs:1.3,kind:'large'});
}
for(const w of [390,1280]) for(const theme of ['light','dark']) for(const lang of Object.keys(LANG)) specs.push({slug:'index',w,theme,lang,state:'member',fs:1.3,kind:'large'});
// 手機圖先產生，審稿總表同樣依寬度排序。
specs.sort((a,b)=>a.w-b.w);
specs.push({ slug: 'physics', w: 390, theme: 'light', lang: 'zh-Hant', mode: 'sticky', kind: 'interaction' }, { slug: 'music', w: 390, theme: 'light', lang: 'zh-Hant', mode: 'switch', kind: 'interaction' }, { slug: 'physics', w: 1280, theme: 'light', lang: 'zh-Hant', mode: 'redirect', kind: 'interaction' });
function label(s) { return `${NAME[s.slug]}／${STATE[s.state] || '未登入'}／${s.w}px／${s.theme === 'dark' ? '深色' : '淺色'}／${LANG[s.lang]}${s.fs ? '／字級 ×' + s.fs : ''}${s.mode ? '／' + ({ status: '個人狀態', cold: '冷啟動推薦', recommend: '有紀錄推薦', search: '搜尋展開', sticky: '分支黏頂列', switch: '科目切換到音樂', redirect: '舊錨點落點' }[s.mode]) : ''}`; }
async function shot(page, file, fullPage) { await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); try { await page.screenshot({ path: file, fullPage }); } catch (e) { await page.waitForTimeout(300); await page.screenshot({ path: file, fullPage }); } }
async function main() {
  fs.mkdirSync(RAW, { recursive: true });
  const { srv, base } = await H.server(), browser = await require('G:/physics-lab/tools/browser.cjs').launch();
  const results = [], redirects = [], additional = {};
  try {
    for (const [i, s] of specs.entries()) {
      const id = `${String(i + 1).padStart(2, '0')}-${s.slug}-${s.w}-${s.theme}-${s.lang}-${s.state || 'guest'}-${s.mode || s.kind}${s.fs ? '-large' : ''}`;
      const ctx = await H.context(browser, base, { ...s, h: s.w === 390 ? 844 : 900 }), page = await ctx.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(base + (s.mode === 'redirect' ? 'index.html#ch-newton' : s.slug + '.html'));
      if (s.mode === 'redirect') await page.waitForURL('**/physics.html#ch-newton');
      await H.ready(page, s.slug);
      if (s.mode === 'search') { await page.locator('#q').fill('電場'); await page.waitForFunction(() => document.querySelectorAll('#search-results a').length > 0); }
      if (s.mode === 'recommend' || s.mode === 'cold') await page.locator('#recommend-title').scrollIntoViewIfNeeded();
      if (s.mode === 'sticky') { await page.locator('#ch-newton').scrollIntoViewIfNeeded(); await page.waitForFunction(() => document.querySelector('.subjbar.show')); }
      const thumbnails = await H.primeImages(page);
      if (s.mode === 'recommend' || s.mode === 'cold') await page.locator('#recommend-title').scrollIntoViewIfNeeded();
      if (s.mode === 'sticky') await page.locator('#ch-newton').scrollIntoViewIfNeeded();
      const r = await H.inspect(page); assert.equal(r.sw, r.vw, label(s) + ' 橫向溢出'); assert.equal(r.cjk.length, 0, label(s) + ' 英文有中文'); assert.equal(errors.length, 0, label(s) + ' 頁面錯誤');
      if (s.slug === 'index') {
        assert.equal(r.smallText.length,0,label(s)+' 字級小於12 × fs：'+JSON.stringify(r.smallText)); assert(r.mutedContrast>=4.5,label(s)+' 次要字對比不足');
        assert.equal(r.cards.length, 8); assert(r.cards.every(c => Math.abs(c.w - r.cards[0].w) < 1 && c.h === r.cards[0].h && c.font === r.cards[0].font));
        if (!s.mode && s.w === 390 && !s.fs) { assert(r.cards[0].y < 844, label(s) + ' 首張按鍵上緣未進入首屏'); assert((await page.locator('.daily-banner').boundingBox()).y + (await page.locator('.daily-banner').boundingBox()).height <= 844, label(s) + ' 每日橫幅未完整進入首屏'); }
      }
      if (!s.mode || !['sticky', 'switch', 'redirect', 'recommend', 'cold'].includes(s.mode)) await page.evaluate(() => scrollTo(0, 0));
      await shot(page, path.join(RAW, id + '.png'), s.kind !== 'interaction');
      await shot(page, path.join(RAW, id + '-viewport.png'), false);
      results.push({ ...s, id, label: label(s), raw: 'raw/' + id + '.png', viewport: 'raw/' + id + '-viewport.png', metrics: r, thumbnails });
      await ctx.close(); console.log('截圖 ' + (i + 1) + '/' + specs.length + '：' + label(s));
    }
    const plannedSubject = H.subjects.find(s => s.id === 'info');
    const plannedChapter = JSON.parse(read('docs/directory/info.json')).branches.flatMap(b => b.chapters).find(c => !c.modules.some(m => W.LAB_LIVE_MODULES.includes(m)));
    for (const [hash, target] of [['physics', 'physics.html'], ['mech', 'physics.html#mech'], ['ch-newton', 'physics.html#ch-newton'], ['algebra', 'mathematics.html#algebra'], ['music', 'music.html'], [plannedChapter.id, plannedSubject.page + '.html#' + plannedChapter.id], ['not-a-real-anchor', 'index.html#not-a-real-anchor']]) {
      const ctx = await H.context(browser, base), page = await ctx.newPage();
      await page.goto(base + 'index.html#' + hash); await page.waitForTimeout(350);
      const actual = page.url().slice(base.length); redirects.push({ hash, target, actual, ok: actual === target }); assert.equal(actual, target); await ctx.close();
    }
    // 索引只在聚焦時載入，科目篩選、跨頁統計快取、隱私本機紀錄。
    {
      const ctx = await H.context(browser, base), page = await ctx.newPage(); await page.goto(base + 'index.html'); await H.ready(page, 'index');
      additional.lazySearch = await page.evaluate(() => !window.LAB_SEARCH_INDEX);
      for (const q of ['Lorentz', '平抛', '動量']) { await page.locator('#q').fill(q); await page.waitForFunction(() => !document.querySelector('#search-results').hidden); additional['search:' + q] = await page.locator('#search-results a').count(); }
      await page.goto(base + 'physics.html?q=酸鹼'); await H.ready(page, 'physics'); await page.waitForTimeout(100);
      additional.scoped = await page.locator('#search-results a').count() === 0 && (await page.locator('#search-all a').getAttribute('href')).includes('index.html?q=');
      additional.statsCache = (await H.inspect(page)).stats.filter(url => url.includes('/stats/')).length === 0;
      await page.goto(base + 'projectile.html'); await page.waitForTimeout(500); await page.goto(base + 'index.html'); await H.ready(page, 'index');
      additional.localHistory = await page.evaluate(() => JSON.parse(localStorage.getItem('labHist')).projectile.v >= 1);
      await ctx.close();
    }
    {
      const ctx = await H.context(browser, base, { js: false }), page = await ctx.newPage(); await page.goto(base + 'index.html');
      additional.staticLatest = await page.locator('#latest-labs .entry-card').count() === 4;
      additional.staticSubjects = await page.locator('.subject-card').count() === 8;
      await ctx.close();
    }
    {
      const ctx = await H.context(browser, base, { lang: 'zh-Hans' }), page = await ctx.newPage();
      await page.goto(base + 'index.html'); await H.ready(page, 'index');
      await page.locator('#q').fill('栈'); await page.waitForFunction(() => document.querySelectorAll('#search-results a').length > 0);
      additional.infoTerms = (await page.locator('#search-results').innerText()).includes('栈');
      await page.locator('#q').fill('向量'); await page.waitForFunction(() => document.querySelector('#search-results [data-hans-subject="math"]'));
      additional.mathTerms = (await page.locator('#search-results [data-hans-subject="math"]').first().innerText()).includes('向量');
      await ctx.close();
    }
    {
      const ctx = await H.context(browser, base, { state: 'member', failHome: true }), page = await ctx.newPage();
      await page.goto(base + 'index.html'); await H.ready(page, 'index');
      additional.failureState = (await page.locator('#home-status').innerText()).includes('進度暫時載入不了') && await page.locator('.status-stars').count() === 0;
      await ctx.close();
    }
  } finally { await browser.close(); srv.close(); }
  for (const w of [390, 1280]) results.push({ id: 'before-' + w, slug: 'index', w, theme: 'light', lang: 'zh-Hant', state: 'guest', kind: 'before', label: '改版前首頁／未登入／' + w + 'px／淺色／繁體', raw: '../home-v2/before-' + w + '.png', viewport: '../home-v2/before-' + w + '-viewport.png' });
  fs.writeFileSync(path.join(OUT, 'review.json'), JSON.stringify({ at: new Date().toISOString(), results, redirects, additional }, null, 1));
  assert(Object.values(additional).every(Boolean), JSON.stringify(additional));
  console.log('審稿原圖 ' + results.length + ' 張；相容、快取、純本機紀錄與無 JS 入口已驗證。');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
