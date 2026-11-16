/* 分享成績與實驗搜尋的本機互動驗收；須由 browser-lock.cjs 排隊執行。 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { launch } = require('./browser.cjs');
const { server } = require('./home-browser.cjs');
const ROOT = path.resolve(__dirname, '..');
const outArg = process.argv.find(a => a.startsWith('--out='));
const OUT = path.resolve(outArg ? outArg.slice(6) : path.join(ROOT, '.shots/share-results'));
const MOCK = fs.readFileSync(path.join(ROOT, 'tools/mock-backend.js'), 'utf8');
const INDEX = fs.readFileSync(path.join(ROOT, 'js/missions/index.js'), 'utf8');
const reference = {};
new Function('window', INDEX)(reference);
const clock = Date.UTC(2026, 10, 16, 2);
const fixtures = {
  profiles: { u1: { nickname: 'Explorer 07', pub: true } }, admins: {},
  completions: { u1: {
    'electric-field-1': { stars: 1, at: clock - 7200000 },
    'projectile-1': { stars: 1, at: clock - 259200000 },
    'incline-friction-1': { stars: 1, at: clock - 3600000 },
    'projectile-2': { stars: 2, at: clock - 900000 }
  } },
  scores: { u1: { stars: 5, s: { phy: 5 }, sa: { phy: clock }, name: 'Explorer 07', pub: true, at: clock, last: 'projectile-2' } },
  userStats: { u1: { modules: { 'lens-mirror': true, capacitor: true, kepler: true },
    days: { '20261115': { 'lens-mirror': true }, '20261114': { capacitor: true } } } },
  missionDefs: { 'electric-field-1': { stars: 1 }, 'projectile-1': { stars: 1 }, 'projectile-2': { stars: 2 }, 'incline-friction-1': { stars: 1 } }
};
const history = { 'standing-waves': { v: 1, o: 2, s: 20, t: clock + 60000 }, doppler: { v: 1, o: 1, s: 10, t: clock + 30000 } };
const report = { 開始時間: new Date().toISOString(), 假資料: fixtures, 本機紀錄: history, 檢查: [], 截圖: [] };
function pass(name, detail) { report.檢查.push({ 項目: name, 結果: '通過', 詳情: detail }); console.log('通過：' + name); }
function seed(o) {
  if (!sessionStorage.getItem('share-results-fixture')) {
    sessionStorage.setItem('share-results-fixture', '1');
    localStorage.setItem('lab-settings', JSON.stringify({ lang: o.lang || 'zh-Hant', theme: o.theme, fs: o.fs || 1 }));
    localStorage.setItem('lab-welcome-v1', 'skip');
    localStorage.setItem('mdb', JSON.stringify(o.fixtures));
    localStorage.setItem('labHist', JSON.stringify(o.history));
    localStorage.setItem('mocknext', 'u1');
    if (!o.guest) localStorage.setItem('mockuser', 'u1');
  }
  window.LAB_STATS_DB = location.origin + '/__stats';
}
async function context(browser, base, opts) {
  const ctx = await browser.newContext({ viewport: { width: opts.w, height: opts.h }, colorScheme: opts.theme,
    hasTouch: opts.w < 720, reducedMotion: 'reduce', serviceWorkers: 'block' });
  await ctx.route(u => !u.href.startsWith(base), r => r.abort());
  await ctx.addInitScript({ content: '(' + seed.toString() + ')(' + JSON.stringify({ ...opts, fixtures, history }) + ');\n' + MOCK });
  return ctx;
}
async function loaded(page, base, slug, lang = '') {
  await page.goto(base + slug + '.html' + (lang ? '?lang=' + lang : ''), { waitUntil: 'load' });
  await page.waitForFunction(() => window.LabMission?._state.ready);
  await page.evaluate(() => document.fonts.ready);
  if (lang === 'zh-Hans') await page.waitForFunction(() => !!window.LabSettings.toHans);
}
async function cardReady(page) {
  await page.waitForFunction(() => document.querySelector('.lab-sc-prev img')?.naturalWidth === 1080 && !document.querySelector('.lab-sc-acts button:disabled'));
}
async function shot(page, name, picker = false) {
  if (picker) await page.evaluate(() => {
    const card = document.querySelector('.lab-sc-card'), side = document.querySelector('.lab-sc-side'), head = document.querySelector('.lab-sc-head');
    card.scrollTop += side.getBoundingClientRect().top - head.getBoundingClientRect().bottom - 12;
  });
  if (process.argv.includes('--no-shots')) return;
  await page.screenshot({ path: path.join(OUT, name + '.png') });
  report.截圖.push(name + '.png');
}
async function ids(page) { return page.locator('.lab-sc-picks input').evaluateAll(inputs => inputs.map(i => i.value)); }
async function checked(page) { return page.locator('.lab-sc-picks input:checked').evaluateAll(inputs => inputs.map(i => i.value)); }
async function layout(page, label) {
  const r = await page.evaluate(() => {
    const tools = [...document.querySelectorAll('.lab-tools button')].map(b => ({ width: b.getBoundingClientRect().width, height: b.getBoundingClientRect().height, top: b.getBoundingClientRect().top }));
    const targets = [...document.querySelectorAll('.lab-sc-chip, .lab-sc-opt, .lab-sc-search:not([hidden])')].map(e => e.getBoundingClientRect().height);
    const search = document.querySelector('.lab-sc-search');
    return { sw: document.documentElement.scrollWidth, vw: innerWidth, tools, targets,
      font: search ? parseFloat(getComputedStyle(search).fontSize) : null,
      cardOverflow: [...document.querySelectorAll('.lab-sc-card, .lab-sc-side, .lab-sc-picks')].some(e => e.scrollWidth > e.clientWidth + 1) };
  });
  assert.ok(r.sw <= r.vw + 1, label + '有左右捲動');
  assert.ok(!r.cardOverflow, label + '的成績卡溢出');
  assert.ok(r.tools.every(b => b.width >= 44 && b.height >= 44), label + '工具列觸控目標不足');
  assert.ok(r.tools.every(b => Math.abs(b.top - r.tools[0].top) < 1), label + '三顆按鈕未同列');
  assert.ok(r.targets.every(h => h >= 44), label + '選項觸控高度不足');
  if (r.font != null) assert.ok(r.font >= 16, label + '搜尋字級不足 16 px');
  pass(label + '版面與觸控', r);
}
async function checkEnglish(page) {
  const texts = await page.locator('.lab-tools, .lab-sc').evaluateAll(roots => roots.flatMap(root => {
    const values = [root.textContent];
    root.querySelectorAll('[title], [placeholder], [aria-label], img[alt]').forEach(e => ['title', 'placeholder', 'aria-label', 'alt'].forEach(a => values.push(e.getAttribute(a) || '')));
    return values.filter(s => /[一-鿿]/.test(s));
  }));
  assert.deepEqual(texts, [], '英文介面仍有中文');
}
async function visualFlow(browser, base, opts) {
  const ctx = await context(browser, base, opts), page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const tag = opts.w + '-' + opts.theme;
  try {
    await loaded(page, base, 'equipotential');
    await page.locator('[data-tool="results"]').waitFor();
    assert.deepEqual(await page.locator('.lab-tools button span').allTextContents(), ['投影', '分享本實驗', '分享我的成績']);
    await layout(page, tag + '工具列');
    await page.locator('.lab-tools').scrollIntoViewIfNeeded();
    await shot(page, tag + '-01-工具列');
    await page.locator('[data-tool="share"]').click();
    await page.locator('.lab-share').waitFor();
    await page.locator('.lab-share-x').click();
    await page.locator('[data-tool="results"]').click();
    await cardReady(page);
    assert.equal(await page.locator('input[name="sc-scope"]:checked').inputValue(), 'mods');
    assert.deepEqual(await checked(page), ['equipotential']);
    const original = await ids(page);
    assert.equal(original[0], 'equipotential');
    assert.equal(original.length, reference.LAB_MISSION_MODULES.filter(m => reference.LAB_LIVE_MODULES.includes(m.id)).length);
    await shot(page, tag + '-02-成績卡預覽');
    await shot(page, tag + '-03-只勾本實驗並置頂', true);
    await layout(page, tag + '成績卡');
    pass(tag + '本實驗未得星仍可預選、置頂並開啟原成績卡');
    const search = page.locator('.lab-sc-search');
    for (const [q, suffix, expected] of [['電場', '電場', 'electric-field'], ['摩擦', '摩擦', 'incline-friction'], ['wave', 'wave', 'standing-waves']]) {
      await search.fill(q);
      assert.ok((await ids(page)).includes(expected), q + '搜尋未命中');
      await shot(page, tag + '-04-搜尋-' + suffix, true);
    }
    const lower = await ids(page);
    await search.fill('ＷＡＶＥ');
    assert.deepEqual(await ids(page), lower, '大小寫或全半形篩選不一致');
    await search.fill('electric-field');
    await page.locator('.lab-sc-picks input[value="electric-field"]').check();
    await cardReady(page);
    await search.fill('');
    assert.deepEqual(await ids(page), original, '勾選改變了排列');
    const before = await page.locator('.lab-sc-prev img').getAttribute('src');
    await search.fill('zz-no-such-experiment-xyz');
    assert.equal(await page.locator('.lab-sc-picks [role="status"]').textContent(), '找不到符合的實驗');
    assert.equal(await page.locator('.lab-sc-prev img').getAttribute('src'), before, '搜尋改變了卡片內容');
    await shot(page, tag + '-05-找不到結果', true);
    await search.fill('');
    assert.deepEqual(await checked(page), ['equipotential', 'electric-field']);
    await search.fill('空氣阻力');
    assert.ok((await ids(page)).includes('projectile'), '既有目錄說明未納入搜尋');
    pass(tag + '關鍵字、代號、全半形、大小寫、無結果與勾選保留');
    await page.locator('.lab-sc-x').click();

    await loaded(page, base, 'leaderboard');
    await page.locator('.lb-share').click();
    await cardReady(page);
    assert.ok(await page.locator('.lab-sc-search').isHidden());
    await page.locator('input[name="sc-scope"][value="mods"]').check();
    const sorted = await ids(page);
    assert.deepEqual(sorted.slice(0, 3), ['projectile', 'incline-friction', 'electric-field']);
    assert.ok(sorted.indexOf('standing-waves') < sorted.indexOf('doppler'));
    assert.ok(sorted.indexOf('doppler') < sorted.indexOf('lens-mirror'));
    assert.ok(sorted.indexOf('lens-mirror') < sorted.indexOf('capacitor'));
    assert.ok(sorted.indexOf('capacitor') < sorted.indexOf('kepler'));
    const played = new Set(['projectile', 'incline-friction', 'electric-field', 'equipotential', 'standing-waves', 'doppler', 'lens-mirror', 'capacitor', 'kepler']);
    const unplayed = sorted.filter(id => !played.has(id));
    assert.deepEqual(unplayed, reference.LAB_LIVE_MODULES.slice().reverse().filter(id => !played.has(id) && reference.LAB_MISSION_MODULES.some(m => m.id === id)));
    await shot(page, tag + '-06-依最近完成時間排序', true);
    pass(tag + '最近完成取每實驗最大時間、操作次序、未玩過才依上線倒序', sorted.slice(0, 12));
    await page.locator('.lab-sc-x').click();

    for (const [lang, name, q, expected] of [['en', '英文', 'wave', 'standing-waves'], ['zh-Hans', '簡體', '电场', 'electric-field']]) {
      await loaded(page, base, 'equipotential', lang);
      await page.locator('[data-tool="results"]').click();
      await cardReady(page);
      await page.locator('.lab-sc-search').fill(q);
      assert.ok((await ids(page)).includes(expected));
      if (lang === 'en') await checkEnglish(page);
      else {
        assert.equal(await page.locator('.lab-sc-search').getAttribute('placeholder'), '搜索实验：名称或关键字');
        assert.equal(await page.locator('.lab-sc-head strong').textContent(), '分享我的成绩');
        assert.ok((await page.locator('.lab-sc-fs').first().textContent()).includes('选实验'));
      }
      await shot(page, tag + '-07-' + name, true);
      await layout(page, tag + name);
      await page.locator('.lab-sc-x').click();
    }
    assert.deepEqual(errors, []);
    pass(tag + '互動過程無頁面錯誤');
  } finally { await ctx.close(); }
}
async function loginFlow(browser, base, redirect) {
  const ctx = await context(browser, base, { w: 412, h: 780, theme: 'dark', guest: true }), page = await ctx.newPage();
  try {
    await loaded(page, base, 'projectile');
    await page.locator('[data-tool="results"]').click();
    assert.equal(await page.locator('.lab-sc').count(), 0);
    await page.locator('.ms-signin').waitFor({ state: 'visible' });
    if (redirect) {
      await page.evaluate(() => { window.LAB_MISSIONS_BACKEND.signIn = () => { localStorage.setItem('mockuser', 'u1'); location.reload(); return Promise.resolve(); }; });
    } else {
      await shot(page, '412-dark-08-既有登入提示');
      await page.evaluate(() => {
        const backend = window.LAB_MISSIONS_BACKEND, signIn = backend.signIn.bind(backend), getDone = backend.getDone.bind(backend);
        backend.signIn = () => { backend.signIn = signIn; return Promise.reject({ code: 'auth/popup-closed-by-user' }); };
        backend.getDone = uid => new Promise(resolve => setTimeout(() => getDone(uid).then(resolve), 500));
      });
      await page.locator('.ms-signin').click();
      assert.equal(await page.locator('.lab-sc').count(), 0);
    }
    await page.locator('.ms-signin').click();
    await cardReady(page);
    assert.deepEqual(await checked(page), ['projectile']);
    assert.equal(await page.evaluate(() => sessionStorage.getItem('lab-share-results')), null);
    pass(redirect ? '登入轉址重載後接續原實驗成績卡' : '取消登入不開空卡，重試登入後等成績就緒再開卡');
  } finally { await ctx.close(); }
}
async function edgeCases(browser, base) {
  for (const lang of ['zh-Hant', 'en', 'zh-Hans']) {
    const ctx = await context(browser, base, { w: 390, h: 780, theme: 'dark', lang, fs: 1.3 }), page = await ctx.newPage();
    try {
      await loaded(page, base, 'projectile', lang);
      await page.locator('[data-tool="results"]').click();
      await cardReady(page);
      await layout(page, '390 特大字 ' + lang);
      if (lang === 'en') await checkEnglish(page);
    } finally { await ctx.close(); }
  }
  const ctx = await context(browser, base, { w: 390, h: 780, theme: 'light' }), page = await ctx.newPage();
  try {
    await ctx.route('**/js/missions/index.js*', r => r.fulfill({ contentType: 'text/javascript', body: INDEX + '\nwindow.LAB_MISSION_MODULES = window.LAB_MISSION_MODULES.filter(m => m.id !== "equipotential");' }));
    await loaded(page, base, 'equipotential');
    await page.waitForFunction(() => !!window.LAB_MISSION_MODULES);
    assert.equal(await page.locator('[data-tool="results"]').count(), 0);
    pass('不在任務清單的實驗不顯示成績按鈕');
  } finally { await ctx.close(); }
}
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const local = await server();
  let browser;
  try {
    browser = await launch();
    report.繪圖裝置 = browser.labGpu;
    for (const opts of [{ w: 412, h: 780, theme: 'dark' }, { w: 1280, h: 800, theme: 'light' }]) await visualFlow(browser, local.base, opts);
    await loginFlow(browser, local.base, false);
    await loginFlow(browser, local.base, true);
    await edgeCases(browser, local.base);
    report.結果 = '全部通過';
  } catch (e) { report.結果 = '失敗'; report.錯誤 = e.stack; process.exitCode = 1; console.error(e); }
  finally {
    if (browser) await browser.close();
    await new Promise(resolve => local.srv.close(resolve));
    report.結束時間 = new Date().toISOString();
    fs.writeFileSync(path.join(OUT, '驗收結果.json'), JSON.stringify(report, null, 2) + '\n');
  }
})();
