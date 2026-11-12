/* mendelian-inheritance.js — 「孟德爾遺傳：豌豆雜交與卡方檢定」的畫面與互動（遺傳與統計的計算在 mendelian-inheritance-core.js） */
(function () {
  'use strict';
  const MC = window.MendelCore;
  const LD = window.LabDraw; // 共用繪圖工具（js/drawkit.js）
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const FONT = LD.FONT;
  const SERIF = '"Times New Roman", "Noto Serif TC", Georgia, serif';

  // ---------- 常數 ----------
  const MAX_N = 20000;   // 子代最多累積 20 000 個
  const ANIM_MAX = 20;   // 一次 20 個以內：每一次受精都有完整動畫；更多就一次倒進收成盤
  const FLY = 0.62, MERGE = 0.34, DROP = 0.6; // 配子飛行、受精、種子落下（1× 速度下的秒數）
  const POUR = 1.3;      // 大批子代倒進收成盤的時間
  const MIN_JUST = 8;    // 判成同型合子至少要看過 8 個子代都是顯性（任務「判斷有根據」的規則）
  const SHORT = {        // 長條圖與收成盤用的短名稱
    shape: [['圓', 'round'], ['皺', 'wrinkled']],
    color: [['黃', 'yellow'], ['綠', 'green']],
    flower: [['紫花', 'purple'], ['白花', 'white']],
    height: [['高莖', 'tall'], ['矮莖', 'dwarf']]
  };
  const CLASS_VARS = ['--accent', '--equi', '--neg', '--pos'];
  const MARK_CH = ['●', '▲', '■', '◆']; // 每一種表現型的記號（色盲也分得出）
  const FREQ1 = [659, 392], FREQ2 = [784, 659, 523, 392];

  // ---------- 狀態 ----------
  const state = {
    L: 1, traits: ['shape', 'color'], g1: [1, 1], g2: [1, 1],
    speed: 1, merge: false, genoChart: false, showRange: true, showMendel: true,
    my: { on: false, truth: [2, 2], hyp: [1, 1], id: 0, answered: false }
  };
  const rand = MC.rng((Math.random() * 4294967296) >>> 0);
  let cr = null, crShow = null, counts = null; // 實際的雜交、畫面上比較用的雜交（神秘模式為「你的假說」）、計數
  let seq = 0, trayArr = [], recent = [];
  let batches = [], flights = [], drops = [];
  let cellFlash = {}, slotFlash = [[], []];
  let clock = 0, lastLand = -1e9, roDirty = true;

  function traitsOn() { return state.traits.slice(0, state.L); }
  function syms() { return traitsOn().map(function (t) { return MC.TRAITS[t].sym; }); }
  function gMother() { return (state.my.on ? state.my.truth : state.g1).slice(0, state.L); }
  function gMotherShown() { return (state.my.on ? state.my.hyp : state.g1).slice(0, state.L); }
  function gFather() { return state.g2.slice(0, state.L); }
  function hidden() { return state.my.on && !state.my.answered; } // 神秘母本的基因型還沒揭曉
  function nClass() { return 1 << state.L; }
  function zeros(n) { const a = []; for (let i = 0; i < n; i++) a.push(0); return a; }
  function geno(g) { return MC.genoStr(g, syms()); }
  function masked() { return syms().map(function (s) { return s + '?'; }).join(''); }
  function motherText() { return hidden() ? masked() : geno(gMother()); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function fk() { const f = window.LabSettings && window.LabSettings.get('fs'); return 1 + ((typeof f === 'number' ? f : 1) - 1) * 0.7; }

  /** 表現型類別 k → 每個性狀是不是顯性：{ shape: true, color: false } */
  function phOf(k) {
    const bits = MC.phenoBits(k, state.L), o = {};
    traitsOn().forEach(function (t, i) { o[t] = bits[i]; });
    return o;
  }
  function phenoName(k, short, sep) {
    const bits = MC.phenoBits(k, state.L);
    return traitsOn().map(function (t, i) {
      const w = short ? SHORT[t][bits[i] ? 0 : 1] : (bits[i] ? MC.TRAITS[t].dom : MC.TRAITS[t].rec);
      return T(w[0], w[1]);
    }).join(sep || T('・', ', '));
  }
  function classColor(k) { return [LD.c.accent, LD.c.equi, LD.c.neg, LD.c.pos][k]; }

  // ---------- 數字 ----------
  function fmtP(p) { if (!(p >= 0)) return '—'; if (p < 0.001) return '< 0.001'; if (p > 0.999) return '> 0.999'; return p.toFixed(3); }
  function fmtChi(c) { if (!isFinite(c)) return '∞'; return c >= 100 ? c.toFixed(1) : c.toFixed(3); }
  function fmtE(e) { return e >= 100 ? e.toFixed(1) : e.toFixed(2); }
  function pct(x) { return (x * 100).toFixed(1) + '%'; }
  function ratioStr(r) { return r.some(function (x) { return x > 0; }) ? r.join(' : ') : '—'; }
  function chiNow() { return MC.chiSquare(counts.pheno, crShow.phenoP); }

  /** 孟德爾的原始數據（目前的雜交有對應的實驗才有）；類別依畫面上的性狀順序排列 */
  function mendelData() {
    if (state.my.on) return null;
    const t = traitsOn(), kd = MC.crossKind(gMother(), gFather());
    if (state.L === 1) return kd === 'F2' ? { counts: MC.TRAITS[t[0]].mendel.slice(), kind: 'F2' } : null;
    const si = t.indexOf('shape'), ci = t.indexOf('color');
    if (si < 0 || ci < 0) return null;
    let base = null, kind = kd;
    const m = gMother(), f = gFather();
    const all = function (g, v) { return g.every(function (x) { return x === v; }); };
    if (kd === 'F2') base = MC.MENDEL_DIHYBRID.counts;
    else if (kd === 'test' && all(m, 1) && all(f, 0)) { base = MC.MENDEL_TESTCROSS.hybridSeed; kind = 'testSeed'; }
    else if (kd === 'test' && all(f, 1) && all(m, 0)) { base = MC.MENDEL_TESTCROSS.hybridPollen; kind = 'testPollen'; }
    if (!base) return null;
    // 孟德爾的類別順序是 [形狀, 顏色]：圓黃、圓綠、皺黃、皺綠；畫面上的性狀順序若相反就對調
    const out = zeros(4);
    for (let c = 0; c < 4; c++) {
      const bits = MC.phenoBits(c, 2);
      out[c] = base[(bits[si] ? 0 : 2) + (bits[ci] ? 0 : 1)];
    }
    return { counts: out, kind: kind };
  }

  // ---------- 色彩（lab.css 代號） ----------
  const C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['pea-yellow', 'pea-green', 'pea-tan', 'pea-purple', 'pea-white', 'pea-stem', 'b-genetics', 'b-geo', 'star'].forEach(function (k) {
      C[k] = cs.getPropertyValue('--' + k).trim() || '#888888';
    });
    sprites.clear();
  }

  // ---------- 小圖快取（每一幀大量重複的豌豆、植株、配子） ----------
  const sprites = new Map();
  let dpr = 1;
  function sprite(key, w, h, paint) {
    key = key + '|' + dpr.toFixed(2) + '|' + LD.ver;
    let s = sprites.get(key);
    if (!s) {
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.ceil(w * dpr)); c.height = Math.max(1, Math.ceil(h * dpr));
      const g = c.getContext('2d');
      g.scale(dpr, dpr);
      paint(g);
      s = { cv: c, w: w, h: h };
      if (sprites.size > 600) sprites.clear();
      sprites.set(key, s);
    }
    return s;
  }

  // ---------- 豌豆種子：圓形光滑、皺縮有皺褶；黃與綠明暗差很大 ----------
  function paintSeed(g, x, y, r, wrinkled, fill) {
    const outline = function () {
      g.beginPath();
      if (!wrinkled) { g.ellipse(x, y, r, r * 0.93, -0.25, 0, Math.PI * 2); return; }
      const n = 72;
      for (let i = 0; i <= n; i++) {
        const a = i / n * Math.PI * 2;
        const R = r * (0.9 + 0.055 * Math.sin(5 * a + 0.6) + 0.04 * Math.sin(8 * a + 1.7) + 0.025 * Math.sin(13 * a + 0.3));
        const px = x + R * Math.cos(a), py = y + R * 0.94 * Math.sin(a);
        if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.closePath();
    };
    g.save();
    g.shadowColor = LD.dark ? 'rgba(0,0,0,0.55)' : LD.alpha(LD.c.text, 0.3);
    g.shadowBlur = Math.min(6, 1.5 + r * 0.3);
    g.shadowOffsetY = Math.min(2.5, 0.6 + r * 0.08);
    outline(); g.fillStyle = fill; g.fill();
    g.restore();
    const gr = g.createRadialGradient(x - r * 0.38, y - r * 0.42, r * 0.06, x, y, r * 1.02);
    gr.addColorStop(0, LD.shade(fill, wrinkled ? 0.42 : 0.62));
    gr.addColorStop(0.4, LD.shade(fill, wrinkled ? 0.06 : 0.14));
    gr.addColorStop(0.85, fill);
    gr.addColorStop(1, LD.shade(fill, -0.32));
    outline(); g.fillStyle = gr; g.fill();
    if (wrinkled && r >= 3) {
      // 皺褶：暗線＋旁邊一道亮線，看起來是凹下去的
      const cr2 = [[-0.55, -0.15, -0.05, -0.45, 0.35, -0.25], [-0.5, 0.3, -0.1, 0.05, 0.45, 0.35], [0.05, -0.62, 0.18, -0.1, 0.05, 0.45], [-0.3, -0.5, -0.5, 0.0, -0.25, 0.6]];
      g.lineCap = 'round';
      cr2.forEach(function (c) {
        g.beginPath(); g.moveTo(x + c[0] * r, y + c[1] * r); g.quadraticCurveTo(x + c[2] * r, y + c[3] * r, x + c[4] * r, y + c[5] * r);
        g.strokeStyle = LD.alpha(LD.shade(fill, -0.45), 0.62); g.lineWidth = Math.max(0.6, r * 0.075); g.stroke();
        const o = r * 0.07;
        g.beginPath(); g.moveTo(x + c[0] * r - o, y + c[1] * r - o); g.quadraticCurveTo(x + c[2] * r - o, y + c[3] * r - o, x + c[4] * r - o, y + c[5] * r - o);
        g.strokeStyle = LD.alpha(LD.shade(fill, 0.6), 0.45); g.lineWidth = Math.max(0.5, r * 0.045); g.stroke();
      });
    }
    if (r >= 5) { // 種臍
      g.beginPath(); g.ellipse(x + r * 0.62, y + r * 0.2, r * 0.2, r * 0.09, 1.2, 0, Math.PI * 2);
      g.fillStyle = LD.alpha(LD.shade(fill, -0.55), 0.75); g.fill();
    }
    if (!wrinkled && r >= 4) { // 高光
      g.beginPath(); g.ellipse(x - r * 0.36, y - r * 0.44, r * 0.26, r * 0.14, -0.5, 0, Math.PI * 2);
      g.fillStyle = 'rgba(255,255,255,' + (LD.dark ? 0.32 : 0.55) + ')'; g.fill();
    }
    outline();
    g.strokeStyle = LD.alpha(LD.shade(fill, -0.5), LD.dark ? 0.6 : 0.72);
    g.lineWidth = Math.max(0.7, r * 0.06);
    g.stroke();
  }
  function drawSeed(g, x, y, r, wrinkled, fill) {
    r = Math.max(2, Math.round(r * 2) / 2);
    const pad = Math.max(3, r * 0.4), S2 = 2 * (r + pad);
    const s = sprite('seed|' + r + '|' + (wrinkled ? 1 : 0) + '|' + fill, S2, S2, function (q) { paintSeed(q, S2 / 2, S2 / 2, r, wrinkled, fill); });
    g.drawImage(s.cv, x - s.w / 2, y - s.h / 2, s.w, s.h);
  }

  // ---------- 豌豆植株：高莖／矮莖、紫花／白花；花色不追蹤時畫豆莢 ----------
  function paintPlant(g, x, yb, Hh, tall, flower, seed) {
    const stemH = tall === false ? Hh * 0.42 : tall === true ? Hh : Hh * 0.78;
    const stem = C['pea-stem'];
    g.save();
    g.lineCap = 'round'; g.lineJoin = 'round';
    // 土堆
    const soil = LD.mix(C['b-geo'], LD.c['canvas-bg'], LD.dark ? 0.35 : 0.3);
    const sg = g.createLinearGradient(0, yb - Hh * 0.08, 0, yb + 1);
    sg.addColorStop(0, LD.shade(soil, 0.18)); sg.addColorStop(1, LD.shade(soil, -0.18));
    g.beginPath(); g.ellipse(x, yb, Hh * 0.3, Hh * 0.075, 0, Math.PI, Math.PI * 2); g.closePath();
    g.fillStyle = sg; g.fill();
    // 莖（兩層：底層暗、上層亮，有圓柱感）
    const tx = x + Hh * 0.04, ty = yb - stemH;
    const stemPath = function () { g.beginPath(); g.moveTo(x, yb - Hh * 0.03); g.quadraticCurveTo(x - Hh * 0.07, yb - stemH * 0.5, tx, ty); };
    const lw = Math.max(1.1, Hh * 0.045);
    stemPath(); g.strokeStyle = LD.shade(stem, -0.3); g.lineWidth = lw; g.stroke();
    stemPath(); g.strokeStyle = LD.shade(stem, 0.15); g.lineWidth = lw * 0.5; g.stroke();
    // 葉（小葉成對）與卷鬚
    const leafAt = function (u, side, len) {
      const px = x + (tx - x) * u - Hh * 0.035 * Math.sin(u * Math.PI), py = yb - stemH * u;
      const ang = side * 0.75 - Math.PI / 2 * 0;
      g.save();
      g.translate(px, py); g.rotate(side < 0 ? -2.35 : -0.8);
      const lg = g.createLinearGradient(0, -len * 0.4, 0, len * 0.4);
      lg.addColorStop(0, LD.shade(stem, 0.28)); lg.addColorStop(1, LD.shade(stem, -0.12));
      g.beginPath(); g.ellipse(len * 0.55, 0, len * 0.55, len * 0.26, 0, 0, Math.PI * 2);
      g.fillStyle = lg; g.fill();
      g.strokeStyle = LD.alpha(LD.shade(stem, -0.45), 0.55); g.lineWidth = Math.max(0.5, len * 0.05); g.stroke();
      if (len >= 6) { g.beginPath(); g.moveTo(len * 0.08, 0); g.lineTo(len * 0.95, 0); g.strokeStyle = LD.alpha(LD.shade(stem, -0.35), 0.5); g.lineWidth = Math.max(0.4, len * 0.04); g.stroke(); }
      g.restore();
      return { x: px, y: py, ang: ang };
    };
    const len = Math.max(4, Hh * 0.2);
    const us = tall === false ? [0.5] : [0.32, 0.66];
    us.forEach(function (u, i) { leafAt(u, -1, len * (1 - i * 0.12)); leafAt(u + 0.06, 1, len * (1 - i * 0.12)); });
    if (Hh >= 30 && tall !== false) { // 卷鬚
      const u = 0.86, px = x + (tx - x) * u, py = yb - stemH * u;
      g.beginPath(); g.moveTo(px, py);
      g.bezierCurveTo(px + Hh * 0.12, py - Hh * 0.04, px + Hh * 0.2, py + Hh * 0.04, px + Hh * 0.15, py + Hh * 0.07);
      g.strokeStyle = LD.shade(stem, 0.05); g.lineWidth = Math.max(0.6, Hh * 0.015); g.stroke();
    }
    // 頂端：花（紫／白）或豆莢
    const fr = Math.max(3, Hh * 0.11);
    if (flower === undefined) {
      g.save(); g.translate(tx + fr * 0.4, ty + fr * 0.3); g.rotate(0.55);
      const pod = LD.mix(stem, C['pea-green'], 0.5);
      const pg = g.createLinearGradient(0, -fr * 0.5, 0, fr * 0.5);
      pg.addColorStop(0, LD.shade(pod, 0.3)); pg.addColorStop(1, LD.shade(pod, -0.15));
      g.beginPath(); g.ellipse(0, 0, fr * 1.25, fr * 0.48, 0, 0, Math.PI * 2); g.fillStyle = pg; g.fill();
      g.strokeStyle = LD.alpha(LD.shade(pod, -0.45), 0.6); g.lineWidth = Math.max(0.5, fr * 0.1); g.stroke();
      if (fr >= 4) for (let i = -1; i <= 1; i++) { g.beginPath(); g.arc(i * fr * 0.6, 0, fr * 0.24, 0, Math.PI * 2); g.fillStyle = LD.alpha(LD.shade(pod, 0.45), 0.5); g.fill(); }
      g.restore();
    } else {
      const base = flower ? C['pea-purple'] : C['pea-white'];
      const edge = flower ? LD.shade(base, -0.35) : LD.alpha(LD.c.muted, 0.85);
      // 花萼
      g.beginPath(); g.ellipse(tx, ty + fr * 0.35, fr * 0.42, fr * 0.3, 0, 0, Math.PI * 2); g.fillStyle = LD.shade(stem, 0.05); g.fill();
      // 旗瓣（後面的大花瓣）
      const bg2 = g.createRadialGradient(tx - fr * 0.3, ty - fr * 0.75, fr * 0.1, tx, ty - fr * 0.4, fr * 1.1);
      bg2.addColorStop(0, LD.shade(base, flower ? 0.35 : 0.2)); bg2.addColorStop(1, flower ? LD.shade(base, -0.08) : LD.shade(base, -0.06));
      g.beginPath(); g.ellipse(tx, ty - fr * 0.45, fr * 0.95, fr * 0.8, 0, 0, Math.PI * 2);
      g.fillStyle = bg2; g.fill(); g.strokeStyle = edge; g.lineWidth = Math.max(0.6, fr * 0.1); g.stroke();
      // 翼瓣
      const wing = flower ? LD.shade(base, -0.18) : LD.shade(base, -0.1);
      [-1, 1].forEach(function (s) {
        g.beginPath(); g.ellipse(tx + s * fr * 0.42, ty + fr * 0.05, fr * 0.42, fr * 0.3, s * 0.5, 0, Math.PI * 2);
        g.fillStyle = wing; g.fill(); g.strokeStyle = edge; g.lineWidth = Math.max(0.5, fr * 0.08); g.stroke();
      });
    }
    // 長成這株植物的種子（追蹤種子性狀時）
    if (seed) { const sr = Math.max(3.4, Hh * 0.16); paintSeed(g, x - Hh * 0.27, yb - sr * 0.75, sr, seed.wrinkled, seed.fill); }
    g.restore();
  }
  function plantSprite(Hh, tall, flower, seed) {
    Hh = Math.max(8, Math.round(Hh));
    const w = Math.ceil(Hh * 0.95), h = Math.ceil(Hh * 1.24);
    const key = 'plant|' + Hh + '|' + tall + '|' + flower + '|' + (seed ? (seed.wrinkled ? 1 : 0) + seed.fill : '-');
    const s = sprite(key, w, h, function (g) { paintPlant(g, w * 0.56, h - Hh * 0.1, Hh, tall, flower, seed); });
    s.base = h - Hh * 0.1;
    s.ax = w * 0.56;
    return s;
  }
  /** 一個個體：只追蹤種子性狀就畫種子；追蹤植株性狀就畫植株（旁邊是它所來自的種子）。(x, y) 是方框中心 */
  function organism(g, x, y, size, ph) {
    const seedOn = ph.shape !== undefined || ph.color !== undefined;
    const plantOn = ph.flower !== undefined || ph.height !== undefined;
    const fill = ph.color === true ? C['pea-yellow'] : ph.color === false ? C['pea-green'] : C['pea-tan'];
    const wr = ph.shape === false;
    if (!plantOn) { drawSeed(g, x, y, size * 0.36, wr, fill); return; }
    const s = plantSprite(size * 0.8, ph.height, ph.flower, seedOn ? { wrinkled: wr, fill: fill } : null);
    g.drawImage(s.cv, x - s.ax, y + size * 0.44 - s.base, s.w, s.h);
  }

  // ---------- 配子：卵細胞（平滑、有外膜）與精細胞（畫在表面有小突起的花粉粒裡） ----------
  function paintGamete(g, x, y, r, egg) {
    const base = egg ? LD.c.accent : LD.c.equi;
    const body = LD.mix(base, LD.c['canvas-bg'], LD.dark ? 0.55 : 0.66);
    g.save();
    g.shadowColor = LD.dark ? 'rgba(0,0,0,0.5)' : LD.alpha(LD.c.text, 0.22);
    g.shadowBlur = 5; g.shadowOffsetY = 1.5;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = body; g.fill();
    g.restore();
    const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    gr.addColorStop(0, LD.shade(body, LD.dark ? 0.25 : 0.55)); gr.addColorStop(0.7, body); gr.addColorStop(1, LD.shade(body, -0.12));
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = gr; g.fill();
    if (!egg) {
      const n = 18;
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2;
        g.beginPath(); g.arc(x + Math.cos(a) * r * 0.97, y + Math.sin(a) * r * 0.97, Math.max(0.8, r * 0.085), 0, Math.PI * 2);
        g.fillStyle = LD.alpha(base, 0.85); g.fill();
      }
    }
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
    g.strokeStyle = LD.alpha(base, 0.9); g.lineWidth = egg ? 1.6 : 1.1; g.stroke();
    if (egg && r >= 8) { g.beginPath(); g.arc(x, y, r - 3, 0, Math.PI * 2); g.strokeStyle = LD.alpha(base, 0.3); g.lineWidth = 1; g.stroke(); }
  }
  function drawGamete(g, x, y, r, egg, label, hl) {
    r = Math.max(4, Math.round(r * 2) / 2);
    const pad = 6, S2 = 2 * (r + pad);
    const s = sprite('gam|' + (egg ? 1 : 0) + '|' + r, S2, S2, function (q) { paintGamete(q, S2 / 2, S2 / 2, r, egg); });
    if (hl > 0.02) {
      g.beginPath(); g.arc(x, y, r + 3 + 3 * hl, 0, Math.PI * 2);
      g.strokeStyle = LD.alpha(egg ? LD.c.accent : LD.c.equi, 0.6 * hl); g.lineWidth = 3; g.stroke();
    }
    g.drawImage(s.cv, x - S2 / 2, y - S2 / 2, S2, S2);
    if (label) txt(g, label, x, y + 0.5, { size: Math.max(9, r * 0.82), weight: 700, italic: true, family: SERIF, align: 'center', base: 'middle', maxW: r * 1.75, halo: false });
  }

  // ---------- 記號與文字 ----------
  function marker(g, k, x, y, r, color) {
    g.save();
    g.beginPath();
    if (k === 0) g.arc(x, y, r, 0, Math.PI * 2);
    else if (k === 1) { g.moveTo(x, y - r * 1.15); g.lineTo(x + r * 1.12, y + r * 0.82); g.lineTo(x - r * 1.12, y + r * 0.82); g.closePath(); }
    else if (k === 2) g.rect(x - r * 0.88, y - r * 0.88, r * 1.76, r * 1.76);
    else { g.moveTo(x, y - r * 1.25); g.lineTo(x + r * 1.05, y); g.lineTo(x, y + r * 1.25); g.lineTo(x - r * 1.05, y); g.closePath(); }
    g.lineJoin = 'round';
    g.lineWidth = 2.5; g.strokeStyle = LD.alpha(LD.c['canvas-bg'], 0.9); g.stroke();
    g.fillStyle = color; g.fill();
    g.restore();
  }
  function star(g, x, y, r, color) {
    g.save();
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, R = i % 2 ? r * 0.45 : r;
      if (i === 0) g.moveTo(x + R * Math.cos(a), y + R * Math.sin(a)); else g.lineTo(x + R * Math.cos(a), y + R * Math.sin(a));
    }
    g.closePath();
    g.lineJoin = 'round';
    g.lineWidth = 3; g.strokeStyle = LD.alpha(LD.c['canvas-bg'], 0.95); g.stroke();
    g.fillStyle = color; g.fill();
    g.lineWidth = 1; g.strokeStyle = LD.shade(color, -0.45); g.stroke();
    g.restore();
  }
  /** 文字：o = { size, weight, italic, family, color, align, base, maxW（太寬就縮小）, halo（預設有）, haloColor } */
  function txt(g, s, x, y, o) {
    o = o || {};
    const fam = o.family || FONT;
    let px = o.size || 12;
    const f = function (p) { return (o.italic ? 'italic ' : '') + (o.weight || 400) + ' ' + p.toFixed(1) + 'px ' + fam; };
    g.font = f(px);
    let w = g.measureText(s).width;
    if (o.maxW && w > o.maxW) { px = Math.max(px * 0.55, px * o.maxW / w); g.font = f(px); w = g.measureText(s).width; }
    g.textAlign = o.align || 'left';
    g.textBaseline = o.base || 'alphabetic';
    if (o.halo !== false) {
      g.lineJoin = 'round'; g.lineWidth = 3.5;
      g.strokeStyle = LD.alpha(o.haloColor || LD.c['canvas-bg'], 0.9);
      g.strokeText(s, x, y);
    }
    g.fillStyle = o.color || LD.c.text;
    g.fillText(s, x, y);
    return w;
  }
  function measure(g, s, size, weight, family) { g.font = (weight || 400) + ' ' + size + 'px ' + (family || FONT); return g.measureText(s).width; }
  function ease(t) { t = Math.max(0, Math.min(1, t)); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function quad(a, c, b, t) { const u = 1 - t; return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y }; }
  function lerp(a, b, t) { return a + (b - a) * t; }

  // ---------- 畫布與版面 ----------
  const cv = $('cv'), ctx = cv.getContext('2d');
  const cv2 = $('cv2'), ctx2 = cv2.getContext('2d');
  let W = 300, H = 400, S = null, W2 = 300, H2 = 340, Q = null;

  function hasPlant() { return traitsOn().some(function (t) { return MC.TRAITS[t].part === 'plant'; }); }
  function chipItems() { const out = []; for (let c = 0; c < nClass(); c++) out.push({ c: c, name: phenoName(c, true) }); return out; }
  function chipWidths(g) {
    const wn = measure(g, '20000', 12, 700);
    return chipItems().map(function (o) { return 16 + measure(g, o.name, 12, 600) + 5 + wn + 14; });
  }

  function sceneLayout() {
    const k = fk(), narrow = W < 600, pad = narrow ? 8 : 12;
    const cardW = narrow ? (W - pad * 3) / 2 : Math.min(330, W * 0.35);
    const titleH = Math.round(24 * k);
    // 窄版多留一行：基因型名稱可能要拆成兩行
    const cardH = Math.max(narrow ? 104 : 112, titleH + Math.round(30 * k) + (state.L + 1) * Math.round(17 * k) + 10 + (narrow ? Math.round(12 * k) : 0));
    const p1 = { x: pad, y: pad, w: cardW, h: cardH };
    const p2 = { x: W - pad - cardW, y: pad, w: cardW, h: cardH };
    const labH = Math.round(14 * k);
    const gh = labH + 40;
    const gy = pad + cardH + 6;
    const g1 = { x: p1.x, y: gy, w: cardW, h: gh, labH: labH }, g2 = { x: p2.x, y: gy, w: cardW, h: gh, labH: labH };
    const zr = narrow ? 22 : 30;
    let cy, trayTop;
    if (narrow) { cy = gy + gh + 14 + zr; trayTop = cy + zr + Math.round(24 * k) + 6; }
    else { cy = pad + (cardH + 6 + gh) * 0.46; trayTop = gy + gh + 20; }
    const zone = { cx: W / 2, cy: cy, r: zr };
    const plant = hasPlant();
    const pitch = plant ? (narrow ? 32 : 36) : (narrow ? 21 : 25);
    const rows = plant ? 3 : (narrow ? 5 : 4);
    const tw = W - pad * 2, innerW = tw - 16;
    const cols = Math.max(4, Math.floor((innerW - 8) / pitch));
    const cw = chipWidths(ctx), total = cw.reduce(function (a, b) { return a + b; }, 0);
    const chipRows = total <= innerW - 12 ? 1 : 2;
    const headH = Math.round(26 * k) + chipRows * Math.round(19 * k) + 4;
    const innerH = rows * pitch + 10;
    const tray = { x: pad, y: trayTop, w: tw, h: headH + innerH + 8 };
    const inner = { x: tray.x + 8, y: tray.y + headH, w: innerW, h: innerH };
    H = Math.round(tray.y + tray.h + pad);
    return { narrow: narrow, pad: pad, k: k, p1: p1, p2: p2, g1: g1, g2: g2, zone: zone, tray: tray, inner: inner, pitch: pitch, rows: rows, cols: cols, cap: rows * cols, chipRows: chipRows, chipW: cw };
  }
  function slotXY(i) {
    const c = i % S.cols, r = Math.floor(i / S.cols);
    const x0 = S.inner.x + (S.inner.w - S.cols * S.pitch) / 2, y0 = S.inner.y + 5;
    return { x: x0 + (c + 0.5) * S.pitch, y: y0 + (r + 0.5) * S.pitch };
  }
  /** 親本 who（1 母、2 父）第 k 個配子格在畫面上的位置 */
  function slotPos(who, k) {
    const r = who === 1 ? S.g1 : S.g2, m = (who === 1 ? cr.slots1 : cr.slots2).length;
    const sp = r.w / m;
    return { x: r.x + sp * (k + 0.5), y: r.y + r.labH + (r.h - r.labH) / 2, r: Math.min(15, sp * 0.34) };
  }
  function remapTray() {
    const cap = S.cap;
    trayArr = new Array(cap).fill(null);
    recent.slice().sort(function (a, b) { return a.id - b.id; }).slice(-cap).forEach(function (it) {
      const s = (it.id - 1) % cap;
      if (!trayArr[s] || trayArr[s].id < it.id) trayArr[s] = it;
    });
  }

  function chartLayout() {
    const k = fk(), narrow = W2 < 640, pad = narrow ? 8 : 12;
    const titleH = Math.round(26 * k);
    let P, B;
    if (narrow) {
      const side = Math.min(W2 - pad * 2, 420);
      P = { x: (W2 - side) / 2, y: pad, w: side, h: titleH + side };
      B = { x: pad, y: P.y + P.h + 18, w: W2 - pad * 2, h: Math.round((state.L === 2 ? 300 : 270) + 50 * (k - 1)) };
      H2 = Math.round(B.y + B.h + pad);
    } else {
      const side = Math.min(Math.round(W2 * 0.44), 390);
      P = { x: pad, y: pad, w: side, h: titleH + side };
      B = { x: P.x + side + 26, y: pad, w: W2 - side - 26 - pad * 2, h: Math.max(P.h, Math.round(320 * k)) };
      H2 = Math.round(Math.max(P.h, B.h) + pad * 2);
    }
    return { narrow: narrow, pad: pad, k: k, titleH: titleH, P: P, B: B };
  }

  function resize() {
    const w = cv.clientWidth;
    if (!w || !cr) return;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    W = w;
    const oldCap = S ? S.cap : -1;
    S = sceneLayout();
    if (cv.style.height !== H + 'px') cv.style.height = H + 'px';
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    if (S.cap !== oldCap) remapTray();
    W2 = cv2.clientWidth || W;
    Q = chartLayout();
    if (cv2.style.height !== H2 + 'px') cv2.style.height = H2 + 'px';
    cv2.width = Math.round(W2 * dpr); cv2.height = Math.round(H2 * dpr);
    draw();
  }

  // ---------- 畫面：親本、配子、受精、收成盤 ----------
  function drawCard(r, who) {
    const g = ctx, k = S.k;
    const col = who === 1 ? LD.c.accent : LD.c.equi;
    const face = LD.mix(LD.c.surface, LD.c['canvas-bg'], 0.25);
    LD.block(g, r.x, r.y, r.w, r.h, face, { r: 12, stroke: LD.alpha(col, 0.5) });
    g.save(); LD.roundRect(g, r.x, r.y, r.w, r.h, 12); g.clip();
    g.fillStyle = LD.alpha(col, 0.85); g.fillRect(r.x, r.y, 4, r.h);
    g.restore();
    txt(g, who === 1 ? T('母本 ♀', 'Mother ♀') : T('父本 ♂', 'Father ♂'), r.x + 12, r.y + 17 * k, { size: 13, weight: 700, color: col, halo: false, maxW: r.w * 0.5 });
    if (who === 1 && state.my.on) {
      g.save();
      LD.pill(g, state.my.answered ? T('已揭曉', 'Revealed') : T('神秘豌豆', 'Mystery pea'), r.x + r.w - 8, r.y + 21 * k, LD.c.probe, 'right', '600 11px ' + FONT);
      g.restore();
    }
    const top = r.y + 24 * k;
    const ia = Math.max(30, Math.min(r.h - (top - r.y) - 6, r.w * 0.42));
    const ix = r.x + 10 + ia / 2, iy = top + ia / 2;
    const sg = g.createRadialGradient(ix, iy + ia * 0.1, ia * 0.05, ix, iy + ia * 0.1, ia * 0.6);
    sg.addColorStop(0, LD.alpha(col, LD.dark ? 0.16 : 0.1)); sg.addColorStop(1, LD.alpha(col, 0));
    g.fillStyle = sg; g.fillRect(ix - ia / 2, iy - ia / 2, ia, ia);
    const gg = who === 1 ? gMother() : gFather();
    organism(g, ix, iy, ia, phOf(MC.phenoIndex(gg)));
    const tx = r.x + 10 + ia + 10, tw = r.x + r.w - 8 - tx;
    const gt = who === 1 ? motherText() : geno(gg);
    g.save();
    g.font = 'italic 700 18px ' + SERIF;
    const gw = g.measureText(gt).width + 12;
    const gfont = gw > tw ? 'italic 700 ' + Math.max(11, 18 * tw / gw).toFixed(1) + 'px ' + SERIF : 'italic 700 18px ' + SERIF;
    LD.pill(g, gt, tx, top + 26 * k, LD.c.text, 'left', gfont);
    g.restore();
    let y = top + 26 * k + 17 * k;
    const bits = MC.phenoBits(MC.phenoIndex(gg), state.L);
    traitsOn().forEach(function (t, i) {
      const w = bits[i] ? MC.TRAITS[t].dom : MC.TRAITS[t].rec;
      txt(g, T(w[0], w[1]), tx + 2, y, { size: 12.5, color: LD.c.text, maxW: tw, haloColor: face });
      y += 17 * k;
    });
    // 基因型的名稱（同型合子／異型合子）
    const kindTxt = who === 1 && hidden() ? T('基因型未知', 'genotype unknown')
      : state.L === 1 ? genoWord(gg[0]) : gg.every(function (x) { return x === 1; }) ? T('雙異型合子', 'double heterozygote') : gg.every(function (x) { return x !== 1; }) ? T('同型合子', 'homozygous') : T('一對同型、一對異型', 'partly heterozygous');
    // 手機上卡片窄：放不下就拆成兩行，不要縮成看不清楚的小字
    const kl = wrap2(g, kindTxt, 11.5, tw), lh = Math.round(13 * k);
    if (kl.length === 2 && y + lh <= r.y + r.h - 4) {
      txt(g, kl[0], tx + 2, y, { size: 11.5, color: LD.c.muted, maxW: tw, haloColor: face });
      txt(g, kl[1], tx + 2, y + lh, { size: 11.5, color: LD.c.muted, maxW: tw, haloColor: face });
    } else txt(g, kindTxt, tx + 2, y, { size: 11.5, color: LD.c.muted, maxW: tw, haloColor: face });
  }
  function wrap2(g, s, size, maxW) {
    if (measure(g, s, size) <= maxW) return [s];
    let cut = s.indexOf('、') >= 0 ? s.indexOf('、') + 1 : -1;
    if (cut < 0) {
      // 英文：取第一行放得下的最後一個空白
      let best = -1;
      for (let i = s.indexOf(' '); i > 0; i = s.indexOf(' ', i + 1)) if (best < 0 || measure(g, s.slice(0, i), size) <= maxW) best = i;
      if (best > 0) return [s.slice(0, best), s.slice(best + 1)];
      cut = Math.ceil(s.length / 2);
    }
    return [s.slice(0, cut), s.slice(cut)];
  }
  function drawGametes(r, who) {
    const g = ctx, slots = who === 1 ? cr.slots1 : cr.slots2;
    txt(g, who === 1 ? T('雌配子（卵）', 'Eggs') : T('雄配子（精細胞）', 'Sperm cells'), r.x + 4, r.y + r.labH - 2, { size: 11, weight: 600, color: LD.c.muted, maxW: r.w - 8 });
    for (let k2 = 0; k2 < slots.length; k2++) {
      const p = slotPos(who, k2);
      const label = who === 1 && hidden() ? '?' : MC.gameteStr(slots[k2], syms());
      drawGamete(g, p.x, p.y, p.r, who === 1, label, slotFlash[who - 1][k2] || 0);
    }
  }
  function guide(g, a, c, b) {
    g.save();
    g.setLineDash([4, 5]);
    g.strokeStyle = LD.alpha(LD.c.muted, LD.dark ? 0.4 : 0.35);
    g.lineWidth = 1.3; g.lineCap = 'round';
    g.beginPath(); g.moveTo(a.x, a.y); g.quadraticCurveTo(c.x, c.y, b.x, b.y); g.stroke();
    g.setLineDash([]);
    const ang = Math.atan2(b.y - c.y, b.x - c.x), L2 = 6;
    g.beginPath();
    g.moveTo(b.x, b.y);
    g.lineTo(b.x - L2 * Math.cos(ang - 0.45), b.y - L2 * Math.sin(ang - 0.45));
    g.lineTo(b.x - L2 * Math.cos(ang + 0.45), b.y - L2 * Math.sin(ang + 0.45));
    g.closePath(); g.fillStyle = LD.alpha(LD.c.muted, LD.dark ? 0.5 : 0.45); g.fill();
    g.restore();
  }
  function drawZone() {
    const g = ctx, Z = S.zone, k = S.k;
    // 導引線：配子 → 受精 → 收成盤
    if (S.narrow) {
      const a = { x: S.g1.x + S.g1.w / 2, y: S.g1.y + S.g1.h }, b = { x: S.g2.x + S.g2.w / 2, y: S.g2.y + S.g2.h };
      guide(g, a, { x: a.x, y: Z.cy }, { x: Z.cx - Z.r - 4, y: Z.cy });
      guide(g, b, { x: b.x, y: Z.cy }, { x: Z.cx + Z.r + 4, y: Z.cy });
    } else {
      const a = { x: S.g1.x + S.g1.w + 4, y: S.g1.y + S.g1.h * 0.6 }, b = { x: S.g2.x - 4, y: S.g2.y + S.g2.h * 0.6 };
      guide(g, a, { x: Z.cx - Z.r * 2.2, y: a.y }, { x: Z.cx - Z.r - 4, y: Z.cy + 4 });
      guide(g, b, { x: Z.cx + Z.r * 2.2, y: b.y }, { x: Z.cx + Z.r + 4, y: Z.cy + 4 });
    }
    const ly = Z.cy + Z.r + 16 * k;
    if (S.tray.y - 3 - (ly + 6) > 14) guide(g, { x: Z.cx, y: ly + 6 }, { x: Z.cx, y: (ly + S.tray.y) / 2 }, { x: Z.cx, y: S.tray.y - 3 });
    // 受精的地方：柔和的光暈＋虛線圈
    const gl = g.createRadialGradient(Z.cx, Z.cy, 0, Z.cx, Z.cy, Z.r * 1.4);
    gl.addColorStop(0, LD.alpha(C['b-genetics'], LD.dark ? 0.22 : 0.16)); gl.addColorStop(1, LD.alpha(C['b-genetics'], 0));
    g.fillStyle = gl; g.beginPath(); g.arc(Z.cx, Z.cy, Z.r * 1.4, 0, Math.PI * 2); g.fill();
    g.save();
    g.setLineDash([3, 4]); g.strokeStyle = LD.alpha(C['b-genetics'], 0.6); g.lineWidth = 1.5;
    g.beginPath(); g.arc(Z.cx, Z.cy, Z.r, 0, Math.PI * 2); g.stroke();
    g.restore();
    g.save();
    LD.pill(g, T('受精', 'Fertilisation'), Z.cx, ly, C['b-genetics'], 'center', '600 11.5px ' + FONT);
    g.restore();
  }
  function drawTray() {
    const g = ctx, t = S.tray, k = S.k, now = performance.now();
    const wood = LD.mix(C['b-geo'], LD.c.surface, LD.dark ? 0.68 : 0.5);
    const ink = LD.dark ? LD.c.text : LD.shade(wood, -0.75);
    LD.block(g, t.x, t.y, t.w, t.h, wood, { r: 12 });
    g.save(); LD.roundRect(g, t.x, t.y, t.w, t.h, 12); g.clip();
    for (let i = 0; i < 7; i++) { // 木紋
      const y = t.y + t.h * (0.08 + i * 0.14);
      g.beginPath(); g.moveTo(t.x, y);
      g.bezierCurveTo(t.x + t.w * 0.3, y - 3, t.x + t.w * 0.7, y + 3, t.x + t.w, y - 1);
      g.strokeStyle = LD.alpha(LD.shade(wood, -0.35), 0.13); g.lineWidth = 1; g.stroke();
    }
    g.restore();
    const ty = t.y + 18 * k;
    txt(g, T('收成盤', 'Harvest tray'), t.x + 12, ty, { size: 13, weight: 700, color: ink, halo: false });
    txt(g, T('共 ' + counts.N + ' 個子代', counts.N + (counts.N === 1 ? ' offspring' : ' offspring')), t.x + t.w - 12, ty, { size: 12.5, weight: 700, color: ink, halo: false, align: 'right' });
    // 各表現型的計數
    const items = chipItems(), perRow = S.chipRows === 1 ? items.length : Math.ceil(items.length / 2);
    for (let row = 0; row < S.chipRows; row++) {
      let x = t.x + 12;
      const y = ty + (row + 1) * 19 * k;
      for (let i = row * perRow; i < Math.min(items.length, (row + 1) * perRow); i++) {
        const c = items[i].c;
        marker(g, c, x + 5, y - 4.5 * k, 4.6, classColor(c));
        let w = txt(g, items[i].name, x + 14, y, { size: 12, weight: 600, color: ink, halo: false });
        w += txt(g, String(counts.pheno[c]), x + 14 + w + 5, y, { size: 12, weight: 700, color: ink, halo: false });
        x += Math.max(S.chipW[i], 14 + w + 5 + 14);
      }
    }
    // 盤面（淺色的淺盤）
    const R = S.inner;
    const dish = LD.dark ? LD.mix(LD.c['canvas-bg'], C['b-geo'], 0.1) : LD.mix(LD.c.surface, C['b-geo'], 0.09);
    LD.roundRect(g, R.x, R.y, R.w, R.h, 8);
    g.fillStyle = dish; g.fill();
    g.save(); LD.roundRect(g, R.x, R.y, R.w, R.h, 8); g.clip();
    const ig = g.createLinearGradient(0, R.y, 0, R.y + 12);
    ig.addColorStop(0, LD.shadowInk(LD.dark ? 0.35 : 0.14)); ig.addColorStop(1, LD.shadowInk(0));
    g.fillStyle = ig; g.fillRect(R.x, R.y, R.w, 12);
    g.restore();
    LD.roundRect(g, R.x + 0.5, R.y + 0.5, R.w - 1, R.h - 1, 8);
    g.strokeStyle = LD.alpha(LD.shade(wood, -0.4), 0.55); g.lineWidth = 1; g.stroke();
    // 凹槽與子代
    for (let i = 0; i < S.cap; i++) {
      const p = slotXY(i), it = trayArr[i];
      if (!it) {
        g.beginPath(); g.ellipse(p.x, p.y + S.pitch * 0.05, S.pitch * 0.2, S.pitch * 0.12, 0, 0, Math.PI * 2);
        g.fillStyle = LD.shadowInk(LD.dark ? 0.22 : 0.07); g.fill();
        continue;
      }
      const age = now - it.landedAt;
      if (!reducedMotion && age < 1300) {
        const a = 1 - age / 1300;
        g.beginPath(); g.arc(p.x, p.y, S.pitch * 0.5, 0, Math.PI * 2);
        g.fillStyle = LD.alpha(C['b-genetics'], 0.22 * a); g.fill();
        g.strokeStyle = LD.alpha(C['b-genetics'], 0.7 * a); g.lineWidth = 1.5; g.stroke();
      }
      organism(g, p.x, p.y, S.pitch * 0.92, phOf(it.pheno));
    }
  }
  function drawFlights() {
    const g = ctx, Z = S.zone;
    const center = { x: Z.cx, y: Z.cy };
    flights.forEach(function (f) {
      if (!f.launched) return;
      const u = clock - f.at, it = f.it;
      const e0 = slotPos(1, it.i), p0 = slotPos(2, it.j);
      const eL = { x: Z.cx - Z.r * 0.42, y: Z.cy }, pR = { x: Z.cx + Z.r * 0.42, y: Z.cy };
      const et = hidden() ? '?' : MC.gameteStr(cr.slots1[it.i], syms()), pt = MC.gameteStr(cr.slots2[it.j], syms());
      const rb = Math.min(13, e0.r);
      if (u < FLY) {
        const a = ease(u / FLY);
        const ep = quad(e0, { x: (e0.x + eL.x) / 2, y: Math.min(e0.y, eL.y) - 26 }, eL, a);
        const pp = quad(p0, { x: (p0.x + pR.x) / 2, y: Math.min(p0.y, pR.y) - 26 }, pR, a);
        drawGamete(g, ep.x, ep.y, rb, true, et, 0);
        drawGamete(g, pp.x, pp.y, rb, false, pt, 0);
      } else if (u < FLY + MERGE) {
        const b = (u - FLY) / MERGE;
        g.save(); g.globalAlpha = 1 - b;
        drawGamete(g, lerp(eL.x, Z.cx, b), Z.cy, rb, true, et, 0);
        drawGamete(g, lerp(pR.x, Z.cx, b), Z.cy, rb, false, pt, 0);
        g.restore();
        if (!reducedMotion) LD.ripple(g, Z.cx, Z.cy, Z.r * 0.5, b, C['b-genetics']);
        g.save(); g.globalAlpha = Math.min(1, b * 1.4);
        LD.ball(g, Z.cx, Z.cy, Math.round(Z.r * (0.34 + 0.16 * b) * 2) / 2, C['b-genetics'], { glow: 0.35 });
        g.restore();
        if (!hidden()) { g.save(); g.globalAlpha = b; LD.pill(g, geno(it.g), Z.cx, Z.cy - Z.r * 0.6 - 4, LD.c.text, 'center', 'italic 700 14px ' + SERIF); g.restore(); }
      } else {
        const c = ease((u - FLY - MERGE) / DROP);
        const tgt = slotXY((it.id - 1) % S.cap);
        const pos = quad(center, { x: (Z.cx + tgt.x) / 2, y: Math.min(Z.cy, tgt.y) - 34 }, tgt, c);
        const size = Math.round(lerp(Z.r * 1.5, S.pitch * 0.92, c) / 2) * 2;
        organism(g, pos.x, pos.y, size, phOf(it.pheno));
        if (!hidden() && c < 0.45) { g.save(); g.globalAlpha = 1 - c / 0.45; LD.pill(g, geno(it.g), pos.x, pos.y - size * 0.5 - 4, LD.c.text, 'center', 'italic 700 14px ' + SERIF); g.restore(); }
      }
    });
    drops.forEach(function (d) {
      if (clock < d.at) return;
      const u = Math.min(1, (clock - d.at) / d.dur);
      const tgt = slotXY((d.it.id - 1) % S.cap);
      const pos = quad(d.from, { x: (d.from.x + tgt.x) / 2, y: Math.min(d.from.y, tgt.y) - 40 }, tgt, u * u * (3 - 2 * u));
      const size = Math.round(S.pitch * (0.6 + 0.32 * u) / 2) * 2;
      organism(g, pos.x, pos.y, size, phOf(d.it.pheno));
    });
  }
  function drawScene() {
    const g = ctx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    LD.backdrop(g, W, H);
    drawZone();
    drawCard(S.p1, 1); drawCard(S.p2, 2);
    drawGametes(S.g1, 1); drawGametes(S.g2, 2);
    drawTray();
    drawFlights();
  }

  // ---------- 畫面：龐氏方格與長條圖 ----------
  function punnettGrid() {
    const rowsG = state.merge ? crShow.gametes1 : crShow.slots1.map(function (a) { return { a: a, p: MC.frac(1, crShow.slots1.length) }; });
    const colsG = state.merge ? crShow.gametes2 : crShow.slots2.map(function (a) { return { a: a, p: MC.frac(1, crShow.slots2.length) }; });
    const P = Q.P, side = P.w, top = P.y + Q.titleH;
    const hs = Math.round(Math.max(34, Math.min(50, side * 0.14)) * Math.min(Q.k, 1.25));
    return { rows: rowsG, cols: colsG, top: top, hs: hs, x0: P.x + hs, y0: top + hs, cw: (side - hs) / colsG.length, ch: (side - hs) / rowsG.length };
  }
  function dispIndex(who, slotIdx) {
    if (!state.merge) return slotIdx;
    const key = (who === 1 ? cr.slots1 : cr.slots2)[slotIdx].join('');
    const list = who === 1 ? crShow.gametes1 : crShow.gametes2;
    for (let i = 0; i < list.length; i++) if (list[i].a.join('') === key) return i;
    return -1;
  }
  function drawPunnett(g) {
    const P = Q.P, G = punnettGrid(), k = Q.k;
    const title = T('龐氏方格', 'Punnett square') + (state.my.on ? T('（依你的假說）', ' (your hypothesis)') : '');
    txt(g, title, P.x, P.y + 16 * k, { size: 13.5, weight: 700, maxW: P.w * 0.6 });
    const m1 = crShow.slots1.length, m2 = crShow.slots2.length;
    const right = state.merge ? T('格內分數＝機率', 'fraction in a cell = probability') : T('每格機率 1/' + (m1 * m2), 'each cell: 1/' + (m1 * m2));
    txt(g, right, P.x + P.w, P.y + 16 * k, { size: 11.5, color: LD.c.muted, align: 'right', maxW: P.w * 0.38 });
    // 左上角
    const cx0 = P.x, cy0 = G.top;
    g.save();
    g.strokeStyle = LD.alpha(LD.c.muted, 0.5); g.lineWidth = 1;
    g.beginPath(); g.moveTo(cx0 + 4, cy0 + 4); g.lineTo(cx0 + G.hs - 4, cy0 + G.hs - 4); g.stroke();
    g.restore();
    txt(g, '♀', cx0 + G.hs * 0.27, cy0 + G.hs * 0.78, { size: 13, weight: 700, color: LD.c.accent, align: 'center', base: 'middle' });
    txt(g, '♂', cx0 + G.hs * 0.73, cy0 + G.hs * 0.26, { size: 13, weight: 700, color: LD.c.equi, align: 'center', base: 'middle' });
    const rb = Math.min(G.hs * 0.34, 16);
    const sy = syms();
    G.cols.forEach(function (o, j) {
      const x = G.x0 + (j + 0.5) * G.cw, y = G.top + G.hs * (state.merge ? 0.42 : 0.5);
      drawGamete(g, x, y, rb, false, MC.gameteStr(o.a, sy), 0);
      if (state.merge) txt(g, MC.fstr(o.p), x, G.top + G.hs - 2, { size: 10, color: LD.c.muted, align: 'center' });
    });
    G.rows.forEach(function (o, i) {
      const x = P.x + G.hs * (state.merge ? 0.4 : 0.5), y = G.y0 + (i + 0.5) * G.ch;
      drawGamete(g, x, y, rb, true, MC.gameteStr(o.a, sy), 0);
      if (state.merge) txt(g, MC.fstr(o.p), x, y + rb + 12, { size: 10, color: LD.c.muted, align: 'center' });
    });
    // 命中次數（神秘模式不顯示：方格是假說，不是實際的雜交）
    let hits = null;
    if (!state.my.on && counts.N > 0) {
      hits = {};
      const s1 = cr.slots1.length, s2 = cr.slots2.length;
      for (let i = 0; i < s1; i++) for (let j = 0; j < s2; j++) {
        const key = dispIndex(1, i) + ',' + dispIndex(2, j);
        hits[key] = (hits[key] || 0) + counts.cell[i * s2 + j];
      }
    }
    const cs = Math.min(G.cw, G.ch);
    G.rows.forEach(function (ro, i) {
      G.cols.forEach(function (co, j) {
        const x = G.x0 + j * G.cw, y = G.y0 + i * G.ch, w = G.cw, h = G.ch;
        const zg = MC.zygote(ro.a, co.a), pi = MC.phenoIndex(zg), col = classColor(pi);
        LD.roundRect(g, x + 2, y + 2, w - 4, h - 4, 6);
        g.fillStyle = LD.alpha(col, LD.dark ? 0.2 : 0.12); g.fill();
        g.strokeStyle = LD.alpha(col, 0.5); g.lineWidth = 1; g.stroke();
        const fl = cellFlash[i + ',' + j] || 0;
        if (fl > 0.02) {
          LD.roundRect(g, x + 2, y + 2, w - 4, h - 4, 6);
          g.fillStyle = LD.alpha(col, 0.32 * fl); g.fill();
          g.strokeStyle = LD.alpha(col, 0.9 * fl); g.lineWidth = 2.5; g.stroke();
        }
        const gs = Math.max(11, Math.min(19, cs * 0.2));
        const big = cs >= 52;
        txt(g, geno(zg), x + w / 2, big ? y + 6 + gs : y + h / 2, { size: gs, weight: 700, italic: true, family: SERIF, align: 'center', base: big ? 'alphabetic' : 'middle', maxW: w - 10 });
        if (big) organism(g, x + w / 2, y + h * 0.6, Math.round(Math.min(cs * 0.5, 64) / 2) * 2, phOf(pi));
        marker(g, pi, x + 10, y + 10, 3.6, col);
        if (hits) txt(g, '×' + (hits[i + ',' + j] || 0), x + w - 6, y + h - 6, { size: 10, color: LD.c.muted, align: 'right' });
        if (state.merge) txt(g, MC.fstr(MC.fmul(ro.p, co.p)), x + 6, y + h - 6, { size: 10, color: LD.c.muted });
      });
    });
  }
  function drawBars(g) {
    const B = Q.B, k = Q.k, L = state.L, N = counts.N;
    const gmode = state.genoChart && !state.my.on;
    const nCat = gmode ? Math.pow(3, L) : nClass();
    const probs = (gmode ? crShow.genoP : crShow.phenoP).map(MC.fval);
    const obs = gmode ? counts.geno : counts.pheno;
    const md = (!gmode && state.showMendel) ? mendelData() : null;
    const mN = md ? md.counts.reduce(function (a, b) { return a + b; }, 0) : 0;
    const title = gmode ? T('子代的基因型比例', 'Offspring genotype fractions') : T('子代的表現型比例', 'Offspring phenotype fractions');
    const tw = txt(g, title, B.x, B.y + 16 * k, { size: 13.5, weight: 700, maxW: B.w });
    // 卡方檢定（一律用表現型）
    const ch = chiNow();
    let pillTxt, pillCol;
    if (N === 0) { pillTxt = T('χ² 檢定：尚無子代', 'χ² test: no offspring yet'); pillCol = LD.c.muted; }
    else if (ch.impossible) { pillTxt = 'χ² = ∞　p = 0'; pillCol = LD.c.pos; }
    else if (ch.df === 0) { pillTxt = T('只有一種表現型（df = 0）', 'One phenotype only (df = 0)'); pillCol = LD.c.muted; }
    else { pillTxt = 'χ² = ' + fmtChi(ch.chi2) + '　df = ' + ch.df + '　p = ' + fmtP(ch.p); pillCol = ch.p > 0.05 ? LD.c.probe : LD.c.pos; }
    g.save();
    g.font = '600 12px ' + FONT;
    const pw = g.measureText(pillTxt).width + 12;
    const sameLine = tw + 12 + pw <= B.w;
    const pillY = sameLine ? B.y + 20 * k : B.y + 40 * k;
    LD.pill(g, pillTxt, B.x + B.w, pillY, pillCol, 'right', '600 12px ' + FONT);
    g.restore();
    const plotTop = pillY + 8 + 30 * k;
    const labH = Math.round((gmode ? 30 : (L === 2 ? 66 : 52)) * k);
    g.font = '11px ' + FONT;
    const axW = g.measureText('100%').width + 10;
    const plot = { x: B.x + axW, y: plotTop, w: B.w - axW - 4, h: B.y + B.h - labH - plotTop };
    // 縱軸範圍：照資料調整
    let m = 0.05;
    probs.forEach(function (p) { m = Math.max(m, p + (state.showRange && N > 0 && p > 0 && p < 1 ? 1.96 * Math.sqrt(p * (1 - p) / N) : 0)); });
    if (N > 0) obs.forEach(function (o) { m = Math.max(m, o / N); });
    if (md) md.counts.forEach(function (c2) { m = Math.max(m, c2 / mN); });
    let step = 0.25, ymax = 1;
    const steps = [0.05, 0.1, 0.2, 0.25];
    for (let i = 0; i < steps.length; i++) { const n = Math.ceil(m * 1.06 / steps[i] - 1e-9); if (n <= 5) { step = steps[i]; ymax = Math.min(1, n * steps[i]); break; } }
    const Y = function (v) { return plot.y + plot.h * (1 - v / ymax); };
    const snap = function (v) { return Math.round(v * dpr) / dpr + 0.5 / dpr; };
    for (let v = 0; v <= ymax + 1e-9; v += step) {
      const y = snap(Y(v));
      g.beginPath(); g.moveTo(plot.x, y); g.lineTo(plot.x + plot.w, y);
      g.strokeStyle = LD.alpha(LD.c.text, v === 0 ? 0.45 : (LD.dark ? 0.11 : 0.1)); g.lineWidth = v === 0 ? 1.2 : 1 / dpr; g.stroke();
      txt(g, Math.round(v * 100) + '%', plot.x - 5, y, { size: 11, color: LD.c.muted, align: 'right', base: 'middle', halo: false });
    }
    const sw = plot.w / nCat, bw = Math.min(58, sw * 0.52);
    for (let c2 = 0; c2 < nCat; c2++) {
      const cx = plot.x + sw * (c2 + 0.5), p = probs[c2];
      const cls = gmode ? MC.phenoIndex(MC.genoOf(c2, L)) : c2, col = classColor(cls);
      let topY = Y(0);
      if (N > 0 && obs[c2] > 0) {
        const f = obs[c2] / N, yTop = Y(f);
        LD.block(g, cx - bw / 2, yTop, bw, Y(0) - yTop, col, { r: Math.min(5, bw * 0.15) });
        topY = Math.min(topY, yTop);
      }
      if (p > 0) {
        g.save(); g.setLineDash([5, 4]);
        g.strokeStyle = LD.alpha(LD.c.text, 0.65); g.lineWidth = 1.5;
        g.strokeRect(cx - bw / 2 - 4, Y(p), bw + 8, Y(0) - Y(p));
        g.restore();
        topY = Math.min(topY, Y(p));
      }
      if (state.showRange && N > 0 && p > 0 && p < 1) {
        const s = 1.96 * Math.sqrt(p * (1 - p) / N), lo = Y(Math.max(0, p - s)), hi = Y(Math.min(1, p + s));
        g.save(); g.lineCap = 'round';
        [[LD.alpha(LD.c['canvas-bg'], 0.85), 4.5], [LD.alpha(LD.c.text, 0.85), 1.6]].forEach(function (st) {
          g.strokeStyle = st[0]; g.lineWidth = st[1];
          g.beginPath(); g.moveTo(cx, lo); g.lineTo(cx, hi); g.moveTo(cx - 6, lo); g.lineTo(cx + 6, lo); g.moveTo(cx - 6, hi); g.lineTo(cx + 6, hi); g.stroke();
        });
        g.restore();
        topY = Math.min(topY, hi);
      }
      if (md) { const yM = Y(md.counts[c2] / mN); star(g, cx + bw / 2 + 10, yM, 6.5, C.star); }
      if (N > 0 && (p > 0 || obs[c2] > 0)) {
        const f = obs[c2] / N;
        if (sw >= 46) {
          txt(g, String(obs[c2]), cx, topY - 6 - 13 * k, { size: 11.5, weight: 700, align: 'center' });
          txt(g, pct(f), cx, topY - 5, { size: 10.5, color: LD.c.muted, align: 'center' });
        } else txt(g, pct(f), cx, topY - 5, { size: 10, color: LD.c.muted, align: 'center', maxW: sw - 2 });
      }
      // 類別名稱
      const ly = plot.y + plot.h + 6;
      if (gmode) {
        const gt = geno(MC.genoOf(c2, L));
        const w = txt(g, gt, cx, ly + 13 * k, { size: 13, weight: 700, italic: true, family: SERIF, align: 'center', maxW: sw - 4 });
        g.fillStyle = col; g.fillRect(cx - w / 2, ly + 17 * k, w, 2.5);
      } else {
        const tok = Math.min(28, sw * 0.6);
        organism(g, cx, ly + tok / 2 + 1, Math.round(tok / 2) * 2, phOf(c2));
        // 形狀記號放在豌豆左邊，名稱可以用整格寬度（手機上四類並排時才不會擠在一起）
        marker(g, c2, cx - tok / 2 - 9, ly + tok / 2 + 1, 4.2, col);
        const bits = MC.phenoBits(c2, L);
        let y = ly + tok + 14 * k;
        traitsOn().forEach(function (t, i) {
          const w = bits[i] ? MC.TRAITS[t].dom : MC.TRAITS[t].rec;
          txt(g, T(w[0], w[1]), cx, y, { size: 12, weight: 600, align: 'center', maxW: sw - 6 });
          y += 15 * k;
        });
      }
    }
    if (N === 0) {
      g.save();
      LD.pill(g, T('按 +1、+10、+100 或 +1000 產生子代', 'Press +1, +10, +100 or +1000 to produce offspring'), plot.x + plot.w / 2, plot.y + plot.h * 0.32, LD.c.muted, 'center', '600 12px ' + FONT);
      g.restore();
    }
  }
  function drawChart() {
    const g = ctx2;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    LD.backdrop(g, W2, H2);
    drawPunnett(g);
    drawBars(g);
  }
  function draw() { if (!S || !Q) return; drawScene(); drawChart(); }

  // ---------- 產生子代 ----------
  function clearOffspring() {
    flights = []; drops = []; batches = [];
    counts = { N: 0, pheno: zeros(nClass()), geno: zeros(Math.pow(3, state.L)), cell: zeros(cr.slots1.length * cr.slots2.length) };
    seq = 0; recent = [];
    trayArr = new Array(S ? S.cap : 0).fill(null);
    cellFlash = {}; slotFlash = [[], []];
    lastLand = -1e9;
    roDirty = true;
  }
  function commit(it, now) {
    if (it.done) return;
    it.done = true;
    counts.N++; counts.pheno[it.pheno]++; counts.geno[it.geno]++;
    counts.cell[it.i * cr.slots2.length + it.j]++;
    it.landedAt = now || performance.now();
    lastLand = it.landedAt;
    recent.push(it);
    if (recent.length > 800) recent.splice(0, recent.length - 800);
    if (S && S.cap) {
      const s = (it.id - 1) % S.cap;
      if (!trayArr[s] || trayArr[s].id < it.id) trayArr[s] = it;
    }
    roDirty = true;
    const b = it.b;
    b.done++;
    if (b.done >= b.n) finish(b);
  }
  function flashCell(it, amt) {
    if (state.my.on || reducedMotion) return;
    const key = dispIndex(1, it.i) + ',' + dispIndex(2, it.j);
    cellFlash[key] = Math.min(1, (cellFlash[key] || 0) + amt);
  }
  function sow(n, byUser) {
    n = Math.max(0, Math.floor(n));
    if (!n) return;
    settle();
    const room = MAX_N - counts.N;
    if (room <= 0) { setStatus(T('子代已達上限 20 000 個；按「全部清除」重新開始。', 'The limit of 20 000 offspring has been reached; press “Clear all” to start again.')); return; }
    const clipped = n > room;
    if (clipped) n = room;
    const b = { n: n, done: 0, byUser: !!byUser, items: [], clipped: clipped, finished: false };
    for (let k = 0; k < n; k++) {
      const s = MC.sampleOne(cr, rand), c = cr.cells[s.i][s.j];
      b.items.push({ id: ++seq, i: s.i, j: s.j, g: c.g, pheno: c.pheno, geno: c.geno, b: b });
    }
    batches.push(b);
    if (byUser) setStatus('');
    if (reducedMotion) { const now = performance.now(); b.items.forEach(function (it) { commit(it, now); }); requestDraw(); return; }
    if (n <= ANIM_MAX) {
      const gap = Math.min(0.3, 2.4 / n);
      b.items.forEach(function (it, k) { flights.push({ it: it, at: clock + k * gap }); });
    } else {
      // 大批子代：一次倒進收成盤。看得見的最後一批由小種子落下，其餘的計數平均增加
      const cap = S.cap, V = Math.min(cap, n, 60);
      const vis = b.items.slice(n - V), rest = b.items.slice(0, n - V);
      b.pour = { at: clock, rest: rest, idx: 0 };
      const Z = S.zone;
      vis.forEach(function (it, k) {
        drops.push({ it: it, at: clock + (k / V) * POUR * 0.72, dur: 0.48, from: { x: Z.cx + (rand() - 0.5) * Z.r * 1.2, y: Z.cy + Z.r * 0.2 } });
      });
      if (window.LabSound) {
        LabSound.noise({ dur: 1.1, gain: 0.16, filter: 3200, q: 0.7, attack: 0.05 });
        for (let i = 0; i < 6; i++) LabSound.noise({ dur: 0.03, gain: 0.12, filter: 2600 + i * 180, q: 2, delay: 0.12 + i * 0.16 });
      }
    }
    startLoop();
  }
  function settle() {
    if (!batches.length) return;
    const now = performance.now();
    batches.slice().forEach(function (b) { b.items.forEach(function (it) { commit(it, now); }); });
    flights = []; drops = [];
  }
  function finish(b) {
    if (b.finished) return;
    b.finished = true;
    batches = batches.filter(function (x) { return x !== b; });
    updateReadouts(true);
    updateLabels(true);
    sayBatch(b);
    if (b.n > ANIM_MAX && !reducedMotion && window.LabSound) LabSound.sweep({ from: 440, to: 880, dur: 0.22, gain: 0.14, type: 'triangle' });
    if (b.clipped) setStatus(T('子代已達上限 20 000 個，這一批只產生了 ' + b.n + ' 個。', 'The 20 000-offspring limit was reached: only ' + b.n + ' were produced in this batch.'));
    emitSow(b);
    requestDraw();
  }

  // ---------- 動畫迴圈 ----------
  let rafOn = false, lastT = 0, roAt = 0, drawPending = false;
  function startLoop() {
    if (rafOn) return;
    rafOn = true; lastT = performance.now();
    requestAnimationFrame(frame);
  }
  function flashesLeft() {
    for (const key in cellFlash) if (cellFlash[key] > 0.02) return true;
    for (let w = 0; w < 2; w++) for (let i = 0; i < slotFlash[w].length; i++) if (slotFlash[w][i] > 0.02) return true;
    return false;
  }
  function busy(now) { return flights.length || drops.length || batches.length || (!reducedMotion && now - lastLand < 1400) || flashesLeft(); }
  function step(now, dt) {
    for (let i = 0; i < flights.length; i++) {
      const f = flights[i], it = f.it;
      if (!f.launched && clock >= f.at) { f.launched = true; slotFlash[0][it.i] = 1; slotFlash[1][it.j] = 1; }
      if (f.launched && !f.merged && clock >= f.at + FLY) {
        f.merged = true;
        flashCell(it, 1);
        if (window.LabSound) LabSound.tone({ freq: (state.L === 2 ? FREQ2 : FREQ1)[it.pheno], dur: 0.16, type: 'triangle', gain: 0.22 });
      }
      if (!f.landed && clock >= f.at + FLY + MERGE + DROP) {
        f.landed = true;
        if (window.LabSound) LabSound.noise({ dur: 0.035, gain: 0.14, filter: 2400, q: 2.2 });
        commit(it, now);
      }
    }
    flights = flights.filter(function (f) { return !f.landed; });
    batches.slice().forEach(function (b) {
      if (!b.pour) return;
      const P = b.pour, frac = Math.min(1, (clock - P.at) / (POUR * 0.65));
      const target = Math.floor(P.rest.length * frac);
      while (P.idx < target) { const it = P.rest[P.idx++]; flashCell(it, 0.06); commit(it, now); }
    });
    for (let i = 0; i < drops.length; i++) {
      const d = drops[i];
      if (!d.landed && clock >= d.at + d.dur) { d.landed = true; flashCell(d.it, 0.06); commit(d.it, now); }
    }
    drops = drops.filter(function (d) { return !d.landed; });
    const decay = Math.exp(-dt * 3.2);
    for (const key in cellFlash) cellFlash[key] *= decay;
    for (let w = 0; w < 2; w++) for (let i = 0; i < slotFlash[w].length; i++) slotFlash[w][i] = (slotFlash[w][i] || 0) * decay;
  }
  function frame(now) {
    const dt = Math.min(1 / 30, Math.max(0, (now - lastT) / 1000));
    lastT = now;
    clock += dt * state.speed;
    step(now, dt);
    draw();
    if (now - roAt > 160) { roAt = now; updateReadouts(); }
    if (busy(now)) requestAnimationFrame(frame);
    else { rafOn = false; updateReadouts(); draw(); }
  }
  function requestDraw() {
    if (rafOn || drawPending) return;
    drawPending = true;
    requestAnimationFrame(function () { drawPending = false; draw(); });
  }

  // ---------- 任務 ----------
  function emitSow(b) {
    if (!window.LabMission || !b.byUser) return;
    const ch = chiNow();
    window.LabMission.emit('sow', {
      L: state.L, traits: traitsOn(), g1: gMotherShown(), g2: gFather(), mystery: state.my.on,
      kind: MC.crossKind(gMotherShown(), gFather()), n: b.n, N: counts.N,
      pheno: counts.pheno.slice(), geno: state.my.on ? null : counts.geno.slice(),
      chi2: ch.chi2, df: ch.df, p: ch.p, impossible: ch.impossible, minE: ch.minExpected
    });
  }

  // ---------- 讀數、表格、圖例、說明 ----------
  function kindOf() { return MC.crossKind(gMotherShown(), gFather()); }
  function kindLabel(kd) {
    return kd === 'P' ? T('純種雜交（P → F<sub>1</sub>）', 'True-breeding cross (P → F<sub>1</sub>)')
      : kd === 'F2' ? T('F<sub>1</sub> 自交（→ F<sub>2</sub>）', 'F<sub>1</sub> selfed (→ F<sub>2</sub>)')
        : kd === 'test' ? T('試交', 'Test cross')
          : kd === 'same' ? T('兩個親本基因型相同（相當於自交）', 'Identical parents (like selfing)')
            : T('一般的雜交', 'General cross');
  }
  function verdictText(ch) {
    if (counts.N === 0) return '—';
    if (ch.impossible) return T('出現了假說認為不可能的表現型：假說不成立', 'A phenotype the hypothesis forbids has appeared: the hypothesis is rejected');
    if (ch.df === 0) return T('只可能出現一種表現型，不需要檢定', 'Only one phenotype is possible, so there is nothing to test');
    let s = ch.p > 0.05 ? T('與期望比例沒有顯著差異', 'No significant departure from the expected ratio') : T('與期望比例有顯著差異', 'Significant departure from the expected ratio');
    if (ch.minExpected < 5) s += '<small>' + T('有類別的期望次數小於 5，檢定結果不太可靠。', 'Some expected counts are below 5, so the test is not reliable.') + '</small>';
    return s;
  }
  function updateReadouts(force) {
    if (!force && !roDirty) return;
    roDirty = false;
    const N = counts.N, ch = chiNow(), hyp = state.my.on;
    const rows = [];
    rows.push([T('雜交', 'Cross'), '<span class="gt">' + esc(motherText()) + ' × ' + esc(geno(gFather())) + '</span><small>' + (hyp ? T('神秘母本', 'mystery mother') + (gFather().every(function (x) { return x === 0; }) ? T('・試交', ' · test cross') : '') : kindLabel(kindOf())) + '</small>']);
    rows.push([T('子代數 N', 'Offspring N'), String(N)]);
    rows.push([hyp ? T('期望表現型比（依你的假說）', 'Expected phenotypes (your hypothesis)') : T('期望表現型比', 'Expected phenotype ratio'), ratioStr(crShow.phenoRatio)]);
    rows.push([T('觀察到的表現型', 'Observed phenotypes'), N ? counts.pheno.join(' : ') : '—']);
    if (!hyp) rows.push([T('期望基因型比', 'Expected genotype ratio'), ratioStr(crShow.genoRatio) + '<small>' + crShow.genoRatio.map(function (x, i) { return x ? geno(MC.genoOf(i, state.L)) : null; }).filter(Boolean).join(T('、', ', ')) + '</small>']);
    rows.push(['χ²', N && ch.df > 0 ? fmtChi(ch.chi2) : '—']);
    rows.push([T('自由度 df', 'Degrees of freedom df'), String(ch.df)]);
    rows.push([T('p 值', 'p-value'), N && ch.df > 0 ? fmtP(ch.p) : '—']);
    rows.push([T('判斷（5% 顯著水準）', 'Verdict (5% level)'), verdictText(ch)]);
    const md = mendelData();
    if (md && state.showMendel) {
      const mc = MC.chiSquare(md.counts, crShow.phenoP), sum = md.counts.reduce(function (a, b) { return a + b; }, 0);
      const ratio = state.L === 1 ? '（' + (md.counts[0] / md.counts[1]).toFixed(2) + ' : 1）' : '';
      rows.push([T('孟德爾的數據', 'Mendel’s counts'), md.counts.join(' : ') + ratio + '<small>N = ' + sum + '，χ² = ' + fmtChi(mc.chi2) + '，p = ' + fmtP(mc.p) + '</small>']);
    }
    $('ro').innerHTML = rows.map(function (r) { return '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>'; }).join('');
    // 表格（卡方檢定的計算過程）
    // 記號用 CSS 畫在名稱前面（data-mk），下載的 CSV 只有名稱；少一欄，窄面板與特大字才放得下
    let h = '<thead><tr><th>' + T('表現型', 'Phenotype') + '</th><th>' + T('觀察 O', 'Observed O') + '</th><th>' + T('期望 E', 'Expected E') + '</th><th>(O−E)²/E</th></tr></thead><tbody>';
    for (let c = 0; c < nClass(); c++) {
      const p = MC.fval(crShow.phenoP[c]);
      h += '<tr><td class="ph" data-mk="' + MARK_CH[c] + '" style="--mk:var(' + CLASS_VARS[c] + ')">' + esc(phenoName(c)) + '</td><td>' + counts.pheno[c] + '</td><td>' + fmtE(N * p) + '</td><td>' + (p > 0 && N ? fmtChi(ch.contrib[c]) : '—') + '</td></tr>';
    }
    h += '</tbody><tfoot><tr><th>' + T('合計', 'Total') + '</th><td>' + N + '</td><td>' + N + '</td><td>' + (N && ch.df > 0 ? 'χ² = ' + fmtChi(ch.chi2) : '—') + '</td></tr></tfoot>';
    $('tbl').innerHTML = h;
  }
  function updateLegend() {
    let h = '';
    for (let c = 0; c < nClass(); c++) h += '<span><b class="mk" style="color:var(' + CLASS_VARS[c] + ')">' + MARK_CH[c] + '</b>' + esc(phenoName(c)) + '</span>';
    h += '<span><i class="dash"></i>' + T('期望比例', 'Expected fraction') + '</span>';
    if (state.showRange) h += '<span><i class="rng"></i>' + T('約 95% 範圍', 'About 95% range') + '</span>';
    if (state.showMendel && mendelData()) h += '<span><b class="star">★</b>' + T('孟德爾的數據', 'Mendel’s data') + '</span>';
    $('legend').innerHTML = h;
  }
  function updateHint() {
    const plant = hasPlant();
    $('stageHint').innerHTML = T(
      '上方是母本 ♀ 與父本 ♂，下面一排小圓是它們的配子（每個配子只帶每個基因的一個對偶基因）。每產生一個子代，就從兩邊各隨機挑一個配子在中間受精，' + (plant ? '長成的植株（旁邊是它所來自的種子）' : '長成的種子') + '落進收成盤；收成盤滿了就換掉最舊的。龐氏方格每一格右下角是被命中的次數；長條圖的實心長條是觀察比例，虛線框是期望比例。卡方檢定一律用表現型計算。',
      'The mother ♀ and father ♂ are at the top; the small circles below them are their gametes (each carries just one allele of every gene). For every offspring one gamete is picked at random from each side and they meet in the middle; the ' + (plant ? 'young plant (with the seed it grew from)' : 'seed') + ' drops into the tray, which replaces its oldest entries when full. The number in the corner of each Punnett cell counts how often it was hit; on the bar chart the solid bars are the observed fractions and the dashed boxes the expected ones. The chi-square test always uses phenotypes.');
  }
  function updateInfo() {
    const kd = kindOf(), L = state.L;
    let s;
    if (state.my.on) {
      s = gFather().every(function (x) { return x === 0; })
        ? T('<strong>試交</strong>：父本是隱性同型合子，每個子代的表現型直接說出神秘母本給了哪個對偶基因。', '<strong>Test cross</strong>: the father is homozygous recessive, so every offspring shows which allele the mystery mother passed on.')
        : T('<strong>注意</strong>：父本不是隱性同型合子，這不算試交，子代比較難看出母本的基因型。', '<strong>Note</strong>: the father is not homozygous recessive, so this is not a test cross and the mother’s genotype is harder to read from the offspring.');
    } else {
      const ratio = ratioStr(crShow.phenoRatio);
      const desc = kd === 'P' ? T('子代全部是異型合子，表現顯性性狀——這就是子一代（F<sub>1</sub>）。', 'Every offspring is heterozygous and shows the dominant trait — the F<sub>1</sub>.')
        : kd === 'F2' ? T('子二代的表現型比為 ' + ratio + '。', 'The F<sub>2</sub> phenotypes come in the ratio ' + ratio + '.')
          : kd === 'test' ? T('一方是隱性同型合子，子代的表現型直接反映另一方產生的配子：期望 ' + ratio + '。', 'One parent is homozygous recessive, so the offspring show the gametes of the other parent directly: expect ' + ratio + '.')
            : T('期望的表現型比為 ' + ratio + '。', 'Expected phenotype ratio ' + ratio + '.');
      s = '<strong>' + kindLabel(kd) + '</strong>：' + desc;
      if (L === 2) s += T('兩對基因獨立分配。', ' The two genes assort independently.');
    }
    $('crossInfo').innerHTML = s;
  }

  // ---------- 控制項 ----------
  function genoBtnText(t, v) { const A = MC.TRAITS[t].sym, a = A.toLowerCase(); return v === 2 ? A + A : v === 1 ? A + a : a + a; }
  function genoWord(v) { return v === 2 ? T('顯性同型合子', 'homozygous dominant') : v === 1 ? T('異型合子', 'heterozygous') : T('隱性同型合子', 'homozygous recessive'); }
  function updateControls() {
    $('lSeg').querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(+b.getAttribute('data-l') === state.L)); });
    $('rowTr2').hidden = state.L < 2;
    $('tr1').value = state.traits[0];
    $('tr2').value = state.traits[1];
    document.querySelectorAll('#g1Box .geno-row, #g2Box .geno-row').forEach(function (row) {
      const p = +row.getAttribute('data-p'), l = +row.getAttribute('data-l');
      row.hidden = l >= state.L;
      const t = state.traits[l], nm = T(MC.TRAITS[t].name[0], MC.TRAITS[t].name[1]);
      row.querySelector('.gl').textContent = nm;
      row.querySelector('.seg3').setAttribute('aria-label', (p === 1 ? T('母本的', 'Mother: ') : T('父本的', 'Father: ')) + nm);
      const arr = p === 1 ? state.g1 : state.g2;
      row.querySelectorAll('button').forEach(function (b) {
        const v = +b.getAttribute('data-g');
        b.textContent = genoBtnText(t, v);
        b.title = genoWord(v);
        b.setAttribute('aria-pressed', String(arr[l] === v));
      });
    });
    document.querySelectorAll('#hypBox .geno-row').forEach(function (row) {
      const l = +row.getAttribute('data-l');
      row.hidden = l >= state.L;
      const t = state.traits[l], nm = T(MC.TRAITS[t].name[0], MC.TRAITS[t].name[1]);
      row.querySelector('.gl').textContent = nm;
      row.querySelector('.seg2').setAttribute('aria-label', T('假說：', 'Hypothesis: ') + nm);
      row.querySelectorAll('button').forEach(function (b) {
        const v = +b.getAttribute('data-h');
        b.textContent = genoBtnText(t, v);
        b.title = genoWord(v);
        b.setAttribute('aria-pressed', String(state.my.hyp[l] === v));
      });
    });
    $('g1Box').hidden = state.my.on;
    $('myLocked').hidden = !state.my.on;
    $('myStart').hidden = state.my.on;
    $('myNew').hidden = !state.my.on;
    $('myExit').hidden = !state.my.on;
    $('myBox').hidden = !state.my.on;
    $('qP').disabled = state.my.on;
    $('qF2').disabled = state.my.on;
    $('genoChart').disabled = state.my.on;
  }
  /** 雜交設定改變：重新計算；clear 為 true 時清除子代 */
  function rebuild(clear) {
    cr = MC.cross(gMother(), gFather());
    crShow = state.my.on ? MC.cross(gMotherShown(), gFather()) : cr;
    if (clear) clearOffspring();
    updateControls(); updateInfo(); updateLegend(); updateHint();
    resize();
    updateReadouts(true);
    updateLabels(true);
  }
  function changed() {
    const had = counts && counts.N > 0;
    rebuild(true);
    if (had) setStatus(T('雜交設定改變了，子代已清除。', 'The cross changed, so the offspring were cleared.'));
    else setStatus('');
    sayCross();
  }
  $('lSeg').addEventListener('click', function (e) {
    const b = e.target.closest('button'); if (!b) return;
    const L = +b.getAttribute('data-l');
    if (L === state.L) return;
    state.L = L;
    if (state.my.on) newMystery();
    changed();
  });
  function onTrait(i) {
    return function (e) {
      const v = e.target.value, other = 1 - i;
      if (v === state.traits[i]) return;
      if (state.traits[other] === v) state.traits[other] = state.traits[i]; // 兩個性狀不可相同：對調
      state.traits[i] = v;
      if (state.my.on) newMystery();
      changed();
    };
  }
  $('tr1').addEventListener('change', onTrait(0));
  $('tr2').addEventListener('change', onTrait(1));
  $('cardCross').addEventListener('click', function (e) {
    const b = e.target.closest('.geno-row button'); if (!b) return;
    const row = b.closest('.geno-row'), p = +row.getAttribute('data-p'), l = +row.getAttribute('data-l'), v = +b.getAttribute('data-g');
    const arr = p === 1 ? state.g1 : state.g2;
    if (arr[l] === v) return;
    arr[l] = v;
    changed();
  });
  function quick(m, f) {
    if (state.my.on && m != null) return;
    if (m != null) state.g1 = [m, m];
    state.g2 = [f, f];
    changed();
  }
  $('qP').addEventListener('click', function () { quick(2, 0); });
  $('qF2').addEventListener('click', function () { quick(1, 1); });
  $('qTest').addEventListener('click', function () { quick(state.my.on ? null : 1, 0); });

  // ---------- 神秘豌豆 ----------
  function setVerdict(html, cls) { const v = $('verdict'); v.innerHTML = html; v.className = 'verdict' + (cls ? ' ' + cls : ''); }
  function newMystery() {
    state.my.truth = MC.mysteryPick(2, rand);
    state.my.hyp = [1, 1];
    state.my.id++;
    state.my.answered = false;
    setVerdict('', '');
  }
  $('myStart').addEventListener('click', function () {
    state.my.on = true;
    newMystery();
    state.g2 = [0, 0];
    rebuild(true);
    setStatus(T('神秘母本上場了：父本設成隱性同型合子，可以開始試交。', 'The mystery mother is in place and the father is homozygous recessive: start your test cross.'));
    srSay(T('神秘母本上場了。', 'Mystery mother in place.'));
  });
  $('myNew').addEventListener('click', function () {
    newMystery();
    rebuild(true);
    setStatus(T('換了一顆新的神秘豌豆，子代已清除。', 'A new mystery pea; the offspring were cleared.'));
  });
  $('myExit').addEventListener('click', function () {
    state.my.on = false;
    rebuild(true);
    setStatus(T('已結束神秘模式。', 'Mystery mode ended.'));
  });
  $('hypBox').addEventListener('click', function (e) {
    const b = e.target.closest('button'); if (!b) return;
    const l = +b.closest('.geno-row').getAttribute('data-l'), v = +b.getAttribute('data-h');
    if (state.my.hyp[l] === v) return;
    state.my.hyp[l] = v;
    crShow = MC.cross(gMotherShown(), gFather());
    updateControls(); updateInfo(); updateLegend();
    updateReadouts(true); updateLabels(true);
    requestDraw();
  });
  $('mySubmit').addEventListener('click', function () {
    settle();
    const L = state.L, hyp = state.my.hyp.slice(0, L), truth = state.my.truth.slice(0, L);
    const correct = hyp.every(function (h, i) { return h === truth[i]; });
    const first = !state.my.answered;
    const partnerRec = gFather().every(function (x) { return x === 0; });
    const justified = MC.guessJustified(hyp, counts.pheno, MIN_JUST);
    if (window.LabMission) window.LabMission.emit('guess', { L: L, first: first, correct: correct, guess: hyp, truth: truth, N: counts.N, pheno: counts.pheno.slice(), partnerRec: partnerRec, justified: justified });
    state.my.answered = true;
    const gt = '<span class="gt">' + esc(geno(truth)) + '</span>';
    let s = correct ? T('答對了！神秘母本的基因型是 ', 'Correct! The mystery mother is ') + gt + T('。', '.')
      : T('不對喔。神秘母本的基因型其實是 ', 'Not quite. The mystery mother is actually ') + gt + T('。', '.');
    if (!first) s += T('（這顆已經揭曉過了，換一顆再挑戰。）', ' (This pea had already been revealed — try another one.)');
    else if (counts.N === 0) s += T('你還沒觀察任何子代就作答了，下次先做實驗吧。', ' You answered before looking at any offspring — run the experiment first next time.');
    else if (!partnerRec) s += T('提醒：父本不是隱性同型合子，這不算試交。', ' Note: the father was not homozygous recessive, so this was not a test cross.');
    else if (correct && !justified) s += T('不過證據還不夠：判成異型合子要先看到隱性子代；判成同型合子要至少 ' + MIN_JUST + ' 個子代都是顯性。', ' But the evidence was thin: call a gene heterozygous only after a recessive offspring, homozygous only after at least ' + MIN_JUST + ' offspring that are all dominant.');
    else if (correct) s += T('而且證據充分。', ' And the evidence backs it up.');
    setVerdict(s, correct ? 'good' : 'bad');
    if (window.LabSound) {
      if (correct) [523, 659, 784, 1046].forEach(function (f, i) { LabSound.tone({ freq: f, dur: 0.16, type: 'triangle', gain: 0.2, delay: i * 0.09 }); });
      else LabSound.sweep({ from: 392, to: 311, dur: 0.32, type: 'triangle', gain: 0.2 });
    }
    updateControls(); updateReadouts(true); updateLabels(true);
    requestDraw();
  });

  // ---------- 全部清除、產生子代、音效 ----------
  $('sow1').addEventListener('click', function () { sow(1, true); });
  $('sow10').addEventListener('click', function () { sow(10, true); });
  $('sow100').addEventListener('click', function () { sow(100, true); });
  $('sow1000').addEventListener('click', function () { sow(1000, true); });
  $('sowN').addEventListener('click', function () { sow(Math.round(val($('nCustom'))), true); });
  $('reset').addEventListener('click', function () {
    const had = counts.N > 0 || batches.length;
    clearOffspring();
    updateReadouts(true); updateLabels(true);
    requestDraw();
    setStatus(T('已全部清除，雜交設定不變。', 'Everything is cleared; the cross settings are kept.'));
    if (had && window.LabSound) LabSound.sweep({ from: 660, to: 330, dur: 0.25, gain: 0.15, type: 'triangle' });
    if (window.LabMission) window.LabMission.emit('reset', {});
  });
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }
  $('soundBtn').addEventListener('click', function () {
    if (window.LabSettings) window.LabSettings.set('sound', !window.LabSettings.get('sound'));
    updateSoundButton();
  });
  window.addEventListener('lab:settingschange', function (ev) {
    if (ev.detail && ev.detail.name === 'sound') updateSoundButton();
  });

  // ---------- 速度、數量、顯示選項 ----------
  const elSpd = $('spd'), elN = $('nCustom');
  if (window.LabNum) {
    window.LabNum.register(elSpd, { toValue: function (p) { return Math.pow(10, p); }, toPos: function (v) { return Math.log10(v); }, min: 0.25, max: 4, decimals: 2 });
    window.LabNum.register(elN, { toValue: function (p) { return Math.max(1, Math.min(1000, Math.round(Math.pow(10, p)))); }, toPos: function (v) { return Math.log10(v); }, min: 1, max: 1000, decimals: 0 });
  }
  function refreshOutputs() {
    const sp = val(elSpd);
    $('spdo').textContent = sp.toFixed(2).replace(/\.?0+$/, '') + '×';
    $('nCustomo').textContent = String(Math.round(val(elN)));
  }
  elSpd.addEventListener('input', function () { refreshOutputs(); state.speed = val(elSpd); });
  elN.addEventListener('input', refreshOutputs);
  $('merge').addEventListener('change', function (e) { state.merge = e.target.checked; cellFlash = {}; updateLabels(true); requestDraw(); });
  $('genoChart').addEventListener('change', function (e) { state.genoChart = e.target.checked; updateLabels(true); requestDraw(); });
  $('showRange').addEventListener('change', function (e) { state.showRange = e.target.checked; updateLegend(); requestDraw(); });
  $('showMendel').addEventListener('change', function (e) { state.showMendel = e.target.checked; updateLegend(); updateReadouts(true); requestDraw(); });

  // 分享連結：雜交設定由這裡記（卡片本身標了 data-share-skip，避免按鈕還原順序出錯）；神秘豌豆不分享
  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () { return { L: state.L, t: state.traits.slice(), g1: state.g1.slice(), g2: state.g2.slice() }; },
    set: function (v) {
      if (!v || typeof v !== 'object') return;
      const okT = function (t) { return MC.TRAIT_IDS.indexOf(t) >= 0; };
      const okG = function (g) { return Array.isArray(g) && g.length === 2 && g.every(function (x) { return x === 0 || x === 1 || x === 2; }); };
      state.L = v.L === 2 ? 2 : 1;
      if (Array.isArray(v.t) && v.t.length === 2 && okT(v.t[0]) && okT(v.t[1]) && v.t[0] !== v.t[1]) state.traits = v.t.slice();
      if (okG(v.g1)) state.g1 = v.g1.slice();
      if (okG(v.g2)) state.g2 = v.g2.slice();
      state.my.on = false;
      rebuild(true);
    }
  });

  // ---------- 無障礙：畫布說明與播報 ----------
  let sayTimer = 0, labelAt = -1e9;
  function setStatus(msg) { $('status').textContent = msg || ''; }
  function srSay(msg) {
    const el = $('srSay');
    if (!el || !msg) return;
    clearTimeout(sayTimer);
    el.textContent = '';
    sayTimer = setTimeout(function () { el.textContent = msg; }, 60);
  }
  function countList() { const out = []; for (let c = 0; c < nClass(); c++) out.push(phenoName(c) + ' ' + counts.pheno[c]); return out.join(T('、', ', ')); }
  function chiSay() {
    const ch = chiNow();
    if (!counts.N || ch.df === 0) return '';
    if (ch.impossible) return T('出現了假說認為不可能的表現型。', 'A phenotype the hypothesis forbids has appeared.');
    return 'χ² = ' + fmtChi(ch.chi2) + T('，p = ', ', p = ') + fmtP(ch.p) + T('，', ', ') + (ch.p > 0.05 ? T('沒有顯著差異。', 'no significant departure.') : T('有顯著差異。', 'a significant departure.'));
  }
  function sayBatch(b) {
    srSay(T('產生了 ' + b.n + ' 個子代，共 ' + counts.N + ' 個：', 'Produced ' + b.n + ' offspring, ' + counts.N + ' in all: ') + countList() + T('。', '. ') + chiSay());
  }
  function sayCross() {
    srSay(T('雜交：母本 ', 'Cross: mother ') + motherText() + T('，父本 ', ', father ') + geno(gFather()) + T('，期望表現型比 ', '; expected phenotype ratio ') + ratioStr(crShow.phenoRatio) + T('。', '.'));
  }
  function updateLabels(force) {
    const now = performance.now();
    if (!force && now - labelAt < 1000) return;
    labelAt = now;
    const mi = MC.phenoIndex(gMother()), fi = MC.phenoIndex(gFather());
    cv.setAttribute('aria-label', T('豌豆雜交：母本 ' + motherText() + '（' + phenoName(mi) + '）× 父本 ' + geno(gFather()) + '（' + phenoName(fi) + '），已產生 ' + counts.N + ' 個子代' + (counts.N ? '：' + countList() : '') + '。',
      'Pea cross: mother ' + motherText() + ' (' + phenoName(mi) + ') × father ' + geno(gFather()) + ' (' + phenoName(fi) + '); ' + counts.N + ' offspring so far' + (counts.N ? ': ' + countList() : '') + '.'));
    const m1 = state.merge ? crShow.gametes1.length : crShow.slots1.length, m2 = state.merge ? crShow.gametes2.length : crShow.slots2.length;
    cv2.setAttribute('aria-label', T('龐氏方格 ' + m1 + ' × ' + m2 + ' 格，期望表現型比 ' + ratioStr(crShow.phenoRatio) + '；長條圖比較觀察與期望的比例。', 'Punnett square, ' + m1 + ' × ' + m2 + ' cells, expected phenotype ratio ' + ratioStr(crShow.phenoRatio) + '; bar chart of observed against expected fractions. ') + chiSay());
  }

  // ---------- 啟動 ----------
  readColors();
  state.speed = val(elSpd);
  refreshOutputs();
  rebuild(true);
  updateSoundButton();
  function themeChanged() { readColors(); resize(); }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  if (window.ResizeObserver) {
    let lastW = 0;
    new ResizeObserver(function () { if (cv.clientWidth !== lastW) { lastW = cv.clientWidth; resize(); } }).observe(cv);
  } else window.addEventListener('resize', resize);
  resize();
})();
