/* missions/current-balance.js — 電流天平的任務（星星數 = 等級 1–10） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  // 自學事件一次只判一個里程碑；上課示範、還原與非本實驗事件一律不領星。
  function studyTask(n, level, title, titleEn, desc, descEn, act, seg, test) {
    return {id:'current-balance-'+n,level,study:true,title:{zh:title,en:titleEn},desc:{zh:desc,en:descEn},
      check(e){const d=e.data||{};return e.type==='study'&&d.module==='current-balance'&&d.userAction===true&&!d.teaching&&!d.restoring&&d.act===act&&d.seg===seg&&!!test(d);}};
  }
  function taskDefinitions() {
    const finite=(v)=>Number.isFinite(v), first=d=>d.firstCorrect===2;
    return [
      studyTask(14,1,'一粒米的疑問','A grain-sized question','看過 Kibble 天平照片，再放上一粒米。','Inspect the Kibble balance photograph, then place one grain.','intro-completed',1,d=>d.photoSeen&&d.riceSeen),
      studyTask(15,2,'先猜再說','Predict first','兩題預測都送出，答案稍後揭曉。','Submit both predictions before revealing answers.','predictions-submitted',2,d=>d.submitted===2),
      studyTask(16,3,'神準預言家','Perfect predictions','兩題預測第一次都答對，再揭曉。','Get both predictions right on the first attempt, then reveal.','predictions-perfect',2,d=>first(d)&&d.revealed),
      studyTask(17,3,'觀念五連','Five connected ideas','看完五張觀念卡，實際打開 3D 右手開掌。','Inspect all five concept cards, including the 3D right hand.','concepts-completed',3,d=>d.cardsSeen===5&&d.handSeen),
      studyTask(18,4,'歸零','Zero the balance','動手實驗時不通電、不掛物，歸零並停穩。','In the hands-on section, zero the unloaded balance with power off and let it settle.','zero-completed',4,d=>!d.power&&!d.hung&&d.rest&&d.level&&finite(d.zeroOff)&&Math.abs(d.zeroOff)<.8),
      studyTask(19,5,'第一筆數據','Your first measurement','第 4 段平衡後記錄第一筆自己的數據。','Record your first balanced measurement in Section 4.','first-recorded',4,d=>d.ownN>=1&&d.recorded&&d.rest&&d.level&&!d.given),
      studyTask(20,6,'五筆數據','Five measured masses','實驗一固定 I1，量五筆、五種質量。','In Part 1, keep I1 fixed and measure five different masses.','five-recorded',4,d=>d.n>=5&&d.distinctM>=5&&finite(d.I1spread)&&d.I1spread<=.011&&!d.given),
      studyTask(21,6,'量出 μ0','Measure μ0','由自己的五筆斜率求 μ0，誤差小於 5%。','Use the slope of your own five rows to find μ0 within 5%.','mu-calculated',4,d=>d.n>=5&&d.distinctM>=5&&finite(d.err)&&Math.abs(d.err)<.05&&finite(d.answerErr)&&Math.abs(d.answerErr)<.05),
      studyTask(22,4,'對答案','Compare your answer','比對自己的 μ0，並揭曉兩題預測。','Compare your measured μ0 and reveal both predictions.','answer-compared',5,d=>d.n>=5&&d.submitted===2&&d.revealed&&finite(d.mu0)&&d.mu0>0),
      studyTask(23,5,'真實的螺線管','The real solenoid','比較長螺線管與真實管口的力矩差異。','Compare the long-solenoid and real-mouth torque models.','models-compared',5,d=>d.idealSeen&&d.realSeen&&finite(d.ratio)&&d.ratio>=.88&&d.ratio<=.94),
      studyTask(24,4,'範例一','Example one','算線長，再在原實驗平衡、記錄、驗算。','Calculate wire length, balance it, record and verify in the real simulation.','example-one-checked',6,d=>d.example===1&&d.ownRecord&&d.balanced&&finite(d.lengthError)&&d.lengthError<.1),
      studyTask(25,5,'範例二','Example two','把雙曲線改畫成直線，再由斜率求 μ0。','Transform the hyperbola into a straight line and find μ0 from its slope.','example-two-checked',6,d=>d.example===2&&d.linear&&finite(d.err)&&Math.abs(d.err)<.05),
      studyTask(26,6,'範例三','Example three','由給定資料判斷不為零的截距來自未歸零。','Identify an unzeroed balance as the cause of the nonzero intercept.','example-three-checked',6,d=>d.example===3&&d.cause==='zero'&&finite(d.intercept)&&Math.abs(d.intercept)>.0003),
      studyTask(27,4,'隨堂全對','Three correct answers','隨堂三題全答對，可以重答。','Answer all three quick checks correctly; retries are allowed.','quiz-correct',7,d=>d.correct===3),
      studyTask(28,7,'一次全對','Perfect first attempt','隨堂三題第一次就全答對。','Answer all three quick checks correctly on the first attempt.','quiz-perfect',7,d=>d.firstCorrect===3),
      studyTask(29,5,'我量出的 μ0','My measured μ0','用自己的五筆做成果圖卡，成功分享或存圖。','Create a card from your own five rows and share or save it.','card-exported',8,d=>d.n>=5&&d.distinctM>=5&&d.exported===true&&['download','share'].includes(d.method)),
      studyTask(30,8,'自學全通','Complete self-study','完成八段，並取得本單元 14–29 的自學星星。','Complete all eight sections and earn study missions 14–29.','unit-completed',8,d=>Array.isArray(d.sections)&&d.sections.length===8&&d.sections.every(v=>v===true)&&Array.isArray(d.awarded)&&Array.from({length:16},(_,i)=>i+14).every(n=>d.awarded.includes(n)))
    ];
  }
  window.CurrentBalanceStudyTasks={taskDefinitions};

  // 事件（js/current-balance.js 回報；質量 mg、電流 A、指針 mm）：
  //   'state'：放開滑桿、按按鈕、天平停穩時
  //     { power, fromMin（開電源時兩個旋鈕都在 0）, I1, I2（真實電流）, I1m, I2m（電表讀數）, s1, s2（±1 接線方向）,
  //       magDown（bc 受力向下）, currents（兩個電流都有）, hung（漆包線掛在天平上）, mg（電子秤讀數）, mTrue, len (cm),
  //       nut (mm), zeroOff（沒歸零相當於掛勾上多掛的 mg）, tip（指針尖偏高 mm）, level（|tip| ≤ 0.5 mm）, rest（停穩）, stop（靠在擋塊上）,
  //       mode ('ideal'|'real'), realSol（真實螺線管）, part（1 或 2）, combos（停穩過的不同接線組合數）}
  //   'power'：按電源開關 { on, fromMin }
  //   'record'：按「記錄」成功
  //     { row: { part, m（mg）, I1, I2（電表讀數）, mode, realSol, zeroOff, mTrue, tip, F, B, mu0, err（μ0 的相對誤差）},
  //       rows: [同上…], n,
  //       p1: { n, mu0, err（B 對 I2 斜率算出的 μ0 誤差）, distinctM, I1spread, intercept（一般最佳直線的截距，T）},
  //       p2: { n, B, Bth, err（F 對 I1 斜率算出的 B 與 μ0 n I2 的差）, mu0, distinctM, I2spread }, mu0Mean, meanErr }
  //   'clear'：全部清除
  const rows = function (d) { return d.rows || []; };
  const near = function (a, b, r) { return Math.abs(a - b) <= r * Math.abs(b); };
  const zeroed = function (r) { return Math.abs(r.zeroOff) <= 1; };
  const careful = function (r) { return r.mode === 'real' && !r.realSol && zeroed(r); };

  LabMission.register('current-balance', [
    {
      id: 'current-balance-1', level: 1,
      title: { zh: '先歸零', en: 'Zero it first' },
      desc: { zh: '不通電、掛勾上不掛東西，調整「歸零螺母」，讓天平停穩時指針對準水平刻線。', en: 'With no current and nothing on the hook, adjust the zero nut until the balance comes to rest with the pointer on the level mark.' },
      check: function (ev) { const d = ev.data; return ev.type === 'state' && d.rest && d.level && !d.hung && !d.currents; }
    },
    {
      id: 'current-balance-2', level: 2,
      title: { zh: '把 bc 往下拉', en: 'Pull bc down' },
      desc: { zh: '兩個電流旋鈕都在 0 時打開電源，再調大電流，讓 bc 段受到向下的磁力、外端的指針翹高至少 1 mm。接線方向不對時，試試「反向」按鈕。', en: 'Switch on with both current knobs at 0, then turn the currents up so that segment bc is pushed down and the pointer at the outer end rises at least 1 mm. If the wiring is the wrong way round, try a “Reverse” button.' },
      check: function (ev) { const d = ev.data; return ev.type === 'state' && d.power && d.fromMin && d.magDown && d.tip >= 1; }
    },
    {
      id: 'current-balance-3', level: 3,
      title: { zh: '第一筆數據', en: 'First data point' },
      desc: { zh: '剪一段漆包線掛上天平，調整電流讓天平回到水平並停穩，按「記錄」。', en: 'Cut a piece of wire, hang it on the balance, adjust a current until the balance is level and still, and press “Record”.' },
      check: function (ev) { return ev.type === 'record'; }
    },
    {
      id: 'current-balance-4', level: 4,
      title: { zh: '重量加倍', en: 'Double the weight' },
      desc: { zh: '在實驗一裡，用同一個 I1 記錄兩筆：漆包線的質量剛好相差 2 倍（3% 內），而且平衡時的 I2 也剛好相差 2 倍（3% 內）。', en: 'In Part 1, record two rows at the same I1 whose wire masses differ by a factor of 2 (within 3%) and whose balancing I2 also differ by a factor of 2 (within 3%).' },
      check: function (ev) {
        if (ev.type !== 'record') return false;
        const a = ev.data.row;
        if (a.part !== 1) return false;
        return rows(ev.data).some(function (b) {
          if (b.part !== 1 || Math.abs(a.I1 - b.I1) > 0.011 || !(a.m > 0 && b.m > 0)) return false;
          const big = a.m > b.m ? a : b, small = a.m > b.m ? b : a;
          return near(big.m / small.m, 2, 0.03) && near(big.I2 / small.I2, 2, 0.03);
        });
      }
    },
    {
      id: 'current-balance-5', level: 5,
      title: { zh: '此消彼長', en: 'Trade one current for the other' },
      desc: { zh: '用同一段漆包線記錄兩筆：I1 相差 1.8 倍以上，而兩筆的 I1 × I2 相差不到 2%。磁力和兩個電流是什麼關係？', en: 'With the same piece of wire, record two rows whose I1 differ by a factor of 1.8 or more while I1 × I2 agrees within 2%. How does the magnetic force depend on the two currents?' },
      check: function (ev) {
        if (ev.type !== 'record') return false;
        const a = ev.data.row;
        return rows(ev.data).some(function (b) {
          if (Math.abs(a.m - b.m) > 1 || !(a.I1 > 0 && b.I1 > 0)) return false;
          return Math.max(a.I1, b.I1) / Math.min(a.I1, b.I1) >= 1.8 && near(a.I1 * a.I2, b.I1 * b.I2, 0.02);
        });
      }
    },
    {
      id: 'current-balance-6', level: 6,
      title: { zh: '實驗一：量出 μ0', en: 'Part 1: measure μ0' },
      desc: { zh: '實驗一記錄至少 5 筆、5 種不同質量的數據，I1 全程不變（差 0.01 A 內），讓 B 對 I2 圖的斜率算出的 μ0 與 4π × 10^-7 T·m/A 相差 2% 以內。', en: 'In Part 1, record at least 5 rows with 5 different masses, keeping I1 fixed (within 0.01 A), so that the μ0 from the slope of B against I2 is within 2% of 4π × 10^-7 T·m/A.' },
      check: function (ev) { const p = ev.data.p1; return ev.type === 'record' && p && p.n >= 5 && p.distinctM >= 5 && p.I1spread <= 0.011 && Math.abs(p.err) <= 0.02; }
    },
    {
      id: 'current-balance-7', level: 6,
      title: { zh: '實驗二：量出 B', en: 'Part 2: measure B' },
      desc: { zh: '實驗二記錄至少 5 筆、5 種不同質量的數據，I2 全程不變（差 0.01 A 內），讓 F 對 I1 圖的斜率算出的 B 與 μ0 n I2 相差 2% 以內。', en: 'In Part 2, record at least 5 rows with 5 different masses, keeping I2 fixed (within 0.01 A), so that the B from the slope of F against I1 is within 2% of μ0 n I2.' },
      check: function (ev) { const p = ev.data.p2; return ev.type === 'record' && p && p.n >= 5 && p.distinctM >= 5 && p.I2spread <= 0.011 && Math.abs(p.err) <= 0.02; }
    },
    {
      id: 'current-balance-8', level: 7,
      title: { zh: '忘了歸零', en: 'Forgot to zero' },
      desc: { zh: '故意不歸零（相當於多掛或少掛 3 mg 以上），在實驗一記錄至少 3 筆不同 I2 的數據，讓 B 對 I2 的最佳直線截距超過 0.3 mT。直線為什麼不再通過原點？', en: 'Leave the balance unzeroed on purpose (worth 3 mg or more on the hook), record at least 3 Part 1 rows at different I2, and make the intercept of the best-fit line of B against I2 larger than 0.3 mT. Why does the line miss the origin?' },
      check: function (ev) {
        if (ev.type !== 'record') return false;
        const p1 = rows(ev.data).filter(function (r) { return r.part === 1; });
        const p = ev.data.p1;
        return p1.length >= 3 && p1.every(function (r) { return Math.abs(r.zeroOff) >= 3; }) &&
          p && p.intercept != null && Math.abs(p.intercept) >= 3e-4;
      }
    },
    {
      id: 'current-balance-9', level: 8,
      title: { zh: '螺線管不夠長', en: 'Not long enough' },
      desc: { zh: '勾選「真實螺線管」，歸零後記錄至少 3 筆數據，讓這些數據算出的 μ0 平均比 4π × 10^-7 T·m/A 小 6% 到 12%。少掉的磁力跑去哪裡了？', en: 'Tick “Real solenoid”, zero the balance, and record at least 3 rows whose average μ0 is 6% to 12% below 4π × 10^-7 T·m/A. Where did the missing force go?' },
      check: function (ev) {
        if (ev.type !== 'record') return false;
        const list = rows(ev.data).filter(function (r) { return r.realSol && zeroed(r) && isFinite(r.err); });
        if (list.length < 3) return false;
        const e = list.reduce(function (s, r) { return s + r.err; }, 0) / list.length;
        return e >= -0.12 && e <= -0.06;
      }
    },
    {
      id: 'current-balance-10', level: 9,
      title: { zh: '真實的儀器', en: 'Real instruments' },
      desc: { zh: '在「含誤差」模式、長螺線管近似下，歸零後完成實驗一：至少 5 筆、5 種不同質量，I1 不變，μ0 與 4π × 10^-7 T·m/A 相差 3% 以內。實驗一的每一筆都要符合這些條件。', en: 'In “With errors” mode with the long-solenoid model, zero the balance and complete Part 1: at least 5 rows with 5 different masses at a fixed I1, giving μ0 within 3% of 4π × 10^-7 T·m/A. Every Part 1 row must meet these conditions.' },
      check: function (ev) {
        if (ev.type !== 'record') return false;
        const p = ev.data.p1, p1 = rows(ev.data).filter(function (r) { return r.part === 1; });
        return p && p.n >= 5 && p.distinctM >= 5 && p.I1spread <= 0.011 && Math.abs(p.err) <= 0.03 && p1.every(careful);
      }
    },
    {
      id: 'current-balance-11', level: 10,
      title: { zh: '大師：兩條路，同一個答案', en: 'Master: two roads, one answer' },
      desc: { zh: '每一筆都在「含誤差」模式、長螺線管近似、歸零後記錄：實驗一與實驗二各至少 5 筆、5 種不同質量，兩個實驗算出的 μ0 都與 4π × 10^-7 T·m/A 相差 3% 以內，而且彼此相差不到 1%。', en: 'With every row taken in “With errors” mode, with the long-solenoid model and a zeroed balance, record at least 5 rows with 5 different masses in each of Part 1 and Part 2, so that both parts give μ0 within 3% of 4π × 10^-7 T·m/A and agree with each other within 1%.' },
      check: function (ev) {
        if (ev.type !== 'record') return false;
        const d = ev.data, p1 = d.p1, p2 = d.p2;
        if (!p1 || !p2 || !(p1.n >= 5 && p2.n >= 5 && p1.distinctM >= 5 && p2.distinctM >= 5)) return false;
        if (!(p1.I1spread <= 0.011 && p2.I2spread <= 0.011)) return false;
        if (!(Math.abs(p1.err) <= 0.03 && Math.abs(p2.err) <= 0.03)) return false;
        return near(p1.mu0, p2.mu0, 0.01) && rows(d).every(careful);
      }
    },
    {id:'current-balance-12',level:5,title:{"zh":"光槓桿","en":"Optical lever"},desc:{"zh":"開光槓桿，光點離零線 2 mm 以內，天平停穩後記錄。","en":"Enable the optical lever and record when the spot is within 2 mm of zero and the beam is still."},check(e){const d=e.data||{};return e.type==='optical-record'&&d.recorded&&d.optical&&d.rest&&d.level&&Number.isFinite(d.spotMm)&&Math.abs(d.spotMm)<=2;}},
    {id:'current-balance-13',level:4,title:{"zh":"抬起一粒米","en":"Lift one grain"},desc:{"zh":"米粒模式掛一粒，平衡並停穩後記錄。","en":"Hang one grain in rice mode, balance it, let it settle and record."},check(e){const d=e.data||{};return e.type==='rice-record'&&d.recorded&&d.weight==='rice'&&d.grains===1&&d.hung&&d.currents&&d.rest&&d.level;}},
    ...taskDefinitions(),
    // ---------- 隱藏任務：只給隱晦的提示 ----------
    {
      id: 'current-balance-h1', level: 4, hidden: true,
      riddle: { zh: '四條路，兩種結局。', en: 'Four roads, two endings.' },
      check: function (ev) { return ev.type === 'state' && ev.data.combos >= 4; }
    },
    {
      id: 'current-balance-h2', level: 6, hidden: true,
      riddle: { zh: '空空的掛勾，被看不見的手扶正了。', en: 'An empty hook, set straight by an invisible hand.' },
      check: function (ev) { const d = ev.data; return ev.type === 'state' && d.rest && d.level && !d.hung && d.currents && Math.abs(d.zeroOff) >= 3; }
    },
    {
      id: 'current-balance-h3', level: 7, hidden: true,
      riddle: { zh: '最沉的擔子，也有扛得起的時候。', en: 'Even the heaviest load can be carried.' },
      check: function (ev) { const d = ev.data; return ev.type === 'state' && d.rest && d.level && d.hung && d.currents && d.mg >= 290; }
    }
  ]);
})();
