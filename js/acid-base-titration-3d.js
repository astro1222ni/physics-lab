/*
 * acid-base-titration-3d.js — 「酸鹼滴定」的 3D 立體檢視（可旋轉、縮放、平移）
 *
 * three.js 由 acid-base-titration.js 在切換到 3D 時才以 import() 動態載入，再傳進 Titr3D.create(lib, H)。
 * 這個檔案只「讀」2D 程式的狀態（滴定管讀數、瓶中溶液體積、pH、指示劑、空中的液滴），不改變任何化學量，
 * 也不送任務事件；液滴、活栓、攪拌子的動畫都由 2D 程式的同一條動畫迴圈推進，3D 只負責畫。
 *
 * 場景單位：1 = 1 cm；y 軸朝上，原點在磁石攪拌器正下方的桌面。
 * - 錐形瓶：與 2D 相同的真實 250 mL 錐形瓶尺寸（瓶底內半徑 4.25 cm、瓶頸 1.7 cm、錐高 10.5 cm、頸高 3.0 cm），
 *   液面高度用 2D 的同一個公式（H.hCm）由體積換算。
 * - 滴定管：每 mL 0.4 cm（真實的 50 mL 滴定管約 1 cm／mL，這裡縮短成示意），讀數是彎月面的最低點。
 * - 液滴：0.05 mL 一滴（直徑約 4.6 mm）、半滴 0.025 mL，落下的進度直接取 2D 的同一顆液滴。
 */
(function () {
  'use strict';
  // ---------- 尺寸（cm） ----------
  const STIR_H = 5.0;                 // 磁石攪拌器高度
  const GT = 0.18;                    // 錐形瓶玻璃厚度
  const FY = STIR_H + 0.02 + GT;      // 錐形瓶內底的高度
  const FIL = 0.45;                   // 錐形瓶底緣的圓角
  const BR = 0.6, BGT = 0.12;         // 滴定管內半徑、玻璃厚度
  const CM_PER_ML = 0.4;              // 滴定管刻度：每 mL 0.4 cm（示意）
  const TIP_Y = FY + 11.5;            // 滴定管尖端（伸進瓶頸約 2 cm）
  const COCK_Y = TIP_Y + 4.2;         // 活栓中心
  const TAPER_Y = COCK_Y + 2.3;       // 管身開始變細的地方
  const Y50 = TAPER_Y + 1.3;          // 50.00 mL 刻度
  const Y0ML = Y50 + 50 * CM_PER_ML;  // 0.00 mL 刻度
  const TUBE_TOP = Y0ML + 3.2;        // 管口
  const LAMBDA = 0.27;                // 水的毛細長度（cm）：彎月面沿玻璃上爬的範圍
  const NDROP = 24, NRIP = 8, NPLUME = 8;

  function create(lib, H) {
    const THREE = lib.THREE;
    const T = H.T, host = H.host, reduced = H.reduced;
    const FL = H.flask;                  // { Rb, Rn, Hc, Hn }（cm）

    const canvas = document.createElement('canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', T('滴定裝置的 3D 立體檢視：鐵架上的滴定管、磁石攪拌器上的錐形瓶、pH 計與電極；溶液顏色與 2D 相同（拖曳旋轉、滾輪或雙指縮放、右鍵或雙指拖曳平移）',
      '3D view of the titration set-up: the burette on its stand, the conical flask on the magnetic stirrer, the pH meter and electrode; the solution has the same colour as in 2D (drag to rotate, scroll or pinch to zoom, right-drag or two-finger drag to pan)'));
    host.appendChild(canvas);
    const hud = {};
    ['tl', 'tr', 'tc', 'bl'].forEach(function (k) {
      const d = document.createElement('div');
      d.className = 'r3-hud ' + k;
      d.setAttribute('aria-hidden', 'true');
      host.appendChild(d);
      hud[k] = d;
    });
    hud.bl.textContent = T('拖曳旋轉・滾輪或雙指縮放・右鍵拖曳平移', 'Drag to rotate · scroll or pinch to zoom · right-drag to pan');
    hud.tc.hidden = true;
    function removeDom() { canvas.remove(); Object.keys(hud).forEach(function (k) { hud[k].remove(); }); }

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false, powerPreference: 'default' });
    } catch (e) { removeDom(); throw e; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;     // 會投影的東西幾乎不動：只有換位置時才重算陰影
    renderer.shadowMap.needsUpdate = true;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1.5, 0.5, 900);
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = !reduced;
    controls.dampingFactor = 0.12;
    controls.minDistance = 4;
    controls.maxDistance = 220;
    controls.maxPolarAngle = Math.PI * 0.53;
    controls.screenSpacePanning = true;

    // ---------- 環境反射：簡單的攝影棚（幾片柔光板），讓玻璃有真實的高光 ----------
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(new THREE.BoxGeometry(200, 200, 200), new THREE.MeshBasicMaterial({ color: 0x5b6168, side: THREE.BackSide })));
    [[0, 90, 0, 120, 120, 2.2], [-90, 30, 30, 18, 90, 3.2], [90, 25, 10, 30, 70, 1.4], [20, 30, 90, 90, 26, 1.6], [0, 40, -90, 110, 40, 1.1]].forEach(function (p) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(p[3], p[4]), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(p[5]), side: THREE.DoubleSide }));
      m.position.set(p[0], p[1], p[2]); m.lookAt(0, 0, 0);
      envScene.add(m);
    });
    const envRT = pmrem.fromScene(envScene, 0.03);
    scene.environment = envRT.texture;
    envScene.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    pmrem.dispose();

    const hemi = new THREE.HemisphereLight(0xf4f7ff, 0x6d6457, 1.1);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff7ec, 2.0);
    sun.position.set(-34, 70, 42);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.radius = 4;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 10, far: 200 });
    scene.add(sun, sun.target);
    const fill = new THREE.DirectionalLight(0xdbe6ff, 0.55);
    fill.position.set(40, 20, -30);
    scene.add(fill);

    // ---------- 小工具 ----------
    const texs = [];
    function canvasTex(c) {
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      texs.push(t);
      return t;
    }
    const tmpC = new THREE.Color();
    /** CSS 顏色（#hex、rgb()、rgba()）→ THREE.Color（sRGB） */
    function col(s, out) {
      const r = H.rgb(s || '#888888');
      return (out || new THREE.Color()).setRGB(r[0] / 255, r[1] / 255, r[2] / 255, THREE.SRGBColorSpace);
    }
    function std(o) { return new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.5, metalness: 0 }, o)); }
    function add(geo, mat, x, y, z, opt) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x || 0, y || 0, z || 0);
      if (!opt || opt.cast !== false) m.castShadow = true;
      if (!opt || opt.recv !== false) m.receiveShadow = true;
      scene.add(m);
      return m;
    }
    const UP = new THREE.Vector3(0, 1, 0);
    /** 兩點之間的圓柱（a → b） */
    function cylBetween(mesh, a, b) {
      const d = new THREE.Vector3().subVectors(b, a), len = d.length();
      mesh.position.copy(a).addScaledVector(d, 0.5);
      mesh.quaternion.setFromUnitVectors(UP, d.normalize());
      mesh.scale.set(1, len, 1);
    }
    /** 圓角板（寬 w、深 d、高 h，底在 y = 0，水平置中） */
    function roundSlab(w, d, h, r, b) {
      const s = new THREE.Shape(), x0 = -w / 2 + b, x1 = w / 2 - b, z0 = -d / 2 + b, z1 = d / 2 - b;
      const rr = Math.max(0.01, r - b);
      s.moveTo(x0 + rr, z0); s.lineTo(x1 - rr, z0); s.quadraticCurveTo(x1, z0, x1, z0 + rr);
      s.lineTo(x1, z1 - rr); s.quadraticCurveTo(x1, z1, x1 - rr, z1);
      s.lineTo(x0 + rr, z1); s.quadraticCurveTo(x0, z1, x0, z1 - rr);
      s.lineTo(x0, z0 + rr); s.quadraticCurveTo(x0, z0, x0 + rr, z0);
      const g = new THREE.ExtrudeGeometry(s, { depth: h - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 4, curveSegments: 10 });
      g.rotateX(-Math.PI / 2);
      g.translate(0, b, 0);
      return g;
    }

    // ---------- 玻璃：邊緣加深的薄殼（菲涅耳）＋加成的環境反射高光 ----------
    function rimMaterial() {
      return new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(0x203040) }, uBase: { value: 0.05 }, uEdge: { value: 0.55 } },
        vertexShader: 'varying vec3 vN; varying vec3 vV;\n' +
          'void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
        fragmentShader: 'uniform vec3 uColor; uniform float uBase; uniform float uEdge; varying vec3 vN; varying vec3 vV;\n' +
          'void main(){ float f = 1.0 - abs(dot(normalize(vN), normalize(vV))); float a = uBase + uEdge * pow(f, 1.6); gl_FragColor = vec4(uColor, clamp(a, 0.0, 0.92));\n#include <colorspace_fragment>\n}',
        transparent: true, depthWrite: false, side: THREE.DoubleSide
      });
    }
    const rimMats = [];
    const shineMat = new THREE.MeshPhysicalMaterial({ color: 0x000000, metalness: 0, roughness: 0.03, clearcoat: 1, clearcoatRoughness: 0.02, ior: 1.5,
      envMapIntensity: 2.6, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    function glass(geo, order) {
      const rm = rimMaterial(); rimMats.push(rm);
      const g = new THREE.Group();
      const a = new THREE.Mesh(geo, rm), b = new THREE.Mesh(geo, shineMat);
      // 先畫加成的高光，再畫邊緣加深的薄殼：淺色背景上高光才不會把玻璃的輪廓洗掉
      b.renderOrder = order || 5; a.renderOrder = (order || 5) + 1;
      g.add(a, b);
      scene.add(g);
      return g;
    }

    let C = H.colors();

    // ======================= 實驗桌、攪拌器、白紙 =======================
    const benchMat = std({ roughness: 0.82 });
    const bench = add(new THREE.CircleGeometry(600, 96), benchMat, 0, 0, 0, { cast: false });
    bench.rotation.x = -Math.PI / 2;

    const housingMat = std({ roughness: 0.42 });
    add(roundSlab(17, 17, STIR_H - 0.35, 1.4, 0.45), housingMat, 0, 0, 0);
    const plateMat = std({ color: 0xe9ebee, roughness: 0.3 });
    add(roundSlab(15.6, 15.6, 0.4, 1.0, 0.15), plateMat, 0, STIR_H - 0.4, 0);
    const knobMat = std({ roughness: 0.35, metalness: 0.2 });
    const knob = add(new THREE.CylinderGeometry(1.05, 1.15, 0.9, 40), knobMat, -4.6, 2.2, 8.6);
    knob.rotation.x = Math.PI / 2;
    const knobMark = add(new THREE.BoxGeometry(0.16, 0.8, 0.08), std({ color: 0xffffff, roughness: 0.4 }), -4.6, 2.55, 9.07, { cast: false });
    knobMark.rotation.z = -0.6;
    const ledMat = new THREE.MeshStandardMaterial({ color: 0x1b8a4c, emissive: 0x2ee07a, emissiveIntensity: 1.4, roughness: 0.3 });
    add(new THREE.SphereGeometry(0.28, 20, 12), ledMat, 4.8, 2.6, 8.55, { cast: false });
    const ledRing = add(new THREE.TorusGeometry(0.42, 0.07, 8, 24), knobMat, 4.8, 2.6, 8.55, { cast: false });
    const paperMat = std({ roughness: 0.95 });
    const paper = add(new THREE.PlaneGeometry(13.5, 13.5), paperMat, 0, STIR_H + 0.012, 0.2, { cast: false });
    paper.rotation.x = -Math.PI / 2; paper.rotation.z = 0.07;
    // 錐形瓶底下的接觸陰影
    const csTex = (function () {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 20, 64, 64, 64);
      gr.addColorStop(0, 'rgba(0,0,0,0.32)'); gr.addColorStop(0.7, 'rgba(0,0,0,0.12)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      return canvasTex(c);
    })();
    const contact = add(new THREE.PlaneGeometry(2 * (FL.Rb + 1.4), 2 * (FL.Rb + 1.4)), new THREE.MeshBasicMaterial({ map: csTex, transparent: true, depthWrite: false }), 0, STIR_H + 0.02, 0, { cast: false, recv: false });
    contact.rotation.x = -Math.PI / 2;

    // ======================= 鐵架與滴定管夾 =======================
    const ironMat = std({ roughness: 0.55, metalness: 0.35 });
    const metalMat = std({ roughness: 0.28, metalness: 0.85 });
    const ROD = new THREE.Vector3(-13, 0, -9);
    add(roundSlab(11, 9, 1.1, 0.8, 0.3), ironMat, -14.6, 0, -9.6);
    add(new THREE.CylinderGeometry(0.5, 0.5, TUBE_TOP + 6, 28), metalMat, ROD.x, (TUBE_TOP + 6) / 2 + 1, ROD.z);
    add(new THREE.SphereGeometry(0.5, 20, 12), metalMat, ROD.x, TUBE_TOP + 7, ROD.z);
    const CLAMP_Y = Y0ML + 1.8;   // 夾在 0 刻度上方，不遮住刻度
    add(new THREE.BoxGeometry(1.9, 1.9, 1.9), ironMat, ROD.x, CLAMP_Y, ROD.z);
    const screw = add(new THREE.CylinderGeometry(0.22, 0.22, 2.2, 16), metalMat, ROD.x - 1.6, CLAMP_Y, ROD.z);
    screw.rotation.z = Math.PI / 2;
    add(new THREE.CylinderGeometry(0.55, 0.55, 0.5, 20), ironMat, ROD.x - 2.6, CLAMP_Y, ROD.z).rotation.z = Math.PI / 2;
    const armEnd = new THREE.Vector3(-1.2, CLAMP_Y, -0.8);
    const arm = add(new THREE.CylinderGeometry(0.32, 0.32, 1, 20), metalMat);
    cylBetween(arm, new THREE.Vector3(ROD.x, CLAMP_Y, ROD.z), armEnd);
    // 夾爪（橡膠墊夾住滴定管）
    const padMat = std({ roughness: 0.9 });
    [-1, 1].forEach(function (s) {
      const jaw = add(new THREE.BoxGeometry(0.35, 2.6, 2.2), ironMat, s * (BR + BGT + 0.45), CLAMP_Y, 0);
      add(new THREE.BoxGeometry(0.22, 2.2, 1.6), padMat, s * (BR + BGT + 0.15), CLAMP_Y, 0);
    });
    add(new THREE.BoxGeometry(2.6, 0.5, 0.5), ironMat, 0, CLAMP_Y - 1.1, -1.1);
    const jawBar = add(new THREE.CylinderGeometry(0.28, 0.28, 1, 16), ironMat);
    cylBetween(jawBar, armEnd, new THREE.Vector3(0, CLAMP_Y - 1.1, -1.1));

    // ======================= 錐形瓶（真實尺寸） =======================
    /** 瓶內半徑（離瓶底 y cm），底緣有 FIL 的圓角 */
    function rCone(y) { return y <= FL.Hc ? FL.Rb - (FL.Rb - FL.Rn) * y / FL.Hc : FL.Rn; }
    function wallR(y) {
      if (y >= FIL) return rCone(y);
      const c = rCone(FIL) - FIL, dy = FIL - Math.max(0, y);
      return c + Math.sqrt(Math.max(0, FIL * FIL - dy * dy));
    }
    const flaskTop = FL.Hc + FL.Hn;
    (function buildFlask() {
      const pts = [];
      const V2 = function (r, y) { pts.push(new THREE.Vector2(Math.max(0.001, r), FY + y)); };
      // 外壁：瓶底中心 → 底緣圓角 → 錐面 → 瓶頸 → 瓶口外翻的唇
      V2(0, -GT);
      const N = 10;
      for (let i = 0; i <= N; i++) {
        const a = Math.PI / 2 * i / N, c = rCone(FIL) - FIL;
        V2(c + (FIL + GT) * Math.sin(a), FIL - (FIL + GT) * Math.cos(a));
      }
      for (let i = 1; i <= 24; i++) { const y = FIL + (FL.Hc - 0.6 - FIL) * i / 24; V2(rCone(y) + GT, y); }
      V2(FL.Rn + GT + 0.06, FL.Hc + 0.1); V2(FL.Rn + GT, FL.Hc + 0.5);
      V2(FL.Rn + GT, flaskTop - 0.35);
      for (let i = 0; i <= 8; i++) { const a = Math.PI * i / 8; V2(FL.Rn + GT / 2 + 0.2 + 0.2 * Math.sin(a), flaskTop - 0.2 + 0.2 * (1 - Math.cos(a)) * 0.9); }
      V2(FL.Rn, flaskTop - 0.05);
      // 內壁往下
      V2(FL.Rn, FL.Hc + 0.5); V2(FL.Rn - 0.04, FL.Hc + 0.1);
      for (let i = 24; i >= 0; i--) { const y = FIL + (FL.Hc - 0.6 - FIL) * i / 24; V2(rCone(y), y); }
      for (let i = N; i >= 0; i--) { const a = Math.PI / 2 * i / N, c = rCone(FIL) - FIL; V2(c + FIL * Math.sin(a), FIL - FIL * Math.cos(a)); }
      V2(0, 0);
      glass(new THREE.LatheGeometry(pts, 96), 6);
    })();
    // 瓶身的白色釉面刻度（50～200 mL）：貼在錐面正面的一小段截錐
    const gradFlask = (function () {
      const y0 = 0.6, y1 = Math.min(FL.Hc - 1.2, H.hCm(250) + 1.0), arc = 1.0;
      const rT = rCone(y1) + GT + 0.012, rB = rCone(y0) + GT + 0.012;
      const geo = new THREE.CylinderGeometry(rT, rB, y1 - y0, 48, 1, true, 0.15, arc);
      const mat = new THREE.MeshStandardMaterial({ transparent: true, depthWrite: false, roughness: 0.6, side: THREE.FrontSide });
      const m = add(geo, mat, 0, FY + (y0 + y1) / 2, 0, { cast: false, recv: false });
      m.renderOrder = 7;
      return { mesh: m, mat: mat, y0: y0, y1: y1, rT: rT, rB: rB, arc: arc };
    })();
    function drawFlaskGrad() {
      const c = document.createElement('canvas'), Wd = 256, Hd = 640;
      c.width = Wd; c.height = Hd;
      const g = c.getContext('2d'), G = gradFlask;
      const Y = function (yc) { return (G.y1 - yc) / (G.y1 - G.y0) * Hd; };
      // 白色釉面
      g.fillStyle = 'rgba(250,250,248,0.9)';
      const top = Y(H.hCm(200)) - 70, bot = Y(H.hCm(50)) + 40;
      g.beginPath(); g.moveTo(40, top); g.lineTo(220, top); g.lineTo(220, bot); g.lineTo(40, bot); g.closePath(); g.fill();
      g.strokeStyle = '#1d232b'; g.fillStyle = '#1d232b';
      g.lineWidth = 5; g.lineCap = 'round';
      g.font = '700 40px system-ui, sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'left';
      [50, 100, 150, 200].forEach(function (V) {
        const y = Y(H.hCm(V));
        g.beginPath(); g.moveTo(54, y); g.lineTo(122, y); g.stroke();
        g.fillText(String(V), 132, y);
      });
      [75, 125, 175].forEach(function (V) {
        const y = Y(H.hCm(V));
        g.lineWidth = 3.5; g.beginPath(); g.moveTo(54, y); g.lineTo(96, y); g.stroke();
      });
      g.font = '700 34px system-ui, sans-serif'; g.textAlign = 'center';
      g.fillText('250 mL', 130, top + 32);
      if (G.mat.map) G.mat.map.dispose();
      G.mat.map = canvasTex(c);
      G.mat.needsUpdate = true;
    }
    drawFlaskGrad();

    // ---------- 錐形瓶裡的溶液（含彎月面、攪拌的漩渦），體積變了才重建 ----------
    const liqMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.04, metalness: 0, transmission: 0.82, thickness: 2.5, ior: 1.333,
      specularIntensity: 1, envMapIntensity: 1.2, clearcoat: 0.6, clearcoatRoughness: 0.05, emissive: 0x000000 });
    let liquid = null, liqKey = '', liqH = 0, liqR = 0, dip0 = 0;
    function dipAt(r) { return dip0 * Math.exp(-(r * r) / (0.95 * 0.95)); }
    function buildLiquid() {
      const h = H.hCm(H.vt());
      const stirring = !reduced;
      const key = h.toFixed(3) + '|' + stirring;
      if (key === liqKey) return;
      liqKey = key;
      liqH = h;
      const rise = 0.16, rTop = Math.max(0.05, wallR(h) - 0.025);
      liqR = rTop;
      dip0 = stirring ? Math.min(0.28, 0.45 * h) : 0;
      const pts = [];
      const V2 = function (r, y) { pts.push(new THREE.Vector2(Math.max(0.001, r), FY + y)); };
      V2(0, 0.02);
      const wallTop = h + rise;
      const n = Math.max(6, Math.ceil(wallTop / 0.18));
      for (let i = 0; i <= n; i++) {
        const y = 0.02 + (wallTop - 0.02) * i / n;
        V2(wallR(Math.min(y, h)) - 0.025 + (y > h ? -0.012 * (y - h) / rise : 0), y);
      }
      // 液面：沿玻璃上爬的彎月面（範圍約一個毛細長度）＋中央攪拌造成的漩渦
      const rs = [];
      for (let d = 0.03; d < Math.min(1.2, rTop); d += 0.06) rs.push(rTop - d);
      for (let r = rTop - 1.2; r > 0.04; r -= 0.12) if (r < rTop - 1.2 + 1e-9 && r > 0) rs.push(r);
      rs.push(0.001);
      rs.forEach(function (r) { V2(r, h + rise * Math.exp(-(rTop - r) / LAMBDA * 1.6) - dipAt(r)); });
      const geo = new THREE.LatheGeometry(pts, 72);
      if (liquid) { liquid.geometry.dispose(); liquid.geometry = geo; }
      else { liquid = new THREE.Mesh(geo, liqMat); liquid.renderOrder = 2; scene.add(liquid); }
    }

    // 攪拌子（鐵弗龍外殼的膠囊）
    const ptfeMat = new THREE.MeshPhysicalMaterial({ color: 0xf6f6f2, roughness: 0.32, clearcoat: 0.4 });
    const stirBar = new THREE.Mesh(new THREE.CapsuleGeometry(0.27, 1.6, 8, 20), ptfeMat);
    stirBar.rotation.z = Math.PI / 2;
    const stirPivot = new THREE.Group();
    stirPivot.position.set(0, FY + 0.28, 0);
    stirPivot.add(stirBar);
    const stirRing = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.035, 8, 24), std({ color: 0xbfc4c9, roughness: 0.4 }));
    stirRing.rotation.y = Math.PI / 2;
    stirPivot.add(stirRing);
    scene.add(stirPivot);

    // 滴落處的顏色、漣漪
    const plumeGeo = new THREE.CircleGeometry(1, 40);
    plumeGeo.rotateX(-Math.PI / 2);
    const plumes = [];
    for (let i = 0; i < NPLUME * 5; i++) {
      const m = new THREE.Mesh(plumeGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
      m.visible = false; m.renderOrder = 3;
      scene.add(m); plumes.push(m);
    }
    const ripGeo = new THREE.RingGeometry(0.86, 1, 48);
    ripGeo.rotateX(-Math.PI / 2);
    const rips = [];
    for (let i = 0; i < NRIP; i++) {
      const m = new THREE.Mesh(ripGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
      m.visible = false; m.renderOrder = 4;
      scene.add(m); rips.push(m);
    }

    // ======================= 滴定管 =======================
    (function buildBurette() {
      const pts = [];
      const V2 = function (r, y) { pts.push(new THREE.Vector2(Math.max(0.001, r), y)); };
      const ro = BR + BGT;
      // 外壁由尖端往上
      V2(0.05, TIP_Y); V2(0.17, TIP_Y); V2(0.2, TIP_Y + 0.15);
      V2(0.3, COCK_Y - 1.6); V2(0.32, COCK_Y - 0.5);
      V2(0.32, COCK_Y + 0.6); V2(0.34, COCK_Y + 1.1);
      for (let i = 0; i <= 6; i++) { const u = i / 6; V2(0.34 + (ro - 0.34) * (0.5 - 0.5 * Math.cos(Math.PI * u)), COCK_Y + 1.1 + (TAPER_Y - COCK_Y - 1.1) * u); }
      V2(ro, TUBE_TOP - 0.4);
      V2(ro + 0.1, TUBE_TOP - 0.15); V2(ro + 0.1, TUBE_TOP); V2(BR + 0.02, TUBE_TOP + 0.02);
      // 內壁往下
      V2(BR, TUBE_TOP - 0.3); V2(BR, TAPER_Y);
      for (let i = 6; i >= 0; i--) { const u = i / 6; V2(0.13 + (BR - 0.13) * (0.5 - 0.5 * Math.cos(Math.PI * u)), COCK_Y + 1.1 + (TAPER_Y - COCK_Y - 1.1) * u); }
      V2(0.13, COCK_Y - 0.5); V2(0.11, COCK_Y - 1.6); V2(0.05, TIP_Y + 0.1);
      glass(new THREE.LatheGeometry(pts, 48), 8);
    })();
    // 刻度：0.1 mL 一格、每 1 mL 一個數字（畫在 2D 畫布上再貼到管子正面）
    const gradBur = (function () {
      const yb = Y50 - 0.4, yt = Y0ML + 0.4, r = BR + BGT + 0.006, arc = 1.78;
      const mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.FrontSide });
      const m = add(new THREE.CylinderGeometry(r, r, yt - yb, 48, 1, true, -0.9, arc), mat, 0, (yb + yt) / 2, 0, { cast: false, recv: false });
      m.renderOrder = 9;
      return { mat: mat, yb: yb, yt: yt };
    })();
    function drawBuretteGrad() {
      const c = document.createElement('canvas'), Wd = 256, Hd = 4096;
      c.width = Wd; c.height = Hd;
      const g = c.getContext('2d'), G = gradBur;
      // 深藍的刻度加一圈淡白的邊：管內有液體、管外是深色背景時都看得清楚
      const ink = '#14263f', halo = C.dark ? 'rgba(235,242,248,0.8)' : 'rgba(255,255,255,0.55)';
      g.lineCap = 'butt'; g.lineJoin = 'round';
      g.font = '700 30px system-ui, sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'left';
      for (let i = 0; i <= 500; i++) {
        const yc = Y0ML - i / 10 * CM_PER_ML, y = (G.yt - yc) / (G.yt - G.yb) * Hd;
        const len = i % 10 === 0 ? 86 : i % 5 === 0 ? 56 : 32;
        const lw = i % 10 === 0 ? 3.2 : 2.2;
        g.beginPath(); g.moveTo(84, y); g.lineTo(84 + len, y);
        g.strokeStyle = halo; g.lineWidth = lw + 4; g.stroke();
        g.strokeStyle = ink; g.lineWidth = lw; g.stroke();
        if (i % 10 === 0) { g.strokeStyle = halo; g.lineWidth = 6; g.strokeText(String(i / 10), 84 + len + 8, y); g.fillStyle = ink; g.fillText(String(i / 10), 84 + len + 8, y); }
      }
      if (G.mat.map) G.mat.map.dispose();
      G.mat.map = canvasTex(c);
      G.mat.needsUpdate = true;
    }
    drawBuretteGrad();

    // 活栓：玻璃座、鐵弗龍栓、手把（關：橫放；開：與管子平行）
    const cockGlass = new THREE.CylinderGeometry(0.55, 0.55, 2.3, 32);
    cockGlass.rotateZ(Math.PI / 2);   // 活栓的栓軸左右橫放，手把在右邊（電極從後方斜插，才不會碰到）
    const cg = glass(cockGlass, 8);
    cg.position.set(0, COCK_Y, 0);
    const plug = add(new THREE.CylinderGeometry(0.42, 0.36, 2.8, 32), ptfeMat, 0, COCK_Y, 0, { recv: false });
    plug.rotation.z = Math.PI / 2;
    const nut = add(new THREE.CylinderGeometry(0.48, 0.48, 0.45, 6), ptfeMat, -1.55, COCK_Y, 0);
    nut.rotation.z = Math.PI / 2;
    const handle = new THREE.Group();
    handle.position.set(1.5, COCK_Y, 0);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.45, 28), ptfeMat);
    hub.rotation.z = Math.PI / 2;
    const key = new THREE.Mesh(roundSlab(0.32, 2.6, 0.7, 0.14, 0.06), ptfeMat);
    key.rotation.z = -Math.PI / 2; key.position.x = 0.2;   // 關：手把前後橫放；開：轉到與管子平行
    hub.castShadow = key.castShadow = true;
    handle.add(hub, key);
    scene.add(handle);

    // 滴定管裡的滴定液（含彎月面）：讀數變了才重建
    const titrMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.03, metalness: 0, transmission: 0.9, thickness: 1.0, ior: 1.333,
      specularIntensity: 1, envMapIntensity: 1.2, clearcoat: 0.5 });
    let burLiq = null, burKey = '', ym = Y0ML;
    function buildBuretteLiquid() {
      const st = H.st, fillML = st.run.fill / H.U;
      const key = fillML.toFixed(3);
      if (key === burKey) return;
      burKey = key;
      ym = Y0ML - Math.min(50, fillML) * CM_PER_ML;
      const pts = [];
      const V2 = function (r, y) { pts.push(new THREE.Vector2(Math.max(0.001, r), y)); };
      V2(0.001, TIP_Y + 0.12); V2(0.045, TIP_Y + 0.12);
      V2(0.1, COCK_Y - 1.6); V2(0.12, COCK_Y - 0.5); V2(0.12, COCK_Y + 1.1);
      for (let i = 1; i <= 6; i++) { const u = i / 6; V2(0.12 + (BR - 0.13) * (0.5 - 0.5 * Math.cos(Math.PI * u)), COCK_Y + 1.1 + (TAPER_Y - COCK_Y - 1.1) * u); }
      const rise = 0.17, R = BR - 0.012, e = Math.exp(-R / LAMBDA);
      const cap = [];
      cap.push(new THREE.Vector2(R, ym + rise));
      for (let i = 1; i <= 16; i++) {
        const r = R * (1 - Math.pow(i / 16, 0.6));
        // 彎月面：中心最低（就是讀數），往管壁上爬
        cap.push(new THREE.Vector2(Math.max(0.001, r), ym + rise * (Math.exp(-(R - r) / LAMBDA) - e) / (1 - e)));
      }
      cap.push(new THREE.Vector2(0.001, ym));
      const geo = new THREE.LatheGeometry(pts.concat(cap), 40);
      if (burLiq) { burLiq.geometry.dispose(); burLiq.geometry = geo; }
      else { burLiq = new THREE.Mesh(geo, titrMat); burLiq.renderOrder = 2; scene.add(burLiq); }
      // 彎月面看起來是一條暗帶（斜看時反射、全反射）：用邊緣加深的薄殼貼在液面上
      const mg = new THREE.LatheGeometry(cap, 40);
      if (menisc) { menisc.geometry.dispose(); menisc.geometry = mg; }
      else { menisc = new THREE.Mesh(mg, meniscMat); menisc.renderOrder = 4; scene.add(menisc); }
    }
    let menisc = null;
    const meniscMat = rimMaterial();
    meniscMat.polygonOffset = true; meniscMat.polygonOffsetFactor = -2; meniscMat.polygonOffsetUnits = -4;
    // 視線標記：彎月面最低點的高度（細的虛線環）
    const sightMat = new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.12, gapSize: 0.08, transparent: true, opacity: 0.9, depthTest: false });
    const sight = (function () {
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-1.9, 0, 0), new THREE.Vector3(1.9, 0, 0)]);
      const l = new THREE.Line(g, sightMat);
      l.computeLineDistances();
      l.renderOrder = 12;
      l.visible = false;
      scene.add(l);
      return l;
    })();

    // 液滴、細流
    const dropGeo = new THREE.SphereGeometry(1, 24, 16);
    const drops = [];
    const dropRim = rimMaterial();   // 液滴的輪廓（無色的液滴靠邊緣的折射才看得見）
    for (let i = 0; i < NDROP; i++) {
      const m = new THREE.Mesh(dropGeo, titrMat);
      const rimM = new THREE.Mesh(dropGeo, dropRim);
      rimM.renderOrder = 5;
      m.add(rimM);
      m.visible = false; m.renderOrder = 2;
      scene.add(m); drops.push(m);
    }
    const streamMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transmission: 0.85, thickness: 0.2, ior: 1.333, envMapIntensity: 1.4 });
    const stream = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 16, 1, true), streamMat);
    stream.visible = false;
    scene.add(stream);

    // ======================= pH 計、電極、保存瓶 =======================
    const METER = new THREE.Vector3(18.6, 0, 2.0);
    const meterG = new THREE.Group();
    meterG.position.copy(METER);
    meterG.rotation.y = -0.42;
    scene.add(meterG);
    const meterMat = std({ roughness: 0.38 });
    (function buildMeter() {
      const s = new THREE.Shape();
      // 側面輪廓（前低後高）：s = 前後方向、y = 高度
      s.moveTo(-3.6, 0); s.lineTo(3.6, 0); s.lineTo(3.6, 1.5); s.lineTo(-3.6, 3.5); s.closePath();
      const geo = new THREE.ExtrudeGeometry(s, { depth: 9.4, bevelEnabled: true, bevelThickness: 0.3, bevelSize: 0.3, bevelSegments: 4, curveSegments: 4 });
      geo.translate(0, 0.3, -4.7);
      geo.rotateY(-Math.PI / 2);
      const body = new THREE.Mesh(geo, meterMat);
      body.castShadow = body.receiveShadow = true;
      meterG.add(body);
    })();
    // 斜面上的顯示器與按鍵
    const slope = Math.atan2(2.0, 7.2);
    const face = new THREE.Group();
    face.position.set(0, 2.5 + 0.6 + 0.02, 0);
    face.rotation.x = -(Math.PI / 2 - slope);
    meterG.add(face);
    const bezel = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 3.2), std({ color: 0x1d2329, roughness: 0.3 }));
    bezel.position.set(0, 1.0, 0.01);
    face.add(bezel);
    const lcdC = document.createElement('canvas'); lcdC.width = 512; lcdC.height = 192;
    const lcdTex = canvasTex(lcdC);
    const lcd = new THREE.Mesh(new THREE.PlaneGeometry(7.0, 2.62), new THREE.MeshBasicMaterial({ map: lcdTex, toneMapped: false }));
    lcd.position.set(0, 1.0, 0.03);
    face.add(lcd);
    const btnMats = [std({ roughness: 0.5 }), std({ roughness: 0.5 }), std({ roughness: 0.5 })];
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(roundSlab(1.9, 0.9, 0.25, 0.3, 0.08), btnMats[i]);
      b.rotation.x = Math.PI / 2;
      b.position.set(-2.4 + i * 2.4, -1.75, 0.0);
      b.castShadow = true;
      face.add(b);
    }
    let lcdText = null;
    const SEG = { '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd', '6': 'afgedc', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg', '-': 'g', ' ': '' };
    function drawLCD(txt) {
      const g = lcdC.getContext('2d'), Wd = lcdC.width, Hd = lcdC.height;
      const ink = H.rgb(C.lcdInk);
      const grad = g.createLinearGradient(0, 0, 0, Hd);
      grad.addColorStop(0, H.mix(C.lcd, '#ffffff', 0.06)); grad.addColorStop(1, C.lcd);
      g.fillStyle = grad; g.fillRect(0, 0, Wd, Hd);
      const on = 'rgb(' + ink.join(',') + ')', off = 'rgba(' + ink.join(',') + ',0.08)';
      const digits = txt.replace('.', '');
      const n = digits.length, x0 = 34, cw = 88, w = 62, h = 128, y = 32, t = 12;
      g.save(); g.translate(0, 0); g.transform(1, 0, -0.08, 1, 10, 0);
      for (let i = 0; i < n; i++) {
        const lit = SEG[digits[i]] || '', x = x0 + i * cw;
        const P = { a: [x + t * 0.6, y, w - t * 1.2, t], d: [x + t * 0.6, y + h - t, w - t * 1.2, t], g: [x + t * 0.6, y + h / 2 - t / 2, w - t * 1.2, t],
          f: [x, y + t * 0.6, t, h / 2 - t * 0.9], b: [x + w - t, y + t * 0.6, t, h / 2 - t * 0.9], e: [x, y + h / 2 + t * 0.3, t, h / 2 - t * 0.9], c: [x + w - t, y + h / 2 + t * 0.3, t, h / 2 - t * 0.9] };
        'abcdefg'.split('').forEach(function (k) { const r = P[k]; g.fillStyle = lit.indexOf(k) >= 0 ? on : off; g.fillRect(r[0], r[1], r[2], r[3]); });
      }
      g.fillStyle = on;
      g.beginPath(); g.arc(x0 + 2 * cw - 14, y + h - 6, 7, 0, Math.PI * 2); g.fill();
      g.restore();
      g.fillStyle = on; g.font = '700 40px system-ui, sans-serif'; g.textAlign = 'right'; g.textBaseline = 'alphabetic';
      g.fillText('pH', Wd - 22, Hd - 28);
      g.font = '600 22px system-ui, sans-serif';
      g.fillText('25.0 °C', Wd - 22, 46);
      lcdTex.needsUpdate = true;
    }

    // 保存瓶（3 M KCl）
    const BOTTLE = new THREE.Vector3(10.6, 0, 8.6);
    (function buildBottle() {
      const pts = [], r = 1.55, h = 6.2, t = 0.14;
      const V2 = function (x, y) { pts.push(new THREE.Vector2(Math.max(0.001, x), y)); };
      V2(0, 0); V2(r + t - 0.2, 0); V2(r + t, 0.2); V2(r + t, h); V2(r, h); V2(r, t + 0.15); V2(r - 0.15, t); V2(0, t);
      const g = glass(new THREE.LatheGeometry(pts, 48), 6);
      g.position.copy(BOTTLE);
      const lg = new THREE.CylinderGeometry(r - 0.03, r - 0.03, 3.9, 40);
      const kcl = new THREE.Mesh(lg, new THREE.MeshPhysicalMaterial({ color: 0xd6e8f5, roughness: 0.05, transmission: 0.8, thickness: 2, ior: 1.333 }));
      kcl.position.set(BOTTLE.x, t + 1.95, BOTTLE.z);
      kcl.renderOrder = 2;
      scene.add(kcl);
    })();

    // 電極支架
    const HOLD = new THREE.Vector3(12.6, 0, -9.6);
    add(new THREE.CylinderGeometry(3.2, 3.5, 0.9, 40), ironMat, HOLD.x, 0.45, HOLD.z);
    add(new THREE.CylinderGeometry(0.38, 0.38, 34, 24), metalMat, HOLD.x, 17.9, HOLD.z);
    const holdBoss = add(new THREE.BoxGeometry(1.4, 1.4, 1.4), ironMat);
    const holdArm = add(new THREE.CylinderGeometry(0.26, 0.26, 1, 16), metalMat);
    const holdClip = add(new THREE.CylinderGeometry(0.85, 0.85, 1.3, 28, 1, true), ironMat);

    // 電極：玻璃管身、內部參考電極、玻璃球（感測膜）、塑膠頭（局部座標：y 由球底往上）
    const EL = 19.6;
    const elec = new THREE.Group();
    scene.add(elec);
    const elBody = new THREE.CylinderGeometry(0.45, 0.45, 14.2, 32, 1, true);
    elBody.translate(0, 0.75 + 7.1, 0);
    const eg = glass(elBody, 7);
    scene.remove(eg); elec.add(eg);
    const bulbMat = new THREE.MeshPhysicalMaterial({ color: 0xcfe3f2, roughness: 0.05, transmission: 0.7, thickness: 0.6, ior: 1.47, envMapIntensity: 1.5 });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.5, 28, 18), bulbMat);
    bulb.position.y = 0.55;
    elec.add(bulb);
    const refEl = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 13, 8), std({ color: 0x9ea6ad, roughness: 0.4, metalness: 0.6 }));
    refEl.position.y = 7.6;
    elec.add(refEl);
    const fillSol = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 9, 24), new THREE.MeshPhysicalMaterial({ color: 0xe4eef6, roughness: 0.1, transmission: 0.75, thickness: 0.6 }));
    fillSol.position.y = 5.3;
    elec.add(fillSol);
    const capMat = std({ color: 0x23272c, roughness: 0.45 });
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.52, 4.6, 32), capMat);
    cap.position.y = 15.0 + 2.3;
    cap.castShadow = true;
    elec.add(cap);
    const capRing = new THREE.Mesh(new THREE.CylinderGeometry(0.575, 0.575, 0.35, 32), std({ roughness: 0.4 }));
    capRing.position.y = 16.2;
    elec.add(capRing);
    const boot = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.4, 1.0, 20), capMat);
    boot.position.y = EL + 0.5;
    elec.add(boot);
    let cable = null;
    const cableMat = std({ color: 0x2b2f35, roughness: 0.55 });
    const elDir = new THREE.Vector3(), elBase = new THREE.Vector3();
    let meterPlaced = null;
    /** 電極放進錐形瓶（斜插，避開滴定管尖端與攪拌子）或保存瓶 */
    function placeElectrode(inFlask) {
      if (meterPlaced === inFlask) return;
      meterPlaced = inFlask;
      if (inFlask) {
        // 一條斜線：在瓶頸處離中心 1.2 cm（尖端在中心），到瓶底時離中心約 2 cm
        const az = Math.PI / 2, ca = Math.cos(az), sa = Math.sin(az);
        const yc = FY + 12;
        const rot = function (x, y, z) { return new THREE.Vector3(x * ca + z * sa, y, -x * sa + z * ca); };
        const yb = FY - 0.03;   // 玻璃球幾乎貼著瓶底，少量溶液也能浸到
        elBase.copy(rot(1.2, yb, 0.15 * (yb - yc)));
        elDir.copy(rot(0, 1, 0.15)).normalize();   // 整支在尖端後方：球在左後方瓶底、頭往右後方，不擋住滴定管尖端
      } else {
        elBase.set(BOTTLE.x, 0.3, BOTTLE.z);
        elDir.set(0, 1, 0);
      }
      elec.position.copy(elBase);
      elec.quaternion.setFromUnitVectors(UP, elDir);
      // 支架橫桿夾住電極的塑膠頭
      const clip = elBase.clone().addScaledVector(elDir, 18.6);   // 夾在塑膠頭上端，橫桿高過活栓手把
      holdClip.position.copy(clip);
      holdClip.quaternion.copy(elec.quaternion);
      holdBoss.position.set(HOLD.x, clip.y, HOLD.z);
      const dir = new THREE.Vector3(clip.x - HOLD.x, 0, clip.z - HOLD.z).normalize();
      cylBetween(holdArm, new THREE.Vector3(HOLD.x, clip.y, HOLD.z), clip.clone().addScaledVector(dir, -0.85));
      // 電纜：電極頂端 → 往上彎 → pH 計背面
      const top = elBase.clone().addScaledVector(elDir, EL + 1.0);
      const back = new THREE.Vector3(-3.0, 3.0, -3.8).applyAxisAngle(UP, meterG.rotation.y).add(METER);
      const curve = new THREE.CatmullRomCurve3([top, top.clone().addScaledVector(elDir, 3.5).add(new THREE.Vector3(0.5, 1.5, 0)),
        new THREE.Vector3((top.x + back.x) / 2 + 2, top.y + 3, (top.z + back.z) / 2 - 3), new THREE.Vector3(back.x - 1.5, back.y + 6, back.z - 2.5), back]);
      if (cable) { scene.remove(cable); cable.geometry.dispose(); }
      cable = new THREE.Mesh(new THREE.TubeGeometry(curve, 80, 0.17, 10, false), cableMat);
      cable.castShadow = true;
      scene.add(cable);
      renderer.shadowMap.needsUpdate = true;
    }
    elec.traverse(function (o) { if (o.isMesh && o.material !== shineMat && !(o.material && o.material.isShaderMaterial)) o.castShadow = o === cap; });

    // ======================= 顏色（深淺色主題） =======================
    function applyColors() {
      C = H.colors();
      scene.background = col(C['canvas-bg']);
      scene.fog = new THREE.Fog(scene.background.getHex(), 230, 520);   // 桌面遠處淡入背景，看不到桌緣
      col(C.bench, benchMat.color);
      col(C.housing, housingMat.color);
      col(C.dark ? '#cfd3d8' : C.paper, paperMat.color);
      col(C.iron, ironMat.color);
      col(C.metal, metalMat.color);
      col(H.mix(C.housing, C.text, C.dark ? 0.35 : 0.55), knobMat.color);
      col(H.mix(C.housing, C.text, C.dark ? 0.6 : 0.75), meterMat.color);
      col(H.mix(C.housing, C.text, C.dark ? 0.6 : 0.75), padMat.color);
      btnMats.forEach(function (m, i) { col(H.mix(C.housing, i === 2 ? C.accent : C.text, C.dark ? 0.35 : 0.25), m.color); });
      col(C.accent, capRing.material.color);
      col(C.probe, ledMat.emissive); col(C.probe, ledMat.color);
      hemi.groundColor.copy(col(C.bench)).multiplyScalar(0.8);
      // 玻璃邊緣：淺色主題偏深（像 2D 的輪廓線），深色主題偏亮
      rimMats.forEach(function (m) {
        col(C.dark ? H.mix(C.text, C.neg, 0.2) : H.mix(C.field || C.text, '#0a1622', 0.4), m.uniforms.uColor.value);
        m.uniforms.uBase.value = C.dark ? 0.035 : 0.035;
        m.uniforms.uEdge.value = C.dark ? 0.45 : 0.62;
      });
      shineMat.envMapIntensity = C.dark ? 2.6 : 1.1;
      col('#13202c', meniscMat.uniforms.uColor.value);   // 彎月面在兩種主題都看起來是暗帶
      meniscMat.uniforms.uBase.value = 0.12;
      meniscMat.uniforms.uEdge.value = 0.9;
      col(C.dark ? '#dfe8f0' : '#203040', dropRim.uniforms.uColor.value);
      dropRim.uniforms.uBase.value = 0.04; dropRim.uniforms.uEdge.value = 0.85;
      sightMat.color.copy(col(C.accent));
      col(C.titrant, titrMat.color); col(C.titrant, streamMat.color);
      drawBuretteGrad();
      lcdText = null;
    }
    // ======================= 每一幀 =======================
    let liqColKey = '', lastHud = '';
    function update() {
      const st = H.st;
      buildLiquid();
      buildBuretteLiquid();
      placeElectrode(!!st.meter);
      // 溶液顏色：與 2D 同一個函數（底色 × 指示劑穿透率）
      const lc = H.liquid();
      const ck = lc.join(',');
      if (ck !== liqColKey) { liqColKey = ck; liqMat.color.setRGB(lc[0] / 255, lc[1] / 255, lc[2] / 255, THREE.SRGBColorSpace); }
      if (st.flash > 0 && !reduced) {
        col(st.flashCol || '#ffffff', liqMat.emissive);
        liqMat.emissiveIntensity = 0.55 * st.flash;
      } else liqMat.emissiveIntensity = 0;
      // 攪拌子
      stirPivot.rotation.y = -st.stir;
      // 活栓手把
      handle.rotation.x = st.cock * Math.PI / 2;
      const ys = FY + liqH;                       // 液面（中心不含漩渦）
      // 液滴：落下的進度取 2D 的同一顆液滴
      let k = 0;
      const streaming = st.tap && st.rate > H.STREAM_RATE && !reduced;
      function dropAt(R, y, stretch) {
        if (k >= NDROP) return;
        const m = drops[k++];
        m.visible = true;
        m.position.set(0, y, 0);
        m.scale.set(R, R * stretch, R);
      }
      const R1 = 0.2285, Rh = 0.1814;              // 0.05 mL、0.025 mL 液滴的半徑（cm）
      const tipY = TIP_Y - 0.02;
      if (st.tap && !streaming) {
        const rr = R1 * Math.cbrt(Math.max(0.05, Math.min(1, st.acc / H.DROP)));
        dropAt(rr, tipY - rr * 0.85, 1.08);
      }
      st.drops.forEach(function (d) {
        const R = d.n >= H.DROP ? R1 : Rh;
        if (d.phase === 'grow') {
          const rr = R * Math.cbrt(Math.max(0.08, d.t / d.growT));
          dropAt(rr, tipY - rr * 0.85, 1.1);
        } else if (!streaming) {
          const f = H.fall(d);
          dropAt(R, tipY - R - f * (tipY - R - ys), 1.12);
        }
      });
      for (let i = k; i < NDROP; i++) drops[i].visible = false;
      if (streaming) {
        const w = 0.035 + 0.05 * (st.rate - H.STREAM_RATE) / (2 - H.STREAM_RATE);
        stream.visible = true;
        stream.position.set(0, (tipY + ys) / 2, 0);
        stream.scale.set(w, tipY - ys, w);
      } else stream.visible = false;
      // 漣漪（2D：半徑 2 → 18 px，12 px/cm）
      for (let i = 0; i < NRIP; i++) {
        const rp = st.ripples[st.ripples.length - 1 - i], m = rips[i];
        if (!rp) { m.visible = false; continue; }
        const u = rp.t / 0.35, rr = (2 + 16 * u) / 12;
        m.visible = true;
        m.position.set(0, ys + 0.02 - dipAt(0) * Math.exp(-rr * rr), 0);
        m.scale.set(rr, 1, rr);
        m.material.opacity = 0.65 * (1 - u);
      }
      // 滴落處閃現的顏色（2D 的同一組 plume，半徑換算成 cm）
      let p = 0;
      st.plumes.forEach(function (pl) {
        const u = pl.t / pl.life, fade = 1 - u;
        for (let j = 0; j < 5 && p < plumes.length; j++) {
          const rad = (liqR - 0.35) * Math.min(1, Math.pow(u, 0.55)) * (0.25 + 0.75 * j / 4);
          const ang = pl.a0 + st.stir * 0.35 - j * 0.6;
          const m = plumes[p++];
          const bw = (5 + 9 * u + 2 * j) / 12;
          m.visible = true;
          const px = rad * Math.cos(ang), pz = rad * Math.sin(ang), rr = Math.hypot(px, pz);
          m.position.set(px, ys + 0.012 + 0.002 * j - dipAt(rr), pz);
          m.scale.set(bw, 1, bw);
          m.material.color.setRGB(pl.rgb[0] / 255, pl.rgb[1] / 255, pl.rgb[2] / 255, THREE.SRGBColorSpace);
          m.material.opacity = 0.55 * fade * (1 - j * 0.12);
        }
      });
      for (let i = p; i < plumes.length; i++) plumes[i].visible = false;
      // pH 計
      const lt = H.lcd();
      if (lt !== lcdText) { lcdText = lt; drawLCD(lt); }
      // 視線標記（平視液面時）
      sight.position.set(0, ym, 0);
      sight.visible = mode === 'eye';
      // 文字
      const hd = H.hud();
      const key = hd.tl + '|' + hd.tr + '|' + hd.tag;
      if (key !== lastHud) {
        lastHud = key;
        hud.tl.textContent = hd.tl;
        hud.tr.textContent = hd.tr;
        hud.tc.textContent = hd.tag || '';
        hud.tc.hidden = !hd.tag;
      }
    }

    // ======================= 相機 =======================
    let mode = 'all', tracking = false;
    const tgt = new THREE.Vector3();
    function setView(m) {
      mode = m;
      tracking = m === 'eye';
      const asp = camera.aspect, fv = camera.fov * Math.PI / 180;
      const fitH = function (h, w) { return Math.max(h / 2 / Math.tan(fv / 2), w / 2 / Math.tan(fv / 2) / asp) * 1.06; };
      let dir, dist;
      if (m === 'flask') { tgt.set(0.3, FY + 7.5, 0); dir = new THREE.Vector3(0.28, 0.4, 1); dist = fitH(21, asp < 1 ? 13 : 24); }
      else if (m === 'eye') { tgt.set(0, ym, 0); dir = new THREE.Vector3(0, 0, 1); dist = fitH(5, 5); }
      else { tgt.set(2.5, (TUBE_TOP + 8) / 2, 0); dir = new THREE.Vector3(0.36, 0.24, 1); dist = fitH(TUBE_TOP + 12, asp < 1 ? 24 : 42); }
      controls.target.copy(tgt);
      camera.position.copy(dir.normalize()).multiplyScalar(dist).add(tgt);
      camera.updateProjectionMatrix();
      controls.update();
    }
    function moved() { tracking = false; hud.bl.hidden = true; }   // 開始操作後收起操作說明，不擋畫面
    controls.addEventListener('start', moved);
    let lastChange = 0;
    controls.addEventListener('change', function () { lastChange = performance.now(); if (!inRender) H.kick(); });

    // ======================= 大小、繪製、釋放 =======================
    let vw = 0, inRender = false;
    function canvasHeight(w) { return w < 560 ? Math.round(Math.max(380, Math.min(560, w * 1.25))) : Math.round(Math.max(400, Math.min(580, w * 0.7))); }
    function resize3() {
      const w = host.clientWidth;
      if (!w) return;
      const h = canvasHeight(w);
      canvas.style.height = h + 'px';
      vw = w;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      H.kick();
    }
    function renderNow() {
      if (!api.active || document.hidden) return;
      inRender = true;
      try {
        if (tracking && Math.abs(controls.target.y - ym) > 1e-4) {
          const dy = ym - controls.target.y;
          controls.target.y += dy; camera.position.y += dy;
        }
        controls.update();
        update();
        renderer.render(scene, camera);
      } finally { inRender = false; }
    }
    const ro = window.ResizeObserver ? new ResizeObserver(function () { if (host.clientWidth !== vw) resize3(); }) : null;
    if (ro) ro.observe(host); else window.addEventListener('resize', resize3);
    canvas.addEventListener('webglcontextlost', function (ev) {
      ev.preventDefault();
      if (api.active) H.contextLost();
    });

    const api = {
      active: true,
      frame: renderNow,
      /** 使用者正在轉動視角（或阻尼還在滑）：每一幀都畫，轉起來才順 */
      moving: function () { return performance.now() - lastChange < 400; },
      onTheme: function () { applyColors(); H.kick(); },
      resetCamera: function () { setView('all'); H.kick(); },
      view: function (m) { setView(m); H.kick(); },
      dispose: function () {
        api.active = false;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize3);
        controls.dispose();
        const mats = new Set(), geos = new Set();
        scene.traverse(function (o) {
          if (o.geometry) geos.add(o.geometry);
          if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { mats.add(m); });
        });
        geos.forEach(function (g) { g.dispose(); });
        mats.forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); });
        texs.forEach(function (t) { t.dispose(); });
        envRT.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        removeDom();
      }
    };

    applyColors();
    const w0 = host.clientWidth;
    if (w0) {
      const h0 = canvasHeight(w0);
      canvas.style.height = h0 + 'px';
      vw = w0;
      renderer.setSize(w0, h0, false);
      camera.aspect = w0 / h0;
    }
    buildBuretteLiquid();
    setView('all');
    return api;
  }

  window.Titr3D = { create: create };
})();
