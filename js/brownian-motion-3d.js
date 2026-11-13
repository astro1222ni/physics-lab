/* brownian-motion-3d.js — 「布朗運動與原子的存在」的 3D 立體檢視（three.js 由 brownian-motion.js 以 import() 延遲載入後傳進來）
 *
 * 用法：const v = BrownianMotion3D.create({ THREE, OrbitControls }, env)
 *   env.host     放畫布的元素
 *   env.core     BrownianMotionCore
 *   env.T        T('中文', 'English')
 *   env.state()  目前狀態：{ mode: 'micro' | 'sed',
 *                  micro: { run（simulateRun 的結果，與 2D 同一組亂數步）, t（目前時間 s）, done, a（m）, key, trails } 或 null,
 *                  sed: { pos（{n, x, y, h}，與 2D 同一組顆粒）, Lx, Ly, Hv, H（m）, a（m）, layers, key } }
 *   env.tokens() 顏色（--bm-* 與 drawkit 的顏色）
 *   env.lost()   WebGL 環境中斷時呼叫
 * 回傳 { active, update(), rebuild(), onTheme(), resetCamera(), dispose() }
 *
 * 顯微鏡模式：每顆顆粒的位移 (x − x₀, y − y₀, z − z₀) 從同一個原點畫起，場景座標 (X, Y, Z) = (Δx, Δz, −Δy) × S，
 *   S = 10 / σ_end（σ_end = √(2D t_end) 是觀察結束時每個方向的分散）；z 是顯微鏡看不到的深度方向（光軸）畫成鉛直。
 *   半透明球的半徑 σ(t) = √(2Dt)。三維高斯分布落在一個 σ 之內的機率只有約 0.199，所以大部分顆粒在球外。
 * 沉降模式：方形玻璃管，場景座標 (X, Y, Z) = (x − Lx/2, h, y − Ly/2) × S，S = 20 / Hv；旁邊畫 n ∝ exp(−h/H)。
 */
(function () {
  'use strict';

  function create(lib, env) {
    const THREE = lib.THREE, C = env.core, T = env.T;
    let tok = env.tokens();
    let cur = null;
    const V = function (x, y, z) { return new THREE.Vector3(x, y, z); };

    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', T('3D 立體檢視：顯微鏡模式是同一組顆粒從同一點出發擴散成的雲與 σ 球殼；沉降模式是玻璃管中的顆粒與指數分布（可拖曳旋轉、縮放）',
      '3D view: in microscope mode the cloud of particles spreading from one point with the σ shell; in sedimentation mode the particles in a glass tube with the exponential profile (drag to rotate, pinch or scroll to zoom)'));
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
    controls.minDistance = 8;
    controls.maxDistance = 300;

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
    scene.add(new THREE.HemisphereLight(0xf2f6ff, 0x3a3530, 0.75));
    const sun = new THREE.DirectionalLight(0xfff4e6, 1.5);
    sun.position.set(-18, 46, 26);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.radius = 4;
    sun.shadow.bias = -0.0006;
    const sc = sun.shadow.camera;
    sc.left = -30; sc.right = 30; sc.bottom = -30; sc.top = 30; sc.near = 5; sc.far = 140;
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xcfe0ff, 0.5);
    fill.position.set(40, 16, -30);
    scene.add(fill);

    // ---- 小工具 ----
    const owned = [];
    function own(x) { owned.push(x); return x; }
    function std(color, metal, rough, extra) {
      return own(new THREE.MeshStandardMaterial(Object.assign({ color: color, metalness: metal, roughness: rough }, extra || {})));
    }
    const FONT = 'system-ui, -apple-system, "Segoe UI", "Noto Sans TC", sans-serif';
    const F3 = function (px, w) { return (w || '600') + ' ' + px + 'px ' + FONT; };
    const col = function (c, fb) { try { return new THREE.Color(c || fb); } catch (e) { return new THREE.Color(fb); } };

    // ---- 名稱標示（canvas 畫成 sprite；含下標：parts = ['k', ['B']]） ----
    const labels = [];
    const LS = 0.03;
    function drawLabelCanvas(c, parts, color) {
      const g = c.getContext('2d'), px = 54, fm = F3(px), fs = F3(Math.round(px * 0.7));
      let w = 0;
      const ws = parts.map(function (p) { g.font = Array.isArray(p) ? fs : fm; const v = g.measureText(Array.isArray(p) ? p[0] : p).width; w += v; return v; });
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
        const sub = Array.isArray(p);
        g.font = sub ? fs : fm;
        g.fillText(sub ? p[0] : p, x, H / 2 + 2 + (sub ? px * 0.26 : 0));
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
      const ls = camera.aspect < 1.1 ? LS * 1.15 : LS;
      sp.scale.set(ls * sp.userData.k, ls, 1);
    }

    // ---- 材質（顏色在 applyColors 依深淺色更新） ----
    const grainMat = std(0xc98a12, 0.05, 0.42);
    const shellMat = own(new THREE.MeshPhysicalMaterial({ color: 0x15803d, metalness: 0, roughness: 0.2, transparent: true, opacity: 0.13, depthWrite: false, side: THREE.DoubleSide }));
    const ringMat = own(new THREE.MeshBasicMaterial({ color: 0x15803d, transparent: true, opacity: 0.7 }));
    const trailMat = own(new THREE.LineBasicMaterial({ color: 0x7c3aed, transparent: true, opacity: 0.45, depthWrite: false }));
    const axisMat = own(new THREE.LineBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.8 }));
    const originMat = std(0x222222, 0.2, 0.5);
    const glassMat = own(new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.05, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide }));
    const liquidMat = own(new THREE.MeshStandardMaterial({ color: 0xdcecf2, metalness: 0, roughness: 0.3, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.BackSide }));
    const edgeMat = own(new THREE.LineBasicMaterial({ color: 0x9fb4bd, transparent: true, opacity: 0.9 }));
    const layerMat = own(new THREE.LineDashedMaterial({ color: 0x888888, dashSize: 0.6, gapSize: 0.5, transparent: true, opacity: 0.5 }));
    const curveMat = own(new THREE.LineBasicMaterial({ color: 0x15803d }));
    const baseMat = std(0x8f9aa0, 0.6, 0.35);
    const shadowMat = own(new THREE.ShadowMaterial({ opacity: 0.22 }));
    const gridMatColor = 0x888888;

    // =====================================================================
    // 顯微鏡：從同一點擴散的雲
    // =====================================================================
    const microG = new THREE.Group(); scene.add(microG);
    const sphereGeo = own(new THREE.SphereGeometry(1, 20, 14));
    let microInst = null, trailLines = [], microKey = '', S = 1, sigmaEnd = 1;
    const shell = new THREE.Mesh(own(new THREE.SphereGeometry(1, 48, 32)), shellMat);
    shell.renderOrder = 2;
    microG.add(shell);
    const ring = new THREE.Mesh(own(new THREE.TorusGeometry(1, 0.006, 8, 96)), ringMat);
    ring.rotation.x = Math.PI / 2;
    microG.add(ring);
    const origin = new THREE.Mesh(own(new THREE.SphereGeometry(0.22, 16, 12)), originMat);
    microG.add(origin);
    const floorY = -17;
    const floor = new THREE.Mesh(own(new THREE.PlaneGeometry(60, 60)), shadowMat);
    floor.rotation.x = -Math.PI / 2; floor.position.y = floorY; floor.receiveShadow = true;
    microG.add(floor);
    const grid = new THREE.GridHelper(40, 20, gridMatColor, gridMatColor);
    grid.position.y = floorY + 0.01;
    grid.material.transparent = true; grid.material.opacity = 0.18; grid.material.depthWrite = false;
    owned.push(grid.material, grid.geometry);
    microG.add(grid);
    // 座標軸：x、y（焦平面）與 z（深度、光軸）
    const axLen = 15;
    const axGeo = own(new THREE.BufferGeometry().setFromPoints([V(-axLen, 0, 0), V(axLen, 0, 0), V(0, 0, axLen), V(0, 0, -axLen), V(0, -axLen, 0), V(0, axLen, 0)]));
    const axes = new THREE.LineSegments(axGeo, axisMat);
    microG.add(axes);
    const Lm = {
      x: label(['x'], '#cbd5e1'), y: label(['y'], '#cbd5e1'),
      z: label([T('z（深度，顯微鏡看不到）', 'z (depth, invisible to the microscope)')], '#cbd5e1', [0, 0.5]),
      sig: label(['σ'], '#86efac', [1, 0.5]), t: label(['t'], '#e2e8f0', [0, 0]), inside: label(['0'], '#e2e8f0', [0, 1])
    };
    Lm.x.position.set(axLen + 1, 0, 0); Lm.y.position.set(0, 0, -axLen - 1); Lm.z.position.set(0.6, axLen + 0.8, 0);
    function buildMicro(m) {
      if (microInst) { microG.remove(microInst); microInst.dispose(); microInst = null; }
      trailLines.forEach(function (l) { microG.remove(l); l.geometry.dispose(); });
      trailLines = [];
      if (!m) return;
      const run = m.run;
      sigmaEnd = Math.sqrt(2 * run.D * run.F * run.dt);
      S = 10 / sigmaEnd;
      microInst = new THREE.InstancedMesh(sphereGeo, grainMat, run.N);
      microInst.castShadow = true;
      const cHi = col(tok['grain-hi'], '#b4232c'), cG = col(tok.grain, '#c98a12');
      for (let i = 0; i < run.N; i++) microInst.setColorAt(i, i === 0 ? cHi : cG);
      microG.add(microInst);
      for (let i = 0; i < run.N; i++) {
        const arr = new Float32Array((run.F + 1) * 3);
        for (let f = 0; f <= run.F; f++) {
          const q = f * run.N + i;
          arr[3 * f] = (run.x[q] - run.x[i]) * S;
          arr[3 * f + 1] = (run.z[q] - run.z[i]) * S;
          arr[3 * f + 2] = -(run.y[q] - run.y[i]) * S;
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
        const l = new THREE.Line(g, trailMat);
        l.frustumCulled = false;
        trailLines.push(l); microG.add(l);
      }
    }
    const mtx = new THREE.Matrix4(), qI = new THREE.Quaternion(), vP = new THREE.Vector3(), vS = new THREE.Vector3();
    function updateMicro(m) {
      const has = !!m;
      [shell, ring, origin].forEach(function (o) { o.visible = has; });
      Lm.sig.visible = Lm.t.visible = Lm.inside.visible = has;
      if (!has) return;
      if (m.key !== microKey) { microKey = m.key; buildMicro(m); }
      const run = m.run, fl = Math.max(0, Math.min(run.F, m.t / run.dt)), f0 = Math.floor(fl), f1 = Math.min(run.F, f0 + 1), u = fl - f0;
      const r = 0.55; // 顆粒畫成固定大小的小球（不照比例），才看得清楚整團雲
      const sig = Math.sqrt(2 * run.D * Math.max(m.t, 1e-9));
      let inside = 0;
      for (let i = 0; i < run.N; i++) {
        const a = f0 * run.N + i, b = f1 * run.N + i;
        const dx = run.x[a] + (run.x[b] - run.x[a]) * u - run.x[i];
        const dy = run.y[a] + (run.y[b] - run.y[a]) * u - run.y[i];
        const dz = run.z[a] + (run.z[b] - run.z[a]) * u - run.z[i];
        if (dx * dx + dy * dy + dz * dz < sig * sig) inside++;
        vP.set(dx * S, dz * S, -dy * S); vS.set(r, r, r);
        mtx.compose(vP, qI, vS);
        microInst.setMatrixAt(i, mtx);
      }
      microInst.instanceMatrix.needsUpdate = true;
      trailLines.forEach(function (l) { l.visible = !!m.trails; l.geometry.setDrawRange(0, f0 + 1); });
      const R = Math.max(1e-3, sig * S);
      shell.scale.set(R, R, R); ring.scale.set(R, R, R);
      const um = sig * 1e6;
      relabel(Lm.sig, ['σ = √(2Dt) = ' + (um >= 10 ? um.toFixed(1) : um.toFixed(2)) + ' μm']);
      Lm.sig.position.set(-R * 0.72 - 0.4, R * 0.72, 0);
      relabel(Lm.t, ['t = ' + m.t.toFixed(1) + ' s']);
      Lm.t.position.set(-axLen, floorY + 0.6, axLen);
      relabel(Lm.inside, [T('球內 ', 'Inside the sphere: ') + inside + ' / ' + run.N + T('（理論約 20%）', ' (theory ≈ 20%)')]);
      Lm.inside.position.set(-axLen, floorY + 0.2, axLen);
    }

    // =====================================================================
    // 沉降：方形玻璃管
    // =====================================================================
    const sedG = new THREE.Group(); scene.add(sedG);
    let sedInst = null, sedKey = '', SS = 1, tubeTop = 22;
    const sedStatic = new THREE.Group(); sedG.add(sedStatic);
    const Ls = { curve: label(['n ∝ exp(−h/H)'], '#86efac', [0, 0.5]), H: label(['H'], '#86efac', [0, 0.5]), h: label([T('高度 h', 'height h')], '#cbd5e1', [0.5, 0]) };
    function clearStatic() {
      for (let i = sedStatic.children.length - 1; i >= 0; i--) { const o = sedStatic.children[i]; if (o.geometry) o.geometry.dispose(); sedStatic.remove(o); }
    }
    function buildSed(s) {
      clearStatic();
      if (sedInst) { sedG.remove(sedInst); sedInst.dispose(); sedInst = null; }
      SS = 20 / s.Hv;
      const w = s.Lx * SS, d = s.Ly * SS;
      tubeTop = 20 * 1.12;
      // 玻璃管與液體
      const glass = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, tubeTop + 0.6, d + 0.5), glassMat);
      glass.position.y = (tubeTop + 0.6) / 2 - 0.3; glass.renderOrder = 3;
      sedStatic.add(glass);
      const liq = new THREE.Mesh(new THREE.BoxGeometry(w, tubeTop * 0.97, d), liquidMat);
      liq.position.y = tubeTop * 0.97 / 2; liq.renderOrder = 1;
      sedStatic.add(liq);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w + 0.5, tubeTop + 0.6, d + 0.5)), edgeMat);
      edges.position.copy(glass.position);
      sedStatic.add(edges);
      const base = new THREE.Mesh(new THREE.BoxGeometry(w + 3, 0.8, d + 3), baseMat);
      base.position.y = -0.7; base.receiveShadow = true; base.castShadow = true;
      sedStatic.add(base);
      const fl = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), shadowMat);
      fl.rotation.x = -Math.PI / 2; fl.position.y = -1.1; fl.receiveShadow = true;
      sedStatic.add(fl);
      // 分層線（繞管子一圈）
      for (let j = 1; j < s.layers; j++) {
        const y = 20 * j / s.layers, hw = w / 2 + 0.26, hd = d / 2 + 0.26;
        const g = new THREE.BufferGeometry().setFromPoints([V(-hw, y, hd), V(hw, y, hd), V(hw, y, -hd), V(-hw, y, -hd), V(-hw, y, hd)]);
        const l = new THREE.Line(g, layerMat); l.computeLineDistances();
        sedStatic.add(l);
      }
      // 旁邊的 n(h) 曲線：x 方向長度 ∝ exp(−h/H)，畫在管子右側
      const x0 = w / 2 + 2, amp = 9, pts = [];
      for (let k = 0; k <= 80; k++) { const h = k / 80 * s.Hv; pts.push(V(x0 + amp * Math.exp(-h / s.H), h * SS, -d / 2)); }
      const curve = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), curveMat);
      sedStatic.add(curve);
      const axis = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([V(x0, 0, -d / 2), V(x0, 21, -d / 2), V(x0, 0, -d / 2), V(x0 + amp + 1, 0, -d / 2)]), axisMat);
      sedStatic.add(axis);
      const yH = Math.min(20, s.H * SS);
      const tick = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([V(x0 - 0.4, yH, -d / 2), V(x0 + amp * Math.exp(-1), yH, -d / 2)]), ringMat);
      sedStatic.add(tick);
      Ls.curve.position.set(x0 + 1.2, Math.min(18, yH + 4), -d / 2);
      Ls.H.position.set(x0 + amp * Math.exp(-1) + 0.4, yH, -d / 2);
      Ls.h.position.set(x0, 21.5, -d / 2);
      sedInst = new THREE.InstancedMesh(sphereGeo, grainMat, s.pos.n);
      sedInst.castShadow = true;
      const cG = col(tok.grain, '#c98a12');
      for (let i = 0; i < s.pos.n; i++) sedInst.setColorAt(i, cG);
      sedG.add(sedInst);
    }
    function updateSed(s) {
      if (s.key + '|' + s.pos.n !== sedKey) { sedKey = s.key + '|' + s.pos.n; buildSed(s); }
      const r = Math.max(0.1, s.a * SS), w = s.Lx * SS, d = s.Ly * SS, p = s.pos;
      for (let i = 0; i < p.n; i++) {
        const y = p.h[i] * SS, ok = y < tubeTop * 0.97 - r;
        vP.set(p.x[i] * SS - w / 2, Math.max(r, y), p.y[i] * SS - d / 2);
        const k = ok ? r : 0; vS.set(k, k, k);
        mtx.compose(vP, qI, vS);
        sedInst.setMatrixAt(i, mtx);
      }
      sedInst.instanceMatrix.needsUpdate = true;
      const um = s.H * 1e6;
      relabel(Ls.H, ['H = ' + (um >= 10 ? um.toFixed(1) : um.toFixed(2)) + ' μm']);
    }

    // ---- 顏色 ----
    function applyColors() {
      tok = env.tokens();
      grainMat.color.set(0xffffff); // 顆粒顏色由 instanceColor 決定
      shellMat.color.copy(col(tok.theory, '#15803d'));
      ringMat.color.copy(col(tok.theory, '#15803d'));
      curveMat.color.copy(col(tok.theory, '#15803d'));
      trailMat.color.copy(col(tok.trail, '#7c3aed'));
      axisMat.color.copy(col(tok.muted, '#888888'));
      layerMat.color.copy(col(tok.muted, '#888888'));
      edgeMat.color.copy(col(tok.tube, '#9fb4bd'));
      liquidMat.color.copy(col(tok.liquid, '#dcecf2'));
      shadowMat.opacity = tok.dark ? 0.4 : 0.2;
      grid.material.opacity = tok.dark ? 0.22 : 0.16;
      microKey = ''; sedKey = '';
    }

    // ---- 取景 ----
    function fit() {
      const s = cur || {};
      let target, R;
      if (s.mode === 'sed') { target = V(3, 10, 0); R = 20; }
      else { target = V(0, -2, 0); R = 25; }
      const dir = V(0.9, 0.62, 1.3).normalize();
      const half = camera.fov * Math.PI / 360;
      let dist = R / Math.sin(half);
      if (camera.aspect < 1) dist /= Math.max(0.55, camera.aspect);
      controls.target.copy(target);
      camera.position.copy(target).addScaledVector(dir, dist * 0.92);
      camera.near = Math.max(0.3, dist / 200); camera.far = dist * 20;
      camera.updateProjectionMatrix();
      controls.update();
    }

    // ---- 標籤留在畫面內：超出邊緣就移動錨點（3D 位置不變），窄螢幕或轉動後不會被裁掉 ----
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
      const ls = camera.aspect < 1.1 ? LS * 1.15 : LS;
      labels.forEach(function (l) { l.scale.set(ls * l.userData.k, ls, 1); });
      if (cur) update(); else requestRender();
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

    let lastMode = '';
    function update() {
      const s = env.state();
      cur = s;
      const micro = s.mode === 'micro';
      microG.visible = micro; sedG.visible = s.mode === 'sed';
      Object.keys(Lm).forEach(function (k) { Lm[k].visible = micro; });
      Object.keys(Ls).forEach(function (k) { Ls[k].visible = s.mode === 'sed'; });
      if (s.mode !== lastMode) { lastMode = s.mode; fit(); }
      if (micro) updateMicro(s.micro);
      else if (s.mode === 'sed' && s.sed) updateSed(s.sed);
      requestRender();
    }

    const api = {
      active: true,
      update: update,
      rebuild: function () { lastMode = ''; microKey = ''; sedKey = ''; update(); },
      onTheme: function () { applyColors(); update(); },
      resetCamera: function () { fit(); requestRender(); },
      dispose: function () {
        api.active = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize3);
        document.removeEventListener('visibilitychange', onVisible);
        controls.dispose();
        if (microInst) microInst.dispose();
        if (sedInst) sedInst.dispose();
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

    applyColors();
    const w0 = canvas.clientWidth, h0 = canvas.clientHeight;
    if (w0 && h0) { renderer.setSize(w0, h0, false); camera.aspect = w0 / h0; camera.updateProjectionMatrix(); lastAspect = camera.aspect; }
    cur = env.state();
    fit();
    return api;
  }

  window.BrownianMotion3D = { create: create };
})();
