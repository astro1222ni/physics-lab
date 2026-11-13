/*
 * ph-scale-3d.js — 「酸鹼強度與 pH」的 3D 立體檢視（可旋轉、縮放）
 *
 * three.js 由 ph-scale.js 在切換到 3D 時才以 import() 動態載入，再傳進 Ph3D.create(lib, host)。
 * 這個檔案只「讀」頁面的狀態（兩杯的粒子位置、溶液顏色、讀數文字），不改變任何化學量；2D 放大鏡與 3D 看的是同一批粒子。
 * 場景：兩顆放大的「液滴」（半徑 1 的玻璃球）左右並排，A 在左、B 在右；球裡是水分子（半透明）、溶質分子與離子。
 * 離子外面套一層半透明的「水合殼」：紅色帶正電、藍色帶負電。立體看才看得出解離的離子在溶液中是分散、被水包圍的。
 */
(function () {
  'use strict';
  const MAXA = 2 * (40 * 6 + 70 * 4);       // 溶質原子上限（每杯 40 個溶質 × 最多 6 個原子 ＋ 自由離子 × 4）
  const MAXW = 2 * 64 * 3;                  // 水分子的原子數
  const MAXH = 2 * 100;                     // 離子的水合殼
  const FL = 24;
  const SEP = 1.35;                         // 兩顆液滴的球心離原點的距離
  const R0 = 0.052;                         // 原子半徑單位（和 2D 一樣：液滴半徑的 0.052）
  const S = 0.98;                           // 粒子座標（單位球）→ 液滴內的位置

  function create(lib, H) {
    const THREE = lib.THREE;
    const T = H.T, host = H.host;

    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', T('兩杯溶液的 3D 立體檢視：放大的液滴裡有水分子、溶質分子與離子（拖曳旋轉、雙指或滾輪縮放）',
      '3D view of the two solutions: magnified droplets with water molecules, solute molecules and ions (drag to rotate, pinch or scroll to zoom)'));
    canvas.setAttribute('role', 'img');
    host.appendChild(canvas);
    const hudTL = document.createElement('div'), hudTR = document.createElement('div'), hudBL = document.createElement('div');
    hudTL.className = 'r3-hud tl'; hudTR.className = 'r3-hud tr'; hudBL.className = 'r3-hud bl';
    [hudTL, hudTR, hudBL].forEach(function (d) { d.setAttribute('aria-hidden', 'true'); host.appendChild(d); });
    hudBL.textContent = T('拖曳旋轉・滾輪或雙指縮放・紅殼正離子、藍殼負離子', 'Drag to rotate · scroll or pinch to zoom · red shell: positive ion, blue shell: negative ion');

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: 'default' });
    } catch (e) {
      canvas.remove(); hudTL.remove(); hudTR.remove(); hudBL.remove();
      throw e;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1.6, 0.2, 100);
    const viewDir = new THREE.Vector3(0.12, 0.32, 1).normalize();
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.minDistance = 2.5;
    controls.maxDistance = 20;
    controls.enablePan = false;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    sun.position.set(-3, 8, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -4; sun.shadow.camera.right = 4; sun.shadow.camera.top = 4; sun.shadow.camera.bottom = -4;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 20;
    sun.shadow.radius = 4;
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0xffffff, 0.45);
    rim.position.set(6, 2, -6);
    scene.add(rim);

    let colors = H.colors();
    const centers = [new THREE.Vector3(-SEP, 0, 0), new THREE.Vector3(SEP, 0, 0)];

    // ---------- 地面（只接收陰影） ----------
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(14, 8), new THREE.ShadowMaterial({ opacity: 0.16 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1.32;
    ground.receiveShadow = true;
    scene.add(ground);

    // 液滴在地面上的柔和陰影（徑向漸層貼圖，比幾百個原子各自投影乾淨）
    const blobTex = (function () {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.22)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      return new THREE.CanvasTexture(c);
    })();
    const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: 0.5 });
    // ---------- 液滴（玻璃球＋淡淡的溶液顏色）與底座 ----------
    const shellMat = [], tintMat = [], baseMat = new THREE.MeshStandardMaterial({ color: 0x9aa6ad, roughness: 0.45, metalness: 0.35 });
    centers.forEach(function (c, i) {
      const sm = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, roughness: 0.05, metalness: 0, depthWrite: false, side: THREE.DoubleSide });
      const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), sm);
      shell.position.copy(c); shell.renderOrder = 3;
      scene.add(shell); shellMat.push(sm);
      const tm = new THREE.MeshBasicMaterial({ color: 0x88ccee, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.BackSide });
      const tint = new THREE.Mesh(new THREE.SphereGeometry(0.985, 40, 28), tm);
      tint.position.copy(c); tint.renderOrder = 1;
      scene.add(tint); tintMat.push(tm);
      // 赤道環（讓球的立體感更明顯）
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.008, 6, 72), new THREE.MeshBasicMaterial({ color: 0x8899a0, transparent: true, opacity: 0.45 }));
      ring.position.copy(c); ring.rotation.x = Math.PI / 2;
      scene.add(ring);
      const blob = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.7), blobMat);
      blob.rotation.x = -Math.PI / 2; blob.position.set(c.x + 0.25, -1.315, c.z - 0.2);
      scene.add(blob);
      // 底座
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.52, 0.1, 40), baseMat);
      base.position.set(c.x, -1.27, c.z); base.castShadow = true; base.receiveShadow = true;
      scene.add(base);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.28, 16), baseMat);
      post.position.set(c.x, -1.08, c.z); post.castShadow = true;
      scene.add(post);
      const cup = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 8, 32), baseMat);
      cup.position.set(c.x, -0.95, c.z); cup.rotation.x = Math.PI / 2;
      scene.add(cup);
    });

    // ---------- 標籤（畫在 2D 畫布上，簡體會自動轉換） ----------
    function makeLabel() {
      const cv = document.createElement('canvas'); cv.width = 512; cv.height = 160;
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
      sp.scale.set(1.6, 0.5, 1);
      sp.renderOrder = 10;
      scene.add(sp);
      return { cv: cv, tex: tex, sp: sp, key: '' };
    }
    const labels = [makeLabel(), makeLabel()];
    labels.forEach(function (L, i) { L.sp.position.set(centers[i].x, 1.42, 0); });
    function drawFormula(g, f, x, y, px) {
      const parts = [];
      f.replace(/([^\d]+)(\d*)/g, function (s, a, d) { parts.push([a, 0]); if (d) parts.push([d, 1]); return s; });
      let cx = x;
      parts.forEach(function (p) {
        g.font = (p[1] ? 'bold ' + Math.round(px * 0.7) : 'bold ' + px) + 'px system-ui, sans-serif';
        g.fillText(p[0], cx, y + (p[1] ? px * 0.25 : 0));
        cx += g.measureText(p[0]).width;
      });
      return cx - x;
    }
    function measureFormula(g, f, px) {
      let w = 0;
      f.replace(/([^\d]+)(\d*)/g, function (s, a, d) {
        g.font = 'bold ' + px + 'px system-ui, sans-serif'; w += g.measureText(a).width;
        if (d) { g.font = 'bold ' + Math.round(px * 0.7) + 'px system-ui, sans-serif'; w += g.measureText(d).width; }
        return s;
      });
      return w;
    }
    function updateLabel(i) {
      const id = H.IDS[i], L = labels[i], lb = H.label(id), accent = colors[id];
      const key = [lb.name, lb.f, lb.pH, lb.alpha, accent, colors.dark].join('|');
      if (key === L.key) return;
      L.key = key;
      const g = L.cv.getContext('2d');
      g.clearRect(0, 0, 512, 160);
      g.fillStyle = colors.dark ? 'rgba(18,26,29,0.86)' : 'rgba(255,255,255,0.9)';
      g.strokeStyle = accent; g.lineWidth = 4;
      g.beginPath(); g.roundRect ? g.roundRect(8, 8, 496, 144, 28) : g.rect(8, 8, 496, 144); g.fill(); g.stroke();
      g.fillStyle = colors.text; g.textBaseline = 'middle'; g.textAlign = 'left';
      g.font = 'bold 40px system-ui, sans-serif';
      const w1 = g.measureText(lb.name + ' ').width, w2 = measureFormula(g, lb.f, 40);
      let x = 256 - (w1 + w2) / 2;
      g.font = 'bold 40px system-ui, sans-serif';
      g.fillStyle = accent; g.fillText(lb.name + ' ', x, 52);
      g.fillStyle = colors.text; drawFormula(g, lb.f, x + w1, 52, 40);
      g.font = '34px system-ui, sans-serif'; g.textAlign = 'center';
      g.fillStyle = colors.text;
      g.fillText(lb.pH + '   ' + lb.alpha, 256, 112);
      L.tex.needsUpdate = true;
    }

    // ---------- 原子（同一個 InstancedMesh，每個原子一個實例） ----------
    const atomMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.32, metalness: 0.05 });
    const atoms = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 16, 12), atomMat, MAXA);
    atoms.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    atoms.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAXA * 3), 3);
    atoms.instanceColor.setUsage(THREE.DynamicDrawUsage);
    atoms.frustumCulled = false; atoms.count = 0;
    scene.add(atoms);
    // 水分子：較淡、不投影
    const waterMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0, transparent: true, opacity: 0.32, depthWrite: false });
    const waters = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), waterMat, MAXW);
    waters.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    waters.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAXW * 3), 3);
    waters.instanceColor.setUsage(THREE.DynamicDrawUsage);
    waters.frustumCulled = false; waters.count = 0; waters.renderOrder = 2;
    scene.add(waters);
    // 離子的水合殼
    const haloMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2, depthWrite: false });
    const halos = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 16, 12), haloMat, MAXH);
    halos.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    halos.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAXH * 3), 3);
    halos.instanceColor.setUsage(THREE.DynamicDrawUsage);
    halos.frustumCulled = false; halos.count = 0; halos.renderOrder = 4;
    scene.add(halos);

    // ---------- 閃光（質子跳上、跳下） ----------
    const glowTex = (function () {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    })();
    const sprites = [];
    for (let k = 0; k < FL; k++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      sp.visible = false;
      scene.add(sp);
      sprites.push(sp);
    }

    function applyColors() {
      colors = H.colors();
      shellMat.forEach(function (m) { m.opacity = colors.dark ? 0.08 : 0.12; });
      waterMat.opacity = colors.dark ? 0.26 : 0.34;
      haloMat.opacity = colors.dark ? 0.24 : 0.2;
      ground.material.opacity = colors.dark ? 0.32 : 0.16;
      blobMat.opacity = colors.dark ? 0.75 : 0.45;
      baseMat.color.set(colors.dark ? 0x6f7b82 : 0x9aa6ad);
      labels.forEach(function (L) { L.key = ''; });
    }

    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e3 = new THREE.Euler(), pv = new THREE.Vector3(), sv = new THREE.Vector3(), off = new THREE.Vector3();
    const tmpC = new THREE.Color(), cPos = new THREE.Color(), cNeg = new THREE.Color();
    function putMol(mesh, k, max, type, p, center, scale) {
      const mol = H.MOL[type];
      pv.set(center.x + p.x * S, center.y - p.y * S, center.z + p.z * S);
      e3.set(p.tilt, 0, -p.a);
      q.setFromEuler(e3);
      for (let j = 0; j < mol.length && k < max; j++) {
        const at = mol[j];
        off.set(at[1] * R0, -at[2] * R0, 0).applyQuaternion(q);
        const r = H.ATOM_R[at[0]] * R0 * scale;
        sv.set(r, r, r);
        m4.compose(off.add(pv), q, sv);
        mesh.setMatrixAt(k, m4);
        tmpC.set(colors.atom[at[0]] || '#888888');
        mesh.setColorAt(k, tmpC);
        k++;
      }
      return k;
    }
    function update(now) {
      cPos.set(colors.pos); cNeg.set(colors.neg);
      let ka = 0, kw = 0, kh = 0, ks = 0;
      H.IDS.forEach(function (id, i) {
        const pool = H.pools[id], c = centers[i];
        tintMat[i].color.set(H.liquid(id));
        tintMat[i].opacity = H.ind() ? (colors.dark ? 0.22 : 0.2) : (colors.dark ? 0.1 : 0.12);
        pool.water.forEach(function (p) { kw = putMol(waters, kw, MAXW, 'H2O', p, c, 0.95); });
        const list = [];
        pool.units.forEach(function (u) { list.push([u, H.unitType(pool.sp, u.st)]); });
        pool.free.forEach(function (f) { list.push([f, f.type]); });
        list.forEach(function (o) {
          const p = o[0], type = o[1], fade = Math.min(1, (now - p.born) / 300);
          ka = putMol(atoms, ka, MAXA, type, p, c, 0.4 + 0.6 * fade);
          const qq = H.CHARGE[type] || 0;
          if (qq && kh < MAXH) {
            pv.set(c.x + p.x * S, c.y - p.y * S, c.z + p.z * S);
            const r = R0 * 2.1 * (0.4 + 0.6 * fade);
            sv.set(r, r, r); q.identity();
            m4.compose(pv, q, sv);
            halos.setMatrixAt(kh, m4);
            halos.setColorAt(kh, qq > 0 ? cPos : cNeg);
            kh++;
          }
        });
        pool.flashes.forEach(function (f) {
          if (ks >= FL) return;
          const u = (now - f.t0) / H.FL_DUR;
          if (u < 0 || u > 1) return;
          const sp = sprites[ks++];
          sp.visible = true;
          sp.position.set(c.x + f.x * S, c.y - f.y * S, c.z + f.z * S);
          sp.material.color.set(f.kind ? colors.neg : colors.pos);
          sp.material.opacity = 0.9 * (1 - u);
          sp.scale.setScalar(R0 * (4 + 6 * u));
        });
        updateLabel(i);
      });
      for (let s = ks; s < FL; s++) sprites[s].visible = false;
      atoms.count = ka; waters.count = kw; halos.count = kh;
      [atoms, waters, halos].forEach(function (m) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; });
      const hd = H.hud();
      hudTL.textContent = hd.tl; hudTR.textContent = hd.tr;
      hudTL.style.color = colors.A; hudTR.style.color = colors.B;
    }

    function fit(force) {
      const span = 2 * SEP + 2.6;
      const dist = (span * 0.44) / Math.tan(camera.fov * Math.PI / 360) / Math.min(1.3, camera.aspect);
      if (force) {
        controls.target.set(0, 0.05, 0);
        camera.position.copy(viewDir).multiplyScalar(dist).add(controls.target);
      }
      camera.updateProjectionMatrix();
      controls.update();
    }
    let vw = 0, raf = 0;
    function canvasHeight(w) { return w < 560 ? Math.round(Math.max(300, w * 0.95)) : 440; }
    function resize3() {
      const w = host.clientWidth;
      if (!w) return;
      const h = canvasHeight(w);
      canvas.style.height = h + 'px';
      vw = w;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      fit(true);
      requestRender();
    }
    function renderNow(now) {
      if (!api.active || document.hidden) return;
      const moved = controls.update();
      update(now || performance.now());
      renderer.render(scene, camera);
      if (moved && H.reduced) requestRender();
    }
    function requestRender() {
      if (raf || !api.active) return;
      raf = requestAnimationFrame(function (t) { raf = 0; if (H.reduced) renderNow(t); });
    }
    const ro = window.ResizeObserver ? new ResizeObserver(function () { if (host.clientWidth !== vw) resize3(); }) : null;
    if (ro) ro.observe(host); else window.addEventListener('resize', resize3);
    controls.addEventListener('change', requestRender);
    canvas.addEventListener('webglcontextlost', function (ev) {
      ev.preventDefault();
      if (api.active) H.contextLost();
    });

    const api = {
      active: true,
      frame: function (now) { if (api.active) renderNow(now); },
      onTheme: function () { applyColors(); requestRender(); },
      resetCamera: function () { fit(true); requestRender(); },
      dispose: function () {
        api.active = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize3);
        controls.dispose();
        const mats = new Set();
        scene.traverse(function (o) {
          if (o.geometry) o.geometry.dispose();
          if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { mats.add(m); });
        });
        mats.forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); });
        glowTex.dispose(); blobTex.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        canvas.remove(); hudTL.remove(); hudTR.remove(); hudBL.remove();
      }
    };

    applyColors();
    const w0 = host.clientWidth;
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

  window.Ph3D = { create: create };
})();
