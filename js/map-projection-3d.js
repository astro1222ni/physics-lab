/*
 * map-projection-3d.js — 「地圖投影與變形」的 3D 地球與投影面（three.js）
 *
 * 由 js/map-projection.js 在使用者按「3D 地球與投影面」時才載入（three.js 也是那時才以 import() 載入）；切回 2D 時整個釋放。
 * 用法：window.MapProjection3D.create({ THREE, OrbitControls }, 容器, bridge) → { active, frame, busy, onShow, onTheme, onMap, onUnroll, resetCamera, camTo, dispose }
 *
 * 場景座標：地球半徑 1，北極朝 +z，經度 0° 朝 +x、東經 90° 朝 +y（和核心的 toVec 一樣）。
 * 投影面：網格的每個頂點是一個經緯度，貼圖座標取等距圓柱影像上的位置；頂點位置由「目前投影的平面座標」決定：
 *   圓柱：平面座標 x 是繞圓柱的弧長、y 是高度；圓柱半徑 r = 赤道上一經度弧度的 x（麥卡托、等距 1，等積圓柱 cos φs）。
 *   圓錐：平面極座標（ρ, nλ）；捲成半頂角 α（sin α = n）的圓錐，離軸 ρn、尖端以下 ρ√(1−n²)。
 *   方位：平面和地球相切於中心點。
 * 攤開滑桿是「保持長度的彎曲」：圓柱的曲率半徑由 r 漸變到無限大，圓錐的 n 漸變到 1（變成平的圓盤），中央經線不動，
 * 所以攤平時就是 2D 地圖本身（比例和 2D 相同），中間的過程像把紙慢慢攤開，不會拉伸。
 */
(function () {
  'use strict';
  const DEG = Math.PI / 180, PI = Math.PI;

  function create(lib, host, B) {
    const THREE = lib.THREE;
    const K = B.K, T = B.T, state = B.state, D = B.D;
    let C = B.colors();

    // ---------- 畫布與 HUD ----------
    const wrap = document.createElement('div');
    wrap.className = 'c3-wrap';
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', T('地球與投影面的 3D 檢視（可拖曳旋轉、縮放）；黃色是比例正確的線或點', '3D view of the globe and the projection surface (drag to rotate, pinch or scroll to zoom); yellow marks where the scale is true'));
    wrap.appendChild(canvas);
    const hud = document.createElement('div');
    hud.className = 'c3-hud';
    hud.setAttribute('aria-hidden', 'true');
    hud.innerHTML = '<div class="tl"><span data-k="name"></span><span class="m" data-k="surf"></span></div>' +
      '<div class="br"><span class="m" data-k="std"></span><span class="m" data-k="note"></span></div>';
    wrap.appendChild(hud);
    host.appendChild(wrap);
    const hudEl = {}, hudLast = {};
    hud.querySelectorAll('[data-k]').forEach(function (e) { hudEl[e.getAttribute('data-k')] = e; });
    function setHud(k, txt) { if (hudLast[k] !== txt) { hudLast[k] = txt; hudEl[k].textContent = txt; } }

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    } catch (e) {
      wrap.remove();
      throw e;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1.6, 0.05, 200);
    camera.up.set(0, 0, 1);
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.rotateSpeed = 0.7;
    controls.enablePan = false;
    controls.minDistance = 2.2;
    controls.maxDistance = 30;

    // 柔和的全天光＋一盞斜射的主光，讓地球有立體感但每個地方都看得清楚
    scene.add(new THREE.HemisphereLight(0xdbe8ff, 0x2a3140, 1.15));
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(4, -3, 5);
    scene.add(key);

    const V = function (a) { return new THREE.Vector3(a[0], a[1], a[2]); };
    const col = function (c) { return new THREE.Color(C[c] || c || '#888888'); };
    function disposeObject(obj) {
      obj.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m.map && m.map !== mapTex) m.map.dispose(); m.dispose(); });
      });
    }
    function clearGroup(g) { disposeObject(g); g.clear(); }

    // ---------- 地圖貼圖（等距圓柱：衛星影像或平面色＋經緯網），地球與投影面共用 ----------
    let mapTex = null, texKey = '';
    function updateTexture() {
      const k = [state.img ? 1 : 0, state.grid ? 1 : 0, B.hasImage() ? 1 : 0, D.ver].join('|');
      if (k === texKey) return;
      texKey = k;
      const cnv = B.mapTexture(2048, 1024);
      const t = new THREE.CanvasTexture(cnv);
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = THREE.RepeatWrapping;
      t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      const old = mapTex;
      mapTex = t;
      earthMat.map = t; earthMat.needsUpdate = true;
      surfMat.map = t; surfMat.needsUpdate = true;
      if (old) old.dispose();
    }

    // ---------- 地球 ----------
    const earthGeo = new THREE.SphereGeometry(1, 128, 64);
    earthGeo.rotateX(PI / 2);   // 讓 u = 0 落在經度 −180°、北極朝 +z
    const earthMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 });
    const earth = new THREE.Mesh(earthGeo, earthMat);
    earth.renderOrder = 0;
    scene.add(earth);
    // 淡淡的大氣光暈
    const halo = new THREE.Mesh(new THREE.SphereGeometry(1.035, 64, 32), new THREE.MeshBasicMaterial({ color: 0x8cc4ff, transparent: true, opacity: 0.1, side: THREE.BackSide, depthWrite: false }));
    scene.add(halo);

    // ---------- 投影面 ----------
    const surfMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0, side: THREE.FrontSide, transparent: true, opacity: 0.6, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    let surf = null;              // THREE.Mesh
    let mesh = null;              // { kind, verts: [{mx, my, lrel}], pos: Float32Array, ... }
    const edgeMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 });
    let edge = null;

    /** 投影面的網格：在「平面座標」上取點（圓柱、圓錐用經緯格；方位用以中心為圓心的極座標格），每個頂點記下經緯度與平面座標 */
    function buildMesh() {
      const P = B.proj(), fam = P.family;
      if (surf) { scene.remove(surf); surf.geometry.dispose(); surf = null; }
      if (edge) { scene.remove(edge); edge.geometry.dispose(); edge = null; }
      mesh = null;
      if (fam === 'pseudo') return;
      const cells = [];            // 每個格子四個角：[{lam, phi, mx, my}]
      const lam0 = P.lam0;
      let NU, NV, at;
      if (fam === 'azi') {
        const f0 = P.phi0 * DEG, sf = Math.sin(f0), cf = Math.cos(f0);
        NU = 96; NV = Math.max(24, Math.round(P.cmax / DEG / 3));
        at = function (i, j) {                       // i：方位角，j：離中心的角距
          const az = 2 * PI * i / NU, c = P.cmax * j / NV;
          const f = Math.asin(Math.max(-1, Math.min(1, sf * Math.cos(c) + cf * Math.sin(c) * Math.cos(az))));
          const dl = Math.atan2(Math.sin(az) * Math.sin(c) * cf, Math.cos(c) - sf * Math.sin(f));
          const r = P.rhoOf(c);
          return { lam: lam0 + dl, phi: f, mx: r * Math.sin(az), my: r * Math.cos(az) };
        };
      } else {
        const f0 = P.latRange[0], f1 = P.latRange[1];
        NU = 144; NV = Math.max(30, Math.round((f1 - f0) / DEG / 2.5));
        at = function (i, j) {
          const lrel = -PI + 2 * PI * i / NU, f = f0 + (f1 - f0) * j / NV;
          const q = P.raw(lrel, f);
          return { lam: lam0 + lrel, phi: f, mx: q[0], my: q[1], lrel: lrel };
        };
      }
      const grid = [];
      for (let j = 0; j <= NV; j++) { const row = []; for (let i = 0; i <= NU; i++) row.push(at(i, j)); grid.push(row); }
      // 非索引幾何：每個三角形自己的貼圖座標，跨過經度 ±180° 的三角形把 u 補 1（貼圖設成重複，所以取樣正確）
      const tris = [];
      for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
        const a = grid[j][i], b = grid[j][i + 1], c = grid[j + 1][i + 1], d = grid[j + 1][i];
        if (fam === 'azi' && j === 0) { tris.push([a, c, d]); continue; }
        tris.push([a, b, c], [a, c, d]);
      }
      const n = tris.length * 3;
      const uv = new Float32Array(n * 2), pos = new Float32Array(n * 3);
      const verts = new Array(n);
      tris.forEach(function (t, ti) {
        const us = t.map(function (p) { return (p.lam / PI + 1) / 2; });
        const base = Math.floor(Math.min.apply(null, us));
        for (let k = 0; k < 3; k++) {
          let u = us[k] - base;
          if (Math.max.apply(null, us) - Math.min.apply(null, us) > 0.5 && u < 0.5) u += 1;
          const p = t[k], vi = ti * 3 + k;
          uv[vi * 2] = u; uv[vi * 2 + 1] = 0.5 + t[k].phi / PI;
          verts[vi] = p;
        }
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      surf = new THREE.Mesh(geo, surfMat);
      surf.renderOrder = 4;
      scene.add(surf);
      // 投影面的外框（攤平時就是 2D 地圖的外框）
      const ring = [];
      if (fam === 'azi') { for (let i = 0; i <= NU; i++) ring.push(grid[NV][i]); }
      else {
        for (let i = 0; i <= NU; i++) ring.push(grid[0][i]);
        for (let j = 0; j <= NV; j++) ring.push(grid[j][NU]);
        for (let i = NU; i >= 0; i--) ring.push(grid[NV][i]);
        for (let j = NV; j >= 0; j--) ring.push(grid[j][0]);
      }
      const eg = new THREE.BufferGeometry();
      eg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ring.length * 3), 3));
      edge = new THREE.Line(eg, edgeMat);
      edge.renderOrder = 5;
      scene.add(edge);
      mesh = { fam: fam, P: P, verts: verts, pos: pos, ring: ring, geo: geo, eg: eg };
      placeSurface();
    }

    /** 由攤開程度 u 算出投影面上一點（平面座標 mx、my）的 3D 位置 */
    function surfacePoint(P, mx, my, u, out) {
      const lam0 = P.lam0;
      const d0 = [Math.cos(lam0), Math.sin(lam0), 0], e0 = [-Math.sin(lam0), Math.cos(lam0), 0];
      if (P.family === 'azi') {
        const f0 = P.phi0 * DEG;
        const c = K.toVec(lam0, f0);
        const east = [-Math.sin(lam0), Math.cos(lam0), 0];
        const north = [-Math.sin(f0) * Math.cos(lam0), -Math.sin(f0) * Math.sin(lam0), Math.cos(f0)];
        for (let k = 0; k < 3; k++) out[k] = c[k] * 1.002 + mx * east[k] + my * north[k];
        return out;
      }
      const n = P.n;
      if (P.family === 'conic' && Math.abs(n) >= 1e-6) {
        // 圓錐：極座標 ρ（帶正負號）、角度 θ = atan2；保持長度地把 n 漸變到 1
        const s = Math.sign(n);
        const rho = Math.hypot(mx, my), th = Math.atan2(s * mx, -s * my);   // θ = nλ
        const ne = Math.abs(n) + (1 - Math.abs(n)) * u;
        const az = lam0 + th / ne * s;
        const r = rho * ne, h = rho * Math.sqrt(Math.max(0, 1 - ne * ne));
        out[0] = r * Math.cos(az); out[1] = r * Math.sin(az); out[2] = coneApex(P) - s * h;
        return out;
      }
      // 圓柱（也包括 n = 0 的圓錐）：半徑 rc；曲率半徑 rc/(1−u)，中央經線不動
      const rc = cylRadius(P);
      if (u > 0.9995) {
        for (let k = 0; k < 2; k++) out[k] = rc * d0[k] + mx * e0[k];
        out[2] = my; return out;
      }
      const R = rc / (1 - u), a = mx / R;
      for (let k = 0; k < 2; k++) out[k] = (rc - R) * d0[k] + R * (Math.cos(a) * d0[k] + Math.sin(a) * e0[k]);
      out[2] = my;
      return out;
    }
    function cylRadius(P) { const q = P.raw(1e-3, 0); return Math.abs(q[0]) / 1e-3; }
    /** 圓錐尖端的高度：讓圓錐在兩條標準緯線的高度和地球上的緯線圈平均起來吻合 */
    function coneApex(P) {
      if (P._apex != null) return P._apex;
      const n = P.n, s = Math.sign(n), w = Math.sqrt(Math.max(0, 1 - n * n));
      const hz = [P.phi1, P.phi2].map(function (fd) {
        const q = P.raw(0, fd * DEG), rho = Math.hypot(q[0], q[1]);
        return Math.sin(fd * DEG) + s * rho * w;
      });
      P._apex = (hz[0] + hz[1]) / 2;
      return P._apex;
    }
    const tmp = [0, 0, 0];
    function placeSurface() {
      if (!mesh) return;
      const u = state.unroll, P = mesh.P, pos = mesh.pos;
      for (let i = 0; i < mesh.verts.length; i++) {
        const p = mesh.verts[i];
        surfacePoint(P, p.mx, p.my, u, tmp);
        pos[i * 3] = tmp[0]; pos[i * 3 + 1] = tmp[1]; pos[i * 3 + 2] = tmp[2];
      }
      mesh.geo.attributes.position.needsUpdate = true;
      mesh.geo.computeVertexNormals();
      mesh.geo.computeBoundingSphere();
      const ep = mesh.eg.attributes.position.array;
      mesh.ring.forEach(function (p, i) { surfacePoint(P, p.mx, p.my, u, tmp); ep[i * 3] = tmp[0]; ep[i * 3 + 1] = tmp[1]; ep[i * 3 + 2] = tmp[2]; });
      mesh.eg.attributes.position.needsUpdate = true;
      mesh.eg.computeBoundingSphere();
      // 圓柱、圓錐的網格繞向讓「外側」是正面：包住地球時只畫外側，看得到裡面的地球；平面兩面都畫
      surfMat.side = mesh.fam === 'azi' ? THREE.DoubleSide : THREE.FrontSide;
      surfMat.opacity = mesh.fam === 'azi' ? 0.55 : 0.36 + 0.62 * u;
      surfMat.needsUpdate = true;
      surfMat.depthWrite = u > 0.98;
      placeRays();
    }

    // ---------- 比例正確的線（標準緯線）或點（切點） ----------
    const stdGroup = new THREE.Group();
    scene.add(stdGroup);
    const STD = '#fde047';
    function tube(points, color, radius, closed, opacity) {
      if (points.length < 2) return new THREE.Group();
      const curve = new THREE.CatmullRomCurve3(points.map(V), !!closed, 'centripetal');
      const g = new THREE.TubeGeometry(curve, Math.min(600, points.length * 3), radius, 8, !!closed);
      const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: opacity != null && opacity < 1, opacity: opacity == null ? 1 : opacity });
      const mesh = new THREE.Mesh(g, m);
      mesh.renderOrder = 8;
      return mesh;
    }
    function parallel(fd, r) { const pts = []; for (let i = 0; i < 180; i++) { const l = 2 * PI * i / 180; pts.push(K.toVec(l, fd * DEG).map(function (x) { return x * r; })); } return pts; }
    function standardLats(P) {
      if (P.family === 'cyl') return P.id === 'cea' ? (Math.abs(P.phiS) < 0.05 ? [0] : [P.phiS, -P.phiS]) : [0];
      if (P.family === 'conic') return Math.abs(P.phi1 - P.phi2) < 0.05 ? [P.phi1] : [P.phi1, P.phi2];
      return [];
    }
    function buildStd() {
      clearGroup(stdGroup);
      const P = B.proj();
      if (P.family === 'pseudo') return;
      if (P.family === 'azi') {
        const c = K.toVec(P.lam0, P.phi0 * DEG);
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.03, 20, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(STD) }));
        dot.position.set(c[0] * 1.004, c[1] * 1.004, c[2] * 1.004);
        dot.renderOrder = 9;
        stdGroup.add(dot);
        stdGroup.add(label(T('切點（比例 = 1）', 'Point of contact (scale = 1)'), STD, V(c).multiplyScalar(1.12)));
        return;
      }
      standardLats(P).forEach(function (fd, i) {
        stdGroup.add(tube(parallel(fd, 1.004), STD, 0.009, true));
        const l = P.lam0 + 0.9;
        const p = K.toVec(l, fd * DEG);
        const nm = Math.abs(fd) < 0.05 ? T('赤道', 'Equator') : T('標準緯線 ', 'Standard parallel ') + B.num(Math.abs(fd), 1) + '°' + (fd > 0 ? 'N' : 'S');
        stdGroup.add(label(nm + T('（比例 = 1）', ' (scale = 1)'), STD, V(p).multiplyScalar(1.1)));
      });
    }

    // ---------- 透視投影的光源與光線 ----------
    const rayGroup = new THREE.Group();
    scene.add(rayGroup);
    function placeRays() {
      clearGroup(rayGroup);
      const P = B.proj();
      if (P.family !== 'azi' || ['gnomonic', 'stereo', 'ortho'].indexOf(P.id) < 0) return;
      const f0 = P.phi0 * DEG, c = K.toVec(P.lam0, f0);
      const lightCol = new THREE.Color('#fbbf24');
      let src = null;
      if (P.id === 'gnomonic') src = [0, 0, 0];
      if (P.id === 'stereo') src = [-c[0], -c[1], -c[2]];
      if (src) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(0.05, 20, 12), new THREE.MeshBasicMaterial({ color: lightCol, depthTest: false, transparent: true }));
        s.position.set(src[0], src[1], src[2]);
        s.renderOrder = 20;
        rayGroup.add(s);
        const glow = new THREE.Mesh(new THREE.SphereGeometry(0.11, 20, 12), new THREE.MeshBasicMaterial({ color: lightCol, transparent: true, opacity: 0.25, depthTest: false, depthWrite: false }));
        glow.position.copy(s.position); glow.renderOrder = 19;
        rayGroup.add(glow);
        rayGroup.add(label(P.id === 'gnomonic' ? T('光源在地心', 'Light at the centre') : T('光源在對蹠點', 'Light at the antipode'), '#fbbf24', V(src).add(V([0, 0, -0.18])), false));
      }
      // 幾條光線：從光源經過地球上的點，打到投影面
      const segs = [];
      const sf = Math.sin(f0), cf = Math.cos(f0);
      const dists = P.id === 'gnomonic' ? [30, 55] : P.id === 'stereo' ? [45, 90] : [40, 75];
      dists.forEach(function (cd) {
        for (let k = 0; k < 6; k++) {
          const az = 2 * PI * k / 6 + 0.3, cc = cd * DEG;
          const f = Math.asin(sf * Math.cos(cc) + cf * Math.sin(cc) * Math.cos(az));
          const dl = Math.atan2(Math.sin(az) * Math.sin(cc) * cf, Math.cos(cc) - sf * Math.sin(f));
          const g = K.toVec(P.lam0 + dl, f);
          const r = P.rhoOf(cc);
          const img = surfacePoint(P, r * Math.sin(az), r * Math.cos(az), 1, [0, 0, 0]);
          const from = src ? src : [g[0] - c[0] * 2.2, g[1] - c[1] * 2.2, g[2] - c[2] * 2.2];   // 正射：平行光從很遠的地方來
          segs.push(from, img);
          segs.push(g, g);   // 佔位：讓每條光線在地表那一點有一個亮點
        }
      });
      const lines = [], dots = [];
      for (let i = 0; i < segs.length; i += 4) { lines.push(segs[i], segs[i + 1]); dots.push(segs[i + 2]); }
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array([].concat.apply([], lines)), 3));
      const lm = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: lightCol, transparent: true, opacity: 0.75 }));
      lm.renderOrder = 12;
      rayGroup.add(lm);
      const dg = new THREE.SphereGeometry(0.018, 10, 8), dmat = new THREE.MeshBasicMaterial({ color: lightCol });
      dots.forEach(function (p, i) { const m = new THREE.Mesh(i ? dg.clone() : dg, i ? dmat.clone() : dmat); m.position.set(p[0] * 1.004, p[1] * 1.004, p[2] * 1.004); m.renderOrder = 13; rayGroup.add(m); });
    }

    // ---------- 地球上的航線、陸塊、量測點（在球面上都是真實的形狀與大小） ----------
    const overGroup = new THREE.Group();
    scene.add(overGroup);
    function lift(pts, r) { return pts.map(function (p) { const v = K.toVec(p[0], p[1]); return [v[0] * r, v[1] * r, v[2] * r]; }); }
    function buildOverlays() {
      clearGroup(overGroup);
      const R = B.route();
      if (R) {
        overGroup.add(tube(lift(K.geodesic(R.A, R.B, 160), 1.008), C['mp-gc'], 0.011, false));
        overGroup.add(tube(lift(K.rhumb(R.A, R.B, 200).points, 1.008), C['mp-rh'], 0.008, false, 0.95));
        [R.A, R.B].forEach(function (p, i) {
          const v = K.toVec(p[0], p[1]);
          const m = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 10), new THREE.MeshStandardMaterial({ color: col('mp-gc'), roughness: 0.4 }));
          m.position.set(v[0] * 1.012, v[1] * 1.012, v[2] * 1.012);
          overGroup.add(m);
          overGroup.add(label(i ? 'B' : 'A', C['mp-gc'], V(v).multiplyScalar(1.09)));
        });
      }
      const ring = B.shapeRing();
      if (ring) overGroup.add(tube(lift(ring, 1.006), C['mp-shape'], 0.007, true));
      B.probes().forEach(function (p, i, a) {
        const v = K.toVec(p.lam, p.phi);
        const m = new THREE.Mesh(new THREE.SphereGeometry(i === a.length - 1 ? 0.026 : 0.018, 14, 10), new THREE.MeshStandardMaterial({ color: col('mp-probe'), roughness: 0.4 }));
        m.position.set(v[0] * 1.01, v[1] * 1.01, v[2] * 1.01);
        overGroup.add(m);
      });
    }

    // ---------- 文字標籤（Sprite，固定像素大小） ----------
    const RES = 3;
    let cw = 600, ch = 460;
    function label(text, color, pos, anchorRight) {
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
      g.fillStyle = 'rgba(8,14,24,0.8)'; g.fill();
      g.strokeStyle = color; g.globalAlpha = 0.6; g.lineWidth = RES; g.stroke(); g.globalAlpha = 1;
      g.font = font; g.textBaseline = 'middle'; g.fillStyle = color; g.fillText(text, 6 * RES, c.height / 2 + RES * 0.5);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false }));
      sp.userData = { lw: c.width / RES, lh: c.height / RES, isLabel: true };
      sp.center.set(anchorRight ? 1 : 0, 0.5);
      sp.position.copy(pos);
      sp.renderOrder = 30;
      fitLabel(sp);
      return sp;
    }
    function fitLabel(sp) {
      const k = 2 * Math.tan(camera.fov * Math.PI / 360) / Math.max(1, ch);
      sp.scale.set(sp.userData.lw * k, sp.userData.lh * k, 1);
    }

    // ---------- 更新 ----------
    let projKey = '', overKey = '', unrollKey = -1, labelLang = '';
    function update() {
      updateTexture();
      const P = B.proj();
      const lang = T('zh', 'en');
      const pk = [P.id, P.lam0, P.phiS, P.phi1, P.phi2, P.phi0, lang].join('|');
      if (pk !== projKey) { projKey = pk; buildMesh(); buildStd(); unrollKey = state.unroll; }
      else if (state.unroll !== unrollKey) { unrollKey = state.unroll; placeSurface(); }
      const R = state.route ? [state.A, state.B] : null;
      const ok = JSON.stringify([R, state.shape, state.shapeAt, state.probes, D.ver, lang]);
      if (ok !== overKey) { overKey = ok; buildOverlays(); }
      if (lang !== labelLang) { labelLang = lang; Object.keys(hudLast).forEach(function (k) { delete hudLast[k]; }); }
      const fam = P.family;
      setHud('name', B.projName());
      setHud('surf', fam === 'cyl' ? T('投影面：圓柱', 'Surface: cylinder') + (state.unroll > 0.99 ? T('（已攤平）', ' (unrolled)') : '')
        : fam === 'conic' ? (Math.abs(P.n) < 1e-6 ? T('投影面：圓錐變成了圓柱', 'Surface: the cone has become a cylinder') : T('投影面：圓錐（n = ', 'Surface: cone (n = ') + B.num(P.n, 3) + T('）', ')')) + (state.unroll > 0.99 ? T('，已攤平', ', unrolled') : '')
        : fam === 'azi' ? T('投影面：切平面', 'Surface: tangent plane')
        : T('偽圓柱投影沒有可以攤平的投影面', 'Pseudo-cylindrical maps have no surface to unroll'));
      const stds = standardLats(P);
      setHud('std', fam === 'pseudo' ? T('只有地球：紫色陸塊、綠色大圓、橙色等角航線都是真實的形狀', 'Globe only: the purple landmass, green great circle and orange rhumb line are true shapes')
        : fam === 'azi' ? T('黃點：切點，只有這一點比例正確', 'Yellow dot: the point of contact, the only place with true scale')
        : T('黃線：投影面碰到地球的緯線，比例正確', 'Yellow: where the surface meets the globe — true scale') + (stds.length === 2 && fam === 'cyl' ? T('（相割）', ' (secant)') : ''));
      setHud('note', P.id === 'gnomonic' ? T('心射：光從地心射出，所以大圓都變成直線', 'Gnomonic: light from the centre, so every great circle becomes a straight line')
        : P.id === 'stereo' ? T('平射：光從對蹠點射出，圓還是圓', 'Stereographic: light from the antipode, so circles stay circles')
        : P.id === 'ortho' ? T('正射：平行光，就像從很遠的地方看地球', 'Orthographic: parallel light, like seeing the Earth from far away')
        : fam === 'cyl' || fam === 'conic' ? T('拖曳下方滑桿把投影面攤開', 'Use the slider below to unroll the surface')
        : fam === 'azi' ? T('這個方位投影是數學規則，不是光照出來的', 'This azimuthal map is a mathematical rule, not a shadow') : '');
    }

    // ---------- 相機 ----------
    function sizeOf(w) { return w < 560 ? 380 : 460; }
    function resize3() {
      const w = wrap.clientWidth;
      if (!w) return;
      const h = sizeOf(w);
      if (canvas.style.height !== h + 'px') canvas.style.height = h + 'px';
      cw = w; ch = h;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      scene.traverse(function (o) { if (o.userData && o.userData.isLabel) fitLabel(o); });
      render();
    }
    let camAnim = null;
    function presetFor(kind) {
      const P = B.proj();
      const k = camera.aspect < 1.2 ? 1.45 : 1;
      // 讓整個投影面放得進畫面：依地圖外框的大小決定距離
      let ext = 1.15;
      if (P.family !== 'pseudo') { const b = K.bounds(K.outline(P, 120)); ext = Math.max(1.15, Math.abs(b[0]), Math.abs(b[2]), Math.abs(b[1]), Math.abs(b[3])); }
      const dist = Math.max(4.2, Math.min(19, ext * 3.3)) * k;
      if (P.family === 'azi') {
        const c = K.toVec(P.lam0, P.phi0 * DEG);
        if (kind === 'top') return { pos: V(c).multiplyScalar(dist * 1.05).add(V([0, 0, 0.01])), tgt: V(c).multiplyScalar(0.6) };
        // 側面：從切平面的旁邊看，同時看到光源、地球與平面
        const side = Math.abs(c[2]) > 0.9 ? V([Math.cos(P.lam0 - 1.1), Math.sin(P.lam0 - 1.1), 0]) : V([0, 0, 1]).cross(V(c)).normalize();
        return { pos: side.multiplyScalar(dist * 0.9).add(V(c).multiplyScalar(dist * 0.45)), tgt: V(c).multiplyScalar(0.5) };
      }
      const d0 = [Math.cos(P.lam0), Math.sin(P.lam0), 0];
      if (kind === 'top') {
        // 正對投影面：圓柱從中央經線的正前方看；圓錐從尖端那一側沿地軸看
        if (P.family === 'conic' && Math.abs(P.n) >= 1e-6) return { pos: V([d0[0] * 0.3, d0[1] * 0.3, Math.sign(P.n) * dist]), tgt: V([0, 0, 0]) };
        return { pos: V([d0[0] * dist, d0[1] * dist, 0.02]), tgt: V([d0[0] * 0.6, d0[1] * 0.6, 0]) };
      }
      const a = P.lam0 + 0.6;
      return { pos: V([Math.cos(a) * dist * 0.92, Math.sin(a) * dist * 0.92, dist * 0.38]), tgt: V([d0[0] * 0.3, d0[1] * 0.3, 0]) };
    }
    function camTo(kind, animate) {
      const P = presetFor(kind);
      if (!animate || B.reducedMotion) {
        camAnim = null;
        camera.position.copy(P.pos); controls.target.copy(P.tgt); controls.update(); render();
        return;
      }
      camAnim = { t0: performance.now(), dur: 800, p0: camera.position.clone(), t0v: controls.target.clone(), p1: P.pos, t1: P.tgt };
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
    function render() {
      if (!api.active || document.hidden) return;
      const want = Math.min(window.devicePixelRatio || 1, 2);
      if (renderer.getPixelRatio() !== want) { renderer.setPixelRatio(want); renderer.setSize(cw, ch, false); }
      stepCam();
      moving = controls.update();
      renderer.render(scene, camera);
    }
    const ro = window.ResizeObserver ? new ResizeObserver(function () { resize3(); }) : null;
    if (ro) ro.observe(wrap); else window.addEventListener('resize', resize3);
    controls.addEventListener('change', function () { B.request(); });
    canvas.addEventListener('webglcontextlost', function (ev) {
      ev.preventDefault();
      if (api.active && B.onContextLost) B.onContextLost();
    });

    let lastFam = '';
    const api = {
      active: true,
      frame: function () { update(); render(); },
      busy: function () { return !!camAnim || moving; },
      onShow: function () { resize3(); camTo('side', false); lastFam = B.proj().family + B.proj().id; },
      onTheme: function () {
        C = B.colors();
        Object.keys(hudLast).forEach(function (k) { delete hudLast[k]; });
        texKey = ''; overKey = ''; projKey = '';
        update(); render();
      },
      onMap: function () {
        // 換了投影家族：相機換到適合的位置
        const P = B.proj(), f = P.family + (P.family === 'azi' ? P.id : '');
        if (lastFam && f !== lastFam) camTo('side', true);
        lastFam = f;
        B.request();
      },
      onUnroll: function () { B.request(); },
      resetCamera: function () { camTo('side', true); },
      camTo: function (kind) { camTo(kind, true); },
      dispose: function () {
        api.active = false;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize3);
        controls.dispose();
        disposeObject(scene);
        if (mapTex) mapTex.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        wrap.remove();
      }
    };

    // 初始化
    const w0 = wrap.clientWidth;
    if (w0) {
      cw = w0; ch = sizeOf(w0);
      canvas.style.height = ch + 'px';
      renderer.setSize(cw, ch, false);
      camera.aspect = cw / ch;
      camera.updateProjectionMatrix();
    }
    update();
    camTo('side', false);
    return api;
  }

  window.MapProjection3D = { create: create };
})();
