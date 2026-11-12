/*
 * tides-3d.js — 「潮汐」的 3D 立體檢視（three.js）
 *
 * 由 js/tides.js 在使用者按「3D 立體」時才載入（three.js 也是那時才以 import() 載入）；切回 2D 時整個釋放。
 * 用法：window.Tides3D.create({ THREE, OrbitControls }, 容器, bridge) → { active, frame, onShow, onTheme, resetCamera, camTo, busy, dispose }
 *
 * 所有物理量來自 tides-core.js，與 2D 畫面是同一份計算（bridge 由 tides.js 提供）：
 *   海面高度 heightDir、引潮力 forceDir／splitVR、月球方向 moonDir、觀測點 siteDir、地球自轉 siteAz。
 * 場景座標與核心相同：x 指向太陽、z 指向北極，地心在原點；1 個場景單位 = 地球半徑。
 * 地球與月球的大小依真實比例；月球與太陽的距離縮短（純示意），陽光是平行光、方向正確。
 * 海面高度誇大的倍數與 2D 相同（B.exaggeration()），海水層本身的厚度也是示意。
 */
(function () {
  'use strict';
  const TAU = Math.PI * 2;
  const DEG = Math.PI / 180;
  const FONT = 'system-ui, -apple-system, "Segoe UI", "Noto Sans TC", "PingFang TC", sans-serif';
  const RES = 3;
  const DM0 = 3.6;                 // 月球在畫面上的距離（地球半徑；真實是 60.3 倍）
  const R_MOON = 1737.4 / 6371;    // 月球半徑 ÷ 地球半徑（依比例）
  const SUN_D = 13, SUN_R = 1.1;   // 太陽的示意位置與大小
  const DEF_AZ = -64 * DEG;
  const defPolar = function (narrow) { return (narrow ? 52 : 62) * DEG; };

  function create(lib, host, B) {
    const THREE = lib.THREE;
    const K = B.K, T = B.T, state = B.state, D = B.D;
    let C = B.colors();
    const SEA = B.SEA;

    // ---------- 畫布、HUD ----------
    const wrap = document.createElement('div');
    wrap.className = 't3-wrap';
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', T('地球、海水隆起、月球與太陽的 3D 立體檢視（可拖曳旋轉、縮放）', '3D view of the Earth, the tidal bulges, the Moon and the Sun (drag to rotate, pinch or scroll to zoom)'));
    wrap.appendChild(canvas);
    const hud = document.createElement('div');
    hud.className = 't3-hud';
    hud.setAttribute('aria-hidden', 'true');
    hud.innerHTML = '<div class="tl"><span data-k="t"></span><span class="m" data-k="age"></span></div>' +
      '<div class="tr"><span data-k="site"></span><span class="m" data-k="dec"></span></div>' +
      '<div class="br"><span class="m" data-k="scale"></span></div>';
    wrap.appendChild(hud);
    host.appendChild(wrap);
    const hudEl = {};
    hud.querySelectorAll('[data-k]').forEach(function (e) { hudEl[e.getAttribute('data-k')] = e; });

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
    const camera = new THREE.PerspectiveCamera(38, 1.5, 0.05, 400);
    camera.up.set(0, 0, 1);
    camera.position.set(0, -12, 7);
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.rotateSpeed = 0.85;
    controls.enablePan = false;
    controls.minDistance = 1.9;
    controls.maxDistance = 60;

    const hemi = new THREE.HemisphereLight(0xffffff, 0x445566, 0.42);
    hemi.position.set(0, 0, 1);
    scene.add(hemi);
    const sunLight = new THREE.DirectionalLight(0xffffff, 2.7);   // 平行光：從 +x（太陽）照過來
    sunLight.position.set(SUN_D, 0, 0);
    scene.add(sunLight);
    scene.add(sunLight.target);

    // ---------- 共用工具 ----------
    let narrow = false;
    let cw = 300, ch = 200;
    let colorVer = 0;
    const col = function (c) { return new THREE.Color(C[c] || c || '#888888'); };
    const isDark = function () { return !!C.dark; };
    const alpha = D.alpha;
    function rnd(seed) { let s = seed; return function () { s = (s * 16807) % 2147483647; return s / 2147483647; }; }
    function V(a) { return new THREE.Vector3(a[0], a[1], a[2]); }
    function disposeObject(obj) {
      obj.traverse(function (o) {
        if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
        if (o.material) {
          (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) {
            ['map', 'alphaMap'].forEach(function (k) { if (m[k] && !m[k].userData.shared) m[k].dispose(); });
            m.dispose();
          });
        }
      });
    }
    function canvasTex(c, shared) {
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      if (shared) t.userData.shared = true;
      return t;
    }
    const glowTex = (function () {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const g = c.getContext('2d');
      const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.3, 'rgba(255,255,255,0.45)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 128, 128);
      return canvasTex(c, true);
    })();

    // ---------- 文字標籤（Sprite，固定像素大小；以 2D 畫布繪製） ----------
    function roundRect(g, x, y, w, h, r) {
      g.beginPath();
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
    }
    function labelCanvas(text, color, opt) {
      const size = (opt.size || (narrow ? 11 : 12)) * RES;
      const fMain = (opt.weight || 600) + ' ' + size + 'px ' + FONT;
      const c = document.createElement('canvas');
      let g = c.getContext('2d');
      g.font = fMain;
      const tw = g.measureText(text).width;
      const m = g.measureText('Hg');
      const fh = m.fontBoundingBoxAscent > 0 ? m.fontBoundingBoxAscent + m.fontBoundingBoxDescent : size * 1.25;
      const padX = 6 * RES, padY = 1.5 * RES;
      c.width = Math.ceil(tw + 2 * padX);
      c.height = Math.ceil(fh + 2 * padY);
      g = c.getContext('2d');
      roundRect(g, RES * 0.5, RES * 0.5, c.width - RES, c.height - RES, (c.height - RES) / 2);
      g.fillStyle = alpha(C['canvas-bg'], isDark() ? 0.84 : 0.9);
      g.fill();
      g.strokeStyle = alpha(color, isDark() ? 0.5 : 0.4);
      g.lineWidth = RES;
      g.stroke();
      g.font = fMain;
      g.textBaseline = 'middle';
      g.textAlign = 'left';
      g.fillStyle = color;
      g.fillText(text, padX, c.height / 2);
      return c;
    }
    /** opt：{ size, prio（2 主要、1 次要）, dir（螢幕方向，y 向上）, radial（從地心往外的方向）, gap } */
    function label(text, color, opt) {
      opt = opt || {};
      const c = labelCanvas(text, color, opt);
      const tex = canvasTex(c);
      tex.minFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false }));
      sp.userData = { isLabel: true, text: text, color: color, opt: opt, lw: c.width / RES, lh: c.height / RES,
        prio: opt.prio != null ? opt.prio : 1, dir: opt.dir || [0, 1], radial: !!opt.radial, gap: opt.gap == null ? 8 : opt.gap };
      sp.renderOrder = 30;
      fitLabel(sp);
      return sp;
    }
    /** 文字改變時換掉貼圖 */
    function relabel(sp, text, color) {
      const u = sp.userData;
      if (u.text === text && u.color === (color || u.color)) return;
      u.text = text; if (color) u.color = color;
      const c = labelCanvas(text, u.color, u.opt);
      const old = sp.material.map;
      const tex = canvasTex(c);
      tex.minFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      sp.material.map = tex;
      sp.material.needsUpdate = true;
      if (old) old.dispose();
      u.lw = c.width / RES; u.lh = c.height / RES;
      fitLabel(sp);
    }
    function fitLabel(sp) {
      const k = 2 * Math.tan(camera.fov * Math.PI / 360) / Math.max(1, ch);
      sp.scale.set(sp.userData.lw * k, sp.userData.lh * k, 1);
    }
    function anchorLabel(sp, dx, dy, gap) {
      const L = Math.hypot(dx, dy);
      if (!(L > 1e-6)) { dx = 0; dy = 1; } else { dx /= L; dy /= L; }
      const lw = sp.userData.lw, lh = sp.userData.lh;
      sp.center.set(0.5 - dx * (lw / 2 + gap) / lw, 0.5 - dy * (lh / 2 + gap) / lh);
    }

    // ---------- 圖層：鍵改變（參數、顏色）才重建 ----------
    const layers = {};
    function layer(name, key, build, parent) {
      let L = layers[name];
      if (!L) L = layers[name] = { key: null, obj: null, ref: {} };
      if (L.key === key) return L;
      if (L.obj) { L.obj.parent.remove(L.obj); disposeObject(L.obj); }
      L.key = key;
      L.ref = {};
      L.obj = build(L);
      if (L.obj) (parent || scene).add(L.obj);
      return L;
    }
    function line(points, color, opacity, dashed) {
      const mat = dashed
        ? new THREE.LineDashedMaterial({ color: color, transparent: true, opacity: opacity, dashSize: dashed[0], gapSize: dashed[1], depthWrite: false })
        : new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: opacity, depthWrite: false });
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), mat);
      if (dashed) l.computeLineDistances();
      return l;
    }
    function circle(r, z, n) {
      const pts = [];
      for (let i = 0; i <= n; i++) { const a = i / n * TAU; pts.push(new THREE.Vector3(r * Math.cos(a), r * Math.sin(a), z)); }
      return pts;
    }
    /** 圓柱（兩點之間的細棒） */
    function rod(a, b, radius, color, opacity) {
      const dir = b.clone().sub(a), L = dir.length();
      const geo = new THREE.CylinderGeometry(radius, radius, 1, 10, 1, true);
      geo.translate(0, 0.5, 0);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: color, transparent: opacity < 1, opacity: opacity }));
      m.position.copy(a);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      m.scale.set(1, Math.max(1e-4, L), 1);
      return m;
    }

    // ---- 星空（固定亂數；跟著相機移動，看起來在無限遠） ----
    function buildStars() {
      const grp = new THREE.Group();
      const r = rnd(20261112);
      const dark = isDark();
      const base = col(dark ? 'text' : 'muted');
      [[700, dark ? 1.4 : 1.2, dark ? 0.55 : 0.25], [140, dark ? 2.3 : 1.8, dark ? 0.85 : 0.35]].forEach(function (cfg) {
        const n = cfg[0], pos = new Float32Array(n * 3), colr = new Float32Array(n * 4);
        for (let i = 0; i < n; i++) {
          const z = 2 * r() - 1, a = r() * TAU, s = Math.sqrt(1 - z * z);
          pos[3 * i] = 300 * s * Math.cos(a); pos[3 * i + 1] = 300 * s * Math.sin(a); pos[3 * i + 2] = 300 * z;
          colr[4 * i] = base.r; colr[4 * i + 1] = base.g; colr[4 * i + 2] = base.b;
          colr[4 * i + 3] = cfg[2] * (0.25 + 0.75 * r());
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        g.setAttribute('color', new THREE.BufferAttribute(colr, 4));
        const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: cfg[1], sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false }));
        pts.renderOrder = -1;
        pts.frustumCulled = false;
        grp.add(pts);
      });
      return grp;
    }

    // ---- 太陽（示意位置）、地軸、赤道 ----
    function buildStatic(L) {
      const grp = new THREE.Group();
      const sunCol = col('td-sun');
      const sun = new THREE.Mesh(new THREE.SphereGeometry(SUN_R, 48, 24), new THREE.MeshBasicMaterial({ color: sunCol }));
      sun.position.set(SUN_D, 0, 0);
      grp.add(sun);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: sunCol, transparent: true, opacity: isDark() ? 0.75 : 0.6, depthWrite: false }));
      glow.scale.set(SUN_R * 5.5, SUN_R * 5.5, 1);
      glow.position.copy(sun.position);
      grp.add(glow);
      L.ref.sunLabel = label(T('太陽（距離未依比例）', 'Sun (distance not to scale)'), C['td-sun-text'], { prio: 1, dir: [0, 1], gap: 6 });
      L.ref.sunLabel.position.set(SUN_D, 0, SUN_R);
      grp.add(L.ref.sunLabel);
      // 地軸
      grp.add(rod(new THREE.Vector3(0, 0, -1.75), new THREE.Vector3(0, 0, 1.75), 0.012, col(isDark() ? 'text' : 'muted'), 0.85));
      L.ref.north = label(T('北極', 'North Pole'), C.text, { prio: 1, dir: [0, 1], gap: 4 });
      L.ref.north.position.set(0, 0, 1.75);
      grp.add(L.ref.north);
      // 赤道（地表）
      const eq = line(circle(1.004, 0, 160), col(isDark() ? 'text' : 'muted'), isDark() ? 0.5 : 0.45, [0.05, 0.05]);
      grp.add(eq);
      return grp;
    }

    // ---- 地球（NASA Blue Marble 貼圖；經度 0 朝 +x、東經 90° 朝 +y、北極朝 +z） ----
    let earthTex = null, moonTex = null, loader = new THREE.TextureLoader();
    const earthGeo = new THREE.SphereGeometry(1, 96, 48);
    earthGeo.rotateX(Math.PI / 2);
    const earthMat = new THREE.MeshStandardMaterial({ color: 0x4a78a8, roughness: 0.92, metalness: 0 });
    const earth = new THREE.Mesh(earthGeo, earthMat);
    scene.add(earth);
    function loadTex(url, done) {
      loader.load(url, function (t) {
        if (!api.active) { t.dispose(); return; }
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        done(t);
        requestRender();
      }, undefined, function () { /* 載入失敗：保留素色的球 */ });
    }
    loadTex(B.earthUrl, function (t) { earthTex = t; earthMat.map = t; earthMat.color.set(0xffffff); earthMat.needsUpdate = true; });
    // 緯度圈（觀測點）
    function buildLat() {
      const ph = state.lat * DEG, r = Math.cos(ph) * 1.006, z = Math.sin(ph) * 1.006;
      if (r < 0.01) return null;
      return line(circle(r, z, 120), col('probe'), 0.85);
    }

    // ---- 海水殼：每個頂點依平衡潮高度往外推（誇大） ----
    const WSEG = 144, HSEG = 72;
    const waterGeo = new THREE.SphereGeometry(1, WSEG, HSEG);
    waterGeo.rotateX(Math.PI / 2);
    const unitDirs = waterGeo.attributes.position.array.slice();
    const nV = unitDirs.length / 3;
    waterGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(nV * 3), 3));
    const waterMat = new THREE.MeshStandardMaterial({
      vertexColors: true, transparent: true, opacity: 0.6, roughness: 0.35, metalness: 0.05,
      emissive: 0x0b2440, emissiveIntensity: 0.6, depthWrite: false
    });
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.renderOrder = 5;
    scene.add(water);
    let waterKey = '';
    const cLow = new THREE.Color(), cHigh = new THREE.Color(), cTmp = new THREE.Color();
    function surfR(p, psi, rh, k) { return SEA + K.heightDir(p, psi, rh).total * k; }
    function updateWater(p, psi, k) {
      const pos = waterGeo.attributes.position.array, colr = waterGeo.attributes.color.array;
      const hTop = K.moonH(p) + K.sunH(p), hBot = -0.5 * hTop;
      cLow.set(D.mix(C['td-deep'], C['td-water'], isDark() ? 0.55 : 0.5));
      cHigh.set(D.mix(C['td-water'], '#bff3ff', isDark() ? 0.75 : 0.7));
      const rh = [0, 0, 0];
      for (let i = 0; i < nV; i++) {
        rh[0] = unitDirs[3 * i]; rh[1] = unitDirs[3 * i + 1]; rh[2] = unitDirs[3 * i + 2];
        const h = K.heightDir(p, psi, rh).total, r = SEA + h * k;
        pos[3 * i] = rh[0] * r; pos[3 * i + 1] = rh[1] * r; pos[3 * i + 2] = rh[2] * r;
        const u = hTop > hBot ? Math.max(0, Math.min(1, (h - hBot) / (hTop - hBot))) : 0.5;
        cTmp.copy(cLow).lerp(cHigh, Math.pow(u, 1.4));
        colr[3 * i] = cTmp.r; colr[3 * i + 1] = cTmp.g; colr[3 * i + 2] = cTmp.b;
      }
      waterGeo.attributes.position.needsUpdate = true;
      waterGeo.attributes.color.needsUpdate = true;
      waterGeo.computeVertexNormals();
      // 接縫與兩極：重疊的頂點用同一個法向量，表面才不會出現一條線
      const nrm = waterGeo.attributes.normal.array, W1 = WSEG + 1;
      for (let j = 0; j <= HSEG; j++) {
        const a = 3 * (j * W1), b = 3 * (j * W1 + WSEG);
        for (let c = 0; c < 3; c++) { const m = (nrm[a + c] + nrm[b + c]) / 2; nrm[a + c] = nrm[b + c] = m; }
      }
      [0, HSEG].forEach(function (j) {
        const n = [0, 0, 0];
        for (let i = 0; i <= WSEG; i++) for (let c = 0; c < 3; c++) n[c] += nrm[3 * (j * W1 + i) + c];
        const L = Math.hypot(n[0], n[1], n[2]) || 1;
        for (let i = 0; i <= WSEG; i++) for (let c = 0; c < 3; c++) nrm[3 * (j * W1 + i) + c] = n[c] / L;
      });
      waterGeo.attributes.normal.needsUpdate = true;
      waterGeo.computeBoundingSphere();
    }

    // ---- 截面線：赤道上的海面、包含地軸與月球的平面上的海面（看得出隆起往南北偏）、平均海面 ----
    const secGroup = new THREE.Group();
    scene.add(secGroup);
    let secKey = '';
    function updateSections(p, psi, k) {
      while (secGroup.children.length) { const o = secGroup.children.pop(); disposeObject(o); }
      const u = [Math.cos(psi * DEG), Math.sin(psi * DEG), 0];
      const N = 180, eqPts = [], merPts = [], meanPts = [];
      for (let i = 0; i <= N; i++) {
        const b = i / N * TAU, cb = Math.cos(b), sb = Math.sin(b);
        const e = [cb, sb, 0];
        eqPts.push(V(e).multiplyScalar(surfR(p, psi, e, k) + 0.003));
        const m = [cb * u[0], cb * u[1], sb];
        merPts.push(V(m).multiplyScalar(surfR(p, psi, m, k) + 0.003));
        meanPts.push(V(m).multiplyScalar(SEA));
      }
      const edge = col(D.shade(C['td-water'], isDark() ? 0.7 : -0.25));
      secGroup.add(line(eqPts, edge, 0.75));
      secGroup.add(line(merPts, edge, 0.95));
      secGroup.add(line(meanPts, col(isDark() ? 'text' : 'muted'), 0.5, [0.04, 0.05]));
    }

    // ---- 月球 ----
    const moonMat = new THREE.MeshStandardMaterial({ color: 0xa8a49a, roughness: 1, metalness: 0 });
    const moonGeo = new THREE.SphereGeometry(R_MOON, 64, 32);
    moonGeo.rotateX(Math.PI / 2);
    const moon = new THREE.Mesh(moonGeo, moonMat);
    scene.add(moon);
    loadTex(B.moonUrl, function (t) { moonTex = t; moonMat.map = t; moonMat.color.set(0xffffff); moonMat.needsUpdate = true; });
    function moonDistVis() { return DM0 * B.orbitFrac(state.dist) / B.orbitFrac(1); }
    // 月球的路徑（赤緯固定時是一個小圓）
    function buildPath() {
      const d = moonDistVis(), dc = state.dec * DEG;
      return line(circle(d * Math.cos(dc), d * Math.sin(dc), 160), col(isDark() ? 'text' : 'muted'), isDark() ? 0.4 : 0.45, [0.1, 0.12]);
    }

    // ---- 隆起的方向（月球、太陽）與月下點、對蹠點 ----
    const axisGroup = new THREE.Group();
    scene.add(axisGroup);
    let axisKey = '';
    const subDot = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    const antiDot = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    scene.add(subDot); scene.add(antiDot);

    // ---- 觀測點：海面上的球＋從地表到海面的細棒（潮位尺） ----
    const siteGroup = new THREE.Group();
    scene.add(siteGroup);
    const siteBall = new THREE.Mesh(new THREE.SphereGeometry(0.045, 24, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, emissive: 0x000000 }));
    siteGroup.add(siteBall);
    let sitePin = null;

    // ---- 引潮力箭頭場（InstancedMesh：箭身＋箭頭） ----
    const GRID = [];
    [-60, -30, 0, 30, 60].forEach(function (la) { for (let a = 0; a < 360; a += 30) GRID.push([la, a + (la % 60 ? 15 : 0)]); });
    GRID.push([90, 0]); GRID.push([-90, 0]);
    const shaftGeo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true); shaftGeo.translate(0, 0.5, 0);
    const headGeo = new THREE.ConeGeometry(1, 1, 16, 1); headGeo.translate(0, 0.5, 0);
    const arrowMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0, emissive: 0x000000 });
    const shafts = new THREE.InstancedMesh(shaftGeo, arrowMat, GRID.length);
    const heads = new THREE.InstancedMesh(headGeo, arrowMat, GRID.length);
    shafts.frustumCulled = false; heads.frustumCulled = false;
    scene.add(shafts); scene.add(heads);
    let arrowKey = '';
    const mtx = new THREE.Matrix4(), qa = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
    function updateArrows(p, psi, k) {
      const ks = B.forceScale();       // 地球半徑 / (m/s²)，與 2D 相同
      let n = 0;
      GRID.forEach(function (g) {
        const la = g[0] * DEG, a = g[1] * DEG, rh = [Math.cos(la) * Math.cos(a), Math.cos(la) * Math.sin(a), Math.sin(la)];
        let f = K.forceDir(p, psi, rh, false);
        if (state.horiz) f = K.splitVR(f, rh).h;
        const L = Math.hypot(f[0], f[1], f[2]) * ks;
        if (L < 0.07) return;
        const r0 = surfR(p, psi, rh, k) + 0.012;
        const head = Math.min(0.11, L * 0.42), rS = 0.016, rH = 0.042;
        const dir = V(f).normalize();
        qa.setFromUnitVectors(Y, dir);
        pv.set(rh[0] * r0, rh[1] * r0, rh[2] * r0);
        sv.set(rS, Math.max(1e-3, L - head), rS);
        mtx.compose(pv, qa, sv); shafts.setMatrixAt(n, mtx);
        pv.addScaledVector(dir, L - head);
        sv.set(rH, head, rH);
        mtx.compose(pv, qa, sv); heads.setMatrixAt(n, mtx);
        n++;
      });
      shafts.count = n; heads.count = n;
      shafts.instanceMatrix.needsUpdate = true; heads.instanceMatrix.needsUpdate = true;
    }

    // ---- 標籤 ----
    const lbMoon = label(T('月球', 'Moon'), C.text, { prio: 2, dir: [0, 1], gap: 6 });
    const lbSub = label(T('月下點的隆起', 'Sub-lunar bulge'), C.text, { prio: 1, radial: true, gap: 8 });
    const lbAnti = label(T('對蹠點的隆起', 'Far-side bulge'), C.text, { prio: 1, radial: true, gap: 8 });
    const lbSite = label(T('觀測點', 'Site'), C.probe, { prio: 2, radial: true, gap: 10 });
    [lbMoon, lbSub, lbAnti, lbSite].forEach(function (s) { scene.add(s); });

    // ---------- 相機 ----------
    function dirOf(polar, az) { return new THREE.Vector3(Math.sin(polar) * Math.cos(az), Math.sin(polar) * Math.sin(az), Math.cos(polar)); }
    function currentSph() {
      const off = camera.position.clone().sub(controls.target);
      const d = off.length() || 1;
      return { polar: Math.acos(Math.max(-1, Math.min(1, off.z / d))), az: Math.atan2(off.y, off.x), dist: d };
    }
    function fitPoints() {
      const pts = [], d = moonDistVis(), dc = state.dec * DEG;
      for (let i = 0; i < 24; i++) { const a = i / 24 * TAU; pts.push(new THREE.Vector3(d * Math.cos(dc) * Math.cos(a), d * Math.cos(dc) * Math.sin(a), d * Math.sin(dc))); }
      pts.push(new THREE.Vector3(0, 0, 1.9)); pts.push(new THREE.Vector3(0, 0, -1.9));
      return pts;
    }
    function fitDistance(dir, pts) {
      const fwd = dir.clone().negate();
      const right = new THREE.Vector3().crossVectors(fwd, camera.up);
      if (right.lengthSq() < 1e-14) right.set(1, 0, 0);
      right.normalize();
      const upv = new THREE.Vector3().crossVectors(right, fwd).normalize();
      const tv = Math.tan(camera.fov * Math.PI / 360), th = tv * camera.aspect;
      let d = 2;
      pts.forEach(function (p) {
        const depth = p.dot(dir);
        d = Math.max(d, depth + Math.abs(p.dot(right)) / th + 0.4, depth + Math.abs(p.dot(upv)) / tv + 0.4);
      });
      return d * 1.02;
    }
    function setNearFar(dist) {
      const near = Math.max(0.02, Math.min(dist / 200, 0.5));
      if (Math.abs(camera.near - near) > 0.1 * near) { camera.near = near; camera.updateProjectionMatrix(); }
    }
    let camAnim = null, follow = false;
    function camTo(polar, az, dist, animate) {
      if (!animate || B.reducedMotion) {
        camAnim = null;
        controls.target.set(0, 0, 0);
        camera.position.copy(dirOf(polar, az)).multiplyScalar(dist);
        setNearFar(dist);
        controls.update();
        requestRender();
        return;
      }
      const s = currentSph();
      let da = az - s.az;
      while (da > Math.PI) da -= TAU;
      while (da < -Math.PI) da += TAU;
      camAnim = { t0: performance.now(), dur: 700, p0: s.polar, a0: s.az, d0: s.dist, p1: polar, a1: s.az + da, d1: dist, tg0: controls.target.clone() };
      requestRender();
    }
    function stepCamAnim() {
      if (!camAnim) return;
      const A = camAnim;
      if (follow) {
        const m = K.moonDir(B.psiNow(), state.dec);
        A.p1 = Math.acos(Math.max(-1, Math.min(1, m[2])));
        let da = Math.atan2(m[1], m[0]) - A.a0;
        while (da > Math.PI) da -= TAU;
        while (da < -Math.PI) da += TAU;
        A.a1 = A.a0 + da;
      }
      const u = Math.min(1, (performance.now() - A.t0) / A.dur), e = 1 - Math.pow(1 - u, 3);
      const p = A.p0 + (A.p1 - A.p0) * e, a = A.a0 + (A.a1 - A.a0) * e, d = Math.exp(Math.log(A.d0) + (Math.log(A.d1) - Math.log(A.d0)) * e);
      controls.target.copy(A.tg0).lerp(new THREE.Vector3(), e);
      camera.position.copy(dirOf(p, a)).multiplyScalar(d).add(controls.target);
      setNearFar(d);
      if (u >= 1) camAnim = null;
    }
    /** 「從月球看地球」：相機一直在月球的方向上（月球本身隱藏），隆起正對著你 */
    function followMoon() {
      if (!follow || camAnim) return;
      const m = K.moonDir(B.psiNow(), state.dec), d = camera.position.distanceTo(controls.target);
      controls.target.set(0, 0, 0);
      camera.position.set(m[0] * d, m[1] * d, m[2] * d);
    }
    function setFollow(on) {
      follow = on;
      moon.visible = !on;
      lbMoon.visible = !on;
    }
    controls.addEventListener('start', function () { camAnim = null; if (follow) setFollow(false); });
    function resetCamera(animate) {
      setFollow(false);
      const dir = dirOf(defPolar(narrow), DEF_AZ);
      camTo(defPolar(narrow), DEF_AZ, Math.min(16, fitDistance(dir, fitPoints())), animate);
    }

    // ---------- 每一幀 ----------
    function update() {
      C = B.colors();
      const p = B.P(), psi = B.psiNow(), lt = B.ltNow();
      const E = B.exaggeration(), k = E / K.R_EARTH;
      const dark = isDark();
      layer('stars', colorVer, buildStars);
      layer('static', colorVer + '|' + narrow, buildStatic);
      layer('lat', colorVer + '|' + state.lat, buildLat);
      layer('path', colorVer + '|' + state.dec + '|' + state.dist, buildPath);
      // 地球自轉：經度 λ 的方位 = 觀測點的方位 + (λ − 觀測點經度)
      earth.rotation.z = (K.siteAz(lt) - K.SITE_LON) * DEG;
      // 海水
      const wk = [psi.toFixed(4), p.dec, p.dist, p.sun, E, colorVer].join('|');
      if (wk !== waterKey) {
        waterKey = wk;
        waterMat.opacity = dark ? 0.66 : 0.64;
        waterMat.emissive.set(C['td-water']);
        waterMat.emissiveIntensity = dark ? 0.22 : 0.16;
        updateWater(p, psi, k);
      }
      const sk = wk + '|' + state.showParts;
      if (sk !== secKey) { secKey = sk; updateSections(p, psi, k); }
      // 月球
      const m = K.moonDir(psi, p.dec), dM = moonDistVis();
      moon.position.set(m[0] * dM, m[1] * dM, m[2] * dM);
      moon.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(-m[0], -m[1], -m[2]));
      lbMoon.position.set(m[0] * dM, m[1] * dM, m[2] * dM + R_MOON);
      // 隆起的方向
      const ak = wk + '|' + state.showParts;
      if (ak !== axisKey) {
        axisKey = ak;
        while (axisGroup.children.length) { const o = axisGroup.children.pop(); disposeObject(o); }
        if (state.showParts) {
          const rAnti = surfR(p, psi, [-m[0], -m[1], -m[2]], k) + 0.25;
          axisGroup.add(line([V(m).multiplyScalar(-rAnti), V(m).multiplyScalar(dM - R_MOON * 1.2)], col('text'), dark ? 0.55 : 0.5, [0.08, 0.07]));
          if (p.sun) axisGroup.add(line([new THREE.Vector3(-1.75, 0, 0), new THREE.Vector3(SUN_D - SUN_R * 1.3, 0, 0)], col('td-sun-text'), 0.8, [0.1, 0.08]));
        }
      }
      const rS = surfR(p, psi, m, k), rA = surfR(p, psi, [-m[0], -m[1], -m[2]], k);
      subDot.position.set(m[0] * rS, m[1] * rS, m[2] * rS);
      antiDot.position.set(-m[0] * rA, -m[1] * rA, -m[2] * rA);
      subDot.material.color.set(dark ? '#ffffff' : C.text); antiDot.material.color.copy(subDot.material.color);
      lbSub.position.copy(subDot.position); lbAnti.position.copy(antiDot.position);
      // 觀測點
      const rh = K.siteDir(state.lat, lt), rSite = surfR(p, psi, rh, k);
      siteBall.position.set(rh[0] * rSite, rh[1] * rSite, rh[2] * rSite);
      siteBall.material.color.set(C.probe);
      siteBall.material.emissive.set(C.probe); siteBall.material.emissiveIntensity = dark ? 0.35 : 0.15;
      if (sitePin) { siteGroup.remove(sitePin); disposeObject(sitePin); }
      sitePin = rod(V(rh).multiplyScalar(1.0), V(rh).multiplyScalar(rSite), 0.011, col('probe'), 0.95);
      siteGroup.add(sitePin);
      lbSite.position.copy(siteBall.position);
      const h = B.heightNow();
      relabel(lbSite, T('觀測點 ', 'Site ') + B.cm(h, 0), C.probe);
      // 引潮力箭頭
      shafts.visible = heads.visible = state.showForce;
      if (state.showForce) {
        const fk = wk + '|' + state.horiz;
        if (fk !== arrowKey) { arrowKey = fk; updateArrows(p, psi, k); }
        arrowMat.color.set(C.pos);
        arrowMat.emissive.set(C.pos); arrowMat.emissiveIntensity = dark ? 0.35 : 0.2;
      }
      followMoon();
      updateHud(p, h);
    }

    // ---------- 標籤排版：避開彼此、被地球擋住就隱藏 ----------
    const lp = new THREE.Vector3(), cp = new THREE.Vector3(), op0 = new THREE.Vector3(), labelsNow = [];
    let hudRects = [], hudT = 0;
    function readHudRects() {
      const now = performance.now();
      if (now - hudT < 400) return;
      hudT = now;
      const cr = canvas.getBoundingClientRect();
      hudRects = [];
      hud.querySelectorAll('span').forEach(function (e) {
        if (!e.textContent) return;
        const r = e.getBoundingClientRect();
        if (r.width) hudRects.push([r.left - cr.left, cr.bottom - r.bottom, r.width, r.height]);
      });
    }
    function overlaps(a, b) { return a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3]; }
    /** 從相機到 p 的線段是否穿過地球（半徑 0.99） */
    function hiddenByEarth(p) {
      const o = camera.position, d = p.clone().sub(o), L = d.length();
      d.divideScalar(L);
      const b = o.dot(d), c = o.lengthSq() - 0.98;
      const disc = b * b - c;
      if (disc <= 0) return false;
      const t = -b - Math.sqrt(disc);
      return t > 0 && t < L - 0.02;
    }
    function layoutLabels() {
      const M = 4;
      readHudRects();
      labelsNow.length = 0;
      scene.traverseVisible(function (o) { if (o.userData && o.userData.isLabel) labelsNow.push(o); });
      labelsNow.sort(function (a, b) { return b.userData.prio - a.userData.prio; });
      op0.set(0, 0, 0).project(camera);
      const ox = (op0.x + 1) / 2 * cw, oy = (op0.y + 1) / 2 * ch;
      const taken = [];
      labelsNow.forEach(function (sp) {
        const u = sp.userData;
        sp.getWorldPosition(lp);
        cp.copy(lp).project(camera);
        const px = (cp.x + 1) / 2 * cw, py = (cp.y + 1) / 2 * ch;
        if (u.radial) anchorLabel(sp, px - ox, py - oy, u.gap); else anchorLabel(sp, u.dir[0], u.dir[1], u.gap);
        let op = 1;
        if (cp.z > 1 || hiddenByEarth(lp)) op = 0;
        else {
          const lw = u.lw, lh = u.lh;
          if (px > -M && px < cw + M && py > -M && py < ch + M) {
            if (px - sp.center.x * lw < M) sp.center.x = (px - M) / lw;
            else if (px - sp.center.x * lw + lw > cw - M) sp.center.x = (px - (cw - M - lw)) / lw;
            if (py - sp.center.y * lh < M) sp.center.y = (py - M) / lh;
            else if (py - sp.center.y * lh + lh > ch - M) sp.center.y = (py - (ch - M - lh)) / lh;
          }
          const r = [px - sp.center.x * lw, py - sp.center.y * lh, lw, lh, u.prio];
          if (taken.some(function (q) { return overlaps(q, r); }) || hudRects.some(function (q) { return overlaps(q, r); })) op = 0;
          if (op > 0.05) taken.push(r);
        }
        if (sp.material.opacity !== op) sp.material.opacity = op;
      });
    }

    // ---------- HUD ----------
    const hudLast = {};
    function setHud(k, txt) { if (hudLast[k] !== txt) { hudLast[k] = txt; hudEl[k].textContent = txt; } }
    function updateHud(p, h) {
      const psi = B.psiNow();
      setHud('t', B.when(state.t) + (narrow ? '' : T('（觀測點地方時）', ' (local time at the site)')));
      setHud('age', T('月齡 ', 'Moon age ') + B.num(K.moonAge(psi), 1) + (narrow ? T(' 天', ' d') : T(' 天・', ' d · ') + B.phaseName(psi)));
      const dh = K.dHeightDt(p, state.lat, state.psi0, state.t);
      setHud('site', T('觀測點 ', 'Site ') + B.cm(h, 1) + T('・', ' · ') + (Math.abs(dh) < 1e-7 ? T('海面不動', 'not moving') : dh > 0 ? T('漲潮中', 'rising') : T('退潮中', 'falling')));
      setHud('dec', (narrow ? T('赤緯 ', 'Dec. ') : T('月球赤緯 ', 'Moon declination ')) + B.signed(state.dec, 1) + '°' + (follow && !narrow ? T('・從月球看地球', ' · seen from the Moon') : ''));
      setHud('scale', T('示意：海面隆起誇大 ' + B.bigText(B.exaggeration()) + ' 倍；地球與月球大小依比例，月球與太陽的距離未依比例',
        'Not to scale: bulges ×' + B.bigText(B.exaggeration()) + '; Earth and Moon sizes to scale, distances to the Moon and the Sun shrunk'));
    }

    // ---------- 繪製 ----------
    let raf = 0, lastAspect = 0;
    function renderNow() {
      if (!api.active || document.hidden) return;
      const want = Math.min(window.devicePixelRatio || 1, 2);
      if (renderer.getPixelRatio() !== want) { renderer.setPixelRatio(want); resize3(); return; }
      stepCamAnim();
      const moved = controls.update();
      setNearFar(camera.position.distanceTo(controls.target));
      if (layers.stars && layers.stars.obj) layers.stars.obj.position.copy(camera.position);
      layoutLabels();
      renderer.render(scene, camera);
      if (moved || camAnim) requestRender();
    }
    function requestRender() {
      if (raf || !api.active) return;
      raf = requestAnimationFrame(function () { raf = 0; renderNow(); });
    }
    function sizeOf(w) { return w < 560 ? Math.round(Math.max(340, Math.min(500, w * 1.12))) : 500; }
    function resize3() {
      const w = wrap.clientWidth;
      if (!w) return;
      const nar = w < 560;
      const h = sizeOf(w);
      if (canvas.style.height !== h + 'px') canvas.style.height = h + 'px';
      cw = w; ch = h;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (nar !== narrow) { narrow = nar; colorVer++; Object.keys(hudLast).forEach(function (k) { delete hudLast[k]; }); }
      labelsNow.length = 0;
      scene.traverse(function (o) { if (o.userData && o.userData.isLabel) fitLabel(o); });
      if (Math.abs(camera.aspect - lastAspect) > 1e-3) {
        const first = !lastAspect;
        lastAspect = camera.aspect;
        if (first) resetCamera(false);
      }
      update();
      renderNow();
    }
    const ro = window.ResizeObserver ? new ResizeObserver(function () { resize3(); }) : null;
    if (ro) ro.observe(wrap); else window.addEventListener('resize', resize3);
    controls.addEventListener('change', requestRender);
    const onVisible = function () { if (!document.hidden) requestRender(); };
    document.addEventListener('visibilitychange', onVisible);
    canvas.addEventListener('webglcontextlost', function (ev) {
      ev.preventDefault();
      if (!api.active) return;
      if (B.onContextLost) B.onContextLost();
    });

    const api = {
      active: true,
      frame: function () { update(); renderNow(); },
      busy: function () { return !!camAnim; },
      onShow: function () { lastAspect = 0; resize3(); },
      onTheme: function () {
        colorVer++;
        C = B.colors();
        waterKey = secKey = axisKey = arrowKey = '';
        [lbMoon, lbSub, lbAnti].forEach(function (s) { s.userData.text = ''; });
        relabel(lbMoon, T('月球', 'Moon'), C.text);
        relabel(lbSub, T('月下點的隆起', 'Sub-lunar bulge'), C.text);
        relabel(lbAnti, T('對蹠點的隆起', 'Far-side bulge'), C.text);
        lbSite.userData.text = '';
        Object.keys(hudLast).forEach(function (k) { delete hudLast[k]; });
        update();
        requestRender();
      },
      resetCamera: function () { resetCamera(true); },
      /** 'side'：從赤道面上、與月球方向垂直的地方看（隆起往南北偏最清楚）；'top'：從北極上空往下看（與 2D 相同）；
       *  'moon'：從月球的方向看地球（月下點的隆起正對著你，相機跟著月球） */
      camTo: function (kind) {
        const s = currentSph();
        if (kind === 'top') { setFollow(false); camTo(1e-4, -Math.PI / 2, Math.max(6.5, Math.min(16, fitDistance(dirOf(1e-4, -Math.PI / 2), fitPoints()))), true); return; }
        if (kind === 'side') {
          setFollow(false);
          const az = (B.psiNow() - 90) * DEG;
          camTo(Math.PI / 2, az, Math.max(5.5, Math.min(9, s.dist)), true);
          return;
        }
        if (kind === 'moon') {
          const m = K.moonDir(B.psiNow(), state.dec);
          setFollow(true);
          camTo(Math.acos(Math.max(-1, Math.min(1, m[2]))), Math.atan2(m[1], m[0]), 6.2, true);
        }
      },
      dispose: function () {
        api.active = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize3);
        document.removeEventListener('visibilitychange', onVisible);
        controls.dispose();
        disposeObject(scene);
        glowTex.dispose();
        if (earthTex) earthTex.dispose();
        if (moonTex) moonTex.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        wrap.remove();
      }
    };

    // 初始化
    const w0 = wrap.clientWidth;
    if (w0) {
      narrow = w0 < 560;
      cw = w0; ch = sizeOf(w0);
      canvas.style.height = ch + 'px';
      renderer.setSize(cw, ch, false);
      camera.aspect = cw / ch;
      camera.updateProjectionMatrix();
      lastAspect = camera.aspect;
    }
    update();
    resetCamera(false);
    return api;
  }

  window.Tides3D = { create: create };
})();
