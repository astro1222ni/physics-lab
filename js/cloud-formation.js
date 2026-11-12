/* cloud-formation.js — 「絕熱冷卻與雲的形成」的畫面與互動
 * 物理計算全部在 cloud-formation-core.js；3D 在 cloud-formation-3d.js，切換到 3D 時才載入。 */
(function () {
  'use strict';
  const K = window.CloudCore;
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
  const TK = K.TK;
  const BASE_KM = 100;                                   // 山的底寬（km）
  const DOMAIN_KM = BASE_KM / (K.FOOT_L - K.FOOT_W);      // 剖面的總寬（km）
  const ZVIEW = 5000;                                     // 剖面圖的高度範圍（m）
  const CROSS_S = 16;                                     // 氣塊從左走到右的秒數

  // =====================================================================
  // 狀態
  // =====================================================================
  const elT0 = $('t0'), elRH = $('rh'), elH = $('hm'), elEff = $('eff'), elGam = $('gam');
  const state = {
    T0: 28, RH: 0.7, H: 1500, eff: 1, gamma: 5.5,
    u: 0.02, running: !reducedMotion, hold: 0,
    acted: false, dirty: true, ver: 0, res: null,
    tzTop: 5, recs: [],
    flash: null, lastRain: 0
  };
  function readSliders() {
    state.T0 = val(elT0); state.RH = val(elRH) / 100; state.H = val(elH);
    state.eff = val(elEff) / 100; state.gamma = val(elGam);
  }
  function recompute() {
    state.res = K.simulate({ T0: state.T0, RH: state.RH, H: state.H, eff: state.eff, gamma: state.gamma });
    state.ver++;
    state.dirty = false;
    layerKey = ''; tzKey = '';
    updateResults();
  }
  function R() { if (state.dirty || !state.res) recompute(); return state.res; }
  function parcelNow() { return K.stateAtU(R(), state.u); }

  // =====================================================================
  // 顏色與文字
  // =====================================================================
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--canvas-bg', '--text', '--muted', '--border', '--accent', '--accent-soft', '--surface', '--probe',
      '--cf-sky1', '--cf-sky2', '--cf-sea', '--cf-land', '--cf-forest', '--cf-rock', '--cf-snow', '--cf-cloud', '--cf-cloud-shade', '--cf-rain',
      '--cf-dry', '--cf-moist', '--cf-lee', '--cf-dew', '--cf-env', '--cf-cape', '--cf-cin', '--cf-warm', '--cf-cold', '--b-atmo']
      .forEach(function (k) { C[k.slice(2)] = cs.getPropertyValue(k).trim(); });
    C.dark = D.dark;
  }
  function num(v, d) {
    if (v == null || !isFinite(v)) return '—';
    let s = v.toFixed(d);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  function signed(v, d) { const s = num(v, d); return v > 0 && s !== num(0, d) ? '+' + s : s; }
  function degC(Tk, d) { return num(Tk - TK, d == null ? 1 : d) + ' °C'; }
  function meters(z) { return z == null ? '—' : Math.round(z).toLocaleString('en-US').replace(/,/g, ' ') + ' m'; }
  function km(z, d) { return num(z / 1000, d == null ? 1 : d) + ' km'; }
  function pct(x, d) { return num(x * 100, d == null ? 0 : d) + '%'; }
  function gkg(x, d) { return num(x * 1000, d == null ? 2 : d) + ' g/kg'; }
  /** 溫度 → 顏色（−20 °C 冷色 → 40 °C 暖色） */
  function tempColor(Tk) {
    const u = Math.max(0, Math.min(1, (Tk - TK + 20) / 60));
    return D.mix(C['cf-cold'], C['cf-warm'], u);
  }
  function whereName(s, Hm) {
    const H = Hm == null ? state.res.params.H : Hm;
    if (H <= 0 || s.u < K.FOOT_W - 1e-6) return T('迎風平地', 'Windward plain');
    if (s.u > K.FOOT_L + 1e-6) return T('背風平地', 'Lee plain');
    if (Math.abs(s.u - 0.5) < 0.004) return T('山頂', 'Crest');
    return s.u < 0.5 ? T('迎風坡', 'Windward slope') : T('背風坡', 'Lee slope');
  }

  // =====================================================================
  // 畫布
  // =====================================================================
  const cv = $('cv'), ctx = cv.getContext('2d');
  const tz = $('tz'), tctx = tz.getContext('2d');
  let cvSize = null, tzSize = null;
  function fit(c, g) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = c.clientWidth || 300, h = c.clientHeight || 300;
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: w, h: h, dpr: dpr };
  }
  function resizeCv() { cvSize = fit(cv, ctx); layerKey = ''; requestDraw(); }
  function resizeTz() { tzSize = fit(tz, tctx); tzKey = ''; requestDraw(); }

  // ---------- 剖面圖的版面 ----------
  function lay() {
    const W = cvSize.w, H = cvSize.h;
    const pad = { l: W < 480 ? 38 : 46, r: W < 480 ? 44 : 54, t: 26, b: 26 };
    const pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
    return { W: W, H: H, pad: pad, pw: pw, ph: ph,
      X: function (u) { return pad.l + u * pw; },
      Y: function (z) { return pad.t + ph * (1 - z / ZVIEW); },
      uOf: function (x) { return Math.max(0, Math.min(1, (x - pad.l) / pw)); },
      exag: (ph / (ZVIEW / 1000)) / (pw / DOMAIN_KM) };
  }

  // 固定的亂數（雲、雨的位置每次一樣）
  function rng(seed) { let s = seed % 2147483647; if (s <= 0) s += 2147483646; return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

  // ---------- 靜態圖層：天空、格線、山、雲 ----------
  let layer = null, layerKey = '';
  function cloudSpan(res) {
    const H = res.params.H;
    if (!res.cloud) return null;
    const uL = res.lcl.z <= 1 ? 0 : K.uAtZ(res.lcl.z, H, -1);
    let uE;
    if (res.zEvap >= H - 1e-6) uE = 0.5 + 0.02;                // 背風坡沒有雲：雲帽只略過山頂
    else if (res.zEvap <= 1) uE = 1;
    else uE = K.uAtZ(res.zEvap, H, 1);
    // uS：雲層從雲底的位置再往上風處延伸一些（底部是平的雲底），雨從雲底落到下方的山坡
    return { uL: uL, uE: uE, uS: Math.max(0, uL - 0.07) };
  }
  function cloudDepth(u, res) {
    // 雲層的厚度（m）：迎風坡上方約 600–900 m，山頂上方略厚
    const H = res.params.H;
    return 550 + 350 * Math.min(1, K.terrain(u, H) / Math.max(H, 1));
  }
  function buildLayer(l) {
    const res = R();
    const W = l.W, H = l.H, dpr = cvSize.dpr;
    const c = document.createElement('canvas');
    c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const Hm = res.params.H;
    const y0 = l.Y(0);
    // 天空
    const sky = g.createLinearGradient(0, 0, 0, y0);
    sky.addColorStop(0, C['cf-sky1']);
    sky.addColorStop(1, C['cf-sky2']);
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
    // 格線（每 1 km）
    g.save();
    g.strokeStyle = D.alpha(C.text, C.dark ? 0.08 : 0.07);
    g.lineWidth = 1;
    for (let z = 1000; z <= ZVIEW; z += 1000) {
      const y = Math.round(l.Y(z)) + 0.5;
      g.beginPath(); g.moveTo(l.pad.l, y); g.lineTo(W - l.pad.r, y); g.stroke();
    }
    g.restore();
    // 地面下方（平地與海）
    const groundG = g.createLinearGradient(0, y0, 0, H);
    groundG.addColorStop(0, D.shade(C['cf-land'], -0.1));
    groundG.addColorStop(1, D.shade(C['cf-land'], -0.45));
    g.fillStyle = groundG;
    g.fillRect(0, y0, W, H - y0);
    // 海（迎風的最左邊）
    const seaR = l.X(0.1);
    const seaG = g.createLinearGradient(0, y0 - 3, 0, H);
    seaG.addColorStop(0, D.shade(C['cf-sea'], 0.15));
    seaG.addColorStop(1, D.shade(C['cf-sea'], -0.35));
    g.fillStyle = seaG;
    g.beginPath(); g.moveTo(0, y0 - 2); g.lineTo(seaR - 10, y0 - 2); g.quadraticCurveTo(seaR, y0, seaR + 6, H); g.lineTo(0, H); g.closePath(); g.fill();
    // 山
    const N = 240;
    const pts = [];
    for (let i = 0; i <= N; i++) { const u = i / N; pts.push([l.X(u), l.Y(K.terrain(u, Hm))]); }
    const mountainPath = function (gg) {
      gg.beginPath();
      gg.moveTo(l.X(K.FOOT_W) - 1, y0 + 1);
      for (let i = 0; i <= N; i++) { const u = i / N; if (u >= K.FOOT_W && u <= K.FOOT_L) gg.lineTo(pts[i][0], pts[i][1]); }
      gg.lineTo(l.X(K.FOOT_L) + 1, y0 + 1);
      gg.closePath();
    };
    if (Hm > 0) {
      const mg = g.createLinearGradient(0, y0, 0, l.Y(4000));
      mg.addColorStop(0, C['cf-land']);
      mg.addColorStop(0.35, C['cf-forest']);
      mg.addColorStop(0.72, D.mix(C['cf-forest'], C['cf-rock'], 0.8));
      mg.addColorStop(1, C['cf-rock']);
      g.save();
      mountainPath(g);
      g.fillStyle = mg;
      g.fill();
      g.clip();
      // 雪線：周圍大氣 0 °C 的高度以上
      const zs = (res.params.T0) / res.params.gamma * 1000;
      if (zs >= 0 && zs < Hm) {
        const ys = l.Y(zs);
        const sg = g.createLinearGradient(0, ys, 0, ys - 14);
        sg.addColorStop(0, D.alpha(C['cf-snow'], 0));
        sg.addColorStop(1, D.alpha(C['cf-snow'], 0.95));
        g.fillStyle = sg;
        g.fillRect(0, 0, W, ys);
      }
      // 光影：陽光從左上照來，背風坡較暗；山頂的稜線高光
      const sh = g.createLinearGradient(l.X(0.5) - 30, 0, l.X(K.FOOT_L), 0);
      sh.addColorStop(0, 'rgba(0,0,0,0)');
      sh.addColorStop(0.25, D.shadowInk(C.dark ? 0.22 : 0.16));
      sh.addColorStop(1, D.shadowInk(C.dark ? 0.12 : 0.08));
      g.fillStyle = sh;
      g.fillRect(l.X(0.5) - 30, 0, W, H);
      // 由山腳往上的霧氣感（大氣透視）
      const haze = g.createLinearGradient(0, y0, 0, l.Y(Hm));
      haze.addColorStop(0, D.alpha(C['cf-sky2'], 0.18));
      haze.addColorStop(1, D.alpha(C['cf-sky2'], 0));
      g.fillStyle = haze;
      g.fillRect(0, 0, W, H);
      g.restore();
      // 稜線
      g.save();
      g.beginPath();
      for (let i = 0; i <= N; i++) { const u = i / N; if (u >= K.FOOT_W && u <= K.FOOT_L) { if (u === K.FOOT_W || i === Math.ceil(K.FOOT_W * N)) g.moveTo(pts[i][0], pts[i][1]); else g.lineTo(pts[i][0], pts[i][1]); } }
      g.strokeStyle = D.alpha(D.shade(C['cf-forest'], C.dark ? 0.5 : 0.65), 0.75);
      g.lineWidth = 1.2;
      g.stroke();
      g.restore();
    }
    // 座標軸：左邊高度（km）、右邊氣壓（hPa）
    g.font = '11px ' + FONT;
    g.textBaseline = 'middle';
    for (let z = 0; z <= ZVIEW; z += 1000) {
      const y = l.Y(z);
      g.textAlign = 'right';
      D.haloText(g, num(z / 1000, 0), l.pad.l - 6, y, C.muted, 'right', 'middle', '11px ' + FONT);
      const p = K.envP(res.env, z) / 100;
      D.haloText(g, num(p, 0), W - l.pad.r + 6, y, C.muted, 'left', 'middle', '11px ' + FONT);
    }
    D.haloText(g, 'km', l.pad.l - 6, 4, C.muted, 'right', 'top', '600 11px ' + FONT);
    D.haloText(g, 'hPa', W - l.pad.r + 6, 4, C.muted, 'left', 'top', '600 11px ' + FONT);
    // 雲另外畫一層，雨畫在兩層之間（雨絲在雲裡若隱若現）
    const cc = document.createElement('canvas');
    cc.width = c.width; cc.height = c.height;
    const gc = cc.getContext('2d');
    gc.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawClouds(gc, l, res);
    return { ground: c, cloud: cc };
  }

  function drawClouds(g, l, res) {
    const span = cloudSpan(res);
    const Hm = res.params.H;
    if (span) {
      const rand = rng(97 + Math.round(span.uL * 1000) + Math.round(span.uE * 7000));
      const puffs = [];
      const pxPerM = l.ph / ZVIEW;
      for (let u = span.uS; u <= span.uE + 1e-9; u += 0.0045) {
        const zt = Math.max(K.terrain(u, Hm), u < 0.5 ? res.lcl.z : 0);
        const dep = cloudDepth(u, res);
        for (let k = 0; k < 3; k++) {
          const zc = zt + (0.2 + 0.7 * rand()) * dep;
          const r = (0.28 + 0.3 * rand()) * dep * pxPerM;
          puffs.push([l.X(u + (rand() - 0.5) * 0.006), l.Y(zc), Math.max(5, r)]);
        }
      }
      g.save();
      // 只畫在地面之上，迎風坡在雲底之上、背風坡在背風雲底之上
      g.beginPath();
      g.moveTo(0, 0); g.lineTo(l.W, 0); g.lineTo(l.W, l.Y(0));
      for (let i = 240; i >= 0; i--) { const u = i / 240; g.lineTo(l.X(u), l.Y(K.terrain(u, Hm)) - 1); }
      g.closePath();
      g.clip();
      g.beginPath();
      const yb = l.Y(res.lcl.z), ye = l.Y(Math.min(res.zEvap, Hm));
      g.rect(0, 0, l.X(0.5), yb);
      g.rect(l.X(0.5), 0, l.W - l.X(0.5), res.zEvap >= Hm - 1e-6 ? l.H : ye);
      g.clip();
      // 陰影層
      g.fillStyle = D.alpha(C['cf-cloud-shade'], C.dark ? 0.75 : 0.85);
      puffs.forEach(function (p) { g.beginPath(); g.arc(p[0] + p[2] * 0.12, p[1] + p[2] * 0.22, p[2], 0, Math.PI * 2); g.fill(); });
      // 亮面
      puffs.forEach(function (p) {
        const gr = g.createRadialGradient(p[0] - p[2] * 0.35, p[1] - p[2] * 0.45, p[2] * 0.1, p[0], p[1], p[2]);
        gr.addColorStop(0, C['cf-cloud']);
        gr.addColorStop(0.7, D.alpha(C['cf-cloud'], 0.96));
        gr.addColorStop(1, D.alpha(D.mix(C['cf-cloud'], C['cf-cloud-shade'], 0.5), 0.9));
        g.fillStyle = gr;
        g.beginPath(); g.arc(p[0], p[1], p[2] * 0.92, 0, Math.PI * 2); g.fill();
      });
      g.restore();
    }
    // 積雨雲：山頂抬過自由對流高度時，從自由對流高度往上長到雲頂（超出畫面就畫到頂端）
    if (res.triggered) {
      const rand = rng(4242);
      const zb = Math.max(res.lcl ? res.lcl.z : 0, Math.min(res.lfc, Hm));
      const ztop = Math.min(res.el, ZVIEW + 800);
      const xc = l.X(0.52);
      g.save();
      g.beginPath(); g.rect(0, 0, l.W, l.Y(0)); g.clip();
      const n = 70;
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < n; i++) {
          const f = i / (n - 1);
          const z = zb + (ztop - zb) * f;
          const wpx = (0.05 + 0.05 * f) * l.pw;
          const x = xc + (rand() - 0.5) * wpx + f * 0.04 * l.pw;
          const r = (0.35 + 0.35 * rand()) * wpx * 0.6;
          if (pass === 0) { g.fillStyle = D.alpha(C['cf-cloud-shade'], 0.9); g.beginPath(); g.arc(x + r * 0.15, l.Y(z) + r * 0.2, r, 0, Math.PI * 2); g.fill(); }
          else {
            const gr = g.createRadialGradient(x - r * 0.35, l.Y(z) - r * 0.4, r * 0.1, x, l.Y(z), r);
            gr.addColorStop(0, C['cf-cloud']);
            gr.addColorStop(1, D.alpha(D.mix(C['cf-cloud'], C['cf-cloud-shade'], 0.45), 0.92));
            g.fillStyle = gr;
            g.beginPath(); g.arc(x, l.Y(z), r * 0.92, 0, Math.PI * 2); g.fill();
          }
        }
      }
      g.restore();
    }
  }

  // ---------- 剖面圖：每一幀 ----------
  function drawCross(now) {
    if (!cvSize) return;
    const l = lay(), res = R();
    const key = [state.ver, l.W, l.H, cvSize.dpr, D.ver, C.dark].join('|');
    if (key !== layerKey) { layer = buildLayer(l); layerKey = key; }
    const g = ctx;
    g.clearRect(0, 0, l.W, l.H);
    g.drawImage(layer.ground, 0, 0, l.W, l.H);
    const Hm = res.params.H;
    const pxm = l.ph / ZVIEW;
    // 雨：從雲裡落到山坡上（降水效率越高越密）
    const span = cloudSpan(res);
    if (span && res.params.eff > 0 && Hm > 0) {
      const rand = rng(31);
      const n = Math.round(26 + 70 * res.params.eff);
      const t = reducedMotion ? 0.37 : (now || 0) / 1000;
      g.save();
      g.strokeStyle = D.alpha(C['cf-rain'], C.dark ? 0.75 : 0.6);
      g.lineWidth = 1.1;
      g.lineCap = 'round';
      g.beginPath();
      const uMax = Math.min(0.5, span.uE);
      for (let i = 0; i < n; i++) {
        const u = span.uS + (uMax - span.uS) * rand();
        const zt = K.terrain(u, Hm);
        const top = l.Y(Math.max(zt, res.lcl.z) + cloudDepth(u, res) * 0.3), bot = l.Y(zt);
        const len = bot - top;
        if (len < 6) continue;
        const ph = (t * 0.9 + rand()) % 1;
        const y = top + ph * len;
        const x = l.X(u) + ph * 3;
        g.moveTo(x, y); g.lineTo(x + 1.5, Math.min(bot, y + 7));
      }
      g.stroke();
      g.restore();
    }
    g.save();
    g.globalAlpha = 0.93;
    g.drawImage(layer.cloud, 0, 0, l.W, l.H);
    g.restore();
    // 雲底線
    // 標籤不互相重疊，也不壓到最上面一列（風向、比例尺）：依序試原位、往上、往下
    const pills = [{ x: 0, y: 0, w: l.W, h: l.pad.t + 26 }];
    const place = function (text, x, yb, color, align) {
      g.font = '600 12px ' + FONT;
      const w = g.measureText(text).width + 12, h = 18;
      const bx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
      let y = yb;
      for (let k = 0; k < 13; k++) {
        const off = k === 0 ? 0 : (k % 2 ? -1 : 1) * 20 * Math.ceil(k / 2);
        const box = { x: bx, y: yb + off - h, w: w, h: h };
        if (box.y + h > l.H) continue;
        if (!pills.some(function (q) { return q.x < box.x + box.w && box.x < q.x + q.w && q.y < box.y + box.h && box.y < q.y + q.h; })) { y = yb + off; break; }
      }
      pills.push(D.pill(g, text, x, y, color, align));
    };
    if (res.cloud) {
      const y = Math.round(l.Y(res.lcl.z)) + 0.5;
      g.save();
      g.setLineDash([6, 5]);
      g.strokeStyle = D.alpha(C['cf-rain'], 0.9);
      g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(l.pad.l, y); g.lineTo(l.X(Math.max(0.12, span.uS)), y); g.stroke();
      if (res.zEvap < Hm - 1 && res.zEvap > 1) {
        const ye = Math.round(l.Y(res.zEvap)) + 0.5;
        g.beginPath(); g.moveTo(l.X(span.uE) - 4, ye); g.lineTo(l.X(Math.min(0.97, span.uE + 0.12)), ye); g.stroke();
      }
      g.restore();
      place(T('雲底 ', 'Cloud base ') + meters(res.lcl.z), l.pad.l + 4, y - 3, C['cf-rain'], 'left');
      if (res.zEvap < Hm - 1 && res.zEvap > 1) place(T('背風雲底 ', 'Lee cloud base ') + meters(res.zEvap), l.X(Math.min(0.97, span.uE + 0.12)), Math.round(l.Y(res.zEvap)) - 3, C['cf-rain'], 'right');
    }
    // 積雨雲的雲頂
    if (res.triggered) {
      const x = l.X(0.56);
      const yTop = res.el > ZVIEW ? l.pad.t + 44 : l.Y(res.el) - 4;
      place((res.el > ZVIEW ? '↑ ' : '') + T('積雨雲，雲頂 ', 'Cumulonimbus, top ') + km(res.el, 1), x, yTop, C['cf-lee'], 'center');
    }
    // 氣塊走的路徑（貼著地面）
    g.save();
    g.setLineDash([2, 5]);
    g.lineCap = 'round';
    g.strokeStyle = D.alpha(C.text, 0.35);
    g.lineWidth = 1.5;
    g.beginPath();
    for (let i = 0; i <= 200; i++) { const u = i / 200; const x = l.X(u), y = l.Y(K.terrain(u, Hm)) - 9; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    g.stroke();
    g.restore();
    // 風向
    const aw = l.W < 560 ? 30 : 46;
    D.arrow(g, l.pad.l + 8, l.pad.t + 16, l.pad.l + 8 + aw, l.pad.t + 16, C.text, 2.2);
    D.haloText(g, T('風', 'Wind'), l.pad.l + 14 + aw, l.pad.t + 16, C.text, 'left', 'middle', '600 12px ' + FONT);
    // 山腳與山頂的讀數
    const s0 = res.start, sl = res.lee;
    // 山腳的讀數放在地面下方的色帶裡，不會擋到氣塊
    const yFoot = l.H - 4;
    const narrow = l.W < 560;
    const txW = T('迎風 ', 'Windward ') + degC(s0.T) + ' · ' + pct(s0.RH), txL = T('背風 ', 'Lee ') + degC(sl.T) + ' · ' + pct(sl.RH);
    const cL = res.foehn > 0.05 ? C['cf-lee'] : C['cf-dry'];
    if (narrow) { D.pill(g, txW, 4, yFoot, C['cf-dry'], 'left'); D.pill(g, txL, l.W - 4, yFoot, cL, 'right'); }
    else {
      D.pill(g, txW, Math.max(l.X(K.FOOT_W) - 6, l.pad.l + 150), yFoot, C['cf-dry'], 'right');
      D.pill(g, txL, Math.min(l.X(K.FOOT_L) + 6, l.W - l.pad.r - 150), yFoot, cL, 'left');
    }
    if (Hm > 0) place(T('山頂 ', 'Crest ') + meters(Hm) + ' · ' + degC(res.top.T), l.X(0.5), l.Y(Hm) - (res.cloud ? 4 + cloudDepth(0.5, res) * pxm : 12), C.text, 'center');
    // 氣塊
    const p = parcelNow();
    const px = l.X(state.u), py = l.Y(K.terrain(state.u, Hm)) - 9 - 0;
    const rad = 9 * Math.cbrt((p.T / p.p) / (s0.T / s0.p)) * (l.W < 480 ? 0.9 : 1.15);
    const col = tempColor(p.T);
    const sat = p.RH >= 0.9995;
    D.ball(g, px, py - rad + 4, rad, col, { glow: 0.25 });
    if (sat || p.l > 1e-7) {
      g.save();
      g.fillStyle = D.alpha(C['cf-cloud'], 0.55);
      g.beginPath(); g.arc(px, py - rad + 4, rad * 0.95, 0, Math.PI * 2); g.fill();
      g.fillStyle = D.alpha(C['cf-rain'], 0.85);
      for (let i = 0; i < 5; i++) { const a = i * 1.26 + 0.4; g.beginPath(); g.arc(px + Math.cos(a) * rad * 0.5, py - rad + 4 + Math.sin(a) * rad * 0.5, 1.4, 0, Math.PI * 2); g.fill(); }
      g.restore();
    }
    if (kb && kb.focused()) {
      g.save(); g.setLineDash([4, 3]); g.strokeStyle = C.accent; g.lineWidth = 1.5;
      D.roundRect(g, px - rad - 5, py - 2 * rad + 4 - 5, 2 * rad + 10, 2 * rad + 10, 6); g.stroke(); g.restore();
    }
    if (state.flash) {
      const u = (performance.now() - state.flash.start) / 900;
      if (u < 1 && !reducedMotion) D.ripple(g, px, py - rad + 4, rad, u, C['cf-moist']);
      else if (u >= 1) state.flash = null;
    }
    const lab = degC(p.T) + ' · ' + pct(p.RH);
    const lx = Math.max(l.pad.l + 40, Math.min(l.W - l.pad.r - 40, px));
    D.pill(g, lab, lx, py - 2 * rad - 2, col, 'center');
    // 比例尺與高度誇大倍數（右上角）
    const ty = l.pad.t + 16;
    const exTxt = l.W < 560 ? T('高度 ×', 'Heights ×') + Math.round(l.exag) : T('高度誇大約 ', 'Heights ×') + Math.round(l.exag) + T(' 倍', '');
    g.font = '11px ' + FONT;
    const exW = g.measureText(exTxt).width;
    D.haloText(g, exTxt, l.W - l.pad.r - 4, ty, C.muted, 'right', 'middle', '11px ' + FONT);
    const sx = l.W - l.pad.r - 4 - exW - 12;
    const kmPx = l.pw / DOMAIN_KM * 20;
    if (l.W >= 560) {
    g.save();
    g.strokeStyle = C.muted; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(sx - kmPx, ty); g.lineTo(sx, ty); g.moveTo(sx - kmPx, ty - 3); g.lineTo(sx - kmPx, ty + 3); g.moveTo(sx, ty - 3); g.lineTo(sx, ty + 3); g.stroke();
    g.restore();
    D.haloText(g, '20 km', sx - kmPx - 5, ty, C.muted, 'right', 'middle', '11px ' + FONT);
    }
  }

  // =====================================================================
  // 溫度－高度圖
  // =====================================================================
  let tzKey = '', tzBg = null, tzLay = null;
  function tzLayout() {
    const res = R(), W = tzSize.w, H = tzSize.h;
    const top = state.tzTop * 1000;
    const pad = { l: W < 480 ? 36 : 44, r: 12, t: 24, b: 34 };
    // 溫度範圍
    let lo = Infinity, hi = -Infinity;
    const take = function (Tk) { if (isFinite(Tk)) { lo = Math.min(lo, Tk - TK); hi = Math.max(hi, Tk - TK); } };
    res.up.forEach(function (s, i) { if (i % 10 === 0) { take(s.T); take(s.Td); } });
    res.down.forEach(function (s, i) { if (i % 10 === 0) { take(s.T); take(s.Td); } });
    take(K.envT(res.env, 0)); take(K.envT(res.env, top));
    res.free.forEach(function (s, i) { if (i % 10 === 0 && s.z <= Math.min(top, (res.el || 0) + 500)) take(s.T); });
    lo = Math.floor((lo - 3) / 5) * 5; hi = Math.ceil((hi + 3) / 5) * 5;
    if (hi - lo < 20) { const m = (hi + lo) / 2; lo = Math.floor((m - 10) / 5) * 5; hi = lo + 20; }
    const pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
    return { W: W, H: H, pad: pad, pw: pw, ph: ph, lo: lo, hi: hi, top: top,
      X: function (Tk) { return pad.l + (Tk - TK - lo) / (hi - lo) * pw; },
      Y: function (z) { return pad.t + ph * (1 - z / top); },
      zOf: function (y) { return Math.max(0, Math.min(top, (1 - (y - pad.t) / ph) * top)); } };
  }
  function buildTzBg(L) {
    const res = R(), dpr = tzSize.dpr;
    const c = document.createElement('canvas');
    c.width = Math.round(L.W * dpr); c.height = Math.round(L.H * dpr);
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    D.backdrop(g, L.W, L.H);
    const x0 = L.pad.l, x1 = L.W - L.pad.r, y0 = L.pad.t, y1 = L.H - L.pad.b;
    g.save();
    g.beginPath(); g.rect(x0, y0, x1 - x0, y1 - y0); g.clip();
    // 格線
    const tStep = L.hi - L.lo > 60 ? 10 : 5;
    g.strokeStyle = D.alpha(C.text, C.dark ? 0.09 : 0.07); g.lineWidth = 1;
    for (let t = L.lo; t <= L.hi; t += tStep) { const x = Math.round(L.X(t + TK)) + 0.5; g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y1); g.stroke(); }
    const zStep = L.top > 6000 ? 2000 : 1000;
    for (let z = 0; z <= L.top; z += zStep) { const y = Math.round(L.Y(z)) + 0.5; g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke(); }
    // 乾絕熱線（位溫固定）
    const env = res.env, dz = L.top / 120;
    g.strokeStyle = D.alpha(C['cf-dry'], C.dark ? 0.3 : 0.25); g.lineWidth = 1;
    for (let th = Math.floor((L.lo + TK) / 10) * 10 - 10; th <= L.hi + TK + 200; th += 10) {
      g.beginPath();
      for (let z = 0, i = 0; z <= L.top + 1; z += dz, i++) {
        const Tz = th * Math.pow(K.envP(env, z) / K.P0, K.KAPPA);
        const x = L.X(Tz), y = L.Y(z);
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.stroke();
    }
    // 濕絕熱線（地面飽和、凝結水全部降下）
    g.setLineDash([4, 4]);
    g.strokeStyle = D.alpha(C['cf-moist'], C.dark ? 0.35 : 0.28);
    const mdz = L.top > 6000 ? 60 : 25;
    for (let t0 = Math.ceil(L.lo / 5) * 5; t0 <= L.hi; t0 += (L.hi - L.lo > 60 ? 10 : 5)) {
      if (t0 < -40) continue;
      let s = K.startParcel(t0 + TK, 1);
      g.beginPath(); g.moveTo(L.X(s.T), L.Y(0));
      for (let z = mdz; z <= L.top + 1; z += mdz) { s = K.step(env, s, z, 1); g.lineTo(L.X(s.T), L.Y(z)); }
      g.stroke();
    }
    g.setLineDash([]);
    g.restore();
    // 軸
    g.strokeStyle = D.alpha(C.text, 0.35); g.lineWidth = 1;
    g.beginPath(); g.moveTo(x0 + 0.5, y0); g.lineTo(x0 + 0.5, y1 + 0.5); g.lineTo(x1, y1 + 0.5); g.stroke();
    for (let z = 0; z <= L.top; z += zStep) D.haloText(g, num(z / 1000, 0), x0 - 5, L.Y(z), C.muted, 'right', 'middle', '11px ' + FONT);
    for (let t = L.lo; t <= L.hi; t += tStep) D.haloText(g, num(t, 0), L.X(t + TK), y1 + 5, C.muted, 'center', 'top', '11px ' + FONT);
    D.haloText(g, T('高度（km）', 'Height (km)'), x0 - 4, 4, C.muted, 'left', 'top', '600 11px ' + FONT);
    D.haloText(g, T('溫度（°C）', 'Temperature (°C)'), x1, L.H - 4, C.muted, 'right', 'bottom', '600 11px ' + FONT);
    return c;
  }
  function polyline(g, L, arr, key, from, to, color, width, dash) {
    g.save();
    g.strokeStyle = color; g.lineWidth = width; g.lineJoin = 'round'; g.lineCap = 'round';
    if (dash) g.setLineDash(dash);
    g.beginPath();
    let started = false;
    for (let i = 0; i < arr.length; i++) {
      const s = arr[i];
      if (s.z < Math.min(from, to) - 1e-6 || s.z > Math.max(from, to) + 1e-6 || s.z > L.top) continue;
      const x = L.X(s[key]), y = L.Y(s.z);
      if (!isFinite(x)) continue;
      if (started) g.lineTo(x, y); else { g.moveTo(x, y); started = true; }
    }
    g.stroke();
    g.restore();
  }
  function drawTz() {
    if (!tzSize) return;
    const res = R();
    const key = [state.ver, state.tzTop, tzSize.w, tzSize.h, tzSize.dpr, D.ver, C.dark].join('|');
    if (key !== tzKey) { tzLay = tzLayout(); tzBg = buildTzBg(tzLay); tzKey = key; }
    const L = tzLay, g = tctx, Hm = res.params.H;
    g.clearRect(0, 0, L.W, L.H);
    g.drawImage(tzBg, 0, 0, L.W, L.H);
    const x0 = L.pad.l, x1 = L.W - L.pad.r, y0 = L.pad.t, y1 = L.H - L.pad.b;
    g.save();
    g.beginPath(); g.rect(x0, y0, x1 - x0, y1 - y0); g.clip();
    // CAPE 與 CIN 的面積
    if (res.lfc != null) {
      const fill = function (zA, zB, color) {
        const seg = res.free.filter(function (s) { return s.z >= zA && s.z <= zB; });
        if (seg.length < 2) return;
        g.beginPath();
        seg.forEach(function (s, i) { const x = L.X(s.T), y = L.Y(s.z); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
        for (let i = seg.length - 1; i >= 0; i--) g.lineTo(L.X(seg[i].Te), L.Y(seg[i].z));
        g.closePath();
        g.fillStyle = color; g.fill();
      };
      fill(res.lfc, res.el, D.alpha(C['cf-cape'], C.dark ? 0.28 : 0.2));
      if (res.lcl && res.lfc > 0) fill(0, res.lfc, D.alpha(C['cf-cin'], C.dark ? 0.2 : 0.12));
    }
    // 周圍的大氣
    g.strokeStyle = C['cf-env']; g.lineWidth = 2.6; g.lineJoin = 'round';
    g.beginPath();
    for (let i = 0; i <= 160; i++) { const z = L.top * i / 160, x = L.X(K.envT(res.env, z)), y = L.Y(z); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    g.stroke();
    // 自由上升（山頂以上，虛線）
    if (res.lfc != null || state.tzTop > 5) {
      const zEnd = res.el != null ? Math.min(L.top, res.el + 1500) : Math.min(L.top, Hm + 3000);
      polyline(g, L, res.free, 'T', Hm, zEnd, D.alpha(C['cf-moist'], 0.75), 2, [5, 4]);
    }
    // 下沉段
    const zl = res.cloud ? res.lcl.z : Hm;
    polyline(g, L, res.down, 'T', res.zEvap, 0, C['cf-lee'], 2.8);
    if (res.zEvap < Hm) polyline(g, L, res.down, 'T', Hm, res.zEvap, D.mix(C['cf-moist'], C['cf-lee'], 0.35), 2.4, [7, 3]);
    polyline(g, L, res.down, 'Td', res.zEvap, 0, D.alpha(C['cf-dew'], 0.7), 1.8, [3, 4]);
    // 上升段
    polyline(g, L, res.up, 'T', 0, zl, C['cf-dry'], 3);
    if (res.cloud) polyline(g, L, res.up, 'T', zl, Hm, C['cf-moist'], 3);
    polyline(g, L, res.up, 'Td', 0, zl, C['cf-dew'], 2, [6, 4]);
    // 山頂高度
    if (Hm > 0 && Hm <= L.top) {
      g.save(); g.setLineDash([3, 4]); g.strokeStyle = D.alpha(C.text, 0.4); g.lineWidth = 1;
      const y = Math.round(L.Y(Hm)) + 0.5; g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke(); g.restore();
    }
    g.restore();
    // 標記
    const pills = [];
    const tag = function (text, x, y, color, align) {
      g.font = '600 12px ' + FONT;
      const w = g.measureText(text).width + 12;
      let yb = y;
      for (let k = 0; k < 10; k++) {
        const bx = align === 'right' ? x - w : x;
        const box = { x: bx, y: yb - 18, w: w, h: 18 };
        if (!pills.some(function (q) { return q.x < box.x + box.w && box.x < q.x + q.w && q.y < box.y + box.h && box.y < q.y + q.h; })) break;
        yb += 19;
      }
      pills.push(D.pill(g, text, x, yb, color, align));
    };
    const dot = function (Tk, z, color, r) { if (z > L.top) return; D.ball(g, L.X(Tk), L.Y(z), r || 4.5, color, { shadow: false }); };
    if (Hm > 0 && Hm <= L.top) tag(T('山頂 ', 'Crest ') + meters(Hm), x1 - 2, L.Y(Hm) - 3, C.muted, 'right');
    if (res.cloud) {
      dot(res.lcl.T, res.lcl.z, C['cf-moist']);
      tag(T('雲底 ', 'Cloud base ') + meters(res.lcl.z), L.X(res.lcl.T) + 8, L.Y(res.lcl.z) + 6, C['cf-moist'], 'left');
    }
    if (res.lfc != null && res.lfc > 0 && res.lfc <= L.top) {
      const s = K.sampleUp(res.free, res.lfc);
      dot(s.T, res.lfc, C['cf-cape']);
      tag(T('自由對流 ', 'LFC ') + km(res.lfc, 2), L.X(s.T) + 8, L.Y(res.lfc) + 6, C['cf-cape'], 'left');
    }
    if (res.el != null && res.el <= L.top) {
      const s = K.sampleUp(res.free, res.el);
      dot(s.T, res.el, C['cf-cape']);
      tag((res.triggered ? T('雲頂 ', 'Top ') : T('可能的雲頂 ', 'Possible top ')) + km(res.el, 1), L.X(s.T) + 8, L.Y(res.el) + 6, C['cf-cape'], 'left');
    } else if (res.el != null) {
      tag('↑ ' + (res.triggered ? T('雲頂 ', 'Top ') : T('可能的雲頂 ', 'Possible top ')) + km(res.el, 1), x1 - 2, y0 + 20, C['cf-cape'], 'right');
    }
    dot(res.lee.T, 0, C['cf-lee']);
    // 目前的氣塊
    const p = parcelNow();
    if (p.z <= L.top) {
      const x = L.X(p.T), y = L.Y(p.z);
      g.save();
      g.strokeStyle = C.text; g.lineWidth = 2;
      g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.stroke();
      g.restore();
      D.ball(g, x, y, 4.5, tempColor(p.T), { shadow: false });
    }
  }

  // =====================================================================
  // 讀數
  // =====================================================================
  function setHTML(id, html) { const e = $(id); if (e && e.innerHTML !== html) e.innerHTML = html; }
  function setOut(el, txt) { const o = el.parentNode.querySelector('output'); if (o && o.textContent !== txt && !o.dataset.editing) o.textContent = txt; }
  /** 滑桿數字：顯示到打字的精度，但去掉多餘的 0（至少 lo 位小數） */
  function outNum(v, lo, hi) {
    let t = v.toFixed(hi);
    if (hi > lo) t = t.replace(new RegExp('0{1,' + (hi - lo) + '}$'), '').replace(/\.$/, '');
    return t.replace('-', '−');
  }
  function refreshOutputs() {
    setOut(elT0, outNum(state.T0, 1, 2));
    setOut(elRH, outNum(state.RH * 100, 0, 2));
    setOut(elH, outNum(state.H, 0, 1));
    setOut(elEff, outNum(state.eff * 100, 0, 1));
    setOut(elGam, outNum(state.gamma, 1, 2));
  }
  function stabName(s) {
    return s === 'stable' ? T('絕對穩定', 'Absolutely stable') : s === 'unstable' ? T('絕對不穩定', 'Absolutely unstable') : T('條件性不穩定', 'Conditionally unstable');
  }
  function updateResults() {
    const res = state.res, s0 = res.start;
    setHTML('airHint', T('露點 ', 'Dew point ') + '<b>' + degC(s0.Td) + '</b>' + T('，溫度露點差 ', '; temperature minus dew point ') + '<b>' + num(s0.T - s0.Td, 1) + ' °C</b>' +
      T('，每公斤空氣含水氣 ', '; water vapour ') + '<b>' + gkg(s0.r) + '</b>' + T('。', '.'));
    setHTML('stabHint', '<span class="stab">' + stabName(res.stability) + '</span> ' +
      T('乾絕熱 9.8、地面的濕絕熱 ', 'Dry adiabatic 9.8; moist adiabatic at the ground ') + num(res.gammaMoist0, 1) + T(' °C／km。', ' °C/km.'));
    setHTML('rLcl', res.cloud ? meters(res.lcl.z) : (res.lcl ? T('沒有成雲（雲底 ', 'No cloud (base ') + meters(res.lcl.z) + T(' 高於山頂）', ' above the crest)') : '—'));
    setHTML('rTl', res.lcl ? degC(res.lcl.T) : '—');
    setHTML('rTop', degC(res.top.T));
    setHTML('rRain', gkg(res.rain));
    setHTML('rEvap', !res.cloud ? '—' : (res.zEvap >= res.params.H - 1e-6 ? T('沒有雲', 'No cloud') : meters(res.zEvap)));
    setHTML('rLeeT', '<span class="' + (res.foehn > 0.05 ? 'hot' : '') + '">' + degC(res.lee.T) + '</span>');
    setHTML('rLeeRH', pct(res.lee.RH) + T('（露點 ', ' (dew point ') + degC(res.lee.Td) + T('）', ')'));
    setHTML('rFoehn', '<span class="' + (res.foehn > 0.05 ? 'hot' : '') + '">' + signed(res.foehn, 1) + ' °C</span>');
    const rd = isFinite(res.rateDry) ? num(res.rateDry, 1) : '—', rm = isFinite(res.rateMoist) ? num(res.rateMoist, 1) : '—';
    setHTML('rRates', T('雲底以下 ', 'Below the cloud base ') + '<b>' + rd + '</b>' + T('，雲裡 ', ', in cloud ') + '<b>' + rm + '</b> °C/km');
    setHTML('rLfc', res.lfc == null ? T('沒有', 'None') : meters(res.lfc));
    setHTML('rEl', res.el == null ? '—' : km(res.el, 1));
    setHTML('rCape', res.lfc == null ? '0 J/kg' : num(res.cape, 0) + ' J/kg');
    let trig;
    if (res.triggered) trig = T('會。山頂高過自由對流高度，空氣自己往上衝，長成雲頂 ', 'Yes. The crest is above the level of free convection; the air rises by itself into a cumulonimbus topped at ') + km(res.el, 1) + T(' 的積雨雲。', '.');
    else if (res.lfc != null) trig = T('不會。還要把空氣抬到 ', 'No. The air would have to be lifted to ') + meters(res.lfc) + T('（比山頂高 ', ' (') + meters(res.lfc - res.params.H) + T('）才會自己往上衝。', ' above the crest) before it rises by itself.');
    else trig = T('不會。這團空氣抬到多高都比周圍冷。', 'No. However high this air is lifted, it stays colder than its surroundings.');
    setHTML('rTrig', trig);
  }
  let lastNow = 0;
  function updateNow(force) {
    const t = performance.now();
    if (!force && t - lastNow < 120) return;
    lastNow = t;
    const p = parcelNow();
    setHTML('pWhere', whereName(p));
    setHTML('pZ', meters(p.z));
    setHTML('pP', num(p.p / 100, 1) + ' hPa');
    setHTML('pT', degC(p.T, 2));
    setHTML('pTd', degC(p.Td, 2));
    setHTML('pRH', pct(p.RH, 1));
    setHTML('pL', gkg(p.l, 2));
    if (force || !state.running) {
      const txt = whereName(p) + T('，高度 ', ', height ') + meters(p.z) + T('，溫度 ', ', temperature ') + degC(p.T) + T('，相對溼度 ', ', humidity ') + pct(p.RH);
      if ($('srNow').textContent !== txt && t - lastSay > 900) { $('srNow').textContent = txt; lastSay = t; }
    }
  }
  let lastSay = 0;

  // =====================================================================
  // 任務事件與音效
  // =====================================================================
  function emit(type, data) { if (state.acted && window.LabMission) window.LabMission.emit(type, data); }
  function missionData() {
    const res = R(), s0 = res.start;
    return {
      T0: state.T0, RH: state.RH * 100, H: state.H, eff: state.eff * 100, gamma: state.gamma,
      Td0: s0.Td - TK, lcl: res.lcl ? res.lcl.z : null, cloud: res.cloud,
      topT: res.top.T - TK, leeT: res.lee.T - TK, leeRH: res.lee.RH * 100, foehn: res.foehn, rain: res.rain * 1000,
      zEvap: res.zEvap, leeCloud: res.cloud && res.zEvap < state.H - 1, lfc: res.lfc, el: res.el, cape: res.cape,
      triggered: res.triggered, stability: res.stability, view: view3 && view3.active ? '3d' : '2d'
    };
  }
  function emitState() { if (state.acted) emit('state', missionData()); }
  function acted() { state.acted = true; }
  function sound() { const S = window.LabSound; return S && S.enabled() ? S : null; }
  function setStatus(s) { $('status').textContent = s; }
  function updatePlay() { $('play').textContent = state.running ? T('暫停', 'Pause') : T('播放', 'Play'); }
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }

  /** 氣塊從 u0 走到 u1 時發生的事：經過雲底、下雨、抵達背風山腳 */
  function moved(u0, u1) {
    const res = R();
    const Hm = res.params.H;
    if (res.cloud && u0 < 0.5) {
      const uL = res.lcl.z <= 1 ? 0 : K.uAtZ(res.lcl.z, Hm, -1);
      if (u0 < uL && u1 >= uL) {
        state.flash = { start: performance.now() };
        setStatus(T('氣塊在 ', 'At ') + meters(res.lcl.z) + T(' 冷到露點 ', ' the parcel cools to its dew point, ') + degC(res.lcl.T) + T('，水氣開始凝結：雲出現了。', ': vapour condenses and a cloud appears.'));
        const S = sound(); if (S) { S.tone({ freq: 880, dur: 0.16, type: 'sine', gain: 0.22 }); setTimeout(function () { S.tone({ freq: 1320, dur: 0.22, type: 'sine', gain: 0.16 }); }, 90); }
        emit('pass', { z: res.lcl.z, T: res.lcl.T - TK });
      }
      // 雨聲（降水效率 > 0、在雲裡往上時）
      const S = sound();
      if (S && res.params.eff > 0 && u1 >= uL && u1 <= 0.5) {
        const t = performance.now();
        if (t - state.lastRain > 90 + 120 * (1 - res.params.eff)) {
          state.lastRain = t;
          S.noise({ dur: 0.05, gain: 0.05 + 0.08 * res.params.eff, filter: 3200 + 1500 * Math.random(), q: 0.9 });
        }
      }
    }
    if (u0 < 1 && u1 >= 1) {
      const S = sound();
      if (S) { if (res.foehn > 0.5) S.sweep({ from: 320, to: 760, dur: 0.45, gain: 0.2 }); else S.tone({ freq: 520, dur: 0.12, gain: 0.15 }); }
      setStatus(T('抵達背風山腳：', 'At the lee foot: ') + degC(res.lee.T) + T('、相對溼度 ', ', humidity ') + pct(res.lee.RH) +
        (res.foehn > 0.05 ? T('，比出發時暖 ', ', ') + num(res.foehn, 1) + T(' °C（焚風）。', ' °C warmer than at the start (foehn).') : T('，和出發時一樣。', ', the same as at the start.')));
      emit('cross', missionData());
    }
  }
  function setU(u, quiet) {
    const u0 = state.u;
    state.u = Math.max(0, Math.min(1, u));
    if (!quiet) moved(u0, state.u);
  }

  // =====================================================================
  // 控制項
  // =====================================================================
  [elT0, elRH, elH, elEff, elGam].forEach(function (el) {
    el.addEventListener('input', function () { acted(); readSliders(); state.dirty = true; refreshOutputs(); requestDraw(); });
    el.addEventListener('change', function () { readSliders(); recompute(); requestDraw(); updateNow(true); emitState(); });
  });
  $('play').addEventListener('click', function () {
    acted();
    state.running = !state.running;
    if (state.running && state.u >= 1) state.u = 0;
    updatePlay();
    if (!state.running) emitState();
    requestDraw();
  });
  function pause() { if (state.running) { state.running = false; updatePlay(); } }
  document.querySelectorAll('.segw button').forEach(function (b) {
    b.addEventListener('click', function () {
      state.tzTop = +b.getAttribute('data-top');
      document.querySelectorAll('.segw button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      tzKey = '';
      requestDraw();
    });
  });
  $('soundBtn').addEventListener('click', function () {
    const on = !(window.LabSettings && window.LabSettings.get('sound'));
    if (window.LabSettings) window.LabSettings.set('sound', on);
    updateSoundButton();
  });
  window.addEventListener('lab:settingschange', function (ev) { if (ev.detail && ev.detail.name === 'sound') updateSoundButton(); });

  // ---------- 測量紀錄 ----------
  const recBody = $('recBody');
  function renderRecs() {
    if (!state.recs.length) {
      recBody.innerHTML = '<tr class="empty"><td colspan="9">' + T('還沒有紀錄。', 'No records yet.') + '</td></tr>';
      return;
    }
    recBody.innerHTML = state.recs.map(function (r, i) {
      return '<tr' + (i === state.recs.length - 1 ? ' class="latest"' : '') + '><td>' + (i + 1) + '</td><td class="where">' + whereName(r, r.H) + '</td><td>' +
        Math.round(r.z) + '</td><td>' + num(r.p / 100, 1) + '</td><td>' + num(r.T - TK, 2) + '</td><td>' + num(r.Td - TK, 2) + '</td><td>' + num(r.RH * 100, 1) +
        '</td><td>' + num(r.l * 1000, 2) + '</td><td class="rate">' + (r.rate == null ? '—' : num(r.rate, 2)) + '</td></tr>';
    }).join('');
    const w = recBody.closest('.rec-wrap'); if (w) w.scrollTop = w.scrollHeight;
  }
  $('recBtn').addEventListener('click', function () {
    acted();
    const p = parcelNow();
    const prev = state.recs[state.recs.length - 1] || null;
    const rec = { z: p.z, p: p.p, T: p.T, Td: p.Td, RH: p.RH, l: p.l, branch: p.branch, u: state.u, ver: state.ver, H: state.H, rate: null };
    if (prev && prev.ver === rec.ver && Math.abs(rec.z - prev.z) >= 50) rec.rate = (prev.T - rec.T) / ((rec.z - prev.z) / 1000);
    state.recs.push(rec);
    if (state.recs.length > 200) state.recs.shift();
    renderRecs();
    const S = sound(); if (S) S.tone({ freq: 1250, dur: 0.05, gain: 0.15 });
    setStatus(T('已記錄第 ', 'Recorded #') + state.recs.length + T(' 筆：', ': ') + Math.round(rec.z) + ' m、' + num(rec.T - TK, 2) + ' °C' +
      (rec.rate == null ? '' : T('；與上一筆相比，每公里降溫 ', '; compared with the previous one, cooling ') + num(rec.rate, 2) + T(' °C。', ' °C per km.')));
    const pick = function (r) { return { z: r.z, T: r.T - TK, RH: r.RH * 100, l: r.l * 1000, branch: r.branch }; };
    emit('record', { n: state.recs.length, b: pick(rec), a: prev ? pick(prev) : null, sameVer: !!prev && prev.ver === rec.ver,
      dz: prev ? Math.abs(rec.z - prev.z) : 0, rate: rec.rate, lcl: R().lcl ? R().lcl.z : null });
  });
  $('clear').addEventListener('click', function () {
    state.recs = [];
    renderRecs();
    setStatus(T('已清除測量紀錄。', 'Records cleared.'));
  });

  // ---------- 點剖面、拖曳氣塊 ----------
  let dragging = false;
  function evPos(c, ev) { const r = c.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; }
  cv.addEventListener('pointerdown', function (ev) {
    if (view3 && view3.active) return;
    acted(); pause();
    dragging = true;
    cv.setPointerCapture(ev.pointerId);
    setU(lay().uOf(evPos(cv, ev)[0]), true);
    requestDraw(); updateNow(true);
  });
  cv.addEventListener('pointermove', function (ev) {
    if (!dragging) return;
    setU(lay().uOf(evPos(cv, ev)[0]), true);
    requestDraw(); updateNow();
  });
  function endDrag() { if (!dragging) return; dragging = false; updateNow(true); requestDraw(); }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);
  cv.addEventListener('lostpointercapture', endDrag);
  // 溫度－高度圖：點一下把氣塊移到那個高度（停在目前所在的那一側）
  let tzDrag = false;
  function tzMove(ev) {
    if (!tzLay) return;
    const res = R(), Hm = res.params.H;
    const z = Math.min(Hm, tzLay.zOf(evPos(tz, ev)[1]));
    const side = state.u > 0.5 ? 1 : -1;
    setU(K.uAtZ(z, Hm, side), true);
    requestDraw(); updateNow();
  }
  tz.addEventListener('pointerdown', function (ev) { acted(); pause(); tzDrag = true; tz.setPointerCapture(ev.pointerId); tzMove(ev); });
  tz.addEventListener('pointermove', function (ev) { if (tzDrag) tzMove(ev); });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (n) { tz.addEventListener(n, function () { if (tzDrag) { tzDrag = false; updateNow(true); } }); });

  // ---------- 鍵盤 ----------
  const kb = window.LabKeys ? window.LabKeys.attach(cv, {
    label: T('山脈剖面。方向鍵沿著山坡移動氣塊，Shift 加方向鍵移動得更多。', 'Mountain cross-section. Arrow keys move the air parcel along the slope; Shift with an arrow moves it further.'),
    items: [
      { name: function () { return T('氣塊', 'Air parcel'); },
        move: function (dx, dy, big) { const d = dx || dy; if (!d) return false; acted(); pause(); setU(state.u + d * (big ? 0.025 : 0.004), true); return true; },
        describe: function () { const p = parcelNow(); return whereName(p) + T('，高度 ', ', height ') + meters(p.z) + T('，溫度 ', ', temperature ') + degC(p.T) + T('，相對溼度 ', ', humidity ') + pct(p.RH); } }
    ],
    onChange: function () { updateNow(true); requestDraw(); }
  }) : null;

  // ---------- 分享：氣塊位置 ----------
  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () { return { u: Math.round(state.u * 1000) / 1000, run: state.running ? 1 : 0 }; },
    set: function (o) {
      if (!o) return;
      if (isFinite(o.u)) state.u = Math.max(0, Math.min(1, +o.u));
      if (o.run === 0) { state.running = false; updatePlay(); }
      readSliders(); recompute(); updateNow(true); requestDraw();
    }
  });

  // =====================================================================
  // 繪圖迴圈
  // =====================================================================
  let raf = 0, lastFrame = 0;
  function requestDraw() { schedule(); }
  function schedule() { if (!raf) raf = requestAnimationFrame(loop); }
  function loop(now) {
    raf = 0;
    const dt = lastFrame ? Math.min(1 / 30, (now - lastFrame) / 1000) : 0;
    lastFrame = now;
    if (state.dirty) recompute();
    if (state.running && !document.hidden && !dragging && !tzDrag && dt > 0) {
      if (state.hold > 0) { state.hold -= dt; if (state.hold <= 0) { state.u = 0; } }
      else {
        const u1 = state.u + dt / CROSS_S;
        setU(Math.min(1, u1));
        if (state.u >= 1) state.hold = 1.4;
      }
    }
    drawAll(now);
    updateNow();
    const flashing = state.flash && performance.now() - state.flash.start < 950;
    const rainy = !reducedMotion && state.res && state.res.cloud && state.res.params.eff > 0 && !(view3 && view3.active);
    if (state.running || flashing || rainy || (view3 && view3.active && view3.busy())) raf = requestAnimationFrame(loop);
    else lastFrame = 0;
  }
  function drawAll(now) {
    if (view3 && view3.active) view3.frame(now); else drawCross(now);
    drawTz();
  }

  // =====================================================================
  // 3D 檢視（切換時才載入 three.js 與 cloud-formation-3d.js）
  // =====================================================================
  let view3 = null, threeLib = null, loadToken = 0;
  const stage = $('stage'), host3 = $('view3'), viewMsg = $('viewMsg');
  const bridge = {
    K: K, T: T, D: D, state: state, res: R, parcelNow: parcelNow, colors: function () { return C; }, reducedMotion: reducedMotion,
    num: num, whereName: whereName, degC: degC, meters: meters, km: km, pct: pct, tempColor: tempColor, cloudSpan: cloudSpan, cloudDepth: cloudDepth,
    request: function () { schedule(); },
    onCam: function (kind) { acted(); emit('cam', { preset: kind }); },
    onContextLost: function () {
      setView('2d');
      viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D 剖面。', 'The 3D graphics context was lost, so the view switched back to 2D.');
    }
  };
  function webglAvailable() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
    catch (e) { return false; }
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (window.Cloud3D) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { s.remove(); reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadThree() {
    if (threeLib && window.Cloud3D) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    const own = new URL('js/cloud-formation-3d.js' + (SCRIPT_V ? '?v=' + SCRIPT_V : ''), document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js'), loadScript(own)]).then(function (mods) {
      if (!window.Cloud3D) throw new Error('cloud-formation-3d.js did not load');
      threeLib = { THREE: mods[0], OrbitControls: mods[1].OrbitControls };
      return threeLib;
    });
  }
  function setPressed(mode) {
    $('view2d').setAttribute('aria-pressed', String(mode === '2d'));
    $('view3d').setAttribute('aria-pressed', String(mode === '3d'));
  }
  function updateViewNotes() {
    const is3 = !!(view3 && view3.active);
    $('resetCam').hidden = !is3;
    $('camBar').hidden = !is3;
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
        view3 = window.Cloud3D.create(lib, host3, bridge);
        stage.classList.add('is3d');
        viewMsg.textContent = '';
        updateViewNotes();
        requestAnimationFrame(function () { if (view3) { view3.onShow(); requestDraw(); } });
        requestDraw();
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
      updateViewNotes();
      resizeCv();
    }
  }
  function fail3D() {
    if (view3) { try { view3.dispose(); } catch (e) { /* 忽略 */ } view3 = null; }
    stage.classList.remove('is3d');
    setPressed('2d');
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 剖面。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D view is kept.');
    updateViewNotes();
    resizeCv();
  }
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { acted(); setView('3d'); emit('view', { mode: '3d' }); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });
  ['Side', 'Oblique', 'Lee'].forEach(function (k) {
    $('cam' + k).addEventListener('click', function () { if (view3) { view3.camTo(k.toLowerCase()); bridge.onCam(k.toLowerCase()); } });
  });

  // =====================================================================
  // 啟動
  // =====================================================================
  readColors();
  readSliders();
  recompute();
  refreshOutputs();
  updatePlay();
  updateSoundButton();
  renderRecs();
  // 語言切換也會發出 lab:themechange（settings.js），所以這裡一併更新文字
  function themeChanged() {
    readColors();
    layerKey = ''; tzKey = '';
    updateResults(); updatePlay(); updateSoundButton(); renderRecs(); updateNow(true);
    if (view3 && view3.active) view3.onTheme();
    requestDraw();
  }
  const dm = window.matchMedia('(prefers-color-scheme: dark)');
  if (dm.addEventListener) dm.addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  if (window.ResizeObserver) {
    const watch = function (el, fn) { let lw = 0, lh = 0; new ResizeObserver(function () { if (el.clientWidth !== lw || el.clientHeight !== lh) { lw = el.clientWidth; lh = el.clientHeight; fn(); } }).observe(el); };
    watch(cv, resizeCv); watch(tz, resizeTz);
  } else window.addEventListener('resize', function () { resizeCv(); resizeTz(); });
  resizeCv(); resizeTz();
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { lastFrame = 0; schedule(); } });
  if (reducedMotion) setStatus(T('已偵測到「減少動態效果」設定：按「播放」讓風推動氣塊。', 'Reduced motion is on: press “Play” to let the wind carry the parcel.'));
  updateNow(true);
  requestDraw();
  // 測試用（Playwright）
  window.__cloud = { state: state, K: K, res: R, missionData: missionData, parcelNow: parcelNow,
    setU: function (u) { setU(u, true); requestDraw(); updateNow(true); } };
})();
