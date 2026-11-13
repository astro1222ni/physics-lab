/* missions/solution-concentration.js — 濃度與溶液配製的任務（星星數 = 等級 1–10；隱藏任務 = 等級 × 2） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  // 事件（js/solution-concentration.js 只在使用者操作之後送出）：
  //   'made'：按「完成」貼上標籤 { mode（'weigh'／'dilute'）, solid（秤量的固體：'CuSO4-5H2O'／'CuSO4'／'NaCl'／'NaOH'）, stock（原液代號或 'last'）,
  //            sp（溶質：'CuSO4'／'NaCl'／'NaOH'）, Vf（量瓶 mL）, C（實際濃度 mol/L）, Cideal, target, eTotal, eAmount, eProc,
  //            eLoss（移液損失）, eTemp（沒冷卻）, eAfter（搖勻後補水）, eLevel（定容：視差、加過頭、吸出）,
  //            w（質量分率）, molal（mol/kg）, ppmCu（mg Cu／kg 溶液，非硫酸銅為 null）, gL（g/L）, rinses, flaskWet, drawnOut,
  //            eyeFill（最後加水時眼睛的角度，正 = 俯視）, appFill（那時看起來液面在刻度線上方幾 mm）, Tfill, chain（稀釋了幾次）, seq }
  //   'convert'：濃度換算模式移動滑桿 { sp, w, C, m, x, ppm }
  const md = function (ev) { return ev.type === 'made' && ev.data ? ev.data : null; };
  const cv = function (ev) { return ev.type === 'convert' && ev.data ? ev.data : null; };
  const near = function (a, b, tol) { return a != null && isFinite(a) && Math.abs(a / b - 1) <= tol; };
  const small = function (x, tol) { return x != null && isFinite(x) && Math.abs(x) <= tol; };

  LabMission.register('solution-concentration', [
    {
      id: 'solution-concentration-1', level: 1,
      title: { zh: '第一瓶溶液', en: 'Your first solution' },
      desc: { zh: '配好一瓶溶液：定容、「蓋塞搖勻」，再按「完成」。', en: 'Make up a solution: fill to the mark, “Stopper & invert”, then press “Done”.' },
      check: function (ev) { return !!md(ev); }
    },
    {
      id: 'solution-concentration-2', level: 2,
      title: { zh: '0.100 M 食鹽水', en: '0.100 M salt solution' },
      desc: { zh: '秤氯化鈉，用 100 mL 量瓶配出 0.100 M 的溶液（誤差 2% 以內）。', en: 'Weigh out sodium chloride and make 0.100 M solution in a 100 mL flask (within 2%).' },
      check: function (ev) { const d = md(ev); return !!d && d.mode === 'weigh' && d.sp === 'NaCl' && d.Vf === 100 && near(d.C, 0.1, 0.02); }
    },
    {
      id: 'solution-concentration-3', level: 3,
      title: { zh: '別忘了結晶水', en: "Don't forget the water of crystallisation" },
      desc: { zh: '秤五水硫酸銅 CuSO4·5H2O，用 100 mL 量瓶配出 0.100 M 的硫酸銅溶液（誤差 1% 以內）。', en: 'Weigh copper(II) sulfate pentahydrate, CuSO4·5H2O, and make 0.100 M copper sulfate solution in a 100 mL flask (within 1%).' },
      check: function (ev) { const d = md(ev); return !!d && d.mode === 'weigh' && d.solid === 'CuSO4-5H2O' && d.Vf === 100 && near(d.C, 0.1, 0.01); }
    },
    {
      id: 'solution-concentration-4', level: 3,
      title: { zh: '十倍稀釋', en: 'A tenfold dilution' },
      desc: { zh: '用 1.00 M 硫酸銅原液稀釋，配出 0.100 M 的溶液 100 mL（誤差 1% 以內）。', en: 'Dilute the 1.00 M copper sulfate stock to make 100 mL of 0.100 M solution (within 1%).' },
      check: function (ev) { const d = md(ev); return !!d && d.mode === 'dilute' && d.stock === 'Cu1' && d.Vf === 100 && near(d.C, 0.1, 0.01); }
    },
    {
      id: 'solution-concentration-5', level: 4,
      title: { zh: '百分率與莫耳濃度', en: 'Per cent and molarity' },
      desc: { zh: '在「濃度換算」找出 1.000 M 氯化鈉溶液的重量百分率（體積莫耳濃度誤差 0.3% 以內）。', en: 'In “Convert”, find the mass percentage of a 1.000 M sodium chloride solution (molarity within 0.3%).' },
      check: function (ev) { const d = cv(ev); return !!d && d.sp === 'NaCl' && near(d.C, 1, 0.003); }
    },
    {
      id: 'solution-concentration-6', level: 5,
      title: { zh: '眼睛太高了', en: 'Eyes too high' },
      desc: { zh: '眼睛從刻度線上方斜看（俯視 10° 以上），把液面加到看起來剛好對齊刻度線，配出的溶液因為定容而偏高 0.2% 以上。', en: 'Look down at the mark from above (10° or more) and add water until the meniscus looks level with the mark; the solution comes out at least 0.2% too concentrated because of the filling.' },
      check: function (ev) { const d = md(ev); return !!d && d.eyeFill >= 10 && small(d.appFill, 0.7) && d.eLevel >= 0.002; }
    },
    {
      id: 'solution-concentration-7', level: 6,
      title: { zh: '氫氧化鈉標準溶液', en: 'Sodium hydroxide solution' },
      desc: { zh: '秤氫氧化鈉，用 250 mL 量瓶配出 0.200 M 的溶液（誤差 0.3% 以內）。', en: 'Weigh out sodium hydroxide and make 0.200 M solution in a 250 mL flask (within 0.3%).' },
      check: function (ev) { const d = md(ev); return !!d && d.mode === 'weigh' && d.sp === 'NaOH' && d.Vf === 250 && near(d.C, 0.2, 0.003); }
    },
    {
      id: 'solution-concentration-8', level: 7,
      title: { zh: '10 ppm 的銅', en: '10 ppm of copper' },
      desc: { zh: '用連續稀釋配出含銅 10.0 ppm 的硫酸銅溶液（誤差 2% 以內）。', en: 'By serial dilution, make a copper sulfate solution containing 10.0 ppm of copper (within 2%).' },
      check: function (ev) { const d = md(ev); return !!d && d.sp === 'CuSO4' && near(d.ppmCu, 10, 0.02); }
    },
    {
      id: 'solution-concentration-9', level: 8,
      title: { zh: '精確配製', en: 'Accurate to 0.1%' },
      desc: { zh: '秤固體，用 500 mL 量瓶配出 0.0500 M 的硫酸銅溶液（誤差 0.1% 以內）。', en: 'Weigh a solid and make 0.0500 M copper sulfate solution in a 500 mL flask (within 0.1%).' },
      check: function (ev) { const d = md(ev); return !!d && d.mode === 'weigh' && d.sp === 'CuSO4' && d.Vf === 500 && near(d.C, 0.05, 0.001); }
    },
    {
      id: 'solution-concentration-10', level: 9,
      title: { zh: '用量瓶配百分率', en: 'A percentage in a flask' },
      desc: { zh: '秤氫氧化鈉，用量瓶配出重量百分率 10.0% 的溶液（誤差 0.3% 以內；溶液的密度可以在「濃度換算」查）。', en: 'Weigh sodium hydroxide and make a 10.0% (by mass) solution in a volumetric flask (within 0.3%; look up the density in “Convert”).' },
      check: function (ev) { const d = md(ev); return !!d && d.mode === 'weigh' && d.sp === 'NaOH' && near(d.w, 0.1, 0.003); }
    },
    {
      id: 'solution-concentration-h1', level: 3, hidden: true,
      riddle: { zh: '出發前就已經溼透，到終點卻一滴不差。', en: 'Soaked before it set out, yet not a drop off at the finish.' },
      check: function (ev) { const d = md(ev); return !!d && d.flaskWet && small(d.eTotal, 0.001) && small(d.eProc, 0.001); }
    },
    {
      id: 'solution-concentration-h2', level: 4, hidden: true,
      riddle: { zh: '魚兒會以為自己回到了家。', en: 'A fish would think it had come home.' },
      check: function (ev) { const d = md(ev); return !!d && d.sp === 'NaCl' && Math.abs(d.w * 100 - 3.5) <= 0.03; }
    },
    {
      id: 'solution-concentration-h3', level: 5, hidden: true,
      riddle: { zh: '你倒掉的，不只是水。', en: 'What you poured away was not only water.' },
      check: function (ev) { const d = md(ev); return !!d && d.drawnOut && small(d.eAmount, 0.003) && d.eLevel <= -0.002; }
    },
    {
      id: 'solution-concentration-h4', level: 6, hidden: true,
      riddle: { zh: '穿了五件外衣，或者一件也不穿，點名時人數一樣。', en: 'Wearing five coats or none at all, the roll call counts the same.' },
      check: function (ev, mem) {
        const d = md(ev);
        if (!d || d.mode !== 'weigh' || d.sp !== 'CuSO4' || !small(d.eProc, 0.005) || !(d.C >= 0.01)) return false;
        mem.last = mem.last || {};
        const other = mem.last[d.solid === 'CuSO4' ? 'CuSO4-5H2O' : 'CuSO4'];
        mem.last[d.solid] = d.C;
        return other != null && near(d.C, other, 0.003);
      }
    },
    {
      id: 'solution-concentration-h5', level: 7, hidden: true,
      riddle: { zh: '一公升的房間裡，主人剛好一公斤重。', en: 'In a one-litre room, the host weighs exactly one kilogram.' },
      check: function (ev) { const d = md(ev); return !!d && d.sp === 'NaOH' && d.w >= 0.03 && near(d.molal, d.C, 0.0003); }
    },
    {
      id: 'solution-concentration-h6', level: 8, hidden: true,
      riddle: { zh: '它一直都在，只是眼睛已經放棄。', en: 'It is still there; only the eye has given up.' },
      check: function (ev) { const d = md(ev); return !!d && d.sp === 'CuSO4' && d.ppmCu > 0 && d.ppmCu < 1 && small(d.eLevel, 0.01); }
    },
    {
      id: 'solution-concentration-h7', level: 10, hidden: true,
      riddle: { zh: '在只認得刻度的瓶子裡，做出一個只有天平才認得的「一」。', en: "In a flask that only knows its mark, make a ‘one’ that only a balance would recognise." },
      check: function (ev) { const d = md(ev); return !!d && d.sp === 'NaCl' && near(d.molal, 1, 0.002); }
    },
    {
      id: 'solution-concentration-h8', level: 9, hidden: true,
      riddle: { zh: '錯了兩次，反而對了。', en: 'Wrong twice, and therefore right.' },
      check: function (ev) {
        const d = md(ev);
        if (!d) return false;
        const big = [d.eAmount, d.eLoss, d.eTemp, d.eAfter, d.eLevel].filter(function (x) { return Math.abs(x) >= 0.002; }).length;
        return big >= 2 && small(d.eTotal, 0.001);
      }
    },
    {
      id: 'solution-concentration-h9', level: 4, hidden: true,
      riddle: { zh: '它可以安靜地流進血管。', en: 'It could flow quietly into a vein.' },
      check: function (ev) { const d = md(ev); return !!d && d.sp === 'NaCl' && near(d.gL, 9.00, 0.005); }
    },
    {
      id: 'solution-concentration-h10', level: 7, hidden: true,
      riddle: { zh: '等它冷靜下來，它比你以為的更濃。', en: 'Once it calmed down, it was stronger than you thought.' },
      check: function (ev) { const d = md(ev); return !!d && d.mode === 'weigh' && d.sp === 'NaOH' && d.eTemp >= 0.002 && small(d.eLevel, 0.001) && small(d.eLoss, 0.001); }
    }
  ]);
})();
