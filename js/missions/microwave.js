/* missions/microwave.js — 認識電磁波（微波實驗）的任務（星星數 = 等級 1–10） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  const rec = function (ev, mode) { return ev.type === 'record' && ev.data.mode === mode && ev.data.row; };
  const rel = function (a, b, r) { return Math.abs(a - b) <= r * Math.abs(b); };
  const sameF = function (a, b) { return Math.abs(a.fTrue - b.fTrue) < 1e-9; };
  const mean = function (a) { let s = 0; a.forEach(function (x) { s += x; }); return s / a.length; };
  const near = function (a, b, tol) { return Math.abs(a - b) <= tol; };

  LabMission.register('microwave', [
    {
      id: 'microwave-1', level: 1,
      title: { zh: '第一筆反射數據', en: 'First reflection reading' },
      desc: { zh: '在實驗一裝上金屬板，轉動接收臂後按「記錄」，記下第一筆反射的數據。', en: 'In Part 1 put the metal plate in place, swing the receiver arm and press “Record” for your first reflection reading.' },
      check: function (ev) { return !!rec(ev, 'reflect'); }
    },
    {
      id: 'microwave-2', level: 2,
      title: { zh: '找到最強的方向', en: 'The strongest direction' },
      desc: { zh: '實驗一：在任何一個入射角下，把接收臂轉到讀數最大的位置再記錄（與真正的最大值相差 1.5° 以內）。', en: 'Part 1: at any angle of incidence, record with the receiver arm at the largest reading (within 1.5° of the true maximum).' },
      check: function (ev) { const r = rec(ev, 'reflect'); return !!r && near(r.psi, r.psiPeak, 1.5); }
    },
    {
      id: 'microwave-3', level: 3,
      title: { zh: '完整的反射表', en: 'The full reflection table' },
      desc: { zh: '實驗一：入射角 20°、30°、40°、50°、60°、70°、80° 各記錄一筆，每一筆都在讀數最大的位置附近（3° 以內）。', en: 'Part 1: record a row at each angle of incidence 20°, 30°, 40°, 50°, 60°, 70° and 80°, each near the largest reading (within 3°).' },
      check: function (ev) {
        if (!rec(ev, 'reflect')) return false;
        const rows = ev.data.rows;
        return [20, 30, 40, 50, 60, 70, 80].every(function (a) {
          return rows.some(function (r) { return near(r.thetaI, a, 0.01) && near(r.psi, r.psiPeak, 3); });
        });
      }
    },
    {
      id: 'microwave-4', level: 4,
      title: { zh: '量出波長', en: 'Measure the wavelength' },
      desc: { zh: '實驗三：從一個波節數到第 5 個波節，記錄起點與終點，算出的波長與真正的波長相差 2% 以內。', en: 'Part 3: count from one node to the 5th node, record the start and the end, and get a wavelength within 2% of the true one.' },
      check: function (ev) { const r = rec(ev, 'standing'); return !!r && r.N === 5 && rel(r.lam, r.lamTrue, 0.02); }
    },
    {
      id: 'microwave-5', level: 4,
      title: { zh: '偏振的證據', en: 'Evidence of polarization' },
      desc: { zh: '實驗四：柵 1 隙縫水平（0°）、接收器不轉，柵 2 在 0°、30°、45°、60°、90° 各記錄一筆（距離與靈敏度都不變）。', en: 'Part 4: with grid 1’s slits horizontal (0°) and the receiver not turned, record grid 2 at 0°, 30°, 45°, 60° and 90° (same distance and sensitivity).' },
      check: function (ev) {
        const r = rec(ev, 'polar');
        if (!r) return false;
        const ok = ev.data.rows.filter(function (x) {
          return x.g1on && near(x.g1, 0, 0.01) && x.g2on && near(x.rx, 0, 0.01) && near(x.d, r.d, 0.005) && Math.abs(x.sens - r.sens) < 1e-6 && x.err === r.err;
        });
        return [0, 30, 45, 60, 90].every(function (a) { return ok.some(function (x) { return near(x.g2, a, 0.01); }); });
      }
    },
    {
      id: 'microwave-6', level: 5,
      title: { zh: '稜鏡的折射率', en: 'Refractive index of the prism' },
      desc: { zh: '實驗二：用聚苯乙烯或石蠟稜鏡，找到讀數最大的方向並記錄，算出的折射率與公認值相差 3% 以內。', en: 'Part 2: with the polystyrene or paraffin prism, record at the direction of the largest reading and get n within 3% of the accepted value.' },
      check: function (ev) { const r = rec(ev, 'refract'); return !!r && !r.unknown && rel(r.n, r.nAcc, 0.03); }
    },
    {
      id: 'microwave-7', level: 6,
      title: { zh: '算出頻率', en: 'Work out the frequency' },
      desc: { zh: '實驗三：同一個發射器做滿 5 次，平均波長算出的頻率 f = c／λ 與發射器的頻率相差 1% 以內。', en: 'Part 3: with the same transmitter take 5 rows; the frequency f = c/λ from the mean wavelength must be within 1% of the transmitter’s.' },
      check: function (ev) {
        const r = rec(ev, 'standing');
        if (!r) return false;
        const rows = ev.data.rows.filter(function (x) { return sameF(x, r); });
        if (rows.length < 5) return false;
        const f = 29.9792458 / mean(rows.map(function (x) { return x.lam; }));
        return rel(f, r.fTrue, 0.01);
      }
    },
    {
      id: 'microwave-8', level: 7,
      title: { zh: '讀數減半', en: 'Half the reading' },
      desc: { zh: '實驗四：柵 1 在 0°、接收器不轉，先在柵 2 = 0° 記錄 I0，再把柵 2 轉到讓讀數剛好變成一半的角度並記錄（I／I0 在 0.47～0.53 之間）。', en: 'Part 4: with grid 1 at 0° and the receiver not turned, record I0 with grid 2 at 0°, then turn grid 2 to the angle where the reading is exactly halved and record (I/I0 between 0.47 and 0.53).' },
      check: function (ev) {
        const r = rec(ev, 'polar');
        return !!r && r.g1on && near(r.g1, 0, 0.01) && r.g2on && near(r.rx, 0, 0.01) && r.g2 > 5 && r.ratio != null && r.ratio >= 0.47 && r.ratio <= 0.53;
      }
    },
    {
      id: 'microwave-9', level: 7,
      title: { zh: '未知材料', en: 'The unknown material' },
      desc: { zh: '實驗二：選「未知材料」，揭曉之前至少記錄 2 筆，平均折射率與真正的值相差 2.5% 以內。', en: 'Part 2: choose “Unknown”; before revealing it, record at least 2 rows whose mean n is within 2.5% of the true value.' },
      check: function (ev) {
        const r = rec(ev, 'refract');
        if (!r || !r.unknown || r.revealed) return false;
        const rows = ev.data.rows.filter(function (x) { return x.unknown && !x.revealed && Math.abs(x.nAcc - r.nAcc) < 1e-9; });
        return rows.length >= 2 && rel(mean(rows.map(function (x) { return x.n; })), r.nAcc, 0.025);
      }
    },
    {
      id: 'microwave-10', level: 8,
      title: { zh: '未知的發射器', en: 'The mystery transmitter' },
      desc: { zh: '實驗三：選「未知」頻率，揭曉之前至少做 3 次，由平均波長算出的頻率與真正的頻率相差 0.7% 以內。', en: 'Part 3: choose the “Unknown” frequency; before revealing it, take at least 3 rows whose mean wavelength gives a frequency within 0.7% of the true one.' },
      check: function (ev) {
        const r = rec(ev, 'standing');
        if (!r || !r.unknown || r.revealed) return false;
        const rows = ev.data.rows.filter(function (x) { return x.unknown && !x.revealed && sameF(x, r); });
        if (rows.length < 3) return false;
        const f = 29.9792458 / mean(rows.map(function (x) { return x.lam; }));
        return rel(f, r.fTrue, 0.007);
      }
    },
    {
      id: 'microwave-11', level: 9,
      title: { zh: '含誤差也準確', en: 'Accurate despite the errors' },
      desc: { zh: '實驗三選「含誤差」：同一個發射器至少做 5 次，由平均波長算出的頻率與發射器的頻率相差 0.7% 以內。', en: 'Part 3 with “With errors”: take at least 5 rows with the same transmitter; the frequency from the mean wavelength must be within 0.7% of the transmitter’s.' },
      check: function (ev) {
        const r = rec(ev, 'standing');
        if (!r || !r.err) return false;
        const rows = ev.data.rows.filter(function (x) { return x.err && sameF(x, r); });
        if (rows.length < 5) return false;
        const f = 29.9792458 / mean(rows.map(function (x) { return x.lam; }));
        return rel(f, r.fTrue, 0.007);
      }
    },
    {
      id: 'microwave-12', level: 10,
      title: { zh: '大師：千分之三', en: 'Master: three parts in a thousand' },
      desc: { zh: '實驗三選「含誤差」：至少做 5 次、每次都數 8 個以上的波節，平均波長與真正的波長相差 0.3% 以內。', en: 'Part 3 with “With errors”: take at least 5 rows, each across 8 or more nodes, with a mean wavelength within 0.3% of the true one.' },
      check: function (ev) {
        const r = rec(ev, 'standing');
        if (!r || !r.err) return false;
        const rows = ev.data.rows.filter(function (x) { return x.err && x.N >= 8 && sameF(x, r); });
        return rows.length >= 5 && rel(mean(rows.map(function (x) { return x.lam; })), r.lamTrue, 0.003);
      }
    },
    // ---------- 隱藏任務：只給隱晦的提示 ----------
    {
      id: 'microwave-h1', level: 5, hidden: true,
      riddle: { zh: '正面走不通的路，側身反而過得去。', en: 'The road that is closed head-on opens when you turn sideways.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'state' && d.mode === 'polar' && near(d.rx, 90, 2) && (d.g1on || d.g2on) && d.amp2 >= 0.2;
      }
    },
    {
      id: 'microwave-h2', level: 4, hidden: true,
      riddle: { zh: '倒立看世界，世界一點也沒變。', en: 'Stand on your head: the world has not changed at all.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'state' && d.mode === 'polar' && near(d.rx, 180, 1) && d.amp2 >= 0.8;
      }
    },
    {
      id: 'microwave-h3', level: 6, hidden: true,
      riddle: { zh: '牆的背後，仍聽得見細細的耳語。', en: 'Behind the wall, a faint whisper can still be heard.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'state' && d.mode === 'reflect' && d.plate && d.shadow && d.psi >= 170 && d.reading >= 0.15 && !d.over;
      }
    }
  ]);
})();
