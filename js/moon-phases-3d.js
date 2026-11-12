/*
 * moon-phases-3d.js — 「月相與日月食」的 3D 立體檢視（three.js）
 *
 * 由 js/moon-phases.js 在使用者按「3D 立體」時才載入（three.js 也是那時才以 import() 載入）；切回 2D 時整個釋放。
 * 用法：window.Moon3D.create({ THREE, OrbitControls }, 容器, bridge) → { active, frame, onShow, onTheme, onScale, resetCamera, camTo, busy, dispose }
 *
 * 位置全部來自 moon-phases-core.js，與 2D 畫面是同一份計算（bridge 由 moon-phases.js 提供）：
 *   月球位置 moonAt、太陽方向 sunAt、交點 nodeLon、軌道上的點 orbitPoint、地球自轉 lst／observer、影錐 cone、日月食 lunarEclipse／solarEclipse。
 * 場景座標：黃道座標（x 指向春分點、z 指向黃道北極），地心在原點；1 個場景單位 = 月地平均距離的 1/10（38 440 km）。
 *   「太陽固定」模式時整個場景繞 z 軸轉，讓太陽一直在 +x 方向（與 2D 俯視圖相同）。
 * 尺寸：地球、月球的半徑與影錐的寬度和 2D 一樣放大（或真實比例）；距離、影錐的長度依比例。
 * 太陽畫得比實際近得多、也小得多（純示意），但陽光是平行光，方向正確。
 * 月球軌道對黃道的傾角 5.145° 依真實數值畫出（沒有誇大），從「沿交點線側看」最容易看出。
 */
(function () {
  'use strict';
  const TAU = Math.PI * 2;
  const SUN_D = 22, SUN_R = 1.5;   // 太陽的示意位置與大小（場景單位）
  const DEF_AZ = -105 * Math.PI / 180;
  const defPolar = function (narrow) { return (narrow ? 40 : 60) * Math.PI / 180; }; // 手機畫面較高：看得更俯視一點
  const FONT = 'system-ui, -apple-system, "Segoe UI", "Noto Sans TC", "PingFang TC", sans-serif';
  const RES = 3;

  function create(lib, host, B) {
    const THREE = lib.THREE;
    const K = B.K, T = B.T, state = B.state, D = B.D;
    const S = 10 / K.A_MOON;       // 場景單位 / km
    let C = B.colors();

    // ---------- 畫布、HUD ----------
    const wrap = document.createElement('div');
    wrap.className = 'm3-wrap';
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', T('太陽、地球、月球與月球軌道的 3D 立體檢視（可拖曳旋轉、縮放）', '3D view of the Sun, the Earth, the Moon and the Moon’s orbit (drag to rotate, pinch or scroll to zoom)'));
    wrap.appendChild(canvas);
    const hud = document.createElement('div');
    hud.className = 'm3-hud';
    hud.setAttribute('aria-hidden', 'true');
    hud.innerHTML = '<div class="tl"><span data-k="t"></span><span class="m" data-k="ph"></span></div>' +
      '<div class="tr"><span data-k="ecl"></span><span class="m" data-k="node"></span></div>' +
      '<div class="br"><span class="m" data-k="scale"></span></div>';
    wrap.appendChild(hud);
    host.appendChild(wrap);
    const hudEl = {};
    hud.querySelectorAll('[data-k]').forEach(function (e) { hudEl[e.getAttribute('data-k')] = e; });

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    } catch (e) {
      wrap.remove();
      throw e;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1.5, 0.1, 3000);
    camera.up.set(0, 0, 1);
    camera.position.set(0, -30, 20);
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.rotateSpeed = 0.85;
    controls.enablePan = false;
    controls.minDistance = 1.5;
    controls.maxDistance = 160;

    // 整個太陽系的場景（「太陽固定」時繞 z 軸轉）
    const world = new THREE.Group();
    scene.add(world);
    const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.3);
    hemi.position.set(0, 0, 1);
    scene.add(hemi);
    const sunLight = new THREE.DirectionalLight(0xffffff, 2.8); // 平行光：方向與真實陽光相同
    world.add(sunLight);
    world.add(sunLight.target);

    // ---------- 共用工具 ----------
    let narrow = false, TH = 1;
    let cw = 300, ch = 200;
    let colorVer = 0;
    const col = function (c) { return new THREE.Color(C[c] || c || '#888888'); };
    const isDark = function () { return !!C.dark; };
    const alpha = D.alpha, shade = D.shade;
    function rnd(seed) { let s = seed; return function () { s = (s * 16807) % 2147483647; return s / 2147483647; }; }
    function v3(p) { return new THREE.Vector3(p.x, p.y, p.z); }
    function disposeObject(obj) {
      obj.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) {
            ['map', 'alphaMap'].forEach(function (k) { if (m[k] && !m[k].userData.shared) m[k].dispose(); });
            m.dispose();
          });
        }
      });
    }
    function canvasTex(c, shared) {
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      if (shared) t.userData.shared = true;
      return t;
    }
    const glowTex = (function () {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const g = c.getContext('2d');
      const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.35, 'rgba(255,255,255,0.4)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 128, 128);
      return canvasTex(c, true);
    })();
    // 影錐的透明度沿長度漸淡（近天體處較濃）
    const fadeTex = (function () {
      const c = document.createElement('canvas');
      c.width = 4; c.height = 128;
      const g = c.getContext('2d');
      const gr = g.createLinearGradient(0, 0, 0, 128);
      gr.addColorStop(0, 'rgb(40,40,40)');
      gr.addColorStop(1, 'rgb(255,255,255)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 4, 128);
      const t = new THREE.CanvasTexture(c);
      t.userData.shared = true;
      return t;
    })();

    // ---------- 文字標籤（Sprite，固定像素大小；以 2D 畫布繪製） ----------
    function roundRect(g, x, y, w, h, r) {
      g.beginPath();
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
    }
    /** opt：{ size, box（預設 true）, prio（2 主要、1 次要、0 最次要）, inPlane（貼在黃道面上的標籤：側看時淡出） } */
    function label(text, color, opt) {
      opt = opt || {};
      const size = (opt.size || (narrow ? 11 : 12)) * RES;
      const fMain = (opt.weight || 600) + ' ' + size + 'px ' + FONT;
      const c = document.createElement('canvas');
      let g = c.getContext('2d');
      g.font = fMain;
      const tw = g.measureText(text).width;
      const m = g.measureText('Hg');
      const fh = m.fontBoundingBoxAscent > 0 ? m.fontBoundingBoxAscent + m.fontBoundingBoxDescent : size * 1.25;
      const box = opt.box !== false;
      const padX = (box ? 6 : 4) * RES, padY = (box ? 1.5 : 3) * RES;
      c.width = Math.ceil(tw + 2 * padX);
      c.height = Math.ceil(fh + 2 * padY);
      g = c.getContext('2d');
      if (box) {
        roundRect(g, RES * 0.5, RES * 0.5, c.width - RES, c.height - RES, (c.height - RES) / 2);
        g.fillStyle = alpha(C['canvas-bg'], isDark() ? 0.84 : 0.88);
        g.fill();
        g.strokeStyle = alpha(color, isDark() ? 0.45 : 0.35);
        g.lineWidth = RES;
        g.stroke();
      }
      g.font = fMain;
      g.textBaseline = 'middle';
      g.textAlign = 'left';
      g.lineJoin = 'round';
      if (!box) {
        g.lineWidth = 4 * RES;
        g.strokeStyle = alpha(C['canvas-bg'], 0.92);
        g.strokeText(text, padX, c.height / 2);
      }
      g.fillStyle = color;
      g.fillText(text, padX, c.height / 2);
      const tex = canvasTex(c);
      tex.minFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false }));
      sp.userData.lw = c.width / RES;
      sp.userData.lh = c.height / RES;
      sp.userData.isLabel = true;
      sp.userData.inPlane = !!opt.inPlane;
      sp.userData.prio = opt.prio != null ? opt.prio : box ? 2 : 1;
      sp.userData.dir = opt.dir || [0, 1];
      sp.userData.gap = opt.gap == null ? 8 : opt.gap;
      sp.renderOrder = 20;
      fitLabel(sp);
      return sp;
    }
    function fitLabel(sp) {
      const k = 2 * Math.tan(camera.fov * Math.PI / 360) / Math.max(1, ch);
      sp.scale.set(sp.userData.lw * k, sp.userData.lh * k, 1);
    }
    function sizeLabels() { scene.traverse(function (o) { if (o.userData && o.userData.isLabel) fitLabel(o); }); }
    /** 標籤放在錨點的 (dx, dy) 方向（螢幕像素，y 向上），邊緣離錨點 gap 像素 */
    function anchorLabel(sp, dx, dy, gap) {
      const L = Math.hypot(dx, dy);
      if (!(L > 1e-6)) { dx = 0; dy = 1; } else { dx /= L; dy /= L; }
      const lw = sp.userData.lw, lh = sp.userData.lh;
      sp.center.set(0.5 - dx * (lw / 2 + gap) / lw, 0.5 - dy * (lh / 2 + gap) / lh);
    }

    // ---------- 圖層：鍵改變（參數、顏色、比例）才重建 ----------
    const layers = {};
    function layer(name, key, build, parent) {
      let L = layers[name];
      if (!L) L = layers[name] = { key: null, obj: null, ref: {} };
      if (L.key === key) return L;
      if (L.obj) { L.obj.parent.remove(L.obj); disposeObject(L.obj); }
      L.key = key;
      L.ref = {};
      L.obj = build(L);
      if (L.obj) (parent || world).add(L.obj);
      return L;
    }
    function lineGeo(points) { return new THREE.BufferGeometry().setFromPoints(points); }
    function line(points, color, opacity, dashed) {
      const mat = dashed
        ? new THREE.LineDashedMaterial({ color: color, transparent: true, opacity: opacity, dashSize: dashed[0], gapSize: dashed[1], depthWrite: false })
        : new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: opacity, depthWrite: false });
      const l = new THREE.Line(lineGeo(points), mat);
      if (dashed) l.computeLineDistances();
      return l;
    }
    /** 平滑的管子（三維點列） */
    function tube(points, radius, color, opacity) {
      const curve = new THREE.CatmullRomCurve3(points, false);
      const geo = new THREE.TubeGeometry(curve, Math.max(8, points.length * 2), radius, 8, false);
      const mat = new THREE.MeshStandardMaterial({ color: color, emissive: color, emissiveIntensity: 0.35, roughness: 0.5, metalness: 0, transparent: opacity < 1, opacity: opacity });
      return new THREE.Mesh(geo, mat);
    }

    // ---- 星空（固定亂數；跟著相機移動，看起來在無限遠） ----
    function buildStars() {
      const grp = new THREE.Group();
      const r = rnd(20261112);
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

    // ---- 黃道面：淡淡的圓盤與距離圈 ----
    function buildEcliptic(L) {
      const grp = new THREE.Group();
      const dark = isDark();
      const Rd = 14;
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const g = c.getContext('2d');
      const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
      gr.addColorStop(0, alpha(C.equi, dark ? 0.16 : 0.2));
      gr.addColorStop(0.75, alpha(C.equi, dark ? 0.08 : 0.1));
      gr.addColorStop(1, alpha(C.equi, 0));
      g.fillStyle = gr;
      g.fillRect(0, 0, 256, 256);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(Rd, 96), new THREE.MeshBasicMaterial({ map: canvasTex(c), transparent: true, depthWrite: false, side: THREE.DoubleSide }));
      disc.renderOrder = 1;
      grp.add(disc);
      [5, 10].forEach(function (R) {
        const pts = [];
        for (let i = 0; i <= 128; i++) { const a = i / 128 * TAU; pts.push(new THREE.Vector3(R * Math.cos(a), R * Math.sin(a), 0)); }
        grp.add(line(pts, col('muted'), dark ? 0.35 : 0.4, [0.25, 0.25]));
      });
      const lab = label(T('黃道面（地球繞太陽的軌道面）', 'Ecliptic plane (the Earth’s orbital plane)'), shade(C.equi, dark ? 0.15 : -0.4), { box: false, prio: 0, inPlane: true });
      lab.position.set(-11.5 * Math.SQRT1_2, -11.5 * Math.SQRT1_2, 0);
      grp.add(lab);
      return grp;
    }

    // ---- 月球軌道（在「交點座標」中建立：x 沿升交點方向；整組再依 Ω、i 旋轉，每一幀都精確） ----
    const orbitGroup = new THREE.Group();
    world.add(orbitGroup);
    function buildOrbit(L) {
      const grp = new THREE.Group();
      const dark = isDark();
      const el = state.el, t = state.t;
      const N = 240, pts = [];
      for (let i = 0; i <= N; i++) {
        const u = TAU * i / N, r = K.len(K.orbitPoint(el, t, u)) * S;
        pts.push(new THREE.Vector3(r * Math.cos(u), r * Math.sin(u), 0));
      }
      L.ref.pts = pts;
      const rad = 0.05 * TH;
      grp.add(tube(pts.slice(0, N / 2 + 1), rad, col('accent'), 1));
      grp.add(tube(pts.slice(N / 2), rad * 0.8, col('muted'), dark ? 0.7 : 0.75));
      // 軌道面：半透明的扇形（上半在黃道面上方）
      const fan = function (from, to, color, op) {
        const pos = [0, 0, 0];
        for (let i = from; i <= to; i++) pos.push(pts[i].x, pts[i].y, 0);
        const idx = [];
        for (let i = 1; i < to - from + 1; i++) idx.push(0, i, i + 1);
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setIndex(idx);
        const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide }));
        m.renderOrder = 2;
        return m;
      };
      grp.add(fan(0, N / 2, col('accent'), dark ? 0.12 : 0.1));
      grp.add(fan(N / 2, N, col('muted'), dark ? 0.08 : 0.07));
      // 垂直於黃道的細線：看出軌道在黃道面上方或下方多高（真實的高度，沒有誇大）
      const inc = el.inc, nz = new THREE.Vector3(0, Math.sin(inc), Math.cos(inc)); // 黃道北方在交點座標中的方向
      for (let i = 0; i < N; i += 10) {
        const p = pts[i], h = Math.hypot(p.x, p.y) * Math.sin(TAU * i / N) * Math.sin(inc);
        if (Math.abs(h) < 0.05) continue;
        const q = p.clone().addScaledVector(nz, -h);
        grp.add(line([p, q], h > 0 ? col('accent') : col('muted'), dark ? 0.55 : 0.5));
      }
      // 交點線
      const pa = pts[0], pd = pts[N / 2];
      grp.add(line([pd, pa], col('b-astro'), 0.9, [0.3, 0.22]));
      const node = function (p, up) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.16 * TH, 20, 14), new THREE.MeshStandardMaterial({ color: col('b-astro'), emissive: col('b-astro'), emissiveIntensity: 0.4, roughness: 0.4 }));
        m.position.copy(p);
        grp.add(m);
        const lab = label(up ? T('升交點', 'Ascending node') : T('降交點', 'Descending node'), C['b-astro'], { prio: 1, dir: [p.x > 0 ? 1 : -1, -0.6] });
        lab.position.copy(p);
        grp.add(lab);
      };
      node(pa, true); node(pd, false);
      // 近地點
      const om = K.wrapPi(K.periLon(el, t) - K.nodeLon(el, t));
      const ip = Math.round(K.norm(om) / TAU * N) % N, pp = pts[ip];
      const pm = new THREE.Mesh(new THREE.OctahedronGeometry(0.17 * TH), new THREE.MeshStandardMaterial({ color: col('equi'), emissive: col('equi'), emissiveIntensity: 0.4, roughness: 0.4 }));
      pm.position.copy(pp);
      grp.add(pm);
      const pl = label(T('近地點', 'Perigee'), shade(C.equi, dark ? 0.1 : -0.35), { box: false, prio: 0, dir: [0, -1] });
      pl.position.copy(pp);
      grp.add(pl);
      // 傾角 5.145°：在升交點畫出兩個面的夾角
      const Ra = 6, ecl = new THREE.Vector3(0, Math.cos(inc), -Math.sin(inc));
      const c0 = pa.clone();
      grp.add(line([c0, c0.clone().add(new THREE.Vector3(0, Ra * 1.25, 0))], col('accent'), 0.85));
      grp.add(line([c0, c0.clone().addScaledVector(ecl, Ra * 1.25)], col('equi'), 0.9, [0.2, 0.15]));
      const arc = [];
      for (let i = 0; i <= 16; i++) { const th = -inc * i / 16; arc.push(c0.clone().add(new THREE.Vector3(0, Ra * Math.cos(th), Ra * Math.sin(th)))); }
      grp.add(line(arc, col('text'), 0.9));
      const al = label(T('傾角 ', 'tilt ') + B.num(inc / K.DEG, 3) + '°', C.text, { prio: 1, dir: [1, 0], gap: 6 });
      al.position.copy(c0.clone().add(new THREE.Vector3(0, Ra, -Ra * Math.sin(inc / 2))));
      grp.add(al);
      const ol = label(T('月球軌道面', 'Moon’s orbital plane'), C.accent, { box: false, prio: 0 });
      ol.position.copy(pts[N / 4].clone().multiplyScalar(0.62));
      grp.add(ol);
      return grp;
    }

    // ---- 地球、台灣、月球、太陽 ----
    function earthTexture() {
      const W = 512, H = 256;
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const g = c.getContext('2d');
      const img = g.createImageData(W, H), px = img.data;
      for (let j = 0; j < H; j++) {
        const lat = Math.PI / 2 - (j + 0.5) / H * Math.PI, cl = Math.cos(lat), sl = Math.sin(lat);
        for (let i = 0; i < W; i++) {
          const lon = (i + 0.5) / W * TAU - Math.PI;
          const x = cl * Math.cos(lon), y = cl * Math.sin(lon), z = sl;
          // 海洋（純示意：不畫大陸形狀，避免誤導），雲與極冠用雜訊
          const n = B.fbm(x * 2.2 + 5, y * 2.2 + 9, z * 2.2 + 3, 4);
          const cloud = Math.max(0, Math.min(1, (B.fbm(x * 4 + 1, y * 4 + 7, z * 9 + 2, 4) - 0.52) * 4));
          const ice = Math.max(0, Math.min(1, (Math.abs(lat) - 1.15 - 0.12 * (n - 0.5)) * 8));
          let r = 30 + 30 * n, gg = 92 + 40 * n, b = 170 + 45 * n;
          const w = Math.max(cloud * 0.75, ice);
          r += (240 - r) * w; gg += (244 - gg) * w; b += (248 - b) * w;
          const k = 4 * (j * W + i);
          px[k] = r; px[k + 1] = gg; px[k + 2] = b; px[k + 3] = 255;
        }
      }
      g.putImageData(img, 0, 0);
      // 赤道與北回歸線
      g.strokeStyle = 'rgba(255,255,255,0.55)';
      g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke();
      g.setLineDash([5, 4]);
      const yt = H / 2 - K.LAT_TW / Math.PI * H;
      g.beginPath(); g.moveTo(0, yt); g.lineTo(W, yt); g.stroke();
      const t = canvasTex(c);
      t.anisotropy = 4;
      return t;
    }
    function moonTexture() {
      const W = 384, H = 192;
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const g = c.getContext('2d');
      const img = g.createImageData(W, H), px = img.data;
      for (let j = 0; j < H; j++) {
        const lat = Math.PI / 2 - (j + 0.5) / H * Math.PI, cl = Math.cos(lat), sl = Math.sin(lat);
        for (let i = 0; i < W; i++) {
          const lon = (i + 0.5) / W * TAU - Math.PI;   // 月面經度（東經為正）；經度 0 朝向地球
          const a = B.albedoXYZ(cl * Math.sin(lon), sl, cl * Math.cos(lon));
          const k = 4 * (j * W + i), v = 255 * Math.min(1, a * 1.05);
          px[k] = v; px[k + 1] = v * 0.985; px[k + 2] = v * 0.95; px[k + 3] = 255;
        }
      }
      g.putImageData(img, 0, 0);
      const t = canvasTex(c);
      t.anisotropy = 4;
      return t;
    }
    let earthTex = null, moonTex = null;
    function buildBodies(L) {
      const grp = new THREE.Group();
      const dark = isDark();
      const mag = B.mag();
      const rE = K.R_EARTH * S * mag, rM = K.R_MOON * S * mag;
      if (!earthTex) { earthTex = earthTexture(); earthTex.userData.shared = true; }
      if (!moonTex) { moonTex = moonTexture(); moonTex.userData.shared = true; }
      const eg = new THREE.SphereGeometry(rE, 64, 40);
      eg.rotateX(Math.PI / 2); // 兩極在 ±z；經度 0 在 +x
      const earth = new THREE.Mesh(eg, new THREE.MeshStandardMaterial({ map: earthTex, roughness: 0.75, metalness: 0 }));
      grp.add(earth);
      L.ref.earth = earth;
      // 大氣光暈
      const atm = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color('#8fc4ff'), transparent: true, opacity: dark ? 0.35 : 0.25, depthWrite: false }));
      atm.scale.set(2.7 * rE, 2.7 * rE, 1);
      atm.renderOrder = 7;
      earth.add(atm);
      L.ref.atm = atm;
      // 自轉軸
      const ax = line([new THREE.Vector3(0, 0, -1.45 * rE), new THREE.Vector3(0, 0, 1.45 * rE)], col('text'), 0.6);
      earth.add(ax);
      // 台灣
      const tw = new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.05, rE * 0.07), 14, 10), new THREE.MeshBasicMaterial({ color: col('pos') }));
      grp.add(tw);
      L.ref.tw = tw;
      const twl = label(T('台灣', 'Taiwan'), C.pos, { box: false, prio: 1, dir: [1, 0.3], gap: 5 });
      tw.add(twl);
      L.ref.twl = twl;
      const el2 = label(T('地球', 'Earth'), C.text, { prio: 2, dir: [-0.6, 1] });
      grp.add(el2);
      L.ref.elab = el2;
      L.ref.rE = rE;
      // 月球（潮汐鎖定：經度 0 的「正面」永遠朝向地球）
      const mg = new THREE.SphereGeometry(rM, 48, 32);
      mg.rotateX(Math.PI / 2);
      const moon = new THREE.Mesh(mg, new THREE.MeshStandardMaterial({ map: moonTex, roughness: 0.95, metalness: 0, emissive: new THREE.Color(0x000000) }));
      grp.add(moon);
      L.ref.moon = moon;
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: col('accent'), transparent: true, opacity: 0.6, depthWrite: false, sizeAttenuation: false }));
      const hs = 2 * Math.tan(camera.fov * Math.PI / 360) / Math.max(1, ch) * 26;
      halo.scale.set(hs, hs, 1);
      halo.visible = mag === 1;
      halo.renderOrder = 6;
      moon.add(halo);
      const ml = label(T('月球', 'Moon'), C.text, { prio: 2, dir: [0.4, 1] });
      grp.add(ml);
      L.ref.mlab = ml;
      L.ref.rM = rM;
      // 太陽（示意：距離與大小未按比例）
      const sunMat = new THREE.ShaderMaterial({
        transparent: true,
        uniforms: { cCore: { value: new THREE.Color(shade(C.equi, 0.8)) }, cMid: { value: new THREE.Color(shade(C.equi, 0.25)) }, cEdge: { value: new THREE.Color(C['b-mech'] || C.equi) }, op: { value: 1 } },
        vertexShader: 'varying vec3 vN;\nvarying vec3 vV;\nvoid main() {\n  vec4 mv = modelViewMatrix * vec4(position, 1.0);\n  vN = normalize(normalMatrix * normal);\n  vV = normalize(-mv.xyz);\n  gl_Position = projectionMatrix * mv;\n}',
        fragmentShader: 'uniform vec3 cCore;\nuniform vec3 cMid;\nuniform vec3 cEdge;\nuniform float op;\nvarying vec3 vN;\nvarying vec3 vV;\nvoid main() {\n  float m = clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0);\n  vec3 c = mix(cEdge, cMid, smoothstep(0.0, 0.6, m));\n  c = mix(c, cCore, smoothstep(0.55, 1.0, m));\n  gl_FragColor = vec4(c, op);\n  #include <colorspace_fragment>\n}'
      });
      const sun = new THREE.Mesh(new THREE.SphereGeometry(SUN_R, 48, 32), sunMat);
      grp.add(sun);
      L.ref.sun = sun;
      const sg = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: col('equi'), transparent: true, opacity: dark ? 0.75 : 0.6, depthWrite: false }));
      sg.scale.set(SUN_R * 6, SUN_R * 6, 1);
      sg.renderOrder = 5;
      sun.add(sg);
      L.ref.sunGlow = sg;
      const sl = label(T('太陽（距離與大小未按比例）', 'Sun (distance and size not to scale)'), shade(C.equi, dark ? 0.2 : -0.4), { prio: 2, dir: [0, 1], gap: 10 });
      sun.add(sl);
      L.ref.sunLab = sl;
      // 陽光：從太陽射向地球的平行光線（示意）
      const rays = new THREE.Group();
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * TAU + 0.3, off = new THREE.Vector3(0, Math.cos(a), Math.sin(a)).multiplyScalar(3.2);
        const r = line([new THREE.Vector3(SUN_D - SUN_R * 1.3, 0, 0).add(off), new THREE.Vector3(SUN_D * 0.42, 0, 0).add(off)], col('equi'), dark ? 0.45 : 0.55, [0.35, 0.35]);
        rays.add(r);
      }
      grp.add(rays);
      L.ref.rays = rays;
      return grp;
    }

    // ---- 影錐：地球與月球的本影、半影（寬度與 2D 相同倍率放大，長度依比例） ----
    function frustum(r0, r1, len, color, op) {
      const g = new THREE.CylinderGeometry(Math.max(0, r1), r0, len, 48, 1, true);
      g.translate(0, len / 2, 0);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: op, alphaMap: fadeTex, depthWrite: false, side: THREE.DoubleSide }));
      m.renderOrder = 3;
      return m;
    }
    const Y = new THREE.Vector3(0, 1, 0);
    function buildShadows(L) {
      const grp = new THREE.Group();
      const dark = isDark(), mag = B.mag();
      const sn = B.snap(), s = sn.s, m = sn.m;
      const ink = dark ? '#000000' : C.text;
      // 地球的影子
      const D0 = K.len(s), xmax = 1.35 * K.A_MOON;
      const c0 = K.cone(K.R_SUN, K.R_EARTH, D0, 0), c1 = K.cone(K.R_SUN, K.R_EARTH, D0, xmax);
      const eu = frustum(mag * c0.ru * S, mag * Math.max(0, c1.ru) * S, xmax * S, new THREE.Color(ink), dark ? 0.5 : 0.22);
      const ep = frustum(mag * c0.rp * S, mag * c1.rp * S, xmax * S, new THREE.Color(ink), dark ? 0.2 : 0.09);
      const eg = new THREE.Group();
      eg.add(eu); eg.add(ep);
      eg.quaternion.setFromUnitVectors(Y, v3(K.unit(K.mul(s, -1))));
      grp.add(eg);
      const ul = label(T('地球的本影', 'Earth’s umbra'), C.muted, { box: false, prio: 0, dir: [0, -1], gap: 4 });
      ul.position.set(0, xmax * S * 0.82, 0);
      eg.add(ul);
      // 月球的影子
      const ax = K.unit(K.sub(m, s)), Dm = K.len(K.sub(m, s));
      const cm = K.cone(K.R_SUN, K.R_MOON, Dm, 0);
      const len = 1.2 * K.A_MOON;
      const cm1 = K.cone(K.R_SUN, K.R_MOON, Dm, len);
      const front = Math.cos(sn.ph.dLam) > 0;
      const mu = frustum(mag * cm.ru * S, 0, cm.Lu * S, new THREE.Color(ink), (dark ? 0.55 : 0.3) * (front ? 1 : 0.5));
      const mp = frustum(mag * cm.rp * S, mag * cm1.rp * S, len * S, new THREE.Color(ink), (dark ? 0.18 : 0.08) * (front ? 1 : 0.5));
      const mg = new THREE.Group();
      mg.add(mu); mg.add(mp);
      mg.position.copy(v3(m).multiplyScalar(S));
      mg.quaternion.setFromUnitVectors(Y, v3(ax));
      grp.add(mg);
      return grp;
    }

    // ---------- 相機 ----------
    function dirOf(polar, az) { return new THREE.Vector3(Math.sin(polar) * Math.cos(az), Math.sin(polar) * Math.sin(az), Math.cos(polar)); }
    function currentSph() {
      const off = camera.position.clone().sub(controls.target);
      const d = off.length() || 1;
      return { polar: Math.acos(Math.max(-1, Math.min(1, off.z / d))), az: Math.atan2(off.y, off.x), dist: d };
    }
    function sunWorld() { const a = K.sunLon(state.t) - B.frameRot(); return new THREE.Vector3(Math.cos(a), Math.sin(a), 0); }
    function fitPoints(withSun) {
      const pts = [];
      const R = 10.9;
      for (let i = 0; i < 36; i++) { const a = i / 36 * TAU; pts.push(new THREE.Vector3(R * Math.cos(a), R * Math.sin(a), (i % 2 ? 1 : -1) * 1.1)); }
      const su = sunWorld();
      pts.push(su.clone().multiplyScalar(-1.35 * K.A_MOON * S));
      if (withSun) { pts.push(su.clone().multiplyScalar(SUN_D + SUN_R * 1.4).add(new THREE.Vector3(0, 0, SUN_R * 2.2))); }
      return pts;
    }
    function fitDistance(dir, target, withSun) {
      const fwd = dir.clone().negate();
      const right = new THREE.Vector3().crossVectors(fwd, camera.up);
      if (right.lengthSq() < 1e-14) right.set(1, 0, 0);
      right.normalize();
      const upv = new THREE.Vector3().crossVectors(right, fwd).normalize();
      const tv = Math.tan(camera.fov * Math.PI / 360), th = tv * camera.aspect;
      let d = 1;
      fitPoints(withSun).forEach(function (p0) {
        const p = p0.clone().sub(target);
        const depth = p.dot(dir);
        d = Math.max(d, depth + Math.abs(p.dot(right)) / th, depth + Math.abs(p.dot(upv)) / tv);
      });
      return d * 1.03;
    }
    let camAnim = null;
    function setNearFar(dist) {
      const near = Math.max(0.03, dist / 300);
      if (Math.abs(camera.near - near) > 0.1 * near) { camera.near = near; camera.updateProjectionMatrix(); }
    }
    /** 相機移到 (polar, az) 方向、自動取景；動畫 0.65 秒（減少動態效果時直接跳過去） */
    function camTo(polar, az, animate, withSun) {
      const target = withSun ? sunWorld().multiplyScalar(4) : new THREE.Vector3();
      const dist = fitDistance(dirOf(polar, az), target, withSun);
      if (!animate || B.reducedMotion) {
        camAnim = null;
        controls.target.copy(target);
        camera.position.copy(dirOf(polar, az)).multiplyScalar(dist).add(target);
        setNearFar(dist);
        controls.update();
        requestRender();
        return;
      }
      const s = currentSph();
      let da = az - s.az;
      while (da > Math.PI) da -= TAU;
      while (da < -Math.PI) da += TAU;
      camAnim = { t0: performance.now(), dur: 650, p0: s.polar, a0: s.az, d0: s.dist, p1: polar, a1: s.az + da, d1: dist, tg0: controls.target.clone(), tg1: target };
      requestRender();
    }
    function stepCamAnim() {
      if (!camAnim) return;
      const A = camAnim;
      const u = Math.min(1, (performance.now() - A.t0) / A.dur), e = 1 - Math.pow(1 - u, 3);
      const p = A.p0 + (A.p1 - A.p0) * e, a = A.a0 + (A.a1 - A.a0) * e, d = Math.exp(Math.log(A.d0) + (Math.log(A.d1) - Math.log(A.d0)) * e);
      controls.target.copy(A.tg0).lerp(A.tg1, e);
      camera.position.copy(dirOf(p, a)).multiplyScalar(d).add(controls.target);
      setNearFar(d);
      if (u >= 1) camAnim = null;
    }
    controls.addEventListener('start', function () { camAnim = null; });
    function resetCamera(animate) { camTo(defPolar(narrow), DEF_AZ, animate, true); }

    // ---------- 每一幀 ----------
    const tmpM = new THREE.Matrix4();
    function basisFrom(xa, za) {
      const z = za.clone().sub(xa.clone().multiplyScalar(xa.dot(za))).normalize();
      const y = new THREE.Vector3().crossVectors(z, xa);
      return tmpM.makeBasis(xa, y, z);
    }
    function update() {
      C = B.colors();
      const sn = B.snap(), el = state.el, mag = B.mag();
      world.rotation.z = -B.frameRot();
      layer('stars', [colorVer].join('|'), buildStars, scene);
      layer('ecl', [colorVer, TH, B.lang()].join('|'), buildEcliptic);
      // 軌道：形狀只和「近地點離交點多遠」有關（0.25° 才重建一次）；Ω、i 由整組的旋轉精確表示
      const om = K.norm(K.periLon(el, state.t) - K.nodeLon(el, state.t));
      const okey = [Math.round(om / K.DEG * 4), el.e, el.inc, colorVer, TH, B.lang()].join('|');
      layer('orbit', okey, buildOrbit, orbitGroup);
      orbitGroup.rotation.set(el.inc, 0, sn.node, 'ZXY');
      const LB = layer('bodies', [mag, colorVer, TH, B.lang()].join('|'), buildBodies);
      const R = LB.ref;
      // 地球自轉：本地 x 軸 = 格林威治子午線方向（赤道座標中轉過恆星時），z 軸 = 北天極
      const th = K.lst(state.t, K.LON_TW) - K.LON_TW;
      const ex = v3(K.eqToEcl(K.v3(Math.cos(th), Math.sin(th), 0))), ez = v3(K.eqToEcl(K.v3(0, 0, 1)));
      R.earth.quaternion.setFromRotationMatrix(basisFrom(ex, ez));
      const P = sn.P;
      R.tw.position.copy(v3(P).multiplyScalar(R.rE * 1.02 / K.R_EARTH));
      R.elab.position.set(0, 0, 0);
      anchorDir(R.elab, R.rE);
      // 月球
      const mp = v3(sn.m).multiplyScalar(S);
      R.moon.position.copy(mp);
      R.moon.quaternion.setFromRotationMatrix(basisFrom(mp.clone().negate().normalize(), new THREE.Vector3(0, 0, 1)));
      R.mlab.position.copy(mp);
      anchorDir(R.mlab, R.rM);
      const mat = R.moon.material, ty = sn.lunar.type;
      const base = new THREE.Color(1, 1, 1), cop = new THREE.Color(C.copper);
      if (ty === 'total') { mat.color.copy(cop).multiplyScalar(0.55); mat.emissive.copy(cop).multiplyScalar(0.18); }
      else if (ty === 'partial') { mat.color.copy(base).lerp(cop, 0.45); mat.emissive.setRGB(0, 0, 0); }
      else if (ty === 'penumbral') { mat.color.setRGB(0.72, 0.72, 0.72); mat.emissive.setRGB(0, 0, 0); }
      else { mat.color.copy(base); mat.emissive.setRGB(0, 0, 0); }
      // 太陽與光
      const su = v3(K.unit(sn.s));
      R.sun.position.copy(su).multiplyScalar(SUN_D);
      sunLight.position.copy(su).multiplyScalar(60);
      sunLight.target.position.set(0, 0, 0);
      R.rays.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), su);
      // 影錐（距離改變 0.2% 以上、月球移動才重建）
      const key = [mag, colorVer, Math.round(sn.m.x / 50), Math.round(sn.m.y / 50), Math.round(sn.m.z / 50), Math.round(K.sunLon(state.t) / K.DEG * 20), B.lang()].join('|');
      layer('shadows', key, buildShadows);
      updateHud(sn);
    }
    function anchorDir(sp, r) { sp.userData.gapR = r; }
    const lp = new THREE.Vector3(), cp = new THREE.Vector3();
    function fadeSun() {
      const L = layers.bodies;
      if (!L || !L.ref.sun) return;
      // 從太陽方向看時，太陽會擋在地球前面：淡化它
      const sp = L.ref.sun.getWorldPosition(lp), c = camera.position;
      const tt = sp.dot(c) / Math.max(1e-6, c.lengthSq());
      let op = 1;
      if (tt > 0 && tt < 1) {
        const perp = sp.clone().sub(c.clone().multiplyScalar(tt)).length();
        if (perp < SUN_R * 2.6) op = 0.12;
      }
      L.ref.sun.material.uniforms.op.value = op;
      L.ref.sunGlow.material.opacity = op * (isDark() ? 0.75 : 0.6);
      L.ref.sunLab.visible = op > 0.5;
      // 從太陽方向附近看時，平行的光線會變成放射狀的線，先藏起來
      const cd = c.clone().sub(controls.target).normalize(), sd = sp.clone().normalize();
      L.ref.rays.visible = cd.dot(sd) < Math.cos(25 * Math.PI / 180);
    }

    // ---------- 標籤排版：低重要度的標籤碰到重要標籤或 HUD 就隱藏 ----------
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
        if (r.width) hudRects.push([r.left - cr.left, cr.bottom - r.bottom, r.width, r.height]);
      });
    }
    function overlaps(a, b) { return a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3]; }
    function pxPerUnitAt(p) {
      const d = p.distanceTo(camera.position);
      return ch / (2 * Math.tan(camera.fov * Math.PI / 360) * Math.max(1e-6, d));
    }
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
        sp.getWorldPosition(lp);
        const gap = u.gapR ? u.gap + u.gapR * pxPerUnitAt(lp) : u.gap;
        anchorLabel(sp, u.dir[0], u.dir[1], gap);
        let op = u.inPlane ? fade : 1;
        cp.copy(lp).project(camera);
        if (cp.z > 1) op = 0;
        else {
          const px = (cp.x + 1) / 2 * cw, py = (cp.y + 1) / 2 * ch, lw = u.lw, lh = u.lh;
          if (px > -M && px < cw + M && py > -M && py < ch + M) {
            if (px - sp.center.x * lw < M) sp.center.x = (px - M) / lw;
            else if (px - sp.center.x * lw + lw > cw - M) sp.center.x = (px - (cw - M - lw)) / lw;
            if (py - sp.center.y * lh < M) sp.center.y = (py - M) / lh;
            else if (py - sp.center.y * lh + lh > ch - M) sp.center.y = (py - (ch - M - lh)) / lh;
          }
          const r = [px - sp.center.x * lw, py - sp.center.y * lh, lw, lh, u.prio];
          if (op > 0 && (taken.some(function (q) { return (q[4] > u.prio || (u.prio < 2 && q[4] === u.prio)) && overlaps(q, r); }) ||
              (u.prio < 2 && hudRects.some(function (q) { return overlaps(q, r); })))) op = 0;
          if (op > 0.05) taken.push(r);
        }
        if (sp.material.opacity !== op) sp.material.opacity = op;
      });
    }
    const hudLast = {};
    function setHud(k, txt, cls) {
      if (hudLast[k] !== txt) { hudLast[k] = txt; hudEl[k].textContent = txt; }
      if (cls !== undefined && hudLast[k + '#'] !== cls) { hudLast[k + '#'] = cls; hudEl[k].className = cls; }
    }
    function updateHud(sn) {
      setHud('t', B.fmtWhen(state.t));
      setHud('ph', B.phaseName(sn.key) + T('・照亮 ', ' · lit ') + B.num(sn.ph.illum * 100, 1) + '%');
      let e = '';
      if (sn.lunar.type !== 'none') e = B.eclName('lunar', sn.lunar.type, true);
      else if (sn.solar.type !== 'none') e = B.eclName('solar', sn.solar.type, true);
      setHud('ecl', e || T('沒有日月食', 'No eclipse'), e ? 'e' : 'm');
      const nd = Math.min(Math.abs(K.wrapPi(sn.s.lon - sn.node)), Math.abs(K.wrapPi(sn.s.lon - sn.node - Math.PI))) / K.DEG;
      setHud('node', T('交點線與太陽方向夾 ', 'Line of nodes ') + B.num(nd, 1) + T('°', '° from the Sun'));
      setHud('scale', B.mag() === 1 ? T('真實比例：地球、月球與距離都依比例；太陽的距離與大小未按比例', 'True scale: Earth, Moon and distances to scale; the Sun is not')
        : T('尺寸未按比例：地球、月球與影子寬度放大 ' + B.mag() + ' 倍（距離依比例）', 'Not to scale: Earth, Moon and shadow widths ×' + B.mag() + ' (distances to scale)'));
    }

    // ---------- 繪製 ----------
    let raf = 0, lastAspect = 0;
    function renderNow() {
      if (!api.active || document.hidden) return;
      const want = Math.min(window.devicePixelRatio || 1, 2);
      if (renderer.getPixelRatio() !== want) { renderer.setPixelRatio(want); resize3(); return; }
      stepCamAnim();
      const moved = controls.update();
      setNearFar(camera.position.distanceTo(controls.target));
      if (layers.stars && layers.stars.obj) layers.stars.obj.position.copy(camera.position);
      fadeSun();
      layoutLabels();
      renderer.render(scene, camera);
      if (moved || camAnim) requestRender();
    }
    function requestRender() {
      if (raf || !api.active) return;
      raf = requestAnimationFrame(function () { raf = 0; renderNow(); });
    }
    function sizeOf(w) { return Math.round(w < 560 ? w * 1.16 : Math.min(w * 0.68, 600)); }
    function resize3() {
      const w = wrap.clientWidth;
      if (!w) return;
      const nar = w < 560;
      const h = sizeOf(w);
      if (canvas.style.height !== h + 'px') canvas.style.height = h + 'px';
      cw = w; ch = h;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (nar !== narrow) { narrow = nar; TH = narrow ? 1.3 : 1; }
      sizeLabels();
      if (Math.abs(camera.aspect - lastAspect) > 1e-3) {
        const s = lastAspect ? currentSph() : { polar: defPolar(narrow), az: DEF_AZ };
        lastAspect = camera.aspect;
        camTo(s.polar, s.az, false, true);
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
      if (!api.active) return;
      if (B.onContextLost) B.onContextLost();
    });

    const api = {
      active: true,
      frame: function () { update(); renderNow(); },
      busy: function () { return !!camAnim; },
      onShow: function () { lastAspect = 0; resize3(); },
      onTheme: function () {
        colorVer++;
        C = B.colors();
        if (earthTex) { earthTex.dispose(); earthTex = null; }
        Object.keys(hudLast).forEach(function (k) { delete hudLast[k]; });
        update();
        requestRender();
      },
      onScale: function () { update(); requestRender(); },
      resetCamera: function () { resetCamera(true); },
      /** 'top'：從黃道北極往下看（與 2D 相同）；'edge'：沿交點線、從黃道面側邊看；'sun'：從太陽的方向看地球 */
      camTo: function (kind) {
        const s = currentSph();
        if (kind === 'top') { camTo(1e-4, -Math.PI / 2, true, true); return; }
        if (kind === 'sun') { const a = K.sunLon(state.t) - B.frameRot(); camTo(Math.PI / 2, a, true, false); return; }
        let a = B.snap().node - B.frameRot();
        if (Math.cos(a - s.az) < 0) a += Math.PI;
        camTo(Math.PI / 2, a, true, false);
      },
      dispose: function () {
        api.active = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize3);
        document.removeEventListener('visibilitychange', onVisible);
        controls.dispose();
        disposeObject(scene);
        glowTex.dispose(); fadeTex.dispose();
        if (earthTex) earthTex.dispose();
        if (moonTex) moonTex.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        wrap.remove();
      }
    };

    // 初始化
    const w0 = wrap.clientWidth;
    if (w0) {
      narrow = w0 < 560; TH = narrow ? 1.3 : 1;
      cw = w0; ch = sizeOf(w0);
      canvas.style.height = ch + 'px';
      renderer.setSize(cw, ch, false);
      camera.aspect = cw / ch;
      camera.updateProjectionMatrix();
      lastAspect = camera.aspect;
    }
    update();
    resetCamera(false);
    return api;
  }

  window.Moon3D = { create: create };
})();
