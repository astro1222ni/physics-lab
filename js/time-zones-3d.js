/*
 * time-zones-3d.js — 「經緯度、時區與換日線」的 3D 地球儀（three.js）
 *
 * 由 js/time-zones.js 在使用者按「3D 地球儀」時才載入（three.js 也是那時才以 import() 載入）；切回 2D 時整個釋放。
 * 用法：window.TimeZones3D.create({ THREE, OrbitControls }, 容器, bridge) → { active, frame, busy, onShow, onTheme, onLook, onChange, resetCamera, camTo, dispose }
 *
 * 場景：地球半徑 1，y 軸 = 地軸（北極朝上）。太陽固定在 +x 方向、仰角 = 太陽赤緯；地球繞 y 軸自轉，
 *   轉角讓太陽直射點的經度正對太陽（時間一走，地球就逆時針轉——從北極上空看）。
 * 2D 給不了的：從北極上空往下看，24 個時區像時鐘的刻度，晝夜的分界固定不動、地球在底下轉；
 *   換日線與午夜線是地球上兩條「縫」，兩條縫之間的那一瓣就是「另一個日期」。
 */
(function () {
  'use strict';

  function create(lib, host, B) {
    const THREE = lib.THREE;
    const K = B.K, T = B.T, state = B.state, D = B.D;
    let C = B.colors();
    const DEG = Math.PI / 180;
    let cw = 300, ch = 300;              // 畫布大小（標籤要用來換算像素大小，所以放最前面）

    // ---------- 畫布與 HUD ----------
    const wrap = document.createElement('div');
    wrap.className = 'c3-wrap';
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', T('3D 地球儀（可拖曳旋轉、縮放）：太陽從一側照來，一瓣一瓣的是時區，兩條亮線是日期改變的地方', '3D globe (drag to rotate, pinch or scroll to zoom): the Sun shines from one side, the slices are time zones, and the two bright seams are where the date changes'));
    wrap.appendChild(canvas);
    const hud = document.createElement('div');
    hud.className = 'c3-hud';
    hud.setAttribute('aria-hidden', 'true');
    hud.innerHTML = '<div class="tl"><span data-k="utc"></span><span class="m" data-k="tp"></span></div>' +
      '<div class="br"><span class="m" data-k="sub"></span><span class="m" data-k="dates"></span></div>';
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

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1.6, 0.05, 100);
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.rotateSpeed = 0.7;
    controls.enablePan = false;
    controls.minDistance = 1.8;
    controls.maxDistance = 9;

    // 光：太陽（方向光）＋很弱的環境光，讓夜半球還看得到輪廓
    const amb = new THREE.AmbientLight(0x8aa0c8, 0.22);
    scene.add(amb);
    const sunLight = new THREE.DirectionalLight(0xffffff, 2.2);
    scene.add(sunLight);

    /** 經緯度 → 地球上的方向（和 SphereGeometry 的貼圖座標一致：經度 0° 在 +x、東經 90° 在 −z） */
    function vec(lon, lat, r) {
      const a = lon * DEG, b = lat * DEG;
      return new THREE.Vector3(r * Math.cos(b) * Math.cos(a), r * Math.sin(b), -r * Math.cos(b) * Math.sin(a));
    }
    const col = function (c) { return new THREE.Color(C[c] || c || '#888888'); };
    function disposeObject(obj) {
      obj.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m.map && m.map !== earthTex) m.map.dispose(); m.dispose(); });
      });
    }
    function clearGroup(g) { disposeObject(g); g.clear(); }

    // ---------- 地球 ----------
    const earth = new THREE.Group();
    scene.add(earth);
    let earthTex = null, texKey = '';
    const earthMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const globe = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), earthMat);
    earth.add(globe);
    function updateTexture() {
      const sh = K.dateShares(state.day, state.utc);
      const key = [sh.map(function (x) { return x.day + ':' + x.frac.toFixed(4); }).join(','), state.zones, state.dates, D.ver, D.dark].join('|');
      if (key === texKey && earthTex) return;
      texKey = key;
      const c = B.globeTexture(2048);
      if (!earthTex) {
        earthTex = new THREE.CanvasTexture(c);
        earthTex.colorSpace = THREE.SRGBColorSpace;
        earthTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        earthMat.map = earthTex; earthMat.needsUpdate = true;
      } else { earthTex.image = c; earthTex.needsUpdate = true; }
    }

    // 經線（細管）：換日線、午夜線
    function meridianTube(lon, color, rad, opacity) {
      const pts = [];
      for (let lat = -90; lat <= 90; lat += 3) pts.push(vec(lon, lat, 1.004));
      const curve = new THREE.CatmullRomCurve3(pts);
      const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 90, rad, 6, false),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: opacity < 1, opacity: opacity }));
      return m;
    }
    const seams = new THREE.Group();
    earth.add(seams);
    let seamKey = '';
    function updateSeams() {
      const mid = K.midnightLon(state.utc);
      const key = [mid, D.ver, D.dark].join('|');
      if (key === seamKey) return;
      seamKey = key;
      clearGroup(seams);
      seams.add(meridianTube(180, C['tz-dateline'], 0.007, 1));
      if (Math.abs(K.n180(mid - 180)) > 1e-6 && Math.abs(K.n180(mid + 180)) > 1e-6) seams.add(meridianTube(mid, C['tz-midnight'], 0.009, 1));
    }

    // 標籤（固定像素大小的 Sprite）
    const RES = Math.min(window.devicePixelRatio || 1, 2);
    function labelCanvas(text, color, sub) {
      const font = '700 ' + 12.5 * RES + 'px ' + D.FONT, fsub = '600 ' + 10.5 * RES + 'px ' + D.FONT;
      const c = document.createElement('canvas');
      let g = c.getContext('2d');
      g.font = font;
      let tw = g.measureText(text).width;
      if (sub) { g.font = fsub; tw = Math.max(tw, g.measureText(sub).width); }
      c.width = Math.ceil(tw + 14 * RES); c.height = Math.ceil((sub ? 34 : 21) * RES);
      g = c.getContext('2d');
      const r = Math.min(c.height / 2, 10 * RES) - RES;
      g.beginPath();
      g.moveTo(r + RES, RES); g.arcTo(c.width - RES, RES, c.width - RES, c.height - RES, r); g.arcTo(c.width - RES, c.height - RES, RES, c.height - RES, r);
      g.arcTo(RES, c.height - RES, RES, RES, r); g.arcTo(RES, RES, c.width - RES, RES, r); g.closePath();
      g.fillStyle = 'rgba(8,14,24,0.8)'; g.fill();
      g.strokeStyle = color; g.globalAlpha = 0.65; g.lineWidth = RES; g.stroke(); g.globalAlpha = 1;
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = color;
      if (sub) {
        g.font = fsub; g.fillStyle = '#cbd5e1'; g.fillText(sub, c.width / 2, 10.5 * RES);
        g.font = font; g.fillStyle = color; g.fillText(text, c.width / 2, 23.5 * RES);
      } else { g.font = font; g.fillText(text, c.width / 2, c.height / 2 + RES * 0.5); }
      return c;
    }
    function label(text, color, pos, sub) {
      const c = labelCanvas(text, color, sub);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false }));
      sp.userData = { lw: c.width / RES, lh: c.height / RES, isLabel: true, text: text + '|' + (sub || '') + '|' + color };
      sp.position.copy(pos);
      sp.renderOrder = 30;
      fitLabel(sp);
      return sp;
    }
    function relabel(sp, text, color, sub) {
      const key = text + '|' + (sub || '') + '|' + color;
      if (sp.userData.text === key) return;
      const c = labelCanvas(text, color, sub);
      sp.material.map.image = c; sp.material.map.needsUpdate = true;
      sp.userData.lw = c.width / RES; sp.userData.lh = c.height / RES; sp.userData.text = key;
      fitLabel(sp);
    }
    function fitLabel(sp) {
      const k = 2 * Math.tan(camera.fov * Math.PI / 360) / Math.max(1, ch);
      sp.scale.set(sp.userData.lw * k, sp.userData.lh * k, 1);
    }

    // 赤道外圈的時區時鐘：每個時區一個標籤（偏移＋此刻的區時），跟著地球轉
    const ring = new THREE.Group();
    earth.add(ring);
    const ringLabels = [];
    for (let z = -12; z <= 12; z++) {
      if (z === -12) continue;                    // ±12 共用 180° 的位置，只放一個
      const sp = label('00h', C['text'] || '#fff', vec(z * 15, 0, 1.2), '+0');
      sp.userData.zone = z;
      ring.add(sp); ringLabels.push(sp);
    }
    // 圈：赤道面上的淡圓環（像錶盤）
    const dial = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.13, 120), new THREE.MeshBasicMaterial({ color: 0x9fb4d4, transparent: true, opacity: 0.25, side: THREE.DoubleSide }));
    dial.rotation.x = -Math.PI / 2;
    earth.add(dial);
    let ringKey = '';
    function updateRing() {
      const h = Math.floor(state.utc), key = [h, state.day, state.probe.lon, D.ver, D.dark, ch].join('|');
      if (key === ringKey) return;
      ringKey = key;
      const tz = K.zoneOf(state.probe.lon);
      ringLabels.forEach(function (sp) {
        const z = sp.userData.zone;
        const L = K.local(state.day, state.utc, z);
        const hh = String(Math.floor(L.clock)).padStart(2, '0');
        const shares = K.dateShares(state.day, state.utc);
        const newer = shares.length > 1 && L.day > shares[0].day;
        const color = z === tz ? '#7cc0ff' : newer ? (C['tz-dateB'] || '#ffc54d') : (C['tz-dateA'] || '#6ea8fe');
        relabel(sp, hh + T(' 時', 'h'), color, (z === 12 ? '±12' : (z > 0 ? '+' : z < 0 ? '−' : '±') + Math.abs(z)));
      });
    }

    // 城市、量測點、飛行
    const marks = new THREE.Group();
    earth.add(marks);
    const cityGeo = new THREE.SphereGeometry(0.009, 10, 8);
    let cityMat = new THREE.MeshBasicMaterial({ color: col('tz-city') });
    const tpMat = new THREE.MeshBasicMaterial({ color: col('accent') });
    K.CITIES.forEach(function (cy) {
      const m = new THREE.Mesh(cityGeo, cy.id === 'taipei' ? tpMat : cityMat);
      m.position.copy(vec(cy.lon, cy.lat, 1.003));
      m.userData.city = cy.id;
      marks.add(m);
    });
    const probe = new THREE.Group();
    earth.add(probe);
    const needle = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.12, 8), new THREE.MeshBasicMaterial({ color: col('tz-probe') }));
    needle.position.y = 0.06;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.02, 16, 12), new THREE.MeshBasicMaterial({ color: col('tz-probe') }));
    head.position.y = 0.12;
    probe.add(needle); probe.add(head);
    let probeLabel = label('—', '#7cc0ff', new THREE.Vector3(0, 0.17, 0));
    probeLabel.center.set(0.5, 0);
    probe.add(probeLabel);
    function updateProbe() {
      const P = B.probePlace();
      const up = vec(P.lon, P.lat, 1).normalize();
      probe.position.copy(up.clone().multiplyScalar(1.0));
      probe.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
      const cy = state.probe.city ? K.CITY[state.probe.city] : null;
      relabel(probeLabel, (cy ? B.cityName(cy) + ' ' : '') + B.hm(P.clock), '#7cc0ff', B.dateTxt(P.day));
    }
    const flightGroup = new THREE.Group();
    earth.add(flightGroup);
    let flightKey = '';
    function arcTube(pts, color, rad, opacity) {
      const curve = new THREE.CatmullRomCurve3(pts);
      return new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(16, pts.length * 2), rad, 6, false),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: opacity < 1, opacity: opacity }));
    }
    function gcPts(a, b, f1, n) {
      const out = [];
      for (let i = 0; i <= n; i++) {
        const p = K.gcPoint(a, b, f1 * i / n), w = 0.02 * Math.sin(Math.PI * f1 * i / n);
        out.push(vec(p[0], p[1], 1.006 + w));
      }
      return out;
    }
    const plane = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.05, 10), new THREE.MeshBasicMaterial({ color: col('tz-flight') }));
    plane.visible = false;
    earth.add(plane);
    function updateFlight() {
      const fl = state.flying, dep = K.CITY[state.dep], arr = K.CITY[state.arr];
      const f = fl ? Math.round(fl.f * 200) / 200 : -1;
      const key = [state.dep, state.arr, f, state.flights.length, D.ver, D.dark].join('|');
      if (key === flightKey) return;
      flightKey = key;
      clearGroup(flightGroup);
      state.flights.forEach(function (F) {
        const a = K.CITY[F.dep], b = K.CITY[F.arr];
        flightGroup.add(arcTube(gcPts([a.lon, a.lat], [b.lon, b.lat], 1, 64), C['tz-flight'], 0.004, 0.45));
      });
      plane.visible = false;
      if (fl) {
        const a = K.CITY[fl.F.dep], b = K.CITY[fl.F.arr];
        flightGroup.add(arcTube(gcPts([a.lon, a.lat], [b.lon, b.lat], 1, 64), C['tz-flight'], 0.003, 0.35));
        if (fl.f > 0.01) flightGroup.add(arcTube(gcPts([a.lon, a.lat], [b.lon, b.lat], fl.f, 48), C['tz-flight'], 0.007, 1));
        const p = K.gcPoint([a.lon, a.lat], [b.lon, b.lat], fl.f), q = K.gcPoint([a.lon, a.lat], [b.lon, b.lat], Math.min(1, fl.f + 0.01));
        const h = 1.006 + 0.02 * Math.sin(Math.PI * fl.f);
        plane.position.copy(vec(p[0], p[1], h + 0.01));
        const dir = vec(q[0], q[1], h + 0.01).sub(plane.position).normalize();
        plane.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        plane.visible = true;
      } else if (dep && arr && dep !== arr) {
        flightGroup.add(arcTube(gcPts([dep.lon, dep.lat], [arr.lon, arr.lat], 1, 64), C['tz-flight'], 0.004, 0.85));
      }
    }

    // ---------- 太陽 ----------
    const sunGroup = new THREE.Group();
    scene.add(sunGroup);
    function glowTexture() {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
      gr.addColorStop(0, 'rgba(255,250,220,1)'); gr.addColorStop(0.25, 'rgba(255,214,90,0.85)'); gr.addColorStop(1, 'rgba(255,190,40,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    }
    const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false }));
    sunSprite.scale.set(0.62, 0.62, 1);
    sunGroup.add(sunSprite);
    const rayMat = new THREE.LineDashedMaterial({ color: 0xffd43b, dashSize: 0.06, gapSize: 0.05, transparent: true, opacity: 0.8 });
    const rayGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const ray = new THREE.Line(rayGeo, rayMat);
    scene.add(ray);
    const subDot = new THREE.Mesh(new THREE.SphereGeometry(0.022, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffd43b }));
    scene.add(subDot);
    let S = new THREE.Vector3(1, 0, 0);

    function update() {
      const s = K.sun(state.day, state.utc);
      S = new THREE.Vector3(Math.cos(s.dec * DEG), Math.sin(s.dec * DEG), 0);
      earth.rotation.y = -s.lon * DEG;
      sunLight.position.copy(S.clone().multiplyScalar(10));
      sunGroup.position.copy(S.clone().multiplyScalar(2.45));
      subDot.position.copy(S.clone().multiplyScalar(1.006));
      rayGeo.setFromPoints([S.clone().multiplyScalar(2.28), S.clone().multiplyScalar(1.03)]);
      ray.computeLineDistances();
      updateTexture(); updateSeams(); updateRing(); updateProbe(); updateFlight();
      marks.visible = state.cities;
      ring.visible = state.zones; dial.visible = state.zones;
      const tp = K.local(state.day, state.utc, 8), sh = K.dateShares(state.day, state.utc);
      setHud('utc', 'UTC ' + B.dateTxt(state.day) + ' ' + B.hm(state.utc));
      setHud('tp', T('臺北 ', 'Taipei ') + B.dateTxt(tp.day) + ' ' + B.hm(tp.clock));
      setHud('sub', T('太陽直射 ', 'Subsolar point ') + B.num(Math.abs(s.lat), 1) + '°' + (s.lat >= 0 ? 'N' : 'S'));
      setHud('dates', sh.length > 1 ? T('此刻有兩個日期：', 'Two dates now: ') + sh.map(function (x) { return B.dateTxt(x.day); }).join(T('、', ', ')) : T('整個地球同一天', 'One date everywhere'));
    }

    // ---------- 相機 ----------
    function sizeOf(w) { return w < 560 ? 380 : 480; }
    function resize3() {
      const w = wrap.clientWidth;
      if (!w) return;
      const h = sizeOf(w);
      if (canvas.style.height !== h + 'px') canvas.style.height = h + 'px';
      cw = w; ch = h;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      scene.traverse(function (o) { if (o.userData && o.userData.isLabel) fitLabel(o); });
      ringKey = '';
      render();
    }
    let camAnim = null;
    function presetFor(kind) {
      const far = camera.aspect < 1 ? 1.35 : 1, d = 4.6 * far;
      if (kind === 'north') return { pos: new THREE.Vector3(0.001, d, 0.02), up: new THREE.Vector3(0, 1, 0) };
      if (kind === 'south') return { pos: new THREE.Vector3(0.001, -d, 0.02), up: new THREE.Vector3(0, 1, 0) };
      if (kind === 'sun') return { pos: S.clone().multiplyScalar(d).add(new THREE.Vector3(0, 0.35, 0)) };
      // 預設：斜斜地看晨昏線
      return { pos: new THREE.Vector3(Math.cos(55 * DEG) * d * 0.95, d * 0.38, Math.sin(55 * DEG) * d * 0.95) };
    }
    function camTo(kind, animate) {
      const P = presetFor(kind);
      if (!animate || B.reducedMotion) {
        camAnim = null;
        camera.position.copy(P.pos); controls.target.set(0, 0, 0); controls.update(); render();
        return;
      }
      camAnim = { t0: performance.now(), dur: 900, p0: camera.position.clone(), p1: P.pos };
      B.request();
    }
    function stepCam() {
      if (!camAnim) return;
      const A = camAnim;
      const u = Math.min(1, (performance.now() - A.t0) / A.dur), e = 1 - Math.pow(1 - u, 3);
      // 沿球面插值（避免穿過地球）
      const r0 = A.p0.length(), r1 = A.p1.length();
      const v = A.p0.clone().normalize().lerp(A.p1.clone().normalize(), e);
      if (v.lengthSq() < 1e-6) v.set(0, 1, 0);
      camera.position.copy(v.normalize().multiplyScalar(r0 + (r1 - r0) * e));
      if (u >= 1) camAnim = null;
    }
    const _v = new THREE.Vector3(), _e = new THREE.Vector3(), _d = new THREE.Vector3();
    /** 點 p（世界座標）是否被地球（半徑 1）擋住 */
    function hidden(p) {
      _e.copy(camera.position);
      _d.copy(p).sub(_e);
      const L = _d.length();
      _d.multiplyScalar(1 / L);
      const b = _e.dot(_d), c = _e.lengthSq() - 1, disc = b * b - c;
      if (disc <= 0) return false;
      const t1 = -b - Math.sqrt(disc);
      return t1 > 0 && t1 < L - 1e-3;
    }
    function screenRect(sp, p) {
      _v.copy(p).project(camera);
      const x = (_v.x + 1) / 2 * cw, y = (1 - _v.y) / 2 * ch, w = sp.userData.lw, h = sp.userData.lh;
      const cy = sp.center ? sp.center.y : 0.5;
      return { x0: x - w / 2 - 2, x1: x + w / 2 + 2, y0: y - h * (1 - cy) - 2, y1: y + h * cy + 2, z: _v.z };
    }
    function layoutLabels() {
      const taken = [];
      const hit = function (r) { return taken.some(function (q) { return r.x0 < q.x1 && r.x1 > q.x0 && r.y0 < q.y1 && r.y1 > q.y0; }); };
      earth.updateMatrixWorld(true);
      const pp = new THREE.Vector3();
      probeLabel.getWorldPosition(pp);
      probeLabel.visible = !hidden(probe.getWorldPosition(new THREE.Vector3()));
      if (probeLabel.visible) taken.push(screenRect(probeLabel, pp));
      if (!ring.visible) return;
      const items = ringLabels.map(function (sp) {
        const p = sp.getWorldPosition(new THREE.Vector3());
        return { sp: sp, p: p, d: p.distanceToSquared(camera.position) };
      }).sort(function (a, b) { return a.d - b.d; });
      items.forEach(function (it) {
        if (hidden(it.p)) { it.sp.visible = false; return; }
        const r = screenRect(it.sp, it.p);
        if (hit(r)) { it.sp.visible = false; return; }
        it.sp.visible = true; taken.push(r);
      });
    }
    let moving = false;
    function render() {
      if (!api.active || document.hidden) return;
      const want = Math.min(window.devicePixelRatio || 1, 2);
      if (renderer.getPixelRatio() !== want) { renderer.setPixelRatio(want); renderer.setSize(cw, ch, false); }
      stepCam();
      moving = controls.update();
      // 從太陽方向看時，太陽的光暈會擋住地球：淡出
      const ca = camera.position.clone().normalize().dot(S);
      sunSprite.material.opacity = Math.max(0, Math.min(1, (0.93 - ca) / 0.12));
      rayMat.opacity = 0.8 * sunSprite.material.opacity;
      layoutLabels();
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
      onShow: function () { resize3(); update(); camTo('tilt', false); },
      onTheme: function () {
        C = B.colors();
        Object.keys(hudLast).forEach(function (k) { delete hudLast[k]; });
        texKey = ''; seamKey = ''; ringKey = ''; flightKey = '';
        cityMat.color = col('tz-city'); tpMat.color = col('accent');
        update(); render();
      },
      onLook: function () { texKey = ''; B.request(); },
      onChange: function () { B.request(); },
      resetCamera: function () { camTo('tilt', true); },
      camTo: function (kind) { camTo(kind, true); },
      dispose: function () {
        api.active = false;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize3);
        controls.dispose();
        disposeObject(scene);
        if (earthTex) earthTex.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        wrap.remove();
      }
    };

    const w0 = wrap.clientWidth;
    if (w0) {
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

  window.TimeZones3D = { create: create };
})();
