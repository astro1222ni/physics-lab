/*
 * loudness-3d.js — 「分貝、等響曲線與聽力保護」的 3D 響度曲面（three.js）
 *
 * 由 js/loudness.js 在使用者按「3D 響度曲面」時才載入（three.js 也是那時才以 import() 載入）；切回 2D 時整個釋放。
 * 用法：window.Loudness3D.create({ THREE, OrbitControls }, 容器, bridge) → { active, frame, rebuild, setMode, onTheme, resetCamera, dispose }
 *
 * 地面：x = log10(頻率)（20 Hz–12.5 kHz，左到右），z = 聲壓級（−10 dB 在前、130 dB 在後）。
 * 高度：響度級 L_N(f, L_p)（phon），或切換成響度 N（sone，40 phon = 1 sone、每 10 phon 加倍；128 sone 以上壓平）。
 *   聽閾以下（聽不到）平貼在地面，畫成灰色。曲面上 10、20、…、100 phon 的等高線就是 2D 的等響曲線（同一套 LoudCore 函數算出）。
 * 洞見：低頻區曲面很陡（等高線擠在一起：加一點 dB，響度級就升很多）；3–4 kHz 是一道「谷」——同樣的 dB，那裡的曲面最高（耳朵最敏感，外耳道共振）。
 * 目前的點是一顆發亮的小球（鎖定時那條等響曲線也亮起），由 bridge.data() 讀取。
 */
(function () {
  'use strict';
  const FONT = 'system-ui, -apple-system, "Segoe UI", "Noto Sans TC", "PingFang TC", sans-serif';
  const PI = Math.PI;
  const XW = 6.0;              // 地面的寬（頻率方向）
  const ZD = 4.2;              // 地面的深（聲壓級方向）
  const HMAX = 2.4;            // 110 phon（或 128 sone）的高度
  const NX = 120, NZ = 100;    // 曲面的格點
  const MORPH = 0.6;           // 切換高度的過渡秒數

  function create(lib, host, B) {
    const THREE = lib.THREE;
    const T = B.T, D = B.D, LC = B.LC;
    let C = B.colors();
    const col = function (k) { return new THREE.Color(C[k] || k); };
    const isDark = function () { return !!D.dark; };
    const LF0 = Math.log10(LC.F_MIN), LF1 = Math.log10(LC.F_MAX);
    const xOf = function (f) { return -XW / 2 + (Math.log10(f) - LF0) / (LF1 - LF0) * XW; };
    const zOf = function (L) { return ZD / 2 - (L - LC.LP_MIN) / (LC.LP_MAX - LC.LP_MIN) * ZD; };
    const hPhon = function (ph) { return HMAX * Math.max(0, Math.min(ph, 125)) / 110; };
    const hSone = function (n) { return HMAX * Math.min(n, 128) / 128; };
    /** 某一點的高度（u = 0 用 phon、u = 1 用 sone；中間是畫面過渡） */
    function heightAt(f, L, u) {
      const thr = LC.threshold(f);
      if (L <= thr) return 0;
      const ph = LC.phonFromSpl(f, L);
      if (ph == null) return 0;
      return (1 - u) * hPhon(ph) + u * hSone(LC.sone(ph));
    }

    // ---------- 畫布與資訊列 ----------
    const wrap = document.createElement('div');
    wrap.className = 't3-wrap';
    const canvas = document.createElement('canvas');
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', T('響度曲面的 3D 立體檢視：地面是頻率（左到右）與聲壓級（前到後），高度是響度級。等響曲線是曲面的等高線；低頻區曲面很陡，3 到 4 kHz 附近最高（耳朵最敏感）。拖曳旋轉，滾輪或雙指縮放，方向鍵也可以轉動。',
      '3D loudness surface: the floor is frequency (left to right) and sound pressure level (front to back); the height is the loudness level. The equal-loudness contours are its contour lines; the surface is steep in the bass and highest around 3 to 4 kHz, where the ear is most sensitive. Drag to rotate, scroll or pinch to zoom, or use the arrow keys.'));
    wrap.appendChild(canvas);
    const hud = document.createElement('div');
    hud.className = 't3-hud';
    hud.setAttribute('aria-hidden', 'true');
    hud.innerHTML = '<div class="tl"><span data-k="mode"></span><span class="c" data-k="cur"></span><span class="m" data-k="slope"></span></div><div class="bl"><span class="m" data-k="tip"></span></div>';
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
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 16 / 10, 0.05, 200);
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.rotateSpeed = 0.85;
    controls.screenSpacePanning = true;
    controls.maxPolarAngle = PI * 0.49;

    // ---------- 光線、環境反光 ----------
    scene.add(new THREE.HemisphereLight(0xffffff, 0x3a4250, 0.9));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
    keyLight.position.set(-3, 7, 5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    const sc = keyLight.shadow.camera;
    sc.left = -4.5; sc.right = 4.5; sc.top = 4.5; sc.bottom = -4.5; sc.near = 0.5; sc.far = 25;
    keyLight.shadow.bias = -0.0006;
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.45);
    fillLight.position.set(4, 3, -4);
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

    function disposeObject(obj) {
      obj.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); });
      });
    }
    function clearGroup(g) { g.children.slice().forEach(function (o) { g.remove(o); disposeObject(o); }); }
    function fsF() { return Math.max(1, Math.min(1.45, B.fs ? B.fs() : 1)); }
    /** 文字小牌（畫布貼圖的 Sprite，永遠面向鏡頭；文字用 2D fillText 畫，簡體自動轉換） */
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
      const hh = h * 1.5 * fsF();
      s.scale.set(hh * w / 80, hh, 1);
      return s;
    }
    function mat(color, opt) {
      opt = opt || {};
      return new THREE.MeshStandardMaterial({
        color: color, roughness: opt.rough == null ? 0.45 : opt.rough, metalness: opt.metal == null ? 0.05 : opt.metal,
        emissive: opt.emissive || 0x000000, emissiveIntensity: opt.ei == null ? 1 : opt.ei,
        transparent: opt.opacity != null, opacity: opt.opacity == null ? 1 : opt.opacity, depthWrite: opt.opacity == null || opt.opacity > 0.9,
        vertexColors: !!opt.vc, side: opt.side || THREE.FrontSide
      });
    }

    // ---------- 曲面（格點的 f、L 固定；高度依模式重算） ----------
    const gStatic = new THREE.Group(), gLines = new THREE.Group(), gLabels = new THREE.Group(), gDyn = new THREE.Group();
    scene.add(gStatic, gLines, gLabels, gDyn);
    const FS = [], LS = [];
    for (let i = 0; i <= NX; i++) FS.push(Math.pow(10, LF0 + (LF1 - LF0) * i / NX));
    for (let j = 0; j <= NZ; j++) LS.push(LC.LP_MIN + (LC.LP_MAX - LC.LP_MIN) * j / NZ);
    const PH = new Float32Array((NX + 1) * (NZ + 1));     // 每個格點的響度級（聽閾以下為 −1）
    for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) {
      const f = FS[i], L = LS[j];
      const ph = L > LC.threshold(f) ? LC.phonFromSpl(f, L) : null;
      PH[j * (NX + 1) + i] = ph == null ? -1 : ph;
    }
    let surf = null, floor = null, ground = null;
    function ramp(ph, out) {
      // 響度級色階：聽閾（青綠）→ 等響曲線色（靛藍）→ 目前點的紅；聽閾以下是灰色
      if (ph < 0) return out.set(isDark() ? 0x39404c : 0xc4c9d1).lerp(col('ld-thr'), 0.35);   // 聽閾以下：偏灰（和聽閾色相近，邊界才不會出現鋸齒色帶）
      const t = Math.max(0, Math.min(1, ph / 110));
      const a = col('ld-thr'), b = col('ld-curve'), c = col('ld-pt');
      if (t < 0.5) return out.copy(a).lerp(b, t / 0.5);
      return out.copy(b).lerp(c, (t - 0.5) / 0.5);
    }
    function buildSurface() {
      clearGroup(gStatic);
      const n = (NX + 1) * (NZ + 1);
      const pos = new Float32Array(n * 3), cols = new Float32Array(n * 3);
      const cc = new THREE.Color();
      for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) {
        const k = j * (NX + 1) + i;
        pos[k * 3] = xOf(FS[i]); pos[k * 3 + 1] = 0; pos[k * 3 + 2] = zOf(LS[j]);
        ramp(PH[k], cc);
        cols[k * 3] = cc.r; cols[k * 3 + 1] = cc.g; cols[k * 3 + 2] = cc.b;
      }
      const idx = [];
      for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
        const a = j * (NX + 1) + i, b = a + 1, c = a + NX + 1, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      g.setIndex(idx);
      surf = new THREE.Mesh(g, mat(0xffffff, { vc: true, rough: 0.55, side: THREE.DoubleSide }));
      surf.castShadow = true; surf.receiveShadow = true;
      gStatic.add(surf);
      // 地面底板（略低於曲面）與柔和陰影
      floor = new THREE.Mesh(new THREE.BoxGeometry(XW + 0.16, 0.04, ZD + 0.16), mat(isDark() ? 0x1a1f28 : 0xe9ecf1, { rough: 0.8 }));
      floor.position.set(0, -0.03, 0); floor.receiveShadow = true;
      gStatic.add(floor);
      ground = new THREE.Mesh(new THREE.PlaneGeometry(XW + 4, ZD + 4), new THREE.ShadowMaterial({ opacity: isDark() ? 0.45 : 0.16 }));
      ground.rotation.x = -PI / 2; ground.position.y = -0.06; ground.receiveShadow = true;
      gStatic.add(ground);
      // 地面的格線：頻率（每十倍）與聲壓級（每 20 dB）
      const lm = new THREE.LineBasicMaterial({ color: col('muted'), transparent: true, opacity: isDark() ? 0.35 : 0.3 });
      const pts = [];
      [20, 100, 1000, 10000].forEach(function (f) { pts.push(new THREE.Vector3(xOf(f), 0.002, zOf(LC.LP_MIN)), new THREE.Vector3(xOf(f), 0.002, zOf(LC.LP_MAX))); });
      for (let L = 0; L <= 120; L += 20) pts.push(new THREE.Vector3(-XW / 2, 0.002, zOf(L)), new THREE.Vector3(XW / 2, 0.002, zOf(L)));
      gStatic.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), lm));
    }

    // ---------- 等高線（= 等響曲線）與聽閾 ----------
    function tube(points, color, r, emissive) {
      const curve = new THREE.CatmullRomCurve3(points);
      const m = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(16, points.length * 2), r, 6, false),
        mat(color, { rough: 0.35, emissive: emissive ? new THREE.Color(color) : 0x000000, ei: emissive ? 0.45 : 1 }));
      return m;
    }
    function contourPoints(LN, u) {
      const pts = [];
      for (let i = 0; i <= 90; i++) {
        const f = Math.pow(10, LF0 + (LF1 - LF0) * i / 90), L = LC.splFromPhon(f, LN);
        if (L < LC.LP_MIN || L > LC.LP_MAX) continue;
        pts.push(new THREE.Vector3(xOf(f), heightAt(f, L, u) + 0.012, zOf(L)));
      }
      return pts;
    }
    let lockTube = null, lockFor = null;
    function buildLines(u) {
      clearGroup(gLines);
      for (let LN = 10; LN <= 100; LN += 10) {
        const pts = contourPoints(LN, u);
        if (pts.length > 2) gLines.add(tube(pts, LN === 40 ? C['ld-curve'] : (isDark() ? '#dfe4ff' : '#1e1b4b'), LN === 40 ? 0.016 : 0.009, false));
      }
      const tp = [];
      for (let i = 0; i <= 90; i++) { const f = Math.pow(10, LF0 + (LF1 - LF0) * i / 90), L = LC.threshold(f); tp.push(new THREE.Vector3(xOf(f), 0.012, zOf(L))); }
      gLines.add(tube(tp, C['ld-thr'], 0.02, true));
      lockFor = null;
    }
    function buildLock(u) {
      const d = B.data();
      const key = d.locked ? d.lockPhon.toFixed(2) + '|' + u.toFixed(3) : null;
      if (key === lockFor) return;
      if (lockTube) { gDyn.remove(lockTube); disposeObject(lockTube); lockTube = null; }
      lockFor = key;
      if (!d.locked) return;
      const pts = contourPoints(d.lockPhon, u);
      if (pts.length > 2) { lockTube = tube(pts, C['ld-lock'], 0.026, true); gDyn.add(lockTube); }
    }

    // ---------- 標籤 ----------
    let curLabel = null;
    function buildLabels() {
      clearGroup(gLabels);
      const m = C.muted;
      [[20, '20 Hz'], [100, '100 Hz'], [1000, '1 kHz'], [10000, '10 kHz']].forEach(function (q) {
        const s = label(q[1], m, 0.15, 600); s.position.set(xOf(q[0]), 0.05, zOf(LC.LP_MIN) + 0.28); gLabels.add(s);
      });
      [0, 40, 80, 120].forEach(function (L) {
        const s = label(L + ' dB', m, 0.14, 600); s.position.set(-XW / 2 - 0.45, 0.05, zOf(L)); gLabels.add(s);
      });
      const fx = label(T('頻率 →', 'frequency →'), m, 0.15, 700); fx.position.set(XW / 2 - 0.4, 0.05, zOf(LC.LP_MIN) + 0.55); gLabels.add(fx);
      const fz = label(T('聲壓級 →', 'level →'), m, 0.15, 700); fz.position.set(-XW / 2 - 0.55, 0.05, zOf(LC.LP_MAX) - 0.1); gLabels.add(fz);
      const thr = label(T('聽閾', 'threshold'), C['ld-thr'], 0.16, 700); thr.position.set(xOf(60), 0.18, zOf(LC.threshold(60)) + 0.1); gLabels.add(thr);
      const valley = label(T('3–4 kHz：最敏感', '3–4 kHz: keenest'), C.muted, 0.14, 600);
      valley.position.set(xOf(3300), 0.06, zOf(-8) + 0.12); gLabels.add(valley);
    }
    function placeLabelsHeight(u) {
      // 「100 phon」等高度標記：放在曲面右後角旁的立柱上
      gLabels.children.filter(function (o) { return o.userData.h; }).forEach(function (o) { gLabels.remove(o); disposeObject(o); });
      const marks = u < 0.5 ? [[20, '20 phon', hPhon(20)], [60, '60 phon', hPhon(60)], [100, '100 phon', hPhon(100)]] : [[16, '16 sone', hSone(16)], [64, '64 sone', hSone(64)], [128, '128 sone', hSone(128)]];
      marks.forEach(function (q) {
        const s = label(q[1], C.muted, 0.13, 600); s.userData.h = true;
        s.position.set(XW / 2 + 0.45, q[2], zOf(LC.LP_MAX)); gLabels.add(s);
      });
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, HMAX, 6), mat(C.muted, { opacity: 0.6 }));
      pole.position.set(XW / 2 + 0.08, HMAX / 2, zOf(LC.LP_MAX)); pole.userData.h = true; gLabels.add(pole);
    }

    // ---------- 目前的點 ----------
    let ball = null, glow = null, rod = null, dot = null;
    function buildDyn() {
      [ball, glow, rod, dot].forEach(function (o) { if (o) { gDyn.remove(o); disposeObject(o); } });
      ball = new THREE.Mesh(new THREE.SphereGeometry(0.07, 24, 16), mat(C['ld-pt'], { emissive: col('ld-pt'), ei: 0.5, rough: 0.25 }));
      ball.castShadow = true;
      glow = new THREE.Mesh(new THREE.SphereGeometry(0.15, 20, 14), new THREE.MeshBasicMaterial({ color: col('ld-pt'), transparent: true, opacity: 0.18, depthWrite: false }));
      rod = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 1, 8), mat(C['ld-pt'], { opacity: 0.7 }));
      dot = new THREE.Mesh(new THREE.CircleGeometry(0.06, 24), new THREE.MeshBasicMaterial({ color: col('ld-pt'), transparent: true, opacity: 0.55, depthWrite: false }));
      dot.rotation.x = -PI / 2;
      gDyn.add(ball, glow, rod, dot);
    }

    // ---------- 高度（phon ↔ sone，平滑過渡） ----------
    let mode = B.data().mode === 'sone' ? 'sone' : 'phon';
    let mix = mode === 'sone' ? 1 : 0, mixFrom = mix, mixTo = mix, mixT0 = 0;
    let linesFor = -1;
    function place() {
      const u = mix;
      const pos = surf.geometry.attributes.position;
      for (let k = 0; k < PH.length; k++) {
        const ph = PH[k];
        pos.array[k * 3 + 1] = ph < 0 ? 0 : (1 - u) * hPhon(ph) + u * hSone(LC.sone(ph));
      }
      pos.needsUpdate = true;
      surf.geometry.computeVertexNormals();
      surf.geometry.computeBoundingSphere();
      if (linesFor !== u) { buildLines(u); placeLabelsHeight(u); linesFor = u; }
      buildLock(u);
      placePoint(u);
    }
    function placePoint(u) {
      const d = B.data();
      const L = Math.max(LC.LP_MIN, Math.min(LC.LP_MAX, d.Lp));
      const x = xOf(d.f), z = zOf(L), h = heightAt(d.f, L, u);
      ball.position.set(x, h + 0.06, z); glow.position.copy(ball.position);
      rod.position.set(x, (h + 0.06) / 2, z); rod.scale.set(1, Math.max(0.001, h + 0.06), 1);
      dot.position.set(x, 0.004, z);
      if (curLabel) { gDyn.remove(curLabel); disposeObject(curLabel); }
      curLabel = label(d.audible ? B.fx(d.phon, 1) + ' phon · ' + B.soneTxt(d.sone) + ' sone' : T('聽不到', 'inaudible'), C['ld-pt'], 0.17, 800);
      curLabel.position.set(x, h + 0.32, z);
      gDyn.add(curLabel);
      hudText(d);
    }
    function hudText(d) {
      const ph = mode === 'phon';
      setHud('mode', ph ? T('高度：響度級（phon）', 'Height: loudness level (phon)') : T('高度：響度（sone，128 sone 以上壓平）', 'Height: loudness (sone; flattened above 128 sone)'));
      setHud('cur', B.fTxt(d.f) + '・' + B.fx(d.Lp, 1) + ' dB → ' + (d.audible ? B.fx(d.phon, 1) + ' phon、' + B.soneTxt(d.sone) + ' sone' : T('聽不到', 'inaudible')));
      setHud('slope', d.audible && d.slope != null ? T('這裡每加 1 dB，響度級加 ' + B.fx(d.slope, 2) + ' phon', 'Here each extra dB adds ' + B.fx(d.slope, 2) + ' phon') : '');
      setHud('tip', ph ? T('低頻那一邊曲面很陡、等高線擠在一起；3–4 kHz 那一道最高：耳朵最敏感。', 'The bass side is steep, with crowded contour lines; the ridge near 3–4 kHz stands highest: the ear is most sensitive there.')
        : T('每多 10 phon 響度加倍：大聲的角落陡然升起。', 'Every 10 phon doubles the loudness: the loud corner shoots up.'));
    }

    // ---------- 視角 ----------
    const fitC = new THREE.Vector3(0.1, HMAX * 0.42, -0.1);
    const VIEW_DIR = new THREE.Vector3(-0.42, 0.78, 1).normalize();
    /** 找最小的距離，讓整個場景（地面、標籤、曲面最高處）都在畫面內（留一點邊） */
    function fitDistance() {
      // 曲面是前低後高的斜坡：前緣（小聲）貼地、後緣（大聲）最高，所以前後用不同的高度
      const corners = [];
      [-XW / 2 - 0.9, XW / 2 + 0.9].forEach(function (x) {
        corners.push(new THREE.Vector3(x, 0, ZD / 2 + 0.7), new THREE.Vector3(x, 0.35, ZD / 2 + 0.7),
          new THREE.Vector3(x, 0, -ZD / 2 - 0.1), new THREE.Vector3(x, HMAX * 1.15, -ZD / 2 - 0.1));
      });
      const v = new THREE.Vector3();
      const fits = function (d) {
        camera.position.copy(fitC).addScaledVector(VIEW_DIR, d);
        camera.lookAt(fitC);
        camera.updateMatrixWorld(); camera.updateProjectionMatrix();
        return corners.every(function (c) { v.copy(c).project(camera); return Math.abs(v.x) <= 0.97 && Math.abs(v.y) <= 0.93 && v.z < 1; });
      };
      let lo = 2, hi = 60;
      for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (fits(m)) hi = m; else lo = m; }
      return hi;
    }
    function resetCamera() {
      camera.near = 0.02; camera.far = 400; camera.updateProjectionMatrix();
      const d = fitDistance();
      controls.target.copy(fitC);
      camera.position.copy(fitC).addScaledVector(VIEW_DIR, d);
      controls.minDistance = 1.2; controls.maxDistance = d * 4;
      camera.near = 0.02; camera.far = d * 20 + 20;
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
      if (mix !== mixTo) {
        const reduce = D.reducedMotion && D.reducedMotion();
        const u = reduce ? 1 : Math.min(1, (performance.now() - mixT0) / (MORPH * 1000));
        const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;   // 介面過渡（只改畫法，不改任何物理量）
        const nm = u >= 1 ? mixTo : mixFrom + (mixTo - mixFrom) * e;
        // 過渡中只移動曲面與點；等高線在過渡結束時重建（每格都重建太耗）
        mix = nm;
        if (mix === mixTo) place();
        else {
          const pos = surf.geometry.attributes.position;
          for (let k = 0; k < PH.length; k++) { const ph = PH[k]; pos.array[k * 3 + 1] = ph < 0 ? 0 : (1 - mix) * hPhon(ph) + mix * hSone(LC.sone(ph)); }
          pos.needsUpdate = true; surf.geometry.computeVertexNormals();
          gLines.visible = false; if (lockTube) lockTube.visible = false;
          placePoint(mix);
        }
        if (mix === mixTo) gLines.visible = true;
        more = true;
      }
      renderer.render(scene, camera);
      if (more) requestRender();
    }
    function requestRender() {
      if (raf || !api.active) return;
      raf = requestAnimationFrame(function () { raf = 0; renderNow(); });
    }
    let lastAspect = 0;
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
    canvas.addEventListener('keydown', function (ev) {
      const step = (ev.shiftKey ? 15 : 5) * PI / 180;
      const off = camera.position.clone().sub(controls.target);
      const sph = new THREE.Spherical().setFromVector3(off);
      let used = true;
      if (ev.key === 'ArrowLeft') sph.theta -= step;
      else if (ev.key === 'ArrowRight') sph.theta += step;
      else if (ev.key === 'ArrowUp') sph.phi = Math.max(0.05, sph.phi - step);
      else if (ev.key === 'ArrowDown') sph.phi = Math.min(PI * 0.49, sph.phi + step);
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
      /** 點移動、鎖定改變時：只更新點與鎖定的曲線（曲面不變） */
      rebuild: function () { if (mix === mixTo) { buildLock(mix); placePoint(mix); } requestRender(); },
      setMode: function (m) {
        m = m === 'sone' ? 'sone' : 'phon';
        if (m === mode) return;
        mode = m; mixFrom = mix; mixTo = m === 'sone' ? 1 : 0; mixT0 = performance.now();
        hudText(B.data());
        requestRender();
      },
      onTheme: function () {
        C = B.colors();
        buildEnv();
        Object.keys(hudLast).forEach(function (k) { delete hudLast[k]; });
        buildSurface(); buildLabels(); buildDyn(); linesFor = -1; lockFor = null; lockTube = null; curLabel = null;
        place();
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
    buildSurface();
    buildLabels();
    buildDyn();
    place();
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

  window.Loudness3D = { create: create };
})();
