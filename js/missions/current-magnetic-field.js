/* missions/current-magnetic-field.js — 電流的磁效應的任務（星星數 = 等級 1–10） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  // 事件（js/current-magnetic-field.js 回報）：
  //   'needle'：厄斯特實驗中，使用者改了設定、磁針停穩時
  //     { I（真實電流 A）, Im（電流表讀數 A）, s（±1）, above, r（鉛直距離 cm）, alpha（導線方位 deg）, d（側移 cm）, earth, loc,
  //       BH, BIh, Bnet（μT）, thetaEq（平衡方向 deg）, theta（磁針實際方向 deg）, read（刻度盤讀數 deg，東為正）, mode ('ideal'|'real'), rest, period }
  //   'record'：按「記錄」成功
  //     厄斯特：{ kind: 'oersted', row: { I（電流表）, s, above, r, alpha, d, theta（讀數）, tan, BI, BH（μT）, mode, loc, earth }, rows, ana }
  //       ana = tangentAnalysis：{ n, nI, nR, rRatio, BH（T，B導線 對 tan θ 的斜率）, err, pairs, nPair, BHpair, errPair }
  //     探測點：{ kind: 'probe', row: { shape, I, s, N, R, L（cm）, x, y（cm）, B, formula, axis（μT）, diff }, rows }
  //   'clear'：全部清除
  const aligned = function (r) { return Math.abs(r.alpha) < 0.5 && Math.abs(r.d) < 0.05; };
  const oerRows = function (ev) { return ev.type === 'record' && ev.data.kind === 'oersted' ? ev.data.rows || [] : null; };
  const probeRow = function (ev, shape) { return ev.type === 'record' && ev.data.kind === 'probe' && ev.data.row.shape === shape ? ev.data.row : null; };
  const sameShape = function (a, b) { return a.shape === b.shape && a.N === b.N && Math.abs((a.R || 0) - (b.R || 0)) < 1e-6 && Math.abs((a.L || 0) - (b.L || 0)) < 1e-6 && Math.abs(a.I - b.I) < 0.005; };
  const atCentre = function (r) { return Math.abs(r.x) <= 0.05 && Math.abs(r.y) <= 0.05; };
  const onAxis = function (r) { return Math.abs(r.y) <= 0.005; };
  // 同一地點、導線南北向、磁針在正上方或正下方、地磁沒關掉
  const goodRows = function (rows) { return rows.length > 0 && rows.every(function (r) { return aligned(r) && r.earth && r.loc === rows[0].loc; }); };

  LabMission.register('current-magnetic-field', [
    {
      id: 'current-magnetic-field-1', level: 1,
      title: { zh: '磁針動了！', en: 'The needle moved!' },
      desc: { zh: '厄斯特實驗：導線南北向、在磁針正上方或正下方，通電讓磁針停在偏轉至少 10° 的地方。', en: 'Ørsted’s experiment: with the wire north–south, directly above or below the needle, pass a current so the needle comes to rest at least 10° off.' },
      check: function (ev) { const d = ev.data; return ev.type === 'needle' && d.earth && d.I > 0 && aligned(d) && Math.abs(d.read) >= 10; }
    },
    {
      id: 'current-magnetic-field-2', level: 2,
      title: { zh: '繞著導線走一圈', en: 'Walk around the wire' },
      desc: { zh: '長直導線：用同一個電流記錄兩筆，探測點到導線的距離相同（至少 1 cm，相差 0.05 cm 內），但方向至少相隔 90°。磁場大小一樣嗎？方向呢？', en: 'Long straight wire: at one current, record two rows at the same distance from the wire (at least 1 cm, within 0.05 cm of each other) but at least 90° apart around it. Is the size the same? And the direction?' },
      check: function (ev) {
        const a = probeRow(ev, 'wire');
        if (!a) return false;
        const ra = Math.hypot(a.x, a.y);
        if (ra < 1) return false;
        return (ev.data.rows || []).some(function (b) {
          if (b === a || b.shape !== 'wire' || Math.abs(b.I - a.I) >= 0.005) return false;
          const rb = Math.hypot(b.x, b.y);
          if (Math.abs(ra - rb) > 0.05) return false;
          const c = (a.x * b.x + a.y * b.y) / (ra * rb);
          return c <= Math.cos(Math.PI / 2) + 1e-9;
        });
      }
    },
    {
      id: 'current-magnetic-field-3', level: 3,
      title: { zh: '上下顛倒', en: 'Upside down' },
      desc: { zh: '同樣的電流（大小與方向都相同）、同樣的距離 r：導線在磁針上方與下方各做一次（南北向、正上方或正下方），兩次停穩的偏角一樣大（至少 5°，相差 0.3° 內）、方向相反。', en: 'With the same current (size and direction) and the same distance r, put the wire above the needle and then below it (north–south, directly above or below). The two deflections at rest are equal in size (at least 5°, within 0.3°) and opposite in direction.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'needle' || !d.earth || !(d.I > 0) || !aligned(d)) return false;
        const key = d.I.toFixed(3) + '|' + d.s + '|' + d.r.toFixed(2) + '|' + d.loc + '|' + d.mode;
        mem.m = mem.m || {};
        const e = mem.m[key] = mem.m[key] || {};
        e[d.above ? 'a' : 'b'] = d.read;
        return e.a != null && e.b != null && Math.abs(e.a) >= 5 && Math.abs(e.a + e.b) <= 0.3;
      }
    },
    {
      id: 'current-magnetic-field-4', level: 4,
      title: { zh: '剛好 45°', en: 'Exactly 45°' },
      desc: { zh: '導線南北向、在磁針正上方或正下方，調電流讓磁針停在 45°（誤差 0.3° 內）。這時導線的磁場和地磁的水平分量有什麼關係？', en: 'With the wire north–south, directly above or below the needle, adjust the current until the needle rests at 45° (within 0.3°). How does the wire’s field then compare with the horizontal part of the Earth’s field?' },
      check: function (ev) { const d = ev.data; return ev.type === 'needle' && d.earth && d.I > 0 && aligned(d) && Math.abs(Math.abs(d.read) - 45) <= 0.3; }
    },
    {
      id: 'current-magnetic-field-5', level: 5,
      title: { zh: '量出地磁', en: 'Measure the Earth’s field' },
      desc: { zh: '用正切法記錄至少 3 筆（至少 2 種電流；導線都南北向、在磁針正上方或正下方、同一個地點），讓「B導線 對 tan θ」的斜率和地磁模型相差 3% 以內。', en: 'Using the tangent method, record at least 3 rows (at least 2 different currents; the wire always north–south, directly above or below, at one place) so that the slope of B(wire) against tan θ is within 3% of the model value.' },
      check: function (ev) {
        const rows = oerRows(ev), A = ev.data.ana;
        return !!rows && goodRows(rows) && A.n >= 3 && A.nI >= 2 && Math.abs(A.err) <= 0.03;
      }
    },
    {
      id: 'current-magnetic-field-6', level: 5,
      title: { zh: '線圈中心 1 mT', en: '1 mT at the centre' },
      desc: { zh: '圓線圈：選好匝數、半徑與電流，讓線圈中心的磁場是 1.00 mT（誤差 1% 內），把探測點放在中心並記錄。', en: 'Circular coil: choose the number of turns, the radius and the current so that the field at the centre is 1.00 mT (within 1%); put the probe at the centre and record.' },
      check: function (ev) { const r = probeRow(ev, 'coil'); return !!r && atCentre(r) && Math.abs(r.B - 1000) <= 10; }
    },
    {
      id: 'current-magnetic-field-7', level: 6,
      title: { zh: '距離加倍', en: 'Double the distance' },
      desc: { zh: '正切法：同一個電流記錄兩筆，導線到磁針的距離剛好相差 2 倍（1% 內），而且兩筆的 tan θ 也剛好相差 2 倍（3% 內）。', en: 'Tangent method: at one current, record two rows whose wire–needle distances differ by a factor of 2 (within 1%) and whose tan θ also differ by a factor of 2 (within 3%).' },
      check: function (ev) {
        const rows = oerRows(ev);
        if (!rows) return false;
        const a = ev.data.row;
        if (!aligned(a) || !a.earth) return false;
        return rows.some(function (b) {
          if (b === a || !aligned(b) || !b.earth || b.loc !== a.loc || Math.abs(a.I - b.I) > 0.005) return false;
          const near = a.r < b.r ? a : b, far = a.r < b.r ? b : a;
          return Math.abs(far.r / near.r - 2) <= 0.02 && Math.abs(near.tan / far.tan - 2) <= 0.06;
        });
      }
    },
    {
      id: 'current-magnetic-field-8', level: 6,
      title: { zh: '接近理想的螺線管', en: 'Nearly ideal' },
      desc: { zh: '螺線管：把探測點放在正中央並記錄，量到的磁場和理想螺線管的 μ0nI 相差 1% 以內。要怎麼設計螺線管的長度和半徑？', en: 'Solenoid: put the probe at the very centre and record a field within 1% of the ideal value μ0nI. How should you choose the length and the radius?' },
      check: function (ev) { const r = probeRow(ev, 'solenoid'); return !!r && atCentre(r) && r.formula > 0 && Math.abs(r.B / r.formula - 1) <= 0.01; }
    },
    {
      id: 'current-magnetic-field-9', level: 7,
      title: { zh: '剩下一半', en: 'Down to half' },
      desc: { zh: '圓線圈：在軸上記錄兩筆（同一個線圈與電流）：一筆在中心，另一筆在軸上磁場剛好剩中心一半的地方（1% 內）。這個點離中心幾個半徑？', en: 'Circular coil: record two rows on the axis (same coil and current): one at the centre and one where the field is exactly half of that (within 1%). How many radii from the centre is that point?' },
      check: function (ev) {
        const a = probeRow(ev, 'coil');
        if (!a || !onAxis(a)) return false;
        return (ev.data.rows || []).some(function (b) {
          if (b === a || b.shape !== 'coil' || !onAxis(b) || !sameShape(a, b)) return false;
          const c = atCentre(a) ? a : atCentre(b) ? b : null, o = c === a ? b : a;
          return !!c && Math.abs(o.x) >= 0.5 && Math.abs(o.B / c.B - 0.5) <= 0.005;
        });
      }
    },
    {
      id: 'current-magnetic-field-10', level: 8,
      title: { zh: '管口的磁場', en: 'Field at the mouth' },
      desc: { zh: '螺線管：在軸上記錄兩筆（同一個螺線管與電流）：一筆在中央，一筆剛好在管口（x = ±L/2），讓管口的磁場是中央的 0.495～0.505 倍。', en: 'Solenoid: record two rows on the axis (same solenoid and current): one at the centre and one exactly at an end (x = ±L/2), so that the field at the end is 0.495–0.505 of the field at the centre.' },
      check: function (ev) {
        const a = probeRow(ev, 'solenoid');
        if (!a || !onAxis(a)) return false;
        return (ev.data.rows || []).some(function (b) {
          if (b === a || b.shape !== 'solenoid' || !onAxis(b) || !sameShape(a, b)) return false;
          const c = atCentre(a) ? a : atCentre(b) ? b : null, o = c === a ? b : a;
          if (!c || Math.abs(Math.abs(o.x) - o.L / 2) > 0.006) return false;
          const q = o.B / c.B;
          return q >= 0.495 && q <= 0.505;
        });
      }
    },
    {
      id: 'current-magnetic-field-11', level: 9,
      title: { zh: '正反向平均', en: 'Forward and back' },
      desc: { zh: '換成「含誤差」的儀器（不必先歸零）：在兩種以上的電流各記錄一組「正向＋反向」（同電流、同距離、同上下位置），用正反向平均求出的地磁和模型相差 1.5% 以內。', en: 'Switch to the instruments “with errors” (no need to zero first). At two or more currents, record a forward-and-reverse pair (same current, distance and position), so that the pair-averaged Earth’s field is within 1.5% of the model.' },
      check: function (ev) {
        const rows = oerRows(ev), A = ev.data.ana;
        if (!rows || !goodRows(rows) || !rows.every(function (r) { return r.mode === 'real'; })) return false;
        const Is = {};
        A.pairs.forEach(function (p) { Is[p.I.toFixed(2)] = 1; });
        return A.nPair >= 2 && Object.keys(Is).length >= 2 && Math.abs(A.errPair) <= 0.015;
      }
    },
    {
      id: 'current-magnetic-field-12', level: 10,
      title: { zh: '完整的正切法實驗', en: 'The full tangent method' },
      desc: { zh: '「含誤差」的儀器：先在不通電時轉動刻度盤，讓停穩的磁針讀數在 ±0.1° 內；再記錄至少 6 筆（至少 3 種電流、正反向都有、兩種距離相差至少 2 倍），全部數據的斜率和地磁模型相差 1% 以內。', en: 'Instruments “with errors”: first, with no current, turn the dial until the needle at rest reads within ±0.1°; then record at least 6 rows (at least 3 currents, both directions, two distances at least a factor of 2 apart) so that the slope of all the data is within 1% of the model.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type === 'needle' && d.mode === 'real' && d.earth && !(d.I > 0) && Math.abs(d.read) <= 0.1) { mem.zeroed = true; return false; }
        const rows = oerRows(ev), A = d.ana;
        if (!rows || !mem.zeroed || !goodRows(rows) || !rows.every(function (r) { return r.mode === 'real'; })) return false;
        const dirs = {};
        rows.forEach(function (r) { dirs[r.s] = 1; });
        return A.n >= 6 && A.nI >= 3 && A.rRatio >= 2 - 1e-9 && Object.keys(dirs).length === 2 && Math.abs(A.err) <= 0.01;
      }
    },
    // ---------- 隱藏任務：只給隱晦的提示 ----------
    {
      id: 'current-magnetic-field-h1', level: 4, hidden: true,
      riddle: { zh: '放下了大地的牽引，它才轉向心之所向。', en: 'Freed from the pull of the Earth, it finally turns where its heart points.' },
      check: function (ev) { const d = ev.data; return ev.type === 'needle' && !d.earth && d.I > 0 && Math.abs(Math.abs(d.read) - 90) <= 0.5; }
    },
    {
      id: 'current-magnetic-field-h2', level: 6, hidden: true,
      riddle: { zh: '當北方不再是北方。', en: 'When north is no longer north.' },
      check: function (ev) { const d = ev.data; return ev.type === 'needle' && d.earth && d.I > 0 && Math.abs(d.theta) >= 179 && Math.abs(d.thetaEq) >= 179; }
    },
    {
      id: 'current-magnetic-field-h3', level: 7, hidden: true,
      riddle: { zh: '門內風雨，門外無聲。', en: 'A storm inside the door; silence outside.' },
      check: function (ev) {
        const r = probeRow(ev, 'solenoid');
        return !!r && r.I > 0 && Math.abs(r.x) <= r.L / 4 && Math.abs(r.y) >= r.R + 0.5 && r.formula > 0 && r.B <= 0.01 * r.formula;
      }
    }
  ]);
})();
