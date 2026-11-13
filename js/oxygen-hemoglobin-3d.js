/*
 * oxygen-hemoglobin-3d.js — 「氧氣與血紅素」第二部分的 3D 血紅素分子（three.js）
 *
 * 由 js/oxygen-hemoglobin.js 在使用者按「3D 分子」時才載入（three.js 也是那時才以 import() 載入）；切回 2D 時整個釋放。
 * 用法：window.OH3D.create({ THREE, OrbitControls }, 容器, bridge) → { active, frame, onShow, onTheme, resetCamera, rebuild, resize, busy, dispose }
 *
 * 血紅素（Perutz 1970；PDB 2DN2 去氧 T 型、2DN1 氧合 R 型）：四條鏈 α1、α2、β1、β2，整體約 6.5 × 5.5 × 5 nm，
 * 每條鏈夾著一個血基質（紫質環中央一個 Fe²⁺），每個血基質可以結合一個 O2。
 * T → R 時，α1β1 二聚體相對 α2β2 轉約 15°，兩條 β 鏈之間的中央空腔變窄，2,3-BPG 被擠出來。
 * 這裡 1 單位 = 1 nm；鏈畫成凹凸的團塊（不畫個別原子），轉角與空腔大小都是示意。
 * 畫面上的這一個分子，每秒約 1 次依目前氧分壓下 MWC 模型的機率（bridge.dist()）重抽狀態，再平滑地轉過去。
 */
(function () {
  'use strict';
  const TURN = 15 * Math.PI / 180;   // 二聚體相對轉角（示意）
  const REDRAW = 1.0;                // 每秒平均重抽次數

  function create(lib, host, BR) {
    const THREE = lib.THREE;
    const T = BR.T, D = BR.D, O = BR.O;
    let C = BR.colors();

    const wrap = document.createElement('div');
    wrap.className = 'oh3-wrap';
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', T('血紅素分子的 3D 模型：四條鏈各夾著一個血基質，結合氧時變紅；T 和 R 兩種狀態之間，上下兩半會相對轉動（可拖曳旋轉、縮放）',
      '3D model of a haemoglobin molecule: each of the four chains holds a haem that turns red when it binds oxygen; between the T and R states the two halves twist against each other (drag to rotate, pinch or scroll to zoom)'));
    wrap.appendChild(canvas);
    const hud = document.createElement('div');
    hud.className = 'oh3-hud';
    hud.setAttribute('aria-hidden', 'true');
    hud.innerHTML = '<div class="tl"><span data-k="t"></span><span class="m" data-k="v"></span></div><div class="br"><span class="m" data-k="note"></span></div>';
    wrap.appendChild(hud);
    host.appendChild(wrap);
    const hudEl = {};
    hud.querySelectorAll('[data-k]').forEach(function (e) { hudEl[e.getAttribute('data-k')] = e; });
    const hudLast = {};
    function setHud(k, s) { if (hudLast[k] !== s) { hudLast[k] = s; hudEl[k].textContent = s; } }

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
    const camera = new THREE.PerspectiveCamera(34, 1.5, 0.1, 200);
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.rotateSpeed = 0.85;
    controls.enablePan = false;
    controls.minDistance = 8;
    controls.maxDistance = 40;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.05));
    const key = new THREE.DirectionalLight(0xffffff, 1.7);
    key.position.set(-6, 10, 12);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xbfdcff, 0.6);
    rim.position.set(8, -4, -10);
    scene.add(rim);

    function col(s) { return new THREE.Color(s); }
    function disposeObject(obj) {
      obj.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); });
      });
    }
    function label(text, color) {
      const c = document.createElement('canvas'), g = c.getContext('2d');
      const fs = 44;
      g.font = '600 ' + fs + 'px ' + D.FONT;
      const w = Math.ceil(g.measureText(text).width) + 16;
      c.width = w; c.height = fs + 16;
      g.font = '600 ' + fs + 'px ' + D.FONT;
      g.textBaseline = 'middle'; g.textAlign = 'center';
      g.lineWidth = 8; g.strokeStyle = D.dark ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.9)';
      g.strokeText(text, w / 2, c.height / 2);
      g.fillStyle = color; g.fillText(text, w / 2, c.height / 2);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
      const hgt = 0.62;
      sp.scale.set(hgt * w / c.height, hgt, 1);
      sp.renderOrder = 10;
      return sp;
    }
    /** 凹凸的蛋白質團塊：在橢球上加幾個平滑的起伏（固定的種子，每條鏈不同） */
    function blobGeometry(rx, ry, rz, seed) {
      const geo = new THREE.SphereGeometry(1, 72, 54);   // 有索引的球面：computeVertexNormals 才會平滑
      const p = geo.attributes.position;
      const v = new THREE.Vector3();
      const k = [1.7 + seed * 0.31, 2.3 + seed * 0.17, 2.9 + seed * 0.23];
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).normalize();
        const bump = 1 + 0.06 * Math.sin(k[0] * v.x * 3 + seed) * Math.cos(k[1] * v.y * 3 - seed) +
          0.04 * Math.sin(k[2] * v.z * 4 + 2 * seed) + 0.025 * Math.sin(9 * v.x + 7 * v.y + seed);
        p.setXYZ(i, v.x * rx * bump, v.y * ry * bump, v.z * rz * bump);
      }
      geo.computeVertexNormals();
      return geo;
    }

    // ---------- 場景 ----------
    const root = new THREE.Group();
    scene.add(root);
    const halves = [new THREE.Group(), new THREE.Group()];   // α1β1、α2β2
    halves.forEach(function (h) { root.add(h); });
    const chains = [];   // {mesh, heme, iron, o2, mat, hemeMat, bound(0–1)}
    const labels = [];
    let bpg = null, bpgMat = null;
    const ALPHA = '#e8a5b8', BETA = '#9fb7d9';
    function chainColor(isAlpha) { return D.dark ? (isAlpha ? '#d98aa0' : '#87a3cc') : (isAlpha ? ALPHA : BETA); }
    function build() {
      // 清掉舊的
      halves.forEach(function (h) { while (h.children.length) { const o = h.children.pop(); disposeObject(o); } });
      if (bpg) { root.remove(bpg); disposeObject(bpg); bpg = null; }
      labels.forEach(function (l) { l.parent && l.parent.remove(l); disposeObject(l); });
      labels.length = 0;
      chains.length = 0;
      // 每個二聚體：α 在上、β 在下；第二個二聚體是第一個繞 y 軸轉 180°（二重對稱軸）
      const spec = [
        { half: 0, alpha: true, pos: [-1.45, 1.05, 0.55], name: 'α1' },
        { half: 0, alpha: false, pos: [-1.35, -1.1, -0.6], name: 'β1' },
        { half: 1, alpha: true, pos: [1.45, 1.05, -0.55], name: 'α2' },
        { half: 1, alpha: false, pos: [1.35, -1.1, 0.6], name: 'β2' }
      ];
      spec.forEach(function (s, i) {
        const mat = new THREE.MeshStandardMaterial({ color: col(chainColor(s.alpha)), roughness: 0.62, metalness: 0.02 });
        const mesh = new THREE.Mesh(blobGeometry(s.alpha ? 1.55 : 1.65, 1.3, 1.35, i + 1), mat);
        mesh.position.set(s.pos[0], s.pos[1], s.pos[2]);
        halves[s.half].add(mesh);
        // 血基質：朝外的一面
        const out = new THREE.Vector3(s.pos[0], s.pos[1] * 0.4, s.pos[2]).normalize();
        const hemeMat = new THREE.MeshStandardMaterial({ color: col(C['oh-dis']), roughness: 0.35, metalness: 0.1, emissive: col('#000000') });
        const heme = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.12, 32), hemeMat);
        const hp = new THREE.Vector3(s.pos[0], s.pos[1], s.pos[2]).add(out.clone().multiplyScalar(1.58));
        heme.position.copy(hp);
        heme.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), out);
        halves[s.half].add(heme);
        const iron = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), new THREE.MeshStandardMaterial({ color: col('#d9822b'), roughness: 0.3, metalness: 0.5 }));
        iron.position.copy(hp);
        halves[s.half].add(iron);
        // O2：兩個氧原子，彎曲地接在鐵上（Fe–O–O 約 120°，示意）
        const o2 = new THREE.Group();
        const oMat = new THREE.MeshStandardMaterial({ color: col(C['oh-o2']), roughness: 0.3, metalness: 0.05 });
        const a1 = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), oMat);
        const a2 = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), oMat);
        a1.position.set(0, 0.32, 0); a2.position.set(0.24, 0.5, 0);
        o2.add(a1); o2.add(a2);
        o2.position.copy(hp);
        o2.quaternion.copy(heme.quaternion);
        o2.scale.setScalar(0.001);
        halves[s.half].add(o2);
        const lb = label(s.name, D.c.text);
        lb.position.set(s.pos[0] * 1.15, s.pos[1] * 1.55, s.pos[2] * 1.2);
        halves[s.half].add(lb); labels.push(lb);
        chains.push({ mesh: mesh, heme: heme, hemeMat: hemeMat, o2: o2, oMat: oMat, bound: 0, target: 0 });
      });
      // 2,3-BPG：兩條 β 鏈之間的中央空腔（T 狀態才在）
      bpg = new THREE.Group();
      bpgMat = new THREE.MeshStandardMaterial({ color: col('#e6b422'), roughness: 0.4, metalness: 0.1, transparent: true, opacity: 1 });
      [[0, 0, 0], [0.28, 0.12, 0.1], [-0.28, 0.1, -0.1], [0.1, -0.25, 0.18], [-0.12, -0.22, -0.2]].forEach(function (q) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), bpgMat);
        m.position.set(q[0], q[1], q[2]); bpg.add(m);
      });
      bpg.position.set(0, -1.6, 0);
      root.add(bpg);
      const bl = label('2,3-BPG', '#c58f00');
      bl.position.set(0, -2.75, 0);
      bpg.add(bl); labels.push(bl);
      applyState(true);
    }

    // ---------- 狀態 ----------
    const r = O.rng(97);
    const mol = { R: false, k: 0, rr: 0 };   // rr：0 = T、1 = R（平滑）
    let nextDraw = 0, tNow = 0;
    function redraw() {
      const d = O.draw(BR.dist(), r);
      mol.R = d.R; mol.k = d.k;
      // 哪幾個血基質有氧：隨機挑 k 個，但盡量保留原本有氧的
      const idx = [0, 1, 2, 3];
      const held = idx.filter(function (i) { return chains[i] && chains[i].target === 1; });
      const free = idx.filter(function (i) { return held.indexOf(i) < 0; });
      shuffle(held); shuffle(free);
      let pick;
      if (held.length >= d.k) pick = held.slice(0, d.k);
      else pick = held.concat(free.slice(0, d.k - held.length));
      chains.forEach(function (c, i) { c.target = pick.indexOf(i) >= 0 ? 1 : 0; });
    }
    function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } }
    function applyState(snap) {
      const e = mol.rr * mol.rr * (3 - 2 * mol.rr);
      halves[0].rotation.set(0, 0, e * TURN / 2);
      halves[1].rotation.set(0, 0, -e * TURN / 2);
      halves[0].position.set(e * 0.12, 0, 0);
      halves[1].position.set(-e * 0.12, 0, 0);
      if (bpg) {
        const show = 1 - e;
        bpg.scale.setScalar(Math.max(0.001, show));
        bpg.position.y = -1.6 - 0.9 * e;
        bpgMat.opacity = show;
        bpg.visible = show > 0.15;
      }
      const dis = col(C['oh-dis']), red = col(C['oh-o2']);
      chains.forEach(function (c) {
        if (snap) c.bound = c.target;
        c.hemeMat.color.copy(dis).lerp(red, c.bound);
        c.hemeMat.emissive.copy(red).multiplyScalar(0.25 * c.bound);
        c.o2.scale.setScalar(Math.max(0.001, c.bound));
        c.o2.visible = c.bound > 0.02;
      });
    }
    function update(dt) {
      tNow += dt;
      if (tNow >= nextDraw) { redraw(); nextDraw = tNow - Math.log(1 - r()) / REDRAW; }
      const tr = mol.R ? 1 : 0;
      const sp = Math.min(1, dt * 3.5);
      const before = mol.rr;
      mol.rr += (tr - mol.rr) * sp;
      if (Math.abs(tr - mol.rr) < 1e-3) mol.rr = tr;
      let ch = Math.abs(before - mol.rr) > 1e-5;
      chains.forEach(function (c) {
        const b0 = c.bound;
        c.bound += (c.target - c.bound) * Math.min(1, dt * 5);
        if (Math.abs(c.target - c.bound) < 1e-3) c.bound = c.target;
        if (Math.abs(b0 - c.bound) > 1e-5) ch = true;
      });
      applyState(false);
      // 抬頭顯示
      const nb = chains.filter(function (c) { return c.target === 1; }).length;
      setHud('t', (mol.R ? T('R 狀態（鬆）', 'R state (relaxed)') : T('T 狀態（緊）', 'T state (tense)')) + T('・結合 ' + nb + ' 個氧', ' · ' + nb + ' O2 bound'));
      const dist = BR.dist();
      let pR = 0; for (let i = 0; i < 5; i++) pR += dist[i];
      setHud('v', T('氧分壓 ', 'Oxygen ') + fmt(BR.P()) + ' mmHg・' + T('這時 R 的機率 ', 'chance of R now ') + (pR * 100).toFixed(pR < 0.1 ? 1 : 0) + '%');
      setHud('note', T('示意：轉角與空腔大小都誇大；真正的轉角約 15°', 'Schematic: the twist and the cavity are exaggerated; the real twist is about 15°'));
      return ch;
    }
    function fmt(v) { return v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2); }

    // ---------- 相機、尺寸 ----------
    let narrow = false, lastAspect = 0, raf = 0, moving = false;
    function sizeOf(w) { return w < 560 ? 380 : 460; }
    function resetCamera() {
      const d = narrow ? 17 : 14.5;
      camera.position.set(d * 0.35, d * 0.25, d * 0.9);
      controls.target.set(0, -0.1, 0);
      camera.updateProjectionMatrix();
      controls.update();
    }
    function renderNow() {
      if (!api.active) return;
      moving = controls.update();
      renderer.render(scene, camera);
    }
    function requestRender() {
      if (raf || !api.active) return;
      raf = requestAnimationFrame(function () { raf = 0; renderNow(); if (moving) requestRender(); });
    }
    function resize3() {
      const w = wrap.clientWidth;
      if (!w) return;
      const h = sizeOf(w);
      if (canvas.style.height !== h + 'px') canvas.style.height = h + 'px';
      const nw = w < 560;
      if (nw !== narrow) { narrow = nw; lastAspect = 0; }
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (Math.abs(camera.aspect - lastAspect) > 1e-3) {
        const first = !lastAspect;
        lastAspect = camera.aspect;
        if (first) resetCamera();
      }
      renderNow();
    }
    const ro = window.ResizeObserver ? new ResizeObserver(function () { resize3(); }) : null;
    if (ro) ro.observe(wrap); else window.addEventListener('resize', resize3);
    controls.addEventListener('change', requestRender);
    canvas.addEventListener('webglcontextlost', function (ev) {
      ev.preventDefault();
      if (!api.active) return;
      if (BR.onContextLost) BR.onContextLost();
    });
    const api = {
      active: true,
      frame: function (dt) { update(dt || 1 / 60); renderNow(); },
      busy: function () { return moving; },
      onShow: function () { lastAspect = 0; resize3(); },
      resize: function () { resize3(); },
      onTheme: function () {
        C = BR.colors();
        Object.keys(hudLast).forEach(function (k) { delete hudLast[k]; });
        build();
        requestRender();
      },
      rebuild: function () { build(); requestRender(); },
      resetCamera: function () { resetCamera(); requestRender(); },
      state: function () { return { R: mol.R, k: mol.k, rr: mol.rr }; },
      dispose: function () {
        api.active = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize3);
        controls.dispose();
        disposeObject(scene);
        renderer.dispose();
        renderer.forceContextLoss();
        wrap.remove();
      }
    };
    const w0 = wrap.clientWidth;
    if (w0) {
      narrow = w0 < 560;
      canvas.style.height = sizeOf(w0) + 'px';
      renderer.setSize(w0, sizeOf(w0), false);
      camera.aspect = w0 / sizeOf(w0);
      camera.updateProjectionMatrix();
      lastAspect = camera.aspect;
    }
    build();
    redraw();
    mol.rr = mol.R ? 1 : 0;
    applyState(true);
    resetCamera();
    renderNow();
    return api;
  }
  window.OH3D = { create: create };
})();
