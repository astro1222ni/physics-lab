/* missions/photoelectric.js — 光電效應的任務（星星數 = 等級 1–10） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  // 事件（js/photoelectric.js 回報）：
  //   'change'：滑桿放開、輸入數值、選金屬或自動掃描結束後
  //     { key: 'lambda'|'P'|'V'|'metal', base: {…改變前的同樣欄位…},
  //       metal, phi (eV), lambda (nm), f (Hz), E (eV), P (μW), V (V), I (A), Isat (A), Kmax (eV), Vs (V),
  //       emits, zero（電流表讀 0）, collected（I/I_sat）, f0 (Hz) }
  //   'stop'：成功記錄一個停止電壓（電流剛好歸零的電壓）
  //     { …同上…, Vs（測得值）, VsTrue（理論值）, records: [{ metal, lambda, f, Pu, Vs, VsTrue }],
  //       fits: { 金屬: { n, nf（不同頻率數）, fit: { slope, h, f0, phi, span } | null, f0True } } }
  //   'reset'：全部清除
  const H = 6.62607015e-34;
  const rel = function (a, b, r) { return Math.abs(a - b) <= r * Math.abs(b); };
  const remember = function (mem, d, n) { (mem.list = mem.list || []).push(d); if (mem.list.length > (n || 24)) mem.list.shift(); return mem.list; };
  const sat = function (d) { return d.emits && d.P > 0 && !d.zero && d.collected >= 0.998; };
  const goodFits = function (d) {
    const out = [];
    Object.keys(d.fits || {}).forEach(function (id) {
      const x = d.fits[id];
      if (x && x.fit && x.nf >= 3) out.push({ id: id, x: x, hErr: x.fit.h / H - 1, f0Err: x.fit.f0 / x.f0True - 1 });
    });
    return out;
  };

  LabMission.register('photoelectric', [
    {
      id: 'photoelectric-1', level: 1,
      title: { zh: '越過門檻', en: 'Over the threshold' },
      desc: { zh: '先讓光電子消失（波長調長一點），再只調整波長，讓光電子重新射出來。', en: 'First make the photoelectrons disappear (use a longer wavelength), then change only the wavelength so that photoelectrons are emitted again.' },
      check: function (ev) {
        const d = ev.data, b = d.base;
        return ev.type === 'change' && d.key === 'lambda' && b && !b.emits && d.emits && b.metal === d.metal && d.P > 0 && b.P > 0;
      }
    },
    {
      id: 'photoelectric-2', level: 2,
      title: { zh: '再亮也沒用', en: 'Brighter is no use' },
      desc: { zh: '在沒有光電子的波長下，把光的強度調到最大（100 μW），確認仍然一個電子也沒有。', en: 'At a wavelength that gives no photoelectrons, turn the intensity up to the maximum (100 μW) and confirm that there is still not a single electron.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'change' && d.key === 'P' && d.P >= 100 - 1e-9 && !d.emits;
      }
    },
    {
      id: 'photoelectric-3', level: 3,
      title: { zh: '擋住所有電子', en: 'Stop them all' },
      desc: { zh: '把電壓往負的方向調，找到電流剛好歸零的電壓，按「記錄停止電壓」。', en: 'Make the voltage more and more negative, find the voltage where the current just becomes zero and press “Record stopping voltage”.' },
      check: function (ev) { return ev.type === 'stop'; }
    },
    {
      id: 'photoelectric-4', level: 4,
      title: { zh: '三倍電流', en: 'Three times the current' },
      desc: { zh: '在減速電壓下（V < 0、仍有電流），波長、金屬與電壓都不變，只改變光的強度一次，讓電流剛好變成 3 倍（誤差 1% 內）。', en: 'With a retarding voltage (V < 0, current still flowing) and the same wavelength, metal and voltage, change only the intensity in one step so that the current becomes exactly 3 times as large (within 1%).' },
      check: function (ev) {
        const d = ev.data, b = d.base;
        if (ev.type !== 'change' || d.key !== 'P' || !b) return false;
        return d.V < 0 && b.V === d.V && b.lambda === d.lambda && b.metal === d.metal && !b.zero && b.I > 0 && rel(d.I / b.I, 3, 0.01);
      }
    },
    {
      id: 'photoelectric-5', level: 5,
      title: { zh: '亮度不改變動能', en: 'Brightness doesn’t speed them up' },
      desc: { zh: '同一種金屬、同一個波長，在兩種光強度（相差至少 3 倍）下各記錄一次停止電壓，兩者相同（差 0.02 V 內）。', en: 'With the same metal and wavelength, record the stopping voltage at two intensities at least 3 times apart; the two values agree (within 0.02 V).' },
      check: function (ev) {
        if (ev.type !== 'stop') return false;
        const r = ev.data.records || [];
        return r.some(function (a) {
          return r.some(function (b) {
            return a !== b && a.metal === b.metal && a.lambda === b.lambda && a.Pu > 0 && b.Pu >= 3 * a.Pu && Math.abs(a.Vs - b.Vs) <= 0.02;
          });
        });
      }
    },
    {
      id: 'photoelectric-6', level: 6,
      title: { zh: '剛好跨過門檻', en: 'Right on the edge' },
      desc: { zh: '任選一種金屬，調整波長，讓光電子剛好能射出：最大動能大於 0 但小於 0.005 eV。', en: 'With any metal, adjust the wavelength so that photoelectrons only just get out: the maximum kinetic energy is above 0 but below 0.005 eV.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'change' && d.emits && d.P > 0 && d.Kmax > 0 && d.Kmax < 0.005;
      }
    },
    {
      id: 'photoelectric-7', level: 6,
      title: { zh: '鋅的 2.00 V', en: 'Zinc at 2.00 V' },
      desc: { zh: '用鋅當陰極，選一個波長，量到並記錄 2.00 V 的停止電壓（誤差 ±0.02 V）。', en: 'With a zinc cathode, choose a wavelength so that the stopping voltage you measure and record is 2.00 V (±0.02 V).' },
      check: function (ev) { const d = ev.data; return ev.type === 'stop' && d.metal === 'Zn' && Math.abs(d.Vs - 2) <= 0.02; }
    },
    {
      id: 'photoelectric-8', level: 7,
      title: { zh: '同樣的功率，較少的光子', en: 'Same power, fewer photons' },
      desc: { zh: '同一種金屬、光強度相同，在兩個不同波長下讓電流都達到飽和（至少 99.8% 的光電子到達陽極），使兩個飽和電流的比剛好是 3 : 2（誤差 1% 內）。', en: 'With the same metal and the same intensity, saturate the current at two different wavelengths (at least 99.8% of the photoelectrons reach the anode) so that the two saturation currents are exactly in the ratio 3 : 2 (within 1%).' },
      check: function (ev, mem) {
        if (ev.type !== 'change' || !sat(ev.data)) return false;
        const d = ev.data;
        return remember(mem, d).some(function (o) {
          return o !== d && o.metal === d.metal && Math.abs(o.P - d.P) < 1e-9 && Math.abs(o.lambda - d.lambda) > 1e-6 &&
            rel(Math.max(o.I, d.I) / Math.min(o.I, d.I), 1.5, 0.01);
        });
      }
    },
    {
      id: 'photoelectric-9', level: 8,
      title: { zh: '測量普朗克常數', en: 'Measure Planck’s constant' },
      desc: { zh: '同一種金屬，在至少 3 個不同頻率記錄停止電壓（最高與最低頻率相差至少 4 × 10^14 Hz），讓密立坎圖斜率算出的 h 與公認值相差 2% 以內。', en: 'For one metal, record stopping voltages at 3 or more different frequencies (highest and lowest at least 4 × 10^14 Hz apart) so that the h from the Millikan slope is within 2% of the accepted value.' },
      check: function (ev) {
        return ev.type === 'stop' && goodFits(ev.data).some(function (g) { return g.x.fit.span >= 4e14 && Math.abs(g.hErr) <= 0.02; });
      }
    },
    {
      id: 'photoelectric-10', level: 9,
      title: { zh: '不同金屬，同一停止電壓', en: 'Different metals, same stopping voltage' },
      desc: { zh: '記錄兩種不同金屬的停止電壓，兩者都至少 1 V，且理論停止電壓相差不到 0.01 V。想一想：兩個波長的光子能量差了多少？', en: 'Record stopping voltages for two different metals, both at least 1 V, whose theoretical stopping voltages differ by less than 0.01 V. Think: how far apart are the two photon energies?' },
      check: function (ev) {
        if (ev.type !== 'stop') return false;
        const r = ev.data.records || [];
        return r.some(function (a) {
          return r.some(function (b) {
            return a !== b && a.metal !== b.metal && a.VsTrue >= 1 && b.VsTrue >= 1 && Math.abs(a.VsTrue - b.VsTrue) < 0.01;
          });
        });
      }
    },
    {
      id: 'photoelectric-11', level: 10,
      title: { zh: '大師：三條平行線', en: 'Master: three parallel lines' },
      desc: { zh: '為至少 3 種金屬各記錄至少 3 個不同頻率的停止電壓，每一條最佳直線算出的 h 與截止頻率 f0 都要與公認值相差 1.5% 以內。', en: 'For at least 3 metals, record stopping voltages at 3 or more different frequencies each; for every best-fit line, both h and the threshold frequency f0 must be within 1.5% of the accepted values.' },
      check: function (ev) {
        if (ev.type !== 'stop') return false;
        return goodFits(ev.data).filter(function (g) { return Math.abs(g.hErr) <= 0.015 && Math.abs(g.f0Err) <= 0.015; }).length >= 3;
      }
    },
    // ---------- 隱藏任務：只給隱晦的提示 ----------
    {
      id: 'photoelectric-h1', level: 4, hidden: true,
      riddle: { zh: '門已敞開，遠行的旅人卻在半途轉身。', en: 'The gate stands open, yet the far travellers turn back halfway.' },
      check: function (ev) { const d = ev.data; return ev.type === 'change' && d.emits && d.P > 0 && d.Kmax >= 3 && d.zero; }
    },
    {
      id: 'photoelectric-h2', level: 6, hidden: true,
      riddle: { zh: '付給門檻的，與帶走的，一樣多。', en: 'What is paid at the threshold equals what is carried away.' },
      check: function (ev) { const d = ev.data; return ev.type === 'change' && d.emits && d.P > 0 && Math.abs(d.Kmax - d.phi) <= 0.005; }
    },
    {
      id: 'photoelectric-h3', level: 8, hidden: true,
      riddle: { zh: '兩種顏色，落下同樣大的雨。', en: 'Two colours, and the same rain falls.' },
      check: function (ev, mem) {
        if (ev.type !== 'change' || !sat(ev.data)) return false;
        const d = ev.data;
        return remember(mem, d).some(function (o) {
          return o !== d && o.metal === d.metal && Math.abs(o.lambda - d.lambda) >= 100 && Math.abs(o.P - d.P) >= 5 && rel(o.I, d.I, 0.005);
        });
      }
    }
  ]);
})();
