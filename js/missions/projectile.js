/* missions/projectile.js — 拋體運動的任務（星星數 = 等級 1–10） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  const close = function (a, b, rel) { return Math.abs(a - b) <= rel * Math.max(Math.abs(a), Math.abs(b), 1e-9); };
  const same = function (a, b) { return Math.abs(a - b) < 1e-6; };
  // 記錄最近幾次落地，供「兩發比較」的任務使用
  const remember = function (mem, d, n) { (mem.list = mem.list || []).push(d); if (mem.list.length > (n || 12)) mem.list.shift(); return mem.list; };

  LabMission.register('projectile', [
    {
      id: 'projectile-1', level: 1,
      title: { zh: '第一發', en: 'First shot' },
      desc: { zh: '發射一次，讓球落地。', en: 'Launch once and let the ball land.' },
      check: function (ev) { return ev.type === 'landed'; }
    },
    {
      id: 'projectile-2', level: 2,
      title: { zh: '百公尺遠投', en: 'Hundred-metre throw' },
      desc: { zh: '讓射程超過 100 m。', en: 'Get a range of more than 100 m.' },
      check: function (ev) { return ev.type === 'landed' && ev.data.R > 100; }
    },
    {
      id: 'projectile-3', level: 3,
      title: { zh: '同時落地', en: 'Same landing time' },
      desc: { zh: '從同一個高台（至少 10 m）水平拋出兩發（仰角 0°），初速相差至少 10 m/s，比較兩者的飛行時間。', en: 'From the same platform (at least 10 m) throw horizontally twice (0°) with launch speeds at least 10 m/s apart, and compare the flight times.' },
      check: function (ev, mem) {
        if (ev.type !== 'landed') return false;
        const d = ev.data;
        if (!(same(d.theta, 0) && d.h0 >= 10 && !d.drag)) return false;
        return remember(mem, d).some(function (o) {
          return o !== d && same(o.h0, d.h0) && same(o.g, d.g) && same(o.theta, 0) && !o.drag && Math.abs(o.v0 - d.v0) >= 10 && close(o.T, d.T, 0.005);
        });
      }
    },
    {
      id: 'projectile-4', level: 4,
      title: { zh: '互補角', en: 'Complementary angles' },
      desc: { zh: '地面發射、無阻力、初速相同，用兩個相差至少 10° 的仰角，打出射程相等的兩發（誤差 0.5% 內）。', en: 'From the ground, without drag and with the same launch speed, use two angles at least 10° apart to get equal ranges (within 0.5%).' },
      check: function (ev, mem) {
        if (ev.type !== 'landed') return false;
        const d = ev.data;
        if (d.drag || d.h0 > 0 || d.R < 1) return false;
        return remember(mem, d).some(function (o) {
          return o !== d && !o.drag && o.h0 === 0 && same(o.v0, d.v0) && same(o.g, d.g) && Math.abs(o.theta - d.theta) >= 10 && close(o.R, d.R, 0.005);
        });
      }
    },
    {
      id: 'projectile-5', level: 5,
      title: { zh: '高台最佳仰角', en: 'Best angle from a height' },
      desc: { zh: '從至少 10 m 高的地方、無阻力發射，用「射程最遠」的仰角打出一發（誤差 0.3° 內）。', en: 'From at least 10 m up and without drag, launch at the angle that gives the greatest range (within 0.3°).' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'landed' && !d.drag && d.h0 >= 10 && d.optTheta != null && Math.abs(d.theta - d.optTheta) <= 0.3;
      }
    },
    {
      id: 'projectile-6', level: 6,
      title: { zh: '精準落點', en: 'Pinpoint landing' },
      desc: { zh: '從至少 20 m 高的地方、無阻力發射，讓球剛好落在 50.0 m 處（誤差 ±0.1 m）。', en: 'From at least 20 m up and without drag, land the ball at exactly 50.0 m (±0.1 m).' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'landed' && !d.drag && d.h0 >= 20 && Math.abs(d.R - 50) <= 0.1;
      }
    },
    {
      id: 'projectile-7', level: 7,
      title: { zh: '月球砲手', en: 'Moon gunner' },
      desc: { zh: '在月球上（g = 1.62）、地面發射、仰角 30°，讓球剛好落在 100.0 m 處（誤差 ±0.2 m）。', en: 'On the Moon (g = 1.62), from the ground at 30°, land the ball at exactly 100.0 m (±0.2 m).' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'landed' && !d.drag && same(d.g, 1.62) && d.h0 === 0 && Math.abs(d.theta - 30) < 0.05 && Math.abs(d.R - 100) <= 0.2;
      }
    },
    {
      id: 'projectile-8', level: 8,
      title: { zh: '阻力補償', en: 'Beat the drag' },
      desc: { zh: '同樣的仰角與重力下，打出兩發射程相等的球（誤差 0.5% 內）：一發有空氣阻力（k/m ≥ 0.005），一發沒有。', en: 'With the same angle and gravity, get two equal ranges (within 0.5%): one shot with air resistance (k/m ≥ 0.005) and one without.' },
      check: function (ev, mem) {
        if (ev.type !== 'landed') return false;
        const d = ev.data;
        if (d.R < 5) return false;
        return remember(mem, d).some(function (o) {
          if (o === d || !same(o.theta, d.theta) || !same(o.g, d.g) || !same(o.h0, d.h0)) return false;
          const a = d.drag ? d : o, b = d.drag ? o : d;
          return a.drag && !b.drag && a.k >= 0.005 && close(a.R, b.R, 0.005);
        });
      }
    },
    {
      id: 'projectile-9', level: 9,
      title: { zh: '高台雙解', en: 'Two solutions from a height' },
      desc: { zh: '從至少 15 m 高的地方、無阻力、初速相同，用兩個相差至少 15° 的仰角，讓球落在同一點（誤差 0.3% 內）。', en: 'From at least 15 m up, without drag and with the same launch speed, use two angles at least 15° apart to land on the same spot (within 0.3%).' },
      check: function (ev, mem) {
        if (ev.type !== 'landed') return false;
        const d = ev.data;
        if (d.drag || d.h0 < 15) return false;
        return remember(mem, d).some(function (o) {
          return o !== d && !o.drag && same(o.h0, d.h0) && same(o.v0, d.v0) && same(o.g, d.g) && Math.abs(o.theta - d.theta) >= 15 && close(o.R, d.R, 0.003);
        });
      }
    },
    {
      id: 'projectile-10', level: 10,
      title: { zh: '大師：逆風神射', en: 'Master: sharpshooter in the wind' },
      desc: { zh: '開啟空氣阻力（k/m ≥ 0.005）、地面發射，讓球剛好落在 120.0 m 處（誤差 ±0.1 m）。', en: 'With air resistance on (k/m ≥ 0.005) and launching from the ground, land the ball at exactly 120.0 m (±0.1 m).' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'landed' && d.drag && d.k >= 0.005 && d.h0 === 0 && Math.abs(d.R - 120) <= 0.1;
      }
    },
    // ---------- 隱藏任務：只給隱晦的提示 ----------
    {
      id: 'projectile-h1', level: 5, hidden: true,
      riddle: { zh: '向天空丟出的，終將回到你的手中。', en: 'What you throw to the sky comes back to your hand.' },
      check: function (ev) { const d = ev.data; return ev.type === 'landed' && d.R < 0.01 && d.T > 3 && d.h0 < 1e-9; }
    },
    {
      id: 'projectile-h2', level: 7, hidden: true,
      riddle: { zh: '換一片天空，千里之外也不遙遠。', en: 'Under a different sky, a thousand leagues is not so far.' },
      check: function (ev) { const d = ev.data; return ev.type === 'landed' && d.R >= (1 << 10) - 24; }
    },
    {
      id: 'projectile-h3', level: 9, hidden: true,
      riddle: { zh: '恰到好處的一段時光。', en: 'A stretch of time that is just right.' },
      check: function (ev) { const d = ev.data; return ev.type === 'landed' && Math.abs(d.T - 2 * 5) <= 1 / 100; }
    }
  ]);
})();
