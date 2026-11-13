/* 任務可達成的證明腳本。用法：node tools/mission-proofs/oxygen-hemoglobin.js
 * 用核心（js/oxygen-hemoglobin-core.js）照頁面的做法算出 'oxy'、'mwc'、'mwc-meas' 事件（與 js/oxygen-hemoglobin.js 相同的計算），
 * 再用任務檔（js/missions/oxygen-hemoglobin.js）同一份 check 函式判定。每個任務都給出一組做得到的操作、對照組，
 * 並檢查六個情境按鈕、三種蛋白質都不會直接完成高等級任務。修改核心、頁面的事件或任務條件後重跑。 */
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..', '..') + '/';
const O = require(ROOT + 'js/oxygen-hemoglobin-core.js');

const defs = [];
const fakeLM = { register: function (id, list) { list.forEach(m => defs.push(Object.assign({ mem: {} }, m))); } };
new Function('window', 'LabMission', fs.readFileSync(ROOT + 'js/missions/oxygen-hemoglobin.js', 'utf8'))({ LabMission: fakeLM }, fakeLM);
const byId = {};
defs.forEach(m => { byId[m.id.replace('oxygen-hemoglobin-', '')] = m; });
const check = (id, ev, mem) => byId[id].check(ev, mem || {});
const all = ev => defs.filter(m => m.check(ev, {})).map(m => m.id.replace('oxygen-hemoglobin-', ''));

const out = [];
let fail = 0;
function claim(ok, msg) { out.push((ok ? '✓ ' : '✗ ') + msg); if (!ok) fail++; }

// ---------- 與 js/oxygen-hemoglobin.js 相同的事件 ----------
const BASE = { alt: 0, PaCO2: 40, HCO3: 24, T: 37, BPG: 5, Hb: 15, ppm: 0, D: 5, type: 'A' };
function oxy(o, probe) {
  o = Object.assign({}, BASE, o);
  probe = probe == null ? 40 : probe;
  const s = O.state(o);
  const std = Math.abs(s.pH - 7.4) <= 0.02 && Math.abs(o.PaCO2 - 40) <= 1 && Math.abs(o.T - 37) <= 0.05 && Math.abs(o.BPG - 5) <= 0.05 && o.ppm === 0;
  return {
    type: 'oxy', data: {
      type: o.type, alt: o.alt, PaCO2: o.PaCO2, HCO3: o.HCO3, T: o.T, BPG: o.BPG, Hb: o.Hb, ppm: o.ppm, D: o.D,
      probe: probe, Sp: O.sat(probe, s.ca, o.type, s.PCO).O2, pH: s.pH, PAO2: s.PAO2, Pa: s.Pa, Sa: s.Sa, Pv: s.Pv, Sv: s.Sv, Ca: s.Ca, Ca0: s.Ca0,
      deficit: s.deficit, P50: s.P50, n: s.n, std: std,
      key: [o.alt, o.PaCO2, o.HCO3, o.T, o.BPG, o.ppm].map(v => Math.round(v * 100)).join(',')
    }
  };
}
const KR = O.MWC_HB.KR;
const Lof = v => Math.pow(10, v / 100), cof = v => Math.pow(10, -v / 100);
function mwcEv(L, c) { return { type: 'mwc', data: { L: L, c: c, P50: O.mwcA50(L, c) * KR, n: O.mwcN(L, c) } }; }
/** 第二部分：與頁面相同的族群（48 個分子、每秒重抽 3 次、時間步 1/60 s、等全部重抽過再平均 2 秒） */
function Lab2(seed, L, c) {
  const pop = O.pop(48, seed, 3);
  const st = { L: L, c: c, pts: [] };
  pop.init(O.mwcDist(26.9 / KR, L, c));
  return {
    st: st,
    measure(P) {
      const dist = O.mwcDist(P / KR, st.L, st.c);
      const t0 = pop.t;
      while (!pop.settledSince(t0)) pop.step(1 / 60, dist);
      let acc = 0, T = 0;
      while (T < 2 - 1e-9) { pop.step(1 / 60, dist); acc += pop.mean() / 60; T += 1 / 60; }
      const Y = acc / T;
      st.pts.push({ P: P, Y: Y });
      const xs = [], ys = [];
      st.pts.forEach(p => { if (p.Y >= 0.1 && p.Y <= 0.9) { xs.push(Math.log10(p.P)); ys.push(Math.log10(p.Y / (1 - p.Y))); } });
      const f = xs.length >= 2 ? O.linfit(xs, ys) : null;
      return {
        type: 'mwc-meas', data: {
          L: st.L, c: st.c, P: P, Y: Y, Yth: O.mwcY(P / KR, st.L, st.c), pts: st.pts.length, fitPts: xs.length,
          slope: f ? f.slope : null, nTh: O.mwcN(st.L, st.c), P50: O.mwcA50(st.L, st.c) * KR
        }
      };
    }
  };
}

// ---------- 1 半滿的那一點 ----------
claim(check('1', oxy({}, 26.9)), '1 標準狀態、探針 26.9 mmHg → ' + (oxy({}, 26.9).data.Sp * 100).toFixed(2) + '%');
claim(!check('1', oxy({}, 40)), '1 對照：預設探針 40 mmHg 不算');
claim(!check('1', oxy({ BPG: 6 }, 26.9)), '1 對照：2,3-BPG 改了就不是標準曲線');

// ---------- 2 肌紅素 ----------
claim(check('2', oxy({ type: 'Mb' }, 2.8)), '2 肌紅素、探針 2.8 mmHg → ' + (oxy({ type: 'Mb' }, 2.8).data.Sp * 100).toFixed(1) + '%');
claim(!check('2', oxy({ type: 'Mb' }, 3.5)), '2 對照：3.5 mmHg 不算');
claim(!check('2', oxy({ type: 'A' }, 26.9)), '2 對照：成人血紅素不算');

// ---------- 3 往右推 ----------
{
  const e = oxy({ HCO3: 15 });
  claim(check('3', e), '3 HCO3 降到 15 mM（代謝性酸中毒，pH ' + e.data.pH.toFixed(2) + '）→ P50 ' + e.data.P50.toFixed(1));
  const e2 = oxy({ PaCO2: 62 });
  claim(check('3', e2), '3 或 PaCO2 升到 62（呼吸性酸中毒，pH ' + e2.data.pH.toFixed(2) + '）→ P50 ' + e2.data.P50.toFixed(1));
  claim(!check('3', oxy({ T: 41 })), '3 對照：改體溫不算（P50 ' + oxy({ T: 41 }).data.P50.toFixed(1) + '）');
  claim(!check('3', oxy({ BPG: 9 })), '3 對照：改 2,3-BPG 不算');
}

// ---------- 4 胎兒 ----------
{
  const mem = {};
  claim(!check('4', oxy({ type: 'A' }, 30), mem), '4 先看成人：探針 30 mmHg → ' + (oxy({ type: 'A' }, 30).data.Sp * 100).toFixed(1) + '%');
  claim(check('4', oxy({ type: 'F' }, 30), mem), '4 再看胎兒：同一點 → ' + (oxy({ type: 'F' }, 30).data.Sp * 100).toFixed(1) + '%，多 20 個百分點以上');
  const m2 = {};
  check('4', oxy({ type: 'A' }, 30), m2);
  claim(!check('4', oxy({ type: 'F' }, 31), m2), '4 對照：探針位置不同不算');
  const m3 = {};
  check('4', oxy({ type: 'A' }, 30), m3);
  claim(!check('4', oxy({ type: 'F', PaCO2: 50 }, 30), m3), '4 對照：條件改了不算');
  const m4 = {};
  check('4', oxy({ type: 'A' }, 60), m4);
  claim(!check('4', oxy({ type: 'F' }, 60), m4), '4 對照：探針在 40 mmHg 以外不算');
}

// ---------- 5 一氧化碳 ----------
{
  const e = oxy({ ppm: 300 });
  claim(check('5', e), '5 300 ppm：PaO2 ' + e.data.Pa.toFixed(1) + '，含氧量剩 ' + (e.data.Ca / e.data.Ca0 * 100).toFixed(1) + '%');
  const e2 = oxy({ ppm: 100 });
  claim(!check('5', e2), '5 對照：情境「一氧化碳」100 ppm 剩 ' + (e2.data.Ca / e2.data.Ca0 * 100).toFixed(1) + '%，還不夠');
  let lo = 0, hi = 1000;
  for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (check('5', oxy({ ppm: m }))) hi = m; else lo = m; }
  out.push('  （門檻約 ' + hi.toFixed(0) + ' ppm）');
}

// ---------- 6 高原 ----------
{
  const e = oxy({ alt: 5000, PaCO2: 25 });
  claim(check('6', e), '6 5000 m、PaCO2 25（用力呼吸）→ SaO2 ' + (e.data.Sa * 100).toFixed(1) + '%、pH ' + e.data.pH.toFixed(2));
  const e2 = oxy({ alt: 5000, PaCO2: 32, BPG: 5.5 });
  claim(!check('6', e2), '6 對照：情境「剛到 5000 m」SaO2 ' + (e2.data.Sa * 100).toFixed(1) + '%');
  claim(!check('6', oxy({ alt: 5000, PaCO2: 7, HCO3: 24 })), '6 對照：PaCO2 7、HCO3 24 時 pH ' + oxy({ alt: 5000, PaCO2: 7 }).data.pH.toFixed(2) + ' 超過 7.8 不算');
  claim(!check('6', oxy({ alt: 5000, PaCO2: 25, type: 'F' })), '6 對照：胎兒血紅素不算');
}

// ---------- 7 馬拉松 ----------
{
  const e = oxy({ D: 15, T: 39.5, PaCO2: 34, HCO3: 18 });
  claim(check('7', e), '7 D 15、39.5 °C、PaCO2 34、HCO3 18 → PvO2 ' + e.data.Pv.toFixed(1) + '（右移讓肌肉拿得到氧）');
  const e1 = oxy({ D: 15, Hb: 19 });
  claim(!check('7', e1), '7 對照：只把血紅素提高到 19 g/dL（PvO2 ' + e1.data.Pv.toFixed(1) + '）不算，要靠曲線右移');
  claim(!check('7', oxy({ D: 15.1, Hb: 22 })), '7 對照：試玩時亂按「D 拉高、血紅素拉到最大」不算');
  const e2 = oxy({ D: 15 });
  claim(!check('7', e2), '7 對照：只把 D 拉到 15 → PvO2 ' + e2.data.Pv.toFixed(1));
  const e3 = oxy({ D: 12, T: 39, PaCO2: 35, HCO3: 20 });
  claim(!check('7', e3), '7 對照：情境「馬拉松」D 12 不算（PvO2 ' + e3.data.Pv.toFixed(1) + '）');
}

// ---------- 8 峰頂的一口氣 ----------
{
  const e = oxy({ alt: 8848, PaCO2: 7.5, HCO3: 11 });
  claim(check('8', e), '8 8848 m、PaCO2 7.5、HCO3 11（腎臟代償）→ SaO2 ' + (e.data.Sa * 100).toFixed(1) + '%、pH ' + e.data.pH.toFixed(3));
  const e2 = oxy({ alt: 8848, PaCO2: 7.5, HCO3: 24 });
  claim(!check('8', e2), '8 對照：HCO3 24（沒代償）pH ' + e2.data.pH.toFixed(2) + ' 太鹼不算');
  const e3 = oxy({ alt: 8848, PaCO2: 20, HCO3: 12 });
  claim(!check('8', e3), '8 對照：PaCO2 20 換氣不夠 → SaO2 ' + (e3.data.Sa * 100).toFixed(1) + '%');
  let n = 0, tot = 0;
  for (let pc = 7; pc <= 20; pc += 0.5) for (let h = 8; h <= 30; h += 0.5) { tot++; if (check('8', oxy({ alt: 8848, PaCO2: pc, HCO3: h }))) n++; }
  out.push('  （37 °C、BPG 5 時，PaCO2 × HCO3 的滑桿組合有 ' + n + ' / ' + tot + ' 組成立）');
}

// ---------- 9 Hill 斜率 ----------
{
  // 頁面同一個種子：量 5 點，不成立就按「全部清除」（族群照樣繼續跑）再量
  const lab = Lab2(20261112, O.MWC_HB.L, O.MWC_HB.c);
  let e = null, rounds = 0, done = false;
  const seq = [20, 23, 27, 31, 35];
  while (!done && rounds < 5) {
    rounds++; lab.st.pts = [];
    for (const P of seq) { e = lab.measure(P); if (check('9', e)) { done = true; break; } }
  }
  claim(done, '9 頁面同一個種子：在 P50 附近量 5 點，第 ' + rounds + ' 輪成立，斜率 ' + (e.data.slope).toFixed(2) + '（理論 ' + e.data.nTh.toFixed(2) + '）');
  let ok = 0;
  for (let s = 1; s <= 200; s++) {
    const l = Lab2(s, O.MWC_HB.L, O.MWC_HB.c);
    let d = null;
    [20, 23, 27, 31, 35].forEach(P => { d = l.measure(P); });
    if (check('9', d)) ok++;
  }
  claim(ok >= 120, '9 只量 5 點（20、23、27、31、35 mmHg）：200 個種子中 ' + ok + ' 個一次就成立，其餘按「全部清除」重量');
  const w = Lab2(5, O.MWC_HB.L, O.MWC_HB.c);
  let d = null;
  [3, 8, 300, 600].forEach(P => { d = w.measure(P); });
  claim(!check('9', d), '9 對照：點都在 10%–90% 以外，擬合點不夠');
  const nc = Lab2(5, 1, 1);
  [1, 2, 3, 4, 5].forEach(P => { d = nc.measure(P); });
  claim(!check('9', d), '9 對照：沒有協同（n = 1）不算');
}

// ---------- 10 各做各的 ----------
{
  const lab = Lab2(7, Lof(395), cof(0));
  let e = lab.measure(1); e = lab.measure(3);
  claim(!check('10', e), '10 c = 1：量 2 點還不夠');
  e = lab.measure(10);
  claim(check('10', e), '10 c = 1（滑桿拉到最左）：理論 n = ' + e.data.nTh.toFixed(3) + '，量 3 點');
  const lab2 = Lab2(7, Lof(0), cof(185));
  [1, 3, 10].forEach(P => { e = lab2.measure(P); });
  out.push((check('10', e) ? '✓ ' : '· ') + '10 L = 1（滑桿最左）時 n = ' + O.mwcN(1, cof(185)).toFixed(2) + (check('10', e) ? '' : '，不算（要另外調 c）'));
  const lab3 = Lab2(7, O.MWC_HB.L, O.MWC_HB.c);
  [10, 20, 30].forEach(P => { e = lab3.measure(P); });
  claim(!check('10', e), '10 對照：血紅素的值不算');
}

// ---------- 11 超級血紅素 ----------
{
  let n = 0, ex = null, nMax = 0;
  for (let a = 0; a <= 800; a++) for (let b = 0; b <= 400; b++) {
    const e = mwcEv(Lof(a), cof(b));
    if (e.data.n > nMax) nMax = e.data.n;
    if (check('11', e)) { n++; if (!ex) ex = [a, b, e]; }
  }
  claim(n > 0, '11 滑桿組合（L、c 各一格）中有 ' + n + ' 組成立，例如 L = ' + Lof(ex[0]).toFixed(0) + '、c = ' + cof(ex[1]).toPrecision(3) + '：P50 ' + ex[2].data.P50.toFixed(1) + '、n ' + ex[2].data.n.toFixed(2) + '（不限 P50 時 n 最大 ' + nMax.toFixed(2) + '，上限是 4；KR 固定、P50 要在 26.9 附近時最大約 3.47）');
  claim(!check('11', mwcEv(O.MWC_HB.L, O.MWC_HB.c)), '11 對照：真正的血紅素 n = ' + O.mwcN(O.MWC_HB.L, O.MWC_HB.c).toFixed(2));
  let row = 0; for (let b = 0; b <= 400; b++) if (check('11', mwcEv(O.MWC_HB.L, cof(b)))) row++;
  claim(row === 0, '11 對照：L 留在血紅素的 9000、只拉 c 做不到（試玩時亂按誤觸的情況）');
}

// ---------- 12 在峰頂走路 ----------
{
  const e = oxy({ alt: 8848, PaCO2: 7.5, HCO3: 11, Hb: 21, D: 10, T: 39, BPG: 8 });
  claim(check('12', e), '12 8848 m、PaCO2 7.5、HCO3 11、Hb 21、39 °C、BPG 8、D 10 → PvO2 ' + e.data.Pv.toFixed(1) + '、pH ' + e.data.pH.toFixed(3));
  const e2 = oxy({ alt: 8848, PaCO2: 7.5, HCO3: 11, Hb: 15, D: 10 });
  claim(!check('12', e2), '12 對照：Hb 15 → ' + (e2.data.deficit ? '不夠交' : 'PvO2 ' + e2.data.Pv.toFixed(1)));
  let ok = 0, tot = 0;
  for (let pc = 7; pc <= 15; pc += 0.5) for (let h = 8; h <= 20; h += 0.5) for (const Hb of [15, 17, 19, 20, 21, 22]) for (const bpg of [0, 3, 5, 8, 10]) for (const T of [35, 37, 38, 39, 40]) {
    tot++; if (check('12', oxy({ alt: 8848, PaCO2: pc, HCO3: h, T: T, BPG: bpg, Hb: Hb, D: 10 }))) ok++;
  }
  out.push('  （格點搜尋：' + ok + ' / ' + tot + ' 組成立，約 ' + (ok / tot * 100).toFixed(1) + '%）');
}

// ---------- 隱藏任務 ----------
{
  claim(check('h1', oxy({ alt: 8848 })), 'h1 直接到 8848 m 不加快呼吸：肺泡 PO2 = 0');
  claim(!check('h1', oxy({ alt: 5000 })), 'h1 對照：5000 m 還有氧');
  let ex = null;
  for (let alt = 3000; alt <= 7000 && !ex; alt += 100) for (let pc = 20; pc <= 40 && !ex; pc += 1) {
    const e = oxy({ type: 'F', alt: alt, PaCO2: pc });
    if (check('h2', e)) ex = [alt, pc, e];
  }
  claim(!!ex, 'h2 胎兒血紅素在 ' + ex[0] + ' m、PaCO2 ' + ex[1] + '：PaO2 ' + ex[2].data.Pa.toFixed(1) + '、SaO2 ' + (ex[2].data.Sa * 100).toFixed(1) + '%（胎盤裡的臍靜脈 PO2 也只有約 30 mmHg）');
  claim(!check('h2', oxy({ type: 'A', alt: ex[0], PaCO2: ex[1] })), 'h2 對照：同樣條件的成人血紅素 SaO2 ' + (oxy({ alt: ex[0], PaCO2: ex[1] }).data.Sa * 100).toFixed(1) + '%');
  claim(check('h3', oxy({ BPG: 0 })), 'h3 2,3-BPG 0（放久的庫存血）→ P50 ' + oxy({ BPG: 0 }).data.P50.toFixed(1));
  claim(!check('h3', oxy({ BPG: 1 })), 'h3 對照：BPG 1 → P50 ' + oxy({ BPG: 1 }).data.P50.toFixed(1));
}

// ---------- 情境按鈕不會直接完成任務 ----------
{
  const SC = {
    rest: {}, marathon: { D: 12, T: 39, PaCO2: 35, HCO3: 20 }, yushan: { alt: 3952, PaCO2: 34, BPG: 5.5 },
    m5000: { alt: 5000, PaCO2: 32, BPG: 5.5 }, co: { ppm: 100 }, anemia: { Hb: 8 }
  };
  const hits = [];
  for (const k in SC) for (const t of ['A', 'F', 'Mb']) {
    const got = all(oxy(Object.assign({ type: t }, SC[k]), 40));
    if (got.length) hits.push(k + '/' + t + '：' + got.join(','));
  }
  claim(hits.length === 0, '六個情境 × 三種蛋白質（探針 40）都不會直接完成任務' + (hits.length ? '：' + hits.join('；') : ''));
  claim(all(mwcEv(O.MWC_HB.L, O.MWC_HB.c)).length === 0, '第二部分預設值不會完成任務');
}

// ---------- 星星 ----------
const stars = m => m.hidden ? m.level * 2 : m.level;
const pub = defs.filter(m => !m.hidden), hid = defs.filter(m => m.hidden);
out.push(`任務 ${defs.length} 個（公開 ${pub.length}、隱藏 ${hid.length}），共 ${defs.reduce((a, m) => a + stars(m), 0)} 顆星（公開 ${pub.reduce((a, m) => a + stars(m), 0)}，隱藏 ${hid.reduce((a, m) => a + stars(m), 0)}）`);
console.log(out.join('\n'));
if (fail) { console.error(fail + ' 項不成立'); process.exitCode = 1; }
