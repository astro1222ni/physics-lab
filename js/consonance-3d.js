/*
 * consonance-3d.js — 「協和與不協和」的 3D 三音和弦曲面（three.js）
 *
 * 由 js/consonance.js 在學生按「3D 和弦曲面」時才載入（three.js 也是那時才以 import() 載入）；切回 2D 時整個釋放。
 * 用法：window.Consonance3D.create({ THREE, OrbitControls }, 容器, bridge) → { active, frame, rebuild, marker, onTheme, resetCamera, dispose }
 *
 * 曲面：橫軸是中音的頻率比 r（0–1200 音分，也就是 1 到 2），縱深是最高音的頻率比 r2（同樣 1 到 2），
 *   高度是三個音一起的不協和度 D3 開根號（壓縮刻度：最低處在底面、最高處在 H_SURF），顏色由「平穩」綠到「粗糙」紅。
 *   D3 在 121 × 121 的格點上由 consonance-core.js 的 chordGrid 計算（和 2D 讀數同一套公式）。
 *   地形對對角線 r = r2 對稱（兩個上方音對調是同一個和弦）。
 *   大三和弦 (5/4, 3/2) 與小三和弦 (6/5, 3/2)：用核心的 basin 從理想位置往低處走，真的有盆地底才標出來（換成純音就不標）。
 *   目前的和弦 (r, r2) 是一顆小球，高度用精確的 D3。
 * 所有數值都由 consonance-core.js 算出（bridge.Core），3D 只負責畫。
 */
(function () {
  'use strict';
  const FONT = 'system-ui, -apple-system, "Segoe UI", "Noto Sans TC", "PingFang TC", sans-serif';
  const PI = Math.PI, DEG = PI / 180;
  const S = 4;                 // 底面邊長（1200 音分）
  const H_SURF = 1.55;         // 曲面最高處的高度
  const N = 120;               // 格點：121 × 121
  const CMAX = 1200;

  function create(lib, host, B) {
    const THREE = lib.THREE;
    const T = B.T, D = B.D, Core = B.Core;
    let C = B.colors();
    const col = function (k) { return new THREE.Color(C[k] || k); };
    const isDark = function () { return !!D.dark; };

    // ---------- 畫布與資訊列 ----------
    const wrap = document.createElement('div');
    wrap.className = 'c3-wrap';
    const canvas = document.createElement('canvas');
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', T('三音和弦不協和度的 3D 曲面：橫軸是中音的頻率比 r，縱深是最高音的頻率比 r2，高度是三個音一起的不協和度。低處是盆地，小球是目前的和弦。拖曳旋轉，滾輪或雙指縮放，方向鍵也可以轉動。',
      '3D surface of the dissonance of three-note chords: across is the middle note’s ratio r, depth is the top note’s ratio r2, height is the dissonance of all three notes. Low places are basins; the ball is the current chord. Drag to rotate, scroll or pinch to zoom, or use the arrow keys.'));
    wrap.appendChild(canvas);
    const hud = document.createElement('div');
    hud.className = 'c3-hud';
    hud.setAttribute('aria-hidden', 'true');
    hud.innerHTML = '<div class="tl"><span class="m" data-k="tim"></span><span data-k="ch"></span><span data-k="d3"></span><span data-k="bs"></span></div><div class="bl"><span class="m" data-k="tip"></span></div>';
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
    controls.maxPolarAngle = PI * 0.495;    // 不鑽到底面下面

    // ---------- 光線與環境反光 ----------
    scene.add(new THREE.HemisphereLight(0xffffff, 0x3a4250, 0.85));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
    keyLight.position.set(-4, 9, 6);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
    fillLight.position.set(6, 3, -5);
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
    const X = function (c1) { return (c1 / CMAX - 0.5) * S; };     // 中音（音分）→ x
    const Z = function (c2) { return (0.5 - c2 / CMAX) * S; };     // 最高音（音分）→ z（越高越往裡面）
    let sMin = 0, sMax = 1;     // √D3 的範圍（格點上的最小、最大）
    const Y = function (d3) { return Math.max(-0.02, (Math.sqrt(Math.max(0, d3)) - sMin) / Math.max(1e-9, sMax - sMin) * H_SURF); };
    function mat(color, opt) {
      opt = opt || {};
      return new THREE.MeshStandardMaterial({
        color: color, roughness: opt.rough == null ? 0.35 : opt.rough, metalness: opt.metal == null ? 0.1 : opt.metal,
        emissive: opt.emissive || 0x000000, emissiveIntensity: opt.ei == null ? 1 : opt.ei,
        transparent: opt.opacity != null, opacity: opt.opacity == null ? 1 : opt.opacity, depthWrite: opt.opacity == null || opt.opacity > 0.9
      });
    }
    function fsF() { return Math.max(1, Math.min(1.45, B.fs ? B.fs() : 1)); }
    /** 文字小牌（畫布貼圖的 Sprite，永遠面向鏡頭）；sub 是接在後面的下標（例如 r 的 2） */
    function label(text, color, h, weight, sub) {
      const c = document.createElement('canvas'), g = c.getContext('2d');
      const px = 56, font = (weight || 600) + ' ' + px + 'px ' + FONT, fontS = (weight || 600) + ' ' + Math.round(px * 0.66) + 'px ' + FONT;
      g.font = font;
      const w1 = g.measureText(text).width;
      g.font = fontS;
      const w2 = sub ? g.measureText(sub).width + 3 : 0;
      const w = Math.ceil(w1 + w2) + 28;
      c.width = w; c.height = 84;
      g.lineJoin = 'round'; g.lineWidth = 12; g.strokeStyle = D.alpha(C['canvas-bg'], 0.9);
      g.textAlign = 'left'; g.textBaseline = 'middle';
      g.font = font; g.strokeText(text, 14, 42); g.fillStyle = color; g.fillText(text, 14, 42);
      if (sub) { g.font = fontS; g.strokeText(sub, 14 + w1 + 2, 56); g.fillText(sub, 14 + w1 + 2, 56); }
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      // 文字永遠畫在最上層（不被曲面擋住）
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
      s.renderOrder = 10;
      const hh = h * fsF();
      s.scale.set(hh * w / 84, hh, 1);
      return s;
    }

    // ---------- 物件 ----------
    const gBase = new THREE.Group(), gSurf = new THREE.Group(), gMarks = new THREE.Group(), gLabels = new THREE.Group(), gCur = new THREE.Group();
    scene.add(gBase, gSurf, gMarks, gLabels, gCur);
    const fitC = new THREE.Vector3(0, H_SURF * 0.32, 0);

    // 底座：一塊薄板、外框、刻度與軸名（只在建立與換主題時重畫）
    const TICKS = [[0, '1'], [Core.cents(5 / 4), '5:4'], [Core.cents(4 / 3), '4:3'], [Core.cents(3 / 2), '3:2'], [Core.cents(5 / 3), '5:3'], [1200, '2']];
    function buildBase() {
      clearGroup(gBase);
      const slab = new THREE.Mesh(new THREE.BoxGeometry(S + 0.16, 0.06, S + 0.16), mat(isDark() ? D.shade(C.surface, 0.06) : D.shade(C.surface, -0.04), { rough: 0.8, metal: 0 }));
      slab.position.y = -0.06;
      gBase.add(slab);
      const lineMat = new THREE.LineBasicMaterial({ color: col('muted'), transparent: true, opacity: 0.45 });
      const pts = [new THREE.Vector3(X(0), 0, Z(0)), new THREE.Vector3(X(CMAX), 0, Z(0)), new THREE.Vector3(X(CMAX), 0, Z(CMAX)), new THREE.Vector3(X(0), 0, Z(CMAX)), new THREE.Vector3(X(0), 0, Z(0))];
      gBase.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
      // 對角線 r = r2（兩個上方音同度）
      const diag = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(X(0), 0.002, Z(0)), new THREE.Vector3(X(CMAX), 0.002, Z(CMAX))]),
        new THREE.LineDashedMaterial({ color: col('muted'), transparent: true, opacity: 0.4, dashSize: 0.08, gapSize: 0.06 }));
      diag.computeLineDistances();
      gBase.add(diag);
      const tickMat = new THREE.LineBasicMaterial({ color: col('muted'), transparent: true, opacity: 0.6 });
      TICKS.forEach(function (tk) {
        const c = tk[0];
        gBase.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(X(c), 0, Z(0)), new THREE.Vector3(X(c), 0, Z(0) + 0.1)]), tickMat));
        // r2 的刻度放在右邊（預設視角離鏡頭近的那一邊，不會被曲面擋住）
        gBase.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(X(CMAX), 0, Z(c)), new THREE.Vector3(X(CMAX) + 0.1, 0, Z(c))]), tickMat));
        const a = label(tk[1], C.muted, 0.15, 600);
        a.position.set(X(c), 0.02, Z(0) + 0.3);
        gLabels.add(a);
        const b = label(tk[1], C.muted, 0.15, 600);
        b.position.set(X(CMAX) + 0.3, 0.02, Z(c));
        gLabels.add(b);
      });
      const ax = label(T('中音的頻率比 r', 'middle note ratio r'), C['cs-hi'], 0.17, 700);
      ax.position.set(0, 0.02, Z(0) + 0.66);
      gLabels.add(ax);
      const az = label(T('最高音的頻率比 r', 'top note ratio r'), C['cs-r2'], 0.17, 700, '2');
      az.position.set(X(CMAX) + 0.75, 0.02, Z(CMAX / 2));
      gLabels.add(az);
    }

    // 曲面
    let grid = null;
    const WHITE = new THREE.Color(0xffffff);
    function heightColor(u, out) {
      // 平穩（綠）→ 琥珀 → 粗糙（紅）；淺色模式稍微調淡，不要太刺眼
      const a = col('cs-calm'), m = col('cs-coin'), b = col('cs-rough');
      if (u < 0.5) out.copy(a).lerp(m, u / 0.5); else out.copy(m).lerp(b, (u - 0.5) / 0.5);
      if (!isDark()) out.lerp(WHITE, 0.14);
      return out;
    }
    function buildSurface() {
      clearGroup(gSurf); clearGroup(gMarks);
      const d = B.data();
      grid = Core.chordGrid(d.f1, d.timbre, N, CMAX);
      sMin = Math.sqrt(Math.max(0, grid.min)); sMax = Math.sqrt(Math.max(0, grid.max));
      const M = N + 1, pos = new Float32Array(M * M * 3), cols = new Float32Array(M * M * 3), idx = [];
      const cc = new THREE.Color();
      // 顏色依「排名」（百分位數）上色：最低的是同度、八度那幾條深溝，用高度直接上色會讓其他地方全是紅色；
      // 依排名上色時，盆地（周圍都比較高的地方）就會是綠色。高度仍然是真正的 √D3。
      const sorted = Float64Array.from(grid.z).sort();
      const rank = function (z) {
        let lo = 0, hi = sorted.length - 1;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] < z) lo = mid + 1; else hi = mid; }
        return lo / (sorted.length - 1);
      };
      for (let i = 0; i < M; i++) {
        for (let j = 0; j < M; j++) {
          const k = i * M + j, z = grid.z[k], y = Y(z);
          pos[k * 3] = X(i * CMAX / N); pos[k * 3 + 1] = y; pos[k * 3 + 2] = Z(j * CMAX / N);
          heightColor(Math.max(0, Math.min(1, rank(z))), cc);
          cols[k * 3] = cc.r; cols[k * 3 + 1] = cc.g; cols[k * 3 + 2] = cc.b;
        }
      }
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          const a = i * M + j, b = (i + 1) * M + j, c = (i + 1) * M + j + 1, e = i * M + j + 1;
          idx.push(a, e, c, a, c, b);     // 沿 r = r2 的方向切三角形：對角線上那道窄窄的深溝才不會變成鋸齒
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const surf = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.06, side: THREE.DoubleSide, envMapIntensity: 0.8 }));
      gSurf.add(surf);
      // 半音格線（每 100 音分一條，貼在曲面上）
      const lm = new THREE.LineBasicMaterial({ color: isDark() ? 0xffffff : 0x0f172a, transparent: true, opacity: isDark() ? 0.16 : 0.13 });
      for (let s = 0; s <= 12; s++) {
        const k = s * 10, a = [], b = [];
        for (let t = 0; t < M; t++) {
          a.push(new THREE.Vector3(pos[(k * M + t) * 3], pos[(k * M + t) * 3 + 1] + 0.006, pos[(k * M + t) * 3 + 2]));
          b.push(new THREE.Vector3(pos[(t * M + k) * 3], pos[(t * M + k) * 3 + 1] + 0.006, pos[(t * M + k) * 3 + 2]));
        }
        gSurf.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(a), lm));
        gSurf.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(b), lm));
      }
      // 大三和弦、小三和弦的盆地（真的有盆地底才標）
      const marks = [
        { c1: Core.cents(5 / 4), c2: Core.cents(3 / 2), zh: '大三和弦 4:5:6', en: 'major triad 4:5:6' },
        { c1: Core.cents(6 / 5), c2: Core.cents(3 / 2), zh: '小三和弦 10:12:15', en: 'minor triad 10:12:15' }
      ];
      marks.forEach(function (m, n) {
        const bs = Core.basin(d.f1, m.c1, m.c2, d.timbre, 1, 24);
        if (!bs.converged || Math.hypot(bs.c1 - m.c1, bs.c2 - m.c2) > 5) return;
        const p = new THREE.Vector3(X(bs.c1), Y(bs.d) + 0.012, Z(bs.c2));
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.013, 8, 28), mat(C['cs-calm'], { emissive: col('cs-calm'), ei: 0.45 }));
        ring.position.copy(p); ring.rotation.x = PI / 2;
        gMarks.add(ring);
        // 兩個盆地只差 70 音分：細桿一長一短，標籤上下錯開，從哪個角度看都不重疊
        const len = n ? 0.95 : 0.5;
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, len, 6, 1, true), mat(C['cs-calm'], { opacity: 0.6 }));
        stem.position.copy(p).add(new THREE.Vector3(0, len / 2, 0));
        gMarks.add(stem);
        const s = label(T(m.zh, m.en), C['cs-calm'], 0.16, 700);
        s.position.copy(p).add(new THREE.Vector3(0, len + 0.1, 0));
        gMarks.add(s);
      });
    }

    // 目前的和弦：小球、垂直細線、底面上的影子環
    const curMat = mat(C.accent, { emissive: col('accent'), ei: 0.35, metal: 0.2, rough: 0.25 });
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.075, 24, 16), curMat);
    const stemMat = mat(C.accent, { opacity: 0.55 });
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1, 6, 1, true), stemMat);
    const foot = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.075, 28), new THREE.MeshBasicMaterial({ color: col('accent'), transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
    foot.rotation.x = -PI / 2;
    gCur.add(ball, stem, foot);
    function placeMarker() {
      const d = B.data(), c1 = Core.cents(d.r), c2 = Core.cents(d.r2), ch = d.chord;
      const inside = c1 <= CMAX + 1e-6 && c2 <= CMAX + 1e-6;
      gCur.visible = inside;
      if (inside) {
        const y = Y(ch.D3), x = X(c1), z = Z(c2);
        ball.position.set(x, y + 0.075, z);
        stem.scale.y = Math.max(0.001, y);
        stem.position.set(x, y / 2, z);
        foot.position.set(x, 0.004, z);
      }
      setHud('tim', B.timbreShort(d.timbre, d.f1));
      setHud('ch', T('和弦 1 : ', 'Chord 1 : ') + B.fx(d.r, 4) + ' : ' + B.fx(d.r2, 4));
      setHud('d3', 'D<sub>3</sub> = ' + B.fx(ch.D3, 3));
      if (!inside) setHud('bs', T('r 大於 2，小球在曲面外', 'r is above 2: the ball is off the surface'), 'm');
      else if (ch.atBasin) setHud('bs', T('在盆地底', 'at the bottom of a basin'), 'ok');
      else setHud('bs', T('不在盆地底', 'not at the bottom of a basin'), 'm');
      setHud('tip', T('改「頻率比 r」和「最高音的頻率比 r<sub>2</sub>」移動小球；綠色低處是比較協和的和弦。', 'Move the ball with “Frequency ratio r” and “Top note’s frequency ratio r<sub>2</sub>”; the low green places are the smoother chords.'), 'm');
      requestRender();
    }

    // ---------- 視角 ----------
    let lastAspect = 0;
    function fitDistance() {
      const vf = camera.fov * DEG;
      const hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
      const R = S * 0.7 + 0.3;
      // 直式（手機）畫面：斜看時底面的對角線比較寬，要退遠一點才放得下兩軸的標籤
      return Math.max(R / Math.tan(vf / 2), R / Math.tan(hf / 2)) * (camera.aspect < 1 ? 1.12 : 0.9);
    }
    function resetCamera() {
      const d = fitDistance();
      controls.target.copy(fitC);
      camera.position.copy(fitC).addScaledVector(new THREE.Vector3(0.42, 0.78, 1).normalize(), d);
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
      else if (ev.key === 'ArrowDown') sph.phi = Math.min(PI * 0.495, sph.phi + step);
      else used = false;
      if (!used) return;
      ev.preventDefault();
      camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(sph));
      controls.update();
      requestRender();
    });

    function buildAll() {
      clearGroup(gLabels);
      buildBase();
      buildSurface();
      curMat.color.copy(col('accent')); curMat.emissive.copy(col('accent'));
      stemMat.color.copy(col('accent'));
      foot.material.color.copy(col('accent'));
      placeMarker();
    }

    const api = {
      active: true,
      frame: function () { requestRender(); },
      /** 音色或下方音改變：重算曲面 */
      rebuild: function () { buildSurface(); placeMarker(); },
      /** 只有比值改變：移動小球、更新資訊列 */
      marker: function () { placeMarker(); },
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
        disposeObject(scene);
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

  window.Consonance3D = { create: create };
})();
