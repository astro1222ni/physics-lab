/*
 * typhoon-3d.js — 「颱風」的 3D 氣壓漏斗（three.js）
 *
 * 由 js/typhoon.js 在使用者按「3D」時才載入（three.js 也是那時才以 import() 載入）；切回 2D 時整個釋放。
 * 用法：window.Typhoon3D.create({ THREE, OrbitControls }, 容器, bridge) → { active, frame, busy, onShow, onTheme, resetCamera, camTo, dispose }
 *
 * 場景座標：1 單位 = 100 km，+x 向東、+y 向北、+z 向上；地圖範圍和 2D 一樣（1400 km × 1000 km）。
 * 漏斗：以颱風中心為圓心的極座標網格，深度 ∝ 氣壓降低（每 hPa 0.04 單位，示意、未依比例），
 *       顏色是地面風速（含移動造成的不對稱，和 2D 同一份 TyphoonCore.windAt）；網格跟著颱風平移，用裁切平面限制在地圖範圍內。
 */
(function () {
  'use strict';
  const U = 1e5;            // 1 單位 = 100 km
  const DZ = 0.04;          // 每 hPa 下沉 0.04 單位
  const PENV = 1010;

  function create(lib, host, B) {
    const THREE = lib.THREE;
    const K = B.K, T = B.T, state = B.state, D = B.D;
    let C = B.colors();
    const HW = B.viewW / 2 / U, HH = B.viewH / 2 / U;   // 7、5

    // ---------- 畫布與 HUD ----------
    const wrap = document.createElement('div');
    wrap.className = 'c3-wrap';
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', T('颱風的 3D 氣壓漏斗：越深氣壓越低，顏色是地面風速（可拖曳旋轉、縮放）',
      '3D pressure funnel of the typhoon: deeper means lower pressure, colour shows the surface wind (drag to rotate, pinch or scroll to zoom)'));
    wrap.appendChild(canvas);
    const hud = document.createElement('div');
    hud.className = 'c3-hud';
    hud.setAttribute('aria-hidden', 'true');
    hud.innerHTML = '<div class="tl"><span data-k="cls"></span><span class="m" data-k="vmax"></span></div>' +
      '<div class="tr"><span class="m" data-k="time"></span></div>' +
      '<div class="br"><span class="m" data-k="st"></span><span class="m" data-k="note"></span></div>';
    wrap.appendChild(hud);
    host.appendChild(wrap);
    const hudEl = {}, hudLast = {};
    hud.querySelectorAll('[data-k]').forEach(function (e) { hudEl[e.getAttribute('data-k')] = e; });
    function setHud(k, txt) { if (hudLast[k] !== txt) { hudLast[k] = txt; hudEl[k].textContent = txt; } }

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    } catch (e) {
      wrap.remove();
      throw e;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.localClippingEnabled = true;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1.6, 0.05, 200);
    camera.up.set(0, 0, 1);
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.rotateSpeed = 0.7;
    controls.enablePan = false;
    controls.minDistance = 4;
    controls.maxDistance = 30;

    scene.add(new THREE.HemisphereLight(0xdbe8ff, 0x1a2230, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 1.7);
    sun.position.set(-5, -7, 12);
    scene.add(sun);

    const col = function (c) { return new THREE.Color(C[c] || c || '#888888'); };
    function disposeObject(obj) {
      obj.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); });
      });
    }
    // 地圖範圍的四個裁切平面
    const clip = [new THREE.Plane(new THREE.Vector3(1, 0, 0), HW), new THREE.Plane(new THREE.Vector3(-1, 0, 0), HW),
      new THREE.Plane(new THREE.Vector3(0, 1, 0), HH), new THREE.Plane(new THREE.Vector3(0, -1, 0), HH)];

    // ---------- 文字標籤（Sprite，固定像素大小） ----------
    const RES = 3;
    let cw = 600, ch = 440;
    let centerLabel = null;
    function label(text, color, p, anchorRight, cy) {
      const font = '700 ' + 12 * RES + 'px ' + D.FONT;
      const c = document.createElement('canvas');
      let g = c.getContext('2d');
      g.font = font;
      const tw = g.measureText(text).width;
      c.width = Math.ceil(tw + 12 * RES); c.height = Math.ceil(19 * RES);
      g = c.getContext('2d');
      g.beginPath();
      const r = c.height / 2 - RES;
      g.moveTo(r + RES, RES); g.arcTo(c.width - RES, RES, c.width - RES, c.height - RES, r); g.arcTo(c.width - RES, c.height - RES, RES, c.height - RES, r);
      g.arcTo(RES, c.height - RES, RES, RES, r); g.arcTo(RES, RES, c.width - RES, RES, r); g.closePath();
      g.fillStyle = 'rgba(8,14,24,0.78)'; g.fill();
      g.strokeStyle = color; g.globalAlpha = 0.7; g.lineWidth = RES; g.stroke(); g.globalAlpha = 1;
      g.font = font; g.textBaseline = 'middle'; g.fillStyle = color; g.fillText(text, 6 * RES, c.height / 2 + RES * 0.5);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false }));
      sp.userData = { lw: c.width / RES, lh: c.height / RES, isLabel: true };
      sp.center.set(anchorRight ? 1 : cy != null ? cy : 0, 0.5);
      sp.position.copy(p);
      sp.renderOrder = 30;
      fitLabel(sp);
      return sp;
    }
    function fitLabel(sp) {
      const k = 2 * Math.tan(camera.fov * Math.PI / 360) / Math.max(1, ch);
      sp.scale.set(sp.userData.lw * k, sp.userData.lh * k, 1);
    }

    // ---------- 漏斗（極座標網格，跟著颱風中心平移） ----------
    const NR = 96, NA = 120, RMAX = 15;
    const ringR = []; for (let i = 0; i <= NR; i++) ringR.push(RMAX * Math.pow(i / NR, 2.2));
    const funGeo = new THREE.BufferGeometry();
    const nV = (NR + 1) * NA;
    const pos = new Float32Array(nV * 3), colr = new Float32Array(nV * 3);
    const idx = [];
    for (let i = 0; i < NR; i++) {
      for (let j = 0; j < NA; j++) {
        const a = i * NA + j, b = i * NA + (j + 1) % NA, c = (i + 1) * NA + j, d = (i + 1) * NA + (j + 1) % NA;
        idx.push(a, c, b, b, c, d);
      }
    }
    funGeo.setIndex(idx);
    funGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    funGeo.setAttribute('color', new THREE.BufferAttribute(colr, 3));
    const funMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide, clippingPlanes: clip, flatShading: false });
    const funnel = new THREE.Mesh(funGeo, funMat);
    scene.add(funnel);
    // 等壓線（每 10 hPa 一圈，貼在漏斗上）
    const isoGroup = new THREE.Group();
    funnel.add(isoGroup);
    // 最大風速半徑：貼在漏斗上的一圈亮環
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x666666, roughness: 0.4 });
    let wall = null;
    function zOf(p) { return (p - PENV) * DZ; }
    let fkey = '';
    function buildFunnel() {
      const S = B.run().S;
      const key = [S.pc, S.Rm, S.B, S.lat, S.c, S.hd, D.dark ? 1 : 0].join('|');
      if (key === fkey) return;
      fkey = key;
      const sea = col('ty-sea2'), wc = new THREE.Color();
      for (let i = 0; i <= NR; i++) {
        const r = ringR[i], z = zOf(K.pressure(S, r * U));
        for (let j = 0; j < NA; j++) {
          const a = j / NA * Math.PI * 2, x = r * Math.cos(a), y = r * Math.sin(a), o = (i * NA + j) * 3;
          pos[o] = x; pos[o + 1] = y; pos[o + 2] = z;
          const w = B.windColor(K.windAt(S, x * U, y * U).speed);
          wc.setRGB(w[0] / 255, w[1] / 255, w[2] / 255, THREE.SRGBColorSpace);
          const m = sea.clone().lerp(wc, w[3]);
          colr[o] = m.r; colr[o + 1] = m.g; colr[o + 2] = m.b;
        }
      }
      funGeo.attributes.position.needsUpdate = true;
      funGeo.attributes.color.needsUpdate = true;
      funGeo.computeVertexNormals();
      funGeo.computeBoundingSphere();
      // 等壓線
      disposeObject(isoGroup); isoGroup.clear();
      for (let lv = Math.floor(S.pc / 10) * 10 + 10; lv < PENV; lv += 10) {
        const dp = K.dp(S), q = (lv - S.pc) / dp;
        if (!(q > 0 && q < 1)) continue;
        const r = S.Rm / Math.pow(-Math.log(q), 1 / S.B) / U;
        if (r < 0.02 || r > RMAX) continue;
        const pts = [];
        for (let j = 0; j <= 160; j++) { const a = j / 160 * Math.PI * 2; pts.push(new THREE.Vector3(r * Math.cos(a), r * Math.sin(a), zOf(lv) + 0.012)); }
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
          new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: lv % 50 === 0 ? 0.75 : 0.4, clippingPlanes: clip }));
        isoGroup.add(line);
      }
      // 眼牆
      if (wall) { funnel.remove(wall); wall.geometry.dispose(); }
      const rw = Math.max(0.05, S.Rm / U), zb = zOf(K.pressure(S, S.Rm));
      wall = new THREE.Mesh(new THREE.TorusGeometry(rw, Math.min(0.035, rw * 0.25), 10, 96), wallMat);
      wall.position.z = zb + 0.02;
      funnel.add(wall);
      if (centerLabel) { funnel.remove(centerLabel); centerLabel.material.map.dispose(); centerLabel.material.dispose(); }
      centerLabel = label(B.num(S.pc, 1) + ' hPa', '#ffffff', new THREE.Vector3(0, 0, zOf(S.pc) - 0.15), false, 0.5);
      funnel.add(centerLabel);
    }

    // ---------- 地圖框、路徑 ----------
    const frameMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 });
    const frame = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-HW, -HH, 0), new THREE.Vector3(HW, -HH, 0), new THREE.Vector3(HW, HH, 0), new THREE.Vector3(-HW, HH, 0)]), frameMat);
    scene.add(frame);
    const trackGroup = new THREE.Group();
    scene.add(trackGroup);
    let tkey = '';
    function buildTrack() {
      const run = B.run(), S = run.S;
      const key = [S.c, S.hd, run.start.x, run.start.y].join('|') + (D.dark ? 'd' : 'l');
      if (key === tkey) return;
      tkey = key;
      disposeObject(trackGroup); trackGroup.clear();
      if (!(S.c > 0)) return;
      const m = K.motion(S), Tt = 2 * 450e3 / S.c;
      const a = new THREE.Vector3(run.start.x / U, run.start.y / U, 0.03), b = new THREE.Vector3((run.start.x + m.x * Tt) / U, (run.start.y + m.y * Tt) / U, 0.03);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]),
        new THREE.LineDashedMaterial({ color: col('ty-track'), dashSize: 0.25, gapSize: 0.18, transparent: true, opacity: 0.9 }));
      line.computeLineDistances();
      trackGroup.add(line);
      const dir = b.clone().sub(a).normalize();
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.36, 18), new THREE.MeshBasicMaterial({ color: col('ty-track') }));
      cone.position.copy(b).addScaledVector(dir, -0.18);
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      trackGroup.add(cone);
    }

    // ---------- 地面風箭頭（世界座標的固定格點） ----------
    const AG = [];
    for (let y = -HH + 0.5; y < HH; y += 1) for (let x = -HW + 0.5; x < HW; x += 1) AG.push([x, y]);
    const arrowGeo = new THREE.ConeGeometry(0.07, 0.42, 10);
    arrowGeo.rotateZ(-Math.PI / 2);          // 指向 +x
    const arrowMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, emissive: 0x333333 });
    const arrows = new THREE.InstancedMesh(arrowGeo, arrowMat, AG.length);
    arrows.renderOrder = 6;
    scene.add(arrows);
    const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V3 = new THREE.Vector3(), SC = new THREE.Vector3(), ZA = new THREE.Vector3(0, 0, 1);
    function placeArrows(cc) {
      const S = B.run().S;
      AG.forEach(function (g, i) {
        const dx = g[0] * U - cc.x, dy = g[1] * U - cc.y;
        const w = K.windAt(S, dx, dy);
        const z = zOf(w.p) + 0.12;
        const s = w.speed < 2 ? 0 : Math.min(1.6, 0.45 + w.speed / 40);
        Q.setFromAxisAngle(ZA, Math.atan2(w.v, w.u));
        SC.set(s, s, s);
        V3.set(g[0], g[1], z);
        M4.compose(V3, Q, SC);
        arrows.setMatrixAt(i, M4);
      });
      arrows.instanceMatrix.needsUpdate = true;
    }

    // ---------- 測站 ----------
    const stations = [0, 1].map(function (i) {
      const g = new THREE.Group();
      const color = col(i ? 'ty-b' : 'ty-a');
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 12), new THREE.MeshStandardMaterial({ color: 0xe5e7eb, roughness: 0.5 }));
      pole.rotation.x = Math.PI / 2;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 16), new THREE.MeshStandardMaterial({ color: color, roughness: 0.35, emissive: color.clone().multiplyScalar(0.25) }));
      const vane = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.55, 14), new THREE.MeshStandardMaterial({ color: color, roughness: 0.4 }));
      vane.geometry.rotateZ(-Math.PI / 2);
      g.add(pole); g.add(head); g.add(vane);
      scene.add(g);
      const lab = label(i ? 'B' : 'A', B.colors()[i ? 'ty-b' : 'ty-a'], new THREE.Vector3(0, 0, 0), false, 0.5);
      scene.add(lab);
      return { g: g, pole: pole, head: head, vane: vane, lab: lab };
    });
    function placeStations() {
      const run = B.run();
      run.st.forEach(function (s, i) {
        const o = stations[i], w = K.observe(run, s, run.t);
        const zb = zOf(w.p), top = 0.9;
        o.pole.scale.set(1, top - zb, 1);
        o.pole.position.set(0, 0, (top + zb) / 2);
        o.head.position.set(0, 0, top);
        o.vane.position.set(0, 0, top + 0.28);
        o.vane.rotation.z = Math.atan2(w.v, w.u);
        o.vane.visible = w.speed >= 0.5;
        o.g.position.set(s.x / U, s.y / U, 0);
        o.lab.position.set(s.x / U + 0.22, s.y / U, top + 0.25);
      });
    }

    // ---------- 更新 ----------
    let lastT = -1;
    function update() {
      buildFunnel();
      buildTrack();
      const run = B.run(), cc = B.center(), sum = B.sum();
      funnel.position.set(cc.x / U, cc.y / U, 0);
      if (run.t !== lastT || arrowsDirty) { lastT = run.t; arrowsDirty = false; placeArrows(cc); }
      placeStations();
      setHud('cls', B.clsText());
      setHud('vmax', T('最大風速 ', 'Max wind ') + B.num(sum.vMax, 1) + ' m/s' + (narrow ? '' : '・' + T('中心 ', 'centre ') + B.num(state.pc, 1) + ' hPa'));
      setHud('time', B.hours(run.t / 3600));
      const wa = K.observe(run, run.st[0], run.t), wb = K.observe(run, run.st[1], run.t);
      setHud('st', 'A ' + B.num(wa.p, 0) + ' hPa・' + B.num(wa.speed, 0) + ' m/s　B ' + B.num(wb.p, 0) + ' hPa・' + B.num(wb.speed, 0) + ' m/s');
      setHud('note', narrow ? T('示意：深度＝氣壓降低', 'Depth = pressure drop (not to scale)') : T('示意圖：漏斗深度＝氣壓降低（未依比例）；顏色＝地面風速；白色箭頭＝風向；白環＝最大風速半徑', 'Not to scale: funnel depth = pressure drop; colour = surface wind; white arrows = wind direction; white ring = radius of maximum wind'));
    }
    let arrowsDirty = true;

    // ---------- 相機 ----------
    let narrow = false;
    function sizeOf(w) { return w < 560 ? 400 : 440; }
    function resize3() {
      const w = wrap.clientWidth;
      if (!w) return;
      const h = sizeOf(w);
      if (canvas.style.height !== h + 'px') canvas.style.height = h + 'px';
      const nar = w < 560;
      if (nar !== narrow) { narrow = nar; Object.keys(hudLast).forEach(function (k) { delete hudLast[k]; }); }
      cw = w; ch = h;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      scene.traverse(function (o) { if (o.userData && o.userData.isLabel) fitLabel(o); });
      render();
    }
    let camAnim = null;
    function presetFor(kind) {
      const k = camera.aspect < 1.2 ? 1.55 : 1;
      if (kind === 'top') return { pos: new THREE.Vector3(0, -0.01, 19 * k), tgt: new THREE.Vector3(0, 0, -0.5) };
      if (kind === 'side') return { pos: new THREE.Vector3(0, -17 * k, 0.6), tgt: new THREE.Vector3(0, 0, -1) };
      return { pos: new THREE.Vector3(-2.5 * k, -12 * k, 8.5 * k), tgt: new THREE.Vector3(0, 0, -0.8) };
    }
    function camTo(kind, animate) {
      const P = presetFor(kind);
      if (!animate || B.reducedMotion) {
        camAnim = null;
        camera.position.copy(P.pos); controls.target.copy(P.tgt); controls.update(); render();
        return;
      }
      camAnim = { t0: performance.now(), dur: 800, p0: camera.position.clone(), t0v: controls.target.clone(), p1: P.pos, t1: P.tgt };
      B.request();
    }
    function stepCam() {
      if (!camAnim) return;
      const A = camAnim;
      const u = Math.min(1, (performance.now() - A.t0) / A.dur), e = 1 - Math.pow(1 - u, 3);
      camera.position.copy(A.p0).lerp(A.p1, e);
      controls.target.copy(A.t0v).lerp(A.t1, e);
      if (u >= 1) camAnim = null;
    }
    let moving = false;
    function render() {
      if (!api.active || document.hidden) return;
      const want = Math.min(window.devicePixelRatio || 1, 2);
      if (renderer.getPixelRatio() !== want) { renderer.setPixelRatio(want); renderer.setSize(cw, ch, false); }
      stepCam();
      moving = controls.update();
      renderer.render(scene, camera);
    }
    const ro = window.ResizeObserver ? new ResizeObserver(function () { resize3(); }) : null;
    if (ro) ro.observe(wrap); else window.addEventListener('resize', resize3);
    controls.addEventListener('change', function () { B.request(); });
    canvas.addEventListener('webglcontextlost', function (ev) {
      ev.preventDefault();
      if (api.active && B.onContextLost) B.onContextLost();
    });

    const api = {
      active: true,
      frame: function () { update(); render(); },
      busy: function () { return !!camAnim || moving; },
      onShow: function () { resize3(); camTo('tilt', false); },
      onTheme: function () {
        C = B.colors();
        Object.keys(hudLast).forEach(function (k) { delete hudLast[k]; });
        fkey = ''; tkey = '';
        stations.forEach(function (o, i) { const c = col(i ? 'ty-b' : 'ty-a'); o.head.material.color.copy(c); o.head.material.emissive.copy(c).multiplyScalar(0.25); o.vane.material.color.copy(c); });
        update(); render();
      },
      resetCamera: function () { camTo('tilt', true); },
      camTo: function (kind) { camTo(kind, true); },
      dispose: function () {
        api.active = false;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize3);
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
    }
    update();
    camTo('tilt', false);
    return api;
  }

  window.Typhoon3D = { create: create };
})();
