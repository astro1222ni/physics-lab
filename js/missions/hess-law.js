/* missions/hess-law.js — 反應熱與赫斯定律的任務（星星數 = 等級 1–10；隱藏任務 = 等級 × 2） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  // 事件（js/hess-law.js 只在使用者操作之後回報）：
  //   'tick'：每 0.5 秒 { mode, kind, liquid, added, recording, T0, reading, dT, Troom, peak, t, tAdd }
  //   'analyze'：按「計算 ΔH」{ kind（'dis-NaOH'／'dis-NH4NO3'／'dis-X'／'r3'／'neut'／'other'）, method, dH, ref, err, lid, stir, excess, revealed,
  //              dTraw, dText, C, n, hess: { h1, h2, h3, e1, e2, e3 } }
  //   'calib'：卡計校正 { C, err（J/K）, method }
  const tk = function (ev) { return ev.type === 'tick' && ev.data ? ev.data : null; };
  const an = function (ev) { return ev.type === 'analyze' && ev.data ? ev.data : null; };
  const within = function (e, tol) { return e != null && isFinite(e) && Math.abs(e) <= tol; };

  LabMission.register('hess-law', [
    {
      id: 'hess-law-1', level: 1,
      title: { zh: '溶解會發熱', en: 'Dissolving gets hot' },
      desc: { zh: '把氫氧化鈉固體加進水裡，讓溫度上升 3.0 °C 以上。', en: 'Add solid sodium hydroxide to water and make the temperature rise by 3.0 °C or more.' },
      check: function (ev) { const d = tk(ev); return !!d && d.mode === 'solid' && d.kind === 'NaOH' && d.liquid === 'water' && d.added && d.dT >= 3.0; }
    },
    {
      id: 'hess-law-2', level: 2,
      title: { zh: '瞬間冷敷包', en: 'Instant cold pack' },
      desc: { zh: '把硝酸銨加進水裡，讓溫度下降 2.0 °C 以上。', en: 'Add ammonium nitrate to water and make the temperature fall by 2.0 °C or more.' },
      check: function (ev) { const d = tk(ev); return !!d && d.mode === 'solid' && d.kind === 'NH4NO3' && d.liquid === 'water' && d.added && d.dT <= -2.0; }
    },
    {
      id: 'hess-law-3', level: 3,
      title: { zh: '酸鹼中和', en: 'Neutralisation' },
      desc: { zh: '把鹽酸倒進氫氧化鈉溶液，讓溫度上升 5.0 °C 以上。', en: 'Pour hydrochloric acid into sodium hydroxide solution and make the temperature rise by 5.0 °C or more.' },
      check: function (ev) { const d = tk(ev); return !!d && d.mode === 'mix' && d.added && d.dT >= 5.0; }
    },
    {
      id: 'hess-law-4', level: 4,
      title: { zh: '杯子也會吸熱', en: 'The cup takes heat too' },
      desc: { zh: '用冷熱水混合校正卡計，算出的熱容量 C 與設定值相差不超過 5 J/K。', en: 'Calibrate the calorimeter by mixing hot and cold water: your heat capacity C must be within 5 J/K of the value set in the simulation.' },
      check: function (ev) { return ev.type === 'calib' && !!ev.data && within(ev.data.err, 5); }
    },
    {
      id: 'hess-law-5', level: 5,
      title: { zh: '中和熱', en: 'Heat of neutralisation' },
      desc: { zh: '量出中和熱（每生成 1 mol 水），誤差在 5% 以內。', en: 'Measure the heat of neutralisation (per mole of water formed) to within 5%.' },
      check: function (ev) { const d = an(ev); return !!d && d.kind === 'neut' && within(d.err, 0.05); }
    },
    {
      id: 'hess-law-6', level: 5,
      title: { zh: '溶解熱', en: 'Heat of solution' },
      desc: { zh: '量出氫氧化鈉的莫耳溶解熱（溶於水），誤差在 5% 以內。', en: 'Measure the molar heat of solution of sodium hydroxide (in water) to within 5%.' },
      check: function (ev) { const d = an(ev); return !!d && d.kind === 'dis-NaOH' && within(d.err, 0.05); }
    },
    {
      id: 'hess-law-7', level: 6,
      title: { zh: '找回散失的熱', en: 'Recover the lost heat' },
      desc: { zh: '用外插法求溫差，讓外插得到的 ΔT 比最高（最低）讀數的溫差大 5% 以上。', en: 'Use extrapolation so that the extrapolated ΔT is at least 5% larger than the ΔT from the highest (or lowest) reading.' },
      check: function (ev) { const d = an(ev); return !!d && d.method === 'ext' && d.dText != null && d.dTraw != null && Math.abs(d.dTraw) > 0.5 && Math.abs(d.dText) >= 1.05 * Math.abs(d.dTraw); }
    },
    {
      id: 'hess-law-8', level: 6,
      title: { zh: '一步到位', en: 'In one step' },
      desc: { zh: '把氫氧化鈉固體直接加進足量的鹽酸，量出每莫耳 NaOH 的反應熱，誤差在 5% 以內。', en: 'Add solid sodium hydroxide straight to excess hydrochloric acid and measure the heat of reaction per mole of NaOH to within 5%.' },
      check: function (ev) { const d = an(ev); return !!d && d.kind === 'r3' && within(d.err, 0.05); }
    },
    {
      id: 'hess-law-9', level: 7,
      title: { zh: '赫斯定律', en: "Hess's law" },
      desc: { zh: '在同一段實驗裡量出溶解熱、中和熱和一步反應的熱（誤差都在 5% 以內），而且前兩個相加與第三個相差不超過 3%。', en: 'In one series, measure the heat of solution, the heat of neutralisation and the one-step heat of reaction (each within 5%), with the first two adding up to within 3% of the third.' },
      check: function (ev) {
        const d = an(ev), h = d && d.hess;
        if (!h || h.h1 == null || h.h2 == null || h.h3 == null) return false;
        return within(h.e1, 0.05) && within(h.e2, 0.05) && within(h.e3, 0.05) && Math.abs(h.h1 + h.h2 - h.h3) <= 0.03 * Math.abs(h.h3);
      }
    },
    {
      id: 'hess-law-10', level: 8,
      title: { zh: '限量試劑', en: 'The limiting reactant' },
      desc: { zh: '中和時讓其中一種試劑的莫耳數是另一種的 1.5 倍以上，仍量出中和熱，誤差在 3% 以內。', en: 'Neutralise with one reactant at least 1.5 times the moles of the other and still measure the heat of neutralisation to within 3%.' },
      check: function (ev) { const d = an(ev); return !!d && d.kind === 'neut' && d.excess >= 1.5 - 1e-9 && within(d.err, 0.03); }
    },
    {
      id: 'hess-law-11', level: 8,
      title: { zh: '未知固體', en: 'The unknown solid' },
      desc: { zh: '在未知固體卡片按「開始」，在揭曉答案之前量出 X 的莫耳溶解熱，誤差在 3% 以內。', en: 'Press “Start” on the unknown-solid card and, before revealing the answer, measure the molar heat of solution of unknown solid X to within 3%.' },
      check: function (ev) { const d = an(ev); return !!d && d.kind === 'dis-X' && !d.revealed && within(d.err, 0.03); }
    },
    {
      id: 'hess-law-12', level: 9,
      title: { zh: '精密量熱', en: 'Precision calorimetry' },
      desc: { zh: '量出中和熱，誤差在 1% 以內。', en: 'Measure the heat of neutralisation to within 1%.' },
      check: function (ev) { const d = an(ev); return !!d && d.kind === 'neut' && within(d.err, 0.01); }
    },
    {
      id: 'hess-law-h1', level: 3, hidden: true,
      riddle: { zh: '有人說：杯子摸起來比冰箱還冷。', en: 'Someone says the cup feels colder than the fridge.' },
      check: function (ev) { const d = tk(ev); return !!d && d.added && d.reading < 10; }
    },
    {
      id: 'hess-law-h2', level: 4, hidden: true,
      riddle: { zh: '不加熱水，也能燙手。', en: 'Too hot to hold, without any hot water.' },
      check: function (ev) { const d = tk(ev); return !!d && d.mode !== 'cal' && d.added && d.reading >= 50; }
    },
    {
      id: 'hess-law-h3', level: 5, hidden: true,
      riddle: { zh: '走了好遠，又回到原點。', en: 'A long way out, and all the way back.' },
      check: function (ev) { const d = tk(ev); return !!d && d.added && d.peak >= 5 && Math.abs(d.reading - d.Troom) <= 0.3 && d.t - d.tAdd > 60; }
    }
  ]);
})();
