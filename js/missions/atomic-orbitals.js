/* missions/atomic-orbitals.js — 原子軌域的形狀的任務（星星數 = 等級 1–10；隱藏任務 = 等級 × 2） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  // 事件（js/atomic-orbitals.js 只在使用者操作之後回報；每個事件都帶完整狀態）：
  //   共同欄位：{ id（'2pz'）, n, l, key, Z, sum, plane, off, disp, blank, v3, style, pct, cut, nodes3, plane3, seen, pinned（'1s@1'）,
  //              cur, cum, P, nodes, hits, rMax, quiz（測驗題目還沒揭曉） }
  //   'state'：選軌域、原子、副層加總、切面、切面位置、顯示方式
  //   'cursor'：徑向分布圖的游標；'probe'：2D 探針 { px, py, pz, pr, theta, rel, sign }；'pin'：保留曲線
  //   'view3d'：3D 開啟；'opts3d'：3D 選項
  //   'quiz'：認軌域核對 { hit, exact, ql, qn, qkey, streak, exactStreak }
  const D = function (ev) { return ev && ev.data ? ev.data : null; };
  const is = function (ev, type) { return ev.type === type && !!ev.data; };
  const near = function (a, b, tol) { return Math.abs(a - b) <= tol; };
  const has = function (d, list) { return list.every(function (x) { return d.pinned.indexOf(x) >= 0; }); };
  // d 軌域四片花瓣所在的平面
  const LEAF = { dxy: 'xy', dxz: 'xz', dyz: 'yz', dx2y2: 'xy' };
  const MAGIC = Math.acos(1 / Math.sqrt(3)) * 180 / Math.PI;   // 54.7356°

  LabMission.register('atomic-orbitals', [
    {
      id: 'atomic-orbitals-1', level: 1,
      title: { zh: '立體的電子雲', en: 'The cloud in 3D' },
      desc: { zh: '按「3D 立體」，把電子雲轉一圈看看。', en: 'Press “3D view” and turn the electron cloud around.' },
      check: function (ev) { return ev.type === 'view3d'; }
    },
    {
      id: 'atomic-orbitals-2', level: 2,
      title: { zh: '三個方向的啞鈴', en: 'Dumbbells in three directions' },
      desc: { zh: '選 n = 2 的 p 副層，把 px、py、pz 三個軌域都看過一次。', en: 'Choose the p subshell with n = 2 and look at all three orbitals px, py and pz.' },
      check: function (ev) { const d = D(ev); return !!d && ['2px', '2py', '2pz'].every(function (k) { return d.seen.indexOf(k) >= 0; }); }
    },
    {
      id: 'atomic-orbitals-3', level: 3,
      title: { zh: '一層包一層', en: 'Shell inside shell' },
      desc: { zh: '在「3D 立體」選一個 n ≥ 2 的 s 軌域，勾選「切開一角」，看見裡面的球殼。', en: 'In the “3D view”, choose an s orbital with n ≥ 2 and tick “Cut away a corner” to see the shells inside.' },
      check: function (ev) { const d = D(ev); return !!d && d.v3 && d.cut && d.l === 0 && d.n >= 2 && !d.sum && d.style !== 'cloud'; }
    },
    {
      id: 'atomic-orbitals-4', level: 3,
      title: { zh: '四葉草', en: 'Four-leaf clover' },
      desc: { zh: '選一個 dz² 以外的 d 軌域，把 2D 切面放在它四片花瓣所在的平面上（切面通過原子核）。', en: 'Choose a d orbital other than dz² and put the 2D slice in the plane of its four lobes (through the nucleus).' },
      check: function (ev) { const d = D(ev); return !!d && !d.sum && d.l === 2 && LEAF[d.key] === d.plane && Math.abs(d.off) <= 0.3; }
    },
    {
      id: 'atomic-orbitals-5', level: 4,
      title: { zh: '一片空白', en: 'Completely blank' },
      desc: { zh: '把 2D 切面放在某個軌域的角節面上，讓整片切面一點電子雲都沒有。', en: 'Put the 2D slice exactly on an angular node of an orbital, so that the whole slice is empty.' },
      check: function (ev) { const d = D(ev); return is(ev, 'state') && d.blank; }
    },
    {
      id: 'atomic-orbitals-6', level: 4,
      title: { zh: '波耳半徑', en: 'The Bohr radius' },
      desc: { zh: '選氫原子（H）的 1s，在徑向分布圖上把游標移到曲線最高點（誤差 2% 以內）。', en: 'Choose 1s of hydrogen (H) and move the cursor on the radial distribution to the top of the curve (within 2%).' },
      check: function (ev) { const d = D(ev); return is(ev, 'cursor') && d.id === '1s' && d.Z === 1 && near(d.cur, 1, 0.02); }
    },
    {
      id: 'atomic-orbitals-7', level: 5,
      title: { zh: '一半的機會', en: 'A fifty-fifty chance' },
      desc: { zh: '在任一個軌域的徑向分布圖上，找到電子出現在它以內的機率剛好是 50%（±0.5%）的半徑。', en: 'For any orbital, find the radius inside which the electron is found with a probability of exactly 50% (±0.5%).' },
      check: function (ev) { const d = D(ev); return is(ev, 'cursor') && near(d.cum, 0.5, 0.005); }
    },
    {
      id: 'atomic-orbitals-8', level: 5,
      title: { zh: '越來越大', en: 'Bigger and bigger' },
      desc: { zh: '用「保留這條曲線」把同一個原子的 1s、2s、3s 徑向分布畫在一起比較。', en: 'Use “Keep this curve” to draw the radial distributions of 1s, 2s and 3s of the same atom together.' },
      check: function (ev) { const d = D(ev); return is(ev, 'pin') && [1, 2, 3].some(function (z) { return has(d, ['1s@' + z, '2s@' + z, '3s@' + z]); }); }
    },
    {
      id: 'atomic-orbitals-9', level: 6,
      title: { zh: '認出軌域', en: 'Name it' },
      desc: { zh: '在認軌域卡片按「開始」，答對一題（n 與副層都對）。', en: 'In the orbital quiz card, press “Start” and get one right (both n and the subshell).' },
      check: function (ev) { const d = D(ev); return is(ev, 'quiz') && d.hit; }
    },
    {
      id: 'atomic-orbitals-10', level: 7,
      title: { zh: '縮小的離子', en: 'A shrunken ion' },
      desc: { zh: '選 He+ 的 1s，把游標移到它的最可能半徑（誤差 2% 以內）。', en: 'Choose 1s of He+ and move the cursor to its most probable radius (within 2%).' },
      check: function (ev) { const d = D(ev); return is(ev, 'cursor') && d.id === '1s' && d.Z === 2 && near(d.cur, 0.5, 0.01); }
    },
    {
      id: 'atomic-orbitals-11', level: 8,
      title: { zh: '找到兩道牆', en: 'Both walls' },
      desc: { zh: '選氫原子的 3s，把徑向分布圖的游標分別移到它的兩個徑向節面上（各在 0.05 個波耳半徑以內）。', en: 'Choose 3s of hydrogen and move the cursor onto each of its two radial nodes (each within 0.05 Bohr radius).' },
      check: function (ev) { const d = D(ev); return is(ev, 'cursor') && d.id === '3s' && d.Z === 1 && d.hits.length === 2 && d.hits[0] && d.hits[1]; }
    },
    {
      id: 'atomic-orbitals-12', level: 9,
      title: { zh: '軌域辨識高手', en: 'Orbital expert' },
      desc: { zh: '在認軌域卡片按「開始」，連續答對 5 題。', en: 'In the orbital quiz card, press “Start” and get 5 in a row right.' },
      check: function (ev) { const d = D(ev); return is(ev, 'quiz') && d.hit && d.streak >= 5; }
    },
    {
      id: 'atomic-orbitals-h1', level: 3, hidden: true,
      riddle: { zh: '伸手碰一碰，啞鈴腰間的那枚戒指。', en: 'Reach out and touch the ring around the dumbbell’s waist.' },
      // dz²（任何 n）在 xy 切面、通過原子核，探針點在中間那圈環上：ψ < 0，密度至少是環最濃處的 60%
      // （環上 Y² 是軸上的 1/4，所以環最濃處 = 全空間最大值的 25%，門檻 0.15）
      check: function (ev) { const d = D(ev); return is(ev, 'probe') && !d.sum && d.key === 'dz2' && d.plane === 'xy' && Math.abs(d.off) <= 0.2 && d.sign < 0 && d.rel >= 0.15; }
    },
    {
      id: 'atomic-orbitals-h2', level: 4, hidden: true,
      riddle: { zh: '同一層樓的三間房，租金一樣，格局不同。', en: 'Three rooms on the same floor: the same rent, different layouts.' },
      // 保留同一個原子的 3s、3p、3d：氫原子中同一個 n 能量相同（簡併）
      check: function (ev) { const d = D(ev); return is(ev, 'pin') && [1, 2, 3].some(function (z) { return has(d, ['3s@' + z, '3p@' + z, '3d@' + z]); }); }
    },
    {
      id: 'atomic-orbitals-h3', level: 5, hidden: true,
      riddle: { zh: '一個人留下的縫隙，兄弟們疊起來就補滿了。', en: 'The gap one leaves behind, the brothers fill when stacked together.' },
      // d 或 f 軌域：探針放在它的角節面上（|Y| ≤ 最大值的 5%），再勾「整個副層加總」，那裡的密度變成至少最大值的 30%
      // （副層加總是球形，Unsöld 定理：單一軌域的節面被兄弟們補滿）
      check: function (ev) { const d = D(ev); return is(ev, 'state') && d.sum && d.l >= 2 && d.pAng != null && d.pAng <= 0.05 && d.pRel >= 0.3; }
    },
    {
      id: 'atomic-orbitals-h4', level: 6, hidden: true,
      riddle: { zh: '最擁擠的地方，最難遇見你。', en: 'Where it is most crowded, you are hardest to meet.' },
      // 1s：探針放在密度最大處（原子核附近，≥ 95%，約 r ≤ 0.026 a0），同時游標在 r ≤ 0.05：密度最大、徑向分布卻是 0
      check: function (ev) { const d = D(ev); return is(ev, 'probe') && d.id === '1s' && !d.sum && d.rel >= 0.95 && d.cur <= 0.05; }
    },
    {
      id: 'atomic-orbitals-h5', level: 7, hidden: true,
      riddle: { zh: '甜筒的邊緣，一片寂靜。', en: 'Silence along the rim of the cone.' },
      // dz² 的圓錐節面：探針與 z 軸夾 54.74°（或 125.26°）±0.6°，離原子核至少 2 a0
      check: function (ev) {
        const d = D(ev);
        return is(ev, 'probe') && !d.sum && d.key === 'dz2' && d.pr >= 2 && (near(d.theta, MAGIC, 0.6) || near(d.theta, 180 - MAGIC, 0.6));
      }
    },
    {
      id: 'atomic-orbitals-h6', level: 7, hidden: true,
      riddle: { zh: '住在外頭的人，也常溜進城堡的中心。', en: 'One who lives outside still slips into the heart of the castle.' },
      // 保留 2s 與 2p，在 2s 的內層小峰（(3 − √5) a0／Z）放游標：穿透效應
      check: function (ev) {
        const d = D(ev);
        return is(ev, 'cursor') && d.id === '2s' && has(d, ['2s@' + d.Z, '2p@' + d.Z]) && near(d.cur, (3 - Math.sqrt(5)) / d.Z, 0.04 / d.Z);
      }
    },
    {
      id: 'atomic-orbitals-h7', level: 8, hidden: true,
      riddle: { zh: '築一道牆，十回只讓你逃出一回。', en: 'Build a wall that lets you escape only one time in ten.' },
      // 1s：累積機率 90%（±0.2%），r = 2.66 a0／Z
      check: function (ev) { const d = D(ev); return is(ev, 'cursor') && d.id === '1s' && near(d.cum, 0.9, 0.002); }
    },
    {
      id: 'atomic-orbitals-h8', level: 8, hidden: true,
      riddle: { zh: '核心更強，那道看不見的牆就退到一半。', en: 'With a stronger heart, the invisible wall retreats halfway.' },
      // He+ 的 2s：徑向節面在 1 a0（氫是 2 a0）
      check: function (ev) { const d = D(ev); return is(ev, 'cursor') && d.id === '2s' && d.Z === 2 && near(d.cur, 1, 0.02); }
    },
    {
      id: 'atomic-orbitals-h9', level: 9, hidden: true,
      riddle: { zh: '七胞胎裡的一個，被你認了出來。', en: 'You recognised one of the septuplets.' },
      // 認軌域答對一個 f 軌域
      check: function (ev) { const d = D(ev); return is(ev, 'quiz') && d.hit && d.ql === 3; }
    },
    {
      id: 'atomic-orbitals-h10', level: 10, hidden: true,
      riddle: { zh: '不只姓氏，連名字與方向，三次都沒認錯。', en: 'Not just the family name — the given name and the direction too, three times without a slip.' },
      // 認軌域連續 3 題連哪一個軌域都答對
      check: function (ev) { const d = D(ev); return is(ev, 'quiz') && d.exact && d.exactStreak >= 3; }
    }
  ]);
})();
