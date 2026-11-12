/*
 * doppler-3d.js — 「都卜勒效應」的 3D 立體檢視
 *
 * 這個檔案本身不依賴 three.js：使用者按「3D 立體」時，doppler.js 才以 import() 載入 vendor/three/，
 * 再呼叫 Doppler3D.create(lib, host, bridge) 建立場景；切回 2D 時 dispose() 釋放全部資源。
 *
 * 與 2D 用同一個物理核心（doppler-core.js）、同樣的參數與同一個時間 t：
 *   波前 ── DC.wavefronts(p, t)：每個波前的發出位置 S(te) 與半徑 r = v (t − te)。
 *           空氣中它是以 S(te) 為球心的球面；波源在地面上，所以地面以上是半球殼（半透明、半徑越大越淡）。
 *           地面（z = 0）與球面的交線就是 2D 俯視圖的圓；沿道路的鉛直剖面（y = 0）上是半圓。
 *           預設把靠近相機的一半切掉，看得到殼的內部與剖面。
 *   聽到的聲音 ── DC.arrivals(p, t)（推遲時間的精確解）：半透明救護車標出發出位置，虛線圓是此刻通過觀察者的波前。
 *   馬赫錐 ── v_s > v 時，以目前的波源為頂點、沿 −x 張開、半頂角 sin θ = v/v_s 的圓錐，
 *           畫到與最早的波前（t = 0 發出、半徑 v t）相切的圓為止：斜邊長 t √(v_s^2 − v^2)。
 *   參考聽者 ── 三個靜止的聽者（道路前方、後方、路旁），f′ 也由 DC.arrivals 算出。
 *
 * 場景座標（m）：x 沿道路（波源前進方向），y 與 2D 俯視圖相同，z 朝上；地面 z = 0。
 * 救護車與人是放大的圖示（和 2D 一樣未依比例）；速度箭頭長度 = 0.5 秒內移動的距離（與 2D 相同）。
 */
(function () {
  'use strict';
  const DC = window.DopplerCore;
  const R_DOME = 900;       // m：半球殼完全淡出的半徑（地面的圓與 2D 一樣畫得更遠）
  const MAX_DOMES = 32;     // 同時畫出的半球殼上限（f = 4 Hz、v = 150 m/s 時約 24 個）
  const MAX_RINGS = 48;     // 地面上的波前圓上限（最新的 48 個；更舊的早已淡出）
  const MAX_ARCS = 32;      // 剖面上的半圓上限
  const MAX_SEGS = 16;      // 地面上的線段（連線、馬赫錐邊、波長標註）
  const MAX_PULSE = 3;
  // 參考聽者（靜止）：道路前方、道路後方（離路面 60 m）、路旁 300 m
  const REFS = [
    { x: 620, y: 60, kind: 'road' },
    { x: -640, y: 60, kind: 'road' },
    { x: 40, y: 300, kind: 'side' }
  ];

  // ---------- 著色器：地面（2D 俯視圖畫在地上）與剖面 ----------
  const VERT = [
    'varying vec3 vW;',
    'void main() {',
    '  vec4 w = modelMatrix * vec4(position, 1.0);',
    '  vW = w.xyz;',
    '  gl_Position = projectionMatrix * viewMatrix * w;',
    '}'
  ].join('\n');
  const COMMON = [
    'varying vec3 vW;',
    'uniform vec3 uInk; uniform vec3 uWave; uniform vec3 uAccent; uniform vec3 uPos; uniform vec3 uNeg;',
    'uniform float uDark; uniform float uLw; uniform float uDpr; uniform float uMpp;',
    // 寬度 w（裝置像素）的線、到線的距離 d（裝置像素）：反鋸齒的帶狀
    'float band(float d, float w) { return 1.0 - smoothstep(0.5 * w - 0.7, 0.5 * w + 0.7, d); }',
    'void over(inout vec4 acc, vec3 c, float a) { a = clamp(a, 0.0, 1.0); acc.rgb = c * a + acc.rgb * (1.0 - a); acc.a = a + acc.a * (1.0 - a); }',
    'vec3 ink(float id) { if (id < 0.5) return uInk; if (id < 1.5) return uAccent; if (id < 2.5) return uPos; if (id < 3.5) return uNeg; return uWave; }',
    // 角度標記：以 c 為中心、半徑 R、方向角 a0 到 a1（相對於 −x 軸，往 +第二座標量）
    'float angArc(vec2 p, vec2 c, float R, float a1, float px) {',
    '  vec2 r = p - c; float ang = atan(r.y, -r.x);',
    '  float on = step(0.0, ang) * step(ang, a1);',
    '  return band(abs(length(r) - R) / px, 1.3 * uDpr) * on;',
    '}'
  ].join('\n');
  const GROUND_FRAG = [
    COMMON,
    'uniform vec3 uBase; uniform vec2 uHalf;',
    'uniform int uN; uniform vec4 uRings[' + MAX_RINGS + '];',
    'uniform int uArrN; uniform vec4 uArr[2];',
    'uniform int uSegN; uniform vec4 uSeg[' + MAX_SEGS + ']; uniform vec4 uSegS[' + MAX_SEGS + '];',
    'uniform vec4 uWedge; uniform vec4 uTheta;',
    'void main() {',
    '  vec2 p = vW.xy;',
    '  vec2 fw = max(fwidth(p), vec2(1e-4));',
    '  float px = max(length(fw) * 0.7071, 1e-4);',
    '  vec2 q = max(abs(p) - uHalf, 0.0);',
    '  float fade = 1.0 - smoothstep(0.0, 560.0, length(q));',
    '  float ay = abs(p.y);',
    '  float inRoad = 1.0 - smoothstep(14.0 - px, 14.0 + px, ay);',
    '  float roadFade = (1.0 - smoothstep(0.0, 1700.0, q.x)) * inRoad;',
    '  float ga = max(fade, roadFade);',
    '  if (ga < 0.003) discard;',
    // 地面：中央略亮、四周略暗（與 2D 背景的暈影相同）
    '  float vig = smoothstep(0.2, 1.25, length(p / (uHalf + 200.0)));',
    '  vec3 base = uBase * (1.0 - vig * (uDark > 0.5 ? 0.28 : 0.05));',
    '  vec4 acc = vec4(base * ga, ga);',
    // 格線：次格線每 50 m、主格線每 200 m（線寬 1 個裝置像素）
    '  vec2 g1 = abs(fract(p / 50.0 + 0.5) - 0.5) * 50.0 / fw;',
    '  vec2 g2 = abs(fract(p / 200.0 + 0.5) - 0.5) * 200.0 / fw;',
    '  float vis1 = clamp((50.0 / px - 5.0) / 10.0, 0.0, 1.0), vis2 = clamp((200.0 / px - 5.0) / 10.0, 0.0, 1.0);',
    '  over(acc, uInk, band(min(g1.x, g1.y), 1.0) * vis1 * (uDark > 0.5 ? 0.035 : 0.045) * fade);',
    '  over(acc, uInk, band(min(g2.x, g2.y), 1.0) * vis2 * (uDark > 0.5 ? 0.085 : 0.10) * fade);',
    // 道路：淡淡的帶狀＋路緣線＋中央虛線
    '  over(acc, uInk, inRoad * (uDark > 0.5 ? 0.10 : 0.075) * ga);',
    '  over(acc, uInk, band(abs(ay - 14.0) / fw.y, 1.0 * uDpr) * 0.16 * max(fade, 1.0 - smoothstep(0.0, 1700.0, q.x)));',
    '  float dsh = step(fract((p.x + 4000.0) / (20.0 * uMpp)), 0.5);',
    '  over(acc, uInk, band(ay / fw.y, 1.0 * uDpr) * dsh * 0.22 * ga);',
    // 馬赫錐內部（地面上）：淡淡的填色，越往後越淡
    '  if (uWedge.z > 0.0) {',
    '    vec2 r = p - uWedge.xy; float ax = -r.x;',
    '    if (ax > 0.0 && ax < uWedge.z) {',
    '      float ins = 1.0 - smoothstep(uWedge.w * ax - px, uWedge.w * ax + px, abs(r.y));',
    '      over(acc, uPos, ins * (1.0 - ax / uWedge.z) * (uDark > 0.5 ? 0.16 : 0.12) * fade);',
    '    }',
    '  }',
    // 波前（地面上的圓）：寬的柔光＋細亮線；圓心（發出位置）小點
    '  float wc = 1.6 * uLw * uDpr, wg = 7.0 * uLw * uDpr;',
    '  float kc = uDark > 0.5 ? 0.85 : 0.75, kg = uDark > 0.5 ? 0.12 : 0.08;',
    '  for (int i = 0; i < ' + MAX_RINGS + '; i++) {',
    '    if (i >= uN) break;',
    '    vec4 R = uRings[i];',
    '    float dd = length(p - R.xy);',
    '    float d = abs(dd - R.z) / px;',
    '    if (d < wg) {',
    '      over(acc, uWave, band(d, wg) * kg * R.w * fade);',
    '      over(acc, uWave, band(d, wc) * kc * R.w * fade);',
    '    }',
    '    over(acc, uWave, (1.0 - smoothstep(1.3 * uDpr, 2.3 * uDpr, dd / px)) * 0.45 * fade);',
    '  }',
    // 此刻通過觀察者的波前：虛線圓（最晚發出的用強調色，超音速時較早發出的用紅色）
    '  for (int k = 0; k < 2; k++) {',
    '    if (k >= uArrN) break;',
    '    vec4 A = uArr[k];',
    '    vec2 dv = p - A.xy;',
    '    float d = abs(length(dv) - A.z) / px;',
    '    float on = step(fract(atan(dv.y, dv.x) * A.z / (11.0 * uMpp)), 0.55);',
    '    over(acc, A.w < 0.5 ? uAccent : uPos, band(d, 1.6 * uLw * uDpr) * on * 0.8 * fade);',
    '  }',
    // 線段（st.x 顏色、st.y 線寬 CSS 像素、st.z 虛線週期 CSS 像素、st.w 不透明度）
    '  for (int j = 0; j < ' + MAX_SEGS + '; j++) {',
    '    if (j >= uSegN) break;',
    '    vec4 S = uSeg[j]; vec4 st = uSegS[j];',
    '    vec2 ab = S.zw - S.xy;',
    '    float L2 = max(dot(ab, ab), 1e-6);',
    '    float h = clamp(dot(p - S.xy, ab) / L2, 0.0, 1.0);',
    '    float d = length(p - S.xy - ab * h) / px;',
    '    float a = band(d, st.y * uDpr) * st.w;',
    '    if (st.z > 0.0) a *= step(fract(h * sqrt(L2) / (st.z * uMpp)), 0.45);',
    '    over(acc, ink(st.x), a * fade);',
    '  }',
    // 馬赫角 θ 的角度弧（道路往後 → 錐邊）
    '  if (uTheta.z > 0.0) over(acc, uInk, angArc(p, uTheta.xy, uTheta.z, uTheta.w, px) * 0.6 * fade);',
    '  gl_FragColor = vec4(acc.rgb / max(acc.a, 1e-4), acc.a);',
    '}'
  ].join('\n');
  // 沿道路的鉛直剖面（y = 0 平面）：半球殼的切口（半圓）、馬赫錐的剖面線、音障
  const CUT_FRAG = [
    COMMON,
    'uniform vec3 uTint;',
    'uniform int uN; uniform vec4 uArcs[' + MAX_ARCS + '];',
    'uniform int uArrN; uniform vec4 uArr[2];',
    'uniform vec4 uMach; uniform vec4 uBar;',
    'float segD(vec2 p, vec2 a, vec2 b) { vec2 ab = b - a; float h = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0); return length(p - a - ab * h); }',
    'void main() {',
    '  vec2 p = vec2(vW.x, vW.z);',
    '  vec2 fw = max(fwidth(p), vec2(1e-4));',
    '  float px = max(length(fw) * 0.7071, 1e-4);',
    '  float fade = (1.0 - smoothstep(0.0, 650.0, max(abs(p.x) - 700.0, 0.0))) * (1.0 - smoothstep(420.0, 1000.0, p.y));',
    '  if (fade < 0.003) discard;',
    '  vec4 acc = vec4(0.0);',
    // 剖面本身：極淡的玻璃色＋地面上一條細線
    '  over(acc, uTint, (uDark > 0.5 ? 0.05 : 0.04) * fade);',
    '  over(acc, uTint, band(p.y / fw.y, 1.0 * uDpr) * 0.25 * fade);',
    '  float wc = 1.7 * uLw * uDpr, wg = 7.0 * uLw * uDpr;',
    '  float kc = uDark > 0.5 ? 0.9 : 0.8, kg = uDark > 0.5 ? 0.14 : 0.09;',
    '  for (int i = 0; i < ' + MAX_ARCS + '; i++) {',
    '    if (i >= uN) break;',
    '    vec4 R = uArcs[i];',
    '    float d = abs(length(p - vec2(R.x, 0.0)) - R.y) / px;',
    '    if (d < wg) {',
    '      over(acc, uWave, band(d, wg) * kg * R.z * fade);',
    '      over(acc, uWave, band(d, wc) * kc * R.z * fade);',
    '    }',
    '  }',
    '  for (int k = 0; k < 2; k++) {',
    '    if (k >= uArrN) break;',
    '    vec4 A = uArr[k];',
    '    vec2 dv = p - vec2(A.x, 0.0);',
    '    float d = abs(length(dv) - A.y) / px;',
    '    float on = step(fract(atan(dv.y, dv.x) * A.y / (11.0 * uMpp)), 0.55);',
    '    over(acc, A.z < 0.5 ? uAccent : uPos, band(d, 1.6 * uLw * uDpr) * on * 0.8 * fade);',
    '  }',
    // 馬赫錐的剖面：頂點在波源、往後上方張開 θ 的直線（寬的柔光＋細線）與角度弧
    '  if (uMach.w > 0.0) {',
    '    vec2 a = vec2(uMach.x, 0.0), b = a + uMach.y * vec2(-cos(uMach.z), sin(uMach.z));',
    '    float d = segD(p, a, b) / px;',
    '    over(acc, uPos, band(d, 7.0 * uDpr) * (uDark > 0.5 ? 0.22 : 0.16) * fade);',
    '    over(acc, uPos, band(d, 2.2 * uDpr) * 0.9 * fade);',
    '    float Ra = min(42.0 * uMpp, uMach.y * 0.6);',
    '    if (Ra > 14.0 * uMpp) over(acc, uInk, angArc(p, a, Ra, uMach.z, px) * 0.6 * fade);',
    '  }',
    // 音障：波前在波源前端疊在一起
    '  if (uBar.z > 0.0) {',
    '    float d = abs(p.x - uBar.x) / fw.x;',
    '    float g = (1.0 - smoothstep(0.0, uBar.y, p.y));',
    '    over(acc, uPos, band(d, 3.0 * uDpr) * 0.85 * g * fade);',
    '  }',
    '  if (acc.a < 0.002) discard;',
    '  gl_FragColor = vec4(acc.rgb / max(acc.a, 1e-4), acc.a);',
    '}'
  ].join('\n');

  function smooth(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
  function rgbOf(c) {
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(c).trim());
    if (m) return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
    const n = String(c).match(/[\d.]+/g);
    return n && n.length >= 3 ? [+n[0], +n[1], +n[2]] : [128, 128, 128];
  }
  /** f > 0 往白色混合、f < 0 往黑色混合（與 doppler.js 相同） */
  function shade(c, f) {
    const r = rgbOf(c), t = f > 0 ? 255 : 0, k = Math.abs(f);
    return 'rgb(' + r.map(function (x) { return Math.round(x + (t - x) * k); }).join(',') + ')';
  }
  function mixCss(a, b, k) {
    const x = rgbOf(a), y = rgbOf(b);
    return 'rgb(' + [0, 1, 2].map(function (i) { return Math.round(x[i] + (y[i] - x[i]) * k); }).join(',') + ')';
  }
  function alphaCss(c, a) { const r = rgbOf(c); return 'rgba(' + r[0] + ',' + r[1] + ',' + r[2] + ',' + a + ')'; }

  function create(lib, host, api) {
    const THREE = lib.THREE;
    const T = api.T, num = api.num, st = api.state;
    const WX = api.WX;
    let C = api.colors();

    const canvas = document.createElement('canvas');
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', T('都卜勒效應的 3D 立體檢視：移動的救護車發出的半球形波前（切開一半看內部）、地面上的波前圓、觀察者與參考聽者聽到的頻率，超音速時的馬赫錐。拖曳旋轉、雙指或滾輪縮放；拖曳觀察者或點地面可以移動觀察者，方向鍵也可以。',
      '3D view of the Doppler effect: the hemispherical wavefronts sent out by the moving ambulance (cut open to show the inside), the wavefront circles on the ground, the frequencies heard by the listener and the reference listeners, and the Mach cone when supersonic. Drag to rotate, pinch or scroll to zoom; drag the listener or tap the ground to move the listener, or use the arrow keys.'));
    host.appendChild(canvas);
    const ov = document.createElement('div');
    ov.className = 'dp3-ov';
    ov.setAttribute('aria-hidden', 'true');
    host.appendChild(ov);

    let renderer;
    try {
      // alpha：背景由 CSS 的徑向漸層提供（隨深淺色自動變化）
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    } catch (e) {
      canvas.remove(); ov.remove();
      throw e;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.localClippingEnabled = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 16 / 10, 5, 60000);
    camera.up.set(0, 0, 1); // z 朝上；必須在建立 OrbitControls 之前設定
    const VIEW_WIDE = new THREE.Vector3(-0.2, -1, 0.62).normalize();
    const VIEW_TALL = new THREE.Vector3(-0.12, -1, 1.3).normalize();

    // ---------- 指標：拖曳觀察者、點地面移動觀察者（要在 OrbitControls 之前註冊，才能攔下旋轉） ----------
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const groundPl = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const hitV = new THREE.Vector3();
    const obsSphere = new THREE.Sphere();
    let dragObs = null, tap = null, hot = false;
    const downIds = new Set();
    function setRay(ev) {
      const r = canvas.getBoundingClientRect();
      ndc.set((ev.clientX - r.left) / r.width * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
    }
    function pickGround(ev) { setRay(ev); return ray.ray.intersectPlane(groundPl, hitV) ? hitV : null; }
    function hitObserver(ev) {
      setRay(ev);
      const O = DC.observerAt(api.params(), st.t);
      obsSphere.center.set(O.x, O.y, 17 * iconS);
      obsSphere.radius = Math.max(21 * iconS, 22 * mppNow());
      return ray.ray.intersectsSphere(obsSphere);
    }
    function setHot(h) {
      if (h !== hot) { hot = h; applyHot(); requestRender(); }
      canvas.style.cursor = dragObs ? 'grabbing' : h ? 'move' : '';
    }
    function inDomain(g) { return Math.abs(g.x) <= WX / 2 && Math.abs(g.y) <= api.halfY(); }
    canvas.addEventListener('pointerdown', function (ev) {
      downIds.add(ev.pointerId);
      if (downIds.size === 1 && ev.button === 0 && hitObserver(ev)) {
        dragObs = { id: ev.pointerId };
        tap = null;
        try { canvas.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
        setHot(true);
        ev.stopImmediatePropagation();
        ev.preventDefault();
        return;
      }
      tap = downIds.size === 1 && ev.button === 0 ? { x: ev.clientX, y: ev.clientY, t: performance.now(), id: ev.pointerId } : null;
    });
    canvas.addEventListener('pointermove', function (ev) {
      if (dragObs && ev.pointerId === dragObs.id) {
        const g = pickGround(ev);
        if (g) api.moveObserver(g.x, g.y);
        ev.stopImmediatePropagation();
        return;
      }
      if (tap && Math.hypot(ev.clientX - tap.x, ev.clientY - tap.y) > 6) tap = null;
      if (!ev.buttons && ev.pointerType !== 'touch') setHot(hitObserver(ev));
    });
    function pointerEnd(ev) {
      downIds.delete(ev.pointerId);
      if (dragObs && ev.pointerId === dragObs.id) {
        dragObs = null;
        setHot(ev.pointerType === 'mouse' && hitObserver(ev));
        ev.stopImmediatePropagation();
        return;
      }
      if (tap && ev.type === 'pointerup' && ev.pointerId === tap.id && performance.now() - tap.t < 450 &&
          Math.hypot(ev.clientX - tap.x, ev.clientY - tap.y) <= 6) {
        const g = pickGround(ev);
        if (g && inDomain(g)) api.moveObserver(g.x, g.y);
      }
      tap = null;
    }
    canvas.addEventListener('pointerup', pointerEnd);
    canvas.addEventListener('pointercancel', pointerEnd);
    canvas.addEventListener('pointerleave', function () { if (!dragObs) setHot(false); });
    // 鍵盤：方向鍵移動觀察者（與 2D 相同，Shift 一次 50 m）
    canvas.addEventListener('keydown', function (ev) {
      const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[ev.key];
      if (!d) return;
      ev.preventDefault();
      const s = ev.shiftKey ? 50 : 10, O = DC.observerAt(api.params(), st.t);
      api.moveObserver(O.x + d[0] * s, O.y + d[1] * s);
    });

    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.maxPolarAngle = Math.PI / 2 - 0.04; // 不鑽到地面下

    // ---------- 環境光（反射用）：上亮下暗的天空 ----------
    let envTex = null;
    function buildEnvironment() {
      if (envTex) { envTex.dispose(); envTex = null; }
      const dk = C.dark;
      const es = new THREE.Scene();
      const geo = new THREE.SphereGeometry(100, 32, 16);
      const cols = [];
      const pos = geo.attributes.position;
      const top = new THREE.Color(dk ? '#56646c' : '#f2f6f8'), mid = new THREE.Color(dk ? '#232c31' : '#b9c3c8'), bot = new THREE.Color(dk ? '#0c1012' : '#6b757a');
      const c = new THREE.Color();
      for (let i = 0; i < pos.count; i++) {
        const u = pos.getY(i) / 100;
        if (u > 0) c.copy(mid).lerp(top, u); else c.copy(mid).lerp(bot, -u);
        cols.push(c.r, c.g, c.b);
      }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      const sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide }));
      sky.rotation.x = Math.PI / 2;
      es.add(sky);
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(70, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffffff').multiplyScalar(dk ? 1.6 : 2.6), side: THREE.DoubleSide }));
      panel.position.set(-20, -30, 75);
      panel.lookAt(0, 0, 0);
      es.add(panel);
      const pm = new THREE.PMREMGenerator(renderer);
      envTex = pm.fromScene(es, 0.03).texture;
      pm.dispose();
      geo.dispose(); sky.material.dispose(); panel.geometry.dispose(); panel.material.dispose();
      scene.environment = envTex;
    }

    // ---------- 燈光 ----------
    const hemi = new THREE.HemisphereLight(0xffffff, 0x777777, 1.3);
    hemi.position.set(0, 0, 1);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 2.3);
    sun.position.set(-1000, -800, 1250);
    sun.target.position.set(300, 0, 0);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.radius = 4;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.6;
    const sc = sun.shadow.camera;
    sc.left = -1300; sc.right = 1300; sc.bottom = -950; sc.top = 950; sc.near = 200; sc.far = 4200;
    scene.add(sun); scene.add(sun.target);
    const fill = new THREE.DirectionalLight(0xdfe9ff, 0.55);
    fill.position.set(900, 600, 500);
    scene.add(fill);

    // ---------- 剖面：切掉靠近相機的一半 ----------
    const cutPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    // ---------- 共用的顏色 uniform ----------
    function v3(css) { const r = rgbOf(css); return new THREE.Vector3(r[0] / 255, r[1] / 255, r[2] / 255); }
    function sharedUniforms() {
      return {
        uInk: { value: new THREE.Vector3() }, uWave: { value: new THREE.Vector3() }, uAccent: { value: new THREE.Vector3() },
        uPos: { value: new THREE.Vector3() }, uNeg: { value: new THREE.Vector3() },
        uDark: { value: 0 }, uLw: { value: 1 }, uDpr: { value: 1 }, uMpp: { value: 1.5 }
      };
    }
    function arr4(n) { const a = []; for (let i = 0; i < n; i++) a.push(new THREE.Vector4()); return a; }

    // ---------- 地面（2D 俯視圖：格線、道路、波前圓、連線、馬赫錐邊） ----------
    const gU = Object.assign(sharedUniforms(), {
      uBase: { value: new THREE.Vector3() }, uHalf: { value: new THREE.Vector2(700, 350) },
      uN: { value: 0 }, uRings: { value: arr4(MAX_RINGS) },
      uArrN: { value: 0 }, uArr: { value: arr4(2) },
      uSegN: { value: 0 }, uSeg: { value: arr4(MAX_SEGS) }, uSegS: { value: arr4(MAX_SEGS) },
      uWedge: { value: new THREE.Vector4() }, uTheta: { value: new THREE.Vector4() }
    });
    const groundMat = new THREE.ShaderMaterial({ uniforms: gU, vertexShader: VERT, fragmentShader: GROUND_FRAG, transparent: true, depthWrite: false });
    groundMat.extensions = { derivatives: true };
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(9000, 5000), groundMat);
    ground.position.set(400, 0, 0);
    ground.renderOrder = 0;
    scene.add(ground);
    // 只畫影子的平面（救護車與人的柔和投影）
    const shadowMat = new THREE.ShadowMaterial({ opacity: 0.25, depthWrite: false });
    const shadowFloor = new THREE.Mesh(new THREE.PlaneGeometry(3400, 2400), shadowMat);
    shadowFloor.position.set(300, 0, 0.6);
    shadowFloor.receiveShadow = true;
    shadowFloor.renderOrder = 1;
    scene.add(shadowFloor);

    // ---------- 剖面（y = 0 的鉛直面） ----------
    const cU = Object.assign(sharedUniforms(), {
      uTint: { value: new THREE.Vector3() },
      uN: { value: 0 }, uArcs: { value: arr4(MAX_ARCS) },
      uArrN: { value: 0 }, uArr: { value: arr4(2) },
      uMach: { value: new THREE.Vector4() }, uBar: { value: new THREE.Vector4() }
    });
    const cutMat = new THREE.ShaderMaterial({ uniforms: cU, vertexShader: VERT, fragmentShader: CUT_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    cutMat.extensions = { derivatives: true };
    const cutGeo = new THREE.PlaneGeometry(4200, 1100);
    cutGeo.rotateX(Math.PI / 2);
    const cutMesh = new THREE.Mesh(cutGeo, cutMat);
    cutMesh.position.set(300, 0, 550);
    cutMesh.renderOrder = 60;
    scene.add(cutMesh);

    // ---------- 半透明殼的材質：邊緣（掠射）較不透明，像肥皂泡 ----------
    const shellMats = [];
    function shellMat(fresA, fresB, extra) {
      const m = new THREE.MeshStandardMaterial(Object.assign({
        roughness: 0.18, metalness: 0, transparent: true, opacity: 0.1, depthWrite: false,
        side: THREE.DoubleSide, clippingPlanes: [cutPlane], envMapIntensity: 0.8
      }, extra || {}));
      m.userData.fres = { value: new THREE.Vector2(fresA, fresB) };
      m.onBeforeCompile = function (sh) {
        sh.uniforms.uFres = m.userData.fres;
        sh.fragmentShader = 'uniform vec2 uFres;\n' + sh.fragmentShader.replace('#include <opaque_fragment>',
          'float frs = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));\n\tdiffuseColor.a *= uFres.x + uFres.y * frs * frs;\n#include <opaque_fragment>');
      };
      m.customProgramCacheKey = function () { return 'dop3-shell'; };
      shellMats.push(m);
      return m;
    }

    // ---------- 波前：半球殼（共用一個單位半球幾何，只改位置與大小） ----------
    const hemiGeo = new THREE.SphereGeometry(1, 72, 20, 0, Math.PI * 2, 0, Math.PI / 2);
    hemiGeo.rotateX(Math.PI / 2); // 極點朝 +z，只留 z ≥ 0 的一半
    const domes = [];
    for (let i = 0; i < MAX_DOMES; i++) {
      const m = new THREE.Mesh(hemiGeo, shellMat(0.32, 2.3));
      m.visible = false;
      m.frustumCulled = false;
      scene.add(m);
      domes.push(m);
    }

    // ---------- 馬赫錐（地面以上的半個圓錐，頂點在原點、沿 −x 張開，長 1、底半徑 1） ----------
    function gradTex(stops, radial) {
      const c = document.createElement('canvas');
      c.width = radial ? 64 : 4; c.height = 64;
      const g = c.getContext('2d');
      const gr = radial ? g.createRadialGradient(32, 32, 0, 32, 32, 32) : g.createLinearGradient(0, 64, 0, 0);
      stops.forEach(function (s) { gr.addColorStop(s[0], 'rgb(' + s[1] + ',' + s[1] + ',' + s[1] + ')'); });
      g.fillStyle = gr;
      g.fillRect(0, 0, c.width, 64);
      const tex = new THREE.CanvasTexture(c);
      tex.needsUpdate = true;
      return tex;
    }
    const coneGeo = new THREE.CylinderGeometry(1, 0, 1, 64, 6, true, -Math.PI / 2, Math.PI);
    coneGeo.translate(0, 0.5, 0);      // 頂點在原點、底在 y = 1
    coneGeo.rotateZ(Math.PI / 2);      // +y → −x
    const coneAlpha = gradTex([[0, 255], [0.55, 150], [1, 25]], false); // 由頂點往底部漸淡
    const coneMat = shellMat(0.55, 1.6, { alphaMap: coneAlpha, opacity: 0.3 });
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.visible = false;
    cone.renderOrder = 55;
    cone.frustumCulled = false;
    scene.add(cone);
    const rimPts = [];
    for (let i = 0; i <= 64; i++) { const a = Math.PI * i / 64; rimPts.push(new THREE.Vector3(-1, Math.cos(a), Math.sin(a))); }
    const rimMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.55, clippingPlanes: [cutPlane], depthWrite: false });
    const rim = new THREE.Line(new THREE.BufferGeometry().setFromPoints(rimPts), rimMat);
    rim.visible = false;
    rim.renderOrder = 56;
    rim.frustumCulled = false;
    scene.add(rim);
    // 音障（v_s = v）：波源前端、垂直於道路的半圓形光幕
    const barGeo = new THREE.CircleGeometry(1, 48, 0, Math.PI);
    barGeo.rotateX(Math.PI / 2);
    barGeo.rotateZ(Math.PI / 2);
    const barMat = new THREE.MeshBasicMaterial({ alphaMap: gradTex([[0, 255], [0.6, 110], [1, 0]], true), transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide, clippingPlanes: [cutPlane], toneMapped: false });
    const barrier = new THREE.Mesh(barGeo, barMat);
    barrier.visible = false;
    barrier.renderOrder = 57;
    scene.add(barrier);

    // ---------- 救護車（放大的圖示；車頭朝 +x，原點在車底中央） ----------
    function roundedBox(lx, ly, lz, r) {
      const s = new THREE.Shape();
      const x0 = -lx / 2 + r, x1 = lx / 2 - r, y0 = -ly / 2 + r, y1 = ly / 2 - r;
      const c = Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2);
      s.moveTo(x0 + c, y0);
      s.lineTo(x1 - c, y0); s.quadraticCurveTo(x1, y0, x1, y0 + c);
      s.lineTo(x1, y1 - c); s.quadraticCurveTo(x1, y1, x1 - c, y1);
      s.lineTo(x0 + c, y1); s.quadraticCurveTo(x0, y1, x0, y1 - c);
      s.lineTo(x0, y0 + c); s.quadraticCurveTo(x0, y0, x0 + c, y0);
      const g = new THREE.ExtrudeGeometry(s, { depth: lz - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 4, curveSegments: 6 });
      g.translate(0, 0, r);
      return g;
    }
    const carGeo = {
      body: roundedBox(27, 17, 15, 1.4),
      cab: roundedBox(12.6, 16.2, 10.6, 1.4),
      shield: new THREE.BoxGeometry(0.5, 13.6, 5.6),
      sideWin: new THREE.BoxGeometry(6.2, 0.3, 3.8),
      stripe: new THREE.BoxGeometry(26.4, 0.3, 1.7),
      stripeCab: new THREE.BoxGeometry(11.6, 0.3, 1.7),
      crossV: new THREE.BoxGeometry(1.6, 0.3, 5.6),
      crossH: new THREE.BoxGeometry(5.6, 0.3, 1.6),
      roofV: new THREE.BoxGeometry(2.0, 7.0, 0.3),
      roofH: new THREE.BoxGeometry(7.0, 2.0, 0.3),
      barBase: new THREE.BoxGeometry(2.8, 13.4, 0.7),
      lens: new THREE.BoxGeometry(2.4, 5.8, 1.6),
      wheel: new THREE.CylinderGeometry(3.3, 3.3, 2.6, 28),
      hub: new THREE.CylinderGeometry(1.6, 1.6, 2.8, 18),
      bumper: new THREE.BoxGeometry(1.4, 16.4, 2.3),
      lamp: new THREE.BoxGeometry(0.4, 2.6, 1.4)
    };
    const carMat = {
      body: new THREE.MeshPhysicalMaterial({ roughness: 0.38, metalness: 0.05, clearcoat: 0.7, clearcoatRoughness: 0.2 }),
      red: new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.05 }),
      glass: new THREE.MeshPhysicalMaterial({ roughness: 0.08, metalness: 0.2, clearcoat: 1, envMapIntensity: 1.4 }),
      tire: new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 }),
      hub: new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.8 }),
      dark: new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.2 }),
      lensR: new THREE.MeshStandardMaterial({ roughness: 0.25, metalness: 0, emissiveIntensity: 1 }),
      lensB: new THREE.MeshStandardMaterial({ roughness: 0.25, metalness: 0, emissiveIntensity: 1 }),
      lamp: new THREE.MeshStandardMaterial({ roughness: 0.2, metalness: 0, emissive: 0xfff4d6, emissiveIntensity: 0.9, color: 0xffffff })
    };
    // 半透明救護車（聲音發出時的位置）
    const ghostMats = [0, 1].map(function () {
      return new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0, transparent: true, opacity: 0.5, depthWrite: false });
    });
    function buildCar(ghostMat) {
      const g = new THREE.Group();
      function add(geo, mat, x, y, z, ry) {
        const m = new THREE.Mesh(geo, ghostMat || mat);
        m.position.set(x, y, z);
        if (ry) m.rotation.y = ry;
        if (!ghostMat) { m.castShadow = true; m.receiveShadow = true; }
        g.add(m);
        return m;
      }
      add(carGeo.body, carMat.body, -6.5, 0, 3.4);
      add(carGeo.cab, carMat.body, 13.4, 0, 3.4);
      if (!ghostMat) {
        add(carGeo.shield, carMat.glass, 19.15, 0, 10.6, -0.38).castShadow = false;
        [-1, 1].forEach(function (s) {
          add(carGeo.sideWin, carMat.glass, 13.6, s * 8.05, 10.6).castShadow = false;
          add(carGeo.stripe, carMat.red, -6.5, s * 8.5, 9.2);
          add(carGeo.stripeCab, carMat.red, 13.2, s * 8.1, 6.6);
          add(carGeo.crossV, carMat.red, -10, s * 8.55, 13.6);
          add(carGeo.crossH, carMat.red, -10, s * 8.55, 13.6);
          add(carGeo.lamp, carMat.lamp, 19.9, s * 5.6, 6.4).castShadow = false;
        });
        add(carGeo.roofV, carMat.red, -6, 0, 18.5);
        add(carGeo.roofH, carMat.red, -6, 0, 18.5);
        add(carGeo.barBase, carMat.dark, 5, 0, 18.7);
        add(carGeo.lens, carMat.lensR, 5, 3.2, 19.8);
        add(carGeo.lens, carMat.lensB, 5, -3.2, 19.8);
        add(carGeo.bumper, carMat.dark, 20.1, 0, 4.4);
        add(carGeo.bumper, carMat.dark, -20.2, 0, 4.4);
      }
      [[-12, 1], [-12, -1], [13.2, 1], [13.2, -1]].forEach(function (w) {
        const wh = add(carGeo.wheel, carMat.tire, w[0], w[1] * 7.4, 3.3);
        wh.rotation.x = Math.PI / 2;
        if (!ghostMat) { const h = add(carGeo.hub, carMat.hub, w[0], w[1] * 7.4, 3.3); h.rotation.x = Math.PI / 2; h.castShadow = false; }
      });
      return g;
    }
    const car = buildCar(null);
    scene.add(car);
    const ghosts = ghostMats.map(function (m) { const g = buildCar(m); g.visible = false; g.renderOrder = 8; scene.add(g); return g; });
    // 警示燈的光暈（純裝飾；減少動態效果時不閃）
    const glowTex = gradTex([[0, 255], [0.35, 120], [1, 0]], true);
    function glowSprite() {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ alphaMap: glowTex, transparent: true, depthWrite: false, toneMapped: false }));
      s.renderOrder = 70;
      s.visible = false;
      car.add(s);
      return s;
    }
    const glowR = glowSprite(), glowB = glowSprite();
    glowR.position.set(5, 3.2, 21); glowB.position.set(5, -3.2, 21);

    // ---------- 人（觀察者與參考聽者；原點在腳底） ----------
    const personGeo = {
      leg: new THREE.CapsuleGeometry(1.6, 7.6, 4, 10).rotateX(Math.PI / 2),
      torso: new THREE.CapsuleGeometry(3.4, 6.0, 6, 16).rotateX(Math.PI / 2),
      arm: new THREE.CapsuleGeometry(1.15, 7.4, 4, 8).rotateX(Math.PI / 2),
      head: new THREE.SphereGeometry(3.0, 24, 16)
    };
    function buildPerson(mats) {
      const g = new THREE.Group();
      function add(geo, mat, x, y, z, sx, sy) {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, y, z);
        if (sx) m.scale.set(sx, sy, 1);
        m.castShadow = true;
        g.add(m);
        return m;
      }
      add(personGeo.leg, mats.leg, 0, 1.8, 5.4);
      add(personGeo.leg, mats.leg, 0, -1.8, 5.4);
      add(personGeo.torso, mats.shirt, 0, 0, 15.2, 0.82, 1.12);
      const a1 = add(personGeo.arm, mats.shirt, 0, 4.7, 15.0); a1.rotation.x = -0.12;
      const a2 = add(personGeo.arm, mats.shirt, 0, -4.7, 15.0); a2.rotation.x = 0.12;
      add(personGeo.head, mats.skin, 0, 0, 24.6);
      return g;
    }
    const obsMats = {
      shirt: new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0 }),
      leg: new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0 }),
      skin: new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0 })
    };
    const refMats = {
      shirt: new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0 }),
      leg: obsMats.leg,
      skin: obsMats.skin
    };
    const obs = buildPerson(obsMats);
    scene.add(obs);
    const refs = REFS.map(function () { const g = buildPerson(refMats); scene.add(g); return g; });
    // 觀察者腳下的光環（滑過或拖曳時）
    const ringGeo = new THREE.RingGeometry(0.86, 1, 64);
    const hotMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false });
    const hotRing = new THREE.Mesh(ringGeo, hotMat);
    hotRing.visible = false;
    hotRing.renderOrder = 65;
    scene.add(hotRing);
    function applyHot() { hotRing.visible = hot || !!dragObs; obsMats.shirt.emissiveIntensity = hot ? 0.35 : 0; }

    // ---------- 速度箭頭（圓柱＋圓錐；長度 = 0.5 秒內移動的距離） ----------
    const shaftGeo = new THREE.CylinderGeometry(1, 1, 1, 14).translate(0, 0.5, 0).rotateZ(-Math.PI / 2); // 沿 +x、0 到 1
    const headGeo = new THREE.ConeGeometry(1, 1, 22).translate(0, 0.5, 0).rotateZ(-Math.PI / 2);
    function makeArrow(mat) {
      const g = new THREE.Group();
      const sh = new THREE.Mesh(shaftGeo, mat), hd = new THREE.Mesh(headGeo, mat);
      sh.castShadow = hd.castShadow = true;
      g.add(sh); g.add(hd);
      g.visible = false;
      scene.add(g);
      return { g: g, sh: sh, hd: hd };
    }
    const arrowMatS = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.1 });
    const arrowMatO = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.1 });
    const arrS = makeArrow(arrowMatS), arrO = makeArrow(arrowMatO);
    function setArrow(a, x0, y0, z0, dir, len) {
      if (!(len > 0.5)) { a.g.visible = false; return; }
      const lw = 1.35 * mppIcon, head = Math.min(11 * mppIcon, len), hw = 4.4 * mppIcon;
      a.g.visible = true;
      a.g.position.set(x0, y0, z0);
      a.g.scale.set(dir, 1, 1);
      a.sh.scale.set(Math.max(0.01, len - head * 0.7), lw, lw);
      a.hd.position.x = len - head;
      a.hd.scale.set(head, hw, hw);
    }

    // ---------- 短暫的效果：收到波前的光環、音爆 ----------
    const pulseMats = [], pulses = [];
    for (let i = 0; i < MAX_PULSE; i++) {
      const m = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
      const r = new THREE.Mesh(ringGeo, m);
      r.visible = false; r.renderOrder = 66;
      scene.add(r);
      pulseMats.push(m); pulses.push(r);
    }
    const boomMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    const boom = new THREE.Mesh(hemiGeo, boomMat);
    boom.visible = false; boom.renderOrder = 67;
    scene.add(boom);

    // ---------- HTML 標籤（文字清楚、跟著字體大小；簡體由 settings.js 自動轉換） ----------
    const labels = {};
    function mkLabel(name, cls) {
      const el = document.createElement('span');
      el.className = 'dp3-lb' + (cls ? ' ' + cls : '');
      el.style.display = 'none';
      ov.appendChild(el);
      labels[name] = { el: el, html: null, color: null, on: false, shown: false, pos: new THREE.Vector3(), dx: 0, dy: 0, w: 0, h: 0, measure: true, x: NaN, y: NaN, pin: 0, cand: 0 };
    }
    ['obsName', 'obsF', 'boom', 'vs', 'vo', 'mach', 'theta', 'bar', 'gh0', 'gh1', 'lamF', 'lamB', 'ref0', 'ref1', 'ref2'].forEach(function (n) { mkLabel(n); });
    labels.boom.el.classList.add('dp3-big');
    labels.obsF.el.classList.add('dp3-strong');
    ['ref0', 'ref1', 'ref2'].forEach(function (n) { labels[n].el.classList.add('dp3-sm'); });
    /** pin：0 置中、1 標籤左緣對齊錨點、−1 右緣對齊錨點 */
    function setLabel(name, on, html, color, x, y, z, dx, dy, pin) {
      const L = labels[name];
      L.on = !!on;
      if (!on) return;
      if (L.html !== html) { L.el.innerHTML = html; L.html = html; L.measure = true; }
      if (L.color !== color) { L.el.style.color = color; L.color = color; }
      L.pos.set(x, y, z);
      L.dx = dx || 0; L.dy = dy || 0; L.pin = pin || 0;
    }
    const hud = {};
    ['tl', 'tl2', 'tr', 'bl', 'br'].forEach(function (k) {
      const el = document.createElement('span');
      el.className = 'dp3-lb dp3-hud dp3-' + k;
      ov.appendChild(el);
      hud[k] = { el: el, html: null, color: null };
    });
    function setHud(k, html, color) {
      const H = hud[k];
      if (H.html !== html) { H.el.innerHTML = html; H.html = html; }
      if (H.color !== color) { H.el.style.color = color; H.color = color; }
    }
    const tmpV = new THREE.Vector3();
    let hudRects = null; // 角落讀數的位置（標籤避開它們）；尺寸或字體改變時重量
    const CAND = [0, -1, 1, -2, 2, -3];
    function placeLabels() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      const keys = Object.keys(labels);
      // 先讀（量寬度）再寫（位置），避免反覆重排版面
      if (!hudRects) {
        hudRects = Object.keys(hud).map(function (k) {
          const el = hud[k].el;
          return el.offsetWidth ? { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight } : null;
        }).filter(Boolean);
      }
      keys.forEach(function (k) {
        const L = labels[k];
        if (L.on && L.measure) {
          if (!L.shown) { L.el.style.display = ''; L.shown = true; }
          L.w = L.el.offsetWidth; L.h = L.el.offsetHeight; L.measure = false;
        }
      });
      const placed = hudRects.slice();
      function free(x, y, ww, hh) {
        for (let i = 0; i < placed.length; i++) {
          const r = placed[i];
          if (x < r.x + r.w + 3 && x + ww + 3 > r.x && y < r.y + r.h + 2 && y + hh + 2 > r.y) return false;
        }
        return true;
      }
      keys.forEach(function (k) {
        const L = labels[k];
        let show = L.on;
        if (show) {
          tmpV.copy(L.pos).project(camera);
          if (!(tmpV.z < 1) || tmpV.z < -1) show = false;
          else {
            let x = (tmpV.x + 1) / 2 * w + L.dx, y = (1 - tmpV.y) / 2 * h + L.dy;
            x += L.pin * L.w / 2;
            if (x < -L.w || x > w + L.w || y < -20 || y > h + 20) show = false;
            else {
              // 盡量留在畫面內（與 2D 的標籤一樣）；與先放的標籤重疊時上下錯開一行（優先沿用上一幀的位置，避免跳動）
              x = Math.max(L.w / 2 + 4, Math.min(w - L.w / 2 - 4, x)) - L.w / 2;
              const y0 = y;
              const step = L.h + 3;
              const order = [L.cand || 0].concat(CAND);
              let pick = 0;
              for (let i = 0; i < order.length; i++) {
                const yy = Math.max(2, Math.min(h - L.h - 2, y0 - L.h / 2 + order[i] * step));
                if (free(x, yy, L.w, L.h)) { pick = order[i]; break; }
              }
              L.cand = pick;
              y = Math.max(2, Math.min(h - L.h - 2, y0 - L.h / 2 + pick * step));
              placed.push({ x: x, y: y, w: L.w, h: L.h });
              if (!(Math.abs(x - L.x) <= 0.25 && Math.abs(y - L.y) <= 0.25)) {
                L.x = x; L.y = y;
                L.el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
              }
            }
          }
        }
        if (show !== L.shown) { L.el.style.display = show ? '' : 'none'; L.shown = show; }
      });
    }

    // ---------- 顏色（深淺色主題） ----------
    let domeOp = 0.1;
    function applyTheme() {
      C = api.colors();
      const dk = C.dark;
      [gU, cU].forEach(function (U) {
        U.uInk.value.copy(v3(C.text)); U.uWave.value.copy(v3(C['b-wave'])); U.uAccent.value.copy(v3(C.accent));
        U.uPos.value.copy(v3(C.pos)); U.uNeg.value.copy(v3(C.neg)); U.uDark.value = dk ? 1 : 0;
      });
      gU.uBase.value.copy(v3(dk ? mixCss(C['canvas-bg'], C.text, 0.045) : mixCss(C['canvas-bg'], C.text, 0.03)));
      cU.uTint.value.copy(v3(C['b-wave']));
      shadowMat.opacity = dk ? 0.5 : 0.24;
      const wave = new THREE.Color(C['b-wave']);
      domeOp = dk ? 0.085 : 0.09;
      domes.forEach(function (m) {
        m.material.color.copy(wave);
        m.material.emissive.copy(wave);
        m.material.emissiveIntensity = dk ? 0.35 : 0.06;
      });
      coneMat.color.set(C.pos); coneMat.emissive.set(C.pos); coneMat.emissiveIntensity = dk ? 0.4 : 0.12;
      coneMat.opacity = dk ? 0.34 : 0.3;
      rimMat.color.set(C.pos);
      barMat.color.set(C.pos);
      carMat.body.color.set(dk ? shade(C.text, -0.08) : shade(C['canvas-bg'], 0.4));
      carMat.red.color.set(C.pos);
      carMat.glass.color.set(dk ? shade(C.field, -0.72) : shade(C.field, 0.05));
      carMat.tire.color.set(dk ? shade(C['canvas-bg'], 0.06) : shade(C.text, -0.25));
      carMat.hub.color.set(dk ? '#9aa4aa' : '#b9c1c6');
      carMat.dark.color.set(dk ? shade(C['canvas-bg'], 0.12) : shade(C.text, -0.05));
      carMat.lensR.color.set(shade(C.pos, -0.25)); carMat.lensR.emissive.set(C.pos);
      carMat.lensB.color.set(shade(C.neg, -0.25)); carMat.lensB.emissive.set(C.neg);
      glowR.material.color.set(C.pos); glowB.material.color.set(C.neg);
      const gb = new THREE.Color(dk ? shade(C.text, -0.08) : shade(C['canvas-bg'], 0.4));
      ghostMats[0].color.copy(gb).lerp(new THREE.Color(C.accent), 0.25);
      ghostMats[1].color.copy(gb).lerp(new THREE.Color(C.pos), 0.3);
      obsMats.shirt.color.set(C.probe); obsMats.shirt.emissive.set(C.probe);
      obsMats.leg.color.set(dk ? shade(C.field, -0.55) : shade(C.field, 0.1));
      obsMats.skin.color.set(shade(C.equi, dk ? 0.25 : 0.5));
      refMats.shirt.color.set(dk ? shade(C.muted, -0.1) : shade(C.muted, 0.15));
      hotMat.color.set(C.probe);
      arrowMatS.color.set(C.pos); arrowMatS.emissive.set(C.pos); arrowMatS.emissiveIntensity = dk ? 0.25 : 0.08;
      arrowMatO.color.set(C.neg); arrowMatO.emissive.set(C.neg); arrowMatO.emissiveIntensity = dk ? 0.25 : 0.08;
      pulseMats.forEach(function (m) { m.color.set(C.accent); });
      boomMat.color.set(C.pos);
      hemi.intensity = dk ? 1.0 : 1.35;
      hemi.groundColor.set(dk ? '#1c2428' : '#7a7a74');
      sun.intensity = dk ? 2.0 : 2.4;
      ov.style.setProperty('--dp3-pill', alphaCss(C['canvas-bg'], dk ? 0.82 : 0.86));
      buildEnvironment();
      Object.keys(labels).forEach(function (k) { labels[k].color = null; labels[k].html = null; });
      Object.keys(hud).forEach(function (k) { hud[k].color = null; });
      hudRects = null;
    }

    // ---------- 相機：自動取景（整個 2D 範圍與半球殼的下半部） ----------
    let iconS = 1, mppIcon = 1.5, narrow = false;
    function mppNow() {
      const h = canvas.clientHeight || 400;
      return 2 * camera.position.distanceTo(controls.target) * Math.tan(camera.fov * Math.PI / 360) / h;
    }
    function fit(useDefault) {
      const w = canvas.clientWidth || 640, h = canvas.clientHeight || 400;
      camera.aspect = w / h;
      narrow = w < 560;
      const hy = Math.max(330, api.halfY());
      const tall = camera.aspect < 1.25;
      const b = { x0: -WX / 2 - 30, x1: WX / 2 + 30, y0: -hy - 20, y1: hy + 20, z0: 0, z1: tall ? 180 : 240 };
      const center = new THREE.Vector3(0, 0, b.z1 * 0.3);
      const dir = useDefault ? (tall ? VIEW_TALL : VIEW_WIDE).clone() : camera.position.clone().sub(controls.target).normalize();
      const fwd = dir.clone().negate();
      const right = new THREE.Vector3().crossVectors(fwd, camera.up).normalize();
      if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
      const upv = new THREE.Vector3().crossVectors(right, fwd).normalize();
      const tv = Math.tan(camera.fov * Math.PI / 360), th = tv * camera.aspect;
      let dist = 1;
      [b.x0, b.x1].forEach(function (X) {
        [b.y0, b.y1].forEach(function (Y) {
          [b.z0, b.z1].forEach(function (Z) {
            const c = new THREE.Vector3(X, Y, Z).sub(center);
            const depth = c.dot(dir);
            dist = Math.max(dist, depth + Math.abs(c.dot(right)) / th, depth + Math.abs(c.dot(upv)) / tv);
          });
        });
      });
      dist *= tall ? 0.8 : 0.86; // 近處的角落可以略出畫面，讓中央（波源與觀察者）大一點
      controls.target.copy(center);
      camera.position.copy(center).addScaledVector(dir, dist);
      camera.near = Math.max(2, dist / 200);
      camera.far = dist * 25;
      camera.updateProjectionMatrix();
      controls.minDistance = dist * 0.12;
      controls.maxDistance = dist * 3;
      controls.update();
      // 圖示（救護車、人、箭頭粗細）的大小：與 2D 一樣以「畫面上的像素」設計，換算成公尺
      if (useDefault || !(mppIcon > 0)) {
        mppIcon = 2 * dist * tv / h;
        iconS = mppIcon * (narrow ? 0.8 : 1);
        applyIconScale();
      }
    }
    function applyIconScale() {
      car.scale.setScalar(iconS);
      ghosts.forEach(function (g) { g.scale.setScalar(iconS); });
      obs.scale.setScalar(iconS * 1.3);
      refs.forEach(function (r) { r.scale.setScalar(iconS * 1.05); });
      hotRing.scale.setScalar(16.5 * mppIcon);
      gU.uLw.value = cU.uLw.value = narrow ? 0.82 : 1;
    }

    // ---------- 每一幀：由物理核心的結果擺放所有東西 ----------
    const refP = { f: 1, v: 340, tStart: 0, src: { x: 0, y: 0, vx: 0, vy: 0 }, obs: { x: 0, y: 0, vx: 0, vy: 0, t0: 0 } };
    let nSeg = 0;
    function seg(x1, y1, x2, y2, colorId, widthPx, dashPx, a) {
      if (nSeg >= MAX_SEGS) return;
      gU.uSeg.value[nSeg].set(x1, y1, x2, y2);
      gU.uSegS.value[nSeg].set(colorId, widthPx * (narrow ? 0.85 : 1), dashPx, a);
      nSeg++;
    }
    function fText(a) {
      if (a.length === 2) return 'f′ = ' + num(a[0].fp, 2) + ' Hz ' + T('與', '&') + ' ' + num(Math.abs(a[1].fp), 1) + ' Hz';
      if (a.length === 1) return 'f′ = ' + num(a[0].fp, 2) + ' Hz';
      return null;
    }
    function update(p, arr) {
      const t = st.t, v = st.v, vs = st.vs, vo = st.vo;
      const show = st.show;
      const S = DC.sourceAt(p, t), O = DC.observerAt(p, t);
      const now = performance.now();
      const reduced = api.reducedMotion;
      const k = mppIcon;
      gU.uHalf.value.set(WX / 2, Math.max(330, api.halfY()));
      nSeg = 0;

      // 波前：地面上的圓（與 2D 相同的淡出）、半球殼、剖面上的半圓
      const fronts = show.fronts ? DC.wavefronts(p, t, MAX_RINGS) : [];
      let nR = 0, nA = 0;
      const dl = [];
      for (let i = 0; i < fronts.length; i++) {
        const w = fronts[i];
        if (!(w.r > 0)) continue;
        const ringA = (1 - 0.72 * Math.min(1, w.r / (WX * 0.95))) * (1 - smooth(1400, 1900, w.r));
        if (ringA > 0.002) gU.uRings.value[nR++].set(w.cx, w.cy, w.r, ringA);
        if (w.r < R_DOME) dl.push(w);
      }
      gU.uN.value = nR;
      const d0 = Math.max(0, dl.length - MAX_DOMES);
      let nd = 0;
      for (let i = d0; i < dl.length; i++) {
        const w = dl[i], m = domes[nd];
        const fade = (1 - smooth(0.2 * R_DOME, R_DOME, w.r)) * (1 - smooth(700, 1350, Math.abs(w.cx)));
        m.position.set(w.cx, w.cy, 0);
        m.scale.setScalar(w.r);
        m.material.opacity = domeOp * (0.35 + 0.65 * fade) * fade;
        m.visible = fade > 0.004;
        m.renderOrder = 10 + nd; // 大的先畫（由外而內）
        if (nA < MAX_ARCS) cU.uArcs.value[nA++].set(w.cx, w.r, (1 - 0.72 * Math.min(1, w.r / (WX * 0.95))) * (1 - smooth(0.55 * R_DOME, R_DOME, w.r)), 0);
        nd++;
      }
      for (; nd < MAX_DOMES; nd++) domes[nd].visible = false;
      cU.uN.value = nA;

      // 此刻傳到觀察者的聲音：發出位置（半透明救護車）、通過觀察者的波前（虛線圓）、連線
      const carLenW = 40 * iconS;
      gU.uArrN.value = 0; cU.uArrN.value = 0;
      ghosts[0].visible = ghosts[1].visible = false;
      setLabel('gh0', false); setLabel('gh1', false);
      if (show.ret) {
        arr.forEach(function (a, i) {
          gU.uArr.value[i].set(a.sx, a.sy, a.dist, i);
          cU.uArr.value[i].set(a.sx, a.dist, i, 0);
          seg(a.sx, a.sy, O.x, O.y, i === 0 ? 1 : 2, 1.4, 6, 0.85);
          if (Math.hypot(a.sx - S.x, a.sy - S.y) > carLenW * 0.9) {
            ghosts[i].visible = true;
            ghosts[i].position.set(a.sx, a.sy, 0);
            setLabel('gh' + i, true, i === 0 ? T('聲音發出處', 'Emitted here') : T('較早發出處', 'Emitted earlier'),
              i === 0 ? C.accent : C.pos, a.sx, a.sy, 24 * iconS, 0, -10);
          }
        });
        gU.uArrN.value = arr.length; cU.uArrN.value = arr.length;
      }

      // 震波：超音速的馬赫錐、等於音速時的音障
      const sup = vs > v && t > 0, sonic = Math.abs(vs - v) < 1e-9 && t > 0;
      cone.visible = rim.visible = barrier.visible = false;
      gU.uWedge.value.set(0, 0, 0, 0); gU.uTheta.value.set(0, 0, 0, 0);
      cU.uMach.value.set(0, 0, 0, 0); cU.uBar.value.set(0, 0, 0, 0);
      setLabel('mach', false); setLabel('theta', false); setLabel('bar', false);
      if (sup) {
        const th = DC.machAngle(v, vs);
        const Ls = t * Math.sqrt(vs * vs - v * v);       // 錐邊長（到與最早波前相切處）
        const ax = Ls * Math.cos(th), rad = Ls * Math.sin(th);
        cone.visible = rim.visible = true;
        cone.position.set(S.x, S.y, 0); cone.scale.set(ax, rad, rad);
        rim.position.copy(cone.position); rim.scale.copy(cone.scale);
        const ex = S.x - Ls * Math.cos(th), ey = Ls * Math.sin(th);
        seg(S.x, S.y, ex, S.y + ey, 2, 7, 0, C.dark ? 0.22 : 0.16);
        seg(S.x, S.y, ex, S.y - ey, 2, 7, 0, C.dark ? 0.22 : 0.16);
        seg(S.x, S.y, ex, S.y + ey, 2, 2.2, 0, 0.9);
        seg(S.x, S.y, ex, S.y - ey, 2, 2.2, 0, 0.9);
        gU.uWedge.value.set(S.x, S.y, ax, Math.tan(th));
        const Ra = Math.min(42 * k, Ls * 0.6);
        if (Ra > 14 * k) {
          gU.uTheta.value.set(S.x, S.y, Ra, th);
          setLabel('theta', true, 'θ = ' + num(th * 180 / Math.PI, 1) + '°', C.text,
            S.x - (Ra + 10 * k) * Math.cos(th / 2), S.y + (Ra + 10 * k) * Math.sin(th / 2), 0, 0, 0, -1);
        }
        cU.uMach.value.set(S.x, Ls, th, 1);
        if (Ls > 60 * k) {
          setLabel('mach', true, T('震波（馬赫錐）', 'Shock wave (Mach cone)'), C.pos,
            S.x - 0.62 * Ls * Math.cos(th), 0, 0.62 * Ls * Math.sin(th), 0, -14);
        }
      } else if (sonic) {
        const h = Math.min(v * t * 0.5, api.halfY() * 2 * 0.32);
        const bx = S.x + 0.5 * carLenW;
        barrier.visible = true;
        barrier.position.set(bx, S.y, 0);
        barrier.scale.setScalar(h);
        seg(bx, S.y - h, bx, S.y + h, 2, 7, 0, 0.2);
        seg(bx, S.y - h, bx, S.y + h, 2, 3, 0, 0.85);
        cU.uBar.value.set(bx, h, 1, 0);
        setLabel('bar', true, T('音障：波前疊在波源前端', 'Sound barrier: wavefronts pile up in front'), C.pos, bx, 0, Math.min(h, 160 * k) + 20 * k, 6, 0, 1);
      }

      // 波長標註（沿道路、在觀察者的另一側；與 2D 相同）
      setLabel('lamF', false); setLabel('lamB', false);
      if (show.lambda && show.fronts && vs < v && fronts.length >= 3) {
        const a = fronts[fronts.length - 3], b = fronts[fronts.length - 2];
        const side = O.y <= 0 ? 1 : -1;
        const yd = side * 34 * k;
        const same = vs === 0;
        const items = [
          { x1: b.cx + b.r, x2: a.cx + a.r, name: same ? 'λ' : T('λ前', 'λ front'), key: 'lamF' },
          { x1: a.cx - a.r, x2: b.cx - b.r, name: same ? 'λ' : T('λ後', 'λ back'), key: 'lamB' }
        ];
        items.forEach(function (it, i) {
          if (same && i === 1) return;
          if (it.x2 - it.x1 < 18 * k || it.x1 < -WX / 2 - 150 || it.x2 > WX / 2 + 150) return;
          seg(it.x1, yd, it.x2, yd, 0, 1.3, 0, 0.75);
          seg(it.x1, yd - 5 * k, it.x1, yd + 5 * k, 0, 1.3, 0, 0.75);
          seg(it.x2, yd - 5 * k, it.x2, yd + 5 * k, 0, 1.3, 0, 0.75);
          setLabel(it.key, true, it.name + ' = ' + num(it.x2 - it.x1, 0) + ' m', C.text, (it.x1 + it.x2) / 2, yd + side * 15 * k, 0);
        });
      }
      gU.uSegN.value = nSeg;

      // 波源（救護車）與速度箭頭；警示燈紅藍交替（純裝飾）
      car.position.set(S.x, S.y, 0);
      const phase = reduced || !st.running ? -1 : Math.floor(now / 180) % 2;
      carMat.lensR.emissiveIntensity = phase === 0 ? 2.2 : 0.25;
      carMat.lensB.emissiveIntensity = phase === 1 ? 2.2 : 0.25;
      glowR.visible = phase === 0; glowB.visible = phase === 1;
      glowR.scale.setScalar(26); glowB.scale.setScalar(26);
      glowR.material.opacity = glowB.material.opacity = C.dark ? 0.55 : 0.4;
      if (show.vel && vs > 0) {
        setArrow(arrS, S.x + carLenW * 0.55, S.y, 10 * iconS, 1, vs * api.ARROW_T);
        setLabel('vs', true, 'v<sub>s</sub>', C.pos, S.x + carLenW * 0.55 + vs * api.ARROW_T, S.y, 10 * iconS, 8, 0, 1);
      } else { arrS.g.visible = false; setLabel('vs', false); }

      // 觀察者（可拖曳）與速度箭頭、聽到的頻率
      obs.position.set(O.x, O.y, 0);
      hotRing.position.set(O.x, O.y, 0.8);
      if (show.vel && vo !== 0) {
        const dir = vo > 0 ? 1 : -1, len = Math.abs(vo) * api.ARROW_T;
        setArrow(arrO, O.x + dir * 13 * k, O.y, 19 * iconS, dir, len);
        setLabel('vo', true, 'v<sub>o</sub>', C.neg, O.x + dir * (13 * k + len), O.y, 19 * iconS, dir * 8, 0, dir);
      } else { arrO.g.visible = false; setLabel('vo', false); }
      let where = '';
      if (arr.length && vs > 0) {
        const rx = arr[0].rx;
        where = rx >= Math.SQRT1_2 ? T('前方', 'ahead') : rx <= -Math.SQRT1_2 ? T('後方', 'behind') : T('側面', 'beside');
      }
      const ft = fText(arr) || (vs >= v && t > 0 ? T('聽不到（在馬赫錐外）', 'Silent (outside the Mach cone)') : T('聲音還沒傳到', 'No sound yet'));
      const headZ = 38 * iconS;
      setLabel('obsName', true, T('觀察者', 'Listener') + (where ? T('（在' + where + '）', ' (' + where + ')') : ''), C.probe, O.x, O.y, headZ, 0, -30);
      setLabel('obsF', true, ft, arr.length ? C.accent : C.muted, O.x, O.y, headZ, 0, -9);

      // 參考聽者（靜止）：前方、後方、路旁
      const refsOn = api.opts.refs;
      refP.f = p.f; refP.v = p.v; refP.tStart = p.tStart;
      refP.src.x = p.src.x; refP.src.y = p.src.y; refP.src.vx = p.src.vx; refP.src.vy = p.src.vy;
      REFS.forEach(function (r, i) {
        refs[i].visible = refsOn;
        if (!refsOn) { setLabel('ref' + i, false); return; }
        refs[i].position.set(r.x, r.y, 0);
        refP.obs.x = r.x; refP.obs.y = r.y;
        const ra = DC.arrivals(refP, t);
        let name;
        if (r.kind === 'side') name = T('路旁', 'Roadside');
        else name = (ra.length ? ra[0].sx < r.x : S.x < r.x) ? T('前方', 'Ahead') : T('後方', 'Behind');
        const val = fText(ra) || (vs >= v && t > 0 ? T('聽不到', 'silent') : T('還沒聽到', 'no sound yet'));
        setLabel('ref' + i, true, narrow ? name + ' ' + val.replace('f′ = ', '') : name + T('：', ': ') + val, ra.length ? C.text : C.muted, r.x, r.y, 31 * iconS, 0, -9);
      });

      // 短暫效果（不影響物理）：收到波前時觀察者腳下的光環、音爆
      let np = 0;
      boom.visible = false;
      setLabel('boom', false);
      (st.fx || []).forEach(function (e) {
        const u = Math.max(0, Math.min(1, (now - e.t0) / e.dur));
        if (e.type === 'pulse' && np < MAX_PULSE && !reduced) {
          const r = pulses[np], m = pulseMats[np++];
          r.visible = true;
          r.position.set(O.x, O.y, 1);
          r.scale.setScalar((13 + 3 + 14 * u) * k);
          m.opacity = 0.65 * (1 - u);
        } else if (e.type === 'boom') {
          if (!reduced) {
            boom.visible = true;
            boom.position.set(O.x, O.y, 0);
            boom.scale.setScalar((30 + 70 * u) * k);
            boomMat.opacity = 0.32 * (1 - u);
          }
          const a = u < 0.7 ? 1 : (1 - u) / 0.3;
          setLabel('boom', a > 0.02, T('音爆！', 'Sonic boom!'), C.pos, O.x, O.y, 0, 0, 34);
          labels.boom.el.style.opacity = a.toFixed(2);
        }
      });
      for (let i = np; i < MAX_PULSE; i++) pulses[i].visible = false;

      // 角落的讀數：時間、馬赫數
      setHud('tl', 't = ' + num(t, 2) + ' s' + (st.slow ? '  (' + api.SLOW + '×)' : ''), C.text);
      const M = vs / v;
      setHud('tl2', 'M = v<sub>s</sub>/v = ' + num(M, 2), M >= 1 ? C.pos : C.muted);
    }
    function staticHud() {
      setHud('tr', T('3D 立體', '3D view'), C.muted);
      setHud('bl', T('格線每格 50 m', 'Grid: 50 m squares'), C.muted);
      setHud('br', T('救護車與人放大顯示（未依比例）', 'Ambulance and people enlarged (not to scale)'), C.muted);
    }

    // ---------- 繪製 ----------
    let raf = 0;
    function renderNow() {
      if (!view.active || document.hidden) return;
      const want = Math.min(window.devicePixelRatio || 1, 2);
      if (renderer.getPixelRatio() !== want) { renderer.setPixelRatio(want); resize3(); return; }
      const moved = controls.update();
      // 剖面：切掉靠近相機的那一半（相機轉到道路另一側時自動換邊）
      if (api.opts.cut) {
        const s = camera.position.y < 0 ? 1 : -1;
        cutPlane.normal.set(0, s, 0);
        cutPlane.constant = 0;
        cutMesh.visible = true;
      } else {
        cutPlane.normal.set(0, 1, 0);
        cutPlane.constant = 1e7;
        cutMesh.visible = false;
      }
      const mpp = mppNow();
      gU.uMpp.value = cU.uMpp.value = mpp;
      gU.uDpr.value = cU.uDpr.value = renderer.getPixelRatio();
      renderer.render(scene, camera);
      placeLabels();
      if (moved) requestRender(); // 阻尼慣性還在進行
    }
    function requestRender() {
      if (raf || !view.active) return;
      raf = requestAnimationFrame(function () { raf = 0; renderNow(); });
    }
    let fitted = false;
    function resize3() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      hudRects = null;
      fit(!fitted);
      fitted = true;
      requestRender();
    }
    const ro = window.ResizeObserver ? new ResizeObserver(resize3) : null;
    if (ro) ro.observe(canvas); else window.addEventListener('resize', resize3);
    controls.addEventListener('change', requestRender);
    const onVisible = function () { if (!document.hidden) requestRender(); };
    document.addEventListener('visibilitychange', onVisible);
    canvas.addEventListener('webglcontextlost', function (ev) {
      ev.preventDefault();
      // dispose() 會呼叫 forceContextLoss()，Chrome 之後才非同步送出這個事件：那時已經切回 2D，不算中斷
      if (!view.active) return;
      api.lost();
    });

    let lastP = null, lastArr = [];
    const view = {
      active: true,
      frame: function (p, arr) { lastP = p; lastArr = arr; update(p, arr); renderNow(); },
      onTheme: function () { applyTheme(); staticHud(); if (lastP) update(lastP, lastArr); requestRender(); },
      onOptions: function () { if (lastP) update(lastP, lastArr); requestRender(); },
      resetCamera: function () { fit(true); requestRender(); },
      dispose: function () {
        view.active = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize3);
        document.removeEventListener('visibilitychange', onVisible);
        controls.dispose();
        const geos = new Set(), mats = new Set();
        scene.traverse(function (o) {
          if (o.geometry) geos.add(o.geometry);
          if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { mats.add(m); });
        });
        geos.forEach(function (g) { g.dispose(); });
        mats.forEach(function (m) { m.dispose(); });
        [coneAlpha, glowTex, barMat.alphaMap].forEach(function (tx) { if (tx) tx.dispose(); });
        if (envTex) envTex.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        canvas.remove();
        ov.remove();
      }
    };

    applyTheme();
    staticHud();
    const w0 = canvas.clientWidth, h0 = canvas.clientHeight;
    if (w0 && h0) { renderer.setSize(w0, h0, false); fit(true); fitted = true; }
    return view;
  }

  window.Doppler3D = { create: create };
})();
