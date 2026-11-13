/*
 * mole-concept-3d.js — 「莫耳與亞佛加厥數」的 3D 檢視：1 莫耳各物質的實際大小（可旋轉、縮放）
 *
 * three.js 由 mole-concept.js 在切換到 3D 時才以 import() 動態載入，再傳進 MC3D.create(lib, host)。
 * 這個檔案只「讀」頁面的狀態（host.data()），不改變任何數據。場景單位是公分（1 單位 = 1 cm）。
 * 後排：每種固體、液體 1 莫耳的立方體（邊長 = (M ÷ ρ)^(1/3)），與 1 莫耳氣體的立方體（22.4 L 或 24.5 L）；
 * 前排：天平上 A、B 兩盤目前的樣品（同樣依實際體積）。2D 只能比面積，3D 才看得出體積是邊長的三次方。
 */
(function () {
  'use strict';

  function create(lib, H) {
    const THREE = lib.THREE;
    const T = H.T, host = H.host;

    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', T('1 莫耳各種物質的實際大小（3D，拖曳旋轉、雙指或滾輪縮放）', 'The real size of one mole of each substance (3D; drag to rotate, pinch or scroll to zoom)'));
    canvas.setAttribute('role', 'img');
    host.appendChild(canvas);
    const hudTL = document.createElement('div'), hudBL = document.createElement('div');
    hudTL.className = 'r3-hud tl'; hudBL.className = 'r3-hud bl';
    [hudTL, hudBL].forEach(function (d) { d.setAttribute('aria-hidden', 'true'); host.appendChild(d); });
    hudBL.textContent = T('拖曳旋轉・滾輪或雙指縮放', 'Drag to rotate · scroll or pinch to zoom');

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: 'default' });
    } catch (e) { canvas.remove(); hudTL.remove(); hudBL.remove(); throw e; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1.5, 0.5, 5000);
    const viewDir = new THREE.Vector3(0.3, 0.7, 1).normalize();
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true; controls.dampingFactor = 0.12;
    controls.enablePan = false; controls.maxPolarAngle = Math.PI * 0.49;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 1.3));
    const sun = new THREE.DirectionalLight(0xffffff, 1.8); sun.position.set(-30, 60, 40); scene.add(sun);
    const rim = new THREE.DirectionalLight(0xffffff, 0.5); rim.position.set(40, 20, -40); scene.add(rim);

    const floorMat = new THREE.MeshStandardMaterial({ color: 0xdfe3e8, roughness: 0.9, metalness: 0 });
    const floor = new THREE.Mesh(new THREE.BoxGeometry(1, 0.2, 1), floorMat);
    floor.position.y = -0.1;
    scene.add(floor);

    const group = new THREE.Group();
    scene.add(group);
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const edgeGeo = new THREE.EdgesGeometry(boxGeo);
    let labelTex = [];

    function matFor(o) {
      const c = new THREE.Color(o.color);
      if (o.phase === 'g') return new THREE.MeshStandardMaterial({ color: c, transparent: true, opacity: o.id === 'Cl2' ? 0.32 : 0.16, roughness: 0.5, depthWrite: false });
      if (o.phase === 'l' && o.id !== 'Hg') return new THREE.MeshPhysicalMaterial({ color: c, transparent: true, opacity: 0.6, roughness: 0.08, metalness: 0, clearcoat: 1 });
      const metal = ['Al', 'Fe', 'Cu', 'Au', 'Hg'].indexOf(o.id) >= 0;
      return new THREE.MeshStandardMaterial({ color: c, roughness: metal ? 0.32 : o.id === 'C' ? 0.75 : 0.45, metalness: metal ? 0.85 : 0, transparent: o.id === 'NaCl' || o.id === 'C12H22O11', opacity: 0.92 });
    }
    function label(lines, color, hcm, chem) {
      const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
      const g = cv.getContext('2d');
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      const halo = H.colors().dark ? 'rgba(10,12,16,0.9)' : 'rgba(255,255,255,0.92)';
      lines.forEach(function (s, i) {
        const y = 40 + i * 50, big = i ? '500 30px system-ui, sans-serif' : '700 40px system-ui, sans-serif', sm = '700 27px system-ui, sans-serif';
        // 化學式的數字畫成下標（不用 Unicode 上下標字元）
        const parts = i || !chem ? [s] : s.split(/(\d+)/).filter(Boolean);   // 只有化學式的數字畫成下標
        let w = 0;
        parts.forEach(function (p) { g.font = !i && chem && /^\d/.test(p) ? sm : big; w += g.measureText(p).width; });
        let xx = 256 - w / 2;
        g.textAlign = 'left';
        parts.forEach(function (p) {
          const isSub = !i && chem && /^\d/.test(p);
          g.font = isSub ? sm : big;
          const yy = y + (isSub ? 10 : 0);
          g.lineWidth = 7; g.strokeStyle = halo; g.strokeText(p, xx, yy);
          g.fillStyle = i ? (H.colors().dark ? '#c9d1d9' : '#3a4250') : color; g.fillText(p, xx, yy);
          xx += g.measureText(p).width;
        });
      });
      const tex = new THREE.CanvasTexture(cv);
      if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
      labelTex.push(tex);
      // 標籤用固定的螢幕大小（不隨距離縮小），底邊對齊放置點
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, sizeAttenuation: false }));
      const f = hcm / 2.4;
      sp.scale.set(0.24 * f, 0.06 * f, 1);
      sp.center.set(0.5, 0);
      sp.renderOrder = 10;
      return sp;
    }
    function cubeAt(o, x, z, edgeColor) {
      const s = Math.max(o.side, 0.02);
      const m = new THREE.Mesh(boxGeo, matFor(o));
      m.scale.set(s, s, s); m.position.set(x, s / 2, z);
      group.add(m);
      const e = new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color: edgeColor || new THREE.Color(o.color).multiplyScalar(0.5), transparent: true, opacity: o.phase === 'g' ? 0.9 : 0.5 }));
      e.scale.copy(m.scale); e.position.copy(m.position);
      group.add(e);
      return s;
    }
    function fmtMass(m) { return m >= 100 ? m.toFixed(0) + ' g' : m >= 1 ? m.toFixed(1) + ' g' : m >= 0.01 ? m.toFixed(3) + ' g' : m.toFixed(4) + ' g'; }

    let span = 40, radius = 30, center = new THREE.Vector3(), size3 = new THREE.Vector3();
    function build() {
      // 清掉舊的
      group.children.slice().forEach(function (o) { group.remove(o); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
      labelTex.forEach(function (t) { t.dispose(); }); labelTex = [];
      const d = H.data(), col = H.colors();
      // 後排：1 莫耳
      // 固體、液體 1 莫耳：兩排、每排 5 個（由小到大），格距 7.5 cm
      const PITCH = 9, COLS = 5;
      const one = d.one.slice().sort(function (a, b) { return a.side - b.side; });
      const gx0 = -(COLS - 1) * PITCH / 2;
      one.forEach(function (o, i) {
        const x = gx0 + (i % COLS) * PITCH, z = Math.floor(i / COLS) * 9;
        cubeAt(o, x, z);
        const lb = label([o.f, fmtMass(o.mass)], col.text, 1.8, true);
        lb.position.set(x, o.side + 0.4, z);
        group.add(lb);
      });
      // 氣體 1 莫耳：放在後面
      const gs = d.gas.side, gz = -gs / 2 - 6;
      cubeAt({ id: 'O2', phase: 'g', color: '#7fcfff', side: gs }, 0, gz);
      const glb = label([T('任何氣體 1 mol', 'Any gas, 1 mol'), d.gas.V.toFixed(1) + ' L'], col.text, 3.2);
      glb.position.set(0, gs + 0.5, gz + gs / 2); group.add(glb);   // 放在氣體立方體正面的上緣
      // 10 cm 尺
      const rz = 13.5, rx = gx0 - 2;
      const ruler = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0xf2c94c, roughness: 0.6 }));
      ruler.scale.set(10, 0.15, 0.8); ruler.position.set(rx + 5, 0.075, rz); group.add(ruler);
      for (let k = 0; k <= 10; k++) {
        const t = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ color: 0x333333 }));
        t.scale.set(0.06, 0.02, k % 5 ? 0.3 : 0.55); t.position.set(rx + k, 0.16, rz - 0.4 + (k % 5 ? 0.15 : 0.275)); group.add(t);
      }
      const rl = label(['10 cm', ''], col.text, 2.4); rl.position.set(rx + 5, 0.4, rz); group.add(rl);
      // 前排：A、B 兩盤目前的樣品
      const big = Math.max(d.A.side, d.B.side), fz = 22 + big / 2;
      [[d.A, -1, col.neg, 'A'], [d.B, 1, col.pos, 'B']].forEach(function (q) {
        const o = q[0], s = Math.max(o.side, 0.02), xx = q[1] * (big / 2 + 5);
        cubeAt(o, xx, fz, new THREE.Color(q[2]));
        const lb = label([q[3] + ' ' + o.f, fmtMass(o.mass)], q[2], 2.7, true);
        lb.position.set(xx, s + 0.5, fz); group.add(lb);
      });
      // 視野範圍
      const box = new THREE.Box3().setFromObject(group);
      box.getCenter(center);
      const size = new THREE.Vector3(); box.getSize(size);
      size3.copy(size);
      span = Math.max(size.x, size.z, size.y, 24);
      radius = Math.max(12, size.length() / 2);
      floor.scale.set(size.x + 16, 1, size.z + 16);
      floor.position.set(center.x, -0.1, center.z);
      controls.minDistance = 3; controls.maxDistance = span * 6;
      hudTL.textContent = T('後排：每種都是 1 莫耳｜前排：天平上的 A、B', 'Back row: one mole of each | front: pans A and B');
    }
    function applyColors() {
      const col = H.colors();
      floorMat.color.set(col.dark ? 0x2a3036 : 0xe3e7ec);
    }

    function fit(force) {
      // 包住整個場景的球：半徑 radius，鏡頭距離讓球剛好放進視野（直、橫取較緊的一邊）
      const half = camera.fov * Math.PI / 360;
      const dist = radius * 0.92 / Math.sin(Math.min(half, Math.atan(Math.tan(half) * camera.aspect)));
      if (force) {
        controls.target.set(center.x, center.y * 0.45, center.z + size3.z * 0.12);
        camera.position.copy(viewDir).multiplyScalar(dist).add(controls.target);
      }
      camera.far = Math.max(500, dist * 8);
      camera.updateProjectionMatrix();
      controls.update();
    }
    let vw = 0, raf = 0;
    function canvasHeight(w) { return w < 560 ? Math.round(Math.max(400, w * 1.12)) : 440; }
    function resize3() {
      const w = host.clientWidth;
      if (!w) return;
      const h = canvasHeight(w);
      canvas.style.height = h + 'px';
      vw = w;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      fit(false);
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
    canvas.addEventListener('webglcontextlost', function (ev) { ev.preventDefault(); if (api.active) H.contextLost(); });

    let lastKey = '';
    const api = {
      active: true,
      update: function () {
        if (!api.active) return;
        const d = H.data();
        const key = [d.A.id, d.B.id, d.gas.cond, Math.max(d.A.side, d.B.side) > span * 0.3 ? 'big' : 'ok'].join('|');
        build();
        if (key !== lastKey) { lastKey = key; fit(true); }
        requestRender();
      },
      onTheme: function () { applyColors(); build(); requestRender(); },
      resetCamera: function () { fit(true); requestRender(); },
      dispose: function () {
        api.active = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize3);
        document.removeEventListener('visibilitychange', onVisible);
        controls.dispose();
        const mats = new Set(), geos = new Set();
        scene.traverse(function (o) {
          if (o.geometry) geos.add(o.geometry);
          if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { mats.add(m); });
        });
        geos.add(boxGeo); geos.add(edgeGeo);
        geos.forEach(function (g) { g.dispose(); });
        mats.forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); });
        labelTex.forEach(function (t) { t.dispose(); });
        renderer.dispose();
        renderer.forceContextLoss();
        canvas.remove(); hudTL.remove(); hudBL.remove();
      }
    };

    applyColors();
    const w0 = host.clientWidth;
    if (w0) { const h0 = canvasHeight(w0); canvas.style.height = h0 + 'px'; vw = w0; renderer.setSize(w0, h0, false); camera.aspect = w0 / h0; }
    build();
    fit(true);
    lastKey = '';
    return api;
  }

  window.MC3D = { create: create };
})();
