/*
 * trig-functions-3d.js — 「三角函數：單位圓與正弦波」的 3D 螺旋檢視（three.js）
 *
 * 由 js/trig-functions.js 在使用者按「3D 螺旋」時才載入（three.js 也是那時才以 import() 載入）；切回 2D 時整個釋放。
 * 用法：window.Trig3D.create({ THREE, OrbitControls }, 容器, bridge) → { active, update, updateP, onTheme, resetCamera, dispose }
 *
 * 場景座標：X 是函數的自變數 x（弧度，0–4π），Y 是 A cos(ωx + φ)（深度方向），Z 是 A sin(ωx + φ) + k（朝上）。
 * 螺旋線 (x, A cos(ωx + φ), A sin(ωx + φ) + k) 與它的三個正投影：
 *   後牆（Y = 常數）上是正弦波 z = A sin(ωx + φ) + k；地面（Z = 常數）上是餘弦波 y = A cos(ωx + φ)；端牆（X = 常數）上是圓。
 * 1 個場景單位 = 1（x 與 y、z 同一個比例，所以螺旋線的形狀是真的）。
 */
(function () {
  'use strict';
  const FONT = 'system-ui, -apple-system, "Segoe UI", "Noto Sans TC", "PingFang TC", sans-serif';
  const RES = 3;
  const PI = Math.PI, DEG = PI / 180;
  const XMAX = 4 * PI;

  function create(lib, host, B) {
    const THREE = lib.THREE;
    const TC = B.TC, T = B.T, D = B.D, state = B.state;
    const alpha = D.alpha;
    let C = B.colors();
    const col = function (k) { return new THREE.Color(C[k] || k); };
    const isDark = function () { return !!D.dark; };

    // ---------- 畫布與資訊列 ----------
    const wrap = document.createElement('div');
    wrap.className = 't3-wrap';
    const canvas = document.createElement('canvas');
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', T('螺旋線與它的三個影子的 3D 立體檢視：側面的影子是正弦波，地面的影子是餘弦波，正面的影子是圓。拖曳旋轉，滾輪或雙指縮放。',
      '3D view of the spiral and its three shadows: the shadow on the side wall is the sine wave, the one on the floor is the cosine wave and the one on the end wall is the circle. Drag to rotate; scroll or pinch to zoom.'));
    wrap.appendChild(canvas);
    const hud = document.createElement('div');
    hud.className = 't3-hud';
    hud.setAttribute('aria-hidden', 'true');
    hud.innerHTML = '<div class="tl"><span data-k="eq"></span><span class="m" data-k="p"></span></div><div class="bl"><span class="m" data-k="tip"></span></div>';
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
    const camera = new THREE.PerspectiveCamera(32, 16 / 10, 0.05, 500);
    camera.up.set(0, 0, 1);
    let cw = 300, ch = 200, narrow = false;

    // ---------- 視角控制 ----------
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.rotateSpeed = 0.85;
    controls.screenSpacePanning = true;
    let startAng = null;
    controls.addEventListener('start', function () { startAng = [controls.getAzimuthalAngle(), controls.getPolarAngle()]; });
    controls.addEventListener('end', function () {
      if (!startAng) return;
      const da = controls.getAzimuthalAngle() - startAng[0];
      const turned = Math.abs(Math.atan2(Math.sin(da), Math.cos(da))) + Math.abs(controls.getPolarAngle() - startAng[1]);
      startAng = null;
      if (turned > 0.1) {
        B.onRotate();
        // 順著螺旋線的軸（x 方向）看過去：視線和 x 軸的夾角
        const dir = camera.position.clone().sub(controls.target).normalize();
        const ang = Math.acos(Math.min(1, Math.abs(dir.x))) / DEG;
        if (ang < 6) B.onAxis(ang);
      }
    });

    // ---------- 光線與環境反光 ----------
    const hemi = new THREE.HemisphereLight(0xffffff, 0x3a4250, 0.9);
    hemi.position.set(0, 0, 1);
    scene.add(hemi);
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.9);
    keyLight.position.set(6, 10, 14);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
    fillLight.position.set(-8, 4, -3);
    scene.add(fillLight);
    const pmrem = new THREE.PMREMGenerator(renderer);
    let envRT = null;
    function buildEnv() {
      if (envRT) { envRT.dispose(); envRT = null; }
      const s = new THREE.Scene();
      const g = new THREE.SphereGeometry(10, 32, 16);
      g.rotateX(Math.PI / 2);
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
    function lineObj(points, color, opacity, dashed) {
      const mat = dashed
        ? new THREE.LineDashedMaterial({ color: color, transparent: true, opacity: opacity, dashSize: dashed[0], gapSize: dashed[1], depthWrite: false })
        : new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: opacity, depthWrite: false });
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), mat);
      if (dashed) l.computeLineDistances();
      l.renderOrder = 8;
      return l;
    }
    function segs(pairs, color, opacity) {
      const pts = [];
      pairs.forEach(function (p) { pts.push(p[0], p[1]); });
      const l = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: opacity, depthWrite: false }));
      l.renderOrder = 2;
      return l;
    }
    /** 沿函數 fn(t) → Vector3（t ∈ [t0, t1]）的管子 */
    function tubeAlong(fn, t0, t1, n, r, color, opt) {
      opt = opt || {};
      class Path extends THREE.Curve {
        getPoint(u, target) { const p = fn(t0 + (t1 - t0) * u); return (target || new THREE.Vector3()).copy(p); }
      }
      const geo = new THREE.TubeGeometry(new Path(), n, r, opt.radial || 10, !!opt.closed);
      const mat = opt.basic
        ? new THREE.MeshBasicMaterial({ color: color, transparent: opt.opacity != null, opacity: opt.opacity == null ? 1 : opt.opacity })
        : new THREE.MeshPhysicalMaterial({ color: color, roughness: 0.32, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.25, emissive: color, emissiveIntensity: 0.12 });
      return new THREE.Mesh(geo, mat);
    }
    function ball(p, r, color, emissive) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 20),
        new THREE.MeshPhysicalMaterial({ color: color, roughness: 0.28, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.2, emissive: color, emissiveIntensity: emissive == null ? 0.2 : emissive }));
      m.position.copy(p);
      return m;
    }
    // 文字標籤（Sprite，固定像素大小）
    function label(text, color, opt) {
      opt = opt || {};
      const px = (opt.size || (narrow ? 11.5 : 13)) * RES;
      const font = (opt.italic ? 'italic ' : '') + (opt.weight || 700) + ' ' + px + 'px ' + FONT;
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
        g.strokeStyle = alpha(color, 0.5); g.lineWidth = RES; g.stroke();
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
      const k = 2 * Math.tan(camera.fov * Math.PI / 360) / Math.max(1, ch);
      sp.scale.set(sp.userData.lw * k, sp.userData.lh * k, 1);
    }
    function sizeLabels() { scene.traverse(function (o) { if (o.userData && o.userData.isLabel) fitLabel(o); }); }

    // ---------- 場景的範圍（依目前曲線決定） ----------
    // 相機在 −y 那一側，x 往右增加（和 2D 一樣：圓在左、圖在右）；後牆在 y = yW（正的那一側），yHi 是靠近觀看者的前緣（負的）
    const box = { xEnd: -1.2, xMax: XMAX + 0.6, yW: 1.8, zLo: -1.8, zHi: 1.8, yHi: -1.8 };
    const fitC = new THREE.Vector3();
    let fitR = 8;
    function computeBox() {
      const p = B.curve();
      const a = Math.max(1, Math.abs(p.A));
      const before = JSON.stringify(box);
      box.yW = a + 0.9;
      box.yHi = -(a + 0.6);
      box.zLo = Math.min(-1, p.k - Math.abs(p.A)) - 0.9;
      box.zHi = Math.max(1, p.k + Math.abs(p.A)) + 0.7;
      box.xEnd = -1.2;
      box.xMax = XMAX + 0.5;
      fitC.set((box.xEnd + box.xMax) / 2, (box.yW + box.yHi) / 2, (box.zLo + box.zHi) / 2);
      fitR = 0.5 * Math.hypot(box.xMax - box.xEnd, box.yW - box.yHi, box.zHi - box.zLo);
      return before !== JSON.stringify(box);
    }

    // ---------- 物件 ----------
    const gWalls = new THREE.Group(), gMain = new THREE.Group(), gProbe = new THREE.Group();
    scene.add(gWalls, gMain, gProbe);
    function wallMat(tint) {
      const base = new THREE.Color(C['canvas-bg']);
      base.lerp(new THREE.Color(tint), isDark() ? 0.08 : 0.05);
      return new THREE.MeshStandardMaterial({ color: base, roughness: 0.92, metalness: 0, transparent: true, opacity: isDark() ? 0.72 : 0.8, side: THREE.DoubleSide, depthWrite: false });
    }
    function buildWalls() {
      clearGroup(gWalls);
      const lenX = box.xMax - box.xEnd, midX = (box.xMax + box.xEnd) / 2;
      const hZ = box.zHi - box.zLo, midZ = (box.zHi + box.zLo) / 2;
      const wY = box.yW - box.yHi, midY = (box.yHi + box.yW) / 2;
      // 後牆（正弦的影子）：XZ 平面，Y = yW
      const back = new THREE.Mesh(new THREE.PlaneGeometry(lenX, hZ), wallMat(C['tf-sin']));
      back.rotation.x = PI / 2; back.position.set(midX, box.yW, midZ);
      // 地面（餘弦的影子）：XY 平面，Z = zLo
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(lenX, wY), wallMat(C['tf-cos']));
      floor.position.set(midX, midY, box.zLo);
      // 端牆（圓的影子）：YZ 平面，X = xEnd
      const endGeo = new THREE.PlaneGeometry(wY, hZ);
      endGeo.rotateX(PI / 2); // 寬沿 X、高沿 Z
      endGeo.rotateZ(PI / 2); // 寬改沿 Y、法向量朝 +X
      const end = new THREE.Mesh(endGeo, wallMat(C['tf-circle']));
      end.position.set(box.xEnd, midY, midZ);
      gWalls.add(back, floor, end);
      // 格線：每 π/2 一條（縱向），整數高度一條（橫向）
      const ink = col('text');
      const minor = [], major = [];
      for (let x = 0; x <= XMAX + 1e-9; x += PI / 2) {
        const arr = Math.abs((x / PI) - Math.round(x / PI)) < 1e-9 ? major : minor;
        arr.push([new THREE.Vector3(x, box.yW - 0.005, box.zLo), new THREE.Vector3(x, box.yW - 0.005, box.zHi)]);
        arr.push([new THREE.Vector3(x, box.yW, box.zLo + 0.005), new THREE.Vector3(x, box.yHi, box.zLo + 0.005)]);
      }
      for (let z = Math.ceil(box.zLo); z <= box.zHi; z++) major.push([new THREE.Vector3(box.xEnd, box.yW - 0.005, z), new THREE.Vector3(box.xMax, box.yW - 0.005, z)]);
      for (let y = Math.ceil(box.yHi); y <= box.yW; y++) major.push([new THREE.Vector3(box.xEnd, y, box.zLo + 0.005), new THREE.Vector3(box.xMax, y, box.zLo + 0.005)]);
      // 端牆的十字（y = 0 與 z = k）
      const k = B.curve().k;
      major.push([new THREE.Vector3(box.xEnd + 0.005, box.yW, k), new THREE.Vector3(box.xEnd + 0.005, box.yHi, k)]);
      major.push([new THREE.Vector3(box.xEnd + 0.005, 0, box.zLo), new THREE.Vector3(box.xEnd + 0.005, 0, box.zHi)]);
      gWalls.add(segs(minor, ink, isDark() ? 0.08 : 0.07), segs(major, ink, isDark() ? 0.2 : 0.16));
      // x 軸（螺旋線的中心軸）
      gWalls.add(lineObj([new THREE.Vector3(box.xEnd, 0, k), new THREE.Vector3(box.xMax, 0, k)], ink, 0.45, [0.18, 0.12]));
      // 刻度標籤：沿地面前緣
      for (let n = 1; n <= 4; n++) {
        gWalls.add(label(TC.piText(n * 180), C.muted, { at: new THREE.Vector3(n * PI, box.yHi, box.zLo), dir: [0, -1], size: narrow ? 10.5 : 11.5, weight: 600 }));
      }
      gWalls.add(label('0', C.muted, { at: new THREE.Vector3(0, box.yHi, box.zLo), dir: [0, -1], size: narrow ? 10.5 : 11.5, weight: 600 }));
      gWalls.add(label('x', C.text, { at: new THREE.Vector3(box.xMax, 0, k), dir: [1, 0], italic: true }));
      // 三面牆的名稱
      gWalls.add(label(T('側面的影子：正弦', 'Side wall: sine'), C['tf-sin'], { at: new THREE.Vector3(2.5 * PI, box.yW, box.zHi), dir: [0, 1], pill: true, size: narrow ? 10.5 : 12 }));
      gWalls.add(label(T('地面的影子：餘弦', 'Floor: cosine'), C['tf-cos'], { at: new THREE.Vector3(2.5 * PI, box.yHi + 0.15, box.zLo), dir: [0, 1], pill: true, size: narrow ? 10.5 : 12 }));
      gWalls.add(label(T('正面的影子：圓', 'End wall: circle'), C['tf-circle'], { at: new THREE.Vector3(box.xEnd, box.yHi + 0.1, box.zHi - 0.1), dir: [1, -1], pill: true, size: narrow ? 10.5 : 12 }));
    }
    function helixPt(p, x) { const h = TC.helix(p, x); return new THREE.Vector3(h[0], h[1], h[2]); }
    function buildMain() {
      clearGroup(gMain);
      const p = B.curve();
      const amp = Math.abs(p.A);
      const n = Math.max(240, Math.ceil(XMAX * p.w * 40));
      const helixCol = state.mode === 'sum' ? col('tf-sum') : col('tf-circle');
      if (amp > 1e-6) {
        gMain.add(tubeAlong(function (x) { return helixPt(p, x); }, 0, XMAX, n, narrow ? 0.055 : 0.05, helixCol));
      } else {
        gMain.add(tubeAlong(function (x) { return new THREE.Vector3(x, 0, p.k); }, 0, XMAX, 4, 0.05, helixCol));
      }
      // 三個影子（貼在牆上的細管）
      const off = 0.02;
      gMain.add(tubeAlong(function (x) { const h = TC.helix(p, x); return new THREE.Vector3(x, box.yW - off, h[2]); }, 0, XMAX, n, 0.03, col('tf-sin'), { basic: true, radial: 6 }));
      gMain.add(tubeAlong(function (x) { const h = TC.helix(p, x); return new THREE.Vector3(x, h[1], box.zLo + off); }, 0, XMAX, n, 0.03, col('tf-cos'), { basic: true, radial: 6 }));
      if (amp > 1e-6) gMain.add(tubeAlong(function (t) { return new THREE.Vector3(box.xEnd + off, amp * Math.cos(t), amp * Math.sin(t) + p.k); }, 0, 2 * PI, 96, 0.03, col('tf-circle'), { basic: true, radial: 6, closed: true }));
    }
    let probe = null;
    function buildProbe() {
      clearGroup(gProbe);
      const p = B.curve(), x0 = Math.max(0, Math.min(XMAX, B.cursor()));
      const P = helixPt(p, x0);
      const amp = Math.abs(p.A);
      const pS = new THREE.Vector3(x0, box.yW - 0.02, P.z), pC = new THREE.Vector3(x0, P.y, box.zLo + 0.02), pE = new THREE.Vector3(box.xEnd + 0.02, P.y, P.z);
      const ink = col('text');
      gProbe.add(lineObj([P, pS], col('tf-sin'), 0.75, [0.12, 0.08]));
      gProbe.add(lineObj([P, pC], col('tf-cos'), 0.75, [0.12, 0.08]));
      gProbe.add(lineObj([P, pE], col('tf-circle'), 0.6, [0.12, 0.08]));
      // 跟著 P 移動的參考圓（x = x₀ 的切片）
      if (amp > 1e-6) {
        const ring = [];
        for (let i = 0; i <= 72; i++) { const t = i / 72 * 2 * PI; ring.push(new THREE.Vector3(x0, amp * Math.cos(t), amp * Math.sin(t) + p.k)); }
        gProbe.add(lineObj(ring, ink, 0.35));
        gProbe.add(lineObj([new THREE.Vector3(x0, 0, p.k), P], ink, 0.55));
      }
      const r = narrow ? 0.16 : 0.14;
      gProbe.add(ball(P, r, col('probe'), 0.25));
      gProbe.add(ball(pS, r * 0.6, col('tf-sin'), 0.35));
      gProbe.add(ball(pC, r * 0.6, col('tf-cos'), 0.35));
      gProbe.add(ball(pE, r * 0.6, col('tf-circle'), 0.35));
      gProbe.add(label('P', C.text, { at: P, dir: [1, 1], italic: true }));
      probe = P;
      updateHud();
    }
    function updateHud() {
      const p = B.curve();
      let eq;
      if (state.mode === 'unit') eq = 'y = sin x';
      else if (state.mode === 'sum') eq = 'r sin(x + φ)：r = ' + B.num(Math.abs(p.A), 3) + T('，', ', ') + 'φ = ' + B.num(p.phi, 1) + '°';
      else eq = TC.waveText(p);
      if (state.mode === 'sum') eq = eq.replace('：', T('：', ': '));
      setHud('eq', eq);
      const x0 = B.cursor();
      setHud('p', 'x = ' + B.radShort(x0) + T('，', ', ') + 'P = (' + B.num(x0, 2) + ', ' + B.num(probe ? probe.y : 0, 2) + ', ' + B.num(probe ? probe.z : 0, 2) + ')');
      setHud('tip', T('從側面、從下面、從正面各看一次', 'Look from the side, from below and from the front'));
    }

    // ---------- 視角 ----------
    let lastFitDist = 0, lastAspect = 0;
    function fitDistance() {
      const vf = camera.fov * Math.PI / 180;
      const hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
      return fitR / Math.sin(Math.min(vf, hf) / 2) * (narrow ? 1.02 : 0.8);
    }
    function defaultDir() { return new THREE.Vector3(narrow ? 0.62 : 0.42, -1, narrow ? 0.62 : 0.5).normalize(); }
    function setLimits() {
      controls.minDistance = fitR * 0.3;
      controls.maxDistance = fitR * 5;
      camera.near = fitR * 0.01;
      camera.far = fitR * 40;
      camera.updateProjectionMatrix();
    }
    function resetCamera() {
      const d = fitDistance();
      controls.target.copy(fitC);
      camera.position.copy(fitC).addScaledVector(defaultDir(), d);
      lastFitDist = d;
      setLimits();
      controls.update();
      requestRender();
    }
    function refit() {
      const cur = camera.position.distanceTo(controls.target);
      const ratio = lastFitDist ? cur / lastFitDist : 1;
      const dir = camera.position.clone().sub(controls.target).normalize();
      const d = fitDistance();
      controls.target.copy(fitC);
      camera.position.copy(fitC).addScaledVector(dir, d * ratio);
      lastFitDist = d;
      setLimits();
    }

    // ---------- 繪製 ----------
    let raf = 0;
    function renderNow() {
      if (!api.active || document.hidden) return;
      const want = Math.min(window.devicePixelRatio || 1, 2);
      if (renderer.getPixelRatio() !== want) { renderer.setPixelRatio(want); resize3(); return; }
      const moved = controls.update();
      renderer.render(scene, camera);
      if (moved) requestRender();
    }
    function requestRender() {
      if (raf || !api.active) return;
      raf = requestAnimationFrame(function () { raf = 0; renderNow(); });
    }
    function resize3() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      cw = w; ch = h;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      const nar = w < 560;
      if (nar !== narrow) { narrow = nar; rebuildAll(); }
      sizeLabels();
      if (Math.abs(camera.aspect - lastAspect) > 1e-3) {
        const first = !lastAspect;
        lastAspect = camera.aspect;
        if (first) resetCamera(); else refit();
      }
      renderNow();
    }
    function rebuildAll() {
      const changed = computeBox();
      buildWalls();
      buildMain();
      buildProbe();
      if (changed && lastAspect) refit();
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
    // 鍵盤：左右方向鍵轉動視角（OrbitControls 的鍵盤只平移，這裡改成繞軸轉）
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
      const v = new THREE.Vector3().setFromSpherical(sph);
      camera.position.copy(controls.target).add(new THREE.Vector3(v.x, -v.z, v.y));
      controls.update();
      requestRender();
      B.onRotate();
      const dir = camera.position.clone().sub(controls.target).normalize();
      const ang = Math.acos(Math.min(1, Math.abs(dir.x))) / DEG;
      if (ang < 6) B.onAxis(ang);
    });

    const api = {
      active: true,
      update: function () { rebuildAll(); requestRender(); },
      updateP: function () { buildProbe(); requestRender(); },
      onTheme: function () {
        C = B.colors();
        buildEnv();
        Object.keys(hudLast).forEach(function (k) { delete hudLast[k]; });
        rebuildAll();
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
      camera.aspect = cw / ch;
      camera.updateProjectionMatrix();
      lastAspect = camera.aspect;
    }
    rebuildAll();
    resetCamera();
    return api;
  }

  window.Trig3D = { create: create };
})();
