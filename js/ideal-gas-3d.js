/*
 * ideal-gas-3d.js — 「理想氣體分子模擬」的 3D 立體檢視（可旋轉、縮放的真 3D 場景）
 *
 * three.js 由 ideal-gas.js 在切換到 3D 時才以 import() 動態載入（vendor/three/），再傳進 IdealGas3D.create(lib, host)。
 * 這個檔案只「讀」物理核心的狀態（分子位置、速度、半徑、活塞位置、撞擊活塞的紀錄），不改變任何物理量；
 * 模擬由 ideal-gas.js 推進，所以不論顯示 2D 或 3D，模擬完全相同。
 *
 * 場景座標 = 模擬座標（nm）：x 沿汽缸向右（活塞內面在分子中心可達的 x = Lx），y 向上，z 朝向觀眾。
 * 器壁的位置是「分子中心」能到達的邊界；畫玻璃與活塞時往外推一個分子半徑，分子撞牆時剛好碰到玻璃。
 */
(function () {
  'use strict';

  const CAP = 320;          // 分子數上限（與 ideal-gas.js 的 cap 相同）
  const TR_MAX = 60;        // 追蹤軌跡最多畫幾段（與 2D 相同）
  const FL_MAX = 96;        // 同時顯示的撞牆閃光上限
  const ROD_L = 6.2;        // nm：活塞拉桿長度（夠長，預設視角下把手露在活塞旁邊）
  const KNOB_R = 1.35;      // nm：把手（球）半徑
  const KNOB_X = 1.1;       // 把手球心在拉桿末端之後的距離
  const WALL_FRACTION = 0.12; // 固定器壁的撞擊只抽樣顯示一部分（純裝飾，避免整面閃爍）

  function create(lib, H) {
    const THREE = lib.THREE;
    const G = window.IdealGasCore;
    const T = H.T;
    const C = H.C;
    const LY = C.LY, LZ = C.LZ, PT = C.PT, XH = C.XH, LX_MAX = C.LX_MAX;
    const host = H.host;

    // ---------- 畫布、HTML 疊層 ----------
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', T('理想氣體的 3D 立體檢視：玻璃容器、活塞與氣體分子（拖曳旋轉、雙指或滾輪縮放；拖曳把手移動活塞，點分子可追蹤）',
      '3D view of the ideal gas: glass container, piston and molecules (drag to rotate, pinch or scroll to zoom; drag the handle to move the piston, tap a molecule to follow it)'));
    host.appendChild(canvas);
    const ov = document.createElement('div');
    ov.className = 'ig3-ov';
    ov.setAttribute('aria-hidden', 'true');
    host.appendChild(ov);

    let renderer;
    try {
      // alpha：背景由 CSS 的徑向漸層提供（隨深淺色自動變化）
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch (e) {
      canvas.remove(); ov.remove();
      throw e;
    }
    let prCap = 2; // 裝置太慢時自動降低（最低 1）
    function wantPR() { return Math.min(window.devicePixelRatio || 1, prCap); }
    renderer.setPixelRatio(wantPR());
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1.5, 0.5, 2000);
    // 預設視角與 2D 畫布相同：由左前上方看（看得到左端、正面與活塞的內面）
    const viewDir = new THREE.Vector3(-0.36, 0.44, 0.82).normalize();
    camera.position.copy(viewDir).multiplyScalar(80);
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.minDistance = 5;
    controls.maxDistance = 400;
    controls.zoomSpeed = 0.9;
    controls.maxPolarAngle = Math.PI / 2 + 0.06; // 最低到略低於桌面，不鑽到底座下面

    // ---------- 環境光照（自製的小攝影棚：上方柔光箱＋側窗，讓玻璃與金屬有柔和的反光） ----------
    const envRT = (function () {
      const pm = new THREE.PMREMGenerator(renderer);
      const env = new THREE.Scene();
      const roomGeo = new THREE.BoxGeometry(20, 12, 20);
      const p = roomGeo.attributes.position, cols = [];
      for (let i = 0; i < p.count; i++) { const t = (p.getY(i) + 6) / 12; const v = 0.12 + 0.42 * t * t; cols.push(v, v * 1.01, v * 1.03); }
      roomGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      env.add(new THREE.Mesh(roomGeo, new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true })));
      function panel(w, h, x, y, z, rx, ry, k) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k), side: THREE.DoubleSide }));
        m.position.set(x, y, z); m.rotation.set(rx, ry, 0);
        env.add(m);
      }
      panel(9, 3.2, 0, 5.9, -1, Math.PI / 2, 0, 5);      // 天花板柔光箱
      panel(5, 5, -9.9, 1.5, 1, 0, Math.PI / 2, 2.6);    // 左側窗
      panel(7, 1.6, 1, 2.5, -9.9, 0, 0, 1.8);            // 後方燈條
      panel(3, 4, 9.9, 1, 5, 0, -Math.PI / 2, 1.2);      // 右側補光
      const rt = pm.fromScene(env, 0.03);
      pm.dispose();
      env.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      return rt;
    })();
    const envMap = envRT.texture;

    // ---------- 光源：半球光＋一盞幾乎由正上方照下、會投影的方向光（與 2D 畫布的地板影子相同） ----------
    const hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 1.35);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 2.1);
    sun.position.set(XH / 2 - 9, 72, LZ / 2 + 15);
    sun.target.position.set(XH / 2, 0, LZ / 2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.radius = 3;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    const shc = sun.shadow.camera;
    shc.left = -25; shc.right = 25; shc.top = 18; shc.bottom = -18; shc.near = 40; shc.far = 110;
    scene.add(sun);
    scene.add(sun.target);

    // ---------- 顏色 ----------
    let colors = H.colors();
    let themeVer = 0;
    const col = function (css) { return new THREE.Color(css || '#888888'); };
    function dark() { return !!colors.dark; }

    // ---------- 材質 ----------
    const molMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.0, envMap: envMap, envMapIntensity: 0.5 });
    // 玻璃：極淡的透明面＋菲涅耳效應（斜看時反光變強、較不透明），不用耗效能的折射（transmission）
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff, metalness: 0, roughness: 0.04, transparent: true, side: THREE.DoubleSide, depthWrite: false,
      envMap: envMap, envMapIntensity: 1.0, ior: 1.5, specularIntensity: 1, premultipliedAlpha: true
    });
    // 透過的光只留淡淡的色調（乘上 alpha）；鏡面反光另外加上去（預乘 alpha 的混合），斜看時較不透明（菲涅耳效應）。
    // 先換成螢幕色彩空間再乘 alpha，否則淡色會被 gamma 放大成一片白霧。
    const fresnelU = { value: new THREE.Vector3(0.05, 0.32, 0.55) };
    glassMat.onBeforeCompile = function (sh) {
      sh.uniforms.uFres = fresnelU;
      sh.fragmentShader = 'uniform vec3 uFres;\n' + sh.fragmentShader
        .replace('#include <opaque_fragment>',
          'float igNv = abs(dot(normalize(normal), normalize(vViewPosition)));\n' +
          'float igA = mix(uFres.x, uFres.y, pow(1.0 - igNv, 4.0));\n' +
          'vec3 igS = max(outgoingLight - totalDiffuse, vec3(0.0));\n' +
          'gl_FragColor = vec4(linearToOutputTexel(vec4(totalDiffuse, 1.0)).rgb * igA + linearToOutputTexel(vec4(igS, 1.0)).rgb * uFres.z, igA);')
        .replace('#include <colorspace_fragment>', '')
        .replace('#include <premultiplied_alpha_fragment>', '');
    };
    glassMat.customProgramCacheKey = function () { return 'ig3-glass'; };
    const edgeMat = new THREE.MeshPhysicalMaterial({ color: 0xdddddd, roughness: 0.18, metalness: 0, envMap: envMap, envMapIntensity: 0.9, clearcoat: 1, clearcoatRoughness: 0.1 });
    const steelMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.62, roughness: 0.26, envMap: envMap, envMapIntensity: 1.25 });
    // 活塞面：車床加工的同心細紋（貼圖只算一次）
    const machinedTex = makeMachinedTexture();
    const slabMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.62, roughness: 0.3, envMap: envMap, envMapIntensity: 1.25, map: machinedTex });
    const sealMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0, roughness: 0.75 });
    const knobMat = new THREE.MeshPhysicalMaterial({ color: 0xcc6633, metalness: 0.1, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.12, envMap: envMap, envMapIntensity: 0.9 });
    const pinMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.6, roughness: 0.35, envMap: envMap, envMapIntensity: 0.8 });
    const bathMat = new THREE.MeshStandardMaterial({ color: 0x999999, metalness: 0.35, roughness: 0.38, envMap: envMap, envMapIntensity: 0.9 });
    const stripeTex = makeStripeTexture();
    const insMat = new THREE.MeshStandardMaterial({ color: 0x999999, metalness: 0, roughness: 0.88, map: stripeTex });
    const shadowFloorMat = new THREE.ShadowMaterial({ opacity: 0.25, depthWrite: false });
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide });
    const glowMat2 = glowMat.clone();
    const contactTex = makeContactTexture();
    const contactMat = new THREE.MeshBasicMaterial({ map: contactTex, transparent: true, depthWrite: false, opacity: 0.5 });
    const tickMat = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5 });
    const markMat = new THREE.MeshStandardMaterial({ color: 0x00aa88, roughness: 0.4, metalness: 0.1 });
    const trailMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0 });
    const arrowMat = new THREE.MeshStandardMaterial({ color: 0xff3333, roughness: 0.35, metalness: 0.05 });

    function makeStripeTexture() {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d');
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 64);
      g.strokeStyle = 'rgba(0,0,0,0.22)'; g.lineWidth = 6;
      for (let k = -64; k <= 128; k += 16) { g.beginPath(); g.moveTo(k, 64); g.lineTo(k + 64, 0); g.stroke(); }
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(4, 1);
      t.anisotropy = 4;
      return t;
    }
    function makeMachinedTexture() {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const g = c.getContext('2d');
      g.fillStyle = '#ececec'; g.fillRect(0, 0, 256, 256);
      g.lineWidth = 1.3;
      for (let r = 182, k = 0; r > 2; r -= 1.25, k++) {
        const h = Math.sin(k * 12.9898) * 43758.5453;
        const v = Math.round(232 + 3 * Math.sin(r * 0.21) + 12 * (h - Math.floor(h) - 0.5));
        g.strokeStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
        g.beginPath(); g.arc(128, 128, r, 0, 2 * Math.PI); g.stroke();
      }
      const gr = g.createRadialGradient(128, 128, 8, 128, 128, 181);
      gr.addColorStop(0, 'rgba(255,255,255,0.18)'); gr.addColorStop(0.8, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.12)');
      g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      return t;
    }
    /** 底座下方的柔和接觸陰影（圓角矩形的模糊影子，畫成貼圖，不必每幀計算） */
    function makeContactTexture() {
      const c = document.createElement('canvas');
      c.width = 256; c.height = 160;
      const g = c.getContext('2d');
      g.shadowColor = 'rgba(0,0,0,0.9)';
      g.shadowBlur = 26;
      g.shadowOffsetX = 1000;
      g.fillStyle = '#000';
      const x = 30 - 1000, y = 30, w = 196, h = 100, r = 12;
      g.beginPath();
      g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); g.fill();
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    }

    // ---------- 靜態部分（分子半徑改變時重建）：玻璃、邊框、底座、刻度、地板影子、恆溫光 ----------
    let rw = 0.25;            // 玻璃往外推的距離 = 目前氣體中最大的分子半徑
    let staticKey = '';
    let staticGroup = null;
    let baseMesh = null, baseTop = 0;
    let floorGlow = null, backGlow = null;
    let tickLines = null;
    const rulerX = [0, 10, 20, 30];

    function disposeObject(obj) {
      obj.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
      });
    }

    function buildStatic() {
      const g = H.gas();
      const sp0 = H.speciesOf(0), sp1 = H.speciesOf(1);
      let r = sp0.d / 2;
      if (H.state.mix) r = Math.max(r, sp1.d / 2);
      const key = r.toFixed(3);
      if (key === staticKey && staticGroup) return;
      staticKey = key;
      rw = r;
      if (staticGroup) { scene.remove(staticGroup); disposeObject(staticGroup); }
      const grp = new THREE.Group();
      const x0 = -rw, x1 = XH + rw, y0 = -rw, y1 = LY + rw, z0 = -rw, z1 = LZ + rw;
      const W = x1 - x0, Hh = y1 - y0, D = z1 - z0;

      // 玻璃：右端開口（活塞後方是外界，不是氣體）
      const gg = new THREE.BoxGeometry(W, Hh, D);
      gg.groups = gg.groups.filter(function (q) { return q.materialIndex !== 0; });
      const glass = new THREE.Mesh(gg, [glassMat, glassMat, glassMat, glassMat, glassMat, glassMat]);
      glass.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      glass.renderOrder = 3;
      grp.add(glass);

      // 玻璃的 12 條邊（細長方柱，看起來像玻璃板的切邊）
      const eb = 0.2;
      const edges = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), edgeMat, 12);
      const m4 = new THREE.Matrix4();
      let k = 0;
      [y0, y1].forEach(function (y) { [z0, z1].forEach(function (z) { m4.makeScale(W + eb, eb, eb).setPosition((x0 + x1) / 2, y, z); edges.setMatrixAt(k++, m4); }); });
      [x0, x1].forEach(function (x) {
        [z0, z1].forEach(function (z) { m4.makeScale(eb, Hh, eb).setPosition(x, (y0 + y1) / 2, z); edges.setMatrixAt(k++, m4); });
        [y0, y1].forEach(function (y) { m4.makeScale(eb, eb, D).setPosition(x, y, (z0 + z1) / 2); edges.setMatrixAt(k++, m4); });
      });
      edges.instanceMatrix.needsUpdate = true;
      grp.add(edges);

      // 底座：圓角厚板（恆溫槽：金屬；絕熱：隔熱材）
      const bx0 = x0 - 1.4, bx1 = x1 + 1.4, bz0 = z0 - 1.4, bz1 = z1 + 1.4, by0 = -2.2, by1 = y0 - 0.02;
      const bev = 0.22, rr = 0.9;
      const shape = new THREE.Shape();
      // 形狀在 (x, −z) 平面，擠出方向轉成 +y
      const sx0 = bx0 + bev, sx1 = bx1 - bev, sy0 = -(bz1 - bev), sy1 = -(bz0 + bev);
      shape.moveTo(sx0 + rr, sy0);
      shape.lineTo(sx1 - rr, sy0); shape.quadraticCurveTo(sx1, sy0, sx1, sy0 + rr);
      shape.lineTo(sx1, sy1 - rr); shape.quadraticCurveTo(sx1, sy1, sx1 - rr, sy1);
      shape.lineTo(sx0 + rr, sy1); shape.quadraticCurveTo(sx0, sy1, sx0, sy1 - rr);
      shape.lineTo(sx0, sy0 + rr); shape.quadraticCurveTo(sx0, sy0, sx0 + rr, sy0);
      const bg = new THREE.ExtrudeGeometry(shape, { depth: (by1 - by0) - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 3, curveSegments: 6 });
      bg.rotateX(-Math.PI / 2);
      bg.translate(0, by0 + bev, 0);
      // 隔熱材的斜線貼圖：沿 x 方向重複（UV 由形狀座標而來，換算成每 3 nm 一條）
      const uv = bg.attributes.uv, pos = bg.attributes.position;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) + pos.getZ(i)) / 32, pos.getY(i) / 3.2);
      baseMesh = new THREE.Mesh(bg, H.bathOn() ? bathMat : insMat);
      baseMesh.receiveShadow = true;
      grp.add(baseMesh);
      baseTop = by1;

      // 底座下方的接觸陰影
      const cs = new THREE.Mesh(new THREE.PlaneGeometry((bx1 - bx0) * 1.3, (bz1 - bz0) * 1.55), contactMat);
      cs.rotation.x = -Math.PI / 2;
      cs.position.set((bx0 + bx1) / 2, by0 - 0.03, (bz0 + bz1) / 2 + 0.3);
      cs.renderOrder = 0;
      grp.add(cs);

      // 玻璃底面上的影子（分子、活塞的影子落在正下方，看得出高度）
      const sf = new THREE.Mesh(new THREE.PlaneGeometry(W, D), shadowFloorMat);
      sf.rotation.x = -Math.PI / 2;
      sf.position.set((x0 + x1) / 2, y0 + 0.012, (z0 + z1) / 2);
      sf.receiveShadow = true;
      sf.renderOrder = 1;
      grp.add(sf);

      // 恆溫槽：與氣體接觸的地板與背牆帶溫度色的淡光（寬度跟著活塞，與 2D 相同）
      floorGlow = new THREE.Mesh(new THREE.PlaneGeometry(1, D), glowMat);
      floorGlow.rotation.x = -Math.PI / 2;
      floorGlow.position.set(0, y0 + 0.02, (z0 + z1) / 2);
      floorGlow.renderOrder = 1;
      grp.add(floorGlow);
      backGlow = new THREE.Mesh(new THREE.PlaneGeometry(1, Hh), glowMat2);
      backGlow.position.set(0, (y0 + y1) / 2, z0 + 0.02);
      backGlow.renderOrder = 1;
      grp.add(backGlow);

      // 底座頂面前緣的刻度尺（活塞位置，nm）：每 2 nm 一格，每 10 nm 一條長線
      const tp = [];
      const zr = z1 + 0.16;
      for (let x = 0; x <= LX_MAX + 1e-9; x += 2) tp.push(x, by1 + 0.012, zr, x, by1 + 0.012, zr + (x % 10 === 0 ? 0.5 : 0.3));
      tp.push(0, by1 + 0.012, zr, LX_MAX, by1 + 0.012, zr);
      const tg = new THREE.BufferGeometry();
      tg.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3));
      tickLines = new THREE.LineSegments(tg, tickMat);
      grp.add(tickLines);

      staticGroup = grp;
      scene.add(grp);
      layoutPiston();
      applyBathLook(true);
    }

    // ---------- 活塞（內面在 x = Lx + rw）＋拉桿＋把手 ----------
    const piston = new THREE.Group();
    scene.add(piston);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), slabMat);
    slab.castShadow = true; slab.receiveShadow = true;
    piston.add(slab);
    const seal = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), sealMat);
    piston.add(seal);
    const rodGeo = new THREE.CylinderGeometry(0.5, 0.5, ROD_L, 28);
    rodGeo.rotateZ(-Math.PI / 2);
    const rod = new THREE.Mesh(rodGeo, steelMat);
    rod.castShadow = true;
    piston.add(rod);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(KNOB_R, 36, 24), knobMat);
    knob.castShadow = true;
    piston.add(knob);
    const collarGeo = new THREE.CylinderGeometry(0.85, 0.85, 0.5, 28);
    collarGeo.rotateZ(-Math.PI / 2);
    const collar = new THREE.Mesh(collarGeo, steelMat);
    piston.add(collar);
    const knobHit = new THREE.Mesh(new THREE.SphereGeometry(2.6, 10, 8), knobMat);
    knobHit.visible = false; // 只用來判斷手指是否按到把手（觸控容許範圍較大）
    piston.add(knobHit);
    const pinGeo = new THREE.CylinderGeometry(0.2, 0.2, 3.6, 14);
    pinGeo.rotateX(Math.PI / 2);
    const pin = new THREE.Mesh(pinGeo, pinMat); // 等容：穿過拉桿的固定插銷
    pin.castShadow = true;
    piston.add(pin);
    function layoutPiston() {
      const inner = LY + 2 * rw, e = 0.14;
      slab.scale.set(PT, inner - 2 * e, LZ + 2 * rw - 2 * e);
      slab.position.set(PT / 2, LY / 2, LZ / 2);
      seal.scale.set(0.34, inner - 0.03, LZ + 2 * rw - 0.03);
      seal.position.set(PT * 0.5, LY / 2, LZ / 2);
      rod.position.set(PT + ROD_L / 2, LY / 2, LZ / 2);
      collar.position.set(PT + 0.25, LY / 2, LZ / 2);
      knob.position.set(PT + ROD_L + KNOB_X, LY / 2, LZ / 2);
      knobHit.position.copy(knob.position);
      pin.position.set(PT + 1.2, LY / 2, LZ / 2);
    }
    const pistonParts = [slab, seal, rod, knob, knobHit, collar];

    // 刻度尺上的活塞位置指標（小三角形）
    const markGeo = new THREE.ConeGeometry(0.3, 0.55, 3);
    markGeo.rotateX(-Math.PI / 2);
    const mark = new THREE.Mesh(markGeo, markMat);
    scene.add(mark);

    // ---------- 分子：InstancedMesh（每幀直接寫入矩陣，不配置新物件） ----------
    const molGeo = new THREE.SphereGeometry(1, 18, 12);
    const mols = new THREE.InstancedMesh(molGeo, molMat, CAP);
    mols.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mols.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3);
    mols.instanceColor.setUsage(THREE.DynamicDrawUsage);
    mols.castShadow = true;
    mols.receiveShadow = false; // 分子彼此的影子小到看不見，省下每個像素的陰影取樣
    mols.frustumCulled = false;
    mols.count = 0;
    scene.add(mols);
    (function () { const a = mols.instanceMatrix.array; for (let i = 0; i < CAP; i++) a[16 * i + 15] = 1; })();

    // 顏色表：兩種氣體各一色；依速率上色時用 65 階色表（與 2D、直方圖相同的色階）
    const spCol = [new THREE.Color(), new THREE.Color()];
    const speedLUT = [];
    for (let l = 0; l <= 64; l++) speedLUT.push(new THREE.Color());
    let colKey = '';
    function refreshMolColors() {
      const key = themeVer + '|' + H.state.spA + '|' + H.state.spB;
      if (key === colKey) return;
      colKey = key;
      spCol[0].set(H.spColor(0));
      spCol[1].set(H.spColor(1));
      for (let l = 0; l <= 64; l++) speedLUT[l].set(H.speedColorAt(l / 64));
    }

    // ---------- 追蹤的分子：管狀軌跡（越舊越細、越淡）、碰撞點、速度箭頭 ----------
    const trailGeo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
    const trail = new THREE.InstancedMesh(trailGeo, trailMat, TR_MAX);
    trail.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    trail.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(TR_MAX * 3), 3);
    trail.frustumCulled = false;
    trail.count = 0;
    scene.add(trail);
    const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), trailMat, TR_MAX + 1);
    dots.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    dots.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array((TR_MAX + 1) * 3), 3);
    dots.frustumCulled = false;
    dots.count = 0;
    scene.add(dots);
    const arrowG = new THREE.Group();
    const shaftGeo = new THREE.CylinderGeometry(1, 1, 1, 14);
    shaftGeo.translate(0, 0.5, 0);
    const headGeo = new THREE.ConeGeometry(1, 1, 20);
    headGeo.translate(0, 0.5, 0);
    const shaft = new THREE.Mesh(shaftGeo, arrowMat), head = new THREE.Mesh(headGeo, arrowMat);
    arrowG.add(shaft); arrowG.add(head);
    arrowG.visible = false;
    scene.add(arrowG);

    // ---------- 撞牆閃光：每個實例是一片貼在牆面上的小方片，片元著色器畫出擴散的光環 ----------
    const flGeo = new THREE.PlaneGeometry(1, 1);
    const flPA = new THREE.InstancedBufferAttribute(new Float32Array(FL_MAX * 2), 2);
    flPA.setUsage(THREE.DynamicDrawUsage);
    flGeo.setAttribute('aPA', flPA);
    const flMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: [
        'attribute vec2 aPA;',
        'varying vec2 vUv; varying vec2 vPA; varying vec3 vCol;',
        'void main() {',
        '  vUv = uv; vPA = aPA;',
        '  #ifdef USE_INSTANCING_COLOR',
        '  vCol = instanceColor;',
        '  #else',
        '  vCol = vec3(1.0);',
        '  #endif',
        '  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);',
        '}'].join('\n'),
      fragmentShader: [
        'varying vec2 vUv; varying vec2 vPA; varying vec3 vCol;',
        'void main() {',
        '  float r = length(vUv - 0.5) * 2.0;',
        '  float u = vPA.x;',
        '  float ring = (1.0 - smoothstep(0.0, 0.11, abs(r - (0.28 + 0.66 * u)))) * (1.0 - u);',
        '  float core = (1.0 - smoothstep(0.0, 0.34 * (1.0 - u) + 0.03, r)) * (1.0 - u) * (1.0 - u);',
        '  float a = clamp(0.85 * ring + 0.7 * core, 0.0, 1.0) * vPA.y;',
        '  if (a < 0.004) discard;',
        '  gl_FragColor = vec4(vCol, a);',
        '  #include <colorspace_fragment>',
        '}'].join('\n')
    });
    const flashes = new THREE.InstancedMesh(flGeo, flMat, FL_MAX);
    flashes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    flashes.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(FL_MAX * 3), 3);
    flashes.instanceColor.setUsage(THREE.DynamicDrawUsage);
    flashes.frustumCulled = false;
    flashes.count = 0;
    flashes.renderOrder = 2; // 在玻璃之前畫
    scene.add(flashes);
    // 閃光事件（固定大小的陣列，不配置新物件）
    const fe = { n: 0, x: new Float32Array(FL_MAX), y: new Float32Array(FL_MAX), z: new Float32Array(FL_MAX),
      axis: new Uint8Array(FL_MAX), kind: new Uint8Array(FL_MAX), size: new Float32Array(FL_MAX), t0: new Float64Array(FL_MAX) };
    const FL_DUR = 450; // ms（與 2D 相同）
    const flCol = [new THREE.Color(), new THREE.Color()];
    function addFlash(kind, axis, x, y, z, size, t0) {
      let i = fe.n;
      if (i >= FL_MAX) { // 滿了：取代最舊的
        let old = 0;
        for (let q = 1; q < fe.n; q++) if (fe.t0[q] < fe.t0[old]) old = q;
        i = old;
      } else fe.n++;
      fe.kind[i] = kind; fe.axis[i] = axis; fe.x[i] = x; fe.y[i] = y; fe.z[i] = z; fe.size[i] = size; fe.t0[i] = t0;
    }
    let lastPistonT0 = 0;
    const prevV = { x: new Float32Array(CAP), y: new Float32Array(CAP), z: new Float32Array(CAP) };
    let prevGas = null, prevN = -1, prevT = 0;

    /** 由分子速度的法向分量「由朝外變成朝內」且離牆夠近，找出剛撞過固定器壁的分子（只讀取，純裝飾） */
    function detectWallHits(g, now) {
      const n = g.n, dt = g.t - prevT;
      const ok = g === prevGas && n === prevN && dt > 0 && dt < 30;
      if (ok && H.state.show.impacts && !H.reducedMotion) {
        for (let i = 0; i < n; i++) {
          const vx = g.vx[i], vy = g.vy[i], vz = g.vz[i];
          let axis = -1, tau = 0, side = 0;
          if (prevV.x[i] < 0 && vx > 0 && g.x[i] < vx * dt) { axis = 0; tau = g.x[i] / vx; }
          else if (prevV.y[i] < 0 && vy > 0 && g.y[i] < vy * dt) { axis = 1; tau = g.y[i] / vy; }
          else if (prevV.y[i] > 0 && vy < 0 && LY - g.y[i] < -vy * dt) { axis = 1; side = 1; tau = (LY - g.y[i]) / -vy; }
          else if (prevV.z[i] < 0 && vz > 0 && g.z[i] < vz * dt) { axis = 2; tau = g.z[i] / vz; }
          else if (prevV.z[i] > 0 && vz < 0 && LZ - g.z[i] < -vz * dt) { axis = 2; side = 1; tau = (LZ - g.z[i]) / -vz; }
          if (axis < 0 || Math.random() > WALL_FRACTION) continue;
          // 撞牆點：沿目前速度往回推 tau（撞牆後沒有再碰撞時是精確的），再放到玻璃內面上
          let hx = g.x[i] - vx * tau, hy = g.y[i] - vy * tau, hz = g.z[i] - vz * tau;
          const off = rw - 0.03;
          if (axis === 0) hx = -off;
          else if (axis === 1) hy = side ? LY + off : -off;
          else hz = side ? LZ + off : -off;
          addFlash(1, axis, hx, hy, hz, 1.25, now);
        }
      }
      prevGas = g; prevN = n; prevT = g.t;
      for (let i = 0; i < n; i++) { prevV.x[i] = g.vx[i]; prevV.y[i] = g.vy[i]; prevV.z[i] = g.vz[i]; }
    }

    function updateFlashes(g, now) {
      // 撞擊活塞：直接用物理核心記錄的撞擊（與 2D 相同的資料）
      const imp = H.impacts();
      let maxT0 = lastPistonT0;
      if (H.state.show.impacts && !H.reducedMotion) {
        for (let q = 0; q < imp.length; q++) {
          const e = imp[q];
          if (e.t0 > lastPistonT0) { addFlash(0, 0, 0, e.y, e.z, 1.3 + 0.85 * e.k, e.t0); if (e.t0 > maxT0) maxT0 = e.t0; }
        }
      } else fe.n = 0;
      lastPistonT0 = maxT0;
      detectWallHits(g, now);
      // 寫入實例
      const a = flashes.instanceMatrix.array, ca = flashes.instanceColor.array, pa = flPA.array;
      const px = g.Lx + rw - 0.03;
      let c = 0;
      for (let i = 0; i < fe.n; i++) {
        const u = (now - fe.t0[i]) / FL_DUR;
        if (u >= 1 || u < 0) continue;
        // 壓縮仍有效的事件
        if (c !== i) {
          fe.kind[c] = fe.kind[i]; fe.axis[c] = fe.axis[i]; fe.x[c] = fe.x[i]; fe.y[c] = fe.y[i]; fe.z[c] = fe.z[i];
          fe.size[c] = fe.size[i]; fe.t0[c] = fe.t0[i];
        }
        const s = fe.size[c], o = 16 * c, ax = fe.axis[c];
        const x = fe.kind[c] === 0 ? px : fe.x[c];
        for (let q = 0; q < 16; q++) a[o + q] = 0;
        if (ax === 0) { a[o + 2] = -s; a[o + 5] = s; a[o + 8] = s; }       // 平面在 yz（法向 x）
        else if (ax === 1) { a[o] = s; a[o + 6] = -s; a[o + 9] = s; }      // 平面在 xz（法向 y）
        else { a[o] = s; a[o + 5] = s; a[o + 10] = s; }                    // 平面在 xy（法向 z）
        a[o + 12] = x; a[o + 13] = fe.y[c]; a[o + 14] = fe.z[c]; a[o + 15] = 1;
        const fc = flCol[fe.kind[c]];
        ca[3 * c] = fc.r; ca[3 * c + 1] = fc.g; ca[3 * c + 2] = fc.b;
        pa[2 * c] = u; pa[2 * c + 1] = fe.kind[c] === 0 ? (dark() ? 0.95 : 0.85) : (dark() ? 0.42 : 0.5);
        c++;
      }
      fe.n = c;
      flashes.count = c;
      flashes.instanceMatrix.needsUpdate = true;
      flashes.instanceColor.needsUpdate = true;
      flPA.needsUpdate = true;
      return c > 0;
    }

    // ---------- HTML 疊層：讀數膠囊、跟著 3D 位置的標籤 ----------
    function mk(cls, parent) {
      const el = document.createElement('div');
      el.className = cls;
      (parent || ov).appendChild(el);
      return { el: el, text: null, color: null, w: 0, h: 0, tx: NaN, ty: NaN, shown: true };
    }
    function setText(tag, text, color) {
      if (tag.text !== text) { tag.el.textContent = text; tag.text = text; tag.w = 0; }
      if (color && tag.color !== color) { tag.el.style.color = color; tag.color = color; }
    }
    function show(tag, on) { if (tag.shown !== on) { tag.shown = on; tag.el.style.display = on ? '' : 'none'; } }
    /** 標籤的寬高只在文字改變後量一次（隱藏中的標籤暫時顯示來量） */
    function measure(tag) {
      if (tag.w) return;
      if (!tag.shown) tag.el.style.display = '';
      tag.w = tag.el.offsetWidth; tag.h = tag.el.offsetHeight;
      if (!tag.shown) tag.el.style.display = 'none';
    }
    function place(tag, x, y) {
      if (Math.abs(x - tag.tx) < 0.3 && Math.abs(y - tag.ty) < 0.3) return;
      tag.tx = x; tag.ty = y;
      tag.el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
    }
    const hud = {
      T: mk('ig3-hud tl'), P: mk('ig3-hud tr'), Pth: mk('ig3-hud tr2'), time: mk('ig3-hud bl'), lag: mk('ig3-hud br'), pause: mk('ig3-hud tc')
    };
    const tags = {
      bath: mk('ig3-tag strong'), knob: mk('ig3-tag'), v: mk('ig3-tag strong'),
      ruler: rulerX.map(function () { return mk('ig3-tag plain'); })
    };
    const ring = mk('ig3-ring');
    let hudAt = 0;
    function updateHud(now, force) {
      const h = H.hud();
      if (!force && now - hudAt < 100) return;
      hudAt = now;
      const narrow = vw < 560;
      setText(hud.T, 'T = ' + H.num(h.T, 0) + ' K', h.Tcol);
      setText(hud.P, 'P = ' + (h.P != null ? H.num(h.P, h.P < 10 ? 2 : 1) : '…') + ' kPa', colors.pos);
      setText(hud.Pth, T('理論 NkT/V = ', 'Theory NkT/V = ') + H.num(h.Pth, h.Pth < 10 ? 2 : 1), colors.accent);
      show(hud.Pth, !narrow);
      setText(hud.time, h.time, h.ff ? colors.equi : colors.muted);
      setText(hud.lag, T('裝置較慢：模擬已自動放慢', 'Slow device: simulation slowed'), colors.pos);
      show(hud.lag, !!h.lag);
      setText(hud.pause, T('已暫停', 'Paused'), colors.muted);
      show(hud.pause, !h.running);
    }

    // ---------- 投影（3D → 畫面像素） ----------
    let vw = 1, vh = 1;
    const pv = new THREE.Vector3();
    const scr = { x: 0, y: 0, ok: false, d: 1 };
    function toScreen(x, y, z) {
      pv.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
      scr.d = -pv.z;
      pv.applyMatrix4(camera.projectionMatrix);
      scr.x = (pv.x + 1) * 0.5 * vw;
      scr.y = (1 - pv.y) * 0.5 * vh;
      scr.ok = scr.d > camera.near && pv.z < 1;
      return scr;
    }
    /** 在距離 d 處，1 nm 等於多少畫面像素 */
    function pxPerNm(d) { return vh * 0.5 * camera.projectionMatrix.elements[5] / d; }
    function overlaps(a, ax, ay, b, bx, by) {
      return ax < bx + b.w + 2 && ax + a.w + 2 > bx && ay < by + b.h && ay + a.h > by;
    }

    function updateTags() {
      const g = H.gas();
      // 底座正面：恆溫槽／絕熱
      const bl = H.baseLabel();
      setText(tags.bath, bl.text, bl.color);
      measure(tags.bath);
      const zf = LZ + rw + 1.4 + 0.05;
      const front = camera.position.z > zf; // 從背面看時，底座正面的字不顯示
      let s = toScreen(XH * 0.32, (baseTop - 2.2) / 2, zf);
      show(tags.bath, s.ok && front);
      const bx = s.x - tags.bath.w / 2, by = s.y - tags.bath.h / 2;
      if (s.ok && front) place(tags.bath, bx, by);
      // 刻度數字（避開底座標籤）
      for (let k = 0; k < rulerX.length; k++) {
        const tg = tags.ruler[k], x = rulerX[k];
        setText(tg, H.num(x, 0) + (x === LX_MAX ? ' nm' : ''), colors.muted);
        measure(tg);
        s = toScreen(x, baseTop + 0.02, LZ + rw + 1.62);
        const tx = s.x - tg.w / 2, ty = s.y - tg.h * 0.15;
        const vis = s.ok && front && !(tags.bath.shown && overlaps(tg, tx, ty, tags.bath, bx, by));
        show(tg, vis);
        if (vis) place(tg, tx, ty);
      }
      // 把手旁的提示
      const kh = H.knobHint();
      if (kh) {
        setText(tags.knob, kh.text, kh.color);
        measure(tags.knob);
        const kx = g.Lx + rw + PT + ROD_L + KNOB_X;
        s = toScreen(kx, LY / 2, LZ / 2);
        const rpx = KNOB_R * pxPerNm(s.d);
        const tx = Math.max(4, Math.min(vw - tags.knob.w - 4, s.x - tags.knob.w / 2));
        const ty = Math.min(vh - tags.knob.h - 4, s.y + rpx + 8);
        show(tags.knob, s.ok);
        if (s.ok) place(tags.knob, tx, ty);
      } else show(tags.knob, false);
      // 追蹤的分子：光圈與速率
      const i = g.track;
      if (H.state.show.track && i >= 0 && i < g.n) {
        s = toScreen(g.x[i], g.y[i], g.z[i]);
        const r = g.rad[i] * pxPerNm(s.d) + 3;
        show(ring, s.ok); show(tags.v, s.ok);
        if (s.ok) {
          const sz = Math.round(2 * r);
          if (ring.w !== sz) { ring.w = sz; ring.el.style.width = ring.el.style.height = sz + 'px'; }
          place(ring, s.x - sz / 2, s.y - sz / 2);
          const v = Math.sqrt(g.vx[i] * g.vx[i] + g.vy[i] * g.vy[i] + g.vz[i] * g.vz[i]);
          setText(tags.v, 'v = ' + H.num(v * 1000, 0) + ' m/s', colors.pos);
          measure(tags.v);
          place(tags.v, Math.min(vw - tags.v.w - 4, s.x + r + 6), Math.max(2, s.y - r - tags.v.h));
        }
      } else { show(ring, false); show(tags.v, false); }
    }

    // ---------- 依恆溫槽／絕熱改變外觀 ----------
    let bathKey = '';
    function applyBathLook(force) {
      const g = H.gas();
      const on = H.bathOn();
      const key = themeVer + '|' + on + '|' + g.bath.T + '|' + H.state.Tset;
      if (!force && key === bathKey) return;
      bathKey = key;
      const dev = Math.min(1, Math.abs(g.bath.T - 300) / 400);
      const tc = H.tempColor(g.bath.T);
      if (baseMesh) baseMesh.material = on ? bathMat : insMat;
      if (on) {
        const metal = H.mix(colors.field, tc, 0.35 + 0.4 * dev);
        bathMat.color.set(H.shade(metal, dark() ? -0.55 : 0.5));
        bathMat.emissive.set(tc).multiplyScalar((dark() ? 0.32 : 0.16) * dev);
        const a = (dark() ? 0.1 : 0.07) + 0.16 * dev;
        glowMat.color.set(tc); glowMat.opacity = a;
        glowMat2.color.set(tc); glowMat2.opacity = a * 0.75;
      } else {
        insMat.color.set(H.shade(colors.muted, dark() ? -0.4 : 0.45));
      }
      if (floorGlow) { floorGlow.visible = on; backGlow.visible = on; }
      // 玻璃邊：恆溫時帶溫度色（與 2D 相同）
      const edge = on ? H.mix(colors.text, tc, 0.55) : colors.text;
      edgeMat.color.set(H.mix(edge, colors['canvas-bg'], dark() ? 0.35 : 0.55));
      glassMat.color.set(H.mix(dark() ? '#c8d8dc' : '#cfe0e4', tc, on ? 0.3 * dev : 0));
    }

    let knobKey = '', hoverPiston = false, dragging = false;
    function applyKnobLook() {
      const hl = (hoverPiston || dragging) && H.canDrag();
      const key = themeVer + '|' + hl + '|' + H.state.mode;
      if (key === knobKey) return;
      knobKey = key;
      const kc = hl ? colors.accent : (H.state.mode === 'isobaric' ? colors.equi : colors['b-mech']);
      knobMat.color.set(kc);
      knobMat.emissive.set(hl ? colors.accent : '#000000').multiplyScalar(hl ? 0.25 : 0);
      steelMat.emissive.set(hl ? colors.accent : '#000000').multiplyScalar(hl ? 0.12 : 0);
      slabMat.emissive.copy(steelMat.emissive);
      pin.visible = H.state.mode === 'isochoric';
    }

    function applyColors() {
      colors = H.colors();
      themeVer++;
      hemi.color.set(0xffffff);
      hemi.groundColor.copy(col(colors['canvas-bg'])).lerp(col(colors.text), 0.35);
      hemi.intensity = dark() ? 1.25 : 1.4;
      sun.intensity = dark() ? 2.0 : 2.15;
      shadowFloorMat.opacity = dark() ? 0.36 : 0.2;
      contactMat.opacity = dark() ? 0.75 : 0.32;
      fresnelU.value.set(dark() ? 0.05 : 0.07, dark() ? 0.32 : 0.42, dark() ? 0.5 : 0.6);
      glassMat.envMapIntensity = dark() ? 0.8 : 1.0;
      steelMat.color.set(H.shade(colors.field, dark() ? -0.2 : 0.72));
      slabMat.color.copy(steelMat.color);
      sealMat.color.set(H.shade(colors.text, dark() ? -0.75 : -0.35));
      pinMat.color.set(H.shade(colors.muted, dark() ? 0.1 : -0.1));
      tickMat.color.set(colors.text);
      tickMat.opacity = dark() ? 0.5 : 0.45;
      markMat.color.set(colors.accent);
      arrowMat.color.set(colors.pos);
      arrowMat.emissive.set(colors.pos).multiplyScalar(dark() ? 0.25 : 0.1);
      flCol[0].set(colors.equi);
      flCol[1].set(H.mix(colors.text, colors['canvas-bg'], 0.15));
      molMat.envMapIntensity = dark() ? 0.35 : 0.5;
      trailText.set(colors.text); trailBg.set(colors['canvas-bg']);
      colKey = ''; bathKey = ''; knobKey = '';
      refreshMolColors();
      applyBathLook(true);
      applyKnobLook();
    }
    const trailText = new THREE.Color(), trailBg = new THREE.Color(), tmpC = new THREE.Color();

    // ---------- 每幀更新：分子、活塞、閃光、追蹤 ----------
    const up = new THREE.Vector3(0, 1, 0), dirV = new THREE.Vector3();
    function update(now) {
      const g = H.gas();
      buildStatic();
      applyBathLook(false);
      applyKnobLook();
      refreshMolColors();
      const n = Math.min(g.n, CAP);
      // 分子
      const a = mols.instanceMatrix.array, ca = mols.instanceColor.array;
      const bySpeed = H.state.show.speedColor;
      let vp0 = 1, vp1 = 1;
      if (bySpeed) {
        const Tg = Math.max(20, H.Tgas());
        vp0 = G.vprob(Tg, H.speciesOf(0).m); vp1 = G.vprob(Tg, H.speciesOf(1).m);
      }
      for (let i = 0; i < n; i++) {
        const o = 16 * i, r = g.rad[i];
        a[o] = r; a[o + 5] = r; a[o + 10] = r;
        a[o + 12] = g.x[i]; a[o + 13] = g.y[i]; a[o + 14] = g.z[i];
        let c;
        if (bySpeed) {
          const v = Math.sqrt(g.vx[i] * g.vx[i] + g.vy[i] * g.vy[i] + g.vz[i] * g.vz[i]) / (g.s[i] === 0 ? vp0 : vp1);
          c = speedLUT[Math.max(0, Math.min(64, Math.round(v / 2 * 64)))];
        } else c = spCol[g.s[i] === 0 ? 0 : 1];
        ca[3 * i] = c.r; ca[3 * i + 1] = c.g; ca[3 * i + 2] = c.b;
      }
      mols.count = n;
      mols.instanceMatrix.needsUpdate = true;
      mols.instanceColor.needsUpdate = true;

      // 活塞（內面在 Lx + rw）、刻度指標、恆溫光的寬度
      piston.position.x = g.Lx + rw;
      mark.position.set(g.Lx, baseTop + 0.12, LZ + rw + 0.98);
      if (floorGlow) {
        const w = g.Lx + 2 * rw;
        floorGlow.scale.x = w; floorGlow.position.x = g.Lx / 2;
        backGlow.scale.x = w; backGlow.position.x = g.Lx / 2;
      }

      updateFlashes(g, now);
      updateTrack(g);
    }

    function setSegment(arr, o, ax, ay, az, bx, by, bz, rad) {
      let dx = bx - ax, dy = by - ay, dz = bz - az;
      const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (L < 1e-6) { for (let q = 0; q < 16; q++) arr[o + q] = 0; arr[o + 15] = 1; return; }
      dx /= L; dy /= L; dz /= L;
      // 與 d 垂直的兩個單位向量 u、w（u × d = w，保持右手系）
      let hx = 0, hy = 1, hz = 0;
      if (Math.abs(dy) > 0.9) { hx = 1; hy = 0; }
      let ux = dy * hz - dz * hy, uy = dz * hx - dx * hz, uz = dx * hy - dy * hx;
      const ul = Math.sqrt(ux * ux + uy * uy + uz * uz);
      ux /= ul; uy /= ul; uz /= ul;
      const wx = uy * dz - uz * dy, wy = uz * dx - ux * dz, wz = ux * dy - uy * dx;
      arr[o] = ux * rad; arr[o + 1] = uy * rad; arr[o + 2] = uz * rad; arr[o + 3] = 0;
      arr[o + 4] = dx * L; arr[o + 5] = dy * L; arr[o + 6] = dz * L; arr[o + 7] = 0;
      arr[o + 8] = wx * rad; arr[o + 9] = wy * rad; arr[o + 10] = wz * rad; arr[o + 11] = 0;
      arr[o + 12] = (ax + bx) / 2; arr[o + 13] = (ay + by) / 2; arr[o + 14] = (az + bz) / 2; arr[o + 15] = 1;
    }
    function setDot(arr, o, x, y, z, r) {
      for (let q = 0; q < 16; q++) arr[o + q] = 0;
      arr[o] = r; arr[o + 5] = r; arr[o + 10] = r; arr[o + 12] = x; arr[o + 13] = y; arr[o + 14] = z; arr[o + 15] = 1;
    }
    function updateTrack(g) {
      const i = g.track;
      if (!(H.state.show.track && i >= 0 && i < g.n)) { trail.count = 0; dots.count = 0; arrowG.visible = false; return; }
      const tp = g.trackPts, np = tp.length / 3 + 1; // 碰撞／撞牆點＋目前位置
      const start = Math.max(0, np - TR_MAX - 1);
      const span = Math.min(TR_MAX, np - 1);
      const ta = trail.instanceMatrix.array, tc = trail.instanceColor.array;
      const da = dots.instanceMatrix.array, dc = dots.instanceColor.array;
      let c = 0, cd = 0;
      const px = function (k) { return k < np - 1 ? tp[3 * k] : g.x[i]; };
      const py = function (k) { return k < np - 1 ? tp[3 * k + 1] : g.y[i]; };
      const pz = function (k) { return k < np - 1 ? tp[3 * k + 2] : g.z[i]; };
      for (let k = start; k < np - 1; k++) {
        const u = span > 0 ? (k + 1 - start) / span : 1; // 0 = 最舊，1 = 最新
        const rad = 0.06 + 0.1 * u;
        setSegment(ta, 16 * c, px(k), py(k), pz(k), px(k + 1), py(k + 1), pz(k + 1), rad);
        tmpC.copy(trailBg).lerp(trailText, 0.25 + 0.75 * u * u);
        tc[3 * c] = tmpC.r; tc[3 * c + 1] = tmpC.g; tc[3 * c + 2] = tmpC.b;
        c++;
        if (k > start || start === 0) {
          setDot(da, 16 * cd, px(k), py(k), pz(k), 0.1 + 0.11 * u);
          dc[3 * cd] = tmpC.r; dc[3 * cd + 1] = tmpC.g; dc[3 * cd + 2] = tmpC.b;
          cd++;
        }
      }
      trail.count = c; dots.count = cd;
      trail.instanceMatrix.needsUpdate = true; trail.instanceColor.needsUpdate = true;
      dots.instanceMatrix.needsUpdate = true; dots.instanceColor.needsUpdate = true;
      // 速度箭頭：長度 = 2 ps 內移動的距離（與 2D 相同）
      const vx = g.vx[i], vy = g.vy[i], vz = g.vz[i];
      const L = 2 * Math.sqrt(vx * vx + vy * vy + vz * vz);
      if (L > 0.3) {
        dirV.set(vx, vy, vz).normalize();
        arrowG.position.set(g.x[i], g.y[i], g.z[i]);
        arrowG.quaternion.setFromUnitVectors(up, dirV);
        const hl = Math.min(0.75, 0.4 * L), hr = Math.min(0.3, 0.32 * hl + 0.08);
        shaft.scale.set(0.1, L - hl * 0.92, 0.1);
        head.scale.set(hr, hl, hr);
        head.position.y = L - hl;
        arrowG.visible = true;
      } else arrowG.visible = false;
    }

    // ---------- 相機自動對焦 ----------
    function bounds() {
      return { x0: -rw - 1.6, x1: LX_MAX + rw + PT + ROD_L + KNOB_X + KNOB_R, y0: -2.2 - 0.6, y1: LY + rw + 1.2, z0: -rw - 1.6, z1: LZ + rw + 1.8 };
    }
    let fitKey = '';
    const fv = new THREE.Vector3(), fr = new THREE.Vector3(), fu = new THREE.Vector3(), fc = new THREE.Vector3(), fd = new THREE.Vector3();
    function fit(force) {
      const b = bounds();
      const key = [rw.toFixed(3), camera.aspect.toFixed(3)].join('|');
      if (!force && key === fitKey) return;
      fitKey = key;
      const center = fc.set((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
      const dir = force ? fd.copy(viewDir) : fd.copy(camera.position).sub(controls.target).normalize();
      const fwd = fv.copy(dir).negate();
      const right = fr.crossVectors(fwd, camera.up).normalize();
      if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
      const upv = fu.crossVectors(right, fwd).normalize();
      const tv = Math.tan(camera.fov * Math.PI / 360), th = tv * camera.aspect;
      let dist = 1;
      const corner = new THREE.Vector3();
      [b.x0, b.x1].forEach(function (X) {
        [b.y0, b.y1].forEach(function (Y) {
          [b.z0, b.z1].forEach(function (Z) {
            corner.set(X, Y, Z).sub(center);
            const depth = corner.dot(dir);
            dist = Math.max(dist, depth + Math.abs(corner.dot(right)) / th, depth + Math.abs(corner.dot(upv)) / tv);
          });
        });
      });
      dist *= 1.02;
      controls.target.copy(center);
      camera.position.copy(center).addScaledVector(dir, dist);
      camera.near = Math.max(0.3, dist / 300);
      camera.far = dist * 25;
      camera.updateProjectionMatrix();
      controls.update();
    }

    // ---------- 繪製 ----------
    let raf = 0;
    function renderNow() {
      if (!api.active || document.hidden) return;
      const want = wantPR();
      if (Math.abs(renderer.getPixelRatio() - want) > 1e-6) { renderer.setPixelRatio(want); resize3(); }
      const moved = controls.update();
      camera.updateMatrixWorld();
      const now = performance.now();
      if (!H.state.running && fe.n) updateFlashes(H.gas(), now); // 暫停時讓閃光淡出
      updateHud(now, false);
      updateTags();
      renderer.render(scene, camera);
      if (moved || (!H.state.running && fe.n)) requestRender(); // 阻尼慣性或閃光還在進行
    }
    function requestRender() {
      if (raf || !api.active) return;
      raf = requestAnimationFrame(function () {
        raf = 0;
        if (H.state.running) return; // 動畫進行中：下一幀由 ideal-gas.js 的迴圈呼叫 frame()
        renderNow();
      });
    }
    function canvasHeight(w) {
      // 與 2D 畫布相同的高度，切換時版面不跳動
      return w < 560 ? Math.round(Math.max(310, w * 0.9)) : Math.round(Math.min(520, Math.max(380, w * 0.58)));
    }
    function resize3() {
      const w = host.clientWidth;
      if (!w) return;
      const h = canvasHeight(w);
      if (canvas.style.height !== h + 'px') canvas.style.height = h + 'px';
      vw = w; vh = h;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      fit(false);
      updateHud(performance.now(), true);
      if (H.state.running) return;
      requestRender();
    }
    const ro = window.ResizeObserver ? new ResizeObserver(function () { if (host.clientWidth !== vw) resize3(); }) : null;
    if (ro) ro.observe(host); else window.addEventListener('resize', resize3);
    controls.addEventListener('change', requestRender);
    const onVisible = function () { if (!document.hidden) requestRender(); };
    document.addEventListener('visibilitychange', onVisible);
    canvas.addEventListener('webglcontextlost', function (ev) {
      ev.preventDefault();
      if (api.active) H.contextLost(); // 切回 2D 時自己釋放的環境不算
    });

    // 太慢時降低解析度（只往下調，最低 1 倍）
    let lastFrameAt = 0, slowEma = 16, slowFrames = 0;
    function watchSpeed(now) {
      if (lastFrameAt && H.state.running) {
        const dt = now - lastFrameAt;
        if (dt < 200) {
          slowEma += 0.05 * (dt - slowEma);
          if (slowEma > 26 && prCap > 1 && (window.devicePixelRatio || 1) > 1) {
            if (++slowFrames > 90) { prCap = Math.max(1, Math.min(prCap, window.devicePixelRatio || 1) - 0.25); slowFrames = 0; slowEma = 16; }
          } else slowFrames = 0;
        }
      }
      lastFrameAt = now;
    }

    // ---------- 拖曳活塞、點選分子（在 OrbitControls 之前攔截） ----------
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let grabOff = 0, downX = 0, downY = 0, downT = 0, downId = -1;
    function setNdc(ev) {
      const r = canvas.getBoundingClientRect();
      ndc.set((ev.clientX - r.left) / r.width * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
    }
    function hitsPiston() {
      return raycaster.intersectObjects(pistonParts, false).length > 0;
    }
    /** 滑鼠／手指的射線上，最接近活塞軸線（y = LY/2、z = LZ/2，沿 x）的點的 x 座標 */
    function axisX() {
      const o = raycaster.ray.origin, d = raycaster.ray.direction;
      const w0x = -o.x, w0y = LY / 2 - o.y, w0z = LZ / 2 - o.z;
      const b = d.x, e = d.x * w0x + d.y * w0y + d.z * w0z;
      const den = 1 - b * b;
      if (den < 0.02) return NaN; // 視線幾乎沿著軸線
      return (b * e - w0x) / den;
    }
    function onDown(ev) {
      if (ev.button != null && ev.button !== 0 && ev.pointerType === 'mouse') return;
      downX = ev.clientX; downY = ev.clientY; downT = performance.now(); downId = ev.pointerId;
      camera.updateMatrixWorld();
      setNdc(ev);
      if (!hitsPiston()) return;
      if (H.pistonLocked()) return; // 等容、等壓：活塞不能拖，照常旋轉視角
      const x = axisX();
      if (!isFinite(x)) return;
      dragging = true;
      grabOff = x - H.gas().Lx;
      H.beginDrag(ev);
      try { canvas.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
      canvas.style.cursor = 'grabbing';
      ev.stopPropagation();
      ev.preventDefault();
      applyKnobLook();
      requestRender();
    }
    function onMove(ev) {
      if (dragging) {
        setNdc(ev);
        const x = axisX();
        if (isFinite(x)) H.dragTo(x - grabOff);
        ev.stopPropagation();
        return;
      }
      if (ev.buttons) return;
      camera.updateMatrixWorld();
      setNdc(ev);
      const over = hitsPiston() && H.canDrag();
      if (over !== hoverPiston) {
        hoverPiston = over;
        canvas.style.cursor = over ? 'grab' : '';
        applyKnobLook();
        requestRender();
      }
    }
    function onUp(ev) {
      if (dragging) {
        dragging = false;
        try { canvas.releasePointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
        canvas.style.cursor = hoverPiston ? 'grab' : '';
        applyKnobLook();
        H.endDrag();
        ev.stopPropagation();
        requestRender();
        return;
      }
      // 輕點（幾乎沒有移動）：選取最近的分子來追蹤
      if (ev.pointerId !== downId) return;
      const moved = Math.hypot(ev.clientX - downX, ev.clientY - downY);
      if (moved > 6 || performance.now() - downT > 600) return;
      const r = canvas.getBoundingClientRect();
      const px = ev.clientX - r.left, py = ev.clientY - r.top;
      const g = H.gas();
      camera.updateMatrixWorld();
      let best = -1, bd = ev.pointerType === 'touch' ? 18 : 12, bz = Infinity;
      for (let i = 0; i < g.n; i++) {
        const s = toScreen(g.x[i], g.y[i], g.z[i]);
        if (!s.ok) continue;
        const d = Math.hypot(s.x - px, s.y - py) - g.rad[i] * pxPerNm(s.d);
        if (d < bd - 0.5 || (d < bd + 0.5 && s.d < bz)) { bd = d; best = i; bz = s.d; }
      }
      if (best >= 0) H.follow(best);
    }
    host.addEventListener('pointerdown', onDown, true);
    host.addEventListener('pointermove', onMove, true);
    host.addEventListener('pointerup', onUp, true);
    host.addEventListener('pointercancel', onUp, true);

    const api = {
      active: true,
      /** 每一幀（動畫迴圈或需要重畫時）由 ideal-gas.js 呼叫 */
      frame: function () {
        if (!api.active) return;
        const now = performance.now();
        watchSpeed(now);
        update(now);
        renderNow();
      },
      onTheme: function () {
        applyColors();
        [tags.bath, tags.knob, tags.v].concat(tags.ruler).forEach(function (t) { t.w = 0; });
        updateHud(performance.now(), true);
        requestRender();
      },
      resetCamera: function () { fit(true); requestRender(); },
      dispose: function () {
        api.active = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize3);
        document.removeEventListener('visibilitychange', onVisible);
        host.removeEventListener('pointerdown', onDown, true);
        host.removeEventListener('pointermove', onMove, true);
        host.removeEventListener('pointerup', onUp, true);
        host.removeEventListener('pointercancel', onUp, true);
        controls.dispose();
        const mats = new Set();
        scene.traverse(function (o) {
          if (o.geometry) o.geometry.dispose();
          if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { mats.add(m); });
        });
        [molMat, glassMat, edgeMat, steelMat, slabMat, sealMat, knobMat, pinMat, bathMat, insMat, shadowFloorMat, glowMat, glowMat2, contactMat, tickMat, markMat, trailMat, arrowMat, flMat]
          .forEach(function (m) { mats.add(m); });
        mats.forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); });
        stripeTex.dispose(); contactTex.dispose();
        envRT.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        canvas.remove();
        ov.remove();
      }
    };

    // ---------- 初始化 ----------
    applyColors();
    buildStatic();
    const w0 = host.clientWidth;
    if (w0) {
      const h0 = canvasHeight(w0);
      canvas.style.height = h0 + 'px';
      vw = w0; vh = h0;
      renderer.setSize(w0, h0, false);
      camera.aspect = w0 / h0;
      camera.updateProjectionMatrix();
    }
    fit(true);
    return api;
  }

  window.IdealGas3D = { create: create };
})();
