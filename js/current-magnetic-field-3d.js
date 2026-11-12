/* current-magnetic-field-3d.js — 「電流的磁效應」的 3D 立體檢視（three.js 由 current-magnetic-field.js 以 import() 延遲載入後傳進來）
 *
 * 用法：const v = CurrentMagneticField3D.create({ THREE, OrbitControls }, env)
 *   env.host     放畫布的元素
 *   env.core     CurrentMagneticFieldCore（磁場、磁力線起點與追線都用同一套物理計算）
 *   env.T        T('中文', 'English')
 *   env.state()  目前狀態：{ mode, I, s, above, h (m), alpha (deg), d (m), earth, BH, phi (rad), field, P, probe (cm), show, show3, flowT, reading, zero }
 *   env.tokens() 顏色（--cm-* 與 drawkit 的顏色）
 *   env.lost()   WebGL 環境中斷時呼叫
 * 回傳 { active, update(), rebuild(), onTheme(), resetCamera(), dispose() }
 *
 * 座標：物理核心的 (x, y, z)（m）→ 場景 (X, Y, Z) = (x, z, −y) × 100（cm）。這是一個轉動（行列式 +1），向量也照同一規則轉換。
 *   厄斯特實驗：x 東、y 磁北、z 上 → 場景 X 東、Y 上、−Z 北。磁針轉軸在原點。
 *   三種形狀：2D 剖面的 (x, y) 就是場景的水平面 Y = 0（X = x，Z = −y）；長直導線沿 Y（s = +1 時電流向上）；
 *   圓線圈與螺線管的軸沿 X。軸對稱磁場的磁力線在通過軸的平面上：以「等通量」的圓盤起點 (ρ, φ) 在剖面上追線再繞軸轉 φ。
 */
(function () {
  'use strict';

  function create(lib, env) {
    const THREE = lib.THREE, C = env.core, T = env.T;
    const DEG = Math.PI / 180;
    let tok = env.tokens();
    let cur = null;
    const V = function (x, y, z) { return new THREE.Vector3(x, y, z); };

    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', T('3D 立體檢視：導線、羅盤或線圈與螺線管，以及立體的磁力線、小磁針與鐵粉（可拖曳旋轉、縮放）',
      '3D view: the wire and compass, or the coil and solenoid, with field lines, compass needles and iron filings in space (drag to rotate, pinch or scroll to zoom)'));
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
    controls.minDistance = 6;
    controls.maxDistance = 260;

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
    const hemi = new THREE.HemisphereLight(0xf2f6ff, 0x3a3530, 0.75);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff4e6, 1.6);
    sun.position.set(-20, 46, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.radius = 4;
    sun.shadow.bias = -0.0006;
    const sc = sun.shadow.camera;
    sc.left = -34; sc.right = 34; sc.bottom = -34; sc.top = 34; sc.near = 10; sc.far = 140;
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xcfe0ff, 0.5);
    fill.position.set(40, 20, -30);
    scene.add(fill);

    // ---- 小工具 ----
    const owned = [];
    function own(x) { owned.push(x); return x; }
    function canvasTex(c, srgb) {
      const t = new THREE.CanvasTexture(c);
      if (srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      return own(t);
    }
    function std(color, metal, rough, extra) {
      return own(new THREE.MeshStandardMaterial(Object.assign({ color: color, metalness: metal, roughness: rough }, extra || {})));
    }
    function mesh(geo, mat, cast, recv) {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = cast !== false; m.receiveShadow = recv !== false;
      return m;
    }
    function clearGroup(g) {
      for (let i = g.children.length - 1; i >= 0; i--) {
        const o = g.children[i];
        if (o.children && o.children.length) clearGroup(o);
        if (o.geometry) o.geometry.dispose();
        g.remove(o);
      }
    }
    const FONT = 'system-ui, -apple-system, "Segoe UI", "Noto Sans TC", sans-serif';
    const F3 = function (px, w) { return (w || '600') + ' ' + px + 'px ' + FONT; };
    const Yup = V(0, 1, 0);

    // ---- 材質（顏色在 applyColors 依深淺色更新） ----
    const copperMat = std(0xb8743d, 0.85, 0.3);
    const brassMat = std(0xb7924a, 0.85, 0.3);
    const glassMat = own(new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.05, transmission: 0, transparent: true, opacity: 0.16, depthWrite: false }));
    const acrylMat = own(new THREE.MeshStandardMaterial({ color: 0xdfeef3, metalness: 0, roughness: 0.15, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide }));
    const woodMat = std(0xe3dccf, 0, 0.75);
    const postMat = std(0x8f6a46, 0, 0.6);
    const needleNMat = std(0xc8372d, 0.3, 0.4);
    const needleSMat = std(0xd9dee0, 0.6, 0.35);
    const fieldMat = own(new THREE.MeshBasicMaterial({ color: 0x2f6fd0, transparent: true, opacity: 0.7, depthWrite: false }));
    const fieldMatHi = own(new THREE.MeshBasicMaterial({ color: 0x2f6fd0, transparent: true, opacity: 0.95, depthWrite: false }));
    const fConeMat = own(new THREE.MeshBasicMaterial({ color: 0x2f6fd0, transparent: true, opacity: 0.9, depthWrite: false }));
    const flowMat = own(new THREE.MeshBasicMaterial({ color: 0xe7b75a }));
    const iConeMat = std(0x8a5a00, 0.2, 0.4, { emissive: 0x000000 });
    const probeMat = std(0x2f6fd0, 0.1, 0.35, { emissive: 0x000000 });
    const filMat = own(new THREE.LineBasicMaterial({ color: 0x30363a, transparent: true, opacity: 0.7 }));
    const plateMat = own(new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0, roughness: 0.9, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));

    // ---- 箭頭 ----
    function makeArrow(color, r) {
      r = r || 0.12;
      const mat = std(color, 0.15, 0.4, { emissive: color, emissiveIntensity: 0.18 });
      const g = new THREE.Group();
      const shaft = mesh(new THREE.CylinderGeometry(r, r, 1, 14), mat, true, false);
      const head = mesh(new THREE.ConeGeometry(r * 2.6, r * 7, 18), mat, true, false);
      g.add(shaft, head);
      g.userData = { mat: mat, shaft: shaft, head: head, r: r };
      g.visible = false;
      scene.add(g);
      return g;
    }
    function setArrow(a, origin, dir, L) {
      if (!(L > 0.05)) { a.visible = false; return; }
      const r = a.userData.r, hl = Math.min(r * 7, L * 0.5), sl = L - hl;
      a.visible = true;
      a.position.copy(origin);
      a.quaternion.setFromUnitVectors(Yup, dir.clone().normalize());
      a.userData.shaft.scale.set(1, Math.max(1e-3, sl), 1);
      a.userData.shaft.position.set(0, sl / 2, 0);
      a.userData.head.scale.set(1, hl / (r * 7), 1);
      a.userData.head.position.set(0, sl + hl / 2, 0);
    }

    // ---- 名稱標示（含下標：parts = ['B', ['H']]） ----
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
      const mat = own(new THREE.SpriteMaterial({ map: canvasTex(c), transparent: true, depthWrite: false, depthTest: false, sizeAttenuation: false }));
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

    // =====================================================================
    // 厄斯特實驗
    // =====================================================================
    const oerG = new THREE.Group(); scene.add(oerG);
    const CASE_R = 4.6, DIAL_R = 4.1, CASE_B = -0.6, CASE_T = 0.6;
    // 桌面（木紋貼圖）
    const woodC = document.createElement('canvas'); woodC.width = 512; woodC.height = 512;
    const woodTex = canvasTex(woodC); woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping;
    function drawWood() {
      const g = woodC.getContext('2d');
      const base = new THREE.Color(tok.table || '#e3dccf');
      g.fillStyle = '#' + base.getHexString(); g.fillRect(0, 0, 512, 512);
      const dk = base.clone().multiplyScalar(0.82), lt = base.clone().lerp(new THREE.Color(1, 1, 1), 0.18);
      for (let i = 0; i < 70; i++) {
        const y0 = (i * 7.3 + (i % 3) * 2) % 512;
        g.strokeStyle = '#' + (i % 2 ? dk : lt).getHexString(); g.globalAlpha = 0.12 + 0.1 * ((i * 37) % 5) / 5; g.lineWidth = 1 + (i % 3);
        g.beginPath(); g.moveTo(0, y0);
        for (let x = 0; x <= 512; x += 32) g.lineTo(x, y0 + 4 * Math.sin(x / 70 + i) + 2 * Math.sin(x / 23 + i * 1.7));
        g.stroke();
      }
      g.globalAlpha = 1;
      woodTex.needsUpdate = true;
    }
    const table = mesh(new THREE.PlaneGeometry(90, 90), woodMat, false, true);
    table.rotation.x = -Math.PI / 2;
    woodMat.map = woodTex; woodTex.repeat.set(3, 3);
    oerG.add(table);
    // 羅盤：黃銅外殼、刻度盤、玻璃蓋、磁針
    const compass = new THREE.Group(); oerG.add(compass);
    compass.add(mesh(new THREE.CylinderGeometry(CASE_R, CASE_R + 0.1, CASE_T - CASE_B, 64, 1, true), brassMat));
    const caseBottom = mesh(new THREE.CylinderGeometry(CASE_R + 0.1, CASE_R + 0.1, 0.2, 64), brassMat);
    caseBottom.position.y = CASE_B + 0.1; compass.add(caseBottom);
    const rim = mesh(new THREE.TorusGeometry(CASE_R, 0.16, 12, 80), brassMat);
    rim.rotation.x = Math.PI / 2; rim.position.y = CASE_T; compass.add(rim);
    const dialC = document.createElement('canvas'); dialC.width = 1024; dialC.height = 1024;
    const dialTex = canvasTex(dialC);
    const dialMat = std(0xffffff, 0, 0.55, { map: dialTex });
    const dial = mesh(new THREE.CircleGeometry(DIAL_R + 0.45, 96), dialMat, false, true);
    dial.rotation.x = -Math.PI / 2; dial.position.y = -0.32; compass.add(dial);
    const glass = new THREE.Mesh(new THREE.CircleGeometry(CASE_R, 64), glassMat);
    glass.rotation.x = -Math.PI / 2; glass.position.y = CASE_T - 0.02; glass.renderOrder = 6; compass.add(glass);
    let dialKey = '';
    function drawDial(z0) {
      const key = z0.toFixed(3) + '|' + (tok.dial || '') + (tok.ink || '') + (tok['needle-n'] || '');
      if (key === dialKey) return;
      dialKey = key;
      const g = dialC.getContext('2d'), S = 1024, cx = S / 2, R = S / 2 * DIAL_R / (DIAL_R + 0.45);
      g.fillStyle = tok.dial || '#fbf8f0'; g.fillRect(0, 0, S, S);
      g.save(); g.translate(cx, cx); g.rotate(z0 * DEG);
      g.strokeStyle = tok.ink || '#2b3439';
      for (let a = 0; a < 360; a++) {
        const L10 = a % 10 === 0, L5 = a % 5 === 0;
        const r1 = R - 3, r0 = R - (L10 ? R * 0.11 : L5 ? R * 0.075 : R * 0.045);
        g.lineWidth = L10 ? 4 : L5 ? 3 : 2;
        g.beginPath(); g.moveTo(Math.sin(a * DEG) * r0, -Math.cos(a * DEG) * r0); g.lineTo(Math.sin(a * DEG) * r1, -Math.cos(a * DEG) * r1); g.stroke();
      }
      g.fillStyle = tok.ink || '#2b3439'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = F3(34);
      for (let a = 10; a < 360; a += 10) {
        if (a % 90 === 0) continue;
        const lab = String(a <= 90 ? a : a <= 180 ? 180 - a : a <= 270 ? a - 180 : 360 - a);
        g.save(); g.translate(Math.sin(a * DEG) * R * 0.8, -Math.cos(a * DEG) * R * 0.8); g.rotate(a * DEG); g.fillText(lab, 0, 0); g.restore();
      }
      [['N', 0], ['E', 90], ['S', 180], ['W', 270]].forEach(function (p) {
        g.save(); g.translate(Math.sin(p[1] * DEG) * R * 0.78, -Math.cos(p[1] * DEG) * R * 0.78); g.rotate(p[1] * DEG);
        g.font = F3(60, '800'); g.fillStyle = p[0] === 'N' ? (tok['needle-n'] || '#c8372d') : (tok.ink || '#2b3439');
        g.fillText(p[0], 0, 0); g.restore();
      });
      g.restore();
      dialTex.needsUpdate = true;
    }
    // 磁針（菱形，北半紅、南半灰），在原點繞 Y 軸轉
    const needle = new THREE.Group(); oerG.add(needle);
    (function () {
      const L = DIAL_R * 0.8, w = 0.34, t = 0.09;
      const half = function (dir, mat) {
        const shape = new THREE.Shape();
        shape.moveTo(0, 0); shape.lineTo(w, 0); shape.lineTo(0, L * dir); shape.lineTo(-w, 0); shape.lineTo(0, 0);
        const g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2 });
        g.rotateX(-Math.PI / 2); // 形狀的 +Y → 場景 −Z（北），厚度往上
        const m = mesh(g, mat, true, false);
        return m;
      };
      needle.add(half(1, needleNMat), half(-1, needleSMat));
      const cap = mesh(new THREE.SphereGeometry(0.22, 20, 12), brassMat);
      cap.position.y = 0.05; needle.add(cap);
    })();
    const pivot = mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.34, 10), brassMat);
    pivot.position.y = -0.16; oerG.add(pivot);
    // 導線（銅棒）與支架
    const wireG = new THREE.Group(); oerG.add(wireG); // 區域座標：導線沿 +Z（電流 s = +1 的方向是 −Z，見 placeWire）
    const WL = 34;
    const wireRod = mesh(new THREE.CylinderGeometry(0.18, 0.18, WL, 20), copperMat);
    wireRod.rotation.x = Math.PI / 2; wireG.add(wireRod);
    const posts = [new THREE.Group(), new THREE.Group()];
    posts.forEach(function (p, i) {
      const z = (i ? 1 : -1) * (WL / 2 - 1.2);
      const col = mesh(new THREE.CylinderGeometry(0.35, 0.45, 1, 16), postMat);
      const base = mesh(new THREE.BoxGeometry(2.4, 0.5, 2.4), postMat);
      const clamp = mesh(new THREE.BoxGeometry(0.9, 0.7, 0.9), postMat);
      p.add(col, base, clamp);
      p.userData = { col: col, base: base, clamp: clamp };
      p.position.z = z;
      wireG.add(p);
    });
    // 導線在下方時：羅盤放在壓克力板上，四角以支柱撐起
    const shelf = new THREE.Group(); oerG.add(shelf);
    const shelfTop = new THREE.Mesh(new THREE.BoxGeometry(46, 0.15, 46), acrylMat); shelfTop.renderOrder = 5;
    shelf.add(shelfTop);
    const shelfLegs = [];
    [[-22, -22], [22, -22], [-22, 22], [22, 22]].forEach(function (q) {
      const l = mesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 14), postMat);
      l.position.set(q[0], 0, q[1]); shelf.add(l); shelfLegs.push(l);
    });
    // 電流的方向：沿導線移動的亮點＋兩個錐形箭頭
    const flowDots = [];
    for (let i = 0; i < 14; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), flowMat); m.visible = false; wireG.add(m); flowDots.push(m); }
    const iCones = [0, 1].map(function () { const c = mesh(new THREE.ConeGeometry(0.45, 1.2, 18), iConeMat); wireG.add(c); return c; });
    // 導線周圍的磁力線（同心圓，在垂直於導線的平面上；疏密 ∝ 1/r）
    const ringG = new THREE.Group(); wireG.add(ringG);
    const ringsP = new THREE.Group(), ringsN = new THREE.Group(); ringG.add(ringsP, ringsN);
    let ringKey = '';
    function buildRings(I) {
      clearGroup(ringsP); clearGroup(ringsN);
      const radii = C.wireRadii(I, 2e-7, 0.006, 0.075);
      const zs = [-13, -7.5, 7.5, 13];
      radii.forEach(function (r0) {
        const r = r0 * 100;
        zs.forEach(function (z) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.035, 5, Math.max(32, Math.round(r * 18))), fieldMat);
          ring.position.z = z; ring.renderOrder = 3;
          ringsP.add(ring);
          const ring2 = ring.clone(); ringsN.add(ring2);
          // 箭頭（每圈 2 個）：區域座標中電流沿 −Z（s = +1）時，B ∝ (−Z) × r̂ = (sin a, −cos a)，與 t 相反
          for (let k = 0; k < 2; k++) {
            const a = k * Math.PI + (z / 6) * 0.9;
            const pos = V(r * Math.cos(a), r * Math.sin(a), z);
            const t = V(-Math.sin(a), Math.cos(a), 0);
            [[ringsP, -1], [ringsN, 1]].forEach(function (cg) {
              const c = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 10), fConeMat);
              c.position.copy(pos); c.quaternion.setFromUnitVectors(Yup, t.clone().multiplyScalar(cg[1])); c.renderOrder = 3;
              cg[0].add(c);
            });
          }
        });
      });
    }
    // 通過磁針的那一圈（較亮）
    const hiRing = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 6, 120), fieldMatHi);
    hiRing.renderOrder = 4; wireG.add(hiRing);
    let hiR = 1;
    // 磁針處的向量：B地、B導線、合磁場（水平）
    const arrBH = makeArrow(0x0d7f57, 0.11), arrBI = makeArrow(0xd1453b, 0.11), arrB = makeArrow(0x2f6fd0, 0.13), arrBIh = makeArrow(0xd1453b, 0.06);
    const Lo = {
      BH: label(['B', ['H']], '#5fe0a8', [0.5, -0.2]),
      BI: label(['B', ['I']], '#ff8a7f', [0.5, -0.2]),
      B: label(['B'], '#8fb7ff', [0.5, -0.2]),
      wire: label([T('導線', 'Wire')], '#f0c79d', [0.5, 0]),
      th: label(['θ = 0.0°'], '#ffd479', [0.5, 0])
    };

    // =====================================================================
    // 三種形狀
    // =====================================================================
    const expG = new THREE.Group(); scene.add(expG);
    const condG = new THREE.Group(); expG.add(condG);
    const linesG = new THREE.Group(); expG.add(linesG);
    const needlesG = new THREE.Group(); expG.add(needlesG);
    let filings = null;
    // 觀察用的板子（白色紙板／壓克力），在 Y = 0 的水平面
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), plateMat);
    plate.rotation.x = -Math.PI / 2; plate.position.y = -0.03; plate.renderOrder = 1; plate.receiveShadow = true;
    expG.add(plate);
    const plateEdge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1)), own(new THREE.LineBasicMaterial({ color: 0x9fb0b6, transparent: true, opacity: 0.6 })));
    plateEdge.rotation.x = -Math.PI / 2; plateEdge.position.y = -0.02; expG.add(plateEdge);
    const probe = mesh(new THREE.SphereGeometry(0.42, 24, 16), probeMat); expG.add(probe);
    const arrP = makeArrow(0x2f6fd0, 0.1);
    const Le = {
      I: label(['I'], '#f1d58f', [0.5, 0]),
      P: label(['|B|'], '#8fb7ff', [-0.1, 0.5])
    };
    const RANGE = { wire: { x: 8, y: 8 }, coil: { x: 15, y: 10 }, solenoid: { x: 20, y: 10 } };
    // 2D (x, y) cm → 場景
    const P3 = function (x, y, h) { return V(x, h || 0, -y); };

    let condKey = '', lineKey = '', needleKey = '', filKey = '', pendingT = 0, pending = false;
    function shapeKey(s) { const P = s.P; return [s.mode, P.N, P.R, P.L].join('|'); }
    function fieldKey(s) { const P = s.P; return [s.mode, P.I.toFixed(3), P.s, P.N, P.R, P.L].join('|'); }

    function buildConductor(s) {
      clearGroup(condG);
      const P = s.P;
      if (s.mode === 'wire') {
        const rod = mesh(new THREE.CylinderGeometry(0.3, 0.3, 26, 24), copperMat);
        condG.add(rod);
        return;
      }
      if (s.mode === 'coil') {
        const R = P.R * 100, tr = Math.min(0.9, 0.16 + 0.05 * Math.sqrt(P.N));
        const tor = mesh(new THREE.TorusGeometry(R, tr, 18, 120), copperMat);
        tor.rotation.y = Math.PI / 2; // 線圈在 YZ 平面，軸沿 X
        condG.add(tor);
        // 引線
        const lead = function (z) { const m = mesh(new THREE.CylinderGeometry(0.12, 0.12, 8, 10), copperMat); m.position.set(0, -R - 4, z); return m; };
        condG.add(lead(0.35), lead(-0.35));
        return;
      }
      const R = P.R * 100, L = P.L * 100;
      const turns = Math.min(P.N, 90), pitch = L / turns, tr = Math.max(0.05, Math.min(0.16, pitch * 0.32));
      const pts = [];
      const n = turns * 40;
      for (let i = 0; i <= n; i++) {
        const t = i / n * turns * 2 * Math.PI, x = -L / 2 + L * i / n;
        pts.push(V(x, R * Math.sin(t), -R * Math.cos(t)));
      }
      const helix = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), Math.min(6000, n), tr, 6, false), copperMat);
      condG.add(helix);
      // 線圈骨架（半透明的管子）
      const core = new THREE.Mesh(new THREE.CylinderGeometry(R - tr - 0.05, R - tr - 0.05, L + 1, 48, 1, true), acrylMat);
      core.rotation.z = Math.PI / 2; core.renderOrder = 2;
      condG.add(core);
    }
    // 導體上的電流方向（錐形箭頭）
    const curCones = [];
    for (let i = 0; i < 6; i++) { const c = mesh(new THREE.ConeGeometry(0.42, 1.1, 18), iConeMat); c.visible = false; expG.add(c); curCones.push(c); }
    function placeCurrentCones(s) {
      const P = s.P, on = P.I > 0, sg = s.s < 0 ? -1 : 1;
      curCones.forEach(function (c) { c.visible = false; });
      if (!on) return;
      if (s.mode === 'wire') {
        [-9, 9].forEach(function (y, i) { const c = curCones[i]; c.visible = true; c.position.set(0, y, 0); c.scale.set(1.2, 1.2, 1.2); c.quaternion.setFromUnitVectors(Yup, V(0, sg, 0)); });
        return;
      }
      const R = P.R * 100, off = s.mode === 'coil' ? Math.min(0.9, 0.16 + 0.05 * Math.sqrt(P.N)) + 0.55 : 0.6;
      const xs = s.mode === 'coil' ? [0, 0, 0, 0] : [-P.L * 25, P.L * 25, -P.L * 25, P.L * 25];
      [0.5, 1.5, 1.0, 0.0].forEach(function (k, i) {
        const t = k * Math.PI + Math.PI / 2 * (i > 1 ? 1 : 0) + 0.6;
        const c = curCones[i]; c.visible = true; c.scale.set(1, 1, 1);
        const rr = R + off;
        c.position.set(xs[i], rr * Math.sin(t), -rr * Math.cos(t));
        c.quaternion.setFromUnitVectors(Yup, V(0, Math.cos(t), Math.sin(t)).multiplyScalar(sg));
      });
    }
    // 立體磁力線
    function tubeAlong(pts, r, group, mat) {
      if (pts.length < 4) return;
      const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), Math.min(400, pts.length * 2), r, 5, false);
      const m = new THREE.Mesh(g, mat); m.renderOrder = 3; group.add(m);
      // 箭頭每 6 cm 一個
      let acc = 0, next = 2.5 + (pts.length % 5) * 0.7;
      for (let i = 1; i < pts.length - 1; i++) {
        acc += pts[i].distanceTo(pts[i - 1]);
        if (acc >= next) {
          next += 6;
          const c = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.55, 10), fConeMat);
          c.position.copy(pts[i]);
          c.quaternion.setFromUnitVectors(Yup, pts[i + 1].clone().sub(pts[i - 1]).normalize());
          c.renderOrder = 3; group.add(c);
        }
      }
    }
    function buildLines(s) {
      clearGroup(linesG);
      const P = s.P;
      if (!(P.I > 0)) return;
      const sg = s.s < 0 ? -1 : 1;
      if (s.mode === 'wire') {
        const radii = C.wireRadii(P.I, 2e-7, 0.006, 0.08);
        [-7, -3.5, 3.5, 7].forEach(function (y) {
          radii.forEach(function (r0, i) {
            const r = r0 * 100, n = Math.max(40, Math.round(r * 16)), pts = [];
            const a0 = (i * 0.9 + y) % (2 * Math.PI);
            for (let k = 0; k <= n; k++) { // s = +1：從上往下看逆時針（右手定則，電流向上）
              const a = a0 + sg * k / n * 2 * Math.PI;
              pts.push(V(r * Math.cos(a), y, -r * Math.sin(a)));
            }
            tubeAlong(pts, 0.04, linesG, fieldMat);
          });
        });
        return;
      }
      const R = RANGE[s.mode];
      const field = function (x, y) { return C.planeField(P, x, y); };
      let avoid, rhoMax;
      if (s.mode === 'coil') {
        const rc = Math.min(0.009, 0.0016 + 0.0005 * Math.sqrt(P.N)) + 0.0006;
        avoid = function (x, y) { return Math.min(Math.hypot(x, y - P.R), Math.hypot(x, y + P.R)) - rc; };
        rhoMax = P.R - rc - 0.0006;
      } else {
        const e = 0.0006;
        avoid = function (x, y) {
          let m = Infinity;
          [[P.L / 2, P.R], [-P.L / 2, P.R], [P.L / 2, -P.R], [-P.L / 2, -P.R]].forEach(function (q) { m = Math.min(m, Math.hypot(x - q[0], y - q[1])); });
          return m - e;
        };
        rhoMax = P.R - 0.0012;
      }
      const per = 7e-7; // 每條線帶的通量（Wb）：預設線圈或螺線管、I = 5 A 時約 35–45 條，條數 ∝ 電流
      const seeds = C.diskSeeds3D(P, per, rhoMax, 46).seeds;
      const box = [-(R.x + 4) / 100, -(R.y + 4) / 100, (R.x + 4) / 100, (R.y + 4) / 100];
      seeds.forEach(function (sd) {
        const opt = { ds: 0.0022, box: box, avoid: avoid, maxLen: 3 };
        const fw = C.traceLine(field, 0, sd.rho, Object.assign({ dir: 1 }, opt));
        let pts = fw.pts;
        if (!fw.closed) {
          const bw = C.traceLine(field, 0, sd.rho, Object.assign({ dir: -1 }, opt));
          pts = bw.pts.slice(1).reverse().concat(fw.pts);
        }
        const c = Math.cos(sd.phi), sn = Math.sin(sd.phi);
        // 剖面 (x, ρ) → 物理 (x, ρ cos φ, ρ sin φ) → 場景 (x, ρ sin φ, −ρ cos φ)
        const v3 = pts.map(function (p) { return V(p[0] * 100, p[1] * 100 * sn, -p[1] * 100 * c); });
        tubeAlong(v3, 0.045, linesG, fieldMat);
      });
    }
    // 小磁針陣列（板子上）
    const nGeoN = own(new THREE.ConeGeometry(0.22, 1.0, 4)); nGeoN.translate(0, 0.5, 0);
    const nGeoS = own(new THREE.ConeGeometry(0.22, 1.0, 4)); nGeoS.rotateZ(Math.PI); nGeoS.translate(0, -0.5, 0);
    function buildNeedles(s) {
      clearGroup(needlesG);
      const P = s.P;
      if (!(P.I > 0)) return;
      const R = RANGE[s.mode], step = s.mode === 'wire' ? 1.6 : 2.0;
      for (let y = -R.y + step / 2; y < R.y; y += step) {
        for (let x = -R.x + step / 2; x < R.x; x += step) {
          if (s.mode === 'wire' && Math.hypot(x, y) < 1.0) continue;
          if (s.mode === 'coil' && Math.hypot(x, Math.abs(y) - P.R * 100) < 1.0) continue;
          if (s.mode === 'solenoid' && Math.abs(Math.abs(y) - P.R * 100) < 0.6 && Math.abs(x) < P.L * 50 + 0.6) continue;
          const b = C.planeField(P, x / 100, y / 100), B = Math.hypot(b.bx, b.by);
          if (!(B > 0) || !isFinite(B)) continue;
          const g = new THREE.Group();
          g.add(new THREE.Mesh(nGeoN, needleNMat), new THREE.Mesh(nGeoS, needleSMat));
          g.position.set(x, 0.35, -y);
          g.quaternion.setFromUnitVectors(Yup, V(b.bx, 0, -b.by).normalize());
          g.scale.setScalar(s.mode === 'wire' ? 0.62 : 0.75);
          needlesG.add(g);
        }
      }
    }
    // 鐵粉：板子上隨機撒，每粒沿當地磁場排成短短一段（弧長 RK2 兩步）；磁場強的地方較密
    function buildFilings(s) {
      if (filings) { expG.remove(filings); filings.geometry.dispose(); filings = null; }
      const P = s.P;
      if (!(P.I > 0)) return;
      const R = RANGE[s.mode], ref = s.mode === 'wire' ? 100e-6 : s.mode === 'coil' ? 3e-3 : 8e-3;
      let seed = 12345;
      const rnd = function () { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
      const pos = [];
      const unit = function (x, y) { const b = C.planeField(P, x / 100, y / 100), m = Math.hypot(b.bx, b.by); return m > 0 && isFinite(m) ? [b.bx / m, b.by / m, m] : null; };
      let tries = 0;
      while (pos.length < 7000 * 12 && tries < 60000) {
        tries++;
        const x = (rnd() * 2 - 1) * R.x, y = (rnd() * 2 - 1) * R.y;
        if (s.mode === 'wire' && Math.hypot(x, y) < 0.5) continue;
        if (s.mode === 'coil' && Math.hypot(x, Math.abs(y) - P.R * 100) < 0.6) continue;
        const u0 = unit(x, y); if (!u0) continue;
        const w = Math.pow(Math.max(0.1, Math.min(1, 1 + Math.log10(u0[2] / ref) / 3)), 1.6);
        if (rnd() > w) continue;
        const h = 0.16 + 0.14 * rnd();
        const um = unit(x + u0[0] * h * 0.5, y + u0[1] * h * 0.5) || u0;
        const x1 = x + um[0] * h, y1 = y + um[1] * h;
        const u1 = unit(x1, y1) || um;
        const ux = unit(x1 + u1[0] * h * 0.5, y1 + u1[1] * h * 0.5) || u1;
        const x2 = x1 + ux[0] * h, y2 = y1 + ux[1] * h;
        const yy = 0.04;
        pos.push(x - um[0] * 0.2, yy, -(y - um[1] * 0.2), x1, yy, -y1, x1, yy, -y1, x2, yy, -y2);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      filings = new THREE.LineSegments(g, filMat);
      filings.renderOrder = 2;
      expG.add(filings);
    }

    // ---- 顏色（深淺色切換時更新） ----
    function applyColors() {
      tok = env.tokens();
      const c = function (k, d) { return new THREE.Color(tok[k] || d); };
      copperMat.color.copy(c('copper', '#b8743d'));
      brassMat.color.copy(c('brass', '#b7924a'));
      woodMat.color.set(0xffffff);
      postMat.color.copy(c('table', '#e3dccf')).multiplyScalar(tok.dark ? 1.25 : 0.62);
      needleNMat.color.copy(c('needle-n', '#c8372d'));
      needleSMat.color.copy(c('needle-s', '#d9dee0'));
      fieldMat.color.copy(c('neg', '#2f6fd0')); fieldMatHi.color.copy(c('neg', '#2f6fd0')).lerp(new THREE.Color(0xffffff), 0.25);
      fConeMat.color.copy(c('neg', '#2f6fd0'));
      flowMat.color.copy(c('equi', '#e7b75a')).lerp(new THREE.Color(0xffffff), 0.35);
      iConeMat.color.copy(c('equi', '#8a5a00')); iConeMat.emissive.copy(c('equi', '#8a5a00')).multiplyScalar(0.25);
      probeMat.color.copy(c('accent', '#2f6fd0')); probeMat.emissive.copy(c('accent', '#2f6fd0')).multiplyScalar(0.3);
      filMat.color.set(tok.dark ? 0xc9d2d6 : 0x2c3236);
      plateMat.color.set(tok.dark ? 0x3a4347 : 0xfaf8f2); plateMat.opacity = tok.dark ? 0.7 : 0.85;
      [[arrBH, 'earth', '#0d7f57'], [arrBI, 'neg', '#d1453b'], [arrBIh, 'neg', '#d1453b'], [arrB, 'field', '#2f6fd0'], [arrP, 'neg', '#2f6fd0']].forEach(function (p) {
        p[0].userData.mat.color.copy(c(p[1], p[2])); p[0].userData.mat.emissive.copy(c(p[1], p[2]));
      });
      hemi.intensity = tok.dark ? 0.6 : 0.8;
      drawWood();
      dialKey = '';
    }

    // ---- 相機 ----
    function keyPoints(s) {
      if (!s || s.mode === 'oersted') return [[-7, -1, -10], [7, -1, -10], [-7, -1, 10], [7, -1, 10], [0, 5, 0], [-5, 4, 7], [5, 4, -7]];
      const R = RANGE[s.mode];
      const top = s.mode === 'wire' ? 11 : Math.max(4, s.P ? s.P.R * 100 + 1.5 : 6);
      return [[-R.x, 0, -R.y], [R.x, 0, -R.y], [-R.x, 0, R.y], [R.x, 0, R.y], [0, top, 0], [0, -top, 0]];
    }
    function viewDirFor(s) {
      if (!s || s.mode === 'oersted') return camera.aspect < 1.1 ? V(0.45, 1.6, 1) : V(0.55, 1.15, 1);
      return camera.aspect < 1.1 ? V(0.35, 1.3, 1) : V(0.4, 0.75, 1);
    }
    function fit(force) {
      const s = cur;
      const KEY = keyPoints(s).map(function (p) { return V(p[0], p[1], p[2]); });
      const tv = Math.tan(camera.fov * Math.PI / 360), th = tv * camera.aspect;
      const dir = force ? viewDirFor(s).normalize() : camera.position.clone().sub(controls.target).normalize();
      if (force) controls.target.set(0, 0, 0);
      const right = new THREE.Vector3().crossVectors(Yup, dir).normalize();
      const up = new THREE.Vector3().crossVectors(dir, right);
      function need() {
        let d = 8;
        KEY.forEach(function (p) {
          const q = p.clone().sub(controls.target);
          d = Math.max(d, q.dot(dir) + Math.abs(q.dot(right)) / th, q.dot(dir) + Math.abs(q.dot(up)) / tv);
        });
        return d;
      }
      let dist = need();
      for (let it = 0; force && it < 3; it++) {
        let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
        KEY.forEach(function (p) {
          const q = p.clone().sub(controls.target), z = dist - q.dot(dir);
          const x = q.dot(right) / (z * th), y = q.dot(up) / (z * tv);
          x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        });
        controls.target.addScaledVector(right, (x0 + x1) / 2 * dist * th * 0.8).addScaledVector(up, (y0 + y1) / 2 * dist * tv * 0.8);
        dist = need();
      }
      dist *= 1.06;
      camera.position.copy(controls.target).addScaledVector(dir, dist);
      camera.near = Math.max(0.3, dist / 200); camera.far = dist * 20;
      camera.updateProjectionMatrix();
      controls.update();
    }

    // ---- 繪製 ----
    let raf = 0;
    function renderNow() {
      if (!api.active || document.hidden) return;
      const want = Math.min(window.devicePixelRatio || 1, 2);
      if (renderer.getPixelRatio() !== want) { renderer.setPixelRatio(want); resize3(); return; }
      const moved = controls.update();
      declutter();
      renderer.render(scene, camera);
      if (moved) requestRender();
    }
    // 磁針上方三個向量標示（B地、B導線、B）在畫面上互相推開，任何視角都不會疊在一起
    const DC_BASE = [0.5, -0.2], dcP = new THREE.Vector3();
    function declutter() {
      const list = [Lo.BH, Lo.BI, Lo.B, Lo.th].filter(function (l) { return l.visible && l.parent && l.parent.visible !== false; });
      const W = canvas.clientWidth, H = canvas.clientHeight;
      if (list.length < 2 || !W || !H) return;
      const p11 = camera.projectionMatrix.elements[5];
      const bx = list.map(function (l) {
        const isTh = l === Lo.th;
        dcP.copy(l.position).project(camera);
        const w = l.scale.x * p11 * H / 2, h = l.scale.y * p11 * H / 2;
        const ax = (dcP.x + 1) / 2 * W, ay = (1 - dcP.y) / 2 * H;
        const c0 = isTh ? [0.5, 0] : DC_BASE;
        return { l: l, fixed: isTh, w: w, h: h, ax: ax, ay: ay, c0: c0, x: ax - (c0[0] - 0.5) * w, y: ay + (c0[1] - 0.5) * h };
      });
      for (let it = 0; it < 12; it++) {
        let any = false;
        for (let i = 0; i < bx.length; i++) for (let j = i + 1; j < bx.length; j++) {
          const A = bx[i], B = bx[j];
          const ox = (A.w + B.w) / 2 + 3 - Math.abs(A.x - B.x), oy = (A.h + B.h) / 2 + 2 - Math.abs(A.y - B.y);
          if (ox <= 0 || oy <= 0) continue;
          any = true;
          const fa = A.fixed ? 0 : B.fixed ? 1 : 0.5, fb = 1 - fa;
          if (ox < oy) { const sx = A.x < B.x || (A.x === B.x && i < j) ? -1 : 1; A.x += sx * ox * fa; B.x -= sx * ox * fb; }
          else { const sy = A.y < B.y || (A.y === B.y && i < j) ? -1 : 1; A.y += sy * oy * fa; B.y -= sy * oy * fb; }
        }
        if (!any) break;
      }
      bx.forEach(function (b) {
        if (b.fixed) return;
        b.l.center.set(0.5 - (b.x - b.ax) / b.w, 0.5 + (b.y - b.ay) / b.h);
      });
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
      if (Math.abs(camera.aspect - lastAspect) > 0.01) { lastAspect = camera.aspect; fit(true); }
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

    // ---- 依狀態更新 ----
    function fmtB(Bt) {
      const u = Math.abs(Bt) * 1e6;
      if (!isFinite(u)) return '—';
      return u >= 1000 ? (u / 1000).toPrecision(3) + ' mT' : u.toPrecision(3) + ' μT';
    }
    function updateOersted(s) {
      const h = s.h * 100, d = s.d * 100, a = s.alpha * DEG, zw = s.above ? h : -h;
      const showL = s.show.labels !== false;
      // 桌面、支架
      const tableY = s.above ? CASE_B : -(h + 0.5);
      table.position.y = tableY - 0.001;
      shelf.visible = !s.above;
      if (!s.above) {
        shelfTop.position.y = CASE_B - 0.075;
        const lh = CASE_B - 0.15 - tableY;
        shelfLegs.forEach(function (l) { l.scale.y = lh; l.position.y = tableY + lh / 2; });
      }
      // 導線：沿 u = (sin α, 0, −cos α)，位置 −d v（v = (cos α, 0, sin α)），高度 zw
      wireG.position.set(-d * Math.cos(a), zw, -d * Math.sin(a));
      wireG.rotation.set(0, -a, 0); // 區域 −Z → 場景 u
      posts.forEach(function (p) {
        const ph = zw - tableY; // 支架高度
        p.userData.col.scale.y = Math.max(0.05, ph - 0.25); p.userData.col.position.y = -ph / 2 + 0.12;
        p.userData.base.position.y = -ph + 0.25;
        p.userData.clamp.position.y = 0;
      });
      // 電流方向（區域座標：s = +1 沿 −Z）
      const on = s.I > 0, sg = s.s < 0 ? -1 : 1;
      const sp = 3, ph = ((s.flowT || 0) * (2 + s.I * 2.2)) % sp;
      let k = 0;
      if (on) {
        for (let z = -WL / 2 + 2 + ph; z < WL / 2 - 2 && k < flowDots.length; z += sp, k++) { flowDots[k].visible = true; flowDots[k].position.set(0, 0, -sg * z); }
      }
      for (; k < flowDots.length; k++) flowDots[k].visible = false;
      iCones.forEach(function (c, i) {
        c.visible = on;
        c.position.set(0, 0, (i ? 1 : -1) * 10.2);
        c.quaternion.setFromUnitVectors(Yup, V(0, 0, -sg));
      });
      // 磁力線圈
      const rk = on ? s.I.toFixed(2) : '0';
      if (rk !== ringKey) {
        const now = performance.now();
        if (!pending || now - pendingT > 150) { pendingT = now; ringKey = rk; buildRings(s.I); }
        schedule();
      }
      ringG.visible = on && s.show3.lines;
      ringsP.visible = sg > 0; ringsN.visible = sg < 0;
      // 通過磁針的圈：在區域座標 z = 磁針沿導線的位置
      const rr = Math.hypot(h, d);
      hiRing.visible = on && s.show3.lines;
      if (Math.abs(rr - hiR) > 1e-3) { hiR = rr; hiRing.geometry.dispose(); hiRing.geometry = new THREE.TorusGeometry(rr, 0.06, 6, Math.max(60, Math.round(rr * 30))); }
      // 磁針
      needle.rotation.set(0, -s.phi, 0);
      drawDial(s.zero || 0);
      // 向量：比例 BH ↔ 3.4 cm
      const f = s.field, K = 3.4 / (s.BH || 36e-6), o = V(0, 0.9, 0);
      const show = s.show.vec !== false;
      const BE = f.BE, BH3 = V(0, 0, -1);
      setArrow(arrBH, o, BH3, show && BE > 0 ? BE * K : 0);
      // B導線（含鉛直分量），物理 (BIx, BIy, BIz) → 場景 (BIx, BIz, −BIy)
      const bi = V(f.BIx, f.BIz, -f.BIy);
      const tipE = o.clone().addScaledVector(BH3, BE > 0 ? BE * K : 0);
      setArrow(arrBI, tipE, bi.lengthSq() > 0 ? bi : V(1, 0, 0), show && on ? bi.length() * K : 0);
      const bih = V(f.BIx, 0, -f.BIy);
      setArrow(arrBIh, tipE, bih.lengthSq() > 0 ? bih : V(1, 0, 0), show && on && Math.abs(f.BIz) > 0.02 * f.BI ? bih.length() * K : 0);
      const bt = V(f.Bx, 0, -f.By);
      setArrow(arrB, o, bt.lengthSq() > 0 ? bt : V(0, 0, -1), show && f.Bh > 0 ? f.Bh * K : 0);
      // 標示
      Lo.BH.visible = showL && arrBH.visible; Lo.BH.position.copy(o).addScaledVector(BH3, BE * K + 0.5);
      // B導線的標示放在箭頭中點、向三角形外側推開，才不會和合磁場 B 的標示疊在一起
      Lo.BI.visible = showL && arrBI.visible;
      if (Lo.BI.visible) {
        const mid = tipE.clone().addScaledVector(bi, K / 2);
        const tipB = o.clone().addScaledVector(bt, K);
        const cen = o.clone().add(tipE).add(tipB).multiplyScalar(1 / 3);
        const nrm = bih.lengthSq() > 1e-30 ? V(-bih.z, 0, bih.x).normalize() : V(1, 0, 0);
        if (nrm.dot(mid.clone().sub(cen)) < 0) nrm.negate();
        Lo.BI.position.copy(mid).addScaledVector(nrm, 0.8);
      }
      Lo.B.visible = showL && arrB.visible && f.Bh * K > 0.8; Lo.B.position.copy(o).addScaledVector(bt.clone().normalize(), f.Bh * K + 0.6);
      Lo.wire.visible = showL;
      Lo.wire.position.copy(wireG.position).add(V(-Math.sin(a) * 8, 0.9, Math.cos(a) * 8));
      const rd = s.reading || 0;
      relabel(Lo.th, ['θ = ' + Math.abs(rd).toFixed(1) + '° ' + (Math.abs(rd) < 0.05 ? '' : rd > 0 ? T('偏東', 'E') : T('偏西', 'W'))]);
      Lo.th.visible = showL; Lo.th.position.set(CASE_R * 0.75 + 1.2, CASE_T + 0.2, CASE_R * 0.75 + 1.2);
    }
    function updateExplorer(s) {
      const P = s.P, R = RANGE[s.mode];
      plate.scale.set(2 * R.x, 2 * R.y, 1); plateEdge.scale.set(2 * R.x, 2 * R.y, 1);
      const sk = shapeKey(s), fk = fieldKey(s);
      if (sk !== condKey) { condKey = sk; buildConductor(s); }
      const now = performance.now();
      const stale = (s.show3.lines && fk !== lineKey) || (s.show3.needles && fk !== needleKey) || (s.show3.filings && fk !== filKey);
      if (stale) {
        if (!pending || now - pendingT > 150) {
          pendingT = now;
          if (s.show3.lines && fk !== lineKey) { lineKey = fk; buildLines(s); }
          if (s.show3.needles && fk !== needleKey) { needleKey = fk; buildNeedles(s); }
          if (s.show3.filings && fk !== filKey) { filKey = fk; buildFilings(s); }
        }
        schedule();
      }
      linesG.visible = !!s.show3.lines;
      needlesG.visible = !!s.show3.needles;
      if (filings) filings.visible = !!s.show3.filings;
      placeCurrentCones(s);
      // 探測點
      const pr = s.probe || { x: 0, y: 0 };
      const pp = P3(pr.x, pr.y, 0.2);
      probe.position.copy(pp);
      const b = C.planeField(P, pr.x / 100, pr.y / 100), B = Math.hypot(b.bx, b.by);
      const ok = B > 0 && isFinite(B);
      setArrow(arrP, pp, ok ? V(b.bx, 0, -b.by) : V(1, 0, 0), ok && s.show.vec !== false ? 2.6 : 0);
      const showL = s.show.labels !== false;
      relabel(Le.P, ['|B| = ' + (ok ? fmtB(B) : '—')]);
      Le.P.visible = showL; Le.P.position.copy(pp).add(V(0.8, 1.2, 0));
      Le.I.visible = showL && P.I > 0;
      if (s.mode === 'wire') Le.I.position.set(0.6, 11, 0);
      else Le.I.position.set(s.mode === 'coil' ? 0 : -P.L * 50, P.R * 100 + 2.2, 0);
    }
    let timer = 0;
    function schedule() {
      pending = true;
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () { timer = 0; pending = false; if (api.active) update(); }, 170);
    }
    let lastMode = '';
    function update() {
      const s = env.state();
      cur = s;
      const oer = s.mode === 'oersted';
      oerG.visible = oer; wireG.visible = oer;
      [arrBH, arrBI, arrBIh, arrB].forEach(function (a) { if (!oer) a.visible = false; });
      Object.keys(Lo).forEach(function (k) { if (!oer) Lo[k].visible = false; });
      expG.visible = !oer; arrP.visible = arrP.visible && !oer;
      Object.keys(Le).forEach(function (k) { if (oer) Le[k].visible = false; });
      if (s.mode !== lastMode) {
        lastMode = s.mode;
        condKey = lineKey = needleKey = filKey = ''; pending = false;
        if (oer) ringKey = '';
        fit(true);
      }
      if (oer) updateOersted(s); else updateExplorer(s);
      requestRender();
    }

    const api = {
      active: true,
      update: update,
      rebuild: function () { lastMode = ''; update(); },
      onTheme: function () { applyColors(); update(); },
      resetCamera: function () { fit(true); requestRender(); },
      dispose: function () {
        api.active = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (timer) clearTimeout(timer);
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

    applyColors();
    const w0 = canvas.clientWidth, h0 = canvas.clientHeight;
    if (w0 && h0) { renderer.setSize(w0, h0, false); camera.aspect = w0 / h0; camera.updateProjectionMatrix(); lastAspect = camera.aspect; }
    cur = env.state();
    fit(true);
    return api;
  }

  window.CurrentMagneticField3D = { create: create };
})();
