/*
 * contour-map-3d.js — 「等高線與 3D 地形」的立體地形（three.js）
 *
 * 由 js/contour-map.js 在使用者按「3D 立體地形」時才載入（three.js 也是那時才以 import() 載入）；切回 2D 時整個釋放。
 * 用法：window.ContourMap3D.create({ THREE, OrbitControls }, 容器, bridge) → { active, frame, busy, onShow, onTheme, onTerrain, onLook, onChange, resetCamera, camTo, dispose }
 *
 * 場景座標：1 單位 = 1 km；島的中心在原點，x 向東、y 向北、z 向上；高度乘上「垂直誇大」倍數（和剖面圖同一個滑桿）。
 * 2D 給不了的：水平切面（橘色平面）和地面相交的線，與正下方底圖上的等高線是同一條——等高線就是一刀一刀的水平切片疊在一起往下看；
 * 剖面帷幕把 2D 的剖面圖立在地形上，看得出剖面線經過哪些山與谷。
 */
(function () {
  'use strict';

  function create(lib, host, B) {
    const THREE = lib.THREE;
    const K = B.K, T = B.T, state = B.state, D = B.D;
    const N = K.N, CELL = K.CELL, S = 1 / 1000, HALF = K.SIZE * S / 2;
    let C = B.colors();

    // ---------- 畫布與 HUD ----------
    const wrap = document.createElement('div');
    wrap.className = 'c3-wrap';
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', T('島嶼的 3D 立體地形（可拖曳旋轉、縮放）；橘色是水平切面，下方是同一張等高線地圖', '3D terrain of the island (drag to rotate, pinch or scroll to zoom); orange is the level plane, below is the same contour map'));
    wrap.appendChild(canvas);
    const hud = document.createElement('div');
    hud.className = 'c3-hud';
    hud.setAttribute('aria-hidden', 'true');
    hud.innerHTML = '<div class="tl"><span data-k="name"></span><span class="m" data-k="ex"></span></div>' +
      '<div class="br"><span class="m" data-k="slice"></span><span class="m" data-k="sea"></span></div>';
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
    const camera = new THREE.PerspectiveCamera(34, 1.6, 0.05, 300);
    camera.up.set(0, 0, 1);
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.rotateSpeed = 0.7;
    controls.enablePan = false;
    controls.minDistance = 3;
    controls.maxDistance = 45;

    // 天光＋從西北方斜射的主光（和 2D 陰影的光源方向一樣）
    scene.add(new THREE.HemisphereLight(0xe8f0ff, 0x3a3328, 1.25));
    const sun = new THREE.DirectionalLight(0xffffff, 1.35);
    sun.position.set(-5, 5, 7);
    scene.add(sun);

    const V = function (a) { return new THREE.Vector3(a[0], a[1], a[2]); };
    const col = function (c) { return new THREE.Color(C[c] || c || '#888888'); };
    let mapTex = null;
    function disposeObject(obj) {
      obj.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m.map && m.map !== mapTex) m.map.dispose(); m.dispose(); });
      });
    }
    function clearGroup(g) { disposeObject(g); g.clear(); }
    const vex = function () { return state.vexag; };
    const zOf = function (h) { return h * S * vex(); };
    const X = function (x) { return x * S - HALF; };
    function floorZ() { return Math.min(-0.9, zOf(-120)) - 1.0; }

    // ---------- 地圖貼圖（地形表面與底圖共用） ----------
    let texKey = '', texAt = 0, texTimer = 0;
    function updateTexture(force) {
      const key = [B.terrain().id, state.iv, state.tint, state.shade, state.lines, state.rivers, state.sea, state.slice, D.ver, D.dark].join('|');
      if (key === texKey && mapTex) return;
      const now = performance.now();
      if (!force && mapTex && now - texAt < 140) {           // 拖滑桿時不要每一格都重畫貼圖
        clearTimeout(texTimer);
        texTimer = setTimeout(function () { B.request(); }, 150);
        return;
      }
      texKey = key; texAt = now;
      const c = B.mapTexture(1024, { lineScale: 1.15 });
      if (!mapTex) {
        mapTex = new THREE.CanvasTexture(c);
        mapTex.colorSpace = THREE.SRGBColorSpace;
        mapTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      } else { mapTex.image = c; mapTex.needsUpdate = true; }
      terrainMat.map = mapTex; floorMat.map = mapTex;
      terrainMat.needsUpdate = true; floorMat.needsUpdate = true;
    }

    // ---------- 地形表面（201 × 201 網格） ----------
    const tGeo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * N * 3), uv = new Float32Array(N * N * 2);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = j * N + i;
      pos[k * 3] = X(i * CELL); pos[k * 3 + 1] = X(j * CELL);
      uv[k * 2] = i / (N - 1); uv[k * 2 + 1] = j / (N - 1);
    }
    const idx = new Uint32Array((N - 1) * (N - 1) * 6);
    let q = 0;
    for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) {
      const a = j * N + i, b = a + 1, c = a + N, d = c + 1;
      idx[q++] = a; idx[q++] = b; idx[q++] = d; idx[q++] = a; idx[q++] = d; idx[q++] = c;
    }
    tGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    tGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    tGeo.setIndex(new THREE.BufferAttribute(idx, 1));
    const terrainMat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const terrainMesh = new THREE.Mesh(tGeo, terrainMat);
    scene.add(terrainMesh);
    function placeTerrain() {
      const g = B.terrain().grid, p = tGeo.attributes.position.array;
      for (let k = 0; k < N * N; k++) p[k * 3 + 2] = zOf(g[k]);
      tGeo.attributes.position.needsUpdate = true;
      tGeo.computeVertexNormals();
      tGeo.computeBoundingSphere();
    }

    // ---------- 底圖（同一張等高線地圖，放在地形正下方）、海面、水平切面 ----------
    const floorMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(2 * HALF, 2 * HALF), floorMat);
    scene.add(floor);
    const frameGeo = new THREE.BufferGeometry().setFromPoints([V([-HALF, -HALF, 0]), V([HALF, -HALF, 0]), V([HALF, HALF, 0]), V([-HALF, HALF, 0]), V([-HALF, -HALF, 0])]);
    const frame = new THREE.Line(frameGeo, new THREE.LineBasicMaterial({ color: 0x9aa7b4 }));
    floor.add(frame);
    const seaMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(2 * HALF, 2 * HALF), seaMat);
    sea.renderOrder = 4;
    scene.add(sea);
    const sliceMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.17, depthWrite: false, side: THREE.DoubleSide });
    const slicePlane = new THREE.Mesh(new THREE.PlaneGeometry(2 * HALF, 2 * HALF), sliceMat);
    slicePlane.renderOrder = 6;
    scene.add(slicePlane);
    const sliceEdge = new THREE.Line(frameGeo.clone(), new THREE.LineBasicMaterial({ transparent: true, opacity: 0.6 }));
    slicePlane.add(sliceEdge);
    const sliceGroup = new THREE.Group(), overGroup = new THREE.Group();
    scene.add(sliceGroup); scene.add(overGroup);

    function tube(points, color, radius, opacity) {
      if (points.length < 2) return null;
      const curve = new THREE.CatmullRomCurve3(points.map(V), false, 'centripetal');
      const g = new THREE.TubeGeometry(curve, Math.min(900, points.length * 2), radius, 6, false);
      const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: opacity != null && opacity < 1, opacity: opacity == null ? 1 : opacity });
      const mesh = new THREE.Mesh(g, m);
      mesh.renderOrder = 8;
      return mesh;
    }
    /** 把一條折線抽稀到點距約 step 公尺（tube 才不會太重） */
    function thin(pts, step) {
      const out = [pts[0]];
      let acc = 0;
      for (let i = 1; i < pts.length; i++) {
        acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        if (acc >= step || i === pts.length - 1) { out.push(pts[i]); acc = 0; }
      }
      return out;
    }
    function buildSlice() {
      clearGroup(sliceGroup);
      const zs = zOf(state.slice), zf = floorZ();
      const lines = B.sliceLines();
      const color = C['cm-slice'];
      const drops = [];
      lines.forEach(function (ln) {
        if (ln.pts.length < 3) return;
        const pts = thin(ln.pts, 60);
        const t = tube(pts.map(function (p) { return [X(p[0]), X(p[1]), zs + 0.004]; }), color, 0.024);
        if (t) sliceGroup.add(t);
        // 從切面線往下到底圖的垂直虛線：等高線就是切面線「投影」到地圖上
        let acc = 0;
        for (let i = 1; i < ln.pts.length; i++) {
          acc += Math.hypot(ln.pts[i][0] - ln.pts[i - 1][0], ln.pts[i][1] - ln.pts[i - 1][1]);
          if (acc >= 900) { acc = 0; drops.push(ln.pts[i]); }
        }
      });
      if (drops.length) {
        const arr = [];
        drops.slice(0, 40).forEach(function (p) { arr.push(V([X(p[0]), X(p[1]), zs]), V([X(p[0]), X(p[1]), zf + 0.01])); });
        const g = new THREE.BufferGeometry().setFromPoints(arr);
        const ls = new THREE.LineSegments(g, new THREE.LineDashedMaterial({ color: new THREE.Color(color), dashSize: 0.08, gapSize: 0.07, transparent: true, opacity: 0.85 }));
        ls.computeLineDistances();
        sliceGroup.add(ls);
      }
    }

    // ---------- 剖面帷幕、視線、量測點 ----------
    const RES = Math.min(window.devicePixelRatio || 1, 2);
    function label(text, color, pos) {
      const font = '700 ' + 13 * RES + 'px ' + D.FONT;
      const c = document.createElement('canvas');
      let g = c.getContext('2d');
      g.font = font;
      const tw = g.measureText(text).width;
      c.width = Math.ceil(tw + 14 * RES); c.height = Math.ceil(21 * RES);
      g = c.getContext('2d');
      const r = c.height / 2 - RES;
      g.beginPath();
      g.moveTo(r + RES, RES); g.arcTo(c.width - RES, RES, c.width - RES, c.height - RES, r); g.arcTo(c.width - RES, c.height - RES, RES, c.height - RES, r);
      g.arcTo(RES, c.height - RES, RES, RES, r); g.arcTo(RES, RES, c.width - RES, RES, r); g.closePath();
      g.fillStyle = 'rgba(8,14,24,0.82)'; g.fill();
      g.strokeStyle = color; g.globalAlpha = 0.7; g.lineWidth = RES; g.stroke(); g.globalAlpha = 1;
      g.font = font; g.textBaseline = 'middle'; g.textAlign = 'center'; g.fillStyle = color; g.fillText(text, c.width / 2, c.height / 2 + RES * 0.5);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false }));
      sp.userData = { lw: c.width / RES, lh: c.height / RES, isLabel: true };
      sp.center.set(0.5, 0);
      sp.position.copy(pos);
      sp.renderOrder = 30;
      fitLabel(sp);
      return sp;
    }
    function fitLabel(sp) {
      const k = 2 * Math.tan(camera.fov * Math.PI / 360) / Math.max(1, ch);
      sp.scale.set(sp.userData.lw * k, sp.userData.lh * k, 1);
    }
    function buildOverlays() {
      clearGroup(overGroup);
      const TR = B.terrain();
      const P = B.prof();
      if (P && P.L >= 20) {
        const n = P.h.length - 1, A = state.A, Bp = state.B;
        const zb = zOf(Math.min(P.minH, state.sea) - 40);
        const arr = new Float32Array((n + 1) * 6);
        const top = [];
        for (let i = 0; i <= n; i++) {
          const t = i / n, x = X(A[0] + (Bp[0] - A[0]) * t), y = X(A[1] + (Bp[1] - A[1]) * t), z = zOf(P.h[i]);
          arr.set([x, y, z, x, y, zb], i * 6);
          if (i % 4 === 0 || i === n) top.push([x, y, z + 0.008]);
        }
        const ix = [];
        for (let i = 0; i < n; i++) { const a = i * 2; ix.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
        g.setIndex(ix);
        const wall = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: col('cm-prof'), transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide }));
        wall.renderOrder = 7;
        overGroup.add(wall);
        const tl = tube(top, C['cm-prof'], 0.02); if (tl) overGroup.add(tl);
        // 視線（眼睛離地 1.6 m；在這個比例下貼著地面）
        const eA = Math.max(P.hA, state.sea) + K.EYE, eB = Math.max(P.hB, state.sea) + K.EYE;
        const pa = [X(A[0]), X(A[1]), zOf(eA) + 0.03], pb = [X(Bp[0]), X(Bp[1]), zOf(eB) + 0.03];
        const sl = tube([pa, pb], P.visible ? C['cm-see'] : C['cm-block'], 0.012, 0.9); if (sl) overGroup.add(sl);
        [['A', A, pa], ['B', Bp, pb]].forEach(function (e) {
          const m = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), new THREE.MeshBasicMaterial({ color: col('cm-prof') }));
          m.position.set(e[2][0], e[2][1], e[2][2]);
          m.renderOrder = 9;
          overGroup.add(m);
          overGroup.add(label(e[0], C['cm-prof'], V([e[2][0], e[2][1], e[2][2] + 0.12])));
        });
      }
      if (state.probe) {
        const p = state.probe, z = zOf(Math.max(TR.h(p[0], p[1]), state.sea));
        const g = new THREE.BufferGeometry().setFromPoints([V([X(p[0]), X(p[1]), z]), V([X(p[0]), X(p[1]), z + 0.55])]);
        overGroup.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: col('cm-probe') })));
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), new THREE.MeshBasicMaterial({ color: col('cm-probe') }));
        m.position.set(X(p[0]), X(p[1]), z + 0.55);
        m.renderOrder = 9;
        overGroup.add(m);
      }
    }

    // ---------- 更新 ----------
    let geoKey = '', sliceKey = '', overKey = '', labelLang = '';
    function update() {
      const TR = B.terrain();
      const lang = T('zh', 'en');
      const gk = TR.id + '|' + state.vexag;
      if (gk !== geoKey) { geoKey = gk; placeTerrain(); }
      updateTexture(false);
      floor.position.z = floorZ();
      sea.position.z = zOf(state.sea) + 0.002;
      seaMat.color = col('cm-sea2'); seaMat.opacity = D.dark ? 0.55 : 0.45;
      sea.visible = state.sea > -1;
      slicePlane.position.z = zOf(state.slice);
      sliceMat.color = col('cm-slice'); sliceEdge.material.color = col('cm-slice');
      const sk = [TR.id, state.slice, state.vexag, D.ver].join('|');
      if (sk !== sliceKey) { sliceKey = sk; buildSlice(); }
      const ok = JSON.stringify([TR.id, state.A, state.B, state.probe, state.sea, state.vexag, D.ver, lang]);
      if (ok !== overKey) { overKey = ok; buildOverlays(); }
      if (lang !== labelLang) { labelLang = lang; Object.keys(hudLast).forEach(function (k) { delete hudLast[k]; }); }
      setHud('name', B.name() + T('（最高 ', ' (highest ') + B.num(TR.max, 0) + ' m' + T('）', ')'));
      setHud('ex', T('垂直誇大 ×', 'Vertical exaggeration ×') + B.num(state.vexag, state.vexag % 1 ? 1 : 0));
      setHud('slice', state.slice < TR.max
        ? T('橘色平面高 ' + B.num(state.slice, 0) + ' m：它切過地面的線，就是底圖上 ' + B.num(state.slice, 0) + ' m 的等高線', 'Orange plane at ' + B.num(state.slice, 0) + ' m: where it cuts the land is the ' + B.num(state.slice, 0) + ' m contour on the map below')
        : T('橘色平面高 ' + B.num(state.slice, 0) + ' m：比最高峰還高，切不到地面', 'Orange plane at ' + B.num(state.slice, 0) + ' m: above the highest peak, it cuts nothing'));
      setHud('sea', T('海平面 ', 'Sea level ') + B.num(state.sea, 0) + ' m');
    }

    // ---------- 相機 ----------
    let cw = 300, ch = 300;
    function sizeOf(w) { return w < 560 ? 380 : 470; }
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
      const TR = B.terrain(), zm = zOf(TR.max) * 0.45, far = camera.aspect < 1 ? 1.3 : 1;
      if (kind === 'top') return { pos: V([0, -0.01, 17 * far + zOf(TR.max)]), tgt: V([0, 0, 0]) };
      if (kind === 'side') {
        let nx = 0, ny = -1, mx = 0, my = 0;
        if (state.A && state.B) {
          const dx = state.B[0] - state.A[0], dy = state.B[1] - state.A[1], L = Math.hypot(dx, dy);
          if (L > 1) { nx = dy / L; ny = -dx / L; if (ny > 0 || (ny === 0 && nx < 0)) { nx = -nx; ny = -ny; } }
          mx = X((state.A[0] + state.B[0]) / 2); my = X((state.A[1] + state.B[1]) / 2);
        }
        const d = 12.5 * far;
        return { pos: V([mx + nx * d, my + ny * d, zm + 0.6]), tgt: V([mx, my, zm]) };
      }
      return { pos: V([-6.2 * far, -10.5 * far, 7.8 * far + zm]), tgt: V([0, 0.3, zm * 0.5]) };
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

    const api = {
      active: true,
      frame: function () { update(); render(); },
      busy: function () { return !!camAnim || moving; },
      onShow: function () { resize3(); camTo('tilt', false); },
      onTheme: function () {
        C = B.colors();
        Object.keys(hudLast).forEach(function (k) { delete hudLast[k]; });
        texKey = ''; overKey = ''; sliceKey = '';
        updateTexture(true);
        update(); render();
      },
      onTerrain: function () { texKey = ''; B.request(); },
      onLook: function () { B.request(); },
      onChange: function () { B.request(); },
      resetCamera: function () { camTo('tilt', true); },
      camTo: function (kind) { camTo(kind, true); },
      dispose: function () {
        api.active = false;
        clearTimeout(texTimer);
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
    updateTexture(true);
    update();
    camTo('tilt', false);
    return api;
  }

  window.ContourMap3D = { create: create };
})();
