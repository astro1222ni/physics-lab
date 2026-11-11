/* missions/circular-motion.js — 等速圓周運動的任務（星星數 = 等級 1–10） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  // 事件（js/circular-motion.js 發出；SI 單位，角度用度、由 +x 軸逆時針量起）：
  //   params：放開滑桿、打完數字或切換「保持不變的量」之後
  //           { r, T, m, v, omega, f, a, F, hold: 'T' | 'v', prev: 前一個設定（同樣的欄位；一開始是預設值） }
  //   cut：剪斷繩子 { …設定…, theta0, tCut, theta（剪斷角）, xc, yc, vx, vy }
  //   exit：剪斷後小球飛出畫面 { …同 cut…, tau（剪斷後經過的時間）, x, y }
  //   pause：按「暫停」{ …設定…, attached, t, theta（繩子還在時）, x, y, vx, vy, ax, ay, d（離圓心）, tau（剪斷後經過的時間） }
  //   lap：繩子還在、從上次改條件起不間斷地轉滿第 n 圈 { …設定…, n }
  const EPS = 1e-9;
  const rel = function (x, target, tol) { return Math.abs(x - target) <= tol * Math.abs(target); };
  const near = function (a, b) { return Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b)); };
  /** 兩個角度（度）的差，取 0–180 */
  const angDiff = function (a, b) { const d = Math.abs(((a - b) % 360 + 540) % 360 - 180); return d; };
  /** 剪斷後的直線路徑最接近 P 的時刻與距離（物理核心 CircularCore.passPoint） */
  const pass = function (d, px, py) {
    return window.CircularCore.passPoint({ r: d.r, T: d.T, theta0: d.theta0 }, d.tCut, px, py);
  };
  /** 記錄最近的設定（含每次的前一個設定），供「兩個設定比較」的任務使用 */
  const remember = function (mem, d) {
    const list = mem.list = mem.list || [];
    if (d.prev) list.push(d.prev);
    list.push(d);
    while (list.length > 24) list.shift();
    return list;
  };

  LabMission.register('circular-motion', [
    {
      id: 'circular-motion-1', level: 1,
      title: { zh: '放手！', en: 'Let go!' },
      desc: { zh: '剪斷繩子，看小球飛出畫面。', en: 'Cut the string and watch the ball fly off the screen.' },
      check: function (ev) { return ev.type === 'exit'; }
    },
    {
      id: 'circular-motion-2', level: 2,
      title: { zh: '向心加速度 10', en: 'Centripetal acceleration of 10' },
      desc: { zh: '調整條件，讓向心加速度恰好是 10.0 m/s²（誤差 0.5% 內）。', en: 'Adjust the settings so that the centripetal acceleration is exactly 10.0 m/s² (within 0.5%).' },
      check: function (ev) { return ev.type === 'params' && rel(ev.data.a, 10, 0.005); }
    },
    {
      id: 'circular-motion-3', level: 2,
      title: { zh: '同樣的運動，兩倍的力', en: 'Same motion, twice the force' },
      desc: { zh: '半徑與週期都不變，讓需要的向心力變成原來的 2 倍（誤差 1% 內）。', en: 'Keeping the radius and the period the same, make the required centripetal force twice as large (within 1%).' },
      check: function (ev, mem) {
        if (ev.type !== 'params') return false;
        const d = ev.data;
        return remember(mem, d).some(function (o) {
          return o !== d && near(o.r, d.r) && near(o.T, d.T) && o.F > 0 && rel(d.F / o.F, 2, 0.01);
        });
      }
    },
    {
      id: 'circular-motion-4', level: 3,
      title: { zh: '筆直向上', en: 'Straight up' },
      desc: { zh: '剪斷繩子，讓小球朝畫面正上方（+y 方向）筆直飛出（方向誤差 2° 內）。', en: 'Cut the string so that the ball flies straight up the screen, in the +y direction (within 2°).' },
      check: function (ev) {
        if (ev.type !== 'exit') return false;
        const dir = Math.atan2(ev.data.vy, ev.data.vx) * 180 / Math.PI;
        return angDiff(dir, 90) <= 2;
      }
    },
    {
      id: 'circular-motion-5', level: 4,
      title: { zh: '半徑不同，加速度相同', en: 'Different radius, same acceleration' },
      desc: { zh: '先後設定兩組條件，半徑相差至少 1.0 m，向心加速度卻相等（誤差 1% 內）。', en: 'Make two settings, one after the other, whose radii differ by at least 1.0 m but whose centripetal accelerations are equal (within 1%).' },
      check: function (ev, mem) {
        if (ev.type !== 'params') return false;
        const d = ev.data;
        return remember(mem, d).some(function (o) {
          return o !== d && Math.abs(o.r - d.r) >= 1 - EPS && rel(o.a, d.a, 0.01);
        });
      }
    },
    {
      id: 'circular-motion-6', level: 4,
      title: { zh: '影子的極值', en: 'The shadow’s extremes' },
      desc: { zh: '調整條件，讓 x 投影（影子）的簡諧運動最大速率恰好 2.00 m/s、最大加速度恰好 4.00 m/s²（各在 1% 內）。', en: 'Adjust the settings so that the simple harmonic motion of the x projection (the shadow) has a maximum speed of exactly 2.00 m/s and a maximum acceleration of exactly 4.00 m/s² (each within 1%).' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'params' && rel(d.r * d.omega, 2, 0.01) && rel(d.r * d.omega * d.omega, 4, 0.01);
      }
    },
    {
      id: 'circular-motion-7', level: 5,
      title: { zh: '兩倍半徑', en: 'Twice the radius' },
      desc: { zh: '剪斷繩子後按「暫停」，讓小球停在離圓心恰好 2 倍半徑的地方（誤差 1% 內）。', en: 'After cutting the string, press “Pause” so that the ball stops exactly twice the radius from the centre (within 1%).' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'pause' && !d.attached && rel(d.d / d.r, 2, 0.01);
      }
    },
    {
      id: 'circular-motion-8', level: 6,
      title: { zh: '影子的加速度', en: 'The shadow’s acceleration' },
      desc: { zh: '向心加速度至少 4 m/s² 時（繩子沒剪斷），在 x 投影的加速度恰好是 +2.00 m/s²（朝 +x，誤差 ±0.10）的瞬間按「暫停」。', en: 'With a centripetal acceleration of at least 4 m/s² (string not cut), press “Pause” at the instant the x projection’s acceleration is exactly +2.00 m/s² (towards +x, ±0.10).' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'pause' && d.attached && d.a >= 4 - EPS && Math.abs(d.ax - 2) <= 0.1;
      }
    },
    {
      id: 'circular-motion-9', level: 7,
      title: { zh: '穿過角落', en: 'Through the corner' },
      desc: { zh: '半徑不超過 1.5 m：剪斷繩子，讓小球飛出時通過格點 (2, 2) m（誤差 3 cm 內）。', en: 'With a radius of at most 1.5 m, cut the string so that the ball passes through the grid point (2, 2) m on its way out (within 3 cm).' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'exit' && d.r <= 1.5 + EPS && pass(d, 2, 2).miss <= 0.03;
      }
    },
    {
      id: 'circular-motion-10', level: 8,
      title: { zh: '一秒後兩公尺', en: 'Two metres after one second' },
      desc: { zh: '剪斷繩子後恰好 1.00 s（±0.02 s）按「暫停」，此時小球離圓心恰好 2.00 m（±0.02 m）。', en: 'Press “Pause” exactly 1.00 s (±0.02 s) after cutting the string, at which moment the ball must be exactly 2.00 m (±0.02 m) from the centre.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'pause' && !d.attached && Math.abs(d.tau - 1) <= 0.02 && Math.abs(d.d - 2) <= 0.02;
      }
    },
    {
      id: 'circular-motion-11', level: 9,
      title: { zh: '指定的速度向量', en: 'A given velocity vector' },
      desc: { zh: '剪斷繩子，讓小球以速度 (vx, vy) = (−1.20, +1.60) m/s 飛出畫面（每個分量誤差 ±0.03 m/s）。', en: 'Cut the string so that the ball flies off with velocity (vx, vy) = (−1.20, +1.60) m/s (each component ±0.03 m/s).' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'exit' && Math.abs(d.vx + 1.2) <= 0.03 && Math.abs(d.vy - 1.6) <= 0.03;
      }
    },
    {
      id: 'circular-motion-12', level: 10,
      title: { zh: '大師：準時命中', en: 'Master: on target, on time' },
      desc: { zh: '剪斷繩子，讓小球通過點 (−2, 0) m（誤差 3 cm 內），而且恰好在剪斷後 1.00 s（±0.02 s）抵達。', en: 'Cut the string so that the ball passes through the point (−2, 0) m (within 3 cm), arriving exactly 1.00 s (±0.02 s) after the cut.' },
      check: function (ev) {
        if (ev.type !== 'exit') return false;
        const q = pass(ev.data, -2, 0);
        return q.miss <= 0.03 && Math.abs(q.tau - 1) <= 0.02;
      }
    },
    // ---------- 隱藏任務：只給隱晦的提示 ----------
    {
      id: 'circular-motion-h1', level: 4, hidden: true,
      riddle: { zh: '細繩在呻吟：再多一分，它就要斷了。', en: 'The string groans: one ounce more and it will snap.' },
      check: function (ev) { return ev.type === 'params' && ev.data.F >= 200; }
    },
    {
      id: 'circular-motion-h2', level: 6, hidden: true,
      riddle: { zh: '兩次告別，走上同一條路；一個匆匆，一個從容。', en: 'Two farewells set out on the same road — one in a hurry, one at ease.' },
      check: function (ev, mem) {
        if (ev.type !== 'exit') return false;
        const d = ev.data, list = mem.list = mem.list || [];
        const ok = list.some(function (o) {
          return near(o.r, d.r) && angDiff(o.theta, d.theta) <= 1 && Math.max(o.v / d.v, d.v / o.v) >= 2 - EPS;
        });
        list.push({ r: d.r, theta: d.theta, v: d.v });
        if (list.length > 12) list.shift();
        return ok;
      }
    },
    {
      id: 'circular-motion-h3', level: 5, hidden: true,
      riddle: { zh: '最輕的牽引，輕得幾乎感覺不到，卻始終沒有鬆手，陪它走完一整圈。', en: 'The faintest of pulls, so light it can hardly be felt — yet it never lets go, all the way round.' },
      check: function (ev) { return ev.type === 'lap' && ev.data.n >= 1 && ev.data.F <= 0.04; }
    }
  ]);
})();
