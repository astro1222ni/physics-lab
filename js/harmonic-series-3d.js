/*
 * harmonic-series-3d.js — 「泛音列與音色」的 3D 檢視（three.js）
 *
 * 由 js/harmonic-series.js 在使用者按「3D 立體」時才載入（three.js 也是那時才以 import() 載入）；切回 2D 時整個釋放。
 * 用法：window.Harm3D.create({ THREE, OrbitControls }, 容器, bridge) → { active, update, onTheme, resetCamera, face, dispose }
 *
 * 場景座標（z 朝上）：
 *   x = 時間（2 個週期，t → x = 4t），y = 泛音次數（第 k 個在 y = 0.7k；合成波形在最前面 y = −0.9），z = 振幅（× 1.2）。
 *   每個有聲音的泛音是一條正弦管 z = c·sin(2πkt + φ)；最前面粗的是它們的和（合成波形）。
 *   x 的起點後方立著「頻譜牆」：第 k 根長條高 |a_k|（和正弦波的振幅同一個比例）。
 * 用正交投影（OrthographicCamera）：
 *   正面看（沿 +y）＝所有正弦波和合成波形疊在一起的時域圖；側面看（沿 −x）＝每條正弦波縮成高 ±|a_k| 的直線，和牆上的頻譜長條對齊。
 * 和 2D 畫面用同一個核心算出來的分量（bridge.shown().comp），加泛音途中只畫已經加入的。
 */
(function () {
  'use strict';
  const FONT = 'system-ui, -apple-system, "Segoe UI", "Noto Sans TC", "PingFang TC", sans-serif';
  const RES = 3;
  const PI = Math.PI, DEG = PI / 180, TAU = 2 * PI;
  const XS = 4;          // 每個週期在 x 方向的長度
  const DY = 0.7;        // 相鄰泛音的間距
  const SZ = 1.2;        // 振幅 1 的高度
  const Y_SUM = -0.9;    // 合成波形的位置
  const XW = -0.9;       // 頻譜牆的位置
  const Y_LO = -1.6, Y_HI = 16 * DY + 0.7;
  const X_HI = 2 * XS + 0.6;

  function create(lib, host, B) {
    const THREE = lib.THREE;
    const HC = B.HC, T = B.T, D = B.D, state = B.state;
    const alpha = D.alpha;
    let C = B.colors();
    const col = function (k) { return new THREE.Color(C[k] || k); };
    const isDark = function () { return !!D.dark; };
    const yOf = function (k) { return k * DY; };

    // ---------- 畫布與資訊列 ----------
    const wrap = document.createElement('div');
    wrap.className = 't3-wrap';
    const canvas = document.createElement('canvas');
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', T('泛音的 3D 立體檢視：每個泛音的正弦波沿著泛音次數排開，最前面是合成波形，後方的牆上是頻譜。從正面看是波形（時域），從側面看是頻譜（頻域）。拖曳旋轉，滾輪或雙指縮放，方向鍵也可以轉動。',
      '3D view of the harmonics: each harmonic’s sine wave is laid out by harmonic number, with the combined waveform in front and the spectrum on the wall behind. From the front you see the waveform (time domain), from the side the spectrum (frequency domain). Drag to rotate, scroll or pinch to zoom; the arrow keys also rotate.'));
    wrap.appendChild(canvas);
    const hud = document.createElement('div');
    hud.className = 't3-hud';
    hud.setAttribute('aria-hidden', 'true');
    hud.innerHTML = '<div class="tl"><span data-k="eq"></span><span class="m" data-k="p"></span></div><div class="bl"><span class="m" data-k="tip"></span></div>';
    let tipGone = false;
    function hideTip() { if (!tipGone) { tipGone = true; setHud('tip', ''); } }
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
    let cw = 300, ch = 200, narrow = false;
    let viewH = 12;   // 正交投影在 zoom = 1 時看到的高度（場景單位）
    const camera = new THREE.OrthographicCamera(-8, 8, 6, -6, 0.1, 400);
    camera.up.set(0, 0, 1);
    const CAM_DIST = 60;
    function setFrustum() {
      const a = cw / Math.max(1, ch);
      camera.left = -viewH * a / 2; camera.right = viewH * a / 2;
      camera.top = viewH / 2; camera.bottom = -viewH / 2;
      camera.updateProjectionMatrix();
    }

    // ---------- 視角控制 ----------
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.rotateSpeed = 0.85;
    controls.screenSpacePanning = true;
    controls.minZoom = 0.2;
    controls.maxZoom = 8;
    let lastZoom = 1;
    controls.addEventListener('start', function () { hideTip(); });

    // ---------- 光線與環境反光 ----------
    const hemi = new THREE.HemisphereLight(0xffffff, 0x3a4250, 0.9);
    hemi.position.set(0, 0, 1);
    scene.add(hemi);
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.8);
    keyLight.position.set(6, -10, 14);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
    fillLight.position.set(-8, 6, 3);
    scene.add(fillLight);
    const pmrem = new THREE.PMREMGenerator(renderer);
    let envRT = null;
    function buildEnv() {
      if (envRT) { envRT.dispose(); envRT = null; }
      const s = new THREE.Scene();
      const g = new THREE.SphereGeometry(10, 32, 16);
      g.rotateX(PI / 2);
      const pos = g.attributes.position, cols = new Float32Array(pos.count * 3);
      const top = new THREE.Color(isDark() ? 0x5d6a80 : 0xffffff), bot = new THREE.Color(isDark() ? 0x0a0d12 : 0x7d8794);
      const c = new THREE.Color();
      for (let i = 0; i < pos.count; i++) {
        const u = Math.max(0, Math.min(1, (pos.getZ(i) / 10 + 1) / 2));
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
    function segs(pairs, color, opacity) {
      const pts = [];
      pairs.forEach(function (p) { pts.push(p[0], p[1]); });
      const l = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: opacity, depthWrite: false }));
      l.renderOrder = 2;
      return l;
    }
    function tubeAlong(fn, t0, t1, n, r, color, opt) {
      opt = opt || {};
      class Path extends THREE.Curve {
        getPoint(u, target) { const p = fn(t0 + (t1 - t0) * u); return (target || new THREE.Vector3()).copy(p); }
      }
      const geo = new THREE.TubeGeometry(new Path(), n, r, opt.radial || 8, false);
      const mat = new THREE.MeshPhysicalMaterial({ color: color, roughness: 0.32, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.25,
        emissive: color, emissiveIntensity: opt.emissive == null ? 0.12 : opt.emissive, transparent: opt.opacity != null, opacity: opt.opacity == null ? 1 : opt.opacity });
      return new THREE.Mesh(geo, mat);
    }
    // 文字標籤（Sprite，固定像素大小）
    function label(text, color, opt) {
      opt = opt || {};
      const px = (opt.size || (narrow ? 11.5 : 13)) * RES;
      const font = (opt.italic ? 'italic ' : '') + (opt.weight || 700) + ' ' + px + 'px ' + FONT;
      const c = document.createElement('canvas');
      let g = c.getContext('2d');
      g.font = font;
      const w = g.measureText(text).width;
      const padX = 5 * RES, padY = 3 * RES;
      c.width = Math.ceil(w + 2 * padX);
      c.height = Math.ceil(px * 1.35 + 2 * padY);
      g = c.getContext('2d');
      g.font = font;
      g.textBaseline = 'middle'; g.textAlign = 'left'; g.lineJoin = 'round';
      if (opt.pill) {
        const h = c.height - 2, r = h / 2;
        g.beginPath();
        g.moveTo(r + 1, 1); g.lineTo(c.width - r - 1, 1); g.arc(c.width - r - 1, r + 1, r, -PI / 2, PI / 2); g.lineTo(r + 1, h + 1); g.arc(r + 1, r + 1, r, PI / 2, PI * 1.5);
        g.fillStyle = alpha(C['canvas-bg'], 0.88); g.fill();
        g.strokeStyle = alpha(color, 0.5); g.lineWidth = RES; g.stroke();
      } else {
        g.lineWidth = 4 * RES; g.strokeStyle = alpha(C['canvas-bg'], 0.92);
        g.strokeText(text, padX, c.height / 2);
      }
      g.fillStyle = color;
      g.fillText(text, padX, c.height / 2);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false }));
      sp.userData.lw = c.width / RES; sp.userData.lh = c.height / RES; sp.userData.isLabel = true;
      sp.renderOrder = 30;
      fitLabel(sp);
      const dir = opt.dir || [0, 0];
      const L = Math.hypot(dir[0], dir[1]);
      if (L > 0) {
        const dx = dir[0] / L, dy = dir[1] / L, gap = opt.gap == null ? 6 : opt.gap;
        sp.center.set(0.5 - dx * (sp.userData.lw / 2 + gap) / sp.userData.lw, 0.5 - dy * (sp.userData.lh / 2 + gap) / sp.userData.lh);
      }
      if (opt.at) sp.position.copy(opt.at);
      return sp;
    }
    /** 正交投影、不隨距離縮放的 Sprite：場景單位 = 像素 × 可見高度 ÷（zoom × 畫布高度） */
    function fitLabel(sp) {
      const k = (camera.top - camera.bottom) / (Math.max(0.01, camera.zoom) * Math.max(1, ch));
      sp.scale.set(sp.userData.lw * k, sp.userData.lh * k, 1);
    }
    function sizeLabels() { scene.traverse(function (o) { if (o.userData && o.userData.isLabel) fitLabel(o); }); }

    // ---------- 場景範圍 ----------
    const box = { zTop: 1.6, zLo: -1.9 };
    const fitC = new THREE.Vector3();
    function computeBox() {
      const r = B.shown();
      let m = 0.3;
      r.comp.forEach(function (x) { m = Math.max(m, Math.abs(x.c)); });
      m = Math.max(m, r.peak || 0);
      for (let k = 1; k <= HC.KMAX; k++) m = Math.max(m, Math.min(1, Math.abs(state.a[k - 1] || 0)));
      const zTop = SZ * Math.ceil(m * 4) / 4 + 0.25;
      const changed = Math.abs(zTop - box.zTop) > 1e-9;
      box.zTop = zTop; box.zLo = -zTop - 0.2;
      fitC.set((XW + X_HI) / 2, (Y_LO + Y_HI) / 2, (box.zLo + box.zTop + 0.35) / 2);
      return changed;
    }

    // ---------- 物件 ----------
    const gWalls = new THREE.Group(), gTicksT = new THREE.Group(), gTicksK = new THREE.Group(), gBars = new THREE.Group(), gSum = new THREE.Group(), gComp = new THREE.Group();
    scene.add(gWalls, gTicksT, gTicksK, gBars, gSum, gComp);
    function wallMat(tint, op) {
      const base = new THREE.Color(C['canvas-bg']);
      base.lerp(new THREE.Color(tint), isDark() ? 0.08 : 0.1);
      if (!isDark()) base.lerp(new THREE.Color(C.text), 0.03);
      return new THREE.MeshStandardMaterial({ color: base, roughness: 0.92, metalness: 0, transparent: true, opacity: op == null ? (isDark() ? 0.72 : 0.8) : op, side: THREE.DoubleSide, depthWrite: false });
    }
    function buildWalls() {
      clearGroup(gWalls); clearGroup(gTicksT); clearGroup(gTicksK);
      const zLo = box.zLo, zTop = box.zTop;
      // 地面（XY 平面）
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(X_HI - XW, Y_HI - Y_LO), wallMat(C.accent));
      floor.position.set((XW + X_HI) / 2, (Y_LO + Y_HI) / 2, zLo);
      // 頻譜牆（YZ 平面，x = XW）
      const wg = new THREE.PlaneGeometry(Y_HI - Y_LO, zTop + 0.35 - zLo);
      wg.rotateX(PI / 2); wg.rotateZ(PI / 2);
      const wall = new THREE.Mesh(wg, wallMat(C['hs-cent']));
      wall.position.set(XW - 0.02, (Y_LO + Y_HI) / 2, (zTop + 0.35 + zLo) / 2);
      gWalls.add(floor, wall);
      const ink = col('text');
      const minor = [], major = [];
      // 地面：每 T/2 一條（縱向）、每個泛音一條（橫向）
      for (let i = 0; i <= 4; i++) (i % 2 ? minor : major).push([new THREE.Vector3(i * XS / 2, Y_LO, zLo + 0.005), new THREE.Vector3(i * XS / 2, Y_HI, zLo + 0.005)]);
      for (let k = 1; k <= 16; k++) minor.push([new THREE.Vector3(XW, yOf(k), zLo + 0.005), new THREE.Vector3(X_HI, yOf(k), zLo + 0.005)]);
      minor.push([new THREE.Vector3(XW, Y_SUM, zLo + 0.005), new THREE.Vector3(X_HI, Y_SUM, zLo + 0.005)]);
      // 牆：振幅 0、±0.5、±1
      [-1, -0.5, 0.5, 1].forEach(function (v) { if (Math.abs(v) * SZ < zTop) minor.push([new THREE.Vector3(XW, Y_LO, v * SZ), new THREE.Vector3(XW, Y_HI, v * SZ)]); });
      major.push([new THREE.Vector3(XW, Y_LO, 0), new THREE.Vector3(XW, Y_HI, 0)]);
      // 地面與牆的外框
      const zW = zTop + 0.35;
      [[XW, Y_LO, zLo, X_HI, Y_LO, zLo], [X_HI, Y_LO, zLo, X_HI, Y_HI, zLo], [X_HI, Y_HI, zLo, XW, Y_HI, zLo], [XW, Y_HI, zLo, XW, Y_LO, zLo],
        [XW, Y_LO, zLo, XW, Y_LO, zW], [XW, Y_LO, zW, XW, Y_HI, zW], [XW, Y_HI, zW, XW, Y_HI, zLo]].forEach(function (q) {
        major.push([new THREE.Vector3(q[0], q[1], q[2]), new THREE.Vector3(q[3], q[4], q[5])]);
      });
      gWalls.add(segs(minor, ink, isDark() ? 0.08 : 0.09), segs(major, ink, 0.22));
      // 每一列的振幅 0 參考線
      const zero = [];
      for (let k = 1; k <= 16; k++) zero.push([new THREE.Vector3(0, yOf(k), 0), new THREE.Vector3(2 * XS, yOf(k), 0)]);
      zero.push([new THREE.Vector3(0, Y_SUM, 0), new THREE.Vector3(2 * XS, Y_SUM, 0)]);
      gWalls.add(segs(zero, ink, isDark() ? 0.12 : 0.1));
      // 時間刻度（地面前緣）
      const sz = narrow ? 10.5 : 11.5;
      [['0', 0], ['T', XS], ['2T', 2 * XS]].forEach(function (p) {
        gTicksT.add(label(p[0], C.muted, { at: new THREE.Vector3(p[1], Y_LO, zLo), dir: [0, -1], size: sz, weight: 600 }));
      });
      gTicksT.add(label(T('時間 →', 'time →'), C.text, { at: new THREE.Vector3(2 * XS + 0.3, Y_LO, zLo), dir: [1, -0.4], size: sz, weight: 600 }));
      // 泛音次數刻度（地面右緣）
      for (let k = 1; k <= 16; k++) {
        if (narrow && !(k === 1 || k % 4 === 0)) continue;
        gTicksK.add(label(String(k), C.muted, { at: new THREE.Vector3(X_HI, yOf(k), zLo), dir: [1, -1], size: sz, weight: 600 }));
      }
      // 手機畫面窄、標籤是固定像素大小：標題縮短，場景才不會被擠小
      gTicksK.add(label(narrow ? 'k →' : T('泛音次數 k →', 'harmonic k →'), C.text, { at: new THREE.Vector3(X_HI, Y_HI, zLo), dir: [1, 0.3], size: sz, weight: 600 }));
      // 名稱
      gTicksK.add(label(narrow ? T('頻譜', 'Spectrum') : T('頻譜（頻域）', 'Spectrum (frequency)'), C['hs-cent'], { at: new THREE.Vector3(XW, (Y_LO + Y_HI) / 2, zTop + 0.35), dir: [0, 1], pill: true, size: narrow ? 10.5 : 12 }));
      gWalls.add(label(narrow ? T('合成波形', 'Sum') : T('合成波形（時域）', 'Waveform (time)'), C['hs-wave'], { at: new THREE.Vector3(2 * XS, Y_SUM, zTop), dir: [-0.2, 1], pill: true, size: narrow ? 10.5 : 12 }));
    }
    function buildBars() {
      clearGroup(gBars);
      const upto = B.shownN();
      const w = DY * 0.62, d = 0.14;
      for (let k = 1; k <= 16; k++) {
        const m = Math.min(1, Math.abs(state.a[k - 1] || 0));
        if (m < HC.EPS) continue;
        const inN = k <= state.N, shown = inN && k <= upto;
        const h = m * SZ;
        const color = new THREE.Color(B.harmColor(k));
        const mat = new THREE.MeshPhysicalMaterial({ color: color, roughness: 0.4, metalness: 0, clearcoat: 0.5, emissive: color, emissiveIntensity: k === state.sel ? 0.35 : 0.12,
          transparent: !shown, opacity: shown ? 1 : (inN ? 0.3 : 0.15), depthWrite: shown });
        const bar = new THREE.Mesh(new THREE.BoxGeometry(d, w, h), mat);
        bar.position.set(XW + d / 2 + 0.01, yOf(k), h / 2);
        gBars.add(bar);
      }
    }
    // 各泛音的正弦管：依 (k, c, p) 快取，拖曳一根長條時只重建那一根
    const compCache = new Map();
    function buildComps() {
      const r = B.shown();
      const need = new Map();
      r.comp.forEach(function (x) { need.set(x.k + '|' + x.c.toFixed(5) + '|' + x.p.toFixed(5) + '|' + (narrow ? 1 : 0), x); });
      compCache.forEach(function (mesh, key) { if (!need.has(key)) { gComp.remove(mesh); disposeObject(mesh); compCache.delete(key); } });
      need.forEach(function (x, key) {
        let mesh = compCache.get(key);
        if (!mesh) {
          const n = Math.max(120, Math.min(900, 2 * x.k * 28));
          mesh = tubeAlong(function (t) { return new THREE.Vector3(t * XS, yOf(x.k), SZ * x.c * Math.sin(TAU * x.k * t + x.p)); }, 0, 2, n, narrow ? 0.04 : 0.032, new THREE.Color(B.harmColor(x.k)), { radial: 6 });
          mesh.userData.k = x.k;
          compCache.set(key, mesh);
          gComp.add(mesh);
        }
        mesh.material.emissiveIntensity = x.k === state.sel ? 0.45 : 0.12;
      });
    }
    function buildSum() {
      clearGroup(gSum);
      const r = B.shown();
      const comp = r.comp;
      const kmax = comp.reduce(function (m, x) { return Math.max(m, x.k); }, 1);
      const n = Math.max(240, Math.min(1600, 2 * kmax * 40));
      const color = col('hs-wave');
      if (comp.length) gSum.add(tubeAlong(function (t) { return new THREE.Vector3(t * XS, Y_SUM, SZ * HC.waveAt(comp, t)); }, 0, 2, n, narrow ? 0.07 : 0.06, color, { radial: 10, emissive: 0.18 }));
      else gSum.add(tubeAlong(function (t) { return new THREE.Vector3(t * XS, Y_SUM, 0); }, 0, 2, 4, 0.03, color, { opacity: 0.4 }));
      // 選取的泛音：在起點標名字
      const k = state.sel;
      if (comp.some(function (x) { return x.k === k; })) {
        gSum.add(label(T('第 ' + k + ' 個', 'no. ' + k), B.harmColor(k), { at: new THREE.Vector3(0, yOf(k), 0), dir: [-1, 0.6], size: narrow ? 10.5 : 11.5, weight: 700 }));
      }
    }
    function updateHud() {
      const r = B.shown();
      setHud('eq', T('基頻 ', 'f0 = ') + B.hz(state.f0) + ' Hz' + (r.cr != null ? T('・頻譜重心 ', ' · centroid ') + B.num(r.cr, 2) + T(' 倍', '×') : ''));
      setHud('p', state.build ? T('正在加入第 ' + state.build.upto + ' 個泛音', 'Adding harmonic ' + state.build.upto) : '');
      setHud('tip', tipGone || narrow ? '' : T('拖曳旋轉、滾輪或雙指縮放；用上面的按鈕從正面或側面看', 'Drag to rotate, scroll or pinch to zoom; use the buttons above to look from the front or the side'));
    }
    let builtNarrow = null;
    function rebuildAll() {
      if (builtNarrow !== narrow) { compCache.forEach(function (m) { gComp.remove(m); disposeObject(m); }); compCache.clear(); builtNarrow = narrow; }
      // 場景盒子改變（振幅變大或變小）時：保持方向與使用者縮放的比例，重新裝滿畫面
      const dir0 = camera.position.clone().sub(controls.target).normalize();
      const rel = lastAspect ? camera.zoom / fitZoom(dir0) : 1;
      const changed = computeBox();
      if (changed || !gWalls.children.length) {
        buildWalls();
        if (changed && !anim && lastAspect) {
          controls.target.copy(fitC);
          camera.position.copy(fitC).addScaledVector(dir0, CAM_DIST);
          camera.zoom = Math.max(controls.minZoom, Math.min(controls.maxZoom, rel * fitZoom(dir0)));
          camera.updateProjectionMatrix();
          controls.update();
          sizeLabels();
        }
      }
      buildBars();
      buildComps();
      buildSum();
      updateHud();
      return changed;
    }

    // ---------- 視角 ----------
    function baseViewH() { return 10; }
    function defaultDir() { return new THREE.Vector3(narrow ? 0.62 : 0.55, -1, narrow ? 0.85 : 0.72).normalize(); }
    /**
     * 從 dir 方向看向 fitC 時，場景盒子的 8 個角與看得到的標籤剛好都裝進畫面的 zoom。
     * 標籤是固定像素大小，所以逐一要求「投影位置 × 每單位像素 + 標籤伸出的像素 ≤ 半個畫面 − 留白」，
     * 取所有限制裡最小的「每單位像素」s，再換成 zoom = s × viewH ÷ 畫布高度。
     */
    function fitZoom(dir) {
      const d = dir.clone().normalize();
      const fwd = d.clone().negate();
      const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 0, 1));
      if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
      right.normalize();
      const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
      const hw = cw / 2, hh = ch / 2;
      const padS = 8, padT = 34, padB = (tipGone || narrow) ? 8 : 30;   // 上方留給資訊列，下方留給提示
      let s = Infinity;
      function fit(p, l, r, b, t) {
        const v = p.clone().sub(fitC), u = v.dot(right), w = v.dot(up);
        if (u > 1e-6) s = Math.min(s, Math.max(4, hw - padS - r) / u);
        if (u < -1e-6) s = Math.min(s, Math.max(4, hw - padS - l) / -u);
        if (w > 1e-6) s = Math.min(s, Math.max(4, hh - padT - t) / w);
        if (w < -1e-6) s = Math.min(s, Math.max(4, hh - padB - b) / -w);
      }
      const zW = box.zTop + 0.35;
      [XW, X_HI].forEach(function (x) { [Y_LO, Y_HI].forEach(function (y) { [box.zLo, zW].forEach(function (z) {
        fit(new THREE.Vector3(x, y, z), 0, 0, 0, 0);
      }); }); });
      const groups = [gWalls, gSum];
      if (Math.abs(d.y) < 0.95) groups.push(gTicksK);
      if (Math.abs(d.x) < 0.95) groups.push(gTicksT);
      groups.forEach(function (g) {
        g.children.forEach(function (o) {
          if (!o.userData || !o.userData.isLabel) return;
          const lw = o.userData.lw, lh = o.userData.lh;
          fit(o.position, o.center.x * lw, (1 - o.center.x) * lw, o.center.y * lh, (1 - o.center.y) * lh);
        });
      });
      if (!isFinite(s)) return 1;
      return Math.max(controls.minZoom, Math.min(controls.maxZoom, s * viewH / Math.max(1, ch)));
    }
    let anim = null;
    function goTo(dir, zoom, target) {
      const from = { dir: camera.position.clone().sub(controls.target).normalize(), zoom: camera.zoom, target: controls.target.clone() };
      if (B.reducedMotion()) { place(dir, zoom, target); return; }
      anim = { from: from, to: { dir: dir.clone().normalize(), zoom: zoom, target: target.clone() }, t0: performance.now(), dur: 650 };
      controls.enabled = false;
      requestRender();
    }
    function place(dir, zoom, target) {
      controls.target.copy(target);
      camera.position.copy(target).addScaledVector(dir.clone().normalize(), CAM_DIST);
      camera.zoom = zoom;
      camera.updateProjectionMatrix();
      controls.update();
      sizeLabels();
      lastZoom = camera.zoom;
      requestRender();
    }
    function stepAnim(now) {
      const a = anim;
      let u = Math.min(1, (now - a.t0) / a.dur);
      const e = 1 - Math.pow(1 - u, 3);
      // 方向：球面內插
      const d0 = a.from.dir, d1 = a.to.dir;
      const om = Math.acos(Math.max(-1, Math.min(1, d0.dot(d1))));
      let dir;
      if (om < 1e-4) dir = d1.clone();
      else dir = d0.clone().multiplyScalar(Math.sin((1 - e) * om) / Math.sin(om)).add(d1.clone().multiplyScalar(Math.sin(e * om) / Math.sin(om)));
      const zoom = a.from.zoom * Math.pow(a.to.zoom / a.from.zoom, e);
      const target = a.from.target.clone().lerp(a.to.target, e);
      controls.target.copy(target);
      camera.position.copy(target).addScaledVector(dir.normalize(), CAM_DIST);
      camera.zoom = zoom;
      camera.updateProjectionMatrix();
      sizeLabels();
      lastZoom = zoom;
      if (u >= 1) { anim = null; controls.enabled = true; controls.update(); }
    }
    function face(which) {
      hideTip();
      // 稍微偏一點點，避免和「上方」向量平行；實際上仍是正面／側面
      const dir = which === 'side' ? new THREE.Vector3(1, 0, 0.0001) : new THREE.Vector3(0, -1, 0.0001);
      goTo(dir, fitZoom(dir), fitC);
    }
    function resetCamera() {
      viewH = baseViewH();
      setFrustum();
      anim = null; controls.enabled = true;
      place(defaultDir(), fitZoom(defaultDir()), fitC);
    }

    // ---------- 繪製 ----------
    let raf = 0, dirty = false;
    function renderNow() {
      if (!api.active || document.hidden) return;
      const want = Math.min(window.devicePixelRatio || 1, 2);
      if (renderer.getPixelRatio() !== want) { renderer.setPixelRatio(want); resize3(); return; }
      if (dirty) { dirty = false; rebuildAll(); }
      let moving = false;
      if (anim) { stepAnim(performance.now()); moving = true; }
      else moving = controls.update();
      if (Math.abs(camera.zoom - lastZoom) > 1e-6) { lastZoom = camera.zoom; sizeLabels(); }
      // 沿著某一軸看過去時，沿那一軸排開的刻度會疊在一起：先藏起來
      const dir = camera.position.clone().sub(controls.target).normalize();
      gTicksK.visible = Math.abs(dir.y) < 0.95;
      gTicksT.visible = Math.abs(dir.x) < 0.95;
      renderer.render(scene, camera);
      if (moving) requestRender();
    }
    function requestRender() {
      if (raf || !api.active) return;
      raf = requestAnimationFrame(function () { raf = 0; renderNow(); });
    }
    let lastAspect = 0;
    function resize3() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      cw = w; ch = h;
      renderer.setSize(w, h, false);
      const nar = w < 560;
      if (nar !== narrow) { narrow = nar; buildWalls(); dirty = true; }
      const asp = w / h;
      if (Math.abs(asp - lastAspect) > 1e-3) {
        // 畫面比例改變（例如手機轉向）：保持方向，重新裝滿
        const refit = lastAspect && !anim;
        lastAspect = asp;
        viewH = baseViewH();
        if (refit) {
          const d = camera.position.clone().sub(controls.target).normalize();
          camera.zoom = fitZoom(d);
          camera.updateProjectionMatrix();
        }
      }
      setFrustum();
      sizeLabels();
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
    // 鍵盤：方向鍵轉動視角（z 朝上）
    canvas.addEventListener('keydown', function (ev) {
      const step = (ev.shiftKey ? 15 : 5) * DEG;
      const off = camera.position.clone().sub(controls.target);
      const sph = new THREE.Spherical().setFromVector3(new THREE.Vector3(off.x, off.z, -off.y));
      let used = true;
      if (ev.key === 'ArrowLeft') sph.theta -= step;
      else if (ev.key === 'ArrowRight') sph.theta += step;
      else if (ev.key === 'ArrowUp') sph.phi = Math.max(0.05, sph.phi - step);
      else if (ev.key === 'ArrowDown') sph.phi = Math.min(PI - 0.05, sph.phi + step);
      else used = false;
      if (!used) return;
      ev.preventDefault();
      hideTip();
      anim = null; controls.enabled = true;
      const v = new THREE.Vector3().setFromSpherical(sph);
      camera.position.copy(controls.target).add(new THREE.Vector3(v.x, -v.z, v.y));
      controls.update();
      requestRender();
    });

    const api = {
      active: true,
      update: function () { dirty = true; requestRender(); },
      onTheme: function () {
        C = B.colors();
        buildEnv();
        Object.keys(hudLast).forEach(function (k) { delete hudLast[k]; });
        compCache.forEach(function (m) { gComp.remove(m); disposeObject(m); });
        compCache.clear();
        buildWalls();
        dirty = true;
        requestRender();
      },
      resetCamera: function () { resetCamera(); },
      face: function (which) { face(which); },
      dispose: function () {
        api.active = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize3);
        document.removeEventListener('visibilitychange', onVisible);
        controls.dispose();
        compCache.clear();
        disposeObject(scene);
        if (envRT) envRT.dispose();
        pmrem.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        wrap.remove();
      }
    };

    buildEnv();
    const w0 = canvas.clientWidth, h0 = canvas.clientHeight;
    if (w0 && h0) {
      narrow = w0 < 560;
      cw = w0; ch = h0;
      renderer.setSize(cw, ch, false);
      lastAspect = cw / ch;
    }
    computeBox();
    viewH = baseViewH();
    setFrustum();
    buildWalls();
    rebuildAll();
    resetCamera();
    return api;
  }

  window.Harm3D = { create: create };
})();
