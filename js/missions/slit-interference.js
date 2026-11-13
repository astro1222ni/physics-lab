/* missions/slit-interference.js — 雙狹縫干涉與單狹縫繞射的任務（星星數 = 等級 1–10） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  // 事件（js/slit-interference.js 發出）：
  //   setup：使用者操作後、設定與游標停止變動約 0.3 s 時回報一次（拖曳游標時放開才回報）
  //     { mode: 'single' | 'double' | 'grating', N, white, lam（nm；白光時 NaN）, a（μm）, d（μm；單狹縫時 NaN）, L（m）,
  //       dy（λL/d，mm）, y1（第 1 級亮紋精確位置，mm）, W（中央亮帶寬度，mm）, k（缺級間隔，0 = 無）, nCentral（中央亮帶內亮紋數）,
  //       y400、y700（400 nm、700 nm 第 1 級亮紋位置，mm）, cursor（是否已放游標）,
  //       游標有放時另有 y（mm）, theta（度）, pathD、pathA（d sinθ、a sinθ，nm）, pd、pa（以 λ 為單位；白光時 NaN）,
  //       I（I/I0，白光為各色總和）, R、G、B（白光顏色，線性 RGB，中央為 1；單色光時 NaN） }
  // 白光時 dy、y1、W 以 550 nm 計算（與頁面讀數相同）。
  const EPS = 1e-9;
  const near = function (a, b, tol) { return isFinite(a) && Math.abs(a - b) <= tol + EPS; };
  const is = function (a, b) { return Math.abs(a - b) <= 1e-6; };
  const setup = function (ev) { return ev.type === 'setup'; };
  const mono = function (ev) { return setup(ev) && !ev.data.white; };
  const white = function (ev) { return setup(ev) && ev.data.white; };
  const cur = function (ev) { return setup(ev) && ev.data.cursor; };
  /** 游標所在處的程差最接近的整數級數 m（d sinθ = mλ），容許誤差 tol（以 λ 為單位）；不在亮紋上回傳 NaN */
  const order = function (d, tol) { const m = Math.round(d.pd); return isFinite(d.pd) && Math.abs(d.pd - m) <= tol + EPS ? m : NaN; };
  /** 同一個屏幕位置、同一組狹縫與屏幕距離（只換波長）的「指紋」 */
  const spot = function (d) { return [d.mode, d.N, d.a, d.d, d.L, d.y].join('|'); };
  /** 白光顏色的飽和度：0 = 白（或灰），1 = 純色 */
  const sat = function (d) { const mx = Math.max(d.R, d.G, d.B), mn = Math.min(d.R, d.G, d.B); return mx > 0 ? (mx - mn) / mx : 0; };
  /**
   * 記錄游標停在亮紋上的單色光事件（同一位置、不同波長），回傳該位置記錄到的 { λ: 級數 }。
   * 只記錄 I ≥ minI 的亮紋。
   */
  function brightAtSpot(mem, d, tol, minI) {
    const m = order(d, tol);
    if (!(m >= 1 || m <= -1) || !(d.I >= minI)) return null;
    const key = spot(d);
    if (mem.key !== key) { mem.key = key; mem.seen = {}; }
    mem.seen[d.lam] = Math.abs(m);
    return mem.seen;
  }

  LabMission.register('slit-interference', [
    {
      id: 'slit-interference-1', level: 1,
      title: { zh: '越窄越寬', en: 'Narrower slit, wider spread' },
      desc: { zh: '單狹縫、單色光：讓中央亮帶的寬度超過 100 mm（10 cm）。', en: 'Single slit, monochromatic light: make the central bright band wider than 100 mm (10 cm).' },
      check: function (ev) { const d = ev.data; return mono(ev) && d.mode === 'single' && d.W > 100; }
    },
    {
      id: 'slit-interference-2', level: 2,
      title: { zh: '間距 5 毫米', en: 'Five-millimetre spacing' },
      desc: { zh: '雙狹縫、單色光：讓相鄰亮紋的間距 Δy ≈ λL/d 恰為 5.00 mm（誤差 0.02 mm 內）。', en: 'Double slit, monochromatic light: make the spacing between neighbouring bright fringes Δy ≈ λL/d exactly 5.00 mm (within 0.02 mm).' },
      check: function (ev) { const d = ev.data; return mono(ev) && d.mode === 'double' && near(d.dy, 5, 0.02); }
    },
    {
      id: 'slit-interference-3', level: 3,
      title: { zh: '白光的彩色邊緣', en: 'The coloured edge of white light' },
      desc: { zh: '白光、雙狹縫：先把游標放在正中央的白色亮紋上，再移到第 1 級亮紋偏紅的外緣（紅色明顯多於綠、藍，而且夠亮）。', en: 'White light, double slit: first put the cursor on the white central fringe, then move it to the reddish outer edge of the first-order fringe (clearly more red than green or blue, and bright enough).' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!white(ev) || d.mode !== 'double' || !d.cursor) return false;
        if (Math.abs(d.pathD) <= 60) { mem.centre = true; return false; }
        return !!mem.centre && Math.abs(d.pathD) >= 500 && Math.abs(d.pathD) <= 900 && d.I >= 0.2 && d.R >= 1.4 * d.G && d.R >= 3 * d.B;
      }
    },
    {
      id: 'slit-interference-4', level: 3,
      title: { zh: '消失的第四級', en: 'The vanishing fourth order' },
      desc: { zh: '調整縫寬與縫距，讓第 ±4 級亮紋恰好消失（第一個缺級在 ±4 級）。', en: 'Adjust the slit width and separation so that the ±4th-order bright fringes vanish exactly (the first missing order is ±4).' },
      check: function (ev) { const d = ev.data; return setup(ev) && d.N >= 2 && d.k === 4; }
    },
    {
      id: 'slit-interference-5', level: 4,
      title: { zh: '20 毫米處的暗紋', en: 'A dark fringe at 20 mm' },
      desc: { zh: '單狹縫、紅光雷射 650 nm：讓第 1 暗紋恰好落在離中央 20.0 mm 處（精確位置，誤差 0.1 mm 內）。', en: 'Single slit, 650 nm red laser: put the first dark fringe exactly 20.0 mm from the centre (exact position, within 0.1 mm).' },
      check: function (ev) { const d = ev.data; return mono(ev) && d.mode === 'single' && d.lam === 650 && near(d.W / 2, 20, 0.1); }
    },
    {
      id: 'slit-interference-6', level: 4,
      title: { zh: '光柵分光', en: 'Splitting light with a grating' },
      desc: { zh: '白光、多狹縫光柵：讓第 1 級光譜從 400 nm 到 700 nm 在屏幕上恰好展開 30.0 mm（誤差 0.3 mm 內）。', en: 'White light, multi-slit grating: make the first-order spectrum from 400 nm to 700 nm spread across exactly 30.0 mm of the screen (within 0.3 mm).' },
      check: function (ev) { const d = ev.data; return white(ev) && d.mode === 'grating' && near(d.y700 - d.y400, 30, 0.3); }
    },
    {
      id: 'slit-interference-7', level: 5,
      title: { zh: '整數倍卻是暗的', en: 'A whole number of wavelengths, yet dark' },
      desc: { zh: '單色光、兩條以上狹縫：用游標找到一處程差 d sinθ 恰為整數個波長（不是 0，誤差 0.12λ 內），那裡卻幾乎全暗（I/I0 ≤ 0.01）。', en: 'Monochromatic light, two or more slits: use the cursor to find a place where the path difference d sinθ is a whole number of wavelengths (not 0, within 0.12λ), and yet it is almost completely dark (I/I0 ≤ 0.01).' },
      check: function (ev) { const d = ev.data; const m = order(d, 0.12); return mono(ev) && d.cursor && d.N >= 2 && m !== 0 && isFinite(m) && d.I <= 0.01; }
    },
    {
      id: 'slit-interference-8', level: 6,
      title: { zh: '同樣寬的紅與紫', en: 'Red and violet, equally wide' },
      desc: { zh: '單狹縫：先後用兩種相差至少 150 nm 的波長，各調出一樣寬的中央亮帶（寬度相差不到 0.5%）。', en: 'Single slit: with two wavelengths at least 150 nm apart, one after the other, produce central bright bands of the same width (differing by less than 0.5%).' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!mono(ev) || d.mode !== 'single' || !isFinite(d.W)) return false;
        const list = mem.list = mem.list || [];
        const ok = list.some(function (o) { return Math.abs(o.lam - d.lam) >= 150 && Math.abs(o.W - d.W) <= 0.005 * Math.min(o.W, d.W); });
        list.push({ lam: d.lam, W: d.W });
        if (list.length > 40) list.shift();
        return ok;
      }
    },
    {
      id: 'slit-interference-9', level: 7,
      title: { zh: '兩種顏色疊在一起', en: 'Two colours on one spot' },
      desc: { zh: '雙狹縫：游標不動，只換波長，讓同一處先後成為一種顏色的第 3 級亮紋與另一種顏色的第 4 級亮紋（程差誤差 0.08λ 內），而且兩次都夠亮（I/I0 ≥ 0.2）。', en: 'Double slit: keep the cursor still and change only the wavelength, so that the same spot is first the 3rd-order bright fringe of one colour and then the 4th-order bright fringe of another (path difference within 0.08λ), both bright enough (I/I0 ≥ 0.2).' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!mono(ev) || d.mode !== 'double' || !d.cursor) return false;
        const seen = brightAtSpot(mem, d, 0.08, 0.2);
        if (!seen) return false;
        const orders = Object.keys(seen).map(function (k) { return seen[k]; });
        return orders.indexOf(3) >= 0 && orders.indexOf(4) >= 0;
      }
    },
    {
      id: 'slit-interference-10', level: 8,
      title: { zh: '第 10 級依然明亮', en: 'Still bright at order 10' },
      desc: { zh: '雙狹縫、單色光：用游標標出第 10 級亮紋（程差 10λ，誤差 0.2λ 內），而且它仍然很亮（I/I0 ≥ 0.45）。', en: 'Double slit, monochromatic light: mark the 10th-order bright fringe with the cursor (path difference 10λ, within 0.2λ) while it is still bright (I/I0 ≥ 0.45).' },
      check: function (ev) { const d = ev.data; return mono(ev) && d.mode === 'double' && d.cursor && Math.abs(order(d, 0.2)) === 10 && d.I >= 0.45; }
    },
    {
      id: 'slit-interference-11', level: 9,
      title: { zh: '精密設計', en: 'Precision design' },
      desc: { zh: '雙狹縫、紅光 650 nm、屏幕距離 L = 2.00 m：讓亮紋間距恰為 6.50 mm（± 0.02 mm），中央亮帶裡恰有 9 條亮紋而第 ±5 級缺級，再用游標標出第 5 級缺級的位置（程差 5λ，誤差 0.1λ 內）。', en: 'Double slit, 650 nm red light, screen distance L = 2.00 m: make the fringe spacing exactly 6.50 mm (± 0.02 mm), with exactly 9 bright fringes in the central band and the ±5th orders missing, then mark the 5th-order missing fringe with the cursor (path difference 5λ, within 0.1λ).' },
      check: function (ev) {
        const d = ev.data;
        return mono(ev) && d.mode === 'double' && d.lam === 650 && is(d.L, 2) && near(d.dy, 6.5, 0.02) &&
          d.k === 5 && d.nCentral === 9 && d.cursor && Math.abs(order(d, 0.1)) === 5;
      }
    },
    {
      id: 'slit-interference-12', level: 10,
      title: { zh: '大師：三色交會', en: 'Master: three colours meet' },
      desc: { zh: '雙狹縫：游標不動，只換波長，讓屏幕上同一處先後成為三種不同顏色的亮紋（各自程差為整數個波長，誤差 0.06λ 內），而且三次都很亮（I/I0 ≥ 0.5）。', en: 'Double slit: keep the cursor still and change only the wavelength, so that the same spot on the screen becomes a bright fringe for three different colours in turn (each path difference a whole number of wavelengths, within 0.06λ), all three bright (I/I0 ≥ 0.5).' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!mono(ev) || d.mode !== 'double' || !d.cursor) return false;
        const seen = brightAtSpot(mem, d, 0.06, 0.5);
        if (!seen) return false;
        // 三種波長要明顯不同（彼此相差至少 20 nm），而且是不同的級數
        const lams = Object.keys(seen).map(Number).sort(function (x, y) { return x - y; });
        let picked = [];
        lams.forEach(function (l) { if (!picked.length || l - picked[picked.length - 1] >= 20) picked.push(l); });
        const ords = {};
        picked.forEach(function (l) { ords[seen[l]] = true; });
        return picked.length >= 3 && Object.keys(ords).length >= 3;
      }
    },
    // ---------- 隱藏任務：只給隱晦的提示 ----------
    {
      id: 'slit-interference-h1', level: 4, hidden: true,
      riddle: { zh: '成雙成對的都走了，只剩下落單的還亮著。', en: 'All those that came in pairs have gone; only the lonely ones still shine.' },
      check: function (ev) { const d = ev.data; return setup(ev) && d.N >= 2 && d.k === 2; }
    },
    {
      id: 'slit-interference-h2', level: 6, hidden: true,
      riddle: { zh: '第二道彩虹的尾巴，被第三道彩虹的頭輕輕踩住；伸手指著那一處，別讓它暗得看不見。', en: 'The tail of the second rainbow is gently stepped on by the head of the third; point right at that spot, and do not let it fade into the dark.' },
      check: function (ev) {
        const d = ev.data;
        return white(ev) && d.mode === 'grating' && d.cursor && Math.abs(d.pathD) >= 1140 && Math.abs(d.pathD) <= 1500 && d.I >= 0.02;
      }
    },
    {
      id: 'slit-interference-h3', level: 7, hidden: true,
      riddle: { zh: '走得夠遠以後，七種顏色又悄悄融回一片蒼白。', en: 'Go far enough, and the seven colours quietly melt back into pale white.' },
      check: function (ev) {
        const d = ev.data;
        return white(ev) && d.mode === 'double' && d.cursor && Math.abs(d.pathD) >= 4000 && d.I >= 0.3 && sat(d) <= 0.05;
      }
    }
  ]);
})();
