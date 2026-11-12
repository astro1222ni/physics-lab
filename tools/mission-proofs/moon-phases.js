/* 任務可達成的證明腳本（月相與日月食）。用法：node tools/mission-proofs/moon-phases.js
 * 修改物理核心或任務條件後重跑，確認每個任務仍然做得到、預設狀態不會觸發任務。
 * 做法：只用物理核心 js/moon-phases-core.js，照頁面 js/moon-phases.js 的方式改變狀態：
 *   日期滑桿 doy（1–365，整數）：t = timeOf(年, doy − 1, 目前的時刻)；時刻滑桿 hr（0–23.99，間隔 0.25，打字 2 位）：t = 當天 0 時 + hr/24；
 *   月球位置 elong（0–360°，打字 3 位）：placeElongation；升交點 node（0–360°，打字 2 位）：withNode；近地點 peri（同上）：withPerigee；
 *   跳躍按鈕：+1 恆星月 findMoonLon、+1 朔望月 findPhase(t + 20, 目前的黃經差)、下一次新月／滿月 findPhase(t, 0 或 π)；
 *   時間前進時照頁面的 detectEvents／addLogEvent 找出朔、上弦、望、下弦與 greatestEclipse，產生 'event'。
 * 頁面在使用者操作之前不回報任何事件（自動播放不算），所以預設狀態只需確認 'state' 不會通過任何任務。
 * 觀測地點：任務都以臺灣為準。頁面選了別的地點時，missionData() 把 moonAlt、moonAz、sunAlt、sunAz、localMag 設成 NaN、
 *   rising = false、local = 'none'（session({ away: true }) 照做），所以綁臺灣天空的任務（4、6、12）只在選臺灣時判定，
 *   其餘以地心幾何判斷的任務在任何地點都做得到。 */
'use strict';
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const K = require(__ROOT + 'js/moon-phases-core.js');
const missions = [];
global.window = { MoonCore: K, LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(__ROOT + 'js/missions/moon-phases.js');
const DEG = K.DEG;

// ---------- 滑桿範圍與打字精度（moon-phases.html） ----------
const RANGES = { doy: [1, 365, 0], hr: [0, 23.99, 2], elong: [0, 360, 3], node: [0, 360, 2], peri: [0, 360, 2] };
function ui(name, v) {
  const r = RANGES[name], p = Math.pow(10, r[2]);
  const q = Math.round(Math.min(r[1], Math.max(r[0], v)) * p) / p;
  return q;
}

// ---------- 模擬頁面的一個工作階段 ----------
function session(opts) {
  const S = {}, away = !!(opts && opts.away);
  let el = K.makeElements({});
  let t = K.timeOf(0, K.doyOf(9, 23), 18.5);
  el = K.withNode(el, t, 100 * DEG);
  el = K.withPerigee(el, t, 30 * DEG);
  el = K.placeElongation(el, t, 120 * DEG);
  const events = [];
  const lastEv = [-1e9, -1e9, -1e9, -1e9];
  const emit = (type, data) => events.push({ type, data });
  S.events = events;
  S.get = () => ({ t, el });

  function data() {
    const ph = K.phaseAt(el, t), m = ph.moon, s = ph.sun, P = K.observer(t);
    const hm = K.horizontal(m, t), hs = K.horizontal(s, t), cal = K.calendar(t);
    const lunar = K.lunarEclipse(m, s), solar = K.solarEclipse(m, s), loc = K.localSolar(m, s, P);
    const node = K.nodeLon(el, t);
    const d = {
      dLam: ph.dLam / DEG, illum: ph.illum, phase: K.phaseKey(ph.dLam), age: K.moonAge(el, t),
      hour: cal.hour, month: cal.month, day: cal.day, doy: cal.doy, year: cal.year,
      moonAlt: hm.alt / DEG, moonAz: hm.az / DEG, sunAlt: hs.alt / DEG, sunAz: hs.az / DEG,
      rising: K.horizontal(K.moonAt(el, t + 0.002), t + 0.002).alt > hm.alt,
      lunar: lunar.type, magU: lunar.magU, magP: lunar.magP,
      solar: solar.type, central: solar.central, gamma: solar.gamma, ruSurface: solar.ruSurface,
      local: loc.type, localMag: loc.mag, dist: m.r, lat: m.lat / DEG,
      nodeDist: Math.min(Math.abs(K.wrapPi(m.u)), Math.abs(K.wrapPi(m.u - Math.PI))) / DEG,
      sunNode: Math.min(Math.abs(K.wrapPi(s.lon - node)), Math.abs(K.wrapPi(s.lon - node - Math.PI))) / DEG,
      dec: K.declination(m) / DEG, trueScale: false, frame: 'sun', regress: el.regress, precess: el.precess
    };
    if (away) Object.assign(d, { moonAlt: NaN, moonAz: NaN, sunAlt: NaN, sunAz: NaN, rising: false, local: 'none', localMag: NaN });
    return d;
  }
  S.data = data;
  const state = () => emit('state', data());

  function addLogEvent(k, tc) {
    if (Math.abs(tc - lastEv[k]) < 0.02) return;
    lastEv[k] = tc;
    const kind = ['new', 'fq', 'full', 'lq'][k];
    const c = K.calendar(tc);
    let ecl = null, eclKind = '';
    if (kind === 'new' || kind === 'full') {
      eclKind = kind === 'new' ? 'solar' : 'lunar';
      const g = K.greatestEclipse(el, tc, eclKind);
      if (g.res.type !== 'none') ecl = g.res; else eclKind = '';
    }
    emit('event', { kind, t: tc, year: c.year, month: c.month, day: c.day, eclipse: ecl ? ecl.type : 'none', eclKind, central: !!(ecl && ecl.central), gap: null });
  }
  /** 時間由 t 前進到 t1（播放或跳躍），照頁面 detectEvents 找出經過的主要月相 */
  function advanceTo(t1) {
    const t0 = t;
    if (!(t1 > t0)) { t = t1; return; }
    const found = [];
    for (let k = 0; k < 4; k++) {
      let tt = t0;
      for (let n = 0; n < 2000; n++) {
        const tc = K.findPhase(el, tt, k * Math.PI / 2, 1);
        if (!(tc <= t1 + 1e-9)) break;
        found.push([k, tc]);
        tt = tc + 1e-6;
      }
    }
    found.sort((a, b) => a[1] - b[1]).forEach(f => addLogEvent(f[0], f[1]));
    t = t1;
  }
  S.play = function (days) { advanceTo(t + days); state(); };      // 播放一段時間後按暫停
  S.doy = function (n) { const c = K.calendar(t); t = K.timeOf(c.year, ui('doy', n) - 1, c.hour); state(); };
  S.hr = function (h) { const c = K.calendar(t); t = c.dayIndex + Math.min(23.9999, ui('hr', h)) / 24; state(); };
  S.elong = function (v) { el = K.placeElongation(el, t, ui('elong', K.norm(v * DEG) / DEG) * DEG); state(); };
  S.node = function (v) { el = K.withNode(el, t, ui('node', K.norm(v * DEG) / DEG) * DEG); state(); };
  S.peri = function (v) { el = K.withPerigee(el, t, ui('peri', K.norm(v * DEG) / DEG) * DEG); state(); };
  S.sid = function () { const t1 = K.findMoonLon(el, t, K.moonAt(el, t).lon, 20); advanceTo(t1); emit('step', { kind: 'sid' }); state(); };
  S.syn = function () { const d = K.phaseAt(el, t).dLam; const t1 = K.findPhase(el, t + 20, d, 1); advanceTo(t1); emit('step', { kind: 'syn' }); state(); };
  S.next = function (kind) { const t1 = K.findPhase(el, t, kind === 'new' ? 0 : Math.PI, 1); advanceTo(t1); emit('step', { kind }); state(); };
  S.cam = function (p) { emit('cam', { preset: p }); };
  S.sunLon = () => K.sunLon(t) / DEG;
  S.moonLon = () => K.moonAt(el, t).lon / DEG;
  return S;
}

/** 把一個工作階段的事件依序丟進任務檢查（每次重新開始，mem 清空） */
function passes(id, run, opts) {
  const m = missions.find(x => x.id === id);
  m.mem = {};
  const S = session(opts);
  run(S);
  return S.events.some(ev => { try { return m.check(ev, m.mem); } catch (e) { return false; } });
}

// ---------- 解法 ----------
const SOL = {
  'moon-phases-1': ['月球位置 180°', S => S.elong(180)],
  'moon-phases-2': ['月球位置 90°', S => S.elong(90)],
  'moon-phases-3': ['3D：按「沿交點線側看」', S => S.cam('edge')],
  'moon-phases-4': ['預設日期 9/23 18:30，月球位置 40°', S => S.elong(40)],
  'moon-phases-5': ['按 +1 恆星月、再按 +1 朔望月', S => { S.sid(); S.syn(); }],
  'moon-phases-6': null, // 下面用搜尋找時刻
  'moon-phases-7': ['月球位置 180°，升交點拖到月球的黃經（交點線對準太陽）', S => { S.elong(180); S.node(S.moonLon()); }],
  'moon-phases-8': ['月球位置 0°，升交點 = 太陽黃經，近地點 = 太陽黃經 + 180°（月球在遠地點）', S => { S.elong(0); S.node(S.sunLon()); S.peri(S.sunLon() + 180); }],
  'moon-phases-9': ['月球位置 0°，升交點 = 太陽黃經，近地點 = 太陽黃經（月球在近地點）', S => { S.elong(0); S.node(S.sunLon()); S.peri(S.sunLon()); }],
  'moon-phases-10': null,
  'moon-phases-11': null,
  'moon-phases-12': null,
  'moon-phases-h1': null,
  'moon-phases-h2': null,
  'moon-phases-h3': null
};

// 6：上弦月在東方升起——在打字精度 0.01 h 上找月亮高度 −1°～2.5° 的時刻
(function () {
  for (let h = 0; h <= 23.99; h += 0.05) {
    const hh = Math.round(h * 100) / 100;
    const run = S => { S.elong(90); S.hr(hh); };
    if (passes('moon-phases-6', run)) { SOL['moon-phases-6'] = ['月球位置 90°，時刻 ' + hh.toFixed(2) + ' 時（月出）', run]; return; }
  }
})();
// 10：只有半影的月食——黃經差 170° 時月球約 0.8 天後滿月、再走約 10.5°；升交點放在那之後 off 度，按「下一次滿月」
(function () {
  for (let off = 8; off <= 20; off += 0.25) {
    const run = S => { S.elong(170); S.node(S.moonLon() + 10.54 + off); S.next('full'); };
    if (passes('moon-phases-10', run)) { SOL['moon-phases-10'] = ['月球位置 170°，升交點 = 月球黃經 + ' + (10.54 + off).toFixed(2) + '°，按「下一次滿月」', run]; return; }
  }
})();
// 11：食季——交點線先對準下一次滿月附近，按「下一次滿月」再按「下一次新月」
(function () {
  for (let off = -16; off <= 16; off += 0.5) {
    const run = S => { S.elong(170); S.node(S.moonLon() + 10.54 + off); S.next('full'); S.next('new'); };
    if (passes('moon-phases-11', run)) { SOL['moon-phases-11'] = ['月球位置 170°，升交點 = 月球黃經 + ' + (10.54 + off).toFixed(2) + '°，按「下一次滿月」、再按「下一次新月」', run]; return; }
  }
})();
// h3：升交點 0°（大停變期），月球在黃經 90° 附近，找它在臺灣東北方升起或西北方落下的時刻
(function () {
  for (let off = -6; off <= 6; off += 2) for (let h = 0; h <= 23.99; h += 0.05) {
    const hh = Math.round(h * 100) / 100;
    const run = S => { S.node(0); S.elong(90 + off - S.sunLon()); S.hr(hh); };
    if (passes('moon-phases-h3', run)) { SOL['moon-phases-h3'] = ['升交點 0°，月球位置 = ' + (90 + off) + '° − 太陽黃經，時刻 ' + hh.toFixed(2) + ' 時（月亮在東北或西北的地平線上）', run]; return; }
  }
})();
// h3 不觸發：同樣的月球但不在地平線附近；升交點 180°（小停變期）時任何時刻都不行
(function () {
  let badHigh = false, badMinor = false;
  for (let h = 0; h <= 23.99; h += 0.25) {
    const hh = Math.round(h * 100) / 100;
    if (passes('moon-phases-h3', S => { S.node(180); S.elong(90 - S.sunLon()); S.hr(hh); })) badMinor = true;
  }
  const m = missions.find(x => x.id === 'moon-phases-h3');
  let ev = null;
  for (let h = 0; h <= 23.99 && !ev; h += 0.25) {
    const S0 = session(); S0.node(0); S0.hr(Math.round(h * 100) / 100); S0.elong(90 - S0.sunLon());
    const e = S0.events.filter(x => x.type === 'state').pop();
    if (e && e.data.dec >= 28.5 && e.data.moonAlt > 30) ev = e;
  }
  if (!ev || m.check(ev, {})) badHigh = true;
  console.log((badMinor ? '✗' : '✓') + ' moon-phases-h3 不觸發：升交點 180°（月球最大赤緯只有約 18°），一天 96 個時刻都不算');
  console.log((badHigh ? '✗' : '✓') + ' moon-phases-h3 不觸發：赤緯 ' + (ev ? ev.data.dec.toFixed(2) : '?') + '°、但月亮高度 ' + (ev ? ev.data.moonAlt.toFixed(1) : '?') + '°（不在地平線附近）');
  if (badMinor || badHigh) process.exitCode = 1;
})();
// 12：台灣白天的日全食——中午 12 時，讓月球正好在「台灣 → 太陽」的連線上（解出月球的黃經與黃緯，再換成升交點與月球位置）
(function () {
  const tryHour = function (hour, doy) {
    const run = S => {
      S.doy(doy); S.hr(hour); S.elong(0); S.peri(S.sunLon());
      for (let it = 0; it < 6; it++) {
        const st = S.get(), t = st.t, el = st.el;
        const P = K.observer(t), s = K.sunAt(t), u = K.unit(K.sub(s, P)), r = K.moonAt(el, t).r;
        // |P + λu| = r
        const b = K.dot(P, u), c = K.dot(P, P) - r * r, lam = -b + Math.sqrt(b * b - c);
        const mT = K.add(P, K.mul(u, lam));
        const lon = Math.atan2(mT.y, mT.x), beta = Math.asin(mT.z / r);
        const uu = Math.asin(Math.max(-1, Math.min(1, Math.sin(beta) / Math.sin(el.inc))));
        const Om = lon - Math.atan2(Math.cos(el.inc) * Math.sin(uu), Math.cos(uu));
        S.node(Om / DEG);
        S.elong((lon - K.sunLon(t)) / DEG);
        S.peri(S.sunLon());
      }
    };
    return passes('moon-phases-12', run) ? run : null;
  };
  for (const doy of [266, 172, 80]) {
    for (const hour of [12, 11.5, 12.5, 10, 14]) {
      const run = tryHour(hour, doy);
      if (run) { SOL['moon-phases-12'] = ['日期第 ' + doy + ' 天、時刻 ' + hour + ' 時；近地點 = 太陽黃經；升交點與月球位置讓月球落在台灣與太陽的連線上（打字到 0.01°、0.001°）', run]; return; }
    }
  }
})();
// h1：一個月兩次滿月——10 月 1 日 0:30，月球位置 179.5°（約 1 小時後滿月），按兩次「下一次滿月」
(function () {
  for (const [mo, d] of [[10, 1], [12, 1], [8, 1], [7, 1], [5, 1], [3, 1], [1, 1]]) {
    for (const el0 of [179.8, 179.5, 179, 178]) {
      const run = S => { S.doy(K.doyOf(mo, d) + 1); S.hr(0.25); S.elong(el0); S.next('full'); S.next('full'); };
      if (passes('moon-phases-h1', run)) { SOL['moon-phases-h1'] = [mo + ' 月 ' + d + ' 日 0:15，月球位置 ' + el0 + '°，按兩次「下一次滿月」', run]; return; }
    }
  }
})();
// h2：本影尖端剛好碰到地面——中心食，近地點由「月球在近地點」慢慢轉開，找地面本影半徑 |r| ≤ 5 km
(function () {
  for (let dp = 0; dp <= 180; dp += 0.05) {
    const run = S => { S.elong(0); S.node(S.sunLon()); S.peri(S.sunLon() + dp); };
    if (passes('moon-phases-h2', run)) { SOL['moon-phases-h2'] = ['月球位置 0°、升交點 = 太陽黃經、近地點 = 太陽黃經 + ' + dp.toFixed(2) + '°', run]; return; }
  }
})();

// ---------- 檢查 ----------
let fail = 0;
// 預設狀態（9/23 18:30、黃經差 120°、Ω = 100°、近地點 30°）：任何任務都不能通過
(function () {
  const S = session();
  const d = S.data();
  const hit = missions.filter(m => { m.mem = {}; try { return m.check({ type: 'state', data: d }, m.mem); } catch (e) { return false; } });
  if (hit.length) { fail++; console.log('✗ 預設狀態觸發了任務：' + hit.map(m => m.id).join(', ')); }
  else console.log('✓ 預設狀態不觸發任何任務（黃經差 ' + d.dLam.toFixed(1) + '°、照亮 ' + (d.illum * 100).toFixed(1) + '%）');
})();
missions.forEach(m => {
  const sol = SOL[m.id];
  if (!sol) { fail++; console.log('✗ ' + m.id + '（' + m.level + ' 級）：找不到解法'); return; }
  const ok = passes(m.id, sol[1]);
  if (!ok) fail++;
  console.log((ok ? '✓ ' : '✗ ') + m.id + '（' + m.level + ' 級' + (m.hidden ? '，隱藏' : '') + '）：' + sol[0]);
});
// 也確認：只操作一個條件不夠的任務不會被別的狀態誤觸（例：滿月但交點不對 → 沒有月全食）
(function () {
  const S = session();
  S.elong(180);
  const d = S.data();
  const m7 = missions.find(x => x.id === 'moon-phases-7');
  if (m7.check({ type: 'state', data: d }, {})) { fail++; console.log('✗ 預設交點下的滿月不應該是月全食'); }
  else console.log('✓ 預設交點（Ω = 100°）下的滿月沒有月食：月球黃緯 ' + d.lat.toFixed(2) + '°');
})();
// 選了臺灣以外的地點：綁臺灣天空的任務不判定，其餘任務照樣做得到
(function () {
  const TW_ONLY = ['moon-phases-4', 'moon-phases-6', 'moon-phases-12', 'moon-phases-h3'];
  const bad = [];
  missions.forEach(m => {
    const sol = SOL[m.id];
    if (!sol) return;
    const ok = passes(m.id, sol[1], { away: true });
    if (ok === TW_ONLY.includes(m.id)) bad.push(m.id + (ok ? ' 不該通過' : ' 應該通過'));
  });
  if (bad.length) { fail++; console.log('✗ 別的觀測地點：' + bad.join('、')); }
  else console.log('✓ 選了別的觀測地點：任務 4、6、12、h3（臺灣的天空）不判定，其餘 ' + (missions.length - TW_ONLY.length) + ' 個照樣做得到');
})();
console.log(fail ? '\n有 ' + fail + ' 項沒有通過' : '\n全部 ' + missions.length + ' 個任務都做得到');
process.exitCode = fail ? 1 : 0;
