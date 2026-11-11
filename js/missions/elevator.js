/* missions/elevator.js — 電梯中的視重（超重與失重）的任務（星星數 = 等級 1–10） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  // 事件（js/elevator.js 發出；SI 單位，向上為正，讀數單位 kgw）：
  //   phase：每一段等加速度運動開始時（或運動中改變質量時）
  //          { kind, run, mystery, a, v（段落開始時）, dir（運動方向 +1/−1/0）, reading, N, m, ms, T, ext, ext0, ratio = (g + a)/g, y }
  //   trip：樓層行程到站 { from（出發樓層，不在樓層上為 null）, to, y0, y1, d, up, A, V, m, ms, duration, readMin, readMax, mConst, mystery, peakV }
  //   pause：按「暫停」{ t, y, v, a, kind, moving, reading, m, mystery }
  //   cut：剪斷纜繩 { y0, v0, atFloor, vTrip, ab, predicted, m }
  //   brakeStop：斷纜後被安全鉗煞停 { y0, v0, startFloor, yStop, drop, vTrip, ab, manual, tFree, readMin, readMax, m, stopFloor, stopOff }
  //   manualStop：手動駕駛停住 { y0, fromFloor, y, floor, off, protect, readMin, readMax, m, mConst }
  //   ball：小球落地 { h, t, t0（靜止時的落地時間）, ratio = t/t0, aConst, a, gEff, floated, floatTime, m }
  //   guess：神秘電梯的答案 { aTrue, aGuess, err, ok, m }
  const near = function (a, b, tol) { return Math.abs(a - b) <= tol; };
  const is60 = function (m) { return Math.abs(m - 60) < 1e-9; };

  LabMission.register('elevator', [
    {
      id: 'elevator-1', level: 1,
      title: { zh: '第一趟', en: 'First ride' },
      desc: { zh: '按樓層按鈕，搭電梯到另一個樓層。', en: 'Press a floor button and ride to another floor.' },
      check: function (ev) { return ev.type === 'trip' && ev.data.d > 1; }
    },
    {
      id: 'elevator-2', level: 2,
      title: { zh: '完全失重', en: 'Weightless' },
      desc: { zh: '剪斷纜繩，讓體重計讀數變成 0，最後被緊急煞車安全停住。', en: 'Cut the cable so that the scale reads 0, and let the emergency brake stop the elevator safely.' },
      check: function (ev) { return ev.type === 'brakeStop' && ev.data.readMin < 1e-9; }
    },
    {
      id: 'elevator-3', level: 3,
      title: { zh: '往上，卻變輕', en: 'Going up, feeling lighter' },
      desc: { zh: '在電梯「往上運動」而體重計讀數「小於實重」的時刻按下暫停。', en: 'Press Pause at a moment when the elevator is moving up but the scale reads less than your true weight.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'pause' && !d.mystery && d.v > 0.05 && d.reading < d.m - 0.05;
      }
    },
    {
      id: 'elevator-4', level: 3,
      title: { zh: '72 公斤重', en: '72 kilogram-weight' },
      desc: { zh: '60 kg 的人站在體重計上，讓讀數剛好是 72.0 kgw（誤差 ±0.05）。', en: 'With a 60 kg person on the scale, make it read exactly 72.0 kgw (±0.05).' },
      check: function (ev) { const d = ev.data; return ev.type === 'phase' && is60(d.m) && near(d.reading, 72, 0.05); }
    },
    {
      id: 'elevator-5', level: 4,
      title: { zh: '彈簧拉長 1.8 倍', en: 'Stretch 1.8 times' },
      desc: { zh: '讓彈簧秤的伸長量變成電梯靜止時的 1.8 倍（誤差 0.5% 內）。', en: 'Make the spring stretch 1.8 times as much as when the elevator is at rest (within 0.5%).' },
      check: function (ev) { const d = ev.data; return ev.type === 'phase' && d.ext0 > 0 && near(d.ext / d.ext0, 1.8, 0.009); }
    },
    {
      id: 'elevator-6', level: 5,
      title: { zh: '相反的運動，相同的讀數', en: 'Opposite motion, same reading' },
      desc: { zh: '60 kg 的人：一次在電梯往上運動時、一次在電梯往下運動時，都讓體重計讀到 66.0 kgw（誤差 ±0.1）。', en: 'With a 60 kg person, make the scale read 66.0 kgw (±0.1) once while the elevator moves up and once while it moves down.' },
      check: function (ev, mem) {
        if (ev.type !== 'phase') return false;
        const d = ev.data;
        if (!is60(d.m) || !near(d.reading, 66, 0.1) || d.dir === 0) return false;
        if (d.dir > 0) mem.up = true; else mem.down = true;
        return !!(mem.up && mem.down);
      }
    },
    {
      id: 'elevator-7', level: 5,
      title: { zh: '神秘電梯', en: 'The mystery elevator' },
      desc: { zh: '搭神秘電梯，只看體重計讀數算出起動時加速度的大小（誤差 ±0.02 m/s²）。', en: 'Ride the mystery elevator and work out the size of its starting acceleration from the scale reading alone (±0.02 m/s²).' },
      check: function (ev) { return ev.type === 'guess' && ev.data.err <= 0.02; }
    },
    {
      id: 'elevator-8', level: 6,
      title: { zh: '快一成落地', en: 'Ten percent faster' },
      desc: { zh: '在電梯中放開小球，讓它落到地板的時間只有電梯靜止時的 0.900 倍（誤差 0.5% 內；小球落下期間電梯的加速度不能改變）。', en: 'Drop the ball so that it reaches the floor in 0.900 times the time it takes when the elevator is at rest (within 0.5%; the elevator’s acceleration must not change while the ball falls).' },
      check: function (ev) { const d = ev.data; return ev.type === 'ball' && d.aConst && near(d.ratio, 0.9, 0.0045); }
    },
    {
      id: 'elevator-9', level: 7,
      title: { zh: '降兩層樓', en: 'Down two floors' },
      desc: { zh: '電梯停在某一層時剪斷纜繩，不按緊急煞車、交給限速器，讓電梯剛好停在低兩層樓的樓板高度（誤差 ±3 cm）。', en: 'With the elevator stopped at a floor, cut the cable and leave the braking to the governor (no emergency-brake button) so that the elevator stops exactly level with the floor two storeys below (±3 cm).' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'brakeStop' && !d.manual && d.startFloor != null && d.startFloor >= 3 && near(d.yStop, d.y0 - 6, 0.03);
      }
    },
    {
      id: 'elevator-10', level: 8,
      title: { zh: '又快又舒服', en: 'Fast but comfortable' },
      desc: { zh: '60 kg 的人從 1F 搭到 10F，全程讀數保持在 54.0–66.0 kgw 之間，而且 10.6 s 內到達。', en: 'Take a 60 kg person from 1F to 10F with the reading staying between 54.0 and 66.0 kgw the whole way, arriving within 10.6 s.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'trip' && d.from === 1 && d.to === 10 && is60(d.m) && d.mConst && !d.mystery &&
          d.readMax <= 66 + 1e-6 && d.readMin >= 54 - 1e-6 && d.duration <= 10.6;
      }
    },
    {
      id: 'elevator-11', level: 9,
      title: { zh: '老練的駕駛員', en: 'Skilled operator' },
      desc: { zh: '用「手動駕駛」從 1F 出發，自己減速停在 6F，離樓板不超過 ±3 cm。', en: 'In manual drive, start from 1F and stop yourself at 6F, within ±3 cm of the floor level.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'manualStop' && d.fromFloor === 1 && d.floor === 6 && !d.protect && Math.abs(d.off) <= 0.03;
      }
    },
    {
      id: 'elevator-12', level: 10,
      title: { zh: '大師：0.400 秒', en: 'Master: 0.400 seconds' },
      desc: { zh: '讓小球從手中落到地板剛好花 0.400 s（誤差 ±0.001 s；小球落下期間電梯的加速度不能改變）。', en: 'Make the ball take exactly 0.400 s to fall from your hand to the floor (±0.001 s; the elevator’s acceleration must not change while it falls).' },
      check: function (ev) { const d = ev.data; return ev.type === 'ball' && d.aConst && near(d.t, 0.4, 0.001); }
    },
    // ---------- 隱藏任務：只給隱晦的提示 ----------
    {
      id: 'elevator-h1', level: 4, hidden: true,
      riddle: { zh: '鬆開了手，它卻捨不得離開。', en: 'You let go, yet it would not leave you.' },
      check: function (ev) { const d = ev.data; return ev.type === 'ball' && d.floatTime >= 0.3; }
    },
    {
      id: 'elevator-h2', level: 5, hidden: true,
      riddle: { zh: '那一瞬間，彷彿背著另一個自己。', en: 'For a moment you carried a second you.' },
      check: function (ev) { const d = ev.data; return ev.type === 'phase' && d.m > 0 && near(d.reading / d.m, 2, 0.005); }
    },
    {
      id: 'elevator-h3', level: 6, hidden: true,
      riddle: { zh: '斷了線的風箏，還想往上飛。', en: 'A kite with a broken string still climbs.' },
      check: function (ev) { return ev.type === 'cut' && ev.data.v0 >= 1; }
    }
  ]);
})();
