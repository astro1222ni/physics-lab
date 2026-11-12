/*
 * image-digitization-3d.js — 「圖片數位化」的 3D RGB 色立方（three.js）
 *
 * 由 js/image-digitization.js 在使用者按「3D 色立方」時才載入（three.js 也是那時才以 import() 載入）；切回 2D 時整個釋放。
 * 用法：window.ImageDigit3D.create({ THREE, OrbitControls }, 容器, bridge) → { active, update, onTheme, resetCamera, replay, dispose }
 *
 * 座標：R → X、G → Y（向上）、B → Z，立方體邊長 2、置中於原點；顏色 (r, g, b)（0–255）的位置是 ((r/255 − ½)·2, (g/255 − ½)·2, (b/255 − ½)·2)。
 * 點雲的每一點是 2D 圖片裡的一個像素（最多約 3000 個）：先放在取樣到的顏色，再移到量化後存下的顏色。
 * 3D 只負責畫，所有數值都來自 2D 的計算（bridge.cloud()），兩邊永遠是同一批像素。
 */
(function () {
  'use strict';
  const FONT = 'system-ui, -apple-system, "Segoe UI", "Noto Sans TC", "PingFang TC", sans-serif';
  const PI = Math.PI, DEG = PI / 180;
  const S = 2;                    // 立方體邊長
  const SNAP_SEC = 1.1;           // 吸附動畫的時間（秒）
  const LATTICE_MAX_B = 4;        // 彩色時，每色版 4 位元以下才畫出格點（16³ = 4096 個）

  /** sRGB 代碼值（0–255）→ 線性（three.js 的頂點顏色用線性值） */
  function lin(v) { const c = v / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  const P = function (v) { return (v / 255 - 0.5) * S; };

  function create(lib, host, B) {
    const THREE = lib.THREE;
    const T = B.T, D = B.D;
    let C = B.colors();
    const isDark = function () { return !!D.dark; };

    // ---------- 畫布與資訊列 ----------
    const wrap = document.createElement('div');
    wrap.className = 'c3-wrap';
    const canvas = document.createElement('canvas');
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', T('RGB 色立方的 3D 檢視：紅、綠、藍三個軸，黑與白在相對的兩個角，灰色在兩者之間的對角線上。每個點是一個像素，降低位元數時點會吸到最近的格點。拖曳旋轉，滾輪或雙指縮放，方向鍵也可以轉動。',
      '3D view of the RGB color cube: red, green and blue axes, black and white at opposite corners and the grays on the diagonal between them. Each dot is one pixel; with fewer bits the dots snap to the nearest lattice point. Drag to rotate, scroll or pinch to zoom, or use the arrow keys.'));
    wrap.appendChild(canvas);
    const hud = document.createElement('div');
    hud.className = 'c3-hud';
    hud.setAttribute('aria-hidden', 'true');
    hud.innerHTML = '<div class="tl"><span data-k="t"></span><span class="m" data-k="lat"></span></div><div class="bl"><span class="m" data-k="tip"></span></div>';
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

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 4 / 3, 0.05, 100);
    let lastAspect = 0;

    // ---------- 視角控制 ----------
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.rotateSpeed = 0.85;
    controls.screenSpacePanning = true;
    controls.minDistance = 2.5;
    controls.maxDistance = 16;
    // 旋轉停下來（阻尼結束）以後才回報視線方向，給任務判定
    let startPos = null, reportPending = false;
    controls.addEventListener('start', function () { startPos = camera.position.clone(); });
    controls.addEventListener('end', function () {
      if (!startPos) return;
      const moved = startPos.distanceTo(camera.position) > 0.02;
      startPos = null;
      if (moved) reportPending = true;
      requestRender();
    });
    function reportDir() {
      const d = camera.position.clone().sub(controls.target).normalize();
      if (B.onRotate) B.onRotate([d.x, d.y, d.z]);
    }

    // ---------- 光線 ----------
    const hemi = new THREE.HemisphereLight(0xffffff, 0x404858, 1.5);
    scene.add(hemi);
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
    keyLight.position.set(4, 8, 6);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
    fillLight.position.set(-6, 1, -3);
    scene.add(fillLight);

    // ---------- 共用工具 ----------
    function disposeObject(obj) {
      obj.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); });
      });
    }
    function clearGroup(g) { g.children.slice().forEach(function (o) { g.remove(o); disposeObject(o); }); }
    /** 文字精靈（永遠面向鏡頭） */
    function sprite(g, text, pos, color, size) {
      const px = 64;
      const cv = document.createElement('canvas');
      const c0 = cv.getContext('2d');
      const font = '700 ' + px + 'px ' + FONT;
      c0.font = font;
      const w = Math.ceil(c0.measureText(text).width) + 28, h = px + 28;
      cv.width = w; cv.height = h;
      const c = cv.getContext('2d');
      c.font = font; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineWidth = 12; c.lineJoin = 'round';
      c.strokeStyle = isDark() ? 'rgba(10,14,20,0.85)' : 'rgba(255,255,255,0.92)';
      c.strokeText(text, w / 2, h / 2 + 2);
      c.fillStyle = color; c.fillText(text, w / 2, h / 2 + 2);
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
      const k = (size || 0.2) / px;
      s.scale.set(w * k, h * k, 1);
      s.position.copy(pos);
      s.renderOrder = 10;
      g.add(s);
      return s;
    }
    /** 點雲用的小球貼圖（白色帶立體明暗，乘上每一點的顏色） */
    function dotTexture() {
      const N = 64, c = document.createElement('canvas');
      c.width = c.height = N;
      const g = c.getContext('2d');
      const gr = g.createRadialGradient(N * 0.36, N * 0.34, N * 0.04, N / 2, N / 2, N / 2);
      gr.addColorStop(0, '#ffffff');
      gr.addColorStop(0.55, '#e4e4e4');
      gr.addColorStop(0.92, '#9a9a9a');
      gr.addColorStop(1, 'rgba(120,120,120,0)');
      g.fillStyle = gr;
      g.beginPath(); g.arc(N / 2, N / 2, N / 2, 0, PI * 2); g.fill();
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    }
    /** 地面上柔和的影子（假陰影，不必開陰影貼圖） */
    function shadowTexture() {
      const N = 128, c = document.createElement('canvas');
      c.width = c.height = N;
      const g = c.getContext('2d');
      const gr = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
      gr.addColorStop(0, 'rgba(0,0,0,1)');
      gr.addColorStop(0.55, 'rgba(0,0,0,0.45)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, N, N);
      return new THREE.CanvasTexture(c);
    }

    // ---------- 立方體（邊、角、對角線、標籤） ----------
    const cubeG = new THREE.Group();
    scene.add(cubeG);
    const labelG = new THREE.Group();
    scene.add(labelG);
    const CORNERS = [
      { c: [0, 0, 0], zh: '黑', en: 'Black' }, { c: [255, 255, 255], zh: '白', en: 'White' },
      { c: [255, 0, 0], zh: '紅', en: 'Red' }, { c: [0, 255, 0], zh: '綠', en: 'Green' }, { c: [0, 0, 255], zh: '藍', en: 'Blue' },
      { c: [0, 255, 255], zh: '青', en: 'Cyan' }, { c: [255, 0, 255], zh: '洋紅', en: 'Magenta' }, { c: [255, 255, 0], zh: '黃', en: 'Yellow' }
    ];
    const V = function (c) { return new THREE.Vector3(P(c[0]), P(c[1]), P(c[2])); };
    function buildCube() {
      clearGroup(cubeG);
      // 12 條邊：細圓柱，顏色沿著邊由一個角漸變到另一個角
      const rad = 0.016;
      for (let a = 0; a < 3; a++) {
        for (let m = 0; m < 4; m++) {
          const o = [0, 0, 0], others = [0, 1, 2].filter(function (x) { return x !== a; });
          o[others[0]] = (m & 1) ? 255 : 0; o[others[1]] = (m & 2) ? 255 : 0;
          const e = o.slice(); e[a] = 255;
          const geo = new THREE.CylinderGeometry(rad, rad, S, 10, 16, true);
          const pos = geo.attributes.position, cols = new Float32Array(pos.count * 3);
          for (let i = 0; i < pos.count; i++) {
            const t = pos.getY(i) / S + 0.5;
            for (let k = 0; k < 3; k++) cols[i * 3 + k] = lin(o[k] + (e[k] - o[k]) * t);
          }
          geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
          if (a === 0) geo.rotateZ(-PI / 2); else if (a === 2) geo.rotateX(PI / 2);
          const mid = o.slice(); mid[a] = 127.5;
          geo.translate(P(mid[0]), P(mid[1]), P(mid[2]));
          cubeG.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0 })));
        }
      }
      // 8 個角：有顏色的球
      const sg = new THREE.SphereGeometry(0.075, 24, 16);
      CORNERS.forEach(function (k) {
        const col = new THREE.Color().setRGB(lin(k.c[0]), lin(k.c[1]), lin(k.c[2]));
        const m = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ color: col, roughness: 0.3, metalness: 0,
          emissive: k.c[0] + k.c[1] + k.c[2] === 0 && isDark() ? new THREE.Color(0x1c2230) : new THREE.Color(0x000000) }));
        m.position.copy(V(k.c));
        cubeG.add(m);
      });
      // 灰階的對角線（黑 → 白）
      const dg = new THREE.BufferGeometry().setFromPoints([V([0, 0, 0]), V([255, 255, 255])]);
      const dl = new THREE.Line(dg, new THREE.LineDashedMaterial({ color: new THREE.Color(C.muted), dashSize: 0.07, gapSize: 0.05, transparent: true, opacity: 0.9 }));
      dl.computeLineDistances();
      cubeG.add(dl);
      // 地面的影子
      const sh = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, opacity: isDark() ? 0.55 : 0.22, depthWrite: false, color: 0x000000 }));
      sh.rotation.x = -PI / 2;
      sh.position.y = -S / 2 - 0.32;
      sh.renderOrder = -1;
      cubeG.add(sh);
      buildLabels();
    }
    function buildLabels() {
      clearGroup(labelG);
      CORNERS.forEach(function (k) {
        const p = V(k.c);
        const out = p.clone().normalize().multiplyScalar(0.24);
        sprite(labelG, T(k.zh, k.en), p.clone().add(out), C.text, 0.125);
      });
      // 三個軸：從黑色角出發的三條邊
      [['R', C['id-r'], [127.5, 0, 0]], ['G', C['id-g'], [0, 127.5, 0]], ['B', C['id-b'], [0, 0, 127.5]]].forEach(function (a) {
        const p = V(a[2]);
        const out = p.clone().normalize().multiplyScalar(0.22);
        sprite(labelG, a[0] + ' 0–255', p.clone().add(out), a[1], 0.11);
      });
    }

    // ---------- 量化格點 ----------
    const latG = new THREE.Group();
    scene.add(latG);
    let latKey = '';
    function buildLattice(cl) {
      const key = cl.mode + '|' + cl.b + '|' + cl.ver + '|' + (isDark() ? 1 : 0);
      if (key === latKey) return;
      latKey = key;
      clearGroup(latG);
      const L = 1 << cl.b, maxc = L - 1, sph = new THREE.SphereGeometry(1, 12, 8);
      const pts = [];
      if (cl.mode === 'gray') {
        for (let q = 0; q < L; q++) pts.push({ q: [q, q, q], used: cl.used.has(q) });
      } else if (cl.b <= LATTICE_MAX_B) {
        for (let r = 0; r < L; r++) for (let g = 0; g < L; g++) for (let b = 0; b < L; b++) pts.push({ q: [r, g, b], used: cl.used.has((r * 256 + g) * 256 + b) });
      }
      if (!pts.length) return;
      const usedPts = pts.filter(function (p) { return p.used; }), freePts = pts.filter(function (p) { return !p.used; });
      const m4 = new THREE.Matrix4(), col = new THREE.Color();
      const val = function (q) { return Math.round(q * 255 / maxc); };
      const big = cl.mode === 'gray' ? 0.045 : Math.max(0.026, Math.min(0.06, 0.36 / L));
      if (freePts.length) {
        const im = new THREE.InstancedMesh(sph, new THREE.MeshBasicMaterial({ color: new THREE.Color(C.muted), transparent: true, opacity: isDark() ? 0.55 : 0.5, depthWrite: false }), freePts.length);
        const r = big * 0.42;
        freePts.forEach(function (p, i) { m4.makeScale(r, r, r).setPosition(P(val(p.q[0])), P(val(p.q[1])), P(val(p.q[2]))); im.setMatrixAt(i, m4); });
        im.instanceMatrix.needsUpdate = true;
        latG.add(im);
      }
      if (usedPts.length) {
        const im = new THREE.InstancedMesh(sph.clone(), new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0, transparent: true, opacity: 0.55, depthWrite: false }), usedPts.length);
        usedPts.forEach(function (p, i) {
          const v = [val(p.q[0]), val(p.q[1]), val(p.q[2])];
          m4.makeScale(big, big, big).setPosition(P(v[0]), P(v[1]), P(v[2]));
          im.setMatrixAt(i, m4);
          im.setColorAt(i, col.setRGB(lin(v[0]), lin(v[1]), lin(v[2])));
        });
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
        latG.add(im);
      }
    }

    // ---------- 點雲（每一點是一個像素） ----------
    const PTK = 1 / Math.tan(camera.fov * PI / 360);
    const dotTex = dotTexture();
    const ptMat = new THREE.PointsMaterial({ size: 0.05 * PTK, sizeAttenuation: true, vertexColors: true, map: dotTex, transparent: true, alphaTest: 0.35, depthWrite: true, toneMapped: false });
    let points = null, pos = null, colr = null, from = null, to = null, fromC = null, toC = null;
    let anim = null, cloudVer = -1, cloudSet = '';
    function ensurePoints(n) {
      if (points && points.geometry.attributes.position.count === n) return false;
      if (points) { scene.remove(points); points.geometry.dispose(); }
      const g = new THREE.BufferGeometry();
      pos = new Float32Array(n * 3); colr = new Float32Array(n * 3);
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(colr, 3));
      points = new THREE.Points(g, ptMat);
      scene.add(points);
      return true;
    }
    /** 依目前的 t（0 → 1）放好每一點：位置與顏色都從 from 漸變到 to */
    function placePoints(t) {
      if (!points) return;
      const n = pos.length / 3, e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      for (let k = 0; k < n * 3; k++) {
        pos[k] = P(from[k] + (to[k] - from[k]) * e);
        colr[k] = lin(fromC[k] + (toC[k] - fromC[k]) * e);
      }
      points.geometry.attributes.position.needsUpdate = true;
      points.geometry.attributes.color.needsUpdate = true;
      points.geometry.computeBoundingSphere();
    }
    function startSnap(fromArr, fromCol) {
      const cl = B.cloud();
      from = fromArr; fromC = fromCol;
      to = cl.dst; toC = cl.dst;
      if (B.reducedMotion) { anim = null; placePoints(1); return; }
      anim = { t0: performance.now() };
      placePoints(0);
    }
    function currentArrays() {
      // 動畫進行到一半時，從目前的位置與顏色接著走
      if (!anim || !from) return null;
      const t = Math.min(1, (performance.now() - anim.t0) / (SNAP_SEC * 1000));
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const a = new Float32Array(from.length), c = new Float32Array(from.length);
      for (let k = 0; k < from.length; k++) { a[k] = from[k] + (to[k] - from[k]) * e; c[k] = fromC[k] + (toC[k] - fromC[k]) * e; }
      return [a, c];
    }
    function syncCloud(force) {
      const cl = B.cloud();
      if (!cl) return;
      if (!force && cl.ver === cloudVer) return;
      const set = cl.scene + '|' + cl.method + '|' + cl.N + '|' + cl.n;
      const fresh = ensurePoints(cl.n);
      if (force || fresh || set !== cloudSet) startSnap(cl.src, cl.src);
      else {
        // 只改了色彩模式或位元數：從目前的位置吸到新的格點
        const curArr = currentArrays();
        startSnap(curArr ? curArr[0] : to, curArr ? curArr[1] : toC);
      }
      cloudVer = cl.ver; cloudSet = set;
      ptMat.size = (cl.n < 600 ? 0.075 : cl.n < 1500 ? 0.06 : 0.05) * PTK;
      buildLattice(cl);
      updateHud(cl);
      requestRender();
    }
    function updateHud(cl) {
      const L = 1 << cl.b, used = cl.used.size;
      setHud('t', T('RGB 色立方', 'RGB color cube'));
      if (cl.mode === 'gray') {
        setHud('lat', T('灰階：' + L + ' 個格點都在對角線上・用到 ' + used + ' 個', 'Grayscale: all ' + L + ' lattice points lie on the diagonal · ' + used + ' used'));
      } else if (cl.b <= LATTICE_MAX_B) {
        setHud('lat', T('格點 (2<sup>' + cl.b + '</sup>)<sup>3</sup> = ' + B.intText(L * L * L) + ' 個・用到 ' + B.intText(used) + ' 個', 'Lattice (2<sup>' + cl.b + '</sup>)<sup>3</sup> = ' + B.intText(L * L * L) + ' points · ' + B.intText(used) + ' used'));
      } else {
        setHud('lat', T('格點 (2<sup>' + cl.b + '</sup>)<sup>3</sup> = ' + B.intText(L * L * L) + ' 個，太密不畫出・用到 ' + B.intText(used) + ' 個', 'Lattice (2<sup>' + cl.b + '</sup>)<sup>3</sup> = ' + B.intText(L * L * L) + ' points, too dense to draw · ' + B.intText(used) + ' used'));
      }
      setHud('tip', cl.n < cl.N
        ? T('每個點是一個像素（畫出 ' + B.intText(cl.n) + '／' + B.intText(cl.N) + ' 個）', 'Each dot is one pixel (' + B.intText(cl.n) + ' of ' + B.intText(cl.N) + ' shown)')
        : T('每個點是一個像素（共 ' + B.intText(cl.N) + ' 個）', 'Each dot is one pixel (' + B.intText(cl.N) + ' in all)'));
    }

    // ---------- 相機 ----------
    const HOME = new THREE.Vector3(2.0, 1.0, 2.4).normalize();
    function resetCamera() {
      const fitR = 2.05;
      const vfov = camera.fov * DEG, hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
      const dist = fitR / Math.sin(Math.min(vfov, hfov) / 2);
      controls.target.set(0, -0.05, 0);
      camera.position.copy(HOME).multiplyScalar(dist).add(controls.target);
      camera.up.set(0, 1, 0);
      camera.near = 0.05; camera.far = dist * 6;
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
      let more = false;
      if (anim) {
        const t = Math.min(1, (performance.now() - anim.t0) / (SNAP_SEC * 1000));
        placePoints(t);
        if (t >= 1) anim = null; else more = true;
      }
      const moved = controls.update();
      renderer.render(scene, camera);
      if (moved) more = true;
      else if (reportPending && !startPos) { reportPending = false; reportDir(); }
      if (more || reportPending) requestRender();
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
    // 鍵盤：方向鍵繞著立方體轉
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
      reportPending = true;
      requestRender();
    });

    const api = {
      active: true,
      /** 2D 重新計算之後呼叫：點雲、格點、資訊列跟著更新 */
      update: function () { syncCloud(false); },
      /** 重播吸附：點回到取樣到的顏色，再吸到量化後的格點 */
      replay: function () { syncCloud(true); },
      onTheme: function () {
        C = B.colors();
        Object.keys(hudLast).forEach(function (k) { delete hudLast[k]; });
        buildCube();
        latKey = '';
        const cl = B.cloud();
        if (cl) { buildLattice(cl); updateHud(cl); }
        requestRender();
      },
      resetCamera: function () { resetCamera(); },
      /** 測試用：直接把視線設成某個方向（RGB 座標），和拖曳結束一樣回報 */
      lookFrom: function (dir) {
        const d = new THREE.Vector3(dir[0], dir[1], dir[2]).normalize();
        const dist = camera.position.distanceTo(controls.target);
        camera.position.copy(controls.target).add(d.multiplyScalar(dist));
        controls.update();
        reportPending = true;
        requestRender();
      },
      dispose: function () {
        api.active = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize3);
        document.removeEventListener('visibilitychange', onVisible);
        controls.dispose();
        disposeObject(scene);
        dotTex.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        wrap.remove();
      }
    };

    buildCube();
    resize3();
    syncCloud(true);
    resetCamera();
    return api;
  }

  window.ImageDigit3D = { create: create };
})();
