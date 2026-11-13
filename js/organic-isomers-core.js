/*
 * organic-isomers-core.js — 「同分異構物」的化學核心（OICore）：不碰 DOM，Node 與瀏覽器共用。
 *
 * 分子：{ atoms: [{ el: 'C'|'O', x, y }], bonds: [{ a, b, o（鍵級 1–3） }], stereo?（抽象的順反描述，列舉用） }
 *   x、y 是平面座標（頁面上三角格子的位置），順反由座標判斷：雙鍵兩端的取代基在鍵軸同一側 = 'Z'（順式）。
 * 主要功能：
 *   analyze(mol)     分子式、不飽和度、標準化表示（判斷是不是同一個分子）、IUPAC 中英文命名、主鏈編號、示性式、
 *                    維納指數、沸點（CRC 數據）、順反資訊
 *   canonical(G, st) 圖同構的標準化字串（精煉＋個別化搜尋，含順反）
 *   enumerate(C, O, H, scope) 列出某分子式在某範圍內的全部異構物（烷類 C4H10 2 種 … C8H18 18 種，OEIS A000602）
 *   layout(S)        把抽象結構擺到三角格子上（遵守 120° 鍵角與順反），任務證明與測試用
 *   embed3D(mol)     球棍模型的 3D 座標（鍵長、鍵角、雙鍵共平面當作彈簧，梯度下降放鬆）
 *   twist(...)       繞鍵旋轉的扭轉能（單鍵：重疊／錯開的取代基對；雙鍵：π 鍵 266 kJ/mol × sin²θ）
 * 簡化：只有碳、氧、氫；不處理 O–O 鍵（過氧化物）、光學異構（鏡像異構）與環上的順反。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OICore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const VAL = { C: 4, O: 2 };
  const ZN = { C: 6, O: 8, H: 1 };
  const S3 = Math.sqrt(3) / 2;
  const MAX_ATOMS = 10;
  const PI_BOND = 266;        // kJ/mol：C=C 611 − C–C 345（OpenStax Chemistry 2e 表 7.2 的平均鍵能）
  const RT298 = 2.48;          // kJ/mol：室溫的熱能尺度 RT

  // ======================= 三角格子 =======================
  // 軸座標 (q, r)：x = q·√3/2、y = r + q/2（y 朝下）。六個方向：30°、90°、150°、210°、270°、330°。
  const DIRS = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];
  function lxy(q, r) { return { x: q * S3, y: r + q / 2 }; }
  function lnear(x, y) { const q = Math.round(x / S3); return { q: q, r: Math.round(y - q / 2) }; }
  function ldir(q1, r1, q2, r2) {
    const dq = q2 - q1, dr = r2 - r1;
    for (let k = 0; k < 6; k++) if (DIRS[k][0] === dq && DIRS[k][1] === dr) return k;
    return -1;
  }
  /** 三色著色：相鄰格點顏色一定不同（3D 起始時用來交錯上下，環己烷會放鬆成椅式） */
  function lcolor(q, r) { return (((q - r) % 3) + 3) % 3; }
  /** 對過 (q1,r1)–(q2,r2) 的直線（沿格子方向）作鏡射，結果一定落在格點上 */
  function lreflect(q, r, q1, r1, q2, r2) {
    const p = lxy(q, r), a = lxy(q1, r1), b = lxy(q2, r2);
    const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
    const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2;
    const fx = a.x + t * dx, fy = a.y + t * dy;
    return lnear(2 * fx - p.x, 2 * fy - p.y);
  }

  // ======================= 圖 =======================
  /** 建立鄰接表；over：鍵結超過價數的原子 */
  function graph(mol) {
    const n = mol.atoms.length;
    const el = mol.atoms.map(function (a) { return a.el; });
    const nb = el.map(function () { return []; });
    const bonds = [];
    mol.bonds.forEach(function (b) {
      nb[b.a].push({ j: b.b, o: b.o });
      nb[b.b].push({ j: b.a, o: b.o });
      bonds.push({ a: b.a, b: b.b, o: b.o });
    });
    const H = [], over = [];
    for (let i = 0; i < n; i++) {
      let s = 0;
      nb[i].forEach(function (e) { s += e.o; });
      H.push(VAL[el[i]] - s);
      if (VAL[el[i]] - s < 0) over.push(i);
    }
    return { n: n, el: el, nb: nb, H: H, bonds: bonds, over: over };
  }
  function order(G, a, b) { const e = G.nb[a].filter(function (x) { return x.j === b; })[0]; return e ? e.o : 0; }
  function connected(G) {
    if (!G.n) return false;
    const seen = [0], vis = { 0: true };
    for (let k = 0; k < seen.length; k++) G.nb[seen[k]].forEach(function (e) { if (!vis[e.j]) { vis[e.j] = true; seen.push(e.j); } });
    return seen.length === G.n;
  }
  /** a、b 之間的鍵在環上嗎（拿掉這個鍵後 a 還走得到 b） */
  function bondInRing(G, a, b) {
    const vis = {}, st = [a];
    vis[a] = true;
    while (st.length) {
      const x = st.pop();
      for (const e of G.nb[x]) {
        if ((x === a && e.j === b) || (x === b && e.j === a)) continue;
        if (e.j === b) return true;
        if (!vis[e.j]) { vis[e.j] = true; st.push(e.j); }
      }
    }
    return false;
  }
  /** 拿掉 a–b 鍵後，b 這一側的所有原子（鍵在環上時傳回 null） */
  function sideOf(G, a, b) {
    const vis = {}, st = [b], out = [b];
    vis[b] = true;
    while (st.length) {
      const x = st.pop();
      for (const e of G.nb[x]) {
        if (x === b && e.j === a) continue;
        if (e.j === a) return null;
        if (!vis[e.j]) { vis[e.j] = true; st.push(e.j); out.push(e.j); }
      }
    }
    return out;
  }
  function ringCount(G) { return G.bonds.length - G.n + 1; }

  // ======================= 順反候選 =======================
  /** 可能有順反的 C=C：不在環上，兩端各有另外兩個取代基（重原子或氫），而且至少一個是重原子 */
  function stereoCands(G) {
    const out = [];
    G.bonds.forEach(function (bd) {
      if (bd.o !== 2 || G.el[bd.a] !== 'C' || G.el[bd.b] !== 'C') return;
      if (bondInRing(G, bd.a, bd.b)) return;
      const ends = [[bd.a, bd.b], [bd.b, bd.a]].map(function (p) {
        const x = p[0], y = p[1];
        const others = G.nb[x].filter(function (e) { return e.j !== y; });
        if (others.some(function (e) { return e.o !== 1; })) return null; // 丙二烯式的累積雙鍵：不算
        if (others.length + G.H[x] !== 2 || !others.length) return null;
        return others.map(function (e) { return e.j; });
      });
      if (ends[0] && ends[1]) out.push({ a: bd.a, b: bd.b, ax: ends[0], bx: ends[1] });
    });
    return out;
  }
  function crossSide(P, a, b, x) {
    const v = (P[b].x - P[a].x) * (P[x].y - P[a].y) - (P[b].y - P[a].y) * (P[x].x - P[a].x);
    return Math.abs(v) < 1e-6 ? 0 : (v > 0 ? 1 : -1);
  }
  /** 由平面座標判斷順反；畫法不明確（雙鍵碳的鍵畫成 180° 或兩個取代基在同一側）時 rel = null */
  function geoStereo(G, P, c) {
    function endSide(x, y, subs) {
      if (subs.length === 1) return crossSide(P, x, y, subs[0]);
      const s1 = crossSide(P, x, y, subs[0]), s2 = crossSide(P, x, y, subs[1]);
      return s1 !== 0 && s1 === -s2 ? s1 : 0;
    }
    const sa = endSide(c.a, c.b, c.ax), sb0 = endSide(c.b, c.a, c.bx);
    // b 端的側邊用同一條 a→b 直線判斷
    const sb = c.bx.length === 1 ? crossSide(P, c.a, c.b, c.bx[0]) : (sb0 ? crossSide(P, c.a, c.b, c.bx[0]) : 0);
    const rel = sa && sb ? (sa === sb ? 'Z' : 'E') : null;
    return { a: c.a, b: c.b, xa: c.ax[0], xb: c.bx[0], rel: rel };
  }

  // ======================= 標準化（圖同構＋順反） =======================
  function cmpArr(x, y) {
    const n = Math.min(x.length, y.length);
    for (let i = 0; i < n; i++) {
      const a = x[i], b = y[i];
      if (Array.isArray(a)) { const c = cmpArr(a, b); if (c) return c; } else if (a !== b) return a < b ? -1 : 1;
    }
    return x.length - y.length;
  }
  function rankBy(keys) {
    const idx = keys.map(function (_, i) { return i; });
    idx.sort(function (i, j) { return cmpArr(keys[i], keys[j]); });
    const r = new Array(keys.length);
    let k = 0;
    for (let t = 0; t < idx.length; t++) {
      if (t && cmpArr(keys[idx[t]], keys[idx[t - 1]])) k++;
      r[idx[t]] = k;
    }
    return r;
  }
  function nClasses(c) { let m = -1; c.forEach(function (x) { if (x > m) m = x; }); return m + 1; }
  function refine(G, c) {
    let k = nClasses(c);
    for (;;) {
      const keys = c.map(function (ci, i) {
        return [ci].concat(G.nb[i].map(function (e) { return e.o * 64 + c[e.j]; }).sort(function (a, b) { return a - b; }));
      });
      const c2 = rankBy(keys), k2 = nClasses(c2);
      c = c2;
      if (k2 === k) return c;
      k = k2;
    }
  }
  /** 標準化字串：所有「最小圖字串」的標號裡，再取最小的順反字串。stereo：[{a,b,xa,xb,rel}] */
  function canonical(G, stereo) {
    const n = G.n;
    if (!n) return '';
    stereo = stereo || [];
    let c0 = rankBy(G.el.map(function (e, i) { return [ZN[e], G.H[i], G.nb[i].length].concat(G.nb[i].map(function (x) { return x.o; }).sort()); }));
    let bestG = null, bestS = null;
    function leaf(c) {
      const inv = new Array(n);
      c.forEach(function (l, i) { inv[l] = i; });
      const edges = G.bonds.map(function (b) { const x = c[b.a], y = c[b.b]; return x < y ? x + '.' + y + '.' + b.o : y + '.' + x + '.' + b.o; }).sort();
      const gs = inv.map(function (i) { return G.el[i] + G.H[i]; }).join('') + '/' + edges.join(' ');
      if (bestG !== null && gs > bestG) return;
      const ss = stereo.map(function (s) {
        const la = c[s.a], lb = c[s.b];
        if (!s.rel) return Math.min(la, lb) + '-' + Math.max(la, lb) + '?';
        let rel = s.rel;
        const ra = minHeavy(s.a, s.b, c), rb = minHeavy(s.b, s.a, c);
        if (ra !== s.xa) rel = rel === 'Z' ? 'E' : 'Z';
        if (rb !== s.xb) rel = rel === 'Z' ? 'E' : 'Z';
        return Math.min(la, lb) + '-' + Math.max(la, lb) + rel;
      }).sort().join(',');
      if (bestG === null || gs < bestG || ss < bestS) { bestG = gs; bestS = ss; }
    }
    function minHeavy(a, b, c) {
      let best = -1, bl = Infinity;
      G.nb[a].forEach(function (e) { if (e.j !== b && c[e.j] < bl) { bl = c[e.j]; best = e.j; } });
      return best;
    }
    function search(c) {
      c = refine(G, c);
      if (nClasses(c) === n) { leaf(c); return; }
      // 第一個有兩個以上成員的類別
      const cnt = {};
      c.forEach(function (x) { cnt[x] = (cnt[x] || 0) + 1; });
      let cell = Infinity;
      Object.keys(cnt).forEach(function (k) { if (cnt[k] > 1 && +k < cell) cell = +k; });
      for (let v = 0; v < n; v++) {
        if (c[v] !== cell) continue;
        search(rankBy(c.map(function (x, i) { return [x * 2 + (i === v ? 0 : 1)]; })));
      }
    }
    search(c0);
    return bestG + (bestS ? '|' + bestS : '');
  }
  /** 只留真正有順反的雙鍵（翻轉後標準化字串不同）；畫法不明確的雙鍵另外回報 */
  function resolveStereo(G, list) {
    let st = list.slice();
    const undef = [];
    for (let k = 0; k < st.length; k++) {
      const s = st[k];
      const z = st.map(function (t, i) { return i === k ? Object.assign({}, t, { rel: 'Z' }) : t; });
      const e = st.map(function (t, i) { return i === k ? Object.assign({}, t, { rel: 'E' }) : t; });
      if (canonical(G, z) === canonical(G, e)) { st.splice(k, 1); k--; }
      else if (!s.rel) undef.push(s);
    }
    return { stereo: st, undef: undef };
  }

  // ======================= 分類 =======================
  function flags(G) {
    const f = { C: 0, O: 0, H: 0, cc2: 0, cc3: 0, co2: 0, oh: 0, ether: 0, oo: 0, rings: ringCount(G) };
    G.el.forEach(function (e, i) { f[e]++; f.H += Math.max(0, G.H[i]); });
    G.bonds.forEach(function (b) {
      const ea = G.el[b.a], eb = G.el[b.b];
      if (ea === 'C' && eb === 'C') { if (b.o === 2) f.cc2++; if (b.o === 3) f.cc3++; }
      if ((ea === 'O') !== (eb === 'O') && b.o === 2) f.co2++;
      if (ea === 'O' && eb === 'O') f.oo++;
    });
    G.el.forEach(function (e, i) {
      if (e !== 'O') return;
      const cn = G.nb[i].filter(function (x) { return G.el[x.j] === 'C' && x.o === 1; }).length;
      if (G.nb[i].length === 1 && cn === 1) f.oh++;
      if (G.nb[i].length === 2 && cn === 2) f.ether++;
    });
    f.dou = (2 * f.C + 2 - f.H) / 2;
    return f;
  }
  const SCOPES = {
    alkane: function (f) { return f.O === 0 && f.rings === 0 && f.cc2 === 0 && f.cc3 === 0; },
    ene: function (f) { return f.O === 0 && f.rings === 0 && f.cc2 === 1 && f.cc3 === 0; },
    hc: function (f) { return f.O === 0; },
    any: function (f) { return f.oo === 0; },
    carbonyl: function (f) { return f.rings === 0 && f.co2 === 1 && f.O === 1 && f.cc2 === 0 && f.cc3 === 0; }
  };
  /** 異構物圖鑑的題目：分子式＋範圍；數目由 enumerate 算出（測試核對已知值） */
  const TARGETS = [
    { id: 'C4H10', C: 4, H: 10, O: 0, scope: 'alkane', zh: '丁烷', en: 'butanes' },
    { id: 'C5H12', C: 5, H: 12, O: 0, scope: 'alkane', zh: '戊烷', en: 'pentanes' },
    { id: 'C6H14', C: 6, H: 14, O: 0, scope: 'alkane', zh: '己烷', en: 'hexanes' },
    { id: 'C7H16', C: 7, H: 16, O: 0, scope: 'alkane', zh: '庚烷', en: 'heptanes' },
    { id: 'C8H18', C: 8, H: 18, O: 0, scope: 'alkane', zh: '辛烷', en: 'octanes' },
    { id: 'C3H6', C: 3, H: 6, O: 0, scope: 'hc', zh: '烯與環烷', en: 'alkene and ring' },
    { id: 'C4H8-ene', C: 4, H: 8, O: 0, scope: 'ene', zh: '烯類，含順反', en: 'alkenes, cis/trans counted' },
    { id: 'C4H8', C: 4, H: 8, O: 0, scope: 'hc', zh: '全部，含環與順反', en: 'all, rings and cis/trans counted' },
    { id: 'C5H10-ene', C: 5, H: 10, O: 0, scope: 'ene', zh: '烯類，含順反', en: 'alkenes, cis/trans counted' },
    { id: 'C2H6O', C: 2, H: 6, O: 1, scope: 'any', zh: '醇與醚', en: 'alcohol and ether' },
    { id: 'C3H8O', C: 3, H: 8, O: 1, scope: 'any', zh: '醇與醚', en: 'alcohols and ether' },
    { id: 'C4H10O', C: 4, H: 10, O: 1, scope: 'any', zh: '醇與醚', en: 'alcohols and ethers' },
    { id: 'C3H6O', C: 3, H: 6, O: 1, scope: 'carbonyl', zh: '醛與酮', en: 'aldehyde and ketone' },
    { id: 'C4H8O', C: 4, H: 8, O: 1, scope: 'carbonyl', zh: '醛與酮', en: 'aldehydes and ketone' }
  ];
  function target(id) { return TARGETS.filter(function (t) { return t.id === id; })[0] || null; }

  // ======================= 命名 =======================
  const ZH_NUM = ['', '甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸', '十一', '十二'];
  const EN_STEM = ['', 'meth', 'eth', 'prop', 'but', 'pent', 'hex', 'hept', 'oct', 'non', 'dec', 'undec', 'dodec'];
  const ZH_MULT = ['', '', '二', '三', '四', '五', '六'];
  const EN_MULT = ['', '', 'di', 'tri', 'tetra', 'penta', 'hexa'];
  const EN_MULT2 = ['', '', 'bis', 'tris', 'tetrakis', 'pentakis', 'hexakis'];

  /** 次序規則（CIP）的簡化比較鍵：一層一層比原子序（多重鍵的另一端重複計算）；中文命名時簡單的取代基先寫 */
  function cipKey(G, r, p) {
    const key = [[ZN[G.el[r]]]];
    let layer = [{ a: r, from: p }];
    for (let d = 0; d < 6 && layer.length; d++) {
      const flat = [], next = [];
      layer.forEach(function (node) {
        const kids = [];
        G.nb[node.a].forEach(function (e) {
          if (e.j === node.from) { for (let m = 1; m < e.o; m++) kids.push({ z: ZN[G.el[e.j]] }); return; }
          kids.push({ z: ZN[G.el[e.j]], a: e.j, from: node.a });
          for (let m = 1; m < e.o; m++) kids.push({ z: ZN[G.el[e.j]] });
        });
        for (let h = 0; h < G.H[node.a]; h++) kids.push({ z: 1 });
        kids.sort(function (x, y) { return y.z - x.z; });
        kids.forEach(function (k) { flat.push(k.z); if (k.a != null) next.push(k); });
      });
      key.push(flat);
      layer = next;
    }
    return key;
  }
  function subtree(G, r, p) {
    const out = [r], vis = {};
    vis[r] = true; vis[p] = true;
    for (let k = 0; k < out.length; k++) G.nb[out[k]].forEach(function (e) { if (!vis[e.j]) { vis[e.j] = true; out.push(e.j); } });
    return out;
  }
  function kidsOf(G, x, from) { return G.nb[x].filter(function (e) { return e.j !== from; }).map(function (e) { return e.j; }); }

  /** 烷基（取代基）名稱；r 接在 p 上。含氧、多重鍵或環的取代基不命名（ok = false） */
  function alkyl(G, r, p) {
    const sub = subtree(G, r, p);
    if (order(G, r, p) !== 1) return { ok: false };
    for (const x of sub) {
      if (G.el[x] !== 'C') return { ok: false };
      for (const e of G.nb[x]) { if (e.o !== 1) return { ok: false }; if (e.j === p && x !== r) return { ok: false }; }
    }
    const n = sub.length, cip = cipKey(G, r, p);
    const straight = sub.every(function (x) { return kidsOf(G, x, x === r ? p : -1).filter(function (j) { return j !== p && sub.indexOf(j) >= 0; }).length <= (x === r ? 1 : 2); });
    // 直鏈：每個原子最多一個「往外」的碳
    function chainLike() {
      let x = r, from = p, cnt = 1;
      for (;;) {
        const k = kidsOf(G, x, from);
        if (k.length > 1) return false;
        if (!k.length) return cnt === n;
        from = x; x = k[0]; cnt++;
      }
    }
    if (straight && chainLike()) return { ok: true, zh: ZH_NUM[n] + '基', en: EN_STEM[n] + 'yl', alpha: EN_STEM[n] + 'yl', cip: cip, simple: ZH_NUM[n], simpleEn: EN_STEM[n] + 'yl' };
    const k = kidsOf(G, r, p);
    const isMe = function (x, from) { return kidsOf(G, x, from).length === 0; };
    if (n === 3 && k.length === 2) return { ok: true, zh: '異丙基', en: 'isopropyl', alpha: 'isopropyl', cip: cip, simple: '異丙', simpleEn: 'isopropyl' };
    if (n === 4 && k.length === 3) return { ok: true, zh: '第三丁基', en: 'tert-butyl', alpha: 'butyl', cip: cip, simple: '第三丁', simpleEn: 'tert-butyl' };
    if (n === 4 && k.length === 2) return { ok: true, zh: '第二丁基', en: 'sec-butyl', alpha: 'butyl', cip: cip, simple: '第二丁', simpleEn: 'sec-butyl' };
    if (n === 4 && k.length === 1 && kidsOf(G, k[0], r).length === 2 && kidsOf(G, k[0], r).every(function (j) { return isMe(j, k[0]); }))
      return { ok: true, zh: '異丁基', en: 'isobutyl', alpha: 'isobutyl', cip: cip, simple: '異丁', simpleEn: 'isobutyl' };
    // 複雜取代基：從 r 出發的最長鏈，r 編號 1
    let best = null;
    sub.forEach(function (t) {
      const path = pathIn(G, r, t, p);
      if (!path) return;
      const S = {};
      path.forEach(function (x) { S[x] = true; });
      const subs = [];
      let bad = false;
      path.forEach(function (x, i) {
        kidsOf(G, x, i === 0 ? p : -1).forEach(function (j) {
          if (S[j] || j === p) return;
          const nm = alkyl(G, j, x);
          if (!nm.ok) bad = true;
          subs.push({ loc: i + 1, nm: nm });
        });
      });
      if (bad) return;
      const cand = { path: path, subs: subs, crit: [path.length, subs.length], locs: subs.map(function (s) { return s.loc; }).sort(function (a, b) { return a - b; }) };
      if (!best || cmpArr(cand.crit, best.crit) > 0 || (!cmpArr(cand.crit, best.crit) && cmpArr(cand.locs, best.locs) < 0)) best = cand;
    });
    if (!best) return { ok: false };
    const pz = prefix(best.subs, 'zh', false), pe = prefix(best.subs, 'en', false);
    const zh = '(' + pz + ZH_NUM[best.path.length] + '基)';
    const en = '(' + pe + EN_STEM[best.path.length] + 'yl)';
    return { ok: true, zh: zh, en: en, alpha: en.replace(/[()\d,\-]/g, ''), cip: cip, complex: true };
  }
  /** 在樹中由 u 走到 v 的路徑（不經過 avoid） */
  function pathIn(G, u, v, avoid, onlyC) {
    const par = {}, q = [u];
    par[u] = -1;
    for (let k = 0; k < q.length; k++) {
      const x = q[k];
      if (x === v) break;
      for (const e of G.nb[x]) {
        if (e.j === avoid || par[e.j] !== undefined) continue;
        if (onlyC && G.el[e.j] !== 'C') continue;
        par[e.j] = x; q.push(e.j);
      }
    }
    if (par[v] === undefined) return null;
    const p = [];
    for (let x = v; x !== -1; x = par[x]) p.unshift(x);
    return p;
  }
  /** 取代基的字首：中文簡單的先寫（次序規則由小到大），英文照字母順序；相同取代基合併成「二甲基」「dimethyl」 */
  function prefix(subs, lang, omitLoc) {
    const groups = {};
    const list = [];
    subs.forEach(function (s) {
      const k = s.nm.en;
      if (!groups[k]) { groups[k] = { nm: s.nm, locs: [] }; list.push(groups[k]); }
      groups[k].locs.push(s.loc);
    });
    if (lang === 'zh') list.sort(function (a, b) { return cmpArr(a.nm.cip, b.nm.cip); });
    else list.sort(function (a, b) { return a.nm.alpha < b.nm.alpha ? -1 : a.nm.alpha > b.nm.alpha ? 1 : 0; });
    const parts = list.map(function (g) {
      g.locs.sort(function (a, b) { return a - b; });
      const m = g.locs.length;
      const mult = m > 1 ? (lang === 'zh' ? ZH_MULT[m] : (g.nm.complex ? EN_MULT2[m] : EN_MULT[m])) : '';
      const nm = lang === 'zh' ? g.nm.zh : g.nm.en;
      return (omitLoc ? '' : g.locs.join(',') + '-') + mult + nm;
    });
    return parts.join('-');
  }
  /** 依引用順序（中文：次序規則；英文：字母）排列的取代基位號，用來比較編號方向 */
  function citeLocs(subs, lang) {
    const s = subs.slice();
    if (lang === 'zh') s.sort(function (a, b) { return cmpArr(a.nm.cip, b.nm.cip) || a.loc - b.loc; });
    else s.sort(function (a, b) { return (a.nm.alpha < b.nm.alpha ? -1 : a.nm.alpha > b.nm.alpha ? 1 : 0) || a.loc - b.loc; });
    return s.map(function (x) { return x.loc; });
  }
  function joinName(pre, parent) {
    if (!pre) return parent;
    return pre + (/^[\d(]/.test(parent) ? '-' : '') + parent;
  }
  function alkoxy(G, O, c) {
    const r = G.nb[O].filter(function (e) { return e.j !== c; })[0].j;
    const nm = alkyl(G, r, O);
    if (!nm.ok) return nm;
    const zh = nm.complex ? nm.zh.replace(/基\)$/, '氧基)') : nm.zh.replace(/基$/, '氧基');
    const EN = { methyl: 'methoxy', ethyl: 'ethoxy', propyl: 'propoxy', butyl: 'butoxy', isopropyl: 'isopropoxy', 'tert-butyl': 'tert-butoxy', 'sec-butyl': 'sec-butoxy', isobutyl: 'isobutoxy' };
    const en = EN[nm.en] || (nm.complex ? nm.en.replace(/yl\)$/, 'oxy)') : nm.en + 'oxy');
    return { ok: true, zh: zh, en: en, alpha: en.replace(/^(sec|tert)-/, '').replace(/[()\d,\-]/g, ''), cip: cipKey(G, O, c), complex: nm.complex, alkyl: nm };
  }
  function oRole(G, i) {
    if (G.el[i] !== 'O') return null;
    const e = G.nb[i];
    if (e.length === 1 && e[0].o === 2) return 'CO';
    if (e.length === 1 && e[0].o === 1) return 'OH';
    if (e.length === 2 && e.every(function (x) { return x.o === 1 && G.el[x.j] === 'C'; })) return 'ether';
    return 'bad';
  }

  /** 命名主程式：傳回 { ok, zh, en, cls, chain（依編號）, loc: {原子: 位號}, cisTrans: [{loc, cis}] } */
  function name(G, stereo, f) {
    f = f || flags(G);
    if (f.oo || G.n > MAX_ATOMS) return { ok: false, cls: 'other' };
    if (f.rings === 1) return nameRing(G, f);
    if (f.rings > 1) return { ok: false, cls: 'other' };
    // 鏈狀：判斷類別
    const roles = G.el.map(function (e, i) { return oRole(G, i); });
    if (roles.indexOf('bad') >= 0) return { ok: false, cls: 'other' };
    const nOH = roles.filter(function (x) { return x === 'OH'; }).length;
    const nCO = roles.filter(function (x) { return x === 'CO'; }).length;
    const nEt = roles.filter(function (x) { return x === 'ether'; }).length;
    let cls;
    if (!f.O) cls = 'hc';
    else if (nOH && !nCO && !nEt && !f.cc2 && !f.cc3) cls = 'alcohol';
    else if (nEt === 1 && !nOH && !nCO && !f.cc2 && !f.cc3) cls = 'ether';
    else if (nCO === 1 && !nOH && !nEt && !f.cc2 && !f.cc3) {
      const oi = roles.indexOf('CO'), c = G.nb[oi][0].j;
      cls = G.nb[c].filter(function (e) { return G.el[e.j] === 'C'; }).length <= 1 ? 'aldehyde' : 'ketone';
    } else return { ok: false, cls: 'other' };
    const Cs = [];
    G.el.forEach(function (e, i) { if (e === 'C') Cs.push(i); });
    const cands = [];
    Cs.forEach(function (u) {
      Cs.forEach(function (v) {
        const P = u === v ? [u] : pathIn(G, u, v, -1, true);
        if (!P) return;
        const ev = evalChain(G, P, roles, cls);
        if (ev) cands.push(ev);
      });
    });
    if (!cands.length) return { ok: false, cls: 'other' };
    const totMult = f.cc2 + f.cc3;
    function pick(lang) {
      const s = cands.slice().sort(function (x, y) {
        return cmpArr(y.crit, x.crit) || cmpArr(x.L1, y.L1) || cmpArr(x.L2, y.L2) || cmpArr(x.L3, y.L3) || cmpArr(x.L4, y.L4) ||
          cmpArr(citeLocs(x.subs, lang), citeLocs(y.subs, lang)) || cmpArr(x.LS, y.LS);
      });
      return s[0];
    }
    const out = { ok: true, cls: cls };
    ['zh', 'en'].forEach(function (lang) {
      const b = pick(lang);
      if (b.mult !== totMult) { out.ok = false; return; }
      const nm = assemble(G, b, cls, lang, stereo);
      if (!nm) { out.ok = false; return; }
      out[lang] = nm.name;
      if (lang === 'zh') { out.chain = b.P; out.cisTrans = nm.ct; out.ctUndef = nm.undef; out.subs = b.subs; out.ev = b; }
    });
    if (!out.ok) return { ok: false, cls: cls === 'hc' ? hcClass(f) : cls };
    out.loc = {};
    out.chain.forEach(function (x, i) { out.loc[x] = i + 1; });
    if (cls === 'hc') out.cls = hcClass(f);
    if (cls === 'ether') {
      const cm = etherCommon(G, roles.indexOf('ether'));
      if (cm) out.common = cm;
    }
    return out;
  }
  function hcClass(f) {
    if (f.cc3 && f.cc2) return 'enyne';
    if (f.cc3) return 'alkyne';
    if (f.cc2 > 1) return 'diene';
    if (f.cc2) return 'alkene';
    return 'alkane';
  }
  function evalChain(G, P, roles, cls) {
    const S = {};
    P.forEach(function (x) { S[x] = true; });
    const subs = [], oh = [], co = [], dbl = [], tpl = [];
    for (let i = 0; i < P.length; i++) {
      const c = P[i], loc = i + 1;
      for (const e of G.nb[c]) {
        const j = e.j;
        if (S[j]) continue;
        if (G.el[j] === 'C') {
          if (e.o !== 1) return null;
          const nm = alkyl(G, j, c);
          if (!nm.ok) return null;
          subs.push({ loc: loc, nm: nm, atom: j });
        } else {
          const r = roles[j];
          if (r === 'OH') oh.push(loc);
          else if (r === 'CO') co.push(loc);
          else if (r === 'ether') {
            if (cls !== 'ether') return null;
            const nm = alkoxy(G, j, c);
            if (!nm.ok) return null;
            subs.push({ loc: loc, nm: nm, atom: j });
          }
        }
      }
      if (i < P.length - 1) {
        const o = order(G, P[i], P[i + 1]);
        if (o === 2) dbl.push(loc);
        if (o === 3) tpl.push(loc);
      }
    }
    if (cls === 'aldehyde' && (co.length !== 1 || co[0] !== 1)) return null;
    if (cls === 'ketone' && (co.length !== 1 || co[0] === 1 || co[0] === P.length)) return null;
    if (cls === 'ether' && !subs.some(function (s) { return s.nm.alkyl; })) return null;
    const princ = cls === 'alcohol' ? oh : co;
    const mult = dbl.concat(tpl).sort(function (a, b) { return a - b; });
    const nO = G.el.filter(function (e) { return e === 'O'; }).length;
    if (cls === 'alcohol' && oh.length !== roles.filter(function (r) { return r === 'OH'; }).length) {
      // 有羥基不在主鏈上：仍列入候選（準則會選到包含全部羥基的主鏈；選不到時不命名）
    }
    const sorted = function (a) { return a.slice().sort(function (x, y) { return x - y; }); };
    return {
      P: P, subs: subs, oh: oh, co: co, dbl: dbl, tpl: tpl, mult: mult.length, nO: nO,
      crit: [princ.length, mult.length, dbl.length, P.length, subs.length],
      L1: sorted(princ), L2: mult, L3: sorted(dbl), L4: sorted(subs.map(function (s) { return s.loc; })), LS: [P[0]]
    };
  }
  /** 主鏈上雙鍵的順反（以主鏈的延伸方向判斷）；ct：[{loc, cis}] */
  function chainCisTrans(G, P, stereo) {
    const ct = [];
    let undef = false;
    (stereo || []).forEach(function (s) {
      for (let i = 0; i < P.length - 1; i++) {
        const x = P[i], y = P[i + 1];
        if (!((x === s.a && y === s.b) || (x === s.b && y === s.a))) continue;
        const nx = i > 0 ? P[i - 1] : null, ny = i + 2 < P.length ? P[i + 2] : null;
        if (!s.rel || nx === null || ny === null) { undef = true; return; }
        let rel = s.rel;
        const na = x === s.a ? nx : ny, nbb = x === s.a ? ny : nx;
        if (na !== s.xa) rel = rel === 'Z' ? 'E' : 'Z';
        if (nbb !== s.xb) rel = rel === 'Z' ? 'E' : 'Z';
        ct.push({ loc: i + 1, cis: rel === 'Z' });
        return;
      }
      undef = true;
    });
    ct.sort(function (a, b) { return a.loc - b.loc; });
    return { ct: ct, undef: undef };
  }
  function ctPrefix(ct, lang) {
    if (!ct.length) return '';
    if (ct.length === 1) return lang === 'zh' ? (ct[0].cis ? '順-' : '反-') : (ct[0].cis ? 'cis-' : 'trans-');
    return '(' + ct.map(function (c) { return lang === 'zh' ? c.loc + (c.cis ? '順' : '反') : c.loc + '-' + (c.cis ? 'cis' : 'trans'); }).join(',') + ')-';
  }
  function assemble(G, b, cls, lang, stereo) {
    const n = b.P.length;
    const zh = lang === 'zh';
    let parent;
    const loc = function (a) { return a.join(','); };
    if (cls === 'hc') {
      const nD = b.dbl.length, nT = b.tpl.length, omit = n <= 3;
      if (!nD && !nT) parent = zh ? ZH_NUM[n] + '烷' : EN_STEM[n] + 'ane';
      else if (zh) {
        if (nD && !nT) parent = (omit ? '' : loc(b.dbl) + '-') + ZH_NUM[n] + ZH_MULT[nD] + '烯';
        else if (nT && !nD) parent = (omit ? '' : loc(b.tpl) + '-') + ZH_NUM[n] + ZH_MULT[nT] + '炔';
        else parent = loc(b.dbl) + '-' + ZH_NUM[n] + ZH_MULT[nD] + '烯-' + loc(b.tpl) + '-' + ZH_MULT[nT] + '炔';
      } else {
        if (nD && !nT) parent = (omit ? '' : loc(b.dbl) + '-') + EN_STEM[n] + (nD > 1 ? 'a' + EN_MULT[nD] + 'ene' : 'ene');
        else if (nT && !nD) parent = (omit ? '' : loc(b.tpl) + '-') + EN_STEM[n] + (nT > 1 ? 'a' + EN_MULT[nT] + 'yne' : 'yne');
        else parent = loc(b.dbl) + '-' + EN_STEM[n] + (nD > 1 ? 'a' + EN_MULT[nD] + 'en' : 'en') + '-' + loc(b.tpl) + '-' + (nT > 1 ? EN_MULT[nT] : '') + 'yne';
      }
    } else if (cls === 'alcohol') {
      const k = b.oh.length, omit = n <= 2 && k === 1;
      const l = b.oh.slice().sort(function (x, y) { return x - y; });
      if (zh) parent = (omit ? '' : loc(l) + '-') + ZH_NUM[n] + (k > 1 ? ZH_MULT[k] : '') + '醇';
      else parent = (omit ? '' : loc(l) + '-') + EN_STEM[n] + (k > 1 ? 'ane' + EN_MULT[k] + 'ol' : 'anol');
    } else if (cls === 'aldehyde') {
      parent = zh ? ZH_NUM[n] + '醛' : EN_STEM[n] + 'anal';
    } else if (cls === 'ketone') {
      parent = zh ? (n === 3 ? '丙酮' : b.co[0] + '-' + ZH_NUM[n] + '酮') : (n === 3 ? 'propanone' : b.co[0] + '-' + EN_STEM[n] + 'anone');
    } else if (cls === 'ether') {
      parent = zh ? ZH_NUM[n] + '烷' : EN_STEM[n] + 'ane';
    }
    const pre = prefix(b.subs, lang, cls === 'ether' && n <= 2);
    const st = chainCisTrans(G, b.P, stereo);
    return { name: ctPrefix(st.ct, lang) + joinName(pre, parent), ct: st.ct, undef: st.undef };
  }
  function etherCommon(G, O) {
    const cs = G.nb[O].map(function (e) { return alkyl(G, e.j, O); });
    if (!cs.every(function (c) { return c.ok && c.simple; })) return null;
    if (cs[0].en === cs[1].en) return { zh: '二' + cs[0].simple + '醚', en: 'di' + cs[0].simpleEn + ' ether' };
    const z = cs.slice().sort(function (a, b) { return cmpArr(a.cip, b.cip); });
    const e = cs.slice().sort(function (a, b) { return a.alpha < b.alpha ? -1 : 1; });
    return { zh: z[0].simple + z[1].simple + '醚', en: e[0].simpleEn + ' ' + e[1].simpleEn + ' ether' };
  }
  function ringAtoms(G) {
    const deg = G.nb.map(function (x) { return x.length; }), gone = {};
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < G.n; i++) if (!gone[i] && deg[i] <= 1) { gone[i] = true; changed = true; G.nb[i].forEach(function (e) { deg[e.j]--; }); }
    }
    const ring = [];
    for (let i = 0; i < G.n; i++) if (!gone[i]) ring.push(i);
    // 依環的順序排
    const ord = [ring[0]], inR = {};
    ring.forEach(function (x) { inR[x] = true; });
    let prev = -1;
    for (;;) {
      const cur = ord[ord.length - 1];
      const nx = G.nb[cur].map(function (e) { return e.j; }).filter(function (j) { return inR[j] && j !== prev && j !== ord[0]; })[0];
      if (nx === undefined || ord.indexOf(nx) >= 0) break;
      prev = cur; ord.push(nx);
    }
    return ord;
  }
  function nameRing(G, f) {
    const R = ringAtoms(G), m = R.length, inR = {};
    R.forEach(function (x) { inR[x] = true; });
    if (R.some(function (x) { return G.el[x] !== 'C'; })) return { ok: false, cls: 'other' };
    // 苯（凱庫勒式）：六元環、單雙鍵交替、沒有其他原子
    if (m === 6 && G.n === 6 && f.cc2 === 3) {
      let alt = true;
      for (let i = 0; i < 6; i++) if (order(G, R[i], R[(i + 1) % 6]) !== (i % 2 ? 1 : 2) && order(G, R[i], R[(i + 1) % 6]) !== (i % 2 ? 2 : 1)) alt = false;
      const o0 = order(G, R[0], R[1]);
      for (let i = 0; i < 6; i++) if (order(G, R[i], R[(i + 1) % 6]) !== (i % 2 ? 3 - o0 : o0)) alt = false;
      if (alt) { const loc = {}; R.forEach(function (x, i) { loc[x] = i + 1; }); return { ok: true, cls: 'aromatic', zh: '苯', en: 'benzene', chain: R, loc: loc, cisTrans: [], subs: [] }; }
      return { ok: false, cls: 'other' };
    }
    if (f.O || f.cc2 || f.cc3) return { ok: false, cls: 'other' };
    const subsAt = [];
    for (let i = 0; i < m; i++) {
      for (const e of G.nb[R[i]]) {
        if (inR[e.j]) continue;
        const nm = alkyl(G, e.j, R[i]);
        if (!nm.ok) return { ok: false, cls: 'cycloalkane' };
        subsAt.push({ idx: i, nm: nm, atom: e.j });
      }
    }
    const opts = [];
    for (let s = 0; s < m; s++) for (const d of [1, -1]) {
      const pos = function (i) { return ((i - s) * d % m + m) % m + 1; };
      const subs = subsAt.map(function (x) { return { loc: pos(x.idx), nm: x.nm, atom: x.atom }; });
      opts.push({ s: s, d: d, subs: subs, L: subs.map(function (x) { return x.loc; }).sort(function (a, b) { return a - b; }) });
    }
    const out = { ok: true, cls: 'cycloalkane', cisTrans: [] };
    ['zh', 'en'].forEach(function (lang) {
      opts.sort(function (x, y) { return cmpArr(x.L, y.L) || cmpArr(citeLocs(x.subs, lang), citeLocs(y.subs, lang)); });
      const b = opts[0];
      const pre = prefix(b.subs, lang, b.subs.length <= 1);
      out[lang] = joinName(pre, lang === 'zh' ? '環' + ZH_NUM[m] + '烷' : 'cyclo' + EN_STEM[m] + 'ane');
      if (lang === 'zh') {
        out.chain = [];
        for (let k = 0; k < m; k++) out.chain.push(R[((b.s + k * b.d) % m + m) % m]);
        out.subs = b.subs;
      }
    });
    out.loc = {};
    out.chain.forEach(function (x, i) { out.loc[x] = i + 1; });
    return out;
  }

  /** 俗名（課本常見的名稱），依英文 IUPAC 名稱查 */
  const COMMON = {
    'butane': ['正丁烷', 'n-butane'], '2-methylpropane': ['異丁烷', 'isobutane'], 'pentane': ['正戊烷', 'n-pentane'],
    '2-methylbutane': ['異戊烷', 'isopentane'], '2,2-dimethylpropane': ['新戊烷', 'neopentane'], 'hexane': ['正己烷', 'n-hexane'],
    'heptane': ['正庚烷', 'n-heptane'], 'octane': ['正辛烷', 'n-octane'],
    '2,2,4-trimethylpentane': ['異辛烷', 'isooctane'], 'ethene': ['乙烯', 'ethylene'], 'propene': ['丙烯', 'propylene'],
    'ethyne': ['乙炔', 'acetylene'], '2-methylpropene': ['異丁烯', 'isobutylene'], '2-methyl-1,3-butadiene': ['異戊二烯', 'isoprene'],
    'propanone': ['丙酮', 'acetone'], 'methanal': ['甲醛', 'formaldehyde'], 'ethanal': ['乙醛', 'acetaldehyde'],
    '2-butanone': ['丁酮', 'methyl ethyl ketone'], '2-propanol': ['異丙醇', 'isopropyl alcohol'],
    '2-methyl-2-propanol': ['第三丁醇', 'tert-butyl alcohol'], '1,2-ethanediol': ['乙二醇', 'ethylene glycol'],
    '1,2,3-propanetriol': ['甘油', 'glycerol']
  };

  // ======================= 沸點（1 atm，°C） =======================
  // 主要取自 CRC Handbook of Chemistry and Physics；逐項以 NIST Chemistry WebBook（Tboil）與維基百科引 CRC 的值核對（11/13）。
  const BP = {
    'methane': -161.5, 'ethane': -88.6, 'propane': -42.1, 'butane': -0.5, '2-methylpropane': -11.7,
    'pentane': 36.1, '2-methylbutane': 27.8, '2,2-dimethylpropane': 9.5,
    'hexane': 68.7, '2-methylpentane': 60.3, '3-methylpentane': 63.3, '2,2-dimethylbutane': 49.7, '2,3-dimethylbutane': 58.0,
    'heptane': 98.4, '2-methylhexane': 90.0, '3-methylhexane': 92.0, '3-ethylpentane': 93.5, '2,2-dimethylpentane': 79.2,
    '2,3-dimethylpentane': 89.8, '2,4-dimethylpentane': 80.5, '3,3-dimethylpentane': 86.1, '2,2,3-trimethylbutane': 80.9,
    'octane': 125.6, '2-methylheptane': 117.6, '3-methylheptane': 118.9, '4-methylheptane': 117.7, '3-ethylhexane': 118.6,
    '2,2-dimethylhexane': 106.8, '2,3-dimethylhexane': 115.6, '2,4-dimethylhexane': 109.4, '2,5-dimethylhexane': 109.1,
    '3,3-dimethylhexane': 112.0, '3,4-dimethylhexane': 117.7, '3-ethyl-2-methylpentane': 115.6, '3-ethyl-3-methylpentane': 118.3,
    '2,2,3-trimethylpentane': 109.8, '2,2,4-trimethylpentane': 99.2, '2,3,3-trimethylpentane': 114.8,
    '2,3,4-trimethylpentane': 113.5, '2,2,3,3-tetramethylbutane': 106.5,
    'ethene': -103.7, 'propene': -47.6, 'cyclopropane': -32.8, '1-butene': -6.3, 'cis-2-butene': 3.7, 'trans-2-butene': 0.9,
    '2-methylpropene': -6.9, 'cyclobutane': 12.6, 'methylcyclopropane': 0.7, '1-pentene': 30.0, 'cis-2-pentene': 36.9,
    'trans-2-pentene': 36.3, '2-methyl-1-butene': 31.2, '3-methyl-1-butene': 20.1, '2-methyl-2-butene': 38.5,
    'cyclopentane': 49.3, 'cyclohexane': 80.7, 'benzene': 80.1, '2-methyl-1,3-butadiene': 34.1, '1,3-butadiene': -4.4,
    'propyne': -23.2, '1-butyne': 8.1, '2-butyne': 27.0,
    'methanol': 64.7, 'ethanol': 78.3, 'methoxymethane': -24.8, '1-propanol': 97.2, '2-propanol': 82.3, 'methoxyethane': 7.4,
    '1-butanol': 117.7, '2-butanol': 99.5, '2-methyl-1-propanol': 107.9, '2-methyl-2-propanol': 82.4, 'ethoxyethane': 34.5,
    '1-methoxypropane': 39.1, '2-methoxypropane': 30.8,
    'methanal': -19.1, 'ethanal': 20.1, 'propanal': 48.0, 'propanone': 56.1, 'butanal': 74.8, '2-methylpropanal': 63.0,
    '2-butanone': 79.6, 'pentanal': 103.0, '2-methylbutanal': 92.0, '3-methylbutanal': 92.5, '2,2-dimethylpropanal': 75.0,
    '2-pentanone': 102.3, '3-pentanone': 101.9, '3-methyl-2-butanone': 94.3
  };
  /** 熔點（只收錄頁面會提到的）：2,2,3,3-四甲基丁烷 100.7 °C（室溫是固體，NIST 三相點 373.97 K） */
  const MP = { '2,2,3,3-tetramethylbutane': 100.7, 'octane': -56.8 };

  // ======================= 維納指數、示性式 =======================
  /** 維納指數：所有重原子兩兩之間的最短距離（鍵數）總和（Wiener 1947 用它預測烷類沸點） */
  function wiener(G) {
    let W = 0;
    for (let s = 0; s < G.n; s++) {
      const d = new Array(G.n).fill(-1), q = [s];
      d[s] = 0;
      for (let k = 0; k < q.length; k++) G.nb[q[k]].forEach(function (e) { if (d[e.j] < 0) { d[e.j] = d[q[k]] + 1; q.push(e.j); } });
      for (let t = s + 1; t < G.n; t++) W += d[t];
    }
    return W;
  }
  /** 示性式（縮寫結構式），例如 CH3CH(CH3)CH2CH3；只做鏈狀分子。數字一律是下標 */
  function condensed(G, nm) {
    if (ringCount(G) !== 0 || G.n === 0) return null;
    if (G.n === 1) return G.el[0] === 'C' ? 'CH4' : 'H2O';
    const roles = G.el.map(function (e, i) { return oRole(G, i); });
    const term = function (i) { return roles[i] === 'OH' || roles[i] === 'CO'; };
    const skel = [];
    for (let i = 0; i < G.n; i++) if (!term(i)) skel.push(i);
    if (skel.length === 1) return lab(skel[0]) + G.nb[skel[0]].filter(function (e) { return roles[e.j] === 'OH'; }).map(function () { return 'OH'; }).join('');
    // 骨架最長路徑；優先和命名主鏈重疊多的
    const loc = nm && nm.loc ? nm.loc : {};
    let best = null;
    skel.forEach(function (u) {
      skel.forEach(function (v) {
        if (u === v) return;
        const P = pathSkel(u, v);
        if (!P) return;
        const ov = P.filter(function (x) { return loc[x]; }).length;
        const key = [P.length, ov, loc[P[0]] ? -loc[P[0]] : -99];
        if (!best || cmpArr(key, best.key) > 0) best = { P: P, key: key };
      });
    });
    let P = best.P;
    const hasTerm = function (i) { return G.nb[i].some(function (e) { return term(e.j); }); };
    if (hasTerm(P[0]) && !hasTerm(P[P.length - 1])) P = P.slice().reverse();
    return seq(P, -1);

    function pathSkel(u, v) {
      const par = {}, q = [u];
      par[u] = -1;
      for (let k = 0; k < q.length; k++) for (const e of G.nb[q[k]]) if (!term(e.j) && par[e.j] === undefined) { par[e.j] = q[k]; q.push(e.j); }
      if (par[v] === undefined) return null;
      const p = [];
      for (let x = v; x !== -1; x = par[x]) p.unshift(x);
      return p;
    }
    function lab(i) {
      if (G.el[i] === 'O') return G.H[i] ? 'OH' : 'O';
      let s = 'C';
      if (G.H[i] > 0) s += 'H' + (G.H[i] > 1 ? G.H[i] : '');
      if (G.nb[i].some(function (e) { return roles[e.j] === 'CO'; })) s += 'O';
      return s;
    }
    function bsym(o) { return o === 2 ? '=' : o === 3 ? '≡' : ''; }
    function deepest(i, from) {
      let best = [i];
      G.nb[i].forEach(function (e) {
        if (e.j === from || term(e.j)) return;
        const p = deepest(e.j, i);
        if (p.length + 1 > best.length) best = [i].concat(p);
      });
      return best;
    }
    function isMethyl(i, from) { return G.el[i] === 'C' && G.H[i] === 3 && G.nb[i].length === 1 && order(G, i, from) === 1; }
    function seq(S, from) {
      let s = '';
      for (let k = 0; k < S.length; k++) {
        const i = S[k], prev = k ? S[k - 1] : from, next = k + 1 < S.length ? S[k + 1] : -2;
        if (k) s += bsym(order(G, prev, i));
        s += lab(i);
        const sides = G.nb[i].filter(function (e) { return e.j !== prev && e.j !== next && roles[e.j] !== 'CO'; });
        let groups = sides.map(function (e) {
          if (roles[e.j] === 'OH') return 'OH';
          return bsym(e.o) + seq(deepest(e.j, i), i);
        });
        // 最後一個是 CH3、而且前一個原子還掛著 CH3：合併成 (CH3)n
        let stop = false;
        if (k === S.length - 2 && isMethyl(S[k + 1], i) && groups.indexOf('CH3') >= 0) { groups.push('CH3'); stop = true; }
        if (next === -2 && groups.length === 1 && groups[0] === 'OH') { s += 'OH'; groups = []; }
        const cnt = {}, ord = [];
        groups.forEach(function (g) { if (!cnt[g]) { cnt[g] = 0; ord.push(g); } cnt[g]++; });
        ord.forEach(function (g) { s += '(' + g + ')' + (cnt[g] > 1 ? cnt[g] : ''); });
        if (stop) break;
      }
      return s;
    }
  }
  function condHTML(t) { return t ? t.replace(/(\d+)/g, '<sub>$1</sub>') : t; }
  function formulaText(f) { return 'C' + (f.C > 1 ? f.C : '') + 'H' + (f.H > 1 ? f.H : f.H === 1 ? '' : '') + (f.O ? 'O' + (f.O > 1 ? f.O : '') : ''); }

  // ======================= 分析（頁面主要呼叫） =======================
  const CLS = {
    alkane: ['烷類', 'alkane'], alkene: ['烯類', 'alkene'], diene: ['烯類（二烯）', 'alkene (diene)'], alkyne: ['炔類', 'alkyne'],
    enyne: ['烯炔', 'enyne'], cycloalkane: ['環烷類', 'cycloalkane'], aromatic: ['芳香烴', 'aromatic hydrocarbon'],
    alcohol: ['醇類', 'alcohol'], ether: ['醚類', 'ether'], aldehyde: ['醛類', 'aldehyde'], ketone: ['酮類', 'ketone'], other: ['其他', 'other']
  };
  /** mol 的原子要有 x、y（或抽象分子提供 mol.stereo） */
  function analyze(mol) {
    const out = { ok: false };
    if (!mol.atoms.length) { out.err = 'empty'; return out; }
    const G = graph(mol);
    out.G = G;
    if (G.over.length) { out.err = 'valence'; out.over = G.over; return out; }
    if (!connected(G)) { out.err = 'split'; return out; }
    if (G.n > MAX_ATOMS) { out.err = 'big'; return out; }
    if (G.el.indexOf('C') < 0) { out.err = 'noC'; return out; }
    const f = flags(G);
    if (f.oo) { out.err = 'oo'; return out; }
    out.f = f;
    out.formula = { C: f.C, H: f.H, O: f.O };
    out.ftext = formulaText(f);
    out.fhtml = condHTML(out.ftext);
    out.dou = f.dou;
    out.rings = f.rings;
    // 順反
    let raw;
    if (mol.stereo) raw = mol.stereo.map(function (s) { return Object.assign({}, s); });
    else {
      const P = mol.atoms.map(function (a) { return { x: a.x, y: a.y }; });
      raw = stereoCands(G).map(function (c) { return geoStereo(G, P, c); });
    }
    const rs = resolveStereo(G, raw);
    out.stereo = rs.stereo;
    out.stereoUndef = rs.undef.length > 0;
    out.key = canonical(G, rs.stereo);
    out.key0 = canonical(G, []);
    const nm = name(G, rs.stereo, f);
    out.name = nm;
    out.cls = nm.cls;
    out.clsName = CLS[nm.cls] || CLS.other;
    out.en = nm.ok && !out.stereoUndef ? nm.en : null;
    out.common = nm.ok ? (COMMON[nm.en] ? { zh: COMMON[nm.en][0], en: COMMON[nm.en][1] } : nm.common || null) : null;
    out.cond = condensed(G, nm);
    out.condHTML = condHTML(out.cond);
    out.W = wiener(G);
    out.bp = out.en != null && BP[out.en] != null ? BP[out.en] : null;
    out.mp = out.en != null && MP[out.en] != null ? MP[out.en] : null;
    // 雙鍵兩端都沒有氫、仍有順反（四取代烯）
    out.tetraStereo = rs.stereo.some(function (s) { return s.rel && G.H[s.a] === 0 && G.H[s.b] === 0; });
    out.ok = true;
    return out;
  }
  /** 這個分子屬於題目範圍嗎 */
  function inTarget(an, t) {
    if (!an || !an.ok || !t) return false;
    return an.formula.C === t.C && an.formula.H === t.H && an.formula.O === t.O && SCOPES[t.scope](an.f);
  }

  // ======================= 列舉異構物 =======================
  function toG(S) { return graph({ atoms: S.el.map(function (e) { return { el: e }; }), bonds: S.e.map(function (b) { return { a: b[0], b: b[1], o: b[2] }; }) }); }
  function addTo(map, S) { const k = canonical(toG(S), []); if (!map.has(k)) map.set(k, S); }
  /** 列出 C 個碳、O 個氧、H 個氫在 scope 範圍內的所有異構物（含順反、不含鏡像異構）。傳回 [{ S, stereo, key }] */
  function enumerate(nC, nO, nH, scope) {
    const dou = (2 * nC + 2 - nH) / 2;
    if (dou < 0 || dou % 1 || nC < 1) return [];
    const N = nC + nO;
    let lev = new Map();
    lev.set('C', { el: ['C'], e: [] });
    for (let s = 1; s < N; s++) {
      const nx = new Map();
      lev.forEach(function (S) {
        const cC = S.el.filter(function (e) { return e === 'C'; }).length, cO = S.el.length - cC;
        const deg = S.el.map(function () { return 0; });
        S.e.forEach(function (b) { deg[b[0]] += b[2]; deg[b[1]] += b[2]; });
        for (let i = 0; i < S.el.length; i++) {
          ['C', 'O'].forEach(function (el) {
            if (el === 'C' && cC >= nC) return;
            if (el === 'O' && (cO >= nO || S.el[i] === 'O')) return;
            if (deg[i] + 1 > VAL[S.el[i]]) return;
            addTo(nx, { el: S.el.concat([el]), e: S.e.concat([[i, S.el.length, 1]]) });
          });
        }
      });
      lev = nx;
    }
    const all = new Map();
    let ringLev = lev;
    for (let r = 0; r <= dou; r++) {
      if (r > 0) {
        const nx = new Map();
        ringLev.forEach(function (S) {
          const deg = S.el.map(function () { return 0; }), adj = {};
          S.e.forEach(function (b) { deg[b[0]] += b[2]; deg[b[1]] += b[2]; adj[b[0] + ',' + b[1]] = adj[b[1] + ',' + b[0]] = true; });
          for (let i = 0; i < S.el.length; i++) for (let j = i + 1; j < S.el.length; j++) {
            if (adj[i + ',' + j] || (S.el[i] === 'O' && S.el[j] === 'O')) continue;
            if (deg[i] + 1 > VAL[S.el[i]] || deg[j] + 1 > VAL[S.el[j]]) continue;
            addTo(nx, { el: S.el, e: S.e.concat([[i, j, 1]]) });
          }
        });
        ringLev = nx;
      }
      // 剩下的不飽和度放到鍵級
      let ol = ringLev;
      for (let u = 0; u < dou - r; u++) {
        const nx = new Map();
        ol.forEach(function (S) {
          const deg = S.el.map(function () { return 0; });
          S.e.forEach(function (b) { deg[b[0]] += b[2]; deg[b[1]] += b[2]; });
          S.e.forEach(function (b, k) {
            const i = b[0], j = b[1];
            const mx = S.el[i] === 'C' && S.el[j] === 'C' ? 3 : 2;
            if (b[2] + 1 > mx || deg[i] + 1 > VAL[S.el[i]] || deg[j] + 1 > VAL[S.el[j]]) return;
            const e = S.e.map(function (x, t) { return t === k ? [x[0], x[1], x[2] + 1] : x; });
            addTo(nx, { el: S.el, e: e });
          });
        });
        ol = nx;
      }
      ol.forEach(function (S, k) { all.set(k, S); });
    }
    // 篩選範圍、展開順反
    const out = new Map();
    all.forEach(function (S) {
      const G = toG(S);
      if (!SCOPES[scope](flags(G))) return;
      const cands = stereoCands(G);
      const m = cands.length;
      for (let mask = 0; mask < (1 << m); mask++) {
        const st = cands.map(function (c, t) { return { a: c.a, b: c.b, xa: c.ax[0], xb: c.bx[0], rel: (mask >> t) & 1 ? 'E' : 'Z' }; });
        const rs = resolveStereo(G, st);
        const key = canonical(G, rs.stereo);
        if (!out.has(key)) out.set(key, { S: S, stereo: rs.stereo, key: key });
      }
    });
    return Array.from(out.values());
  }
  const countCache = {};
  function targetCount(id) {
    if (countCache[id] != null) return countCache[id];
    const t = target(id);
    if (!t) return 0;
    countCache[id] = enumerate(t.C, t.O, t.H, t.scope).length;
    return countCache[id];
  }

  // ======================= 擺到三角格子上 =======================
  /** 抽象結構 S（{el, e}，可附 stereo）→ [{q, r}]；遵守雙鍵 120°、三鍵 180°、順反。找不到時傳回 null */
  function layout(S, stereo) {
    const G = toG(S), n = G.n;
    stereo = stereo || [];
    // 根：最長路徑的一端
    function far(s) {
      const d = new Array(n).fill(-1), q = [s];
      d[s] = 0;
      for (let k = 0; k < q.length; k++) G.nb[q[k]].forEach(function (e) { if (d[e.j] < 0) { d[e.j] = d[q[k]] + 1; q.push(e.j); } });
      let b = s;
      d.forEach(function (x, i) { if (x > d[b]) b = i; });
      return b;
    }
    const root = far(far(0));
    // 深度優先順序；大的子樹先走（主鏈先排成鋸齒）
    const size = new Array(n).fill(0), par = new Array(n).fill(-1), ord = [];
    (function sz(x, p, vis) {
      vis[x] = true; size[x] = 1;
      G.nb[x].forEach(function (e) { if (!vis[e.j]) { sz(e.j, x, vis); size[x] += size[e.j]; } });
    })(root, -1, {});
    (function dfs(x, p, vis) {
      vis[x] = true; ord.push(x); par[x] = p;
      G.nb[x].map(function (e) { return e.j; }).filter(function (j) { return !vis[j]; })
        .sort(function (a, b) { return size[b] - size[a]; })
        .forEach(function (j) { if (!vis[j]) dfs(j, x, vis); });
    })(root, -1, {});
    const hyb = G.el.map(function (e, i) {
      const os = G.nb[i].map(function (x) { return x.o; });
      if (os.indexOf(3) >= 0 || os.filter(function (o) { return o === 2; }).length >= 2) return 1;
      if (os.indexOf(2) >= 0) return 2;
      return 3;
    });
    const inRing = G.el.map(function (_, i) { return G.nb[i].some(function (e) { return bondInRing(G, i, e.j); }); });
    const pos = new Array(n).fill(null), occ = {}, turn = new Array(n).fill(1);
    const keyOf = function (q, r) { return q + ',' + r; };
    function angOk(i) {
      // i 已放好的鄰居方向兩兩之間的夾角
      const ds = [];
      G.nb[i].forEach(function (e) { if (pos[e.j]) ds.push(ldir(pos[i].q, pos[i].r, pos[e.j].q, pos[e.j].r)); });
      for (let a = 0; a < ds.length; a++) for (let b = a + 1; b < ds.length; b++) {
        let d = Math.abs(ds[a] - ds[b]) % 6; d = Math.min(d, 6 - d);
        if (hyb[i] === 1 && d !== 3) return false;
        if (hyb[i] === 2 && d !== 2) return false;
        if (hyb[i] === 3 && d === 1 && !inRing[i] && G.nb[i].length < 4) return false;
        if (d === 0) return false;
      }
      return true;
    }
    function stereoOk() {
      for (const s of stereo) {
        const at = [s.a, s.b, s.xa, s.xb];
        if (at.some(function (x) { return !pos[x]; })) continue;
        const P = pos.map(function (p) { return p ? lxy(p.q, p.r) : null; });
        const sa = crossSide(P, s.a, s.b, s.xa), sb = crossSide(P, s.a, s.b, s.xb);
        if (!sa || !sb) return false;
        if ((sa === sb ? 'Z' : 'E') !== s.rel) return false;
      }
      return true;
    }
    let strict = true;
    function place(k) {
      if (k === ord.length) return true;
      const v = ord[k], p = par[v];
      let dirs;
      if (p < 0) dirs = [0];
      else {
        const pp = par[p];
        let din = pp >= 0 ? ldir(pos[pp].q, pos[pp].r, pos[p].q, pos[p].r) : 5;
        const t = turn[p];
        dirs = [din - t, din + t, din, din + 2, din - 2, din + 3].map(function (d) { return ((d % 6) + 6) % 6; });
        dirs = dirs.filter(function (d, i) { return dirs.indexOf(d) === i; });
        // 第二個以後的分支：優先往上下（離已有的鍵遠）
      }
      for (const d of dirs) {
        const q = p < 0 ? 0 : pos[p].q + DIRS[d][0], r = p < 0 ? 0 : pos[p].r + DIRS[d][1];
        if (occ[keyOf(q, r)] !== undefined) continue;
        pos[v] = { q: q, r: r };
        let ok = true;
        // 已放好的圖鄰居都要相鄰（環的閉合）
        for (const e of G.nb[v]) if (pos[e.j] && ldir(q, r, pos[e.j].q, pos[e.j].r) < 0) { ok = false; break; }
        // 非鍵結的原子不要貼在一起（嚴格模式）
        if (ok && strict) for (let d2 = 0; d2 < 6; d2++) {
          const w = occ[keyOf(q + DIRS[d2][0], r + DIRS[d2][1])];
          if (w !== undefined && !G.nb[v].some(function (e) { return e.j === w; })) { ok = false; break; }
        }
        if (ok) ok = angOk(v) && G.nb[v].every(function (e) { return !pos[e.j] || angOk(e.j); }) && stereoOk();
        if (ok) {
          occ[keyOf(q, r)] = v;
          const pd = p >= 0 && par[p] >= 0 ? ldir(pos[par[p]].q, pos[par[p]].r, pos[p].q, pos[p].r) : 5;
          turn[v] = p >= 0 ? (((d - pd) % 6 + 6) % 6 === 5 ? 1 : -1) : 1;
          if (place(k + 1)) return true;
          delete occ[keyOf(q, r)];
        }
        pos[v] = null;
      }
      return false;
    }
    if (!place(0)) { strict = false; if (!place(0)) return null; }
    return pos;
  }

  // ======================= 3D 座標 =======================
  const BL = { 'C-C1': 1.54, 'C-C2': 1.34, 'C-C3': 1.20, 'C-O1': 1.43, 'C-O2': 1.21, 'C-H': 1.09, 'O-H': 0.96 };
  function blen(e1, e2, o) {
    if (e1 === 'H' || e2 === 'H') return (e1 === 'O' || e2 === 'O') ? BL['O-H'] : BL['C-H'];
    return BL[(e1 === 'O' || e2 === 'O' ? 'C-O' : 'C-C') + o] || 1.5;
  }
  /** 球棍模型的 3D 座標。mol 的原子要有 x、y（格子上的平面位置），可附 z（起始的上下交錯）。
   *  傳回 { atoms: [{ el, x, y, z, heavy（原子編號，氫是 -1）, parent }], bonds: [{ a, b, o }] }（單位 Å） */
  function embed3D(mol) {
    const G = graph(mol), n = G.n;
    const A = [], B = [];
    const sc = 1.45;
    const isSp = G.el.map(function (e, i) { const os = G.nb[i].map(function (x) { return x.o; }); return os.indexOf(3) >= 0 || os.filter(function (o) { return o === 2; }).length >= 2; });
    const nearSp = G.el.map(function (e, i) { return isSp[i] || G.nb[i].some(function (x) { return isSp[x.j]; }); });
    mol.atoms.forEach(function (a, i) { A.push({ el: a.el, x: a.x * sc, y: a.y * sc, z: nearSp[i] ? 0 : (a.z || 0), heavy: i, parent: -1 }); });
    G.bonds.forEach(function (b) { B.push({ a: b.a, b: b.b, o: b.o }); });
    // 加氫：平面上的空位方向；雙鍵碳的氫放在平面內，其他上下錯開
    for (let i = 0; i < n; i++) {
      const h = Math.max(0, G.H[i]);
      if (!h) continue;
      const vs = G.nb[i].map(function (e) { return [A[e.j].x - A[i].x, A[e.j].y - A[i].y]; });
      let ax = 0, ay = 0;
      vs.forEach(function (v) { const L = Math.hypot(v[0], v[1]) || 1; ax -= v[0] / L; ay -= v[1] / L; });
      let L = Math.hypot(ax, ay);
      if (L < 1e-3) { if (vs.length) { ax = -vs[0][1]; ay = vs[0][0]; L = Math.hypot(ax, ay) || 1; } else { ax = 1; ay = 0; L = 1; } }
      ax /= L; ay /= L;
      const sp2 = G.nb[i].some(function (e) { return e.o === 2; });
      for (let k = 0; k < h; k++) {
        let dx, dy, dz;
        if (sp2 && h === 2 && vs.length === 1) { const s = k ? 1 : -1; const c = Math.cos(Math.PI / 3), sn = Math.sin(Math.PI / 3); dx = ax * c - s * ay * sn; dy = ay * c + s * ax * sn; dz = 0; }
        else if (sp2) { dx = ax; dy = ay; dz = 0; }
        else {
          const phi = (k / h) * Math.PI * 2 + (i % 2) * 0.7;
          const tilt = h === 1 ? 0.25 : 0.95;
          dx = ax * Math.cos(tilt) + (-ay) * Math.sin(tilt) * Math.cos(phi);
          dy = ay * Math.cos(tilt) + ax * Math.sin(tilt) * Math.cos(phi);
          dz = Math.sin(tilt) * Math.sin(phi) * 1.0 + (vs.length === 0 ? (k - 1.5) * 0.4 : 0);
          if (vs.length === 0) { const T = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]][k]; dx = T[0]; dy = T[1]; dz = T[2]; }
        }
        const d = blen(G.el[i], 'H') / (Math.hypot(dx, dy, dz) || 1);
        A.push({ el: 'H', x: A[i].x + dx * d, y: A[i].y + dy * d, z: A[i].z + dz * d, heavy: -1, parent: i });
        B.push({ a: i, b: A.length - 1, o: 1 });
      }
    }
    const N = A.length, nbr = A.map(function () { return []; });
    B.forEach(function (b) { nbr[b.a].push({ j: b.b, o: b.o }); nbr[b.b].push({ j: b.a, o: b.o }); });
    // 距離限制：鍵長、鍵角（1-3 距離）、雙鍵共平面（1-4 距離，順反照起始的平面座標）
    const cons = [], pairSet = {};
    const pk = function (i, j) { return i < j ? i + ',' + j : j + ',' + i; };
    function addC(i, j, d, w) { cons.push([i, j, d, w]); pairSet[pk(i, j)] = true; }
    B.forEach(function (b) { addC(b.a, b.b, blen(A[b.a].el, A[b.b].el, b.o), 1); });
    for (let c = 0; c < N; c++) {
      const L = nbr[c];
      if (L.length < 2) continue;
      const tri = L.some(function (e) { return e.o === 3; }) || L.filter(function (e) { return e.o === 2; }).length >= 2;
      const dbl = !tri && L.some(function (e) { return e.o === 2; });
      const ang = tri ? Math.PI : dbl ? (2 * Math.PI / 3) : (A[c].el === 'O' ? 108.5 * Math.PI / 180 : Math.acos(-1 / 3));
      for (let a = 0; a < L.length; a++) for (let b = a + 1; b < L.length; b++) {
        const i = L[a].j, j = L[b].j;
        const di = blen(A[c].el, A[i].el, L[a].o), dj = blen(A[c].el, A[j].el, L[b].o);
        addC(i, j, Math.sqrt(di * di + dj * dj - 2 * di * dj * Math.cos(ang)), tri ? 2.5 : 0.6);
      }
    }
    B.forEach(function (b) {
      if (b.o !== 2) return;
      const sa = nbr[b.a].filter(function (e) { return e.j !== b.b; }).map(function (e) { return e.j; });
      const sb = nbr[b.b].filter(function (e) { return e.j !== b.a; }).map(function (e) { return e.j; });
      const P0 = A.map(function (p) { return { x: p.x, y: p.y }; });
      sa.forEach(function (x) {
        sb.forEach(function (y) {
          const s1 = crossSide(P0, b.a, b.b, x), s2 = crossSide(P0, b.a, b.b, y);
          if (!s1 || !s2) return;
          const dx = blen(A[b.a].el, A[x].el, 1), dy = blen(A[b.b].el, A[y].el, 1), dc = blen(A[b.a].el, A[b.b].el, 2);
          // 平面上：a 在原點、b 在 (dc, 0)，x、y 與鍵軸夾 120°
          const xa = [-dx * 0.5, dx * Math.sqrt(3) / 2 * s1], yb = [dc + dy * 0.5, dy * Math.sqrt(3) / 2 * s2];
          addC(x, y, Math.hypot(xa[0] - yb[0], xa[1] - yb[1]), 1.6);
        });
      });
    });
    // 梯度下降
    const P = A.map(function (a) { return [a.x, a.y, a.z]; });
    const g = P.map(function () { return [0, 0, 0]; });
    for (let it = 0; it < 900; it++) {
      for (let i = 0; i < N; i++) { g[i][0] = g[i][1] = g[i][2] = 0; }
      cons.forEach(function (c) {
        const i = c[0], j = c[1];
        const dx = P[i][0] - P[j][0], dy = P[i][1] - P[j][1], dz = P[i][2] - P[j][2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        const k = c[3] * (d - c[2]) / d;
        g[i][0] += k * dx; g[i][1] += k * dy; g[i][2] += k * dz;
        g[j][0] -= k * dx; g[j][1] -= k * dy; g[j][2] -= k * dz;
      });
      if (it % 2 === 0 || it > 600) {
        for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
          if (pairSet[pk(i, j)]) continue;
          const hi = A[i].el === 'H', hj = A[j].el === 'H';
          const rmin = hi && hj ? 2.3 : hi || hj ? 2.55 : 2.9;
          const dx = P[i][0] - P[j][0], dy = P[i][1] - P[j][1], dz = P[i][2] - P[j][2];
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 >= rmin * rmin) continue;
          const d = Math.sqrt(d2) || 1e-6, k = 0.12 * (d - rmin) / d;
          g[i][0] += k * dx; g[i][1] += k * dy; g[i][2] += k * dz;
          g[j][0] -= k * dx; g[j][1] -= k * dy; g[j][2] -= k * dz;
        }
      }
      const step = it < 300 ? 0.25 : 0.15;
      for (let i = 0; i < N; i++) { P[i][0] -= step * g[i][0]; P[i][1] -= step * g[i][1]; P[i][2] -= step * g[i][2]; }
    }
    A.forEach(function (a, i) { a.x = P[i][0]; a.y = P[i][1]; a.z = P[i][2]; });
    const E = { atoms: A, bonds: B };
    // 單鍵轉到能量最低的構形（錯開式、反式），兩輪
    for (let pass = 0; pass < 2; pass++) {
      B.forEach(function (b) {
        if (b.o === 2 && nbr[b.a].length > 1 && nbr[b.b].length > 1) {
          // 雙鍵兩側拉回同一平面
          const sd = side3D(E, b.a, b.b);
          if (!sd) return;
          const x = nbr[b.a].filter(function (e) { return e.j !== b.b; })[0].j, y = nbr[b.b].filter(function (e) { return e.j !== b.a; })[0].j;
          const d = dihedral(A, x, b.a, b.b, y), tgt = Math.abs(d) < 90 ? 0 : (d > 0 ? 180 : -180);
          let bestQ = null, bestDev = Infinity;
          [tgt - d, d - tgt].forEach(function (rot) {
            const Q = rotateSide(E, b.a, b.b, sd, rot);
            const dev = Math.abs(Math.abs(dihedral(Q, x, b.a, b.b, y)) - Math.abs(tgt));
            if (dev < bestDev) { bestDev = dev; bestQ = Q; }
          });
          A.forEach(function (a, i) { a.x = bestQ[i].x; a.y = bestQ[i].y; a.z = bestQ[i].z; });
          return;
        }
        if (b.o !== 1 || A[b.a].el === 'H' || A[b.b].el === 'H') return;
        if (nbr[b.a].length < 2 || nbr[b.b].length < 2) return;
        const side = side3D(E, b.a, b.b);
        if (!side) return;
        let best = 0, bestE = Infinity;
        for (let d = 0; d < 360; d += 3) {
          const Q = rotateSide(E, b.a, b.b, side, d);
          const e = twistEnergy(E, b.a, b.b, Q, 0, 1).E + clash(Q, side) + d * 1e-6;
          if (e < bestE) { bestE = e; best = d; }
        }
        const Q = rotateSide(E, b.a, b.b, side, best);
        A.forEach(function (a, i) { a.x = Q[i].x; a.y = Q[i].y; a.z = Q[i].z; });
      });
    }
    function clash(Q, side) {
      // 不同側的原子太近時加罰（避免轉到撞在一起）
      const inS = {};
      side.forEach(function (i) { inS[i] = true; });
      let s = 0;
      for (let i = 0; i < N; i++) {
        if (inS[i]) continue;
        for (const j of side) {
          if (pairSet[pk(i, j)]) continue;
          const d = Math.hypot(Q[i].x - Q[j].x, Q[i].y - Q[j].y, Q[i].z - Q[j].z);
          if (d < 2.0) s += (2.0 - d) * 20;
        }
      }
      return s;
    }
    let cx = 0, cy = 0, cz = 0;
    A.forEach(function (a, i) { P[i][0] = a.x; P[i][1] = a.y; P[i][2] = a.z; });
    P.forEach(function (p) { cx += p[0]; cy += p[1]; cz += p[2]; });
    cx /= N; cy /= N; cz /= N;
    A.forEach(function (a, i) { a.x = P[i][0] - cx; a.y = P[i][1] - cy; a.z = P[i][2] - cz; });
    return { atoms: A, bonds: B };
  }
  function vsub(a, b) { return [a.x - b.x, a.y - b.y, a.z - b.z]; }
  function vcross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function vdot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  /** 二面角（度）：i–a–b–j */
  function dihedral(P, i, a, b, j) {
    const b1 = vsub(P[a], P[i]), b2 = vsub(P[b], P[a]), b3 = vsub(P[j], P[b]);
    const n1 = vcross(b1, b2), n2 = vcross(b2, b3);
    const L = Math.sqrt(vdot(b2, b2));
    const m1 = vcross(n1, [b2[0] / L, b2[1] / L, b2[2] / L]);
    return Math.atan2(vdot(m1, n2), vdot(n1, n2)) * 180 / Math.PI;
  }
  /** 3D 分子裡 b 那一側（拿掉 a–b 鍵；在環上時傳回 null） */
  function side3D(E, a, b) {
    const nb = E.atoms.map(function () { return []; });
    E.bonds.forEach(function (x) { nb[x.a].push(x.b); nb[x.b].push(x.a); });
    const vis = {}, st = [b], out = [b];
    vis[b] = true;
    while (st.length) {
      const x = st.pop();
      for (const j of nb[x]) {
        if (x === b && j === a) continue;
        if (j === a) return null;
        if (!vis[j]) { vis[j] = true; st.push(j); out.push(j); }
      }
    }
    return out;
  }
  /** 把 side 上的原子繞 a→b 軸轉 deg 度，傳回新的座標陣列（不改原本的） */
  function rotateSide(E, a, b, side, deg) {
    const P = E.atoms.map(function (p) { return { x: p.x, y: p.y, z: p.z }; });
    const o = P[b], u = vsub(P[b], P[a]);
    const L = Math.sqrt(vdot(u, u));
    const k = [u[0] / L, u[1] / L, u[2] / L], th = deg * Math.PI / 180, c = Math.cos(th), s = Math.sin(th);
    side.forEach(function (i) {
      const v = [P[i].x - o.x, P[i].y - o.y, P[i].z - o.z];
      const kv = vcross(k, v), kd = vdot(k, v);
      P[i] = { x: o.x + v[0] * c + kv[0] * s + k[0] * kd * (1 - c), y: o.y + v[1] * c + kv[1] * s + k[1] * kd * (1 - c), z: o.z + v[2] * c + kv[2] * s + k[2] * kd * (1 - c) };
    });
    return P;
  }
  /** 扭轉能（kJ/mol，相對於最低的錯開式）：
   *  單鍵：每一對前後取代基的重疊代價——H/H 4.0、H/CH3 6.0、CH3/CH3 11（重疊 0° 時），另加兩個碳取代基的偏轉（gauche，60°）3.8；
   *  雙鍵：π 鍵 266 × sin²θ（θ 是離開平面的扭轉角）。 */
  function twistEnergy(E, a, b, P, twistDeg, bondOrder) {
    if (bondOrder === 2) { const t = twistDeg * Math.PI / 180; return PI_BOND * Math.sin(t) * Math.sin(t); }
    if (bondOrder !== 1) return 0;
    const nb = E.atoms.map(function () { return []; });
    E.bonds.forEach(function (x) { nb[x.a].push(x.b); nb[x.b].push(x.a); });
    const sa = nb[a].filter(function (j) { return j !== b; }), sb = nb[b].filter(function (j) { return j !== a; });
    let En = 0, minHH = 999, minAny = 999;
    sa.forEach(function (i) {
      sb.forEach(function (j) {
        const d = Math.abs(dihedral(P, i, a, b, j));
        const hi = E.atoms[i].el === 'H', hj = E.atoms[j].el === 'H';
        const ecl = hi && hj ? 4.0 : hi || hj ? 6.0 : 11.0;
        if (d < 60) En += ecl * Math.pow(Math.cos(1.5 * d * Math.PI / 180), 2);
        if (!hi && !hj && d < 120) En += 3.8 * Math.pow(Math.cos(1.5 * (d - 60) * Math.PI / 180), 2) * (d >= 60 ? 1 : 0);
        if (hi && hj) minHH = Math.min(minHH, d);
        minAny = Math.min(minAny, d);
      });
    });
    return { E: En, minHH: minHH, minAny: minAny };
  }

  return {
    VAL: VAL, MAX_ATOMS: MAX_ATOMS, PI_BOND: PI_BOND, RT298: RT298, DIRS: DIRS, TARGETS: TARGETS, BP: BP, MP: MP, COMMON: COMMON, CLS: CLS,
    lxy: lxy, lnear: lnear, ldir: ldir, lcolor: lcolor, lreflect: lreflect,
    graph: graph, connected: connected, bondInRing: bondInRing, sideOf: sideOf, flags: flags, stereoCands: stereoCands,
    canonical: canonical, resolveStereo: resolveStereo, name: name, analyze: analyze, inTarget: inTarget, target: target,
    enumerate: enumerate, targetCount: targetCount, toG: toG, layout: layout, wiener: wiener, condensed: condensed, condHTML: condHTML,
    embed3D: embed3D, dihedral: dihedral, side3D: side3D, rotateSide: rotateSide, twistEnergy: twistEnergy
  };
});
