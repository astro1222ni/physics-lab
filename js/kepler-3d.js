/*
 * kepler-3d.js — 「行星軌道與克卜勒定律」的 3D 立體檢視（three.js）
 *
 * 由 js/kepler.js 在使用者按「3D 立體」時才載入（three.js 也是那時才以 import() 載入）；切回 2D 時整個釋放。
 * 用法：window.Kepler3D.create({ THREE, OrbitControls }, 容器, bridge) → { frame, onShow, onTheme, resetCamera, camTo, setCone, dispose }
 *
 * 物理全部來自 kepler-core.js，與 2D 畫面是同一份計算（bridge 由 kepler.js 提供）：
 *   軌道曲線 positionAtNu、飛行物體的位置與速度 stateAt、等時間扇形 anomalyAt／positionAtAnomaly、近／遠日點 rp／ra。
 * 場景座標：軌道面就是 z = 0 的平面，中心天體在原點，x、y 與 2D 畫面相同；z 軸沿比角動量 h = r × v 的方向。
 *   1 個場景單位 = 「視野」的 1/10（視野 = 中心到最近畫面邊緣的距離），所以「視野」滑桿在 3D 中也決定框住的範圍。
 * 速度箭頭的比例與 2D 相同（箭頭長度 ∝ 速率）；角動量 h 的箭頭只表示方向（長度固定）。
 * 純視覺輔助（不影響任何物理量）：星空、軌道面的格線與底色、地球自轉、地球的影子、圓錐截痕。
 */
(function () {
  'use strict';
  const TAU = Math.PI * 2;
  const R3 = 10;               // 視野在場景中的長度
  const RMAX = 2.2 * R3;       // 軌道最遠畫到這個距離
  const GRID_R = 1.5 * R3;     // 軌道面格線的範圍
  const H_LEN = 3.2;           // 角動量箭頭的長度（只表示方向）
  const TRAIL_N = 48;          // 拖尾的段數（與 2D 相同）
  const RAD = 10;              // 管子的圓周分段
  const SIDEREAL_DAY = 86164.0905;
  const DEF_POLAR = 52 * Math.PI / 180, DEF_AZ = -75 * Math.PI / 180; // 預設視角：斜上方
  const FONT = 'system-ui, -apple-system, "Segoe UI", "Noto Sans TC", "PingFang TC", sans-serif';
  const RES = 3;               // 標籤貼圖的解析度倍數

  function create(lib, host, B) {
    const THREE = lib.THREE;
    const K = B.K, T = B.T, state = B.state, C = B.colors;

    // ---------- 畫布、HUD ----------
    const wrap = document.createElement('div');
    wrap.className = 'k3-wrap';
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', T('行星軌道的 3D 立體檢視（可拖曳旋轉、縮放）', '3D view of the orbit (drag to rotate, pinch or scroll to zoom)'));
    wrap.appendChild(canvas);
    const hud = document.createElement('div');
    hud.className = 'k3-hud';
    hud.setAttribute('aria-hidden', 'true');
    hud.innerHTML = '<div class="tl"><span data-k="t"></span><span class="m" data-k="ts"></span></div>' +
      '<div class="tr"><span data-k="kind"></span><span class="m" data-k="dash"></span></div>' +
      '<div class="br"><span class="m" data-k="scale"></span></div>';
    wrap.appendChild(hud);
    host.appendChild(wrap);
    const hudEl = {};
    hud.querySelectorAll('[data-k]').forEach(function (e) { hudEl[e.getAttribute('data-k')] = e; });

    let renderer;
    try {
      // alpha：背景由 CSS 的徑向漸層提供（隨深淺色自動變化）
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    } catch (e) {
      wrap.remove();
      throw e;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1.5, 0.1, 3000);
    camera.up.set(0, 0, 1); // z（軌道面的法線）朝上；必須在建立 OrbitControls 之前設定
    camera.position.set(0, -20, 20);
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.rotateSpeed = 0.85;
    controls.minDistance = 1.2;
    controls.maxDistance = 220;

    // ---------- 光源 ----------
    // 半球光（柔和的環境光）＋太陽模式：太陽本身是點光源（行星朝太陽的一面亮、背面暗）；
    // 地球模式：一盞斜照、會投影的方向光當作陽光（地球的影子落在軌道面上，衛星經過時也會變暗）
    const hemi = new THREE.HemisphereLight(0xffffff, 0x666666, 0.8);
    hemi.position.set(0, 0, 1);
    scene.add(hemi);
    const sunLight = new THREE.PointLight(0xffffff, 2.6, 0, 0); // decay = 0：亮度不隨距離衰減
    scene.add(sunLight);
    const SUN_DIR = new THREE.Vector3(-0.55, 0.42, 0.72).normalize();
    const dirLight = new THREE.DirectionalLight(0xffffff, 2.6);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(1024, 1024);
    dirLight.shadow.radius = 3;
    dirLight.shadow.bias = -0.0004;
    scene.add(dirLight);
    scene.add(dirLight.target);
    // 接收地球影子的軌道面（只畫影子，不蓋住格線）
    const shadowCatcher = new THREE.Mesh(new THREE.CircleGeometry(GRID_R, 96), new THREE.ShadowMaterial({ opacity: 0.3, depthWrite: false }));
    shadowCatcher.receiveShadow = true;
    shadowCatcher.position.z = -0.003;
    shadowCatcher.renderOrder = 1;
    scene.add(shadowCatcher);

    // ---------- 共用工具 ----------
    let U = R3 / state.view;   // 場景單位 / 公尺
    let narrow = false, TH = 1; // 手機畫面：線與箭頭加粗一些
    let cw = 300, ch = 200;
    let colorVer = 0;
    let coneOn = !!B.coneOn;
    const col = function (c) { return new THREE.Color(C[c] || c || '#888888'); };
    const isDark = function () { return !!C.dark; };
    function rnd(seed) { let s = seed; return function () { s = (s * 16807) % 2147483647; return s / 2147483647; }; }

    function disposeObject(obj) {
      obj.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) {
            if (m.map && !m.map.userData.shared) m.map.dispose();
            m.dispose();
          });
        }
      });
    }

    /** 平面曲線（場景座標 [[x, y], …]，位於 z0）的管狀網格頂點與法向量，寫入 pos／nor 的第 off 個頂點起 */
    function fillTube(pos, nor, pts, radiusAt, radial, closed, z0, off) {
      const n = pts.length;
      for (let i = 0; i < n; i++) {
        let i0 = i - 1, i1 = i + 1;
        if (closed) { if (i0 < 0) i0 = n - 2; if (i1 > n - 1) i1 = 1; } else { if (i0 < 0) i0 = 0; if (i1 > n - 1) i1 = n - 1; }
        let tx = pts[i1][0] - pts[i0][0], ty = pts[i1][1] - pts[i0][1];
        const L = Math.hypot(tx, ty) || 1;
        tx /= L; ty /= L;
        const nx = ty, ny = -tx; // 面內、垂直於切線
        const r = radiusAt(i, n);
        for (let j = 0; j < radial; j++) {
          const a = j / radial * TAU, c = Math.cos(a), s = Math.sin(a);
          const k = 3 * (off + i * radial + j);
          pos[k] = pts[i][0] + r * c * nx; pos[k + 1] = pts[i][1] + r * c * ny; pos[k + 2] = z0 + r * s;
          nor[k] = c * nx; nor[k + 1] = c * ny; nor[k + 2] = s;
        }
      }
    }
    function tubeIndex(idx, ioff, voff, n, radial) {
      let q = ioff;
      for (let i = 0; i < n - 1; i++) {
        for (let j = 0; j < radial; j++) {
          const a = voff + i * radial + j, b = voff + i * radial + (j + 1) % radial, c = a + radial, d = b + radial;
          idx[q++] = a; idx[q++] = c; idx[q++] = b;
          idx[q++] = b; idx[q++] = c; idx[q++] = d;
        }
      }
      return q;
    }
    /** 多條平面曲線合成一個管狀幾何：paths = [{ pts, closed }] */
    function tubeGeo(paths, radius, radial, z0) {
      radial = radial || RAD;
      let nv = 0, ni = 0;
      paths.forEach(function (p) { if (p.pts.length > 1) { nv += p.pts.length * radial; ni += (p.pts.length - 1) * radial * 6; } });
      const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3);
      const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
      let voff = 0, ioff = 0;
      const rf = typeof radius === 'function' ? radius : function () { return radius; };
      paths.forEach(function (p) {
        if (p.pts.length < 2) return;
        fillTube(pos, nor, p.pts, rf, radial, p.closed, z0 || 0, voff);
        ioff = tubeIndex(idx, ioff, voff, p.pts.length, radial);
        voff += p.pts.length * radial;
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      g.setIndex(new THREE.BufferAttribute(idx, 1));
      g.computeBoundingSphere();
      return g;
    }
    /** 把折線切成虛線段（場景長度 dash／gap） */
    function dashPaths(pts, dash, gap) {
      const out = [];
      let cur = null, on = true, left = dash; // left：目前這一段（實線或空白）還剩的長度
      for (let i = 0; i < pts.length - 1; i++) {
        const p = pts[i], q = pts[i + 1];
        const L = Math.hypot(q[0] - p[0], q[1] - p[1]);
        if (!(L > 0)) continue;
        const at = function (u) { return [p[0] + (q[0] - p[0]) * u / L, p[1] + (q[1] - p[1]) * u / L]; };
        const add = function (u0, u1) {
          if (!cur) { cur = [at(u0)]; out.push(cur); }
          cur.push(at(u1));
        };
        let u = 0;
        // 每次換段 u 至少前進 min(dash, gap)，一定會結束（不用取餘數，避免浮點誤差卡住）
        for (;;) {
          const toEnd = L - u;
          if (left >= toEnd) { if (on) add(u, L); left -= toEnd; break; }
          if (on) add(u, u + left);
          u += left;
          on = !on;
          left = on ? dash : gap;
          if (!on) cur = null;
        }
      }
      return out.filter(function (c) { return c.length > 1; }).map(function (c) { return { pts: c, closed: false }; });
    }
    function lineGeo(points) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
      return g;
    }
    function dashedLine(points, color, opacity, dash, gap) {
      const ln = new THREE.LineSegments(lineGeo(points), new THREE.LineDashedMaterial({ color: color, transparent: true, opacity: opacity, dashSize: dash, gapSize: gap, depthWrite: false }));
      ln.computeLineDistances();
      ln.renderOrder = 2;
      return ln;
    }
    function solidLine(points, color, opacity) {
      const ln = new THREE.LineSegments(lineGeo(points), new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: opacity, depthWrite: false }));
      ln.renderOrder = 2;
      return ln;
    }

    // 共用的柔和光暈貼圖（白色，用材質顏色著色）
    const glowTex = (function () {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const g = c.getContext('2d');
      const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.35, 'rgba(255,255,255,0.45)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 128, 128);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.userData.shared = true;
      return t;
    })();

    // ---------- 文字標籤（Sprite，固定像素大小；以 2D 畫布繪製，所以字體大小與簡體轉換和其他畫布一致） ----------
    function roundRect(g, x, y, w, h, r) {
      g.beginPath();
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
    }
    /**
     * parts：字串，或 [[文字, ''|'sub'|'it'], …]（sub = 下標，it = 斜體）；opt：{ size, box（預設 true）, weight }
     * box = true：半透明圓角底框；false：背景色描邊（halo）。
     */
    function label(parts, color, opt) {
      opt = opt || {};
      if (typeof parts === 'string') parts = [[parts, '']];
      const size = (opt.size || (narrow ? 11 : 12)) * RES;
      const w8 = opt.weight || 600;
      const fMain = w8 + ' ' + size + 'px ' + FONT;
      const fIt = 'italic 700 ' + Math.round(size * 1.08) + 'px ' + FONT;
      const fSub = w8 + ' ' + Math.round(size * 0.74) + 'px ' + FONT;
      const fontOf = function (p) { return p[1] === 'sub' ? fSub : p[1] === 'it' ? fIt : fMain; };
      const c = document.createElement('canvas');
      let g = c.getContext('2d');
      const ws = parts.map(function (p) { g.font = fontOf(p); return g.measureText(p[0]).width; });
      g.font = fMain;
      const m = g.measureText('Hg');
      // 實際字高（settings.js 會依「字體大小」放大畫布字級，所以用量出來的高度）
      const fh = m.fontBoundingBoxAscent > 0 ? m.fontBoundingBoxAscent + m.fontBoundingBoxDescent : size * 1.25;
      const fsz = fh / 1.25;
      const box = opt.box !== false;
      const padX = (box ? 6 : 4) * RES, padY = (box ? 1.5 : 3) * RES;
      const tw = ws.reduce(function (a, b) { return a + b; }, 0);
      c.width = Math.ceil(tw + 2 * padX);
      c.height = Math.ceil(fh + 2 * padY);
      g = c.getContext('2d');
      if (box) {
        roundRect(g, RES * 0.5, RES * 0.5, c.width - RES, c.height - RES, (c.height - RES) / 2);
        g.fillStyle = B.alpha(C['canvas-bg'], isDark() ? 0.84 : 0.88);
        g.fill();
        g.strokeStyle = B.alpha(color, isDark() ? 0.45 : 0.35);
        g.lineWidth = RES;
        g.stroke();
      }
      g.textBaseline = 'middle';
      g.textAlign = 'left';
      g.lineJoin = 'round';
      let x = padX;
      parts.forEach(function (p, i) {
        g.font = fontOf(p);
        const y = c.height / 2 + (p[1] === 'sub' ? fsz * 0.28 : 0);
        if (!box) {
          g.lineWidth = 4 * RES;
          g.strokeStyle = B.alpha(C['canvas-bg'], 0.92);
          g.strokeText(p[0], x, y);
        }
        g.fillStyle = color;
        g.fillText(p[0], x, y);
        x += ws[i];
      });
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      // 標籤一律畫在最上層，大小固定（不隨遠近縮放）
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false }));
      sp.userData.lw = c.width / RES;
      sp.userData.lh = c.height / RES;
      sp.userData.isLabel = true;
      sp.userData.inPlane = opt.inPlane !== false; // 軌道面上的標籤：幾乎從側面看時淡出（否則全部疊在一條線上）
      // 重要度：2 有框的主要標籤（永遠顯示）、1 斜體字母（a、r、v、h）、0 次要（距離刻度、v圓/v脫、「軌道面」）。
      // 較不重要的標籤與較重要的標籤或 HUD 重疊時隱藏（窄螢幕上才不會疊成一團）
      sp.userData.prio = opt.prio != null ? opt.prio : box ? 2 : 1;
      sp.renderOrder = 20;
      fitLabel(sp);
      return sp;
    }
    function fitLabel(sp) {
      const k = 2 * Math.tan(camera.fov * Math.PI / 360) / Math.max(1, ch);
      sp.scale.set(sp.userData.lw * k, sp.userData.lh * k, 1);
    }
    function sizeLabels() { scene.traverse(function (o) { if (o.userData && o.userData.isLabel) fitLabel(o); }); }
    /** 標籤放在錨點的 (dx, dy) 方向（螢幕像素方向，y 向上），標籤邊緣離錨點 gap 像素 */
    function anchorLabel(sp, dx, dy, gap) {
      const L = Math.hypot(dx, dy);
      if (!(L > 1e-6)) { dx = 0; dy = 1; } else { dx /= L; dy /= L; }
      gap = gap == null ? 8 : gap;
      const lw = sp.userData.lw, lh = sp.userData.lh;
      sp.center.set(0.5 - dx * (lw / 2 + gap) / lw, 0.5 - dy * (lh / 2 + gap) / lh);
      sp.userData.anchored = true;
    }
    const pA = new THREE.Vector3(), pB = new THREE.Vector3();
    /** 兩個場景點在螢幕上的方向（像素，y 向上） */
    function screenDir(from, to) {
      pA.copy(from).project(camera);
      pB.copy(to).project(camera);
      return [(pB.x - pA.x) * cw / 2, (pB.y - pA.y) * ch / 2];
    }

    // ---------- 圖層：每一層有自己的鍵，鍵改變（參數、顏色、視野改變）才重建幾何 ----------
    const layers = {};
    function layer(name, key, build) {
      let L = layers[name];
      if (!L) L = layers[name] = { key: null, obj: null, anchors: [], ref: {} };
      if (L.key === key) return L;
      if (L.obj) { scene.remove(L.obj); disposeObject(L.obj); }
      L.key = key;
      L.anchors = [];
      L.ref = {};
      L.obj = key === 'off' ? null : build(L);
      if (L.obj) scene.add(L.obj);
      return L;
    }

    // ---- 星空（固定亂數；跟著相機移動，看起來在無限遠） ----
    function buildStars() {
      const grp = new THREE.Group();
      const r = rnd(20261111);
      const dark = isDark();
      const base = col(dark ? 'text' : 'muted');
      [[700, dark ? 1.4 : 1.2, dark ? 0.55 : 0.28], [140, dark ? 2.3 : 1.8, dark ? 0.85 : 0.4]].forEach(function (cfg) {
        const n = cfg[0], pos = new Float32Array(n * 3), colr = new Float32Array(n * 4);
        for (let i = 0; i < n; i++) {
          const z = 2 * r() - 1, a = r() * TAU, s = Math.sqrt(1 - z * z);
          pos[3 * i] = 900 * s * Math.cos(a); pos[3 * i + 1] = 900 * s * Math.sin(a); pos[3 * i + 2] = 900 * z;
          const tint = r();
          colr[4 * i] = base.r * (0.9 + 0.1 * tint); colr[4 * i + 1] = base.g; colr[4 * i + 2] = base.b * (0.92 + 0.08 * (1 - tint));
          colr[4 * i + 3] = cfg[2] * (0.25 + 0.75 * r());
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        g.setAttribute('color', new THREE.BufferAttribute(colr, 4));
        const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: cfg[1], sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false }));
        pts.renderOrder = -1;
        pts.frustumCulled = false;
        grp.add(pts);
      });
      return grp;
    }

    // ---- 軌道面：放射狀漸淡的底色、距離圈（虛線）、方位線、距離標示 ----
    let planeTex = null;
    function buildPlane(L) {
      const grp = new THREE.Group();
      const dark = isDark();
      if (!planeTex) {
        const c = document.createElement('canvas');
        c.width = c.height = 256;
        const g = c.getContext('2d');
        const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
        gr.addColorStop(0, 'rgba(255,255,255,1)');
        gr.addColorStop(0.55, 'rgba(255,255,255,0.75)');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr;
        g.fillRect(0, 0, 256, 256);
        planeTex = new THREE.CanvasTexture(c);
        planeTex.colorSpace = THREE.SRGBColorSpace;
        planeTex.userData.shared = true;
      }
      const disc = new THREE.Mesh(new THREE.CircleGeometry(GRID_R, 96),
        new THREE.MeshBasicMaterial({ map: planeTex, color: col('accent'), transparent: true, opacity: dark ? 0.12 : 0.085, depthWrite: false, side: THREE.DoubleSide }));
      disc.renderOrder = 0;
      grp.add(disc);
      // 距離圈：間距與 2D 相同
      const Lu = B.P().Lu;
      const stepM = B.niceStep(state.view / Lu / 2.6) * Lu, step = stepM * U;
      const textC = col('text');
      for (let i = 1, r = step; r < GRID_R; i++, r += step) {
        const pts = [];
        for (let j = 0; j <= 160; j++) { const a = j / 160 * TAU; pts.push(r * Math.cos(a), r * Math.sin(a), 0); }
        const fade = 1 - Math.max(0, (r - 0.7 * GRID_R) / (0.3 * GRID_R));
        const ln = new THREE.Line(lineGeo(pts), new THREE.LineDashedMaterial({ color: textC, transparent: true, opacity: (i % 2 ? 0.16 : 0.24) * fade * (dark ? 1 : 1.1), dashSize: 0.07 * TH, gapSize: 0.16 * TH, depthWrite: false }));
        ln.computeLineDistances();
        ln.renderOrder = 2;
        grp.add(ln);
        if (r < 1.18 * R3) {
          const txt = B.isSun() ? B.sig(r / U / B.K.AU) + ' AU' : B.group(r / U / 1000) + ' km';
          const lb = label(txt, B.alpha(C.muted, 0.95), { box: false, size: narrow ? 10 : 11, weight: 500, prio: 0 });
          lb.position.set(r * Math.cos(2.35), r * Math.sin(2.35), 0);
          lb.center.set(1.04, -0.05);
          grp.add(lb);
        }
      }
      // 方位線（每 30°），往外漸淡
      const sp = [], sc = [];
      const c0 = col('text');
      for (let j = 0; j < 12; j++) {
        const a = j * TAU / 12, ca = Math.cos(a), sa = Math.sin(a);
        sp.push(0.6 * ca, 0.6 * sa, 0, GRID_R * ca, GRID_R * sa, 0);
        sc.push(c0.r, c0.g, c0.b, dark ? 0.13 : 0.11, c0.r, c0.g, c0.b, 0);
      }
      const sg = lineGeo(sp);
      sg.setAttribute('color', new THREE.Float32BufferAttribute(sc, 4));
      const spokes = new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
      spokes.renderOrder = 2;
      grp.add(spokes);
      // 預設視角下落在畫面左下（右下角有 HUD 的比例說明）
      const pl = label(T('軌道面', 'Orbital plane'), B.alpha(C.muted, 0.95), { box: false, size: narrow ? 11 : 12, inPlane: false, prio: 0 });
      pl.position.set(0.9 * GRID_R * Math.cos(-2.2), 0.9 * GRID_R * Math.sin(-2.2), 0);
      grp.add(pl);
      L.anchors.push({ sp: pl, fixed: [0, 1], gap: 2 });
      return grp;
    }

    // ---- 中心天體：太陽（自己發光，邊緣較暗）或地球（依比例，自轉，會投影） ----
    let earthMesh = null;
    function buildCentral() {
      const grp = new THREE.Group();
      const dark = isDark();
      earthMesh = null;
      if (B.isSun()) {
        const Rs = Math.max(K.R_SUN * U, 0.36 * TH);
        // 太陽：自製著色器做「臨邊昏暗」（中心亮、邊緣偏橙），不受光照影響
        const mat = new THREE.ShaderMaterial({
          uniforms: { cCore: { value: new THREE.Color(B.shade(C.equi, 0.78)) }, cMid: { value: new THREE.Color(B.shade(C.equi, dark ? 0.2 : 0.3)) }, cEdge: { value: col('b-mech') } },
          vertexShader: 'varying vec3 vN;\nvarying vec3 vV;\nvoid main() {\n  vec4 mv = modelViewMatrix * vec4(position, 1.0);\n  vN = normalize(normalMatrix * normal);\n  vV = normalize(-mv.xyz);\n  gl_Position = projectionMatrix * mv;\n}',
          fragmentShader: 'uniform vec3 cCore;\nuniform vec3 cMid;\nuniform vec3 cEdge;\nvarying vec3 vN;\nvarying vec3 vV;\nvoid main() {\n  float m = clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0);\n  vec3 c = mix(cEdge, cMid, smoothstep(0.0, 0.6, m));\n  c = mix(c, cCore, smoothstep(0.55, 1.0, m));\n  gl_FragColor = vec4(c, 1.0);\n  #include <colorspace_fragment>\n}'
        });
        const sun = new THREE.Mesh(new THREE.SphereGeometry(Rs, 48, 32), mat);
        grp.add(sun);
        // 光暈（與 2D 相同：約 4.2 倍半徑）
        const c = document.createElement('canvas');
        c.width = c.height = 256;
        const g = c.getContext('2d');
        const gr = g.createRadialGradient(128, 128, 128 / 4.2 * 0.5, 128, 128, 128);
        gr.addColorStop(0, B.alpha(C.equi, dark ? 0.6 : 0.45));
        gr.addColorStop(0.4, B.alpha(C['b-mech'], dark ? 0.17 : 0.11));
        gr.addColorStop(1, B.alpha(C['b-mech'], 0));
        g.fillStyle = gr;
        g.fillRect(0, 0, 256, 256);
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
        glow.scale.set(8.4 * Rs, 8.4 * Rs, 1);
        glow.renderOrder = 7;
        grp.add(glow);
      } else {
        const Re = Math.max(K.R_EARTH * U, 0.12);
        const geo = new THREE.SphereGeometry(Re, 72, 44);
        geo.rotateX(Math.PI / 2); // 兩極在 ±z（軌道面畫成赤道面）
        const earth = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: earthTexture(), roughness: 0.78, metalness: 0 }));
        earth.castShadow = true;
        grp.add(earth);
        earthMesh = earth;
        // 大氣光暈（與 2D 相同的顏色）；畫在地球中心的平面上，被地球前半球擋住，只露出邊緣的光環
        const c = document.createElement('canvas');
        c.width = c.height = 256;
        const g = c.getContext('2d');
        const k = 1 / 1.3;             // 地球半徑／光暈半徑
        const r0 = 0.9 * k;            // 漸層由 0.9 倍地球半徑開始
        const gr = g.createRadialGradient(128, 128, 128 * r0, 128, 128, 128);
        gr.addColorStop(0, B.alpha(C['b-wave'], 0));
        gr.addColorStop((k - r0) / (1 - r0), B.alpha(C['b-wave'], dark ? 0.5 : 0.34)); // 最亮處在地球邊緣
        gr.addColorStop(1, B.alpha(C['b-wave'], 0));
        g.fillStyle = gr;
        g.fillRect(0, 0, 256, 256);
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        const atm = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
        atm.scale.set(2.6 * Re, 2.6 * Re, 1);
        atm.renderOrder = 7;
        grp.add(atm);
        // 陽光的影子範圍：只需要涵蓋地球附近
        const sc = dirLight.shadow.camera;
        sc.left = -2.6 * Re; sc.right = 2.6 * Re; sc.bottom = -2.6 * Re; sc.top = 2.6 * Re;
        sc.near = 0.5; sc.far = 40 + 8 * Re;
        sc.updateProjectionMatrix();
        dirLight.position.copy(SUN_DIR).multiplyScalar(20 + 4 * Re);
      }
      const sun = B.isSun();
      sunLight.visible = sun;
      dirLight.visible = !sun;
      shadowCatcher.visible = !sun;
      shadowCatcher.material.opacity = isDark() ? 0.5 : 0.22;
      hemi.intensity = sun ? (isDark() ? 0.55 : 1.0) : (isDark() ? 0.45 : 0.9);
      hemi.groundColor.copy(col('canvas-bg')).lerp(col('text'), 0.35);
      return grp;
    }
    /** 地球貼圖（等距圓柱投影）：海洋與陸地用 2D 地球的顏色，陸地形狀是固定亂數的斑塊（純裝飾） */
    function earthTexture() {
      const c = document.createElement('canvas');
      c.width = 1024; c.height = 512;
      const g = c.getContext('2d');
      const dark = isDark();
      const ocean = C['b-em'];
      const og = g.createLinearGradient(0, 0, 0, 512);
      og.addColorStop(0, B.shade(ocean, -0.4));
      og.addColorStop(0.5, B.shade(ocean, dark ? 0 : 0.1));
      og.addColorStop(1, B.shade(ocean, -0.4));
      g.fillStyle = og;
      g.fillRect(0, 0, 1024, 512);
      const r = rnd(4242);
      const land = B.shade(C.probe, dark ? -0.1 : 0.05), land2 = B.shade(C.probe, dark ? -0.35 : -0.2);
      const blob = function (x, y, rx, ry, rot, color) {
        [-1024, 0, 1024].forEach(function (dx) {
          g.fillStyle = color;
          g.beginPath(); g.ellipse(x + dx, y, rx, ry, rot, 0, TAU); g.fill();
        });
      };
      [[180, 170, 1.3], [300, 340, 1.0], [520, 150, 1.2], [560, 300, 1.1], [760, 160, 1.6], [860, 360, 0.8], [960, 250, 0.5]].forEach(function (ct) {
        const n = Math.round(22 * ct[2]);
        for (let i = 0; i < n; i++) {
          const a = r() * TAU, d = r() * 70 * ct[2];
          blob(ct[0] + Math.cos(a) * d, ct[1] + Math.sin(a) * d * 0.7, 14 + r() * 34 * ct[2], 10 + r() * 24 * ct[2], r() * Math.PI, i % 3 ? land : land2);
        }
      });
      // 極冠與淡淡的雲帶
      g.fillStyle = 'rgba(255,255,255,0.85)';
      for (let x = 0; x < 1024; x += 24) {
        g.beginPath(); g.ellipse(x, 0, 30, 22 + 10 * r(), 0, 0, TAU); g.fill();
        g.beginPath(); g.ellipse(x, 512, 30, 26 + 12 * r(), 0, 0, TAU); g.fill();
      }
      g.fillStyle = 'rgba(255,255,255,' + (dark ? 0.18 : 0.26) + ')';
      for (let i = 0; i < 60; i++) blob(r() * 1024, 90 + r() * 330, 40 + r() * 90, 4 + r() * 6, (r() - 0.5) * 0.3, g.fillStyle);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      return t;
    }

    // ---- 軌道曲線（與 2D 相同：依真近點角取樣，只取 r ≤ RMAX 的部分） ----
    function orbitPts(el, n) {
      return B.conicPts(el, RMAX / U, n || 480).map(function (p) { return [p[0] * U, p[1] * U]; });
    }
    function isClosed3(el) {
      if (!(el.e < 1) || el.type === 'parabola') return false;
      const rg = K.nuRange(el, RMAX / U);
      return !!rg && rg[1] >= Math.PI;
    }
    function orbitMat(colorKey) {
      const c = col(B.col(colorKey));
      return new THREE.MeshStandardMaterial({ color: c, roughness: 0.4, metalness: 0.1, emissive: c, emissiveIntensity: isDark() ? 0.32 : 0.16 });
    }
    // 飛行中的軌道：實心管子
    function buildOrbit() {
      const f = state.flight;
      const pts = orbitPts(f.el);
      if (pts.length < 2) return null;
      const m = new THREE.Mesh(tubeGeo([{ pts: pts, closed: isClosed3(f.el) }], 0.042 * TH, RAD), orbitMat(f.color));
      m.renderOrder = 3;
      return m;
    }
    // 預測軌道：虛線管子（與 2D 的虛線相同意義）
    function buildPreview() {
      const pts = orbitPts(B.preview().el);
      if (pts.length < 2) return null;
      const m = new THREE.Mesh(tubeGeo(dashPaths(pts, 0.26 * TH, 0.2 * TH), 0.02 * TH, 6),
        new THREE.MeshBasicMaterial({ color: col('text'), transparent: true, opacity: isDark() ? 0.62 : 0.55, depthWrite: false }));
      m.renderOrder = 5;
      return m;
    }
    // 之前的軌道（殘影）
    const ghostId = new WeakMap();
    let ghostSeq = 0;
    function ghostKey() {
      return state.ghosts.map(function (g) { if (!ghostId.has(g)) ghostId.set(g, ++ghostSeq); return ghostId.get(g); }).join(',');
    }
    function buildGhosts() {
      const grp = new THREE.Group();
      const dark = isDark();
      state.ghosts.forEach(function (gh) {
        const pts = orbitPts(gh.el, 300);
        if (pts.length < 2) return;
        const c = col(B.col(gh.color));
        const mat = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: dark ? 0.45 : 0.4, depthWrite: false });
        const m = new THREE.Mesh(tubeGeo([{ pts: pts, closed: isClosed3(gh.el) }], 0.014 * TH, 6), mat);
        m.renderOrder = 5;
        grp.add(m);
        const s = K.stateAt(gh.el, 0);
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.06 * TH, 12, 8), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.65 }));
        dot.position.set(s.x * U, s.y * U, 0);
        grp.add(dot);
      });
      return grp;
    }

    // ---- 等時間扇形（克卜勒第二定律）：軌道面上的半透明扇形，目前所在的扇形較亮 ----
    function buildSectors(L) {
      const main = B.mainOrbit(), el = main.el;
      const list = B.sectorTimes(main);
      const n = 40, N = list.length;
      const pos = new Float32Array(N * (n + 2) * 3), colr = new Float32Array(N * (n + 2) * 4), idx = [];
      const ep = [], ec = [];
      const cA = col('accent'), cB = col('b-optics');
      const z = 0.004;
      list.forEach(function (s, i) {
        const u1 = K.anomalyAt(el, s.t1), u2 = K.anomalyAt(el, s.t2);
        const v0 = i * (n + 2);
        pos[3 * v0] = 0; pos[3 * v0 + 1] = 0; pos[3 * v0 + 2] = z;
        for (let j = 0; j <= n; j++) {
          const p = K.positionAtAnomaly(el, u1 + (u2 - u1) * j / n);
          const k = 3 * (v0 + 1 + j);
          pos[k] = p.x * U; pos[k + 1] = p.y * U; pos[k + 2] = z;
          if (j < n) idx.push(v0, v0 + 1 + j, v0 + 2 + j);
        }
        const cc = i % 2 ? cB : cA;
        for (let j = 0; j < n + 2; j++) { const k = 4 * (v0 + j); colr[k] = cc.r; colr[k + 1] = cc.g; colr[k + 2] = cc.b; colr[k + 3] = 0; }
        // 扇形兩側的半徑（從焦點出發）
        const pa = K.positionAtAnomaly(el, u1), pb = K.positionAtAnomaly(el, u2);
        ep.push(0, 0, z, pa.x * U, pa.y * U, z, 0, 0, z, pb.x * U, pb.y * U, z);
        for (let j = 0; j < 4; j++) ec.push(cc.r, cc.g, cc.b, 0);
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(colr, 4));
      g.setIndex(idx);
      const fans = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
      fans.renderOrder = 3;
      const eg = lineGeo(ep);
      eg.setAttribute('color', new THREE.Float32BufferAttribute(ec, 4));
      const edges = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
      edges.renderOrder = 3;
      const grp = new THREE.Group();
      grp.add(fans, edges);
      L.ref = { fans: fans, edges: edges, n: n, N: N, cur: null };
      // 兩塊代表性的面積（與 2D 相同：近心點旁與遠心點旁；手機只列在下方的表格）
      if (!narrow) {
        const closed = el.e < 1 && el.type !== 'parabola';
        (closed ? [1, N / 2 + 1] : [N / 2 + 2]).forEach(function (i) {
          const s = list[i];
          if (!s) return;
          const q = K.stateAt(el, (s.t1 + s.t2) / 2);
          const far = q.r * U > 2.4;
          const lb = label([['A', ''], [String(i + 1), 'sub'], [' = ' + B.fmtArea(s.area), '']], B.shade(i % 2 ? C['b-optics'] : C.accent, isDark() ? 0.2 : -0.2), { size: narrow ? 10 : 11 });
          const at = new THREE.Vector3(q.x * U * (far ? 0.6 : 1), q.y * U * (far ? 0.6 : 1), z);
          lb.position.copy(at);
          grp.add(lb);
          if (!far) L.anchors.push({ sp: lb, from: new THREE.Vector3(0, 0, 0), at: at, gap: 14 });
        });
      }
      return grp;
    }
    function shadeSectors(cur) {
      const R = layers.sectors && layers.sectors.ref;
      if (!R || !R.fans || R.cur === cur) return;
      R.cur = cur;
      const dark = isDark();
      const ca = R.fans.geometry.attributes.color, cl = R.edges.geometry.attributes.color;
      for (let i = 0; i < R.N; i++) {
        const a = (i === cur ? 0.34 : 0.15) * (dark ? 1.15 : 1);
        for (let j = 0; j < R.n + 2; j++) ca.array[4 * (i * (R.n + 2) + j) + 3] = a;
        const e = i === cur ? 0.75 : 0.32;
        for (let j = 0; j < 4; j++) cl.array[4 * (i * 4 + j) + 3] = e;
      }
      ca.needsUpdate = true;
      cl.needsUpdate = true;
    }

    // ---- 近日點、遠日點、半長軸 a、中心與另一個焦點；雙曲線畫漸近線（與 2D 相同） ----
    function diamond(color, r) {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(r, 0), new THREE.MeshStandardMaterial({ color: color, roughness: 0.35, metalness: 0.1, emissive: color, emissiveIntensity: 0.25, flatShading: true }));
      m.renderOrder = 4;
      return m;
    }
    function buildAxes(L) {
      const el = B.mainOrbit().el;
      if (el.type === 'circle' || el.e < 1e-4) return null;
      const grp = new THREE.Group();
      const names = B.apsisNames();
      const rot = function (xp, yp) {
        const yq = el.dir * yp, c = Math.cos(el.omega), s = Math.sin(el.omega);
        return new THREE.Vector3((c * xp - s * yq) * U, (s * xp + c * yq) * U, 0);
      };
      const ux = Math.cos(el.omega), uy = Math.sin(el.omega);
      const peri = new THREE.Vector3(el.rp * ux * U, el.rp * uy * U, 0);
      const textC = col('text');
      const O = new THREE.Vector3();
      const font = { size: narrow ? 11 : 12 };
      if (el.e < 1 && el.type !== 'parabola') {
        const a = el.a, e = el.e;
        const ctr = rot(-a * e, 0), f2 = rot(-2 * a * e, 0), apo = rot(-a * (1 + e), 0), cb = rot(-a * e, el.b);
        grp.add(dashedLine([apo.x, apo.y, 0, peri.x, peri.y, 0, ctr.x, ctr.y, 0, cb.x, cb.y, 0], textC, 0.3, 0.12 * TH, 0.16 * TH));
        grp.add(solidLine([ctr.x, ctr.y, 0, peri.x, peri.y, 0], textC, 0.55));
        if (a * U > 1) {
          const al = label([['a', 'it']], C.text, { box: false, size: narrow ? 12 : 13 });
          const mid = ctr.clone().add(peri).multiplyScalar(0.5);
          al.position.copy(mid);
          grp.add(al);
          L.anchors.push({ sp: al, perpOf: [ctr, peri], side: -el.dir, at: mid, gap: 4 });
        }
        const cdot = new THREE.Mesh(new THREE.SphereGeometry(0.05 * TH, 12, 8), new THREE.MeshBasicMaterial({ color: textC, transparent: true, opacity: 0.55 }));
        cdot.position.copy(ctr);
        grp.add(cdot);
        if (e > 0.02) {
          const s = 0.13 * TH;
          grp.add(solidLine([f2.x - s, f2.y - s, 0, f2.x + s, f2.y + s, 0, f2.x - s, f2.y + s, 0, f2.x + s, f2.y - s, 0], textC, 0.7));
          if (2 * a * e * U > 2 && el.rp * U > 2.3) {
            const fl = label(T('另一焦點', 'Empty focus'), C.muted, { size: narrow ? 10 : 11 });
            fl.position.copy(f2);
            grp.add(fl);
            L.anchors.push({ sp: fl, fixed: [0, -1], gap: 8 });
          }
        }
        if (apo.length() < RMAX) {
          const d = diamond(col('neg'), 0.15 * TH);
          d.position.copy(apo);
          grp.add(d);
          const lb = label(names[1] + ' ' + B.fmtDist(el.ra), C.neg, font);
          lb.position.copy(apo);
          grp.add(lb);
          L.anchors.push({ sp: lb, from: O, at: apo, gap: 10 });
        }
      } else if (el.type !== 'parabola') {
        const A = -el.a, ctr = rot(A * el.e, 0);
        const th = Math.acos(-1 / el.e), Lm = 1.3 * RMAX;
        const pts = [];
        [1, -1].forEach(function (sg) {
          const d = rot(Math.cos(th), sg * Math.sin(th)).normalize();
          pts.push(ctr.x, ctr.y, 0, ctr.x + d.x * Lm, ctr.y + d.y * Lm, 0);
        });
        grp.add(dashedLine(pts, textC, 0.3, 0.12 * TH, 0.16 * TH));
        grp.add(solidLine([ctr.x, ctr.y, 0, peri.x, peri.y, 0], textC, 0.55));
        if (A * U > 0.8) {
          const al = label([['|a|', 'it']], C.text, { box: false, size: narrow ? 12 : 13 });
          const mid = ctr.clone().add(peri).multiplyScalar(0.5);
          al.position.copy(mid);
          grp.add(al);
          L.anchors.push({ sp: al, perpOf: [ctr, peri], side: -1, at: mid, gap: 4 });
        }
      }
      const d = diamond(col('pos'), 0.15 * TH);
      d.position.copy(peri);
      grp.add(d);
      const lb = label(names[0] + ' ' + B.fmtDist(el.rp), C.pos, font);
      lb.position.copy(peri);
      grp.add(lb);
      L.anchors.push({ sp: lb, from: O, at: peri, gap: 10 });
      return grp;
    }

    // ---- 向量箭頭（圓柱＋圓錐；幾何與 2D 一致：箭頭長 ≈ 4 倍箭身寬、半寬 ≈ 1.7 倍箭身寬） ----
    const Y_AXIS = new THREE.Vector3(0, 1, 0);
    function makeArrow(colorKey) {
      const mat = new THREE.MeshStandardMaterial({ color: col(colorKey), roughness: 0.38, metalness: 0.05, emissive: col(colorKey), emissiveIntensity: 0.22, transparent: true, opacity: 1 });
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 14), mat);
      const head = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 22), mat);
      const g = new THREE.Group();
      g.add(shaft, head);
      g.userData = { shaft: shaft, head: head, mat: mat, colorKey: colorKey };
      g.renderOrder = 6;
      return g;
    }
    function setArrow(a, origin, dir, len, w) {
      const hl = Math.min(len * 0.45, 8 * w), hr = 3.4 * w, sl = Math.max(1e-4, len - hl * 0.8);
      const u = a.userData;
      u.shaft.scale.set(w, sl, w);
      u.shaft.position.set(0, sl / 2, 0);
      u.head.scale.set(hr, hl, hr);
      u.head.position.set(0, len - hl / 2, 0);
      a.position.copy(origin);
      a.quaternion.setFromUnitVectors(Y_AXIS, dir);
    }
    const VSCALE = function () { return 0.8 * R3 / (B.P().v0.max * 1000); }; // 場景單位 / (m/s)：與 2D 箭頭相同比例

    // ---- 發射點、發射速度箭頭、圓周速率圈與脫離速率圈（與 2D 相同） ----
    function buildLauncher(L) {
      const grp = new THREE.Group();
      const s = B.launchVec();
      const o = new THREE.Vector3(s.x * U, s.y * U, 0);
      const kv = VSCALE();
      const v0 = state.v0;
      const ring = function (r, colorKey) {
        const pts = [];
        for (let j = 0; j <= 128; j++) { const a = j / 128 * TAU; pts.push(o.x + r * Math.cos(a), o.y + r * Math.sin(a), 0.002); }
        const ln = new THREE.Line(lineGeo(pts), new THREE.LineDashedMaterial({ color: col(colorKey), transparent: true, opacity: 0.6, dashSize: 0.13 * TH, gapSize: 0.13 * TH, depthWrite: false }));
        ln.computeLineDistances();
        ln.renderOrder = 2;
        grp.add(ln);
      };
      const rc = B.vCirc0() * kv, re = B.vEsc0() * kv;
      ring(rc, 'accent');
      ring(re, 'b-mech');
      const ux = s.vx / v0, uy = s.vy / v0;
      if (!narrow) {
        const base = Math.atan2(uy, ux) + Math.PI;
        [[rc, C.accent, T('圓', 'circ'), base - 0.5], [re, C['b-mech'], T('脫', 'esc'), base + 0.5]].forEach(function (d) {
          const lb = label([['v', ''], [d[2], 'sub']], d[1], { weight: 700, size: 11, prio: 0 });
          lb.position.set(o.x + d[0] * Math.cos(d[3]), o.y + d[0] * Math.sin(d[3]), 0);
          grp.add(lb);
        });
      }
      // 發射點：小球＋圓環
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.09 * TH, 16, 12), new THREE.MeshStandardMaterial({ color: col('canvas-bg'), roughness: 0.5 }));
      dot.position.copy(o);
      grp.add(dot);
      const tor = new THREE.Mesh(new THREE.TorusGeometry(0.15 * TH, 0.025 * TH, 8, 32), new THREE.MeshBasicMaterial({ color: col('text') }));
      tor.position.copy(o);
      grp.add(tor);
      // 發射速度箭頭
      const arr = makeArrow('pos');
      setArrow(arr, o, new THREE.Vector3(ux, uy, 0), v0 * kv, 0.045 * TH);
      grp.add(arr);
      L.ref.arrow = arr;
      // 速率標籤（等於 v圓 或 v脫 時加註）
      const parts = [['v', 'it'], ['0', 'sub'], [' = ' + B.num(v0 / 1000, 2) + ' km/s', '']];
      const rel = v0 / B.vCirc0();
      if (state.vSnap === 'circ' || Math.abs(rel - 1) < 1e-9) parts.push([' = v', ''], [T('圓', 'circ'), 'sub']);
      else if (state.vSnap === 'esc' || Math.abs(rel - Math.SQRT2) < 1e-9) parts.push([' = v', ''], [T('脫', 'esc'), 'sub']);
      const lb = label(parts, C.pos, { weight: 700 });
      const tip = new THREE.Vector3(o.x + ux * v0 * kv, o.y + uy * v0 * kv, 0);
      lb.position.copy(tip);
      grp.add(lb);
      L.anchors.push({ sp: lb, from: o, at: tip, gap: 10 });
      L.ref.label = lb;
      return grp;
    }

    // ---- 圓錐截痕（幾何輔助）：一個圓錐被軌道面截出的曲線，正好就是這條軌道 ----
    // Dandelin 球（半徑 ρ）在中心天體（焦點）與軌道面相切；在含長軸、垂直軌道面的剖面上，
    // 圓錐的兩條母線都與這個圓相切，並分別通過近心點與另一個頂點（橢圓的遠心點、雙曲線另一支的頂點；拋物線則平行於軌道面）。
    // 這樣得到的圓錐與軌道面的交線，頂點、離心率、焦點都與軌道相同（數值驗算誤差 < 10^-14）。
    let coneApex = null;
    function coneFor(el) {
      const rp = el.rp, e = el.e;
      const unit = function (x, y) { const L = Math.hypot(x, y); return [x / L, y / L]; };
      const meet = function (P, d1, Q, d2) { // P + s·d1 = Q + t·d2
        const det = -d1[0] * d2[1] + d2[0] * d1[1];
        const rx = Q[0] - P[0], ry = Q[1] - P[1];
        const s = (-rx * d2[1] + d2[0] * ry) / det;
        return [P[0] + s * d1[0], P[1] + s * d1[1]];
      };
      let V, g1, g2;
      if (e < 1 && el.type !== 'parabola') {
        const ra = el.ra, rho = 0.5 * Math.sqrt(rp * ra);
        const t1 = 2 * Math.atan(rho / rp), t2 = 2 * Math.atan(rho / ra);
        V = meet([rp, 0], [-Math.cos(t1), Math.sin(t1)], [-ra, 0], [Math.cos(t2), Math.sin(t2)]);
        g1 = unit(rp - V[0], -V[1]); g2 = unit(-ra - V[0], -V[1]);
      } else if (el.type === 'parabola') {
        const rho = 0.6 * rp, t1 = 2 * Math.atan(rho / rp);
        V = [rp - 2 * rho / Math.tan(t1), 2 * rho];
        g1 = unit(rp - V[0], -V[1]); g2 = [-1, 0];
      } else {
        const rho = 0.6 * rp, u2 = -el.a * (1 + e);
        const t1 = 2 * Math.atan(rho / rp), t2 = 2 * Math.atan(rho / u2);
        const d2 = [-Math.cos(t2), Math.sin(t2)];
        V = meet([rp, 0], [-Math.cos(t1), Math.sin(t1)], [u2, 0], d2);
        g1 = unit(rp - V[0], -V[1]); g2 = d2;
      }
      const d = unit(g1[0] + g2[0], g1[1] + g2[1]);
      const half = 0.5 * Math.acos(Math.max(-1, Math.min(1, g1[0] * g2[0] + g1[1] * g2[1])));
      return { V: V, d: d, half: half };
    }
    function buildCone(L) {
      const el = B.mainOrbit().el;
      const cn = coneFor(el);
      const pu = new THREE.Vector3(Math.cos(el.omega), Math.sin(el.omega), 0), nn = new THREE.Vector3(-Math.sin(el.omega), Math.cos(el.omega), 0);
      const V = pu.clone().multiplyScalar(cn.V[0] * U).add(new THREE.Vector3(0, 0, cn.V[1] * U));
      const d3 = pu.clone().multiplyScalar(cn.d[0]).add(new THREE.Vector3(0, 0, cn.d[1])).normalize();
      const e2 = new THREE.Vector3().crossVectors(d3, nn).normalize();
      const N = 160, tMax = 1.3 * RMAX;
      const ca = Math.cos(cn.half), sa = Math.sin(cn.half);
      const pos = [], rim = [];
      for (let i = 0; i <= N; i++) {
        const ph = i / N * TAU;
        const g = d3.clone().multiplyScalar(ca).addScaledVector(e2, sa * Math.cos(ph)).addScaledVector(nn, sa * Math.sin(ph));
        let t = tMax;
        if (g.z < -1e-9) t = Math.min(t, -V.z / g.z); // 母線碰到軌道面的地方（就在軌道上）
        rim.push(V.clone().addScaledVector(g, t));
      }
      const idx = [];
      for (let i = 0; i <= N; i++) { pos.push(V.x, V.y, V.z, rim[i].x, rim[i].y, rim[i].z); }
      for (let i = 0; i < N; i++) { const a = 2 * i; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      const grp = new THREE.Group();
      const cc = col('b-wave');
      const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: cc, roughness: 0.6, metalness: 0, emissive: cc, emissiveIntensity: 0.15, transparent: true, opacity: isDark() ? 0.2 : 0.16, side: THREE.DoubleSide, depthWrite: false }));
      mesh.renderOrder = 4;
      grp.add(mesh);
      const lp = [];
      for (let i = 0; i < N; i += 8) lp.push(V.x, V.y, V.z, rim[i].x, rim[i].y, rim[i].z);
      grp.add(solidLine(lp, cc, 0.4));
      const ap = new THREE.Mesh(new THREE.SphereGeometry(0.07 * TH, 12, 8), new THREE.MeshBasicMaterial({ color: cc }));
      ap.position.copy(V);
      grp.add(ap);
      const lb = label(T('圓錐（幾何輔助）', 'Cone (geometry aid)'), B.shade(C['b-wave'], isDark() ? 0.15 : -0.15), { size: narrow ? 10 : 11, inPlane: false });
      lb.position.copy(V);
      grp.add(lb);
      L.anchors.push({ sp: lb, fixed: [0, 1], gap: 8 });
      coneApex = V.clone();
      return grp;
    }

    // ---------- 動態物件：飛行物體、拖尾、速度箭頭、半徑、角動量 ----------
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0.05 }));
    body.castShadow = true;
    body.receiveShadow = true;
    body.renderOrder = 6;
    scene.add(body);
    const bodyGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false }));
    bodyGlow.renderOrder = 7;
    scene.add(bodyGlow);
    const crashMark = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8), new THREE.MeshBasicMaterial({ color: 0x333333, transparent: true, opacity: 0.6 }));
    scene.add(crashMark);

    // 漸淡的拖尾（與 2D 相同：最近 0.3 個週期，越新越粗越亮）；頂點顏色帶透明度
    const trailRad = 8;
    const trailPos = new Float32Array((TRAIL_N + 1) * trailRad * 3), trailNor = new Float32Array((TRAIL_N + 1) * trailRad * 3);
    const trailCol = new Float32Array((TRAIL_N + 1) * trailRad * 4);
    const trailIdx = new Uint16Array(TRAIL_N * trailRad * 6);
    tubeIndex(trailIdx, 0, 0, TRAIL_N + 1, trailRad);
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3).setUsage(THREE.DynamicDrawUsage));
    trailGeo.setAttribute('normal', new THREE.BufferAttribute(trailNor, 3).setUsage(THREE.DynamicDrawUsage));
    trailGeo.setAttribute('color', new THREE.BufferAttribute(trailCol, 4).setUsage(THREE.DynamicDrawUsage));
    trailGeo.setIndex(new THREE.BufferAttribute(trailIdx, 1));
    const trail = new THREE.Mesh(trailGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
    trail.frustumCulled = false;
    trail.renderOrder = 6;
    scene.add(trail);
    const trailPts = [];
    for (let i = 0; i <= TRAIL_N; i++) trailPts.push([0, 0]);

    const vArrow = makeArrow('pos');
    scene.add(vArrow);
    const hArrow = makeArrow('probe');
    scene.add(hArrow);
    const rLine = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3)),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false }));
    rLine.frustumCulled = false;
    rLine.renderOrder = 2;
    scene.add(rLine);
    let dynLabels = {};
    function makeDynLabels() {
      Object.keys(dynLabels).forEach(function (k) { scene.remove(dynLabels[k]); disposeObject(dynLabels[k]); });
      dynLabels = {
        v: label([['v', 'it']], C.pos, { box: false, size: narrow ? 12 : 13 }),
        r: label([['r', 'it']], C.muted, { box: false, size: narrow ? 12 : 13 }),
        h: label([['h', 'it']], B.shade(C.probe, isDark() ? 0.1 : -0.15), { box: false, size: narrow ? 13 : 14, inPlane: false })
      };
      Object.keys(dynLabels).forEach(function (k) { scene.add(dynLabels[k]); });
    }
    // 通過近心點的波紋（state.fx，純裝飾）
    const ripples = [];
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
      m.visible = false;
      m.renderOrder = 7;
      scene.add(m);
      ripples.push(m);
    }

    function applyColors() {
      vArrow.userData.mat.color.copy(col('pos')); vArrow.userData.mat.emissive.copy(col('pos'));
      hArrow.userData.mat.color.copy(col('probe')); hArrow.userData.mat.emissive.copy(col('probe'));
      rLine.material.color.copy(col('text'));
      crashMark.material.color.copy(col('text'));
      makeDynLabels();
    }

    // ---------- 相機：自動取景（框住視野圓盤與角動量箭頭）、預設視角、正面／側面 ----------
    function fitPoints() {
      const pts = [];
      const R = R3 * 1.02;
      for (let i = 0; i < 36; i++) { const a = i / 36 * TAU; pts.push(new THREE.Vector3(R * Math.cos(a), R * Math.sin(a), 0)); }
      pts.push(new THREE.Vector3(0, 0, H_LEN + 0.9));
      if (coneOn && coneApex) pts.push(coneApex.clone().multiplyScalar(1.04));
      return pts;
    }
    function fitDistance(dir) {
      const fwd = dir.clone().negate();
      const right = new THREE.Vector3().crossVectors(fwd, camera.up);
      if (right.lengthSq() < 1e-14) right.set(1, 0, 0);
      right.normalize();
      const upv = new THREE.Vector3().crossVectors(right, fwd).normalize();
      const tv = Math.tan(camera.fov * Math.PI / 360), th = tv * camera.aspect;
      let d = 1;
      fitPoints().forEach(function (p) {
        const depth = p.dot(dir);
        d = Math.max(d, depth + Math.abs(p.dot(right)) / th, depth + Math.abs(p.dot(upv)) / tv);
      });
      return d * 1.03;
    }
    function dirOf(polar, az) { return new THREE.Vector3(Math.sin(polar) * Math.cos(az), Math.sin(polar) * Math.sin(az), Math.cos(polar)); }
    function currentSph() {
      const off = camera.position.clone().sub(controls.target);
      const d = off.length() || 1;
      return { polar: Math.acos(Math.max(-1, Math.min(1, off.z / d))), az: Math.atan2(off.y, off.x), dist: d };
    }
    let camAnim = null;
    function setNearFar(dist) {
      const near = Math.max(0.03, dist / 250);
      if (Math.abs(camera.near - near) > 0.1 * near) { camera.near = near; camera.updateProjectionMatrix(); }
    }
    /** 相機移到 (polar, az) 方向、自動取景；動畫 0.65 秒（減少動態效果時直接跳過去） */
    function camTo(polar, az, animate) {
      const dist = fitDistance(dirOf(polar, az));
      if (!animate || B.reducedMotion) {
        camAnim = null;
        controls.target.set(0, 0, 0);
        camera.position.copy(dirOf(polar, az)).multiplyScalar(dist);
        setNearFar(dist);
        controls.update();
        requestRender();
        return;
      }
      const s = currentSph();
      let da = az - s.az;
      while (da > Math.PI) da -= TAU;
      while (da < -Math.PI) da += TAU;
      camAnim = { t0: performance.now(), dur: 650, p0: s.polar, a0: s.az, d0: s.dist, p1: polar, a1: s.az + da, d1: dist, tg: controls.target.clone() };
      requestRender();
    }
    function stepCamAnim() {
      if (!camAnim) return;
      const A = camAnim;
      const u = Math.min(1, (performance.now() - A.t0) / A.dur), e = 1 - Math.pow(1 - u, 3);
      const p = A.p0 + (A.p1 - A.p0) * e, a = A.a0 + (A.a1 - A.a0) * e, d = Math.exp(Math.log(A.d0) + (Math.log(A.d1) - Math.log(A.d0)) * e);
      controls.target.copy(A.tg).multiplyScalar(1 - e);
      camera.position.copy(dirOf(p, a)).multiplyScalar(d).add(controls.target);
      setNearFar(d);
      if (u >= 1) camAnim = null;
    }
    controls.addEventListener('start', function () { camAnim = null; });
    function resetCamera(animate) { camTo(DEF_POLAR, DEF_AZ, animate); }

    // ---------- 繪製 ----------
    let raf = 0;
    let lastAspect = 0;
    function updateAnchors() {
      const list = [];
      Object.keys(layers).forEach(function (k) { if (layers[k].obj) list.push.apply(list, layers[k].anchors); });
      list.forEach(function (a) {
        let d;
        if (a.fixed) d = a.fixed;
        else if (a.perpOf) { const s = screenDir(a.perpOf[0], a.perpOf[1]); d = [-s[1] * a.side, s[0] * a.side]; }
        else d = screenDir(a.from, a.at);
        anchorLabel(a.sp, d[0], d[1], a.gap);
      });
      dynAnchors.forEach(function (a) { if (a.sp.visible) anchorLabel(a.sp, a.d[0], a.d[1], a.gap); });
    }
    const dynAnchors = [];
    function renderNow() {
      if (!api.active || document.hidden) return;
      const want = Math.min(window.devicePixelRatio || 1, 2);
      if (renderer.getPixelRatio() !== want) { renderer.setPixelRatio(want); resize3(); return; }
      stepCamAnim();
      const moved = controls.update();
      setNearFar(camera.position.distanceTo(controls.target));
      if (layers.stars && layers.stars.obj) layers.stars.obj.position.copy(camera.position);
      updateDynAnchors();
      updateAnchors();
      layoutLabels();
      renderer.render(scene, camera);
      if (moved || camAnim) requestRender(); // 阻尼慣性或視角動畫還在進行
    }
    function requestRender() {
      if (raf || !api.active) return;
      raf = requestAnimationFrame(function () { raf = 0; renderNow(); });
    }
    function resize3() {
      const w = wrap.clientWidth;
      if (!w) return;
      const nar = w < 560;
      const h = Math.round(nar ? w * 1.08 : Math.min(w * 0.68, 600)); // 與 2D 畫布相同的比例
      if (canvas.style.height !== h + 'px') canvas.style.height = h + 'px';
      cw = w; ch = h;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (nar !== narrow) { narrow = nar; TH = narrow ? 1.3 : 1; makeDynLabels(); }
      sizeLabels();
      if (Math.abs(camera.aspect - lastAspect) > 1e-3) {
        // 畫面比例改變：保持目前的方向，重新取景
        const s = lastAspect ? currentSph() : { polar: DEF_POLAR, az: DEF_AZ };
        lastAspect = camera.aspect;
        camTo(s.polar, s.az, false);
      }
      update();
      renderNow();
    }
    const ro = window.ResizeObserver ? new ResizeObserver(function () { resize3(); }) : null;
    if (ro) ro.observe(wrap); else window.addEventListener('resize', resize3);
    controls.addEventListener('change', requestRender);
    const onVisible = function () { if (!document.hidden) requestRender(); };
    document.addEventListener('visibilitychange', onVisible);
    canvas.addEventListener('webglcontextlost', function (ev) {
      ev.preventDefault();
      if (!api.active) return; // 切回 2D 時自己釋放的（forceContextLoss），不是意外中斷
      if (B.onContextLost) B.onContextLost();
    });

    // ---------- 每一幀：檢查圖層、更新動態物件 ----------
    function checkLayers() {
      U = R3 / state.view;
      const base = [state.preset, state.view, colorVer, TH].join('|');
      const f = state.flight;
      layer('stars', 'stars|' + colorVer, buildStars);
      layer('plane', base + '|' + (narrow ? 1 : 0), buildPlane);
      layer('central', base, buildCentral);
      layer('ghosts', state.show.ghost && state.ghosts.length ? base + '|' + ghostKey() : 'off', buildGhosts);
      layer('orbit', f ? base + '|' + f.sig + '|' + f.color : 'off', buildOrbit);
      layer('preview', B.previewDiffers() ? base + '|' + B.preview().sig : 'off', buildPreview);
      const main = B.mainOrbit();
      const mk = base + '|' + main.sig + '|' + (narrow ? 1 : 0);
      layer('sectors', state.show.sec ? mk : 'off', buildSectors);
      layer('axes', state.show.ax ? mk : 'off', buildAxes);
      layer('launcher', base + '|' + B.launchSig() + '|' + state.vSnap + '|' + (narrow ? 1 : 0), buildLauncher);
      if (!coneOn) coneApex = null;
      layer('cone', coneOn ? mk : 'off', buildCone);
      return main;
    }
    const tmpO = new THREE.Vector3(), tmpD = new THREE.Vector3();
    function update() {
      const main = checkLayers();
      const f = state.flight;
      const dark = isDark();
      if (earthMesh) earthMesh.rotation.z = 0.6 + (f ? f.t : 0) * TAU / SIDEREAL_DAY; // 每恆星日自轉一圈

      // 等時間扇形：目前所在的扇形
      if (layers.sectors && layers.sectors.obj) shadeSectors(B.currentSector(main, B.sectorTimes(main)));
      // 發射箭頭：已經沿這組條件發射時畫得淡一些（飛行物體自己的速度箭頭較清楚）
      const Lr = layers.launcher && layers.launcher.ref;
      if (Lr && Lr.arrow) Lr.arrow.userData.mat.opacity = f && !B.previewDiffers() ? 0.45 : 1;

      // 飛行物體
      const s = f ? B.flightState() : null;
      const crashed = f && f.ended === 'crash';
      const rB = 0.2 * TH;
      body.visible = bodyGlow.visible = !!f && !crashed;
      crashMark.visible = !!crashed;
      if (s) {
        const o = tmpO.set(s.x * U, s.y * U, 0);
        const c = col(B.col(f.color));
        body.material.color.copy(c);
        body.material.emissive.copy(c).multiplyScalar(dark ? 0.3 : 0.12);
        body.position.copy(o);
        body.scale.setScalar(rB);
        bodyGlow.position.copy(o);
        bodyGlow.material.color.copy(c);
        bodyGlow.material.opacity = dark ? 0.6 : 0.38;
        bodyGlow.scale.setScalar(6 * rB);
        crashMark.position.copy(o);
        crashMark.scale.setScalar(TH);
        // 拖尾
        const el = f.el;
        const showTrail = state.show.trail && f.t > 0;
        trail.visible = showTrail;
        if (showTrail) {
          const span = Math.min(f.t, isFinite(el.T) ? 0.3 * el.T : 2 * Math.PI * Math.sqrt(el.rp * el.rp * el.rp / el.mu) * 0.3);
          for (let i = 0; i <= TRAIL_N; i++) {
            const q = K.stateAt(el, f.t - span + span * i / TRAIL_N);
            trailPts[i][0] = q.x * U; trailPts[i][1] = q.y * U;
          }
          fillTube(trailPos, trailNor, trailPts, function (i, n) { const u = i / (n - 1); return (0.022 + 0.06 * u) * TH; }, trailRad, false, 0, 0);
          for (let i = 0; i <= TRAIL_N; i++) {
            const u = i / TRAIL_N, a = 0.06 + 0.7 * u * u;
            for (let j = 0; j < trailRad; j++) { const k = 4 * (i * trailRad + j); trailCol[k] = c.r; trailCol[k + 1] = c.g; trailCol[k + 2] = c.b; trailCol[k + 3] = a; }
          }
          trailGeo.attributes.position.needsUpdate = true;
          trailGeo.attributes.normal.needsUpdate = true;
          trailGeo.attributes.color.needsUpdate = true;
        }
        // 速度箭頭（與 2D 相同比例）與半徑
        const showV = state.show.v && !crashed;
        vArrow.visible = dynLabels.v.visible = showV && s.v > 0;
        if (vArrow.visible) {
          const len = s.v * VSCALE();
          tmpD.set(s.vx / s.v, s.vy / s.v, 0);
          setArrow(vArrow, o, tmpD, len, 0.04 * TH);
          dynLabels.v.position.copy(o).addScaledVector(tmpD, len);
        }
        rLine.visible = dynLabels.r.visible = showV;
        if (showV) {
          const rp = rLine.geometry.attributes.position;
          rp.setXYZ(0, 0, 0, 0); rp.setXYZ(1, o.x, o.y, o.z);
          rp.needsUpdate = true;
          rLine.material.opacity = dark ? 0.5 : 0.42;
          dynLabels.r.position.copy(o).multiplyScalar(0.5);
        }
      } else {
        trail.visible = vArrow.visible = rLine.visible = false;
        dynLabels.v.visible = dynLabels.r.visible = false;
      }
      // 角動量 h = r × v：垂直於軌道面（只表示方向）
      const hz = main.el.h >= 0 ? 1 : -1;
      setArrow(hArrow, tmpO.set(0, 0, 0), tmpD.set(0, 0, hz), H_LEN, 0.04 * TH);
      dynLabels.h.position.set(0, 0, hz * H_LEN);

      // 通過近心點的波紋
      const tNow = performance.now();
      ripples.forEach(function (m) { m.visible = false; });
      state.fx.filter(function (e) { return e.type === 'ring' && tNow - e.t0 < e.dur; }).slice(-ripples.length).forEach(function (e, i) {
        const u = (tNow - e.t0) / e.dur, m = ripples[i];
        m.visible = true;
        m.position.set(e.x * U, e.y * U, 0.01);
        m.scale.setScalar((0.25 + 0.75 * u) * TH);
        m.material.color.copy(col('pos'));
        m.material.opacity = 0.6 * (1 - u);
      });

      updateHud(main);
    }
    function updateDynAnchors() {
      dynAnchors.length = 0;
      const f = state.flight;
      if (dynLabels.v && dynLabels.v.visible && f) {
        dynAnchors.push({ sp: dynLabels.v, d: screenDir(body.position, dynLabels.v.position), gap: 4 });
      }
      if (dynLabels.r && dynLabels.r.visible) {
        const s = screenDir(new THREE.Vector3(0, 0, 0), body.position);
        // 放在半徑的一側（避開速度箭頭所在的那一側）
        const vs = screenDir(body.position, dynLabels.v.position);
        let px = -s[1], py = s[0];
        if (px * vs[0] + py * vs[1] > 0) { px = -px; py = -py; }
        dynAnchors.push({ sp: dynLabels.r, d: [px, py], gap: 3 });
      }
      if (dynLabels.h) {
        // h 的標籤放在箭頭尖端的右側；箭頭幾乎正對相機（正面看）時隱藏
        const d = screenDir(new THREE.Vector3(0, 0, 0), dynLabels.h.position);
        dynLabels.h.visible = Math.hypot(d[0], d[1]) > 28;
        dynAnchors.push({ sp: dynLabels.h, d: [1, 0.15], gap: 6 });
      }
    }
    /**
     * 標籤排版（每一幀）：
     * 1. 幾乎從側面看軌道面時，軌道面上的標籤淡出（仰角 4° 以下看不到、11° 以上完全顯示）；
     * 2. 錨點在畫面內的標籤推回畫面內，不被邊緣切掉；
     * 3. 次要標籤（prio 0：距離刻度、v圓/v脫、「軌道面」）與重要標籤或 HUD 重疊時隱藏。
     */
    const lp = new THREE.Vector3();
    const labelsNow = [];
    let hudRects = [], hudT = 0;
    function readHudRects() {
      const now = performance.now();
      if (now - hudT < 400) return;
      hudT = now;
      const cr = canvas.getBoundingClientRect();
      hudRects = [];
      hud.querySelectorAll('span').forEach(function (e) {
        if (!e.textContent) return;
        const r = e.getBoundingClientRect();
        if (r.width) hudRects.push([r.left - cr.left, cr.bottom - r.bottom, r.width, r.height]); // y 向上
      });
    }
    function overlaps(a, b) { return a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3]; }
    function layoutLabels() {
      const s = currentSph();
      const elev = Math.abs(Math.PI / 2 - s.polar);
      const fade = Math.max(0, Math.min(1, (elev - 0.07) / 0.12));
      const M = 4;
      readHudRects();
      labelsNow.length = 0;
      scene.traverseVisible(function (o) { if (o.userData && o.userData.isLabel) labelsNow.push(o); });
      labelsNow.sort(function (a, b) { return b.userData.prio - a.userData.prio; });
      const taken = [];
      labelsNow.forEach(function (sp) {
        const u = sp.userData;
        if (!u.anchored) { if (!u.base) u.base = sp.center.clone(); else sp.center.copy(u.base); }
        let op = u.inPlane ? fade : 1;
        sp.getWorldPosition(lp).project(camera);
        if (lp.z > 1) op = 0; // 在相機後面
        else {
          const px = (lp.x + 1) / 2 * cw, py = (lp.y + 1) / 2 * ch, lw = u.lw, lh = u.lh;
          if (px > -M && px < cw + M && py > -M && py < ch + M) {
            if (px - sp.center.x * lw < M) sp.center.x = (px - M) / lw;
            else if (px - sp.center.x * lw + lw > cw - M) sp.center.x = (px - (cw - M - lw)) / lw;
            if (py - sp.center.y * lh < M) sp.center.y = (py - M) / lh;
            else if (py - sp.center.y * lh + lh > ch - M) sp.center.y = (py - (ch - M - lh)) / lh;
          }
          const r = [px - sp.center.x * lw, py - sp.center.y * lh, lw, lh, u.prio];
          // 低重要度：碰到更重要的標籤或 HUD 就隱藏；最次要的（0）彼此重疊也只留先排到的
          if (u.prio < 2 && op > 0 && (taken.some(function (q) { return (q[4] > u.prio || u.prio === 0) && overlaps(q, r); }) ||
              hudRects.some(function (q) { return overlaps(q, r); }))) op = 0;
          if (op > 0.05) taken.push(r);
        }
        if (sp.material.opacity !== op) sp.material.opacity = op;
      });
    }
    const hudLast = {};
    function setHud(k, txt, color) {
      if (hudLast[k] !== txt) { hudLast[k] = txt; hudEl[k].textContent = txt; }
      if (color !== undefined && hudLast[k + '#'] !== color) { hudLast[k + '#'] = color; hudEl[k].style.color = color; }
    }
    function updateHud(main) {
      const fl = state.flight;
      setHud('t', 't = ' + (fl ? B.fmtTime(fl.t) : '0'));
      setHud('ts', '×' + B.tsText());
      setHud('kind', B.kindText(main.el, main.crashT) + '  e = ' + B.fmtE(main.el.e), B.kindColor(main.el));
      setHud('dash', B.previewDiffers() && fl ? T('虛線：尚未發射', 'Dashed: not launched yet') : '');
      setHud('scale', B.isSun() ? T('太陽與行星大小未依比例', 'Sun and planet not to scale') : T('地球依比例；衛星大小未依比例', 'Earth to scale; satellite not to scale'));
    }

    const api = {
      active: true,
      /** kepler.js 的 draw() 每次更新都呼叫 */
      frame: function () { update(); renderNow(); },
      onShow: function () { lastAspect = 0; resize3(); },
      onTheme: function () {
        colorVer++;
        applyColors();
        Object.keys(hudLast).forEach(function (k) { delete hudLast[k]; });
        update();
        requestRender();
      },
      resetCamera: function () { resetCamera(true); },
      /** 'top'：正對軌道面（與 2D 畫面方向相同）；'edge'：從軌道面的側邊看（保持目前的方位） */
      camTo: function (kind) {
        if (kind === 'top') camTo(1e-4, -Math.PI / 2, true);
        else { const s = currentSph(); camTo(Math.PI / 2, s.polar < 0.02 ? -Math.PI / 2 : s.az, true); }
      },
      setCone: function (on) {
        coneOn = !!on;
        update();
        const s = currentSph();
        if (!coneOn) { camTo(s.polar, s.az, true); return; }
        // 打開圓錐：相機移到長軸的側面、稍微高於軌道面，看得出圓錐的形狀與截口
        const om = B.mainOrbit().el.omega;
        let az = om - Math.PI / 2;
        if (Math.cos(az - s.az) < 0) az += Math.PI;
        camTo(68 * Math.PI / 180, az, true);
      },
      dispose: function () {
        api.active = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize3);
        document.removeEventListener('visibilitychange', onVisible);
        controls.dispose();
        disposeObject(scene);
        glowTex.dispose();
        if (planeTex) planeTex.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        wrap.remove();
      }
    };

    // 初始化
    const w0 = wrap.clientWidth;
    if (w0) {
      narrow = w0 < 560; TH = narrow ? 1.3 : 1;
      cw = w0; ch = Math.round(narrow ? w0 * 1.08 : Math.min(w0 * 0.68, 600));
      canvas.style.height = ch + 'px';
      renderer.setSize(cw, ch, false);
      camera.aspect = cw / ch;
      camera.updateProjectionMatrix();
      lastAspect = camera.aspect;
    }
    applyColors();
    update();
    resetCamera(false);
    return api;
  }

  window.Kepler3D = { create: create };
})();
