/*
 * scales-modes-3d.js — 「音階與調式」的 3D 調式之塔（three.js）
 *
 * 由 js/scales-modes.js 在使用者按「3D 調式之塔」時才載入（three.js 也是那時才以 import() 載入）；切回 2D 時整個釋放。
 * 用法：window.ScalesModes3D.create({ THREE, OrbitControls }, 容器, bridge) → { active, frame, rebuild, onTheme, resetCamera, dispose }
 *
 * 塔：12 格鐘面是圓柱的橫截面（角度和 2D 鐘面一樣：C 在後方，從上往下看順時針）。
 *   同一個主音的七個調式由亮到暗一層一層往上疊（利底亞在最下面、洛克里亞在最上面），每一層是一個七邊形。
 *   相鄰兩層之間，七根柱子把同一級的音連起來：六根是直的（同一個音），只有一根往旁邊斜一格——那就是往上一層時被降半音的音。
 *   目前選的調式那一層亮起；目前的音階不是教會調式時，在塔頂另外畫一層「目前」。
 * 所有位置都由 scales-modes-core.js 算出（bridge.SM.tower()），3D 只負責畫。
 */
(function () {
  'use strict';
  const FONT = 'system-ui, -apple-system, "Segoe UI", "Noto Sans TC", "PingFang TC", sans-serif';
  const PI = Math.PI, TAU = 2 * PI, DEG = PI / 180;
  const RAD = 1;             // 塔的半徑
  const HL = 0.42;           // 每一層的高度
  // 預設視角的方向（右前上方），以及畫面右側的水平方向（層名放這一側）
  const VIEW = { x: 0.55, y: 0.72, z: 0.95 };
  const SIDE = (function () { const l = Math.hypot(VIEW.x, VIEW.z); return { x: VIEW.z / l, z: -VIEW.x / l }; })();

  function create(lib, host, B) {
    const THREE = lib.THREE;
    const T = B.T, D = B.D, SM = B.SM;
    let C = B.colors();
    const col = function (k) { return new THREE.Color(C[k] || k); };
    const isDark = function () { return !!D.dark; };

    // ---------- 畫布與資訊列 ----------
    const wrap = document.createElement('div');
    wrap.className = 't3-wrap';
    const canvas = document.createElement('canvas');
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', T('調式之塔的 3D 立體檢視：同一個主音的七個調式由亮（下）到暗（上）疊成七層，每層是一個七邊形；相鄰兩層之間只有一根柱子是斜的，那就是被降半音的音。拖曳旋轉，滾輪或雙指縮放，方向鍵也可以轉動。',
      '3D tower of modes: the seven modes on one tonic are stacked from bright (bottom) to dark (top), one seven-sided storey each; between two storeys only one post leans, and that is the note lowered by a half step. Drag to rotate, scroll or pinch to zoom, or use the arrow keys.'));
    wrap.appendChild(canvas);
    const hud = document.createElement('div');
    hud.className = 't3-hud';
    hud.setAttribute('aria-hidden', 'true');
    hud.innerHTML = '<div class="tl"><span data-k="nm"></span><span class="m" data-k="cur"></span><span class="lo" data-k="lo"></span></div><div class="bl"><span class="m" data-k="tip"></span></div>';
    wrap.appendChild(hud);
    host.appendChild(wrap);
    const hudEl = {}, hudLast = {};
    hud.querySelectorAll('[data-k]').forEach(function (e) { hudEl[e.getAttribute('data-k')] = e; });
    function setHud(k, h) { if (hudLast[k] !== h) { hudLast[k] = h; hudEl[k].textContent = h; } }

    let renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true }); }
    catch (e) { wrap.remove(); throw e; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    const VIEW_DIR = new THREE.Vector3(VIEW.x, VIEW.y, VIEW.z).normalize();
    const camera = new THREE.PerspectiveCamera(34, 4 / 3, 0.05, 200);

    // ---------- 視角控制 ----------
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.rotateSpeed = 0.85;
    controls.screenSpacePanning = true;

    // ---------- 光線與環境反光 ----------
    scene.add(new THREE.HemisphereLight(0xffffff, 0x3a4250, 0.9));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
    keyLight.position.set(3, 8, 5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -3; keyLight.shadow.camera.right = 3; keyLight.shadow.camera.top = 3; keyLight.shadow.camera.bottom = -3;
    keyLight.shadow.camera.near = 1; keyLight.shadow.camera.far = 20;
    keyLight.shadow.radius = 4;
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.45);
    fillLight.position.set(-5, 3, -4);
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
    /** 音高 pc（可以是小數）在高度 y、半徑 r 的位置 */
    function P(pc, y, r) {
      const a = pc / 12 * TAU, rr = r == null ? RAD : r;
      return new THREE.Vector3(rr * Math.sin(a), y, -rr * Math.cos(a));
    }
    function mat(color, opt) {
      opt = opt || {};
      return new THREE.MeshStandardMaterial({
        color: color, roughness: opt.rough == null ? 0.35 : opt.rough, metalness: opt.metal == null ? 0.1 : opt.metal,
        emissive: opt.emissive || 0x000000, emissiveIntensity: opt.ei == null ? 1 : opt.ei, side: opt.side || THREE.FrontSide,
        transparent: opt.opacity != null, opacity: opt.opacity == null ? 1 : opt.opacity, depthWrite: opt.opacity == null || opt.opacity > 0.9
      });
    }
    const sphGeo = function (r) { return new THREE.SphereGeometry(r, 20, 14); };
    function sphere(p, r, material) { const m = new THREE.Mesh(sphGeo(r), material); m.position.copy(p); m.castShadow = true; return m; }
    /** 兩點之間的細棒 */
    function rod(a, b, r, material) {
      const d = new THREE.Vector3().subVectors(b, a), len = d.length();
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, Math.max(1e-4, len), 10, 1, true), material);
      m.position.copy(a).addScaledVector(d, 0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
      m.castShadow = true;
      return m;
    }
    function fsF() { return Math.max(1, Math.min(1.45, B.fs ? B.fs() : 1)); }
    // 手機（畫布窄）時整座塔縮得很小，文字標籤另外放大才讀得到
    function narrow() { const w = canvas.clientWidth; return !!w && w < 560; }
    /** 文字小牌（畫布貼圖的 Sprite，永遠面向鏡頭；用 2D 畫布的 fillText，簡體轉換也有效） */
    function label(text, color, h, weight) {
      const c = document.createElement('canvas'), g = c.getContext('2d');
      const px = 56, font = (weight || 600) + ' ' + px + 'px ' + FONT;
      g.font = font;
      const w = Math.ceil(g.measureText(text).width) + 28;
      c.width = w; c.height = 80;
      g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineJoin = 'round'; g.lineWidth = 12; g.strokeStyle = D.alpha(C['canvas-bg'], 0.9); g.strokeText(text, w / 2, 42);
      g.fillStyle = color; g.fillText(text, w / 2, 42);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      const hh = h * fsF() * (narrow() ? 1.55 : 1);
      s.scale.set(hh * w / 80, hh, 1);
      return s;
    }
    /** 一層的七邊形：半透明的面（以中心做扇形三角）＋管狀邊 */
    function polygon(pcs, y, color, opacity, edgeR) {
      const g = new THREE.Group();
      const pts = pcs.map(function (pc) { return P(pc, y); });
      const pos = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        pos.push(0, y, 0, a.x, a.y, a.z, b.x, b.y, b.z);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.computeVertexNormals();
      const face = new THREE.Mesh(geo, mat(color, { opacity: opacity, side: THREE.DoubleSide, rough: 0.6 }));
      face.receiveShadow = true;
      g.add(face);
      const em = mat(color, { rough: 0.4, metal: 0.15 });
      for (let i = 0; i < pts.length; i++) g.add(rod(pts[i], pts[(i + 1) % pts.length], edgeR, em));
      return g;
    }

    // ---------- 物件 ----------
    const gBase = new THREE.Group(), gTower = new THREE.Group(), gLabels = new THREE.Group();
    scene.add(gBase, gTower, gLabels);
    let fitC = new THREE.Vector3(0, 1.5, 0), fitH = 4.2, fitW = 3.4;

    function build() {
      [gBase, gTower, gLabels].forEach(clearGroup);
      const d = B.data(), a = d.a, tonic = a.tonic;
      const tw = SM.tower();
      const curK = SM.BRIGHT_ORDER.indexOf(a.mode);
      const extra = curK < 0;
      const topY = (extra ? 7.6 : 6) * HL;
      fitC.set(SIDE.x * 0.5, topY / 2 - 0.05, SIDE.z * 0.5); fitH = topY + 1.5; fitW = 2 * RAD + (narrow() ? 3.4 : 2.7);

      // 底座：12 格鐘面（圓盤＋刻度＋音名）
      const base = new THREE.Mesh(new THREE.CylinderGeometry(RAD + 0.32, RAD + 0.4, 0.12, 64), mat(D.mix(C.surface, C['canvas-bg'], 0.3), { rough: 0.7, metal: 0.05 }));
      base.position.y = -0.26;
      base.receiveShadow = true;
      gBase.add(base);
      const tickMat = mat(C.muted, { rough: 0.6 });
      for (let pc = 0; pc < 12; pc++) {
        const inS = a.pcs.indexOf(pc) >= 0, isT = pc === tonic;
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.2), isT ? mat(C['sm-tonic']) : inS ? mat(C['sm-poly']) : tickMat);
        m.position.copy(P(pc, -0.19, RAD + 0.2));
        m.rotation.y = -pc / 12 * TAU;
        gBase.add(m);
        const s = label(B.pcName(pc), isT ? C['sm-tonic'] : inS ? C.text : C.muted, 0.2, isT || inS ? 700 : 500);
        s.position.copy(P(pc, -0.06, RAD + 0.52));
        gLabels.add(s);
      }
      // 主音那一根直柱（淡淡的）
      const tcol = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, topY + 0.3, 8, 1, true), mat(C['sm-tonic'], { opacity: 0.35 }));
      tcol.position.copy(P(tonic, topY / 2 - 0.05));
      gTower.add(tcol);

      // 七層
      const pcsOf = function (semis) { return semis.map(function (s) { return SM.mod(tonic + s, 12); }); };
      tw.forEach(function (layer, k) {
        const y = k * HL, isCur = k === curK;
        const pcs = pcsOf(layer.semis);
        const colr = isCur ? C['sm-poly'] : D.mix(C['sm-poly'], C.muted, 0.55);
        gTower.add(polygon(pcs, y, colr, isCur ? (isDark() ? 0.4 : 0.32) : (isDark() ? 0.12 : 0.09), isCur ? 0.016 : 0.008));
        const vmat = mat(colr, { emissive: isCur ? col('sm-poly') : 0x000000, ei: 0.25 });
        const tmat = mat(C['sm-tonic'], { emissive: col('sm-tonic'), ei: isCur ? 0.35 : 0.1 });
        const lmat = mat(C['sm-low'], { emissive: col('sm-low'), ei: 0.35 });
        pcs.forEach(function (pc, i) {
          const lowered = i === layer.moved;
          const r = i === 0 ? 0.06 : isCur ? 0.05 : 0.035;
          const on = isCur && pc === d.playing;
          gTower.add(sphere(P(pc, y), on ? 0.085 : r, lowered ? lmat : i === 0 ? tmat : on ? mat(C.accent, { emissive: col('accent'), ei: 0.8 }) : vmat));
        });
        // 和下一層之間的柱子
        if (k > 0) {
          const below = pcsOf(tw[k - 1].semis);
          const post = mat(C.muted, { opacity: 0.55, rough: 0.5 }), lowPost = mat(C['sm-low'], { emissive: col('sm-low'), ei: 0.5 });
          pcs.forEach(function (pc, i) {
            const lowered = i === layer.moved;
            gTower.add(rod(P(below[i], (k - 1) * HL), P(pc, y), lowered ? 0.016 : 0.006, lowered ? lowPost : post));
          });
        }
        // 層名
        const s = label(B.mshort(layer.id) + '  ' + B.sg(layer.bright, 0), isCur ? C.text : C.muted, isCur ? 0.2 : 0.16, isCur ? 700 : 500);
        s.center.set(0, 0.5);
        s.position.set(SIDE.x * (RAD + 0.32), y, SIDE.z * (RAD + 0.32));
        gLabels.add(s);
      });
      // 目前的音階不是教會調式：塔頂另外一層
      if (extra) {
        const y = 7.6 * HL, pcs = pcsOf(a.semis);
        if (pcs.length >= 3) gTower.add(polygon(pcs, y, C['sm-a'], isDark() ? 0.35 : 0.28, 0.014));
        const vm = mat(C['sm-a'], { emissive: col('sm-a'), ei: 0.3 });
        pcs.forEach(function (pc, i) { gTower.add(sphere(P(pc, y), i === 0 ? 0.06 : pc === d.playing ? 0.085 : 0.05, i === 0 ? mat(C['sm-tonic']) : pc === d.playing ? mat(C.accent, { emissive: col('accent'), ei: 0.8 }) : vm)); });
        const s = label(T('目前：', 'Current: ') + B.scaleName(a), C['sm-a'], 0.2, 700);
        s.position.set(0, y + 0.42, 0);
        gLabels.add(s);
      }
      // 「亮」「暗」
      const bl = label(T('亮 ↓', 'bright ↓'), C.muted, 0.17, 600); bl.center.set(1, 0.5); bl.position.set(-SIDE.x * (RAD + 0.5), 0.9 * HL, -SIDE.z * (RAD + 0.5)); gLabels.add(bl);
      const dl = label(T('暗 ↑', 'dark ↑'), C.muted, 0.17, 600); dl.center.set(1, 0.5); dl.position.set(-SIDE.x * (RAD + 0.5), 5.1 * HL, -SIDE.z * (RAD + 0.5)); gLabels.add(dl);

      // 資訊列
      setHud('nm', T('主音 ' + a.tonicName + ' 的七個調式（下亮上暗）', 'The seven modes on ' + a.tonicName + ' (bright below, dark above)'));
      setHud('cur', curK >= 0 ? T('目前：第 ' + (curK + 1) + ' 層 ' + B.mshort(a.mode), 'Now: storey ' + (curK + 1) + ', ' + B.mshort(a.mode)) : T('目前的音階不在塔上（畫在塔頂）', 'The current scale is not on the tower (drawn on top)'));
      setHud('lo', T('紅色斜柱：往上一層唯一降半音的音', 'Red slanted post: the only note lowered on the way up'));
      setHud('tip', T('從正上方往下看就是 2D 鐘面；相鄰兩層之間，七根柱子只有一根是斜的。', 'Seen from straight above it is the 2D clock; between two neighbouring storeys only one of the seven posts leans.'));
    }

    // ---------- 視角 ----------
    let lastAspect = 0, lastNarrow = null;
    function fitDistance() {
      const vf = camera.fov * DEG;
      const hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
      const dv = (fitH / 2) / Math.tan(vf / 2), dh = (fitW / 2) / Math.tan(hf / 2);
      return Math.max(dv, dh) * 1.1 + RAD;
    }
    function resetCamera() {
      const d = fitDistance();
      controls.target.copy(fitC);
      camera.position.copy(fitC).addScaledVector(VIEW_DIR, d);
      controls.minDistance = 1.5;
      controls.maxDistance = d * 4;
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
      const nw = narrow();
      if (nw !== lastNarrow) { lastNarrow = nw; build(); lastAspect = 0; }
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
    // 鍵盤：方向鍵繞著塔轉
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

    const api = {
      active: true,
      frame: function () { requestRender(); },
      rebuild: function () { build(); requestRender(); },
      onTheme: function () {
        C = B.colors();
        buildEnv();
        Object.keys(hudLast).forEach(function (k) { delete hudLast[k]; });
        build();
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
        disposeObject(scene);
        if (envRT) envRT.dispose();
        pmrem.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        wrap.remove();
      }
    };

    buildEnv();
    build();
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

  window.ScalesModes3D = { create: create };
})();
