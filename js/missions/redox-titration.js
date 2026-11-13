/* missions/redox-titration.js — 氧化還原滴定（過錳酸鉀）的任務（星星數 = 等級 1–10；隱藏任務 = 等級 × 2） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  // 事件（js/redox-titration.js 只在使用者操作之後回報；資料由 js/redox-titration-core.js 的 eventData 產生）：
  //   共同欄位：sys（fe 已知 Fe2+、ox 草酸、std 標定、mx 未知 Fe2+）, Ca, Va, Vacid（3 M 硫酸 mL）, Cb（KMnO4 M）, T（°C）, mass,
  //     V（已落進瓶中的 KMnO4 mL）, Vread（滴定管讀數）, Vout, Veq, E（電位 V；鉑電極不在瓶中或草酸還沒反應完時是 null）, Eeq（當量點電位的理論值）,
  //     meter, meterUsed, pink（整瓶看得到粉紅色）, cMnO4, held（粉紅色已經持續的秒數）, mno2（看得到 MnO2 棕色混濁）, fMnO2（還原成 MnO2 的比例）,
  //     H（[H+] M）, excess（還原劑已經用完）, empty, halfSeen（這一瓶曾停在半當量點量電位）, firstDur（這一瓶第一次粉紅色持續多久）,
  //     mystery, curves（圖上的曲線）, at2（各瓶停在兩倍當量點時的電位）, firsts（各瓶第一次粉紅色消失的紀錄）
  //   'settle'：一次加入的液體全部落進瓶中、停下來的時候
  //   'fade'：瓶中的粉紅色消失的時候（再加上 dur 持續秒數、peak 最濃的 [MnO4-]、Vstart、first）
  //   'endpoint'：按「記錄終點」（再加上 Vend、err = Vend − Veq）
  //   'answer'：未知樣品按「核對答案」{ cMn, cFe, errMn, errFe（相對誤差）, revealed, flasksStd, flasksMx }
  const E = 1e-9;
  const isS = function (ev) { return ev.type === 'settle' && ev.data; };
  const isF = function (ev) { return ev.type === 'fade' && ev.data; };
  const isE = function (ev) { return ev.type === 'endpoint' && ev.data; };
  const isA = function (ev) { return ev.type === 'answer' && ev.data && !ev.data.revealed; };
  const oxal = function (d) { return d.sys === 'ox' || d.sys === 'std'; };

  LabMission.register('redox-titration', [
    {
      id: 'redox-titration-1', level: 1,
      title: { zh: '紫色留下來了', en: 'The purple stays' },
      desc: { zh: '用 KMnO4 滴定 Fe2+，加到整瓶溶液出現淡淡的粉紅色、不再消失。', en: 'Titrate Fe2+ with KMnO4 until the whole flask turns a faint pink that no longer fades.' },
      check: function (ev) { const d = ev.data; return isS(ev) && d.sys === 'fe' && d.pink && d.excess; }
    },
    {
      id: 'redox-titration-2', level: 2,
      title: { zh: '讀彎月面的上緣', en: 'Read the top of the meniscus' },
      desc: { zh: '讓滴定管的讀數停在 15.00 mL。KMnO4 顏色太深，看不到彎月面的最低點，要讀上緣。', en: 'Stop with the burette reading exactly 15.00 mL. KMnO4 is too dark to see the bottom of the meniscus, so read its top edge.' },
      check: function (ev) { const d = ev.data; return isS(ev) && Math.abs(d.Vread - 15) < 1e-6; }
    },
    {
      id: 'redox-titration-3', level: 3,
      title: { zh: '自身指示劑', en: 'Its own indicator' },
      desc: { zh: 'Fe2+ ← KMnO4：整瓶出現淡粉紅色時按「記錄終點」，終點和當量點相差不超過 0.10 mL。', en: 'Fe2+ ← KMnO4: press “Record end point” when the whole flask turns faint pink; it must be within 0.10 mL of the equivalence point.' },
      check: function (ev) { const d = ev.data; return isE(ev) && d.sys === 'fe' && d.pink && Math.abs(d.err) <= 0.1 + E; }
    },
    {
      id: 'redox-titration-4', level: 4,
      title: { zh: '一半的鐵', en: 'Half of the iron' },
      desc: { zh: 'Fe2+ ← KMnO4，鉑電極放在瓶中：剛好加入當量點一半的體積（±0.05 mL），看電位計：這時電位等於 Fe3+/Fe2+ 的標準還原電位。', en: 'Fe2+ ← KMnO4 with the platinum electrode in the flask: add exactly half the equivalence volume (±0.05 mL) and read the potential — it equals the standard reduction potential of Fe3+/Fe2+.' },
      check: function (ev) { const d = ev.data; return isS(ev) && d.sys === 'fe' && d.meter && d.E != null && Math.abs(d.V - d.Veq / 2) <= 0.05 + E; }
    },
    {
      id: 'redox-titration-5', level: 4,
      title: { zh: '1 : 5 的設計', en: 'Designed with 1 : 5' },
      desc: { zh: 'Fe2+ ← KMnO4：自己調濃度與體積，讓當量點剛好是 20.00 mL，再用顏色找到終點（誤差 ≤ 0.10 mL）。', en: 'Fe2+ ← KMnO4: choose the concentrations and volume so that the equivalence point is exactly 20.00 mL, then find the end point by colour (within 0.10 mL).' },
      check: function (ev) { const d = ev.data; return isE(ev) && d.sys === 'fe' && d.pink && Math.abs(d.Veq - 20) <= 0.01 + E && Math.abs(d.err) <= 0.1 + E; }
    },
    {
      id: 'redox-titration-6', level: 5,
      title: { zh: '當量點的電位', en: 'Potential at equivalence' },
      desc: { zh: 'Fe2+ ← KMnO4，鉑電極放在瓶中：剛好停在當量點，電位計的讀數和加權平均公式算出的當量點電位相差不超過 0.02 V。', en: 'Fe2+ ← KMnO4 with the platinum electrode in: stop exactly at the equivalence point, where the meter must agree with the weighted-average equivalence potential within 0.02 V.' },
      check: function (ev) { const d = ev.data; return isS(ev) && d.sys === 'fe' && d.meter && d.E != null && Math.abs(d.V - d.Veq) <= 1e-6 && Math.abs(d.E - d.Eeq) <= 0.02 + E; }
    },
    {
      id: 'redox-titration-7', level: 5,
      title: { zh: '溫熱的草酸', en: 'Warm oxalic acid' },
      desc: { zh: '草酸 ← KMnO4：先把加熱板調到 60–80 °C，再用顏色找到終點（誤差 ≤ 0.10 mL）。', en: 'Oxalic acid ← KMnO4: set the hot plate to 60–80 °C first, then find the end point by colour (within 0.10 mL).' },
      check: function (ev) { const d = ev.data; return isE(ev) && d.sys === 'ox' && d.T >= 60 - E && d.T <= 80 + E && d.pink && Math.abs(d.err) <= 0.1 + E; }
    },
    {
      id: 'redox-titration-8', level: 6,
      title: { zh: '越反應越快', en: 'Faster and faster' },
      desc: { zh: '草酸 ← KMnO4，加熱到 55–85 °C：第一滴的粉紅色要等 20 秒以上才褪去；同一瓶後來再加一滴，粉紅色 2 秒內就消失。', en: 'Oxalic acid ← KMnO4 at 55–85 °C: the pink of the first drop takes more than 20 s to fade; later in the same flask, a drop’s pink vanishes within 2 s.' },
      check: function (ev) { const d = ev.data; return isF(ev) && oxal(d) && d.T >= 55 - E && d.T <= 85 + E && !d.first && d.firstDur != null && d.firstDur >= 20 && d.dur <= 2; }
    },
    {
      id: 'redox-titration-9', level: 6,
      title: { zh: '三十秒不褪色', en: 'Thirty seconds of pink' },
      desc: { zh: '等粉紅色維持 30 秒以上（可以用「快轉等待」）再按「記錄終點」，終點和當量點相差不超過 0.05 mL。', en: 'Wait until the pink has lasted at least 30 s (“Fast-forward” helps) before you press “Record end point”; it must be within 0.05 mL of the equivalence point.' },
      check: function (ev) { const d = ev.data; return isE(ev) && !d.mystery && d.pink && d.held >= 30 - E && Math.abs(d.err) <= 0.05 + E; }
    },
    {
      id: 'redox-titration-10', level: 7,
      title: { zh: '標定過錳酸鉀', en: 'Standardise the permanganate' },
      desc: { zh: '「標定 KMnO4」：用精稱的草酸晶體滴定濃度未知的 KMnO4，算出它的濃度，核對答案：誤差不超過 0.5%（揭曉答案之後不算）。', en: '“Standardise KMnO4”: titrate a weighed amount of oxalic acid crystals with the KMnO4 of unknown concentration, work out its concentration and check: within 0.5% (not after “Reveal”).' },
      check: function (ev) { const d = ev.data; return isA(ev) && isFinite(d.errMn) && Math.abs(d.errMn) <= 0.005 + E; }
    },
    {
      id: 'redox-titration-11', level: 8,
      title: { zh: '未知的鐵', en: 'The unknown iron' },
      desc: { zh: '用同一瓶濃度未知的 KMnO4 滴定「未知 Fe2+」，算出 Fe2+ 的濃度，核對答案：誤差不超過 1%（要先標定；揭曉答案之後不算）。', en: 'Titrate the “Unknown Fe2+” with the same KMnO4 of unknown concentration and work out the Fe2+ concentration: within 1% (standardise first; not after “Reveal”).' },
      check: function (ev) { const d = ev.data; return isA(ev) && isFinite(d.errFe) && Math.abs(d.errFe) <= 0.01 + E; }
    },
    {
      id: 'redox-titration-12', level: 10,
      title: { zh: '大師：兩瓶定案', en: 'Master: two flasks, case closed' },
      desc: { zh: '同一組未知樣品，標定只准用一瓶、未知 Fe2+ 也只准用一瓶，KMnO4 與 Fe2+ 的濃度誤差都不超過 0.3%（揭曉答案之後不算）。', en: 'For one set of unknowns, use a single flask to standardise and a single flask of the unknown Fe2+: both the KMnO4 and the Fe2+ concentrations within 0.3% (not after “Reveal”).' },
      check: function (ev) {
        const d = ev.data;
        return isA(ev) && d.flasksStd <= 1 && d.flasksMx <= 1 && isFinite(d.errMn) && isFinite(d.errFe) && Math.abs(d.errMn) <= 0.003 + E && Math.abs(d.errFe) <= 0.003 + E;
      }
    },
    // ---------- 隱藏任務：只給隱晦的提示 ----------
    {
      id: 'redox-titration-h1', level: 3, hidden: true,
      riddle: { zh: '少了一味，紫色在半路停了下來，變成泥。', en: 'One ingredient short, the violet stops halfway and turns to mud.' },
      check: function (ev) { const d = ev.data; return (isS(ev) || isF(ev)) && oxal(d) && d.mno2; }
    },
    {
      id: 'redox-titration-h2', level: 4, hidden: true,
      riddle: { zh: '冷冷的初次見面，就當成了永遠。', en: 'A cold first meeting, mistaken for forever.' },
      check: function (ev) { const d = ev.data; return isE(ev) && oxal(d) && d.T <= 35 + E && d.pink && d.Vend <= 0.5 * d.Veq; }
    },
    {
      id: 'redox-titration-h3', level: 5, hidden: true,
      riddle: { zh: '愛得太燙，有一部分化成了風。', en: 'Loved too hot, part of it turned into wind.' },
      check: function (ev) { const d = ev.data; return isE(ev) && oxal(d) && d.T >= 88 - E && d.pink && d.excess && d.err <= -0.25; }
    },
    {
      id: 'redox-titration-h4', level: 5, hidden: true,
      riddle: { zh: '不看指針，只看臉紅。', en: 'Never watch the needle; watch the blush.' },
      check: function (ev) { const d = ev.data; return isE(ev) && d.sys === 'fe' && !d.meterUsed && d.pink && Math.abs(d.err) <= 0.03 + E; }
    },
    {
      id: 'redox-titration-h5', level: 6, hidden: true,
      riddle: { zh: '同一句開場白，換了季節，等待差了十倍。', en: 'The same opening line in another season: ten times the wait.' },
      check: function (ev) {
        const d = ev.data;
        if (!isF(ev) || !oxal(d) || !d.first || !d.firsts) return false;
        const a = d.firsts.filter(function (x) { return (x.sys === 'ox' || x.sys === 'std') && x.Vstart <= 0.1 + E; });
        return a.some(function (x) { return a.some(function (y) { return y.T - x.T >= 20 - E && x.dur >= 10 * y.dur; }); });
      }
    },
    {
      id: 'redox-titration-h6', level: 7, hidden: true,
      riddle: { zh: '紫色積成了夜，天亮卻在一瞬間。', en: 'Violet piles up into night, yet dawn comes in an instant.' },
      check: function (ev) { const d = ev.data; return isF(ev) && oxal(d) && d.first && !d.excess && d.peak >= 5e-4 && !d.mno2; }
    },
    {
      id: 'redox-titration-h7', level: 7, hidden: true,
      riddle: { zh: '淡了十倍，神情依舊。', en: 'Ten times fainter, the same expression.' },
      check: function (ev) {
        const d = ev.data;
        if (!isS(ev) || !d.curves) return false;
        const c = d.curves.filter(function (q) { return q.sys === 'fe' && q.Vmax >= 1.5 * q.Veq - E; });
        return c.some(function (a) {
          return c.some(function (b) { return a.Ca >= 10 * b.Ca * (1 - 1e-6) && Math.abs(a.Veq - b.Veq) <= 0.01 + E && Math.abs(a.Vacid - b.Vacid) <= E && Math.abs(a.Va - b.Va) <= E; });
        });
      }
    },
    {
      id: 'redox-titration-h8', level: 8, hidden: true,
      riddle: { zh: '誠意不夠的人，總要多付一些代價。', en: 'Whoever brings too little sincerity always ends up paying more.' },
      check: function (ev) { const d = ev.data; return isE(ev) && d.sys === 'fe' && d.excess && d.fMnO2 >= 0.5 && d.Vend >= 1.5 * d.Veq; }
    },
    {
      id: 'redox-titration-h9', level: 9, hidden: true,
      riddle: { zh: '走到一半，遇見一位主人；走到加倍，遇見另一位。', en: 'Halfway, you meet one master; at twice the way, the other.' },
      check: function (ev) { const d = ev.data; return isS(ev) && d.sys === 'fe' && d.meter && d.E != null && d.halfSeen && !d.empty && Math.abs(d.V - 2 * d.Veq) <= 0.05 + E; }
    },
    {
      id: 'redox-titration-h10', level: 10, hidden: true,
      riddle: { zh: '八個小兵，決定了國王站得多高。', en: 'Eight foot soldiers decide how high the king stands.' },
      check: function (ev) {
        const d = ev.data;
        if (!isS(ev) || !d.at2) return false;
        const a = d.at2.filter(function (x) { return x.fMnO2 < 0.01; });
        return a.some(function (x) { return a.some(function (y) { return y.E - x.E >= 0.05 - E; }); });
      }
    }
  ]);
})();
