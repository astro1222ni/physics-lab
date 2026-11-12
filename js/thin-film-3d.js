/* thin-film-3d.js — 「薄膜干涉」的 3D 立體檢視（three.js 由 thin-film.js 在第一次切到 3D 時以 import() 載入後傳進來）
 *
 * 用法：const v = ThinFilm3D.create({ THREE, OrbitControls }, env)
 *   env.host        放畫布的元素
 *   env.core        ThinFilmCore（幾何：楔形間隙 wedgeGap、透鏡間隙 lensGap 都用同一個物理核心）
 *   env.T           T('中文', 'English')
 *   env.state()     與 2D 同一個狀態物件 st 的快照（會先呼叫 2D 的 prep()，讓顏色函式對準目前的模式）
 *   env.colorAvg(t0, t1, out)  2D 用的同一個顏色函式：厚度區間 [t0, t1]（nm）的平均線性 RGB（白光查 CIE 表、單色光用 R/Rmax）
 *   env.g8(v)       線性值 → sRGB 0–255（與 2D 同一張查表）
 *   env.lost()      WebGL 環境中斷時呼叫
 * 回傳 { active, update(), onTheme(), resetCamera(), viewFrom('face' | 'side'), dispose() }
 *
 * 物理：膜面、玻璃面、透鏡下的條紋貼圖逐格呼叫 env.colorAvg，與 2D 畫面是同一套計算（同一個厚度 → 同一個顏色）；
 *   沒有另外寫任何干涉公式。幾何的厚度方向放大（倍數標在畫面上），長度方向依實際比例。
 * 單位：肥皂膜、空氣劈 1 場景單位 = 1 cm；牛頓環 1 場景單位 = 1 mm。y 朝上。
 */
(function () {
  'use strict';
  const NM = 1e-9, UM = 1e-6, MM = 1e-3, CM = 1e-2, DEG = Math.PI / 180;

  /** 最接近 v 的 1、2、5 × 10^k（對數尺度上最近） */
  function niceRound(v) {
    if (!(v > 0) || !isFinite(v)) return 1;
    const e = Math.floor(Math.log10(v)), b = Math.pow(10, e), m = v / b;
    let best = 1, bd = Infinity;
    [1, 2, 5, 10].forEach(function (k) { const d = Math.abs(Math.log(m / k)); if (d < bd) { bd = d; best = k; } });
    return best * b;
  }
  function trim(v, d) { let s = v.toFixed(d); if (d > 0) s = s.replace(/\.?0+$/, ''); return s.replace(/-/g, '−'); }
  /** 放大倍數的寫法：1000 以上加千分位空格（10 000） */
  function fmtMag(m) { const s = String(Math.round(m)); return s.length > 4 ? s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : s; }

  function create(lib, env) {
    const THREE = lib.THREE, LD = window.LabDraw, T = env.T, C = env.core;
    const V = function (x, y, z) { return new THREE.Vector3(x, y, z); };

    const canvas = document.createElement('canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', T('3D 立體檢視：肥皂膜的框與放大的楔形截面、空氣劈的兩片玻璃與細線、牛頓環的平凸透鏡與平板；條紋與 2D 相同（可拖曳旋轉、滾輪或兩指縮放）',
      "3D view: the soap-film frame with a magnified wedge-shaped cross-section, the two glass plates and thread of the air wedge, or the plano-convex lens on its plate for Newton's rings; the fringes are the same as in 2D (drag to rotate, scroll or pinch to zoom)"));
    env.host.appendChild(canvas);
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    } catch (e) { canvas.remove(); throw e; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1.6, 0.05, 2000);
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.minDistance = 2;
    controls.maxDistance = 400;

    // ---- 環境反射（簡單的攝影棚：讓玻璃與金屬有反光） ----
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(new THREE.BoxGeometry(100, 100, 100), new THREE.MeshBasicMaterial({ color: 0x3a4246, side: THREE.BackSide })));
    [[0, 48, 0, 60, 60, 2.4], [-48, 10, 20, 30, 50, 1.3], [48, 5, 10, 24, 40, 0.9], [0, 10, 48, 50, 20, 0.8]].forEach(function (p) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(p[3], p[4]), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(p[5]), side: THREE.DoubleSide }));
      m.position.set(p[0], p[1], p[2]); m.lookAt(0, 0, 0);
      envScene.add(m);
    });
    const envRT = pmrem.fromScene(envScene, 0.04);
    scene.environment = envRT.texture;
    envScene.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    pmrem.dispose();

    // ---- 燈光：半球光＋一盞投影子的主光＋補光 ----
    const hemi = new THREE.HemisphereLight(0xf2f6ff, 0x3a3530, 0.8);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff4e6, 1.5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.radius = 4;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.02;
    scene.add(sun, sun.target);
    const fill = new THREE.DirectionalLight(0xcfe0ff, 0.55);
    scene.add(fill);

    // ---- 小工具 ----
    const css = function (c) { const col = new THREE.Color(); col.setStyle(String(c).replace(/^rgba\(([^,]+),([^,]+),([^,]+),[^)]+\)$/, 'rgb($1,$2,$3)')); return col; };
    function disposeObject(obj) {
      obj.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) {
            ['map', 'alphaMap'].forEach(function (k) { if (m[k] && !m[k].userData.shared) m[k].dispose(); });
            m.dispose();
          });
        }
      });
    }
    function clearGroup(g) { while (g.children.length) { const c = g.children.pop(); disposeObject(c); } }
    function mesh(geo, mat, cast, recv) {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = !!cast; m.receiveShadow = recv !== false;
      return m;
    }
    function std(color, metal, rough, extra) {
      return new THREE.MeshStandardMaterial(Object.assign({ color: css(color), metalness: metal, roughness: rough }, extra || {}));
    }
    /** 玻璃：透明、帶一點顏色、清漆反光 */
    function glassMat(op) {
      return new THREE.MeshPhysicalMaterial({ color: css(LD.mix(K().glass, '#ffffff', 0.35)), metalness: 0, roughness: 0.06, transparent: true, opacity: op == null ? 0.28 : op,
        clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.1, depthWrite: false, side: THREE.DoubleSide });
    }
    function waterMat(n) {
      return new THREE.MeshPhysicalMaterial({ color: css(K().water), metalness: 0, roughness: 0.15, transparent: true,
        opacity: Math.max(0.18, Math.min(0.5, 0.15 + (n - 1) * 0.6)), depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 0.6 });
    }
    function metalMat() { return std(K().metal, 0.75, 0.32, { envMapIntensity: 1.0 }); }
    /** 條紋貼圖用的材質：不受光照、不做色調映射，所以畫面上的顏色和 2D 畫布的像素值一樣 */
    function fringeMat(tex) { return new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: THREE.DoubleSide }); }
    /** 玻璃邊緣的細亮線（看得出厚度） */
    function edges(geo, op) {
      const l = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: op == null ? (LD.dark ? 0.35 : 0.55) : op, depthWrite: false }));
      l.renderOrder = 3;
      return l;
    }
    function K() { return env.tokens(); }

    // 標籤：在螢幕上的大小固定（CSS 像素），不隨遠近縮放
    const P11 = 1 / Math.tan(camera.fov * Math.PI / 360);
    function applyScale(sp) {
      const H = canvas.clientHeight || 300;
      const sy = 2 * sp.userData.hpx / (H * P11);
      sp.scale.set(sy * sp.userData.aspect, sy, 1);
    }
    /**
     * 文字標籤：2D 畫布畫好再貼成 Sprite（settings.js 會自動把 fillText 轉成簡體、依字體設定放大）。
     * parts：字串或陣列，陣列裡的 [字] 是下標。size：螢幕上的字高（CSS px）。opt.pill：圓角底框；opt.cx、cy：錨點。
     */
    function label(parts, color, size, opt) {
      opt = opt || {};
      if (typeof parts === 'string') parts = [parts];
      const c = document.createElement('canvas');
      const g = c.getContext('2d');
      const px = 56, sp = Math.round(px * 0.68);
      const fm = (opt.weight || 600) + ' ' + px + 'px ' + LD.FONT, fs = (opt.weight || 600) + ' ' + sp + 'px ' + LD.FONT;
      let w = 0;
      parts.forEach(function (p) { g.font = Array.isArray(p) ? fs : fm; w += g.measureText(Array.isArray(p) ? p[0] : p).width; });
      const padX = opt.pill ? 30 : 14;
      const k = window.LabSettings ? 1 + ((+window.LabSettings.get('fs') || 1) - 1) * 0.7 : 1;
      c.width = Math.ceil(w) + padX * 2; c.height = Math.ceil(px * k * (opt.pill ? 1.75 : 1.55));
      if (opt.pill) {
        const r = c.height / 2 - 4;
        g.beginPath();
        g.moveTo(4 + r, 4); g.arcTo(c.width - 4, 4, c.width - 4, c.height - 4, r); g.arcTo(c.width - 4, c.height - 4, 4, c.height - 4, r);
        g.arcTo(4, c.height - 4, 4, 4, r); g.arcTo(4, 4, c.width - 4, 4, r); g.closePath();
        g.fillStyle = LD.alpha(LD.c.surface, LD.dark ? 0.9 : 0.94); g.fill();
        g.lineWidth = 4; g.strokeStyle = LD.alpha(color, 0.55); g.stroke();
      }
      let x = padX;
      g.textBaseline = 'middle'; g.lineJoin = 'round';
      parts.forEach(function (p) {
        const sub = Array.isArray(p), t = sub ? p[0] : p, y = c.height / 2 + (sub ? px * 0.26 : 0);
        g.font = sub ? fs : fm;
        if (!opt.pill) { g.lineWidth = 12; g.strokeStyle = LD.alpha(LD.c['canvas-bg'], 0.92); g.strokeText(t, x, y); }
        g.fillStyle = color; g.fillText(t, x, y);
        x += g.measureText(t).width;
      });
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, sizeAttenuation: false, toneMapped: false }));
      s.userData.hpx = size * c.height / px;
      s.userData.aspect = c.width / c.height;
      applyScale(s);
      s.center.set(opt.cx == null ? 0.5 : opt.cx, opt.cy == null ? 0.5 : opt.cy);
      s.renderOrder = 10;
      return s;
    }
    /** 箭頭（圓柱＋圓錐）；dashed：箭身畫成虛線 */
    function arrow(group, a, b, color, r, dashed) {
      const dir = b.clone().sub(a), len = dir.length();
      if (len < 1e-6) return;
      dir.normalize();
      const head = Math.min(len * 0.4, r * 5.5), hr = r * 2.6;
      const mat = new THREE.MeshStandardMaterial({ color: css(color), emissive: css(color), emissiveIntensity: 0.35, roughness: 0.45, metalness: 0 });
      const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir);
      const body = len - head;
      const seg = function (s0, s1) {
        const m = mesh(new THREE.CylinderGeometry(r, r, s1 - s0, 10), mat, false, false);
        m.quaternion.copy(q);
        m.position.copy(a).addScaledVector(dir, (s0 + s1) / 2);
        group.add(m);
      };
      if (dashed) { const p = r * 7; for (let s = 0; s < body; s += p) seg(s, Math.min(body, s + p * 0.6)); }
      else seg(0, body);
      const cone = mesh(new THREE.ConeGeometry(hr, head, 16), mat, false, false);
      cone.quaternion.copy(q);
      cone.position.copy(a).addScaledVector(dir, body + head / 2);
      group.add(cone);
    }
    /** 直線（細線，可虛線） */
    function line(group, pts, color, op, dash) {
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = dash ? new THREE.LineDashedMaterial({ color: css(color), transparent: true, opacity: op, dashSize: dash, gapSize: dash * 0.8, depthWrite: false })
        : new THREE.LineBasicMaterial({ color: css(color), transparent: true, opacity: op, depthWrite: false });
      const l = new THREE.Line(geo, mat);
      if (dash) l.computeLineDistances();
      l.renderOrder = 4;
      group.add(l);
      return l;
    }

    // 地面（實驗桌）四周漸淡
    const fadeTex = (function () {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const g = c.getContext('2d');
      const gr = g.createRadialGradient(128, 128, 30, 128, 128, 128);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.6, '#ffffff'); gr.addColorStop(1, '#000000');
      g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
      const t = new THREE.CanvasTexture(c);
      t.userData.shared = true;
      return t;
    })();

    // ---- 條紋貼圖（畫布）：只在相關參數改變時重算 ----
    function makeTex(w, h) {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      t.userData.shared = true;   // 由本模組自己管理，換模式時不跟著物件釋放
      return { c: c, g: c.getContext('2d'), t: t };
    }
    const filmTx = makeTex(4, 512);      // 肥皂膜：由上到下 512 列
    let wedgeTx = makeTex(2048, 4);      // 空氣劈：沿 x 方向（寬度依條紋數調整）
    const ringTx = makeTex(1024, 1024);  // 牛頓環：圓形
    const tmp = [0, 0, 0];
    /** 一維條紋寫進畫布：fn(i, out) 給第 i 格的線性 RGB */
    function fillStrip(tx, n, vertical, fn) {
      const W = tx.c.width, H = tx.c.height;
      const img = tx.g.createImageData(W, H), d = img.data;
      for (let i = 0; i < n; i++) {
        fn(i, tmp);
        const r = env.g8(tmp[0]), gg = env.g8(tmp[1]), b = env.g8(tmp[2]);
        if (vertical) { for (let x = 0; x < W; x++) { const k = 4 * (i * W + x); d[k] = r; d[k + 1] = gg; d[k + 2] = b; d[k + 3] = 255; } }
        else { for (let y = 0; y < H; y++) { const k = 4 * (y * W + i); d[k] = r; d[k + 1] = gg; d[k + 2] = b; d[k + 3] = 255; } }
      }
      tx.g.putImageData(img, 0, 0);
      tx.t.needsUpdate = true;
    }

    // ---- 群組 ----
    const benchGroup = new THREE.Group();   // 實驗桌
    const rigGroup = new THREE.Group();     // 器材（框、玻璃、透鏡…）：幾何參數改變才重建
    const dynGroup = new THREE.Group();     // 光線、說明標籤、顯微鏡：相關參數改變才重建（物件很少）
    const curGroup = new THREE.Group();     // 肥皂膜的游標與厚度讀數：排液時每格重建（只有幾個物件）
    scene.add(benchGroup, rigGroup, dynGroup, curGroup);

    let s = null, bounds = null, mode = '';
    const keys = {};

    function buildBench(size, y, cx, cz) {
      clearGroup(benchGroup);
      const top = LD.mix(LD.c.surface, LD.c.text, LD.dark ? 0.08 : 0.1);
      const g = mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ color: css(top), roughness: 0.92, metalness: 0, transparent: true, alphaMap: fadeTex, depthWrite: false }), false, true);
      g.rotation.x = -Math.PI / 2;
      g.position.set(cx, y, cz);
      g.renderOrder = -2;
      benchGroup.add(g);
    }
    function setLights(cx, cy, cz, span) {
      sun.position.set(cx - span * 0.55, cy + span * 1.6, cz + span * 0.9);
      sun.target.position.set(cx, 0, cz);
      const sc = sun.shadow.camera;
      sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span;
      sc.near = 0.1; sc.far = span * 5;
      sc.updateProjectionMatrix();
      fill.position.set(cx + span * 1.2, cy + span * 0.6, cz - span);
    }

    // ====================================================================
    // 肥皂膜：直立的金屬框上的膜（1 單位 = 1 cm；框的大小為示意），旁邊拉出放大的楔形截面
    // ====================================================================
    const SOAP = { W: 6.4, H: 9, Y0: 3.2, R: 0.7, MAG: 15000, SX: 6.0, SW: 0.7 };
    function roundedRect(w, h, r, x0, y0) {
      const sh = new THREE.Shape();
      sh.moveTo(x0 + r, y0); sh.lineTo(x0 + w - r, y0); sh.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r);
      sh.lineTo(x0 + w, y0 + h - r); sh.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h);
      sh.lineTo(x0 + r, y0 + h); sh.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r);
      sh.lineTo(x0, y0 + r); sh.quadraticCurveTo(x0, y0, x0 + r, y0);
      return sh;
    }
    function buildSoap() {
      clearGroup(rigGroup);
      const S = SOAP, x0 = -S.W / 2, y1 = S.Y0 + S.H;
      // 黑色背景板（與 2D 一樣：暗背景才看得清楚反射光）
      const board = mesh(new THREE.BoxGeometry(9.6, 12.6, 0.3), std(K().velvet, 0, 0.95), true, true);
      board.position.set(0, 6.3, -3.0);
      rigGroup.add(board);
      // 膜：圓角長方形，貼上與 2D 同一套顏色（貼圖由上到下 = 頂端到底部）
      const geo = new THREE.ShapeGeometry(roundedRect(S.W, S.H, S.R, x0, S.Y0), 24);
      const pos = geo.attributes.position, uv = geo.attributes.uv;
      for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) - x0) / S.W, (pos.getY(i) - S.Y0) / S.H);
      uv.needsUpdate = true;
      const film = mesh(geo, fringeMat(filmTx.t), false, false);
      rigGroup.add(film);
      // 金屬框（管子沿著圓角長方形）與把手、底座
      const pts = roundedRect(S.W + 0.06, S.H + 0.06, S.R + 0.03, x0 - 0.03, S.Y0 - 0.03).getSpacedPoints(160).map(function (p) { return V(p.x, p.y, 0); });
      pts.pop();
      const frame = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true, 'centripetal'), 320, 0.16, 10, true), metalMat(), true, true);
      rigGroup.add(frame);
      const rod = mesh(new THREE.CylinderGeometry(0.16, 0.16, S.Y0 - 0.5, 14), metalMat(), true, true);
      rod.position.set(0, 0.5 + (S.Y0 - 0.5) / 2, 0);
      rigGroup.add(rod);
      const base = mesh(new THREE.CylinderGeometry(1.7, 1.9, 0.5, 40), std(LD.shade(K().metal, -0.35), 0.6, 0.45), true, true);
      base.position.set(0, 0.25, 0);
      rigGroup.add(base);
      // 放大的楔形截面：厚度方向（z）由 scale.z 決定，排液時只改縮放
      const xa = S.SX - S.SW / 2, xb = S.SX + S.SW / 2;
      const wv = [
        // 兩個側面三角形（x = xa、x = xb）
        xa, y1, 0, xa, S.Y0, 0, xa, S.Y0, 1,
        xb, y1, 0, xb, S.Y0, 1, xb, S.Y0, 0,
        // 背面（z = 0）
        xa, y1, 0, xb, y1, 0, xb, S.Y0, 0, xa, y1, 0, xb, S.Y0, 0, xa, S.Y0, 0,
        // 底面（y = 底）
        xa, S.Y0, 0, xb, S.Y0, 0, xb, S.Y0, 1, xa, S.Y0, 0, xb, S.Y0, 1, xa, S.Y0, 1
      ];
      const body = new THREE.BufferGeometry();
      body.setAttribute('position', new THREE.Float32BufferAttribute(wv, 3));
      body.computeVertexNormals();
      const sec = new THREE.Group();
      sec.add(mesh(body, waterMat(1.33), false, false));
      // 斜的正面：貼上同一張膜的顏色
      const fv = new THREE.BufferGeometry();
      fv.setAttribute('position', new THREE.Float32BufferAttribute([xa, y1, 0, xb, y1, 0, xa, S.Y0, 1, xb, S.Y0, 1], 3));
      fv.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 0, 0, 1, 0], 2));
      fv.setIndex([0, 2, 1, 1, 2, 3]);
      sec.add(mesh(fv, fringeMat(filmTx.t), false, false));
      const outline = [V(xa, y1, 0), V(xa, S.Y0, 1), V(xb, S.Y0, 1), V(xb, y1, 0)];
      line(sec, outline, LD.shade(K().water, LD.dark ? 0.3 : -0.3), 0.9);
      sec.name = 'section';
      rigGroup.add(sec);
      // 截面與框之間的虛線（表示「從這裡切下來」）
      line(rigGroup, [V(S.W / 2 + 0.25, y1, 0), V(xa - 0.1, y1, 0)], LD.c.muted, 0.7, 0.18);
      line(rigGroup, [V(S.W / 2 + 0.25, S.Y0, 0), V(xa - 0.1, S.Y0, 0)], LD.c.muted, 0.7, 0.18);
      bounds = new THREE.Box3(V(-5.0, 0, -3.2), V(S.SX + 1.4, 13.2, 4.6));
      buildBench(46, 0, 0.5, 0);
      setLights(0.5, 7, 0, 14);
    }
    function soapTexture() {
      const sp = s.soap, N = 512;
      fillStrip(filmTx, N, true, function (i, c) { env.colorAvg(sp.hb * i / N, sp.hb * (i + 1) / N, c); });
    }
    /** 游標（與 2D 同一個高度 z：0 頂端、1 底部）、截面上的點與厚度讀數；截面的厚度跟著底部厚度縮放 */
    function soapCur() {
      clearGroup(curGroup);
      const S = SOAP, sp = s.soap, y1 = S.Y0 + S.H;
      const sec = rigGroup.getObjectByName('section');
      const thick = Math.max(1e-3, sp.hb * NM / CM * S.MAG);    // 底部厚度（場景單位）
      if (sec) sec.scale.z = thick;
      const yc = y1 - sp.z * S.H, tz = thick * sp.z;
      const pc = LD.c.probe;
      line(curGroup, [V(-S.W / 2 - 0.5, yc, 0.03), V(S.W / 2 + 0.1, yc, 0.03)], pc, 0.95, 0.22);
      line(curGroup, [V(S.W / 2 + 0.25, yc, 0.03), V(S.SX + S.SW / 2, yc, tz + 0.02)], pc, 0.7, 0.12);
      const dot = mesh(new THREE.SphereGeometry(0.17, 20, 14), std(pc, 0.1, 0.35, { emissive: css(pc), emissiveIntensity: 0.3 }), false, false);
      dot.position.set(S.SX, yc, tz + 0.02);
      curGroup.add(dot);
      const dot2 = dot.clone(); dot2.position.set(-S.W / 2 - 0.5, yc, 0.03); curGroup.add(dot2);
      const lh = label('h = ' + Math.round(sp.h) + ' nm', LD.c.text, 12.5, { pill: true, cx: 0 });
      lh.position.set(S.SX + S.SW / 2 + 0.45, yc, tz);
      curGroup.add(lh);
      const lb = label(T('厚（底部）', 'thick (bottom)'), LD.c.muted, 11.5, { pill: true, cy: 1 });
      lb.position.set(S.SX, S.Y0 - 0.35, thick);
      curGroup.add(lb);
    }
    function soapDyn() {
      clearGroup(dynGroup);
      const S = SOAP, sp = s.soap, y1 = S.Y0 + S.H;
      const yc = y1 - sp.z * S.H;
      // 截面說明
      // 分兩行疊在截面正上方（手機寬度一行放不下）
      const ls = label(T('截面（示意）', 'slice (schematic)'), LD.c.muted, 11.5, { pill: true, cx: 0.5, cy: 0 });
      ls.position.set(S.SX, y1 + 0.45, 0);
      dynGroup.add(ls);
      const lm = label(T('厚度放大 ', 'thickness × ') + fmtMag(S.MAG) + T(' 倍', ''), LD.c.muted, 11.5, { pill: true, cx: 0.5, cy: -1.08 });
      lm.position.copy(ls.position);
      dynGroup.add(lm);
      const lt = label(T('薄（頂端）', 'thin (top)'), LD.c.muted, 11.5, { pill: true, cx: 0.5, cy: 0 });
      lt.position.set(-0.8, y1 + 0.45, 0);
      dynGroup.add(lt);
      // 光線：在游標高度、膜的左半邊，畫在鉛直面上（側視時和截面一起看）；入射角 θ 太小時畫成 15°，免得入射光與反射光疊在一起
      const a = Math.max(15, sp.ang) * DEG, P = V(-1.4, yc, 0.02), Ls = 4.4;
      const Le = Math.min(Ls, (yc - 0.6) / Math.sin(a));
      const src = P.clone().add(V(0, Math.sin(a) * Ls, Math.cos(a) * Ls));
      const eye = P.clone().add(V(0, -Math.sin(a) * Le, Math.cos(a) * Le));
      const col = s.ray;
      arrow(dynGroup, src, P, col, 0.07);
      arrow(dynGroup, P, eye, col, 0.065, true);
      line(dynGroup, [P, P.clone().add(V(0, 0, 3.4))], LD.c.muted, 0.6, 0.15);   // 法線
      const ll = label(s.white ? T('白光', 'white light') : s.lam + ' nm', col === LD.c.equi ? LD.c.text : col, 12, { pill: true, cx: 1 });
      ll.position.copy(src).add(V(-0.3, 0, 0));
      dynGroup.add(ll);
      const le = label(T('眼睛：θ = ', 'eye: θ = ') + trim(sp.ang, 1) + '°', LD.c.text, 12, { pill: true, cx: 1 });
      le.position.copy(eye).add(V(-0.3, 0, 0));
      dynGroup.add(le);
    }

    // ====================================================================
    // 空氣劈：兩片長方形玻璃（1 單位 = 1 cm，長度依實際比例），楔角放大示意
    // ====================================================================
    const WG = { W: 3, G: 0.22 };
    function wedgeGeom() {
      const w = s.wedge;
      const Lp = w.L * 1.08;
      let mag = 0, gd;
      const target = Math.max(0.6, Math.min(1.3, 0.1 * w.L));    // 細線處畫出的間隙（cm）：楔角約 6°
      if (w.hide) gd = target;                                   // 神秘細線：間隙固定畫法，不洩漏 D
      else { mag = niceRound(target / (w.D * UM / CM)); gd = w.D * UM / CM * mag; }
      return { Lp: Lp, gd: gd, mag: mag, ang: Math.atan2(gd, w.L) };
    }
    function buildWedge() {
      clearGroup(rigGroup);
      const w = s.wedge, g = wedgeGeom(), G = WG.G, W = WG.W, L = w.L;
      // 下片玻璃
      const botGeo = new THREE.BoxGeometry(g.Lp, G, W);
      const bot = mesh(botGeo, glassMat(0.32), false, true);
      bot.position.set(g.Lp / 2, G / 2, 0);
      bot.add(edges(botGeo));
      rigGroup.add(bot);
      // 上片玻璃（以接觸線為軸傾斜）
      const topGeo = new THREE.BoxGeometry(g.Lp, G, W); topGeo.translate(g.Lp / 2, G / 2, 0);
      const top = mesh(topGeo, glassMat(0.3), false, false);
      top.position.set(0, G, 0);
      top.rotation.z = g.ang;
      top.add(edges(topGeo));
      rigGroup.add(top);
      // 條紋面：上片玻璃的下表面（間隙所在的地方），0 ≤ x ≤ L
      const yL = G + g.gd;
      const fv = new THREE.BufferGeometry();
      fv.setAttribute('position', new THREE.Float32BufferAttribute([0, G - 0.003, -W / 2, L, yL - 0.003, -W / 2, 0, G - 0.003, W / 2, L, yL - 0.003, W / 2], 3));
      fv.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
      fv.setIndex([0, 2, 1, 1, 2, 3]);
      rigGroup.add(mesh(fv, fringeMat(wedgeTx.t), false, false));
      // 楔中的介質（水等）
      if (w.n > 1.004) {
        const sh = new THREE.Shape([new THREE.Vector2(0, G), new THREE.Vector2(L, G), new THREE.Vector2(L, yL)]);
        const wg = new THREE.ExtrudeGeometry(sh, { depth: W - 0.04, bevelEnabled: false });
        wg.translate(0, 0, -(W - 0.04) / 2);
        rigGroup.add(mesh(wg, waterMat(w.n), false, false));
      }
      // 細線（圓柱，沿 z）
      const th = mesh(new THREE.CylinderGeometry(g.gd / 2, g.gd / 2, W + 0.9, 28), std(K().wire, 0.1, 0.5), true, true);
      th.rotation.x = Math.PI / 2;
      th.position.set(L, G + g.gd / 2, 0);
      rigGroup.add(th);
      // 範圍框只隨玻璃長度改變（改 D 時相機不跳動）；上方留給顯微鏡
      bounds = new THREE.Box3(V(-0.6, 0, -W / 2 - 0.2), V(g.Lp + 0.6, 2 * G + 1.4 + 4.6, W / 2 + 1.0));
      const span = Math.max(g.Lp, 6);
      buildBench(span * 3.2, 0, g.Lp / 2, 0);
      setLights(g.Lp / 2, 2, 0, span);
    }
    function wedgeTexture() {
      const w = s.wedge, p = { D: w.D * UM, L: w.L * CM };
      const per = (s.white ? 380 : s.lam) / (2 * w.n);                      // 一條條紋的厚度（nm）
      const F = w.D * 1000 / per;                                            // 0 到 L 之間的條紋數
      const N = Math.min(4096, Math.max(1024, Math.pow(2, Math.ceil(Math.log2(Math.max(1, F) * 16)))));
      if (wedgeTx.c.width !== N) {
        const old = wedgeTx;
        wedgeTx = makeTex(N, 4);
        rigGroup.traverse(function (o) { if (o.material && o.material.map === old.t) { o.material.map = wedgeTx.t; o.material.needsUpdate = true; } });
        old.t.dispose();
      }
      fillStrip(wedgeTx, N, false, function (i, c) {
        env.colorAvg(C.wedgeGap(p.L * i / N, p) / NM, C.wedgeGap(p.L * (i + 1) / N, p) / NM, c);
      });
    }
    function wedgeDyn() {
      clearGroup(dynGroup);
      const w = s.wedge, g = wedgeGeom(), G = WG.G, W = WG.W, L = w.L;
      const topAt = function (x) { return G + Math.tan(g.ang) * Math.max(0, x) + G; };   // 上片玻璃上表面
      // 讀數顯微鏡：在 x0 正上方；視野寬度 = 2D 的視野寬度
      const x0 = Math.max(0, Math.min(g.Lp, w.x0));
      const yS = topAt(x0) + 1.0, tubeH = 3.2;
      const scope = new THREE.Group();
      const body = mesh(new THREE.CylinderGeometry(0.42, 0.42, tubeH, 28), std(LD.mix(K().metal, '#202428', 0.55), 0.6, 0.38), true, false);
      body.position.set(x0, yS + 0.35 + tubeH / 2, 0);
      const obj = mesh(new THREE.CylinderGeometry(0.28, 0.36, 0.7, 24), metalMat(), true, false);
      obj.position.set(x0, yS + 0.35, 0);
      const lens = mesh(new THREE.CircleGeometry(0.22, 24), new THREE.MeshPhysicalMaterial({ color: 0x223344, roughness: 0.05, metalness: 0.2, clearcoat: 1 }), false, false);
      lens.rotation.x = Math.PI / 2; lens.position.set(x0, yS - 0.001, 0);
      scope.add(body, obj, lens);
      dynGroup.add(scope);
      // 視野框：畫在上片玻璃的上表面
      const vw = w.vw * MM / CM, xa = Math.max(0, x0 - vw / 2), xb = Math.min(g.Lp, x0 + vw / 2), dz = Math.min(W / 2 - 0.1, Math.max(0.35, vw * 0.35));
      line(dynGroup, [V(xa, topAt(xa) + 0.01, -dz), V(xb, topAt(xb) + 0.01, -dz), V(xb, topAt(xb) + 0.01, dz), V(xa, topAt(xa) + 0.01, dz), V(xa, topAt(xa) + 0.01, -dz)], LD.c.accent, 0.95);
      line(dynGroup, [V(x0, topAt(x0) + 0.01, 0), V(x0, yS, 0)], LD.c.accent, 0.5, 0.12);
      // 十字線（2D 顯微鏡中的游標）
      if (w.cx != null) {
        const xc = w.cx / CM;
        if (xc >= 0 && xc <= g.Lp) {
          const yc = G + Math.tan(g.ang) * Math.min(xc, g.Lp) + 0.004;
          line(dynGroup, [V(xc, yc, -dz), V(xc, yc, dz)], LD.c.probe, 1);
        }
      }
      // 垂直照下的光（兩支箭頭在顯微鏡兩側）
      const col = s.ray;
      [-1, 1].forEach(function (sg) {
        const xr = Math.max(0.15, Math.min(g.Lp - 0.15, x0 + sg * 0.95));
        arrow(dynGroup, V(xr, topAt(xr) + 2.6, 0.55 * sg), V(xr, topAt(xr) + 0.06, 0.55 * sg), col, 0.05);
      });
      // 標籤
      const lm = label(T('讀數顯微鏡', 'measuring microscope'), LD.c.text, 12, { pill: true, cx: 0 });
      lm.position.set(x0 + 0.6, yS + tubeH * 0.75, 0);
      dynGroup.add(lm);
      const lc = label(T('接觸線', 'contact line'), LD.c.muted, 11.5, { cy: 1 });
      lc.position.set(0, -0.1, W / 2 + 0.25);
      dynGroup.add(lc);
      const dTxt = w.hide ? 'D = ?' : 'D = ' + trim(w.D, 2) + ' μm';
      const ld = label(T('細線 ', 'thread ') + dTxt, LD.shade(K().wire, LD.dark ? 0.25 : -0.15), 12, { pill: true, cx: 0.75, cy: 0 });
      ld.position.set(L, G + g.gd + 0.5, W / 2 + 0.45);
      dynGroup.add(ld);
      const lmag = label(w.hide ? T('間隙放大（示意，倍數不公布）', 'gap magnified (schematic)') : T('楔角放大 ', 'wedge angle × ') + fmtMag(g.mag) + T(' 倍（示意）', ' (schematic)'), LD.c.muted, 11, { pill: true, cx: 0.75, cy: 1.15 });
      lmag.position.copy(ld.position);   // 緊貼在「細線 D」標籤下方（楔角由細線撐起）
      dynGroup.add(lmag);
      // L 的尺寸線（沿前緣）
      const zf = W / 2 + 0.55, yf = 0.02;
      line(dynGroup, [V(0, yf, zf), V(L, yf, zf)], LD.c.text, 0.6);
      line(dynGroup, [V(0, yf, zf - 0.18), V(0, yf, zf + 0.18)], LD.c.text, 0.6);
      line(dynGroup, [V(L, yf, zf - 0.18), V(L, yf, zf + 0.18)], LD.c.text, 0.6);
      const lL = label('L = ' + trim(L, 2) + ' cm', LD.c.text, 12, { cy: 0 });
      lL.position.set(L / 2, yf + 0.05, zf);
      dynGroup.add(lL);
      if (w.n > 1.004) {
        const ln = label('n = ' + trim(w.n, 3), LD.dark ? K().ink : LD.shade(K().water, -0.45), 11.5, { cy: 0.5 });
        ln.position.set(L * 0.72, G + g.gd * 0.36, W / 2 + 0.1);
        dynGroup.add(ln);
      }
    }

    // ====================================================================
    // 牛頓環：平凸透鏡放在平板玻璃上（1 單位 = 1 mm）。透鏡口徑半徑 8 mm、長度依實際比例；高度方向只放大空氣間隙
    // ====================================================================
    const NW = { A: 4, PT: 5, PS: 14, PH: 2.2, EDGE: 1.0, SAG: 1.6 };
    function newtonGeom() {
      const nw = s.newton, A = NW.A;
      if (nw.hide) {
        // 神秘透鏡：弧面與灰塵都用固定的示意畫法，不洩漏 R、e
        const e0 = nw.dust ? 0.22 : 0;
        return { mag: 0, gapAt: function (r) { return e0 + NW.SAG * (r / A) * (r / A); } };
      }
      const sagReal = C.lensGap(A * MM, nw.R, 0) / MM;           // 口徑邊緣的間隙（mm）
      const mag = niceRound(NW.SAG / sagReal);
      return { mag: mag, gapAt: function (r) { return C.lensGap(r * MM, nw.R, nw.e * NM) / MM * mag; } };
    }
    function buildNewton() {
      clearGroup(rigGroup);
      const nw = s.newton, A = NW.A, PT = NW.PT, g = newtonGeom();
      // 平板玻璃（墊高：透射光可以從下方看）
      const pg = new THREE.BoxGeometry(NW.PS, NW.PH, NW.PS);
      const plate = mesh(pg, glassMat(0.3), false, true);
      plate.position.set(0, PT - NW.PH / 2, 0);
      plate.add(edges(pg));
      rigGroup.add(plate);
      const footMat = std(LD.mix(K().metal, '#1c1f22', 0.5), 0.4, 0.6);
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) {
        const f = mesh(new THREE.BoxGeometry(1.6, PT - NW.PH, 1.6), footMat, true, true);
        f.position.set(q[0] * (NW.PS / 2 - 1.2), (PT - NW.PH) / 2, q[1] * (NW.PS / 2 - 1.2));
        rigGroup.add(f);
      });
      // 條紋：平板上表面、透鏡口徑內（與 2D 顯微鏡視野同一套顏色）
      const disk = mesh(new THREE.CircleGeometry(A, 160), fringeMat(ringTx.t), false, false);
      disk.rotation.x = -Math.PI / 2;
      disk.position.set(0, PT + 0.012, 0);
      rigGroup.add(disk);
      // 平凸透鏡（旋轉體）：下表面 y = PT + 間隙 × 放大倍數，上表面平
      const yRim = PT + g.gapAt(A), yTop = yRim + NW.EDGE;
      const prof = [new THREE.Vector2(0.0001, yTop), new THREE.Vector2(A, yTop), new THREE.Vector2(A, yRim)];
      const NS = 64;
      for (let i = NS - 1; i >= 0; i--) { const r = A * i / NS; prof.push(new THREE.Vector2(Math.max(0.0001, r), PT + g.gapAt(r))); }
      const lensGeo = new THREE.LatheGeometry(prof, 96);
      const lens = mesh(lensGeo, glassMat(0.34), false, false);
      lens.renderOrder = 2;
      rigGroup.add(lens);
      rigGroup.add(edges(lensGeo, LD.dark ? 0.18 : 0.3));
      // 間隙中的介質
      if (nw.n > 1.004) {
        const gp = [new THREE.Vector2(0.0001, PT + 0.02)];
        gp.push(new THREE.Vector2(A, PT + 0.02));
        for (let i = NS; i >= 0; i--) { const r = A * i / NS; gp.push(new THREE.Vector2(Math.max(0.0001, r), PT + g.gapAt(r))); }
        rigGroup.add(mesh(new THREE.LatheGeometry(gp, 96), waterMat(nw.n), false, false));
      }
      bounds = new THREE.Box3(V(-NW.PS / 2, 0, -NW.PS / 2), V(NW.PS / 2, PT + NW.SAG * 1.6 + NW.EDGE + 5.5, NW.PS / 2));   // 固定：改 R 時相機不跳動
      buildBench(NW.PS * 3.4, 0, 0, 0);
      setLights(0, 10, 0, NW.PS * 0.9);
      return yTop;
    }
    function newtonTexture() {
      const nw = s.newton, A = NW.A * MM, S = ringTx.c.width, h = S / 2;
      const nr = Math.ceil(h) + 2, prof = new Float32Array(3 * nr);
      for (let i = 0; i < nr; i++) {
        const r0 = A * i / h, r1 = A * (i + 1) / h;
        env.colorAvg(C.lensGap(r0, nw.R, nw.e * NM) / NM, C.lensGap(r1, nw.R, nw.e * NM) / NM, tmp);
        prof[3 * i] = tmp[0]; prof[3 * i + 1] = tmp[1]; prof[3 * i + 2] = tmp[2];
      }
      const img = ringTx.g.createImageData(S, S), d = img.data;
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const rr = Math.hypot(x + 0.5 - h, y + 0.5 - h), k = 4 * (y * S + x);
          const u = Math.min(nr - 2, rr), i = Math.floor(u), f = u - i, a = 3 * i;
          d[k] = env.g8(prof[a] + (prof[a + 3] - prof[a]) * f);
          d[k + 1] = env.g8(prof[a + 1] + (prof[a + 4] - prof[a + 1]) * f);
          d[k + 2] = env.g8(prof[a + 2] + (prof[a + 5] - prof[a + 2]) * f);
          d[k + 3] = 255;
        }
      }
      ringTx.g.putImageData(img, 0, 0);
      ringTx.t.needsUpdate = true;
    }
    function newtonDyn() {
      clearGroup(dynGroup);
      const nw = s.newton, A = NW.A, PT = NW.PT, g = newtonGeom();
      const yTop = PT + g.gapAt(A) + NW.EDGE;
      // 顯微鏡視野（2D 畫面的範圍）與十字線
      const rv = nw.rv / MM;
      if (rv < A * 0.98) {
        const cp = [];
        for (let i = 0; i <= 96; i++) { const a = i / 96 * Math.PI * 2; cp.push(V(rv * Math.cos(a), PT + 0.03, rv * Math.sin(a))); }
        line(dynGroup, cp, LD.c.accent, 0.9, 0.35);
      }
      const rvc = Math.min(rv, A);
      if (nw.cx != null) {
        const xc = Math.max(-A, Math.min(A, nw.cx / MM));
        line(dynGroup, [V(xc, PT + 0.04, -rvc), V(xc, PT + 0.04, rvc)], LD.c.probe, 1);
      }
      // 光線：在游標半徑處（與 2D 側視圖相同的取法）
      const rr = nw.cx == null ? nw.rv * 0.5 : Math.abs(nw.cx);
      const xr = Math.min(A * 0.92, rr / MM) * (nw.cx != null && nw.cx < 0 ? -1 : 1);
      const col = s.ray, yA = yTop + 4.5;
      if (nw.view === 'T') {
        arrow(dynGroup, V(xr, yA, 0), V(xr, yTop + 0.1, 0), col, 0.08);
        arrow(dynGroup, V(xr, PT - NW.PH - 0.15, 0), V(xr, 0.5, 0), col, 0.08);
      } else {
        arrow(dynGroup, V(xr - 0.35, yA, 0), V(xr - 0.35, yTop + 0.1, 0), col, 0.08);
        arrow(dynGroup, V(xr + 0.35, yTop + 0.1, 0), V(xr + 0.35, yA - 0.3, 0), col, 0.075, true);
      }
      line(dynGroup, [V(xr, yTop, 0), V(xr, PT + 0.05, 0)], col, 0.55, 0.25);
      // 標籤
      const rTxt = nw.hide ? 'R = ?' : 'R = ' + trim(nw.R, 3) + ' m';
      const ll = label(T('平凸透鏡 ', 'plano-convex lens ') + rTxt, LD.c.text, 12.5, { pill: true, cy: 0 });
      ll.position.set(-A * 0.35, yTop + 0.9, -A * 0.5);
      dynGroup.add(ll);
      const lp = label(T('平板玻璃', 'flat glass plate'), LD.c.muted, 11.5, { cx: 1, cy: 0.5 });
      lp.position.set(NW.PS / 2 - 0.5, PT - NW.PH / 2, NW.PS / 2 + 0.3);
      dynGroup.add(lp);
      const lm = label(nw.hide ? T('間隙高度放大（示意，倍數不公布）', 'gap height magnified (schematic)') : T('間隙高度放大 ', 'gap height × ') + fmtMag(g.mag) + T(' 倍（示意）', ' (schematic)'), LD.c.muted, 11, { pill: true, cx: 0, cy: 0.5 });
      lm.position.set(A + 0.6, PT + g.gapAt(A) * 0.6, 0);
      dynGroup.add(lm);
      const lv = label(nw.view === 'T' ? T('透射光（從下方看）', 'transmitted light (seen from below)') : T('反射光（從上方看）', 'reflected light (seen from above)'), col === LD.c.equi ? LD.c.text : col, 11.5, { cx: 0, cy: 0 });
      lv.position.set(xr + 0.6, nw.view === 'T' ? 1.0 : yA - 0.4, 0);
      dynGroup.add(lv);
      if (rv < A * 0.98) {
        const lf = label(T('顯微鏡視野', 'microscope field'), LD.c.accent, 11, { cx: 0.5, cy: 1 });
        lf.position.set(0, PT + 0.05, rv + 0.25);
        dynGroup.add(lf);
      }
      if (!nw.hide && nw.e > 0.5) {
        const le = label('e = ' + Math.round(nw.e) + ' nm', LD.c.pos, 11, { cx: 1, cy: 0.5 });
        le.position.set(-0.6, PT + g.gapAt(0) / 2 + 0.05, 0);
        dynGroup.add(le);
      } else if (nw.hide && nw.dust) {
        const le = label(T('灰塵把透鏡抬高（高度不公布）', 'dust lifts the lens (height hidden)'), LD.c.pos, 11, { cx: 1, cy: 0.5 });
        le.position.set(-0.6, PT + g.gapAt(0) / 2 + 0.05, 0);
        dynGroup.add(le);
      }
    }

    // ====================================================================
    // 相機：讓目前的器材整個在畫面裡；三種視角
    // ====================================================================
    const DIRS = {
      soap: { def: V(0.62, 0.22, 1), face: V(0, 0.03, 1), side: V(1, 0.06, 0.02) },
      wedge: { def: V(0.42, 0.9, 1), face: V(0, 1, 0.03), side: V(0, 0.04, 1) },
      newton: { def: V(0.38, 0.85, 1), face: V(0, 1, 0.03), side: V(0, 0.04, 1) }
    };
    let tween = null, fitKey = '';
    /**
     * 相機距離：沿 dir 方向看 box 的中心，用透視投影把八個角都放進畫面（左右留給標籤約 70 px、上下約 26 px），
     * 二分搜尋最近的距離。上限是「每個角都保守估計」的距離（一定放得下）。
     */
    const tmpCam = new THREE.PerspectiveCamera();
    function fitDistance(dir, box) {
      box = box || bounds;
      const center = box.getCenter(V(0, 0, 0));
      const corners = [];
      [box.min.x, box.max.x].forEach(function (X) { [box.min.y, box.max.y].forEach(function (Y) { [box.min.z, box.max.z].forEach(function (Z) { corners.push(V(X, Y, Z)); }); }); });
      const fwd = dir.clone().negate();
      const right = new THREE.Vector3().crossVectors(fwd, camera.up).normalize();
      if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
      const upv = new THREE.Vector3().crossVectors(right, fwd).normalize();
      const tv = Math.tan(camera.fov * Math.PI / 360), th = tv * camera.aspect;
      let hi = 1;
      corners.forEach(function (k) {
        const c = k.clone().sub(center), depth = c.dot(dir);
        hi = Math.max(hi, depth + Math.abs(c.dot(right)) / th, depth + Math.abs(c.dot(upv)) / tv);
      });
      hi *= 1.15;
      const W = canvas.clientWidth || 600, H = canvas.clientHeight || 400;
      // 左右留給標籤的邊（標籤另有 keepLabelsInside 防止出界，所以手機上不必留太多）
      const mx = 1 - 2 * Math.min(90, Math.max(18, W * 0.11)) / W, my = 1 - 2 * 26 / H;
      tmpCam.fov = camera.fov; tmpCam.aspect = camera.aspect; tmpCam.near = camera.near; tmpCam.far = camera.far;
      tmpCam.up.copy(camera.up);
      tmpCam.updateProjectionMatrix();
      const fits = function (d) {
        tmpCam.position.copy(center).addScaledVector(dir, d);
        tmpCam.lookAt(center);
        tmpCam.updateMatrixWorld();
        for (let i = 0; i < corners.length; i++) {
          const q = corners[i].clone().applyMatrix4(tmpCam.matrixWorldInverse);
          if (q.z > -tmpCam.near) return false;
          const n = corners[i].clone().project(tmpCam);
          if (Math.abs(n.x) > mx || Math.abs(n.y) > my) return false;
        }
        return true;
      };
      let lo = hi * 0.15;
      for (let i = 0; i < 26; i++) { const m = (lo + hi) / 2; if (fits(m)) hi = m; else lo = m; }
      return { center: center, dist: hi };
    }
    function fit(force, dir, animate, box) {
      if (!bounds) return;
      const key = mode + '|' + camera.aspect.toFixed(3) + '|' + bounds.min.toArray().concat(bounds.max.toArray()).map(function (v) { return v.toFixed(2); }).join(',');
      if (!force && key === fitKey) return;
      const modeChanged = fitKey.split('|')[0] !== mode;
      fitKey = key;
      const d = (dir || (force || modeChanged ? DIRS[mode].def : camera.position.clone().sub(controls.target))).clone().normalize();
      const f = fitDistance(d, box);
      const toPos = f.center.clone().addScaledVector(d, f.dist);
      if (animate && !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) {
        tween = { t0: performance.now(), p0: camera.position.clone(), q0: controls.target.clone(), d1: d, q1: f.center, dist: f.dist };
        requestRender();
        return;
      }
      tween = null;
      controls.target.copy(f.center);
      camera.position.copy(toPos);
      camera.updateProjectionMatrix();
      controls.update();
    }
    function stepTween() {
      if (!tween) return false;
      const u = Math.min(1, (performance.now() - tween.t0) / 480), e = 1 - Math.pow(1 - u, 3);
      controls.target.lerpVectors(tween.q0, tween.q1, e);
      const d0 = tween.p0.clone().sub(tween.q0), r0 = d0.length();
      const dir = d0.normalize().lerp(tween.d1, e).normalize();
      camera.position.copy(controls.target).addScaledVector(dir, r0 + (tween.dist - r0) * e);
      if (u >= 1) tween = null;
      return true;
    }

    /** 標籤超出畫布邊緣時（手機窄畫面、旋轉後），只移動錨點讓整個標籤留在畫面內；標籤指的位置不變 */
    const tmpP = new THREE.Vector3();
    function keepLabelsInside() {
      const W = canvas.clientWidth, H = canvas.clientHeight, m = 4;
      if (!W || !H) return;
      scene.updateMatrixWorld();
      camera.updateMatrixWorld();
      scene.traverse(function (o) {
        if (!o.isSprite || !o.userData.hpx) return;
        if (!o.userData.c0) o.userData.c0 = o.center.clone();
        const c0 = o.userData.c0;
        o.getWorldPosition(tmpP).project(camera);
        if (tmpP.z > 1) { o.center.copy(c0); return; }
        const ax = (tmpP.x + 1) / 2 * W, ay = (1 - tmpP.y) / 2 * H;
        const hp = o.userData.hpx, wp = hp * o.userData.aspect;
        let left = ax - c0.x * wp, bottom = ay + c0.y * hp;
        left = wp > W - 2 * m ? m : Math.min(Math.max(left, m), W - m - wp);
        bottom = hp > H - 2 * m ? H - m : Math.min(Math.max(bottom, m + hp), H - m);
        o.center.set((ax - left) / wp, (bottom - ay) / hp);
      });
    }

    // ---- 繪製（只在有變化時畫；分頁隱藏時不畫） ----
    let raf = 0;
    function renderNow() {
      if (!api.active || document.hidden) return;
      const tw = stepTween();
      const moved = controls.update();
      keepLabelsInside();
      renderer.render(scene, camera);
      if (moved || tw) requestRender();
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
      scene.traverse(function (o) { if (o.isSprite && o.userData.hpx) applyScale(o); });
      fit(false);
      requestRender();
    }
    const ro = window.ResizeObserver ? new ResizeObserver(resize3) : null;
    if (ro) ro.observe(canvas); else window.addEventListener('resize', resize3);
    controls.addEventListener('change', requestRender);
    controls.addEventListener('start', function () { tween = null; });
    const onVisible = function () { if (!document.hidden) requestRender(); };
    document.addEventListener('visibilitychange', onVisible);
    canvas.addEventListener('webglcontextlost', function (ev) {
      ev.preventDefault();
      if (!api.active) return;   // 切回 2D 時自己釋放的，不是意外中斷
      if (env.lost) env.lost();
    });

    // ---- 依狀態更新：器材（幾何參數變才重建）、貼圖（顏色參數變才重算）、游標與標籤 ----
    function update() {
      if (!api.active) return;
      s = env.state();
      const lang = window.LabSettings && window.LabSettings.lang;
      const theme = LD.ver + '|' + lang + '|' + (window.LabSettings ? window.LabSettings.get('fs') : '');
      mode = s.mode;
      let kRig, kTex, kDyn;
      if (mode === 'soap') {
        const sp = s.soap;
        kRig = 'soap|' + theme;
        kTex = s.ckey + '|' + sp.hb;
        kDyn = kRig + '|' + [sp.z, sp.ang, s.ray, s.white, s.lam].join('|');
        if (keys.rig !== kRig) { keys.rig = kRig; buildSoap(); keys.tex = ''; keys.cur = ''; }
        if (keys.tex !== kTex) { keys.tex = kTex; soapTexture(); }
        const kCur = kRig + '|' + sp.hb + '|' + sp.z;
        if (keys.cur !== kCur) { keys.cur = kCur; soapCur(); }
      } else if (mode === 'wedge') {
        const w = s.wedge;
        kRig = 'wedge|' + theme + '|' + [w.hide ? '?' : w.D, w.L, w.n].join('|');
        kTex = s.ckey + '|' + [w.D, w.L].join('|');
        kDyn = kRig + '|' + [w.x0, w.vw, w.cx, s.ray].join('|');
        if (keys.rig !== kRig) { keys.rig = kRig; keys.tex = ''; keys.cur = ''; clearGroup(curGroup); buildWedge(); }
        if (keys.tex !== kTex) { keys.tex = kTex; wedgeTexture(); }
      } else {
        const nw = s.newton;
        kRig = 'newton|' + theme + '|' + (nw.hide ? ['?', nw.dust] : [nw.R, nw.e]).join('|') + '|' + nw.n;
        kTex = s.ckey + '|' + [nw.R, nw.e].join('|');
        kDyn = kRig + '|' + [nw.view, nw.cx, nw.rv, s.ray].join('|');
        if (keys.rig !== kRig) { keys.rig = kRig; keys.tex = ''; keys.cur = ''; clearGroup(curGroup); buildNewton(); }
        if (keys.tex !== kTex) { keys.tex = kTex; newtonTexture(); }
      }
      if (keys.dyn !== kDyn) {
        keys.dyn = kDyn;
        if (mode === 'soap') soapDyn(); else if (mode === 'wedge') wedgeDyn(); else newtonDyn();
      }
      fit(false);
      requestRender();
    }

    const api = {
      active: true,
      update: update,
      onTheme: function () { keys.rig = ''; keys.dyn = ''; keys.cur = ''; update(); },
      resetCamera: function () { fit(true, DIRS[mode].def, true); },
      /** 'face'：正對條紋（肥皂膜從正面、空氣劈與牛頓環從正上方）；'side'：從側面看厚度與間隙 */
      viewFrom: function (which) {
        if (!DIRS[mode]) return;
        const box = mode === 'newton' && which === 'face' ? new THREE.Box3(V(-NW.A - 0.6, NW.PT, -NW.A - 0.6), V(NW.A + 0.6, NW.PT + 0.5, NW.A + 0.6)) : null;
        fit(true, DIRS[mode][which] || DIRS[mode].def, true, box);
      },
      dispose: function () {
        api.active = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize3);
        document.removeEventListener('visibilitychange', onVisible);
        controls.dispose();
        disposeObject(scene);
        [filmTx, wedgeTx, ringTx].forEach(function (t) { t.t.dispose(); });
        fadeTex.dispose();
        envRT.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        canvas.remove();
      }
    };

    const w0 = canvas.clientWidth, h0 = canvas.clientHeight;
    if (w0 && h0) { renderer.setSize(w0, h0, false); camera.aspect = w0 / h0; camera.updateProjectionMatrix(); }
    update();
    fit(true);
    requestRender();
    return api;
  }

  window.ThinFilm3D = { create: create };
})();
