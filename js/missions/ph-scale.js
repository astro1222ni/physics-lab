/* missions/ph-scale.js — 酸鹼強度與 pH 的任務（星星數 = 等級 1–10；隱藏任務 = 等級 × 2） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  // 事件（js/ph-scale.js 只在使用者按按鈕之後送出）：
  //   'measure'：按「測量並記錄」{ T（°C）, pKw, neutral（中性 pH）, ind, beakers: [A, B] }
  //              每一杯 = PhCore.solution() 的讀數 { sp, kind（water／sa／wa／sb／wb）, logC, C, pH, pOH, h, oh, alpha, alphaLim, K, pK, pHapprox, … }
  //              再加 { id（'A'／'B'）}
  //   'dilute'：按「加水稀釋 10 倍」{ id, sp, kind, T, k（這一串連續稀釋的次數）, logC0, pH0, alpha0（這一串開始時）,
  //              pHprev, alphaPrev（這一次稀釋前）, logC, pH, alpha, alphaLim, K, Kw, dpH（這一次的 pH 變化）}
  //              改物質、改濃度滑桿或改溫度，連續稀釋就重新算起。
  //   'answer'：未知酸按「核對答案」{ ans（pKa）, err（與真值的差的絕對值）, revealed, tries }
  const ms = function (ev) { return ev.type === 'measure' && ev.data && ev.data.beakers ? ev.data : null; };
  const dl = function (ev) { return ev.type === 'dilute' && ev.data ? ev.data : null; };
  const an = function (ev) { return ev.type === 'answer' && ev.data ? ev.data : null; };
  const isAcid = function (b) { return b.kind === 'sa' || b.kind === 'wa'; };
  const isBase = function (b) { return b.kind === 'sb' || b.kind === 'wb'; };
  /** 兩杯恰好一杯是 k1、一杯是 k2 → [那一杯, 這一杯]；否則 null */
  function pair(d, k1, k2) {
    const a = d.beakers[0], b = d.beakers[1];
    if (a.kind === k1 && b.kind === k2) return [a, b];
    if (a.kind === k2 && b.kind === k1) return [b, a];
    return null;
  }
  const sameC = function (a, b) { return a.logC != null && b.logC != null && Math.abs(a.logC - b.logC) <= 0.005; };

  LabMission.register('ph-scale', [
    {
      id: 'ph-scale-1', level: 1,
      title: { zh: '量一量酸', en: 'Measure an acid' },
      desc: { zh: '按「測量並記錄」，量到一杯 pH 小於 4 的酸溶液。', en: 'Press “Measure & record” and measure an acid solution with a pH below 4.' },
      check: function (ev) { const d = ms(ev); return !!d && d.beakers.some(function (b) { return isAcid(b) && b.pH < 4; }); }
    },
    {
      id: 'ph-scale-2', level: 1,
      title: { zh: '鹼的那一端', en: 'The basic end' },
      desc: { zh: '把一杯換成鹼，按「測量並記錄」，量到 pH 大於 10。', en: 'Put a base in one beaker, press “Measure & record” and measure a pH above 10.' },
      check: function (ev) { const d = ms(ev); return !!d && d.beakers.some(function (b) { return isBase(b) && b.pH > 10; }); }
    },
    {
      id: 'ph-scale-3', level: 2,
      title: { zh: '稀釋十倍', en: 'Ten times thinner' },
      desc: { zh: '按「加水稀釋 10 倍」把鹽酸稀釋，讓 pH 剛好增加 1.00（差 0.02 以內）。', en: 'Press “Dilute 10 times with water” on hydrochloric acid so that its pH rises by exactly 1.00 (within 0.02).' },
      check: function (ev) { const d = dl(ev); return !!d && d.sp === 'HCl' && Math.abs(d.dpH - 1) <= 0.02; }
    },
    {
      id: 'ph-scale-4', level: 3,
      title: { zh: '同濃度，不同強度', en: 'Same concentration, different strength' },
      desc: { zh: '一杯強酸、一杯弱酸，濃度相同，按「測量並記錄」時兩杯的 pH 相差 1 以上。', en: 'Put a strong acid and a weak acid at the same concentration in the two beakers; when you press “Measure & record” their pH must differ by at least 1.' },
      check: function (ev) { const d = ms(ev), p = d && pair(d, 'sa', 'wa'); return !!p && sameC(p[0], p[1]) && Math.abs(p[0].pH - p[1].pH) >= 1; }
    },
    {
      id: 'ph-scale-5', level: 3,
      title: { zh: '酸鹼互補', en: 'Acid and base in balance' },
      desc: { zh: '一杯鹽酸、一杯同濃度的氫氧化鈉，按「測量並記錄」時兩杯 pH 相加等於 pKw（差 0.02 以內）。', en: 'Put hydrochloric acid and sodium hydroxide of the same concentration in the two beakers; when you press “Measure & record” the two pH values must add up to pKw (within 0.02).' },
      check: function (ev) { const d = ms(ev), p = d && pair(d, 'sa', 'sb'); return !!p && sameC(p[0], p[1]) && Math.abs(p[0].pH + p[1].pH - d.pKw) <= 0.02; }
    },
    {
      id: 'ph-scale-6', level: 4,
      title: { zh: '醋酸放手了', en: 'Acetic acid lets go' },
      desc: { zh: '讓醋酸的解離百分率達到 10% 以上，再按「測量並記錄」。', en: 'Make at least 10% of the acetic acid ionised, then press “Measure & record”.' },
      check: function (ev) { const d = ms(ev); return !!d && d.beakers.some(function (b) { return b.sp === 'CH3COOH' && b.alpha >= 0.10; }); }
    },
    {
      id: 'ph-scale-7', level: 4,
      title: { zh: '弱酸的稀釋', en: 'Diluting a weak acid' },
      desc: { zh: '按「加水稀釋 10 倍」稀釋一種弱酸（稀釋前解離百分率小於 5%），讓 pH 增加 0.45～0.55。', en: 'Press “Dilute 10 times with water” on a weak acid that is less than 5% ionised, so that its pH rises by 0.45 to 0.55.' },
      check: function (ev) { const d = dl(ev); return !!d && d.kind === 'wa' && d.alphaPrev < 0.05 && d.dpH >= 0.45 && d.dpH <= 0.55; }
    },
    {
      id: 'ph-scale-8', level: 5,
      title: { zh: '一樣酸', en: 'Equally acidic' },
      desc: { zh: '一杯強酸、一杯弱酸，按「測量並記錄」時兩杯的 pH 相同（差 0.02 以內）。', en: 'Put a strong acid and a weak acid in the two beakers; when you press “Measure & record” their pH must be the same (within 0.02).' },
      check: function (ev) { const d = ms(ev), p = d && pair(d, 'sa', 'wa'); return !!p && Math.abs(p[0].pH - p[1].pH) <= 0.02; }
    },
    {
      id: 'ph-scale-9', level: 5,
      title: { zh: 'pH 11 的氨水', en: 'Ammonia at pH 11' },
      desc: { zh: '在 25 °C 調出 pH = 11.00 的氨水（差 0.01 以內），按「測量並記錄」。', en: 'At 25 °C, make ammonia solution with pH 11.00 (within 0.01) and press “Measure & record”.' },
      check: function (ev) { const d = ms(ev); return !!d && Math.abs(d.T - 25) < 0.5 && d.beakers.some(function (b) { return b.sp === 'NH3' && Math.abs(b.pH - 11) <= 0.01; }); }
    },
    {
      id: 'ph-scale-10', level: 6,
      title: { zh: '兩種弱酸同 pH', en: 'Two weak acids, one pH' },
      desc: { zh: '兩杯放兩種不同的弱酸，按「測量並記錄」時 pH 相同（差 0.01 以內）。', en: 'Put two different weak acids in the two beakers; when you press “Measure & record” their pH must be the same (within 0.01).' },
      check: function (ev) {
        const d = ms(ev);
        if (!d) return false;
        const a = d.beakers[0], b = d.beakers[1];
        return a.kind === 'wa' && b.kind === 'wa' && a.sp !== b.sp && Math.abs(a.pH - b.pH) <= 0.01;
      }
    },
    {
      id: 'ph-scale-11', level: 7,
      title: { zh: '未知酸', en: 'The unknown acid' },
      desc: { zh: '用「未知酸 HX」量 pH，在「揭曉答案」之前算出它的 pKa：同一種未知酸按「核對答案」5 次以內，誤差在 0.05 以內。', en: 'Measure the pH of “Unknown HX” and, before you press “Reveal”, work out its pKa: within 5 presses of “Check” for the same acid, it must be within 0.05.' },
      check: function (ev) { const d = an(ev); return !!d && !d.revealed && d.tries <= 5 && d.err <= 0.05; }
    },
    {
      id: 'ph-scale-12', level: 9,
      title: { zh: '精準的未知酸', en: 'The unknown acid, precisely' },
      desc: { zh: '在「揭曉答案」之前算出「未知酸 HX」的 pKa：同一種未知酸按「核對答案」3 次以內，誤差在 0.01 以內。', en: 'Before pressing “Reveal”, work out the pKa of “Unknown HX” to within 0.01, within 3 presses of “Check” for the same acid.' },
      check: function (ev) { const d = an(ev); return !!d && !d.revealed && d.tries <= 3 && d.err <= 0.01; }
    },
    {
      id: 'ph-scale-h1', level: 3, hidden: true,
      riddle: { zh: '它的數字變小了，卻一點也沒有變酸。', en: 'Its number went down, yet it did not turn the least bit sour.' },
      // 同一杯純水連續量兩次，中間只改溫度（另一杯的物質與濃度都沒動）：上一次在 30 °C 以下，
      // 這一次加熱到 90 °C 以上，pH 掉了 0.8 以上（約 93 °C 起）卻仍是中性
      check: function (ev, mem) {
        const d = ms(ev);
        if (!d) return false;
        const key = function (b) { return b.sp + '@' + (b.logC == null ? '-' : b.logC.toFixed(4)); };
        const prev = mem.prev || {};
        let hit = false;
        mem.prev = {};
        d.beakers.forEach(function (b, i) {
          if (b.kind !== 'water') return;
          const other = d.beakers[1 - i], p = prev[b.id];
          if (d.T >= 90 && p && p.other === key(other) && b.pH <= p.pH - 0.8) hit = true;
          if (d.T <= 30) mem.prev[b.id] = { pH: b.pH, other: key(other) };
        });
        return hit;
      }
    },
    {
      id: 'ph-scale-h2', level: 4, hidden: true,
      riddle: { zh: '一路兌水，也越不過中間那條線。', en: 'Water it down again and again; it still will not cross the middle line.' },
      // 鹽酸從 pH ≤ 5.05 起連續稀釋三次以上，稀到 10^-8 M，pH 仍停在 6.9 以上、7 以下
      check: function (ev) { const d = dl(ev); return !!d && d.sp === 'HCl' && d.k >= 3 && d.pH0 <= 5.05 && d.logC <= -7.98 && d.pH >= 6.9; }
    },
    {
      id: 'ph-scale-h3', level: 5, hidden: true,
      riddle: { zh: '尺的兩頭，同時有人站了上去。', en: 'Someone stands on each end of the ruler at the same moment.' },
      // 兩杯同時一杯 pH ≤ 0.005、一杯 pH ≥ 13.995（25 °C 的 1 M 強酸與 1 M 強鹼）
      check: function (ev) {
        const d = ms(ev);
        if (!d) return false;
        const p = d.beakers.map(function (b) { return b.pH; });
        return Math.min(p[0], p[1]) <= 0.005 && Math.max(p[0], p[1]) >= 13.995;
      }
    },
    {
      id: 'ph-scale-h4', level: 6, hidden: true,
      riddle: { zh: '抄了捷徑，酸竟然算成了鹼。', en: 'Take the shortcut, and an acid works out to be a base.' },
      // 30 °C 以下，一杯純水、一杯濃度 ≥ 10^-6 M 的弱酸：近似式 √(KaC) 算出的 pH 比純水高 0.1 以上（像鹼），實際 pH 仍比純水低
      check: function (ev) {
        const d = ms(ev), p = d && pair(d, 'water', 'wa');
        return !!p && d.T <= 30 && p[1].logC >= -6 && p[1].pHapprox >= p[0].pH + 0.1 && p[1].pH < p[0].pH;
      }
    },
    {
      id: 'ph-scale-h5', level: 6, hidden: true,
      riddle: { zh: '淡到極處，英雄與凡人並肩而行。', en: 'Thin enough, and the hero walks side by side with the ordinary.' },
      // 同濃度的強酸與弱酸，pH 相同（差 0.01 以內）：弱酸稀到幾乎完全解離。
      // 濃度要 ≥ 10^-6.5 M：再稀的話兩杯都被水自己解離的 H3O+ 壓到 pH 7 附近，那不是弱酸自己放手
      check: function (ev) { const d = ms(ev), p = d && pair(d, 'sa', 'wa'); return !!p && sameC(p[0], p[1]) && p[0].logC >= -6.5 && Math.abs(p[0].pH - p[1].pH) <= 0.01; }
    },
    {
      id: 'ph-scale-h6', level: 7, hidden: true,
      riddle: { zh: '它還是苦的，數字卻說它是酸的。', en: 'It still tastes bitter, yet the number calls it sour.' },
      // 同一杯鹼（同物質、同濃度）先在 30 °C 以下量到 pH ≥ 7.5，再加熱到 70 °C 以上量到 pH < 7，而且 [OH-] ≥ 10 [H3O+]（明顯鹼性）
      check: function (ev, mem) {
        const d = ms(ev);
        if (!d) return false;
        mem.b = mem.b || {};
        let hit = false;
        d.beakers.forEach(function (b) {
          if (!isBase(b)) return;
          const m = mem.b[b.id];
          if (m && m.sp === b.sp && Math.abs(m.logC - b.logC) < 1e-9 && d.T >= 70 && b.pH < 7 && b.oh >= 10 * b.h) hit = true;
          if (d.T <= 30 && b.pH >= 7.5) mem.b[b.id] = { sp: b.sp, logC: b.logC };
        });
        return hit;
      }
    },
    {
      id: 'ph-scale-h7', level: 8, hidden: true,
      riddle: { zh: '再怎麼孤單，它也只肯鬆開一點點手。', en: 'However lonely it gets, it only loosens its grip a little.' },
      // Ka < √Kw 的弱酸（HClO、HCN）連續稀釋三次以上、一路稀到 10^-8 M，解離百分率達到無限稀釋上限 Ka/(Ka + √Kw) 的 98%（HClO 在 10^-8 M 時最多 98.99%，HCN 99.97%）
      check: function (ev) { const d = dl(ev); return !!d && d.kind === 'wa' && d.K < Math.sqrt(d.Kw) && d.k >= 3 && d.logC <= -7.98 && d.alpha >= 0.98 * d.alphaLim; }
    },
    {
      id: 'ph-scale-h8', level: 9, hidden: true,
      riddle: { zh: '人群散去，掙脫的反而成倍增加。', en: 'As the crowd thins out, the ones breaking free multiply.' },
      // 很弱的酸（開始時解離百分率 ≤ 0.1%）連續稀釋三次以上（至少 1000 倍），解離百分率變成開始時的 28 倍以上，
      // 而且仍在 2% 以下（奧士華稀釋定律 α ≈ √(Ka/C) ∝ 1/√C，1000 倍時理想值 √1000 = 31.6；
      // 0.10 M HCN 稀到 10^-4 M 時水自己解離的 H3O+ 已占一成多，實際只有 29.2 倍，所以門檻定 28）
      check: function (ev) { const d = dl(ev); return !!d && d.kind === 'wa' && d.k >= 3 && d.alpha0 > 0 && d.alpha0 <= 0.001 && d.alpha / d.alpha0 >= 28 && d.alpha <= 0.02; }
    },
    {
      id: 'ph-scale-h9', level: 7, hidden: true,
      riddle: { zh: '牽著手的，和放開手的一樣多。', en: 'As many hold hands as let go.' },
      // 弱酸的解離百分率 50%（差 0.2% 以內）：這時 pH = pKa
      check: function (ev) { const d = ms(ev); return !!d && d.beakers.some(function (b) { return b.kind === 'wa' && Math.abs(b.alpha - 0.5) <= 0.002; }); }
    },
    {
      id: 'ph-scale-h10', level: 10, hidden: true,
      riddle: { zh: '素未謀面，卻把它的脾氣說得分毫不差。', en: 'Never met, yet you describe its temper without the slightest error.' },
      // 未知酸的 pKa 在揭曉前、核對 3 次以內算到 0.005 以內（核對只說「在不在範圍內」，不說偏大偏小，避免猜）；
      // 而且真的量過這一瓶未知酸：之前按「測量並記錄」時有一杯是 HX，它的 pKa 和答案差 0.005 以內（換一瓶就要重量）
      check: function (ev, mem) {
        const m = ms(ev);
        if (m) {
          mem.hx = mem.hx || [];
          m.beakers.forEach(function (b) { if (b.sp === 'HX' && b.pK != null && mem.hx.indexOf(b.pK) < 0) mem.hx.push(b.pK); });
          if (mem.hx.length > 20) mem.hx = mem.hx.slice(-20);
          return false;
        }
        const d = an(ev);
        return !!d && !d.revealed && d.tries <= 3 && d.err <= 0.005 &&
          (mem.hx || []).some(function (pk) { return Math.abs(pk - d.ans) <= 0.005; });
      }
    }
  ]);
})();
