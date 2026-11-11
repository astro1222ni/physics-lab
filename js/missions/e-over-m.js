/* missions/e-over-m.js — 電子的荷質比的任務（星星數 = 等級 1–10） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  // 事件（js/e-over-m.js 回報；長度單位 cm，電表讀數 Vm (V)、Im (A)）：
  //   'power'：按電源開關 { on, fromMin（開機時兩個旋鈕都在 0） }
  //   'beam'：放開滑桿、切換模式、開機加熱完成後
  //     { power, warm, on（看得到電子束）, fromMin, complete（完整的圓、α = 0）, V, I, Vm, Im, alpha (°), mode ('ideal'|'real'),
  //       parallax, closed, hitGlass, turns, D（電子束真正的直徑）, top（最高點的 y，球心為 0）, gap（離玻璃內壁最近的距離）, zMax }
  //   'record'：按「記錄」成功
  //     { row: { V, I（電表讀數）, xL, xR, D（游標讀出的直徑）, Dtrue, mode, parallax, eyeOK（視差模式下兩個游標都在眼睛正對時對準）, em, err（e/m 相對誤差） },
  //       rows: [同上…], n, distinctV（不同電壓數）, fitErr（最佳直線斜率的相對誤差）, meanErr, allReal（每筆都是含誤差＋視差＋eyeOK） }
  //   'clear'：全部清除
  const EM = 1.75882001076e11;
  const rows = function (d) { return d.rows || []; };
  const near = function (a, b, r) { return Math.abs(a - b) <= r * Math.abs(b); };

  LabMission.register('e-over-m', [
    {
      id: 'e-over-m-1', level: 1,
      title: { zh: '點亮電子束', en: 'Light up the beam' },
      desc: { zh: '照正確的步驟開機：兩個旋鈕都在 0 時打開電源，再調整電壓與電流，讓電子束彎成一個完整的圓。', en: 'Switch on the right way: turn on the power with both knobs at 0, then adjust the voltage and the current until the beam bends into a complete circle.' },
      check: function (ev) { return ev.type === 'beam' && ev.data.complete && ev.data.fromMin; }
    },
    {
      id: 'e-over-m-2', level: 2,
      title: { zh: '第一筆數據', en: 'First data point' },
      desc: { zh: '把加速電壓調到電壓表讀 100 V，量出圓的直徑並記錄下來。', en: 'Set the voltmeter to 100 V, measure the diameter of the circle and record it.' },
      check: function (ev) { return ev.type === 'record' && ev.data.row.V === 100; }
    },
    {
      id: 'e-over-m-3', level: 3,
      title: { zh: '對準光束的中央', en: 'Right on the beam' },
      desc: { zh: '記錄一筆數據，讓游標量出的直徑與電子束真正的直徑相差不到 0.10 cm（用放大鏡對準光帶的中央）。', en: 'Record a row whose measured diameter is within 0.10 cm of the true beam diameter (use the magnifiers to line up with the middle of the glowing band).' },
      check: function (ev) { return ev.type === 'record' && Math.abs(ev.data.row.D - ev.data.row.Dtrue) <= 0.10; }
    },
    {
      id: 'e-over-m-4', level: 4,
      title: { zh: '磁場加倍', en: 'Double the field' },
      desc: { zh: '在同一個電壓下記錄兩筆數據，電流（磁場）剛好相差 2 倍（2% 內），而且量到的直徑也剛好相差 2 倍（2% 內）。', en: 'At the same voltage, record two rows whose currents (and so fields) differ by a factor of 2 (within 2%) and whose measured diameters also differ by a factor of 2 (within 2%).' },
      check: function (ev) {
        if (ev.type !== 'record') return false;
        const a = ev.data.row;
        return rows(ev.data).some(function (b) {
          if (b.V !== a.V || !(a.I > 0 && b.I > 0)) return false;
          const big = a.I > b.I ? a : b, small = a.I > b.I ? b : a;
          return near(big.I / small.I, 2, 0.02) && near(small.D / big.D, 2, 0.02);
        });
      }
    },
    {
      id: 'e-over-m-5', level: 5,
      title: { zh: '完成課本數據表', en: 'Complete the textbook table' },
      desc: { zh: '在 100 V、150 V、200 V、250 V（電壓表讀數）各記錄一筆，每一筆算出的 e/m 都與公認值相差 5% 以內。', en: 'Record one row at each of 100 V, 150 V, 200 V and 250 V (voltmeter readings), each giving an e/m within 5% of the accepted value.' },
      check: function (ev) {
        if (ev.type !== 'record') return false;
        const ok = {};
        rows(ev.data).forEach(function (r) { if (Math.abs(r.em / EM - 1) <= 0.05) ok[r.V] = true; });
        return ok[100] && ok[150] && ok[200] && ok[250];
      }
    },
    {
      id: 'e-over-m-6', level: 6,
      title: { zh: '電壓加倍，圓卻不變', en: 'Double the voltage, same circle' },
      desc: { zh: '記錄兩筆數據：電壓剛好相差 2 倍（1% 內），量到的直徑卻相同（差 0.10 cm 內）。想一想：電流要調成幾倍？', en: 'Record two rows whose voltages differ by a factor of 2 (within 1%) but whose measured diameters are the same (within 0.10 cm). Think: by what factor must the current change?' },
      check: function (ev) {
        if (ev.type !== 'record') return false;
        const a = ev.data.row;
        return rows(ev.data).some(function (b) {
          if (!(a.V > 0 && b.V > 0)) return false;
          return near(Math.max(a.V, b.V) / Math.min(a.V, b.V), 2, 0.01) && Math.abs(a.D - b.D) <= 0.10;
        });
      }
    },
    {
      id: 'e-over-m-7', level: 7,
      title: { zh: '消除視差', en: 'Beat the parallax' },
      desc: { zh: '打開「視差」，記錄一筆直徑與真正直徑相差不到 0.06 cm 的數據。對準每一個游標時，眼睛都要在它的正前方（0.3 cm 內）。', en: 'Turn on “Parallax” and record a row whose diameter is within 0.06 cm of the true diameter. While lining up each cursor, your eye must be straight in front of it (within 0.3 cm).' },
      check: function (ev) { const r = ev.data.row; return ev.type === 'record' && r.parallax && r.eyeOK && Math.abs(r.D - r.Dtrue) <= 0.06; }
    },
    {
      id: 'e-over-m-8', level: 8,
      title: { zh: '最佳直線', en: 'Line of best fit' },
      desc: { zh: '記錄至少 4 筆、至少 3 種不同電壓的數據，讓 2V 對 (Br)² 圖的最佳直線斜率與公認的 e/m 相差 1% 以內。', en: 'Record at least 4 rows at 3 or more different voltages so that the slope of the best-fit line of 2V against (Br)² is within 1% of the accepted e/m.' },
      check: function (ev) { const d = ev.data; return ev.type === 'record' && d.n >= 4 && d.distinctV >= 3 && Math.abs(d.fitErr) <= 0.01; }
    },
    {
      id: 'e-over-m-9', level: 9,
      title: { zh: '均勻的代價', en: 'The price of uniformity' },
      desc: { zh: '在「含誤差」模式下，同一個電壓記錄一個小圓（直徑 6 cm 以下）和一個大圓（直徑 11.5 cm 以上），大圓算出的 e/m 比小圓小至少 4%。為什麼大圓會偏小？', en: 'In “With errors” mode, record a small circle (diameter 6 cm or less) and a large one (11.5 cm or more) at the same voltage, with the large circle’s e/m at least 4% lower than the small one’s. Why does the large circle come out low?' },
      check: function (ev) {
        if (ev.type !== 'record') return false;
        const a = ev.data.row;
        if (a.mode !== 'real') return false;
        return rows(ev.data).some(function (b) {
          if (b.mode !== 'real' || b.V !== a.V) return false;
          const small = a.D < b.D ? a : b, big = a.D < b.D ? b : a;
          return small.D <= 6 && big.D >= 11.5 && big.em <= 0.96 * small.em;
        });
      }
    },
    {
      id: 'e-over-m-10', level: 10,
      title: { zh: '大師：真實的實驗室', en: 'Master: a real laboratory' },
      desc: { zh: '每一筆都在「含誤差」模式、開啟「視差」並正對游標讀數：記錄至少 5 筆、至少 4 種不同電壓的數據，最佳直線算出的 e/m 與公認值相差 2% 以內。', en: 'With every row taken in “With errors” mode, with “Parallax” on and your eye straight in front of each cursor, record at least 5 rows at 4 or more different voltages so that the best-fit e/m is within 2% of the accepted value.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'record' && d.allReal && d.n >= 5 && d.distinctV >= 4 && Math.abs(d.fitErr) <= 0.02;
      }
    },
    // ---------- 隱藏任務：只給隱晦的提示 ----------
    {
      id: 'e-over-m-h1', level: 5, hidden: true,
      riddle: { zh: '不肯回到起點的光環，一圈一圈地離開了平面。', en: 'A ring that will not return to its start, leaving the plane one loop at a time.' },
      check: function (ev) { const d = ev.data; return ev.type === 'beam' && d.on && d.warm && d.alpha > 0 && d.turns >= 3; }
    },
    {
      id: 'e-over-m-h2', level: 7, hidden: true,
      riddle: { zh: '擁抱整個世界，卻不碰觸它的邊界。', en: 'Embrace the whole world without touching its edge.' },
      check: function (ev) { const d = ev.data; return ev.type === 'beam' && d.complete && d.gap >= 0 && d.gap <= 0.15; }
    },
    {
      id: 'e-over-m-h3', level: 6, hidden: true,
      riddle: { zh: '光環的頂端，輕輕吻上世界的心臟。', en: 'The crown of the ring gently kisses the heart of the world.' },
      check: function (ev) { const d = ev.data; return ev.type === 'beam' && d.complete && Math.abs(d.top) <= 0.05; }
    }
  ]);
})();
