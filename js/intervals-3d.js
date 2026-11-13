/*
 * intervals-3d.js — 「音程與頻率比」的 3D 音程積木（three.js）
 *
 * 由 js/intervals.js 在使用者按「3D 音程積木」時才載入（three.js 也是那時才以 import() 載入）；切回 2D 時整個釋放。
 * 用法：window.Intervals3D.create({ THREE, OrbitControls }, 容器, bridge) → { active, frame, rebuild, onTheme, resetCamera, dispose }
 *
 * 畫法：每個純律比值都能寫成 2^a · 3^b · 5^c。
 *   地板是格子：往右一格（+x）乘 3/2（五度方向，b 加 1），往後一格（−z）乘 5/4（大三度方向，c 加 1）；八度（a）不佔格子。
 *   高度 = 音分 ÷ 1200 × HU，所以「頻率相乘」變成「高度相加」。
 *   每個音程是一塊積木：立在它的終點格子上，從前一個音的高度長到下一個音的高度；前一塊的頂端用水平細棒接到這一塊的底，
 *   疊起來就是一邊往上爬、一邊在格子上走的樓梯。十二平均律的比值不是 3、5 的分數，全部立在原點，疊成一根直塔。
 *   八度的位置畫成半透明的水平面（×2、×4、×8）。
 *   沒有疊音程時：主音程積木＋轉位的虛影積木（從主音程頂端長到下一個八度面，純律時走回原點那一欄；M2／m7 例外會超出一個同音差）。
 *   有疊音程時：每一塊積木＋上面選的音程的玻璃柱，兩個頂端的高度差就是音差。
 * 所有比值與音分都由 intervals-core.js 算出（bridge.data().a），3D 只負責畫。
 */
(function () {
  'use strict';
  const FONT = 'system-ui, -apple-system, "Segoe UI", "Noto Sans TC", "PingFang TC", sans-serif';
  const PI = Math.PI, DEG = PI / 180;
  const S = 0.62;            // 格子間距
  const HU = 1.5;            // 一個八度（1200 音分）的高度
  const BW = 0.36;           // 積木寬度
  // 預設視角的方向（右前上方），以及畫面右側的水平方向（積木的標籤放這一側）
  const VIEW = { x: 0.62, y: 0.55, z: 1.0 };
  const SIDE = (function () { const l = Math.hypot(VIEW.x, VIEW.z); return { x: VIEW.z / l, z: -VIEW.x / l }; })();

  function create(lib, host, B) {
    const THREE = lib.THREE;
    const T = B.T, D = B.D, I = B.I;
    let C = B.colors();
    const col = function (k) { return new THREE.Color(C[k] || k); };
    const isDark = function () { return !!D.dark; };

    // ---------- 畫布與資訊列 ----------
    const wrap = document.createElement('div');
    wrap.className = 't3-wrap';
    const canvas = document.createElement('canvas');
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', T('音程積木的 3D 立體檢視：地板格子往右一格乘 3/2、往後一格乘 5/4，高度是音分；每個音程是一塊積木，疊起來的積木一邊往上爬、一邊在格子上走。拖曳旋轉，滾輪或雙指縮放，方向鍵也可以轉動。',
      '3D interval blocks: on the floor grid one step right multiplies by 3/2 and one step back by 5/4; height is cents. Each interval is a block, and stacked blocks walk across the grid while they climb. Drag to rotate, scroll or pinch to zoom, or use the arrow keys.'));
    wrap.appendChild(canvas);
    const hud = document.createElement('div');
    hud.className = 't3-hud';
    hud.setAttribute('aria-hidden', 'true');
    hud.innerHTML = '<div class="tl"><span data-k="nm"></span><span class="m" data-k="pt"></span><span class="g" data-k="gap"></span></div><div class="bl"><span class="m" data-k="tip"></span></div>';
    wrap.appendChild(hud);
    host.appendChild(wrap);
    const hudEl = {}, hudLast = {};
    hud.querySelectorAll('[data-k]').forEach(function (e) { hudEl[e.getAttribute('data-k')] = e; });
    function setHud(k, h) {
      if ((k === 'pt' || k === 'tip') && narrow()) h = '';   // 手機畫面小：格子座標與操作提示留給下方的說明文字
      if (hudLast[k] !== h) { hudLast[k] = h; hudEl[k].textContent = h; }
    }

    let renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true }); }
    catch (e) { wrap.remove(); throw e; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    const VIEW_DIR = new THREE.Vector3(VIEW.x, VIEW.y, VIEW.z).normalize();
    const camera = new THREE.PerspectiveCamera(34, 4 / 3, 0.05, 300);

    // ---------- 視角控制 ----------
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.rotateSpeed = 0.85;
    controls.screenSpacePanning = true;

    // ---------- 光線與環境反光 ----------
    scene.add(new THREE.HemisphereLight(0xffffff, 0x3a4250, 0.9));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.radius = 4;
    scene.add(keyLight, keyLight.target);
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
    /** 格子點 (b, c) 在高度 y 的位置 */
    function G(b, c, y) { return new THREE.Vector3(b * S, y, -c * S); }
    const Y = function (cents) { return cents / 1200 * HU; };
    function mat(color, opt) {
      opt = opt || {};
      return new THREE.MeshStandardMaterial({
        color: color, roughness: opt.rough == null ? 0.38 : opt.rough, metalness: opt.metal == null ? 0.08 : opt.metal,
        emissive: opt.emissive || 0x000000, emissiveIntensity: opt.ei == null ? 1 : opt.ei, side: opt.side || THREE.FrontSide,
        transparent: opt.opacity != null, opacity: opt.opacity == null ? 1 : opt.opacity, depthWrite: opt.opacity == null || opt.opacity > 0.9
      });
    }
    function sphere(p, r, material) { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), material); m.position.copy(p); m.castShadow = true; return m; }
    /** 兩點之間的細棒 */
    function rod(a, b, r, material) {
      const d = new THREE.Vector3().subVectors(b, a), len = d.length();
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, Math.max(1e-4, len), 10, 1, true), material);
      m.position.copy(a).addScaledVector(d, 0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
      m.castShadow = true;
      return m;
    }
    /** 一塊積木：底面中心 p、高 h、寬 w（四角稍微倒角的方塊＋頂面亮邊） */
    function brick(p, h, w, color, opt) {
      opt = opt || {};
      const g = new THREE.Group();
      const hh = Math.max(0.004, h - 0.012);
      const m = new THREE.Mesh(roundedBox(w, hh, w, Math.min(0.035, hh / 3)), mat(color, opt));
      m.position.set(p.x, p.y + 0.006 + hh / 2, p.z);
      m.castShadow = opt.opacity == null;
      m.receiveShadow = true;
      g.add(m);
      if (opt.edges) {
        const e = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w + 0.004, hh, w + 0.004)),
          new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: 0.85 }));
        e.position.copy(m.position);
        g.add(e);
      }
      return g;
    }
    /** 倒角方塊（用擠出的圓角正方形，側面倒角） */
    function roundedBox(w, h, d, r) {
      const s = new THREE.Shape(), x = -w / 2, z = -d / 2;
      r = Math.min(r, w / 4);
      s.moveTo(x + r, z); s.lineTo(x + w - r, z); s.quadraticCurveTo(x + w, z, x + w, z + r);
      s.lineTo(x + w, z + d - r); s.quadraticCurveTo(x + w, z + d, x + w - r, z + d);
      s.lineTo(x + r, z + d); s.quadraticCurveTo(x, z + d, x, z + d - r);
      s.lineTo(x, z + r); s.quadraticCurveTo(x, z, x + r, z);
      const geo = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 4 });
      geo.rotateX(-PI / 2);
      geo.translate(0, -h / 2, 0);
      geo.computeVertexNormals();
      return geo;
    }
    function fsF() { return Math.max(1, Math.min(1.45, B.fs ? B.fs() : 1)); }
    // 手機（畫布窄）時整個場景縮得很小，文字標籤另外放大才讀得到
    function narrow() { const w = canvas.clientWidth; return !!w && w < 560; }
    let LS = 1;   // 標籤大小隨場景大小調整
    /** 文字小牌（畫布貼圖的 Sprite，永遠面向鏡頭；用 2D 畫布的 fillText，簡體轉換也有效） */
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
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
      s.renderOrder = 10;
      const hh = h * LS * fsF() * (narrow() ? 1.5 : 1);
      s.scale.set(hh * w / 80, hh, 1);
      return s;
    }
    const cWord = function (c, eq) { return B.fx(c, eq ? 0 : 2) + T(' 音分', ' cents'); };
    const neg = function (v) { return String(v).replace('-', '−'); };

    // ---------- 物件 ----------
    const gFloor = new THREE.Group(), gBlocks = new THREE.Group(), gLabels = new THREE.Group();
    scene.add(gFloor, gBlocks, gLabels);
    let fitKey = '';

    /** 先算好每一塊積木的位置（格子點與高度），再決定格子範圍與標籤大小 */
    function layout(a) {
      const just = a.tuning === 'just';
      const ex = function (r) { if (!just || !r) return { b: 0, c: 0 }; const e = I.exps(r); return e.other ? { b: 0, c: 0 } : { b: e.b, c: e.c }; };
      const cOf = function (o) { return just ? o.centsJ : o.centsE; };
      const out = { just: just, cols: [], ghost: null, inv: null, top: 0 };
      if (a.chain) {
        let b = 0, c = 0, y = 0;
        a.chain.bricks.forEach(function (k, i) {
          const e = ex(k.ratio), h = cOf(k);
          const from = { b: b, c: c };
          b += e.b; c += e.c;
          out.cols.push({ i: i, from: from, b: b, c: c, y0: y, y1: y + h, k: k, cents: h });
          y += h;
        });
        out.top = y;
        const ch = a.chain;
        if (ch.semis === a.semis && !(ch.total && ch.total.n === a.n && ch.total.q === a.q)) {
          const e = ex(a.ratio);
          out.ghost = { b: e.b, c: e.c, y1: a.cents };
          out.top = Math.max(out.top, a.cents);
        }
      } else {
        const e = ex(a.ratio);
        out.cols.push({ i: -1, from: { b: 0, c: 0 }, b: e.b, c: e.c, y0: 0, y1: a.cents, cents: a.cents });
        out.top = a.cents;
        if (!(a.n === 8 && a.q === 'A') && a.inv) {
          const ei = ex(a.inv.ratio), h = just ? a.inv.centsJ : a.inv.centsE;
          out.inv = { from: { b: e.b, c: e.c }, b: e.b + ei.b, c: e.c + ei.c, y0: a.cents, y1: a.cents + h };
          out.top = Math.max(out.top, a.cents + h);
        }
      }
      // 格子範圍
      let b0 = 0, b1 = 0, c0 = 0, c1 = 0;
      const pts = [{ b: 0, c: 0 }];
      out.cols.forEach(function (k) { pts.push(k); });
      if (out.ghost) pts.push(out.ghost);
      if (out.inv) pts.push(out.inv);
      pts.forEach(function (p) { b0 = Math.min(b0, p.b); b1 = Math.max(b1, p.b); c0 = Math.min(c0, p.c); c1 = Math.max(c1, p.c); });
      out.grid = { b0: b0 - 1, b1: Math.max(b1 + 1, b0 + 2), c0: c0 - 1, c1: Math.max(c1 + 1, c0 + 1) };
      return out;
    }

    function build() {
      [gFloor, gBlocks, gLabels].forEach(clearGroup);
      const d = B.data(), a = d.a, L = layout(a);
      const gr = L.grid;
      const topY = Y(Math.max(L.top, 1200));
      const spanX = (gr.b1 - gr.b0) * S, spanZ = (gr.c1 - gr.c0) * S;
      LS = Math.max(0.85, Math.min(1.7, Math.max(topY, spanX, spanZ) / 2.6));
      const cx = (gr.b0 + gr.b1) / 2 * S, cz = -(gr.c0 + gr.c1) / 2 * S;
      keyLight.position.set(cx + 3, topY + 6, cz + 4);
      keyLight.target.position.set(cx, 0, cz);
      const sh = Math.max(spanX, spanZ, topY) * 0.9 + 1;
      keyLight.shadow.camera.left = -sh; keyLight.shadow.camera.right = sh; keyLight.shadow.camera.top = sh; keyLight.shadow.camera.bottom = -sh;
      keyLight.shadow.camera.near = 0.5; keyLight.shadow.camera.far = topY + 20;
      keyLight.shadow.camera.updateProjectionMatrix();

      // ---------- 地板：格子 ----------
      const fx0 = gr.b0 * S - S * 0.5, fx1 = gr.b1 * S + S * 0.5, fz0 = -gr.c1 * S - S * 0.5, fz1 = -gr.c0 * S + S * 0.5;
      const floor = new THREE.Mesh(new THREE.BoxGeometry(fx1 - fx0, 0.06, fz1 - fz0), mat(D.mix(C.surface, C['canvas-bg'], 0.3), { rough: 0.75, metal: 0.03 }));
      floor.position.set((fx0 + fx1) / 2, -0.04, (fz0 + fz1) / 2);
      floor.receiveShadow = true;
      gFloor.add(floor);
      const lineMat = mat(C.border, { rough: 0.7, opacity: L.just ? 0.9 : 0.4 });
      for (let b = gr.b0; b <= gr.b1; b++) gFloor.add(rod(G(b, gr.c0 - 0.5, -0.005), G(b, gr.c1 + 0.5, -0.005), 0.005, lineMat));
      for (let c = gr.c0; c <= gr.c1; c++) gFloor.add(rod(G(gr.b0 - 0.5, c, -0.005), G(gr.b1 + 0.5, c, -0.005), 0.005, lineMat));
      const dotMat = mat(C.muted, { rough: 0.6, opacity: L.just ? 0.8 : 0.35 });
      for (let b = gr.b0; b <= gr.b1; b++) for (let c = gr.c0; c <= gr.c1; c++) {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 14), dotMat);
        m.position.copy(G(b, c, 0));
        gFloor.add(m);
      }
      // 方向箭頭與說明
      const axMat = mat(C.muted, { rough: 0.5 });
      // 前左角的兩支短箭頭：往右 ×3/2、往後 ×5/4（文字放在箭頭尖端外側）
      const eo = 0.16;
      const axX0 = G(gr.b0 - 0.5, gr.c0 - 0.5, 0.01).add(new THREE.Vector3(0, 0, eo)), axX = G(gr.b0 + 0.9, gr.c0 - 0.5, 0.01).add(new THREE.Vector3(0, 0, eo));
      const axZ0 = G(gr.b0 - 0.5, gr.c0 - 0.5, 0.01).add(new THREE.Vector3(-eo, 0, 0)), axZ = G(gr.b0 - 0.5, gr.c0 + 0.9, 0.01).add(new THREE.Vector3(-eo, 0, 0));
      gFloor.add(rod(axX0, axX, 0.012, axMat), rod(axZ0, axZ, 0.012, axMat));
      const cone = function (p, dir) {
        const m = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.11, 14), axMat);
        m.position.copy(p);
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        return m;
      };
      gFloor.add(cone(axX, new THREE.Vector3(1, 0, 0)), cone(axZ, new THREE.Vector3(0, 0, -1)));
      const lx = label(T('×3/2 五度', '×3/2 fifth'), C.muted, 0.15, 600);
      lx.center.set(0, 0.5); lx.position.copy(axX).add(new THREE.Vector3(0.1, 0.02, 0.04)); gLabels.add(lx);
      const lz = label(T('×5/4 大三度', '×5/4 major 3rd'), C.muted, 0.15, 600);
      lz.center.set(1, 0.5); lz.position.copy(axZ).add(new THREE.Vector3(-0.08, 0.02, 0)); gLabels.add(lz);

      // ---------- 八度面 ----------
      const nOct = Math.max(1, Math.floor(L.top / 1200 + 1e-6));
      for (let k = 1; k <= nOct; k++) {
        const y = Y(1200 * k);
        const pl = new THREE.Mesh(new THREE.BoxGeometry(fx1 - fx0, 0.004, fz1 - fz0), mat(C['iv-inv'], { opacity: isDark() ? 0.1 : 0.08, rough: 0.3 }));
        pl.position.set((fx0 + fx1) / 2, y, (fz0 + fz1) / 2);
        pl.renderOrder = 1;
        gFloor.add(pl);
        const em = mat(C['iv-inv'], { opacity: 0.55 });
        const cs = [[fx0, fz0], [fx1, fz0], [fx1, fz1], [fx0, fz1]];
        for (let i = 0; i < 4; i++) gFloor.add(rod(new THREE.Vector3(cs[i][0], y, cs[i][1]), new THREE.Vector3(cs[(i + 1) % 4][0], y, cs[(i + 1) % 4][1]), 0.006, em));
        const s = label(T(['八度', '兩個八度', '三個八度', '四個八度'][k - 1] || (k + ' 個八度'), k === 1 ? 'octave' : k + ' octaves') + '  ×' + Math.pow(2, k), C['iv-inv'], 0.15, 700);
        s.center.set(0, 0);
        s.position.set(fx0 + 0.04, y + 0.02, fz0);
        gLabels.add(s);
      }
      // 音分尺（左前角的直棒，每 100 音分一個刻度）
      const rx = fx0 - 0.14, rz = fz1 + 0.14;
      const rTop = Y(Math.max(1200 * nOct, L.top));
      gFloor.add(rod(new THREE.Vector3(rx, 0, rz), new THREE.Vector3(rx, rTop, rz), 0.01, axMat));
      for (let cc = 0; cc <= Math.max(1200 * nOct, L.top) + 1e-6; cc += 100) {
        const big = cc % 1200 === 0, w = big ? 0.09 : 0.045;
        gFloor.add(rod(new THREE.Vector3(rx - w, Y(cc), rz), new THREE.Vector3(rx + w, Y(cc), rz), big ? 0.008 : 0.004, axMat));
        if (big) {
          const s = label(String(cc), C.muted, 0.12, 600);
          s.center.set(1, 0.5);
          s.position.set(rx - 0.12, Y(cc), rz);
          gLabels.add(s);
        }
      }

      // ---------- 積木 ----------
      const sounding = d.sounding;
      const on = function (idx, kind) { return !!sounding && sounding.kind === kind && sounding.which.indexOf(idx) >= 0; };
      const loOn = a.chain ? on(0, 'stack') : on(0, 'main');
      // 下方音：原點的小圓盤
      const base = new THREE.Mesh(new THREE.CylinderGeometry(BW * 0.75, BW * 0.75, 0.03, 32), mat(C['iv-lo'], { emissive: col('iv-lo'), ei: loOn ? 0.8 : 0.15 }));
      base.position.copy(G(0, 0, 0.012));
      base.castShadow = true;
      gBlocks.add(base);
      const startNote = a.chain ? a.chain.notes[0] : a.lo;
      const sl = label(startNote.full, C['iv-lo'], 0.17, 800);
      sl.center.set(1, 0.5);
      sl.position.copy(G(0, 0, 0.05)).add(new THREE.Vector3(-SIDE.x * (BW * 0.9), 0, -SIDE.z * (BW * 0.9)));
      gLabels.add(sl);

      const side = function (p, dist) { return p.clone().add(new THREE.Vector3(SIDE.x * dist, 0, SIDE.z * dist)); };
      const stepRod = function (from, to, y, color) {
        if (from.b === to.b && from.c === to.c) return;
        gBlocks.add(rod(G(from.b, from.c, Y(y)), G(to.b, to.c, Y(y)), 0.02, mat(color, { rough: 0.4 })));
      };
      const topCap = function (b, c, y, color, lit) {
        gBlocks.add(sphere(G(b, c, Y(y) + 0.03), lit ? 0.085 : 0.05, mat(lit ? C.accent : color, { emissive: col(lit ? 'accent' : 'iv-hi'), ei: lit ? 0.9 : 0.15 })));
      };

      if (a.chain) {
        const ch = a.chain;
        L.cols.forEach(function (k, i) {
          const color = C['iv-b' + (1 + (i % 4))];
          stepRod(k.from, k, k.y0, color);
          gBlocks.add(brick(G(k.b, k.c, Y(k.y0)), Y(k.y1) - Y(k.y0), BW, color, { rough: 0.32 }));
          const lit = on(i + 1, 'stack');
          topCap(k.b, k.c, k.y1, C['iv-hi'], lit);
          const txt = B.ivShort(k.k.n, k.k.q) + (L.just ? ' ' + B.rt(k.k.ratio) : '');
          const s = label(txt, color, 0.17, 800);
          s.center.set(0, 0.5);
          s.position.copy(side(G(k.b, k.c, Y((k.y0 + k.y1) / 2)), BW * 0.75));
          gLabels.add(s);
          const nl = label(ch.notes[i + 1].full, lit ? C.accent : C['iv-hi'], 0.14, 700);
          nl.center.set(1, 0.5);
          nl.position.copy(side(G(k.b, k.c, Y(k.y1)), -BW * 0.7));
          gLabels.add(nl);
        });
        // 上面選的音程（只有和疊出來的音落在同一個鍵上時才畫）：玻璃柱＋兩個頂端的高度差
        const last = L.cols[L.cols.length - 1], gh = L.ghost;
        if (gh) {
          const same = ch.mainSame;
          gBlocks.add(brick(G(gh.b, gh.c, 0), Y(gh.y1), BW * 1.45, C['iv-main'], { opacity: isDark() ? 0.16 : 0.12, rough: 0.15, edges: true, side: THREE.DoubleSide }));
          const gl = label(T('上面選的 ', 'chosen ') + B.ivShort(a.n, a.q) + (L.just && a.ratio ? ' ' + B.rt(a.ratio) : ''), C['iv-main'], 0.15, 700);
          gl.center.set(0.5, 0);
          gl.position.copy(G(gh.b, gh.c, Y(Math.max(gh.y1, same ? last.y1 : 0)) + 0.12));
          gLabels.add(gl);
          if (!same && Math.abs(ch.cents - a.cents) > 0.005) {
            const hiY = Y(Math.max(last.y1, gh.y1)), loY = Y(Math.min(last.y1, gh.y1));
            const px = G(last.b, last.c, 0).add(G(gh.b, gh.c, 0)).multiplyScalar(0.5);
            const off = side(px, BW * 1.6);
            const gm = mat(C['iv-gap'], { emissive: col('iv-gap'), ei: 0.35 });
            gBlocks.add(rod(new THREE.Vector3(off.x, loY, off.z), new THREE.Vector3(off.x, hiY, off.z), 0.012, gm));
            [loY, hiY].forEach(function (yy) { gBlocks.add(rod(new THREE.Vector3(off.x - 0.06, yy, off.z), new THREE.Vector3(off.x + 0.06, yy, off.z), 0.008, gm)); });
            const t = B.sg(ch.mainDiff, 2) + T(' 音分', ' cents') + (L.just && ch.mainComma ? '  ' + B.rt(ch.mainComma.r) : '');
            const sp = label(t, C['iv-gap'], 0.15, 800);
            sp.center.set(0, 0.5);
            sp.position.set(off.x + 0.1, (loY + hiY) / 2, off.z);
            gLabels.add(sp);
          }
          setHud('gap', same ? T('和上面選的 ' + B.ivShort(a.n, a.q) + ' 剛好一樣高', 'Exactly as high as the chosen ' + B.ivShort(a.n, a.q))
            : T('和上面選的 ' + B.ivShort(a.n, a.q) + ' 差 ', 'Differs from the chosen ' + B.ivShort(a.n, a.q) + ' by ') + B.sg(ch.mainDiff, 2) + T(' 音分', ' cents') + (L.just && ch.mainComma ? ' = ' + T(ch.mainComma.zh, ch.mainComma.en) + ' ' + B.rt(ch.mainComma.r) : ''));
        } else setHud('gap', '');
        const total = ch.total ? B.ivName(ch.total.n, ch.total.q) : '—';
        setHud('nm', T('疊出來：', 'Stacked: ') + total + '  ' + (L.just ? B.rt(ch.prod) + ' = ' : '') + cWord(ch.cents, !L.just));
        setHud('pt', L.just ? T('終點在格子 (' + neg(last.b) + ', ' + neg(last.c) + ')', 'Ends on grid point (' + neg(last.b) + ', ' + neg(last.c) + ')') + (gh ? T('；上面選的 ' + B.ivShort(a.n, a.q) + ' 在 (' + neg(gh.b) + ', ' + neg(gh.c) + ')', '; the chosen ' + B.ivShort(a.n, a.q) + ' sits on (' + neg(gh.b) + ', ' + neg(gh.c) + ')') : '')
          : T('十二平均律：所有積木疊在同一根柱子上', 'Equal temperament: every block sits on the same column'));
      } else {
        const k = L.cols[0];
        if (a.cents > 0.01) gBlocks.add(brick(G(k.b, k.c, 0), Y(k.y1), BW, C['iv-main'], { rough: 0.3 }));
        const hiLit = on(1, 'main');
        topCap(k.b, k.c, k.y1, C['iv-hi'], hiLit);
        const s = label(B.ivShort(a.n, a.q) + (L.just && a.ratio ? ' ' + B.rt(a.ratio) : ''), C['iv-main'], 0.18, 800);
        s.center.set(0, 0.5);
        s.position.copy(side(G(k.b, k.c, Y(Math.max(k.y1, 60) / 2)), BW * 0.75));
        gLabels.add(s);
        const nl = label(a.hi.full, hiLit ? C.accent : C['iv-hi'], 0.16, 800);
        nl.center.set(1, 0.5);
        nl.position.copy(side(G(k.b, k.c, Y(k.y1) + 0.03), -BW * 0.7));
        gLabels.add(nl);
        let gapTxt = '';
        if (L.inv) {
          const v = L.inv;
          stepRod(v.from, v, v.y0, C['iv-inv']);
          const plane = 1200 * (a.octaves + 1);
          const yTop = Math.min(v.y1, plane);
          if (yTop - v.y0 > 0.01) gBlocks.add(brick(G(v.b, v.c, Y(v.y0)), Y(yTop) - Y(v.y0), BW * 0.9, C['iv-inv'], { opacity: isDark() ? 0.3 : 0.24, edges: true, rough: 0.2 }));
          if (v.y1 - plane > 0.01) {
            gBlocks.add(brick(G(v.b, v.c, Y(plane)), Y(v.y1) - Y(plane), BW * 0.9, C['iv-gap'], { opacity: 0.75, emissive: col('iv-gap'), ei: 0.3, rough: 0.3 }));
            gapTxt = T('轉位相乘 ', 'Product with the inversion ') + B.rt(a.inv.prod) + T('，比八度多 ', ', above the octave by ') + cWord(v.y1 - plane) +
              (a.inv.prodComma ? ' = ' + T(a.inv.prodComma.zh, a.inv.prodComma.en) + ' ' + B.rt(a.inv.prodComma.r) : '');
            const gs = label('+' + B.fx(v.y1 - plane, 2) + T(' 音分', ' cents'), C['iv-gap'], 0.14, 800);
            gs.center.set(0, 0.5);
            gs.position.copy(side(G(v.b, v.c, Y(v.y1)), BW * 0.7));
            gLabels.add(gs);
          }
          const il = label(T('轉位 ', 'inversion ') + B.ivShort(a.inv.n, a.inv.q) + (L.just ? ' ' + B.rt(a.inv.ratio) : ''), C['iv-inv'], 0.15, 700);
          il.center.set(0, 0.5);
          il.position.copy(side(G(v.b, v.c, Y((v.y0 + Math.min(v.y1, plane)) / 2)), BW * 0.7));
          gLabels.add(il);
        }
        setHud('nm', B.ivName(a.n, a.q) + '  ' + (L.just && a.ratio ? B.rt(a.ratio) + ' = ' : '') + cWord(a.cents, !L.just));
        setHud('pt', L.just ? (a.ratio && a.exps ? B.rt(a.ratio) + ' = 2^' + neg(a.exps.a) + ' · 3^' + neg(a.exps.b) + ' · 5^' + neg(a.exps.c) + T(' → 格子 (', ' → grid point (') + neg(a.exps.b) + ', ' + neg(a.exps.c) + ')' : '')
          : T('十二平均律：2 的 ' + a.semis + '/12 次方不是 3、5 的分數，所以立在原點', 'Equal temperament: 2 to the power ' + a.semis + '/12 is not a fraction of 3s and 5s, so it stands on the origin'));
        setHud('gap', gapTxt);
      }
      setHud('tip', a.chain ? T('積木一邊往上爬、一邊在格子上走；高度相加 = 頻率相乘。', 'Blocks climb and walk across the grid; adding heights = multiplying frequencies.')
        : T('轉位的虛影從積木頂端長到下一個八度面：兩塊加起來剛好一個八度。', 'The ghost inversion grows from the top of the block to the next octave plane: together they make one octave.'));
    }

    // ---------- 視角 ----------
    let lastAspect = 0, lastNarrow = null;
    /**
     * 取景：沿著方向 dir 看過去，找出能把地板、積木與所有文字小牌都放進畫面的目標點與距離。
     * 每一點在鏡頭座標的橫、直位置與深度都和距離 d 成線性關係，所以可以直接算出最小的 d。
     */
    function fitView(dir) {
      dir = dir.clone().normalize();
      const fwd = dir.clone().negate();
      let right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
      if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
      right.normalize();
      const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
      const pts = [];
      const box = new THREE.Box3();
      box.expandByObject(gFloor); box.expandByObject(gBlocks);
      if (!box.isEmpty()) for (let i = 0; i < 8; i++) pts.push(new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z));
      gLabels.children.forEach(function (sp) {
        const sx = sp.scale.x, sy = sp.scale.y;
        [-sp.center.x, 1 - sp.center.x].forEach(function (u) {
          [-sp.center.y, 1 - sp.center.y].forEach(function (v) { pts.push(sp.position.clone().addScaledVector(right, u * sx).addScaledVector(up, v * sy)); });
        });
      });
      if (!pts.length) pts.push(new THREE.Vector3());
      let r0 = Infinity, r1 = -Infinity, u0 = Infinity, u1 = -Infinity, f0 = 0;
      pts.forEach(function (p) {
        const r = p.dot(right), u = p.dot(up), f = p.dot(fwd);
        r0 = Math.min(r0, r); r1 = Math.max(r1, r); u0 = Math.min(u0, u); u1 = Math.max(u1, u); f0 += f;
      });
      f0 /= pts.length;
      const target = right.clone().multiplyScalar((r0 + r1) / 2).addScaledVector(up, (u0 + u1) / 2).addScaledVector(fwd, f0);
      const vf = camera.fov * DEG;
      const tv = Math.tan(vf / 2), tx = tv * camera.aspect * 0.94;
      // 上下各留出資訊列的高度（以 −1…1 的畫面座標表示）
      const chh = canvas.clientHeight || 1;
      const hTop = hud.querySelector('.tl').offsetHeight, hBot = hud.querySelector('.bl').offsetHeight;
      const yt = Math.max(0.2, 1 - 2 * (hTop + 14) / chh), yb = -Math.max(0.2, 1 - 2 * (hBot + 14) / chh);
      const distFor = function () {
        let d = 1.2;
        pts.forEach(function (p) {
          const q = p.clone().sub(target), u = q.dot(up);
          const need = Math.max(Math.abs(q.dot(right)) / tx, u >= 0 ? u / (yt * tv) : u / (yb * tv)) - q.dot(fwd);
          if (need > d) d = need;
        });
        return d;
      };
      let d = distFor();
      // 透視會讓近的點看起來比較大：依投影後的範圍把目標點往可用範圍的中間挪，再重算距離
      for (let it = 0; it < 5; it++) {
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        pts.forEach(function (p) {
          const q = p.clone().sub(target), z = q.dot(fwd) + d;
          const x = q.dot(right) / (z * tx), y = q.dot(up) / (z * tv);
          x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        });
        target.addScaledVector(right, (x0 + x1) / 2 * tx * d).addScaledVector(up, ((y0 + y1) / 2 - (yt + yb) / 2) * tv * d);
        d = distFor();
      }
      return { target: target, d: d, dir: dir };
    }
    /** keepDir：保留使用者轉過的方向，只重新對準與調整距離 */
    function resetCamera(keepDir) {
      const dir = keepDir ? camera.position.clone().sub(controls.target) : VIEW_DIR.clone();
      const f = fitView(dir.lengthSq() > 1e-9 ? dir : VIEW_DIR);
      controls.target.copy(f.target);
      camera.position.copy(f.target).addScaledVector(f.dir, f.d);
      controls.minDistance = 1;
      controls.maxDistance = f.d * 4;
      camera.updateProjectionMatrix();
      controls.update();
      requestRender();
    }
    /** 重建後場景大小改變很多時，自動重新取景（使用者轉過的方向保留） */
    function refit() {
      const box = new THREE.Box3();
      box.expandByObject(gFloor); box.expandByObject(gBlocks);
      const sz = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
      const key = [c.x, c.y, c.z, sz.x, sz.y, sz.z].map(function (v) { return v.toFixed(2); }).join(',');
      if (key === fitKey) return;
      const old = fitKey ? fitKey.split(',').map(Number) : null;
      fitKey = key;
      if (!old) return;
      const big = Math.hypot(old[0] - c.x, old[1] - c.y, old[2] - c.z) > 0.2 ||
        [3, 4, 5].some(function (i) { const v = [sz.x, sz.y, sz.z][i - 3]; return Math.abs(old[i] - v) > 0.12 * Math.max(old[i], v, 0.5); });
      if (big) resetCamera(true);
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
      const nw = narrow();
      if (nw !== lastNarrow) { lastNarrow = nw; build(); fitKey = ''; refit(); lastAspect = 0; }
      if (Math.abs(camera.aspect - lastAspect) > 1e-3) { lastAspect = camera.aspect; resetCamera(true); }
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
    // 鍵盤：方向鍵繞著積木轉
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
      rebuild: function () { build(); refit(); requestRender(); },
      onTheme: function () {
        C = B.colors();
        buildEnv();
        Object.keys(hudLast).forEach(function (k) { delete hudLast[k]; });
        build();
        requestRender();
      },
      resetCamera: function () { resetCamera(false); },
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
    refit();
    const w0 = canvas.clientWidth, h0 = canvas.clientHeight;
    if (w0 && h0) {
      renderer.setSize(w0, h0, false);
      camera.aspect = w0 / h0;
      camera.updateProjectionMatrix();
      lastAspect = camera.aspect;
    }
    resetCamera(false);
    return api;
  }

  window.Intervals3D = { create: create };
})();
