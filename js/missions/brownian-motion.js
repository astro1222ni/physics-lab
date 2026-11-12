/* missions/brownian-motion.js — 布朗運動與原子的存在的任務（一般任務星星數 = 等級；隱藏任務 = 等級 × 2，由 LabMission.starsOf 計算） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  // 事件（js/brownian-motion.js 回報，只在使用者親手操作之後）：
  //   'md'：分子視角、打開「只看大顆粒」之後每秒一次 { onlyBig, hits（打開之後大顆粒被撞的次數）, ratio（質量比）, t }
  //   'record'：顯微鏡模式按「記錄」成功 { row, rows（所有紀錄，含這一筆）, sed（沉降法目前的擬合結果或 null） }
  //     row = { id, liquid, T（°C）, eta（mPa·s）, a（μm）, N, tObs（s）, D、Dm（m²/s，理論與量測）, se, err（Dm/D − 1）,
  //             kB, NA, naErr（N_A 與定義值的相對差）, msdEnd、msdEndTh（μm²，觀察結束時的多顆粒平均 ⟨r²⟩ 與 4Dt）, tail（最遠一顆的 r²/(4Dt)）, sigma（μm） }
  //   'photo'：沉降模式按「拍照計數」 { material, a（μm）, T, dRho, H（μm，理論標高）, Hm（μm，擬合）, Hse, half（Hm ln 2，μm）,
  //             photos, counted（累計數到的顆粒）, kB, NA, naErr, rows（顯微鏡的紀錄） }
  const rec = function (ev) { return ev.type === 'record' ? ev.data : null; };
  const rowsOf = function (ev) { return (ev.data && ev.data.rows) || []; };
  const sameA = function (p, q) { return Math.abs(p.a / q.a - 1) <= 0.005; };
  const sameT = function (p, q) { return Math.abs(p.T - q.T) <= 0.25; };
  const sameSet = function (p, q) { return p.liquid === q.liquid && sameT(p, q) && sameA(p, q); };
  const ETA_RANK = { water: 0, gly50: 1, gly80: 2 };
  /** 這次的紀錄 r 和之前任何一筆 o 滿足 f(r, o) 或 f(o, r) */
  function pairWith(ev, f) {
    const d = rec(ev);
    if (!d || !d.row) return false;
    const r = d.row;
    return rowsOf(ev).some(function (o) { return o.id !== r.id && (f(r, o) || f(o, r)); });
  }
  const within = function (x, lo, hi) { return x >= lo && x <= hi; };

  LabMission.register('brownian-motion', [
    {
      id: 'brownian-motion-1', level: 1,
      title: { zh: '看不見的撞擊', en: 'Invisible blows' },
      desc: { zh: '「分子視角」：打開「只看大顆粒」，看它被看不見的分子撞了 300 次。它的路線像什麼？', en: '“Molecular view”: switch on “Particle only” and watch the big particle take 300 hits from molecules you can no longer see. What does its path look like?' },
      check: function (ev) { return ev.type === 'md' && ev.data.onlyBig && ev.data.hits >= 300; }
    },
    {
      id: 'brownian-motion-2', level: 2,
      title: { zh: '量出擴散係數', en: 'Measure the diffusion coefficient' },
      desc: { zh: '「顯微鏡與均方位移」：按「開始觀察」，看完後按「記錄」，量到的 D 與斯托克斯–愛因斯坦的理論值相差 10% 以內。', en: '“Microscope & MSD”: press “Start observing”, then “Record” when it is done, with the measured D within 10% of the Stokes–Einstein value.' },
      check: function (ev) { const d = rec(ev); return !!d && Math.abs(d.row.err) <= 0.10; }
    },
    {
      id: 'brownian-motion-3', level: 3,
      title: { zh: '時間四倍，距離只有兩倍', en: 'Four times the time, only twice the distance' },
      desc: { zh: '液體、溫度、半徑都不變，顆粒數至少 20：記錄兩筆觀察時間相差 4 倍的量測，讓觀察結束時的 ⟨r²⟩ 之比在 3～5.5 之間。如果 ⟨r²⟩ 跟 t² 成正比，比值會是多少？', en: 'Same liquid, temperature and radius, at least 20 particles: record two runs whose observation times differ by a factor of 4, with the ratio of the final ⟨r²⟩ between 3 and 5.5. What would the ratio be if ⟨r²⟩ grew like t²?' },
      check: function (ev) {
        return pairWith(ev, function (p, q) {
          return sameSet(p, q) && p.N >= 20 && q.N >= 20 && Math.abs(p.tObs / q.tObs - 4) <= 0.04 && within(p.msdEnd / q.msdEnd, 3, 5.5);
        });
      }
    },
    {
      id: 'brownian-motion-4', level: 4,
      title: { zh: '小一半，跳兩倍', en: 'Half the size, twice the jiggle' },
      desc: { zh: '同一種液體、同一個溫度，記錄兩筆：顆粒半徑剛好差 2 倍，量到的 D 之比在 1.8～2.2 之間。', en: 'Same liquid and temperature: record two runs whose particle radii differ by exactly a factor of 2, with the ratio of the measured D between 1.8 and 2.2.' },
      check: function (ev) {
        return pairWith(ev, function (p, q) {
          return p.liquid === q.liquid && sameT(p, q) && Math.abs(q.a / p.a - 2) <= 0.01 && within(p.Dm / q.Dm, 1.8, 2.2);
        });
      }
    },
    {
      id: 'brownian-motion-5', level: 5,
      title: { zh: '不只是溫度', en: 'Not just the temperature' },
      desc: { zh: '同一個顆粒在水中：20 °C 與 80 °C 各記錄一筆，量到的 D 之比在 3.1～3.75 之間。絕對溫度只升高 1.2 倍，D 為什麼多了這麼多？', en: 'The same particle in water: record one run at 20 °C and one at 80 °C, with the ratio of the measured D between 3.1 and 3.75. The absolute temperature rises only 1.2 times — why does D grow so much more?' },
      check: function (ev) {
        return pairWith(ev, function (p, q) {
          return p.liquid === 'water' && q.liquid === 'water' && sameA(p, q) && Math.abs(p.T - 80) <= 0.5 && Math.abs(q.T - 20) <= 0.5 && within(p.Dm / q.Dm, 3.1, 3.75);
        });
      }
    },
    {
      id: 'brownian-motion-6', level: 5,
      title: { zh: '黏得幾乎不動', en: 'Stuck in syrup' },
      desc: { zh: '同一個顆粒、同一個溫度：在水與甘油 80% 中各記錄一筆，甘油裡量到的 D 不到水中的 1/50。', en: 'The same particle at the same temperature: record one run in water and one in 80% glycerol, with the measured D in glycerol less than 1/50 of that in water.' },
      check: function (ev) {
        return pairWith(ev, function (p, q) { return p.liquid === 'gly80' && q.liquid === 'water' && sameA(p, q) && sameT(p, q) && p.Dm < q.Dm / 50; });
      }
    },
    {
      id: 'brownian-motion-7', level: 6,
      title: { zh: '數出標高', en: 'Count out the scale height' },
      desc: { zh: '「沉降平衡」：按「拍照計數」數各層的顆粒，累計至少 1200 顆，由 ln n 對 h 的斜率求出的標高與理論值相差 5% 以內。', en: '“Sedimentation”: press “Photograph & count” to count the particles in each layer — at least 1200 in all — and get a scale height from the slope of ln n against h within 5% of the theory.' },
      check: function (ev) { const d = ev.data; return ev.type === 'photo' && d.counted >= 1200 && isFinite(d.Hm) && Math.abs(d.Hm / d.H - 1) <= 0.05; }
    },
    {
      id: 'brownian-motion-8', level: 7,
      title: { zh: '用擴散數原子', en: 'Counting atoms by diffusion' },
      desc: { zh: '至少 30 顆、觀察至少 30 秒，用自己量到的 D 算出亞佛加厥數，與定義值相差 3% 以內。', en: 'With at least 30 particles watched for at least 30 s, use your own measured D to work out Avogadro’s number within 3% of the defined value.' },
      check: function (ev) { const d = rec(ev); return !!d && d.row.N >= 30 && d.row.tObs >= 30 && Math.abs(d.row.naErr) <= 0.03; }
    },
    {
      id: 'brownian-motion-9', level: 8,
      title: { zh: '同一個 k_B', en: 'The same k_B' },
      desc: { zh: '最近三筆紀錄換了液體或溫度（三筆的黏滯係數最大與最小相差至少 10 倍），三筆算出的 k_B = 6πηaD/T 都和三筆平均相差 5% 以內。', en: 'Make your last three records in different liquids or at different temperatures (the largest viscosity at least 10 times the smallest), with each k_B = 6πηaD/T within 5% of the mean of the three.' },
      check: function (ev) {
        const d = rec(ev);
        if (!d) return false;
        const rs = rowsOf(ev).slice(-3);
        if (rs.length < 3 || rs[2].id !== d.row.id) return false;
        for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) if (rs[i].liquid === rs[j].liquid && sameT(rs[i], rs[j])) return false;
        const e = rs.map(function (r) { return r.eta; }), m = (rs[0].kB + rs[1].kB + rs[2].kB) / 3;
        return Math.max.apply(null, e) / Math.min.apply(null, e) >= 10 && rs.every(function (r) { return Math.abs(r.kB / m - 1) <= 0.05; });
      }
    },
    {
      id: 'brownian-motion-10', level: 10,
      title: { zh: '佩蘭的數法', en: 'Perrin’s count' },
      desc: { zh: '「沉降平衡」：累計數到至少 3000 顆，由標高算出的亞佛加厥數與定義值相差 3% 以內。', en: '“Sedimentation”: count at least 3000 particles in all, and get Avogadro’s number from the scale height within 3% of the defined value.' },
      check: function (ev) { const d = ev.data; return ev.type === 'photo' && d.counted >= 3000 && Math.abs(d.naErr) <= 0.03; }
    },

    // ---------- 隱藏任務：只給隱晦的提示 ----------
    {
      id: 'brownian-motion-h1', level: 3, hidden: true,
      riddle: { zh: '一季的寒意，就讓舞步少了一半。', en: 'A single season’s chill, and the dance has lost half its steps.' },
      // 水中同一顆粒：冰點附近（≤ 1 °C）與只暖不到 30 °C 的一筆相比，D 掉到 0.47 倍以下（η 在冰點最大）
      check: function (ev) {
        return pairWith(ev, function (c, w) {
          return c.liquid === 'water' && w.liquid === 'water' && sameA(c, w) && c.T <= 1 && w.T > c.T && w.T - c.T <= 30 && c.Dm / w.Dm <= 0.47;
        });
      }
    },
    {
      id: 'brownian-motion-h2', level: 5, hidden: true,
      riddle: { zh: '爐火旁的巨人與井邊的孩子，踩著同樣的節拍。', en: 'The giant by the hearth and the child by the well keep the same beat.' },
      // 水中：接近沸點（≥ 99 °C）的大顆粒，與 ≤ 30 °C 的小顆粒（半徑小 3 倍以上）量到相同的 D（5% 內）
      check: function (ev) {
        return pairWith(ev, function (h, c) {
          return h.liquid === 'water' && c.liquid === 'water' && h.T >= 99 && c.T <= 30 && h.a / c.a >= 3 && Math.abs(h.Dm / c.Dm - 1) <= 0.05;
        });
      }
    },
    {
      id: 'brownian-motion-h3', level: 4, hidden: true,
      riddle: { zh: '拔河的兩端勢均力敵時，雲的厚度不過一粒沙。', en: 'When both ends of the tug-of-war are evenly matched, the cloud is only one grain thick.' },
      // 沉降：標高剛好等於顆粒半徑（3% 內）——重力與熱運動打平（重力佩克萊數 = 1），膠體與沉積的分界
      check: function (ev) { const d = ev.data; return ev.type === 'photo' && Math.abs(d.H / d.a - 1) <= 0.03; }
    },
    {
      id: 'brownian-motion-h4', level: 6, hidden: true,
      riddle: { zh: '時間拉得再長，它也沒有走出自己的影子。', en: 'However long you wait, it never steps out of its own shadow.' },
      // 觀察至少 30 s，結束時的方均根位移還不到半徑的 1/10
      check: function (ev) { const d = rec(ev); return !!d && d.row.tObs >= 30 && Math.sqrt(d.row.msdEnd) < d.row.a / 10; }
    },
    {
      id: 'brownian-motion-h5', level: 7, hidden: true,
      riddle: { zh: '兩條河，一條稠、一條清；調好爐火，兩岸的舞者便踩成同一拍。', en: 'Two rivers, one thick and one clear; tune the fire, and the dancers on both banks fall into one rhythm.' },
      // 兩種不同液體、同一個半徑，量到的 D 相同（4% 內）
      check: function (ev) {
        return pairWith(ev, function (p, q) { return p.liquid !== q.liquid && sameA(p, q) && Math.abs(p.Dm / q.Dm - 1) <= 0.04; });
      }
    },
    {
      id: 'brownian-motion-h6', level: 10, hidden: true,
      riddle: { zh: '一條路往下沉，一條路向外散；兩條路的盡頭，寫著同一個數。', en: 'One road sinks, one road spreads; at the end of both is written the same number.' },
      // 同一個半徑、同一個溫度：擴散法與沉降法的 N_A 都在定義值 3% 內，而且彼此相差 2% 內
      check: function (ev) {
        const d = ev.data;
        let sed = null, rows = [];
        if (ev.type === 'photo') { sed = d; rows = d.rows || []; }
        else if (ev.type === 'record') { sed = d.sed; rows = [d.row]; }
        if (!sed || !(sed.counted > 0) || Math.abs(sed.naErr) > 0.03) return false;
        return rows.some(function (r) { return sameA(r, sed) && sameT(r, sed) && Math.abs(r.naErr) <= 0.03 && Math.abs(r.NA / sed.NA - 1) <= 0.02; });
      }
    },
    {
      id: 'brownian-motion-h7', level: 9, hidden: true,
      riddle: { zh: '巴黎的那滴金色樹脂，至今仍在同一個高度喘一口氣。', en: 'That drop of golden resin in Paris still pauses for breath at the same height.' },
      // 重現佩蘭（1909）：藤黃、室溫（15–25 °C）、累計至少 1000 顆，量到濃度每升高 5.5–7 μm 減半（佩蘭：約 6 μm）
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'photo' && d.material === 'gamboge' && d.T >= 15 && d.T <= 25 && d.counted >= 1000 && d.half >= 5.5 && d.half <= 7;
      }
    },
    {
      id: 'brownian-motion-h8', level: 8, hidden: true,
      riddle: { zh: '千萬次擲骰，總有一回骰子滾出了桌邊。', en: 'Throw the dice ten thousand times, and once a die rolls off the table.' },
      // 尾端事件：某一顆最後離起點的 r² 超過 8 × 4Dt（每顆機率 e^(−8) ≈ 0.034%）。
      // 要刻意「快速大量擲骰」：50 顆、觀察 ≤ 2 s 的記錄才算（機率與觀察時間無關，預設 20 顆 10 s 不會碰巧完成）
      check: function (ev) { const d = rec(ev); return !!d && d.row.N === 50 && d.row.tObs <= 2 && d.row.tail >= 8; }
    },
    {
      id: 'brownian-motion-h9', level: 5, hidden: true,
      riddle: { zh: '爐火更旺了，舞者卻陷進了泥沼。', en: 'The fire burns hotter, yet the dancer sinks into the mire.' },
      // 同一個顆粒：換成更黏的液體、溫度高了至少 20 °C，D 反而只剩一半以下
      check: function (ev) {
        return pairWith(ev, function (hot, cold) {
          return sameA(hot, cold) && ETA_RANK[hot.liquid] > ETA_RANK[cold.liquid] && hot.T - cold.T >= 20 && hot.Dm <= 0.5 * cold.Dm;
        });
      }
    },
    {
      id: 'brownian-motion-h10', level: 7, hidden: true,
      riddle: { zh: '獨行者的一生，與眾人的一瞬，寫下同一行字。', en: 'A lone walker’s lifetime and a crowd’s single instant write the same line.' },
      // 遍歷性：同一組設定，一顆看 ≥ 50 s（時間平均）與 ≥ 40 顆看 ≤ 2 s（多顆粒平均），兩個 D 都在理論 10% 內、彼此差 10% 內
      check: function (ev) {
        return pairWith(ev, function (one, many) {
          return sameSet(one, many) && one.N === 1 && one.tObs >= 50 && many.N >= 40 && many.tObs <= 2 &&
            Math.abs(one.err) <= 0.10 && Math.abs(many.err) <= 0.10 && Math.abs(one.Dm / many.Dm - 1) <= 0.10;
        });
      }
    }
  ]);
})();
