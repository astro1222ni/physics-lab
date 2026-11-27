#!/usr/bin/env node
/*
 * lab-shot.cjs — 把實驗調到指定狀態後截圖，可將整批合成一張拼圖。
 *
 * 用法：node tools/lab-shot.cjs <代號>[,<代號>…] [選項]
 *   --size 412x780[,844x390,1280x800]  視窗大小（預設 412x780）
 *   --theme dark[,light]                深淺色（預設 dark）
 *   --lang zh|en|hans                    語言（預設 zh）
 *   --mode lab|learn|study|<網址參數>    預設 lab；study 對應 mode=learn&study=1
 *   --do "<頁面裡執行的 JS>"             載入後執行，可用 await
 *   --wait "<JS 條件式>"                 等到條件為真，逾時仍截圖
 *   --timeout <秒>                       條件等待上限（預設 8 秒）
 *   --scroll canvas|top|<CSS 選擇器>    截圖起點（預設畫布頂端）
 *   --full                              整頁截圖（預設一屏）
 *   --text "<CSS 選擇器>[,<選擇器>…]"    印出符合元素的文字，每個最多 200 字
 *   --keep-overlays                     保留登入歡迎提示與留言浮籤
 *   --out <資料夾>                       預設 .shots/lab-shot/
 *   --sheet [<檔名>]                     合成拼圖，預設輸出到截圖資料夾的 sheet.png
 *   -h                                  顯示用法
 *
 * 只用本機伺服器與假後端。拼圖需要裝有 Pillow 的 Python，可用 LAB_SHOTSHEET_PYTHON 指定。
 * 結束碼：0 成功；1 載入、執行或輸出失敗；2 參數錯誤。
 */
'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const LANGS = new Map([['zh', 'zh-Hant'], ['en', 'en'], ['hans', 'zh-Hans']]);
const MODES = new Map([['lab', 'mode=lab'], ['learn', 'mode=learn'], ['study', 'mode=learn&study=1']]);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary',
  '.m4a': 'audio/mp4', '.wasm': 'application/wasm',
};
class ParameterError extends Error {}

function parseArgs(args) {
  const opt = {
    size: '412x780', theme: 'dark', lang: 'zh', mode: 'lab', timeout: '8',
    scroll: 'canvas', out: path.join(ROOT, '.shots', 'lab-shot'),
  };
  const valued = new Set(['size', 'theme', 'lang', 'mode', 'do', 'wait', 'timeout', 'scroll', 'text', 'out']);
  let modules;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const name = arg.slice(2);
    if (arg.startsWith('--') && valued.has(name)) {
      const value = args[i + 1];
      // --do、--wait、--text 的值是程式碼或選擇器，可以 -- 開頭（11/27 Antigravity 複查【中】3）
      if (value === undefined || value === '' || (value.startsWith('--') && !['do', 'wait', 'text'].includes(name))) throw new Error(`${arg} 需要指定值`);
      opt[name] = value;
      i++;
    } else if (arg === '--full' || arg === '--keep-overlays') {
      opt[name] = true;
    } else if (arg.startsWith('--sheet=')) {
      opt.sheet = arg.slice(8) || 'sheet.png';
    } else if (arg === '--sheet') {
      // 後面接的是 .png 或路徑才當檔名；「--sheet kepler」的 kepler 是實驗代號（複查【中】3）
      const next = args[i + 1];
      opt.sheet = next && !next.startsWith('-') && (/\.png$/i.test(next) || /[\\/]/.test(next)) ? args[++i] : 'sheet.png';
    } else if (arg.startsWith('-') || modules !== undefined) {
      throw new Error(`不認得的參數 ${arg}`);
    } else {
      modules = arg;
    }
  }

  if (!modules) throw new Error('請指定至少一個實驗代號');
  const list = value => [...new Set(value.split(',').map(part => part.trim()))];
  opt.modules = list(modules);
  for (const slug of opt.modules) {
    if (!/^[a-z0-9][a-z0-9_-]*$/i.test(slug)) throw new Error(`無效的實驗代號「${slug}」`);
    if (!fs.statSync(path.join(ROOT, slug + '.html'), { throwIfNoEntry: false })?.isFile()) {
      throw new Error(`找不到頁面 ${slug}.html`);
    }
  }
  opt.sizes = list(opt.size).map(size => {
    if (!/^[1-9]\d*x[1-9]\d*$/.test(size)) throw new Error(`無效的視窗大小「${size}」`);
    const [width, height] = size.split('x').map(Number);
    if (![width, height].every(n => Number.isSafeInteger(n) && n <= 2 ** 31 - 1)) {
      throw new Error(`無效的視窗大小「${size}」`);
    }
    return { width, height };
  });
  opt.themes = list(opt.theme);
  if (opt.themes.some(theme => theme !== 'dark' && theme !== 'light')) throw new Error('深淺色須為 dark 或 light');
  if (!LANGS.has(opt.lang)) throw new Error('語言須為 zh、en 或 hans');
  opt.timeout = Number(opt.timeout) * 1000;
  if (!Number.isFinite(opt.timeout) || opt.timeout <= 0 || opt.timeout > 2 ** 31 - 1) {
    throw new Error('條件等待秒數須為正數且在計時器範圍內');
  }
  opt.query = MODES.get(opt.mode) ?? opt.mode;
  opt.out = path.resolve(opt.out);
  if (opt.sheet) opt.sheet = path.resolve(opt.out, opt.sheet);
  if (opt.wait) {
    try {
      new Function(`return (\n${opt.wait}\n)`);
    } catch {
      throw new Error('--wait 需要有效的 JavaScript 條件式');
    }
  }
  return opt;
}

function serveLocalFiles(req, res) {
  let file;
  try {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath.includes('\0')) throw new Error('網址路徑含有無效字元');
    file = path.resolve(ROOT, '.' + (urlPath.endsWith('/') ? urlPath + 'index.html' : urlPath));
  } catch {
    res.writeHead(400).end();
    return;
  }
  const rel = path.relative(ROOT, file);
  if (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) {
    res.writeHead(403).end();
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' }).end(data);
  });
}

async function capture(browser, origin, mock, opt, shot) {
  const { slug, viewport, theme, file } = shot;
  const mobile = viewport.width < 1000;
  const ctx = await browser.newContext({
    viewport, colorScheme: theme, hasTouch: mobile, isMobile: mobile, serviceWorkers: 'block',
  });
  const errs = [];
  const recordError = message => {
    if (errs.length < 5 && !/firebase|gstatic|ERR_|Failed to load resource/i.test(message)) {
      errs.push(message.replace(/\s+/g, ' ').trim());
    }
  };
  try {
    await ctx.addInitScript({ path: mock });
    await ctx.addInitScript(({ settings, keep }) => {
      localStorage.setItem('lab-settings', JSON.stringify(settings));
      if (!keep) localStorage.setItem('lab-welcome-v1', 'skip');
    }, { settings: { lang: LANGS.get(opt.lang), theme }, keep: opt['keep-overlays'] });
    await ctx.route(url => url.origin !== origin, route => route.abort());
    // 實驗所需資源一律從本機 HTTP 讀取，WebSocket 不對外開連線。
    if (!ctx.routeWebSocket) throw new Error('請使用支援 WebSocket 攔截的 Playwright 版本');
    await ctx.routeWebSocket('**/*', ws => ws.close());

    const page = await ctx.newPage();
    page.on('console', msg => { if (msg.type() === 'error') recordError(msg.text()); });
    page.on('pageerror', err => recordError(err.message));
    // 本機資源 404 不可被「Failed to load resource」過濾吃掉，另外記（複查【中】1）
    page.on('response', res => {
      if (res.url().startsWith(origin) && res.status() >= 400 && errs.length < 5) errs.push('HTTP ' + res.status() + ' ' + res.url().slice(origin.length));
    });
    const response = await page.goto(`${origin}/${slug}.html?${opt.query}`, { waitUntil: 'load', timeout: 30000 });
    if (!response?.ok()) throw new Error(`頁面載入失敗（HTTP ${response?.status() ?? '無回應'}）`);
    const selectors = { '--text': opt.text, '--scroll': ['top', 'canvas'].includes(opt.scroll) ? null : opt.scroll };
    if (Object.values(selectors).some(Boolean)) {
      const invalid = await page.evaluate(entries => {
        for (const [flag, selector] of entries) {
          if (!selector) continue;
          try {
            document.querySelector(selector);
          } catch {
            return flag;
          }
        }
        return null;
      }, Object.entries(selectors));
      if (invalid) throw new ParameterError(`${invalid} 的 CSS 選擇器無效`);
    }
    if (!opt['keep-overlays']) {
      await page.addStyleTag({ content: '.lab-welcome, .lab-welcome-box, .fb-tab { display: none !important; }' });
    }
    if (opt.do) {
      try {
        await page.evaluate(`(async () => {\n${opt.do}\n})()`);
      } catch (err) {
        throw new Error(`--do 執行失敗（${err.message.split('\n')[0]}）`);
      }
    }
    const twoFrames = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    if (opt.do) await twoFrames(); // 畫布多半在下一幀才重畫（複查【中】2）

    if (opt.wait) {
      try {
        const handle = await page.waitForFunction(`(\n${opt.wait}\n)`, undefined, { timeout: opt.timeout });
        await handle.dispose();
      } catch (err) {
        if (err.name !== 'TimeoutError') throw err;
        console.log(`⚠ 條件沒成立（${path.basename(file)}）`);
      }
    }

    const found = await page.evaluate(scroll => {
      if (scroll === 'top') {
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        return true;
      }
      if (scroll !== 'canvas') {
        const element = document.querySelector(scroll);
        element?.scrollIntoView({ block: 'start', behavior: 'instant' });
        return Boolean(element);
      }
      // 沿用 layout-audit.cjs 的直放畫布選法。沒有可見操作台時仍可找畫布。
      const deck = document.querySelector('.labdeck');
      const deckTop = deck?.getClientRects().length && getComputedStyle(deck).visibility !== 'hidden'
        ? deck.getBoundingClientRect().top : Infinity;
      // position:fixed 的畫布 offsetParent 是 null，改看 getClientRects（複查【中】4）
      const valid = c => c.getClientRects().length > 0 && getComputedStyle(c).visibility !== 'hidden' && c.clientHeight > 60;
      let canvas = [...document.querySelectorAll('.stage canvas')].find(valid);
      if (!canvas || canvas.getBoundingClientRect().top > deckTop) {
        canvas = [...document.querySelectorAll('canvas')]
          .filter(c => valid(c) && c.getBoundingClientRect().top < deckTop)
          .sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0];
      }
      // 橫放時操作台固定在頂端，可能沒有畫布在操作台上方。
      canvas ??= [...document.querySelectorAll('.stage canvas')].find(valid)
        ?? [...document.querySelectorAll('canvas')].filter(valid)
          .sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0];
      window.scrollTo({ top: canvas ? canvas.getBoundingClientRect().top + scrollY : 0, behavior: 'instant' });
      return Boolean(canvas);
    }, opt.scroll);
    if (!found) console.log(`⚠ 找不到捲動目標「${opt.scroll}」（${path.basename(file)}）`);
    await twoFrames();

    const strings = opt.text ? await page.evaluate(selectors => {
      const elements = [...document.querySelectorAll(selectors)];
      return elements.length ? elements.map(el => {
        const text = (el.innerText ?? '').replace(/\s+/g, ' ').trim();
        return Array.from(text).slice(0, 200).join('');
      }) : ['（找不到元素）'];
    }, opt.text) : [];
    await page.screenshot({ path: file, fullPage: Boolean(opt.full), scale: 'css' });
    console.log(`✓ ${file}`);
    for (const err of errs) console.log(`    錯誤 ${err}`);
    for (const value of strings) console.log(`    文字 ${opt.text}：${value}`);
  } finally {
    await ctx.close();
  }
}

function makeSheet(file, shots) {
  const helper = process.env.LAB_SHOTSHEET_SCRIPT || 'G:/Claude/tools/helper/shotsheet.py';
  const configured = process.env.LAB_SHOTSHEET_PYTHON;
  const candidates = configured ? [configured] : ['python', 'G:/個人核心知識庫/.venv/Scripts/python.exe'];
  const python = candidates.find(exe =>
    spawnSync(exe, ['-I', '-c', 'from PIL import Image; Image.Resampling.LANCZOS'], { windowsHide: true, timeout: 10000 }).status === 0);
  if (!python) throw new Error('找不到裝有 Pillow 的 Python，請用 LAB_SHOTSHEET_PYTHON 指定');
  const captions = shots.map(({ slug, viewport, theme }) =>
    `${slug} ${viewport.width}x${viewport.height} ${theme === 'dark' ? '深色' : '淺色'}`);
  const result = spawnSync(python, ['-I', helper, file, ...shots.map(shot => shot.file), '--label'],
    { stdio: 'inherit', windowsHide: true, env: { ...process.env, LAB_SHOTSHEET_CAPTIONS: JSON.stringify(captions) } });
  if (result.error || result.status !== 0) throw new Error('拼圖失敗');
}

function planShots(opt) {
  return opt.sizes.flatMap(viewport => opt.modules.flatMap(slug => opt.themes.map(theme => {
    const suffix = opt.lang === 'zh' ? '' : '_' + opt.lang;
    const file = path.join(opt.out, `${slug}_${viewport.width}x${viewport.height}_${theme}${suffix}.png`);
    return { slug, viewport, theme, file };
  })));
}

async function main() {
  if (process.argv.slice(2).some(a => a === '-h' || a === '--help')) { // 任何位置都認（複查【中】4）
    console.log(fs.readFileSync(__filename, 'utf8').split('/*')[1].split('*/')[0].trimEnd());
    return;
  }
  let opt, shots;
  try {
    opt = parseArgs(process.argv.slice(2));
    shots = planShots(opt);
    if (opt.sheet && shots.some(shot => shot.file.toLowerCase() === opt.sheet.toLowerCase())) {
      throw new Error('拼圖檔名與截圖重複');
    }
  } catch (err) {
    console.error(`參數錯誤：${err.message}`);
    process.exitCode = 2;
    return;
  }

  fs.mkdirSync(opt.out, { recursive: true });
  const server = http.createServer(serveLocalFiles);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const saved = [];
  let browser;
  try {
    const origin = 'http://127.0.0.1:' + server.address().port;
    const mock = path.join(__dirname, 'mock-backend.js');
    browser = await require('./browser.cjs').launch({ headless: true, args: ['--mute-audio'] });
    for (const shot of shots) {
      try {
        await capture(browser, origin, mock, opt, shot);
        saved.push(shot);
      } catch (err) {
        if (err instanceof ParameterError) {
          console.error(`參數錯誤：${err.message}`);
          process.exitCode = 2;
          return;
        }
        console.error(`✗ ${shot.file}\n    ${err.message}`);
        process.exitCode = 1;
      }
    }
  } finally {
    try {
      await browser?.close();
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  }
  if (opt.sheet && saved.length) makeSheet(opt.sheet, saved);
}

main().catch(err => {
  console.error(`執行失敗：${err.message}`);
  process.exitCode = 1;
});
