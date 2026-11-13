/*
 * polyrhythm-3d.js — 「多重節奏與歐幾里得節奏」的 3D 環面結（three.js）
 *
 * 由 js/polyrhythm.js 在學生按「3D 環面結」時才載入（three.js 也是那時才以 import() 載入）；切回 2D 時整個釋放。
 * 用法：window.Polyrhythm3D.create({ THREE, OrbitControls }, 容器, bridge) → { active, frame, rebuild, onTheme, resetCamera, dispose }
 *
 * 環面：大圈半徑 R、管子半徑 r（任意單位），中間的洞朝上（y 軸）。
 *   取前兩個有重音的聲部 A、B（polyrhythm-core.js analyze 的 torus），各自的最小週期 Pa、Pb（以共同細格為單位）。
 *   時間 g（細格）走到的點：沿大圈的角度 θA = 2π g / Pa、繞管子的角度 θB = 2π g / Pb，
 *     P(g) = ((R + r cos θB) cos θA, r sin θB, (R + r cos θB) sin θA)。
 *   g 走到 M = lcm(Pa, Pb) 時剛好回到起點，沿大圈繞 wA = M / Pa 圈、繞管子 wB = M / Pb 圈：(wA, wB) 環面結。
 *   聲部 A 的重音（一個週期內的細格位置）是套住管子的環（θA 固定），聲部 B 的重音是繞著洞的環（θB 固定）。
 *   線上的珠子：在細格 g 有重音的聲部（A、B 各自的顏色，兩個一起響是較大的珠子）。播放時一顆亮球沿線前進。
 * 所有數值都由 polyrhythm-core.js 算出（bridge.data()），3D 只負責畫。
 */
(function () {
  'use strict';
  const FONT = 'system-ui, -apple-system, "Segoe UI", "Noto Sans TC", "PingFang TC", sans-serif';
  const PI = Math.PI, TAU = 2 * Math.PI, DEG = PI / 180;
  const R = 1.6, r = 0.6;      // 大圈與管子的半徑
  const VKEY = ['pr-v1', 'pr-v2', 'pr-v3'];

  function create(lib, host, B) {
    const THREE = lib.THREE;
    const T = B.T, D = B.D, Core = B.Core;
    let C = B.colors();
    const col = function (k) { return new THREE.Color(C[k] || k); };
    const isDark = function () { return !!D.dark; };

    // ---------- 畫布與資訊列 ----------
    const wrap = document.createElement('div');
    wrap.className = 'p3-wrap';
    const canvas = document.createElement('canvas');
    canvas.tabIndex = 0;
    wrap.appendChild(canvas);
    const hud = document.createElement('div');
    hud.className = 'p3-hud';
    hud.setAttribute('aria-hidden', 'true');
    hud.innerHTML = '<div class="tl"><span data-k="knot"></span><span class="m" data-k="va"></span><span class="m" data-k="vb"></span><span data-k="meet"></span></div><div class="bl"><span class="m" data-k="tip"></span></div>';
    wrap.appendChild(hud);
    host.appendChild(wrap);
    const hudEl = {}, hudLast = {};
    hud.querySelectorAll('[data-k]').forEach(function (e) { hudEl[e.getAttribute('data-k')] = e; });
    function setHud(k, h, cls) {
      const key = (cls || '') + '|' + h;
      if (hudLast[k] !== key) { hudLast[k] = key; hudEl[k].innerHTML = h; hudEl[k].className = cls || ''; }
    }

    let renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true }); }
    catch (e) { wrap.remove(); throw e; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 4 / 3, 0.05, 500);

    // ---------- 視角控制 ----------
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.rotateSpeed = 0.85;
    controls.screenSpacePanning = true;

    // ---------- 光線與環境反光 ----------
    scene.add(new THREE.HemisphereLight(0xffffff, 0x3a4250, 0.85));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
    keyLight.position.set(-4, 9, 6);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.45);
    fillLight.position.set(6, -3, -5);
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
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); });
      });
    }
    function clearGroup(g) { g.children.slice().forEach(function (o) { g.remove(o); disposeObject(o); }); }
    function mat(color, opt) {
      opt = opt || {};
      return new THREE.MeshStandardMaterial({
        color: color, roughness: opt.rough == null ? 0.32 : opt.rough, metalness: opt.metal == null ? 0.1 : opt.metal,
        emissive: opt.emissive || 0x000000, emissiveIntensity: opt.ei == null ? 1 : opt.ei,
        transparent: opt.opacity != null, opacity: opt.opacity == null ? 1 : opt.opacity, depthWrite: opt.opacity == null || opt.opacity > 0.9,
        side: opt.side || THREE.FrontSide
      });
    }
    function fsF() { return Math.max(1, Math.min(1.45, B.fs ? B.fs() : 1)); }
    /** 文字小牌（畫布貼圖的 Sprite，永遠面向鏡頭） */
    function label(text, color, h) {
      const c = document.createElement('canvas'), g = c.getContext('2d');
      const px = 56, font = '600 ' + px + 'px ' + FONT;
      g.font = font;
      const w = Math.ceil(g.measureText(text).width) + 28;
      c.width = w; c.height = 84;
      g.lineJoin = 'round'; g.lineWidth = 12; g.strokeStyle = D.alpha(C['canvas-bg'], 0.9);
      g.textAlign = 'left'; g.textBaseline = 'middle'; g.font = font;
      g.strokeText(text, 14, 42); g.fillStyle = color; g.fillText(text, 14, 42);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
      s.renderOrder = 10;
      const hh = h * fsF();
      s.scale.set(hh * w / 84, hh, 1);
      return s;
    }
    /** 環面上的點：沿大圈角度 a、繞管子角度 b、離管子中心 rr */
    function torusPoint(a, b, rr, out) {
      const rho = R + rr * Math.cos(b);
      return (out || new THREE.Vector3()).set(rho * Math.cos(a), rr * Math.sin(b), rho * Math.sin(a));
    }

    // ---------- 場景物件 ----------
    const gShell = new THREE.Group(), gRings = new THREE.Group(), gKnot = new THREE.Group(), gBeads = new THREE.Group(), gLabels = new THREE.Group();
    scene.add(gShell, gRings, gKnot, gBeads, gLabels);
    // 玻璃般的環面（只是背景，讓線看起來在環面上）
    const shellGeo = new THREE.TorusGeometry(R, r * 0.965, 48, 160);
    shellGeo.rotateX(PI / 2);
    const shellMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.18, metalness: 0, transmission: 0, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, clearcoat: 0.6 });
    const shell = new THREE.Mesh(shellGeo, shellMat);
    shell.renderOrder = 1;
    gShell.add(shell);
    // 赤道與子午的淡格線（每 30°），幫助看出「繞大圈」與「繞管子」
    const gridMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.18 });
    function buildGrid() {
      gridMat.color.copy(col('muted'));
      gridMat.opacity = isDark() ? 0.22 : 0.2;
      for (let j = 0; j < 12; j++) {
        const a = j * TAU / 12, pts = [];
        for (let s = 0; s <= 48; s++) pts.push(torusPoint(a, s * TAU / 48, r * 0.97));
        gShell.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat));
      }
      for (let j = 0; j < 4; j++) {
        const b = j * TAU / 4, pts = [];
        for (let s = 0; s <= 120; s++) pts.push(torusPoint(s * TAU / 120, b, r * 0.97));
        gShell.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat));
      }
    }
    // 播放中的亮球
    const headMat = mat(0xffffff, { rough: 0.2, emissive: 0xffffff, ei: 0.7 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.085, 28, 16), headMat);
    const haloMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.28, depthWrite: false });
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 12), haloMat);
    head.add(halo);
    head.visible = false;
    scene.add(head);

    let K = null;      // 目前的環面結：{ Pa, Pb, M, w, a, b, hits, L }
    function P(g, out) { return torusPoint(TAU * g / K.Pa, TAU * g / K.Pb, r, out); }

    function voiceColor(i) { return C[VKEY[i]] || '#888'; }
    function buildKnot() {
      clearGroup(gRings); clearGroup(gKnot); clearGroup(gBeads); clearGroup(gLabels);
      const d = B.data();
      const tor = d.torus;
      if (!tor) { K = null; head.visible = false; updateHud(d); return; }
      K = { Pa: tor.Pa, Pb: tor.Pb, M: tor.M, w: tor.w, a: tor.a, b: tor.b, hits: d.hits, L: d.L };
      const cA = voiceColor(tor.a), cB = voiceColor(tor.b);
      // 重音環：聲部 A（θA 固定，套住管子）、聲部 B（θB 固定，繞著洞）
      const ringR = 0.011;
      const ringMatA = mat(cA, { rough: 0.4, opacity: 0.55 }), ringMatB = mat(cB, { rough: 0.4, opacity: 0.55 });
      const onA = [], onB = [];
      for (let c = 0; c < K.Pa; c++) if (K.hits[c % K.L].indexOf(K.a) >= 0) onA.push(c);
      for (let c = 0; c < K.Pb; c++) if (K.hits[c % K.L].indexOf(K.b) >= 0) onB.push(c);
      onA.forEach(function (c) {
        const a = TAU * c / K.Pa;
        const m = new THREE.Mesh(new THREE.TorusGeometry(r * 1.035, ringR, 8, 64), ringMatA);
        m.rotation.y = -a;
        m.position.set(R * Math.cos(a), 0, R * Math.sin(a));
        gRings.add(m);
      });
      onB.forEach(function (c) {
        const b = TAU * c / K.Pb;
        const geo = new THREE.TorusGeometry(R + r * 1.035 * Math.cos(b), ringR, 8, 160);
        geo.rotateX(PI / 2);
        const m = new THREE.Mesh(geo, ringMatB);
        m.position.y = r * 1.035 * Math.sin(b);
        gRings.add(m);
      });
      // 結：沿 g = 0…M 的封閉管線
      class Curve extends THREE.Curve {
        getPoint(t, out) { return P(t * K.M, out || new THREE.Vector3()); }
      }
      const turns = K.w[0] + K.w[1];
      const segs = Math.max(360, Math.min(4000, turns * 90));
      const knotGeo = new THREE.TubeGeometry(new Curve(), segs, 0.028, 10, true);
      // 線用中性的石墨／銀色，不和三個聲部的顏色混淆
      const knotMat = mat(C['text'], { rough: 0.28, metal: 0.4 });
      knotMat.color.lerp(col('muted'), isDark() ? 0.2 : 0.3);
      gKnot.add(new THREE.Mesh(knotGeo, knotMat));
      // 珠子：在細格 g 有重音的聲部
      const list = { a: [], b: [], ab: [] };
      for (let g = 0; g < K.M; g++) {
        const who = K.hits[g % K.L], ia = who.indexOf(K.a) >= 0, ib = who.indexOf(K.b) >= 0;
        if (ia && ib) list.ab.push(g); else if (ia) list.a.push(g); else if (ib) list.b.push(g);
      }
      const nb = list.a.length + list.b.length + list.ab.length;
      const rad = Math.max(0.032, Math.min(0.076, 0.076 * Math.sqrt(40 / Math.max(40, nb))));
      const tmp = new THREE.Object3D();
      function beads(arr, color, rr, glow) {
        if (!arr.length) return;
        const m = new THREE.InstancedMesh(new THREE.SphereGeometry(rr, 20, 12), mat(color, { rough: 0.22, metal: 0.05, emissive: glow ? color : 0x000000, ei: glow ? 0.35 : 1 }), arr.length);
        arr.forEach(function (g, j) { P(g, tmp.position); tmp.updateMatrix(); m.setMatrixAt(j, tmp.matrix); });
        m.instanceMatrix.needsUpdate = true;
        gBeads.add(m);
      }
      beads(list.a, cA, rad, false);
      beads(list.b, cB, rad, false);
      beads(list.ab, C['pr-sync'], rad * 1.65, true);
      // 起點標記與文字
      const p0 = P(0);
      const start = label(T('起點', 'start'), C['text'], 0.2);
      start.position.copy(p0).add(new THREE.Vector3(0, 0.3, 0));
      gLabels.add(start);
      const la = label(T('聲部 ', 'Voice ') + (K.a + 1) + T('：沿大圈', ': around the ring'), cA, 0.17);
      la.position.set(-(R + r + 0.05), -(r + 0.25), 0.45);
      gLabels.add(la);
      const lb = label(T('聲部 ', 'Voice ') + (K.b + 1) + T('：繞管子', ': around the tube'), cB, 0.17);
      lb.position.set(R + r + 0.05, r + 0.4, -0.35);
      gLabels.add(lb);
      headMat.color.copy(col('pr-cur')); headMat.emissive.copy(col('pr-cur'));
      haloMat.color.copy(col('pr-cur'));
      updateHud(d);
    }
    function updateHud(d) {
      const tor = d.torus;
      setHud('tip', T('拖曳旋轉，滾輪或雙指縮放，方向鍵也可以轉動', 'Drag to rotate, scroll or pinch to zoom, or use the arrow keys'));
      if (!tor) {
        setHud('knot', T('要兩個有重音的聲部，才畫得出環面結', 'Two voices with accents are needed for a torus knot'));
        setHud('va', ''); setHud('vb', ''); setHud('meet', '');
        canvas.setAttribute('aria-label', T('3D 環面：目前少於兩個有重音的聲部，所以沒有畫線。', '3D torus: fewer than two voices have accents, so no line is drawn.'));
        return;
      }
      const va = d.voices[tor.a], vb = d.voices[tor.b];
      const name = B.knotName(tor.w);
      setHud('knot', '(' + tor.w[0] + ', ' + tor.w[1] + ') ' + name);
      setHud('va', T('聲部 ' + (tor.a + 1) + ' ' + B.euName(va) + '：每 ' + tor.Pa + ' 細格重複，繞大圈 ' + tor.w[0] + ' 圈',
        'Voice ' + (tor.a + 1) + ' ' + B.euName(va) + ': repeats every ' + tor.Pa + ' boxes, ' + tor.w[0] + ' times around the ring'));
      setHud('vb', T('聲部 ' + (tor.b + 1) + ' ' + B.euName(vb) + '：每 ' + tor.Pb + ' 細格重複，繞管子 ' + tor.w[1] + ' 圈',
        'Voice ' + (tor.b + 1) + ' ' + B.euName(vb) + ': repeats every ' + tor.Pb + ' boxes, ' + tor.w[1] + ' times around the tube'));
      let both = 0;
      for (let g = 0; g < tor.M; g++) { const who = d.hits[g % d.L]; if (who.indexOf(tor.a) >= 0 && who.indexOf(tor.b) >= 0) both++; }
      setHud('meet', T('lcm = ' + tor.M + ' 細格才接回起點；兩個一起響 ' + both + ' 次', 'closes after lcm = ' + tor.M + ' boxes; both sound ' + both + (both === 1 ? ' time' : ' times')));
      canvas.setAttribute('aria-label', T('3D 環面結：沿大圈的角度跟著聲部 ' + (tor.a + 1) + '、繞管子的角度跟著聲部 ' + (tor.b + 1) + '，線繞大圈 ' + tor.w[0] + ' 圈、繞管子 ' + tor.w[1] + ' 圈後接回起點，是 (' + tor.w[0] + ', ' + tor.w[1] + ') ' + name + '。珠子是重音，大珠子是兩個聲部一起響。拖曳旋轉，方向鍵也可以轉動。',
        '3D torus knot: the angle around the ring follows voice ' + (tor.a + 1) + ' and the angle around the tube follows voice ' + (tor.b + 1) + '; the line closes after ' + tor.w[0] + ' turns around the ring and ' + tor.w[1] + ' around the tube, a (' + tor.w[0] + ', ' + tor.w[1] + ') ' + name + '. Beads are accents; large beads are where both voices sound. Drag to rotate, or use the arrow keys.'));
    }
    function placeHead() {
      const g = B.position();
      if (!K || g == null) { head.visible = false; return; }
      const gm = Core.mod(g, K.M);
      P(gm, head.position);
      // 剛好落在重音上時亮一下
      const near = Math.abs(gm - Math.round(gm)) < 0.18 ? K.hits[Core.mod(Math.round(gm), K.M) % K.L] : [];
      const on = near.indexOf(K.a) >= 0 || near.indexOf(K.b) >= 0;
      const s = on ? 1.45 : 1;
      head.scale.set(s, s, s);
      haloMat.opacity = on ? 0.42 : 0.22;
      head.visible = true;
    }

    // ---------- 鏡頭 ----------
    let lastAspect = 0;
    function fitDistance() {
      const rad = R + r + 0.35;
      const vf = camera.fov * DEG, hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
      return Math.max(rad / Math.tan(vf / 2), rad / Math.tan(hf / 2)) * (camera.aspect < 1 ? 0.98 : 0.92);
    }
    function resetCamera() {
      const d = fitDistance();
      controls.target.set(0, 0, 0);
      camera.position.copy(new THREE.Vector3(0.25, 0.95, 0.85).normalize().multiplyScalar(d));
      controls.minDistance = 1.5;
      controls.maxDistance = d * 3 + 6;
      camera.near = 0.05; camera.far = d * 20 + 50;
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
      const moved = controls.update();
      placeHead();
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
    // 鍵盤：方向鍵轉動視角
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
    });

    function buildAll() {
      gShell.remove(shell);
      clearGroup(gShell);
      gShell.add(shell);
      shellMat.color.copy(isDark() ? new THREE.Color(0x9fb3cc) : new THREE.Color(0xc9d4e2));
      shellMat.opacity = isDark() ? 0.13 : 0.2;
      buildGrid();
      buildKnot();
    }

    const api = {
      active: true,
      /** 播放中每一幀：移動亮球 */
      frame: function () { requestRender(); },
      /** 節奏改變：重畫環、結與珠子 */
      rebuild: function () { buildKnot(); requestRender(); },
      onTheme: function () {
        C = B.colors();
        buildEnv();
        Object.keys(hudLast).forEach(function (k) { delete hudLast[k]; });
        buildAll();
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
        gShell.remove(shell);
        disposeObject(scene);
        shellGeo.dispose(); shellMat.dispose(); gridMat.dispose();
        if (envRT) envRT.dispose();
        pmrem.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        wrap.remove();
      }
    };

    buildEnv();
    buildAll();
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

  window.Polyrhythm3D = { create: create };
})();
