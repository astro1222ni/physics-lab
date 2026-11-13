/* missions/water-hardness.js — 水的硬度的任務（星星數 = 等級 1–10；隱藏任務 = 等級 × 2） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  // 事件（js/water-hardness.js 只在使用者操作之後回報；資料由 js/water-hardness-core.js 產生）：
  //   'treat'：按「煮沸 10 分鐘」「加洗滌鹼」「通過樹脂」「食鹽水再生」之後
  //     { kind: boil|soda|resin|regen, preset, bottle（第幾杯水）, step（這杯水處理過幾次）, boiled（煮過幾次）,
  //       H0, H（處理前後的總硬度 mg/L 以 CaCO3 計）, Ca0, Mg0, Ca, Mg（處理前後 mg/L）, HCO30, Na0, Na, V（L）, scale（水垢 mg）,
  //       resinLeft（樹脂剩下的容量 mmol）, leakSeen（這個樹脂曾經漏過硬度）, regenAfterLeak（漏過之後再生過）,
  //       煮沸另有 dCa, dMg, dScale；洗滌鹼另有 dose（mg/L）, add（加入的 Na2CO3 mmol）, nCa0（處理前的 Ca2+ mmol）, ppt；
  //       樹脂另有 resinLeft0, exhausted（容量用完）, leak；再生另有 used }
  //   'soap'：肥皂試驗按「加一滴」之後 { preset, bottle, step, unknown, drops, detergent, H, nS, nM, ppt（µmol 浮渣）, free, cFree（M）, lather（持久泡沫）, foam, need,
  //           soapFail（同一杯水用肥皂加到第幾滴還只有浮渣，沒有就是 0） }
  //   'settle'：滴定一次加入的 EDTA 全部落進瓶中之後；'endpoint'：按「記錄終點」
  //     { mode: A（pH 10、EBT、總硬度）|B（pH 12、鈣硬度）, mgEdta, Va（mL）, cE（M）, meter, V, Vout, Vread, Veq, VeqCa（mL）,
  //       rf（指示劑結合金屬的比例）, blue（rf ≤ 10%，純藍色）, colour, pCa, fCa, fMg,
  //       Ca, Mg（錐形瓶裡這杯水的濃度 mmol/L）, H, Hca（mg/L）, preset, bottle, step, boiled, unknown, flask }
  //     endpoint 另有 Vend（流出的總體積 mL）, err（Vend − Veq）, Hmeas（由終點算出的硬度 mg/L）, meas（這次以前、非未知水樣在 pH 10 的準確終點紀錄）
  //   'answer'：未知水樣按「核對答案」{ H, Hca（填的答案）, errH, errCa（相對誤差）, revealed, flasksA, flasksB（這瓶未知水樣各滴了幾瓶）, no }
  const E = 1e-9;
  const isT = function (ev, k) { return ev.type === 'treat' && ev.data && ev.data.kind === k; };
  const isSoap = function (ev) { return ev.type === 'soap' && ev.data; };
  const isE = function (ev) { return ev.type === 'endpoint' && ev.data; };
  const isA = function (ev) { return ev.type === 'answer' && ev.data && !ev.data.revealed; };
  /** 準確的終點：純藍色、和當量點相差不超過 0.10 mL，而且不是幾乎沒有硬度的水 */
  const good = function (d) { return d.blue && Math.abs(d.err) <= 0.10 + E && d.Veq >= 2; };
  const noMg = function (d) { return d.Mg < 1e-6; };

  LabMission.register('water-hardness', [
    {
      id: 'water-hardness-1', level: 1,
      title: { zh: '一滴就起泡', en: 'One drop of soap' },
      desc: { zh: '選「蒸餾水」，在試管裡「加一滴」肥皂水，一滴就有持久的泡沫。', en: 'Choose “Distilled” and “Add a drop” of soap to the test tube: one drop gives a lasting lather.' },
      check: function (ev) { const d = ev.data; return isSoap(ev) && d.preset === 'dist' && !d.detergent && d.drops === 1 && d.lather; }
    },
    {
      id: 'water-hardness-2', level: 2,
      title: { zh: '只有浮渣', en: 'Nothing but scum' },
      desc: { zh: '在總硬度 180 mg/L 以上的極硬水裡加肥皂水，加到第 5 滴以上還是只有白色浮渣、沒有持久的泡沫。', en: 'Add soap to very hard water (total hardness over 180 mg/L): after 5 or more drops there is still only white scum and no lasting lather.' },
      check: function (ev) { const d = ev.data; return isSoap(ev) && !d.detergent && d.H > 180 && d.drops >= 5 && !d.lather && d.ppt > 0; }
    },
    {
      id: 'water-hardness-3', level: 3,
      title: { zh: '燒水壺的白垢', en: 'The kettle’s white crust' },
      desc: { zh: '按「煮沸 10 分鐘」，讓水的總硬度一次下降 100 mg/L 以上，杯底留下水垢。', en: 'Press “Boil 10 min” so that the total hardness falls by at least 100 mg/L in one go, leaving scale on the bottom.' },
      check: function (ev) { const d = ev.data; return isT(ev, 'boil') && d.H0 - d.H >= 100 - E; }
    },
    {
      id: 'water-hardness-4', level: 3,
      title: { zh: '換成鈉離子', en: 'Swapped for sodium' },
      desc: { zh: '把總硬度 250 mg/L 以上的水「通過樹脂」，讓硬度降到 1 mg/L 以下。', en: 'Send water with a total hardness of at least 250 mg/L “Through the resin” and bring the hardness below 1 mg/L.' },
      check: function (ev) { const d = ev.data; return isT(ev, 'resin') && d.H0 >= 250 && d.H < 1; }
    },
    {
      id: 'water-hardness-5', level: 4,
      title: { zh: '酒紅變純藍', en: 'From wine red to pure blue' },
      desc: { zh: '用 pH 10 緩衝液＋EBT 滴定總硬度，在純藍色時按「記錄終點」，終點和當量點相差不超過 0.10 mL（當量點至少 2 mL）。', en: 'Titrate the total hardness with the pH 10 buffer + EBT and press “Record end point” at pure blue, within 0.10 mL of the equivalence point (which must be at least 2 mL).' },
      check: function (ev) { const d = ev.data; return isE(ev) && d.mode === 'A' && good(d); }
    },
    {
      id: 'water-hardness-6', level: 4,
      title: { zh: '只挑走鈣', en: 'Calcium only' },
      desc: { zh: '按「加洗滌鹼」，讓 Ca2+ 降到 5 mg/L 以下，Mg2+ 卻留下九成以上（原本 Ca2+ 至少 20 mg/L、Mg2+ 至少 5 mg/L）。', en: '“Add washing soda” so that Ca2+ falls below 5 mg/L while at least 90% of the Mg2+ stays (starting from at least 20 mg/L of Ca2+ and 5 mg/L of Mg2+).' },
      check: function (ev) { const d = ev.data; return isT(ev, 'soda') && d.Ca0 >= 20 && d.Mg0 >= 5 && d.Ca < 5 && d.Mg >= 0.9 * d.Mg0 - E; }
    },
    {
      id: 'water-hardness-7', level: 5,
      title: { zh: '鎂沉下去了', en: 'The magnesium sinks out' },
      desc: { zh: '用 NaOH 調到 pH 12 測鈣硬度（水中至少有 5 mg/L 的 Mg2+），在純藍色時記錄終點，和當量點相差不超過 0.10 mL。', en: 'Measure the calcium hardness at pH 12 with NaOH (the water must hold at least 5 mg/L of Mg2+) and record the end point at pure blue, within 0.10 mL of the equivalence point.' },
      check: function (ev) { const d = ev.data; return isE(ev) && d.mode === 'B' && d.Mg * 24.305 >= 5 - E && good(d); }
    },
    {
      id: 'water-hardness-8', level: 5,
      title: { zh: '剛好 10 mL', en: 'Exactly 10 mL' },
      desc: { zh: '調整水樣的體積或 EDTA 的濃度，讓當量點剛好在 10.00 mL（相差不超過 0.01 mL），再準確地滴到終點（純藍色、相差不超過 0.10 mL）。', en: 'Adjust the volume of water or the EDTA concentration so the equivalence point is 10.00 mL (within 0.01 mL), then titrate accurately to the end point (pure blue, within 0.10 mL).' },
      check: function (ev) { const d = ev.data; return isE(ev) && !d.unknown && Math.abs(d.Veq - 10) <= 0.01 + E && good(d); }
    },
    {
      id: 'water-hardness-9', level: 6,
      title: { zh: '再生的樹脂', en: 'The resin reborn' },
      desc: { zh: '讓樹脂的容量用完、硬度漏過去，再按「食鹽水再生」，然後讓一杯總硬度 50 mg/L 以上的水通過樹脂，硬度降到 1 mg/L 以下。', en: 'Use up the resin until hardness leaks through, press “Regenerate with brine”, then send water with a total hardness of at least 50 mg/L through it and bring the hardness below 1 mg/L.' },
      check: function (ev) { const d = ev.data; return isT(ev, 'resin') && d.regenAfterLeak && d.H0 >= 50 && d.H < 1; }
    },
    {
      id: 'water-hardness-10', level: 7,
      title: { zh: '未知的水', en: 'An unknown water' },
      desc: { zh: '選「未知水樣」，用 EDTA 滴定求出它的總硬度，按「核對答案」，誤差在 2% 以內（不可先揭曉答案）。', en: 'Choose “Unknown”, find its total hardness by EDTA titration and press “Check”: within 2% (without revealing the answer first).' },
      check: function (ev) { const d = ev.data; return isA(ev) && Math.abs(d.errH) <= 0.02 + E; }
    },
    {
      id: 'water-hardness-11', level: 8,
      title: { zh: '鈣與鎂各多少', en: 'How much calcium, how much magnesium' },
      desc: { zh: '同一瓶未知水樣，總硬度與鈣硬度一起填，按「核對答案」，兩個誤差都在 2% 以內。', en: 'For the same unknown water, fill in both the total and the calcium hardness and press “Check”: both within 2%.' },
      check: function (ev) { const d = ev.data; return isA(ev) && Math.abs(d.errH) <= 0.02 + E && Math.abs(d.errCa) <= 0.02 + E; }
    },
    {
      id: 'water-hardness-12', level: 10,
      title: { zh: '一瓶定勝負', en: 'One flask each' },
      desc: { zh: '同一瓶未知水樣，總硬度與鈣硬度各只滴一瓶，兩個答案的誤差都在 1% 以內。', en: 'For one unknown water, titrate just one flask for the total and one for the calcium hardness, and get both within 1%.' },
      check: function (ev) { const d = ev.data; return isA(ev) && d.flasksA === 1 && d.flasksB === 1 && Math.abs(d.errH) <= 0.01 + E && Math.abs(d.errCa) <= 0.01 + E; }
    },

    // ---------------- 隱藏任務（只給隱晦的提示） ----------------
    {
      // 合成清潔劑（烷基苯磺酸鈉）的鈣、鎂鹽可溶，不會變成浮渣：總硬度 500 mg/L 以上的同一杯水，
      // 先用肥皂加到 10 滴以上還只有浮渣，換成清潔劑第一滴就有持久泡沫
      id: 'water-hardness-h1', level: 3, hidden: true,
      riddle: { zh: '換一種和石頭不結仇的泡泡，再硬也攔不住它。', en: 'Choose bubbles that bear the stone no grudge, and no hardness can stop them.' },
      check: function (ev) { const d = ev.data; return isSoap(ev) && d.detergent && d.drops === 1 && d.lather && d.H >= 500 && d.soapFail >= 10; }
    },
    {
      // 沒有碳酸氫根的永久硬度：煮沸只蒸發掉水，硬度反而上升 8% 以上
      id: 'water-hardness-h2', level: 4, hidden: true,
      riddle: { zh: '爐火想帶它走，最後只帶走了它的同伴。', en: 'The fire came to take it away, and left with only its companion.' },
      check: function (ev) { const d = ev.data; return isT(ev, 'boil') && d.H0 >= 100 && d.H >= 1.08 * d.H0; }
    },
    {
      // 只有 Mg、沒有 Ca 的水在 pH 12 測鈣硬度：Mg2+ 全部沉澱成 Mg(OH)2，第一滴就是純藍色
      id: 'water-hardness-h3', level: 4, hidden: true,
      riddle: { zh: '主角躲進白霧裡，舞台一開幕就謝幕。', en: 'The lead hides in a white mist; the curtain falls the moment it rises.' },
      check: function (ev) { const d = ev.data; return isE(ev) && d.mode === 'B' && !d.unknown && d.Ca * 40.078 < 0.5 && d.Mg * 24.305 >= 10 && d.blue && d.Vend <= 0.05 + E; }
    },
    {
      // 樹脂對 Ca2+ 的選擇性比 Mg2+ 高：容量用完的那一次，Ca2+ 仍被抓光，Mg2+ 先漏出來
      id: 'water-hardness-h4', level: 5, hidden: true,
      riddle: { zh: '門快關上的時候，先被放行的是比較輕的那一位。', en: 'As the gate swings shut, the lighter one is let through first.' },
      check: function (ev) { const d = ev.data; return isT(ev, 'resin') && d.exhausted && d.Ca < 0.5 && d.Mg >= 1; }
    },
    {
      // 沒有 Mg2+ 時 CaIn- 不夠穩定：EBT 提早而且慢慢地變色，在紫色時（還沒到當量點 0.5% 以上）就記錄終點
      id: 'water-hardness-h5', level: 6, hidden: true,
      riddle: { zh: '沒有朋友陪的時候，告白總是太早，又說得含糊。', en: 'With no friend beside it, the confession comes too early and too vague.' },
      check: function (ev) { const d = ev.data; return isE(ev) && d.mode === 'A' && !d.mgEdta && !d.unknown && noMg(d) && d.Veq >= 2 && d.rf <= 0.5 && d.rf > 0.1 && d.err <= -0.005 * d.Veq; }
    },
    {
      // 沒有 Mg2+ 的水，緩衝液加 Mg–EDTA：交換出來的 Mg2+ 讓 EBT 變色變得準確又敏銳，不必多用 EDTA
      id: 'water-hardness-h6', level: 7, hidden: true,
      riddle: { zh: '請一位不收紅包的媒人，告白就準時了。', en: 'Hire a matchmaker who takes no fee, and the confession arrives on time.' },
      check: function (ev) { const d = ev.data; return isE(ev) && d.mode === 'A' && d.mgEdta && !d.unknown && noMg(d) && d.Veq >= 2 && d.blue && Math.abs(d.err) <= 0.05 + E; }
    },
    {
      // 臺灣飲用水水質標準：總硬度 300 mg/L（以 CaCO3 計）；由準確的終點算出的總硬度剛好在這條線上（±2 mg/L）
      id: 'water-hardness-h7', level: 7, hidden: true,
      riddle: { zh: '法律畫下的那條線，你剛好踩在上面。', en: 'The line the law has drawn — you are standing right on it.' },
      check: function (ev) { const d = ev.data; return isE(ev) && d.mode === 'A' && !d.unknown && good(d) && Math.abs(d.Hmeas - 300) <= 2 + E; }
    },
    {
      // 只靠煮沸，Mg(HCO3)2 → Mg(OH)2↓，一次去掉九成以上的 Mg2+（原本至少 20 mg/L；這杯水沒有加過洗滌鹼、沒有通過樹脂）
      id: 'water-hardness-h8', level: 8, hidden: true,
      riddle: { zh: '只用一把火，連第二位客人也送走了九成。', en: 'With fire alone, even the second guest is nine-tenths gone.' },
      check: function (ev) { const d = ev.data; return isT(ev, 'boil') && d.step === d.boiled && d.Mg0 >= 20 && d.Mg <= 0.1 * d.Mg0 + E; }
    },
    {
      // 加入的 Na2CO3 和水中的 Ca2+ 莫耳數相等（相差 1% 以內）：剩下的 Ca2+ 只由 CaCO3 的溶解平衡決定（約 √Ksp）
      id: 'water-hardness-h9', level: 9, hidden: true,
      riddle: { zh: '一個蘿蔔一個坑，剩下的只有平衡肯讓出的那一點點。', en: 'One radish to every hole; what remains is the little the balance will spare.' },
      check: function (ev) { const d = ev.data; return isT(ev, 'soda') && d.Ca0 >= 20 && Math.abs(d.add - d.nCa0) <= 0.01 * d.nCa0 + E; }
    },
    {
      // 同一杯水煮沸前、煮沸後各準確滴定一次總硬度：兩次算出的硬度相差 40 mg/L 以上，量出煮沸除去的暫時硬度
      id: 'water-hardness-h10', level: 10, hidden: true,
      riddle: { zh: '爐火帶走了多少，前後兩次的藍色會告訴你。', en: 'How much the fire carried off, two blues — before and after — will tell you.' },
      check: function (ev) {
        const d = ev.data;
        if (!isE(ev) || d.mode !== 'A' || d.unknown || !good(d) || !(d.boiled >= 1)) return false;
        return (d.meas || []).some(function (m) { return m.bottle === d.bottle && m.boiled === 0 && m.Hmeas - d.Hmeas >= 40 - E; });
      }
    }
  ]);
})();
