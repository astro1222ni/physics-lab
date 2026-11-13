/*
 * seawater-3d.js — 「海水的溫度、鹽度與密度」的 3D 密度曲面（three.js）
 *
 * 由 js/seawater.js 在使用者按「3D」時才載入；切回 2D 時整個釋放。
 * 用法：window.Seawater3D.create({ THREE, OrbitControls }, 容器, bridge) → { active, frame, busy, onShow, onTheme, resetCamera, camTo, dispose }
 *
 * 水平兩軸 = 鹽度（x）與溫度（y），高度 = −σ（越重越低，就像重的水會往下沉）。
 * 所以等密度線在曲面上是水平的等高線；A、B 兩團水連成的直線（弦）是「把密度直接平均」，
 * 曲面上的混合點在弦的下方 —— 曲面往下彎（等密度線是彎的），這就是混合增密（cabbeling）。
 */
(function () {
  'use strict';
  const XW = 10, YW = 8, ZH = 5; // 場景單位：鹽度軸長、溫度軸長、密度高度

  function create(lib, host, B) {
    const THREE = lib.THREE;
    const K = B.K, T = B.T, D = B.D;
    let C = B.colors();

    // ---------- 畫布與 HUD ----------
    const wrap = document.createElement('div');
    wrap.className = 'c3-wrap';
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', T('3D 密度曲面：水平是鹽度與溫度，高度是密度（越重越低），可拖曳旋轉、縮放',
      '3D density surface: salinity and temperature across, density as height (heavier is lower); drag to rotate, pinch or scroll to zoom'));
    wrap.appendChild(canvas);
    const hud = document.createElement('div');
    hud.className = 'c3-hud';
    hud.setAttribute('aria-hidden', 'true');
    hud.innerHTML = '<div class="tl"><span data-k="ab"></span><span class="m" data-k="mix"></span></div>' +
      '<div class="br"><span class="m" data-k="note"></span></div>';
    wrap.appendChild(hud);
    host.appendChild(wrap);
    const hudEl = {}, hudLast = {};
    hud.querySelectorAll('[data-k]').forEach(function (e) { hudEl[e.getAttribute('data-k')] = e; });
    function setHud(k, html) { if (hudLast[k] !== html) { hudLast[k] = html; hudEl[k].innerHTML = html; } }

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
    } catch (e) {
      wrap.remove();
      throw e;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1.6, 0.05, 400);
    camera.up.set(0, 0, 1);
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.rotateSpeed = 0.7;
    controls.enablePan = false;
    controls.minDistance = 6;
    controls.maxDistance = 60;
    controls.target.set(0, 0, 0);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x334155, 0.9);
    scene.add(hemi);
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
    keyLight.position.set(-6, -9, 14);
    scene.add(keyLight);
    const rim = new THREE.DirectionalLight(0x93c5fd, 0.35);
    rim.position.set(8, 10, 4);
    scene.add(rim);

    function disposeObject(obj) {
      obj.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); });
      });
    }
    function col(c) { return new THREE.Color(c || '#888888'); }

    // ---------- 文字標籤（Sprite，固定像素大小） ----------
    const RES = 3;
    let cw = 600, ch = 440;
    function makeLabelCanvas(text, color, plain) {
      const font = (plain ? '600 ' : '700 ') + 12 * RES + 'px ' + D.FONT;
      const c = document.createElement('canvas');
      let g = c.getContext('2d');
      g.font = font;
      const tw = g.measureText(text).width;
      c.width = Math.ceil(tw + 12 * RES); c.height = Math.ceil(19 * RES);
      g = c.getContext('2d');
      if (!plain) {
        g.beginPath();
        const r = c.height / 2 - RES;
        g.moveTo(r + RES, RES); g.arcTo(c.width - RES, RES, c.width - RES, c.height - RES, r); g.arcTo(c.width - RES, c.height - RES, RES, c.height - RES, r);
        g.arcTo(RES, c.height - RES, RES, RES, r); g.arcTo(RES, RES, c.width - RES, RES, r); g.closePath();
        g.fillStyle = D.dark ? 'rgba(8,12,26,0.82)' : 'rgba(255,255,255,0.9)'; g.fill();
        g.strokeStyle = color; g.globalAlpha = 0.8; g.lineWidth = RES; g.stroke(); g.globalAlpha = 1;
      } else {
        g.font = font; g.lineWidth = 4 * RES; g.lineJoin = 'round';
        g.strokeStyle = D.dark ? 'rgba(8,12,26,0.85)' : 'rgba(255,255,255,0.9)';
        g.textBaseline = 'middle'; g.strokeText(text, 6 * RES, c.height / 2 + RES * 0.5);
      }
      g.font = font; g.textBaseline = 'middle'; g.fillStyle = color; g.fillText(text, 6 * RES, c.height / 2 + RES * 0.5);
      return c;
    }
    function fitLabel(sp) {
      const k = 2 * Math.tan(camera.fov * Math.PI / 360) / Math.max(1, ch);
      sp.scale.set(sp.userData.lw * k, sp.userData.lh * k, 1);
    }
    function label(text, color, plain) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false }));
      sp.userData = { isLabel: true, plain: !!plain };
      sp.renderOrder = 30;
      setLabel(sp, text, color);
      return sp;
    }
    function setLabel(sp, text, color) {
      const key = text + '|' + color + '|' + (D.dark ? 1 : 0);
      if (sp.userData.key === key) return;
      const c = makeLabelCanvas(text, color, sp.userData.plain);
      if (sp.material.map) sp.material.map.dispose();
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
      sp.material.map = tex; sp.material.needsUpdate = true;
      sp.userData.lw = c.width / RES; sp.userData.lh = c.height / RES; sp.userData.key = key;
      fitLabel(sp);
    }

    // ---------- 座標換算 ----------
    let R = B.range(), sigLo = 0, sigHi = 1;
    function sigmaSpan() {
      // 這個範圍內的 σ 最小（最暖最淡）與最大（最冷最鹹）
      sigLo = K.sigma(R[0], B.T_HI, 0);
      sigHi = K.sigma(R[1], Math.max(B.T_LO, K.freezing(R[1])), 0);
    }
    function X(S) { return (S - R[0]) / (R[1] - R[0]) * XW - XW / 2; }
    function Y(t) { return (t - B.T_LO) / (B.T_HI - B.T_LO) * YW - YW / 2; }
    function Z(sig) { return -((sig - sigLo) / (sigHi - sigLo) - 0.5) * ZH; }
    function P(S, t) { return new THREE.Vector3(X(S), Y(t), Z(K.sigma(S, t, 0))); }

    // ---------- 靜態場景（範圍、深淺色變了才重建） ----------
    const world = new THREE.Group();
    scene.add(world);
    let builtKey = '';
    const axisLabels = [];
    function buildWorld() {
      R = B.range();
      const key = R.join(',') + '|' + (D.dark ? 1 : 0) + '|' + T('a', 'b') + '|' + C['sw-sea1'] + C['sw-sea2'];
      if (key === builtKey) return;
      builtKey = key;
      while (world.children.length) { const o = world.children.pop(); disposeObject(o); }
      axisLabels.length = 0;
      sigmaSpan();
      scene.background = col(C['canvas-bg']);
      // 曲面：頂點顏色依密度，冰點以下（會結冰）的區域淡白色
      const NX = 90, NY = 90;
      const geo = new THREE.PlaneGeometry(XW, YW, NX, NY);
      const pos = geo.attributes.position, cols = new Float32Array(pos.count * 3);
      const c1 = col(D.dark ? '#7dd3fc' : '#a5f3fc'), c2 = col(D.dark ? '#0b2a5b' : '#1e40af'), ice = col(D.dark ? '#e2e8f0' : '#ffffff'), tc = new THREE.Color();
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i);
        const S = R[0] + (x + XW / 2) / XW * (R[1] - R[0]), t = B.T_LO + (y + YW / 2) / YW * (B.T_HI - B.T_LO);
        const sg = K.sigma(S, t, 0);
        pos.setZ(i, Z(sg));
        const u = Math.max(0, Math.min(1, (sg - sigLo) / (sigHi - sigLo)));
        tc.copy(c1).lerp(c2, Math.pow(u, 0.9));
        if (t < K.freezing(S)) tc.lerp(ice, 0.55);
        cols[3 * i] = tc.r; cols[3 * i + 1] = tc.g; cols[3 * i + 2] = tc.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      geo.computeVertexNormals();
      const surf = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide,
        transparent: true, opacity: 0.93, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
      surf.renderOrder = 1;
      world.add(surf);
      // 四周的側壁：從曲面邊緣垂到底板，看起來像一塊地形模型，高低更容易看出
      const zb0 = -ZH / 2 - 0.6, skirtMat = new THREE.MeshStandardMaterial({ color: col(D.dark ? '#1e3a5f' : '#93c5fd'), roughness: 0.8, transparent: true, opacity: D.dark ? 0.55 : 0.45, side: THREE.DoubleSide, depthWrite: false });
      function skirt(fn) {
        const n = 60, v = [], idx = [];
        for (let i = 0; i <= n; i++) { const q = fn(i / n); v.push(q.x, q.y, q.z, q.x, q.y, zb0); }
        for (let i = 0; i < n; i++) { const a = 2 * i; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
        const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); gg.setIndex(idx); gg.computeVertexNormals();
        const m = new THREE.Mesh(gg, skirtMat); m.renderOrder = 0; world.add(m);
      }
      skirt(function (u) { return P(R[0] + u * (R[1] - R[0]), B.T_LO); });
      skirt(function (u) { return P(R[1], B.T_LO + u * (B.T_HI - B.T_LO)); });
      skirt(function (u) { return P(R[0] + u * (R[1] - R[0]), B.T_HI); });
      skirt(function (u) { return P(R[0], B.T_LO + u * (B.T_HI - B.T_LO)); });
      // 底板與外框
      const zb = -ZH / 2 - 0.6;
      const base = new THREE.Mesh(new THREE.PlaneGeometry(XW, YW), new THREE.MeshBasicMaterial({ color: col(C.text), transparent: true, opacity: D.dark ? 0.05 : 0.04, depthWrite: false }));
      base.position.z = zb; world.add(base);
      const frameMat = new THREE.LineBasicMaterial({ color: col(C.text), transparent: true, opacity: 0.35 });
      const fp = [[-XW / 2, -YW / 2], [XW / 2, -YW / 2], [XW / 2, YW / 2], [-XW / 2, YW / 2], [-XW / 2, -YW / 2]].map(function (q) { return new THREE.Vector3(q[0], q[1], zb); });
      world.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(fp), frameMat));
      // 曲面四邊的垂直線，讓高低一眼看出
      const edgeMat = new THREE.LineBasicMaterial({ color: col(C.text), transparent: true, opacity: 0.18 });
      [[R[0], B.T_LO], [R[1], B.T_LO], [R[1], B.T_HI], [R[0], B.T_HI]].forEach(function (q) {
        const p = P(q[0], Math.max(q[1], q[1] === B.T_LO ? B.T_LO : q[1]));
        world.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(p.x, p.y, zb), p]), edgeMat));
      });
      // 曲面邊緣
      const rimMat = new THREE.LineBasicMaterial({ color: col(C.text), transparent: true, opacity: 0.4 });
      function edgeLine(fn, n) { const a = []; for (let i = 0; i <= n; i++) a.push(fn(i / n)); world.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(a), rimMat)); }
      edgeLine(function (u) { return P(R[0] + u * (R[1] - R[0]), B.T_LO); }, 60);
      edgeLine(function (u) { return P(R[0] + u * (R[1] - R[0]), B.T_HI); }, 60);
      edgeLine(function (u) { return P(R[0], B.T_LO + u * (B.T_HI - B.T_LO)); }, 60);
      edgeLine(function (u) { return P(R[1], B.T_LO + u * (B.T_HI - B.T_LO)); }, 60);
      // 等密度線：在曲面上是水平的等高線，也投影到底板
      const lv = B.levels(), isoMat = new THREE.LineBasicMaterial({ color: col(C['sw-iso']), transparent: true, opacity: 0.9 }),
        isoMinor = new THREE.LineBasicMaterial({ color: col(C['sw-iso']), transparent: true, opacity: 0.4 }),
        isoBase = new THREE.LineBasicMaterial({ color: col(C['sw-iso']), transparent: true, opacity: 0.22 });
      lv.all.forEach(function (sig) {
        const major = Math.abs(sig / lv.major - Math.round(sig / lv.major)) < 1e-6;
        const segs = [[]]; let s = null;
        for (let t = B.T_LO; t <= B.T_HI + 1e-9; t += 0.25) {
          s = B.sOnIso(sig, t, s);
          if (!isFinite(s) || s < R[0] || s > R[1]) { if (segs[segs.length - 1].length) segs.push([]); if (!isFinite(s)) s = null; continue; }
          segs[segs.length - 1].push([X(s), Y(t)]);
        }
        const z = Z(sig) + 0.015;
        let lab = null;
        segs.forEach(function (sg) {
          if (sg.length < 2) return;
          world.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(sg.map(function (q) { return new THREE.Vector3(q[0], q[1], z); })), major ? isoMat : isoMinor));
          if (major) {
            world.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(sg.map(function (q) { return new THREE.Vector3(q[0], q[1], zb + 0.01); })), isoBase));
            lab = sg[sg.length - 1];
          }
        });
        if (major && lab) {
          const sp = label(B.num(sig, 0), D.mix(C['sw-iso'], C.text, 0.35), true);
          sp.position.set(lab[0], lab[1], z); sp.center.set(0, 0.2); world.add(sp);
        }
      });
      // 冰點線
      const icePts = [];
      for (let i = 0; i <= 80; i++) { const S = R[0] + i / 80 * (R[1] - R[0]), tf = K.freezing(S); if (tf >= B.T_LO) icePts.push(P(S, tf).add(new THREE.Vector3(0, 0, 0.02))); }
      if (icePts.length > 1) {
        world.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(icePts), new THREE.LineBasicMaterial({ color: col(C['sw-ice']) })));
        const sp = label(T('冰點', 'Freezing'), C['sw-ice'], true); sp.position.copy(icePts[Math.floor(icePts.length * 0.15)]); sp.center.set(0, -0.3); world.add(sp);
      }
      // 最大密度的溫度（只在冰點以上的部分）
      const tmd = [];
      for (let i = 0; i <= 120; i++) {
        const S = R[0] + i / 120 * (R[1] - R[0]), t = K.tMaxDensity(S);
        if (t >= B.T_LO && t >= K.freezing(S)) tmd.push(P(S, t).add(new THREE.Vector3(0, 0, 0.03)));
      }
      if (tmd.length > 1) {
        const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints(tmd), new THREE.LineDashedMaterial({ color: col(C['sw-tmd']), dashSize: 0.12, gapSize: 0.1 }));
        ln.computeLineDistances(); world.add(ln);
        const sp = label(T('最大密度', 'Max density'), C['sw-tmd'], true); sp.position.copy(tmd[Math.floor(tmd.length * 0.2)]); sp.center.set(0, 1.3); world.add(sp);
      }
      // 軸的刻度與名稱（放在底板邊上）
      const tickS = R[1] - R[0] > 20 ? 10 : 2;
      for (let s = Math.ceil(R[0] / tickS) * tickS; s <= R[1] + 1e-9; s += tickS) {
        const sp = label(String(s), C.muted, true); sp.position.set(X(s), -YW / 2 - 0.25, zb); sp.center.set(0.5, 1); world.add(sp);
      }
      for (let t = 0; t <= 30; t += 10) {
        const sp = label(t + ' °C', C.muted, true); sp.position.set(XW / 2 + 0.25, Y(t), zb); sp.center.set(0, 0.5); world.add(sp);
      }
      const ls = label(T('鹽度 →', 'Salinity →'), C.muted, true); ls.position.set(0, -YW / 2 - 1.3, zb); ls.center.set(0.5, 1); world.add(ls); axisLabels.push(ls);
      const lt = label(T('溫度 →', 'Temperature →'), C.muted, true); lt.position.set(XW / 2 + 1.6, Y(15), zb); lt.center.set(0, 0.5); world.add(lt); axisLabels.push(lt);
      const lz = label(T('↓ 越重越低', '↓ heavier is lower'), C.muted, true); lz.position.set(-XW / 2, -YW / 2, Z(sigLo) + 0.2); lz.center.set(1.05, 0); world.add(lz); axisLabels.push(lz);
    }

    // ---------- 動態：A、B、混合水、弦 ----------
    function ballMesh(color) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.17, 32, 20), new THREE.MeshStandardMaterial({ color: col(color), roughness: 0.35, metalness: 0.05, emissive: col(color), emissiveIntensity: 0.25 }));
      m.renderOrder = 5;
      return m;
    }
    const dyn = new THREE.Group();
    scene.add(dyn);
    const balls = { A: ballMesh(C['sw-a']), B: ballMesh(C['sw-b']), M: ballMesh(C['sw-m']) };
    balls.M.scale.setScalar(0.8);
    Object.keys(balls).forEach(function (k) { dyn.add(balls[k]); });
    const chordGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const chord = new THREE.Line(chordGeo, new THREE.LineBasicMaterial({ color: col(C['sw-m']), transparent: true, opacity: 0.95 }));
    chord.renderOrder = 4; dyn.add(chord);
    // 混合線在曲面上的投影（曲面上的路徑）：這才是混合後真正的密度
    const pathGeo = new THREE.BufferGeometry().setFromPoints(new Array(41).fill(0).map(function () { return new THREE.Vector3(); }));
    const pathLine = new THREE.Line(pathGeo, new THREE.LineDashedMaterial({ color: col(C['sw-m']), dashSize: 0.1, gapSize: 0.07 }));
    pathLine.renderOrder = 4; dyn.add(pathLine);
    // 弦上的點（密度直接平均）到曲面上的點（真正的混合水）之間的落差
    const dropGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const drop = new THREE.Line(dropGeo, new THREE.LineBasicMaterial({ color: col(C.accent) }));
    drop.renderOrder = 6; dyn.add(drop);
    const linDot = new THREE.Mesh(new THREE.SphereGeometry(0.08, 20, 12), new THREE.MeshBasicMaterial({ color: col(C['sw-m']) }));
    dyn.add(linDot);
    // 垂到底板的細線（看位置用）
    const stemMat = new THREE.LineBasicMaterial({ color: col(C.text), transparent: true, opacity: 0.25 });
    const stems = {};
    ['A', 'B'].forEach(function (k) {
      stems[k] = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), stemMat);
      dyn.add(stems[k]);
    });
    const labs = { A: label('A', C['sw-a']), B: label('B', C['sw-b']), M: label(T('混合', 'Mix'), C['sw-m']) };
    Object.keys(labs).forEach(function (k) { dyn.add(labs[k]); });
    function recolorDyn() {
      ['A', 'B', 'M'].forEach(function (k) {
        const c = col(C[k === 'A' ? 'sw-a' : k === 'B' ? 'sw-b' : 'sw-m']);
        balls[k].material.color.copy(c); balls[k].material.emissive.copy(c);
      });
      chord.material.color.copy(col(C['sw-m'])); pathLine.material.color.copy(col(C['sw-m'])); linDot.material.color.copy(col(C['sw-m']));
      drop.material.color.copy(col(C.accent)); stemMat.color.copy(col(C.text));
    }
    let dynKey = '';
    function updateDyn() {
      const c = B.cur();
      const key = [c.A.T, c.A.S, c.B.T, c.B.S, B.state.f, R.join(','), T('a', 'b'), D.dark].join('|');
      if (key === dynKey) return;
      dynKey = key;
      const pA = P(c.A.S, c.A.T), pB = P(c.B.S, c.B.T), pM = P(c.M.S, c.M.T);
      balls.A.position.copy(pA); balls.B.position.copy(pB); balls.M.position.copy(pM);
      chordGeo.attributes.position.setXYZ(0, pA.x, pA.y, pA.z); chordGeo.attributes.position.setXYZ(1, pB.x, pB.y, pB.z); chordGeo.attributes.position.needsUpdate = true;
      const pp = pathGeo.attributes.position;
      for (let i = 0; i <= 40; i++) { const m = K.mix(c.A, c.B, i / 40), q = P(m.S, m.T); pp.setXYZ(i, q.x, q.y, q.z + 0.02); }
      pp.needsUpdate = true; pathLine.computeLineDistances();
      const lin = new THREE.Vector3(pM.x, pM.y, Z(c.lin));
      linDot.position.copy(lin);
      dropGeo.attributes.position.setXYZ(0, lin.x, lin.y, lin.z); dropGeo.attributes.position.setXYZ(1, pM.x, pM.y, pM.z); dropGeo.attributes.position.needsUpdate = true;
      const zb = -ZH / 2 - 0.6;
      [['A', pA], ['B', pB]].forEach(function (q) {
        const g = stems[q[0]].geometry.attributes.position;
        g.setXYZ(0, q[1].x, q[1].y, q[1].z); g.setXYZ(1, q[1].x, q[1].y, zb); g.needsUpdate = true;
      });
      setLabel(labs.A, 'A  σ ' + B.num(c.sA, 2), C['sw-a']);
      setLabel(labs.B, 'B  σ ' + B.num(c.sB, 2), C['sw-b']);
      setLabel(labs.M, T('混合 σ ', 'Mix σ ') + B.num(c.sM, 2), C['sw-m']);
      labs.A.position.copy(pA); labs.B.position.copy(pB); labs.M.position.copy(pM);
      setHud('ab', 'A：σ ' + B.num(c.sA, 3) + '　B：σ ' + B.num(c.sB, 3));
      setHud('mix', T('混合 σ ', 'Mix σ ') + B.num(c.sM, 3) + T('，比平均重 ', ', ') + B.num(c.excess, 3) + T('', ' heavier than the average'));
      setHud('note', narrow ? T('越低越重；實線＝密度平均，曲面上＝真的混合', 'Lower = heavier; chord = averaged, surface = real mix')
        : T('紫色實線＝把兩團水的密度直接平均；虛線（貼著曲面）＝真正混合後的密度；它比較低（比較重），中間的橘線就是混合增密', 'Solid purple chord = simply averaging the two densities; dashed path on the surface = the real mixtures, which lie lower (heavier) — the orange drop is cabbeling'));
    }

    // ---------- 相機 ----------
    function presetFor(kind) {
      const dir = kind === 'top' ? new THREE.Vector3(0, -0.02, 1) : kind === 'side' ? new THREE.Vector3(0.02, -1, 0.08) : new THREE.Vector3(0.5, -1, 0.75);
      dir.normalize();
      const fitD = 8.6 / Math.tan(camera.fov * Math.PI / 360) / Math.min(1, camera.aspect * 0.95);
      const tgt = new THREE.Vector3(0, 0, kind === 'top' ? 0 : -0.2);
      return { pos: tgt.clone().add(dir.multiplyScalar(Math.min(controls.maxDistance, fitD))), tgt: tgt };
    }
    let camAnim = null;
    function camTo(kind, animate) {
      const Pp = presetFor(kind);
      if (!animate || B.reducedMotion) {
        camAnim = null;
        camera.position.copy(Pp.pos); controls.target.copy(Pp.tgt); controls.update(); render();
        return;
      }
      camAnim = { t0: performance.now(), dur: 800, p0: camera.position.clone(), t0v: controls.target.clone(), p1: Pp.pos, t1: Pp.tgt };
      B.request();
    }
    function stepCam() {
      if (!camAnim) return;
      const A = camAnim;
      const u = Math.min(1, (performance.now() - A.t0) / A.dur), e = 1 - Math.pow(1 - u, 3);
      const tg = A.t0v.clone().lerp(A.t1, e);
      const d0 = A.p0.clone().sub(A.t0v), d1 = A.p1.clone().sub(A.t1);
      const len = d0.length() * (1 - e) + d1.length() * e;
      const dir = d0.normalize().lerp(d1.normalize(), e);
      if (dir.lengthSq() < 1e-6) dir.copy(d1).normalize();
      controls.target.copy(tg);
      camera.position.copy(tg).add(dir.normalize().multiplyScalar(len));
      if (u >= 1) camAnim = null;
    }

    // ---------- 標籤擺放：A、B、混合 互相不重疊 ----------
    const tmp = new THREE.Vector3();
    function placeLabels() {
      if (axisLabels.length === 3) { axisLabels[1].visible = !narrow; axisLabels[2].visible = !narrow; }
      const items = [];
      ['A', 'B', 'M'].forEach(function (k) {
        const sp = labs[k];
        tmp.copy(sp.position).project(camera);
        items.push({ sp: sp, sx: (tmp.x + 1) / 2 * cw, sy: (1 - tmp.y) / 2 * ch, w: sp.userData.lw, h: sp.userData.lh, k: k });
      });
      const placed = [];
      items.forEach(function (it) {
        const below = it.k === 'M';
        const cx = Math.max(0, Math.min(1, it.sx < cw / 2 ? Math.min(0.5, (it.sx - 4) / it.w) : 1 - Math.min(0.5, (cw - 4 - it.sx) / it.w)));
        const sx = it.sx + (0.5 - cx) * it.w;
        let off = 14;
        for (let guard = 0; guard < 8; guard++) {
          const top = below ? it.sy + off : it.sy - off - it.h, bot = top + it.h;
          const hit = placed.some(function (q) { return Math.abs(q.sx - sx) < (q.w + it.w) / 2 + 4 && !(bot < q.top - 3 || top > q.bot + 3); });
          if (!hit) { placed.push({ sx: sx, w: it.w, top: top, bot: bot }); break; }
          off += it.h + 4;
        }
        it.sp.center.set(cx, below ? 1 + off / it.h : -off / it.h);
      });
    }

    let moving = false, narrow = false;
    function render() {
      if (!api.active || document.hidden) return;
      const want = Math.min(window.devicePixelRatio || 1, 2);
      if (renderer.getPixelRatio() !== want) { renderer.setPixelRatio(want); renderer.setSize(cw, ch, false); }
      stepCam();
      moving = controls.update();
      placeLabels();
      renderer.render(scene, camera);
    }
    function sizeOf(w) { return w < 560 ? 420 : 500; }
    function resize3() {
      const w = wrap.clientWidth;
      if (!w) return;
      const h = sizeOf(w);
      if (canvas.style.height !== h + 'px') canvas.style.height = h + 'px';
      const nar = w < 560;
      if (nar !== narrow) { narrow = nar; Object.keys(hudLast).forEach(function (k) { delete hudLast[k]; }); dynKey = ''; }
      cw = w; ch = h;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      scene.traverse(function (o) { if (o.userData && o.userData.isLabel) fitLabel(o); });
      render();
    }
    const ro = window.ResizeObserver ? new ResizeObserver(function () { resize3(); }) : null;
    if (ro) ro.observe(wrap); else window.addEventListener('resize', resize3);
    controls.addEventListener('change', function () { B.request(); });
    canvas.addEventListener('webglcontextlost', function (ev) {
      ev.preventDefault();
      if (api.active && B.onContextLost) B.onContextLost();
    });

    function update() {
      const r = B.range();
      if (r[0] !== R[0] || r[1] !== R[1]) builtKey = '';
      buildWorld();
      updateDyn();
    }
    const api = {
      active: true,
      frame: function () { update(); render(); },
      busy: function () { return !!camAnim || moving; },
      onShow: function () { resize3(); update(); camTo('tilt', false); },
      onTheme: function () {
        C = B.colors();
        Object.keys(hudLast).forEach(function (k) { delete hudLast[k]; });
        builtKey = ''; dynKey = '';
        Object.keys(labs).forEach(function (k) { labs[k].userData.key = ''; });
        recolorDyn();
        update(); render();
      },
      resetCamera: function () { camTo('tilt', true); },
      camTo: function (kind) { camTo(kind, true); },
      dispose: function () {
        api.active = false;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize3);
        controls.dispose();
        disposeObject(scene);
        renderer.dispose();
        renderer.forceContextLoss();
        wrap.remove();
      }
    };

    const w0 = wrap.clientWidth;
    if (w0) {
      narrow = w0 < 560;
      cw = w0; ch = sizeOf(w0);
      canvas.style.height = ch + 'px';
      renderer.setSize(cw, ch, false);
      camera.aspect = cw / ch;
      camera.updateProjectionMatrix();
    }
    update();
    camTo('tilt', false);
    return api;
  }

  window.Seawater3D = { create: create };
})();
