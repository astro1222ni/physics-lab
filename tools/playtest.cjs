#!/usr/bin/env node
/*
 * playtest.cjs — 自動試玩（A 層：純程式、不耗 AI 額度）：像學生一樣從介面去玩每個實驗，自己找 bug 與不合理之處。
 * （站長 11/12：「你有沒有自己設計有一個試玩系統，可以去玩玩看，然後自我驗證是否有 bug 或者是不合理之處？」）
 *
 * 用法：
 *   node tools/playtest.cjs                    全部已上線的實驗（每頁約 2 分鐘）
 *   node tools/playtest.cjs earthquake kepler  只試玩指定的實驗
 *   --seed=N      亂數種子（預設 1112；每個實驗再混入代號，同一個種子每次按的順序都一樣）
 *   --steps=N     亂按步數（預設 150）
 *   --until=K     重現用：只做亂按的前 K 步，截圖、印出每一步後停（搭配報告裡的種子與步驟序號）
 *   --changed     只跑和上次紀錄不同的實驗（verify 用），沒改過的沿用上次結果；
 *                 第一次沒有紀錄時只記下目前版本、不試玩（完整紀錄請跑 npm run playtest）
 *   --no-shots    不截圖
 *   --quiet       終端機只印總表
 *
 * 每個實驗做四件事：
 *   1. 任務說明對介面：公開任務的中英文說明裡用「」或 “ ” 括起來的字，要在對應語言的頁面上找得到同名的
 *      按鈕、label、選項、分段按鈕或 aria-label（寬鬆比對：去空白、全半形、大小寫）。會先把每個按鈕、選項、勾選框都點過一次，
 *      切到別的模式才出現的元件也算。說明裡寫「按／選／打開…「X」」卻找不到 → 確定是問題；看不出是不是元件名稱的 → 待人工確認。
 *   2. 亂按測試：固定亂數種子，約 150 個隨機操作（按鈕、滑桿〔隨機值、最小、最大〕、數字欄打極端值、勾選框、下拉選單、
 *      畫布拖曳、2D／3D 切換、中途換成 390 px 寬），每 5 步檢查：頁面錯誤、主控台錯誤、畫面文字出現 NaN／Infinity／
 *      undefined／null／[object、左右捲動、主畫布整片空白、滑桿旁顯示的數字和滑桿實際值（LabNum.value）不一致。
 *   3. 預設狀態不觸發任務：只載入頁面、不操作等 10 秒（讓自動播放跑），任何任務都不可以完成；亂按時意外完成的任務另外列出。
 *   4. 數值合理性：% 在 0–100、pH 在 0–14、機率在 0–1、溫度（K）不為負、長度／質量／時間類讀數不為負
 *      （位移、速度、電荷等有正負意義的量照名稱排除；名稱看不出來的列「待人工確認」）。
 * 結果：.shots/playtest-report.json（每個問題附截圖路徑與重現方式）、截圖 .shots/playtest/、紀錄 .shots/playtest-cache.json。
 * 已人工確認不是問題的項目放 tools/playtest/exclude.cjs（每一項都要寫原因）。
 *
 * 安全：擋掉所有對外連線、用 tools/mock-backend.js 假後端（絕不寫入正式 Firebase）；瀏覽器用 tools/browser.cjs
 *（Intel 內顯、低於標準優先權），同一時間只開一個瀏覽器、一次只跑一頁。
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const VERSION = 1; // 檢查方式有實質改變時加一，--changed 會全部重跑
const SHOTS = path.join(ROOT, '.shots');
const SHOT_DIR = path.join(SHOTS, 'playtest');
const REPORT = path.join(SHOTS, 'playtest-report.json');
const CACHE = path.join(SHOTS, 'playtest-cache.json');
const rel = p => path.relative(ROOT, p).split(path.sep).join('/');

// ======================= 共用：實驗清單、任務、排除清單、版本雜湊 =======================
function readLive() {
  const w = {};
  new Function('window', fs.readFileSync(path.join(ROOT, 'js/missions/index.js'), 'utf8'))(w);
  return w.LAB_LIVE_MODULES || [];
}
function loadMissions(slug) {
  const f = path.join(ROOT, 'js/missions', slug + '.js');
  if (!fs.existsSync(f)) return [];
  const list = [];
  const LM = { register: (m, l) => { if (m === slug) list.push(...l); }, emit() {}, on() {}, all: () => ({}) };
  try { new Function('window', 'LabMission', fs.readFileSync(f, 'utf8'))({ LabMission: LM }, LM); } catch (e) { return []; }
  return list;
}
function loadExclude() {
  try { delete require.cache[require.resolve('./playtest/exclude.cjs')]; return require('./playtest/exclude.cjs'); } catch (e) { return {}; }
}
function exclOf(excl, slug) {
  const a = excl['*'] || {}, b = excl[slug] || {};
  const m = k => [].concat(a[k] || [], b[k] || []);
  return { terms: m('terms'), skip: m('skip'), readings: m('readings'), sliders: m('sliders') };
}
/** 四頁以上共用的程式（settings、missions、numinput…）不算進個別實驗的版本，免得改一個共用檔就全部重跑 */
function sharedScripts(live) {
  const cnt = {};
  for (const s of live) {
    const f = path.join(ROOT, s + '.html');
    if (!fs.existsSync(f)) continue;
    new Set([...fs.readFileSync(f, 'utf8').matchAll(/src="(js\/[^"?]+\.js)/g)].map(m => m[1])).forEach(x => { cnt[x] = (cnt[x] || 0) + 1; });
  }
  return new Set(Object.keys(cnt).filter(k => cnt[k] >= 4));
}
function pageDeps(slug, shared) {
  const html = slug + '.html';
  const fp = path.join(ROOT, html);
  const h = fs.existsSync(fp) ? fs.readFileSync(fp, 'utf8') : '';
  const deps = new Set([html, 'js/missions/' + slug + '.js']);
  for (const m of h.matchAll(/src="(js\/[^"?]+\.js)/g)) if (!shared.has(m[1])) deps.add(m[1]);
  for (const f of fs.readdirSync(path.join(ROOT, 'js'))) if (f.startsWith(slug + '.') || f.startsWith(slug + '-')) deps.add('js/' + f);
  return [...deps].sort();
}
/** 實驗的版本：頁面（去掉 ?v= 版本號）、它自己的程式與任務檔、排除清單、本工具的檢查版本 */
function pageHash(slug, shared, excl) {
  const hh = crypto.createHash('sha1').update('v' + VERSION + '|' + JSON.stringify(exclOf(excl, slug)));
  for (const d of pageDeps(slug, shared)) {
    const fp = path.join(ROOT, d);
    let c = fs.existsSync(fp) ? fs.readFileSync(fp, 'utf8') : '';
    if (d.endsWith('.html')) c = c.replace(/\?v=\d+/g, '');
    hh.update(d + '\0' + c + '\0');
  }
  return hh.digest('hex');
}

// ======================= 任務說明裡的介面名稱 =======================
// 引號前後出現這些字，表示引號裡是要學生操作的元件
const ZH_B = /(按|按下|按一下|點|點選|點一下|點擊|選|選擇|選取|選用|切到|切換到|切換成|切成|切回|打開|開啟|關閉|關掉|勾選|勾|取消勾選|改成|改用|換成|換到|使用|在|進入|設為|設成|調成|調到|啟用)\s*$/;
const ZH_A = /^\s*(按鈕|鈕|模式|選項|分頁|頁籤|開關|情境|功能|勾選框|方框|選單|樣品|面板|視角|檢視)/;
const EN_B = /\b(press(?:ing)?|click(?:ing)?|tap(?:ping)?|choos(?:e|ing)|select(?:ing)?|pick(?:ing)?|switch(?:ing)? to|turn(?:ing)? on|turn(?:ing)? off|open(?:ing)?|enabl(?:e|ing)|tick(?:ing)?|check(?:ing)?|untick|uncheck|us(?:e|ing)|in|into|with|set\b.{0,50}\bto|hit)\s*$/i;
const EN_A = /^\s*(button|mode|option|tab|toggle|switch|preset|panel|scene|view|setting|checkbox|box|on\b|off\b)/i;

function extractTerms(missions) {
  const out = [];
  for (const m of missions) {
    if (m.hidden) continue;
    for (const lang of ['zh', 'en']) {
      const list = [];
      [m.title && m.title[lang], m.desc && m.desc[lang]].forEach(s => {
        if (!s) return;
        const rx = lang === 'zh' ? /「([^「」]{1,40})」/g : /[“"]([^“”"]{1,60})[”"]|‘([^‘’]{1,40})’/g;
        for (const mm of s.matchAll(rx)) {
          const term = (mm[1] || mm[2] || '').trim();
          if (!term) continue;
          const before = s.slice(Math.max(0, mm.index - 60), mm.index), after = s.slice(mm.index + mm[0].length, mm.index + mm[0].length + 12);
          const ui = lang === 'zh' ? (ZH_B.test(before.slice(-12)) && !/^的/.test(after)) || ZH_A.test(after) : EN_B.test(before) || EN_A.test(after);
          const formula = /[×÷=]|\s[-+−]\s/.test(term); // 例如「斜率 × (M + m)」：是公式，不是元件
          list.push({ mission: m.id, level: m.level, lang, term, ui: ui && !formula, formula, ctx: (before.slice(-10) + mm[0] + after.slice(0, 6)).replace(/\s+/g, ' ') });
        }
      });
      out.push(...list);
    }
  }
  // 同一個任務中英文的引號數量一樣時，依順序配對（英文找不到、中文找得到 → 多半是英文翻譯和介面不一致）
  const by = {};
  out.forEach(t => { (by[t.mission] = by[t.mission] || { zh: [], en: [] })[t.lang].push(t); });
  Object.values(by).forEach(p => { if (p.zh.length === p.en.length) p.en.forEach((t, i) => { t.pair = p.zh[i]; }); });
  return out;
}
/** 寬鬆比對用：全半形（NFKC）、大小寫、空白、引號、破折號、圖示符號 */
function norm(s) {
  return String(s || '').normalize('NFKC').toLowerCase()
    .replace(/[’‘`´]/g, "'").replace(/[“”]/g, '"').replace(/[−–—]/g, '-')
    .replace(/[←-⇿⌀-⏿■-➿⬀-⯿\u{1f300}-\u{1faff}]/gu, '')
    .replace(/[\s ​]+/g, '').replace(/[：:，,。.!！?？…]+$/, '');
}
/** 比對時再去掉標點（例如說明寫 “Set-up & λ”、按鈕是「Setup & λ」，算同一個） */
const loose = s => String(s || '').replace(/[-'"_.,:;·・、，：；（）()[\]「」]/g, '');
function matchName(term, names) {
  const t = loose(norm(term));
  if (!t) return null;
  for (const n0 of names) {
    const n = loose(n0);
    if (!n) continue;
    if (n.includes(t)) return n;
    if (n.length >= 2 && t.includes(n) && n.length >= 0.6 * t.length) return n;
  }
  return null;
}
/** 頁面自己的原始碼（HTML＋程式，不含任務檔與共用程式），去掉標籤後正規化，給 judgeTerms 查字樣用 */
function pageSource(slug, shared) {
  return loose(norm(pageDeps(slug, shared).filter(d => !d.startsWith('js/missions/')).map(d => {
    const fp = path.join(ROOT, d);
    return fs.existsSync(fp) ? fs.readFileSync(fp, 'utf8') : '';
  }).join('\n').replace(/<\/?(?:sub|sup|b|i|strong|em|span|br|small|code|kbd)\b[^<>]*>/gi, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')));
}
function judgeTerms(terms, namesBy, ex, missions, src) {
  const items = [];
  const res = new Map();
  const skip = new Set(ex.terms.map(norm));
  (missions || []).forEach(m => { if (m.title) ['zh', 'en'].forEach(l => { if (m.title[l]) skip.add(norm(m.title[l])); }); }); // 引用別的任務標題
  for (const t of terms.filter(x => x.lang === 'zh').concat(terms.filter(x => x.lang === 'en'))) {
    if (skip.has(norm(t.term))) { res.set(t, 'skip'); continue; }
    // 公式（例如「斜率 × (M + m)」）、不是操作情境的單一個字（例如「負」的試探電荷）：不是元件名稱
    if (t.formula || (!t.ui && !(t.pair && t.pair.ui) && t.lang === 'zh' && [...norm(t.term)].length <= 1)) { res.set(t, 'skip'); continue; }
    const N = namesBy[t.lang];
    if (!N) continue;
    const L = t.lang === 'zh' ? '中文' : '英文';
    const q = t.lang === 'zh' ? '「' + t.term + '」' : '“' + t.term + '”';
    const ui = t.ui || (t.pair && t.pair.ui);
    const base = { mission: t.mission, lang: t.lang, term: t.term, repro: '看任務 ' + t.mission + ' 的' + L + '說明：…' + t.ctx + '…', shot: N.shot || null };
    let r = 'ok';
    if (matchName(t.term, N.vis)) r = 'ctrl';
    else if (matchName(t.term, N.all)) {
      if (ui) { r = 'hidden'; items.push(Object.assign({ level: 'pending', kind: 'term', msg: t.mission + ' ' + L + '說明要操作 ' + q + '：頁面有這個元件，但把每個按鈕、選項都點過一次仍沒看到它出現' }, base)); }
    } else if ([...N.text].some(x => loose(x).includes(loose(norm(t.term))))) {
      if (ui) { r = 'text'; items.push(Object.assign({ level: 'pending', kind: 'term', msg: t.mission + ' ' + L + '說明要操作 ' + q + '：畫面上只有同名的文字，不是可以按或選的元件' }, base)); }
    } else {
      const pairOk = t.lang === 'en' && t.pair && res.get(t.pair) === 'ctrl';
      const inSrc = src && src.includes(loose(norm(t.term))); // 頁面原始碼裡有這段字：多半是要特定狀態才出現的按鈕字樣，試玩沒點到
      if (inSrc && pairOk) r = 'src'; // 中文元件找得到、英文字樣也寫在程式裡（例如「放繩到 r1」只在目標半徑比現在大時出現）
      else if (inSrc && ui) {
        r = 'src';
        items.push(Object.assign({ level: 'pending', kind: 'term', msg: t.mission + ' ' + L + '說明要操作 ' + q + '：頁面程式裡有這個字樣，但試玩時沒點出這個元件（可能要特定條件才出現）' }, base));
      } else if (ui || pairOk) {
        r = 'missing';
        items.push(Object.assign({ level: 'confirmed', kind: 'term', msg: t.mission + ' ' + L + '說明要操作 ' + q + '，' + L + '頁面上找不到同名的按鈕、選項、勾選框或標籤' +
          (pairOk ? '（中文「' + t.pair.term + '」有對應的元件，多半是英文說明和英文介面用字不一致）' : '') }, base));
      } else {
        r = 'unknown';
        items.push(Object.assign({ level: 'pending', kind: 'term', msg: t.mission + ' ' + L + '說明裡的 ' + q + ' 在頁面上找不到（若只是引用一句話、聲音或公式，不是元件名稱，可加進 tools/playtest/exclude.cjs）' }, base));
      }
    }
    res.set(t, r);
  }
  return items;
}

// ======================= 數字與讀數 =======================
const NUM = /([-+]?)((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)(?:\s*[×x·]\s*10\^\(([-+]?\d+)\))?/g;
/** 滑桿旁顯示的所有數字（例如「9 月 24 日（第 267 天）」三個都算；「04:45」另外算成 4.75 時） */
function parseShown(text) {
  const s = String(text || '').replace(/[−–]/g, '-').replace(/ /g, ' ');
  const out = [];
  for (const m of s.matchAll(NUM)) {
    const mant = m[2].replace(/,/g, '');
    const dec = mant.includes('.') ? mant.split('.')[1].length : 0;
    const exp = m[3] ? +m[3] : 0;
    const v = (m[1] === '-' ? -1 : 1) * parseFloat(mant) * Math.pow(10, exp), tol = 0.5 * Math.pow(10, exp - dec);
    out.push({ v, tol });
    // 「33.87°S」「南緯 33.87°」「120°W」：南緯、西經是負的
    if (/^\s*°?\s*[SW](?![A-Za-z])/.test(s.slice(m.index + m[0].length)) || /(南緯|西經)\s*$/.test(s.slice(0, m.index))) out.push({ v: -v, tol });
    if (out.length >= 6) break;
  }
  const hm = s.match(/(-?)(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (hm) out.push({ v: (hm[1] ? -1 : 1) * (+hm[2] + hm[3] / 60 + (hm[4] ? hm[4] / 3600 : 0)), tol: hm[4] ? 1 / 7200 : 1 / 120 });
  // 「6 月 21 日」「21 June」「Jun 21」：也算成一年中的第幾天（從 1 或 0 起算都試，平年）
  const MD = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  let md = s.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/), mo = 0, dd = 0;
  if (md) { mo = +md[1]; dd = +md[2]; } else if ((md = s.match(/(\d{1,2})\s+([A-Za-z]{3})[a-z]*/)) && MON.includes(md[2].toLowerCase())) { mo = MON.indexOf(md[2].toLowerCase()) + 1; dd = +md[1]; } else if ((md = s.match(/\b([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})\b/)) && MON.includes(md[1].toLowerCase())) { mo = MON.indexOf(md[1].toLowerCase()) + 1; dd = +md[2]; }
  if (mo >= 1 && mo <= 12 && dd >= 1) out.push({ v: MD[mo - 1] + dd, tol: 0.5 }, { v: MD[mo - 1] + dd - 1, tol: 0.5 });
  return out;
}
const UNITS = {
  pct: ['%', '％'],
  kelvin: ['K'],
  mass: ['kg', 'mg', 'μg', 'µg', 'g', 'u', '公斤', '公克', '克', '噸'],
  length: ['km', 'cm', 'mm', 'nm', 'μm', 'µm', 'pm', 'fm', 'Å', 'AU', 'ly', 'm', '公尺', '公分', '公里', '公釐', '光年'],
  time: ['ms', 'μs', 'µs', 'ns', 'min', 'hr', 'yr', 's', 'h', 'd', '年', '天', '小時', '分鐘', '秒']
};
function unitKind(tok) {
  if (!tok || /^[/·⋅*^]/.test(tok)) return null;
  for (const k of Object.keys(UNITS)) {
    for (const u of UNITS[k].slice().sort((a, b) => b.length - a.length)) {
      if (!tok.startsWith(u)) continue;
      const next = tok[u.length];
      if (next === undefined || /[一-鿿）)。，、;；:：]/.test(next)) return k;
    }
  }
  return null;
}
/** 讀數裡的每一個數字＋單位 */
function quantities(text) {
  const s = String(text || '').replace(/[−–]/g, '-').replace(/ /g, ' ');
  const rx = /(^|[^0-9A-Za-z_^.)\]/Ͱ-Ͽ])([-+]?)((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)(?:\s*[×x·]\s*10\^\(([-+]?\d+)\))?\s*([^\s\d,;:，；：、()（）[\]=]{0,10})/g;
  const out = [];
  for (const m of s.matchAll(rx)) {
    let neg = m[2] === '-';
    if (neg && m[1] && !/[\s=＝:：(（≈~約]/.test(m[1])) neg = false; // 「5−3」這種算式不算負數
    const v = (neg ? -1 : 1) * parseFloat(m[3].replace(/,/g, '')) * Math.pow(10, m[4] ? +m[4] : 0);
    const idx = m.index + m[1].length;
    out.push({ v, unit: m[5] || '', kind: unitKind(m[5] || ''), before: s.slice(Math.max(0, idx - 24), idx) });
  }
  return out;
}
const SIGNED = /位移|位置|潮位|水位|海平面|海拔|基準|座標|坐標|速度|加速度|電荷|電位|電勢|電壓|電動勢|電流|力|功|能|動量|角|相位|斜率|高度|深度|像距|物距|焦距|曲率|放大率|偏|差|變化|改變|增|減|誤差|殘差|修正|Δ|δ|淨|合|displacement|position|coordinate|velocity|acceleration|charge|potential|voltage|emf|current|force|work|energy|momentum|angle|phase|slope|height|depth|image|object|focal|curvature|magnification|offset|error|residual|change|difference|net|shift|correction|level|elevation|tide/i;
const SIGNED_VAR = /(^|[^A-Za-z])(x|y|z|v|a|F|q|U|E|W|p|s|h)([^A-Za-z]|$)/;
const CHANGE = /Δ|δ|差|變化|改變|增|減|誤差|殘差|偏|change|difference|error|deviation|residual|shift|loss|虧損|defect/i;
const COMPARE = /比|暖|冷|高於|低於|高出|距平|warmer|cooler|colder|than|anomal/i; // 和某個基準比較的量（溫差）
const FRACTION = /機率|概率|比例|百分比|佔|透射|穿透|反射|吸收|效率|飽和|濕度|含量|進度|覆蓋|fraction|probability|transmi|reflect|absor|efficien|humidity|percent|progress|coverage|share/i;
const LEN_POS = /波長|半徑|直徑|距離|長度|周長|厚度|寬度|間距|間隔|射程|路程|行程|wavelength|radius|diameter|distance|length|thickness|width|spacing|separation|range|path/i;
const TIME_POS = /週期|周期|半衰期|時間|時刻|走時|經過|持續|壽命|period|half-life|time|duration|elapsed|lifetime|travel/i;
const PROB = /機率|概率|probability|chance|p\s*值|p-value/i;

function judgeReading(q, ctx, i) {
  const v = q.v;
  if (q.kind === 'pct' && (v < 0 || v > 100)) {
    if (CHANGE.test(ctx) || SIGNED.test(ctx)) return null; // 誤差、變化量的百分比本來就可以是負的或超過 100
    if (/[^\s(（]\s*[(（]\s*$/.test(q.before)) return null; // 緊跟在另一個數值後面括號裡的 %，例如「1.008 × 10^11 C/kg（−42.7%）」是和公認值的偏差
    if (v > 100 && !FRACTION.test(ctx)) return { level: 'pending', rule: '%', why: '百分比超過 100（看不出是不是比例類的量）' };
    return { level: 'confirmed', rule: '%', why: '百分比應在 0–100' };
  }
  if (/pH\s*[=＝:：]?\s*$/.test(q.before) || (i === 0 && !q.unit && /^\s*pH\b/i.test(ctx))) {
    if (v < 0 || v > 14) return { level: 'confirmed', rule: 'pH', why: 'pH 應在 0–14' };
    return null;
  }
  if (!q.kind && !q.unit && PROB.test(ctx) && (v < 0 || v > 1)) return { level: 'confirmed', rule: 'prob', why: '機率應在 0–1' };
  if (v >= 0) return null;
  // 「比 1750 年的平衡暖 −96 K」「warmer than …」「距平」是溫差，可以是負的
  if (q.kind === 'kelvin') return CHANGE.test(ctx) || COMPARE.test(ctx) ? null : { level: 'confirmed', rule: 'K', why: '絕對溫度（K）不可為負' };
  if (q.kind === 'mass') return CHANGE.test(ctx) ? null : { level: 'confirmed', rule: 'mass', why: '質量不可為負' };
  if (q.kind === 'length') {
    if (SIGNED.test(ctx) || SIGNED_VAR.test(ctx)) return null;
    if (LEN_POS.test(ctx)) return { level: 'confirmed', rule: 'length', why: '長度、距離類的讀數不可為負' };
    return { level: 'pending', rule: 'length', why: '長度單位的讀數是負的（看不出這個量有沒有正負意義）' };
  }
  if (q.kind === 'time') {
    if (CHANGE.test(ctx) || /lag|offset|相位|phase|提前|延遲/i.test(ctx)) return { level: 'pending', rule: 'time', why: '時間差是負的（可能本來就可以這樣）' };
    if (TIME_POS.test(ctx)) return { level: 'confirmed', rule: 'time', why: '時間、週期類的讀數不可為負' };
    return { level: 'pending', rule: 'time', why: '時間單位的讀數是負的（看不出這個量有沒有正負意義）' };
  }
  return null;
}
function fmtNum(v) { return Math.abs(v) >= 1e5 || (Math.abs(v) < 1e-3 && v !== 0) ? v.toExponential(3) : String(+v.toFixed(6)); }

// ======================= 截圖：PNG 解碼，判斷畫布是不是整片空白 =======================
function pngStats(buf) {
  if (!buf || buf.length < 33 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  let off = 8, w = 0, h = 0, bd = 0, ct = 0, il = 0;
  const idat = [];
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString('ascii', off + 4, off + 8), data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bd = data[8]; ct = data[9]; il = data[12]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  const ch = { 0: 1, 2: 3, 4: 2, 6: 4 }[ct];
  if (bd !== 8 || il !== 0 || !ch || !w || !h) return null;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch, img = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? img[dst + x - ch] : 0, b = y ? img[dst - stride + x] : 0, c = x >= ch && y ? img[dst - stride + x - ch] : 0;
      let v = raw[src + x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      img[dst + x] = v & 255;
    }
  }
  let n = 0, s = 0, s2 = 0;
  const colors = new Set();
  const st = Math.max(1, Math.floor(Math.sqrt(w * h / 40000)));
  for (let y = 0; y < h; y += st) for (let x = 0; x < w; x += st) {
    const i = y * stride + x * ch, r = img[i], g = ch >= 3 ? img[i + 1] : r, b = ch >= 3 ? img[i + 2] : r;
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    n++; s += L; s2 += L * L;
    colors.add((r >> 3) << 10 | (g >> 3) << 5 | (b >> 3));
  }
  const mean = s / n;
  return { w, h, std: Math.sqrt(Math.max(0, s2 / n - mean * mean)), colors: colors.size };
}

// ======================= 頁面裡的工具（addInitScript 注入） =======================
function ptHook() {
  const S = window.__pt = { done: [], emits: {}, step: 0, phase: 'idle' };
  let lm;
  try {
    Object.defineProperty(window, 'LabMission', {
      configurable: true, enumerable: true,
      get() { return lm; },
      set(v) {
        lm = v;
        try {
          v.on('complete', m => S.done.push({ id: m.id, level: m.level, hidden: !!m.hidden, step: S.step, phase: S.phase }));
          const e = v.emit;
          v.emit = function (type) { S.emits[type] = (S.emits[type] || 0) + 1; return e.apply(this, arguments); };
        } catch (err) { /* 任務系統沒載入就算了 */ }
      }
    });
  } catch (e) { /* 忽略 */ }
  window.open = function () { return null; }; // 不開新視窗
  window.print = function () {};             // 不跳列印
}

function ptLib() {
  const EXCL = 'header, footer, .notes, .ms-wrap, #comments, .lab-settings, .lab-gear, .lab-set-panel, .lab-tools, .lab-share, .lab-export, .related, .crumbs, .stats-bar, .module-stats, .try-hint, .lab-bigqr, .ms-celebrate, .lab-en-note, .lab-num-hint, .print-only, .lab-restored, .lab-account, .lab-account-menu';
  const BAD_BTN = /列印|下載|複製|分享|全螢幕|登入|登出|送出|留言|檢舉|嵌入|開啟完整版|\bprint\b|download|\bcopy\b|\bshare\b|full ?screen|sign ?in|sign ?out|log ?in|submit|\bpost\b|embed|open full/i;
  const L = window.__ptLib = { n: 0, skip: [] };
  const vis = el => {
    if (!el || !el.isConnected) return false;
    if (el.checkVisibility && !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const excluded = el => !!(el.closest && el.closest(EXCL));
  const roots = () => {
    const w = document.querySelector('.wrap');
    return w ? [...w.children].filter(c => !c.matches(EXCL) && !/^(SCRIPT|STYLE|TEMPLATE|NOSCRIPT)$/.test(c.tagName)) : [document.body];
  };
  const inPlay = (el, rs) => rs.some(r => r.contains(el)) && !excluded(el) && !L.skip.some(s => { try { return el.closest(s); } catch (e) { return false; } });
  const skipTag = c => /^(SCRIPT|STYLE|TEMPLATE|NOSCRIPT)$/.test(c.tagName) || c.tagName.toLowerCase() === 'svg' || (c.classList && c.classList.contains('katex-mathml'));
  function plain(el) {
    let s = '';
    (function w(n) { for (const c of n.childNodes) { if (c.nodeType === 3) s += c.nodeValue; else if (c.nodeType === 1 && !skipTag(c)) { if (c.tagName === 'BR') s += ' '; else w(c); } } })(el);
    return s.replace(/\s+/g, ' ').trim();
  }
  // 讀數用：上標寫成 ^(…)、下標寫成 _…，才不會把 10<sup>−3</sup> 看成負數
  function marked(el) {
    let s = '';
    (function w(n) {
      for (const c of n.childNodes) {
        if (c.nodeType === 3) { s += c.nodeValue; continue; }
        if (c.nodeType !== 1 || skipTag(c) || getComputedStyle(c).display === 'none') continue;
        if (c.tagName === 'SUP') s += '^(' + plain(c) + ')';
        else if (c.tagName === 'SUB') s += '_' + plain(c) + ' ';
        else if (c.tagName === 'BR') s += ' ';
        else w(c);
      }
    })(el);
    return s.replace(/\s+/g, ' ').trim();
  }
  const id = el => el.dataset.ptId || (el.dataset.ptId = String(++L.n));
  const whereOf = el => {
    for (let e = el; e && e !== document.body; e = e.parentElement) if (e.id) return '#' + e.id + (e === el ? '' : ' 裡的 ' + el.tagName.toLowerCase());
    return el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/)[0] : '');
  };
  const nameOf = el => (plain(el) || el.getAttribute('aria-label') || el.title || el.value || el.id || '').replace(/\s+/g, ' ').trim().slice(0, 40);

  /** 可以操作的元件（每次重查；data-pt-id 固定不變） */
  L.actionables = function (step, phase) {
    if (step != null && window.__pt) { window.__pt.step = step; window.__pt.phase = phase; }
    const rs = roots(), items = [];
    const ok = el => inPlay(el, rs) && vis(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true';
    document.querySelectorAll('button, [role=button], [role=tab], summary, input[type=button], input[type=submit]').forEach(el => {
      if (!ok(el) || el.matches('output, #view2d, #view3d, .lab-num-pm') || el.closest('a, .lab-num-edit, form.ms-nick')) return;
      const nm = nameOf(el);
      if (BAD_BTN.test(nm + ' ' + (el.getAttribute('aria-label') || '') + ' ' + (el.title || ''))) return;
      items.push({ id: id(el), kind: 'button', name: nm || whereOf(el) });
    });
    document.querySelectorAll('input[type=range]').forEach(el => { if (ok(el)) items.push({ id: id(el), kind: 'range', name: el.id || whereOf(el) }); });
    document.querySelectorAll('output.lab-num').forEach(el => { if (inPlay(el, rs) && vis(el) && !el.dataset.editing) items.push({ id: id(el), kind: 'num', name: el.id || whereOf(el) }); });
    document.querySelectorAll('input[type=number]').forEach(el => { if (ok(el) && !el.readOnly) items.push({ id: id(el), kind: 'num', field: true, name: el.id || whereOf(el) }); });
    document.querySelectorAll('input[type=checkbox], input[type=radio]').forEach(el => {
      if (!inPlay(el, rs) || el.disabled) return;
      const t = vis(el) ? el : (el.closest('label') || (el.id && document.querySelector('label[for="' + el.id + '"]')));
      if (t && vis(t)) items.push({ id: id(t), kind: 'check', name: nameOf(el.closest('label') || el) || el.id });
    });
    document.querySelectorAll('select').forEach(el => { if (ok(el) && el.options.length >= 2) items.push({ id: id(el), kind: 'select', n: el.options.length, name: el.id || nameOf(el) }); });
    document.querySelectorAll('canvas').forEach(el => {
      if (!inPlay(el, rs) || !vis(el)) return;
      const b = el.getBoundingClientRect();
      if (b.width * b.height >= 8000) items.push({ id: id(el), kind: 'canvas', name: el.id || whereOf(el) });
    });
    return items;
  };

  /** 介面上的名稱（按鈕、label、選項、分段按鈕、aria-label）與實驗區看得到的文字 */
  L.names = function () {
    const rs = roots(), controls = [];
    const CTRL = 'button, [role=button], [role=tab], [role=radio], [role=switch], [role=menuitem], [role=menuitemradio], [role=option], summary, label, legend, input, select';
    const add = (s, v, k) => { s = String(s || '').replace(/\s+/g, ' ').trim(); if (s && s.length <= 120) controls.push([s, v ? 1 : 0, k]); };
    document.querySelectorAll('button, [role=button], [role=tab], [role=radio], [role=switch], [role=menuitem], [role=menuitemradio], [role=option], summary, label, legend, input[type=button], input[type=submit], select, [aria-label]').forEach(el => {
      if (!inPlay(el, rs)) return;
      const v = vis(el), t = el.tagName;
      if (t === 'SELECT') [...el.options].forEach(o => add(plain(o), v, 'option'));
      else if (t === 'INPUT') { if (/^(button|submit)$/.test(el.type)) add(el.value, v, 'button'); } // 滑桿、文字欄的值不是名稱
      else if (t !== 'CANVAS' && t !== 'OUTPUT' && !(el.matches('[aria-label]') && !el.matches(CTRL))) add(plain(el), v, t.toLowerCase()); // 只有 aria-label 的群組不取整組文字
      const al = el.getAttribute('aria-label');
      if (al) add(al, v, 'aria');
      if (el.title && t === 'BUTTON') add(el.title, v, 'title');
    });
    const text = [];
    const walk = el => {
      if (el.matches(EXCL)) return;
      if (!el.querySelector(EXCL)) { if (vis(el)) { const t = el.innerText; if (t && t.trim()) text.push(t.replace(/\s+/g, ' ').trim()); } }
      else [...el.children].forEach(walk);
    };
    rs.forEach(walk);
    return { controls, text };
  };

  /** 每幾步做一次的檢查 */
  L.check = function () {
    const rs = roots();
    const out = { sw: document.documentElement.scrollWidth, vw: window.innerWidth, bad: [], sliders: [], readings: [], canvas: null, viewMsg: '', path: location.pathname };
    // 頁面被撐寬時，找出最外層超出視窗、又不在可捲動容器裡的元素（報告寫出元凶，才知道要改哪裡）
    if (out.sw > out.vw + 1) {
      const scrollsX = function (e) { for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { const ox = getComputedStyle(p).overflowX; if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') return true; } return false; };
      let worst = null;
      document.querySelectorAll('body *').forEach(function (e) {
        const b = e.getBoundingClientRect();
        if (b.width <= 0 || b.right <= out.vw + 1 || scrollsX(e)) return;
        if (worst && worst.contains(e)) return;
        if (!worst || b.right > worst.getBoundingClientRect().right + 0.5) worst = e;
      });
      if (worst) {
        const b = worst.getBoundingClientRect();
        out.wide = worst.tagName.toLowerCase() + (worst.id ? '#' + worst.id : '') + (typeof worst.className === 'string' && worst.className.trim() ? '.' + worst.className.trim().split(/\s+/).join('.') : '') + '（寬 ' + Math.round(b.width) + ' px，右緣 ' + Math.round(b.right) + ' px' + (worst.getAttribute('style') ? '，style="' + worst.getAttribute('style').slice(0, 60) + '"' : '') + '）';
      }
    }
    // 1. 畫面文字不可出現 NaN、Infinity、undefined、null、[object
    const BADRX = /NaN|Infinity|undefined|\bnull\b|\[object/;
    const wk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n; (n = wk.nextNode()) && out.bad.length < 10;) {
      const t = n.nodeValue;
      if (!BADRX.test(t)) continue;
      const p = n.parentElement;
      if (!p || p.closest('script, style, noscript, template, .katex-mathml, .lab-set-panel, .lab-settings') || !vis(p)) continue;
      out.bad.push({ m: t.match(BADRX)[0], ctx: t.replace(/\s+/g, ' ').trim().slice(0, 60), where: whereOf(p), notes: !!p.closest('.notes, #comments, footer') });
    }
    document.querySelectorAll('[aria-label], [title]').forEach(el => {
      if (out.bad.length >= 10) return;
      const v = (el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('title') || '');
      if (BADRX.test(v) && inPlay(el, rs)) out.bad.push({ m: v.match(BADRX)[0], ctx: v.trim().slice(0, 60), where: whereOf(el) + '（aria-label／title，報讀器會念）', notes: false });
    });
    // 2. 滑桿旁的數字與實際值
    document.querySelectorAll('input[type=range]').forEach(r => {
      if (!inPlay(r, rs) || !vis(r)) return;
      const box = r.closest('.slider');
      const o = (box && box.querySelector('output')) || (r.id && (document.getElementById(r.id + 'o') || document.querySelector('output[for~="' + r.id + '"]')));
      if (!o || !vis(o) || o.dataset.editing) return;
      const lab = (r.id && document.querySelector('label[for="' + r.id + '"]')) || (box && box.querySelector('label'));
      out.sliders.push({ id: r.id || whereOf(r), label: lab ? plain(lab).slice(0, 40) : (r.id || ''), text: marked(o), value: window.LabNum ? window.LabNum.value(r) : +r.value, raw: +r.value, step: +r.step || 0, min: +r.min, max: +r.max });
    });
    // 3. 讀數（dl 的 dt／dd、表格、「名稱＋數值」的小元素）
    const seen = new Set();
    const push = (label, el) => {
      if (seen.has(el) || !vis(el) || el.closest('.katex')) return;
      seen.add(el);
      const t = marked(el);
      if (t && /\d/.test(t) && t.length <= 160) out.readings.push({ label: String(label || '').slice(0, 80), text: t, where: whereOf(el) });
    };
    rs.forEach(root => {
      root.querySelectorAll('dl').forEach(dl => {
        if (excluded(dl)) return;
        let lab = '';
        for (const c of dl.children) {
          if (c.tagName === 'DT') lab = marked(c);
          else if (c.tagName === 'DD') push(lab, c);
          else if (c.tagName === 'DIV') { const dt = c.querySelector('dt'), dd = c.querySelector('dd'); if (dt && dd) push(marked(dt), dd); }
        }
      });
      root.querySelectorAll('table').forEach(tb => {
        if (excluded(tb) || !vis(tb)) return;
        const hr = tb.tHead && tb.tHead.rows.length ? tb.tHead.rows[tb.tHead.rows.length - 1] : tb.rows[0];
        const head = hr ? [...hr.cells].map(c => marked(c)) : [];
        [...tb.tBodies].forEach(b => [...b.rows].forEach(tr => {
          const cells = [...tr.cells];
          cells.forEach((td, i) => { if (td.tagName === 'TD') push((head[i] || '') + (i ? '｜' + plain(cells[0]).slice(0, 20) : ''), td); });
        }));
      });
      root.querySelectorAll('*').forEach(el => {
        if (seen.has(el) || excluded(el) || el.closest('dl, table, .slider, button, label, select, option, svg, .katex, canvas, textarea, input, output, [contenteditable], h1, h2, h3, h4')) return;
        if ([...el.children].some(c => !/^(SUP|SUB)$/.test(c.tagName))) return; // 只看最裡層（容許上標、下標）
        const t = plain(el);
        if (!t || t.length > 60 || !/\d/.test(t)) return;
        const prev = el.previousElementSibling;
        const lab = prev && !/^\s*[−\-+]?[\d.]+\s*$/.test(plain(prev)) ? plain(prev) : (el.parentElement ? plain(el.parentElement).replace(t, '') : '');
        push(lab.slice(0, 40), el);
      });
    });
    // 4. 主畫布：實驗區裡看得到的最大畫布
    let best = null, ba = 0;
    document.querySelectorAll('canvas').forEach(c => {
      if (!inPlay(c, rs) || !vis(c)) return;
      const b = c.getBoundingClientRect(), a = b.width * b.height;
      if (a > ba) { ba = a; best = c; }
    });
    if (best && ba >= 8000) out.canvas = id(best);
    const vm = document.getElementById('viewMsg');
    if (vm && vis(vm)) out.viewMsg = plain(vm).slice(0, 120);
    return out;
  };
}

// ======================= 試玩一頁 =======================
const IGNORE_CONSOLE = /firebase|gstatic|ERR_|Failed to load resource|net::/i;
function guard(p, ms, what) {
  let t;
  return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error('TIMEOUT ' + what)), ms); })]).finally(() => clearTimeout(t));
}
const ev = (page, fn, arg) => guard(page.evaluate(fn, arg), 20000, '頁面沒有回應');
function rngOf(seed, slug) {
  let h = seed >>> 0;
  for (const c of slug) h = Math.imul(h ^ c.charCodeAt(0), 2654435761) >>> 0;
  let a = h || 1;
  return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

class Rec {
  constructor(slug, opts) { this.slug = slug; this.opts = opts; this.items = []; this.keys = new Map(); this.step = 0; this.phase = 'load'; this.shots = 0; this.log = []; this.dialogs = []; }
  add(level, kind, msg, extra) {
    const key = kind + '|' + (extra && extra.key || msg).slice(0, 200);
    const ex = this.keys.get(key);
    if (ex) { ex.count++; if (level === 'confirmed' && ex.level === 'pending') ex.level = 'confirmed'; return null; }
    const it = Object.assign({ level, kind, msg, phase: this.phase, step: this.step, count: 1, shot: null }, extra || {});
    delete it.key;
    it.repro = this.repro(it);
    this.items.push(it);
    this.keys.set(key, it);
    return it;
  }
  repro(it) {
    const o = this.opts;
    if (it.phase === 'idle') return '只載入頁面、不操作，等 10 秒（1280 px、繁體、任務模式開）';
    if (/^explore/.test(it.phase)) return '探索：依序把每個按鈕、選項、勾選框點一次（' + (it.phase === 'explore-en' ? 'English' : '繁體') + '，第 ' + it.step + ' 個動作' + (this.lastAct ? '：' + this.lastAct : '') + '）';
    if (it.phase === 'random' && !it.step) return '載入頁面後、還沒操作就出現（1280 px、繁體，亂按前的第一次檢查）';
    if (it.phase === 'random') {
      const a = this.log.find(x => x.step === it.step);
      return 'node tools/playtest.cjs ' + this.slug + ' --seed=' + o.seed + ' --until=' + it.step + '（亂按第 ' + it.step + ' 步' + (a && a.act ? '：' + a.act : '') + '）';
    }
    return '';
  }
}

async function newCtx(browser, base, slug, lang, mdb) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light', acceptDownloads: false });
  await ctx.route(u => !u.href.startsWith(base), r => r.abort()); // 擋掉所有對外連線（正式 Firebase、gstatic、統計）
  await ctx.addInitScript(o => {
    try {
      localStorage.setItem('lab-settings', JSON.stringify({ lang: o.lang, theme: 'auto', fs: 1 }));
      localStorage.setItem('lab-welcome-v1', 'skip');
      localStorage.setItem('lab-try:' + o.slug, '1');
      if (!sessionStorage.getItem('pt-init')) { // 每個瀏覽器環境只設一次：假登入、暱稱、任務清單
        sessionStorage.setItem('pt-init', '1');
        localStorage.setItem('mockuser', 'u1');
        localStorage.setItem('mdb', JSON.stringify(o.mdb));
      }
      sessionStorage.setItem('ms-on:' + o.slug, '1');   // 任務模式開
      sessionStorage.setItem('ms-open:' + o.slug, '0'); // 任務清單收起來，版面和學生剛打開時接近
    } catch (e) { /* 忽略 */ }
  }, { lang, slug, mdb });
  await ctx.addInitScript({ path: path.join(ROOT, 'tools/mock-backend.js') }); // 假後端（必須在上面設好 localStorage 之後）
  await ctx.addInitScript(ptHook);
  await ctx.addInitScript(ptLib);
  return ctx;
}
function attach(page, rec) {
  page.on('pageerror', e => {
    const m = String((e && e.message) || e).split('\n')[0].slice(0, 300);
    const it = rec.add('confirmed', 'pageerror', '頁面錯誤：' + m);
    if (it) rec.needShot = true;
  });
  page.on('console', m => {
    if (m.type() !== 'error' || IGNORE_CONSOLE.test(m.text())) return;
    const it = rec.add('confirmed', 'console', '主控台錯誤：' + m.text().split('\n')[0].slice(0, 300));
    if (it) rec.needShot = true;
  });
  page.on('dialog', d => { rec.dialogs.push({ step: rec.step, phase: rec.phase, msg: d.message().slice(0, 200) }); d.dismiss().catch(() => {}); });
}
async function shot(page, rec, name) {
  if (rec.opts.noShots || rec.shots >= 10) return null;
  rec.shots++;
  const f = path.join(SHOT_DIR, rec.slug + '-' + name + '.png');
  try { await guard(page.screenshot({ path: f, timeout: 10000 }), 15000, '截圖'); return rel(f); } catch (e) { return null; }
}
async function dismiss(page) {
  try { await ev(page, () => document.querySelectorAll('.ms-celebrate').forEach(e => e.click())); } catch (e) { if (/TIMEOUT/.test(e.message)) throw e; }
}
function mergeNames(N, r) {
  r.controls.forEach(([n, v]) => { const k = norm(n); if (!k) return; N.all.add(k); if (v) N.vis.add(k); });
  r.text.forEach(t => { const k = norm(t); if (k) N.text.add(k); });
}
async function navGuard(page, rec, url) {
  let u;
  try { u = new URL(page.url()); } catch (e) { return; }
  if (u.pathname === new URL(url).pathname) return;
  rec.add('pending', 'nav', '操作後離開了實驗頁（到 ' + u.pathname + '）');
  await page.goto(url, { waitUntil: 'load', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(800);
}

/** 檢查目前畫面；st 存滑桿的基準與上一次空白畫布 */
async function check(page, rec, st, N) {
  const r = await ev(page, () => window.__ptLib.check());
  const ex = rec.ex;
  if (r.sw > r.vw + 1 && rec.add('confirmed', 'hscroll', '出現左右捲動：頁面寬 ' + r.sw + ' px，視窗只有 ' + r.vw + ' px' + (r.wide ? '；撐寬的是 ' + r.wide : ''), { key: 'hscroll' + r.vw })) rec.needShot = true;
  r.bad.forEach(b => { if (rec.add(b.notes ? 'pending' : 'confirmed', 'badtext', '畫面文字出現「' + b.m + '」：「' + b.ctx + '」（' + b.where + '）', { key: b.m + b.where })) rec.needShot = true; });
  // 滑桿：第一次看到時記下顯示和實際值的倍率（例如顯示 cm、滑桿是 m）；之後不一致才報
  for (const sl of r.sliders) {
    if (ex.sliders.includes(sl.id)) continue;
    const sh = parseShown(sl.text);
    if (!sh.length || !isFinite(sl.value)) continue;
    // 倍率依「顯示的單位」分開記：同一個滑桿可能小值顯示 mm、大值改顯示 cm（例如 ±50 mm → ±30 cm）
    const key = sl.id + '|' + sl.text.replace(/[\d.,\s−+\-]/g, '');
    const typed = Math.abs(sl.value - sl.raw) > 1e-9 * Math.max(1, Math.abs(sl.raw)); // 打字輸入的精確值還在（或非線性滑桿）
    // 顯示的任何一個數字對得上就算一致；沒有打字的精確值時，差距在滑桿半格以內也算（動畫推滑桿時，旁邊顯示的是更精確的值）
    // 另外容許 0.5% 的相對差：實驗先取 3 位有效數字再顯示（例如 k = 10^−2.87 → 0.00135 → 「0.0014」）是誠實的四捨五入
    const deg = /°/.test(sl.text); // 角度差 360° 算同一個方向（例如滑桿 360、顯示「0.0°」）
    const ok = sc => sh.some(c => {
      let d = Math.abs(c.v - sc * sl.value);
      if (deg && sc === 1) d = Math.abs(((c.v - sl.value) % 360 + 540) % 360 - 180);
      const e = 1e-9 * Math.max(1, Math.abs(sc * sl.value)) + 0.005 * Math.abs(sc * sl.value);
      return d <= c.tol * 1.001 + e || (!typed && sl.step > 0 && d <= Math.abs(sc) * sl.step / 2 + c.tol * 1.001 + e);
    });
    if (!(key in st.scale)) {
      if (sh.every(c => c.v === 0) && (sl.value === 0 || ok(1))) continue; // 例如 0.004 顯示成 0，等下一次再定基準
      const sc = [0, 2, 3, -1, -2, -3, 1, 6, -6, 9, -9, 4, 5, -4, -5, 7, 8, -7, -8, 10, 11, 12, -10, -11, -12].map(n => Math.pow(10, n))
        .concat([60, 1 / 60, 3600, 1 / 3600, 24, 1 / 24, 1440, 1 / 1440]).find(ok); // 例如滑桿是 3、顯示 3.0 × 10^5 m/s；0.1 小時／秒顯示「6 分鐘／秒」
      st.scale[key] = sc == null ? null : sc;
      if (sc == null) rec.add('pending', 'slider', '滑桿「' + sl.label + '」（#' + sl.id + '）旁顯示「' + sl.text + '」，LabNum.value 是 ' + fmtNum(sl.value) + '（第一次看到就不同：可能是換算、非線性滑桿沒用 LabNum.register，或讀值沒用 LabNum.value）', { key: 'base' + key });
      continue;
    }
    const sc = st.scale[key];
    if (sc == null) continue;
    if (!ok(sc)) {
      const it = rec.add('confirmed', 'slider', '滑桿「' + sl.label + '」（#' + sl.id + '）旁顯示「' + sl.text + '」，實際值（LabNum.value）是 ' + fmtNum(sl.value) +
        '，兩者不一致', { key });
      if (it) rec.needShot = true;
    }
  }
  // 數值合理性
  for (const rd of r.readings) {
    if (ex.readings.some(p => new RegExp(p).test(rd.label + ' ' + rd.text))) continue;
    quantities(rd.text).forEach((q, i) => {
      const near = q.before.replace(/[\d.,]+/g, '').trim();
      const ctx = (/[A-Za-z一-鿿Ͱ-Ͽ]/.test(near) ? near + ' ｜ ' : '') + rd.label;
      const j = judgeReading(q, ctx, i);
      if (!j) return;
      const it = rec.add(j.level, 'reading', j.why + '：「' + (rd.label ? rd.label.slice(0, 30) + '：' : '') + rd.text.slice(0, 50) + '」（' + rd.where + '）', { key: j.rule + norm(rd.label).slice(0, 30) + rd.where });
      if (it) rec.needShot = true;
    });
  }
  // 3D 的訊息（例如 3D 中斷、不支援）
  if (r.viewMsg && /中斷|失敗|不支援|無法|lost|fail|not supported|unable/i.test(r.viewMsg)) rec.add('pending', '3d', '3D 檢視顯示訊息：「' + r.viewMsg + '」');
  // 主畫布是不是整片空白（連續兩次才算）
  if (r.canvas) {
    const loc = page.locator('[data-pt-id="' + r.canvas + '"]');
    const stats = async () => { try { return pngStats(await guard(loc.screenshot({ timeout: 8000 }), 12000, '畫布截圖')); } catch (e) { return null; } };
    let s = await stats();
    if (s && s.std < 1.5 && s.colors <= 3) {
      await page.waitForTimeout(1500);
      s = await stats();
      if (s && s.std < 1.5 && s.colors <= 3) {
        const it = rec.add('confirmed', 'blank', '主畫布整片空白（' + s.w + '×' + s.h + '，亮度標準差 ' + s.std.toFixed(2) + '、' + s.colors + ' 種顏色）', { key: 'blank' + r.vw });
        if (it) rec.needShot = true;
      }
    }
  }
  if (r.path !== st.path) await navGuard(page, rec, st.url);
  if (N) mergeNames(N, await ev(page, () => window.__ptLib.names()));
  if (rec.needShot) {
    rec.needShot = false;
    const f = await shot(page, rec, (rec.phase === 'random' ? 's' : rec.phase + '-') + rec.step);
    rec.items.forEach(it => { if (!it.shot && it.kind !== 'term') it.shot = f; });
  }
}

/** 探索：把每個按鈕、選項、勾選框都點一次（剛出現的先點，切到新模式後先把新模式點完），收集介面名稱；有 3D 的頁面最後切進 3D 再點一輪 */
async function explore(page, rec, N, url, maxActs) {
  const seenAt = new Map(), visited = new Set();
  let snap = 0, acts = 0;
  mergeNames(N, await ev(page, () => window.__ptLib.names()));
  const round = async budget => {
    for (let b = 0; b < budget; b++) {
      await dismiss(page);
      acts++;
      const items = (await ev(page, ([s]) => window.__ptLib.actionables(s, 'explore'), [acts])).filter(it => ['button', 'check', 'select'].includes(it.kind));
      snap++;
      const cands = [];
      items.forEach((it, i) => {
        if (!seenAt.has(it.id)) seenAt.set(it.id, snap);
        const ks = it.kind === 'select' ? Array.from({ length: Math.min(it.n, 30) }, (_, k) => it.id + ':' + k) : [it.id];
        ks.forEach(k => { if (!visited.has(k)) cands.push({ it, k, i }); });
      });
      if (!cands.length) return;
      cands.sort((x, y) => seenAt.get(y.it.id) - seenAt.get(x.it.id) || x.i - y.i);
      const c = cands[0];
      visited.add(c.k);
      rec.step = acts;
      rec.lastAct = (c.it.kind === 'select' ? '下拉選單 ' + c.it.name + ' 選第 ' + (+c.k.split(':')[1] + 1) + ' 項' : '按「' + c.it.name + '」');
      const loc = page.locator('[data-pt-id="' + c.it.id + '"]');
      try {
        if (c.it.kind === 'select') await loc.selectOption({ index: +c.k.split(':')[1] }, { timeout: 1500 });
        else await loc.click({ timeout: 1500 });
      } catch (e) { /* 被擋住或消失了，下一個 */ }
      await page.waitForTimeout(250);
      await navGuard(page, rec, url);
      mergeNames(N, await ev(page, () => window.__ptLib.names()));
    }
  };
  await round(maxActs);
  const v3 = page.locator('#view3d');
  if (await v3.count() && await v3.isVisible().catch(() => false)) {
    try {
      rec.lastAct = '切到 3D';
      await v3.click({ timeout: 3000 });
      await page.waitForTimeout(3500);
      mergeNames(N, await ev(page, () => window.__ptLib.names()));
      await round(30);
      await page.locator('#view2d').click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(500);
    } catch (e) { if (/TIMEOUT/.test(e.message)) throw e; }
  }
}

const NUM_VALUES = ['0', '-5', '-0.0001', '99999999', '3.14159265358979', '1e9', '0.000001'];
async function randomAction(page, rng, s) {
  await dismiss(page);
  const items = await ev(page, ([st]) => window.__ptLib.actionables(st, 'random'), [s]);
  const groups = {};
  items.forEach(it => { (groups[it.kind] = groups[it.kind] || []).push(it); });
  const W = { button: 30, range: 25, num: 10, check: 8, select: 8, canvas: 15, wait: 4 };
  const kinds = Object.keys(W).filter(k => k === 'wait' || groups[k]);
  let r = rng() * kinds.reduce((a, k) => a + W[k], 0), kind = kinds[kinds.length - 1];
  for (const k of kinds) { if ((r -= W[k]) < 0) { kind = k; break; } }
  if (kind === 'wait') { await page.waitForTimeout(1000); return '等 1 秒'; }
  const g = groups[kind], it = g[Math.floor(rng() * g.length)];
  const loc = page.locator('[data-pt-id="' + it.id + '"]');
  const T = { timeout: 1500 };
  try {
    if (kind === 'button') { await loc.click(T); return '按「' + it.name + '」'; }
    if (kind === 'check') { await loc.click(T); return '切換勾選「' + it.name + '」'; }
    if (kind === 'select') { const k = Math.floor(rng() * it.n); await loc.selectOption({ index: k }, T); return '下拉選單 ' + it.name + ' 選第 ' + (k + 1) + ' 項'; }
    if (kind === 'range') {
      const m = rng();
      if (m < 0.2) { await loc.focus(T); await page.keyboard.press('Home'); return '滑桿 ' + it.name + ' 拉到最小'; }
      if (m < 0.4) { await loc.focus(T); await page.keyboard.press('End'); return '滑桿 ' + it.name + ' 拉到最大'; }
      const f = 0.02 + 0.96 * rng();
      await loc.scrollIntoViewIfNeeded(T);
      const b = await loc.boundingBox();
      if (!b) return '略過（滑桿不見了）';
      await page.mouse.click(b.x + f * b.width, b.y + b.height / 2);
      return '滑桿 ' + it.name + ' 點在 ' + Math.round(f * 100) + '% 的位置';
    }
    if (kind === 'num') {
      const v = NUM_VALUES[Math.floor(rng() * NUM_VALUES.length)];
      if (it.field) { await loc.fill(v, T); await loc.press('Enter'); return '數字欄 ' + it.name + ' 打 ' + v; }
      await loc.click(T);
      const inp = page.locator('.lab-num-edit input');
      if (!(await inp.count())) return '略過（數字欄沒有變成輸入框）';
      await inp.first().fill(v, T);
      await inp.first().press('Enter');
      return '數字 ' + it.name + ' 直接輸入 ' + v;
    }
    if (kind === 'canvas') {
      const p = [rng(), rng(), rng(), rng()], tap = rng() < 0.3;
      await loc.scrollIntoViewIfNeeded(T);
      const b = await loc.boundingBox();
      const vp = page.viewportSize();
      if (!b) return '略過（畫布不見了）';
      const y0 = Math.max(b.y, 0), y1 = Math.min(b.y + b.height, vp.height);
      const X = f => b.x + b.width * (0.05 + 0.9 * f), Y = f => y0 + (y1 - y0) * (0.05 + 0.9 * f);
      if (tap) { await page.mouse.click(X(p[0]), Y(p[1])); return '點畫布 ' + it.name + '（' + Math.round(p[0] * 100) + '%, ' + Math.round(p[1] * 100) + '%）'; }
      await page.mouse.move(X(p[0]), Y(p[1]));
      await page.mouse.down();
      for (let k = 1; k <= 6; k++) await page.mouse.move(X(p[0] + (p[2] - p[0]) * k / 6), Y(p[1] + (p[3] - p[1]) * k / 6));
      await page.mouse.up();
      return '在畫布 ' + it.name + ' 上拖曳（' + [p[0], p[1], p[2], p[3]].map(x => Math.round(x * 100) + '%').join('、') + '）';
    }
  } catch (e) {
    if (/TIMEOUT/.test(e.message)) throw e;
    return '略過（' + kind + ' ' + it.name + '：' + e.message.split('\n')[0].slice(0, 60) + '）';
  }
  return '';
}

async function playPage(browser, base, slug, opts) {
  const t0 = Date.now();
  const ex = exclOf(opts.excl, slug);
  const rec = new Rec(slug, opts);
  rec.ex = ex;
  const missions = loadMissions(slug);
  const defs = {};
  missions.forEach(m => { defs[m.id] = { stars: m.level }; });
  const mdb = { profiles: { u1: { nickname: '試玩員', pub: false } }, completions: {}, scores: {}, missionDefs: defs, admins: { admin1: true } };
  const url = base + slug + '.html';
  const namesBy = { zh: { vis: new Set(), all: new Set(), text: new Set() }, en: { vis: new Set(), all: new Set(), text: new Set() } };
  const accidental = [];
  let emits = {};
  const setSkip = page => ex.skip.length ? ev(page, s => { window.__ptLib.skip = s; }, ex.skip) : null;
  const hang = (e, what) => {
    if (/TIMEOUT/.test(e.message)) rec.add('confirmed', 'hang', what + '時頁面卡住超過 20 秒沒有回應（可能當掉或無窮迴圈）');
    else rec.add('pending', 'tool', what + '時試玩工具出錯：' + e.message.split('\n')[0].slice(0, 200));
  };

  // A. 預設狀態不觸發任務（等 10 秒）＋ 繁體探索
  if (!opts.until) {
    const ctx = await newCtx(browser, base, slug, 'zh-Hant', mdb);
    const page = await ctx.newPage();
    attach(page, rec);
    try {
      rec.phase = 'idle'; rec.step = 0;
      await guard(page.goto(url, { waitUntil: 'load', timeout: 45000 }), 50000, '載入');
      await setSkip(page);
      await page.waitForTimeout(10000);
      const done = await ev(page, () => window.__pt ? window.__pt.done.slice() : []);
      done.forEach(d => rec.add('confirmed', 'idle-mission', '只載入頁面、沒有任何操作，10 秒內就完成了任務 ' + d.id + '（' + d.level + ' 級' + (d.hidden ? '、隱藏任務' : '') + '）', { mission: d.id }));
      await check(page, rec, { scale: {}, url, path: new URL(url).pathname }, namesBy.zh);
      if (done.length) { const f = await shot(page, rec, 'idle'); rec.items.forEach(it => { if (it.kind === 'idle-mission' && !it.shot) it.shot = f; }); }
      if (!opts.noShots) { try { await page.locator('.lab').first().screenshot({ path: path.join(SHOT_DIR, slug + '-lab-zh.png'), timeout: 10000 }); namesBy.zh.shot = rel(path.join(SHOT_DIR, slug + '-lab-zh.png')); } catch (e) { /* 沒有 .lab */ } }
      rec.phase = 'explore';
      await explore(page, rec, namesBy.zh, url, 80);
    } catch (e) { hang(e, rec.phase === 'idle' ? '載入後等待' : '繁體探索'); }
    await ctx.close().catch(() => {});
  }

  // B. 亂按測試（新的瀏覽器環境，從頭開始，可重現）
  {
    const ctx = await newCtx(browser, base, slug, 'zh-Hant', mdb);
    const page = await ctx.newPage();
    attach(page, rec);
    const rng = rngOf(opts.seed, slug);
    const st = { scale: {}, url, path: new URL(url).pathname };
    const steps = opts.until ? Math.min(opts.until, opts.steps) : opts.steps;
    try {
      rec.phase = 'random'; rec.step = 0;
      await guard(page.goto(url, { waitUntil: 'load', timeout: 45000 }), 50000, '載入');
      await setSkip(page);
      await page.waitForTimeout(1500);
      const has3d = await ev(page, () => { const b = document.getElementById('view3d'); return !!(b && b.checkVisibility && b.checkVisibility()); });
      await check(page, rec, st, opts.until ? null : namesBy.zh);
      const mid = Math.round(opts.steps / 2);
      for (let s = 1; s <= steps; s++) {
        rec.step = s;
        let act;
        const ent = { step: s, act: '' }; // 先放進紀錄：切 3D 那一步中途就會檢查，重現說明要找得到
        rec.log.push(ent);
        if (s === mid) {
          await page.setViewportSize({ width: 390, height: 844 });
          await page.waitForTimeout(500);
          act = '視窗寬度改成 390 px（手機）';
        } else if (has3d && s === 40) {
          await ev(page, ([x]) => { window.__pt.step = x; }, [s]);
          ent.act = '切到 3D、等 3.5 秒（在 3D 畫面檢查）';
          try {
            await page.locator('#view3d').click({ timeout: 3000 });
            await page.waitForTimeout(3500);
            await check(page, rec, st, opts.until ? null : namesBy.zh);
            await page.locator('#view2d').click({ timeout: 3000 });
            await page.waitForTimeout(800);
            act = '切到 3D、等 3.5 秒、再切回 2D';
          } catch (e) { if (/TIMEOUT/.test(e.message)) throw e; act = '切 3D 失敗：' + e.message.split('\n')[0].slice(0, 80); rec.add('pending', '3d', '2D／3D 切換按不下去：' + e.message.split('\n')[0].slice(0, 120)); }
        } else act = await randomAction(page, rng, s);
        ent.act = act;
        await page.waitForTimeout(120);
        await navGuard(page, rec, url);
        if (s % 5 === 0 || s === steps) await check(page, rec, st, opts.until ? null : namesBy.zh);
      }
      const r = await ev(page, () => ({ done: window.__pt.done.slice(), emits: window.__pt.emits }));
      emits = r.emits;
      r.done.forEach(d => {
        accidental.push(d);
        if (d.level >= 6) rec.add('pending', 'accidental', '亂按就完成了 ' + d.level + ' 級任務 ' + d.id + (d.hidden ? '（隱藏任務）' : '') + '（第 ' + d.step + ' 步）：可能太容易誤觸', { mission: d.id, step: d.step });
      });
      if (opts.until) {
        const f = path.join(SHOT_DIR, slug + '-until-' + opts.until + '.png');
        await page.screenshot({ path: f });
        console.log('截圖：' + rel(f));
        rec.items.filter(i => i.level === 'confirmed').forEach(i => console.log('✗ 第 ' + i.step + ' 步：' + i.msg));
      }
    } catch (e) { hang(e, '亂按第 ' + rec.step + ' 步'); }
    await ctx.close().catch(() => {});
  }

  // C. English 探索（只為了比對英文說明和英文介面）
  if (!opts.until) {
    const ctx = await newCtx(browser, base, slug, 'en', mdb);
    const page = await ctx.newPage();
    attach(page, rec);
    try {
      rec.phase = 'explore-en'; rec.step = 0;
      await guard(page.goto(url, { waitUntil: 'load', timeout: 45000 }), 50000, '載入');
      await setSkip(page);
      await page.waitForTimeout(1500);
      if (!opts.noShots) { try { await page.locator('.lab').first().screenshot({ path: path.join(SHOT_DIR, slug + '-lab-en.png'), timeout: 10000 }); namesBy.en.shot = rel(path.join(SHOT_DIR, slug + '-lab-en.png')); } catch (e) { /* 沒有 .lab */ } }
      await explore(page, rec, namesBy.en, url, 80);
    } catch (e) { hang(e, 'English 探索'); }
    await ctx.close().catch(() => {});
  }

  if (!opts.until) { // 收集到的介面名稱存檔：調整判斷規則或排除清單時對照用（不必重開瀏覽器）
    const dump = N => ({ vis: [...N.vis], hidden: [...N.all].filter(x => !N.vis.has(x)), text: [...N.text].sort((a, b) => b.length - a.length).filter((t, i, a) => !a.slice(0, i).some(u => u.includes(t))).slice(0, 60), shot: N.shot || null });
    try { fs.writeFileSync(path.join(SHOT_DIR, slug + '-names.json'), JSON.stringify({ terms: extractTerms(missions).map(t => [t.mission, t.lang, t.term, t.ui]), zh: dump(namesBy.zh), en: dump(namesBy.en) })); } catch (e) { /* 存不了就算了 */ }
  }
  // D. 任務說明對介面
  if (!opts.until) judgeTerms(extractTerms(missions), namesBy, ex, missions, pageSource(slug, sharedScripts(readLive()))).forEach(it => { rec.items.push(Object.assign({ phase: 'terms', step: 0, count: 1 }, it)); });

  const pick = lv => rec.items.filter(i => i.level === lv).map(i => { const o = Object.assign({}, i); if (o.phase === 'explore-en') o.phase = 'explore'; return o; });
  return {
    sec: Math.round((Date.now() - t0) / 1000),
    seed: opts.seed, steps: opts.steps,
    confirmed: pick('confirmed'),
    pending: pick('pending'),
    accidental: accidental.map(d => ({ id: d.id, level: d.level, hidden: d.hidden, step: d.step })),
    emits, dialogs: rec.dialogs.slice(0, 20),
    log: rec.log.map(x => x.step + '. ' + x.act)
  };
}

// ======================= 網頁伺服器與主程式 =======================
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.glb': 'model/gltf-binary', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml' };
function startServer() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      let p;
      try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (e) { res.writeHead(400); res.end(); return; }
      const file = path.join(ROOT, p.endsWith('/') ? p + 'index.html' : p);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}
const readJSON = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };

function summary(report, quiet) {
  const rows = Object.entries(report.pages);
  const lines = [];
  if (!quiet) {
    for (const [slug, p] of rows) {
      if (p.none) continue;
      const nC = p.confirmed.length, nP = p.pending.length;
      lines.push((nC ? '✗ ' : nP ? '? ' : '✓ ') + slug + '：確定 ' + nC + '、待確認 ' + nP + (p.cached ? '（沒改過，沿用上次結果）' : '（' + p.sec + ' 秒）'));
      p.confirmed.forEach(i => lines.push('    ✗ ' + i.msg + (i.count > 1 ? '（共 ' + i.count + ' 次）' : '') + (i.repro ? '\n        重現：' + i.repro : '') + (i.shot ? '\n        截圖：' + i.shot : '')));
      p.pending.forEach(i => lines.push('    ? ' + i.msg + (i.repro && i.phase === 'random' ? '\n        重現：' + i.repro : '')));
      if (p.accidental && p.accidental.length) lines.push('    · 亂按時意外完成：' + p.accidental.map(a => a.id + '（' + a.level + ' 級，第 ' + a.step + ' 步）').join('、'));
    }
    lines.push('');
  }
  lines.push('試玩總表（種子 ' + report.seed + '、每頁亂按 ' + report.steps + ' 步）');
  lines.push('  實驗'.padEnd(28) + '確定  待確認  意外完成');
  let C = 0, P = 0, n = 0, none = 0;
  for (const [slug, p] of rows) {
    if (p.none) { none++; continue; }
    n++; C += p.confirmed.length; P += p.pending.length;
    lines.push('  ' + slug.padEnd(26) + String(p.confirmed.length).padStart(4) + String(p.pending.length).padStart(8) + String((p.accidental || []).length).padStart(10) + (p.cached ? '  （沿用）' : ''));
  }
  lines.push('共 ' + n + ' 個實驗：確定是問題 ' + C + '、待人工確認 ' + P + (none ? '；' + none + ' 個實驗還沒有試玩紀錄' : '') + '。報告：.shots/playtest-report.json');
  return lines.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const val = (k, d) => { const a = args.find(x => x.startsWith('--' + k + '=')); return a ? +a.split('=')[1] : d; };
  const opts = { seed: val('seed', 1112), steps: val('steps', 150), until: val('until', 0), noShots: args.includes('--no-shots') };
  const CHANGED = args.includes('--changed'), QUIET = args.includes('--quiet');
  const live = readLive();
  const only = args.filter(a => !a.startsWith('--')).flatMap(a => a.split(',')).map(a => a.trim().replace(/\.html$/, '')).filter(Boolean);
  const slugs = only.length ? only : live;
  const unknown = slugs.filter(s => !fs.existsSync(path.join(ROOT, s + '.html')));
  if (unknown.length) { console.error('✗ 找不到實驗：' + unknown.join('、') + '（不加 .html，用空格或逗號分開）'); process.exit(2); }
  opts.excl = loadExclude();
  const shared = sharedScripts(live);
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  let cache = readJSON(CACHE);
  if (cache && cache.version !== VERSION) cache = null;
  const report = { at: new Date().toISOString(), seed: opts.seed, steps: opts.steps, pages: {} };
  const writeReport = () => {
    for (const s of slugs) {
      const c = cache && cache.pages[s];
      if (!report.pages[s]) report.pages[s] = c && c.result ? Object.assign({ cached: true }, c.result) : { cached: true, none: true };
    }
    fs.writeFileSync(REPORT, JSON.stringify(report, null, 1));
  };

  let todo = slugs;
  if (CHANGED && !opts.until) {
    if (!cache) {
      cache = { version: VERSION, pages: {} };
      slugs.forEach(s => { cache.pages[s] = { hash: pageHash(s, shared, opts.excl), result: null, at: report.at }; });
      fs.writeFileSync(CACHE, JSON.stringify(cache, null, 1));
      writeReport();
      console.log('試玩：還沒有試玩紀錄，先記下目前 ' + slugs.length + ' 個實驗的版本，這次不試玩（建立完整紀錄：npm run playtest，約 ' + Math.round(slugs.length * 2.2) + ' 分鐘）。');
      return 0;
    }
    // 頁面改過、或上次是用別的種子／步數玩的（例如手動跑 --steps=30），都重玩；第一次只記版本的（result 是 null）沿用
    todo = slugs.filter(s => {
      const c = cache.pages[s];
      return !c || c.hash !== pageHash(s, shared, opts.excl) || (c.result && (c.result.seed !== opts.seed || c.result.steps !== opts.steps));
    });
    if (!QUIET || todo.length) console.log('試玩：' + todo.length + ' 個實驗有改過要重玩' + (todo.length ? '（' + todo.join('、') + '）' : '') + '，' + (slugs.length - todo.length) + ' 個沿用上次結果。');
  }
  if (!cache) cache = { version: VERSION, pages: {} };

  if (todo.length) {
    const { launch } = require('./browser.cjs'); // Intel 內顯、低於標準優先權；4070 留給影片
    const server = await startServer();
    const base = 'http://127.0.0.1:' + server.address().port + '/';
    const browser = await launch();
    report.gpu = browser.labGpu;
    if (!QUIET) console.log('瀏覽器：' + browser.labGpu + '；種子 ' + opts.seed + '、每頁亂按 ' + opts.steps + ' 步' + (opts.until ? '（重現到第 ' + opts.until + ' 步）' : ''));
    let k = 0;
    for (const slug of todo) {
      k++;
      if (!opts.until) { // 清掉這個實驗上次的截圖
        const rx = new RegExp('^' + slug + '-(s\\d+|idle-\\d+|explore(-en)?-\\d+|lab-(zh|en))\\.png$'); // 代號只有英數與連字號
        for (const f of fs.readdirSync(SHOT_DIR)) if (rx.test(f)) fs.rmSync(path.join(SHOT_DIR, f), { force: true });
      }
      const t = Date.now();
      let res;
      try { res = await playPage(browser, base, slug, opts); } catch (e) {
        res = { sec: Math.round((Date.now() - t) / 1000), seed: opts.seed, steps: opts.steps, confirmed: [], pending: [{ level: 'pending', kind: 'tool', msg: '試玩工具出錯：' + e.message.split('\n')[0].slice(0, 200) }], accidental: [], emits: {}, dialogs: [], log: [] };
      }
      if (opts.until) { console.log(res.log.join('\n')); continue; }
      report.pages[slug] = Object.assign({ cached: false }, res);
      cache.pages[slug] = { hash: pageHash(slug, shared, opts.excl), result: res, at: new Date().toISOString() };
      fs.writeFileSync(CACHE, JSON.stringify(cache, null, 1));
      writeReport();
      if (!QUIET) console.log('[' + k + '/' + todo.length + '] ' + (res.confirmed.length ? '✗ ' : res.pending.length ? '? ' : '✓ ') + slug + '：確定 ' + res.confirmed.length + '、待確認 ' + res.pending.length + '（' + res.sec + ' 秒）');
    }
    await browser.close();
    server.close();
  }
  if (opts.until) return 0;
  writeReport();
  console.log('\n' + summary(report, QUIET));
  return Object.values(report.pages).some(p => p.confirmed && p.confirmed.length) ? 1 : 0;
}

module.exports = { pageHash, sharedScripts, readLive, pageSource, loadMissions, loadExclude, exclOf, extractTerms, judgeTerms, quantities, judgeReading, parseShown, norm, matchName, REPORT, CACHE };

if (require.main === module) {
  main().then(code => process.exit(code), e => { console.error('✗ 試玩工具出錯：' + (e && e.stack || e)); process.exit(2); });
}
