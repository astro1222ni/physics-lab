/* microwave-3d.js — 「認識電磁波（微波實驗）」的 3D 立體檢視（three.js 由 microwave.js 以 import() 延遲載入後傳進來）
 *
 * 用法：const v = Microwave3D.create({ THREE, OrbitControls }, host, bridge)
 *   host    放畫布的元素（#view3）
 *   bridge  { st（2D 頁面的狀態，直接讀）, C（MicrowaveCore）, T, lamNow, nNow, tiltNow, hpbwNow, polarP, gridX, reading, omega, reduced, lost }
 * 回傳 { active, frame(t), onMode(), onTheme(), resetCamera(), dispose() }
 *
 * 座標與 2D 俯視圖相同（cm）：x、y 在桌面上，z 向上；喇叭的軸在桌面上方 ZB 處。
 * 沿著光束的箭頭是電場 E（與 2D 用同一套物理計算，放慢約一百億倍）：發射器的電場鉛直；偏振實驗中箭頭的方向跟著偏極柵改變。
 */
(function () {
  'use strict';

  function create(lib, host, B) {
    const THREE = lib.THREE, C = B.C, T = B.T, st = B.st, K = C.KIT, D = window.LabDraw, DEG = Math.PI / 180;
    const ZB = 14;                 // 喇叭軸（光束）離桌面的高度
    const NMAX = 320;              // 電場箭頭的最多數量
    const GR = 10.5;               // 偏極柵圓框的半徑

    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', T('微波實驗台的 3D 立體檢視：發射器、接收器、角度計或光具座、金屬板、稜鏡或偏極柵，以及沿著光束的電場箭頭（可拖曳旋轉、縮放）',
      '3D view of the microwave bench: transmitter, receiver, goniometer or optical bench, metal plate, prism or grids, and arrows for the electric field along the beam (drag to rotate, pinch or scroll to zoom)'));
    host.appendChild(canvas);
    const meterDiv = document.createElement('div');
    meterDiv.className = 'meter3';
    meterDiv.setAttribute('aria-live', 'off');
    host.appendChild(meterDiv);
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    } catch (e) { canvas.remove(); meterDiv.remove(); throw e; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1.6, 1, 4000);
    camera.up.set(0, 0, 1); // z 朝上；必須在建立 OrbitControls 之前設定
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.minDistance = 20;
    controls.maxDistance = 600;
    controls.maxPolarAngle = Math.PI * 0.495;

    // ---- 環境反射：簡單的攝影棚（柔光板），讓金屬有反光 ----
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(new THREE.BoxGeometry(100, 100, 100), new THREE.MeshBasicMaterial({ color: 0x737d83, side: THREE.BackSide })));
    [[0, 0, 48, 70, 70, 2.6], [-48, 0, 20, 40, 50, 1.4], [48, 10, 10, 30, 40, 1.1], [0, -48, 15, 60, 24, 1.0], [0, 48, 15, 60, 24, 0.9]].forEach(function (p) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(p[3], p[4]), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(p[5]), side: THREE.DoubleSide }));
      m.position.set(p[0], p[1], p[2]); m.lookAt(0, 0, 0); envScene.add(m);
    });
    const envRT = pmrem.fromScene(envScene, 0.04);
    scene.environment = envRT.texture;
    envScene.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    pmrem.dispose();

    // ---- 燈光 ----
    const hemi = new THREE.HemisphereLight(0xeef4ff, 0x30383c, 1.0);
    hemi.position.set(0, 0, 1);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff6ea, 1.7);
    sun.position.set(30, -45, 120);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.radius = 4;
    sun.shadow.bias = -0.0006;
    const sc = sun.shadow.camera;
    sc.left = -80; sc.right = 80; sc.bottom = -80; sc.top = 80; sc.near = 20; sc.far = 300;
    scene.add(sun); scene.add(sun.target);
    const fill = new THREE.DirectionalLight(0xd6e4ff, 0.5);
    fill.position.set(-60, 50, 40);
    scene.add(fill);

    // ---- 小工具 ----
    const owned = [];           // 整個 3D 檢視共用的資源（關閉時釋放）
    let bag = owned;            // 目前收集資源的清單：建立各實驗的器材時換成 modeOwned，換實驗時整批釋放
    function own(x) { bag.push(x); return x; }
    function col(c) { return new THREE.Color(c || '#888888'); }   // CSS 顏色（sRGB）→ three 的線性色彩（自動轉換）
    function std(color, metal, rough, extra) { return own(new THREE.MeshStandardMaterial(Object.assign({ color: col(color), metalness: metal, roughness: rough }, extra || {}))); }
    function mesh(geo, mat, cast, recv) { const m = new THREE.Mesh(own(geo), mat); m.castShadow = cast !== false; m.receiveShadow = recv !== false; return m; }
    function canvasTex(c) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); return own(t); }
    const tok = function (k) { return D.c[k]; };
    function metalCol() { return D.mix(D.c.muted, '#ffffff', 0.45); }

    /** 文字標籤（Sprite，固定在螢幕上的大小） */
    function label(text, color, pos) {
      const c = document.createElement('canvas'), g = c.getContext('2d'), px = 52;
      const f = '600 ' + px + 'px system-ui, -apple-system, "Segoe UI", "Noto Sans TC", sans-serif';
      g.font = f;
      const w = Math.ceil(g.measureText(text).width) + 40, h = Math.ceil(px * 1.5);
      c.width = w; c.height = h; g.font = f;
      const r = h * 0.45;
      g.beginPath(); g.moveTo(r, 2); g.arcTo(w - 2, 2, w - 2, h - 2, r); g.arcTo(w - 2, h - 2, 2, h - 2, r); g.arcTo(2, h - 2, 2, 2, r); g.arcTo(2, 2, w - 2, 2, r); g.closePath();
      g.fillStyle = D.alpha(D.c['canvas-bg'], 0.86); g.fill();
      g.lineWidth = 3; g.strokeStyle = D.alpha(color, 0.6); g.stroke();
      g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 2);
      const sp = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: canvasTex(c), transparent: true, depthWrite: false, depthTest: false, sizeAttenuation: false })));
      const size = 0.05;
      sp.scale.set(size * w / h, size, 1);
      sp.center.set(0.5, 0);
      sp.renderOrder = 10;
      sp.position.copy(pos);
      return sp;
    }

    // ---- 喇叭（金屬錐形開口＋振盪器盒＋支柱）----
    function hornGeometry() {
      const L = K.hornLen, tw = 1.25, th = 0.55, mw = K.mouthW / 2, mh = K.mouthH / 2;
      const v = [[-L, -tw, -th], [-L, tw, -th], [-L, tw, th], [-L, -tw, th], [0, -mw, -mh], [0, mw, -mh], [0, mw, mh], [0, -mw, mh]];
      const quads = [[0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
      const pos = [];
      quads.forEach(function (q) { [q[0], q[1], q[2], q[0], q[2], q[3]].forEach(function (i) { pos.push(v[i][0], v[i][1], v[i][2]); }); });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.computeVertexNormals();
      return g;
    }
    function horn(kind, postH) {
      const grp = new THREE.Group();
      const body = kind === 'tx' ? tok('equi') : tok('neg');
      const hm = mesh(hornGeometry(), std(metalCol(), 0.65, 0.32, { side: THREE.DoubleSide }));
      grp.add(hm);
      const box = mesh(new THREE.BoxGeometry(K.boxL, K.boxW, K.boxH), std(D.mix(body, '#ffffff', 0.08), 0.15, 0.45));
      box.position.set(-K.hornLen - K.boxL / 2, 0, 0);
      grp.add(box);
      // 波導管接頭
      const wg = mesh(new THREE.BoxGeometry(1.2, 2.6, 1.3), std(metalCol(), 0.8, 0.35));
      wg.position.set(-K.hornLen - 0.4, 0, 0);
      grp.add(wg);
      if (kind === 'tx') {
        const led = mesh(new THREE.SphereGeometry(0.45, 16, 12), own(new THREE.MeshBasicMaterial({ color: col(tok('pos')), toneMapped: false })), false, false);
        led.position.set(-K.hornLen - K.boxL * 0.75, 0, K.boxH / 2 + 0.05);
        grp.add(led);
      } else {
        const knob = mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.8, 20), std('#30363a', 0.3, 0.5));
        knob.rotation.x = Math.PI / 2; knob.position.set(-K.hornLen - K.boxL * 0.7, 0, K.boxH / 2 + 0.4);
        grp.add(knob);
      }
      // 支柱
      const pz = postH;
      const post = mesh(new THREE.CylinderGeometry(0.55, 0.55, pz, 16), std(metalCol(), 0.8, 0.35));
      post.rotation.x = Math.PI / 2; post.position.set(-K.hornLen - K.boxL / 2, 0, -K.boxH / 2 - pz / 2);
      grp.add(post);
      const foot = mesh(new THREE.CylinderGeometry(2.2, 2.6, 0.8, 24), std('#3b4246', 0.4, 0.5));
      foot.rotation.x = Math.PI / 2; foot.position.set(-K.hornLen - K.boxL / 2, 0, -K.boxH / 2 - pz + 0.4);
      grp.add(foot);
      return grp;
    }
    /** 鋁軌（角度計的臂或光具座），從原點沿 +x 長 len */
    function rail(len, w, start) {
      const g = new THREE.BoxGeometry(len, w, 1.2);
      g.translate((start || 0) + len / 2, 0, 0.6);
      return mesh(g, std(metalCol(), 0.75, 0.38));
    }
    function goniometerTop() {
      const c = document.createElement('canvas'); c.width = c.height = 512;
      const g = c.getContext('2d'), R = 250, cx = 256, cy = 256;
      g.fillStyle = D.mix(D.c.surface, D.c.text, D.dark ? 0.12 : 0.06); g.beginPath(); g.arc(cx, cy, R, 0, 2 * Math.PI); g.fill();
      g.strokeStyle = D.alpha(D.c.text, 0.75); g.lineWidth = 3; g.stroke();
      g.beginPath();
      for (let p = 0; p <= 180; p += 5) {
        const a = (180 - p) * DEG, L = p % 30 === 0 ? 34 : p % 10 === 0 ? 22 : 12;
        g.moveTo(cx + (R - L) * Math.cos(a), cy - (R - L) * Math.sin(a)); g.lineTo(cx + R * Math.cos(a), cy - R * Math.sin(a));
      }
      g.lineWidth = 3; g.stroke();
      g.fillStyle = D.c.text; g.font = '700 34px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      for (let p = 0; p <= 180; p += 30) { const a = (180 - p) * DEG; g.fillText(String(p), cx + (R - 62) * Math.cos(a), cy - (R - 62) * Math.sin(a)); }
      return canvasTex(c);
    }
    function plate() {
      const grp = new THREE.Group();
      const pm = mesh(new THREE.BoxGeometry(0.3, K.plateW, K.plateH), std('#e9edf0', 0.7, 0.3));
      pm.position.z = 1.2 + K.plateH / 2;
      grp.add(pm);
      const hold = mesh(new THREE.BoxGeometry(2.6, 4, 2.4), std('#3b4246', 0.4, 0.5));
      hold.position.z = 1.2 + 1.2;
      grp.add(hold);
      return grp;
    }
    function gridObj(ang) {
      const grp = new THREE.Group(), R = GR;
      const ring = mesh(new THREE.TorusGeometry(R, 0.45, 12, 64), std(metalCol(), 0.8, 0.35));
      ring.rotation.y = Math.PI / 2;                     // 圓環在 yz 平面（垂直於光束）
      grp.add(ring);
      const strips = new THREE.Group();
      const sm = std('#cfd5d8', 0.9, 0.28);
      for (let j = -6; j <= 6; j++) {
        const o = j * 1.75, L = 2 * Math.sqrt(Math.max(0, R * R - o * o)) - 0.3;
        if (L < 1) continue;
        const s = mesh(new THREE.BoxGeometry(0.15, L, 0.9), sm);   // 金屬條沿 y（水平）
        s.position.set(0, 0, o);
        strips.add(s);
      }
      strips.rotation.x = -ang * DEG;                     // 隙縫與水平夾 ang（沿著光束看過去逆時針；見 dirHV）
      grp.add(strips);
      const post = mesh(new THREE.CylinderGeometry(0.5, 0.5, ZB - R - 1.2, 12), std(metalCol(), 0.8, 0.35));
      post.rotation.x = Math.PI / 2; post.position.set(0, 0, -R - (ZB - R - 1.2) / 2);
      grp.add(post);
      grp.userData.strips = strips;
      return grp;
    }

    // ---- 地板：只畫影子＋淡淡的格線 ----
    const floor = mesh(new THREE.PlaneGeometry(400, 400), own(new THREE.ShadowMaterial({ opacity: 0.22, depthWrite: false })), false, true);
    floor.position.z = -0.02;
    scene.add(floor);
    let gridHelper = null;
    function buildFloorGrid() {
      if (gridHelper) { scene.remove(gridHelper); gridHelper.geometry.dispose(); gridHelper.material.dispose(); }
      gridHelper = new THREE.GridHelper(200, 20, col(D.c.text), col(D.c.text));
      gridHelper.rotation.x = Math.PI / 2;
      gridHelper.material.transparent = true; gridHelper.material.opacity = D.dark ? 0.1 : 0.08; gridHelper.material.depthWrite = false;
      gridHelper.position.set(st.mode === 'standing' || st.mode === 'polar' ? 35 : 0, st.mode === 'standing' || st.mode === 'polar' ? 0 : 10, 0);
      scene.add(gridHelper);
    }

    // ---- 電場箭頭（InstancedMesh：桿＋箭頭） ----
    const shaftGeo = own(new THREE.CylinderGeometry(0.16, 0.16, 1, 8)); shaftGeo.translate(0, 0.5, 0);
    const headGeo = own(new THREE.ConeGeometry(0.42, 1.1, 14)); headGeo.translate(0, 0.55, 0);
    const arrowMat = own(new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.1, roughness: 0.45 }));
    const shafts = new THREE.InstancedMesh(shaftGeo, arrowMat, NMAX), heads = new THREE.InstancedMesh(headGeo, arrowMat, NMAX);
    shafts.castShadow = heads.castShadow = false;
    shafts.frustumCulled = heads.frustumCulled = false;
    scene.add(shafts); scene.add(heads);
    const posC = new THREE.Color(), negC = new THREE.Color();
    // 光束中心線
    const axisMat = own(new THREE.LineDashedMaterial({ color: 0x888888, dashSize: 1.2, gapSize: 0.9, transparent: true, opacity: 0.6 }));
    let axisLine = null;
    // 偏振面（只在偏振實驗）：含光束與電場方向的半透明平面
    const planeMat = own(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false }));
    const planeGeo = own(new THREE.PlaneGeometry(1, 1));
    const pplanes = [0, 1, 2].map(function () { const m = new THREE.Mesh(planeGeo, planeMat); m.visible = false; m.renderOrder = 2; scene.add(m); return m; });
    function arrowColors() {
      posC.set(col(tok('pos'))); negC.set(col(tok('neg')));
      axisMat.color.set(col(tok('muted')));
      planeMat.color.set(col(tok('pos'))); planeMat.opacity = D.dark ? 0.16 : 0.13;
    }
    arrowColors();
    for (let i = 0; i < NMAX; i++) { shafts.setColorAt(i, posC); heads.setColorAt(i, posC); }

    // ---- 依實驗建立的器材 ----
    let modeGrp = null, dyn = {}, modeOwned = [], builtKey = '';
    function freeMode() {
      if (modeGrp) scene.remove(modeGrp);
      modeOwned.forEach(function (o) { if (o && o.dispose) o.dispose(); });
      modeOwned = [];
      modeGrp = null;
    }
    function buildMode() {
      freeMode();
      bag = modeOwned;
      try { buildModeInner(); } finally { bag = owned; }
      builtKey = st.mode + '|' + st.mat;
      scene.add(modeGrp);
      buildFloorGrid();
      pathKey = '';
    }
    function buildModeInner() {
      modeGrp = new THREE.Group();
      dyn = {};
      const m = st.mode;
      const postH = ZB - K.boxH / 2 - 1.2;
      if (m === 'reflect' || m === 'refract') {
        const disc = mesh(new THREE.CylinderGeometry(12, 12, 0.8, 72), std(D.mix(D.c.surface, D.c.text, 0.08), 0.1, 0.6));
        disc.rotation.x = Math.PI / 2; disc.position.z = 0.4;
        modeGrp.add(disc);
        const top = mesh(new THREE.PlaneGeometry(24, 24), own(new THREE.MeshStandardMaterial({ map: goniometerTop(), transparent: true, roughness: 0.7, metalness: 0 })), false, true);
        top.position.z = 0.82;
        modeGrp.add(top);
        const turn = mesh(new THREE.CylinderGeometry(6.6, 6.6, 0.5, 48), std(metalCol(), 0.7, 0.35));
        turn.rotation.x = Math.PI / 2; turn.position.z = 1.05;
        modeGrp.add(turn);
        const fixedArm = rail(46, 3, 0);
        fixedArm.rotation.z = Math.PI;
        modeGrp.add(fixedArm);
        const arm = new THREE.Group();
        arm.add(rail(46, 3, 0));
        const rx = horn('rx', postH);
        rx.position.set(K.arm - K.pc, 0, ZB); rx.rotation.z = Math.PI;
        arm.add(rx);
        modeGrp.add(arm);
        dyn.arm = arm;
        const tx = horn('tx', postH);
        modeGrp.add(tx);
        dyn.tx = tx;
        if (m === 'reflect') {
          const p = plate();
          modeGrp.add(p);
          dyn.plate = p;
        } else {
          const g = C.refractGeom(K.prismA), shape = new THREE.Shape();
          shape.moveTo(g.pts[0].x, g.pts[0].y); shape.lineTo(g.pts[1].x, g.pts[1].y); shape.lineTo(g.pts[2].x, g.pts[2].y); shape.closePath();
          const pg = new THREE.ExtrudeGeometry(shape, { depth: 20, bevelEnabled: false });
          const mc = st.mat === 'paraffin' ? D.mix(tok('equi'), '#ffffff', 0.7) : st.mat === 'unknown' ? D.mix(tok('muted'), '#ffffff', 0.55) : D.mix(tok('neg'), '#ffffff', 0.8);
          const prism = mesh(pg, own(new THREE.MeshPhysicalMaterial({ color: col(mc), roughness: 0.35, metalness: 0, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, clearcoat: 0.6 })), true, false);
          prism.position.z = 1.3;
          prism.renderOrder = 3;
          modeGrp.add(prism);
          const edges = new THREE.LineSegments(own(new THREE.EdgesGeometry(pg)), own(new THREE.LineBasicMaterial({ color: col(D.mix(mc, '#000000', 0.35)), transparent: true, opacity: 0.8 })));
          edges.position.z = 1.3;
          modeGrp.add(edges);
          dyn.prism = prism;
          modeGrp.add(label(T('稜鏡', 'Prism'), tok('muted'), new THREE.Vector3(2, -8, 23)));
        }
        dyn.txLab = label(T('發射器', 'Transmitter'), tok('equi'), new THREE.Vector3(0, 0, ZB + K.boxH / 2 + 1));
        dyn.rxLab = label(T('接收器', 'Receiver'), tok('neg'), new THREE.Vector3(0, 0, ZB + K.boxH / 2 + 1));
        modeGrp.add(dyn.txLab); modeGrp.add(dyn.rxLab);
      } else {
        const x0 = m === 'standing' ? -12 : -22, x1 = m === 'standing' ? 79 : 93;
        const r = rail(x1 - x0, 3.2, x0);
        modeGrp.add(r);
        const ruler = mesh(new THREE.BoxGeometry(m === 'standing' ? 80 : 112, 2, 0.3), std(D.mix(tok('equi'), '#ffffff', 0.7), 0, 0.7));
        ruler.position.set(m === 'standing' ? 40 : 36, -3, 0.15);
        modeGrp.add(ruler);
        const tx = horn('tx', postH);
        tx.position.set(m === 'standing' ? K.txS : 0, 0, ZB);
        modeGrp.add(tx);
        dyn.tx = tx;
        modeGrp.add(label(T('發射器', 'Transmitter'), tok('equi'), new THREE.Vector3((m === 'standing' ? K.txS : 0) - K.hornLen - K.boxL / 2, 0, ZB + K.boxH / 2 + 1)));
        if (m === 'standing') {
          const p = plate();
          p.position.x = K.plateS + 0.15;
          modeGrp.add(p);
          modeGrp.add(label(T('金屬反射板', 'Metal reflector'), tok('muted'), new THREE.Vector3(K.plateS, 0, K.plateH + 2.5)));
          const probe = new THREE.Group();
          const pm = std(tok('probe'), 0.2, 0.4), rod = std(metalCol(), 0.8, 0.35);
          const car = mesh(new THREE.BoxGeometry(3, 4.4, 1.6), pm); car.position.set(0, 0, 2); probe.add(car);
          const post = mesh(new THREE.CylinderGeometry(0.3, 0.3, ZB - 3.2, 12), std('#d9d2c3', 0, 0.6)); post.rotation.x = Math.PI / 2; post.position.set(0, 0, 2.8 + (ZB - 3.2) / 2); probe.add(post);  // 塑膠支架（不影響電場）
          const dip = mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.8, 10), rod); dip.rotation.x = Math.PI / 2; dip.position.set(0, 0, ZB); probe.add(dip);
          const diode = mesh(new THREE.SphereGeometry(0.42, 16, 12), pm); diode.position.set(0, 0, ZB); probe.add(diode);
          modeGrp.add(probe);
          dyn.probe = probe;
          dyn.probeLab = label(T('探針', 'Probe'), tok('probe'), new THREE.Vector3(0, 0, ZB + 6));
          modeGrp.add(dyn.probeLab);
        } else {
          const rx = horn('rx', postH);
          rx.rotation.z = Math.PI;
          modeGrp.add(rx);
          dyn.rx = rx;
          dyn.rxLab = label(T('接收器', 'Receiver'), tok('neg'), new THREE.Vector3(0, 0, ZB + K.boxH / 2 + 1));
          modeGrp.add(dyn.rxLab);
          dyn.g1 = gridObj(0); dyn.g2 = gridObj(0);
          modeGrp.add(dyn.g1); modeGrp.add(dyn.g2);
          dyn.g1Lab = label(T('柵 1', 'Grid 1'), tok('text'), new THREE.Vector3(0, 0, ZB + GR + 1.5));
          dyn.g2Lab = label(T('柵 2', 'Grid 2'), tok('text'), new THREE.Vector3(0, 0, ZB + GR + 1.5));
          modeGrp.add(dyn.g1Lab); modeGrp.add(dyn.g2Lab);
        }
      }
    }

    // ---- 沿光束的電場（複數振幅；每一幀只換相位） ----
    let path = [], pathKey = '';
    /** 核心的橫向座標 [h, v] 是「沿著光束（+x）看過去」的右方與上方；右方 = −y，上方 = +z */
    function dirHV(h, v) { return [0, -h, v]; }
    function computePath() {
      const lam = B.lamNow(), k = 2 * Math.PI / lam, m = st.mode, tilt = B.tiltNow(), out = [];
      const step = lam / 6;
      const up = [0, 0, 1];
      let key;
      if (m === 'reflect') {
        key = ['R', lam, st.thetaI, st.plate, tilt].join('|');
        if (key === pathKey) return;
        const g = C.reflectGeom({ thetaI: st.thetaI, psi: st.psiR, plate: st.plate, tilt: tilt, hpbw: B.hpbwNow() });
        const scn = { lam: lam, tx: g.tx, plate: g.plate }, pp = g.plate ? C.platePrep(scn) : null;
        for (let x = -K.arm + K.pc + 0.4; x <= -0.4; x += step) { const e = C.field(scn, x, 0, pp); out.push({ x: x, y: 0, re: e[0], im: e[1], d: up }); }
        const a = st.plate ? (180 - 2 * st.thetaI) * DEG : 0;
        for (let r = 0.4; r <= K.arm - K.pc - 0.4; r += step) { const x = r * Math.cos(a), y = r * Math.sin(a), e = C.field(scn, x, y, pp); out.push({ x: x, y: y, re: e[0], im: e[1], d: up }); }
        out.ref = 1 / 26;
      } else if (m === 'refract') {
        const n = B.nNow();
        key = ['P', lam, n, tilt].join('|');
        if (key === pathKey) return;
        const gm = C.refractGeom(K.prismA), pa = C.prismAperture({ n: n, A: K.prismA, lam: lam, tilt: tilt }), t1 = 2 / (1 + n);
        for (let x = gm.xF + 0.2; x <= -0.2; x += step / n) { const ph = n * k * (x - gm.xF); out.push({ x: x, y: 0, re: t1 * Math.cos(ph), im: t1 * Math.sin(ph), d: up }); }
        const dl = C.deviation(n, K.prismA);
        if (pa && isFinite(dl)) {
          const a = dl * DEG, pre = Math.SQRT1_2 * Math.sqrt(1 / lam);
          for (let r = 0.4; r <= K.arm - K.pc - 0.4; r += step) {
            const x = r * Math.cos(a), y = r * Math.sin(a), e = C.prismField(pa, x, y);
            out.push({ x: x, y: y, re: pre * (e[0] + e[1]), im: pre * (e[1] - e[0]), d: up });
          }
        }
        out.ref = 0.62;
      } else if (m === 'standing') {
        key = ['S', lam, tilt].join('|');
        if (key === pathKey) return;
        const p = { lam: lam, tilt: tilt, hpbw: B.hpbwNow() }, scn = C.standingScene(p), pp = C.platePrep(scn);
        for (let x = K.txS + 0.3; x <= K.plateS - 0.2; x += lam / 8) { const e = C.field(scn, x, 0, pp); out.push({ x: x, y: 0, re: e[0], im: e[1], d: up }); }
        out.ref = 1 / 32;
      } else {
        const pr = B.polarP(), ch = C.polarSignal(pr).chain;
        key = ['G', lam, st.d, st.g1on, st.g1, st.g2on, st.g2, pr.leak].join('|');
        if (key === pathKey) return;
        const xg1 = B.gridX(1), xg2 = B.gridX(2);
        for (let x = 0.4; x <= st.d - 0.3; x += step) {
          const E = x < xg1 ? ch[0] : x < xg2 ? ch[1] : ch[2], mg = Math.hypot(E[0], E[1]);
          const r = x + K.pc, a = mg / r;
          out.push({ x: x, y: 0, re: a * Math.cos(k * r), im: a * Math.sin(k * r), d: mg > 1e-9 ? dirHV(E[0] / mg, E[1] / mg) : up });
        }
        out.ref = 1 / 26;
        out.chain = ch;
      }
      path = out; pathKey = key;
      if (axisLine) { scene.remove(axisLine); axisLine.geometry.dispose(); axisLine = null; }
      if (out.length > 1) {
        const pts = [];
        // 中心線分兩段（入射、出射）
        let prev = null;
        out.forEach(function (p) { if (!prev || Math.hypot(p.x - prev.x, p.y - prev.y) < 1.5) pts.push(new THREE.Vector3(p.x, p.y, ZB)); prev = p; });
        axisLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), axisMat);
        axisLine.computeLineDistances();
        scene.add(axisLine);
      }
    }
    const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
    function updateArrows(t) {
      computePath();
      const c = Math.cos(B.omega * t), s = Math.sin(B.omega * t), g = 1.7 / (path.ref || 1), Lmax = 4.6, HL = 1.1;
      const n = Math.min(NMAX, path.length);
      for (let i = 0; i < n; i++) {
        const p = path[i];
        let v = (p.re * c + p.im * s) * g;
        v = v / (1 + Math.abs(v));
        const L = Math.abs(v) * Lmax, sg = v >= 0 ? 1 : -1;
        v3.set(p.d[0] * sg, p.d[1] * sg, p.d[2] * sg);
        q4.setFromUnitVectors(Y, v3);
        const sl = Math.max(0.001, L - HL), hs = L < HL ? Math.max(0.001, L / HL) : 1;
        m4.compose(s3.set(p.x, p.y, ZB), q4, new THREE.Vector3(1, sl, 1));
        shafts.setMatrixAt(i, m4);
        m4.compose(s3.set(p.x + v3.x * sl, p.y + v3.y * sl, ZB + v3.z * sl), q4, new THREE.Vector3(hs, hs, hs));
        heads.setMatrixAt(i, m4);
        const cc = sg > 0 ? posC : negC;
        shafts.setColorAt(i, cc); heads.setColorAt(i, cc);
      }
      shafts.count = heads.count = n;
      shafts.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = true;
      if (shafts.instanceColor) shafts.instanceColor.needsUpdate = true;
      if (heads.instanceColor) heads.instanceColor.needsUpdate = true;
      // 偏振面
      const pol = st.mode === 'polar' && path.chain;
      pplanes.forEach(function (pl, j) {
        if (!pol) { pl.visible = false; return; }
        const xa = [0, B.gridX(1), B.gridX(2), st.d][j], xb = [0, B.gridX(1), B.gridX(2), st.d][j + 1], E = path.chain[j], mg = Math.hypot(E[0], E[1]);
        if (mg < 0.02) { pl.visible = false; return; }
        pl.visible = true;
        pl.position.set((xa + xb) / 2, 0, ZB);
        const dv = dirHV(E[0], E[1]);
        pl.rotation.set(Math.atan2(dv[2], dv[1]), 0, 0); // 平面含光束（x 軸）與電場方向
        pl.scale.set(xb - xa, 2 * Lmax * 0.75 * Math.min(1, mg + 0.15), 1);
      });
    }

    // ---- 每一幀：跟著 2D 的狀態擺好器材 ----
    function updateDynamic() {
      const m = st.mode;
      if (m === 'reflect' || m === 'refract') {
        const psi = m === 'reflect' ? st.psiR : st.psiP;
        dyn.arm.rotation.z = (180 - psi) * DEG;
        const tilt = B.tiltNow() * DEG;
        const mx = m === 'reflect' ? -K.arm + K.pc : C.refractGeom(K.prismA).xF;
        dyn.tx.position.set(mx, 0, ZB); dyn.tx.rotation.z = tilt;
        if (dyn.plate) { dyn.plate.visible = st.plate; dyn.plate.rotation.z = Math.atan2(Math.sin(st.thetaI * DEG), -Math.cos(st.thetaI * DEG)); }
        const a = (180 - psi) * DEG, rr = K.arm + K.boxL + 5;
        dyn.rxLab.position.set(rr * Math.cos(a), rr * Math.sin(a), ZB + K.boxH / 2 + 1);
        dyn.txLab.position.set(mx - K.hornLen - K.boxL / 2, 0, ZB + K.boxH / 2 + 1);
      } else if (m === 'standing') {
        dyn.probe.position.x = st.s;
        dyn.probeLab.position.set(st.s, 0, ZB + 6);
        dyn.tx.rotation.z = B.tiltNow() * DEG;
      } else {
        dyn.rx.position.set(st.d, 0, ZB);
        dyn.rx.rotation.set(-st.rx * DEG, 0, Math.PI);  // 接收器繞自己的軸轉 ρ
        dyn.rxLab.position.set(st.d + K.hornLen + K.boxL / 2, 0, ZB + K.boxH / 2 + 1);
        [[dyn.g1, dyn.g1Lab, st.g1on, st.g1, 1], [dyn.g2, dyn.g2Lab, st.g2on, st.g2, 2]].forEach(function (gg) {
          gg[0].visible = gg[1].visible = gg[2];
          const x = B.gridX(gg[4]);
          gg[0].position.set(x, 0, ZB); gg[0].userData.strips.rotation.x = -gg[3] * DEG;   // 與 gridObj 相同的轉向
          gg[1].position.set(x, 0, ZB + GR + 1.5);
        });
      }
    }

    // ---- 相機：依器材的範圍自動找距離，讓整組器材剛好放得進畫面（手機直式也一樣） ----
    function fitPoints() {
      const m = st.mode, P = [], top = ZB + K.boxH / 2 + 4;
      const add = function (x, y, z0, z1) { P.push(new THREE.Vector3(x, y, z0), new THREE.Vector3(x, y, z1)); };
      if (m === 'reflect' || m === 'refract') {
        const psi = m === 'reflect' ? st.psiR : st.psiP, a = (180 - psi) * DEG, rb = K.arm - K.pc + K.hornLen + K.boxL;
        const tb = m === 'reflect' ? -rb : C.refractGeom(K.prismA).xF - K.hornLen - K.boxL;
        add(tb, -K.boxW / 2, 0, top); add(tb, K.boxW / 2, 0, top);
        add(rb * Math.cos(a), rb * Math.sin(a), 0, top);
        add(46 * Math.cos(a), 46 * Math.sin(a), 0, 1.2); add(-46, 0, 0, 1.2);             // 兩支臂的末端
        add(-12, -12, 0, 1); add(12, 12, 0, 1);
        if (m === 'reflect' && st.plate) {
          const ux = Math.sin(st.thetaI * DEG), uy = Math.cos(st.thetaI * DEG), hw = K.plateW / 2;   // 板面的水平方向
          add(hw * ux, hw * uy, 0, K.plateH + 1.2); add(-hw * ux, -hw * uy, 0, K.plateH + 1.2);
        } else add(0, 0, 0, 22);
      } else if (m === 'standing') {
        add(K.txS - K.hornLen - K.boxL, 0, 0, top); add(K.plateS, -K.plateW / 2, 0, K.plateH + 4); add(K.plateS, K.plateW / 2, 0, K.plateH + 1.2);
        add(-12, -3, 0, 1); add(79, 3, 0, 1);
      } else {
        add(-K.hornLen - K.boxL, 0, 0, top); add(st.d + K.hornLen + K.boxL, 0, 0, top);
        add(B.gridX(1), -GR, 0, ZB + GR + 4); add(B.gridX(2), GR, 0, ZB + GR + 4);
        add(-22, -3, 0, 1); add(st.d + 23, 3, 0, 1);
      }
      return P;
    }
    function fit(reset) {
      const w = canvas.clientWidth || 600, h = canvas.clientHeight || 400, asp = w / h, narrow = asp < 1.2;
      const m = st.mode;
      let dir;
      if (m === 'reflect') dir = new THREE.Vector3(-0.45, 0.62, 0.95);          // 從金屬板反射面的那一側斜上方看
      else if (m === 'refract') dir = new THREE.Vector3(0.2, -0.95, 0.95);
      else if (m === 'standing') dir = narrow ? new THREE.Vector3(-0.55, -1, 0.7) : new THREE.Vector3(0.12, -1, 0.62);
      else dir = narrow ? new THREE.Vector3(-0.95, -0.85, 0.55) : new THREE.Vector3(-0.75, -0.95, 0.5);   // 斜斜地順著光束看，看得到柵的正面
      dir.normalize();
      camera.aspect = asp;
      camera.updateProjectionMatrix();
      if (reset) {
        const pts = fitPoints(), c = new THREE.Box3().setFromPoints(pts).getCenter(new THREE.Vector3()), v = new THREE.Vector3();
        let lo = 20, hi = 800;
        for (let i = 0; i < 28; i++) {
          const mid = (lo + hi) / 2;
          camera.position.copy(c).addScaledVector(dir, mid);
          camera.lookAt(c);
          camera.updateMatrixWorld();
          const fits = pts.every(function (p) { v.copy(p).project(camera); return v.z < 1 && Math.abs(v.x) < 0.9 && v.y < 0.86 && v.y > -0.78; });
          if (fits) hi = mid; else lo = mid;
        }
        controls.target.copy(c);
        camera.position.copy(c).addScaledVector(dir, hi);
      }
      controls.update();
    }

    // ---- 繪製 ----
    let raf = 0, tLast = 0;
    function renderNow() {
      if (builtKey !== st.mode + '|' + st.mat) buildMode();   // 換了稜鏡材料：重建（顏色不同）
      updateDynamic();
      updateArrows(tLast);
      controls.update();
      renderer.render(scene, camera);
      const txt = T('讀數 ', 'Reading ') + B.reading();
      if (meterDiv.textContent !== txt) meterDiv.textContent = txt;
    }
    function requestRender() {
      if (raf || !api.active) return;
      raf = requestAnimationFrame(function () { raf = 0; renderNow(); });
    }
    function resize3() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      fit(false);
      requestRender();
    }
    const ro = window.ResizeObserver ? new ResizeObserver(resize3) : null;
    if (ro) ro.observe(canvas); else window.addEventListener('resize', resize3);
    controls.addEventListener('change', requestRender);
    canvas.addEventListener('webglcontextlost', function (ev) {
      ev.preventDefault();
      if (!api.active) return; // 切回 2D 時自己釋放的（forceContextLoss），不是意外中斷
      B.lost();
    });

    const api = {
      active: true,
      frame: function (t) { tLast = t; renderNow(); },
      onMode: function () { buildMode(); fit(true); requestRender(); },
      onTheme: function () { arrowColors(); buildMode(); requestRender(); },
      resetCamera: function () { fit(true); requestRender(); },
      dispose: function () {
        api.active = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize3);
        controls.dispose();
        freeMode();
        if (axisLine) axisLine.geometry.dispose();
        if (gridHelper) { gridHelper.geometry.dispose(); gridHelper.material.dispose(); }
        shafts.dispose(); heads.dispose();
        owned.forEach(function (o) { if (o && o.dispose) o.dispose(); });
        envRT.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        canvas.remove();
        meterDiv.remove();
      }
    };

    buildMode();
    const w0 = canvas.clientWidth, h0 = canvas.clientHeight;
    if (w0 && h0) renderer.setSize(w0, h0, false);
    fit(true);
    renderNow();
    return api;
  }

  window.Microwave3D = { create: create };
})();
