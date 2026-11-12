/*
 * earthquake-3d.js — 「地震波與震央定位」的 3D 立體檢視（three.js）
 *
 * 由 js/earthquake.js 在使用者按「3D 立體」時才載入（three.js 也是那時才以 import() 載入）；切回 2D 時整個釋放。
 * 用法：window.Quake3D.create({ THREE, OrbitControls }, 容器, bridge) → { active, frame, onShow, onTheme, resetCamera, busy, dispose }
 *
 * 幾何與時間全部來自 earthquake-core.js：bridge 交來與 2D 同一份狀態 S 與核心 Q（同一組參數、同一個時間）。
 *  模式一（1 單位 = 1 km；x 沿剖面、y 往畫面裡、z 向上；震源在 (0, 0, −h)）：
 *    P、S 波前是半徑 V·t 的球面；球面與剖面交成同樣半徑的圓，與地表交成半徑 √((Vt)² − h²) 的圓；
 *    表面波的圓半徑 V_R (t − h/V_S)。剖面上質點的位移 = Q.sectionDisp，放大方式與 2D 相同（bridge.vis）。
 *    地表起伏：沿剖面的地表位移（與 2D 地表線相同）繞震央展開；S 波的垂直分量在剖面兩側正負相反（同 2D），
 *    兩側之間依方位角 φ 以 cos φ 平滑銜接（示意）。
 *  模式二（1 單位 = 1 km；x 向東、y 向北；地殼依比例、深度沒有放大）：
 *    測站量到的震源距離 d = kΔt 是以測站為球心的半球；兩個半球交成直立的半圓，它在地表的弦就是 Q.commonChord；
 *    估計的震源 = Q.locate 的 (x, y, h)；真實震源只在按「顯示真實震央」後才畫。
 *  模式三（1 單位 = 100 km；地心在原點、震源在 +z 的地表；切面在 y = 0）：
 *    射線 Q.traceRay（與 2D 同一束）、波前 Q.positionAt、陰影區 Q.shadowZonesExact；地球是球對稱的，
 *    所以陰影區在地表是以震央為中心的環帶（外表貼圖的縱向座標就是角距 Δ）。
 */
(function () {
  'use strict';
  const TAU = Math.PI * 2;
  const FONT = 'system-ui, -apple-system, "Segoe UI", "Noto Sans TC", "PingFang TC", sans-serif';
  const RES = 3;     // 標籤畫布的解析度倍數
  const K3 = 0.01;   // 模式三：1 場景單位 = 100 km

  function create(lib, host, B) {
    const THREE = lib.THREE;
    const Q = B.Q, T = B.T, D = B.D, S = B.S, E = B.E;
    const alpha = D.alpha, shade = D.shade, mix = D.mix;
    const clamp = function (x, a, b) { return Math.max(a, Math.min(b, x)); };
    let C = B.colors();

    // ---------- 畫布、HUD ----------
    const wrap = document.createElement('div');
    wrap.className = 'eq3-wrap';
    const canvas = document.createElement('canvas');
    wrap.appendChild(canvas);
    const hud = document.createElement('div');
    hud.className = 'eq3-hud';
    hud.setAttribute('aria-hidden', 'true');
    hud.innerHTML = '<div class="tl"><span data-k="t"></span><span class="m" data-k="t2"></span></div>' +
      '<div class="tr"><span data-k="r1"></span><span class="m" data-k="r2"></span></div>' +
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
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.localClippingEnabled = true;
    const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1.5, 0.5, 5000);
    camera.up.set(0, 0, 1);
    camera.position.set(0, -200, 120);

    let cur = null, modeName = '';
    let cw = 300, ch = 200, narrow = false, colorVer = 0;
    const V = function (x, y, z) { return new THREE.Vector3(x, y, z); };
    const EX = V(1, 0, 0), EY = V(0, 1, 0), EZ = V(0, 0, 1);
    const PL_Y0 = new THREE.Plane(V(0, 1, 0), 0), PL_Z0 = new THREE.Plane(V(0, 0, 1), 0);

    // ---------- 拖曳把手（必須在 OrbitControls 之前註冊，才能先攔下 pointerdown） ----------
    let controls = null, dragging = null, hoverId = null;
    const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2(), pv = new THREE.Vector3();
    function pickHandle(ev) {
      if (!cur || !cur.handles) return null;
      const r = canvas.getBoundingClientRect();
      if (!r.width) return null;
      const mx = ev.clientX - r.left, my = ev.clientY - r.top, lim = ev.pointerType === 'mouse' ? 22 : 30;
      let best = null, bd = lim;
      cur.handles().forEach(function (h) {
        pv.copy(h.p).project(camera);
        if (pv.z > 1) return;
        const d = Math.hypot((pv.x + 1) / 2 * r.width - mx, (1 - pv.y) / 2 * r.height - my);
        if (d < bd) { bd = d; best = h; }
      });
      return best;
    }
    function planePoint(ev, plane) {
      const r = canvas.getBoundingClientRect();
      ndc.set((ev.clientX - r.left) / r.width * 2 - 1, 1 - (ev.clientY - r.top) / r.height * 2);
      raycaster.setFromCamera(ndc, camera);
      return raycaster.ray.intersectPlane(plane, new THREE.Vector3());
    }
    // 點一下（按下到放開移動 < 6 px、不到 0.5 秒、只有一根手指）交給目前模式的 tap（模式二：在地圖上放震央標記）
    let tapStart = null;
    const downIds = new Set();
    canvas.addEventListener('pointerdown', function (ev) {
      downIds.add(ev.pointerId);
      tapStart = downIds.size === 1 && !(ev.pointerType === 'mouse' && ev.button !== 0) ? { x: ev.clientX, y: ev.clientY, t: performance.now(), id: ev.pointerId } : null;
    }, true);
    canvas.addEventListener('pointerup', function (ev) {
      downIds.delete(ev.pointerId);
      const ts = tapStart;
      tapStart = null;
      if (!ts || ts.id !== ev.pointerId || dragging || !cur || !cur.tap) return;
      if (Math.hypot(ev.clientX - ts.x, ev.clientY - ts.y) > 6 || performance.now() - ts.t > 500) return;
      if (cur.tap(ev)) B.request();
    }, true);
    canvas.addEventListener('pointercancel', function (ev) { downIds.delete(ev.pointerId); tapStart = null; }, true);
    canvas.addEventListener('pointerdown', function (ev) {
      if (ev.pointerType === 'mouse' && ev.button !== 0) return;
      const h = pickHandle(ev);
      if (!h) return;
      tapStart = null; // 抓到把手就是拖曳，不是點地圖
      ev.stopImmediatePropagation(); // 不讓 OrbitControls 開始旋轉
      ev.preventDefault();
      dragging = h;
      if (controls) controls.enabled = false;
      try { canvas.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
      canvas.style.cursor = 'grabbing';
      B.request();
    });
    canvas.addEventListener('pointermove', function (ev) {
      if (dragging) {
        const p = planePoint(ev, dragging.plane);
        if (p) dragging.move(p);
        return;
      }
      if (ev.pointerType !== 'mouse' || ev.buttons) return;
      const h = pickHandle(ev), id = h ? h.id : null;
      if (id !== hoverId) { hoverId = id; canvas.style.cursor = h ? 'pointer' : ''; B.request(); }
    });
    function endDrag() {
      if (!dragging) return;
      const h = dragging;
      dragging = null;
      if (controls) controls.enabled = true;
      canvas.style.cursor = '';
      h.end();
    }
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('lostpointercapture', endDrag);
    canvas.addEventListener('pointerleave', function () { if (!dragging && hoverId) { hoverId = null; canvas.style.cursor = ''; B.request(); } });
    function isHot(id) { return dragging ? dragging.id === id : hoverId === id; }

    controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.rotateSpeed = 0.8;
    controls.enablePan = false;

    // ---------- 燈光、接陰影的地板 ----------
    const hemi = new THREE.HemisphereLight(0xffffff, 0x6f6658, 1.15);
    hemi.position.set(0, 0, 1);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 2.0);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0005;
    scene.add(sun);
    scene.add(sun.target);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.2 }));
    floor.receiveShadow = true;
    scene.add(floor);

    // ---------- 共用工具 ----------
    const col = function (c) { return new THREE.Color(c || '#888888'); };
    function rnd(seed) { let s = seed; return function () { s = (s * 16807) % 2147483647; return s / 2147483647; }; }
    function plane(nx, ny, nz, c) { return new THREE.Plane(V(nx, ny, nz), c); }
    function disposeObject(obj) {
      obj.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) {
            ['map', 'emissiveMap', 'alphaMap'].forEach(function (k) { if (m[k] && !m[k].userData.shared) m[k].dispose(); });
            m.dispose();
          });
        }
      });
    }
    function canvasTex(c, shared) {
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = maxAniso;
      if (shared) t.userData.shared = true;
      return t;
    }
    const glowTex = (function () {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const g = c.getContext('2d');
      const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.35, 'rgba(255,255,255,0.4)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 128, 128);
      return canvasTex(c, true);
    })();
    // 波前上的小光點：實心的圓心＋柔和的光暈（光暈只在圓心外側，不把點畫大）
    const dotTex = (function () {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d');
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.3, 'rgba(255,255,255,1)');
      gr.addColorStop(0.38, 'rgba(255,255,255,0.35)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 64, 64);
      return canvasTex(c, true);
    })();
    function basicMat(color, opacity, clip, extra) {
      return new THREE.MeshBasicMaterial(Object.assign({
        color: col(color), transparent: opacity < 1, opacity: opacity, depthWrite: false, side: THREE.DoubleSide,
        toneMapped: false, clippingPlanes: clip || null
      }, extra || {}));
    }
    function dashLine(color, opacity, dash, gap, n) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((n || 2) * 3), 3));
      const mat = dash
        ? new THREE.LineDashedMaterial({ color: col(color), transparent: true, opacity: opacity, dashSize: dash, gapSize: gap, depthWrite: false, toneMapped: false })
        : new THREE.LineBasicMaterial({ color: col(color), transparent: true, opacity: opacity, depthWrite: false, toneMapped: false });
      const l = new THREE.Line(g, mat);
      l.frustumCulled = false;
      l.renderOrder = 9;
      return l;
    }
    function setLine(l, pts) {
      const a = l.geometry.attributes.position.array;
      pts.forEach(function (p, i) { a[3 * i] = p.x; a[3 * i + 1] = p.y; a[3 * i + 2] = p.z; });
      l.geometry.attributes.position.needsUpdate = true;
      if (l.material.isLineDashedMaterial) l.computeLineDistances();
    }
    /** 寬度固定（世界單位）的圓環帶，每次用 setRing 更新 */
    function ringStrip(n, mat, order) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((n + 1) * 6), 3).setUsage(THREE.DynamicDrawUsage));
      const idx = [];
      for (let i = 0; i < n; i++) { const a = 2 * i; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      g.setIndex(idx);
      const m = new THREE.Mesh(g, mat);
      m.frustumCulled = false;
      m.renderOrder = order || 7;
      m.userData.n = n;
      return m;
    }
    /** 圓心 c、平面基底 e1、e2、半徑 r、寬度 w、角度 a0–a1；zf(x, y) 給了就讓圓貼著地形（z = zf + off） */
    function setRing(m, c, e1, e2, r, w, a0, a1, zf, off) {
      const n = m.userData.n, pos = m.geometry.attributes.position.array;
      if (a0 == null) { a0 = 0; a1 = TAU; }
      const ri = Math.max(0, r - w / 2), ro = r + w / 2;
      for (let i = 0; i <= n; i++) {
        const a = a0 + (a1 - a0) * i / n, cs = Math.cos(a), sn = Math.sin(a);
        for (let k = 0; k < 2; k++) {
          const rr = k ? ro : ri, j = (2 * i + k) * 3;
          const x = c.x + rr * (cs * e1.x + sn * e2.x), y = c.y + rr * (cs * e1.y + sn * e2.y);
          pos[j] = x; pos[j + 1] = y;
          pos[j + 2] = zf ? zf(x, y) + off : c.z + rr * (cs * e1.z + sn * e2.z);
        }
      }
      m.geometry.attributes.position.needsUpdate = true;
      m.visible = r > 0.01;
    }
    function fxPool(n, rotX) {
      const geo = new THREE.RingGeometry(0.8, 1, 64);
      if (rotX) geo.rotateX(rotX);
      const arr = [];
      for (let i = 0; i < n; i++) {
        const m = new THREE.Mesh(geo, basicMat('#ffffff', 0.8));
        m.visible = false;
        m.renderOrder = 12;
        arr.push(m);
      }
      return arr;
    }
    function showFx(pool, list, now, place, r0, r1) {
      pool.forEach(function (m, i) {
        const f = list[i];
        if (!f) { m.visible = false; return; }
        const u = clamp((now - f.t0) / f.dur, 0, 1);
        m.visible = u < 1;
        m.material.color.set(f.color);
        m.material.opacity = 0.9 * (1 - u);
        m.scale.setScalar(r0 + (r1 - r0) * u);
        place(m, f);
      });
    }
    /** 五角星（2D 的震源符號）擠出成立體，平放在 xz 平面、面向 −y */
    function starMesh(r, color) {
      const sh = new THREE.Shape();
      for (let i = 0; i < 10; i++) {
        const a = Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
        if (i) sh.lineTo(rr * Math.cos(a), rr * Math.sin(a)); else sh.moveTo(rr * Math.cos(a), rr * Math.sin(a));
      }
      sh.closePath();
      const geo = new THREE.ExtrudeGeometry(sh, { depth: r * 0.32, bevelEnabled: true, bevelThickness: r * 0.1, bevelSize: r * 0.08, bevelSegments: 2 });
      geo.rotateX(Math.PI / 2);
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: col(color), emissive: col(color), emissiveIntensity: 0.45, roughness: 0.35, metalness: 0.05 }));
      m.castShadow = true;
      return m;
    }
    function glowSprite(color, size, opacity) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: col(color), transparent: true, opacity: opacity, depthWrite: false, toneMapped: false }));
      s.scale.setScalar(size);
      s.renderOrder = 10;
      return s;
    }

    // ---------- 文字標籤（Sprite，固定像素大小；以 2D 畫布繪製，可加小字下標） ----------
    function roundRect(g, x, y, w, h, r) {
      g.beginPath();
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
    }
    function drawLabel(sp) {
      const u = sp.userData;
      const size = (u.size || (narrow ? 11 : 12)) * RES;
      const fMain = (u.italic ? 'italic ' : '') + (u.weight || 600) + ' ' + size + 'px ' + FONT;
      const fSub = '600 ' + Math.round(size * 0.72) + 'px ' + FONT;
      const c = u.cv || (u.cv = document.createElement('canvas'));
      let g = c.getContext('2d');
      g.font = fMain;
      const tw = g.measureText(u.text).width;
      let sw = 0;
      if (u.sub) { g.font = fSub; sw = g.measureText(u.sub).width + RES; g.font = fMain; }
      const m = g.measureText('Hg');
      const fh = m.fontBoundingBoxAscent > 0 ? m.fontBoundingBoxAscent + m.fontBoundingBoxDescent : size * 1.25;
      const padX = (u.box ? 6 : 4) * RES, padY = (u.box ? 1.5 : 3) * RES;
      c.width = Math.ceil(tw + sw + 2 * padX);
      c.height = Math.ceil(fh + 2 * padY + (u.sub ? size * 0.2 : 0));
      g = c.getContext('2d');
      if (u.box) {
        roundRect(g, RES * 0.5, RES * 0.5, c.width - RES, c.height - RES, (c.height - RES) / 2);
        g.fillStyle = alpha(C['canvas-bg'], C.dark ? 0.84 : 0.88);
        g.fill();
        g.strokeStyle = alpha(u.color, C.dark ? 0.45 : 0.35);
        g.lineWidth = RES;
        g.stroke();
      }
      const yc = c.height / 2 - (u.sub ? size * 0.08 : 0);
      g.textBaseline = 'middle';
      g.textAlign = 'left';
      g.lineJoin = 'round';
      const put = function (text, x, y, font) {
        g.font = font;
        if (!u.box) { g.lineWidth = 4 * RES; g.strokeStyle = alpha(C['canvas-bg'], 0.92); g.strokeText(text, x, y); }
        g.fillStyle = u.color;
        g.fillText(text, x, y);
      };
      put(u.text, padX, yc, fMain);
      if (u.sub) put(u.sub, padX + tw + RES * 0.5, yc + size * 0.3, fSub);
      if (sp.material.map) sp.material.map.dispose();
      const tex = canvasTex(c);
      tex.minFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      sp.material.map = tex;
      sp.material.needsUpdate = true;
      u.lw = c.width / RES;
      u.lh = c.height / RES;
      fitLabel(sp);
    }
    /** opt：{ size, weight, italic, sub（小字下標）, box（預設 true）, prio（2 主要、1 次要、0 最次要）, dir（螢幕方向，y 向上）, wdir（世界方向）, gap } */
    function label(text, color, opt) {
      opt = opt || {};
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false, toneMapped: false }));
      const box = opt.box !== false;
      Object.assign(sp.userData, {
        isLabel: true, text: text, color: color, sub: opt.sub || '', size: opt.size, weight: opt.weight, italic: !!opt.italic, box: box,
        prio: opt.prio != null ? opt.prio : box ? 2 : 1, dir: opt.dir || [0, 1], wdir: opt.wdir || null, gap: opt.gap == null ? 8 : opt.gap
      });
      sp.renderOrder = 30;
      drawLabel(sp);
      return sp;
    }
    function setLabel(sp, text, color) {
      const u = sp.userData;
      if (u.text === text && (!color || u.color === color)) return;
      u.text = text;
      if (color) u.color = color;
      drawLabel(sp);
    }
    function fitLabel(sp) {
      const k = 2 * Math.tan(camera.fov * Math.PI / 360) / Math.max(1, ch);
      sp.scale.set(sp.userData.lw * k, sp.userData.lh * k, 1);
    }
    function sizeLabels() { scene.traverse(function (o) { if (o.userData && o.userData.isLabel) fitLabel(o); }); }
    function anchorLabel(sp, dx, dy, gap) {
      const L = Math.hypot(dx, dy);
      if (!(L > 1e-6)) { sp.center.set(0.5, 0.5); return; }
      dx /= L; dy /= L;
      const lw = sp.userData.lw, lh = sp.userData.lh;
      sp.center.set(0.5 - dx * (lw / 2 + gap) / lw, 0.5 - dy * (lh / 2 + gap) / lh);
    }
    const lp = new THREE.Vector3(), cp = new THREE.Vector3(), cp2 = new THREE.Vector3();
    const labelsNow = [];
    let hudRects = [];
    function readHudRects() {
      const cr = canvas.getBoundingClientRect();
      hudRects = [];
      hud.querySelectorAll('span').forEach(function (e) {
        if (!e.textContent) return;
        const r = e.getBoundingClientRect();
        if (r.width) hudRects.push([r.left - cr.left, cr.bottom - r.bottom, r.width, r.height]);
      });
    }
    function overlaps(a, b) { return a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3]; }
    /** 標籤版面：靠近畫布邊緣的往內移；互相重疊（或壓到 HUD）時，優先保留重要的 */
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
        let dx = u.dir[0], dy = u.dir[1];
        if (u.wdir) {
          cp2.copy(lp).add(u.wdir).project(camera);
          dx = (cp2.x - cp.x) * cw; dy = (cp2.y - cp.y) * ch;
        }
        anchorLabel(sp, dx, dy, u.gap);
        let op = u.fade == null ? 1 : u.fade;
        if (cp.z > 1) op = 0;
        else {
          const px = (cp.x + 1) / 2 * cw, py = (cp.y + 1) / 2 * ch, lw = u.lw, lh = u.lh;
          if (px > -M && px < cw + M && py > -M && py < ch + M) {
            if (px - sp.center.x * lw < M) sp.center.x = (px - M) / lw;
            else if (px - sp.center.x * lw + lw > cw - M) sp.center.x = (px - (cw - M - lw)) / lw;
            if (py - sp.center.y * lh < M) sp.center.y = (py - M) / lh;
            else if (py - sp.center.y * lh + lh > ch - M) sp.center.y = (py - (ch - M - lh)) / lh;
          }
          const r = [px - sp.center.x * lw, py - sp.center.y * lh, lw, lh, u.prio];
          if (op > 0 && (taken.some(function (q) { return (q[4] > u.prio || (u.prio < 2 && q[4] === u.prio)) && overlaps(q, r); }) ||
              (u.prio < 2 && hudRects.some(function (q) { return overlaps(q, r); })))) op = 0;
          if (op > 0.05) taken.push(r);
        }
        if (sp.material.opacity !== op) sp.material.opacity = op;
      });
    }
    const hudLast = {};
    function setHud(k, txt, cls) {
      txt = txt || '';
      if (hudLast[k] !== txt) { hudLast[k] = txt; hudEl[k].textContent = txt; }
      if (cls !== undefined && hudLast[k + '#'] !== cls) { hudLast[k + '#'] = cls; hudEl[k].className = cls; }
    }

    // ---------- 共用貼圖 ----------
    /** 岩石：上淺下深的漸層＋細微的岩層紋理（固定亂數）；depthLines 給了就每隔一段畫一條深度虛線 */
    function rockTexture(w, h, light, dark, depthLines, seed) {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const g = c.getContext('2d');
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, light); gr.addColorStop(1, dark);
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
      const r = rnd(seed || 7);
      for (let i = 0; i < 34; i++) {
        const y = r() * h, amp = 2 + r() * 6, ph = r() * 6, len = 120 + r() * 240;
        g.strokeStyle = alpha(r() < 0.5 ? C.rock : C.text, (C.dark ? 0.035 : 0.03) + r() * 0.035);
        g.lineWidth = 1 + r() * 3;
        g.beginPath();
        for (let x = 0; x <= w; x += 12) { const yy = y + amp * Math.sin(x / len + ph); if (x) g.lineTo(x, yy); else g.moveTo(x, yy); }
        g.stroke();
      }
      for (let i = 0; i < w * h / 900; i++) { // 細小的顆粒
        g.fillStyle = alpha(r() < 0.5 ? C.text : C['canvas-bg'], 0.035 + r() * 0.04);
        g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
      }
      if (depthLines) {
        g.setLineDash([10, 10]);
        g.strokeStyle = alpha(C.text, C.dark ? 0.2 : 0.14);
        g.lineWidth = 2;
        depthLines.forEach(function (v) { g.beginPath(); g.moveTo(0, v * h); g.lineTo(w, v * h); g.stroke(); });
        g.setLineDash([]);
      }
      return canvasTex(c);
    }
    /** 側牆：沿 pts（頂邊的 [x, y]）往下到 z = −dep；頂邊的 z 可每幀更新（跟著地表起伏） */
    function wall(pts, dep, mat) {
      const n = pts.length, pos = new Float32Array(n * 6), uv = new Float32Array(n * 4), idx = [];
      let L = 0;
      const acc = [0];
      for (let i = 1; i < n; i++) { L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); acc.push(L); }
      for (let i = 0; i < n; i++) {
        pos.set([pts[i][0], pts[i][1], 0, pts[i][0], pts[i][1], -dep], i * 6);
        uv.set([acc[i] / L, 1, acc[i] / L, 0], i * 4);
        if (i < n - 1) { const a = 2 * i; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat);
      m.userData.top = pts;
      return m;
    }
    function updWall(m, zf) {
      const pos = m.geometry.attributes.position.array, pts = m.userData.top;
      for (let i = 0; i < pts.length; i++) pos[i * 6 + 2] = zf(pts[i][0], pts[i][1]);
      m.geometry.attributes.position.needsUpdate = true;
    }
    function boxEdges(x0, x1, y0, y1, z0, z1, color, opacity) {
      const p = [x0, y0, z0, x1, y0, z0, x1, y0, z0, x1, y1, z0, x1, y1, z0, x0, y1, z0, x0, y1, z0, x0, y0, z0,
        x0, y0, z1, x1, y0, z1, x1, y0, z1, x1, y1, z1, x1, y1, z1, x0, y1, z1, x0, y1, z1, x0, y0, z1,
        x0, y0, z0, x0, y0, z1, x1, y0, z0, x1, y0, z1, x1, y1, z0, x1, y1, z1, x0, y1, z0, x0, y1, z1];
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(p), 3));
      const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: col(color), transparent: true, opacity: opacity, depthWrite: false, toneMapped: false }));
      l.renderOrder = 6;
      return l;
    }

    // =====================================================================
    // 模式一：地殼剖塊、P 波與 S 波的球面波前、表面波
    // =====================================================================
    function build1() {
      const G = new THREE.Group();
      const X0 = B.grid1.x0, X1 = B.grid1.x1, DEP = B.grid1.depth, YB = 36, NX = 120, NY = 18;
      const cP = col(C.P), cS = col(C.S), cR = col(C.R);
      const cRock = col(C.dark ? mix(C.rock, C['canvas-bg'], 0.45) : shade(C.rock, -0.05));

      // 地表起伏：沿剖面的地表位移剖面（與 2D 地表線相同：−vis(u)·8 km × 0.8），繞震央展開
      const PMAX = 116, PST = 0.5, NP = Math.round(2 * PMAX / PST) + 1, prof = new Float32Array(NP);
      const prf = function (x) {
        const u = (clamp(x, -PMAX, PMAX) + PMAX) / PST, i = Math.min(NP - 2, Math.floor(u)), f = u - i;
        return prof[i] + (prof[i + 1] - prof[i]) * f;
      };
      const lift = function (x, y) {
        const r = Math.hypot(x, y);
        if (r < 1e-6) return prof[(NP - 1) / 2];
        const c = x / r; // S 波垂直分量在剖面兩側正負相反：兩側之間以 cos φ 平滑銜接
        return 0.5 * (1 + c) * prf(r) + 0.5 * (1 - c) * prf(-r);
      };

      // ---- 後半塊（實心）：前面是剖面（y = 0）、其餘三面與底面是岩石 ----
      const light = mix(C['canvas-bg'], C.rock, C.dark ? 0.12 : 0.16), dark = mix(C['canvas-bg'], C.rock, C.dark ? 0.26 : 0.32);
      const secTex = rockTexture(1200, 500, light, dark, [0.2, 0.4, 0.6, 0.8], 11);
      const sideTex = rockTexture(512, 256, mix(C['canvas-bg'], C.rock, C.dark ? 0.2 : 0.26), mix(C['canvas-bg'], C.rock, C.dark ? 0.32 : 0.42), null, 5);
      const secMat = new THREE.MeshStandardMaterial({ map: secTex, emissiveMap: secTex, emissive: 0xffffff, emissiveIntensity: C.dark ? 0.32 : 0.22, roughness: 0.92 });
      const sideMat = new THREE.MeshStandardMaterial({ map: sideTex, roughness: 0.95 });
      const xs = [], ys = [];
      for (let i = 0; i <= NX; i++) xs.push(X0 + (X1 - X0) * i / NX);
      for (let j = 0; j <= NY; j++) ys.push(YB * j / NY);
      const walls = [
        wall(xs.map(function (x) { return [x, 0]; }), DEP, secMat),
        wall(ys.map(function (y) { return [X1, y]; }), DEP, sideMat),
        wall(xs.slice().reverse().map(function (x) { return [x, YB]; }), DEP, sideMat),
        wall(ys.slice().reverse().map(function (y) { return [X0, y]; }), DEP, sideMat)
      ];
      walls.forEach(function (m) { m.castShadow = true; G.add(m); });
      const bottom = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0, YB), sideMat);
      bottom.rotation.x = Math.PI;
      bottom.position.set((X0 + X1) / 2, YB / 2, -DEP);
      G.add(bottom);

      // ---- 地表：貼圖上有以震央為中心、每 20 km 一圈的距離圈 ----
      const groundCol = mix(C['canvas-bg'], C['d-earth'], C.dark ? 0.22 : 0.2);
      const gTex = (function () {
        const W = 1440, H = Math.round(W * YB / (X1 - X0));
        const c = document.createElement('canvas');
        c.width = W; c.height = H;
        const g = c.getContext('2d');
        const px = function (x) { return (x - X0) / (X1 - X0) * W; }, s = W / (X1 - X0);
        const gr = g.createLinearGradient(0, H, 0, 0);
        gr.addColorStop(0, shade(groundCol, C.dark ? 0.04 : 0.03)); gr.addColorStop(1, shade(groundCol, C.dark ? -0.08 : -0.05));
        g.fillStyle = gr; g.fillRect(0, 0, W, H);
        const r = rnd(3);
        for (let i = 0; i < W * H / 500; i++) {
          g.fillStyle = alpha(r() < 0.55 ? C['d-earth'] : C.text, 0.03 + r() * 0.05);
          g.beginPath(); g.arc(r() * W, r() * H, 0.8 + r() * 2.2, 0, TAU); g.fill();
        }
        g.strokeStyle = alpha(C.text, C.dark ? 0.2 : 0.16);
        g.lineWidth = 2;
        g.setLineDash([9, 7]);
        for (let d = 20; d <= 120; d += 20) { g.beginPath(); g.arc(px(0), H, d * s, Math.PI, TAU); g.stroke(); }
        g.setLineDash([]);
        g.font = '600 26px ' + FONT;
        g.fillStyle = alpha(C.text, C.dark ? 0.55 : 0.5);
        g.textBaseline = 'bottom';
        for (let d = 20; d <= 100; d += 20) g.fillText(d + ' km', px(d) + 6, H - 6);
        return canvasTex(c);
      })();
      const topGeo = new THREE.PlaneGeometry(X1 - X0, YB, NX, NY);
      topGeo.translate((X0 + X1) / 2, YB / 2, 0);
      const top = new THREE.Mesh(topGeo, new THREE.MeshStandardMaterial({ map: gTex, roughness: 0.88 }));
      top.receiveShadow = true;
      G.add(top);
      // ---- 前半塊切開：只留半透明的地表與虛線外框 ----
      const ghostGeo = new THREE.PlaneGeometry(X1 - X0, YB, NX, NY);
      ghostGeo.translate((X0 + X1) / 2, -YB / 2, 0);
      const ghost = new THREE.Mesh(ghostGeo, new THREE.MeshStandardMaterial({ color: col(groundCol), transparent: true, opacity: C.dark ? 0.2 : 0.26, depthWrite: false, side: THREE.DoubleSide, roughness: 0.85 }));
      ghost.renderOrder = 4;
      G.add(ghost);
      const gl = boxEdges(X0, X1, -YB, 0, -DEP, 0, C.text, C.dark ? 0.22 : 0.18);
      G.add(gl);
      function updTop(geo) {
        const a = geo.attributes.position.array;
        for (let i = 0; i < a.length; i += 3) a[i + 2] = lift(a[i], a[i + 1]);
        geo.attributes.position.needsUpdate = true;
        geo.computeVertexNormals();
      }

      // ---- 波前：P、S 的球面（只畫在切開的前半塊，看得到球面向觀看者鼓出） ----
      const clipGhost = [plane(1, 0, 0, -X0), plane(-1, 0, 0, X1), plane(0, 0, 1, DEP), plane(0, 0, -1, 0.2), plane(0, -1, 0, 0), plane(0, 1, 0, YB)];
      const sphGeo = new THREE.SphereGeometry(1, 96, 48);
      function shell(color) {
        const m = new THREE.Mesh(sphGeo, new THREE.MeshStandardMaterial({
          color: col(color), emissive: col(color), emissiveIntensity: 0.4, roughness: 0.3, metalness: 0,
          transparent: true, opacity: C.dark ? 0.2 : 0.17, side: THREE.DoubleSide, depthWrite: false, clippingPlanes: clipGhost
        }));
        m.renderOrder = 3;
        G.add(m);
        return m;
      }
      const shP = shell(C.P), shS = shell(C.S);
      // 球面與剖面的交線（圓）：一條清楚的線＋內側一圈淡淡的光帶（剛被波經過的岩石）
      const clipSec = [plane(1, 0, 0, -X0), plane(-1, 0, 0, X1), plane(0, 0, 1, DEP), plane(0, 0, -1, 0)];
      function secRing(color, op, order) { const m = ringStrip(200, basicMat(color, op, clipSec), order); G.add(m); return m; }
      const secPg = secRing(C.P, C.dark ? 0.28 : 0.22, 5), secSg = secRing(C.S, C.dark ? 0.28 : 0.22, 5);
      const secP = secRing(C.P, 0.95, 6), secS = secRing(C.S, 0.95, 6);
      // 球面與地表的交線：後半塊實線、前半塊（切開的部分）淡一點
      const clipBack = [plane(1, 0, 0, -X0), plane(-1, 0, 0, X1), plane(0, 1, 0, 0), plane(0, -1, 0, YB)];
      const clipFront = [plane(1, 0, 0, -X0), plane(-1, 0, 0, X1), plane(0, -1, 0, 0), plane(0, 1, 0, YB)];
      function groundRing(color) {
        const a = ringStrip(220, basicMat(color, 0.95, clipBack), 8);
        const b = new THREE.Mesh(a.geometry, basicMat(color, 0.5, clipFront));
        b.frustumCulled = false;
        b.renderOrder = 8;
        G.add(a, b);
        return [a, b];
      }
      const grP = groundRing(C.P), grS = groundRing(C.S), grR = groundRing(C.R);

      // ---- 剖面上的質點（與 2D 同一組格點）與位移的拖尾 ----
      const pts = [];
      for (let d = 4; d < DEP; d += 8) for (let x = X0 + 4; x < X1; x += 8) pts.push([x, d]);
      const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.72, 14, 10), new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0 }), pts.length);
      dots.renderOrder = 2;
      G.add(dots);
      const trails = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false }));
      trails.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts.length * 6), 3));
      trails.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pts.length * 6), 3));
      trails.frustumCulled = false;
      G.add(trails);
      const mtx = new THREE.Matrix4();

      // ---- 震源、震央、地震儀、射線 ----
      const star = starMesh(1.6, C.pos);
      const glow = glowSprite(C.pos, 7, C.dark ? 0.5 : 0.38);
      G.add(star, glow);
      const vline = dashLine(C.text, 0.55, 0.9, 0.9);
      const rayL = dashLine(C.text, 0.6, 1.4, 1.1);
      G.add(vline, rayL);
      const epi = new THREE.Mesh(new THREE.RingGeometry(0.7, 1.3, 40), basicMat(C.text, 0.85));
      epi.renderOrder = 9;
      G.add(epi);
      const hutMat = new THREE.MeshStandardMaterial({ color: col(mix(C.text, C['canvas-bg'], C.dark ? 0.45 : 0.3)), roughness: 0.55, metalness: 0.15, emissive: col(C.accent), emissiveIntensity: 0 });
      const hut = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.6, 2.4), hutMat);
      hut.castShadow = true;
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.4, 16), new THREE.MeshStandardMaterial({ color: col(C.surface), roughness: 0.4 }));
      drum.rotation.x = Math.PI / 2;
      drum.position.set(0, -1.32, 0.2);
      hut.add(drum);
      G.add(hut);
      const fx = fxPool(3);
      fx.forEach(function (m) { G.add(m); });

      // ---- 標籤 ----
      const lbFocus = label('', C.text, { prio: 2, dir: [1, 0], gap: 12 });
      const lbEpi = label(T('震央', 'Epicenter'), C.text, { prio: 2, dir: [0, 1], gap: 8 });
      const lbSt = label(T('地震儀', 'Seismometer'), C.text, { prio: 1, dir: [0, 1], gap: 10, size: narrow ? 10.5 : 11.5 });
      const lbR = label('', alpha(C.text, 0.9), { prio: 1, box: false, italic: true, dir: [1, -0.6], gap: 4, size: narrow ? 10.5 : 11.5 });
      const lbP = label('P', C.P, { prio: 2, weight: 700, dir: [0, 0], gap: 0 });
      const lbS = label('S', C.S, { prio: 2, weight: 700, dir: [0, 0], gap: 0 });
      const lbSurf = label(T('表面波', 'Surface'), C.R, { prio: 1, weight: 700, dir: [0, 1], gap: 6, size: narrow ? 10.5 : 11.5 });
      G.add(lbFocus, lbEpi, lbSt, lbR, lbP, lbS, lbSurf);
      [0, 10, 20, 30, 40, 50].forEach(function (d) {
        const l = label(d === 50 ? '50 km' : String(d), alpha(C.text, 0.7), { prio: 0, box: false, dir: [-1, 0], gap: 4, size: 10.5 });
        l.position.set(X0, -0.1, -d);
        G.add(l);
      });

      let heavy = '';
      function update(now) {
        const w = S.w1, o = B.w1Params(), t = w.t, h = w.h, sx = w.x, vr = B.vr1();
        const key = [t, h, w.vp, w.vs, vr, colorVer].join('|');
        if (key !== heavy) {
          heavy = key;
          for (let i = 0; i < NP; i++) prof[i] = -B.vis(Q.sectionDisp(-PMAX + i * PST, 0, t, o))[1] * 8 * 0.8;
          updTop(topGeo); updTop(ghostGeo);
          walls.forEach(function (m) { updWall(m, lift); });
          const tp = trails.geometry.attributes.position.array, tc = trails.geometry.attributes.color.array;
          pts.forEach(function (q, k) {
            const u = Q.sectionDisp(q[0], q[1], t, o), v = B.vis(u);
            const mP = Math.hypot(u.P.ux, u.P.uy), mS = Math.hypot(u.S.ux, u.S.uy), mR = Math.hypot(u.R.ux, u.R.uy);
            const mm = Math.max(mP, mS, mR), moving = mm > 0.04;
            const cc = moving ? (mm === mP ? cP : mm === mS ? cS : cR) : cRock;
            const qx = q[0] + v[0] * 8, qz = -q[1] - v[1] * 8;
            mtx.makeTranslation(qx, -0.75, qz);
            dots.setMatrixAt(k, mtx);
            dots.setColorAt(k, cc);
            tp.set([q[0], -0.75, -q[1], moving ? qx : q[0], -0.75, moving ? qz : -q[1]], k * 6);
            tc.set([cc.r, cc.g, cc.b, cc.r, cc.g, cc.b], k * 6);
          });
          dots.instanceMatrix.needsUpdate = true;
          if (dots.instanceColor) dots.instanceColor.needsUpdate = true;
          trails.geometry.attributes.position.needsUpdate = true;
          trails.geometry.attributes.color.needsUpdate = true;
        }
        dots.visible = trails.visible = w.show.dots;

        // 波前
        const fr = w.show.fronts, rP = w.vp * t, rS = w.vs * t, tR0 = h / w.vs;
        [[shP, rP], [shS, rS]].forEach(function (q) {
          q[0].visible = fr && q[1] > 0.05;
          if (q[0].visible) { q[0].scale.setScalar(q[1]); q[0].position.set(0, 0, -h); }
        });
        const fc = V(0, -0.08, -h);
        [[secP, secPg, rP], [secS, secSg, rS]].forEach(function (q) {
          if (!fr || q[2] <= 0.05) { q[0].visible = q[1].visible = false; return; }
          setRing(q[0], fc, EX, EZ, q[2], 0.42);
          setRing(q[1], fc, EX, EZ, Math.max(0.2, q[2] - 0.9), Math.min(1.8, q[2] * 2));
        });
        [[grP, rP > h ? Math.sqrt(rP * rP - h * h) : 0], [grS, rS > h ? Math.sqrt(rS * rS - h * h) : 0], [grR, t > tR0 ? vr * (t - tR0) : 0]].forEach(function (q) {
          if (!fr || q[1] <= 0.05) { q[0][0].visible = q[0][1].visible = false; return; }
          setRing(q[0][0], fc, EX, EY, q[1], 0.6, 0, TAU, lift, 0.3);
          q[0][1].visible = q[0][0].visible;
        });

        // 震源、震央、地震儀、射線
        const hotF = isHot('focus'), hotS = isHot('st1'), z0 = lift(0, 0), zs = lift(sx, 0);
        star.position.set(0, -0.05, -h);
        star.material.emissiveIntensity = hotF ? 0.95 : 0.45;
        glow.position.set(0, -1.2, -h);
        glow.scale.setScalar(hotF ? 10 : 7);
        epi.position.set(0, 0, z0 + 0.14);
        setLine(vline, [V(0, -0.4, -h + 1.6), V(0, -0.4, z0)]);
        hut.position.set(sx, 0, zs + 1.2);
        hutMat.emissiveIntensity = hotS ? 0.55 : 0;
        rayL.visible = w.show.ray;
        setLine(rayL, [V(0, -0.5, -h), V(sx, -0.5, zs)]);

        // 標籤
        lbFocus.position.set(0, -0.6, -h);
        setLabel(lbFocus, T('震源', 'Focus') + ' ' + B.num(h, h % 1 ? 1 : 0) + ' km');
        lbEpi.position.set(0, 0, z0 + 0.6);
        lbSt.position.set(sx, 0, zs + 2.6);
        lbR.visible = w.show.ray && sx > 6;
        lbR.position.set(sx * 0.66, -0.5, -h + (zs + h) * 0.66);
        setLabel(lbR, 'R = ' + B.num(w.arr.R, 1) + ' km');
        [[lbP, rP, [225, 318, 250, 340, 352, 25]], [lbS, rS, [205, 300, 230, 330, 345, 15]]].forEach(function (q) {
          q[0].visible = false;
          if (!fr || q[1] < 1) return;
          for (let k = 0; k < q[2].length; k++) {
            const a = q[2][k] * Math.PI / 180, x = q[1] * Math.cos(a), z = -h + q[1] * Math.sin(a);
            if (z < -1.5 && z > -DEP + 3 && x > X0 + 2 && x < X1 - 2) { q[0].position.set(x, -0.3, z); q[0].visible = true; break; }
          }
        });
        const xr = vr * (t - tR0);
        lbSurf.visible = fr && t > tR0 && xr < X1 - 3 && xr > 8 && Math.abs(xr - sx) > 8;
        lbSurf.position.set(xr, 0, lift(xr, 0) + 0.6);

        showFx(fx, S.fx.filter(function (f) { return f.where === 'st1'; }), now, function (m) { m.position.set(sx, 0, zs + 0.35); }, 1.6, 7);

        setHud('t', 't = ' + B.num(t, 1) + ' s' + B.speed('waves'));
        setHud('t2', 'S−P = ' + B.num(w.arr.sp, 2) + ' s', 'm');
        setHud('r1', 'R = ' + B.num(w.arr.R, 1) + ' km');
        setHud('r2', 'P ' + B.num(w.arr.tP, 2) + ' s · S ' + B.num(w.arr.tS, 2) + ' s', 'm');
        setHud('note', T('依比例（km）；地表起伏與質點位移已放大（示意）', 'To scale (km); ground motion and particle displacements magnified (schematic)'));
      }
      return {
        group: G, update: update,
        aria: T('3D：一塊依比例的地殼，前半塊切開；P 波與 S 波的球面波前由震源向外擴張，地表的圓經過地震儀時就是到達時間。可拖曳旋轉、縮放，也可拖曳震源與地震儀。',
          '3D: a block of crust to scale with the front half cut away; spherical P and S wavefronts grow from the focus, and the ring on the ground reaches the seismometer at the arrival time. Drag to rotate, zoom, or drag the focus and the seismometer.'),
        size: [0.95, 0.56, 560],
        fit: { box: [X0, X1, -YB, YB, -DEP, 6], dir: V(-0.4, -1, 0.62), floorZ: -DEP - 0.3, sunDir: V(-0.55, -0.75, 1) },
        handles: function () {
          return [
            { id: 'focus', p: V(0, 0, -S.w1.h), plane: PL_Y0, move: function (p) { B.drag('focus', -p.z); }, end: function () { B.dragEnd('focus'); } },
            { id: 'st1', p: V(S.w1.x, 0, lift(S.w1.x, 0) + 1.2), plane: PL_Y0, move: function (p) { B.drag('station1', p.x); }, end: function () { B.dragEnd('station1'); } }
          ];
        }
      };
    }

    // =====================================================================
    // 模式二：臺灣地圖下的地殼、各測站的距離半球、共同弦與震源
    // =====================================================================
    function build2() {
      const G = new THREE.Group();
      const M = B.map, DEP = 80, W = M.x1 - M.x0, H = M.y1 - M.y0, mx = (M.x0 + M.x1) / 2, my = (M.y0 + M.y1) / 2;
      const clipBlock = [plane(1, 0, 0, -M.x0), plane(-1, 0, 0, M.x1), plane(0, 1, 0, -M.y0), plane(0, -1, 0, M.y1), plane(0, 0, 1, DEP), plane(0, 0, -1, 0)];
      const clipMap = clipBlock.slice(0, 4);

      // ---- 地圖（半透明：看得到下面的地殼、半球與震源） ----
      const mapTex = (function () {
        const Wt = 1600, ss = Wt / W, Ht = Math.round(H * ss), kp = ss / 1.46; // kp：2D 的 1 px 在貼圖上是幾 px
        const c = document.createElement('canvas');
        c.width = Wt; c.height = Ht;
        const g = c.getContext('2d');
        const P = function (lon, lat) { const p = Q.toXY(lon, lat); return [(p.x - M.x0) * ss, (M.y1 - p.y) * ss]; };
        const sea = g.createLinearGradient(0, 0, Wt, Ht);
        sea.addColorStop(0, alpha(mix(C['canvas-bg'], C['b-ocean'], C.dark ? 0.2 : 0.1), 0.6));
        sea.addColorStop(1, alpha(mix(C['canvas-bg'], C['b-ocean'], C.dark ? 0.32 : 0.2), 0.6));
        g.fillStyle = sea; g.fillRect(0, 0, Wt, Ht);
        const coast = function (pts) { g.beginPath(); pts.forEach(function (q, i) { const p = P(q[0], q[1]); if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); }); g.closePath(); };
        g.lineJoin = 'round';
        [[16, 0.1], [8, 0.12]].forEach(function (q) {
          coast(Q.TAIWAN); g.strokeStyle = alpha(C['b-wave'], C.dark ? q[1] * 1.3 : q[1]); g.lineWidth = q[0] * kp; g.stroke();
          coast(Q.PENGHU); g.stroke();
        });
        const land = mix(C['canvas-bg'], C['d-earth'], C.dark ? 0.2 : 0.16);
        const lg = g.createLinearGradient(0, 0, Wt * 0.7, Ht);
        lg.addColorStop(0, alpha(shade(land, C.dark ? 0.04 : 0.05), 0.86)); lg.addColorStop(1, alpha(shade(land, C.dark ? -0.1 : -0.05), 0.86));
        g.fillStyle = lg;
        coast(Q.TAIWAN); g.fill();
        coast(Q.PENGHU); g.fill();
        Q.ISLETS.forEach(function (it) { const p = P(it.lon, it.lat); g.beginPath(); g.ellipse(p[0], p[1], Math.max(3, it.r * ss), Math.max(2.4, it.r * 0.8 * ss), 0, 0, TAU); g.fill(); });
        g.save();
        coast(Q.TAIWAN); g.clip();
        const ridge = [[121.62, 24.85], [121.38, 24.45], [121.24, 24.05], [121.08, 23.6], [120.97, 23.15], [120.86, 22.65], [120.79, 22.2]];
        [[18, 0.1], [9, 0.12], [3.5, 0.14]].forEach(function (q) {
          g.beginPath(); ridge.forEach(function (r, i) { const p = P(r[0], r[1]); if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); });
          g.strokeStyle = alpha(C.rock, C.dark ? q[1] * 0.8 : q[1]); g.lineWidth = q[0] * 1.2 * ss; g.lineCap = 'round'; g.stroke();
        });
        g.restore();
        g.strokeStyle = shade(land, C.dark ? 0.3 : -0.35); g.lineWidth = 1.3 * kp;
        coast(Q.TAIWAN); g.stroke(); coast(Q.PENGHU); g.stroke();
        g.strokeStyle = alpha(C.text, C.dark ? 0.16 : 0.13); g.lineWidth = 1.2 * kp; g.setLineDash([3 * kp, 4 * kp]);
        g.beginPath();
        for (let lon = 120; lon <= 122; lon++) { const x = P(lon, 23)[0]; g.moveTo(x, 0); g.lineTo(x, Ht); }
        for (let lat = 22; lat <= 25; lat++) { const y = P(121, lat)[1]; g.moveTo(0, y); g.lineTo(Wt, y); }
        g.stroke(); g.setLineDash([]);
        g.font = '500 ' + Math.round(10.5 * kp) + 'px ' + FONT;
        g.fillStyle = alpha(C.text, 0.6);
        g.textBaseline = 'bottom';
        for (let lon = 120; lon <= 122; lon++) g.fillText(lon + '°E', P(lon, 23)[0] + 3 * kp, Ht - 6 * kp);
        for (let lat = 22; lat <= 25; lat++) g.fillText(lat + '°N', 4 * kp, P(121, lat)[1] - 3 * kp);
        g.strokeStyle = alpha(C.text, C.dark ? 0.3 : 0.25); g.lineWidth = 2 * kp;
        g.strokeRect(0, 0, Wt, Ht);
        return canvasTex(c);
      })();
      const top = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({
        map: mapTex, emissiveMap: mapTex, emissive: 0xffffff, emissiveIntensity: C.dark ? 0.4 : 0.3,
        transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 0.9
      }));
      top.position.set(mx, my, 0);
      top.receiveShadow = true;
      top.renderOrder = 5;
      G.add(top);

      // ---- 地殼：玻璃般的四面牆與底面，每 20 km 一條深度虛線 ----
      const glassTex = rockTexture(512, 512, mix(C['canvas-bg'], C.rock, C.dark ? 0.22 : 0.3), mix(C['canvas-bg'], C.rock, C.dark ? 0.4 : 0.5), [0.25, 0.5, 0.75], 9);
      const glassMat = new THREE.MeshStandardMaterial({ map: glassTex, transparent: true, opacity: C.dark ? 0.3 : 0.26, depthWrite: false, side: THREE.DoubleSide, roughness: 0.4 });
      [[[M.x0, M.y0], [M.x1, M.y0]], [[M.x1, M.y0], [M.x1, M.y1]], [[M.x1, M.y1], [M.x0, M.y1]], [[M.x0, M.y1], [M.x0, M.y0]]].forEach(function (pp) {
        const m = wall(pp, DEP, glassMat);
        m.renderOrder = 1;
        G.add(m);
      });
      const base = new THREE.Mesh(new THREE.PlaneGeometry(W, H), basicMat(mix(C['canvas-bg'], C.rock, 0.4), C.dark ? 0.12 : 0.1));
      base.position.set(mx, my, -DEP);
      base.renderOrder = 1;
      G.add(base);
      G.add(boxEdges(M.x0, M.x1, M.y0, M.y1, -DEP, 0, C.text, C.dark ? 0.3 : 0.24));
      // 由上往下看時這條邊很短，標籤會互相擋住：先保住「80 km」（有單位），再來 40，其餘有空間才顯示
      [20, 40, 60, 80].forEach(function (d) {
        const l = label(d === 80 ? '80 km' : String(d), alpha(C.text, 0.7), { prio: d === 80 ? 0.6 : d === 40 ? 0.3 : 0, box: false, dir: [-1, 0], gap: 4, size: 10.5 });
        l.position.set(M.x0, M.y0, -d);
        G.add(l);
      });
      const lbN = label('N', C.text, { prio: 0, box: false, weight: 700, dir: [0, 1], gap: 4 });
      lbN.position.set(M.x1 - 18, M.y1, 0);
      G.add(lbN);

      // ---- 測站（倒圓錐，像 2D 的 ▼） ----
      const coneGeo = new THREE.ConeGeometry(5, 9, 28);
      coneGeo.rotateX(-Math.PI / 2);
      const stations = [0, 1, 2, 3, 4].map(function (i) {
        const mat = new THREE.MeshStandardMaterial({ color: col(C.st[i]), roughness: 0.4, metalness: 0.1, emissive: col(C.st[i]), emissiveIntensity: 0.15 });
        const m = new THREE.Mesh(coneGeo, mat);
        m.castShadow = true;
        const lb = label('', C.st[i], { prio: 2, dir: [0, 1], gap: 6 });
        const dome = new THREE.Mesh(domeGeo, new THREE.MeshStandardMaterial({
          color: col(C.st[i]), emissive: col(C.st[i]), emissiveIntensity: 0.25, roughness: 0.3,
          transparent: true, opacity: C.dark ? 0.16 : 0.13, side: THREE.DoubleSide, depthWrite: false, clippingPlanes: clipBlock
        }));
        dome.renderOrder = 7;
        const rim = ringStrip(240, basicMat(C.st[i], 0.95, clipMap), 9);
        const rimG = ringStrip(240, basicMat(C.st[i], C.dark ? 0.2 : 0.16, clipMap), 8);
        G.add(m, lb, dome, rim, rimG);
        return { m: m, mat: mat, lb: lb, dome: dome, rim: rim, rimG: rimG };
      });
      // ---- 共同弦：兩個半球交成的直立半圓（最多 10 對） ----
      const discGeo = new THREE.CircleGeometry(1, 64, Math.PI, Math.PI);
      const chords = [];
      for (let k = 0; k < 10; k++) {
        const disc = new THREE.Mesh(discGeo, basicMat(C.text, C.dark ? 0.1 : 0.08, clipBlock));
        disc.matrixAutoUpdate = false;
        disc.renderOrder = 8;
        const arc = ringStrip(96, basicMat(C.text, 0.62, clipBlock), 9);
        const chord = dashLine(C.text, 0.65, 4, 3);
        G.add(disc, arc, chord);
        chords.push({ disc: disc, arc: arc, chord: chord });
      }
      // ---- 估計的震央與震源 ----
      const crossGeo = (function () {
        const g = new THREE.BufferGeometry();
        const s = 1, a = 0.42;
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-s, 0, 0, -a, 0, 0, a, 0, 0, s, 0, 0, 0, -s, 0, 0, -a, 0, 0, a, 0, 0, s, 0]), 3));
        return g;
      })();
      // 電腦的最小平方解：學生確認之後才出現，灰色（只當對照）
      const greyC = mix(C.text, C['canvas-bg'], C.dark ? 0.3 : 0.35);
      const ests = [0, 1].map(function () {
        const grp = new THREE.Group();
        const ringM = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.4, 40), basicMat(greyC, 0.9));
        const cross = new THREE.LineSegments(crossGeo, new THREE.LineBasicMaterial({ color: col(greyC), transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false }));
        cross.scale.setScalar(9);
        ringM.renderOrder = cross.renderOrder = 11;
        grp.add(ringM, cross);
        const lb = label('', greyC, { prio: 1, dir: [-1, -1], gap: 10, size: 11 });
        G.add(grp, lb);
        return { grp: grp, ring: ringM, cross: cross, lb: lb };
      });
      const estBall = new THREE.Mesh(new THREE.SphereGeometry(2, 24, 16), new THREE.MeshStandardMaterial({ color: col(greyC), emissive: col(greyC), emissiveIntensity: 0.35, roughness: 0.4 }));
      const estLine = dashLine(greyC, 0.7, 2.5, 2);
      const lbEstF = label('', greyC, { prio: 1, dir: [-1, 0.3], gap: 10, size: 11 });
      G.add(estBall, estLine, lbEstF);
      // ---- 你的震央標記（點地圖放置、可拖曳）：地面的準星＋直立的大頭針 ----
      const PIN = 10;
      const pinHeadGeo = new THREE.SphereGeometry(2.7, 28, 18), pinStickGeo = new THREE.CylinderGeometry(0.42, 0.42, PIN, 10);
      pinStickGeo.rotateX(Math.PI / 2); pinStickGeo.translate(0, 0, PIN / 2);
      const PL_PIN = new THREE.Plane(V(0, 0, 1), -PIN); // z = PIN 的水平面
      const marks3 = [0, 1].map(function () {
        const grp = new THREE.Group();
        const headMat = new THREE.MeshStandardMaterial({ color: col(C.accent), emissive: col(C.accent), emissiveIntensity: 0.35, roughness: 0.25, metalness: 0.1 });
        const head = new THREE.Mesh(pinHeadGeo, headMat);
        head.position.z = PIN;
        head.castShadow = true;
        const stick = new THREE.Mesh(pinStickGeo, new THREE.MeshStandardMaterial({ color: col(shade(C.accent, -0.2)), roughness: 0.5 }));
        stick.castShadow = true;
        const ring = new THREE.Mesh(new THREE.RingGeometry(3.4, 4.6, 40), basicMat(C.accent, 0.95));
        ring.position.z = 0.7;
        const cross = new THREE.LineSegments(crossGeo, new THREE.LineBasicMaterial({ color: col(C.accent), transparent: true, opacity: 0.95, toneMapped: false, depthWrite: false }));
        cross.scale.setScalar(12); cross.position.z = 0.7;
        ring.renderOrder = cross.renderOrder = 12;
        const halo = glowSprite(C.accent, 26, 0.5);
        halo.position.z = PIN;
        grp.add(head, stick, ring, cross, halo);
        const lb = label('', C.accent, { prio: 2, dir: [1, 0.6], gap: 12, weight: 700 });
        G.add(grp, lb);
        return { grp: grp, headMat: headMat, halo: halo, lb: lb };
      });
      // 由你的標記推算的震源：h = √(平均(d² − Δ²))
      const myBall = new THREE.Mesh(new THREE.SphereGeometry(2.3, 24, 16), new THREE.MeshStandardMaterial({ color: col(C.accent), emissive: col(C.accent), emissiveIntensity: 0.5, roughness: 0.3 }));
      const myGlow = glowSprite(C.accent, 14, C.dark ? 0.5 : 0.38);
      const myLine = dashLine(C.accent, 0.85, 2.5, 2);
      const lbMyF = label('', C.accent, { prio: 1.5, dir: [1, -0.5], gap: 10 }); // 碰到主要標籤（測站、真實震源、你的標記）就讓開
      G.add(myBall, myGlow, myLine, lbMyF);
      // 之前確認過的標記（小叉）
      const hist = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: col(C.accent), transparent: true, opacity: 0.5, toneMapped: false, depthWrite: false }));
      hist.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(60 * 12), 3));
      hist.frustumCulled = false;
      hist.renderOrder = 10;
      G.add(hist);
      // ---- 真實震源（按「顯示真實震央」後）與它發出的波 ----
      const trueStar = new THREE.Mesh(new THREE.IcosahedronGeometry(2.6, 0), new THREE.MeshStandardMaterial({ color: col(C.pos), emissive: col(C.pos), emissiveIntensity: 0.55, roughness: 0.3, flatShading: true }));
      const trueGlow = glowSprite(C.pos, 16, C.dark ? 0.55 : 0.4);
      const trueLine = dashLine(C.pos, 0.75, 2.5, 2);
      const trueEpi = new THREE.Mesh(new THREE.RingGeometry(2.2, 3.4, 5), basicMat(C.pos, 1));
      trueEpi.renderOrder = 11;
      const errLine = dashLine(C.text, 0.6, 2, 3);
      const lbTrue = label('', C.pos, { prio: 2, dir: [1, -0.5], gap: 12 });
      G.add(trueStar, trueGlow, trueLine, trueEpi, errLine, lbTrue);
      const sphGeo = new THREE.SphereGeometry(1, 96, 48);
      const waves = [B.VP, B.VS].map(function (v, i) {
        const color = i ? C.S : C.P;
        const sh = new THREE.Mesh(sphGeo, new THREE.MeshStandardMaterial({
          color: col(color), emissive: col(color), emissiveIntensity: 0.4, roughness: 0.3, transparent: true, opacity: 0.12,
          side: THREE.DoubleSide, depthWrite: false, clippingPlanes: clipBlock
        }));
        sh.renderOrder = 6;
        const gr = ringStrip(240, basicMat(color, 0.85, clipMap), 9);
        G.add(sh, gr);
        return { v: v, sh: sh, gr: gr };
      });
      const fx = fxPool(10);
      fx.forEach(function (m) { G.add(m); });

      function update(now) {
        const w = S.w2, q = w.quake, st = B.activeStations(), picked = B.pickedStations();
        const tRec = w.rec.done ? w.we : w.rec.t;
        stations.forEach(function (o, i) {
          const s = st[i], on = !!s;
          o.m.visible = o.lb.visible = on;
          if (!on) { o.dome.visible = o.rim.visible = o.rimG.visible = false; return; }
          const hot = isHot('st2-' + i);
          o.m.position.set(s.x, s.y, 4.5);
          o.mat.emissiveIntensity = hot ? 0.7 : 0.15;
          o.m.scale.setScalar(hot ? 1.2 : 1);
          o.lb.position.set(s.x, s.y, 9);
          setLabel(o.lb, s.label + (s.city ? ' ' + B.cityName(s.city) : ''));
          const ok = picked.indexOf(s) >= 0;
          o.dome.visible = o.rim.visible = o.rimG.visible = ok;
          if (ok) {
            const R = B.stationR(s);
            o.dome.position.set(s.x, s.y, 0);
            o.dome.scale.setScalar(R);
            setRing(o.rim, V(s.x, s.y, 0.5), EX, EY, R, 1.5);
            setRing(o.rimG, V(s.x, s.y, 0.45), EX, EY, Math.max(0, R - 3), 6);
          }
        });
        // 共同弦與直立半圓
        let k = 0;
        if (w.chords && picked.length >= 2) {
          for (let i = 0; i < picked.length; i++) for (let j = i + 1; j < picked.length; j++) {
            const a = picked[i], b = picked[j];
            const cc = Q.commonChord({ x: a.x, y: a.y, R: B.stationR(a) }, { x: b.x, y: b.y, R: B.stationR(b) });
            if (!cc || k >= chords.length) continue;
            const o = chords[k++];
            const mid = V((cc[0].x + cc[1].x) / 2, (cc[0].y + cc[1].y) / 2, 0);
            const L = Math.hypot(cc[1].x - cc[0].x, cc[1].y - cc[0].y) / 2;
            const u = V(cc[1].x - cc[0].x, cc[1].y - cc[0].y, 0).normalize(), n = V(0, 0, 0).crossVectors(u, EZ);
            o.disc.matrix.makeBasis(u, EZ, n).scale(V(L, L, 1)).setPosition(mid);
            o.disc.matrixWorldNeedsUpdate = true;
            setRing(o.arc, mid, u, EZ, L, 0.9, Math.PI, TAU);
            setLine(o.chord, [V(cc[0].x, cc[0].y, 0.7), V(cc[1].x, cc[1].y, 0.7)]);
            o.disc.visible = o.arc.visible = o.chord.visible = L > 0.1;
          }
        }
        for (; k < chords.length; k++) chords[k].disc.visible = chords[k].arc.visible = chords[k].chord.visible = false;
        // 電腦解（確認後才有，量測改過就藏起來）
        const e = B.liveEst(), cands = e ? e.candidates || [] : [];
        ests.forEach(function (o, i) {
          const p = cands[i];
          o.grp.visible = o.lb.visible = !!p;
          if (!p) return;
          o.grp.position.set(p.x, p.y, 0.9);
          o.lb.position.set(p.x, p.y, 0.9);
          setLabel(o.lb, T('電腦解', 'Computer') + (cands.length > 1 ? ' ' + (i + 1) : ''));
        });
        const hasF = !!e && cands.length === 1 && e.n >= 3 && isFinite(e.h);
        estBall.visible = estLine.visible = lbEstF.visible = hasF;
        if (hasF) {
          estBall.position.set(e.x, e.y, -e.h);
          setLine(estLine, [V(e.x, e.y, 0), V(e.x, e.y, -e.h)]);
          lbEstF.position.set(e.x, e.y, -e.h);
          setLabel(lbEstF, T('電腦解 ', 'Computer ') + B.num(e.h, 1) + ' km');
        }
        // 你的震央標記與推算的震源
        const mk = w.marks;
        marks3.forEach(function (o, i) {
          const m = mk[i];
          o.grp.visible = o.lb.visible = !!m;
          if (!m) return;
          const hot = isHot('mk-' + i);
          o.grp.position.set(m.x, m.y, 0);
          o.headMat.emissiveIntensity = hot ? 0.8 : 0.35;
          o.halo.visible = hot || (mk.length > 1 && w.mkActive === i);
          o.lb.position.set(m.x, m.y, PIN + 2);
          setLabel(o.lb, mk.length > 1 || w.nMarks > 1 ? T('標記 ', 'Marker ') + (i + 1) : T('我的震央', 'My epicenter'));
        });
        const dep = B.myDepth();
        const hasMy = !!dep && mk.length === 1;
        myBall.visible = myGlow.visible = myLine.visible = lbMyF.visible = hasMy;
        if (hasMy) {
          const m = mk[0], hz = Math.max(0.01, dep.h);
          myBall.position.set(m.x, m.y, -hz); myGlow.position.set(m.x, m.y, -hz);
          setLine(myLine, [V(m.x, m.y, 0), V(m.x, m.y, -hz)]);
          lbMyF.position.set(m.x, m.y, -hz);
          setLabel(lbMyF, T('你的震源 ', 'Your focus ') + B.num(dep.h, 1) + ' km');
        }
        const ha = hist.geometry.attributes.position.array;
        let nh = 0;
        w.history.forEach(function (hs, i) {
          if (i === w.history.length - 1 && e) return;
          (hs.marks || [hs]).forEach(function (m) {
            if (nh >= 60) return;
            const s = 3;
            ha.set([m.x - s, m.y - s, 0.8, m.x + s, m.y + s, 0.8, m.x + s, m.y - s, 0.8, m.x - s, m.y + s, 0.8], nh * 12);
            nh++;
          });
        });
        hist.geometry.setDrawRange(0, nh * 4);
        hist.geometry.attributes.position.needsUpdate = true;
        // 真實震源
        const rv = !!q.revealed;
        trueStar.visible = trueGlow.visible = trueLine.visible = trueEpi.visible = lbTrue.visible = rv;
        if (rv) {
          trueStar.position.set(q.x, q.y, -q.h);
          trueStar.rotation.z = 0.4;
          trueGlow.position.set(q.x, q.y, -q.h);
          trueEpi.position.set(q.x, q.y, 1);
          setLine(trueLine, [V(q.x, q.y, 0), V(q.x, q.y, -q.h)]);
          lbTrue.position.set(q.x, q.y, -q.h);
          setLabel(lbTrue, T('真實震源', 'True focus') + ' · ' + B.num(q.h, q.h % 1 ? 1 : 0) + ' km');
        }
        errLine.visible = rv && mk.length === 1;
        if (errLine.visible) setLine(errLine, [V(q.x, q.y, 1), V(mk[0].x, mk[0].y, 1)]);
        waves.forEach(function (o) {
          const R = o.v * w.rec.t, on = rv && !w.rec.done && R > q.h;
          o.sh.visible = rv && !w.rec.done && R > 0.5;
          if (o.sh.visible) { o.sh.position.set(q.x, q.y, -q.h); o.sh.scale.setScalar(R); }
          o.gr.visible = on;
          if (on) setRing(o.gr, V(q.x, q.y, 0.6), EX, EY, Math.sqrt(R * R - q.h * q.h), 1.4);
        });
        showFx(fx, S.fx.filter(function (f) { return f.where.indexOf('st2-') === 0; }), now, function (m, f) {
          const s = st[+f.where.slice(4)];
          if (s) m.position.set(s.x, s.y, 0.8); else m.visible = false;
        }, 4, 16);

        setHud('t', 't = ' + B.num(tRec, 1) + ' s' + B.speed('locate'));
        setHud('t2', B.clock(q.T0 + tRec), 'm');
        setHud('r1', 'k = ' + B.num(B.kConv(), 3) + ' km/s');
        setHud('r2', hasMy ? T('你的深度 ', 'Your depth ') + B.num(dep.h, 1) + ' km' : T('已量 ', 'Measured: ') + picked.length + T(' 站', picked.length === 1 ? ' station' : ' stations'), 'm');
        setHud('note', narrow ? T('依比例（km）；半球半徑 = d', 'To scale (km); half-sphere radius = d')
          : T('依比例（km）：地圖與深度同一比例；半球半徑 = 量到的震源距離 d', 'To scale (km); half-sphere radius = measured distance d'));
      }
      return {
        group: G, update: update,
        aria: T('3D：臺灣地圖下的地殼；每個測站量到的震源距離是一個半球，兩兩交成直立的半圓，半圓交在震源。可拖曳旋轉、縮放，也可拖曳測站；點地圖放你的震央標記。',
          '3D: the crust under the map of Taiwan; each measured distance is a half-sphere around its station, pairs meet in upright half-circles, and the half-circles meet at the focus. Drag to rotate, zoom, or drag the stations; tap the map to place your epicenter marker.'),
        size: [1.12, 0.62, 600],
        fit: { box: [M.x0, M.x1, M.y0, M.y1, -DEP, 12], dir: V(-0.28, -1, 0.95), floorZ: null, sunDir: V(-0.5, -0.6, 1) },
        handles: function () {
          // 標記排在前面：與測站重疊時先抓到標記（大頭針的頭在 z = PIN，拖曳平面也放在那個高度，頭才會跟著手指）
          return S.w2.marks.map(function (m, i) {
            return {
              id: 'mk-' + i, p: V(m.x, m.y, PIN), plane: PL_PIN,
              move: function (p) { B.drag('mark', i, { x: p.x, y: p.y }); }, end: function () { B.dragEnd('mark'); }
            };
          }).concat(B.activeStations().map(function (s, i) {
            return {
              id: 'st2-' + i, p: V(s.x, s.y, 5), plane: PL_Z0,
              move: function (p) { B.drag('station2', i, { x: p.x, y: p.y }); }, end: function () { B.dragEnd('station2'); }
            };
          }));
        },
        // 點一下地圖（沒有拖曳）：放上或移過來你的震央標記
        tap: function (ev) {
          const p = planePoint(ev, PL_Z0);
          if (!p || p.x < M.x0 || p.x > M.x1 || p.y < M.y0 || p.y > M.y1) return false;
          B.placeMark(p.x, p.y);
          return true;
        }
      };
    }
    const domeGeo = (function () { const g = new THREE.SphereGeometry(1, 72, 36, 0, TAU, Math.PI / 2, Math.PI / 2); g.rotateX(Math.PI / 2); g.userData.shared = true; return g; })();

    // =====================================================================
    // 模式三：切開一半的地球、射線、陰影區
    // =====================================================================
    function build3() {
      const G = new THREE.Group();
      const R = Q.RE * K3;
      const w0 = S.w3;
      if (!w0.ready) return { group: G, update: function () {}, aria: '', size: [1, 0.6, 580], fit: { box: [-R, R, -R, R, -R, R], dir: V(-0.55, -1, 0.42), floorZ: null, sunDir: V(-0.5, -0.8, 1) }, handles: function () { return []; } };
      const pol = function (r, th, y) { return V(r * K3 * Math.sin(th), y || 0, r * K3 * Math.cos(th)); };

      // ---- 切面（2D 的剖面：分層與射線束） ----
      function cutTexture() {
        const N = 2048, c = document.createElement('canvas');
        c.width = c.height = N;
        const g = c.getContext('2d'), w = S.w3, cx = N / 2, cy = N / 2, rp = N / 2 - 2, k = rp / Q.RE, s = 4;
        const P = function (r, th) { return [cx + r * k * Math.sin(th), cy - r * k * Math.cos(th)]; };
        const mantle = mix(C['canvas-bg'], C.rock, C.dark ? 0.12 : 0.2), mantleDeep = mix(C['canvas-bg'], C.rock, C.dark ? 0.2 : 0.3);
        const outerC = mix(C['canvas-bg'], C.dark ? C['b-thermo'] : C['b-mech'], C.dark ? 0.2 : 0.26), innerC = mix(C['canvas-bg'], C.equi, C.dark ? 0.34 : 0.42);
        g.fillStyle = mantle; g.fillRect(0, 0, N, N);
        let gr = g.createRadialGradient(cx, cy, Q.R_CMB * k, cx, cy, rp);
        gr.addColorStop(0, mantleDeep); gr.addColorStop(1, mantle);
        g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, rp + 2, 0, TAU); g.fill();
        gr = g.createRadialGradient(cx - Q.R_CMB * k * 0.3, cy - Q.R_CMB * k * 0.35, Q.R_CMB * k * 0.1, cx, cy, Q.R_CMB * k);
        gr.addColorStop(0, shade(outerC, 0.12)); gr.addColorStop(1, shade(outerC, -0.08));
        g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, Q.R_CMB * k, 0, TAU); g.fill();
        gr = g.createRadialGradient(cx - Q.R_ICB * k * 0.3, cy - Q.R_ICB * k * 0.35, 1, cx, cy, Q.R_ICB * k);
        gr.addColorStop(0, shade(innerC, 0.25)); gr.addColorStop(1, innerC);
        g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, Q.R_ICB * k, 0, TAU); g.fill();
        g.strokeStyle = alpha(C.text, 0.4); g.lineWidth = 1.2 * s;
        [Q.R_CMB, Q.R_ICB].forEach(function (r) { g.beginPath(); g.arc(cx, cy, r * k, 0, TAU); g.stroke(); });
        g.setLineDash([2 * s, 4 * s]); g.strokeStyle = alpha(C.text, 0.2); g.lineWidth = s;
        g.beginPath(); g.arc(cx, cy, 5701 * k, 0, TAU); g.stroke(); g.setLineDash([]);
        g.strokeStyle = shade(C.rock, C.dark ? 0.1 : -0.3); g.lineWidth = 2 * s;
        g.beginPath(); g.arc(cx, cy, rp - s, 0, TAU); g.stroke();
        if (w.fan) {
          g.lineJoin = 'round';
          const drawRay = function (ray, color, a) {
            if (!w.inner && ray.phase === 'PKIKP') return;
            [1, -1].forEach(function (sg) {
              g.beginPath();
              ray.pts.forEach(function (q, i) { const p = P(q[0], sg * q[1]); if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); });
              g.strokeStyle = alpha(color, a); g.lineWidth = 0.85 * s; g.stroke();
              if (ray.blocked) {
                const e = ray.pts[ray.pts.length - 1], p = P(e[0], sg * e[1]);
                g.strokeStyle = alpha(color, 0.9); g.lineWidth = 1.4 * s;
                g.beginPath(); g.moveTo(p[0] - 3 * s, p[1] - 3 * s); g.lineTo(p[0] + 3 * s, p[1] + 3 * s); g.moveTo(p[0] + 3 * s, p[1] - 3 * s); g.lineTo(p[0] - 3 * s, p[1] + 3 * s); g.stroke();
              }
            });
          };
          if (w.wave !== 'P') E.fanS.forEach(function (r) { drawRay(r, C.S, C.dark ? 0.6 : 0.5); });
          if (w.wave !== 'S') E.fanP.forEach(function (r) { drawRay(r, r.phase === 'P' ? C.P : shade(C.P, C.dark ? 0.35 : 0.3), C.dark ? 0.65 : 0.55); });
        }
        return canvasTex(c);
      }
      const cutGeo = new THREE.CircleGeometry(R, 180);
      cutGeo.rotateX(Math.PI / 2);
      const cutMat = new THREE.MeshStandardMaterial({ emissive: 0xffffff, emissiveIntensity: C.dark ? 0.4 : 0.3, roughness: 0.9 });
      const cut = new THREE.Mesh(cutGeo, cutMat);
      cut.receiveShadow = true;
      G.add(cut);

      // ---- 外表（y ≥ 0 的半球）：貼圖的縱向座標就是與震源的角距 Δ ----
      function outerTexture() {
        const W2 = 1024, H2 = 512, c = document.createElement('canvas');
        c.width = W2; c.height = H2;
        const g = c.getContext('2d'), w = S.w3, z = E.zones;
        const baseC = mix(C['canvas-bg'], C.rock, C.dark ? 0.26 : 0.32);
        const gr = g.createLinearGradient(0, 0, 0, H2);
        gr.addColorStop(0, shade(baseC, 0.05)); gr.addColorStop(1, shade(baseC, -0.08));
        g.fillStyle = gr; g.fillRect(0, 0, W2, H2);
        const r = rnd(13);
        for (let i = 0; i < 2600; i++) { g.fillStyle = alpha(r() < 0.5 ? C.text : C['canvas-bg'], 0.03 + r() * 0.05); g.fillRect(r() * W2, r() * H2, 1 + r() * 3, 1 + r() * 2); }
        const Y = function (d) { return d / 180 * H2; };
        g.strokeStyle = alpha(C.text, C.dark ? 0.2 : 0.16); g.lineWidth = 2;
        g.beginPath();
        for (let d = 30; d < 180; d += 30) { g.moveTo(0, Y(d)); g.lineTo(W2, Y(d)); }
        for (let a = 1; a < 6; a++) { g.moveTo(a / 6 * W2, 0); g.lineTo(a / 6 * W2, H2); }
        g.stroke();
        if (w.shadow) {
          if (w.wave !== 'P') {
            g.fillStyle = alpha(C.S, C.dark ? 0.24 : 0.2); g.fillRect(0, Y(z.sMax), W2, H2 - Y(z.sMax));
            g.save(); g.beginPath(); g.rect(0, Y(z.sMax), W2, H2 - Y(z.sMax)); g.clip();
            g.strokeStyle = alpha(C.S, C.dark ? 0.5 : 0.42); g.lineWidth = 3;
            g.beginPath(); for (let x = -H2; x < W2; x += 18) { g.moveTo(x, H2); g.lineTo(x + H2, 0); } g.stroke();
            g.restore();
            g.fillStyle = alpha(C.S, 0.95); g.fillRect(0, Y(z.sMax) - 1.5, W2, 3);
          }
          if (w.wave !== 'S') {
            g.fillStyle = alpha(C.P, C.dark ? 0.55 : 0.45); g.fillRect(0, Y(z.pMax), W2, Y(z.pkpMin) - Y(z.pMax));
            g.fillStyle = alpha(C.P, 0.95); g.fillRect(0, Y(z.pMax) - 1.5, W2, 3); g.fillRect(0, Y(z.pkpMin) - 1.5, W2, 3);
          }
        }
        return canvasTex(c);
      }
      const outerGeo = new THREE.SphereGeometry(R, 128, 72, Math.PI, Math.PI);
      outerGeo.rotateX(Math.PI / 2);
      const outerMat = new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0 });
      const outer = new THREE.Mesh(outerGeo, outerMat);
      outer.castShadow = true;
      G.add(outer);
      // 切面外緣的陰影區弧帶（與 2D 相同的位置）
      const bandGrp = new THREE.Group();
      G.add(bandGrp);
      // 角度刻度
      (function () {
        const p = [];
        for (let a = 0; a < 360; a += 10) {
          const th = a * Math.PI / 180, r2 = R * (a % 30 ? 1.025 : 1.045);
          p.push(R * Math.sin(th), -0.05, R * Math.cos(th), r2 * Math.sin(th), -0.05, r2 * Math.cos(th));
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(p), 3));
        const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: col(C.text), transparent: true, opacity: 0.5, toneMapped: false }));
        G.add(l);
        for (let a = 30; a < 360; a += 30) {
          const th = a * Math.PI / 180, lb = label((a <= 180 ? a : 360 - a) + '°', alpha(C.text, 0.65), { prio: 0, box: false, dir: [0, 0], gap: 0, size: 10.5 });
          lb.position.set(R * 1.1 * Math.sin(th), -0.1, R * 1.1 * Math.cos(th));
          G.add(lb);
        }
      })();
      // 分層名稱
      [[T('地函（固態）', 'Mantle (solid)'), -(Q.R_CMB + 1450)], [T('外核（液態）', 'Outer core (liquid)'), -(Q.R_ICB + 1150)], [T('內核（固態）', 'Inner core (solid)'), 0]].forEach(function (q) {
        const lb = label(q[0], C.text, { prio: 1, dir: [0, 0], gap: 0, size: narrow ? 10.5 : 12 });
        lb.position.set(0, -0.2, q[1] * K3);
        G.add(lb);
      });
      [[T('核幔界面 2891 km', 'Core–mantle 2891 km'), Q.R_CMB], [T('內外核界面 5150 km', 'Inner core 5150 km'), Q.R_ICB]].forEach(function (q) {
        const lb = label(q[0], alpha(C.text, 0.65), { prio: 0, box: false, dir: [-1, -1], gap: 2, size: 10.5 });
        lb.position.set(-q[1] * K3 * 0.71, -0.15, -q[1] * K3 * 0.71);
        G.add(lb);
      });

      // ---- 標示的射線（管子）、核幔界面的法線與入射角、S 波被擋住的位置 ----
      const rayGrp = new THREE.Group();
      G.add(rayGrp);
      const nLine = dashLine(C.text, 0.75, 0.5, 0.45);
      const lbI1 = label('i', C.text, { sub: '1', prio: 1, box: false, italic: true, dir: [1, 0], gap: 2, size: 12 });
      const lbI2 = label('i', C.text, { sub: '2', prio: 1, box: false, italic: true, dir: [1, 0], gap: 2, size: 12 });
      const lbStop = label(T('S 波到此為止', 'S stops here'), C.S, { prio: 2, weight: 700, dir: [1, 0], gap: 10 });
      G.add(nLine, lbI1, lbI2, lbStop);
      function rayTube(ray, color) {
        const n = ray.pts.length, step = Math.max(1, Math.ceil(n / 260)), v = [];
        for (let i = 0; i < n; i += step) v.push(pol(ray.pts[i][0], ray.pts[i][1], -0.32));
        const last = ray.pts[n - 1];
        v.push(pol(last[0], last[1], -0.32));
        const curve = new THREE.CatmullRomCurve3(v, false, 'centripetal');
        const geo = new THREE.TubeGeometry(curve, Math.min(600, v.length * 2), 0.26, 6, false);
        const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: col(color), emissive: col(color), emissiveIntensity: 0.45, roughness: 0.35, toneMapped: false }));
        m.renderOrder = 4;
        return m;
      }

      // ---- 震源、測站、同角距的圈 ----
      const src = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 1), new THREE.MeshStandardMaterial({ color: col(C.pos), emissive: col(C.pos), emissiveIntensity: 0.6, roughness: 0.3 }));
      src.position.set(0, -0.1, R + 0.5);
      const srcGlow = glowSprite(C.pos, 6, C.dark ? 0.55 : 0.4);
      srcGlow.position.copy(src.position);
      const lbSrc = label(T('震源', 'Focus'), C.pos, { prio: 2, dir: [0, 1], gap: 10 });
      lbSrc.position.copy(src.position);
      G.add(src, srcGlow, lbSrc);
      const stMat = new THREE.MeshStandardMaterial({ color: col(C.accent), emissive: col(C.accent), emissiveIntensity: 0.15, roughness: 0.4, metalness: 0.1 });
      const stCone = new THREE.Mesh(new THREE.ConeGeometry(1.25, 2.6, 28), stMat);
      stCone.castShadow = true;
      G.add(stCone);
      const ringMat = new THREE.MeshStandardMaterial({ color: col(C.accent), emissive: col(C.accent), emissiveIntensity: 0.35, roughness: 0.4, transparent: true, opacity: 0.85 });
      const stRing = new THREE.Mesh(new THREE.BufferGeometry(), ringMat);
      G.add(stRing);
      const lbSt = label('', C.accent, { prio: 2, weight: 700, gap: 10 });
      G.add(lbSt);
      const lbPz = label('', C.P, { prio: 1, gap: 6, size: narrow ? 10.5 : 11.5 });
      const lbSz = label('', C.S, { prio: 1, gap: 6, size: narrow ? 10.5 : 11.5 });
      G.add(lbPz, lbSz);
      // ---- 波前（射線束上同一時刻的位置） ----
      const nDots = 2 * (E.fanP.length + E.fanS.length);
      const dotGeo = new THREE.BufferGeometry();
      dotGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nDots * 3), 3));
      dotGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(nDots * 3), 3));
      const dotPts = new THREE.Points(dotGeo, new THREE.PointsMaterial({ size: narrow ? 10 : 12, sizeAttenuation: false, map: dotTex, vertexColors: true, transparent: true, depthWrite: false, toneMapped: false }));
      dotPts.frustumCulled = false;
      dotPts.renderOrder = 12;
      G.add(dotPts);
      const fx = fxPool(4, Math.PI / 2);
      fx.forEach(function (m) { G.add(m); });
      const cPc = col(C.P), cSc = col(C.S);

      let cutKey = '', outKey = '', rayKey = '', ringDeg = null;
      function update(now) {
        const w = S.w3, z = E.zones;
        const ck = [w.wave, w.fan, w.inner, colorVer].join('|');
        if (ck !== cutKey) {
          cutKey = ck;
          if (cutMat.map) cutMat.map.dispose();
          const t = cutTexture();
          cutMat.map = t; cutMat.emissiveMap = t; cutMat.needsUpdate = true;
        }
        const ok = [w.wave, w.shadow, colorVer].join('|');
        if (ok !== outKey) {
          outKey = ok;
          if (outerMat.map) outerMat.map.dispose();
          outerMat.map = outerTexture(); outerMat.needsUpdate = true;
          // 切面外緣的弧帶
          bandGrp.children.slice().forEach(function (o) { bandGrp.remove(o); disposeObject(o); });
          if (w.shadow) {
            const band = function (a0, a1, r0, color) {
              [1, -1].forEach(function (sg) {
                const t0 = sg > 0 ? Math.PI / 2 - a1 : Math.PI / 2 + a0;
                const geo = new THREE.RingGeometry(r0, r0 + 0.75, 1, 48, t0, a1 - a0);
                geo.rotateX(Math.PI / 2);
                const m = new THREE.Mesh(geo, basicMat(color, C.dark ? 0.6 : 0.5));
                m.position.y = -0.02;
                bandGrp.add(m);
              });
            };
            const D2 = Math.PI / 180;
            if (w.wave !== 'S') band(z.pMax * D2, z.pkpMin * D2, R + 0.45, C.P);
            if (w.wave !== 'P') band(z.sMax * D2, Math.PI, R + (w.wave === 'S' ? 0.45 : 1.35), C.S);
          }
        }
        // 標示的射線
        const rk = [w.takeoff, w.wave, colorVer].join('|');
        if (rk !== rayKey) {
          rayKey = rk;
          rayGrp.children.slice().forEach(function (o) { rayGrp.remove(o); disposeObject(o); });
          if (w.wave !== 'S') rayGrp.add(rayTube(E.hiP, C.P));
          if (w.wave !== 'P') rayGrp.add(rayTube(E.hiS, C.S));
        }
        const hiP = E.hiP, cx = hiP.crossings.find(function (q) { return q.from !== 'oc' && q.to === 'oc'; });
        const showN = w.wave !== 'S' && !!cx;
        nLine.visible = lbI1.visible = lbI2.visible = showN;
        if (showN) {
          const pt = hiP.down[cx.index], P0 = pol(pt[0], pt[1], -0.4), n = V(Math.sin(pt[1]), 0, Math.cos(pt[1]));
          setLine(nLine, [P0.clone().addScaledVector(n, -9), P0.clone().addScaledVector(n, 9)]);
          lbI1.position.copy(P0).addScaledVector(n, 6.5);
          lbI2.position.copy(P0).addScaledVector(n, -6.5);
        }
        lbStop.visible = w.wave !== 'P' && !!E.hiS.blocked;
        if (lbStop.visible) { const e = E.hiS.pts[E.hiS.pts.length - 1]; lbStop.position.copy(pol(e[0], e[1], -0.4)); }

        // 測站
        const th = w.deg * Math.PI / 180, n = V(Math.sin(th), 0, Math.cos(th)), hot = isHot('rcv');
        stCone.position.copy(n).multiplyScalar(R + 1.3);
        stCone.quaternion.setFromUnitVectors(EY, n.clone().negate());
        stCone.scale.setScalar(hot ? 1.25 : 1);
        stMat.emissiveIntensity = hot ? 0.7 : 0.15;
        if (ringDeg !== w.deg) {
          ringDeg = w.deg;
          stRing.geometry.dispose();
          const rr = (R + 0.12) * Math.sin(th);
          stRing.geometry = rr > 0.05 ? new THREE.TorusGeometry(rr, 0.16, 8, 128, Math.PI) : new THREE.BufferGeometry();
          stRing.position.set(0, 0, (R + 0.12) * Math.cos(th));
        }
        const arr = B.arrivals3();
        const hasP = arr.some(function (a) { return a.phase === 'P' || a.phase === 'PKP'; }), hasS = arr.some(function (a) { return a.phase === 'S'; });
        setLabel(lbSt, B.num(w.deg, 1) + '°  ' + (w.wave !== 'S' ? 'P ' + (hasP ? '✓' : '✗') : '') + (w.wave === 'PS' ? '  ' : '') + (w.wave !== 'P' ? 'S ' + (hasS ? '✓' : '✗') : ''));
        lbSt.position.copy(n).multiplyScalar(R + 2.6);
        lbSt.userData.wdir = n;
        // 陰影區的名稱（放在切面外緣，與測站不同側時優先）
        const sh = w.shadow;
        lbPz.visible = sh && w.wave !== 'S';
        lbSz.visible = sh && w.wave !== 'P';
        const D2 = Math.PI / 180;
        if (lbPz.visible) {
          const a = -(z.pMax + z.pkpMin) / 2 * D2, d = V(Math.sin(a), 0, Math.cos(a));
          lbPz.position.copy(d).multiplyScalar(R + 1.6); lbPz.userData.wdir = d;
          setLabel(lbPz, T('P 波陰影區 ', 'P shadow zone ') + B.num(z.pMax, 0) + '°–' + B.num(z.pkpMin, 0) + '°');
        }
        if (lbSz.visible) {
          const a = (z.sMax + 180) / 2 * D2 * (w.wave === 'S' ? -1 : 1), d = V(Math.sin(a), 0, Math.cos(a));
          lbSz.position.copy(d).multiplyScalar(R + 2.4); lbSz.userData.wdir = d;
          setLabel(lbSz, T('S 波陰影區 > ', 'S shadow zone > ') + B.num(z.sMax, 0) + '°');
        }

        // 波前的點
        let k = 0;
        if (w.t > 0) {
          const pa = dotGeo.attributes.position.array, ca = dotGeo.attributes.color.array;
          const put = function (ray, c) {
            if (!w.inner && ray.phase === 'PKIKP') return;
            const p = Q.positionAt(ray, w.t);
            if (!p) return;
            [1, -1].forEach(function (sg) {
              pa.set([sg * p[0] * K3, -0.5, p[1] * K3], k * 3);
              ca.set([c.r, c.g, c.b], k * 3);
              k++;
            });
          };
          if (w.wave !== 'P') E.fanS.forEach(function (r) { put(r, cSc); });
          if (w.wave !== 'S') E.fanP.forEach(function (r) { put(r, cPc); });
          dotGeo.attributes.position.needsUpdate = true;
          dotGeo.attributes.color.needsUpdate = true;
        }
        dotGeo.setDrawRange(0, k);
        dotPts.visible = k > 0;
        showFx(fx, S.fx.filter(function (f) { return f.where === 'rcv'; }), now, function (m) { m.position.copy(n).multiplyScalar(R + 1.3); m.position.y = -0.6; }, 1.2, 4);

        setHud('t', w.t > 0 ? 't = ' + B.minsec(w.t) + B.speed('earth') : '');
        setHud('t2', '', 'm');
        setHud('r1', 'Δ = ' + B.num(w.deg, 1) + '°');
        setHud('r2', B.station3Text(), 'm');
        setHud('note', T('依比例；切面就是 2D 的剖面，外表的色帶是陰影區', 'To scale; the cut face is the 2D cross-section and the bands on the surface are the shadow zones'));
      }
      return {
        group: G, update: update,
        aria: T('3D：切開一半的地球，切面是地球剖面與地震波射線，外表的色帶是以震央為中心的陰影區。可拖曳旋轉、縮放，也可沿切面邊緣拖曳測站。',
          '3D: half of the Earth; the cut face shows the cross-section and the seismic rays, and the bands on the surface are the shadow zones around the epicenter. Drag to rotate, zoom, or drag the station along the edge of the cut.'),
        size: [1.02, 0.6, 580],
        fit: { box: [-R * 1.18, R * 1.18, -R * 0.25, R, -R * 1.12, R * 1.2], dir: V(-0.55, -1, 0.42), floorZ: -R - 0.3, sunDir: V(-0.45, -0.85, 0.9) },
        handles: function () {
          const th = S.w3.deg * Math.PI / 180;
          return [{
            id: 'rcv', p: V((R + 1.3) * Math.sin(th), 0, (R + 1.3) * Math.cos(th)), plane: PL_Y0,
            move: function (p) { B.drag('rcv', Math.abs(Math.atan2(p.x, p.z)) * 180 / Math.PI); }, end: function () { B.dragEnd('rcv'); }
          }];
        }
      };
    }

    // =====================================================================
    // 相機、模式切換、繪製
    // =====================================================================
    let camAnim = null, lastAspect = 0;
    function fitCam(dir, animate) {
      if (!cur) return;
      const f = cur.fit, b = f.box;
      const c = V((b[0] + b[1]) / 2, (b[2] + b[3]) / 2, (b[4] + b[5]) / 2);
      const d = (dir || f.dir).clone().normalize();
      const fwd = d.clone().negate();
      const right = new THREE.Vector3().crossVectors(fwd, camera.up).normalize();
      const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
      const tv = Math.tan(camera.fov * Math.PI / 360), th = tv * camera.aspect, m = 0.88;
      let dist = 0;
      for (let i = 0; i < 8; i++) {
        const p = V(b[i & 1 ? 1 : 0], b[i & 2 ? 3 : 2], b[i & 4 ? 5 : 4]).sub(c);
        const a = Math.abs(p.dot(right)), bb = Math.abs(p.dot(up)), z = p.dot(d);
        dist = Math.max(dist, z + a / (th * m), z + bb / (tv * m));
      }
      const pos = c.clone().addScaledVector(d, dist);
      controls.minDistance = dist * 0.22;
      controls.maxDistance = dist * 3;
      camera.near = dist / 200;
      camera.far = dist * 12;
      camera.updateProjectionMatrix();
      if (animate && !B.reducedMotion) {
        camAnim = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos, t1: c, s: performance.now() };
        requestRender();
      } else {
        camAnim = null;
        camera.position.copy(pos);
        controls.target.copy(c);
        controls.update();
      }
    }
    function stepCamAnim() {
      if (!camAnim) return;
      const u = clamp((performance.now() - camAnim.s) / 550, 0, 1), e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
      camera.position.lerpVectors(camAnim.p0, camAnim.p1, e);
      controls.target.lerpVectors(camAnim.t0, camAnim.t1, e);
      if (u >= 1) camAnim = null;
    }
    function placeLights() {
      const f = cur.fit, b = f.box;
      const c = V((b[0] + b[1]) / 2, (b[2] + b[3]) / 2, (b[4] + b[5]) / 2);
      const rad = Math.hypot(b[1] - b[0], b[3] - b[2], b[5] - b[4]) / 2;
      sun.position.copy(c).addScaledVector(f.sunDir.clone().normalize(), rad * 2.4);
      sun.target.position.copy(c);
      const sc = sun.shadow.camera;
      sc.left = sc.bottom = -rad * 1.1;
      sc.right = sc.top = rad * 1.1;
      sc.near = rad * 0.3;
      sc.far = rad * 5;
      sc.updateProjectionMatrix();
      sun.shadow.normalBias = rad * 0.0006;
      floor.visible = f.floorZ != null;
      if (floor.visible) { floor.position.set(c.x, c.y, f.floorZ); floor.scale.set(rad * 6, rad * 6, 1); }
      floor.material.opacity = C.dark ? 0.38 : 0.2;
    }
    function switchMode(keepCam) {
      if (cur) { scene.remove(cur.group); disposeObject(cur.group); cur = null; }
      modeName = S.mode;
      if (wrap.clientWidth) narrow = wrap.clientWidth < 560;
      cur = modeName === 'waves' ? build1() : modeName === 'locate' ? build2() : build3();
      scene.add(cur.group);
      canvas.setAttribute('aria-label', cur.aria);
      Object.keys(hudLast).forEach(function (k) { delete hudLast[k]; });
      Object.keys(hudEl).forEach(function (k) { hudEl[k].textContent = ''; });
      placeLights();
      sizeCanvas();
      if (!keepCam) fitCam(null, false);
    }
    function sizeCanvas() {
      const w = wrap.clientWidth;
      if (!w || !cur) return false;
      const nar = w < 560, sz = cur.size;
      const h = nar ? Math.round(w * sz[0]) : Math.round(Math.min(w * sz[1], sz[2]));
      if (canvas.style.height !== h + 'px') canvas.style.height = h + 'px';
      const changed = w !== cw || h !== ch;
      narrow = nar; cw = w; ch = h;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      sizeLabels();
      return changed;
    }

    let raf = 0;
    function renderNow() {
      if (!api.active || document.hidden) return;
      const want = Math.min(window.devicePixelRatio || 1, 2);
      if (renderer.getPixelRatio() !== want) { renderer.setPixelRatio(want); renderer.setSize(cw, ch, false); }
      stepCamAnim();
      const moved = controls.update();
      layoutLabels();
      renderer.render(scene, camera);
      if (moved || camAnim) requestRender();
    }
    function requestRender() {
      if (raf || !api.active) return;
      raf = requestAnimationFrame(function () { raf = 0; renderNow(); });
    }
    function resize3() {
      if (!api.active || !cur) return;
      sizeCanvas();
      if (Math.abs(camera.aspect - lastAspect) > 1e-3) {
        const first = !lastAspect;
        lastAspect = camera.aspect;
        // 保留使用者轉到的方向，只重算距離
        fitCam(first ? null : camera.position.clone().sub(controls.target), false);
      }
      cur.update(performance.now());
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
      frame: function (now) {
        if (!api.active) return;
        if (!cur || S.mode !== modeName) { switchMode(false); lastAspect = camera.aspect; }
        cur.update(now || performance.now());
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        renderNow();
      },
      busy: function () { return !!camAnim; },
      onShow: function () { lastAspect = 0; resize3(); },
      onTheme: function () {
        colorVer++;
        C = B.colors();
        switchMode(true);
        api.frame(performance.now());
      },
      resetCamera: function () { fitCam(null, true); },
      /** 測試用：各拖曳把手目前在畫布上的位置（CSS px） */
      probe: function () {
        if (!cur) return [];
        return cur.handles().map(function (h) { pv.copy(h.p).project(camera); return { id: h.id, x: (pv.x + 1) / 2 * cw, y: (1 - pv.y) / 2 * ch }; });
      },
      /** 測試用：場景中一點 (x, y, z) 在畫布上的位置（CSS px） */
      screen: function (x, y, z) { pv.set(x, y, z || 0).project(camera); return { x: (pv.x + 1) / 2 * cw, y: (1 - pv.y) / 2 * ch }; },
      dispose: function () {
        api.active = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        endDrag();
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize3);
        document.removeEventListener('visibilitychange', onVisible);
        controls.dispose();
        disposeObject(scene);
        domeGeo.dispose();
        glowTex.dispose(); dotTex.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        wrap.remove();
      }
    };

    // 初始化
    switchMode(false);
    lastAspect = camera.aspect;
    cur.update(performance.now());
    return api;
  }

  window.Quake3D = { create: create };
})();
