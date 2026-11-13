/*
 * reverb-room-3d.js — 「迴響與音樂廳：賽賓公式」的 3D 立體檢視
 *
 * 這個檔案本身不依賴 three.js：使用者第一次按「3D 立體」時，reverb-room.js 才載入這個檔案與 vendor/three/，
 * 再呼叫 ReverbRoom3D.create(lib, env) 建立場景；切回 2D 時 dispose() 釋放全部資源。
 *
 * 畫面上的一切都來自 env.snapshot()（與 2D 同一套計算，ReverbCore.analyze）：
 *   房間的長寬高（公尺、真實比例）、六個面的材料顏色、聽眾座位、聲源與聽者、
 *   每一條 1–2 次反射路徑（反射點由鏡像源法算出，包含地板與天花板），越弱越淡；
 *   拍手時，以聲源與 6 個一次鏡像源為球心、半徑 c·t 的波前球面（裁在房間內，慢動作）。
 * 場景座標（m）：x 沿長度、y 沿寬度、z 朝上；房間的地板中心在原點。
 * 靠近鏡頭的牆與天花板自動變淡（像剖開的模型屋），才看得到房間裡面。
 */
(function () {
  'use strict';

  function create(lib, env) {
    const THREE = lib.THREE, T = env.T, host = env.host;

    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', T('房間的 3D 立體檢視：六個面的材料、聽眾、聲源、聽者與反射聲的路徑（可拖曳旋轉、雙指或滾輪縮放）',
      '3D view of the room: the six surface materials, the audience, the source, the listener and the reflection paths (drag to rotate, pinch or scroll to zoom)'));
    canvas.tabIndex = 0;
    host.appendChild(canvas);
    const layer = document.createElement('div');
    layer.className = 'rv3-labels';
    layer.setAttribute('aria-hidden', 'true');
    host.appendChild(layer);
    function mkLabel(cls) { const d = document.createElement('div'); d.className = 'rv3-lbl' + (cls ? ' ' + cls : ''); layer.appendChild(d); return d; }
    const lblSrc = mkLabel(), lblLis = mkLabel(), lblT = mkLabel(), note = mkLabel('note');
    lblT.style.left = '8px'; lblT.style.top = '8px';
    note.style.left = '8px'; note.style.right = '8px'; note.style.top = 'auto'; note.style.bottom = '6px'; note.style.whiteSpace = 'normal'; note.style.width = 'fit-content';
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    } catch (e) {
      canvas.remove(); layer.remove();
      throw e;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.localClippingEnabled = true;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 2000);
    camera.up.set(0, 0, 1);
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.maxPolarAngle = Math.PI * 0.49;

    // ---------- 顏色 ----------
    const pal = {};
    const MAT_KEYS = env.C.MAT_KEYS;
    function readPalette() {
      const cs = getComputedStyle(document.documentElement);
      ['rv-src', 'rv-lis', 'rv-ray1', 'rv-ray2', 'rv-people', 'rv-floor', 'text', 'muted', 'canvas-bg']
        .concat(MAT_KEYS.map(function (k) { return 'rv-' + k; }))
        .forEach(function (k) { pal[k] = cs.getPropertyValue('--' + k).trim() || '#888888'; });
      const bg = new THREE.Color(pal['canvas-bg']);
      pal.dark = (bg.r + bg.g + bg.b) / 3 < 0.35;
    }
    const col = function (v) { return new THREE.Color(v); };

    // ---------- 燈光、地面、環境反射 ----------
    const hemi = new THREE.HemisphereLight(0xffffff, 0x5b524a, 1.1);
    hemi.position.set(0, 0, 1);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 2.0);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.03;
    scene.add(sun); scene.add(sun.target);
    const rimL = new THREE.DirectionalLight(0xfff1dc, 0.7);
    scene.add(rimL);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.2, depthWrite: false }));
    ground.receiveShadow = true;
    ground.position.z = -0.02;
    scene.add(ground);
    let envTex = null;
    function buildEnvironment() {
      if (envTex) { envTex.dispose(); envTex = null; }
      const es = new THREE.Scene();
      const geo = new THREE.SphereGeometry(100, 32, 16);
      const cols = [], pos = geo.attributes.position, c = new THREE.Color();
      const top = col(pal.dark ? '#4a535c' : '#f4f6f8'), mid = col(pal.dark ? '#22282d' : '#b9bfc4'), bot = col(pal.dark ? '#0d1013' : '#6b6560');
      for (let i = 0; i < pos.count; i++) {
        const u = pos.getY(i) / 100;
        if (u > 0) c.copy(mid).lerp(top, u); else c.copy(mid).lerp(bot, -u);
        cols.push(c.r, c.g, c.b);
      }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      const sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide }));
      sky.rotation.x = Math.PI / 2;
      es.add(sky);
      const pmrem = new THREE.PMREMGenerator(renderer);
      envTex = pmrem.fromScene(es, 0.02).texture;
      pmrem.dispose(); geo.dispose(); sky.material.dispose();
      scene.environment = envTex;
    }

    // ---------- 共用的幾何與材質 ----------
    const G = {
      ball: new THREE.SphereGeometry(1, 40, 24),
      dot: new THREE.SphereGeometry(1, 14, 10),
      rod: new THREE.CylinderGeometry(1, 1, 1, 10, 1, false),
      body: new THREE.CylinderGeometry(0.17, 0.22, 0.75, 10, 1, false),
      head: new THREE.SphereGeometry(0.12, 12, 8),
      wave: new THREE.SphereGeometry(1, 64, 32)
    };
    G.body.rotateX(Math.PI / 2); G.body.translate(0, 0, 0.48);
    G.head.translate(0, 0, 1.0);
    const M = {
      floor: new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0, side: THREE.DoubleSide }),
      edge: new THREE.LineBasicMaterial({ transparent: true, opacity: 0.55 }),
      src: new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.1 }),
      lis: new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.1 }),
      people: new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0 }),
      direct: new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0 }),
      img: new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0, transparent: true, opacity: 0.45, depthWrite: false })
    };
    const SURF = env.C.SURFACES;
    const wallMat = {};
    SURF.forEach(function (s) {
      if (s === 'floor') return;
      wallMat[s] = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false });
    });
    const openMat = new THREE.LineDashedMaterial({ dashSize: 0.4, gapSize: 0.3, transparent: true, opacity: 0.9 });
    // 波前：球面裁在房間的六個面以內
    const clipPlanes = [0, 1, 2, 3, 4, 5].map(function () { return new THREE.Plane(); });
    const waveMat = {
      src: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, clippingPlanes: clipPlanes }),
      img: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, clippingPlanes: clipPlanes })
    };
    function applyColors() {
      readPalette();
      M.src.color.set(pal['rv-src']); M.src.emissive = col(pal['rv-src']).multiplyScalar(0.25);
      M.lis.color.set(pal['rv-lis']); M.lis.emissive = col(pal['rv-lis']).multiplyScalar(0.25);
      M.people.color.set(pal['rv-people']);
      M.direct.color.set(pal.text);
      M.img.color.set(pal['rv-src']);
      M.edge.color.set(pal.muted);
      waveMat.src.color.set(pal['rv-src']);
      waveMat.img.color.set(pal['rv-ray1']);
      buildEnvironment();
      builtKey = '';
    }

    // ---------- 房間（依設定重建） ----------
    let room = null, rays = null, crowd = null, builtKey = '', crowdKey = '', dims = { L: 9, W: 8, H: 3 };
    const wallMesh = {};
    const srcBall = new THREE.Mesh(G.ball, M.src), lisBall = new THREE.Mesh(G.ball, M.lis);
    srcBall.castShadow = lisBall.castShadow = true;
    scene.add(srcBall); scene.add(lisBall);
    const waveSrc = new THREE.Mesh(G.wave, waveMat.src);
    const waveImgs = [];
    for (let i = 0; i < 6; i++) { const w = new THREE.Mesh(G.wave, waveMat.img); w.visible = false; scene.add(w); waveImgs.push(w); }
    waveSrc.visible = false;
    scene.add(waveSrc);
    function disposeTree(o) {
      if (!o) return;
      scene.remove(o);
      o.traverse(function (q) {
        if (q.geometry && !Object.keys(G).some(function (k) { return G[k] === q.geometry; })) q.geometry.dispose();
      });
    }
    function wallGeometry(s, L, W, H) {
      let g;
      if (s === 'ceiling') { g = new THREE.PlaneGeometry(L, W); g.translate(0, 0, H); }
      else if (s === 'front' || s === 'back') { g = new THREE.PlaneGeometry(W, H); g.rotateX(Math.PI / 2); g.rotateZ(Math.PI / 2); g.translate(s === 'front' ? -L / 2 : L / 2, 0, H / 2); }
      else { g = new THREE.PlaneGeometry(L, H); g.rotateX(Math.PI / 2); g.translate(0, s === 'left' ? -W / 2 : W / 2, H / 2); }
      return g;
    }
    function rectOutline(s, L, W, H) {
      const x0 = -L / 2, x1 = L / 2, y0 = -W / 2, y1 = W / 2;
      const P = {
        floor: [[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0]],
        ceiling: [[x0, y0, H], [x1, y0, H], [x1, y1, H], [x0, y1, H]],
        front: [[x0, y0, 0], [x0, y1, 0], [x0, y1, H], [x0, y0, H]],
        back: [[x1, y0, 0], [x1, y1, 0], [x1, y1, H], [x1, y0, H]],
        left: [[x0, y0, 0], [x1, y0, 0], [x1, y0, H], [x0, y0, H]],
        right: [[x0, y1, 0], [x1, y1, 0], [x1, y1, H], [x0, y1, H]]
      }[s];
      const v = [];
      P.concat([P[0]]).forEach(function (p) { v.push(p[0], p[1], p[2]); });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
      return g;
    }
    function buildRoom(snap) {
      disposeTree(room);
      const c = snap.cfg, L = c.L, W = c.W, H = c.H;
      room = new THREE.Group();
      // 地板：有厚度的板子
      const fm = c.mats.floor;
      const th = Math.max(0.06, 0.012 * Math.max(L, W));
      if (fm !== 'open') {
        M.floor.color.copy(col(pal['rv-floor'])).lerp(col(pal['rv-' + fm]), 0.55);
        const slab = new THREE.Mesh(new THREE.BoxGeometry(L, W, th), M.floor);
        slab.position.z = -th / 2;
        slab.receiveShadow = true;
        room.add(slab);
      }
      SURF.forEach(function (s) {
        const m = c.mats[s];
        if (m === 'open') {
          const line = new THREE.Line(rectOutline(s, L, W, H), openMat);
          line.computeLineDistances();
          room.add(line);
          wallMesh[s] = null;
          return;
        }
        if (s === 'floor') return;
        wallMat[s].color.set(pal['rv-' + m]);
        const mesh = new THREE.Mesh(wallGeometry(s, L, W, H), wallMat[s]);
        mesh.renderOrder = 2;
        room.add(mesh);
        wallMesh[s] = mesh;
      });
      openMat.color.set(pal['rv-open']);
      openMat.dashSize = Math.max(0.15, 0.02 * Math.max(L, W)); openMat.gapSize = openMat.dashSize * 0.7;
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(L, W, H)), M.edge);
      edges.position.z = H / 2;
      room.add(edges);
      scene.add(room);
      // 波前的裁切面（法向量朝房間內）
      const ox = L / 2, oy = W / 2;
      clipPlanes[0].set(new THREE.Vector3(1, 0, 0), ox); clipPlanes[1].set(new THREE.Vector3(-1, 0, 0), ox);
      clipPlanes[2].set(new THREE.Vector3(0, 1, 0), oy); clipPlanes[3].set(new THREE.Vector3(0, -1, 0), oy);
      clipPlanes[4].set(new THREE.Vector3(0, 0, 1), 0); clipPlanes[5].set(new THREE.Vector3(0, 0, -1), H);
      const big = Math.max(L, W) * 3;
      ground.scale.set(big, big, 1);
    }
    /** 一段段圓柱連成的折線 */
    function addPolyline(grp, pts, radius, mat) {
      const a = new THREE.Vector3(), b = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
      for (let i = 1; i < pts.length; i++) {
        a.copy(pts[i - 1]); b.copy(pts[i]);
        const len = a.distanceTo(b);
        if (len < 1e-6) continue;
        const m = new THREE.Mesh(G.rod, mat);
        m.scale.set(radius, len, radius);
        m.position.copy(a).add(b).multiplyScalar(0.5);
        m.quaternion.setFromUnitVectors(up, b.clone().sub(a).normalize());
        grp.add(m);
      }
    }
    function buildRays(snap) {
      disposeTree(rays);
      rays = new THREE.Group();
      const a = snap.an, c = snap.cfg;
      const toV = function (p) { return new THREE.Vector3(p.x - c.L / 2, p.y - c.W / 2, p.z); };
      const size = Math.max(c.L, c.W, c.H);
      const r = Math.max(0.012, size * 0.0025);
      addPolyline(rays, [toV(a.src), toV(a.lis)], r * 1.5, M.direct);
      if (!snap.dry) {
        a.images.slice().reverse().forEach(function (m) {
          if (m.level == null) return;
          const al = Math.max(0.12, Math.min(0.95, 0.95 + m.level / 30));
          const mat = new THREE.MeshBasicMaterial({ color: col(m.order === 1 ? pal['rv-ray1'] : pal['rv-ray2']), transparent: true, opacity: al, depthWrite: false });
          const sub = new THREE.Group();
          addPolyline(sub, m.pts.map(toV), m.order === 1 ? r : r * 0.7, mat);
          // 反射點
          m.pts.slice(1, -1).forEach(function (p) {
            const d = new THREE.Mesh(G.dot, mat);
            d.scale.setScalar(r * 2.6);
            d.position.copy(toV(p));
            sub.add(d);
          });
          sub.userData.mat = mat;
          rays.add(sub);
        });
        // 一次鏡像源（牆外的淡色球）
        a.images.forEach(function (m) {
          if (m.order !== 1) return;
          const d = new THREE.Mesh(G.ball, M.img);
          d.scale.setScalar(Math.max(0.08, size * 0.01) * (m.level == null ? 0.6 : 1));
          d.position.copy(toV(m.img));
          rays.add(d);
        });
      }
      scene.add(rays);
    }
    function disposeRays() {
      if (!rays) return;
      rays.children.forEach(function (g) { if (g.userData.mat) g.userData.mat.dispose(); });
      scene.remove(rays);
      rays = null;
    }
    function buildCrowd(snap) {
      if (crowd) { scene.remove(crowd.body); scene.remove(crowd.head); crowd.body.dispose(); crowd.head.dispose(); crowd = null; }
      const list = snap.seats();
      if (!list.length) return;
      const c = snap.cfg;
      const body = new THREE.InstancedMesh(G.body, M.people, list.length);
      const head = new THREE.InstancedMesh(G.head, M.people, list.length);
      const m4 = new THREE.Matrix4();
      // 座位很密時把人縮小一點，不互相重疊
      const pitch = Math.sqrt(c.L * c.W / Math.max(1, list.length));
      const s = Math.min(1, pitch / 0.62);
      list.forEach(function (p, i) {
        m4.makeScale(s, s, Math.max(0.85, s));
        m4.setPosition(p.x - c.L / 2, p.y - c.W / 2, 0);
        body.setMatrixAt(i, m4); head.setMatrixAt(i, m4);
      });
      body.castShadow = head.castShadow = list.length <= 800;
      scene.add(body); scene.add(head);
      crowd = { body: body, head: head };
    }

    function rebuild(snap) {
      const c = snap.cfg;
      const key = [c.L, c.W, c.H, SURF.map(function (s) { return c.mats[s]; }).join(','), c.src.u, c.src.v, c.lis.u, c.lis.v, c.order, snap.dry ? 1 : 0].join('|');
      const ck = [c.L, c.W, c.src.u, c.src.v, snap.an.people].join('|');
      const sizeChanged = c.L !== dims.L || c.W !== dims.W || c.H !== dims.H;
      if (key !== builtKey) {
        buildRoom(snap);
        disposeRays();
        buildRays(snap);
        builtKey = key;
      }
      if (ck !== crowdKey) { buildCrowd(snap); crowdKey = ck; }
      if (sizeChanged) { dims = { L: c.L, W: c.W, H: c.H }; fitPending = true; }
    }

    // ---------- 每一格 ----------
    const camLocal = new THREE.Vector3();
    function update() {
      const snap = env.snapshot();
      rebuild(snap);
      const c = snap.cfg, a = snap.an;
      const size = Math.max(c.L, c.W, c.H);
      const br = Math.max(0.12, Math.min(size * 0.018, 0.9));
      const toV = function (p) { return new THREE.Vector3(p.x - c.L / 2, p.y - c.W / 2, p.z); };
      srcBall.scale.setScalar(br); srcBall.position.copy(toV(a.src));
      lisBall.scale.setScalar(br); lisBall.position.copy(toV(a.lis));
      // 靠近鏡頭的牆與天花板變淡
      camLocal.copy(camera.position);
      const fade = {
        front: camLocal.x < -c.L / 2, back: camLocal.x > c.L / 2,
        left: camLocal.y < -c.W / 2, right: camLocal.y > c.W / 2, ceiling: camLocal.z > c.H
      };
      Object.keys(wallMat).forEach(function (s) { wallMat[s].opacity = fade[s] ? 0.05 : (s === 'ceiling' ? 0.18 : 0.42); });
      // 拍手的波前（慢動作；物理時間 tPhys）
      const tp = snap.tPhys;
      if (tp >= 0) {
        const rho = env.C.C_SOUND * tp;
        waveSrc.visible = true;
        waveSrc.scale.setScalar(Math.max(1e-3, rho));
        waveSrc.position.copy(toV(a.src));
        let i = 0;
        if (!snap.dry) a.images.forEach(function (m) {
          if (m.order !== 1 || i >= 6) return;
          const w = waveImgs[i++];
          w.visible = m.level != null;
          w.scale.setScalar(Math.max(1e-3, rho));
          w.position.copy(toV(m.img));
        });
        for (; i < 6; i++) waveImgs[i].visible = false;
      } else {
        waveSrc.visible = false;
        waveImgs.forEach(function (w) { w.visible = false; });
      }
      // 標籤
      placeLabel(lblSrc, toV(a.src).add(new THREE.Vector3(0, 0, br * 1.6)), T('聲源', 'Source'), pal['rv-src']);
      placeLabel(lblLis, toV(a.lis).add(new THREE.Vector3(0, 0, br * 1.6)), T('聽者', 'Listener'), pal['rv-lis']);
      const tt = (c.formula === 'eyring' ? T('艾林 ', 'Eyring ') : T('賽賓 ', 'Sabine ')) + 'T60 = ' + fmtT(a.T) + '　' + c.L.toFixed(1) + ' × ' + c.W.toFixed(1) + ' × ' + c.H.toFixed(1) + ' m';
      if (lblT.textContent !== tt) lblT.textContent = tt;
      const narrow = (canvas.clientWidth || 640) < 480;
      const nt = narrow ? T('大小真實；拍手時波前放慢', 'to scale; wavefronts slowed')
        : T('房間依真實比例；彩色線是反射路徑（越淡越弱），牆外的淡色球是一次鏡像源；拍手時波前放慢', 'Room to scale; coloured lines are reflection paths (fainter = weaker); faint balls outside are first-order image sources; wavefronts slowed');
      if (note.textContent !== nt) note.textContent = nt;
    }
    function fmtT(t) { return !isFinite(t) ? '∞' : t.toFixed(t < 1 ? 3 : 2) + ' s'; }
    const tmpV = new THREE.Vector3();
    function placeLabel(el, v, text, color) {
      tmpV.copy(v).project(camera);
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (tmpV.z > 1 || tmpV.z < -1) { el.style.display = 'none'; return; }
      el.style.display = '';
      if (el.textContent !== text) el.textContent = text;
      el.style.borderColor = color;
      el.style.transform = 'translate(' + Math.round((tmpV.x + 1) / 2 * w) + 'px,' + Math.round((1 - tmpV.y) / 2 * h) + 'px) translate(-50%, -100%)';
    }

    // ---------- 相機 ----------
    let fitPending = true;
    function fit() {
      const w = canvas.clientWidth || 640, h = canvas.clientHeight || 400, aspect = w / h;
      const L = dims.L, W = dims.W, H = dims.H;
      const target = new THREE.Vector3(0, 0, H * 0.35);
      const dir = new THREE.Vector3(0.55, -1, 0.95).normalize();
      const t = Math.tan(camera.fov * Math.PI / 360);
      const need = 0.5 * Math.sqrt(L * L + W * W + H * H) * 1.02;
      const dist = Math.max(need / t, need / (t * aspect)) * 1.05;
      controls.target.copy(target);
      camera.position.copy(target).addScaledVector(dir, dist);
      camera.near = Math.max(0.05, dist / 100);
      camera.far = dist * 12;
      camera.updateProjectionMatrix();
      controls.minDistance = Math.max(0.5, need * 0.3);
      controls.maxDistance = dist * 4;
      const sd = need * 1.6;
      sun.position.set(-L * 0.6, -W * 1.2, Math.max(H, need) * 2.4);
      sun.target.position.set(0, 0, 0);
      sun.shadow.camera.left = -sd; sun.shadow.camera.right = sd; sun.shadow.camera.top = sd; sun.shadow.camera.bottom = -sd;
      sun.shadow.camera.near = 0.1; sun.shadow.camera.far = need * 8;
      sun.shadow.camera.updateProjectionMatrix();
      rimL.position.set(L, W, H * 2);
      controls.update();
      fitPending = false;
    }

    let raf = 0;
    function renderNow() {
      if (!view.active || document.hidden) return;
      if (fitPending) fit();
      const moved = controls.update();
      renderer.render(scene, camera);
      if (moved) requestRender();
    }
    function requestRender() {
      if (raf || !view.active) return;
      raf = requestAnimationFrame(function () { raf = 0; update(); renderNow(); });
    }
    function resize3() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      fitPending = true;
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

    const view = {
      active: true,
      frame: function () { update(); renderNow(); },
      busy: function () { return raf !== 0; },
      onPlay: function () { requestRender(); },
      onTheme: function () { applyColors(); crowdKey = ''; requestRender(); },
      resetCamera: function () { fit(); requestRender(); },
      dispose: function () {
        view.active = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize3);
        document.removeEventListener('visibilitychange', onVisible);
        controls.dispose();
        disposeTree(room); room = null;
        disposeRays();
        if (crowd) { crowd.body.dispose(); crowd.head.dispose(); crowd = null; }
        Object.keys(G).forEach(function (k) { G[k].dispose(); });
        Object.keys(M).forEach(function (k) { M[k].dispose(); });
        Object.keys(wallMat).forEach(function (k) { wallMat[k].dispose(); });
        openMat.dispose(); waveMat.src.dispose(); waveMat.img.dispose();
        ground.geometry.dispose(); ground.material.dispose();
        if (envTex) envTex.dispose();
        renderer.dispose();
        try { renderer.forceContextLoss(); } catch (e) { /* 繪圖環境已中斷 */ }
        canvas.remove(); layer.remove();
      }
    };

    applyColors();
    update();
    resize3();
    requestRender();
    return view;
  }

  window.ReverbRoom3D = { create: create };
})();
