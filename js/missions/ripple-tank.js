/* missions/ripple-tank.js — 水波槽實驗的任務（星星數 = 等級 1–10） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  const rel = function (a, b) { return Math.abs(a / b - 1); };
  const isRec = function (ev, part) { return ev.type === 'record' && ev.data.part === part; };
  const span = function (arr) { return arr.length ? Math.max.apply(null, arr) - Math.min.apply(null, arr) : 0; };

  LabMission.register('ripple-tank', [
    {
      id: 'ripple-tank-1', level: 1,
      title: { zh: '讓波停下來', en: 'Stop the waves' },
      desc: { zh: '打開直線起波器與閃頻儀，把閃頻儀的頻率調到和起波器相同，讓白紙上的亮紋看起來靜止不動。', en: 'With the straight generator running, switch on the stroboscope and set its frequency equal to the generator’s so that the bright bands on the paper stand still.' },
      check: function (ev) { const d = ev.data; return ev.type === 'strobe' && d.strobe && d.gen && d.src === 'bar' && d.frozen && d.frozenN === 1; }
    },
    {
      id: 'ripple-tank-2', level: 2,
      title: { zh: '第一次量波長', en: 'Your first wavelength' },
      desc: { zh: '在「架設與波長」中用直尺跨過幾條亮紋，記錄的紙上波長 λ′ 與真實值相差 3% 以內。', en: 'In “Set-up & λ”, lay the ruler across several bright bands and record a paper wavelength λ′ within 3% of the true value.' },
      check: function (ev) { const d = ev.data; return isRec(ev, 1) && d.col === 'lam' && d.row.lp > 0 && rel(d.row.lp, d.truePaperLam) <= 0.03; }
    },
    {
      id: 'ripple-tank-3', level: 3,
      title: { zh: '水波有多快', en: 'How fast is a ripple?' },
      desc: { zh: '在條紋被閃頻儀定住時，用直尺跨過至少 5 個波長記錄，由 v = fλ 算出的波速與理論值相差 2% 以內。', en: 'While the stroboscope holds the bands still, record with the ruler spanning at least 5 wavelengths; the speed from v = fλ must be within 2% of the accepted value.' },
      check: function (ev) { const d = ev.data; return isRec(ev, 1) && d.frozen && d.row.N >= 5 && d.vMeas > 0 && rel(d.vMeas, d.trueV) <= 0.02; }
    },
    {
      id: 'ripple-tank-4', level: 3,
      title: { zh: '調水平', en: 'Level the tank' },
      desc: { zh: '選「含誤差」，調整兩個螺絲，讓水平儀的氣泡回到中央（槽底傾斜小於 0.03°）。', en: 'Choose “With errors” and turn the two screws until the spirit-level bubble is centred (tilt below 0.03°).' },
      check: function (ev) { const d = ev.data; return ev.type === 'level' && d.mode === 'real' && d.tilt < 0.03; }
    },
    {
      id: 'ripple-tank-5', level: 4,
      title: { zh: '反射定律', en: 'The law of reflection' },
      desc: { zh: '在「反射」中用直條障礙物，在至少 3 個不同的角度（最大與最小相差 20° 以上）各記錄一組入射角與反射角，每組 θi 都量得準（與障礙物角度相差 2° 以內），而且 |θr − θi| ≤ 2.5°。', en: 'In “Reflection”, use the straight block at three or more angles (largest and smallest at least 20° apart). For each, record θi and θr; each θi must be accurate (within 2° of the block angle) and |θr − θi| ≤ 2.5°.' },
      check: function (ev) {
        const d = ev.data;
        if (!isRec(ev, 2)) return false;
        const rows = d.table.filter(function (r) {
          return r.ti != null && r.tr != null && r.b_ti != null && r.b_ti === r.b_tr && Math.abs(r.ti - r.b_ti) <= 2 && Math.abs(r.tr - r.ti) <= 2.5;
        });
        return rows.length >= 3 && span(rows.map(function (r) { return r.b_ti; })) >= 20;
      }
    },
    {
      id: 'ripple-tank-6', level: 4,
      title: { zh: '凹面的焦點', en: 'Focus of a concave barrier' },
      desc: { zh: '用半徑 R ≥ 14 cm 的凹弧反射直線波，把直尺的一端放在凹弧的頂點、另一端放在反射波會聚的地方。量到的焦距與 R/2 比較看看。', en: 'Reflect straight waves from a concave arc with R ≥ 14 cm. Put one end of the ruler on the vertex of the arc and the other where the reflected waves converge. Compare the focal length with R/2.' },
      check: function (ev) {
        const d = ev.data;
        if (ev.type !== 'ruler' || d.part !== 2 || d.shape !== 'concave' || d.src !== 'bar' || !d.gen || d.R < 0.1399 || !d.vertex) return false;
        const V = d.vertex, f = d.R / 2;
        const ok = function (P, Q) {
          if (Math.hypot(P.x - V.x, P.y - V.y) > 0.008) return false;
          const along = V.x - Q.x, side = Math.abs(Q.y - V.y);
          return side <= 0.008 && along >= 0.8 * f && along <= 1.1 * f;
        };
        return ok(d.A, d.B) || ok(d.B, d.A);
      }
    },
    {
      id: 'ripple-tank-7', level: 5,
      title: { zh: '從焦點出發', en: 'Start from the focus' },
      desc: { zh: '把一個點波源放在凹弧的焦點上（與 R/2 處相差 6 mm 以內）。反射後的波會變成什麼形狀？', en: 'Place a single dipper at the focus of the concave arc (within 6 mm of the point R/2 from the vertex). What shape do the reflected waves take?' },
      check: function (ev) { const d = ev.data; return ev.type === 'config' && d.part === 2 && d.shape === 'concave' && d.src === 'point' && d.gen && d.focusDist != null && d.focusDist <= 0.006; }
    },
    {
      id: 'ripple-tank-8', level: 6,
      title: { zh: '淺水裡的波長', en: 'Wavelength in shallow water' },
      desc: { zh: '在「折射」中記錄深水的 λ1′ 與淺水的 λ2′（直尺各跨過至少 4 個波長），λ2′/λ1′ 與理論的 v2/v1 相差 2% 以內。', en: 'In “Refraction”, record λ1′ in deep water and λ2′ over the plate (the ruler spanning at least 4 wavelengths each time) so that λ2′/λ1′ is within 2% of the accepted v2/v1.' },
      check: function (ev) {
        const d = ev.data, r = d.row;
        return isRec(ev, 3) && r.l1 > 0 && r.l2 > 0 && r.l1N >= 4 && r.l2N >= 4 && d.fit && d.fit.ratio > 0 && rel(r.l2 / r.l1, d.fit.ratio) <= 0.02;
      }
    },
    {
      id: 'ripple-tank-9', level: 7,
      title: { zh: '司乃耳定律', en: 'Snell’s law' },
      desc: { zh: '在「折射」中把薄壓克力板轉到至少 3 個不同角度（相差 20° 以上），各記錄一組 θ1、θ2（θ1 量得準：與板的角度相差 2° 以內）。sinθ2 對 sinθ1 的斜率與 v2/v1 相差 4% 以內。', en: 'In “Refraction”, turn the plate to three or more angles (spanning at least 20°) and record θ1 and θ2 for each (θ1 accurate to within 2° of the plate angle). The slope of sinθ2 against sinθ1 must be within 4% of v2/v1.' },
      check: function (ev) {
        const d = ev.data;
        if (!isRec(ev, 3) || !d.fit || !(d.fit.slope > 0) || !(d.fit.ratio > 0)) return false;
        const rows = d.table.filter(function (r) { return r.t1 != null && r.t2 != null && Math.abs(r.t1 - r.alpha) <= 2 && r.alpha >= 5; });
        const all = d.table.filter(function (r) { return r.t1 != null && r.t2 != null; });
        return rows.length >= 3 && rows.length === all.length && span(rows.map(function (r) { return r.alpha; })) >= 20 && rel(d.fit.slope, d.fit.ratio) <= 0.04;
      }
    },
    {
      id: 'ripple-tank-10', level: 7,
      title: { zh: '繞射的兩個極端', en: 'Two extremes of diffraction' },
      desc: { zh: '在「繞射」中用狹縫記錄兩組縫寬 a′ 與波長 λ′（各自與真實值相差 5% 以內）：一組 λ/a ≥ 1、另一組 λ/a ≤ 0.5。比較兩次波穿過狹縫後散開的程度。', en: 'In “Diffraction”, record the slit width a′ and wavelength λ′ twice (each within 5% of the true value): once with λ/a ≥ 1 and once with λ/a ≤ 0.5. Compare how much the waves spread out after the slit.' },
      check: function (ev) {
        const d = ev.data;
        if (!isRec(ev, 4)) return false;
        const good = d.table.filter(function (r) { return r.a > 0 && r.lam > 0 && r.aTrue > 0 && rel(r.a, r.aTrue) <= 0.05 && rel(r.lam, r.lamTrue) <= 0.05; });
        return good.some(function (r) { return r.lam / r.a >= 1; }) && good.some(function (r) { return r.lam / r.a <= 0.5; });
      }
    },
    {
      id: 'ripple-tank-11', level: 8,
      title: { zh: '第三條以外的節線', en: 'Beyond the third nodal line' },
      desc: { zh: '在「干涉」中把探針 P 放在第 3 條或更外面的節線上（|PS1 − PS2| 與 (n − ½)λ 相差不超過 0.08λ，n ≥ 3）並記錄。', en: 'In “Interference”, place the probe P on the third nodal line or one further out (|PS1 − PS2| within 0.08λ of (n − ½)λ with n ≥ 3) and record it.' },
      check: function (ev) {
        const d = ev.data;
        if (!isRec(ev, 5) || d.row.type !== 'node' || d.trueOrder == null) return false;
        const n = Math.round(d.trueOrder + 0.5);
        return n >= 3 && Math.abs(d.trueOrder - (n - 0.5)) <= 0.08;
      }
    },
    {
      id: 'ripple-tank-12', level: 9,
      title: { zh: '真正的實驗室', en: 'A real laboratory' },
      desc: { zh: '選「含誤差」與點光源：先調水平，用閃頻儀（不是旋鈕刻度）定出頻率，直尺跨過至少 5 個波長，自己算出放大率 M 輸入（誤差 2% 以內）。記錄後算出的波速與理論值相差 3% 以內。', en: 'Choose “With errors” and the point lamp. Level the tank, find the frequency with the stroboscope (not the dial), span at least 5 wavelengths, and work out and enter the magnification M yourself (within 2%). The speed you record must be within 3% of the accepted value.' },
      check: function (ev) {
        const d = ev.data, r = d.row;
        return isRec(ev, 1) && d.mode === 'real' && d.light === 'point' && r.fsrc === 'strobe' && d.frozen && d.frozenN === 1 &&
          r.N >= 5 && rel(d.Muser, d.M) <= 0.02 && d.vMeas > 0 && rel(d.vMeas, d.trueV) <= 0.03;
      }
    },
    {
      id: 'ripple-tank-13', level: 10,
      title: { zh: '用干涉量波長', en: 'Wavelength from interference' },
      desc: { zh: '在「干涉」中先記錄波長，再把探針 P 放在至少 3 條不同級數的節線上記錄（其中一條是第 3 條或更外面；每點 |PS1 − PS2| 與 (n − ½)λ 相差不超過 0.1λ）。分析圖中直線的斜率（由干涉得到的 λ′）要與真實的紙上波長相差 2% 以內。', en: 'In “Interference”, record the wavelength first, then record the probe P on nodal lines of at least three different orders (one of them the third line or further out; each |PS1 − PS2| within 0.1λ of (n − ½)λ). The slope of the line in the graph (λ′ from interference) must be within 2% of the true paper wavelength.' },
      check: function (ev) {
        const d = ev.data;
        if (!isRec(ev, 5) || !d.fit || !(d.fit.slope > 0) || !(d.truePaperLam > 0)) return false;
        const orders = {};
        d.table.forEach(function (r) {
          if (r.type !== 'node' || r.trueOrder == null) return;
          const n = Math.round(r.trueOrder + 0.5);
          if (n >= 1 && Math.abs(r.trueOrder - (n - 0.5)) <= 0.1) orders[n] = true;
        });
        const ns = Object.keys(orders).map(Number);
        return ns.length >= 3 && Math.max.apply(null, ns) >= 3 && rel(d.fit.slope, d.truePaperLam) <= 0.02;
      }
    },
    {
      id: 'ripple-tank-h1', level: 3, hidden: true,
      riddle: { zh: '眨眼慢了一拍，又慢了一拍；浪花卻以為你從來沒有移開視線。', en: 'Your blinking slows by a beat, and by another; yet the ripples believe you never looked away.' },
      check: function (ev) { const d = ev.data; return ev.type === 'strobe' && d.strobe && d.gen && d.frozen && d.frozenN >= 2; }
    },
    {
      id: 'ripple-tank-h2', level: 5, hidden: true,
      riddle: { zh: '當目光比浪還急，浪便沿著來時的路，慢慢走回家。', en: 'When the eye is quicker than the wave, the wave slowly walks home along the way it came.' },
      // 11/12 收緊：先在同一個起波頻率下把條紋定住（fs = f），再刻意把閃頻調高一點，看條紋倒退。
      // 原本只看 fs − f，把閃頻往 f 調的途中（任務 1 的必經過程）放開滑桿就會順手完成。
      check: function (ev, mem) {
        const d = ev.data;
        if ((ev.type !== 'strobe' && ev.type !== 'config') || !d.strobe || !d.gen) return false;
        if (d.frozen && d.frozenN === 1) { mem.f0 = d.f; return false; }
        const g = d.fs - d.f;
        return mem.f0 != null && Math.abs(d.f - mem.f0) < 1e-6 && g >= 0.05 && g <= 0.6;
      }
    },
    {
      id: 'ripple-tank-h3', level: 7, hidden: true,
      riddle: { zh: '比一步還短的石頭，攔不住遠行的人；回頭看，連影子都沒有留下。', en: 'A stone shorter than a single stride cannot stop the traveller; look back, and it has left no shadow at all.' },
      check: function (ev) { const d = ev.data; return ev.type === 'config' && d.part === 4 && d.diff === 'obstacle' && d.gen && d.obsL <= 0.6 * d.lam1; }
    }
  ]);
})();
