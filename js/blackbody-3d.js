/* blackbody-3d.js — 「黑體輻射與普朗克定律」的 3D 光譜曲面（three.js 由 blackbody.js 以 import() 延遲載入後傳進來）
 *
 * 用法：const v = Blackbody3D.create({ THREE, OrbitControls }, env)
 *   env.host     放畫布的元素
 *   env.core     BlackbodyCore
 *   env.T        T('中文', 'English')
 *   env.state()  目前狀態：{ T（K）, showRJ（是否畫瑞利–金斯曲面）, kept（保留的溫度陣列） }
 *   env.tokens() 顏色（--bb-* 與 drawkit 的顏色）
 *   env.lost()   WebGL 環境中斷時呼叫
 * 回傳 { active, update(), rebuild(), onTheme(), resetCamera(), dispose() }
 *
 * 場景座標（三個軸都是對數）：
 *   X = 5 × (log10 λ + 5)          λ：10 nm – 10 mm  → X：−15 … +15
 *   Z = −4.5 × (log10 T − 2.5)     T：2.5 K – 40000 K → Z：約 +9.5 … −9.5（冷的在前、熱的在後，高的曲線不會擋住低的）
 *   Y = 0.6 × (log10 M_λ + 15)     M_λ 以 W·m⁻²·nm⁻¹ 計，低於 10^−15 截平在 Y = 0
 * 曲面每一點都由物理核心的 log10ExitanceNm 算出（不經過指數，2.5 K 的短波也不會下溢）。
 * 山脊 λmax T = b 在對數座標下是直線：log λmax = log b − log T，峰高 ∝ T^5（每 10 倍溫度升 5 個數量級）。
 */
(function () {
  'use strict';

  const LGMIN = -15, SY = 0.6, SX = 5, SZ = 4.5;
  const LX = [-8, -2];

  function create(lib, env) {
    const THREE = lib.THREE, C = env.core, T = env.T;
    let tok = env.tokens();
    let cur = null;
    const V = function (x, y, z) { return new THREE.Vector3(x, y, z); };
    const LG = Math.log10;
    const X = function (lgl) { return SX * (lgl + 5); };
    const Z = function (lgt) { return -SZ * (lgt - 2.5); };
    const Y = function (lgm) { return SY * (Math.max(lgm, LGMIN) - LGMIN); };
    const LT = [LG(C.T_MIN), LG(C.T_MAX)];
    const YMAX = Y(C.log10ExitanceNm(C.lamMax(C.T_MAX), C.T_MAX));

    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', T('3D 立體檢視：黑體光譜曲面，三個軸分別是對數波長、對數溫度與對數光譜出射度；綠色的粗線是目前溫度的光譜，金色的線是峰值的山脊（可拖曳旋轉、縮放）',
      '3D view: the black-body spectral surface over log wavelength and log temperature, with log spectral exitance as height; the thick green line is the spectrum at the current temperature and the golden line is the ridge of peaks (drag to rotate, pinch or scroll to zoom)'));
    env.host.appendChild(canvas);
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    } catch (e) { canvas.remove(); throw e; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1.4, 0.5, 2000);
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.minDistance = 10;
    controls.maxDistance = 200;
    controls.maxPolarAngle = Math.PI * 0.495;

    // ---- 環境反射（攝影棚） ----
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(new THREE.BoxGeometry(100, 100, 100), new THREE.MeshBasicMaterial({ color: 0x3a4246, side: THREE.BackSide })));
    [[0, 48, 0, 60, 60, 2.4], [-48, 10, 20, 30, 50, 1.3], [48, 5, 10, 24, 40, 0.9], [0, 10, 48, 50, 20, 0.8]].forEach(function (p) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(p[3], p[4]), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(p[5]), side: THREE.DoubleSide }));
      m.position.set(p[0], p[1], p[2]); m.lookAt(0, 0, 0);
      envScene.add(m);
    });
    const envRT = pmrem.fromScene(envScene, 0.04);
    scene.environment = envRT.texture;
    envScene.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });

    // ---- 燈光 ----
    scene.add(new THREE.HemisphereLight(0xf2f6ff, 0x3a3530, 0.8));
    const sun = new THREE.DirectionalLight(0xfff4e6, 1.4);
    sun.position.set(-20, 40, 24);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.radius = 4;
    sun.shadow.bias = -0.0008;
    const sc = sun.shadow.camera;
    sc.left = -24; sc.right = 24; sc.bottom = -24; sc.top = 24; sc.near = 5; sc.far = 120;
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xcfe0ff, 0.45);
    fill.position.set(36, 14, -28);
    scene.add(fill);

    // ---- 小工具 ----
    const owned = [];
    function own(x) { owned.push(x); return x; }
    const FONT = 'system-ui, -apple-system, "Segoe UI", "Noto Sans TC", sans-serif';
    const F3 = function (px, w) { return (w || '600') + ' ' + px + 'px ' + FONT; };
    const col = function (c, fb) { try { return new THREE.Color(c || fb); } catch (e) { return new THREE.Color(fb); } };

    // ---- 名稱標示（canvas 畫成 sprite）：parts 的元素是字串，或 [字串, 'sub'|'sup'] ----
    const labels = [];
    const LS = 0.03;
    function drawLabelCanvas(c, parts, color) {
      const g = c.getContext('2d'), px = 54, fm = F3(px), fs = F3(Math.round(px * 0.7));
      let w = 0;
      const ws = parts.map(function (p) { g.font = Array.isArray(p) ? fs : fm; const v = g.measureText(Array.isArray(p) ? p[0] : p).width + (Array.isArray(p) ? 2 : 0); w += v; return v; });
      const W = Math.ceil(w) + 40, H = Math.ceil(px * 1.6);
      c.width = W; c.height = H;
      const r = H * 0.32;
      g.beginPath();
      g.moveTo(r, 2); g.lineTo(W - r, 2); g.quadraticCurveTo(W - 2, 2, W - 2, r); g.lineTo(W - 2, H - r); g.quadraticCurveTo(W - 2, H - 2, W - r, H - 2);
      g.lineTo(r, H - 2); g.quadraticCurveTo(2, H - 2, 2, H - r); g.lineTo(2, r); g.quadraticCurveTo(2, 2, r, 2); g.closePath();
      g.fillStyle = 'rgba(8,13,16,0.8)'; g.fill();
      g.lineWidth = 3; g.strokeStyle = color; g.globalAlpha = 0.65; g.stroke(); g.globalAlpha = 1;
      g.fillStyle = color; g.textBaseline = 'middle'; g.textAlign = 'left';
      let x = 20;
      parts.forEach(function (p, i) {
        const small = Array.isArray(p), dy = !small ? 0 : p[1] === 'sup' ? -px * 0.3 : px * 0.26;
        g.font = small ? fs : fm;
        g.fillText(small ? p[0] : p, x + (small ? 1 : 0), H / 2 + 2 + dy);
        x += ws[i];
      });
      return W / H;
    }
    function label(parts, color, center) {
      const c = document.createElement('canvas');
      const k = drawLabelCanvas(c, parts, color);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false, sizeAttenuation: false });
      const sp = new THREE.Sprite(mat);
      sp.userData = { k: k, c: c, parts: parts, color: color, key: JSON.stringify(parts) + color };
      sp.scale.set(LS * k, LS, 1);
      if (center) sp.center.set(center[0], center[1]);
      sp.renderOrder = 10;
      labels.push(sp);
      scene.add(sp);
      return sp;
    }
    function relabel(sp, parts, color) {
      const key = JSON.stringify(parts) + (color || sp.userData.color);
      if (key === sp.userData.key) return;
      sp.userData.key = key; sp.userData.parts = parts; if (color) sp.userData.color = color;
      sp.userData.k = drawLabelCanvas(sp.userData.c, parts, sp.userData.color);
      // 畫布尺寸變了：WebGL 材質的大小不能改，要換一張新的
      const old = sp.material.map;
      const t = new THREE.CanvasTexture(sp.userData.c);
      t.colorSpace = THREE.SRGBColorSpace;
      sp.material.map = t; sp.material.needsUpdate = true;
      if (old) old.dispose();
      const ls = camera.aspect < 1.1 ? LS * 0.85 : LS;
      sp.scale.set(ls * sp.userData.k, ls, 1);
    }

    // =====================================================================
    // 光譜曲面（只建一次；顏色隨深淺色更新）
    // =====================================================================
    // 波長取樣：整體每 0.025 個數量級，可見光段加密到每 5 nm，讓真實顏色清楚
    const lgls = [];
    for (let i = 0; i <= 240; i++) lgls.push(LX[0] + (LX[1] - LX[0]) * i / 240);
    for (let nm = 380; nm <= 780; nm += 5) lgls.push(LG(nm * 1e-9));
    lgls.sort(function (a, b) { return a - b; });
    for (let i = lgls.length - 1; i > 0; i--) if (lgls[i] - lgls[i - 1] < 1e-4) lgls.splice(i, 1);
    const NZ = 97;
    const lgts = [];
    for (let j = 0; j < NZ; j++) lgts.push(LT[0] + (LT[1] - LT[0]) * j / (NZ - 1));
    const NX = lgls.length;
    const surfGeo = own(new THREE.BufferGeometry());
    const pos = new Float32Array(NX * NZ * 3), colr = new Float32Array(NX * NZ * 3), hgt = new Float32Array(NX * NZ);
    for (let j = 0; j < NZ; j++) {
      const t = Math.pow(10, lgts[j]);
      for (let i = 0; i < NX; i++) {
        const k = j * NX + i, lgm = C.log10ExitanceNm(Math.pow(10, lgls[i]), t);
        hgt[k] = Y(lgm);
        pos[3 * k] = X(lgls[i]); pos[3 * k + 1] = hgt[k]; pos[3 * k + 2] = Z(lgts[j]);
      }
    }
    const idx = [];
    for (let j = 0; j < NZ - 1; j++) for (let i = 0; i < NX - 1; i++) {
      const a = j * NX + i, b = a + 1, c = a + NX, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    surfGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    surfGeo.setAttribute('color', new THREE.BufferAttribute(colr, 3));
    surfGeo.setIndex(idx);
    surfGeo.computeVertexNormals();
    const surfMat = own(new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.0, roughness: 0.62, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
    const surf = new THREE.Mesh(surfGeo, surfMat);
    surf.castShadow = true; surf.receiveShadow = true;
    scene.add(surf);
    const tmpC = new THREE.Color(), tA = new THREE.Color(), tB = new THREE.Color();
    function paintSurface() {
      const low = col(tok.dark ? '#26313b' : '#b9c3cc', '#999999');
      const hot = col(tok.planck, '#c2410c');
      const tints = { uv: col(tok.uv, '#7c3aed'), ir: col(tok.ir, '#b91c1c'), mw: col(tok.mw, '#0e7490') };
      for (let i = 0; i < NX; i++) {
        const nm = Math.pow(10, lgls[i]) * 1e9;
        const spec = nm >= 380 && nm <= 780 ? C.spectralRGB(nm) : null;
        const region = nm < 380 ? tints.uv : nm <= 780 ? null : nm < 1e6 ? tints.ir : tints.mw;
        for (let j = 0; j < NZ; j++) {
          const k = j * NX + i, u = Math.min(1, hgt[k] / YMAX);
          if (hgt[k] <= 1e-6) { tmpC.copy(low).multiplyScalar(0.85); }
          else if (spec) {
            tA.setRGB(spec[0] / 255, spec[1] / 255, spec[2] / 255, THREE.SRGBColorSpace);
            tmpC.copy(low).lerp(tA, Math.min(1, 0.45 + 0.9 * u));
          } else {
            tB.copy(low).lerp(region, 0.28);
            tmpC.copy(tB).lerp(hot, Math.pow(u, 1.3) * 0.9);
          }
          colr[3 * k] = tmpC.r; colr[3 * k + 1] = tmpC.g; colr[3 * k + 2] = tmpC.b;
        }
      }
      surfGeo.attributes.color.needsUpdate = true;
    }

    // ---- 瑞利–金斯曲面（網格線；勾選時才顯示） ----
    const rjMat = own(new THREE.LineBasicMaterial({ color: 0x1d4ed8, transparent: true, opacity: 0.55, depthWrite: false }));
    const rjPts = [];
    const rjY = function (lgl, lgt) { return Y(LG(C.exitanceRJ(Math.pow(10, lgl), Math.pow(10, lgt))) - 9); };
    for (let j = 0; j < NZ; j += 8) for (let i = 0; i < 240; i += 2) {
      const a = LX[0] + (LX[1] - LX[0]) * i / 240, b = LX[0] + (LX[1] - LX[0]) * (i + 2) / 240;
      rjPts.push(V(X(a), rjY(a, lgts[j]), Z(lgts[j])), V(X(b), rjY(b, lgts[j]), Z(lgts[j])));
    }
    for (let i = 0; i <= 240; i += 20) for (let j = 0; j < NZ - 1; j += 2) {
      const a = LX[0] + (LX[1] - LX[0]) * i / 240, j2 = Math.min(NZ - 1, j + 2);
      rjPts.push(V(X(a), rjY(a, lgts[j]), Z(lgts[j])), V(X(a), rjY(a, lgts[j2]), Z(lgts[j2])));
    }
    const rjLines = new THREE.LineSegments(own(new THREE.BufferGeometry().setFromPoints(rjPts)), rjMat);
    scene.add(rjLines);

    // ---- 峰值的山脊 λmax T = b（金色管子） ----
    const ridgePts = [];
    for (let j = 0; j <= 60; j++) {
      const lgt = LT[0] + (LT[1] - LT[0]) * j / 60, t = Math.pow(10, lgt), lm = C.lamMax(t);
      ridgePts.push(V(X(LG(lm)), Y(C.log10ExitanceNm(lm, t)) + 0.06, Z(lgt)));
    }
    const ridgeMat = own(new THREE.MeshStandardMaterial({ color: 0xf5b301, metalness: 0.35, roughness: 0.3, emissive: 0x6b4a00, emissiveIntensity: 0.35 }));
    const ridge = new THREE.Mesh(own(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ridgePts), 120, 0.09, 8, false)), ridgeMat);
    ridge.castShadow = true;
    scene.add(ridge);

    // ---- 目前溫度的切片（與 2D 光譜圖是同一條曲線） ----
    const sliceMat = own(new THREE.MeshStandardMaterial({ color: 0x1a6b5a, metalness: 0.1, roughness: 0.35, emissive: 0x1a6b5a, emissiveIntensity: 0.4 }));
    let slice = null, sliceKey = '';
    const keptMat = own(new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.85 }));
    let keptMeshes = [], keptKey = '';
    function sliceCurve(t, lift) {
      const lgt = LG(t), pts = [];
      for (let i = 0; i <= 200; i++) {
        const lgl = LX[0] + (LX[1] - LX[0]) * i / 200;
        pts.push(V(X(lgl), Y(C.log10ExitanceNm(Math.pow(10, lgl), t)) + lift, Z(lgt)));
      }
      return new THREE.CatmullRomCurve3(pts);
    }
    // 切片位置的半透明板（看出「切」的位置）
    const planeMat = own(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false }));
    const plane = new THREE.Mesh(own(new THREE.PlaneGeometry(X(LX[1]) - X(LX[0]), YMAX + 1)), planeMat);
    scene.add(plane);

    // ---- 底板、格線、座標軸 ----
    const shadowMat = own(new THREE.ShadowMaterial({ opacity: 0.22 }));
    const floor = new THREE.Mesh(own(new THREE.PlaneGeometry(80, 80)), shadowMat);
    floor.rotation.x = -Math.PI / 2; floor.position.y = -0.02; floor.receiveShadow = true;
    scene.add(floor);
    const gridMat = own(new THREE.LineBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.35 }));
    const gp = [];
    const z0 = Z(LT[0]), z1 = Z(LT[1]), x0 = X(LX[0]), x1 = X(LX[1]);
    for (let e = LX[0]; e <= LX[1]; e++) gp.push(V(X(e), 0, z0), V(X(e), 0, z1));
    for (let e = 1; e <= 4; e++) gp.push(V(x0, 0, Z(e)), V(x1, 0, Z(e)));
    gp.push(V(x0, 0, z0), V(x0, 0, z1), V(x1, 0, z0), V(x1, 0, z1), V(x0, 0, z0), V(x1, 0, z0), V(x0, 0, z1), V(x1, 0, z1));
    // 縱軸（左後角）與它的刻度
    for (let e = LGMIN; e <= 10; e += 5) gp.push(V(x0, Y(e), z0), V(x0 + 0.6, Y(e), z0));
    gp.push(V(x0, 0, z0), V(x0, Y(10), z0));
    const gridLines = new THREE.LineSegments(own(new THREE.BufferGeometry().setFromPoints(gp)), gridMat);
    scene.add(gridLines);

    const LBL = '#e2e8f0';
    const lamNames = ['10 nm', '100 nm', '1 μm', '10 μm', '100 μm', '1 mm', '10 mm'];
    const Lx = lamNames.map(function (s, i) { const sp = label([s], LBL, [0.5, 1]); sp.position.set(X(LX[0] + i), 0, z0 + 1.2); return sp; });
    const Lt = [1, 2, 3, 4].map(function (e) { const sp = label([String(Math.pow(10, e)) + ' K'], LBL, [0, 0.5]); sp.position.set(x1 + 0.8, 0, Z(e)); return sp; });
    const Ly = [LGMIN, -10, -5, 0, 5, 10].map(function (e) { const sp = label(['10', [String(e).replace('-', '−'), 'sup']], LBL, [1, 0.5]); sp.position.set(x0 - 0.5, Y(e), z0); return sp; });
    const Lname = {
      lam: label([T('波長 λ（對數）', 'wavelength λ (log)')], '#fde68a', [0.5, 1]),
      temp: label([T('溫度 T（對數）', 'temperature T (log)')], '#fde68a', [0, 0.5]),
      m: label(['M', ['λ', 'sub'], '（W·m', ['−2', 'sup'], '·nm', ['−1', 'sup'], '）'], '#fde68a', [0.5, 0]),
      ridge: label(['λ', ['max', 'sub'], ' T = b'], '#fcd34d', [0, 0]),
      cur: label(['T'], '#ffffff', [0, 0]),
      vis: label([T('可見光', 'visible')], '#ffffff', [0.5, 0])
    };
    Lname.lam.position.set(0, 0, z0 + 3.2);
    Lname.temp.position.set(x1 + 0.8, 0, z1 - 1.4);
    Lname.m.position.set(x0, Y(10) + 1.6, z0);
    Lname.ridge.position.copy(ridgePts[22]).add(V(0.4, 0.4, 0));
    Lname.vis.position.set(X(LG(560e-9)), 0.2, z0 + 0.4);

    function applyColors() {
      tok = env.tokens();
      paintSurface();
      rjMat.color.copy(col(tok.rj, '#1d4ed8'));
      rjMat.opacity = tok.dark ? 0.6 : 0.5;
      keptMat.color.copy(col(tok.kept, '#52606d'));
      gridMat.color.copy(col(tok.muted, '#888888'));
      gridMat.opacity = tok.dark ? 0.45 : 0.4;
      shadowMat.opacity = tok.dark ? 0.4 : 0.2;
      planeMat.color.copy(col(tok.text, '#ffffff'));
      planeMat.opacity = tok.dark ? 0.07 : 0.06;
      sliceKey = ''; keptKey = '';
    }

    // ---- 取景 ----
    function fit() {
      // 窄螢幕（直式）放遠一點，左邊的縱軸與刻度才不會被切掉
      const narrow = camera.aspect < 1.2;
      const target = V(narrow ? 1 : 0, 4.5, -1), R = narrow ? 24 : 19;
      const dir = V(0.45, 0.6, 1.0).normalize();
      const vh = camera.fov * Math.PI / 360, hh = Math.atan(Math.tan(vh) * camera.aspect);
      const dist = R / Math.sin(Math.min(vh, hh));
      controls.target.copy(target);
      camera.position.copy(target).addScaledVector(dir, dist * 0.92);
      camera.near = Math.max(0.3, dist / 200); camera.far = dist * 20;
      camera.updateProjectionMatrix();
      controls.update();
    }

    // ---- 標籤留在畫面內：超出邊緣就移動錨點（3D 位置不變） ----
    const vL = new THREE.Vector3();
    function keepLabelsInView() {
      camera.updateMatrixWorld();
      const e = camera.projectionMatrix.elements, m = 0.02;
      labels.forEach(function (sp) {
        if (!sp.visible || (sp.parent && !sp.parent.visible)) return;
        if (!sp.userData.c0) sp.userData.c0 = [sp.center.x, sp.center.y];
        const c0 = sp.userData.c0;
        sp.getWorldPosition(vL).project(camera);
        if (vL.z > 1) return;
        const wN = e[0] * sp.scale.x, hN = e[5] * sp.scale.y;
        let cx = c0[0], cy = c0[1];
        if (wN < 2 - 2 * m) {
          if (vL.x - cx * wN < -1 + m) cx = (vL.x + 1 - m) / wN;
          else if (vL.x + (1 - cx) * wN > 1 - m) cx = 1 - (1 - m - vL.x) / wN;
        }
        if (hN < 2 - 2 * m) {
          if (vL.y - cy * hN < -1 + m) cy = (vL.y + 1 - m) / hN;
          else if (vL.y + (1 - cy) * hN > 1 - m) cy = 1 - (1 - m - vL.y) / hN;
        }
        sp.center.set(cx, cy);
      });
    }

    // ---- 繪製 ----
    let raf = 0;
    function renderNow() {
      if (!api.active || document.hidden) return;
      const want = Math.min(window.devicePixelRatio || 1, 2);
      if (renderer.getPixelRatio() !== want) { renderer.setPixelRatio(want); resize3(); return; }
      const moved = controls.update();
      keepLabelsInView();
      renderer.render(scene, camera);
      if (moved) requestRender();
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
      if (Math.abs(camera.aspect - lastAspect) > 0.01) { lastAspect = camera.aspect; fit(); }
      const ls = camera.aspect < 1.1 ? LS * 0.85 : LS;
      labels.forEach(function (l) { l.scale.set(ls * l.userData.k, ls, 1); });
      requestRender();
    }
    const ro = window.ResizeObserver ? new ResizeObserver(resize3) : null;
    if (ro) ro.observe(canvas); else window.addEventListener('resize', resize3);
    controls.addEventListener('change', requestRender);
    const onVisible = function () { if (!document.hidden) requestRender(); };
    document.addEventListener('visibilitychange', onVisible);
    canvas.addEventListener('webglcontextlost', function (ev) {
      ev.preventDefault();
      if (!api.active) return;
      if (env.lost) env.lost();
    });

    function fmtT(t) { return t >= 1000 ? String(Math.round(t)) : String(+t.toPrecision(4)); }
    function update() {
      const s = env.state();
      cur = s;
      rjLines.visible = !!s.showRJ;
      const key = s.T + '|' + tok.planck;
      if (key !== sliceKey) {
        sliceKey = key;
        if (slice) { scene.remove(slice); slice.geometry.dispose(); }
        slice = new THREE.Mesh(new THREE.TubeGeometry(sliceCurve(s.T, 0.08), 400, 0.13, 8, false), sliceMat);
        scene.add(slice);
        sliceMat.color.copy(col(tok.accent, '#1a6b5a'));
        sliceMat.emissive.copy(col(tok.accent, '#1a6b5a'));
        plane.position.set(0, (YMAX + 1) / 2 - 0.5, Z(LG(s.T)));
        const lm = C.lamMax(s.T);
        Lname.cur.position.set(X(LG(lm)) + 0.3, Y(C.log10ExitanceNm(lm, s.T)) + 0.9, Z(LG(s.T)));
        relabel(Lname.cur, ['T = ' + fmtT(s.T) + ' K'], '#ffffff');
      }
      const kk = (s.kept || []).join(',') + '|' + tok.kept;
      if (kk !== keptKey) {
        keptKey = kk;
        keptMeshes.forEach(function (m) { scene.remove(m); m.geometry.dispose(); });
        keptMeshes = (s.kept || []).map(function (t) {
          const m = new THREE.Mesh(new THREE.TubeGeometry(sliceCurve(t, 0.05), 200, 0.045, 6, false), keptMat);
          scene.add(m);
          return m;
        });
      }
      requestRender();
    }

    const api = {
      active: true,
      update: update,
      rebuild: function () { sliceKey = ''; keptKey = ''; update(); },
      onTheme: function () { applyColors(); update(); },
      resetCamera: function () { fit(); requestRender(); },
      dispose: function () {
        api.active = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize3);
        document.removeEventListener('visibilitychange', onVisible);
        controls.dispose();
        scene.traverse(function (o) {
          if (o.geometry) o.geometry.dispose();
          if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); });
        });
        owned.forEach(function (x) { if (x && x.dispose) x.dispose(); });
        envRT.dispose(); pmrem.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        canvas.remove();
      }
    };
    void Lx; void Lt; void Ly;

    applyColors();
    const w0 = canvas.clientWidth, h0 = canvas.clientHeight;
    if (w0 && h0) { renderer.setSize(w0, h0, false); camera.aspect = w0 / h0; camera.updateProjectionMatrix(); lastAspect = camera.aspect; }
    cur = env.state();
    fit();
    return api;
  }

  window.Blackbody3D = { create: create };
})();
