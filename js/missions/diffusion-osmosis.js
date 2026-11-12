/* missions/diffusion-osmosis.js — 擴散與滲透的任務（星星數 = 等級 1–10）
 * 事件（js/diffusion-osmosis.js 的 missionData）：
 *   'diff'：擴散盒（partition、fracR、complete、mixed、fitErr、allSeen、runs[{T, r, D, Dfit, complete, mixed}] …）
 *   'osmo'：U 形管（CL0、CR0、osmL0、osmR0、iL、iR、P kPa、h cm、rate cm/分、eq、t 分 …）
 *   'cell'：細胞與溶液（osm、rbcV fL、rbcLysed、rbcEq、plantV、turgor kPa、plantEq …）
 * 每個任務都用 tools/mission-proofs/diffusion-osmosis.js 以物理核心證明做得到。 */
(function () {
  'use strict';
  if (!window.LabMission) return;

  const isDiff = function (ev) { return ev.type === 'diff' && ev.data && !ev.data.partition; };
  const isOsmo = function (ev) { return ev.type === 'osmo' && ev.data; };
  const isCell = function (ev) { return ev.type === 'cell' && ev.data; };
  const noPiston = function (d) { return d.P < 0.0005; };
  /** 完成且途中沒改設定的擴散紀錄（含目前這一次） */
  const goodRuns = function (d) { return (d.runs || []).filter(function (r) { return r.complete && !r.mixed && isFinite(r.Dfit) && r.Dfit > 0; }); };
  const anyPair = function (runs, fn) {
    for (let i = 0; i < runs.length; i++) for (let j = 0; j < runs.length; j++) if (i !== j && fn(runs[i], runs[j])) return true;
    return false;
  };

  LabMission.register('diffusion-osmosis', [
    {
      id: 'diffusion-osmosis-1', level: 1,
      title: { zh: '拿掉隔板', en: 'Lift the partition' },
      desc: { zh: '擴散：按「移除隔板」，等到右半邊的粒子至少佔全部的 30%。沒有誰推它們——每個粒子都只是亂走。',
        en: 'Diffusion: press “Remove the partition” and wait until at least 30% of the particles are in the right half. Nothing pushes them — each one just wanders at random.' },
      check: function (ev) { return isDiff(ev) && ev.data.fracR >= 0.30; }
    },
    {
      id: 'diffusion-osmosis-2', level: 2,
      title: { zh: '水往濃的地方跑', en: 'Water heads for the stronger side' },
      desc: { zh: '滲透：不加活塞壓力（P = 0），讓左管的液面比右管高出至少 10 cm。要讓哪一邊比較濃？',
        en: 'Osmosis: with no piston pressure (P = 0), make the left level at least 10 cm higher than the right. Which side has to be more concentrated?' },
      check: function (ev) { const d = ev.data; return isOsmo(ev) && noPiston(d) && d.h <= -10; }
    },
    {
      id: 'diffusion-osmosis-3', level: 3,
      title: { zh: '皺縮與質壁分離', en: 'Crenation and plasmolysis' },
      desc: { zh: '細胞與溶液：找一種外液，讓兩個細胞都達到平衡時，紅血球皺縮到 60–70 fL（沒有破），植物細胞的原生質體縮到細胞壁內容積的 85% 以下。',
        en: 'Cells: find one solution in which, once both cells settle, the red cell has shrunk to 60–70 fL (unburst) and the plant protoplast fills no more than 85% of the space inside its wall.' },
      check: function (ev) {
        const d = ev.data;
        return isCell(ev) && d.rbcEq && !d.rbcLysed && d.rbcV >= 60 && d.rbcV <= 70 && d.plantEq && d.plantV <= 0.85;
      }
    },
    {
      id: 'diffusion-osmosis-4', level: 4,
      title: { zh: '均方位移是一條直線', en: 'The mean square displacement is a straight line' },
      desc: { zh: '擴散：先把粒子半徑調到 1 nm 以上（大一點的分子），移除隔板後不改設定，等理論的 2Dt 超過 2000 μm²，讓「由斜率得到的 D」與理論相差不到 5%。',
        en: 'Diffusion: first set the particle radius to 1 nm or more (a bigger molecule), remove the partition and change nothing until the theory 2Dt passes 2000 μm², with “D from the slope” within 5% of the theory.' },
      check: function (ev) { const d = ev.data; return isDiff(ev) && d.r >= 1 && d.complete && !d.mixed && Math.abs(d.fitErr) <= 0.05; }
    },
    {
      id: 'diffusion-osmosis-5', level: 4,
      title: { zh: '液柱撐住滲透壓', en: 'A column that balances osmotic pressure' },
      desc: { zh: '滲透：左管放純水、右管溶質選「食鹽 NaCl（i = 2）」，不加活塞壓力，等液面差至少 20 cm 並達到平衡。這時液柱壓力 ρgh 等於多少？',
        en: 'Osmosis: pure water on the left, “Salt, NaCl (i = 2)” on the right, no piston pressure. Wait for a level difference of at least 20 cm at equilibrium. What does the column pressure ρgh equal now?' },
      check: function (ev) {
        const d = ev.data;
        return isOsmo(ev) && d.solR === 'nacl' && d.CL0 === 0 && d.CR0 > 0 && noPiston(d) && d.eq && d.h >= 20 &&
          d.dpi > 0 && Math.abs(d.rhogh - d.dpi) / d.dpi <= 0.01;
      }
    },
    {
      id: 'diffusion-osmosis-6', level: 5,
      title: { zh: '熱的跑得快', en: 'Warm particles roam faster' },
      desc: { zh: '擴散：用同一個粒子半徑做兩次完整的擴散（每次都等 2Dt 超過 2000 μm²，途中不改設定，做完按「放回隔板」再做下一次），讓較熱那次量到的 D 至少是較冷那次的 2 倍。',
        en: 'Diffusion: with the same particle radius, do two complete runs (each until 2Dt passes 2000 μm², no changes in between; press “Put the partition back” before the next), so that the warmer run’s measured D is at least twice the colder one’s.' },
      check: function (ev) {
        if (!isDiff(ev)) return false;
        return anyPair(goodRuns(ev.data), function (a, b) {
          return Math.abs(a.r / b.r - 1) <= 0.01 && a.T > b.T && a.Dfit >= 2 * b.Dfit;
        });
      }
    },
    {
      id: 'diffusion-osmosis-7', level: 5,
      title: { zh: '逆滲透', en: 'Reverse osmosis' },
      desc: { zh: '滲透：右管比左管濃，卻用活塞把右管的水壓過半透膜，讓右管液面比左管低至少 5 cm。海水淡化就是這樣做的。',
        en: 'Osmosis: keep the right side more concentrated, yet push its water back through the membrane with the piston until the right level is at least 5 cm below the left. Desalination plants work this way.' },
      check: function (ev) { const d = ev.data; return isOsmo(ev) && d.osmR0 > d.osmL0 && d.P > 0 && d.h <= -5; }
    },
    {
      id: 'diffusion-osmosis-8', level: 6,
      title: { zh: '剛好擋住水', en: 'Just enough to stop the water' },
      desc: { zh: '滲透：右管比左管濃，調活塞壓力（至少 1 kPa），讓兩管液面一直保持一樣高（相差不到 0.5 cm）並達到平衡。這個壓力就是兩邊的滲透壓差。提示：水一流過去，右管就被稀釋、Δπ 跟著變小，所以要先設好活塞，再按「液面歸零」。',
        en: 'Osmosis: with the right side more concentrated, set a piston pressure of at least 1 kPa so the two levels stay equal (within 0.5 cm) at equilibrium. That pressure is the osmotic pressure difference. Hint: once water starts to flow the right side is diluted and Δπ shrinks, so set the piston first, then press “Level the liquids”.' },
      check: function (ev) { const d = ev.data; return isOsmo(ev) && d.osmR0 > d.osmL0 && d.P >= 1 && d.eq && Math.abs(d.h) < 0.5; }
    },
    {
      id: 'diffusion-osmosis-9', level: 6,
      title: { zh: '初始質壁分離', en: 'Incipient plasmolysis' },
      desc: { zh: '細胞與溶液：找到植物細胞的原生質體剛好貼著細胞壁、膨壓幾乎為零（不超過 30 kPa）的外液濃度，並等它達到平衡（原生質體在細胞壁內容積的 99%–101%）。',
        en: 'Cells: find the solution in which the plant protoplast just touches its wall with almost no turgor (30 kPa or less), and let it settle (protoplast at 99%–101% of the space inside the wall).' },
      check: function (ev) {
        const d = ev.data;
        return isCell(ev) && d.plantEq && Math.abs(d.plantV - 1) <= 0.01 && d.turgor <= 30;
      }
    },
    {
      id: 'diffusion-osmosis-10', level: 7,
      title: { zh: '溶血的邊緣', en: 'On the edge of bursting' },
      desc: { zh: '細胞與溶液：讓紅血球在低張溶液中脹到至少 140 fL 並達到平衡，卻沒有破裂。破了就按「換新細胞」重來。',
        en: 'Cells: let the red cell swell to at least 140 fL in a hypotonic solution and settle there without bursting. If it bursts, press “Fresh cells” and try again.' },
      check: function (ev) { const d = ev.data; return isCell(ev) && d.rbcEq && !d.rbcLysed && d.rbcV >= 140; }
    },
    {
      id: 'diffusion-osmosis-11', level: 8,
      title: { zh: '大的走得慢', en: 'Big ones are slow' },
      desc: { zh: '擴散：在同一個溫度下做兩次完整的擴散，粒子半徑至少差 4 倍，讓量到的兩個 D 之比與半徑的反比相差不到 12%（斯托克斯–愛因斯坦關係：D 與 r 成反比）。',
        en: 'Diffusion: at the same temperature, do two complete runs whose particle radii differ at least fourfold, so that the ratio of the two measured D values matches the inverse ratio of the radii within 12% (Stokes–Einstein: D is inversely proportional to r).' },
      check: function (ev) {
        if (!isDiff(ev)) return false;
        return anyPair(goodRuns(ev.data), function (a, b) {
          if (Math.abs(a.T - b.T) > 0.5 || b.r < 4 * a.r) return false;   // a 是小粒子
          const k = (a.Dfit / b.Dfit) / (b.r / a.r);
          return k >= 0.88 && k <= 1.12;
        });
      }
    },
    {
      id: 'diffusion-osmosis-12', level: 10,
      title: { zh: '精準的滲透計', en: 'A precise osmometer' },
      desc: { zh: '滲透：左管放純水、不加活塞壓力，關掉「平衡預測」自己算，選好右管的溶質、濃度與溫度，讓平衡時的液面差落在 50.0–50.5 cm。記得水流過去會把右管稀釋。（打開預測時看過的設定不算。）',
        en: 'Osmosis: pure water on the left and no piston pressure. Turn the equilibrium prediction off and work it out yourself: choose the right-hand solute, concentration and temperature so the equilibrium level difference lands between 50.0 and 50.5 cm. Remember that the inflow dilutes the right side. (Settings you viewed with the prediction on do not count.)' },
      check: function (ev) { const d = ev.data; return isOsmo(ev) && d.CL0 === 0 && d.CR0 > 0 && noPiston(d) && d.eq && !d.peek && d.h >= 50 && d.h <= 50.5; }
    },
    // ---------- 隱藏任務：只給隱晦的提示 ----------
    {
      id: 'diffusion-osmosis-h1', level: 3, hidden: true,
      riddle: { zh: '牆，是溫柔的。', en: 'A wall can be a kindness.' },
      check: function (ev) { const d = ev.data; return isCell(ev) && d.rbcLysed && d.plantEq && d.turgor >= 600; }
    },
    {
      id: 'diffusion-osmosis-h2', level: 4, hidden: true,
      riddle: { zh: '沒有誰永遠只待在故鄉。', en: 'No one stays in their hometown forever.' },
      check: function (ev) { return isDiff(ev) && ev.data.allSeen; }
    },
    {
      id: 'diffusion-osmosis-h3', level: 6, hidden: true,
      riddle: { zh: '勢均力敵的陌生人。', en: 'Two strangers, evenly matched.' },
      check: function (ev) {
        const d = ev.data;
        return isOsmo(ev) && d.iL !== d.iR && d.CL0 > 0 && d.CR0 > 0 && noPiston(d) && d.t >= 10 && Math.abs(d.h) < 0.3 && Math.abs(d.rate) < 0.005;
      }
    }
  ]);
})();
