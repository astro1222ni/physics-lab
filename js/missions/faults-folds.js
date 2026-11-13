/* missions/faults-folds.js — 地質構造：斷層、褶皺與應力 的任務（星星數 = 等級；隱藏任務 = 等級 × 2）
 *
 * 事件（js/faults-folds.js 只在使用者操作過之後才回報；載入頁面不算）：
 *   'fault'：data = {
 *      regime（'normal'／'strike'／'reverse'）, crit（達到破裂條件）, critHydro（若孔隙壓力只是靜水壓，是否也會破裂）, tensile（有效應力為負）,
 *      ratio（有效應力比 σ1′/σ3′）, q（破裂需要的應力比）, z、kH、kh、lam、mu、az、plane（選的共軛面 0／1）,
 *      strike、dip、rake（度）, slip（實際滑移 m，沒破裂時 0）, slipSet（滑桿）, throw（落差，上盤上升為正）, heave（水平拉開為正）,
 *      along（沿走向分量）, lateral（'right'／'left'）, erode（侵蝕成平地）, expoFw、expoHw（侵蝕後兩側露出的地層，0 最年輕、14 基盤、15 岩脈）,
 *      base（地質圖上看得到基盤）, quakes（按了幾次地震）, quaked（這一次是剛發生地震）, animating（地震動畫進行中） }；
 *   'fold'：data = { lam、A、plunge、e（侵蝕面高度）、az, limbDip、interlimb（度）, cls, shortening（0–1）, crest、trough（背斜、向斜核心露出的地層）, kinds, base }；
 *   'quake'、'view'、'cam'：發生地震、切換 3D 與視角。
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const HYDRO = 1000 / 2700;
  const Fz = function (ev) { return ev.type === 'fault' && !ev.data.animating ? ev.data : null; };
  const Fd = function (ev) { return ev.type === 'fold' ? ev.data : null; };
  const slipping = function (d, reg) { return !!d && d.regime === reg && d.crit && d.slip >= 50; };

  LabMission.register('faults-folds', [
    {
      id: 'faults-folds-1', level: 1,
      title: { zh: '正斷層', en: 'A normal fault' },
      desc: { zh: '讓斷層真的滑動成正斷層，滑移至少 50 m。提示：把 Sh 調小，或把孔隙壓力調高。', en: 'Make the fault actually slip as a normal fault, by at least 50 m. Hint: lower Sh or raise the pore pressure.' },
      check: function (ev) { return slipping(Fz(ev), 'normal'); }
    },
    {
      id: 'faults-folds-2', level: 2,
      title: { zh: '逆斷層', en: 'A reverse fault' },
      desc: { zh: '讓兩個水平應力都比 Sv 大，並讓斷層滑動成逆斷層，滑移至少 50 m。', en: 'Make both horizontal stresses larger than Sv and let the fault slip as a reverse fault, by at least 50 m.' },
      check: function (ev) { return slipping(Fz(ev), 'reverse'); }
    },
    {
      id: 'faults-folds-3', level: 2,
      title: { zh: '平移斷層', en: 'A strike-slip fault' },
      desc: { zh: '讓 Sv 夾在兩個水平應力中間，斷層滑動成平移斷層，滑移至少 50 m。', en: 'Put Sv between the two horizontal stresses and let the fault slip as a strike-slip fault, by at least 50 m.' },
      check: function (ev) { return slipping(Fz(ev), 'strike'); }
    },
    {
      id: 'faults-folds-4', level: 3,
      title: { zh: '傾角 60° 的正斷層', en: 'A normal fault dipping 60°' },
      desc: { zh: '讓會滑動的正斷層傾角是 60°（誤差 0.2° 內）。傾角由摩擦係數決定：正斷層 45° + φ/2，tan φ = μ。', en: 'Make a slipping normal fault dip at 60° (within 0.2°). Friction sets the dip: 45° + φ/2 for a normal fault, with tan φ = μ.' },
      check: function (ev) { const d = Fz(ev); return !!d && d.regime === 'normal' && d.crit && Math.abs(d.dip - 60) <= 0.2; }
    },
    {
      id: 'faults-folds-5', level: 3,
      title: { zh: '落差 300 公尺', en: 'A throw of 300 m' },
      desc: { zh: '讓斷層兩側的地層上下錯開剛好 300 m（誤差 3 m 內）。落差 = 滑移 × sin(傾角)。', en: 'Offset the layers vertically by exactly 300 m (within 3 m). Throw = slip × sin(dip).' },
      check: function (ev) { const d = Fz(ev); return !!d && d.crit && Math.abs(Math.abs(d.throw) - 300) <= 3; }
    },
    {
      id: 'faults-folds-6', level: 4,
      title: { zh: '右移 200 公尺', en: '200 m right-lateral' },
      desc: { zh: '做出右移的平移斷層，沿走向錯開 200 m（誤差 3 m 內）。站在斷層一側看，對面往右邊移動。', en: 'Make a right-lateral strike-slip fault offset by 200 m along strike (within 3 m). Standing on one side, the far side has moved to your right.' },
      check: function (ev) { const d = Fz(ev); return !!d && d.regime === 'strike' && d.crit && d.lateral === 'right' && Math.abs(Math.abs(d.along) - 200) <= 3; }
    },
    {
      id: 'faults-folds-7', level: 5,
      title: { zh: '注水引發的地震', en: 'An injection-induced earthquake' },
      desc: { zh: '選一組應力，讓斷層在靜水壓（λ ≈ 0.37）下還鎖住；再把孔隙壓力調高，讓它滑動並按「地震！」。廢水回注引發地震就是這個道理。', en: 'Choose stresses that keep the fault locked at hydrostatic pore pressure (λ ≈ 0.37); then raise the pore pressure until it slips and press “Earthquake!”. This is how waste-water injection triggers earthquakes.' },
      check: function (ev) { const d = Fz(ev); return !!d && d.quaked && d.crit && !d.critHydro && d.lam > HYDRO + 0.005; }
    },
    {
      id: 'faults-folds-8', level: 5,
      title: { zh: '老地層在上', en: 'Older rock on top' },
      desc: { zh: '用逆斷層把深處的老地層推上來，再侵蝕成平地：讓上盤露出的地層比下盤老至少 2 層。', en: 'Push old, deep layers up along a reverse fault, then erode it flat: make the hanging wall expose rock at least 2 layers older than the footwall.' },
      check: function (ev) { const d = Fz(ev); return !!d && d.regime === 'reverse' && d.erode && d.expoHw <= 13 && d.expoHw - d.expoFw >= 2; }
    },
    {
      id: 'faults-folds-9', level: 6,
      title: { zh: '剛好要破裂', en: 'On the verge of failure' },
      desc: { zh: '讓應力比剛好達到破裂所需的值，最多超過 1%（莫爾圓剛好碰到破裂線）。', en: 'Bring the stress ratio just to the value needed for failure, overshooting by no more than 1% (the Mohr circle just touches the failure line).' },
      check: function (ev) { const d = Fz(ev); return !!d && !d.tensile && d.ratio / d.q >= 1 && d.ratio / d.q <= 1.01; }
    },
    {
      id: 'faults-folds-10', level: 3,
      title: { zh: '翼部傾角 30°', en: 'Limbs dipping 30°' },
      desc: { zh: '切到「褶皺」，調波長與振幅，讓翼部最陡的傾角是 30°（誤差 0.5° 內）。', en: 'Switch to “Folds” and set the wavelength and amplitude so the steepest limb dip is 30° (within 0.5°).' },
      check: function (ev) { const d = Fd(ev); return !!d && Math.abs(d.limbDip - 30) <= 0.5; }
    },
    {
      id: 'faults-folds-11', level: 4,
      title: { zh: '縮短 20%', en: 'Shortened by 20%' },
      desc: { zh: '把波長設為 4000 m，再調振幅，讓地層被擠成褶皺後水平長度剛好縮短 20%（誤差 0.2% 內）。', en: 'Set the wavelength to 4000 m, then adjust the amplitude so the folded layers are shortened horizontally by exactly 20% (within 0.2%).' },
      check: function (ev) { const d = Fd(ev); return !!d && Math.abs(d.lam - 4000) < 0.05 && Math.abs(d.shortening - 0.2) <= 0.002; }
    },
    {
      id: 'faults-folds-12', level: 4,
      title: { zh: '緊密褶皺', en: 'A tight fold' },
      desc: { zh: '把褶皺擠到兩翼的夾角（翼間角）在 20°–30° 之間，再把侵蝕面降到海拔 0 以下，看地質圖上擠在一起的條帶。', en: 'Squeeze the fold until the angle between its limbs (the interlimb angle) is between 20° and 30°, then lower the erosion level below 0 to see the tightly packed bands on the map.' },
      check: function (ev) { const d = Fd(ev); return !!d && d.interlimb <= 30 && d.interlimb >= 20 && d.e <= 0; }
    },
    {
      id: 'faults-folds-h1', level: 5, hidden: true,
      riddle: { zh: '水把岩石撐開了。', en: 'The water pushed the rock apart.' },
      check: function (ev) { const d = Fz(ev); return !!d && d.tensile && d.kh >= 0.5 && d.kH >= 0.5; }
    },
    {
      id: 'faults-folds-h2', level: 4, hidden: true,
      riddle: { zh: '挖得夠深，見到最初的那一層。', en: 'Dig deep enough to meet the very first layer.' },
      check: function (ev) { const d = ev.type === 'fold' ? ev.data : Fz(ev); return !!d && d.base && !(d.mode === 'fold' && d.e < -1300); }
    },
    {
      id: 'faults-folds-h3', level: 4, hidden: true,
      riddle: { zh: '四面八方一樣重，大地就沉默了。', en: 'Pressed equally from every side, the ground falls silent.' },
      check: function (ev) { const d = Fz(ev); return !!d && Math.abs(d.kH - 1) <= 0.01 && Math.abs(d.kh - 1) <= 0.01; }
    }
  ]);
})();
