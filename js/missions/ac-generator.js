/* missions/ac-generator.js — 交流發電機與變壓器的任務（公開任務星星數 = 等級；隱藏任務 = 等級 × 2，由 LabMission.starsOf 計算） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  // 事件（js/ac-generator.js 回報；SI 單位：V、A、W、Ω、T、m、Hz、N·m）：
  //   'gen'：發電機模式，使用者操作之後送出：改參數、每轉完一圈、播放或暫停、拖曳線圈放開、用方向鍵轉線圈。
  //     { N, B, L, w, A, f, omega, R, r, open, commutator, epsMax, epsRms, epsAvgDC, VRrms, iRms, Pavg, PR, tauMax,
  //       theta（度，0–360）, paused, revs（參數不變下轉完的圈數）, mode: 'gen' }
  //   'xf'：變壓器模式，改參數、接通或切斷直流開關、直流暫態穩定時送出。
  //     { N1, N2, ratio, RL, source ('ac'|'gen'|'dc'), dc, f, V1, V2, I1, I2, P1, P2, Req, Bcore, sat,
  //       dcOn, steady（直流接通後已穩定）, pulsed（這次直流模式曾經接通過）, genF, genEpsRms, genR（接發電機時）, mode: 'xf' }
  //   'grid'：遠距輸電模式改參數時送出 { Vg, k1, k2, Rline, Prated, Vrated, Ru, VL, IL, drop, Vu, Pu, Ploss, Pg, eff, mode: 'grid' }
  //   'record'：按「記錄」 { mode, row, rows（同一模式的記錄，最新的在最後） }
  //   'clear'：全部清除
  const gen = function (ev) { return ev.type === 'gen' ? ev.data : null; };
  const xf = function (ev) { return ev.type === 'xf' ? ev.data : null; };
  const grid = function (ev) { return ev.type === 'grid' ? ev.data : null; };
  const rel = function (a, b, tol) { return Math.abs(a - b) <= tol * Math.abs(b); };
  const near = function (a, b, tol) { return Math.abs(a - b) <= tol; };
  const acSrc = function (d) { return d.source === 'ac' || d.source === 'gen'; };

  LabMission.register('ac-generator', [
    {
      id: 'ac-generator-1', level: 1,
      title: { zh: '一百伏特', en: 'One hundred volts' },
      desc: { zh: '發電機：調整匝數、磁場、線圈大小或頻率，讓電動勢的峰值 ε_max 剛好是 100 V（誤差 2 V 內）。', en: 'Generator: adjust the turns, the field, the coil size or the frequency so that the peak emf ε_max is 100 V (within 2 V).' },
      check: function (ev) { const d = gen(ev); return !!d && near(d.epsMax, 100, 2); }
    },
    {
      id: 'ac-generator-2', level: 2,
      title: { zh: '脈動直流', en: 'Pulsing DC' },
      desc: { zh: '發電機：把滑環換成換向器，接上燈泡（不要開路），讓 ε_max 至少 5 V，轉完一整圈。看示波器：外電路的電流還會反向嗎？', en: 'Generator: swap the slip rings for a commutator, keep the lamp connected (not an open circuit), make ε_max at least 5 V and let the coil turn one full revolution. On the scope, does the outside current still reverse?' },
      check: function (ev) { const d = gen(ev); return !!d && d.commutator && !d.open && d.revs >= 1 && d.epsMax >= 5; }
    },
    {
      id: 'ac-generator-3', level: 2,
      title: { zh: '升壓到 220 V', en: 'Step up to 220 V' },
      desc: { zh: '變壓器：交流電源 110 V（誤差 1% 內），調整兩組線圈的匝數，讓二次側電壓 V_2 是 220 V（誤差 1% 內），鐵心不能飽和。', en: 'Transformer: with a 110 V AC supply (within 1 %), choose the numbers of turns so that the secondary voltage V_2 is 220 V (within 1 %), without saturating the core.' },
      check: function (ev) { const d = xf(ev); return !!d && d.source === 'ac' && rel(d.V1, 110, 0.01) && rel(d.V2, 220, 0.01) && !d.sat; }
    },
    {
      id: 'ac-generator-4', level: 3,
      title: { zh: '磁通量為零的那一刻', en: 'The moment the flux is zero' },
      desc: { zh: '發電機：讓 ε_max 至少 1 V，然後把線圈停在磁通量為零的位置（θ 與 90° 或 270° 相差 2° 內）。此刻的電動勢是最大還是最小？', en: 'Generator: make ε_max at least 1 V, then stop the coil where the flux is zero (θ within 2° of 90° or 270°). Is the emf largest or smallest at this moment?' },
      check: function (ev) {
        const d = gen(ev);
        return !!d && d.paused && d.epsMax >= 1 && (near(d.theta, 90, 2) || near(d.theta, 270, 2));
      }
    },
    {
      id: 'ac-generator-5', level: 4,
      title: { zh: '電池不能變壓', en: 'A battery cannot be transformed' },
      desc: { zh: '變壓器：把電源換成電池，按「接通開關」，一直等到磁通量穩定。二次側電壓只在什麼時候不是零？', en: 'Transformer: switch the supply to a battery, close the switch and wait until the flux is steady. When is the secondary voltage not zero?' },
      check: function (ev) { const d = xf(ev); return !!d && d.dc && d.dcOn && d.steady && d.pulsed; }
    },
    {
      id: 'ac-generator-6', level: 4,
      title: { zh: '冷次定律的阻力', en: 'Lenz’s drag' },
      desc: { zh: '發電機：接上至少 10 Ω 的燈泡，讓轉動線圈需要的外力矩峰值 τ_max 至少 5 N·m。哪些參數會讓線圈更難轉？', en: 'Generator: with a lamp of at least 10 Ω connected, make the peak driving torque τ_max at least 5 N·m. Which settings make the coil harder to turn?' },
      check: function (ev) { const d = gen(ev); return !!d && !d.open && d.R >= 10 && d.tauMax >= 5; }
    },
    {
      id: 'ac-generator-7', level: 5,
      title: { zh: '臺灣的家用電', en: 'Taiwan’s mains' },
      desc: { zh: '發電機（滑環）：頻率 60 Hz，接上燈泡，讓燈泡兩端電壓的有效值 V_R 是 110 V（誤差 1% 內）。別忘了線圈本身也有電阻 r。', en: 'Generator (slip rings): at 60 Hz, with the lamp connected, make the rms voltage across the lamp V_R equal to 110 V (within 1 %). Remember that the coil has a resistance r of its own.' },
      check: function (ev) { const d = gen(ev); return !!d && !d.commutator && !d.open && near(d.f, 60, 0.1) && rel(d.VRrms, 110, 0.01); }
    },
    {
      id: 'ac-generator-8', level: 5,
      title: { zh: '12 V 燈泡', en: 'A 12 V bulb' },
      desc: { zh: '變壓器：用 110 V 交流電源（誤差 1% 內）點亮一個 12 V、24 W 的燈泡：V_2 是 12 V（誤差 2% 內）、P_2 是 24 W（誤差 3% 內），鐵心不能飽和。負載電阻要多大？', en: 'Transformer: run a 12 V, 24 W bulb from a 110 V AC supply (within 1 %): V_2 = 12 V (within 2 %) and P_2 = 24 W (within 3 %), without saturating the core. What load resistance do you need?' },
      check: function (ev) { const d = xf(ev); return !!d && d.source === 'ac' && rel(d.V1, 110, 0.01) && rel(d.V2, 12, 0.02) && rel(d.P2, 24, 0.03) && !d.sat; }
    },
    {
      id: 'ac-generator-9', level: 6,
      title: { zh: '送到家門口', en: 'To the front door' },
      desc: { zh: '遠距輸電：用戶額定 110 V，讓用戶實際得到的電壓 V_u 是 110 V（誤差 2% 內），而且輸電效率至少 95%。', en: 'Power line: with users rated at 110 V, deliver V_u = 110 V (within 2 %) at a transmission efficiency of at least 95 %.' },
      check: function (ev) { const d = grid(ev); return !!d && d.Vrated === 110 && rel(d.Vu, 110, 0.02) && d.eff >= 0.95; }
    },
    {
      id: 'ac-generator-10', level: 8,
      title: { zh: '線損剩四分之一', en: 'A quarter of the loss' },
      desc: { zh: '遠距輸電：發電機電壓與輸電線電阻都不變，先記錄一筆，再把升壓比 k_1 加倍（誤差 0.05 內）並調整降壓比，讓用戶功率差不到 2%，再記錄一筆。第二筆的線損要是第一筆的 22%–26%。', en: 'Power line: keep the generator voltage and the line resistance fixed. Record one row, then double the step-up ratio k_1 (within 0.05) and adjust the step-down ratio so the users’ power changes by less than 2 %, and record again. The second row’s line loss must be 22 %–26 % of the first.' },
      check: function (ev) {
        if (ev.type !== 'record' || ev.data.mode !== 'grid') return false;
        const rows = ev.data.rows || [];
        if (rows.length < 2) return false;
        const b = rows[rows.length - 1];
        for (let i = 0; i < rows.length - 1; i++) {
          const a = rows[i];
          if (!(a.Ploss > 0) || !rel(a.Rline, b.Rline, 1e-9) || !rel(a.Vg, b.Vg, 1e-9) || !rel(b.Pu, a.Pu, 0.02)) continue;
          const k = b.k1 / a.k1, q = b.Ploss / a.Ploss;
          if (near(k, 2, 0.05) && q >= 0.22 && q <= 0.26) return true;
        }
        return false;
      }
    },
    {
      id: 'ac-generator-11', level: 9,
      title: { zh: '發電機直接供電', en: 'Straight from the generator' },
      desc: { zh: '變壓器的電源選「發電機」：發電機頻率 60 Hz，讓二次側電壓 V_2 是 220 V（誤差 1% 內）、負載功率 P_2 至少 500 W，鐵心不能飽和。發電機線圈的電阻 r 也會分走電壓。', en: 'Feed the transformer from the generator: at 60 Hz, make the secondary voltage V_2 = 220 V (within 1 %) with a load power P_2 of at least 500 W, without saturating the core. The generator’s own resistance r takes part of the voltage too.' },
      check: function (ev) { const d = xf(ev); return !!d && d.source === 'gen' && near(d.genF, 60, 0.1) && rel(d.V2, 220, 0.01) && d.P2 >= 500 && !d.sat; }
    },
    {
      id: 'ac-generator-12', level: 10,
      title: { zh: '超高壓輸電', en: 'Extra-high voltage' },
      desc: { zh: '遠距輸電：輸電線電阻至少 10 Ω，把送電電壓升到 345 kV（誤差 1% 內），送出至少 50 MW 給額定 220 V 的用戶，用戶電壓 220 V（誤差 1% 內），而且效率至少 99.5%。', en: 'Power line: with a line resistance of at least 10 Ω, step the line voltage up to 345 kV (within 1 %) and deliver at least 50 MW to users rated at 220 V, at 220 V (within 1 %), with an efficiency of at least 99.5 %.' },
      check: function (ev) {
        const d = grid(ev);
        return !!d && d.Rline >= 10 && rel(d.VL, 345e3, 0.01) && d.Vrated === 220 && rel(d.Vu, 220, 0.01) && d.Pu >= 50e6 && d.eff >= 0.995;
      }
    },
    {
      id: 'ac-generator-h1', level: 4, hidden: true,
      riddle: { zh: '沒有人聆聽的歌，唱再久也不費力氣。', en: 'A song that no one listens to costs nothing to sing, however long it goes on.' },
      check: function (ev) { const d = gen(ev); return !!d && d.open && d.revs >= 1 && d.epsMax >= 100; }
    },
    {
      id: 'ac-generator-h2', level: 3, hidden: true,
      riddle: { zh: '隔著一道沉默的鐵，對岸聽見的，一字不差。', en: 'Across a wall of silent iron, the far shore hears every word unchanged.' },
      check: function (ev) { const d = xf(ev); return !!d && acSrc(d) && d.N1 === d.N2 && d.V2 >= 1 && !d.sat; }
    },
    {
      id: 'ac-generator-h3', level: 6, hidden: true,
      riddle: { zh: '門外與門內一樣沉重的時候，送出門的最多。', en: 'When the load outside weighs the same as the load within, the most goes out the door.' },
      check: function (ev) { const d = gen(ev); return !!d && !d.open && d.r > 0 && near(d.R / d.r, 1, 0.02) && d.PR >= 10; }
    }
  ]);
})();
