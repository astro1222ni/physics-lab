// node tests/labside-browser.cjs [截圖目錄]
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { launch } = require('../tools/browser.cjs');
const { server } = require('../tools/home-browser.cjs');

function coveredControls() {
  const edge = document.querySelector('.labside-edge');
  const rect = edge.getBoundingClientRect();
  const selector = 'button, input, select, textarea, a[href], summary, label, canvas, output.lab-num, [role="button"], [draggable="true"]';
  const hits = new Set();
  for (let x = Math.ceil(rect.left); x < rect.right; x++) {
    for (let y = Math.ceil(rect.top); y < rect.bottom; y++) {
      const [top, underneath] = document.elementsFromPoint(x, y);
      const target = underneath?.closest(selector);
      if (top === edge && target) hits.add(target.id || target.textContent.trim() || target.tagName);
    }
  }
  return [...hits];
}

async function check(browser, base, slug, width, height) {
  const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block' });
  try {
    await context.route(url => !url.href.startsWith(base), route => route.abort());
    await context.routeWebSocket(/.*/, socket => socket.close());
    await context.addInitScript({ path: require.resolve('../tools/mock-backend.js') });
    const page = await context.newPage();
    await page.goto(base + slug + '.html');
    const rail = page.locator('.labside-rail'), edge = page.locator('.labside-edge');
    await edge.waitFor();
    await page.locator('.labside-rail > .fb-tab').waitFor({ state: 'attached' });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.evaluate(() => localStorage.getItem('labside-rail-choice')), null);
    assert.equal(await rail.isVisible(), false);
    assert.deepEqual(await page.evaluate(coveredControls), [], slug + ' ' + width + '×' + height);
    if (process.argv[2]) await page.screenshot({ path: path.join(process.argv[2], slug + '-' + width + 'x' + height + '.png') });
    await page.locator('canvas').first().evaluate(el => el.scrollIntoView({ block: 'start', behavior: 'instant' }));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.deepEqual(await page.evaluate(coveredControls), [], slug + ' 捲至畫布 ' + width + '×' + height);
    if (slug === 'han-character-formation' && width === 1280) {
      const grip = await edge.boundingBox();
      const x = grip.x + grip.width / 2, y = grip.y + grip.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x - 65, y, { steps: 8 });
      await page.mouse.up();
      await rail.waitFor();
      await page.reload();
      await rail.waitFor();
      await page.locator('#labside-tab-steps').click();
      assert.ok(await page.locator('html.labside-docked').count());
      await page.keyboard.press('Escape');
      await page.locator('.labside-fold').click();
      await page.reload();
      await edge.waitFor();
      assert.equal(await page.evaluate(() => localStorage.getItem('labside-rail-choice')), '0');
      assert.equal(await rail.isVisible(), false);
    }
    console.log(slug + ' ' + width + '×' + height + ' 通過');
  } finally { await context.close(); }
}

(async () => {
  const { srv, base } = await server();
  try {
    const browser = await launch();
    try {
      for (const slug of ['han-character-formation', 'career-decision-balance', 'supply-demand']) {
        for (const [w, h] of [[844, 390], [390, 844], [1280, 800]]) await check(browser, base, slug, w, h);
      }
    } finally { await browser.close(); }
  } finally { srv.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
