/* missions/oxygen-hemoglobin.js — 氧氣與血紅素的任務（星星數 = 等級 1–10；隱藏任務 = 等級 × 2）
 * 事件（js/oxygen-hemoglobin.js 送出）：
 *   'oxy'：第一部分任何設定或探針改變（停 0.15 秒後送一次）。type（A／F／Mb）、alt、PaCO2、HCO3、T、BPG、Hb、ppm、D（每 100 mL 血交出的氧）、
 *          probe（探針 PO2）、Sp（探針處的 O2 飽和度）、pH、PAO2、Pa、Sa、Pv、Sv、Ca、Ca0（沒有 CO 時的含氧量）、deficit、P50、n、
 *          std（曲線是標準條件：pH 7.40 ± 0.02、PaCO2 40 ± 1、37 °C、2,3-BPG 5、沒有 CO）、key（影響曲線的條件，用來比較同一條件下的兩種蛋白質）
 *   'mwc'：第二部分改 L 或 c（停 0.2 秒後送一次）。L、c、P50、n（理論）
 *   'mwc-meas'：量完一次。L、c、P、Y（量到）、Yth（理論）、pts（這組 L、c 量過幾點）、fitPts（飽和度 10%–90% 的點數）、slope（Hill 擬合斜率或 null）、nTh、P50
 */
(function () {
  'use strict';
  if (!window.LabMission) return;

  function oxy(ev) { return ev.type === 'oxy' ? ev.data : null; }
  /** 身體撐得住的酸鹼範圍 */
  function okPH(d) { return d.pH >= 7.0 && d.pH <= 7.8; }

  LabMission.register('oxygen-hemoglobin', [
    {
      id: 'oxygen-hemoglobin-1', level: 1,
      title: { zh: '半滿的那一點', en: 'Half full' },
      desc: { zh: '在標準狀態下（成人血紅素），把探針移到飽和度剛好 50%（誤差 1% 以內）的位置。', en: 'Under standard conditions (adult haemoglobin), move the probe to where the saturation is exactly 50% (within 1%).' },
      check: function (ev) { const d = oxy(ev); return !!d && d.type === 'A' && d.std && Math.abs(d.Sp - 0.5) <= 0.01; }
    },
    {
      id: 'oxygen-hemoglobin-2', level: 2,
      title: { zh: '肌肉裡的倉庫', en: 'The store in the muscle' },
      desc: { zh: '換成肌紅素，用探針找出它飽和度 50%（誤差 1% 以內）的氧分壓。可以點數字直接輸入。', en: 'Switch to myoglobin and use the probe to find the oxygen pressure at which it is 50% saturated (within 1%). You can type the number directly.' },
      check: function (ev) { const d = oxy(ev); return !!d && d.type === 'Mb' && d.ppm === 0 && Math.abs(d.Sp - 0.5) <= 0.01; }
    },
    {
      id: 'oxygen-hemoglobin-3', level: 2,
      title: { zh: '往右推', en: 'Push it right' },
      desc: { zh: '體溫維持 37 °C、2,3-BPG 維持 5 mM，只靠改變血液的酸鹼，讓成人血紅素的 P50 到 32 mmHg 以上。', en: 'Keeping the temperature at 37 °C and 2,3-BPG at 5 mM, change only the acidity of the blood until the P50 of adult haemoglobin reaches 32 mmHg or more.' },
      check: function (ev) {
        const d = oxy(ev);
        return !!d && d.type === 'A' && d.ppm === 0 && Math.abs(d.T - 37) <= 0.05 && Math.abs(d.BPG - 5) <= 0.05 && d.P50 >= 32;
      }
    },
    {
      id: 'oxygen-hemoglobin-4', level: 3,
      title: { zh: '胎兒的搶氧術', en: 'How a fetus takes oxygen' },
      desc: { zh: '條件不變、探針放在 20–40 mmHg 之間的同一個位置，先後看成人和胎兒血紅素：胎兒的飽和度比成人多 20 個百分點以上。', en: 'With the same conditions and the probe at the same place between 20 and 40 mmHg, look at adult and then fetal haemoglobin (either order): the fetal saturation is at least 20 percentage points higher.' },
      check: function (ev, mem) {
        const d = oxy(ev);
        if (!d || d.probe < 20 || d.probe > 40) return false;
        if (d.type !== 'A' && d.type !== 'F') return false;
        const k = d.key + '|' + d.probe;
        mem[d.type] = { k: k, S: d.Sp };
        const a = mem.A, f = mem.F;
        return !!(a && f && a.k === f.k && f.S - a.S >= 0.2);
      }
    },
    {
      id: 'oxygen-hemoglobin-5', level: 3,
      title: { zh: '沉默的殺手', en: 'The silent killer' },
      desc: { zh: '吸到一氧化碳：動脈血的氧分壓還在 90 mmHg 以上，含氧量卻只剩沒有 CO 時的 75% 以下。', en: 'Breathe carbon monoxide: the arterial oxygen pressure is still 90 mmHg or more, but the oxygen content has fallen to 75% or less of what it would be without CO.' },
      check: function (ev) { const d = oxy(ev); return !!d && d.type === 'A' && d.ppm > 0 && d.Pa >= 90 && d.Ca0 > 0 && d.Ca / d.Ca0 <= 0.75; }
    },
    {
      id: 'oxygen-hemoglobin-6', level: 4,
      title: { zh: '高原上的深呼吸', en: 'Deep breaths on the plateau' },
      desc: { zh: '在 5000 m 以上的高度，讓成人血紅素的動脈血飽和度回到 85% 以上（血液 pH 要在 7.0–7.8 之間，不能有 CO）。', en: 'At 5000 m or higher, bring the arterial saturation of adult haemoglobin back to 85% or more (blood pH between 7.0 and 7.8, no CO).' },
      check: function (ev) { const d = oxy(ev); return !!d && d.type === 'A' && d.ppm === 0 && d.alt >= 5000 && d.Sa >= 0.85 && okPH(d); }
    },
    {
      id: 'oxygen-hemoglobin-7', level: 5,
      title: { zh: '最後一公里', en: 'The last kilometre' },
      desc: { zh: '在海拔 500 m 以下，每 100 mL 血要交出 15 mL 以上的氧，靜脈血的氧分壓還能維持在 20 mmHg 以上（成人血紅素、血紅素濃度在正常範圍 17 g/dL 以下、pH 7.0–7.8、沒有 CO）。', en: 'Below 500 m, make each 100 mL of blood hand over at least 15 mL of oxygen while the venous oxygen pressure stays at 20 mmHg or more (adult haemoglobin at a normal concentration of 17 g/dL or less, pH 7.0–7.8, no CO).' },
      check: function (ev) { const d = oxy(ev); return !!d && d.type === 'A' && d.ppm === 0 && d.alt <= 500 && d.Hb <= 17 && d.D >= 15 && !d.deficit && d.Pv >= 20 && okPH(d); }
    },
    {
      id: 'oxygen-hemoglobin-8', level: 7,
      title: { zh: '世界之巔的一口氣', en: 'A breath on the roof of the world' },
      desc: { zh: '在 8800 m 以上，讓成人血紅素的動脈血飽和度到 80% 以上，而且血液 pH 不超過 7.8（不能有 CO）。', en: 'Above 8800 m, get the arterial saturation of adult haemoglobin to 80% or more while the blood pH stays at 7.8 or below (no CO).' },
      check: function (ev) { const d = oxy(ev); return !!d && d.type === 'A' && d.ppm === 0 && d.alt >= 8800 && d.Sa >= 0.8 && okPH(d); }
    },
    {
      id: 'oxygen-hemoglobin-9', level: 7,
      title: { zh: '量出合作的程度', en: 'Measure the teamwork' },
      desc: { zh: '在第二部分，對同一組 L、c（理論 n 至少 2）量至少 5 個飽和度在 10%–90% 之間的點，Hill 圖的擬合斜率和理論 n 相差 10% 以內。', en: 'In part 2, for one setting of L and c (theoretical n at least 2), measure at least 5 points with saturation between 10% and 90%; the fitted Hill-plot slope is within 10% of the theoretical n.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'mwc-meas' && d.nTh >= 2 && d.fitPts >= 5 && d.slope != null && Math.abs(d.slope - d.nTh) / d.nTh <= 0.1;
      }
    },
    {
      id: 'oxygen-hemoglobin-10', level: 4,
      title: { zh: '各做各的', en: 'Every subunit for itself' },
      desc: { zh: '在第二部分調 L 或 c，讓四個亞基完全不合作（理論 n 不超過 1.05），並在這個設定下量至少 3 個點。', en: 'In part 2, adjust L or c so that the four subunits do not cooperate at all (theoretical n at most 1.05), and measure at least 3 points with that setting.' },
      check: function (ev) { const d = ev.data; return ev.type === 'mwc-meas' && d.nTh <= 1.05 && d.pts >= 3; }
    },
    {
      id: 'oxygen-hemoglobin-11', level: 8,
      title: { zh: '超級血紅素', en: 'Super haemoglobin' },
      desc: { zh: '設計一種分子：P50 和真正的血紅素一樣（26.9 ± 0.5 mmHg），但 Hill 係數 n 到 3.4 以上——比血紅素更會合作。', en: 'Design a molecule with the same P50 as real haemoglobin (26.9 ± 0.5 mmHg) but a Hill coefficient of 3.4 or more — even better teamwork than haemoglobin.' },
      check: function (ev) { const d = ev.data; return ev.type === 'mwc' && Math.abs(d.P50 - 26.9) <= 0.5 && d.n >= 3.4; }
    },
    {
      id: 'oxygen-hemoglobin-12', level: 10,
      title: { zh: '在峰頂走路', en: 'Walking on the summit' },
      desc: { zh: '在 8800 m 以上，每 100 mL 血交出 10 mL 以上的氧（大約是慢慢走路），靜脈血的氧分壓還能維持在 20 mmHg 以上（成人血紅素、pH 7.0–7.8、沒有 CO）。', en: 'Above 8800 m, make each 100 mL of blood hand over at least 10 mL of oxygen (about a slow walk) while the venous oxygen pressure stays at 20 mmHg or more (adult haemoglobin, pH 7.0–7.8, no CO).' },
      check: function (ev) { const d = oxy(ev); return !!d && d.type === 'A' && d.ppm === 0 && d.alt >= 8800 && d.D >= 10 && !d.deficit && d.Pv >= 20 && okPH(d); }
    },
    {
      id: 'oxygen-hemoglobin-h1', level: 3, hidden: true,
      riddle: { zh: '天空很近，風裡卻什麼都沒有。', en: 'The sky is close, yet the wind brings nothing.' },
      check: function (ev) { const d = oxy(ev); return !!d && d.PAO2 <= 0; }
    },
    {
      id: 'oxygen-hemoglobin-h2', level: 4, hidden: true,
      riddle: { zh: '還沒出生，就住在高山上。', en: 'Living on a mountain before being born.' },
      check: function (ev) { const d = oxy(ev); return !!d && d.type === 'F' && d.ppm === 0 && d.Pa > 0 && d.Pa <= 35 && d.Sa >= 0.8; }
    },
    {
      id: 'oxygen-hemoglobin-h3', level: 4, hidden: true,
      riddle: { zh: '在冷冷的地方等了幾個星期，就捨不得放手了。', en: 'After weeks of waiting in the cold, it no longer wants to let go.' },
      check: function (ev) { const d = oxy(ev); return !!d && d.type === 'A' && d.ppm === 0 && d.BPG <= 0.5 && d.P50 <= 18; }
    }
  ]);
})();
