/* missions/energy-coaster.js — 雲霄飛車與力學能守恆的任務（星星數 = 等級 1–10） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  // 事件（js/energy-coaster.js 發出；SI 單位，能量 J，位能零點 yref）。每個事件都附上目前的條件：
  //   { preset（'valley'|'twin'|'loop'|'jump'）, edited, mode（'rail'|'free'）, m, g, mu, yref, x0, v0,
  //     R（迴圈半徑；沒有迴圈為 null）, y0（出發點離地高度）, yLow（軌道最低點高度）, h0 = y0 − yLow,
  //     ya、xa（迴圈底部的高度與水平位置）, sig（軌道形狀的代號）, target（跳台標靶的 x；沒有為 null）}
  //   bottom：經過軌道最低點 { v, t, first（這一次第一次經過）, K, U, Q, E }
  //   loopTop：經過迴圈頂點 { v, nmg（頂點正向力 ÷ mg）}
  //   loopDone：繞完迴圈 { v, ntopMg（頂點正向力 ÷ mg）, nMinMg, loops（這一次繞完的圈數）}
  //   detach：自由小車因正向力降到 0 離開軌道 { x, y, v, inLoop, yRel（離迴圈底部的高度）, phi }
  //   leave：從軌道末端飛出 { x, y, v }
  //   attach：飛行後落回軌道 { x, y, vn（垂直軌道的速率）, flight（飛行時間 s）, inLoop, yRel }
  //   land：落到地面 { x, v, flight, fromEnd（從軌道末端飛出的）}
  //   stop：因摩擦停住 { x, y, slope, path（走過的路程）, hAboveLow, inLoop, phi, loopDone, bottomPassed, K, U, Q, E }
  //   refmove：移動位能零點之後 { from（這一次出發時的零點）, to, dRef, moving, K, U, Q, E }
  const PI = Math.PI;
  const near = function (a, b, tol) { return Math.abs(a - b) <= (tol == null ? 1e-9 : tol); };
  const remember = function (mem, key, item, n) {
    const list = mem[key] = mem[key] || [];
    list.push(item);
    while (list.length > (n || 16)) list.shift();
    return list;
  };

  LabMission.register('energy-coaster', [
    {
      id: 'energy-coaster-1', level: 1,
      title: { zh: '繞一圈', en: 'Loop the loop' },
      desc: { zh: '換成「圓形迴圈」軌道，讓小車完整繞過迴圈一圈。', en: 'Choose the “Circular loop” track and get the car all the way round the loop.' },
      check: function (ev) { return ev.type === 'loopDone'; }
    },
    {
      id: 'energy-coaster-2', level: 2,
      title: { zh: '零點隨你訂', en: 'Pick your own zero' },
      desc: { zh: '小車在跑的時候，把位能零點移動 5 m 以上，看哪些能量變了、哪些沒變。', en: 'While the car is moving, move the zero of potential energy by 5 m or more, and see which energies change and which do not.' },
      check: function (ev) { return ev.type === 'refmove' && ev.data.moving && Math.abs(ev.data.dRef) >= 5 - 1e-9; }
    },
    {
      id: 'energy-coaster-3', level: 2,
      title: { zh: '時速 54 公里', en: '54 kilometres an hour' },
      desc: { zh: '沒有摩擦、由靜止出發，讓小車經過最低點的速率是 15.0 m/s（誤差 1% 內）。', en: 'With no friction and starting from rest, make the car pass the lowest point at 15.0 m/s (within 1%).' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'bottom' && d.mu === 0 && d.v0 === 0 && Math.abs(d.v - 15) <= 0.15;
      }
    },
    {
      id: 'energy-coaster-4', level: 3,
      title: { zh: '月球上跳得比較遠？', en: 'Further on the Moon?' },
      desc: { zh: '同一條軌道、同一個出發點，沒有摩擦、由靜止出發，在兩個重力加速度相差 5 m/s² 以上的地方飛出軌道末端，兩次落地點相差不到 5 cm。', en: 'On the same track from the same starting point, with no friction and starting from rest, fly off the end of the track under two values of g that differ by at least 5 m/s², and land within 5 cm of the same spot.' },
      check: function (ev, mem) {
        if (ev.type !== 'land') return false;
        const d = ev.data;
        if (!d.fromEnd || d.mu !== 0 || d.v0 !== 0) return false;
        const ok = (mem.lands || []).some(function (o) {
          return o.sig === d.sig && near(o.x0, d.x0) && Math.abs(o.g - d.g) >= 5 - 1e-9 && Math.abs(o.x - d.x) <= 0.05;
        });
        remember(mem, 'lands', { sig: d.sig, x0: d.x0, g: d.g, x: d.x });
        return ok;
      }
    },
    {
      id: 'energy-coaster-5', level: 4,
      title: { zh: '地球與月球', en: 'Earth and Moon' },
      desc: { zh: '沒有摩擦、由靜止出發，分別在地球（g = 9.8）與月球（g = 1.62）讓小車以相同的速率（誤差 1% 內、至少 5 m/s）經過最低點。', en: 'With no friction and starting from rest, make the car pass the lowest point at the same speed (within 1%, at least 5 m/s) on Earth (g = 9.8) and on the Moon (g = 1.62).' },
      check: function (ev, mem) {
        if (ev.type !== 'bottom') return false;
        const d = ev.data;
        if (d.mu !== 0 || d.v0 !== 0 || d.v < 5) return false;
        const planet = near(d.g, 9.8) ? 'E' : near(d.g, 1.62) ? 'M' : '';
        if (!planet) return false;
        const ok = (mem.b || []).some(function (o) { return o.p !== planet && Math.abs(o.v - d.v) <= 0.01 * Math.max(o.v, d.v); });
        remember(mem, 'b', { p: planet, v: d.v });
        return ok;
      }
    },
    {
      id: 'energy-coaster-6', level: 5,
      title: { zh: '精準落點', en: 'Hit the target' },
      desc: { zh: '在「跳台」軌道上，讓小車從跳台末端飛出，落在綠色標靶上（離 26 m 不到 25 cm）。', en: 'On the “Ski jump” track, make the car fly off the end of the jump and land on the green target (within 25 cm of 26 m).' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'land' && d.fromEnd && d.target != null && Math.abs(d.x - d.target) <= 0.25;
      }
    },
    {
      id: 'energy-coaster-7', level: 6,
      title: { zh: '停在高台', en: 'Park on a high deck' },
      desc: { zh: '有摩擦時，讓小車先經過最低點，再停在比最低點高 5 m 以上、幾乎水平（坡度 3% 內）的地方。', en: 'With friction, make the car pass the lowest point and then come to rest at least 5 m above it, on a nearly level spot (slope within 3%).' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'stop' && d.mu > 0 && d.bottomPassed && d.hAboveLow >= 5 && Math.abs(d.slope) <= 0.03;
      }
    },
    {
      id: 'energy-coaster-8', level: 6,
      title: { zh: '一半變成熱', en: 'Half of it turned to heat' },
      desc: { zh: '位能零點放在地面（y0 = 0），讓小車先經過最低點再停住，而且停住時熱能恰好占總能的 50.0% ± 0.5%。', en: 'With the zero of potential energy on the ground (y0 = 0), make the car pass the lowest point and then stop, with the heat exactly 50.0% ± 0.5% of the total energy.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'stop' && near(d.yref, 0) && d.bottomPassed && d.E > 0 && Math.abs(d.Q / d.E - 0.5) <= 0.005;
      }
    },
    {
      id: 'energy-coaster-9', level: 7,
      title: { zh: '頂點失重', en: 'Weightless at the top' },
      desc: { zh: '沒有摩擦，讓「自由小車」繞完迴圈，而且在頂點時軌道幾乎沒有推它（正向力在 0 到 0.05 mg 之間）。', en: 'With no friction, get the “Free car” round the loop with the track hardly pushing it at the top (normal force between 0 and 0.05 mg).' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'loopDone' && d.mode === 'free' && d.mu === 0 && d.ntopMg > 0 && d.ntopMg <= 0.05;
      }
    },
    {
      id: 'energy-coaster-10', level: 8,
      title: { zh: '四分之三處離軌', en: 'Off at three quarters' },
      desc: { zh: '沒有摩擦，讓「自由小車」在迴圈裡離開軌道，離軌點的高度恰好是迴圈高度的 3/4（誤差在迴圈高度的 1.5% 內）。', en: 'With no friction, make the “Free car” leave the track inside the loop exactly three quarters of the way up (within 1.5% of the loop’s height).' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'detach' && d.inLoop && d.mode === 'free' && d.mu === 0 && d.R > 0 && Math.abs(d.yRel / (2 * d.R) - 0.75) <= 0.015;
      }
    },
    {
      id: 'energy-coaster-11', level: 9,
      title: { zh: '摩擦中的迴圈', en: 'A loop with friction' },
      desc: { zh: '動摩擦係數至少 0.05，讓「自由小車」繞完迴圈，頂點的正向力在 0 到 0.05 mg 之間。', en: 'With kinetic friction of at least 0.05, get the “Free car” round the loop with the normal force at the top between 0 and 0.05 mg.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'loopDone' && d.mode === 'free' && d.mu >= 0.05 - 1e-9 && d.ntopMg > 0 && d.ntopMg <= 0.05;
      }
    },
    {
      id: 'energy-coaster-12', level: 10,
      title: { zh: '雲霄飛車設計師', en: 'Coaster designer' },
      desc: { zh: '動摩擦係數至少 0.02，「自由小車」由靜止出發，繞完迴圈後停在比迴圈頂點還高、幾乎水平（坡度 3% 內）的地方。', en: 'With kinetic friction of at least 0.02, start the “Free car” from rest, get it round the loop, and bring it to rest higher than the top of the loop on a nearly level spot (slope within 3%).' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'stop' && d.mode === 'free' && d.mu >= 0.02 - 1e-9 && d.v0 === 0 && d.loopDone >= 1 && d.ya != null &&
          d.y >= d.ya + 2 * d.R - 1e-9 && Math.abs(d.slope) <= 0.03;
      }
    },
    // ---------- 隱藏任務：只給隱晦的提示 ----------
    {
      id: 'energy-coaster-h1', level: 5, hidden: true,
      riddle: { zh: '蝙蝠的午睡。', en: 'A bat’s afternoon nap.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'stop' && d.inLoop && d.mode === 'rail' && d.phi != null && Math.abs(d.phi - PI) <= 10 * PI / 180;
      }
    },
    {
      id: 'energy-coaster-h2', level: 3, hidden: true,
      riddle: { zh: '樣樣都在，加起來卻一無所有。', en: 'Everything is there, yet together it adds up to nothing.' },
      check: function (ev) {
        if (ev.type !== 'refmove' && ev.type !== 'bottom') return false;
        const d = ev.data, mg = d.m * d.g;
        return Math.abs(d.E) <= 0.01 * mg && d.K >= 0.05 * mg && Math.abs(d.U) >= 0.05 * mg;
      }
    },
    {
      id: 'energy-coaster-h3', level: 4, hidden: true,
      riddle: { zh: '有一整秒，世界忘了托住你。', en: 'For one whole second, the world forgot to hold you up.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'attach' && d.flight >= 1 && !(d.xa != null && Math.abs(d.x - d.xa) <= d.R + 0.01);
      }
    }
  ]);
})();
