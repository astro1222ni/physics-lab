/*
 * adsr-envelope-3d.js — 「合成器的 ADSR 包絡」的 3D 檢視（three.js）
 *
 * 由 js/adsr-envelope.js 在使用者按「3D 立體」時才載入（three.js 也是那時才以 import() 載入）；切回 2D 時整個釋放。
 * 用法：window.Adsr3D.create({ THREE, OrbitControls }, 容器, bridge) → { active, update, tick, onTheme, resetCamera, dispose }
 *
 * 場景座標（z 朝上）：
 *   x = 時間（整個音的長度攤成 XL 個單位），y = 泛音次數 k（第 k 個在 y = (k − 1)·DY），
 *   z = 第 k 個泛音的振幅 (1/k)·a(t)^(q_k)（振幅刻度，× SZ），或它的分貝數換成 (dB + 60)/60（分貝刻度，× SZ）。
 *   q_k = 1 時每一列都是同一條包絡乘上 1/k；勾「高泛音衰減較快」時 q_k = 1 + 0.25(k − 1)，越高的泛音掉得越快，地形往後越陡。
 *   每個泛音一條管子（顏色依起音、衰減、延持、釋音分段），管子之間鋪半透明的地形；後牆上畫第 1 個泛音的包絡（就是 2D 圖那一條）。
 *   一片發亮的平面掃過目前的時刻（播放時跟著走，沒播放時停在 2D 圖選的時刻），平面上每個泛音一顆小球＝那一刻的頻譜。
 * 和 2D 畫面用同一個核心、同一個「目前的音」（bridge.shown / level / phase）。
 */
(function () {
  'use strict';
  const FONT = 'system-ui, -apple-system, "Segoe UI", "Noto Sans TC", "PingFang TC", sans-serif';
  const RES = 3;
  const PI = Math.PI, DEG = PI / 180;
  const XL = 10;          // 時間軸長度
  const DY = 0.75;        // 相鄰泛音的間距
  const SZ = 4;           // 振幅 1（或 0 dB）的高度
  const KMAX = 12;
  const Y_LO = -0.9, Y_HI = (KMAX - 1) * DY + 0.7;
  const X_LO = -0.3, X_HI = XL + 0.3;
  const NT = 150;         // 時間方向的取樣數
  const DB_MIN = -60;

  function create(lib, host, B) {
    const THREE = lib.THREE;
    const AC = B.AC, T = B.T, D = B.D, state = B.state;
    const alpha = D.alpha;
    let C = B.colors();
    const col = function (k) { return new THREE.Color(C[k] || k); };
    const isDark = function () { return !!D.dark; };
    const yOf = function (k) { return (k - 1) * DY; };
    /** 振幅 → 高度（依 2D 的刻度設定） */
    function zOf(v) {
      if (state.scale === 'db') { const d = AC.db(v); return d === -Infinity || d <= DB_MIN ? 0 : SZ * (d - DB_MIN) / -DB_MIN; }
      return SZ * v;
    }

    // ---------- 畫布與資訊列 ----------
    const wrap = document.createElement('div');
    wrap.className = 't3-wrap';
    const canvas = document.createElement('canvas');
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', T('包絡的 3D 立體檢視：橫軸是時間，往後排開的是第 1 到第 N 個泛音，高度是每個泛音的振幅；一片發亮的平面標出目前的時刻。拖曳旋轉，滾輪或雙指縮放，方向鍵也可以轉動。',
      '3D view of the envelope: time runs across, harmonics 1 to N are laid out from front to back, and the height is each harmonic’s amplitude; a glowing plane marks the current moment. Drag to rotate, scroll or pinch to zoom; the arrow keys also rotate.'));
    wrap.appendChild(canvas);
    const hud = document.createElement('div');
    hud.className = 't3-hud';
    hud.setAttribute('aria-hidden', 'true');
    hud.innerHTML = '<div class="tl"><span data-k="eq"></span><span class="m" data-k="p"></span></div><div class="bl"><span class="m" data-k="tip"></span></div>';
    let tipGone = false;
    function hideTip() { if (!tipGone) { tipGone = true; setHud('tip', ''); } }
    wrap.appendChild(hud);
    host.appendChild(wrap);
    const hudEl = {}, hudLast = {};
    hud.querySelectorAll('[data-k]').forEach(function (e) { hudEl[e.getAttribute('data-k')] = e; });
    function setHud(k, h) { if (hudLast[k] !== h) { hudLast[k] = h; hudEl[k].innerHTML = h; } }

    let renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true }); }
    catch (e) { wrap.remove(); throw e; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    let cw = 300, ch = 200, narrow = false;
    let viewH = 12;
    const camera = new THREE.OrthographicCamera(-8, 8, 6, -6, 0.1, 400);
    camera.up.set(0, 0, 1);
    const CAM_DIST = 60;
    function setFrustum() {
      const a = cw / Math.max(1, ch);
      camera.left = -viewH * a / 2; camera.right = viewH * a / 2;
      camera.top = viewH / 2; camera.bottom = -viewH / 2;
      camera.updateProjectionMatrix();
    }

    // ---------- 視角控制 ----------
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.rotateSpeed = 0.85;
    controls.screenSpacePanning = true;
    controls.minZoom = 0.2;
    controls.maxZoom = 8;
    let lastZoom = 1;
    controls.addEventListener('start', function () { hideTip(); });

    // ---------- 光線與環境反光 ----------
    const hemi = new THREE.HemisphereLight(0xffffff, 0x3a4250, 0.9);
    hemi.position.set(0, 0, 1);
    scene.add(hemi);
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.7);
    keyLight.position.set(5, -10, 14);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
    fillLight.position.set(-8, 6, 3);
    scene.add(fillLight);
    const pmrem = new THREE.PMREMGenerator(renderer);
    let envRT = null;
    function buildEnv() {
      if (envRT) { envRT.dispose(); envRT = null; }
      const s = new THREE.Scene();
      const g = new THREE.SphereGeometry(10, 32, 16);
      g.rotateX(PI / 2);
      const pos = g.attributes.position, cols = new Float32Array(pos.count * 3);
      const top = new THREE.Color(isDark() ? 0x5d6a80 : 0xffffff), bot = new THREE.Color(isDark() ? 0x0a0d12 : 0x7d8794);
      const c = new THREE.Color();
      for (let i = 0; i < pos.count; i++) {
        const u = Math.max(0, Math.min(1, (pos.getZ(i) / 10 + 1) / 2));
        c.copy(bot).lerp(top, Math.pow(u, 0.75));
        cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      s.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
      envRT = pmrem.fromScene(s, 0.035);
      s.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      scene.environment = envRT.texture;
    }

    // ---------- 共用工具 ----------
    function disposeObject(obj) {
      obj.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); });
      });
    }
    function clearGroup(g) { g.children.slice().forEach(function (o) { g.remove(o); disposeObject(o); }); }
    function segs(pairs, color, opacity) {
      const pts = [];
      pairs.forEach(function (p) { pts.push(p[0], p[1]); });
      const l = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: opacity, depthWrite: false }));
      l.renderOrder = 2;
      return l;
    }
    function label(text, color, opt) {
      opt = opt || {};
      const px = (opt.size || (narrow ? 11.5 : 13)) * RES;
      const font = (opt.weight || 700) + ' ' + px + 'px ' + FONT;
      const c = document.createElement('canvas');
      let g = c.getContext('2d');
      g.font = font;
      const w = g.measureText(text).width;
      const padX = 5 * RES, padY = 3 * RES;
      c.width = Math.ceil(w + 2 * padX);
      c.height = Math.ceil(px * 1.35 + 2 * padY);
      g = c.getContext('2d');
      g.font = font;
      g.textBaseline = 'middle'; g.textAlign = 'left'; g.lineJoin = 'round';
      if (opt.pill) {
        const h = c.height - 2, r = h / 2;
        g.beginPath();
        g.moveTo(r + 1, 1); g.lineTo(c.width - r - 1, 1); g.arc(c.width - r - 1, r + 1, r, -PI / 2, PI / 2); g.lineTo(r + 1, h + 1); g.arc(r + 1, r + 1, r, PI / 2, PI * 1.5);
        g.fillStyle = alpha(C['canvas-bg'], 0.88); g.fill();
        g.strokeStyle = alpha(color, 0.55); g.lineWidth = RES; g.stroke();
      } else {
        g.lineWidth = 4 * RES; g.strokeStyle = alpha(C['canvas-bg'], 0.92);
        g.strokeText(text, padX, c.height / 2);
      }
      g.fillStyle = color;
      g.fillText(text, padX, c.height / 2);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false }));
      sp.userData.lw = c.width / RES; sp.userData.lh = c.height / RES; sp.userData.isLabel = true;
      sp.renderOrder = 30;
      fitLabel(sp);
      const dir = opt.dir || [0, 0];
      const L = Math.hypot(dir[0], dir[1]);
      if (L > 0) {
        const dx = dir[0] / L, dy = dir[1] / L, gap = opt.gap == null ? 6 : opt.gap;
        sp.center.set(0.5 - dx * (sp.userData.lw / 2 + gap) / sp.userData.lw, 0.5 - dy * (sp.userData.lh / 2 + gap) / sp.userData.lh);
      }
      if (opt.at) sp.position.copy(opt.at);
      return sp;
    }
    function fitLabel(sp) {
      const k = (camera.top - camera.bottom) / (Math.max(0.01, camera.zoom) * Math.max(1, ch));
      sp.scale.set(sp.userData.lw * k, sp.userData.lh * k, 1);
    }
    function sizeLabels() { scene.traverse(function (o) { if (o.userData && o.userData.isLabel) fitLabel(o); }); }

    // ---------- 目前的音 ----------
    let sn = B.shown();
    function tEndOf(s) { return Math.max(0.02, s.rev ? s.L : s.hold + s.p.R); }
    let span = tEndOf(sn);
    const X = function (t) { return t / span * XL; };
    const fitC = new THREE.Vector3((X_LO + X_HI) / 2, (Y_LO + Y_HI) / 2, SZ * 0.42);

    // ---------- 物件 ----------
    const gWalls = new THREE.Group(), gTicksT = new THREE.Group(), gTicksK = new THREE.Group(), gTerrain = new THREE.Group(), gTubes = new THREE.Group(), gSweep = new THREE.Group(), gPills = new THREE.Group();
    scene.add(gWalls, gTicksT, gTicksK, gTerrain, gTubes, gSweep, gPills);
    function wallMat(tint, op) {
      const base = new THREE.Color(C['canvas-bg']);
      base.lerp(new THREE.Color(tint), isDark() ? 0.08 : 0.1);
      if (!isDark()) base.lerp(new THREE.Color(C.text), 0.03);
      return new THREE.MeshStandardMaterial({ color: base, roughness: 0.92, metalness: 0, transparent: true, opacity: op == null ? (isDark() ? 0.72 : 0.8) : op, side: THREE.DoubleSide, depthWrite: false });
    }
    let builtScale = null;
    function buildWalls() {
      clearGroup(gWalls); clearGroup(gTicksK);
      builtScale = state.scale;
      const zLo = -0.02, zW = SZ + 0.3;
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(X_HI - X_LO, Y_HI - Y_LO), wallMat(C.accent));
      floor.position.set((X_LO + X_HI) / 2, (Y_LO + Y_HI) / 2, zLo);
      // 後牆（XZ 平面，y = Y_HI）
      const wg = new THREE.PlaneGeometry(X_HI - X_LO, zW - zLo);
      wg.rotateX(PI / 2);
      const wall = new THREE.Mesh(wg, wallMat(C['ad-s']));
      wall.position.set((X_LO + X_HI) / 2, Y_HI + 0.02, (zW + zLo) / 2);
      gWalls.add(floor, wall);
      const ink = col('text');
      const minor = [], major = [];
      for (let k = 1; k <= KMAX; k++) minor.push([new THREE.Vector3(X_LO, yOf(k), zLo + 0.005), new THREE.Vector3(X_HI, yOf(k), zLo + 0.005)]);
      // 後牆的高度格線
      const zt = state.scale === 'db' ? [-50, -40, -30, -20, -10, 0] : [0.25, 0.5, 0.75, 1];
      zt.forEach(function (v) {
        const z = state.scale === 'db' ? SZ * (v - DB_MIN) / -DB_MIN : SZ * v;
        minor.push([new THREE.Vector3(X_LO, Y_HI, z), new THREE.Vector3(X_HI, Y_HI, z)]);
      });
      [[X_LO, Y_LO, zLo, X_HI, Y_LO, zLo], [X_HI, Y_LO, zLo, X_HI, Y_HI, zLo], [X_HI, Y_HI, zLo, X_LO, Y_HI, zLo], [X_LO, Y_HI, zLo, X_LO, Y_LO, zLo],
        [X_LO, Y_HI, zLo, X_LO, Y_HI, zW], [X_LO, Y_HI, zW, X_HI, Y_HI, zW], [X_HI, Y_HI, zW, X_HI, Y_HI, zLo]].forEach(function (q) {
        major.push([new THREE.Vector3(q[0], q[1], q[2]), new THREE.Vector3(q[3], q[4], q[5])]);
      });
      gWalls.add(segs(minor, ink, isDark() ? 0.08 : 0.09), segs(major, ink, 0.22));
      const sz = narrow ? 10.5 : 11.5;
      zt.forEach(function (v, i) {
        if (narrow && state.scale === 'db' && i % 2 === 0) return;
        const z = state.scale === 'db' ? SZ * (v - DB_MIN) / -DB_MIN : SZ * v;
        gWalls.add(label(state.scale === 'db' ? B.num(v, 0) : String(v), C.muted, { at: new THREE.Vector3(X_LO, Y_HI, z), dir: [-1, 0], size: sz, weight: 600 }));
      });
      gWalls.add(label(state.scale === 'db' ? T('dB（第 k 個泛音）', 'dB (harmonic k)') : T('振幅', 'amplitude'), C.text, { at: new THREE.Vector3(X_LO, Y_HI, zW), dir: [-0.3, 1], size: sz, weight: 600 }));
      // 泛音次數刻度（地面右緣）
      for (let k = 1; k <= KMAX; k++) {
        if (narrow && !(k === 1 || k % 4 === 0)) continue;
        gTicksK.add(label(String(k), C.muted, { at: new THREE.Vector3(X_HI, yOf(k), zLo), dir: [1, -1], size: sz, weight: 600 }));
      }
      gTicksK.add(label(narrow ? 'k →' : T('泛音次數 k →', 'harmonic k →'), C.text, { at: new THREE.Vector3(X_HI, Y_HI, zLo), dir: [1, 0.3], size: sz, weight: 600 }));
    }
    function buildTimeTicks() {
      clearGroup(gTicksT);
      const sz = narrow ? 10.5 : 11.5;
      const raw = span / (narrow ? 3 : 5), p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
      const step = (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
      const dec = Math.max(0, Math.min(4, -Math.floor(Math.log10(step) + 1e-9)));
      const ticks = [];
      for (let t = 0; t <= span + 1e-9; t += step) {
        ticks.push([new THREE.Vector3(X(t), Y_LO, 0), new THREE.Vector3(X(t), Y_LO + 0.25, 0)]);
        gTicksT.add(label(B.num(t, dec), C.muted, { at: new THREE.Vector3(X(t), Y_LO, 0), dir: [0, -1], size: sz, weight: 600 }));
      }
      gTicksT.add(segs(ticks, col('text'), 0.35));
      gTicksT.add(label(T('時間（s）→', 'time (s) →'), C.text, { at: new THREE.Vector3(X_HI, Y_LO, 0), dir: [1, -0.6], size: sz, weight: 600 }));
    }

    /** 第 k 個泛音在 t 時刻的振幅（包絡 e 的 q_k 次方 ÷ k） */
    function ampK(t, k) {
      const e = B.level(sn, t);
      return e > 0 ? Math.pow(e, AC.qOf(k, state.high)) / k : 0;
    }
    function phaseColor(t) { return new THREE.Color(B.segColor(B.phase(sn, Math.min(t, span - 1e-9)))); }
    /** 取樣時刻：均勻取樣，再補上每一段的分界（轉角才不會被削平） */
    function sampleTimes() {
      const ts = [];
      for (let i = 0; i <= NT; i++) ts.push(span * i / NT);
      const p = sn.p;
      const marks = sn.rev ? [p.R, sn.L - Math.min(p.A + p.D, sn.H), sn.L - Math.min(p.A, sn.H)] : [p.A, p.A + p.D, sn.hold];
      marks.forEach(function (m) { if (m > 0 && m < span) { ts.push(m - 1e-6); ts.push(m + 1e-6); } });
      ts.sort(function (a, b) { return a - b; });
      return ts;
    }
    function buildTerrain() {
      clearGroup(gTerrain); clearGroup(gTubes); clearGroup(gPills);
      const N = state.N;
      const ts = sampleTimes();
      const nt = ts.length;
      const cols = ts.map(phaseColor);
      const zs = [];
      for (let k = 1; k <= N; k++) zs.push(ts.map(function (t) { return zOf(ampK(t, k)); }));
      // 地形（相鄰兩列之間）
      if (N >= 2) {
        const pos = new Float32Array(nt * N * 3), cc = new Float32Array(nt * N * 3);
        const idx = [];
        const bg = new THREE.Color(C['canvas-bg']);
        for (let k = 1; k <= N; k++) {
          for (let i = 0; i < nt; i++) {
            const v = (k - 1) * nt + i;
            pos[v * 3] = X(ts[i]); pos[v * 3 + 1] = yOf(k); pos[v * 3 + 2] = zs[k - 1][i];
            const c = cols[i].clone().lerp(bg, isDark() ? 0.25 : 0.15);
            cc[v * 3] = c.r; cc[v * 3 + 1] = c.g; cc[v * 3 + 2] = c.b;
          }
        }
        for (let k = 1; k < N; k++) {
          for (let i = 0; i < nt - 1; i++) {
            const a = (k - 1) * nt + i, b = a + 1, c = k * nt + i, d = c + 1;
            idx.push(a, b, d, a, d, c);
          }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        g.setAttribute('color', new THREE.BufferAttribute(cc, 3));
        g.setIndex(idx);
        g.computeVertexNormals();
        const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0, transparent: true, opacity: isDark() ? 0.42 : 0.38, side: THREE.DoubleSide, depthWrite: false }));
        mesh.renderOrder = 1;
        gTerrain.add(mesh);
      }
      // 每個泛音的管子（顏色依段落）
      const radial = 6, r = narrow ? 0.05 : 0.042;
      for (let k = 1; k <= N; k++) {
        const pts = ts.map(function (t, i) { return new THREE.Vector3(X(t), yOf(k), zs[k - 1][i]); });
        const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0);
        const segN = Math.min(600, nt * 2);
        const geo = new THREE.TubeGeometry(curve, segN, k === 1 ? r * 1.5 : r, radial, false);
        const cArr = new Float32Array(geo.attributes.position.count * 3);
        for (let i = 0; i <= segN; i++) {
          const c = phaseColor(span * i / segN);
          for (let j = 0; j <= radial; j++) { const v = i * (radial + 1) + j; cArr[v * 3] = c.r; cArr[v * 3 + 1] = c.g; cArr[v * 3 + 2] = c.b; }
        }
        geo.setAttribute('color', new THREE.BufferAttribute(cArr, 3));
        const mat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.32, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.25,
          transparent: k > 1, opacity: k > 1 ? Math.max(0.55, 1 - 0.04 * (k - 1)) : 1, depthWrite: k === 1 });
        const tube = new THREE.Mesh(geo, mat);
        tube.renderOrder = k === 1 ? 3 : 2;
        gTubes.add(tube);
      }
      // 後牆：第 1 個泛音的包絡（和 2D 圖同一條）
      const wallPts = ts.map(function (t) { return new THREE.Vector3(X(t), Y_HI - 0.01, zOf(B.level(sn, t))); });
      const wl = new THREE.Line(new THREE.BufferGeometry().setFromPoints(wallPts), new THREE.LineBasicMaterial({ color: col('ad-wave'), transparent: true, opacity: 0.85, depthWrite: false }));
      wl.renderOrder = 2;
      gTerrain.add(wl);
      // 段落名稱（後牆頂端）
      const p = sn.p;
      const bounds = sn.rev
        ? [[0, p.R, 'R'], [p.R, sn.L - Math.min(p.A + p.D, sn.H), 'S'], [sn.L - Math.min(p.A + p.D, sn.H), sn.L - Math.min(p.A, sn.H), 'D'], [sn.L - Math.min(p.A, sn.H), sn.L, 'A']]
        : [[0, Math.min(p.A, sn.hold), 'A'], [p.A, Math.min(p.A + p.D, sn.hold), 'D'], [p.A + p.D, sn.hold, 'S'], [sn.hold, sn.hold + p.R, 'R']];
      bounds.forEach(function (b) {
        if (!(b[1] > b[0]) || X(b[1]) - X(b[0]) < (narrow ? 0.9 : 0.6)) return;
        gPills.add(label(b[2], B.segColor(b[2]), { at: new THREE.Vector3(X((b[0] + b[1]) / 2), Y_HI, SZ + 0.3), dir: [0, 1], pill: true, size: narrow ? 10.5 : 11.5 }));
      });
    }
    // 掃過的平面與每個泛音的小球
    let sweepPlane = null, sweepEdge = null, balls = [];
    function buildSweep() {
      clearGroup(gSweep);
      balls = [];
      const zW = SZ + 0.3;
      const pg = new THREE.PlaneGeometry(Y_HI - Y_LO, zW);
      pg.rotateY(PI / 2);
      sweepPlane = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ color: col('accent'), transparent: true, opacity: isDark() ? 0.16 : 0.12, side: THREE.DoubleSide, depthWrite: false }));
      sweepPlane.position.set(0, (Y_LO + Y_HI) / 2, zW / 2);
      sweepPlane.renderOrder = 4;
      sweepEdge = segs([[new THREE.Vector3(0, Y_LO, 0), new THREE.Vector3(0, Y_HI, 0)], [new THREE.Vector3(0, Y_HI, 0), new THREE.Vector3(0, Y_HI, zW)], [new THREE.Vector3(0, Y_LO, 0), new THREE.Vector3(0, Y_LO, zW)]], col('accent'), 0.8);
      gSweep.add(sweepPlane, sweepEdge);
      const sg = new THREE.SphereGeometry(narrow ? 0.12 : 0.1, 16, 12);
      for (let k = 1; k <= state.N; k++) {
        const m = new THREE.Mesh(sg, new THREE.MeshPhysicalMaterial({ color: col('probe'), roughness: 0.25, clearcoat: 0.8, emissive: col('probe'), emissiveIntensity: 0.3 }));
        m.renderOrder = 5;
        balls.push(m);
        gSweep.add(m);
      }
      placeSweep();
    }
    function placeSweep() {
      const t = Math.max(0, Math.min(span, B.cursor()));
      const x = X(t);
      sweepPlane.position.x = x;
      sweepEdge.position.x = x;
      balls.forEach(function (m, i) { m.position.set(x, yOf(i + 1), zOf(ampK(t, i + 1))); });
      const e = B.level(sn, t);
      setHud('eq', 't = ' + B.sec(t) + ' s・' + B.phaseName(B.phase(sn, t)) + '・a = ' + B.num(e, 2));
    }
    function updateHud() {
      setHud('p', state.high ? T('高泛音衰減較快：第 k 個泛音 ∝ a 的 (1 + 0.25(k − 1)) 次方 ÷ k', 'Highs fade faster: harmonic k ∝ a to the power 1 + 0.25(k − 1), divided by k')
        : T('每個泛音都是同一個包絡 × 1/k', 'Every harmonic follows the same envelope × 1/k'));
      setHud('tip', tipGone || narrow ? '' : T('拖曳旋轉、滾輪或雙指縮放；勾「高泛音衰減較快」看地形變陡', 'Drag to rotate, scroll or pinch to zoom; tick “Highs fade faster” to see the terrain steepen'));
    }
    let lastBuild = 0, sig = '';
    function signature(s) {
      return [s.rev ? 1 : 0, s.p.A, s.p.D, s.p.S, s.p.R, s.p.shape, s.rev ? s.H : s.hold, state.N, state.high ? 1 : 0, state.scale].join('|');
    }
    function rebuildAll() {
      sn = B.shown();
      span = tEndOf(sn);
      if (builtScale !== state.scale) buildWalls();
      buildTimeTicks();
      buildTerrain();
      buildSweep();
      updateHud();
      sig = signature(sn);
      lastBuild = performance.now();
    }

    // ---------- 視角 ----------
    function baseViewH() { return 10; }
    function defaultDir() { return new THREE.Vector3(narrow ? 0.5 : 0.42, -1, narrow ? 0.8 : 0.66).normalize(); }
    function fitZoom(dir) {
      const d = dir.clone().normalize();
      const fwd = d.clone().negate();
      const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 0, 1));
      if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
      right.normalize();
      const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
      const hw = cw / 2, hh = ch / 2;
      const padS = 8, padT = narrow ? 58 : 64, padB = (tipGone || narrow) ? 8 : 30;
      let s = Infinity;
      function fit(p, l, r, b, t) {
        const v = p.clone().sub(fitC), u = v.dot(right), w = v.dot(up);
        if (u > 1e-6) s = Math.min(s, Math.max(4, hw - padS - r) / u);
        if (u < -1e-6) s = Math.min(s, Math.max(4, hw - padS - l) / -u);
        if (w > 1e-6) s = Math.min(s, Math.max(4, hh - padT - t) / w);
        if (w < -1e-6) s = Math.min(s, Math.max(4, hh - padB - b) / -w);
      }
      const zW = SZ + 0.3;
      [X_LO, X_HI].forEach(function (x) { [Y_LO, Y_HI].forEach(function (y) { [0, zW].forEach(function (z) { fit(new THREE.Vector3(x, y, z), 0, 0, 0, 0); }); }); });
      [gWalls, gTicksK, gTicksT, gPills].forEach(function (g) {
        g.children.forEach(function (o) {
          if (!o.userData || !o.userData.isLabel) return;
          const lw = o.userData.lw, lh = o.userData.lh;
          fit(o.position, o.center.x * lw, (1 - o.center.x) * lw, o.center.y * lh, (1 - o.center.y) * lh);
        });
      });
      if (!isFinite(s)) return 1;
      return Math.max(controls.minZoom, Math.min(controls.maxZoom, s * viewH / Math.max(1, ch)));
    }
    function place(dir, zoom, target) {
      controls.target.copy(target);
      camera.position.copy(target).addScaledVector(dir.clone().normalize(), CAM_DIST);
      camera.zoom = zoom;
      camera.updateProjectionMatrix();
      controls.update();
      sizeLabels();
      lastZoom = camera.zoom;
      requestRender();
    }
    function resetCamera() {
      viewH = baseViewH();
      setFrustum();
      controls.enabled = true;
      place(defaultDir(), fitZoom(defaultDir()), fitC);
    }

    // ---------- 繪製 ----------
    let raf = 0, dirty = false;
    function renderNow() {
      if (!api.active || document.hidden) return;
      const want = Math.min(window.devicePixelRatio || 1, 2);
      if (renderer.getPixelRatio() !== want) { renderer.setPixelRatio(want); resize3(); return; }
      if (dirty) { dirty = false; rebuildAll(); }
      const moving = controls.update();
      if (Math.abs(camera.zoom - lastZoom) > 1e-6) { lastZoom = camera.zoom; sizeLabels(); }
      const dir = camera.position.clone().sub(controls.target).normalize();
      gTicksK.visible = Math.abs(dir.y) < 0.95;
      gTicksT.visible = Math.abs(dir.x) < 0.95;
      renderer.render(scene, camera);
      if (moving) requestRender();
    }
    function requestRender() {
      if (raf || !api.active) return;
      raf = requestAnimationFrame(function () { raf = 0; renderNow(); });
    }
    let lastAspect = 0;
    function resize3() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      cw = w; ch = h;
      renderer.setSize(w, h, false);
      const nar = w < 560;
      if (nar !== narrow) { narrow = nar; buildWalls(); dirty = true; }
      const asp = w / h;
      if (Math.abs(asp - lastAspect) > 1e-3) {
        const refit = !!lastAspect;
        lastAspect = asp;
        viewH = baseViewH();
        setFrustum();
        if (refit) {
          const d = camera.position.clone().sub(controls.target).normalize();
          camera.zoom = fitZoom(d);
          camera.updateProjectionMatrix();
        }
      }
      setFrustum();
      sizeLabels();
      renderNow();
    }
    const ro = window.ResizeObserver ? new ResizeObserver(function () { resize3(); }) : null;
    if (ro) ro.observe(canvas); else window.addEventListener('resize', resize3);
    controls.addEventListener('change', requestRender);
    const onVisible = function () { if (!document.hidden) requestRender(); };
    document.addEventListener('visibilitychange', onVisible);
    canvas.addEventListener('webglcontextlost', function (ev) {
      ev.preventDefault();
      if (!api.active) return;
      if (B.onContextLost) B.onContextLost();
    });
    canvas.addEventListener('keydown', function (ev) {
      const step = (ev.shiftKey ? 15 : 5) * DEG;
      const off = camera.position.clone().sub(controls.target);
      const sph = new THREE.Spherical().setFromVector3(new THREE.Vector3(off.x, off.z, -off.y));
      let used = true;
      if (ev.key === 'ArrowLeft') sph.theta -= step;
      else if (ev.key === 'ArrowRight') sph.theta += step;
      else if (ev.key === 'ArrowUp') sph.phi = Math.max(0.05, sph.phi - step);
      else if (ev.key === 'ArrowDown') sph.phi = Math.min(PI - 0.05, sph.phi + step);
      else used = false;
      if (!used) return;
      ev.preventDefault();
      hideTip();
      const v = new THREE.Vector3().setFromSpherical(sph);
      camera.position.copy(controls.target).add(new THREE.Vector3(v.x, -v.z, v.y));
      controls.update();
      requestRender();
    });

    const api = {
      active: true,
      update: function () { dirty = true; requestRender(); },
      /** 播放中每一格：移動掃描平面；按著不放時整個音的長度在變，最多每 0.1 秒重建一次地形 */
      tick: function () {
        if (!api.active) return;
        const s = B.shown();
        if (signature(s) !== sig) {
          if (!B.active() || performance.now() - lastBuild > 100) dirty = true;
          else { sn = s; }
        }
        if (!dirty) placeSweep();
        requestRender();
      },
      onTheme: function () {
        C = B.colors();
        buildEnv();
        Object.keys(hudLast).forEach(function (k) { delete hudLast[k]; });
        buildWalls();
        dirty = true;
        requestRender();
      },
      resetCamera: function () { resetCamera(); },
      dispose: function () {
        api.active = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize3);
        document.removeEventListener('visibilitychange', onVisible);
        controls.dispose();
        disposeObject(scene);
        if (envRT) envRT.dispose();
        pmrem.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        wrap.remove();
      }
    };

    buildEnv();
    const w0 = canvas.clientWidth, h0 = canvas.clientHeight;
    if (w0 && h0) {
      narrow = w0 < 560;
      cw = w0; ch = h0;
      renderer.setSize(cw, ch, false);
      lastAspect = cw / ch;
    }
    viewH = baseViewH();
    setFrustum();
    buildWalls();
    rebuildAll();
    resetCamera();
    return api;
  }

  window.Adsr3D = { create: create };
})();
