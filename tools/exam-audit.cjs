#!/usr/bin/env node
/*
 * exam-audit.cjs — 學測頁（exam-113／114／115.html…）總檢查（11/27 站長在小幫手串：「請趕快寫」，學習串候選 A）
 * 取代學習串每次改版重寫的 mastcheck、nearcheck、widecheck、immnav、edgecheck、lessoncheck，
 * 並把試玩串的 exam-check.cjs（語音檔齊全、長度與表一致、逐句走完）併進來。
 *
 * 用法（在 repo 任一工作樹裡）：
 *   node tools/exam-audit.cjs                       本機（自帶靜態伺服器）：代表題 × 六種尺寸 × 沉浸開關 × 側板開收，加全部年度的旁白檢查
 *   node tools/exam-audit.cjs --site https://lab.astroni.org/   改查正式站
 *   選項：
 *     --q 114-20,115-13   只查這幾題（年度-題號）；--year 115 查該年度全部題目；--all 全部年度全部題目
 *     --sizes p412,land   只用這幾種尺寸（見下方 SIZES）
 *     --no-layout         不開瀏覽器，只查旁白；--no-audio 不查旁白；--audio-years 113,115 旁白只查這幾年
 *     --shots 資料夾      拼圖與每格截圖存這裡（預設 F:\測試暫存\exam-audit_<日期時間>\；用完請刪）
 *     --no-shots          不截圖　　--verbose 合格的組合也印一行
 *   結束碼：0 全部合格（「注意」不算不合格）；1 有不合格；2 參數錯誤。
 *
 * 量什麼（不合格＝「錯」；只供參考＝「注意」）：
 *   錯：主控台 pageerror、同網站 404；左右捲動；頂列三鍵（.mast-btn、上課模式、站名）和齒輪／帳號重疊；
 *       「步驟・任務」側標籤（#edge）蓋到按鈕、文字、公式（整頁從頂捲到底量）；
 *       任務提示框（.ms-near）蓋到播放列、頂列三鍵、看解答、送出；
 *       解答播放列沒黏住（解題卡比螢幕高時捲進卡內 300 px，播放列要整條在螢幕內）；
 *       解題畫面（#scene）寬 < 80 px；逐句下拉的句數和旁白表不同；按「下一句」走不到最後一句；
 *       整頁沉浸：沒進沉浸、麵包屑沒藏、Esc 沒退出；沉浸中換題跳出沉浸或沒換到題；Esc 後還在沉浸；
 *       解題卡沉浸：卡寬 < 視窗 90%、播放列超出螢幕、Esc 沒退出；
 *       側板停靠（寬 ≥ 1240 打開側板）：側板蓋到試卷或解題卡、畫面被擠窄；
 *       旁白：缺檔、長度和表差 > 0.35 s、缺中文或英文字幕、句號重複、字幕用了 Unicode 上下標字元。
 *   注意：橫放與電腦上「題目＋送出鍵」超出一屏多少 px；文字溢出容器（列前三個）；資料夾裡沒被用到的音檔。
 *
 * 只用 mock 後端、擋掉所有對外連線（查正式站時只放行 lab.astroni.org），不寫正式資料庫。
 * 瀏覽器經 tools/browser.cjs（全機排隊）。旁白長度用 VideoProc 的 ffprobe；R2 年度直接讀 audio.astroni.org。
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), cp = require('child_process'), os = require('os');
const ROOT = path.resolve(__dirname, '..');
const FFPROBE = process.env.FFPROBE || 'C:/Program Files (x86)/Digiarty/VideoProc Converter/ffprobe.exe';
const R2 = 'https://audio.astroni.org/';
const SIZES = {
  p412: { w: 412, h: 860, scheme: 'dark', mobile: true, label: '手機直放 412×860' },
  land: { w: 844, h: 390, scheme: 'dark', mobile: true, label: '手機橫放 844×390' },
  tab1024: { w: 1024, h: 768, scheme: 'dark', mobile: true, label: '平板 1024×768' },
  tab1180: { w: 1180, h: 820, scheme: 'dark', mobile: true, label: '平板橫放 1180×820' },
  pc1280: { w: 1280, h: 800, scheme: 'light', mobile: false, label: '電腦 1280×800' },
  pc1920: { w: 1920, h: 1080, scheme: 'light', mobile: false, label: '電腦 1920×1080' }
};
const DEFAULT_Q = ['113-21', '114-20', '114-49', '115-13', '115-53'];
const SUPSUB = /[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿ₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎]/;

// ── 參數 ──
const argv = process.argv.slice(2), opt = { layout: true, audio: true, shots: true };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i], val = () => { if (i + 1 >= argv.length) bad('參數 ' + a + ' 後面要接值'); return argv[++i]; };
  if (a === '--site') opt.site = val().replace(/\/?$/, '/');
  else if (a === '--q') opt.q = val().split(',').map(s => s.trim()).filter(Boolean);
  else if (a === '--year') opt.year = val().split(',').map(Number);
  else if (a === '--all') opt.all = true;
  else if (a === '--sizes') opt.sizes = val().split(',');
  else if (a === '--no-layout') opt.layout = false;
  else if (a === '--no-audio') opt.audio = false;
  else if (a === '--audio-years') opt.audioYears = val().split(',').map(Number);
  else if (a === '--shots') opt.shotDir = val();
  else if (a === '--no-shots') opt.shots = false;
  else if (a === '--verbose') opt.verbose = true;
  else if (a === '-h' || a === '--help') { console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]); process.exit(0); }
  else bad('看不懂的參數：' + a);
}
function bad(m) { console.error(m); process.exit(2); }
const sizes = (opt.sizes || Object.keys(SIZES)).map(k => { if (!SIZES[k]) bad('沒有這個尺寸：' + k + '（可用 ' + Object.keys(SIZES).join('、') + '）'); return [k, SIZES[k]]; });

const fails = [], notes = [];
const fail = (where, msg) => fails.push(where + '：' + msg), note = (where, msg) => notes.push(where + '：' + msg);

// ── 題目與旁白表（從 repo 讀，不開瀏覽器） ──
const YEARS = fs.readdirSync(ROOT).map(f => (f.match(/^exam-(\d+)\.html$/) || [])[1]).filter(Boolean).map(Number).sort();
function tracksOf(year) {
  const out = {}, dir = path.join(ROOT, 'js/exam', String(year));
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir).filter(f => /^q\d+\.js$/.test(f))) {
    const s = fs.readFileSync(path.join(dir, f), 'utf8'), m = s.match(/ExamTracks\.Q(\d+)\s*=\s*(\[[\s\S]*?\]);\s*\n?\/\* tracks:end/);
    if (m) out[m[1]] = JSON.parse(m[2]);
  }
  const tf = path.join(ROOT, 'js/exam', year + '-timings.js');
  if (fs.existsSync(tf)) { const w = {}; new Function('window', fs.readFileSync(tf, 'utf8'))(w); for (const [k, v] of Object.entries(w.ExamTracks || {})) { const n = k.replace(/^Q/, ''); if (!out[n]) out[n] = v; } }
  return out;
}
const r2Years = (() => { const m = fs.readFileSync(path.join(ROOT, 'js/exam.js'), 'utf8').match(/R2_YEARS\s*=\s*new Set\(\[([\d,\s]*)\]\)/); return new Set(m ? m[1].split(',').map(Number).filter(Boolean) : []); })();
const TR = Object.fromEntries(YEARS.map(y => [y, tracksOf(y)]));
let QLIST;
if (opt.q) QLIST = opt.q.map(s => { const [y, q] = s.split('-').map(Number); if (!TR[y] || !TR[y][q]) bad('沒有這一題：' + s); return [y, q]; });
else if (opt.year || opt.all) QLIST = (opt.all ? YEARS : opt.year).flatMap(y => { if (!TR[y]) bad('沒有這個年度：' + y); return Object.keys(TR[y]).map(Number).sort((a, b) => a - b).map(q => [y, q]); });
else QLIST = DEFAULT_Q.map(s => s.split('-').map(Number)).filter(([y, q]) => TR[y] && TR[y][q]);

// ── 旁白檢查 ──
function probe(src) {
  return new Promise(res => {
    const p = cp.spawn(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', src], { windowsHide: true });
    let o = ''; p.stdout.on('data', d => o += d); p.on('error', () => res(null)); p.on('close', () => { const v = parseFloat(o); res(isFinite(v) ? v : null); });
  });
}
async function audioAudit() {
  if (!fs.existsSync(FFPROBE)) { fail('旁白', '找不到 ffprobe：' + FFPROBE + '（可用環境變數 FFPROBE 指定）'); return; }
  const years = opt.audioYears || YEARS, jobs = [];
  for (const y of years) {
    const T = TR[y]; if (!T) { fail('旁白', '沒有這個年度：' + y); continue; }
    const where = y + ' 旁白', seen = new Set(), dir = path.join(ROOT, 'audio/study/exam-' + y);
    for (const [q, rows] of Object.entries(T)) for (const t of rows) {
      if (seen.has(t.id)) fail(where, '句號重複 ' + t.id); seen.add(t.id);
      if (!t.disp || !t.en) fail(where, t.id + ' 缺' + (!t.disp ? '中文' : '英文') + '字幕');
      if (SUPSUB.test((t.disp || '') + (t.en || ''))) fail(where, t.id + ' 字幕用了 Unicode 上下標字元（網站禁止，改 KaTeX）');
      const src = r2Years.has(y) ? R2 + 'audio/study/exam-' + y + '/' + t.id + '.m4a'
        : opt.site ? opt.site + 'audio/study/exam-' + y + '/' + t.id + '.m4a' : path.join(dir, t.id + '.m4a');
      jobs.push({ where, t, src, local: !/^https?:/.test(src) });
    }
    if (!r2Years.has(y) && fs.existsSync(dir)) {
      const extra = fs.readdirSync(dir).filter(f => !seen.has(f.replace(/\.\w+$/, '')));
      if (extra.length) note(where, '資料夾裡沒被用到的音檔 ' + extra.length + ' 個（' + extra.slice(0, 5).join('、') + (extra.length > 5 ? '…' : '') + '）');
    }
  }
  let i = 0, done = 0;
  const work = async () => { while (i < jobs.length) {
    const j = jobs[i++];
    if (j.local && !fs.existsSync(j.src)) { fail(j.where, '缺檔 ' + j.t.id); continue; }
    const d = await probe(j.src); done++;
    if (d == null) fail(j.where, (j.local ? '讀不到長度 ' : '讀不到（網址不通？）') + j.t.id);
    else if (Math.abs(d - j.t.duration) > 0.35) fail(j.where, j.t.id + ' 長度不符：檔 ' + d.toFixed(2) + ' s、表 ' + j.t.duration + ' s');
  } };
  await Promise.all(Array.from({ length: 8 }, work));
  console.log('旁白：' + years.join('、') + ' 年共 ' + jobs.length + ' 句，量了 ' + done + ' 個檔（R2 年度：' + ([...r2Years].join('、') || '無') + '）');
}

// ── 版面檢查 ──
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.ico': 'image/x-icon' };
function serve() {
  return new Promise(r => {
    const server = http.createServer((req, res) => {
      const p = decodeURIComponent(new URL(req.url, 'http://x').pathname), file = path.join(ROOT, p.endsWith('/') ? p + 'index.html' : p);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => r([server, 'http://127.0.0.1:' + server.address().port + '/']));
  });
}

// 頁內量測（字串傳進頁面執行）
const IN = {
  // 頂列與齒輪／帳號重疊、左右捲動、文字溢出
  basic: () => {
    const R = e => e.getBoundingClientRect(), vis = e => e && e.getClientRects().length && R(e).width > 0;
    const out = { hscroll: document.documentElement.scrollWidth > innerWidth + 1 ? document.documentElement.scrollWidth - innerWidth : 0, mast: [], over: [] };
    const bs = [...document.querySelectorAll('.mast-btn,#class-mode,.learn-brand')].filter(vis), os = [...document.querySelectorAll('.lab-gear,.lab-account')].filter(vis);
    for (const a of bs) for (const o of os) { const r = R(a), q = R(o); if (r.right > q.left + 1 && r.left < q.right - 1 && r.bottom > q.top + 1 && r.top < q.bottom - 1) out.mast.push((a.id || a.className.split(' ')[0]) + '×' + o.className.split(' ')[0]); }
    for (const e of document.querySelectorAll('.exam-paper *,#workpad *')) {
      if (!vis(e) || e.children.length || e.closest('.katex,svg,canvas,select,input,#sentence,[hidden]')) continue;
      const st = getComputedStyle(e); if (st.overflowX !== 'visible' || st.whiteSpace === 'nowrap' && e.closest('.transport')) continue;
      if (e.scrollWidth > e.clientWidth + 2 && e.clientWidth > 0) out.over.push((e.id ? '#' + e.id : e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className ? '.' + e.className.split(' ')[0] : '')) + ' 溢出 ' + (e.scrollWidth - e.clientWidth) + 'px');
    }
    const crumbs = document.querySelector('.learn-crumbs');
    out.crumbsHidden = !crumbs || getComputedStyle(crumbs).display === 'none';
    out.imm = document.documentElement.classList.contains('exam-imm-page');
    out.cardImm = document.documentElement.classList.contains('learn-immersive');
    return out;
  },
  // 題目＋送出鍵是否一屏
  fit: () => {
    const g = document.querySelector('.problem-grid'), s = document.getElementById('send-answer');
    if (!g || !s || !s.getClientRects().length) return null;
    const top = g.getBoundingClientRect().top + scrollY, bot = s.getBoundingClientRect().bottom + scrollY;
    return { span: Math.round(bot - top), H: innerHeight, sendBottom: Math.round(bot) };
  },
  // 提示框蓋到什麼
  near: () => {
    const box = [...document.querySelectorAll('.ms-near')].find(b => !b.hidden && b.getClientRects().length && b.getBoundingClientRect().height > 0);
    if (!box) return [];
    const r = box.getBoundingClientRect(), sel = '#workpad>.transport button,#workpad>.transport input,.mast-btn,#class-mode,#explain,#send-answer';
    return [...document.querySelectorAll(sel)].filter(e => { if (e.hidden || !e.getClientRects().length) return false; const q = e.getBoundingClientRect(); if (!q.width || q.bottom <= 0 || q.top >= innerHeight) return false; return Math.min(r.right, q.right) > Math.max(r.left, q.left) + 1 && Math.min(r.bottom, q.bottom) > Math.max(r.top, q.top) + 1; })
      .map(e => (e.id || e.className.split(' ')[0] || e.tagName) + (e.innerText ? '「' + e.innerText.trim().replace(/\s+/g, '').slice(0, 6) + '」' : ''));
  },
  // 側標籤蓋到什麼（從頂捲到底）
  edge: async () => {
    const edge = document.getElementById('edge'); if (!edge || !edge.getClientRects().length) return [];
    const out = new Set(), H = document.documentElement.scrollHeight, step = Math.max(120, Math.round(innerHeight * 0.4));
    const sel = 'button,a,input,select,label,[role=button],#point-label,.katex,img,canvas,p,li,h1,h2,h3,strong';
    for (let y = 0; y <= H; y += step) {
      scrollTo(0, y); await new Promise(r => setTimeout(r, 260)); // 等側標籤縮放動畫（.2s）做完
      const e = edge.getBoundingClientRect();
      for (const el of document.querySelectorAll(sel)) {
        if (edge.contains(el) || el.closest('#study-side,#edge,.lab-share,.fb-panel,dialog,[hidden],.ms-panel')) continue;
        const r = el.getBoundingClientRect(); if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight) continue;
        const st = getComputedStyle(el); if (st.visibility === 'hidden' || st.display === 'none') continue;
        if (r.right > e.left + 1 && r.left < e.right && r.bottom > e.top && r.top < e.bottom) {
          if (el.children.length && el.matches('p,li,strong') && [...el.children].some(k => k.getBoundingClientRect().right > e.left + 1)) continue;
          if (el.matches('p,li') && el.innerText.trim() && (() => { const rg = document.createRange(); rg.selectNodeContents(el); return [...rg.getClientRects()].every(c => c.right <= e.left + 1 || c.bottom <= e.top || c.top >= e.bottom); })()) continue;
          out.add((el.id ? '#' + el.id : el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.split(' ')[0] : '')) + '「' + (el.innerText || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, '').slice(0, 10) + '」伸進 ' + Math.round(r.right - e.left) + 'px');
        }
      }
    }
    scrollTo(0, 0); return [...out];
  },
  // 解答區：句數、畫面寬、播放列黏住
  sol: async () => {
    const wp = document.getElementById('workpad'), tr = document.querySelector('#workpad>.transport'), sc = document.getElementById('scene');
    if (!wp || !wp.getClientRects().length) return { none: true };
    const out = { sentences: document.querySelectorAll('#sentence option').length, scene: sc ? Math.round(sc.getBoundingClientRect().width) : 0, wp: Math.round(wp.getBoundingClientRect().width) };
    const top = wp.getBoundingClientRect().top + scrollY, h = wp.getBoundingClientRect().height;
    if (h > innerHeight + 4 && tr) {
      scrollTo(0, top + Math.min(300, h - innerHeight)); await new Promise(r => setTimeout(r, 250));
      const t = tr.getBoundingClientRect(); out.stuck = t.top >= -1 && t.bottom <= innerHeight + 1; out.tr = Math.round(t.top) + '–' + Math.round(t.bottom);
    } else out.stuck = true;
    return out;
  },
  // 側板停靠時蓋到試卷／解題卡
  side: () => {
    const s = document.getElementById('study-side'); if (!s || s.hidden || !s.getClientRects().length) return { open: false };
    const r = s.getBoundingClientRect(), hits = [];
    for (const sel of ['.exam-paper', '#workpad', '#exam-nav']) { const e = document.querySelector(sel); if (!e || !e.getClientRects().length) continue; const q = e.getBoundingClientRect(); if (q.width && Math.min(r.right, q.right) > Math.max(r.left, q.left) + 2 && Math.min(r.bottom, q.bottom) > Math.max(r.top, q.top) + 2) hits.push(sel + ' 重疊 ' + Math.round(Math.min(r.right, q.right) - Math.max(r.left, q.left)) + 'px'); }
    const paper = document.querySelector('.exam-paper');
    return { open: true, hits, paperW: paper ? Math.round(paper.getBoundingClientRect().width) : 0 };
  },
  // 整頁沉浸換題用：外層與 iframe 狀態
  immState: () => {
    const f = document.getElementById('imm-frame'); let q = new URL(location.href).searchParams.get('q'), imm = document.documentElement.classList.contains('exam-imm-page');
    try { if (f && f.contentWindow) { q = new URL(f.contentWindow.location.href).searchParams.get('q'); imm = imm && f.contentDocument.documentElement.classList.contains('exam-imm-page'); } } catch (e) { /* 讀不到框 */ }
    return { q, imm, frame: !!f };
  }
};

async function answerAndExplain(page) {
  // 選擇題照答案勾；非選擇題直接打開解答
  await page.evaluate(() => { const k = (window.ExamPaper && ExamPaper.question && ExamPaper.question.key) || ''; const bs = document.querySelectorAll('[name=choice]'); bs.forEach(b => { b.checked = k.includes(b.value); }); if (bs[0]) bs[0].dispatchEvent(new Event('change', { bubbles: true })); });
  if (await page.locator('[name=choice]').count()) { await page.click('#send-answer').catch(() => {}); await page.waitForTimeout(1200); }
  await page.evaluate(() => { const e = document.getElementById('explain'); if (e && document.getElementById('explanation').hidden) { e.hidden = false; e.click(); } });
  await page.waitForTimeout(1800);
}

async function layoutAudit() {
  const { launch } = require(path.join(ROOT, 'tools/browser.cjs'));
  let server = null, base = opt.site;
  if (!base) [server, base] = await serve();
  const origin = new URL(base).origin, nc = opt.site ? '&nc=' + Date.now() : '';
  const stamp = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
  const shotDir = opt.shots ? (opt.shotDir || (fs.existsSync('F:/') ? 'F:/測試暫存/exam-audit_' + stamp : path.join(os.tmpdir(), 'exam-audit_' + stamp))) : null;
  if (shotDir) fs.mkdirSync(shotDir, { recursive: true });
  const browser = await launch(), tiles = [];
  let combos = 0;
  for (const [sk, S] of sizes) {
    for (const sideOpen of S.w >= 1240 ? [false, true] : [false]) {
      const ctx = await browser.newContext({ viewport: { width: S.w, height: S.h }, colorScheme: S.scheme, deviceScaleFactor: 1, hasTouch: S.mobile, locale: 'zh-TW' });
      await ctx.route(u => new URL(u.href).origin !== origin, r => r.abort());
      await ctx.addInitScript({ path: path.join(ROOT, 'tools/mock-backend.js') });
      await ctx.addInitScript(o => { if (!sessionStorage.getItem('ea-seeded')) { sessionStorage.setItem('ea-seeded', '1'); localStorage.setItem('lab-settings', JSON.stringify({ lang: 'zh-Hant', theme: 'auto', fs: 1, sound: false })); localStorage.setItem('lab-welcome-v1', 'skip'); localStorage.setItem('exam-side-open', o.side ? '1' : '0'); } }, { side: sideOpen });
      const page = await ctx.newPage(); let errs = [], miss = [];
      page.on('pageerror', e => errs.push(e.message.slice(0, 140)));
      page.on('response', r => { if (r.status() === 404 && r.url().startsWith(origin)) miss.push(r.url().slice(origin.length)); });
      for (const [y, q] of QLIST) {
        const tag = y + '-' + q + ' ' + sk + (sideOpen ? ' 側板開' : ''), before = fails.length;
        errs = []; miss = [];
        await page.goto(base + 'exam-' + y + '.html?q=' + q + nc, { waitUntil: 'load' }); await page.waitForTimeout(1800);
        await page.evaluate(() => sessionStorage.removeItem('exam-imm-page'));
        let b = await page.evaluate(IN.basic);
        if (b.hscroll) fail(tag, '左右捲動 ' + b.hscroll + 'px');
        if (b.mast.length) fail(tag, '頂列和齒輪／帳號重疊：' + b.mast.join('、'));
        if (b.over.length) note(tag, '文字溢出 ' + b.over.length + ' 處：' + b.over.slice(0, 3).join('、'));
        if (S.w > S.h && !sideOpen) { const f = await page.evaluate(IN.fit); if (f && f.sendBottom > f.H) note(tag, '題目到送出鍵 ' + f.span + 'px，送出鍵底在 ' + f.sendBottom + 'px（超出一屏 ' + (f.sendBottom - f.H) + 'px）'); }
        if (shotDir && q === QLIST[0][1] && y === QLIST[0][0]) { const file = path.join(shotDir, `${sk}${sideOpen ? '-side' : ''}-${y}-${q}-1題目.png`); await page.screenshot({ path: file }); tiles.push([S.label + (sideOpen ? '・側板開' : '') + '・題目', file]); }
        // 整頁沉浸（作答前）
        if (!sideOpen) {
          await page.click('#mast-imm').catch(() => {}); await page.waitForTimeout(700);
          const im = await page.evaluate(IN.basic);
          if (!im.imm) fail(tag, '按「沉浸」沒進整頁沉浸');
          else {
            if (!im.crumbsHidden) fail(tag + ' 沉浸', '麵包屑沒藏');
            if (im.hscroll) fail(tag + ' 沉浸', '左右捲動 ' + im.hscroll + 'px');
            if (im.mast.length) fail(tag + ' 沉浸', '頂列和齒輪／帳號重疊：' + im.mast.join('、'));
            await page.keyboard.press('Escape'); await page.waitForTimeout(600);
            if ((await page.evaluate(IN.basic)).imm) { fail(tag + ' 沉浸', 'Esc 沒退出'); await page.click('#mast-imm').catch(() => {}); await page.waitForTimeout(500); }
          }
        }
        // 作答、提示框、開解答
        await answerAndExplain(page);
        let hit = await page.evaluate(IN.near); if (hit.length) fail(tag, '作答後提示框蓋到 ' + hit.join('、'));
        const so = await page.evaluate(IN.sol);
        if (so.none) fail(tag, '打不開逐句解題');
        else {
          const n = TR[y][q].length;
          if (so.sentences !== n) fail(tag, '逐句下拉 ' + so.sentences + ' 句，旁白表 ' + n + ' 句');
          if (so.scene < 80) fail(tag, '解題畫面寬只有 ' + so.scene + 'px');
          if (!so.stuck) fail(tag, '播放列沒黏住（捲進解題卡後在 ' + so.tr + '，視窗高 ' + S.h + '）');
          hit = await page.evaluate(IN.near); if (hit.length) fail(tag, '解答中提示框蓋到 ' + hit.join('、'));
          b = await page.evaluate(IN.basic); if (b.hscroll) fail(tag + ' 開解答', '左右捲動 ' + b.hscroll + 'px');
          if (b.over.length) note(tag + ' 開解答', '文字溢出 ' + b.over.length + ' 處：' + b.over.slice(0, 3).join('、'));
          if (shotDir && q === QLIST[0][1] && y === QLIST[0][0]) { await page.evaluate(() => document.getElementById('workpad').scrollIntoView({ block: 'start' })); await page.waitForTimeout(300); const file = path.join(shotDir, `${sk}${sideOpen ? '-side' : ''}-${y}-${q}-2解答.png`); await page.screenshot({ path: file }); tiles.push([S.label + (sideOpen ? '・側板開' : '') + '・解答', file]); }
          if (sideOpen) {
            const sd = await page.evaluate(IN.side);
            if (!sd.open) fail(tag, '設成打開側板，但側板沒開');
            else { if (sd.hits.length) fail(tag, '側板蓋到 ' + sd.hits.join('、')); if (sd.paperW < 500) fail(tag, '側板開時試卷只剩 ' + sd.paperW + 'px 寬'); }
          } else {
            const ed = await page.evaluate(IN.edge); if (ed.length) fail(tag, '側標籤蓋到 ' + ed.slice(0, 4).join('、') + (ed.length > 4 ? ' 等 ' + ed.length + ' 處' : ''));
            // 逐句走完（只在手機直放，或只量一種尺寸時）
            if (sk === sizes[0][0]) {
              await page.evaluate(() => { const s = document.getElementById('sentence'); s.value = 0; s.dispatchEvent(new Event('change')); }); await page.waitForTimeout(300);
              let steps = 0; for (let i = 0; i < 120; i++) { const ok = await page.evaluate(() => { const n = document.getElementById('next'); if (!n || n.disabled) return false; n.click(); return true; }); if (!ok) break; steps++; await page.waitForTimeout(90); }
              const at = await page.evaluate(() => +document.getElementById('sentence').value);
              if (at !== so.sentences - 1) fail(tag, '按「下一句」' + steps + ' 次停在第 ' + (at + 1) + ' 句（共 ' + so.sentences + ' 句）');
            }
            // 解題卡沉浸
            await page.evaluate(() => document.getElementById('workpad').scrollIntoView({ block: 'start' }));
            const ib = page.locator('#immersive');
            if (await ib.count() && await ib.isVisible()) {
              await ib.click(); await page.waitForTimeout(900);
              const ci = await page.evaluate(() => { const w = document.getElementById('workpad').getBoundingClientRect(), t = document.querySelector('#workpad>.transport').getBoundingClientRect(); return { on: document.documentElement.classList.contains('learn-immersive'), w: Math.round(w.width), tb: Math.round(t.bottom), H: innerHeight, W: innerWidth }; });
              if (!ci.on) fail(tag, '按解題卡沉浸沒進沉浸');
              else {
                if (ci.w < ci.W * 0.9) fail(tag + ' 解題卡沉浸', '卡寬 ' + ci.w + 'px（視窗 ' + ci.W + '）');
                if (ci.tb > ci.H + 1) fail(tag + ' 解題卡沉浸', '播放列底 ' + ci.tb + 'px 超出螢幕（' + ci.H + '）');
                hit = await page.evaluate(IN.near); if (hit.length) fail(tag + ' 解題卡沉浸', '提示框蓋到 ' + hit.join('、'));
                await page.keyboard.press('Escape'); await page.waitForTimeout(600);
                if ((await page.evaluate(IN.basic)).cardImm) fail(tag + ' 解題卡沉浸', 'Esc 沒退出');
              }
            } else fail(tag, '找不到解題卡的沉浸鍵');
          }
        }
        for (const e of errs) fail(tag, '主控台錯誤 ' + e);
        if (miss.length) fail(tag, '404：' + [...new Set(miss)].slice(0, 4).join('、'));
        combos++;
        if (opt.verbose && fails.length === before) console.log('合格 ' + tag);
      }
      // 沉浸中換題（每種尺寸一次，用清單第一題換到同年度另一題）
      if (!sideOpen) {
        const [y, q] = QLIST[0], others = Object.keys(TR[y]).map(Number).filter(n => n !== q), to = others[0], tag = y + '-' + q + ' ' + sk + ' 沉浸換題';
        if (to) {
          await page.goto(base + 'exam-' + y + '.html?q=' + q + nc, { waitUntil: 'load' }); await page.waitForTimeout(1600);
          await page.click('#mast-imm'); await page.waitForTimeout(700);
          await page.click('#exam-nav a[href*="q=' + to + '"]').catch(e => fail(tag, '點不到第 ' + to + ' 題：' + e.message.split('\n')[0]));
          await page.waitForTimeout(2600);
          let st = await page.evaluate(IN.immState);
          if (+st.q !== to) fail(tag, '點第 ' + to + ' 題後停在第 ' + st.q + ' 題');
          if (!st.imm) fail(tag, '換到第 ' + to + ' 題後跳出沉浸');
          if (st.frame) await page.frameLocator('#imm-frame').locator('body').press('Escape'); else await page.keyboard.press('Escape');
          await page.waitForTimeout(2600);
          st = await page.evaluate(IN.immState);
          if (st.imm) fail(tag, 'Esc 後還在沉浸');
          if (+st.q !== to) fail(tag, 'Esc 退出後回到第 ' + st.q + ' 題（應留在第 ' + to + ' 題）');
        }
      }
      await ctx.close();
    }
  }
  // 拼圖：每種尺寸一格
  if (shotDir && tiles.length) {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 }), pg = await ctx.newPage();
    const html = '<body style="margin:0;background:#222;color:#eee;font:14px sans-serif;display:flex;flex-wrap:wrap;gap:8px;padding:8px;width:1584px">' + tiles.map(([l, f]) => '<figure style="margin:0;width:256px"><img style="width:256px;display:block" src="data:image/png;base64,' + fs.readFileSync(f).toString('base64') + '"><figcaption>' + l + '</figcaption></figure>').join('') + '</body>';
    await pg.setContent(html); await pg.waitForTimeout(300);
    await pg.screenshot({ path: path.join(shotDir, '拼圖.png'), fullPage: true }); await ctx.close();
    console.log('拼圖：' + path.join(shotDir, '拼圖.png').replace(/\\/g, '/') + '（每格截圖在同一資料夾，看完請刪）');
  }
  await browser.close(); if (server) server.close();
  console.log('版面：' + QLIST.length + ' 題 × ' + sizes.length + ' 種尺寸，共 ' + combos + ' 組（' + (opt.site || '本機') + '）');
}

(async () => {
  const t0 = Date.now();
  try {
    if (opt.audio) await audioAudit();
    if (opt.layout) await layoutAudit();
  } catch (e) { fail('程式', e.stack || e.message); }
  for (const n of notes) console.log('注意 ' + n);
  for (const f of fails) console.log('錯 ' + f);
  console.log(fails.length ? '不合格 ' + fails.length + ' 項（注意 ' + notes.length + ' 項），' + Math.round((Date.now() - t0) / 1000) + ' 秒' : '全部合格（注意 ' + notes.length + ' 項），' + Math.round((Date.now() - t0) / 1000) + ' 秒');
  process.exit(fails.length ? 1 : 0);
})();
