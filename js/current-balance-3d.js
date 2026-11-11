/* current-balance-3d.js — 「電流天平」的 3D 立體檢視（three.js 由 current-balance.js 以 import() 延遲載入後傳進來）
 *
 * 用法：const v = CurrentBalance3D.create({ THREE, OrbitControls }, env)
 *   env.host     放畫布的元素
 *   env.core     CurrentBalanceCore（尺寸與磁場用同一套物理計算）
 *   env.T        T('中文', 'English')
 *   env.state()  目前狀態：{ th, power, I1, I2, I1m, I2m, s1, s2, hung, len, nut, show, realSol, flowT, flowing,
 *                lines（磁力線 [[ρ, z], …]，m）, F, Fside, uSide, W, FREF, level, tip, mg }
 *   env.tokens() 顏色（--cb-* 與 drawkit 的顏色）
 *   env.lost()   WebGL 環境中斷時呼叫
 * 回傳 { active, update(), frame(), onTheme(), resetCamera(), dispose() }
 *
 * 場景座標（cm）：X 沿螺線管軸、指向支點（管口在 X = 0），Y 向上，Z 指向觀察者（＝物理核心的 −x）。
 * 螺線管與端板只做後半塊（Z ≤ 0），看得到管內的ㄈ字形電路；所有尺寸、傾角、受力與 2D 相同。
 */
(function () {
  'use strict';

  function create(lib, env) {
    const THREE = lib.THREE, C = env.core, T = env.T, APP = C.APP;
    const CM = 100;
    const ZP = APP.zP * CM, YT = -5.0;
    const LEN = APP.len * CM, RIN = APP.bore * CM, RFO = 2.65, ROUT = APP.rOut * CM;
    const PT = 0.5, PH = 4.0, PXW = 4.0;
    const BWH = APP.boardW / 2 * CM, BT = 0.15;
    const UBC = (APP.zBC - APP.zP) * CM, U0 = UBC - 0.7, U1 = APP.rodR * CM, UH = APP.d2 * CM, UTIP = APP.rTip * CM;
    const ARM = APP.L / 2 * CM, SW = 0.16;
    const POSTX = 2.45, POSTR = 0.28;
    const CARD = { z: -1.0, x0: ZP + 16.3, x1: ZP + 18.1, y0: -2.3, y1: 2.3 };
    const STOPY = (0.168 * Math.sin(APP.thetaMax) + 0.0022) * CM;
    const ALEN = 3.6; // 受力箭頭：FREF（2 mN）的長度（cm）
    let tok = env.tokens();
    let cur = null; // 最近一次 update() 讀到的狀態

    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', T('電流天平的 3D 立體檢視：剖開一半的螺線管、伸進管內的ㄈ字形電路、支架、掛勾上的漆包線、歸零螺母、水平刻度、兩台電源供應器與電子秤，以及磁力線（可拖曳旋轉、縮放）',
      '3D view of the current balance: the solenoid cut open, the U-shaped circuit inside it, the stand, the wire on the hook, the zero nut, the level scale, the two power supplies, the scale and field lines (drag to rotate, pinch or scroll to zoom)'));
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
    const target0 = new THREE.Vector3(-3, -0.5, 4.5);
    const viewDir = new THREE.Vector3(0.34, 0.6, 1).normalize(); // 由右前上方約 30° 俯看剖開的一面
    const viewDirTall = new THREE.Vector3(0.85, 0.95, 1).normalize(); // 直式畫面：斜看，螺線管的長軸不必橫跨整個寬度
    camera.position.copy(target0).addScaledVector(viewDir, 70);
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.minDistance = 8;
    controls.maxDistance = 220;
    controls.target.copy(target0);

    // ---- 環境反射（簡單的攝影棚），讓銅與金屬有真實的反光 ----
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
    const sun = new THREE.DirectionalLight(0xfff4e6, 1.7);
    sun.position.set(-18, 45, 32);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.radius = 4;
    sun.shadow.bias = -0.0006;
    const sc = sun.shadow.camera;
    sc.left = -36; sc.right = 36; sc.bottom = -30; sc.top = 30; sc.near = 10; sc.far = 140;
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
    /** 沿 X 軸的圓柱（中心在 x0..x1 之間） */
    function cylX(r, x0, x1, mat, seg) {
      const g = new THREE.CylinderGeometry(r, r, x1 - x0, seg || 24);
      g.rotateZ(-Math.PI / 2); g.translate((x0 + x1) / 2, 0, 0);
      return mesh(g, mat);
    }
    function cylY(r, y0, y1, mat, seg) {
      const g = new THREE.CylinderGeometry(r, r, y1 - y0, seg || 24);
      g.translate(0, (y0 + y1) / 2, 0);
      return mesh(g, mat);
    }
    function cylZ(r, z0, z1, mat, seg) {
      const g = new THREE.CylinderGeometry(r, r, z1 - z0, seg || 20);
      g.rotateX(Math.PI / 2); g.translate(0, 0, (z0 + z1) / 2);
      return mesh(g, mat);
    }
    const F3 = function (px, w) { return (w || '600') + ' ' + px + 'px system-ui, -apple-system, "Segoe UI", "Noto Sans TC", sans-serif'; };

    // ---- 材質（顏色在 applyColors 依深淺色更新） ----
    const windC = document.createElement('canvas'); windC.width = 8; windC.height = 32;
    (function () {
      const g = windC.getContext('2d');
      const gr = g.createLinearGradient(0, 0, 0, 32);
      gr.addColorStop(0, '#5e5e5e'); gr.addColorStop(0.25, '#ffffff'); gr.addColorStop(0.55, '#e3e3e3'); gr.addColorStop(1, '#5e5e5e');
      g.fillStyle = gr; g.fillRect(0, 0, 8, 32);
    })();
    const windTex = canvasTex(windC); windTex.wrapS = windTex.wrapT = THREE.RepeatWrapping; windTex.repeat.set(1, 250);
    const windBump = canvasTex(windC, false); windBump.wrapS = windBump.wrapT = THREE.RepeatWrapping; windBump.repeat.set(1, 250);
    const copperMat = std(0xb8743d, 0.8, 0.32, { map: windTex, bumpMap: windBump, bumpScale: 0.5, side: THREE.DoubleSide });
    const cuMat = std(0xc98a4e, 0.85, 0.28);
    const tubeMat = std(0xe7dcc6, 0, 0.8, { side: THREE.DoubleSide });
    const plateMat = std(0xa9b0b4, 0.35, 0.5);
    const boardMat = std(0x1f6b4f, 0.05, 0.55);
    const metalMat = std(0x9aa6ac, 0.85, 0.3);
    const darkMetalMat = std(0x5d676c, 0.6, 0.45);
    const brassMat = std(0xc09a4a, 0.9, 0.3);
    const wireMat = std(0x9c3b22, 0.5, 0.35);
    const panelBodyMat = std(0x262d31, 0.25, 0.55);
    const redMat = std(0xd1453b, 0.05, 0.5), blackMat = std(0x2a2f33, 0.05, 0.55);

    // ---- 桌面（接收影子，邊緣淡出） ----
    const tableC = document.createElement('canvas'); tableC.width = tableC.height = 256;
    (function () {
      const g = tableC.getContext('2d');
      const gr = g.createRadialGradient(128, 128, 40, 128, 128, 128);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.65, '#cccccc'); gr.addColorStop(1, '#000000');
      g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    })();
    const tableMat = std(0xd9d2c5, 0, 0.85, { transparent: true, alphaMap: canvasTex(tableC, false), depthWrite: false });
    const table = mesh(new THREE.PlaneGeometry(96, 64), tableMat, false, true);
    table.rotation.x = -Math.PI / 2;
    table.position.set(-3, YT - 0.01, 6);
    table.renderOrder = -1;
    scene.add(table);

    // ---- 螺線管（後半塊）：繞線、管壁內面、上下剖面 ----
    function halfCyl(r, mat) {
      const g = new THREE.CylinderGeometry(r, r, LEN, 96, 1, true, Math.PI / 2, Math.PI);
      g.rotateZ(-Math.PI / 2); g.translate(-LEN / 2, 0, 0);
      return mesh(g, mat);
    }
    scene.add(halfCyl(ROUT, copperMat));
    const innerWall = halfCyl(RIN, tubeMat);
    innerWall.castShadow = false;
    scene.add(innerWall);
    // 剖面：管壁（斜線）＋四層銅線截面
    const cutC = document.createElement('canvas'); cutC.width = 32; cutC.height = 96;
    let cutTex = null;
    function drawCut() {
      const g = cutC.getContext('2d'), H = 96, hf = Math.round(H * (RFO - RIN) / (ROUT - RIN));
      g.fillStyle = tok.tube || '#e7dcc6'; g.fillRect(0, H - hf, 32, hf);
      g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 2;
      g.beginPath(); for (let x = -32; x < 64; x += 8) { g.moveTo(x, H); g.lineTo(x + hf, H - hf); } g.stroke();
      g.fillStyle = '#5a3418'; g.fillRect(0, 0, 32, H - hf);
      const rowH = (H - hf) / 4;
      for (let k = 0; k < 4; k++) {
        // 貼圖橫向 32 px = 1 mm、縱向 16 px = 1 mm：畫橢圓，貼上去才是圓的線截面
        const cy = rowH * (k + 0.5), ry = rowH * 0.44, rx = Math.min(14, ry * 2);
        g.save(); g.translate(16, cy); g.scale(rx / ry, 1);
        const gr = g.createRadialGradient(-ry * 0.3, -ry * 0.3, 0.5, 0, 0, ry);
        gr.addColorStop(0, '#ffd9b0'); gr.addColorStop(0.5, tok.copper || '#b8743d'); gr.addColorStop(1, '#6b3a17');
        g.fillStyle = gr; g.beginPath(); g.arc(0, 0, ry, 0, Math.PI * 2); g.fill();
        g.restore();
      }
      if (cutTex) cutTex.needsUpdate = true;
    }
    drawCut();
    cutTex = canvasTex(cutC); cutTex.wrapS = THREE.RepeatWrapping; cutTex.repeat.set(250, 1);
    const cutMat = std(0xffffff, 0.3, 0.55, { map: cutTex });
    [1, -1].forEach(function (sg) {
      const g = new THREE.PlaneGeometry(LEN, ROUT - RIN);
      if (sg < 0) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i)); }
      g.translate(-LEN / 2, sg * (RIN + ROUT) / 2, 0.001);
      scene.add(mesh(g, cutMat, false, true));
    });
    // 繞線電流的方向：貼在管內壁的弧形箭頭（由下經後方繞到上方；I2 反向時箭頭反過來）
    const coneMatI = std(0xe7b75a, 0.1, 0.4, { emissive: 0x000000 });
    const arcsP = new THREE.Group(), arcsN = new THREE.Group();
    scene.add(arcsP, arcsN);
    (function () {
      const R = RIN - 0.1, A = 74 * Math.PI / 180;
      const at = function (x, al) { return new THREE.Vector3(x, R * Math.sin(al), -R * Math.cos(al)); };
      [-22, -17.5, -6].forEach(function (x) {
        const pts = [];
        for (let i = 0; i <= 40; i++) pts.push(at(x, -A + 2 * A * i / 40));
        const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.07, 8, false);
        [[arcsP, 1], [arcsN, -1]].forEach(function (g) {
          g[0].add(mesh(tube, coneMatI, false, false));
          const al = g[1] * A;
          const tan = new THREE.Vector3(0, Math.cos(al), Math.sin(al)).multiplyScalar(g[1]);
          const c = mesh(new THREE.ConeGeometry(0.22, 0.6, 16), coneMatI, false, false);
          c.position.copy(at(x, al)).addScaledVector(tan, 0.2);
          c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan);
          g[0].add(c);
        });
      });
    })();

    // ---- 端板（後半塊，挖掉管孔） ----
    function plateGeo() {
      const sh = new THREE.Shape();
      sh.moveTo(0, YT); sh.lineTo(PXW, YT); sh.lineTo(PXW, PH); sh.lineTo(0, PH); sh.lineTo(0, RIN);
      for (let i = 1; i <= 32; i++) { const t = Math.PI / 2 - Math.PI * i / 32; sh.lineTo(RIN * Math.cos(t), RIN * Math.sin(t)); }
      sh.lineTo(0, YT);
      const g = new THREE.ExtrudeGeometry(sh, { depth: PT, bevelEnabled: false });
      return g;
    }
    [[-LEN - PT], [0]].forEach(function (p) {
      const m = mesh(plateGeo(), plateMat);
      m.rotation.y = Math.PI / 2; // 形狀的 a → −Z、b → Y、厚度 → X
      m.position.set(p[0], 0, 0);
      scene.add(m);
    });
    // 螺線管的接線柱（左端板上面）
    [[-1.2, redMat], [-2.9, blackMat]].forEach(function (t) {
      const b = cylY(0.32, PH, PH + 0.4, brassMat); b.position.set(-LEN - PT / 2, 0, t[0]); scene.add(b);
      const c = cylY(0.36, PH + 0.4, PH + 0.9, t[1]); c.position.set(-LEN - PT / 2, 0, t[0]); scene.add(c);
    });

    // ---- 支架（底座＋兩根銅柱＋V 形槽座） ----
    const base = mesh(new THREE.BoxGeometry(2.9, 0.6, 6.8), darkMetalMat); // 前緣讓開管口的端板
    base.position.set(ZP + 0.55, YT + 0.3, 0); scene.add(base);
    [POSTX, -POSTX].forEach(function (z) {
      const p = cylY(POSTR, YT + 0.6, -0.26, metalMat); p.position.set(ZP, 0, z); scene.add(p);
      const v = mesh(new THREE.BoxGeometry(0.7, 0.26, 0.7), brassMat); v.position.set(ZP, -0.29, z); scene.add(v);
      const tm = cylZ(0.2, 0, 0.35, brassMat); tm.position.set(ZP, YT + 1.3, z + (z > 0 ? POSTR : -POSTR - 0.35) + 0.0); scene.add(tm);
    });

    // ---- 水平刻度板與擋塊 ----
    const cardC = document.createElement('canvas'); cardC.width = 128; cardC.height = 320;
    let cardTex = null;
    function drawCard() {
      const g = cardC.getContext('2d'), w = 128, h = 320, k = h / (CARD.y1 - CARD.y0); // px per cm
      g.fillStyle = tok.card || '#f7f4ec'; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(15,138,95,0.18)'; g.fillRect(0, h / 2 - 0.05 * k, w, 0.1 * k);
      for (let j = -22; j <= 22; j++) {
        const y = h / 2 - j * 0.1 * k, big = j % 5 === 0;
        g.strokeStyle = j === 0 ? (tok.probe || '#0f8a5f') : 'rgba(0,0,0,0.55)'; g.lineWidth = j === 0 ? 4 : big ? 2 : 1;
        g.beginPath(); g.moveTo(w * 0.36, y); g.lineTo(w * (big ? 0.82 : 0.62), y); g.stroke();
      }
      g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, w - 3, h - 3);
      if (cardTex) cardTex.needsUpdate = true;
    }
    drawCard();
    cardTex = canvasTex(cardC);
    const card = mesh(new THREE.PlaneGeometry(CARD.x1 - CARD.x0, CARD.y1 - CARD.y0), std(0xffffff, 0, 0.7, { map: cardTex }), true, true);
    card.position.set((CARD.x0 + CARD.x1) / 2, (CARD.y0 + CARD.y1) / 2, CARD.z);
    scene.add(card);
    const cardPost = cylY(0.16, YT + 0.4, CARD.y0, metalMat); cardPost.position.set((CARD.x0 + CARD.x1) / 2, 0, CARD.z - 0.2); scene.add(cardPost);
    const cardBase = mesh(new THREE.BoxGeometry(2.4, 0.4, 1.6), darkMetalMat); cardBase.position.set((CARD.x0 + CARD.x1) / 2, YT + 0.2, CARD.z - 0.2); scene.add(cardBase);
    [STOPY, -STOPY].forEach(function (y) {
      const s = cylZ(0.1, CARD.z, 0.4, darkMetalMat); s.position.set(ZP + 16.8, y, 0); scene.add(s);
    });

    // ---- 天平（繞支點轉動的群組）：絕緣板、ㄈ字形銅條、轉軸銷、螺桿、歸零螺母 ----
    const beamG = new THREE.Group();
    beamG.position.set(ZP, 0, 0);
    scene.add(beamG);
    const board = mesh(new THREE.BoxGeometry(U1 - U0, 2 * BT, 2 * BWH), boardMat);
    board.position.set((U0 + U1) / 2, 0, 0);
    beamG.add(board);
    const armLen = -UBC + SW + 0.3;
    [ARM, -ARM].forEach(function (z) {
      const a = mesh(new THREE.BoxGeometry(armLen, 0.04, 2 * SW), cuMat, false, true);
      a.position.set(UBC - SW + armLen / 2, BT + 0.02, z);
      beamG.add(a);
    });
    const bcBar = mesh(new THREE.BoxGeometry(2 * SW, 0.04, 2 * (ARM + SW)), cuMat, false, true);
    bcBar.position.set(UBC, BT + 0.02, 0);
    beamG.add(bcBar);
    beamG.add(cylZ(0.13, -(POSTX + 0.2), POSTX + 0.2, brassMat)); // 轉軸銷（穿過板子，兩端架在 V 形槽上）
    const rod = cylX(0.12, U1, UTIP - 0.3, metalMat, 16);
    beamG.add(rod);
    const tipG = new THREE.ConeGeometry(0.12, 0.3, 16); tipG.rotateZ(-Math.PI / 2); tipG.translate(UTIP - 0.15, 0, 0);
    beamG.add(mesh(tipG, metalMat));
    const nutG = new THREE.CylinderGeometry(0.33, 0.33, 0.4, 6); nutG.rotateZ(-Math.PI / 2);
    const nutM = mesh(nutG, brassMat);
    beamG.add(nutM);

    // ---- 掛勾與漆包線（永遠鉛直下垂，不跟著板子轉） ----
    const hookG = new THREE.Group(); scene.add(hookG);
    const hookCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.4, 0), new THREE.Vector3(0, -0.55, 0), new THREE.Vector3(0.12, -0.68, 0), new THREE.Vector3(0.24, -0.58, 0)]);
    hookG.add(mesh(new THREE.TubeGeometry(hookCurve, 20, 0.04, 6, false), darkMetalMat));
    let wireMesh = null, wireLen = -1;
    function rebuildWire(lenCm) {
      if (wireMesh) { hookG.remove(wireMesh); wireMesh.geometry.dispose(); wireMesh = null; }
      wireLen = lenCm;
      const h = lenCm / 2, d = 0.13;
      const pts = [new THREE.Vector3(-d, -0.62 - h, 0), new THREE.Vector3(-d, -0.75, 0), new THREE.Vector3(-d * 0.6, -0.6, 0), new THREE.Vector3(0, -0.56, 0),
        new THREE.Vector3(d * 0.6, -0.6, 0), new THREE.Vector3(d, -0.75, 0), new THREE.Vector3(d, -0.62 - h * 0.96, 0)];
      wireMesh = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.04, 8, false), wireMat);
      hookG.add(wireMesh);
    }

    // ---- 受力箭頭（同一個比例：FREF → ALEN cm） ----
    function makeArrow(color) {
      const g = new THREE.Group();
      const mat = std(color, 0.1, 0.4, { emissive: new THREE.Color(color).multiplyScalar(0.25), depthTest: false, transparent: true });
      // 透明＋不測深度＋renderOrder 8：在桌面、磁力線之後才畫，永遠看得到
      const shaft = mesh(new THREE.CylinderGeometry(0.075, 0.075, 1, 12), mat, false, false);
      const head = mesh(new THREE.ConeGeometry(0.22, 0.6, 18), mat, false, false);
      shaft.renderOrder = head.renderOrder = 8;
      g.add(shaft, head); g.userData = { shaft: shaft, head: head, mat: mat };
      g.visible = false; scene.add(g);
      return g;
    }
    function setArrow(a, x, y, z, dirY, L) {
      if (!(L > 0.08)) { a.visible = false; return; }
      a.visible = true;
      const head = Math.min(0.6, L * 0.45), sh = L - head;
      a.position.set(x, y, z);
      a.userData.shaft.scale.set(1, Math.max(0.001, sh), 1);
      a.userData.shaft.position.set(0, dirY * sh / 2, 0);
      a.userData.head.scale.set(1, head / 0.6, 1);
      a.userData.head.position.set(0, dirY * (sh + head / 2), 0);
      a.userData.head.rotation.z = dirY > 0 ? 0 : Math.PI;
    }
    const arrF = makeArrow(0xd1453b), arrW = makeArrow(0x0f8a5f), arrS1 = makeArrow(0xd1453b), arrS2 = makeArrow(0xd1453b);

    // ---- 電流的小點（沿ㄈ字形電路移動，板子座標） ----
    const flowPath = [[0, 0, POSTX + 0.2], [0, BT + 0.05, ARM], [UBC, BT + 0.05, ARM], [UBC, BT + 0.05, -ARM], [0, BT + 0.05, -ARM], [0, 0, -POSTX - 0.2]];
    const flowSeg = [];
    let flowTotal = 0;
    for (let i = 1; i < flowPath.length; i++) {
      const L = Math.hypot(flowPath[i][0] - flowPath[i - 1][0], flowPath[i][1] - flowPath[i - 1][1], flowPath[i][2] - flowPath[i - 1][2]);
      flowSeg.push(L); flowTotal += L;
    }
    const flowMat = own(new THREE.MeshBasicMaterial({ color: 0xffd479, toneMapped: false }));
    const flowDots = [];
    for (let i = 0; i < Math.ceil(flowTotal / 1.2) + 1; i++) {
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), flowMat);
      d.visible = false; beamG.add(d); flowDots.push(d);
    }

    // ---- 電源供應器與電子秤（前面板貼圖畫七段顯示器） ----
    const SEG = { '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd', '6': 'afgedc', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg', '-': 'g', ' ': '' };
    function seg7(g, text, xr, yc, h, on, led) {
      const cells = [];
      for (let i = 0; i < text.length; i++) {
        if (text[i] === '.') { if (cells.length) cells[cells.length - 1].dot = true; continue; }
        cells.push({ ch: text[i], dot: false });
      }
      const w = h * 0.56, gap = h * 0.2, t = h * 0.13, sk = h * 0.1, dg = h * 0.3;
      let x = xr - cells.length * (w + gap) + gap - cells.filter(function (c) { return c.dot; }).length * dg;
      g.lineCap = 'round';
      cells.forEach(function (c) {
        const segs = SEG[c.ch] || '', top = yc - h / 2;
        const P = function (px, py) { return [x + px + sk * (1 - py / h), top + py]; };
        const D = {
          a: [[t * 0.6, 0], [w - t * 0.6, 0]], d: [[t * 0.6, h], [w - t * 0.6, h]], g: [[t * 0.6, h / 2], [w - t * 0.6, h / 2]],
          b: [[w, t * 0.6], [w, h / 2 - t * 0.5]], c: [[w, h / 2 + t * 0.5], [w, h - t * 0.6]],
          f: [[0, t * 0.6], [0, h / 2 - t * 0.5]], e: [[0, h / 2 + t * 0.5], [0, h - t * 0.6]]
        };
        'abcdefg'.split('').forEach(function (k) {
          const lit = on && segs.indexOf(k) >= 0, p = P(D[k][0][0], D[k][0][1]), q = P(D[k][1][0], D[k][1][1]);
          g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]);
          if (lit) { g.strokeStyle = 'rgba(255,80,60,0.35)'; g.lineWidth = t * 2.4; g.stroke(); g.strokeStyle = led; g.lineWidth = t; g.stroke(); }
          else { g.strokeStyle = 'rgba(255,60,50,0.08)'; g.lineWidth = t; g.stroke(); }
        });
        if (c.dot) { const d = P(w + (gap + dg) * 0.5, h); g.beginPath(); g.arc(d[0], d[1] - t * 0.3, t * 0.75, 0, Math.PI * 2); g.fillStyle = on ? led : 'rgba(255,60,50,0.08)'; g.fill(); }
        x += w + gap + (c.dot ? dg : 0);
      });
    }
    function device(w, h, d, x, z) {
      const c = document.createElement('canvas'); c.width = Math.round(w * 40); c.height = Math.round(h * 40);
      const tex = canvasTex(c);
      const front = std(0xffffff, 0.15, 0.5, { map: tex });
      const m = mesh(new THREE.BoxGeometry(w, h, d), [panelBodyMat, panelBodyMat, panelBodyMat, panelBodyMat, front, panelBodyMat]);
      m.position.set(x, YT + h / 2, z);
      scene.add(m);
      return { c: c, tex: tex, w: w, h: h, d: d, x: x, z: z, key: '' };
    }
    const dev2 = device(9, 4.6, 7, -18, 10), dev1 = device(9, 4.6, 7, -2, 11), devS = device(8, 2.2, 7, 13, 9);
    const pan = mesh(new THREE.CylinderGeometry(2.8, 2.8, 0.25, 40), metalMat);
    pan.position.set(devS.x, YT + devS.h + 0.13, devS.z - 0.6); scene.add(pan);
    function drawDevice(dv, title, sub, text, unit, on) {
      const key = [title, text, on].join('|');
      if (key === dv.key) return;
      dv.key = key;
      const g = dv.c.getContext('2d'), W = dv.c.width, H = dv.c.height, k = 40;
      const gr = g.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, '#3a4348'); gr.addColorStop(0.12, '#262d31'); gr.addColorStop(1, '#161b1e');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(0, 0, W, 3);
      const short = H < 3 * k; // 電子秤：扁的，名稱在左、顯示器在右
      const ty = short ? H / 2 + 0.22 * k : 0.95 * k;
      g.font = F3(0.62 * k); g.fillStyle = '#c3ccd0'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
      g.fillText(title, 0.5 * k, ty);
      if (sub) { const tw = g.measureText(title).width; g.font = F3(0.45 * k); g.fillText(sub, 0.5 * k + tw + 2, ty + 0.15 * k); }
      const x0 = short ? W * 0.42 : 0.5 * k, y0 = short ? 0.3 * k : 1.25 * k;
      const dw = W - x0 - 0.4 * k, dh = short ? H - 0.6 * k : Math.min(H - 1.6 * k, 2.6 * k);
      g.fillStyle = '#070909'; g.fillRect(x0, y0, dw, dh);
      g.strokeStyle = '#5b6569'; g.lineWidth = 3; g.strokeRect(x0, y0, dw, dh);
      const led = tok.led || '#ff3b30';
      g.font = F3(0.6 * k); g.fillStyle = on ? led : 'rgba(255,60,50,0.2)'; g.textAlign = 'right';
      g.fillText(unit, x0 + dw - 0.25 * k, y0 + dh - 0.3 * k);
      const uw = g.measureText(unit).width;
      seg7(g, text, x0 + dw - uw - 0.5 * k, y0 + dh / 2, dh * 0.62, on, led);
      if (on && sub) { g.beginPath(); g.arc(W - 0.6 * k, 0.6 * k, 0.16 * k, 0, Math.PI * 2); g.fillStyle = '#7dffa0'; g.fill(); }
      dv.tex.needsUpdate = true;
    }
    // 導線
    function cable(pts, mat) {
      const m = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(function (p) { return new THREE.Vector3(p[0], p[1], p[2]); })), 60, 0.12, 8, false), mat);
      scene.add(m);
    }
    cable([[-LEN - PT / 2, PH + 0.9, -1.2], [-LEN - 2, PH + 2.5, 1], [-22, 1, 4], [-19.5, YT + 2.8, dev2.z - dev2.d / 2]], redMat);
    cable([[-LEN - PT / 2, PH + 0.9, -2.9], [-LEN - 3, PH + 2.0, -1], [-20, 0, 3.5], [-16.5, YT + 2.8, dev2.z - dev2.d / 2]], blackMat);
    cable([[ZP, YT + 1.3, POSTX + 0.35], [ZP, YT + 0.4, 5], [-0.5, YT + 1.2, 7], [-0.5, YT + 2.8, dev1.z - dev1.d / 2]], blackMat);
    cable([[ZP, YT + 1.3, -POSTX - 0.35], [ZP + 3, YT + 0.4, -2.5], [4.5, YT + 0.15, 0.5], [2, YT + 0.8, 6], [-3.5, YT + 2.8, dev1.z - dev1.d / 2]], redMat);

    // ---- 磁力線（真實螺線管；在三個通過軸的平面上），箭頭依 I2 的方向 ----
    const fieldGroup = new THREE.Group(); scene.add(fieldGroup);
    const fieldMat = own(new THREE.MeshBasicMaterial({ color: 0x2f6fd0, transparent: true, opacity: 0.6, depthWrite: false }));
    const fConeMat = own(new THREE.MeshBasicMaterial({ color: 0x2f6fd0, transparent: true, opacity: 0.85, depthWrite: false }));
    const conesP = new THREE.Group(), conesN = new THREE.Group();
    fieldGroup.add(conesP, conesN);
    let fieldBuilt = false, bAnchor = new THREE.Vector3(-19, 1.6, 0);
    function buildField(lines) {
      fieldBuilt = true;
      const planes = [0, 50, -50].map(function (d) { const a = d * Math.PI / 180; return [Math.cos(a), Math.sin(a)]; });
      lines.forEach(function (ln, li) {
        planes.forEach(function (pl, pi) {
          const map = function (p) { return new THREE.Vector3(p[1] * CM, p[0] * CM * pl[0], p[0] * CM * pl[1]); };
          // 切成在桌面以上的連續段
          let seg = [];
          const flush = function () {
            if (seg.length > 3) {
              const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(seg), Math.min(300, seg.length * 2), pi === 0 ? 0.05 : 0.035, 5, false);
              const m = new THREE.Mesh(g, fieldMat); m.renderOrder = 3; fieldGroup.add(m);
              // 箭頭：每 7 cm 一個
              let acc = 0, next = 4;
              for (let i = 1; i < seg.length - 1; i++) {
                acc += seg[i].distanceTo(seg[i - 1]);
                if (acc >= next) {
                  next += 7;
                  const dir = seg[i + 1].clone().sub(seg[i - 1]).normalize();
                  [[conesP, 1], [conesN, -1]].forEach(function (cg) {
                    const c = new THREE.Mesh(new THREE.ConeGeometry(pi === 0 ? 0.2 : 0.15, 0.55, 12), fConeMat);
                    c.position.copy(seg[i]);
                    c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().multiplyScalar(cg[1]));
                    c.renderOrder = 3; cg[0].add(c);
                  });
                }
              }
            }
            seg = [];
          };
          ln.forEach(function (p) {
            const v = map(p);
            if (v.y < YT + 0.05 || v.x < -LEN - 9 || v.x > 9) flush(); else seg.push(v);
          });
          flush();
          if (li === 0 && pi === 0) { // B 的標示：放在管子左端外面、最靠近軸的那條磁力線上（不和管內的標示擠在一起）
            let best = null;
            ln.forEach(function (p) { if (!best || Math.abs(p[1] * CM + LEN + 3.5) < Math.abs(best[1] * CM + LEN + 3.5)) best = p; });
            if (best) bAnchor = map(best);
          }
        });
      });
    }

    // ---- 名稱標示 ----
    const labels = [];
    const leaderMat = own(new THREE.LineBasicMaterial({ color: 0x9fb0b6, transparent: true, opacity: 0.7, depthTest: false }));
    const LS = 0.032;
    function label(text, color, pos, anchor, side) { // side：標在點的右邊（受力的名稱放在箭頭旁）
      const c = document.createElement('canvas'), g = c.getContext('2d'), px = 56;
      const f = F3(px);
      g.font = f;
      const w = Math.ceil(g.measureText(text).width) + 44, h = Math.ceil(px * 1.55);
      c.width = w; c.height = h;
      g.font = f;
      const r = h * 0.32;
      g.beginPath();
      g.moveTo(r, 2); g.lineTo(w - r, 2); g.quadraticCurveTo(w - 2, 2, w - 2, r); g.lineTo(w - 2, h - r); g.quadraticCurveTo(w - 2, h - 2, w - r, h - 2);
      g.lineTo(r, h - 2); g.quadraticCurveTo(2, h - 2, 2, h - r); g.lineTo(2, r); g.quadraticCurveTo(2, 2, r, 2); g.closePath();
      g.fillStyle = 'rgba(8,13,16,0.8)'; g.fill();
      g.lineWidth = 3; g.strokeStyle = color; g.globalAlpha = 0.65; g.stroke(); g.globalAlpha = 1;
      g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, w / 2, h / 2 + 2);
      const sp = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: canvasTex(c), transparent: true, depthWrite: false, depthTest: false, sizeAttenuation: false })));
      sp.userData.k = w / h;
      sp.scale.set(LS * w / h, LS, 1);
      if (side) sp.center.set(-0.15, 0.5); else sp.center.set(0.5, 0);
      sp.renderOrder = 10;
      sp.position.copy(pos);
      labels.push(sp);
      scene.add(sp);
      if (anchor) {
        const g2 = new THREE.BufferGeometry().setFromPoints([pos, anchor]);
        const ln = new THREE.Line(g2, leaderMat);
        ln.renderOrder = 9;
        sp.userData.leader = ln;
        scene.add(ln);
      }
      return sp;
    }
    function moveLabel(l, pos, anchor) {
      l.position.copy(pos);
      if (l.userData.leader) {
        const a = l.userData.leader.geometry.attributes.position;
        a.setXYZ(0, pos.x, pos.y, pos.z); a.setXYZ(1, anchor.x, anchor.y, anchor.z); a.needsUpdate = true;
        l.userData.leader.geometry.computeBoundingSphere();
      }
    }
    const V = function (x, y, z) { return new THREE.Vector3(x, y, z); };
    const L = {
      sol: label(T('螺線管（1000 匝）', 'Solenoid (1000 turns)'), '#f0c79d', V(-19, 7.4, -2), V(-18, 2.9, -1.2)),
      bc: label(T('bc 段', 'segment bc'), '#e8eef0', V(UBC + ZP, 5.6, 3.5), V(UBC + ZP, 0.2, 0)),
      piv: label(T('支點 K', 'Pivot K'), '#e8eef0', V(ZP + 2.5, 5.2, 3.5), V(ZP, 0, POSTX + 0.2)),
      nut: label(T('歸零螺母', 'Zero nut'), '#f1d58f', V(ZP + 13, 4.2, 2.5), V(ZP + 15, 0.3, 0)),
      wire: label(T('漆包線', 'Wire'), '#f2a58e', V(ZP + 9, -4.3, 4), V(ZP + UH, -2, 0)),
      card: label(T('水平刻度', 'Level scale'), '#e8eef0', V(ZP + 18.2, 5.6, -1.5), V((CARD.x0 + CARD.x1) / 2, CARD.y1, CARD.z)),
      sup2: label(T('螺線管電源', 'Solenoid supply'), '#c3ccd0', V(dev2.x, YT + dev2.h + 0.9, dev2.z + 1)),
      sup1: label(T('天平電源', 'Balance supply'), '#c3ccd0', V(dev1.x, YT + dev1.h + 0.9, dev1.z + 1)),
      scale: label(T('電子秤', 'Scale'), '#c3ccd0', V(devS.x, YT + devS.h + 0.9, devS.z + 2.6)),
      B: label('B', '#8fb7ff', V(-19, 1.6, 0)),
      F: label('F', '#ff8a7f', V(0, 0, 0), null, true),
      W: label('mg', '#5fe0a8', V(0, 0, 0), null, true)
    };

    // ---- 顏色（深淺色切換時更新） ----
    function applyColors() {
      tok = env.tokens();
      const c = function (k, d) { return new THREE.Color(tok[k] || d); };
      copperMat.color.copy(c('copper', '#b8743d'));
      cuMat.color.copy(c('copper', '#b8743d')).lerp(new THREE.Color(0xffffff), 0.12);
      tubeMat.color.copy(c('tube', '#e7dcc6'));
      plateMat.color.copy(c('plate', '#a9b0b4'));
      boardMat.color.copy(c('board', '#1f6b4f'));
      metalMat.color.copy(c('metal', '#9aa6ac'));
      brassMat.color.copy(c('brass', '#c09a4a'));
      wireMat.color.copy(c('wire', '#9c3b22'));
      tableMat.color.copy(c('table', '#d9d2c5'));
      coneMatI.color.copy(c('equi', '#8a5a00'));
      flowMat.color.copy(c('equi', '#e7b75a')).lerp(new THREE.Color(0xffffff), 0.35);
      fieldMat.color.copy(c('neg', '#2f6fd0'));
      fConeMat.color.copy(c('neg', '#2f6fd0'));
      [arrF, arrS1, arrS2].forEach(function (a) { a.userData.mat.color.copy(c('pos', '#d1453b')); a.userData.mat.emissive.copy(c('pos', '#d1453b')).multiplyScalar(0.25); });
      arrW.userData.mat.color.copy(c('probe', '#0f8a5f')); arrW.userData.mat.emissive.copy(c('probe', '#0f8a5f')).multiplyScalar(0.25);
      hemi.intensity = tok.dark ? 0.6 : 0.8;
      drawCut(); drawCard();
      dev1.key = dev2.key = devS.key = '';
    }

    // ---- 相機 ----
    // 整組器材（螺線管、支架、刻度板、電源、電子秤）的外框：相機距離剛好讓這八個角都在畫面裡
    // 器材上的關鍵點（螺線管、端板、標示、刻度板、掛勾、電源、電子秤）：相機距離剛好讓它們都在畫面裡，並把它們置中
    const KEY = [[-26, 4.2, -4], [-26, -5, 0], [-25.5, 5.4, -2], [-19, 8.6, -2], [0.5, 4, -4], [0.5, -5, 0], [3.5, -5, 3.4],
      [19.6, 2.4, -1], [19.6, -5, -1], [22.5, 6.2, -1.5], [16, -5, 1],
      [-22.5, -0.4, 13.5], [-22.5, -5, 13.5], [-13.5, -5, 13.5], [-6.5, -5, 14.5], [2.5, -5, 14.5], [9, -5, 12.5], [17, -5, 12.5], [17, -2.8, 5.5]
    ].map(function (p) { return new THREE.Vector3(p[0], p[1], p[2]); });
    function fit(force) {
      const tv = Math.tan(camera.fov * Math.PI / 360), th = tv * camera.aspect;
      // 直式（手機）畫面：從更高處俯看，前後方向的器材攤開在上下，填滿畫面
      const dir = force ? (camera.aspect < 1.1 ? viewDirTall.clone() : viewDir.clone()) : camera.position.clone().sub(controls.target).normalize();
      if (force) controls.target.copy(target0);
      const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), dir).normalize();
      const up = new THREE.Vector3().crossVectors(dir, right);
      function need() {
        let d = 10;
        KEY.forEach(function (p) {
          const q = p.clone().sub(controls.target);
          d = Math.max(d, q.dot(dir) + Math.abs(q.dot(right)) / th, q.dot(dir) + Math.abs(q.dot(up)) / tv);
        });
        return d;
      }
      let dist = need();
      for (let it = 0; force && it < 3; it++) { // 平移目標點，讓左右、上下留白一樣
        let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
        KEY.forEach(function (p) {
          const q = p.clone().sub(controls.target), z = dist - q.dot(dir);
          const x = q.dot(right) / (z * th), y = q.dot(up) / (z * tv);
          x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        });
        controls.target.addScaledVector(right, (x0 + x1) / 2 * dist * th * 0.8).addScaledVector(up, (y0 + y1) / 2 * dist * tv * 0.8);
        dist = need();
      }
      dist *= camera.aspect < 1.1 ? 1.1 : 1.05; // 留點邊給標示
      camera.position.copy(controls.target).addScaledVector(dir, dist);
      camera.near = Math.max(0.5, dist / 200); camera.far = dist * 20;
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
      if (Math.abs(camera.aspect - lastAspect) > 0.01) { lastAspect = camera.aspect; fit(false); }
      const ls = camera.aspect < 1.1 ? 0.036 : LS;
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
    function world(u, v) { // 板子座標 → 場景座標（cm）
      const th = cur.th, c = Math.cos(th), s = Math.sin(th);
      return [ZP + u * c + v * s, -u * s + v * c];
    }
    function placeFlow() {
      const s = cur, on = !!(s.flowing && s.show.flow);
      const sp = 1.2, ph = ((s.flowT || 0) * 1.0 * s.I1) % sp;
      let k = 0;
      if (on) {
        for (let d = ph; d < flowTotal && k < flowDots.length; d += sp, k++) {
          let i = 0, rem = d;
          while (i < flowSeg.length - 1 && rem > flowSeg[i]) { rem -= flowSeg[i]; i++; }
          const t = Math.min(1, rem / flowSeg[i]);
          const a = s.s1 > 0 ? flowPath[i] : flowPath[flowPath.length - 1 - i], b = s.s1 > 0 ? flowPath[i + 1] : flowPath[flowPath.length - 2 - i];
          const dot = flowDots[k];
          dot.position.set(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
          dot.visible = true;
        }
      }
      for (; k < flowDots.length; k++) flowDots[k].visible = false;
    }
    function update() {
      const s = env.state();
      cur = s;
      beamG.rotation.z = -s.th;
      nutM.position.set(U1 + 0.25 + s.nut * 0.1, 0, 0);
      const hk = world(UH, -BT);
      hookG.position.set(hk[0], hk[1], 0);
      if (s.hung) { if (Math.abs(wireLen - s.len) > 1e-9) rebuildWire(s.len); wireMesh.visible = true; }
      else if (wireMesh) wireMesh.visible = false;
      // 繞線電流方向
      const on2 = s.power && s.I2 > 0;
      arcsP.visible = on2 && s.s2 > 0; arcsN.visible = on2 && s.s2 < 0;
      // 磁力線
      const fOn = !!(s.show.field && on2 && s.lines);
      if (fOn && !fieldBuilt) buildField(s.lines);
      fieldGroup.visible = fOn;
      if (fOn) {
        const f = Math.min(1, s.I2 / 3);
        fieldMat.opacity = 0.2 + 0.5 * f; fConeMat.opacity = 0.35 + 0.55 * f;
        conesP.visible = s.s2 > 0; conesN.visible = s.s2 < 0;
      }
      // 受力
      const showF = !!s.show.force, down = s.s1 * s.s2 > 0;
      const bc = world(UBC, BT);
      setArrow(arrF, bc[0], bc[1], 0, down ? -1 : 1, showF ? s.F / s.FREF * ALEN : 0);
      const sd = world(s.uSide * CM, BT);
      [arrS1, arrS2].forEach(function (a, i) { setArrow(a, sd[0], sd[1], i ? -ARM : ARM, down ? 1 : -1, showF && s.realSol ? s.Fside / s.FREF * ALEN : 0); });
      setArrow(arrW, hk[0] + 0.35, hk[1] - 0.6, 0.45, -1, showF && s.hung ? s.W / s.FREF * ALEN : 0);
      // 電表
      drawDevice(dev2, T('螺線管 I', 'Solenoid I'), '2', s.power ? s.I2m.toFixed(2) : ' .  ', 'A', s.power);
      drawDevice(dev1, T('天平 I', 'Balance I'), '1', s.power ? s.I1m.toFixed(2) : ' .  ', 'A', s.power);
      drawDevice(devS, T('電子秤', 'Scale'), '', String(s.mg), 'mg', true);
      // 標籤
      const showL = s.show.labels !== false;
      moveLabel(L.bc, V(bc[0] - 1, 5.4, 2.5), V(bc[0], bc[1] + 0.05, 0));
      const np = world(U1 + 0.25 + s.nut * 0.1, 0.35);
      moveLabel(L.nut, V(np[0] - 1.5, 3.2, 4), V(np[0], np[1], 0));
      const wb = hk[1] - 0.62 - s.len / 2;
      moveLabel(L.wire, V(hk[0] - 5, YT + 1.4, 4.5), V(hk[0], wb + 0.3, 0));
      L.F.position.set(bc[0] + 0.45, bc[1] + (down ? -1 : 1) * (s.F / s.FREF * ALEN) * 0.55, 0);
      L.W.position.set(hk[0] + 0.75, hk[1] - 0.6 - (s.W / s.FREF * ALEN) * 0.55, 0.45);
      L.B.position.copy(bAnchor).add(V(0, 0.6, 0));
      Object.keys(L).forEach(function (k) {
        const l = L[k];
        let vis = showL;
        if (k === 'wire') vis = showL && s.hung;
        if (k === 'sup1' || k === 'sup2' || k === 'scale') vis = showL && camera.aspect >= 1.1; // 窄畫面：電表面板上已有名稱
        if (k === 'B') vis = showL && fOn;
        if (k === 'F') vis = showF && arrF.visible;
        if (k === 'W') vis = showF && arrW.visible;
        l.visible = vis;
        if (l.userData.leader) l.userData.leader.visible = vis;
      });
      placeFlow();
      requestRender();
    }

    const api = {
      active: true,
      update: update,
      frame: function () { update(); if (raf) { cancelAnimationFrame(raf); raf = 0; } renderNow(); },
      onTheme: function () { applyColors(); update(); },
      resetCamera: function () { fit(true); requestRender(); },
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

    applyColors();
    const w0 = canvas.clientWidth, h0 = canvas.clientHeight;
    if (w0 && h0) { renderer.setSize(w0, h0, false); camera.aspect = w0 / h0; camera.updateProjectionMatrix(); lastAspect = camera.aspect; }
    fit(true);
    return api;
  }

  window.CurrentBalance3D = { create: create };
})();
