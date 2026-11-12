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
      desc: { zh: '調整「初速 v0」與「仰角 θ」，讓水平射程超過 100 m。', en: 'Adjust “Launch speed v0” and “Launch angle θ” to get a range of more than 100 m.' },
      check: function (ev) { return ev.type === 'landed' && ev.data.R > 100; }
    },
    {
      id: 'projectile-3', level: 3,
      title: { zh: '同時落地', en: 'Same landing time' },
      desc: { zh: '「仰角 θ」設 0°、「發射高度 h0」至少 10 m、不加空氣阻力，從同一個高度水平拋出兩發，「初速 v0」相差至少 10 m/s，比較兩發的飛行時間。', en: 'Set “Launch angle θ” to 0° and “Launch height h0” to at least 10 m, with no air resistance, and throw twice horizontally from the same height with “Launch speed v0” values at least 10 m/s apart. Compare the two flight times.' },
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
      desc: { zh: '「發射高度 h0」= 0、不加空氣阻力、「初速 v0」不變，用兩個相差至少 10° 的「仰角 θ」打出射程相等的兩發（誤差 0.5% 內）。', en: 'With “Launch height h0” = 0, no air resistance and the same “Launch speed v0”, use two values of “Launch angle θ” at least 10° apart to get equal ranges (within 0.5%).' },
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
      desc: { zh: '「發射高度 h0」至少 10 m、不加空氣阻力，用射程最遠的「仰角 θ」打出一發（誤差 0.3° 內）。', en: 'With “Launch height h0” at least 10 m and no air resistance, launch at the “Launch angle θ” that gives the greatest range (within 0.3°).' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'landed' && !d.drag && d.h0 >= 10 && d.optTheta != null && Math.abs(d.theta - d.optTheta) <= 0.3;
      }
    },
    {
      id: 'projectile-6', level: 6,
      title: { zh: '精準落點', en: 'Pinpoint landing' },
      desc: { zh: '「發射高度 h0」至少 20 m、不加空氣阻力，讓球剛好落在 x = 50.0 m 處（誤差 ±0.1 m）。', en: 'With “Launch height h0” at least 20 m and no air resistance, land the ball at exactly x = 50.0 m (±0.1 m).' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'landed' && !d.drag && d.h0 >= 20 && Math.abs(d.R - 50) <= 0.1;
      }
    },
    {
      id: 'projectile-7', level: 7,
      title: { zh: '月球砲手', en: 'Moon gunner' },
      desc: { zh: '按「月球」（g = 1.62）、「發射高度 h0」= 0、「仰角 θ」= 30°、不加空氣阻力，讓球剛好落在 x = 100.0 m 處（誤差 ±0.2 m）。點滑桿旁的數字可以直接輸入。', en: 'Press “Moon” (g = 1.62), set “Launch height h0” = 0 and “Launch angle θ” = 30° with no air resistance, and land the ball at exactly x = 100.0 m (±0.2 m). Click the number next to a slider to type a value.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'landed' && !d.drag && same(d.g, 1.62) && d.h0 === 0 && Math.abs(d.theta - 30) < 0.05 && Math.abs(d.R - 100) <= 0.2;
      }
    },
    {
      id: 'projectile-8', level: 8,
      title: { zh: '阻力補償', en: 'Beat the drag' },
      desc: { zh: '仰角、重力與發射高度都相同，打出射程相等的兩發（誤差 0.5% 內）：一發勾選「加入空氣阻力」（「阻力係數 k/m」≥ 0.005），一發不加。', en: 'With the same launch angle, gravity and launch height, get two equal ranges (within 0.5%): one shot with “Add air resistance” ticked (“Drag coefficient k/m” ≥ 0.005) and one without.' },
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
      desc: { zh: '「發射高度 h0」至少 15 m、不加空氣阻力、「初速 v0」相同，用兩個相差至少 15° 的「仰角 θ」讓球落在同一點（誤差 0.3% 內）。', en: 'With “Launch height h0” at least 15 m, no air resistance and the same “Launch speed v0”, use two values of “Launch angle θ” at least 15° apart to land on the same spot (within 0.3%).' },
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
      desc: { zh: '勾選「加入空氣阻力」（「阻力係數 k/m」≥ 0.005）、「發射高度 h0」= 0，讓球剛好落在 x = 120.0 m 處（誤差 ±0.1 m）。點滑桿旁的數字可以直接輸入。', en: 'Tick “Add air resistance” (“Drag coefficient k/m” ≥ 0.005), set “Launch height h0” = 0, and land the ball at exactly x = 120.0 m (±0.1 m). Click the number next to a slider to type a value.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'landed' && d.drag && d.k >= 0.005 && d.h0 === 0 && Math.abs(d.R - 120) <= 0.1;
      }
    },
    {
      // R/H = 4 cot θ（地面發射、無阻力）→ R = H 時 tan θ = 4、θ ≈ 75.96°，和初速、重力都無關
      id: 'projectile-11', level: 5,
      title: { zh: '一樣高，一樣遠', en: 'As far as it is high' },
      desc: { zh: '「發射高度 h0」= 0、不加空氣阻力，調「仰角 θ」讓水平射程 R 等於最大高度 H（誤差 0.5% 內）。換個初速或星球再試，角度要變嗎？', en: 'With “Launch height h0” = 0 and no air resistance, adjust “Launch angle θ” until the range R equals the maximum height H (within 0.5%). Try another launch speed or planet: does the angle have to change?' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'landed' && !d.drag && d.h0 === 0 && d.R >= 1 && close(d.R, d.H, 0.005);
      }
    },
    {
      // 落點與飛行時間都相同 → 水平速度 v0 cos θ 相同（影子的運動完全一樣），只有鉛直運動不同
      id: 'projectile-12', level: 8,
      title: { zh: '殊途同歸', en: 'Different roads, same arrival' },
      desc: { zh: '不加空氣阻力、重力相同，從兩個相差至少 10 m 的「發射高度 h0」各發射一次，讓兩發的落點與飛行時間都相同（各在 0.3% 內，射程至少 5 m）。想一想：兩發在地面上的影子怎麼動？', en: 'With no air resistance and the same gravity, launch once from each of two “Launch height h0” values at least 10 m apart so that both shots land at the same spot after the same flight time (each within 0.3%, range at least 5 m). Think about it: how do the two shadows move along the ground?' },
      check: function (ev, mem) {
        if (ev.type !== 'landed') return false;
        const d = ev.data;
        if (d.drag || d.R < 5) return false;
        return remember(mem, d).some(function (o) {
          return o !== d && !o.drag && o.R >= 5 && same(o.g, d.g) && Math.abs(o.h0 - d.h0) >= 10 && close(o.R, d.R, 0.003) && close(o.T, d.T, 0.003);
        });
      }
    },
    // ---------- 隱藏任務：只給隱晦的提示 ----------
    {
      id: 'projectile-h1', level: 5, hidden: true,
      riddle: { zh: '繞了一大圈，終點就是起點。', en: 'After the long way round, the finish is the start.' },
      check: function (ev) { const d = ev.data; return ev.type === 'landed' && d.R < 0.01 && d.T > 3 && d.h0 < 1e-9; }
    },
    {
      id: 'projectile-h2', level: 7, hidden: true,
      riddle: { zh: '換一片天空，千里之外也不遙遠。', en: 'Under a different sky, a thousand leagues is not so far.' },
      check: function (ev) { const d = ev.data; return ev.type === 'landed' && d.R >= (1 << 10) - 24; }
    },
    {
      id: 'projectile-h3', level: 9, hidden: true,
      riddle: { zh: '在天空裡停留的時光，剛好夠你數完兩隻手的指頭。', en: 'Its time in the sky is exactly long enough to count every finger on both your hands.' },
      check: function (ev) { const d = ev.data; return ev.type === 'landed' && Math.abs(d.T - 2 * 5) <= 1 / 100; }
    }
  ]);
})();
