/*
 * atomic-orbitals-3d.js — 「原子軌域的形狀」的 3D 檢視（等值面、機率雲、節面，可旋轉、縮放、切開一角）
 *
 * three.js 由 atomic-orbitals.js 在切換到 3D 時才以 import() 動態載入，再傳進 AO3D.create(lib, host)。
 * 這個檔案只「讀」頁面的狀態與 AOCore 的公式，不改變任何數值：
 *   - 等值面：在 3D 格點（64³）上算 ψ，用 surface nets 法取出 ψ = +c（紅）與 ψ = −c（藍）的曲面；
 *     c 由 AOCore.isoLevel 求得，使 |ψ| > c 的區域剛好包住指定的機率。法向量用 ψ 的梯度（中央差分）。
 *     副層加總時是 √(Σ|ψ|²/(2l+1)) = c 的球殼（一種顏色）。
 *   - 機率雲：AOCore.sample 依 |ψ|² 精確抽 15000 個點，顏色依 ψ 的正負。
 *   - 節面：徑向節面是半徑 r 的球面；角節面是通過原子核的平面或圓錐（AOCore.angularNodes）。
 * 座標：化學的 (x, y, z) 放在一個繞 x 軸轉 −90° 的群組裡，畫面上 z 軸朝上；整個軌域縮放到同樣大小，真正的大小寫在角落。
 */
(function () {
  'use strict';
  const GRID = 64, NPTS = 15000, SIZE = 3;

  /** surface nets：v 是 (N+1)³ 個格點上的值（> 0 為內部），格點座標 x = −L + i·h。傳回 { pos: Float32Array, idx: Uint32Array } */
  function surfaceNets(v, N, L) {
    const M = N + 1, h = 2 * L / N;
    const at = function (i, j, k) { return i + M * (j + M * k); };
    const cellV = new Int32Array(N * N * N).fill(-1);
    const pos = [];
    const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
    const c = new Float64Array(8);
    for (let k = 0; k < N; k++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      let mask = 0;
      for (let b = 0; b < 8; b++) { c[b] = v[at(i + (b & 1), j + ((b >> 1) & 1), k + ((b >> 2) & 1))]; if (c[b] > 0) mask |= 1 << b; }
      if (mask === 0 || mask === 255) continue;
      let sx = 0, sy = 0, sz = 0, cnt = 0;
      for (let e = 0; e < 12; e++) {
        const a = E[e][0], b = E[e][1];
        if ((c[a] > 0) === (c[b] > 0)) continue;
        const t = c[a] / (c[a] - c[b]);
        const ax = a & 1, ay = (a >> 1) & 1, az = (a >> 2) & 1, bx = b & 1, by = (b >> 1) & 1, bz = (b >> 2) & 1;
        sx += ax + t * (bx - ax); sy += ay + t * (by - ay); sz += az + t * (bz - az); cnt++;
      }
      cellV[i + N * (j + N * k)] = pos.length / 3;
      pos.push(-L + (i + sx / cnt) * h, -L + (j + sy / cnt) * h, -L + (k + sz / cnt) * h);
    }
    const idx = [];
    const cell = function (i, j, k) { return cellV[i + N * (j + N * k)]; };
    const quad = function (a, b, c2, d, flip) {
      if (a < 0 || b < 0 || c2 < 0 || d < 0) return;
      if (flip) idx.push(a, c2, b, a, d, c2); else idx.push(a, b, c2, a, c2, d);
    };
    for (let k = 0; k <= N; k++) for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const v0 = v[at(i, j, k)] > 0;
      // x 方向的邊
      if (i < N && j > 0 && k > 0 && j < N && k < N && v0 !== (v[at(i + 1, j, k)] > 0))
        quad(cell(i, j - 1, k - 1), cell(i, j, k - 1), cell(i, j, k), cell(i, j - 1, k), !v0);
      // y 方向的邊
      if (j < N && i > 0 && k > 0 && i < N && k < N && v0 !== (v[at(i, j + 1, k)] > 0))
        quad(cell(i - 1, j, k - 1), cell(i - 1, j, k), cell(i, j, k), cell(i, j, k - 1), !v0);
      // z 方向的邊
      if (k < N && i > 0 && j > 0 && i < N && j < N && v0 !== (v[at(i, j, k + 1)] > 0))
        quad(cell(i - 1, j - 1, k), cell(i, j - 1, k), cell(i, j, k), cell(i - 1, j, k), !v0);
    }
    return { pos: new Float32Array(pos), idx: new Uint32Array(idx) };
  }

  function create(lib, H) {
    const THREE = lib.THREE, A = H.A, T = H.T, host = H.host;

    const canvas = document.createElement('canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', T('原子軌域的 3D 檢視：紅色 ψ > 0、藍色 ψ < 0（拖曳旋轉、雙指或滾輪縮放）',
      '3D view of the orbital: red ψ > 0, blue ψ < 0 (drag to rotate, pinch or scroll to zoom)'));
    host.appendChild(canvas);
    const hudTL = document.createElement('div'), hudTR = document.createElement('div'), hudBL = document.createElement('div');
    hudTL.className = 'r3-hud tl'; hudTR.className = 'r3-hud tr'; hudBL.className = 'r3-hud bl';
    [hudTL, hudTR, hudBL].forEach(function (d) { d.setAttribute('aria-hidden', 'true'); host.appendChild(d); });
    hudBL.textContent = T('拖曳旋轉・滾輪或雙指縮放', 'Drag to rotate · scroll or pinch to zoom');

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: 'default' });
    } catch (e) {
      canvas.remove(); hudTL.remove(); hudTR.remove(); hudBL.remove();
      throw e;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.localClippingEnabled = true;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1.5, 0.1, 200);
    const viewDir = new THREE.Vector3(2, 1.25, -1.1).normalize();   // 化學座標 (2, 1.1, 1.25)：x 朝向觀看者、y 朝右、z 朝上
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.minDistance = 4;
    controls.maxDistance = 40;
    controls.enablePan = false;

    const hemi = new THREE.HemisphereLight(0xffffff, 0x6f7784, 1.15);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.7);
    sun.position.set(5, 9, 4);
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0xffffff, 0.55);
    rim.position.set(-6, 2, -6);
    scene.add(rim);

    // 化學座標 → three.js：繞 x 軸轉 −90°，(x, y, z) → (x, z, −y)
    const world = new THREE.Group();
    world.rotation.x = -Math.PI / 2;
    scene.add(world);
    const content = new THREE.Group();
    world.add(content);
    // 切開一角：拿掉化學座標 x > 0 且 y > 0 的部分（three.js 座標 X > 0 且 Z < 0）
    const clipPlanes = [new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0), new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)];

    let col = H.colors();
    const mats = {};
    function mkMats() {
      Object.keys(mats).forEach(function (k) { mats[k].dispose(); delete mats[k]; });
      const dark = col.dark;
      mats.pos = new THREE.MeshPhysicalMaterial({ color: col.pos, roughness: 0.34, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.25, side: THREE.DoubleSide });
      mats.neg = new THREE.MeshPhysicalMaterial({ color: col.neg, roughness: 0.34, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.25, side: THREE.DoubleSide });
      mats.sum = new THREE.MeshPhysicalMaterial({ color: col.accent, roughness: 0.34, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.25, side: THREE.DoubleSide });
      mats.node = new THREE.MeshStandardMaterial({ color: col.node, roughness: 0.6, transparent: true, opacity: dark ? 0.2 : 0.24, depthWrite: false, side: THREE.DoubleSide });
      mats.nodeLine = new THREE.LineBasicMaterial({ color: col.node, transparent: true, opacity: dark ? 0.55 : 0.7 });
      mats.axis = new THREE.LineBasicMaterial({ color: col.text, transparent: true, opacity: 0.55 });
      mats.axisHead = new THREE.MeshStandardMaterial({ color: col.text, roughness: 0.5 });
      mats.nuc = new THREE.MeshStandardMaterial({ color: col.pos, emissive: col.pos, emissiveIntensity: dark ? 0.6 : 0.3, roughness: 0.3 });
      mats.slice = new THREE.MeshBasicMaterial({ color: col.accent, transparent: true, opacity: dark ? 0.14 : 0.12, depthWrite: false, side: THREE.DoubleSide });
      mats.sliceLine = new THREE.LineBasicMaterial({ color: col.accent, transparent: true, opacity: 0.8 });
      mats.pts = new THREE.PointsMaterial({ size: 0.075, vertexColors: true, transparent: true, opacity: dark ? 0.9 : 0.85, depthWrite: false, map: dotTex, alphaTest: 0.02, sizeAttenuation: true });
      if (dark) mats.pts.blending = THREE.AdditiveBlending;
    }
    // 圓點貼圖
    const dotCanvas = document.createElement('canvas');
    dotCanvas.width = dotCanvas.height = 64;
    (function () {
      const g = dotCanvas.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    })();
    const dotTex = new THREE.CanvasTexture(dotCanvas);
    mkMats();

    // 文字標籤（2D 畫布畫成貼圖）
    function labelSprite(text, color) {
      const c = document.createElement('canvas'); c.width = 128; c.height = 128;
      const g = c.getContext('2d');
      g.font = '700 84px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      g.lineWidth = 14; g.strokeStyle = col.dark ? 'rgba(10,14,16,0.9)' : 'rgba(255,255,255,0.92)'; g.strokeText(text, 64, 68);
      g.fillStyle = color; g.fillText(text, 64, 68);
      const tex = new THREE.CanvasTexture(c);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
      sp.renderOrder = 5;
      return sp;
    }

    // ---------- 內容 ----------
    let isoGroup = null, cloud = null, cloudKey = '', nodeGroup = null, axisGroup = null, sliceGroup = null, ext = 1;
    function disposeGroup(g) {
      if (!g) return;
      g.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material && o.material.map && o.isSprite) { o.material.map.dispose(); o.material.dispose(); }
      });
      if (g.parent) g.parent.remove(g);
    }
    function field() {
      const o = H.orbital(), inf = H.info();
      const L = Math.max(0.5, inf.iso.rOut * 1.07), N = GRID, M = N + 1, h = 2 * L / N;
      const v = new Float32Array(M * M * M);
      const tab = inf.tab, sum = o.sum;
      const k4 = 1 / Math.sqrt(4 * Math.PI);
      for (let k = 0; k < M; k++) {
        const z = -L + k * h;
        for (let j = 0; j < M; j++) {
          const y = -L + j * h;
          for (let i = 0; i < M; i++) {
            const x = -L + i * h, r = Math.sqrt(x * x + y * y + z * z);
            const Rv = r >= inf.rc ? 0 : A.lookup(tab, tab.R, r);
            v[i + M * (j + M * k)] = sum ? Math.abs(Rv) * k4 : Rv * A.Y(o.key, x, y, z);
          }
        }
      }
      return { v: v, L: L, N: N };
    }
    function psiExact(o, x, y, z) {
      if (o.sum) return Math.sqrt(A.density(o, x, y, z, true));
      return A.psi(o, x, y, z);
    }
    function buildIso() {
      disposeGroup(isoGroup);
      isoGroup = new THREE.Group();
      const o = H.orbital(), inf = H.info(), c = inf.iso.c;
      const F = field();
      const parts = o.sum ? [[1, 'sum']] : [[1, 'pos'], [-1, 'neg']];
      parts.forEach(function (p) {
        const sg = p[0], vv = new Float32Array(F.v.length);
        for (let i = 0; i < vv.length; i++) vv[i] = sg * F.v[i] - c;
        const s = surfaceNets(vv, F.N, F.L);
        if (!s.idx.length) return;
        const nrm = new Float32Array(s.pos.length), e = F.L * 1e-3;
        for (let i = 0; i < s.pos.length; i += 3) {
          const x = s.pos[i], y = s.pos[i + 1], z = s.pos[i + 2];
          let gx = psiExact(o, x + e, y, z) - psiExact(o, x - e, y, z), gy = psiExact(o, x, y + e, z) - psiExact(o, x, y - e, z), gz = psiExact(o, x, y, z + e) - psiExact(o, x, y, z - e);
          // 法向量朝外：內部是 sg·ψ > c，往外 sg·ψ 變小
          gx *= -sg; gy *= -sg; gz *= -sg;
          const m = Math.hypot(gx, gy, gz) || 1;
          nrm[i] = gx / m; nrm[i + 1] = gy / m; nrm[i + 2] = gz / m;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(s.pos, 3));
        geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
        geo.setIndex(new THREE.BufferAttribute(s.idx, 1));
        const mesh = new THREE.Mesh(geo, mats[p[1]]);
        mesh.userData.kind = p[1];
        isoGroup.add(mesh);
      });
      content.add(isoGroup);
    }
    function buildCloud() {
      const o = H.orbital();
      const key = A.id(o) + '@' + o.Z + (o.sum ? 'S' : '');
      if (cloud && cloudKey === key) return;
      disposeGroup(cloud);
      cloudKey = key;
      const S = A.sample(o, NPTS, A.rng32(20261113), o.sum);
      const colr = new Float32Array(3 * NPTS);
      const cp = new THREE.Color(col.pos), cn = new THREE.Color(col.neg), cs = new THREE.Color(col.accent);
      for (let i = 0; i < NPTS; i++) {
        const cc = S.sign[i] > 0 ? cp : S.sign[i] < 0 ? cn : cs;
        colr[3 * i] = cc.r; colr[3 * i + 1] = cc.g; colr[3 * i + 2] = cc.b;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(S.pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(colr, 3));
      cloud = new THREE.Points(geo, mats.pts);
      cloud.renderOrder = 3;
      content.add(cloud);
    }
    function buildNodes() {
      disposeGroup(nodeGroup);
      nodeGroup = new THREE.Group();
      const o = H.orbital(), inf = H.info();
      inf.nodes.forEach(function (rn) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(rn, 48, 24), mats.node);
        nodeGroup.add(s);
        const w = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.SphereGeometry(rn, 24, 12)), mats.nodeLine);
        w.material = mats.nodeLine;
        nodeGroup.add(w);
      });
      if (!o.sum) {
        const R = ext * 1.12;
        A.angularNodes(o.key).forEach(function (nd) {
          if (nd.type === 'plane') {
            const g = new THREE.CircleGeometry(R, 72), m = new THREE.Mesh(g, mats.node);
            const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(nd.n[0], nd.n[1], nd.n[2]));
            m.quaternion.copy(q);
            nodeGroup.add(m);
            const pts = [];
            for (let i = 0; i <= 96; i++) { const a = i / 96 * Math.PI * 2; pts.push(new THREE.Vector3(R * Math.cos(a), R * Math.sin(a), 0)); }
            const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mats.nodeLine);
            ln.quaternion.copy(q);
            nodeGroup.add(ln);
          } else {
            const sl = R * 1.05, st = Math.sin(nd.theta), ct = Math.cos(nd.theta);
            const g = new THREE.LatheGeometry([new THREE.Vector2(0, 0), new THREE.Vector2(sl * st, sl * ct)], 72);
            g.rotateX(Math.PI / 2);   // 旋轉軸由 three 的 y 改成化學座標的 z
            nodeGroup.add(new THREE.Mesh(g, mats.node));
            const pts = [];
            for (let i = 0; i <= 96; i++) { const a = i / 96 * Math.PI * 2; pts.push(new THREE.Vector3(sl * st * Math.cos(a), sl * st * Math.sin(a), sl * ct)); }
            nodeGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mats.nodeLine));
          }
        });
      }
      content.add(nodeGroup);
    }
    function buildAxes() {
      disposeGroup(axisGroup);
      axisGroup = new THREE.Group();
      const a = ext * 1.18;
      const g = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-a, 0, 0), new THREE.Vector3(a, 0, 0), new THREE.Vector3(0, -a, 0), new THREE.Vector3(0, a, 0), new THREE.Vector3(0, 0, -a), new THREE.Vector3(0, 0, a)]);
      axisGroup.add(new THREE.LineSegments(g, mats.axis));
      const hl = ext * 0.09, hr = ext * 0.032;
      [['x', [1, 0, 0]], ['y', [0, 1, 0]], ['z', [0, 0, 1]]].forEach(function (d) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(hr, hl, 20), mats.axisHead);
        const dir = new THREE.Vector3(d[1][0], d[1][1], d[1][2]);
        cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        cone.position.copy(dir.clone().multiplyScalar(a));
        axisGroup.add(cone);
        const sp = labelSprite(d[0], col.text);
        sp.position.copy(dir.clone().multiplyScalar(a + ext * 0.16));
        sp.scale.setScalar(ext * 0.2);
        axisGroup.add(sp);
      });
      const nuc = new THREE.Mesh(new THREE.SphereGeometry(ext * 0.028, 20, 14), mats.nuc);
      axisGroup.add(nuc);
      content.add(axisGroup);
    }
    function buildSlice() {
      disposeGroup(sliceGroup);
      sliceGroup = null;
      const op = H.opts();
      if (!op.plane3) return;
      sliceGroup = new THREE.Group();
      const s = Math.min(op.half, ext * 1.6);
      const g = new THREE.PlaneGeometry(2 * s, 2 * s);
      const pts = [[-s, -s], [s, -s], [s, s], [-s, s], [-s, -s]].map(function (p) { return new THREE.Vector3(p[0], p[1], 0); });
      const lg = new THREE.BufferGeometry().setFromPoints(pts);
      if (op.plane === 'xz') { g.rotateX(-Math.PI / 2); lg.rotateX(-Math.PI / 2); }
      else if (op.plane === 'yz') { g.rotateY(Math.PI / 2); lg.rotateY(Math.PI / 2); }
      sliceGroup.add(new THREE.Mesh(g, mats.slice));
      sliceGroup.add(new THREE.Line(lg, mats.sliceLine));
      const nrm = A.PLANES[op.plane].n;
      sliceGroup.position.set(nrm[0] * op.off, nrm[1] * op.off, nrm[2] * op.off);
      sliceGroup.renderOrder = 4;
      content.add(sliceGroup);
    }
    function applyOpts() {
      const op = H.opts(), o = H.orbital();
      const showIso = op.style !== 'cloud', showCloud = op.style !== 'iso';
      if (showCloud) buildCloud();
      if (cloud) cloud.visible = showCloud;
      if (isoGroup) isoGroup.visible = showIso;
      ['pos', 'neg', 'sum'].forEach(function (k) {
        const m = mats[k], both = op.style === 'both';
        m.transparent = both; m.opacity = both ? 0.32 : 1; m.depthWrite = !both; m.needsUpdate = true;
      });
      // 兩者同時顯示時點雲淡一點，免得中心疊成一片白（深色模式特別明顯）
      mats.pts.opacity = op.style === 'both' ? (col.dark ? 0.45 : 0.55) : (col.dark ? 0.9 : 0.85);
      if (nodeGroup) nodeGroup.visible = op.nodes;
      const planes = op.cut ? clipPlanes : [];
      Object.keys(mats).forEach(function (k) {
        if (k === 'axis' || k === 'axisHead' || k === 'nuc' || k === 'slice' || k === 'sliceLine') return;
        mats[k].clippingPlanes = planes; mats[k].clipIntersection = true; mats[k].needsUpdate = true;
      });
      hudTL.textContent = H.hud().tl;
      hudTR.innerHTML = H.hud().tr.replace(/\n/g, '<br>').replace(/ a0 /, ' a<sub>0</sub> ');
      requestRender();
      return o;
    }
    function rebuild() {
      const inf = H.info();
      ext = Math.max(0.5, inf.iso.rOut);
      content.scale.setScalar(SIZE / ext);
      buildIso();
      cloudKey = '';
      buildNodes(); buildAxes(); buildSlice();
      applyOpts();
    }

    function fit(force) {
      const dist = 14.0 / Math.min(1, camera.aspect * 1.05);
      if (force) {
        controls.target.set(0, 0, 0);
        camera.position.copy(viewDir).multiplyScalar(dist);
      }
      camera.updateProjectionMatrix();
      controls.update();
    }
    let vw = 0, raf = 0;
    function canvasHeight(w) { return w < 560 ? Math.round(Math.max(320, w * 1.0)) : Math.round(Math.min(600, w * 0.72)); }
    function resize3() {
      const w = host.clientWidth;
      if (!w) return;
      const h = canvasHeight(w);
      canvas.style.height = h + 'px';
      vw = w;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      fit(false);
      requestRender();
    }
    function renderNow() {
      if (!api.active || document.hidden) return;
      const moved = controls.update();
      renderer.render(scene, camera);
      if (moved) requestRender();
    }
    function requestRender() {
      if (raf || !api.active) return;
      raf = requestAnimationFrame(function () { raf = 0; renderNow(); });
    }
    const ro = window.ResizeObserver ? new ResizeObserver(function () { if (host.clientWidth !== vw) resize3(); }) : null;
    if (ro) ro.observe(host); else window.addEventListener('resize', resize3);
    controls.addEventListener('change', requestRender);
    // 第一次拖曳或縮放後收起操作說明，讓出畫面（窄螢幕特別需要）
    controls.addEventListener('start', function () { hudBL.style.display = 'none'; });
    const onVisible = function () { if (!document.hidden) requestRender(); };
    document.addEventListener('visibilitychange', onVisible);
    canvas.addEventListener('webglcontextlost', function (ev) {
      ev.preventDefault();
      if (api.active) H.contextLost();
    });

    const api = {
      active: true,
      update: function (kind) {
        if (!api.active) return;
        if (kind === 'slice') { buildSlice(); applyOpts(); }
        else if (kind === 'opts') applyOpts();
        else rebuild();
      },
      onTheme: function () {
        col = H.colors();
        mkMats();
        cloudKey = '';
        disposeGroup(cloud); cloud = null;
        rebuild();
      },
      resetCamera: function () { fit(true); requestRender(); },
      dispose: function () {
        api.active = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize3);
        document.removeEventListener('visibilitychange', onVisible);
        controls.dispose();
        [isoGroup, cloud, nodeGroup, axisGroup, sliceGroup].forEach(disposeGroup);
        Object.keys(mats).forEach(function (k) { mats[k].dispose(); });
        dotTex.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        canvas.remove(); hudTL.remove(); hudTR.remove(); hudBL.remove();
      }
    };

    const w0 = host.clientWidth;
    if (w0) {
      const h0 = canvasHeight(w0);
      canvas.style.height = h0 + 'px';
      vw = w0;
      renderer.setSize(w0, h0, false);
      camera.aspect = w0 / h0;
    }
    fit(true);
    rebuild();
    return api;
  }

  window.AO3D = { create: create, surfaceNets: surfaceNets };
})();
