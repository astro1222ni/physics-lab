/*
 * missing-fundamental-3d.js — 「缺基頻」的 3D 檢視：頻譜瀑布圖＋週期牆（three.js）
 *
 * 由 js/missing-fundamental.js 在使用者按「3D 瀑布圖」時才載入（three.js 也是那時才以 import() 載入）；切回 2D 時整個釋放。
 * 用法：window.Missing3D.create({ THREE, OrbitControls }, 容器, bridge) → { active, update, onTheme, resetCamera, dispose }
 *
 * 場景座標（z 朝上）：
 *   x = 頻率（0 → fmax 對到 0 → XW），y = 第幾次設定（最前面 y = 0 是現在，每舊一次往後 DY），z = 振幅（濾波後，× ZS）。
 *   每一排是一次設定的頻譜（和 2D 用同一個核心算出來的 comps）：喇叭放出的成分是實心柱；拿掉或被濾掉的是玻璃框（原本的高度）；
 *   粉紅色細柱站在那一次「聽到的音高」上，各排的粉紅柱用地上的線連起來——真正的柱子來來去去，這條線卻常常筆直不動。
 *   最後方立著「週期牆」：目前的波形（0–20 ms 沿 x 展開）與週期色帶（每條寬 = 1/音高）。
 * 只在需要時重畫（拖曳視角、設定改變、改變大小）；切到背景分頁不畫。
 */
(function () {
  'use strict';
  const FONT = 'system-ui, -apple-system, "Segoe UI", "Noto Sans TC", "PingFang TC", sans-serif';
  const RES = 3;
  const PI = Math.PI, DEG = PI / 180;
  const XW = 12;      // 頻率軸長度
  const DY = 0.8;     // 每一排的間距
  const ZS = 2.6;     // 振幅 1 的高度
  const ROWS = 12;
  const YB = ROWS * DY + 0.5;   // 週期牆的位置
  const FOV = 34;

  function create(lib, host, B) {
    const THREE = lib.THREE;
    const MC = B.MC, T = B.T, D = B.D;
    const alpha = D.alpha;
    let C = B.colors();
    const isDark = function () { return !!D.dark; };
    const col = function (k) { return new THREE.Color(C[k] || k); };

    // ---------- 畫布與資訊列 ----------
    const wrap = document.createElement('div');
    wrap.className = 'm3-wrap';
    const canvas = document.createElement('canvas');
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', T('缺基頻的 3D 瀑布圖：橫向是頻率，每改一次設定就往前多一排頻譜，舊的往後退；實心柱是喇叭放出的成分，玻璃框是拿掉的，粉紅色細柱是聽到的音高。後方的牆是目前的波形與週期色帶。拖曳旋轉、滾輪或雙指縮放，方向鍵也可以轉動。',
      '3D waterfall of the missing fundamental: frequency runs across, every change adds a new spectrum row at the front and older ones move back; solid bars come out of the speaker, glass outlines were removed, the thin pink pillar is the pitch heard. The wall at the back shows the current waveform and its period bands. Drag to rotate, scroll or pinch to zoom; the arrow keys also rotate.'));
    wrap.appendChild(canvas);
    const hud = document.createElement('div');
    hud.className = 'm3-hud';
    hud.setAttribute('aria-hidden', 'true');
    hud.innerHTML = '<div class="tl"><span class="p" data-k="p"></span><span class="m" data-k="s"></span></div><div class="bl"><span class="m" data-k="tip"></span></div>';
    wrap.appendChild(hud);
    host.appendChild(wrap);
    const hudEl = {}, hudLast = {};
    hud.querySelectorAll('[data-k]').forEach(function (e) { hudEl[e.getAttribute('data-k')] = e; });
    function setHud(k, h) { if (hudLast[k] !== h) { hudLast[k] = h; hudEl[k].innerHTML = h; } }
    let tipGone = false;
    function hideTip() { if (!tipGone) { tipGone = true; setHud('tip', ''); } }

    let renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true }); }
    catch (e) { wrap.remove(); throw e; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    let cw = 300, ch = 200, narrow = false;
    const camera = new THREE.PerspectiveCamera(FOV, 1.6, 0.1, 400);
    camera.up.set(0, 0, 1);
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.rotateSpeed = 0.8;
    controls.screenSpacePanning = true;
    controls.minDistance = 6;
    controls.maxDistance = 90;
    controls.addEventListener('start', hideTip);

    // ---------- 光線 ----------
    const hemi = new THREE.HemisphereLight(0xffffff, 0x3a4250, 0.95);
    hemi.position.set(0, 0, 1);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.7);
    sun.position.set(XW * 0.3, -10, 16);
    sun.target.position.set(XW / 2, YB / 2, 0);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const sc = sun.shadow.camera;
    sc.left = -12; sc.right = 12; sc.top = 12; sc.bottom = -12; sc.near = 1; sc.far = 60;
    sun.shadow.bias = -0.0006;
    scene.add(sun, sun.target);
    const fill = new THREE.DirectionalLight(0xffffff, 0.45);
    fill.position.set(-8, 6, 4);
    scene.add(fill);

    // ---------- 共用工具 ----------
    function disposeObject(obj) {
      obj.traverse(function (o) {
        if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
        if (o.material && !o.material.userData.shared) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); });
      });
    }
    function clearGroup(g) { g.children.slice().forEach(function (o) { g.remove(o); disposeObject(o); }); }
    const unitBox = new THREE.BoxGeometry(1, 1, 1); unitBox.translate(0, 0, 0.5); unitBox.userData.shared = true;
    const unitEdges = new THREE.EdgesGeometry(unitBox); unitEdges.userData.shared = true;
    const unitCyl = new THREE.CylinderGeometry(1, 1, 1, 18); unitCyl.rotateX(PI / 2); unitCyl.translate(0, 0, 0.5); unitCyl.userData.shared = true;
    const matCache = new Map();
    function mat(kind, color, opacity) {
      const key = kind + '|' + color + '|' + opacity.toFixed(3);
      let m = matCache.get(key);
      if (m) return m;
      const c = new THREE.Color(color);
      if (kind === 'line') m = new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: opacity, depthWrite: false });
      else m = new THREE.MeshPhysicalMaterial({ color: c, roughness: kind === 'glow' ? 0.3 : 0.42, metalness: 0, clearcoat: kind === 'glow' ? 0.2 : 0.55, clearcoatRoughness: 0.3,
        emissive: c, emissiveIntensity: kind === 'glow' ? 0.55 : (kind === 'glass' ? 0.05 : 0.12),
        transparent: opacity < 1, opacity: opacity, depthWrite: opacity >= 1 });
      m.userData.shared = true;
      matCache.set(key, m);
      return m;
    }
    function clearMats() { matCache.forEach(function (m) { m.dispose(); }); matCache.clear(); }
    function segs(pairs, color, opacity) {
      const pts = [];
      pairs.forEach(function (p) { pts.push(p[0], p[1]); });
      const l = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: opacity, depthWrite: false }));
      l.renderOrder = 2;
      return l;
    }
    // 文字標籤（Sprite，固定像素大小）
    function label(text, color, opt) {
      opt = opt || {};
      const px = (opt.size || (narrow ? 11 : 12.5)) * RES;
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
        const dx = dir[0] / L, dy = dir[1] / L, gap = opt.gap == null ? 5 : opt.gap;
        sp.center.set(0.5 - dx * (sp.userData.lw / 2 + gap) / sp.userData.lw, 0.5 - dy * (sp.userData.lh / 2 + gap) / sp.userData.lh);
      }
      if (opt.at) sp.position.copy(opt.at);
      return sp;
    }
    /** sizeAttenuation = false 時，Sprite 的 1 單位 = 畫面高度的 1/(2·tan(fov/2))：換成固定像素 */
    function fitLabel(sp) {
      const k = 2 * Math.tan(FOV * DEG / 2) / Math.max(1, ch);
      sp.scale.set(sp.userData.lw * k, sp.userData.lh * k, 1);
    }
    function sizeLabels() { scene.traverse(function (o) { if (o.userData && o.userData.isLabel) fitLabel(o); }); }

    // ---------- 物件 ----------
    const gStatic = new THREE.Group(), gRows = new THREE.Group(), gWall = new THREE.Group();
    scene.add(gStatic, gRows, gWall);
    let fmax = 2500, builtFmax = 0;
    const X = function (f) { return f / fmax * XW; };
    function fmaxOf(rows) {
      let m = 0;
      rows.forEach(function (r) { m = Math.max(m, 10 * r.f0 + Math.max(0, r.delta) + 0.45 * r.f0); });
      return Math.ceil(m / 500) * 500;
    }
    function surfMat(tint, op) {
      const base = new THREE.Color(C['canvas-bg']);
      base.lerp(new THREE.Color(tint), isDark() ? 0.08 : 0.1);
      if (!isDark()) base.lerp(new THREE.Color(C.text), 0.03);
      return new THREE.MeshStandardMaterial({ color: base, roughness: 0.92, metalness: 0, transparent: true, opacity: op == null ? (isDark() ? 0.75 : 0.85) : op, side: THREE.DoubleSide, depthWrite: false });
    }
    function buildStatic() {
      clearGroup(gStatic);
      builtFmax = fmax;
      const x0 = -0.4, x1 = XW + 0.4, y0 = -0.7, y1 = YB;
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, y1 - y0), surfMat(C.accent));
      floor.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0);
      floor.receiveShadow = true;
      gStatic.add(floor);
      // 接收陰影的透明地面（讓柱子的影子落在地上）
      const sh = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, y1 - y0), new THREE.ShadowMaterial({ opacity: isDark() ? 0.35 : 0.18 }));
      sh.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0.002);
      sh.receiveShadow = true;
      gStatic.add(sh);
      const ink = col('text');
      const minor = [], major = [];
      for (let f = 500; f < fmax; f += 500) (f % 1000 ? minor : major).push([new THREE.Vector3(X(f), y0, 0.004), new THREE.Vector3(X(f), y1, 0.004)]);
      for (let i = 0; i < ROWS; i++) minor.push([new THREE.Vector3(x0, i * DY, 0.004), new THREE.Vector3(x1, i * DY, 0.004)]);
      [[x0, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, x0, y1], [x0, y1, x0, y0]].forEach(function (q) { major.push([new THREE.Vector3(q[0], q[1], 0.004), new THREE.Vector3(q[2], q[3], 0.004)]); });
      gStatic.add(segs(minor, ink, isDark() ? 0.08 : 0.09), segs(major, ink, 0.22));
      const sz = narrow ? 10.5 : 11.5;
      const step = fmax > 3000 && narrow ? 1000 : 500;
      for (let f = 0; f <= fmax; f += step) {
        const t = f < 1000 ? String(f) : (f / 1000).toFixed(f % 1000 ? 1 : 0) + 'k';
        gStatic.add(label(t, C.muted, { at: new THREE.Vector3(X(f), y0, 0), dir: [0, -1], size: sz, weight: 600 }));
      }
      if (narrow) gStatic.add(label('Hz', C.text, { at: new THREE.Vector3(x1, y0 - 0.9, 0), dir: [0, -1], size: sz, weight: 600 }));
      else gStatic.add(label(T('頻率（Hz）→', 'frequency (Hz) →'), C.text, { at: new THREE.Vector3(x1, y0, 0), dir: [1, -0.6], size: sz, weight: 600 }));
      gStatic.add(label(T('現在', 'now'), C.accent, { at: new THREE.Vector3(x0, 0, 0), dir: [-1, 0], size: sz, weight: 700 }));
      gStatic.add(label(narrow ? T('較早 →', 'earlier →') : T('較早的設定 →', 'earlier settings →'), C.muted, { at: new THREE.Vector3(x1, (ROWS - 1) * DY, 0), dir: [1, 0.2], size: sz, weight: 600 }));
    }
    function buildRows() {
      clearGroup(gRows);
      const rows = B.history().slice().reverse();   // 0 = 最新
      const tr = [];
      rows.forEach(function (r, i) {
        if (i >= ROWS) return;
        const y = i * DY;
        const age = rows.length > 1 ? i / Math.max(ROWS - 1, 1) : 0;
        const op = i === 0 ? 1 : Math.max(0.28, 0.85 - 0.6 * age);
        const w = Math.max(0.08, Math.min(0.42, X(r.f0) * 0.45));
        r.comps.forEach(function (c) {
          if (c.f < MC.F_AUDIBLE || c.f > fmax) return;
          const x = X(c.f);
          if (c.present) {
            const h = Math.max(0.02, c.a * ZS);
            const m = new THREE.Mesh(unitBox, mat('bar', C['mf-bar'], op));
            m.scale.set(w, 0.42, h);
            m.position.set(x, y, 0);
            m.castShadow = i < 4;
            gRows.add(m);
          } else {
            const h = Math.max(0.02, c.a0 * ZS);
            const e = new THREE.LineSegments(unitEdges, mat('line', c.why === 'filter' ? C['mf-filt'] : C['mf-gone'], i === 0 ? 0.85 : op * 0.6));
            e.scale.set(w, 0.42, h);
            e.position.set(x, y, 0);
            gRows.add(e);
            if (i === 0) {
              const g = new THREE.Mesh(unitBox, mat('glass', C['mf-gone'], isDark() ? 0.10 : 0.12));
              g.scale.set(w, 0.42, h); g.position.set(x, y, 0);
              gRows.add(g);
            }
          }
        });
        // 聽到的音高：粉紅色細柱
        if (r.pitch && r.pitch <= fmax) {
          const x = X(r.pitch);
          const p = new THREE.Mesh(unitCyl, mat('glow', C['mf-pitch'], i === 0 ? 0.9 : Math.max(0.25, op * 0.7)));
          const rr = i === 0 ? 0.07 : 0.05;
          p.scale.set(rr, rr, ZS * 1.08);
          p.position.set(x, y, 0);
          gRows.add(p);
          tr.push(new THREE.Vector3(x, y, 0.01));
        }
      });
      if (tr.length > 1) {
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(tr), new THREE.LineBasicMaterial({ color: col('mf-pitch'), transparent: true, opacity: 0.9 }));
        line.renderOrder = 3;
        gRows.add(line);
      }
      if (rows.length && rows[0].pitch && rows[0].pitch <= fmax) {
        gRows.add(label(T('聽到的音高 ', 'pitch heard ') + B.hz(rows[0].pitch) + ' Hz', C['mf-pitch'], { at: new THREE.Vector3(X(rows[0].pitch), 0, ZS * 1.1), dir: [0, 1], pill: true, size: narrow ? 10.5 : 12 }));
      }
    }
    /** 週期牆：目前的波形（0–20 ms 沿 x）與週期色帶 */
    function buildWall() {
      clearGroup(gWall);
      const R = B.analysis();
      const WIN = B.waveWindow;
      const H = ZS * 1.15, z0 = 0;
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(XW + 0.8, H), surfMat(C['mf-band'], isDark() ? 0.7 : 0.55));
      wall.rotation.x = PI / 2;
      wall.position.set(XW / 2, YB, z0 + H / 2);
      gWall.add(wall);
      const XT = function (t) { return t / WIN * XW; };
      if (R.pitch) {
        const Tp = 1 / R.pitch;
        for (let n = 0; n * Tp < WIN; n += 2) {
          const a = XT(n * Tp), b = Math.min(XW, XT((n + 1) * Tp));
          const band = new THREE.Mesh(new THREE.PlaneGeometry(b - a, H - 0.1), new THREE.MeshBasicMaterial({ color: col('mf-band'), transparent: true, opacity: isDark() ? 0.22 : 0.16, side: THREE.DoubleSide, depthWrite: false }));
          band.rotation.x = PI / 2;
          band.position.set((a + b) / 2, YB - 0.01, z0 + H / 2);
          band.renderOrder = 1;
          gWall.add(band);
        }
        const ticks = [];
        for (let n = 1; n * Tp < WIN; n++) ticks.push([new THREE.Vector3(XT(n * Tp), YB - 0.02, z0), new THREE.Vector3(XT(n * Tp), YB - 0.02, z0 + H)]);
        gWall.add(segs(ticks, col('mf-band'), 0.7));
      }
      // 波形
      const list = R.enabled;
      const n = 1400;
      let pk = 0;
      const vs = [];
      for (let i = 0; i <= n; i++) { const v = MC.waveAt(list, WIN * i / n); vs.push(v); pk = Math.max(pk, Math.abs(v)); }
      if (pk > 0) {
        const k = (H / 2 - 0.12) / pk, zm = z0 + H / 2;
        const pts = vs.map(function (v, i) { return new THREE.Vector3(XW * i / n, YB - 0.04, zm + v * k); });
        const curve = new THREE.CatmullRomCurve3(pts);
        const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, n, narrow ? 0.035 : 0.03, 6, false),
          new THREE.MeshPhysicalMaterial({ color: col('mf-wave'), roughness: 0.35, clearcoat: 0.5, emissive: col('mf-wave'), emissiveIntensity: 0.25 }));
        gWall.add(tube);
      }
      const sz = narrow ? 10.5 : 11.5;
      [0, 20].forEach(function (ms) { gWall.add(label(ms + ' ms', C.muted, { at: new THREE.Vector3(XT(ms / 1000), YB, z0 + H), dir: [0, 1], size: sz, weight: 600 })); });
      gWall.add(label(R.pitch ? T('週期牆：每條色帶寬 ', 'Period wall: each band is ') + B.num(1000 / R.pitch, 2) + ' ms' : T('週期牆', 'Period wall'), C['mf-band'], { at: new THREE.Vector3(XW / 2, YB, z0 + H + 0.45), dir: [0, 1], pill: true, size: narrow ? 10.5 : 12 }));
    }
    function updateHud() {
      const R = B.analysis();
      setHud('p', R.pitch ? T('聽到的音高 ', 'Pitch heard ') + B.hz(R.pitch) + ' Hz' : T('沒有聲音', 'Silence'));
      setHud('s', R.lowest ? T('喇叭放出的最低頻率 ', 'Lowest from the speaker ') + R.lowest + ' Hz' + (R.missing ? T('・音高本身不存在', ' · the pitch itself is absent') : '') : '');
      setHud('tip', tipGone || narrow ? '' : T('拖曳旋轉、滾輪或雙指縮放；每改一次設定，頻譜就往後退一排', 'Drag to rotate, scroll or pinch to zoom; every change pushes the spectrum one row back'));
    }
    function rebuildAll() {
      const f = Math.max(1000, fmaxOf(B.history()));
      fmax = f;
      if (builtFmax !== fmax) buildStatic();
      buildRows();
      buildWall();
      updateHud();
    }

    // ---------- 視角 ----------
    const center = new THREE.Vector3(XW / 2, YB / 2 - 0.3, ZS * 0.45);
    function defaultDir() { return new THREE.Vector3(narrow ? 0.28 : 0.32, -1, narrow ? 0.72 : 0.62).normalize(); }
    function fitDistance(dir) {
      // 場景盒子的 8 個角都要裝進畫面（水平與垂直視角取較嚴的）
      const fwd = dir.clone().negate();
      const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 0, 1)).normalize();
      const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
      const tv = Math.tan(FOV * DEG / 2) * 0.86, th = tv * Math.max(0.5, cw / Math.max(1, ch));
      let d = 6;
      [-0.6, XW + 1.4].forEach(function (x) { [-0.9, YB + 0.2].forEach(function (y) { [0, ZS * 1.15 + 0.7].forEach(function (z) {
        const v = new THREE.Vector3(x, y, z).sub(center);
        const u = Math.abs(v.dot(right)), w = Math.abs(v.dot(up)), depth = v.dot(dir);
        d = Math.max(d, u / th + depth, w / tv + depth);
      }); }); });
      return d * (narrow ? 1.05 : 1.0);
    }
    function resetCamera() {
      const dir = defaultDir();
      controls.target.copy(center);
      camera.position.copy(center).addScaledVector(dir, fitDistance(dir));
      camera.updateProjectionMatrix();
      controls.update();
      requestRender();
    }

    // ---------- 繪製 ----------
    let raf = 0, dirty = false;
    function renderNow() {
      if (!api.active || document.hidden) return;
      const want = Math.min(window.devicePixelRatio || 1, 2);
      if (renderer.getPixelRatio() !== want) { renderer.setPixelRatio(want); resize3(); return; }
      if (dirty) { dirty = false; rebuildAll(); }
      const moving = controls.update();
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
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      const nar = w < 560;
      if (nar !== narrow) { narrow = nar; buildStatic(); dirty = true; }
      if (Math.abs(camera.aspect - lastAspect) > 1e-3) {
        const refit = !!lastAspect;
        lastAspect = camera.aspect;
        if (refit) {
          const dir = camera.position.clone().sub(controls.target).normalize();
          camera.position.copy(controls.target).addScaledVector(dir, fitDistance(dir));
        }
      }
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
      else if (ev.key === 'ArrowDown') sph.phi = Math.min(PI / 2 - 0.02, sph.phi + step);
      else used = false;
      if (!used) return;
      ev.preventDefault();
      hideTip();
      const v = new THREE.Vector3().setFromSpherical(sph);
      camera.position.copy(controls.target).add(new THREE.Vector3(v.x, -v.z, v.y));
      controls.update();
      requestRender();
    });
    controls.maxPolarAngle = PI / 2 - 0.02;

    const api = {
      active: true,
      update: function () { dirty = true; requestRender(); },
      onTheme: function () {
        C = B.colors();
        clearMats();
        Object.keys(hudLast).forEach(function (k) { delete hudLast[k]; });
        builtFmax = 0;
        dirty = true;
        requestRender();
      },
      resetCamera: resetCamera,
      dispose: function () {
        api.active = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize3);
        document.removeEventListener('visibilitychange', onVisible);
        controls.dispose();
        disposeObject(scene);
        clearMats();
        unitBox.dispose(); unitEdges.dispose(); unitCyl.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        wrap.remove();
      }
    };

    const w0 = canvas.clientWidth, h0 = canvas.clientHeight;
    if (w0 && h0) {
      narrow = w0 < 560;
      cw = w0; ch = h0;
      renderer.setSize(cw, ch, false);
      camera.aspect = cw / ch;
      lastAspect = camera.aspect;
      camera.updateProjectionMatrix();
    }
    fmax = Math.max(1000, fmaxOf(B.history()));
    buildStatic();
    rebuildAll();
    resetCamera();
    renderNow();
    return api;
  }

  window.Missing3D = { create: create };
})();
