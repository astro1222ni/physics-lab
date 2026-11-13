/* missions/energy-flow.js — 生態系的能量流動的任務（一般任務星星 = 等級；隱藏任務 = 等級 × 2）
 * 事件（js/energy-flow.js 在使用者改了設定、停手約半秒後送出）：
 *   'flow'：N（營養階層數）、I、eps、rp、dec、bcf、alpha、elim、view（'energy'／'biomass'／'numbers'／'poll'）、
 *           ce、ae、pe、pb、mass（每一階的設定，索引 0 = 第 1 階；第 1 階的 ce、ae、pe 為 0）、
 *           GPP、NPP、A、R、P、E（傳遞效率 An/A(n−1)，E[0] = null）、bio（鮮重 g/m²）、num（個體/m²）、area（每隻需要的 m²）、
 *           conc（污染物濃度是水的幾倍）、bmf、flux、D（碎屑）、ing（所有消費者吃進去的總量）、heat、store
 *           陣列長度都是 N。
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const EPS = 1e-9;
  const flow = function (ev) { return ev.type === 'flow'; };
  function invertedAt(v, n) { return v[n] > v[n - 1]; }
  function anyInverted(v) { for (let n = 1; n < v.length; n++) if (invertedAt(v, n)) return true; return false; }
  function relNear(a, b, tol) { return isFinite(a) && Math.abs(a / b - 1) <= tol + EPS; }

  LabMission.register('energy-flow', [
    {
      id: 'energy-flow-1', level: 1,
      title: { zh: '再往上一層', en: 'One more level' },
      desc: { zh: '把食物鏈加長到 5 個營養階層，看看最上面那一層還分到多少能量。', en: 'Lengthen the food chain to 5 trophic levels and see how much energy is left for the top one.' },
      check: function (ev) { return flow(ev) && ev.data.N === 5; }
    },
    {
      id: 'energy-flow-2', level: 2,
      title: { zh: '十萬焦', en: 'A hundred thousand kilojoules' },
      desc: { zh: '讓生產者的總生產量 GPP 達到每平方公尺每年 100,000 kJ 以上（日照與光合效率都可以調）。', en: 'Get the producers’ gross primary production (GPP) to at least 100,000 kJ per square metre per year (you can change the sunlight and the photosynthetic efficiency).' },
      check: function (ev) { return flow(ev) && ev.data.GPP >= 1e5 - EPS; }
    },
    {
      id: 'energy-flow-3', level: 3,
      title: { zh: '十分之一', en: 'One tenth' },
      desc: { zh: '讓初級消費者（第 2 階）的傳遞效率剛好是 10%（誤差 0.2 個百分點以內）。傳遞效率 = 這一階同化的能量 ÷ 上一階同化的能量。', en: 'Make the transfer efficiency of the primary consumers (level 2) exactly 10% (within 0.2 percentage points). Transfer efficiency = energy assimilated by this level ÷ energy assimilated by the level below.' },
      check: function (ev) { const d = ev.data; return flow(ev) && d.N >= 2 && Math.abs(d.E[1] - 0.1) <= 0.002 + EPS; }
    },
    {
      id: 'energy-flow-4', level: 4,
      title: { zh: '倒立的生物量金字塔', en: 'An upside-down pyramid of biomass' },
      desc: { zh: '在「生物量」金字塔上，找出一個上面一階比下面一階還重的生態系。', en: 'On the biomass pyramid, find an ecosystem where some level weighs more than the level below it.' },
      check: function (ev) { const d = ev.data; return flow(ev) && d.view === 'biomass' && anyInverted(d.bio); }
    },
    {
      id: 'energy-flow-5', level: 4,
      title: { zh: '越吃越淡', en: 'Diluted up the chain' },
      desc: { zh: '至少 4 個營養階層，調整污染物的吸收比例 α 與排出比例 e，讓污染物在每一階都比下面一階更稀。', en: 'With at least 4 trophic levels, change how much of the pollutant is absorbed (α) and excreted (e) so that it becomes more dilute at every step up the chain.' },
      check: function (ev) {
        const d = ev.data; if (!flow(ev) || d.N < 4) return false;
        for (let n = 1; n < d.N; n++) if (!(d.bmf[n] < 1)) return false;
        return true;
      }
    },
    {
      id: 'energy-flow-6', level: 5,
      title: { zh: '一棵樹上的客人', en: 'Guests on one tree' },
      desc: { zh: '在「個體數」金字塔上，做出某一階的個體數比下面一階多、但生物量卻比下面一階少的情形。', en: 'On the numbers pyramid, make some level have more individuals than the level below while weighing less than it.' },
      check: function (ev) {
        const d = ev.data; if (!flow(ev) || d.view !== 'numbers') return false;
        for (let n = 1; n < d.N; n++) if (invertedAt(d.num, n) && !invertedAt(d.bio, n)) return true;
        return false;
      }
    },
    {
      id: 'energy-flow-7', level: 5,
      title: { zh: '百萬倍', en: 'A million times' },
      desc: { zh: '讓最高一階消費者體內的污染物濃度達到水中濃度的 1,000,000 倍以上——這大約是 1960 年代美國長島沼澤裡 DDT 的情形。', en: 'Make the pollutant in the top consumer at least 1,000,000 times as concentrated as in the water — roughly what DDT did in a Long Island marsh in the 1960s.' },
      check: function (ev) { const d = ev.data; return flow(ev) && d.N >= 2 && d.conc[d.N - 1] >= 1e6 - EPS; }
    },
    {
      id: 'energy-flow-8', level: 6,
      title: { zh: '千分之一', en: 'One in a thousand' },
      desc: { zh: '在 4 個營養階層的食物鏈裡，讓第 4 階同化的能量剛好是生產者總生產量的 0.1%（相對誤差 3% 以內）。', en: 'In a food chain of 4 trophic levels, make the energy assimilated by level 4 exactly 0.1% of the producers’ gross production (within 3%).' },
      check: function (ev) { const d = ev.data; return flow(ev) && d.N === 4 && relNear(d.A[3] / d.GPP, 0.001, 0.03); }
    },
    {
      id: 'energy-flow-9', level: 7,
      title: { zh: '六層的食物鏈', en: 'A six-level food chain' },
      desc: { zh: '讓食物鏈有 6 個營養階層，而且第 6 階一年的淨生產量至少有每平方公尺 1 kJ。', en: 'Build a food chain of 6 trophic levels whose level 6 still has a net production of at least 1 kJ per square metre per year.' },
      check: function (ev) { const d = ev.data; return flow(ev) && d.N === 6 && d.P[5] >= 1 - EPS; }
    },
    {
      id: 'energy-flow-10', level: 9,
      title: { zh: '銀泉的帳本', en: 'The Silver Springs ledger' },
      desc: { zh: 'Odum（1957）量了佛羅里達州銀泉一整年的能量（kcal/m²/年）：生產者總生產 20,810、淨生產 8,833；草食動物淨生產 1,478；肉食動物 67；頂級肉食動物 6。用 4 個營養階層重現這四個比例：NPP/GPP、第 2 階/第 1 階、第 3 階/第 2 階、第 4 階/第 3 階的淨生產量（各自相對誤差 3% 以內）。', en: 'Odum (1957) measured a whole year of energy flow at Silver Springs, Florida (kcal/m²/yr): gross production 20,810 and net production 8,833 by the producers; net production 1,478 by the herbivores, 67 by the carnivores and 6 by the top carnivores. With 4 trophic levels, reproduce the four ratios NPP/GPP and the net production of level 2/level 1, level 3/level 2 and level 4/level 3 (each within 3%).' },
      check: function (ev) {
        const d = ev.data; if (!flow(ev) || d.N !== 4) return false;
        return relNear(d.NPP / d.GPP, 8833 / 20810, 0.03) && relNear(d.P[1] / d.P[0], 1478 / 8833, 0.03) &&
          relNear(d.P[2] / d.P[1], 67 / 1478, 0.03) && relNear(d.P[3] / d.P[2], 6 / 67, 0.03);
      }
    },

    // ---------- 隱藏任務 ----------
    {
      id: 'energy-flow-h1', level: 3, hidden: true,
      title: { zh: '一張嘴也沒有', en: 'Not a single mouth' },
      desc: { zh: '沒有一張嘴，太陽給的，仍一分不少地還給了天空。', en: 'Not a single mouth — and still every bit the sun gave is handed back to the sky.' },
      check: function (ev) { const d = ev.data; return flow(ev) && d.N === 1 && d.dec >= 1 - EPS; }
    },
    {
      id: 'energy-flow-h2', level: 4, hidden: true,
      title: { zh: '留給後世', en: 'Left for later ages' },
      desc: { zh: '這片土地留給後世的，比它還給天空的還多。', en: 'This land leaves more to the ages to come than it gives back to the sky.' },
      check: function (ev) { const d = ev.data; return flow(ev) && d.store > d.heat; }
    },
    {
      id: 'energy-flow-h3', level: 5, hidden: true,
      title: { zh: '落葉底下的餐桌', en: 'The table under the leaves' },
      desc: { zh: '森林裡最大的一張餐桌，擺在落葉底下——不多不少，正好是所有的嘴加起來的五十倍。', en: 'The biggest table in the forest is laid under the fallen leaves — exactly fifty times all the mouths put together.' },
      check: function (ev) { const d = ev.data; return flow(ev) && d.N >= 2 && d.ing > 0 && Math.abs(d.D / d.ing / 50 - 1) <= 0.02 + EPS; }
    },
    {
      id: 'energy-flow-h4', level: 5, hidden: true,
      title: { zh: '綠色的世界', en: 'A green world' },
      desc: { zh: '世界之所以是綠的，是因為吃葉子的，一直被看守著。', en: 'The world is green because whoever eats the leaves is always being watched.' },
      check: function (ev) {
        const d = ev.data; if (!flow(ev) || d.N < 4 || !(d.ce[1] <= 0.1 + EPS)) return false;
        for (let n = 2; n < d.N; n++) if (!(d.ce[n] >= 0.9 - EPS)) return false;
        return true;
      }
    },
    {
      id: 'energy-flow-h5', level: 6, hidden: true,
      title: { zh: '一粒也沒少', en: 'Not one grain lost' },
      desc: { zh: '一路上沒有誰剩下，也沒有誰吐出來；到了頂端，一粒也沒少。', en: 'Nobody left any behind, nobody spat any out; at the top, not one grain is missing.' },
      check: function (ev) {
        const d = ev.data; if (!flow(ev) || d.N < 4) return false;
        for (let n = 1; n < d.N; n++) if (!(Math.abs(d.flux[n] / d.flux[0] - 1) <= 0.01)) return false;
        return true;
      }
    },
    {
      id: 'energy-flow-h6', level: 7, hidden: true,
      title: { zh: '兇猛的大型動物', en: 'Big fierce animals' },
      desc: { zh: '越大越兇的，越是稀少：牠獨自守著一整座山。', en: 'The bigger and fiercer, the rarer: it guards a whole mountain alone.' },
      check: function (ev) { const d = ev.data; return flow(ev) && d.N >= 3 && d.mass[d.N - 1] >= 1e5 - EPS && d.area[d.N - 1] >= 1e8; }
    },
    {
      id: 'energy-flow-h7', level: 7, hidden: true,
      title: { zh: '一天換一次衣服', en: 'A new coat every day' },
      desc: { zh: '天天換新衣的主人，養得起十倍重的客人。', en: 'A host who changes clothes every day can feed guests ten times as heavy.' },
      check: function (ev) { const d = ev.data; return flow(ev) && d.N >= 2 && d.view === 'biomass' && d.bio[1] >= 10 * d.bio[0] - EPS; }
    },
    {
      id: 'energy-flow-h8', level: 8, hidden: true,
      title: { zh: '沼澤裡的帳本', en: 'The ledger of a bog' },
      desc: { zh: '一位只活了二十七歲的年輕人，在一座會結冰的沼澤裡，第一次替能量一層一層地記帳。', en: 'A young man who lived only twenty-seven years kept the first level-by-level ledger of energy, in a bog that froze over each winter.' },
      check: function (ev) {
        const d = ev.data;
        return flow(ev) && d.N >= 3 && Math.abs(d.eps - 0.001) <= 0.00005 + EPS && Math.abs(d.E[1] - 0.133) <= 0.003 + EPS && Math.abs(d.E[2] - 0.223) <= 0.005 + EPS;
      }
    },
    {
      id: 'energy-flow-h9', level: 9, hidden: true,
      title: { zh: '倒立的城堡', en: 'A castle on its head' },
      desc: { zh: '每一層都比下面那一層重，水卻照樣往上流得越來越少。', en: 'Every storey is heavier than the one below, and still less and less flows up through it.' },
      check: function (ev) {
        const d = ev.data; if (!flow(ev) || d.N < 4 || d.view !== 'biomass') return false;
        for (let n = 1; n < d.N; n++) if (!invertedAt(d.bio, n)) return false;
        return true;
      }
    },
    {
      id: 'energy-flow-h10', level: 10, hidden: true,
      title: { zh: '第六位客人', en: 'The sixth guest' },
      desc: { zh: '第六位客人入座時，桌上還剩一百。', en: 'When the sixth guest sits down, a hundred is still left on the table.' },
      check: function (ev) { const d = ev.data; return flow(ev) && d.N === 6 && d.P[5] >= 100 - EPS; }
    }
  ]);
})();
