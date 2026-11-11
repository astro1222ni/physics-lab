/* missions/faraday.js — 法拉第定律與冷次定律的任務（星星數 = 等級 1–10） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  // 事件（js/faraday.js 回報；只有使用者操作過之後才會送出）：
  //   'passEnd'：等速通過結束 { mode:'A', N, a(m), R, v, dir, flipped, epsPeak(V), IPeak(A), firstSign, qHalf(C), qTotal, phiMax }
  //   'cycle'  ：來回振盪每完成一個週期 { mode:'A', N, a, R, f, flipped, epsPeak, IPeak }
  //   'liveA'  ：磁鐵與線圈的即時量（約每 0.1 s）{ motion, x, vel, phi, eps, I, nearPole, centered, stillFor, dragPeakI, … }
  //   'liveB'  ：導體棒的即時量 { sub, B, Bsign, L, R, m, v0, F, t, x, v, eps, I, P, heat, work, KE, tau, vt }
  //   'rodHalf'：放開後速度減半的時刻 { …, tHalf }
  //   'rodEnd' ：導體棒停下或到達軌道末端 { …, reason: 'stopped'|'rail', travel, KE0 }
  const near = function (a, b, rel) { return Math.abs(a - b) <= rel * Math.abs(b); };
  const same = function (a, b) { return Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(a), Math.abs(b), 1); };
  const remember = function (mem, d, n) { (mem.list = mem.list || []).push(d); if (mem.list.length > (n || 12)) mem.list.shift(); return mem.list; };
  const sameCoil = function (o, d) { return same(o.N, d.N) && same(o.a, d.a) && same(o.R, d.R) && o.flipped === d.flipped; };

  LabMission.register('faraday', [
    {
      id: 'faraday-1', level: 1,
      title: { zh: '指針先向右', en: 'Needle right first' },
      desc: { zh: '讓磁鐵「等速通過」線圈，使檢流計的指針第一次偏轉是向右（I > 0）。', en: 'Send the magnet through the coil with “Steady pass” so that the needle’s first swing is to the right (I > 0).' },
      check: function (ev) { return ev.type === 'passEnd' && ev.data.firstSign > 0; }
    },
    {
      id: 'faraday-2', level: 2,
      title: { zh: 'S 極現身', en: 'Enter the S pole' },
      desc: { zh: '讓線圈「面向磁鐵的那一端」感應出 S 極，且感應電流至少 1 mA。', en: 'Make the end of the coil facing the magnet become an S pole, with an induced current of at least 1 mA.' },
      check: function (ev) { return ev.type === 'liveA' && ev.data.nearPole === 'S' && Math.abs(ev.data.I) >= 1e-3; }
    },
    {
      id: 'faraday-3', level: 3,
      title: { zh: '快慢都一樣', en: 'Fast or slow, the same' },
      desc: { zh: '匝數、線圈半徑、電阻與磁鐵方向都不變，用相差至少 3 倍的兩種速率各通過一次，比較磁鐵「進入」時流過檢流計的電量。', en: 'Keeping the turns, coil radius, resistance and magnet orientation the same, do two steady passes at speeds at least 3 times apart and compare the charge that flows while the magnet goes in.' },
      check: function (ev, mem) {
        if (ev.type !== 'passEnd') return false;
        const d = ev.data;
        return remember(mem, d).some(function (o) {
          return o !== d && sameCoil(o, d) && Math.max(o.v / d.v, d.v / o.v) >= 3 - 1e-9 && near(Math.abs(o.qHalf), Math.abs(d.qHalf), 0.01);
        });
      }
    },
    {
      id: 'faraday-4', level: 3,
      title: { zh: '一點五伏特', en: 'One and a half volts' },
      desc: { zh: '導體棒「等速拉動」，讓感應電動勢 ε = 1.50 V（誤差 0.5% 內）。', en: 'Pull the rod at steady speed so that the induced emf is ε = 1.50 V (within 0.5%).' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'liveB' && d.sub === 'const' && near(Math.abs(d.eps), 1.5, 0.005);
      }
    },
    {
      id: 'faraday-5', level: 4,
      title: { zh: '快兩倍', en: 'Twice as fast' },
      desc: { zh: '連續兩次「等速通過」，只改變速率，讓第二次的最大電動勢恰好是第一次的 2 倍（誤差 1% 內）。', en: 'In two steady passes in a row, changing only the speed, make the peak emf of the second exactly twice that of the first (within 1%).' },
      check: function (ev, mem) {
        if (ev.type !== 'passEnd') return false;
        const d = ev.data, o = mem.last;
        mem.last = d;
        return !!o && sameCoil(o, d) && o.dir === d.dir && near(d.epsPeak / o.epsPeak, 2, 0.01);
      }
    },
    {
      id: 'faraday-6', level: 5,
      title: { zh: '一伏特', en: 'One volt' },
      desc: { zh: '「等速通過」時，讓最大感應電動勢恰好 1.000 V（誤差 1% 內）。', en: 'In a steady pass, make the peak induced emf exactly 1.000 V (within 1%).' },
      check: function (ev) { return ev.type === 'passEnd' && near(ev.data.epsPeak, 1, 0.01); }
    },
    {
      id: 'faraday-7', level: 5,
      title: { zh: '終端速度', en: 'Terminal speed' },
      desc: { zh: '導體棒從靜止（v0 = 0）開始「定力拉動」，讓它達到 2.00 m/s 的終端速度（終端速度與實際速度誤差都在 1% 內）。', en: 'Starting from rest (v0 = 0), pull the rod with a constant force so that it reaches a terminal speed of 2.00 m/s (terminal speed and actual speed both within 1%).' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'liveB' && d.sub === 'force' && d.v0 === 0 && near(d.vt, 2, 0.01) && near(d.v, d.vt, 0.01);
      }
    },
    {
      id: 'faraday-8', level: 6,
      title: { zh: '滑行一公尺', en: 'Slide one metre' },
      desc: { zh: '「給初速後放開」，讓導體棒在軌道上停下時恰好滑行了 1.00 m（誤差 1% 內，不能撞到末端）。', en: 'Push the rod and let go so that it comes to rest after sliding exactly 1.00 m (within 1%, without hitting the end).' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'rodEnd' && d.sub === 'release' && d.reason === 'stopped' && near(d.travel, 1, 0.01);
      }
    },
    {
      id: 'faraday-9', level: 7,
      title: { zh: '一秒減半', en: 'Half speed in one second' },
      desc: { zh: '「給初速後放開」，讓導體棒的速度恰好在 t = 1.00 s 時減為初速的一半（誤差 1% 內）。', en: 'Push the rod and let go so that its speed falls to half the initial speed at exactly t = 1.00 s (within 1%).' },
      check: function (ev) { return ev.type === 'rodHalf' && ev.data.sub === 'release' && near(ev.data.tHalf, 1, 0.01); }
    },
    {
      id: 'faraday-10', level: 8,
      title: { zh: '振盪二十毫安', en: 'Twenty milliamps, oscillating' },
      desc: { zh: '磁鐵以頻率 1.0 Hz「來回振盪」，電路電阻 50 Ω，讓每個週期的最大感應電流恰好 20.0 mA（誤差 1% 內）。', en: 'With the magnet oscillating at 1.0 Hz and a circuit resistance of 50 Ω, make the peak induced current in each cycle exactly 20.0 mA (within 1%).' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'cycle' && same(d.f, 1) && same(d.R, 50) && near(d.IPeak, 0.02, 0.01);
      }
    },
    {
      id: 'faraday-11', level: 9,
      title: { zh: '功率平衡', en: 'Power balance' },
      desc: { zh: '導體棒從靜止開始「定力拉動」，到達終端速度 1.50 m/s 時，電阻的發熱功率恰好 3.00 W（各在 1% 內）。', en: 'Pull the rod from rest with a constant force so that at its terminal speed of 1.50 m/s the resistor dissipates exactly 3.00 W (each within 1%).' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'liveB' && d.sub === 'force' && d.v0 === 0 && near(d.vt, 1.5, 0.01) && near(d.v, d.vt, 0.01) && near(d.P, 3, 0.01);
      }
    },
    {
      id: 'faraday-12', level: 10,
      title: { zh: '大師：兩全其美', en: 'Master: both at once' },
      desc: { zh: '一次「等速通過」同時做到：最大電動勢 0.500 V，而且磁鐵進入時流過檢流計的電量為 1.00 mC（各在 1% 內）。', en: 'In one steady pass, achieve both a peak emf of 0.500 V and a charge of 1.00 mC flowing while the magnet goes in (each within 1%).' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'passEnd' && near(d.epsPeak, 0.5, 0.01) && near(Math.abs(d.qHalf), 1e-3, 0.01);
      }
    },
    // ---------- 隱藏任務：只給隱晦的提示 ----------
    {
      id: 'faraday-h1', level: 6, hidden: true,
      riddle: { zh: '滿懷之時，反而無聲。', en: 'When it is fullest, it falls silent.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'liveA' && d.motion === 'drag' && d.centered && d.stillFor >= 1 && d.dragPeakI >= 0.005;
      }
    },
    {
      id: 'faraday-h2', level: 7, hidden: true,
      riddle: { zh: '從高處走下來的，終究和從低處爬上去的，停在同一個地方。', en: 'What walks down from on high comes to rest in the very place the climbers from below do.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'liveB' && d.sub === 'force' && d.vt > 0 && d.v0 >= 2 * d.vt && near(d.v, d.vt, 0.01);
      }
    },
    {
      id: 'faraday-h3', level: 5, hidden: true,
      riddle: { zh: '所有的奔跑，最後都化成整整一份溫暖。', en: 'All that running finally turns into one whole portion of warmth.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'rodEnd' && d.sub === 'release' && d.reason === 'stopped' && near(d.heat, 1, 0.005);
      }
    }
  ]);
})();
