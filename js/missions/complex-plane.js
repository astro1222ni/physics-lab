/* missions/complex-plane.js — 複數平面的任務（星星數 = 等級 1–10；隱藏任務 × 2）
 * 事件（js/complex-plane.js 發出，都在使用者操作之後）：
 *   'cx'：z、w、n 或運算改了之後（放開滑桿、打完數字、拖完、點一下平面、按鍵、切換運算）。
 *         { src, mode（'add' | 'mul' | 'pow' | 'root'）, chal, z, w, pn（次方 n）, rn（開 n 次方）, absZ, argZ, sum, prod, pow（z^pn）, roots（w^rn = z 的根） }
 *   'play'：「播放」播完。資料同上，src = 'play'，mode 是播放時的運算。
 *   'guess'：挑戰「找出 z」送出答案。{ correct, streak, secs, last5（連續 5 題以上時最近 5 題的總秒數） }
 */
(function () {
  'use strict';
  if (!window.LabMission) return;

  const C = function (re, im) { return { re: re, im: im }; };
  const sub = function (z, w) { return C(z.re - w.re, z.im - w.im); };
  const mul = function (z, w) { return C(z.re * w.re - z.im * w.im, z.re * w.im + z.im * w.re); };
  const abs = function (z) { return Math.hypot(z.re, z.im); };
  const near = function (z, w, tol) { return abs(sub(z, w)) <= tol; };
  const arg = function (z) { return Math.atan2(z.im, z.re) * 180 / Math.PI; };
  const isGauss = function (z) { return Math.abs(z.re - Math.round(z.re)) < 1e-6 && Math.abs(z.im - Math.round(z.im)) < 1e-6; };
  const live = function (ev, mode) { return ev.type === 'cx' && !ev.data.chal && ev.data.mode === mode; };
  const played = function (ev, mode) { return ev.type === 'play' && !ev.data.chal && ev.data.mode === mode; };
  const I = C(0, 1);
  const PHI = (1 + Math.sqrt(5)) / 2;

  LabMission.register('complex-plane', [
    {
      id: 'complex-plane-1', level: 1,
      title: { zh: '乘以 i', en: 'Times i' },
      desc: { zh: '在「乘法」把 z 設成 i，按「播放」，看整張方格紙轉了多少度。', en: 'In “Multiply”, set z to i, press “Play” and see how far the whole grid turns.' },
      check: function (ev) { return played(ev, 'mul') && near(ev.data.z, I, 1e-6); }
    },
    {
      id: 'complex-plane-2', level: 2,
      title: { zh: '加成實數', en: 'Adding up to a real number' },
      desc: { zh: '在「加法」讓 z、w 的虛部都不是 0（至少差 0.5），但 z + w 剛好落在實軸上。', en: 'In “Add”, give z and w imaginary parts at least 0.5 away from 0, yet make z + w land exactly on the real axis.' },
      check: function (ev) {
        const d = ev.data;
        return live(ev, 'add') && Math.abs(d.z.im) >= 0.5 && Math.abs(d.w.im) >= 0.5 && Math.abs(d.sum.im) < 1e-6;
      }
    },
    {
      id: 'complex-plane-3', level: 2,
      title: { zh: '只伸縮、不旋轉', en: 'Stretch, no turn' },
      desc: { zh: '在「乘法」把 z 設成一個正的實數（和 1 至少差 0.5），按「播放」：方格紙只放大或縮小，一點也不轉。', en: 'In “Multiply”, set z to a positive real number (at least 0.5 away from 1) and press “Play”: the grid only grows or shrinks, with no turn at all.' },
      check: function (ev) { const z = ev.data.z; return played(ev, 'mul') && Math.abs(z.im) < 1e-9 && z.re > 0 && Math.abs(z.re - 1) >= 0.5; }
    },
    {
      id: 'complex-plane-4', level: 3,
      title: { zh: '只旋轉、不伸縮', en: 'Turn, no stretch' },
      desc: { zh: '在「乘法」把 z 放到單位圓上（|z| = 1），而且不是 ±1、±i（離它們至少 5°），按「播放」：方格紙只轉、大小不變。', en: 'In “Multiply”, put z on the unit circle (|z| = 1) but not at ±1 or ±i (at least 5° away), and press “Play”: the grid turns and keeps its size.' },
      check: function (ev) {
        if (!played(ev, 'mul')) return false;
        const z = ev.data.z, a = arg(z);
        const off = Math.abs(a - 90 * Math.round(a / 90));
        return Math.abs(abs(z) - 1) <= 0.005 && off >= 5;
      }
    },
    {
      id: 'complex-plane-5', level: 3,
      title: { zh: '和鏡像相乘', en: 'Times its mirror image' },
      desc: { zh: '在「乘法」讓 w 是 z 的共軛複數（對實軸的鏡像，z 的虛部至少 0.5），看 zw 落在哪裡、等於多少。', en: 'In “Multiply”, make w the conjugate of z (its mirror image in the real axis, with the imaginary part of z at least 0.5) and see where zw lands.' },
      check: function (ev) {
        const d = ev.data;
        return live(ev, 'mul') && Math.abs(d.z.im) >= 0.5 && near(d.w, C(d.z.re, -d.z.im), 1e-6);
      }
    },
    {
      id: 'complex-plane-6', level: 4,
      title: { zh: '回到單位圓', en: 'Back on the unit circle' },
      desc: { zh: '在「乘法」讓 |z| ≥ 1.5，再調 w，使 zw 剛好落在單位圓上（|zw| = 1），而且 zw 不在實軸上。', en: 'In “Multiply”, take |z| ≥ 1.5 and adjust w so that zw lies exactly on the unit circle (|zw| = 1), and not on the real axis.' },
      check: function (ev) {
        const d = ev.data;
        return live(ev, 'mul') && d.absZ >= 1.5 && Math.abs(abs(d.prod) - 1) <= 0.005 && Math.abs(d.prod.im) >= 0.1;
      }
    },
    {
      id: 'complex-plane-7', level: 4,
      title: { zh: '繞一圈回到 1', en: 'Round and back to 1' },
      desc: { zh: '在「次方」找一個 z（不是 1），讓 z^n 回到 1，而且 n ≥ 3、之前的 z、z^2、… 都還沒回到 1。', en: 'In “Power”, find z (not 1) with z^n back at 1, where n ≥ 3 and none of z, z^2, … got there earlier.' },
      check: function (ev) {
        const d = ev.data;
        if (!live(ev, 'pow') || d.pn < 3 || near(d.z, C(1, 0), 1e-3) || !near(d.pow, C(1, 0), 0.01)) return false;
        let p = C(1, 0);
        for (let k = 1; k < d.pn; k++) { p = mul(p, d.z); if (near(p, C(1, 0), 0.01)) return false; }
        return true;
      }
    },
    {
      id: 'complex-plane-8', level: 5,
      title: { zh: '捲進中心', en: 'Spiralling in' },
      desc: { zh: '在「次方」讓 |z| < 1、z 不在實軸附近（幅角離 0° 和 180° 至少 12°），n ≥ 12，使 z^n 捲到離 0 不到 0.1 的地方。', en: 'In “Power”, take |z| < 1 with z well off the real axis (argument at least 12° from 0° and 180°) and n ≥ 12, so that z^n spirals to within 0.1 of 0.' },
      check: function (ev) {
        const d = ev.data;
        return live(ev, 'pow') && d.absZ < 1 && Math.abs(Math.sin(d.argZ * Math.PI / 180)) >= 0.2 && d.pn >= 12 && abs(d.pow) < 0.1;
      }
    },
    {
      id: 'complex-plane-9', level: 4,
      title: { zh: 'i 的立方根', en: 'Cube roots of i' },
      desc: { zh: '在「方根」把 z 設成 i、開 3 次方，看三個根圍成什麼形狀。', en: 'In “Roots”, set z to i and take cube roots: what shape do the three roots make?' },
      check: function (ev) { return live(ev, 'root') && ev.data.rn === 3 && near(ev.data.z, I, 0.001); }
    },
    {
      id: 'complex-plane-10', level: 6,
      title: { zh: '自己找立方根', en: 'Find a cube root yourself' },
      desc: { zh: '不用「方根」：在「次方」把 n 設成 3，調 z 讓 z^3 = i（誤差 0.01 以內），而且 z 不在虛軸上。', en: 'Without “Roots”: in “Power” set n to 3 and adjust z until z^3 = i (within 0.01), with z off the imaginary axis.' },
      check: function (ev) { const d = ev.data; return live(ev, 'pow') && d.pn === 3 && near(d.pow, I, 0.01) && Math.abs(d.z.re) >= 0.1; }
    },
    {
      id: 'complex-plane-11', level: 7,
      title: { zh: '看出是哪個 z', en: 'Spot the z' },
      desc: { zh: '挑戰「找出 z」連續答對 3 題。', en: 'Get 3 “Find z” problems right in a row.' },
      check: function (ev) { return ev.type === 'guess' && ev.data.correct && ev.data.streak >= 3; }
    },
    {
      id: 'complex-plane-12', level: 9,
      title: { zh: '一眼看穿', en: 'At a glance' },
      desc: { zh: '挑戰「找出 z」連續答對 5 題，而且這 5 題合計不超過 90 秒。', en: 'Get 5 “Find z” problems right in a row, taking no more than 90 seconds for the five.' },
      check: function (ev) { return ev.type === 'guess' && ev.data.correct && ev.data.streak >= 5 && ev.data.last5 <= 90; }
    },

    // ---------- 隱藏任務 ----------
    {
      id: 'complex-plane-h1', level: 3, hidden: true,
      riddle: { zh: '人們說它是想像出來的；可是只走兩步，就讓你轉身面向來時的路。', en: 'They call it imaginary; yet two steps of it turn you round to face the way you came.' },
      check: function (ev) { return live(ev, 'pow') && ev.data.pn === 2 && near(ev.data.z, I, 1e-6); }
    },
    {
      id: 'complex-plane-h2', level: 4, hidden: true,
      riddle: { zh: '五，本來誰也拆不開；在一張轉過的方格紙上，它被一對鏡中的兄弟分走了。', en: 'Nobody could split five; on a turned sheet of squared paper, a pair of mirror-image brothers shared it out.' },
      check: function (ev) {
        const z = ev.data.z, w = ev.data.w;
        return played(ev, 'mul') && isGauss(z) && Math.round(z.re * z.re + z.im * z.im) === 5 && near(w, C(z.re, -z.im), 1e-6);
      }
    },
    {
      id: 'complex-plane-h3', level: 5, hidden: true,
      riddle: { zh: '斜斜地走，一步比一步遠；第八步又面向出發的方向，人卻已站在十六。', en: 'Walking slantwise, each step farther than the last; at the eighth you face the way you set out, standing at sixteen.' },
      check: function (ev) { return live(ev, 'pow') && ev.data.pn === 8 && near(ev.data.z, C(1, 1), 1e-6); }
    },
    {
      id: 'complex-plane-h4', level: 5, hidden: true,
      riddle: { zh: '一個把你轉過去、推遠；另一個把你轉回來、拉近。兩個合起來，什麼事也沒發生。', en: 'One turns you and pushes you away; the other turns you back and draws you in. Together, nothing happened at all.' },
      check: function (ev) {
        const d = ev.data;
        return live(ev, 'mul') && near(d.prod, C(1, 0), 0.002) && Math.abs(d.z.im) >= 0.3 && (d.absZ >= 1.5 || d.absZ <= 0.67);
      }
    },
    {
      id: 'complex-plane-h5', level: 6, hidden: true,
      riddle: { zh: '把一圈切成三份，取鏡子兩邊的那兩份並肩走；走到的地方，比什麼都沒有還少一步。', en: 'Cut a circle into three, walk the two pieces on either side of the mirror side by side: you end one step short of nothing.' },
      check: function (ev) {
        const d = ev.data, z = d.z, w = d.w;
        if (!live(ev, 'add')) return false;
        return Math.abs(abs(z) - 1) <= 0.005 && Math.abs(abs(w) - 1) <= 0.005 && Math.abs(Math.abs(arg(z)) - 120) <= 0.5 &&
          near(w, C(z.re, -z.im), 0.005) && near(d.sum, C(-1, 0), 0.01);
      }
    },
    {
      id: 'complex-plane-h6', level: 7, hidden: true,
      riddle: { zh: '一個負數被拆成四個方方正正的整數影子，沒有一個肯站在路上。', en: 'A negative number splits into four neat whole-number shadows, and not one of them will stand on the road.' },
      check: function (ev) {
        const d = ev.data;
        if (!live(ev, 'root') || d.rn < 3 || !d.roots.length) return false;
        return d.roots.every(function (p) { return isGauss(p) && Math.abs(p.re) > 0.5 && Math.abs(p.im) > 0.5; });
      }
    },
    {
      id: 'complex-plane-h7', level: 7, hidden: true,
      riddle: { zh: '不是轉三十度，也不是四十五度，而是剛好轉過一段和半徑一樣長的弧。', en: 'Not thirty degrees, not forty-five: turn through an arc exactly as long as the radius.' },
      check: function (ev) { return played(ev, 'mul') && near(ev.data.z, C(Math.cos(1), Math.sin(1)), 0.0008); }
    },
    {
      id: 'complex-plane-h8', level: 8, hidden: true,
      riddle: { zh: '每轉過一個牆角就長大一次，大到恰好是黃金的比例；轉滿六個牆角以上，看它畫出的螺線。', en: 'Grow at every corner you turn, by exactly the golden ratio; turn six corners or more and watch the spiral it draws.' },
      check: function (ev) {
        const d = ev.data;
        return live(ev, 'pow') && d.pn >= 6 && Math.abs(d.absZ - PHI) <= 0.003 && Math.abs(Math.abs(d.argZ) - 90) <= 0.3;
      }
    },
    {
      id: 'complex-plane-h9', level: 9, hidden: true,
      riddle: { zh: '把一圈切成五份，取鏡子兩邊最靠近的那兩份相加；剩下的，正是黃金的零頭。', en: 'Cut a circle into five, add the two pieces nearest the mirror on either side: what is left is the small change of the golden number.' },
      check: function (ev) {
        const d = ev.data, z = d.z, w = d.w;
        if (!live(ev, 'add')) return false;
        return Math.abs(abs(z) - 1) <= 0.003 && Math.abs(Math.abs(arg(z)) - 72) <= 0.3 &&
          near(w, C(z.re, -z.im), 0.003) && Math.abs(d.sum.re - (PHI - 1)) <= 0.003 && Math.abs(d.sum.im) <= 0.003;
      }
    },
    {
      id: 'complex-plane-h10', level: 10, hidden: true,
      riddle: { zh: '站在一，朝正上方挪一小步，同樣的事做滿一百遍；你走到了世上最美那條等式的另一邊。', en: 'Stand at one, nudge a tiny step straight up, and do the same a hundred times over: you reach the other side of the most beautiful equation in the world.' },
      check: function (ev) {
        const d = ev.data;
        return live(ev, 'pow') && Math.abs(d.z.re - 1) < 1e-9 && d.z.im > 0 && d.pn >= 100 && near(d.pow, C(-1, 0), 0.06);
      }
    }
  ]);
})();
