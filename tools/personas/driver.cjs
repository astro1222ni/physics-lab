'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { setTimeout: sleep } = require('node:timers/promises');
const classic = require('../playtest.cjs');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.woff': 'font/woff', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg'
};
const SITE_ASSETS = new Set(['js', 'img', 'vendor', 'sounds', 'audio', 'fonts']);
const TIMEOUT = 4500;

async function serve(root) {
  const { createServer } = require('node:http');
  const server = createServer((req, res) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname); }
    catch { res.writeHead(400).end(); return; }
    const names = pathname.slice(1).split('/');
    if (pathname === '/') names[0] = 'index.html';
    const allowed = names.length === 1 ? /^[a-z0-9-]+\.html$|^lab\.css$/.test(names[0]) : SITE_ASSETS.has(names[0]);
    if ((req.method !== 'GET' && req.method !== 'HEAD') || !allowed || names.some(name => !/^[\w.-]+$/.test(name) || name.startsWith('.'))) {
      res.writeHead(404).end(); return;
    }
    const file = path.join(root, ...names);
    try {
      if (!fs.statSync(file).isFile() || !fs.realpathSync(file).startsWith(root + path.sep)) { res.writeHead(404).end(); return; }
    } catch (err) {
      res.writeHead(err.code === 'ENOENT' ? 404 : 500).end(); return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    if (req.method === 'HEAD') { res.end(); return; }
    const stream = fs.createReadStream(file);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return { origin: 'http://127.0.0.1:' + server.address().port, close: () => { server.close(); server.closeAllConnections(); } };
}

// 導覽會重建頁面。在每份文件中按同一順序初始化，只有同一個本機來源可載入假後端。
function initBrowser(config) {
  if (window.top !== window || location.origin !== config.origin) return;
  const rand = config.seed;
  let state = rand >>> 0;
  Math.random = function () {
    state = (state + 0x6D2B79F5) | 0;
    let v = Math.imul(state ^ state >>> 15, state | 1);
    v ^= v + Math.imul(v ^ v >>> 7, v | 61);
    return ((v ^ v >>> 14) >>> 0) / 4294967296;
  };
  if (!sessionStorage.getItem('personas-initialized')) {
    localStorage.clear();
    localStorage.setItem('lab-settings', JSON.stringify(config.settings));
    localStorage.setItem('mockuser', 'u1');
    localStorage.setItem('mdb', JSON.stringify(config.database));
    if (!config.welcome) localStorage.setItem('lab-welcome-v1', 'skip');
    localStorage.setItem('lab-try:' + config.slug, '1');
    localStorage.setItem('ms-sec-pub', '0');
    localStorage.setItem('ms-sec-hid', '0');
    localStorage.setItem('ms-dock', '0');
    sessionStorage.setItem('ms-on:' + config.slug, '1');
    sessionStorage.setItem('personas-initialized', '1');
  }
  window.open = () => null;
  window.print = () => {};
}

function observeBrowser(config) {
  const readings = { events: [], long: [], count: 0, action: 0, missions: [] };
  window.__persona = readings;
  if (PerformanceObserver.supportedEntryTypes.includes('longtask')) {
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        if (entry.duration >= 1000 && readings.long.length < 30) readings.long.push({ ms: entry.duration, start: entry.startTime, step: readings.action });
      }
    }).observe({ type: 'longtask', buffered: true });
  }
  Object.defineProperty(window, 'LabMission', {
    configurable: true, enumerable: true,
    get() { return readings.lab; },
    set(lab) {
      readings.lab = lab;
      lab.on('complete', m => { if (m) readings.missions.push({ id: m.id, step: readings.action }); });
      if (!config.expert) return;
      const emit = lab.emit;
      lab.emit = function (type, data) {
        readings.count++;
        if (readings.events.length < 240) {
          try { readings.events.push(structuredClone({ type, data })); } catch { /* 無法複製的診斷事件略過 */ }
        }
        return emit.apply(this, arguments);
      };
    }
  });
}

async function openContext(browser, root, origin, config, missions, note) {
  const { habit, slug, seed } = config;
  const ctx = await browser.newContext({
    viewport: habit.viewport, screen: habit.viewport, deviceScaleFactor: 1,
    hasTouch: habit.mobile, isMobile: habit.mobile, colorScheme: habit.theme,
    acceptDownloads: false, serviceWorkers: 'block', bypassCSP: false
  });
  try {
    await ctx.route('**/*', route => {
      if (new URL(route.request().url()).origin === origin) return route.continue();
      note.blockedRequests++;
      return route.abort('blockedbyclient');
    });
    if (typeof ctx.routeWebSocket !== 'function') throw new Error('Playwright 需支援 WebSocket 攔截');
    await ctx.routeWebSocket(/.*/, ws => { note.blockedRequests++; return ws.close(); });
    const database = {
      profiles: { u1: { nickname: '試玩員', pub: false } }, completions: {}, scores: {}, admins: {},
      missionDefs: Object.fromEntries(missions.map(m => [m.id, { stars: m.level * (m.hidden ? 2 : 1) }]))
    };
    const input = JSON.stringify({
      origin, slug, seed, database, welcome: config.welcome, expert: config.persona === 'expert',
      settings: { lang: habit.language, theme: habit.theme, fs: habit.scale, sound: false, volume: 0 }
    });
    // addInitScript 的跨腳本次序未保證，因此這三段放在同一個注入字串。
    const mock = fs.readFileSync(path.join(root, 'tools/mock-backend.js'), 'utf8');
    await ctx.addInitScript({ content: [
      'if (window.top === window && location.origin === ' + JSON.stringify(origin) + ') {',
      '(' + initBrowser.toString() + ')(' + input + ');', mock,
      ';(' + observeBrowser.toString() + ')(' + input + ');',
      ';(' + classic.ptLib.toString() + ')();', '}'
    ].join('\n') });
    const page = await ctx.newPage();
    page.setDefaultTimeout(TIMEOUT);
    page.setDefaultNavigationTimeout(16_000);
    page.on('dialog', d => { note.dialogs.push(d.message().slice(0, 200)); void d.dismiss().catch(() => {}); });
    const err = message => String(message).split('\n')[0].slice(0, 300);
    page.on('pageerror', e => note.add('confirmed', 'pageerror', '頁面錯誤「' + err(e.message) + '」'));
    page.on('crash', () => note.add('confirmed', 'crash', 'Chromium 回報頁面崩潰'));
    page.on('console', m => {
      if (m.type() !== 'error' || /ERR_BLOCKED_BY_CLIENT|FirebaseError|net::ERR_ABORTED/i.test(m.text())) return;
      // 資源載入訊息由 response 事件補上實際本機路徑。
      if (/^Failed to load resource:/i.test(m.text())) return;
      note.add('pending', 'console', '主控台錯誤「' + err(m.text()) + '」');
    });
    page.on('response', res => {
      if (res.status() < 400 || new URL(res.url()).origin !== origin || res.request().resourceType() === 'other') return;
      note.add('pending', 'resource', '本機資源回傳 ' + res.status() + '，' + new URL(res.url()).pathname);
    });
    return { page, ctx, cdp: await ctx.newCDPSession(page) };
  } catch (e) {
    await ctx.close().catch(() => {});
    throw e;
  }
}

function deadline(work, ms, label) {
  let id;
  return Promise.race([
    work,
    new Promise((_, reject) => { id = setTimeout(() => reject(new Error('等待逾時：' + label)), ms); })
  ]).finally(() => clearTimeout(id));
}

class Driver {
  constructor(session, origin, config, record) {
    Object.assign(this, session);
    this.origin = origin;
    this.url = origin + '/' + config.slug + '.html';
    this.config = config;
    this.record = record;
    this.touch = config.habit.mobile;
    this.keyboard = config.habit.keyboard;
  }

  async load(url = this.url, fresh = false) {
    if (fresh && this.page.url().startsWith(this.origin + '/')) {
      await this.evaluate(() => { sessionStorage.removeItem('personas-initialized'); });
    }
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
    await this.ready();
  }

  async history(count) {
    // 用同頁的本機歷史項目測來回，不開第二個頁籤。每次回到原實驗再量測。
    await this.page.goto(this.origin + '/index.html', { waitUntil: 'domcontentloaded' });
    await this.page.goBack({ waitUntil: 'domcontentloaded' });
    for (let i = 1; i < count; i++) {
      await this.page.goForward({ waitUntil: 'commit' });
      await this.page.goBack({ waitUntil: 'domcontentloaded' });
    }
    await this.ready();
  }

  async snapshotState() {
    return this.evaluate(() => {
      const controls = [...document.querySelectorAll('.lab input[id], .lab select[id]')]
        .filter(el => el.checkVisibility() && !el.disabled).slice(0, 80)
        .map(el => [el.id, el.type === 'checkbox' || el.type === 'radio' ? el.checked : el.value]);
      const outputs = [...document.querySelectorAll('.lab dd[id], .lab output[id], .lab [id="rBlack"], .lab [id="rRuns"]')]
        .filter(el => el.checkVisibility()).slice(0, 80)
        .map(el => [el.id, el.textContent.trim().slice(0, 100)]);
      return { y: Math.round(scrollY), controls, outputs, lang: document.documentElement.lang, title: document.title };
    });
  }

  async ready() {
    await this.page.waitForFunction(() => document.readyState !== 'loading' && window.__persona && window.__ptLib,
      null, { timeout: 10_000 });
    await this.page.waitForFunction(() => {
      if (!document.querySelector('script[src*="js/missions.js"]')) return true;
      const s = window.LabMission?._state;
      return s?.user?.uid === 'u1' && !!s.nickname && !!document.querySelector('.ms-toggle');
    }, null, { timeout: 7000, polling: 100 });
    await this.evaluate(ex => { window.__ptLib.skip = ex; }, this.record.exclude.skip);
  }

  async evaluate(fn, arg, ms = 4500) {
    try { return await deadline(this.page.evaluate(fn, arg), ms, '瀏覽器主執行緒'); }
    catch (error) {
      if (!/Execution context was destroyed|Cannot find context/.test(error.message)) throw error;
      await this.page.waitForLoadState('domcontentloaded', { timeout: ms });
      return deadline(this.page.evaluate(fn, arg), ms, '重新導覽後的瀏覽器主執行緒');
    }
  }

  async markStep(step) {
    await this.evaluate(n => { window.__persona.action = n; }, step);
  }

  locator(selector) { return this.page.locator(selector).first(); }

  async visible(selector) {
    const loc = this.locator(selector);
    return await loc.isVisible() && await loc.isEnabled();
  }

  async inventory() {
    return this.evaluate(() => {
      const controls = window.__ptLib.actionables();
      const vis = el => el.checkVisibility() && !el.disabled && !el.readOnly && !el.closest('[hidden], .ms-wrap, #comments, .lab-settings');
      for (const el of document.querySelectorAll('.lab input[type=text], .lab input[type=search], .lab textarea')) {
        if (!vis(el)) continue;
        const id = el.id ? '#' + CSS.escape(el.id) : null;
        if (id) controls.push({ kind: 'text', selector: id, name: el.getAttribute('aria-label') || el.labels?.[0]?.innerText || el.id });
      }
      return controls.map(item => {
        const el = item.selector ? document.querySelector(item.selector) : document.querySelector('[data-pt-id="' + item.id + '"]');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const label = el.labels?.[0]?.innerText || el.closest('.slider')?.querySelector('label')?.innerText;
        const option = item.kind === 'select' ? [...el.options].filter(o => !o.disabled).map(o => ({ label: o.text, value: o.value })) : [];
        const range = item.kind === 'range' ? { min: Number(el.min), max: Number(el.max), value: Number(el.value), step: Number(el.step) || 1 } : undefined;
          const editor = item.kind === 'range' ? el.closest('.slider')?.querySelector('output.lab-num') || document.getElementById(el.id + 'o') : null;
        return { ...item, selector: item.selector || (el.id ? '#' + CSS.escape(el.id) : '[data-pt-id="' + item.id + '"]'),
          label: label || el.getAttribute('aria-label') || item.name, option, range,
          editor: editor?.matches('output.lab-num') && editor.id ? '#' + CSS.escape(editor.id) : undefined,
          primary: el.matches('.primary,.go,[data-primary]'), width: r.width, height: r.height, y: r.y };
      }).filter(Boolean);
    });
  }

  async focus(selector, limit = 130) {
    if (!await this.visible(selector)) return false;
    const seen = new Map();
    for (let n = 0; n < limit; n++) {
      const info = await this.evaluate(sel => {
        const el = document.activeElement;
        return { hit: el?.matches(sel), name: el?.id || el?.dataset?.ptId || el?.getAttribute('aria-label') };
      }, selector);
      if (info.hit) return true;
      if (info.name) {
        const count = (seen.get(info.name) || 0) + 1;
        if (count > 4) return false;
        seen.set(info.name, count);
      }
      await this.page.keyboard.press('Tab');
    }
    return false;
  }

  async pressTarget(selector, key = 'Enter', keyboard = this.keyboard) {
    if (!keyboard) return this.locator(selector).press(key);
    if (!await this.focus(selector)) throw new Error('鍵盤 Tab 找不到 ' + selector);
    await this.page.keyboard.press(key);
  }

  async click(selector) {
    if (this.keyboard) return this.pressTarget(selector, 'Enter', true);
    const loc = this.locator(selector);
    if (this.touch) await loc.tap();
    else await loc.click();
  }

  async type(selector, value, editor, commit = true, boundary = null) {
    if (editor) {
      await this.click(selector);
      selector = '.lab-num-edit input:focus, input:focus[data-numinput], output[data-editing] input:focus, input.lab-num-input:focus';
    } else if (this.keyboard && !await this.focus(selector)) throw new Error('鍵盤 Tab 找不到 ' + selector);
    const loc = this.locator(selector);
    if (this.keyboard || editor) {
      await loc.waitFor({ state: 'visible' });
      if (boundary) {
        const hint = await loc.getAttribute('aria-label');
        const numbers = String(hint || '').replace(/[−–]/g, '-').match(/[+-]?d+(?:.d+)?(?:e[+-]?d+)?/gi);
        if (!numbers || numbers.length !== 2) throw new Error('輸入框沒有可辨識的數值邊界');
        value = numbers[boundary === 'min' ? 0 : 1];
      }
      await this.page.keyboard.press('ControlOrMeta+A');
      if (value === '') await this.page.keyboard.press('Backspace');
      else await this.page.keyboard.insertText(String(value));
    } else await loc.fill(String(value));
    if (commit) await this.page.keyboard.press('Enter');
    if (boundary) return { entered: value };
  }

  async select(selector, value) {
    if (!this.keyboard) return this.locator(selector).selectOption(String(value));
    const index = await this.locator(selector).evaluate((el, target) => [...el.options].filter(o => !o.disabled).findIndex(o => o.value === target), String(value));
    if (index < 0) throw new Error('找不到選項');
    await this.pressTarget(selector, 'Home', true);
    for (let i = 0; i < index; i++) await this.page.keyboard.press('ArrowDown');
    await this.page.keyboard.press('Enter');
  }

  async stagePoint(selector, fx, fy, inCanvas = false) {
    const loc = this.locator(selector);
    await loc.scrollIntoViewIfNeeded({ timeout: 3800 });
    const box = await loc.boundingBox({ timeout: 3800 });
    const vp = this.page.viewportSize();
    if (!box) throw new Error('畫布不可見');
    if (inCanvas) {
      const x = box.x + fx * box.width, y = box.y + fy * box.height;
      if (x >= 2 && x < vp.width - 2 && y >= 2 && y < vp.height - 2) return { box, x, y };
    }
    const left = Math.max(18, box.x), top = Math.max(12, box.y);
    const right = Math.min(vp.width - 18, box.x + box.width), bottom = Math.min(vp.height - 12, box.y + box.height);
    if (right - left < 16 || bottom - top < 16) throw new Error('畫布在視窗內可操作的範圍不足');
    return { box, x: left + (right - left) * fx, y: top + (bottom - top) * fy };
  }

  async drag(selector, coords, fingers = 1) {
    if (this.keyboard) return this.pressTarget(selector, 'ArrowRight', true);
    const start = await this.stagePoint(selector, coords[0], coords[1], !!coords[4]);
    const end = await this.stagePoint(selector, coords[2], coords[3], !!coords[4]);
    const hits = await this.evaluate(({ selector, x, y }) => {
      const el = document.querySelector(selector);
      return !!el?.contains(document.elementFromPoint(x, y));
    }, { selector, x: start.x, y: start.y });
    if (!hits) throw new Error('畫布觸點被其他介面蓋住');
    if (!this.touch && fingers === 1) {
      await this.page.mouse.move(start.x, start.y);
      await this.page.mouse.down();
      try { await this.page.mouse.move(end.x, end.y, { steps: 9 }); }
      finally { await this.page.mouse.up(); }
      return;
    }
    const send = (type, touchPoints) => this.cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
    try {
      for (let i = 0; i <= 10; i++) {
        const x = start.x + (end.x - start.x) * i / 10, y = start.y + (end.y - start.y) * i / 10;
        const points = [{ x, y, id: 1, force: 0.7, radiusX: 4, radiusY: 4 }];
        if (fingers === 2) points.push({ x: Math.min(this.page.viewportSize().width - 2, x + 22 + 2 * i), y, id: 2, force: 0.7, radiusX: 4, radiusY: 4 });
        await send(i === 0 ? 'touchStart' : 'touchMove', points);
        if (fingers === 1) await sleep(13);
      }
    } finally { await send('touchEnd', []); }
  }

  async rapid(selector, waits) {
    const point = this.keyboard ? null : await this.stagePoint(selector, 0.5, 0.5);
    if (this.keyboard && !await this.focus(selector)) throw new Error('找不到可連按的鍵盤焦點');
    const at = [], fired = [];
    const tap = this.keyboard ? () => this.page.keyboard.press('Enter') : this.touch
      ? () => this.page.touchscreen.tap(point.x, point.y) : () => this.page.mouse.click(point.x, point.y);
    const start = performance.now();
    let offset = 0;
    for (const wait of waits) {
      offset += wait;
      fired.push(sleep(offset).then(() => { at.push(Math.round(performance.now() - start)); return tap(); }));
    }
    const results = await Promise.allSettled(fired);
    return { requestedMs: waits, sentAtMs: at, failed: results.filter(x => x.status === 'rejected').length };
  }

  async setting(key, value) {
    const choice = '[data-set="' + key + '"][data-val="' + value + '"]';
    if (!await this.visible(choice)) await this.click('button.lab-gear');
    await this.click(choice);
    if (key === 'lang') {
      await this.page.waitForFunction(code => document.documentElement.lang === code && !!window.__ptLib, value);
      await this.ready();
    } else if (await this.visible(choice)) {
      if (this.keyboard) await this.page.keyboard.press('Escape');
      else await this.click('button.lab-gear');
    }
  }

  async expand(publicOnly = false) {
    const dock = '.ms-dock-tab';
    if (await this.visible(dock)) await this.click(dock).catch(() => {});
    for (const section of publicOnly ? ['pub'] : ['pub', 'hid']) {
      const selector = '.ms-sec-' + section + ' > button[aria-expanded="false"]';
      if (await this.visible(selector)) await this.click(selector);
    }
  }

  async dismissWelcome() {
    if (await this.visible('.lab-welcome-skip')) await this.click('.lab-welcome-skip');
  }

  async status() {
    return this.evaluate(() => {
      const db = JSON.parse(localStorage.getItem('mdb') || '{}');
      return Object.entries(db.completions?.u1 || {}).map(([id, data]) => ({ id, stars: data.stars }));
    });
  }

  async testMission(id) {
    return this.evaluate(target => {
      const p = window.__persona;
      const m = p.lab?.all()[p.lab.module]?.find(x => x.id === target);
      if (!m) return { eventCount: p.count, meets: null };
      const mem = {};
      try { return { eventCount: p.count, meets: p.events.some(event => m.check(event, mem)) }; }
      catch { return { eventCount: p.count, meets: null }; }
    }, id);
  }
}

module.exports = { serve, openContext, Driver, deadline };
