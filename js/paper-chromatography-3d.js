/*
 * paper-chromatography-3d.js — 「紙色層分析」的 3D 立體檢視（可旋轉、縮放）
 *
 * three.js 由 paper-chromatography.js 在切換到 3D 時才以 import() 動態載入，再傳進 Chrom3D.create(lib, host)。
 * 這個檔案只「讀」頁面的狀態，不改變任何化學量：濾紙的貼圖就是 2D 畫面用的同一張離屏畫布（斑點位置由化學核心算出），
 * 液面高度、起始線、濾紙吊起的高度、蓋子的位置都和 2D 相同。單位：1 = 1 cm。
 * 場景：玻璃展開槽（寬 13、深 6、高 20 cm）放在實驗桌上，濾紙吊在槽中央的玻璃棒上，下緣浸在展開液裡；槽外右邊立著一把尺。
 */
(function () {
  'use strict';
  function create(lib, H) {
    const THREE = lib.THREE;
    const T = H.T, host = H.host, PW = H.PAPER.W, PHh = H.PAPER.H, TK = H.TANK;
    const DEPTH = 6, TW = TK.x1 - TK.x0, TH = TK.top, CXT = (TK.x0 + TK.x1) / 2;

    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', T('展開槽的 3D 立體檢視：密封的玻璃槽、吊在玻璃棒上的濾紙與槽底的展開液（拖曳旋轉、雙指或滾輪縮放）',
      '3D view of the developing tank: the sealed glass tank, the paper hanging from a glass rod and the solvent at the bottom (drag to rotate, pinch or scroll to zoom)'));
    canvas.setAttribute('role', 'img');
    host.appendChild(canvas);
    const hudTL = document.createElement('div'), hudTR = document.createElement('div'), hudBL = document.createElement('div');
    hudTL.className = 'r3-hud tl'; hudTR.className = 'r3-hud tr'; hudBL.className = 'r3-hud bl';
    [hudTL, hudTR, hudBL].forEach(function (d) { d.setAttribute('aria-hidden', 'true'); host.appendChild(d); });
    hudBL.textContent = T('拖曳旋轉・滾輪或雙指縮放', 'Drag to rotate · scroll or pinch to zoom');

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
    const camera = new THREE.PerspectiveCamera(32, 1.4, 0.5, 400);
    const viewDir = new THREE.Vector3(0.55, 0.32, 1).normalize();
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.minDistance = 12;
    controls.maxDistance = 120;
    controls.enablePan = false;
    controls.maxPolarAngle = Math.PI * 0.53;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x9a948a, 1.35));
    const sun = new THREE.DirectionalLight(0xffffff, 1.7);
    sun.position.set(-14, 30, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const sc = sun.shadow.camera; sc.left = -18; sc.right = 22; sc.top = 26; sc.bottom = -6; sc.near = 1; sc.far = 80;
    sun.shadow.bias = -0.0008;
    sun.target.position.set(CXT, 6, 0);
    scene.add(sun); scene.add(sun.target);
    const fill = new THREE.DirectionalLight(0xffffff, 0.45);
    fill.position.set(20, 8, -12);
    scene.add(fill);

    let colors = H.colors();
    const disposables = [];
    function tex(c) { const t = new THREE.CanvasTexture(c); disposables.push(t); return t; }

    // ---------- 實驗桌 ----------
    const benchMat = new THREE.MeshStandardMaterial({ color: 0xd9d2c3, roughness: 0.85, metalness: 0 });
    const bench = new THREE.Mesh(new THREE.BoxGeometry(60, 1, 34), benchMat);
    bench.position.set(CXT + 3, -1.1, 0);
    bench.receiveShadow = true;
    scene.add(bench);
    // ---------- 玻璃展開槽 ----------
    const glassMat = new THREE.MeshPhysicalMaterial({ color: 0xe8f2fa, transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0, depthWrite: false, side: THREE.DoubleSide });
    const tank = new THREE.Mesh(new THREE.BoxGeometry(TW, TH, DEPTH), glassMat);
    tank.position.set(CXT, TH / 2, 0);
    tank.renderOrder = 4;
    scene.add(tank);
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x9fb4c8, transparent: true, opacity: 0.7 });
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(tank.geometry), edgeMat);
    edges.position.copy(tank.position);
    scene.add(edges);
    const baseMat = new THREE.MeshPhysicalMaterial({ color: 0xcfe0ec, transparent: true, opacity: 0.55, roughness: 0.1 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(TW + 0.6, 0.6, DEPTH + 0.6), baseMat);
    base.position.set(CXT, -0.3, 0);
    base.receiveShadow = true;
    scene.add(base);
    // ---------- 展開液 ----------
    const liqMat = new THREE.MeshPhysicalMaterial({ color: 0xbcd9ee, transparent: true, opacity: 0.5, roughness: 0.05, depthWrite: false });
    const liquid = new THREE.Mesh(new THREE.BoxGeometry(TW - 0.08, 1, DEPTH - 0.08), liqMat);
    liquid.renderOrder = 3;
    scene.add(liquid);
    // ---------- 槽內蒸氣（蓋著蓋子時） ----------
    const vapMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
    const vapour = new THREE.Mesh(new THREE.BoxGeometry(TW - 0.2, 1, DEPTH - 0.2), vapMat);
    vapour.renderOrder = 2;
    scene.add(vapour);
    // ---------- 濾紙（貼圖 = 2D 用的同一張畫布） ----------
    const paperTex = tex(H.paper());
    if ('colorSpace' in paperTex && THREE.SRGBColorSpace) paperTex.colorSpace = THREE.SRGBColorSpace;
    paperTex.anisotropy = 4;
    const paperMat = new THREE.MeshStandardMaterial({ map: paperTex, roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(PW, PHh), paperMat);
    paper.castShadow = true;
    paper.renderOrder = 1;
    scene.add(paper);
    // ---------- 玻璃棒、夾子 ----------
    const rodMat = new THREE.MeshPhysicalMaterial({ color: 0xdfeaf2, transparent: true, opacity: 0.75, roughness: 0.08 });
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, TW - 0.1, 20), rodMat);
    rod.rotation.z = Math.PI / 2;
    rod.castShadow = true;
    scene.add(rod);
    const clipMat = new THREE.MeshStandardMaterial({ color: 0x33383f, roughness: 0.45, metalness: 0.4 });
    const clip = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.0, 0.35), clipMat);
    clip.castShadow = true;
    scene.add(clip);
    // ---------- 蓋子 ----------
    const lidMat = new THREE.MeshPhysicalMaterial({ color: 0xe8f2fa, transparent: true, opacity: 0.35, roughness: 0.05, depthWrite: false });
    const lid = new THREE.Mesh(new THREE.BoxGeometry(TW + 1.2, 0.4, DEPTH + 1.2), lidMat);
    lid.renderOrder = 5;
    scene.add(lid);
    const lidEdge = new THREE.LineSegments(new THREE.EdgesGeometry(lid.geometry), edgeMat);
    scene.add(lidEdge);
    // ---------- 尺（槽外右側，零點對齊起始線） ----------
    const rc = document.createElement('canvas');
    rc.width = 96; rc.height = 18 * 48;
    (function drawRuler() {
      const g = rc.getContext('2d'), s = 48;     // 每公分 48 像素，範圍 −1～17 cm
      const gr = g.createLinearGradient(0, 0, rc.width, 0);
      gr.addColorStop(0, '#f3e6b4'); gr.addColorStop(1, '#e2d197');
      g.fillStyle = gr; g.fillRect(0, 0, rc.width, rc.height);
      g.strokeStyle = 'rgba(60,50,20,0.85)'; g.fillStyle = 'rgba(60,50,20,0.95)'; g.font = '600 22px system-ui, sans-serif'; g.textAlign = 'right'; g.textBaseline = 'middle';
      for (let mm = -10; mm <= 170; mm++) {
        const y = rc.height - (mm / 10 + 1) * s, len = mm % 10 === 0 ? 34 : mm % 5 === 0 ? 24 : 14;
        g.lineWidth = mm % 10 === 0 ? 2.5 : 1.2;
        g.beginPath(); g.moveTo(0, y); g.lineTo(len, y); g.stroke();
        if (mm % 10 === 0 && mm >= 0) g.fillText(String(mm / 10), rc.width - 6, y);
      }
    })();
    const rulerTex = tex(rc);
    if ('colorSpace' in rulerTex && THREE.SRGBColorSpace) rulerTex.colorSpace = THREE.SRGBColorSpace;
    const ruler = new THREE.Mesh(new THREE.BoxGeometry(1.0, 18, 0.15), [
      new THREE.MeshStandardMaterial({ color: 0xd9c98e, roughness: 0.6 }), new THREE.MeshStandardMaterial({ color: 0xd9c98e, roughness: 0.6 }),
      new THREE.MeshStandardMaterial({ color: 0xd9c98e, roughness: 0.6 }), new THREE.MeshStandardMaterial({ color: 0xd9c98e, roughness: 0.6 }),
      new THREE.MeshStandardMaterial({ map: rulerTex, roughness: 0.6 }), new THREE.MeshStandardMaterial({ color: 0xd9c98e, roughness: 0.6 })]);
    ruler.castShadow = true;
    scene.add(ruler);

    function applyColors() {
      colors = H.colors();
      benchMat.color.set(colors.dark ? 0x5a554c : 0xd9d2c3);
      glassMat.opacity = colors.dark ? 0.12 : 0.16;
      edgeMat.color.set(colors.dark ? 0x8aa0b4 : 0x9fb4c8);
    }

    let lastVer = -1;
    function update() {
      const g = H.geo();
      // 濾紙與吊掛（lift：濾紙往上吊起的高度）
      paper.position.set(PW / 2, PHh / 2 + g.lift, 0);
      rod.position.set(CXT, PHh + 0.75 + g.lift, 0);
      clip.position.set(PW / 2, PHh + 0.3 + g.lift, 0);
      if (H.paperVer() !== lastVer) { lastVer = H.paperVer(); paperTex.needsUpdate = true; }
      // 展開液
      liquid.scale.y = Math.max(0.001, g.zL);
      liquid.position.set(CXT, g.zL / 2, 0);
      liqMat.color.set(g.liquid);
      // 蓋子：打開時往右滑開
      lid.position.set(CXT + (1 - g.lid) * 9, TH + 0.2, 0);
      lidEdge.position.copy(lid.position);
      // 蒸氣：蓋著蓋子、展開中
      const vap = g.phase === 'run' ? 0.06 * g.lid : 0;
      vapMat.opacity = vap; vapour.visible = vap > 0.002;
      vapour.scale.y = Math.max(0.01, TH - g.zL - 0.2);
      vapour.position.set(CXT, g.zL + (TH - g.zL) / 2, 0);
      // 尺：零點對齊起始線
      ruler.position.set(TK.x1 + 1.6, g.z0 + g.lift + 8, 0);
      const hd = H.hud();
      hudTL.textContent = hd.tl;
      hudTR.innerHTML = hd.tr;
    }

    function fit(force) {
      const span = 24;
      const dist = (span * 0.5) / Math.tan(camera.fov * Math.PI / 360) / Math.min(1.2, Math.max(0.55, camera.aspect));
      if (force) {
        controls.target.set(CXT + 0.6, 9.5, 0);
        camera.position.copy(viewDir).multiplyScalar(dist).add(controls.target);
      }
      camera.updateProjectionMatrix();
      controls.update();
    }
    let vw = 0, raf = 0;
    function canvasHeight(w) { return w < 560 ? Math.round(Math.max(380, w * 1.1)) : 470; }
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
      update();
      renderer.render(scene, camera);
      if (moved && !H.animating()) requestRender();
    }
    function requestRender() {
      if (raf || !api.active) return;
      raf = requestAnimationFrame(function () { raf = 0; if (!H.animating()) renderNow(); });
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

    const api = {
      active: true,
      frame: function () { if (api.active) renderNow(); },
      onState: function () { requestRender(); },
      onTheme: function () { applyColors(); requestRender(); },
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
        disposables.forEach(function (t) { t.dispose(); });
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

  window.Chrom3D = { create: create };
})();
