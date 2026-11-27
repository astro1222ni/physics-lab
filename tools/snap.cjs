#!/usr/bin/env node
/*
 * snap.cjs — 實驗頁前後快照比對工具（人文串提出，整合兩版雛形為全站通用版）。
 *
 * 用途：改版或重構前後，在多種視窗尺寸下對單一實驗頁擷取「讀數欄位文字、控制項值、
 *       任務事件紀錄（LabMission.emit）與主畫布雜湊（SHA-256）」，自動抓出前後差異。
 *
 * 用法：
 *   node tools/snap.cjs <代號> before|after [選項]
 *
 * 選項：
 *   --sizes 412x915,844x390,1280x800   指定視窗尺寸清單（寬x高，逗號分隔）
 *   --out <資料夾>                      快照輸出資料夾（預設 F:\測試暫存\snap\<代號>\）
 *   --lang zh-Hant|zh-Hans|en          語言（預設 zh-Hant）
 *   --theme auto|light|dark            主題（預設 auto：寬 >= 1000 用淺色，窄螢幕用深色）
 *   --query <k=v&...>                  附加網址查詢參數（例如 mode=lab）
 *   --wait <毫秒>                       字型就緒後最少等待時間（預設 450，並會持續等到排版與畫布尺寸連續穩定）
 *   --canvas <CSS 選擇器>              手動指定主畫布（預設自動偵測最大可見 canvas）
 *   --do <動作>                         擷取前執行的操作（可重複多次）：
 *                                        set:<selector>=<value>   設定滑桿／輸入框／下拉選單
 *                                        click:<selector>         點擊按鈕或核取方塊
 *                                        wait:<ms>                等待毫秒
 *                                        eval:<js>                於頁面執行運算式
 *   --no-replay                        after 時不沿用 before 紀錄的 --do 操作，改測未操作原狀
 *   --replay-eval                      明確授權 after 重播 before 中紀錄的 eval: 操作
 *   --shots                            同時輸出各尺寸 PNG 截圖至快照資料夾
 *   --headed                           有視窗模式（仍固定帶 --mute-audio）
 *   --json                             以 JSON 格式輸出結果
 *
 * 安全與測試規範：
 *   - 啟動本機 127.0.0.1 靜態伺服器，所有外部 HTTP/HTTPS 與 WebSocket 連線一律攔截關閉（絕不寫正式 Firebase）。
 *   - 載入 tools/mock-backend.js 假後端，預設 localStorage.setItem('lab-welcome-v1', 'skip')。
 *   - 透過 tools/browser.cjs 啟動 Chromium（沿用全機 3 位排隊鎖、Intel 內顯、低優先權與 --mute-audio）。
 *   - 快照預設存放於 F:\測試暫存\snap\<代號>\，不污染 git 存放庫。
 *
 * 結束碼：
 *   0 = before 成功，或 after 與 before 無差異
 *   1 = after 與 before 有差異
 *   2 = 參數錯誤、頁面不存在、找不到 before 快照、跨站比對、未授權重播 eval、版面未穩定或執行失敗
 */
'use strict';

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_SIZES = '412x915,844x390,1280x800';
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8'
};

const USAGE = [
  '用法：node tools/snap.cjs <代號> before|after [--sizes 412x915,844x390,1280x800] [--out <資料夾>]',
  '常用選項：--lang zh-Hant|zh-Hans|en  --theme auto|light|dark  --query k=v  --wait 450',
  '          --canvas <selector>  --do set:#id=val  --do click:#btn  --no-replay  --replay-eval',
  '          --shots  --headed  --json'
].join('\n');

function parseSizes(spec) {
  const parts = String(spec || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!parts.length) return { error: '--sizes 不可為空。' };
  const list = [];
  const seen = new Set();
  for (const p of parts) {
    const m = /^(\d+)x(\d+)$/i.exec(p);
    if (!m) return { error: '無效的尺寸格式（應為 寬x高，例如 412x915）：' + p };
    const width = Number(m[1]);
    const height = Number(m[2]);
    if (width < 100 || height < 100 || width > 5000 || height > 5000) {
      return { error: '尺寸超出合理範圍（100–5000）：' + p };
    }
    const key = `${width}x${height}`;
    if (!seen.has(key)) {
      seen.add(key);
      list.push({ width, height, key });
    }
  }
  return { sizes: list };
}

function parseDoAction(raw) {
  const s = String(raw || '');
  if (s.startsWith('set:')) {
    const rest = s.slice(4);
    const eq = rest.indexOf('=');
    if (eq <= 0) return { error: '--do set 格式應為 set:<selector>=<value>：' + raw };
    return { action: { kind: 'set', selector: rest.slice(0, eq).trim(), value: rest.slice(eq + 1) } };
  }
  if (s.startsWith('click:')) {
    const sel = s.slice(6).trim();
    if (!sel) return { error: '--do click 缺少選擇器：' + raw };
    return { action: { kind: 'click', selector: sel } };
  }
  if (s.startsWith('wait:')) {
    const ms = Number(s.slice(5));
    if (!Number.isFinite(ms) || ms < 0 || ms > 60000) return { error: '--do wait 毫秒數不合法：' + raw };
    return { action: { kind: 'wait', ms } };
  }
  if (s.startsWith('eval:')) {
    const code = s.slice(5);
    if (!code.trim()) return { error: '--do eval 不可為空。' };
    return { action: { kind: 'eval', code } };
  }
  return { error: '不支援的 --do 動作（僅支援 set: / click: / wait: / eval:）：' + raw };
}

function serializeAction(act) {
  if (!act || typeof act !== 'object') return String(act || '');
  if (act.kind === 'set') return `set:${act.selector}=${act.value}`;
  if (act.kind === 'click') return `click:${act.selector}`;
  if (act.kind === 'wait') return `wait:${act.ms}`;
  if (act.kind === 'eval') return `eval:${act.code}`;
  return JSON.stringify(act);
}

function extractActionStrings(doc) {
  if (!doc) return [];
  if (Array.isArray(doc.actionsRaw) && doc.actionsRaw.length) return doc.actionsRaw.slice();
  if (Array.isArray(doc.actions) && doc.actions.length) return doc.actions.map(serializeAction);
  return [];
}

function defaultOutDir(slug) {
  if (process.platform === 'win32' && fs.existsSync('F:\\')) {
    return path.join('F:\\測試暫存\\snap', slug);
  }
  return path.join(os.tmpdir(), 'physics-lab-snap', slug);
}

function parseArgs(argv) {
  const pos = [];
  let sizesRaw = null;
  let outDir = null;
  let lang = null;
  let theme = null;
  let query = null;
  let waitMs = 450;
  let canvasSel = null;
  let shots = false;
  let headed = false;
  let json = false;
  let noReplay = false;
  let replayEval = false;
  let help = false;
  const actions = [];
  const actionsRaw = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') {
      help = true;
    } else if (a === '--shots') {
      shots = true;
    } else if (a === '--headed') {
      headed = true;
    } else if (a === '--json') {
      json = true;
    } else if (a === '--no-replay') {
      noReplay = true;
    } else if (a === '--replay-eval') {
      replayEval = true;
    } else if (a === '--sizes' || a.startsWith('--sizes=')) {
      const v = a.includes('=') ? a.slice(8) : argv[i + 1];
      if (!a.includes('=')) { if (i + 1 >= argv.length) return { error: '--sizes 缺少參數值。' }; i++; }
      sizesRaw = v;
    } else if (a === '--out' || a.startsWith('--out=')) {
      const v = a.includes('=') ? a.slice(6) : argv[i + 1];
      if (!a.includes('=')) { if (i + 1 >= argv.length) return { error: '--out 缺少參數值。' }; i++; }
      outDir = v;
    } else if (a === '--lang' || a.startsWith('--lang=')) {
      const v = a.includes('=') ? a.slice(7) : argv[i + 1];
      if (!a.includes('=')) { if (i + 1 >= argv.length) return { error: '--lang 缺少參數值。' }; i++; }
      if (!['zh-Hant', 'zh-Hans', 'en'].includes(v)) return { error: '--lang 僅支援 zh-Hant、zh-Hans、en：' + v };
      lang = v;
    } else if (a === '--theme' || a.startsWith('--theme=')) {
      const v = a.includes('=') ? a.slice(8) : argv[i + 1];
      if (!a.includes('=')) { if (i + 1 >= argv.length) return { error: '--theme 缺少參數值。' }; i++; }
      if (!['auto', 'light', 'dark'].includes(v)) return { error: '--theme 僅支援 auto、light、dark：' + v };
      theme = v;
    } else if (a === '--query' || a.startsWith('--query=')) {
      const v = a.includes('=') ? a.slice(8) : argv[i + 1];
      if (!a.includes('=')) { if (i + 1 >= argv.length) return { error: '--query 缺少參數值。' }; i++; }
      query = v.replace(/^\?/, '');
    } else if (a === '--wait' || a.startsWith('--wait=')) {
      const v = a.includes('=') ? a.slice(7) : argv[i + 1];
      if (!a.includes('=')) { if (i + 1 >= argv.length) return { error: '--wait 缺少參數值。' }; i++; }
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > 60000) return { error: '--wait 必須是 0–60000 的數字：' + v };
      waitMs = n;
    } else if (a === '--canvas' || a.startsWith('--canvas=')) {
      const v = a.includes('=') ? a.slice(9) : argv[i + 1];
      if (!a.includes('=')) { if (i + 1 >= argv.length) return { error: '--canvas 缺少參數值。' }; i++; }
      canvasSel = v;
    } else if (a === '--do' || a.startsWith('--do=')) {
      const v = a.includes('=') ? a.slice(5) : argv[i + 1];
      if (!a.includes('=')) { if (i + 1 >= argv.length) return { error: '--do 缺少參數值。' }; i++; }
      const parsedDo = parseDoAction(v);
      if (parsedDo.error) return parsedDo;
      actions.push(parsedDo.action);
      actionsRaw.push(v);
    } else if (a.startsWith('-')) {
      return { error: '不認得的選項：' + a };
    } else {
      pos.push(a);
    }
  }

  if (help) return { help: true };
  if (noReplay && actions.length > 0) {
    return { error: '--no-replay 與 --do 不可同時使用。' };
  }
  if (noReplay && replayEval) {
    return { error: '--no-replay 與 --replay-eval 不可同時使用。' };
  }
  if (pos.length !== 2) return { error: '必須提供 <代號> 與 before|after 兩個位置參數。' };

  const slug = pos[0].replace(/\.html$/i, '');
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(slug)) {
    return { error: '實驗代號格式不合法：' + pos[0] };
  }
  const mode = pos[1];
  if (mode !== 'before' && mode !== 'after') {
    return { error: '第二個參數必須是 before 或 after（收到：' + mode + '）。' };
  }

  let sizes = null;
  if (sizesRaw !== null) {
    const sp = parseSizes(sizesRaw);
    if (sp.error) return sp;
    sizes = sp.sizes;
  }

  return {
    slug,
    mode,
    sizes,
    outDir: outDir ? path.resolve(outDir) : defaultOutDir(slug),
    lang,
    theme,
    query,
    waitMs,
    canvasSel,
    actions,
    actionsRaw,
    noReplay,
    replayEval,
    shots,
    headed,
    json
  };
}

/**
 * 決定 after 要執行的 --do 操作條件：
 * - 若顯式指定 --no-replay，回空陣列。
 * - 若顯式指定 --do，採用本次指定的操作。
 * - 若皆未指定而 before 紀錄了操作：
 *   - 含 eval: 且未加 --replay-eval 時拒絕自動執行（回 error，CLI 結束碼 2）。
 *   - 其餘自動重播 before 操作，避免起始狀態不同造成假改版差異。
 */
function resolveAfterActions(parsed, beforeDoc) {
  const beforeActions = beforeDoc && Array.isArray(beforeDoc.actions) ? beforeDoc.actions : [];
  const beforeActionsRaw = extractActionStrings(beforeDoc);

  if (parsed.noReplay) {
    return { actions: [], actionsRaw: [], replayedFromBefore: false };
  }
  if (parsed.actions && parsed.actions.length > 0) {
    return {
      actions: parsed.actions,
      actionsRaw: parsed.actionsRaw && parsed.actionsRaw.length ? parsed.actionsRaw : parsed.actions.map(serializeAction),
      replayedFromBefore: false
    };
  }
  if (beforeActions.length === 0) {
    return { actions: [], actionsRaw: [], replayedFromBefore: false };
  }
  const hasEval = beforeActions.some(a => a && a.kind === 'eval');
  if (hasEval && !parsed.replayEval) {
    return {
      error: [
        `before 快照紀錄了 eval: 操作（${beforeActionsRaw.join(' ; ')}），基於安全不會自動重播。`,
        '若確認要重播，請加上 --replay-eval；若要改測未操作原狀，請加上 --no-replay；或直接傳入 --do 覆寫。'
      ].join('\n')
    };
  }
  return {
    actions: beforeActions,
    actionsRaw: beforeActionsRaw,
    replayedFromBefore: true
  };
}

function resolvePagePath(root, slug) {
  const pageFile = path.resolve(root, slug + '.html');
  if (!pageFile.startsWith(path.resolve(root) + path.sep) || !fs.existsSync(pageFile)) {
    return null;
  }
  return pageFile;
}

/** 將事件資料轉為穩定可比對的純資料（移除函式與非決定性時間戳欄位）。 */
function sanitizeEventData(val, depth) {
  if (depth > 8) return '[depth]';
  if (val === null || val === undefined) return val;
  if (typeof val === 'function') return undefined;
  if (typeof val === 'number') {
    if (Number.isNaN(val)) return 'NaN';
    if (!Number.isFinite(val)) return val > 0 ? 'Infinity' : '-Infinity';
    return val;
  }
  if (typeof val !== 'object') return val;
  if (Array.isArray(val)) return val.map(v => sanitizeEventData(v, depth + 1));
  const out = {};
  for (const k of Object.keys(val).sort()) {
    if (k === 'at' || k === 'ts' || k === 'timestamp') continue;
    const sv = sanitizeEventData(val[k], depth + 1);
    if (sv !== undefined) out[k] = sv;
  }
  return out;
}

function startStaticServer(root) {
  const absRoot = path.resolve(root);
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let pathname;
      try {
        pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
      } catch (e) {
        res.writeHead(400);
        res.end();
        return;
      }
      const rel = pathname.endsWith('/') ? pathname + 'index.html' : pathname;
      const file = path.resolve(absRoot, '.' + rel);
      if (!file.startsWith(absRoot + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404);
        res.end();
        return;
      }
      const ext = path.extname(file).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': 'no-store'
      });
      fs.createReadStream(file).pipe(res);
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${addr.port}/` });
    });
  });
}

async function runAction(page, action) {
  if (action.kind === 'wait') {
    await page.waitForTimeout(action.ms);
    return;
  }
  if (action.kind === 'eval') {
    await page.evaluate(code => (0, eval)(code), action.code);
    return;
  }
  if (action.kind === 'click') {
    await page.evaluate(sel => {
      const el = document.querySelector(sel);
      if (!el) throw new Error('找不到元素：' + sel);
      const pane = el.closest('.labdeck-pane');
      if (pane && pane.parentElement) {
        const idx = Array.prototype.indexOf.call(pane.parentElement.children, pane);
        const tab = document.querySelectorAll('.labdeck-tabs button')[idx];
        if (tab) tab.click();
      }
    }, action.selector);
    await page.locator(action.selector).first().click({ timeout: 5000 });
    return;
  }
  if (action.kind === 'set') {
    const info = await page.evaluate(([sel, val]) => {
      const el = document.querySelector(sel);
      if (!el) return { error: '找不到元素：' + sel };
      const pane = el.closest('.labdeck-pane');
      if (pane && pane.parentElement) {
        const idx = Array.prototype.indexOf.call(pane.parentElement.children, pane);
        const tab = document.querySelectorAll('.labdeck-tabs button')[idx];
        if (tab) tab.click();
      }
      if (el.tagName === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio')) {
        el.checked = val === 'true' || val === '1' || val === 'on';
      } else {
        if (window.LabNum && typeof window.LabNum.set === 'function' && el.type === 'range') {
          window.LabNum.set(el, Number(val));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return { ok: true };
        }
        el.value = val;
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return { ok: true };
    }, [action.selector, action.value]);
    if (info && info.error) throw new Error(info.error);
  }
}

/**
 * 量測目前頁面的操作台模式、舞台容器與主畫布尺寸，用於等待排版完全收斂（避免 labdeck 180 ms 多輪 fit 造成抖動）。
 */
async function measureLayout(page, canvasSel) {
  return page.evaluate(sel => {
    const SKIP = '.stats-bar, .lab-set-panel, footer, #comments, .comments, .ms-wrap, .ms-celebrate, .ach-toast, .lab-account, .labside-rail, .labside-drawer';
    const skip = el => !el || !!el.closest(SKIP);

    let cv = sel ? document.querySelector(sel) : null;
    if (!cv) {
      const preferred = ['#cv', '#wheelCanvas', '#scene canvas', '.stage canvas'];
      for (const s of preferred) {
        const cand = document.querySelector(s);
        if (cand && cand.tagName === 'CANVAS' && !skip(cand)) {
          const r = cand.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) { cv = cand; break; }
        }
      }
    }
    if (!cv) {
      let bestArea = 0;
      document.querySelectorAll('canvas').forEach(c => {
        if (skip(c)) return;
        const r = c.getBoundingClientRect();
        const area = r.width * r.height;
        if (area > bestArea) {
          bestArea = area;
          cv = c;
        }
      });
    }

    const stage = document.querySelector('.stage, #stage, .stage-wrap');
    const stRect = stage ? stage.getBoundingClientRect() : null;
    const cvRect = cv ? cv.getBoundingClientRect() : null;
    const deckW = getComputedStyle(document.documentElement).getPropertyValue('--deck-w').trim() || null;

    return {
      deckMode: window.LabDeck && window.LabDeck.mode ? String(window.LabDeck.mode) : null,
      rootClass: document.documentElement.className || '',
      deckW,
      stageW: stRect ? Math.round(stRect.width) : null,
      stageH: stRect ? Math.round(stRect.height) : null,
      hasCanvas: !!cv || document.querySelectorAll('canvas').length > 0,
      cvSel: cv ? (cv.id ? '#' + cv.id : 'canvas') : null,
      cvW: cv ? cv.width : null,
      cvH: cv ? cv.height : null,
      cvCssW: cvRect ? Math.round(cvRect.width) : null,
      cvCssH: cvRect ? Math.round(cvRect.height) : null
    };
  }, canvasSel);
}

/**
 * 等待頁面操作台模式、舞台寬高與主畫布尺寸連續穩定（跨度 >= 390 ms，涵蓋 labdeck.js 多輪 180 ms fitSoon）
 * 並再驗證 2 幀 rAF 後仍無變動；逾時未穩定時拋出含歷次尺寸變動的診斷錯誤（CLI 回結束碼 2）。
 */
async function waitForStableLayout(page, canvasSel, opts) {
  const minWaitMs = Math.max(0, Number(opts.minWaitMs) || 0);
  const pollMs = 130;
  const requiredSteady = 4; // 連續 4 次共跨 390 ms（> 2 倍 labdeck.js 180 ms fitSoon）
  const timeoutMs = Math.max(5000, minWaitMs + 4000);
  const startedAt = Date.now();

  let lastSig = null;
  let steady = 0;
  const history = [];

  while (Date.now() - startedAt < timeoutMs) {
    const snap = await measureLayout(page, canvasSel);
    const sig = JSON.stringify(snap);
    const canvasReady = !snap.hasCanvas || (snap.cvW > 0 && snap.cvH > 0 && snap.cvCssW > 0 && snap.cvCssH > 0);

    if (sig !== lastSig) {
      lastSig = sig;
      steady = canvasReady ? 1 : 0;
      if (history.length < 15) {
        history.push({ t: Date.now() - startedAt, deckMode: snap.deckMode, deckW: snap.deckW, stageW: snap.stageW, cvW: snap.cvW, cvH: snap.cvH, cvCssW: snap.cvCssW, cvCssH: snap.cvCssH });
      }
    } else if (canvasReady) {
      steady++;
    }

    const elapsed = Date.now() - startedAt;
    if (steady >= requiredSteady && elapsed >= minWaitMs) {
      // 等 2 幀 rAF 並覆核，確保不會剛好在最後一幀切尺寸
      await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
      const confirm = await measureLayout(page, canvasSel);
      if (JSON.stringify(confirm) === sig) {
        return {
          deckMode: confirm.deckMode,
          deckW: confirm.deckW,
          stageW: confirm.stageW,
          stageH: confirm.stageH,
          cvCssW: confirm.cvCssW,
          cvCssH: confirm.cvCssH
        };
      }
      lastSig = JSON.stringify(confirm);
      steady = 1;
      if (history.length < 15) {
        history.push({ t: Date.now() - startedAt, deckMode: confirm.deckMode, deckW: confirm.deckW, stageW: confirm.stageW, cvW: confirm.cvW, cvH: confirm.cvH, cvCssW: confirm.cvCssW, cvCssH: confirm.cvCssH });
      }
    }

    await page.waitForTimeout(pollMs);
  }

  throw new Error(
    `版面與畫布尺寸於 ${timeoutMs} ms 內未收斂穩定（${opts.slug} ${opts.sizeKey}），已停止快照以避免誤報。歷次量測：${JSON.stringify(history)}`
  );
}

async function captureOneSize(browser, baseUrl, opts, size, root) {
  const scheme = opts.theme === 'dark' ? 'dark' : opts.theme === 'light' ? 'light' : (size.width >= 1000 ? 'light' : 'dark');
  const ctx = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    colorScheme: scheme,
    serviceWorkers: 'block',
    reducedMotion: 'reduce',
    deviceScaleFactor: 1,
    locale: 'zh-TW',
    timezoneId: 'Asia/Taipei'
  });

  const pageErrors = [];
  try {
    await ctx.route(u => !u.href.startsWith(baseUrl), route => route.abort());
    if (typeof ctx.routeWebSocket !== 'function') {
      throw new Error('目前 Playwright 環境不支援 context.routeWebSocket，無法保證封鎖外部 WebSocket 連線，已停止快照。');
    }
    const baseParsed = new URL(baseUrl);
    await ctx.routeWebSocket(/.*/, ws => {
      try {
        const u = new URL(ws.url());
        if (u.hostname !== baseParsed.hostname || u.port !== baseParsed.port) {
          ws.close();
        } else {
          ws.connectToServer();
        }
      } catch (e) {
        ws.close();
      }
    });

    await ctx.addInitScript(({ lang, theme }) => {
      try {
        localStorage.setItem('lab-settings', JSON.stringify({ lang, theme, fs: 1 }));
        localStorage.setItem('lab-welcome-v1', 'skip');
      } catch (e) { /* 忽略 */ }
      window.__snapEvents = [];
      window.__snapHooked = false;
      function hookMission() {
        if (window.__snapHooked || !window.LabMission || typeof window.LabMission.emit !== 'function') return;
        window.__snapHooked = true;
        const orig = window.LabMission.emit.bind(window.LabMission);
        window.LabMission.emit = function (type, data) {
          try {
            window.__snapEvents.push({ type, data });
            if (window.__snapEvents.length > 200) window.__snapEvents.shift();
          } catch (e) { /* 忽略 */ }
          return orig(type, data);
        };
      }
      document.addEventListener('DOMContentLoaded', hookMission, true);
      window.addEventListener('load', hookMission, true);
    }, { lang: opts.lang, theme: opts.theme });
    await ctx.addInitScript({ path: path.join(root, 'tools', 'mock-backend.js') });

    const page = await ctx.newPage();
    page.setDefaultTimeout(8000);
    page.on('pageerror', e => pageErrors.push(e && e.message ? e.message : String(e)));

    const params = new URLSearchParams(opts.query || '');
    if (opts.lang && opts.lang !== 'zh-Hant' && !params.has('lang')) params.set('lang', opts.lang);
    const qs = params.toString();
    const url = `${baseUrl}${opts.slug}.html${qs ? '?' + qs : ''}`;

    await page.goto(url, { waitUntil: 'load' });
    await page.evaluate(async () => {
      if (window.LabMission && typeof window.LabMission.emit === 'function' && !window.__snapHooked) {
        window.__snapHooked = true;
        const orig = window.LabMission.emit.bind(window.LabMission);
        window.LabMission.emit = function (type, data) {
          try { window.__snapEvents.push({ type, data }); } catch (e) { /* 忽略 */ }
          return orig(type, data);
        };
      }
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      // 讓 LabDeck（若有）完整完成一次初始排版再收斂
      if (window.LabDeck && typeof window.LabDeck.fit === 'function') {
        try { window.LabDeck.fit(); } catch (e) { /* 忽略 */ }
      }
      window.dispatchEvent(new Event('resize'));
    });

    let layout = await waitForStableLayout(page, opts.canvasSel, {
      minWaitMs: opts.waitMs,
      slug: opts.slug,
      sizeKey: size.key
    });

    for (const act of opts.actions || []) {
      await runAction(page, act);
    }
    if (opts.actions && opts.actions.length) {
      layout = await waitForStableLayout(page, opts.canvasSel, {
        minWaitMs: Math.max(250, Math.min(opts.waitMs, 600)),
        slug: opts.slug,
        sizeKey: size.key
      });
    }

    // 擷取讀數、控制項、事件與主畫布
    const raw = await page.evaluate(canvasSel => {
      const SKIP = '.stats-bar, .lab-set-panel, footer, #comments, .comments, .ms-wrap, .ms-celebrate, .ach-toast, .lab-account, .labside-rail, .labside-drawer';
      const norm = s => String(s || '').replace(/\s+/g, ' ').trim();
      const skip = el => !el || !!el.closest(SKIP);

      const readings = {};
      const addReading = (key, el) => {
        if (!el || skip(el)) return;
        const txt = norm(el.textContent);
        readings[key] = txt;
      };

      // 1. 有明確 id 的讀數欄位
      const idTargets = document.querySelectorAll(
        'dd[id], output[id], td[id], #status, #srNow, #dialIndex, #stageHint, #gesture, #pairResult, #comparison, #bigChar, #bigTone, #bigGloss, #feedback, #cvHint, .readout [id], .metrics [id], .gz-read [id], .kpi [id]'
      );
      idTargets.forEach(el => {
        if (!el.id || skip(el)) return;
        addReading('#' + el.id, el);
      });

      // 2. 無 id 的讀數容器（.metrics .metric、.readout dl、.gz-read）
      document.querySelectorAll('.metrics .metric').forEach((box, idx) => {
        if (skip(box)) return;
        const k = norm(box.querySelector('span')?.textContent) || ('metric-' + idx);
        const v = norm(box.querySelector('strong')?.textContent);
        readings['metric:' + k] = v;
      });
      document.querySelectorAll('dl.readout, dl.gz-read').forEach(dl => {
        if (skip(dl)) return;
        const dts = dl.querySelectorAll('dt');
        dts.forEach(dt => {
          const dd = dt.nextElementSibling;
          if (!dd || dd.tagName !== 'DD' || dd.id) return;
          const k = norm(dt.textContent);
          if (k) readings['dl:' + k] = norm(dd.textContent);
        });
      });

      // 3. 控制項目前值
      const controls = {};
      document.querySelectorAll('input, select').forEach(el => {
        if (skip(el) || !el.id) return;
        if (el.type === 'hidden') return;
        if (el.type === 'checkbox' || el.type === 'radio') {
          controls['#' + el.id] = el.checked ? 'checked' : 'unchecked';
        } else {
          controls['#' + el.id] = String(el.value);
        }
      });

      // 4. 尋找主畫布並嘗試 2D toDataURL
      let cv = canvasSel ? document.querySelector(canvasSel) : null;
      if (!cv) {
        const preferred = ['#cv', '#wheelCanvas', '#scene canvas', '.stage canvas'];
        for (const s of preferred) {
          const cand = document.querySelector(s);
          if (cand && cand.tagName === 'CANVAS' && cand.width > 0 && cand.height > 0) {
            const r = cand.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) { cv = cand; break; }
          }
        }
      }
      if (!cv) {
        let bestArea = 0;
        document.querySelectorAll('canvas').forEach(c => {
          if (skip(c)) return;
          const r = c.getBoundingClientRect();
          const area = r.width * r.height;
          if (area > bestArea && c.width > 0 && c.height > 0) {
            bestArea = area;
            cv = c;
          }
        });
      }

      let canvasInfo = null;
      if (cv) {
        const sel = cv.id ? '#' + cv.id : 'canvas';
        const r = cv.getBoundingClientRect();
        let dataUrl = null;
        let toDataUrlError = null;
        try {
          const u = cv.toDataURL('image/png');
          if (u && u.startsWith('data:image/png;base64,') && u.length > 64) dataUrl = u;
        } catch (e) {
          toDataUrlError = e && e.message ? e.message : String(e);
        }
        canvasInfo = {
          selector: sel,
          width: cv.width,
          height: cv.height,
          cssWidth: Math.round(r.width),
          cssHeight: Math.round(r.height),
          dataUrl,
          toDataUrlError
        };
      }

      // 5. 事件紀錄（先在瀏覽器端去掉函式，避免 structured clone 失敗）
      const rawEvents = (window.__snapEvents || []).map(ev => {
        let safeData = null;
        try { safeData = JSON.parse(JSON.stringify(ev.data || {})); } catch (e) { safeData = String(ev.data); }
        return { type: ev.type, data: safeData };
      });

      return { readings, controls, canvasInfo, rawEvents };
    }, opts.canvasSel);

    // 整理主畫布雜湊（優先用 toDataURL，失敗時退回元素 screenshot）
    let canvas = null;
    if (raw.canvasInfo) {
      let sha256 = null;
      let method = 'toDataURL';
      if (raw.canvasInfo.dataUrl) {
        sha256 = crypto.createHash('sha256').update(raw.canvasInfo.dataUrl).digest('hex');
      } else {
        method = 'screenshot';
        const buf = await page.locator(raw.canvasInfo.selector).first().screenshot();
        sha256 = crypto.createHash('sha256').update(buf).digest('hex');
      }
      canvas = {
        selector: raw.canvasInfo.selector,
        width: raw.canvasInfo.width,
        height: raw.canvasInfo.height,
        cssWidth: raw.canvasInfo.cssWidth,
        cssHeight: raw.canvasInfo.cssHeight,
        method,
        sha256
      };
    }

    if (opts.shots) {
      fs.mkdirSync(opts.outDir, { recursive: true });
      await page.screenshot({ path: path.join(opts.outDir, `${opts.mode}-${size.key}.png`) });
    }

    const events = raw.rawEvents.map(ev => ({
      type: ev.type,
      data: sanitizeEventData(ev.data, 0)
    }));

    return {
      size: size.key,
      scheme,
      layout,
      readings: raw.readings,
      controls: raw.controls,
      events,
      canvas,
      pageErrors
    };
  } finally {
    await ctx.close();
  }
}

function diffRecords(beforeMap, afterMap, kindLabel) {
  const diffs = [];
  const keys = Array.from(new Set(Object.keys(beforeMap || {}).concat(Object.keys(afterMap || {})))).sort();
  for (const k of keys) {
    const hasB = Object.prototype.hasOwnProperty.call(beforeMap || {}, k);
    const hasA = Object.prototype.hasOwnProperty.call(afterMap || {}, k);
    const bVal = hasB ? beforeMap[k] : '(無)';
    const aVal = hasA ? afterMap[k] : '(無)';
    if (!hasB || !hasA || bVal !== aVal) {
      diffs.push({ kind: kindLabel, field: k, before: bVal, after: aVal });
    }
  }
  return diffs;
}

function diffOneSize(beforeSnap, afterSnap) {
  const diffs = [];
  if (!beforeSnap) {
    return [{ kind: 'meta', field: 'before', before: '(缺此尺寸基準)', after: afterSnap.size }];
  }
  diffs.push(...diffRecords(beforeSnap.readings, afterSnap.readings, '讀數'));
  diffs.push(...diffRecords(beforeSnap.controls, afterSnap.controls, '控制項'));

  const bEv = JSON.stringify(beforeSnap.events || []);
  const aEv = JSON.stringify(afterSnap.events || []);
  if (bEv !== aEv) {
    const bSummary = `${(beforeSnap.events || []).length} 筆 ${bEv.slice(0, 120)}`;
    const aSummary = `${(afterSnap.events || []).length} 筆 ${aEv.slice(0, 120)}`;
    diffs.push({ kind: '事件', field: 'LabMission.emit', before: bSummary, after: aSummary });
  }

  const bCv = beforeSnap.canvas;
  const aCv = afterSnap.canvas;
  if (!bCv && aCv) {
    diffs.push({ kind: '畫布', field: 'canvas', before: '(無畫布)', after: `${aCv.selector} ${aCv.sha256.slice(0, 12)}` });
  } else if (bCv && !aCv) {
    diffs.push({ kind: '畫布', field: 'canvas', before: `${bCv.selector} ${bCv.sha256.slice(0, 12)}`, after: '(無畫布)' });
  } else if (bCv && aCv) {
    if (bCv.width !== aCv.width || bCv.height !== aCv.height) {
      diffs.push({ kind: '畫布尺寸', field: aCv.selector, before: `${bCv.width}x${bCv.height}`, after: `${aCv.width}x${aCv.height}` });
    }
    if (bCv.sha256 !== aCv.sha256) {
      diffs.push({ kind: '主畫布雜湊', field: aCv.selector, before: bCv.sha256.slice(0, 12), after: aCv.sha256.slice(0, 12) });
    }
  }

  const bErr = JSON.stringify(beforeSnap.pageErrors || []);
  const aErr = JSON.stringify(afterSnap.pageErrors || []);
  if (bErr !== aErr) {
    diffs.push({ kind: '錯誤', field: 'pageErrors', before: bErr, after: aErr });
  }

  return diffs;
}

function diffSnapshots(beforeDoc, afterDoc) {
  if (beforeDoc && beforeDoc.slug && afterDoc && afterDoc.slug && beforeDoc.slug !== afterDoc.slug) {
    throw new Error(`快照站台不符：before 為「${beforeDoc.slug}」，after 為「${afterDoc.slug}」。`);
  }
  const results = [];
  let totalDiffs = 0;
  let changedSizes = 0;

  const afterKeys = Object.keys(afterDoc.snapshots || {});
  const afterSet = new Set(afterKeys);
  const beforeKeys = Array.isArray(beforeDoc.sizes) && beforeDoc.sizes.length
    ? beforeDoc.sizes
    : Object.keys(beforeDoc.snapshots || {});
  const skippedSizes = beforeKeys.filter(k => !afterSet.has(k));

  for (const sizeKey of afterKeys) {
    const aSnap = afterDoc.snapshots[sizeKey];
    const bSnap = beforeDoc.snapshots ? beforeDoc.snapshots[sizeKey] : null;
    const diffs = diffOneSize(bSnap, aSnap);
    if (diffs.length) {
      changedSizes++;
      totalDiffs += diffs.length;
    }
    results.push({
      size: sizeKey,
      changed: diffs.length > 0,
      readingCount: Object.keys(aSnap.readings || {}).length,
      eventCount: (aSnap.events || []).length,
      canvasHash: aSnap.canvas ? aSnap.canvas.sha256.slice(0, 12) : 'none',
      diffs
    });
  }

  const beforeActions = extractActionStrings(beforeDoc);
  const afterActions = extractActionStrings(afterDoc);
  const actionsMismatch = JSON.stringify(beforeActions) !== JSON.stringify(afterActions);

  return {
    slug: afterDoc.slug,
    changedSizes,
    totalSizes: results.length,
    totalDiffs,
    hasDiff: totalDiffs > 0,
    skippedSizes,
    beforeActions,
    afterActions,
    actionsMismatch,
    replayedFromBefore: !!(afterDoc && afterDoc.replayedFromBefore),
    results
  };
}

function formatDiff(report) {
  const lines = [`快照比對：${report.slug}`];
  const hasAnyActions = (report.beforeActions && report.beforeActions.length) || (report.afterActions && report.afterActions.length);
  if (hasAnyActions) {
    const bStr = report.beforeActions && report.beforeActions.length ? report.beforeActions.join(' ; ') : '（無）';
    const aStr = report.afterActions && report.afterActions.length ? report.afterActions.join(' ; ') : '（無）';
    if (report.actionsMismatch) {
      lines.push(`⚠ 操作條件不同｜before：${bStr}｜after：${aStr}`);
    } else {
      lines.push(`操作條件：${aStr}${report.replayedFromBefore ? '（自動沿用 before）' : ''}`);
    }
  }

  for (const r of report.results) {
    if (!r.changed) {
      lines.push(`✓ ${r.size}：無差異（讀數 ${r.readingCount} 欄、事件 ${r.eventCount} 筆、畫布 ${r.canvasHash}）`);
    } else {
      lines.push(`✗ ${r.size}：${r.diffs.length} 處差異`);
      for (const d of r.diffs) {
        lines.push(`  · ${d.kind} ${d.field}：${d.before} → ${d.after}`);
      }
    }
  }

  const skipped = Array.isArray(report.skippedSizes) ? report.skippedSizes : [];
  if (skipped.length) {
    lines.push(`略過未複驗的基準尺寸（${skipped.length} 個）：${skipped.join(', ')}`);
  }

  const skipNote = skipped.length ? `（另有 ${skipped.length} 個基準尺寸未複驗：${skipped.join(', ')}）` : '';
  lines.push(
    report.hasDiff
      ? `結果：${report.totalSizes} 個尺寸中有 ${report.changedSizes} 個有差異（共 ${report.totalDiffs} 處）${skipNote}。`
      : `結果：${report.totalSizes}/${report.totalSizes} 尺寸無差異${skipNote}。`
  );
  return lines.join('\n');
}

function formatBeforeSummary(doc, outFile) {
  const lines = [`已儲存 before 快照：${doc.slug} → ${outFile}`];
  const acts = extractActionStrings(doc);
  if (acts.length) {
    lines.push(`  操作條件：${acts.join(' ; ')}`);
  }
  for (const key of Object.keys(doc.snapshots)) {
    const s = doc.snapshots[key];
    const hash = s.canvas ? s.canvas.sha256.slice(0, 12) : 'none';
    const modeNote = s.layout && s.layout.deckMode ? `、面板 ${s.layout.deckMode}` : '';
    lines.push(`  · ${key}：讀數 ${Object.keys(s.readings).length} 欄、控制項 ${Object.keys(s.controls).length} 個、事件 ${s.events.length} 筆、畫布 ${hash}${modeNote}`);
  }
  return lines.join('\n');
}

async function runCli(argv) {
  const parsed = parseArgs(argv);
  if (parsed.help) {
    console.log(USAGE);
    return 0;
  }
  if (parsed.error) {
    console.error('參數錯誤：' + parsed.error + '\n' + USAGE);
    return 2;
  }

  const pageFile = resolvePagePath(REPO_ROOT, parsed.slug);
  if (!pageFile) {
    console.error(`找不到實驗頁：${parsed.slug}.html（根目錄 ${REPO_ROOT}）`);
    return 2;
  }

  const beforeFile = path.join(parsed.outDir, 'before.json');
  let beforeDoc = null;
  let resolvedActions = {
    actions: parsed.actions,
    actionsRaw: parsed.actionsRaw,
    replayedFromBefore: false
  };

  if (parsed.mode === 'after') {
    if (!fs.existsSync(beforeFile)) {
      console.error(`找不到 before 快照：${beforeFile}\n請先執行：node tools/snap.cjs ${parsed.slug} before --out "${parsed.outDir}"`);
      return 2;
    }
    try {
      beforeDoc = JSON.parse(fs.readFileSync(beforeFile, 'utf8'));
    } catch (e) {
      console.error(`before 快照格式損壞：${beforeFile}`);
      return 2;
    }
    if (!beforeDoc || !beforeDoc.slug || beforeDoc.slug !== parsed.slug) {
      console.error(
        `before 快照站台不符：${beforeFile} 記錄為「${beforeDoc && beforeDoc.slug ? beforeDoc.slug : '(未知)'}」，本次指定為「${parsed.slug}」。\n請改用獨立的 --out 目錄，或重新對 ${parsed.slug} 執行 before。`
      );
      return 2;
    }
    resolvedActions = resolveAfterActions(parsed, beforeDoc);
    if (resolvedActions.error) {
      console.error('操作條件錯誤：' + resolvedActions.error);
      return 2;
    }
  }

  // after 若未顯式指定尺寸／語言／主題／查詢字串，沿用 before 紀錄
  const sizes = parsed.sizes || (beforeDoc && beforeDoc.sizes ? parseSizes(beforeDoc.sizes.join(',')).sizes : parseSizes(DEFAULT_SIZES).sizes);
  const effectiveOpts = {
    slug: parsed.slug,
    mode: parsed.mode,
    outDir: parsed.outDir,
    lang: parsed.lang || (beforeDoc && beforeDoc.lang) || 'zh-Hant',
    theme: parsed.theme || (beforeDoc && beforeDoc.theme) || 'auto',
    query: parsed.query !== null ? parsed.query : (beforeDoc && beforeDoc.query) || '',
    waitMs: parsed.waitMs,
    canvasSel: parsed.canvasSel || (beforeDoc && beforeDoc.canvasSel) || null,
    actions: resolvedActions.actions,
    actionsRaw: resolvedActions.actionsRaw,
    replayedFromBefore: resolvedActions.replayedFromBefore,
    shots: parsed.shots,
    headed: parsed.headed,
    json: parsed.json
  };

  const { server, baseUrl } = await startStaticServer(REPO_ROOT);
  const { launch } = require(path.join(REPO_ROOT, 'tools', 'browser.cjs'));
  let browser = null;

  try {
    browser = await launch({ headless: !effectiveOpts.headed, args: ['--mute-audio'] });
    const snapshots = {};
    for (const sz of sizes) {
      snapshots[sz.key] = await captureOneSize(browser, baseUrl, effectiveOpts, sz, REPO_ROOT);
    }

    const doc = {
      slug: effectiveOpts.slug,
      sizes: sizes.map(s => s.key),
      lang: effectiveOpts.lang,
      theme: effectiveOpts.theme,
      query: effectiveOpts.query,
      canvasSel: effectiveOpts.canvasSel,
      actions: effectiveOpts.actions,
      actionsRaw: effectiveOpts.actionsRaw,
      replayedFromBefore: effectiveOpts.replayedFromBefore,
      createdAt: new Date().toISOString(),
      snapshots
    };

    fs.mkdirSync(effectiveOpts.outDir, { recursive: true });
    if (effectiveOpts.mode === 'before') {
      fs.writeFileSync(beforeFile, JSON.stringify(doc, null, 2) + '\n', 'utf8');
      if (effectiveOpts.json) {
        console.log(JSON.stringify({ mode: 'before', file: beforeFile, slug: doc.slug, sizes: doc.sizes, actions: doc.actionsRaw }, null, 2));
      } else {
        console.log(formatBeforeSummary(doc, beforeFile));
      }
      return 0;
    }

    const afterFile = path.join(effectiveOpts.outDir, 'after.json');
    const diffFile = path.join(effectiveOpts.outDir, 'diff.json');
    fs.writeFileSync(afterFile, JSON.stringify(doc, null, 2) + '\n', 'utf8');
    const report = diffSnapshots(beforeDoc, doc);
    fs.writeFileSync(diffFile, JSON.stringify(report, null, 2) + '\n', 'utf8');

    if (effectiveOpts.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(formatDiff(report));
    }
    return report.hasDiff ? 1 : 0;
  } finally {
    if (browser) { try { await browser.close(); } catch (e) { /* 忽略 */ } }
    server.close();
  }
}

if (require.main === module) {
  runCli(process.argv.slice(2))
    .then(code => process.exit(code))
    .catch(err => {
      console.error('執行失敗：' + (err && err.message ? err.message : String(err)));
      process.exit(2);
    });
}

module.exports = {
  parseSizes,
  parseDoAction,
  parseArgs,
  resolveAfterActions,
  resolvePagePath,
  sanitizeEventData,
  diffOneSize,
  diffSnapshots,
  formatDiff,
  formatBeforeSummary,
  defaultOutDir
};
