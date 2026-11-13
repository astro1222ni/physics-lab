/* missions/radioactive-decay.js — 放射性衰變與半衰期的任務（星星數 = 等級 1–10） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  const rel = function (a, b) { return Math.abs(a / b - 1); };

  LabMission.register('radioactive-decay', [
    {
      id: 'radioactive-decay-1', level: 1,
      title: { zh: '第一個半衰期', en: 'The first half-life' },
      desc: { zh: '開始一次原子核衰變實驗，讓它跑完一個半衰期。', en: 'Run a decay experiment with nuclei for one full half-life.' },
      check: function (ev) { return ev.type === 'mark' && ev.data.mode === 'nuclei' && ev.data.k >= 1; }
    },
    {
      id: 'radioactive-decay-2', level: 2,
      title: { zh: '骰子也有半衰期', en: 'Dice have a half-life too' },
      desc: { zh: '在骰子比喻中用至少 400 顆骰子，擲到桌上剩下不到一半為止。看看擲了幾次？', en: 'In the dice analogy, roll at least 400 dice until fewer than half are left on the table. How many rolls did it take?' },
      check: function (ev) { const d = ev.data; return ev.type === 'roll' && d.N0 >= 400 && d.N * 2 <= d.N0; }
    },
    {
      id: 'radioactive-decay-3', level: 2,
      title: { zh: '大數法則', en: 'The law of large numbers' },
      desc: { zh: '用 10000 個原子核做實驗：剛好經過一個半衰期時，剩下的數量與 5000 相差不超過 75 個。', en: 'With 10000 nuclei: at exactly one half-life, have no more than 75 nuclei away from 5000 left.' },
      check: function (ev) { const d = ev.data; return ev.type === 'mark' && d.mode === 'nuclei' && d.k === 1 && d.N0 === 10000 && Math.abs(d.N - 5000) <= 75; }
    },
    {
      id: 'radioactive-decay-4', level: 3,
      title: { zh: '對數座標上的直線', en: 'A straight line on a log scale' },
      desc: { zh: '打開對數座標，讓原子核衰變實驗跑滿 4 個半衰期，看看曲線變成什麼形狀。', en: 'Turn on the log scale and let a decay experiment with nuclei run for 4 half-lives. What shape does the curve take?' },
      check: function (ev) { const d = ev.data; return ev.type === 'mark' && d.mode === 'nuclei' && d.k >= 4 && d.log; }
    },
    {
      id: 'radioactive-decay-5', level: 3,
      title: { zh: '一次不算數', en: 'Once is not enough' },
      desc: { zh: '用 100 個原子核重複實驗：在圖上疊出至少 5 條、每條都跑超過一個半衰期的曲線（按「新的一輪」保留舊曲線）。', en: 'Repeat the experiment with 100 nuclei: stack at least 5 curves on the graph, each run for more than one half-life (press “New run” to keep the old curve).' },
      check: function (ev) {
        if (ev.type !== 'archive') return false;
        return ev.data.runs.filter(function (r) { return r.N0 === 100 && r.kind === 'half' && r.span >= 1; }).length >= 5;
      }
    },
    {
      id: 'radioactive-decay-6', level: 4,
      title: { zh: '碘-131 剩下八分之一', en: 'One-eighth of the iodine-131' },
      desc: { zh: '選碘-131，在理論上剛好剩下 1/8 的時刻按暫停（時間誤差 ±0.3 天）。', en: 'Choose iodine-131 and pause at the moment when, in theory, exactly 1/8 is left (within ±0.3 days).' },
      check: function (ev) { const d = ev.data; return ev.type === 'pause' && d.preset === 'i131' && Math.abs(d.t - 3 * 8.02) <= 0.3; }
    },
    {
      id: 'radioactive-decay-7', level: 5,
      title: { zh: '碳十四定年', en: 'Radiocarbon dating' },
      desc: { zh: '選碳-14，用至少 1600 個原子核，在實際剩下 25.0%（±0.5%）的時刻按暫停。這塊樣本有幾歲？', en: 'Choose carbon-14 with at least 1600 nuclei and pause when the measured amount left is 25.0% (±0.5%). How old is the sample?' },
      check: function (ev) { const d = ev.data; return ev.type === 'pause' && d.preset === 'c14' && d.N0 >= 1600 && Math.abs(d.N / d.N0 - 0.25) <= 0.005; }
    },
    {
      id: 'radioactive-decay-8', level: 6,
      title: { zh: '一個平均壽命', en: 'One mean life' },
      desc: { zh: '用至少 1600 個原子核（不含衰變鏈），在經過一個平均壽命 τ 的時刻按暫停（誤差 1% 以內）。剩下的比例接近多少？', en: 'With at least 1600 nuclei (no decay chain), pause after exactly one mean life τ (within 1%). What fraction is left?' },
      check: function (ev) { const d = ev.data; return ev.type === 'pause' && d.mode === 'nuclei' && !d.chain && !d.mystery && d.N0 >= 1600 && rel(d.t, d.tau) <= 0.01; }
    },
    {
      id: 'radioactive-decay-9', level: 7,
      title: { zh: '子核的高峰', en: 'The daughter’s peak' },
      desc: { zh: '開啟衰變鏈，在子核數量（理論值）達到最大的時刻按暫停（時間誤差 5% 以內）。', en: 'With a decay chain, pause at the moment when the number of daughter nuclei (in theory) is greatest (within 5% in time).' },
      check: function (ev) { const d = ev.data; return ev.type === 'pause' && d.chain && rel(d.t, d.tmax) <= 0.05; }
    },
    {
      id: 'radioactive-decay-10', level: 8,
      title: { zh: '暫態平衡', en: 'Transient equilibrium' },
      desc: { zh: '衰變鏈中讓子核比母核短命，用至少 1600 個原子核，等子核過了高峰（至少 2 倍的高峰時刻）後，在實測的子核／母核比例與平衡值相差 3% 以內時按暫停。', en: 'In a decay chain with a shorter-lived daughter and at least 1600 nuclei, wait until well after the daughter’s peak (at least twice the peak time), then pause when the measured daughter/parent ratio is within 3% of its equilibrium value.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'pause' && d.chain && d.eqRatio != null && d.N0 >= 1600 && d.t >= 2 * d.tmax && d.ratioDP != null && rel(d.ratioDP, d.eqRatio) <= 0.03;
      }
    },
    {
      id: 'radioactive-decay-11', level: 9,
      title: { zh: '鉬-99 發生器', en: 'The molybdenum-99 generator' },
      desc: { zh: '選鉬-99 → 鎝-99m，自己算出鎝-99m 最多的時刻，並在那一刻按暫停（時間誤差 1% 以內）。', en: 'Choose Mo-99 → Tc-99m, work out when the amount of technetium-99m is greatest, and pause at that moment (within 1%).' },
      check: function (ev) { const d = ev.data; return ev.type === 'pause' && d.preset === 'mo99' && rel(d.t, d.tmax) <= 0.01; }
    },
    {
      id: 'radioactive-decay-12', level: 10,
      title: { zh: '大師：神秘核種', en: 'Master: the mystery nuclide' },
      desc: { zh: '選「神秘核種」，至少觀察一個半衰期後，第一次提交的半衰期答案誤差就在 1.5% 以內。', en: 'Choose the mystery nuclide, watch it for at least one half-life, and get its half-life within 1.5% on your first answer.' },
      check: function (ev) { const d = ev.data; return ev.type === 'guess' && d.first && d.span >= 1 && Math.abs(d.err) <= 0.015; }
    },
    // ---------- 隱藏任務：只給隱晦的提示 ----------
    {
      id: 'radioactive-decay-h1', level: 5, hidden: true,
      riddle: { zh: '百燈齊明，終有一盞，守過了漫長的夜。', en: 'A hundred lamps were lit; one kept watch through the longest night.' },
      check: function (ev) { const d = ev.data; return ev.type === 'end' && d.mode === 'nuclei' && !d.chain && d.N0 === 100 && d.t / d.half > 10; }
    },
    {
      id: 'radioactive-decay-h2', level: 6, hidden: true,
      riddle: { zh: '滿桌喧嘩，命運卻在這一刻屏住了呼吸。', en: 'The table rattles, and for one moment fate holds its breath.' },
      check: function (ev) { const d = ev.data; return ev.type === 'roll' && d.before >= 20 && d.decayed === 0; /* 11/12 由 12 收緊到 20：(5/6)^12 ≈ 11%、每輪約 20% 太容易誤觸；(5/6)^20 ≈ 2.6%、每輪約 3% */ }
    },
    {
      id: 'radioactive-decay-h3', level: 8, hidden: true,
      riddle: { zh: '兩代同壽，候他登峰。', en: 'Two generations, one lifespan — wait for the climb to crest.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'pause' && d.chain && d.half2 != null && Math.abs(d.half - d.half2) < 1e-9 && rel(d.t, d.tmax) <= 0.03;
      }
    }
  ]);
})();
