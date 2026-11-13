/* stack-queue.js — 「堆疊與佇列」的畫面與互動（計算在 stack-queue-core.js；共用繪圖工具 LabDraw 在 drawkit.js）
 *
 * 模式一（堆疊與佇列）、模式二（環狀佇列）：每按一次按鈕，就由核心做一次操作（deskDo、ringDo）。
 * 模式三、四、五（括號配對、後序式求值、中序轉後序）：核心先把整個式子跑完、記下每一步，畫面照步驟播放。
 * 動畫只是把每個東西從舊位置滑到新位置（目標位置插值）；內容與讀數立刻照核心的結果改變。
 * 任務事件只在使用者操作之後送出（見 js/missions/stack-queue.js 開頭的說明；與 tools/mission-proofs/stack-queue.js 的 Sim 相同）。
 */
(function () {
  'use strict';
  const S = window.StackQueueCore;
  const D = window.LabDraw;
  if (!S || !D) return;
  const FONT = D.FONT;
  const MONO = 'ui-monospace, "SFMono-Regular", Consolas, "Noto Sans Mono", monospace';
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  // 程式改滑桿：先清掉打字的精確值再改位置（不觸發 input 事件）
  const setSlider = function (el, v) { if (window.LabNum) window.LabNum.clear(el); el.value = String(v); };
  const alpha = D.alpha, shade = D.shade, mix = D.mix;
  const EX = S.EXAMPLES;
  const RUNS = ['paren', 'postfix', 'infix'];
  const SYM = { '+': '+', '-': '−', '*': '×', '/': '÷', '%': '%', '^': '^' };
  const isRun = function (m) { return RUNS.indexOf(m) >= 0; };
  const tokText = function (t) { return t.t === 'op' ? SYM[t.v] : t.s; };
  const pretty = function (s) { return String(s).replace(/\*/g, '×').replace(/\//g, '÷').replace(/-/g, '−'); };
  const fnt = function (px, weight, fam) { return (weight ? weight + ' ' : '') + px + 'px ' + (fam || FONT); };
  const numStr = function (v) { return v == null ? '—' : v < 0 ? '−' + Math.abs(v) : String(v); };
  const esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };

  // ======================= 狀態 =======================
  const state = {
    mode: 'desk',
    desk: S.newDesk({ cap: 6, rk: 'queue', next: 1, auto: true }),
    ids: { A: [], R: [] }, nid: 1,                    // 每個數的畫面代號（同一個數搬來搬去時才滑得過去）
    ring: S.newRing(8, true), slot: [],
    x: {}, playing: false, acc: 0, speed: 2,
    log: [], logN: 0, msg: null, fx: [],
    hand: { f: -Math.PI / 2, r: -Math.PI / 2 }
  };
  state.slot = new Array(state.ring.N).fill(0);

  /** 載入一個式子（和任務證明的 Sim.load 相同） */
  function load(kind, str, src) {
    let res;
    if (kind === 'paren') res = S.parens(str);
    else if (kind === 'postfix') res = S.evalPostfix(str);
    else res = S.toPostfix(str);
    const typed = !S.isExample(kind, str);
    state.x[kind] = { str: str, res: res, k: 0, done: false, src: src || (typed ? 'typed' : 'example'), typed: typed, fromParen: 0,
      prof: kind === 'paren' && res.chars ? S.depthProfile(res) : null };
  }
  RUNS.forEach(function (k) { load(k, EX[k][0], k === 'postfix' ? 'example' : null); });

  // ======================= 色彩 =======================
  let C = {};
  const CK = ['canvas-bg', 'text', 'muted', 'border', 'accent', 'accent-soft', 'surface', 'bg',
    'sq-tray', 'sq-floor', 'sq-wood', 'sq-top', 'sq-front', 'sq-rear', 'sq-bad', 'sq-ok', 'sq-rail', 'sq-num', 'sq-op', 'sq-br',
    'sq-i1', 'sq-i2', 'sq-i3', 'sq-i4', 'sq-i5', 'sq-i6'];
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    CK.forEach(function (k) { C[k] = cs.getPropertyValue('--' + k).trim() || '#888888'; });
  }
  function itemColor(v) { return C['sq-i' + ((((v - 1) % 6) + 6) % 6 + 1)]; }
  function inkOn(c) { const r = D.rgb(c); return 0.2126 * r[0] + 0.7152 * r[1] + 0.0722 * r[2] > 150 ? '#1b1f24' : '#ffffff'; }
  function kindColor(ch) { return '([)]'.indexOf(ch) >= 0 ? (ch === '(' || ch === ')' ? C['sq-br'] : C['sq-num']) : C['sq-op']; }
  function tokColor(t) { return t.t === 'num' ? C['sq-num'] : t.t === 'op' ? C['sq-op'] : C['sq-br']; }

  // ======================= 動畫：目標位置插值 =======================
  const cv = $('cv'), ctx = cv.getContext('2d');
  let dpr = 1, cw = 320, ch = 380;
  let now = 0, frameNo = 0, animating = false, snap = true, reduced = false;
  const pos = new Map();
  let ghosts = [], items = [];
  function ease(u) { return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; }
  function curOf(p) {
    if (!p.dur) return { x: p.tx, y: p.ty, moving: false };
    const u = Math.min(1, (now - p.t0) / p.dur), e = ease(u);
    return { x: p.fx + (p.tx - p.fx) * e, y: p.fy + (p.ty - p.fy) * e - p.lift * Math.sin(Math.PI * e), moving: u < 1 };
  }
  /** 東西 key 的目標位置是 (tx, ty)；第一次出現時從 (sx, sy) 滑進來。回傳目前畫的位置 */
  function at(key, tx, ty, sx, sy) {
    let p = pos.get(key);
    if (!p) {
      p = { fx: sx == null ? tx : sx, fy: sy == null ? ty : sy, tx: tx, ty: ty, t0: now, dur: 0, lift: 0 };
      if (sx != null && !reduced && !snap) p.dur = Math.min(0.55, 0.22 + Math.hypot(tx - p.fx, ty - p.fy) / 900);
      pos.set(key, p);
    } else if (Math.abs(p.tx - tx) > 0.5 || Math.abs(p.ty - ty) > 0.5) {
      const c = curOf(p), dist = Math.hypot(tx - c.x, ty - c.y);
      p.fx = c.x; p.fy = c.y; p.tx = tx; p.ty = ty; p.t0 = now;
      p.dur = reduced || snap ? 0 : Math.min(0.65, 0.22 + dist / 900);
      p.lift = dist > 70 ? Math.min(64, dist * 0.26) : 0;
    }
    p.seen = frameNo;
    const c = curOf(p);
    p.x = c.x; p.y = c.y;
    if (c.moving) animating = true;
    return p;
  }
  /** 會動的東西：先記下來，背景與容器畫完再一起畫（正在移動的畫在最上面） */
  function put(key, tx, ty, sx, sy, fn, exit) {
    const p = at(key, tx, ty, sx, sy);
    p.fn = fn; p.exit = exit || [0, -26];
    items.push(p);
    return p;
  }
  function flushItems() {
    items.forEach(function (p) { if (!curOf(p).moving) p.fn(p.x, p.y, 1); });
    items.forEach(function (p) { if (curOf(p).moving) p.fn(p.x, p.y, 1); });
    items = [];
  }
  /** 這一格沒有出現的東西：變成淡出的殘影 */
  function sweep() {
    pos.forEach(function (p, key) {
      if (p.seen === frameNo) return;
      if (p.fn && !reduced && !snap) ghosts.push({ fn: p.fn, x: p.x, y: p.y, dx: p.exit[0], dy: p.exit[1], t0: now });
      pos.delete(key);
    });
  }
  function drawGhosts() {
    ghosts = ghosts.filter(function (g) { return now - g.t0 < 0.42; });
    ghosts.forEach(function (g) {
      const u = (now - g.t0) / 0.42;
      g.fn(g.x + g.dx * u, g.y + g.dy * u, Math.max(0, 1 - u));
    });
  }
  function resetAnim() { pos.clear(); ghosts = []; items = []; state.fx = []; snap = true; }

  // ---------- 特效（閃光、搖晃、短訊息） ----------
  function fxRing(key, color) { if (!reduced) state.fx.push({ type: 'ring', key: key, color: color, t0: now, dur: 0.7 }); requestDraw(); }
  function fxShake(which) { if (!reduced) state.fx.push({ type: 'shake', which: which, t0: now, dur: 0.42 }); requestDraw(); }
  function fxMsg(text, which, color) { state.fx = state.fx.filter(function (f) { return f.type !== 'msg'; }); state.fx.push({ type: 'msg', text: text, which: which, color: color, t0: now, dur: 1.6 }); requestDraw(); }
  function shakeOf(which) {
    let s = 0;
    state.fx.forEach(function (f) { if (f.type === 'shake' && f.which === which) { const u = (now - f.t0) / f.dur; if (u >= 0 && u < 1) s += Math.sin(u * Math.PI * 7) * 5 * (1 - u); } });
    return s;
  }
  function drawFx(L) {
    state.fx.forEach(function (f) {
      const u = (now - f.t0) / f.dur;
      if (u < 0 || u > 1) return;
      if (f.type === 'ring') {
        const p = pos.get(f.key);
        if (p) D.ripple(ctx, p.x, p.y, 16, u, f.color);
      } else if (f.type === 'msg' && L.msgAt) {
        const m = L.msgAt(f.which);
        if (!m) return;
        ctx.save();
        ctx.globalAlpha = u > 0.7 ? (1 - u) / 0.3 : 1;
        D.pill(ctx, f.text, m.x, m.y, f.color, m.align || 'center', fnt(13, 700));
        ctx.restore();
      }
    });
  }

  // ======================= 畫東西 =======================
  function plate(pw, ph) {
    return function (x, y, v, a) {
      const c = itemColor(v);
      ctx.save();
      ctx.globalAlpha = a;
      D.block(ctx, x - pw / 2, y - ph / 2, pw, ph, c, { r: ph / 2 });
      ctx.beginPath();
      ctx.ellipse(x, y - ph * 0.2, pw * 0.36, ph * 0.15, 0, 0, Math.PI * 2);
      ctx.fillStyle = alpha(shade(c, 0.7), 0.32);
      ctx.fill();
      ctx.fillStyle = inkOn(c);
      ctx.font = fnt(ph >= 17 ? 13 : 12, 700);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(v), x, y + 1, pw - 8);
      ctx.restore();
    };
  }
  /** 排隊的人：(x, y) 是身體中心 */
  function person(s) {
    return function (x, y, v, a) {
      const c = itemColor(v), bw = 25 * s, bh = 27 * s, hr = 8.5 * s;
      ctx.save();
      ctx.globalAlpha = a;
      D.contactShadow(ctx, x, y + bh / 2 + 1, bw * 0.55, 0);
      D.block(ctx, x - bw / 2, y - bh / 2, bw, bh, c, { r: 9 * s });
      D.ball(ctx, x, y - bh / 2 - hr + 1.5 * s, hr, mix(c, C.surface, 0.45), { glow: 0 });
      ctx.fillStyle = inkOn(c);
      ctx.font = fnt(s < 0.9 ? 11.5 : 12.5, 700);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(v), x, y + 2 * s, bw - 3);
      ctx.restore();
    };
  }
  /** 一般的圓角牌子：文字、底色、文字色 */
  function chip(w, h, text, fill, ink, font) {
    return function (x, y, a) {
      ctx.save();
      ctx.globalAlpha = a;
      D.block(ctx, x - w / 2, y - h / 2, w, h, fill, { r: Math.min(7, h / 3) });
      ctx.fillStyle = ink;
      ctx.font = font || fnt(13, 700, MONO);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(text, x, y + 1, w - 6);
      ctx.restore();
    };
  }
  /** 鐵路車廂（中序轉後序） */
  function car(w, t) {
    return function (x, y, a) {
      const col = tokColor(t), body = mix(col, C.surface, D.dark ? 0.55 : 0.62);
      ctx.save();
      ctx.globalAlpha = a;
      D.block(ctx, x - w / 2, y - 11, w, 21, body, { r: 5, stroke: alpha(col, 0.8) });
      ctx.fillStyle = alpha(shade(col, -0.4), 0.9);
      [-0.27, 0.27].forEach(function (k) { ctx.beginPath(); ctx.arc(x + k * w, y + 11, 3.2, 0, Math.PI * 2); ctx.fill(); });
      ctx.fillStyle = D.dark ? shade(col, 0.55) : shade(col, -0.45);
      ctx.font = fnt(w < 24 ? 11.5 : 13.5, 700, MONO);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(tokText(t), x, y, w - 3);
      ctx.restore();
    };
  }
  /** 字串列裡的一格（括號、記號）：st = 'cur' | 'done' | 'bad' | 'in'（在堆疊裡） | 'pair'（已配對） | '' */
  function cell(x, y, w, h, text, col, st, mono) {
    ctx.save();
    const lift = st === 'cur' ? 3 : 0;
    y -= lift;
    if (st === 'cur') { ctx.shadowColor = D.shadowInk(D.dark ? 0.6 : 0.25); ctx.shadowBlur = 8; ctx.shadowOffsetY = 3; }
    D.roundRect(ctx, x - w / 2, y - h / 2, w, h, 5);
    ctx.fillStyle = st === 'bad' ? alpha(C['sq-bad'], 0.2) : st === 'pair' ? alpha(col, D.dark ? 0.22 : 0.14) : st === 'in' ? alpha(col, 0.1) : C.surface;
    ctx.globalAlpha = st === 'done' ? 0.55 : 1;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = st === 'cur' || st === 'bad' ? 2 : 1;
    ctx.strokeStyle = st === 'cur' ? C.accent : st === 'bad' ? C['sq-bad'] : st === 'in' || st === 'pair' ? alpha(col, 0.7) : alpha(C.text, 0.16);
    ctx.stroke();
    ctx.fillStyle = st === 'bad' ? C['sq-bad'] : col;
    ctx.font = fnt(mono ? 14.5 : 14, 700, mono ? MONO : FONT);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + 1, w - 2);
    ctx.restore();
  }
  /** 容器：玻璃架（堆疊）。回傳 { yTop, yB, xl, xr } */
  function rack(cx, yB, innerW, height, label, sub) {
    const xl = cx - innerW / 2 - 9, xr = cx + innerW / 2 + 9, yTop = yB - height;
    ctx.save();
    D.roundRect(ctx, xl, yTop, xr - xl, yB - yTop + 2, 8);
    const g = ctx.createLinearGradient(xl, 0, xr, 0);
    g.addColorStop(0, alpha(C['sq-tray'], D.dark ? 0.16 : 0.12));
    g.addColorStop(0.45, alpha(C['sq-tray'], D.dark ? 0.3 : 0.26));
    g.addColorStop(1, alpha(C['sq-tray'], D.dark ? 0.12 : 0.08));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
    D.tube(ctx, function (c) { c.moveTo(xl, yTop); c.lineTo(xl, yB + 1); }, C['sq-tray'], 6);
    D.tube(ctx, function (c) { c.moveTo(xr, yTop); c.lineTo(xr, yB + 1); }, C['sq-tray'], 6);
    D.contactShadow(ctx, cx, yB + 13, (xr - xl) * 0.62, 0);
    D.block(ctx, xl - 12, yB + 1, xr - xl + 24, 11, C['sq-wood'], { r: 4 });
    if (label) D.haloText(ctx, label, cx, yTop - 11, C.text, 'center', 'alphabetic', fnt(13.5, 700));
    if (sub) D.haloText(ctx, sub, cx, yB + 30, C.muted, 'center', 'alphabetic', fnt(12, 600));
    return { yTop: yTop, yB: yB, xl: xl, xr: xr };
  }
  /** 指標標籤（top、front、rear）：一個圓角底框，加一個指向 (tx, ty) 的小三角形 */
  function pointer(text, x, y, color, side, tx, ty) {
    const b = D.pill(ctx, text, x, y, color, side, fnt(11.5, 700));
    if (tx != null) {
      const sx = side === 'right' ? b.x + b.w : side === 'left' ? b.x : b.x + b.w / 2;
      const sy = side === 'center' ? (ty > b.y ? b.y + b.h : b.y) : b.y + b.h / 2;
      ctx.save();
      ctx.fillStyle = color;
      ctx.beginPath();
      const ang = Math.atan2(ty - sy, tx - sx), L = Math.min(9, Math.hypot(tx - sx, ty - sy));
      const ex = sx + Math.cos(ang) * L, ey = sy + Math.sin(ang) * L;
      ctx.moveTo(ex, ey);
      ctx.lineTo(sx + Math.cos(ang + 2.2) * 5, sy + Math.sin(ang + 2.2) * 5);
      ctx.lineTo(sx + Math.cos(ang - 2.2) * 5, sy + Math.sin(ang - 2.2) * 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    return b;
  }
  /** 依寬度斷行（中文逐字、英文逐詞） */
  function wrapText(text, maxW) {
    const parts = String(text).match(/[⺀-鿿豈-﫿＀-￯]|[^\s⺀-鿿豈-﫿＀-￯]+|\s+/g) || [];
    const lines = [];
    let cur = '';
    parts.forEach(function (p) {
      const t = cur + p;
      if (ctx.measureText(t).width > maxW && cur.trim()) { lines.push(cur.trim()); cur = p.replace(/^\s+/, ''); }
      else cur = t;
    });
    if (cur.trim()) lines.push(cur.trim());
    return lines;
  }
  /** 右側的說明卡（後序式、括號）：lines = [{ t, font, color }] */
  function infoCard(x0, y0, x1, lines) {
    const w = x1 - x0;
    if (w < 60) return;
    const out = [];
    lines.forEach(function (ln) {
      ctx.font = ln.font;
      wrapText(ln.t, w - 24).forEach(function (s, i) { out.push({ t: s, font: ln.font, color: ln.color, gap: i ? 4 : ln.gap || 8, px: parseFloat(/(\d+(?:\.\d+)?)px/.exec(ln.font)[1]) }); });
    });
    let h = 14;
    out.forEach(function (o) { h += o.px * 1.15 + o.gap; });
    ctx.save();
    ctx.shadowColor = D.shadowInk(D.dark ? 0.5 : 0.14); ctx.shadowBlur = 10; ctx.shadowOffsetY = 2;
    D.roundRect(ctx, x0, y0, w, h, 10);
    ctx.fillStyle = alpha(C.surface, D.dark ? 0.9 : 0.94);
    ctx.fill();
    ctx.restore();
    D.roundRect(ctx, x0 + 0.5, y0 + 0.5, w - 1, h - 1, 10);
    ctx.strokeStyle = alpha(C.text, 0.12); ctx.lineWidth = 1; ctx.stroke();
    let y = y0 + 6;
    out.forEach(function (o) {
      y += o.gap + o.px * 1.15;
      ctx.font = o.font; ctx.fillStyle = o.color; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(o.t, x0 + 12, y - o.px * 0.22);
    });
  }

  // ======================= 版面 =======================
  function layout() {
    const m = state.mode;
    if (m === 'desk') return deskLayout();
    if (m === 'ring') return ringLayout();
    if (m === 'paren') return parenLayout(state.x.paren);
    return tokLayout(state.x[m], m);
  }
  function deskLayout() {
    const w = cw, narrow = w < 560, d = state.desk, Q = d.rk === 'queue';
    const p = narrow ? 21 : 24, pw = narrow ? 74 : 96, ph = narrow ? 16 : 18;
    const L = { kind: 'desk', narrow: narrow, Q: Q, p: p, pw: pw, ph: ph, top: 52 };
    L.floor = L.top + d.cap * p + 10;
    if (!Q) {
      L.ax = Math.round(w * (narrow ? 0.27 : 0.3)); L.bx = Math.round(w * (narrow ? 0.73 : 0.7));
      L.H = L.floor + 48;
    } else if (narrow) {
      L.ax = Math.round(w * 0.5);
      L.sw = Math.min(46, (w - 36) / d.cap);
      L.lx0 = Math.round((w - L.sw * d.cap) / 2);
      L.ly = L.floor + 120;
      L.H = L.ly + 56;
    } else {
      L.ax = Math.max(84, Math.round(w * 0.15));
      L.lx0 = L.ax + pw / 2 + 74;
      L.sw = Math.min(60, (w - 44 - L.lx0) / d.cap);
      L.ly = L.floor;
      L.H = L.floor + 62;
    }
    L.msgAt = function (which) {
      if (which === 'A') return { x: L.ax, y: L.top - 22 };
      if (which === 'R') return Q ? { x: L.lx0 + L.sw * d.cap / 2, y: L.ly - 80 } : { x: L.bx, y: L.top - 22 };
      return null;
    };
    return L;
  }
  function ringLayout() {
    const w = cw, narrow = w < 560, q = state.ring, N = q.N;
    const Ro = narrow ? Math.max(90, Math.min(122, (w - 120) / 2)) : 132, Ri = Math.round(Ro * 0.56);
    const cx = Math.round(w / 2), cy = Ro + 50;
    const slots = N + (q.wrap ? 0 : 1);
    const cwid = Math.min(52, (w - 28) / slots), chh = 36;
    const ax0 = Math.round((w - cwid * slots) / 2), ay = cy + Ro + 84;
    return { kind: 'ring', narrow: narrow, N: N, Ro: Ro, Ri: Ri, cx: cx, cy: cy, cwid: cwid, chh: chh, ax0: ax0, ay: ay, H: ay + chh / 2 + 56,
      msgAt: function () { return { x: 12, y: 24, align: 'left' }; } };
  }
  function parenLayout(x) {
    const w = cw, narrow = w < 560, n = x.res.chars ? x.res.chars.length : 0;
    const tw = narrow ? 19 : 24, gap = 2, th = 28;
    const per = Math.max(6, Math.floor((w - 20 + gap) / (tw + gap)));
    const rows = Math.max(1, Math.ceil(n / per));
    const arcH = 30, mH = 26, rowH = arcH + th + mH + 12;
    const used = Math.max(1, Math.min(n, per)) * (tw + gap) - gap;
    const md = Math.max(1, x.res.maxDepth || 1), vis = Math.min(8, Math.max(3, md));
    const top = 6, mTop = top + rows * rowH + 10, pitch = 28;
    return { kind: 'paren', narrow: narrow, tw: tw, th: th, gap: gap, per: per, rows: rows, arcH: arcH, mH: mH, rowH: rowH, x0: Math.round((w - used) / 2), top: top,
      md: md, vis: vis, mTop: mTop, pitch: pitch, sx: Math.round(narrow ? w * 0.22 : Math.max(90, w * 0.18)), H: mTop + Math.max(160, vis * pitch + 76) };
  }
  function charPos(L, i) {
    return { x: L.x0 + (i % L.per) * (L.tw + L.gap) + L.tw / 2, y: L.top + Math.floor(i / L.per) * L.rowH + L.arcH + L.th / 2, row: Math.floor(i / L.per) };
  }
  /** 後序式與中序式：上面是記號列，下面是堆疊（中序另有鐵路） */
  function tokLayout(x, m) {
    const w = cw, narrow = w < 560, toks = x.res.tokens || [];
    ctx.font = fnt(14.5, 700, MONO);
    const ws = toks.map(function (t) { return Math.max(26, Math.ceil(ctx.measureText(tokText(t)).width) + 14); });
    const pos0 = [], gap = 6, maxW = w - 20, rowsW = [];
    let rowW = 0, row = 0;
    ws.forEach(function (tw) {
      if (rowW && rowW + gap + tw > maxW) { rowsW[row] = rowW; row++; rowW = 0; }
      const left = rowW ? rowW + gap : 0;
      pos0.push({ row: row, x: left + tw / 2 });
      rowW = left + tw;
    });
    rowsW[row] = rowW;
    const top = 10, rowH = 40;
    const P = pos0.map(function (p, i) {
      const off = Math.round((w - rowsW[p.row]) / 2);
      return { x: off + p.x, y: top + p.row * rowH + 16, w: ws[i] };
    });
    const rows = toks.length ? row + 1 : 1;
    const L = { kind: m, narrow: narrow, tok: P, top: top, stripB: top + rows * rowH };
    if (m === 'postfix') {
      const md = Math.max(1, x.res.maxDepth || 1);
      L.vis = Math.min(9, Math.max(3, md)); L.pitch = 30;
      L.tw = narrow ? 104 : 150;
      L.sx = Math.round(12 + L.tw / 2 + 10);
      L.mTop = L.stripB + 30;
      L.yB = L.mTop + 18 + L.vis * L.pitch + 6;
      L.H = L.yB + 40;
      return L;
    }
    const nOut = toks.filter(function (t) { return t.t === 'num' || t.t === 'op'; }).length;
    L.vis = Math.min(8, Math.max(4, x.res.maxStack || 1)); L.pitch = 28;
    L.yT = L.stripB + 58;
    L.xJ = Math.round(w - (narrow ? 58 : 110));
    L.sb = L.yT + 26 + L.vis * L.pitch;
    L.H = L.sb + 28;
    L.ox0 = 12; L.ox1 = L.xJ - 34;
    const avail = L.ox1 - L.ox0;
    L.carW = Math.max(18, Math.min(42, avail / Math.max(1, nOut) - 4));
    L.step = L.carW + 4;
    L.maxShow = Math.max(1, Math.floor(avail / L.step));
    return L;
  }

  // ======================= 繪圖 =======================
  let drawQueued = false, lastT = 0;
  function requestDraw() { if (!drawQueued) { drawQueued = true; requestAnimationFrame(frame); } }
  function frame(t) {
    drawQueued = false;
    const dt = lastT ? Math.min(0.1, (t - lastT) / 1000) : 0.016;
    lastT = t;
    now = t / 1000;
    if (state.playing) {
      state.acc += dt * state.speed;
      const n = Math.floor(state.acc);
      if (n > 0) { state.acc -= n; advance(Math.min(n, 30), 'play'); }
    }
    animating = false;
    draw(dt);
    state.fx = state.fx.filter(function (f) { return now < f.t0 + f.dur; });
    if (state.playing || animating || ghosts.length || state.fx.length) requestDraw(); else lastT = 0;
  }
  function draw(dt) {
    const w = cv.clientWidth;
    if (!w) return;
    cw = w;
    reduced = D.reducedMotion();
    const L = layout();
    const d2 = Math.min(window.devicePixelRatio || 1, 3);
    if (L.H !== ch || d2 !== dpr || cv.width !== Math.round(w * d2) || cv.style.height !== L.H + 'px') {
      dpr = d2; ch = L.H;
      cv.style.height = ch + 'px';
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(ch * dpr);
      snap = true;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    frameNo++;
    items = [];
    D.backdrop(ctx, cw, ch);
    if (L.kind === 'desk') drawDesk(L);
    else if (L.kind === 'ring') drawRing(L, dt);
    else if (L.kind === 'paren') drawParen(L);
    else if (L.kind === 'postfix') drawPostfix(L);
    else drawInfix(L);
    flushItems();
    sweep();
    drawGhosts();
    drawFx(L);
    snap = false;
  }

  // ---------- 模式一：堆疊與佇列 ----------
  function drawDesk(L) {
    const d = state.desk, I = state.ids, p = L.p;
    const plateFn = plate(L.pw, L.ph);
    const slotY = function (i) { return L.floor - 7 - (i + 0.5) * p; };
    const stackOf = function (which, cx, label, vals, ids, side) {
      cx += shakeOf(which);
      const rk = rack(cx, L.floor, L.pw, d.cap * p + 4, label, vals.length + ' / ' + d.cap);
      // 容量線
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = alpha(C.muted, 0.55); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(rk.xl + 5, rk.yTop + 2.5); ctx.lineTo(rk.xr - 5, rk.yTop + 2.5); ctx.stroke();
      ctx.restore();
      vals.forEach(function (v, i) {
        put('d' + ids[i], cx, slotY(i), cx, rk.yTop - 46, function (x, y, a) { plateFn(x, y, v, a); }, [0, -30]);
      });
      if (vals.length) {
        const ty = slotY(vals.length - 1);
        if (side === 'left') pointer('top', rk.xl - 12, ty + 9, C['sq-top'], 'right', rk.xl - 3, ty);
        else pointer('top', rk.xr + 12, ty + 9, C['sq-top'], 'left', rk.xr + 3, ty);
      } else D.haloText(ctx, T('空的', 'empty'), cx, L.floor - 7 - p / 2 + 4, C.muted, 'center', 'alphabetic', fnt(12.5, 600));
    };
    if (!L.Q) {
      stackOf('A', L.ax, T('堆疊 A', 'Stack A'), d.A, I.A, 'left');
      stackOf('R', L.bx, T('堆疊 B', 'Stack B'), d.R, I.R, 'right');
      return;
    }
    stackOf('A', L.ax, T('堆疊', 'Stack'), d.A, I.A, 'left');
    // 佇列：front 在左、rear 在右
    const sw = L.sw, x0 = L.lx0 + shakeOf('R'), x1 = x0 + d.cap * sw, y = L.ly, s = Math.min(1, sw / 42);
    D.block(ctx, x0 - 8, y, x1 - x0 + 16, 9, C['sq-floor'], { r: 4 });
    ctx.save();
    for (let j = 0; j < d.cap; j++) {
      ctx.beginPath(); ctx.ellipse(x0 + (j + 0.5) * sw, y - 1, sw * 0.3, 2.4, 0, 0, Math.PI * 2);
      ctx.fillStyle = alpha(C.text, D.dark ? 0.1 : 0.07); ctx.fill();
    }
    ctx.restore();
    D.haloText(ctx, T('佇列', 'Queue'), x0, y - 66, C.text, 'left', 'alphabetic', fnt(13.5, 700));
    D.haloText(ctx, d.R.length + ' / ' + d.cap, x1, y - 66, C.muted, 'right', 'alphabetic', fnt(12, 600));
    if (x0 > 44) {
      D.arrow(ctx, x0 - 6, y - 24, x0 - 32, y - 24, alpha(C['sq-front'], 0.85), 2.2);
      D.haloText(ctx, T('離開', 'out'), x0 - 19, y - 34, C['sq-front'], 'center', 'alphabetic', fnt(11, 600));
    }
    if (x1 + 40 < cw) {
      D.arrow(ctx, x1 + 34, y - 24, x1 + 8, y - 24, alpha(C['sq-rear'], 0.85), 2.2);
      D.haloText(ctx, T('排入', 'in'), x1 + 21, y - 34, C['sq-rear'], 'center', 'alphabetic', fnt(11, 600));
    }
    const pf = person(s);
    const by = y - 14 * s - 2;
    d.R.forEach(function (v, j) {
      put('d' + I.R[j], x0 + (j + 0.5) * sw, by, x1 + 40, by, function (x, yy, a) { pf(x, yy, v, a); }, [-24, -10]);
    });
    if (d.R.length) {
      const fx0 = x0 + 0.5 * sw, rx = x0 + (d.R.length - 0.5) * sw;
      pointer(d.R.length === 1 ? 'front = rear' : 'front', fx0, y + 34, C['sq-front'], 'center', fx0, y + 11);
      if (d.R.length > 1) pointer('rear', rx, y + 56, C['sq-rear'], 'center', rx, y + 11);
    } else D.haloText(ctx, T('空的', 'empty'), (x0 + x1) / 2, y - 20, C.muted, 'center', 'alphabetic', fnt(12.5, 600));
  }

  // ---------- 模式二：環狀佇列 ----------
  function sector(cx, cy, r0, r1, a0, a1) {
    ctx.beginPath();
    ctx.arc(cx, cy, r1, a0, a1);
    ctx.arc(cx, cy, r0, a1, a0, true);
    ctx.closePath();
  }
  function angDiff(a, b) { let d = (b - a) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return d; }
  function drawRing(L, dt) {
    const q = state.ring, N = L.N, cx = L.cx + shakeOf('ring'), cy = L.cy, Ro = L.Ro, Ri = L.Ri, Dl = 2 * Math.PI / N;
    const mid = function (i) { return -Math.PI / 2 + (i + 0.5) * Dl; };
    const size = S.ringSize(q), full = S.ringFull(q);
    // 底座與陰影
    D.contactShadow(ctx, cx, cy + Ro + 10, Ro * 0.9, 0.1);
    ctx.save();
    ctx.shadowColor = D.shadowInk(D.dark ? 0.55 : 0.18); ctx.shadowBlur = 12; ctx.shadowOffsetY = 3;
    ctx.beginPath(); ctx.arc(cx, cy, Ro + 4, 0, Math.PI * 2); ctx.arc(cx, cy, Ri - 4, 0, Math.PI * 2, true);
    const g = ctx.createRadialGradient(cx - Ro * 0.3, cy - Ro * 0.35, Ri * 0.5, cx, cy, Ro + 4);
    g.addColorStop(0, shade(C['sq-tray'], D.dark ? 0.12 : 0.5)); g.addColorStop(1, shade(C['sq-tray'], D.dark ? -0.2 : 0.05));
    ctx.fillStyle = g; ctx.fill('evenodd');
    ctx.restore();
    const ballR = Math.min(15, (Ro - Ri) * 0.3, (Ro + Ri) / 2 * Math.sin(Dl / 2) * 0.75);
    const rb = (Ro + Ri) / 2 + 5;
    for (let i = 0; i < N; i++) {
      const a0 = -Math.PI / 2 + i * Dl + 0.015, a1 = a0 + Dl - 0.03;
      sector(cx, cy, Ri, Ro, a0, a1);
      const v = q.buf[i];
      ctx.fillStyle = v != null ? mix(itemColor(v), C.surface, D.dark ? 0.62 : 0.68) : alpha(C.surface, D.dark ? 0.55 : 0.85);
      ctx.fill();
      const isRear = i === q.rear && (q.wrap || q.rear < N);
      if (isRear && v == null) {
        ctx.save();
        ctx.setLineDash([4, 3]); ctx.lineWidth = 2; ctx.strokeStyle = C['sq-rear']; ctx.stroke();
        if (q.wrap && full) {
          sector(cx, cy, Ri, Ro, a0, a1); ctx.clip();
          ctx.strokeStyle = alpha(C['sq-rear'], 0.35); ctx.lineWidth = 1.5; ctx.setLineDash([]);
          for (let k = -Ro; k < Ro * 2; k += 7) { ctx.beginPath(); ctx.moveTo(cx - Ro + k, cy - Ro); ctx.lineTo(cx - Ro + k - Ro, cy + Ro); ctx.stroke(); }
        }
        ctx.restore();
      } else {
        ctx.strokeStyle = alpha(C.text, 0.14); ctx.lineWidth = 1; ctx.stroke();
      }
      const ia = mid(i);
      D.haloText(ctx, String(i), cx + Math.cos(ia) * (Ri + 9), cy + Math.sin(ia) * (Ri + 9) + 4, C.muted, 'center', 'alphabetic', fnt(10.5, 600));
      if (v != null) {
        const id = state.slot[i];
        put('q' + id, cx + Math.cos(ia) * rb, cy + Math.sin(ia) * rb, cx + Math.cos(ia) * (Ro + 44), cy + Math.sin(ia) * (Ro + 44), function (x, y, a) {
          ctx.save(); ctx.globalAlpha = a;
          const c = itemColor(v);
          D.ball(ctx, x, y, ballR, c);
          ctx.fillStyle = inkOn(c); ctx.font = fnt(12, 700); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(String(v), x, y + 0.5, ballR * 2 - 2);
          ctx.restore();
        }, [Math.cos(ia) * 26, Math.sin(ia) * 26]);
      }
    }
    // 不繞回：接縫處是一道牆
    if (!q.wrap) {
      const a = -Math.PI / 2;
      ctx.save();
      ctx.lineCap = 'round'; ctx.strokeStyle = C['sq-bad']; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * (Ri - 6), cy + Math.sin(a) * (Ri - 6)); ctx.lineTo(cx + Math.cos(a) * (Ro + 8), cy + Math.sin(a) * (Ro + 8)); ctx.stroke();
      ctx.restore();
    }
    // 中央：個數
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, Ri - 10, 0, Math.PI * 2);
    ctx.fillStyle = alpha(C.surface, D.dark ? 0.75 : 0.92); ctx.fill();
    ctx.strokeStyle = alpha(C.text, 0.1); ctx.stroke();
    ctx.restore();
    D.haloText(ctx, T('個數', 'size'), cx, cy - 16, C.muted, 'center', 'alphabetic', fnt(12, 600));
    D.haloText(ctx, String(size), cx, cy + 10, full ? C['sq-bad'] : C.text, 'center', 'alphabetic', fnt(24, 700));
    D.haloText(ctx, T('最多 ', 'max ') + S.ringCap(q), cx, cy + 27, C.muted, 'center', 'alphabetic', fnt(11.5, 600));
    // front、rear 指標（角度平滑轉動，rear 從 N − 1 往前走到 0 時順時針轉一格）
    const seam = -Math.PI / 2 + N * Dl;
    const tf = q.front >= N ? seam : mid(q.front), tr = q.rear >= N ? seam : mid(q.rear);
    const k = reduced || snap ? 1 : 1 - Math.exp(-dt * 11);
    const df = angDiff(state.hand.f, tf), dr = angDiff(state.hand.r, tr);
    state.hand.f += df * k; state.hand.r += dr * k;
    if (Math.abs(df) > 0.003 || Math.abs(dr) > 0.003) animating = true;
    const same = q.front === q.rear;
    const hand = function (ang, color, label) {
      const c = Math.cos(ang), s = Math.sin(ang);
      D.arrow(ctx, cx + c * (Ro + 22), cy + s * (Ro + 22), cx + c * (Ro + 3), cy + s * (Ro + 3), color, 2.4);
      const lx = cx + c * (Ro + 34), ly = cy + s * (Ro + 34);
      D.pill(ctx, label, lx, ly + 9, color, 'center', fnt(11.5, 700));
    };
    if (same) hand(state.hand.r, C['sq-rear'], q.rear >= N ? 'front = rear = N' : 'front = rear');
    else { hand(state.hand.f, C['sq-front'], 'front'); hand(state.hand.r, C['sq-rear'], q.rear >= N ? 'rear = N' : 'rear'); }
    // 下方：同一個陣列攤平
    const x0 = L.ax0, cwid = L.cwid, ay = L.ay, hh = L.chh;
    for (let i = 0; i < N + (q.wrap ? 0 : 1); i++) {
      const x = x0 + i * cwid;
      D.roundRect(ctx, x + 1.5, ay - hh / 2, cwid - 3, hh, 6);
      if (i < N) {
        ctx.fillStyle = alpha(C.surface, D.dark ? 0.6 : 0.95); ctx.fill();
        ctx.strokeStyle = i === q.rear && q.buf[i] == null ? C['sq-rear'] : alpha(C.text, 0.18); ctx.lineWidth = i === q.rear ? 1.6 : 1; ctx.stroke();
      } else {
        ctx.save(); ctx.setLineDash([3, 3]); ctx.strokeStyle = alpha(C['sq-bad'], 0.6); ctx.stroke(); ctx.restore();
      }
      D.haloText(ctx, i < N ? String(i) : 'N', x + cwid / 2, ay + hh / 2 + 14, C.muted, 'center', 'alphabetic', fnt(10.5, 600));
      const v = i < N ? q.buf[i] : null;
      if (v != null) {
        const c = itemColor(v), tw = cwid - 9, th = hh - 9;
        put('a' + state.slot[i], x + cwid / 2, ay, x + cwid / 2, ay - 40, function (xx, yy, a) {
          ctx.save(); ctx.globalAlpha = a;
          D.block(ctx, xx - tw / 2, yy - th / 2, tw, th, c, { r: 5 });
          ctx.fillStyle = inkOn(c); ctx.font = fnt(cwid < 32 ? 11 : 12.5, 700); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(String(v), xx, yy + 1, tw - 2);
          ctx.restore();
        }, [0, -22]);
      }
    }
    if (x0 > 30) D.haloText(ctx, 'Q', x0 - 8, ay + 5, C.muted, 'right', 'alphabetic', fnt(13, 700, MONO));
    const fp = at('mf', x0 + (q.front + 0.5) * cwid, ay - hh / 2 - 6);
    const rp = at('mr', x0 + (q.rear + 0.5) * cwid, ay + hh / 2 + 20);
    pointer('front', fp.x, fp.y - 4, C['sq-front'], 'center', fp.x, fp.y + 2);
    pointer(q.rear >= N ? 'rear = N' : 'rear', rp.x, rp.y + 24, C['sq-rear'], 'center', rp.x, rp.y + 1);
  }

  // ---------- 模式三：括號配對 ----------
  function drawParen(L) {
    const x = state.x.paren, res = x.res, chars = res.chars || [], steps = res.steps;
    const sp = x.k > 0 ? steps[x.k - 1] : null;
    const cur = sp ? sp.i : -1;
    const stackNow = sp ? sp.stack : [];
    const inStack = {}; stackNow.forEach(function (e) { inStack[e.i] = true; });
    const paired = {};
    const pairs = [];
    for (let j = 0; j < x.k; j++) if (steps[j].act === 'match') { pairs.push(steps[j].pair); paired[steps[j].pair[0]] = paired[steps[j].pair[1]] = true; }
    const badI = sp && (sp.act === 'extraRight' || sp.act === 'mismatch') ? sp.i : -1;
    const badTop = sp && sp.act === 'mismatch' && res.err ? res.err.topPos : -1;
    const leftOver = sp && sp.act === 'extraLeft';
    // 山脈（堆疊深度）：只畫已經讀過的部分
    const prof = x.prof || [0];
    const u = Math.min(4, (L.mH - 6) / L.md);
    for (let r = 0; r < L.rows; r++) {
      const yb = L.top + r * L.rowH + L.arcH + L.th + L.mH + 2;
      const i0 = r * L.per, i1 = Math.min(chars.length, i0 + L.per) - 1;
      ctx.save();
      ctx.strokeStyle = alpha(C.text, 0.12); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(L.x0 - 2, yb + 0.5); ctx.lineTo(charPos(L, Math.max(i0, i1)).x + L.tw / 2 + 2, yb + 0.5); ctx.stroke();
      const last = cur < 0 ? -1 : Math.min(i1, leftOver ? chars.length - 1 : cur);
      if (last >= i0) {
        ctx.beginPath();
        ctx.moveTo(charPos(L, i0).x - L.tw / 2, yb);
        for (let i = i0; i <= last; i++) {
          const c = charPos(L, i), dd = prof[i + 1] != null ? prof[i + 1] : prof[prof.length - 1];
          ctx.lineTo(c.x - L.tw / 2 - (i > i0 ? L.gap / 2 : 0), yb - (prof[i] || 0) * u);
          ctx.lineTo(c.x - L.tw / 2 - (i > i0 ? L.gap / 2 : 0), yb - dd * u);
          ctx.lineTo(c.x + L.tw / 2 + L.gap / 2, yb - dd * u);
        }
        ctx.lineTo(charPos(L, last).x + L.tw / 2 + L.gap / 2, yb);
        ctx.closePath();
        const gg = ctx.createLinearGradient(0, yb - L.mH, 0, yb);
        gg.addColorStop(0, alpha(C['sq-br'], D.dark ? 0.5 : 0.35)); gg.addColorStop(1, alpha(C['sq-br'], 0.06));
        ctx.fillStyle = gg; ctx.fill();
        ctx.strokeStyle = alpha(C['sq-br'], 0.8); ctx.lineWidth = 1.2; ctx.stroke();
      }
      ctx.restore();
    }
    // 配對的弧
    pairs.forEach(function (pr) {
      const a = charPos(L, pr[0]), b = charPos(L, pr[1]), col = kindColor(chars[pr[0]]);
      const h = 7 + (L.arcH - 11) * (1 - (pr[2] - 1) / L.md);
      ctx.save();
      ctx.strokeStyle = alpha(col, 0.85); ctx.lineWidth = 1.8; ctx.lineCap = 'round';
      const yA = a.y - L.th / 2 - 2;
      if (a.row === b.row) {
        ctx.beginPath(); ctx.moveTo(a.x, yA); ctx.bezierCurveTo(a.x, yA - h * 1.3, b.x, yA - h * 1.3, b.x, yA); ctx.stroke();
      } else {
        const rEnd = L.x0 + L.per * (L.tw + L.gap), yB2 = b.y - L.th / 2 - 2;
        ctx.beginPath(); ctx.moveTo(a.x, yA); ctx.quadraticCurveTo(a.x, yA - h, Math.min(rEnd, a.x + 30), yA - h); ctx.lineTo(rEnd, yA - h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(L.x0 - 4, yB2 - h); ctx.lineTo(Math.max(L.x0, b.x - 30), yB2 - h); ctx.quadraticCurveTo(b.x, yB2 - h, b.x, yB2); ctx.stroke();
      }
      ctx.restore();
    });
    // 字元列
    chars.forEach(function (c, i) {
      const p = charPos(L, i), isBr = '()[]{}'.indexOf(c) >= 0;
      let st = '';
      if (i === badI || i === badTop || (leftOver && inStack[i])) st = 'bad';
      else if (i === cur) st = 'cur';
      else if (paired[i]) st = 'pair';
      else if (inStack[i]) st = 'in';
      else if (cur >= 0 && i < cur && !isBr) st = 'done';
      const shown = c === ' ' ? '·' : c;
      cell(p.x, p.y, L.tw, L.th, shown, isBr ? kindColor(c) : alpha(C.text, c === ' ' ? 0.3 : 0.7), st, true);
    });
    if (!chars.length) D.haloText(ctx, T('（還沒有輸入）', '(nothing typed yet)'), cw / 2, L.top + L.arcH + 18, C.muted, 'center', 'alphabetic', fnt(13, 600));
    // 堆疊
    const sx = L.sx, wellW = 40, yB = L.H - 34, hgt = L.vis * L.pitch + 8;
    const rk = rack(sx + shakeOf('A'), yB, wellW, hgt, T('堆疊', 'Stack'), stackNow.length + T(' 層', stackNow.length === 1 ? ' level' : ' levels'));
    const showFrom = Math.max(0, stackNow.length - L.vis);
    stackNow.forEach(function (e, j) {
      if (j < showFrom) return;
      const y = yB - 6 - (j - showFrom + 0.5) * L.pitch, cp = charPos(L, e.i), col = kindColor(e.ch);
      const fill = mix(col, C.surface, D.dark ? 0.5 : 0.7);
      const f = chip(wellW, L.pitch - 5, e.ch, fill, D.dark ? shade(col, 0.6) : shade(col, -0.35), fnt(15, 800, MONO));
      put('pb' + e.i, sx, y, cp.x, cp.y, f, [0, -20]);
    });
    if (showFrom > 0) D.haloText(ctx, T('（下面還有 ', '(+') + showFrom + T(' 個）', ' below)'), rk.xr + 8, yB - 2, C.muted, 'left', 'alphabetic', fnt(11, 600));
    if (stackNow.length) {
      const ty = yB - 6 - (stackNow.length - showFrom - 0.5) * L.pitch;
      pointer('top', rk.xl - 10, ty + 9, C['sq-top'], 'right', rk.xl - 2, ty);
    }
    // 說明卡
    const x0 = rk.xr + 22, x1 = cw - 10, y0 = L.mTop + 4;
    const big = fnt(17, 700), small = fnt(13, 500);
    let lines;
    if (!sp) {
      lines = res.err && !steps.length ? [{ t: S.message(res.err)[lang()], font: small, color: C['sq-bad'] }]
        : [{ t: T('由左往右讀：左括號放入堆疊，右括號要和頂端配對。', 'Read from left to right: opening brackets are pushed, closing brackets must match the top.'), font: small, color: C.muted },
          { t: T('按「單步」開始。', 'Press “Step” to start.'), font: small, color: C.muted }];
    } else if (sp.act === 'push') {
      lines = [{ t: T('「' + sp.ch + '」→ 放入堆疊', '“' + sp.ch + '” → push'), font: big, color: kindColor(sp.ch) },
        { t: T('深度變成 ' + sp.stack.length, 'depth is now ' + sp.stack.length), font: small, color: C.muted }];
    } else if (sp.act === 'match') {
      const op = chars[sp.pair[0]];
      lines = [{ t: op + ' … ' + sp.ch + '  ✓', font: big, color: C['sq-ok'] },
        { t: T('頂端的「' + op + '」和「' + sp.ch + '」配成一對：取出', 'the top “' + op + '” pairs with “' + sp.ch + '”: pop'), font: small, color: C.text }];
    } else if (sp.act === 'endOk') {
      lines = [{ t: T('✓ 全部配對成功', '✓ Everything matches'), font: big, color: C['sq-ok'] },
        { t: T('共 ' + res.pairs.length + ' 對，最深 ' + res.maxDepth + ' 層。', res.pairs.length + ' pair' + (res.pairs.length === 1 ? '' : 's') + ', at most ' + res.maxDepth + ' deep.'), font: small, color: C.text }];
    } else {
      const head = sp.act === 'extraRight' ? T('✗ 多了右括號', '✗ Extra closing bracket') : sp.act === 'mismatch' ? T('✗ 左右不對應', '✗ Brackets do not match') : T('✗ 多了左括號', '✗ Extra opening bracket');
      lines = [{ t: head, font: big, color: C['sq-bad'] }, { t: S.message(res.err)[lang()], font: small, color: C.text }];
    }
    infoCard(x0, y0, x1, lines);
  }

  // ---------- 記號列（後序式、中序式共用） ----------
  function drawTokStrip(L, x, curK, consumedTo) {
    const toks = x.res.tokens || [];
    const errK = x.res.err && x.res.err.pos != null ? toks.findIndex(function (t) { return t.pos === x.res.err.pos; }) : -1;
    toks.forEach(function (t, j) {
      const p = L.tok[j];
      let st = '';
      if (x.k > 0 && j === errK && x.k >= x.res.steps.length && !x.res.ok) st = 'bad';
      else if (j === curK) st = 'cur';
      else if (j < consumedTo) st = 'done';
      cell(p.x, p.y, p.w, 30, tokText(t), tokColor(t), st, true);
    });
    if (!toks.length) {
      const e = x.res.err ? S.message(x.res.err)[lang()] : '';
      D.haloText(ctx, e || T('（還沒有輸入）', '(nothing typed yet)'), cw / 2, L.top + 20, e ? C['sq-bad'] : C.muted, 'center', 'alphabetic', fnt(13, 600));
    }
  }

  // ---------- 模式四：後序式求值 ----------
  function pfKeys(res, k) {
    const st = [];
    for (let j = 0; j < k; j++) {
      const s = res.steps[j];
      if (s.act === 'num') st.push('n' + s.k);
      else if (s.act === 'op') { st.pop(); st.pop(); st.push('r' + s.k); }
    }
    return st;
  }
  function drawPostfix(L) {
    const x = state.x.postfix, res = x.res, steps = res.steps;
    const sp = x.k > 0 ? steps[x.k - 1] : null;
    const curK = sp && sp.tok ? sp.k : -1;
    drawTokStrip(L, x, curK, sp ? (sp.tok ? sp.k : 1e9) : 0);
    const stack = sp ? sp.stack : [], keys = pfKeys(res, x.k);
    const yB = L.yB, hgt = L.vis * L.pitch + 8, sx = L.sx;
    const rk = rack(sx + shakeOf('A'), yB, L.tw, hgt, T('堆疊', 'Stack'), stack.length + T(' 個數', stack.length === 1 ? ' number' : ' numbers'));
    const showFrom = Math.max(0, stack.length - L.vis);
    stack.forEach(function (v, j) {
      if (j < showFrom) return;
      const key = keys[j] || ('e' + j);
      const isR = key.charAt(0) === 'r';
      const col = isR ? C['sq-op'] : C['sq-num'];
      const fill = mix(col, C.surface, D.dark ? 0.6 : 0.78);
      const f = chip(L.tw - 4, L.pitch - 5, numStr(v), fill, C.text, fnt(14, 700, MONO));
      const src = isR ? null : L.tok[+key.slice(1)];
      put(key, sx, yB - 6 - (j - showFrom + 0.5) * L.pitch, src ? src.x : cw - 60, src ? src.y : L.mTop + 50, f, [0, -18]);
    });
    if (showFrom > 0) D.haloText(ctx, T('（下面還有 ', '(+') + showFrom + T(' 個）', ' below)'), rk.xr + 8, yB - 2, C.muted, 'left', 'alphabetic', fnt(11, 600));
    if (stack.length && !L.narrow) {
      const ty = yB - 6 - (stack.length - showFrom - 0.5) * L.pitch;
      pointer('top', rk.xr + 10, ty + 9, C['sq-top'], 'left', rk.xr + 2, ty);
    }
    const x0 = rk.xr + (L.narrow ? 14 : 58), x1 = cw - 10, y0 = L.mTop + 2;
    const big = fnt(18, 700, MONO), mid = fnt(14, 600), small = fnt(13, 500);
    let lines;
    if (!sp) {
      lines = res.err && !steps.length ? [{ t: S.message(res.err)[lang()], font: small, color: C['sq-bad'] }]
        : [{ t: T('數字放入堆疊；運算子取出兩個數，算完放回去。', 'Numbers are pushed; an operator pops two numbers and pushes the result.'), font: small, color: C.muted },
          { t: x.src === 'convert' ? T('這是從「中序轉後序」送來的後序式。按「單步」開始。', 'This postfix expression came from “Infix to postfix”. Press “Step” to start.') : T('按「單步」開始。', 'Press “Step” to start.'), font: small, color: C.muted }];
    } else if (sp.act === 'num') {
      lines = [{ t: numStr(sp.tok.v), font: big, color: C['sq-num'] }, { t: T('數字 → 放入堆疊', 'a number → push'), font: small, color: C.text }];
    } else if (sp.act === 'op') {
      lines = [{ t: T('先取出 b = ', 'first pop: b = ') + numStr(sp.b), font: mid, color: C.text },
        { t: T('再取出 a = ', 'then pop: a = ') + numStr(sp.a), font: mid, color: C.text, gap: 4 },
        { t: numStr(sp.a) + ' ' + SYM[sp.tok.v] + ' ' + numStr(sp.b) + ' = ' + numStr(sp.r), font: big, color: C['sq-op'] },
        { t: T('→ 結果放回堆疊', '→ push the result'), font: small, color: C.muted }];
    } else if (sp.act === 'end') {
      lines = [{ t: T('答案', 'Answer'), font: mid, color: C.muted }, { t: numStr(res.value), font: fnt(24, 800, MONO), color: C['sq-ok'] },
        { t: T('讀完了，堆疊裡剛好剩一個數。', 'The end: exactly one number is left.'), font: small, color: C.text }];
    } else {
      lines = [{ t: T('✗ 停下來了', '✗ Stopped'), font: fnt(17, 700), color: C['sq-bad'] }, { t: S.message(res.err)[lang()], font: small, color: C.text }];
    }
    infoCard(x0, y0, x1, lines);
  }

  // ---------- 模式五：中序轉後序（調度場） ----------
  function drawInfix(L) {
    const x = state.x.infix, res = x.res, steps = res.steps, toks = res.tokens || [];
    const sp = x.k > 0 ? steps[x.k - 1] : null;
    // 「目前」的記號：pop、drop、error 時它還在入口等；flush 時沒有
    const curK = sp && sp.act !== 'flush' && sp.k < toks.length ? sp.k : -1;
    const waiting = sp && (sp.act === 'pop' || sp.act === 'drop' || sp.act === 'error') && sp.tok && (sp.tok.t === 'op' || sp.tok.t === 'rp' || sp.act === 'error');
    drawTokStrip(L, x, curK, sp ? (sp.act === 'flush' ? 1e9 : sp.k + (waiting ? 0 : 1)) : 0);
    const yT = L.yT, xJ = L.xJ, sb = L.sb, w = cw;
    // 鐵軌
    const rail = C['sq-rail'];
    ctx.save();
    ctx.fillStyle = alpha(rail, D.dark ? 0.45 : 0.35);
    for (let xx = 8; xx < w - 6; xx += 13) { if (Math.abs(xx - xJ) < 20) continue; ctx.fillRect(xx, yT + 10, 4, 9); }
    for (let yy = yT + 26; yy < sb; yy += 13) ctx.fillRect(xJ - 20, yy, 40, 4);
    ctx.restore();
    D.tube(ctx, function (c) { c.moveTo(6, yT + 12); c.lineTo(w - 6, yT + 12); }, rail, 3.2);
    D.tube(ctx, function (c) { c.moveTo(6, yT + 17); c.lineTo(w - 6, yT + 17); }, rail, 3.2);
    D.tube(ctx, function (c) { c.moveTo(xJ - 14, yT + 18); c.lineTo(xJ - 14, sb); }, rail, 3.2);
    D.tube(ctx, function (c) { c.moveTo(xJ + 14, yT + 18); c.lineTo(xJ + 14, sb); }, rail, 3.2);
    D.block(ctx, xJ - 24, sb - 2, 48, 9, C['sq-wood'], { r: 3 });
    D.haloText(ctx, T('輸出（後序式）', 'Output (postfix)'), L.ox0, yT - 30, C.text, 'left', 'alphabetic', fnt(13, 700));
    D.haloText(ctx, T('輸入', 'Input'), w - 8, yT - 30, C.text, 'right', 'alphabetic', fnt(13, 700));
    D.haloText(ctx, T('運算子堆疊', 'Operator stack'), xJ - 30, yT + 44, C.text, 'right', 'alphabetic', fnt(12.5, 700));
    D.haloText(ctx, T('（側線）', '(the siding)'), xJ - 30, yT + 60, C.muted, 'right', 'alphabetic', fnt(11.5, 500));
    // 優先順序小表
    const py = Math.max(yT + 84, sb - 62);
    if (py + 56 <= sb + 22) {
      const f = fnt(12, 600, MONO);
      D.haloText(ctx, T('優先順序', 'Precedence'), 14, py, C.muted, 'left', 'alphabetic', fnt(11.5, 700));
      D.haloText(ctx, T('^  3  由右往左', '^  3  right to left'), 14, py + 17, C.muted, 'left', 'alphabetic', f);
      D.haloText(ctx, '× ÷ %  2', 14, py + 33, C.muted, 'left', 'alphabetic', f);
      D.haloText(ctx, '+ −  1', 14, py + 49, C.muted, 'left', 'alphabetic', f);
    }
    // 輸出軌上的車廂
    const out = sp ? sp.out : [];
    const skip = Math.max(0, out.length - L.maxShow);
    out.forEach(function (t, j) {
      if (j < skip) return;
      put('c' + t.id, L.ox0 + (j - skip + 0.5) * L.step, yT - 2, w + 30, yT - 2, car(L.carW, t), [-20, -8]);
    });
    if (skip) D.pill(ctx, '… +' + skip, L.ox0, yT - 44, C.muted, 'left', fnt(11, 700));
    // 側線（運算子堆疊）
    const stack = sp ? sp.stack : [];
    const showFrom = Math.max(0, stack.length - L.vis);
    stack.forEach(function (t, j) {
      if (j < showFrom) return;
      put('c' + t.id, xJ + shakeOf('A'), sb - 8 - (j - showFrom + 0.5) * L.pitch, w + 30, yT - 2, car(40, t), [0, -18]);
    });
    if (showFrom) D.pill(ctx, '+' + showFrom, xJ + 26, sb - 4, C.muted, 'left', fnt(11, 700));
    if (stack.length) {
      const ty = sb - 8 - (stack.length - showFrom - 0.5) * L.pitch;
      pointer('top', xJ + 30, ty + 9, C['sq-top'], 'left', xJ + 22, ty);
    }
    // 入口等待的車廂（運算子或右括號正在等頂端的運算子先開走；出錯時停在入口）
    if (sp && sp.tok && (waiting || sp.act === 'error')) put('c' + sp.tok.id, Math.round(xJ + (w - xJ) / 2 + 6), yT - 2, w + 30, yT - 2, car(Math.min(40, w - xJ - 24), sp.tok), [16, -16]);
    // 結果
    if (sp && x.k >= steps.length) {
      const msg = res.ok ? (res.value != null ? '= ' + numStr(res.value) : T('（算不出值：', '(no value: ') + errShort(res.evalErr ? res.evalErr.code : '') + T('）', ')')) : '✗ ' + (res.err ? S.message(res.err)[lang()] : '');
      ctx.font = fnt(12.5, 700);
      const lines = wrapText(msg, Math.max(110, xJ - 150));
      lines.slice(0, 3).forEach(function (ln, i) { D.haloText(ctx, ln, 14, yT + 42 + i * 17, res.ok && res.value != null ? C['sq-ok'] : C['sq-bad'], 'left', 'alphabetic', fnt(12.5, 700)); });
    }
  }
  function lang() { return T('zh', 'en'); }

  // ======================= 音效 =======================
  function sound() { const Sd = window.LabSound; return Sd && Sd.enabled() ? Sd : null; }
  const note = function (k) { return 330 * Math.pow(2, k / 12); };
  function buzz(Sd) { Sd.sweep({ from: 420, to: 260, dur: 0.24, type: 'sawtooth', gain: 0.08 }); }
  function deskSound(r) {
    const Sd = sound(); if (!Sd) return;
    const d = state.desk;
    if (!r.ok) { buzz(Sd); return; }
    const op = r.op;
    if (op === 'push' || op === 'pushB') Sd.tone({ freq: note(2 * ((op === 'push' ? d.A : d.R).length)), dur: 0.12, type: 'triangle', gain: 0.17 });
    else if (op === 'pop' || op === 'popB') Sd.sweep({ from: note(2 * ((op === 'pop' ? d.A : d.R).length + 1) + 0), to: note(2 * ((op === 'pop' ? d.A : d.R).length) - 3), dur: 0.14, type: 'triangle', gain: 0.15 });
    else if (op === 'enq') Sd.tone({ freq: 440, dur: 0.1, type: 'sine', gain: 0.16 });
    else if (op === 'deq') Sd.tone({ freq: 587.33, dur: 0.1, type: 'sine', gain: 0.16 });
    else if (op === 'top' || op === 'front' || op === 'topB') Sd.tone({ freq: 1046.5, dur: 0.05, type: 'sine', gain: 0.1 });
    else if (op === 'rot') { Sd.tone({ freq: 587.33, dur: 0.07, type: 'sine', gain: 0.13 }); Sd.tone({ freq: 440, dur: 0.08, type: 'sine', gain: 0.13, delay: 0.08 }); }
    else if (op === 'toL' || op === 'toR') Sd.sweep({ from: op === 'toR' ? 392 : 523.25, to: op === 'toR' ? 523.25 : 392, dur: 0.16, type: 'triangle', gain: 0.13 });
    else if (op === 'clear') Sd.sweep({ from: 660, to: 330, dur: 0.22, type: 'triangle', gain: 0.1 });
  }
  function ringSound(r) {
    const Sd = sound(); if (!Sd) return;
    if (!r.ok) { buzz(Sd); return; }
    if (r.op === 'enq') Sd.tone({ freq: note(r.idx * 2), dur: 0.11, type: 'triangle', gain: 0.16 });
    else if (r.op === 'deq') Sd.tone({ freq: note(r.idx * 2 + 7), dur: 0.09, type: 'sine', gain: 0.14 });
    else Sd.sweep({ from: 660, to: 330, dur: 0.22, type: 'triangle', gain: 0.1 });
    if (r.wrapped) Sd.tone({ freq: 1318.5, dur: 0.12, type: 'sine', gain: 0.1, delay: 0.1 });
  }
  function runSound(x, how) {
    const Sd = sound(); if (!Sd || !x.k) return;
    const sp = x.res.steps[x.k - 1], dense = how === 'play' && state.speed > 6;
    if (sp.act === 'error' || sp.act === 'extraRight' || sp.act === 'mismatch' || sp.act === 'extraLeft') { buzz(Sd); return; }
    if (sp.act === 'endOk' || sp.act === 'end' || (state.mode === 'infix' && x.k === x.res.steps.length && x.res.ok)) {
      [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) { Sd.tone({ freq: f, dur: 0.12, type: 'sine', gain: 0.15, delay: i * 0.07 }); });
      return;
    }
    if (dense && (sp.act === 'num' || sp.act === 'out')) return;
    if (sp.act === 'push' && state.mode === 'paren') Sd.tone({ freq: note(2 * sp.stack.length), dur: 0.09, type: 'triangle', gain: 0.15 });
    else if (sp.act === 'match') Sd.tone({ freq: note(2 * sp.stack.length + 7), dur: 0.12, type: 'sine', gain: 0.15 });
    else if (sp.act === 'num' || sp.act === 'out') Sd.tone({ freq: 660, dur: 0.05, type: 'sine', gain: 0.09 });
    else if (sp.act === 'op') Sd.tone({ freq: 784, dur: 0.12, type: 'triangle', gain: 0.15 });
    else if (sp.act === 'push' || sp.act === 'lp') Sd.tone({ freq: note(2 * sp.stack.length), dur: 0.09, type: 'triangle', gain: 0.14 });
    else if (sp.act === 'pop' || sp.act === 'flush') Sd.sweep({ from: 523.25, to: 784, dur: 0.12, type: 'triangle', gain: 0.13 });
    else if (sp.act === 'drop') Sd.tone({ freq: 349.23, dur: 0.08, type: 'sine', gain: 0.1 });
  }
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }
  $('soundBtn').addEventListener('click', function () {
    if (window.LabSettings) window.LabSettings.set('sound', !window.LabSettings.get('sound'));
    updateSoundButton();
  });
  window.addEventListener('lab:settingschange', function (ev) { if (ev.detail && ev.detail.name === 'sound') updateSoundButton(); });

  // ======================= 操作：模式一 =======================
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }
  function say(zh, en, bad) { state.msg = { zh: zh, en: en, bad: !!bad }; renderStatus(); }
  function renderStatus() {
    const m = state.msg, el = $('status');
    el.textContent = m ? T(m.zh, m.en) : '';
    el.classList.toggle('bad', !!(m && m.bad));
  }
  function mirrorIds(op) {
    const I = state.ids, Q = state.desk.rk === 'queue';
    switch (op) {
      case 'push': I.A.push(state.nid++); break;
      case 'pop': I.A.pop(); break;
      case 'enq': case 'pushB': I.R.push(state.nid++); break;
      case 'deq': I.R.shift(); break;
      case 'popB': I.R.pop(); break;
      case 'rot': I.R.push(I.R.shift()); break;
      case 'toR': I.R.push(I.A.pop()); break;
      case 'toL': I.A.push(Q ? I.R.shift() : I.R.pop()); break;
      case 'clear': I.A = []; I.R = []; break;
    }
  }
  function doDesk(op) {
    const d = state.desk, Q = d.rk === 'queue';
    const r = S.deskDo(d, op);
    state.ring.next = d.next;
    if (r.ok) mirrorIds(op);
    syncVal();
    describeDesk(r);
    // 畫面回饋
    if (!r.ok) {
      const which = (op === 'push' || op === 'pop' || op === 'top' || (op === 'toR' && r.err === 'underflow') || (op === 'toL' && r.err === 'overflow')) ? 'A' : 'R';
      fxShake(which);
      fxMsg(r.err === 'overflow' ? T('溢位！', 'Overflow!') : T('下溢：空的', 'Underflow: empty'), which, C['sq-bad']);
    } else if (op === 'top') fxRing('d' + state.ids.A[state.ids.A.length - 1], C['sq-top']);
    else if (op === 'front') fxRing('d' + state.ids.R[0], C['sq-front']);
    else if (op === 'topB') fxRing('d' + state.ids.R[state.ids.R.length - 1], C['sq-top']);
    deskSound(r);
    addLog({ m: 'desk', op: op, ok: r.ok, err: r.err, v: r.v, Q: Q, A: d.A.slice(), R: d.R.slice() });
    emit('op', r.ev);
    updateAll();
  }
  function describeDesk(r) {
    const d = state.desk, v = r.v, op = r.op;
    if (!r.ok) {
      const look = op === 'top' || op === 'front' || op === 'topB';
      if (r.err === 'overflow') {
        const tgt = op === 'push' || op === 'toL' ? 'A' : 'R';
        say('溢位！' + zhName(tgt) + '已經有 ' + d.cap + ' 個（容量 ' + d.cap + '），放不進去；內容不變。', 'Overflow! ' + cap1(enName(tgt)) + ' already holds ' + d.cap + ' (its capacity), so nothing more fits; nothing changes.', true);
      } else {
        const src = op === 'pop' || op === 'top' || op === 'toR' ? 'A' : 'R';
        if (look) say(zhName(src) + '是空的，沒有東西可以看。', cap1(enName(src)) + ' is empty: there is nothing to look at.', true);
        else say('下溢！' + zhName(src) + '是空的，沒有東西可以拿；內容不變。', 'Underflow! ' + cap1(enName(src)) + ' is empty, so there is nothing to take; nothing changes.', true);
      }
      return;
    }
    const Q = d.rk === 'queue';
    const M = {
      push: ['放入 ' + v + '：疊在最上面，成為新的頂端。', 'Push ' + v + ': it goes on top and becomes the new top.'],
      pop: ['取出 ' + v + '：拿走的是最上面那一個——最後放進去的。', 'Pop ' + v + ': the one on top leaves — the last one put in.'],
      top: ['頂端是 ' + v + '（只看不拿，堆疊不變）。', 'The top is ' + v + ' (look only; the stack does not change).'],
      enq: ['排入 ' + v + '：排在隊伍最後面（rear）。', 'Enqueue ' + v + ': it joins the back of the line (rear).'],
      deq: ['離開 ' + v + '：走的是排在最前面（front）的——最早來的那一個。', 'Dequeue ' + v + ': the one at the front leaves — the earliest to arrive.'],
      front: ['前端是 ' + v + '（只看不動）。', 'The front is ' + v + ' (look only).'],
      rot: [v + ' 從前端離開，立刻排到隊尾。', v + ' leaves the front and joins the back at once.'],
      pushB: ['放入 B：' + v + ' 疊在 B 的最上面。', 'Push ' + v + ' onto B.'],
      popB: ['從 B 取出 ' + v + '。', 'Pop ' + v + ' from B.'],
      topB: ['B 的頂端是 ' + v + '。', 'The top of B is ' + v + '.'],
      toR: Q ? ['從堆疊取出 ' + v + '，排入佇列尾端。', 'Pop ' + v + ' from the stack and enqueue it.'] : ['從 A 取出 ' + v + '，放入 B。', 'Pop ' + v + ' from A and push it onto B.'],
      toL: Q ? ['佇列前端的 ' + v + ' 離開，放入堆疊。', v + ' leaves the front of the queue and is pushed onto the stack.'] : ['從 B 取出 ' + v + '，放入 A。', 'Pop ' + v + ' from B and push it onto A.'],
      clear: ['兩邊都清空了。', 'Both sides are empty now.']
    }[op];
    say(M[0], M[1]);
  }
  function zhName(w) { const Q = state.desk.rk === 'queue'; return w === 'A' ? (Q ? '堆疊' : '堆疊 A') : (Q ? '佇列' : '堆疊 B'); }
  function enName(w) { const Q = state.desk.rk === 'queue'; return w === 'A' ? (Q ? 'the stack' : 'stack A') : (Q ? 'the queue' : 'stack B'); }
  function cap1(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  // ======================= 操作：模式二 =======================
  function doRing(op) {
    const q = state.ring;
    const r = S.ringDo(q, op);
    state.desk.next = q.next;
    if (r.ok) {
      if (op === 'enq') state.slot[r.idx] = state.nid++;
      else if (op === 'deq') state.slot[r.idx] = 0;
      else state.slot = new Array(q.N).fill(0);
    } else {
      fxShake('ring');
      const fake = r.err === 'full' && !q.wrap && S.ringSize(q) < q.N;
      fxMsg(fake ? T('假溢位！', 'False overflow!') : r.err === 'full' ? T('滿了！', 'Full!') : T('空的！', 'Empty!'), 'ring', C['sq-bad']);
    }
    syncVal();
    describeRing(r);
    ringSound(r);
    addLog({ m: 'ring', op: op, ok: r.ok, err: r.err, v: r.v, idx: r.idx, front: q.front, rear: q.rear, size: S.ringSize(q), N: q.N, wrapped: r.wrapped });
    emit('op', r.ev);
    updateAll();
  }
  function describeRing(r) {
    const q = state.ring, N = q.N;
    if (r.op === 'clear') { say('陣列清空了：front = rear = 0。', 'The array is empty again: front = rear = 0.'); return; }
    if (!r.ok) {
      if (r.err === 'empty') { say('空的！front = rear = ' + q.front + '，沒有東西可以離開。', 'Empty! front = rear = ' + q.front + ', so nothing can leave.', true); return; }
      if (q.wrap) {
        say('滿了！(rear + 1) mod N = (' + q.rear + ' + 1) mod ' + N + ' = ' + ((q.rear + 1) % N) + ' = front。再放一個，rear 就會等於 front，和「空」分不出來，所以要留一格空位。',
          'Full! (rear + 1) mod N = (' + q.rear + ' + 1) mod ' + N + ' = ' + ((q.rear + 1) % N) + ' = front. One more and rear would equal front, which looks exactly like “empty”, so one cell stays free.', true);
      } else if (S.ringSize(q) < N) {
        const free = N - S.ringSize(q);
        say('假溢位！rear 已經走到 N = ' + N + '（陣列的最後面），前面明明還有 ' + free + ' 個空格，不繞回就用不到。', 'False overflow! rear has reached N = ' + N + ' (the end of the array). There ' + (free === 1 ? 'is 1 free cell' : 'are ' + free + ' free cells') + ' at the front, but without wrapping round they cannot be used.', true);
      } else say('滿了！' + N + ' 格全部放滿。', 'Full! All ' + N + ' cells are used.', true);
      return;
    }
    if (r.op === 'enq') {
      say('排入 ' + r.v + '：放在 Q[' + r.idx + ']，rear 往前一格' + (r.wrapped ? '：走過 N − 1 之後繞回 0。' : ' → ' + q.rear + '。'),
        'Enqueue ' + r.v + ': it goes into Q[' + r.idx + '] and rear moves on' + (r.wrapped ? ': past N − 1 it wraps round to 0.' : ' to ' + q.rear + '.'));
    } else {
      say('離開 ' + r.v + '：從 Q[' + r.idx + '] 取出，front 往前一格' + (r.wrapped ? '：繞回 0。' : ' → ' + q.front + '。'),
        'Dequeue ' + r.v + ': it is taken from Q[' + r.idx + '] and front moves on' + (r.wrapped ? ': it wraps round to 0.' : ' to ' + q.front + '.'));
    }
  }
  function rebuildRing() {
    const q = state.ring, keep = { next: q.next, auto: q.auto };
    const N = Math.round(val($('ringN'))), wrap = $('wrap').checked;
    state.ring = Object.assign(S.newRing(N, wrap), keep);
    state.slot = new Array(state.ring.N).fill(0);
    state.hand.f = state.hand.r = -Math.PI / 2 + Math.PI / state.ring.N;
  }

  // ======================= 操作：模式三、四、五 =======================
  function runX() { return isRun(state.mode) ? state.x[state.mode] : null; }
  function advance(n, how) {
    const x = runX();
    if (!x) return;
    const N = x.res.steps.length;
    if (!N) { stopPlay(); updateAll(); return; }
    const k0 = x.k;
    x.k = Math.min(N, x.k + Math.max(1, n));
    if (x.k !== k0) runSound(x, how);
    if (x.k >= N && !x.done) { x.done = true; finishRun(x); }
    if (x.k >= N) stopPlay();
    describeRun();
    updateAll();
  }
  function back() {
    const x = runX();
    if (!x) return;
    stopPlay();
    if (x.k > 0) { x.k--; x.done = false; }
    describeRun();
    updateAll();
  }
  function resetRun() {
    const x = runX();
    if (!x) return;
    stopPlay();
    x.k = 0; x.done = false;
    describeRun();
    updateAll();
  }
  function finishRun(x) {
    const m = state.mode;
    if (m === 'paren') emit('scan', S.scanEvent(x.res, x.str));
    else if (m === 'postfix') emit('eval', S.evalEvent(x.res, x.src, x.src === 'convert' ? x.typed : x.src === 'typed', x.fromParen));
    else emit('convert', S.convertEvent(x.res, x.str));
    addLog({ m: m, str: x.str, ok: x.res.ok, err: x.res.err, value: x.res.value, postfix: x.res.postfixStr, depth: x.res.maxDepth, maxOps: x.res.maxOps, src: x.src });
  }
  function describeRun() {
    const x = runX();
    if (!x) return;
    const res = x.res, N = res.steps.length, m = state.mode;
    if (!N) {
      if (res.err) { const e = S.message(res.err); say(e.zh, e.en, res.err.code !== 'empty'); }
      else say('', '');
      return;
    }
    if (!x.k) {
      say('共 ' + N + ' 步。按「單步」一步一步看，或按「播放」。', N + ' steps in all. Press “Step” to go one step at a time, or “Play”.');
      return;
    }
    const sp = res.steps[x.k - 1], pre = '第 ' + x.k + '／' + N + ' 步：', preE = 'Step ' + x.k + ' of ' + N + ': ';
    const err = res.err ? S.message(res.err) : null;
    if (m === 'paren') {
      if (sp.act === 'push') say(pre + '「' + sp.ch + '」是左括號：放入堆疊（深度 ' + sp.stack.length + '）。', preE + '“' + sp.ch + '” is an opening bracket: push it (depth ' + sp.stack.length + ').');
      else if (sp.act === 'match') { const o = res.chars[sp.pair[0]]; say(pre + '「' + sp.ch + '」和頂端的「' + o + '」是一對：取出（深度 ' + sp.stack.length + '）。', preE + '“' + sp.ch + '” pairs with the “' + o + '” on top: pop it (depth ' + sp.stack.length + ').'); }
      else if (sp.act === 'endOk') say(pre + '讀完了，堆疊是空的：全部配對成功！共 ' + res.pairs.length + ' 對，最深 ' + res.maxDepth + ' 層。', preE + 'the end, and the stack is empty: everything matches! ' + res.pairs.length + ' pair' + (res.pairs.length === 1 ? '' : 's') + ', at most ' + res.maxDepth + ' deep.');
      else say(pre + err.zh, preE + err.en, true);
      return;
    }
    if (m === 'postfix') {
      if (sp.act === 'num') say(pre + '「' + numStr(sp.tok.v) + '」是數字：放入堆疊。', preE + '“' + numStr(sp.tok.v) + '” is a number: push it.');
      else if (sp.act === 'op') say(pre + '「' + SYM[sp.tok.v] + '」：先取出 b = ' + numStr(sp.b) + '，再取出 a = ' + numStr(sp.a) + '，算 ' + numStr(sp.a) + ' ' + SYM[sp.tok.v] + ' ' + numStr(sp.b) + ' = ' + numStr(sp.r) + '，放回堆疊。',
        preE + '“' + SYM[sp.tok.v] + '”: pop b = ' + numStr(sp.b) + ' first, then a = ' + numStr(sp.a) + '; ' + numStr(sp.a) + ' ' + SYM[sp.tok.v] + ' ' + numStr(sp.b) + ' = ' + numStr(sp.r) + ' is pushed back.');
      else if (sp.act === 'end') say(pre + '讀完了，堆疊裡剛好剩一個數：答案是 ' + numStr(res.value) + '。', preE + 'the end, and exactly one number is left: the answer is ' + numStr(res.value) + '.');
      else say(pre + err.zh, preE + err.en, true);
      return;
    }
    const t = sp.tok ? tokText(sp.tok) : '', mv = sp.moved ? tokText(sp.moved) : '';
    let zh = '', en = '';
    if (sp.act === 'out') { zh = '「' + t + '」是數字：直接送到輸出。'; en = '“' + t + '” is a number: straight to the output.'; }
    else if (sp.act === 'push') { zh = '「' + t + '」放入運算子堆疊。'; en = '“' + t + '” goes onto the operator stack.'; }
    else if (sp.act === 'lp') { zh = '「' + t + '」是左括號：放入堆疊，當作隔板。'; en = '“' + t + '” is an opening bracket: push it as a barrier.'; }
    else if (sp.act === 'pop' && sp.tok && sp.tok.t === 'rp') { zh = '遇到右括號「' + t + '」：把「' + mv + '」送到輸出，直到碰到左括號。'; en = 'A closing bracket “' + t + '”: “' + mv + '” goes to the output, until the opening bracket is reached.'; }
    else if (sp.act === 'pop') {
      const same = S.PREC[sp.moved.v] === S.PREC[sp.tok.v];
      zh = '「' + mv + '」要比「' + t + '」先算（' + (same ? '一樣高，由左往右' : '優先順序比較高') + '）：從堆疊送到輸出。';
      en = '“' + mv + '” must be done before “' + t + '” (' + (same ? 'equal precedence, left to right' : 'higher precedence') + '): from the stack to the output.';
    } else if (sp.act === 'drop') { zh = '碰到對應的左括號：這一對括號丟掉（後序式不需要括號）。'; en = 'The matching opening bracket: throw the pair away (postfix needs no brackets).'; }
    else if (sp.act === 'flush') { zh = '式子讀完了：堆疊裡剩下的「' + mv + '」送到輸出。'; en = 'The expression has ended: “' + mv + '”, left on the stack, goes to the output.'; }
    else { say(pre + err.zh, preE + err.en, true); return; }
    if (x.k === N && res.ok) {
      zh += '轉換完成：' + pretty(res.postfixStr) + (res.value != null ? '，值是 ' + numStr(res.value) + '。' : '。');
      en += ' Done: ' + pretty(res.postfixStr) + (res.value != null ? ', whose value is ' + numStr(res.value) + '.' : '.');
    }
    say(pre + zh, preE + en);
  }
  function stopPlay() { state.playing = false; state.acc = 0; }
  function togglePlay() {
    const x = runX();
    if (!x) return;
    if (state.playing) { stopPlay(); updateAll(); return; }
    const N = x.res.steps.length;
    if (!N) return;
    if (x.k >= N) { if (!x.done) { advance(1, 'play'); return; } x.k = 0; x.done = false; }
    state.playing = true; state.acc = 1;
    updateAll();
    requestDraw();
  }

  // ======================= 輸入 =======================
  const exprEl = $('expr'), exSel = $('exSel');
  function fillExamples() {
    const m = state.mode;
    if (!isRun(m)) return;
    exSel.innerHTML = EX[m].map(function (e, i) { return '<option value="' + i + '">' + esc(m === 'paren' ? e : pretty(e)) + '</option>'; }).join('');
    syncExample();
  }
  function syncExample() {
    const x = runX();
    if (!x) return;
    const c = S.compact(x.str);
    exSel.selectedIndex = EX[state.mode].findIndex(function (e) { return S.compact(e) === c; });
  }
  function exprHints() {
    const m = state.mode;
    if (m === 'paren') {
      $('exprCap').textContent = T('輸入一段文字或算式', 'Type some text or an expression');
      $('exprHint').textContent = T('最多 60 個字元。只檢查 ( ) [ ] { }，其他字元都跳過。', 'At most 60 characters. Only ( ) [ ] { } are checked; everything else is skipped.');
    } else if (m === 'postfix') {
      $('exprCap').textContent = T('輸入後序式', 'Type a postfix expression');
      $('exprHint').textContent = T('數字和運算子之間用空白隔開，例如 3 4 + 2 *。可用 + − × ÷ % ^（× 可以打 *，÷ 可以打 /）；整數除法向 0 取整。', 'Separate numbers and operators with spaces, e.g. 3 4 + 2 *. Use + − × ÷ % ^ (type * for × and / for ÷); integer division rounds towards zero.');
    } else {
      $('exprCap').textContent = T('輸入中序式（平常寫的算式）', 'Type an infix expression (an ordinary one)');
      $('exprHint').textContent = T('例如 (3 + 4) * 2。可用 + − × ÷ % ^ 和括號；^ 由右往左算；不支援負號開頭，請寫成 (0 − 3)。', 'For example (3 + 4) * 2. Use + − × ÷ % ^ and brackets; ^ groups from the right; a leading minus is not supported, write (0 − 3).');
    }
  }
  exprEl.addEventListener('input', function () {
    const m = state.mode;
    if (!isRun(m)) return;
    stopPlay();
    load(m, exprEl.value);
    syncExample();
    describeRun();
    updateAll();
  });
  exSel.addEventListener('change', function () {
    const m = state.mode, i = +exSel.value;
    if (!isRun(m) || !(i >= 0)) return;
    stopPlay();
    load(m, EX[m][i]);
    exprEl.value = EX[m][i];
    describeRun();
    updateAll();
  });
  $('toEvalBtn').addEventListener('click', function () {
    const x = state.x.infix;
    if (!x.res.ok) return;
    stopPlay();
    load('postfix', x.res.postfixStr, 'convert');
    state.x.postfix.typed = x.typed; state.x.postfix.fromParen = x.res.parenPairs;
    setMode('postfix');
    say('後序式「' + pretty(x.res.postfixStr) + '」已經送到「後序式求值」：按「單步」或「播放」計算。', 'The postfix expression “' + pretty(x.res.postfixStr) + '” has been sent to “Postfix evaluation”: press “Step” or “Play” to work it out.');
  });

  // ======================= 紀錄 =======================
  function addLog(row) {
    state.logN++;
    row.n = state.logN;
    state.log.unshift(row);
    if (state.log.length > 300) state.log.length = 300;
    renderLog();
  }
  const OPN = {
    push: ['放入（push）', 'push'], pop: ['取出（pop）', 'pop'], top: ['看頂端（top）', 'top'], enq: ['排入（enqueue）', 'enqueue'], deq: ['離開（dequeue）', 'dequeue'],
    front: ['看前端（front）', 'front'], rot: ['排到隊尾', 'to the back'], pushB: ['放入 B', 'push B'], popB: ['取出 B', 'pop B'], topB: ['看 B 頂端', 'top of B'], clear: ['清空', 'empty']
  };
  function logCells(r) {
    const list = function (a) { return '[' + a.join(' ') + ']'; };
    if (r.m === 'desk') {
      const nm = r.op === 'toR' ? (r.Q ? T('堆疊 → 佇列', 'stack → queue') : 'A → B') : r.op === 'toL' ? (r.Q ? T('佇列 → 堆疊', 'queue → stack') : 'B → A') : T(OPN[r.op][0], OPN[r.op][1]);
      const res = r.ok ? (r.v != null ? String(r.v) : '✓') : r.err === 'overflow' ? T('溢位', 'overflow') : T('下溢', 'underflow');
      const cont = (r.Q ? T('堆疊', 'stack') : 'A') + ' ' + list(r.A) + '　' + (r.Q ? T('佇列', 'queue') : 'B') + ' ' + list(r.R);
      return [nm, res, r.ok ? '' : 'bad', cont];
    }
    if (r.m === 'ring') {
      const nm = T(OPN[r.op][0], OPN[r.op][1]);
      const res = r.ok ? (r.op === 'clear' ? '✓' : r.v + ' ' + (r.op === 'enq' ? '→' : '←') + ' Q[' + r.idx + ']') : r.err === 'full' ? T('滿了', 'full') : T('空的', 'empty');
      return [nm, res, r.ok ? '' : 'bad', 'front ' + r.front + '、rear ' + r.rear + '、' + T('個數 ', 'size ') + r.size];
    }
    const mn = r.m === 'paren' ? T('括號配對', 'brackets') : r.m === 'postfix' ? T('後序式', 'postfix') : T('中序轉後序', 'infix → postfix');
    let res;
    if (!r.ok) res = r.err ? errShort(r.err.code) : '✗';
    else if (r.m === 'paren') res = T('配對成功', 'matched');
    else if (r.m === 'postfix') res = '= ' + numStr(r.value);
    else res = pretty(r.postfix) + (r.value != null ? '（= ' + numStr(r.value) + '）' : '');
    return [mn, res, r.ok ? 'ok' : 'bad', r.m === 'paren' ? r.str : pretty(r.str)];
  }
  function errShort(code) {
    const M = { extraRight: ['多了右括號', 'extra closing bracket'], extraLeft: ['多了左括號', 'extra opening bracket'], mismatch: ['左右不對應', 'brackets do not match'],
      underflow: ['運算元不夠', 'not enough operands'], extra: ['多餘的運算元', 'too many operands'], div0: ['除以 0', 'division by zero'], negExp: ['負的指數', 'negative power'],
      overflow: ['數字太大', 'number too big'], paren: ['後序式不用括號', 'no brackets in postfix'], empty: ['還沒輸入', 'nothing typed'], tooLong: ['太長', 'too long'],
      tooMany: ['太長', 'too long'], badChar: ['看不懂的字元', 'unreadable character'], numBig: ['數字太大', 'number too big'], missingOp: ['少了運算子', 'missing operator'],
      missingNum: ['少了數字', 'missing number'], endOp: ['以運算子結尾', 'ends with an operator'], unary: ['負號開頭', 'leading minus'] };
    const e = M[code] || ['錯誤', 'error'];
    return T(e[0], e[1]);
  }
  function renderLog() {
    const tab = $('logTab');
    $('logEmpty').hidden = state.log.length > 0;
    if (!state.log.length) { tab.innerHTML = ''; return; }
    let html = '<thead><tr><th>#</th><th>' + T('操作', 'Action') + '</th><th>' + T('結果', 'Result') + '</th><th>' + T('之後／式子', 'After / expression') + '</th></tr></thead><tbody>';
    state.log.forEach(function (r) {
      const c = logCells(r);
      html += '<tr><td>' + r.n + '</td><td>' + esc(c[0]) + '</td><td class="' + c[2] + '">' + esc(c[1]) + '</td><td class="mono">' + esc(c[3]) + '</td></tr>';
    });
    tab.innerHTML = html + '</tbody>';
  }

  // ======================= 畫面上的文字 =======================
  const lastHTML = {};
  function setHTML(id, html) { if (lastHTML[id] !== html) { lastHTML[id] = html; $(id).innerHTML = html; } }
  function rows(list) {
    return list.map(function (r) { return '<dt>' + r[0] + '</dt><dd' + (r[2] ? ' class="' + r[2] + '"' : '') + '>' + r[1] + '</dd>'; }).join('');
  }
  function seq(a) { return a.length ? '<span class="seq">' + a.slice(-24).map(numStr).join('、') + '</span>' + (a.length > 24 ? ' …' : '') : '—'; }
  function updateAll() {
    const m = state.mode;
    updateButtons();
    renderLegend();
    let rd = [], strip = '', theory = '';
    if (m === 'desk') {
      const d = state.desk, Q = d.rk === 'queue';
      rd = [[Q ? T('堆疊的大小', 'Stack size') : T('A 的大小', 'Size of A'), d.A.length + ' <small>/ ' + d.cap + '</small>'],
        [Q ? T('頂端（top）', 'Top') : T('A 的頂端', 'Top of A'), d.A.length ? numStr(d.A[d.A.length - 1]) : T('—（空的）', '— (empty)')]];
      if (Q) rd.push([T('佇列的大小', 'Queue size'), d.R.length + ' <small>/ ' + d.cap + '</small>'], [T('前端（front）', 'Front'), d.R.length ? numStr(d.R[0]) : T('—（空的）', '— (empty)')], [T('尾端（rear）', 'Rear'), d.R.length ? numStr(d.R[d.R.length - 1]) : '—']);
      else rd.push([T('B 的大小', 'Size of B'), d.R.length + ' <small>/ ' + d.cap + '</small>'], [T('B 的頂端', 'Top of B'), d.R.length ? numStr(d.R[d.R.length - 1]) : T('—（空的）', '— (empty)')]);
      rd.push([T('下一個要放的數', 'Next number to put in'), String(d.next)], [T('基本操作次數', 'Basic operations'), String(d.ops)]);
      strip = '<p><b>' + (Q ? T('取出（pop）的順序：', 'Popped, in order: ') : T('從 A 取出的順序：', 'Popped from A: ')) + '</b>' + seq(d.outA) + '</p>' +
        '<p><b>' + (Q ? T('離開（dequeue）的順序：', 'Dequeued, in order: ') : T('從 B 取出的順序：', 'Popped from B: ')) + '</b>' + seq(d.outR) + '</p>';
      theory = T('放入、取出、排入、離開、查看各算 1 次；兩邊之間搬一個數（和「排到隊尾」）算 2 次。', 'Each push, pop, enqueue, dequeue or look counts 1; moving a number between the two sides (and “To the back”) counts 2.');
    } else if (m === 'ring') {
      const q = state.ring, N = q.N, size = S.ringSize(q), full = S.ringFull(q);
      rd = [[T('陣列格數 N', 'Array cells N'), String(N)], ['front', String(q.front)], ['rear', String(q.rear)],
        [T('個數', 'Size'), size + ' <small>/ ' + S.ringCap(q) + '</small>'],
        [T('狀態', 'State'), S.ringEmpty(q) ? T('空的', 'empty') : full ? T('滿了', 'full') : T('還可以排入', 'room left'), full ? 'bad' : ''],
        [T('下一個要放的數', 'Next number to put in'), String(q.next)], [T('基本操作次數', 'Basic operations'), String(q.ops)]];
      const cells = []; for (let i = 0; i < N; i++) cells.push(q.buf[i] == null ? '·' : String(q.buf[i]));
      strip = '<p><b>Q[0..' + (N - 1) + ']：</b><span class="seq">[ ' + cells.join(', ') + ' ]</span></p>' +
        (q.wrap ? '<p><b>' + T('個數', 'size') + ' = </b><span class="seq">(rear − front + N) mod N = (' + q.rear + ' − ' + q.front + ' + ' + N + ') mod ' + N + ' = ' + size + '</span></p>'
          : '<p><b>' + T('個數', 'size') + ' = </b><span class="seq">rear − front = ' + q.rear + ' − ' + q.front + ' = ' + size + '</span>' + T('（不繞回）', ' (no wrapping)') + '</p>');
      theory = q.wrap ? T('空：front = rear；滿：(rear + 1) mod N = front。永遠留一格空位，最多 N − 1 個。', 'Empty: front = rear; full: (rear + 1) mod N = front. One cell always stays free, so at most N − 1 items.')
        : T('不繞回：rear 到 N 就不能再放（就算前面有空格）——假溢位。最多 N 個。', 'No wrapping: once rear reaches N nothing more fits, even with free cells at the front — false overflow. At most N items.');
    } else {
      const x = state.x[m], res = x.res, N = res.steps.length, sp = x.k ? res.steps[x.k - 1] : null;
      const fin = x.k >= N && N > 0;
      rd = [[T('步數', 'Step'), x.k + ' <small>/ ' + N + '</small>']];
      if (m === 'paren') {
        rd.push([T('括號個數', 'Brackets'), String(res.nBr || 0)], [T('目前深度', 'Current depth'), String(sp ? sp.stack.length : 0)], [T('最深', 'Deepest'), fin || res.ok ? String(res.maxDepth) : '—'],
          [T('已配對', 'Pairs matched'), String(res.steps.slice(0, x.k).filter(function (s) { return s.act === 'match'; }).length)],
          [T('結果', 'Result'), fin ? (res.ok ? T('配對成功', 'all matched') : errShort(res.err.code)) : (!N && res.err ? errShort(res.err.code) : '—'), fin ? (res.ok ? 'ok' : 'bad') : '']);
        const st = sp ? sp.stack.map(function (e) { return e.ch; }) : [];
        strip = '<p><b>' + T('堆疊（底 → 頂）：', 'Stack (bottom → top): ') + '</b><span class="seq">' + (st.length ? esc(st.join(' ')) : '—') + '</span></p>';
        theory = T('只數個數不夠：每一個右括號都要碰上同一種的左括號。', 'Counting is not enough: every closing bracket must meet an opening bracket of the same kind.');
      } else if (m === 'postfix') {
        rd.push([T('數字、運算子', 'Numbers, operators'), (res.nNums || 0) + '、' + (res.nOps || 0)], [T('堆疊大小', 'Stack size'), String(sp ? sp.stack.length : 0)], [T('堆疊最高', 'Highest stack'), fin ? String(res.maxDepth) : '—'],
          [T('來源', 'Source'), x.src === 'convert' ? T('中序轉後序', 'infix to postfix') : x.typed ? T('自己輸入', 'typed') : T('範例', 'example')],
          [T('答案', 'Answer'), fin ? (res.ok ? numStr(res.value) : errShort(res.err.code)) : '—', fin ? (res.ok ? 'ok' : 'bad') : '']);
        strip = '<p><b>' + T('堆疊（底 → 頂）：', 'Stack (bottom → top): ') + '</b>' + seq(sp ? sp.stack : []) + '</p>';
        theory = T('n 個數字的後序式需要 n − 1 個二元運算子；每一步只動堆疊頂端，所以總共只花 O(n) 步。', 'A postfix expression with n numbers needs n − 1 binary operators; each step touches only the top of the stack, so it takes O(n) steps in all.');
      } else {
        const out = sp ? sp.out : [], st = sp ? sp.stack : [];
        rd.push([T('運算子堆疊', 'Operator stack'), String(st.filter(function (t) { return t.t === 'op'; }).length) + ' <small>' + T('個運算子', 'operators') + '</small>'],
          [T('運算子堆疊最高', 'Most operators stacked'), fin && res.ok ? String(res.maxOps) : '—'], [T('括號對數', 'Pairs of brackets'), fin && res.ok ? String(res.parenPairs) : '—'],
          [T('值', 'Value'), fin ? (res.ok ? (res.value != null ? numStr(res.value) : errShort(res.evalErr ? res.evalErr.code : '')) : errShort(res.err.code)) : '—', fin ? (res.ok && res.value != null ? 'ok' : 'bad') : '']);
        strip = '<p><b>' + T('輸出（後序式）：', 'Output (postfix): ') + '</b><span class="seq">' + (out.length ? esc(out.map(tokText).join(' ')) : '—') + '</span></p>' +
          '<p><b>' + T('運算子堆疊（底 → 頂）：', 'Operator stack (bottom → top): ') + '</b><span class="seq">' + (st.length ? esc(st.map(tokText).join(' ')) : '—') + '</span></p>';
        theory = T('每個記號最多進出堆疊一次，所以調度場只要 O(n) 步。', 'Each token enters and leaves the stack at most once, so the shunting yard takes O(n) steps.');
      }
      exprEl.classList.toggle('bad', !!(fin && !res.ok) || (!N && !!res.err && res.err.code !== 'empty'));
      $('toEvalBtn').disabled = !state.x.infix.res.ok;
    }
    setHTML('readout', rows(rd));
    setHTML('strip', strip);
    $('theory').textContent = theory;
    requestDraw();
  }
  function updateButtons() {
    const m = state.mode, d = state.desk, Q = d.rk === 'queue';
    $('deskOps').hidden = m !== 'desk';
    $('ringOps').hidden = m !== 'ring';
    $('runBar').hidden = !isRun(m);
    $('valCard').hidden = !(m === 'desk' || m === 'ring');
    $('deskCard').hidden = m !== 'desk';
    $('ringCard').hidden = m !== 'ring';
    $('exprCard').hidden = !isRun(m);
    $('evalRow').hidden = m !== 'infix';
    $('rowQ').hidden = !Q; $('rowB').hidden = Q;
    $('bToL').hidden = !Q; $('bToR').hidden = !Q; $('bAB').hidden = Q; $('bBA').hidden = Q;
    $('capA').textContent = Q ? T('堆疊', 'Stack') : T('堆疊 A', 'Stack A');
    document.querySelectorAll('.seg2 [data-rk]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.rk === d.rk)); });
    const x = runX();
    if (x) {
      const N = x.res.steps.length;
      $('backBtn').disabled = x.k <= 0;
      $('stepBtn').disabled = !N || (x.k >= N && x.done);
      $('endBtn').disabled = !N || (x.k >= N && x.done);
      $('resetBtn').disabled = x.k <= 0;
      $('playBtn').disabled = !N;
      $('playBtn').setAttribute('aria-pressed', String(state.playing));
      $('playBtn').textContent = state.playing ? T('暫停', 'Pause') : T('播放', 'Play');
    }
  }
  function renderLegend() {
    const m = state.mode;
    const dot = function (c) { return '<span class="dot" style="background:var(' + c + ')"></span>'; };
    const box = function (c) { return '<span class="sq-box" style="background:var(' + c + ')"></span>'; };
    let html;
    if (m === 'desk' && state.desk.rk !== 'queue') html = '<span>' + dot('--sq-top') + T('top：每個堆疊的頂端（唯一的開口）', 'top: the top of each stack (its only opening)') + '</span><span>' + T('從 A 搬到 B：順序整個倒過來', 'moving from A to B turns the order around') + '</span><span>' + T('顏色只是讓數字好認，沒有其他意思', 'colours only make the numbers easy to tell apart') + '</span>';
    else if (m === 'desk') html = '<span>' + dot('--sq-top') + T('top：堆疊頂端（唯一的開口）', 'top: the top of the stack (its only opening)') + '</span><span>' + dot('--sq-front') + T('front：佇列前端（從這裡離開）', 'front: the front of the queue (leaves here)') + '</span><span>' + dot('--sq-rear') + T('rear：佇列尾端（從這裡排入）', 'rear: the back of the queue (joins here)') + '</span><span>' + T('顏色只是讓數字好認，沒有其他意思', 'colours only make the numbers easy to tell apart') + '</span>';
    else if (m === 'ring') html = '<span>' + dot('--sq-front') + T('front：第一個元素的位置', 'front: index of the first item') + '</span><span>' + dot('--sq-rear') + T('rear：下一個空格（虛線框）', 'rear: the next empty cell (dashed)') + '</span><span>' + box('--sq-bad') + T('紅線：不繞回時的盡頭', 'red bar: the end, when not wrapping') + '</span><span>' + T('斜線格：滿的時候留下的那一格空位', 'hatched cell: the one cell left free when full') + '</span>';
    else if (m === 'paren') html = '<span>' + box('--sq-br') + T('小括號 ( )', 'round ( )') + '</span><span>' + box('--sq-num') + T('中括號 [ ]', 'square [ ]') + '</span><span>' + box('--sq-op') + T('大括號 { }', 'curly { }') + '</span><span>' + T('弧線：配成一對；文字下方：堆疊深度（山脈）', 'arcs: matched pairs; under the text: stack depth (the mountain range)') + '</span>';
    else html = '<span>' + box('--sq-num') + T('數字', 'numbers') + '</span><span>' + box('--sq-op') + (m === 'postfix' ? T('運算子、算出來的數', 'operators, computed values') : T('運算子', 'operators')) + '</span>' + (m === 'infix' ? '<span>' + box('--sq-br') + T('括號', 'brackets') + '</span>' : '') + '<span>' + dot('--accent') + T('外框：現在處理的記號', 'outline: the token being handled') + '</span>';
    setHTML('legend', html);
  }

  // ======================= 控制項 =======================
  const modeBtns = Array.prototype.slice.call(document.querySelectorAll('.modes button'));
  function setMode(m) {
    stopPlay();
    state.mode = m;
    modeBtns.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.mode === m)); });
    resetAnim();
    if (isRun(m)) {
      exprEl.value = state.x[m].str;
      fillExamples();
      exprHints();
      describeRun();
    } else if (m === 'desk') say('按「放入（push）」「排入（enqueue）」等按鈕，看看兩邊怎麼變。', 'Press “Push”, “Enqueue” and the other buttons and watch both sides change.');
    else say('按「排入（enqueue）」「離開（dequeue）」，看 front 和 rear 怎麼繞圈。', 'Press “Enqueue” and “Dequeue” and watch front and rear go round.');
    renderLegend();
    updateAll();
  }
  modeBtns.forEach(function (b) { b.addEventListener('click', function () { if (b.dataset.mode !== state.mode) setMode(b.dataset.mode); }); });
  [['bPush', 'push'], ['bPop', 'pop'], ['bTop', 'top'], ['bEnq', 'enq'], ['bDeq', 'deq'], ['bFront', 'front'], ['bRot', 'rot'], ['bPushB', 'pushB'], ['bPopB', 'popB'], ['bTopB', 'topB'],
    ['bToL', 'toL'], ['bToR', 'toR'], ['bAB', 'toR'], ['bBA', 'toL'], ['bClear', 'clear']].forEach(function (p) { $(p[0]).addEventListener('click', function () { doDesk(p[1]); }); });
  [['rEnq', 'enq'], ['rDeq', 'deq'], ['rClear', 'clear']].forEach(function (p) { $(p[0]).addEventListener('click', function () { doRing(p[1]); }); });
  $('stepBtn').addEventListener('click', function () { stopPlay(); advance(1, 'step'); });
  $('backBtn').addEventListener('click', back);
  $('playBtn').addEventListener('click', togglePlay);
  $('endBtn').addEventListener('click', function () { stopPlay(); const x = runX(); if (x) advance(x.res.steps.length, 'end'); });
  $('resetBtn').addEventListener('click', resetRun);
  $('wipeBtn').addEventListener('click', function () {
    state.log = []; state.logN = 0; renderLog();
    if (state.mode === 'desk') doDesk('clear');
    else if (state.mode === 'ring') doRing('clear');
    else resetRun();
    state.log = []; state.logN = 0; renderLog();
    say('已清除操作紀錄與目前的內容；滑桿和輸入的式子不變。', 'The log and the current contents are cleared; the sliders and the typed expression stay.');
  });
  // 滑桿與勾選
  const valEl = $('val'), capEl = $('cap'), nEl = $('ringN'), speedEl = $('speed');
  function syncVal() {
    const v = state.mode === 'ring' ? state.ring.next : state.desk.next;
    state.desk.next = state.ring.next = v;
    setSlider(valEl, v);
    $('valo').textContent = String(v);
  }
  valEl.addEventListener('input', function () {
    const v = Math.max(S.VAL_MIN, Math.min(S.VAL_MAX, Math.round(val(valEl))));
    state.desk.next = state.ring.next = v;
    $('valo').textContent = String(v);
    updateAll();
  });
  $('auto').addEventListener('change', function () { state.desk.auto = state.ring.auto = $('auto').checked; updateAll(); });
  capEl.addEventListener('input', function () {
    const n = Math.round(val(capEl));
    $('capo').textContent = String(n);
    if (n === state.desk.cap) return;
    S.deskSet(state.desk, { cap: n });
    state.ids = { A: [], R: [] };
    say('容量改成 ' + n + '：兩邊都清空了。', 'Capacity set to ' + n + ': both sides are empty now.');
    updateAll();
  });
  document.querySelectorAll('.seg2 [data-rk]').forEach(function (b) {
    b.addEventListener('click', function () {
      const k = b.dataset.rk;
      if (k === state.desk.rk) return;
      S.deskSet(state.desk, { rk: k });
      state.ids = { A: [], R: [] };
      say(k === 'stack' ? '右邊換成第二個堆疊 B：兩邊都清空了。' : '右邊換回佇列：兩邊都清空了。', k === 'stack' ? 'The right side is now a second stack B; both sides are empty.' : 'The right side is a queue again; both sides are empty.');
      updateAll();
    });
  });
  nEl.addEventListener('input', function () {
    const n = Math.round(val(nEl));
    $('ringNo').textContent = String(n);
    if (n === state.ring.N) return;
    rebuildRing();
    say('陣列改成 ' + n + ' 格，清空重來。', 'The array now has ' + n + ' cells and starts empty.');
    updateAll();
  });
  $('wrap').addEventListener('change', function () {
    rebuildRing();
    say($('wrap').checked ? '繞回：rear、front 走到 N − 1 之後回到 0。' : '不繞回：rear 走到 N 就停住，前面空出來的格子用不到。', $('wrap').checked ? 'Wrapping: after N − 1, rear and front go back to 0.' : 'No wrapping: rear stops at N, and cells freed at the front cannot be used.');
    updateAll();
  });
  speedEl.addEventListener('input', function () { state.speed = Math.max(1, Math.round(val(speedEl))); $('speedo').textContent = String(state.speed); });

  // ---------- 鍵盤（LabKeys）：畫布上用方向鍵操作 ----------
  if (window.LabKeys) {
    const runMove = function (dx, dy) { const d = dx || dy; if (!d) return false; if (d > 0) { stopPlay(); advance(1, 'step'); } else back(); return true; };
    window.LabKeys.attach(cv, {
      label: T('堆疊與佇列的畫布。堆疊與佇列：上方向鍵放入、下方向鍵取出；按 Enter 改成操作右邊（佇列或堆疊 B），左右方向鍵在兩邊之間搬一個數。環狀佇列：上排入、下離開。括號、後序式、中序式：右方向鍵單步、左方向鍵上一步。',
        'Stacks and queues canvas. Stacks and queues: up arrow pushes, down arrow pops; press Enter to work on the right side (the queue or stack B), and left and right arrows move a number between the two sides. Circular queue: up enqueues, down dequeues. Brackets, postfix and infix: right arrow steps, left arrow steps back.'),
      items: [
        { name: function () { return state.mode === 'desk' ? (state.desk.rk === 'queue' ? T('堆疊', 'Stack') : T('堆疊 A', 'Stack A')) : state.mode === 'ring' ? T('環狀佇列', 'Circular queue') : T('步驟', 'Steps'); },
          move: function (dx, dy) {
            if (state.mode === 'desk') { if (dy) { doDesk(dy > 0 ? 'push' : 'pop'); return true; } if (dx) { doDesk(dx > 0 ? 'toR' : 'toL'); return true; } return false; }
            if (state.mode === 'ring') { const d = dy || dx; if (!d) return false; doRing(d > 0 ? 'enq' : 'deq'); return true; }
            return runMove(dx, dy);
          },
          describe: function () { return $('status').textContent; } },
        { name: function () { return state.mode === 'desk' ? (state.desk.rk === 'queue' ? T('佇列', 'Queue') : T('堆疊 B', 'Stack B')) : state.mode === 'ring' ? T('環狀佇列', 'Circular queue') : T('步驟', 'Steps'); },
          move: function (dx, dy) {
            const Q = state.desk.rk === 'queue';
            if (state.mode === 'desk') { if (dy) { doDesk(dy > 0 ? (Q ? 'enq' : 'pushB') : (Q ? 'deq' : 'popB')); return true; } if (dx) { doDesk(dx > 0 ? 'toR' : 'toL'); return true; } return false; }
            if (state.mode === 'ring') { const d = dy || dx; if (!d) return false; doRing(d > 0 ? 'enq' : 'deq'); return true; }
            return runMove(dx, dy);
          },
          describe: function () { return $('status').textContent; } }
      ],
      onChange: requestDraw
    });
  }

  // ---------- 測試用介面（Playwright 腳本使用；不影響一般操作） ----------
  window.StackQueueLab = {
    state: state,
    mode: setMode,
    desk: doDesk,
    ring: doRing,
    type: function (s) { exprEl.value = s; exprEl.dispatchEvent(new Event('input')); },
    example: function (i) { exSel.value = String(i); exSel.dispatchEvent(new Event('change')); },
    step: function (n) { for (let i = 0; i < (n || 1); i++) advance(1, 'step'); },
    end: function () { const x = runX(); if (x) advance(x.res.steps.length, 'end'); },
    back: back,
    reset: resetRun,
    toEval: function () { $('toEvalBtn').click(); },
    setVal: function (v) { if (window.LabNum) window.LabNum.set(valEl, v); else { valEl.value = v; valEl.dispatchEvent(new Event('input')); } },
    setCap: function (v) { if (window.LabNum) window.LabNum.set(capEl, v); else { capEl.value = v; capEl.dispatchEvent(new Event('input')); } },
    setN: function (v) { if (window.LabNum) window.LabNum.set(nEl, v); else { nEl.value = v; nEl.dispatchEvent(new Event('input')); } }
  };

  // ======================= 啟動 =======================
  function themeChanged() {
    readColors();
    for (const id in lastHTML) delete lastHTML[id];
    updateSoundButton();
    renderStatus();
    renderLegend();
    renderLog();
    if (isRun(state.mode)) { fillExamples(); exprHints(); }
    updateAll();
  }
  readColors();
  state.speed = Math.max(1, Math.round(val(speedEl))); $('speedo').textContent = String(state.speed);
  state.desk.cap = Math.round(val(capEl)); $('capo').textContent = String(state.desk.cap);
  $('ringNo').textContent = String(state.ring.N);
  setSlider(valEl, 1); $('valo').textContent = '1';
  state.desk.auto = state.ring.auto = $('auto').checked;
  if (!$('wrap').checked || Math.round(val(nEl)) !== state.ring.N) rebuildRing();
  updateSoundButton();
  renderLog();
  setMode('desk');
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  if (window.ResizeObserver) {
    let lastW = 0;
    new ResizeObserver(function () { if (cv.clientWidth !== lastW) { lastW = cv.clientWidth; snap = true; requestDraw(); } }).observe($('stage'));
  } else window.addEventListener('resize', function () { snap = true; requestDraw(); });
  document.addEventListener('visibilitychange', function () { if (document.hidden && state.playing) { stopPlay(); updateButtons(); } });
})();
