/* missions/enzyme-kinetics.js — 酵素動力學的任務（星星數 = 等級 1–10；隱藏任務 = 等級 × 2）
 * 事件（js/enzyme-kinetics.js 送出）：
 *   'run'：20 分鐘的反應結束時。enzyme（amylase／pepsin／trypsin）、tubes：五支試管的 {T, pH, end}（end 是完成時間秒，沒完成是 null）
 *   'tscan'：溫度掃描時。enzyme、pH、ta（每點測量時間，秒）、Topt（表觀最適溫度 °C）、prev（之前幾次掃描的同樣資料）
 *   'measure'：量一次初速度時。S、v、Km、Vmax（神秘酵素的真值）、type（真正的抑制劑型式）、mystery、I、Ki、noise、appKm、appVmax
 *   'fit'：某一組點（同一種抑制劑條件）有兩點以上、擬合成功時。key（none 是沒加抑制劑）、type、mystery、I、n、noise（這組最小的誤差設定）、
 *          Km、Vmax、slope、icpt（擬合值）、trueKm、trueVmax（這組條件下的真值）、n0、slope0、icpt0（沒加抑制劑那一組）
 *   'guess'：猜神秘抑制劑時。correct、n0、n1（沒加與加了神秘抑制劑的點數）、noise、streak（連續答對、合格的次數）
 */
(function () {
  'use strict';
  if (!window.LabMission) return;

  function done(t) { return t.end != null; }
  function within(a, b, tol) { return Math.abs(a / b - 1) <= tol; }

  LabMission.register('enzyme-kinetics', [
    {
      id: 'enzyme-kinetics-1', level: 1,
      title: { zh: '顏色變了', en: 'The colour changes' },
      desc: { zh: '讓至少一支試管在 20 分鐘內完成反應（受質剩不到 10%）。', en: 'Get at least one tube to finish within 20 minutes (less than 10% of the substrate left).' },
      check: function (ev) { return ev.type === 'run' && ev.data.tubes.some(done); }
    },
    {
      id: 'enzyme-kinetics-2', level: 2,
      title: { zh: '口水的最適 pH', en: 'The best pH for saliva' },
      desc: { zh: '用唾液澱粉酶：同一溫度下放至少三支不同 pH 的試管（彼此至少差 0.5），最快完成的那支要在 pH 6.3–7.3。', en: 'With salivary amylase, run at least three tubes at the same temperature with different pH values (at least 0.5 apart); the fastest must be between pH 6.3 and 7.3.' },
      check: function (ev) {
        if (ev.type !== 'run' || ev.data.enzyme !== 'amylase') return false;
        const ts = ev.data.tubes.filter(done);
        if (!ts.length) return false;
        const best = ts.reduce(function (a, b) { return b.end < a.end ? b : a; });
        const same = ev.data.tubes.filter(function (t) { return Math.abs(t.T - best.T) <= 0.5; });
        const phs = [];
        same.forEach(function (t) { if (phs.every(function (p) { return Math.abs(p - t.pH) >= 0.5; })) phs.push(t.pH); });
        const faster = same.filter(function (t) { return t !== best && done(t) && t.end <= best.end; });
        return phs.length >= 3 && Math.abs(best.pH - 6.8) <= 0.5 && faster.length === 0;
      }
    },
    {
      id: 'enzyme-kinetics-3', level: 2,
      title: { zh: '煮過就不行了', en: 'Boiled is broken' },
      desc: { zh: '同一次反應裡，一支至少 70 °C 的試管沒有完成，另一支 40 °C 以下的試管完成了。', en: 'In the same run, a tube at 70 °C or more does not finish while another at 40 °C or less does.' },
      check: function (ev) {
        if (ev.type !== 'run') return false;
        const t = ev.data.tubes;
        return t.some(function (x) { return x.T >= 70 && !done(x); }) && t.some(function (x) { return x.T <= 40 && done(x); });
      }
    },
    {
      id: 'enzyme-kinetics-4', level: 3,
      title: { zh: '胃裡的酵素', en: 'An enzyme for the stomach' },
      desc: { zh: '用胃蛋白酶：同一次反應裡，pH 2.5 以下的試管完成了，pH 6 以上的試管沒有完成。', en: 'With pepsin, in the same run a tube at pH 2.5 or below finishes and a tube at pH 6 or above does not.' },
      check: function (ev) {
        if (ev.type !== 'run' || ev.data.enzyme !== 'pepsin') return false;
        const t = ev.data.tubes;
        return t.some(function (x) { return x.pH <= 2.5 && done(x); }) && t.some(function (x) { return x.pH >= 6 && !done(x); });
      }
    },
    {
      id: 'enzyme-kinetics-5', level: 3,
      title: { zh: '一半的速度', en: 'Half speed' },
      desc: { zh: '沒加抑制劑時，在受質濃度與 Km 相差不到 5% 的地方量一次初速度。', en: 'Without inhibitor, measure the initial rate at a substrate concentration within 5% of Km.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'measure' && (d.type === 'none' || d.I === 0) && Math.abs(d.S / d.Km - 1) <= 0.05;
      }
    },
    {
      id: 'enzyme-kinetics-6', level: 4,
      title: { zh: '雙倒數', en: 'Double reciprocal' },
      desc: { zh: '測量誤差至少 1%：沒加抑制劑量至少 5 個點，雙倒數圖求出的 Km 和 Vmax 都和答案相差不到 10%。', en: 'With a measurement error of at least 1%, measure at least 5 points without inhibitor so that the Km and Vmax from the double-reciprocal plot are both within 10% of the answer.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'fit' && d.key === 'none' && d.n >= 5 && d.noise >= 0.01 - 1e-9 && within(d.Km, d.trueKm, 0.1) && within(d.Vmax, d.trueVmax, 0.1);
      }
    },
    {
      id: 'enzyme-kinetics-7', level: 5,
      title: { zh: '把對手擠走', en: 'Crowd it out' },
      desc: { zh: '加入至少 2 倍 Ki 的競爭型抑制劑，還是量到至少 80% Vmax 的初速度。', en: 'With a competitive inhibitor at 2 Ki or more, still measure an initial rate of at least 80% of Vmax.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'measure' && !d.mystery && d.type === 'competitive' && d.I >= 2 * d.Ki - 1e-9 && d.v >= 0.8 * d.Vmax;
      }
    },
    {
      id: 'enzyme-kinetics-8', level: 5,
      title: { zh: '冷了慢、熱了壞', en: 'Slow when cold, broken when hot' },
      desc: { zh: '五支試管同一個 pH（在這種酵素的最適 pH ± 0.5 內）、溫度都不同，有一支 10 °C 以下、一支 60 °C 以上：最快的那支在 35–50 °C，冷的那支慢一倍以上或沒完成，熱的那支沒完成。', en: 'Five tubes at one pH (within 0.5 of this enzyme’s best) and five different temperatures, one at 10 °C or below and one at 60 °C or above: the fastest is between 35 and 50 °C, the cold one takes at least twice as long or never finishes, and the hot one never finishes.' },
      check: function (ev) {
        if (ev.type !== 'run') return false;
        const opt = { amylase: 6.8, pepsin: 2, trypsin: 8 }[ev.data.enzyme];
        const t = ev.data.tubes;
        if (t.some(function (x) { return Math.abs(x.pH - t[0].pH) > 0.05; }) || Math.abs(t[0].pH - opt) > 0.5) return false;
        for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) if (Math.abs(t[i].T - t[j].T) < 0.5) return false;
        const fin = t.filter(done);
        if (!fin.length) return false;
        const best = fin.reduce(function (a, b) { return b.end < a.end ? b : a; });
        const cold = t.filter(function (x) { return x.T <= 10; }), hot = t.filter(function (x) { return x.T >= 60; });
        return best.T >= 35 && best.T <= 50 && cold.length > 0 && hot.length > 0 &&
          cold.every(function (x) { return !done(x) || x.end >= 2 * best.end; }) && hot.every(function (x) { return !done(x); });
      }
    },
    {
      id: 'enzyme-kinetics-9', level: 6,
      title: { zh: '揭穿抑制劑', en: 'Unmask the inhibitor' },
      desc: { zh: '沒加與加了神秘抑制劑各量至少 4 個點，然後猜對它是哪一種。', en: 'Measure at least 4 points without and 4 with the mystery inhibitor, then guess its kind correctly.' },
      check: function (ev) { const d = ev.data; return ev.type === 'guess' && d.correct && d.n0 >= 4 && d.n1 >= 4; }
    },
    {
      id: 'enzyme-kinetics-10', level: 7,
      title: { zh: '最適溫度會移動', en: 'The optimum moves' },
      desc: { zh: '同一種酵素、同一個 pH，做兩次溫度掃描：測量時間差 10 倍以上，量到的最適溫度相差至少 3 °C。', en: 'With the same enzyme and pH, scan the temperature twice with measuring times at least 10 times apart, so that the optima differ by at least 3 °C.' },
      check: function (ev) {
        if (ev.type !== 'tscan') return false;
        const d = ev.data;
        return (d.prev || []).some(function (q) {
          return q.enzyme === d.enzyme && Math.abs(q.pH - d.pH) <= 0.05 && Math.max(q.ta, d.ta) >= 10 * Math.min(q.ta, d.ta) && Math.abs(q.Topt - d.Topt) >= 3;
        });
      }
    },
    {
      id: 'enzyme-kinetics-11', level: 8,
      title: { zh: '省著量', en: 'Few but good' },
      desc: { zh: '測量誤差至少 3%：沒加抑制劑量 4 到 6 個點，雙倒數圖求出的 Km 和 Vmax 都和答案相差不到 5%。', en: 'With a measurement error of at least 3%, use 4 to 6 points without inhibitor and get both Km and Vmax from the double-reciprocal plot within 5% of the answer.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'fit' && d.key === 'none' && d.n >= 4 && d.n <= 6 && d.noise >= 0.03 - 1e-9 && within(d.Km, d.trueKm, 0.05) && within(d.Vmax, d.trueVmax, 0.05);
      }
    },
    {
      id: 'enzyme-kinetics-12', level: 10,
      title: { zh: '三連勝', en: 'Three in a row' },
      desc: { zh: '測量誤差至少 5%：連續三個神秘酵素都猜對抑制劑（每次沒加與加了各至少 4 個點）。', en: 'With a measurement error of at least 5%, name the mystery inhibitor correctly for three mystery enzymes in a row (at least 4 points without and 4 with it each time).' },
      check: function (ev) { const d = ev.data; return ev.type === 'guess' && d.correct && d.streak >= 3; }
    },
    {
      id: 'enzyme-kinetics-h1', level: 3, hidden: true,
      riddle: { zh: '走錯了地方，就什麼都做不了。', en: 'In the wrong place, it can do nothing at all.' },
      check: function (ev) {
        if (ev.type !== 'run' || ev.data.enzyme !== 'trypsin') return false;
        const t = ev.data.tubes;
        return t.some(function (x) { return x.pH <= 3 && !done(x); }) && t.some(function (x) { return x.pH >= 7.5 && x.pH <= 8.5 && done(x); });
      }
    },
    {
      id: 'enzyme-kinetics-h2', level: 4, hidden: true,
      riddle: { zh: '再多的鑰匙，也打不開卡住的鎖。', en: 'However many keys you bring, a jammed lock stays shut.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'measure' && !d.mystery && d.type === 'noncompetitive' && d.I >= d.Ki - 1e-9 && d.S >= 10 * d.Km && d.v <= 0.55 * d.Vmax;
      }
    },
    {
      id: 'enzyme-kinetics-h3', level: 5, hidden: true,
      riddle: { zh: '兩條路永遠不會相交。', en: 'Two roads that never meet.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'fit' && d.type === 'uncompetitive' && d.n >= 4 && d.n0 >= 4 && d.slope0 > 0 && d.icpt0 > 0 &&
          Math.abs(d.slope / d.slope0 - 1) <= 0.1 && d.icpt / d.icpt0 >= 1.5;
      }
    }
  ]);
})();
