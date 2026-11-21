/* missions/central-place.js — 中地理論的任務（星星數 = 等級；隱藏任務 = 等級 × 2）
 *
 * 事件（js/central-place.js 只在使用者操作過之後才回報；載入頁面不算）：
 *   'cp'：拖曳滑桿時大約每 0.25 秒一次；開店動畫播放中大約每 0.25 秒一次；放開滑桿、換模式、換畫面、
 *         按播放／暫停／回到一開始／微調、換 k、等級數、塗色的級、開關道路、點或拖曳消費者、轉動立體圖時立刻回報。
 *     data = {
 *       act（param、mode、view、k、n、show、roads、probe、rotate、play、pause、rewind、nudge、grow、opened）,
 *       mode（single／hier）, view（map／3d）, rho, T, R,
 *       single = CentralCore.single(rho, T, R)：{ rT, dT, status（none／gaps／full）, d（均衡間距）, area, perK, coverage, mean, far, ratioRT, ratioRC, close（= √3 R）, start（= 2R） },
 *       grow = { s（開店動畫目前的間距；沒在播時 null）, run（播放中）, atEq（是不是均衡的樣子） },
 *       k, N, d1, show（塗色的級，0 = 不塗）, roads,
 *       H = CentralCore.hierarchy()：各級 { L, d, area, pop, areas, centers, far },
 *       gT, gR, good = CentralCore.goodIn()：{ L（在哪一級賣；null = 沒地方賣）, fill（門檻 ÷ 市場區人口）, coverage, reach（商品圈 ÷ 最遠顧客）, spacing, pop },
 *       probe（消費者；沒有時 null）：
 *         一種商品：{ x, y, near（最近三家店的距離）, buy（買得到）, spread（第 3 近 − 第 1 近）÷ 第 1 近 }
 *         中地體系：{ x, y, place（站在第幾級中地上；0 = 不在中地上）, levels（各級 { L, dist, ties（差 1% 以內一樣近的個數） }） }
 *     }
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const V = function (ev) { return ev.type === 'cp' ? ev.data : null; };
  const one = function (d) { const x = V(d); return x && x.mode === 'single' ? x : null; };
  const hier = function (d) { const x = V(d); return x && x.mode === 'hier' ? x : null; };
  const near = function (a, b, tol) { return Math.abs(a - b) <= tol; };

  const lastDensity=ctx=>ctx.seq('cp-density')>ctx.seq('cp')?(ctx.last('cp-density')||{}):{};
  LabMission.register('central-place', [
    {
      id: 'central-place-1', level: 1,
      title: { zh: '開張了', en: 'Open for business' },
      desc: { zh: '按「看商店開張」，一直看到不再有新店擠進來。', en: 'Press “Watch shops open” and watch until no more shops can squeeze in.' },
      check: function (ev) { const d = one(ev); return !!d && d.act === 'opened'; }
    },
    {
      id: 'central-place-2', level: 2,
      title: { zh: '這裡買不到', en: 'Not sold here' },
      desc: { zh: '調整門檻、商品圈或人口密度，讓這種商品一家店都開不起來。', en: 'Change the threshold, range or density until not a single shop can survive.' },
      check: function (ev) { const d = V(ev); return !!d && ((d.mode === 'single' && d.single.status === 'none') || (d.mode === 'hier' && !!d.good && d.good.L == null)); } // 站長 11/16「要放寬認定」：中地體系頁也算
    },
    {
      id: 'central-place-3', level: 2,
      title: { zh: '高高低低的城鎮', en: 'Tall and short places' },
      desc: { zh: '在「中地體系」切到「立體等級」，看柱子的高低。', en: 'In “Hierarchy”, switch to “3D ranks” and compare the column heights.' },
      check: function (ev) { const d = hier(ev); return !!d && d.view === '3d'; }
    },
    {
      id: 'central-place-4', level: 3,
      title: { zh: '沿著路開', en: 'Along the roads' },
      desc: { zh: '選交通原則（k = 4），打開道路。', en: 'Choose the transport principle (k = 4) and turn on the roads.' },
      check: function (ev) { const d = hier(ev); return !!d && d.k === 4 && d.roads; }
    },
    {
      id: 'central-place-5', level: 3,
      title: { zh: '十公里一家', en: 'One every ten kilometres' },
      desc: { zh: '一種商品：讓人人買得到，而且相鄰兩家店相隔 10 公里（差 0.1 公里以內）。', en: 'One good: everyone can buy it and neighbouring shops are 10 km apart (within 0.1 km).' },
      check: function (ev) { const d = one(ev); return !!d && d.single.status === 'full' && near(d.single.d, 10, 0.1); }
    },
    {
      id: 'central-place-6', level: 3,
      title: { zh: '三選一', en: 'Pick one of three' },
      desc: { zh: '市場原則（k = 3）：把消費者放在一個第 1 級中地（村）上，讓最近的第 2 級中地有三個一樣近。', en: 'Market principle (k = 3): put the shopper on a rank-1 place (village) so that three rank-2 places are equally near.' },
      check: function (ev) {
        const d = hier(ev);
        return !!d && d.k === 3 && !!d.probe && d.probe.place === 1 && d.probe.levels.length >= 2 && d.probe.levels[1].ties === 3;
      }
    },
    {
      id: 'central-place-7', level: 4,
      title: { zh: '角落的人', en: 'People in the corners' },
      desc: { zh: '一種商品：讓店開得起來，但六邊形的角落有人買不到。', en: 'One good: shops survive, but people in the hexagon corners cannot buy it.' },
      check: function (ev) { const d = one(ev); return !!d && d.single.status === 'gaps'; }
    },
    {
      id: 'central-place-8', level: 4,
      title: { zh: '四十九個村', en: 'Forty-nine villages' },
      desc: { zh: '行政原則（k = 7），至少 3 個等級，塗色顯示第 3 級的市場區：每一區裡有 49 個第 1 級市場區。', en: 'Administrative principle (k = 7), at least 3 ranks, shading rank-3 market areas: each holds 49 rank-1 areas.' },
      check: function (ev) { const d = hier(ev); return !!d && d.k === 7 && d.N >= 3 && d.show === 3; }
    },
    {
      id: 'central-place-9', level: 5,
      title: { zh: '剛好走到角落', en: 'Just reaching the corner' },
      desc: { zh: '一種商品：人人買得到，而且商品圈只比六邊形角落的距離多 0.5% 以內。', en: 'One good: everyone can buy it, and the range is at most 0.5% longer than the distance to the hexagon corner.' },
      check: function (ev) { const d = one(ev); return !!d && d.single.status === 'full' && d.single.ratioRC >= 1 && d.single.ratioRC <= 1.005; }
    },
    {
      id: 'central-place-10', level: 5,
      title: { zh: '鎮上才有', en: 'Only in town' },
      desc: { zh: '中地體系：讓門檻至少 50,000 人的商品在第 2 級中地賣。', en: 'Hierarchy: make a good with a threshold of at least 50,000 people be sold at rank 2.' },
      check: function (ev) { const d = hier(ev); return !!d && d.gT >= 50000 && d.good.L === 2; }
    },
    {
      id: 'central-place-11', level: 6,
      title: { zh: '平均三公里', en: 'Three kilometres on average' },
      desc: { zh: '一種商品：人人買得到，而且顧客到店平均走 3 公里（差 0.02 公里以內）。', en: 'One good: everyone can buy it and the average trip to the shop is 3 km (within 0.02 km).' },
      check: function (ev) { const d = one(ev); return !!d && d.single.status === 'full' && near(d.single.mean, 3, 0.02); }
    },
    {
      id: 'central-place-12', level: 7,
      title: { zh: '城裡的商品，剛好夠遠', en: 'A city good, just far enough' },
      desc: { zh: '中地體系：讓一種商品在第 3 級中地賣、人人買得到，而且商品圈只比最遠的顧客多 2% 以內。', en: 'Hierarchy: a good sold at rank 3 that everyone can buy, with a range at most 2% longer than the farthest shopper.' },
      check: function (ev) { const d = hier(ev); return !!d && d.good.L === 3 && d.good.reach >= 1 && d.good.reach <= 1.02; }
    },

    {
      id:'central-place-13', level:4,
      title:{zh:'市中心的小商圈',en:'Small downtown markets'},
      desc:{zh:'選向市中心遞減，調整密度倍數，讓市中心商店的面積不到最邊緣商店的四分之一，再按「看商店開張」觀察到穩定。',en:'Choose city-centre peak, then adjust the city-centre density multiple to make the central market smaller than one quarter of the outermost market. Watch the shops settle.'},
      check(ev){const d=ev.data;return ev.type==='cp-density' && d.act==='settled' && d.settled && d.mode==='gradient' && d.areaRatio<0.25;},
      need(ctx){const d=lastDensity(ctx);return [
        [d.mode==='gradient','選向市中心遞減','Select city-centre peak'],
        [null,'調整中心／邊緣密度倍數，目前 '+(d.multiple??'—'),'Adjust the density multiple; now '+(d.multiple??'—')],
        [d.settled && d.areaRatio<0.25,'穩定後面積比 < 0.25，目前 '+(d.areaRatio?.toFixed(3)??'—'),'Settled area ratio < 0.25; now '+(d.areaRatio?.toFixed(3)??'—')],
        [d.act==='settled','按「看商店開張」，觀察到店址穩定。','Press “Watch shops open” and watch them settle.']];}
    },
    {
      id:'central-place-14', level:6,
      title:{zh:'不同面積，相近人數',en:'Different areas, similar populations'},
      desc:{zh:'在隨機起伏模式重抽，讓至少 12 家店的人數變異係數不超過 0.12，再按「看商店開張」觀察到穩定。',en:'Redraw random hills and reach a population CV of at most 0.12 with at least 12 shops. Watch them settle.'},
      check(ev){const d=ev.data;return ev.type==='cp-density' && d.act==='settled' && d.settled && d.mode==='random' && d.rerolls>0 && d.cv<=0.12 && d.count>=12;},
      need(ctx){const d=lastDensity(ctx);return [
        [d.mode==='random' && d.rerolls>0,'選隨機起伏並重抽','Select random hills and redraw'],
        [d.settled && d.cv<=0.12,'穩定後 CV ≤ 0.12，目前 '+(d.cv?.toFixed(3)??'—'),'Settled CV ≤ 0.12; now '+(d.cv?.toFixed(3)??'—')],
        [d.count>=12,'至少 12 家，目前 '+(d.count??'—'),'At least 12 shops; now '+(d.count??'—')],
        [d.act==='settled','按「看商店開張」，觀察到店址穩定。','Press “Watch shops open” and watch them settle.']];}
    },
    // ---------------- 隱藏任務 ----------------
    {
      id: 'central-place-h1', level: 3, hidden: true,
      riddle: { zh: '從村口到京城，一步都不必走。', en: 'From village gate to capital, not a single step.' },
      check: function (ev) { const d = hier(ev); return !!d && d.N === 4 && !!d.probe && d.probe.place === 4; }
    },
    {
      id: 'central-place-h2', level: 4, hidden: true,
      riddle: { zh: '兩座城門之間，你正好走了一半。', en: 'Between two city gates, you are exactly halfway.' },
      check: function (ev) {
        const d = hier(ev);
        return !!d && d.k === 4 && d.N >= 3 && !!d.probe && d.probe.place === 2 && d.probe.levels[2].ties === 2;
      }
    },
    {
      id: 'central-place-h3', level: 4, hidden: true,
      riddle: { zh: '三家店都看得見你，卻沒有一家等得到你。', en: 'Three shops can see you; none of them will ever serve you.' },
      check: function (ev) {
        const d = one(ev);
        return !!d && d.single.status === 'gaps' && d.grow.atEq && !!d.probe && d.probe.spread != null && d.probe.spread <= 0.01 && !d.probe.buy;
      }
    },
    {
      id: 'central-place-h4', level: 5, hidden: true,
      riddle: { zh: '每一位老闆，都恰好守著一百公頃。', en: 'Every shopkeeper keeps exactly one hundred hectares.' },
      check: function (ev) { const d = one(ev); return !!d && d.single.status === 'full' && d.single.area >= 0.99 && d.single.area <= 1.01; }
    },
    {
      id: 'central-place-h5', level: 5, hidden: true,
      riddle: { zh: '勉強撐得下去的店，彼此只輕輕碰了一下肩。', en: 'Shops that barely survive, brushing shoulders and no more.' },
      check: function (ev) { const d = one(ev); return !!d && d.single.ratioRT >= 1 && d.single.ratioRT <= 1.005; }
    },
    {
      id: 'central-place-h6', level: 6, hidden: true,
      riddle: { zh: '拿 1933 年南方的那把尺，量四層。', en: 'Measure four layers with the southern ruler of 1933.' },
      check: function (ev) { const d = hier(ev); return !!d && d.k === 3 && d.N === 4 && d.d1 >= 6.9 && d.d1 <= 7.1; }
    },
    {
      id: 'central-place-h7', level: 7, hidden: true,
      riddle: { zh: '最後一個等不到的人終於等到了，時間就停在那裡。', en: 'The last one left waiting is finally served, and time stops right there.' },
      check: function (ev) {
        const d = one(ev);
        if (!d || d.single.status !== 'full' || d.grow.s == null || d.grow.run) return false;
        const s = d.grow.s, c = d.single.close;
        return s >= 1.02 * d.single.d && Math.abs(s - c) / c <= 0.003;
      }
    },
    {
      id: 'central-place-h8', level: 7, hidden: true,
      riddle: { zh: '二十個人裡，只有一個走不到。', en: 'Of every twenty, only one cannot make the trip.' },
      check: function (ev) { const d = one(ev); return !!d && d.single.status === 'gaps' && d.single.coverage >= 0.949 && d.single.coverage <= 0.951; }
    },
    {
      id: 'central-place-h9', level: 8, hidden: true,
      riddle: { zh: '鎮上那家店，一位客人也不能少。', en: 'The shop in town cannot lose a single customer.' },
      check: function (ev) { const d = hier(ev); return !!d && d.good.L === 2 && d.good.fill >= 0.995 && d.good.fill <= 1; }
    },
    {
      id: 'central-place-h10', level: 10, hidden: true,
      riddle: { zh: '在最高的那座城，最遠的客人剛好走得到，人數也剛好夠。', en: 'In the highest city, the farthest customer just makes it, and there are just enough of them.' },
      check: function (ev) {
        const d = hier(ev);
        return !!d && d.N === 4 && d.good.L === 4 && d.good.fill >= 0.995 && d.good.fill <= 1 && d.good.reach >= 1 && d.good.reach <= 1.005;
      }
    }
  ]);
})();
