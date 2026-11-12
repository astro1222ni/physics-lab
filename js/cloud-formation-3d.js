/*
 * cloud-formation-3d.js — 「絕熱冷卻與雲的形成」的 3D 立體檢視（three.js）
 *
 * 由 js/cloud-formation.js 在使用者按「3D 立體」時才載入（three.js 也是那時才以 import() 載入）；切回 2D 時整個釋放。
 * 用法：window.Cloud3D.create({ THREE, OrbitControls }, 容器, bridge) → { active, frame, busy, onShow, onTheme, resetCamera, camTo, dispose }
 *
 * 一切物理量來自 cloud-formation-core.js，與 2D 剖面是同一份計算（bridge.res()）：
 *   地形 terrain、雲底（舉升凝結高度）lcl、背風雲底 zEvap、降水效率、自由對流高度與雲頂 lfc／el、氣塊狀態 stateAtU。
 * 場景座標：x 順著風（迎風 → 背風），y 沿著山脈，z 向上；水平 1 單位 = 10 km，高度誇大 VZ 倍（畫面右下角寫明）。
 * 氣塊沿 y = 0 的剖面走，這條線上的地形高度與 2D 完全相同；其他地方加了一點起伏讓山脈看起來自然（純示意）。
 */
(function () {
  'use strict';
  const KM = 0.1;                 // 1 km 的水平長度（場景單位）
  const VZ = 8;                   // 高度誇大倍數
  const ZU = KM * VZ / 1000;      // 1 m 的高度（場景單位）
  const HALF_Y = 5;               // 山脈長 100 km（y：−5 … 5）
  const BASE = -0.45;             // 方塊底面
  const RAIN_N = 700;

  function create(lib, host, B) {
    const THREE = lib.THREE;
    const K = B.K, T = B.T, state = B.state, D = B.D;
    let C = B.colors();
    const DOMAIN = (K.FOOT_L - K.FOOT_W) > 0 ? 100 / (K.FOOT_L - K.FOOT_W) : 156;   // 剖面總寬（km）
    const XW = DOMAIN * KM;                                                          // 場景中的寬
    const X = function (u) { return (u - 0.5) * XW; };
    const U = function (x) { return x / XW + 0.5; };

    // ---------- 畫布與 HUD ----------
    const wrap = document.createElement('div');
    wrap.className = 'c3-wrap';
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', T('山脈、雲與氣塊的 3D 立體檢視（可拖曳旋轉、縮放）', '3D view of the mountain range, the clouds and the air parcel (drag to rotate, pinch or scroll to zoom)'));
    wrap.appendChild(canvas);
    const hud = document.createElement('div');
    hud.className = 'c3-hud';
    hud.setAttribute('aria-hidden', 'true');
    hud.innerHTML = '<div class="tl"><span data-k="where"></span><span class="m" data-k="pt"></span></div>' +
      '<div class="tr"><span data-k="base"></span><span class="m" data-k="lee"></span></div>' +
      '<div class="br"><span class="m" data-k="scale"></span></div>';
    wrap.appendChild(hud);
    host.appendChild(wrap);
    const hudEl = {};
    hud.querySelectorAll('[data-k]').forEach(function (e) { hudEl[e.getAttribute('data-k')] = e; });

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    } catch (e) {
      wrap.remove();
      throw e;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1.6, 0.1, 200);
    camera.up.set(0, 0, 1);
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.rotateSpeed = 0.8;
    controls.enablePan = false;
    controls.minDistance = 6;
    controls.maxDistance = 60;
    controls.maxPolarAngle = Math.PI * 0.53;

    const hemi = new THREE.HemisphereLight(0xffffff, 0x556655, 0.9);
    hemi.position.set(0, 0, 1);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);   // 陽光從迎風側的左上方照來（與 2D 的光影一致）
    sun.position.set(-9, -7, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -11; sun.shadow.camera.right = 11;
    sun.shadow.camera.top = 11; sun.shadow.camera.bottom = -11;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 40;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.02;
    scene.add(sun);
    scene.add(sun.target);

    const col = function (c) { return new THREE.Color(C[c] || c || '#888888'); };
    function disposeObject(obj) {
      obj.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); });
      });
    }
    function rng(seed) { let s = seed % 2147483647; if (s <= 0) s += 2147483646; return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
    const smooth = function (a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

    // ---------- 地形高度（m）：y = 0 的剖面與核心完全相同 ----------
    function hAt(x, y, H) {
      const u = U(x);
      const base = K.terrain(u, H);
      if (H <= 0) return 0;
      const f = base / H;                                  // 0（山腳）… 1（山頂）
      const n = Math.sin(1.7 * x + 0.6 * y) * 0.5 + Math.sin(2.3 * y - 1.1 * x + 1.3) * 0.32 + Math.sin(3.7 * x + 2.9 * y + 0.4) * 0.18;
      const along = 1 + 0.07 * Math.sin(0.9 * y + 0.5) + 0.05 * Math.sin(2.1 * y + 2);
      const w = Math.min(1, Math.abs(y) / 1.6);          // 剖面線（y = 0）附近不加起伏
      return base * (1 + w * (along - 1)) + w * 0.09 * H * n * Math.sin(Math.PI * f) ;
    }
    const zOf = function (m) { return m * ZU; };

    // ---------- 圖層 ----------
    const groups = {};
    function rebuild(name, key, build) {
      let L = groups[name];
      if (!L) L = groups[name] = { key: null, obj: null };
      if (L.key === key) return L.obj;
      if (L.obj) { scene.remove(L.obj); disposeObject(L.obj); }
      L.obj = build();
      L.key = key;
      if (L.obj) scene.add(L.obj);
      return L.obj;
    }
    let colorVer = 0;

    function buildTerrain() {
      const res = B.res(), H = res.params.H;
      const g = new THREE.Group();
      const NX = 180, NY = 70;
      const pos = new Float32Array((NX + 1) * (NY + 1) * 3);
      const cols = new Float32Array((NX + 1) * (NY + 1) * 3);
      const land = col('cf-land'), forest = col('cf-forest'), rock = col('cf-rock'), snow = col('cf-snow'), sea = col('cf-sea');
      const dry = new THREE.Color(C.dark ? '#8a7448' : '#c9a66b');
      const zSnow = res.params.T0 / res.params.gamma * 1000;              // 周圍大氣 0 °C 的高度
      const dryF = Math.max(0, Math.min(1, (0.55 - res.lee.RH) / 0.35)) * (res.foehn > 0.3 ? 1 : 0);
      const xCoast = X(0.1);
      const c = new THREE.Color();
      let k = 0;
      for (let j = 0; j <= NY; j++) {
        const y = -HALF_Y + 2 * HALF_Y * j / NY;
        for (let i = 0; i <= NX; i++) {
          const x = -XW / 2 + XW * i / NX;
          let m = hAt(x, y, H);
          const coast = xCoast + 0.25 * Math.sin(1.3 * y) + 0.12 * Math.sin(3.1 * y + 1);
          let z = zOf(m);
          if (x < coast) z = -0.03 - 0.05 * smooth(0, 0.6, coast - x);
          pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
          // 顏色：平地 → 森林 → 岩石 → 雪（雪線以上）；背風坡在焚風很乾時偏黃褐
          c.copy(land).lerp(forest, smooth(150, 900, m)).lerp(rock, smooth(1700, 3200, m));
          if (dryF > 0) c.lerp(dry, dryF * smooth(0.5, 0.64, U(x)) * (1 - smooth(1500, 2500, m)) * 0.75);
          if (H > 0 && zSnow < H) c.lerp(snow, smooth(zSnow - 60, zSnow + 120, m));
          if (x < coast) c.copy(sea).multiplyScalar(0.7);
          const n = 0.94 + 0.06 * Math.sin(7.3 * x + 3.1 * y) * Math.sin(5.1 * y - 2.3 * x);
          cols[k * 3] = c.r * n; cols[k * 3 + 1] = c.g * n; cols[k * 3 + 2] = c.b * n;
          k++;
        }
      }
      const idx = [];
      for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
        const a = j * (NX + 1) + i, b = a + 1, d = a + NX + 1, e = d + 1;
        idx.push(a, b, e, a, e, d);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, flatShading: false }));
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      g.add(mesh);
      // 方塊的四個側面（土壤剖面），前面就是 2D 剖面的形狀
      const soil = new THREE.MeshStandardMaterial({ color: new THREE.Color(C.dark ? '#5b4a3a' : '#8a6e52'), roughness: 1 });
      const side = function (pts) {
        const p = [], ix = [];
        pts.forEach(function (q, i) { p.push(q[0], q[1], q[2], q[0], q[1], BASE); if (i) { const a = 2 * (i - 1); ix.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } });
        const sg = new THREE.BufferGeometry();
        sg.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
        sg.setIndex(ix);
        sg.computeVertexNormals();
        const m = new THREE.Mesh(sg, soil);
        m.material.side = THREE.DoubleSide;
        return m;
      };
      const edge = function (fn, n) { const out = []; for (let i = 0; i <= n; i++) out.push(fn(i / n)); return out; };
      const zAt = function (x, y) { const r = (y + HALF_Y) / (2 * HALF_Y) * NY, q = (x + XW / 2) / XW * NX; const i = Math.round(q), j = Math.round(r); return pos[(j * (NX + 1) + i) * 3 + 2]; };
      g.add(side(edge(function (t) { const x = -XW / 2 + XW * t; return [x, -HALF_Y, zAt(x, -HALF_Y)]; }, NX)));
      g.add(side(edge(function (t) { const x = -XW / 2 + XW * t; return [x, HALF_Y, zAt(x, HALF_Y)]; }, NX)));
      g.add(side(edge(function (t) { const y = -HALF_Y + 2 * HALF_Y * t; return [-XW / 2, y, zAt(-XW / 2, y)]; }, NY)));
      g.add(side(edge(function (t) { const y = -HALF_Y + 2 * HALF_Y * t; return [XW / 2, y, zAt(XW / 2, y)]; }, NY)));
      // 海面
      const seaW = xCoast + 0.5 + XW / 2;
      const water = new THREE.Mesh(new THREE.PlaneGeometry(seaW, 2 * HALF_Y),
        new THREE.MeshStandardMaterial({ color: sea, roughness: 0.25, metalness: 0.05, transparent: true, opacity: 0.88 }));
      water.position.set(-XW / 2 + seaW / 2, 0, 0.004);
      water.receiveShadow = true;
      g.add(water);
      // 氣塊走的路線（y = 0）
      const path = [];
      for (let i = 0; i <= 240; i++) { const u = i / 240; path.push(new THREE.Vector3(X(u), 0, zOf(K.terrain(u, H)) + 0.04)); }
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(path), new THREE.LineDashedMaterial({ color: col('text'), dashSize: 0.12, gapSize: 0.12, transparent: true, opacity: 0.55 }));
      line.computeLineDistances();
      g.add(line);
      // 風向箭頭（迎風的海面上空）
      const arrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(X(0.02), -HALF_Y * 0.55, 0.9), 1.6, col('text').getHex(), 0.36, 0.22);
      g.add(arrow);
      return g;
    }

    // ---------- 雲（迎風坡的雲、背風雲、積雨雲）與雲底平面 ----------
    const sphereGeo = new THREE.IcosahedronGeometry(1, 2);
    function buildClouds() {
      const res = B.res(), H = res.params.H;
      const g = new THREE.Group();
      const span = B.cloudSpan(res);
      const list = [];
      const rand = rng(7 + Math.round(H) + Math.round((res.lcl ? res.lcl.z : 0)));
      if (span) {
        const base = res.lcl.z, ev = res.zEvap;
        for (let u = span.uS; u <= span.uE + 1e-9; u += 0.006) {
          const x0 = X(u);
          for (let yy = -HALF_Y + 0.4; yy <= HALF_Y - 0.4; yy += 0.42) {
            const y = yy + (rand() - 0.5) * 0.3;
            const x = x0 + (rand() - 0.5) * 0.08;
            const zt = hAt(x, y, H);
            const dep = B.cloudDepth(U(x), res);
            const floor = U(x) <= 0.5 ? base : Math.max(base, ev);
            const zc = Math.max(zt, floor) + (0.25 + 0.6 * rand()) * dep;
            const r = (0.28 + 0.3 * rand()) * dep;
            if (zc - r * 0.7 < floor) continue;
            if (U(x) > 0.5 && ev >= H - 1e-6 && U(x) > 0.53) continue;
            list.push([x, y, zOf(zc), zOf(r) * 1.25, zOf(r)]);
          }
        }
      }
      // 積雨雲：從自由對流高度往上長到雲頂，頂端的砧狀雲往下風處攤開
      if (res.triggered) {
        const zb = Math.max(res.lcl ? res.lcl.z : 0, Math.min(res.lfc, H));
        const zt = res.el, xc = X(0.53);
        const n = 240;
        for (let i = 0; i < n; i++) {
          const f = i / (n - 1);
          const z = zb + (zt - zb) * Math.pow(f, 0.9);
          const rr = 0.75 + 0.5 * f;
          const x = xc + (rand() - 0.5) * 2.4 * rr + f * 0.4;
          const y = (rand() - 0.5) * 3 * rr;
          const r = (0.5 + 0.4 * rand()) * rr;
          list.push([x, y, zOf(z), r, r * 0.9]);
        }
        for (let i = 0; i < 90; i++) {           // 砧狀雲
          const a = rand() * Math.PI * 2, d = Math.sqrt(rand());
          const x = xc + 0.6 + d * 2.6 * Math.cos(a) + d * 1.4, y = d * 2.2 * Math.sin(a);
          list.push([x, y, zOf(zt) - 0.15 + rand() * 0.2, 0.7 + rand() * 0.4, 0.22]);
        }
      }
      if (list.length) {
        const mat = new THREE.MeshStandardMaterial({ color: col('cf-cloud'), roughness: 1, metalness: 0, transparent: true, opacity: C.dark ? 0.9 : 0.94, emissive: col('cf-cloud'), emissiveIntensity: C.dark ? 0.08 : 0.18 });
        const mesh = new THREE.InstancedMesh(sphereGeo.clone(), mat, list.length);
        const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
        list.forEach(function (c, i) { p.set(c[0], c[1], c[2]); s.set(c[3], c[3], c[4]); m4.compose(p, q, s); mesh.setMatrixAt(i, m4); });
        mesh.castShadow = true;
        g.add(mesh);
      }
      // 雲底平面（舉升凝結高度）：迎風這一側的半透明平面
      if (res.cloud) {
        const x1 = X(Math.max(0.12, span.uS)), x0 = -XW / 2;
        const w = x1 - x0;
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, 2 * HALF_Y),
          new THREE.MeshBasicMaterial({ color: col('cf-rain'), transparent: true, opacity: C.dark ? 0.16 : 0.13, depthWrite: false, side: THREE.DoubleSide }));
        plane.position.set(x0 + w / 2, 0, zOf(res.lcl.z));
        g.add(plane);
        const edgeG = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(x0, -HALF_Y, zOf(res.lcl.z)), new THREE.Vector3(x1, -HALF_Y, zOf(res.lcl.z)),
          new THREE.Vector3(x1, HALF_Y, zOf(res.lcl.z)), new THREE.Vector3(x0, HALF_Y, zOf(res.lcl.z)), new THREE.Vector3(x0, -HALF_Y, zOf(res.lcl.z))]);
        const edge = new THREE.Line(edgeG, new THREE.LineDashedMaterial({ color: col('cf-rain'), dashSize: 0.15, gapSize: 0.1 }));
        edge.computeLineDistances();
        g.add(edge);
        g.add(label(T('雲底 ', 'Cloud base ') + B.meters(res.lcl.z), C['cf-rain'], x0 + 0.2, -HALF_Y, zOf(res.lcl.z) + 0.05));
      }
      if (res.triggered) g.add(label(T('積雨雲，雲頂 ', 'Cumulonimbus, top ') + B.km(res.el, 1), C['cf-lee'], X(0.55), 0, zOf(res.el) + 0.5));
      if (H > 0) g.add(label(T('山頂 ', 'Crest ') + B.meters(H), C.text, X(0.5), -HALF_Y, zOf(hAt(0, -HALF_Y, H)) + 0.12));
      return g;
    }

    // ---------- 文字標籤（Sprite，固定像素大小） ----------
    const RES = 3;
    function label(text, color, x, y, z) {
      const font = '600 ' + 12 * RES + 'px ' + D.FONT;
      const c = document.createElement('canvas');
      let g = c.getContext('2d');
      g.font = font;
      const tw = g.measureText(text).width;
      c.width = Math.ceil(tw + 12 * RES); c.height = Math.ceil(19 * RES);
      g = c.getContext('2d');
      g.beginPath();
      const r = c.height / 2 - RES;
      g.moveTo(r + RES, RES); g.arcTo(c.width - RES, RES, c.width - RES, c.height - RES, r); g.arcTo(c.width - RES, c.height - RES, RES, c.height - RES, r);
      g.arcTo(RES, c.height - RES, RES, RES, r); g.arcTo(RES, RES, c.width - RES, RES, r); g.closePath();
      g.fillStyle = D.alpha(C['canvas-bg'], C.dark ? 0.86 : 0.9); g.fill();
      g.strokeStyle = D.alpha(color, 0.5); g.lineWidth = RES; g.stroke();
      g.font = font; g.textBaseline = 'middle'; g.fillStyle = color; g.fillText(text, 6 * RES, c.height / 2 + RES * 0.5);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false }));
      sp.userData = { lw: c.width / RES, lh: c.height / RES, isLabel: true };
      sp.center.set(0, 0);
      sp.position.set(x, y, z);
      sp.renderOrder = 30;
      fitLabel(sp);
      return sp;
    }
    function fitLabel(sp) {
      const k = 2 * Math.tan(camera.fov * Math.PI / 360) / Math.max(1, ch);
      sp.scale.set(sp.userData.lw * k, sp.userData.lh * k, 1);
    }

    // ---------- 雨（每一幀更新位置） ----------
    const rainGeo = new THREE.BufferGeometry();
    const rainPos = new Float32Array(RAIN_N * 6);
    rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
    const rainMat = new THREE.LineBasicMaterial({ color: col('cf-rain'), transparent: true, opacity: 0.7 });
    const rain = new THREE.LineSegments(rainGeo, rainMat);
    rain.frustumCulled = false;
    scene.add(rain);
    let drops = [], rainKey = '';
    function setupRain() {
      const res = B.res(), H = res.params.H, span = B.cloudSpan(res);
      drops = [];
      if (span && res.params.eff > 0 && H > 0) {
        const rand = rng(31);
        const n = Math.round(RAIN_N * (0.25 + 0.75 * res.params.eff));
        const uMax = Math.min(0.5, span.uE);
        for (let i = 0; i < n; i++) {
          const u = span.uS + (uMax - span.uS) * rand();
          const x = X(u), y = -HALF_Y + 0.3 + (2 * HALF_Y - 0.6) * rand();
          const zt = hAt(x, y, H);
          const top = zOf(Math.max(res.lcl.z, zt) + B.cloudDepth(u, res) * 0.35), bot = zOf(zt) + 0.01;
          if (top - bot < 0.03) continue;
          drops.push([x, y, top, bot, rand()]);
        }
      }
      rainGeo.setDrawRange(0, drops.length * 2);
      rain.visible = drops.length > 0;
    }
    function stepRain(t) {
      const L = 0.09;
      for (let i = 0; i < drops.length; i++) {
        const d = drops[i];
        const ph = (t * 0.55 + d[4]) % 1;
        const z = d[2] - ph * (d[2] - d[3]);
        rainPos[i * 6] = d[0]; rainPos[i * 6 + 1] = d[1]; rainPos[i * 6 + 2] = z;
        rainPos[i * 6 + 3] = d[0] + 0.012; rainPos[i * 6 + 4] = d[1]; rainPos[i * 6 + 5] = Math.max(d[3], z - L);
      }
      rainGeo.attributes.position.needsUpdate = true;
    }

    // ---------- 氣塊 ----------
    const parcelMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.05, emissive: 0x000000 });
    const parcel = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), parcelMat);
    parcel.castShadow = true;
    scene.add(parcel);
    const fogMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.5, depthWrite: false });
    const fogBall = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), fogMat);
    scene.add(fogBall);
    function updateParcel() {
      const res = B.res(), p = B.parcelNow(), H = res.params.H, s0 = res.start;
      const r = 0.2 * Math.cbrt((p.T / p.p) / (s0.T / s0.p));
      const x = X(state.u);
      parcel.scale.setScalar(r);
      parcel.position.set(x, 0, zOf(K.terrain(state.u, H)) + r + 0.06);
      parcelMat.color.set(B.tempColor(p.T));
      parcelMat.emissive.set(B.tempColor(p.T)).multiplyScalar(C.dark ? 0.25 : 0.12);
      const wet = p.RH >= 0.9995 || p.l > 1e-7;
      fogBall.visible = wet;
      fogBall.scale.setScalar(r * 1.18);
      fogBall.position.copy(parcel.position);
      fogMat.color.set(C['cf-cloud']);
    }

    // ---------- HUD ----------
    const hudLast = {};
    function setHud(k, txt) { if (hudLast[k] !== txt) { hudLast[k] = txt; hudEl[k].textContent = txt; } }
    function updateHud() {
      const res = B.res(), p = B.parcelNow();
      setHud('where', (narrow ? '' : B.whereName(p) + T('・', ' · ')) + B.meters(p.z) + T('・', ' · ') + B.degC(p.T));
      setHud('pt', T('相對溼度 ', 'Humidity ') + B.pct(p.RH) + (p.l > 1e-7 ? T('・雲滴 ', ' · cloud water ') + B.num(p.l * 1000, 2) + ' g/kg' : ''));
      setHud('base', res.cloud ? T('雲底 ', 'Cloud base ') + B.meters(res.lcl.z) : T('沒有成雲', 'No cloud'));
      setHud('lee', (narrow ? T('背風 ', 'Lee ') : T('背風山腳 ', 'Lee foot ')) + B.degC(res.lee.T) + T('・', ' · ') + B.pct(res.lee.RH) + (res.foehn > 0.05 && !narrow ? T('（焚風 +', ' (foehn +') + B.num(res.foehn, 1) + ' °C' + T('）', ')') : ''));
      if (narrow) setHud('pt', T('溼度 ', 'RH ') + B.pct(p.RH));
      setHud('scale', narrow
        ? T('高度誇大 ', 'Heights ×') + VZ + T(' 倍', '')
        : T('示意：高度誇大 ' + VZ + ' 倍；山脈寬 100 km、長 100 km', 'Heights exaggerated ×' + VZ + '; the range is 100 km wide and 100 km long'));
    }

    // ---------- 更新與繪製 ----------
    let cw = 300, ch = 200, narrow = false;
    function update() {
      const v = state.ver + '|' + colorVer;
      rebuild('terrain', v, buildTerrain);
      rebuild('clouds', v, buildClouds);
      if (rainKey !== v) { rainKey = v; setupRain(); rainMat.color.copy(col('cf-rain')); stepRain(0.37); }
      updateParcel();
      updateHud();
    }
    function sizeOf(w) { return w < 560 ? 360 : 430; }
    function resize3() {
      const w = wrap.clientWidth;
      if (!w) return;
      const h = sizeOf(w);
      if (canvas.style.height !== h + 'px') canvas.style.height = h + 'px';
      const nar = w < 560;
      if (nar !== narrow) { narrow = nar; Object.keys(hudLast).forEach(function (k) { delete hudLast[k]; }); }
      cw = w; ch = h;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      scene.traverse(function (o) { if (o.userData && o.userData.isLabel) fitLabel(o); });
      render();
    }
    // 相機預設：側面（和 2D 剖面一樣）、斜看、從背風處回看
    const PRESETS = {
      side: { pos: [0, -19, 3], tgt: [0, 0, 1.1] },
      oblique: { pos: [-8.5, -13, 7.5], tgt: [0.5, 0, 0.9] },
      lee: { pos: [16, -8, 5], tgt: [-1, 0, 1.4] }
    };
    let camAnim = null;
    function presetFor(kind) {
      const P = PRESETS[kind] || PRESETS.oblique;
      const res = B.res();
      // 積雨雲長得很高時，鏡頭對準雲的半高並拉遠，讓雲頂與砧狀雲都在畫面裡
      const top = res.triggered ? zOf(res.el) : 0;
      const k = (camera.aspect < 1.2 ? 1.3 : 1) * (res.triggered ? Math.max(1.2, 0.6 + top / 12) : 1);
      const tgt = new THREE.Vector3().fromArray(P.tgt);
      if (res.triggered) tgt.z = Math.max(tgt.z, top * 0.5);
      const pos = new THREE.Vector3().fromArray(P.pos).sub(new THREE.Vector3().fromArray(P.tgt)).multiplyScalar(k).add(tgt);
      return { pos: pos, tgt: tgt };
    }
    function camTo(kind, animate) {
      const P = presetFor(kind);
      if (!animate || B.reducedMotion) {
        camAnim = null;
        camera.position.copy(P.pos); controls.target.copy(P.tgt); controls.update(); render();
        return;
      }
      camAnim = { t0: performance.now(), dur: 750, p0: camera.position.clone(), t0v: controls.target.clone(), p1: P.pos, t1: P.tgt };
      B.request();
    }
    function stepCam() {
      if (!camAnim) return;
      const A = camAnim;
      const u = Math.min(1, (performance.now() - A.t0) / A.dur), e = 1 - Math.pow(1 - u, 3);
      camera.position.copy(A.p0).lerp(A.p1, e);
      controls.target.copy(A.t0v).lerp(A.t1, e);
      if (u >= 1) camAnim = null;
    }
    let moving = false;
    function render(now) {
      if (!api.active || document.hidden) return;
      const want = Math.min(window.devicePixelRatio || 1, 2);
      if (renderer.getPixelRatio() !== want) { renderer.setPixelRatio(want); renderer.setSize(cw, ch, false); }
      stepCam();
      moving = controls.update();
      if (drops.length && !B.reducedMotion) stepRain((now || performance.now()) / 1000);
      renderer.render(scene, camera);
    }
    const ro = window.ResizeObserver ? new ResizeObserver(function () { resize3(); }) : null;
    if (ro) ro.observe(wrap); else window.addEventListener('resize', resize3);
    controls.addEventListener('change', function () { B.request(); });
    canvas.addEventListener('pointerdown', function () { controls.autoRotate = false; });
    canvas.addEventListener('webglcontextlost', function (ev) {
      ev.preventDefault();
      if (api.active && B.onContextLost) B.onContextLost();
    });

    const api = {
      active: true,
      frame: function (now) { update(); render(now); },
      busy: function () { return !!camAnim || moving || (drops.length > 0 && !B.reducedMotion); },
      onShow: function () { resize3(); camTo('oblique', false); },
      onTheme: function () {
        C = B.colors();
        colorVer++;
        Object.keys(hudLast).forEach(function (k) { delete hudLast[k]; });
        update(); render();
      },
      resetCamera: function () { camTo('oblique', true); },
      camTo: function (kind) { camTo(kind, true); },
      dispose: function () {
        api.active = false;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize3);
        controls.dispose();
        disposeObject(scene);
        sphereGeo.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        wrap.remove();
      }
    };

    // 初始化
    const w0 = wrap.clientWidth;
    if (w0) {
      narrow = w0 < 560;
      cw = w0; ch = sizeOf(w0);
      canvas.style.height = ch + 'px';
      renderer.setSize(cw, ch, false);
      camera.aspect = cw / ch;
      camera.updateProjectionMatrix();
    }
    update();
    camTo('oblique', false);
    return api;
  }

  window.Cloud3D = { create: create };
})();
