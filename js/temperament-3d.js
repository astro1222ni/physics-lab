/*
 * temperament-3d.js — 「五度相生、純律與十二平均律」的 3D 五度螺旋（three.js）
 *
 * 由 js/temperament.js 在使用者按「3D 螺旋」時才載入（three.js 也是那時才以 import() 載入）；切回 2D 時整個釋放。
 * 用法：window.Temperament3D.create({ THREE, OrbitControls }, 容器, bridge) → { active, frame, rebuild, onTheme, resetCamera, dispose }
 *
 * 螺旋：角度 = 相對 C 的音分 ÷ 1200 × 360°（和 2D 鐘面一樣，C 在後方、從上往下看順時針），高度 = 往上幾個八度。
 *   每一個音都在這條螺旋上：比 C4 高 c 音分的音，在角度 c/1200 圈、高度 c/1200 個八度的地方。
 *   五度疊疊樂的第 k 個點就是 k × 五度 音分；12 個純五度爬了 7 圈還多 23.46 音分，停在 C 那條直線旁邊——那段發亮的螺旋就是畢氏音差；
 *   十二平均律的 12 個五度剛好 8400 音分，回到 C 那條線上（閉合）。
 *   最底下一圈（C4 到 C5）放三種音律（調和律時是四種）的 12 個音，顏色不同、稍微錯開半徑，看它們在同一圈上差多少。
 * 所有位置都由 temperament-core.js 算出（bridge.TC），3D 只負責畫。
 */
(function () {
  'use strict';
  const FONT = 'system-ui, -apple-system, "Segoe UI", "Noto Sans TC", "PingFang TC", sans-serif';
  const PI = Math.PI, TAU = 2 * PI, DEG = PI / 180;
  const RAD = 1;                // 螺旋半徑

  function create(lib, host, B) {
    const THREE = lib.THREE;
    const T = B.T, D = B.D, TC = B.TC;
    let C = B.colors();
    const col = function (k) { return new THREE.Color(C[k] || k); };
    const isDark = function () { return !!D.dark; };

    // ---------- 畫布與資訊列 ----------
    const wrap = document.createElement('div');
    wrap.className = 't3-wrap';
    const canvas = document.createElement('canvas');
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', T('五度螺旋的 3D 立體檢視：角度是音在八度裡的位置，高度是往上幾個八度；疊起來的五度沿著螺旋往上爬，發亮的一段是回不到 C 的缺口。拖曳旋轉，滾輪或雙指縮放，方向鍵也可以轉動。',
      '3D view of the helix of fifths: the angle is where a note sits in the octave and the height is how many octaves up; the stacked fifths climb the helix, and the glowing piece is the gap that keeps them from landing on C. Drag to rotate, scroll or pinch to zoom, or use the arrow keys.'));
    wrap.appendChild(canvas);
    const hud = document.createElement('div');
    hud.className = 't3-hud';
    hud.setAttribute('aria-hidden', 'true');
    hud.innerHTML = '<div class="tl"><span data-k="n"></span><span class="m" data-k="tot"></span><span class="g" data-k="gap"></span></div><div class="bl"><span class="m" data-k="tip"></span></div>';
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
    const camera = new THREE.PerspectiveCamera(34, 4 / 3, 0.05, 500);
    let cw = 300, ch = 225;

    // ---------- 視角控制 ----------
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.rotateSpeed = 0.85;
    controls.screenSpacePanning = true;
    let startAng = null;
    controls.addEventListener('start', function () { startAng = [controls.getAzimuthalAngle(), controls.getPolarAngle()]; });
    controls.addEventListener('end', function () {
      if (!startAng) return;
      const turned = Math.abs(controls.getAzimuthalAngle() - startAng[0]) + Math.abs(controls.getPolarAngle() - startAng[1]);
      startAng = null;
      if (turned > 0.1) B.onRotate();
    });

    // ---------- 光線與環境反光 ----------
    scene.add(new THREE.HemisphereLight(0xffffff, 0x3a4250, 0.9));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.7);
    keyLight.position.set(4, 10, 8);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.45);
    fillLight.position.set(-6, 3, -4);
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
    let hOct = 0.75;           // 一個八度的高度（依圈數調整）
    /** 比 C4 高 c 音分的點（半徑 r） */
    function P(c, r) {
      const a = c / 1200 * TAU;
      return new THREE.Vector3((r == null ? RAD : r) * Math.sin(a), c / 1200 * hOct, -(r == null ? RAD : r) * Math.cos(a));
    }
    class HelixCurve extends THREE.Curve {
      constructor(c0, c1, r) { super(); this.c0 = c0; this.c1 = c1; this.r = r; }
      getPoint(t, target) { const p = P(this.c0 + (this.c1 - this.c0) * t, this.r); return (target || new THREE.Vector3()).copy(p); }
    }
    function mat(color, opt) {
      opt = opt || {};
      return new THREE.MeshStandardMaterial({
        color: color, roughness: opt.rough == null ? 0.35 : opt.rough, metalness: opt.metal == null ? 0.1 : opt.metal,
        emissive: opt.emissive || 0x000000, emissiveIntensity: opt.ei == null ? 1 : opt.ei,
        transparent: opt.opacity != null, opacity: opt.opacity == null ? 1 : opt.opacity, depthWrite: opt.opacity == null || opt.opacity > 0.9
      });
    }
    const sphGeo = function (r) { return new THREE.SphereGeometry(r, 20, 14); };
    function sphere(p, r, color, opt) { const m = new THREE.Mesh(sphGeo(r), mat(color, opt)); m.position.copy(p); return m; }
    /** 兩點之間的細棒 */
    function rod(a, b, r, material) {
      const d = new THREE.Vector3().subVectors(b, a), len = d.length();
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, Math.max(1e-4, len), 8, 1, true), material);
      m.position.copy(a).addScaledVector(d, 0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
      return m;
    }
    function fsF() { return Math.max(1, Math.min(1.45, B.fs ? B.fs() : 1)); }
    /** 文字小牌（畫布貼圖的 Sprite，永遠面向鏡頭） */
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
      const hh = h * fsF();
      s.scale.set(hh * w / 80, hh, 1);
      return s;
    }

    // ---------- 物件 ----------
    const gHelix = new THREE.Group(), gStack = new THREE.Group(), gTune = new THREE.Group(), gLabels = new THREE.Group();
    scene.add(gHelix, gStack, gTune, gLabels);
    let turns = 7, fitC = new THREE.Vector3(0, 2.6, 0), fitH = 6, fitW = 3, fitR = 4, lastTurns = 0;
    const KC = function (k) { return C['tm-' + (k === 'pythagorean' ? 'pyth' : k === 'regular' ? 'reg' : k)]; };

    function build() {
      [gHelix, gStack, gTune, gLabels].forEach(clearGroup);
      const d = B.data(), n = d.n, f = d.fifth;
      const top = n * f / 1200;
      turns = Math.max(7, Math.ceil(top + 0.06));
      hOct = Math.max(0.09, Math.min(0.44, 3.1 / turns));
      const H = turns * hOct;
      fitC.set(0, H / 2 - 0.1, 0); fitH = H + 1.3; fitW = 2 * RAD + 1.3; fitR = Math.max(fitH, fitW);

      // 螺旋本體（每一圈 = 一個八度）
      const helixMat = mat(C.muted, { rough: 0.45, metal: 0.15, opacity: isDark() ? 0.55 : 0.5 });
      gHelix.add(new THREE.Mesh(new THREE.TubeGeometry(new HelixCurve(0, turns * 1200, RAD), turns * 72, 0.016, 6, false), helixMat));
      // 每一圈的 12 個平均律刻度（小點）
      const tickGeo = sphGeo(0.018), tickMat = mat(C.text, { opacity: 0.45 });
      for (let c = 0; c <= turns * 1200; c += 100) {
        if (c % 1200 === 0) continue;
        const m = new THREE.Mesh(tickGeo, tickMat); m.position.copy(P(c)); gHelix.add(m);
      }
      // C 的那條直線與每個八度的 C（青綠色小環）
      const cLine = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, H, 6, 1, true), mat(C['tm-equal'], { opacity: 0.35, rough: 0.6 }));
      cLine.position.set(0, H / 2, -RAD);
      gHelix.add(cLine);
      const ringGeo = new THREE.TorusGeometry(0.06, 0.012, 8, 24), ringMat = mat(C['tm-equal'], { emissive: col('tm-equal'), ei: 0.25 });
      for (let j = 0; j <= turns; j++) {
        const r = new THREE.Mesh(ringGeo, ringMat);
        r.position.copy(P(j * 1200)); r.rotation.x = PI / 2;
        gHelix.add(r);
        if (j > 0 && j % Math.max(1, Math.ceil(0.3 * fsF() / hOct)) === 0) {
          const s = label(T(j + ' 個八度', j === 1 ? '1 octave' : j + ' octaves'), C.muted, 0.17, 600);
          s.position.copy(P(j * 1200, RAD + 0.42));
          gLabels.add(s);
        }
      }
      // 底下一圈的音名
      for (let pc = 0; pc < 12; pc++) {
        const s = label(B.pcName(pc), pc === d.tonic ? C['tm-equal'] : C.text, 0.21, pc === d.tonic ? 700 : 600);
        s.position.copy(P(pc * 100, RAD + 0.36)).add(new THREE.Vector3(0, -0.12, 0));
        gLabels.add(s);
      }

      // 參考八度：三種（或四種）音律的 12 個音
      const kinds = ['equal', 'pythagorean', 'just'].concat(d.kind === 'regular' ? ['regular'] : []);
      const off = { equal: 0, pythagorean: 0.1, just: -0.1, regular: 0.2 };
      kinds.forEach(function (k) {
        const devs = TC.deviations(k, d.tonic, d.w), em = k === d.kind;
        const g = sphGeo(em ? 0.05 : 0.035), m = mat(KC(k), { emissive: em ? col(KC(k)) : 0x000000, ei: 0.25 });
        for (let pc = 0; pc < 12; pc++) {
          const s = new THREE.Mesh(g, m);
          s.position.copy(P(pc * 100 + devs[pc], RAD + off[k]));
          gTune.add(s);
        }
      });
      // 選的音（底下一圈上的光環）
      const selMat = mat(C.accent, { emissive: col('accent'), ei: 0.5 });
      d.notes.forEach(function (m) {
        const pc = ((m % 12) + 12) % 12, c = pc * 100 + TC.devET(d.kind, d.tonic, 60 + pc, d.w);
        const r = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.014, 8, 28), selMat);
        r.position.copy(P(c, RAD + off[d.kind])); r.rotation.x = PI / 2;
        gTune.add(r);
      });

      // 五度疊疊樂：點、點和點之間的棒（每一步是一個五度）
      if (n > 0) {
        const rodMat = mat(C['tm-stack'], { opacity: 0.75, rough: 0.5 });
        const ptGeo = sphGeo(0.05), ptMat = mat(C['tm-stack'], { metal: 0.2 });
        for (let k = 0; k <= n; k++) {
          const p = P(k * f);
          if (k > 0) gStack.add(rod(P((k - 1) * f), p, n > 24 ? 0.008 : 0.014, rodMat));
          if (k === 0) gStack.add(sphere(p, 0.065, C['tm-equal']));
          else if (k === n) gStack.add(sphere(p, 0.085, C['tm-stack'], { emissive: col('tm-stack'), ei: 0.45 }));
          else { const s = new THREE.Mesh(ptGeo, ptMat); s.position.copy(p); gStack.add(s); }
        }
        // 缺口：第 12 個與最新一個（若落在 C 附近）和最近的 C 之間那段螺旋
        const gaps = [];
        if (n >= 12) gaps.push(12);
        if (n !== 12) { const q = TC.stackPoint(n, f); if (Math.abs(q.offC) < 60) gaps.push(n); }
        gaps.forEach(function (k) {
          const c = k * f, cC = Math.round(c / 1200) * 1200;
          if (Math.abs(c - cC) < 0.005) {
            const r = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.02, 10, 36), mat(C['tm-equal'], { emissive: col('tm-equal'), ei: 0.8 }));
            r.position.copy(P(cC)); r.rotation.x = PI / 2;
            gStack.add(r);
            const s = label(T('閉合', 'closed'), C['tm-equal'], 0.22, 700);
            s.position.copy(P(cC, RAD + 0.5)).add(new THREE.Vector3(0, 0.2, 0));
            gLabels.add(s);
            return;
          }
          const gm = mat(C['tm-gap'], { emissive: col('tm-gap'), ei: 1.1, rough: 0.3 });
          gStack.add(new THREE.Mesh(new THREE.TubeGeometry(new HelixCurve(Math.min(c, cC), Math.max(c, cC), RAD), 24, 0.05, 10, false), gm));
          const glow = new THREE.Mesh(new THREE.TubeGeometry(new HelixCurve(Math.min(c, cC), Math.max(c, cC), RAD), 24, 0.11, 10, false),
            new THREE.MeshBasicMaterial({ color: col('tm-gap'), transparent: true, opacity: 0.28, depthWrite: false }));
          gStack.add(glow);
          const s = label(B.sg(c - cC, 2) + T(' 音分', ' ¢'), C['tm-gap'], 0.22, 700);
          s.position.copy(P((c + cC) / 2, RAD + 0.55)).add(new THREE.Vector3(0, 0.2, 0));
          gLabels.add(s);
        });
      }

      // 資訊列
      const pt = TC.stackPoint(n, f);
      setHud('n', T('疊了 ' + n + ' 個五度（' + B.kname(d.kind) + '）', n + (n === 1 ? ' fifth' : ' fifths') + ' stacked (' + B.kname(d.kind) + ')'));
      setHud('tot', n ? T('一共 ' + B.fx(pt.total, 2) + ' 音分 ≈ ' + pt.oct + ' 個八度 + ' + B.fx(pt.r, 2), 'Total ' + B.fx(pt.total, 2) + ' cents ≈ ' + pt.oct + ' octaves + ' + B.fx(pt.r, 2)) : '');
      const gk = n !== 12 && n > 0 && Math.abs(pt.offC) < 60 ? n : n >= 12 ? 12 : 0;
      setHud('gap', gk ? T('第 ' + gk + ' 個五度離 C ', 'Fifth ' + gk + ' is ') + B.sg(TC.stackPoint(gk, f).offC, 2) + T(' 音分', ' cents from C') : '');
      setHud('tip', n < 12 ? T('按「再疊一個五度」，看點沿著螺旋往上爬；從正上方看就是 2D 鐘面。', 'Press “Stack a fifth” and watch the dots climb the helix; seen from straight above it is the 2D clock.')
        : n === 12 ? T('側面看：12 個五度爬了 7 圈，停在 C 那條線的旁邊。', 'From the side: 12 fifths climb 7 turns and stop just beside the line of C’s.')
          : T('發亮的一段是離 C 那條線的缺口；從正上方往下看就是 2D 鐘面。', 'The glowing piece is the gap to the line of C’s; seen from straight above it is the 2D clock.'));
    }

    // ---------- 視角 ----------
    let lastAspect = 0;
    function fitDistance() {
      const vf = camera.fov * DEG;
      const hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
      const dv = (fitH / 2) / Math.tan(vf / 2), dh = (fitW / 2) / Math.tan(hf / 2);
      return Math.max(dv, dh) * 1.12 + RAD;
    }
    function resetCamera() {
      const d = fitDistance();
      controls.target.copy(fitC);
      camera.position.copy(fitC).addScaledVector(new THREE.Vector3(0.95, 0.62, 0.62).normalize(), d);
      controls.minDistance = 1.2;
      controls.maxDistance = fitR * 6 + 8;
      camera.near = 0.02; camera.far = fitR * 40 + 50;
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
      cw = w; ch = h;
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
    // 鍵盤：方向鍵繞著螺旋轉
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
      frame: function () { requestRender(); },
      /** 音律、主音、w、選音、疊了幾個五度改變時重建；圈數改變時重新取景 */
      rebuild: function () { build(); if (turns !== lastTurns) { lastTurns = turns; resetCamera(); } requestRender(); },
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
    lastTurns = turns;
    const w0 = canvas.clientWidth, h0 = canvas.clientHeight;
    if (w0 && h0) {
      cw = w0; ch = h0;
      renderer.setSize(cw, ch, false);
      camera.aspect = cw / ch;
      camera.updateProjectionMatrix();
      lastAspect = camera.aspect;
    }
    resetCamera();
    return api;
  }

  window.Temperament3D = { create: create };
})();
