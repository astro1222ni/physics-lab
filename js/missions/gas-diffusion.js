/* missions/gas-diffusion.js — 氣體擴散與逸散（格雷厄姆定律）的任務（星星數 = 等級 1–10；隱藏任務 = 等級 × 2） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  // 事件（js/gas-diffusion.js 只在使用者按過「開始」之後回報）：
  //   'ring'：白煙環出現 { base, acid, unknown, model, L, T, frac, x, t, ratio, graham, DA, DB, earlier: [同一段紀錄中較早的白煙環] }
  //   'effuse'：兩個容器都降到一半 { A, B, MA, MB, TA, TB, d, P0, tA, tB, ratio（t_B/t_A）, Kn, unknown, earlier: [同一段紀錄中較早的逸散] }
  //   'answer'：未知氣體按「核對答案」{ kind（'X'／'HX'）, ans, err, tries, nMeas, revealed }
  const rg = function (ev) { return ev.type === 'ring' && ev.data ? ev.data : null; };
  const ef = function (ev) { return ev.type === 'effuse' && ev.data ? ev.data : null; };
  const an = function (ev) { return ev.type === 'answer' && ev.data ? ev.data : null; };
  const near = function (a, b, tol) { return a != null && b != null && isFinite(a) && isFinite(b) && Math.abs(a - b) <= tol * Math.abs(b); };
  const big = function (r) { return r >= 1 ? r : 1 / r; };          // 時間比不分先後：一律取大於 1 的那一個
  const pair = function (d, a, b) { return (d.A === a && d.B === b) || (d.A === b && d.B === a); };
  const sameT = function (d) { return Math.abs(d.TA - d.TB) < 0.05; };
  const known = function (d) { return d && !d.unknown && d.MA != null && d.MB != null; };
  const earlier = function (d) { return d && Array.isArray(d.earlier) ? d.earlier : []; };
  const samePairRing = function (a, b) { return a.base === b.base && a.acid === b.acid && !a.unknown && !b.unknown; };
  const MM = { NH3: 17.031, CH3NH2: 31.058, HCl: 36.458, HBr: 80.912, HNO3: 63.012, HI: 127.908 };
  const G_M = function (id) { return MM[id] || 0; };
  const solved = function (d, kind, tol) { return !!d && d.kind === kind && !d.revealed && d.nMeas >= 1 && d.err != null && d.err <= tol; };

  LabMission.register('gas-diffusion', [
    {
      id: 'gas-diffusion-1', level: 1,
      title: { zh: '白煙出現了', en: 'There is the smoke' },
      desc: { zh: '按「開始」，等兩種氣體在管中相遇，看到白煙環。', en: 'Press “Start” and wait for the two gases to meet in the tube and form the white ring.' },
      check: function (ev) { return !!rg(ev); }
    },
    {
      id: 'gas-diffusion-2', level: 2,
      title: { zh: '比較慢的酸', en: 'A slower acid' },
      desc: { zh: '左端用氨，右端換一種比氯化氫更重的酸，讓白煙環出現在距氨端 62% 管長以外的地方。', en: 'Keep ammonia on the left, use an acid heavier than hydrogen chloride on the right, and make the ring form more than 62% of the tube length from the ammonia end.' },
      check: function (ev) { const d = rg(ev); return !!d && d.base === 'NH3' && ['HBr', 'HI', 'HNO3'].indexOf(d.acid) >= 0 && d.frac >= 0.62; }
    },
    {
      id: 'gas-diffusion-3', level: 3,
      title: { zh: '格雷厄姆的四倍', en: "Graham's factor of four" },
      desc: { zh: '在逸散實驗中比較氫和氧（同一溫度），量出兩者的半衰時間比，等於 √(32/2) 的 0.5% 以內。', en: 'In the effusion experiment compare hydrogen and oxygen at the same temperature and measure a half-time ratio within 0.5% of √(32/2).' },
      check: function (ev) { const d = ef(ev); return !!d && pair(d, 'H2', 'O2') && sameT(d) && near(big(d.ratio), 3.984, 0.005); }
    },
    {
      id: 'gas-diffusion-4', level: 3,
      title: { zh: '熱一點快一點', en: 'Warmer is faster' },
      desc: { zh: '同一對氣體、同一模型、同一管長，溫度相差 40 K 以上各做一次：較熱的白煙環比較早出現，但位置幾乎不變（相差不到管長的 0.1%）。', en: 'With the same gases, model and tube length, run twice at temperatures at least 40 K apart: the warmer ring appears sooner, but in almost the same place (less than 0.1% of the tube apart).' },
      check: function (ev) {
        const d = rg(ev);
        return !!d && earlier(d).some(function (e) {
          return e.base === d.base && e.acid === d.acid && e.model === d.model && Math.abs(e.L - d.L) < 0.05 && Math.abs(e.T - d.T) >= 40 &&
            (e.T > d.T ? e.t < d.t : d.t < e.t) && Math.abs(e.frac - d.frac) < 0.001;
        });
      }
    },
    {
      id: 'gas-diffusion-5', level: 4,
      title: { zh: '管子加長一倍', en: 'Twice the tube' },
      desc: { zh: '同一對氣體、同一模型、同一溫度，把管長改成另一次的 2 倍，讓白煙環出現的時間變成 4 倍（誤差 2% 以內）。', en: 'With the same gases, model and temperature, make the tube twice as long as in another run so that the ring takes four times as long to appear (within 2%).' },
      check: function (ev) {
        const d = rg(ev);
        return !!d && earlier(d).some(function (e) {
          if (e.base !== d.base || e.acid !== d.acid || e.model !== d.model || Math.abs(e.T - d.T) > 0.05) return false;
          const a = d.L >= e.L ? d : e, b = d.L >= e.L ? e : d;
          return near(a.L / b.L, 2, 0.01) && near(a.t / b.t, 4, 0.02);
        });
      }
    },
    {
      id: 'gas-diffusion-6', level: 4,
      title: { zh: '甲胺換氨', en: 'Swap in methylamine' },
      desc: { zh: '同一種酸、同一模型，左端分別用氨和甲胺各做一次，讓甲胺的白煙環比氨的更靠近左端至少 5% 管長。', en: 'With the same acid and model, run once with ammonia and once with methylamine on the left, so that the methylamine ring is at least 5% of the tube length closer to the left end.' },
      check: function (ev) {
        const d = rg(ev);
        if (!d || d.unknown) return false;
        return earlier(d).some(function (e) {
          if (e.acid !== d.acid || e.model !== d.model || e.base === d.base || e.unknown) return false;
          const m = d.base === 'CH3NH2' ? d : e, n = d.base === 'CH3NH2' ? e : d;
          return n.base === 'NH3' && n.frac - m.frac >= 0.05;
        });
      }
    },
    {
      id: 'gas-diffusion-7', level: 5,
      title: { zh: '空氣擋了路', en: 'The air gets in the way' },
      desc: { zh: '同一對氣體、同一管長與溫度，分別用「格雷厄姆（理想）」和「在空氣中擴散」各做一次，兩個白煙環相差 2% 管長以上。', en: 'With the same gases, tube length and temperature, run once with “Graham (ideal)” and once with “Diffusion in air”, with the two rings at least 2% of the tube length apart.' },
      check: function (ev) {
        const d = rg(ev);
        return !!d && !d.unknown && earlier(d).some(function (e) {
          return samePairRing(e, d) && e.model !== d.model && Math.abs(e.L - d.L) < 0.05 && Math.abs(e.T - d.T) < 0.05 && Math.abs(e.frac - d.frac) >= 0.02;
        });
      }
    },
    {
      id: 'gas-diffusion-8', level: 5,
      title: { zh: '孔大小不改比例', en: 'Hole size does not change the ratio' },
      desc: { zh: '同一對氣體、同樣的溫度，孔徑相差 2 倍以上各做一次逸散：半衰時間變了，時間比卻相差不到 0.5%。', en: 'With the same pair of gases and the same temperatures, run the effusion twice with hole diameters at least 2 times apart: the half-times change, but their ratio changes by less than 0.5%.' },
      check: function (ev) {
        const d = ef(ev);
        return known(d) && d.A !== d.B && earlier(d).some(function (e) {
          return !e.unknown && e.A === d.A && e.B === d.B && Math.abs(e.TA - d.TA) < 0.05 && Math.abs(e.TB - d.TB) < 0.05 &&
            Math.max(e.d, d.d) / Math.min(e.d, d.d) >= 2 - 1e-9 && near(d.ratio, e.ratio, 0.005);
        });
      }
    },
    {
      id: 'gas-diffusion-9', level: 6,
      title: { zh: '冷熱逸散', en: 'Hot and cold effusion' },
      desc: { zh: '兩個容器裝同一種氣體，一個的絕對溫度是另一個的 2 倍以上，量出半衰時間比等於 √(T 比)（誤差 0.5% 以內）。', en: 'Fill both containers with the same gas, one at least twice the absolute temperature of the other, and measure a half-time ratio equal to √(temperature ratio) within 0.5%.' },
      check: function (ev) {
        const d = ef(ev);
        if (!known(d) || d.A !== d.B) return false;
        const tr = Math.max(d.TA, d.TB) / Math.min(d.TA, d.TB);
        return tr >= 2 - 1e-9 && near(big(d.ratio), Math.sqrt(tr), 0.005);
      }
    },
    {
      id: 'gas-diffusion-10', level: 6,
      title: { zh: '未知氣體 X', en: 'Unknown gas X' },
      desc: { zh: '在逸散模式按「開始挑戰」，在揭曉答案之前算出 X 的莫耳質量，誤差在 5% 以內。', en: 'In effusion mode press “Start the challenge” and, before revealing the answer, work out the molar mass of X to within 5%.' },
      check: function (ev) { return solved(an(ev), 'X', 0.05); }
    },
    {
      id: 'gas-diffusion-11', level: 8,
      title: { zh: '未知氣體：精準', en: 'Unknown gas: precisely' },
      desc: { zh: '在揭曉答案之前算出未知氣體 X 的莫耳質量，誤差在 1% 以內。', en: 'Before revealing the answer, work out the molar mass of unknown gas X to within 1%.' },
      check: function (ev) { return solved(an(ev), 'X', 0.01); }
    },
    {
      id: 'gas-diffusion-12', level: 9,
      title: { zh: '未知的酸', en: 'The unknown acid' },
      desc: { zh: '在擴散模式按「開始挑戰」，在揭曉答案之前用白煙環的位置算出 HX 的莫耳質量，誤差在 3% 以內。', en: 'In diffusion mode press “Start the challenge” and, before revealing the answer, use the position of the ring to work out the molar mass of HX to within 3%.' },
      check: function (ev) { return solved(an(ev), 'HX', 0.03); }
    },
    {
      id: 'gas-diffusion-h1', level: 3, hidden: true,
      riddle: { zh: '名字不一樣的兩位旅人，在同一秒走出同一種門。', en: 'Two travellers with different names step through the same kind of door in the same second.' },
      check: function (ev) { const d = ef(ev); return known(d) && sameT(d) && (pair(d, 'N2', 'CO') || pair(d, 'CO2', 'N2O')) && Math.abs(d.ratio - 1) <= 0.0005; }
    },
    {
      id: 'gas-diffusion-h2', level: 4, hidden: true,
      riddle: { zh: '同名的兄弟，一個多背了一顆小石子；落後的比例，是正方形的對角線。', en: 'Brothers of the same name, one carrying an extra pebble; he falls behind by the diagonal of a square.' },
      check: function (ev) { const d = ef(ev); return known(d) && sameT(d) && pair(d, 'H2', 'D2') && near(big(d.ratio), Math.SQRT2, 0.002); }
    },
    {
      id: 'gas-diffusion-h3', level: 4, hidden: true,
      riddle: { zh: '空氣裡住著一位懶惰的房客，一個小孔讓它露了餡。', en: 'A lazy lodger lives in the air; a tiny hole gives it away.' },
      check: function (ev) { const d = ef(ev); return known(d) && sameT(d) && pair(d, 'N2', 'Ar'); }
    },
    {
      id: 'gas-diffusion-h4', level: 5, hidden: true,
      riddle: { zh: '一臂半的路，走完一整個鐘頭。', en: 'An arm and a half of road, a whole hour to walk it.' },
      check: function (ev) { const d = rg(ev); return !!d && d.L >= 149.5 && d.t >= 3600; }
    },
    {
      id: 'gas-diffusion-h5', level: 6, hidden: true,
      riddle: { zh: '最輕的與最重的賽跑，終點線前差了十倍以上。', en: 'The lightest races the heaviest; at the finish line they are more than ten times apart.' },
      check: function (ev) { const d = ef(ev); return known(d) && sameT(d) && big(d.ratio) >= 10; }
    },
    {
      id: 'gas-diffusion-h6', level: 6, hidden: true,
      riddle: { zh: '課本的答案和空氣的答案，在最重的那位身上吵得最兇。', en: 'The textbook answer and the air’s answer quarrel hardest over the heaviest one.' },
      check: function (ev) {
        const d = rg(ev);
        return !!d && !d.unknown && earlier(d).some(function (e) {
          return d.acid === 'HI' && samePairRing(e, d) && e.model !== d.model && Math.abs(e.L - d.L) < 0.05 && Math.abs(e.T - d.T) < 0.05 && Math.abs(e.frac - d.frac) >= 0.09;
        });
      }
    },
    {
      id: 'gas-diffusion-h7', level: 7, hidden: true,
      riddle: { zh: '一座巨大的工廠，只為了千分之四。', en: 'An enormous factory, built for four parts in a thousand.' },
      check: function (ev) { const d = ef(ev); return known(d) && sameT(d) && pair(d, 'UF6a', 'UF6b') && Math.abs(big(d.ratio) - 1.0043) <= 0.0005; }
    },
    {
      id: 'gas-diffusion-h8', level: 8, hidden: true,
      riddle: { zh: '火爐旁的胖子，和冰箱旁的瘦子，同時到家。', en: 'The stout one by the stove and the slim one by the fridge get home at the same moment.' },
      check: function (ev) {
        const d = ef(ev);
        return known(d) && d.A !== d.B && Math.max(d.MA, d.MB) / Math.min(d.MA, d.MB) >= 1.01 && Math.abs(d.TA - d.TB) >= 1 && Math.abs(d.ratio - 1) <= 0.003;
      }
    },
    {
      id: 'gas-diffusion-h9', level: 9, hidden: true,
      riddle: { zh: '路長了，腳也熱了，鐘聲卻同時響起。', en: 'The road grew longer, the feet grew warmer, and the bell rang at the same time.' },
      check: function (ev) {
        const d = rg(ev);
        return !!d && earlier(d).some(function (e) {
          return e.base === d.base && e.acid === d.acid && e.model === d.model && Math.max(e.L, d.L) / Math.min(e.L, d.L) >= 1.2 - 1e-9 && near(d.t, e.t, 0.01);
        });
      }
    },
    {
      id: 'gas-diffusion-h10', level: 10, hidden: true,
      riddle: { zh: '秤上贏了，路上卻輸了。', en: 'It wins on the scales, yet loses on the road.' },
      check: function (ev) {
        // 先用格雷厄姆模型看到「比較輕的甲胺跑得比較遠」，再在同一條管、同一溫度下換成空氣中的擴散，環卻落到甲胺那一半
        const d = rg(ev);
        return !!d && !d.unknown && d.model === 'air' && d.base === 'CH3NH2' && G_M(d.base) < G_M(d.acid) && d.frac < 0.5 && earlier(d).some(function (e) {
          return samePairRing(e, d) && e.model === 'graham' && Math.abs(e.L - d.L) < 0.05 && Math.abs(e.T - d.T) < 0.05 && e.frac > 0.5;
        });
      }
    }
  ]);
})();
