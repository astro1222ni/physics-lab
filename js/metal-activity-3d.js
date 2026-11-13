/*
 * metal-activity-3d.js — 「金屬活性序」的 3D 檢視：把選取試管裡的金屬表面放大到原子尺度（示意圖，未依比例）
 *
 * three.js 由 metal-activity.js 在切換到 3D 時才以 import() 動態載入，再傳進 MetalAct3D.create(lib, host)。
 * 這個檔案只「讀」頁面算好的量（金屬剩下的比例、析出量、溶液中各離子濃度、反應速率、pH），不改變任何化學量。
 * 場景：金屬表面在 y = 0 的平面上（原子排成方格，三層），溶液在上方。
 *   金屬原子溶解 → 表層原子依「已溶解比例」消失；
 *   置換析出 → 析出原子在表面長成小島（數量依析出量）；
 *   電子（黃色小球）從溶解處經金屬流到析出處或 H+ 得到電子的地方，數量依當下的反應速率；
 *   氫氣氣泡依產氣速率；溶液裡的離子數依濃度（平方根壓縮，免得太擠）。
 */
(function () {
  'use strict';
  const NX = 16, NZ = 12, LAYERS = 3, SP = 1, RA = 0.5;
  const NTOP = NX * NZ, NMET = NTOP * LAYERS;
  const DEP_CAP = Math.round(NTOP * 1.6);
  const MAX_ION = 64, MAX_E = 28, MAX_B = 40, MAX_PPT = 24;
  const BOX_Y0 = 0.7, BOX_Y1 = 9, BX = NX * SP / 2 + 0.4, BZ = NZ * SP / 2 + 0.4;

  function rng(seed) { let a = seed % 2147483647; if (a <= 0) a += 2147483646; return function () { a = (a * 16807) % 2147483647; return (a - 1) / 2147483646; }; }
  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return Math.abs(h) || 7; }

  function create(lib, H) {
    const THREE = lib.THREE;
    const T = H.T, host = H.host;

    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', T('金屬表面的 3D 示意圖：金屬原子、析出的原子、溶液中的離子與電子的流動（拖曳旋轉、雙指或滾輪縮放）',
      '3D sketch of the metal surface: metal atoms, deposited atoms, ions in solution and the flow of electrons (drag to rotate, pinch or scroll to zoom)'));
    canvas.setAttribute('role', 'img');
    host.appendChild(canvas);
    const hudTL = document.createElement('div'), hudTR = document.createElement('div'), hudBL = document.createElement('div');
    hudTL.className = 'r3-hud tl'; hudTR.className = 'r3-hud tr'; hudBL.className = 'r3-hud bl';
    [hudTL, hudTR, hudBL].forEach(function (d) { d.setAttribute('aria-hidden', 'true'); host.appendChild(d); });

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: 'default' });
    } catch (e) {
      canvas.remove(); hudTL.remove(); hudTR.remove(); hudBL.remove();
      throw e;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1.5, 0.3, 200);
    const viewDir = new THREE.Vector3(0.25, 0.62, 1).normalize();
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.minDistance = 8;
    controls.maxDistance = 60;
    controls.enablePan = false;
    controls.maxPolarAngle = Math.PI * 0.49;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x7d828c, 1.35));
    const sun = new THREE.DirectionalLight(0xffffff, 2.1);
    sun.position.set(-8, 16, 10);
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0xffffff, 0.6);
    rim.position.set(12, 4, -10);
    scene.add(rim);

    let colors = H.colors();
    const C = function (c) { return new THREE.Color(c || '#888888'); };
    const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();
    function setInst(mesh, i, x, y, z, s) { tmpP.set(x, y, z); tmpS.set(s, s, s); tmpM.compose(tmpP, tmpQ, tmpS); mesh.setMatrixAt(i, tmpM); }
    function instMesh(geo, mat, n) {
      const m = new THREE.InstancedMesh(geo, mat, n);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
      m.instanceColor.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.count = 0;
      scene.add(m);
      return m;
    }
    const sphere = new THREE.SphereGeometry(1, 18, 12);

    // ---------- 金屬原子（三層方格，最上層會溶解） ----------
    const metalMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.28, metalness: 0.75 });
    const metal = instMesh(sphere, metalMat, NMET);
    const site = function (i, j) { return [(i - (NX - 1) / 2) * SP, (j - (NZ - 1) / 2) * SP]; };
    // ---------- 底座（金屬塊的切面） ----------
    const slabMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.45, metalness: 0.6 });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(NX * SP + 0.2, 1.2, NZ * SP + 0.2), slabMat);
    slab.position.y = -(LAYERS - 1) * SP * 0.82 - 0.9;
    scene.add(slab);
    // ---------- 氧化膜（鋁） ----------
    const filmMat = new THREE.MeshStandardMaterial({ color: 0xdfe5ec, roughness: 0.15, metalness: 0, transparent: true, opacity: 0.4, depthWrite: false });
    const film = new THREE.Mesh(new THREE.BoxGeometry(NX * SP + 0.1, 0.32, NZ * SP + 0.1), filmMat);
    film.position.y = RA + 0.18;
    film.renderOrder = 2;
    scene.add(film);
    // ---------- 析出原子 ----------
    const depMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.65 });
    const dep = instMesh(sphere, depMat, DEP_CAP);
    // ---------- 溶液（半透明的液體方塊） ----------
    const liqMat = new THREE.MeshPhysicalMaterial({ color: 0x9fc8ea, transparent: true, opacity: 0.1, roughness: 0.1, metalness: 0, depthWrite: false, side: THREE.DoubleSide });
    const liq = new THREE.Mesh(new THREE.BoxGeometry(BX * 2, BOX_Y1 - 0.2, BZ * 2), liqMat);
    liq.position.y = (BOX_Y1 + 0.2) / 2 - 0.05;
    liq.renderOrder = 3;
    scene.add(liq);
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x8899aa, transparent: true, opacity: 0.35 });
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(liq.geometry), edgeMat);
    edges.position.copy(liq.position);
    scene.add(edges);
    // ---------- 離子、電子、氣泡、沉澱 ----------
    const ionMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.05, transparent: true, opacity: 0.92 });
    const ions = instMesh(sphere, ionMat, MAX_ION * 3);
    const eMat = new THREE.MeshBasicMaterial({ color: 0xffd23a });
    const elec = instMesh(new THREE.SphereGeometry(1, 10, 8), eMat, MAX_E);
    const bubMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0, depthWrite: false });
    const bubs = instMesh(sphere, bubMat, MAX_B);
    bubs.renderOrder = 4;
    const pptMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0, transparent: true, opacity: 0.85 });
    const ppt = instMesh(new THREE.IcosahedronGeometry(1, 0), pptMat, MAX_PPT);

    // ---------- 依試管產生的固定隨機量 ----------
    let key = '', lay = null;
    function layout(tb) {
      const r = rng(hashStr(tb.key));
      // 最上層溶解的順序：從幾個「蝕坑」中心向外
      const pits = [];
      for (let k = 0; k < 5; k++) pits.push([r() * NX, r() * NZ]);
      const top = [];
      for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) {
        let d = 1e9;
        pits.forEach(function (p) { d = Math.min(d, Math.hypot(i - p[0], j - p[1])); });
        top.push({ i: i, j: j, d: d + r() * 2.2 });
      }
      top.sort(function (a, b) { return a.d - b.d; });
      // 析出：幾個島，每個島從中心向外長，第二層長在第一層之上
      const isl = [];
      for (let k = 0; k < 7; k++) isl.push([r() * (NX - 2) + 1, r() * (NZ - 2) + 1]);
      const dsites = [];
      for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) {
        let d = 1e9;
        isl.forEach(function (p) { d = Math.min(d, Math.hypot(i - p[0], j - p[1])); });
        dsites.push({ i: i, j: j, d: d + r() * 1.5, h: 0 });
        if (d < 2.6) dsites.push({ i: i, j: j, d: d * 2.2 + 3 + r() * 1.5, h: 1 });
      }
      dsites.sort(function (a, b) { return a.d - b.d; });
      const ionPos = [];
      for (let k = 0; k < MAX_ION * 3; k++) ionPos.push([(r() * 2 - 1) * (BX - 0.6), BOX_Y0 + 0.4 + r() * (BOX_Y1 - BOX_Y0 - 1.2), (r() * 2 - 1) * (BZ - 0.6), r() * 6.28, 0.6 + r() * 0.8]);
      const ePath = [];
      for (let k = 0; k < MAX_E; k++) ePath.push([r(), r(), r(), r()]);
      const bub = [];
      for (let k = 0; k < MAX_B; k++) bub.push([(r() * 2 - 1) * (BX - 1), (r() * 2 - 1) * (BZ - 1), r(), 0.18 + r() * 0.3]);
      const pp = [];
      for (let k = 0; k < MAX_PPT; k++) pp.push([(r() * 2 - 1) * (BX - 1), r(), (r() * 2 - 1) * (BZ - 1), r() * 6.28]);
      return { top: top, dsites: dsites.slice(0, DEP_CAP), ionPos: ionPos, ePath: ePath, bub: bub, pp: pp };
    }

    const ION_COL = { Cu: '#2f86d6', Fe: '#86c060', Ag: '#d9dde2', H: '#f5f5f5', OH: '#d75a4a' };
    function ionColor(sym) { return ION_COL[sym] || H.METAL_COL[sym] || '#bbbbbb'; }
    function nIon(c) { return c > 0 ? Math.min(MAX_ION, Math.max(1, Math.round(44 * Math.sqrt(c)))) : 0; }

    function applyColors() {
      colors = H.colors();
      edgeMat.color.set(colors.muted || '#8899aa');
      slabMat.color.set(colors.dark ? '#3b4048' : '#8a9099');
      requestRender();
    }

    const col = new THREE.Color();
    function update(now) {
      const tb = H.tube();
      const lab = H.label();
      hudTL.innerHTML = lab.tl;
      hudTR.textContent = lab.tr;
      if (!tb) {
        metal.count = 0; dep.count = 0; ions.count = 0; elec.count = 0; bubs.count = 0; ppt.count = 0; film.visible = false;
        return;
      }
      if (tb.key !== key) { key = tb.key; lay = layout(tb); }
      const tsec = H.reducedMotion ? 0 : now / 1000;
      // 金屬原子
      const mc = C(H.METAL_COL[tb.metal]);
      const removed = Math.round(NTOP * Math.min(1, 1 - tb.metalFrac));
      const removed2 = Math.round(NTOP * Math.max(0, Math.min(1, (1 - tb.metalFrac) * 2 - 1)) * 0.6);
      const gone = new Set(lay.top.slice(0, removed).map(function (s) { return s.i * NZ + s.j; }));
      const gone2 = new Set(lay.top.slice(0, removed2).map(function (s) { return s.i * NZ + s.j; }));
      let k = 0;
      for (let L = 0; L < LAYERS; L++) {
        for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) {
          const id = i * NZ + j;
          if (L === 0 && gone.has(id)) continue;
          if (L === 1 && gone2.has(id)) continue;
          const p = site(i, j);
          const off = L % 2 ? SP / 2 : 0;
          setInst(metal, k, p[0] + off * 0.0, -L * SP * 0.82, p[1] + off * 0.0, RA);
          col.copy(mc).multiplyScalar(1 - L * 0.12);
          metal.setColorAt(k, col);
          k++;
        }
      }
      metal.count = k;
      metal.instanceMatrix.needsUpdate = true;
      if (metal.instanceColor) metal.instanceColor.needsUpdate = true;
      // 氧化膜：鋁沒有 Cl- 時完整；有 Cl- 時隨反應進行而破洞
      film.visible = !!tb.oxide && tb.metalFrac > 0.01;
      filmMat.opacity = tb.hasCl ? 0.4 * Math.max(0, 1 - tb.eFrac * 4) : 0.42;
      // 析出原子
      const ncap = lay.dsites.length;
      const nd = tb.dep > 0 ? Math.min(ncap, Math.max(3, Math.round(ncap * Math.min(1, tb.dep / 1.0)))) : 0;
      const dc = C((H.DEP_COL && H.DEP_COL[tb.liquid]) || '#777777');
      for (let q = 0; q < nd; q++) {
        const s = lay.dsites[q], p = site(s.i, s.j);
        const y = (gone.has(s.i * NZ + s.j) ? 0 : SP * 0.82) + s.h * SP * 0.82;
        setInst(dep, q, p[0], y, p[1], RA * 0.98);
        col.copy(dc).multiplyScalar(0.88 + 0.24 * ((s.i * 7 + s.j * 3) % 5) / 5);
        dep.setColorAt(q, col);
      }
      dep.count = nd;
      dep.instanceMatrix.needsUpdate = true;
      if (dep.instanceColor) dep.instanceColor.needsUpdate = true;
      // 溶液中的離子
      const list = [];
      Object.keys(tb.ions || {}).forEach(function (s) { if (tb.ions[s] > 0) list.push([s, tb.ions[s]]); });
      if (tb.type === 'water' && tb.pH != null && tb.pH > 7.5) list.push(['OH', Math.pow(10, tb.pH - 14)]);
      let n = 0;
      list.forEach(function (it) {
        const cnt = Math.min(nIon(it[1]), MAX_ION * 3 - n);
        const cc = C(ionColor(it[0]));
        const rr = it[0] === 'H' ? 0.22 : it[0] === 'OH' ? 0.3 : 0.36;
        for (let q = 0; q < cnt; q++) {
          const p = lay.ionPos[n];
          const w = tsec * 0.35 * p[4] + p[3];
          setInst(ions, n, p[0] + Math.sin(w) * 0.5, p[1] + Math.sin(w * 1.3 + 1) * 0.35, p[2] + Math.cos(w * 0.9) * 0.5, rr);
          ions.setColorAt(n, cc);
          n++;
        }
      });
      ions.count = n;
      ions.instanceMatrix.needsUpdate = true;
      if (ions.instanceColor) ions.instanceColor.needsUpdate = true;
      // 溶液顏色
      const cu = (tb.ions && tb.ions.Cu) || 0;
      if (tb.phph && tb.pH != null && tb.pH >= 8.2) { liqMat.color.set('#e0479a'); liqMat.opacity = 0.06 + Math.min(0.14, (tb.pH - 8.2) / 1.6 * 0.14); }
      else if (cu > 0) { liqMat.color.set('#2f86d6'); liqMat.opacity = 0.05 + 0.16 * (1 - Math.exp(-cu * 9)); }
      else { liqMat.color.set('#9fc8ea'); liqMat.opacity = 0.07; }
      // 電子與氣泡：數量依當下速率（已乘上時間倍率），只在反應進行中出現
      const act = tb.done || H.reducedMotion ? 0 : Math.min(1, tb.rate * tb.speed * 40);
      const ne = Math.round(MAX_E * act);
      const gas = tb.type === 'acid' || tb.type === 'water';
      for (let q = 0; q < ne; q++) {
        const e = lay.ePath[q];
        const u = (tsec * (0.6 + e[3] * 0.5) + e[2]) % 1;
        // 起點：一個溶解中的表面位置；終點：析出島（置換）或任一表面點（H+ 在那裡得到電子）
        const a = lay.top[Math.floor(e[0] * Math.max(1, Math.min(NTOP, removed + 6)))];
        const bS = gas || !nd ? lay.top[Math.floor(e[1] * NTOP)] : lay.dsites[Math.floor(e[1] * nd)];
        const pa = site(a.i, a.j), pb = site(bS.i, bS.j);
        const x = pa[0] + (pb[0] - pa[0]) * u, z = pa[1] + (pb[1] - pa[1]) * u;
        const y = -0.35 + Math.sin(u * Math.PI) * 0.25 + (u > 0.85 ? (u - 0.85) / 0.15 * 1.0 : 0);
        setInst(elec, q, x, y + 0.55, z, 0.13);
        elec.setColorAt(q, C('#ffd23a'));
      }
      elec.count = ne;
      elec.instanceMatrix.needsUpdate = true;
      if (elec.instanceColor) elec.instanceColor.needsUpdate = true;
      const nb = gas ? Math.round(MAX_B * act) : 0;
      for (let q = 0; q < nb; q++) {
        const b = lay.bub[q];
        const u = (tsec * (0.18 + b[3] * 0.3) + b[2]) % 1;
        setInst(bubs, q, b[0] + Math.sin(u * 9 + q) * 0.2, 0.9 + u * (BOX_Y1 - 1.4), b[1], b[3] * (0.8 + u * 0.8) * 1.6);
        bubs.setColorAt(q, C('#ffffff'));
      }
      bubs.count = nb;
      bubs.instanceMatrix.needsUpdate = true;
      if (bubs.instanceColor) bubs.instanceColor.needsUpdate = true;
      // 沉澱（氫氧化物、AgCl…）：小團塊慢慢往下沉
      let np = 0;
      (tb.ppt || []).forEach(function (p) {
        const cnt = Math.min(MAX_PPT - np, Math.round(Math.min(1, p.mmol * 1.2) * 10));
        const cc = C((H.PPT_COL && H.PPT_COL[p.kind]) || '#f1f1ee');
        for (let q = 0; q < cnt; q++) {
          const s = lay.pp[np];
          const y = BOX_Y0 + 0.5 + ((s[1] - tsec * 0.03) % 1 + 1) % 1 * (BOX_Y1 - BOX_Y0 - 1.5);
          tmpQ.setFromAxisAngle(tmpS.set(0.3, 1, 0.2).normalize(), s[3] + tsec * 0.2);
          setInst(ppt, np, s[0], y, s[2], 0.32);
          tmpQ.identity();
          ppt.setColorAt(np, cc);
          np++;
        }
      });
      ppt.count = np;
      ppt.instanceMatrix.needsUpdate = true;
      if (ppt.instanceColor) ppt.instanceColor.needsUpdate = true;
    }

    function fit(force) {
      const span = NX * SP + 4;
      const dist = (span * 0.5) / Math.tan(camera.fov * Math.PI / 360) / Math.min(1.3, camera.aspect) + 4;
      if (force) {
        controls.target.set(0, 2.2, 0);
        camera.position.copy(viewDir).multiplyScalar(dist).add(controls.target);
      }
      camera.updateProjectionMatrix();
      controls.update();
    }
    let vw = 0, raf = 0;
    function canvasHeight(w) { return w < 560 ? Math.round(Math.max(300, w * 0.9)) : 420; }
    function resize3() {
      const w = host.clientWidth;
      if (!w) return;
      const h = canvasHeight(w);
      canvas.style.height = h + 'px';
      vw = w;
      setHint(w);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      fit(false);
      requestRender();
    }
    function renderNow() {
      if (!api.active || document.hidden) return;
      const moved = controls.update();
      update(performance.now());
      renderer.render(scene, camera);
      if (moved && !H.running()) requestRender();
    }
    function requestRender() {
      if (raf || !api.active) return;
      raf = requestAnimationFrame(function () { raf = 0; if (!H.running()) renderNow(); });
    }
    const ro = window.ResizeObserver ? new ResizeObserver(function () { if (host.clientWidth !== vw) resize3(); }) : null;
    if (ro) ro.observe(host); else window.addEventListener('resize', resize3);
    controls.addEventListener('change', requestRender);
    const onVisible = function () { if (!document.hidden) requestRender(); };
    document.addEventListener('visibilitychange', onVisible);
    canvas.addEventListener('webglcontextlost', function (ev) {
      ev.preventDefault();
      if (api.active) H.contextLost();
    });

    function setHint(w) {
      hudBL.textContent = w < 560 ? T('示意圖（未依比例）・黃點是電子', 'Sketch, not to scale · yellow dots: electrons')
        : T('示意圖（未依比例）・黃點是電子・拖曳旋轉、滾輪或雙指縮放', 'Sketch, not to scale · yellow dots are electrons · drag to rotate, scroll or pinch to zoom');
    }

    const api = {
      active: true,
      frame: function () { if (api.active) renderNow(); },
      onSelect: function () { requestRender(); },
      onTheme: function () { applyColors(); },
      resetCamera: function () { fit(true); requestRender(); },
      dispose: function () {
        api.active = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize3);
        document.removeEventListener('visibilitychange', onVisible);
        controls.dispose();
        const mats = new Set();
        scene.traverse(function (o) {
          if (o.geometry) o.geometry.dispose();
          if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { mats.add(m); });
        });
        mats.forEach(function (m) { m.dispose(); });
        renderer.dispose();
        renderer.forceContextLoss();
        canvas.remove(); hudTL.remove(); hudTR.remove(); hudBL.remove();
      }
    };

    applyColors();
    const w0 = host.clientWidth;
    setHint(w0 || 800);
    if (w0) {
      const h0 = canvasHeight(w0);
      canvas.style.height = h0 + 'px';
      vw = w0;
      renderer.setSize(w0, h0, false);
      camera.aspect = w0 / h0;
    }
    fit(true);
    return api;
  }

  window.MetalAct3D = { create: create };
})();
