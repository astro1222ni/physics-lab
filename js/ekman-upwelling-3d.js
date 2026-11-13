/*
 * ekman-upwelling-3d.js — 「洋流與氣候：艾克曼輸送、湧升流與聖嬰」的 3D 檢視（three.js）
 *
 * 由 js/ekman-upwelling.js 在使用者按「3D」時才載入；切回 2D 時整個釋放。
 * 用法：window.Ekman3D.create({ THREE, OrbitControls }, 容器, bridge) → { active, frame, busy, onShow, onTheme, rebuild, resetCamera, camTo, dispose }
 *
 * 座標：x＝東、y＝北、z＝上。
 *   螺旋：一根水柱，各深度一支海流箭頭（顏色越深越深），海面上有風與淨輸送。
 *   沿岸：一塊海洋方塊，正面是垂直海岸的溫度剖面、頂面是海面溫度，旁邊是陸地（深度方向放大）。
 *   赤道：沿赤道的長方塊，正面是溫度剖面，裡面是傾斜的溫躍層（20 °C）面，上空是信風、雲與沃克環流。
 */
(function () {
  'use strict';

  function create(lib, host, B) {
    const THREE = lib.THREE;
    const K = B.K, T = B.T, D = B.D;
    let C = B.colors();

    // ---------- 畫布與 HUD ----------
    const wrap = document.createElement('div');
    wrap.className = 'c3-wrap';
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', T('3D 海洋：可拖曳旋轉、縮放', '3D ocean: drag to rotate, pinch or scroll to zoom'));
    wrap.appendChild(canvas);
    const hud = document.createElement('div');
    hud.className = 'c3-hud';
    hud.setAttribute('aria-hidden', 'true');
    hud.innerHTML = '<div class="tl"><span data-k="a"></span><span class="m" data-k="b"></span></div><div class="br"><span class="m" data-k="note"></span></div>';
    wrap.appendChild(hud);
    host.appendChild(wrap);
    const hudEl = {}, hudLast = {};
    hud.querySelectorAll('[data-k]').forEach(function (e) { hudEl[e.getAttribute('data-k')] = e; });
    function setHud(k, html) { if (hudLast[k] !== html) { hudLast[k] = html; hudEl[k].innerHTML = html; } }

    let renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false }); }
    catch (e) { wrap.remove(); throw e; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1.6, 0.05, 400);
    camera.up.set(0, 0, 1);
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true; controls.dampingFactor = 0.12; controls.rotateSpeed = 0.7;
    controls.enablePan = false; controls.minDistance = 5; controls.maxDistance = 70;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x334155, 1.9));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.9); keyLight.position.set(-6, -10, 14); scene.add(keyLight);
    const fill = new THREE.DirectionalLight(0x93c5fd, 0.6); fill.position.set(8, 10, 4); scene.add(fill);

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
    function makeLabelCanvas(text, color) {
      const font = '700 ' + 12 * RES + 'px ' + D.FONT;
      const c = document.createElement('canvas');
      let g = c.getContext('2d'); g.font = font;
      const tw = g.measureText(text).width;
      c.width = Math.ceil(tw + 12 * RES); c.height = Math.ceil(19 * RES);
      g = c.getContext('2d');
      const r = c.height / 2 - RES;
      g.beginPath(); g.moveTo(r + RES, RES); g.arcTo(c.width - RES, RES, c.width - RES, c.height - RES, r); g.arcTo(c.width - RES, c.height - RES, RES, c.height - RES, r);
      g.arcTo(RES, c.height - RES, RES, RES, r); g.arcTo(RES, RES, c.width - RES, RES, r); g.closePath();
      g.fillStyle = D.dark ? 'rgba(8,12,26,0.82)' : 'rgba(255,255,255,0.9)'; g.fill();
      g.strokeStyle = color; g.globalAlpha = 0.8; g.lineWidth = RES; g.stroke(); g.globalAlpha = 1;
      g.font = font; g.textBaseline = 'middle'; g.fillStyle = color; g.fillText(text, 6 * RES, c.height / 2 + RES * 0.5);
      return c;
    }
    function fitLabel(sp) { const k = 2 * Math.tan(camera.fov * Math.PI / 360) / Math.max(1, ch); sp.scale.set(sp.userData.lw * k, sp.userData.lh * k, 1); }
    function label(text, color, pos) {
      const c = makeLabelCanvas(text, color), tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false }));
      sp.userData = { isLabel: true, lw: c.width / RES, lh: c.height / RES };
      sp.renderOrder = 30; sp.position.set(pos[0], pos[1], pos[2]);
      fitLabel(sp);
      return sp;
    }

    // ---------- 幾何工具 ----------
    function arrow(from, dir, len, color, thick, opacity) {
      const g = new THREE.Group();
      if (len < 0.03) return g;
      const m = new THREE.MeshStandardMaterial({ color: col(color), roughness: 0.45, metalness: 0.05, emissive: col(color), emissiveIntensity: 0.22, transparent: opacity != null, opacity: opacity == null ? 1 : opacity });
      const r = thick || 0.07, hl = Math.min(len * 0.45, r * 5.5);
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r, r, Math.max(0.01, len - hl), 12), m);
      shaft.position.y = (len - hl) / 2;
      const head = new THREE.Mesh(new THREE.ConeGeometry(r * 2.4, hl, 16), m);
      head.position.y = len - hl / 2;
      g.add(shaft); g.add(head);
      g.position.set(from[0], from[1], from[2]);
      g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dir[0], dir[1], dir[2]).normalize());
      return g;
    }
    function texOf(canvasEl) {
      const t = new THREE.CanvasTexture(canvasEl);
      t.colorSpace = THREE.SRGBColorSpace; t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false;
      return t;
    }
    /** 四邊形：pts 依序 4 點；uv 依序（貼圖 v＝0 在畫布上緣） */
    function quad(pts, uvs, mat) {
      const geo = new THREE.BufferGeometry();
      const p = [], u = [];
      [0, 1, 2, 0, 2, 3].forEach(function (i) { p.push(pts[i][0], pts[i][1], pts[i][2]); if (uvs) u.push(uvs[i][0], 1 - uvs[i][1]); });
      geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
      if (uvs) geo.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2));
      geo.computeVertexNormals();
      return new THREE.Mesh(geo, mat);
    }
    function texMat(c) { return new THREE.MeshStandardMaterial({ map: texOf(c), roughness: 0.85, metalness: 0, side: THREE.DoubleSide }); }
    function line(pts, color, opacity, dashed) {
      const geo = new THREE.BufferGeometry().setFromPoints(pts.map(function (q) { return new THREE.Vector3(q[0], q[1], q[2]); }));
      const m = dashed ? new THREE.LineDashedMaterial({ color: col(color), dashSize: 0.18, gapSize: 0.12, transparent: true, opacity: opacity })
        : new THREE.LineBasicMaterial({ color: col(color), transparent: true, opacity: opacity });
      const l = new THREE.Line(geo, m);
      if (dashed) l.computeLineDistances();
      return l;
    }
    function box(x0, x1, y0, y1, z0, z1, color, opacity) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0),
        new THREE.MeshStandardMaterial({ color: col(color), roughness: 0.95, metalness: 0, transparent: opacity != null, opacity: opacity == null ? 1 : opacity }));
      m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      return m;
    }

    // ---------- 場景 ----------
    const world = new THREE.Group();
    scene.add(world);
    let builtKey = '';
    function keyOf() {
      const P = B.P(), s = B.state;
      return [s.mode, s.hemi, s.coast, P.lat, P.U, P.windFrom, P.Av, P.zProbe, P.H1, P.days, P.p, D.dark ? 1 : 0, T('a', 'b')].join('|');
    }
    function build() {
      const key = keyOf();
      if (key === builtKey) return;
      builtKey = key;
      world.children.slice().forEach(function (o) { world.remove(o); disposeObject(o); });
      scene.background = col(C['canvas-bg'] || (D.dark ? '#0b1220' : '#f8fafc'));
      const m = B.state.mode;
      if (m === 'spiral') buildSpiral(); else if (m === 'coast') buildCoast(); else buildEq();
    }

    // ---------- 螺旋 ----------
    const SP_H = 7, SP_R = 3.2;
    function buildSpiral() {
      const E = B.E(), P = B.P(), zm = B.zMax(), Zs = function (z) { return z / zm * SP_H; };
      // 海面與水柱
      const sea = new THREE.Mesh(new THREE.CircleGeometry(SP_R + 0.6, 64), new THREE.MeshStandardMaterial({ color: col(C['ek-sea']), transparent: true, opacity: D.dark ? 0.2 : 0.16, roughness: 0.3, side: THREE.DoubleSide, depthWrite: false }));
      world.add(sea);
      const water = new THREE.Mesh(new THREE.CylinderGeometry(SP_R + 0.6, SP_R + 0.6, SP_H, 48, 1, true), new THREE.MeshStandardMaterial({ color: col(C['ek-sea']), transparent: true, opacity: D.dark ? 0.08 : 0.06, side: THREE.DoubleSide, depthWrite: false }));
      water.rotation.x = Math.PI / 2; water.position.z = -SP_H / 2; world.add(water);
      world.add(line([[0, 0, 0.6], [0, 0, -SP_H]], C.text, 0.35, true));
      // 方位
      world.add(arrow([0, SP_R + 0.9, 0.02], [0, 1, 0], 0.7, C.muted, 0.04));
      world.add(label(T('北', 'N'), C.text, [0, SP_R + 1.9, 0]));
      world.add(label(T('東', 'E'), C.text, [SP_R + 1.6, 0, 0]));
      // 深度刻度
      const st = (function () { const raw = zm / 5, p = Math.pow(10, Math.floor(Math.log10(raw))), q = raw / p; return (q < 1.5 ? 1 : q < 3.5 ? 2 : q < 7.5 ? 5 : 10) * p; })();
      for (let z = st; z <= zm + 1e-6; z += st) {
        const ux = -0.94, uy = -0.34, r0 = SP_R + 0.6;
        world.add(line([[ux * r0, uy * r0, -Zs(z)], [ux * (r0 + 0.35), uy * (r0 + 0.35), -Zs(z)]], C.text, 0.6));
        world.add(label(B.num(z, 0) + ' m', C.muted, [ux * (r0 + 0.95), uy * (r0 + 0.95), -Zs(z)]));
      }
      if (E.DE <= zm) {
        const ring = []; for (let i = 0; i <= 64; i++) { const a = i / 64 * 2 * Math.PI; ring.push([Math.cos(a) * (SP_R + 0.6), Math.sin(a) * (SP_R + 0.6), -Zs(E.DE)]); }
        world.add(line(ring, C.text, 0.6, true));
        world.add(label('D_E = ' + B.num(E.DE, 1) + ' m', C.text, [SP_R + 0.9, -SP_R * 0.3, -Zs(E.DE)]));
      }
      if (P.U > 0) {
        const u = K.unit(E.windTo);
        world.add(arrow([-u[0] * 2.4, -u[1] * 2.4, 1.3], [u[0], u[1], 0], 4.8, C['ek-wind'], 0.1));
        world.add(label(T('風 ', 'Wind ') + B.num(P.U, 1) + ' m/s', C['ek-wind'], [-u[0] * 2.9, -u[1] * 2.9, 1.7]));
      }
      if (E.V0 <= 0) { setHud('a', T('沒有風', 'No wind')); return; }
      // 各深度的海流
      const n = 22;
      for (let i = 0; i <= n; i++) {
        const z = -zm * i / n, v = K.ekmanAt(E, z), L = v.speed / E.V0 * SP_R;
        world.add(arrow([0, 0, Zs(z)], [v.e, v.n, 0], L, B.depthColor(i / n), i === 0 ? 0.1 : 0.07));
      }
      const hod = []; for (let i = 0; i <= 200; i++) { const z = -zm * i / 200, v = K.ekmanAt(E, z); hod.push([v.e / E.V0 * SP_R, v.n / E.V0 * SP_R, Zs(z)]); }
      world.add(line(hod, C.text, 0.7));
      // 探測深度
      const pv = K.ekmanAt(E, -P.zProbe), pz = -Zs(P.zProbe);
      world.add(arrow([0, 0, pz], [pv.e, pv.n, 0], pv.speed / E.V0 * SP_R, C['ek-probe'], 0.075));
      const pr = new THREE.Mesh(new THREE.RingGeometry(SP_R + 0.45, SP_R + 0.6, 64), new THREE.MeshBasicMaterial({ color: col(C['ek-probe']), transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
      pr.position.z = pz; world.add(pr);
      // 淨輸送
      const t = K.unit(E.transAz);
      world.add(arrow([0, 0, 0.04], [t[0], t[1], 0], SP_R * 0.85, C['ek-trans'], 0.12));
      world.add(label(T('淨輸送', 'Net transport'), C['ek-trans'], [t[0] * SP_R * 1.05, t[1] * SP_R * 1.05, 0.3]));
      const s = K.unit(E.surfAz);
      world.add(label(T('表面流', 'Surface current'), B.depthColor(0), [s[0] * SP_R * 1.1, s[1] * SP_R * 1.1, 0.35]));
    }

    // ---------- 沿岸 ----------
    const CW = 10, CL = 6, CH = 4;   // 離岸方向 60 km、沿岸方向、深度 200 m
    function buildCoast() {
      const Cs = B.Cs(), E = B.E(), P = B.P(), sgn = B.state.coast === 'W' ? -1 : 1;
      const xc = -sgn * CW / 2;                                    // 海岸線
      const X = function (km) { return xc + sgn * km / B.X_KM * CW; };
      const Z = function (zm) { return zm / B.Z_COAST * CH; };
      const xo = X(B.X_KM), y0 = -CL / 2, y1 = CL / 2;
      const sec = texMat(B.paint('coast', 240, 120)), top = texMat(B.paint('coastTop', 240, 4));
      // 正面（南）、背面（北）、頂面、外海端
      world.add(quad([[xc, y0, 0], [xo, y0, 0], [xo, y0, -CH], [xc, y0, -CH]], [[0, 0], [1, 0], [1, 1], [0, 1]], sec));
      world.add(quad([[xc, y1, 0], [xc, y1, -CH], [xo, y1, -CH], [xo, y1, 0]], [[0, 0], [0, 1], [1, 1], [1, 0]], texMat(B.paint('coast', 120, 60))));
      world.add(quad([[xc, y0, 0], [xc, y1, 0], [xo, y1, 0], [xo, y0, 0]], [[0, 0.5], [0, 0.5], [1, 0.5], [1, 0.5]], top));
      const endC = document.createElement('canvas'); endC.width = 2; endC.height = 120;
      const eg = endC.getContext('2d'), sc = B.paint('coast', 240, 120); eg.drawImage(sc, 238, 0, 2, 120, 0, 0, 2, 120);
      world.add(quad([[xo, y0, 0], [xo, y1, 0], [xo, y1, -CH], [xo, y0, -CH]], [[0.5, 0], [0.5, 0], [0.5, 1], [0.5, 1]], texMat(endC)));
      // 陸地
      const lw = 2.2, lx0 = sgn < 0 ? xc : xc - lw, lx1 = sgn < 0 ? xc + lw : xc;
      world.add(box(lx0, lx1, y0, y1, -CH, 0.55, C['ek-land']));
      world.add(label(T('陸地', 'Land'), C.text, [(lx0 + lx1) / 2, 0, 1.0]));
      // 抬升後的暖水層底（正面上加一條線）
      const th = [];
      for (let i = 0; i <= 80; i++) { const km = i / 80 * B.X_KM, z = -P.H1 + K.etaAt(Cs, km * 1000); if (z <= 0 && z >= -B.Z_COAST) th.push([X(km), y0 - 0.02, Z(z)]); }
      if (th.length > 1) world.add(line(th, D.dark ? '#f8fafc' : '#0f172a', 0.9));
      // 風與艾克曼輸送
      const cx = (xc + xo) / 2;
      if (P.U > 0) {
        const u = K.unit(E.windTo), L = 1.2 + 2.2 * Math.min(1, P.U / 20);
        [-1.9, 1.9].forEach(function (dy) { world.add(arrow([cx - u[0] * L / 2, dy - u[1] * L / 2, 1.2], [u[0], u[1], 0], L, C['ek-wind'], 0.07)); });
        world.add(label(T('風 ', 'Wind ') + B.num(P.U, 1) + ' m/s', C['ek-wind'], [cx, y1 + 0.6, 1.6]));
        const t = K.unit(E.transAz);
        world.add(arrow([cx, 0, 0.06], [t[0], t[1], 0], 2.6, C['ek-trans'], 0.1));
        world.add(label(T('艾克曼輸送', 'Ekman transport'), C['ek-trans'], [cx + t[0] * 2.9, t[1] * 2.9, 0.35]));
      }
      // 湧升或下沉的箭頭（貼在正面）
      if (Math.abs(Cs.Moff) > 0.02 && P.U > 0) {
        const up = Cs.Moff > 0, rk = Math.min(B.X_KM * 0.3, Math.max(2.5, 0.6 * Cs.Rd / 1000)), wcol = D.dark ? '#f8fafc' : '#0f172a', yf = y0 - 0.12;
        const a = function (k0, z0, k1, z1) {
          if (!up) { let t = k0; k0 = k1; k1 = t; t = z0; z0 = z1; z1 = t; }
          const p0 = [X(k0), yf, Z(z0)], p1 = [X(k1), yf, Z(z1)], d = [p1[0] - p0[0], 0, p1[2] - p0[2]];
          world.add(arrow(p0, d, Math.hypot(d[0], d[2]), wcol, 0.05, 0.9));
        };
        a(3, -12, 26, -12); a(rk, -130, rk, -40); a(40, -140, 9, -140);
        world.add(label(up ? T('湧升', 'Upwelling') : T('下沉', 'Downwelling'), C.text, [X(rk) - sgn * 0.9, yf, Z(-85)]));
      }
      world.add(arrow([xo - sgn * 0.0 + sgn * 0.6, y1 - 0.4, 0.02], [0, 1, 0], 0.7, C.muted, 0.04));
      world.add(label(T('北', 'N'), C.text, [xo + sgn * 0.6, y1 + 0.7, 0]));
      if (Cs.out && Cs.front / 1000 <= B.X_KM) world.add(label(T('冷水露頭 ', 'Cold water at ') + B.num(Cs.front / 1000, 1) + ' km', C.text, [X(Cs.front / 1000), y0, 0.5]));
    }

    // ---------- 赤道 ----------
    const EW = 14, EL = 3, EH = 4, EX = 0.4;
    function buildEq() {
      const Q = B.Q(), P = B.P();
      const X = function (u) { return -EW / 2 + u * EW; }, Z = function (d) { return -d / B.Z_EQ * EH; };
      const zs = function (u) { return Q.deta * (0.5 - u) * EX; };     // 海面高度（誇大）
      const y0 = -EL / 2, y1 = EL / 2;
      const sec = texMat(B.paint('eq', 280, 120)), topT = texMat(B.paint('eqTop', 280, 4));
      world.add(quad([[X(0), y0, zs(0)], [X(1), y0, zs(1)], [X(1), y0, -EH], [X(0), y0, -EH]], [[0, 0], [1, 0], [1, 1], [0, 1]], sec));
      world.add(quad([[X(0), y1, zs(0)], [X(0), y1, -EH], [X(1), y1, -EH], [X(1), y1, zs(1)]], [[0, 0], [0, 1], [1, 1], [1, 0]], texMat(B.paint('eq', 140, 60))));
      world.add(quad([[X(0), y0, zs(0)], [X(0), y1, zs(0)], [X(1), y1, zs(1)], [X(1), y0, zs(1)]], [[0, 0.5], [0, 0.5], [1, 0.5], [1, 0.5]], topT));
      // 溫躍層面（20 °C）
      const tm = new THREE.MeshStandardMaterial({ color: col(D.dark ? '#f8fafc' : '#0f172a'), transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false });
      const hw = Math.min(B.Z_EQ, Q.hW), he = Math.min(B.Z_EQ, Q.hE);
      world.add(quad([[X(0), y0, Z(hw)], [X(1), y0, Z(he)], [X(1), y1, Z(he)], [X(0), y1, Z(hw)]], null, tm));
      world.add(line([[X(0), y0 - 0.02, Z(hw)], [X(1), y0 - 0.02, Z(he)]], D.dark ? '#f8fafc' : '#0f172a', 0.95));
      world.add(label(T('溫躍層 ', 'Thermocline ') + B.num(Q.hW, 0) + ' m', C.text, [X(0.08), y0, Z(hw) - 0.35]));
      world.add(label(B.num(Q.hE, 0) + ' m', C.text, [X(0.95), y0, Z(he) - 0.35]));
      // 陸地
      world.add(box(X(0) - 1, X(0), y0, y1, -EH, 0.45, C['ek-land']));
      world.add(box(X(1), X(1) + 1, y0, y1, -EH, 0.7, C['ek-land']));
      world.add(label(T('印尼', 'Indonesia'), C.text, [X(0) - 0.5, 0, 0.95]));
      world.add(label(T('南美', 'S. America'), C.text, [X(1) + 0.5, 0, 1.2]));
      // 信風
      const pp = P.p / 100;
      if (Math.abs(pp) > 0.005) {
        const dir = pp > 0 ? -1 : 1, L = 1 + 1.4 * Math.min(1.6, Math.sqrt(Math.abs(pp)));
        [0.2, 0.45, 0.7].forEach(function (u) { world.add(arrow([X(u) - dir * L / 2, 0, 0.9], [dir, 0, 0], L, C['ek-wind'], 0.08)); });
        world.add(label((pp > 0 ? T('信風', 'Trade winds') : T('西風', 'Westerlies')) + ' ' + B.num(Math.abs(Q.U), 1) + ' m/s', C['ek-wind'], [X(0.45), 0, 1.5]));
      }
      // 雲與沃克環流
      const xc = B.cloudX(), cX = X(xc), aCell = Math.min(1, Math.abs(pp) * 1.2);
      const cm = new THREE.MeshStandardMaterial({ color: col(D.dark ? '#cbd5e1' : '#ffffff'), roughness: 1, metalness: 0 });
      [[0, 0, 0, 0.55], [-0.55, 0.15, -0.1, 0.42], [0.55, -0.1, -0.1, 0.42], [0.2, 0.35, 0.25, 0.38], [-0.25, -0.3, 0.2, 0.36]].forEach(function (q) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(q[3], 20, 14), cm); s.position.set(cX + q[0], q[1], 2.9 + q[2]); world.add(s);
      });
      for (let i = -2; i <= 2; i++) world.add(line([[cX + i * 0.22, 0, 2.4], [cX + i * 0.22 - 0.15, 0, 1.6]], D.dark ? '#93c5fd' : '#2563eb', 0.7));
      if (aCell > 0.05) {
        const far = pp > 0 ? Math.min(0.95, xc + 0.55) : Math.max(0.05, xc - 0.55), fX = X(far), wc = C.muted;
        world.add(arrow([cX, 0, 3.6], [Math.sign(fX - cX), 0, 0], Math.abs(fX - cX), wc, 0.04, 0.5 + 0.4 * aCell));
        world.add(arrow([fX, 0, 3.5], [0, 0, -1], 2.2, wc, 0.04, 0.5 + 0.4 * aCell));
        world.add(label(T('沃克環流', 'Walker circulation'), C.muted, [(cX + fX) / 2, 0, 4.0]));
      }
      world.add(label(T('西太平洋', 'West Pacific'), C.muted, [X(0.15), y0, -EH - 0.45]));
      world.add(label(T('東太平洋', 'East Pacific'), C.muted, [X(0.85), y0, -EH - 0.45]));
    }

    function updateHud() {
      const m = B.state.mode, E = B.E(), Cs = B.Cs(), Q = B.Q();
      if (m === 'spiral') {
        setHud('a', T('表面流 ', 'Surface ') + B.num(E.V0 * 100, 1) + ' cm/s・D_E ' + B.num(E.DE, 1) + ' m');
        setHud('b', T('淨輸送 ', 'Transport ') + B.num(E.M, 2) + ' m²/s');
        setHud('note', narrow ? T('顏色越深＝越深', 'Darker = deeper') : T('每支箭頭是一個深度的海流，顏色越深越深；細線連起箭頭尖端，就是艾克曼螺旋', 'Each arrow is the current at one depth (darker = deeper); the thin line joining their tips is the Ekman spiral'));
      } else if (m === 'coast') {
        setHud('a', T('第 ', 'Day ') + B.num(B.P().days, 1) + T(' 天・岸邊 ', '・coast ') + B.num(Cs.sst0, 1) + ' °C');
        setHud('b', (Cs.Moff > 0.005 ? T('湧升 ', 'Upwelling ') : Cs.Moff < -0.005 ? T('下沉 ', 'Downwelling ') : '') + B.num(Math.abs(Cs.wDay), 1) + T(' m／天', ' m/day'));
        setHud('note', narrow ? T('深度方向放大', 'Depth exaggerated') : T('正面是垂直海岸的溫度剖面，頂面是海面溫度；深度方向放大', 'Front: temperature across the coast; top: sea-surface temperature; depth exaggerated'));
      } else {
        setHud('a', T('信風 ', 'Trade winds ') + B.num(B.P().p, 0) + '%・' + (Q.enso.state === 'nino' ? T('類似聖嬰', 'El Niño-like') : Q.enso.state === 'nina' ? T('類似反聖嬰', 'La Niña-like') : T('正常', 'Neutral')));
        setHud('b', T('東太平洋 ', 'East ') + B.num(Q.sstE, 1) + ' °C');
        setHud('note', narrow ? T('海面高度與深度都放大', 'Sea level and depth exaggerated') : T('半透明面是溫躍層（20 °C）；海面高度與深度方向都放大', 'The translucent surface is the thermocline (20 °C); sea level and depth are exaggerated'));
      }
    }

    // ---------- 相機 ----------
    function presetFor(kind) {
      const m = B.state.mode;
      const dir = kind === 'top' ? new THREE.Vector3(0, -0.02, 1) : kind === 'side' ? new THREE.Vector3(0.02, -1, 0.06) : new THREE.Vector3(0.55, -1, 0.7);
      dir.normalize();
      const span = m === 'spiral' ? 5.6 : m === 'coast' ? 7.6 : 8.6;
      const fitD = span / Math.tan(camera.fov * Math.PI / 360) / Math.min(1, camera.aspect * 0.95);
      const tgt = new THREE.Vector3(0, 0, m === 'spiral' ? -SP_H / 2 + 0.6 : m === 'coast' ? -1.2 : -0.4);
      return { pos: tgt.clone().add(dir.multiplyScalar(Math.min(controls.maxDistance, fitD))), tgt: tgt };
    }
    let camAnim = null;
    function camTo(kind, animate) {
      const Pp = presetFor(kind);
      if (!animate || B.reducedMotion) { camAnim = null; camera.position.copy(Pp.pos); controls.target.copy(Pp.tgt); controls.update(); render(); return; }
      camAnim = { t0: performance.now(), dur: 800, p0: camera.position.clone(), t0v: controls.target.clone(), p1: Pp.pos, t1: Pp.tgt };
      B.request();
    }
    function stepCam() {
      if (!camAnim) return;
      const A = camAnim, u = Math.min(1, (performance.now() - A.t0) / A.dur), e = 1 - Math.pow(1 - u, 3);
      const tg = A.t0v.clone().lerp(A.t1, e), d0 = A.p0.clone().sub(A.t0v), d1 = A.p1.clone().sub(A.t1);
      const len = d0.length() * (1 - e) + d1.length() * e, dir = d0.normalize().lerp(d1.normalize(), e);
      if (dir.lengthSq() < 1e-6) dir.copy(d1).normalize();
      controls.target.copy(tg); camera.position.copy(tg).add(dir.normalize().multiplyScalar(len));
      if (u >= 1) camAnim = null;
    }

    let moving = false, narrow = false;
    function render() {
      if (!api.active || document.hidden) return;
      const want = Math.min(window.devicePixelRatio || 1, 2);
      if (renderer.getPixelRatio() !== want) { renderer.setPixelRatio(want); renderer.setSize(cw, ch, false); }
      stepCam();
      moving = controls.update();
      renderer.render(scene, camera);
    }
    function sizeOf(w) { return w < 560 ? 420 : 500; }
    function resize3() {
      const w = wrap.clientWidth;
      if (!w) return;
      const h = sizeOf(w);
      if (canvas.style.height !== h + 'px') canvas.style.height = h + 'px';
      const nar = w < 560;
      if (nar !== narrow) { narrow = nar; Object.keys(hudLast).forEach(function (k) { delete hudLast[k]; }); }
      cw = w; ch = h;
      renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
      scene.traverse(function (o) { if (o.userData && o.userData.isLabel) fitLabel(o); });
      render();
    }
    const ro = window.ResizeObserver ? new ResizeObserver(function () { resize3(); }) : null;
    if (ro) ro.observe(wrap); else window.addEventListener('resize', resize3);
    controls.addEventListener('change', function () { B.request(); });
    canvas.addEventListener('webglcontextlost', function (ev) { ev.preventDefault(); if (api.active && B.onContextLost) B.onContextLost(); });

    function update() { build(); updateHud(); }
    let lastMode = B.state.mode;
    const api = {
      active: true,
      frame: function () { update(); render(); },
      busy: function () { return !!camAnim || moving; },
      onShow: function () { resize3(); update(); camTo('tilt', false); },
      onTheme: function () { C = B.colors(); Object.keys(hudLast).forEach(function (k) { delete hudLast[k]; }); builtKey = ''; update(); render(); },
      rebuild: function () {
        builtKey = '';
        if (B.state.mode !== lastMode) { lastMode = B.state.mode; update(); camTo('tilt', false); }
        B.request();
      },
      resetCamera: function () { camTo('tilt', true); },
      camTo: function (kind) { camTo(kind, true); },
      dispose: function () {
        api.active = false;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize3);
        controls.dispose(); disposeObject(scene); renderer.dispose(); renderer.forceContextLoss(); wrap.remove();
      }
    };

    const w0 = wrap.clientWidth;
    if (w0) {
      narrow = w0 < 560; cw = w0; ch = sizeOf(w0);
      canvas.style.height = ch + 'px'; renderer.setSize(cw, ch, false);
      camera.aspect = cw / ch; camera.updateProjectionMatrix();
    }
    update();
    camTo('tilt', false);
    return api;
  }

  window.Ekman3D = { create: create };
})();
