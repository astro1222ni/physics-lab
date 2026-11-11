/* missions/hydrogen-spectrum.js — 氫原子能階與光譜的任務（星星數 = 等級 1–10） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  // 事件（js/hydrogen-spectrum.js 回報）：
  //   'emit'：電子往下躍遷放出光子 { from（Infinity = 自由電子被捕獲）, to, E (eV), lambda (nm 真空), name, series, region,
  //           visible, source: 'tap' | 'recomb', K（復合時的電子動能）, lines（發射光譜上累積的譜線 'ni-nf'） }
  //   'absorb'：原子吸收光子往上躍遷 { from, to, E, lambda, source: 'tap'（點能階自動射入）| 'gun'（自己設定的光子）, miss }
  //   'ionize'：光子把原子游離 { from, E, lambda, K（電子動能）, source }
  //   'pass'：光子沒被吸收、直接穿過 { from（Infinity = 只剩質子）, bare, E, lambda, visible, source }
  //   'discharge'：放電管每 0.5 秒回報 { K（撞擊電子的動能 eV）, imp, exc, ph, counts: { 'ni-nf': 光子數 }, top }（改變 K 會重新計數）
  //   'absorption'：白光吸收模式的氣體狀態 { hot }
  //   'reset'：全部清除
  // 這裡不能用 HydrogenCore（排行榜頁只載入任務檔），常數直接寫出：
  const RY = 13.598287264287025;            // 氫原子游離能（eV，含約化質量修正）
  const gap = function (a, b) { return RY * (1 / (a * a) - 1 / (b * b)); };
  const H_ALPHA = 656.4696;                 // nm（真空）
  const chainBreak = function (ev) { return ev.type === 'absorb' || ev.type === 'ionize' || ev.type === 'reset'; };

  LabMission.register('hydrogen-spectrum', [
    {
      id: 'hydrogen-spectrum-1', level: 1,
      title: { zh: '第一道紅光', en: 'The first red light' },
      desc: { zh: '讓電子由 n = 3 掉到 n = 2，放出巴耳末系的紅色譜線 Hα（656 nm）。', en: 'Make the electron fall from n = 3 to n = 2 and emit the red Balmer line Hα (656 nm).' },
      check: function (ev) { return ev.type === 'emit' && ev.data.from === 3 && ev.data.to === 2; }
    },
    {
      id: 'hydrogen-spectrum-2', level: 2,
      title: { zh: '冷氫氣的祕密', en: 'The secret of cool hydrogen' },
      desc: { zh: '在「白光吸收」模式中先看冷氫氣的光譜，再換成熱氫氣，讓可見光區出現暗線。', en: 'In “White light” mode, look at the spectrum of cool hydrogen first, then switch to hot hydrogen so that dark lines appear in the visible part.' },
      check: function (ev, mem) {
        if (ev.type !== 'absorption') return false;
        if (!ev.data.hot) { mem.cold = true; return false; }
        return !!mem.cold;
      }
    },
    {
      id: 'hydrogen-spectrum-3', level: 3,
      title: { zh: '一階一階走下樓', en: 'Down the stairs, one step at a time' },
      desc: { zh: '讓電子從 n = 4 依序掉到 n = 3、n = 2、n = 1，連續放出三個光子（中間不做其他躍遷）。三個光子的能量加起來是多少？', en: 'Starting from n = 4, make the electron fall to n = 3, then n = 2, then n = 1, emitting three photons in a row (no other jumps in between). What do the three energies add up to?' },
      check: function (ev, mem) {
        if (chainBreak(ev)) { mem.step = 0; return false; }
        if (ev.type !== 'emit') return false;
        const d = ev.data;
        if (d.from === 4 && d.to === 3) { mem.step = 1; return false; }
        if (d.from === 3 && d.to === 2 && mem.step === 1) { mem.step = 2; return false; }
        if (d.from === 2 && d.to === 1 && mem.step === 2) return true;
        mem.step = 0;
        return false;
      }
    },
    {
      id: 'hydrogen-spectrum-4', level: 3,
      title: { zh: '巴耳末的四種顏色', en: 'The four colours of Balmer' },
      desc: { zh: '在「單一原子」模式中收集四條可見光的巴耳末線：Hα、Hβ、Hγ、Hδ 都出現在發射光譜上。', en: 'In one-atom mode, collect the four visible Balmer lines: Hα, Hβ, Hγ and Hδ must all appear in the emission spectrum.' },
      check: function (ev) {
        if (ev.type !== 'emit') return false;
        const l = ev.data.lines || [];
        return ['3-2', '4-2', '5-2', '6-2'].every(function (k) { return l.indexOf(k) >= 0; });
      }
    },
    {
      id: 'hydrogen-spectrum-5', level: 4,
      title: { zh: '看不見的放電管', en: 'The invisible glow' },
      desc: { zh: '在「放電管」模式中選一個電子能量，讓管子只放出一種光子（來曼 α），並累積至少 200 個光子。想一想：為什麼管子看起來是暗的？', en: 'In discharge-tube mode, choose an electron energy so that the tube emits only one kind of photon (Lyman α), and collect at least 200 photons. Why does the tube look dark?' },
      check: function (ev) {
        if (ev.type !== 'discharge') return false;
        const k = Object.keys(ev.data.counts || {});
        return ev.data.ph >= 200 && k.length === 1 && k[0] === '2-1';
      }
    },
    {
      id: 'hydrogen-spectrum-6', level: 4,
      title: { zh: '精準射擊', en: 'A precise shot' },
      desc: { zh: '用「射入光子」自己設定能量或波長，讓基態（n = 1）的電子吸收光子後剛好停在 n = 4。', en: 'With “Fire a photon”, set the energy or wavelength yourself so that an electron in the ground state (n = 1) absorbs the photon and lands exactly on n = 4.' },
      check: function (ev) { const d = ev.data; return ev.type === 'absorb' && d.source === 'gun' && d.from === 1 && d.to === 4; }
    },
    {
      id: 'hydrogen-spectrum-7', level: 5,
      title: { zh: '剛好掙脫', en: 'Just enough to escape' },
      desc: { zh: '用自己設定的光子把基態的氫原子游離，而且電子掙脫後的動能小於 0.01 eV。', en: 'Ionise a ground-state hydrogen atom with a photon you set yourself, leaving the freed electron with less than 0.01 eV of kinetic energy.' },
      check: function (ev) { const d = ev.data; return ev.type === 'ionize' && d.source === 'gun' && d.from === 1 && d.K < 0.01; }
    },
    {
      id: 'hydrogen-spectrum-8', level: 5,
      title: { zh: '同一種光，不同的命運', en: 'Same light, different fates' },
      desc: { zh: '射出一個可見光光子，讓它穿過基態的原子；再讓同一波長（相差 0.5 nm 以內）的光子被 n = 2 的原子吸收。', en: 'Fire a visible photon that passes straight through a ground-state atom; then get a photon of the same wavelength (within 0.5 nm) absorbed by an atom in n = 2.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type === 'pass' && d.from === 1 && d.visible) { mem.lam = d.lambda; return false; }
        return ev.type === 'absorb' && d.source === 'gun' && d.from === 2 && mem.lam != null && Math.abs(d.lambda - mem.lam) <= 0.5;
      }
    },
    {
      id: 'hydrogen-spectrum-9', level: 6,
      title: { zh: '紅光的門檻', en: 'The threshold of red' },
      desc: { zh: '在放電管中找出 Hα 剛好開始出現的電子能量：在比門檻高不到 0.03 eV 的能量下，看到 Hα 的光子。', en: 'In the discharge tube, find the electron energy at which Hα just begins to appear: see Hα photons at an energy less than 0.03 eV above the threshold.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'discharge' && (d.counts || {})['3-2'] > 0 && d.K < gap(1, 3) + 0.03;
      }
    },
    {
      id: 'hydrogen-spectrum-10', level: 7,
      title: { zh: '紫光剛出現', en: 'Violet just appears' },
      desc: { zh: '在放電管中讓四條可見光巴耳末線 Hα、Hβ、Hγ、Hδ 都出現，但電子的能量不足以把原子激發到 n = 7。', en: 'In the discharge tube, get all four visible Balmer lines Hα, Hβ, Hγ and Hδ, while the electrons do not have enough energy to excite any atom to n = 7.' },
      check: function (ev) {
        const d = ev.data, c = d.counts || {};
        return ev.type === 'discharge' && d.K < gap(1, 7) && ['3-2', '4-2', '5-2', '6-2'].every(function (k) { return c[k] > 0; });
      }
    },
    {
      id: 'hydrogen-spectrum-11', level: 9,
      title: { zh: '徒手爬樓梯', en: 'Climbing the ladder by hand' },
      desc: { zh: '只用自己設定的光子，讓電子從 n = 1 一階一階爬到 n = 7（1→2→3→4→5→6→7），途中不能放出光子或做其他躍遷。', en: 'Using only photons you set yourself, raise the electron from n = 1 to n = 7 one level at a time (1→2→3→4→5→6→7), with no emission or other jump on the way.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type === 'pass') return false; // 沒打中不算犯規
        if (ev.type === 'absorb' && d.source === 'gun' && d.to === d.from + 1) {
          if (d.from === 1) mem.step = 2;
          else if (mem.step === d.from) mem.step = d.to;
          else mem.step = 0;
          return mem.step === 7;
        }
        mem.step = 0;
        return false;
      }
    },
    {
      id: 'hydrogen-spectrum-12', level: 10,
      title: { zh: '捕獲的紅光', en: 'Red light from a capture' },
      desc: { zh: '讓質子捕獲自由電子時放出的光子，波長和 Hα 相同（相差 0.5 nm 以內）。提示：先決定電子要被捕獲到哪一層，再算出它需要多少動能。', en: 'Make the photon emitted when the proton captures a free electron have the same wavelength as Hα (within 0.5 nm). Hint: first decide which level the electron will be captured into, then work out how much kinetic energy it needs.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'emit' && d.source === 'recomb' && Math.abs(d.lambda - H_ALPHA) <= 0.5;
      }
    },
    // ---------- 隱藏任務：只給隱晦的提示 ----------
    {
      id: 'hydrogen-spectrum-h1', level: 3, hidden: true,
      riddle: { zh: '主人遠行的屋子，訪客穿堂而過。', en: 'The master has gone away; the visitor walks straight through the hall.' },
      check: function (ev) { return ev.type === 'pass' && !!ev.data.bare; }
    },
    {
      id: 'hydrogen-spectrum-h2', level: 4, hidden: true,
      riddle: { zh: '收下的信，原封不動地退回。', en: 'A letter accepted, then returned unopened.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type === 'pass') return false;
        if (ev.type === 'absorb' && d.source === 'gun') { mem.pair = [d.from, d.to]; return false; }
        const ok = ev.type === 'emit' && mem.pair && d.from === mem.pair[1] && d.to === mem.pair[0];
        mem.pair = null;
        return !!ok;
      }
    },
    {
      id: 'hydrogen-spectrum-h3', level: 6, hidden: true,
      riddle: { zh: '千軍萬馬奔過，原野依舊漆黑。', en: 'A thousand riders gallop past, and the plain stays dark.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'discharge' && d.K < gap(1, 2) && d.imp >= 1000 && d.ph === 0;
      }
    }
  ]);
})();
