/* 寶物排行本機整合驗收：必須包 browser-lock；只連本機、只用 mock-backend。
 * 以 121 個假帳號檢查分頁、榜外本人、遮名、補寫及設定同步，截圖一律 board- 開頭。
 */
'use strict';
const fs = require('fs'), http = require('http'), path = require('path'), assert = require('assert/strict');
const { launch } = require('./browser.cjs');
const C = require('../js/daily-core.js');
const ROOT = path.resolve(__dirname, '..');
const OUT = 'G:/physics-lab-wt/規劃/流程對照-紀錄/daily-drop';
const SHOTS = path.join(OUT, 'shots'), TIME = Date.parse('2026-11-16T04:00:00Z');
const report = { startedAt: new Date().toISOString(), checks: [], shots: [], blockedRequests: 0 };
const ownBag = { cu: 5, ag: 4, au: 3, dia: 2, key: 1, dm: 4, used: { cu: 5, ag: 4, au: 3, dia: 2, key: 1 } };
function fixture() {
  const board = {};
  for (let i = 0; i < 120; i++) {
    const uid = i === 0 ? 'z-earliest' : 'a-' + String(i).padStart(3, '0'), n = 500 - Math.floor(i / 2);
    board[uid] = C.treasureRecord({ cu: n, ag: n, au: n, dia: n, key: n }, null, i === 0 ? 'MaskedExplorer' : 'Collector' + (i + 1), i !== 0, TIME - 100000 + i);
  }
  return { profiles: { u1: { nickname: 'NightOwl', pub: true } }, completions: {}, admins: {}, missionDefs: {},
    scores: { u1: { name: 'NightOwl', stars: 3, last: 'projectile-3', pub: true, at: TIME - 20000 } },
    bag: { u1: ownBag }, treasureBoard: board };
}
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const file = path.resolve(ROOT, '.' + new URL(req.url, 'http://localhost').pathname);
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
});
async function check(name, fn) {
  const started = performance.now(); await fn();
  report.checks.push({ name, passed: true, seconds: +((performance.now() - started) / 1000).toFixed(3) }); console.log('✓ ' + name);
}
async function open(browser, base, config) {
  const context = await browser.newContext({ viewport: { width: config.width, height: config.height }, colorScheme: config.theme, serviceWorkers: 'block' });
  await context.route('**/*', route => { if (route.request().url().startsWith(base)) return route.continue(); report.blockedRequests++; return route.abort(); });
  if (context.routeWebSocket) await context.routeWebSocket('**/*', socket => socket.close());
  const db = fixture();
  if (config.inconsistent) db.treasureBoard.u1 = C.treasureRecord({ cu: 1 }, null, 'OldName', true, TIME - 5000);
  if (config.empty) db.bag.u1 = {};
  await context.addInitScript(({ db, config, time }) => {
    localStorage.setItem('mdb', JSON.stringify(db)); localStorage.setItem('lab-welcome-v1', 'skip');
    localStorage.setItem('mockoffset', String(time - Date.now()));
    if (!config.guest) localStorage.setItem('mockuser', 'u1');
    localStorage.setItem('lab-settings', JSON.stringify({ theme: config.theme, lang: config.lang || 'zh-Hant', fs: config.fs || 1 }));
  }, { db, config, time: TIME });
  await context.addInitScript({ path: path.join(ROOT, 'tools/mock-backend.js') });
  await context.addInitScript(() => {
    window.__boardReview = { reads: [], writes: [] };
    const api = window.LAB_MISSIONS_BACKEND, get = api.get, update = api.update;
    api.get = function (name) {
      window.__boardReview.reads.push(name);
      if (name === 'achievements/u1' && window.LabAchievements) {
        const db = JSON.parse(localStorage.getItem('mdb')), got = {};
        LabAchievements.list.forEach(item => { got[item.id] = { at: 1 }; });
        LabAchievements.series.forEach(series => { for (let i = 1; i <= 20; i++) got[series.key + '-' + i] = { at: 1 }; });
        db.achievements = { u1: got }; localStorage.setItem('mdb', JSON.stringify(db));
      }
      return get(name);
    };
    api.update = function (map) { window.__boardReview.writes.push(Object.keys(map)); return update(map); };
  });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + (config.accountOnly ? 'about.html' : 'leaderboard.html#treasure-board'), { waitUntil: 'load' });
  if (!config.accountOnly) await page.waitForFunction(() => document.querySelectorAll('#treasureList .tb-row').length === 100 &&
    (localStorage.getItem('mockuser') ? /121/.test(document.querySelector('#treasureMe').textContent) : /登入|Sign in/.test(document.querySelector('#treasureMe').textContent)));
  await page.evaluate(async () => { await document.fonts.ready; });
  return { context, page, errors };
}
async function audit(page, lang) {
  const data = await page.evaluate(() => {
    const cn = [], ids = new Set(), duplicateIds = [];
    document.querySelectorAll('[id]').forEach(el => { if (ids.has(el.id)) duplicateIds.push(el.id); ids.add(el.id); });
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node; (node = walker.nextNode());) {
      if (node.parentElement.closest('script, style, .lab-settings, .lab-set-panel, .lab-gear')) continue;
      if (/[一-鿿]/.test(node.textContent)) cn.push(node.textContent.trim().slice(0, 60));
    }
    return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, duplicateIds, cn,
      touch: Array.from(document.querySelectorAll('.tb-tab, .tb-kind-tabs button')).every(el => el.getBoundingClientRect().height >= 44),
      reads: window.__boardReview.reads, denied: window.__denied || [] };
  });
  assert.ok(data.scrollWidth <= data.width + 1, '不可左右捲動'); assert.ok(data.touch, '觸控目標至少 44 px');
  assert.deepStrictEqual(data.duplicateIds, [], '元件代號不可重複'); assert.deepStrictEqual(data.denied, []);
  assert.ok(data.reads.filter(name => name.startsWith('bag/')).every(name => name === 'bag/u1'), '不可讀別人的寶物袋');
  if (lang === 'en') assert.deepStrictEqual(data.cn, [], '英文不可殘留中文');
}
async function shot(page, name) {
  await page.evaluate(() => scrollTo({ top: document.querySelector('#treasureBoardPanel').getBoundingClientRect().top + scrollY - 12, behavior: 'instant' }));
  const file = path.join(SHOTS, 'board-' + name + '.png'); await page.screenshot({ path: file }); report.shots.push(file);
}
async function run() {
  fs.mkdirSync(SHOTS, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port + '/';
  const browser = await launch({ args: ['--mute-audio', '--disable-background-networking', '--no-pings'] }); report.gpu = browser.labGpu;
  try {
    for (const config of [{ width: 412, height: 780, theme: 'dark', tag: '412-dark' }, { width: 1280, height: 900, theme: 'light', tag: '1280-light' }]) {
      const { context, page, errors } = await open(browser, base, config);
      try {
        await check(config.tag + ' 舊帳號自動補寫，一致後不重寫', async () => {
          const migration = await page.evaluate(async () => {
            await LabMission.syncTreasure();
            const count = () => window.__boardReview.writes.filter(keys => keys.includes('treasureBoard/u1')).length;
            const before = count(); await LabMission.syncTreasure();
            return { before, after: count(), row: JSON.parse(localStorage.getItem('mdb')).treasureBoard.u1 };
          });
          assert.strictEqual(migration.before, 1); assert.strictEqual(migration.after, 1); assert.strictEqual(migration.row.v, 12345);
        });
        for (const metric of C.TREASURE_METRICS) await check(config.tag + ' ' + metric + ' 分頁、同分排序、榜外本人及遮名', async () => {
          await page.locator('[data-metric="' + metric + '"]').click();
          await page.waitForFunction(() => /121/.test(document.querySelector('#treasureMe').textContent) && document.querySelectorAll('#treasureList .tb-row').length === 100);
          const rows = await page.locator('#treasureList .tb-row').evaluateAll(els => els.slice(0, 3).map(el => ({ uid: el.dataset.uid, name: el.querySelector('.lb-name').textContent, rank: el.querySelector('.lb-rank').textContent })));
          assert.strictEqual(rows[0].uid, 'z-earliest'); assert.strictEqual(rows[0].name, C.treasureName('MaskedExplorer', false));
          assert.deepStrictEqual(rows.map(row => row.rank), ['1', '1', '3']);
          const own = C.treasureTotals(ownBag)[metric];
          assert.ok((await page.locator('#treasureMe').textContent()).includes(metric === 'v' ? (own / 1000).toLocaleString(undefined, { maximumFractionDigits: 3 }) + ' 顆鑽石' : own.toLocaleString()));
          if (metric === 'v') assert.match(await page.locator('#treasureList .tb-row .tb-score').first().textContent(), /^[\d.,]+( [kMGTPE])? 鑽石$/, '總價值每列以鑽石為單位');
          assert.strictEqual(await page.locator('#treasureList [data-uid="u1"]').count(), 0);
          await audit(page); await shot(page, metric + '-' + config.tag);
        });
        await check(config.tag + ' 改暱稱及公開設定，同筆更新兩榜且不重設名次時間', async () => {
          const before = await page.evaluate(() => JSON.parse(localStorage.getItem('mdb')).treasureBoard.u1.ta);
          page.once('dialog', dialog => dialog.accept('SecretExplorer'));
          await page.locator('.lab-account').click();
          await page.locator('.lab-account-menu button').filter({ hasText: '設定暱稱' }).click();
          await page.waitForFunction(() => LabMission._state.nickname === 'SecretExplorer');
          await page.locator('.lb-pub input').nth(1).check();
          await page.waitForFunction(() => LabMission._state.pub === false);
          const result = { before, db: await page.evaluate(() => JSON.parse(localStorage.getItem('mdb'))) };
          assert.strictEqual(result.db.profiles.u1.nickname, 'SecretExplorer');
          assert.strictEqual(result.db.scores.u1.name, C.treasureName('SecretExplorer', false));
          assert.strictEqual(result.db.treasureBoard.u1.pub, false); assert.deepStrictEqual(result.db.treasureBoard.u1.ta, result.before);
          await page.waitForFunction(() => document.querySelector('#treasureMe').textContent.includes('S○'));
          await page.locator('[data-metric="v"]').click();
          await page.waitForFunction(() => document.querySelector('#treasureMe').textContent.includes('12.345 顆鑽石'));
          await audit(page); await shot(page, 'private-self-' + config.tag);
        });
        assert.deepStrictEqual(errors, []);
      } finally { await context.close(); }
    }
    for (const lang of ['en', 'zh-Hans']) await check('390 px ' + lang + ' 特大字與六分頁', async () => {
      const { context, page, errors } = await open(browser, base, { width: 390, height: 844, theme: 'dark', fs: 1.3, lang });
      try { for (const metric of C.TREASURE_METRICS) { await page.locator('[data-metric="' + metric + '"]').click(); await page.waitForSelector('#treasureList .tb-row'); await audit(page, lang); } assert.deepStrictEqual(errors, []); }
      finally { await context.close(); }
    });
    await check('公開訪客能看六榜，且不讀私人 bag', async () => {
      const { context, page, errors } = await open(browser, base, { width: 390, height: 844, theme: 'light', guest: true });
      try { await audit(page); assert.strictEqual(await page.evaluate(() => window.__boardReview.reads.filter(name => name.startsWith('bag/')).length), 0); assert.deepStrictEqual(errors, []); }
      finally { await context.close(); }
    });
    await check('不一致舊紀錄登入後自動修正', async () => {
      const { context, page, errors } = await open(browser, base, { width: 390, height: 844, theme: 'light', inconsistent: true });
      try { assert.strictEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('mdb')).treasureBoard.u1.v), 12345); await audit(page); assert.deepStrictEqual(errors, []); }
      finally { await context.close(); }
    });
    await check('沒有寶物時仍顯示本人名次', async () => {
      const { context, page, errors } = await open(browser, base, { width: 390, height: 844, theme: 'light', empty: true });
      try { assert.ok((await page.locator('#treasureMe').textContent()).includes('總價值 0 顆鑽石')); await audit(page); assert.deepStrictEqual(errors, []); }
      finally { await context.close(); }
    });
    await check('其他分頁改名與設為不公開後，舊快取不會蓋回去', async () => {
      const { context, page, errors } = await open(browser, base, { width: 390, height: 844, theme: 'light' });
      try {
        const result = await page.evaluate(async () => {
          const api = await LabMission._ready();
          await LabDailyCore.updateTreasureProfile(api, 'u1', { nickname: 'LatestExplorer', pub: false });
          const oldName = LabMission._state.nickname;
          await LabMission.syncTreasure();
          return { oldName, row: JSON.parse(localStorage.getItem('mdb')).treasureBoard.u1 };
        });
        assert.strictEqual(result.oldName, 'NightOwl'); assert.strictEqual(result.row.pub, false);
        assert.strictEqual(result.row.name, C.treasureName('LatestExplorer', false)); assert.deepStrictEqual(errors, []);
      } finally { await context.close(); }
    });
    await check('未載入任務系統的一般頁，帳號選單改名也同步兩榜', async () => {
      const { context, page, errors } = await open(browser, base, { width: 390, height: 844, theme: 'light', accountOnly: true });
      try {
        await page.waitForSelector('.lab-account-name', { state: 'attached' });
        assert.strictEqual(await page.evaluate(() => typeof window.LabMission), 'undefined');
        page.once('dialog', dialog => dialog.accept('PageOnlyExplorer'));
        await page.locator('.lab-account').click();
        await page.locator('.lab-account-menu button').filter({ hasText: '設定暱稱' }).click();
        await page.waitForFunction(() => JSON.parse(localStorage.getItem('mdb')).profiles.u1.nickname === 'PageOnlyExplorer');
        const db = await page.evaluate(() => JSON.parse(localStorage.getItem('mdb')));
        assert.strictEqual(db.scores.u1.name, 'PageOnlyExplorer'); assert.strictEqual(db.treasureBoard.u1.name, 'PageOnlyExplorer');
        assert.strictEqual(db.treasureBoard.u1.v, 12345); assert.deepStrictEqual(errors, []);
      } finally { await context.close(); }
    });
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
  report.finishedAt = new Date().toISOString(); report.passed = true;
  fs.writeFileSync(path.join(OUT, 'board-review.json'), JSON.stringify(report, null, 2));
  console.log(report.checks.length + ' 項整合驗收通過，截圖 ' + report.shots.length + ' 張。');
}
run().catch(error => { report.passed = false; report.error = error.stack; report.finishedAt = new Date().toISOString(); fs.writeFileSync(path.join(OUT, 'board-review.json'), JSON.stringify(report, null, 2)); console.error(error); server.close(); process.exitCode = 1; });
