// node tools/check-dc-meter-font.cjs — 驗證橫放時電表離屏圖層的插孔標字。
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { launch } = require('./browser.cjs');
const { serve } = require('./personas/driver.cjs');

async function check() {
  const root = path.resolve(__dirname, '..');
  const server = await serve(root);
  let browser;
  try {
    browser = await launch();
    for (const deviceScaleFactor of [1, 2]) {
      const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
      try {
        await ctx.route(url => url.origin !== server.origin, route => route.abort());
        await ctx.addInitScript({ path: path.join(__dirname, 'mock-backend.js') });
        await ctx.addInitScript(() => {
          localStorage.setItem('lab-welcome-v1', 'skip');
          const layers = new WeakMap();
          const proto = CanvasRenderingContext2D.prototype;
          const fillText = proto.fillText, drawImage = proto.drawImage;
          window.jackLabelHeights = {};
          proto.fillText = function (label, ...args) {
            if (label === '+' || label === 'COM') {
              const labels = layers.get(this.canvas) || {};
              labels[label] = Number(this.font.match(/([\d.]+)px/)[1]) * this.getTransform().d;
              layers.set(this.canvas, labels);
            }
            return fillText.call(this, label, ...args);
          };
          proto.drawImage = function (source, ...args) {
            const labels = layers.get(source);
            if (labels && this.canvas.id === 'cv' && this.canvas.clientWidth > 0 && this.canvas.clientWidth < 560) {
              const destScale = args.length === 8 ? args[7] / args[3] : args.length === 4 ? args[3] / source.height : 1;
              const cssScale = this.getTransform().d * destScale * this.canvas.getBoundingClientRect().height / this.canvas.height;
              for (const [key, height] of Object.entries(labels)) window.jackLabelHeights[key] = height * cssScale;
            }
            return drawImage.call(this, source, ...args);
          };
        });
        const page = await ctx.newPage();
        await page.goto(server.origin + '/dc-circuit.html?mode=lab');
        await page.waitForFunction(() => window.jackLabelHeights.COM > 0);
        await page.waitForTimeout(500); // 等操作台移到右側後，畫布以最後的尺寸重繪。
        const heights = await page.evaluate(() => window.jackLabelHeights);
        console.log('DPR', deviceScaleFactor, heights);
        for (const key of ['+', 'COM']) assert.ok(heights[key] >= 9, key + ' 字高 ' + heights[key] + ' px，應至少 9 px');
      } finally { await ctx.close(); }
    }
  } finally {
    try { if (browser) await browser.close(); } finally { server.close(); }
  }
}
check().catch(error => { console.error(error.message); process.exitCode = 1; });
