/* missions/ohms-law.js — 歐姆定律與電路的任務（星星數 = 等級 1–10） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  // 事件（js/ohms-law.js 只在使用者操作後回報；拖曳滑桿時只在放開時回報一次）：
  //   'record'：按「記錄」成功時 { el（a b c d e carbon X lamp）, m（'ext' 外接｜'int' 內接）, ideal, zeroed, V, I（讀數，V、A）,
  //              fsA, fsV, defA, defV（讀數 ÷ 滿刻度）, emf, box, Rtrue, VR, IR, n（這一組的點數）, revealed, lampCold,
  //              fit（這一組通過原點的直線：{ n, R, err, r2, vmin, vmax, allReal }）, fits（每個元件、每種接法：'el|m' → fit）,
  //              lamp：{ n, ratio（V/I 最大 ÷ 最小）, rmin, rmax, vmin, vmax } }
  //   'meter'：改變電源、電阻箱、元件、接法、檔位或模式（放開時）{ action, el, m, ideal, emf, box, V, I, VV, IA, VR, IR,
  //              fsA, fsV, defA, defV, overA, overV, burnt, wasBurnt }
  //   'burnout'：燈絲燒斷 { el, emf, box, m }
  //   'multimeter'：用三用電表量電阻（電源 0 V）{ el, value, over, Rtrue, cold }
  //   'zero'、'reveal'
  const isR = function (ev) { return ev.type === 'record' && ev.data; };
  const ohmic = function (el) { return el !== 'lamp'; };
  const fitsOf = function (d) { return d.fits || {}; };
  /** 某元件（任一種接法）是否有一組合格的數據 */
  const anyFit = function (d, el, test) {
    return ['ext', 'int'].some(function (m) { const f = fitsOf(d)[el + '|' + m]; return f && isFinite(f.R) && test(f); });
  };

  LabMission.register('ohms-law', [
    {
      id: 'ohms-law-1', level: 1,
      title: { zh: '第一筆數據', en: 'The first reading' },
      desc: { zh: '接通電源，讓兩個電表都有讀數，按「記錄」記下第一組電壓與電流。', en: 'Switch on the supply so that both meters show a reading, then press “Record” to log your first voltage and current.' },
      check: function (ev) { const d = ev.data; return isR(ev) && d.V > 0 && d.I > 0; }
    },
    {
      id: 'ohms-law-2', level: 2,
      title: { zh: '指針過半', en: 'Past halfway' },
      desc: { zh: '選好檔位，讓毫安培計與伏特計的指針同時偏轉超過滿刻度的一半，再記錄一點。', en: 'Choose the ranges so that both the milliammeter and the voltmeter needles swing past half of full scale at the same time, then record a point.' },
      check: function (ev) { const d = ev.data; return isR(ev) && d.defA >= 0.5 && d.defV >= 0.5; }
    },
    {
      id: 'ohms-law-3', level: 3,
      title: { zh: '一條直線', en: 'A straight line' },
      desc: { zh: '對同一個電阻、同一種接法，記錄至少 6 點，最大電壓至少是最小電壓的 4 倍，而且數據點幾乎在一條直線上（R² ≥ 0.998）。', en: 'For one resistor and one connection, record at least 6 points with the largest voltage at least 4 times the smallest, all lying almost on a straight line (R² ≥ 0.998).' },
      check: function (ev) {
        const d = ev.data, f = d && d.fit;
        return isR(ev) && ohmic(d.el) && f && f.n >= 6 && f.vmax >= 4 * f.vmin && f.r2 >= 0.998;
      }
    },
    {
      id: 'ohms-law-4', level: 4,
      title: { zh: '兩種接法比一比', en: 'Two connections, side by side' },
      desc: { zh: '同一個電阻，用安培計外接法與內接法各記錄至少 4 點，比較兩條直線的斜率。', en: 'For the same resistor, record at least 4 points with the ammeter outside and at least 4 with it inside, and compare the two slopes.' },
      check: function (ev) {
        const d = ev.data;
        if (!isR(ev) || !ohmic(d.el)) return false;
        const a = fitsOf(d)[d.el + '|ext'], b = fitsOf(d)[d.el + '|int'];
        return !!(a && b && a.n >= 4 && b.n >= 4);
      }
    },
    {
      id: 'ohms-law-5', level: 5,
      title: { zh: '細銅線的真面目', en: 'The truth about thin copper' },
      desc: { zh: '量銅線 b：用同一種接法記錄至少 5 點，由斜率求出的電阻和 ρL/A 的計算值相差不到 1%。', en: 'Measure copper wire b: record at least 5 points with one connection so that the resistance from the slope agrees with ρL/A to within 1%.' },
      check: function (ev) {
        const d = ev.data, f = d && d.fit;
        return isR(ev) && d.el === 'b' && f && f.n >= 5 && f.err != null && Math.abs(f.err) <= 0.01;
      }
    },
    {
      id: 'ohms-law-6', level: 5,
      title: { zh: '鎳鉻線的真面目', en: 'The truth about nichrome' },
      desc: { zh: '量鎳鉻線 e：用同一種接法記錄至少 5 點，實驗值和 ρL/A 的計算值相差不到 1%。', en: 'Measure nichrome wire e: record at least 5 points with one connection so that your result agrees with ρL/A to within 1%.' },
      check: function (ev) {
        const d = ev.data, f = d && d.fit;
        return isR(ev) && d.el === 'e' && f && f.n >= 5 && f.err != null && Math.abs(f.err) <= 0.01;
      }
    },
    {
      id: 'ohms-law-7', level: 6,
      title: { zh: '彎彎的曲線', en: 'A bending curve' },
      desc: { zh: '量小燈泡：記錄至少 8 點，而且其中最大的 V/I 至少是最小 V/I 的 3 倍。', en: 'Measure the bulb: record at least 8 points, with the largest V/I at least 3 times the smallest.' },
      check: function (ev) {
        const d = ev.data, L = d && d.lamp;
        return isR(ev) && d.el === 'lamp' && L && L.n >= 8 && L.ratio >= 3;
      }
    },
    {
      id: 'ohms-law-8', level: 7,
      title: { zh: '冷與熱', en: 'Cold and hot' },
      desc: { zh: '先在電源 0 V 時用三用電表量燈泡的冷電阻，再讓燈泡在額定電壓附近（2.4 V 到 2.6 V）記錄一點：發光時的 V/I 至少是冷電阻的 8 倍。', en: 'First use the multimeter (supply at 0 V) to measure the cold bulb, then record a point near its rated voltage (2.4 V to 2.6 V): its V/I while glowing must be at least 8 times the cold resistance.' },
      check: function (ev) {
        const d = ev.data;
        return isR(ev) && d.el === 'lamp' && d.lampCold > 0 && d.I > 0 && d.V >= 2.4 && d.V <= 2.6 && (d.V / d.I) >= 8 * d.lampCold;
      }
    },
    {
      id: 'ohms-law-9', level: 7,
      title: { zh: '揭開 X 之前', en: 'Before the tape comes off' },
      desc: { zh: '不看色環，量神秘電阻 X：用同一種接法記錄至少 5 點，實驗值與真實值相差不到 1.5%（要自己判斷該用哪一種接法與哪一個檔位）。', en: 'Without looking at the colour code, measure the mystery resistor X: record at least 5 points with one connection and get within 1.5% of its true value (you must decide which connection and ranges suit it).' },
      check: function (ev) {
        const d = ev.data, f = d && d.fit;
        return isR(ev) && d.el === 'X' && !d.revealed && f && f.n >= 5 && f.err != null && Math.abs(f.err) <= 0.015;
      }
    },
    {
      id: 'ohms-law-10', level: 8,
      title: { zh: '長度與截面積', en: 'Length and cross-section' },
      desc: { zh: '銅線 a、b、c、d 都要量：每一條至少有一組 4 點以上的數據，實驗值與 ρL/A 都相差不到 2%。', en: 'Measure all four copper wires a, b, c and d: each needs a data set of at least 4 points agreeing with ρL/A to within 2%.' },
      check: function (ev) {
        const d = ev.data;
        if (!isR(ev)) return false;
        return ['a', 'b', 'c', 'd'].every(function (el) {
          return anyFit(d, el, function (f) { return f.n >= 4 && f.err != null && Math.abs(f.err) <= 0.02; });
        });
      }
    },
    {
      id: 'ohms-law-11', level: 9,
      title: { zh: '真實世界的 X', en: 'X in the real world' },
      desc: { zh: '在「含誤差」模式、兩個電表都歸零後量神秘電阻 X：同一種接法記錄至少 6 點（全部是含誤差的讀數），實驗值與真實值相差不到 2%。', en: 'In “with errors” mode, after zeroing both meters, measure the mystery resistor X: at least 6 points with one connection (all of them real readings), within 2% of its true value.' },
      check: function (ev) {
        const d = ev.data, f = d && d.fit;
        return isR(ev) && d.el === 'X' && !d.ideal && f && f.allReal && f.n >= 6 && f.err != null && Math.abs(f.err) <= 0.02;
      }
    },
    {
      id: 'ohms-law-12', level: 10,
      title: { zh: '大師：精密量測', en: 'Master: precision measurement' },
      desc: { zh: '在「含誤差」模式、兩個電表都歸零後量鎳鉻線 e：同一種接法記錄至少 8 點（全部是含誤差的讀數），實驗值與 ρL/A 相差不到 1%。', en: 'In “with errors” mode, after zeroing both meters, measure nichrome wire e: at least 8 points with one connection (all of them real readings), within 1% of ρL/A.' },
      check: function (ev) {
        const d = ev.data, f = d && d.fit;
        return isR(ev) && d.el === 'e' && !d.ideal && f && f.allReal && f.n >= 8 && f.err != null && Math.abs(f.err) <= 0.01;
      }
    },
    // ---------- 隱藏任務：只給隱晦的提示 ----------
    {
      id: 'ohms-law-h1', level: 3, hidden: true,
      riddle: { zh: '最燦爛的一瞬，也是最後一瞬。', en: 'The brightest moment is also the last.' },
      check: function (ev) { return ev.type === 'burnout'; }
    },
    {
      id: 'ohms-law-h2', level: 5, hidden: true,
      riddle: { zh: '斷橋的兩岸，落差最大。', en: 'The two banks of a broken bridge stand farthest apart.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'meter' && d && d.el === 'lamp' && d.burnt && d.wasBurnt && d.emf >= 1 && d.VV >= 0.95 * d.emf && !d.overV;
      }
    },
    {
      id: 'ohms-law-h3', level: 4, hidden: true,
      riddle: { zh: '一半給你，一半給我。', en: 'Half for you, half for me.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'meter' && d && !d.burnt && d.emf >= 2 && d.box >= 1 && Math.abs(d.VV / d.emf - 0.5) <= 0.005;
      }
    }
  ]);
})();
