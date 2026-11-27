#!/usr/bin/env node
/*
 * 用法：node tools/padtest.cjs <代號…> [--width 412,1280] [--dark]
 * Windows 驗收請用共用 browser-lock.cjs run -- node tools/padtest.cjs … 排隊。
 * 以假後端載入本機實驗模式，攔截所有網路請求，只供應工作樹內的靜態檔。
 * 用共用 LabVPad 的 point 回呼讀目前選取點相對於畫布的 CSS px，
 * 分別確認 → 使 x 增加、↑ 使 y 減少，以及可用的中央格切換選取。
 * 單點站的停用中央格略過。未載入共用小鍵盤或預設模式隱藏者列為不適用。
 * 無不合格組別回 0，有不合格回 1，參數錯誤回 2。--dark 改用深色。
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { launch } = require('./browser.cjs');
const ROOT = path.resolve(__dirname, '..');
const ORIGIN = 'http://127.0.0.1';
const USAGE = '用法：node tools/padtest.cjs <代號…> [--width 412,1280] [--dark]';
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf'
};

function argumentsFor(args) {
  const slugs = [];
  let widths = [412, 1280], dark = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dark') dark = true;
    else if (arg === '--width') {
      const list = args[++i] || '';
      if (!/^\d+(?:,\d+)*$/.test(list)) throw new Error('--width 需要以逗號分隔的正整數');
      widths = list.split(',').map(Number);
      if (widths.some(w => !Number.isSafeInteger(w) || w < 1 || w > 10000)) throw new Error('寬度須介於 1 與 10000 px');
    } else if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(arg)) slugs.push(arg);
    else throw new Error('無效參數：' + arg);
  }
  if (!slugs.length) throw new Error('請指定至少一個站台代號');
  for (const slug of slugs) {
    if (!fs.existsSync(path.join(ROOT, slug + '.html'))) throw new Error('找不到頁面：' + slug);
  }
  return { slugs: [...new Set(slugs)], widths: [...new Set(widths)], dark };
}

async function serveLocal(route) {
  const url = new URL(route.request().url());
  if (url.origin !== ORIGIN) return route.abort('blockedbyclient');
  let file;
  try {
    const relative = decodeURIComponent(url.pathname).slice(1);
    if (relative.split(/[\\/]/).some(part => part.startsWith('.')) || /[:\\]/.test(relative)) {
      return route.fulfill({ status: 404, body: '' });
    }
    file = await fs.promises.realpath(path.resolve(ROOT, relative));
    if (!file.toLowerCase().startsWith((ROOT + path.sep).toLowerCase()) || !(await fs.promises.stat(file)).isFile()) {
      return route.fulfill({ status: 404, body: '' });
    }
  } catch {
    return route.fulfill({ status: 404, body: '' });
  }
  return route.fulfill({ path: file, contentType: MIME[path.extname(file)] || 'application/octet-stream' });
}

function observePad(theme) {
  localStorage.setItem('lab-settings', JSON.stringify({ theme, lang: 'zh-Hant', fs: 1 }));
  localStorage.setItem('lab-welcome-v1', 'skip');
  const states = new Map();
  Object.defineProperty(window, 'LabVPad', {
    configurable: true,
    set(api) {
      const mount = api.mount;
      api.mount = function (options) {
        const pad = mount.call(this, options);
        states.set(pad.element, options);
        return pad;
      };
      Object.defineProperty(window, 'LabVPad', { configurable: true, writable: true, value: api });
    }
  });
  window.preparePadTest = async () => {
    const mounted = [...states.keys()].filter(element => element.isConnected);
    const current = mounted.find(element => !element.hidden);
    states.get(current)?.canvas?.scrollIntoView({ block: 'center', behavior: 'instant' });
    // 捲動畫布後，讓小鍵盤完成位置和可見性的更新。
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return { loaded: typeof window.LabVPad?.mount === 'function', mounted: mounted.length };
  };
  window.readPadTest = element => {
    const options = states.get(element);
    const selected = options?.selected();
    const point = options?.point(selected);
    const canvas = options?.canvas?.getBoundingClientRect();
    const center = element.querySelector('.vpad-select');
    return {
      x: point && canvas ? point.x - canvas.left : null,
      y: point && canvas ? point.y - canvas.top : null,
      selected, center: center?.textContent.trim(), label: center?.getAttribute('aria-label')
    };
  };
}

async function testPad(browser, slug, width, dark) {
  const context = await browser.newContext({
    viewport: { width, height: width < 600 ? 780 : 800 }, hasTouch: width < 600,
    colorScheme: dark ? 'dark' : 'light', serviceWorkers: 'block'
  });
  const errors = [], reasons = [], readings = [];
  let notApplicable, singlePoint = false;
  let stage = '載入頁面';
  try {
    await context.route('**/*', serveLocal);
    await context.routeWebSocket('**/*', socket => socket.close());
    await context.addInitScript(observePad, dark ? 'dark' : 'light');
    await context.addInitScript({ path: path.join(ROOT, 'tools/mock-backend.js') });
    const page = await context.newPage();
    page.setDefaultTimeout(3500);
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() !== 'error') return;
      const location = message.location().url;
      if (/^https?:/.test(location) && new URL(location).origin !== ORIGIN &&
          /net::ERR_BLOCKED_BY_CLIENT/.test(message.text())) return;
      errors.push(message.text());
    });
    const response = await page.goto(ORIGIN + '/' + slug + '.html?mode=lab', { timeout: 12000 });
    if (!response?.ok()) throw new Error('HTTP ' + (response?.status() ?? '無回應'));
    const { loaded, mounted } = await page.evaluate(() => window.preparePadTest());
    const pad = page.locator('.lab-vpad:visible').first();
    if (!loaded && !mounted && !await pad.isVisible()) notApplicable = '未載入共用小鍵盤';
    else if (!mounted) reasons.push('已載入共用元件但未掛載小鍵盤');
    else if (!await pad.isVisible()) notApplicable = '預設模式未顯示小鍵盤';
    else {
      const read = async label => {
        const value = await pad.evaluate(element => window.readPadTest(element));
        readings.push({ label, ...value });
        if (!Number.isFinite(value.x) || !Number.isFinite(value.y)) throw new Error('讀不到點的座標');
        return value;
      };
      const press = selector => {
        const button = pad.locator(selector);
        return width < 600 ? button.tap() : button.click();
      };
      stage = '展開小鍵盤';
      if (!await pad.locator('.vpad-body').isVisible()) {
        await press('.vpad-launch');
        await pad.locator('.vpad-body').waitFor({ state: 'visible' });
      }
      const initial = await read('展開後');
      stage = '→ 鍵';
      await press('[data-direction="5"]');
      const right = await read('按 → 後');
      if (right.x - initial.x <= 1e-7) reasons.push('→ 未使 x 增加');
      stage = '↑ 鍵';
      await press('[data-direction="1"]');
      const up = await read('按 ↑ 後');
      if (up.y - right.y >= -1e-7) reasons.push('↑ 未使 y 減少');
      stage = '中央格';
      singlePoint = await pad.locator('.vpad-select').isDisabled();
      if (!singlePoint) {
        await press('.vpad-select');
        const switched = await read('切換後');
        if (up.selected === switched.selected && up.label === switched.label && up.center === switched.center) {
          reasons.push('中央格未切換目標');
        }
      }
    }
  } catch (error) {
    reasons.push(stage + '操作失敗');
    errors.push(error.message);
  } finally {
    await context.close();
  }
  if (errors.length && !reasons.length) reasons.push('主控台有錯誤');
  return { reasons, readings, errors, notApplicable: reasons.length ? undefined : notApplicable, singlePoint };
}

async function main({ slugs, widths, dark }) {
  const browser = await launch({ args: ['--mute-audio', '--disable-background-networking'] });
  let passed = 0, failed = 0, skipped = 0;
  const skippedSites = new Set();
  try {
    for (const slug of slugs) {
      for (const width of widths) {
        const { reasons, readings, errors, notApplicable, singlePoint } = await testPad(browser, slug, width, dark);
        const label = slug + ' ' + width + ' px ';
        if (reasons.length) {
          failed++;
          console.log(label + '不合格（' + reasons.join('、') + '）');
          for (const r of readings) {
            console.log('  ' + r.label + ' ' + (r.center || r.selected || '') + ' (' +
              (r.x?.toFixed(3) ?? '?') + ', ' + (r.y?.toFixed(3) ?? '?') + ')');
          }
          for (const error of new Set(errors)) console.log('  ' + error.replace(/\s+/g, ' '));
        } else if (notApplicable) {
          skipped++;
          skippedSites.add(slug);
          console.log(label + '不適用（' + notApplicable + '）');
        } else {
          passed++;
          const [a, b, c, d] = readings;
          const pos = r => '(' + r.x.toFixed(3) + ', ' + r.y.toFixed(3) + ')';
          const center = singlePoint ? '單點（中央格停用）' :
            '中央格 ' + (c.center || c.selected) + ' → ' + (d.center || d.selected);
          console.log(label + '合格（→/↑ ' + pos(a) + ' → ' + pos(b) + ' → ' + pos(c) +
            '，' + center + '，主控台 0 錯誤）');
        }
      }
    }
  } finally {
    await browser.close();
  }
  console.log('共 ' + (passed + failed + skipped) + ' 組（合格 ' + passed +
    '，不合格 ' + failed + '，不適用 ' + skipped + ' 組／' + skippedSites.size + ' 站）');
  return failed ? 1 : 0;
}

async function cli(args) {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(USAGE + '\n以指定寬度檢查共用小鍵盤的 →、↑ 與中央格。\n' +
      '無不合格回 0，有不合格回 1，參數錯誤回 2。');
    return 0;
  }
  let options;
  try { options = argumentsFor(args); }
  catch (error) {
    console.error(error.message);
    console.error(USAGE);
    return 2;
  }
  return main(options);
}

if (require.main === module) {
  cli(process.argv.slice(2)).then(code => { process.exitCode = code; }).catch(error => {
    console.error('無法完成小鍵盤測試：' + error.message);
    process.exitCode = 1;
  });
}

module.exports = { testPad };
