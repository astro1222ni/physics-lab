/* 引導步驟觀察器、成績卡與分張的本機驗收；只使用假後端並阻擋所有外連。 */
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { launch } = require('./browser.cjs');
const { server } = require('./home-browser.cjs');
const ROOT = path.resolve(__dirname, '..');
const arg = process.argv.find(a => a.startsWith('--out='));
const OUT = path.resolve(arg ? arg.slice(6) : path.join(ROOT, '.shots/procedure'));
const MOCK = fs.readFileSync(path.join(ROOT, 'tools/mock-backend.js'), 'utf8');
const guided = fs.readdirSync(ROOT).filter(f => f.endsWith('.html') && /<ol\b(?=[^>]*\bclass="steps")(?=[^>]*\bid="steps")[^>]*>/.test(fs.readFileSync(path.join(ROOT, f), 'utf8'))).map(f => f.slice(0, -5));
const report = { 開始時間: new Date().toISOString(), 引導實驗: guided, 檢查: [], 截圖: [] };
function pass(name, detail) { report.檢查.push({ 項目: name, 結果: '通過', 詳情: detail }); console.log('通過：' + name); }
function init(o) {
  if (!sessionStorage.getItem('procedure-fixture')) {
    sessionStorage.setItem('procedure-fixture', '1');
    localStorage.setItem('lab-settings', JSON.stringify({ lang: 'zh-Hant', theme: o.theme, fs: 1 }));
    localStorage.setItem('lab-welcome-v1', 'skip'); localStorage.setItem('mockuser', 'u1');
    localStorage.setItem('mdb', JSON.stringify({ profiles: { u1: { nickname: 'Explorer 07', pub: true } }, completions: {}, scores: {}, admins: {}, missionDefs: {} }));
    localStorage.setItem('lab-procedure:u1:current-balance', JSON.stringify({ 6: { done: 4, completedAt: 0 } }));
  }
  window.LAB_STATS_DB = location.origin + '/__stats';
  window.__copied = ''; window.__cards = [];
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: text => { window.__copied = text; return Promise.resolve(); } } });
  const fill = CanvasRenderingContext2D.prototype.fillText, rect = CanvasRenderingContext2D.prototype.fillRect;
  function card(c) { return !c.canvas.isConnected && c.canvas.width === 1080 && c.canvas.height === 1350; }
  CanvasRenderingContext2D.prototype.fillRect = function (x, y, w, h) {
    if (card(this) && x === 0 && y === 0 && w === 1080 && h === 1350) window.__cards.push([]);
    return rect.apply(this, arguments);
  };
  CanvasRenderingContext2D.prototype.fillText = function (text, x, y) {
    if (card(this) && window.__cards.length) window.__cards[window.__cards.length - 1].push({ text: String(text), x, y, align: this.textAlign, width: this.measureText(text).width });
    return fill.apply(this, arguments);
  };
}
async function context(browser, base, opts) {
  const ctx = await browser.newContext({ viewport: { width: opts.w, height: opts.h }, colorScheme: opts.theme, hasTouch: opts.w < 720, reducedMotion: 'reduce', serviceWorkers: 'block' });
  await ctx.route(u => !u.href.startsWith(base), r => r.abort());
  await ctx.addInitScript({ content: '(' + init.toString() + ')(' + JSON.stringify(opts) + ');\n' + MOCK });
  return ctx;
}
async function load(page, base, slug, lang) {
  await page.goto(base + slug + '.html' + (lang ? '?lang=' + lang : ''), { waitUntil: 'load' });
  await page.waitForFunction(() => window.LabMission?._state.ready);
  if (lang === 'zh-Hans') await page.waitForFunction(() => !!window.LabSettings.toHans);
  await page.evaluate(() => document.fonts.ready);
}
async function ready(page) {
  await page.waitForFunction(() => document.querySelector('.lab-sc-prev img')?.naturalWidth === 1080 && !document.querySelector('.lab-sc-acts button:disabled'));
}
async function open(page) { await page.locator('[data-tool="results"]').click(); await ready(page); }
async function copy(page) {
  await page.locator('.lab-sc-acts button').filter({ hasText: /複製分享文字|复制分享文字|Copy share text/ }).click();
  return page.evaluate(() => window.__copied);
}
async function shot(page, name, intrinsic = false) {
  const target = 'steps-' + name + '.png';
  await page.evaluate(() => { const sc = document.querySelector('.lab-sc-card'); if (sc) sc.scrollTop = 0; });
  await page.screenshot({ path: path.join(OUT, target) }); report.截圖.push(target);
  if (intrinsic) {
    const data = await page.locator('.lab-sc-prev img').evaluate(async img => Array.from(new Uint8Array(await (await fetch(img.src)).arrayBuffer())));
    const name = target.replace('.png', '-原尺寸.png'); fs.writeFileSync(path.join(OUT, name), Buffer.from(data)); report.截圖.push(name);
  }
}
async function lastDraw(page) { return page.evaluate(() => window.__cards[window.__cards.length - 1] || []); }
async function checkDraw(page, label) {
  const rows = await lastDraw(page);
  assert.ok(rows.length > 10, label + '沒有實際繪圖');
  for (const r of rows) {
    const left = r.align === 'right' ? r.x - r.width : r.align === 'center' ? r.x - r.width / 2 : r.x;
    const right = left + r.width;
    assert.ok(left >= -1 && right <= 1081 && r.y > 0 && r.y < 1350, label + '文字溢出：' + r.text);
    if (/實驗步驟|Procedure /.test(r.text)) assert.ok(r.y < 1140, label + '步驟列碰到頁尾');
  }
  const layout = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: innerWidth,
    overflow: [...document.querySelectorAll('.lab-sc-card, .lab-sc-side')].some(e => e.scrollWidth > e.clientWidth + 1) }));
  assert.ok(layout.sw <= layout.vw + 1 && !layout.overflow, label + '預覽水平溢出');
}
async function flow(browser, base, opts) {
  const ctx = await context(browser, base, opts), page = await ctx.newPage(), errors = [], tag = opts.w + '-' + opts.theme;
  page.on('pageerror', e => errors.push(e.message));
  try {
    await load(page, base, 'equipotential');
    await page.waitForFunction(() => document.querySelectorAll('#steps > li').length === 7 && window.LabMission.steps()?.total === 7);
    await page.evaluate(() => document.querySelectorAll('#steps > li').forEach((li, i) => li.classList.toggle('done', i < 5)));
    await page.waitForFunction(() => window.LabMission.steps()?.done === 5);
    await page.evaluate(() => document.querySelectorAll('#steps > li').forEach(li => li.classList.remove('done')));
    await page.waitForFunction(() => window.LabMission.steps()?.done === 5);
    await open(page);
    assert.ok((await page.locator('.lab-sc-prev img').getAttribute('alt')).includes('實驗步驟 5/7'));
    assert.ok((await copy(page)).includes('實驗步驟 5/7'));
    await checkDraw(page, tag + '部分完成');
    await shot(page, tag + '-01-部分完成5of7', opts.w === 412);
    pass(tag + '觀察打勾與取消、最好成績 5/7 及文字版本');
    await page.locator('.lab-sc-x').click();
    await page.evaluate(() => document.querySelectorAll('#steps > li').forEach(li => li.classList.add('done')));
    await page.waitForFunction(() => window.LabMission.steps()?.complete);
    const completedAt = await page.evaluate(() => window.LabMission.steps().completedAt);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.LabMission?._state.ready && window.LabMission.steps()?.complete);
    assert.equal(await page.evaluate(() => window.LabMission.steps().completedAt), completedAt);
    await open(page);
    assert.ok((await copy(page)).includes('✓ 實驗步驟全部完成 7/7'));
    await shot(page, tag + '-02-全部完成7of7', opts.w === 412);
    await checkDraw(page, tag + '全部完成');
    pass(tag + '全部完成後重載仍保留 7/7 與原完成時間');

    await page.locator('input[name="sc-scope"][value="all"]').check(); await ready(page);
    assert.ok((await copy(page)).includes('完成實驗步驟的實驗：1 個'));
    await shot(page, tag + '-03-全部科目');
    await checkDraw(page, tag + '全部科目');
    await page.locator('input[name="sc-scope"][value="subj"]').check(); await ready(page);
    await page.locator('.lab-sc-picks input[value="phy"]').uncheck();
    await page.locator('.lab-sc-picks input[value="math"]').check(); await ready(page);
    assert.ok((await copy(page)).includes('完成實驗步驟的實驗：0 個'));
    await page.locator('.lab-sc-picks input[value="math"]').uncheck();
    await page.locator('.lab-sc-picks input[value="phy"]').check(); await ready(page);
    assert.ok((await copy(page)).includes('完成實驗步驟的實驗：1 個'));
    await shot(page, tag + '-04-選物理科目');
    pass(tag + '全部科目與選科目依範圍計數、部分完成不算全部完成');

    await page.locator('input[name="sc-scope"][value="mods"]').check(); await ready(page);
    for (const id of ['current-balance', 'projectile']) {
      await page.locator('.lab-sc-search').fill(id);
      await page.locator('.lab-sc-picks input[value="' + id + '"]').check(); await ready(page);
    }
    const text = await copy(page);
    assert.ok(text.includes('全部完成 7/7') && text.includes('實驗步驟 4/6'));
    assert.ok(!text.includes('拋體運動: 實驗步驟'));
    await shot(page, tag + '-05-多實驗含無引導步驟');
    await checkDraw(page, tag + '混合清單');
    pass(tag + '單一、多實驗各自顯示步驟，無引導實驗沒有步驟列');
    for (const id of guided.filter(id => id !== 'equipotential' && id !== 'current-balance')) {
      await page.locator('.lab-sc-search').fill(id);
      await page.locator('.lab-sc-picks input[value="' + id + '"]').check();
    }
    await ready(page);
    const longText = await copy(page);
    assert.equal((longText.match(/實驗步驟/g) || []).length, guided.length);
    let pageCount = 0, statuses = 0;
    do {
      await ready(page); await checkDraw(page, tag + '長清單第 ' + (pageCount + 1) + ' 張');
      statuses += (await lastDraw(page)).filter(r => /實驗步驟/.test(r.text)).length;
      await shot(page, tag + '-06-長清單-' + (++pageCount));
      if (await page.locator('.lab-sc-pages button').last().isDisabled()) {
        assert.ok(await page.locator('.lab-sc-pages button').last().evaluate(b => parseFloat(getComputedStyle(b).opacity) < 1));
        break;
      }
      await page.locator('.lab-sc-pages button').last().click();
    } while (pageCount < 20);
    assert.ok(pageCount > 1); assert.equal(statuses, guided.length);
    pass(tag + '長清單分張不遺漏十個實驗的步驟列、不溢出', { 張數: pageCount, 步驟列數: statuses });
    await page.locator('.lab-sc-x').click();

    for (const [lang, suffix, expected] of [['en', '英文', 'Procedure complete 7/7'], ['zh-Hans', '簡體', '实验步骤全部完成 7/7']]) {
      await load(page, base, 'equipotential', lang); await open(page);
      const shared = await copy(page); assert.ok(shared.includes(expected));
      if (lang === 'en') assert.ok(!/[一-鿿]/.test(shared));
      await shot(page, tag + '-07-' + suffix); await checkDraw(page, tag + suffix);
      await page.locator('.lab-sc-x').click();
    }
    pass(tag + '繁體、簡體與英文卡面及複製文字');
    if (opts.w === 412) {
      const totals = {};
      for (const id of guided) {
        await load(page, base, id);
        await page.waitForFunction(() => document.querySelector('#steps')?.children.length > 0 && window.LabMission.steps());
        totals[id] = await page.evaluate(() => ({ total: document.querySelector('#steps').children.length, saved: window.LabMission.steps().versions.map(v => v.total) }));
        assert.ok(totals[id].saved.includes(totals[id].total));
      }
      pass('實際十頁均由共用觀察器辨識步驟總數', totals);
      await load(page, base, 'projectile');
      assert.equal(await page.evaluate(() => window.LabMission.steps()), null);
      pass('沒有 #steps 的頁面不建立成績或拋錯');
      await load(page, base, 'equipotential'); await page.evaluate(() => window.LabMission.loadAll());
      await page.evaluate(() => {
        window.__restoreStorage = { get: Storage.prototype.getItem, set: Storage.prototype.setItem };
        Storage.prototype.getItem = function () { throw new Error('模擬儲存被封鎖'); };
        Storage.prototype.setItem = function () { throw new Error('模擬儲存被封鎖'); };
        window.LabMission.reportSteps(3, 8);
      });
      try {
        assert.ok(await page.evaluate(() => window.LabMission.steps().versions.some(v => v.total === 8 && v.done === 3)));
        await open(page); assert.ok((await copy(page)).includes('全部完成 7/7'));
      } finally { await page.evaluate(() => { Storage.prototype.getItem = window.__restoreStorage.get; Storage.prototype.setItem = window.__restoreStorage.set; }); }
      pass('localStorage 完全不可用時仍能回報與開啟成績卡');
    }
    assert.deepEqual(errors, []); pass(tag + '全部流程無頁面錯誤');
  } finally { await ctx.close(); }
}
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const local = await server(); let browser;
  try {
    browser = await launch(); report.繪圖裝置 = browser.labGpu;
    for (const opts of [{ w: 412, h: 780, theme: 'dark' }, { w: 1280, h: 800, theme: 'light' }]) await flow(browser, local.base, opts);
    report.結果 = '全部通過';
  } catch (e) { report.結果 = '失敗'; report.錯誤 = e.stack; console.error(e); process.exitCode = 1; }
  finally {
    if (browser) await browser.close(); await new Promise(resolve => local.srv.close(resolve));
    report.結束時間 = new Date().toISOString(); fs.writeFileSync(path.join(OUT, 'steps-驗收結果.json'), JSON.stringify(report, null, 2) + '\n');
  }
})();
