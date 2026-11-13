/*
 * iodine-clock-3d.js — 「碘鐘反應與速率定律」的 3D 速率曲面（可旋轉、縮放）
 *
 * three.js 由 iodine-clock.js 在切換到 3D 時才以 import() 動態載入，再傳進 Clock3D.create(lib, host)。
 * 這個檔案只「讀」頁面給的資料，不改變任何化學量：
 *   底面兩軸 = [I−]0 與 [氧化劑]0（滑桿範圍內），高度 = 初速率 r。
 *   曲面：過硫酸根用模型 r = k[S2O8 2−][I−]（目前溫度、離子強度設定）；未知氧化劑 X 在核對後畫學生的答案、揭曉後畫真正的速率定律。
 *   球：目前溫度與設定下量到的初速率（碼錶算出來的 [S2O3 2−]0 ÷ 2t）。
 *   對數座標時，r = k[A]^m[B]^n 變成平面 ln r = ln k + m ln[A] + n ln[B]：兩個方向的斜率就是兩個級數。
 */
(function () {
  'use strict';
  const NG = 36;            // 曲面格點數（每邊）
  const MAXP = 240;         // 資料點上限
  const L = 5, HY = 3.2;    // 底面邊長、最高高度（場景單位）
  const X0 = -L / 2, Z0 = -L / 2;

  function create(lib, H) {
    const THREE = lib.THREE;
    const T = H.T, host = H.host;

    const canvas = document.createElement('canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', T('速率曲面的 3D 立體檢視：底面是兩種反應物的初濃度，高度是初速率（拖曳旋轉、雙指或滾輪縮放）',
      '3D view of the rate surface: the floor shows the two starting concentrations and the height is the initial rate (drag to rotate, pinch or scroll to zoom)'));
    host.appendChild(canvas);
    const hudTL = document.createElement('div'), hudTR = document.createElement('div'), hudBL = document.createElement('div');
    hudTL.className = 'r3-hud tl'; hudTR.className = 'r3-hud tr'; hudBL.className = 'r3-hud bl';
    [hudTL, hudTR, hudBL].forEach(function (d) { d.setAttribute('aria-hidden', 'true'); host.appendChild(d); });
    hudBL.textContent = T('拖曳旋轉・滾輪或雙指縮放', 'Drag to rotate · scroll or pinch to zoom');

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: 'default' });
    } catch (e) {
      canvas.remove(); hudTL.remove(); hudTR.remove(); hudBL.remove();
      throw e;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1.5, 0.3, 200);
    const viewDir = new THREE.Vector3(1.05, 0.95, 1.45).normalize();
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.minDistance = 5;
    controls.maxDistance = 40;
    controls.enablePan = false;
    controls.maxPolarAngle = Math.PI * 0.49;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x7d8592, 1.45));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(-5, 11, 7);
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0xffffff, 0.55);
    rim.position.set(8, 4, -9);
    scene.add(rim);

    let colors = H.colors();
    const C = function (c) { return new THREE.Color(c || '#888888'); };

    // ---------- 底面與框線 ----------
    const floorMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, roughness: 0.9, side: THREE.DoubleSide, depthWrite: false });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(L, L), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.renderOrder = 0;
    scene.add(floor);
    const gridMat = new THREE.LineBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.35 });
    const grid = new THREE.LineSegments(new THREE.BufferGeometry(), gridMat);
    scene.add(grid);
    const frameMat = new THREE.LineBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.8 });
    const frame = new THREE.LineSegments(new THREE.BufferGeometry(), frameMat);
    scene.add(frame);

    // ---------- 曲面 ----------
    const surfGeo = new THREE.BufferGeometry();
    const sPos = new Float32Array(NG * NG * 3), sCol = new Float32Array(NG * NG * 3);
    surfGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
    surfGeo.setAttribute('color', new THREE.BufferAttribute(sCol, 3));
    const idx = [];
    for (let i = 0; i < NG - 1; i++) for (let j = 0; j < NG - 1; j++) {
      const a = i * NG + j, b = a + 1, c = a + NG, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    surfGeo.setIndex(idx);
    const surfMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.05, side: THREE.DoubleSide, transparent: true, opacity: 0.82, depthWrite: false, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    const surf = new THREE.Mesh(surfGeo, surfMat);
    surf.renderOrder = 2;
    scene.add(surf);
    const wireMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 });
    const wire = new THREE.LineSegments(new THREE.BufferGeometry(), wireMat);
    wire.renderOrder = 3;
    scene.add(wire);

    // ---------- 資料點、落地線、目前配方 ----------
    const ballGeo = new THREE.SphereGeometry(1, 20, 14);
    const ballMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.1 });
    const balls = new THREE.InstancedMesh(ballGeo, ballMat, MAXP);
    balls.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    balls.count = 0;
    balls.renderOrder = 4;
    scene.add(balls);
    const dropMat = new THREE.LineDashedMaterial({ color: 0x888888, dashSize: 0.08, gapSize: 0.06, transparent: true, opacity: 0.8 });
    const drops = new THREE.LineSegments(new THREE.BufferGeometry(), dropMat);
    scene.add(drops);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.95 });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.15, 40), ringMat);
    ring.rotation.x = -Math.PI / 2;
    scene.add(ring);
    const curLineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
    const curLine = new THREE.Line(new THREE.BufferGeometry(), curLineMat);
    scene.add(curLine);
    const curDotMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, emissive: 0x000000 });
    const curDot = new THREE.Mesh(new THREE.SphereGeometry(0.075, 18, 12), curDotMat);
    scene.add(curDot);

    // ---------- 文字標籤（畫成貼圖，自己畫上下標） ----------
    let labels = [];
    function makeLabel(str, opts) {
      opts = opts || {};
      const size = opts.size || 30, pad = 10;
      const c = document.createElement('canvas'), g = c.getContext('2d');
      const w = Math.ceil(H.chemWidth(g, str, size, 600)) + 2 * pad, h = Math.ceil(size * 1.7);
      c.width = w; c.height = h;
      if (opts.bg) {
        g.fillStyle = opts.bg;
        const r = h / 2.4;
        g.beginPath(); g.moveTo(r, 0); g.arcTo(w, 0, w, h, r); g.arcTo(w, h, 0, h, r); g.arcTo(0, h, 0, 0, r); g.arcTo(0, 0, w, 0, r); g.closePath(); g.fill();
      }
      H.chemText(g, str, pad, h * 0.66, size, opts.color || colors.text, 'left', 600, opts.bg ? null : (colors.dark ? 'rgba(20,22,26,0.85)' : 'rgba(255,255,255,0.9)'));
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
      const sp = new THREE.Sprite(mat);
      const sh = (opts.h || 0.2);
      sp.scale.set(sh * w / h, sh, 1);
      sp.center.set(opts.cx == null ? 0.5 : opts.cx, opts.cy == null ? 0.5 : opts.cy);
      sp.renderOrder = 10;
      scene.add(sp);
      labels.push(sp);
      return sp;
    }
    function clearLabels() {
      labels.forEach(function (sp) { scene.remove(sp); sp.material.map.dispose(); sp.material.dispose(); });
      labels = [];
    }

    // ---------- 座標換算 ----------
    function niceStep(span, n) {
      const raw = span / (n || 5), p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
      return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
    }
    function logTicks(lo, hi) {
      const out = [], e0 = Math.floor(Math.log10(lo)), e1 = Math.ceil(Math.log10(hi));
      for (let e = e0; e <= e1; e++) [1, 2, 5].forEach(function (m) { const v = m * Math.pow(10, e); if (v >= lo * 0.999 && v <= hi * 1.001) out.push(v); });
      return out;
    }
    function linTicks(hi) {
      const st = niceStep(hi, 4), out = [];
      for (let v = 0; v <= hi * 1.0001; v += st) out.push(+v.toPrecision(6));
      return out;
    }
    /** 刻度文字：用 ^ 表示上標（畫在貼圖上） */
    function tickText(v) {
      if (v === 0) return '0';
      const p = H.sciParts(v, 2);
      if (p.e == null) return H.sigf(v, 2);
      const m = p.m.replace(/\.0$/, '');
      return (m === '1' ? '' : m + '×') + '10^' + H.num(p.e, 0);
    }
    let map = null;
    function makeMap(d, log) {
      const ax = function (lo, hi) {
        if (log) { const a = Math.log(lo), b = Math.log(hi); return { f: function (v) { return (Math.log(Math.max(v, 1e-300)) - a) / (b - a); }, lo: lo, hi: hi }; }
        return { f: function (v) { return v / hi; }, lo: 0, hi: hi };
      };
      const mx = ax(d.Imin, d.Imax), mz = ax(d.Pmin, d.Pmax);
      // 高度範圍：曲面在格點上的最大最小值，以及量到的點
      let rlo = Infinity, rhi = 0;
      if (d.surf) {
        for (let i = 0; i < NG; i++) for (let j = 0; j < NG; j++) {
          const I = inv(mx, i / (NG - 1), log), P = inv(mz, j / (NG - 1), log), r = d.surf(I, P);
          if (r > 0 && isFinite(r)) { rlo = Math.min(rlo, r); rhi = Math.max(rhi, r); }
        }
      }
      d.pts.forEach(function (p) { rlo = Math.min(rlo, p.rate); rhi = Math.max(rhi, p.rate); });
      if (!(rhi > 0)) { rlo = 1e-7; rhi = 1e-4; }
      if (!(rlo > 0) || rlo >= rhi) rlo = rhi / 1000;
      let my;
      if (log) {
        const lo = Math.pow(10, Math.floor(Math.log10(rlo) + 1e-9)), hi = Math.pow(10, Math.ceil(Math.log10(rhi) - 1e-9));
        const a = Math.log(lo), b = Math.log(Math.max(hi, lo * 10));
        my = { f: function (v) { return (Math.log(Math.max(v, 1e-300)) - a) / (b - a); }, lo: lo, hi: Math.exp(b) };
      } else {
        const st = niceStep(rhi, 4), hi = Math.ceil(rhi / st - 1e-9) * st;
        my = { f: function (v) { return v / hi; }, lo: 0, hi: hi };
      }
      return { x: mx, z: mz, y: my, log: log };
    }
    function inv(m, u, log) { return log ? Math.exp(Math.log(m.lo) + u * (Math.log(m.hi) - Math.log(m.lo))) : (m.lo + u * (m.hi - m.lo)) || 1e-12; }
    // 低濃度在離鏡頭最近的角（X0 + L, Z0 + L），濃度往後方增加
    function X(I) { return X0 + L * (1 - map.x.f(I)); }
    function Z(P) { return Z0 + L * (1 - map.z.f(P)); }
    function Y(r) { return HY * Math.max(0, Math.min(1.08, map.y.f(r))); }

    // ---------- 重建 ----------
    let lastData = null;
    function rebuild() {
      const d = H.data();
      lastData = d;
      colors = H.colors();
      const log = H.scale() === 'log';
      map = makeMap(d, log);
      // 曲面
      const lowC = C(colors.iod), highC = C(colors.pos), tmp = new THREE.Color();
      surf.visible = wire.visible = !!d.surf;
      if (d.surf) {
        for (let i = 0; i < NG; i++) for (let j = 0; j < NG; j++) {
          const k = (i * NG + j) * 3, I = inv(map.x, i / (NG - 1), log), P = inv(map.z, j / (NG - 1), log);
          const r = d.surf(I, P), h = Y(r);
          sPos[k] = X(I); sPos[k + 1] = h; sPos[k + 2] = Z(P);
          tmp.copy(lowC).lerp(highC, Math.min(1, h / HY));
          sCol[k] = tmp.r; sCol[k + 1] = tmp.g; sCol[k + 2] = tmp.b;
        }
        surfGeo.attributes.position.needsUpdate = true;
        surfGeo.attributes.color.needsUpdate = true;
        surfGeo.computeVertexNormals();
        surfGeo.computeBoundingSphere();
        const wp = [], step = 5;
        for (let i = 0; i < NG; i += step) for (let j = 0; j < NG - 1; j++) {
          const a = (i * NG + j) * 3, b = a + 3;
          wp.push(sPos[a], sPos[a + 1] + 0.004, sPos[a + 2], sPos[b], sPos[b + 1] + 0.004, sPos[b + 2]);
        }
        for (let j = 0; j < NG; j += step) for (let i = 0; i < NG - 1; i++) {
          const a = (i * NG + j) * 3, b = a + NG * 3;
          wp.push(sPos[a], sPos[a + 1] + 0.004, sPos[a + 2], sPos[b], sPos[b + 1] + 0.004, sPos[b + 2]);
        }
        wire.geometry.dispose();
        wire.geometry = new THREE.BufferGeometry();
        wire.geometry.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3));
      }
      // 資料點
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3();
      const dp = [];
      const n = Math.min(MAXP, d.pts.length);
      for (let i = 0; i < n; i++) {
        const p = d.pts[d.pts.length - n + i], x = X(p.I0), y = Y(p.rate), z = Z(p.P0), r = p.latest ? 0.11 : 0.085;
        m4.compose(p3.set(x, y, z), q, s3.set(r, r, r));
        balls.setMatrixAt(i, m4);
        balls.setColorAt(i, C(p.latest ? colors.probe : colors.accent));
        dp.push(x, y, z, x, 0.002, z);
      }
      balls.count = n;
      balls.instanceMatrix.needsUpdate = true;
      if (balls.instanceColor) balls.instanceColor.needsUpdate = true;
      drops.geometry.dispose();
      drops.geometry = new THREE.BufferGeometry();
      drops.geometry.setAttribute('position', new THREE.Float32BufferAttribute(dp.length ? dp : [0, 0, 0, 0, 0, 0], 3));
      drops.computeLineDistances();
      drops.visible = dp.length > 0;
      // 目前配方
      const cx = X(d.cur.I0), cz = Z(d.cur.P0);
      ring.position.set(cx, 0.006, cz);
      const cy = d.surf ? Y(d.surf(d.cur.I0, d.cur.P0)) : 0;
      curLine.geometry.dispose();
      curLine.geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(cx, 0.006, cz), new THREE.Vector3(cx, cy, cz)]);
      curLine.visible = curDot.visible = !!d.surf;
      curDot.position.set(cx, cy, cz);
      buildFrame(d, log);
      applyColors();
      // 說明
      const narrow = host.clientWidth < 560;
      hudTL.innerHTML = hudText(d, narrow);
      // 窄螢幕：右上資訊移到右下、操作提示收起，避免兩塊文字重疊
      hudTR.style.top = narrow ? 'auto' : '';
      hudTR.style.bottom = narrow ? '8px' : '';
      hudBL.style.display = narrow ? 'none' : '';
      hudTR.innerHTML = H.num(d.Tc, 1) + ' °C' + (d.rx === 'ps' ? (d.salt ? T('・離子強度固定', ' · fixed ionic strength') : T('・純水補足', ' · plain-water top-up')) : '') + '<br>' +
        T('球：這個溫度量到的 ' + d.pts.length + ' 杯', 'Balls: ' + d.pts.length + ' runs at this temperature');
      requestRender();
    }
    function hudText(d, narrow) {
      const ox = d.rx === 'x' ? 'X' : 'S<sub>2</sub>O<sub>8</sub><sup>2−</sup>';
      const law = 'r = k[' + ox + ']' + (d.kind === 'model' ? '' : '<sup>m</sup>') + '[I<sup>−</sup>]' + (d.kind === 'model' ? '' : '<sup>n</sup>');
      const head = d.kind === 'model' ? T('曲面：', 'Surface: ') + law + T('（模型）', ' (model)') :
        d.kind === 'truth' ? T('曲面：揭曉的速率定律 ', 'Surface: the revealed rate law ') + law :
          d.kind === 'answer' ? T('曲面：你核對的答案 ', 'Surface: the answer you checked ') + law :
            T('核對答案之後，這裡會畫出你的速率定律曲面', 'Check an answer to see your rate-law surface');
      const tail = H.scale() === 'log' ? T('對數座標：曲面變成平面，兩個方向的斜率 = 兩個級數', 'Log axes: the surface becomes a plane; its two slopes are the two orders') :
        T('線性座標：一級是直線、二級是拋物線', 'Linear axes: first order is a straight line, second order a parabola');
      return narrow ? head : head + '<br><span style="color:var(--muted)">' + tail + '</span>';
    }
    function buildFrame(d, log) {
      clearLabels();
      const gp = [], fp = [];
      const xt = log ? logTicks(d.Imin, d.Imax) : linTicks(d.Imax), zt = log ? logTicks(d.Pmin, d.Pmax) : linTicks(d.Pmax);
      const yt = log ? logTicks(map.y.lo, map.y.hi).filter(function (v) { return Math.abs(Math.log10(v) - Math.round(Math.log10(v))) < 1e-6; }) : linTicks(map.y.hi);
      const yE = 0.003;
      xt.forEach(function (v) { const x = X(v); if (x < X0 - 1e-6 || x > X0 + L + 1e-6) return; gp.push(x, yE, Z0, x, yE, Z0 + L); });
      zt.forEach(function (v) { const z = Z(v); if (z < Z0 - 1e-6 || z > Z0 + L + 1e-6) return; gp.push(X0, yE, z, X0 + L, yE, z); });
      // 後方兩面牆的高度格線
      yt.forEach(function (v) { const y = Y(v); if (y > HY * 1.08) return; gp.push(X0, y, Z0, X0 + L, y, Z0, X0, y, Z0, X0, y, Z0 + L); });
      // 框線
      const top = HY;
      fp.push(X0, 0, Z0, X0 + L, 0, Z0, X0 + L, 0, Z0, X0 + L, 0, Z0 + L, X0 + L, 0, Z0 + L, X0, 0, Z0 + L, X0, 0, Z0 + L, X0, 0, Z0,
        X0, 0, Z0, X0, top, Z0, X0 + L, 0, Z0, X0 + L, top, Z0, X0, 0, Z0 + L, X0, top, Z0 + L);
      grid.geometry.dispose(); grid.geometry = new THREE.BufferGeometry(); grid.geometry.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3));
      frame.geometry.dispose(); frame.geometry = new THREE.BufferGeometry(); frame.geometry.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
      // 刻度文字
      const every = function (arr) { return arr.length > 7 ? arr.filter(function (v, i) { return i % 2 === 0; }) : arr; };
      every(xt).forEach(function (v) { const x = X(v); if (x < X0 - 1e-6 || x > X0 + L + 1e-6) return; makeLabel(tickText(v), { h: 0.27, color: colors.muted }).position.set(x, 0, Z0 + L + 0.3); });
      every(zt).forEach(function (v) { const z = Z(v); if (z < Z0 - 1e-6 || z > Z0 + L + 1e-6) return; makeLabel(tickText(v), { h: 0.27, color: colors.muted, cx: 0 }).position.set(X0 + L + 0.16, 0, z); });
      yt.forEach(function (v) { const y = Y(v); if (y > HY * 1.08) return; makeLabel(tickText(v), { h: 0.27, color: colors.muted, cx: 1 }).position.set(X0 - 0.12, y, Z0 + L + 0.04); });
      // 軸名
      const oxs = d.rx === 'x' ? '[X]0' : '[S2O8^2−]0';
      makeLabel('[I^−]0 (M)', { h: 0.36, color: colors.text }).position.set(X0 + L / 2, 0, Z0 + L + 0.85);
      makeLabel(oxs + ' (M)', { h: 0.36, color: colors.text, cx: 0.5 }).position.set(X0 + L + 1.15, 0, Z0 + L / 2);
      makeLabel(T('初速率 r（M/s）', 'initial rate r (M/s)'), { h: 0.34, color: colors.text, cx: 0.5, cy: 0 }).position.set(X0, HY + 0.2, Z0 + L);
    }

    function applyColors() {
      colors = H.colors();
      floorMat.color.set(colors.dark ? '#30343c' : '#eef1f5');
      floorMat.opacity = colors.dark ? 0.55 : 0.6;
      gridMat.color.set(colors.text); gridMat.opacity = colors.dark ? 0.16 : 0.14;
      frameMat.color.set(colors.text); frameMat.opacity = colors.dark ? 0.5 : 0.45;
      wireMat.color.set(colors.dark ? '#ffffff' : '#ffffff'); wireMat.opacity = colors.dark ? 0.28 : 0.55;
      dropMat.color.set(colors.muted);
      ringMat.color.set(colors.text);
      curLineMat.color.set(colors.text);
      curDotMat.color.set(colors.text);
    }

    function fit(force) {
      const span = L * 1.8;
      const dist = (span * 0.5) / Math.tan(camera.fov * Math.PI / 360) / Math.min(1.2, camera.aspect);
      if (force) {
        controls.target.set(0, HY * 0.36, 0);
        camera.position.copy(viewDir).multiplyScalar(dist).add(controls.target);
      }
      camera.updateProjectionMatrix();
      controls.update();
    }
    let vw = 0, raf = 0;
    function canvasHeight(w) { return w < 560 ? Math.round(Math.max(340, w * 1.12)) : 400; }
    function resize3() {
      const w = host.clientWidth;
      if (!w) return;
      const h = canvasHeight(w);
      canvas.style.height = h + 'px';
      vw = w;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      fit(false);
      if (lastData) rebuild();
      requestRender();
    }
    function renderNow() {
      if (!api.active || document.hidden) return;
      const moved = controls.update();
      renderer.render(scene, camera);
      if (moved) requestRender();
    }
    function requestRender() {
      if (raf || !api.active) return;
      raf = requestAnimationFrame(function () { raf = 0; renderNow(); });
    }
    const ro = window.ResizeObserver ? new ResizeObserver(function () { if (host.clientWidth !== vw) resize3(); }) : null;
    if (ro) ro.observe(host); else window.addEventListener('resize', resize3);
    controls.addEventListener('change', requestRender);
    const onVisible = function () { if (!document.hidden) requestRender(); };
    document.addEventListener('visibilitychange', onVisible);
    canvas.addEventListener('webglcontextlost', function (ev) {
      ev.preventDefault();
      if (api.active) H.contextLost();
    });

    const api = {
      active: true,
      rebuild: function () { if (api.active) rebuild(); },
      frame: function () { if (api.active) requestRender(); },
      onTheme: function () { if (api.active) rebuild(); },
      resetCamera: function () { fit(true); requestRender(); },
      info: function () { return { pts: balls.count, surf: surf.visible, log: !!(map && map.log), kind: lastData && lastData.kind }; },
      dispose: function () {
        api.active = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize3);
        document.removeEventListener('visibilitychange', onVisible);
        controls.dispose();
        clearLabels();
        const mats = new Set();
        scene.traverse(function (o) {
          if (o.geometry) o.geometry.dispose();
          if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { mats.add(m); });
        });
        mats.forEach(function (m) { m.dispose(); });
        renderer.dispose();
        renderer.forceContextLoss();
        canvas.remove(); hudTL.remove(); hudTR.remove(); hudBL.remove();
      }
    };

    applyColors();
    const w0 = host.clientWidth;
    if (w0) {
      const h0 = canvasHeight(w0);
      canvas.style.height = h0 + 'px';
      vw = w0;
      renderer.setSize(w0, h0, false);
      camera.aspect = w0 / h0;
    }
    fit(true);
    return api;
  }

  window.Clock3D = { create: create };
})();
