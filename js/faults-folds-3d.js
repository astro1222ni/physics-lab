/*
 * faults-folds-3d.js — 「地質構造：斷層、褶皺與應力」的 3D 方塊圖（three.js）
 *
 * 由 js/faults-folds.js 在使用者按「3D」時才載入；切回 2D 時整個釋放。
 * 用法：window.Faults3D.create({ THREE, OrbitControls }, 容器, bridge) → { active, frame, busy, onShow, onTheme, rebuild, resetCamera, camTo, dispose }
 *
 * 斷層：方塊先用斷層面切成上盤、下盤兩個凸多面體，上盤沿滑動方向平移，再切回方塊的範圍（侵蝕時再切掉侵蝕面以上）。
 * 每一個面的貼圖都是逐點呼叫 FaultsCore.faultLayerAt 算出來的，所以地層、岩脈的錯動和 2D 剖面、地質圖完全一致。
 * 褶皺：頂面是高度場 min(侵蝕面, 褶皺面)，四面牆從底部一直到頂面，貼圖一樣逐點查 foldLayerAt。
 * 比例 1:1（沒有垂直誇大）。
 */
(function () {
  'use strict';
  const SC = 1 / 300;           // 場景單位：300 m = 1
  const LAYERS = ['#f2dfae', '#c7b088', '#e6c592', '#9db497', '#efd3a2', '#b79f7c', '#d8bf8b', '#a2b6a6', '#e5cb9b', '#b09776', '#dac291', '#97ab9a', '#e1c08b', '#a68f74'];

  function create(lib, host, B) {
    const THREE = lib.THREE;
    const K = B.K, T = B.T, D = B.D;
    let C = B.colors();

    // ---------- 畫布與 HUD ----------
    const wrap = document.createElement('div');
    wrap.className = 'c3-wrap';
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', T('3D 地質方塊圖：可以看到地層、斷層與褶皺的立體形狀，可拖曳旋轉、縮放',
      '3D geologic block diagram showing the layers, fault and folds in three dimensions; drag to rotate, pinch or scroll to zoom'));
    wrap.appendChild(canvas);
    const hud = document.createElement('div');
    hud.className = 'c3-hud';
    hud.setAttribute('aria-hidden', 'true');
    hud.innerHTML = '<div class="tl"><span data-k="a"></span><span class="m" data-k="b"></span></div>' +
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
    const camera = new THREE.PerspectiveCamera(36, 1.6, 0.05, 500);
    camera.up.set(0, 0, 1);
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.rotateSpeed = 0.7;
    controls.enablePan = false;
    controls.minDistance = 8;
    controls.maxDistance = 80;
    controls.target.set(0, 0, -2.4);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x8a7f72, 1.9);
    scene.add(hemi);
    const keyLight = new THREE.DirectionalLight(0xfff4e0, 1.9);
    keyLight.position.set(-8, -12, 16);
    scene.add(keyLight);
    const fill = new THREE.DirectionalLight(0xbfd7ff, 0.6);
    fill.position.set(10, 6, 6);
    scene.add(fill);

    function disposeObject(obj) {
      obj.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); });
      });
    }
    function col(c) { return new THREE.Color(c || '#888888'); }

    // ---------- 文字標籤（Sprite，固定像素大小） ----------
    const RES = 3;
    let cw = 600, ch = 460;
    function makeLabelCanvas(text, color) {
      const font = '700 ' + 12 * RES + 'px ' + D.FONT;
      const c = document.createElement('canvas');
      let g = c.getContext('2d');
      g.font = font;
      const tw = g.measureText(text).width;
      c.width = Math.ceil(tw + 12 * RES); c.height = Math.ceil(19 * RES);
      g = c.getContext('2d');
      g.beginPath();
      const r = c.height / 2 - RES;
      g.moveTo(r + RES, RES); g.arcTo(c.width - RES, RES, c.width - RES, c.height - RES, r); g.arcTo(c.width - RES, c.height - RES, RES, c.height - RES, r);
      g.arcTo(RES, c.height - RES, RES, RES, r); g.arcTo(RES, RES, c.width - RES, RES, r); g.closePath();
      g.fillStyle = D.dark ? 'rgba(8,12,26,0.82)' : 'rgba(255,255,255,0.9)'; g.fill();
      g.strokeStyle = color; g.globalAlpha = 0.8; g.lineWidth = RES; g.stroke(); g.globalAlpha = 1;
      g.font = font; g.textBaseline = 'middle'; g.fillStyle = color; g.fillText(text, 6 * RES, c.height / 2 + RES * 0.5);
      return c;
    }
    function fitLabel(sp) {
      const k = 2 * Math.tan(camera.fov * Math.PI / 360) / Math.max(1, ch);
      sp.scale.set(sp.userData.lw * k, sp.userData.lh * k, 1);
    }
    function label(text, color) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false }));
      sp.userData = { isLabel: true };
      sp.renderOrder = 30;
      const c = makeLabelCanvas(text, color);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
      sp.material.map = tex;
      sp.userData.lw = c.width / RES; sp.userData.lh = c.height / RES;
      fitLabel(sp);
      return sp;
    }

    // ---------- 地層顏色 ----------
    let PAL = [];
    function hexRGB(h) {
      h = h.trim(); if (h.length === 4) h = '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
      return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    }
    function readPal() {
      PAL = [];
      for (let c = 0; c <= K.DIKE; c++) {
        const rgb = hexRGB(c === K.BASE ? '#c79aa0' : c === K.DIKE ? (D.dark ? '#e11d48' : '#9f1239') : LAYERS[c]);
        const k = D.dark && c !== K.DIKE ? 0.86 : 1;   // 3D 有打光，深色模式只稍微調暗
        PAL[c] = [rgb[0] * k, rgb[1] * k, rgb[2] * k];
      }
    }
    readPal();
    // 逐點上色的貼圖：fn(i, j) 回傳地層代號；相鄰不同層的界線加深
    function texture(pw, ph, fn) {
      const c = document.createElement('canvas');
      c.width = pw; c.height = ph;
      const g = c.getContext('2d'), id = g.createImageData(pw, ph), d = id.data;
      const codes = new Int16Array(pw * ph);
      for (let j = 0; j < ph; j++) for (let i = 0; i < pw; i++) codes[j * pw + i] = fn(i, j);
      for (let j = 0; j < ph; j++) for (let i = 0; i < pw; i++) {
        const q = j * pw + i, c0 = codes[q], o = q * 4;
        let cc = c0;
        if (cc === K.AIR) {   // 邊緣的空氣：借用鄰居顏色，避免貼圖邊上出現白邊
          cc = (i > 0 && codes[q - 1] !== K.AIR) ? codes[q - 1] : (j > 0 && codes[q - pw] !== K.AIR) ? codes[q - pw] : (j < ph - 1 && codes[q + pw] !== K.AIR) ? codes[q + pw] : 0;
        }
        const p = PAL[cc] || PAL[0];
        let k = 1;
        if ((i > 0 && codes[q - 1] !== c0 && codes[q - 1] !== K.AIR && c0 !== K.AIR) || (j > 0 && codes[q - pw] !== c0 && codes[q - pw] !== K.AIR && c0 !== K.AIR)) k = 0.7;
        d[o] = p[0] * k; d[o + 1] = p[1] * k; d[o + 2] = p[2] * k; d[o + 3] = 255;
      }
      g.putImageData(id, 0, 0);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      return tex;
    }
    function rockMat(tex) {
      return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, metalness: 0, side: THREE.DoubleSide,
        polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    }

    // ---------- 凸多面體（面＝頂點陣列，單位 m）與平面切割 ----------
    function V(x, y, z) { return [x, y, z]; }
    function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
    function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
    function addv(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
    function mul(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
    function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
    function nrm(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
    function box(x0, x1, y0, y1, z0, z1) {
      const p = function (i, j, k) { return V(i ? x1 : x0, j ? y1 : y0, k ? z1 : z0); };
      return [
        [p(0, 0, 0), p(0, 1, 0), p(1, 1, 0), p(1, 0, 0)], [p(0, 0, 1), p(1, 0, 1), p(1, 1, 1), p(0, 1, 1)],
        [p(0, 0, 0), p(1, 0, 0), p(1, 0, 1), p(0, 0, 1)], [p(0, 1, 0), p(0, 1, 1), p(1, 1, 1), p(1, 1, 0)],
        [p(0, 0, 0), p(0, 0, 1), p(0, 1, 1), p(0, 1, 0)], [p(1, 0, 0), p(1, 1, 0), p(1, 1, 1), p(1, 0, 1)]
      ];
    }
    // 保留 n·p ≤ d 的部分；切口補上一個面（標記 tag）
    function clip(poly, n, d, tag) {
      const out = [], cap = [];
      const EPS = 1e-6;
      poly.forEach(function (f) {
        const pts = f.pts || f, res = [];
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i], b = pts[(i + 1) % pts.length], da = dot(n, a) - d, db = dot(n, b) - d;
          if (da <= EPS) res.push(a);
          if ((da < -EPS && db > EPS) || (da > EPS && db < -EPS)) {
            const t = da / (da - db), p = addv(a, mul(sub(b, a), t));
            res.push(p); cap.push(p);
          }
          if (Math.abs(da) <= EPS) cap.push(a);
        }
        if (res.length >= 3) out.push({ pts: res, tag: f.tag || 'box' });
      });
      if (cap.length >= 3) {
        const c = mul(cap.reduce(addv, [0, 0, 0]), 1 / cap.length);
        const ref = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
        const eu = nrm(cross(ref, n)), ev = cross(n, eu);
        const uniq = [];
        cap.forEach(function (p) { if (!uniq.some(function (q) { return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < 1e-3; })) uniq.push(p); });
        uniq.sort(function (a, b) { return Math.atan2(dot(sub(a, c), ev), dot(sub(a, c), eu)) - Math.atan2(dot(sub(b, c), ev), dot(sub(b, c), eu)); });
        if (uniq.length >= 3) out.push({ pts: uniq, tag: tag });
      }
      return out;
    }
    function translate(poly, u) { return poly.map(function (f) { return { pts: f.pts.map(function (p) { return addv(p, u); }), tag: f.tag }; }); }
    function clipBox(poly, ztop) {
      const L = K.L;
      poly = clip(poly, [1, 0, 0], L, 'box'); poly = clip(poly, [-1, 0, 0], L, 'box');
      poly = clip(poly, [0, 1, 0], L, 'box'); poly = clip(poly, [0, -1, 0], L, 'box');
      poly = clip(poly, [0, 0, -1], K.DEPTH, 'box');
      if (ztop != null) poly = clip(poly, [0, 0, 1], ztop, 'top');
      return poly;
    }
    // 把一個平面多邊形做成貼了地層貼圖的網格；sample(p) 傳回該點的地層代號
    function faceMesh(pts, outward, texel, sample) {
      const n = outward, ref = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0];
      const eu = nrm(cross(ref, n)), ev = cross(n, eu);
      let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
      pts.forEach(function (p) { const u = dot(p, eu), v = dot(p, ev); u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); });
      const du = Math.max(1, u1 - u0), dv = Math.max(1, v1 - v0);
      const pw = Math.max(2, Math.min(512, Math.ceil(du / texel))), ph = Math.max(2, Math.min(512, Math.ceil(dv / texel)));
      const base = mul(n, dot(pts[0], n));   // 平面上的一點（沿法線）
      const inward = mul(n, -1.5);
      const tex = texture(pw, ph, function (i, j) {
        const u = u0 + (i + 0.5) / pw * du, v = v1 - (j + 0.5) / ph * dv;
        return sample(addv(addv(addv(base, mul(eu, u)), mul(ev, v)), inward));
      });
      const pos = [], uv = [], idx = [];
      pts.forEach(function (p) {
        pos.push(p[0] * SC, p[1] * SC, p[2] * SC);
        uv.push((dot(p, eu) - u0) / du, (dot(p, ev) - v0) / dv);
      });
      for (let i = 1; i < pts.length - 1; i++) idx.push(0, i, i + 1);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      // 法線一律朝外（三角形方向可能反了）
      const nn = geo.getAttribute('normal');
      if (nn.count && dot([nn.getX(0), nn.getY(0), nn.getZ(0)], n) < 0) {
        for (let i = 0; i < nn.count; i++) nn.setXYZ(i, n[0], n[1], n[2]);
      }
      return new THREE.Mesh(geo, rockMat(tex));
    }
    function polyMeshes(group, poly, texel, sample) {
      const c = mul(poly.reduce(function (s, f) { return addv(s, f.pts.reduce(addv, [0, 0, 0])); }, [0, 0, 0]),
        1 / poly.reduce(function (s, f) { return s + f.pts.length; }, 0));
      poly.forEach(function (f) {
        let n = nrm(cross(sub(f.pts[1], f.pts[0]), sub(f.pts[2], f.pts[0])));
        for (let i = 2; i < f.pts.length && Math.hypot(n[0], n[1], n[2]) < 0.5; i++) n = nrm(cross(sub(f.pts[1], f.pts[0]), sub(f.pts[i], f.pts[0])));
        const fc = mul(f.pts.reduce(addv, [0, 0, 0]), 1 / f.pts.length);
        if (dot(n, sub(fc, c)) < 0) n = mul(n, -1);
        const m = faceMesh(f.pts, n, texel, sample);
        m.userData.tag = f.tag; m.userData.pts = f.pts;
        group.add(m);
      });
    }

    // ---------- 箭頭 ----------
    function arrow(from, dir, len, color, thick) {
      const g = new THREE.Group();
      const m = new THREE.MeshStandardMaterial({ color: col(color), roughness: 0.45, metalness: 0.05, emissive: col(color), emissiveIntensity: 0.25 });
      const hl = Math.min(len * 0.45, 0.9), r = thick || 0.12;
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r, r, Math.max(0.01, len - hl), 14), m);
      shaft.position.y = (len - hl) / 2;
      const head = new THREE.Mesh(new THREE.ConeGeometry(r * 2.6, hl, 18), m);
      head.position.y = len - hl / 2;
      g.add(shaft); g.add(head);
      g.position.set(from[0], from[1], from[2]);
      g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dir[0], dir[1], dir[2]).normalize());
      return g;
    }

    // ---------- 場景 ----------
    const world = new THREE.Group();
    scene.add(world);
    let rock = new THREE.Group(), deco = new THREE.Group();
    world.add(rock); world.add(deco);
    let builtKey = '', fineTimer = 0;
    function keyOf() {
      const s = B.state, F = B.fault(), Fo = B.fold();
      return s.mode === 'fault'
        ? ['f', F.pl.strike.toFixed(3), F.pl.dip.toFixed(3), F.u.map(function (v) { return v.toFixed(2); }).join(','), F.erode ? 1 : 0, F.st.crit ? 1 : 0, F.st.regime, F.st.SH.toFixed(1), F.st.Sh.toFixed(1), (F.st.eH[0]).toFixed(4), D.dark ? 1 : 0].join('|')
        : ['o', Fo.lam, Fo.A, Fo.plunge, Fo.e, Fo.eH[0].toFixed(4), Fo.eH[1].toFixed(4), D.dark ? 1 : 0].join('|');
    }
    function clearGroup(g) { world.remove(g); disposeObject(g); }
    function build(fine) {
      const key = keyOf();
      if (builtKey === key + '*' || (!fine && builtKey === key)) return;
      clearGroup(rock); clearGroup(deco);
      rock = new THREE.Group(); deco = new THREE.Group();
      world.add(rock); world.add(deco);
      const texel = fine ? 9 : 24;
      if (B.state.mode === 'fault') buildFault(texel); else buildFold(texel);
      builtKey = key + (fine ? '*' : '');
      if (!fine) {
        clearTimeout(fineTimer);
        fineTimer = setTimeout(function () { if (api.active && keyOf() === key) { build(true); B.request(); } }, 260);
      }
    }
    function buildFault(texel) {
      const F = B.fault(), pl = F.pl, n = pl.n, L = K.L, u = F.u;
      const ext = Math.hypot(u[0], u[1], u[2]) + 50;
      const sample = function (p) { return K.faultLayerAt(F, p[0], p[1], p[2]); };
      const zcut = F.erode ? F.e : null;
      // 下盤：方塊 ∩ {n·p ≤ 0}
      let fw = box(-L, L, -L, L, -K.DEPTH, 0);
      fw = clip(fw, n, 0, 'fault');
      fw = clipBox(fw, zcut);
      // 上盤：放大的方塊 ∩ {n·p ≥ 0}，平移 u，再切回方塊
      let hw = box(-L - ext, L + ext, -L - ext, L + ext, -K.DEPTH - ext, 0);
      hw = clip(hw, mul(n, -1), 0, 'fault');
      hw = translate(hw, u);
      hw = clipBox(hw, zcut);
      polyMeshes(rock, fw, texel, sample);
      polyMeshes(rock, hw, texel, sample);
      // 斷層面的輪廓（下盤切口）：會滑動＝實線，鎖住＝虛線
      const fc = fw.filter(function (f) { return f.tag === 'fault'; })[0];
      if (fc) {
        const pts = fc.pts.concat([fc.pts[0]]).map(function (p) { const q = addv(p, mul(n, 4)); return new THREE.Vector3(q[0] * SC, q[1] * SC, q[2] * SC); });
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const mat = F.st.crit ? new THREE.LineBasicMaterial({ color: col(C['ff-fault']) })
          : new THREE.LineDashedMaterial({ color: col(C['ff-fault']), dashSize: 0.35, gapSize: 0.25 });
        const line = new THREE.Line(geo, mat);
        if (!F.st.crit) line.computeLineDistances();
        line.renderOrder = 5;
        deco.add(line);
        // 斷層面淡淡上色（只在還沒錯開時看得到）
        if (F.d === 0) {
          const g2 = new THREE.BufferGeometry().setFromPoints(fc.pts.map(function (p) { const q = addv(p, mul(n, 2)); return new THREE.Vector3(q[0] * SC, q[1] * SC, q[2] * SC); }));
          const idx = []; for (let i = 1; i < fc.pts.length - 1; i++) idx.push(0, i, i + 1); g2.setIndex(idx);
          deco.add(new THREE.Mesh(g2, new THREE.MeshBasicMaterial({ color: col(C['ff-fault']), transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false })));
        }
      }
      // 應力箭頭：水平兩對放在方塊外，Sv 在上方
      const st = F.st, zc = -1000 * SC, R0 = L * SC + 0.5;
      const roleCol = function (v) { return v === st.s1 ? C['ff-s1'] : v === st.s3 ? C['ff-s3'] : C.muted; };
      const lenOf = function (v) { return 0.8 + 1.4 * Math.min(2.6, v / st.Sv); };
      [[st.eH, st.SH, 'SH'], [st.eh, st.Sh, 'Sh']].forEach(function (q) {
        const e = q[0], len = lenOf(q[1]), c = roleCol(q[1]);
        // 方塊是正方形：沿 e 方向到邊界的距離
        const reach = L * SC / Math.max(Math.abs(e[0]), Math.abs(e[1])) + 0.4;
        [1, -1].forEach(function (s) {
          const tip = [e[0] * s * reach, e[1] * s * reach, zc];
          deco.add(arrow([tip[0] + e[0] * s * len, tip[1] + e[1] * s * len, zc], [-e[0] * s, -e[1] * s, 0], len, c));
        });
        const lp = new THREE.Vector3(e[0] * (reach + len + 0.5), e[1] * (reach + len + 0.5), zc + 0.6);
        const sp = label(q[2] + (q[1] === st.s1 ? ' = σ1' : q[1] === st.s3 ? ' = σ3' : ' = σ2'), c); sp.position.copy(lp); deco.add(sp);
      });
      const top = Math.max(0, u[2]) * SC, lv = lenOf(st.Sv);
      deco.add(arrow([0.6 * L * SC, -0.6 * L * SC, top + 0.4 + lv], [0, 0, -1], lv, roleCol(st.Sv)));
      const sv = label('Sv' + (st.Sv === st.s1 ? ' = σ1' : st.Sv === st.s3 ? ' = σ3' : ' = σ2'), roleCol(st.Sv));
      sv.position.set(0.6 * L * SC, -0.6 * L * SC, top + 0.8 + lv); deco.add(sv);
      void R0;
      // 上盤、下盤
      const hd = pl.hd, zt = (F.erode ? F.e : 0) * SC;
      const DZ = ['北', '東北', '東', '東南', '南', '西南', '西', '西北'], DE = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
      const dn = function (a) { const i = Math.round((((a % 360) + 360) % 360) / 45) % 8; return [DZ[i], DE[i]]; };
      const ahd = Math.atan2(hd[0], hd[1]) * 180 / Math.PI, vert = pl.dip > 85;
      const nh = vert ? T(dn(ahd)[0] + '側', dn(ahd)[1] + ' side') : T('上盤', 'Hanging wall');
      const nf = vert ? T(dn(ahd + 180)[0] + '側', dn(ahd + 180)[1] + ' side') : T('下盤', 'Footwall');
      const lh = label(nh, C.text); lh.position.set(hd[0] * 1150 * SC, hd[1] * 1150 * SC, (F.erode ? F.e : u[2]) * SC + 0.3); deco.add(lh);
      const lf = label(nf, C.text); lf.position.set(-hd[0] * 1150 * SC, -hd[1] * 1150 * SC, zt + 0.3); deco.add(lf);
      // 滑動方向（上盤的相對位移）
      if (F.d > 0) {
        const s = F.rs.slip, p0 = [hd[0] * 260, hd[1] * 260, -300];
        const q = addv(addv(p0, mul(pl.sv, 0)), u);
        deco.add(arrow([q[0] * SC - s[0] * 0.9, q[1] * SC - s[1] * 0.9, q[2] * SC - s[2] * 0.9], s, 1.8, C['ff-fault'], 0.09));
      }
      northArrow(top);
    }
    function buildFold(texel) {
      const Fo = B.fold(), L = K.L, N = 120;
      const topZ = function (x, y) { return K.foldTop(Fo, x, y); };
      // 頂面：高度場網格，貼圖＝地質圖
      const pos = [], uv = [], idx = [];
      for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
        const x = -L + 2 * L * i / N, y = -L + 2 * L * j / N;
        pos.push(x * SC, y * SC, topZ(x, y) * SC); uv.push(i / N, j / N);
      }
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const a = j * (N + 1) + i, b = a + 1, c2 = a + N + 1, d2 = c2 + 1;
        idx.push(a, b, d2, a, d2, c2);
      }
      const tp = Math.max(2, Math.min(512, Math.ceil(2 * L / texel)));
      const topTex = texture(tp, tp, function (i, j) {
        const x = -L + (i + 0.5) / tp * 2 * L, y = L - (j + 0.5) / tp * 2 * L;
        return K.foldLayerAt(Fo, x, y, topZ(x, y) - 0.5);
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx); g.computeVertexNormals();
      rock.add(new THREE.Mesh(g, rockMat(topTex)));
      // 四面牆：底部 −DEPTH 到頂面；貼圖用 (s, z)
      let zmax = -K.DEPTH;
      for (let i = 0; i <= N; i++) { const s = -L + 2 * L * i / N; zmax = Math.max(zmax, topZ(s, -L), topZ(s, L), topZ(-L, s), topZ(L, s)); }
      [[[1, 0], [0, -1]], [[0, 1], [1, 0]], [[-1, 0], [0, 1]], [[0, -1], [-1, 0]]].forEach(function (w) {
        // w[0] = 牆沿著的方向，w[1] = 朝外的法線
        const t = w[0], o = w[1];
        const P = function (s) { return [o[0] * L + t[0] * s, o[1] * L + t[1] * s]; };
        const wp = [], wu = [], wi = [];
        for (let i = 0; i <= N; i++) {
          const s = -L + 2 * L * i / N, p = P(s), zt = topZ(p[0], p[1]);
          wp.push(p[0] * SC, p[1] * SC, zt * SC, p[0] * SC, p[1] * SC, -K.DEPTH * SC);
          wu.push(i / N, (zt + K.DEPTH) / (zmax + K.DEPTH), i / N, 0);
        }
        for (let i = 0; i < N; i++) { const a = 2 * i; wi.push(a, a + 1, a + 3, a, a + 3, a + 2); }
        const pw = Math.max(2, Math.min(512, Math.ceil(2 * L / texel))), ph = Math.max(2, Math.min(512, Math.ceil((zmax + K.DEPTH) / texel)));
        const tex = texture(pw, ph, function (i, j) {
          const s = -L + (i + 0.5) / pw * 2 * L, z = zmax - (j + 0.5) / ph * (zmax + K.DEPTH), p = P(s);
          return K.foldLayerAt(Fo, p[0] - o[0] * 1.5, p[1] - o[1] * 1.5, Math.min(z, topZ(p[0], p[1]) - 0.5));
        });
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(wu, 2));
        geo.setIndex(wi);
        const nn = []; for (let i = 0; i < wp.length / 3; i++) nn.push(o[0], o[1], 0);
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(nn, 3));
        rock.add(new THREE.Mesh(geo, rockMat(tex)));
      });
      // 底面
      const bot = new THREE.Mesh(new THREE.PlaneGeometry(2 * L * SC, 2 * L * SC), new THREE.MeshStandardMaterial({ color: col('#c79aa0'), roughness: 0.95, side: THREE.DoubleSide }));
      bot.position.z = -K.DEPTH * SC; rock.add(bot);
      // 褶皺軸跡（背斜、向斜）沿頂面畫線
      const ex = Fo.eAx, eh = Fo.eH;
      for (let k = -6; k <= 6; k++) {
        const xp = k * Fo.lam / 2;
        const pts = [];
        for (let i = -60; i <= 60; i++) {
          const s = i / 60 * L * 1.5, x = eh[0] * xp + ex[0] * s, y = eh[1] * xp + ex[1] * s;
          if (Math.abs(x) > L || Math.abs(y) > L) continue;
          pts.push(new THREE.Vector3(x * SC, y * SC, (topZ(x, y) + 6) * SC));
        }
        if (pts.length < 2 || Fo.A < 20) continue;
        const anti = k % 2 === 0;
        deco.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: col(anti ? C['ff-s1'] : C['ff-s3']) })));
        const mid = pts[Math.floor(pts.length / 2)];
        const sp = label(anti ? T('背斜', 'Anticline') : T('向斜', 'Syncline'), anti ? C['ff-s1'] : C['ff-s3']);
        sp.position.set(mid.x, mid.y, mid.z + 0.5); deco.add(sp);
      }
      // σ1 擠壓
      const reach = L * SC / Math.max(Math.abs(eh[0]), Math.abs(eh[1])) + 0.4, zc = -1000 * SC;
      [1, -1].forEach(function (s) {
        deco.add(arrow([eh[0] * s * (reach + 2), eh[1] * s * (reach + 2), zc], [-eh[0] * s, -eh[1] * s, 0], 2, C['ff-s1']));
      });
      const sl = label('σ1', C['ff-s1']); sl.position.set(eh[0] * (reach + 2.6), eh[1] * (reach + 2.6), zc + 0.6); deco.add(sl);
      northArrow(Math.max(0, zmax) * SC);
    }
    function northArrow(top) {
      const L = K.L * SC;
      deco.add(arrow([L - 0.5, L + 0.6, top + 0.15], [0, 1, 0], 1.4, C.text, 0.07));
      const n = label(T('北', 'N'), C.text); n.position.set(L - 0.5, L + 2.4, top + 0.15); deco.add(n);
    }

    // ---------- HUD ----------
    const regimeName = function (r) { return r === 'normal' ? T('正斷層', 'Normal fault') : r === 'reverse' ? T('逆斷層', 'Reverse fault') : T('平移斷層', 'Strike-slip fault'); };
    function updateHud() {
      const nar = cw < 560;
      if (B.state.mode === 'fault') {
        const F = B.fault();
        setHud('a', regimeName(F.st.regime) + (F.st.crit ? T('：會滑動', ': slipping') : T('：還鎖住', ': locked')));
        setHud('b', T('累積滑移 ', 'Total slip ') + B.num(F.d, 0) + ' m' + (F.erode ? T('・已侵蝕成平地', ' · eroded flat') : ''));
        setHud('note', nar ? T('拖曳旋轉；輪廓線＝斷層面', 'Drag to rotate; outline = fault plane')
          : T('拖曳可旋轉。斷層面畫成輪廓線（實線＝會滑動、虛線＝鎖住）；看側面上的地層和紅色岩脈怎麼被錯開。', 'Drag to rotate. The fault plane is outlined (solid = slipping, dashed = locked); watch how the layers and the red dike are offset on the sides.'));
      } else {
        const Fo = B.fold();
        setHud('a', T('翼部傾角 ', 'Limb dip ') + B.num(Fo.limbDip, 1) + '°');
        setHud('b', T('縮短 ', 'Shortened ') + B.num(Fo.shortening * 100, 1) + '%');
        setHud('note', nar ? T('拖曳旋轉；把侵蝕面往下調看看', 'Drag to rotate; try lowering the erosion level')
          : T('拖曳可旋轉。把侵蝕面往下調：頂面露出的地層排成條帶，有傾沒時會變成 V 字形或馬蹄形。', 'Drag to rotate. Lower the erosion level: the layers show up as bands on top, and as V or horseshoe shapes when the fold plunges.'));
      }
    }

    // ---------- 相機 ----------
    function presetFor(kind) {
      const dir = kind === 'top' ? new THREE.Vector3(0, -0.02, 1) : kind === 'side' ? new THREE.Vector3(0.02, -1, 0.06) : new THREE.Vector3(0.75, -1, 0.7);
      dir.normalize();
      const fitD = 7.8 / Math.tan(camera.fov * Math.PI / 360) / Math.min(1, camera.aspect * 0.95);
      const tgt = new THREE.Vector3(0, 0, kind === 'top' ? -1 : (B.state.mode === 'fold' ? -1.6 : -2.6));
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

    let moving = false;
    function render() {
      if (!api.active || document.hidden) return;
      const want = Math.min(window.devicePixelRatio || 1, 2);
      if (renderer.getPixelRatio() !== want) { renderer.setPixelRatio(want); renderer.setSize(cw, ch, false); }
      stepCam();
      moving = controls.update();
      const sh = B.reducedMotion ? 0 : B.shake();
      world.position.set((Math.random() - 0.5) * 0.25 * sh, (Math.random() - 0.5) * 0.25 * sh, (Math.random() - 0.5) * 0.12 * sh);
      renderer.render(scene, camera);
    }
    function sizeOf(w) { return w < 560 ? 420 : 500; }
    function resize3() {
      const w = wrap.clientWidth;
      if (!w) return;
      const h = sizeOf(w);
      if (canvas.style.height !== h + 'px') canvas.style.height = h + 'px';
      if (cw !== w) Object.keys(hudLast).forEach(function (k) { delete hudLast[k]; });
      cw = w; ch = h;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      scene.traverse(function (o) { if (o.userData && o.userData.isLabel) fitLabel(o); });
      render();
    }
    function setBg() {
      scene.background = col(C['canvas-bg'] || (D.dark ? '#0b1220' : '#f8fafc'));
      hemi.intensity = D.dark ? 1.5 : 1.9;
    }
    setBg();
    const ro = window.ResizeObserver ? new ResizeObserver(function () { resize3(); }) : null;
    if (ro) ro.observe(wrap); else window.addEventListener('resize', resize3);
    controls.addEventListener('change', function () { B.request(); });
    canvas.addEventListener('webglcontextlost', function (ev) {
      ev.preventDefault();
      if (api.active && B.onContextLost) B.onContextLost();
    });

    function update() { build(false); updateHud(); }
    const api = {
      active: true,
      frame: function () { update(); render(); },
      busy: function () { return !!camAnim || moving || B.shake() > 0; },
      onShow: function () { resize3(); update(); camTo('tilt', false); },
      onTheme: function () {
        C = B.colors(); readPal(); setBg();
        Object.keys(hudLast).forEach(function (k) { delete hudLast[k]; });
        builtKey = '';
        update(); render();
      },
      rebuild: function () { builtKey = ''; update(); render(); },
      resetCamera: function () { camTo('tilt', true); },
      camTo: function (kind) { camTo(kind, true); },
      dispose: function () {
        api.active = false;
        clearTimeout(fineTimer);
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

  window.Faults3D = { create: create };
})();
