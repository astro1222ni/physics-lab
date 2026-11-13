/* quake-early-warning.js — 「地震預警與盲區」的畫面與互動
 * 物理計算全部在 quake-early-warning-core.js（臺灣地圖與城市取自 earthquake-core.js）。 */
(function () {
  'use strict';
  const E = window.EEWCore, QC = E.QC;
  const D = window.LabDraw;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const FONT = D.FONT;
  const CITIES = QC.CITIES.map(function (c) { const p = QC.toXY(c.lon, c.lat); return Object.assign({ x: p.x, y: p.y }, c); });
  const VIEW = (function () { const a = QC.toXY(QC.MAP.lon0, QC.MAP.lat0), b = QC.toXY(QC.MAP.lon1, QC.MAP.lat1); return { x0: a.x, y0: a.y, x1: b.x, y1: b.y }; })();
  const LEAD_RINGS = [10, 20, 30, 40, 50, 60, 80, 100];

  // =====================================================================
  // 狀態
  // =====================================================================
  const el = { mag: $('mag'), dep: $('dep'), spc: $('spc'), nst: $('nst'), proc: $('proc'), dm: $('dm') };
  const state = {
    q: { x: 0, y: 0, h: 15.5, M: 7.4, dM: 0 },
    preset: 'hualien2024',
    spacing: 20, n: 6, proc: 4, onsite: false, sea: false,
    site: 'TPE', custom: null,          // 選定的地方：城市代號或 'custom'（custom = {x, y}）
    chart: 'time', speed: 3,
    run: null,                          // { t, playing, alarmed, pDone, sDone }
    log: [], acted: false
  };
  function presetOf(id) { return E.QUAKES.filter(function (q) { return q.id === id; })[0]; }
  function applyPreset(id) {
    const p = presetOf(id), xy = QC.toXY(p.lon, p.lat);
    state.q.x = xy.x; state.q.y = xy.y; state.q.h = p.h; state.q.M = p.M;
    setSlider(el.mag, p.M); setSlider(el.dep, p.h);
    state.preset = id;
  }
  function readSliders() {
    state.q.M = val(el.mag); state.q.h = val(el.dep); state.q.dM = val(el.dm);
    state.spacing = Math.max(5, Math.min(50, val(el.spc)));
    state.n = Math.max(1, Math.min(12, Math.round(val(el.nst))));
    state.proc = Math.max(0, val(el.proc));
  }
  let scen = null, scenKey = '';
  function S() {
    const key = [state.q.x, state.q.y, state.q.h, state.q.M, state.q.dM, state.spacing, state.n, state.proc, state.onsite, state.sea].join('|');
    if (scen && key === scenKey) return scen;
    scen = E.scenario(state.q, { spacing: state.spacing, n: state.n, proc: state.proc, sea: state.sea, onsite: state.onsite });
    scenKey = key;
    return scen;
  }
  function sitePos() {
    if (state.site === 'custom' && state.custom) return state.custom;
    const c = cityOf(state.site); return c ? { x: c.x, y: c.y } : { x: 0, y: 0 };
  }
  function cityOf(id) { return CITIES.filter(function (c) { return c.id === id; })[0]; }
  function siteName() {
    if (state.site === 'custom') return T('你點的地方', 'Your point');
    const c = cityOf(state.site); return c ? T(c.zh, c.en) : '';
  }
  function siteInfo() { const p = sitePos(); return S().site(p.x, p.y); }

  // =====================================================================
  // 文字
  // =====================================================================
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--canvas-bg', '--text', '--muted', '--border', '--accent', '--accent-soft', '--surface',
      '--ew-p', '--ew-s', '--ew-blind', '--ew-alert', '--ew-lead', '--ew-on', '--ew-sea0', '--ew-sea1', '--ew-land0', '--ew-land1', '--ew-coast', '--ew-st', '--ew-epi']
      .forEach(function (k) { C[k.slice(2)] = cs.getPropertyValue(k).trim(); });
  }
  function num(v, d) {
    if (v == null || !isFinite(v)) return '—';
    let s = v.toFixed(d);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  function outNum(v, lo, hi) {
    let t = v.toFixed(hi);
    if (hi > lo) t = t.replace(new RegExp('0{1,' + (hi - lo) + '}$'), '').replace(/\.$/, '');
    return t.replace('-', '−');
  }
  function setHTML(id, html) { const e = $(id); if (e && e.innerHTML !== html) e.innerHTML = html; }
  function setOut(inp, txt) { const o = inp.parentNode.querySelector('output'); if (o && o.textContent !== txt && !o.dataset.editing) o.textContent = txt; }
  function sec(v) { return num(v, 1) + T(' 秒', ' s'); }
  function kmT(v) { return v == null || !isFinite(v) ? '—' : num(v, v < 100 ? 1 : 0) + ' km'; }
  function intText(i) { return i >= 5 ? T('5 級以上', '5 or more') : i + T(' 級', ''); }
  function intTextShort(i) { return i >= 5 ? '5+' : String(i); }
  function radiusText(r) {
    if (r == null || r < 0) return T('沒有', 'none');
    if (!isFinite(r)) return T('整個地圖', 'the whole map');
    return T('震央 ', 'within ') + kmT(r) + T(' 內', ' of the epicentre');
  }
  function lonlatText(x, y) { const ll = QC.toLonLat(x, y); return num(ll.lat, 2) + '°N、' + num(ll.lon, 2) + '°E'; }
  function setStatus(msg) { setHTML('status', msg); }

  // =====================================================================
  // 畫布
  // =====================================================================
  const stage = $('stage');
  const cv = $('cv'), ctx = cv.getContext('2d');
  const gr = $('gr'), gtx = gr.getContext('2d');
  let cvSize = null, grSize = null;
  function fit(c, g) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = c.clientWidth || 300, h = c.clientHeight || 300;
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: w, h: h, dpr: dpr };
  }
  function resizeCv() { cvSize = fit(cv, ctx); grSize = fit(gr, gtx); baseKey = ''; requestDraw(); }

  /** 地圖投影：km → 畫布像素。整個畫布都是地圖（多出來的地方是海） */
  let M = null;
  function mapLay(W, H) {
    const pad = 8;
    const kw = VIEW.x1 - VIEW.x0, kh = VIEW.y1 - VIEW.y0;
    const s = Math.min((W - 2 * pad) / kw, (H - 2 * pad) / kh);
    const cx = (VIEW.x0 + VIEW.x1) / 2, cy = (VIEW.y0 + VIEW.y1) / 2;
    const o = { s: s, cx: cx, cy: cy, W: W, H: H };
    o.px = function (x) { return W / 2 + (x - cx) * s; };
    o.py = function (y) { return H / 2 - (y - cy) * s; };
    o.kx = function (px) { return cx + (px - W / 2) / s; };
    o.ky = function (py) { return cy - (py - H / 2) / s; };
    o.bx0 = o.kx(0); o.bx1 = o.kx(W); o.by0 = o.ky(H); o.by1 = o.ky(0);
    return o;
  }

  // ---------- 靜態底圖（海、陸地、經緯線、測站）放在離屏畫布 ----------
  let base = null, baseKey = '';
  function polyPath(g, pts) {
    g.beginPath();
    pts.forEach(function (q, i) { const p = QC.toXY(q[0], q[1]); const X = M.px(p.x), Y = M.py(p.y); if (i) g.lineTo(X, Y); else g.moveTo(X, Y); });
    g.closePath();
  }
  function drawBase() {
    const W = cvSize.w, H = cvSize.h, dpr = cvSize.dpr;
    const key = [W, H, dpr, D.ver, C['ew-sea0'], state.spacing, state.sea].join('|');
    if (base && key === baseKey) return;
    baseKey = key;
    if (!base) base = document.createElement('canvas');
    base.width = Math.round(W * dpr); base.height = Math.round(H * dpr);
    const g = base.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 海：由西北淺到東南深
    const sea = g.createLinearGradient(0, 0, W * 0.6, H);
    sea.addColorStop(0, C['ew-sea0']); sea.addColorStop(1, C['ew-sea1']);
    g.fillStyle = sea; g.fillRect(0, 0, W, H);
    // 東部外海的深色（太平洋，水深急遽增加）
    const ex = M.px(QC.toXY(121.9, 23.7).x);
    const deep = g.createLinearGradient(ex, 0, W, 0);
    deep.addColorStop(0, D.alpha(C['ew-sea1'], 0)); deep.addColorStop(1, D.alpha(D.dark ? '#000814' : '#5b8fbd', 0.35));
    g.fillStyle = deep; g.fillRect(ex, 0, W - ex, H);
    // 經緯線
    g.save();
    g.strokeStyle = D.alpha(C.text, D.dark ? 0.1 : 0.08); g.lineWidth = 1; g.setLineDash([3, 5]);
    g.font = '600 10.5px ' + FONT; g.fillStyle = D.alpha(C.muted, 0.9);
    for (let lon = 119; lon <= 123; lon += 1) {
      const X = M.px(QC.toXY(lon, 23.7).x); if (X < 0 || X > W) continue;
      g.beginPath(); g.moveTo(X, 0); g.lineTo(X, H); g.stroke();
      g.textAlign = 'center'; g.textBaseline = 'bottom'; g.fillText(lon + '°E', X, H - 4);
    }
    for (let lat = 22; lat <= 25; lat += 1) {
      const Y = M.py(QC.toXY(121, lat).y); if (Y < 0 || Y > H) continue;
      g.beginPath(); g.moveTo(0, Y); g.lineTo(W, Y); g.stroke();
      g.textAlign = 'right'; g.textBaseline = 'bottom'; g.fillText(lat + '°N', W - 4, Y - 2);
    }
    g.restore();
    // 陸地：海岸的陰影、立體的漸層
    g.save();
    g.shadowColor = D.shadowInk(D.dark ? 0.5 : 0.22); g.shadowBlur = 10; g.shadowOffsetY = 3;
    const cen = QC.toXY(121.0, 23.6);
    const land = g.createRadialGradient(M.px(cen.x), M.py(cen.y), 4, M.px(cen.x), M.py(cen.y), 200 * M.s);
    land.addColorStop(0, C['ew-land1']); land.addColorStop(1, C['ew-land0']);
    g.fillStyle = land;
    polyPath(g, QC.TAIWAN); g.fill();
    polyPath(g, QC.PENGHU); g.fill();
    QC.ISLETS.forEach(function (s) { const p = QC.toXY(s.lon, s.lat); g.beginPath(); g.arc(M.px(p.x), M.py(p.y), Math.max(2, s.r * M.s), 0, Math.PI * 2); g.fill(); });
    g.restore();
    // 中央山脈的淡淡陰影（示意：沿著島的長軸）
    g.save();
    polyPath(g, QC.TAIWAN); g.clip();
    const a = QC.toXY(121.55, 24.55), b = QC.toXY(120.85, 22.3);
    // 由寬到窄疊幾層很淡的線，邊緣柔和
    g.lineCap = 'round'; g.beginPath(); g.moveTo(M.px(a.x), M.py(a.y)); g.lineTo(M.px(b.x), M.py(b.y));
    [44, 34, 25, 16, 8].forEach(function (wk) {
      g.lineWidth = wk * M.s; g.strokeStyle = D.alpha(D.dark ? '#000000' : '#7a6440', D.dark ? 0.07 : 0.035); g.stroke();
    });
    g.restore();
    g.strokeStyle = C['ew-coast']; g.lineWidth = 1.3; g.lineJoin = 'round';
    polyPath(g, QC.TAIWAN); g.stroke(); polyPath(g, QC.PENGHU); g.stroke();
    // 測站
    S().st.forEach(function (s) { tri(g, M.px(s.x), M.py(s.y), 3.6, D.alpha(C['ew-st'], 0.55), s.sea); });
  }
  function tri(g, X, Y, r, col, sea) {
    g.beginPath();
    if (sea) { g.rect(X - r * 0.8, Y - r * 0.8, r * 1.6, r * 1.6); }
    else { g.moveTo(X, Y - r); g.lineTo(X + r * 0.92, Y + r * 0.6); g.lineTo(X - r * 0.92, Y + r * 0.6); g.closePath(); }
    g.fillStyle = col; g.fill();
  }
  function star(g, X, Y, r, fill, stroke) {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
      const px = X + rr * Math.cos(a), py = Y + rr * Math.sin(a);
      if (i) g.lineTo(px, py); else g.moveTo(px, py);
    }
    g.closePath();
    g.fillStyle = fill; g.fill();
    g.lineWidth = 1.4; g.strokeStyle = stroke; g.stroke();
  }

  /** 震央距離 d 對應的預警時間環：d = √((VS(T_a + L))² − h²) */
  function leadRadius(L) { return E.surfaceRadius(S().Ta + L, state.q.h, E.VS); }

  function drawMap() {
    if (!cvSize) return;
    const W = cvSize.w, H = cvSize.h;
    M = mapLay(W, H);
    drawBase();
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(base, 0, 0, W, H);
    const s = S(), q = state.q, X0 = M.px(q.x), Y0 = M.py(q.y);
    const run = state.run, t = run ? run.t : null;
    const reveal = !run || t >= s.Ta;                 // 跑動畫時，警報發布之後才顯示結果
    const fade = run ? (reveal ? 1 : 0.18) : 1;
    // 發警報的範圍（橘色虛線）與預警時間環（只畫在發警報的範圍內）
    if (s.issue && s.rAlert > 0) {
      const rA = isFinite(s.rAlert) ? s.rAlert * M.s : W * 3;
      ctx.save();
      ctx.beginPath(); ctx.arc(X0, Y0, rA, 0, Math.PI * 2);
      ctx.fillStyle = D.alpha(C['ew-alert'], (D.dark ? 0.06 : 0.035) * fade); ctx.fill();
      ctx.setLineDash([7, 5]); ctx.lineWidth = 1.8; ctx.strokeStyle = D.alpha(C['ew-alert'], 0.85 * fade); ctx.stroke();
      ctx.setLineDash([]);
      ctx.clip();
      LEAD_RINGS.forEach(function (L) {
        const r = leadRadius(L) * M.s; if (r <= 0 || r > W * 2) return;
        ctx.beginPath(); ctx.arc(X0, Y0, r, 0, Math.PI * 2);
        ctx.lineWidth = L % 30 === 0 ? 1.6 : 1; ctx.strokeStyle = D.alpha(C['ew-lead'], (L % 30 === 0 ? 0.75 : 0.45) * fade); ctx.stroke();
      });
      ctx.restore();
      // 環的標籤（往右下方向）
      if (fade > 0.5) {
        const ang = 0.6;
        LEAD_RINGS.forEach(function (L) {
          const r = leadRadius(L); if (r <= 0 || (isFinite(s.rAlert) && r > s.rAlert)) return;
          const lx = X0 + r * M.s * Math.cos(ang), ly = Y0 + r * M.s * Math.sin(ang);
          if (lx < 20 || lx > W - 20 || ly < 12 || ly > H - 12) return;
          D.haloText(ctx, L + ' s', lx, ly, C['ew-lead'], 'center', 'middle', '700 10.5px ' + FONT);
        });
      }
    }
    // 現地型的盲區（紫色虛線圈）
    if (state.onsite && s.rbOn > 0) {
      ctx.beginPath(); ctx.arc(X0, Y0, s.rbOn * M.s, 0, Math.PI * 2);
      ctx.setLineDash([3, 3]); ctx.lineWidth = 1.6; ctx.strokeStyle = D.alpha(C['ew-on'], 0.9 * fade); ctx.stroke(); ctx.setLineDash([]);
    }
    // 盲區（紅色圓盤）
    if (s.rb > 0) {
      const r = s.rb * M.s;
      const gb = ctx.createRadialGradient(X0, Y0, 0, X0, Y0, r);
      gb.addColorStop(0, D.alpha(C['ew-blind'], 0.34 * fade)); gb.addColorStop(1, D.alpha(C['ew-blind'], 0.16 * fade));
      ctx.beginPath(); ctx.arc(X0, Y0, r, 0, Math.PI * 2);
      ctx.fillStyle = gb; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = D.alpha(C['ew-blind'], 0.9 * fade); ctx.stroke();
    }
    // 觸發警報的測站
    const used = {}; s.used.forEach(function (i) { used[i] = true; });
    s.st.forEach(function (st, i) {
      const d = Math.hypot(st.x - q.x, st.y - q.y), tp = E.tP(d, q.h);
      const hit = run && t >= tp;
      if (used[i] && (!run || hit)) {
        const X = M.px(st.x), Y = M.py(st.y);
        if (run && !reducedMotion && t - tp < 1.2) D.ripple(ctx, X, Y, 4, (t - tp) / 1.2, C['ew-p']);
        tri(ctx, X, Y, 5.4, C['ew-p'], st.sea);
        ctx.lineWidth = 1; ctx.strokeStyle = C.surface; ctx.stroke();
      } else if (hit) {
        tri(ctx, M.px(st.x), M.py(st.y), 3.8, D.alpha(C['ew-p'], 0.6), st.sea);
      }
    });
    // 波前
    if (run) {
      const rp = E.surfaceRadius(t, q.h, E.VP), rs = E.surfaceRadius(t, q.h, E.VS);
      if (rp > 0) {
        ctx.beginPath(); ctx.arc(X0, Y0, rp * M.s, 0, Math.PI * 2);
        ctx.lineWidth = 2.2; ctx.strokeStyle = D.alpha(C['ew-p'], 0.95); ctx.stroke();
        ctx.lineWidth = 7; ctx.strokeStyle = D.alpha(C['ew-p'], 0.15); ctx.stroke();
      }
      if (rs > 0) {
        const r = rs * M.s, band = Math.min(r, 26);
        const gs = ctx.createRadialGradient(X0, Y0, Math.max(0, r - band), X0, Y0, r);
        gs.addColorStop(0, D.alpha(C['ew-s'], 0)); gs.addColorStop(1, D.alpha(C['ew-s'], 0.32));
        ctx.beginPath(); ctx.arc(X0, Y0, r, 0, Math.PI * 2); ctx.fillStyle = gs; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = D.alpha(C['ew-s'], 0.95); ctx.stroke();
      }
    }
    // 震央的標籤放在星星正下方；城市標籤避開它
    const epiTxt = 'M ' + num(q.M, 1) + T('・深 ', ' · ') + num(q.h, 1) + T(' km', ' km deep');
    ctx.font = '700 11.5px ' + FONT;
    const ew = ctx.measureText(epiTxt).width + 12;
    const ex = Math.max(ew / 2 + 4, Math.min(W - ew / 2 - 4, X0)), eyb = Y0 + 30;
    // 城市
    drawCities(s, run, t, [[ex - ew / 2, eyb - 15, ex + ew / 2, eyb + 5], [X0 - 13, Y0 - 13, X0 + 13, Y0 + 13]]);
    // 選定的地方（自訂點）
    if (state.site === 'custom' && state.custom) {
      const X = M.px(state.custom.x), Y = M.py(state.custom.y);
      ctx.beginPath(); ctx.arc(X, Y, 8, 0, Math.PI * 2); ctx.lineWidth = 2.4; ctx.strokeStyle = C.accent; ctx.stroke();
      ctx.beginPath(); ctx.arc(X, Y, 2.5, 0, Math.PI * 2); ctx.fillStyle = C.accent; ctx.fill();
      const e = siteInfo();
      D.pill(ctx, siteName() + '  ' + cityTag(e, run, t), X + 12, Y + 5, C.accent, 'left', '700 11.5px ' + FONT);
    }
    // 震央（星星）與深度
    ctx.save();
    if (!reducedMotion && run && t < 3) D.ripple(ctx, X0, Y0, 6, t / 3, C['ew-epi']);
    ctx.shadowColor = D.shadowInk(0.35); ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
    star(ctx, X0, Y0, kb && kb.focused() && kb.index() === 0 ? 14 : 12, C['ew-epi'], D.dark ? '#000' : '#7c4a03');
    ctx.restore();
    if (kb && kb.focused() && kb.index() === 0) {
      ctx.save(); ctx.setLineDash([4, 3]); ctx.strokeStyle = C.accent; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(X0, Y0, 20, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
    D.pill(ctx, epiTxt, ex, eyb, C['ew-epi'], 'center', '700 11.5px ' + FONT);
    // 左上角：時間與事件
    drawHud(s, run, t);
  }
  /** 城市標籤的文字 */
  function cityTag(e, run, t) {
    if (run && t < S().Ta) return '';
    if (run && t >= e.tS) return T('搖晃中・', 'shaking · ') + intTextShort(e.I) + T(' 級', '');
    if (e.best == null) return T('沒有警報・', 'no alert · ') + intTextShort(e.I) + T(' 級', '');
    if (e.best <= 0) return T('盲區', 'blind');
    if (run) return (M.W < 560 ? '' : T('還有 ', '')) + num(Math.max(0, e.tS - t), 0) + (M.W < 560 ? ' s' : T(' 秒', ' s left'));
    return num(e.best, 0) + ' s';
  }
  function drawCities(s, run, t, keep) {
    const placed = (keep || []).slice();
    CITIES.forEach(function (c) { const X = M.px(c.x), Y = M.py(c.y); placed.push([X - 6, Y - 6, X + 6, Y + 6]); });
    CITIES.forEach(function (c) {
      const e = s.site(c.x, c.y), X = M.px(c.x), Y = M.py(c.y);
      const col = e.best == null ? C.muted : e.best <= 0 ? C['ew-blind'] : C['ew-lead'];
      const shaking = run && t >= e.tS;
      if (shaking && !reducedMotion && t - e.tS < 1.5) D.ripple(ctx, X, Y, 4, (t - e.tS) / 1.5, C['ew-s']);
      const sel = state.site === c.id;
      ctx.beginPath(); ctx.arc(X, Y, sel ? 6 : 4.2, 0, Math.PI * 2);
      ctx.fillStyle = (run && t < s.Ta) ? C.text : col; ctx.fill();
      ctx.lineWidth = sel ? 2.6 : 1.4; ctx.strokeStyle = sel ? C.accent : C.surface; ctx.stroke();
      if (sel) { ctx.beginPath(); ctx.arc(X, Y, 10, 0, Math.PI * 2); ctx.lineWidth = 2; ctx.strokeStyle = D.alpha(C.accent, 0.7); ctx.stroke(); }
      const tag = cityTag(e, run, t);
      const label = T(c.zh, c.en) + (tag ? '  ' + tag : '');
      // 標籤放右邊；靠右邊界或和已放的重疊時放左邊
      ctx.font = (sel ? '700 ' : '600 ') + '11px ' + FONT;
      const w = ctx.measureText(label).width + 12;
      // 候選位置：右、左、上、下；選第一個在畫布內又不和已放的標籤重疊的
      const cx = Math.max(w / 2 + 3, Math.min(M.W - w / 2 - 3, X));
      const cands = [
        { x: X + 9, yb: Y + 5, al: 'left', b: [X + 9, Y - 9, X + 9 + w, Y + 9] },
        { x: X - 9, yb: Y + 5, al: 'right', b: [X - 9 - w, Y - 9, X - 9, Y + 9] },
        { x: cx, yb: Y - 10, al: 'center', b: [cx - w / 2, Y - 24, cx + w / 2, Y - 6] },
        { x: cx, yb: Y + 22, al: 'center', b: [cx - w / 2, Y + 8, cx + w / 2, Y + 26] }
      ];
      const inside = function (b) { return b[0] >= 2 && b[2] <= M.W - 2 && b[1] >= 2 && b[3] <= M.H - 2; };
      const hits = function (b) { return placed.some(function (p) { return b[0] < p[2] && b[2] > p[0] && b[1] < p[3] && b[3] > p[1]; }); };
      let pick = cands.filter(function (k) { return inside(k.b) && !hits(k.b); })[0] || cands.filter(function (k) { return inside(k.b); })[0] || cands[0];
      placed.push(pick.b);
      D.pill(ctx, label, pick.x, pick.yb, sel ? C.accent : (run && t < s.Ta ? C.text : col), pick.al, (sel ? '700 ' : '600 ') + '11px ' + FONT);
    });
  }
  function drawHud(s, run, t) {
    const x = 10; let y = 22;
    const line = function (txt, col, font) { D.haloText(ctx, txt, x, y, col, 'left', 'alphabetic', font || '600 12px ' + FONT); y += 18; };
    if (run) {
      line('t = ' + num(t, 1) + T(' 秒', ' s'), C.text, '800 17px ' + FONT); y += 2;
      if (t >= s.tFirst) line(T('第一站收到 P 波：', 'First P pick: ') + sec(s.tFirst), C['ew-p']);
      if (t >= s.tN && state.n > 1) line(T('第 ', 'Station no. ') + state.n + T(' 站收到：', ': ') + sec(s.tN), C['ew-p']);
      if (t >= s.Ta) line(s.issue ? T('警報發布：', 'Alert sent: ') + sec(s.Ta) : T('初報規模 ', 'First estimate M ') + num(s.Mest, 1) + T('，未達發布標準', ': below the threshold, no alert'), C['ew-alert'], '700 12.5px ' + FONT);
    } else {
      line(T('警報發布：地震後 ', 'Alert sent ') + sec(s.Ta) + T('', ' after the quake'), C['ew-alert'], '700 12.5px ' + FONT);
      line(T('盲區半徑：', 'Blind zone: ') + (s.rb > 0 ? kmT(s.rb) : T('沒有', 'none')), C['ew-blind']);
      if (!s.issue) line(T('初報規模 ', 'First estimate M ') + num(s.Mest, 1) + T(' < 5：不發警報', ' < 5: no alert'), C.muted);
    }
    // 警報橫幅
    if (run && s.issue && t >= s.Ta && t < s.Ta + 6) {
      const u = (t - s.Ta) / 6, a = reducedMotion ? 1 : Math.min(1, (1 - u) * 3);
      ctx.save(); ctx.globalAlpha = a;
      D.pill(ctx, T('⚠ 強震即時警報', '⚠ Earthquake alert'), M.W / 2, M.W >= 560 ? 34 : M.H - 30, C['ew-alert'], 'center', '800 15px ' + FONT);
      ctx.restore();
    }
  }

  // ---------- 下方的圖：時間軸或剖面 ----------
  function drawChart() {
    if (!grSize) return;
    const W = grSize.w, H = grSize.h, g = gtx;
    g.clearRect(0, 0, W, H);
    D.backdrop(g, W, H);
    if (state.chart === 'time') drawTimeline(g, W, H); else drawSection(g, W, H);
  }
  /** 合成的地震紀錄（只示意波形：P 波小、S 波大，振幅跟著 PGA） */
  function trace(tt, e) {
    const env = function (t0, k, dur) { const u = tt - t0; return u < 0 ? 0 : (1 - Math.exp(-u * 4)) * Math.exp(-u / dur) * k; };
    const n = Math.sin(tt * 37.1) * 0.5 + Math.sin(tt * 53.7 + 1.3) * 0.3 + Math.sin(tt * 91.3 + 0.4) * 0.2;
    const a = Math.min(1, Math.max(0.12, Math.log10(Math.max(1, e.pga)) / 2.8));
    return 0.03 * Math.sin(tt * 61.7) + n * (env(e.tP, 0.22 * a, 4) + env(e.tS, a, 7 + e.d / 40));
  }
  function drawTimeline(g, W, H) {
    const s = S(), e = siteInfo(), run = state.run;
    const tMax = Math.max(20, Math.ceil((Math.max(e.tS, s.Ta) + 12) / 10) * 10);
    const L = { x0: 46, x1: W - 14, y0: 44, y1: H - 34 };
    const X = function (t) { return L.x0 + (L.x1 - L.x0) * t / tMax; };
    const ym = (L.y0 + L.y1) / 2, amp = (L.y1 - L.y0) / 2 - 6;
    // 時間格線
    g.font = '600 10.5px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'top';
    const step = tMax > 80 ? 20 : 10;
    for (let t = 0; t <= tMax; t += step) {
      g.strokeStyle = D.alpha(C.text, 0.08); g.lineWidth = 1; g.beginPath(); g.moveTo(X(t), L.y0); g.lineTo(X(t), L.y1); g.stroke();
      g.fillStyle = C.muted; g.fillText(t + (t === 0 ? T(' 秒', ' s') : ''), X(t), L.y1 + 6);
    }
    g.textAlign = 'left'; g.fillText(T('地震發生後的時間', 'time after the earthquake'), L.x0, H - 14);
    // 預警時間的帶
    const yb = L.y0 - 2;
    if (e.best != null) {
      const tA = e.lead != null && (e.leadOn == null || e.lead >= e.leadOn) ? s.Ta : e.tP + E.T_ON;
      const a = Math.min(tA, e.tS), b = Math.max(tA, e.tS), col = e.best > 0 ? C['ew-lead'] : C['ew-blind'];
      g.fillStyle = D.alpha(col, 0.14); g.fillRect(X(a), L.y0, X(b) - X(a), L.y1 - L.y0);
      D.arrow(g, X(tA), yb + 12, X(e.tS), yb + 12, col, 1.8, {});
      D.pill(g, (e.best > 0 ? T('預警時間 ', 'Warning ') + num(e.best, 1) + T(' 秒', ' s') : T('盲區：晚了 ', 'Blind: late by ') + num(-e.best, 1) + T(' 秒', ' s')), Math.max(L.x0 + 60, Math.min(L.x1 - 60, (X(a) + X(b)) / 2)), yb + 6, col, 'center', '700 11.5px ' + FONT);
    }
    // 地震紀錄
    const tEnd = run ? Math.min(run.t, tMax) : tMax;
    g.beginPath();
    for (let px = L.x0; px <= X(tEnd); px += 1) {
      const t = (px - L.x0) / (L.x1 - L.x0) * tMax, yv = ym - trace(t, e) * amp;
      if (px === L.x0) g.moveTo(px, yv); else g.lineTo(px, yv);
    }
    g.lineWidth = 1.1; g.strokeStyle = D.alpha(C.text, 0.8); g.stroke();
    if (run) { g.strokeStyle = C.accent; g.lineWidth = 2; g.beginPath(); g.moveTo(X(Math.min(run.t, tMax)), L.y0); g.lineTo(X(Math.min(run.t, tMax)), L.y1); g.stroke(); }
    // 事件線
    const mark = function (t, col, txt, row) {
      if (!(t >= 0) || t > tMax) return;
      g.setLineDash([4, 3]); g.strokeStyle = col; g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(X(t), L.y0); g.lineTo(X(t), L.y1); g.stroke(); g.setLineDash([]);
      D.pill(g, txt, X(t), L.y1 - 6 - row * 20, col, X(t) > W - 80 ? 'right' : X(t) < 80 ? 'left' : 'center', '700 11px ' + FONT);
    };
    mark(e.tP, C['ew-p'], 'P ' + num(e.tP, 1), 0);
    if (s.issue) mark(s.Ta, C['ew-alert'], T('警報 ', 'Alert ') + num(s.Ta, 1), 1);
    if (state.onsite) mark(e.tP + E.T_ON, C['ew-on'], T('現地 ', 'On-site ') + num(e.tP + E.T_ON, 1), 2);
    mark(e.tS, C['ew-s'], 'S ' + num(e.tS, 1), 0);
    D.haloText(g, siteName() + T('：震央距離 ', ': ') + kmT(e.d) + T('', ' from the epicentre'), L.x0, 14, C.text, 'left', 'middle', '700 12px ' + FONT);
  }
  function drawSection(g, W, H) {
    const s = S(), e = siteInfo(), q = state.q, run = state.run;
    const L = { x0: 14, x1: W - 14, y0: 58, y1: H - 12 };
    const ox = 34;                                         // 震央離左邊界的距離（px），留給深度刻度
    // 深度方向要裝得下震源的 1.5 倍；水平方向至少 60 km、盲區的 1.5 倍；縱橫等比例（圓才是圓），多出來的空間往深處或遠處延伸
    const zNeed = Math.max(25, q.h * 1.5), dNeed = Math.max(60, s.rb * 1.5);
    const k = Math.min((L.x1 - L.x0 - ox) / dNeed, (L.y1 - L.y0) / zNeed);
    const dMax = (L.x1 - L.x0 - ox) / k, zMax = (L.y1 - L.y0) / k;
    const X = function (d) { return L.x0 + ox + d * k; }, Y = function (z) { return L.y0 + z * k; };
    // 地殼
    const crust = g.createLinearGradient(0, Y(0), 0, L.y1);
    crust.addColorStop(0, D.alpha(C['ew-land1'], 0.95)); crust.addColorStop(1, D.alpha(D.dark ? '#1a1410' : '#b9a47e', 0.95));
    g.fillStyle = crust; g.fillRect(L.x0, Y(0), L.x1 - L.x0, L.y1 - Y(0));
    g.strokeStyle = C['ew-coast']; g.lineWidth = 2; g.beginPath(); g.moveTo(L.x0, Y(0)); g.lineTo(L.x1, Y(0)); g.stroke();
    // 深度刻度（左邊）與距離刻度（地表上方）
    g.font = '600 10px ' + FONT; g.fillStyle = D.alpha(C.text, 0.7); g.textAlign = 'left'; g.textBaseline = 'middle';
    const zs = zMax > 120 ? 50 : zMax > 50 ? 20 : 10;
    for (let z = zs; z < zMax - 3; z += zs) { g.fillText(z + ' km', L.x0 + 3, Y(z)); g.strokeStyle = D.alpha(C.text, 0.12); g.beginPath(); g.moveTo(L.x0 + 30, Y(z)); g.lineTo(L.x0 + 36, Y(z)); g.stroke(); }
    // 時刻：跑動畫用目前時刻，不然用警報發布的時刻
    const t = run ? run.t : s.Ta;
    g.save();
    g.beginPath(); g.rect(L.x0, Y(0), L.x1 - L.x0, L.y1 - Y(0)); g.clip();
    const ring = function (v, col, w) {
      const r = v * t * k; if (r <= 0) return;
      g.beginPath(); g.arc(X(0), Y(q.h), r, 0, Math.PI * 2); g.lineWidth = w + 5; g.strokeStyle = D.alpha(col, 0.15); g.stroke();
      g.lineWidth = w; g.strokeStyle = col; g.stroke();
    };
    ring(E.VP, C['ew-p'], 2); ring(E.VS, C['ew-s'], 3);
    // 射線：震源到選定地點
    if (e.d <= dMax) { g.setLineDash([2, 4]); g.strokeStyle = D.alpha(C.accent, 0.7); g.lineWidth = 1.2; g.beginPath(); g.moveTo(X(0), Y(q.h)); g.lineTo(X(e.d), Y(0)); g.stroke(); g.setLineDash([]); }
    g.restore();
    // 盲區在地表的範圍（地表上方的紅條）
    if (s.rb > 0) {
      g.lineWidth = 6; g.strokeStyle = D.alpha(C['ew-blind'], 0.85); g.lineCap = 'round';
      g.beginPath(); g.moveTo(X(0), Y(0) - 4); g.lineTo(X(Math.min(s.rb, dMax)), Y(0) - 4); g.stroke(); g.lineCap = 'butt';
      D.pill(g, T('盲區 ', 'Blind zone ') + kmT(s.rb), X(Math.min(s.rb, dMax) / 2), Y(0) - 14, C['ew-blind'], 'center', '700 11px ' + FONT);
    }
    // 震源與震央
    g.setLineDash([3, 3]); g.strokeStyle = D.alpha(C.text, 0.4); g.lineWidth = 1; g.beginPath(); g.moveTo(X(0), Y(0)); g.lineTo(X(0), Y(q.h)); g.stroke(); g.setLineDash([]);
    star(g, X(0), Y(q.h), 9, C['ew-epi'], D.dark ? '#000' : '#7c4a03');
    D.pill(g, T('震源 深 ', 'Focus, ') + num(q.h, 1) + ' km', X(0) + 13, Y(q.h) + 4, C['ew-epi'], 'left', '700 11px ' + FONT);
    // 選定的地方（太遠時畫在右邊緣，加箭頭與距離）
    const far = e.d > dMax, sx = far ? L.x1 - 8 : X(e.d);
    g.beginPath(); g.moveTo(sx, Y(0) - 2); g.lineTo(sx - 6, Y(0) - 13); g.lineTo(sx + 6, Y(0) - 13); g.closePath(); g.fillStyle = C.accent; g.fill();
    D.pill(g, siteName() + (far ? ' ' + kmT(e.d) + ' →' : ''), sx, Y(0) - 30, C.accent, sx > W - 70 ? 'right' : sx < 70 ? 'left' : 'center', '700 11px ' + FONT);
    D.haloText(g, run ? 't = ' + num(t, 1) + T(' 秒', ' s') : T('警報發布那一刻（', 'When the alert is sent (') + sec(s.Ta) + T('）', ')'), L.x0, 14, C.text, 'left', 'middle', '700 12px ' + FONT);
    D.haloText(g, T('藍：P 波前　紅：S 波前', 'Blue: P front   Red: S front'), L.x1 - 4, L.y1 - 10, C.text, 'right', 'middle', '600 11px ' + FONT);
  }

  // =====================================================================
  // 動畫
  // =====================================================================
  let raf = 0, lastFrame = 0;
  function requestDraw() { if (!raf) raf = requestAnimationFrame(frame); }
  function frame(ts) {
    raf = 0;
    const run = state.run;
    if (run && run.playing) {
      const dt = lastFrame ? Math.min(0.1, (ts - lastFrame) / 1000) : 0;
      stepRun(dt * state.speed);
    }
    lastFrame = ts;
    drawMap(); drawChart();
    if (state.run && state.run.playing) requestDraw(); else lastFrame = 0;
  }
  function tEndOf() {
    const s = S();
    let m = siteInfo().tS;
    CITIES.forEach(function (c) { m = Math.max(m, s.site(c.x, c.y).tS); });
    return Math.min(150, Math.max(m, s.Ta) + 4);
  }
  function stepRun(dt) {
    const run = state.run, s = S(), e = siteInfo();
    const t0 = run.t, t1 = Math.min(run.tEnd, t0 + dt);
    run.t = t1;
    const snd = sound();
    if (t0 < s.tFirst && t1 >= s.tFirst && snd) snd.tone({ freq: 520, dur: 0.06, type: 'triangle', gain: 0.08 });
    if (!run.alarmed && t1 >= s.Ta) {
      run.alarmed = true;
      if (s.issue) {
        setStatus(T('警報發布！地震後 ', 'Alert! Sent ') + sec(s.Ta) + T('，盲區半徑 ', ' after the quake; blind zone ') + (s.rb > 0 ? kmT(s.rb) : T('0', '0 km')) + T('。', '.'));
        if (snd) for (let i = 0; i < 3; i++) { snd.tone({ freq: 880, dur: 0.16, type: 'square', gain: 0.07, delay: i * 0.38 }); snd.tone({ freq: 660, dur: 0.16, type: 'square', gain: 0.07, delay: i * 0.38 + 0.19 }); }
      } else setStatus(T('初報規模 ', 'The first estimate was M ') + num(s.Mest, 1) + T('，沒有達到發布標準，不發警報。', ', below the threshold: no alert.'));
      emit('alarm', snapshot());
    }
    if (!run.pDone && t1 >= e.tP) { run.pDone = true; if (snd) snd.tone({ freq: 400, dur: 0.12, type: 'sine', gain: 0.1 }); }
    if (!run.sDone && t1 >= e.tS) {
      run.sDone = true;
      if (snd) snd.noise({ filter: 420, q: 0.7, dur: 0.6 + 0.2 * Math.min(5, e.I), gain: 0.12 + 0.07 * Math.min(5, e.I) });
      setStatus(siteName() + T(' 開始搖晃（S 波抵達，', ' starts shaking (S wave at ') + sec(e.tS) + T('）：', '): ') + (e.best == null ? T('沒有收到警報。', 'no alert was received.') : e.best > 0 ? T('提早 ', 'warned ') + sec(e.best) + T(' 收到警報。', ' in advance.') : T('在盲區裡，警報晚了 ', 'inside the blind zone — the alert came ') + sec(-e.best) + T('。', ' late.')));
    }
    if (t1 >= run.tEnd) finishRun();
  }
  function startRun() {
    acted();
    if (state.run && state.run.playing) return;
    if (state.run && !state.run.done) { state.run.playing = true; updateButtons(); requestDraw(); return; }
    state.run = { t: 0, tEnd: tEndOf(), playing: true, alarmed: false, pDone: false, sDone: false, done: false };
    const snd = sound(); if (snd) snd.noise({ filter: 700, q: 0.6, dur: 0.25, gain: 0.2 });
    setStatus(T('地震發生！P 波（藍）與 S 波（紅）從震源向外傳。', 'Earthquake! The P wave (blue) and the S wave (red) spread out from the focus.'));
    updateButtons(); requestDraw();
  }
  function pauseRun() {
    if (!state.run || state.run.done) return;
    state.run.playing = !state.run.playing;
    updateButtons(); requestDraw();
  }
  function finishRun() {
    const run = state.run; run.playing = false; run.done = true;
    const s = S(), e = siteInfo();
    state.log.push({
      name: state.preset ? T(presetOf(state.preset).zh, presetOf(state.preset).en) : 'M ' + num(state.q.M, 1),
      h: state.q.h, sp: state.spacing, n: state.n, proc: state.proc, Ta: s.Ta, rb: s.rb, site: siteName(), best: e.best
    });
    if (state.log.length > 6) state.log.shift();
    updateLog(); updateButtons();
    emit('run', snapshot());
  }
  /** 參數改了：正在播放的動畫作廢 */
  function cancelRun() { if (state.run) { state.run = null; updateButtons(); } }

  // =====================================================================
  // 任務事件與音效
  // =====================================================================
  function emit(type, data) { if (state.acted && window.LabMission) window.LabMission.emit(type, data); }
  function acted() { state.acted = true; }
  function sound() { const L = window.LabSound; return L && L.enabled() ? L : null; }
  function pack(e, id) {
    return { id: id, d: e.d, R: e.R, tP: e.tP, tS: e.tS, sp: e.sp, pga: e.pga, I: e.I, Iest: e.Iest, alerted: e.alerted, lead: e.lead, leadOn: e.leadOn, best: e.best, blind: e.blind };
  }
  function snapshot() {
    const s = S(), q = state.q, ll = QC.toLonLat(q.x, q.y);
    let TaNoSea = s.Ta;
    if (state.sea) TaNoSea = E.alertTime(q, E.stations(state.spacing, false), state.n, state.proc).Ta;
    const cities = {};
    CITIES.forEach(function (c) { cities[c.id] = pack(s.site(c.x, c.y), c.id); });
    const sp = sitePos();
    return {
      preset: state.preset || '', M: q.M, dM: q.dM, Mest: s.Mest, h: q.h, lon: ll.lon, lat: ll.lat, x: q.x, y: q.y,
      spacing: state.spacing, n: state.n, proc: state.proc, onsite: state.onsite, sea: state.sea,
      Ta: s.Ta, tFirst: s.tFirst, TaNoSea: TaNoSea, rb: s.rb, rbOn: s.rbOn, rAlert: s.rAlert, r4: s.r4, r5: s.r5, issue: s.issue, nst: s.st.length,
      site: Object.assign(pack(siteInfo(), state.site), { x: sp.x, y: sp.y }), cities: cities, chart: state.chart
    };
  }
  let lastEmit = 0;
  function afterChange(force) {
    updateReadouts();
    const tNow = performance.now();
    if (force || tNow - lastEmit > 200) { lastEmit = tNow; emit('state', snapshot()); }
    requestDraw();
  }

  // =====================================================================
  // 讀數
  // =====================================================================
  function refreshOutputs() {
    setOut(el.mag, outNum(state.q.M, 1, 2));
    setOut(el.dep, outNum(state.q.h, 1, 1));
    setOut(el.spc, outNum(state.spacing, 0, 1));
    setOut(el.nst, String(state.n));
    setOut(el.proc, outNum(state.proc, 1, 1));
    setOut(el.dm, (state.q.dM > 0 ? '+' : '') + outNum(state.q.dM, 1, 2));
    $('onsiteBtn').setAttribute('aria-pressed', String(state.onsite));
    $('seaBtn').setAttribute('aria-pressed', String(state.sea));
    document.querySelectorAll('#quakeSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-q') === state.preset)); });
    document.querySelectorAll('#speedSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(+b.getAttribute('data-speed') === state.speed)); });
    document.querySelectorAll('#chartSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-chart') === state.chart)); });
  }
  function updateReadouts() {
    const s = S(), e = siteInfo(), q = state.q;
    setHTML('epiHint', T('震央 ', 'Epicentre ') + lonlatText(q.x, q.y) + (state.preset ? T('（', ' (') + T(presetOf(state.preset).zh, presetOf(state.preset).en) + T('）', ')') : '') + T('。拖曳地圖上的星星可以移動震央。', '. Drag the star on the map to move it.'));
    setHTML('rTa', s.issue ? T('地震後 ', '') + sec(s.Ta) + T('', ' after the quake') : T('不發布（初報 M ', 'None (first estimate M ') + num(s.Mest, 1) + T(' < 5）', ' < 5)'));
    setHTML('rRb', s.rb > 0 ? kmT(s.rb) : T('沒有盲區', 'no blind zone') + (state.onsite && s.rbOn > 0 ? '' : ''));
    setHTML('rAl', s.issue ? radiusText(s.rAlert) + T('（初報 M ', ' (first estimate M ') + num(s.Mest, 1) + T('）', ')') : '—');
    setHTML('rR4', radiusText(s.r4));
    setHTML('rNs', s.st.length + T(' 站（第 ', ' (the ') + state.n + T(' 站收到 P 波：', 'th P pick at ') + sec(s.tN) + T('）', ')'));
    // 這個地方
    const lead = $('lead');
    let cls = 'none', txt;
    if (e.best == null) txt = s.issue ? T('不在發警報的範圍內（預估 ', 'Outside the alert area (estimated ') + intText(e.Iest) + T('）', ')') : T('沒有發布警報', 'No alert was sent');
    else if (e.best > 0) { cls = 'ok'; txt = T('預警時間 ', 'Warning time ') + sec(e.best); }
    else { cls = 'bad'; txt = T('盲區：S 波比警報早 ', 'Blind zone: the S wave beats the alert by ') + sec(-e.best); }
    lead.className = 'lead-big ' + cls;
    if (lead.textContent !== txt) lead.textContent = txt;
    setHTML('sD', kmT(e.d) + ' ／ ' + kmT(e.R));
    setHTML('sP', sec(e.tP));
    setHTML('sS', sec(e.tS));
    setHTML('sSP', sec(e.sp));
    setHTML('sI', intText(e.I) + '<span style="color:var(--muted);font-weight:400">（PGA ' + num(e.pga, e.pga < 10 ? 1 : 0) + ' gal）</span>');
    setHTML('sIe', s.issue ? intText(e.Iest) + T('（初報 M ', ' (M ') + num(s.Mest, 1) + T('）', ')') + (e.alerted ? T('：發警報', ': alert sent') : T('：不發', ': no alert')) : T('不發布', 'no alert'));
    setHTML('sOn', state.onsite ? (e.leadOn > 0 ? T('提早 ', '') + sec(e.leadOn) + T('', ' early') : T('來不及（晚 ', 'too late (by ') + sec(-e.leadOn) + T('）', ')')) : T('沒有開啟', 'off'));
    updateChartHint();
    cv.setAttribute('aria-label', T('臺灣地圖。', 'Map of Taiwan. ') + T('震央 ', 'Epicentre ') + lonlatText(q.x, q.y) + T('，規模 ', ', M ') + num(q.M, 1) + T('，深 ', ', ') + num(q.h, 1) + T(' km；警報在地震後 ', ' km deep; alert at ') + sec(s.Ta) + T(' 發布，盲區半徑 ', ', blind zone ') + kmT(s.rb) + T('；', '; ') + siteName() + T('：', ': ') + txt);
  }
  function updateChartHint() {
    setHTML('chartHint', state.chart === 'time'
      ? T('這是選定地點的地震紀錄（示意的波形）：藍線 P 波抵達、橘線警報發布、紅線 S 波抵達。綠色的帶就是預警時間；紅色的帶代表 S 波比警報先到。', 'The record at the chosen place (schematic waveform): blue, the P wave arrives; orange, the alert; red, the S wave. The green band is the warning time; a red band means the S wave came before the alert.')
      : T('從震源往選定地點方向切開的剖面（縱橫等比例）。沒有播放時畫的是警報發布那一刻：紅色的 S 波前碰到地面的地方，就是盲區的邊界。把地震放深看看。', 'A vertical slice from the focus towards the chosen place (true proportions). When not playing it shows the moment the alert is sent: where the red S front touches the ground is the edge of the blind zone. Try a deeper earthquake.'));
  }
  function updateLog() {
    if (!state.log.length) { setHTML('runlog', T('每按一次「發生地震」，結果會記在這裡，方便比較。', 'Each time you press “Earthquake!”, the result is kept here so you can compare.')); return; }
    setHTML('runlog', state.log.slice().reverse().map(function (r) {
      const b = r.best == null ? T('沒有警報', 'no alert') : r.best > 0 ? '+' + num(r.best, 1) + ' s' : T('盲區', 'blind') + ' ' + num(r.best, 1) + ' s';
      return '<b>' + r.name + '</b>' + T('・深 ', ' · ') + num(r.h, 1) + T(' km・站距 ', ' km · spacing ') + num(r.sp, 0) + T(' km・', ' km · ') + r.n + T(' 站・', ' stations · ') + num(r.proc, 1) + ' s → ' + T('警報 ', 'alert ') + num(r.Ta, 1) + T(' s、盲區 ', ' s, blind ') + num(r.rb, 0) + ' km、' + r.site + ' ' + b;
    }).join('<br>'));
  }
  function updateButtons() {
    const run = state.run;
    $('go').textContent = run && !run.done ? (run.playing ? T('播放中…', 'Running…') : T('繼續', 'Resume')) : run && run.done ? T('再震一次', 'Again') : T('發生地震', 'Earthquake!');
    $('pause').disabled = !run || run.done;
    $('pause').textContent = run && !run.playing && !run.done ? T('繼續', 'Resume') : T('暫停', 'Pause');
  }
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }
  function fillSites() {
    const sel = $('site'), cur = state.site;
    sel.innerHTML = '';
    CITIES.forEach(function (c) { const o = document.createElement('option'); o.value = c.id; o.textContent = T(c.zh, c.en); sel.appendChild(o); });
    const o = document.createElement('option'); o.value = 'custom'; o.textContent = T('地圖上點的地方', 'The point you tapped'); o.disabled = !state.custom; sel.appendChild(o);
    sel.value = cur;
  }

  // =====================================================================
  // 控制項
  // =====================================================================
  function setSlider(inp, v) { if (window.LabNum) window.LabNum.set(inp, v); else inp.value = v; }
  function quakeChanged() { state.preset = ''; cancelRun(); }
  el.mag.addEventListener('input', function () { acted(); readSliders(); quakeChanged(); refreshOutputs(); afterChange(); });
  el.dep.addEventListener('input', function () { acted(); readSliders(); quakeChanged(); refreshOutputs(); afterChange(); });
  [el.spc, el.nst, el.proc, el.dm].forEach(function (inp) {
    inp.addEventListener('input', function () { acted(); readSliders(); cancelRun(); refreshOutputs(); afterChange(); });
  });
  ['mag', 'dep', 'spc', 'nst', 'proc', 'dm'].forEach(function (k) { el[k].addEventListener('change', function () { afterChange(true); }); });
  document.querySelectorAll('#quakeSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      acted(); cancelRun(); applyPreset(b.getAttribute('data-q')); readSliders();
      const p = presetOf(state.preset);
      setStatus(T(p.zh + '地震（' + p.date + '）：震央 ', 'The ' + p.en + ' earthquake (' + p.date + '): epicentre ') + num(p.lat, 2) + '°N、' + num(p.lon, 2) + '°E' + T('，深 ', ', ') + num(p.h, 1) + T(' km，ML ', ' km deep, ML ') + num(p.ML, 1) + T('（Mw 約 ', ' (Mw about ') + num(p.M, 1) + T('）。按「發生地震」看波怎麼傳。', '). Press “Earthquake!” to watch the waves.'));
      refreshOutputs(); afterChange(true);
    });
  });
  $('onsiteBtn').addEventListener('click', function () { acted(); state.onsite = !state.onsite; cancelRun(); refreshOutputs(); afterChange(true); });
  $('seaBtn').addEventListener('click', function () { acted(); state.sea = !state.sea; cancelRun(); refreshOutputs(); afterChange(true); });
  document.querySelectorAll('#speedSeg button').forEach(function (b) {
    b.addEventListener('click', function () { acted(); state.speed = +b.getAttribute('data-speed'); refreshOutputs(); });
  });
  document.querySelectorAll('#chartSeg button').forEach(function (b) {
    b.addEventListener('click', function () { acted(); state.chart = b.getAttribute('data-chart'); refreshOutputs(); updateChartHint(); afterChange(true); });
  });
  $('site').addEventListener('change', function () { acted(); state.site = $('site').value; if (state.run && state.run.done) state.run = null; updateButtons(); afterChange(true); });
  $('go').addEventListener('click', startRun);
  $('pause').addEventListener('click', function () { acted(); pauseRun(); });
  $('clear').addEventListener('click', function () {
    state.log = []; state.run = null;
    updateLog(); updateButtons();
    setStatus(T('已清除比較紀錄。', 'Comparison log cleared.'));
    afterChange(true);
  });
  $('soundBtn').addEventListener('click', function () {
    const on = !(window.LabSettings && window.LabSettings.get('sound'));
    if (window.LabSettings) window.LabSettings.set('sound', on);
    updateSoundButton();
  });
  window.addEventListener('lab:settingschange', function (ev) { if (ev.detail && ev.detail.name === 'sound') updateSoundButton(); });

  // ---------- 地圖：拖曳震央、點選地點 ----------
  let dragging = false;
  function cvPos(ev) { const r = cv.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; }
  function clampEpi(x, y) {
    return { x: Math.max(M.bx0 + 2, Math.min(M.bx1 - 2, x)), y: Math.max(M.by0 + 2, Math.min(M.by1 - 2, y)) };
  }
  function moveEpi(x, y) {
    const p = clampEpi(x, y);
    state.q.x = Math.round(p.x * 10) / 10; state.q.y = Math.round(p.y * 10) / 10;
    quakeChanged(); refreshOutputs(); afterChange();
  }
  cv.addEventListener('pointerdown', function (ev) {
    if (ev.button !== 0 || !M) return;
    acted();
    const p = cvPos(ev), X0 = M.px(state.q.x), Y0 = M.py(state.q.y);
    if (Math.hypot(p[0] - X0, p[1] - Y0) <= 26) {
      dragging = true;
      try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
      return;
    }
    // 點城市或任何一點
    let best = null, bd = 20;
    CITIES.forEach(function (c) { const d = Math.hypot(p[0] - M.px(c.x), p[1] - M.py(c.y)); if (d < bd) { bd = d; best = c; } });
    if (best) state.site = best.id;
    else { state.custom = { x: M.kx(p[0]), y: M.ky(p[1]) }; state.site = 'custom'; }
    fillSites();
    if (state.run && state.run.done) state.run = null;
    updateButtons();
    afterChange(true);
  });
  cv.addEventListener('pointermove', function (ev) {
    if (!dragging) { const p = cvPos(ev); if (M) cv.style.cursor = Math.hypot(p[0] - M.px(state.q.x), p[1] - M.py(state.q.y)) <= 26 ? 'grab' : 'crosshair'; return; }
    const p = cvPos(ev);
    moveEpi(M.kx(p[0]), M.ky(p[1]));
  });
  function endDrag() { if (dragging) { dragging = false; setStatus(T('震央移到 ', 'Epicentre moved to ') + lonlatText(state.q.x, state.q.y) + T('。', '.')); afterChange(true); } }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);

  // ---------- 鍵盤 ----------
  let kb = null;
  if (window.LabKeys) {
    kb = window.LabKeys.attach(cv, {
      label: T('臺灣地圖。方向鍵移動震央（按住 Shift 移動較多）；Enter 或空白鍵切換到選定的地點。', 'Map of Taiwan. Arrow keys move the epicentre (hold Shift for bigger steps); Enter or Space switches to the chosen place.'),
      items: [{
        name: function () { return T('震央', 'Epicentre'); },
        move: function (dx, dy, big) { if (!dx && !dy) return false; acted(); const k = big ? 10 : 2; moveEpi(state.q.x + dx * k, state.q.y - dy * k); return true; },
        describe: function () { return T('震央 ', 'Epicentre ') + lonlatText(state.q.x, state.q.y) + T('，盲區半徑 ', ', blind zone ') + kmT(S().rb); }
      }, {
        name: function () { return T('選定的地點', 'Chosen place'); },
        move: function (dx, dy, big) {
          if (!dx && !dy) return false;
          acted();
          const p = sitePos(), k = big ? 10 : 2;
          state.custom = { x: p.x + dx * k, y: p.y - dy * k }; state.site = 'custom'; fillSites(); afterChange();
          return true;
        },
        describe: function () { const e = siteInfo(); return siteName() + T('，震央距離 ', ', ') + kmT(e.d) + T('，', ', ') + (e.best == null ? T('沒有警報', 'no alert') : e.best > 0 ? T('預警時間 ', 'warning ') + sec(e.best) : T('在盲區裡', 'inside the blind zone')); }
      }],
      onChange: function () { requestDraw(); }
    });
  }

  // =====================================================================
  // 啟動
  // =====================================================================
  readColors();
  applyPreset('hualien2024');
  readSliders();
  fillSites();
  refreshOutputs();
  updateButtons();
  updateSoundButton();
  updateLog();
  updateReadouts();
  function themeChanged() {
    readColors(); baseKey = '';
    fillSites(); updateButtons(); updateSoundButton(); updateReadouts(); updateLog();
    requestDraw();
  }
  const dm = window.matchMedia('(prefers-color-scheme: dark)');
  if (dm.addEventListener) dm.addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  if (window.ResizeObserver) {
    let lw = 0, lh = 0, gw = 0;
    new ResizeObserver(function () {
      if (cv.clientWidth !== lw || cv.clientHeight !== lh || gr.clientWidth !== gw) { lw = cv.clientWidth; lh = cv.clientHeight; gw = gr.clientWidth; if (gw > 0) resizeCv(); }
    }).observe(stage);
  } else window.addEventListener('resize', resizeCv);
  resizeCv();
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { lastFrame = 0; requestDraw(); } });
  setStatus(T('2024 年 4 月 3 日花蓮地震（ML 7.2）。按「發生地震」，看警報和 S 波誰先到。', 'The Hualien earthquake of 3 April 2024 (ML 7.2). Press “Earthquake!” and see which comes first: the alert or the S wave.'));
  requestDraw();
  // 測試用（Playwright）
  window.__ew = {
    state: state, E: E, S: S, snapshot: snapshot, siteInfo: siteInfo,
    moveEpi: function (lon, lat) { acted(); const p = QC.toXY(lon, lat); moveEpi(p.x, p.y); afterChange(true); },
    setSite: function (id) { acted(); state.site = id; fillSites(); afterChange(true); },
    finish: function () { if (!state.run) startRun(); stepRun(1e6); requestDraw(); },
    step: function (sec) { if (state.run) { stepRun(sec); requestDraw(); } }
  };
})();
