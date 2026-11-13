/* missions/flame-test.js — 焰色反應的任務（星星數 = 等級 1–10；隱藏任務 = 等級 × 2） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  // 事件（js/flame-test.js 只在使用者操作之後回報）：
  //   'flame'：設定改變後 { metals, unknown, conc, air, h, T, Tw, hp, Hc, inCone, cobalt, lamp, TL, color（中文顏色名）, dw, Ym, soot }
  //   'measure'：游標量測 { lam, eV, sig, near{el,lam,d}（樣品中最近的譜線）, net, contrast, isPeak, isDip, resolvedD,
  //              metals, unknown, cobalt, lamp, TL, T, air, h, hp, Hc, inCone, soot, res, log, zoom, hotRatio, rec?, recs?[{lam, el}] }
  //   'identify'：未知樣品按「核對」{ correct, n, metals, answer, streak, mixNoCo, usedCobalt, usedScope }
  //   'view3d'：開啟 3D 檢視
  const fl = function (ev) { return ev.type === 'flame' && ev.data ? ev.data : null; };
  const ms = function (ev) { return ev.type === 'measure' && ev.data ? ev.data : null; };
  const idf = function (ev) { return ev.type === 'identify' && ev.data ? ev.data : null; };
  const only = function (d, list) { return !!d.metals && d.metals.length === list.length && list.every(function (s) { return d.metals.indexOf(s) >= 0; }); };
  const has = function (d, s) { return !!d.metals && d.metals.indexOf(s) >= 0; };
  /** 游標對準 el 的 λ 線（誤差 tol nm），而且是一個亮線峰 */
  const onLine = function (d, el, lam, tol) { return !!d.near && d.near.el === el && Math.abs(d.near.lam - lam) < 1e-3 && Math.abs(d.lam - lam) <= tol; };
  /** 紀錄表裡有 el 的 λ 線（記錄時游標在亮線峰上、誤差 0.1 nm 以內） */
  const recorded = function (d, el, lam) { return !!d.recs && d.recs.some(function (r) { return r.el === el && Math.abs(r.lam - lam) <= 0.1; }); };
  const D1 = 589.592424;   // 鈉 D1（3p 2P1/2 → 3s）

  LabMission.register('flame-test', [
    {
      id: 'flame-test-1', level: 1,
      title: { zh: '黃色的火焰', en: 'A yellow flame' },
      desc: { zh: '白金絲沾上 NaCl，放進火焰，讓火焰變成黃色。', en: 'Put NaCl on the wire and hold it in the flame so the flame turns yellow.' },
      check: function (ev) { const d = fl(ev); return !!d && !d.unknown && only(d, ['Na']) && d.color === '黃'; }
    },
    {
      id: 'flame-test-2', level: 2,
      title: { zh: '磚紅色', en: 'Brick red' },
      desc: { zh: '用鈣鹽讓火焰變成橙紅（磚紅）色。', en: 'Use a calcium salt to turn the flame orange-red (brick red).' },
      check: function (ev) { const d = fl(ev); return !!d && !d.unknown && only(d, ['Ca']) && d.color === '橙紅（磚紅）'; }
    },
    {
      id: 'flame-test-3', level: 2,
      title: { zh: '綠色的火焰', en: 'A green flame' },
      desc: { zh: '找出能讓火焰變成綠色系（綠、黃綠或藍綠）的金屬，只沾這一種。', en: 'Find a metal that turns the flame a shade of green (green, yellow-green or blue-green), with only that metal on the wire.' },
      check: function (ev) { const d = fl(ev); return !!d && !d.unknown && d.metals.length === 1 && ['綠', '黃綠', '藍綠'].indexOf(d.color) >= 0; }
    },
    {
      id: 'flame-test-4', level: 3,
      title: { zh: '立體的火焰', en: 'The flame in 3D' },
      desc: { zh: '切換到「3D 立體」，看看內焰、外焰和白金絲的位置。', en: 'Switch to the 3D view and look at the inner cone, the outer flame and where the wire sits.' },
      check: function (ev) { return ev.type === 'view3d'; }
    },
    {
      id: 'flame-test-5', level: 3,
      title: { zh: '鈉的黃線', en: 'Sodium’s yellow line' },
      desc: { zh: '沾 NaCl，在光譜圖上用「找亮線」把游標放到鈉的黃線上（589 nm 附近，誤差 0.5 nm 以內）。', en: 'With NaCl on the wire, use “Find bright line” to put the cursor on sodium’s yellow line (near 589 nm, within 0.5 nm).' },
      check: function (ev) { const d = ms(ev); return !!d && !d.unknown && has(d, 'Na') && d.isPeak && d.near && d.near.el === 'Na' && Math.abs(d.lam - 589.29) <= 0.5 && d.sig >= 0.02; }
    },
    {
      id: 'flame-test-6', level: 4,
      title: { zh: '紅色火焰裡的藍線', en: 'A blue line in a red flame' },
      desc: { zh: '鍶的火焰是紅色的，但光譜裡有一條藍線：用游標量出 460.73 nm 這條線（誤差 0.3 nm 以內）。', en: 'Strontium’s flame is red, yet its spectrum has a blue line: measure the 460.73 nm line with the cursor (within 0.3 nm).' },
      check: function (ev) { const d = ms(ev); return !!d && d.isPeak && onLine(d, 'Sr', 460.7331, 0.3); }
    },
    {
      id: 'flame-test-7', level: 4,
      title: { zh: '最熱的地方', en: 'The hottest spot' },
      desc: { zh: '把空氣孔開到 90% 以上，沾上任一種樣品，把白金絲放在火焰最熱的地方（內焰尖端上方，誤差 3 mm 以內）。', en: 'Open the air hole to 90% or more, put any sample on the wire and hold the wire at the hottest spot of the flame (just above the tip of the inner cone, within 3 mm).' },
      check: function (ev) { const d = fl(ev); return !!d && d.metals.length > 0 && d.air >= 0.9 && Math.abs(d.h - d.hp) <= 3; }
    },
    {
      id: 'flame-test-8', level: 5,
      title: { zh: '藍色的濾鏡', en: 'A blue filter' },
      desc: { zh: '同時沾 NaCl 與 KCl，火焰是黃色的；勾選「鈷玻璃」，讓火焰看起來變成紫色系（紫、淡紫或洋紅）。', en: 'Put both NaCl and KCl on the wire — the flame looks yellow. Tick “Cobalt glass” so the flame looks violet (violet, lilac or magenta).' },
      check: function (ev) { const d = fl(ev); return !!d && !d.unknown && only(d, ['Na', 'K']) && d.cobalt && ['紫', '紫紅（淡紫）', '洋紅'].indexOf(d.color) >= 0; }
    },
    {
      id: 'flame-test-9', level: 5,
      title: { zh: '認出未知樣品', en: 'Name the unknown' },
      desc: { zh: '在未知樣品區選「一種金屬」，按「新的未知樣品」，認出是哪一種金屬並答對。', en: 'In the unknown-sample panel choose “One metal”, press “New unknown”, and name the metal correctly.' },
      check: function (ev) { const d = idf(ev); return !!d && d.correct && d.n === 1; }
    },
    {
      id: 'flame-test-10', level: 6,
      title: { zh: '兩種金屬的混合物', en: 'A mixture of two' },
      desc: { zh: '答對一題「兩種金屬」的未知樣品。', en: 'Correctly identify an unknown sample of “Two metals”.' },
      check: function (ev) { const d = idf(ev); return !!d && d.correct && d.n === 2; }
    },
    {
      id: 'flame-test-11', level: 7,
      title: { zh: '光譜偵探', en: 'Spectrum detective' },
      desc: { zh: '未知樣品連續答對 5 題（中間不按「看答案」、不答錯）。', en: 'Identify 5 unknown samples in a row (no wrong answers and no “Show the answer” in between).' },
      check: function (ev) { const d = idf(ev); return !!d && d.correct && d.streak >= 5; }
    },
    {
      id: 'flame-test-12', level: 8,
      title: { zh: '鉀的紫線', en: 'Potassium’s violet line' },
      desc: { zh: '沾 KCl，把狹縫調細，量出鉀在 404.41 nm 的紫線（誤差 0.1 nm 以內；它和 404.72 nm 的線靠得很近）。', en: 'With KCl on the wire, narrow the slit and measure potassium’s violet line at 404.41 nm (within 0.1 nm; it sits very close to the 404.72 nm line).' },
      check: function (ev) { const d = ms(ev); return !!d && d.isPeak && onLine(d, 'K', 404.4136, 0.1); }
    },

    // ---------------- 隱藏任務 ----------------
    {
      id: 'flame-test-h1', level: 3, hidden: true,
      riddle: { zh: '燭光裡，名字都被抹掉了。', en: 'In candlelight every name is smudged out.' },
      // 空氣孔關小：煤灰的連續光譜占九成以上；把狹縫調細、放大，游標對準樣品的一條譜線（0.05 nm 以內），線的對比仍不到 5%
      check: function (ev) {
        const d = ms(ev);
        return !!d && !d.unknown && !d.lamp && d.soot >= 0.9 && d.zoom <= 40 && d.res <= 0.3 && d.near && d.near.d <= 0.05 && has(d, d.near.el) &&
          d.contrast != null && d.contrast < 0.05;
      }
    },
    {
      id: 'flame-test-h2', level: 4, hidden: true,
      riddle: { zh: '它的名字取自天空的顏色，證據有兩道。', en: 'Its name comes from the colour of the sky, and there are two pieces of evidence.' },
      // 銫（caesius，天藍色）：本生與克希何夫 1860 年憑兩條藍線發現；紀錄表裡同時有 455.53 與 459.32 nm
      check: function (ev) { const d = ms(ev); return !!d && d.rec && recorded(d, 'Cs', 455.52799) && recorded(d, 'Cs', 459.31721); }
    },
    {
      id: 'flame-test-h3', level: 5, hidden: true,
      riddle: { zh: '暗紅色的名字，兩道證據躲在看得見的盡頭。', en: 'A dark-red name, with two pieces of evidence hiding at the edge of sight.' },
      // 銣（rubidus，深紅色）：1861 年憑兩條深紅色的線發現；紀錄表裡同時有 780.03 與 794.76 nm
      check: function (ev) { const d = ms(ev); return !!d && d.rec && recorded(d, 'Rb', 780.0268) && recorded(d, 'Rb', 794.7603); }
    },
    {
      id: 'flame-test-h4', level: 6, hidden: true,
      riddle: { zh: '火的正中心，反而最安靜。', en: 'At the very heart of the fire it is quietest.' },
      // 內焰裡還沒燒完、溫度低：鈉的 D 線不到最熱處的 1%
      check: function (ev) {
        const d = ms(ev);
        return !!d && !d.unknown && !d.lamp && d.inCone && only(d, ['Na']) && d.near && d.near.el === 'Na' && d.near.d <= 0.3 &&
          d.hotRatio != null && d.hotRatio >= 0 && d.hotRatio < 0.01;
      }
    },
    {
      id: 'flame-test-h5', level: 7, hidden: true,
      riddle: { zh: '不戴藍色的眼鏡，也看得穿黃色的霧。', en: 'No blue glasses, and still you see through the yellow fog.' },
      // 鈉鉀混合、不用鈷玻璃：改用分光鏡直接量出鉀的線
      check: function (ev) {
        const d = ms(ev);
        return !!d && !d.unknown && !d.cobalt && only(d, ['Na', 'K']) && d.isPeak && d.near && d.near.el === 'K' && d.near.d <= 0.1 && d.contrast > 0.5;
      }
    },
    {
      id: 'flame-test-h6', level: 7, hidden: true,
      riddle: { zh: '看似一個，其實是兩個；指出偏紅的那一位。', en: 'It looks like one but it is two; point to the redder one.' },
      // 鈉 D 雙線：狹縫 ≤ 0.1 nm 分開兩條線，游標對準 D1 589.592 nm（誤差 0.03 nm）
      check: function (ev) {
        const d = ms(ev);
        return !!d && !d.lamp && d.soot < 0.2 && d.res <= 0.1 && d.resolvedD && d.isPeak && onLine(d, 'Na', D1, 0.03) && d.net != null && d.net >= 0.02;
      }
    },
    {
      id: 'flame-test-h7', level: 8, hidden: true,
      riddle: { zh: '把太陽搬進實驗室，黑色的缺口就會出現。', en: 'Bring the Sun into the lab and the black gaps appear.' },
      // 夫朗和斐暗線：燈比火焰熱 300 K 以上，鈉的 D 線變成暗線
      check: function (ev) {
        const d = ms(ev);
        return !!d && d.lamp && d.TL >= d.T + 300 && d.soot < 0.2 && has(d, 'Na') && d.isDip && d.near && d.near.el === 'Na' && d.near.d <= 0.35;
      }
    },
    {
      id: 'flame-test-h8', level: 9, hidden: true,
      riddle: { zh: '明與暗剛好打平的那一刻。', en: 'The moment when bright and dark exactly break even.' },
      // 譜線反轉法：燈的亮度溫度等於火焰溫度（差 15 K 以內）時，鈉的 D 線消失
      check: function (ev) {
        const d = ms(ev);
        return !!d && d.lamp && Math.abs(d.TL - d.T) <= 15 && d.soot < 0.2 && has(d, 'Na') && d.near && d.near.el === 'Na' && d.near.d <= 0.3 && d.zoom <= 40;
      }
    },
    {
      id: 'flame-test-h9', level: 8, hidden: true,
      riddle: { zh: '紅色的它，其實還藏著一點橘。', en: 'It burns red, yet it hides a touch of orange.' },
      // 鋰除了 670.78 nm 的紅線，還有 610.36 nm 的橙色線（3d → 2p）；記錄到紀錄表
      check: function (ev) { const d = ms(ev); return !!d && d.rec && recorded(d, 'Li', 610.36) && recorded(d, 'Li', 670.776); }
    },
    {
      id: 'flame-test-h10', level: 10, hidden: true,
      riddle: { zh: '三次都是兩個人，你不戴眼鏡就叫出全名。', en: 'Three times there were two of them, and you named them all without glasses.' },
      // 兩種金屬的未知樣品連續答對 3 題，而且都沒有用鈷玻璃
      check: function (ev) { const d = idf(ev); return !!d && d.correct && d.n === 2 && !d.usedCobalt && d.mixNoCo >= 3; }
    }
  ]);
})();
