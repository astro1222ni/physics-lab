/*
 * wind-instrument-3d.js — 「管樂器：直笛、長笛與單簧管」的 3D 立體檢視
 *
 * 這個檔案本身不依賴 three.js：使用者第一次按「3D 立體」時，wind-instrument.js 才載入這個檔案與 vendor/three/，
 * 再呼叫 WindInstrument3D.create(lib, env) 建立場景；切回 2D 時 dispose() 釋放全部資源。
 *
 * 畫面上的物理量全部來自 env.snapshot()（與 2D 同一個物理核心 wind-instrument-core.js 的 analyze）：
 *   管長 L、內徑 d、有效開口的位置 sEnd（= L + δ，或直笛第一個打開的孔下方 Δ）、振動模式 n，
 *   管內空氣：一片一片的粒子薄片，照駐波的位移 ξ(u)·sin φ 沿著管子前後移動，顏色照壓力 p(u)·sin φ（壓縮紅、稀疏藍）；
 *   管子下方是沿著管子的壓力曲線與壓力節點（白）、腹點（紅）。
 * 場景座標（cm）：x 沿著管子（左端或唇口 x = 0），y 是水平的橫向，z 朝上。
 * 長度依真實比例；內徑放大 BR 倍、空氣位移放大、慢動作（畫面左下角有註明）。直笛的孔可以點。
 */
(function () {
  'use strict';
  const BR = 2.5;               // 內徑放大倍數（示意）
  const NP = 30;                // 每片空氣的粒子數
  const NC = 120;               // 壓力曲線的點數
  const MAXK = 6;               // 節點、腹點標記的上限（閉管第 3 模式 n = 5：節點 3、腹點 3）

  function create(lib, env) {
    const THREE = lib.THREE;
    const T = env.T, W = env.W, host = env.host;
    const LD = window.LabDraw;

    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', T('管樂器的 3D 立體檢視：透明的管子、管內一片一片的空氣（顏色是壓力）、有效開口的紫色圈與壓力曲線；直笛的孔可以點（可拖曳旋轉、雙指或滾輪縮放、方向鍵平移）',
      '3D view of the wind instrument: a transparent tube, the air inside as slices (colour = pressure), the purple ring at the effective open end and the pressure curve; the recorder holes can be tapped (drag to rotate, pinch or scroll to zoom, arrow keys to pan)'));
    canvas.tabIndex = 0;
    host.appendChild(canvas);
    const layer = document.createElement('div');
    layer.className = 'wi3-labels';
    layer.setAttribute('aria-hidden', 'true');
    host.appendChild(layer);
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    } catch (e) {
      canvas.remove(); layer.remove();
      throw e;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = false;   // 管子懸在壓力曲線上方：地面陰影會蓋住曲線，所以不畫陰影
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.5, 3000);
    camera.up.set(0, 0, 1);
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.minDistance = 4;
    controls.maxDistance = 800;
    controls.maxPolarAngle = Math.PI * 0.82;
    if (controls.listenToKeyEvents) controls.listenToKeyEvents(canvas);

    // ---------- 顏色（與 2D 相同的 CSS 代號） ----------
    const pal = {};
    function readPalette() {
      const cs = getComputedStyle(document.documentElement);
      const g = function (k, d) { return cs.getPropertyValue('--' + k).trim() || d; };
      pal.dark = !!LD.dark;
      ['wi-pos', 'wi-neg', 'wi-air', 'wi-p', 'wi-end', 'wi-glass', 'wi-wood', 'wi-wood2', 'wi-reed', 'wi-metal', 'wi-finger', 'accent', 'text', 'muted', 'canvas-bg']
        .forEach(function (k) { pal[k] = g(k, '#888888'); });
    }
    function color(v) { return new THREE.Color(v); }

    // ---------- 燈光：天光＋主光（投影）＋輪廓光 ----------
    const hemi = new THREE.HemisphereLight(0xffffff, 0x6b6157, 1.0);
    hemi.position.set(0, 0, 1);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.9);
    sun.castShadow = false;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.radius = 4;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    scene.add(sun); scene.add(sun.target);
    const rim = new THREE.DirectionalLight(0xfff1dc, 0.9);
    scene.add(rim);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), new THREE.ShadowMaterial({ opacity: 0.18, depthWrite: false }));
    ground.receiveShadow = true;

    // 簡單的環境反射（玻璃與金屬用）：上亮下暗的球＋一盞柔光
    let envTex = null;
    function buildEnvironment() {
      if (envTex) { envTex.dispose(); envTex = null; }
      const dk = pal.dark;
      const es = new THREE.Scene();
      const geo = new THREE.SphereGeometry(100, 32, 16);
      const cols = [];
      const pos = geo.attributes.position;
      const top = color(dk ? '#4a535c' : '#f4f6f8'), mid = color(dk ? '#22282d' : '#b9bfc4'), bot = color(dk ? '#0d1013' : '#6b6560');
      const c = new THREE.Color();
      for (let i = 0; i < pos.count; i++) {
        const u = pos.getY(i) / 100;
        if (u > 0) c.copy(mid).lerp(top, u); else c.copy(mid).lerp(bot, -u);
        cols.push(c.r, c.g, c.b);
      }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      const sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide }));
      sky.rotation.x = Math.PI / 2;
      es.add(sky);
      const pm0 = new THREE.MeshBasicMaterial({ color: color('#ffffff').multiplyScalar(dk ? 2 : 3), side: THREE.DoubleSide });
      const p1 = new THREE.Mesh(new THREE.PlaneGeometry(120, 18), pm0);
      p1.position.set(0, -40, 70); p1.lookAt(0, 0, 0);
      es.add(p1);
      const pmrem = new THREE.PMREMGenerator(renderer);
      envTex = pmrem.fromScene(es, 0.02).texture;
      pmrem.dispose();
      geo.dispose(); sky.material.dispose(); p1.geometry.dispose(); pm0.dispose();
      scene.environment = envTex;
    }

    // ---------- 紋理（全部由程式畫，不用圖檔） ----------
    function rng(seed) { let s = seed; return function () { s = (s * 16807) % 2147483647; return s / 2147483647; }; }
    function woodTexture(base, seed) {
      const Wc = 1024, Hc = 128;
      const c = document.createElement('canvas'); c.width = Wc; c.height = Hc;
      const g = c.getContext('2d');
      g.fillStyle = base; g.fillRect(0, 0, Wc, Hc);
      const r = rng(seed);
      for (let k = 0; k < 70; k++) {
        const y = r() * Hc, a = 0.03 + r() * 0.12, w = 0.6 + r() * 2.2;
        const ph = r() * 6.28, f = (1 + r() * 3) * Math.PI * 2 / Wc, amp = 3 * r();
        g.strokeStyle = 'rgba(60,30,10,' + a.toFixed(3) + ')';
        g.lineWidth = w;
        g.beginPath();
        for (let x = 0; x <= Wc; x += 8) { const yy = y + amp * Math.sin(ph + x * f); if (x) g.lineTo(x, yy); else g.moveTo(x, yy); }
        g.stroke();
      }
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      return t;
    }
    function dotTexture() {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d');
      const gr = g.createRadialGradient(26, 24, 4, 32, 32, 30);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.6, '#e6e6e6'); gr.addColorStop(0.95, '#9a9a9a'); gr.addColorStop(1, 'rgba(154,154,154,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(32, 32, 30, 0, Math.PI * 2); g.fill();
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    }

    // ---------- 材質 ----------
    readPalette();
    const texWood = woodTexture('#d9b77f', 11);
    const texDot = dotTexture();
    const M = {
      glass: new THREE.MeshPhysicalMaterial({ transparent: true, opacity: 0.2, roughness: 0.05, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08, side: THREE.DoubleSide, depthWrite: false }),
      glassRim: new THREE.MeshPhysicalMaterial({ transparent: true, opacity: 0.45, roughness: 0.1, metalness: 0, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false }),
      wood: new THREE.MeshStandardMaterial({ map: texWood, transparent: true, opacity: 0.4, roughness: 0.5, side: THREE.DoubleSide, depthWrite: false }),
      woodSolid: new THREE.MeshStandardMaterial({ map: texWood, roughness: 0.45 }),
      tenon: new THREE.MeshStandardMaterial({ roughness: 0.6 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x17191c, roughness: 0.3, metalness: 0.1 }),
      reed: new THREE.MeshStandardMaterial({ roughness: 0.65 }),
      metal: new THREE.MeshStandardMaterial({ metalness: 1, roughness: 0.25 }),
      finger: new THREE.MeshStandardMaterial({ roughness: 0.62 }),
      hole: new THREE.MeshStandardMaterial({ color: 0x24160a, roughness: 0.85 }),
      holeOpen: new THREE.MeshStandardMaterial({ roughness: 0.5 }),
      end: new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.9, roughness: 0.4 }),
      endFill: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide }),
      node: new THREE.MeshStandardMaterial({ roughness: 0.4 }),
      anti: new THREE.MeshStandardMaterial({ roughness: 0.35 }),
      hit: new THREE.MeshBasicMaterial({ visible: false }),
      points: new THREE.PointsMaterial({ size: 0.4, map: texDot, vertexColors: true, alphaTest: 0.45, sizeAttenuation: true }),
      curve: new THREE.LineBasicMaterial({}),
      base: new THREE.LineBasicMaterial({ transparent: true, opacity: 0.45 })
    };
    const cPos = new THREE.Color(), cNeg = new THREE.Color(), cAir = new THREE.Color(), cStill = new THREE.Color();
    function applyColors() {
      readPalette();
      M.glass.color.set(pal['wi-glass']); M.glassRim.color.set(pal['wi-glass']);
      M.wood.color.set('#ffffff'); M.woodSolid.color.set('#ffffff');
      M.wood.opacity = pal.dark ? 0.34 : 0.42;
      M.tenon.color.set(pal['wi-wood2']).lerp(color('#ffffff'), 0.45);
      M.reed.color.set(pal['wi-reed']);
      M.metal.color.set(pal['wi-metal']);
      M.finger.color.set(pal['wi-finger']);
      M.holeOpen.color.set(pal.accent); M.holeOpen.emissive = color(pal.accent).multiplyScalar(pal.dark ? 0.35 : 0.15);
      M.end.color.set(pal['wi-end']); M.end.emissive = color(pal['wi-end']).multiplyScalar(pal.dark ? 0.45 : 0.2);
      M.endFill.color.set(pal['wi-end']);
      M.node.color.set(pal.dark ? '#f4f4f5' : '#ffffff'); M.node.emissive = color(pal.dark ? '#555555' : '#222222');
      M.anti.color.set(pal['wi-p']); M.anti.emissive = color(pal['wi-p']).multiplyScalar(pal.dark ? 0.4 : 0.15);
      M.curve.color.set(pal['wi-p']);
      M.base.color.set(pal.muted);
      cPos.set(pal['wi-pos']); cNeg.set(pal['wi-neg']); cAir.set(pal['wi-air']); cStill.set(pal.muted);
      hemi.color.set(pal.dark ? 0xb8c4d0 : 0xffffff);
      hemi.groundColor.set(pal.dark ? 0x1d1a17 : 0x6b6157);
      hemi.intensity = pal.dark ? 0.8 : 1.0;
      ground.material.opacity = pal.dark ? 0.32 : 0.18;
      buildEnvironment();
    }

    // ---------- 幾何小工具（管子沿 x 軸） ----------
    const unitCyl = new THREE.CylinderGeometry(1, 1, 1, 40, 1, true);
    const sphereGeo = new THREE.SphereGeometry(1, 24, 16);
    function tubeMesh(x0, x1, r, m, parent, zc) {
      const mesh = new THREE.Mesh(unitCyl, m);
      mesh.scale.set(r, Math.max(1e-4, x1 - x0), r);
      mesh.rotation.z = -Math.PI / 2;
      mesh.position.set((x0 + x1) / 2, 0, zc);
      parent.add(mesh);
      return mesh;
    }
    function ringAt(x, r0, r1, m, parent, zc, face) {
      const g = new THREE.RingGeometry(r0, r1, 48);
      const mesh = new THREE.Mesh(g, m);
      mesh.rotation.y = face < 0 ? -Math.PI / 2 : Math.PI / 2;
      mesh.position.set(x, 0, zc);
      parent.add(mesh);
      return mesh;
    }

    // =====================================================================
    // 樂器（管長、內徑、管型、管口修正、頭管改變時重建）
    // =====================================================================
    let inst = null, builtKey = '';
    function disposeInst() {
      if (!inst) return;
      scene.remove(inst.group);
      inst.group.traverse(function (o) { if (o.geometry && o.geometry !== unitCyl && o.geometry !== sphereGeo) o.geometry.dispose(); });
      inst = null;
    }
    function keyOf(snap) {
      const f = snap.inf;
      return [f.inst, f.type, f.L.toFixed(5), f.d.toFixed(3), f.corr, snap.pull.toFixed(5)].join('|');
    }
    function build(snap) {
      disposeInst();
      const f = snap.inf;
      const rec = f.inst === 'recorder';
      const group = new THREE.Group();
      const Lc = f.L * 100;
      const rb = f.d / 20 * BR;                       // 內半徑（cm，放大）
      const ro = rb + (rec ? 0.4 * BR : 0.14 * BR);   // 外半徑
      const Hc = Math.max(1.6, rb * 1.1);             // 壓力曲線的振幅
      const zg = Hc + 1.0;                            // 壓力曲線的基線高度
      const zc = zg + Hc + 1.4 + ro;                  // 管子中心高度
      const g = { rec: rec, Lc: Lc, rb: rb, ro: ro, Hc: Hc, zg: zg, zc: zc, holes: [], fingers: [], hits: [] };
      if (!rec) {
        // 玻璃管：外壁、內壁、兩端的管口
        tubeMesh(0, Lc, ro, M.glass, group, zc);        // 玻璃不投影（否則地上一大片灰色像板子）
        tubeMesh(0, Lc, rb, M.glass, group, zc);
        ringAt(0, rb, ro, M.glassRim, group, zc, -1);
        ringAt(Lc, rb, ro, M.glassRim, group, zc, 1);
        if (f.type === 'closed') {
          // 單簧管的吹嘴：封口＋錐形吹嘴＋簧片＋金屬束圈
          const cap = new THREE.Mesh(new THREE.CircleGeometry(ro, 40), M.dark);
          cap.rotation.y = -Math.PI / 2; cap.position.set(-0.02, 0, zc); group.add(cap);
          const mpL = Math.max(4, ro * 2.4);
          const mp = new THREE.Mesh(new THREE.CylinderGeometry(ro, ro * 0.62, mpL, 40), M.dark);
          mp.rotation.z = -Math.PI / 2; mp.position.set(-mpL / 2 - 0.05, 0, zc); group.add(mp);
          const reed = new THREE.Mesh(new THREE.BoxGeometry(mpL * 0.95, ro * 0.9, Math.max(0.12, ro * 0.08)), M.reed);
          reed.position.set(-mpL * 0.52, 0, zc - ro * 0.8); reed.rotation.y = -0.08; group.add(reed);
          const lig = new THREE.Mesh(new THREE.TorusGeometry(ro * 0.9, Math.max(0.12, ro * 0.1), 12, 40), M.metal);
          lig.rotation.y = Math.PI / 2; lig.position.set(-mpL * 0.35, 0, zc); group.add(lig);
          g.xMin = -mpL - 0.5;
        } else g.xMin = Math.min(-1, f.sStart * 100 - 1);
        // 管口外那一小段還在振動的空氣（淡紫色）
        const xe = f.sEnd * 100;
        if (xe - Lc > 0.05) tubeMesh(Lc, xe, rb, M.endFill, group, zc);
        if (f.type === 'open' && f.sStart < -1e-6) tubeMesh(f.sStart * 100, 0, rb, M.endFill, group, zc);
      } else {
        // 直笛：半透明木頭管身、實心的頭部（鳥嘴）、唇口的窗口、頭管接口、按孔、手指
        const pull = snap.pull * 100, xh = snap.head * 100;
        tubeMesh(0, Lc, ro, M.wood, group, zc);         // 半透明管身不投影，只讓實心的頭部與手指投影
        tubeMesh(0, Lc, rb, M.wood, group, zc);
        ringAt(Lc, rb, ro, M.woodSolid, group, zc, 1);
        if (pull > 0.01) tubeMesh(xh, xh + pull, ro * 0.96, M.tenon, group, zc);
        [xh, xh + pull].forEach(function (x) {
          const j = new THREE.Mesh(new THREE.TorusGeometry(ro * 1.005, Math.max(0.05, ro * 0.035), 8, 48), M.woodSolid);
          j.rotation.y = Math.PI / 2; j.position.set(x, 0, zc); group.add(j);
        });
        const beak = 5.0;
        const head = new THREE.Mesh(new THREE.CylinderGeometry(ro, ro * 0.82, beak, 40), M.woodSolid);
        head.rotation.z = -Math.PI / 2; head.position.set(-beak / 2 - 0.65, 0, zc); group.add(head);
        const lip = new THREE.Mesh(new THREE.BoxGeometry(0.65, ro * 0.9, ro * 0.6), M.woodSolid);
        lip.position.set(-0.33, 0, zc - ro * 0.15); group.add(lip);
        const win = new THREE.Mesh(new THREE.BoxGeometry(0.65, ro * 0.75, 0.2), M.hole);
        win.position.set(-0.33, 0, zc + ro * 0.55); group.add(win);
        const way = new THREE.Mesh(new THREE.BoxGeometry(beak * 0.98, ro * 0.7, 0.14), M.hole);
        way.position.set(-beak / 2 - 0.65, 0, zc + ro * 0.62); group.add(way);
        g.xMin = -beak - 1.2;
        const fingerGeo = sphereGeo;
        for (let k = 0; k < 8; k++) {
          const x = (snap.pull + W.REC.xs[k]) * 100;
          const hr = W.REC.holeD[k] / 20 * BR;
          const zs = k === 0 ? -1 : 1;
          const ring = new THREE.Mesh(new THREE.TorusGeometry(hr, Math.max(0.06, hr * 0.18), 10, 32), M.hole);
          ring.position.set(x, 0, zc + zs * ro); group.add(ring);
          const disc = new THREE.Mesh(new THREE.CircleGeometry(hr, 28), M.hole);
          disc.position.set(x, 0, zc + zs * (ro - 0.02)); if (zs < 0) disc.rotation.x = Math.PI; group.add(disc);
          g.holes.push({ x: x, z: zc + zs * ro, r: hr, ring: ring, disc: disc });
          const fg = new THREE.Mesh(fingerGeo, M.finger);
          group.add(fg);
          g.fingers.push(fg);
          const hit = new THREE.Mesh(sphereGeo, M.hit);
          hit.scale.setScalar(Math.max(hr * 2.2, 1.1));
          hit.position.set(x, 0, zc + zs * ro);
          hit.userData.k = k;
          group.add(hit);
          g.hits.push(hit);
        }
      }
      g.xMax = Math.max(Lc, f.sEnd * 100) + 1;
      // 有效開口的紫色圈（位置每一幀更新：直笛會隨按孔改變）
      g.endRing = new THREE.Mesh(new THREE.TorusGeometry(ro + 0.35, Math.max(0.08, ro * 0.06), 10, 56), M.end);
      g.endRing.rotation.y = Math.PI / 2; group.add(g.endRing);
      g.endRing2 = new THREE.Mesh(g.endRing.geometry, M.end);
      g.endRing2.rotation.y = Math.PI / 2; group.add(g.endRing2);
      // 管內的空氣：一片一片的粒子
      const nS = Math.max(24, Math.min(120, Math.round(Lc / 1.1)));
      const pos = new Float32Array(nS * NP * 3), col = new Float32Array(nS * NP * 3);
      const pg = new THREE.BufferGeometry();
      pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      pg.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const pts = new THREE.Points(pg, M.points);
      pts.frustumCulled = false;
      group.add(pts);
      M.points.size = Math.max(0.26, rb * 0.21);
      g.slices = [];
      for (let i = 0; i < nS; i++) g.slices.push((i + 0.5) / nS * Lc);
      g.disc = [];
      for (let j = 0; j < NP; j++) { const r = rb * 0.82 * Math.sqrt((j + 0.5) / NP), th = j * 2.39996; g.disc.push([r * Math.cos(th), r * Math.sin(th)]); }
      g.pts = pts;
      // 壓力曲線與基線
      const cg = new THREE.BufferGeometry();
      cg.setAttribute('position', new THREE.BufferAttribute(new Float32Array((NC + 1) * 3), 3));
      g.curve = new THREE.Line(cg, M.curve); g.curve.frustumCulled = false; group.add(g.curve);
      const bg = new THREE.BufferGeometry();
      bg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      g.base = new THREE.Line(bg, M.base); g.base.frustumCulled = false; group.add(g.base);
      g.nodes = []; g.antis = [];
      for (let k = 0; k < MAXK; k++) {
        const nd = new THREE.Mesh(sphereGeo, M.node); nd.scale.setScalar(Math.max(0.28, Hc * 0.13)); group.add(nd); g.nodes.push(nd);
        const an = new THREE.Mesh(sphereGeo, M.anti); an.scale.setScalar(Math.max(0.3, Hc * 0.15)); group.add(an); g.antis.push(an);
      }
      scene.add(group);
      inst = { group: group, geo: g };
      // 燈光跟著樂器大小
      const span = g.xMax - g.xMin;
      sun.position.set((g.xMin + g.xMax) / 2 - span * 0.3, -span * 0.5, span * 0.9 + 40);
      sun.target.position.set((g.xMin + g.xMax) / 2, 0, 0);
      const sc = sun.shadow.camera;
      sc.left = -span * 0.7; sc.right = span * 0.7; sc.top = span * 0.5; sc.bottom = -span * 0.5; sc.near = 1; sc.far = span * 3 + 200;
      sc.updateProjectionMatrix();
      rim.position.set(g.xMax + span * 0.3, span * 0.6, span * 0.5 + 20);
    }

    // ---------- HTML 標籤 ----------
    const labels = [];
    function addLabel(cls) {
      const el = document.createElement('div');
      el.className = 'wi3-lbl ' + (cls || '');
      layer.appendChild(el);
      const L = { el: el, world: new THREE.Vector3(), ax: -50, ay: -100, dx: 0, dy: -6, show: false, html: '' };
      labels.push(L);
      return L;
    }
    function setHTML(L, html) { if (L.html !== html) { L.html = html; L.el.innerHTML = html; } }
    const lbL = addLabel(''), lbR = addLabel(''), lbEnd = addLabel(''), lbNode = addLabel(''), lbAnti = addLabel(''), lbCut = addLabel('');
    lbEnd.el.style.color = 'var(--wi-end)';
    lbNode.el.style.color = 'var(--wi-p)';
    lbAnti.el.style.color = 'var(--wi-p)';
    lbCut.el.style.color = 'var(--accent)';
    const note = document.createElement('div');
    note.className = 'wi3-lbl note';
    note.style.cssText = 'top:auto;bottom:6px;left:8px;transform:none;white-space:normal;max-width:calc(100% - 16px);';
    layer.appendChild(note);
    const tv = new THREE.Vector3();
    function placeLabels() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      labels.forEach(function (L) {
        if (!L.show) { if (L.el.style.display !== 'none') L.el.style.display = 'none'; return; }
        tv.copy(L.world).project(camera);
        if (tv.z > 1 || tv.z < -1) { L.el.style.display = 'none'; return; }
        const x = (tv.x + 1) / 2 * w + L.dx, y = (1 - tv.y) / 2 * h + L.dy;
        if (L.el.style.display === 'none') L.el.style.display = '';
        L.el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) translate(' + L.ax + '%,' + L.ay + '%)';
      });
    }

    // =====================================================================
    // 每一幀：由 snapshot 更新場景
    // =====================================================================
    const tmpC = new THREE.Color();
    function update() {
      const snap = env.snapshot();
      const key = keyOf(snap);
      if (key !== builtKey || !inst) { build(snap); builtKey = key; }
      const f = snap.inf, g = inst.geo, s = snap.s;
      const LpC = f.Lp * 100, lamC = f.lambda * 100, x0 = f.sStart * 100;
      const A = Math.min(0.4 * lamC / (2 * Math.PI), 0.12 * LpC);
      // 空氣粒子：位移與壓力
      const pa = g.pts.geometry.attributes.position, ca = g.pts.geometry.attributes.color;
      const P = pa.array, Cc = ca.array;
      let q = 0;
      for (let i = 0; i < g.slices.length; i++) {
        const sx = g.slices[i];
        const u = (sx - x0) / LpC;
        let dx = 0;
        if (u <= 1.0001) {
          const sh = W.shapeAt(f.type, f.n, Math.max(0, u));
          dx = A * sh.xi * s;
          const v = sh.p * s;
          tmpC.copy(cAir).lerp(v >= 0 ? cPos : cNeg, Math.min(1, Math.abs(v)) * 0.92);
        } else tmpC.copy(cStill);
        for (let j = 0; j < NP; j++) {
          P[q] = sx + dx; P[q + 1] = g.disc[j][0]; P[q + 2] = g.zc + g.disc[j][1];
          Cc[q] = tmpC.r; Cc[q + 1] = tmpC.g; Cc[q + 2] = tmpC.b;
          q += 3;
        }
      }
      pa.needsUpdate = true; ca.needsUpdate = true;
      // 壓力曲線（管子下方）
      const cp = g.curve.geometry.attributes.position.array;
      const xe = f.sEnd * 100;
      for (let i = 0; i <= NC; i++) {
        const u = i / NC, x = x0 + (xe - x0) * u;
        cp[i * 3] = x; cp[i * 3 + 1] = 0; cp[i * 3 + 2] = g.zg + g.Hc * W.shapeAt(f.type, f.n, u).p * s;
      }
      g.curve.geometry.attributes.position.needsUpdate = true;
      const bp = g.base.geometry.attributes.position.array;
      bp[0] = Math.min(x0, 0); bp[1] = 0; bp[2] = g.zg; bp[3] = Math.max(xe, g.Lc); bp[4] = 0; bp[5] = g.zg;
      g.base.geometry.attributes.position.needsUpdate = true;
      const nd = W.nodesOf(f.type, f.n);
      g.nodes.forEach(function (m, k) { const u = nd.pNodes[k]; m.visible = u != null; if (m.visible) m.position.set(x0 + (xe - x0) * u, 0, g.zg); });
      g.antis.forEach(function (m, k) { const u = nd.pAnti[k]; m.visible = u != null; if (m.visible) m.position.set(x0 + (xe - x0) * u, 0, g.zg + g.Hc * W.shapeAt(f.type, f.n, u).p * s); });
      // 有效開口的紫色圈
      g.endRing.position.set(xe, 0, g.zc);
      g.endRing2.visible = !g.rec && f.type === 'open' && f.sStart < -1e-6;
      if (g.endRing2.visible) g.endRing2.position.set(x0, 0, g.zc);
      // 直笛的手指與孔
      if (g.rec) {
        for (let k = 0; k < 8; k++) {
          const st = f.holes[k], h = g.holes[k], fg = g.fingers[k];
          fg.visible = st !== 1;
          const zs = k === 0 ? -1 : 1;
          const fw = Math.max(h.r * 1.55, 0.8);
          if (st === 0.5) { fg.scale.set(fw * 0.55, fw * 0.9, fw * 0.36); fg.position.set(h.x - fw * 0.42, 0, h.z + zs * fw * 0.26); }
          else { fg.scale.set(fw, fw * 0.9, fw * 0.38); fg.position.set(h.x, 0, h.z + zs * fw * 0.28); }
          h.disc.material = st === 1 ? M.holeOpen : M.hole;
        }
      }
      // 標籤
      const narrow = (canvas.clientWidth || 640) < 480;
      lbL.show = lbR.show = true;
      lbL.world.set(g.rec ? -0.3 : 0, 0, g.zc + g.ro + 0.6);
      lbR.world.set(g.Lc, 0, g.zc + g.ro + 0.6);
      if (g.rec) { setHTML(lbL, T('唇口', 'Labium')); setHTML(lbR, T('管尾', 'Foot')); }
      else {
        setHTML(lbL, f.type === 'closed' ? T('閉口端', 'Closed end') : T('開口端', 'Open end'));
        setHTML(lbR, T('開口端', 'Open end'));
      }
      lbEnd.show = true;
      lbEnd.world.set(xe, 0, g.zc - g.ro - 0.4); lbEnd.ay = 0; lbEnd.dy = 6;
      setHTML(lbEnd, T('有效開口', 'Effective open end'));
      const interior = nd.pNodes.filter(function (u) { return u > 0.02 && u < 0.98; });
      const un = interior.length ? interior[0] : null;
      lbNode.show = un != null && !narrow;
      if (lbNode.show) { lbNode.world.set(x0 + (xe - x0) * un, 0, g.zg); lbNode.ay = 0; lbNode.dy = 10; setHTML(lbNode, T('壓力節點', 'Pressure node')); }
      let ua = nd.pAnti[0];
      nd.pAnti.forEach(function (u) { if (Math.abs(u - 0.35) < Math.abs(ua - 0.35)) ua = u; });
      lbAnti.show = true;
      lbAnti.world.set(x0 + (xe - x0) * ua, 0, g.zg - g.Hc); lbAnti.ay = 0; lbAnti.dy = 8;
      setHTML(lbAnti, T('壓力腹點', 'Pressure antinode'));
      lbCut.show = g.rec && f.first >= 0;
      if (lbCut.show) {
        const h = g.holes[f.first];
        lbCut.world.set(h.x, 0, f.first === 0 ? h.z - 1.2 : h.z + 1.4);
        lbCut.ay = f.first === 0 ? 0 : -100; lbCut.dy = f.first === 0 ? 8 : -6;
        setHTML(lbCut, narrow ? T('開孔 ≈ 截短', 'open hole ≈ cut') : T('打開的孔 ≈ 管子在這裡截短', 'Open hole ≈ the tube is cut here'));
      }
      const slow = snap.moving ? Math.round(f.f / 0.8) : 0;
      const nt = narrow
        ? T('長度真實；內徑放大 ' + BR + ' 倍、位移放大', 'to scale; bore ' + BR + '× wider, motion enlarged') + (slow ? T('，放慢', ', slowed') : '')
        : T('長度依真實比例；內徑放大 ' + BR + ' 倍、空氣位移放大', 'Lengths to scale; bore drawn ' + BR + '× wider, air motion enlarged') +
          (slow ? T('，放慢約 ' + slow + ' 倍', ', slowed about ' + slow + '×') : snap.blowing ? '' : T('；按「吹氣」看空氣振動', '; press “Blow” to see the air move'));
      if (note.textContent !== nt) note.textContent = nt;
      return snap;
    }

    // ---------- 點直笛的孔 ----------
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    let down = null;
    function holeAt(ev) {
      if (!inst || !inst.geo.rec) return -1;
      const r = canvas.getBoundingClientRect();
      ndc.set((ev.clientX - r.left) / r.width * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(inst.geo.hits, false)[0];
      return hit ? hit.object.userData.k : -1;
    }
    canvas.addEventListener('pointerdown', function (ev) { down = { x: ev.clientX, y: ev.clientY }; });
    canvas.addEventListener('pointerup', function (ev) {
      if (!down) return;
      const moved = Math.hypot(ev.clientX - down.x, ev.clientY - down.y);
      down = null;
      if (moved > 6) return;
      const k = holeAt(ev);
      if (k >= 0 && env.toggleHole) env.toggleHole(k);
    });
    canvas.addEventListener('pointermove', function (ev) { if (!down) canvas.style.cursor = holeAt(ev) >= 0 ? 'pointer' : ''; });

    // ---------- 相機：整根管子放進畫面 ----------
    function fit() {
      if (!inst) return;
      const g = inst.geo;
      const w = canvas.clientWidth || 640, h = canvas.clientHeight || 400, aspect = w / h;
      const zMid = (g.zc + g.ro + (g.zg - g.Hc)) / 2;
      const target = new THREE.Vector3((g.xMin + g.xMax) / 2, 0, zMid);
      const portrait = aspect < 1;
      const dir = (portrait ? new THREE.Vector3(-0.42, -0.35, 1) : new THREE.Vector3(0, -1.0, 0.62)).normalize();
      const along = (g.xMax - g.xMin) / 2 + 1, across = (g.zc + g.ro - (g.zg - g.Hc)) / 2 + 2;
      const needW = portrait ? across * 1.6 : along, needH = portrait ? along : across * 1.6;
      note.style.top = portrait ? '6px' : 'auto';
      note.style.bottom = portrait ? 'auto' : '6px';
      const t = Math.tan(camera.fov * Math.PI / 360);
      const dist = Math.max(needH / t, needW / (t * aspect)) * 1.08;
      controls.target.copy(target);
      camera.position.copy(target).addScaledVector(dir, dist);
      camera.near = Math.max(0.2, dist / 100);
      camera.far = dist * 12;
      camera.updateProjectionMatrix();
      controls.update();
    }

    // ---------- 繪製（只在需要時畫：狀態改變、相機移動） ----------
    let raf = 0;
    function renderNow() {
      if (!view.active || document.hidden) return;
      const want = Math.min(window.devicePixelRatio || 1, 2);
      if (renderer.getPixelRatio() !== want) { renderer.setPixelRatio(want); resize3(); return; }
      const moved = controls.update();
      renderer.render(scene, camera);
      placeLabels();
      if (moved) requestRender();
    }
    function requestRender() {
      if (raf || !view.active) return;
      raf = requestAnimationFrame(function () { raf = 0; renderNow(); });
    }
    let fitted = false, lastFitKey = '';
    function resize3() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (!fitted) { fit(); fitted = true; }
      requestRender();
    }
    const ro = window.ResizeObserver ? new ResizeObserver(resize3) : null;
    if (ro) ro.observe(canvas); else window.addEventListener('resize', resize3);
    controls.addEventListener('change', requestRender);
    const onVisible = function () { if (!document.hidden) requestRender(); };
    document.addEventListener('visibilitychange', onVisible);
    canvas.addEventListener('webglcontextlost', function (ev) {
      ev.preventDefault();
      if (view.active && env.onLost) env.onLost();
    });
    /** 換了樂器或管長改變超過 15%：重新對準相機（小幅調整時保留學生轉好的視角） */
    function fitKey(snap) { return snap.inf.inst + '|' + Math.round(Math.log(snap.inf.L) / Math.log(1.15)); }

    const view = {
      active: true,
      frame: function () {
        const snap = update();
        const fk = fitKey(snap);
        if (fk !== lastFitKey) { lastFitKey = fk; if (fitted) fit(); }
        renderNow();
      },
      onTheme: function () { applyColors(); update(); requestRender(); },
      resetCamera: function () { fit(); requestRender(); },
      dispose: function () {
        view.active = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize3);
        document.removeEventListener('visibilitychange', onVisible);
        controls.dispose();
        disposeInst();
        Object.keys(M).forEach(function (k) { M[k].dispose(); });
        ground.geometry.dispose(); ground.material.dispose();
        unitCyl.dispose(); sphereGeo.dispose();
        texWood.dispose(); texDot.dispose();
        if (envTex) envTex.dispose();
        renderer.dispose();
        try { renderer.forceContextLoss(); } catch (e) { /* 繪圖環境已中斷 */ }
        canvas.remove(); layer.remove();
      }
    };

    applyColors();
    { const s0 = update(); lastFitKey = fitKey(s0); }
    resize3();
    requestRender();
    return view;
  }

  window.WindInstrument3D = { create: create, BR: BR };
})();
