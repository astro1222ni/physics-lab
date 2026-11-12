/*
 * molecular-shapes-3d.js — 「分子的形狀（VSEPR）」的 3D 立體檢視（three.js）
 *
 * 由 js/molecular-shapes.js 在切到「3D 立體」時才載入（three.js 也是那時才以 import() 載入）；切回 2D 時整個釋放。
 * 用法：window.Vsepr3D.create({ THREE, OrbitControls }, 容器, bridge)
 *       → { active, update, rebuild, onTheme, resetCamera, viewDir, viewMatrix, dispose }
 *
 * 電子域的方向、能量、鍵角、偶極全部來自 molecular-shapes-core.js，和 2D 是同一份計算；這裡只負責畫與拖曳。
 * 場景座標：中心原子在原點，z 朝上，1 個場景單位 = 1 Å（鍵長用共價半徑估計；孤對電子瓣的長度是示意）。
 * 動畫時每一格只改各電子域的方向（quaternion）與箭頭、弧的位置，不重建原子與鍵的幾何。
 */
(function () {
  'use strict';
  const FONT = 'system-ui, -apple-system, "Segoe UI", "Noto Sans TC", "PingFang TC", sans-serif';
  const RES = 3; // 標籤畫布的解析度倍數

  function create(lib, host, B) {
    const THREE = lib.THREE;
    const VC = B.VC, T = B.T, D = B.D, state = B.state;
    const alpha = D.alpha;
    let C = B.colors();
    const isDark = function () { return !!D.dark; };
    const tc = function (c) { return new THREE.Color(c); };
    const ZAXIS = new THREE.Vector3(0, 0, 1);
    const LP_LEN = B.LP_LEN;

    // ---------- 畫布與資訊列（HUD） ----------
    const wrap = document.createElement('div');
    wrap.className = 'm3-wrap';
    const canvas = document.createElement('canvas');
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', T('分子的 3D 立體檢視：拖曳空白處旋轉，滾輪或雙指縮放；拖曳原子或孤對電子可以推動電子域，點兩個鍵結原子量鍵角；方向鍵也可以轉動分子。',
      '3D view of the molecule: drag empty space to rotate, scroll or pinch to zoom; drag an atom or a lone pair to push that electron domain, tap two bonded atoms to measure their bond angle; the arrow keys also turn the molecule.'));
    wrap.appendChild(canvas);
    const hud = document.createElement('div');
    hud.className = 'm3-hud';
    hud.setAttribute('aria-hidden', 'true');
    hud.innerHTML = '<div class="tl"><span data-k="f"></span><span class="m" data-k="shape"></span></div>' +
      '<div class="tr"><span data-k="st"></span></div>' +
      '<div class="bl"><span data-k="ang"></span><span class="m" data-k="dip"></span></div>';
    wrap.appendChild(hud);
    host.appendChild(wrap);
    const hudEl = {}, hudLast = {};
    hud.querySelectorAll('[data-k]').forEach(function (e) { hudEl[e.getAttribute('data-k')] = e; });
    function setHud(k, h, cls) {
      const key = h + '|' + (cls || '');
      if (hudLast[k] === key) return;
      hudLast[k] = key;
      hudEl[k].innerHTML = h;
      if (cls != null) hudEl[k].className = cls;
    }

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
    const camera = new THREE.PerspectiveCamera(30, 4 / 3, 0.05, 500);
    camera.up.set(0, 0, 1); // z 朝上；必須在建立 OrbitControls 之前設定

    let fitR = 2.5;               // 分子的外接球半徑（自動對焦用）
    const target = new THREE.Vector3(0, 0, 0);
    let cw = 300, ch = 225, narrow = false;

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
    function clearGroup(g) { g.children.slice().forEach(function (o) { g.remove(o); disposeObject(o); }); }
    function domOf(id) { for (let i = 0; i < state.doms.length; i++) if (state.doms[i].id === id) return state.doms[i]; return null; }
    function lum(c) { const r = D.rgb(c); return (0.2126 * r[0] + 0.7152 * r[1] + 0.0722 * r[2]) / 255; }

    /** 沿區域 z 軸、從 z0 到 z1 的圓柱（x 方向偏移 xo） */
    function zrod(z0, z1, xo, r, color) {
      const geo = new THREE.CylinderGeometry(r, r, Math.max(1e-4, z1 - z0), 18, 1, true);
      geo.rotateX(Math.PI / 2);
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: tc(color), roughness: 0.38, metalness: 0.04 }));
      m.position.set(xo, 0, (z0 + z1) / 2);
      m.castShadow = true;
      return m;
    }
    function atomBall(r, color) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 40, 26),
        new THREE.MeshPhysicalMaterial({ color: tc(color), roughness: 0.3, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.25, emissive: tc(color), emissiveIntensity: isDark() ? 0.16 : 0.06 }));
      m.castShadow = true;
      return m;
    }

    // ---------- 文字標籤（Sprite，固定像素大小；'F_1' 的 _1 畫成小一號的下標） ----------
    function labelCanvas(text, color, opt) {
      const px = (opt.size || (narrow ? 12.5 : 13.5)) * RES;
      const fMain = (opt.italic ? 'italic ' : '') + (opt.weight || 700) + ' ' + px + 'px ' + FONT;
      const fSub = (opt.weight || 700) + ' ' + Math.round(px * 0.66) + 'px ' + FONT;
      const parts = String(text).split(/_(\w+)/);
      const c = document.createElement('canvas');
      let g = c.getContext('2d');
      let w = 0;
      parts.forEach(function (p, i) { g.font = i % 2 ? fSub : fMain; w += g.measureText(p).width + (i % 2 ? RES : 0); });
      const padX = (opt.halo === false ? 2 : 5) * RES, padY = (opt.halo === false ? 1 : 4) * RES;
      c.width = Math.ceil(w + 2 * padX);
      c.height = Math.ceil(px * 1.3 + 2 * padY);
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
        if (opt.halo !== false) {
          g.lineWidth = 4 * RES;
          g.strokeStyle = alpha(C['canvas-bg'], 0.92);
          g.strokeText(p, xx, yy);
        }
        g.fillStyle = color;
        g.fillText(p, xx, yy);
        x += g.measureText(p).width + (sub ? RES : 0);
      });
      return c;
    }
    function makeLabel(text, color, opt) {
      opt = opt || {};
      const c = labelCanvas(text, color, opt);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: opt.depthTest === true, depthWrite: false, sizeAttenuation: false }));
      sp.userData.lw = c.width / RES;
      sp.userData.lh = c.height / RES;
      sp.userData.isLabel = true;
      sp.userData.text = text;
      sp.renderOrder = opt.depthTest ? 6 : 30;
      fitLabel(sp);
      return sp;
    }
    function setLabelText(sp, text, color, opt) {
      if (sp.userData.text === text) return;
      const old = sp.material.map;
      const c = labelCanvas(text, color, opt || {});
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      sp.material.map = tex;
      sp.material.needsUpdate = true;
      if (old) old.dispose();
      sp.userData.lw = c.width / RES;
      sp.userData.lh = c.height / RES;
      sp.userData.text = text;
      fitLabel(sp);
    }
    function fitLabel(sp) {
      const k = 2 * Math.tan(camera.fov * Math.PI / 360) / Math.max(1, ch);
      sp.scale.set(sp.userData.lw * k, sp.userData.lh * k, 1);
    }
    function sizeLabels() { scene.traverse(function (o) { if (o.userData && o.userData.isLabel) fitLabel(o); }); }

    // ---------- 光線與環境反光 ----------
    const hemi = new THREE.HemisphereLight(0xffffff, 0x3a4250, 0.7);
    hemi.position.set(0, 0, 1);
    scene.add(hemi);
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.0);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.bias = -0.0004;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);
    scene.add(keyLight.target);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
    scene.add(fillLight);
    scene.add(fillLight.target);
    const pmrem = new THREE.PMREMGenerator(renderer);
    let envRT = null;
    /** 簡單的「攝影棚」環境貼圖：讓原子有柔和的反光（自己產生，不載入任何檔案） */
    function buildEnv() {
      if (envRT) { envRT.dispose(); envRT = null; }
      const s = new THREE.Scene();
      const g = new THREE.SphereGeometry(10, 32, 16);
      g.rotateX(Math.PI / 2);
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

    // ---------- 場景物件 ----------
    const molG = new THREE.Group(); scene.add(molG);     // 原子、鍵、孤對電子
    const dipG = new THREE.Group(); scene.add(dipG);     // 偶極箭頭
    const polyG = new THREE.Group(); scene.add(polyG);   // 電子對幾何的多面體
    const arcG = new THREE.Group(); scene.add(arcG);     // 量到的鍵角
    let ground = null;
    let arms = [], pickables = [], centerLabel = null, centerR = 0.5;
    let bondArrows = [], netArrow = null, muLabel = null, arcLabel = null;
    let polyLines = null, polyFaces = null, arcTube = null, arcFan = null;

    /** 孤對電子瓣的外形：靠近原子核的一端尖、外端圓（繞區域 z 軸旋轉而成） */
    function lobeGeometry(z0, z1, W) {
      const pts = [];
      const n = 28;
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        const r = W * Math.sin(Math.PI * Math.pow(t, 1.6));
        pts.push(new THREE.Vector2(Math.max(r, k === 0 || k === n ? 0 : 1e-4), z0 + (z1 - z0) * t));
      }
      const geo = new THREE.LatheGeometry(pts, 40);
      geo.rotateX(Math.PI / 2); // 旋轉軸由 y 改成 z
      return geo;
    }
    /** 箭頭：桿（單位長圓柱，用 scale 拉長）＋錐形箭頭，沿區域 z 軸 */
    function makeArrow(color, r) {
      const g = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: tc(color), roughness: 0.35, metalness: 0.05, emissive: tc(color), emissiveIntensity: isDark() ? 0.3 : 0.12 });
      const sg = new THREE.CylinderGeometry(r, r, 1, 14, 1, false);
      sg.rotateX(Math.PI / 2); sg.translate(0, 0, 0.5);
      const shaft = new THREE.Mesh(sg, mat);
      const headLen = r * 5.2;
      const hg = new THREE.ConeGeometry(r * 2.6, headLen, 20);
      hg.rotateX(Math.PI / 2); hg.translate(0, 0, headLen / 2);
      const head = new THREE.Mesh(hg, mat);
      shaft.castShadow = head.castShadow = true;
      g.add(shaft); g.add(head);
      g.userData = { shaft: shaft, head: head, headLen: headLen, r: r };
      return g;
    }
    const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3();
    function setArrow(g, from, to) {
      tmpA.subVectors(to, from);
      const L = tmpA.length();
      const ud = g.userData;
      if (L < 1e-6) { g.visible = false; return; }
      g.visible = true;
      g.position.copy(from);
      g.quaternion.setFromUnitVectors(ZAXIS, tmpA.multiplyScalar(1 / L));
      const hl = Math.min(ud.headLen, L * 0.5);
      ud.shaft.scale.set(1, 1, Math.max(1e-4, L - hl));
      ud.head.scale.set(hl / ud.headLen, hl / ud.headLen, hl / ud.headLen);
      ud.head.position.z = L - hl;
    }

    function buildMolecule() {
      clearGroup(molG);
      clearGroup(dipG);
      arms = []; pickables = []; bondArrows = [];
      const cen = state.spec.center;
      centerR = B.ballR(cen);
      const cb = atomBall(centerR, C.el[cen]);
      molG.add(cb);
      const ink = function (c) { return lum(c) > 0.55 ? '#1d2930' : '#ffffff'; };
      centerLabel = makeLabel(cen, ink(C.el[cen]), { halo: false, depthTest: true });
      centerLabel.userData.anchor = { pos: new THREE.Vector3(0, 0, 0), r: centerR };
      molG.add(centerLabel);
      const labels = B.ligLabels();
      fitR = 1.5;
      state.doms.forEach(function (d, i) {
        const g = new THREE.Group();
        molG.add(g);
        const arm = { id: d.id, k: d.k, g: g };
        if (d.k === 'B') {
          const L = B.bondLen(d), rl = B.ballR(d.lig);
          arm.L = L; arm.r = rl;
          fitR = Math.max(fitR, L + rl);
          const z0 = centerR * 0.55, z1 = L - rl * 0.55, zm = (centerR + L - rl) / 2;
          const offs = d.bo === 1 ? [0] : d.bo === 2 ? [-0.085, 0.085] : [-0.12, 0, 0.12];
          const br = d.bo === 1 ? 0.09 : 0.058;
          offs.forEach(function (o) {
            g.add(zrod(z0, zm, o, br, C.el[cen]));
            g.add(zrod(zm, z1, o, br, C.el[d.lig]));
          });
          arm.ball = atomBall(rl, C.el[d.lig]);
          arm.ball.position.set(0, 0, L);
          arm.ball.userData.domId = d.id;
          g.add(arm.ball);
          pickables.push(arm.ball);
          arm.halo = new THREE.Mesh(new THREE.SphereGeometry(rl * 1.28, 32, 20),
            new THREE.MeshBasicMaterial({ color: tc(C.accent), transparent: true, opacity: 0.38, side: THREE.BackSide, depthWrite: false }));
          arm.halo.position.set(0, 0, L);
          arm.halo.visible = false;
          g.add(arm.halo);
          const lb = labels[i];
          arm.label = makeLabel(lb.el + (lb.sub ? '_' + lb.sub : ''), ink(C.el[d.lig]), { halo: false, depthTest: true, size: narrow ? 11.5 : 12.5 });
          arm.label.userData.anchor = { pos: new THREE.Vector3(), r: rl };
          molG.add(arm.label);
          // 鍵偶極箭頭（每個鍵一支）
          const ba = makeArrow(C['ms-dip'], 0.028);
          const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.2, 10), ba.userData.shaft.material);
          ba.add(bar);
          ba.userData.bar = bar;
          ba.userData.domId = d.id;
          ba.visible = false;
          dipG.add(ba);
          bondArrows.push(ba);
        } else {
          fitR = Math.max(fitR, LP_LEN + 0.2);
          const lobe = new THREE.Mesh(lobeGeometry(centerR * 0.2, LP_LEN, 0.36),
            new THREE.MeshPhysicalMaterial({ color: tc(C['ms-lp']), transparent: true, opacity: isDark() ? 0.42 : 0.36, roughness: 0.25, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.2, emissive: tc(C['ms-lp']), emissiveIntensity: isDark() ? 0.25 : 0.08, depthWrite: false }));
          lobe.renderOrder = 4;
          lobe.userData.domId = d.id;
          g.add(lobe);
          pickables.push(lobe);
          arm.lobe = lobe;
          const em = new THREE.MeshStandardMaterial({ color: tc(C['ms-lp']), roughness: 0.3, emissive: tc(C['ms-lp']), emissiveIntensity: isDark() ? 0.5 : 0.25 });
          [-1, 1].forEach(function (s) {
            const e = new THREE.Mesh(new THREE.SphereGeometry(0.065, 16, 12), em);
            e.position.set(0.11 * s, 0, centerR * 0.2 + 0.64 * (LP_LEN - centerR * 0.2));
            g.add(e);
          });
          g.visible = !!state.show.lp;
        }
        arms.push(arm);
      });
      // 淨偶極
      netArrow = makeArrow(C['ms-dip'], 0.055);
      netArrow.visible = false;
      dipG.add(netArrow);
      muLabel = makeLabel('μ', C['ms-dip'], { italic: true, size: 15 });
      muLabel.visible = false;
      dipG.add(muLabel);
      // 地面陰影
      if (ground) { scene.remove(ground); disposeObject(ground); }
      ground = new THREE.Mesh(new THREE.PlaneGeometry(fitR * 14, fitR * 14), new THREE.ShadowMaterial({ opacity: isDark() ? 0.42 : 0.17 }));
      ground.position.z = -fitR * 1.12;
      ground.receiveShadow = true;
      scene.add(ground);
      const kd = new THREE.Vector3(2.5, -3.5, 9).normalize().multiplyScalar(fitR * 5);
      keyLight.position.copy(kd);
      keyLight.target.position.set(0, 0, 0);
      const sc = keyLight.shadow.camera;
      sc.left = -fitR * 1.7; sc.right = fitR * 1.7; sc.top = fitR * 1.7; sc.bottom = -fitR * 1.7;
      sc.near = 0.1; sc.far = fitR * 12;
      sc.updateProjectionMatrix();
      fillLight.position.set(-fitR * 4, fitR * 3, fitR * 1.5);
      clearGroup(polyG); polyLines = polyFaces = null;
      clearGroup(arcG); arcTube = arcFan = arcLabel = null;
    }

    // ---------- 每一格的更新 ----------
    const uV = new THREE.Vector3();
    function update() {
      const dragId = state.drag ? state.drag.id : null;
      arms.forEach(function (arm) {
        const d = domOf(arm.id);
        if (!d) return;
        uV.set(d.u[0], d.u[1], d.u[2]).normalize();
        arm.g.quaternion.setFromUnitVectors(ZAXIS, uV);
        const hot = state.hover === arm.id || dragId === arm.id;
        if (arm.ball) {
          arm.halo.visible = state.sel.indexOf(arm.id) >= 0;
          arm.ball.scale.setScalar(hot ? 1.1 : 1);
          arm.ball.material.emissiveIntensity = (isDark() ? 0.16 : 0.06) + (hot ? 0.25 : 0);
          arm.label.userData.anchor.pos.copy(uV).multiplyScalar(arm.L);
          arm.label.userData.anchor.r = arm.r * (hot ? 1.1 : 1);
        }
        if (arm.lobe) {
          arm.g.visible = !!state.show.lp;
          arm.lobe.material.opacity = (isDark() ? 0.42 : 0.36) + (hot ? 0.18 : 0);
        }
      });
      updateDipoles();
      updatePoly();
      updateArc();
      updateHud();
      requestRender();
    }
    function viewDirV() { return tmpC.copy(camera.position).sub(target).normalize(); }
    function updateDipoles() {
      const dip = B.dipole();
      const K = B.DIP_K;
      const vd = viewDirV().clone();
      bondArrows.forEach(function (ba) {
        const i = state.doms.findIndex(function (d) { return d.id === ba.userData.domId; });
        const d = state.doms[i], v = i >= 0 ? dip.bonds[i] : null;
        if (!state.show.bd || !d || !v) { ba.visible = false; return; }
        const q = VC.norm(v);
        if (q < 0.02) { ba.visible = false; return; }
        const L = B.bondLen(d), toLig = VC.dot(v, d.u) > 0;
        const s0 = toLig ? 0.3 : 0.85, s1 = toLig ? Math.min(0.92, 0.3 + q * K / L) : Math.max(0.2, 0.85 - q * K / L);
        const u = new THREE.Vector3(d.u[0], d.u[1], d.u[2]);
        let off = new THREE.Vector3().crossVectors(u, vd);
        if (off.lengthSq() < 1e-4) off.crossVectors(u, ZAXIS);
        if (off.lengthSq() < 1e-4) off.set(1, 0, 0);
        off.normalize();
        // 偏移到鍵的外側（鍵結原子的半徑外），避免被原子遮住
        const offLen = Math.max(0.3, B.ballR(d.lig) * 0.6);
        const a = u.clone().multiplyScalar(L * s0).addScaledVector(off, offLen);
        const b = u.clone().multiplyScalar(L * s1).addScaledVector(off, offLen);
        setArrow(ba, a, b);
        // 尾端的「+」：垂直於箭頭的一小段
        const bar = ba.userData.bar;
        bar.position.set(0, 0, 0.07);
        bar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0));
      });
      if (!state.show.net || dip.mag < 0.01 * dip.sumAbs + 1e-6 || dip.mag < 1e-3) {
        netArrow.visible = false; muLabel.visible = false;
        return;
      }
      const v = VC.unit(dip.net), L = Math.max(0.5, Math.min(2.6, dip.mag * K * 1.2));
      const from = new THREE.Vector3(-v[0] * 0.15, -v[1] * 0.15, -v[2] * 0.15);
      const to = new THREE.Vector3(v[0] * L, v[1] * L, v[2] * L);
      setArrow(netArrow, from, to);
      muLabel.visible = true;
      muLabel.position.copy(to).addScaledVector(new THREE.Vector3(v[0], v[1], v[2]), 0.28);
    }
    function updatePoly() {
      if (!state.show.poly || state.doms.length < 3) { polyG.visible = false; return; }
      polyG.visible = true;
      const U = state.doms.map(function (d) { return d.u; });
      const h = VC.hull(U);
      let Rp = 0;
      state.doms.forEach(function (d) { Rp += d.k === 'L' ? LP_LEN : B.bondLen(d); });
      Rp /= Math.max(1, state.doms.length);
      const P = U.map(function (u) { return [u[0] * Rp, u[1] * Rp, u[2] * Rp]; });
      const ep = [];
      h.edges.forEach(function (e) { ep.push(P[e[0]][0], P[e[0]][1], P[e[0]][2], P[e[1]][0], P[e[1]][1], P[e[1]][2]); });
      const fp = [];
      h.faces.forEach(function (f) { f.forEach(function (k) { fp.push(P[k][0], P[k][1], P[k][2]); }); });
      if (!polyLines) {
        polyLines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: tc(C['ms-poly']), transparent: true, opacity: 0.75, depthWrite: false }));
        polyLines.renderOrder = 7;
        polyFaces = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: tc(C['ms-poly']), transparent: true, opacity: isDark() ? 0.07 : 0.06, side: THREE.DoubleSide, depthWrite: false }));
        polyFaces.renderOrder = 3;
        polyG.add(polyLines); polyG.add(polyFaces);
      }
      polyLines.geometry.dispose();
      polyLines.geometry = new THREE.BufferGeometry();
      polyLines.geometry.setAttribute('position', new THREE.Float32BufferAttribute(ep, 3));
      polyFaces.geometry.dispose();
      polyFaces.geometry = new THREE.BufferGeometry();
      polyFaces.geometry.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
    }
    function updateArc() {
      const ok = state.sel.length === 2 && domOf(state.sel[0]) && domOf(state.sel[1]);
      if (!ok) { arcG.visible = false; return; }
      arcG.visible = true;
      const da = domOf(state.sel[0]), db = domOf(state.sel[1]);
      const a = da.u, b = db.u;
      const r = 0.62 * Math.min(B.bondLen(da), B.bondLen(db));
      const th = Math.acos(Math.max(-1, Math.min(1, VC.dot(a, b))));
      let ax = VC.cross(a, b);
      if (VC.norm(ax) < 1e-6) ax = VC.cross(a, Math.abs(a[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]);
      ax = VC.unit(ax);
      const n = 40, pts = [], fan = [];
      for (let k = 0; k <= n; k++) { const v = VC.rotate(a, ax, th * k / n); pts.push(new THREE.Vector3(v[0] * r, v[1] * r, v[2] * r)); }
      for (let k = 0; k < n; k++) fan.push(0, 0, 0, pts[k].x, pts[k].y, pts[k].z, pts[k + 1].x, pts[k + 1].y, pts[k + 1].z);
      const curve = new THREE.CatmullRomCurve3(pts);
      if (!arcTube) {
        arcTube = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ color: tc(C.accent), roughness: 0.35, emissive: tc(C.accent), emissiveIntensity: 0.35 }));
        arcFan = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: tc(C.accent), transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false }));
        arcFan.renderOrder = 5;
        arcG.add(arcTube); arcG.add(arcFan);
      }
      arcTube.geometry.dispose();
      arcTube.geometry = new THREE.TubeGeometry(curve, 48, 0.028, 8, false);
      arcFan.geometry.dispose();
      arcFan.geometry = new THREE.BufferGeometry();
      arcFan.geometry.setAttribute('position', new THREE.Float32BufferAttribute(fan, 3));
      const text = B.deg(th * VC.DEG);
      if (!arcLabel) { arcLabel = makeLabel(text, C.accent, { size: 14 }); arcG.add(arcLabel); }
      else setLabelText(arcLabel, text, C.accent, { size: 14 });
      const mid = VC.unit(VC.rotate(a, ax, th / 2));
      arcLabel.position.set(mid[0] * (r + 0.42), mid[1] * (r + 0.42), mid[2] * (r + 0.42));
    }
    function updateHud() {
      const info = B.analyze();
      setHud('f', B.formulaHTML(VC.formula(state.spec)));
      setHud('shape', B.shapeName(VC.shapeOf(state.spec.ligs.length, state.spec.lp)));
      const st = B.stateText();
      setHud('st', st === 'ok' ? T('能量最低', 'lowest energy') : st === 'warn' ? T('局部最低', 'local minimum') : T('調整中…', 'moving…'), st === 'ok' ? 'ok' : st === 'warn' ? 'warn' : 'm');
      let ang = '';
      if (state.sel.length === 2) {
        const labels = B.ligLabels();
        const ia = state.doms.findIndex(function (d) { return d.id === state.sel[0]; });
        const ib = state.doms.findIndex(function (d) { return d.id === state.sel[1]; });
        if (ia >= 0 && ib >= 0) {
          ang = '∠' + B.labelHTML(labels[ia]) + '–' + state.spec.center + '–' + B.labelHTML(labels[ib]) + ' = ' + B.deg(VC.angleDeg(state.doms[ia].u, state.doms[ib].u));
        }
      }
      setHud('ang', ang);
      let dip = '';
      if (state.show.net && state.settled && info) {
        const dd = B.dipole();
        dip = dd.mag < 0.01 * dd.sumAbs + 1e-6 || dd.mag < 1e-3 ? T('淨偶極 = 0（非極性）', 'net dipole = 0 (non-polar)') : T('淨偶極 ', 'net dipole ') + B.num(dd.mag, 2) + T('（極性）', ' (polar)');
      }
      setHud('dip', dip);
    }

    // ---------- 指標：拖曳電子域（要在 OrbitControls 之前註冊，才能攔下旋轉） ----------
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let drag = null;
    function setRay(ev) {
      const r = canvas.getBoundingClientRect();
      ndc.set((ev.clientX - r.left) / r.width * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
    }
    function pick(ev) {
      setRay(ev);
      const list = pickables.filter(function (o) { let p = o; while (p) { if (!p.visible) return false; p = p.parent; } return true; });
      const hit = ray.intersectObjects(list, false)[0];
      return hit ? hit.object.userData.domId : null;
    }
    /** 放手時，射線穿過哪一個電子域「開始拖之前的位置」（球的半徑內，取最近的）；沒有就傳回 null */
    function dropTarget(ev, dragId) {
      const from = B.dragFrom && B.dragFrom();
      if (!from) return null;
      setRay(ev);
      const o = ray.ray.origin, v = ray.ray.direction;
      let best = null, bd = Infinity;
      from.forEach(function (f) {
        if (f.id === dragId) return;
        const R = handleR(f.d), p = new THREE.Vector3(f.u[0] * R, f.u[1] * R, f.u[2] * R).sub(o);
        const t = p.dot(v), dist = Math.sqrt(Math.max(0, p.lengthSq() - t * t));
        const lim = (f.d.k === 'L' ? 0.32 : B.ballR(f.d.lig)) * 1.25 + 0.05;
        if (t > 0 && dist <= lim && dist < bd) { bd = dist; best = f.id; }
      });
      return best;
    }
    function handleR(d) { return d.k === 'L' ? LP_LEN * 0.8 : B.bondLen(d); }
    /** 射線和半徑 R 的球面的兩個交點（近、遠）；沒有交點時傳回射線上最接近球心的點 */
    function sphereHits(R) {
      const o = ray.ray.origin, v = ray.ray.direction;
      const b = o.dot(v), c = o.lengthSq() - R * R, disc = b * b - c;
      if (disc < 0) { const p = o.clone().addScaledVector(v, -b); return { rim: p }; }
      const s = Math.sqrt(disc);
      return { near: o.clone().addScaledVector(v, -b - s), far: o.clone().addScaledVector(v, -b + s) };
    }
    function dragDir(ev) {
      const d = domOf(drag.id);
      if (!d) return null;
      setRay(ev);
      const h = sphereHits(handleR(d));
      if (h.rim) { drag.rim = true; return h.rim.normalize().toArray(); }
      if (drag.rim) { drag.hemi = -drag.hemi; drag.rim = false; }
      return (drag.hemi > 0 ? h.near : h.far).normalize().toArray();
    }
    function setHover(id) {
      if (id === state.hover) return;
      state.hover = id;
      canvas.classList.toggle('on-dom', id != null);
      update();
    }
    canvas.addEventListener('pointerdown', function (ev) {
      if (ev.button !== 0) return;
      const id = pick(ev);
      if (id == null) return;
      const d = domOf(id);
      drag = { id: id, pid: ev.pointerId, moved: false, x0: ev.clientX, y0: ev.clientY, hemi: 1, rim: false };
      // 從近的或遠的交點開始，看哪一個比較接近電子域現在的位置
      const h = sphereHits(handleR(d));
      if (h.near) {
        const R = handleR(d), cur = new THREE.Vector3(d.u[0] * R, d.u[1] * R, d.u[2] * R);
        drag.hemi = h.near.distanceTo(cur) <= h.far.distanceTo(cur) ? 1 : -1;
      }
      try { canvas.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
      setHover(id);
      ev.stopImmediatePropagation();
      ev.preventDefault();
    });
    canvas.addEventListener('pointermove', function (ev) {
      if (drag && ev.pointerId === drag.pid) {
        if (!drag.moved && Math.hypot(ev.clientX - drag.x0, ev.clientY - drag.y0) < 5) { ev.stopImmediatePropagation(); return; }
        if (!drag.moved) { drag.moved = true; B.dragStart(drag.id); }
        const u = dragDir(ev);
        if (u) B.dragTo(drag.id, u);
        ev.stopImmediatePropagation();
        return;
      }
      if (!ev.buttons && ev.pointerType !== 'touch') setHover(pick(ev));
    });
    function pointerEnd(ev) {
      if (!drag || ev.pointerId !== drag.pid) return;
      const p = drag;
      drag = null;
      if (p.moved) B.dragEnd(dropTarget(ev, p.id)); else B.pick(p.id);
      if (ev.pointerType !== 'mouse') setHover(null);
      ev.stopImmediatePropagation();
    }
    canvas.addEventListener('pointerup', pointerEnd);
    canvas.addEventListener('pointercancel', pointerEnd);
    canvas.addEventListener('pointerleave', function () { if (!drag) setHover(null); });

    // ---------- 視角控制 ----------
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = !B.reducedMotion;
    controls.dampingFactor = 0.12;
    controls.rotateSpeed = 0.85;
    controls.enablePan = false;
    controls.minPolarAngle = 0.02;
    controls.maxPolarAngle = Math.PI - 0.02;
    let startAng = null;
    controls.addEventListener('start', function () { startAng = [controls.getAzimuthalAngle(), controls.getPolarAngle()]; });
    controls.addEventListener('end', function () {
      if (!startAng) return;
      const da = controls.getAzimuthalAngle() - startAng[0];
      const turned = Math.abs(Math.atan2(Math.sin(da), Math.cos(da))) + Math.abs(controls.getPolarAngle() - startAng[1]);
      startAng = null;
      if (turned > 0.02) reportView();
    });
    let viewTimer = 0;
    function reportView() {
      clearTimeout(viewTimer);
      // 阻尼還在轉時先等一下，回報停下來的視線方向
      viewTimer = setTimeout(function () { if (api.active) B.rotated(viewDir()); }, controls.enableDamping ? 450 : 0);
    }
    // 鍵盤：方向鍵轉動分子（Shift 轉得多），+／− 縮放
    canvas.addEventListener('keydown', function (ev) {
      const k = ev.key;
      const big = ev.shiftKey ? 3 : 1;
      const off = camera.position.clone().sub(target);
      if (k === 'ArrowLeft' || k === 'ArrowRight') {
        off.applyAxisAngle(ZAXIS, (k === 'ArrowLeft' ? -1 : 1) * 5 * big * Math.PI / 180);
      } else if (k === 'ArrowUp' || k === 'ArrowDown') {
        const right = new THREE.Vector3().crossVectors(ZAXIS, off).normalize();
        const cand = off.clone().applyAxisAngle(right, (k === 'ArrowUp' ? 1 : -1) * 5 * big * Math.PI / 180);
        const pol = Math.acos(Math.max(-1, Math.min(1, cand.z / cand.length())));
        if (pol > 0.05 && pol < Math.PI - 0.05) off.copy(cand);
      } else if (k === '+' || k === '=' || k === '-' || k === '_') {
        off.multiplyScalar(k === '-' || k === '_' ? 1.12 : 1 / 1.12);
        const L = off.length();
        if (L < controls.minDistance || L > controls.maxDistance) return;
      } else return;
      ev.preventDefault();
      camera.position.copy(target).add(off);
      camera.lookAt(target);
      controls.update();
      requestRender();
      if (k.indexOf('Arrow') === 0) reportView();
    });

    // ---------- 視角 ----------
    let lastFitDist = 0, lastAspect = 0;
    function fitDistance() {
      const vf = camera.fov * Math.PI / 180;
      const hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
      return fitR * 1.08 / Math.sin(Math.min(vf, hf) / 2);
    }
    function defaultBack() {
      const R = B.defaultView();
      return new THREE.Vector3(R[2][0], R[2][1], R[2][2]).normalize();
    }
    function setLimits() {
      controls.minDistance = fitR * 1.2;
      controls.maxDistance = fitR * 12;
      camera.near = fitR * 0.02;
      camera.far = fitR * 60;
      camera.updateProjectionMatrix();
    }
    function placeCamera(back, dist) {
      if (Math.abs(back.z) > 0.995) back = new THREE.Vector3(back.x + 0.08, back.y, back.z).normalize();
      controls.target.copy(target);
      camera.position.copy(target).addScaledVector(back, dist);
      camera.lookAt(target);
      setLimits();
      controls.update();
    }
    function resetCamera(user) {
      const d = fitDistance();
      lastFitDist = d;
      placeCamera(defaultBack(), d);
      requestRender();
      if (user) reportView(); // 只有使用者按「重設視角」才回報
    }
    /** 分子大小或畫面比例改變：保持視線方向與使用者的縮放比例，重新對準 */
    function refit() {
      const cur = camera.position.distanceTo(target);
      const ratio = lastFitDist ? cur / lastFitDist : 1;
      const dir = camera.position.clone().sub(target).normalize();
      const d = fitDistance();
      lastFitDist = d;
      placeCamera(dir, d * ratio);
    }
    function viewDir() { camera.updateMatrixWorld(); return viewDirV().toArray(); }
    function viewMatrix() {
      camera.updateMatrixWorld();
      const x = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
      const y = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize();
      const z = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 2).normalize();
      return [x.toArray(), y.toArray(), z.toArray()];
    }

    // ---------- 繪製 ----------
    let raf = 0;
    function placeLabels() {
      // 原子符號貼在原子朝向鏡頭的那一面（有深度測試：被前面的原子擋住就看不到）
      const lab = function (sp) {
        if (!sp) return;
        const a = sp.userData.anchor;
        tmpB.copy(camera.position).sub(a.pos).normalize();
        sp.position.copy(a.pos).addScaledVector(tmpB, a.r * 1.03);
      };
      lab(centerLabel);
      arms.forEach(function (arm) { lab(arm.label); });
    }
    function renderNow() {
      if (!api.active || document.hidden) return;
      const want = Math.min(window.devicePixelRatio || 1, 2);
      if (renderer.getPixelRatio() !== want) { renderer.setPixelRatio(want); resize3(); return; }
      const moved = controls.update();
      placeLabels();
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
      const before = fitR;
      buildMolecule();
      if (Math.abs(fitR - before) > 1e-6 && lastAspect) refit();
      update();
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
      update: function () { update(); },
      rebuild: function () { rebuildAll(); requestRender(); },
      onTheme: function () {
        C = B.colors();
        buildEnv();
        Object.keys(hudLast).forEach(function (k) { delete hudLast[k]; });
        rebuildAll();
        requestRender();
      },
      resetCamera: function () { resetCamera(true); },
      viewDir: viewDir,
      viewMatrix: viewMatrix,
      /** 第 id 個電子域握把在畫布上的位置（CSS px，相對於畫布左上角），給端到端測試做真的拖曳 */
      handleXY: function (id) {
        const d = domOf(id);
        if (!d) return null;
        const R = handleR(d), v = new THREE.Vector3(d.u[0] * R, d.u[1] * R, d.u[2] * R).project(camera);
        const r = canvas.getBoundingClientRect();
        return { x: (v.x + 1) / 2 * r.width, y: (1 - v.y) / 2 * r.height };
      },
      dispose: function () {
        api.active = false;
        clearTimeout(viewTimer);
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
        state.hover = null;
      }
    };

    // 初始化：視角接續 2D 的視角
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
    buildMolecule();
    lastFitDist = fitDistance();
    const R0 = state.R;
    placeCamera(R0 ? new THREE.Vector3(R0[2][0], R0[2][1], R0[2][2]).normalize() : defaultBack(), lastFitDist);
    update();
    renderNow();
    return api;
  }

  window.Vsepr3D = { create: create };
})();
