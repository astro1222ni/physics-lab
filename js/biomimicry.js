/* biomimicry.js — 「仿生學：蓮葉效應與壁虎的腳」的畫面與互動（物理全部在 biomimicry-core.js；3D 在 biomimicry-3d.js，切換時才載入） */
(function () {
  'use strict';
  const B = window.BioMimCore;
  const D = window.LabDraw;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const SCRIPT_V = (function () {
    const s = document.currentScript, m = s && /[?&]v=(\w+)/.exec(s.src);
    return m ? m[1] : '';
  })();
  const FONT = D.FONT;
  const MAX_ROWS = 12;
  const PLATE = { W: 15, L: 22 };     // 葉面試片（mm）
  const NDIRT = 140;
  const SLOW = 0.2;                   // 動作放慢 5 倍
  const TAU = 0.05;                   // 滑動水珠的阻尼時間（s，示意）
  const RAIN_RATE = 8;                // 每（畫面）秒幾滴雨
  const MAX_DROPS = 70;
  const DETACH = 30.6;                // 剛毛脫離角（Autumn 等 2000）

  // =====================================================================
  // 顏色、數字
  // =====================================================================
  const C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['bm-leaf', 'bm-leaf2', 'bm-dirt', 'bm-water', 'bm-water-hi', 'bm-air', 'bm-pillar', 'bm-wall', 'bm-gecko', 'bm-gecko2', 'bm-good', 'bm-bad']
      .forEach(function (k) { C[k] = cs.getPropertyValue('--' + k).trim() || '#888888'; });
  }
  function num(v, d) {
    if (v == null || !isFinite(v)) return '—';
    let s = v.toFixed(d);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  /** 有效數字 */
  function sig(v, n) {
    if (v == null || !isFinite(v)) return '—';
    if (v === 0) return '0';
    const d = Math.max(0, n - 1 - Math.floor(Math.log10(Math.abs(v))));
    return num(v, Math.min(d, 6));
  }
  function pct(x, d) { return num(100 * x, d == null ? 0 : d) + '%'; }
  function fmtP(p) { return p >= 1e6 ? sig(p / 1e6, 3) + ' MPa' : p >= 1000 ? sig(p / 1000, 3) + ' kPa' : sig(p, 3) + ' Pa'; }
  function fmtF(f) {
    if (f >= 1) return sig(f, 3) + ' N';
    if (f >= 1e-3) return sig(f * 1e3, 3) + ' mN';
    if (f >= 1e-6) return sig(f * 1e6, 3) + ' µN';
    return sig(f * 1e9, 3) + ' nN';
  }
  function fmtG(g) { return g >= 1000 ? sig(g / 1000, 3) + ' kg' : g >= 1 ? sig(g, 3) + ' g' : sig(g * 1000, 3) + ' mg'; }
  function fmtN(n) {
    if (n < 1e4) return String(Math.round(n));
    const e = Math.floor(Math.log10(n)), m = n / Math.pow(10, e);
    return num(m, 2) + ' × 10<sup>' + e + '</sup>';
  }
  function deg(x) { return num(x, 1) + '°'; }

  // =====================================================================
  // 滑桿
  // =====================================================================
  const el = {
    thY: $('thY'), hyst: $('hyst'), pa: $('pa'), pb: $('pb'), ph: $('ph'), vol: $('vol'), tilt: $('tilt'), rainv: $('rainv'),
    wall: $('wall'), mass: $('mass'), frac: $('frac'), nsplit: $('nsplit'), load: $('load')
  };
  if (window.LabNum) {
    // 貼住的剛毛比例：0.001%–100%（對數）
    window.LabNum.register(el.frac, {
      toValue: function (p) { return Math.pow(10, -3 + 5 * p / 1000); },
      toPos: function (v) { return (Math.log10(v) + 3) * 200; }, min: 0.001, max: 100, decimals: 3
    });
    // 尖端數：1–10⁸（對數）
    window.LabNum.register(el.nsplit, {
      toValue: function (p) { return Math.round(Math.pow(10, p / 100)); },
      toPos: function (v) { return 100 * Math.log10(Math.max(1, v)); }, min: 1, max: 1e8, decimals: 0
    });
    // 砝碼：0.001–100 g（對數）
    window.LabNum.register(el.load, {
      toValue: function (p) { return Math.pow(10, -3 + p / 100); },
      toPos: function (v) { return (Math.log10(v) + 3) * 100; }, min: 0.001, max: 100, decimals: 3
    });
  }
  function fracV() { return val(el.frac) / 100; }
  function nV() { return Math.max(1, Math.round(val(el.nsplit))); }
  function loadV() { return val(el.load); }
  function refreshOutputs() {
    const set = function (id, s, html) { const o = $(id); if (!o) return; if (html) o.innerHTML = s; else o.textContent = s; };
    set('thYo', num(val(el.thY), 0) + '°'); set('hysto', num(val(el.hyst), 0) + '°');
    set('pao', num(val(el.pa), 1)); set('pbo', num(val(el.pb), 1)); set('pho', num(val(el.ph), 1));
    set('volo', num(val(el.vol), 0)); set('tilto', num(val(el.tilt), 1) + '°'); set('rainvo', num(val(el.rainv), 1));
    set('wallo', num(val(el.wall), 0) + '°'); set('masso', num(val(el.mass), 0));
    set('fraco', sig(val(el.frac), 3)); set('nsplito', fmtN(nV()), true); set('loado', sig(loadV(), 3));
  }

  // =====================================================================
  // 音效、狀態
  // =====================================================================
  function sound() { const S0 = window.LabSound; return S0 && S0.enabled() ? S0 : null; }
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }
  let lastPlip = 0;
  /** 水珠落下：Cassie 是清脆的「滴」，被打穿是悶的「噗」 */
  function sndDrop(mode) {
    const S0 = sound(), now = performance.now();
    if (!S0 || now - lastPlip < 70) return;
    lastPlip = now;
    if (mode === 'cassie') S0.sweep({ from: 1400, to: 700, dur: 0.06, gain: 0.04, type: 'sine' });
    else S0.tone({ freq: 300, dur: 0.07, gain: 0.05, type: 'triangle' });
  }
  /** 水珠滾出葉面 */
  function sndRoll() {
    const S0 = sound(), now = performance.now();
    if (!S0 || now - lastPlip < 70) return;
    lastPlip = now;
    S0.sweep({ from: 520, to: 900, dur: 0.09, gain: 0.04, type: 'sine' });
  }
  function sndChord(good) {
    const S0 = sound();
    if (!S0) return;
    const f = good ? [523, 659, 784] : [440, 370, 294];
    f.forEach(function (x, i) { S0.tone({ freq: x, dur: 0.15, gain: 0.06, delay: i * 0.11, type: 'sine' }); });
  }
  function sndPeel() { const S0 = sound(); if (S0) S0.sweep({ from: 900, to: 1500, dur: 0.12, gain: 0.04, type: 'triangle' }); }
  function setStatus(id, s) { $(id).textContent = s; }
  function say(s) { const e = $('srSay'); e.textContent = ''; setTimeout(function () { e.textContent = s; }, 30); }
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }

  // =====================================================================
  // 繪圖共用
  // =====================================================================
  function fit(c, g, h) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = c.clientWidth || 300;
    c.style.height = h + 'px';
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: w, h: h, dpr: dpr };
  }
  function panel(g, x, y, w, h) {
    D.roundRect(g, x, y, w, h, 10);
    g.fillStyle = D.alpha(D.c.surface, D.dark ? 0.35 : 0.72); g.fill();
    g.strokeStyle = D.alpha(D.c.border, 0.9); g.lineWidth = 1; g.stroke();
  }
  function title(g, s, x, y, col, align) { D.haloText(g, s, x, y, col || D.c.text, align || 'left', 'middle', '600 12px ' + FONT); }
  function small(g, s, x, y, col, align, base) { D.haloText(g, s, x, y, col || D.c.muted, align || 'left', base || 'middle', '11px ' + FONT); }
  function evPos(c, ev) { const r = c.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; }
  function rngOf(seed) { let s = seed % 2147483647; if (s <= 0) s += 2147483646; return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
  function arrow(g, x0, y0, x1, y1, col, w, dash) {
    g.save();
    if (dash) g.setLineDash(dash);
    D.arrow(g, x0, y0, x1, y1, col, w || 2.2);
    g.restore();
  }

  // =====================================================================
  // 一・蓮葉效應
  // =====================================================================
  const cv = $('cv'), ctx = cv.getContext('2d');
  let W1 = 300, H1 = 470;
  let L1 = null;   // 版面

  // 材料與微結構的預設
  const TEX = [
    { id: 'flat', zh: '平面', en: 'Smooth', a: 10, b: 10, h: 0 },
    { id: 'coarse', zh: '粗柱', en: 'Coarse', a: 10, b: 10, h: 20 },
    { id: 'fine', zh: '細柱', en: 'Fine', a: 2, b: 6, h: 6 }
  ];
  function matId() {
    const t = val(el.thY), h = val(el.hyst);
    const m = B.MATERIALS.find(function (x) { return x.thY === t && x.hyst === h; });
    return m ? m.id : 'custom';
  }
  function surf() { return { a: val(el.pa), b: val(el.pb), h: val(el.ph), thY: val(el.thY), hyst: val(el.hyst), V: val(el.vol) }; }
  function dropState(v, wet, V) {
    const o = surf();
    o.v = v || 0; o.wet = !!wet;
    if (V != null) o.V = V;
    return B.drop(o);
  }

  // 灰塵與水珠
  const dirt = { xs: [], ys: [], alive: null, seed: 1 };
  const st1 = { drops: [], nid: 0, rain: false, rainAcc: 0, cursor: { x: PLATE.W / 2, y: 1.2 }, focus: null, focusIsRain: false,
    maxTilt: 0, minV: Infinity, gentle: 0, rained: 0, mixed: false, lastCleanStep: 0, rolled: 0 };
  function scatter() {
    const r = rngOf(dirt.seed * 7919 + 13);
    dirt.xs = []; dirt.ys = [];
    for (let i = 0; i < NDIRT; i++) { dirt.xs.push(0.6 + r() * (PLATE.W - 1.2)); dirt.ys.push(0.6 + r() * (PLATE.L - 1.2)); }
    dirt.alive = new Uint8Array(NDIRT).fill(1);
    st1.drops = []; st1.maxTilt = val(el.tilt); st1.minV = Infinity; st1.gentle = 0; st1.rained = 0; st1.mixed = false; st1.lastCleanStep = 0;
    st1.rolled = 0;
  }
  /** 灰塵：1 在葉面上、2 沾在水珠裡、0 已經隨水珠滾走 */
  function cleanFrac() { let n = 0; for (let i = 0; i < NDIRT; i++) if (dirt.alive[i] === 0) n++; return n / NDIRT; }
  /** 水珠不見了（擦掉、蒸發）：沾著的灰塵留回葉面；滾出葉面：灰塵跟著走 */
  function release(d, gone) { (d.held || []).forEach(function (i) { dirt.alive[i] = gone ? 0 : 1; }); d.held = []; }

  /** 放一顆水珠（x、y 在葉面上，單位 mm；y 可以小於 0：從葉面上方流下來的雨） */
  function place(x, y, v, isRain) {
    if (st1.drops.length >= MAX_DROPS) {
      // 最舊的不動水珠蒸發掉，避免越積越多
      const k = st1.drops.findIndex(function (d) { return !d.moving; });
      if (k >= 0) { release(st1.drops[k], false); st1.drops.splice(k, 1); } else return null;
    }
    const s = dropState(v, false);
    const d = { id: ++st1.nid, x: x, y: y, V: val(el.vol), wet: s.mode !== 'cassie' && s.mode !== 'smooth' && !s.smooth ? true : false, s: s, vy: 0, moving: false, merged: false, rain: !!isRain, age: 0, held: [] };
    if (s.mode === 'smooth') d.wet = false;
    if (y >= 0) d.held = B.capture(dirt.xs, dirt.ys, dirt.alive, x, y, s.c * 1e3);
    st1.drops.push(d);
    mergeAround(d);
    if (isRain) { st1.rained++; st1.minV = Math.min(st1.minV, v); } else st1.gentle++;
    st1.focus = d.s; st1.focusIsRain = !!isRain;
    sndDrop(s.mode);
    const gentle = isRain ? dropState(0, false) : s;
    emit('drop', dropData(s, isRain, v, gentle));
    checkClean();
    if (!isRain) { addRow1(s); renderRo1(); }
    request();
    return d;
  }
  function dropData(s, isRain, v, gentle) {
    const tilt = val(el.tilt);
    return {
      mat: matId(), thY: s.thY, hyst: val(el.hyst), a: val(el.pa), b: val(el.pb), h: val(el.ph), smooth: s.smooth, V: val(el.vol),
      mode: s.mode, theta: s.theta, thA: s.thA, thR: s.thR, roll: s.roll, r: s.r, phi: s.phi, thc: s.thc,
      Pcrit: s.Pcrit, Pdyn: s.Pdyn, impaled: s.impaled, metastable: s.metastable,
      rain: !!isRain, v: v || 0, tilt: tilt, gentleMode: gentle.mode, gentleRoll: gentle.roll,
      stuck: s.roll == null || s.roll >= tilt
    };
  }
  /** 合體：碰在一起的水珠合成一顆，體積相加；有一顆被打穿過，合起來也算被打穿 */
  function mergeAround(d) {
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < st1.drops.length; i++) {
        const o = st1.drops[i];
        if (o === d) continue;
        const dx = o.x - d.x, dy = o.y - d.y, rr = (o.s.c + d.s.c) * 1e3;
        if (dx * dx + dy * dy < rr * rr * 0.8) {
          const V = Math.min(60, o.V + d.V);
          const keep = d.moving && !o.moving ? o : (o.V >= d.V ? o : d);
          const gone = keep === o ? d : o;
          keep.x = (o.x * o.V + d.x * d.V) / (o.V + d.V);
          keep.V = V; keep.wet = o.wet || d.wet; keep.merged = true; keep.rain = o.rain && d.rain;
          keep.s = dropState(0, keep.wet, V);
          keep.vy = Math.max(o.vy, d.vy) * 0.5;
          keep.held = (o.held || []).concat(d.held || []);
          st1.drops.splice(st1.drops.indexOf(gone), 1);
          d = keep; changed = true;
          st1.focus = keep.s;
          break;
        }
      }
    }
    return d;
  }
  function checkClean() {
    const f = cleanFrac(), step = Math.floor(f * 20 + 1e-9);
    if (step > st1.lastCleanStep) {
      st1.lastCleanStep = step;
      const g = dropState(0, false);
      emit('clean', {
        frac: f, maxTilt: st1.maxTilt, minV: isFinite(st1.minV) ? st1.minV : 0, rained: st1.rained, gentle: st1.gentle,
        mixed: st1.mixed, mat: matId(), mode: g.mode, roll: g.roll
      });
      if (f >= 0.9 && step === 18) sndChord(true);
    }
  }
  function stepDrops(dt) {
    const tilt = val(el.tilt), sa = Math.sin(tilt * B.DEG);
    const real = dt * SLOW;
    let any = false;
    st1.drops.slice().forEach(function (d0) {
      let d = d0;
      if (st1.drops.indexOf(d) < 0) return;   // 已經合併掉了
      d.age += dt;
      const r = d.s.roll;
      const can = r != null && tilt > r && d.s.mode !== 'spread';
      if (can) {
        const acc = B.G * 1000 * (sa - Math.sin(r * B.DEG));   // mm/s²
        d.vy += (acc - d.vy / TAU) * real;
        if (d.vy < 0) d.vy = 0;
        d.moving = d.vy > 0.5;
      } else { d.vy = 0; d.moving = false; }
      if (d.vy > 0) {
        const y0 = d.y, y1 = d.y + d.vy * real;
        d.y = y1;
        if (y1 > 0) B.sweepPath(dirt.xs, dirt.ys, dirt.alive, d.x, Math.max(0, y0), y1, d.s.w * 1e3).forEach(function (k) { d.held.push(k); });
        any = true;
        d = mergeAround(d);
        if (d.y - d.s.c * 1e3 > PLATE.L && st1.drops.indexOf(d) >= 0) {
          st1.drops.splice(st1.drops.indexOf(d), 1);
          release(d, true);
          st1.rolled++;
          sndRoll();
          emit('roll', { tilt: tilt, roll: d.s.roll, mode: d.s.mode, V: d.V, merged: d.merged, rain: d.rain, mat: matId() });
        }
      } else if (d.y < 0) {
        // 葉面上方落下的雨水停住了：流不下來，拿掉
        release(d, false);
        st1.drops.splice(st1.drops.indexOf(d), 1);
      }
    });
    checkClean();
    return any;
  }
  function rainTick(dt) {
    if (!st1.rain) return false;
    st1.rainAcc += dt * RAIN_RATE;
    const r = Math.random;
    while (st1.rainAcc >= 1) {
      st1.rainAcc -= 1;
      // 雨落在葉面以及上方同樣大小的一段（上方的水會流下來）
      place(0.3 + r() * (PLATE.W - 0.6), -PLATE.L + 2 * PLATE.L * r(), val(el.rainv), true);
    }
    return true;
  }

  // ---------- 紀錄表 ----------
  let rows1 = [];
  function modeName(m) {
    return { smooth: T('平面', 'Smooth'), cassie: 'Cassie', wenzel: 'Wenzel', spread: T('攤開', 'Spread') }[m] || m;
  }
  function matName(id) {
    const m = B.MATERIALS.find(function (x) { return x.id === id; });
    return m ? T(m.zh.replace(/（.*）/, ''), m.en.replace(/ \(.*\)/, '')) : T('自訂', 'Custom');
  }
  function addRow1(s) {
    const key = [matId(), s.thY, val(el.hyst), val(el.pa), val(el.pb), val(el.ph), val(el.vol)].join('|');
    if (rows1.length && rows1[0].key === key) return;
    rows1.unshift({ key: key, n: (rows1.length ? rows1[0].n : 0) + 1, mat: matId(), thY: s.thY, a: val(el.pa), b: val(el.pb), h: val(el.ph), V: val(el.vol), s: s });
    if (rows1.length > MAX_ROWS) rows1.length = MAX_ROWS;
    renderRows1();
  }
  function renderRows1() {
    const t = $('runs1');
    if (!rows1.length) { t.innerHTML = ''; return; }
    let h = '<thead><tr><th>#</th><th>' + T('材料', 'Material') + '</th><th>θ<sub>Y</sub></th><th>' + T('柱 a / b / h（µm）', 'Pillars a / b / h (µm)') +
      '</th><th>V（µL）</th><th>' + T('狀態', 'State') + '</th><th>θ</th><th>' + T('滾落角', 'Roll-off') + '</th><th>' + T('刺穿壓力', 'Breakthrough') + '</th></tr></thead><tbody>';
    rows1.forEach(function (r) {
      const s = r.s;
      h += '<tr><td>' + r.n + '</td><td>' + matName(r.mat) + '</td><td>' + num(r.thY, 0) + '°</td><td>' +
        (s.smooth ? T('平面', 'smooth') : num(r.a, 1) + ' / ' + num(r.b, 1) + ' / ' + num(r.h, 1)) + '</td><td>' + num(r.V, 0) + '</td><td>' + modeName(s.mode) +
        '</td><td' + (s.theta >= 150 ? ' class="yes"' : '') + '>' + num(s.theta, 1) + '°</td><td>' + (s.roll == null ? T('不會滑', 'never') : num(s.roll, 1) + '°') +
        '</td><td>' + (s.smooth || s.mode !== 'cassie' ? '—' : fmtP(s.Pcrit)) + '</td></tr>';
    });
    t.innerHTML = h + '</tbody>';
  }

  // ---------- 讀數 ----------
  function renderRo1() {
    const g = dropState(0, false), rv = val(el.rainv), rs = dropState(rv, false);
    const f = st1.focus || g;
    const rows = [];
    const stName = function (s) {
      if (s.mode === 'cassie') return T('Cassie：架在柱頂，底下是空氣', 'Cassie: resting on the tips, air below') + (s.metastable ? T('（亞穩定）', ' (metastable)') : '');
      if (s.mode === 'wenzel') return T('Wenzel：水填滿縫隙', 'Wenzel: water fills the gaps') + (s.impaled ? T('（被壓進去的）', ' (pushed in)') : '');
      if (s.mode === 'spread') return T('攤成一層水膜', 'Spread into a film');
      return T('平面', 'Smooth surface');
    };
    rows.push([T('輕放的水珠', 'A gently placed drop'), stName(g), '']);
    rows.push([T('接觸角 θ', 'Contact angle θ'), deg(g.theta), T('前進 ', 'advancing ') + deg(g.thA) + T('、後退 ', ', receding ') + deg(g.thR)]);
    rows.push([T('滾落角', 'Roll-off angle'), g.roll == null ? T('垂直也不會滑', 'never, even vertical') : deg(g.roll),
      T('現在傾斜 ', 'tilt now ') + deg(val(el.tilt)), g.roll != null && val(el.tilt) > g.roll ? 'good' : '']);
    if (!g.smooth) {
      rows.push([T('粗糙度 r、固體占比 φ', 'Roughness r, solid fraction φ'), num(g.r, 2) + T('、', ', ') + num(g.phi, 3),
        'Wenzel ' + deg(g.thW) + T('、Cassie ', ', Cassie ') + deg(g.thCB)]);
      rows.push([T('臨界角 θ<sub>c</sub>', 'Critical angle θ<sub>c</sub>'), deg(g.thc),
        g.thY > g.thc ? T('θ<sub>Y</sub> 比它大：Cassie 能量較低', 'θ<sub>Y</sub> is larger: Cassie has lower energy') : T('θ<sub>Y</sub> 比它小：Wenzel 能量較低', 'θ<sub>Y</sub> is smaller: Wenzel has lower energy')]);
      rows.push([T('刺穿壓力', 'Breakthrough pressure'), g.thAY > 90 ? fmtP(g.Pcrit) : T('擋不住（θ<sub>A</sub> ≤ 90°）', 'none (θ<sub>A</sub> ≤ 90°)'),
        g.thAY > 90 ? (g.by === 'dep' ? T('水沿柱壁滑下', 'water slides down the walls') : T('水面下垂碰到底', 'the surface sags to the bottom')) + T('；水珠本身 ', '; the drop itself ') + fmtP(g.Plap) : '']);
      rows.push([T('雨滴 ' + num(rv, 1) + ' m/s', 'Rain at ' + num(rv, 1) + ' m/s'), '½ρv² = ' + fmtP(rs.Pdyn),
        rs.mode === 'cassie' ? T('打不穿，水珠還是 Cassie', 'cannot break through: the drop stays Cassie') : g.mode === 'cassie' ? T('打穿了：變成 Wenzel、黏住', 'breaks through: Wenzel, and it sticks') : '',
        rs.mode === 'cassie' ? 'good' : g.mode === 'cassie' ? 'bad' : '']);
    }
    rows.push([T('灰塵清掉', 'Dust removed'), pct(cleanFrac(), 0), T('輕放 ', 'placed ') + st1.gentle + T(' 滴、雨 ', ', rain ') + st1.rained + T(' 滴；滾走 ', '; rolled off ') + st1.rolled]);
    if (st1.focus && st1.focusIsRain) rows.push([T('最近一滴雨', 'Latest rain drop'), stName(f), deg(f.theta)]);
    $('ro1').innerHTML = rows.map(function (r) {
      return '<dt>' + r[0] + '</dt><dd' + (r[3] ? ' class="' + r[3] + '"' : '') + '>' + r[1] + (r[2] ? '<small>' + r[2] + '</small>' : '') + '</dd>';
    }).join('');
  }
  let ro1Timer = 0;
  function renderRo1Soon() { if (!ro1Timer) ro1Timer = setTimeout(function () { ro1Timer = 0; renderRo1(); }, 250); }

  // ---------- 版面 ----------
  function layout1() {
    const narrow = W1 < 640;
    if (narrow) {
      const ph = 360, pw = Math.min(W1 - 40, ph * PLATE.W / PLATE.L);
      const sc = pw / PLATE.W;
      return { narrow: true, sc: sc, px: (W1 - pw) / 2, py: 40, pw: pw, ph: PLATE.L * sc,
        side: { x: 10, y: 40 + PLATE.L * sc + 20, w: W1 - 20, h: H1 - (40 + PLATE.L * sc + 20) - 10 } };
    }
    const ph = H1 - 70, pw = ph * PLATE.W / PLATE.L, sc = pw / PLATE.W;
    const px = 30;
    return { narrow: false, sc: sc, px: px, py: 42, pw: pw, ph: PLATE.L * sc,
      side: { x: px + pw + 30, y: 12, w: W1 - (px + pw + 30) - 12, h: H1 - 24 } };
  }
  function resize1() {
    W1 = cv.clientWidth || 300;
    H1 = W1 < 640 ? 400 + 330 : 470;
    fit(cv, ctx, H1);
    L1 = layout1();
    request();
  }

  // ---------- 畫葉面（俯視） ----------
  let leafTex = null, leafKey = '';
  function leafTexture(L) {
    const key = [Math.round(L.pw), Math.round(L.ph), D.dark, C['bm-leaf']].join('|');
    if (leafTex && leafKey === key) return leafTex;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(L.pw * dpr)); c.height = Math.max(1, Math.round(L.ph * dpr));
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    const gr = g.createLinearGradient(0, 0, L.pw, L.ph);
    gr.addColorStop(0, D.shade(C['bm-leaf'], 0.12)); gr.addColorStop(1, C['bm-leaf2']);
    g.fillStyle = gr; g.fillRect(0, 0, L.pw, L.ph);
    // 葉脈
    g.strokeStyle = D.alpha(D.shade(C['bm-leaf'], 0.35), 0.45); g.lineWidth = 2;
    g.beginPath(); g.moveTo(L.pw * 0.5, 0); g.lineTo(L.pw * 0.5, L.ph); g.stroke();
    g.lineWidth = 1;
    for (let k = 1; k < 7; k++) {
      const y = L.ph * k / 7;
      g.beginPath(); g.moveTo(L.pw * 0.5, y); g.quadraticCurveTo(L.pw * 0.3, y - L.ph * 0.03, 0, y - L.ph * 0.08); g.stroke();
      g.beginPath(); g.moveTo(L.pw * 0.5, y); g.quadraticCurveTo(L.pw * 0.7, y - L.ph * 0.03, L.pw, y - L.ph * 0.08); g.stroke();
    }
    // 細小的乳突紋理
    const r = rngOf(4242);
    for (let i = 0; i < L.pw * L.ph / 26; i++) {
      g.fillStyle = D.alpha(r() < 0.5 ? '#ffffff' : '#000000', 0.05 + r() * 0.04);
      g.fillRect(r() * L.pw, r() * L.ph, 1.2, 1.2);
    }
    leafTex = c; leafKey = key;
    return c;
  }
  function drawLeaf() {
    const g = ctx, L = L1;
    const sc = L.sc, X = function (x) { return L.px + x * sc; }, Y = function (y) { return L.py + y * sc; };
    // 陰影與試片
    g.save();
    g.shadowColor = D.alpha('#000000', D.dark ? 0.5 : 0.22); g.shadowBlur = 14; g.shadowOffsetY = 5;
    D.roundRect(g, L.px, L.py, L.pw, L.ph, 12); g.fillStyle = C['bm-leaf']; g.fill();
    g.restore();
    g.save();
    D.roundRect(g, L.px, L.py, L.pw, L.ph, 12); g.clip();
    g.drawImage(leafTexture(L), L.px, L.py, L.pw, L.ph);
    // 灰塵
    for (let i = 0; i < NDIRT; i++) {
      if (dirt.alive[i] !== 1) continue;
      const x = X(dirt.xs[i]), y = Y(dirt.ys[i]), s = 1.6 + ((i * 37) % 5) * 0.35;
      g.fillStyle = D.alpha('#000000', 0.25); g.beginPath(); g.arc(x + 0.7, y + 0.9, s, 0, 2 * Math.PI); g.fill();
      g.fillStyle = C['bm-dirt']; g.beginPath(); g.arc(x, y, s, 0, 2 * Math.PI); g.fill();
    }
    // 水珠
    st1.drops.forEach(function (d) { drawDrop(g, X(d.x), Y(d.y), d, sc); });
    g.restore();
    D.roundRect(g, L.px, L.py, L.pw, L.ph, 12);
    g.strokeStyle = D.alpha(D.shade(C['bm-leaf2'], -0.3), 0.9); g.lineWidth = 1.5; g.stroke();
    // 滴管游標（鍵盤或滑鼠移動中）
    if (kb1 && kb1.focused()) {
      const x = X(st1.cursor.x), y = Y(st1.cursor.y);
      g.setLineDash([4, 3]); g.strokeStyle = D.c.accent; g.lineWidth = 2;
      g.beginPath(); g.arc(x, y, 9, 0, 2 * Math.PI); g.stroke(); g.setLineDash([]);
      g.beginPath(); g.moveTo(x - 4, y); g.lineTo(x + 4, y); g.moveTo(x, y - 4); g.lineTo(x, y + 4); g.stroke();
    }
    // 下坡方向、比例尺、傾斜示意
    const tilt = val(el.tilt);
    small(g, T('上坡', 'uphill'), L.px + L.pw / 2, L.py - 10, D.c.muted, 'center');
    arrow(g, L.px + L.pw + 12, L.py + 30, L.px + L.pw + 12, L.py + L.ph - 30, D.alpha(D.c.muted, 0.8), 1.6);
    g.save(); g.translate(L.px + L.pw + 22, L.py + L.ph / 2); g.rotate(Math.PI / 2);
    small(g, T('下坡', 'downhill'), 0, 0, D.c.muted, 'center'); g.restore();
    const sb = 5 * sc;
    g.strokeStyle = D.c.text; g.lineWidth = 2;
    const by = L.py + L.ph + 14;
    g.beginPath(); g.moveTo(L.px, by); g.lineTo(L.px + sb, by); g.stroke();
    small(g, '5 mm', L.px + sb + 6, by, D.c.text);
    // 傾斜角小圖
    const ix = L.px + L.pw - 70, iy = by;
    g.strokeStyle = D.alpha(D.c.text, 0.6); g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(ix, iy); g.lineTo(ix + 56, iy); g.stroke();
    const tr = tilt * B.DEG;
    g.strokeStyle = C['bm-leaf2']; g.lineWidth = 3;
    g.beginPath(); g.moveTo(ix, iy); g.lineTo(ix + 50 * Math.cos(tr), iy - 50 * Math.sin(tr)); g.stroke();
    small(g, deg(tilt), ix + 58, iy - 9, D.c.text, 'left');
  }
  /** 俯視的水珠：Cassie 圓滾滾、亮；Wenzel 扁、透；攤開是一片水膜 */
  function drawDrop(g, x, y, d, sc) {
    const s = d.s, c = Math.max(2.2, s.c * 1e3 * sc);
    if (s.mode === 'spread') {
      g.fillStyle = D.alpha(C['bm-water'], 0.28);
      g.beginPath(); g.ellipse(x, y, c * 0.9, c * 0.75, 0.4, 0, 2 * Math.PI); g.fill();
      g.strokeStyle = D.alpha(C['bm-water'], 0.6); g.lineWidth = 1; g.stroke();
      return;
    }
    const tall = Math.min(1, Math.max(0, (s.theta - 30) / 140));   // 越圓越立體
    // 影子（往下坡偏）
    g.fillStyle = D.alpha('#000000', 0.12 + 0.18 * tall);
    g.beginPath(); g.ellipse(x + c * 0.15, y + c * (0.18 + 0.35 * tall), c * 1.02, c * (0.8 + 0.2 * tall), 0, 0, 2 * Math.PI); g.fill();
    const gr = g.createRadialGradient(x - c * 0.35, y - c * 0.4, c * 0.08, x, y, c * 1.05);
    gr.addColorStop(0, D.alpha(C['bm-water-hi'], 0.95));
    gr.addColorStop(0.45, D.alpha(C['bm-water'], 0.45 + 0.35 * tall));
    gr.addColorStop(1, D.alpha(D.shade(C['bm-water'], -0.3), 0.65 + 0.3 * tall));
    g.fillStyle = gr;
    g.beginPath(); g.arc(x, y, c, 0, 2 * Math.PI); g.fill();
    g.strokeStyle = D.alpha(D.shade(C['bm-water'], -0.35), 0.7); g.lineWidth = 1; g.stroke();
    // 沾在水珠裡的灰塵
    const nh = Math.min(8, (d.held || []).length);
    for (let k = 0; k < nh; k++) {
      const an = k * 2.4 + d.id, rr = c * 0.55 * Math.sqrt((k + 0.5) / 8);
      g.fillStyle = D.alpha(C['bm-dirt'], 0.8);
      g.beginPath(); g.arc(x + rr * Math.cos(an), y + rr * Math.sin(an) + c * 0.15, Math.max(1, c * 0.09), 0, 2 * Math.PI); g.fill();
    }
    g.fillStyle = D.alpha('#ffffff', 0.85);
    g.beginPath(); g.ellipse(x - c * 0.35, y - c * 0.42, c * 0.22, c * 0.14, -0.6, 0, 2 * Math.PI); g.fill();
    if (d.wet && !s.smooth) {   // 被打穿：邊緣標一圈虛線
      g.setLineDash([3, 2]); g.strokeStyle = C['bm-bad']; g.lineWidth = 1.2;
      g.beginPath(); g.arc(x, y, c + 2.5, 0, 2 * Math.PI); g.stroke(); g.setLineDash([]);
    }
  }

  // ---------- 側視與微結構 ----------
  function drawSide() {
    const g = ctx, R = L1.side;
    const s = st1.focus || dropState(0, false);
    panel(g, R.x, R.y, R.w, R.h);
    const top = { x: R.x, y: R.y, w: R.w, h: R.h * 0.5 }, bot = { x: R.x, y: R.y + R.h * 0.5, w: R.w, h: R.h * 0.5 };
    title(g, T('水珠的側面', 'Side view of the drop'), top.x + 12, top.y + 16);
    small(g, st1.focus ? (st1.focusIsRain ? T('最近一滴雨', 'latest rain drop') : T('最近放的水珠', 'latest drop')) : T('還沒放水珠：照目前設定', 'no drop yet: current settings'), top.x + top.w - 12, top.y + 16, D.c.muted, 'right');
    // 地面
    const gy = top.y + top.h - 26, cx = top.x + top.w / 2;
    const scale = Math.min((top.w - 50) / 2 / Math.max(s.c * 1e3, 0.6), (top.h - 60) / Math.max(s.H * 1e3, 0.4), 140);
    g.fillStyle = D.alpha(C['bm-leaf2'], 0.8);
    g.fillRect(top.x + 14, gy, top.w - 28, 8);
    if (!s.smooth) {   // 示意的細紋（不按比例）
      g.fillStyle = C['bm-leaf'];
      for (let x = top.x + 16; x < top.x + top.w - 16; x += 4) g.fillRect(x, gy - 2, 2, 2);
    }
    // 球冠
    const th = Math.max(1, s.theta) * B.DEG, c = s.c * 1e3 * scale;
    const Rr = c / Math.sin(th), yc = gy + Rr * Math.cos(th);
    g.save();
    g.beginPath(); g.rect(top.x, top.y, top.w, gy - top.y); g.clip();
    const gr = g.createRadialGradient(cx - c * 0.3, yc - Rr * 0.5, 2, cx, yc, Rr);
    gr.addColorStop(0, D.alpha(C['bm-water-hi'], 0.95)); gr.addColorStop(1, D.alpha(C['bm-water'], 0.85));
    g.fillStyle = gr;
    if (s.mode === 'spread') { g.fillRect(top.x + 14, gy - 3, top.w - 28, 3); }
    else { g.beginPath(); g.arc(cx, yc, Rr, 0, 2 * Math.PI); g.fill(); g.strokeStyle = D.shade(C['bm-water'], -0.3); g.lineWidth = 1.2; g.stroke(); }
    g.restore();
    if (s.mode !== 'spread') {
      // 接觸角
      const ex = cx + c, rArc = Math.min(30, Math.max(16, c * 0.4));
      g.strokeStyle = D.c.text; g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(ex - rArc * 1.6, gy); g.lineTo(ex + 6, gy); g.stroke();
      // 切線方向（從接觸點往外）
      const tx = -Math.cos(th), ty = -Math.sin(th);
      g.beginPath(); g.moveTo(ex, gy); g.lineTo(ex + tx * rArc * 1.6, gy + ty * rArc * 1.6); g.stroke();
      g.beginPath(); g.arc(ex, gy, rArc, Math.PI, Math.PI + th, false); g.strokeStyle = D.c.accent; g.lineWidth = 2; g.stroke();
      D.haloText(g, 'θ = ' + deg(s.theta), ex + 10, gy - rArc - 10, D.c.accent, 'left', 'middle', '600 13px ' + FONT);
    } else D.haloText(g, T('攤成水膜：θ ≈ 0°', 'spread into a film: θ ≈ 0°'), cx, gy - 18, D.c.accent, 'center', 'middle', '600 13px ' + FONT);
    // 比例尺 1 mm
    const mm = scale;
    if (mm > 12 && mm < top.w - 60) {
      g.strokeStyle = D.c.text; g.lineWidth = 2;
      g.beginPath(); g.moveTo(top.x + 16, gy + 18); g.lineTo(top.x + 16 + mm, gy + 18); g.stroke();
      small(g, '1 mm', top.x + 22 + mm, gy + 18, D.c.text);
    }
    small(g, modeLabel(s), top.x + top.w - 14, gy + 18, s.mode === 'cassie' ? C['bm-good'] : s.mode === 'smooth' ? D.c.muted : C['bm-bad'], 'right');
    drawMicro(bot, s);
  }
  function modeLabel(s) {
    if (s.mode === 'cassie') return T('Cassie（底下有空氣）', 'Cassie (air underneath)');
    if (s.mode === 'wenzel') return T('Wenzel（水填滿縫隙）', 'Wenzel (gaps filled)');
    if (s.mode === 'spread') return T('攤開', 'Spread');
    return T('平面', 'Smooth');
  }
  /** 微結構放大：柱子按比例；Cassie 時水面架在柱頂、稍微下垂，Wenzel 時水填滿 */
  function drawMicro(R, s) {
    const g = ctx;
    g.strokeStyle = D.alpha(D.c.border, 0.9); g.lineWidth = 1;
    g.beginPath(); g.moveTo(R.x + 10, R.y + 0.5); g.lineTo(R.x + R.w - 10, R.y + 0.5); g.stroke();
    title(g, T('放大到微米：柱子按比例', 'Zoom to micrometres: pillars to scale'), R.x + 12, R.y + 16);
    const a = val(el.pa), b = val(el.pb), h = val(el.ph);
    const x0 = R.x + 14, x1 = R.x + R.w - 14, base = R.y + R.h - 34;
    const wTop = R.y + 54;                 // 水的上緣（標題與說明列在上面）
    const avail = base - wTop - 14;
    const wetTxt = s.smooth ? T('平滑表面：水直接貼著固體', 'Smooth: water touches the solid') :
      (s.mode === 'wenzel' || s.mode === 'spread') ? T('水填滿縫隙', 'water fills the gaps') : T('水架在柱頂', 'water rests on the tips');
    small(g, wetTxt, x0, R.y + 34, D.c.text, 'left');
    // 壓力：水往下壓的壓力 ÷ 刺穿空氣墊需要的壓力
    if (!s.smooth && s.thAY > 90) {
      const Pc = s.Pcrit, Pr = Math.max(s.Plap, s.Pdyn), fr = Pc > 0 ? Math.min(1, Pr / Pc) : 1;
      const bw = Math.min(110, R.w * 0.3), bx = x1 - bw, byy = R.y + 42;
      small(g, T('壓力 ', 'pressure ') + fmtP(Pr) + T('／刺穿 ', ' / breaks at ') + fmtP(Pc), x1, R.y + 34, Pr > Pc ? C['bm-bad'] : D.c.muted, 'right');
      D.roundRect(g, bx, byy, bw, 6, 3); g.fillStyle = D.alpha(D.c.text, 0.1); g.fill();
      D.roundRect(g, bx, byy, Math.max(4, bw * fr), 6, 3); g.fillStyle = Pr > Pc ? C['bm-bad'] : C['bm-good']; g.fill();
    }
    if (s.smooth) {
      g.fillStyle = C['bm-pillar']; g.fillRect(x0, base, x1 - x0, 10);
      g.fillStyle = D.alpha(C['bm-water'], 0.55); g.fillRect(x0, wTop, x1 - x0, base - wTop);
      return;
    }
    const p = a + b;
    const nP = Math.max(3, Math.min(9, Math.floor((x1 - x0) / 40)));
    const sc = Math.min((x1 - x0) / (nP * p), avail / Math.max(h * 1.25, p * 0.4));
    const totalW = nP * p * sc, ox = (x0 + x1) / 2 - totalW / 2 + b * sc / 2;
    const topY = base - h * sc;
    // 底
    g.fillStyle = D.shade(C['bm-pillar'], -0.15); g.fillRect(x0, base, x1 - x0, 10);
    const wet = s.mode === 'wenzel' || s.mode === 'spread';
    // 水
    const P = Math.max(s.Plap, s.Pdyn), sag = s.mode === 'cassie' && s.Pcrit > 0 ? Math.min(0.9, P / s.Pcrit) : 0;
    g.fillStyle = D.alpha(C['bm-water'], 0.5);
    if (wet) g.fillRect(x0, wTop, x1 - x0, base - wTop);
    else {
      g.fillStyle = D.alpha(C['bm-air'], 0.9); g.fillRect(x0, topY, x1 - x0, base - topY);
      g.fillStyle = D.alpha(C['bm-water'], 0.5);
      g.beginPath(); g.moveTo(x0, wTop); g.lineTo(x1, wTop); g.lineTo(x1, topY);
      for (let i = nP; i >= -1; i--) {
        const L = ox + i * p * sc, Rr = L + a * sc;   // 第 i 根柱的左右緣
        g.lineTo(Math.min(x1, Rr), topY);
        if (i >= 0) g.lineTo(Math.max(x0, L), topY);
        // 往左一格的彎月面（凹下的深度照壓力比例，示意）
        const gapR = L, gapL = ox + (i - 1) * p * sc + a * sc;
        const mid = (gapL + gapR) / 2, dip = sag * Math.min(h * sc * 0.9, (gapR - gapL) * 0.5);
        g.quadraticCurveTo(mid, topY + 2 * dip, Math.max(x0, gapL), topY);
      }
      g.lineTo(x0, topY); g.closePath(); g.fill();
      if (h * sc > 14) small(g, T('空氣', 'air'), ox + (a + b / 2) * sc, (topY + base) / 2, D.c.muted, 'center');
    }
    // 柱子
    for (let i = 0; i < nP; i++) {
      const L = ox + i * p * sc;
      if (L > x1 || L + a * sc < x0) continue;
      const gr = g.createLinearGradient(L, 0, L + a * sc, 0);
      gr.addColorStop(0, D.shade(C['bm-pillar'], 0.25)); gr.addColorStop(1, D.shade(C['bm-pillar'], -0.2));
      g.fillStyle = gr; g.fillRect(L, topY, Math.max(1, a * sc), h * sc);
    }
    // 尺寸（一行字）
    small(g, 'a = ' + num(a, 1) + ' µm   b = ' + num(b, 1) + ' µm   h = ' + num(h, 1) + ' µm', x0, base + 24, D.c.muted, 'left');
  }

  function draw1() {
    if (view3 && view3.active) return;
    const g = ctx;
    g.clearRect(0, 0, W1, H1);
    D.backdrop && D.backdrop(g, W1, H1);
    drawLeaf();
    drawSide();
  }

  // ---------- 互動：點葉面放水珠 ----------
  cv.addEventListener('pointerdown', function (ev) {
    const p = evPos(cv, ev), L = L1;
    const x = (p[0] - L.px) / L.sc, y = (p[1] - L.py) / L.sc;
    if (x < 0 || x > PLATE.W || y < 0 || y > PLATE.L) return;
    st1.cursor.x = x; st1.cursor.y = y;
    place(x, y, 0, false);
    setStatus('status', statusForDrop(st1.focus));
  });
  function statusForDrop(s) {
    const tilt = val(el.tilt);
    const roll = s.roll == null ? T('垂直也不會滑', 'it would not slide even if vertical') : T('傾斜超過 ' + deg(s.roll) + ' 就會滾', 'it rolls above ' + deg(s.roll));
    const base = T('放了一顆 ', 'Placed a ') + num(val(el.vol), 0) + T(' µL 的水珠：', ' µL drop: ') + modeName(s.mode) + T('，接觸角 ', ', contact angle ') + deg(s.theta) + T('，', '; ') + roll;
    return base + (s.roll != null && tilt > s.roll ? T('——現在就滾下去了。', ' — so it rolls now.') : T('。', '.'));
  }
  const kb1 = window.LabKeys ? window.LabKeys.attach(cv, {
    label: T('葉面畫布：方向鍵移動滴管位置，按「滴一滴」放水珠。', 'Leaf canvas: arrow keys move the dropper; press “Add a drop” to place a drop.'),
    items: [{
      name: T('滴管', 'Dropper'),
      move: function (dx, dy, big) {
        const s = big ? 2 : 0.5;
        st1.cursor.x = Math.max(0.3, Math.min(PLATE.W - 0.3, st1.cursor.x + dx * s));
        st1.cursor.y = Math.max(0.3, Math.min(PLATE.L - 0.3, st1.cursor.y - dy * s));
        request();
      },
      describe: function () { return T('滴管在離左緣 ', 'Dropper ') + num(st1.cursor.x, 1) + T(' mm、離上緣 ', ' mm from the left, ') + num(st1.cursor.y, 1) + T(' mm。', ' mm from the top.'); }
    }],
    onChange: function () { request(); }
  }) : null;
  cv.addEventListener('focus', request); cv.addEventListener('blur', request);

  // ---------- 材料、微結構按鈕 ----------
  let batch = false;
  function renderChips() {
    const mid = matId();
    $('mats').innerHTML = B.MATERIALS.map(function (m) {
      return '<button type="button" data-m="' + m.id + '" aria-pressed="' + (m.id === mid) + '">' + T(m.zh, m.en) + '</button>';
    }).join('');
    const a = val(el.pa), b = val(el.pb), h = val(el.ph);
    $('texs').innerHTML = TEX.map(function (t) {
      const on = t.h === 0 ? h === 0 : (h === t.h && a === t.a && b === t.b);
      return '<button type="button" data-t="' + t.id + '" aria-pressed="' + on + '">' + T(t.zh, t.en) + '</button>';
    }).join('');
  }
  $('mats').addEventListener('click', function (ev) {
    const bt = ev.target.closest('button[data-m]');
    if (!bt) return;
    const m = B.MATERIALS.find(function (x) { return x.id === bt.getAttribute('data-m'); });
    batch = true; window.LabNum.set(el.thY, m.thY); window.LabNum.set(el.hyst, m.hyst); batch = false;
    surfaceChanged();
  });
  $('texs').addEventListener('click', function (ev) {
    const bt = ev.target.closest('button[data-t]');
    if (!bt) return;
    const t = TEX.find(function (x) { return x.id === bt.getAttribute('data-t'); });
    batch = true;
    if (t.h > 0) { window.LabNum.set(el.pa, t.a); window.LabNum.set(el.pb, t.b); }
    window.LabNum.set(el.ph, t.h);
    batch = false;
    surfaceChanged();
  });
  /** 表面換了：擦掉水珠（灰塵留著） */
  function surfaceChanged() {
    if (batch) return;
    refreshOutputs();
    renderChips();
    if (st1.drops.length) st1.mixed = true;
    st1.drops.forEach(function (d) { release(d, false); });
    st1.drops = [];
    st1.focus = null;
    renderRo1();
    if (view3 && view3.active) view3.rebuild();
    const g = dropState(0, false);
    emit('surface', { mat: matId(), thY: g.thY, a: val(el.pa), b: val(el.pb), h: val(el.ph), smooth: g.smooth, mode: g.mode, theta: g.theta, thc: g.thc, roll: g.roll });
    request();
  }

  // =====================================================================
  // 二・壁虎
  // =====================================================================
  const cv2 = $('cv2'), ctx2 = cv2.getContext('2d');
  let W2 = 300, H2 = 460;
  const gk = { lifted: false, toe: 0, toeTarget: 0, fallen: false, fallT: 0, falling: false, res: null, peeled: false };
  function geckoEval() {
    const feet = gk.lifted && gk.toe >= DETACH ? 3 : 4;
    const r = B.gecko(val(el.wall), val(el.mass) / 1000, fracV() * feet / 4);
    r.feet = feet;
    gk.res = r;
    return r;
  }
  function geckoData() {
    const r = gk.res || geckoEval();
    return { wall: val(el.wall), m: val(el.mass) / 1000, f: fracV(), hold: r.hold && !gk.falling && !gk.fallen, safety: r.safety, use: r.use, feet: r.feet, lifted: gk.lifted && gk.toe >= DETACH, limit: r.limit };
  }
  /** 設定改了：把壁虎放回去重新判斷 */
  function geckoSettle(record) {
    gk.fallen = false; gk.falling = false; gk.fallT = 0;
    const r = geckoEval();
    if (!r.hold) startFall();
    renderRo2();
    if (record) addRow2();
    emit('gecko', geckoData());
    request();
  }
  function startFall() {
    if (gk.falling || gk.fallen) return;
    gk.falling = true; gk.fallT = 0;
    sndChord(false);
    setStatus('status2', T('撐不住，壁虎掉下來了！', 'It cannot hold on — the gecko falls!') + ' ' + T('需要的力超過貼住的剛毛能承受的 ', 'The load is ') + pct(gk.res.use, 0) + T('。', ' of what the setae in contact can bear.'));
  }
  function stepGecko(dt) {
    let more = false;
    if (gk.toe !== gk.toeTarget) {
      const sp = 140;  // 度／秒
      const was = gk.toe;
      gk.toe = gk.toeTarget > gk.toe ? Math.min(gk.toeTarget, gk.toe + sp * dt) : Math.max(gk.toeTarget, gk.toe - sp * dt);
      if (was < DETACH && gk.toe >= DETACH) {
        sndPeel();
        const r = geckoEval();
        if (!r.hold) startFall();
        else setStatus('status2', T('腳趾翻到超過 30°，剛毛一下就放開了；剩下三隻腳還撐得住（安全係數 ', 'Past 30° the setae let go at once; the other three feet still hold (safety factor ') + num(r.safety, 2) + T('）。', ').'));
        renderRo2(); addRow2();
        emit('gecko', geckoData());
      }
      if (was >= DETACH && gk.toe < DETACH) { geckoEval(); renderRo2(); }
      more = true;
    }
    if (gk.falling) {
      gk.fallT += dt;
      if (gk.fallT > 1.4) { gk.falling = false; gk.fallen = true; }
      more = true;
    }
    return more;
  }

  // ---------- 紀錄表 ----------
  let rows2 = [];
  function addRow2() {
    const r = gk.res || geckoEval(), d = geckoData();
    const key = [d.wall, d.m, d.f, d.feet].join('|');
    if (rows2.length && rows2[0].key === key) return;
    rows2.unshift({ key: key, n: (rows2.length ? rows2[0].n : 0) + 1, d: d, r: r });
    if (rows2.length > MAX_ROWS) rows2.length = MAX_ROWS;
    renderRows2();
  }
  function renderRows2() {
    const t = $('runs2');
    if (!rows2.length) { t.innerHTML = ''; return; }
    let h = '<thead><tr><th>#</th><th>' + T('牆角', 'Wall') + '</th><th>' + T('體重', 'Mass') + '</th><th>' + T('剛毛', 'Setae') + '</th><th>' + T('腳', 'Feet') +
      '</th><th>' + T('剪力 / 上限', 'Shear / limit') + '</th><th>' + T('拉離 / 上限', 'Pull-off / limit') + '</th><th>' + T('安全係數', 'Safety') + '</th><th>' + T('結果', 'Result') + '</th></tr></thead><tbody>';
    rows2.forEach(function (o) {
      const d = o.d, r = o.r;
      h += '<tr><td>' + o.n + '</td><td>' + num(d.wall, 0) + '°</td><td>' + num(d.m * 1000, 0) + ' g</td><td>' + sig(d.f * 100, 3) + '%</td><td>' + d.feet +
        '</td><td>' + fmtF(r.S) + ' / ' + fmtF(r.Smax * 1) + '</td><td>' + fmtF(r.P) + ' / ' + fmtF(r.Pmax) + '</td><td>' + (isFinite(r.safety) ? num(r.safety, 2) : '∞') +
        '</td><td class="' + (r.hold ? 'yes' : 'no') + '">' + (r.hold ? T('撐住', 'holds') : T('掉下', 'falls')) + '</td></tr>';
    });
    t.innerHTML = h + '</tbody>';
  }
  function renderRo2() {
    const r = gk.res || geckoEval();
    const mf = B.minFraction(val(el.wall), val(el.mass) / 1000) * 4 / r.feet;
    const n = nV(), pad = padEval();
    const rows = [
      [T('體重', 'Weight'), fmtF(val(el.mass) / 1000 * B.G), num(val(el.mass), 0) + ' g'],
      [T('沿牆面的剪力', 'Shear along the wall'), fmtF(r.S), T('上限 ', 'limit ') + fmtF(r.Smax), r.S > r.Smax ? 'bad' : ''],
      [T('拉離牆面的力', 'Pull away from the wall'), fmtF(r.P), T('上限 ', 'limit ') + fmtF(r.Pmax) + T('（剪力上限 × tan 30°）', ' (shear limit × tan 30°)'), r.P > r.Pmax ? 'bad' : ''],
      [T('安全係數', 'Safety factor'), isFinite(r.safety) ? num(r.safety, 2) : '∞', r.hold ? T('撐得住', 'holds') : T('撐不住', 'cannot hold'), r.hold ? 'good' : 'bad'],
      [T('最少要貼住', 'Setae needed at least'), mf > 1 ? T('全部也不夠', 'more than all of them') : sig(mf * 100, 3) + '%', fmtN(mf * B.GECKO.setae) + T(' 根（全身約 650 萬根）', ' setae (of about 6.5 million)')],
      [T('著地的腳', 'Feet on the wall'), String(r.feet), gk.lifted ? T('腳趾翻起 ', 'toe raised ') + num(gk.toe, 0) + '°' : ''],
      [T('黏著墊 1 mm² 分成', '1 mm² pad split into'), fmtN(n) + T(' 個尖端', ' tips'), T('每個半徑 ', 'tip radius ') + fmtLen(pad.R)],
      [T('黏著墊的拉脫力', 'Pad pull-off force'), fmtF(pad.F), T('可以吊起 ', 'can hold ') + fmtG(pad.F / B.G * 1000) + T('（一整塊的 ', ' (') + sig(B.splitGain(n), 3) + T(' 倍）', ' × one solid pad)')]
    ];
    $('ro2').innerHTML = rows.map(function (o) {
      return '<dt>' + o[0] + '</dt><dd' + (o[3] ? ' class="' + o[3] + '"' : '') + '>' + o[1] + (o[2] ? '<small>' + o[2] + '</small>' : '') + '</dd>';
    }).join('');
  }
  function fmtLen(m) { return m >= 1e-3 ? sig(m * 1e3, 3) + ' mm' : m >= 1e-6 ? sig(m * 1e6, 3) + ' µm' : sig(m * 1e9, 3) + ' nm'; }

  // ---------- 畫壁虎 ----------
  function layout2() {
    const narrow = W2 < 640;
    if (narrow) return { narrow: true, scene: { x: 0, y: 0, w: W2, h: 340 }, hier: { x: 10, y: 344, w: W2 - 20, h: 150 }, chart: { x: 10, y: 504, w: W2 - 20, h: H2 - 514 } };
    const sw = Math.round(W2 * 0.56);
    return { narrow: false, scene: { x: 0, y: 0, w: sw, h: H2 }, hier: { x: sw + 10, y: 10, w: W2 - sw - 20, h: 190 }, chart: { x: sw + 10, y: 210, w: W2 - sw - 20, h: H2 - 220 } };
  }
  function resize2() {
    W2 = cv2.clientWidth || 300;
    H2 = W2 < 640 ? 740 : 460;
    fit(cv2, ctx2, H2);
    request();
  }
  function drawGeckoScene(R) {
    const g = ctx2;
    const wall = val(el.wall), t = wall * B.DEG;
    const cx = R.x + R.w / 2, cy = R.y + R.h * 0.52;
    const len = Math.min(R.w * 0.86, R.h * 0.86);
    // 掉落的位移
    let fy = 0, fa = 1;
    if (gk.falling || gk.fallen) {
      const tt = Math.min(gk.fallT, 1.4);
      fy = 0.5 * 1400 * tt * tt * 0.35; fa = gk.fallen ? 0 : Math.max(0, 1 - tt / 1.4);
    }
    g.save();
    g.translate(cx, cy);
    g.rotate(-t);
    // 牆板
    const th = 18;
    g.save();
    g.shadowColor = D.alpha('#000000', D.dark ? 0.5 : 0.25); g.shadowBlur = 10; g.shadowOffsetY = 4;
    D.roundRect(g, -len / 2, 0, len, th, 4);
    const gr = g.createLinearGradient(0, 0, 0, th);
    gr.addColorStop(0, D.shade(C['bm-wall'], 0.15)); gr.addColorStop(1, D.shade(C['bm-wall'], -0.25));
    g.fillStyle = gr; g.fill();
    g.restore();
    g.strokeStyle = D.alpha(D.shade(C['bm-wall'], -0.4), 0.8); g.lineWidth = 1;
    for (let x = -len / 2 + 14; x < len / 2; x += 26) { g.beginPath(); g.moveTo(x, 3); g.lineTo(x + 8, th - 3); g.stroke(); }
    g.restore();
    // 壁虎（在牆板座標裡畫，掉落時沿畫面向下）
    if (!gk.fallen) {
      g.save();
      g.globalAlpha = fa;
      g.translate(cx, cy + fy);
      g.rotate(-t);
      drawGecko(g, len * 0.6, gk.falling);
      g.restore();
    }
    // 力的箭頭（畫面座標）
    if (!gk.falling && !gk.fallen) {
      const r = gk.res || geckoEval();
      const W = val(el.mass) / 1000 * B.G;
      const k = 70 / Math.max(W, 1e-9);
      // 重心：牆面法線往外約 22 px
      const nx = -Math.sin(t) * -1, ny = -Math.cos(t);   // 牆面外法線（畫面座標）
      const gx = cx + nx * 26, gy = cy + ny * 26;
      arrow(g, gx, gy, gx, gy + W * k, D.c.text, 2.4);
      small(g, T('重力', 'weight'), gx + 6, gy + W * k - 4, D.c.text, 'left');
      // 分量
      const ux = Math.cos(t), uy = -Math.sin(t);   // 沿牆面（往「上坡」）
      const sAlong = W * Math.sin(t) * -1;          // 重力沿 u 的分量（往下坡為負）
      const along = (0 * ux + 1 * uy);              // 重力方向 (0,1) 在 u 上的投影
      if (Math.abs(along) > 0.02) arrow(g, gx, gy, gx + ux * along * W * k, gy + uy * along * W * k, C['bm-good'], 2, [5, 4]);
      const nproj = 0 * nx + 1 * ny;                // 重力在外法線上的投影（> 0 表示把壁虎拉離牆）
      if (nproj > 0.02) arrow(g, gx, gy, gx + nx * nproj * W * k, gy + ny * nproj * W * k, C['bm-bad'], 2, [5, 4]);
      void sAlong; void r;
    }
    // 角度標示
    small(g, T('牆的傾角 ', 'wall tilt ') + num(wall, 0) + '°', R.x + 12, R.y + 16, D.c.text, 'left');
    const r = gk.res || geckoEval();
    if (gk.fallen) D.haloText(g, T('掉下來了——按「把壁虎放回去」', 'It fell — press “Put the gecko back”'), cx, R.y + R.h - 18, C['bm-bad'], 'center', 'middle', '600 13px ' + FONT);
    else {
      // 用量條
      const bx = R.x + 12, by = R.y + R.h - 44, bw = Math.min(200, R.w - 24);
      [[T('剪力', 'shear'), r.Smax > 0 ? r.S / r.Smax : (r.S > 0 ? 2 : 0)], [T('拉離', 'pull-off'), r.Pmax > 0 ? r.P / r.Pmax : (r.P > 0 ? 2 : 0)]].forEach(function (q, i) {
        const y = by + i * 16, fr = Math.min(1, q[1]);
        D.roundRect(g, bx + 46, y, bw - 46, 8, 4); g.fillStyle = D.alpha(D.c.text, 0.1); g.fill();
        if (fr > 0) { D.roundRect(g, bx + 46, y, Math.max(4, (bw - 46) * fr), 8, 4); g.fillStyle = q[1] > 1 ? C['bm-bad'] : i ? C['bm-bad'] : C['bm-good']; g.fill(); }
        small(g, q[0], bx, y + 4, D.c.muted, 'left');
        small(g, q[1] > 1 ? '> 100%' : pct(q[1], q[1] < 0.01 && q[1] > 0 ? 2 : 0), bx + bw + 6, y + 4, D.c.text, 'left');
      });
    }
  }
  /** 側面的壁虎：頭朝牆面「上坡」方向（+x），腳貼在 y = 0，身體在 y < 0 */
  function drawGecko(g, L, falling) {
    const s = L / 200;   // 以身長 200 為基準
    g.save(); g.scale(s, s);
    const body = C['bm-gecko'], dark = C['bm-gecko2'];
    const lift = gk.lifted ? gk.toe : 0;
    // 尾巴
    g.fillStyle = dark;
    g.beginPath(); g.moveTo(-40, -16); g.quadraticCurveTo(-95, -14, -150, -8); g.quadraticCurveTo(-96, -4, -40, -6); g.closePath(); g.fill();
    // 腿與腳
    const legs = [[52, 1], [32, 0], [-28, 1], [-48, 0]];   // [x, 遠／近]
    legs.forEach(function (lg, i) {
      const x = lg[0], far = lg[1];
      g.globalAlpha = far ? 0.75 : 1;
      g.strokeStyle = far ? D.shade(dark, -0.15) : dark; g.lineWidth = 7; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x, -14); g.lineTo(x + (i < 2 ? 10 : -10), -5); g.lineTo(x + (i < 2 ? 14 : -14), -1); g.stroke();
      // 腳趾（趾瓣）：前左腳可以翻起
      const fx = x + (i < 2 ? 14 : -14);
      const ang = (i === 1 && !falling) ? lift * B.DEG : 0;
      g.save(); g.translate(fx, 0);
      for (let k = -1; k <= 1; k++) {
        g.save(); g.rotate(k * 0.25 * (i < 2 ? 1 : -1));
        g.save(); g.rotate(-ang * (i < 2 ? 1 : -1));
        const dir = i < 2 ? 1 : -1;
        g.fillStyle = far ? D.shade(body, -0.1) : body;
        D.roundRect(g, dir > 0 ? 0 : -16, -3, 16, 4, 2); g.fill();
        g.strokeStyle = D.alpha(D.shade(dark, -0.3), 0.7); g.lineWidth = 0.8;
        for (let q = 3; q < 16; q += 3) { g.beginPath(); g.moveTo(dir * q, -3); g.lineTo(dir * q, 1); g.stroke(); }
        g.restore(); g.restore();
      }
      g.restore();
    });
    g.globalAlpha = 1;
    // 身體
    const gr = g.createLinearGradient(0, -34, 0, -6);
    gr.addColorStop(0, D.shade(body, 0.25)); gr.addColorStop(1, dark);
    g.fillStyle = gr;
    g.beginPath(); g.ellipse(6, -20, 58, 14, 0, 0, 2 * Math.PI); g.fill();
    // 頭
    g.beginPath(); g.ellipse(76, -22, 22, 12, 0.08, 0, 2 * Math.PI); g.fill();
    // 斑點
    g.fillStyle = D.alpha('#ffffff', 0.25);
    [[-20, -26], [0, -28], [20, -27], [40, -25], [-36, -22]].forEach(function (p) { g.beginPath(); g.arc(p[0], p[1], 3, 0, 2 * Math.PI); g.fill(); });
    // 眼睛
    g.fillStyle = '#f5d76e'; g.beginPath(); g.arc(84, -26, 4.5, 0, 2 * Math.PI); g.fill();
    g.fillStyle = '#1f2937'; g.fillRect(83.2, -29.5, 1.6, 7);
    g.restore();
  }
  /** 腳趾 → 剛毛 → 匙突的示意放大 */
  function drawHier(R) {
    const g = ctx2;
    panel(g, R.x, R.y, R.w, R.h);
    title(g, T('放大腳底', 'Zooming into the foot'), R.x + 12, R.y + 16);
    const n = 3, cw = (R.w - 24) / n, top = R.y + 30, h = R.h - 40;
    const labels = [
      [T('趾瓣', 'Lamellae'), T('趾底的皺褶', 'toe ridges')],
      [T('剛毛', 'Setae'), T('1.4 萬根/mm²', '14 400 /mm²')],
      [T('匙突', 'Spatulae'), T('寬約 0.2 µm', '~0.2 µm wide')]
    ];
    for (let i = 0; i < n; i++) {
      const x = R.x + 12 + i * cw, w = cw - 10;
      D.roundRect(g, x, top, w, h - 34, 8); g.fillStyle = D.alpha(D.c.text, 0.04); g.fill();
      g.save(); D.roundRect(g, x, top, w, h - 34, 8); g.clip();
      const bx = x + w / 2, base = top + h - 44;
      g.strokeStyle = C['bm-gecko2']; g.fillStyle = C['bm-gecko'];
      if (i === 0) {
        for (let k = 0; k < 5; k++) { D.roundRect(g, x + 8, top + 10 + k * ((h - 60) / 5), w - 16, (h - 60) / 5 - 4, 4); g.fill(); }
      } else if (i === 1) {
        g.lineWidth = 2;
        for (let k = 0; k < 9; k++) {
          const xx = x + 8 + k * (w - 16) / 8;
          g.beginPath(); g.moveTo(xx, top + 8); g.quadraticCurveTo(xx + 6, (top + base) / 2, xx + 12, base); g.stroke();
        }
      } else {
        g.lineWidth = 1.4;
        for (let k = 0; k < 7; k++) {
          const xx = x + 10 + k * (w - 20) / 6;
          g.beginPath(); g.moveTo(bx, top + 8); g.quadraticCurveTo(xx, (top + base) / 2, xx, base - 4); g.stroke();
          g.fillRect(xx - 5, base - 4, 10, 3);
        }
        g.fillStyle = D.alpha(C['bm-wall'], 0.9); g.fillRect(x, base, w, 8);
      }
      g.restore();
      D.haloText(g, labels[i][0], bx, top + h - 22, D.c.text, 'center', 'middle', '600 12px ' + FONT);
      small(g, labels[i][1], bx, top + h - 7, D.c.muted, 'center');
      if (i < n - 1) arrow(g, x + w + 1, top + (h - 34) / 2, x + w + 9, top + (h - 34) / 2, D.c.muted, 1.4);
    }
  }
  /** Kendall 剝離力 F/b = W/(1 − cos θ)（對數縱軸），標出 30° 脫離角與目前腳趾角度 */
  function drawPeel(R) {
    const g = ctx2;
    panel(g, R.x, R.y, R.w, R.h);
    title(g, T('撕開需要的力（每單位寬度）', 'Force to peel (per unit width)'), R.x + 12, R.y + 16);
    const p = { x0: R.x + 52, y0: R.y + 44, x1: R.x + R.w - 14, y1: R.y + R.h - 30 };
    const W = B.W_VDW, lo = Math.log10(0.05), hi = Math.log10(30);
    const X = function (a) { return p.x0 + (a - 0) / 90 * (p.x1 - p.x0); };
    const Y = function (f) { return p.y1 - (Math.log10(f) - lo) / (hi - lo) * (p.y1 - p.y0); };
    g.font = '11px ' + FONT; g.fillStyle = D.c.muted; g.textAlign = 'right'; g.textBaseline = 'middle';
    [0.1, 1, 10].forEach(function (f) {
      const y = Y(f);
      g.fillText(String(f), p.x0 - 6, y);
      g.strokeStyle = D.alpha(D.c.text, 0.07); g.beginPath(); g.moveTo(p.x0, y); g.lineTo(p.x1, y); g.stroke();
    });
    g.textAlign = 'center'; g.textBaseline = 'top';
    [0, 30, 60, 90].forEach(function (a) { g.fillText(a + '°', X(a), p.y1 + 6); });
    g.textAlign = 'left'; g.fillText('N/m', p.x0 - 40, p.y0 - 12);
    g.strokeStyle = D.alpha(D.c.text, 0.3); g.beginPath(); g.moveTo(p.x0, p.y0); g.lineTo(p.x0, p.y1); g.lineTo(p.x1, p.y1); g.stroke();
    // 脫離角
    g.setLineDash([5, 4]); g.strokeStyle = C['bm-bad']; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(X(DETACH), p.y0); g.lineTo(X(DETACH), p.y1); g.stroke(); g.setLineDash([]);
    small(g, T('剛毛脫離角約 30°', 'setae let go at ~30°'), X(DETACH) + 5, p.y0 + 8, C['bm-bad'], 'left');
    // 曲線
    g.strokeStyle = C['bm-gecko2']; g.lineWidth = 2.4;
    g.beginPath();
    let first = true;
    for (let a = 2; a <= 90; a += 0.5) {
      const f = B.kendall(a, W, Infinity);
      if (f > 30) continue;
      if (first) { g.moveTo(X(a), Y(f)); first = false; } else g.lineTo(X(a), Y(f));
    }
    g.stroke();
    // 目前腳趾角度
    const a = Math.max(2, gk.toe), f = Math.min(30, B.kendall(a, W, Infinity));
    D.ball ? D.ball(g, X(a), Y(f), 6, C['bm-gecko']) : (g.fillStyle = C['bm-gecko'], g.beginPath(), g.arc(X(a), Y(f), 6, 0, 2 * Math.PI), g.fill());
    const onRight = X(a) > p.x1 - 70;
    small(g, T('腳趾 ', 'toe ') + num(gk.toe, 0) + '°', X(a) + (onRight ? -9 : 9), Y(f) - 12, D.c.text, onRight ? 'right' : 'left');
    small(g, 'W = ' + num(W, 3) + ' J/m²', p.x1, p.y0 - 12, D.c.muted, 'right');
  }
  function draw2() {
    const g = ctx2;
    g.clearRect(0, 0, W2, H2);
    D.backdrop && D.backdrop(g, W2, H2);
    const L = layout2();
    drawGeckoScene(L.scene);
    drawHier(L.hier);
    drawPeel(L.chart);
  }
  window.LabKeys && window.LabKeys.attach(cv2, {
    label: T('壁虎畫布：左右鍵改牆的傾角，上下鍵改體重。', 'Gecko canvas: left and right change the wall tilt, up and down the body mass.'),
    items: [{
      name: T('牆與壁虎', 'Wall and gecko'),
      move: function (dx, dy, big) {
        if (dx) window.LabNum.set(el.wall, val(el.wall) + dx * (big ? 15 : 5));
        if (dy) window.LabNum.set(el.mass, val(el.mass) + dy * (big ? 50 : 10));
      },
      describe: function () { return T('牆的傾角 ', 'Wall tilt ') + num(val(el.wall), 0) + T('°，體重 ', '°, mass ') + num(val(el.mass), 0) + ' g。'; }
    }]
  });

  // ---------- 分岔的黏著墊 ----------
  const cv3 = $('cv3'), ctx3 = cv3.getContext('2d');
  let W3 = 300, H3 = 300;
  const pd = { hung: false, fell: false, t: 0 };
  const PAD_A = 1e-6;   // 1 mm²
  function padEval() {
    const n = nV(), R = Math.sqrt(PAD_A / (n * Math.PI));
    const F = n * B.jkr(R);
    const load = loadV();
    return { n: n, R: R, F: F, load: load, hold: F >= load / 1000 * B.G };
  }
  function resize3() { W3 = cv3.clientWidth || 300; H3 = W3 < 640 ? 520 : 300; fit(cv3, ctx3, H3); request(); }
  function drawPad() {
    const g = ctx3;
    g.clearRect(0, 0, W3, H3);
    D.backdrop && D.backdrop(g, W3, H3);
    const narrow = W3 < 640;
    const A = narrow ? { x: 0, y: 0, w: W3, h: 250 } : { x: 0, y: 0, w: W3 * 0.42, h: H3 };
    const Ch = narrow ? { x: 10, y: 256, w: W3 - 20, h: H3 - 266 } : { x: W3 * 0.42 + 10, y: 10, w: W3 * 0.58 - 20, h: H3 - 20 };
    const pe = padEval();
    // 天花板與黏著墊（側面）
    const cx = A.x + A.w / 2, ty = A.y + 40, pw = Math.min(A.w * 0.6, 200);
    g.fillStyle = C['bm-wall']; g.fillRect(A.x + 16, A.y + 26, A.w - 32, 14);
    small(g, T('光滑的天花板', 'smooth ceiling'), A.x + 18, A.y + 14, D.c.muted, 'left');
    const vis = Math.min(pe.n, 48);
    const tipW = pw / vis;
    let drop = 0;
    if (pd.fell) drop = Math.min(A.h, 0.5 * 1400 * pd.t * pd.t);
    g.save();
    g.beginPath(); g.rect(A.x, A.y + 26, A.w, A.h - 64); g.clip();   // 掉下去的砝碼不蓋到下方文字
    g.translate(0, drop);
    if (pd.fell) g.globalAlpha = Math.max(0, 1 - pd.t / 0.7);   // 拉脫後墊子和砝碼一起掉下、淡出
    // 尖端
    g.fillStyle = C['bm-gecko'];
    if (pe.n === 1) { g.beginPath(); g.ellipse(cx, ty + 8, pw / 2, 9, 0, Math.PI, 2 * Math.PI); g.fill(); }
    else for (let i = 0; i < vis; i++) {
      const x = cx - pw / 2 + (i + 0.5) * tipW;
      g.beginPath(); g.arc(x, ty + 4, Math.max(0.8, tipW * 0.42), Math.PI, 2 * Math.PI); g.fill();
      if (tipW > 4) { g.fillRect(x - tipW * 0.16, ty + 4, tipW * 0.32, 8); }
    }
    // 墊子本體
    D.roundRect(g, cx - pw / 2, ty + 10, pw, 16, 5);
    const gr = g.createLinearGradient(0, ty + 10, 0, ty + 26); gr.addColorStop(0, D.shade(C['bm-gecko'], 0.15)); gr.addColorStop(1, C['bm-gecko2']);
    g.fillStyle = gr; g.fill();
    if (pe.n > vis) small(g, T('（只畫出一部分的尖端）', '(only some tips are drawn)'), cx, ty + 36, D.c.muted, 'center');
    // 繩子與砝碼
    const my = ty + 90, mw = 36 + Math.min(40, Math.log10(1 + pe.load * 1000) * 10);
    if (pd.hung || pd.fell) {
      g.strokeStyle = D.c.text; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(cx, ty + 26); g.lineTo(cx, my); g.stroke();
      D.roundRect(g, cx - mw / 2, my, mw, mw * 0.7, 5);
      const gm = g.createLinearGradient(0, my, 0, my + mw * 0.7); gm.addColorStop(0, '#9ca3af'); gm.addColorStop(1, '#4b5563');
      g.fillStyle = gm; g.fill();
      D.haloText(g, fmtG(pe.load), cx, my + mw * 0.35, '#ffffff', 'center', 'middle', '600 12px ' + FONT);
    }
    g.restore();
    const msg = !pd.hung && !pd.fell ? T('按「掛上砝碼」', 'press “Hang the weight”') : pd.fell ? T('拉脫了！', 'It pulls off!') : T('撐住了', 'It holds');
    D.haloText(g, msg, cx, A.y + A.h - 16, pd.fell ? C['bm-bad'] : pd.hung ? C['bm-good'] : D.c.muted, 'center', 'middle', '600 13px ' + FONT);
    // 圖：總拉脫力 vs n（對數–對數）
    panel(g, Ch.x, Ch.y, Ch.w, Ch.h);
    title(g, T('總拉脫力與尖端數（1 mm²）', 'Total pull-off force vs number of tips (1 mm²)'), Ch.x + 12, Ch.y + 16);
    const p = { x0: Ch.x + 56, y0: Ch.y + 34, x1: Ch.x + Ch.w - 14, y1: Ch.y + Ch.h - 30 };
    const F1 = B.jkr(Math.sqrt(PAD_A / Math.PI));
    const ylo = Math.log10(F1 * 0.5), yhi = Math.log10(F1 * 1e4 * 2);
    const X = function (n) { return p.x0 + Math.log10(n) / 8 * (p.x1 - p.x0); };
    const Y = function (f) { return p.y1 - (Math.log10(f) - ylo) / (yhi - ylo) * (p.y1 - p.y0); };
    g.font = '11px ' + FONT; g.fillStyle = D.c.muted;
    g.textAlign = 'center'; g.textBaseline = 'top';
    [0, 2, 4, 6, 8].forEach(function (e) { g.fillText(e === 0 ? '1' : '10^' + e, X(Math.pow(10, e)), p.y1 + 6); });
    g.textAlign = 'right'; g.textBaseline = 'middle';
    for (let e = Math.ceil(ylo); e <= yhi; e++) {
      const y = Y(Math.pow(10, e));
      g.fillText(fmtF(Math.pow(10, e)), p.x0 - 6, y);
      g.strokeStyle = D.alpha(D.c.text, 0.07); g.beginPath(); g.moveTo(p.x0, y); g.lineTo(p.x1, y); g.stroke();
    }
    g.strokeStyle = D.alpha(D.c.text, 0.3); g.beginPath(); g.moveTo(p.x0, p.y0); g.lineTo(p.x0, p.y1); g.lineTo(p.x1, p.y1); g.stroke();
    // 壁虎的範圍：剛毛數、匙突數（14 400 × 100–1000）
    const sx0 = X(14400 * 100), sx1 = X(14400 * 1000);
    g.fillStyle = D.alpha(C['bm-gecko'], 0.18); g.fillRect(sx0, p.y0, sx1 - sx0, p.y1 - p.y0);
    small(g, T('壁虎的匙突數', 'gecko spatulae'), (sx0 + sx1) / 2, p.y0 + 8, C['bm-gecko2'], 'center');
    g.setLineDash([3, 3]); g.strokeStyle = C['bm-gecko2'];
    g.beginPath(); g.moveTo(X(14400), p.y0 + 18); g.lineTo(X(14400), p.y1); g.stroke(); g.setLineDash([]);
    small(g, T('剛毛數', 'setae'), X(14400) - 4, p.y0 + 24, C['bm-gecko2'], 'right');
    // 砝碼重量
    const Wl = pe.load / 1000 * B.G;
    if (Wl > Math.pow(10, ylo) && Wl < Math.pow(10, yhi)) {
      g.setLineDash([6, 4]); g.strokeStyle = C['bm-bad']; g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(p.x0, Y(Wl)); g.lineTo(p.x1, Y(Wl)); g.stroke(); g.setLineDash([]);
      small(g, T('砝碼 ', 'weight ') + fmtG(pe.load), p.x1 - 4, Y(Wl) - 9, C['bm-bad'], 'right');
    }
    // √n 線
    g.strokeStyle = C['bm-gecko2']; g.lineWidth = 2.4;
    g.beginPath(); g.moveTo(X(1), Y(F1)); g.lineTo(X(1e8), Y(F1 * 1e4)); g.stroke();
    small(g, '∝ √n', X(1e3) + 6, Y(F1 * Math.sqrt(1e3)) + 12, C['bm-gecko2'], 'left');
    D.ball ? D.ball(g, X(pe.n), Y(pe.F), 6, C['bm-gecko']) : null;
  }
  window.LabKeys && window.LabKeys.attach(cv3, {
    label: T('黏著墊畫布：左右鍵改尖端數，上下鍵改砝碼。', 'Pad canvas: left and right change the number of tips, up and down the weight.'),
    items: [{
      name: T('黏著墊', 'Pad'),
      move: function (dx, dy, big) {
        if (dx) window.LabNum.set(el.nsplit, Math.max(1, Math.round(nV() * Math.pow(10, dx * (big ? 1 : 0.25)))));
        if (dy) window.LabNum.set(el.load, loadV() * Math.pow(10, dy * (big ? 1 : 0.25)));
      },
      describe: function () { return fmtN(nV()).replace(/<\/?sup>/g, '') + T(' 個尖端，砝碼 ', ' tips, weight ') + fmtG(loadV()) + T('。', '.'); }
    }]
  });
  function hang() {
    const pe = padEval();
    pd.hung = true; pd.fell = !pe.hold; pd.t = 0;
    if (pd.fell) sndChord(false); else sndChord(true);
    setStatus('status3', (pe.hold ? T('撐住了：', 'It holds: ') : T('拉脫了：', 'It pulls off: ')) + fmtN(pe.n).replace(/<\/?sup>/g, '') + T(' 個尖端的總拉脫力 ', ' tips pull off at ') + fmtF(pe.F) +
      T('，砝碼重 ', '; the weight is ') + fmtF(pe.load / 1000 * B.G) + T('。', '.'));
    emit('pad', { n: pe.n, F: pe.F, load: pe.load, hold: pe.hold });
    request();
  }
  function padChanged() { pd.hung = false; pd.fell = false; pd.t = 0; refreshOutputs(); renderRo2(); request(); }

  // =====================================================================
  // 動畫迴圈
  // =====================================================================
  let raf = 0, lastNow = 0;
  function request() { if (!raf) raf = requestAnimationFrame(tick); }
  function tick(now) {
    raf = 0;
    const dt = lastNow ? Math.min(0.1, (now - lastNow) / 1000) : 0.016;
    lastNow = now;
    let more = false;
    if (rainTick(dt)) more = true;
    if (stepDrops(dt)) { more = true; renderRo1Soon(); }
    if (stepGecko(dt)) more = true;
    if (pd.fell && pd.t < 1) { pd.t += dt; more = true; }
    draw1();
    if (view3 && view3.active) { view3.frame(); if (view3.busy && view3.busy()) more = true; }
    draw2();
    drawPad();
    if (more) request(); else lastNow = 0;
  }

  // =====================================================================
  // 3D 檢視：切換時才載入 js/biomimicry-3d.js 與 three.js；切回 2D 時整個釋放。
  // =====================================================================
  let view3 = null, threeLib = null, loadToken = 0;
  const stage = $('stage1'), host3 = $('view3'), viewMsg = $('viewMsg');
  const bridge = {
    B: B, T: T, D: D, num: num, deg: deg, reducedMotion: reducedMotion,
    colors: function () { return C; },
    surface: function () { return surf(); },
    state: function () { return st1.focus || dropState(0, false); },
    dirt: function () { return dirt; },
    request: function () { request(); },
    onContextLost: function () {
      setView('2d');
      viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D 葉面。', 'The 3D graphics context was lost, so the view switched back to the 2D leaf.');
    }
  };
  function webglAvailable() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
    catch (e) { return false; }
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (window.BM3D) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { s.remove(); reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadThree() {
    if (threeLib && window.BM3D) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    const own = new URL('js/biomimicry-3d.js' + (SCRIPT_V ? '?v=' + SCRIPT_V : ''), document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js'), loadScript(own)]).then(function (mods) {
      if (!window.BM3D) throw new Error('biomimicry-3d.js did not load');
      threeLib = { THREE: mods[0], OrbitControls: mods[1].OrbitControls };
      return threeLib;
    });
  }
  function setPressed(mode) {
    $('view2d').setAttribute('aria-pressed', String(mode === '2d'));
    $('view3d').setAttribute('aria-pressed', String(mode === '3d'));
  }
  function setView(mode) {
    if (mode === '3d') {
      if (view3 && view3.active) return;
      const token = ++loadToken;
      setPressed('3d');
      if (!webglAvailable()) { fail3D(); return; }
      viewMsg.textContent = T('正在載入 3D 檢視…', 'Loading the 3D view…');
      loadThree().then(function (lib) {
        if (token !== loadToken) return;
        stage.classList.add('is3d');
        view3 = window.BM3D.create(lib, host3, bridge);
        viewMsg.textContent = '';
        $('resetCam').hidden = false;
        requestAnimationFrame(function () { if (view3) { view3.onShow(); request(); } });
        request();
      }).catch(function (err) {
        if (token !== loadToken) return;
        if (window.console) console.warn('3D view unavailable:', err);
        fail3D();
      });
    } else {
      loadToken++;
      setPressed('2d');
      if (view3) { view3.dispose(); view3 = null; }
      stage.classList.remove('is3d');
      if (/3D/.test(viewMsg.textContent) && !/2D/.test(viewMsg.textContent)) viewMsg.textContent = '';
      $('resetCam').hidden = true;
      resize1();
    }
  }
  function fail3D() {
    if (view3) { try { view3.dispose(); } catch (e) { /* 忽略 */ } view3 = null; }
    stage.classList.remove('is3d');
    setPressed('2d');
    $('resetCam').hidden = true;
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 葉面。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D leaf is kept.');
    resize1();
  }
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });

  // =====================================================================
  // 事件綁定
  // =====================================================================
  $('dropBtn').addEventListener('click', function () {
    place(st1.cursor.x, st1.cursor.y, 0, false);
    setStatus('status', statusForDrop(st1.focus));
  });
  $('rainBtn').addEventListener('click', function () {
    st1.rain = !st1.rain;
    $('rainBtn').setAttribute('aria-pressed', String(st1.rain));
    $('rainBtn').textContent = st1.rain ? T('停止下雨', 'Stop the rain') : T('下雨', 'Rain');
    if (st1.rain) {
      const s = dropState(val(el.rainv), false);
      setStatus('status', T('下雨了：雨滴 ', 'Raining: drops at ') + num(val(el.rainv), 1) + T(' m/s，落在葉面上是 ', ' m/s land as ') + modeName(s.mode) +
        (s.impaled ? T('（被打穿了）', ' (they break through)') : '') + T('。', '.'));
    } else setStatus('status', T('雨停了。', 'The rain stopped.'));
    renderRo1();
    request();
  });
  $('dirtBtn').addEventListener('click', function () {
    dirt.seed++; scatter(); st1.focus = null; renderRo1();
    setStatus('status', T('重新撒上灰塵，水珠擦乾淨了。', 'Fresh dust sprinkled; the drops are wiped away.'));
    request();
  });
  $('clear1').addEventListener('click', function () {
    dirt.seed++; scatter(); st1.focus = null; rows1 = []; renderRows1(); renderRo1();
    if (st1.rain) $('rainBtn').click();
    setStatus('status', T('已清除水珠與紀錄表、重新撒上灰塵；設定沒有改變。', 'Drops and table cleared and fresh dust sprinkled; the settings are unchanged.'));
    request();
  });
  [el.thY, el.hyst, el.pa, el.pb, el.ph, el.vol].forEach(function (r) { r.addEventListener('input', surfaceChanged); });
  el.tilt.addEventListener('input', function () {
    refreshOutputs();
    st1.maxTilt = Math.max(st1.maxTilt, val(el.tilt));
    renderRo1Soon();
    request();
  });
  el.rainv.addEventListener('input', function () { refreshOutputs(); renderRo1Soon(); request(); });
  $('soundBtn').addEventListener('click', function () {
    if (window.LabSettings) window.LabSettings.set('sound', !window.LabSettings.get('sound'));
    updateSoundButton();
  });
  window.addEventListener('lab:settingschange', function (ev) { if (ev.detail && ev.detail.name === 'sound') updateSoundButton(); });

  [el.wall, el.mass, el.frac].forEach(function (r) {
    r.addEventListener('input', function () { refreshOutputs(); geckoSettle(false); });
    r.addEventListener('change', function () { addRow2(); });
  });
  $('liftBtn').addEventListener('click', function () {
    if (gk.fallen || gk.falling) geckoSettle(false);
    gk.lifted = !gk.lifted;
    gk.toeTarget = gk.lifted ? 90 : 0;
    if (reducedMotion) gk.toe = gk.toeTarget - (gk.lifted ? 0.001 : -0.001);
    $('liftBtn').textContent = gk.lifted ? T('把腳放回去', 'Put the foot down') : T('抬起一隻腳', 'Lift a foot');
    if (gk.lifted) setStatus('status2', T('壁虎從趾尖往上翻起一隻前腳的腳趾：角度變大，撕開需要的力急速變小。', 'The gecko curls one front toe up from the tip: as the angle grows, the force needed to peel drops fast.'));
    else setStatus('status2', T('腳放回牆上，四隻腳一起撐。', 'The foot is back on the wall; all four feet hold.'));
    request();
  });
  $('replace2').addEventListener('click', function () {
    gk.lifted = false; gk.toe = 0; gk.toeTarget = 0;
    $('liftBtn').textContent = T('抬起一隻腳', 'Lift a foot');
    geckoSettle(true);
    if (!gk.falling) setStatus('status2', T('壁虎放回牆上了。', 'The gecko is back on the wall.'));
  });
  $('clear2').addEventListener('click', function () {
    rows2 = []; renderRows2();
    gk.lifted = false; gk.toe = 0; gk.toeTarget = 0;
    $('liftBtn').textContent = T('抬起一隻腳', 'Lift a foot');
    geckoSettle(false);
    setStatus('status2', T('已清除紀錄表、放回壁虎；設定沒有改變。', 'Table cleared and the gecko put back; the settings are unchanged.'));
  });
  [el.nsplit, el.load].forEach(function (r) { r.addEventListener('input', padChanged); });
  $('hangBtn').addEventListener('click', hang);

  // ---------- 分享目前設定（滑桿由共用程式記錄；這裡記灰塵的亂數種子） ----------
  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () { return { d: dirt.seed }; },
    set: function (o) {
      if (o && o.d) { dirt.seed = Math.max(1, Math.round(+o.d) || 1); scatter(); }
      refreshOutputs(); renderChips(); renderRo1(); geckoSettle(false); padChanged();
    }
  });

  // ---------- 圖例 ----------
  function legends() {
    $('legend1').innerHTML =
      '<span><i class="dot" style="background:' + C['bm-water'] + '"></i>' + T('水珠', 'Water drop') + '</span>' +
      '<span><i class="dot" style="background:' + C['bm-dirt'] + '"></i>' + T('灰塵', 'Dust') + '</span>' +
      '<span><i class="dot" style="background:transparent;border:1.5px dashed ' + C['bm-bad'] + '"></i>' + T('被雨打穿（Wenzel）', 'Broken through (Wenzel)') + '</span>';
    $('legend2').innerHTML =
      '<span><i style="background:' + D.c.text + '"></i>' + T('重力', 'Weight') + '</span>' +
      '<span><i style="background:' + C['bm-good'] + '"></i>' + T('沿牆面的分量（剪力）', 'Along the wall (shear)') + '</span>' +
      '<span><i style="background:' + C['bm-bad'] + '"></i>' + T('拉離牆面的分量', 'Pulling off the wall') + '</span>';
  }

  // =====================================================================
  // 啟動
  // =====================================================================
  readColors();
  refreshOutputs();
  updateSoundButton();
  renderChips();
  scatter();
  legends();
  function themeChanged() {
    readColors();
    leafTex = null;
    if (view3 && view3.active) view3.onTheme();
    legends();
    request();
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  renderRo1();
  geckoEval(); renderRo2(); emit('gecko', geckoData());
  setStatus('status', T('點一下葉面放一顆水珠（或按「滴一滴」），再把葉面稍微傾斜。', 'Tap the leaf to place a drop (or press “Add a drop”), then tilt the leaf a little.'));
  setStatus('status2', T('把牆慢慢轉到天花板（180°），再調小貼住的剛毛比例，看壁虎什麼時候撐不住。', 'Turn the wall slowly to a ceiling (180°), then lower the share of setae in contact and see when the gecko lets go.'));
  setStatus('status3', T('一平方毫米的黏著墊：尖端分得越細，能吊起的砝碼越重。', 'A one-square-millimetre pad: the finer it is split, the heavier the weight it can hold.'));
  if (window.ResizeObserver) {
    const watch = function (c, fn) { let lw = 0; new ResizeObserver(function () { if (c.clientWidth && c.clientWidth !== lw) { lw = c.clientWidth; fn(); } }).observe(c); };
    watch(cv, resize1); watch(cv2, resize2); watch(cv3, resize3);
  } else window.addEventListener('resize', function () { resize1(); resize2(); resize3(); });
  resize1(); resize2(); resize3();
  request();
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { lastNow = 0; request(); } });
  // 測試與縮圖用
  window.__bm = {
    B: B, st1: st1, dirt: dirt, gk: gk, pd: pd,
    place: place, dropState: dropState, cleanFrac: cleanFrac, scatter: scatter,
    rain: function (on) { if (!!on !== st1.rain) $('rainBtn').click(); },
    /** 快轉：直接跑 sec 秒（畫面時間），不等動畫 */
    run: function (sec) { const n = Math.round(sec / 0.02); for (let i = 0; i < n; i++) { rainTick(0.02); stepDrops(0.02); } renderRo1(); request(); },
    lift: function () { $('liftBtn').click(); },
    settleToe: function () { for (let i = 0; i < 100; i++) stepGecko(0.02); request(); },
    hang: hang, setView: setView
  };
})();
