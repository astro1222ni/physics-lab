/*
 * perceptron-3d.js — 「感知器」的 3D 加權和（three.js）
 *
 * 由 js/perceptron.js 在使用者按「3D 加權和」時才載入（three.js 也是那時才以 import() 載入）；切回 2D 時整個釋放。
 * 用法：window.Perceptron3D.create({ THREE, OrbitControls }, 容器, bridge) → { active, frame, onTheme, resetCamera, dispose }
 *
 * 場景座標：地面就是特徵平面，X = x1、Z = −x2（x2 往畫面裡面），Y 是高度。
 * 斜面的高度 = 加權和 z = w1·x1 + w2·x2 + b 乘上一個共同的比例 hs（讓斜面在 [−1, 1]² 最高的角固定在 0.85）。
 * 每個資料點有一根柱子從地面連到斜面，長度 = hs·z（同一個比例）：分對的 +1 點柱子朝上、分對的 −1 點朝下，分錯的柱子是紅色。
 * 斜面與地面 z = 0 的交線就是 2D 的分界線。權重、點、分錯與否都直接取自 2D 的 Session（bridge），兩邊永遠一致。
 */
(function () {
  'use strict';
  const FONT = 'system-ui, -apple-system, "Segoe UI", "Noto Sans TC", "PingFang TC", sans-serif';
  const PI = Math.PI, DEG = PI / 180;
  const HALF = 1.2;       // 地面半寬（資料在 [−1, 1]²）
  const TOP = 0.85;       // 斜面在 [−1, 1]² 最高的角的高度

  function create(lib, host, B) {
    const THREE = lib.THREE;
    const T = B.T, D = B.D, PC = B.PC;
    let C = B.colors();
    const col = function (c) { return new THREE.Color(c); };
    const isDark = function () { return !!D.dark; };

    // ---------- 畫布與資訊列 ----------
    const wrap = document.createElement('div');
    wrap.className = 'p3-wrap';
    const canvas = document.createElement('canvas');
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', T('加權和的 3D 立體檢視：地面是特徵平面，半透明的斜面高度是加權和 z，斜面切過地面的地方就是分界線；每個點有一根柱子連到斜面。拖曳旋轉，滾輪或雙指縮放，方向鍵也可以轉動。',
      '3D view of the weighted sum: the ground is the feature plane, the height of the translucent sheet is the weighted sum z, and where the sheet cuts the ground is the dividing line; each point has a post up (or down) to the sheet. Drag to rotate, scroll or pinch to zoom, or use the arrow keys.'));
    wrap.appendChild(canvas);
    const hud = document.createElement('div');
    hud.className = 'p3-hud';
    hud.setAttribute('aria-hidden', 'true');
    hud.innerHTML = '<div class="tl"><span data-k="eq"></span><span class="m" data-k="sc"></span></div><div class="bl"><span class="m" data-k="tip"></span><span data-k="w"></span></div>';
    wrap.appendChild(hud);
    host.appendChild(wrap);
    const hudEl = {}, hudLast = {};
    hud.querySelectorAll('[data-k]').forEach(function (e) { hudEl[e.getAttribute('data-k')] = e; });
    function setHud(k, h) { if (hudLast[k] !== h) { hudLast[k] = h; hudEl[k].innerHTML = h; } }

    let renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true }); }
    catch (e) { wrap.remove(); throw e; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.localClippingEnabled = true;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 4 / 3, 0.05, 100);

    // ---------- 視角控制 ----------
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.rotateSpeed = 0.85;
    controls.screenSpacePanning = true;
    controls.minDistance = 1.6;
    controls.maxDistance = 14;
    let startAng = null;
    controls.addEventListener('start', function () { startAng = [controls.getAzimuthalAngle(), controls.getPolarAngle()]; });
    controls.addEventListener('end', function () {
      if (!startAng) return;
      const turned = Math.abs(controls.getAzimuthalAngle() - startAng[0]) + Math.abs(controls.getPolarAngle() - startAng[1]);
      startAng = null;
      if (turned > 0.1) B.onRotate();
    });

    // ---------- 光線與環境反光 ----------
    const hemi = new THREE.HemisphereLight(0xffffff, 0x3a4250, 0.9);
    scene.add(hemi);
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.7);
    keyLight.position.set(2.2, 4.5, 2.6);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -1.8; keyLight.shadow.camera.right = 1.8;
    keyLight.shadow.camera.top = 1.8; keyLight.shadow.camera.bottom = -1.8;
    keyLight.shadow.camera.near = 0.5; keyLight.shadow.camera.far = 12;
    keyLight.shadow.radius = 4;
    keyLight.shadow.bias = -0.0008;
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.45);
    fillLight.position.set(-3, 1.5, -2);
    scene.add(fillLight);
    const pmrem = new THREE.PMREMGenerator(renderer);
    let envRT = null;
    function buildEnv() {
      if (envRT) { envRT.dispose(); envRT = null; }
      const s = new THREE.Scene();
      const g = new THREE.SphereGeometry(10, 32, 16);
      const pos = g.attributes.position, cols = new Float32Array(pos.count * 3);
      const top = new THREE.Color(isDark() ? 0x5d6a80 : 0xffffff), bot = new THREE.Color(isDark() ? 0x0a0d12 : 0x7d8794);
      const c = new THREE.Color();
      for (let i = 0; i < pos.count; i++) {
        const u = Math.max(0, Math.min(1, (pos.getY(i) / 10 + 1) / 2));
        c.copy(bot).lerp(top, Math.pow(u, 0.75));
        cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      s.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
      envRT = pmrem.fromScene(s, 0.035);
      s.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      scene.environment = envRT.texture;
    }

    // ---------- 共用工具 ----------
    function disposeObject(obj) {
      obj.traverse(function (o) {
        if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m.userData.shared) return; if (m.map) m.map.dispose(); m.dispose(); });
      });
    }
    function clearGroup(g) { g.children.slice().forEach(function (o) { g.remove(o); disposeObject(o); }); }
    /** 文字小圖（標籤）：可帶下標 */
    function labelSprite(text, sub, color, h) {
      const c = document.createElement('canvas');
      const px = 64;
      c.width = 128; c.height = 96;
      const g = c.getContext('2d');
      g.font = 'italic 600 ' + px + 'px ' + FONT;
      const w1 = g.measureText(text).width;
      g.font = '600 ' + Math.round(px * 0.62) + 'px ' + FONT;
      const w2 = sub ? g.measureText(sub).width : 0;
      const x0 = (128 - w1 - w2) / 2;
      g.lineJoin = 'round';
      const draw = function (t, x, y, f) {
        g.font = f;
        g.lineWidth = 10; g.strokeStyle = isDark() ? 'rgba(10,14,20,0.85)' : 'rgba(255,255,255,0.9)';
        g.strokeText(t, x, y);
        g.fillStyle = color; g.fillText(t, x, y);
      };
      g.textBaseline = 'middle';
      draw(text, x0, 44, 'italic 600 ' + px + 'px ' + FONT);
      if (sub) draw(sub, x0 + w1 + 2, 62, '600 ' + Math.round(px * 0.62) + 'px ' + FONT);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
      sp.scale.set(h * 128 / 96, h, 1);
      sp.renderOrder = 10;
      return sp;
    }

    // ---------- 共用的幾何與材質（換主題時重建） ----------
    const shared = {};
    function mark(o) { o.userData.shared = true; return o; }
    function buildShared() {
      Object.keys(shared).forEach(function (k) { if (shared[k].dispose) shared[k].dispose(); delete shared[k]; });
      shared.sphere = mark(new THREE.SphereGeometry(0.05, 28, 18));
      shared.cube = mark(new THREE.BoxGeometry(0.085, 0.085, 0.085));
      shared.post = mark(new THREE.CylinderGeometry(0.014, 0.014, 1, 12, 1));
      shared.cap = mark(new THREE.SphereGeometry(0.026, 18, 12));
      shared.ring = mark(new THREE.TorusGeometry(0.095, 0.011, 10, 40));
      const phys = function (c, opt) {
        opt = opt || {};
        return mark(new THREE.MeshPhysicalMaterial({ color: col(c), roughness: opt.rough == null ? 0.32 : opt.rough, metalness: 0.05, clearcoat: 0.6, clearcoatRoughness: 0.25, emissive: col(c), emissiveIntensity: isDark() ? 0.18 : 0.04 }));
      };
      shared.mPos = phys(C.pos); shared.mNeg = phys(C.neg); shared.mWrong = phys(C.wrong, { rough: 0.4 });
      shared.mCur = mark(new THREE.MeshStandardMaterial({ color: col(C.cur), emissive: col(C.cur), emissiveIntensity: 0.45, roughness: 0.4 }));
      shared.mW = phys(C.w);
      shared.mLine = mark(new THREE.MeshStandardMaterial({ color: col(C.line), emissive: col(C.line), emissiveIntensity: isDark() ? 0.35 : 0.12, roughness: 0.35 }));
      shared.mAxis = mark(new THREE.MeshStandardMaterial({ color: col(C.muted), roughness: 0.6 }));
    }

    // ---------- 物件 ----------
    const gStatic = new THREE.Group(), gDyn = new THREE.Group();
    scene.add(gStatic, gDyn);
    const clipUp = [new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)], clipDown = [new THREE.Plane(new THREE.Vector3(0, -1, 0), 0)];
    let ground = null, groundTex = null, groundCv = null, slopeGeo = null, slopeUp = null, slopeDown = null, gridUp = null, gridDown = null, gridGeo = null;
    const SEG = 22, SPAN = 1.1;
    function buildStatic() {
      clearGroup(gStatic);
      // 地面：半透明的特徵平面（下面的柱子與斜面透得過來）
      groundCv = document.createElement('canvas');
      groundCv.width = groundCv.height = 512;
      groundTex = new THREE.CanvasTexture(groundCv);
      groundTex.colorSpace = THREE.SRGBColorSpace;
      groundTex.anisotropy = 4;
      ground = new THREE.Mesh(new THREE.PlaneGeometry(2 * HALF, 2 * HALF), new THREE.MeshStandardMaterial({
        map: groundTex, transparent: true, opacity: isDark() ? 0.6 : 0.56, depthWrite: false, side: THREE.DoubleSide, roughness: 0.85
      }));
      ground.rotation.x = -PI / 2;
      ground.receiveShadow = true;
      gStatic.add(ground);
      // 地面的邊框（有厚度的木框感）
      const frameMat = new THREE.MeshStandardMaterial({ color: col(D.mix(C.surface, C.text, 0.25)), roughness: 0.55, metalness: 0.1 });
      [[0, HALF, 2 * HALF + 0.06, 0.03], [0, -HALF, 2 * HALF + 0.06, 0.03], [HALF, 0, 0.03, 2 * HALF], [-HALF, 0, 0.03, 2 * HALF]].forEach(function (f) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(f[2], 0.035, f[3]), frameMat);
        m.position.set(f[0], -0.012, f[1]);
        m.castShadow = true;
        gStatic.add(m);
      });
      // 斜面：同一個幾何，分成地面上、地面下兩半（依相機在哪一側決定畫的先後，透明才不會錯亂）
      slopeGeo = new THREE.PlaneGeometry(2 * SPAN, 2 * SPAN, SEG, SEG);
      slopeGeo.rotateX(-PI / 2);
      slopeGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(slopeGeo.attributes.position.count * 3), 3));
      const slopeMat = function (clip) {
        return new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: isDark() ? 0.62 : 0.6, side: THREE.DoubleSide, depthWrite: false,
          roughness: 0.35, metalness: 0.0, clippingPlanes: clip, polygonOffset: true, polygonOffsetFactor: -1 });
      };
      slopeUp = new THREE.Mesh(slopeGeo, slopeMat(clipUp));
      slopeDown = new THREE.Mesh(slopeGeo, slopeMat(clipDown));
      gStatic.add(slopeUp, slopeDown);
      // 斜面上的格線（每 0.25）
      const nL = 9, verts = new Float32Array(nL * 2 * 2 * (SEG + 1) * 3);
      gridGeo = new THREE.BufferGeometry();
      gridGeo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
      const lineMat = function (clip) { return new THREE.LineBasicMaterial({ color: col(C.text), transparent: true, opacity: isDark() ? 0.32 : 0.28, depthWrite: false, clippingPlanes: clip }); };
      gridUp = new THREE.LineSegments(gridGeo, lineMat(clipUp));
      gridDown = new THREE.LineSegments(gridGeo, lineMat(clipDown));
      gStatic.add(gridUp, gridDown);
      // z 軸（在原點）與軸名
      const ax = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 2.1, 8), shared.mAxis);
      ax.position.set(0, 0, 0);
      gStatic.add(ax);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.08, 16), shared.mAxis);
      cone.position.set(0, 1.09, 0);
      gStatic.add(cone);
      const lz = labelSprite('z', '', C.text, 0.16); lz.position.set(0.09, 1.12, 0); gStatic.add(lz);
      const l1 = labelSprite('x', '1', C.text, 0.16); l1.position.set(HALF + 0.12, 0.03, 0); gStatic.add(l1);
      const l2 = labelSprite('x', '2', C.text, 0.16); l2.position.set(0, 0.03, -HALF - 0.12); gStatic.add(l2);
    }

    /** 地面貼圖：兩側淡淡的類別色、格線、座標軸、分界線（和 2D 一樣） */
    function paintGround(w) {
      const g = groundCv.getContext('2d'), N = 512, k = N / (2 * HALF);
      const PX = function (x) { return N / 2 + x * k; }, PY = function (y) { return N / 2 - y * k; };
      g.clearRect(0, 0, N, N);
      g.fillStyle = C.bg; g.fillRect(0, 0, N, N);
      const nw = Math.hypot(w[0], w[1]);
      if (nw > 1e-12 || Math.abs(w[2]) > 1e-12) {
        // 先整片塗 −1 色，再把 z > 0 的半平面塗 +1 色
        g.fillStyle = D.alpha(C.neg, isDark() ? 0.22 : 0.16); g.fillRect(0, 0, N, N);
        g.save();
        g.beginPath();
        if (nw > 1e-12) {
          const n2 = nw * nw, p0 = [-w[2] * w[0] / n2, -w[2] * w[1] / n2], d = [-w[1] / nw, w[0] / nw], F = 6;
          const q = [[p0[0] - F * d[0], p0[1] - F * d[1]], [p0[0] + F * d[0], p0[1] + F * d[1]], [p0[0] + F * d[0] + F * w[0] / nw, p0[1] + F * d[1] + F * w[1] / nw], [p0[0] - F * d[0] + F * w[0] / nw, p0[1] - F * d[1] + F * w[1] / nw]];
          g.moveTo(PX(q[0][0]), PY(q[0][1])); q.slice(1).forEach(function (p) { g.lineTo(PX(p[0]), PY(p[1])); }); g.closePath();
        } else if (w[2] > 0) g.rect(0, 0, N, N);
        g.fillStyle = C.bg; g.fill();
        g.fillStyle = D.alpha(C.pos, isDark() ? 0.22 : 0.16); g.fill();
        g.restore();
      }
      // 格線
      g.lineWidth = 1;
      for (let v = -1.2; v <= 1.2001; v += 0.1) {
        const major = Math.abs(v * 2 - Math.round(v * 2)) < 1e-6;
        g.strokeStyle = D.alpha(C.text, major ? 0.16 : 0.06);
        g.beginPath(); g.moveTo(PX(v), 0); g.lineTo(PX(v), N); g.moveTo(0, PY(v)); g.lineTo(N, PY(v)); g.stroke();
      }
      g.strokeStyle = D.alpha(C.text, 0.4); g.lineWidth = 2;
      g.beginPath(); g.moveTo(0, PY(0)); g.lineTo(N, PY(0)); g.moveTo(PX(0), 0); g.lineTo(PX(0), N); g.stroke();
      g.setLineDash([6, 6]); g.strokeStyle = D.alpha(C.text, 0.3); g.lineWidth = 1.5;
      g.strokeRect(PX(-1), PY(1), 2 * k, 2 * k); g.setLineDash([]);
      // 最寬的走廊
      const band = B.band();
      if (band && band.u) {
        const u = band.u, gm = band.gamma, n2 = u[0] * u[0] + u[1] * u[1];
        if (n2 > 1e-12) {
          const nn = Math.sqrt(n2), dd = [-u[1] / nn, u[0] / nn];
          const pp = function (v) { return [-(u[2] - v) * u[0] / n2, -(u[2] - v) * u[1] / n2]; };
          const A = pp(-gm), Bq = pp(gm), F = 6;
          g.beginPath();
          g.moveTo(PX(A[0] - F * dd[0]), PY(A[1] - F * dd[1])); g.lineTo(PX(A[0] + F * dd[0]), PY(A[1] + F * dd[1]));
          g.lineTo(PX(Bq[0] + F * dd[0]), PY(Bq[1] + F * dd[1])); g.lineTo(PX(Bq[0] - F * dd[0]), PY(Bq[1] - F * dd[1])); g.closePath();
          g.fillStyle = D.alpha(C.band, 0.16); g.fill();
        }
      }
      groundTex.needsUpdate = true;
    }

    let hs = 1, lastRev = -1, dims = null;
    /** 斜面頂點高度、顏色與格線 */
    function updateSlope(w) {
      let zmax = 0;
      [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(function (q) { zmax = Math.max(zmax, Math.abs(w[0] * q[0] + w[1] * q[1] + w[2])); });
      hs = zmax > 1e-12 ? TOP / zmax : 1;
      dims = { zmax: zmax };
      const pos = slopeGeo.attributes.position, colA = slopeGeo.attributes.color;
      const cp = col(C.pos), cn = col(C.neg), base = col(D.mix(C.bg, C.text, isDark() ? 0.25 : 0.12)), c = new THREE.Color();
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = -pos.getZ(i);
        const z = w[0] * x + w[1] * y + w[2];
        pos.setY(i, z * hs + (zmax > 1e-12 ? 0 : 0.003));
        const u = zmax > 1e-12 ? Math.max(-1, Math.min(1, z / zmax)) : 0;
        c.copy(base).lerp(u >= 0 ? cp : cn, 0.35 + 0.6 * Math.pow(Math.abs(u), 0.7));
        colA.setXYZ(i, c.r, c.g, c.b);
      }
      pos.needsUpdate = true; colA.needsUpdate = true;
      slopeGeo.computeVertexNormals();
      slopeGeo.computeBoundingSphere();
      // 格線：x1 = 常數、x2 = 常數，每 0.25，畫在斜面上
      const v = gridGeo.attributes.position.array;
      let o = 0;
      const put = function (x, y) { v[o++] = x; v[o++] = (w[0] * x + w[1] * y + w[2]) * hs + 0.002; v[o++] = -y; };
      for (let a = -1; a <= 1.0001; a += 0.25) {
        for (let s = 0; s < SEG; s++) {
          const y0 = -SPAN + 2 * SPAN * s / SEG, y1 = -SPAN + 2 * SPAN * (s + 1) / SEG;
          put(a, y0); put(a, y1);
          put(y0, a); put(y1, a);
        }
      }
      gridGeo.attributes.position.needsUpdate = true;
      gridGeo.setDrawRange(0, o / 3);
      gridGeo.computeBoundingSphere();
    }
    function addMesh(geo, mat, x, y, z, sy) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      if (sy != null) m.scale.y = sy;
      m.castShadow = true;
      gDyn.add(m);
      return m;
    }
    function rebuild() {
      lastRev = B.rev;
      const w = B.weights(), pts = B.points(), wrong = B.wrong(), cur = B.current();
      updateSlope(w);
      paintGround(w);
      gDyn.children.slice().forEach(function (o) { gDyn.remove(o); disposeObject(o); });
      // 分界線（地面上的紫色管子 = 斜面與地面的交線）
      const seg = PC.clipLine(w, 1.0);
      if (seg) {
        const a = new THREE.Vector3(seg[0][0], 0.006, -seg[0][1]), b = new THREE.Vector3(seg[1][0], 0.006, -seg[1][1]);
        const len = a.distanceTo(b);
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, len, 14), shared.mLine);
        m.position.copy(a).add(b).multiplyScalar(0.5);
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
        gDyn.add(m);
      }
      // 資料點與柱子
      pts.forEach(function (p, i) {
        const x = p.x, zc = -p.y;
        const h = (w[0] * p.x + w[1] * p.y + w[2]) * hs;
        const bad = wrong[i];
        if (p.c > 0) addMesh(shared.sphere, shared.mPos, x, 0.05, zc);
        else addMesh(shared.cube, shared.mNeg, x, 0.0425, zc);
        if (Math.abs(h) > 0.01) {
          addMesh(shared.post, bad ? shared.mWrong : (p.c > 0 ? shared.mPos : shared.mNeg), x, h / 2, zc, Math.abs(h));
          addMesh(shared.cap, bad ? shared.mWrong : (p.c > 0 ? shared.mPos : shared.mNeg), x, h, zc);
        }
        if (i === cur) {
          const r = new THREE.Mesh(shared.ring, shared.mCur);
          r.rotation.x = -PI / 2;
          r.position.set(x, 0.012, zc);
          gDyn.add(r);
        }
      });
      // 斜面在原點的高度 = b
      if (B.bias()) addMesh(shared.cap, shared.mW, 0, w[2] * hs, 0, 1.4).scale.set(1.4, 1.4, 1.4);
      // 資訊列
      const zmax = dims.zmax;
      setHud('eq', '<i>z</i> = <i>w</i><sub>1</sub><i>x</i><sub>1</sub> + <i>w</i><sub>2</sub><i>x</i><sub>2</sub>' + (B.bias() ? ' + <i>b</i>' : ''));
      setHud('sc', zmax > 1e-12 ? T('高度 ∝ z：斜面最高的角 z = ' + B.num(zmax), 'height ∝ z: the highest corner has z = ' + B.num(zmax)) : T('權重全是 0：斜面平躺在地面上', 'all weights are 0: the sheet lies flat on the ground'));
      setHud('tip', T('柱子朝上 = 判成 +1，朝下 = 判成 −1；紅柱 = 分錯', 'post up = classed +1, down = classed −1; red = wrong'));
      setHud('w', '<i>w</i> = (' + B.num(w[0]) + ', ' + B.num(w[1]) + ')' + (B.bias() ? T('，', ', ') + '<i>b</i> = ' + B.num(w[2]) : ''));
    }

    // ---------- 視角 ----------
    const target = new THREE.Vector3(0, 0.05, 0);
    let lastAspect = 0;
    function fitDistance() {
      const vf = camera.fov * DEG;
      const hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
      return Math.max(1.7 / Math.tan(vf / 2), 1.45 / Math.tan(hf / 2)) * 0.92;
    }
    function resetCamera() {
      const d = fitDistance();
      controls.target.copy(target);
      camera.position.copy(target).addScaledVector(new THREE.Vector3(0.66, 0.46, 1.0).normalize(), d);
      controls.maxDistance = d * 3;
      camera.updateProjectionMatrix();
      controls.update();
      requestRender();
    }

    // ---------- 繪製 ----------
    let raf = 0;
    function renderNow() {
      if (!api.active || document.hidden) return;
      const want = Math.min(window.devicePixelRatio || 1, 2);
      if (renderer.getPixelRatio() !== want) { renderer.setPixelRatio(want); resize3(); return; }
      if (B.rev !== lastRev) rebuild();
      const moved = controls.update();
      // 相機在地面上方：先畫地面下的半張斜面，再畫地面，最後畫地面上的半張（在下方時相反）
      const above = camera.position.y >= 0;
      slopeDown.renderOrder = above ? 1 : 4; gridDown.renderOrder = above ? 2 : 5;
      ground.renderOrder = 3;
      slopeUp.renderOrder = above ? 4 : 1; gridUp.renderOrder = above ? 5 : 2;
      renderer.render(scene, camera);
      if (moved) requestRender();
    }
    function requestRender() {
      if (raf || !api.active) return;
      raf = requestAnimationFrame(function () { raf = 0; renderNow(); });
    }
    function resize3() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (Math.abs(camera.aspect - lastAspect) > 1e-3) { lastAspect = camera.aspect; resetCamera(); }
      renderNow();
    }
    const ro = window.ResizeObserver ? new ResizeObserver(function () { resize3(); }) : null;
    if (ro) ro.observe(canvas); else window.addEventListener('resize', resize3);
    controls.addEventListener('change', requestRender);
    const onVisible = function () { if (!document.hidden) requestRender(); };
    document.addEventListener('visibilitychange', onVisible);
    canvas.addEventListener('webglcontextlost', function (ev) {
      ev.preventDefault();
      if (!api.active) return;
      if (B.onContextLost) B.onContextLost();
    });
    // 鍵盤：方向鍵繞著平面轉
    canvas.addEventListener('keydown', function (ev) {
      const step = (ev.shiftKey ? 15 : 5) * DEG;
      const off = camera.position.clone().sub(controls.target);
      const sph = new THREE.Spherical().setFromVector3(off);
      let used = true;
      if (ev.key === 'ArrowLeft') sph.theta -= step;
      else if (ev.key === 'ArrowRight') sph.theta += step;
      else if (ev.key === 'ArrowUp') sph.phi = Math.max(0.05, sph.phi - step);
      else if (ev.key === 'ArrowDown') sph.phi = Math.min(PI - 0.05, sph.phi + step);
      else used = false;
      if (!used) return;
      ev.preventDefault();
      camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(sph));
      controls.update();
      requestRender();
      B.onRotate();
    });

    const api = {
      active: true,
      /** 主程式每次重畫時呼叫；資料或權重變了（bridge.rev 改變）才重建 */
      frame: function () { if (B.rev !== lastRev) requestRender(); },
      onTheme: function () {
        C = B.colors();
        buildEnv();
        Object.keys(hudLast).forEach(function (k) { delete hudLast[k]; });
        clearGroup(gDyn);
        buildShared();
        buildStatic();
        lastRev = -1;
        requestRender();
      },
      resetCamera: function () { resetCamera(); },
      dispose: function () {
        api.active = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize3);
        document.removeEventListener('visibilitychange', onVisible);
        controls.dispose();
        clearGroup(gDyn); clearGroup(gStatic);
        Object.keys(shared).forEach(function (k) { if (shared[k].dispose) shared[k].dispose(); });
        if (envRT) envRT.dispose();
        pmrem.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        wrap.remove();
      }
    };

    buildEnv();
    buildShared();
    buildStatic();
    const w0 = canvas.clientWidth, h0 = canvas.clientHeight;
    if (w0 && h0) {
      renderer.setSize(w0, h0, false);
      camera.aspect = w0 / h0;
      camera.updateProjectionMatrix();
      lastAspect = camera.aspect;
    }
    resetCamera();
    return api;
  }

  window.Perceptron3D = { create: create };
})();
