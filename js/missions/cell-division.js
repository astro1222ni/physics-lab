/* missions/cell-division.js — 細胞分裂的任務（一般任務星星數 = 等級；隱藏任務 = 等級 × 2）
 * 事件：'cd-stage'（暫停或拖曳後；播放中進入新的一期時 paused = false）、'cd-done'（分裂完成）、'cd-batch'（第二部分每做一批）。
 * 判定互相錯開：例如任務 7 要 n ≥ 2、隱藏 h3 要 n = 1；任務 8 要關掉互換、隱藏 h6 要開著互換；任務 10、11、12 與隱藏 h2、h4、h7 的距離範圍不重疊。 */
(function () {
  'use strict';
  if (!window.LabMission) return;

  const near = function (a, b) { return Math.abs(a - b) < 0.01; };
  const paused = function (ev) { return ev.type === 'cd-stage' && ev.data.paused; };
  const done = function (ev) { return ev.type === 'cd-done'; };
  const batch = function (ev) { return ev.type === 'cd-batch' && ev.data.total > 0; };
  const holds = function (d) { return d.lo <= d.haldane && d.haldane <= d.hi; };

  LabMission.register('cell-division', [
    {
      id: 'cell-division-1', level: 1,
      title: { zh: '一分為二', en: 'One becomes two' },
      desc: { zh: '播放一次完整的有絲分裂，得到兩個子細胞。', en: 'Play a whole mitosis through to two daughter cells.' },
      check: function (ev) { return done(ev) && ev.data.mode === 'mitosis' && ev.data.ncell === 2; }
    },
    {
      id: 'cell-division-2', level: 2,
      title: { zh: '染色體變多了？', en: 'More chromosomes?' },
      desc: { zh: '讓有絲分裂停在後期，數數看：細胞裡的染色體（以著絲點計數）變成 4n 條。DNA 量有沒有跟著變多？', en: 'Pause mitosis in anaphase and count: the cell now holds 4n chromosomes (counted by centromeres). Did the DNA go up as well?' },
      check: function (ev) { const d = ev.data; return paused(ev) && d.mode === 'mitosis' && d.stage === 'ana' && d.cells[0].chrom === 4 * d.n; }
    },
    {
      id: 'cell-division-3', level: 2,
      title: { zh: '四個配子', en: 'Four gametes' },
      desc: { zh: '播放一次完整的減數分裂，得到四個配子。', en: 'Play a whole meiosis through to four gametes.' },
      check: function (ev) { return done(ev) && ev.data.mode === 'meiosis' && ev.data.ncell === 4; }
    },
    {
      id: 'cell-division-4', level: 3,
      title: { zh: '四分體與交叉', en: 'Bivalents and chiasmata' },
      desc: { zh: '開著互換、至少 2 對染色體，讓減數分裂停在中期 I：同源染色體兩兩配對，找找黃色的交叉。', en: 'With crossing over on and at least 2 pairs, pause meiosis in metaphase I: the homologues sit in pairs — look for the yellow chiasmata.' },
      check: function (ev) { const d = ev.data; return paused(ev) && d.mode === 'meiosis' && d.stage === 'meta1' && d.xo && d.n >= 2 && d.chiasmata >= 1; }
    },
    {
      id: 'cell-division-5', level: 4,
      title: { zh: '少了一半，卻還是 2C', en: 'Half the chromosomes, still 2C' },
      desc: { zh: '在正常的減數分裂裡，找出一個細胞只有 n 條染色體、DNA 卻還是 2C 的時刻，並在那裡暫停。', en: 'In a normal meiosis, find a moment when a cell has only n chromosomes but still 2C of DNA, and pause there.' },
      check: function (ev) {
        const d = ev.data;
        return paused(ev) && d.mode === 'meiosis' && d.nd === 0 && d.cells.some(function (c) { return c.chrom === d.n && near(c.dna, 2); });
      }
    },
    {
      id: 'cell-division-6', level: 4,
      title: { zh: '四種配子', en: 'All four kinds' },
      desc: { zh: '一次減數分裂就得到 AB、Ab、aB、ab 四種配子（看第 1 對染色體）。哪一步讓這件事發生？', en: 'Get AB, Ab, aB and ab gametes from a single meiosis (look at pair 1). Which step made it possible?' },
      check: function (ev) {
        const d = ev.data;
        return done(ev) && d.mode === 'meiosis' && d.nd === 0 && ['AB', 'Ab', 'aB', 'ab'].every(function (g) { return d.genos.indexOf(g) >= 0; });
      }
    },
    {
      id: 'cell-division-7', level: 5,
      title: { zh: '同源染色體沒有分開', en: 'The homologues stay together' },
      desc: { zh: '至少 2 對染色體，讓第 1 對在第一次分裂不分離，做出多一條染色體（n+1）的配子——多出來的兩條，一條來自母方、一條來自父方。', en: 'With at least 2 pairs, make pair 1 fail to separate in meiosis I and get an n+1 gamete — its two copies of pair 1 come one from the mother, one from the father.' },
      check: function (ev) { const d = ev.data; return done(ev) && d.mode === 'meiosis' && d.nd === 1 && d.n >= 2 && d.mixedDisomic; }
    },
    {
      id: 'cell-division-8', level: 5,
      title: { zh: '姊妹分體沒有分開', en: 'The sisters stay together' },
      desc: { zh: '關掉互換，讓第 1 對在第二次分裂不分離，做出 n+1 的配子——這次多出來的兩條一模一樣。另外三個配子呢？', en: 'With crossing over off, make pair 1 fail to separate in meiosis II and get an n+1 gamete — this time its two copies are identical. What about the other three gametes?' },
      check: function (ev) { const d = ev.data; return done(ev) && d.mode === 'meiosis' && d.nd === 2 && !d.xo && d.sameDisomic; }
    },
    {
      id: 'cell-division-9', level: 6,
      title: { zh: '2 的 n 次方', en: 'Two to the n' },
      desc: { zh: '在第二部分把染色體設為 7 對（2 的 7 次方 = 128 種來源組合），從頭開始一次做 100 次減數分裂，在 500 次以內集齊全部 128 種。', en: 'In part 2, set 7 pairs of chromosomes (2 to the 7th = 128 origin patterns), start from scratch and run meioses 100 at a time until all 128 have appeared within 500 meioses.' },
      check: function (ev) { const d = ev.data; return batch(ev) && d.n === 7 && d.distinct === d.possible && d.meioses <= 500; }
    },
    {
      id: 'cell-division-10', level: 7,
      title: { zh: '靠得很近的兩個基因', en: 'Two genes close together' },
      desc: { zh: '兩個基因相距 1–5 cM，量到的重組率 95% 信賴區間半寬小於 0.5 個百分點，而且包含 Haldane 的預測值。', en: 'With the genes 1–5 cM apart, measure the recombination frequency to a 95% half-width under 0.5 percentage points, with Haldane’s prediction inside the interval.' },
      check: function (ev) { const d = ev.data; return batch(ev) && d.d >= 1 && d.d <= 5 && d.half < 0.005 && holds(d); }
    },
    {
      id: 'cell-division-11', level: 8,
      title: { zh: '同一條，卻像兩條', en: 'One chromosome, behaving like two' },
      desc: { zh: '把兩個基因拉開到 100–150 cM，量到的重組率 95% 區間下限超過 40%、半寬小於 1.5 個百分點，而且包含 Haldane 的預測。', en: 'Move the genes 100–150 cM apart and measure a recombination frequency whose 95% interval starts above 40%, has a half-width under 1.5 percentage points and contains Haldane’s prediction.' },
      check: function (ev) { const d = ev.data; return batch(ev) && d.d >= 100 && d.d <= 150 && d.half < 0.015 && d.lo > 0.4 && holds(d); }
    },
    {
      id: 'cell-division-12', level: 10,
      title: { zh: '正好四分之一', en: 'Exactly a quarter' },
      desc: { zh: '調整兩個基因的距離，讓量到的重組率 95% 信賴區間完全落在 24%–26% 之間。距離該設多少？（r 不等於 d。）', en: 'Choose the distance between the genes so that the 95% interval of the measured recombination frequency lies entirely between 24% and 26%. What distance does it take? (r is not d.)' },
      check: function (ev) { const d = ev.data; return batch(ev) && d.lo >= 0.24 && d.hi <= 0.26; }
    },
    // ---------- 隱藏任務：只給隱晦的提示 ----------
    {
      id: 'cell-division-h1', level: 3, hidden: true,
      riddle: { zh: '影印機印到一半時，按下暫停。', en: 'Pause the copier halfway through the job.' },
      check: function (ev) { const d = ev.data; return paused(ev) && d.stage === 'S' && Math.abs(d.cells[0].dna - 3) < 0.1; }
    },
    {
      id: 'cell-division-h2', level: 4, hidden: true,
      riddle: { zh: '靠得太近的兩個人，兩千次離別也拆不散。', en: 'Two who stand too close cannot be parted, not in two thousand farewells.' },
      check: function (ev) { const d = ev.data; return batch(ev) && d.d === 0 && d.meioses >= 2000 && d.rec === 0; }
    },
    {
      id: 'cell-division-h3', level: 5, hidden: true,
      riddle: { zh: '有的旅人出發時，行囊空空。', en: 'Some travellers set out with empty bags.' },
      check: function (ev) { const d = ev.data; return done(ev) && d.mode === 'meiosis' && d.n === 1 && d.sizes.indexOf(0) >= 0; }
    },
    {
      id: 'cell-division-h4', level: 8, hidden: true,
      riddle: { zh: '走得再遠，也永遠走不到一半。', en: 'However far you walk, you never get halfway.' },
      check: function (ev) { const d = ev.data; return batch(ev) && d.d >= 180 && d.total >= 1000 && d.hi < 0.5; }
    },
    {
      id: 'cell-division-h5', level: 7, hidden: true,
      riddle: { zh: '數字回到了起點，身分卻已經減半。', en: 'The numbers are back where they started, yet it is only half of what it was.' },
      check: function (ev) {
        const d = ev.data;
        return paused(ev) && d.mode === 'meiosis' && d.nd === 0 && d.stage === 'ana2' && d.ncell === 2 && d.cells.every(function (c) { return c.chrom === 2 * d.n && near(c.dna, 2); });
      }
    },
    {
      id: 'cell-division-h6', level: 6, hidden: true,
      riddle: { zh: '本該一模一樣的雙胞胎擠進同一個房間，卻長得不一樣。', en: 'Twins that should be identical squeeze into one room — and turn out to differ.' },
      check: function (ev) { const d = ev.data; return done(ev) && d.mode === 'meiosis' && d.nd === 2 && d.xo && d.diffDisomic; }
    },
    {
      id: 'cell-division-h7', level: 8, hidden: true,
      riddle: { zh: '近看是一條直線；再看仔細一點，它其實在彎。', en: 'Up close it looks straight; look more carefully and it bends.' },
      check: function (ev) { const d = ev.data; return batch(ev) && d.d >= 6 && d.d <= 15 && d.meioses >= 3000 && d.hi < d.d / 100 && holds(d); }
    },
    {
      id: 'cell-division-h8', level: 7, hidden: true,
      riddle: { zh: '四個家族排好隊，所有的母親都站在同一邊。', en: 'Four families line up, and every mother stands on the same side.' },
      check: function (ev) { const d = ev.data; return paused(ev) && d.mode === 'meiosis' && d.stage === 'meta1' && !d.xo && d.n === 4 && d.sameSide; }
    },
    {
      id: 'cell-division-h9', level: 9, hidden: true,
      riddle: { zh: '最大的一套卡片，你只拆了很少的包就集齊。', en: 'The biggest set of all, completed after opening very few packs.' },
      check: function (ev) { const d = ev.data; return batch(ev) && d.n === 8 && d.distinct === d.possible && d.meioses <= 600; }
    },
    {
      id: 'cell-division-h10', level: 10, hidden: true,
      riddle: { zh: '四個孩子，沒有一個像爸爸，也沒有一個像媽媽。', en: 'Four children, and not one takes after the father or the mother.' },
      check: function (ev) { const d = ev.data; return done(ev) && d.mode === 'meiosis' && d.nd === 0 && d.allRecomb; }
    }
  ]);
})();
