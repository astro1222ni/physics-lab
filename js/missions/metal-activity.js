/* missions/metal-activity.js — 金屬活性序的任務（一般任務星星數 = 等級；隱藏任務 = 等級 × 2） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  // 事件（js/metal-activity.js 只在使用者操作過之後送出；開頁時的示範試管不送）：
  //   'observe'：一支試管觀察完畢（反應完成 99% 或滿 20 分鐘）時
  //     { rec, recs（這一段實驗所有已觀察的試管，不含示範試管）, tubes（這一段放過的試管數）, revealed }
  //     rec = { id, metal, liquid（'H2O'／'HCl'／金屬符號＝該金屬的硝酸鹽溶液）, kind（water／acid／ion）, type（disp／acid／water／none）,
  //             c（mol/L）, T（°C）, salt, hasCl, phph, reacted, e（mmol 電子）, eEq, atEq, metalFrac, oxFrac（剩下的氧化劑比例）,
  //             dep（mmol）, depSym, depMg（mg）, dm（金屬片質量變化 mg）, h2（mL）, r0（最大產氣速率 mL/min）, pH, ppt{種類: mmol},
  //             ions{符號: mol/L}, dE（V）, logK, disp／acid／water（'yes'／'no'／null） }
  //   'rank'：按「核對排序」時 { order（由活潑到不活潑）, ok, supported（相鄰兩個都有實驗證據）, conflicts, n,
  //             hasXYZ（含三種未知金屬）, tubes, unkTubes（這一輪用到未知金屬的試管數）, revealed }
  const isO = function (ev) { return ev.type === 'observe' && ev.data && ev.data.rec; };
  const isR = function (ev) { return ev.type === 'rank' && ev.data && ev.data.ok && ev.data.supported; };
  const recs = function (ev) { return ev.data.recs || [ev.data.rec]; };
  const has = function (arr, f) { return arr.some(f); };
  const STRIP8 = ['Mg', 'Al', 'Zn', 'Fe', 'Sn', 'Pb', 'Cu', 'Ag'];
  const ALL11 = ['K', 'Ca', 'Na', 'Mg', 'Al', 'Zn', 'Fe', 'Sn', 'Pb', 'Cu', 'Ag'];
  const includes = function (order, list) { return list.every(function (s) { return order.indexOf(s) >= 0; }); };

  LabMission.register('metal-activity', [
    {
      id: 'metal-activity-1', level: 1,
      title: { zh: '藍色褪去', en: 'The blue fades' },
      desc: { zh: '把一種金屬放進 Cu2+ 溶液，讓銅析出，直到藍色的 Cu2+ 剩不到原來的 10%。', en: 'Put a metal into the Cu2+ solution so that copper is deposited, until less than 10% of the blue Cu2+ is left.' },
      check: function (ev) { const r = isO(ev) && ev.data.rec; return !!r && r.liquid === 'Cu' && r.disp === 'yes' && r.oxFrac <= 0.1; }
    },
    {
      id: 'metal-activity-2', level: 2,
      title: { zh: '收集氫氣', en: 'Collect hydrogen' },
      desc: { zh: '讓一支試管放出至少 20 mL 的氫氣（25 °C、1 atm）。', en: 'Make one test tube give off at least 20 mL of hydrogen (25 °C, 1 atm).' },
      check: function (ev) { return isO(ev) && ev.data.rec.h2 >= 20; }
    },
    {
      id: 'metal-activity-3', level: 2,
      title: { zh: '銀樹', en: 'A silver tree' },
      desc: { zh: '把銅片放進 Ag+ 溶液，讓銅片上長出至少 50 mg 的銀。', en: 'Put a copper strip into the Ag+ solution and grow at least 50 mg of silver on it.' },
      check: function (ev) { const r = isO(ev) && ev.data.rec; return !!r && r.metal === 'Cu' && r.liquid === 'Ag' && r.depMg >= 50; }
    },
    {
      id: 'metal-activity-4', level: 3,
      title: { zh: '不動如山', en: 'Nothing happens' },
      desc: { zh: '把一種金屬放進活性比它大的金屬的離子溶液（兩者 E° 至少差 0.2 V），確認完全沒有反應。', en: 'Put a metal into a solution of the ions of a more reactive metal (E° at least 0.2 V apart) and confirm that nothing happens.' },
      check: function (ev) { const r = isO(ev) && ev.data.rec; return !!r && r.disp === 'no' && r.dE <= -0.2; }
    },
    {
      id: 'metal-activity-5', level: 4,
      title: { zh: '變重的金屬片', en: 'A strip that gets heavier' },
      desc: { zh: '做一個置換反應，讓金屬片（連同析出的金屬）比原來重至少 100 mg。', en: 'Carry out a displacement reaction in which the strip (with the deposited metal) ends up at least 100 mg heavier.' },
      check: function (ev) { const r = isO(ev) && ev.data.rec; return !!r && r.disp === 'yes' && r.dm >= 100; }
    },
    {
      id: 'metal-activity-6', level: 5,
      title: { zh: '粉紅色的水', en: 'Pink water' },
      desc: { zh: '在純水裡先加酚酞，放進一種金屬，讓水變成 pH ≥ 10 的粉紅色。', en: 'Add phenolphthalein to pure water, drop in a metal and turn the water pink at pH ≥ 10.' },
      check: function (ev) { const r = isO(ev) && ev.data.rec; return !!r && r.kind === 'water' && r.phph && r.pH >= 10; }
    },
    {
      id: 'metal-activity-7', level: 6,
      title: { zh: '三種金屬排順序', en: 'Three metals in order' },
      desc: { zh: '點金屬排好至少 3 種再按「核對排序」：順序正確，而且每相鄰兩種都有試管的實驗證據。', en: 'Tap at least 3 metals into order and press “Check the order”: the order must be right, with test-tube evidence for every neighbouring pair.' },
      check: function (ev) { return isR(ev) && ev.data.n >= 3; }
    },
    {
      id: 'metal-activity-8', level: 7,
      title: { zh: '五種金屬的隊伍', en: 'A line of five' },
      desc: { zh: '排好至少 5 種金屬，順序正確、每相鄰兩種都有證據。', en: 'Put at least 5 metals in the right order, with evidence for every neighbouring pair.' },
      check: function (ev) { return isR(ev) && ev.data.n >= 5; }
    },
    {
      id: 'metal-activity-9', level: 8,
      title: { zh: '未知金屬', en: 'Unknown metals' },
      desc: { zh: '打開「未知金屬挑戰」，用實驗排出 X、Y、Z 的活性順序（每相鄰兩種都有證據，揭曉之前）。', en: 'Turn on “Unknown-metal challenge” and find the order of X, Y and Z by experiment (evidence for every neighbouring pair, before revealing).' },
      check: function (ev) { return isR(ev) && ev.data.hasXYZ && !ev.data.revealed; }
    },
    {
      id: 'metal-activity-10', level: 9,
      title: { zh: '三支試管就夠', en: 'Three test tubes are enough' },
      desc: { zh: '同一輪未知金屬，只用不超過 3 支含有 X、Y、Z 的試管，就排對 X、Y、Z。', en: 'In one round of unknown metals, get X, Y and Z right using no more than 3 test tubes that contain X, Y or Z.' },
      check: function (ev) { return isR(ev) && ev.data.hasXYZ && !ev.data.revealed && ev.data.unkTubes <= 3; }
    },
    {
      id: 'metal-activity-11', level: 10,
      title: { zh: '完整的活性序', en: 'The whole series' },
      desc: { zh: '把 11 種已知金屬（鉀、鈣、鈉、鎂、鋁、鋅、鐵、錫、鉛、銅、銀）全部排對，每相鄰兩種都有證據。', en: 'Put all 11 known metals (K, Ca, Na, Mg, Al, Zn, Fe, Sn, Pb, Cu, Ag) in the right order, with evidence for every neighbouring pair.' },
      check: function (ev) { return isR(ev) && includes(ev.data.order, ALL11); }
    },

    // ======================= 隱藏任務 =======================
    {
      // 鋅與銅的原子量只差 1.83：Cu2+ 用完、鋅片還在，析出的銅 ≥ 70 mg，金屬片質量變化卻不到析出量的 5%
      id: 'metal-activity-h1', level: 3, hidden: true,
      riddle: { zh: '換了一身衣裳，秤上的數字卻幾乎不動。', en: 'It changed its whole coat, yet the scale hardly moved.' },
      check: function (ev) {
        const r = isO(ev) && ev.data.rec;
        return !!r && r.metal === 'Zn' && r.liquid === 'Cu' && r.depMg >= 70 && Math.abs(r.dm) <= 0.05 * r.depMg && r.oxFrac <= 0.02 && r.metalFrac >= 0.1;
      }
    },
    {
      // 限量試劑：同一組金屬與溶液做兩次，一次離子先用完（金屬有剩），一次金屬先溶完（離子剩 ≥ 20%）
      id: 'metal-activity-h2', level: 4, hidden: true,
      riddle: { zh: '同一對舞伴跳了兩次：一次她先累倒，一次他先離場。', en: 'The same pair danced twice: once she tired first, once he left first.' },
      check: function (ev) {
        if (!isO(ev)) return false;
        const r = ev.data.rec, L = recs(ev).filter(function (q) { return q.disp === 'yes' && q.metal === r.metal && q.liquid === r.liquid; });
        const ionOut = function (q) { return q.oxFrac <= 0.02 && q.metalFrac >= 0.05; };
        const metalOut = function (q) { return q.metalFrac <= 0.02 && q.oxFrac >= 0.2; };
        return r.disp === 'yes' && ((ionOut(r) && has(L, metalOut)) || (metalOut(r) && has(L, ionOut)));
      }
    },
    {
      // 鎂：冷水（≤ 30 °C）看不出反應，熱水（≥ 70 °C）冒氫氣
      id: 'metal-activity-h3', level: 5, hidden: true,
      riddle: { zh: '冷的時候裝睡，熱了才肯吐氣。', en: 'It plays dead in the cold and only breathes out when warmed.' },
      check: function (ev) {
        if (!isO(ev)) return false;
        const L = recs(ev).filter(function (q) { return q.metal === 'Mg' && q.kind === 'water'; });
        return ev.data.rec.metal === 'Mg' && ev.data.rec.kind === 'water' &&
          has(L, function (q) { return q.T <= 30 && !q.reacted; }) && has(L, function (q) { return q.T >= 70 && q.reacted; });
      }
    },
    {
      // 化學計量剛好：金屬與氧化劑（離子或 H+）都用到 3% 以下
      id: 'metal-activity-h4', level: 6, hidden: true,
      riddle: { zh: '誰也沒剩下，誰也不欠誰。', en: 'Nobody left over, nobody owing anybody.' },
      check: function (ev) {
        const r = isO(ev) && ev.data.rec;
        return !!r && (r.type === 'disp' || r.type === 'acid') && r.reacted && r.metalFrac <= 0.03 && r.oxFrac != null && r.oxFrac <= 0.03;
      }
    },
    {
      // 熱力學與動力學：鈣的 E° 比鈉負，同溫的冷水裡鈉卻反應得比鈣劇烈
      id: 'metal-activity-h5', level: 6, hidden: true,
      riddle: { zh: '排在前面的，不一定跑得比較快。', en: 'Standing further ahead in line does not mean running faster.' },
      check: function (ev) {
        if (!isO(ev)) return false;
        const L = recs(ev).filter(function (q) { return q.kind === 'water' && q.reacted && q.T <= 40; });
        const r = ev.data.rec;
        if (!(r.kind === 'water' && (r.metal === 'Na' || r.metal === 'Ca'))) return false;
        return L.some(function (na) {
          return na.metal === 'Na' && L.some(function (ca) { return ca.metal === 'Ca' && Math.abs(na.T - ca.T) <= 5 && na.r0 > ca.r0; });
        });
      }
    },
    {
      // 鋁的氧化膜：同一種離子溶液，沒有 Cl- 時看不出反應，有 Cl- 時析出金屬
      id: 'metal-activity-h6', level: 7, hidden: true,
      riddle: { zh: '最勤快的工人穿著看不見的盔甲；一撮海的味道，讓他卸下。', en: 'The busiest worker wears invisible armour; a pinch of the sea makes him take it off.' },
      check: function (ev) {
        if (!isO(ev)) return false;
        const r = ev.data.rec;
        if (r.metal !== 'Al' || r.kind !== 'ion') return false;
        const L = recs(ev).filter(function (q) { return q.metal === 'Al' && q.liquid === r.liquid && q.kind === 'ion'; });
        return has(L, function (q) { return !q.hasCl && q.disp === 'no'; }) && has(L, function (q) { return q.hasCl && q.disp === 'yes'; });
      }
    },
    {
      // 氫在活性序中的位置：鉛（最慢的那個）和鹽酸有反應，銅沒有
      id: 'metal-activity-h7', level: 7, hidden: true,
      riddle: { zh: '最輕的那位不是金屬，卻在隊伍裡有座位；找出坐在他兩旁的鄰居。', en: 'The lightest one is no metal, yet it has a seat in the line; find the neighbours sitting on either side of it.' },
      check: function (ev) {
        if (!isO(ev) || ev.data.rec.kind !== 'acid') return false;
        const L = recs(ev);
        return has(L, function (q) { return q.metal === 'Pb' && q.acid === 'yes'; }) && has(L, function (q) { return q.metal === 'Cu' && q.acid === 'no'; });
      }
    },
    {
      // 鹼金屬（鉀、鈉、鈣）放進 Cu2+：和水反應生成藍色 Cu(OH)2 而不析出銅；OH- 過量時酚酞變紅；同一段實驗另有金屬從 Cu2+ 置換出銅
      id: 'metal-activity-h8', level: 8, hidden: true,
      riddle: { zh: '最急躁的騎士衝進藍色的湖，撈不到半點紅銅，只攪起一片藍雲；最後，湖水紅了臉。', en: 'The most hot-headed knight charged into the blue lake. He fished up no copper at all, only stirred up a blue cloud — and in the end the lake blushed.' },
      check: function (ev) {
        if (!isO(ev)) return false;
        const r = ev.data.rec;
        const hit = function (q) { return (q.metal === 'K' || q.metal === 'Na' || q.metal === 'Ca') && q.liquid === 'Cu' && (q.ppt.CuOH2 || 0) >= 0.05 && !(q.dep > 0) && q.phph && q.pH >= 9; };
        const L = recs(ev);
        const other = function (q) { return q.liquid === 'Cu' && q.disp === 'yes'; };
        return (hit(r) && has(L, other)) || (other(r) && has(L, hit));
      }
    },
    {
      // 錫與鉛：從兩邊出發都到達平衡，[Sn2+]/[Pb2+] 相同（= K ≈ 2.4，相差 10% 以內）
      id: 'metal-activity-h9', level: 9, hidden: true,
      riddle: { zh: '兩位鄰居互相搬進對方的家，最後住成了同一個比例。', en: 'Two neighbours kept moving into each other’s houses until they settled in the same proportion.' },
      check: function (ev) {
        if (!isO(ev)) return false;
        const r = ev.data.rec;
        const ratio = function (q) { return q.ions && q.ions.Pb > 0 ? q.ions.Sn / q.ions.Pb : NaN; };
        const a = function (q) { return q.metal === 'Sn' && q.liquid === 'Pb' && q.reacted && q.atEq; };
        const b = function (q) { return q.metal === 'Pb' && q.liquid === 'Sn' && q.reacted && q.atEq; };
        if (!a(r) && !b(r)) return false;
        const L = recs(ev);
        return L.some(function (p) { return a(p) && L.some(function (q) { return b(q) && Math.abs(ratio(p) / ratio(q) - 1) <= 0.1; }); });
      }
    },
    {
      // 最少的實驗：鎂、鋁、鋅、鐵、錫、鉛、銅、銀八種排對，相鄰都有證據，這一段實驗總共只放了 7 支試管
      id: 'metal-activity-h10', level: 10, hidden: true,
      riddle: { zh: '七座橋連起八座島，多走一步都不算。', en: 'Seven bridges join eight islands; one extra step and it does not count.' },
      check: function (ev) { return isR(ev) && includes(ev.data.order, STRIP8) && ev.data.tubes <= 7; }
    }
  ]);
})();
