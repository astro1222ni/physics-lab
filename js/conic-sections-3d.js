/*
 * conic-sections-3d.js — 「圓錐曲線：用平面切圓錐」的 3D 立體檢視（three.js）
 *
 * 由 js/conic-sections.js 在使用者按「3D 立體」時才載入（three.js 也是那時才以 import() 載入）；切回 2D 時整個釋放。
 * 用法：window.Conic3D.create({ THREE, OrbitControls }, 容器, bridge) → { active, rebuild, updateP, setShow, onTheme, resetCamera, dispose }
 *
 * 所有幾何量都來自 conic-sections-core.js，與 2D 是同一份計算：
 *   切口 section（類型、a、b、c、焦點、準線、丹德林球的球心與半徑、相切圓）、平面座標與空間座標的轉換 toSpace／fromSpace、
 *   曲線取樣 polylines、點 P 的量測 measure（PF、PD、過 P 的母線與相切圓的交點 K）。
 * 場景座標就是核心的座標：頂點 V 在原點、圓錐的軸是 z 軸（朝上），1 個場景單位 = 1 單位長。
 * 圓錐畫多長：依 d = 3 時兩顆丹德林球與切口的位置決定，所以改 d 時圓錐與視角不變，切平面、球與曲線真的移動、變大變小。
 */
(function () {
  'use strict';
  const FONT = 'system-ui, -apple-system, "Segoe UI", "Noto Sans TC", "PingFang TC", sans-serif';
  const RES = 3;           // 標籤畫布的解析度倍數
  const D_REF = 3;         // 圓錐長度與視角以 d = 3 安排
  const H_CAP = 6 * D_REF; // 圓錐最長畫到離頂點 18 單位長（再遠的球放不進畫面）

  function create(lib, host, B) {
    const THREE = lib.THREE;
    const CC = B.CC, T = B.T, D = B.D, state = B.state;
    const alpha = D.alpha, shade = D.shade;
    let C = B.colors();
    let colorVer = 0;
    const isDark = function () { return !!D.dark; };
    const col = function (k) { return new THREE.Color(C[k] || k); };
    const V3 = function (p) { return new THREE.Vector3(p[0], p[1], p[2]); };

    // ---------- 畫布與資訊列（HUD） ----------
    const wrap = document.createElement('div');
    wrap.className = 'c3-wrap';
    const canvas = document.createElement('canvas');
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', T('雙圓錐、切平面與兩顆丹德林球的 3D 立體檢視：拖曳旋轉，滾輪或雙指縮放；拖曳綠色的點 P 或按左右方向鍵，可沿曲線移動 P。',
      '3D view of the double cone, the cutting plane and the two Dandelin spheres: drag to rotate, scroll or pinch to zoom; drag the green point P, or use the left and right arrow keys, to move P along the curve.'));
    wrap.appendChild(canvas);
    const hud = document.createElement('div');
    hud.className = 'c3-hud';
    hud.setAttribute('aria-hidden', 'true');
    hud.innerHTML = '<div class="tl"><span data-k="type"></span><span class="m" data-k="e"></span></div>' +
      '<div class="tr"><span class="m" data-k="note"></span></div>' +
      '<div class="bl"><span class="m" data-k="tan"></span><span data-k="inv"></span></div>';
    wrap.appendChild(hud);
    host.appendChild(wrap);
    const hudEl = {}, hudLast = {};
    hud.querySelectorAll('[data-k]').forEach(function (e) { hudEl[e.getAttribute('data-k')] = e; });
    function setHud(k, h) { if (hudLast[k] !== h) { hudLast[k] = h; hudEl[k].innerHTML = h; } }

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
    const camera = new THREE.PerspectiveCamera(34, 4 / 3, 0.05, 1000);
    camera.up.set(0, 0, 1); // z 朝上（圓錐的軸）；必須在建立 OrbitControls 之前設定

    // ---------- 尺寸（每次重建時更新） ----------
    let up = 10, lo = 4;          // 上、下兩個錐從頂點往外畫多長
    let fitR = 8;                 // 整個場景的外接球半徑（自動對焦用）
    const fitC = new THREE.Vector3();
    let ballR = 0.14, tubeR = 0.05;
    let cw = 300, ch = 225, narrow = false;

    // ---------- 指標：拖曳點 P（要在 OrbitControls 之前註冊，才能攔下旋轉） ----------
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const cutPlane = new THREE.Plane();
    const hitV = new THREE.Vector3();
    const pSphere = new THREE.Sphere();
    let dragP = null, hotP = false;
    function setRay(ev) {
      const r = canvas.getBoundingClientRect();
      ndc.set((ev.clientX - r.left) / r.width * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
    }
    /** 在 at 處，1 個螢幕像素是多少場景單位 */
    function pxSize(at) {
      return 2 * Math.tan(camera.fov * Math.PI / 360) * camera.position.distanceTo(at) / Math.max(1, ch);
    }
    function hitP(ev) {
      const s = state.sec;
      if (!s || s.degenerate) return false;
      const q = B.pPoint();
      if (!q) return false;
      const P3 = CC.toSpace(s, q.x, q.y);
      setRay(ev);
      pSphere.center.set(P3[0], P3[1], P3[2]);
      pSphere.radius = Math.max(ballR * 1.6, 18 * pxSize(pSphere.center));
      return ray.ray.intersectsSphere(pSphere);
    }
    /** 指標方向與切平面的交點（拖曳 P 時用：P 永遠在切平面上，再由核心找曲線上最近的點） */
    function planeHit(ev) {
      const s = state.sec;
      cutPlane.normal.set(s.m[0], s.m[1], s.m[2]);
      cutPlane.constant = -s.d;
      setRay(ev);
      return ray.ray.intersectPlane(cutPlane, hitV) ? hitV : null;
    }
    function setHot(h) {
      if (h === hotP) return;
      hotP = h;
      canvas.classList.toggle('on-p', h);
      applyHot();
      requestRender();
    }
    canvas.addEventListener('pointerdown', function (ev) {
      if (ev.button === 0 && hitP(ev)) {
        dragP = { id: ev.pointerId, moved: false };
        try { canvas.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
        setHot(true);
        ev.stopImmediatePropagation();
        ev.preventDefault();
      }
    });
    canvas.addEventListener('pointermove', function (ev) {
      if (dragP && ev.pointerId === dragP.id) {
        const X = planeHit(ev);
        if (X) {
          const q = CC.fromSpace(state.sec, [X.x, X.y, X.z]);
          dragP.moved = true;
          B.dragP(q.x, q.y);
        }
        ev.stopImmediatePropagation();
        return;
      }
      if (!ev.buttons && ev.pointerType !== 'touch') setHot(hitP(ev));
    });
    function pointerEnd(ev) {
      if (!dragP || ev.pointerId !== dragP.id) return;
      const moved = dragP.moved;
      dragP = null;
      setHot(ev.pointerType === 'mouse' && hitP(ev));
      if (moved) B.endDragP();
      ev.stopImmediatePropagation();
    }
    canvas.addEventListener('pointerup', pointerEnd);
    canvas.addEventListener('pointercancel', pointerEnd);
    canvas.addEventListener('pointerleave', function () { if (!dragP) setHot(false); });
    // 鍵盤：左右（或上下）方向鍵沿曲線移動 P，Shift 走得多
    canvas.addEventListener('keydown', function (ev) {
      const k = ev.key;
      const dir = k === 'ArrowRight' || k === 'ArrowUp' ? 1 : k === 'ArrowLeft' || k === 'ArrowDown' ? -1 : 0;
      if (!dir) return;
      ev.preventDefault();
      B.stepP(dir, ev.shiftKey);
    });

    // ---------- 視角控制 ----------
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.rotateSpeed = 0.85;
    controls.screenSpacePanning = true;
    let startAng = null;
    controls.addEventListener('start', function () { startAng = [controls.getAzimuthalAngle(), controls.getPolarAngle()]; });
    controls.addEventListener('end', function () {
      if (!startAng) return;
      const da = controls.getAzimuthalAngle() - startAng[0];
      const turned = Math.abs(Math.atan2(Math.sin(da), Math.cos(da))) + Math.abs(controls.getPolarAngle() - startAng[1]);
      startAng = null;
      if (turned > 0.1) B.onRotate(); // 真的轉了視角（不是只縮放）才回報
    });

    // ---------- 光線與環境反光 ----------
    const hemi = new THREE.HemisphereLight(0xffffff, 0x3a4250, 0.75);
    hemi.position.set(0, 0, 1);
    scene.add(hemi);
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.1);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.bias = -0.0004;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);
    scene.add(keyLight.target);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.45);
    scene.add(fillLight);
    scene.add(fillLight.target);
    // 簡單的「攝影棚」環境貼圖：讓玻璃球與圓錐有柔和的反光（自己產生，不載入任何檔案）
    const pmrem = new THREE.PMREMGenerator(renderer);
    let envRT = null;
    function buildEnv() {
      if (envRT) { envRT.dispose(); envRT = null; }
      const s = new THREE.Scene();
      const g = new THREE.SphereGeometry(10, 32, 16);
      g.rotateX(Math.PI / 2); // 讓漸層沿 z（上下）
      const pos = g.attributes.position, cols = new Float32Array(pos.count * 3);
      const top = new THREE.Color(isDark() ? 0x5d6a80 : 0xffffff), bot = new THREE.Color(isDark() ? 0x0a0d12 : 0x7d8794);
      const c = new THREE.Color();
      for (let i = 0; i < pos.count; i++) {
        const u = Math.max(0, Math.min(1, (pos.getZ(i) / 10 + 1) / 2));
        c.copy(bot).lerp(top, Math.pow(u, 0.75));
        cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      s.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
      const boxGeo = new THREE.PlaneGeometry(7, 4);
      [[4, -6, 6, 1], [-7, 2, 3, 0.45], [6, 5, -1, 0.25]].forEach(function (b) {
        const m = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(b[3], b[3], b[3]), side: THREE.DoubleSide }));
        m.position.set(b[0], b[1], b[2]);
        m.lookAt(0, 0, 0);
        s.add(m);
      });
      envRT = pmrem.fromScene(s, 0.035);
      s.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      scene.environment = envRT.texture;
    }

    // ---------- 共用工具 ----------
    function disposeObject(obj) {
      obj.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) {
            if (m.map) m.map.dispose();
            m.dispose();
          });
        }
      });
    }
    function clearGroup(g) {
      g.children.slice().forEach(function (o) { g.remove(o); disposeObject(o); });
    }
    function lineObj(points, color, opacity, dashed, order) {
      const mat = dashed
        ? new THREE.LineDashedMaterial({ color: color, transparent: true, opacity: opacity, dashSize: dashed[0], gapSize: dashed[1], depthWrite: false })
        : new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: opacity, depthWrite: false });
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), mat);
      if (dashed) l.computeLineDistances();
      l.renderOrder = order == null ? 8 : order;
      return l;
    }
    /** 兩點之間的細圓柱（線段太細時 WebGL 只畫 1 px，用圓柱才看得清楚） */
    function rod(a, b, r, color, opacity) {
      const dir = new THREE.Vector3().subVectors(b, a);
      const L = dir.length();
      const geo = new THREE.CylinderGeometry(r, r, Math.max(L, 1e-6), 10, 1, false);
      const mat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.4, metalness: 0, emissive: color, emissiveIntensity: 0.25 });
      if (opacity != null && opacity < 1) { mat.transparent = true; mat.opacity = opacity; mat.depthWrite = false; }
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(a).addScaledVector(dir, 0.5);
      if (L > 1e-9) m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.divideScalar(L));
      m.castShadow = true;
      return m;
    }
    function ball(p, r, color, emissive) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 20),
        new THREE.MeshPhysicalMaterial({ color: color, roughness: 0.28, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.2, emissive: color, emissiveIntensity: emissive == null ? 0.18 : emissive }));
      m.position.copy(p);
      m.castShadow = true;
      return m;
    }

    // ---------- 文字標籤（Sprite，固定像素大小；以 2D 畫布繪製，'F_1' 的 _1 畫成小一號的下標） ----------
    function label(text, color, opt) {
      opt = opt || {};
      const px = (opt.size || (narrow ? 12.5 : 13.5)) * RES;
      const fMain = (opt.italic === false ? '' : 'italic ') + (opt.weight || 700) + ' ' + px + 'px ' + FONT;
      const fSub = (opt.weight || 700) + ' ' + Math.round(px * 0.7) + 'px ' + FONT;
      const parts = String(text).split(/_(\w)/);
      const c = document.createElement('canvas');
      let g = c.getContext('2d');
      let w = 0;
      parts.forEach(function (p, i) { g.font = i % 2 ? fSub : fMain; w += g.measureText(p).width + (i % 2 ? RES : 0); });
      const padX = 5 * RES, padY = 4 * RES;
      c.width = Math.ceil(w + 2 * padX);
      c.height = Math.ceil(px * 1.35 + 2 * padY);
      g = c.getContext('2d');
      g.textBaseline = 'middle';
      g.textAlign = 'left';
      g.lineJoin = 'round';
      let x = padX;
      const y = c.height / 2;
      parts.forEach(function (p, i) {
        if (!p) return;
        const sub = i % 2 === 1;
        g.font = sub ? fSub : fMain;
        const yy = sub ? y + px * 0.3 : y;
        const xx = x + (sub ? RES * 0.5 : 0);
        g.lineWidth = 4 * RES;
        g.strokeStyle = alpha(C['canvas-bg'], 0.92);
        g.strokeText(p, xx, yy);
        g.fillStyle = color;
        g.fillText(p, xx, yy);
        x += g.measureText(p).width + (sub ? RES : 0);
      });
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false }));
      sp.userData.lw = c.width / RES;
      sp.userData.lh = c.height / RES;
      sp.userData.isLabel = true;
      sp.renderOrder = 30;
      fitLabel(sp);
      const dir = opt.dir || [1, 1];
      anchorLabel(sp, dir[0], dir[1], opt.gap == null ? 6 : opt.gap);
      return sp;
    }
    function at(obj, p) { obj.position.copy(p); return obj; }
    function fitLabel(sp) {
      const k = 2 * Math.tan(camera.fov * Math.PI / 360) / Math.max(1, ch);
      sp.scale.set(sp.userData.lw * k, sp.userData.lh * k, 1);
    }
    function sizeLabels() { scene.traverse(function (o) { if (o.userData && o.userData.isLabel) fitLabel(o); }); }
    /** 標籤放在錨點的 (dx, dy) 方向（螢幕像素，y 向上），邊緣離錨點 gap 像素 */
    function anchorLabel(sp, dx, dy, gap) {
      const L = Math.hypot(dx, dy);
      dx /= L; dy /= L;
      const lw = sp.userData.lw, lh = sp.userData.lh;
      sp.center.set(0.5 - dx * (lw / 2 + gap) / lw, 0.5 - dy * (lh / 2 + gap) / lh);
    }

    // ---------- 圓錐的長度、切平面的範圍、整體外接球 ----------
    function keepFn(s) {
      return function (x, y) { const z = CC.toSpace(s, x, y)[2]; return z <= up + 1e-9 && z >= -lo - 1e-9; };
    }
    /** 切口在圓錐範圍內的折線（標準式座標） */
    function curvePolys(s) {
      if (s.type === 'point') return [];
      if (s.type === 'lines' || s.type === 'line') {
        // 平面過頂點：兩條（或一條）母線。z 沿直線線性變化，直接算出兩端
        const out = [];
        (s.type === 'lines' ? [1, -1] : [1]).forEach(function (br) {
          const ph = s.type === 'lines' ? s.phi * Math.PI / 180 : 0;
          const dx = Math.cos(ph), dy = br * Math.sin(ph);
          const kz = CC.toSpace(s, dx, dy)[2] - CC.toSpace(s, 0, 0)[2];
          if (Math.abs(kz) < 1e-12) return;
          const t1 = up / kz, t0 = -lo / kz;
          out.push([[t0 * dx, t0 * dy], [t1 * dx, t1 * dy]]);
        });
        return out;
      }
      return CC.polylines(s, 3 * Math.max(up, lo) + 2, keepFn(s), 1200);
    }
    /** 切平面要畫的範圍（標準式座標的矩形）：涵蓋圓錐內的切口、焦點與附近的準線 */
    function planeRect(s) {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      const add = function (x, y) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); };
      curvePolys(s).forEach(function (pl) { pl.forEach(function (p) { add(p[0], p[1]); }); });
      s.spheres.forEach(function (S) { add(S.fx, 0); });
      if (!isFinite(x0)) { const r = 0.3 * up; return { x0: -r, x1: r, y0: -r, y1: r }; }
      const M = Math.max(x1 - x0, y1 - y0);
      s.spheres.forEach(function (S) { if (S.dx != null && S.dx > x0 - 0.45 * M && S.dx < x1 + 0.45 * M) add(S.dx, 0); });
      const W = x1 - x0, H = y1 - y0;
      if (H < 0.55 * W) { const e = (0.55 * W - H) / 2; y0 -= e; y1 += e; }
      const m = 0.06 * Math.max(W, H) + 0.08 * D_REF;
      return { x0: x0 - m, x1: x1 + m, y0: y0 - m, y1: y1 + m };
    }
    function computeExtents() {
      const s0 = CC.section(state.alpha, state.beta, D_REF);
      let u = 0, l = 0;
      const add = function (z) { z = Math.max(-H_CAP, Math.min(H_CAP, z)); if (z > u) u = z; if (-z > l) l = -z; };
      s0.spheres.forEach(function (S) { add(S.zc + S.r); add(S.zc - S.r); add(S.focus3[2]); });
      const xs = s0.family === 'parabola' ? [0] : [-s0.a, s0.a];
      xs.forEach(function (x) { if (isFinite(x)) add(CC.toSpace(s0, x, 0)[2]); });
      add(s0.foot[2]);
      const open = s0.family === 'parabola' || s0.family === 'hyperbola';
      u = Math.min(H_CAP, Math.max(u * (open ? 1.25 : 1.05), 0.8 * D_REF));
      l = Math.min(H_CAP, l * (open ? 1.25 : 1.05));
      l = Math.max(l, 0.38 * u);
      u = Math.max(u, 0.38 * l);
      up = u; lo = l;
      // 對焦的範圍：頂點、切平面（含切口與焦點）、畫得出來的球（以 d = 3 估）；圓錐本身可以超出畫面
      const pts = [new THREE.Vector3(0, 0, 0)];
      const rc = planeRect(s0);
      [[rc.x0, rc.y0], [rc.x1, rc.y0], [rc.x0, rc.y1], [rc.x1, rc.y1]].forEach(function (p) { pts.push(V3(CC.toSpace(s0, p[0], p[1]))); });
      s0.spheres.forEach(function (S) {
        if (S.zc + S.r > up * 1.001 || S.zc - S.r < -lo * 1.001) return;
        [[S.r, 0, 0], [-S.r, 0, 0], [0, S.r, 0], [0, -S.r, 0], [0, 0, S.r], [0, 0, -S.r]].forEach(function (o) { pts.push(new THREE.Vector3(o[0], o[1], S.zc + o[2])); });
      });
      const sph = new THREE.Sphere().setFromPoints(pts);
      const changed = Math.abs(sph.radius - fitR) > 1e-6 || sph.center.distanceTo(fitC) > 1e-6;
      fitR = sph.radius;
      fitC.copy(sph.center);
      ballR = fitR * 0.017;
      tubeR = fitR * 0.0068;
      return changed;
    }

    // ---------- 場景物件 ----------
    const coneG = new THREE.Group(), mainG = new THREE.Group(), probeG = new THREE.Group();
    scene.add(coneG); scene.add(mainG); scene.add(probeG);
    let coneKey = '';
    let hiddenSphere = false;
    const ref = {};
    const groundMat = new THREE.ShadowMaterial({ opacity: 0.2 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), groundMat);
    ground.receiveShadow = true;
    scene.add(ground);

    function buildCone() {
      const s = state.sec;
      const key = [s.alphaDeg, up.toFixed(6), lo.toFixed(6), colorVer].join('|');
      if (key === coneKey) return;
      coneKey = key;
      clearGroup(coneG);
      const ta = Math.tan(s.alpha), cc = col('cs-cone');
      const back = new THREE.MeshPhysicalMaterial({ color: cc, transparent: true, opacity: isDark() ? 0.2 : 0.15, side: THREE.BackSide, depthWrite: false, roughness: 0.55, metalness: 0 });
      const front = new THREE.MeshPhysicalMaterial({ color: cc, transparent: true, opacity: isDark() ? 0.17 : 0.13, side: THREE.FrontSide, depthWrite: false, roughness: 0.25, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.2 });
      [[up, 1], [lo, -1]].forEach(function (n) {
        const h = n[0], sg = n[1];
        const prof = sg > 0 ? [new THREE.Vector2(0, 0), new THREE.Vector2(h * ta, h)] : [new THREE.Vector2(h * ta, -h), new THREE.Vector2(0, 0)];
        const geo = new THREE.LatheGeometry(prof, 160);
        geo.rotateX(Math.PI / 2); // 旋轉軸從 y 轉到 z
        const mb = new THREE.Mesh(geo, back); mb.renderOrder = 1; coneG.add(mb);
        const mf = new THREE.Mesh(geo, front); mf.renderOrder = 6; coneG.add(mf);
      });
      // 母線（淡）與錐口
      const gen = [];
      for (let i = 0; i < 18; i++) {
        const a = i / 18 * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        gen.push(new THREE.Vector3(0, 0, 0), new THREE.Vector3(up * ta * ca, up * ta * sa, up));
        gen.push(new THREE.Vector3(0, 0, 0), new THREE.Vector3(lo * ta * ca, lo * ta * sa, -lo));
      }
      const gl = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(gen),
        new THREE.LineBasicMaterial({ color: cc, transparent: true, opacity: isDark() ? 0.22 : 0.17, depthWrite: false }));
      gl.renderOrder = 7;
      coneG.add(gl);
      [up, -lo].forEach(function (z) {
        const r = Math.abs(z) * ta, pts = [];
        for (let i = 0; i <= 160; i++) { const a = i / 160 * Math.PI * 2; pts.push(new THREE.Vector3(r * Math.cos(a), r * Math.sin(a), z)); }
        coneG.add(lineObj(pts, cc, isDark() ? 0.8 : 0.7, null, 7));
      });
      // 軸（虛線）
      coneG.add(lineObj([new THREE.Vector3(0, 0, -lo * 1.06), new THREE.Vector3(0, 0, up * 1.06)], col('muted'), 0.8, [fitR * 0.03, fitR * 0.022], 8));
    }

    function buildMain() {
      clearGroup(mainG);
      const s = state.sec, sh = state.show;
      const u = V3(s.u), w = V3(s.w), m = V3(s.m);
      const rc = planeRect(s);
      ref.rect = rc;
      const P = function (x, y) { return V3(CC.toSpace(s, x, y)); };

      // ---- 切平面：半透明金色矩形、外框與淡格線（格線對齊曲線的中心 O，與 2D 右圖相同） ----
      const pw = rc.x1 - rc.x0, ph = rc.y1 - rc.y0;
      const pc = P((rc.x0 + rc.x1) / 2, (rc.y0 + rc.y1) / 2);
      const pm = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), new THREE.MeshStandardMaterial({
        color: col('cs-plane'), transparent: true, opacity: isDark() ? 0.2 : 0.17, side: THREE.DoubleSide, depthWrite: false, roughness: 0.6, metalness: 0
      }));
      pm.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(u, w, m));
      pm.position.copy(pc);
      pm.renderOrder = 4;
      mainG.add(pm);
      const corners = [P(rc.x0, rc.y0), P(rc.x1, rc.y0), P(rc.x1, rc.y1), P(rc.x0, rc.y1), P(rc.x0, rc.y0)];
      mainG.add(lineObj(corners, col('cs-plane'), 0.95, null, 9));
      const span = Math.max(pw, ph), steps = [0.5, 1, 2, 5, 10];
      let st = steps[steps.length - 1];
      for (let i = 0; i < steps.length; i++) if (span / steps[i] <= 14) { st = steps[i]; break; }
      const gp = [];
      for (let x = Math.ceil(rc.x0 / st) * st; x <= rc.x1; x += st) gp.push(P(x, rc.y0), P(x, rc.y1));
      for (let y = Math.ceil(rc.y0 / st) * st; y <= rc.y1; y += st) gp.push(P(rc.x0, y), P(rc.x1, y));
      const gridL = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(gp),
        new THREE.LineBasicMaterial({ color: col('cs-plane'), transparent: true, opacity: isDark() ? 0.2 : 0.16, depthWrite: false }));
      gridL.renderOrder = 5;
      mainG.add(gridL);
      ref.gridStep = st;

      // ---- 切口（亮色管子） ----
      const curveMat = new THREE.MeshStandardMaterial({ color: col('cs-curve'), emissive: col('cs-curve'), emissiveIntensity: isDark() ? 0.55 : 0.35, roughness: 0.3, metalness: 0 });
      if (s.type === 'point') {
        const b = ball(new THREE.Vector3(0, 0, 0), ballR * 1.1, col('cs-curve'), 0.6);
        mainG.add(b);
      } else {
        curvePolys(s).forEach(function (pl) {
          if (pl.length < 2) return;
          const pts = pl.map(function (p) { return P(p[0], p[1]); });
          const closed = (s.type === 'ellipse' || s.type === 'circle') && pts.length > 60 && pts[0].distanceTo(pts[pts.length - 1]) < 1e-6 * fitR + 1e-9;
          if (closed) pts.pop();
          const curve = new THREE.CatmullRomCurve3(pts, closed, 'centripetal');
          const geo = new THREE.TubeGeometry(curve, Math.min(1600, Math.max(8, pts.length * 2)), tubeR * 1.25, 10, closed);
          const tm = new THREE.Mesh(geo, curveMat);
          tm.castShadow = true;
          tm.renderOrder = 2;
          mainG.add(tm);
        });
      }

      // ---- 丹德林球、相切圓 ----
      hiddenSphere = false;
      const fits = function (S) { return S.zc + S.r <= up * 1.001 && S.zc - S.r >= -lo * 1.001; };
      s.spheres.forEach(function (S, i) {
        if (!fits(S)) { hiddenSphere = true; return; }
        if (!sh.spheres) return;
        const sc = col('cs-sphere');
        const sm = new THREE.Mesh(new THREE.SphereGeometry(S.r, 72, 48), new THREE.MeshPhysicalMaterial({
          color: sc, transparent: true, opacity: isDark() ? 0.42 : 0.4, roughness: 0.14, metalness: 0,
          clearcoat: 0.6, clearcoatRoughness: 0.1, envMapIntensity: 0.75, depthWrite: false, side: THREE.FrontSide
        }));
        sm.position.set(0, 0, S.zc);
        sm.castShadow = true;
        sm.renderOrder = 3;
        mainG.add(sm);
        // 相切圓：球與圓錐沿著這個水平圓相切
        const ring = new THREE.Mesh(new THREE.TorusGeometry(S.ringR, tubeR * 0.85, 10, 160), new THREE.MeshStandardMaterial({
          color: sc, emissive: sc, emissiveIntensity: isDark() ? 0.45 : 0.25, roughness: 0.35, metalness: 0
        }));
        ring.position.set(0, 0, S.ringZ);
        ring.castShadow = true;
        mainG.add(ring);
        // 相切圓所在的水平面（淡淡一片），它與切平面的交線就是準線
        if (sh.dir && S.dx != null) {
          const XD = CC.toSpace(s, S.dx, 0)[0];
          const xa = Math.min(-S.ringR, XD), xb = Math.max(S.ringR, XD);
          const yh = S.ringR * 1.35, ya = -yh, yb = yh; // 只畫相切圓附近的一條帶子，延伸到準線
          const hp = new THREE.Mesh(new THREE.PlaneGeometry(xb - xa, yb - ya), new THREE.MeshBasicMaterial({
            color: col('cs-dir'), transparent: true, opacity: isDark() ? 0.07 : 0.05, side: THREE.DoubleSide, depthWrite: false
          }));
          hp.position.set((xa + xb) / 2, (ya + yb) / 2, S.ringZ);
          hp.renderOrder = 4;
          mainG.add(hp);
          mainG.add(lineObj([new THREE.Vector3(XD > 0 ? S.ringR : -S.ringR, 0, S.ringZ), new THREE.Vector3(XD, 0, S.ringZ)], col('cs-dir'), 0.85, [fitR * 0.02, fitR * 0.015], 9));
        }
        void i;
      });

      // ---- 準線（在切平面上） ----
      if (sh.dir && !s.degenerate) {
        s.spheres.forEach(function (S) {
          if (S.dx == null || S.dx < rc.x0 - 1e-9 || S.dx > rc.x1 + 1e-9) return;
          mainG.add(lineObj([P(S.dx, rc.y0), P(S.dx, rc.y1)], col('cs-dir'), 0.95, [fitR * 0.028, fitR * 0.018], 9));
        });
      }
      // ---- 正焦弦、漸近線 ----
      if (sh.latus && !s.degenerate && s.family !== 'circle') {
        const fx = s.foci[0].x, hl = s.latus / 2;
        mainG.add(lineObj([P(fx, -hl), P(fx, hl)], col('cs-curve'), 0.9, [fitR * 0.012, fitR * 0.012], 9));
      }
      if (sh.asym && s.type === 'hyperbola') {
        [1, -1].forEach(function (sg) {
          // 漸近線 y′ = ±(b/a) x′，截在切平面的矩形內
          const k = sg * s.slope;
          let t0 = -Infinity, t1 = Infinity;
          const clip = function (p, d, a, b) {
            if (Math.abs(d) < 1e-12) return;
            let q0 = (a - p) / d, q1 = (b - p) / d;
            if (q0 > q1) { const t = q0; q0 = q1; q1 = t; }
            t0 = Math.max(t0, q0); t1 = Math.min(t1, q1);
          };
          clip(0, 1, rc.x0, rc.x1); clip(0, k, rc.y0, rc.y1);
          if (t1 > t0) mainG.add(lineObj([P(t0, k * t0), P(t1, k * t1)], col('muted'), 0.9, [fitR * 0.025, fitR * 0.018], 9));
        });
      }

      // ---- 焦點（球與切平面的切點）與頂點 V ----
      s.spheres.forEach(function (S, i) {
        if (s.family === 'circle' && i > 0) return;
        const cc = i ? col('neg') : col('pos');
        const fp = V3(S.focus3);
        mainG.add(ball(fp, ballR * 0.85, cc, 0.3));
        const name = s.family === 'circle' ? 'F' : s.family === 'parabola' ? 'F' : 'F_' + (i + 1);
        mainG.add(at(label(name, i ? C.neg : C.pos, { dir: [-1, -1] }), fp));
      });
      mainG.add(ball(new THREE.Vector3(0, 0, 0), ballR * 0.75, col('text'), 0.1));
      const vl = label('V', C.text, { dir: [-1, 0.2] });
      vl.position.set(0, 0, 0);
      mainG.add(vl);

      // ---- 地面陰影與光 ----
      const big = Math.max(up, lo) * Math.max(1, Math.tan(s.alpha)) + fitR;
      ground.geometry.dispose();
      ground.geometry = new THREE.PlaneGeometry(big * 6, big * 6);
      ground.position.set(0, 0, -lo - fitR * 0.015);
      groundMat.opacity = isDark() ? 0.22 : 0.12;
      const lc = new THREE.Vector3(0, 0, (up - lo) / 2);
      keyLight.position.copy(lc).add(new THREE.Vector3(0.18, -0.26, 1).normalize().multiplyScalar(big * 2.5));
      keyLight.target.position.copy(lc);
      const scam = keyLight.shadow.camera;
      scam.left = -big; scam.right = big; scam.top = big; scam.bottom = -big;
      scam.near = big * 0.2; scam.far = big * 5;
      scam.updateProjectionMatrix();
      fillLight.position.copy(fitC).add(new THREE.Vector3(-0.8, 0.5, 0.3).normalize().multiplyScalar(fitR * 3));
      fillLight.target.position.copy(fitC);
      hemi.intensity = isDark() ? 0.6 : 0.8;
    }

    function buildProbe() {
      clearGroup(probeG);
      ref.pBall = null;
      const s = state.sec, sh = state.show, M = B.measure();
      if (!M) return;
      const Pp = V3(M.P3);
      // P 到焦點：與焦點同色的細棒
      s.spheres.forEach(function (S, i) {
        if (s.family === 'circle' && i > 0) return;
        probeG.add(rod(Pp, V3(S.focus3), tubeR * 0.6, i ? col('neg') : col('pos')));
      });
      // P 到準線 1 的距離（在切平面上，垂直於準線）
      const S1 = s.spheres[0];
      if (sh.dir && S1 && S1.dx != null) {
        probeG.add(lineObj([Pp, V3(CC.toSpace(s, S1.dx, M.y))], col('cs-dir'), 0.95, [fitR * 0.016, fitR * 0.012], 10));
      }
      // 過 P 的母線，與相切圓交於 K：PK 與 PF 是從 P 到同一顆球的兩條切線，一樣長
      if (sh.gen && Math.abs(M.P3[2]) > 1e-9) {
        const kz = M.P3[2];
        const e1 = Pp.clone().multiplyScalar(up / kz), e2 = Pp.clone().multiplyScalar(-lo / kz);
        const a = kz > 0 ? e1 : e2, b = kz > 0 ? e2 : e1;
        probeG.add(lineObj([b, a], col('text'), 0.55, [fitR * 0.014, fitR * 0.014], 10));
        M.K.forEach(function (K, i) {
          if (!K || !s.spheres[i]) return;
          const Kp = V3(K), cc = i ? col('neg') : col('pos');
          probeG.add(rod(Pp, Kp, tubeR * 0.6, cc, 0.6));
          probeG.add(ball(Kp, ballR * 0.6, col('cs-sphere'), 0.3));
          probeG.add(at(label('K_' + (i + 1), i ? C.neg : C.pos, { dir: [1, -0.6], size: 12 }), Kp));
        });
      }
      const pb = ball(Pp, ballR * 1.15, col('probe'), 0.35);
      ref.pBall = pb;
      probeG.add(pb);
      probeG.add(at(label('P', C.probe, { dir: [1, 1], gap: 8 }), Pp));
      applyHot();
    }
    function applyHot() {
      if (!ref.pBall) return;
      const k = hotP || dragP ? 1.3 : 1;
      ref.pBall.scale.setScalar(k);
      ref.pBall.material.emissiveIntensity = hotP || dragP ? 0.6 : 0.35;
    }

    // ---------- 資訊列 ----------
    function updateHud() {
      const s = state.sec, M = B.measure(), len = B.len, num = B.num;
      setHud('type', B.typeName(s.type));
      setHud('e', s.degenerate ? '' : 'e = ' + (s.family === 'circle' ? '0' : s.family === 'parabola' ? '1' : num(s.e, 3)));
      let inv = '';
      if (s.degenerate) inv = T('平面通過頂點 V：沒有丹德林球', 'The plane passes through the vertex V: no Dandelin spheres');
      else if (M) {
        if (s.family === 'ellipse') inv = 'PF<sub>1</sub> + PF<sub>2</sub> = ' + len(M.sum) + ' = 2a';
        else if (s.family === 'hyperbola') inv = '|PF<sub>1</sub> − PF<sub>2</sub>| = ' + len(M.diff) + ' = 2a';
        else if (s.family === 'parabola') inv = 'PF = ' + len(M.PF[0]) + T('，PD = ', ', PD = ') + len(M.PD[0]);
        else inv = 'PF = ' + len(M.PF[0]) + T(' = 半徑', ' = radius');
      }
      setHud('inv', inv);
      let tan = '';
      if (state.show.gen && M && !s.degenerate && M.PK.length) {
        tan = M.PK.map(function (pk, i) {
          if (s.family === 'circle' && i > 0) return '';
          const sub = s.spheres.length > 1 && s.family !== 'circle' ? '<sub>' + (i + 1) + '</sub>' : '';
          return 'PF' + sub + ' = ' + len(M.PF[i]) + T('、', ', ') + 'PK' + sub + ' = ' + len(pk);
        }).filter(Boolean).join(T('；', '; '));
      }
      setHud('tan', tan);
      setHud('note', hiddenSphere ? T('另一顆丹德林球離頂點太遠，畫面放不下', 'The other Dandelin sphere is too far from the vertex to fit in the view') : '');
    }

    // ---------- 視角 ----------
    let lastFitDist = 0, lastAspect = 0;
    function fitDistance() {
      const vf = camera.fov * Math.PI / 180;
      const hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
      return fitR / Math.sin(Math.min(vf, hf) / 2) * 1.0;
    }
    function defaultDir() {
      const el = (12 + 0.35 * state.beta) * Math.PI / 180, az = (narrow ? 232 : 222) * Math.PI / 180;
      return new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el));
    }
    function setLimits() {
      controls.minDistance = fitR * 0.3;
      controls.maxDistance = fitR * 6;
      camera.near = fitR * 0.01;
      camera.far = fitR * 40;
      camera.updateProjectionMatrix();
    }
    function resetCamera() {
      const d = fitDistance();
      controls.target.copy(fitC);
      camera.position.copy(fitC).addScaledVector(defaultDir(), d);
      lastFitDist = d;
      setLimits();
      controls.update();
      requestRender();
    }
    /** 圓錐的長度或畫面比例改變：保持視線方向與使用者的縮放比例，重新對準 */
    function refit() {
      const cur = camera.position.distanceTo(controls.target);
      const ratio = lastFitDist ? cur / lastFitDist : 1;
      const dir = camera.position.clone().sub(controls.target).normalize();
      const d = fitDistance();
      controls.target.copy(fitC);
      camera.position.copy(fitC).addScaledVector(dir, d * ratio);
      lastFitDist = d;
      setLimits();
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
      cw = w; ch = h;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      const nar = w < 560;
      if (nar !== narrow) { narrow = nar; rebuildAll(); }
      sizeLabels();
      if (Math.abs(camera.aspect - lastAspect) > 1e-3) {
        const first = !lastAspect;
        lastAspect = camera.aspect;
        if (first) resetCamera(); else refit();
      }
      renderNow();
    }
    function rebuildAll() {
      const changed = computeExtents();
      buildCone();
      buildMain();
      buildProbe();
      updateHud();
      if (changed && lastAspect) refit();
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

    const api = {
      active: true,
      rebuild: function () { rebuildAll(); requestRender(); },
      setShow: function () { buildMain(); buildProbe(); updateHud(); requestRender(); },
      updateP: function () { buildProbe(); updateHud(); requestRender(); },
      onTheme: function () {
        C = B.colors();
        colorVer++;
        buildEnv();
        Object.keys(hudLast).forEach(function (k) { delete hudLast[k]; });
        rebuildAll();
        requestRender();
      },
      resetCamera: function () { resetCamera(); },
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

    // 初始化
    buildEnv();
    const w0 = canvas.clientWidth, h0 = canvas.clientHeight;
    if (w0 && h0) {
      narrow = w0 < 560;
      cw = w0; ch = h0;
      renderer.setSize(cw, ch, false);
      camera.aspect = cw / ch;
      camera.updateProjectionMatrix();
      lastAspect = camera.aspect;
    }
    rebuildAll();
    resetCamera();
    return api;
  }

  window.Conic3D = { create: create };
})();
