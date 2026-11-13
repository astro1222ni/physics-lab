/*
 * metal-activity.js — 「金屬活性序」的頁面程式（試管架畫面、操作、圖表、觀察紀錄、排序推理、任務事件）
 * 化學核心在 js/metal-activity-core.js（MetalCore）；3D 金屬表面檢視在 js/metal-activity-3d.js（MetalAct3D）。
 * 畫面上的析出物、氣泡、沉澱、顏色都由核心算出的量決定大小與濃淡；個別氣泡、晶枝的位置只是示意。
 *
 * 任務事件（只在使用者操作過之後送出；開頁時的示範試管不送）：
 *   'observe'：一支試管觀察完畢（反應完成 99% 或滿 20 分鐘）{ rec, recs（這一段所有已觀察、非示範的試管）, tubes, revealed }
 *   'rank'：按「核對排序」{ order, ok, supported, conflicts, n, hasXYZ, tubes, unkTubes, revealed }
 */
(function () {
  'use strict';
  const MC = window.MetalCore, LD = window.LabDraw;
  if (!MC || !LD) return;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const reducedMotion = LD.reducedMotion();
  const FONT = LD.FONT;

  // ======================= 數字格式 =======================
  function num(x, d) {
    if (x == null || !isFinite(x)) return '—';
    const s = (+x).toFixed(d == null ? 0 : d);
    return s.charAt(0) === '-' ? (/^-0(\.0*)?$/.test(s) ? s.slice(1) : '−' + s.slice(1)) : s;
  }
  function sciParts(x, sig) {
    if (x == null || !isFinite(x) || x === 0) return { m: x === 0 ? '0' : '—', e: null };
    const e = Math.floor(Math.log10(Math.abs(x)));
    if (e >= -2 && e < 4) return { m: num(x, Math.max(0, (sig || 3) - 1 - e)), e: null };
    const m = x / Math.pow(10, e);
    if (Math.abs(+m.toFixed((sig || 3) - 1)) >= 10) return sciParts(Math.sign(x) * Math.pow(10, e + 1), sig);
    return { m: num(m, (sig || 3) - 1), e: e };
  }
  function sciHTML(x, sig) {
    const p = sciParts(x, sig);
    return p.e == null ? p.m : p.m + ' × 10<sup>' + num(p.e, 0) + '</sup>';
  }
  /** 10 的 logK 次方（可能大到 10^200）：直接用指數寫 */
  function powHTML(logK) {
    if (logK == null || !isFinite(logK)) return '—';
    if (logK > -3 && logK < 4) return sciHTML(Math.pow(10, logK), 3);
    const e = Math.floor(logK), m = Math.pow(10, logK - e);
    const mm = +m.toFixed(1);
    return mm >= 10 ? '1.0 × 10<sup>' + num(e + 1, 0) + '</sup>' : num(mm, 1) + ' × 10<sup>' + num(e, 0) + '</sup>';
  }
  function sigf(x, sig) {
    if (x == null || !isFinite(x)) return '—';
    if (x === 0) return '0';
    const e = Math.floor(Math.log10(Math.abs(x)));
    return num(x, Math.max(0, Math.min(6, (sig || 3) - 1 - e)));
  }
  function concHTML(x) { return x < 1e-4 && x > 0 ? sciHTML(x, 2) : x === 0 ? '0' : sigf(x, 3); }

  // ======================= 化學式 =======================
  /** 化學式的小標記：數字接在字母或右括號後面是下標；'^' 之後（到空白為止）是上標。例：'Cu^2+'、'Cu(OH)2'、'2Ag^+' */
  function chemTokens(s) {
    const out = [];
    let i = 0, buf = '';
    const flush = function () { if (buf) { out.push([buf, 0]); buf = ''; } };
    while (i < s.length) {
      const ch = s.charAt(i);
      if (ch === '^') {
        flush();
        let j = i + 1, sup = '';
        while (j < s.length && s.charAt(j) !== ' ') { sup += s.charAt(j); j++; }
        out.push([sup.replace(/-/g, '−'), 1]);
        i = j;
        continue;
      }
      if (/\d/.test(ch) && i > 0 && /[A-Za-z)]/.test(s.charAt(i - 1))) {
        flush();
        let j = i, sub = '';
        while (j < s.length && /\d/.test(s.charAt(j))) { sub += s.charAt(j); j++; }
        out.push([sub, -1]);
        i = j;
        continue;
      }
      buf += ch; i++;
    }
    flush();
    return out;
  }
  function chemHTML(s) {
    return chemTokens(s).map(function (t) { return t[1] > 0 ? '<sup>' + t[0] + '</sup>' : t[1] < 0 ? '<sub>' + t[0] + '</sub>' : t[0]; }).join('');
  }
  /** 畫布上的化學式（自己畫上下標，不用 Unicode 上標字元）；傳回寬度 */
  function chemText(ctx, s, x, y, opts) {
    opts = opts || {};
    const px = opts.px || 12, weight = opts.weight || '600';
    const fN = weight + ' ' + px + 'px ' + FONT, fS = weight + ' ' + (px * 0.7).toFixed(1) + 'px ' + FONT;
    const toks = chemTokens(s);
    let w = 0;
    toks.forEach(function (t) { ctx.font = t[1] ? fS : fN; w += ctx.measureText(t[0]).width + (t[1] ? 0.5 : 0); });
    if (opts.measure) return w;
    let cx = opts.align === 'center' ? x - w / 2 : opts.align === 'right' ? x - w : x;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    toks.forEach(function (t) {
      ctx.font = t[1] ? fS : fN;
      const yy = t[1] > 0 ? y - px * 0.42 : t[1] < 0 ? y + px * 0.22 : y;
      if (opts.halo !== false) { ctx.lineWidth = 3.5; ctx.strokeStyle = LD.alpha(col.bg, 0.9); ctx.strokeText(t[0], cx, yy); }
      ctx.fillStyle = opts.color || col.text;
      ctx.fillText(t[0], cx, yy);
      cx += ctx.measureText(t[0]).width + (t[1] ? 0.5 : 0);
    });
    return w;
  }

  // ======================= 物種資料（顏色是物質本身的顏色） =======================
  const NAME = {
    K: ['鉀', 'potassium'], Ca: ['鈣', 'calcium'], Na: ['鈉', 'sodium'], Mg: ['鎂', 'magnesium'], Al: ['鋁', 'aluminium'], Zn: ['鋅', 'zinc'],
    Fe: ['鐵', 'iron'], Sn: ['錫', 'tin'], Pb: ['鉛', 'lead'], Cu: ['銅', 'copper'], Ag: ['銀', 'silver'], X: ['金屬 X', 'metal X'], Y: ['金屬 Y', 'metal Y'], Z: ['金屬 Z', 'metal Z'], H: ['氫', 'hydrogen']
  };
  function nm(s) { return T(NAME[s][0], NAME[s][1]); }
  const METAL_COL = { K: '#cbc4b4', Ca: '#d8d5cb', Na: '#d4d1c6', Mg: '#c3c8cf', Al: '#d2d7dd', Zn: '#9eaab7', Fe: '#6e747c', Sn: '#cacdd1', Pb: '#78818d', Cu: '#c7733a', Ag: '#e3e5e9', X: '#8d9fb7', Y: '#b7a38d', Z: '#92ac96' };
  const DEP_COL = { Cu: '#a24d28', Ag: '#bfc4cb', Pb: '#5c6470', Sn: '#9ba2a9', Fe: '#2d3034', Zn: '#4d545c', Al: '#7c828a', Mg: '#8a8f96', X: '#5d6e86', Y: '#85715c', Z: '#62806a' };
  const DEP_STYLE = { Ag: 'tree', Pb: 'tree', Sn: 'needle', Cu: 'sponge' };
  const PPT_COL = { CuOH2: '#7db4e4', FeOH2: '#c3d5b3', Ag2O: '#4a3a2e', AgCl: '#f2f2ef', PbCl2: '#efefea' };
  const PPT_NAME = { CuOH2: 'Cu(OH)2', FeOH2: 'Fe(OH)2', Ag2O: 'Ag2O', AgCl: 'AgCl', PbCl2: 'PbCl2', MgOH2: 'Mg(OH)2', CaOH2: 'Ca(OH)2',
    ZnOH2: 'Zn(OH)2', AlOH3: 'Al(OH)3', SnOH2: 'Sn(OH)2', PbOH2: 'Pb(OH)2', XOH2: 'X(OH)2', YOH2: 'Y(OH)2', ZOH2: 'Z(OH)2' };
  function ionStr(s) { const z = MC.METALS[s].z; return s + '^' + (z === 1 ? '+' : z + '+'); }
  function liqStr(l) { return l === 'H2O' ? 'H2O' : l === 'HCl' ? 'HCl' : ionStr(l); }
  function liqName(l) { return l === 'H2O' ? T('純水', 'water') : l === 'HCl' ? T('稀鹽酸', 'dilute HCl') : T(NAME[l][0] + '離子', NAME[l][1] + ' ions'); }
  const SPEEDS = [1, 10, 100];
  const RACK = 6;

  // ======================= 顏色 =======================
  let col = {};
  function readColors() {
    if (LD.refresh) LD.refresh();
    const c = LD.c;
    col = { bg: c['canvas-bg'], text: c.text, muted: c.muted, border: c.border, accent: c.accent, probe: c.probe, pos: c.pos, neg: c.neg, field: c.field, grid: c.grid, dark: LD.dark };
    col.wood = col.dark ? '#7a5838' : '#c2925f';
    col.water = col.dark ? 'rgba(150,180,205,0.14)' : 'rgba(205,222,232,0.30)';
    col.glass = col.dark ? 'rgba(200,220,240,0.55)' : 'rgba(90,110,130,0.55)';
  }

  // ======================= 狀態 =======================
  const state = { metal: 'Fe', liq: 'Cu', c: 0.1, T: 25, salt: false, phph: false, unknown: false, speed: 1, running: !reducedMotion, tab: 'conc', view: '2d' };
  const env = { unk: null };
  let revealed = false;
  let rack = [];           // 試管架上的試管（最多 6 支）
  let recs = [];           // 這一段實驗的觀察紀錄（含示範試管）
  let segTubes = 0, unkTubes = 0, nextId = 1;
  let selected = null;
  let order = [];
  let acted = false;
  let view3 = null;
  let lastRank = null;

  const cv = $('cv'), ctx = cv.getContext('2d'), gcv = $('gcv'), gctx = gcv.getContext('2d');
  const elC = $('conc'), elT = $('temp');
  const LOGC0 = Math.log10(0.01), LOGC1 = Math.log10(2);
  const cFromPos = function (p) { return Math.pow(10, LOGC0 + (p / 1000) * (LOGC1 - LOGC0)); };
  const posFromC = function (c) { return (Math.log10(c) - LOGC0) / (LOGC1 - LOGC0) * 1000; };
  if (window.LabNum) window.LabNum.register(elC, { toValue: cFromPos, toPos: posFromC, min: 0.01, max: 2, decimals: 3 });
  function val(el) { return window.LabNum ? window.LabNum.value(el) : (el === elC ? cFromPos(+el.value) : +el.value); }
  function setStatus(html) { $('status').innerHTML = html || ''; }

  // ======================= 試管 =======================
  let seedCounter = 17;
  function rng(seed) { let a = seed % 2147483647; if (a <= 0) a += 2147483646; return function () { a = (a * 16807) % 2147483647; return (a - 1) / 2147483646; }; }
  /** 每支試管固定的示意幾何（晶枝、斑點、氣泡起點），只由種子決定，大小再依量縮放 */
  function makeGeo(seed) {
    const r = rng(seed * 7919 + 13);
    const pts = [], branches = [], flakes = [], pits = [], flocs = [];
    for (let i = 0; i < 90; i++) pts.push([r(), r(), r(), r()]);
    for (let i = 0; i < 16; i++) {
      const side = i % 2 ? 1 : -1, yy = 0.06 + 0.88 * r();
      const ang = side * (0.35 + 0.9 * r()) + (r() - 0.5) * 0.4, len = 0.45 + 0.55 * r();
      const subs = [];
      const ns = 2 + Math.floor(r() * 3);
      for (let k = 0; k < ns; k++) subs.push([0.25 + 0.6 * r(), (r() < 0.5 ? -1 : 1) * (0.4 + 0.5 * r()), 0.3 + 0.4 * r()]);
      branches.push({ side: side, y: yy, ang: ang, len: len, subs: subs });
    }
    for (let i = 0; i < 40; i++) flakes.push([r(), r(), r()]);
    for (let i = 0; i < 14; i++) pits.push([r(), r(), r()]);
    for (let i = 0; i < 40; i++) flocs.push([r(), r(), r(), r()]);
    return { pts: pts, branches: branches, flakes: flakes, pits: pits, flocs: flocs, phase: r() * 6.28, rnd: r };
  }
  function makeTube(tb, id, demo) {
    return { tb: tb, id: id, demo: demo, t: 0, done: false, rec: null, phph: demo ? false : state.phph, geo: makeGeo(seedCounter++), bubbles: [], spawnAcc: 0,
      cur: MC.at(tb, 0), depSounded: false, flame: 0 };
  }
  function addDemo() {
    const tb = MC.createTube({ metal: 'Fe', liquid: 'Cu', c: 0.1, T: 25, salt: false }, env);
    const tu = makeTube(tb, 0, true);
    tu.t = reducedMotion ? 0 : 0;
    rack.push(tu);
    selected = tu;
  }
  function insert() {
    acted = true;
    const tb = MC.createTube({ metal: state.metal, liquid: state.liq, c: state.c, T: state.T, salt: state.salt }, env);
    let note = '';
    if (rack.length >= RACK) {
      const old = rack.shift();
      note = old.done ? '' : old.demo ? T('（示範試管還沒觀察完就被換掉了）', ' (the demo tube was replaced before its observation finished)') : T('（第 ' + old.id + ' 支還沒觀察完就被換掉了）', ' (tube ' + old.id + ' was replaced before its observation finished)');
    }
    const tu = makeTube(tb, nextId++, false);
    rack.push(tu);
    segTubes++;
    if (tb.unk) unkTubes++;
    selected = tu;
    snd('insert');
    setStatus(T('放入第 ' + tu.id + ' 支試管：', 'Tube ' + tu.id + ': ') + descTube(tb) + note +
      (state.running ? '' : T('　目前暫停中，按「播放」開始觀察。', ' — paused; press “Play” to start observing.')));
    startLoop();
    refreshAll();
  }
  function descTube(tb) {
    const what = T(nm(tb.metal) + (MC.METALS[tb.metal].alk ? '' : '片') + ' → ', nm(tb.metal) + ' → ') + chemHTML(liqStr(tb.liquid));
    const cond = (tb.kind === 'water' ? '' : sigf(tb.c, 3) + ' mol/L、'.replace('、', T('、', ', '))) + num(tb.T, 0) + ' °C' + (tb.salt ? T('、加鹽', ', salt') : '');
    return what + T('（', ' (') + cond + T('）', ')');
  }
  function record(tu) {
    tu.done = true;
    tu.t = tu.tb.tRec;
    tu.cur = MC.at(tu.tb, tu.t);
    const rec = Object.assign(MC.observe(tu.tb), { id: tu.id, demo: tu.demo, phph: tu.phph });
    tu.rec = rec;
    recs.push(rec);
    snd(rec.reacted ? 'done' : 'none');
    if (!tu.demo && acted && window.LabMission) {
      window.LabMission.emit('observe', { rec: rec, recs: recs.filter(function (r) { return !r.demo; }), tubes: segTubes, revealed: revealed });
    }
    updateTable();
    updateMatrix();
    updateChips();
  }
  function clearAll(msg) {
    rack = []; recs = []; segTubes = 0; unkTubes = 0; order = []; selected = null; lastRank = null;
    $('rankOut').innerHTML = '';
    setStatus(msg || T('已清空試管架、觀察紀錄與排序。', 'The rack, the record table and the ranking have been cleared.'));
    refreshAll();
  }

  // ======================= 主迴圈（整頁只有這一條 requestAnimationFrame） =======================
  let raf = 0, lastTs = 0, lastRead = 0, lastGraph = 0, lastBubbleSnd = 0;
  function startLoop() { if (!raf) { lastTs = 0; raf = requestAnimationFrame(loop); } }
  function loop(ts) {
    raf = 0;
    const dtw = lastTs ? Math.min(0.1, (ts - lastTs) / 1000) : 0;
    lastTs = ts;
    if (dtw > 0) advance(dtw);
    if (state.view !== '3d') drawRack();
    if (view3 && view3.active) view3.frame();
    const now = performance.now();
    if (now - lastRead > 250) { lastRead = now; updateReadouts(); }
    if (now - lastGraph > 300) { lastGraph = now; drawGraph(); }
    if (state.running || anyBubbles()) raf = requestAnimationFrame(loop);
  }
  function anyBubbles() { return rack.some(function (tu) { return tu.bubbles.length > 0; }); }
  function advance(dtw) {
    const sp = SPEEDS[state.speed];
    rack.forEach(function (tu) {
      if (state.running && !tu.done) {
        tu.t = Math.min(tu.tb.tRec, tu.t + dtw * sp);
        tu.cur = MC.at(tu.tb, tu.t);
        if (!tu.depSounded && tu.cur.depMg >= 3) { tu.depSounded = true; if (tu === selected) snd('deposit'); }
        if (tu.t >= tu.tb.tRec - 1e-9) record(tu);
      }
      animateBubbles(tu, dtw, sp);
    });
  }
  /** 氣泡：產生速率依核心的產氣速率（mL/s）× 時間倍率；個別氣泡位置是示意 */
  function gasRate(tu) {
    if (tu.done || !state.running) return 0;
    const tb = tu.tb;
    if (tb.type !== 'acid' && tb.type !== 'water') return 0;
    return MC.rate(tb, tu.t) / 2 * MC.VM;    // mL/s（模擬時間）
  }
  function animateBubbles(tu, dtw, sp) {
    const g = tu.g;
    if (!g) return;
    const rate = gasRate(tu) * sp;
    if (rate > 0 && !reducedMotion) {
      const perSec = Math.min(70, 26 * Math.pow(rate, 0.6));
      tu.spawnAcc += perSec * dtw;
      while (tu.spawnAcc >= 1) {
        tu.spawnAcc -= 1;
        const r = tu.geo.rnd;
        const src = metalSpot(tu, g, r);
        if (tu.bubbles.length < 60) tu.bubbles.push({ x: src[0], y: src[1], r: (0.9 + 1.6 * r()) * Math.min(1.3, g.tw / 40) * (rate > 2 ? 1.3 : 1), vy: 26 + 30 * r(), ph: r() * 6.28 });
      }
      if (tu === selected || rack.length <= 2) {
        const now = performance.now();
        if (now - lastBubbleSnd > Math.max(45, 260 - perSec * 4)) { lastBubbleSnd = now; snd('bubble'); }
      }
    }
    for (let i = tu.bubbles.length - 1; i >= 0; i--) {
      const b = tu.bubbles[i];
      b.y -= b.vy * dtw * (1 + b.r * 0.08);
      b.ph += dtw * 6;
      b.vy = Math.min(90, b.vy + 20 * dtw);
      if (b.y <= g.liqTop + 1) tu.bubbles.splice(i, 1);
    }
  }
  /** 氣泡從金屬表面冒出的位置（相對畫布） */
  function metalSpot(tu, g, r) {
    const tb = tu.tb, alk = MC.METALS[tb.metal].alk;
    if (alk) { const L = lumpPos(tu, g, performance.now()); return [L[0] + (r() - 0.5) * L[2] * 1.6, L[1] + (r() - 0.3) * L[2]]; }
    const S = stripGeo(tu, g);
    return [S.cx + (r() - 0.5) * (S.w + 3), S.y1 - r() * S.h];
  }

  // ======================= 版面 =======================
  let W = 0, H = 0, cols = 6, rowH = 380;
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = cv.clientWidth || 600;
    cols = W < 560 ? 3 : 6;
    const rows = RACK / cols;
    rowH = rows === 1 ? 380 : Math.max(270, Math.min(320, W * 0.78));
    H = rowH * rows;
    cv.style.height = H + 'px';
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    rack.forEach(function (tu) { tu.bubbles = []; });
    resizeGraph();
    drawRack();
    drawGraph();
  }
  function slotGeo(i) {
    const col_ = i % cols, row = Math.floor(i / cols);
    const cw = (W - 16) / cols;
    const cx = 8 + cw * (col_ + 0.5);
    const top0 = row * rowH;
    const baseY = top0 + rowH - 62;
    const tw = Math.max(28, Math.min(48, cw * 0.4));
    const th = Math.min(rowH - 96, 250);
    const bot = baseY - 6, top = bot - th, r = tw / 2;
    return { i: i, cx: cx, cw: cw, top0: top0, baseY: baseY, tw: tw, th: th, bot: bot, top: top, r: r, liqTop: bot - th * 0.64, boardY: top + th * 0.2 };
  }
  function stripGeo(tu, g) {
    const f = tu.cur.metalFrac;
    const sh0 = (g.bot - g.liqTop) * 0.74, sw0 = g.tw * 0.34;
    const w = sw0 * Math.sqrt(Math.max(0, f)), h = sh0 * (0.55 + 0.45 * Math.max(0, f));
    const y1 = g.bot - g.r * 0.4;
    return { cx: g.cx - g.r * 0.12, w: w, h: h, w0: sw0, h0: sh0, y1: y1, y0: y1 - h, f: f, tilt: -0.05 };
  }
  function lumpPos(tu, g, now) {
    const tb = tu.tb, f = tu.cur.metalFrac;
    const rr = Math.max(0, g.tw * 0.2 * Math.cbrt(Math.max(0, f)));
    const active = !tu.done && f > 0.005 && state.running;
    if (tb.metal === 'Ca') return [g.cx, g.bot - g.r * 0.45 - rr * 0.3, rr];
    const wob = active && !reducedMotion ? Math.sin(now / 1000 * (tb.metal === 'K' ? 5.3 : 3.1) + tu.geo.phase) * g.r * 0.45 : 0;
    return [g.cx + wob, g.liqTop + rr * 0.35, rr];
  }

  // ======================= 2D 繪圖：試管架 =======================
  function drawRack() {
    if (!W) return;
    ctx.clearRect(0, 0, W, H);
    LD.backdrop(ctx, W, H);
    const rows = RACK / cols;
    const now = performance.now();
    for (let row = 0; row < rows; row++) drawRackFrame(row, 'back');
    for (let i = 0; i < RACK; i++) {
      const g = slotGeo(i);
      const tu = rack[i];
      if (tu) { tu.g = g; drawTube(tu, g, now); }
      else drawEmptySlot(g);
    }
    for (let row = 0; row < rows; row++) drawRackFrame(row, 'front');
    for (let i = 0; i < RACK; i++) {
      const g = slotGeo(i), tu = rack[i];
      if (tu) { drawAbove(tu, g, now); drawLabel(tu, g); }
    }
    if (!rack.length) {
      const g = slotGeo(0);
      LD.pill(ctx, T('選金屬與液體，按「放入試管」', 'Choose a metal and a liquid, then press “Put in a tube”'), W / 2, g.top0 + 36, col.muted, 'center');
    }
  }
  function drawRackFrame(row, layer) {
    const g0 = slotGeo(row * cols), gl = slotGeo(row * cols + cols - 1);
    const x0 = g0.cx - g0.cw / 2 + 6, x1 = gl.cx + gl.cw / 2 - 6;
    const wood = col.wood;
    if (layer === 'back') {
      // 側柱
      [x0, x1 - 10].forEach(function (x) {
        const gr = ctx.createLinearGradient(x, 0, x + 10, 0);
        gr.addColorStop(0, LD.shade(wood, -0.15)); gr.addColorStop(0.5, LD.shade(wood, 0.12)); gr.addColorStop(1, LD.shade(wood, -0.25));
        ctx.fillStyle = gr;
        LD.roundRect(ctx, x, g0.boardY - 4, 10, g0.baseY - g0.boardY + 10, 3);
        ctx.fill();
      });
      // 底板（上面亮、前緣暗）
      const by = g0.baseY - 6;
      ctx.save();
      ctx.shadowColor = LD.shadowInk(col.dark ? 0.5 : 0.22); ctx.shadowBlur = 10; ctx.shadowOffsetY = 4;
      const gb = ctx.createLinearGradient(0, by, 0, by + 14);
      gb.addColorStop(0, LD.shade(wood, 0.18)); gb.addColorStop(0.45, wood); gb.addColorStop(1, LD.shade(wood, -0.3));
      ctx.fillStyle = gb;
      LD.roundRect(ctx, x0 - 6, by, x1 - x0 + 12, 14, 4);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = LD.alpha('#ffffff', col.dark ? 0.12 : 0.35);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x0 - 2, by + 1.5); ctx.lineTo(x1 + 2, by + 1.5); ctx.stroke();
    } else {
      // 上層板（有孔）：畫在試管前面，擋住一小段
      const y = g0.boardY, hB = 13;
      const gt = ctx.createLinearGradient(0, y, 0, y + hB);
      gt.addColorStop(0, LD.shade(wood, 0.22)); gt.addColorStop(0.35, wood); gt.addColorStop(1, LD.shade(wood, -0.32));
      ctx.save();
      ctx.shadowColor = LD.shadowInk(col.dark ? 0.45 : 0.18); ctx.shadowBlur = 6; ctx.shadowOffsetY = 3;
      ctx.fillStyle = gt;
      LD.roundRect(ctx, x0 - 6, y, x1 - x0 + 12, hB, 3);
      ctx.fill();
      ctx.restore();
      // 木紋
      ctx.strokeStyle = LD.alpha(LD.shade(wood, -0.4), 0.18);
      ctx.lineWidth = 1;
      for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(x0, y + 3.5 + k * 3.2); ctx.bezierCurveTo((x0 + x1) / 2, y + 2 + k * 3.6, (x0 + x1) / 2, y + 5 + k * 2.6, x1, y + 3.8 + k * 3); ctx.stroke(); }
      ctx.strokeStyle = LD.alpha('#ffffff', col.dark ? 0.14 : 0.4);
      ctx.beginPath(); ctx.moveTo(x0 - 3, y + 1); ctx.lineTo(x1 + 3, y + 1); ctx.stroke();
      for (let k = 0; k < cols; k++) {
        const g = slotGeo(row * cols + k);
        // 孔的上緣（橢圓，暗）
        ctx.fillStyle = LD.alpha('#000000', col.dark ? 0.35 : 0.22);
        ctx.beginPath(); ctx.ellipse(g.cx, y + 1.2, g.r + 3, 2.2, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  function drawEmptySlot(g) {
    ctx.save();
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = LD.alpha(col.muted, 0.35);
    ctx.lineWidth = 1;
    tubePath(g, 0);
    ctx.stroke();
    ctx.restore();
  }
  function tubePath(g, inset) {
    const r = g.r - inset;
    ctx.beginPath();
    ctx.moveTo(g.cx - r, g.top + inset);
    ctx.lineTo(g.cx - r, g.bot - g.r);
    ctx.arc(g.cx, g.bot - g.r, r, Math.PI, 0, true);
    ctx.lineTo(g.cx + r, g.top + inset);
  }
  function liquidColors(tu) {
    const s = tu.cur, L = [];
    const cu = s.ions.Cu || 0, fe = s.ions.Fe || 0;
    if (cu > 0) L.push(['#2f86d6', 1 - Math.exp(-cu * 9)]);
    if (fe > 0) L.push(['#86c060', 1 - Math.exp(-fe * 2.6)]);
    if (tu.phph && s.pH != null && s.pH >= 8.2) L.push(['#e0479a', Math.min(0.78, (s.pH - 8.2) / 1.6 * 0.78)]);
    let white = 0;
    s.ppt.forEach(function (p) { if (p.kind === 'MgOH2' || p.kind === 'CaOH2') white += p.mmol; });
    if (white > 0) L.push(['#f4f4f2', Math.min(0.42, 0.06 + white * 0.45)]);
    return L;
  }
  function drawTube(tu, g, now) {
    const s = tu.cur;
    LD.contactShadow(ctx, g.cx, g.bot + 1, g.r * 1.3, 0);
    // 試管內側（很淡的玻璃）
    tubePath(g, 0);
    ctx.fillStyle = col.dark ? 'rgba(200,220,240,0.05)' : 'rgba(255,255,255,0.35)';
    ctx.fill();
    ctx.save();
    tubePath(g, 1.4);
    ctx.closePath();
    ctx.clip();
    // 液體
    const lt = g.liqTop;
    ctx.fillStyle = col.water;
    ctx.fillRect(g.cx - g.r, lt, g.tw, g.bot - lt + 2);
    liquidColors(tu).forEach(function (c) { ctx.fillStyle = LD.alpha(c[0], c[1]); ctx.fillRect(g.cx - g.r, lt, g.tw, g.bot - lt + 2); });
    // 圓柱感：兩側暗、中間亮
    const gl = ctx.createLinearGradient(g.cx - g.r, 0, g.cx + g.r, 0);
    gl.addColorStop(0, 'rgba(0,0,0,' + (col.dark ? 0.28 : 0.16) + ')'); gl.addColorStop(0.35, 'rgba(255,255,255,0.10)'); gl.addColorStop(0.62, 'rgba(255,255,255,0)'); gl.addColorStop(1, 'rgba(0,0,0,' + (col.dark ? 0.32 : 0.2) + ')');
    ctx.fillStyle = gl;
    ctx.fillRect(g.cx - g.r, lt, g.tw, g.bot - lt + 2);
    drawSediment(tu, g);
    if (MC.METALS[tu.tb.metal].alk) drawLump(tu, g, now); else drawStrip(tu, g);
    drawFlocs(tu, g);
    // 氣泡
    tu.bubbles.forEach(function (b) {
      const x = b.x + Math.sin(b.ph) * 0.8;
      ctx.beginPath(); ctx.arc(x, b.y, b.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,' + (col.dark ? 0.16 : 0.28) + ')'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,' + (col.dark ? 0.55 : 0.8) + ')'; ctx.lineWidth = 0.8; ctx.stroke();
      ctx.beginPath(); ctx.arc(x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.3, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fill();
    });
    if (reducedMotion && gasRateStatic(tu) > 0) drawStaticBubbles(tu, g);
    // 彎月面（凹液面）：液面橢圓＋貼壁上翹
    ctx.beginPath(); ctx.ellipse(g.cx, lt, g.r - 1.2, Math.max(1.5, g.r * 0.2), 0, 0, Math.PI * 2);
    ctx.fillStyle = col.dark ? 'rgba(220,235,250,0.10)' : 'rgba(255,255,255,0.42)'; ctx.fill();
    ctx.strokeStyle = col.dark ? 'rgba(200,225,250,0.45)' : 'rgba(70,110,150,0.45)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
    // 玻璃外框與高光
    tubePath(g, 0);
    ctx.strokeStyle = col.glass; ctx.lineWidth = 1.4; ctx.stroke();
    const hx = g.cx - g.r * 0.62;
    const hg = ctx.createLinearGradient(hx, 0, hx + g.r * 0.26, 0);
    hg.addColorStop(0, 'rgba(255,255,255,0)'); hg.addColorStop(0.5, 'rgba(255,255,255,' + (col.dark ? 0.3 : 0.7) + ')'); hg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hg;
    LD.roundRect(ctx, hx, g.top + 8, g.r * 0.26, g.bot - g.r - g.top - 6, g.r * 0.13);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,' + (col.dark ? 0.25 : 0.12) + ')';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(g.cx + g.r * 0.72, g.top + 10); ctx.lineTo(g.cx + g.r * 0.72, g.bot - g.r); ctx.stroke();
    // 管口
    ctx.beginPath(); ctx.ellipse(g.cx, g.top, g.r + 1.6, Math.max(2, g.r * 0.24), 0, 0, Math.PI * 2);
    ctx.strokeStyle = col.glass; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.fillStyle = col.dark ? 'rgba(200,220,240,0.06)' : 'rgba(255,255,255,0.4)'; ctx.fill();
  }
  function gasRateStatic(tu) { const tb = tu.tb; return (tb.type === 'acid' || tb.type === 'water') && !tu.done && tu.t > 0 ? MC.rate(tb, tu.t) : 0; }
  function drawStaticBubbles(tu, g) {
    const r = rng(tu.id * 31 + 5);
    for (let k = 0; k < 10; k++) {
      const x = g.cx + (r() - 0.5) * g.tw * 0.7, y = g.liqTop + 6 + r() * (g.bot - g.liqTop - 14);
      ctx.beginPath(); ctx.arc(x, y, 1.2 + r() * 1.5, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 0.8; ctx.stroke();
    }
  }
  /** 底部沉積：掉落的析出物與沉澱（量由核心決定） */
  function drawSediment(tu, g) {
    const s = tu.cur;
    let y = g.bot - 1.5;
    s.ppt.forEach(function (p) {
      if (p.kind === 'MgOH2' || p.kind === 'CaOH2') return;
      const settle = Math.min(1, 0.25 + tu.t / 500);
      const h = Math.min(g.r * 1.7, Math.pow(p.mmol, 0.6) * g.r * 1.1) * settle;
      if (h < 0.4) return;
      const c = PPT_COL[p.kind] || '#eeeeea';
      const gr = ctx.createLinearGradient(0, y - h, 0, y);
      gr.addColorStop(0, LD.alpha(c, 0.75)); gr.addColorStop(1, LD.alpha(LD.shade(c, -0.15), 0.95));
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.moveTo(g.cx - g.r, y - h);
      for (let k = 0; k <= 8; k++) ctx.lineTo(g.cx - g.r + g.tw * k / 8, y - h + Math.sin(k * 1.7 + tu.geo.phase) * 0.9);
      ctx.lineTo(g.cx + g.r, g.bot + 2); ctx.lineTo(g.cx - g.r, g.bot + 2); ctx.closePath(); ctx.fill();
      y -= h * 0.8;
    });
    // 金屬片溶完後，析出物掉在底部
    if (s.dep > 0 && s.metalFrac < 0.25) {
      const c = DEP_COL[s.depSym] || '#666', u = Math.pow(s.dep, 0.5);
      const fl = tu.geo.flakes, n = Math.round(28 * Math.min(1.4, u) * (1 - s.metalFrac / 0.25));
      for (let k = 0; k < n && k < fl.length; k++) {
        const f = fl[k];
        ctx.fillStyle = LD.shade(c, (f[2] - 0.5) * 0.4);
        ctx.beginPath(); ctx.ellipse(g.cx + (f[0] - 0.5) * g.tw * 0.75, y - f[1] * g.r * 0.5, 1.6 + f[2] * 1.6, 1 + f[2], f[0] * 3, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  function drawFlocs(tu, g) {
    const s = tu.cur;
    s.ppt.forEach(function (p) {
      const c = PPT_COL[p.kind] || '#efefec';
      const susp = Math.max(0, 1 - tu.t / 700) * (p.kind === 'MgOH2' || p.kind === 'CaOH2' ? 1 : 0.9);
      const n = Math.round(Math.min(1, p.mmol * 1.5) * 34 * susp);
      const fl = tu.geo.flocs;
      for (let k = 0; k < n && k < fl.length; k++) {
        const f = fl[k];
        const x = g.cx + (f[0] - 0.5) * g.tw * 0.8, y = g.liqTop + 6 + f[1] * (g.bot - g.liqTop - 10) * (0.4 + 0.6 * Math.min(1, tu.t / 300 + f[3] * 0.3));
        ctx.fillStyle = LD.alpha(c, 0.55);
        ctx.beginPath(); ctx.ellipse(x, Math.min(g.bot - 4, y), 1.8 + f[2] * 2.2, 1.2 + f[2] * 1.4, f[3] * 3, 0, Math.PI * 2); ctx.fill();
      }
    });
  }
  /** 金屬片＋析出物（析出量決定大小） */
  function drawStrip(tu, g) {
    const S = stripGeo(tu, g), s = tu.cur, tb = tu.tb;
    const mcol = METAL_COL[tb.metal];
    ctx.save();
    ctx.translate(S.cx, S.y1);
    ctx.rotate(S.tilt);
    if (S.f > 0.004) {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,' + (col.dark ? 0.45 : 0.25) + ')'; ctx.shadowBlur = 4; ctx.shadowOffsetX = 1.5;
      const gm = ctx.createLinearGradient(-S.w / 2, 0, S.w / 2, 0);
      gm.addColorStop(0, LD.shade(mcol, -0.3)); gm.addColorStop(0.3, LD.shade(mcol, 0.35)); gm.addColorStop(0.55, mcol); gm.addColorStop(1, LD.shade(mcol, -0.35));
      ctx.fillStyle = gm;
      LD.roundRect(ctx, -S.w / 2, -S.h, S.w, S.h, Math.min(2, S.w / 3));
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(-S.w / 2 + 0.5, -S.h + 0.5, Math.max(0, S.w - 1), 1);
      // 溶解中的坑洞
      if (S.f < 0.97 && tb.type !== 'none') {
        const a = Math.min(0.6, (1 - S.f) * 0.9);
        tu.geo.pits.forEach(function (p) {
          ctx.fillStyle = 'rgba(0,0,0,' + (a * 0.5).toFixed(3) + ')';
          ctx.beginPath(); ctx.ellipse((p[0] - 0.5) * S.w * 0.8, -S.h * (0.05 + 0.9 * p[1]), 0.6 + p[2] * 1.2, 0.5 + p[2], 0, 0, Math.PI * 2); ctx.fill();
        });
      }
    }
    if (s.dep > 0) drawDeposit(tu, S, s);
    ctx.restore();
  }
  function drawDeposit(tu, S, s) {
    const sym = s.depSym, c = DEP_COL[sym] || '#555', style = DEP_STYLE[sym] || 'powder';
    const u = Math.min(1.6, Math.pow(s.dep / 1.0, 0.7));
    if (u < 0.01) return;
    const geo = tu.geo, w = Math.max(S.w, S.w0 * 0.25), h = Math.max(S.h, S.h0 * 0.6);
    if (style === 'tree' || style === 'needle') {
      const maxLen = S.w0 * 1.7;
      ctx.lineCap = 'round';
      geo.branches.forEach(function (b, k) {
        const L = b.len * maxLen * u;
        if (L < 0.8) return;
        const x0 = b.side * w / 2, y0 = -h * b.y;
        const dx = Math.cos(b.ang) * b.side, dy = -Math.abs(Math.sin(b.ang)) * 0.6 - 0.25;
        const nx = Math.sign(b.side) * Math.abs(dx), x1 = x0 + nx * L, y1 = y0 + dy * L;
        ctx.strokeStyle = LD.shade(c, k % 3 === 0 ? 0.25 : -0.1);
        ctx.lineWidth = style === 'needle' ? 0.9 : 1.6;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        if (style === 'tree') {
          b.subs.forEach(function (sb) {
            const px = x0 + (x1 - x0) * sb[0], py = y0 + (y1 - y0) * sb[0];
            const a = Math.atan2(y1 - y0, x1 - x0) + sb[1];
            const l2 = L * sb[2];
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(a) * l2, py + Math.sin(a) * l2); ctx.stroke();
          });
          if (sym === 'Ag' && k % 4 === 0) { ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(x1, y1, 1.1, 0, Math.PI * 2); ctx.fill(); }
        }
      });
      // 根部的薄層
      ctx.fillStyle = LD.alpha(c, 0.55);
      ctx.fillRect(-w / 2 - 1, -h, w + 2, h);
    } else {
      // 海綿狀（銅）或粉末：貼在表面的小團
      const n = Math.round(14 + 70 * Math.min(1, u));
      const rad = style === 'sponge' ? 0.9 + 2.2 * Math.min(1.2, u) : 0.7 + 1.1 * Math.min(1.2, u);
      for (let k = 0; k < n && k < geo.pts.length; k++) {
        const p = geo.pts[k];
        const edge = p[2] < 0.55;
        const x = edge ? (p[0] < 0.5 ? -1 : 1) * (w / 2 + (p[3] - 0.3) * rad) : (p[0] - 0.5) * w;
        const y = -h * (0.02 + 0.96 * p[1]);
        ctx.fillStyle = LD.shade(c, (p[3] - 0.5) * 0.45);
        ctx.beginPath(); ctx.arc(x, y, rad * (0.6 + 0.7 * p[2]), 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = LD.alpha(c, Math.min(0.7, 0.2 + 0.5 * u));
      ctx.fillRect(-w / 2 - 0.5, -h, w + 1, h);
    }
  }
  function drawLump(tu, g, now) {
    const L = lumpPos(tu, g, now);
    if (L[2] < 0.6) return;
    LD.ball(ctx, L[0], L[1], L[2], METAL_COL[tu.tb.metal]);
  }
  /** 液面以上：鉀的紫色火焰、熱水的蒸氣、選取框 */
  function drawAbove(tu, g, now) {
    const tb = tu.tb;
    if (tb.metal === 'K' && !tu.done && tu.cur.metalFrac > 0.02 && tu.t > 0) {
      const L = lumpPos(tu, g, now);
      const fl = reducedMotion ? 1 : 0.85 + 0.15 * Math.sin(now / 60 + tu.geo.phase) * Math.sin(now / 97);
      const fh = g.r * 2.4 * fl, fx = L[0], fy = g.liqTop;
      const gr = ctx.createRadialGradient(fx, fy - fh * 0.3, 1, fx, fy - fh * 0.4, fh);
      gr.addColorStop(0, 'rgba(255,240,255,0.95)'); gr.addColorStop(0.35, 'rgba(196,128,255,0.75)'); gr.addColorStop(1, 'rgba(150,80,230,0)');
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.moveTo(fx - g.r * 0.5, fy);
      ctx.quadraticCurveTo(fx - g.r * 0.6, fy - fh * 0.5, fx, fy - fh);
      ctx.quadraticCurveTo(fx + g.r * 0.6, fy - fh * 0.5, fx + g.r * 0.5, fy);
      ctx.closePath(); ctx.fill();
    }
    if (tb.T >= 60) {
      const k = Math.min(1, (tb.T - 55) / 35);
      ctx.save();
      ctx.lineCap = 'round';
      for (let j = 0; j < 3; j++) {
        const ph = (reducedMotion ? 0 : now / 900) + j * 2.1 + tu.geo.phase;
        const x = g.cx + (j - 1) * g.r * 0.5 + Math.sin(ph) * 2;
        ctx.strokeStyle = LD.alpha(col.muted, 0.18 * k);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, g.top - 3);
        ctx.bezierCurveTo(x + 5 * Math.sin(ph), g.top - 10, x - 5 * Math.cos(ph), g.top - 16, x + 3 * Math.sin(ph * 1.3), g.top - 24);
        ctx.stroke();
      }
      ctx.restore();
    }
    if (tu === selected) {
      ctx.save();
      ctx.strokeStyle = LD.alpha(col.accent, 0.85);
      ctx.lineWidth = 2;
      ctx.shadowColor = LD.alpha(col.accent, 0.6); ctx.shadowBlur = 8;
      LD.roundRect(ctx, g.cx - g.r - 6, g.top - 8, g.tw + 12, g.bot - g.top + 14, 10);
      ctx.stroke();
      ctx.restore();
    }
  }
  function drawLabel(tu, g) {
    const tb = tu.tb;
    const y1 = g.baseY + 22, y2 = g.baseY + 38;
    const head = (tu.demo ? T('示範', 'demo') : '#' + tu.id) + ' ';
    ctx.font = '600 11px ' + FONT;
    const hw = ctx.measureText(head).width;
    const body = tb.metal + ' → ' + liqStr(tb.liquid);
    const bw = chemText(ctx, body, 0, 0, { px: 12, measure: true });
    let x = g.cx - (hw + bw) / 2;
    LD.haloText(ctx, head, x, y1, col.muted, 'left', 'alphabetic', '600 11px ' + FONT);
    chemText(ctx, body, x + hw, y1, { px: 12 });
    const line2 = (tb.kind === 'water' ? '' : sigf(tb.c, 2) + ' M · ') + num(tb.T, 0) + ' °C' + (tb.salt ? ' · NaCl' : '');
    LD.haloText(ctx, line2, g.cx, y2, tb.T >= 50 ? col.pos : col.muted, 'center', 'alphabetic', '11px ' + FONT);
    // 進度：觀察中畫進度條，觀察完畫 ✓ 或 ✗
    const pw = Math.min(g.cw - 16, 56), px = g.cx - pw / 2, py = y2 + 6;
    if (!tu.done) {
      ctx.fillStyle = LD.alpha(col.muted, 0.2); LD.roundRect(ctx, px, py, pw, 4, 2); ctx.fill();
      ctx.fillStyle = col.accent; LD.roundRect(ctx, px, py, pw * Math.min(1, tu.t / tb.tRec), 4, 2); ctx.fill();
    } else {
      const ok = tu.rec && tu.rec.reacted;
      LD.haloText(ctx, ok ? T('✓ 有反應', '✓ reacted') : T('— 無明顯反應', '— no reaction'), g.cx, py + 9, ok ? col.probe : col.muted, 'center', 'alphabetic', '600 11px ' + FONT);
    }
  }

  // ======================= 圖表 =======================
  let GW = 0, GH = 0;
  function resizeGraph() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    GW = gcv.clientWidth || 600; GH = gcv.clientHeight || 260;
    gcv.width = Math.round(GW * dpr); gcv.height = Math.round(GH * dpr);
    gctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function niceStep(span, n) {
    const raw = span / (n || 5), p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
    return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
  }
  function seriesFor(tu) {
    const tb = tu.tb, out = [];
    const ionCol = { ox: col.neg, prod: col.pos, oh: col.field, h2: col.probe, dm: col.accent };
    if (state.tab === 'conc') {
      if (tb.type === 'disp' || (tb.type === 'none' && tb.kind === 'ion')) {
        out.push({ name: chemHTML(ionStr(tb.liquid)), f: function (s) { return s.ions[tb.liquid] || 0; }, c: ionCol.ox });
        if (tb.type === 'disp') out.push({ name: chemHTML(ionStr(tb.metal)), f: function (s) { return s.ions[tb.metal] || 0; }, c: ionCol.prod });
      } else if (tb.type === 'acid') {
        out.push({ name: 'H<sup>+</sup>', f: function (s) { return s.ions.H || 0; }, c: ionCol.ox });
        out.push({ name: chemHTML(ionStr(tb.metal)), f: function (s) { return s.ions[tb.metal] || 0; }, c: ionCol.prod });
      } else if (tb.type === 'water') {
        if (tb.kind === 'ion') out.push({ name: chemHTML(ionStr(tb.liquid)), f: function (s) { return s.ions[tb.liquid] || 0; }, c: ionCol.ox });
        if (tb.kind === 'acid') out.push({ name: 'H<sup>+</sup>', f: function (s) { return s.ions.H || 0; }, c: ionCol.ox });
        out.push({ name: chemHTML(ionStr(tb.metal)), f: function (s) { return s.ions[tb.metal] || 0; }, c: ionCol.prod });
        out.push({ name: 'OH<sup>−</sup>', f: function (s) { return s.OH / MC.V; }, c: ionCol.oh, dash: true });
      }
      return { unit: 'mol/L', ylab: T('濃度（mol/L）', 'Concentration (mol/L)'), s: out };
    }
    out.push({ name: T('金屬片質量變化（mg）', 'change in strip mass (mg)'), f: function (s) { return s.dm; }, c: ionCol.dm });
    if (tb.type === 'acid' || tb.type === 'water') out.push({ name: T('氫氣（mL）', 'hydrogen (mL)'), f: function (s) { return s.h2; }, c: ionCol.h2, dash: true });
    return { unit: '', ylab: T('質量變化（mg）／氫氣（mL）', 'Mass change (mg) / hydrogen (mL)'), s: out };
  }
  function drawGraph() {
    if (!GW) return;
    const c = gctx;
    c.clearRect(0, 0, GW, GH);
    LD.backdrop(c, GW, GH);
    const tu = selected;
    const legend = $('gLegend');
    if (!tu) {
      LD.haloText(c, T('點選一支試管，就會畫出它的變化', 'Select a test tube to graph it'), GW / 2, GH / 2, col.muted, 'center', 'middle', '13px ' + FONT);
      legend.innerHTML = '';
      return;
    }
    const tb = tu.tb, spec = seriesFor(tu);
    const tEnd = Math.max(tb.tRec, 30);
    const xmaxMin = tEnd / 60;
    const N = 160, pts = [];
    for (let k = 0; k <= N; k++) { const t = tEnd * k / N; pts.push([t, MC.at(tb, t)]); }
    let ymin = 0, ymax = 0;
    spec.s.forEach(function (se) { pts.forEach(function (p) { const v = se.f(p[1]); if (isFinite(v)) { ymin = Math.min(ymin, v); ymax = Math.max(ymax, v); } }); });
    if (ymax - ymin < 1e-9) ymax = ymin + (spec.unit ? 0.1 : 10);
    const pad = (ymax - ymin) * 0.1;
    ymax += pad; if (ymin < 0) ymin -= pad;
    const L = 58, R = 14, Tp = 14, B = 38;
    const X = function (t) { return L + (t / 60) / xmaxMin * (GW - L - R); };
    const Y = function (v) { return Tp + (ymax - v) / (ymax - ymin) * (GH - Tp - B); };
    // 格線與刻度
    c.lineWidth = 1;
    const ys = niceStep(ymax - ymin, 5);
    c.font = '11px ' + FONT;
    for (let v = Math.ceil(ymin / ys) * ys; v <= ymax + 1e-12; v += ys) {
      const y = Math.round(Y(v)) + 0.5;
      c.strokeStyle = LD.alpha(col.text, Math.abs(v) < ys * 1e-6 ? 0.3 : 0.08);
      c.beginPath(); c.moveTo(L, y); c.lineTo(GW - R, y); c.stroke();
      LD.haloText(c, sigf(v, 2).replace(/^−?0$/, '0'), L - 6, y + 4, col.muted, 'right', 'alphabetic', '11px ' + FONT);
    }
    const xs = niceStep(xmaxMin, 6);
    for (let m = 0; m <= xmaxMin + 1e-9; m += xs) {
      const x = Math.round(X(m * 60)) + 0.5;
      c.strokeStyle = LD.alpha(col.text, 0.08);
      c.beginPath(); c.moveTo(x, Tp); c.lineTo(x, GH - B); c.stroke();
      LD.haloText(c, sigf(m, 2), x, GH - B + 15, col.muted, 'center', 'alphabetic', '11px ' + FONT);
    }
    LD.haloText(c, T('時間（分鐘）', 'Time (min)'), (L + GW - R) / 2, GH - 6, col.muted, 'center', 'alphabetic', '11px ' + FONT);
    c.save(); c.translate(13, (Tp + GH - B) / 2); c.rotate(-Math.PI / 2);
    LD.haloText(c, spec.ylab, 0, 0, col.muted, 'center', 'middle', '11px ' + FONT);
    c.restore();
    // 曲線：已經過的實線、還沒到的部分淡淡畫出（預測）
    const tNow = tu.t;
    spec.s.forEach(function (se) {
      c.lineCap = 'round'; c.lineJoin = 'round';
      [0, 1].forEach(function (pass) {
        c.beginPath();
        let started = false;
        pts.forEach(function (p) {
          const past = p[0] <= tNow + 1e-9;
          if ((pass === 0) !== past) return;
          const x = X(p[0]), y = Y(se.f(p[1]));
          if (!started) { c.moveTo(x, y); started = true; } else c.lineTo(x, y);
        });
        if (pass === 0) {
          const sNow = MC.at(tb, tNow);
          c.lineTo(X(tNow), Y(se.f(sNow)));
        }
        c.setLineDash(se.dash ? [6, 4] : []);
        c.strokeStyle = pass === 0 ? se.c : LD.alpha(se.c, 0.28);
        c.lineWidth = pass === 0 ? 2.4 : 1.4;
        c.stroke();
        c.setLineDash([]);
      });
      const sNow = MC.at(tb, tNow), v = se.f(sNow);
      LD.ball(c, X(tNow), Y(v), 3.6, se.c);
    });
    const kind = tu.done ? T('（已記錄）', ' (recorded)') : T('（觀察中）', ' (observing)');
    LD.pill(c, (tu.demo ? T('示範試管', 'demo tube') : T('第 ' + tu.id + ' 支', 'tube ' + tu.id)) + kind, GW - R - 4, Tp + 20, col.text, 'right');
    legend.innerHTML = spec.s.map(function (se) { return '<span><span class="ln' + (se.dash ? ' dash' : '') + '" style="background:' + se.c + ';color:' + se.c + '"></span>' + se.name + '</span>'; }).join('　') +
      (state.tab === 'conc' ? '<span>　' + T('（淡線：之後的預測）', '(faint: what will happen next)') + '</span>' : '');
  }

  // ======================= 讀數 =======================
  function equationHTML(tb) {
    const m = MC.METALS[tb.metal].z;
    const cf = function (k, s) { return (k === 1 ? '' : k) + chemHTML(s); };
    if (tb.type === 'disp') {
      const n = tb.n, ne = MC.lcm(m, n), a = ne / m, b = ne / n;
      return cf(a, tb.metal) + ' + ' + cf(b, ionStr(tb.liquid)) + ' → ' + cf(a, ionStr(tb.metal)) + ' + ' + cf(b, tb.liquid);
    }
    if (tb.type === 'acid') {
      const ne = MC.lcm(m, 2), a = ne / m;
      return cf(a, tb.metal) + ' + ' + cf(ne, 'H^+') + ' → ' + cf(a, ionStr(tb.metal)) + ' + ' + cf(ne / 2, 'H2');
    }
    if (tb.type === 'water') {
      let s = m === 1 ? '2' + tb.metal + ' + 2' + chemHTML('H2O') + ' → 2' + chemHTML(ionStr(tb.metal)) + ' + 2' + chemHTML('OH^-') + ' + ' + chemHTML('H2')
        : tb.metal + ' + 2' + chemHTML('H2O') + ' → ' + chemHTML(ionStr(tb.metal)) + ' + 2' + chemHTML('OH^-') + ' + ' + chemHTML('H2');
      if (tb.kind === 'ion') {
        const N = tb.liquid, z = MC.METALS[N].z;
        s += '<br>' + (N === 'Ag' ? '2' + chemHTML('Ag^+') + ' + 2' + chemHTML('OH^-') + ' → ' + chemHTML('Ag2O') + '↓ + ' + chemHTML('H2O')
          : chemHTML(ionStr(N)) + ' + ' + z + chemHTML('OH^-') + ' → ' + chemHTML(PPT_NAME[N + 'OH' + z] || (N + '(OH)' + z)) + '↓');
      } else if (tb.kind === 'acid') s += '<br>' + chemHTML('H^+') + ' + ' + chemHTML('OH^-') + ' → ' + chemHTML('H2O');
      return s;
    }
    return tb.kind === 'ion' && tb.liquid === tb.metal ? T('同一種金屬：只是原子與離子互相交換，沒有淨反應', 'Same metal: atoms and ions only swap places, no net reaction') : T('不反應', 'No reaction');
  }
  function updateReadouts() {
    const tu = selected;
    const eq = $('eqn'), ro = $('readout');
    if (!tu) { eq.innerHTML = '—'; ro.innerHTML = '<dt>' + T('沒有選取試管', 'No tube selected') + '</dt><dd>—</dd>'; return; }
    const tb = tu.tb, s = tu.cur;
    let e = equationHTML(tb);
    if (tb.logK != null) {
      const tiny = tb.eEq < MC.REACT_E;
      e += '<br><span class="k">ΔE° = ' + num(tb.dE, 3) + ' V　K = ' + powHTML(tb.logK) + (tiny ? T('　（K 很小：幾乎不反應）', ' (K is tiny: practically no reaction)') : tb.logK < 3 && tb.logK > -3 ? T('　（K 接近 1：停在半路）', ' (K near 1: stops part-way)') : '') + '</span>';
    }
    if (tb.metal === 'Al' && (tb.type === 'disp' || tb.type === 'acid')) e += '<br><span class="k">' + (tb.hasCl ? T('有 Cl<sup>−</sup>', 'Cl<sup>−</sup> present') : T('沒有 Cl<sup>−</sup>', 'no Cl<sup>−</sup>')) + '</span>';
    eq.innerHTML = e;
    const rows = [];
    const add = function (dt, dd, sm) { rows.push('<dt>' + dt + '</dt><dd>' + dd + (sm ? '<small>' + sm + '</small>' : '') + '</dd>'); };
    add(T('時間', 'Time'), num(tu.t / 60, 1) + ' min', tu.done ? T('觀察完畢', 'observation finished') : !state.running ? T('暫停中', 'paused') : T('觀察中', 'observing'));
    const m0 = tb.n0 * MC.METALS[tb.metal].M;
    add(T(nm(tb.metal) + '（未反應）', nm(tb.metal) + ' left'), num(s.metalLeft * MC.METALS[tb.metal].M, 1) + ' mg', T('原來 ', 'from ') + num(m0, 1) + ' mg');
    if (tb.type === 'disp') {
      add(T('析出的' + nm(tb.liquid), nm(tb.liquid) + ' deposited'), num(s.depMg, 1) + ' mg', sigf(s.dep, 3) + ' mmol');
      add(T('金屬片質量變化', 'Change in strip mass'), (s.dm > 0 ? '+' : '') + num(s.dm, 1) + ' mg');
    }
    Object.keys(s.ions).forEach(function (k) {
      if (k === 'H') add('[H<sup>+</sup>]', concHTML(s.ions.H) + ' mol/L');
      else add('[' + chemHTML(ionStr(k)) + ']', concHTML(s.ions[k]) + ' mol/L');
    });
    if (tb.type === 'acid' || tb.type === 'water') add(T('氫氣', 'Hydrogen'), num(s.h2, 2) + ' mL', '25 °C, 1 atm');
    if (s.pH != null) add('pH', num(s.pH, 2), tu.phph ? (s.pH >= 8.2 ? T('酚酞：粉紅色', 'phenolphthalein: pink') : T('酚酞：無色', 'phenolphthalein: colourless')) : '');
    s.ppt.forEach(function (p) { add(T('沉澱 ', 'Precipitate ') + chemHTML(PPT_NAME[p.kind] || p.kind), sigf(p.mmol, 3) + ' mmol'); });
    add(T('溫度', 'Temperature'), num(tb.T, 0) + ' °C');
    ro.innerHTML = rows.join('');
  }
  /** 一支試管的現象描述（觀察紀錄用） */
  function phenomena(rec) {
    const out = [];
    const tb = { metal: rec.metal, liquid: rec.liquid };
    const ppt = rec.ppt || {};
    if (ppt.AgCl) out.push(T('加鹽時生成白色 AgCl 沉澱', 'white AgCl formed when the salt was added'));
    if (rec.type === 'disp' && rec.reacted) {
      const col_ = { Cu: T('紅棕色', 'red-brown'), Ag: T('銀灰色晶枝', 'silvery crystals'), Pb: T('灰黑色晶枝', 'dark grey crystals'), Sn: T('灰色針狀晶體', 'grey needles') }[rec.liquid] || T('灰黑色', 'dark grey');
      out.push(T('表面析出' + col_ + '的' + nm(rec.liquid) + '（' + num(rec.depMg, 0) + ' mg）', col_ + ' ' + nm(rec.liquid) + ' deposited (' + num(rec.depMg, 0) + ' mg)'));
      if (rec.liquid === 'Cu') out.push(rec.oxFrac <= 0.05 ? T('藍色褪去', 'blue colour gone') : T('藍色變淡', 'blue colour paler'));
      if (rec.metal === 'Cu') out.push(T('溶液變藍', 'solution turns blue'));
      if (rec.metal === 'Fe') out.push(T('溶液帶淡綠色', 'pale green solution'));
      if (rec.metalFrac <= 0.02) out.push(T(nm(rec.metal) + '片完全溶解', 'the ' + nm(rec.metal) + ' strip dissolved completely'));
      if (!rec.atEq || (rec.oxFrac > 0.05 && rec.metalFrac > 0.05)) out.push(T('反應停在半路', 'stops part-way'));
    } else if (rec.type === 'acid' && rec.reacted) {
      out.push(T('冒出氣泡（H<sub>2</sub> ' + num(rec.h2, 1) + ' mL）', 'bubbles (H<sub>2</sub> ' + num(rec.h2, 1) + ' mL)'));
      if (rec.r0 < 0.5) out.push(T('非常緩慢', 'very slowly'));
      if (rec.metal === 'Fe') out.push(T('溶液變淡綠色', 'solution turns pale green'));
      if (rec.metalFrac <= 0.02) out.push(T('金屬完全溶解', 'metal dissolved completely'));
    } else if (rec.type === 'water' && rec.reacted) {
      const m = rec.metal;
      if (m === 'K') out.push(T('浮在水面、燃起紫色火焰、急速冒泡', 'floats, burns with a lilac flame, fizzes violently'));
      else if (m === 'Na') out.push(T('浮在水面熔成小球、四處游動、冒泡', 'floats, melts into a ball, darts about, fizzes'));
      else if (m === 'Ca') out.push(T('沉在底部、穩定冒泡', 'sinks and bubbles steadily'));
      else out.push(T('緩慢冒出細小氣泡', 'small bubbles, slowly'));
      out.push('H<sub>2</sub> ' + num(rec.h2, 1) + ' mL');
      Object.keys(ppt).forEach(function (k) {
        if (k === 'AgCl' || k === 'PbCl2') return;
        const cname = k === 'CuOH2' ? T('藍色', 'blue ') : k === 'Ag2O' ? T('棕黑色', 'brown-black ') : k === 'FeOH2' ? T('淡綠白色', 'pale green-white ') : T('白色', 'white ');
        out.push(T(cname + '沉澱 ', cname + 'precipitate ') + chemHTML(PPT_NAME[k] || k));
      });
    } else out.push(T('無明顯變化', 'no visible change'));
    if (rec.phph && rec.pH != null && rec.pH >= 8.2) out.push(T('酚酞變粉紅（pH ' + num(rec.pH, 1) + '）', 'phenolphthalein pink (pH ' + num(rec.pH, 1) + ')'));
    void tb;
    return out.join(T('，', ', '));
  }
  function updateTable() {
    const el = $('tbl');
    let h = '<thead><tr><th>#</th><th>' + T('金屬', 'Metal') + '</th><th>' + T('液體', 'Liquid') + '</th><th>' + T('條件', 'Conditions') + '</th><th style="text-align:left">' + T('現象', 'Observation') +
      '</th><th>Δm<br><small>mg</small></th><th>' + T('結果', 'Result') + '</th></tr></thead><tbody>';
    if (!recs.length) h += '<tr class="empty"><td colspan="7">' + T('還沒有觀察完畢的試管。', 'No tube has finished yet.') + '</td></tr>';
    recs.forEach(function (r) {
      const tu = rack.find(function (x) { return x.rec === r; });
      const cond = (r.kind === 'water' ? '' : sigf(r.c, 2) + ' M<br>') + num(r.T, 0) + ' °C' + (r.salt ? '<br>NaCl' : '') + (r.phph ? '<br>' + T('酚酞', 'phth.') : '');
      h += '<tr' + (tu && tu === selected ? ' class="sel"' : '') + ' data-id="' + r.id + '"><td>' + (r.demo ? T('示範', 'demo') : r.id) + '</td><td title="' + nm(r.metal) + '">' + r.metal + '</td><td>' + chemHTML(liqStr(r.liquid)) +
        '</td><td>' + cond + '</td><td class="obs">' + phenomena(r) + '</td><td>' + (r.dm > 0 ? '+' : '') + num(r.dm, 1) + '</td><td class="' + (r.reacted ? 'yes' : 'no') + '">' +
        (r.reacted ? T('有反應', 'reacted') : T('無反應', 'none')) + '</td></tr>';
    });
    el.innerHTML = h + '</tbody>';
  }
  $('tbl').addEventListener('click', function (ev) {
    const tr = ev.target.closest('tr[data-id]');
    if (!tr) return;
    const id = +tr.dataset.id, tu = rack.find(function (x) { return x.id === id && x.rec; });
    if (tu) { acted = true; select(tu); }
  });

  // ======================= 推理：結果矩陣與排序 =======================
  const ALL = MC.KNOWN.concat(MC.UNK);
  function candidates() {
    const s = new Set();
    recs.forEach(function (r) { s.add(r.metal); if (r.kind === 'ion') s.add(r.liquid); });
    return ALL.filter(function (m) { return s.has(m); });
  }
  function cellOf(r) {
    if (r.type === 'disp' || (r.type === 'none' && r.kind === 'ion')) return r.reacted ? ['y', T('析出', 'deposit')] : ['n', '—'];
    if (r.type === 'acid') return r.reacted ? ['y', T('氣泡', 'gas')] : ['n', '—'];
    if (r.type === 'water') {
      if (!r.reacted) return ['n', '—'];
      return r.kind === 'ion' ? ['p', T('沉澱', 'ppt')] : ['y', T('氣泡', 'gas')];
    }
    return ['n', '—'];
  }
  function updateMatrix() {
    const el = $('mtx');
    const metals = ALL.filter(function (m) { return recs.some(function (r) { return r.metal === m; }); });
    const LQ = ['H2O', 'HCl'].concat(MC.ION_LIQ, MC.UNK).filter(function (l) { return recs.some(function (r) { return r.liquid === l; }); });
    if (!metals.length) { el.innerHTML = '<tbody><tr><td>' + T('還沒有結果', 'No results yet') + '</td></tr></tbody>'; return; }
    let h = '<thead><tr><th></th>' + LQ.map(function (l) { return '<th>' + chemHTML(liqStr(l)) + '</th>'; }).join('') + '</tr></thead><tbody>';
    metals.forEach(function (m) {
      h += '<tr><th>' + m + '</th>' + LQ.map(function (l) {
        const L = recs.filter(function (r) { return r.metal === m && r.liquid === l; });
        if (!L.length) return '<td></td>';
        const cells = [];
        L.forEach(function (r) { const c = cellOf(r); if (!cells.some(function (x) { return x[1] === c[1]; })) cells.push(c); });
        return '<td class="' + cells[cells.length - 1][0] + '" title="#' + L.map(function (r) { return r.demo ? T('示範', 'demo') : r.id; }).join(', #') + '">' + cells.map(function (c) { return c[1]; }).join('／') + '</td>';
      }).join('') + '</tr>';
    });
    el.innerHTML = h + '</tbody>';
  }
  function updateChips() {
    const cand = candidates();
    order = order.filter(function (m) { return cand.indexOf(m) >= 0; });
    const box = $('chips');
    if (!cand.length) box.innerHTML = '<span class="hint">' + T('先做幾支試管，出現在紀錄裡的金屬就可以排。', 'Do a few tubes first; metals that appear in the record can be ranked.') + '</span>';
    else box.innerHTML = cand.map(function (m) {
      const used = order.indexOf(m) >= 0;
      return '<button type="button" data-m="' + m + '"' + (used ? ' disabled' : '') + ' aria-label="' + nm(m) + '">' + m + '</button>';
    }).join('');
    box.querySelectorAll('button[data-m]').forEach(function (b) { b.addEventListener('click', function () { acted = true; order.push(b.dataset.m); $('rankOut').innerHTML = ''; updateChips(); }); });
    const line = $('orderLine');
    if (!order.length) { line.className = 'orderline empty'; line.textContent = T('最活潑 → … → 最不活潑', 'most active → … → least active'); }
    else { line.className = 'orderline'; line.textContent = order.join(' > '); }
  }
  function evText(e) {
    const ids = e.ids.map(function (i) { const r = recs.find(function (x) { return x.id === i; }); return r && r.demo ? T('示範', 'demo') : '#' + i; }).join(T('、', ', '));
    const k = { disp: T('置換', 'displacement'), dispNo: T('不置換', 'no displacement'), acid: T('和鹽酸', 'with HCl'), water: T('和水', 'with water'), vigor: T('和水的劇烈程度', 'vigour with water') }[e.kind];
    return k + T('（試管 ', ' (tube ') + ids + T('）', ')');
  }
  function checkRank() {
    acted = true;
    const out = $('rankOut');
    if (order.length < 2) { out.innerHTML = '<span class="no">' + T('至少要排兩種金屬。', 'Rank at least two metals.') + '</span>'; return; }
    const j = MC.judge(order, recs, env);
    lastRank = j;
    let h = '';
    if (j.ok && j.supported) h += '<span class="ok">' + T('✓ 順序正確，而且每相鄰兩種都有實驗證據！', '✓ Correct, and every neighbouring pair is backed by your tubes!') + '</span>';
    else if (j.ok) h += '<span class="ok">' + T('順序正確', 'The order is right') + '</span>' + T('，但還缺證據：', ', but some evidence is missing:');
    else {
      let wrong = 0;
      for (let i = 0; i < order.length; i++) for (let k = i + 1; k < order.length; k++) {
        if (!(MC.E0(order[i], env) < MC.E0(order[k], env)) && !MC.tolerant(order[i], order[k])) wrong++;
      }
      h += '<span class="no">' + T('順序有誤：有 ' + wrong + ' 對金屬的先後不對。', 'Not right yet: ' + wrong + ' pair' + (wrong > 1 ? 's are' : ' is') + ' in the wrong order.') + '</span>';
    }
    h += '<ul>' + j.pairs.map(function (p) {
      return '<li>' + p.a + ' > ' + p.b + T('：', ': ') + (p.ev.length ? p.ev.map(evText).join(T('；', '; ')) : '<span class="no">' + T('沒有證據', 'no evidence') + '</span>') + (p.tol ? T('（這兩種很接近，哪個在前都算對）', ' (very close; either order counts)') : '') + '</li>';
    }).join('') + '</ul>';
    if (j.conflicts.length) {
      h += '<p class="hint">' + T('和你的排序矛盾的結果：', 'Results that disagree with your order:') + ' ' +
        j.conflicts.map(function (e) { return e.a + ' > ' + e.b + ' ← ' + evText(e); }).join(T('；', '; ')) + T('。想一想：這支試管為什麼會「看起來」是這樣？', '. Think: why might this tube “look” like that?') + '</p>';
    }
    out.innerHTML = h;
    snd(j.ok && j.supported ? 'rankOk' : 'rankNo');
    if (window.LabMission) {
      window.LabMission.emit('rank', { order: order.slice(), ok: j.ok, supported: j.supported, conflicts: j.conflicts.length, n: order.length,
        hasXYZ: ['X', 'Y', 'Z'].every(function (s) { return order.indexOf(s) >= 0; }), tubes: segTubes, unkTubes: unkTubes, revealed: revealed });
    }
  }

  // ======================= 控制項 =======================
  function metalList() { return MC.KNOWN.concat(state.unknown ? MC.UNK : []); }
  function liqList() { return ['H2O', 'HCl'].concat(MC.ION_LIQ, state.unknown ? MC.UNK : []); }
  function buildSegs() {
    $('metalSeg').innerHTML = metalList().map(function (m) {
      return '<button type="button" data-m="' + m + '" aria-pressed="' + (m === state.metal) + '"><span class="sw" style="background:' + METAL_COL[m] + '"></span>' + m + '<small>' + nm(m) + '</small></button>';
    }).join('');
    $('liqSeg').innerHTML = liqList().map(function (l) {
      return '<button type="button" data-l="' + l + '" aria-pressed="' + (l === state.liq) + '">' + chemHTML(liqStr(l)) + '<small>' + (l === 'H2O' ? T('純水', 'water') : l === 'HCl' ? T('稀鹽酸', 'dil. acid') : T('硝酸鹽', 'nitrate')) + '</small></button>';
    }).join('');
    $('metalSeg').querySelectorAll('button').forEach(function (b) { b.addEventListener('click', function () { acted = true; state.metal = b.dataset.m; pressSegs(); updateCondHint(); }); });
    $('liqSeg').querySelectorAll('button').forEach(function (b) { b.addEventListener('click', function () { acted = true; state.liq = b.dataset.l; pressSegs(); updateCondHint(); }); });
  }
  function pressSegs() {
    $('metalSeg').querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.m === state.metal)); });
    $('liqSeg').querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.l === state.liq)); });
  }
  function refreshOutputs() {
    $('conco').textContent = sigf(state.c, 3) + ' mol/L';
    $('tempo').textContent = num(state.T, 0) + ' °C';
  }
  function updateCondHint() {
    const h = [];
    if (state.liq === 'H2O') h.push(T('純水不用濃度設定。', 'The concentration does not apply to pure water.'));
    if (MC.METALS[state.metal].alk) h.push(T(nm(state.metal) + '是 1.0 mmol 的小塊，放進任何液體都會先和水反應。', 'The ' + nm(state.metal) + ' is a small 1.0 mmol piece; in any liquid it reacts with the water first.'));
    if (state.liq === state.metal) h.push(T('同一種金屬和它自己的離子不會有淨反應。', 'A metal in a solution of its own ions has no net reaction.'));
    $('condHint').textContent = h.join(' ');
  }
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }
  function setRunning(on) {
    state.running = on;
    $('play').textContent = on ? T('暫停', 'Pause') : T('播放', 'Play');
    if (on) startLoop(); else { drawRack(); drawGraph(); updateReadouts(); if (view3 && view3.active) view3.frame(); }
  }
  function setSpeed(i) { state.speed = i; [0, 1, 2].forEach(function (k) { $('sp' + k).setAttribute('aria-pressed', String(k === i)); }); }
  function select(tu) {
    selected = tu;
    updateReadouts(); drawGraph(); updateTable();
    if (!raf) drawRack();
    if (view3 && view3.active) view3.onSelect();
  }
  function setUnknown(on) {
    state.unknown = on;
    revealed = false;
    if (on) env.unk = MC.newUnknown();
    else env.unk = null;
    if (!on && MC.UNK.indexOf(state.metal) >= 0) state.metal = 'Fe';
    if (!on && MC.UNK.indexOf(state.liq) >= 0) state.liq = 'Cu';
    $('unkBtns').hidden = !on;
    buildSegs();
    updateCondHint();
    clearAll(on ? T('未知金屬挑戰開始：X、Y、Z 的活性順序已經藏好了。', 'Unknown-metal challenge: the order of X, Y and Z is hidden.') : T('已關閉未知金屬挑戰。', 'The unknown-metal challenge is off.'));
    updateUnkInfo();
  }
  function updateUnkInfo() {
    const el = $('unkInfo');
    if (!state.unknown) { el.innerHTML = ''; return; }
    if (!revealed) { el.innerHTML = T('這一輪用了 ' + unkTubes + ' 支含有 X、Y、Z 的試管。', 'Tubes with X, Y or Z this round: ' + unkTubes + '.'); return; }
    const u = env.unk;
    el.innerHTML = T('揭曉：', 'Revealed: ') + ['X', 'Y', 'Z'].sort(function (a, b) { return u[a] - u[b]; }).map(function (k) { return k + '（E° = ' + num(u[k], 2) + ' V）'; }).join(' > ') +
      T('。這一輪之後排對不再算任務。', '. Ranking this round no longer counts for missions.');
  }
  function refreshAll() {
    updateTable(); updateMatrix(); updateChips(); updateReadouts(); updateUnkInfo();
    drawRack(); drawGraph();
  }

  elC.addEventListener('input', function () { acted = true; state.c = Math.max(0.01, Math.min(2, val(elC))); refreshOutputs(); });
  elT.addEventListener('input', function () { acted = true; state.T = Math.max(5, Math.min(95, Math.round(val(elT)))); refreshOutputs(); });
  $('salt').addEventListener('change', function () { acted = true; state.salt = $('salt').checked; });
  $('phph').addEventListener('change', function () { acted = true; state.phph = $('phph').checked; });
  $('unk').addEventListener('change', function () { acted = true; setUnknown($('unk').checked); });
  $('newRound').addEventListener('click', function () { acted = true; setUnknown(true); });
  $('reveal').addEventListener('click', function () { acted = true; revealed = true; updateUnkInfo(); });
  $('insert').addEventListener('click', insert);
  $('play').addEventListener('click', function () { acted = true; setRunning(!state.running); });
  $('clearAll').addEventListener('click', function () { acted = true; clearAll(); });
  [0, 1, 2].forEach(function (k) { $('sp' + k).addEventListener('click', function () { acted = true; setSpeed(k); }); });
  $('soundBtn').addEventListener('click', function () { if (window.LabSettings) window.LabSettings.set('sound', !window.LabSettings.get('sound')); updateSoundButton(); });
  $('undo').addEventListener('click', function () { acted = true; order.pop(); $('rankOut').innerHTML = ''; updateChips(); });
  $('resetOrder').addEventListener('click', function () { acted = true; order = []; $('rankOut').innerHTML = ''; updateChips(); });
  $('checkOrder').addEventListener('click', checkRank);
  document.querySelectorAll('#tabs button').forEach(function (b) {
    b.addEventListener('click', function () {
      acted = true; state.tab = b.dataset.tab;
      document.querySelectorAll('#tabs button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      drawGraph();
    });
  });
  window.addEventListener('lab:settingschange', function (ev) {
    if (ev.detail && ev.detail.name === 'sound') updateSoundButton();
    if (ev.detail && ev.detail.name === 'fs') resize();
  });
  // 點畫布選試管；左右鍵換試管
  cv.addEventListener('click', function (ev) {
    const b = cv.getBoundingClientRect(), x = ev.clientX - b.left, y = ev.clientY - b.top;
    for (let i = 0; i < rack.length; i++) {
      const g = slotGeo(i);
      if (Math.abs(x - g.cx) <= g.cw / 2 && y >= g.top0 && y <= g.top0 + rowH) { acted = true; select(rack[i]); return; }
    }
  });
  cv.addEventListener('keydown', function (ev) {
    if (!rack.length || (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight')) return;
    ev.preventDefault();
    let i = rack.indexOf(selected);
    i = i < 0 ? 0 : (i + (ev.key === 'ArrowRight' ? 1 : -1) + rack.length) % rack.length;
    acted = true;
    select(rack[i]);
    setStatus(T('選取', 'Selected ') + (selected.demo ? T('示範試管', 'the demo tube') : T('第 ' + selected.id + ' 支試管', 'tube ' + selected.id)) + T('：', ': ') + descTube(selected.tb));
  });

  // ======================= 音效（預設關；主頻都在 250 Hz 以上） =======================
  function snd(kind) {
    const S = window.LabSound;
    if (!S || !S.enabled()) return;
    if (kind === 'insert') { S.tone({ freq: 1320, dur: 0.05, type: 'sine', gain: 0.14 }); S.tone({ freq: 2093, dur: 0.05, type: 'sine', gain: 0.05 }); }
    else if (kind === 'bubble') S.tone({ freq: 650 + Math.random() * 700, dur: 0.035, type: 'sine', gain: 0.045 });
    else if (kind === 'deposit') S.tone({ freq: 880, dur: 0.14, type: 'triangle', gain: 0.08 });
    else if (kind === 'done') { S.tone({ freq: 523, dur: 0.1, type: 'triangle', gain: 0.1 }); setTimeout(function () { S.tone({ freq: 784, dur: 0.16, type: 'triangle', gain: 0.1 }); }, 110); }
    else if (kind === 'none') S.tone({ freq: 330, dur: 0.12, type: 'sine', gain: 0.07 });
    else if (kind === 'rankOk') [523, 659, 784, 1047].forEach(function (f, i) { setTimeout(function () { S.tone({ freq: f, dur: 0.12, type: 'triangle', gain: 0.1 }); }, i * 90); });
    else if (kind === 'rankNo') S.sweep({ from: 520, to: 300, dur: 0.25 });
  }

  // ======================= 3D 檢視 =======================
  let threeLib = null, loadToken = 0;
  const stage = $('stage'), host3 = $('view3'), viewMsg = $('viewMsg');
  function webglAvailable() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch (e) { return false; }
  }
  function loadThree() {
    if (threeLib) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js')]).then(function (mods) {
      threeLib = { THREE: mods[0], OrbitControls: mods[1].OrbitControls };
      return threeLib;
    });
  }
  function host3Api() {
    return {
      T: T, host: host3,
      colors: function () { return col; },
      METAL_COL: METAL_COL, DEP_COL: DEP_COL, PPT_COL: PPT_COL,
      /** 選取的試管：給 3D 用的量（都來自核心） */
      tube: function () {
        const tu = selected;
        if (!tu) return null;
        const tb = tu.tb, s = tu.cur;
        const rateNow = !tu.done && state.running ? MC.rate(tb, tu.t) : 0;
        return { key: (tu.demo ? 'demo' : tu.id) + ':' + tb.metal + tb.liquid, metal: tb.metal, liquid: tb.liquid, kind: tb.kind, type: tb.type, z: MC.METALS[tb.metal].z,
          n: tb.n, alk: !!MC.METALS[tb.metal].alk, hasCl: tb.hasCl, oxide: !!MC.METALS[tb.metal].oxide, metalFrac: s.metalFrac,
          depFrac: s.dep > 0 ? Math.min(1, s.dep / Math.max(1e-9, tb.n0 * MC.METALS[tb.metal].z / Math.max(1, tb.n))) : 0, dep: s.dep,
          oxFrac: s.oxFrac, ions: s.ions, ppt: s.ppt, pH: s.pH, phph: tu.phph, eFrac: tb.eEq > 0 ? s.e / tb.eEq : 0,
          rate: tb.eEq > 0 ? rateNow / tb.eEq : 0, speed: SPEEDS[state.speed], done: tu.done, T: tb.T };
      },
      label: function () {
        const tu = selected;
        if (!tu) return { tl: T('沒有選取試管', 'No tube selected'), tr: '' };
        return { tl: (tu.demo ? T('示範試管', 'Demo tube') : T('第 ' + tu.id + ' 支試管', 'Tube ' + tu.id)) + T('：', ': ') + equationHTML(tu.tb).split('<br>')[0],
          tr: 't = ' + num(tu.t / 60, 1) + ' min' + (tu.done ? T('（已記錄）', ' (recorded)') : '') };
      },
      ionStr: ionStr, chemHTML: chemHTML,
      running: function () { return state.running; },
      reducedMotion: reducedMotion,
      contextLost: function () {
        setView('2d');
        viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D 試管架。', 'The 3D graphics context was lost, so the view switched back to the 2D rack.');
      }
    };
  }
  function setPressed(mode) { $('view2d').setAttribute('aria-pressed', String(mode === '2d')); $('view3d').setAttribute('aria-pressed', String(mode === '3d')); }
  function setView(mode) {
    if (mode === '3d') {
      if (view3 && view3.active) return;
      const token = ++loadToken;
      setPressed('3d');
      if (!webglAvailable() || !window.MetalAct3D) { fail3D(); return; }
      viewMsg.textContent = T('正在載入 3D 檢視…', 'Loading the 3D view…');
      loadThree().then(function (lib) {
        if (token !== loadToken) return;
        stage.classList.add('is3d');
        state.view = '3d';
        view3 = window.MetalAct3D.create(lib, host3Api());
        viewMsg.textContent = selected ? '' : T('先在 2D 試管架上選一支試管。', 'Select a tube on the 2D rack first.');
        $('resetCam').hidden = false;
        view3.frame();
        startLoop();
      }).catch(function (err) {
        if (token !== loadToken) return;
        if (window.console) console.warn('3D view unavailable:', err);
        fail3D();
      });
    } else {
      loadToken++;
      setPressed('2d');
      state.view = '2d';
      if (view3) { view3.dispose(); view3 = null; }
      stage.classList.remove('is3d');
      $('resetCam').hidden = true;
      if (/3D/.test(viewMsg.textContent) && !/2D/.test(viewMsg.textContent)) viewMsg.textContent = '';
      resize();
    }
  }
  function fail3D() {
    if (view3) { try { view3.dispose(); } catch (e) { /* 忽略 */ } view3 = null; }
    stage.classList.remove('is3d');
    state.view = '2d';
    setPressed('2d');
    $('resetCam').hidden = true;
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 試管架。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D rack is kept.');
    resize();
  }
  $('view2d').addEventListener('click', function () { acted = true; setView('2d'); });
  $('view3d').addEventListener('click', function () { acted = true; setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });

  // ======================= 說明區的 E° 表 =======================
  function buildE0Table() {
    const el = $('e0Table');
    if (!el) return;
    let h = '<thead><tr><th>' + T('金屬', 'Metal') + '</th><th style="text-align:left">' + T('還原半反應', 'Reduction half-reaction') + '</th><th>E°<br><small>V</small></th><th>' + T('冷水', 'Cold water') + '</th><th>' + T('稀鹽酸', 'Dilute HCl') + '</th></tr></thead><tbody>';
    const rows = MC.KNOWN.slice(0, 9).concat(['H']).concat(MC.KNOWN.slice(9));
    rows.forEach(function (m) {
      if (m === 'H') { h += '<tr><td>' + T('（氫）', '(hydrogen)') + '</td><td style="text-align:left">2' + chemHTML('H^+') + ' + 2e<sup>−</sup> → ' + chemHTML('H2') + '</td><td>0.000</td><td>—</td><td>—</td></tr>'; return; }
      const z = MC.METALS[m].z;
      const water = ['K', 'Ca', 'Na'].indexOf(m) >= 0 ? T('反應', 'reacts') : m === 'Mg' ? T('熱水才明顯', 'hot water') : T('不反應', 'no');
      const acid = MC.METALS[m].E < 0 ? (m === 'Pb' ? T('極慢', 'very slow') : m === 'Sn' ? T('慢', 'slow') : T('反應', 'reacts')) : T('不反應', 'no');
      h += '<tr><td>' + nm(m) + ' ' + m + '</td><td style="text-align:left">' + chemHTML(ionStr(m)) + ' + ' + (z === 1 ? '' : z) + 'e<sup>−</sup> → ' + m + '</td><td>' + num(MC.METALS[m].E, 3) + '</td><td>' + water + '</td><td>' + acid + '</td></tr>';
    });
    el.innerHTML = h + '</tbody>';
  }

  function themeChanged() {
    readColors();
    if (view3 && view3.active) view3.onTheme();
    drawRack(); drawGraph();
  }
  window.addEventListener('lab:themechange', themeChanged);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  if (window.ResizeObserver) {
    let lw = 0, lg = 0;
    new ResizeObserver(function () { if (cv.clientWidth && cv.clientWidth !== lw) { lw = cv.clientWidth; resize(); } }).observe(cv);
    new ResizeObserver(function () { if (gcv.clientWidth !== lg) { lg = gcv.clientWidth; resizeGraph(); drawGraph(); } }).observe(gcv);
  } else window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', function () { if (!document.hidden && state.running) startLoop(); });

  // 測試用（Playwright 與縮圖）：讀取狀態、直接放試管、快轉
  window.__ma = {
    state: state, env: env, rack: function () { return rack; }, recs: function () { return recs; }, order: function () { return order; },
    put: function (metal, liquid, c, T_, salt, phph) {
      state.metal = metal; state.liq = liquid; if (c != null) state.c = c; if (T_ != null) state.T = T_; state.salt = !!salt; state.phph = !!phph;
      pressSegs(); insert(); return rack[rack.length - 1];
    },
    /** 讓目前的試管各前進 sec 秒（模擬時間） */
    ff: function (sec) { rack.forEach(function (tu) { if (!tu.done) { tu.t = Math.min(tu.tb.tRec, tu.t + sec); tu.cur = MC.at(tu.tb, tu.t); if (tu.t >= tu.tb.tRec - 1e-9) record(tu); } }); refreshAll(); },
    select: function (i) { if (rack[i]) select(rack[i]); },
    rank: function (o) { order = o.slice(); updateChips(); checkRank(); return lastRank; },
    unknown: setUnknown, view: setView
  };

  // ======================= 啟動 =======================
  readColors();
  buildSegs();
  buildE0Table();
  if (window.LabNum) window.LabNum.set(elC, 0.1); else elC.value = String(Math.round(posFromC(0.1)));
  state.c = 0.1;
  refreshOutputs();
  updateCondHint();
  updateSoundButton();
  setSpeed(1);
  addDemo();
  resize();
  setRunning(state.running);
  refreshAll();
  if (reducedMotion) setStatus(T('已偵測到「減少動態效果」設定：按「播放」開始觀察。', 'Reduced motion is on: press “Play” to start observing.'));
})();
