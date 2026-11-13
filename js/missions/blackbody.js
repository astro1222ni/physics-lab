/* missions/blackbody.js — 黑體輻射與普朗克定律的任務（一般任務星星數 = 等級；隱藏任務 = 等級 × 2，由 LabMission.starsOf 計算） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  // 事件（js/blackbody.js 回報，只在使用者親手操作之後）：
  //   'temp'：使用者改了溫度（放開滑桿、打數字、按參考物體） { T（K）, preset（按參考物體時是代號，否則 null）, lamMax、lamNu（nm）, nuMax（Hz）,
  //           M（W/m²）, Mpk（W·m⁻²·nm⁻¹）, vis（可見光比例 0–1）, duv（與 D65 白點的色度距離）, log10L, showRJ, showWien, probe（同 'probe' 的游標讀數，或 null） }
  //   'probe'：放開光譜圖上的游標（或用鍵盤移動） { T, lam（nm）, x（hc/λkT）, M、RJ、W（W·m⁻²·nm⁻¹）, rj（瑞利–金斯 ÷ 普朗克）, wien（維恩 ÷ 普朗克）,
  //           F（波長小於 λ 的出射度比例）, lamMax、lamNu（nm）, showRJ, showWien }
  //   'keep'：按「保留這條曲線」 { T, kept：[{ T, M, Mpk, vis, lamMax（nm）, probe（保留前游標在這個溫度量到的波長 nm，或 null） }]（最新的在最後） }
  const near = function (a, b, tol) { return Math.abs(a / b - 1) <= tol; };
  const probeOf = function (ev) { return ev.type === 'probe' ? ev.data : ev.type === 'temp' ? ev.data.probe : null; };
  /** 新保留的曲線 n 與之前保留的任一條 o 滿足 f(n, o) 或 f(o, n) */
  function keptPair(ev, f) {
    if (ev.type !== 'keep') return false;
    const ks = ev.data.kept || [];
    if (ks.length < 2) return false;
    const n = ks[ks.length - 1];
    for (let i = 0; i < ks.length - 1; i++) if (f(n, ks[i]) || f(ks[i], n)) return true;
    return false;
  }
  const VIS_MAX = 0.490416; // 可見光比例的最大值（6913 K；tools/mission-proofs/blackbody.js 由物理核心驗證）

  LabMission.register('blackbody', [
    {
      id: 'blackbody-1', level: 1,
      title: { zh: '人體也在發光', en: 'Your body glows too' },
      desc: { zh: '在參考物體按「人體」：37 °C 的你也在不停地輻射。看看峰值波長落在哪一個波段？', en: 'Under the reference objects press “Human body”: at 37 °C you are radiating all the time. Which band does the peak wavelength fall in?' },
      check: function (ev) { return ev.type === 'temp' && ev.data.preset === 'body'; }
    },
    {
      id: 'blackbody-2', level: 2,
      title: { zh: '綠色的峰', en: 'A green peak' },
      desc: { zh: '調溫度，讓光譜的峰值波長 λmax 落在 500 nm（±1%）。哪一顆你很熟悉的星星差不多就是這個溫度？', en: 'Set the temperature so that the peak wavelength λmax is 500 nm (±1%). Which very familiar star has about this temperature?' },
      check: function (ev) { return ev.type === 'temp' && near(ev.data.lamMax, 500, 0.01); }
    },
    {
      id: 'blackbody-3', level: 3,
      title: { zh: '量出人體的峰', en: 'Measure your own peak' },
      desc: { zh: '按「人體」後，把光譜圖上的游標拖到曲線的最高點（與 λmax 相差 2% 以內），讀出人體輻射最強的波長是幾微米。', en: 'Press “Human body”, then drag the cursor on the spectrum to the top of the curve (within 2% of λmax) and read off, in micrometres, the wavelength at which your body radiates most.' },
      check: function (ev) { return ev.type === 'probe' && Math.abs(ev.data.T - 310) <= 0.5 && near(ev.data.lam, ev.data.lamMax, 0.02); }
    },
    {
      id: 'blackbody-4', level: 4,
      title: { zh: '宇宙的餘暉', en: 'The afterglow of the universe' },
      desc: { zh: '讓峰值波長落在 1 mm（±2%）。這已經是微波了：整個宇宙都浸在這種溫度的輻射裡。', en: 'Make the peak wavelength 1 mm (±2%). That is already microwaves: the whole universe is bathed in radiation at about this temperature.' },
      check: function (ev) { return ev.type === 'temp' && near(ev.data.lamMax, 1e6, 0.02); }
    },
    {
      id: 'blackbody-5', level: 5,
      title: { zh: '溫度加倍', en: 'Double the temperature' },
      desc: { zh: '按「保留這條曲線」留下一條，把溫度加倍後再保留一條：兩條曲線的總輻射出射度之比是 16（±3%）。峰值高度又變成幾倍？', en: 'Press “Keep this curve”, double the temperature and keep a second one: the total radiant exitances are in the ratio 16 (±3%). By what factor did the height of the peak grow?' },
      check: function (ev) { return keptPair(ev, function (h, c) { return h.T > c.T && near(h.M / c.M, 16, 0.03); }); }
    },
    {
      id: 'blackbody-6', level: 5,
      title: { zh: '紫外災難', en: 'The ultraviolet catastrophe' },
      desc: { zh: '勾選「顯示瑞利–金斯」，溫度不變：用游標在長波處量到瑞利–金斯與普朗克相差 1% 以內，再到短波處量到瑞利–金斯是普朗克的 1000 倍以上。', en: 'Tick “Show Rayleigh–Jeans” and keep the temperature fixed: with the cursor, find a long wavelength where Rayleigh–Jeans and Planck agree within 1%, and a short one where Rayleigh–Jeans is more than 1000 times Planck.' },
      check: function (ev, mem) {
        if (ev.type !== 'probe' || !ev.data.showRJ) return false;
        const d = ev.data;
        if (mem.T !== d.T) { mem.T = d.T; mem.lo = false; mem.hi = false; }
        if (d.rj <= 1.01) mem.lo = true;
        if (d.rj >= 1000) mem.hi = true;
        return mem.lo && mem.hi;
      }
    },
    {
      id: 'blackbody-7', level: 6,
      title: { zh: '同一條光譜的另一個峰', en: 'The other peak of the same spectrum' },
      desc: { zh: '把游標放在頻率分布的峰值所對應的波長 c/νmax（±2%）。它和 λmax 不在同一處：這裡的光譜出射度只有最高點的幾成？', en: 'Put the cursor at the wavelength c/νmax that corresponds to the peak of the frequency distribution (±2%). It is not where λmax is: what fraction of the highest value does the spectrum reach here?' },
      check: function (ev) { return ev.type === 'probe' && near(ev.data.lam, ev.data.lamNu, 0.02); }
    },
    {
      id: 'blackbody-8', level: 6,
      title: { zh: '最多的可見光', en: 'The most visible light' },
      desc: { zh: '找出可見光（380～780 nm）所占比例最大的溫度：讀數的「可見光比例」要達到最大值（差 0.015 個百分點以內）。它比太陽熱還是冷？', en: 'Find the temperature at which visible light (380–780 nm) makes up the largest share: the “Visible fraction” reading must reach its maximum (within 0.015 percentage points). Is it hotter or cooler than the Sun?' },
      check: function (ev) { return ev.type === 'temp' && ev.data.vis >= VIS_MAX - 0.00015; }
    },
    {
      id: 'blackbody-9', level: 7,
      title: { zh: '最白的光', en: 'The whitest light' },
      desc: { zh: '讓黑體的顏色最接近日光的白點 D65：讀數「與白點的色差 Δuv」不超過 0.0035。和可見光比例最大的溫度一樣嗎？', en: 'Make the colour of the black body as close as possible to the daylight white point D65: the reading “Distance from white Δuv” must be at most 0.0035. Is this the same temperature as the one with the most visible light?' },
      check: function (ev) { return ev.type === 'temp' && ev.data.duv <= 0.0035; }
    },
    {
      id: 'blackbody-10', level: 8,
      title: { zh: '四次方', en: 'The fourth power' },
      desc: { zh: '保留三條溫度比 1 : 2 : 3 的曲線（各 ±0.5%），比較它們的總輻射出射度：是 1 : 2 : 3 嗎？', en: 'Keep three curves whose temperatures are in the ratio 1 : 2 : 3 (each ±0.5%) and compare their total radiant exitances: are they 1 : 2 : 3?' },
      check: function (ev) {
        if (ev.type !== 'keep') return false;
        const ts = (ev.data.kept || []).map(function (k) { return k.T; });
        return ts.some(function (a) {
          return ts.some(function (b) { return near(b / a, 2, 0.005); }) && ts.some(function (c) { return near(c / a, 3, 0.005); });
        });
      }
    },
    {
      id: 'blackbody-11', level: 9,
      title: { zh: '維恩近似的破綻', en: 'Where Wien’s approximation cracks' },
      desc: { zh: '勾選「顯示維恩近似」，把游標放在 10 μm（±1%），再調溫度，讓這個波長的維恩近似比普朗克低 10%（讀數的比值在 0.895～0.905）。', en: 'Tick “Show Wien approximation”, put the cursor at 10 μm (±1%) and then adjust the temperature until Wien’s approximation is 10% below Planck at that wavelength (the ratio reading between 0.895 and 0.905).' },
      check: function (ev) {
        const p = probeOf(ev), d = ev.data;
        return !!p && d.showWien && near(p.lam, 10000, 0.01) && p.wien >= 0.895 && p.wien <= 0.905;
      }
    },
    {
      id: 'blackbody-12', level: 10,
      title: { zh: '找回維恩常數', en: 'Recover Wien’s constant' },
      desc: { zh: '保留四條曲線（最高溫至少是最低溫的 10 倍），每一條保留之前都先用游標對準它的最高點（±1%）。四條的 λmax × T 一樣嗎？', en: 'Keep four curves (the hottest at least 10 times the coolest), and before keeping each one put the cursor on its peak (±1%). Is λmax × T the same for all four?' },
      check: function (ev) {
        if (ev.type !== 'keep') return false;
        const ok = (ev.data.kept || []).filter(function (k) { return k.probe != null && near(k.probe, k.lamMax, 0.01); });
        if (ok.length < 4) return false;
        const ts = ok.map(function (k) { return k.T; });
        return Math.max.apply(null, ts) / Math.min.apply(null, ts) >= 10;
      }
    },

    // ---------- 隱藏任務：只給隱晦的提示 ----------
    {
      id: 'blackbody-h1', level: 3, hidden: true,
      riddle: { zh: '最亮的那一點，正好落在眼睛最渴望的顏色上。', en: 'The brightest point falls exactly on the colour the eye longs for most.' },
      // 峰值波長 = 人眼明視覺最敏感的 555 nm（±0.3%，T ≈ 5221 K），並用游標對準峰值（±1%）
      check: function (ev) { const d = ev.data; return ev.type === 'probe' && near(d.lamMax, 555, 0.003) && near(d.lam, d.lamMax, 0.01); }
    },
    {
      id: 'blackbody-h2', level: 4, hidden: true,
      riddle: { zh: '一粒光的價錢，剛好等於一份熱的工資。', en: 'Where the price of one grain of light equals one wage of heat.' },
      // 游標放在 hf = kT 的波長（x = hc/λkT = 1 ± 0.5%，λ ≈ 4.965 λmax）
      check: function (ev) { return ev.type === 'probe' && Math.abs(ev.data.x - 1) <= 0.005; }
    },
    {
      id: 'blackbody-h3', level: 5, hidden: true,
      riddle: { zh: '把天平擺在這裡，左右兩邊的光一樣重。', en: 'Set the scales down here, and the light on either side weighs the same.' },
      // 游標放在出射度的中位數：波長比它短的剛好占一半（0.5 ± 0.0008，約 λT 的 ±0.1%；λ ≈ 1.417 λmax，不是峰值）
      check: function (ev) { return ev.type === 'probe' && Math.abs(ev.data.F - 0.5) <= 0.0008; }
    },
    {
      id: 'blackbody-h4', level: 6, hidden: true,
      riddle: { zh: '爐火只悄悄旺了一點，光芒卻成了雙生。', en: 'The fire burns only a little brighter, yet its light is born a twin.' },
      // 保留兩條曲線，總出射度剛好 2 倍（±0.5%；溫度只差 2 的 4 次方根 ≈ 1.189 倍）
      check: function (ev) { return keptPair(ev, function (h, c) { return near(h.M / c.M, 2, 0.005); }); }
    },
    {
      id: 'blackbody-h5', level: 7, hidden: true,
      riddle: { zh: '峰頂疊成了千層塔，爐火卻只走了幾步。', en: 'The summit is stacked into a thousand-storey tower, while the fire takes only a few steps.' },
      // 保留兩條曲線，峰值高度剛好 1000 倍（±1%；峰高 ∝ T⁵，溫度比 10 的 0.6 次方 ≈ 3.98）
      check: function (ev) { return keptPair(ev, function (h, c) { return near(h.Mpk / c.Mpk, 1000, 0.01); }); }
    },
    {
      id: 'blackbody-h6', level: 7, hidden: true,
      riddle: { zh: '一冷一熱的兩盞燈，分給眼睛的竟然一樣多。', en: 'One cool lamp and one hot one, and the eye is given exactly the same share by each.' },
      // 保留兩條溫度相差 2.5 倍以上的曲線，可見光比例相同（相對差 0.5% 內、都至少 5%）：可見光比例先升後降
      check: function (ev) {
        return keptPair(ev, function (h, c) { return h.T >= 2.5 * c.T && c.vis >= 0.05 && h.vis >= 0.05 && near(h.vis, c.vis, 0.005); });
      }
    },
    {
      id: 'blackbody-h7', level: 8, hidden: true,
      riddle: { zh: '遠方的火爐只照亮它的一面，石頭卻暖成了自己的光。', en: 'The distant furnace lights only one face of it, and the stone warms into a glow of its own.' },
      // 太陽（5772 K）與地球的輻射平衡溫度 T☉ √(R☉ / 2d) = 278.3 K（±0.5%，假設不反射陽光、快速自轉），兩條都保留
      check: function (ev) {
        return keptPair(ev, function (s, e) { return Math.abs(s.T - 5772) <= 1 && near(e.T, 278.33, 0.005); });
      }
    },
    {
      id: 'blackbody-h8', level: 8, hidden: true,
      riddle: { zh: '兩位前輩各錯一半；那年秋天，有人在兩人中間找到了答案。', en: 'Two elders, each half wrong; that autumn someone found the answer between them.' },
      // 瑞利–金斯與維恩都顯示，游標放在兩者相對誤差相等之處（差 0.001 以內，約 x 的 ±0.1%，排除 39000 K × 500 nm 這類整數組合；x ≈ 0.737，兩者都差約 48%）——普朗克 1900 年的內插
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'probe' && d.showRJ && d.showWien && isFinite(d.rj) && Math.abs((1 - d.wien) - (d.rj - 1)) <= 0.001;
      }
    },
    {
      id: 'blackbody-h9', level: 9, hidden: true,
      riddle: { zh: '最古老的光離家時是爐火的顏色，如今只剩冰冷的低語。', en: 'The oldest light left home the colour of a hearth; now it is only a cold whisper.' },
      // 保留宇宙微波背景（2.7255 K ± 0.2%）與「最後散射」時的溫度：比值 = 1 + z* = 1090.92（Planck 2018，±0.5%，約 2973 K）
      check: function (ev) {
        return keptPair(ev, function (h, c) { return near(c.T, 2.7255, 0.002) && near(h.T / c.T, 1090.92, 0.005); });
      }
    },
    {
      id: 'blackbody-h10', level: 10, hidden: true,
      riddle: { zh: '岩鹽一次又一次篩過熱光，篩出了前輩的錯。', en: 'Rock salt sifts the heat-light again and again, and sifts out an elder’s mistake.' },
      // 重現魯本斯與庫爾鮑姆（1900）：維恩近似顯示，游標在約 51 μm（51～52 μm；他們用岩鹽的殘餘射線，波長約 51 μm），溫度至少 1000 K，維恩近似不到普朗克的一半
      check: function (ev) {
        const p = probeOf(ev), d = ev.data;
        return !!p && d.showWien && d.T >= 1000 && p.lam >= 51000 && p.lam <= 52000 && p.wien <= 0.5;
      }
    }
  ]);
})();
