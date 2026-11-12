/* diffusion-osmosis-3d.js — 「擴散與滲透」的 3D 立體檢視（three.js；按「3D 立體」才載入，切回 2D 時整個釋放）
 * 所有數值都來自 diffusion-osmosis-core.js 與頁面程式的同一份狀態（bridge），這裡只負責畫：
 *   擴散：玻璃盒裡 600 個粒子（核心的 x、y、z）、隔板、追蹤路徑、盒子下方的直方圖與理論曲線
 *   滲透：玻璃 U 形管、兩管液柱（高度＝核心的液面）、半透膜、活塞、尺、溶質粒子
 *   細胞：紅血球（Evans–Fung 雙凹圓盤 ↔ 球，體積與計算一致，皺縮時長刺）、植物細胞（細胞壁、原生質體、液胞、葉綠體） */
(function () {
  'use strict';
  const TAU = Math.PI * 2;
  const FONT = 'system-ui, -apple-system, "Segoe UI", "Noto Sans TC", "PingFang TC", sans-serif';
  const RES = 3;
  const BINS = 20;

  /** ln Γ(z)（Lanczos）：超橢球體積用 */
  function lnGamma(z) {
    const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
      12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
    z -= 1;
    let x = c[0];
    for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
    const t = z + g + 0.5;
    return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
  }
  /** 超橢球 |x/a|^p + |y/b|^p + |z/c|^p ≤ 1 的體積 ÷ 外接長方體 8abc */
  function superFrac(p) { return Math.exp(3 * lnGamma(1 + 1 / p) - lnGamma(1 + 3 / p)); }
  /** 球面上大致均勻的 n 個方向（費氏螺旋） */
  function fibDirs(n) {
    const out = [], ga = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < n; i++) {
      const y = 1 - 2 * (i + 0.5) / n, r = Math.sqrt(1 - y * y), a = i * ga;
      out.push([r * Math.cos(a), y, r * Math.sin(a)]);
    }
    return out;
  }

  function create(lib, host, B) {
    const THREE = lib.THREE;
    const K = B.K, T = B.T, D = B.D;
    let C = B.colors();
    let mode = B.S.mode;

    // ---------- 畫布、HUD ----------
    const wrap = document.createElement('div');
    wrap.className = 't3-wrap';
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', T('擴散與滲透的 3D 立體檢視（可拖曳旋轉、縮放）', '3D view of diffusion and osmosis (drag to rotate, pinch or scroll to zoom)'));
    wrap.appendChild(canvas);
    const hud = document.createElement('div');
    hud.className = 't3-hud';
    hud.setAttribute('aria-hidden', 'true');
    hud.innerHTML = '<div class="tl"><span data-k="a"></span><span class="m" data-k="b"></span></div>' +
      '<div class="tr"><span data-k="c"></span><span class="m" data-k="d"></span></div>' +
      '<div class="br"><span class="m" data-k="note"></span></div>';
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
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1.5, 0.05, 400);
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.rotateSpeed = 0.85;
    controls.enablePan = false;
    controls.minDistance = 3;
    controls.maxDistance = 90;

    const hemi = new THREE.HemisphereLight(0xffffff, 0x556070, 0.95);
    scene.add(hemi);
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.1);
    keyLight.position.set(6, 14, 9);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.radius = 4;
    const sc = keyLight.shadow.camera;
    sc.left = -16; sc.right = 16; sc.top = 16; sc.bottom = -16; sc.near = 1; sc.far = 50;
    scene.add(keyLight);
    scene.add(keyLight.target);
    const fill = new THREE.DirectionalLight(0xffffff, 0.55);
    fill.position.set(-8, 4, -6);
    scene.add(fill);
    const groundMat = new THREE.ShadowMaterial({ opacity: 0.2 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // ---------- 共用工具 ----------
    let narrow = false, cw = 300, ch = 200;
    const col = function (k) { return new THREE.Color(C[k] || k || '#888888'); };
    const isDark = function () { return !!C.dark; };
    function rnd(seed) { let s = seed; return function () { s = (s * 16807) % 2147483647; return s / 2147483647; }; }
    function disposeObject(obj) {
      obj.traverse(function (o) {
        if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
        if (o.material) {
          (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) {
            if (m.map && !m.map.userData.shared) m.map.dispose();
            if (!m.userData.shared) m.dispose();
          });
        }
      });
    }
    function canvasTex(c) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
    function std(color, o) {
      return new THREE.MeshStandardMaterial(Object.assign({ color: color, roughness: 0.45, metalness: 0.04 }, o || {}));
    }
    function phys(color, o) {
      return new THREE.MeshPhysicalMaterial(Object.assign({ color: color, roughness: 0.25, metalness: 0, clearcoat: 0.4, clearcoatRoughness: 0.3 }, o || {}));
    }
    function glassMat(o) {
      return phys(col('do-glass'), Object.assign({ transparent: true, opacity: isDark() ? 0.16 : 0.2, roughness: 0.05, clearcoat: 1,
        side: THREE.DoubleSide, depthWrite: false }, o || {}));
    }
    function line(points, color, opacity, dashed) {
      const mat = dashed
        ? new THREE.LineDashedMaterial({ color: color, transparent: true, opacity: opacity, dashSize: dashed[0], gapSize: dashed[1], depthWrite: false })
        : new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: opacity, depthWrite: false });
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), mat);
      if (dashed) l.computeLineDistances();
      return l;
    }
    /** 箭頭（沿 +y 建立，長度 1；用 setArrow 擺放） */
    function makeArrow(color) {
      const g = new THREE.Group();
      const m = std(color, { roughness: 0.35, emissive: color, emissiveIntensity: isDark() ? 0.25 : 0.08 });
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 12), m);
      const head = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 16), m);
      g.add(shaft); g.add(head);
      g.userData = { shaft: shaft, head: head };
      return g;
    }
    const UPV = new THREE.Vector3(0, 1, 0), tmpV = new THREE.Vector3();
    function setArrow(a, from, dir, len, w) {
      if (!(len > 1e-4)) { a.visible = false; return; }
      a.visible = true;
      const hl = Math.min(len * 0.45, w * 4.2), sl = Math.max(1e-4, len - hl);
      const u = a.userData;
      u.shaft.scale.set(w, sl, w); u.shaft.position.set(0, sl / 2, 0);
      u.head.scale.set(w * 2.3, hl, w * 2.3); u.head.position.set(0, sl + hl / 2, 0);
      a.position.copy(from);
      a.quaternion.setFromUnitVectors(UPV, tmpV.copy(dir).normalize());
    }

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
      g.fillStyle = D.alpha(C['canvas-bg'], isDark() ? 0.84 : 0.9);
      g.fill();
      g.strokeStyle = D.alpha(color, isDark() ? 0.5 : 0.4);
      g.lineWidth = RES;
      g.stroke();
      g.font = fMain;
      g.textBaseline = 'middle';
      g.textAlign = 'left';
      g.fillStyle = color;
      g.fillText(text, padX, c.height / 2);
      return c;
    }
    /** opt：{ size, prio（2 主要、1 次要）, dir（螢幕方向，y 向上）, gap } */
    function label(text, color, opt) {
      opt = opt || {};
      const c = labelCanvas(text, color, opt);
      const tex = canvasTex(c);
      tex.minFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false }));
      sp.userData = { isLabel: true, text: text, color: color, opt: opt, lw: c.width / RES, lh: c.height / RES,
        prio: opt.prio != null ? opt.prio : 1, dir: opt.dir || [0, 1], gap: opt.gap == null ? 6 : opt.gap };
      sp.renderOrder = 30;
      fitLabel(sp);
      return sp;
    }
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

    // =====================================================================
    // 擴散：1 單位 = 10 μm；盒子置中
    // =====================================================================
    const box = K.BOX, SD = 0.1;
    const BX = box.Lx * SD, BY = box.Ly * SD, BZ = box.Lz * SD;
    const HIST_BASE = -BY / 2 - 4.3, HIST_H = 2.9, HZ = 2.8;   // 直方圖在盒子前下方（往前移，免得被盒子擋住）
    const dX = function (x) { return x * SD - BX / 2; };
    const dY = function (y) { return BY / 2 - y * SD; };
    const dZ = function (z) { return BZ / 2 - z * SD; };   // z = 0 在前面（靠近你）
    let DIF = null;
    function buildDiff() {
      const g = new THREE.Group();
      const R = { g: g };
      // 水
      const water = new THREE.Mesh(new THREE.BoxGeometry(BX - 0.04, BY - 0.04, BZ - 0.04),
        std(col('do-water'), { transparent: true, opacity: isDark() ? 0.1 : 0.07, depthWrite: false, roughness: 0.2 }));
      water.renderOrder = 1;
      g.add(water);
      // 玻璃盒
      const glass = new THREE.Mesh(new THREE.BoxGeometry(BX + 0.12, BY + 0.12, BZ + 0.12), glassMat());
      glass.renderOrder = 5;
      g.add(glass);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(BX + 0.12, BY + 0.12, BZ + 0.12)),
        new THREE.LineBasicMaterial({ color: col('do-glass'), transparent: true, opacity: 0.9 }));
      g.add(edges);
      // 底板（讓盒子有落腳處）
      const plate = new THREE.Mesh(new THREE.BoxGeometry(BX + 0.8, 0.18, BZ + 0.8), std(col('surface'), { roughness: 0.7 }));
      plate.position.y = -BY / 2 - 0.16;
      plate.receiveShadow = true; plate.castShadow = true;
      g.add(plate);
      // 中線（虛線框）
      const mid = line([new THREE.Vector3(0, -BY / 2, BZ / 2 + 0.07), new THREE.Vector3(0, BY / 2, BZ / 2 + 0.07), new THREE.Vector3(0, BY / 2, -BZ / 2 - 0.07),
        new THREE.Vector3(0, -BY / 2, -BZ / 2 - 0.07), new THREE.Vector3(0, -BY / 2, BZ / 2 + 0.07)], col('text'), 0.35, [0.25, 0.2]);
      g.add(mid);
      // 隔板
      const part = new THREE.Mesh(new THREE.BoxGeometry(0.1, BY + 0.1, BZ + 0.1), phys(col('do-glass'), { transparent: true, opacity: 0.55, roughness: 0.1 }));
      part.castShadow = true;
      part.position.x = dX(box.a);
      g.add(part);
      R.part = part;
      // 粒子
      const sph = new THREE.SphereGeometry(1, 14, 10);
      const pm = std(col('do-solute'), { roughness: 0.3, metalness: 0, emissive: col('do-solute'), emissiveIntensity: isDark() ? 0.22 : 0.14 });
      const inst = new THREE.InstancedMesh(sph, pm, box.N);
      inst.castShadow = true;
      inst.frustumCulled = false;
      g.add(inst);
      R.inst = inst;
      // 追蹤的粒子與路徑
      R.track = [];
      for (let k = 0; k < 3; k++) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), std(col('do-track'), { roughness: 0.25, emissive: col('do-track'), emissiveIntensity: isDark() ? 0.45 : 0.15 }));
        m.castShadow = true;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6 * 160), 3));
        geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(6 * 160), 3));
        const tl = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95 }));
        tl.frustumCulled = false;
        g.add(m); g.add(tl);
        R.track.push({ m: m, line: tl });
      }
      // 直方圖（盒子下方）
      const hb = new THREE.Mesh(new THREE.BoxGeometry(BX + 0.6, 0.14, 1.6), std(col('surface'), { roughness: 0.7 }));
      hb.position.set(0, HIST_BASE - 0.07, HZ);
      hb.receiveShadow = true;
      g.add(hb);
      const bw = BX / BINS;
      const barGeo = new THREE.BoxGeometry(bw * 0.82, 1, 1.1);
      barGeo.translate(0, 0.5, 0);
      const barMat = std(col('do-solute'), { roughness: 0.5 });
      R.bars = [];
      for (let b = 0; b < BINS; b++) {
        const m = new THREE.Mesh(barGeo, barMat);
        m.position.set(-BX / 2 + (b + 0.5) * bw, HIST_BASE, HZ);
        m.castShadow = true;
        g.add(m);
        R.bars.push(m);
      }
      const tg = new THREE.BufferGeometry();
      tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * BINS), 3));
      R.theory = new THREE.Line(tg, new THREE.LineBasicMaterial({ color: col('accent') }));
      R.theory.frustumCulled = false;
      g.add(R.theory);
      const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 10, 8), std(col('accent'), { emissive: col('accent'), emissiveIntensity: 0.3 }), BINS);
      dots.frustumCulled = false;
      g.add(dots);
      R.dots = dots;
      const yu = HIST_BASE + HIST_H * (box.N / BINS) / (box.N * 2 / BINS * 1.08);
      R.uniform = line([new THREE.Vector3(-BX / 2, yu, HZ + 0.62), new THREE.Vector3(BX / 2, yu, HZ + 0.62)], col('text'), 0.55, [0.3, 0.22]);
      g.add(R.uniform);
      // 比例尺 50 μm（盒子前下緣）
      const sb = line([new THREE.Vector3(-BX / 2 + 0.4, -BY / 2 - 0.45, BZ / 2 + 0.5), new THREE.Vector3(-BX / 2 + 0.4 + 50 * SD, -BY / 2 - 0.45, BZ / 2 + 0.5)], col('text'), 0.9);
      g.add(sb);
      // 標籤
      R.lbL = label('', C.text, { prio: 2, dir: [0, 1] }); R.lbL.position.set(-BX / 4, BY / 2 + 0.3, 0);
      R.lbR = label('', C.text, { prio: 2, dir: [0, 1] }); R.lbR.position.set(BX / 4, BY / 2 + 0.3, 0);
      R.lbScale = label('50 μm', C.text, { prio: 1, dir: [1, 0], size: 11 }); R.lbScale.position.set(-BX / 2 + 0.4 + 50 * SD, -BY / 2 - 0.45, BZ / 2 + 0.5);
      R.lbHist = label(T('粒子數（每格）', 'Particles per slice'), C.muted, { prio: 1, dir: [-1, 0], size: 11 }); R.lbHist.position.set(-BX / 2 - 0.3, HIST_BASE + HIST_H * 0.7, HZ);
      R.lbTheory = label(T('理論', 'Theory'), C.accent, { prio: 1, dir: [1, 0], size: 11 });
      g.add(R.lbL); g.add(R.lbR); g.add(R.lbScale); g.add(R.lbHist); g.add(R.lbTheory);
      R.mat4 = new THREE.Matrix4();
      return R;
    }
    const pos3 = [0, 0, 0];
    function updateDiff() {
      const R = DIF, c = B.DF.cloud, st = B.DF.stats;
      const rw = Math.max(0.07, Math.min(0.2, 0.055 + 0.032 * Math.log2(B.DF.r / 0.2 + 1)));
      const m4 = R.mat4;
      for (let i = 0; i < c.N; i++) {
        K.posOf(c, i, pos3);
        m4.makeScale(rw, rw, rw);
        m4.setPosition(dX(pos3[0]), dY(pos3[1]), dZ(pos3[2]));
        R.inst.setMatrixAt(i, m4);
      }
      R.inst.instanceMatrix.needsUpdate = true;
      // 隔板（移除時往上升起淡去：純裝飾）
      const pa = c.partition ? 1 : B.DF.partAnim;
      R.part.visible = pa > 0.01;
      R.part.position.y = c.partition ? 0 : (1 - pa) * BY * 0.9;
      R.part.material.opacity = 0.55 * pa;
      // 追蹤
      const tcol = col('do-track'), bg = new THREE.Color(C['canvas-bg']);
      R.track.forEach(function (tk, n) {
        const idx = B.DF.track[n];
        if (idx == null) { tk.m.visible = false; tk.line.visible = false; return; }
        tk.m.visible = true; tk.line.visible = true;
        K.posOf(c, idx, pos3);
        tk.m.position.set(dX(pos3[0]), dY(pos3[1]), dZ(pos3[2]));
        tk.m.scale.setScalar(rw * 1.6);
        const tr = B.DF.trails[n] || [];
        const P = tk.line.geometry.attributes.position.array, Cc = tk.line.geometry.attributes.color.array;
        let s = 0;
        for (let k = 1; k < tr.length && s < 159; k++) {
          const a0 = tr[k - 1], a1 = tr[k];
          if (Math.abs(a1[0] - a0[0]) > box.Lx * 0.35 || Math.abs(a1[1] - a0[1]) > box.Ly * 0.6 || Math.abs((a1[2] || 0) - (a0[2] || 0)) > box.Lz * 0.6) continue;
          const u = k / tr.length;
          const cc = bg.clone().lerp(tcol, 0.15 + 0.85 * u);
          P.set([dX(a0[0]), dY(a0[1]), dZ(a0[2] || 0), dX(a1[0]), dY(a1[1]), dZ(a1[2] || 0)], 6 * s);
          Cc.set([cc.r, cc.g, cc.b, cc.r, cc.g, cc.b], 6 * s);
          s++;
        }
        tk.line.geometry.setDrawRange(0, 2 * s);
        tk.line.geometry.attributes.position.needsUpdate = true;
        tk.line.geometry.attributes.color.needsUpdate = true;
      });
      // 直方圖與理論
      const h = K.histogram(c, BINS);
      const e = K.expectedBins(c.N, c.a, c.Lx, c.partition ? 0 : c.theta, BINS);
      const top = Math.max(c.N * 2 / BINS * 1.08, Math.max.apply(null, h) * 1.05);
      const tp = R.theory.geometry.attributes.position.array;
      const bw = BX / BINS;
      for (let b = 0; b < BINS; b++) {
        R.bars[b].scale.y = Math.max(0.001, HIST_H * h[b] / top);
        const x = -BX / 2 + (b + 0.5) * bw, y = HIST_BASE + HIST_H * e[b] / top;
        tp[3 * b] = x; tp[3 * b + 1] = y; tp[3 * b + 2] = HZ + 0.62;
        m4.makeTranslation(x, y, HZ + 0.62);
        R.dots.setMatrixAt(b, m4);
      }
      R.theory.geometry.attributes.position.needsUpdate = true;
      R.dots.instanceMatrix.needsUpdate = true;
      R.lbTheory.position.set(BX / 2 - bw / 2, tp[3 * (BINS - 1) + 1], HZ + 0.62);
      relabel(R.lbL, T('左半邊 ', 'Left half ') + st.nL, C.text);
      relabel(R.lbR, T('右半邊 ', 'Right half ') + st.nR, C.text);
      const Dv = B.Dnow();
      setHud('a', c.partition ? T('隔板還在', 'Partition in') : 't = ' + B.fmtTime(c.t));
      setHud('b', 'D = ' + B.num(Dv, Dv < 100 ? 1 : 0) + ' μm²/s');
      setHud('c', T('右半邊 ', 'Right half ') + B.num(100 * st.fracR, 1) + '%');
      setHud('d', c.partition ? '' : T('到過右半邊 ', 'Visited the right ') + st.seen + ' / ' + st.N);
      setHud('note', T('粒子畫得比實際大很多（示意）；盒子 200 × 80 × 40 μm', 'Particles drawn far larger than real; box 200 × 80 × 40 μm'));
    }

    // =====================================================================
    // 滲透：1 m = 7 單位；彎管的上緣（兩管的底）在 y = 0
    // =====================================================================
    const SO = 7, AR = 1.1, RT = 0.27, RG = 0.33;
    const TOPY = K.UTUBE.top * SO;
    let OSM = null;
    class UPath extends THREE.Curve {
      constructor(top) { super(); this.top = top; this.L1 = top; this.L2 = Math.PI * AR; this.tot = 2 * top + this.L2; }
      getPoint(t, out) {
        out = out || new THREE.Vector3();
        let s = t * this.tot;
        if (s <= this.L1) return out.set(-AR, this.top - s, 0);
        s -= this.L1;
        if (s <= this.L2) { const a = Math.PI + s / AR; return out.set(AR * Math.cos(a), AR * Math.sin(a), 0); }
        s -= this.L2;
        return out.set(AR, s, 0);
      }
    }
    function buildOsmo() {
      const g = new THREE.Group();
      const R = { g: g };
      // 玻璃 U 形管
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new UPath(TOPY), 160, RG, 24, false), glassMat());
      tube.renderOrder = 5;
      g.add(tube);
      [-AR, AR].forEach(function (x) {
        const rim = new THREE.Mesh(new THREE.TorusGeometry(RG, 0.025, 8, 32), phys(col('do-glass'), { transparent: true, opacity: 0.6 }));
        rim.rotation.x = Math.PI / 2; rim.position.set(x, TOPY, 0);
        g.add(rim);
      });
      // 液柱（左、右各一段直管＋四分之一圓彎管）
      const cyl = new THREE.CylinderGeometry(RT, RT, 1, 28, 1, false);
      cyl.translate(0, 0.5, 0);
      R.matL = phys(col('do-water'), { transparent: true, opacity: 0.78, roughness: 0.12, clearcoat: 0.6 });
      R.matR = phys(col('do-water'), { transparent: true, opacity: 0.78, roughness: 0.12, clearcoat: 0.6 });
      R.colL = new THREE.Mesh(cyl, R.matL); R.colL.position.set(-AR, 0, 0);
      R.colR = new THREE.Mesh(cyl.clone(), R.matR); R.colR.position.set(AR, 0, 0);
      const bendL = new THREE.Mesh(new THREE.TorusGeometry(AR, RT, 20, 40, Math.PI / 2), R.matL); bendL.rotation.z = Math.PI;
      const bendR = new THREE.Mesh(new THREE.TorusGeometry(AR, RT, 20, 40, Math.PI / 2), R.matR); bendR.rotation.z = Math.PI * 1.5;
      [R.colL, R.colR, bendL, bendR].forEach(function (m) { m.renderOrder = 2; m.castShadow = true; g.add(m); });
      // 液面（略亮的圓面）
      R.surfL = new THREE.Mesh(new THREE.CircleGeometry(RT * 0.98, 32), std(col('do-water'), { transparent: true, opacity: 0.85, roughness: 0.05 }));
      R.surfR = new THREE.Mesh(new THREE.CircleGeometry(RT * 0.98, 32), std(col('do-water'), { transparent: true, opacity: 0.85, roughness: 0.05 }));
      [R.surfL, R.surfR].forEach(function (m) { m.rotation.x = -Math.PI / 2; m.renderOrder = 3; g.add(m); });
      // 半透膜
      const mem = new THREE.Mesh(new THREE.CylinderGeometry(RG * 1.18, RG * 1.18, 0.06, 36), std(col('do-mem'), { roughness: 0.55 }));
      mem.rotation.z = Math.PI / 2;
      mem.position.set(0, -AR, 0);
      mem.castShadow = true;
      g.add(mem);
      // 活塞
      const metal = std(col('muted'), { roughness: 0.32, metalness: 0.55 });
      R.piston = new THREE.Group();
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(RT * 0.97, RT * 0.97, 0.14, 28), metal);
      disc.position.y = 0.07;
      const rodGeo = new THREE.CylinderGeometry(0.035, 0.035, 1, 10); rodGeo.translate(0, 0.5, 0);
      R.rod = new THREE.Mesh(rodGeo, metal);
      R.handle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.62, 14), metal);
      R.handle.rotation.z = Math.PI / 2;
      [disc, R.rod, R.handle].forEach(function (m) { m.castShadow = true; R.piston.add(m); });
      g.add(R.piston);
      // 尺（左管左邊，0 在彎管上緣）
      const rx = -AR - RG - 0.42;
      const board = new THREE.Mesh(new THREE.BoxGeometry(0.22, TOPY + 0.3, 0.06), std(col('surface'), { roughness: 0.7 }));
      board.position.set(rx - 0.05, TOPY / 2, 0);
      board.castShadow = true;
      g.add(board);
      const tick = [];
      for (let cm = 0; cm <= 110; cm += 5) {
        const y = cm / 100 * SO, w = cm % 10 === 0 ? 0.2 : 0.11;
        tick.push(new THREE.Vector3(rx + 0.06 - w, y, 0.04), new THREE.Vector3(rx + 0.06, y, 0.04));
      }
      g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(tick), new THREE.LineBasicMaterial({ color: col('text'), transparent: true, opacity: 0.7 })));
      R.rulerLabels = [];
      for (let cm = 0; cm <= 100; cm += 20) {
        const lb = label(String(cm), C.muted, { prio: 0, dir: [-1, 0], size: 10, gap: 3 });
        lb.position.set(rx - 0.2, cm / 100 * SO, 0.04);
        g.add(lb);
      }
      const lbcm = label('cm', C.muted, { prio: 0, dir: [0, 1], size: 10 }); lbcm.position.set(rx - 0.1, TOPY + 0.2, 0); g.add(lbcm);
      // 液面差：虛線與 h 標籤
      R.lvl = line([new THREE.Vector3(-AR, 0, 0), new THREE.Vector3(AR, 0, 0)], col('text'), 0.5, [0.12, 0.1]);
      R.lvl2 = line([new THREE.Vector3(-AR, 0, 0), new THREE.Vector3(AR, 0, 0)], col('text'), 0.5, [0.12, 0.1]);
      R.hBar = line([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0)], col('text'), 0.9);
      g.add(R.lvl); g.add(R.lvl2); g.add(R.hBar);
      R.lbH = label('', C.text, { prio: 3, dir: [0, 0], size: 12, weight: 700 });
      R.lbOL = label('', C.text, { prio: 2, dir: [-1, 1] });
      R.lbOR = label('', C.text, { prio: 2, dir: [1, 1] });
      R.lbMem = label(T('半透膜', 'Membrane'), C['do-mem'], { prio: 2, dir: [0, -1], size: 11 }); R.lbMem.position.set(0, -AR - RG, 0);
      R.lbP = label('', C.pos, { prio: 2, dir: [1, 0], size: 11 });
      R.lbWater = label(T('水', 'water'), C['do-water'], { prio: 1, dir: [0, 1], size: 11 });
      [R.lbH, R.lbOL, R.lbOR, R.lbMem, R.lbP, R.lbWater].forEach(function (s) { g.add(s); });
      // 水流箭頭（膜的上方）
      R.flow = makeArrow(col('do-water'));
      g.add(R.flow);
      // 溶質粒子（示意：數量隨目前的滲透濃度）
      R.solMax = 48;
      R.sol = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 10, 8), std(col('do-solute'), { roughness: 0.35, emissive: col('do-solute'), emissiveIntensity: 0.15 }), 2 * R.solMax);
      R.sol.frustumCulled = false;
      R.sol.renderOrder = 4;
      g.add(R.sol);
      const rr = rnd(97);
      R.pts = [];
      for (let k = 0; k < 2 * R.solMax; k++) { const a = rr() * TAU, q = Math.sqrt(rr()) * RT * 0.78; R.pts.push([q * Math.cos(a), rr(), q * Math.sin(a)]); }
      R.mat4 = new THREE.Matrix4();
      return R;
    }
    function updateOsmo() {
      const R = OSM, OS = B.OS, r = K.osmoReadout(OS.st, B.S.Tc, OS.P * 1000);
      const yL = r.hL * SO, yR = r.hR * SO;
      R.colL.scale.y = Math.max(1e-3, yL); R.colR.scale.y = Math.max(1e-3, yR);
      R.surfL.position.set(-AR, yL + 0.002, 0); R.surfR.position.set(AR, yR + 0.002, 0);
      const tint = function (osm) { return new THREE.Color(D.mix(C['do-water'], C['do-solute'], Math.max(0, Math.min(0.75, osm / 6)))); };
      const cl = tint(r.osmL), cr = tint(r.osmR);
      R.matL.color.copy(cl); R.matR.color.copy(cr);
      R.surfL.material.color.copy(cl).lerp(new THREE.Color(0xffffff), 0.25); R.surfR.material.color.copy(cr).lerp(new THREE.Color(0xffffff), 0.25);
      // 活塞：靠在右管液面上
      R.piston.position.set(AR, yR + 0.004, 0);
      const rodTop = Math.max(TOPY + 0.7, yR + 0.9);
      R.rod.scale.y = rodTop - yR - 0.14; R.rod.position.y = 0.14;
      R.handle.position.y = rodTop - yR;
      // 液面差
      const pL = R.lvl.geometry.attributes.position.array, pR = R.lvl2.geometry.attributes.position.array;
      pL.set([-AR + RG, yL, 0, -0.06, yL, 0]); pR.set([AR - RG, yR, 0, 0.06, yR, 0]);
      R.lvl.geometry.attributes.position.needsUpdate = true; R.lvl2.geometry.attributes.position.needsUpdate = true;
      R.lvl.computeLineDistances(); R.lvl2.computeLineDistances();
      const hb = R.hBar.geometry.attributes.position.array;
      hb.set([0, yL, 0, 0, yR, 0]);
      R.hBar.geometry.attributes.position.needsUpdate = true;
      R.hBar.visible = Math.abs(yR - yL) > 0.05;
      const hcm = r.h * 100;
      relabel(R.lbH, Math.abs(hcm) < 0.05 ? 'h ≈ 0' : 'h = ' + B.signed(hcm, 1) + ' cm', C.text);
      R.lbH.position.set(0, Math.min((yL + yR) / 2, TOPY), 0.3);
      const lbl = function (sk, c0) { return c0 <= 0 ? T('純水', 'pure water') : B.shortSol(sk) + ' ' + B.num(c0, 2) + ' mmol/L'; };
      relabel(R.lbOL, T('左：', 'Left: ') + lbl(OS.solL, OS.CL), C.text);
      relabel(R.lbOR, T('右：', 'Right: ') + lbl(OS.solR, OS.CR), C.text);
      R.lbOL.position.set(-AR, TOPY + 0.25, 0);
      R.lbOR.position.set(AR, Math.max(TOPY + 0.25, rodTop + 0.2), 0);
      R.lbP.visible = OS.P > 0.0005;
      if (R.lbP.visible) { relabel(R.lbP, 'P = ' + B.num(OS.P, 2) + ' kPa', C.pos); R.lbP.position.set(AR + 0.35, rodTop, 0); }
      // 水流箭頭
      const rateCm = r.rate * 6000;
      if (Math.abs(rateCm) > 0.004) {
        const dir = rateCm > 0 ? 1 : -1;
        const len = Math.max(0.3, Math.min(1.1, 0.3 + 0.22 * Math.log10(Math.abs(rateCm) / 0.004)));
        setArrow(R.flow, new THREE.Vector3(-dir * len / 2, -AR + RG + 0.32, 0), new THREE.Vector3(dir, 0, 0), len, 0.04);
        R.lbWater.visible = true;
        R.lbWater.position.set(0, -AR + RG + 0.45, 0);
      } else { R.flow.visible = false; R.lbWater.visible = false; }
      // 溶質粒子
      const n = function (osm) { return Math.round(Math.max(0, Math.min(R.solMax, osm * 14))); };
      const nL = n(r.osmL), nR = n(r.osmR);
      const m4 = R.mat4;
      let k = 0;
      const jig = !B.reducedMotion && B.S.running;
      for (let j = 0; j < nL + nR; j++) {
        const side = j < nL ? -1 : 1, idx = side < 0 ? j : R.solMax + (j - nL);
        const p = R.pts[idx], top = side < 0 ? yL : yR;
        if (jig) {
          p[0] += (Math.random() - 0.5) * 0.02; p[2] += (Math.random() - 0.5) * 0.02; p[1] += (Math.random() - 0.5) * 0.004;
          const q = Math.hypot(p[0], p[2]); if (q > RT * 0.8) { p[0] *= RT * 0.8 / q; p[2] *= RT * 0.8 / q; }
          if (p[1] < 0.01) p[1] = 0.01; if (p[1] > 0.99) p[1] = 0.99;
        }
        m4.makeTranslation(side * AR + p[0], 0.06 + p[1] * Math.max(0, top - 0.12), p[2]);
        R.sol.setMatrixAt(k++, m4);
      }
      R.sol.count = k;
      R.sol.instanceMatrix.needsUpdate = true;
      setHud('a', 't = ' + B.fmtMin(OS.st.t) + (narrow ? '' : T('（已加速）', ' (sped up)')));
      setHud('b', 'h = ' + B.signed(hcm, 2) + ' cm');
      setHud('c', 'Δπ = ' + B.signed(r.dpi / 1000, 3) + ' kPa');
      setHud('d', 'ρgh + P = ' + B.signed((r.rhogh + OS.P * 1000) / 1000, 3) + ' kPa');
      setHud('note', T('管徑與兩管的距離未依比例（示意）', 'Tube width and spacing not to scale'));
    }

    // =====================================================================
    // 細胞：紅血球 1 μm = 0.5 單位；植物細胞以細胞壁內容積為單位（未依比例）
    // =====================================================================
    const UR = 0.5;
    const SPIKES = fibDirs(30);
    const PLW = [1.6, 0.95, 1.05];        // 植物細胞壁內側的半長（x、y、z），V = V_w 時
    const WALL_T = 0.09;
    let CEL = null;
    function cellPlaces() {
      return narrow ? { rbc: new THREE.Vector3(0, 3.1, 0), plant: new THREE.Vector3(0, -1.9, 0) } : { rbc: new THREE.Vector3(-3.5, 0.2, 0), plant: new THREE.Vector3(2.9, 0, 0) };
    }
    function rbcGeometry(V, lysed) {
      const sh = lysed ? { s: 1, f: 1, cren: 0 } : K.rbcShape(V);
      const M = 40, pts = [];
      for (let j = 0; j <= M; j++) { const a = j / M * Math.PI / 2; const q = K.rbcProfilePoint(a, sh.s, sh.f); pts.push(new THREE.Vector2(Math.max(1e-4, q[0] * UR), -q[1] * UR)); }
      for (let j = M - 1; j >= 0; j--) { const a = j / M * Math.PI / 2; const q = K.rbcProfilePoint(a, sh.s, sh.f); pts.push(new THREE.Vector2(Math.max(1e-4, q[0] * UR), q[1] * UR)); }
      const geo = new THREE.LatheGeometry(pts, 96);
      if (sh.cren > 0.01) {   // 皺縮的小刺（示意；不改變計算的體積）
        const p = geo.attributes.position, amp = 0.16 * sh.cren;
        const rim = K.rbcProfilePoint(Math.PI / 2, sh.s, sh.f)[0] * UR;
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
          const L = Math.hypot(x, y * 2.2, z) || 1;
          const dx = x / L, dy = y * 2.2 / L, dz = z / L;
          let s = 0;
          for (let k = 0; k < SPIKES.length; k++) {
            const d = dx * SPIKES[k][0] + dy * SPIKES[k][1] + dz * SPIKES[k][2];
            if (d > 0.9) s += Math.exp(-(1 - d) / 0.006);
          }
          const rr = Math.hypot(x, z), push = amp * rim * Math.min(1, s);
          const k2 = rr > 1e-6 ? (rr + push * 0.85) / rr : 1;
          p.setXYZ(i, x * k2, y + Math.sign(y) * push * 0.6, z * k2);
        }
        geo.computeVertexNormals();
      }
      return { geo: geo, sh: sh };
    }
    /** 超橢球的原生質體：v 越小越圓（指數 p 越小） */
    function protoShape(v) {
      const sw = v > 1 ? Math.cbrt(v) : 1;
      if (v >= 1) return { a: PLW[0] * sw * 0.985, b: PLW[1] * sw * 0.985, c: PLW[2] * sw * 0.985, p: 9 };
      const u = Math.max(0, Math.min(1, (v - 0.3) / 0.7));
      const p = 2.2 + 6.8 * u * u;
      const s = Math.min(0.985, Math.cbrt(v / superFrac(p)));
      return { a: PLW[0] * s, b: PLW[1] * s, c: PLW[2] * s, p: p };
    }
    function superPoint(d, sp, out) {
      const q = Math.pow(Math.pow(Math.abs(d[0]), sp.p) + Math.pow(Math.abs(d[1]), sp.p) + Math.pow(Math.abs(d[2]), sp.p), 1 / sp.p);
      out[0] = sp.a * d[0] / q; out[1] = sp.b * d[1] / q; out[2] = sp.c * d[2] / q;
      return out;
    }
    const CHLORO = fibDirs(18), NUC_DIR = (function () { const L = Math.hypot(-0.62, 0.32, 0.5); return [-0.62 / L, 0.32 / L, 0.5 / L]; })();
    function buildCell() {
      const g = new THREE.Group();
      const R = { g: g, rbcKey: '', protoKey: '' };
      const pl = cellPlaces();
      // ---- 紅血球
      R.rbcG = new THREE.Group();
      R.rbcG.position.copy(pl.rbc);
      R.rbcG.rotation.set(-1.0, 0, 0.22);
      R.rbcMat = phys(col('do-rbc'), { roughness: 0.42, clearcoat: 0.35, sheen: 0.4, sheenColor: col('do-rbc') });
      R.rbc = new THREE.Mesh(new THREE.BufferGeometry(), R.rbcMat);
      R.rbc.castShadow = true;
      R.rbcG.add(R.rbc);
      g.add(R.rbcG);
      // 溶血：散開的血紅素（示意）
      R.burst = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 8, 6), std(col('do-rbc'), { transparent: true, opacity: 0.8, emissive: col('do-rbc'), emissiveIntensity: 0.3 }), 80);
      R.burst.frustumCulled = false;
      R.burst.position.copy(pl.rbc);
      g.add(R.burst);
      R.burstDirs = fibDirs(80);
      R.rbcArrows = [];
      for (let k = 0; k < 6; k++) { const a = makeArrow(col('do-water')); g.add(a); R.rbcArrows.push(a); }
      // ---- 植物細胞
      R.plG = new THREE.Group();
      R.plG.position.copy(pl.plant);
      R.plG.rotation.set(0.12, -0.35, 0);
      const wm = phys(col('do-wall'), { transparent: true, opacity: isDark() ? 0.28 : 0.32, roughness: 0.6, clearcoat: 0, side: THREE.DoubleSide, depthWrite: false });
      R.wall = new THREE.Mesh(new THREE.BoxGeometry(2 * (PLW[0] + WALL_T), 2 * (PLW[1] + WALL_T), 2 * (PLW[2] + WALL_T)), wm);
      R.wall.renderOrder = 6;
      R.wallEdges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(2 * (PLW[0] + WALL_T), 2 * (PLW[1] + WALL_T), 2 * (PLW[2] + WALL_T))),
        new THREE.LineBasicMaterial({ color: new THREE.Color(D.shade(C['do-wall'], isDark() ? 0.2 : -0.2)) }));
      R.wallIn = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(2 * PLW[0], 2 * PLW[1], 2 * PLW[2])),
        new THREE.LineBasicMaterial({ color: col('do-wall'), transparent: true, opacity: 0.45 }));
      R.plG.add(R.wall); R.plG.add(R.wallEdges); R.plG.add(R.wallIn);
      R.protoMat = phys(col('do-plant'), { transparent: true, opacity: 0.45, roughness: 0.35, depthWrite: false, clearcoat: 0.5 });
      R.proto = new THREE.Mesh(new THREE.BufferGeometry(), R.protoMat);
      R.proto.renderOrder = 4;
      R.vac = new THREE.Mesh(new THREE.SphereGeometry(1, 36, 24), phys(new THREE.Color(D.mix(C['do-mem'], '#ffffff', isDark() ? 0.25 : 0.55)), { roughness: 0.15, clearcoat: 0.8 }));
      R.vac.renderOrder = 2;
      R.nuc = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 14), std(new THREE.Color(D.mix(C.muted, C['do-mem'], 0.35)), { roughness: 0.5 }));
      R.plG.add(R.vac); R.plG.add(R.nuc); R.plG.add(R.proto);
      R.chl = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 14, 10), std(new THREE.Color(D.shade(C['do-plant'], -0.15)), { roughness: 0.4 }), CHLORO.length);
      R.chl.frustumCulled = false;
      R.chl.castShadow = true;
      R.plG.add(R.chl);
      R.plArrows = [];
      for (let k = 0; k < 4; k++) { const a = makeArrow(col('do-water')); R.plG.add(a); R.plArrows.push(a); }
      R.turArrows = [];
      for (let k = 0; k < 4; k++) { const a = makeArrow(col('pos')); R.plG.add(a); R.turArrows.push(a); }
      g.add(R.plG);
      // ---- 外液的溶質粒子（示意：數量隨滲透濃度）
      R.solMax = 260;
      R.sol = new THREE.InstancedMesh(new THREE.SphereGeometry(0.04, 8, 6), std(col('do-solute'), { roughness: 0.4, emissive: col('do-solute'), emissiveIntensity: 0.12 }), R.solMax);
      R.sol.frustumCulled = false;
      g.add(R.sol);
      const rr = rnd(31);
      R.pts = [];
      const ext = narrow ? [2.6, 5.2, 2.2] : [6.6, 2.6, 2.4];
      while (R.pts.length < R.solMax) {
        const p = [(rr() * 2 - 1) * ext[0], (rr() * 2 - 1) * ext[1], (rr() * 2 - 1) * ext[2]];
        const v1 = new THREE.Vector3(p[0], p[1], p[2]);
        if (v1.distanceTo(pl.rbc) < 2.3) continue;
        const q = v1.clone().sub(pl.plant);
        if (Math.abs(q.x) < PLW[0] * 1.2 + 0.3 && Math.abs(q.y) < PLW[1] * 1.2 + 0.3 && Math.abs(q.z) < PLW[2] * 1.2 + 0.3) continue;
        R.pts.push(p);
      }
      R.ext = ext;
      // ---- 標籤
      R.lbRbc = label(T('紅血球', 'Red blood cell'), C.text, { prio: 2, dir: [0, 1], weight: 700 });
      R.lbPl = label(T('植物細胞', 'Plant cell'), C.text, { prio: 2, dir: [0, 1], weight: 700 });
      R.lbRs = label('', C.text, { prio: 3, dir: [0, -1], weight: 700 });
      R.lbPs = label('', C.text, { prio: 3, dir: [0, -1], weight: 700 });
      [R.lbRbc, R.lbPl, R.lbRs, R.lbPs].forEach(function (s) { g.add(s); });
      R.mat4 = new THREE.Matrix4();
      return R;
    }
    const sp3 = [0, 0, 0];
    function updateCell() {
      const R = CEL, CS = B.CS, osm = B.osmOut();
      const pl = cellPlaces();
      // ---- 紅血球
      const lysed = CS.rbc.lysed;
      const key = lysed ? 'L' : String(Math.round(CS.rbc.V * 5));
      if (key !== R.rbcKey) {
        R.rbcKey = key;
        const rg = rbcGeometry(CS.rbc.V, lysed);
        R.rbc.geometry.dispose();
        R.rbc.geometry = rg.geo;
        R.rbcRim = K.rbcProfilePoint(Math.PI / 2, rg.sh.s, rg.sh.f)[0] * UR;
        R.rbcMat.transparent = lysed; R.rbcMat.opacity = lysed ? 0.16 : 1; R.rbcMat.depthWrite = !lysed;
        R.rbcMat.needsUpdate = true;
        R.rbc.castShadow = !lysed;
      }
      const age = lysed ? (performance.now() - CS.lysedAt) / 1000 : -1;
      if (lysed && age < 3.2) {
        const u = Math.max(0, age) / 3.2, rad = R.rbcRim * (0.6 + 2.2 * u);
        const m4 = R.mat4;
        R.burstDirs.forEach(function (d, k) {
          const s = 0.7 + 0.6 * ((k * 37) % 11) / 11;
          m4.makeTranslation(d[0] * rad * s, d[1] * rad * s * 0.6, d[2] * rad * s);
          R.burst.setMatrixAt(k, m4);
        });
        R.burst.instanceMatrix.needsUpdate = true;
        R.burst.material.opacity = 0.8 * (1 - u);
        R.burst.visible = true;
      } else R.burst.visible = false;
      const rateR = lysed ? 0 : K.cellRate('rbc', CS.rbc.V, osm, B.S.Tc);
      const qR = rateR / 6;
      R.rbcArrows.forEach(function (a, k) {
        if (Math.abs(qR) < 0.03) { a.visible = false; return; }
        const ph = k / 6 * TAU + 0.3;
        const len = Math.max(0.25, Math.min(0.7, 0.25 + 0.4 * Math.sqrt(Math.abs(qR))));
        const r0 = R.rbcRim * 1.15 + 0.15;
        const dirOut = new THREE.Vector3(Math.cos(ph), 0, Math.sin(ph)).applyEuler(R.rbcG.rotation);
        const start = qR > 0 ? dirOut.clone().multiplyScalar(r0 + len) : dirOut.clone().multiplyScalar(r0);
        setArrow(a, start.add(pl.rbc), qR > 0 ? dirOut.clone().negate() : dirOut, len, 0.03);
      });
      // ---- 植物細胞
      const v = CS.plant.V;
      const sw = v > 1 ? Math.cbrt(v) : 1;
      R.wall.scale.setScalar(sw); R.wallEdges.scale.setScalar(sw); R.wallIn.scale.setScalar(sw);
      const pkey = String(Math.round(v * 500));
      if (pkey !== R.protoKey) {
        R.protoKey = pkey;
        const sp = protoShape(v);
        const geo = new THREE.SphereGeometry(1, 56, 36);
        const p = geo.attributes.position;
        for (let i = 0; i < p.count; i++) {
          superPoint([p.getX(i), p.getY(i), p.getZ(i)], sp, sp3);
          p.setXYZ(i, sp3[0], sp3[1], sp3[2]);
        }
        geo.computeVertexNormals();
        R.proto.geometry.dispose();
        R.proto.geometry = geo;
        // 液胞（失水時縮得最多）
        const vf = Math.cbrt(Math.max(0.03, (v - K.PLANT.Vb) / v)) * 0.8;
        R.vac.scale.set(sp.a * vf, sp.b * vf * 0.92, sp.c * vf);
        // 葉綠體貼著原生質體內緣
        const m4 = R.mat4, q = new THREE.Quaternion(), nrm = new THREE.Vector3(), sc3 = new THREE.Vector3(0.17, 0.17, 0.065), ps = new THREE.Vector3();
        CHLORO.forEach(function (d, k) {
          superPoint(d, sp, sp3);
          ps.set(sp3[0] * 0.9, sp3[1] * 0.9, sp3[2] * 0.9);
          nrm.set(d[0] / sp.a, d[1] / sp.b, d[2] / sp.c).normalize();
          q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), nrm);
          m4.compose(ps, q, sc3);
          R.chl.setMatrixAt(k, m4);
        });
        R.chl.instanceMatrix.needsUpdate = true;
        superPoint(NUC_DIR, sp, sp3);
        R.nuc.position.set(sp3[0] * 0.72, sp3[1] * 0.72, sp3[2] * 0.72);
        R.protoSp = sp;
      }
      const sp = R.protoSp;
      // 水流箭頭（穿過原生質體的膜）
      const qP = K.cellRate('plant', v, osm, B.S.Tc) / 0.06;
      const faces = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
      R.plArrows.forEach(function (a, k) {
        if (Math.abs(qP) < 0.03) { a.visible = false; return; }
        const f = faces[k], ext = [sp.a, sp.b, sp.c];
        const n = new THREE.Vector3(f[0], f[1], f[2]);
        const base = n.clone().multiplyScalar(Math.abs(f[0]) ? ext[0] : ext[2]).add(new THREE.Vector3(0, 0.35, 0));
        const len = Math.max(0.22, Math.min(0.55, 0.22 + 0.3 * Math.sqrt(Math.abs(qP))));
        if (qP > 0) setArrow(a, base.clone().add(n.clone().multiplyScalar(len + 0.05)), n.clone().negate(), len, 0.026);
        else setArrow(a, base.clone().add(n.clone().multiplyScalar(0.05)), n, len, 0.026);
      });
      // 膨壓箭頭（推著細胞壁）
      const Pk = K.turgor('plant', v);
      R.turArrows.forEach(function (a, k) {
        if (Pk < 30) { a.visible = false; return; }
        const f = [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0]][k];
        const n = new THREE.Vector3(f[0], f[1], f[2]);
        const ext = [PLW[0] * sw + WALL_T, PLW[1] * sw + WALL_T, PLW[2] * sw + WALL_T];
        const d = Math.abs(f[0]) ? ext[0] : ext[1];
        const len = 0.18 + 0.32 * Math.min(1, Pk / 900);
        setArrow(a, n.clone().multiplyScalar(d + 0.06), n, len, 0.028);
      });
      // ---- 外液粒子
      const nSol = Math.round(Math.max(0, Math.min(R.solMax, osm / 4)));
      const jig = !B.reducedMotion && B.S.running;
      const m4 = R.mat4;
      for (let k = 0; k < nSol; k++) {
        const p = R.pts[k];
        if (jig) {
          for (let a = 0; a < 3; a++) { p[a] += (Math.random() - 0.5) * 0.03; if (p[a] > R.ext[a]) p[a] = R.ext[a]; if (p[a] < -R.ext[a]) p[a] = -R.ext[a]; }
        }
        m4.makeTranslation(p[0], p[1], p[2]);
        R.sol.setMatrixAt(k, m4);
      }
      R.sol.count = nSol;
      R.sol.instanceMatrix.needsUpdate = true;
      // ---- 標籤與 HUD
      const rs = B.rbcState(), ps = B.plantState();
      R.lbRbc.position.copy(pl.rbc).add(new THREE.Vector3(0, 1.45, 0));
      R.lbRs.position.copy(pl.rbc).add(new THREE.Vector3(0, -1.45, 0));
      relabel(R.lbRs, lysed ? T('溶血', 'Burst') : B.num(CS.rbc.V, 1) + ' fL・' + rs.zh, rs.color);
      const top = new THREE.Vector3(0, PLW[1] * sw + WALL_T + 0.2, 0).applyEuler(R.plG.rotation);
      R.lbPl.position.copy(pl.plant).add(new THREE.Vector3(0, Math.max(1.3, top.y + 0.25), 0));
      R.lbPs.position.copy(pl.plant).add(new THREE.Vector3(0, -Math.max(1.3, top.y + 0.25), 0));
      relabel(R.lbPs, ps.zh + (Pk > 0.5 ? T('・膨壓 ', ' · turgor ') + B.fmtP(Pk) : ''), ps.color);
      setHud('a', T('外液 ', 'Solution ') + (CS.C <= 0 ? T('清水', 'pure water') : B.num(osm, 0) + ' mOsm/L'));
      setHud('b', 't = ' + B.fmtTime(CS.t) + (narrow ? '' : T('（已放慢）', ' (slowed)')));
      setHud('c', '');
      setHud('d', '');
      setHud('note', T('紅血球依比例（約 8 μm 寬）；植物細胞未依比例', 'Red cell to scale (about 8 μm across); plant cell not to scale'));
    }

    // ---------- 標籤排版：避開彼此、留在畫面內 ----------
    const lp = new THREE.Vector3(), cp = new THREE.Vector3(), labelsNow = [];
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
    function layoutLabels() {
      const M = 4;
      readHudRects();
      labelsNow.length = 0;
      scene.traverseVisible(function (o) { if (o.userData && o.userData.isLabel) labelsNow.push(o); });
      labelsNow.sort(function (a, b) { return b.userData.prio - a.userData.prio; });
      const taken = [];
      labelsNow.forEach(function (sp) {
        const u = sp.userData;
        sp.getWorldPosition(lp);
        cp.copy(lp).project(camera);
        const px = (cp.x + 1) / 2 * cw, py = (cp.y + 1) / 2 * ch;
        anchorLabel(sp, u.dir[0], u.dir[1], u.gap);
        let op = 1;
        if (cp.z > 1) op = 0;
        else {
          const lw = u.lw, lh = u.lh;
          if (px > -M && px < cw + M && py > -M && py < ch + M) {
            if (px - sp.center.x * lw < M) sp.center.x = (px - M) / lw;
            else if (px - sp.center.x * lw + lw > cw - M) sp.center.x = (px - (cw - M - lw)) / lw;
            if (py - sp.center.y * lh < M) sp.center.y = (py - M) / lh;
            else if (py - sp.center.y * lh + lh > ch - M) sp.center.y = (py - (ch - M - lh)) / lh;
          }
          const r = [px - sp.center.x * lw, py - sp.center.y * lh, lw, lh];
          if (taken.some(function (q) { return overlaps(q, r); }) || hudRects.some(function (q) { return overlaps(q, r); })) op = 0;
          if (op > 0.05) taken.push(r);
        }
        if (sp.material.opacity !== op) sp.material.opacity = op;
      });
    }

    // ---------- HUD ----------
    const hudLast = {};
    function setHud(k, txt) { if (hudLast[k] !== txt) { hudLast[k] = txt; hudEl[k].textContent = txt; } }

    // ---------- 場景組裝 ----------
    function buildAll() {
      [DIF, OSM, CEL].forEach(function (R) { if (R) { scene.remove(R.g); disposeObject(R.g); } });
      DIF = buildDiff(); OSM = buildOsmo(); CEL = buildCell();
      scene.add(DIF.g); scene.add(OSM.g); scene.add(CEL.g);
      groundMat.opacity = isDark() ? 0.42 : 0.2;
      showMode();
    }
    function showMode() {
      DIF.g.visible = mode === 'diff'; OSM.g.visible = mode === 'osmo'; CEL.g.visible = mode === 'cell';
      ground.position.y = mode === 'diff' ? HIST_BASE - 0.15 : mode === 'osmo' ? -AR - RG - 0.02 : (narrow ? -4.1 : -2.4);
      Object.keys(hudLast).forEach(function (k) { delete hudLast[k]; });
      ['a', 'b', 'c', 'd', 'note'].forEach(function (k) { setHud(k, ''); });
    }
    function update() {
      if (mode === 'diff') updateDiff();
      else if (mode === 'osmo') updateOsmo();
      else updateCell();
    }

    // ---------- 相機 ----------
    function frameOf() {
      // 窄畫面：盒子往下放一點，「左半邊」標籤才不會被上方讀數蓋住
      if (mode === 'diff') return { c: new THREE.Vector3(0, narrow ? -1.4 : -2.3, 1.2), w: BX + 2.4, h: BY + (narrow ? 8.8 : 7.4), dir: new THREE.Vector3(0.3, 0.45, 1) };
      // 窄畫面上方有兩排讀數：U 形管往下放，管口的溶液標籤才不會被讀數蓋住
      if (mode === 'osmo') return narrow ? { c: new THREE.Vector3(0.05, TOPY / 2 + 0.7, 0), w: 5.2, h: TOPY + 4.6, dir: new THREE.Vector3(0.45, 0.28, 1) }
        : { c: new THREE.Vector3(0.05, TOPY / 2 - 0.3, 0), w: 5.2, h: TOPY + 2.6, dir: new THREE.Vector3(0.45, 0.28, 1) };
      return narrow ? { c: new THREE.Vector3(0, 0.6, 0), w: 5.8, h: 10.6, dir: new THREE.Vector3(0.18, 0.5, 1) }
        : { c: new THREE.Vector3(-0.2, 0, 0), w: 11.6, h: 5.4, dir: new THREE.Vector3(0.18, 0.5, 1) };
    }
    function resetCamera() {
      const f = frameOf();
      const t = Math.tan(camera.fov * Math.PI / 360);
      const dist = Math.max(f.h / (2 * t), f.w / (2 * t * camera.aspect)) * 1.12 + 1;
      controls.target.copy(f.c);
      camera.position.copy(f.c).add(f.dir.clone().normalize().multiplyScalar(dist));
      camera.lookAt(f.c);
      controls.update();
      requestRender();
    }

    // ---------- 繪製 ----------
    let raf = 0, lastAspect = 0;
    function renderNow() {
      if (!api.active || document.hidden) return;
      const want = Math.min(window.devicePixelRatio || 1, 2);
      if (renderer.getPixelRatio() !== want) { renderer.setPixelRatio(want); resize3(); return; }
      const moved = controls.update();
      layoutLabels();
      renderer.render(scene, camera);
      if (moved) requestRender();
    }
    function requestRender() {
      if (raf || !api.active) return;
      raf = requestAnimationFrame(function () { raf = 0; renderNow(); });
    }
    function sizeOf(w) {
      const nar = w < 560;
      if (mode === 'diff') return nar ? Math.round(Math.max(340, Math.min(480, w * 1.1))) : 460;
      if (mode === 'osmo') return nar ? Math.round(Math.max(400, Math.min(560, w * 1.35))) : 520;
      return nar ? Math.round(Math.max(420, Math.min(560, w * 1.35))) : 460;
    }
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
      if (nar !== narrow) {
        narrow = nar;
        Object.keys(hudLast).forEach(function (k) { delete hudLast[k]; });
        if (CEL) { scene.remove(CEL.g); disposeObject(CEL.g); CEL = buildCell(); scene.add(CEL.g); showMode(); }
        lastAspect = 0;
      }
      scene.traverse(function (o) { if (o.userData && o.userData.isLabel) fitLabel(o); });
      if (Math.abs(camera.aspect - lastAspect) > 1e-3) {
        const first = !lastAspect;
        lastAspect = camera.aspect;
        if (first) resetCamera();
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
      busy: function () { return mode === 'cell' && B.CS.rbc.lysed && performance.now() - B.CS.lysedAt < 3300; },
      onShow: function () { lastAspect = 0; resize3(); },
      onTheme: function () {
        C = B.colors();
        Object.keys(hudLast).forEach(function (k) { delete hudLast[k]; });
        buildAll();
        update();
        requestRender();
      },
      resetCamera: function () { resetCamera(); },
      setMode: function (m) {
        if (m === mode) return;
        mode = m;
        showMode();
        lastAspect = 0;
        resize3();
      },
      dispose: function () {
        api.active = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize3);
        document.removeEventListener('visibilitychange', onVisible);
        controls.dispose();
        disposeObject(scene);
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
    buildAll();
    update();
    resetCamera();
    return api;
  }

  window.DiffOsmo3D = { create: create };
})();
