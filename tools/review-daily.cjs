/* 每日掉寶整合驗收：僅啟動本機網站，所有外部連線均阻擋，使用 mock-backend。
 * 執行時必須包共用 browser-lock；截圖及收據寫入指定的流程紀錄資料夾。
 */
'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { launch } = require('./browser.cjs');
const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.LAB_DAILY_EVIDENCE || 'G:/physics-lab-wt/規劃/流程對照-紀錄/daily-drop';
const SHOTS = path.join(OUT, 'shots');
const C = require('../js/daily-core.js');
const NO_SHOTS = process.argv.includes('--no-shots');
const report = { startedAt: new Date().toISOString(), checks: [], lootCases: [], shots: [], blockedRequests: 0 };
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.resolve(ROOT, '.' + (name === '/' ? '/index.html' : name));
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

async function check(name, fn) {
  const start = performance.now();
  await fn();
  report.checks.push({ name, passed: true, seconds: +( (performance.now() - start) / 1000).toFixed(3) });
  console.log('✓ ' + name);
}
async function shot(page, name, selector) {
  if (NO_SHOTS) return;
  const file = path.join(SHOTS, name + '.png');
  if (selector) await page.locator(selector).screenshot({ path: file, animations: 'disabled' });
  else await page.screenshot({ path: file });
  report.shots.push(file);
}

async function open(browser, base, config, slug = 'daily') {
  const ctx = await browser.newContext({ viewport: { width: config.width, height: config.height },
    colorScheme: config.theme, reducedMotion: config.reduced ? 'reduce' : 'no-preference', serviceWorkers: 'block' });
  await ctx.route('**/*', route => {
    if (route.request().url().startsWith(base)) return route.continue();
    report.blockedRequests++; return route.abort();
  });
  if (ctx.routeWebSocket) await ctx.routeWebSocket('**/*', socket => socket.close());
  await ctx.addInitScript(({ config }) => {
    const t = Date.parse('2026-11-16T04:00:00Z');
    localStorage.setItem('lab-settings', JSON.stringify({ lang: config.lang || 'zh-Hant', theme: config.theme, fs: config.fs || 1, sound: !!config.sound }));
    localStorage.setItem('lab-welcome-v1', 'skip');
    localStorage.setItem('mockoffset', String(t - Date.now()));
    if (!config.guest) localStorage.setItem('mockuser', 'u1');
    const completions = config.stars ? { 'projectile-9': { stars: 9, at: t - 100000, module: 'projectile' } } : {};
    localStorage.setItem('mdb', JSON.stringify({ profiles: { u1: { nickname: 'Tester', pub: true } }, completions: { u1: completions },
      scores: config.stars ? { u1: { nickname: 'Tester', stars: 9, at: t - 100000, s: { phy: 9 }, sa: { phy: t - 100000 } } } : {},
      admins: {}, missionDefs: {}, daily: { u1: { d: Math.floor((t + 8 * 3600000) / 86400000), picks: Array.from({ length: 10 }, (_, i) => 'projectile-' + (i + 1)), n: 0, at: t - 20000 } },
      bag: { u1: { cu: 10, ag: 6, au: 2, dia: 1, key: 1, dm: 4 } } }));
  }, { config });
  await ctx.addInitScript({ path: path.join(ROOT, 'tools/mock-backend.js') });
  await ctx.addInitScript(() => {
    const api = window.LAB_MISSIONS_BACKEND, get = api.get;
    api.get = function (name) {
      // 驗收帳號預先持有低階成就，避免無關提示遮住機率表；每日與寶物仍走原本模擬規則。
      const achievements = window.LabAchievements;
      if (name === 'achievements/u1' && achievements) {
        const db = JSON.parse(localStorage.getItem('mdb')), got = {};
        achievements.list.forEach(item => { got[item.id] = { at: 1 }; });
        achievements.series.forEach(series => { for (let level = 1; level <= 20; level++) got[series.key + '-' + level] = { at: 1 }; });
        db.achievements = { u1: got }; localStorage.setItem('mdb', JSON.stringify(db));
      }
      return get(name);
    };
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + slug + '.html' + (config.dailyMode ? '?daily=projectile-1' : ''), { waitUntil: 'load' });
  if (slug === 'daily' && !config.guest) await page.waitForFunction(() => window.LabDaily && LabDaily._D.loaded && LabMission._state.ready);
  if (config.dailyMode) await page.waitForFunction(() => window.LabDaily && LabDaily._D.loaded && document.querySelector('.dl-banner'));
  else await page.waitForSelector('.dl-prob-table');
  await page.evaluate(async () => { await document.fonts.ready; });
  return { ctx, page, errors };
}

async function pageAudit(page, lang) {
  const result = await page.evaluate(() => {
    const cn = [], walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n; (n = walker.nextNode());) {
      if (n.parentElement.closest('script, style, .lab-set-panel, .lab-settings, .lab-gear')) continue;
      if (/[一-鿿]/.test(n.textContent) && n.textContent.trim()) cn.push(n.textContent.trim().slice(0, 80));
    }
    const overlay = document.querySelector('.dl-loot-box');
    const rect = overlay && overlay.getBoundingClientRect();
    return { scrollWidth: document.documentElement.scrollWidth, width: innerWidth, cjk: cn,
      overlayFits: !rect || (rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight),
      captionsFit: Array.from(document.querySelectorAll('.dl-prob-table caption')).every(el => el.getBoundingClientRect().width >= el.parentElement.getBoundingClientRect().width * .8),
      badMath: document.querySelectorAll('.katex-error').length };
  });
  assert.ok(result.scrollWidth <= result.width + 1, '頁面不可左右捲動：' + JSON.stringify(result));
  assert.ok(result.overlayFits, '掉寶卡片必須在可見範圍內');
  assert.ok(result.captionsFit, '機率表表題不可被擠成直排');
  assert.strictEqual(result.badMath, 0);
  if (lang === 'en') assert.deepStrictEqual(result.cjk, [], '英文不可殘留中文');
  return result;
}

async function reward(page, kind) {
  const expected = kind === 'five' ? [{ item: 'cu', qty: 5 }, { item: 'ag', qty: 3 }, { item: 'au', qty: 2 }, { item: 'dia', qty: 1 }, { item: 'key', qty: 1 }]
    : [{ item: 'cu', qty: 5 }, { item: 'ag', qty: 3 }, { item: 'au', qty: 2 }];
  await page.evaluate(kind => {
    window.__dailyReview = { maps: [], tones: [], events: [], order: [] };
    const review = window.__dailyReview, api = LabDaily._D.api, originalUpdate = api.update;
    api.update = function (map) {
      const keys = Object.keys(map);
      // 成就系統收到掉寶事件後也會寫入；這裡只計每日紀錄與寶物的原子更新。
      if (keys.some(key => /^(daily|bag)\//.test(key))) review.maps.push(keys);
      return originalUpdate(map);
    };
    const originalTone = LabSound.tone;
    LabSound.tone = function (o) { review.tones.push(o); return originalTone(o); };
    window.addEventListener('lab:loot', e => review.events.push(e.detail));
    new MutationObserver(() => document.querySelectorAll('.dl-loot-tile.revealed').forEach(tile => {
      const id = tile.getAttribute('data-item'); if (!review.order.includes(id)) review.order.push(id);
    })).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    const values = kind === 'five' ? [0, .999, 0, .999, 0, .999, 0, .999, 0, .999] : [0, .999, 0, .999, 0, .999, .999, .999];
    const originalRoll = LabDailyCore.roll;
    LabDailyCore.roll = level => originalRoll(level, () => values.shift() ?? .999);
    LabDaily.completed(LabMission.all().projectile[0], false);
  }, kind);
  await page.waitForFunction(() => window.__dailyReview.events.length === 1);
  if (kind === 'five') await page.waitForSelector('.dl-loot-all');
  else await page.waitForFunction(() => document.querySelector('.dl-loot-collect:not([hidden])'));
  const state = await page.evaluate(() => ({ review: window.__dailyReview, db: JSON.parse(localStorage.getItem('mdb')), denied: window.__denied || [] }));
  assert.deepStrictEqual(state.review.events[0].drops, expected);
  assert.deepStrictEqual(state.review.order, expected.map(d => d.item));
  assert.strictEqual(state.review.maps.length, 1, '每次完成只 update 一次');
  const keys = ['daily/u1/n', 'daily/u1/at', 'daily/u1/done/projectile-1', 'bag/u1/dm', 'treasureBoard/u1', ...expected.map(d => 'bag/u1/' + d.item)];
  assert.deepStrictEqual(state.review.maps[0].slice().sort(), keys.sort());
  assert.strictEqual(state.db.daily.u1.n, 1);
  assert.strictEqual(state.db.daily.u1.done['projectile-1'], true);
  const initial = { cu: 10, ag: 6, au: 2, dia: 1, key: 1 };
  for (const [item, value] of Object.entries(initial)) assert.strictEqual(state.db.bag.u1[item], value + (expected.find(d => d.item === item)?.qty || 0));
  assert.strictEqual(state.db.bag.u1.dm, 5);
  assert.deepStrictEqual(state.denied, []);
  return state;
}

async function run() {
  fs.mkdirSync(SHOTS, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port + '/';
  const browser = await launch({ args: ['--mute-audio', '--disable-background-networking', '--no-pings'] });
  report.gpu = browser.labGpu;
  try {
    const configs = [{ width: 412, height: 780, theme: 'dark', tag: '412-dark' }, { width: 1280, height: 900, theme: 'light', tag: '1280-light' }];
    for (const config of configs) {
      await check(config.tag + ' 每日頁、任務卡、機率與期望值', async () => {
        const { ctx, page, errors } = await open(browser, base, config);
        try {
          await pageAudit(page);
          assert.strictEqual(await page.locator('.dl-card').count(), 10);
          assert.strictEqual(await page.locator('.dl-chip.gold').count(), 10);
          await shot(page, 'daily-overview-' + config.tag);
          await shot(page, 'daily-odds-' + config.tag, '.dl-odds');
          assert.deepStrictEqual(errors, []);
        } finally { await ctx.close(); }
      });
      await check(config.tag + ' 排行榜規則與機率表', async () => {
        const { ctx, page, errors } = await open(browser, base, config, 'leaderboard');
        try {
          await pageAudit(page);
          assert.strictEqual(await page.locator('#dailyOdds .dl-prob-table tbody tr').count(), 5); assert.strictEqual(await page.locator('#dailyOdds .dl-lv-table tbody tr').count(), 10);
          await shot(page, 'leaderboard-rules-' + config.tag, '#dailyOdds');
          assert.deepStrictEqual(errors, []);
        } finally { await ctx.close(); }
      });
      for (const kind of ['multi', 'five']) await check(config.tag + ' ' + (kind === 'five' ? '五寶齊發與音效' : '多種掉落與一次寫入'), async () => {
        const { ctx, page, errors } = await open(browser, base, { ...config, sound: true, stars: kind === 'five' });
        try {
          await page.locator('h1').click();
          const state = await reward(page, kind);
          await pageAudit(page);
          assert.ok(state.review.tones.length > 0);
          assert.ok(state.review.tones.every(tone => tone.freq >= 250));
          if (kind === 'five') assert.ok(state.review.tones.some(tone => tone.dur === .65), '五寶要有額外和弦');
          report.lootCases.push({ viewport: config.tag, kind, drops: state.review.events[0].drops, order: state.review.order,
            updateFields: state.review.maps[0], bag: state.db.bag.u1, frequencies: state.review.tones.map(tone => tone.freq) });
          await shot(page, 'daily-' + kind + '-' + config.tag);
          await page.evaluate(() => LabDaily.completed(LabMission.all().projectile[0], false));
          await page.waitForTimeout(120);
          assert.strictEqual(await page.evaluate(() => window.__dailyReview.maps.length), 1, '重複完成不可再次領取');
          await page.locator('.dl-loot-collect').click();
          await page.waitForSelector('.dl-loot', { state: 'detached' });
          assert.deepStrictEqual(errors, []);
        } finally { await ctx.close(); }
      });
    }
    for (const lang of ['en', 'zh-Hans']) await check('390 px 特大字 ' + lang + ' 五寶、靜音與減少動畫', async () => {
      const config = { width: 390, height: 844, theme: 'dark', lang, fs: 1.3, reduced: true };
      const { ctx, page, errors } = await open(browser, base, config);
      try {
        const state = await reward(page, 'five');
        await pageAudit(page, lang);
        assert.strictEqual(state.review.tones.length, 0, '關閉音效時不可播放');
        const motion = await page.locator('.dl-loot-all').evaluate(el => getComputedStyle(el, '::before').animationName);
        assert.strictEqual(motion, 'none');
        if (lang === 'zh-Hans') assert.strictEqual(await page.locator('.dl-loot-title').textContent(), '五宝齐发');
        assert.deepStrictEqual(errors, []);
      } finally { await ctx.close(); }
    });
    await check('實驗每日模式自動載入獨立樣式，並依序顯示多種寶物', async () => {
      const { ctx, page, errors } = await open(browser, base, { width: 390, height: 844, theme: 'dark', dailyMode: true }, 'projectile');
      try {
        assert.strictEqual(await page.locator('link[data-daily-style]').count(), 1);
        await reward(page, 'multi'); await pageAudit(page);
        assert.deepStrictEqual(errors, []);
      } finally { await ctx.close(); }
    });
    await check('其他分頁已改設定時，掉寶仍採最新暱稱與公開設定', async () => {
      const { ctx, page, errors } = await open(browser, base, { width: 390, height: 844, theme: 'dark' });
      try {
        await page.evaluate(async () => LabDailyCore.updateTreasureProfile(LabDaily._D.api, 'u1', { nickname: 'ChangedExplorer', pub: false }));
        assert.strictEqual(await page.evaluate(() => LabMission._state.nickname), 'Tester');
        const state = await reward(page, 'multi');
        assert.strictEqual(state.db.treasureBoard.u1.name, C.treasureName('ChangedExplorer', false));
        assert.strictEqual(state.db.treasureBoard.u1.pub, false); assert.deepStrictEqual(errors, []);
      } finally { await ctx.close(); }
    });
    await check('未登入仍可閱讀完整機率表', async () => {
      const { ctx, page, errors } = await open(browser, base, { width: 390, height: 844, theme: 'light', guest: true });
      try { await pageAudit(page); assert.strictEqual(await page.locator('.dl-prob-table tbody tr').count(), 5); assert.strictEqual(await page.locator('.dl-lv-table tbody tr').count(), 10, '★1–★10 都要列'); assert.deepStrictEqual(errors, []); }
      finally { await ctx.close(); }
    });
    await check('寫入失敗不發寶物事件、不增加本機寶物、不播放動畫', async () => {
      const { ctx, page, errors } = await open(browser, base, { width: 390, height: 844, theme: 'light' });
      try {
        const result = await page.evaluate(async () => {
          const before = JSON.stringify(LabDaily._D.bag); let events = 0;
          window.addEventListener('lab:loot', () => events++);
          localStorage.setItem('mockoldrules', '1');
          LabDaily.completed(LabMission.all().projectile[0], false);
          await new Promise(resolve => setTimeout(resolve, 150));
          return { before, after: JSON.stringify(LabDaily._D.bag), events, overlay: !!document.querySelector('.dl-loot'), message: LabDaily._D.msg };
        });
        assert.strictEqual(result.before, result.after); assert.strictEqual(result.events, 0); assert.strictEqual(result.overlay, false);
        assert.ok(result.message.includes('沒有記錄成功')); assert.deepStrictEqual(errors, []);
      } finally { await ctx.close(); }
    });
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
  report.finishedAt = new Date().toISOString();
  report.passed = true;
  fs.writeFileSync(path.join(OUT, 'daily-review.json'), JSON.stringify(report, null, 2));
  console.log(report.checks.length + ' 項整合驗收通過，截圖 ' + report.shots.length + ' 張。');
}
run().catch(error => {
  report.error = error.stack; report.finishedAt = new Date().toISOString(); report.passed = false;
  fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, 'daily-review.json'), JSON.stringify(report, null, 2));
  console.error(error); server.close(); process.exitCode = 1;
});
