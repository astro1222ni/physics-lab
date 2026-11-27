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

  // 理想讀數保留儀表內電阻，可用記錄的端電壓與支路電流分離儀表負載。
  // 比較兩筆符合題意的紀錄；0.01 V 的電源末位對配對量預留 0.3%。
  const proportion = (a, b, k) => b > 0 && Math.abs(a / b - k) <= 0.003 * k;
  function compareReadings(ev, mem, accepts, match) {
    if (!isR(ev)) return false;
    const d = ev.data;
    if (!d.ideal || !(d.IR > 0) || !accepts(d)) return false;
    const old = mem.last;
    mem.last = d;
    return !!old && (match(old, d) || match(d, old));
  }

  LabMission.register('ohms-law', [
    {
      id: 'ohms-law-1', level: 1,
      title: { zh: '第一筆數據', en: 'The first reading' },
      desc: { zh: '調整電源或電阻箱，使兩個電表都有讀數且在量程內，記錄第一組電壓與電流。', en: 'Adjust the supply or resistance box so both meters show positive readings within range, then record the voltage and current.' },
      check: function (ev) {
        const d = ev.data;
        return isR(ev) && d.readingSet && d.I > 0 && d.V > 0 && d.defA <= 1 + 1e-9 && d.defV <= 1 + 1e-9;
      }
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
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'burnout' && d.driveSet;
      }
    },
    {
      id: 'ohms-law-h2', level: 5, hidden: true,
      riddle: { zh: '斷橋的兩岸，落差最大。', en: 'The two banks of a broken bridge stand farthest apart.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'meter' && d.el === 'lamp' && d.burnt && d.wasBurnt && d.emf >= 1 - 1e-9 &&
          d.VV >= 0.95 * d.emf - 1e-9 && !d.overV;
      }
    },
    {
      id: 'ohms-law-h3', level: 4, hidden: true,
      riddle: { zh: '一半給你，一半給我。', en: 'Half for you, half for me.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'meter' && d && !d.burnt && d.emf >= 2 && d.box >= 1 && Math.abs(d.VV / d.emf - 0.5) <= 0.005;
      }
    },
    {
      id: 'ohms-law-h4', level: 3, hidden: true,
      riddle: { zh: '燈還亮著，帳單只寫了半頁。', en: 'The lamp still glows on half a page of the bill.' },
      desc: { zh: '記錄小燈泡消耗額定功率一半的工作點。額定值為 2.5 V、0.30 A，半功率為 0.375 W。', en: 'Record the bulb operating at half its rated power. Its 2.5 V and 0.30 A rating gives a half-power target of 0.375 W.' },
      check: function (ev) {
        const d = ev.data;
        // 電源每格 0.01 V；額定以下此處的功率末位約 0.003 W。
        return isR(ev) && d.ideal && d.el === 'lamp' && Math.abs(d.VR * d.IR - 0.375) <= 0.0016;
      }
    },
    {
      id: 'ohms-law-h5', level: 4, hidden: true,
      riddle: { zh: '旅人腳步加快，爐邊的帳翻了又翻。', en: 'A quicker step turns the hearth ledger over and over.' },
      desc: { zh: '用同一組器材記錄碳膜電阻的兩個工作點，驗證元件電流加倍時，焦耳熱功率變為四倍。', en: 'Record two operating points of the carbon resistor with unchanged wiring and meter ranges. Doubling the element current quadruples its heating power.' },
      check: function (ev, mem) {
        return compareReadings(ev, mem, d => d.el === 'carbon',
          (a, b) => a.m === b.m && a.fsA === b.fsA && a.fsV === b.fsV && a.box === b.box &&
            proportion(b.IR, a.IR, 2) && proportion(b.VR * b.IR, a.VR * a.IR, 4));
      }
    },
    {
      id: 'ohms-law-h6', level: 6, hidden: true,
      riddle: { zh: '同一隊旅人，在較長的巷子多付了一份路費。', en: 'The same procession pays a second toll on the longer street.' },
      desc: { zh: '在銅線 a、c 記錄相同電流，驗證同線徑的線長加倍時，所需電壓加倍。', en: 'Record the same current in wires a and c. At equal diameter, doubling the length doubles the voltage required.' },
      check: function (ev, mem) {
        return compareReadings(ev, mem, d => ['a', 'c'].includes(d.el),
          (a, c) => a.el === 'a' && c.el === 'c' && proportion(c.IR, a.IR, 1) && proportion(c.VR, a.VR, 2));
      }
    },
    {
      id: 'ohms-law-h7', level: 7, hidden: true,
      riddle: { zh: '不同長的細線，在夜裡繳同一筆暖氣費。', en: 'Unequal lengths of fine wire pay the same heating bill.' },
      desc: { zh: '讓同線徑、長度比為 1:2 的銅線 b、d 消耗相同功率，驗證長線電流為短線的 1/√2。', en: 'Dissipate equal power in wires b and d, whose lengths are in a 1:2 ratio. The longer wire carries the shorter wire’s current divided by the square root of two.' },
      check: function (ev, mem) {
        return compareReadings(ev, mem, d => ['b', 'd'].includes(d.el),
          (b, d) => b.el === 'b' && d.el === 'd' && proportion(d.IR * d.VR, b.IR * b.VR, 1) &&
            proportion(d.IR, b.IR, Math.SQRT1_2));
      }
    },
    {
      id: 'ohms-law-h8', level: 8, hidden: true,
      riddle: { zh: '窄巷與寬街的兩頭，都在同一對山坡上。', en: 'A narrow lane and a wide street join the same two hills.' },
      desc: { zh: '在等長銅線 a、b 兩端建立相同電壓，驗證線徑加倍時，截面積和電流都變為四倍。', en: 'Apply equal voltages across equal-length wires a and b. Doubling diameter quadruples cross-sectional area and current.' },
      check: function (ev, mem) {
        return compareReadings(ev, mem, d => ['a', 'b'].includes(d.el),
          (a, b) => a.el === 'a' && b.el === 'b' && proportion(a.VR, b.VR, 1) && proportion(a.IR, b.IR, 4));
      }
    },
    {
      id: 'ohms-law-h9', level: 9, hidden: true,
      riddle: { zh: '旁聽者換了一張椅子，悄悄少分走一些。', en: 'The listener changes seats and takes a smaller share.' },
      desc: { zh: '用外接法量鎳鉻線 e，在相同元件電壓下切換 3 V、15 V 檔，驗證兩筆紀錄中伏特計分去的電流相差五倍。', en: 'With the ammeter outside the voltmeter branch, measure wire e at the same element voltage on the 3 V and 15 V ranges. Verify fivefold voltmeter-current loading.' },
      check: function (ev, mem) {
        return compareReadings(ev, mem, d => d.el === 'e' && d.m === 'ext',
          (a, b) => a.fsV === 3 && b.fsV === 15 && a.fsA === b.fsA && proportion(a.VR, b.VR, 1) &&
            proportion(a.I - a.IR, b.I - b.IR, 5));
      }
    },
    {
      id: 'ohms-law-h10', level: 10, hidden: true,
      riddle: { zh: '守門人換班，帳上多出的過路費也換了。', en: 'When the gatekeeper changes, so does the unexplained toll.' },
      desc: { zh: '用內接法量碳膜電阻，切換 5 mA 與 50 mA 檔並調回相同元件電流，驗證安培計分去的電壓相差十倍。', en: 'Measure the carbon resistor with the ammeter inside the voltmeter span. At equal element current, the 5 mA and 50 mA ranges give a tenfold difference in ammeter voltage drop.' },
      check: function (ev, mem) {
        return compareReadings(ev, mem, d => d.el === 'carbon' && d.m === 'int',
          (a, b) => a.fsA === 0.005 && b.fsA === 0.05 && a.fsV === b.fsV && proportion(a.IR, b.IR, 1) &&
            proportion(a.V - a.VR, b.V - b.VR, 10));
      }
    }
  ]);
})();
