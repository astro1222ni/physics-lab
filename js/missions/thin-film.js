/* missions/thin-film.js — 薄膜干涉（肥皂膜、空氣劈與牛頓環）的任務（星星數 = 等級 1–10） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  // 事件（js/thin-film.js 發出）：
  //   state：使用者操作後、設定與游標停止變動約 0.3 s 時回報一次（拖曳時放開才回報；排液時每 0.25 s 一次）
  //     共同：{ mode: 'soap' | 'wedge' | 'newton', white, lam（nm；白光時 NaN）, beams: 'multi' | 'two' }
  //     soap：{ n, ang（入射角，度）, hb（底部厚度，nm）, t（排液時間，s）, h（游標處厚度，nm）, path（2nh cosθt，nm）,
  //             ord（path/λ；白光 NaN）, R（反射率；白光 NaN）, Rmax, Rs, Rp（白光時以 550 nm 計）,
  //             rgb（看到的顏色 sRGB 0–255）, hue（0–360）, sat、val（0–1）, brewster（atan n，度） }
  //     wedge：{ D（細線直徑，μm）, L（cm）, n, dx（λL/(2nD)，mm）, count（暗紋數）, mys（神秘細線）,
  //             cx（游標位置，mm；沒放時 NaN）, nRec（列入擬合的紀錄數）, fitDx（擬合斜率，mm）, fitD（由斜率推得的 D，μm） }
  //     newton：{ R（m）, n, e（透鏡與平板的間隙，nm）, view: 'R' | 'T', mys, dust,
  //             r5（第 5 暗環半徑，mm；e > 0 時 NaN）, r（游標半徑，mm）, ord（2nt/λ，游標處）, centre（2ne/λ）,
  //             nRec, slope（r² 對 m 的斜率，mm²）, fitR（斜率·n/λ，m）, fitLam（斜率·n/R，nm） }
  //   answer：神秘細線或神秘透鏡按「核對」時 { kind: 'wire' | 'lens', truth, guess, err（相對誤差）, dust, e, revealed, n（介質折射率） }
  const EPS = 1e-9;
  const near = function (a, b, tol) { return isFinite(a) && Math.abs(a - b) <= tol + EPS; };
  const state = function (ev) { return ev.type === 'state'; };
  const mode = function (ev, m) { return state(ev) && ev.data.mode === m; };
  const mono = function (ev, m) { return mode(ev, m) && !ev.data.white; };
  /** x 離最近的整數多遠（0–0.5） */
  const offInt = function (x) { return Math.abs(x - Math.round(x)); };
  const answer = function (ev, kind) { return ev.type === 'answer' && ev.data.kind === kind && !ev.data.revealed && near(ev.data.err, 0, 0.02); };

  LabMission.register('thin-film', [
    {
      id: 'thin-film-1', level: 1,
      title: { zh: '最薄的地方是黑的', en: 'The thinnest part is black' },
      desc: { zh: '肥皂膜、白光：把游標移到膜上厚度不到 20 nm 的地方，看看那裡是什麼顏色。', en: 'Soap film, white light: move the cursor to a place where the film is less than 20 nm thick and see what colour it is.' },
      check: function (ev) { const d = ev.data; return mode(ev, 'soap') && d.white && d.h <= 20; }
    },
    {
      id: 'thin-film-2', level: 2,
      title: { zh: '鈉光的第二條暗紋', en: 'The second dark fringe in sodium light' },
      desc: { zh: '肥皂膜、單色光 589 nm（鈉黃光）：把游標放在從頂端往下數的第 2 條暗紋上（頂端的黑色不算），使 2nh cosθt = 2λ（誤差 0.03λ 內）。', en: 'Soap film, 589 nm (sodium yellow): put the cursor on the 2nd dark fringe counted down from the top (the black top does not count), so that 2nh cosθt = 2λ (within 0.03λ).' },
      check: function (ev) { const d = ev.data; return mono(ev, 'soap') && near(d.lam, 589, 0.5) && near(d.ord, 2, 0.03); }
    },
    {
      id: 'thin-film-3', level: 3,
      title: { zh: '第一道藍', en: 'The first blue' },
      desc: { zh: '肥皂膜、白光：從頂端往下找，把游標放在第一條鮮豔的藍色帶上（光程差 2nh cosθt 小於 900 nm），讀出那裡的厚度。', en: 'Soap film, white light: searching down from the top, put the cursor on the first vivid blue band (path difference 2nh cosθt below 900 nm) and read the thickness there.' },
      check: function (ev) {
        const d = ev.data;
        return mode(ev, 'soap') && d.white && d.path < 900 && d.hue >= 195 && d.hue <= 250 && d.sat >= 0.55 && d.val >= 0.4;
      }
    },
    {
      id: 'thin-film-4', level: 3,
      title: { zh: '間距一毫米', en: 'One-millimetre spacing' },
      desc: { zh: '空氣劈、單色光：調整細線直徑等設定，讓暗紋間距 Δx = λL/(2nD) 恰為 1.000 mm（誤差 0.010 mm 內）。', en: 'Air wedge, monochromatic light: adjust the thread diameter and other settings so that the dark-fringe spacing Δx = λL/(2nD) is exactly 1.000 mm (within 0.010 mm).' },
      check: function (ev) { const d = ev.data; return mono(ev, 'wedge') && !d.mys && near(d.dx, 1, 0.01); }
    },
    {
      id: 'thin-film-5', level: 4,
      title: { zh: '灌水之後', en: 'After pouring in water' },
      desc: { zh: '空氣劈、單色光：先記住空氣（n = 1）時的條紋間距，再把楔中換成水（n = 1.33），波長與玻璃長度不變，換一根細線讓條紋間距和原來一樣（誤差 1% 內）。', en: 'Air wedge, monochromatic light: note the fringe spacing with air (n = 1), then fill the wedge with water (n = 1.33), keep the wavelength and glass length, and change the thread so that the spacing is the same as before (within 1%).' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!mono(ev, 'wedge') || d.mys) return false;
        if (d.n <= 1.001) { mem.air = { lam: d.lam, L: d.L, dx: d.dx, D: d.D }; return false; }
        const a = mem.air;
        return !!a && near(d.n, 1.33, 0.005) && a.lam === d.lam && near(d.L, a.L, 1e-6) && Math.abs(d.D - a.D) > 0.4 && Math.abs(d.dx - a.dx) <= 0.01 * a.dx + EPS;
      }
    },
    {
      id: 'thin-film-6', level: 5,
      title: { zh: '第五暗環兩毫米', en: 'Fifth dark ring at two millimetres' },
      desc: { zh: '牛頓環、單色反射光、透鏡與平板密接：讓第 5 暗環的半徑恰為 2.00 mm（誤差 0.01 mm 內）。', en: "Newton's rings, monochromatic reflected light, lens touching the plate: make the radius of the 5th dark ring exactly 2.00 mm (within 0.01 mm)." },
      check: function (ev) { const d = ev.data; return mono(ev, 'newton') && d.view === 'R' && !d.mys && d.e === 0 && near(d.r5, 2, 0.01); }
    },
    {
      id: 'thin-film-7', level: 5,
      title: { zh: '斜著看就暗了', en: 'Tilt it and it goes dark' },
      desc: { zh: '肥皂膜、單色光：先在垂直入射（θ ≤ 2°）時把游標放在亮紋上（不是最頂端那一條），厚度、波長與折射率都不變，只加大入射角（θ ≥ 15°），讓同一點變成暗紋。', en: 'Soap film, monochromatic light: at near-normal incidence (θ ≤ 2°) put the cursor on a bright fringe (not the topmost one); then, keeping the thickness, wavelength and index the same, only increase the angle of incidence (θ ≥ 15°) until the same spot turns dark.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!mono(ev, 'soap')) return false;
        if (d.ang <= 2 && d.ord >= 1 && near(d.ord % 1, 0.5, 0.05)) { mem.b = { h: d.h, lam: d.lam, n: d.n }; return false; }
        const b = mem.b;
        return !!b && d.ang >= 15 && near(d.h, b.h, 1) && d.lam === b.lam && near(d.n, b.n, 1e-6) && Math.round(d.ord) >= 1 && offInt(d.ord) <= 0.05;
      }
    },
    {
      id: 'thin-film-8', level: 6,
      title: { zh: '反射與透射互補', en: 'Reflection and transmission are complementary' },
      desc: { zh: '牛頓環、單色光：在反射光中把十字線放在第 3 個以後的某個暗環上，其他設定與十字線都不動，改看透射光，看看同一個位置變成什麼。', en: "Newton's rings, monochromatic light: in reflected light put the crosshair on a dark ring beyond the 2nd; then, changing nothing else, switch to transmitted light and see what the same spot becomes." },
      check: function (ev, mem) {
        const d = ev.data;
        if (!mono(ev, 'newton') || !isFinite(d.r)) return false;
        const key = [d.lam, d.R, d.n, d.e, d.beams].join('|');
        if (d.view === 'R') {
          if (Math.round(d.ord) >= 3 && offInt(d.ord) <= 0.1) mem.k = { key: key, r: d.r }; else mem.k = null;
          return false;
        }
        const k = mem.k;
        return !!k && k.key === key && near(d.r, k.r, 0.002) && offInt(d.ord) <= 0.1;
      }
    },
    {
      id: 'thin-film-9', level: 7,
      title: { zh: '用環量出波長', en: 'Measure the wavelength with rings' },
      desc: { zh: '牛頓環、單色光：用十字線量至少 6 個暗環的半徑並記錄，由 r² 對 m 的斜率推得的波長與實際波長相差 1% 以內。', en: "Newton's rings, monochromatic light: measure and record the radii of at least 6 dark rings; the wavelength obtained from the slope of r² against m must be within 1% of the true wavelength." },
      check: function (ev) { const d = ev.data; return mono(ev, 'newton') && !d.mys && d.nRec >= 6 && near(d.fitLam / d.lam, 1, 0.01); }
    },
    {
      id: 'thin-film-10', level: 7,
      title: { zh: '神秘細線', en: 'The mystery thread' },
      desc: { zh: '空氣劈：按「神秘細線」，只靠量暗紋位置算出細線直徑 D，填入答案（誤差 2% 內，不能先看答案）。', en: 'Air wedge: press "Mystery thread", work out the thread diameter D only by measuring dark-fringe positions, and enter your answer (within 2%, without revealing it first).' },
      check: function (ev) { return answer(ev, 'wire'); }
    },
    {
      id: 'thin-film-11', level: 8,
      title: { zh: '神秘透鏡', en: 'The mystery lens' },
      desc: { zh: '牛頓環：不勾「透鏡下有灰塵」，按「神秘透鏡」，只靠量環的半徑算出透鏡的曲率半徑 R，填入答案（誤差 2% 內，不能先看答案）。', en: 'Newton\'s rings: with "Dust under the lens" unticked, press "Mystery lens", work out the radius of curvature R only by measuring ring radii, and enter your answer (within 2%, without revealing it first).' },
      check: function (ev) { return answer(ev, 'lens') && !ev.data.dust; }
    },
    {
      id: 'thin-film-12', level: 10,
      title: { zh: '透鏡下的灰塵', en: 'Dust under the lens' },
      desc: { zh: '牛頓環：勾選「透鏡下有灰塵」再按「神秘透鏡」，中心不再是暗點、環的序數也對不上；照樣算出 R（誤差 2% 內，不能先看答案）。', en: 'Newton\'s rings: tick "Dust under the lens" and press "Mystery lens". The centre is no longer dark and the ring numbers no longer line up; still work out R (within 2%, without revealing it first).' },
      check: function (ev) { return answer(ev, 'lens') && ev.data.dust; }
    },
    {
      id: 'thin-film-h1', level: 4, hidden: true,
      riddle: { zh: '當兩個世界說著同一種語言，邊界便沉默了。', en: 'When two worlds speak the same language, the border falls silent.' },
      check: function (ev) { const d = ev.data; return state(ev) && (d.mode === 'wedge' || d.mode === 'newton') && near(d.n, 1.52, 0.005); }
    },
    {
      id: 'thin-film-h2', level: 6, hidden: true,
      riddle: { zh: '亮得正好的時候，有一半的光不肯回頭。', en: 'Just when it shines brightest, half of the light refuses to turn back.' },
      check: function (ev) {
        const d = ev.data;
        return mono(ev, 'soap') && d.ang > 5 && near(d.ang, d.brewster, 0.3) && d.Rmax > 0 && d.R >= 0.8 * d.Rmax;
      }
    },
    {
      id: 'thin-film-h3', level: 5, hidden: true,
      riddle: { zh: '隔著四分之一的距離，正中央便不再守著黑夜。', en: 'Keep a quarter of the distance between them, and the centre no longer keeps the night.' },
      check: function (ev) { const d = ev.data; return mono(ev, 'newton') && !d.mys && d.e >= 50 && near(d.centre % 1, 0.5, 0.03); }
    },
    // ---- 11/12 深夜站長：「每一個實驗的隱藏任務增加到十個。」以下 h4–h10 ----
    {
      // 肥皂膜、單色光、正入射：游標放在最薄的亮紋上，2nh = λ/2（四分之一波長膜，最強的反射）
      id: 'thin-film-h4', level: 3, hidden: true,
      riddle: { zh: '黑夜之後第一次亮起，只要最短的一趟來回。', en: 'The first time it lights up after the night, it takes only the shortest round trip.' },
      check: function (ev) { const d = ev.data; return mono(ev, 'soap') && d.ang <= 2 && near(d.ord, 0.5, 0.02); }
    },
    {
      // 肥皂膜、正入射、同一點：先對某波長是暗紋，只換波長（差 ≥ 30 nm），同一點變成亮紋（ord ≥ 1.5）
      id: 'thin-film-h5', level: 7, hidden: true,
      riddle: { zh: '同一處薄紗，對一種顏色沉默，卻為另一種顏色歌唱。', en: 'In the same spot the veil keeps silent for one colour and sings for another.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!mono(ev, 'soap') || d.ang > 2) return false;
        if (Math.round(d.ord) >= 1 && offInt(d.ord) <= 0.02) { mem.k = { h: d.h, n: d.n, ang: d.ang, lam: d.lam }; return false; }
        const k = mem.k;
        return !!k && near(d.h, k.h, 1) && near(d.n, k.n, 1e-6) && d.ang === k.ang && Math.abs(d.lam - k.lam) >= 30 && d.ord >= 1.5 && near(d.ord % 1, 0.5, 0.02);
      }
    },
    {
      // 空氣劈：細線處的間隙恰為半波長的整數倍（2nD = mλ），最後一條暗紋正好落在細線上；十字線放在細線位置（x = L）驗證
      id: 'thin-film-h6', level: 6, hidden: true,
      riddle: { zh: '讓最後一道夜色，恰好枕在那根髮絲上。', en: 'Let the last strip of night rest exactly on the hair.' },
      check: function (ev) {
        const d = ev.data;
        if (!mono(ev, 'wedge') || d.mys || !isFinite(d.cx)) return false;
        const ord = 2 * d.n * d.D * 1000 / d.lam;   // 細線處的 2nD/λ（D：μm，λ：nm）
        return Math.round(ord) >= 1 && offInt(ord) <= 0.02 && Math.abs(d.cx - 10 * d.L) <= 0.15 * d.dx;
      }
    },
    {
      // 牛頓環（牛頓《光學》的充水觀察）：空氣中十字線放在第 m 個暗環（m ≥ 3），R、λ 不變、間隙充水（n = 1.33），十字線放到同一序數的暗環上
      id: 'thin-film-h7', level: 8, hidden: true,
      riddle: { zh: '同一個名字的圓，泡過水就消瘦了；牛頓量過它瘦了多少。', en: 'The ring that bears the same number grows thinner after a bath; Newton measured how much.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!mono(ev, 'newton') || d.mys || d.view !== 'R' || d.e !== 0 || !isFinite(d.r)) return false;
        const m = Math.round(d.ord), dark = m >= 3 && offInt(d.ord) <= 0.06;
        if (d.n <= 1.001) { mem.a = dark ? { m: m, R: d.R, lam: d.lam, r: d.r } : null; return false; }
        const a = mem.a;
        return !!a && dark && near(d.n, 1.33, 0.005) && m === a.m && d.R === a.R && d.lam === a.lam && d.r < a.r;
      }
    },
    {
      // 神秘細線泡在液體裡（1.2 ≤ n ≤ 1.5）：D = λL/(2nΔx) 要記得除以 n
      id: 'thin-film-h8', level: 8, hidden: true,
      riddle: { zh: '沉進水裡的祕密，要用縮短的步伐去丈量。', en: 'A secret sunk in water must be measured with a shortened stride.' },
      check: function (ev) { return answer(ev, 'wire') && isFinite(ev.data.n) && ev.data.n >= 1.2 && ev.data.n <= 1.5; }
    },
    {
      // 牛頓環：密接時量 ≥ 5 個暗環得 r² 對 m 的斜率；R、n、λ 不變，抬高 e ≥ 100 nm（中心不是 h3 的亮點）後再量 ≥ 5 個，斜率相同（1% 內）
      id: 'thin-film-h9', level: 9, hidden: true,
      riddle: { zh: '塵埃抬起了一切，卻改不了它攀升的步伐。', en: 'The dust lifts everything, yet cannot change the pace of its climb.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!mono(ev, 'newton') || d.mys || !(d.nRec >= 5) || !isFinite(d.slope) || d.slope <= 0) return false;
        if (d.e === 0) { mem.s = { slope: d.slope, R: d.R, n: d.n, lam: d.lam }; return false; }
        const a = mem.s;
        // 中心恰為亮點（2ne/λ ≈ 半整數）是 h3 的條件；這裡避開，兩個任務不會同一刻一起完成
        return !!a && d.e >= 100 && Math.abs(d.centre % 1 - 0.5) > 0.06 && d.R === a.R && near(d.n, a.n, 1e-6) && d.lam === a.lam && Math.abs(d.slope / a.slope - 1) <= 0.01;
      }
    },
    {
      // 同一個定律、兩種模式：空氣劈與牛頓環各量 ≥ 4 條暗紋，相鄰暗紋的厚度差（空氣劈 Δx·D/L、牛頓環 斜率/2R）相同（1.5% 內），λ、n 相同
      id: 'thin-film-h10', level: 10, hidden: true,
      riddle: { zh: '一條直，一圈圓；量到最後，兩者每一步都踩在同樣的高度。', en: 'One straight, one round; measured to the end, each of their steps climbs the same height.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!state(ev) || d.white || d.mys || !(d.nRec >= 4)) return false;
        if (d.mode === 'wedge' && isFinite(d.fitDx)) mem.w = { step: Math.abs(d.fitDx) * 1e-3 * d.D * 1e-6 / (d.L * 1e-2), lam: d.lam, n: d.n };
        else if (d.mode === 'newton' && isFinite(d.slope) && d.slope > 0) mem.n = { step: d.slope * 1e-6 / (2 * d.R), lam: d.lam, n: d.n };
        else return false;
        const w = mem.w, k = mem.n;
        return !!w && !!k && w.lam === k.lam && near(w.n, k.n, 1e-6) && Math.abs(k.step / w.step - 1) <= 0.015;
      }
    }
  ]);
})();
