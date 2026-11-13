/* missions/paper-chromatography.js — 紙色層分析的任務（星星數 = 等級 1–10；隱藏任務 = 等級 × 2） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  // 事件（js/paper-chromatography.js 只在使用者操作之後回報）：
  //   'tick'：展開中每 0.5 秒 { t, s, sInf, top, dF, ranOff, submerged, frac, anySample, lid, lidOpenAll, lidClosedAll, solvent, phi, pen, penMove }
  //   'take'：取出濾紙 { paper, t, dF, ranOff, submerged, lidOpenAll, lidClosedAll, solvent, phi, spot, z0, zL, pen, penMove,
  //            lanes: [{ key, n, peaks, minRs, minRsRef, comps: [{ id, rf, rfW, rfE, d, vis }] }] }
  //   'measure'：量一個斑點 { paper, lane, key, d, dF, Rf, dom, purity, rfTrue, valid, ranOff, lidClosedAll, lidOpenAll, stalled, solvent, phi, hist }
  //   'identify'：未知樣品 { ok, revealed, tries, ran }
  const TK = function (ev) { return ev.type === 'tick' && ev.data ? ev.data : null; };
  const TA = function (ev) { return ev.type === 'take' && ev.data && !ev.data.submerged ? ev.data : null; };
  const ME = function (ev) { return ev.type === 'measure' && ev.data ? ev.data : null; };
  const lane = function (d, key) { return d.lanes.filter(function (L) { return L.key === key; }); };
  const good = function (m) { return m && m.valid && m.Rf != null && m.purity >= 0.9; };
  /** 展開條件（同一種展開液、同一個乙醇比例） */
  const sameCond = function (a, b) { return a.solvent === b.solvent && Math.abs(a.phi - b.phi) < 0.005; };
  const farCond = function (a, b) { return a.solvent !== b.solvent || Math.abs(a.phi - b.phi) >= 0.1; };

  LabMission.register('paper-chromatography', [
    {
      id: 'paper-chromatography-1', level: 1,
      title: { zh: '黑色裡藏著彩虹', en: 'A rainbow inside black' },
      desc: { zh: '把黑色水性筆的樣品展開，取出濾紙時那一道至少看得出 3 個斑點。', en: 'Develop the black marker sample: when you take the paper out, its lane must show at least 3 separate spots.' },
      check: function (ev) { const d = TA(ev); return !!d && lane(d, 'ink').some(function (L) { return L.peaks >= 3; }); }
    },
    {
      id: 'paper-chromatography-2', level: 2,
      title: { zh: '第一個 Rf', en: 'My first Rf' },
      desc: { zh: '取出濾紙、標記溶劑前緣，量出一個斑點的 Rf 值。', en: 'Take the paper out, mark the solvent front and measure the Rf value of a spot.' },
      check: function (ev) { const d = ME(ev); return !!d && d.valid && d.Rf != null; }
    },
    {
      id: 'paper-chromatography-3', level: 2,
      title: { zh: '起始線泡到水了', en: 'The start line went under' },
      desc: { zh: '示範一個常見錯誤：讓起始線低於液面再展開，直到濾紙上的樣品八成以上溶進展開液。', en: 'Show a common mistake: put the start line below the solvent surface and develop until more than 80% of the sample has dissolved into the solvent.' },
      check: function (ev) { const d = TK(ev); return !!d && d.submerged && d.anySample && d.frac <= 0.2; }
    },
    {
      id: 'paper-chromatography-4', level: 3,
      title: { zh: '跑出紙外', en: 'Off the top' },
      desc: { zh: '示範另一個常見錯誤：展開太久，讓溶劑前緣到達濾紙上緣。', en: 'Show another common mistake: develop for too long, so that the solvent front reaches the top of the paper.' },
      check: function (ev) { const d = TK(ev); return !!d && d.ranOff; }
    },
    {
      id: 'paper-chromatography-5', level: 3,
      title: { zh: '點太大就糊了', en: 'Too big a spot' },
      desc: { zh: '點樣直徑 8 mm 以上，取出時有一道相鄰成分的解析度 Rs < 0.8；同樣的展開若只點 2 mm，Rs 會在 1.2 以上。', en: 'With a spot of 8 mm or more, take out a paper where two neighbouring substances in a lane have Rs < 0.8, although a 2 mm spot under the same conditions would give Rs ≥ 1.2.' },
      check: function (ev) {
        const d = TA(ev);
        return !!d && d.spot >= 8 && d.lanes.some(function (L) { return L.minRs != null && L.minRs < 0.8 && L.minRsRef != null && L.minRsRef >= 1.2; });
      }
    },
    {
      id: 'paper-chromatography-6', level: 4,
      title: { zh: '葉子的四種色素', en: 'Four pigments in a leaf' },
      desc: { zh: '把菠菜葉萃取液分成 4 個斑點，相鄰兩個的解析度 Rs 都 ≥ 1。', en: 'Separate the spinach-leaf extract into 4 spots, with a resolution Rs of at least 1 between neighbours.' },
      check: function (ev) { const d = TA(ev); return !!d && lane(d, 'leaf').some(function (L) { return L.n === 4 && L.minRs >= 1; }); }
    },
    {
      id: 'paper-chromatography-7', level: 5,
      title: { zh: 'Rf 不看展開多久', en: 'Rf ignores the running time' },
      desc: { zh: '用同一種展開液在兩張濾紙上量同一種物質：兩次前緣的距離相差 3 cm 以上，Rf 卻相差不到 0.02。', en: 'Measure the same substance on two papers with the same solvent: the front distances differ by 3 cm or more, yet the Rf values agree within 0.02.' },
      check: function (ev) {
        const d = ME(ev);
        if (!good(d)) return false;
        return d.hist.some(function (h) { return good(h) && h.paper !== d.paper && h.dom === d.dom && sameCond(h, d) && Math.abs(h.dF - d.dF) >= 3 && Math.abs(h.Rf - d.Rf) <= 0.02; });
      }
    },
    {
      id: 'paper-chromatography-8', level: 5,
      title: { zh: '換展開液，換 Rf', en: 'New solvent, new Rf' },
      desc: { zh: '同一種物質在兩種不同的展開液中量 Rf，兩個值相差 0.3 以上。', en: 'Measure the Rf of the same substance in two different solvents, with values that differ by 0.3 or more.' },
      check: function (ev) {
        const d = ME(ev);
        if (!good(d)) return false;
        return d.hist.some(function (h) { return good(h) && h.dom === d.dom && farCond(h, d) && Math.abs(h.Rf - d.Rf) >= 0.3; });
      }
    },
    {
      id: 'paper-chromatography-9', level: 6,
      title: { zh: '咖啡色的祕密', en: 'The secret of brown' },
      desc: { zh: '把咖啡色食用色素分成 3 個斑點，相鄰兩個的解析度 Rs 都 ≥ 1。', en: 'Separate the brown food colouring into 3 spots, with a resolution Rs of at least 1 between neighbours.' },
      check: function (ev) { const d = TA(ev); return !!d && lane(d, 'brown').some(function (L) { return L.n === 3 && L.minRs >= 1; }); }
    },
    {
      id: 'paper-chromatography-10', level: 7,
      title: { zh: '辨認未知樣品', en: 'Identify the unknown' },
      desc: { zh: '把未知樣品 X 和標準品一起展開，第一次核對就答對 X 含有哪些色素（不可先揭曉）。', en: 'Develop the unknown sample X with the standards and name the dyes in X correctly at the first check (without revealing it).' },
      check: function (ev) { return ev.type === 'identify' && !!ev.data && ev.data.ok && !ev.data.revealed && ev.data.tries === 1 && ev.data.ran; }
    },
    {
      id: 'paper-chromatography-11', level: 8,
      title: { zh: '精準量 Rf', en: 'A precise Rf' },
      desc: { zh: '前緣離起始線 10 cm 以上，量到的 Rf 與這種物質真正的 Rf 相差不到 0.01。', en: 'With the front at least 10 cm from the start line, measure an Rf within 0.01 of the true value for that substance.' },
      check: function (ev) { const d = ME(ev); return good(d) && d.dF >= 10 && Math.abs(d.Rf - d.rfTrue) <= 0.01; }
    },
    {
      id: 'paper-chromatography-12', level: 9,
      title: { zh: '黑色墨水完全分離', en: 'Black ink, fully resolved' },
      desc: { zh: '把黑色水性筆的 4 種染料完全分開：相鄰兩個的解析度 Rs 都 ≥ 2。', en: 'Separate all 4 dyes of the black marker completely: Rs of at least 2 between every pair of neighbours.' },
      check: function (ev) { const d = TA(ev); return !!d && lane(d, 'ink').some(function (L) { return L.n === 4 && L.minRs >= 2; }); }
    },

    // ---------------- 隱藏任務 ----------------
    {
      id: 'paper-chromatography-h1', level: 3, hidden: true,
      riddle: { zh: '潮水來了又走，它始終守在岸邊。', en: 'The tide came and went; it never left the shore.' },
      // 極性的展開液（食鹽水、乙醇 ≤ 30% 的水溶液）裡，不溶於水的物質留在起始線
      check: function (ev) {
        const d = ME(ev);
        return !!d && d.valid && (d.solvent === 'salt' || (d.solvent === 'mix' && d.phi <= 0.3)) && d.Rf <= 0.02 && d.rfTrue != null && d.rfTrue <= 0.02 && d.dF >= 10;
      }
    },
    {
      id: 'paper-chromatography-h2', level: 4, hidden: true,
      riddle: { zh: '它和浪頭並肩抵達，只差一步。', en: 'It arrived shoulder to shoulder with the wave, one step behind.' },
      check: function (ev) { const d = ME(ev); return !!d && d.valid && d.lidClosedAll && d.purity >= 0.95 && d.dF >= 10 && d.Rf >= 0.955 && d.rfTrue != null && d.rfTrue >= 0.95; }
    },
    {
      id: 'paper-chromatography-h3', level: 5, hidden: true,
      riddle: { zh: '連畫線的那支筆，也有話要說。', en: 'Even the pen that drew the line had something to say.' },
      check: function (ev) { const d = ME(ev); return !!d && d.valid && d.dom === 'pen' && d.purity >= 0.9 && d.d >= 3; }
    },
    {
      id: 'paper-chromatography-h4', level: 6, hidden: true,
      riddle: { zh: '換了一片海，先到的成了後到的。', en: 'In another sea, the first to arrive came last.' },
      check: function (ev) {
        const d = ME(ev);
        if (!good(d)) return false;
        const all = d.hist.filter(good).concat([d]);
        // 每張濾紙上每種物質的 Rf
        const byPaper = {};
        all.forEach(function (m) { (byPaper[m.paper] = byPaper[m.paper] || { m: m, rf: {} }).rf[m.dom] = m.Rf; });
        const papers = Object.keys(byPaper).map(function (k) { return byPaper[k]; });
        const mine = byPaper[d.paper];
        return papers.some(function (q) {
          if (q === mine || !farCond(q.m, mine.m)) return false;
          return Object.keys(mine.rf).some(function (a) {
            return Object.keys(mine.rf).some(function (b) {
              if (a === b || q.rf[a] == null || q.rf[b] == null) return false;
              return mine.rf[a] - mine.rf[b] >= 0.03 && q.rf[b] - q.rf[a] >= 0.03;
            });
          });
        });
      }
    },
    {
      id: 'paper-chromatography-h5', level: 7, hidden: true,
      riddle: { zh: '兩個急性子湊在一起，反而慢吞吞。', en: 'Two hasty friends together, and suddenly in no hurry.' },
      check: function (ev) { const d = TA(ev); return !!d && d.solvent === 'mix' && Math.abs(d.phi - 0.5585) <= 0.012 && d.lidClosedAll && !d.ranOff && d.dF >= 4; }
    },
    {
      id: 'paper-chromatography-h6', level: 7, hidden: true,
      riddle: { zh: '天花板不在紙的盡頭，在看不見的風裡；連尺也跟著說了謊。', en: 'The ceiling is not at the end of the paper but in an invisible wind, and even the ruler lies.' },
      check: function (ev) {
        // 同一種物質、同一種展開液：一張全程沒蓋、前緣停在 s∞ 時量，另一張全程蓋著量，沒蓋的 Rf 偏大 0.1 以上
        const d = ME(ev);
        if (!good(d) || !(d.stalled || d.lidClosedAll)) return false;
        return d.hist.some(function (h) {
          if (!good(h) || h.paper === d.paper || h.dom !== d.dom || !sameCond(h, d)) return false;
          const open = d.stalled ? d : h.stalled ? h : null, shut = d.lidClosedAll ? d : h.lidClosedAll ? h : null;
          return !!open && !!shut && open !== shut && open.Rf - shut.Rf >= 0.1;
        });
      }
    },
    {
      id: 'paper-chromatography-h7', level: 8, hidden: true,
      riddle: { zh: '一半的時間在家，一半的時間在路上。', en: 'Half its time at home, half on the road.' },
      check: function (ev) { const d = ME(ev); return !!d && d.valid && d.purity >= 0.95 && d.dF >= 10 && Math.abs(d.Rf - 0.5) <= 0.003 && d.rfTrue != null && Math.abs(d.rfTrue - 0.5) <= 0.004; }
    },
    {
      id: 'paper-chromatography-h8', level: 8, hidden: true,
      riddle: { zh: '兩個陌生人，在同一刻抵達同一個車站。', en: 'Two strangers reach the same station at the same moment.' },
      check: function (ev) {
        const d = TA(ev);
        if (!d || d.solvent !== 'mix' || d.dF < 5) return false;
        return d.lanes.some(function (L) {
          const c = L.comps.filter(function (q) { return q.vis; });
          for (let i = 0; i < c.length; i++) for (let j = i + 1; j < c.length; j++) {
            const a = c[i], b = c[j], w = a.rfW - b.rfW, e = a.rfE - b.rfE;
            if (Math.abs(a.rf - b.rf) <= 0.001 && Math.abs(w) >= 0.02 && Math.abs(e) >= 0.02 && w * e < 0) return true;
          }
          return false;
        });
      }
    },
    {
      id: 'paper-chromatography-h9', level: 9, hidden: true,
      riddle: { zh: '四色糖衣褪下時，彼此保持禮貌的距離。', en: 'When the four colours slip off the candy, they keep a polite distance.' },
      check: function (ev) { const d = TA(ev); return !!d && lane(d, 'candy').some(function (L) { return L.n === 4 && L.minRs >= 1.5; }); }
    },
    {
      id: 'paper-chromatography-h10', level: 10, hidden: true,
      riddle: { zh: '一分半鐘，三種顏色各奔前程。', en: 'Ninety seconds, and three colours go their separate ways.' },
      check: function (ev) { const d = TA(ev); return !!d && !d.ranOff && d.t <= 90 && lane(d, 'brown').some(function (L) { return L.n === 3 && L.minRs >= 1; }); }
    }
  ]);
})();
