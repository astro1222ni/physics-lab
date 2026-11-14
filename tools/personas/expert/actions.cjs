'use strict';

const { setTimeout: sleep } = require('node:timers/promises');

async function offsetClick(driver, target, x, y) {
  if (driver.keyboard) throw new Error('這份畫布路徑需要滑鼠或觸控');
  const loc = driver.locator(target);
  const pos = { x, y };
  return driver.touch ? loc.tap({ position: pos }) : loc.click({ position: pos });
}

async function dragPixels(driver, loc, from, to) {
  const box = await loc.boundingBox();
  if (!box) throw new Error('拖曳控制項未顯示');
  const mouse = driver.page.mouse;
  await mouse.move(box.x + from[0], box.y + from[1]);
  await mouse.down();
  try { await mouse.move(box.x + to[0], box.y + to[1], { steps: 10 }); }
  finally { await mouse.up(); }
}

async function canvasSize(d, target) {
  return d.locator(target).evaluate(el => [el.clientWidth, el.clientHeight]);
}

function mapTransform(width, height, map) {
  const padding = map.narrowPadding != null && width < 520 ? map.narrowPadding : map.padding;
  const scale = Math.min((width - 2 * padding) / map.width, (height - 2 * padding) / map.height);
  const originX = (width - map.width * scale) / 2;
  const originY = (height + map.height * scale) / 2;
  return ([x, y]) => [originX + x * scale, originY - y * scale];
}

const ops = {
  async 'world-point'(d, a) {
    const [w, h] = await canvasSize(d, a.target);
    const scale = (Math.min(w, h) / 2 - a.padding) / a.radius;
    return offsetClick(d, a.target, w / 2 + a.x * scale, h / 2 - a.y * scale);
  },
  async 'map-point'(d, a) {
    const [w, h] = await canvasSize(d, a.target);
    return offsetClick(d, a.target, ...mapTransform(w, h, a)([a.x, a.y]));
  },
  async 'map-drag'(d, a) {
    const loc = d.locator(a.target);
    await loc.scrollIntoViewIfNeeded();
    const [w, h] = await canvasSize(d, a.target);
    const pos = mapTransform(w, h, a);
    await dragPixels(d, loc, pos(a.from), pos(a.to));
  },
  async 'population-age'(d, a) {
    const [w, h] = await canvasSize(d, a.target);
    const scale = await d.evaluate(() => Math.min(1.3, parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fs')) || 1));
    const top = Math.round(36 * scale), bottom = Math.round(26 * scale);
    const y = h - bottom - (a.age + 0.5) * (h - top - bottom) / a.rows;
    return offsetClick(d, a.target, w / 2 - 30, y);
  },
  async 'pause-at-reading'(d, a) {
    const reading = d.locator(a.reading);
    const val = async () => Number((await reading.textContent()).replace('−', '-').match(/-?\d+(\.\d+)?/)?.[0]);
    await d.click(a.target);
    await d.page.waitForFunction(({ selector, value }) => {
      const raw = document.querySelector(selector)?.textContent || '';
      const n = Number(raw.match(/\d+(\.\d+)?/)?.[0]);
      return Number.isFinite(n) && n >= value && n <= value + 0.11;
    }, { selector: a.reading, value: a.value }, { timeout: 7000 });
    await d.click(a.target);
    let count = 2;
    for (let i = 0; i < 40; i++) {
      const current = await val();
      if (Math.abs(current - a.value) <= a.tolerance) return count;
      await d.click(current > a.value ? a.close : a.apart);
      count++;
    }
    throw new Error('在可見讀數上找不到暫停點');
  },
  async 'range-key'(d, a) {
    const loc = d.locator(a.target);
    const values = await loc.evaluate(el => ({ value: +el.value, min: +el.min, max: +el.max, step: +el.step || 1 }));
    const { min, max, step } = values;
    const dest = Math.max(min, Math.min(max, a.value));
    const steps = Math.round((dest - values.value) / step);
    if (steps === 0) return 0;
    if (dest === min || dest === max) {
      await d.pressTarget(a.target, dest === min ? 'Home' : 'End');
      return 1;
    }
    const key = steps < 0 ? 'ArrowLeft' : 'ArrowRight';
    for (let i = 0; i < Math.abs(steps); i++) await d.pressTarget(a.target, key);
    return Math.abs(steps);
  },
  async 'click-series'(d, a) {
    const loc = d.locator(a.target);
    await loc.scrollIntoViewIfNeeded();
    const box = await loc.boundingBox();
    if (!box) throw new Error('連點按鈕未顯示');
    const mouse = d.page.mouse;
    const start = performance.now();
    for (let i = 0; i < a.count; i++) {
      const remaining = start + i * (a.interval || 0) - performance.now();
      if (remaining > 0) await sleep(remaining);
      await mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    }
    return a.count;
  },
  async 'room-drag'(d, a) {
    const loc = d.locator(a.target);
    await loc.scrollIntoViewIfNeeded();
    const w = await loc.evaluate(el => el.clientWidth);
    const narrow = w < 480;
    const pad = narrow ? 10 : 18, bottom = narrow ? 46 : 34;
    const top = 40, maxHeight = narrow ? 420 : 500, roomMargin = 1.4;
    const scale = Math.min((w - 2 * pad) / (a.length * roomMargin), (maxHeight - top - bottom) / (a.width * roomMargin));
    const roomW = a.length * scale, roomH = a.width * scale;
    const height = Math.max(narrow ? 250 : 300, Math.round(roomH * roomMargin + top + bottom));
    const originX = (w - roomW) / 2, originY = (height + top - bottom + roomH) / 2;
    const pos = ([u, v]) => [originX + roomW * u, originY - roomH * v];
    await dragPixels(d, loc, pos(a.from), pos(a.to));
  },
  async 'screen-point'(d, a) {
    if (d.touch) return d.page.touchscreen.tap(a.x, a.y);
    return d.page.mouse.click(a.x, a.y);
  },
  async point(driver, { target, x, y, unit, index }) {
    const loc = driver.page.locator(target);
    const control = index == null ? loc.first() : loc.nth(index);
    if (unit === 'ratio') {
      const dim = await control.evaluate(el => ({ w: el.clientWidth, h: el.clientHeight }));
      x *= dim.w; y *= dim.h;
    }
    if (driver.keyboard) throw new Error('此點選需要滑鼠或觸控');
    const position = { x, y };
    return driver.touch ? control.tap({ position }) : control.click({ position });
  },
  async 'circle-key'(d, a) {
    await sleep(820);
    const { w, h, wide } = await d.locator(a.target).evaluate(el => ({ w: el.clientWidth, h: el.clientHeight, wide: el.parentElement.classList.contains('wide') }));
    const r = Math.max(90, Math.min(w / 2 - 14, (h - 40) / 2, 230));
    const cy = wide ? Math.max(r + 26, h / 2) : r + 26;
    const radius = r * (a.radius > .35 ? .87 : .62);
    return offsetClick(d, a.target, w / 2 + a.x * radius, cy + a.y * radius);
  },
  async 'pitch-key'(d, a) {
    const p = await d.locator(a.target).evaluate((el, info) => {
      const { position, black, whiteKeys } = info;
      const dim = el.parentElement.clientWidth || 600;
      const whiteWidth = Math.max(matchMedia('(pointer: coarse)').matches ? 26 : 15, (dim - 24) / whiteKeys);
      const scale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fs')) || 1;
      return { x: 12 + position * whiteWidth, y: Math.round(26 * scale + 6) + Math.round(118 + 10 * (scale - 1)) * (black ? .35 : .85) };
    }, a);
    return offsetClick(d, a.target, p.x, p.y);
  },
  async 'pentatonic-string'(d, a) {
    await d.page.waitForFunction(index => !!window.__pent?.stringXY(index), a.index, { timeout: 1400 });
    // 只讀取弦在畫布上的顯示座標，音符仍以真正的畫布點擊觸發。
    const p = await d.evaluate(index => window.__pent.stringXY(index), a.index);
    return offsetClick(d, a.target, p.x, p.y);
  },
  async 'rhythm-cell'(d, a) {
    const data = await d.locator(a.target).evaluate((el, target) => {
      const row = target.row;
      const w = el.clientWidth;
      const n = Number(document.querySelector('#n' + row).value);
      const list = [0, 1, 2].filter(i => !i || document.querySelector('#on' + i).checked);
      const scale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fs')) || 1;
      const tl = Math.round(46 + 22 * scale) + (list.length + 1) * Math.round(34 + 10 * (scale - 1)) + 34;
      const s = w >= 720 ? Math.round(Math.max(300, Math.min(420, w * .44))) : Math.round(Math.min(w - 8, 420));
      const region = w >= 720 ? { x: 8, y: 8, w: s, h: Math.max(s, tl) } : { x: 4, y: 4, w: w - 8, h: s };
      const inside = Math.min(region.w, region.h);
      const cr = inside / 2 - 42 * scale;
      const r = cr * (1 - list.indexOf(row) * (list.length >= 3 ? .27 : .32));
      const angle = -Math.PI / 2 + Math.PI * 2 * target.col / n;
      return { x: region.x + region.w / 2 + r * Math.cos(angle),
        y: region.y + inside / 2 + (w >= 720 ? (region.h - inside) / 2 : 0) + 12 * scale + r * Math.sin(angle) };
    }, a);
    return offsetClick(d, a.target, data.x, data.y);
  },
  async checked(d, a) {
    const loc = d.locator(a.target);
    if (await loc.isChecked() !== a.value) await d.pressTarget(a.target, 'Space');
  },
  async 'range-sweep'(d, a) {
    const l = d.locator(a.target);
    const g = await l.evaluate(el => ({ min: +el.min, max: +el.max, value: +el.value, w: el.clientWidth, h: el.clientHeight }));
    if (d.keyboard || d.touch) throw new Error('滑桿連續拖動路徑使用桌機滑鼠');
    await l.scrollIntoViewIfNeeded();
    const b = await l.boundingBox();
    const center = value => b.x + 8 + (g.w - 16) * (value - g.min) / (g.max - g.min);
    await d.page.mouse.move(center(g.value), b.y + g.h / 2);
    await d.page.mouse.down();
    try { await d.page.mouse.move(center(a.to), b.y + g.h / 2, { steps: Math.ceil(Math.abs(a.to - g.value) / a.maxStep) }); }
    finally { await d.page.mouse.up(); }
  },
  async 'await-ui'(d, a) { await sleep(a.ms); },
  async 'await-visible'(d, a) { await d.locator(a.target).waitFor({ state: 'visible', timeout: a.ms || 6000 }); },
  async 'await-hidden'(d, a) { await d.locator(a.target).waitFor({ state: 'hidden', timeout: a.ms || 6000 }); },
  async 'optional-click'(d, a) { if (await d.visible(a.target)) await d.click(a.target); },
  async 'choose-label'(d, a) { return d.locator(a.target).selectOption({ label: a.value }); },
  async 'named'(d, a) {
    const scope = a.scope ? d.page.locator(a.scope).first() : d.page;
    const loc = a.role ? scope.getByRole(a.role, { name: a.name, exact: a.exact !== false }).first() :
      scope.getByText(a.name, { exact: a.exact !== false }).first();
    if (a.key) await loc.press(a.key);
    else if (a.value !== undefined) {
      if (a.editor) {
        await loc.click();
        const input = d.locator('.lab-num-edit input:focus');
        await input.fill(String(a.value));
        await input.press('Enter');
      } else await loc.fill(String(a.value));
    } else if (d.touch) await loc.tap();
    else await loc.click();
  },
  async 'hold'(d, a) {
    const l = d.locator(a.target);
    await l.scrollIntoViewIfNeeded();
    const b = await l.boundingBox();
    if (!b) throw new Error('要按住的控制項未顯示');
    await d.page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await d.page.mouse.down();
    try {
      if (a.until) await d.locator(a.until).waitFor({ state: 'visible', timeout: a.ms });
      else await sleep(a.ms);
    } finally { await d.page.mouse.up(); }
  },
  async 'pixel-drag'(d, a) {
    const loc = a.target ? d.locator(a.target) : d.page.locator('body');
    if (a.target) await loc.scrollIntoViewIfNeeded();
    else return dragPixels(d, { boundingBox: () => ({ x: 0, y: 0 }) }, a.from, a.to);
    await dragPixels(d, loc, a.from, a.to);
  }
};

module.exports = { ops };
