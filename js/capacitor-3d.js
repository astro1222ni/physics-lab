/* capacitor-3d.js — 「平行板電容器」的 3D 立體檢視（three.js 由 capacitor.js 以 import() 延遲載入後傳進來）
 *
 * 用法：const v = Capacitor3D.create({ THREE, OrbitControls }, env)
 *   env.host        放畫布的元素
 *   env.core        CapacitorCore（與 2D 同一個物理核心）
 *   env.T           T('中文', 'English')
 *   env.colors()    lab.css 色彩代號（capacitor.js 讀好的；dark 為深色模式）
 *   env.data()      目前狀態：{ A, d, kappa, f, slab, mode, S（core.solve 的結果，含慢動作中的電荷）, Eref, show,
 *                   flowOn, flowA, flowPhase, charging, slabColor, kText, dText, aNum, battText, volt() }
 *   env.notes(a, b) 畫面角落的說明（等位面間隔、太密未全部畫出）
 *   env.onLost()    WebGL 環境中斷時呼叫
 * 回傳 { active, update(), frame(), onTheme(), resetCamera(), dispose() }
 *
 * 場景座標（cm）：x 向右（介電質板由 +x 側推入）、y 向上（板間電場朝 −y）、z 指向觀察者。
 * 下板內側表面在 y = 0、上板內側表面在 y = g（g = 板距 × GAPX，示意放大），平板中心在 x = z = 0。
 * 平板邊長 √A 與厚度依實際比例；物理量全部來自 env.data().S（capacitor-core.js 的 solve）。
 */
(function () {
  'use strict';
  const GAPX = 10;     // 板距放大倍數（示意；畫面角落與說明都有標示）
  const PT = 0.4;      // 平板厚度（cm）
  const A0 = 1.4;      // E = Eref 時電場線的間距（cm）：每條電場線代表固定的電通量，條數／面積 ∝ E
  const LMIN = 0.5;    // 電場線最小間距（cm）；再密就以此間距畫並註明
  const QMIN = 0.4;    // 電荷小球最小間距（cm）
  const RQ = 0.16;     // 電荷小球半徑（cm）
  const HP = 2.4;      // 絕緣支柱高度（cm）：下板底面到桌面
  const YG = -PT - HP; // 桌面高度
  const MAXL = 2400, MAXQ = 3200, MAXDIP = 1000, MAXF = 400;

  function create(lib, env) {
    const THREE = lib.THREE, T = env.T, K = env.core;
    let C = env.colors();
    let themeVer = 0;
    const V3 = function (x, y, z) { return new THREE.Vector3(x, y, z); };
    const col = function (c) { return new THREE.Color(c || '#888888'); };
    function rgbOf(c) {
      const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(c).trim());
      if (m) return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
      const n = String(c).match(/[\d.]+/g);
      return n && n.length >= 3 ? [+n[0], +n[1], +n[2]] : [128, 128, 128];
    }
    function rgba(c, a) { const r = rgbOf(c); return 'rgba(' + r[0] + ',' + r[1] + ',' + r[2] + ',' + a + ')'; }
    function mix(a, b, t) {
      const x = rgbOf(a), y = rgbOf(b);
      return 'rgb(' + [0, 1, 2].map(function (i) { return Math.round(x[i] + (y[i] - x[i]) * t); }).join(',') + ')';
    }
    function shade(c, f) {
      const r = rgbOf(c), t = f > 0 ? 255 : 0, k = Math.abs(f);
      return 'rgb(' + r.map(function (x) { return Math.round(x + (t - x) * k); }).join(',') + ')';
    }
    const FONT = 'system-ui, -apple-system, "Segoe UI", "Noto Sans TC", "PingFang TC", sans-serif';
    function fsk() { // 齒輪設定的字體大小（與 settings.js 縮放畫布文字的比例相同）
      const s = window.LabSettings && window.LabSettings.get ? +window.LabSettings.get('fs') || 1 : 1;
      return 1 + (s - 1) * 0.7;
    }

    // ---------- 畫布與繪圖器 ----------
    const canvas = document.createElement('canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', T('平行板電容器的 3D 立體檢視：兩片金屬平板與板上的正負電荷、板間的電場線與等位面、可推入的介電質板，以及電池、開關與導線（可拖曳旋轉、縮放）',
      '3D view of the parallel-plate capacitor: the two metal plates with their charges, the field lines and equipotential surfaces between them, the sliding dielectric slab, and the battery, switch and wires (drag to rotate, pinch or scroll to zoom)'));
    env.host.insertBefore(canvas, env.host.firstChild);
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
    const camera = new THREE.PerspectiveCamera(30, 3 / 2, 0.5, 2000);
    const viewDir = V3(0.6, 0.43, 1).normalize();       // 由右前上方俯看（約 20°）
    const viewDirTall = V3(0.5, 0.72, 1).normalize();   // 直式／方形畫面：看高一點
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.minDistance = 6;
    controls.maxDistance = 260;
    controls.maxPolarAngle = Math.PI * 0.9;

    // 環境反射（簡單的攝影棚），讓金屬平板有真實的反光
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(new THREE.BoxGeometry(100, 100, 100), new THREE.MeshBasicMaterial({ color: 0x7d868b, side: THREE.BackSide })));
    [[0, 48, 0, 70, 70, 2.4], [-48, 12, 18, 30, 50, 1.5], [48, 6, 10, 26, 40, 1.0], [0, 12, 48, 50, 22, 1.1], [0, 20, -48, 60, 30, 1.3]].forEach(function (p) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(p[3], p[4]), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(p[5]), side: THREE.DoubleSide }));
      m.position.set(p[0], p[1], p[2]); m.lookAt(0, 0, 0);
      envScene.add(m);
    });
    const envRT = pmrem.fromScene(envScene, 0.04);
    scene.environment = envRT.texture;
    envScene.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });

    const hemi = new THREE.HemisphereLight(0xf2f6ff, 0x3a3632, 0.8);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff6ea, 1.6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.radius = 5;
    sun.shadow.bias = -0.0005;
    scene.add(sun, sun.target);
    const fill = new THREE.DirectionalLight(0xd2e2ff, 0.45);
    fill.position.set(40, 18, -30);
    scene.add(fill);

    // ---------- 小工具 ----------
    const owned = [];
    function own(x) { owned.push(x); return x; }
    function canvasTex(c, srgb) {
      const t = new THREE.CanvasTexture(c);
      if (srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      return t;
    }
    function disposeObj(o) {
      o.traverse(function (x) {
        if (x.geometry) x.geometry.dispose();
        if (x.material) (Array.isArray(x.material) ? x.material : [x.material]).forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); });
      });
    }
    function clearGroup(g) { while (g.children.length) { const c = g.children.pop(); disposeObj(c); } }
    const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), s4 = new THREE.Vector3(), p4 = new THREE.Vector3();
    function hash(i) { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }

    /** 中心對齊的一列座標：間距 a；放不下一個但有半格以上時放在中間（與 2D 相同的取法） */
    function axis(a0, a1, a) {
      const w = a1 - a0, n = Math.floor(w / a + 1e-9), out = [];
      if (n < 1) { if (w >= a * 0.5) out.push((a0 + a1) / 2); return out; }
      const off = a0 + (w - (n - 1) * a) / 2;
      for (let i = 0; i < n; i++) out.push(off + i * a);
      return out;
    }
    /** 方格點：x ∈ [x0, x1]、z ∈ [z0, z1]，間距 a（小於 amin 時以 amin 畫並回報 capped） */
    function grid(x0, x1, z0, z1, a, amin) {
      const r = { xs: [], zs: [], capped: false, a: a };
      if (!(a > 0) || !isFinite(a) || x1 - x0 < 1e-6 || z1 - z0 < 1e-6) return r;
      if (a < amin) { a = amin; r.capped = true; }
      r.a = a; r.xs = axis(x0, x1, a); r.zs = axis(z0, z1, a);
      return r;
    }

    // ---------- 貼圖 ----------
    // 拉絲金屬：細長的水平亮暗紋（只算一次）
    const brushC = document.createElement('canvas');
    brushC.width = 256; brushC.height = 256;
    (function () {
      const g = brushC.getContext('2d');
      g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 1400; i++) {
        const y = hash(i * 3.1) * 256, x = hash(i * 7.7) * 256, l = 30 + hash(i * 1.3) * 140, v = Math.round(185 + hash(i * 5.9) * 70);
        g.strokeStyle = 'rgba(' + v + ',' + v + ',' + v + ',0.55)';
        g.lineWidth = 0.6 + hash(i * 2.3) * 0.9;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + l, y); g.stroke();
        if (x + l > 256) { g.beginPath(); g.moveTo(x - 256, y); g.lineTo(x + l - 256, y); g.stroke(); }
      }
    })();
    const brushTex = own(canvasTex(brushC));
    brushTex.wrapS = brushTex.wrapT = THREE.RepeatWrapping;
    brushTex.repeat.set(1 / 9, 1 / 9);
    const brushRough = own(canvasTex(brushC, false));
    brushRough.wrapS = brushRough.wrapT = THREE.RepeatWrapping;
    brushRough.repeat.set(1 / 9, 1 / 9);

    /** 電荷小球的貼圖（亮點偏左上的球＋白色正負號；束縛電荷是空心圓環），點精靈用 */
    function chargeTexture(sign, hollow) {
      const S = 96, c = document.createElement('canvas');
      c.width = c.height = S;
      const g = c.getContext('2d'), m = S / 2, r = S * 0.44;
      const base = sign > 0 ? C.pos : C.neg;
      if (hollow) {
        const ring = mix(base, C['b-optics'], 0.35);
        g.fillStyle = rgba(C['canvas-bg'], 0.6);
        g.beginPath(); g.arc(m, m, r, 0, Math.PI * 2); g.fill();
        g.strokeStyle = ring; g.lineWidth = r * 0.3;
        g.beginPath(); g.arc(m, m, r - g.lineWidth / 2, 0, Math.PI * 2); g.stroke();
        g.strokeStyle = ring;
      } else {
        const gr = g.createRadialGradient(m - r * 0.35, m - r * 0.38, r * 0.08, m, m, r);
        gr.addColorStop(0, shade(base, 0.62));
        gr.addColorStop(0.5, base);
        gr.addColorStop(1, shade(base, -0.4));
        g.fillStyle = gr;
        g.beginPath(); g.arc(m, m, r, 0, Math.PI * 2); g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.95)';
      }
      g.lineWidth = r * 0.26; g.lineCap = 'round';
      const a = r * 0.5;
      g.beginPath(); g.moveTo(m - a, m); g.lineTo(m + a, m);
      if (sign > 0) { g.moveTo(m, m - a); g.lineTo(m, m + a); }
      g.stroke();
      return canvasTex(c);
    }
    /** 導線中電子的光點 */
    function glowTexture() {
      const S = 64, c = document.createElement('canvas');
      c.width = c.height = S;
      const g = c.getContext('2d'), gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
      gr.addColorStop(0, shade(C.neg, C.dark ? 0.55 : 0.35));
      gr.addColorStop(0.28, rgba(C.neg, 0.95));
      gr.addColorStop(0.55, rgba(C.neg, 0.28));
      gr.addColorStop(1, rgba(C.neg, 0));
      g.fillStyle = gr; g.fillRect(0, 0, S, S);
      return canvasTex(c);
    }

    // ---------- 材質 ----------
    const plateTopMat = own(new THREE.MeshStandardMaterial({ metalness: 0.85, roughness: 0.4, map: brushTex, roughnessMap: brushRough, envMapIntensity: 1.0 }));
    const plateBotMat = own(new THREE.MeshStandardMaterial({ metalness: 0.85, roughness: 0.4, map: brushTex, roughnessMap: brushRough, envMapIntensity: 1.0 }));
    const outlineMat = own(new THREE.LineBasicMaterial({ transparent: true, opacity: 0.85, depthWrite: false }));
    const postMat = own(new THREE.MeshStandardMaterial({ roughness: 0.42, metalness: 0 }));
    const groundMat = own(new THREE.ShadowMaterial({ opacity: 0.2, depthWrite: false }));
    const lineMat = own(new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0 }));
    const fringeMats = [0, 1, 2].map(function () { return own(new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0, transparent: true, depthWrite: false })); });
    const equiMat = own(new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    const equiEdgeMat = own(new THREE.LineBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false }));
    const slabMat = own(new THREE.MeshPhysicalMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 0.12, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 0.9 }));
    const slabEdgeMat = own(new THREE.LineBasicMaterial({ transparent: true, depthWrite: false }));
    const dipMat = own(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0 }));
    const wireTopMat = own(new THREE.MeshStandardMaterial({ roughness: 0.48, metalness: 0 }));
    const wireBotMat = own(new THREE.MeshStandardMaterial({ roughness: 0.48, metalness: 0 }));
    const battMat = own(new THREE.MeshPhysicalMaterial({ roughness: 0.3, metalness: 0.1, clearcoat: 0.8, clearcoatRoughness: 0.2 }));
    const capMat = own(new THREE.MeshStandardMaterial({ color: 0xd6dadc, roughness: 0.25, metalness: 0.95 }));
    const copperMat = own(new THREE.MeshStandardMaterial({ color: 0xc98a4e, roughness: 0.28, metalness: 0.9 }));
    const baseMat = own(new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0 }));
    const knobMat = own(new THREE.MeshPhysicalMaterial({ roughness: 0.3, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.15 }));
    const dimMat = own(new THREE.LineBasicMaterial({ transparent: true, opacity: 0.75, depthWrite: false }));
    let texPos, texNeg, texBPos, texBNeg, texGlow;
    // 點精靈的大小：three.js 的距離縮放少乘了 tan(視角/2)，這裡補上，讓小球的直徑是真的 2RQ 公分
    const PTK = 1 / Math.tan(camera.fov * Math.PI / 360);
    const ptMats = {
      pos: own(new THREE.PointsMaterial({ size: 2 * RQ / 0.88 * PTK, sizeAttenuation: true, transparent: true, alphaTest: 0.05, depthWrite: false, toneMapped: false })),
      neg: own(new THREE.PointsMaterial({ size: 2 * RQ / 0.88 * PTK, sizeAttenuation: true, transparent: true, alphaTest: 0.05, depthWrite: false, toneMapped: false })),
      bpos: own(new THREE.PointsMaterial({ size: 1.9 * RQ / 0.88 * PTK, sizeAttenuation: true, transparent: true, alphaTest: 0.05, depthWrite: false, toneMapped: false })),
      bneg: own(new THREE.PointsMaterial({ size: 1.9 * RQ / 0.88 * PTK, sizeAttenuation: true, transparent: true, alphaTest: 0.05, depthWrite: false, toneMapped: false })),
      glow: own(new THREE.PointsMaterial({ size: 0.7 * PTK, sizeAttenuation: true, transparent: true, depthWrite: false, toneMapped: false }))
    };

    function applyColors() {
      C = env.colors();
      themeVer++;
      const metal = C.dark ? '#a7b1b6' : '#c3cacd';
      plateTopMat.color.copy(col(mix(metal, C.pos, 0.07)));
      plateBotMat.color.copy(col(mix(metal, C.neg, 0.07)));
      outlineMat.color.copy(col(C.dark ? '#e6eef0' : '#ffffff'));
      postMat.color.copy(col(C.dark ? '#d9d4c8' : '#efebe2'));
      groundMat.opacity = C.dark ? 0.42 : 0.17;
      lineMat.color.copy(col(C.field));
      lineMat.emissive.copy(col(C.field)).multiplyScalar(C.dark ? 0.35 : 0.25);
      fringeMats.forEach(function (m, i) {
        m.color.copy(col(C.field)); m.emissive.copy(col(C.field)).multiplyScalar(C.dark ? 0.35 : 0.25);
        m.opacity = [0.7, 0.5, 0.34][i];
      });
      equiMat.color.copy(col(C.equi)); equiMat.opacity = C.dark ? 0.1 : 0.12;
      equiEdgeMat.color.copy(col(C.equi)); equiEdgeMat.opacity = C.dark ? 0.75 : 0.85;
      wireTopMat.color.copy(col(mix(C.pos, '#000000', C.dark ? 0.05 : 0.15)));
      wireBotMat.color.copy(col(C.dark ? '#3d4448' : '#2f3538'));
      battMat.color.copy(col(C['b-em']));
      baseMat.color.copy(col(C.dark ? '#2b3236' : '#3b4246'));
      knobMat.color.copy(col(C.dark ? '#2a2a2a' : '#1f1f1f'));
      dimMat.color.copy(col(C.text));
      hemi.intensity = C.dark ? 0.65 : 0.85;
      [texPos, texNeg, texBPos, texBNeg, texGlow].forEach(function (t) { if (t) t.dispose(); });
      texPos = chargeTexture(1, false); texNeg = chargeTexture(-1, false);
      texBPos = chargeTexture(1, true); texBNeg = chargeTexture(-1, true);
      texGlow = glowTexture();
      ptMats.pos.map = texPos; ptMats.neg.map = texNeg; ptMats.bpos.map = texBPos; ptMats.bneg.map = texBNeg; ptMats.glow.map = texGlow;
      Object.keys(ptMats).forEach(function (k) { ptMats[k].needsUpdate = true; });
    }

    // ---------- 場景物件 ----------
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = YG;
    ground.receiveShadow = true;
    scene.add(ground);

    const plateGroup = new THREE.Group();   // 兩片平板與支柱（面積改變時重建）
    const lineGroup = new THREE.Group();    // 電場線
    const fringeGroup = new THREE.Group();  // 邊緣場（示意）
    const equiGroup = new THREE.Group();    // 等位面
    const slabGroup = new THREE.Group();    // 介電質板
    const circuitGroup = new THREE.Group(); // 電池、開關、導線
    const dimGroup = new THREE.Group();     // 板距標示
    scene.add(plateGroup, lineGroup, fringeGroup, equiGroup, slabGroup, circuitGroup, dimGroup);
    let plateTop = null, plateBot = null, outlineTop = null, outlineBot = null;

    // 電場線：圓柱（底在 y = 0、高 1）＋中間的箭頭（尖端朝 −y）
    const lineGeo = own(new THREE.CylinderGeometry(1, 1, 1, 10, 1, true));
    lineGeo.translate(0, 0.5, 0);
    const headGeo = own(new THREE.ConeGeometry(0.34, 1, 18));
    headGeo.rotateX(Math.PI);
    const lines = new THREE.InstancedMesh(lineGeo, lineMat, MAXL);
    const heads = new THREE.InstancedMesh(headGeo, lineMat, MAXL);
    [lines, heads].forEach(function (m) { m.count = 0; m.frustumCulled = false; m.castShadow = true; lineGroup.add(m); });

    // 電荷：點精靈（永遠面向觀察者，所以正負號在任何角度都看得到）
    function makePoints(mat, n) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      g.setDrawRange(0, 0);
      const p = new THREE.Points(g, mat);
      p.frustumCulled = false;
      scene.add(p);
      return p;
    }
    const qPos = makePoints(ptMats.pos, MAXQ), qNeg = makePoints(ptMats.neg, MAXQ);
    const qBNeg = makePoints(ptMats.bneg, MAXQ), qBPos = makePoints(ptMats.bpos, MAXQ);
    const elec = makePoints(ptMats.glow, 200);
    qPos.renderOrder = qNeg.renderOrder = qBNeg.renderOrder = qBPos.renderOrder = 1;
    elec.renderOrder = 6;
    function setPoints(p, list) {
      const arr = p.geometry.attributes.position.array, n = Math.min(list.length, arr.length / 3);
      for (let i = 0; i < n; i++) { arr[i * 3] = list[i][0]; arr[i * 3 + 1] = list[i][1]; arr[i * 3 + 2] = list[i][2]; }
      p.geometry.attributes.position.needsUpdate = true;
      p.geometry.setDrawRange(0, n);
    }

    // 極化分子（示意）：一端偏負（藍）、一端偏正（紅）的小膠囊；對齊時＋端朝 −y（沿電場）
    const dipGeo = own(new THREE.CapsuleGeometry(0.1, 0.42, 4, 10));
    (function () {
      const pos = dipGeo.attributes.position, n = pos.count, cols = new Float32Array(n * 3);
      dipGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    })();
    function colorDip() {
      const pos = dipGeo.attributes.position, cols = dipGeo.attributes.color.array;
      const cn = col(C.neg), cp = col(C.pos), cm = cn.clone().lerp(cp, 0.5);
      const tmp = new THREE.Color();
      for (let i = 0; i < pos.count; i++) {
        const t = Math.max(0, Math.min(1, (0.31 - pos.getY(i)) / 0.62)); // y = +0.31 → 負端，y = −0.31 → 正端
        if (t < 0.5) tmp.copy(cn).lerp(cm, t * 2); else tmp.copy(cm).lerp(cp, (t - 0.5) * 2);
        cols[i * 3] = tmp.r; cols[i * 3 + 1] = tmp.g; cols[i * 3 + 2] = tmp.b;
      }
      dipGeo.attributes.color.needsUpdate = true;
    }
    const dips = new THREE.InstancedMesh(dipGeo, dipMat, MAXDIP);
    dips.count = 0; dips.frustumCulled = false; dips.castShadow = false;
    slabGroup.add(dips);

    // 邊緣場：三種形狀（u = 0、1、2）各一個 InstancedMesh，沿四條板邊排列
    const fringe = [0, 1, 2].map(function (i) {
      return { geo: null, tube: null, head: new THREE.InstancedMesh(headGeo, fringeMats[i], MAXF), key: '' };
    });
    fringe.forEach(function (f) { f.head.count = 0; f.head.frustumCulled = false; fringeGroup.add(f.head); });

    // ---------- 文字標示（精靈，畫布文字可自動轉簡體；有底框，永遠畫在最上層） ----------
    const labels = {};
    let labelPx = 22;
    function labelCanvas(parts, color) {
      const px = 46, pad = 18;
      const c = document.createElement('canvas'), g = c.getContext('2d');
      const fN = '600 ' + px + 'px ' + FONT, fS = '600 ' + Math.round(px * 0.68) + 'px ' + FONT;
      let w = 0;
      parts.forEach(function (p) { g.font = p[1] ? fS : fN; p.w = g.measureText(p[0]).width; w += p.w; });
      g.font = fN;
      const mt = g.measureText('Ag測');
      const fh = mt.fontBoundingBoxAscent > 0 ? mt.fontBoundingBoxAscent + mt.fontBoundingBoxDescent : px * 1.25;
      const W = Math.ceil(w + pad * 2), H = Math.ceil(fh + 14);
      c.width = W; c.height = H;
      const r = H / 2 - 2;
      g.beginPath();
      g.moveTo(r + 2, 2); g.lineTo(W - r - 2, 2); g.arc(W - r - 2, H / 2, r, -Math.PI / 2, Math.PI / 2);
      g.lineTo(r + 2, H - 2); g.arc(r + 2, H / 2, r, Math.PI / 2, Math.PI * 1.5); g.closePath();
      g.fillStyle = rgba(C['canvas-bg'], 0.86); g.fill();
      g.lineWidth = 2.5; g.strokeStyle = rgba(color, 0.45); g.stroke();
      g.textBaseline = 'middle';
      let x = pad;
      parts.forEach(function (p) {
        g.font = p[1] ? fS : fN;
        g.fillStyle = p[2] || color;
        g.fillText(p[0], x, H / 2 + (p[1] === 'sup' ? -px * 0.3 : p[1] === 'sub' ? px * 0.2 : 0) + 1);
        x += p.w;
      });
      return c;
    }
    /** key：標示代號；parts：字串或 [[文字, 'sup'|'sub'|''], …]；anchor：'c' 置中、'l' 點在左緣、'r' 點在右緣、'b' 點在下緣、't' 點在上緣 */
    function setLabel(key, parts, color, anchor, pos, vis) {
      if (typeof parts === 'string') parts = [[parts, '']];
      const sig = JSON.stringify(parts) + '|' + color + '|' + themeVer + '|' + anchor;
      let L = labels[key];
      if (!L || L.sig !== sig) {
        if (L) { scene.remove(L.sp); L.sp.material.map.dispose(); L.sp.material.dispose(); }
        const c = labelCanvas(parts, color);
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(c), transparent: true, depthWrite: false, depthTest: false, sizeAttenuation: false, toneMapped: false }));
        sp.userData.k = c.width / c.height;
        sp.renderOrder = 20;
        const c0 = [anchor === 'l' ? 0 : anchor === 'r' ? 1 : 0.5, anchor === 'b' ? 0 : anchor === 't' ? 1 : 0.5];
        sp.center.set(c0[0], c0[1]);
        L = labels[key] = { sp: sp, sig: sig, c0: c0 };
        scaleLabel(sp);
        scene.add(sp);
      }
      L.sp.position.copy(pos);
      L.sp.visible = vis !== false;
      return L.sp;
    }
    function hideLabel(key) { if (labels[key]) labels[key].sp.visible = false; }
    /** 標示互相重疊、超出畫面或蓋到角落說明時，在螢幕上往上或往下挪開（越前面的越優先留在原位） */
    const LABEL_ORDER = ['top', 'bot', 'kap', 'dist', 'area', 'E', 'batt', 'sw'];
    const pq = new THREE.Vector3();
    function declutter() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      const placed = [], cr = canvas.getBoundingClientRect();
      const notes = env.host.querySelector('.v3notes');
      if (notes) Array.prototype.forEach.call(notes.children, function (el) {
        const r = el.getBoundingClientRect();
        if (r.width && r.height) placed.push({ l: r.left - cr.left - 4, t: r.top - cr.top - 3, r: r.right - cr.left + 4, b: r.bottom - cr.top + 3 });
      });
      const lh = labelPx * fsk(), gap = 3;
      LABEL_ORDER.forEach(function (key) {
        const L = labels[key];
        if (!L || !L.sp.visible) return;
        const sp = L.sp;
        pq.copy(sp.position).project(camera);
        if (pq.z > 1) return;
        const px = (pq.x + 1) / 2 * w, py = (1 - pq.y) / 2 * h, lw = lh * sp.userData.k;
        const left = Math.max(3, Math.min(w - lw - 3, px - L.c0[0] * lw));
        const top0 = py - (1 - L.c0[1]) * lh;
        let best = null;
        for (let i = 0; i < 9 && !best; i++) {
          const k = i === 0 ? 0 : (i % 2 ? -1 : 1) * Math.ceil(i / 2);
          const t = top0 + k * (lh + gap);
          if (t < 2 || t + lh > h - 2) continue;
          const r = { l: left, t: t, r: left + lw, b: t + lh };
          if (!placed.some(function (o) { return o.l < r.r + gap && r.l < o.r + gap && o.t < r.b && r.t < o.b; })) best = r;
        }
        if (!best) { const t = Math.max(2, Math.min(h - lh - 2, top0)); best = { l: left, t: t, r: left + lw, b: t + lh }; }
        placed.push(best);
        sp.center.set((px - best.l) / lw, 1 - (py - best.t) / lh);
      });
    }
    function scaleLabel(sp) {
      const h = canvas.clientHeight || 400;
      const s = labelPx * fsk() / h * 2 * Math.tan(camera.fov * Math.PI / 360);
      sp.scale.set(s * sp.userData.k, s, 1);
    }

    // ---------- 幾何（依參數重建） ----------
    let G = null; // 目前的幾何：{ s, g, xs0, xd, slab }
    function roundedPlate(s) {
      const r = Math.min(0.35, s * 0.04), h = s / 2;
      const sh = new THREE.Shape();
      sh.moveTo(-h + r, -h); sh.lineTo(h - r, -h); sh.quadraticCurveTo(h, -h, h, -h + r); sh.lineTo(h, h - r);
      sh.quadraticCurveTo(h, h, h - r, h); sh.lineTo(-h + r, h); sh.quadraticCurveTo(-h, h, -h, h - r); sh.lineTo(-h, -h + r);
      sh.quadraticCurveTo(-h, -h, -h + r, -h);
      const bev = 0.06;
      const geo = new THREE.ExtrudeGeometry(sh, { depth: PT - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 2, curveSegments: 6 });
      geo.rotateX(-Math.PI / 2);          // 擠出方向改成 +y
      geo.translate(0, bev, 0);           // 底面在 y = 0、頂面在 y = PT
      return geo;
    }
    function outline(s, y) {
      const h = s / 2 - 0.02;
      const g = new THREE.BufferGeometry().setFromPoints([V3(-h, y, -h), V3(h, y, -h), V3(h, y, h), V3(-h, y, h)]);
      return new THREE.LineLoop(g, outlineMat);
    }
    function buildPlates(s, g) {
      clearGroup(plateGroup);
      const geo = roundedPlate(s);
      plateBot = new THREE.Mesh(geo, plateBotMat);
      plateBot.position.y = -PT;
      plateTop = new THREE.Mesh(geo.clone(), plateTopMat);
      plateTop.position.y = g;
      [plateBot, plateTop].forEach(function (m) { m.castShadow = true; m.receiveShadow = true; plateGroup.add(m); });
      plateTop.renderOrder = 8;   // 半透明時最後畫
      outlineTop = new THREE.Group();
      outlineTop.add(outline(s, g + PT), outline(s, g));
      outlineBot = new THREE.Group();
      outlineBot.add(outline(s, 0), outline(s, -PT));
      outlineTop.visible = outlineBot.visible = false;
      outlineTop.renderOrder = outlineBot.renderOrder = 9;
      plateGroup.add(outlineTop, outlineBot);
      // 絕緣支柱（白色塑膠）與底座
      const pg = new THREE.CylinderGeometry(0.32, 0.38, HP, 24);
      const fg = new THREE.CylinderGeometry(0.75, 0.82, 0.18, 32);
      const o = s / 2 - Math.min(1.2, s * 0.12);
      [[-o, -o], [o, -o], [-o, o], [o, o]].forEach(function (p) {
        const m = new THREE.Mesh(pg, postMat);
        m.position.set(p[0], -PT - HP / 2, p[1]);
        m.castShadow = true; m.receiveShadow = true;
        plateGroup.add(m);
        const f = new THREE.Mesh(fg, postMat);
        f.position.set(p[0], YG + 0.09, p[1]);
        f.castShadow = true; f.receiveShadow = true;
        plateGroup.add(f);
      });
      // 陰影範圍跟著器材大小
      const sc = sun.shadow.camera, R = s * 1.6 + 12;
      sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 1; sc.far = 200;
      sc.updateProjectionMatrix();
      sun.position.set(-0.45 * 60, 1.0 * 60, 0.62 * 60);
      sun.target.position.set(s * 0.15, YG, 0);
    }

    /** 介電質板：厚度等於板距，從 +x 側推入，蓋住平板的比例為 f（與 2D 相同） */
    function buildSlab(d) {
      slabGroup.children.slice().forEach(function (c) { if (c !== dips) { slabGroup.remove(c); disposeObj(c); } });
      if (!d.slab) return;
      const s = G.s, g = G.g;
      const geo = new THREE.BoxGeometry(s, g - 0.03, s);
      const box = new THREE.Mesh(geo, slabMat);
      box.position.set(G.xs0 + s / 2, g / 2, 0);
      box.renderOrder = 5;
      box.castShadow = false;
      slabGroup.add(box);
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo), slabEdgeMat);
      e.position.copy(box.position);
      e.renderOrder = 6;
      slabGroup.add(e);
      const sc = d.slabColor;
      slabMat.color.copy(col(C.dark ? shade(sc, 0.15) : sc));
      slabMat.opacity = C.dark ? 0.2 : 0.18;
      slabEdgeMat.color.copy(col(C.dark ? shade(sc, 0.35) : shade(sc, -0.15)));
      slabEdgeMat.opacity = 0.75;
    }

    /** 等位面：每隔 ΔV 一片（均勻電場中是平面，間距 = ΔV/E） */
    let dvCur = 0;
    function pickStep(V) {
      if (dvCur > 0 && V / dvCur >= 2.5 && V / dvCur <= 12) return dvCur;
      let best = 1, bestErr = 1e9;
      for (let e = -3; e <= 4; e++) {
        [1, 2, 5].forEach(function (m) {
          const c = m * Math.pow(10, e), err = Math.abs(Math.log(V / c / 6));
          if (err < bestErr) { bestErr = err; best = c; }
        });
      }
      dvCur = best;
      return best;
    }
    function buildEqui(d) {
      clearGroup(equiGroup);
      const S = d.S, s = G.s, g = G.g;
      if (!(S.V > 0)) return [];
      const dv = pickStep(S.V);
      const levels = [];
      for (let k = 1; k * dv < S.V * (1 - 1e-6); k++) levels.push(k * dv);
      if (!d.show.equi) return levels;
      const pg = new THREE.PlaneGeometry(s, s);
      pg.rotateX(-Math.PI / 2);
      const h = s / 2, pts = [];
      levels.forEach(function (v) {
        const y = g * v / S.V;
        const m = new THREE.Mesh(pg, equiMat);
        m.position.y = y;
        m.renderOrder = 3;
        equiGroup.add(m);
        pts.push(V3(-h, y, -h), V3(h, y, -h), V3(h, y, -h), V3(h, y, h), V3(h, y, h), V3(-h, y, h), V3(-h, y, h), V3(-h, y, -h));
      });
      if (pts.length) {
        const e = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), equiEdgeMat);
        e.renderOrder = 4;
        equiGroup.add(e);
      }
      return levels;
    }

    /** 馬克士威保角映射 z = (a/π)(1 + w + e^w)：u 固定是一條電場線，v = π 為上板、v = −π 為下板（板在 X ≤ 0） */
    function fringeProfile(a, u) {
      const pts = [], n = 64, eu = Math.exp(u);
      for (let i = 0; i <= n; i++) {
        const v = Math.PI - 2 * Math.PI * i / n;
        pts.push([(a / Math.PI) * (u + 1 + eu * Math.cos(v)), (a / Math.PI) * (v + eu * Math.sin(v))]);
      }
      // 去掉畫在金屬板裡面的部分（模型的板沒有厚度，這裡的板厚 PT）
      const inside = function (p) { return p[0] < -1e-6 && (p[1] > a - 1e-6 && p[1] < a + PT || p[1] < -a + 1e-6 && p[1] > -a - PT); };
      while (pts.length > 2 && inside(pts[0]) && inside(pts[1])) pts.shift();
      while (pts.length > 2 && inside(pts[pts.length - 1]) && inside(pts[pts.length - 2])) pts.pop();
      return pts;
    }
    function buildFringeShapes(g, s, r) {
      const a = g / 2;
      fringe.forEach(function (f, i) {
        const u = i;
        const x0 = (a / Math.PI) * (u + 1 - Math.exp(u));     // 這條線在平板上的起點（距板邊）
        const ok = x0 >= -0.3 * s / 2 - 1e-9;
        const key = [a.toFixed(4), ok, r.toFixed(4)].join('|');
        if (f.key === key) return;
        f.key = key;
        if (f.tube) { fringeGroup.remove(f.tube); f.tube.dispose(); f.tube = null; }
        if (f.geo) { f.geo.dispose(); f.geo = null; }
        f.ok = ok;
        if (!ok) return;
        const P = fringeProfile(a, u).map(function (p) { return V3(p[0], p[1], 0); });
        f.ext = P.reduce(function (e, p) { return [Math.max(e[0], p.x), Math.max(e[1], Math.abs(p.y))]; }, [0, 0]); // 伸出板邊多遠、離中間平面多高
        f.geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(P), 96, r * 0.75, 6, false);
        f.tube = new THREE.InstancedMesh(f.geo, fringeMats[i], MAXF);
        f.tube.count = 0; f.tube.frustumCulled = false;
        fringeGroup.add(f.tube);
        f.tipX = (a / Math.PI) * (u + 1 + Math.exp(u));
      });
    }

    // ---------- 電路：電池、開關、導線 ----------
    let wirePath = null; // 電子流動的路徑：[[x,y,z], …]，以及電池內部那一段的範圍
    function filleted(pts, r) {
      // 折線的轉角改成小圓角，讓導線像真的電線（先去掉重複的點）
      pts = pts.filter(function (p, i) { return i === 0 || p.distanceTo(pts[i - 1]) > 1e-6; });
      const out = [pts[0].clone()];
      for (let i = 1; i < pts.length - 1; i++) {
        const a = pts[i - 1], b = pts[i], c = pts[i + 1];
        const u = a.clone().sub(b), w = c.clone().sub(b);
        const lu = u.length(), lw = w.length();
        const rr = Math.min(r, lu / 2, lw / 2);
        u.normalize(); w.normalize();
        const p0 = b.clone().addScaledVector(u, rr), p1 = b.clone().addScaledVector(w, rr);
        for (let k = 0; k <= 6; k++) {
          const t = k / 6, it = 1 - t;
          out.push(V3(it * it * p0.x + 2 * it * t * b.x + t * t * p1.x, it * it * p0.y + 2 * it * t * b.y + t * t * p1.y, it * it * p0.z + 2 * it * t * b.z + t * t * p1.z));
        }
      }
      out.push(pts[pts.length - 1].clone());
      return out;
    }
    function tubeAlong(pts, rad, mat) {
      const curve = new THREE.CurvePath();
      for (let i = 1; i < pts.length; i++) if (pts[i].distanceTo(pts[i - 1]) > 1e-6) curve.add(new THREE.LineCurve3(pts[i - 1], pts[i]));
      const m = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(24, pts.length * 3), rad, 10, false), mat);
      m.castShadow = true; m.receiveShadow = true;
      return m;
    }
    function buildCircuit(d) {
      clearGroup(circuitGroup);
      const s = G.s, g = G.g;
      const rb = 1.05, Lb = Math.min(5, s * 0.55);
      const yTop = g + PT / 2, yBot = -PT / 2;
      const zc = Math.max(-Math.min(1.0, s * 0.08), 0.5 * s - 5.8); // 電池在左邊；平板大時往前移，才不會被平板擋住
      const zT = zc - Lb / 2 - 0.9, zB = zc + Lb / 2 + 0.9; // 上、下兩條導線所在的深度（電池兩端的外側）
      const zTab = Math.max(zT, -s / 2 + 0.6), zBab = Math.min(zB, s / 2 - 0.6); // 焊片在平板左側面上的位置
      const xDrop = -s / 2 - 0.9;                       // 導線在平板旁轉彎的位置
      const ys = YG + 0.55;                             // 開關刀片的高度
      const xc = xDrop - 0.7, xh = xc - 1.9;            // 開關的接點、轉軸（開關接在前方的下導線上）
      const xb = xh - 1.1, yb = YG + rb;                // 電池（橫躺，沿 z 軸；+ 極朝後、接上板）
      const body = new THREE.Mesh(new THREE.CylinderGeometry(rb, rb, Lb - 0.5, 40), battMat);
      body.rotation.x = Math.PI / 2; body.position.set(xb, yb, zc);
      const endP = new THREE.Mesh(new THREE.CylinderGeometry(rb * 0.98, rb * 0.98, 0.25, 40), capMat);
      endP.rotation.x = Math.PI / 2; endP.position.set(xb, yb, zc - Lb / 2 + 0.125);
      const nub = new THREE.Mesh(new THREE.CylinderGeometry(rb * 0.36, rb * 0.36, 0.3, 24), capMat);
      nub.rotation.x = Math.PI / 2; nub.position.set(xb, yb, zc - Lb / 2 - 0.15);
      const endN = new THREE.Mesh(new THREE.CylinderGeometry(rb * 0.98, rb * 0.98, 0.25, 40), capMat);
      endN.rotation.x = Math.PI / 2; endN.position.set(xb, yb, zc + Lb / 2 - 0.125);
      [body, endP, nub, endN].forEach(function (m) { m.castShadow = true; m.receiveShadow = true; circuitGroup.add(m); });
      // 刀型開關（放在桌上）：接上時刀片平放，斷開時向上翻開
      const base = new THREE.Mesh(new THREE.BoxGeometry(xc - xh + 1.1, 0.16, 1.0), baseMat);
      base.position.set((xh + xc) / 2, YG + 0.08, zB);
      base.castShadow = true; base.receiveShadow = true;
      circuitGroup.add(base);
      [xh, xc].forEach(function (x) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.24, ys - YG - 0.05, 0.5), copperMat);
        post.position.set(x, (ys + YG + 0.16) / 2, zB);
        post.castShadow = true; post.receiveShadow = true;
        circuitGroup.add(post);
      });
      const bl = xc - xh;
      const blade = new THREE.Group();
      const bm = new THREE.Mesh(new THREE.BoxGeometry(bl + 0.1, 0.07, 0.3), copperMat);
      bm.position.set(bl / 2, 0, 0);
      bm.castShadow = true;
      const knob = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.45, 4, 12), knobMat);
      knob.position.set(bl - 0.2, 0.3, 0);
      knob.castShadow = true;
      blade.add(bm, knob);
      blade.position.set(xh, ys + 0.1, zB);
      blade.rotation.z = d.mode === 'Q' ? 0.8 : 0;
      circuitGroup.add(blade);
      // 導線（依電子在充電時流動的順序）：上板 → 電池 + 極；電池 − 極 → 開關 → 下板
      const top = filleted([V3(-s / 2 + 0.05, yTop, zTab), V3(xDrop, yTop, zTab), V3(xDrop, yTop, zT), V3(xb, yTop, zT), V3(xb, yb, zT), V3(xb, yb, zc - Lb / 2 - 0.3)], 0.5);
      const bot1 = filleted([V3(xb, yb, zc + Lb / 2), V3(xb, yb, zB), V3(xb, ys, zB), V3(xh, ys, zB)], 0.45);
      const bot2 = filleted([V3(xc, ys, zB), V3(xDrop, ys, zB), V3(xDrop, yBot, zB), V3(xDrop, yBot, zBab), V3(-s / 2 + 0.05, yBot, zBab)], 0.5);
      const r = 0.12;
      circuitGroup.add(tubeAlong(top, r, wireTopMat), tubeAlong(bot1, r, wireBotMat), tubeAlong(bot2, r, wireBotMat));
      // 接到平板的焊片
      [[-s / 2 - 0.12, yTop, zTab], [-s / 2 - 0.12, yBot, zBab]].forEach(function (p) {
        const tab = new THREE.Mesh(new THREE.BoxGeometry(0.5, PT * 0.7, 0.6), capMat);
        tab.position.set(p[0], p[1], p[2]);
        tab.castShadow = true;
        circuitGroup.add(tab);
      });
      // 電子流動的路徑（上板 → 電池 + 極 → 電池內部 → − 極 → 開關 → 下板）
      const path = top.slice();
      const nIn0 = path.length - 1;
      bot1.forEach(function (p) { path.push(p); });
      const nIn1 = nIn0 + 1;
      bot2.forEach(function (p) { path.push(p); });
      const len = [0];
      for (let i = 1; i < path.length; i++) len.push(len[i - 1] + path[i].distanceTo(path[i - 1]));
      wirePath = { pts: path, len: len, in0: len[nIn0], in1: len[nIn1], total: len[len.length - 1] };
      G.circ = { xb: xb, yb: yb, zc: zc, rb: rb, Lb: Lb, zT: zT, zB: zB, xh: xh, xc: xc, ys: ys };
    }

    function placeElectrons(d) {
      const on = d.flowOn && d.mode === 'V' && wirePath && d.flowA > 0.03;
      if (!on) { elec.visible = false; return; }
      const W = wirePath, sp = 1.1, list = [];
      const ph = ((d.flowPhase * sp) % sp + sp) % sp;
      for (let t = ph; t < W.total; t += sp) {
        if (t > W.in0 - 0.2 && t < W.in1 + 0.2) continue; // 電池內部看不到
        let i = 1;
        while (i < W.len.length - 1 && W.len[i] < t) i++;
        const a = W.pts[i - 1], b = W.pts[i], u = (t - W.len[i - 1]) / Math.max(1e-9, W.len[i] - W.len[i - 1]);
        list.push([a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, a.z + (b.z - a.z) * u]);
      }
      setPoints(elec, list);
      ptMats.glow.opacity = 0.35 + 0.65 * d.flowA;
      elec.visible = true;
    }

    /** 板距的標示：右前方的直線與上下短橫線 */
    function buildDims(s, g) {
      clearGroup(dimGroup);
      const x = s / 2 + 0.35, z = s / 2 + 0.35, t = 0.25;
      const pts = [V3(x, 0, z), V3(x, g, z), V3(x - t, 0, z), V3(x + t, 0, z), V3(x - t, g, z), V3(x + t, g, z)];
      const l = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), dimMat);
      l.renderOrder = 10;
      dimGroup.add(l);
      G.dimAt = V3(x + 0.35, g / 2, z);
    }

    // ---------- 依狀態更新（只重建有變的部分） ----------
    const keys = {};
    let cur = null;
    function update() {
      if (!api.active) return;
      const d = env.data();
      cur = d;
      const S = d.S;
      const s = Math.sqrt(d.A) * 100;             // cm
      const g = d.d * 100 * GAPX;                 // cm（放大）
      const xs0 = -s / 2 + s * (1 - d.f);         // 介電質板左緣
      const xd = d.slab ? Math.max(-s / 2, Math.min(s / 2, xs0)) : s / 2; // 平板上空氣與介電質的分界
      G = Object.assign(G || {}, { s: s, g: g, xs0: xs0, xd: xd, slab: d.slab });

      const kGeo = [s.toFixed(4), g.toFixed(4)].join('|');
      if (keys.geo !== kGeo) {
        keys.geo = kGeo;
        buildPlates(s, g);
        buildDims(s, g);
        keys.circ = '';
      }
      const kCirc = [kGeo, d.mode, themeVer].join('|');
      if (keys.circ !== kCirc) { keys.circ = kCirc; buildCircuit(d); }
      const kSlab = [kGeo, d.slab, xs0.toFixed(4), d.slabColor, themeVer].join('|');
      if (keys.slab !== kSlab) { keys.slab = kSlab; buildSlab(d); }
      const kEqui = [kGeo, S.V.toPrecision(6), d.show.equi, themeVer].join('|');
      if (keys.equi !== kEqui) { keys.equi = kEqui; G.levels = buildEqui(d); }

      // 電場線與自由電荷：同一個方格（空氣部分每條電場線由一顆 + 出發、終止於一顆 −）
      const sigRef = K.EPS0 * d.Eref;
      const aL = S.E > 0 ? A0 * Math.sqrt(d.Eref / S.E) : Infinity;
      const LG = grid(-s / 2, s / 2, -s / 2, s / 2, aL, LMIN);
      let capL = LG.capped, capQ = false;
      const rL = Math.max(0.035, Math.min(0.09, s * 0.0045));
      const showL = d.show.lines && LG.xs.length && LG.zs.length;
      let n = 0;
      // 電場線畫在兩層電荷小球之間（由 + 小球的下緣到 − 小球的上緣），才不會穿過小球
      const yL0 = RQ * 1.7, yL1 = g - RQ * 1.7;
      if (showL) {
        const hc = Math.min(0.4, g * 0.2);
        LG.xs.forEach(function (x) {
          LG.zs.forEach(function (z) {
            if (n >= MAXL) return;
            m4.compose(p4.set(x, yL0, z), q4.identity(), s4.set(rL, yL1 - yL0, rL));
            lines.setMatrixAt(n, m4);
            m4.compose(p4.set(x, g / 2, z), q4.identity(), s4.set(hc, hc, hc));
            heads.setMatrixAt(n, m4);
            n++;
          });
        });
      }
      lines.count = heads.count = n;
      G.lx = LG.xs.length ? LG.xs[Math.max(0, LG.xs.length - 2)] : null; G.lz = LG.zs.length ? LG.zs[LG.zs.length - 1] : 0; // 「E」標在前排右邊第二條電場線旁
      lines.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = true;

      // 自由電荷：空氣部分 σ = ε0E，介電質部分 κε0E；束縛電荷 σb = (κ − 1)ε0E 在介電質上下表面
      const yQt = g - RQ * 0.75, yQb = RQ * 0.75;
      const posL = [], negL = [], bnL = [], bpL = [];
      if (S.Q > 0) {
        if (G.xd > -s / 2 + 1e-6) {
          let xs, zs;
          if (!LG.capped && Math.abs(LG.a - A0 * Math.sqrt(sigRef / S.sigmaAir)) < 1e-6 * LG.a) {
            xs = LG.xs.filter(function (x) { return x <= G.xd + 1e-6; }); zs = LG.zs;
          } else {
            const QG = grid(-s / 2, G.xd, -s / 2, s / 2, A0 * Math.sqrt(sigRef / S.sigmaAir), QMIN);
            if (QG.capped) capQ = true;
            xs = QG.xs; zs = QG.zs;
          }
          xs.forEach(function (x) { zs.forEach(function (z) { posL.push([x, yQt, z]); negL.push([x, yQb, z]); }); });
        }
        if (d.slab && G.xd < s / 2 - 1e-6) {
          const QG = grid(G.xd, s / 2, -s / 2, s / 2, A0 * Math.sqrt(sigRef / S.sigmaDiel), QMIN);
          if (QG.capped) capQ = true;
          QG.xs.forEach(function (x) { QG.zs.forEach(function (z) { posL.push([x, yQt, z]); negL.push([x, yQb, z]); }); });
          if (d.show.bound && S.sigmaBound > 0) {
            const BG = grid(G.xd, s / 2, -s / 2, s / 2, A0 * Math.sqrt(sigRef / S.sigmaBound), QMIN);
            if (BG.capped) capQ = true;
            const dy = 2.4 * RQ;
            if (g > 2 * (RQ * 0.75 + dy + RQ)) {
              BG.xs.forEach(function (x) { BG.zs.forEach(function (z) { bnL.push([x, yQt - dy, z]); bpL.push([x, yQb + dy, z]); }); });
            }
          }
        }
      }
      if (posL.length > MAXQ) capQ = true;
      setPoints(qPos, posL); setPoints(qNeg, negL); setPoints(qBNeg, bnL); setPoints(qBPos, bpL);

      // 極化分子（示意）：平板之間沿電場排列，平板外面（沒有電場）方向雜亂
      let nd = 0;
      if (d.slab && d.show.dip && g >= 1.8) {
        const sp = Math.max(1.3, s / 14), rows = Math.max(1, Math.min(4, Math.floor(g / 1.6)));
        const align = 1 - Math.exp(-S.E / (0.25 * d.Eref));
        const xs = axis(xs0, xs0 + s, sp), zs = axis(-s / 2, s / 2, sp);
        const dyR = g / rows;
        const qa = new THREE.Quaternion(), qr = new THREE.Quaternion(), eu = new THREE.Euler();
        for (let r = 0; r < rows; r++) {
          for (let i = 0; i < xs.length; i++) {
            for (let j = 0; j < zs.length; j++) {
              if (nd >= MAXDIP) break;
              const x = xs[i] + ((r + j) % 2 ? 0.22 : -0.22) * sp * 0.5, z = zs[j], y = dyR * (r + 0.5);
              const idx = i * 31.7 + j * 7.3 + r * 13.1;
              eu.set((hash(idx) - 0.5) * 2 * Math.PI, (hash(idx + 3.3) - 0.5) * 2 * Math.PI, (hash(idx + 7.1) - 0.5) * 2 * Math.PI);
              qr.setFromEuler(eu);
              const inside = x < s / 2 - 0.1;
              qa.identity().slerp(qr, inside ? 1 - align : 1);
              m4.compose(p4.set(x, y, z), qa, s4.set(1, 1, 1));
              dips.setMatrixAt(nd++, m4);
            }
          }
        }
      }
      dips.count = nd;
      dips.instanceMatrix.needsUpdate = true;

      // 邊緣場（示意）：沿四條板邊、在電場線的位置
      const showF = showL && d.show.fringe;
      fringeGroup.visible = !!showF;
      if (showF) {
        buildFringeShapes(g, s, rL);
        fringe.forEach(function (f) {
          let k = 0;
          if (f.ok && f.tube) {
            const put = function (x, z, rot) {
              if (k >= MAXF) return;
              q4.setFromAxisAngle(V3(0, 1, 0), rot);
              m4.compose(p4.set(x, g / 2, z), q4, s4.set(1, 1, 1));
              f.tube.setMatrixAt(k, m4);
              const tip = V3(f.tipX, 0, 0).applyQuaternion(q4);
              const hc = Math.min(0.45, g * 0.25);
              m4.compose(p4.set(x + tip.x, g / 2, z + tip.z), q4, s4.set(hc, hc, hc));
              f.head.setMatrixAt(k, m4);
              k++;
            };
            const st = Math.max(1, Math.ceil(0.55 * g / LG.a)); // 邊緣場線的大小與板距相當；格子比板距密時隔幾條畫一條，免得糊成一片
            const pick = function (arr) { const m = Math.floor((arr.length - 1) / 2); return arr.filter(function (v, i) { return ((i - m) % st + st) % st === 0; }); };
            pick(LG.zs).forEach(function (z) { put(s / 2, z, 0); put(-s / 2, z, Math.PI); });
            pick(LG.xs).forEach(function (x) { put(x, s / 2, -Math.PI / 2); put(x, -s / 2, Math.PI / 2); });
            f.tube.count = k;
            f.tube.instanceMatrix.needsUpdate = true;
          }
          f.head.count = k;
          f.head.instanceMatrix.needsUpdate = true;
        });
      }

      placeElectrons(d);
      updateLabels(d);
      env.notes(G.levels && G.levels.length && d.show.equi ? T('等位面間隔 ΔV = ', 'Equipotentials every ΔV = ') + d.volt(dvCur) : '',
        (capL && d.show.lines ? T('≈ 電場線太密，未全部畫出', '≈ field lines too dense to draw them all') : '') +
        (capL && d.show.lines && capQ ? T('；', '; ') : '') +
        (capQ ? T('≈ 電荷太密，未全部畫出', '≈ charges too dense to draw them all') : ''));
      autoFrame();
      requestRender();
    }

    function updateLabels(d) {
      const s = G.s, g = G.g, S = d.S;
      // 兩板：電量與電位（下板接地 0 V）
      setLabel('top', [['+Q', ''], ['  ' + d.volt(S.V), '', C.equi]], C.pos, 'b', V3(-s / 2 + 0.9, g + PT + 0.2, s / 2 - 0.4), true);
      setLabel('bot', [['−Q', ''], ['  ' + d.volt(0), '', C.equi]], C.neg, 't', V3(-s * 0.08, -PT - 0.3, s / 2), true);
      setLabel('area', [[d.aNum, ''], ['2', 'sup']], C.text, 'b', V3(0, g + PT + 0.25, -s / 2 + 0.4), true);
      setLabel('dist', d.dText, C.text, 'l', G.dimAt, true);
      // 介電質
      if (d.slab) {
        const outA = Math.max(G.xs0, s / 2), outB = G.xs0 + s;
        const xx = outB - outA > 2.2 ? (outA + outB) / 2 : G.xs0 + s / 2;
        const yy = outB - outA > 2.2 ? g + 0.25 : g / 2;
        setLabel('kap', d.kText, shade(d.slabColor, C.dark ? 0.35 : -0.3), outB - outA > 2.2 ? 'b' : 'c', V3(xx, yy, outB - outA > 2.2 ? 0 : s / 2), true);
      } else hideLabel('kap');
      // 電場
      if (d.show.lines && lines.count && G.lx) {
        setLabel('E', 'E', C.field, 'l', V3(G.lx + 0.22, g * 0.3, G.lz), g > 1.2);
      } else hideLabel('E');
      // 電池與開關
      const c = G.circ;
      setLabel('batt', d.battText, d.mode === 'V' ? C['b-em'] : C.muted, 'b', V3(c.xb, c.yb + c.rb + 0.35, c.zc), true);
      setLabel('sw', d.mode === 'V' ? T('開關：接上', 'Switch: closed') : T('開關：斷開', 'Switch: open'), d.mode === 'V' ? C.accent : C.muted, 'b',
        V3((c.xh + c.xc) / 2, c.ys + (d.mode === 'V' ? 0.6 : 1.75), c.zB), true);
    }

    // ---------- 相機 ----------
    function keyPoints() { // 器材的外形與標示的位置（相機要讓它們都在畫面裡）
      const s = G.s, g = G.g, c = G.circ, pts = [];
      [-s / 2, s / 2].forEach(function (x) {
        [-s / 2, s / 2].forEach(function (z) { pts.push(V3(x, -PT, z), V3(x, g + PT, z)); });
      });
      const o = s / 2 - Math.min(1.2, s * 0.12) + 0.85;
      [-o, o].forEach(function (x) { [-o, o].forEach(function (z) { pts.push(V3(x, YG, z)); }); });
      if (c) {
        [c.xb - c.rb, c.xb + c.rb].forEach(function (x) {
          [c.zc - c.Lb / 2 - 0.3, c.zc + c.Lb / 2].forEach(function (z) { pts.push(V3(x, YG, z), V3(x, c.yb + c.rb + 0.9, z)); });
        });
        pts.push(V3(c.xh - 0.6, YG, c.zB + 0.5), V3(c.xc + 0.6, c.ys + 1.0, c.zB + 0.5));
      }
      if (fringeGroup.visible) { // 邊緣場線伸到板外的範圍
        let R = 0, Y = 0;
        fringe.forEach(function (f) { if (f.ok && f.ext) { R = Math.max(R, f.ext[0]); Y = Math.max(Y, f.ext[1]); } });
        if (R > 0) [-1, 1].forEach(function (sx) {
          [-1, 1].forEach(function (sz) {
            pts.push(V3(sx * (s / 2 + R), g / 2, sz * s / 2), V3(sx * s / 2, g / 2, sz * (s / 2 + R)), V3(sx * s / 2, g / 2 + Y, sz * s / 2), V3(sx * s / 2, g / 2 - Y, sz * s / 2));
          });
        });
      }
      if (G.slab) { const xe = Math.max(s / 2, G.xs0 + s) + 0.3; [-s / 2, s / 2].forEach(function (z) { pts.push(V3(xe, 0, z), V3(xe, g, z)); }); }
      pts.push(V3(0, g + PT + 1.0, -s / 2 + 0.4));               // 面積標示
      pts.push(V3(s / 2 + 2.9, g / 2, s / 2 + 0.35));            // 板距標示
      pts.push(V3(-s / 2 + 0.9, g + PT + 1.0, s / 2 - 0.4), V3(-s / 2 + 0.9, -PT - 1.0, s / 2 - 0.4)); // ±Q
      return pts;
    }
    let lastFitDist = 0;
    function fit(force) {
      if (!G) return;
      const tv = Math.tan(camera.fov * Math.PI / 360), th = tv * camera.aspect;
      const dir = force ? (camera.aspect < 1.1 ? viewDirTall.clone() : viewDir.clone()) : camera.position.clone().sub(controls.target).normalize();
      const KP = keyPoints();
      const c0 = new THREE.Vector3();
      KP.forEach(function (p) { c0.add(p); });
      c0.multiplyScalar(1 / KP.length);
      controls.target.copy(c0);
      const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), dir).normalize();
      const up = new THREE.Vector3().crossVectors(dir, right);
      function need() {
        let d = 5;
        KP.forEach(function (p) {
          const q = p.clone().sub(controls.target);
          d = Math.max(d, q.dot(dir) + Math.abs(q.dot(right)) / th, q.dot(dir) + Math.abs(q.dot(up)) / tv);
        });
        return d;
      }
      let dist = need();
      for (let it = 0; it < 3; it++) { // 平移目標點，讓上下、左右留白一樣
        let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
        KP.forEach(function (p) {
          const q = p.clone().sub(controls.target), z = dist - q.dot(dir);
          const x = q.dot(right) / (z * th), y = q.dot(up) / (z * tv);
          x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        });
        controls.target.addScaledVector(right, (x0 + x1) / 2 * dist * th * 0.8).addScaledVector(up, (y0 + y1) / 2 * dist * tv * 0.8);
        dist = need();
      }
      dist *= 1.1;
      camera.position.copy(controls.target).addScaledVector(dir, dist);
      camera.near = Math.max(0.2, dist / 200); camera.far = dist * 30;
      camera.updateProjectionMatrix();
      controls.update();
      lastFitDist = dist;
    }
    /** 參數改變後，器材跑出畫面或變得太小時才重新對焦（保留目前的觀看方向），讓面積、板距的變化看得出來 */
    let fitGeoKey = '';
    function autoFrame() {
      const k = [G.s.toFixed(3), G.g.toFixed(3), G.slab, G.slab ? Math.round((G.xs0 / G.s + 0.5) * 10) : '', fringeGroup.visible].join('|'); // 介電質拉出時也檢查一次
      if (k === fitGeoKey) return;
      const first = !fitGeoKey;
      fitGeoKey = k;
      if (first) { fit(true); return; }
      camera.updateMatrixWorld();
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, behind = false;
      keyPoints().forEach(function (p) {
        const q = p.clone().project(camera);
        if (q.z > 1) behind = true;
        x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y);
      });
      if (behind || x0 < -1.02 || x1 > 1.02 || y0 < -1.02 || y1 > 1.02 || Math.max(x1 - x0, y1 - y0) < 0.75) fit(false);
    }
    function pxScale() { // 目標點附近每公分約幾個畫素
      const h = canvas.clientHeight || 400;
      const dist = camera.position.distanceTo(controls.target) || 30;
      return h / (2 * dist * Math.tan(camera.fov * Math.PI / 360));
    }

    // ---------- 繪製 ----------
    let raf = 0, xrayKey = '';
    function setXray(mat, outlineG, on) {
      mat.transparent = on;
      mat.opacity = on ? 0.4 : 1;
      mat.depthWrite = !on;
      mat.needsUpdate = true;
      if (outlineG) outlineG.visible = on;
    }
    /** 從上方看時上板變半透明（才看得到它內側表面的正電荷）；從下方看時下板變半透明 */
    function xray() {
      if (!G) return;
      const y = camera.position.y;
      const top = y > G.g + PT, bot = y < -PT;
      const k = top + '|' + bot + '|' + (plateTop ? plateTop.uuid : '');
      if (k === xrayKey) return;
      xrayKey = k;
      setXray(plateTopMat, outlineTop, top);
      setXray(plateBotMat, outlineBot, bot);
    }
    function renderNow() {
      if (!api.active || document.hidden) return;
      const want = Math.min(window.devicePixelRatio || 1, 2);
      if (renderer.getPixelRatio() !== want) { renderer.setPixelRatio(want); resize3(); return; }
      const moved = controls.update();
      xray();
      camera.updateMatrixWorld();
      declutter();
      renderer.render(scene, camera);
      if (moved) requestRender();
    }
    function requestRender() {
      if (raf || !api.active) return;
      raf = requestAnimationFrame(function () { raf = 0; renderNow(); });
    }
    let lastAspect = 0, labelKey = '';
    function resize3() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      labelPx = w < 520 ? 17 : 21;
      if (Math.abs(camera.aspect - lastAspect) > 0.01) { const first = !lastAspect; lastAspect = camera.aspect; fit(first); }
      Object.keys(labels).forEach(function (k) { scaleLabel(labels[k].sp); });
      if (cur) update(); else requestRender();
    }
    const ro = window.ResizeObserver ? new ResizeObserver(resize3) : null;
    if (ro) ro.observe(canvas); else window.addEventListener('resize', resize3);
    let zoomKey = '';
    controls.addEventListener('change', function () {
      // 縮放後等位面標示的疏密要重算
      const k = Math.round(Math.log(camera.position.distanceTo(controls.target)) * 8);
      if (k !== zoomKey && cur) { zoomKey = k; updateLabels(cur); }
      requestRender();
    });
    const onVisible = function () { if (!document.hidden) requestRender(); };
    document.addEventListener('visibilitychange', onVisible);
    canvas.addEventListener('webglcontextlost', function (ev) {
      ev.preventDefault();
      if (!api.active) return;   // 切回 2D 時自己釋放的，不是意外中斷
      if (env.onLost) env.onLost();
    });

    const api = {
      active: true,
      update: update,
      frame: function () { update(); if (raf) { cancelAnimationFrame(raf); raf = 0; } renderNow(); },
      onTheme: function () {
        applyColors(); colorDip();
        Object.keys(keys).forEach(function (k) { keys[k] = ''; });
        fringe.forEach(function (f) { f.key = ''; });
        update();
      },
      resetCamera: function () { fit(true); if (cur) updateLabels(cur); requestRender(); },
      dispose: function () {
        api.active = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize3);
        document.removeEventListener('visibilitychange', onVisible);
        controls.dispose();
        Object.keys(labels).forEach(function (k) { labels[k].sp.material.map.dispose(); labels[k].sp.material.dispose(); });
        fringe.forEach(function (f) { if (f.geo) f.geo.dispose(); });
        disposeObj(scene);
        [texPos, texNeg, texBPos, texBNeg, texGlow].forEach(function (t) { if (t) t.dispose(); });
        owned.forEach(function (x) { if (x && x.dispose) x.dispose(); });
        envRT.dispose(); pmrem.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        canvas.remove();
        env.notes('', '');
      }
    };

    applyColors();
    colorDip();
    const w0 = canvas.clientWidth, h0 = canvas.clientHeight;
    if (w0 && h0) { renderer.setSize(w0, h0, false); camera.aspect = w0 / h0; camera.updateProjectionMatrix(); lastAspect = camera.aspect; labelPx = w0 < 520 ? 17 : 21; }
    update();
    fit(true);
    requestRender();
    return api;
  }

  window.Capacitor3D = { create: create, GAPX: GAPX };
})();
