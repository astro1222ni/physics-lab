/*
 * circle-of-fifths-3d.js — 「五度圈、調號與轉調」的 3D 調號螺旋（three.js）
 *
 * 由 js/circle-of-fifths.js 在使用者按「3D 調號螺旋」時才載入（three.js 也是那時才以 import() 載入）；切回 2D 時整個釋放。
 * 用法：window.CircleFifths3D.create({ THREE, OrbitControls }, 容器, bridge) → { active, frame, rebuild, onTheme, resetCamera, setFlat, dispose }
 *
 * 螺旋：角度 = 五度圈上的格子（j mod 12，每格 30°；C 在後方，從上往下看順時針，和 2D 轉盤一樣），
 *       高度 = 調號 j（升記號往上、降記號往下），所以每轉一圈多 12 個記號：外圈是大調、內圈（半徑 0.68）是關係小調。
 *       同一格上下相差 12 的兩個調（j 與 j − 12）是同名異音：同一組鋼琴鍵、兩種寫法，以直立柱相連（常用的三對亮、其他理論上的調淡）。
 * 「把螺旋壓成圓」：高度乘上 f（動畫從 1 到 0），柱子縮成一點、螺旋變回 2D 的五度圈——十二平均律裡同名異音本來就是同一個音。
 * 所有位置都由 circle-of-fifths-core.js 算出（bridge.CF.helix()），3D 只負責畫。
 */
(function () {
  'use strict';
  const FONT = 'system-ui, -apple-system, "Segoe UI", "Noto Sans TC", "PingFang TC", sans-serif';
  const PI = Math.PI, TAU = 2 * PI, DEG = PI / 180;
  const RAD = 1;           // 大調螺旋的半徑
  const H = 0.2;           // 每多一個記號升高多少
  const VIEW = { x: 0.62, y: 0.55, z: 1.0 };

  function create(lib, host, B) {
    const THREE = lib.THREE;
    const T = B.T, D = B.D, CF = B.CF;
    let C = B.colors();
    const col = function (k) { return new THREE.Color(C[k] || k); };
    const isDark = function () { return !!D.dark; };

    // ---------- 畫布與資訊列 ----------
    const wrap = document.createElement('div');
    wrap.className = 't3-wrap';
    const canvas = document.createElement('canvas');
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', T('調號螺旋的 3D 立體檢視：繞一圈是五度圈的十二格，高度是調號（升記號往上、降記號往下）；同一格上下相差十二個記號的兩個調是同名異音，用直立柱相連。拖曳旋轉，滾輪或雙指縮放，方向鍵也可以轉動。',
      '3D key-signature spiral: one turn is the twelve places of the circle of fifths and the height is the key signature (sharps up, flats down); two keys twelve accidentals apart on the same place are enharmonic and are joined by an upright post. Drag to rotate, scroll or pinch to zoom, or use the arrow keys.'));
    wrap.appendChild(canvas);
    const hud = document.createElement('div');
    hud.className = 't3-hud';
    hud.setAttribute('aria-hidden', 'true');
    hud.innerHTML = '<div class="tl"><span data-k="nm"></span><span class="m" data-k="cur"></span><span class="en" data-k="en"></span></div><div class="bl"><span class="m" data-k="tip"></span></div>';
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
    /** 調號 j、調式 mode 在螺旋上的位置（高度再乘上壓扁係數 f） */
    function P(j, mode, f, rOff) {
      const h = CF.helix(j, mode, H), r = h.r * RAD + (rOff || 0);
      return new THREE.Vector3(r * Math.sin(h.angle), h.y * f, -r * Math.cos(h.angle));
    }
    function mat(color, opt) {
      opt = opt || {};
      return new THREE.MeshStandardMaterial({
        color: color, roughness: opt.rough == null ? 0.35 : opt.rough, metalness: opt.metal == null ? 0.1 : opt.metal,
        emissive: opt.emissive || 0x000000, emissiveIntensity: opt.ei == null ? 1 : opt.ei, side: opt.side || THREE.FrontSide,
        transparent: opt.opacity != null, opacity: opt.opacity == null ? 1 : opt.opacity, depthWrite: opt.opacity == null || opt.opacity > 0.9
      });
    }
    function sphere(r, material) { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), material); m.castShadow = true; return m; }
    /** 兩點之間的細棒（先做成長度 1 的直立圓柱，之後用 placeRod 擺位置，壓扁動畫時只改位置與長度） */
    function rodMesh(r, material) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 10, 1, true), material);
      m.castShadow = true;
      return m;
    }
    const UP = new THREE.Vector3(0, 1, 0);
    function placeRod(m, a, b) {
      const d = new THREE.Vector3().subVectors(b, a), len = d.length();
      m.visible = len > 1e-3;
      if (!m.visible) return;
      m.position.copy(a).addScaledVector(d, 0.5);
      m.scale.set(1, len, 1);
      m.quaternion.setFromUnitVectors(UP, d.normalize());
    }
    function fsF() { return Math.max(1, Math.min(1.45, B.fs ? B.fs() : 1)); }
    function narrow() { const w = canvas.clientWidth; return !!w && w < 560; }
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
      const hh = h * fsF() * (narrow() ? 1.25 : 1);
      s.scale.set(hh * w / 80, hh, 1);
      return s;
    }

    // ---------- 物件 ----------
    // gSpiral 裡的東西用 scale.y 壓扁（管子、柱子、軸）；節點與標籤每一格動畫都重新擺位置，形狀不變
    const gBase = new THREE.Group(), gSpiral = new THREE.Group(), gNodes = new THREE.Group(), gLabels = new THREE.Group();
    scene.add(gBase, gSpiral, gNodes, gLabels);
    let movers = [];         // { obj, j, mode, rOff, dy }：依 f 擺位置
    let rods = [];           // { mesh, a:{j,mode}, b:{j,mode} }
    let flatF = B.data().flat ? 0 : 1, flatGoal = flatF, flatT0 = 0, flatFrom = flatF;
    let jMin = -7, jMax = 7;
    let fitC = new THREE.Vector3(), fitH = 3.4, fitW = 3.2;

    function sideColor(j) { return j > 0 ? C['cf-sharp'] : j < 0 ? C['cf-flat'] : C.muted; }
    function curve(mode, j0, j1) {
      const pts = [];
      const n = Math.max(2, Math.round((j1 - j0) * 10));
      for (let i = 0; i <= n; i++) {
        const j = j0 + (j1 - j0) * i / n, h = CF.helix(j, mode, H), r = h.r * RAD;
        // helix 的 angle 是 j mod 12 的角度；小數 j 也能用（連續地轉）
        const a = (((j % 12) + 12) % 12) / 12 * TAU;
        pts.push(new THREE.Vector3(r * Math.sin(a), j * H, -r * Math.cos(a)));
      }
      return new THREE.CatmullRomCurve3(pts);
    }

    function build() {
      [gBase, gSpiral, gNodes, gLabels].forEach(clearGroup);
      movers = []; rods = [];
      const d = B.data(), a = d.a, t = a.t;
      const js = [a.j, a.rel.j]; if (t) js.push(t.j);
      jMin = Math.min(-7, Math.min.apply(null, js)); jMax = Math.max(7, Math.max.apply(null, js));
      const yMin = jMin * H, yMax = jMax * H;
      setFit();

      // 底座：下方的圓盤（壓扁時螺旋落在 y = 0 的圓上，所以另外畫一圈淡淡的「平均律的五度圈」）
      const baseY = yMin - 0.35;
      baseLow = yMin;
      const base = new THREE.Mesh(new THREE.CylinderGeometry(RAD + 0.4, RAD + 0.48, 0.1, 72), mat(D.mix(C.surface, C['canvas-bg'], 0.3), { rough: 0.75, metal: 0.05 }));
      base.position.y = baseY;
      base.receiveShadow = true;
      gBase.add(base);
      for (let p = 0; p < 12; p++) {
        const ang = p / 12 * TAU;
        const tick = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.02, 0.18), mat(C.muted, { rough: 0.6 }));
        tick.position.set((RAD + 0.25) * Math.sin(ang), baseY + 0.06, -(RAD + 0.25) * Math.cos(ang));
        tick.rotation.y = -ang;
        gBase.add(tick);
      }
      const ring = new THREE.Mesh(new THREE.TorusGeometry(RAD, 0.006, 6, 96), mat(C.muted, { opacity: 0.35 }));
      ring.rotation.x = PI / 2;
      gSpiral.add(ring);
      // 中軸
      const axis = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, yMax - yMin + 0.4, 8, 1, true), mat(C.muted, { opacity: 0.4 }));
      axis.position.y = (yMax + yMin) / 2;
      gSpiral.add(axis);

      // 兩條螺旋管：外圈大調、內圈小調
      const tubeMaj = new THREE.Mesh(new THREE.TubeGeometry(curve('major', jMin - 0.4, jMax + 0.4), 400, 0.022, 10, false), mat(D.mix(C.text, C.surface, 0.55), { rough: 0.4, metal: 0.2 }));
      tubeMaj.castShadow = true;
      const tubeMin = new THREE.Mesh(new THREE.TubeGeometry(curve('minor', jMin - 0.4, jMax + 0.4), 400, 0.012, 8, false), mat(C.muted, { rough: 0.5, opacity: 0.75 }));
      gSpiral.add(tubeMaj, tubeMin);

      // 同名異音的直立柱（j 與 j − 12，大調）
      for (let j = jMin + 12; j <= jMax; j++) {
        const std = Math.abs(j) <= 7 && Math.abs(j - 12) <= 7;
        const hit = (j === a.j || j - 12 === a.j);
        const m = rodMesh(std ? 0.016 : 0.008, hit ? mat(C['cf-key'], { emissive: col('cf-key'), ei: 0.45 }) : std ? mat(D.mix(C.text, C.surface, 0.3), { rough: 0.4, metal: 0.25, opacity: 0.85 }) : mat(C.muted, { opacity: 0.45 }));
        gNodes.add(m);
        rods.push({ mesh: m, a: { j: j, mode: 'major' }, b: { j: j - 12, mode: 'major' } });
      }

      // 節點與標籤
      const visited = d.visited || {};
      const nearSet = {};
      a.near.forEach(function (x) { nearSet[x.j + '|' + x.mode] = true; });
      const sounding = d.sounding;
      ['major', 'minor'].forEach(function (mode) {
        for (let j = jMin; j <= jMax; j++) {
          const id = j + '|' + mode;
          const isCur = j === a.j && mode === a.mode;
          const isT = t && j === t.j && mode === t.mode;
          const isSnd = sounding && sounding.j === j && sounding.mode === mode;
          const near = nearSet[id];
          const theor = Math.abs(j) > 7;
          const base = mode === 'major' ? 0.055 : 0.04;
          const r = isCur || isSnd ? base * 1.7 : isT ? base * 1.45 : near ? base * 1.2 : base;
          const cName = isSnd ? 'accent' : isCur ? 'cf-key' : isT ? 'cf-target' : null;
          const m = cName ? mat(C[cName], { emissive: col(cName), ei: isSnd ? 0.8 : 0.4 })
            : mat(sideColor(j), { emissive: visited[id] ? new THREE.Color(sideColor(j)) : 0x000000, ei: 0.25, opacity: theor ? 0.5 : visited[id] ? undefined : 0.9 });
          const s = sphere(r, m);
          gNodes.add(s);
          movers.push({ obj: s, j: j, mode: mode, rOff: 0, dy: 0 });
          if (near && !isCur) {
            const halo = new THREE.Mesh(new THREE.SphereGeometry(r * 1.9, 18, 12), mat(C['cf-key'], { opacity: 0.18, rough: 0.9 }));
            gNodes.add(halo);
            movers.push({ obj: halo, j: j, mode: mode, rOff: 0, dy: 0 });
          }
          // 標籤：大調全部標；小調只標目前、比較、近關係調
          // 壓成圓時同一格的兩種寫法疊在一起：每格只標一個「F♯/G♭」（用常用寫法那一個 j 代表）
          const flatLab = flatGoal < 0.5;
          const pos = CF.posOf(j), auto = CF.jOf(pos, 'auto');
          let show = mode === 'major' || isCur || isT || near;
          if (flatLab) show = show && (j === auto || (Math.abs(auto) > 7 && j === a.j));
          if (flatLab && mode === 'minor' && !isCur) show = false;
          if (show) {
            const alts = CF.standardJs(pos).filter(function (x) { return x !== j; });
            const txt = flatLab ? CF.keyLabel(j, mode) + (mode === 'major' && alts.length ? ' / ' + CF.keyLabel(alts[0], mode) : '')
              : CF.keyLabel(j, mode) + (mode === 'major' ? '  ' + B.sigShort(j) : '');
            const lc = isCur ? C['cf-key'] : isT ? C['cf-target'] : theor ? C.muted : mode === 'major' ? C.text : C.muted;
            const lb = label(txt, lc, mode === 'major' ? 0.15 : 0.13, isCur || isT ? 700 : 600);
            gLabels.add(lb);
            movers.push({ obj: lb, j: j, mode: mode, rOff: mode === 'major' ? 0.3 : -0.2, dy: 0 });
          }
        }
      });
      // 方向說明
      const up = label(T('升記號 ↑', 'sharps ↑'), C['cf-sharp'], 0.15, 700);
      gLabels.add(up);
      const dn = label(T('降記號 ↓', 'flats ↓'), C['cf-flat'], 0.15, 700);
      gLabels.add(dn);
      upDn = [up, dn, yMax, yMin];
      place();

      // 資訊列
      setHud('nm', B.keyName(a.j, a.mode) + '（' + B.sigShort(a.j) + '）');
      setHud('cur', T('角度＝五度圈的格子，高度＝調號（升往上、降往下）', 'Angle = place on the circle, height = key signature (sharps up, flats down)'));
      const alts = CF.standardJs(a.pos).filter(function (x) { return x !== a.j; });
      setHud('en', alts.length || Math.abs(a.j) > 7
        ? T('直柱：' + B.keyName(a.j, a.mode) + ' ＝ ' + B.keyName(alts.length ? alts[0] : (a.j > 0 ? a.j - 12 : a.j + 12), a.mode) + '（同名異音）', 'Post: ' + B.keyName(a.j, a.mode) + ' = ' + B.keyName(alts.length ? alts[0] : (a.j > 0 ? a.j - 12 : a.j + 12), a.mode) + ' (enharmonic)')
        : T('直柱連起同名異音的兩個調（相差 12 個記號）', 'Posts join enharmonic keys (12 accidentals apart)'));
      setHud('tip', flatGoal < 0.5
        ? T('壓成圓：十二平均律裡，同名異音的兩個調是同一組鍵，柱子縮成一點。', 'Squashed: in equal temperament enharmonic keys use the same keys, so each post shrinks to a point.')
        : T('從正上方往下看就是 2D 五度圈；上下相差一圈的兩個調，記號數加起來是 12。', 'Seen from straight above it is the 2D circle; two keys one turn apart have accidentals adding up to 12.'));
    }
    let upDn = null, baseLow = 0;
    /** 鏡頭要框住的範圍：螺旋展開時看全高，壓成圓時只看那一圈（手機上留空間給上方的資訊列） */
    function setFit() {
      const yMin = jMin * H, yMax = jMax * H, nw = narrow();
      if (flatGoal < 0.5) { fitC.set(0, nw ? 0.1 : -0.05, 0); fitH = 1.9; }
      else { fitC.set(0, nw ? 0.22 : 0.05, 0); fitH = (yMax - yMin) * 0.85 + (nw ? 2.0 : 1.4); }
      fitW = 2 * RAD + (nw ? 1.6 : 1.4);
    }
    /** 依壓扁係數 flatF 擺放節點、標籤與直柱 */
    function place() {
      const f = flatF;
      gSpiral.scale.y = Math.max(1e-3, f);
      movers.forEach(function (m) {
        const p = P(m.j, m.mode, f, m.rOff);
        m.obj.position.set(p.x, p.y + m.dy, p.z);
      });
      rods.forEach(function (r) { placeRod(r.mesh, P(r.a.j, r.a.mode, f), P(r.b.j, r.b.mode, f)); });
      if (upDn) {
        upDn[0].position.set(-(RAD + 0.55), upDn[2] * f, 0); upDn[1].position.set(-(RAD + 0.55), upDn[3] * f, 0);
        upDn[0].visible = upDn[1].visible = f > 0.2;
      }
      gBase.position.y = baseLow * (f - 1);
    }

    // ---------- 視角 ----------
    let lastAspect = 0, lastNarrow = null;
    function fitDistance() {
      const vf = camera.fov * DEG;
      const hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
      const dv = (fitH / 2) / Math.tan(vf / 2), dh = (fitW / 2) / Math.tan(hf / 2);
      return Math.max(dv, dh) * 1.08 + RAD;
    }
    function resetCamera() {
      const dd = fitDistance();
      controls.target.copy(fitC);
      camera.position.copy(fitC).addScaledVector(VIEW_DIR, dd);
      controls.minDistance = 1.2;
      controls.maxDistance = dd * 4;
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
      let more = controls.update();
      if (flatF !== flatGoal) {
        const u = D.reducedMotion() ? 1 : Math.min(1, (performance.now() - flatT0) / 650);
        const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
        flatF = u >= 1 ? flatGoal : flatFrom + (flatGoal - flatFrom) * e;
        place();
        if (flatF !== flatGoal) more = true;
      }
      renderer.render(scene, camera);
      if (more) requestRender();
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
      setFlat: function (on) {
        flatFrom = flatF; flatGoal = on ? 0 : 1; flatT0 = performance.now();
        Object.keys(hudLast).forEach(function (k) { delete hudLast[k]; });
        build();
        resetCamera();
      },
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

  window.CircleFifths3D = { create: create };
})();
