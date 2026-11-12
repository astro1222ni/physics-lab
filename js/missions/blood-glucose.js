/* missions/blood-glucose.js — 血糖調節的任務（星星數 = 等級 1–10；隱藏任務 = 等級 × 2）
 * 事件（js/blood-glucose.js 送出）：
 *   'glu-day'：第一部分任何設定改變（停 0.15 秒後送一次）。beta、si（β 細胞功能與胰島素敏感度，× 正常）、type（normal／t2／t1／custom）、
 *              meals（[早, 午, 晚, 宵夜] 醣類公克數）、basalU（長效一天幾單位）、ratio（速效：每 10 g 醣幾單位）、lead（飯前幾分鐘打）、
 *              exT（運動開始，分鐘）、exD（分鐘）、exE（強度 0–1）、mean、min、max（mg/dL）、tir、tbr、tar（70–180、低於 70、高於 180 的時間比例）、
 *              a1c（估計，%）、urine（一天尿糖 g）、fast（07:00 早餐前的血糖）、totalU（一天打的胰島素）、insulin（有沒有打胰島素）
 *   'ogtt'：第二部分試驗做到 2 小時。beta、si、g0、g30、g60、g90、g120、peak（0–120 分鐘的最高值）、dx（normal／pre／dm）
 */
(function () {
  'use strict';
  if (!window.LabMission) return;

  function day(ev) { return ev.type === 'glu-day' ? ev.data : null; }
  function og(ev) { return ev.type === 'ogtt' ? ev.data : null; }
  function noIns(d) { return d.basalU === 0 && d.ratio === 0; }
  function isT1(d) { return d.beta < 0.025; }
  function isT2(d) { return d.beta >= 0.025 && d.beta <= 0.4 && d.si <= 0.35; }
  function healthy(d) { return d.beta >= 0.9 && d.beta <= 1.1 && d.si >= 0.9 && d.si <= 1.1; }
  function mains(d) { return d.meals.slice(0, 3); }
  function allAtLeast(d, g) { return mains(d).every(function (m) { return m >= g; }); }

  LabMission.register('blood-glucose', [
    {
      id: 'blood-glucose-1', level: 1,
      title: { zh: '正常的耐受', en: 'A normal tolerance' },
      desc: { zh: '在第二部分做一次口服葡萄糖耐受試驗，結果判讀為「正常」。', en: 'In part 2, run a glucose tolerance test whose result is “Normal”.' },
      check: function (ev) { const d = og(ev); return !!d && d.dx === 'normal'; }
    },
    {
      id: 'blood-glucose-2', level: 2,
      title: { zh: '還來得及', en: 'Still time to act' },
      desc: { zh: '做一次試驗，結果判讀為「糖尿病前期」：空腹 100–125 或 2 小時 140–199 mg/dL。', en: 'Run a test whose result is “Prediabetes”: fasting 100–125 or 2 hours 140–199 mg/dL.' },
      check: function (ev) { const d = og(ev); return !!d && d.dx === 'pre'; }
    },
    {
      id: 'blood-glucose-3', level: 2,
      title: { zh: '大餐也不怕', en: 'Not afraid of a feast' },
      desc: { zh: '健康的人（β 細胞與敏感度都在 0.9–1.1 倍）不打針，有一餐吃到 150 g 以上，整天血糖仍然都在 70–180 之間。', en: 'A healthy person (β cells and sensitivity both 0.9–1.1 times normal), no injections, eats 150 g or more at one meal and still stays between 70 and 180 all day.' },
      check: function (ev) { const d = day(ev); return !!d && healthy(d) && noIns(d) && Math.max.apply(null, d.meals) >= 150 && d.tir >= 0.999 && d.min >= 70; }
    },
    {
      id: 'blood-glucose-4', level: 3,
      title: { zh: '空腹正常，尿卻是甜的', en: 'Normal fasting, sweet urine' },
      desc: { zh: '不打胰島素，早餐前的空腹血糖低於 126，一天的尿糖卻有 5 g 以上。', en: 'Without insulin, keep the fasting glucose before breakfast below 126 while at least 5 g of sugar ends up in the urine during the day.' },
      check: function (ev) { const d = day(ev); return !!d && noIns(d) && d.fast < 126 && d.urine >= 5; }
    },
    {
      id: 'blood-glucose-5', level: 3,
      title: { zh: '不吃東西的一天', en: 'A day without food' },
      desc: { zh: '第一型（沒有 β 細胞），三餐和宵夜都不吃，只靠長效胰島素讓血糖整天都在 80–130 之間。', en: 'Type 1 (no β cells), no meals or snack at all: use long-acting insulin alone to keep glucose between 80 and 130 all day.' },
      check: function (ev) { const d = day(ev); return !!d && isT1(d) && d.meals.every(function (m) { return m === 0; }) && d.min >= 80 && d.max <= 130; }
    },
    {
      id: 'blood-glucose-6', level: 4,
      title: { zh: '少吃一點，多動一點', en: 'Eat a little less, move a little more' },
      desc: { zh: '第二型（β 細胞 0.4 倍以下、敏感度 0.35 倍以下），不打胰島素，三餐每餐至少 30 g，靠飲食和運動讓範圍內時間到 90% 以上。', en: 'Type 2 (β cells 0.4 times normal or less, sensitivity 0.35 or less), no insulin, at least 30 g at each of the three meals: use food and exercise alone to reach 90% or more time in range.' },
      check: function (ev) { const d = day(ev); return !!d && isT2(d) && noIns(d) && allAtLeast(d, 30) && d.tir >= 0.9; }
    },
    {
      id: 'blood-glucose-7', level: 5,
      title: { zh: '加班的 β 細胞', en: 'β cells on overtime' },
      desc: { zh: '病人的胰島素敏感度只剩 0.3 倍以下，試驗結果卻仍然「正常」。', en: 'The patient’s insulin sensitivity is only 0.3 times normal or less, yet the test result is still “Normal”.' },
      check: function (ev) { const d = og(ev); return !!d && d.si <= 0.3 && d.dx === 'normal'; }
    },
    {
      id: 'blood-glucose-8', level: 5,
      title: { zh: '替 β 細胞上班', en: 'Doing the β cells’ job' },
      desc: { zh: '第一型，三餐每餐至少 50 g：用長效和速效胰島素讓範圍內時間到 90% 以上，而且從不低於 70。', en: 'Type 1, at least 50 g at each of the three meals: use long-acting and rapid-acting insulin to reach 90% or more time in range without ever going below 70.' },
      check: function (ev) { const d = day(ev); return !!d && isT1(d) && allAtLeast(d, 50) && d.tir >= 0.9 && d.min >= 70; }
    },
    {
      id: 'blood-glucose-9', level: 6,
      title: { zh: '第二型的好控制', en: 'Good control in type 2' },
      desc: { zh: '第二型，三餐每餐至少 50 g：估計 A1C 降到 6.0% 以下、範圍內時間 95% 以上，而且從不低於 70。', en: 'Type 2, at least 50 g at each of the three meals: bring the estimated A1C to 6.0% or less with 95% or more time in range, never below 70.' },
      check: function (ev) { const d = day(ev); return !!d && isT2(d) && allAtLeast(d, 50) && d.a1c <= 6.0 && d.tir >= 0.95 && d.min >= 70; }
    },
    {
      id: 'blood-glucose-10', level: 7,
      title: { zh: '運動前先計畫', en: 'Plan before you play' },
      desc: { zh: '第一型，三餐每餐至少 50 g，運動至少 60 分鐘、強度 0.5 以上：整天都不低於 70，範圍內時間 80% 以上。', en: 'Type 1, at least 50 g at each of the three meals, and at least 60 minutes of exercise at intensity 0.5 or more: never below 70 all day, with 80% or more time in range.' },
      check: function (ev) { const d = day(ev); return !!d && isT1(d) && allAtLeast(d, 50) && d.exD >= 60 && d.exE >= 0.5 && d.min >= 70 && d.tir >= 0.8; }
    },
    {
      id: 'blood-glucose-11', level: 8,
      title: { zh: '吃到飽之夜', en: 'All-you-can-eat night' },
      desc: { zh: '第一型，有一餐吃到 150 g 以上、另外兩餐至少 50 g：整天血糖不超過 180，也不低於 70。', en: 'Type 1, one meal of 150 g or more and the other two at least 50 g: glucose never above 180 and never below 70 all day.' },
      check: function (ev) {
        const d = day(ev);
        if (!d || !isT1(d)) return false;
        const m = mains(d).slice().sort(function (a, b) { return b - a; });
        return m[0] >= 150 && m[1] >= 50 && m[2] >= 50 && d.max <= 180 && d.min >= 70;
      }
    },
    {
      id: 'blood-glucose-12', level: 10,
      title: { zh: '像真的胰臟一樣', en: 'As good as a real pancreas' },
      desc: { zh: '第一型，三餐每餐至少 60 g、宵夜至少 30 g，還要運動至少 30 分鐘（強度 0.5 以上）：整天血糖都在 80–140 之間。', en: 'Type 1, at least 60 g at each meal plus a snack of at least 30 g, and at least 30 minutes of exercise (intensity 0.5 or more): keep glucose between 80 and 140 all day.' },
      check: function (ev) { const d = day(ev); return !!d && isT1(d) && allAtLeast(d, 60) && d.meals[3] >= 30 && d.exD >= 30 && d.exE >= 0.5 && d.min >= 80 && d.max <= 140; }
    },
    {
      id: 'blood-glucose-h1', level: 3, hidden: true,
      riddle: { zh: '給得太慷慨，腦袋反而餓了。', en: 'Too generous a gift, and the brain goes hungry.' },
      check: function (ev) { const d = day(ev); return !!d && d.min < 54; }
    },
    {
      id: 'blood-glucose-h2', level: 4, hidden: true,
      riddle: { zh: '客人進了城，每一扇門都沒有鑰匙。', en: 'The guests reach the city, but no door has a key.' },
      check: function (ev) { const d = og(ev); return !!d && d.beta < 0.025 && d.g120 >= 300; }
    },
    {
      id: 'blood-glucose-h3', level: 4, hidden: true,
      riddle: { zh: '才剛進門，每個房間就搶著請它進去。', en: 'It has barely come in, and every room is already inviting it inside.' },
      check: function (ev) { const d = og(ev); return !!d && d.dx === 'normal' && d.peak <= 125; }
    }
  ]);
})();
