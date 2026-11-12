/* angular-momentum-3d.js — 「角動量守恆」的 3D 立體檢視（three.js 由 angular-momentum.js 以 import() 延遲載入後傳進來）
 *
 * 用法：const v = AngMom3D.create({ THREE, OrbitControls }, env)
 *   env.host     放畫布的元素
 *   env.core     AngMomCore（尺寸與物理量用同一套核心）
 *   env.T        T('中文', 'English')
 *   env.state()  目前狀態（模式一 hole、模式二 plat、模式三 disk，見 angular-momentum.js 的 state3()）
 *   env.tokens() 顏色（lab.css 的色彩代號）
 *   env.lost()   WebGL 環境中斷時呼叫
 * 回傳 { active, update(), frame(), onTheme(), resetCamera(), setMode(m), dispose() }
 *
 * 場景座標（m）：X = 物理的 x，Y 向上，Z = 物理的 −y。俯看時逆時針與 2D 俯視圖相同，
 * 逆時針轉動的角動量朝上（+Y）。所有位置、速度、張力都直接取自物理核心算出的狀態。
 */
(function () {
  'use strict';

  function create(lib, env) {
    const THREE = lib.THREE, C = env.core, T = env.T;
    let tok = env.tokens();
    let cur = null, mode = null;
    const UP = new THREE.Vector3(0, 1, 0);
    const V = function (x, y, z) { return new THREE.Vector3(x, y, z); };

    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', T('角動量守恆的 3D 立體檢視：光滑桌面上的小球與穿過小孔的繩子、站在旋轉平台上拿著啞鈴的人、同一根軸上的兩個圓盤（可拖曳旋轉、縮放）',
      '3D view of angular momentum: the ball on a smooth table with its string through a hole, a person holding dumbbells on a turntable, and two discs on one axle (drag to rotate, pinch or scroll to zoom)'));
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
    const camera = new THREE.PerspectiveCamera(34, 1.4, 0.05, 200);
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.maxPolarAngle = Math.PI * 0.62; // 可以稍微從桌面下方看垂下的繩子

    // ---- 環境反射（簡單的攝影棚），讓金屬與塑膠有真實的反光 ----
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

    // ---- 燈光（陰影範圍依實驗大小調整） ----
    const hemi = new THREE.HemisphereLight(0xf2f6ff, 0x3a3530, 0.75);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff4e6, 1.7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.radius = 4;
    scene.add(sun);
    scene.add(sun.target);
    const fill = new THREE.DirectionalLight(0xcfe0ff, 0.45);
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
    /** 沿 Y 軸的圓柱（y0..y1） */
    function cylY(r, y0, y1, mat, seg, r2) {
      const g = new THREE.CylinderGeometry(r2 == null ? r : r2, r, y1 - y0, seg || 32);
      g.translate(0, (y0 + y1) / 2, 0);
      return mesh(g, mat);
    }
    /** 長度 1、沿 Y 軸、底端在原點的細棒；用 link() 擺到兩點之間 */
    function rod(r, mat, seg) {
      const g = new THREE.CylinderGeometry(r, r, 1, seg || 14);
      g.translate(0, 0.5, 0);
      return mesh(g, mat);
    }
    const tmpV = new THREE.Vector3();
    function link(m, a, b) {
      tmpV.subVectors(b, a);
      const len = tmpV.length();
      if (len < 1e-6) { m.visible = false; return; }
      m.visible = true;
      m.position.copy(a);
      m.quaternion.setFromUnitVectors(UP, tmpV.multiplyScalar(1 / len));
      m.scale.set(1, len, 1);
    }
    function makeArrow(r) {
      const g = new THREE.Group();
      const mat = std(0xffffff, 0.1, 0.42, { emissive: new THREE.Color(0x000000) });
      const shaft = mesh(new THREE.CylinderGeometry(1, 1, 1, 14), mat, true, false);
      const head = mesh(new THREE.ConeGeometry(1, 1, 22), mat, true, false);
      g.add(shaft, head);
      g.userData = { shaft: shaft, head: head, mat: mat, r: r };
      g.visible = false;
      return g;
    }
    /** 箭頭：起點 o、方向 d、長度 len（m） */
    function setArrow(a, o, d, len) {
      const r = a.userData.r;
      if (!(len > r * 3) || d.lengthSq() < 1e-12) { a.visible = false; return; }
      a.visible = true;
      const hl = Math.min(len * 0.42, r * 6.5), hr = r * 2.5, sl = len - hl;
      a.position.copy(o);
      a.quaternion.setFromUnitVectors(UP, tmpV.copy(d).normalize());
      a.userData.shaft.scale.set(r, Math.max(1e-4, sl), r);
      a.userData.shaft.position.set(0, sl / 2, 0);
      a.userData.head.scale.set(hr, hl, hr);
      a.userData.head.position.set(0, sl + hl / 2, 0);
    }
    function arrowTip(a) { return a.localToWorld(V(0, a.userData.head.position.y + a.userData.head.scale.y / 2, 0)); }
    function arrowColor(a, css) {
      a.userData.mat.color.set(css);
      a.userData.mat.emissive.set(css).multiplyScalar(tok.dark ? 0.3 : 0.18);
    }
    const F3 = function (px, w, it) { return (it ? 'italic ' : '') + (w || '600') + ' ' + px + 'px system-ui, -apple-system, "Segoe UI", "Noto Sans TC", sans-serif'; };
    /** 柔和邊緣的圓形透明度圖（地板、桌面陰影用） */
    function radialAlpha(inner) {
      const c = document.createElement('canvas'); c.width = c.height = 256;
      const g = c.getContext('2d');
      const gr = g.createRadialGradient(128, 128, 128 * inner, 128, 128, 128);
      gr.addColorStop(0, '#fff'); gr.addColorStop(1, '#000');
      g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
      return canvasTex(c, false);
    }

    // ---- 名稱標示（以 2D 畫布畫字，簡體會自動轉換） ----
    const labels = [];
    const LS = 0.034;
    function label(text, color, group, italic) {
      const c = document.createElement('canvas'), g = c.getContext('2d'), px = 56;
      const f = F3(px, '700', italic);
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
      sp.userData.mode = group;
      sp.scale.set(LS * w / h, LS, 1);
      sp.center.set(0.5, 0);
      sp.renderOrder = 10;
      labels.push(sp);
      scene.add(sp);
      return sp;
    }
    const leaderMat = own(new THREE.LineBasicMaterial({ color: 0x9fb0b6, transparent: true, opacity: 0.7, depthTest: false }));
    function leader(sp) {
      const g2 = new THREE.BufferGeometry().setFromPoints([V(0, 0, 0), V(0, 0, 0)]);
      const ln = new THREE.Line(g2, leaderMat);
      ln.renderOrder = 9; ln.frustumCulled = false;
      sp.userData.leader = ln;
      scene.add(ln);
    }
    function place(sp, pos, anchor) {
      sp.position.copy(pos);
      if (sp.userData.leader && anchor) {
        const a = sp.userData.leader.geometry.attributes.position;
        a.setXYZ(0, pos.x, pos.y, pos.z); a.setXYZ(1, anchor.x, anchor.y, anchor.z); a.needsUpdate = true;
        sp.userData.leader.geometry.computeBoundingSphere();
      }
    }
    function showLabel(sp, on) { sp.visible = on; if (sp.userData.leader) sp.userData.leader.visible = on; }

    // =====================================================================
    // 模式一：光滑桌面、小孔、繩子、手
    // =====================================================================
    const holeG = new THREE.Group(); scene.add(holeG);
    const TABLE = 2.25, TH = 0.04, BR = 0.06;
    // 桌面：透明的壓克力板（看得到下面垂下的繩子），每 1 m 粗線、每 0.2 m 細線
    const gridC = document.createElement('canvas'); gridC.width = gridC.height = 512;
    (function () {
      const g = gridC.getContext('2d');
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, 512, 512);
      g.strokeStyle = 'rgba(40,60,70,0.22)'; g.lineWidth = 2;
      for (let i = 1; i < 5; i++) { const p = i * 512 / 5; g.beginPath(); g.moveTo(p, 0); g.lineTo(p, 512); g.moveTo(0, p); g.lineTo(512, p); g.stroke(); }
      g.strokeStyle = 'rgba(40,60,70,0.5)'; g.lineWidth = 5;
      g.strokeRect(0, 0, 512, 512);
    })();
    const gridTex = canvasTex(gridC);
    gridTex.wrapS = gridTex.wrapT = THREE.RepeatWrapping;
    const tableShape = new THREE.Shape();
    tableShape.moveTo(-TABLE, -TABLE); tableShape.lineTo(TABLE, -TABLE); tableShape.lineTo(TABLE, TABLE); tableShape.lineTo(-TABLE, TABLE); tableShape.closePath();
    const holePath = new THREE.Path(); holePath.absarc(0, 0, 0.03, 0, Math.PI * 2, true);
    tableShape.holes.push(holePath);
    const tableGeo = new THREE.ExtrudeGeometry(tableShape, { depth: TH, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2, curveSegments: 40 });
    tableGeo.rotateX(-Math.PI / 2);
    tableGeo.translate(0, -TH - 0.006, 0);
    const tableMat = std(0xdfe8ea, 0, 0.18, { map: gridTex, transparent: true, opacity: 0.55, depthWrite: false });
    const table = mesh(tableGeo, tableMat, false, true);
    holeG.add(table);
    // 小孔的金屬墊圈
    const metalMat = std(0x9aa6ac, 0.85, 0.3);
    const grommet = mesh(new THREE.TorusGeometry(0.036, 0.008, 12, 40), metalMat, false, true);
    grommet.rotation.x = Math.PI / 2; grommet.position.y = 0.002;
    holeG.add(grommet);
    // 小球
    const ballMat = std(0x2f6fd0, 0.15, 0.32);
    const ball = mesh(new THREE.SphereGeometry(BR, 40, 24), ballMat, true, false);
    holeG.add(ball);
    // 繩子
    const ropeMat = std(0xb9b1a3, 0, 0.75);
    const strTop = rod(0.007, ropeMat), strHang = rod(0.007, ropeMat);
    holeG.add(strTop, strHang);
    // 手（拳頭＋前臂）
    const skinMat = std(0xe2b393, 0, 0.62);
    const handG = new THREE.Group();
    const fist = mesh(new THREE.SphereGeometry(0.06, 28, 18), skinMat);
    fist.scale.set(0.95, 1.15, 0.9);
    const forearm = rod(0.042, skinMat);
    link(forearm, V(0, -0.02, 0), V(0.3, -0.42, 0.18));
    const sleeveMat = std(0x41506b, 0, 0.8);
    const sleeve = rod(0.055, sleeveMat);
    link(sleeve, V(0.25, -0.35, 0.15), V(0.42, -0.6, 0.25));
    handG.add(fist, forearm, sleeve);
    holeG.add(handG);
    // 軌跡（桌面上漸淡的帶子）
    const TR_N = 900;
    const trPos = new Float32Array(TR_N * 2 * 3), trCol = new Float32Array(TR_N * 2 * 4);
    const trGeo = new THREE.BufferGeometry();
    trGeo.setAttribute('position', new THREE.BufferAttribute(trPos, 3).setUsage(THREE.DynamicDrawUsage));
    trGeo.setAttribute('color', new THREE.BufferAttribute(trCol, 4).setUsage(THREE.DynamicDrawUsage));
    (function () {
      const idx = [];
      for (let i = 0; i < TR_N - 1; i++) { const a = 2 * i; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      trGeo.setIndex(idx);
    })();
    const trMat = own(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    const trail = new THREE.Mesh(trGeo, trMat);
    trail.frustumCulled = false; trail.renderOrder = 3;
    holeG.add(trail);
    // 目標靶
    const tgtC = document.createElement('canvas'); tgtC.width = tgtC.height = 256;
    const tgtTex = canvasTex(tgtC);
    const target = mesh(new THREE.CircleGeometry(0.135, 48), own(new THREE.MeshBasicMaterial({ map: tgtTex, transparent: true, depthWrite: false })), false, false);
    target.rotation.x = -Math.PI / 2; target.renderOrder = 2;
    holeG.add(target);
    function drawTarget() {
      const g = tgtC.getContext('2d');
      g.clearRect(0, 0, 256, 256);
      const pos = tok.pos || '#d1453b';
      [[1, pos, 0.25], [0.667, '#ffffff', 0.85], [0.37, pos, 0.9]].forEach(function (r) {
        g.globalAlpha = r[2]; g.fillStyle = r[1];
        g.beginPath(); g.arc(128, 128, 127 * r[0], 0, Math.PI * 2); g.fill();
      });
      g.globalAlpha = 1; g.strokeStyle = pos; g.lineWidth = 4;
      [1, 0.667, 0.37].forEach(function (s) { g.beginPath(); g.arc(128, 128, 125 * s, 0, Math.PI * 2); g.stroke(); });
      tgtTex.needsUpdate = true;
    }
    const arrV = makeArrow(0.016), arrT = makeArrow(0.016), arrL = makeArrow(0.02);
    holeG.add(arrV, arrT, arrL);
    const LB = {
      hole: label(T('小孔', 'Hole'), '#e8eef0', 'hole'),
      hand: label(T('手（桌面下）', 'Hand (under the table)'), '#e8eef0', 'hole'),
      v: label('v', '#ff8a7f', 'hole', true),
      T: label('T', '#f1d58f', 'hole', true),
      L: label('L', '#8fb7ff', 'hole', true),
      tgt: label(T('目標', 'Target'), '#ff8a7f', 'hole')
    };
    leader(LB.hole); leader(LB.hand);

    // =====================================================================
    // 模式二：旋轉平台上的人
    // =====================================================================
    const platG = new THREE.Group(); scene.add(platG);
    const floorMat = std(0xcfc8bd, 0, 0.9, { transparent: true, alphaMap: radialAlpha(0.35), depthWrite: false });
    const floor2 = mesh(new THREE.CircleGeometry(3.2, 72), floorMat, false, true);
    floor2.rotation.x = -Math.PI / 2;
    platG.add(floor2);
    const PT = 0.12; // 平台面高度（與 2D 相同）
    const darkMetal = std(0x5d666b, 0.8, 0.35);
    platG.add(cylY(0.13, 0, 0.03, darkMetal, 40), cylY(0.07, 0.03, 0.06, metalMat, 32));
    const spinG = new THREE.Group(); platG.add(spinG);
    // 木頭平台：上面有放射狀的木紋與一個紅色記號（看得出轉了多少）
    const woodC = document.createElement('canvas'); woodC.width = woodC.height = 512;
    (function () {
      const g = woodC.getContext('2d');
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 260; i++) {
        const r = 30 + Math.random() * 226, a0 = Math.random() * Math.PI * 2, da = 0.2 + Math.random() * 0.8;
        g.strokeStyle = 'rgba(90,60,30,' + (0.05 + Math.random() * 0.12) + ')'; g.lineWidth = 1 + Math.random() * 2;
        g.beginPath(); g.arc(256, 256, r, a0, a0 + da); g.stroke();
      }
      g.strokeStyle = 'rgba(80,50,25,0.35)'; g.lineWidth = 3;
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; g.beginPath(); g.moveTo(256, 256); g.lineTo(256 + 256 * Math.cos(a), 256 + 256 * Math.sin(a)); g.stroke(); }
    })();
    const woodTop = std(0xc8a27a, 0, 0.55, { map: canvasTex(woodC) });
    const woodSide = std(0xa98360, 0, 0.6);
    const deck = mesh(new THREE.CylinderGeometry(C.PLAT.Rp, C.PLAT.Rp, 0.06, 72), [woodSide, woodTop, woodSide]);
    deck.position.y = 0.09;
    spinG.add(deck);
    const markMat = std(0xd1453b, 0.1, 0.5);
    const mark = mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.004, 24), markMat, false, true);
    mark.position.set(C.PLAT.Rp * 0.86, PT + 0.002, 0);
    spinG.add(mark);
    // 人：腿、鞋、軀幹、脖子、頭、頭髮、眼睛鼻子（正面朝本體的 −Z）
    const pantsMat = std(0x41506b, 0, 0.85), shirtMat = std(0x2f6fd0, 0, 0.75), hairMat = std(0x3a2c25, 0, 0.7), shoeMat = std(0x2b2b2b, 0.1, 0.6), eyeMat = std(0x161616, 0, 0.4);
    [-0.09, 0.09].forEach(function (x) {
      const leg = cylY(0.062, PT + 0.06, PT + 0.9, pantsMat, 20, 0.07); leg.position.x = x; spinG.add(leg);
      const shoe = mesh(new THREE.BoxGeometry(0.1, 0.06, 0.24), shoeMat); shoe.position.set(x, PT + 0.03, -0.04); spinG.add(shoe);
    });
    const torsoGeo = new THREE.CylinderGeometry(1, 0.82, 1, 36);
    const torso = mesh(torsoGeo, shirtMat);
    torso.scale.set(0.19, 0.62, 0.12); torso.position.y = PT + 1.17;
    spinG.add(torso);
    const hips = mesh(new THREE.SphereGeometry(1, 28, 14), pantsMat);
    hips.scale.set(0.16, 0.09, 0.11); hips.position.y = PT + 0.88;
    spinG.add(hips);
    const neck = cylY(0.045, PT + 1.46, PT + 1.57, skinMat, 16); spinG.add(neck);
    const head = mesh(new THREE.SphereGeometry(0.1, 32, 22), skinMat); head.position.y = PT + 1.63; head.scale.set(1, 1.1, 1); spinG.add(head);
    const hair = mesh(new THREE.SphereGeometry(0.106, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.5), hairMat);
    hair.position.set(0, PT + 1.645, 0.012); hair.rotation.x = 0.35; hair.scale.set(1, 1.1, 1); spinG.add(hair);
    [-0.034, 0.034].forEach(function (x) { const e = mesh(new THREE.SphereGeometry(0.012, 10, 8), eyeMat, false, false); e.position.set(x, PT + 1.655, -0.092); spinG.add(e); });
    const nose = mesh(new THREE.SphereGeometry(0.018, 12, 8), skinMat, false, false); nose.position.set(0, PT + 1.62, -0.102); spinG.add(nose);
    // 手臂（每一格依姿勢更新）
    const arms = [0, 1].map(function () {
      const a = { sh: mesh(new THREE.SphereGeometry(0.052, 18, 12), shirtMat), up: rod(0.045, shirtMat, 16), el: mesh(new THREE.SphereGeometry(0.038, 14, 10), skinMat),
        fo: rod(0.036, skinMat, 14), hd: mesh(new THREE.SphereGeometry(0.042, 16, 12), skinMat) };
      spinG.add(a.sh, a.up, a.el, a.fo, a.hd);
      return a;
    });
    // 啞鈴：握把沿身體的前後方向，兩片鐵片的大小依質量
    const ironMat = std(0x3d4447, 0.75, 0.38), gripMat = std(0xa9b0b4, 0.9, 0.25);
    function makeDumbbell() {
      const g = new THREE.Group();
      const bar = mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.22, 14), gripMat);
      bar.rotation.x = Math.PI / 2;
      const p1 = mesh(new THREE.CylinderGeometry(1, 1, 0.032, 28), ironMat), p2 = mesh(new THREE.CylinderGeometry(1, 1, 0.032, 28), ironMat);
      p1.rotation.x = p2.rotation.x = Math.PI / 2;
      p1.position.z = 0.075; p2.position.z = -0.075;
      g.add(bar, p1, p2);
      g.userData.plates = [p1, p2];
      return g;
    }
    function plateR(md) { return Math.max(0.022, Math.sqrt(md / 2 / (7870 * Math.PI * 0.032))); }
    const heldDb = [makeDumbbell(), makeDumbbell()];
    heldDb.forEach(function (d) { spinG.add(d); });
    const flyDb = [makeDumbbell(), makeDumbbell()];
    flyDb.forEach(function (d) { platG.add(d); });
    const arrVd = [makeArrow(0.012), makeArrow(0.012)], arrL2 = makeArrow(0.022);
    platG.add(arrVd[0], arrVd[1], arrL2);
    // 伸手、收手的位置（虛線圓，固定在地面座標）
    const ringMat = own(new THREE.LineDashedMaterial({ color: 0x8a959a, dashSize: 0.035, gapSize: 0.03, transparent: true, opacity: 0.75 }));
    const rings = [0, 1].map(function () {
      const ln = new THREE.LineLoop(new THREE.BufferGeometry(), ringMat);
      ln.userData.r = -1;
      platG.add(ln);
      return ln;
    });
    function setRing(ln, r, y) {
      if (Math.abs(ln.userData.r - r) > 1e-6) {
        const pts = [];
        for (let i = 0; i < 128; i++) { const a = i / 128 * Math.PI * 2; pts.push(V(r * Math.cos(a), 0, r * Math.sin(a))); }
        ln.geometry.dispose();
        ln.geometry = new THREE.BufferGeometry().setFromPoints(pts);
        ln.computeLineDistances();
        ln.userData.r = r;
      }
      ln.position.y = y;
    }
    const LB2 = {
      L: label('L', '#8fb7ff', 'plat', true),
      v: label('v', '#ff8a7f', 'plat', true),
      plat: label(T('平台（轉軸無摩擦）', 'Turntable (frictionless axle)'), '#e8eef0', 'plat')
    };
    leader(LB2.plat);

    // =====================================================================
    // 模式三：兩盤相合
    // =====================================================================
    const diskG = new THREE.Group(); scene.add(diskG);
    const floor3 = mesh(new THREE.CircleGeometry(0.85, 72), floorMat, false, true);
    floor3.rotation.x = -Math.PI / 2;
    diskG.add(floor3);
    const DB = 0.04, DT = 0.02;
    diskG.add(cylY(0.1, 0, DB, darkMetal, 40));
    const spindleTop = DB + 2 * DT + C.DISK.h0 + 0.05;
    diskG.add(cylY(0.008, DB, spindleTop, metalMat, 16));
    const capM = mesh(new THREE.SphereGeometry(0.012, 16, 10), metalMat); capM.position.y = spindleTop; diskG.add(capM);
    function makeDisc(mat, stripeMat) {
      const g = new THREE.Group();
      const d = mesh(new THREE.CylinderGeometry(1, 1, DT, 72), mat);
      d.position.y = DT / 2;
      const stripe = mesh(new THREE.BoxGeometry(0.66, 0.002, 0.07), stripeMat, false, true);
      stripe.position.set(0.55, DT + 0.001, 0);
      const dots = [2.1, 4.2].map(function (a) {
        const m = mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.002, 16), stripeMat, false, true);
        m.position.set(0.7 * Math.cos(a), DT + 0.001, -0.7 * Math.sin(a));
        return m;
      });
      const hub = mesh(new THREE.CylinderGeometry(0.06, 0.06, DT + 0.006, 24), metalMat);
      hub.position.y = DT / 2;
      g.add(d, stripe, dots[0], dots[1], hub);
      g.userData = { disc: d, hub: hub };
      return g;
    }
    const lowMat = std(0x2f6fd0, 0.55, 0.32), lowStripe = std(0x10264a, 0.2, 0.5);
    const upMat = own(new THREE.MeshPhysicalMaterial({ color: 0xe7b75a, metalness: 0, roughness: 0.12, transparent: true, opacity: 0.62, clearcoat: 1, clearcoatRoughness: 0.1 }));
    const upStripe = std(0x5a3a00, 0.1, 0.5);
    const lowD = makeDisc(lowMat, lowStripe), upD = makeDisc(upMat, upStripe);
    lowD.position.y = DB;
    diskG.add(lowD, upD);
    const glowMat = own(new THREE.MeshBasicMaterial({ color: 0xff7a3d, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    const glow = mesh(new THREE.CylinderGeometry(1, 1, 0.004, 64), glowMat, false, false);
    glow.position.y = DB + DT + 0.001; glow.renderOrder = 4;
    diskG.add(glow);
    // 轉動方向的弧形箭頭（弧長固定，只表示方向）
    function makeArc(mat) {
      const g = new THREE.Group();
      const tor = mesh(new THREE.TorusGeometry(1, 0.035, 10, 40, 1.6), mat, false, false);
      tor.rotation.x = -Math.PI / 2;
      const hd = mesh(new THREE.ConeGeometry(0.09, 0.22, 18), mat, false, false);
      const a = 1.6;
      hd.position.set(Math.cos(a), 0, -Math.sin(a));
      hd.quaternion.setFromUnitVectors(UP, V(-Math.sin(a), 0, -Math.cos(a)));
      g.add(tor, hd);
      return g;
    }
    const arcMatA = std(0x2f6fd0, 0.1, 0.4, { emissive: new THREE.Color(0x000000) }), arcMatB = std(0xa36b00, 0.1, 0.4, { emissive: new THREE.Color(0x000000) });
    const arcA = makeArc(arcMatA), arcB = makeArc(arcMatB);
    diskG.add(arcA, arcB);
    const arrL3 = makeArrow(0.006);
    diskG.add(arrL3);
    const LB3 = {
      low: label(T('下盤', 'Lower disc'), '#8fb7ff', 'disk'),
      up: label(T('上盤', 'Upper disc'), '#f1d58f', 'disk'),
      L: label('L', '#8fb7ff', 'disk', true)
    };
    leader(LB3.low); leader(LB3.up);

    // ---- 顏色（深淺色切換時更新） ----
    function applyColors() {
      tok = env.tokens();
      const c = function (k, d) { return new THREE.Color(tok[k] || d); };
      const bg = c('canvas-bg', '#ffffff');
      ballMat.color.copy(c('accent', '#2f6fd0'));
      lowMat.color.copy(c('accent', '#2f6fd0')).lerp(new THREE.Color(0xffffff), 0.08);
      lowStripe.color.copy(c('accent', '#2f6fd0')).multiplyScalar(0.3);
      upMat.color.copy(c('equi', '#e7b75a')).lerp(new THREE.Color(0xffffff), 0.2);
      upStripe.color.copy(c('equi', '#a36b00')).multiplyScalar(0.35);
      shirtMat.color.copy(c('neg', '#2f6fd0'));
      ropeMat.color.copy(c('muted', '#8a959a')).lerp(new THREE.Color(0xffffff), tok.dark ? 0.1 : 0.25);
      metalMat.color.copy(c('field', '#9aa6ac')).lerp(new THREE.Color(0xcfd6d9), 0.5);
      tableMat.color.copy(bg).lerp(c('equi', '#e7b75a'), 0.06).lerp(new THREE.Color(tok.dark ? 0x9fb4bd : 0xdbe7ea), 0.5);
      tableMat.opacity = tok.dark ? 0.42 : 0.55;
      floorMat.color.copy(bg).lerp(new THREE.Color(tok.dark ? 0x000000 : 0x6b5a44), tok.dark ? 0.35 : 0.14);
      glowMat.color.copy(c('pos', '#d1453b')).lerp(new THREE.Color(0xffb36b), 0.4);
      markMat.color.copy(c('pos', '#d1453b'));
      arcMatA.color.copy(c('accent', '#2f6fd0')); arcMatA.emissive.copy(arcMatA.color).multiplyScalar(0.2);
      arcMatB.color.copy(c('equi', '#a36b00')); arcMatB.emissive.copy(arcMatB.color).multiplyScalar(0.2);
      arrowColor(arrV, tok.pos || '#d1453b');
      arrowColor(arrVd[0], tok.pos || '#d1453b'); arrowColor(arrVd[1], tok.pos || '#d1453b');
      arrowColor(arrT, tok['b-mech'] || '#a36b00');
      [arrL, arrL2, arrL3].forEach(function (a) { arrowColor(a, tok.neg || '#2f6fd0'); });
      hemi.intensity = tok.dark ? 0.6 : 0.8;
      drawTarget();
      trailKey = '';
    }

    // ---- 相機與燈光（依實驗） ----
    const SETUP = {
      hole: { target: V(0, -0.45, 0.1), dir: V(0.3, 0.8, 1), dirTall: V(0.18, 1.25, 1), size: 2.6, min: 1.2, max: 22,
        key: [[-1.75, 0, -1.5], [1.6, 0, -1.6], [1.6, 0, 1.6], [-1.6, 0, 1.6], [0, -2.1, 0], [0.35, -2.15, 0.2], [0, 0.55, 0]] },
      plat: { target: V(0, 1.0, 0), dir: V(0.5, 0.42, 1), dirTall: V(0.45, 0.5, 1), size: 1.4, min: 0.8, max: 14,
        key: [[0.95, 1.5, 0], [-0.95, 1.5, 0], [0, 1.5, 0.95], [0, 1.5, -0.95], [0.4, 0, 0.4], [-0.4, 0, -0.4], [0.4, 0, -0.4], [-0.4, 0, 0.4], [0, 2.7, 0]] },
      disk: { target: V(0, 0.07, 0), dir: V(0.32, 0.72, 1), dirTall: V(0.25, 0.95, 1), size: 0.42, min: 0.18, max: 4,
        key: [[0.33, 0, 0.33], [-0.33, 0, -0.33], [0.33, 0, -0.33], [-0.33, 0, 0.33], [0, 0.3, 0]] }
    };
    function lightFor(m) {
      const s = SETUP[m].size;
      sun.position.set(-0.45 * s * 3, 1.0 * s * 3.2, 0.6 * s * 3);
      sun.target.position.set(0, m === 'plat' ? 0.6 : 0, 0);
      const sc = sun.shadow.camera;
      sc.left = -s * 1.1; sc.right = s * 1.1; sc.bottom = -s * 1.1; sc.top = s * 1.1; sc.near = s * 0.5; sc.far = s * 8;
      sc.updateProjectionMatrix();
      sun.shadow.bias = -0.0004;
      sun.shadow.normalBias = s * 0.004;
      fill.position.set(s * 3, s * 1.5, -s * 2.5);
    }
    function fit(force) {
      const st = SETUP[mode];
      const tv = Math.tan(camera.fov * Math.PI / 360), th = tv * camera.aspect;
      const dir = force ? (camera.aspect < 1.1 ? st.dirTall.clone() : st.dir.clone()).normalize() : camera.position.clone().sub(controls.target).normalize();
      if (force) controls.target.copy(st.target);
      const right = new THREE.Vector3().crossVectors(UP, dir).normalize();
      const up = new THREE.Vector3().crossVectors(dir, right);
      const KEY = st.key.map(function (p) { return V(p[0], p[1], p[2]); });
      function need() {
        let d = st.min;
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
      dist *= camera.aspect < 1.1 ? 1.08 : 1.04;
      camera.position.copy(controls.target).addScaledVector(dir, dist);
      camera.near = Math.max(0.01, dist / 100); camera.far = dist * 30;
      camera.updateProjectionMatrix();
      controls.minDistance = st.min * 0.6; controls.maxDistance = st.max;
      controls.update();
    }
    function setMode(m) {
      if (!SETUP[m] || m === mode) return;
      mode = m;
      holeG.visible = m === 'hole'; platG.visible = m === 'plat'; diskG.visible = m === 'disk';
      labels.forEach(function (l) { showLabel(l, false); });
      lightFor(m);
      fit(true);
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
      if (Math.abs(camera.aspect - lastAspect) > 0.01) { lastAspect = camera.aspect; if (mode) fit((camera.aspect < 1.1) !== (lastTall)); lastTall = camera.aspect < 1.1; }
      const ls = camera.aspect < 1.1 ? 0.042 : LS;
      labels.forEach(function (l) { l.scale.set(ls * l.userData.k, ls, 1); });
      if (cur) update(); else requestRender();
    }
    let lastTall = false;
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
    let trailKey = '';
    function updTrail(pts) {
      const n0 = pts.length;
      const step = Math.max(1, Math.ceil(n0 / TR_N));
      const P = [];
      for (let i = n0 - 1; i >= 0 && P.length < TR_N; i -= step) P.push(pts[i]);
      P.reverse();
      const N = P.length;
      const key = N + '|' + (N ? P[N - 1][0] + ',' + P[N - 1][1] : '') + '|' + (N ? P[0][0] : '');
      if (key === trailKey) return;
      trailKey = key;
      if (N < 2) { trail.visible = false; return; }
      trail.visible = true;
      const ac = new THREE.Color(tok.accent || '#2f6fd0');
      for (let i = 0; i < N; i++) {
        const a = P[Math.max(0, i - 1)], b = P[Math.min(N - 1, i + 1)];
        let tx = b[0] - a[0], ty = b[1] - a[1];
        const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
        const u = i / (N - 1), w = 0.008 + 0.016 * u;
        const nx = -ty * w, ny = tx * w;
        const x = P[i][0], z = -P[i][1];
        trPos.set([x + nx, 0.003, z - ny, x - nx, 0.003, z + ny], i * 6);
        const al = 0.06 + 0.84 * u * u;
        trCol.set([ac.r, ac.g, ac.b, al, ac.r, ac.g, ac.b, al], i * 8);
      }
      trGeo.attributes.position.needsUpdate = true;
      trGeo.attributes.color.needsUpdate = true;
      trGeo.setDrawRange(0, (N - 1) * 6);
    }
    function lenL(L, k, half) { return Math.sign(L) * k * Math.abs(L) / (Math.abs(L) + half); }

    function updHole(s) {
      const bx = s.x, bz = -s.y;
      ball.position.set(bx, BR, bz);
      const r = Math.hypot(s.x, s.y) || 1;
      if (!s.free || s.hang > 0) link(strTop, V(0, 0.004, 0), V(bx, BR * 0.55, bz));
      else link(strTop, V(bx - s.rope * s.x / r, 0.007, bz + s.rope * s.y / r), V(bx, BR * 0.55, bz));
      const hang = Math.max(0, s.hang);
      if (hang > 0.01) link(strHang, V(0, -TH, 0), V(0, -hang, 0)); else strHang.visible = false;
      handG.position.set(0, -s.handDepth - 0.055, 0);
      if (s.free) { fist.scale.set(1.15, 0.85, 1.05); fist.rotation.z = 0.5; } else { fist.scale.set(0.95, 1.15, 0.9); fist.rotation.z = 0; }
      const o = ball.position.clone();
      setArrow(arrV, o, V(s.vx, 0, -s.vy), s.showV ? Math.min(s.v * s.scaleV, s.maxArrow) : 0);
      const dT = V(-s.x, 0, s.y).normalize();
      const lenT = !s.free && s.showT ? Math.min(s.T * s.scaleT, s.maxArrow, Math.max(0.05, s.r - 0.08)) : 0;
      setArrow(arrT, o.clone().addScaledVector(dT, BR * 0.9), dT, lenT);
      const ll = lenL(s.L, 1.2, 1);
      setArrow(arrL, V(0, 0.01, 0), V(0, Math.sign(ll) || 1, 0), Math.abs(ll));
      target.visible = !!s.target;
      if (s.target) target.position.set(s.target.x, 0.002, -s.target.y);
      updTrail(s.trail);
      // 標示
      place(LB.hole, V(-0.35, 0.28, 0.45), V(0, 0.01, 0.02)); showLabel(LB.hole, true);
      place(LB.hand, V(-0.55, -s.handDepth - 0.05, 0.3), V(-0.05, -s.handDepth - 0.05, 0)); showLabel(LB.hand, true);
      showLabel(LB.v, arrV.visible); if (arrV.visible) place(LB.v, arrowTip(arrV).add(V(0, 0.05, 0)));
      showLabel(LB.T, arrT.visible); if (arrT.visible) place(LB.T, arrowTip(arrT).add(V(0, 0.06, 0)));
      showLabel(LB.L, arrL.visible); if (arrL.visible) place(LB.L, arrowTip(arrL).add(V(0, 0.04, 0)));
      showLabel(LB.tgt, !!s.target); if (s.target) place(LB.tgt, V(s.target.x, 0.16, -s.target.y));
    }

    function bodyPt(p) { return V(p[0], p[2] + PT, -p[1]); }
    function updPlat(s) {
      spinG.rotation.y = s.phi;
      const pr = plateR(s.md);
      s.posture.forEach(function (p, i) {
        const a = arms[i], S0 = bodyPt(p.s), E = bodyPt(p.e), H = bodyPt(p.h);
        a.sh.position.copy(S0); link(a.up, S0, E); a.el.position.copy(E); link(a.fo, E, H); a.hd.position.copy(H);
        const d = heldDb[i];
        d.visible = !s.dropped && s.md > 0;
        d.position.copy(H);
        d.userData.plates.forEach(function (pl) { pl.scale.set(pr, 1, pr); });
      });
      flyDb.forEach(function (d, i) {
        const q = s.dumb[i];
        d.visible = !!(s.dropped && q);
        if (!d.visible) return;
        d.position.set(q.x, Math.max(pr, q.z), -q.y);
        d.rotation.y = q.yaw;
        d.userData.plates.forEach(function (pl) { pl.scale.set(pr, 1, pr); });
      });
      // 啞鈴速度
      const c = Math.cos(s.phi), sn = Math.sin(s.phi);
      arrVd.forEach(function (a, i) {
        if (!s.showV || !(s.md > 0)) { a.visible = false; return; }
        if (!s.dropped) {
          const h = s.posture[i].h, px = h[0] * c - h[1] * sn, py = h[0] * sn + h[1] * c;
          const vx = -s.w * py, vy = s.w * px, vm = Math.hypot(vx, vy);
          setArrow(a, V(px, h[2] + PT + 0.06, -py), V(vx, 0, -vy), Math.min(0.6, vm * 0.15));
        } else {
          const q = s.dumb[i];
          if (!q || q.landed) { a.visible = false; return; }
          const vm = Math.hypot(q.vx, q.vy);
          setArrow(a, V(q.x, Math.max(pr, q.z) + 0.06, -q.y), V(q.vx, 0, -q.vy), Math.min(0.6, vm * 0.15));
        }
      });
      const ll = lenL(s.L, 0.6, 12);
      setArrow(arrL2, V(0, PT + 1.8, 0), V(0, Math.sign(ll) || 1, 0), Math.abs(ll) + 0.06);
      rings.forEach(function (ln, i) {
        ln.visible = s.showRing && !s.dropped;
        if (ln.visible) setRing(ln, i ? s.rIn : s.rOut, (i ? s.hIn : s.hOut) + PT);
      });
      showLabel(LB2.L, arrL2.visible); if (arrL2.visible) place(LB2.L, arrowTip(arrL2).add(V(0, 0.03, 0)));
      showLabel(LB2.v, arrVd[0].visible); if (arrVd[0].visible) place(LB2.v, arrowTip(arrVd[0]).add(V(0, 0.04, 0)));
      place(LB2.plat, V(C.PLAT.Rp + 0.35, 0.18, 0.35), V(C.PLAT.Rp * 0.75, PT, C.PLAT.Rp * 0.45)); showLabel(LB2.plat, true);
    }

    function updDisk(s) {
      lowD.scale.set(s.R1, 1, s.R1);
      lowD.userData.hub.scale.set(1 / s.R1, 1, 1 / s.R1);
      lowD.rotation.y = s.a1;
      upD.scale.set(s.R2, 1, s.R2);
      upD.userData.hub.scale.set(1 / s.R2, 1, 1 / s.R2);
      upD.position.y = DB + DT + s.h;
      upD.rotation.y = s.a2;
      const rc = Math.min(s.R1, s.R2);
      glow.scale.set(rc, 1, rc);
      glowMat.opacity = s.phase === 'slip' ? (tok.dark ? 0.7 : 0.55) * Math.max(0.15, s.slip) : 0;
      glow.visible = glowMat.opacity > 0.01;
      [[arcA, s.w1, s.R1 + 0.025, DB + DT * 0.5], [arcB, s.w2, s.R2 * 0.62, DB + 2 * DT + s.h + 0.012]].forEach(function (it) {
        const g = it[0], w = it[1];
        g.visible = s.showW && Math.abs(w) > 0.05;
        if (!g.visible) return;
        g.position.y = it[3];
        g.scale.set(it[2], it[2], it[2] * (w > 0 ? 1 : -1));
        g.rotation.y = 0.5;
      });
      const ll = lenL(s.L, 0.16, 1.5);
      setArrow(arrL3, V(0, spindleTop + 0.015, 0), V(0, Math.sign(ll) || 1, 0), Math.abs(ll) + 0.02);
      if (ll < 0) arrL3.position.y = spindleTop + 0.015 + Math.abs(ll) + 0.02; // 朝下的箭頭：箭頭尖端停在軸頂上方
      showLabel(LB3.L, arrL3.visible); if (arrL3.visible) place(LB3.L, V(0.03, spindleTop + 0.04 + Math.abs(ll) * (ll > 0 ? 1 : 0.5), 0));
      place(LB3.low, V(s.R1 + 0.09, DB - 0.02, 0.2), V(s.R1 * 0.8, DB + DT * 0.5, s.R1 * 0.5)); showLabel(LB3.low, true);
      place(LB3.up, V(-s.R2 - 0.1, DB + 2 * DT + s.h + 0.07, -0.05), V(-s.R2 * 0.75, DB + 2 * DT + s.h, -s.R2 * 0.3)); showLabel(LB3.up, true);
    }

    function update() {
      const s = env.state();
      cur = s;
      if (s.mode !== mode) setMode(s.mode);
      if (mode === 'hole') updHole(s); else if (mode === 'plat') updPlat(s); else updDisk(s);
      requestRender();
    }

    const api = {
      active: true,
      update: update,
      frame: function () { update(); if (raf) { cancelAnimationFrame(raf); raf = 0; } renderNow(); },
      onTheme: function () { applyColors(); update(); },
      resetCamera: function () { fit(true); requestRender(); },
      setMode: function (m) { setMode(m); update(); },
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
    if (w0 && h0) { renderer.setSize(w0, h0, false); camera.aspect = w0 / h0; camera.updateProjectionMatrix(); lastAspect = camera.aspect; lastTall = camera.aspect < 1.1; }
    setMode(env.mode || (env.state().mode));
    return api;
  }

  window.AngMom3D = { create: create };
})();
