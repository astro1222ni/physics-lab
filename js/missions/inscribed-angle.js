/* missions/inscribed-angle.js — 圓周角與圓冪的任務（星星數 = 等級 1–10；隱藏任務 × 2）
 * 事件（js/inscribed-angle.js 發出，都在使用者操作之後；挑戰中與看答案時不發 'ia'）：
 *   'ia'：拖完點、點畫布、按鍵、放開滑桿、切換模式或勾選之後。
 *     共同：{ src, mode（'ins' | 'quad' | 'pow'）, R }
 *     圓周角：{ a, b, p, insOK, showCen, showP2, pSpan（A、B 不動時 P 在同一段弧上走過的度數）,
 *               ins, arc（所對的弧＝圓心角）, side, PA, PB, eqPP（|PA − PB|／AB）, p2Other（P′ 在另一側） }
 *     內接四邊形：{ ts, qok, showDiag, ang[4], arcs[4], diagAng, harm, pitot, kite, poly4, poly5, poly7, par, rectDev }
 *     圓冪：{ Q, th1, th2, show2, showTan, power（OQ^2 − R^2）, OQ, where（'in' | 'on' | 'out'）, QT,
 *             L1、L2（第二條線沒開時是 null）：{ n（交點數）, d（圓心到線）, chord, near, far } }
 *   'guess'：挑戰交了答案。{ correct, streak, secs, last10（連續 10 題以上時最近 10 題的總秒數）, type }
 */
(function () {
  'use strict';
  if (!window.LabMission) return;

  const ins = function (ev) { return ev.type === 'ia' && ev.data.mode === 'ins' && ev.data.insOK; };
  const quad = function (ev) { return ev.type === 'ia' && ev.data.mode === 'quad' && ev.data.qok; };
  const pow = function (ev) { return ev.type === 'ia' && ev.data.mode === 'pow'; };
  const guess = function (ev) { return ev.type === 'guess' && ev.data.correct; };
  /** 圓冪模式裡看得到的線（第二條線沒開就只有第一條） */
  const lines = function (d) { return [d.L1, d.L2].filter(function (L) { return L; }); };
  const secant = function (L) { return L.n === 2; };

  LabMission.register('inscribed-angle', [
    {
      id: 'inscribed-angle-1', level: 1,
      title: { zh: '走著看，角不變', en: 'Walk and watch' },
      desc: { zh: 'A、B 不動，把 P 沿著圓在同一段弧上走至少 60°，看 ∠APB 有沒有變。', en: 'Keep A and B still and walk P at least 60° along the same arc. Does ∠APB change?' },
      check: function (ev) { return ins(ev) && ev.data.pSpan >= 60; }
    },
    {
      id: 'inscribed-angle-2', level: 2,
      title: { zh: '泰勒斯的直角', en: 'Thales’ right angle' },
      desc: { zh: '讓 AB 成為直徑，∠APB 就是 90°。', en: 'Make AB a diameter; then ∠APB is 90°.' },
      check: function (ev) { return ins(ev) && Math.abs(ev.data.arc - 180) <= 0.25; }
    },
    {
      id: 'inscribed-angle-3', level: 3,
      title: { zh: '大於平角的圓心角', en: 'A central angle beyond a straight line' },
      desc: { zh: '顯示圓心角，讓圓周角 ∠APB 至少 100°：這時它對的圓心角是超過 180° 的優角，仍然是兩倍。', en: 'Show the central angle and make ∠APB at least 100°: the central angle it stands on is now a reflex angle beyond 180°, still exactly twice as big.' },
      check: function (ev) { return ins(ev) && ev.data.showCen && ev.data.arc >= 200; }
    },
    {
      id: 'inscribed-angle-4', level: 3,
      title: { zh: '兩邊互補', en: 'Supplementary from both sides' },
      desc: { zh: '再放一點 P′，把它拖到 AB 的另一側：∠APB + ∠AP′B = 180°。', en: 'Add the second point P′ and drag it to the other side of AB: ∠APB + ∠AP′B = 180°.' },
      check: function (ev) { return ins(ev) && ev.data.p2Other; }
    },
    {
      id: 'inscribed-angle-5', level: 3,
      title: { zh: '長短不一，乘積一樣', en: 'Different lengths, same product' },
      desc: { zh: '在圓冪模式把 Q 放進圓裡，打開第二條線，讓兩條弦的長度至少差 2：QA·QB 和 QC·QD 還是一樣。', en: 'In Power of a point, put Q inside the circle and switch on line 2. Make the two chords differ in length by at least 2: QA · QB and QC · QD are still equal.' },
      check: function (ev) {
        const d = ev.data;
        return pow(ev) && d.where === 'in' && d.show2 && d.L1.n === 2 && d.L2.n === 2 && Math.abs(d.L1.chord - d.L2.chord) >= 2;
      }
    },
    {
      id: 'inscribed-angle-6', level: 4,
      title: { zh: '對角線十字', en: 'Crossed diagonals' },
      desc: { zh: '在內接四邊形模式，讓兩條對角線互相垂直（差 0.25° 以內）。', en: 'In Cyclic quadrilateral, make the two diagonals perpendicular (within 0.25°).' },
      // 對角線夾角 = 兩段對弧和的一半：AB 弧 + CD 弧 = 180°
      check: function (ev) { return quad(ev) && Math.abs(ev.data.diagAng - 90) <= 0.25; }
    },
    {
      id: 'inscribed-angle-7', level: 4,
      title: { zh: '圓裡只住等腰梯形', en: 'Only isosceles trapezoids fit' },
      desc: { zh: '做一個有一組對邊平行、但不是長方形的內接四邊形。它一定是等腰梯形。', en: 'Make a cyclic quadrilateral with one pair of parallel sides that is not a rectangle. It is always an isosceles trapezoid.' },
      // 一組對邊平行 ⇔ 夾在中間的兩段弧相等（差 0.25° 以內）；不是長方形：有角離 90° 超過 1°
      check: function (ev) { return quad(ev) && ev.data.par <= 0.25 && ev.data.rectDev > 1; }
    },
    {
      id: 'inscribed-angle-8', level: 4,
      title: { zh: '兩條割線', en: 'Two secants' },
      desc: { zh: '在圓冪模式把 Q 放到圓外，打開第二條線，讓兩條線都穿過圓：QA·QB = QC·QD。', en: 'In Power of a point, put Q outside the circle and switch on line 2 so that both lines cut the circle: QA · QB = QC · QD.' },
      check: function (ev) { const d = ev.data; return pow(ev) && d.where === 'out' && d.show2 && secant(d.L1) && secant(d.L2); }
    },
    {
      id: 'inscribed-angle-9', level: 5,
      title: { zh: '兩點合成一點', en: 'Two points become one' },
      desc: { zh: 'Q 在圓外，轉動一條線讓它剛好和圓相切（圓心到線的距離和半徑差不到 1%）：QA·QB 變成 QT^2。', en: 'With Q outside the circle, turn a line until it just touches the circle (distance from the centre within 1% of the radius): QA · QB becomes QT^2.' },
      check: function (ev) {
        const d = ev.data;
        return pow(ev) && d.where === 'out' && lines(d).some(function (L) { return Math.abs(L.d - d.R) <= 0.01 * d.R; });
      }
    },
    {
      id: 'inscribed-angle-10', level: 6,
      title: { zh: '定理在手', en: 'Theorems in hand' },
      desc: { zh: '挑戰連續答對 4 題。', en: 'Get 4 challenge problems right in a row.' },
      check: function (ev) { return guess(ev) && ev.data.streak >= 4; }
    },
    {
      id: 'inscribed-angle-11', level: 7,
      title: { zh: '圓的老手', en: 'Old hand at circles' },
      desc: { zh: '挑戰連續答對 8 題。', en: 'Get 8 challenge problems right in a row.' },
      check: function (ev) { return guess(ev) && ev.data.streak >= 8; }
    },
    {
      id: 'inscribed-angle-12', level: 9,
      title: { zh: '十題四分鐘', en: 'Ten in four minutes' },
      desc: { zh: '挑戰連續答對 10 題，而且最近 10 題加起來不到 240 秒。', en: 'Get 10 challenge problems right in a row, the last 10 taking under 240 seconds in total.' },
      check: function (ev) { return guess(ev) && ev.data.streak >= 10 && ev.data.last10 <= 240; }
    },

    // ---------------- 隱藏任務 ----------------
    {
      id: 'inscribed-angle-h1', level: 3, hidden: true,
      title: { zh: '三人同高', en: 'Three of a height' },
      desc: { zh: '圈上站著三個人，誰看另外兩個都是同樣的角度。', en: 'Three people stand on the ring, and each sees the other two under the same angle.' },
      // ∠APB = 60° 而且 PA = PB：△PAB 是正三角形（差 0.1°、|PA − PB| 不到 AB 的 0.4%）
      check: function (ev) { const d = ev.data; return ins(ev) && Math.abs(d.ins - 60) <= 0.1 && d.eqPP <= 0.004; }
    },
    {
      id: 'inscribed-angle-h2', level: 4, hidden: true,
      title: { zh: '四季一樣長', en: 'Four equal seasons' },
      desc: { zh: '一年分成四季，每一季一樣長。', en: 'A year in four seasons, each exactly as long as the others.' },
      // 四段弧都是 90°（差 0.3° 以內）：內接正方形
      check: function (ev) { return quad(ev) && ev.data.poly4 <= 0.3; }
    },
    {
      id: 'inscribed-angle-h3', level: 5, hidden: true,
      title: { zh: '向日葵的比', en: 'The sunflower’s ratio' },
      desc: { zh: '一位兩腰一樣長的角，頂角很尖或很鈍；它的腰和底，是向日葵與鸚鵡螺都知道的比。', en: 'Equal legs and a very sharp — or very blunt — apex; leg and base keep the ratio that sunflowers and nautilus shells know.' },
      // 黃金三角形：PA = PB，∠APB = 36°（腰／底 = φ）或 108°（底／腰 = φ）
      check: function (ev) { const d = ev.data; return ins(ev) && (Math.abs(d.ins - 36) <= 0.1 || Math.abs(d.ins - 108) <= 0.1) && d.eqPP <= 0.004; }
    },
    {
      id: 'inscribed-angle-h4', level: 5, hidden: true,
      title: { zh: '門外與屋裡', en: 'Outside the door, inside the room' },
      desc: { zh: '從門外走到擦過牆的那一點，和從屋子正中央走到牆，一樣遠；而且你真的擦過了牆。', en: 'From outside to the point where you graze the wall is just as far as from the middle of the room to the wall — and you really do graze it.' },
      // 切線長 QT = R ⇔ OQ = √2·R（差 0.3%），而且有一條線和圓相切（差 1%）
      check: function (ev) {
        const d = ev.data;
        return pow(ev) && d.where === 'out' && Math.abs(d.OQ / (Math.SQRT2 * d.R) - 1) <= 0.003 && lines(d).some(function (L) { return Math.abs(L.d - d.R) <= 0.01 * d.R; });
      }
    },
    {
      id: 'inscribed-angle-h5', level: 6, hidden: true,
      title: { zh: '穿心而過', en: 'Straight through the heart' },
      desc: { zh: '一條路直直穿過圓心；站在路上的人，到圓的距離剛好等於圓的半徑。回頭看兩道擦邊的視線，夾著正三角形的一角。', en: 'A road runs straight through the centre; the walker on it is exactly one radius away from the circle. Look back: the two grazing sight lines hold one corner of an equilateral triangle.' },
      // 一條割線通過圓心（圓心距不到 1% R），Q 到近交點 = R（差 0.5%）⇔ OQ = 2R，兩條切線夾 60°
      check: function (ev) {
        const d = ev.data;
        return pow(ev) && d.where === 'out' && lines(d).some(function (L) { return secant(L) && L.d <= 0.01 * d.R && Math.abs(L.near / d.R - 1) <= 0.005; });
      }
    },
    {
      id: 'inscribed-angle-h6', level: 7, hidden: true,
      title: { zh: '少了一個角的星', en: 'A star missing a point' },
      desc: { zh: '一顆五角星少了一個角，剩下的四個仍然記得自己是誰。', en: 'A five-pointed star has lost one point; the other four still remember who they are.' },
      // 四個頂點都是正五邊形的頂點：四段弧都是 72° 的倍數（差 0.3° 以內）
      check: function (ev) { return quad(ev) && ev.data.poly5 <= 0.3; }
    },
    {
      id: 'inscribed-angle-h7', level: 7, hidden: true,
      title: { zh: '黃金零頭', en: 'A golden remainder' },
      desc: { zh: '切進圓裡的那一段，和只擦過圓的那一條一樣長；留在外面的一截，就成了黃金的零頭。', en: 'The piece that cuts into the circle is as long as the line that only grazes it; the part left outside becomes a golden remainder.' },
      // Q 在圓外，某條割線的弦長 AB = 切線長 QT（差 0.05%）：QT^2 = QA·QB 與 AB = QT 推得 QB／QA = φ^2
      check: function (ev) {
        const d = ev.data;
        return pow(ev) && d.where === 'out' && lines(d).some(function (L) { return secant(L) && Math.abs(L.chord / d.QT - 1) <= 0.0005; });
      }
    },
    {
      id: 'inscribed-angle-h8', level: 8, hidden: true,
      title: { zh: '和諧的對邊', en: 'Harmonious opposites' },
      desc: { zh: '兩組對邊各自相乘，得到一樣的數；它卻不是風箏。', en: 'Multiply each pair of opposite sides and you get the same number — yet it is no kite.' },
      // 調和四邊形 AB·CD = BC·DA（相對差 0.2%），排除箏形（相鄰邊相對差至少 3%）
      check: function (ev) { const d = ev.data; return quad(ev) && Math.abs(d.harm) <= 0.002 && d.kite >= 0.03; }
    },
    {
      id: 'inscribed-angle-h9', level: 9, hidden: true,
      title: { zh: '被抱著也抱著', en: 'Held and holding' },
      desc: { zh: '它被一個圓抱著，自己也抱著另一個圓；它卻不是風箏。', en: 'It is held by one circle and holds another inside itself — yet it is no kite.' },
      // 雙心四邊形：皮托 AB + CD = BC + DA（相對差 0.05%）⇔ 有內切圓；排除箏形
      check: function (ev) { const d = ev.data; return quad(ev) && Math.abs(d.pitot) <= 0.0005 && d.kite >= 0.03; }
    },
    {
      id: 'inscribed-angle-h10', level: 10, hidden: true,
      title: { zh: '畫不出來的那位', en: 'The one that cannot be drawn' },
      desc: { zh: '高斯證明了尺規畫不出它；它還是借了你四個角。', en: 'Gauss proved that ruler and compass cannot draw it; still, it lends you four of its corners.' },
      // 四個頂點都是正七邊形的頂點：四段弧都是 360°／7 的倍數（差 0.15° 以內，要用方向鍵微調）
      check: function (ev) { return quad(ev) && ev.data.poly7 <= 0.15; }
    }
  ]);
})();
