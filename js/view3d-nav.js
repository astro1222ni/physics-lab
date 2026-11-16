/**
 * LabView3DNav：3D 畫面的「旋轉｜平移」切換與朝游標縮放（站長 11/16）。
 *
 * 站長原話：「在 3D 的畫面也要可以做拖曳，不要只是原地放大縮小。也就是說，它可以左右、上下或斜方向拖曳，
 * 這樣我纔有辦法拖到我想局部放大看的位置。」
 *
 * 用法（在建立 OrbitControls 之後）：
 *   const nav = LabView3DNav.attach({ THREE, controls, host, radius: 30, T });
 *   fit() 之後呼叫 nav.home()；dispose 時呼叫 nav.dispose()。
 * - 平移模式：單指或滑鼠左鍵拖曳就平移（上下左右、斜向都可以）；旋轉模式維持原本的單指旋轉。
 * - 兩種模式都可以：雙指捏合縮放＋平移、滾輪朝游標所在位置放大、右鍵或 Shift＋左鍵平移、方向鍵平移。
 * - 畫面中心（target）限制在 home 周圍 radius 以內，不會拖到場景外找不回來。
 * - 「＋／－」鈕朝目前畫面中心縮放，給沒有滾輪又不方便捏合的情況。
 * - 模式記在 localStorage（讀寫都包 try/catch）。
 */
(function () {
  'use strict';
  const KEY = 'lab3dNavMode';
  const STYLE_ID = 'lab-view3d-nav-style';
  function css() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '.v3nav{position:absolute;left:8px;bottom:8px;z-index:3;display:flex;gap:6px;align-items:center;pointer-events:none}',
      '.v3nav>*{pointer-events:auto}',
      '.v3nav-seg{display:flex;border-radius:12px;overflow:hidden;border:1px solid var(--line,rgba(127,127,127,.35));background:color-mix(in srgb,var(--surface,#fff) 86%,transparent);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);box-shadow:0 2px 10px rgba(0,0,0,.18)}',
      '.v3nav button{min-width:44px;min-height:44px;padding:0 10px;border:0;background:transparent;color:var(--text,#222);font:600 calc(14px * var(--fs,1))/1 system-ui,sans-serif;display:flex;align-items:center;gap:6px;cursor:pointer}',
      '.v3nav button+button{border-left:1px solid var(--line,rgba(127,127,127,.35))}',
      '.v3nav button[aria-pressed="true"]{background:var(--accent,#5b8def);color:#fff}',
      '.v3nav svg{width:20px;height:20px;flex:none}',
      '.v3nav-hint{pointer-events:none!important;font:500 calc(12px * var(--fs,1))/1.3 system-ui,sans-serif;color:var(--text,#222);background:color-mix(in srgb,var(--surface,#fff) 80%,transparent);padding:4px 8px;border-radius:8px;max-width:46vw}',
      '@media (max-width:520px){.v3nav-hint{display:none}.v3nav button{padding:0 8px}}'
    ].join('');
    document.head.appendChild(s);
  }
  const ICON_ROT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v5h-5"/></svg>';
  const ICON_PAN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2v20M2 12h20"/><path d="M9 5l3-3 3 3M9 19l3 3 3-3M5 9l-3 3 3 3M19 9l3 3-3 3"/></svg>';

  function attach(o) {
    const THREE = o.THREE, controls = o.controls, host = o.host;
    const T = o.T || function (a) { return a; };
    const radius = o.radius || 30;
    css();
    controls.enablePan = true;
    controls.screenSpacePanning = true;   // 上下拖就是畫面上下，不是沿地面前後
    if ('zoomToCursor' in controls) controls.zoomToCursor = true;   // 朝游標所在位置放大
    controls.keyPanSpeed = 14;
    try { if (o.canvas && controls.listenToKeyEvents) controls.listenToKeyEvents(o.canvas); } catch (e) { /* 舊版沒有 */ }

    let mode = 'rotate';
    try { if (localStorage.getItem(KEY) === 'pan') mode = 'pan'; } catch (e) { /* 無法讀取就用預設 */ }
    const home = controls.target.clone();

    const bar = document.createElement('div');
    bar.className = 'v3nav';
    bar.innerHTML =
      '<div class="v3nav-seg" role="group" aria-label="' + T('3D 拖曳方式', '3D drag mode') + '">' +
        '<button type="button" data-m="rotate">' + ICON_ROT + '<span class="v3nav-lbl">' + T('旋轉', 'Rotate') + '</span></button>' +
        '<button type="button" data-m="pan">' + ICON_PAN + '<span class="v3nav-lbl">' + T('平移', 'Pan') + '</span></button>' +
      '</div>' +
      '<div class="v3nav-seg" role="group" aria-label="' + T('縮放', 'Zoom') + '">' +
        '<button type="button" data-z="in" aria-label="' + T('放大', 'Zoom in') + '">＋</button>' +
        '<button type="button" data-z="out" aria-label="' + T('縮小', 'Zoom out') + '">－</button>' +
      '</div>' +
      '<span class="v3nav-hint"></span>';
    host.appendChild(bar);
    const hint = bar.querySelector('.v3nav-hint');

    function apply() {
      const pan = mode === 'pan';
      controls.mouseButtons.LEFT = pan ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
      controls.mouseButtons.RIGHT = pan ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN;
      controls.touches.ONE = pan ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
      controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
      bar.querySelectorAll('[data-m]').forEach(function (b) {
        b.setAttribute('aria-pressed', String(b.dataset.m === mode));
        b.setAttribute('aria-label', b.dataset.m === 'pan'
          ? T('平移：拖曳上下左右移動畫面', 'Pan: drag to move the view')
          : T('旋轉：拖曳轉動視角', 'Rotate: drag to orbit'));
      });
      hint.textContent = pan
        ? T('拖曳＝上下左右平移・雙指或滾輪＝朝該處放大', 'Drag to pan · pinch or scroll to zoom there')
        : T('拖曳＝旋轉・雙指或滾輪＝朝該處放大', 'Drag to rotate · pinch or scroll to zoom there');
      if (o.canvas) o.canvas.style.cursor = pan ? 'move' : '';
    }
    bar.querySelectorAll('[data-m]').forEach(function (b) {
      b.addEventListener('click', function () {
        mode = b.dataset.m;
        try { localStorage.setItem(KEY, mode); } catch (e) { /* 記不住也沒關係 */ }
        apply();
      });
    });
    bar.querySelectorAll('[data-z]').forEach(function (b) {
      b.addEventListener('click', function () {
        const k = b.dataset.z === 'in' ? 0.8 : 1.25;
        const cam = controls.object;
        const off = cam.position.clone().sub(controls.target);
        const d = Math.min(controls.maxDistance, Math.max(controls.minDistance, off.length() * k));
        cam.position.copy(controls.target).add(off.setLength(d));
        controls.update();
      });
    });

    // 畫面中心不可離開場景太遠
    let clamping = false;
    function clamp() {
      if (clamping) return;
      const d = controls.target.clone().sub(home);
      const len = d.length();
      if (len <= radius) return;
      const back = d.multiplyScalar(1 - radius / len);
      clamping = true;
      controls.target.sub(back);
      controls.object.position.sub(back);
      controls.update();
      clamping = false;
    }
    controls.addEventListener('change', clamp);
    apply();

    return {
      home: function () { home.copy(controls.target); },
      mode: function () { return mode; },
      setMode: function (m) { mode = m === 'pan' ? 'pan' : 'rotate'; apply(); },
      relabel: apply,
      dispose: function () { controls.removeEventListener('change', clamp); bar.remove(); }
    };
  }
  window.LabView3DNav = { attach: attach };
})();
