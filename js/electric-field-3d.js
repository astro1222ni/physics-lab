/*
 * electric-field-3d.js — 「電場與等位線」的 3D 立體檢視（等位面＋立體電力線）
 *
 * 這個檔案本身不依賴 three.js：使用者按「3D 立體」時，electric-field.js 才以 import() 載入
 * vendor/three/，再呼叫 ElectricField3D.create(lib, env) 建立場景；切回 2D 時 dispose() 釋放全部資源。
 *
 * 物理（與 2D 完全相同的核心）：
 *   點電荷都在 z = 0 平面上。單一點電荷的電位 V(r)、電場 E(r) 只與距離 r 有關，
 *   所以直接呼叫 field-core.js（2D 用的同一組函式）在「距離電荷 r 的點」求值，
 *   再依疊加原理在三維空間相加：
 *     V(x, y, z) = Σ k q_i / r_i，  E = Σ k q_i r̂_i / r_i²，  r_i = √((x − x_i)² + (y − y_i)² + z²)
 *   因此 2D 畫面上的等位線，正好是 3D 等位面在 z = 0 的截面。
 *   z ↔ −z 對稱：只計算上半空間，下半空間用鏡像（scale.z = −1）畫出。
 *
 * 等位面：在 3D 格點上算電位，以 surface nets（marching cubes 的對偶做法）找出等值面，
 *   每個頂點再用牛頓法移到 V = 等級值 的曲面上；法向量 = 電場方向（E = −∇V），所以電力線與等位面垂直。
 * 電力線：在電荷周圍的小球面上以 Fibonacci 螺旋均勻取起點（每 nC 固定條數），以 RK4 沿電場描線。
 *
 * 場景座標（cm）：sx = x − W/2、sy = y − H/2、sz = z；z 軸垂直於 2D 平面、朝上。
 */
(function () {
  'use strict';
  const FC = window.FieldCore;
  const CM = FC ? FC.CM : 0.01;

  // =====================================================================
  // 三維物理：每個電荷單獨的 V(r)、E(r) 由 field-core.js 求出，再疊加
  // =====================================================================
  /** 只取帶電的電荷；one 是只含這個電荷的陣列（傳給 field-core.js） */
  function sources(charges) {
    return charges.filter(function (c) { return c.q !== 0; }).map(function (c) {
      return { x: c.x, y: c.y, q: c.q, one: [{ x: c.x, y: c.y, q: c.q }] };
    });
  }
  /** V(x, y, z)（V）：單一電荷在距離 r 處的電位 = field-core.js 在平面上距離 r 處的值 */
  function pot3(src, x, y, z) {
    let v = 0;
    for (let i = 0; i < src.length; i++) {
      const s = src[i], dx = x - s.x, dy = y - s.y;
      const r = Math.sqrt(dx * dx + dy * dy + z * z);
      v += FC.potentialAt(s.one, s.x + r, s.y);
    }
    return v;
  }
  /** E(x, y, z)（N/C）寫入 out：每個電荷的徑向分量（field-core.js）乘上單位向量 r̂ */
  function field3(src, x, y, z, out) {
    let ex = 0, ey = 0, ez = 0;
    for (let i = 0; i < src.length; i++) {
      const s = src[i], dx = x - s.x, dy = y - s.y;
      const r = Math.sqrt(dx * dx + dy * dy + z * z);
      if (r === 0) { out[0] = out[1] = out[2] = NaN; return out; }
      const er = FC.fieldAt(s.one, s.x + r, s.y).ex; // 徑向分量，正值指離電荷
      ex += er * dx / r; ey += er * dy / r; ez += er * z / r;
    }
    out[0] = ex; out[1] = ey; out[2] = ez;
    return out;
  }

  // =====================================================================
  // 等位面：surface nets ＋ 牛頓法把頂點移到曲面上
  // =====================================================================
  // 格子的 8 個角（第 0、1、2 位元 = x、y、z 方向）與 12 條邊
  const EDGES = (function () {
    const e = [];
    for (let a = 0; a < 8; a++) for (let d = 1; d < 8; d <<= 1) if (!(a & d)) e.push(a, a | d);
    return e;
  })();

  /**
   * 上半空間的格點電位：x ∈ [0, W]、y ∈ [0, H]、z ∈ [−hz, Z]
   * （多一層 z = −hz，與 z = +hz 相同，讓曲面跨過 z = 0，再由 GPU 在 z = 0 精確切齊）
   */
  function sampleGrid(src, W, H, Z, h) {
    const nx = Math.max(4, Math.round(W / h)), ny = Math.max(4, Math.round(H / h)), nzU = Math.max(3, Math.round(Z / h));
    const hx = W / nx, hy = H / ny, hz = Z / nzU;
    const nz = nzU + 1;                    // z 方向的格子數
    const sx = nx + 1, sxy = sx * (ny + 1);
    const v = new Float32Array(sxy * (nz + 1));
    for (let k = 1; k <= nz; k++) {
      const z = (k - 1) * hz;
      for (let j = 0; j <= ny; j++) {
        const y = j * hy;
        let o = k * sxy + j * sx;
        for (let i = 0; i <= nx; i++) {
          let val = pot3(src, i * hx, y, z);
          // 格點剛好落在電荷上（±∞）時截斷，避免內插出現 NaN
          if (!(val > -1e7)) val = -1e7; else if (!(val < 1e7)) val = 1e7;
          v[o++] = val;
        }
      }
    }
    v.copyWithin(0, 2 * sxy, 3 * sxy); // z = −hz 的電位等於 z = +hz
    return { nx: nx, ny: ny, nz: nz, hx: hx, hy: hy, hz: hz, sx: sx, sxy: sxy, v: v, z0: -hz };
  }

  /** 牛頓法：沿 ∇V 把 p 移到 V = L 上（每步最多 lim cm），回傳相對誤差 */
  function project(src, p, L, lim, tmp) {
    let rel = Infinity;
    for (let it = 0; it < 8; it++) {
      const V = pot3(src, p[0], p[1], p[2]);
      if (!isFinite(V)) break;
      const r = V - L;
      rel = Math.abs(r) / Math.max(Math.abs(L), 50);
      if (rel < 2e-6) break;
      field3(src, p[0], p[1], p[2], tmp);
      // ∇V（V/cm）= −E（V/m）× 0.01 m/cm
      const gx = -tmp[0] * CM, gy = -tmp[1] * CM, gz = -tmp[2] * CM;
      const g2 = gx * gx + gy * gy + gz * gz;
      if (!(g2 > 1e-12) || !isFinite(g2)) break;
      const s = -r / g2;
      let dx = s * gx, dy = s * gy, dz = s * gz;
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (len > lim) { const f = lim / len; dx *= f; dy *= f; dz *= f; }
      p[0] += dx; p[1] += dy; p[2] += dz;
    }
    return rel;
  }

  /**
   * 每個等級一個網格：pos（場景座標）、nor（單位法向量，指向遠離所包圍電荷的一側）、index。
   * 只保留露出電荷小球（半徑 ballR）的曲面。
   */
  function isoSurfaces(src, g, levels, W, H, ballR) {
    const nx = g.nx, ny = g.ny, nz = g.nz, hx = g.hx, hy = g.hy, hz = g.hz, sx = g.sx, sxy = g.sxy, v = g.v, z0 = g.z0;
    const lv = levels.slice().sort(function (a, b) { return a - b; });
    const nl = lv.length;
    const lists = [];
    for (let n = 0; n < nl; n++) lists.push([]);
    const off = [0, 1, sx, sx + 1, sxy, sxy + 1, sxy + sx, sxy + sx + 1];
    // 1) 每個格子跨過哪些等級（L 被跨過 ⟺ 最小值 ≤ L < 最大值）
    for (let k = 0; k < nz; k++) {
      for (let j = 0; j < ny; j++) {
        let base = k * sxy + j * sx, cell = (k * ny + j) * nx;
        for (let i = 0; i < nx; i++, base++, cell++) {
          let mn = v[base], mx = mn;
          for (let q = 1; q < 8; q++) { const t = v[base + off[q]]; if (t < mn) mn = t; else if (t > mx) mx = t; }
          if (mx <= lv[0] || mn > lv[nl - 1]) continue;
          let a = 0, b = nl;
          while (a < b) { const m = (a + b) >> 1; if (lv[m] < mn) a = m + 1; else b = m; }
          for (let n = a; n < nl && lv[n] < mx; n++) lists[n].push(cell);
        }
      }
    }
    const nCells = nx * ny * nz;
    const vid = new Int32Array(nCells);
    const stamp = new Int16Array(nCells).fill(-1);
    const c = new Float64Array(8), p = [0, 0, 0], tmp = [0, 0, 0];
    const lim = 0.5 * Math.min(hx, hy, hz);
    const cellOff = [1, nx, nx * ny], nodeOff = [1, sx, sxy];
    const out = [];
    for (let n = 0; n < nl; n++) {
      const L = lv[n], cells = lists[n], m = cells.length;
      if (!m) continue;
      const pos = new Float32Array(m * 3), nor = new Float32Array(m * 3);
      const sg = L >= 0 ? 1 : -1;
      let maxRes = 0, far = 0, open = false;
      // 2) 每個被跨過的格子一個頂點：12 條邊上交點的平均，再用牛頓法移到曲面上
      for (let t = 0; t < m; t++) {
        const cell = cells[t];
        const i = cell % nx, j = ((cell / nx) | 0) % ny, k = (cell / (nx * ny)) | 0;
        const base = k * sxy + j * sx + i;
        for (let q = 0; q < 8; q++) c[q] = v[base + off[q]];
        let ax = 0, ay = 0, az = 0, cnt = 0;
        for (let e = 0; e < 24; e += 2) {
          const a0 = EDGES[e], a1 = EDGES[e + 1], va = c[a0], vb = c[a1];
          if ((va > L) === (vb > L)) continue;
          const f = (L - va) / (vb - va);
          const bx0 = a0 & 1, by0 = (a0 >> 1) & 1, bz0 = (a0 >> 2) & 1;
          ax += bx0 + ((a1 & 1) - bx0) * f;
          ay += by0 + (((a1 >> 1) & 1) - by0) * f;
          az += bz0 + (((a1 >> 2) & 1) - bz0) * f;
          cnt++;
        }
        p[0] = (i + ax / cnt) * hx; p[1] = (j + ay / cnt) * hy; p[2] = z0 + (k + az / cnt) * hz;
        const res = project(src, p, L, lim, tmp);
        if (res > maxRes && isFinite(res)) maxRes = res;
        // 法向量：L > 0 時沿 E（向外），L < 0 時沿 −E（向外）；L = 0 取 E 的方向
        field3(src, p[0], p[1], p[2], tmp);
        const em = Math.sqrt(tmp[0] * tmp[0] + tmp[1] * tmp[1] + tmp[2] * tmp[2]);
        const o = 3 * t;
        if (em > 0 && isFinite(em)) { nor[o] = sg * tmp[0] / em; nor[o + 1] = sg * tmp[1] / em; nor[o + 2] = sg * tmp[2] / em; }
        else { nor[o + 2] = 1; }
        pos[o] = p[0] - W / 2; pos[o + 1] = p[1] - H / 2; pos[o + 2] = p[2];
        let dmin = Infinity;
        for (let s = 0; s < src.length; s++) dmin = Math.min(dmin, Math.hypot(p[0] - src[s].x, p[1] - src[s].y, p[2]));
        if (dmin > far) far = dmin;
        // 曲面碰到區域邊界（被切開）？
        if (i === 0 || j === 0 || i === nx - 1 || j === ny - 1 || k === nz - 1) open = true;
        vid[cell] = t; stamp[cell] = n;
      }
      if (far < ballR) continue; // 整個曲面都藏在電荷小球裡
      // 3) 每條被跨過的內部格線，連接共用它的 4 個格子的頂點（兩個三角形）
      const idx = [];
      const coord = [0, 0, 0];
      for (let t = 0; t < m; t++) {
        const cell = cells[t];
        coord[0] = cell % nx; coord[1] = ((cell / nx) | 0) % ny; coord[2] = (cell / (nx * ny)) | 0;
        const base = coord[2] * sxy + coord[1] * sx + coord[0];
        const in0 = v[base] > L;
        for (let d = 0; d < 3; d++) {
          if ((v[base + nodeOff[d]] > L) === in0) continue;
          const u = (d + 1) % 3, w = (d + 2) % 3;
          if (coord[u] === 0 || coord[w] === 0) continue;
          const cu = cell - cellOff[u], cw = cell - cellOff[w], cuw = cu - cellOff[w];
          if (stamp[cu] !== n || stamp[cw] !== n || stamp[cuw] !== n) continue;
          const A = t, B = vid[cu], C = vid[cuw], D = vid[cw];
          // 用頂點法向量決定繞向（正面朝外）
          const e1x = pos[3 * B] - pos[3 * A], e1y = pos[3 * B + 1] - pos[3 * A + 1], e1z = pos[3 * B + 2] - pos[3 * A + 2];
          const e2x = pos[3 * C] - pos[3 * A], e2y = pos[3 * C + 1] - pos[3 * A + 1], e2z = pos[3 * C + 2] - pos[3 * A + 2];
          const gx = e1y * e2z - e1z * e2y, gy = e1z * e2x - e1x * e2z, gz = e1x * e2y - e1y * e2x;
          const sx_ = nor[3 * A] + nor[3 * B] + nor[3 * C] + nor[3 * D];
          const sy_ = nor[3 * A + 1] + nor[3 * B + 1] + nor[3 * C + 1] + nor[3 * D + 1];
          const sz_ = nor[3 * A + 2] + nor[3 * B + 2] + nor[3 * C + 2] + nor[3 * D + 2];
          if (gx * sx_ + gy * sy_ + gz * sz_ >= 0) idx.push(A, B, C, A, C, D);
          else idx.push(A, C, B, A, D, C);
        }
      }
      if (!idx.length) continue;
      out.push({ level: L, pos: pos, nor: nor, index: m > 65535 ? new Uint32Array(idx) : new Uint16Array(idx), maxRes: maxRes, verts: m, tris: idx.length / 3, open: open });
    }
    return out;
  }

  // =====================================================================
  // 立體電力線
  // =====================================================================
  const GOLDEN = Math.PI * (3 - Math.sqrt(5));
  /**
   * 與 field-core.js 的 fieldLines 相同的規則：從總電量絕對值較大的那一種符號的電荷出發，
   * 每 nC 固定條數（3D 中線的密度正比於 |E|，就是高斯定律）。
   * 起點在半徑 r0 的小球面上以 Fibonacci 螺旋均勻分布；只描上半空間（z > 0），下半空間是鏡像。
   */
  function fieldLines3(src, opts) {
    const perNC = opts.perNC, r0 = opts.r0, h = opts.step, maxSteps = opts.maxSteps, B = opts.bounds, stopR = opts.stopR;
    let pos = 0, neg = 0;
    src.forEach(function (c) { if (c.q > 0) pos += c.q; else neg -= c.q; });
    const sign = pos >= neg ? 1 : -1;
    const lines = [];
    const e = [0, 0, 0];
    function unit(x, y, z, k) {
      field3(src, x, y, z, e);
      const m = Math.sqrt(e[0] * e[0] + e[1] * e[1] + e[2] * e[2]);
      if (!(m > 0) || !isFinite(m)) return false;
      k[0] = sign * e[0] / m; k[1] = sign * e[1] / m; k[2] = sign * e[2] / m;
      return true;
    }
    const k1 = [0, 0, 0], k2 = [0, 0, 0], k3 = [0, 0, 0], k4 = [0, 0, 0];
    src.forEach(function (c) {
      if (Math.sign(c.q) !== sign) return;
      const nU = Math.max(4, Math.round(perNC * Math.abs(c.q) / 2)); // 上半球的條數（全部 = 2nU）
      for (let s = 0; s < nU; s++) {
        const cz = (s + 0.5) / nU, rr = Math.sqrt(1 - cz * cz), ph = s * GOLDEN + 0.4;
        let x = c.x + r0 * rr * Math.cos(ph), y = c.y + r0 * rr * Math.sin(ph), z = r0 * cz;
        const pts = [x, y, z];
        let end = -1;
        for (let n = 0; n < maxSteps; n++) {
          if (!unit(x, y, z, k1)) break;
          if (!unit(x + h / 2 * k1[0], y + h / 2 * k1[1], z + h / 2 * k1[2], k2)) break;
          if (!unit(x + h / 2 * k2[0], y + h / 2 * k2[1], z + h / 2 * k2[2], k3)) break;
          if (!unit(x + h * k3[0], y + h * k3[1], z + h * k3[2], k4)) break;
          x += h / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
          y += h / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
          z += h / 6 * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
          if (z < 0) z = 0; // 對稱面上 E_z = 0，電力線不會穿過 z = 0（數值誤差保護）
          pts.push(x, y, z);
          if (x < B.x0 || x > B.x1 || y < B.y0 || y > B.y1 || z > B.z1) break;
          if (n > 2) {
            let hit = -1;
            for (let i = 0; i < src.length; i++) {
              const d = Math.sqrt((x - src[i].x) * (x - src[i].x) + (y - src[i].y) * (y - src[i].y) + z * z);
              if (d < stopR) { hit = i; break; }
            }
            if (hit >= 0) { pts.push(src[hit].x, src[hit].y, 0); end = hit; break; }
          }
        }
        lines.push({ pts: pts, dir: sign, end: end });
      }
    });
    return lines;
  }

  // =====================================================================
  // 顏色：OKLab 內插（與 2D 色階相同的做法，亮度單調）
  // =====================================================================
  function s2l(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function l2s(c) { c = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; return Math.round(Math.max(0, Math.min(1, c)) * 255); }
  function toLab(c) {
    const r = s2l(c[0]), g = s2l(c[1]), b = s2l(c[2]);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
  }
  function fromLab(L, A, B) {
    const l = Math.pow(L + 0.3963377774 * A + 0.2158037573 * B, 3);
    const m = Math.pow(L - 0.1055613458 * A - 0.0638541728 * B, 3);
    const s = Math.pow(L - 0.0894841775 * A - 1.2914855480 * B, 3);
    return [l2s(4.0767416621 * l - 3.3077085835 * m + 0.2309667191 * s),
      l2s(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
      l2s(-0.0041960771 * l - 0.7034186147 * m + 1.7076147010 * s)];
  }
  function mixLab(a, b, t) {
    const A = toLab(a), B = toLab(b);
    return fromLab(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
  }
  function hex(c) { return '#' + c.slice(0, 3).map(function (v) { return ('0' + Math.round(v).toString(16)).slice(-2); }).join(''); }
  function rgbaStr(c, a) { return 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + a + ')'; }

  // =====================================================================
  // 場景
  // =====================================================================
  function create(lib, env) {
    const THREE = lib.THREE;
    const W = env.W, H = env.H, Z = env.Z || 4;   // 3D 區域：x ∈ [0, W]、y ∈ [0, H]、z ∈ [−Z, Z]（cm）
    const T = env.T, state = env.state;
    const BALL_R = 0.26;                          // 電荷小球半徑（示意大小，cm）
    const host = env.host;
    const reduced = function () { return !!(env.reducedMotion && env.reducedMotion()); };

    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', T('電場的 3D 立體檢視：等位面與電力線（可拖曳旋轉、縮放）',
      '3D view of the electric field: equipotential surfaces and field lines (drag to rotate, pinch or scroll to zoom)'));
    host.appendChild(canvas);
    const layer = document.createElement('div');
    layer.className = 'ef3-labels';
    layer.setAttribute('aria-hidden', 'true');
    host.appendChild(layer);
    let renderer;
    try {
      // alpha：背景由 CSS 的徑向漸層提供（隨深淺色自動變化）
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    } catch (e) {
      canvas.remove(); layer.remove();
      throw e;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap; // 搭配 shadow.radius 做柔和的影子
    renderer.localClippingEnabled = true;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 4 / 3, 0.1, 500);
    camera.up.set(0, 0, 1); // z（垂直於 2D 平面）朝上；必須在建立 OrbitControls 之前設定
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.rotateSpeed = 0.9;
    controls.minDistance = 3;
    controls.maxDistance = 90;

    // ---- 燈光：半球光＋一盞由上方照下、會投影的方向光；另一盞微弱的補光讓曲面邊緣有光澤 ----
    const hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 1.5);
    hemi.position.set(0, 0, 1);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 2.1);
    sun.position.set(-5, -7, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.radius = 4;
    sun.shadow.bias = -0.0004;
    const sc = sun.shadow.camera;
    sc.left = -W / 2 - 3; sc.right = W / 2 + 3; sc.bottom = -H / 2 - 3; sc.top = H / 2 + 3;
    sc.near = 5; sc.far = 60;
    scene.add(sun);
    scene.add(sun.target);
    const fill = new THREE.DirectionalLight(0xffffff, 0.55);
    fill.position.set(8, 6, -4);
    scene.add(fill);
    // 接收影子的薄層：疊在 z = 0 平面上，只畫影子。上半空間的電力線、電荷與試探電荷的影子落在平面上，
    // 影子和線之間的距離看得出線離平面多高（光由上方照下）；從平面下方看不到這一層
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.ShadowMaterial({ opacity: 0.2, depthWrite: false }));
    floor.position.z = 0.003;
    floor.receiveShadow = true;
    scene.add(floor);

    // 上半空間與下半空間（鏡像）
    const upper = new THREE.Group(), lower = new THREE.Group();
    lower.scale.set(1, 1, -1);
    scene.add(upper, lower);
    const clipUp = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);    // 保留 z ≥ 0
    const clipDown = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0); // 保留 z ≤ 0

    let colors = env.colors(), rgb = env.rgb();
    const col = function (k) { const c = rgb[k] || [128, 128, 128]; return new THREE.Color().setRGB(c[0] / 255, c[1] / 255, c[2] / 255, THREE.SRGBColorSpace); };

    function disposeObject(obj) {
      obj.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) {
            if (m.map) m.map.dispose();
            m.dispose();
          });
        }
      });
    }

    // ---- 等位面材質：半透明，邊緣（掠射角）較不透明，靠近區域邊界時淡出 ----
    const surfU = {
      uFace: { value: 0.12 }, uRim: { value: 0.62 },
      uHalf: { value: new THREE.Vector3(W / 2, H / 2, Z) }, uFade: { value: 0.42 }
    };
    function surfMaterial(color, side, clip, opacity) {
      const m = new THREE.MeshStandardMaterial({
        color: color, roughness: 0.3, metalness: 0.0, transparent: true, opacity: opacity,
        depthWrite: false, side: side, clippingPlanes: [clip]
      });
      m.onBeforeCompile = function (sh) {
        sh.uniforms.uFace = surfU.uFace; sh.uniforms.uRim = surfU.uRim;
        sh.uniforms.uHalf = surfU.uHalf; sh.uniforms.uFade = surfU.uFade;
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vEfW;')
          .replace('#include <project_vertex>', '#include <project_vertex>\nvEfW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vEfW;\nuniform float uFace;\nuniform float uRim;\nuniform vec3 uHalf;\nuniform float uFade;')
          .replace('#include <normal_fragment_maps>', [
            '#include <normal_fragment_maps>',
            '{',
            '  float ndv = abs(dot(normal, normalize(vViewPosition)));',
            '  float rim = pow(1.0 - ndv, 2.4);',
            // 靠近區域邊緣時以圓角方盒（|x|^4 + |y|^4 + |z|^4）柔和淡出，被邊界切開的大曲面不會出現生硬的切口
            '  vec3 qv = abs(vEfW) / uHalf; qv *= qv; qv *= qv;',
            '  float fade = 1.0 - smoothstep(uFade, 1.0, qv.x + qv.y + qv.z);',
            '  diffuseColor.a *= mix(uFace, uRim, rim) * fade;',
            '}'].join('\n'));
      };
      m.customProgramCacheKey = function () { return 'ef3-surface'; };
      return m;
    }

    // ---- 由場源電荷建出的幾何：等位面、電力線、箭頭 ----
    const built = { key: '', res: 0, surfaces: [], lineObjs: [] };
    let surfGroupU = null, surfGroupL = null, linesU = null, linesL = null;
    let fineTimer = 0;
    const stats = { };

    function levelList() {
      const out = [];
      env.levels.forEach(function (L) { out.push(L, -L); });
      const hasPos = state.charges.some(function (c) { return c.q > 0; });
      const hasNeg = state.charges.some(function (c) { return c.q < 0; });
      if (hasPos && hasNeg) out.push(0);
      return out;
    }
    function chargeKey() {
      return state.charges.map(function (c) { return [c.x.toFixed(4), c.y.toFixed(4), c.q].join(','); }).join(';');
    }

    /** 等級 L 的顏色：與 2D 色階相同的發散型（OKLab，由中性色往紅／藍），|V| 每加倍深一階 */
    function levelRGB(L) {
      const neutral = mixLab(rgb['canvas-bg'], rgb.muted, colors.dark ? 0.62 : 0.42);
      if (L === 0) return neutral;
      const t = 0.36 + 0.64 * Math.max(0, Math.min(1, Math.log2(Math.abs(L) / 100) / 6));
      return mixLab(neutral, L > 0 ? rgb.pos : rgb.neg, t);
    }

    function clearBuilt() {
      [surfGroupU, surfGroupL, linesU, linesL].forEach(function (g) {
        if (!g) return;
        g.parent.remove(g);
      });
      // 上下兩半共用幾何，只釋放一次；電力線的材質（lineMat、coneMat）一直沿用
      if (surfGroupU) disposeObject(surfGroupU);
      if (surfGroupL) surfGroupL.traverse(function (o) { if (o.material) o.material.dispose(); });
      [linesU, linesL].forEach(function (g, half) {
        if (!g) return;
        g.traverse(function (o) {
          if (o.isInstancedMesh) o.dispose();
          if (o.geometry && half === 0) o.geometry.dispose();
        });
      });
      surfGroupU = surfGroupL = linesU = linesL = null;
      built.surfaces = [];
    }

    const lineMat = new THREE.MeshStandardMaterial({ roughness: 0.42, metalness: 0.08 });
    const coneMat = new THREE.MeshStandardMaterial({ roughness: 0.38, metalness: 0.08 });

    /** fine = true：細格點（0.125 cm）；false：拖滑桿時的粗格點（0.25 cm），停下來後再補細的 */
    function build(fine) {
      const t0 = performance.now();
      clearBuilt();
      const src = sources(state.charges);
      built.key = chargeKey();
      built.res = fine ? 2 : 1;
      if (!src.length) { stats.ms = 0; return; }
      const h = fine ? 0.125 : 0.25;

      // 等位面
      const g = sampleGrid(src, W, H, Z, h);
      const surf = isoSurfaces(src, g, levelList(), W, H, BALL_R * 0.98);
      surfGroupU = new THREE.Group(); surfGroupL = new THREE.Group();
      let maxRes = 0, tris = 0;
      surf.forEach(function (s) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(s.pos, 3));
        geo.setAttribute('normal', new THREE.BufferAttribute(s.nor, 3));
        geo.setIndex(new THREE.BufferAttribute(s.index, 1));
        geo.computeBoundingSphere();
        const c = new THREE.Color(hex(levelRGB(s.level)));
        const rec = { level: s.level, rgb: levelRGB(s.level), meshes: [] };
        // 被區域邊界切開的大曲面畫淡一點，讓包住電荷的封閉曲面更突出（V = 0 例外：電偶極的中垂面）
        const k = s.open && s.level !== 0 ? 0.55 : 1;
        [[surfGroupU, clipUp], [surfGroupL, clipDown]].forEach(function (pair, half) {
          const back = new THREE.Mesh(geo, surfMaterial(c, THREE.BackSide, pair[1], 0.9 * k));
          const front = new THREE.Mesh(geo, surfMaterial(c, THREE.FrontSide, pair[1], k));
          back.userData = { half: half, side: 0, level: s.level };
          front.userData = { half: half, side: 1, level: s.level };
          pair[0].add(back, front);
          rec.meshes.push(back, front);
        });
        built.surfaces.push(rec);
        maxRes = Math.max(maxRes, s.maxRes);
        tris += s.tris;
      });
      upper.add(surfGroupU); lower.add(surfGroupL);

      // 電力線（只描上半空間，下半空間鏡像）
      const lines = fieldLines3(src, {
        perNC: 8, r0: 0.25, step: fine ? 0.04 : 0.08, maxSteps: fine ? 3000 : 1500, stopR: 0.15,
        bounds: { x0: -6, x1: W + 6, y0: -6, y1: H + 6, z1: Z + 6 }
      });
      const lg = buildLines(src, lines, fine);
      linesU = lg.upper; linesL = lg.lower;
      upper.add(linesU); lower.add(linesL);

      orderKey = '';
      stats.h = h; stats.ms = Math.round(performance.now() - t0);
      stats.surfaces = surf.map(function (s) { return { level: s.level, verts: s.verts, tris: s.tris, maxRes: s.maxRes }; });
      stats.maxRes = maxRes; stats.tris = tris; stats.lines = lines.length * 2;
      stats.endOn = lines.reduce(function (acc, l) { acc[l.end] = (acc[l.end] || 0) + 2; return acc; }, {});
      api.stats = stats;
      window.ElectricField3D.lastStats = stats; // 自我檢查用（頂點誤差、條數、計算時間）
      applyVisibility();
      updatePotKey();
    }

    /** 電力線 → 管狀網格（粗細隨 |E| 微調）＋沿線的圓錐箭頭；超出區域的部分剪掉、出口處收細 */
    function buildLines(src, lines, fine) {
      const segs = [];
      const cones = [];
      const e = [0, 0, 0];
      const inside = function (x, y, z) { return x >= 0 && x <= W && y >= 0 && y <= H && z <= Z; };
      const ARROW_EVERY = 2.2, TAPER = 0.6;
      // 小螢幕（手機）上管子與箭頭稍微加粗，才看得清楚（只影響外觀）
      const thick = Math.max(1, Math.min(1.6, 620 / Math.max(240, canvas.clientWidth || 620)));
      const radius = function (x, y, z) {
        field3(src, x, y, z, e);
        const m = Math.sqrt(e[0] * e[0] + e[1] * e[1] + e[2] * e[2]);
        const w = isFinite(m) && m > 0 ? Math.max(0, Math.min(1, (Math.log10(m) - 3.5) / 2)) : 1;
        return (0.017 + 0.021 * w) * thick;
      };
      const stride = fine ? 2 : 1;
      lines.forEach(function (line) {
        const P = line.pts, n = P.length / 3;
        // 1) 剪成區域內的幾段（每段記錄兩端是不是被邊界切斷）
        let cur = null;
        const pieces = [];
        for (let i = 0; i < n; i++) {
          const x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2];
          const ins = inside(x, y, z);
          if (ins) {
            if (!cur) {
              cur = { p: [], cutStart: i > 0, cutEnd: false };
              if (i > 0) { // 從邊界進來：補上邊界上的點
                const t = crossT(P, i, i - 1);
                cur.p.push(lerp3(P, i, i - 1, t));
              }
            }
            cur.p.push([x, y, z]);
          } else if (cur) {
            const t = crossT(P, i - 1, i);
            cur.p.push(lerp3(P, i - 1, i, t));
            cur.cutEnd = true;
            pieces.push(cur); cur = null;
          }
        }
        if (cur) pieces.push(cur);
        // 2) 每段重新取樣成管子的節點
        pieces.forEach(function (pc) {
          const pts = pc.p;
          if (pts.length < 2) return;
          const keep = [];
          for (let i = 0; i < pts.length; i++) if (i % stride === 0 || i === pts.length - 1) keep.push(pts[i]);
          // 沿線弧長，用來收細兩端
          const sArr = [0];
          for (let i = 1; i < keep.length; i++) sArr.push(sArr[i - 1] + dist3(keep[i], keep[i - 1]));
          const total = sArr[sArr.length - 1];
          if (total < 0.05) return;
          const pp = new Float32Array(keep.length * 3), rr = new Float32Array(keep.length);
          keep.forEach(function (q, i) {
            pp[3 * i] = q[0] - W / 2; pp[3 * i + 1] = q[1] - H / 2; pp[3 * i + 2] = q[2];
            let f = 1;
            if (pc.cutStart) f = Math.min(f, taper(sArr[i] / TAPER));
            if (pc.cutEnd) f = Math.min(f, taper((total - sArr[i]) / TAPER));
            rr[i] = radius(q[0], q[1], q[2]) * f;
          });
          segs.push({ p: pp, r: rr });
        });
        // 3) 箭頭：沿整條線每 2.2 cm 一個（與 2D 相同的間距），標示真正的電場方向
        let acc = ARROW_EVERY * 0.55;
        for (let i = 1; i < n - 1; i++) {
          const dx = P[3 * i] - P[3 * i - 3], dy = P[3 * i + 1] - P[3 * i - 2], dz = P[3 * i + 2] - P[3 * i - 1];
          acc += Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (acc < ARROW_EVERY) continue;
          acc = 0;
          const x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2];
          if (x < 0.3 || x > W - 0.3 || y < 0.3 || y > H - 0.3 || z > Z - 0.3 || z < 0.1) continue;
          let nearQ = false;
          for (let s = 0; s < src.length; s++) if (Math.hypot(x - src[s].x, y - src[s].y, z) < 0.55) nearQ = true;
          if (nearQ) continue;
          const tx = P[3 * i + 3] - P[3 * i - 3], ty = P[3 * i + 4] - P[3 * i - 2], tz = P[3 * i + 5] - P[3 * i - 1];
          const tl = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1;
          cones.push([x - W / 2, y - H / 2, z, line.dir * tx / tl, line.dir * ty / tl, line.dir * tz / tl]);
        }
      });

      const gU = new THREE.Group(), gL = new THREE.Group();
      const tube = tubeGeometry(segs, fine ? 6 : 5);
      const tm = new THREE.Mesh(tube, lineMat);
      tm.castShadow = true;
      gU.add(tm);
      const tmL = new THREE.Mesh(tube, lineMat); // 下半空間在平面下方，影子不會落在平面上
      gL.add(tmL);
      if (cones.length) {
        const cg = new THREE.ConeGeometry(0.085 * thick, 0.3 * thick, 14);
        const mk = function () {
          const inst = new THREE.InstancedMesh(cg, coneMat, cones.length);
          const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), dv = new THREE.Vector3(), pv = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
          cones.forEach(function (c, i) {
            dv.set(c[3], c[4], c[5]);
            q.setFromUnitVectors(up, dv);
            pv.set(c[0], c[1], c[2]);
            mtx.compose(pv, q, one);
            inst.setMatrixAt(i, mtx);
          });
          inst.instanceMatrix.needsUpdate = true;
          return inst;
        };
        const cu = mk();
        cu.castShadow = true;
        gU.add(cu);
        gL.add(mk());
      }
      return { upper: gU, lower: gL };
    }
    function taper(u) { u = Math.max(0, Math.min(1, u)); return 0.2 + 0.8 * u * u * (3 - 2 * u); }
    function dist3(a, b) { return Math.sqrt((a[0] - b[0]) * (a[0] - b[0]) + (a[1] - b[1]) * (a[1] - b[1]) + (a[2] - b[2]) * (a[2] - b[2])); }
    /** 點 a（區域內）到點 b（區域外）的線段與區域邊界的交點參數 t */
    function crossT(P, a, b) {
      let t = 1;
      const ax = P[3 * a], ay = P[3 * a + 1], az = P[3 * a + 2], bx = P[3 * b], by = P[3 * b + 1], bz = P[3 * b + 2];
      if (bx < 0) t = Math.min(t, ax / (ax - bx));
      if (bx > W) t = Math.min(t, (W - ax) / (bx - ax));
      if (by < 0) t = Math.min(t, ay / (ay - by));
      if (by > H) t = Math.min(t, (H - ay) / (by - ay));
      if (bz > Z) t = Math.min(t, (Z - az) / (bz - az));
      return Math.max(0, Math.min(1, t));
    }
    function lerp3(P, a, b, t) {
      return [P[3 * a] + (P[3 * b] - P[3 * a]) * t, P[3 * a + 1] + (P[3 * b + 1] - P[3 * a + 1]) * t, P[3 * a + 2] + (P[3 * b + 2] - P[3 * a + 2]) * t];
    }

    /** 管狀網格（平行移動座標系，避免扭轉） */
    function tubeGeometry(segs, radial) {
      let nv = 0, ni = 0;
      segs.forEach(function (s) { const n = s.r.length; nv += n * radial; ni += (n - 1) * radial * 6; });
      const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3);
      const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
      const ca = [], sa = [];
      for (let r = 0; r < radial; r++) { ca.push(Math.cos(2 * Math.PI * r / radial)); sa.push(Math.sin(2 * Math.PI * r / radial)); }
      let vo = 0, io = 0;
      segs.forEach(function (s) {
        const P = s.p, R = s.r, n = R.length, base = vo;
        let Nx = 0, Ny = 0, Nz = 0;
        for (let i = 0; i < n; i++) {
          const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
          let tx = P[3 * b] - P[3 * a], ty = P[3 * b + 1] - P[3 * a + 1], tz = P[3 * b + 2] - P[3 * a + 2];
          const tl = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1;
          tx /= tl; ty /= tl; tz /= tl;
          if (i === 0) {
            // 任取一個與切線垂直的方向
            if (Math.abs(tz) < 0.9) { Nx = -ty; Ny = tx; Nz = 0; } else { Nx = 0; Ny = -tz; Nz = ty; }
          } else {
            const d = Nx * tx + Ny * ty + Nz * tz;
            Nx -= d * tx; Ny -= d * ty; Nz -= d * tz;
          }
          const nl = Math.sqrt(Nx * Nx + Ny * Ny + Nz * Nz) || 1;
          Nx /= nl; Ny /= nl; Nz /= nl;
          const Bx = ty * Nz - tz * Ny, By = tz * Nx - tx * Nz, Bz = tx * Ny - ty * Nx;
          for (let r = 0; r < radial; r++) {
            const nx = ca[r] * Nx + sa[r] * Bx, ny = ca[r] * Ny + sa[r] * By, nz = ca[r] * Nz + sa[r] * Bz;
            pos[3 * vo] = P[3 * i] + R[i] * nx; pos[3 * vo + 1] = P[3 * i + 1] + R[i] * ny; pos[3 * vo + 2] = P[3 * i + 2] + R[i] * nz;
            nor[3 * vo] = nx; nor[3 * vo + 1] = ny; nor[3 * vo + 2] = nz;
            vo++;
          }
        }
        for (let i = 0; i < n - 1; i++) {
          for (let r = 0; r < radial; r++) {
            const a = base + i * radial + r, b = base + i * radial + (r + 1) % radial, c = a + radial, d = b + radial;
            idx[io++] = a; idx[io++] = b; idx[io++] = c;
            idx[io++] = b; idx[io++] = d; idx[io++] = c;
          }
        }
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      g.setIndex(new THREE.BufferAttribute(idx, 1));
      g.computeBoundingSphere();
      return g;
    }

    // ---- z = 0 平面：2D 畫面所在的位置（電位色階、1 cm 格線、2D 的等位線） ----
    const texCv = document.createElement('canvas');
    texCv.width = 1200; texCv.height = 800;
    const tctx = texCv.getContext('2d');
    const planeTex = new THREE.CanvasTexture(texCv);
    planeTex.colorSpace = THREE.SRGBColorSpace;
    planeTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(W, H),
      new THREE.MeshBasicMaterial({ map: planeTex, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    scene.add(plane);
    let planeKey = '';
    function drawPlane() {
      const cache = env.getCache();
      const key = [built.key, state.show.heat, state.show.grid, state.show.equi, state.show.lines, cut, colors['canvas-bg'], colors.equi].join('|');
      if (key === planeKey) return;
      planeKey = key;
      const g = tctx, pw = texCv.width, ph = texCv.height, s = pw / W;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, pw, ph);
      g.lineCap = 'round'; g.lineJoin = 'round';
      // 底：半透明（看得到下半空間），有電位色階時就是 2D 的色階
      // 剖半時平面淡一點，看得清楚下方的半個等位面
      g.globalAlpha = cut ? (colors.dark ? 0.46 : 0.42) : (colors.dark ? 0.62 : 0.6);
      if (state.show.heat) {
        g.imageSmoothingEnabled = true;
        g.imageSmoothingQuality = 'high';
        g.drawImage(env.heatCanvas, 0, 0, pw, ph);
      } else {
        g.fillStyle = colors['canvas-bg'];
        g.fillRect(0, 0, pw, ph);
      }
      g.globalAlpha = 1;
      if (state.show.grid) {
        g.strokeStyle = rgbaStr(rgb.text, colors.dark ? 0.16 : 0.13);
        g.lineWidth = 2;
        g.beginPath();
        for (let x = 1; x < W; x++) { g.moveTo(x * s, 0); g.lineTo(x * s, ph); }
        for (let y = 1; y < H; y++) { g.moveTo(0, y * s); g.lineTo(pw, y * s); }
        g.stroke();
      }
      // 剖半時，平面上再畫出 2D 的電力線：這就是 2D 畫面
      if (cut && state.show.lines && cache.lines) {
        g.strokeStyle = rgbaStr(rgb.field, 0.8);
        g.lineWidth = 2.4;
        g.beginPath();
        cache.lines.forEach(function (line) {
          const p = line.points;
          for (let i = 0; i < p.length; i++) {
            const X = p[i][0] * s, Y = (H - p[i][1]) * s;
            if (i) g.lineTo(X, Y); else g.moveTo(X, Y);
          }
        });
        g.stroke();
      }
      if (state.show.equi) {
        g.strokeStyle = colors.equi;
        cache.contours.forEach(function (ct) {
          g.setLineDash(ct.level === 0 ? [16, 8] : [10, 7]);
          g.lineWidth = ct.level === 0 ? 3.6 : 3;
          g.beginPath();
          ct.polys.forEach(function (poly) {
            for (let i = 0; i < poly.length; i++) {
              const X = poly[i][0] * s, Y = (H - poly[i][1]) * s;
              if (i) g.lineTo(X, Y); else g.moveTo(X, Y);
            }
          });
          g.stroke();
        });
        g.setLineDash([]);
      }
      // 外框
      g.strokeStyle = rgbaStr(rgb.muted, 0.75);
      g.lineWidth = 4;
      g.strokeRect(2, 2, pw - 4, ph - 4);
      planeTex.needsUpdate = true;
    }

    // ---- 點電荷：有光澤的小球＋光暈＋正負號 ----
    const chargeObjs = [];
    const glowTex = (function () {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d');
      const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.55)');
      gr.addColorStop(0.6, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
    function signTexture(kind) {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d');
      g.lineCap = 'round';
      const L = 34;
      [['rgba(0,0,0,0.35)', 22, 3], ['#ffffff', 14, 0]].forEach(function (st) {
        g.strokeStyle = st[0]; g.lineWidth = st[1];
        g.beginPath();
        if (kind === '0') {
          g.ellipse(64, 64 + st[2] * 0.3, 22, 30, 0, 0, Math.PI * 2);
        } else {
          g.moveTo(64 - L, 64 + st[2] * 0.3); g.lineTo(64 + L, 64 + st[2] * 0.3);
          if (kind === '+') { g.moveTo(64, 64 - L + st[2] * 0.3); g.lineTo(64, 64 + L + st[2] * 0.3); }
        }
        g.stroke();
      });
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      return t;
    }
    const signTex = { '+': signTexture('+'), '-': signTexture('-'), '0': signTexture('0') };
    const ballGeo = new THREE.SphereGeometry(BALL_R, 40, 28);
    function makeCharge() {
      const mat = new THREE.MeshPhysicalMaterial({ roughness: 0.26, metalness: 0.0, clearcoat: 1, clearcoatRoughness: 0.18 });
      const ball = new THREE.Mesh(ballGeo, mat);
      ball.castShadow = true;
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false }));
      glow.renderOrder = 700;
      const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: signTex['+'], transparent: true, depthWrite: false, depthTest: false }));
      sign.scale.setScalar(BALL_R * 1.25);
      sign.renderOrder = 800;
      const g = new THREE.Group();
      g.add(ball, glow, sign);
      scene.add(g);
      const lbl = addLabel('ef3-chg', '');
      return { g: g, ball: ball, glow: glow, sign: sign, label: lbl, key: '' };
    }

    // ---- 試探電荷（在 z = 0 平面上運動：那裡 E_z = 0）、軌跡與受力方向 ----
    const probe = new THREE.Mesh(new THREE.SphereGeometry(0.13, 28, 18), new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.05 }));
    probe.castShadow = true;
    scene.add(probe);
    const homeRing = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.15, 28), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
    homeRing.renderOrder = 650;
    scene.add(homeRing);
    const TRAIL_MAX = 4000;
    const trailPos = new Float32Array(TRAIL_MAX * 3), trailCol = new Float32Array(TRAIL_MAX * 4);
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3).setUsage(THREE.DynamicDrawUsage));
    trailGeo.setAttribute('color', new THREE.BufferAttribute(trailCol, 4).setUsage(THREE.DynamicDrawUsage));
    trailGeo.setDrawRange(0, 0);
    const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
    trail.frustumCulled = false;
    trail.renderOrder = 650;
    scene.add(trail);
    const trailDots = new THREE.Points(trailGeo, new THREE.PointsMaterial({ vertexColors: true, transparent: true, depthWrite: false, size: 2.4, sizeAttenuation: false }));
    trailDots.frustumCulled = false;
    trailDots.renderOrder = 650;
    scene.add(trailDots);
    const fArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1, 0xffffff, 0.3, 0.16);
    scene.add(fArrow);

    // ---- z 軸（在平面左前角）與刻度 ----
    let axisGroup = null;
    function buildAxis() {
      if (axisGroup) { scene.remove(axisGroup); disposeObject(axisGroup); }
      const grp = new THREE.Group();
      const ox = -W / 2, oy = H / 2, zt = Z * 0.75; // 在平面的左後角，±3 cm
      const pts = [ox, oy, -zt, ox, oy, zt + 0.6];
      for (let z = -zt; z <= zt + 1e-9; z += 1) pts.push(ox - 0.12, oy, z, ox + 0.12, oy, z);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      grp.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: col('muted'), transparent: true, opacity: 0.9 })));
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.32, 12), new THREE.MeshStandardMaterial({ color: col('muted'), roughness: 0.5 }));
      tip.rotation.x = Math.PI / 2;
      tip.position.set(ox, oy, zt + 0.6);
      grp.add(tip);
      axisGroup = grp;
      scene.add(grp);
    }

    // ---- HTML 標籤（字體隨設定縮放、簡體自動轉換、深淺色由 CSS 代號決定） ----
    const labels = [];
    function addLabel(cls, html) {
      const el = document.createElement('div');
      el.className = 'ef3-lbl ' + cls;
      el.innerHTML = html;
      layer.appendChild(el);
      const L = { el: el, world: new THREE.Vector3(), ax: -50, ay: -50, dx: 0, dy: 0, show: true, html: html };
      labels.push(L);
      return L;
    }
    function setHTML(L, html) { if (L.html !== html) { L.html = html; L.el.innerHTML = html; } }
    const zTop = Z * 0.75;
    const zLabel = addLabel('ef3-axis', '<i>z</i>');
    zLabel.world.set(-W / 2, H / 2, zTop + 1.05);
    const tickLabel = addLabel('ef3-tick', '+' + zTop + ' cm'); // z 軸刻度間隔 1 cm
    tickLabel.world.set(-W / 2, H / 2, zTop); tickLabel.ax = -100; tickLabel.dx = -7;
    const planeLabel = addLabel('ef3-plane', T('z = 0（2D 畫面）', 'z = 0 (the 2D view)'));
    planeLabel.world.set(W / 2, -H / 2, 0); planeLabel.ax = -100; planeLabel.ay = 0; planeLabel.dy = 5;
    const fLabel = addLabel('ef3-f', '<i>F</i>');

    const tv = new THREE.Vector3(), tv2 = new THREE.Vector3();
    function placeLabels() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      labels.forEach(function (L) {
        if (!L.show) { if (L.el.style.display !== 'none') L.el.style.display = 'none'; return; }
        tv.copy(L.world).project(camera);
        if (tv.z > 1 || tv.z < -1) { L.el.style.display = 'none'; return; }
        const x = (tv.x + 1) / 2 * w + L.dx, y = (1 - tv.y) / 2 * h + L.dy;
        if (L.el.style.display === 'none') L.el.style.display = '';
        L.el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) translate(' + L.ax + '%,' + L.ay + '%)';
      });
    }
    /** 世界座標中長度 len 的物體在 p 處投影成幾個像素 */
    function pxSize(p, len) {
      const h = canvas.clientHeight;
      const d = tv2.copy(p).applyMatrix4(camera.matrixWorldInverse).z;
      return len * h / (2 * Math.tan(camera.fov * Math.PI / 360) * Math.max(0.01, -d));
    }

    // ---- 電位色票（圖例下方）：與等位面相同的顏色 ----
    let potKeyKey = '';
    function updatePotKey() {
      const el = env.potKey;
      if (!el) return;
      const lv = built.surfaces.map(function (s) { return s.level; }).sort(function (a, b) { return b - a; });
      const key = [lv.join(','), state.show.equi, colors.pos, colors.neg, colors['canvas-bg']].join('|');
      if (key === potKeyKey) return;
      potKeyKey = key;
      if (!lv.length || !state.show.equi) { el.innerHTML = ''; return; }
      let html = '<span class="pk-title">' + T('等位面的電位', 'Potential of the surfaces') + '</span>';
      lv.forEach(function (L) {
        const c = levelRGB(L);
        html += '<span class="pk"><i style="background:' + hex(c) + '"></i>' + (L > 0 ? '+' : L < 0 ? '−' : '') + Math.abs(L) + '</span>';
      });
      el.innerHTML = html + '<span class="pk-unit">V</span>';
    }

    // ---- 顏色（深淺色切換時重新套用） ----
    function applyColors() {
      colors = env.colors(); rgb = env.rgb();
      const dark = !!colors.dark;
      hemi.color.set(0xffffff);
      hemi.groundColor.copy(col('canvas-bg')).lerp(col('text'), 0.3);
      hemi.intensity = dark ? 1.25 : 1.55;
      sun.intensity = dark ? 1.9 : 2.2;
      floor.material.opacity = dark ? 0.3 : 0.16;
      surfU.uFace.value = dark ? 0.14 : 0.15;
      surfU.uRim.value = dark ? 0.7 : 0.72;
      lineMat.color.copy(col('field'));
      lineMat.emissive.copy(col('field')).multiplyScalar(dark ? 0.12 : 0);
      coneMat.color.copy(col('field'));
      coneMat.emissive.copy(col('field')).multiplyScalar(dark ? 0.12 : 0);
      built.surfaces.forEach(function (s) {
        s.rgb = levelRGB(s.level);
        const c = new THREE.Color(hex(s.rgb));
        s.meshes.forEach(function (m) { m.material.color.copy(c); });
      });
      probe.material.color.copy(col('probe'));
      probe.material.emissive.copy(col('probe')).multiplyScalar(dark ? 0.35 : 0.12);
      homeRing.material.color.copy(col('probe'));
      fArrow.setColor(col('probe'));
      buildAxis();
      chargeObjs.forEach(function (o) { o.key = ''; });
      planeKey = '';
      updatePotKey();
    }

    // ---- 每一幀：電荷、試探電荷、軌跡（便宜的部分）；幾何只在場源改變時重建 ----
    function syncCharges() {
      const ch = state.charges;
      while (chargeObjs.length < ch.length) chargeObjs.push(makeCharge());
      const dark = !!colors.dark;
      ch.forEach(function (c, i) {
        const o = chargeObjs[i];
        o.g.position.set(c.x - W / 2, c.y - H / 2, 0);
        const key = [c.q, colors.pos, colors.neg, colors.muted, dark].join('|');
        if (o.key !== key) {
          o.key = key;
          const base = c.q > 0 ? col('pos') : c.q < 0 ? col('neg') : col('muted');
          const mag = Math.min(1, Math.abs(c.q) / 5);
          const mat = o.ball.material;
          if (c.q !== 0) {
            mat.color.copy(base);
            mat.emissive.copy(base).multiplyScalar(dark ? 0.32 : 0.12);
            mat.transparent = false; mat.opacity = 1;
          } else {
            mat.color.copy(col('surface')).lerp(col('muted'), 0.35);
            mat.emissive.setRGB(0, 0, 0);
            mat.transparent = true; mat.opacity = 0.7;
          }
          mat.needsUpdate = true;
          o.glow.visible = c.q !== 0;
          o.glow.material.color.copy(base);
          o.glow.material.opacity = (dark ? 0.75 : 0.42) * (0.45 + 0.55 * mag);
          o.glow.material.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
          o.glow.material.needsUpdate = true;
          o.glow.scale.setScalar(BALL_R * 2 * (2.2 + 2.0 * mag));
          o.sign.material.map = signTex[c.q > 0 ? '+' : c.q < 0 ? '-' : '0'];
          o.sign.material.color.set(c.q === 0 ? col('muted') : 0xffffff);
          o.sign.material.needsUpdate = true;
          const cc = c.q > 0 ? colors.pos : c.q < 0 ? colors.neg : colors.muted;
          o.label.el.style.setProperty('--c', cc);
        }
        setHTML(o.label, '<b>' + c.label + '</b>' + env.fmtQ(c.q));
        o.label.world.copy(o.g.position);
        o.label.ax = -50; o.label.ay = -100;
        o.label.dy = -(pxSize(o.g.position, BALL_R) + 7);
      });
    }

    function syncProbe() {
      const pr = state.probe;
      probe.position.set(pr.x - W / 2, pr.y - H / 2, 0);
      const moved = pr.trail.length > 1 && Math.hypot(pr.x - pr.home.x, pr.y - pr.home.y) > 0.15;
      homeRing.visible = moved;
      homeRing.position.set(pr.home.x - W / 2, pr.home.y - H / 2, 0.01);
      // 軌跡：越舊越淡
      const tr = pr.trail, n = Math.min(tr.length, TRAIL_MAX), s0 = tr.length - n;
      const pc = col('probe');
      for (let i = 0; i < n; i++) {
        const t = tr[s0 + i];
        trailPos[3 * i] = t[0] - W / 2; trailPos[3 * i + 1] = t[1] - H / 2; trailPos[3 * i + 2] = 0.012;
        const age = n > 1 ? i / (n - 1) : 1;
        trailCol[4 * i] = pc.r; trailCol[4 * i + 1] = pc.g; trailCol[4 * i + 2] = pc.b;
        trailCol[4 * i + 3] = 0.25 + 0.7 * age * age;
      }
      trailGeo.setDrawRange(0, n);
      trailGeo.attributes.position.needsUpdate = true;
      trailGeo.attributes.color.needsUpdate = true;
      trail.visible = trailDots.visible = n > 1;
      // 受力方向（固定長度，只表示方向；與 2D 相同）
      const e = FC.fieldAt(state.charges, pr.x, pr.y);
      const fx = pr.q * e.ex, fy = pr.q * e.ey, fm = Math.hypot(fx, fy);
      if (fm > 0 && isFinite(fm)) {
        tv.set(fx / fm, fy / fm, 0);
        fArrow.position.copy(probe.position);
        fArrow.setDirection(tv);
        fArrow.setLength(0.95, 0.3, 0.15);
        fArrow.visible = true;
        fLabel.show = true;
        fLabel.world.copy(probe.position).addScaledVector(tv, 1.22);
      } else {
        fArrow.visible = false;
        fLabel.show = false;
      }
    }

    let cut = false;
    function applyVisibility() {
      const sh = state.show;
      [surfGroupU, surfGroupL].forEach(function (g) { if (g) g.visible = !!sh.equi; });
      [linesU, linesL].forEach(function (g) { if (g) g.visible = !!sh.lines; });
      upper.visible = !cut;                  // 剖半：拿掉 z > 0 的上半部
    }

    // ---- 透明物件的繪製順序：遠的半邊 → z = 0 平面 → 近的半邊；同一半邊內，背面由外而內、正面由內而外 ----
    let orderKey = '';
    function updateOrder() {
      const above = camera.position.z >= 0;
      const key = above + '|' + built.key + '|' + built.res;
      if (key === orderKey) return;
      orderKey = key;
      const ranks = built.surfaces.map(function (s) { return Math.abs(s.level); })
        .filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(function (a, b) { return a - b; });
      built.surfaces.forEach(function (s) {
        const r = ranks.indexOf(Math.abs(s.level));
        s.meshes.forEach(function (m) {
          const nearHalf = (m.userData.half === 0) === above;
          const baseO = nearHalf ? 400 : 100;
          m.renderOrder = m.userData.side === 0 ? baseO + r : baseO + 200 - r;
        });
      });
      plane.renderOrder = 350;
      floor.renderOrder = 351;
    }

    // ---- 相機：自動對準整個區域；進入 3D 時由正上方（＝2D 畫面）轉到斜視 ----
    const target0 = new THREE.Vector3(0, 0, 0);
    const POLAR0 = 0.95, AZ0 = -Math.PI / 2 + 0.42;      // 預設視角（由上方偏 54°、由前方往右轉 24°）
    function fitDistance(polar, az) {
      const dir = new THREE.Vector3(Math.sin(polar) * Math.cos(az), Math.sin(polar) * Math.sin(az), Math.cos(polar));
      const fwd = dir.clone().negate();
      const right = new THREE.Vector3().crossVectors(fwd, camera.up);
      if (right.lengthSq() < 1e-8) right.set(1, 0, 0); else right.normalize();
      const upv = new THREE.Vector3().crossVectors(right, fwd).normalize();
      const tvv = Math.tan(camera.fov * Math.PI / 360), th = tvv * camera.aspect;
      // 要容納的點：平面的四個角（含 z 軸），以及電荷附近等位面的上下緣（正上方看時只需要容納平面）
      const pts = [];
      [-W / 2 - 0.3, W / 2 + 0.3].forEach(function (X) { [-H / 2 - 0.3, H / 2 + 0.3].forEach(function (Y) { pts.push([X, Y, 0]); }); });
      if (polar > 0.2) [-W / 4, W / 4].forEach(function (X) { [-2.8, 2.8].forEach(function (Zc) { pts.push([X, 0, Zc]); }); });
      pts.push([-W / 2, H / 2, Z * 0.75 + 0.6]);
      let dist = 1;
      pts.forEach(function (q) {
        const c = new THREE.Vector3(q[0], q[1], q[2]);
        const depth = c.dot(dir);
        dist = Math.max(dist, depth + Math.abs(c.dot(right)) / th, depth + Math.abs(c.dot(upv)) / tvv);
      });
      return dist * 1.03;
    }
    function placeCamera(polar, az, dist, target) {
      camera.position.set(Math.sin(polar) * Math.cos(az), Math.sin(polar) * Math.sin(az), Math.cos(polar)).multiplyScalar(dist).add(target);
      controls.target.copy(target);
      camera.near = Math.max(0.05, dist / 100);
      camera.far = dist * 20;
      camera.updateProjectionMatrix();
      camera.lookAt(target);
    }
    let anim = null;
    function startAnim(fromPolar, fromAz, fromDist, fromTarget, ms) {
      const toPolar = POLAR0, toAz = AZ0, toDist = fitDistance(POLAR0, AZ0);
      if (reduced() || ms <= 0) { placeCamera(toPolar, toAz, toDist, target0); controls.update(); anim = null; return; }
      // t0 在第一個畫出來的影格才開始計時（第一幀要編譯著色器，可能很慢）
      anim = { t0: 0, ms: ms, p0: fromPolar, a0: fromAz, d0: fromDist, c0: fromTarget.clone(), p1: toPolar, a1: toAz, d1: toDist };
    }
    function stepAnim(now) {
      if (!anim) return false;
      // 第一幀畫出起始姿勢，從第二幀開始計時
      if (anim.t0 <= 0) { anim.t0 = anim.t0 === 0 ? -1 : now; }
      const u = anim.t0 < 0 ? 0 : Math.min(1, (now - anim.t0) / anim.ms);
      const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; // 緩入緩出（相機運動，不是物理）
      let da = anim.a1 - anim.a0;
      while (da > Math.PI) da -= 2 * Math.PI;
      while (da < -Math.PI) da += 2 * Math.PI;
      const c = anim.c0.clone().lerp(target0, e);
      placeCamera(anim.p0 + (anim.p1 - anim.p0) * e, anim.a0 + da * e, anim.d0 + (anim.d1 - anim.d0) * e, c);
      if (u >= 1) anim = null;
      return true;
    }
    function currentAngles() {
      const off = camera.position.clone().sub(controls.target);
      const d = off.length();
      return { polar: Math.acos(Math.max(-1, Math.min(1, off.z / d))), az: Math.atan2(off.y, off.x), dist: d };
    }
    controls.addEventListener('start', function () { anim = null; });

    // ---- 繪製（只在需要時） ----
    let raf = 0;
    function renderNow() {
      if (!api.active || document.hidden) return;
      const want = Math.min(window.devicePixelRatio || 1, 2);
      if (renderer.getPixelRatio() !== want) { renderer.setPixelRatio(want); resize3(); }
      const animating = stepAnim(performance.now());
      const moved = animating ? false : controls.update();
      updateOrder();
      camera.updateMatrixWorld();
      syncCharges();
      renderer.render(scene, camera);
      placeLabels();
      if (moved || animating || anim) requestRender();
    }
    function requestRender() {
      if (raf || !api.active) return;
      raf = requestAnimationFrame(function () { raf = 0; renderNow(); });
    }
    let lastAspect = 0;
    function resize3() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      // 長寬比改變（例如手機轉向）時，若相機還在預設位置附近就重新對準
      if (lastAspect && Math.abs(lastAspect - camera.aspect) > 0.01 && !anim) {
        const a = currentAngles();
        placeCamera(a.polar, a.az, Math.max(a.dist, fitDistance(a.polar, a.az) * 0.6), controls.target.clone());
      }
      lastAspect = camera.aspect;
      requestRender();
    }
    const ro = window.ResizeObserver ? new ResizeObserver(resize3) : null;
    if (ro) ro.observe(canvas); else window.addEventListener('resize', resize3);
    controls.addEventListener('change', requestRender);
    const onVisible = function () { if (!document.hidden) requestRender(); };
    document.addEventListener('visibilitychange', onVisible);
    canvas.addEventListener('webglcontextlost', function (ev) {
      ev.preventDefault();
      if (!api.active) return; // 切回 2D 時自己釋放的（forceContextLoss），不是意外中斷
      if (env.onLost) env.onLost();
    });

    // ---- 對外介面 ----
    const api = {
      active: true,
      stats: stats,
      /** 由 electric-field.js 的 draw() 呼叫：場源改變就重建（拖滑桿時先粗後細），其餘只更新便宜的部分 */
      frame: function () {
        if (!api.active) return;
        const key = chargeKey();
        if (key !== built.key) {
          build(false);
          clearTimeout(fineTimer);
          fineTimer = setTimeout(function () {
            if (!api.active || built.res === 2 || chargeKey() !== built.key) return;
            build(true);
            planeKey = '';
            drawPlane();
            requestRender();
          }, 260);
        }
        applyVisibility();
        updatePotKey();
        drawPlane();
        syncProbe();
        requestRender();
      },
      onTheme: function () {
        applyColors();
        drawPlane();
        requestRender();
      },
      setCut: function (on) {
        cut = !!on;
        applyVisibility();
        drawPlane();
        requestRender();
      },
      resetCamera: function () {
        const a = currentAngles();
        startAnim(a.polar, a.az, a.dist, controls.target, 700);
        requestRender();
      },
      dispose: function () {
        api.active = false;
        clearTimeout(fineTimer);
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize3);
        document.removeEventListener('visibilitychange', onVisible);
        controls.dispose();
        fArrow.dispose();
        clearBuilt();
        lineMat.dispose(); coneMat.dispose();
        disposeObject(scene);
        glowTex.dispose();
        Object.keys(signTex).forEach(function (k) { signTex[k].dispose(); });
        planeTex.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        canvas.remove();
        layer.remove();
        if (env.potKey) env.potKey.innerHTML = '';
      }
    };

    // ---- 初始化：細格點一次建好，再從正上方轉到斜視 ----
    cut = !!(env.isCut && env.isCut());
    applyColors();
    build(true);
    applyVisibility();
    drawPlane();
    syncProbe();
    const w0 = canvas.clientWidth, h0 = canvas.clientHeight;
    if (w0 && h0) { renderer.setSize(w0, h0, false); camera.aspect = w0 / h0; camera.updateProjectionMatrix(); lastAspect = camera.aspect; }
    const topDist = fitDistance(0.0015, -Math.PI / 2);
    placeCamera(0.0015, -Math.PI / 2, topDist, target0);
    controls.update();
    // 先編譯全部著色器（使用者還看著「載入中」），之後的轉場才會順
    try { renderer.compile(scene, camera); } catch (e) { /* 舊版瀏覽器：第一幀再編譯 */ }
    startAnim(0.0015, -Math.PI / 2, topDist, target0, 1800);
    requestRender();
    return api;
  }

  window.ElectricField3D = { create: create, pot3: pot3, field3: field3, sources: sources, sampleGrid: sampleGrid, isoSurfaces: isoSurfaces, fieldLines3: fieldLines3 };
})();
