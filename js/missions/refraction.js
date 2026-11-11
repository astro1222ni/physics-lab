/* missions/refraction.js — 折射與全反射的任務（星星數 = 等級 1–10） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  // 事件（js/refraction.js 發出）：
  //   setup：使用者操作後、設定停止變動約 0.3 s 時回報一次（拖曳雷射時放開才回報）
  //     { mode: 'ray' | 'wave' | 'fibre', nm（雷射真空波長 nm）,
  //       n1, n2, th1, th2（折射角，全反射時 NaN）, tir, crit（臨界角，n1 ≤ n2 時 NaN）, brew（布魯斯特角）,
  //       dev（偏向角 |θ1 − θ2|）, R, T, Rs, Rp, lam1, lam2（nm）, v1, v2（m/s）, depth（漸逝波穿透深度 / λ0），
  //       nCore, nClad, thIn, thR, phi, fCrit, acc（最大接收角）, NA, guided（側面全反射）, entryT, wallR }
  //   角度一律為度；ray、wave 模式用上下兩介質，fibre 模式用光纖的量。
  const EPS = 1e-9;
  const near = function (a, b, tol) { return isFinite(a) && Math.abs(a - b) <= tol + EPS; };
  const is = function (a, b) { return Math.abs(a - b) <= 1e-6; };
  /** 光線或波前模式（上下兩種介質） */
  const flat = function (ev) { return ev.type === 'setup' && ev.data.mode !== 'fibre'; };
  const fibre = function (ev) { return ev.type === 'setup' && ev.data.mode === 'fibre'; };
  /** 反射光與折射光互相垂直（布魯斯特角） */
  const perp = function (d, tol) { return !d.tir && near(d.th1 + d.th2, 90, tol); };

  LabMission.register('refraction', [
    {
      id: 'refraction-1', level: 1,
      title: { zh: '出不去的光', en: 'Light that cannot get out' },
      desc: { zh: '讓光從光密介質射向光疏介質，再加大入射角，直到折射光完全消失（全反射）。', en: 'Send light from a denser medium toward a less dense one and increase the angle of incidence until the refracted ray disappears completely (total internal reflection).' },
      check: function (ev) { return flat(ev) && ev.data.tir; }
    },
    {
      id: 'refraction-2', level: 2,
      title: { zh: '貼著界面掠過', en: 'Grazing the surface' },
      desc: { zh: '把入射角調到恰好等於臨界角（誤差 0.05° 內）：此時折射角是 90°，折射光貼著界面掠過。', en: 'Set the angle of incidence exactly to the critical angle (within 0.05°): the angle of refraction is then 90° and the refracted ray grazes along the interface.' },
      check: function (ev) { const d = ev.data; return flat(ev) && d.n1 > d.n2 && near(d.th1, d.crit, 0.05); }
    },
    {
      id: 'refraction-3', level: 3,
      title: { zh: '縮短的波長', en: 'A shorter wavelength' },
      desc: { zh: '在「波前」模式中，讓光進入下方介質後的波長恰為 300 nm（誤差 0.5 nm 內）。', en: 'In “Wavefronts” view, make the wavelength of the light in the lower medium exactly 300 nm (within 0.5 nm).' },
      check: function (ev) { const d = ev.data; return ev.type === 'setup' && d.mode === 'wave' && !d.tir && near(d.lam2, 300, 0.5); }
    },
    {
      id: 'refraction-4', level: 4,
      title: { zh: '45° 的臨界角', en: 'A 45° critical angle' },
      desc: { zh: '調整上下兩種介質的折射率，讓臨界角恰為 45.0°（誤差 0.1° 內）。', en: 'Adjust the refractive indices of the two media so that the critical angle is exactly 45.0° (within 0.1°).' },
      check: function (ev) { return flat(ev) && near(ev.data.crit, 45, 0.1); }
    },
    {
      id: 'refraction-5', level: 4,
      title: { zh: '怎麼射都逃不掉', en: 'No escape at any angle' },
      desc: { zh: '在「光纖」模式中，讓光以 80° 以上的射入角射進端面，卻仍然在側面全反射、被困在纖芯中前進。', en: 'In “Optical fibre” view, launch the light into the end face at 80° or more and still have it totally reflected at the sides, trapped in the core.' },
      check: function (ev) { const d = ev.data; return fibre(ev) && d.thIn >= 80 - EPS && d.guided; }
    },
    {
      id: 'refraction-6', level: 5,
      title: { zh: '轉彎 15°', en: 'A 15° turn' },
      desc: { zh: '光從空氣射入玻璃（n = 1.00 → 1.50），讓折射光比原來的前進方向恰好偏折 15.0°（θ1 − θ2 = 15.0° ± 0.1°）。', en: 'Send light from air into glass (n = 1.00 → 1.50) so that the refracted ray turns exactly 15.0° from its original direction (θ1 − θ2 = 15.0° ± 0.1°).' },
      check: function (ev) { const d = ev.data; return flat(ev) && is(d.n1, 1) && is(d.n2, 1.5) && near(d.dev, 15, 0.1); }
    },
    {
      id: 'refraction-7', level: 5,
      title: { zh: '一成的反光', en: 'Ten percent reflected' },
      desc: { zh: '光垂直入射（0°）時，讓反射率恰為 10.0%（誤差 0.2% 內）。', en: 'At normal incidence (0°), make the reflectance exactly 10.0% (within 0.2%).' },
      check: function (ev) { const d = ev.data; return flat(ev) && d.th1 <= 0.05 + EPS && near(d.R, 0.1, 0.002); }
    },
    {
      id: 'refraction-8', level: 6,
      title: { zh: '60° 的偏振鏡', en: 'A polariser at 60°' },
      desc: { zh: '讓入射角恰為 60.0°（± 0.05°）的光，反射後成為完全偏振光：反射光與折射光互相垂直（θ1 + θ2 = 90.0° ± 0.1°）。', en: 'Make light hitting at exactly 60.0° (± 0.05°) completely polarised on reflection: the reflected and refracted rays must be perpendicular (θ1 + θ2 = 90.0° ± 0.1°).' },
      check: function (ev) { const d = ev.data; return flat(ev) && near(d.th1, 60, 0.05) && perp(d, 0.1); }
    },
    {
      id: 'refraction-9', level: 7,
      title: { zh: '設計一條光纖', en: 'Design a fibre' },
      desc: { zh: '在「光纖」模式中，包層用水（n = 1.33）：設計纖芯的折射率，讓最大接收角恰為 30.0°（誤差 0.1° 內），並讓光恰好以這個角度射入（± 0.1°）。', en: 'In “Optical fibre” view, with water cladding (n = 1.33), choose the core index so that the acceptance angle is exactly 30.0° (within 0.1°), and launch the light at exactly that angle (± 0.1°).' },
      check: function (ev) {
        const d = ev.data;
        return fibre(ev) && is(d.nClad, 1.33) && near(d.acc, 30, 0.1) && near(d.thIn, d.acc, 0.1);
      }
    },
    {
      id: 'refraction-10', level: 8,
      title: { zh: '一半反射、一半穿透', en: 'Half reflected, half through' },
      desc: { zh: '光由光密介質射向光疏介質：找出反射率恰為 50.0% 的入射角（誤差 0.3% 內）。', en: 'With light going from a denser to a less dense medium, find the angle of incidence at which the reflectance is exactly 50.0% (within 0.3%).' },
      check: function (ev) { const d = ev.data; return flat(ev) && d.n1 > d.n2 && near(d.R, 0.5, 0.003); }
    },
    {
      id: 'refraction-11', level: 9,
      title: { zh: '互餘的兩個角', en: 'Two complementary angles' },
      desc: { zh: '光由光密介質射向光疏介質，以布魯斯特角入射（θ1 + θ2 = 90.0° ± 0.1°）；調整兩種介質，讓此時的折射角恰好等於臨界角（誤差 0.1° 內）。', en: 'With light going from a denser to a less dense medium, shine it in at the Brewster angle (θ1 + θ2 = 90.0° ± 0.1°), and choose the media so that the angle of refraction then equals the critical angle (within 0.1°).' },
      check: function (ev) { const d = ev.data; return flat(ev) && d.n1 > d.n2 && perp(d, 0.1) && near(d.th2, d.crit, 0.1); }
    },
    {
      id: 'refraction-12', level: 10,
      title: { zh: '大師：直角、60° 與 500 nm', en: 'Master: a right angle, 60° and 500 nm' },
      desc: { zh: '同時做到三件事：反射光與折射光互相垂直（θ1 + θ2 = 90.0° ± 0.1°）、折射角恰為 60.0°（± 0.1°）、光在下方介質中的波長恰為 500 nm（± 1 nm）。', en: 'Do three things at once: the reflected and refracted rays perpendicular (θ1 + θ2 = 90.0° ± 0.1°), the angle of refraction exactly 60.0° (± 0.1°), and the wavelength in the lower medium exactly 500 nm (± 1 nm).' },
      check: function (ev) { const d = ev.data; return flat(ev) && perp(d, 0.1) && near(d.th2, 60, 0.1) && near(d.lam2, 500, 1); }
    },
    // ---------- 隱藏任務：只給隱晦的提示 ----------
    {
      id: 'refraction-h1', level: 5, hidden: true,
      riddle: { zh: '千年壓出的那顆星，只需輕輕側身，就把光藏進了自己的心裡。', en: 'The star pressed out over a thousand years needs only to lean a little to hide the light in its own heart.' },
      check: function (ev) { const d = ev.data; return flat(ev) && is(d.n1, 2.42) && is(d.n2, 1) && d.tir && d.th1 <= 30 + EPS; }
    },
    {
      id: 'refraction-h2', level: 3, hidden: true,
      riddle: { zh: '當彼岸與此岸再也分不清，光便不再猶豫。', en: 'When the far shore can no longer be told from this one, the light hesitates no more.' },
      check: function (ev) { const d = ev.data; return flat(ev) && is(d.n1, d.n2) && d.n1 >= 1.3 - EPS && d.th1 >= 30 - EPS; }
    },
    {
      id: 'refraction-h3', level: 6, hidden: true,
      riddle: { zh: '門已緊緊關上，門縫底下卻滲出一道長長的光影。', en: 'The door is shut tight, yet a long ribbon of light seeps out beneath it.' },
      check: function (ev) { const d = ev.data; return ev.type === 'setup' && d.mode === 'wave' && d.tir && d.depth >= 1 && d.depth <= 100; }
    }
  ]);
})();
