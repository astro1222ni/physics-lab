/*
 * solution-concentration-3d.js — 「濃度與溶液配製」的 3D 立體檢視：量瓶、溶液、彎月面、刻度線（可旋轉、縮放）
 *
 * three.js 由 solution-concentration.js 在切換到 3D 時才以 import() 動態載入，再傳進 Sol3D.create(lib, host)。
 * 這個檔案只「讀」頁面的狀態（量瓶幾何、液面高度、濃度），不改變任何化學量；量瓶形狀與液面直接用 SolCore.geom 的同一組數字。
 * 為什麼要 3D：刻度線是繞瓶頸一圈的「環」。眼睛不在刻度線的高度時，環的前緣和後緣不重合、看起來是一個橢圓，
 * 這正是視差的來源。「重設視角」會把鏡頭放在眼睛角度滑桿指定的方向（俯視 / 平視 / 仰視）看著刻度線。
 * 單位：1 = 10 mm。
 */
(function () {
  'use strict';
  const U = 0.1;           // mm → 場景單位
  const GLASS = 1.1;       // 玻璃厚度 mm

  function create(lib, H) {
    const THREE = lib.THREE;
    const T = H.T, host = H.host;

    const canvas = document.createElement('canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', T('量瓶的 3D 立體檢視：瓶頸上的刻度線是一圈環，換個角度看彎月面和刻度線的關係（拖曳旋轉、雙指或滾輪縮放）',
      '3D view of the volumetric flask: the mark is a ring around the neck; look from different angles to see how the meniscus lines up with it (drag to rotate, pinch or scroll to zoom)'));
    host.appendChild(canvas);
    const hudTL = document.createElement('div'), hudTR = document.createElement('div'), hudBL = document.createElement('div');
    hudTL.className = 'r3-hud tl'; hudTR.className = 'r3-hud tr'; hudBL.className = 'r3-hud bl';
    [hudTL, hudTR, hudBL].forEach(function (d) { d.setAttribute('aria-hidden', 'true'); host.appendChild(d); });
    hudBL.textContent = T('拖曳旋轉・滾輪或雙指縮放・「重設視角」＝從眼睛的位置看', 'Drag to rotate · scroll or pinch to zoom · “Reset view” = look from your eye position');

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
    const camera = new THREE.PerspectiveCamera(32, 1.5, 0.05, 2000);
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.minDistance = 0.8;
    controls.maxDistance = 120;
    controls.enablePan = false;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x8d8573, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    sun.position.set(-8, 14, 10);
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0xffffff, 0.6);
    rim.position.set(9, 4, -10);
    scene.add(rim);

    let colors = H.colors();

    // ---------- 實驗桌與接觸陰影 ----------
    const benchMat = new THREE.MeshStandardMaterial({ color: 0xd9cbb4, roughness: 0.85, metalness: 0 });
    const bench = new THREE.Mesh(new THREE.CircleGeometry(400, 96), benchMat);
    bench.rotation.x = -Math.PI / 2;
    bench.position.y = -0.005;
    scene.add(bench);
    const shadowTex = (function () {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(0,0,0,0.42)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.18)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      return new THREE.CanvasTexture(c);
    })();
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.002;
    scene.add(shadow);

    // ---------- 量瓶（玻璃、刻度環、瓶塞），依量瓶大小重建 ----------
    const glassMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, roughness: 0.04, metalness: 0, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide });
    const markMat = new THREE.MeshBasicMaterial({ color: 0x1b2633 });
    const stopperMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, roughness: 0.15, clearcoat: 1, depthWrite: false });
    const liqMat = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.8, roughness: 0.15, metalness: 0, depthWrite: false, side: THREE.DoubleSide });
    const labelMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
    let flask = null, liquid = null, mark = null, stopper = null, label = null, labelTex = null;
    let g = null;
    function clearFlask() {
      [flask, liquid, mark, stopper, label].forEach(function (o) {
        if (!o) return;
        scene.remove(o);
        o.traverse(function (c) { if (c.geometry) c.geometry.dispose(); });
      });
      if (labelTex) labelTex.dispose();
      flask = liquid = mark = stopper = label = labelTex = null;
    }
    function profileOuter() {
      const pts = [], N = 72;
      pts.push(new THREE.Vector2(0.001, -GLASS * U));
      pts.push(new THREE.Vector2((g.rBottom + GLASS) * U * 0.98, -GLASS * U));
      for (let i = 0; i <= N; i++) { const z = g.zt * i / N; pts.push(new THREE.Vector2((g.r(z) + GLASS) * U, z * U)); }
      pts.push(new THREE.Vector2((g.rn + GLASS) * U, (g.zTop - 3) * U));
      pts.push(new THREE.Vector2((g.rn + GLASS + 1.6) * U, (g.zTop - 1) * U));     // 瓶口外翻
      pts.push(new THREE.Vector2((g.rn + GLASS + 1.6) * U, g.zTop * U));
      pts.push(new THREE.Vector2(g.rn * U, g.zTop * U));
      for (let i = N; i >= 0; i--) { const z = g.zt * i / N; pts.push(new THREE.Vector2(g.r(z) * U, z * U)); }  // 內壁
      pts.push(new THREE.Vector2(0.001, 0));
      return pts;
    }
    function buildFlask() {
      clearFlask();
      g = H.geom();
      flask = new THREE.Mesh(new THREE.LatheGeometry(profileOuter(), 72), glassMat);
      flask.renderOrder = 3;
      scene.add(flask);
      // 刻度環：繞瓶頸外壁一圈的細線
      mark = new THREE.Mesh(new THREE.TorusGeometry((g.rn + GLASS + 0.05) * U, 0.22 * U, 6, 96), markMat);
      mark.rotation.x = Math.PI / 2;
      mark.position.y = g.zMark * U;
      scene.add(mark);
      // 瓶塞
      stopper = new THREE.Group();
      const plug = new THREE.Mesh(new THREE.CylinderGeometry((g.rn + 0.2) * U, (g.rn - 0.8) * U, 12 * U, 40), stopperMat);
      plug.position.y = (g.zTop - 4) * U;
      const cap = new THREE.Mesh(new THREE.CylinderGeometry((g.rn + 2.4) * U, (g.rn + 2.4) * U, 3 * U, 40), stopperMat);
      cap.position.y = (g.zTop + 3.5) * U;
      const knob = new THREE.Mesh(new THREE.SphereGeometry((g.rn * 0.8) * U, 28, 16), stopperMat);
      knob.scale.y = 0.6;
      knob.position.y = (g.zTop + 6.5) * U;
      stopper.add(plug, cap, knob);
      stopper.visible = false;
      scene.add(stopper);
      // 瓶身上印的字（20 °C、容量）：貼在瓶身正面的一小片弧面
      const lc = document.createElement('canvas'); lc.width = 256; lc.height = 128;
      const x2 = lc.getContext('2d');
      x2.fillStyle = colors.dark ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.92)';
      x2.font = '700 54px system-ui, sans-serif'; x2.textAlign = 'center'; x2.textBaseline = 'middle';
      x2.fillText(g.Vf + ' mL', 128, 44);
      x2.font = '600 34px system-ui, sans-serif';
      x2.fillText('20 °C   A', 128, 100);
      labelTex = new THREE.CanvasTexture(lc);
      labelTex.colorSpace = THREE.SRGBColorSpace || labelTex.colorSpace;
      labelMat.map = labelTex; labelMat.needsUpdate = true;
      const rr = (g.R + GLASS + 0.15) * U, arc = 0.75;
      label = new THREE.Mesh(new THREE.CylinderGeometry(rr, rr, g.R * 0.55 * U, 32, 1, true, -arc / 2, arc), labelMat);
      label.position.y = g.zc * U;
      label.renderOrder = 4;
      scene.add(label);
      shadow.scale.set(g.R * 2.9 * U, g.R * 2.9 * U, 1);
      lastKey = '';
    }

    // ---------- 溶液（含彎月面），液面變了才重建 ----------
    function parseRGB(s) {
      const m = /rgba?\(([^)]+)\)/.exec(s || '');
      if (!m) return new THREE.Color(s || '#88bbdd');
      const p = m[1].split(',').map(Number);
      return new THREE.Color(p[0] / 255, p[1] / 255, p[2] / 255);
    }
    let lastKey = '';
    function buildLiquid() {
      const lq = H.liquid(), lv = H.level();
      const zL = Math.max(0, Math.min(g.zTop - 1.5, lv.z));
      const key = [g.Vf, zL.toFixed(3), lq.C.toFixed(6), lq.sp, lq.shaken, lq.has, colors.dark].join('|');
      if (key === lastKey) return;
      lastKey = key;
      if (liquid) { scene.remove(liquid); liquid.geometry.dispose(); liquid = null; }
      if (!lq.has || zL < 0.3) return;
      // 剖面：瓶底中心 → 沿內壁往上 → 液面邊緣（沿玻璃往上爬約 1 mm）→ 彎月面最低點在中心
      const pts = [], N = 64, r0 = 0.02;
      pts.push(new THREE.Vector2(0.001, r0 * U));
      const zEdge = Math.min(g.zTop - 0.5, zL + 1.0);
      for (let i = 0; i <= N; i++) {
        const z = r0 + (zEdge - r0) * i / N;
        pts.push(new THREE.Vector2(Math.max(0.001, g.r(z) - 0.08) * U, z * U));
      }
      const rTop = Math.max(0.001, g.r(zL) - 0.08), M = 14;
      for (let j = 1; j <= M; j++) {
        const f = 1 - j / M, r = rTop * f;
        // 彎月面：邊緣高 1 mm，往中心下降（凹面），中心就是液面高度 zL
        const z = zL + 1.0 * Math.pow(f, 4);
        pts.push(new THREE.Vector2(Math.max(0.001, r) * U, z * U));
      }
      const geo = new THREE.LatheGeometry(pts, 64);
      // 頂點顏色：硫酸銅照比爾定律（瓶身光程用瓶身直徑、瓶頸用瓶頸直徑）；沒搖勻時底部較濃、上面較淡
      const pos = geo.attributes.position, n = pos.count, colArr = new Float32Array(n * 3);
      const tmp = new THREE.Color();
      const unmixed = !lq.shaken && lq.C > 0;
      for (let k = 0; k < n; k++) {
        const z = pos.getY(k) / U;
        const f = Math.max(0, Math.min(1, z / Math.max(1, zL)));
        const C = unmixed ? lq.C * (1.45 - 1.1 * f) : lq.C;
        const lcm = (z > g.zt ? 2 * g.rn : 2 * g.r(Math.min(z, g.zt))) / 10;
        tmp.copy(parseRGB(lq.color(C, Math.max(0.5, lcm))));
        colArr[3 * k] = tmp.r; colArr[3 * k + 1] = tmp.g; colArr[3 * k + 2] = tmp.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
      liqMat.opacity = lq.sp === 'CuSO4' && lq.C > 0.002 ? 0.82 : (colors.dark ? 0.32 : 0.36);
      liquid = new THREE.Mesh(geo, liqMat);
      liquid.renderOrder = 2;
      scene.add(liquid);
    }

    function applyColors() {
      colors = H.colors();
      benchMat.color.set(colors.dark ? 0x3a3631 : 0xd9cbb4);
      markMat.color.set(colors.dark ? 0xf2f2f2 : 0x1b2633);
      glassMat.opacity = colors.dark ? 0.13 : 0.16;
      lastKey = '';
    }

    function eyeText(d) {
      return Math.abs(d) < 0.5 ? T('平視', 'at eye level') : d > 0 ? T('俯視 ', 'looking down ') + Math.round(d) + '°' : T('仰視 ', 'looking up ') + Math.round(-d) + '°';
    }
    const v3 = new THREE.Vector3();
    function update() {
      if (!g || g.Vf !== H.geom().Vf) buildFlask();
      buildLiquid();
      const P = H.prep();
      stopper.visible = !!(P.shaken || P.done);
      const lv = H.level();
      let s;
      if (!H.liquid().has) s = T('量瓶是空的', 'The flask is empty');
      else if (lv.z < g.zt) s = T('液面還在瓶身', 'The liquid is still in the bulb');
      else if (Math.abs(lv.h) < 0.05) s = T('液面最低點正好在刻度線', 'The bottom of the meniscus is on the mark');
      else s = (lv.h < 0 ? T('液面最低點在刻度線下方 ', 'Bottom of the meniscus ') + Math.abs(lv.h).toFixed(2) + T(' mm', ' mm below the mark')
        : T('液面最低點在刻度線上方 ', 'Bottom of the meniscus ') + lv.h.toFixed(2) + T(' mm', ' mm above the mark'));
      hudTL.textContent = s + T('（實際）', ' (actual)');
      // 鏡頭的仰俯角（相對刻度線的高度）
      v3.copy(camera.position).sub(new THREE.Vector3(0, g.zMark * U, 0));
      const camDeg = Math.atan2(v3.y, Math.hypot(v3.x, v3.z)) * 180 / Math.PI;
      hudTR.textContent = T('鏡頭：', 'Camera: ') + eyeText(camDeg) + T('・眼睛滑桿：', ' · eye slider: ') + eyeText(H.eye());
      // 窄螢幕：右上的說明放到左上那一格的下面，避免重疊
      if (host.clientWidth < 600) { hudTR.style.left = '8px'; hudTR.style.right = 'auto'; hudTR.style.textAlign = 'left'; hudTR.style.top = (8 + hudTL.offsetHeight + 6) + 'px'; }
      else { hudTR.style.left = ''; hudTR.style.right = ''; hudTR.style.textAlign = ''; hudTR.style.top = ''; }
    }

    function fit(force) {
      if (!g) return;
      if (force) {
        // 從眼睛的方向看刻度線：仰俯角 = 眼睛角度（正 = 俯視），稍微偏右一點讓瓶身有立體感
        const th = H.eye() * Math.PI / 180, az = 0.32;
        const H0 = g.zTop * U * 1.3;
        const dist = (H0 * 0.5) / Math.tan(camera.fov * Math.PI / 360) / Math.min(1, camera.aspect * 0.9);
        controls.target.set(0, g.zMark * U * 0.78, 0);
        const tgt = new THREE.Vector3(0, g.zMark * U, 0);
        camera.position.set(Math.sin(az) * Math.cos(th) * dist, tgt.y + Math.sin(th) * dist, Math.cos(az) * Math.cos(th) * dist);
        controls.target.copy(tgt).lerp(new THREE.Vector3(0, g.zTop * U * 0.5, 0), 0.6);
      }
      camera.updateProjectionMatrix();
      controls.update();
    }
    let vw = 0, raf = 0;
    function canvasHeight(w) { return w < 600 ? 500 : 440; }
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
    canvas.addEventListener('webglcontextlost', function (ev) {
      ev.preventDefault();
      if (api.active) H.contextLost();
    });

    const api = {
      active: true,
      /** 鏡頭回到眼睛的位置（眼睛角度滑桿），看著刻度線 */
      frame: function () { if (!api.active) return; fit(true); requestRender(); },
      update: function () { requestRender(); },
      rebuild: function () { if (!api.active) return; buildFlask(); fit(true); requestRender(); },
      theme: function () { applyColors(); if (g) buildFlask(); requestRender(); },
      dispose: function () {
        api.active = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize3);
        document.removeEventListener('visibilitychange', onVisible);
        controls.dispose();
        clearFlask();
        const mats = new Set();
        scene.traverse(function (o) {
          if (o.geometry) o.geometry.dispose();
          if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { mats.add(m); });
        });
        [glassMat, markMat, stopperMat, liqMat, labelMat].forEach(function (m) { mats.add(m); });
        mats.forEach(function (m) { m.dispose(); });
        shadowTex.dispose();
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
    buildFlask();
    fit(true);
    return api;
  }

  window.Sol3D = { create: create };
})();
