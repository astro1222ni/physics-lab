/*
 * faraday-3d.js — 「法拉第定律與冷次定律」的 3D 立體檢視（three.js）
 *
 * 由 js/faraday.js 在使用者按「3D 立體」時才載入；three.js 也在那時才以 import() 從 vendor/three/ 載入，
 * 再呼叫 Faraday3D.create(lib, host, X)。這個檔只負責「畫」：磁鐵位置、每匝磁通量、感應電流、
 * 檢流計指針、導體棒的位置與受力，全部取自 faraday.js 目前的狀態（也就是 faraday-core.js 的計算），
 * 與 2D 畫面在同一個時間軸上更新。
 *
 * 場景單位：1 = 1 cm，z 軸朝上。
 *  模式 A（磁鐵與線圈）：線圈軸沿 x 軸、中心在原點；2D 的側視圖就是從 −y 方向看過去。
 *    磁力線＝核心 fieldLines()（子午面上相鄰兩條之間的磁通量相等，與 2D 同一組）繞 x 軸轉 8 個方位角；
 *    穿過線圈的磁力線用與 2D 相同的判斷（在 x = 0 的平面上 ρ < a）加亮，條數代表磁通量。
 *    線圈畫出全部 N 匝：N ≤ 40 用真正的螺旋銅線管；N > 40 時每匝太細，改用沿螺旋線排列的 N 條紋理。
 *    電流 I > 0 的環繞方向與 +x 成右手定則（與核心相同），從線圈右端流出、經檢流計「+」端回到左端。
 *  模式 B（導體棒在軌道上）：軌道平放在桌面 z = 0；2D 的俯視圖就是從 +z 往下看，B 出紙面 = +z。
 *    I > 0 為由上往下看逆時針（與核心相同）；速度與力的箭頭比例與 2D 相同（1 m/s → 25 cm、1 N → 40 cm）。
 */
(function () {
  'use strict';

  const CM = 100;          // 每公尺幾個場景單位
  const ZT = -11;          // 模式 A 的桌面高度（cm）
  const MAZ = 8;           // 磁力線的方位角數
  const XW = 30;           // 模式 A 磁力線在左右兩側裁切的位置（cm）
  const XL = 60, RL = 17;  // 磁力線在磁鐵座標中保留的範圍（cm）：|x| ≤ XL、ρ ≤ RL
  const HELIX_MAX = 40;    // N 不超過這個值時，線圈用真正的螺旋銅線管

  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function rgbOf(c) {
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(c).trim());
    if (m) return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
    const n = String(c).match(/[\d.]+/g);
    return n && n.length >= 3 ? [+n[0], +n[1], +n[2]] : [128, 128, 128];
  }
  function mixCss(a, b, t) {
    const p = rgbOf(a), q = rgbOf(b);
    return 'rgb(' + p.map(function (x, i) { return Math.round(x + (q[i] - x) * t); }).join(',') + ')';
  }
  function alphaCss(c, a) { const r = rgbOf(c); return 'rgba(' + r[0] + ',' + r[1] + ',' + r[2] + ',' + a + ')'; }

  function create(lib, host, X) {
    const THREE = lib.THREE, FC = X.FC, T = X.T, state = X.state;
    let C = X.colors();
    const col = function (n) { return new THREE.Color(C[n] || '#888888'); };
    const dark = function () { return !!C.dark; };
    const Y1 = new THREE.Vector3(0, 1, 0);
    const V = function (x, y, z) { return new THREE.Vector3(x, y, z); };

    // =====================================================================
    // 畫布、繪圖器、相機
    // =====================================================================
    const canvas = document.createElement('canvas');
    canvas.className = 'cv3';
    canvas.setAttribute('aria-label', T('法拉第定律的 3D 立體檢視（可拖曳旋轉、縮放；磁鐵可沿線圈軸拖曳）',
      '3D view of Faraday’s law (drag to rotate, pinch or scroll to zoom; the magnet can be dragged along the coil axis)'));
    host.appendChild(canvas);
    let renderer;
    try {
      // alpha：背景由 CSS 的徑向漸層提供（隨深淺色自動變化）
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    } catch (e) {
      canvas.remove();
      throw e;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.localClippingEnabled = true;
    const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1);

    // 讀數小標籤（HTML，疊在 3D 畫面上；文字自動套用簡體與字體大小）
    const ov = document.createElement('div');
    ov.className = 'ov3';
    ov.setAttribute('aria-hidden', 'true');
    ov.innerHTML = '<span class="p tl"></span><span class="p tr"></span><span class="p mid"></span>' +
      '<div class="bl"><span class="p f"></span><span class="p e"></span><span class="p i"></span></div>';
    host.appendChild(ov);
    const ovEl = {};
    ['tl', 'tr', 'mid', 'e', 'i', 'f'].forEach(function (k) { ovEl[k] = ov.querySelector('.' + k); ovEl[k].hidden = true; });
    const ovText = {}, ovCol = {};
    function setOv(k, text, color) {
      const el = ovEl[k];
      if (ovText[k] !== text) { ovText[k] = text; el.textContent = text; el.hidden = !text; }
      if (color && ovCol[k] !== color) { ovCol[k] = color; el.style.color = color; }
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1.2, 0.1, 5000);
    camera.up.set(0, 0, 1); // z 朝上；必須在建立 OrbitControls 之前設定
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.minDistance = 4;
    controls.maxDistance = 2500;

    // 半球光＋一盞會投影的方向光；另以一個柔和的漸層環境貼圖讓銅線、金屬有反光
    const hemi = new THREE.HemisphereLight(0xffffff, 0x777777, 0.75);
    hemi.position.set(0, 0, 1);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 2.1);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.radius = 5;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    scene.add(sun);
    scene.add(sun.target);
    let envTex = null;
    try { envTex = buildEnv(); scene.environment = envTex; } catch (e) { envTex = null; }

    function buildEnv() {
      const pm = new THREE.PMREMGenerator(renderer);
      const es = new THREE.Scene();
      const sg = new THREE.SphereGeometry(50, 32, 16);
      const pos = sg.attributes.position, cols = [];
      for (let i = 0; i < pos.count; i++) {
        const u = 0.5 + 0.5 * pos.getZ(i) / 50; // 上亮下暗（場景的 z 朝上）
        const v = 0.16 + 0.84 * u * u;
        cols.push(v, v, v);
      }
      sg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      const sm = new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true });
      es.add(new THREE.Mesh(sg, sm));
      const pg = new THREE.PlaneGeometry(34, 20);
      const p1m = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 4, 4), side: THREE.DoubleSide });
      const p2m = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 1.8, 1.8), side: THREE.DoubleSide });
      const p1 = new THREE.Mesh(pg, p1m); p1.position.set(-22, -30, 32); p1.lookAt(0, 0, 0); es.add(p1);
      const p2 = new THREE.Mesh(pg, p2m); p2.position.set(34, 18, 22); p2.lookAt(0, 0, 0); es.add(p2);
      const rt = pm.fromScene(es, 0.035);
      sg.dispose(); sm.dispose(); pg.dispose(); p1m.dispose(); p2m.dispose();
      pm.dispose();
      return rt.texture;
    }

    // =====================================================================
    // 共用的小工具
    // =====================================================================
    const sharedGeo = [];
    function shared(g) { g.userData.shared = true; sharedGeo.push(g); return g; }
    const gCyl = shared(new THREE.CylinderGeometry(1, 1, 1, 16, 1).translate(0, 0.5, 0)); // 底在 0、頂在 1（沿 +y）
    const gCone = shared(new THREE.ConeGeometry(1, 1, 22, 1).translate(0, 0.5, 0));
    const gChev = shared(new THREE.ConeGeometry(0.42, 1, 12, 1)); // 電流方向的小箭頭（中心在原點、尖端 +y）

    function disposeObject(obj) {
      obj.traverse(function (o) {
        if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
        if (o.material) {
          (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) {
            ['map', 'bumpMap', 'emissiveMap', 'alphaMap'].forEach(function (k) { if (m[k] && !m[k].userData.shared) m[k].dispose(); });
            m.dispose();
          });
        }
        if (o.customDepthMaterial) o.customDepthMaterial.dispose();
      });
    }
    function lineMat(color, opacity) {
      return new THREE.LineBasicMaterial({ color: color, transparent: opacity < 1, opacity: opacity, depthWrite: opacity >= 1 });
    }
    function segments(points, mat) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
      return new THREE.LineSegments(g, mat);
    }
    /** 文字標籤（Sprite；用 2D 畫布畫字，所以會經過 settings.js 的簡體轉換與字體大小） */
    function label(text, color, size, opts) {
      opts = opts || {};
      const c = document.createElement('canvas');
      const g = c.getContext('2d');
      const px = 64, font = (opts.weight || 700) + ' ' + px + 'px system-ui, -apple-system, "Segoe UI", sans-serif';
      g.font = font;
      const m = g.measureText(text);
      const asc = m.actualBoundingBoxAscent || px * 0.74, desc = m.actualBoundingBoxDescent || px * 0.2;
      const pad = 16;
      const w = Math.ceil(m.width) + 2 * pad, h = Math.ceil(Math.max(px * 1.3, asc + desc + 2 * pad));
      c.width = w; c.height = h;
      g.font = font;
      g.textAlign = 'center';
      g.textBaseline = 'alphabetic';
      const by = h / 2 + (asc - desc) / 2;
      g.lineJoin = 'round';
      g.lineWidth = 13;
      g.strokeStyle = alphaCss(C['canvas-bg'], 0.92);
      g.strokeText(text, w / 2, by);
      g.fillStyle = color;
      g.fillText(text, w / 2, by);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = aniso;
      // 標籤一律畫在最上層（有背景色描邊），不會被線或面遮住
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
      sp.scale.set(size * w / h, size, 1);
      sp.renderOrder = 20;
      return sp;
    }
    /** 立體箭頭：圓柱箭身＋圓錐箭頭（共用單位幾何，用縮放決定長度） */
    function makeArrow(color, opts) {
      opts = opts || {};
      const mat = new THREE.MeshStandardMaterial({
        color: color, roughness: 0.4, metalness: 0.05, emissive: color, emissiveIntensity: dark() ? 0.28 : 0.1,
        transparent: !!opts.transparent, opacity: 1, depthWrite: !opts.transparent
      });
      const g = new THREE.Group();
      const shaft = new THREE.Mesh(gCyl, mat), head = new THREE.Mesh(gCone, mat);
      shaft.castShadow = head.castShadow = !!opts.shadow;
      g.add(shaft, head);
      const q = new THREE.Vector3();
      return {
        group: g, mat: mat,
        set: function (o, dir, len, r, hl, hr) {
          if (!(len > 1e-3)) { g.visible = false; return; }
          g.visible = true;
          g.position.copy(o);
          g.quaternion.setFromUnitVectors(Y1, q.copy(dir).normalize());
          hl = Math.min(hl, len * 0.6);
          shaft.scale.set(r, Math.max(1e-3, len - hl * 0.85), r);
          head.position.y = len - hl;
          head.scale.set(hr, hl, hr);
        }
      };
    }
    function roundedRect(w, h, r) {
      const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
      s.moveTo(x + r, y);
      s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
      s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
      s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
      return s;
    }
    /** 沿導線移動的亮點（發光貼圖，沿 u 方向重複） */
    function dashTexture() {
      const W = 64, d = new Uint8Array(4 * W);
      for (let x = 0; x < W; x++) {
        const u = (x + 0.5) / W, v = Math.exp(-Math.pow((u - 0.5) / 0.17, 2));
        d[4 * x] = d[4 * x + 1] = d[4 * x + 2] = Math.round(255 * v);
        d[4 * x + 3] = 255;
      }
      const t = new THREE.DataTexture(d, W, 1, THREE.RGBAFormat);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.magFilter = THREE.LinearFilter;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.generateMipmaps = true;
      t.needsUpdate = true;
      return t;
    }
    /** 一匝導線的截面明暗（沿 v 方向一個週期），導線之間的間隙透明 */
    function stripeTexture(fill) {
      const H = 64, W = 4, d = new Uint8Array(4 * W * H);
      for (let y = 0; y < H; y++) {
        const s = (y + 0.5) / H, inside = s < fill;
        const q = inside ? (s - fill / 2) / (fill / 2) : 1;
        const prof = inside ? Math.sqrt(Math.max(0, 1 - q * q)) : 0;
        const v = inside ? Math.round(255 * (0.42 + 0.58 * prof)) : 200;
        const a = inside ? Math.round(255 * Math.min(1, prof * 2.6)) : 0;
        for (let x = 0; x < W; x++) {
          const i = 4 * (y * W + x);
          d[i] = d[i + 1] = d[i + 2] = v;
          d[i + 3] = a;
        }
      }
      const t = new THREE.DataTexture(d, W, H, THREE.RGBAFormat);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.magFilter = THREE.LinearFilter;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.generateMipmaps = true;
      t.anisotropy = aniso;
      t.needsUpdate = true;
      return t;
    }
    /** 由中心往外漸淡的圓形貼圖（桌面底色、電阻發光） */
    function radialTexture(stops) {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const g = c.getContext('2d');
      const rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      stops.forEach(function (s) { rg.addColorStop(s[0], s[1]); });
      g.fillStyle = rg;
      g.fillRect(0, 0, 128, 128);
      const t = new THREE.CanvasTexture(c);
      return t;
    }
    /** 桌面：接收影子的平面、淡淡的底色、主次格線 */
    function floor(g, x0, x1, y0, y1, z, minor, major) {
      const w = x1 - x0, h = y1 - y0, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      const fillTex = radialTexture([[0, 'rgba(255,255,255,1)'], [0.62, 'rgba(255,255,255,0.75)'], [1, 'rgba(255,255,255,0)']]);
      const fill = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.25, h * 1.25), new THREE.MeshBasicMaterial({
        color: new THREE.Color(mixCss(C['canvas-bg'], C.text, dark() ? 0.07 : 0.045)), alphaMap: fillTex, transparent: true, depthWrite: false
      }));
      fill.position.set(cx, cy, z - 0.04);
      fill.renderOrder = -2;
      g.add(fill);
      const sh = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.6, h * 1.6), new THREE.ShadowMaterial({ opacity: dark() ? 0.5 : 0.24, depthWrite: false }));
      sh.position.set(cx, cy, z - 0.02);
      sh.receiveShadow = true;
      sh.renderOrder = -1;
      g.add(sh);
      const pm = [], pM = [];
      const nx0 = Math.ceil(x0 / minor - 1e-9), nx1 = Math.floor(x1 / minor + 1e-9);
      for (let i = nx0; i <= nx1; i++) { const x = i * minor; ((i * minor) % major === 0 ? pM : pm).push(x, y0, z, x, y1, z); }
      const ny0 = Math.ceil(y0 / minor - 1e-9), ny1 = Math.floor(y1 / minor + 1e-9);
      for (let j = ny0; j <= ny1; j++) { const y = j * minor; ((j * minor) % major === 0 ? pM : pm).push(x0, y, z, x1, y, z); }
      const lm = segments(pm, lineMat(col('text'), dark() ? 0.05 : 0.055));
      const lM = segments(pM, lineMat(col('text'), dark() ? 0.12 : 0.13));
      lm.renderOrder = lM.renderOrder = -1;
      g.add(lm, lM);
    }

    // =====================================================================
    // 相機自動對焦（與帶電粒子模組相同的做法：八個角都要在視野內）
    // =====================================================================
    let box = { x0: -10, x1: 10, y0: -10, y1: 10, z0: -10, z1: 10, pad: 1 };
    const viewDir = new THREE.Vector3(0.36, -1, 0.42).normalize();
    let fitKey = '';
    function fit(force) {
      const b = box;
      const key = [b.x0, b.x1, b.y0, b.y1, b.z0, b.z1, camera.aspect].map(function (v) { return v.toFixed(2); }).join('|');
      if (!force && key === fitKey) return;
      fitKey = key;
      const center = V((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
      const dir = force ? viewDir.clone() : camera.position.clone().sub(controls.target).normalize();
      const fwd = dir.clone().negate();
      const right = new THREE.Vector3().crossVectors(fwd, camera.up).normalize();
      if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
      const upv = new THREE.Vector3().crossVectors(right, fwd).normalize();
      const tv = Math.tan(camera.fov * Math.PI / 360), th = tv * camera.aspect;
      const corners = [];
      [b.x0 - b.pad, b.x1 + b.pad].forEach(function (x) {
        [b.y0 - b.pad, b.y1 + b.pad].forEach(function (y) {
          [b.z0 - b.pad, b.z1 + b.pad].forEach(function (z) { corners.push(V(x, y, z).sub(center)); });
        });
      });
      // 盒子在畫面上的投影不一定對稱（例如由上往下斜看時，高處的箭頭只往上方延伸）：
      // 先把觀看中心移到投影範圍的中點，畫面上下左右才不會一邊空一大塊
      let r0 = Infinity, r1 = -Infinity, u0 = Infinity, u1 = -Infinity;
      corners.forEach(function (c) {
        const r = c.dot(right), u = c.dot(upv);
        r0 = Math.min(r0, r); r1 = Math.max(r1, r); u0 = Math.min(u0, u); u1 = Math.max(u1, u);
      });
      const shift = right.clone().multiplyScalar((r0 + r1) / 2).addScaledVector(upv, (u0 + u1) / 2);
      center.add(shift);
      let dist = 1;
      corners.forEach(function (c0) {
        const c = c0.clone().sub(shift);
        const depth = c.dot(dir);
        dist = Math.max(dist, depth + Math.abs(c.dot(right)) / th, depth + Math.abs(c.dot(upv)) / tv);
      });
      dist *= 1.02;
      controls.target.copy(center);
      camera.position.copy(center).addScaledVector(dir, dist);
      camera.near = Math.max(0.1, dist / 300);
      camera.far = dist * 30;
      camera.updateProjectionMatrix();
      controls.minDistance = dist * 0.08;
      controls.maxDistance = dist * 6;
      controls.update();
    }

    // =====================================================================
    // 場景的建立：模式改變或深淺色改變時整組重建；參數改變時只重建相關的部分
    // =====================================================================
    let modeGrp = null, cur = {}, groups = {};
    let modeKey = '';
    const subKey = {};
    function themeKey() {
      return [C['canvas-bg'], C.text, C.accent, C.pos, C.neg, C.equi, C.field, C.probe, C['b-em'],
        window.LabSettings && window.LabSettings.get ? window.LabSettings.get('fs') : 1].join('|');
    }
    function rebuildMode() {
      if (modeGrp) { scene.remove(modeGrp); disposeObject(modeGrp); }
      modeGrp = new THREE.Group();
      scene.add(modeGrp);
      cur = { mode: state.mode };
      groups = {};
      Object.keys(subKey).forEach(function (k) { delete subKey[k]; });
      if (state.mode === 'A') buildA(); else buildB();
    }
    function subGroup(name) {
      if (groups[name]) { modeGrp.remove(groups[name]); disposeObject(groups[name]); }
      const g = new THREE.Group();
      groups[name] = g;
      modeGrp.add(g);
      return g;
    }
    function ensureBuilt() {
      const mk = state.mode + '|' + themeKey();
      let refit = 0; // 1：保持目前的視角方向重新對焦；2：回到預設視角
      if (mk !== modeKey) {
        refit = cur.mode !== state.mode || !fitKey ? 2 : 1;
        modeKey = mk;
        rebuildMode();
      }
      if (state.mode === 'A') {
        const A = state.A;
        const ck = A.N + '|' + A.a.toFixed(5);
        if (subKey.coil !== ck) { subKey.coil = ck; buildCoil(); }
        const sc = X.scale(), dk = sc ? X.rangeText(sc.range) : '';
        if (subKey.dial !== dk) { subKey.dial = dk; buildDial(sc ? sc.range : 1); }
      } else {
        const B = state.B;
        const rk = [B.L.toFixed(4), B.Bsign, B.B.toFixed(4)].join('|');
        if (subKey.rig !== rk) { subKey.rig = rk; buildRig(); refit = Math.max(refit, 1); }
        const tau = FC.rodDerived(X.pB()).tau;
        const sk = [B.sub, B.v0.toFixed(4), tau.toFixed(6), B.L.toFixed(4)].join('|');
        if (subKey.stop !== sk) { subKey.stop = sk; buildStop(tau); }
      }
      if (refit) fit(refit === 2);
    }

    // =====================================================================
    // 模式 A：磁鐵與線圈
    // =====================================================================
    const HC = FC.COIL.len / 2 * CM;            // 線圈半長（cm）
    const MHL = FC.MAG.len / 2 * CM, MHW = FC.MAG.halfW * CM;
    const METER = { x: 0, y: -13, w: 8.4, h: 6.4, d: 3.8 };
    const FACE_W = METER.w - 1.3, FACE_H = FACE_W / 1.48;
    const clipPlanes = [new THREE.Plane(V(1, 0, 0), XW), new THREE.Plane(V(-1, 0, 0), XW)];

    function buildA() {
      const g = modeGrp;
      box = { x0: -16, x1: 16, y0: -15.5, y1: 4, z0: ZT, z1: 6.5, pad: 0.5 };
      viewDir.set(0.2, -1, 0.36).normalize();
      sun.target.position.set(0, -4, ZT);
      sun.position.set(-26, -40, 72).add(sun.target.position);
      const sc = sun.shadow.camera;
      sc.left = -42; sc.right = 42; sc.top = 42; sc.bottom = -42; sc.near = 1; sc.far = 260;
      sc.updateProjectionMatrix();

      floor(g, -30, 30, -26, 14, ZT, 1, 5);
      // 線圈軸（虛線）
      const ag = new THREE.BufferGeometry();
      ag.setAttribute('position', new THREE.Float32BufferAttribute([-XW, 0, 0, XW, 0, 0], 3));
      const axis = new THREE.Line(ag, new THREE.LineDashedMaterial({ color: col('muted'), dashSize: 0.5, gapSize: 0.6, transparent: true, opacity: 0.55 }));
      axis.computeLineDistances();
      g.add(axis);
      // 比例尺：5 cm（桌面上、檢流計右邊）
      const sx0 = 7, sy0 = -14;
      g.add(segments([sx0, sy0, ZT + 0.02, sx0 + 5, sy0, ZT + 0.02, sx0, sy0 - 0.5, ZT + 0.02, sx0, sy0 + 0.5, ZT + 0.02,
        sx0 + 5, sy0 - 0.5, ZT + 0.02, sx0 + 5, sy0 + 0.5, ZT + 0.02], lineMat(col('muted'), 0.95)));
      const sl = label('5 cm', C.muted, 1.15, { weight: 600 });
      sl.position.set(sx0 + 2.5, sy0 - 1.4, ZT + 0.3);
      g.add(sl);

      buildFieldLines(g);
      buildMagnet(g);
      buildMeter(g);

      // 線圈內的磁通量圓盤（半徑隨 a 縮放，顏色深淺依 |Φ|）
      const disk = new THREE.Mesh(new THREE.CircleGeometry(1, 72).rotateY(Math.PI / 2), new THREE.MeshBasicMaterial({
        color: col('b-em'), transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false
      }));
      disk.renderOrder = 4;
      g.add(disk);
      const rim = new THREE.Mesh(new THREE.RingGeometry(0.965, 1, 72).rotateY(Math.PI / 2), new THREE.MeshBasicMaterial({
        color: col('b-em'), transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false
      }));
      rim.renderOrder = 4;
      g.add(rim);
      cur.disk = disk; cur.rim = rim;
      cur.phiLabel = label('Φ', C['b-em'], 1.5);
      g.add(cur.phiLabel);

      // 電流方向的小箭頭：線圈三圈 × 8 個＋兩條導線各 4 個
      const chevMat = new THREE.MeshStandardMaterial({ color: col('probe'), emissive: col('probe'), emissiveIntensity: dark() ? 0.7 : 0.35, roughness: 0.35, metalness: 0.05 });
      const chev = new THREE.InstancedMesh(gChev, chevMat, 3 * 8 + 2 * 4);
      chev.frustumCulled = false;
      chev.count = 0;
      g.add(chev);
      cur.chev = chev;

      // 感應磁極（冷次定律）與線圈自己的磁場方向
      const pl = {};
      ['N', 'S'].forEach(function (p) {
        ['L', 'R'].forEach(function (s) {
          const sp = label(p, p === 'N' ? C.pos : C.neg, 1.75, { weight: 800 });
          sp.visible = false;
          g.add(sp);
          pl[p + s] = sp;
        });
      });
      cur.poleLabels = pl;
      const ind = makeArrow(col('b-em'), { transparent: true });
      ind.group.visible = false;
      g.add(ind.group);
      cur.indArrow = ind;

      // 磁鐵的速度箭頭（每 1 m/s 畫 10 cm，與 2D 相同；太長截短並標 ≈）
      const va = makeArrow(col('accent'), {});
      va.group.visible = false;
      g.add(va.group);
      cur.vArrow = va;
      cur.vLabel = label('v', C.accent, 1.25);
      cur.vLabelX = label('v ≈', C.accent, 1.25);
      g.add(cur.vLabel, cur.vLabelX);
    }

    /** 磁力線：與 2D 同一組（相鄰兩條之間磁通量相等），繞線圈軸轉 MAZ 個方位角 */
    function buildFieldLines(g) {
      const grp = new THREE.Group();
      const fieldMat = new THREE.MeshStandardMaterial({
        color: col('field'), roughness: 0.6, metalness: 0, vertexColors: true, transparent: true,
        opacity: dark() ? 0.5 : 0.42, clippingPlanes: clipPlanes
      });
      const thruMat = new THREE.MeshStandardMaterial({
        color: col('b-em'), emissive: col('b-em'), emissiveIntensity: dark() ? 0.55 : 0.22, roughness: 0.4, metalness: 0,
        vertexColors: true, transparent: true, opacity: 0.95, clippingPlanes: clipPlanes
      });
      const coneMat = new THREE.MeshStandardMaterial({ color: col('field'), roughness: 0.6, transparent: true, opacity: dark() ? 0.7 : 0.6, clippingPlanes: clipPlanes });
      const coneThru = new THREE.MeshStandardMaterial({ color: col('b-em'), emissive: col('b-em'), emissiveIntensity: dark() ? 0.55 : 0.22, roughness: 0.4, clippingPlanes: clipPlanes });
      const rots = [];
      for (let j = 0; j < MAZ; j++) rots.push(new THREE.Matrix4().makeRotationX((j + 0.5) * 2 * Math.PI / MAZ));
      const coneGeo = new THREE.ConeGeometry(0.36, 1.0, 12);
      const tubesByK = [], conesByK = [];
      const R_TUBE = 0.085, RADIAL = 6;
      X.LINES.forEach(function (ln, k) {
        const pts = ln.pts;
        tubesByK[k] = [];
        // 1. 保留在範圍內的部分（可能分成幾段）；被裁切的一端漸淡
        const runs = [];
        let run = null;
        for (let i = 0; i < pts.length; i += 2) {
          const x = pts[i][0] * CM, r = pts[i][1] * CM;
          const inside = Math.abs(x) <= XL && r <= RL;
          if (inside) {
            if (!run) { run = { p: [], startCut: i > 0, endCut: false }; runs.push(run); }
            run.p.push(V(x, r, 0));
          } else if (run) { run.endCut = true; run = null; }
        }
        runs.forEach(function (rn) {
          if (rn.p.length < 4) return;
          const curve = new THREE.CatmullRomCurve3(rn.p, false, 'centripetal');
          const segs = Math.min(600, rn.p.length * 2);
          const geo = new THREE.TubeGeometry(curve, segs, R_TUBE, RADIAL, false);
          const len = curve.getLength(), fadeL = Math.min(5, len / 3);
          const cols = new Float32Array(geo.attributes.position.count * 4);
          for (let i = 0; i <= segs; i++) {
            const sArc = i / segs * len;
            let a = 1;
            if (rn.startCut) a = Math.min(a, sArc / fadeL);
            if (rn.endCut) a = Math.min(a, (len - sArc) / fadeL);
            a = a * a * (3 - 2 * a);
            for (let j = 0; j <= RADIAL; j++) {
              const idx = 4 * (i * (RADIAL + 1) + j);
              cols[idx] = cols[idx + 1] = cols[idx + 2] = 1;
              cols[idx + 3] = a;
            }
          }
          geo.setAttribute('color', new THREE.BufferAttribute(cols, 4));
          const inst = new THREE.InstancedMesh(geo, fieldMat, MAZ);
          rots.forEach(function (m, j) { inst.setMatrixAt(j, m); });
          inst.instanceMatrix.needsUpdate = true;
          inst.frustumCulled = false;
          inst.renderOrder = 1;
          grp.add(inst);
          tubesByK[k].push(inst);
        });
        // 2. 方向箭頭：與 2D 相同，放在整條線 30%、70% 的位置（由 N 極出發往 S 極）
        const mats = [];
        const n = pts.length;
        [0.3, 0.7].forEach(function (fr) {
          const i = Math.max(1, Math.min(n - 2, Math.round(n * fr)));
          const x = pts[i][0] * CM, r = pts[i][1] * CM;
          if (Math.abs(x) > XL - 2 || r > RL - 2) return;
          const tdir = V(pts[i + 1][0] - pts[i - 1][0], pts[i + 1][1] - pts[i - 1][1], 0).normalize();
          const local = new THREE.Matrix4().compose(V(x, r, 0), new THREE.Quaternion().setFromUnitVectors(Y1, tdir), V(1, 1, 1));
          rots.forEach(function (m) { mats.push(new THREE.Matrix4().multiplyMatrices(m, local)); });
        });
        if (mats.length) {
          const ci = new THREE.InstancedMesh(coneGeo, coneMat, mats.length);
          mats.forEach(function (m, j) { ci.setMatrixAt(j, m); });
          ci.instanceMatrix.needsUpdate = true;
          ci.frustumCulled = false;
          ci.renderOrder = 1;
          grp.add(ci);
          conesByK[k] = ci;
        }
      });
      g.add(grp);
      cur.field = { grp: grp, tubes: tubesByK, cones: conesByK, fieldMat: fieldMat, thruMat: thruMat, coneMat: coneMat, coneThru: coneThru, through: [] };
    }

    /** 條形磁鐵：兩半（N 紅、S 藍），圓角方柱，表面印 N、S */
    function letterTexture(ch) {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const g = c.getContext('2d');
      g.font = '800 104px system-ui, -apple-system, "Segoe UI", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = 'rgba(0,0,0,0.22)';
      g.fillText(ch, 66, 70);
      g.fillStyle = 'rgba(255,255,255,0.96)';
      g.fillText(ch, 64, 66);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = aniso;
      return t;
    }
    function buildMagnet(g) {
      const grp = new THREE.Group();
      const bt = 0.16, bs = 0.14;
      const geo = new THREE.ExtrudeGeometry(roundedRect(2 * MHW - 2 * bs, 2 * MHW - 2 * bs, 0.34), {
        depth: MHL - 2 * bt, bevelEnabled: true, bevelThickness: bt, bevelSize: bs, bevelSegments: 3, curveSegments: 6
      });
      geo.rotateY(Math.PI / 2); // 擠出方向 z → +x
      geo.translate(bt, 0, 0);  // 這一半佔 x ∈ [0, MHL]
      const mk = function (c) {
        return new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.36, metalness: 0.06, clearcoat: 0.55, clearcoatRoughness: 0.25 });
      };
      const nHalf = new THREE.Mesh(geo, mk(col('pos')));   // 未翻轉時 N 極在 +x 端
      const sHalf = new THREE.Mesh(geo, mk(col('neg')));
      sHalf.rotation.z = Math.PI;                            // 佔 x ∈ [−MHL, 0]
      nHalf.castShadow = sHalf.castShadow = true;
      grp.add(nHalf, sHalf);
      // 字：上面、前面、後面各一個（N、S 轉 180° 仍是 N、S，翻轉時一樣好讀）
      const pg = new THREE.PlaneGeometry(1.7, 1.7);
      [['N', 1], ['S', -1]].forEach(function (d) {
        const tex = letterTexture(d[0]);
        const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
        const x = d[1] * MHL * 0.68;
        const top = new THREE.Mesh(pg, m); top.position.set(x, 0, MHW + 0.01); grp.add(top);
        const front = new THREE.Mesh(pg, m); front.rotation.x = Math.PI / 2; front.position.set(x, -MHW - 0.01, 0); grp.add(front);
        const back = new THREE.Mesh(pg, m); back.rotation.set(-Math.PI / 2, 0, Math.PI); back.position.set(x, MHW + 0.01, 0); grp.add(back);
        [top, front, back].forEach(function (o) { o.renderOrder = 2; });
      });
      // 滑過或拖曳時的外框光暈
      const hl = new THREE.Mesh(new THREE.BoxGeometry(2 * MHL + 0.36, 2 * MHW + 0.36, 2 * MHW + 0.36), new THREE.MeshBasicMaterial({
        color: col('accent'), side: THREE.BackSide, transparent: true, opacity: 0.6, depthWrite: false
      }));
      hl.visible = false;
      grp.add(hl);
      g.add(grp);
      cur.magnet = { grp: grp, halves: [nHalf, sHalf], halo: hl };
    }

    /** 檢流計：外殼、錶面（貼圖）、指針、接線柱 */
    function buildMeter(g) {
      const grp = new THREE.Group();
      grp.position.set(METER.x, METER.y, ZT);
      const bodyCol = col('field');
      if (dark()) bodyCol.multiplyScalar(0.5);
      const bodyGeo = new THREE.ExtrudeGeometry(roundedRect(METER.w - 0.4, METER.h - 0.4, 1.0), {
        depth: METER.d - 0.4, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.2, bevelSegments: 3, curveSegments: 8
      });
      bodyGeo.rotateX(Math.PI / 2); // 外形的 y → z（高）、擠出方向 z → −y（深）
      bodyGeo.computeBoundingBox();
      const bb = bodyGeo.boundingBox;
      bodyGeo.translate(-(bb.min.x + bb.max.x) / 2, -(bb.min.y + bb.max.y) / 2, -bb.min.z);
      const body = new THREE.Mesh(bodyGeo, new THREE.MeshStandardMaterial({ color: bodyCol, roughness: 0.42, metalness: 0.25 }));
      body.castShadow = true;
      body.receiveShadow = true;
      grp.add(body);
      const faceY = -METER.d / 2 - 0.02;
      // 錶面（貼圖在 buildDial 建立）
      const face = new THREE.Mesh(new THREE.PlaneGeometry(FACE_W, FACE_H), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0 }));
      face.rotation.x = Math.PI / 2;
      face.position.set(0, faceY, METER.h * 0.54);
      face.renderOrder = 1;
      grp.add(face);
      // 玻璃
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(FACE_W, FACE_H), new THREE.MeshStandardMaterial({
        color: 0xffffff, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.07, depthWrite: false
      }));
      glass.rotation.x = Math.PI / 2;
      glass.position.set(0, faceY - 0.28, METER.h * 0.54);
      glass.renderOrder = 6;
      grp.add(glass);
      // 指針（繞錶面法線轉動）與軸心
      const pivot = new THREE.Group();
      grp.add(pivot);
      const needleMat = new THREE.MeshStandardMaterial({ color: col('text'), roughness: 0.4, metalness: 0.2 });
      const needle = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.05, 1), needleMat);
      pivot.add(needle);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.22, 20), new THREE.MeshStandardMaterial({ color: bodyCol, roughness: 0.3, metalness: 0.5 }));
      pivot.add(hub);
      // 接線柱（銅色）：左「−」、右「+」
      const brass = new THREE.MeshStandardMaterial({ color: col('equi'), roughness: 0.28, metalness: 0.9 });
      const postGeo = new THREE.CylinderGeometry(0.42, 0.5, 1.0, 18).rotateX(Math.PI / 2);
      const nutGeo = new THREE.CylinderGeometry(0.66, 0.66, 0.34, 6).rotateX(Math.PI / 2);
      const terms = [];
      [-1, 1].forEach(function (sx) {
        const post = new THREE.Mesh(postGeo, brass); post.position.set(sx * 2.2, 0, METER.h + 0.5); post.castShadow = true; grp.add(post);
        const nut = new THREE.Mesh(nutGeo, brass); nut.position.set(sx * 2.2, 0, METER.h + 0.42); grp.add(nut);
        const lb = label(sx > 0 ? '+' : '−', C.text, 1.2, { weight: 800 });
        lb.position.set(sx * 2.2 + sx * 1.2, -0.8, METER.h + 0.9);
        grp.add(lb);
        terms.push(V(METER.x + sx * 2.2, METER.y, ZT + METER.h + 1.0));
      });
      const off = label(T('超過量程', 'Off scale'), C.pos, 1.3);
      off.position.set(0, faceY, METER.h + 2.6);
      off.visible = false;
      grp.add(off);
      g.add(grp);
      cur.meter = { grp: grp, face: face, faceY: faceY, pivot: pivot, needle: needle, needleMat: needleMat, terms: terms, off: off, cN: col('text'), cP: col('pos') };
    }
    /** 錶面貼圖：中央為零、±60° 的刻度，依目前的量程標示 */
    function buildDial(range) {
      const mt = cur.meter;
      if (!mt) return;
      const W = 512, H = 346;
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const g = c.getContext('2d');
      const bg0 = dark() ? mixCss(C.surface, '#ffffff', 0.1) : '#ffffff';
      const bg1 = dark() ? mixCss(C.surface, '#000000', 0.1) : mixCss(C['canvas-bg'], '#000000', 0.06);
      const gr = g.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, bg0); gr.addColorStop(1, bg1);
      g.fillStyle = gr;
      g.fillRect(0, 0, W, H);
      g.strokeStyle = alphaCss(C.text, 0.3);
      g.lineWidth = 6;
      g.strokeRect(3, 3, W - 6, H - 6);
      const px = W / 2, py = H * 0.84, nl = H * 0.66, span = Math.PI / 3;
      g.strokeStyle = alphaCss(C.text, 0.75);
      g.lineCap = 'round';
      g.lineWidth = 4;
      g.beginPath(); g.arc(px, py, nl * 0.95, -Math.PI / 2 - span, -Math.PI / 2 + span); g.stroke();
      for (let i = -8; i <= 8; i++) {
        const th = -Math.PI / 2 + i / 8 * span, major = i % 4 === 0;
        const r1 = nl * (major ? 0.8 : i % 2 === 0 ? 0.86 : 0.9), r2 = nl * 0.95;
        g.lineWidth = major ? 4 : 2.5;
        g.beginPath(); g.moveTo(px + r1 * Math.cos(th), py + r1 * Math.sin(th)); g.lineTo(px + r2 * Math.cos(th), py + r2 * Math.sin(th)); g.stroke();
      }
      g.fillStyle = C.muted;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = '600 38px system-ui, sans-serif';
      const lr = nl * 1.08;
      g.fillText('0', px, py - lr);
      g.fillText('−', px + lr * Math.cos(-Math.PI / 2 - span), py + lr * Math.sin(-Math.PI / 2 - span));
      g.fillText('+', px + lr * Math.cos(-Math.PI / 2 + span), py + lr * Math.sin(-Math.PI / 2 + span));
      g.fillStyle = C.text;
      g.font = '800 46px system-ui, sans-serif';
      g.fillText('G', W * 0.13, H * 0.84);
      g.fillStyle = C.muted;
      g.font = '600 30px system-ui, sans-serif';
      g.fillText('±' + X.rangeText(range) + ' mA', W * 0.83, H * 0.84);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = aniso;
      const old = mt.face.material.map;
      mt.face.material.map = tex;
      mt.face.material.emissiveMap = tex;
      mt.face.material.emissive = new THREE.Color(0xffffff);
      mt.face.material.emissiveIntensity = dark() ? 0.35 : 0.22;
      mt.face.material.needsUpdate = true;
      if (old) old.dispose();
      // 指針的位置與長度（與貼圖的刻度一致）
      const fw = FACE_W, fh = FACE_H;
      const zc = METER.h * 0.54;
      mt.pivot.position.set((px / W - 0.5) * fw, mt.faceY - 0.12, zc + (0.5 - py / H) * fh);
      const nlen = nl * 0.92 / W * fw;
      mt.needle.scale.set(1, 1, nlen + 0.35);
      mt.needle.position.set(0, 0, (nlen - 0.35) / 2);
    }

    /** 線圈（全部 N 匝）與接到檢流計的導線 */
    function buildCoil() {
      const g = subGroup('coil');
      const A = state.A, N = A.N, aC = A.a * CM;
      const pitch = 2 * HC / N;
      const copper = col('equi');
      const dash = dashTexture();
      const base = { color: copper, metalness: 0.82, roughness: 0.3, emissive: col('probe'), emissiveMap: dash, emissiveIntensity: 0, envMapIntensity: 1.1 };
      const mats = [];
      let rOut;
      if (N <= HELIX_MAX) {
        // 真正的螺旋銅線：θ 由 +y 往 +z 增加時 x 也增加（右手螺旋），兩端都從線圈底部（θ = −90°）引出
        const rw = Math.min(0.3 * pitch, 0.14);
        const curve = new THREE.Curve();
        curve.getPoint = function (t, target) {
          const th = -Math.PI / 2 + 2 * Math.PI * N * t;
          return (target || new THREE.Vector3()).set(-HC + 2 * HC * t, aC * Math.cos(th), aC * Math.sin(th));
        };
        curve.arcLengthDivisions = N * 24;
        const geo = new THREE.TubeGeometry(curve, N * 56, rw, 8, false);
        dash.repeat.set(N * 2, 1);
        const mat = new THREE.MeshStandardMaterial(base);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true;
        mesh.renderOrder = 3;
        g.add(mesh);
        mats.push(mat);
        rOut = aC + rw;
      } else {
        // 匝數多：每匝太細，用沿螺旋線排列的 N 條紋理（間隙透明，看得到線圈裡面）
        const stripe = stripeTexture(0.62);
        const geo = new THREE.CylinderGeometry(aC, aC, 2 * HC, 144, 1, true);
        geo.rotateZ(-Math.PI / 2); // 圓柱軸 y → x；圓周角 θ = θc + 90°
        const uv = geo.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setY(i, N * uv.getY(i) - uv.getX(i)); // 螺旋：沿軸 N 圈、繞一圈前進一匝
        uv.needsUpdate = true;
        dash.repeat.set(2, 1);
        const opts = Object.assign({}, base, { map: stripe, bumpMap: stripe, bumpScale: 1.5, transparent: true, depthWrite: false });
        const back = new THREE.Mesh(geo, new THREE.MeshStandardMaterial(Object.assign({}, opts, { side: THREE.BackSide })));
        back.renderOrder = 3;
        const front = new THREE.Mesh(geo, new THREE.MeshStandardMaterial(Object.assign({}, opts, { side: THREE.FrontSide })));
        front.renderOrder = 5;
        front.castShadow = true;
        front.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: stripe, alphaTest: 0.5, side: THREE.DoubleSide });
        g.add(back, front);
        mats.push(back.material, front.material);
        rOut = aC + 0.06;
      }
      // 導線：右端 → 檢流計「+」、左端 ← 「−」（I > 0 時）
      const wireMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(mixCss(C.muted, C.text, 0.35)), roughness: 0.5, metalness: 0.1 });
      const leads = [];
      [-1, 1].forEach(function (sx) {
        const tp = cur.meter.terms[sx > 0 ? 1 : 0];
        const p0 = V(sx * HC, 0, -aC), p1 = V(sx * HC, -0.5, -aC - 1.5);
        const zs = Math.min(p1.z, tp.z) - 1.4;
        const p2 = V(sx * (HC + 0.6), (p1.y + tp.y) / 2, zs);
        const p3 = tp.clone().add(V(0, 0.4, 2.2));
        const curve = new THREE.CatmullRomCurve3([p0, p1, p2, p3, tp], false, 'centripetal');
        const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 90, 0.13, 8, false), wireMat);
        m.castShadow = true;
        g.add(m);
        leads.push(curve);
      });
      cur.coil = { mats: mats, dash: dash, rOut: rOut, aC: aC, leads: leads };
    }

    // ---------- 模式 A：每一幀 ----------
    const mtx = new THREE.Matrix4(), qtn = new THREE.Quaternion(), tv3 = new THREE.Vector3(), sv3 = new THREE.Vector3(), pv3 = new THREE.Vector3();
    function updateA(s) {
      const A = state.A, sc = X.scale(), show = state.show;
      const xm = s.x * CM, flipped = A.flipped, sg = flipped ? -1 : 1;
      const level = sc ? clamp(Math.abs(s.I * 1e3) / sc.range, 0, 1) : 0;
      const co = cur.coil, aC = co.aC;

      // 磁鐵
      const mg = cur.magnet;
      mg.grp.position.set(xm, 0, 0);
      mg.grp.rotation.z = flipped ? Math.PI : 0;
      const hot = A.hover || A.dragging;
      mg.halo.visible = hot;

      // 磁力線：隨磁鐵平移；翻轉時左右鏡射。穿過線圈的加亮（判斷方式與 2D 相同）
      const fl = cur.field;
      fl.grp.visible = show.lines;
      fl.grp.position.x = xm;
      fl.grp.scale.x = sg;
      if (show.lines) {
        X.LINES.forEach(function (ln, k) {
          const pts = ln.pts;
          let through = false;
          for (let i = 1; i < pts.length; i++) {
            const x0 = s.x + sg * pts[i - 1][0], x1 = s.x + sg * pts[i][0];
            if ((x0 <= 0 && x1 > 0) || (x0 >= 0 && x1 < 0)) {
              const f = x0 / (x0 - x1), y = pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f;
              if (Math.abs(y) < A.a) { through = true; break; }
            }
          }
          if (fl.through[k] === through) return;
          fl.through[k] = through;
          fl.tubes[k].forEach(function (m) { m.material = through ? fl.thruMat : fl.fieldMat; });
          if (fl.cones[k]) fl.cones[k].material = through ? fl.coneThru : fl.coneMat;
        });
      }

      // 磁通量圓盤：顏色深淺 ∝ |Φ|（相對於本次實驗的最大值）
      const phiMax = sc ? Math.max(Math.abs(sc.phi[0]), Math.abs(sc.phi[1])) : 1;
      const fr = clamp(Math.abs(s.phi * 1e3) / (phiMax || 1), 0, 1);
      cur.disk.scale.set(1, aC, aC);
      cur.rim.scale.set(1, aC, aC);
      cur.disk.material.opacity = 0.04 + (dark() ? 0.42 : 0.34) * fr;
      cur.rim.material.opacity = 0.3 + 0.5 * fr;
      cur.phiLabel.position.set(0, aC * 0.55, aC * 0.95 + 1.2);
      cur.phiLabel.material.opacity = 0.55 + 0.45 * fr;

      // 線圈的電流：沿導線移動的亮點（亮度 ∝ |I|）
      const on = show.current && level > 0.01;
      co.mats.forEach(function (m) { m.emissiveIntensity = on ? (dark() ? 1.5 : 1.15) * Math.min(1, 0.25 + level) : 0; });
      co.dash.offset.x = -state.flow / 4;

      // 電流方向的小箭頭
      const ch = cur.chev;
      let n = 0;
      if (on) {
        const sI = s.I > 0 ? 1 : -1, R = co.rOut + 0.42, sz = 0.85;
        sv3.set(sz, sz, sz);
        [-HC * 0.7, 0, HC * 0.7].forEach(function (x, r) {
          for (let j = 0; j < 8; j++) {
            const th = 2 * Math.PI * j / 8 + state.flow * Math.PI / 4 + r * 0.4;
            pv3.set(x, R * Math.cos(th), R * Math.sin(th));
            tv3.set(0, -Math.sin(th) * sI, Math.cos(th) * sI);
            qtn.setFromUnitVectors(Y1, tv3);
            ch.setMatrixAt(n++, mtx.compose(pv3, qtn, sv3));
          }
        });
        // 導線：I > 0 時右邊導線由線圈流向檢流計，左邊導線流回線圈
        co.leads.forEach(function (curve, li) {
          const d = (li === 1 ? 1 : -1) * sI;
          for (let j = 0; j < 4; j++) {
            let u = ((j / 4 + (li === 1 ? 1 : -1) * state.flow * 0.11) % 1 + 1) % 1;
            u = 0.06 + 0.86 * u;
            curve.getPointAt(u, pv3);
            curve.getTangentAt(u, tv3).multiplyScalar(d);
            qtn.setFromUnitVectors(Y1, tv3.normalize());
            ch.setMatrixAt(n++, mtx.compose(pv3, qtn, sv3));
          }
        });
      }
      ch.count = n;
      ch.instanceMatrix.needsUpdate = true;

      // 感應磁極與線圈自己的磁場（由 S 端指向 N 端）
      const pl = cur.poleLabels;
      const showP = show.poles && level > 0.02;
      const cp = FC.coilPoles(s.I);
      const zl = co.rOut + 2.3;
      ['NL', 'SL', 'NR', 'SR'].forEach(function (k) { pl[k].visible = false; });
      cur.indArrow.group.visible = false;
      if (showP && cp.left) {
        const op = 0.35 + 0.65 * Math.min(1, level * 2.5);
        const l = pl[cp.left + 'L'], r = pl[cp.right + 'R'];
        l.visible = r.visible = true;
        l.position.set(-HC - 2.3, 0, zl);
        r.position.set(HC + 2.3, 0, zl);
        l.material.opacity = r.material.opacity = op;
        const dir = s.I > 0 ? 1 : -1, len = 2 * HC + 1.6;
        cur.indArrow.mat.opacity = op;
        cur.indArrow.set(V(-dir * len / 2, 0, zl), V(dir, 0, 0), len, 0.13, 0.9, 0.36);
      }

      // 磁鐵的速度箭頭：從磁鐵後端出發，畫在磁鐵與線圈內壁之間的高度
      const va = cur.vArrow;
      cur.vLabel.visible = cur.vLabelX.visible = false;
      if (Math.abs(s.v) > 1e-3) {
        const lenFull = Math.abs(s.v) * X.SCALE_VA * CM, cap = 0.2 * CM, over = lenFull > cap, len = Math.min(lenFull, cap);
        const ux = s.v > 0 ? 1 : -1;
        const z = (MHW + Math.max(MHW + 0.6, aC - 0.2)) / 2;
        const x0 = xm - ux * (MHL - 0.6);
        va.set(V(x0, 0, z), V(ux, 0, 0), len, 0.1, 0.75, 0.26);
        const lb = over ? cur.vLabelX : cur.vLabel;
        lb.visible = true;
        lb.position.set(x0 + ux * (len + 0.9), 0, z + 0.9);
      } else va.group.visible = false;

      // 檢流計：指針（與 2D 相同的慣性與量程），超過量程時變紅
      const mt = cur.meter;
      if (sc) {
        const frac = clamp(state.needle / sc.range, -1.08, 1.08);
        mt.pivot.rotation.y = frac * Math.PI / 3;
        const peg = Math.abs(s.I * 1e3) > sc.range * 1.0001;
        mt.needleMat.color.copy(peg ? mt.cP : mt.cN);
        mt.off.visible = peg;
      }

      // 疊在畫面上的讀數
      setOv('tl', 't = ' + X.num(state.t, 2) + ' s' + (state.slow && A.motion !== 'drag' ? '  (' + X.SLOW + '×)' : ''), C.text);
      setOv('tr', X.circText(FC.circulation(s.I, s.x)), C.muted);
      setOv('f', 'Φ = ' + X.num(s.phi * 1e3, 4) + ' mWb', C['b-em']);
      setOv('e', 'ε = ' + X.num(s.eps, 3) + ' V', C['b-mech']);
      setOv('i', 'I = ' + X.num(s.I * 1e3, 2) + ' mA', C.probe);
      setOv('mid', A.motion === 'drag' && !A.everDragged ? T('↔ 沿線圈軸拖曳磁鐵', '↔ Drag the magnet along the axis') : '', C.accent);
    }

    // =====================================================================
    // 模式 B：導體棒在軌道上（軌道平放在桌面 z = 0）
    // =====================================================================
    const RAIL_R = 0.9, ROD_R = 1.3, WIRE_Z = 1.5;
    const ROD_Z = 2 * RAIL_R + ROD_R;
    function buildB() {
      const g = modeGrp;
      viewDir.set(-0.05, -0.85, 1.1).normalize();
      sun.target.position.set(100, 0, 0);
      sun.position.set(-90, -150, 280).add(sun.target.position);
      const sc = sun.shadow.camera;
      sc.left = -150; sc.right = 150; sc.top = 150; sc.bottom = -150; sc.near = 10; sc.far = 800;
      sc.updateProjectionMatrix();

      // 速度、磁力、外力的箭頭與標籤
      cur.arrows = {};
      [['v', 'accent', 'v'], ['Fb', 'neg', T('F磁', 'F_B')], ['Fe', 'b-mech', T('F外', 'F_ext')]].forEach(function (d) {
        const a = makeArrow(col(d[1]), { shadow: true });
        a.group.visible = false;
        g.add(a.group);
        const l1 = label(d[2], C[d[1]], 8.5), l2 = label(d[2] + ' ≈', C[d[1]], 8.5);
        l1.visible = l2.visible = false;
        g.add(l1, l2);
        cur.arrows[d[0]] = { a: a, l: l1, lx: l2 };
      });
      // 電流方向的小箭頭（沿迴路）
      const chevMat = new THREE.MeshStandardMaterial({ color: col('probe'), emissive: col('probe'), emissiveIntensity: dark() ? 0.7 : 0.35, roughness: 0.35 });
      const chev = new THREE.InstancedMesh(gChev, chevMat, 48);
      chev.frustumCulled = false;
      chev.count = 0;
      g.add(chev);
      cur.chev = chev;
    }
    function buildRig() {
      const g = subGroup('rig');
      const B = state.B, hL = B.L / 2 * CM, D = FC.RAIL.D * CM;
      box = { x0: -14, x1: D + 8, y0: -(hL + 14), y1: hL + 14, z0: 0, z1: 24, pad: 2 };
      floor(g, -30, D + 30, -(hL + 40), hL + 40, 0, 10, 50);

      // 均勻磁場：一格一格的立體箭頭（深淺代表 B 的大小；方向 ±z），全部在桌面上方
      const up = B.Bsign > 0;
      const op = 0.28 + 0.5 * clamp(B.B / 2, 0, 1);
      const bmat = new THREE.MeshStandardMaterial({ color: col('b-em'), emissive: col('b-em'), emissiveIntensity: dark() ? 0.35 : 0.12, roughness: 0.45, transparent: true, opacity: op, depthWrite: false });
      const spots = [];
      const sp = 25;
      for (let x = -12.5; x <= D + 12.6; x += sp) {
        for (let y = sp / 2; y <= hL + sp + 0.1; y += sp) { spots.push([x, y]); spots.push([x, -y]); }
      }
      const shafts = new THREE.InstancedMesh(gCyl, bmat, spots.length), heads = new THREE.InstancedMesh(gCone, bmat, spots.length);
      const zb = 8, zt = 24, hl = 4.2;
      const qq = new THREE.Quaternion().setFromUnitVectors(Y1, V(0, 0, up ? 1 : -1));
      spots.forEach(function (p, i) {
        const z0 = up ? zb : zt;
        shafts.setMatrixAt(i, mtx.compose(V(p[0], p[1], z0), qq, V(0.42, zt - zb - hl * 0.85, 0.42)));
        heads.setMatrixAt(i, mtx.compose(V(p[0], p[1], up ? zt - hl : zb + hl), qq, V(1.5, hl, 1.5)));
      });
      shafts.frustumCulled = heads.frustumCulled = false;
      shafts.renderOrder = heads.renderOrder = 6;
      g.add(shafts, heads);
      const bl = label('B', C['b-em'], 9);
      bl.position.set(-12.5 + 6, hL + 12.5, zt + 1);
      g.add(bl);

      // 軌道（銅色圓桿）與末端擋塊
      const railMat = new THREE.MeshStandardMaterial({ color: col('equi'), roughness: 0.28, metalness: 0.85 });
      const railGeo = new THREE.CylinderGeometry(RAIL_R, RAIL_R, D + 7, 24).rotateZ(-Math.PI / 2);
      [-1, 1].forEach(function (sy) {
        const r = new THREE.Mesh(railGeo, railMat);
        r.position.set((D + 7) / 2 - 4, sy * hL, RAIL_R);
        r.castShadow = r.receiveShadow = true;
        g.add(r);
        const st = new THREE.Mesh(new THREE.BoxGeometry(2.6, 5, 4.6), new THREE.MeshStandardMaterial({ color: dark() ? col('field').multiplyScalar(0.55) : col('field'), roughness: 0.5, metalness: 0.2 }));
        st.position.set(D + 3 + 1.3, sy * hL, 2.3);
        st.castShadow = true;
        g.add(st);
      });
      // 電阻：x = 0 處跨接兩條軌道
      const wireMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(mixCss(C.muted, C.text, 0.3)), roughness: 0.4, metalness: 0.5 });
      const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 2 * hL, 12), wireMat);
      wire.position.set(0, 0, WIRE_Z);
      g.add(wire);
      const bodyLen = Math.min(16, Math.max(Math.min(6, 2 * hL * 0.6), 2 * hL * 0.4));
      const bodyCol = new THREE.Color(dark() ? mixCss(C.equi, '#000000', 0.35) : mixCss(C.equi, '#ffffff', 0.55));
      const resMat = new THREE.MeshStandardMaterial({ color: bodyCol, roughness: 0.55, metalness: 0.05, emissive: col('b-thermo'), emissiveIntensity: 0 });
      const res = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.45, bodyLen, 28), resMat);
      res.position.set(0, 0, WIRE_Z);
      res.castShadow = true;
      g.add(res);
      const bandMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(mixCss(C.text, C.equi, 0.25)), roughness: 0.5 });
      [-0.3, -0.14, 0.02, 0.3].forEach(function (f, i) {
        const b = new THREE.Mesh(new THREE.CylinderGeometry(1.48, 1.48, bodyLen * 0.06, 28), i === 3 ? railMat : bandMat);
        b.position.set(0, f * bodyLen, WIRE_Z);
        g.add(b);
      });
      const glowTex = radialTexture([[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,0.45)'], [1, 'rgba(255,255,255,0)']]);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: col('b-thermo'), transparent: true, opacity: 0, depthWrite: false, blending: dark() ? THREE.AdditiveBlending : THREE.NormalBlending }));
      glow.position.set(0, 0, WIRE_Z + 0.5);
      glow.scale.set(bodyLen + 14, bodyLen + 14, 1);
      glow.renderOrder = 7;
      g.add(glow);
      const rl = label('R', C.text, 8);
      rl.position.set(-8, 0, WIRE_Z + 2);
      g.add(rl);
      // 距離刻度（前面那條軌道外側的桌面上）
      const tk = [];
      for (let i = 1; i <= Math.round(D / 50); i++) {
        const x = i * 50;
        tk.push(x, -hL - 3, 0.05, x, -hL - 6, 0.05);
        const l = label(X.num(x / CM, 1) + ' m', C.muted, 7.5, { weight: 600 });
        l.position.set(x, -hL - 11, 0.5);
        g.add(l);
      }
      g.add(segments(tk, lineMat(col('muted'), 0.8)));

      // 導體棒（金屬圓柱，跨在兩條軌道上，兩端各伸出 5 cm）
      const metal = new THREE.Color(dark() ? mixCss(C.field, '#000000', 0.1) : mixCss(C.field, '#ffffff', 0.25));
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(ROD_R, ROD_R, 2 * hL + 10, 28), new THREE.MeshStandardMaterial({ color: metal, roughness: 0.22, metalness: 0.9 }));
      rod.castShadow = true;
      rod.position.z = ROD_Z;
      g.add(rod);

      // 迴路面積（磁通量 Φ = BLx）
      const area = new THREE.Mesh(new THREE.PlaneGeometry(1, 2 * hL).translate(0.5, 0, 0), new THREE.MeshBasicMaterial({
        color: col('b-em'), transparent: true, opacity: dark() ? 0.22 : 0.15, depthWrite: false
      }));
      area.position.z = 0.06;
      area.renderOrder = 0;
      g.add(area);
      const phiL = label('Φ = BLx', C['b-em'], 8);
      g.add(phiL);

      // 有電流的導體：外面一層發光的套管（亮度 ∝ |I|）
      const gm = new THREE.MeshBasicMaterial({ color: col('probe'), transparent: true, opacity: 0, depthWrite: false, blending: dark() ? THREE.AdditiveBlending : THREE.NormalBlending });
      const railGlow = [-1, 1].map(function (sy) {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(RAIL_R * 1.35, RAIL_R * 1.35, 1, 16).rotateZ(-Math.PI / 2).translate(0.5, 0, 0), gm);
        m.position.set(0, sy * hL, RAIL_R);
        m.renderOrder = 8;
        g.add(m);
        return m;
      });
      const rodGlow = new THREE.Mesh(new THREE.CylinderGeometry(ROD_R * 1.3, ROD_R * 1.3, 2 * hL, 18), gm);
      rodGlow.position.z = ROD_Z;
      rodGlow.renderOrder = 8;
      const wireGlow = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 2 * hL, 12), gm);
      wireGlow.position.set(0, 0, WIRE_Z);
      wireGlow.renderOrder = 8;
      g.add(rodGlow, wireGlow);

      cur.rig = { hL: hL, bodyLen: bodyLen, rod: rod, rodGlow: rodGlow, area: area, phiL: phiL, glowMat: gm, railGlow: railGlow, res: res, resMat: resMat, glow: glow };
    }
    /** 放開後的停止位置 x0 + v0τ（虛線） */
    function buildStop(tau) {
      const g = subGroup('stop');
      const B = state.B, hL = B.L / 2 * CM;
      if (B.sub !== 'release' || !(B.v0 > 0)) return;
      const xs = (FC.RAIL.x0 + B.v0 * tau) * CM;
      if (!(xs < FC.RAIL.D * CM)) return;
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.Float32BufferAttribute([xs, -hL - 10, 0.1, xs, hL + 10, 0.1], 3));
      const ln = new THREE.Line(lg, new THREE.LineDashedMaterial({ color: col('accent'), dashSize: 2.2, gapSize: 2.2, transparent: true, opacity: 0.85 }));
      ln.computeLineDistances();
      g.add(ln);
      const l = label(T('停止位置 x0 + v0τ', 'Stops at x0 + v0τ'), C.accent, 7.5);
      l.position.set(xs, hL + 16, 0.5);
      g.add(l);
    }

    function updateB(s) {
      const B = state.B, sc = X.scale(), show = state.show, rg = cur.rig;
      const hL = rg.hL, xr = s.x * CM;
      const level = sc ? clamp(Math.abs(s.I) / sc.range, 0, 1) : 0;
      rg.rod.position.x = xr;
      rg.rodGlow.position.x = xr;
      rg.area.scale.x = Math.max(0.01, xr);
      rg.phiL.position.set(xr / 2 + 2, 0, 0.8);
      rg.phiL.visible = xr > 60;

      // 電流：發光套管與沿迴路移動的小箭頭（I > 0 為由上往下看逆時針）
      const on = show.current && level > 0.01;
      rg.glowMat.opacity = on ? (dark() ? 0.55 : 0.32) * (0.3 + 0.7 * level) : 0;
      rg.railGlow.forEach(function (m) { m.scale.x = Math.max(0.01, xr); });
      const ch = cur.chev;
      let n = 0;
      if (on) {
        // 棒上的箭頭在棒頂、軌道上的在軌道頂、電阻那段在導線上方
        const zr = 2 * RAIL_R + 1.6, zd = ROD_Z + ROD_R + 1.6, zw = WIRE_Z + 1.9;
        const segs = [];
        let tot = 0;
        const legs = [[[xr, -hL, zd], [xr, hL, zd]], [[xr, hL, zr], [0, hL, zr]], [[0, hL, zw], [0, -hL, zw]], [[0, -hL, zr], [xr, -hL, zr]]];
        legs.forEach(function (lg) { const l = Math.hypot(lg[1][0] - lg[0][0], lg[1][1] - lg[0][1]); segs.push(l); tot += l; });
        const sI = s.I > 0 ? 1 : -1, cnt = Math.min(48, Math.max(4, Math.round(tot / 24)));
        const sz = 3.6;
        sv3.set(sz, sz, sz);
        for (let j = 0; j < cnt; j++) {
          const u = ((j / cnt + state.flow * 0.25) % 1 + 1) % 1;
          let dist = u * tot, i = 0;
          while (i < segs.length - 1 && dist > segs[i]) { dist -= segs[i]; i++; }
          if (!segs[i]) continue;
          const a = legs[i][0], b = legs[i][1], f = dist / segs[i];
          const y = a[1] + (b[1] - a[1]) * f;
          if (i === 2 && Math.abs(y) < rg.bodyLen / 2 + 2.5) continue; // 不畫在電阻本體上
          pv3.set(a[0] + (b[0] - a[0]) * f, y, a[2]);
          tv3.set((b[0] - a[0]) * sI, (b[1] - a[1]) * sI, 0).normalize();
          qtn.setFromUnitVectors(Y1, tv3);
          ch.setMatrixAt(n++, mtx.compose(pv3, qtn, sv3));
        }
      }
      ch.count = n;
      ch.instanceMatrix.needsUpdate = true;

      // 電阻發熱
      const glow = sc && sc.Pmax > 0 ? clamp(s.P / sc.Pmax, 0, 1) : 0;
      rg.resMat.emissiveIntensity = 0.9 * glow;
      rg.glow.material.opacity = (dark() ? 0.75 : 0.5) * glow;

      // 速度、磁力、外力（比例與 2D 相同：1 m/s → 25 cm、1 N → 40 cm，最長 62 cm）
      const cap = 0.62 * CM, yq = Math.max(6, 2 * hL * 0.26), za = ROD_Z + 2.6;
      function vec(key, value, scale, y) {
        const o = cur.arrows[key];
        o.l.visible = o.lx.visible = false;
        if (Math.abs(value) < 1e-6) { o.a.group.visible = false; return; }
        const lenFull = Math.abs(value) * scale * CM, over = lenFull > cap, len = Math.min(lenFull, cap), ux = value > 0 ? 1 : -1;
        const x0 = xr + ux * (ROD_R + 0.6);
        o.a.set(V(x0, y, za), V(ux, 0, 0), len, 0.55, 3.8, 1.55);
        const lb = over ? o.lx : o.l;
        lb.visible = true;
        lb.position.set(x0 + ux * (len + 4.5 + lb.scale.x / 2), y, za + 1.5);
      }
      vec('v', s.v, X.SCALE_VB, 0);
      vec('Fb', s.Fb, X.SCALE_FB, yq);
      if (B.sub !== 'release') vec('Fe', s.Fext, X.SCALE_FB, -yq);
      else { const o = cur.arrows.Fe; o.a.group.visible = o.l.visible = o.lx.visible = false; }

      // 疊在畫面上的讀數
      setOv('tl', 't = ' + X.num(Math.min(state.t, B.tEnd), 2) + ' s' + (state.slow ? '  (' + X.SLOW + '×)' : ''), C.text);
      setOv('tr', 'B ' + (B.Bsign < 0 ? '⊗' : '⊙') + ' ' + X.num(B.B, 2) + ' T', C['b-em']);
      setOv('f', 'Φ = BLx = ' + X.num(Math.abs(s.phi), 3) + ' Wb', C['b-em']);
      setOv('e', 'ε = ' + X.num(B.Bsign * s.eps, 3) + ' V', C['b-mech']);
      setOv('i', 'I = ' + X.num(B.Bsign * s.I, 3) + ' A', C.probe);
      setOv('mid', X.circText(FC.rodCirculation(s.I)), C.muted);
    }

    // =====================================================================
    // 拖曳磁鐵（模式 A）：指標射線上離線圈軸最近的點就是磁鐵要去的位置
    // =====================================================================
    const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
    let dragId = null;
    function pointerRay(ev) {
      const r = canvas.getBoundingClientRect();
      ndc.set((ev.clientX - r.left) / r.width * 2 - 1, -(ev.clientY - r.top) / r.height * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      return raycaster.ray;
    }
    /** 射線上離 x 軸最近的點的 x（cm）；幾乎沿著軸看時傳回 null */
    function axisX(ray) {
      const d = ray.direction, o = ray.origin;
      const b = d.x, den = 1 - b * b;
      if (den < 0.03) return null;
      const e = -(d.x * o.x + d.y * o.y + d.z * o.z);
      return (b * e + o.x) / den;
    }
    function hitMagnet(ray, touch) {
      if (state.mode !== 'A' || !cur.magnet) return false;
      const xm = cur.magnet.grp.position.x;
      const d2 = ray.distanceSqToSegment(V(xm - MHL, 0, 0), V(xm + MHL, 0, 0));
      const r = MHW * 1.42 + (touch ? 1.4 : 0.35);
      return d2 < r * r;
    }
    function onDown(ev) {
      if (dragId != null || state.mode !== 'A' || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
      const ray = pointerRay(ev);
      if (!hitMagnet(ray, ev.pointerType !== 'mouse')) return;
      const x = axisX(ray);
      if (x == null) return;
      ev.stopPropagation(); // 不讓 OrbitControls 轉動視角
      ev.preventDefault();
      dragId = ev.pointerId;
      controls.enabled = false;
      try { canvas.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
      canvas.style.cursor = 'grabbing';
      X.grabMagnet(x / CM);
    }
    function onMove(ev) {
      if (dragId === ev.pointerId) {
        const x = axisX(pointerRay(ev));
        if (x != null) X.moveMagnet(x / CM);
        return;
      }
      if (ev.pointerType === 'mouse' && !ev.buttons && state.mode === 'A') {
        const h = hitMagnet(pointerRay(ev), false);
        if (h !== !!state.A.hover) X.setHover(h);
        canvas.style.cursor = h ? 'grab' : '';
      }
    }
    function onUp(ev) {
      if (dragId !== ev.pointerId) return;
      dragId = null;
      controls.enabled = true;
      canvas.style.cursor = '';
      try { canvas.releasePointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
      X.endDrag();
    }
    function onLeave() { if (state.A.hover && dragId == null) { X.setHover(false); canvas.style.cursor = ''; } }
    host.addEventListener('pointerdown', onDown, true);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('pointerleave', onLeave);

    // =====================================================================
    // 繪製
    // =====================================================================
    let raf = 0, lastS = null;
    function renderNow() {
      if (!api.active || document.hidden) return;
      const want = Math.min(window.devicePixelRatio || 1, 2);
      if (renderer.getPixelRatio() !== want) { renderer.setPixelRatio(want); resize3(); return; }
      const moved = controls.update();
      renderer.render(scene, camera);
      if (moved) requestRender(); // 阻尼慣性還在進行
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
      fit(false);
      requestRender();
    }
    const ro = window.ResizeObserver ? new ResizeObserver(resize3) : null;
    if (ro) ro.observe(canvas); else window.addEventListener('resize', resize3);
    controls.addEventListener('change', requestRender);
    const onVisible = function () { if (!document.hidden) requestRender(); };
    document.addEventListener('visibilitychange', onVisible);
    canvas.addEventListener('webglcontextlost', function (ev) {
      ev.preventDefault();
      if (!api.active) return; // 切回 2D 時自己釋放的（forceContextLoss），不是意外中斷
      X.lost();
    });

    const api = {
      active: true,
      /** 每次 2D 程式更新畫面時呼叫（s 是目前的物理狀態） */
      frame: function (s) {
        if (!api.active) return;
        lastS = s;
        ensureBuilt();
        if (state.mode === 'A') updateA(s); else updateB(s);
        renderNow();
      },
      onTheme: function () {
        C = X.colors();
        hemi.groundColor.copy(col('canvas-bg')).lerp(col('text'), 0.35);
        modeKey = '';
        if (lastS) api.frame(lastS);
      },
      resetCamera: function () { fit(true); requestRender(); },
      dispose: function () {
        api.active = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize3);
        document.removeEventListener('visibilitychange', onVisible);
        host.removeEventListener('pointerdown', onDown, true);
        controls.dispose();
        disposeObject(scene);
        sharedGeo.forEach(function (g) { g.dispose(); });
        if (envTex) envTex.dispose();
        renderer.dispose();
        // 已經中斷的繪圖環境不必（也無法）再釋放
        try { if (!renderer.getContext().isContextLost()) renderer.forceContextLoss(); } catch (e) { /* 忽略 */ }
        canvas.remove();
        ov.remove();
      }
    };

    // 初始化
    hemi.groundColor.copy(col('canvas-bg')).lerp(col('text'), 0.35);
    const w0 = canvas.clientWidth, h0 = canvas.clientHeight;
    if (w0 && h0) { renderer.setSize(w0, h0, false); camera.aspect = w0 / h0; camera.updateProjectionMatrix(); }
    return api;
  }

  window.Faraday3D = { create: create };
})();
