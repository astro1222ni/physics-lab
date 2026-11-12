/* 任務可達成的證明腳本。用法：node tools/mission-proofs/cell-division.js
 * 用核心（js/cell-division-core.js）照頁面（js/cell-division.js）的做法算出 'cd-stage'、'cd-done'、'cd-batch' 事件，
 * 再用任務檔（js/missions/cell-division.js）同一份 check 函式判定。每個任務都給出做得到的操作、含亂數的算出成功率，
 * 並檢查預設狀態不觸發、任務之間不會「完成一個就順便完成另一個」。修改核心、頁面的事件或任務條件後重跑。 */
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..', '..') + '/';
const K = require(ROOT + 'js/cell-division-core.js');

const defs = [];
const fakeLM = { register: function (id, list) { list.forEach(m => defs.push(Object.assign({ mem: {} }, m))); } };
new Function('window', 'LabMission', fs.readFileSync(ROOT + 'js/missions/cell-division.js', 'utf8'))({ LabMission: fakeLM }, fakeLM);
const byId = {};
defs.forEach(m => { byId[m.id.replace('cell-division-', '')] = m; });
const check = (id, ev) => byId[id].check(ev, byId[id].mem);
const all = ev => defs.filter(m => m.check(ev, {})).map(m => m.id.replace('cell-division-', ''));

const out = [];
let fail = 0;
function claim(ok, msg) { out.push((ok ? '✓ ' : '✗ ') + msg); if (!ok) fail++; }
const pct = x => (100 * x).toFixed(1) + '%';

// ---------- 與 js/cell-division.js 相同的事件 ----------
function Page(o) {
  o = Object.assign({ mode: 'mitosis', n: 2, xo: true, nd: 0, seed: 1 }, o);
  const rec = K.make({ mode: o.mode, n: o.n, xo: o.xo, nd: o.mode === 'meiosis' ? o.nd : 0, ndPair: 0, seed: o.seed });
  const st = { mode: o.mode, n: o.n, xo: o.xo, nd: o.mode === 'meiosis' ? o.nd : 0, rec };
  const at = (k, f) => { const i = K.STAGES[o.mode].findIndex(s => s.k === k); return K.stageStart(o.mode, i) + K.STAGES[o.mode][i].d * (f == null ? 0.75 : f); };
  function stage(tau) {
    const c = K.counts(rec, tau), s = c.stage;
    return {
      type: 'cd-stage', data: {
        mode: st.mode, n: st.n, xo: st.mode === 'meiosis' && st.xo, nd: st.nd, stage: s.k, f: s.f, paused: true,
        ncell: c.cells.length, cells: c.cells.map(x => ({ chrom: x.chrom, chromatids: x.chromatids, dna: Math.round(x.dna * 1000) / 1000 })),
        chiasmata: st.mode === 'meiosis' ? rec.xo.length : 0, replicated: c.replicated,
        sameSide: st.mode === 'meiosis' && rec.mi.every(x => x === rec.mi[0])
      }
    };
  }
  function done() {
    const gi = rec.gametes.map(g => {
      const p0 = g.filter(q => q.p === 0);
      return { size: g.length, geno: K.genotype(g), recomb: K.isRecombinant(K.genotype(g)), p0: p0.length, mixed: p0.length === 2 && p0[0].h !== p0[1].h, same: p0.length === 2 && p0[0].h === p0[1].h, p0diff: p0.length === 2 && K.genotype([p0[0]]) !== K.genotype([p0[1]]) };
    });
    const genos = gi.map(q => q.geno);
    return {
      type: 'cd-done', data: {
        mode: st.mode, n: st.n, xo: st.mode === 'meiosis' && st.xo, nd: st.nd, ncell: gi.length, sizes: gi.map(q => q.size), genos, distinct: new Set(genos).size,
        chiasmata: st.mode === 'meiosis' ? rec.xo.length : 0, aneuploid: gi.filter(q => q.size !== (st.mode === 'mitosis' ? 2 * st.n : st.n)).length,
        mixedDisomic: gi.some(q => q.mixed), sameDisomic: gi.some(q => q.same), diffDisomic: gi.some(q => q.p0diff),
        allRecomb: gi.length === 4 && gi.every(q => q.p0 === 1 && q.recomb)
      }
    };
  }
  return { rec, at, stage, done, T: K.total(o.mode) };
}
/** 第二部分：同一組設定連續做 runs 批（每批 N 次減數分裂），回傳每批之後的事件 */
function Batches(d, n, runs, seed) {
  const cnt = { AB: 0, Ab: 0, aB: 0, ab: 0 }, pats = {};
  let total = 0, rec = 0, meioses = 0;
  const evs = [];
  runs.forEach((N, i) => {
    const b = K.batch({ d: d / 100, n, N, seed: seed * 1000 + i + 1 });
    Object.keys(b.counts).forEach(k => { cnt[k] += b.counts[k]; });
    total += b.total; rec += b.rec; meioses += N;
    b.patterns.forEach(p => { pats[p] = 1; });
    const ci = K.wilson(rec, total);
    evs.push({ type: 'cd-batch', data: { d, n, meioses, total, rec, r: rec / total, lo: ci[0], hi: ci[1], half: (ci[1] - ci[0]) / 2, haldane: K.haldane(d / 100), distinct: Object.keys(pats).length, possible: Math.pow(2, n) } });
  });
  return evs;
}
const anyOf = (evs, id) => evs.some(e => check(id, e));
function rate(trials, gen, id) { let ok = 0; for (let t = 0; t < trials; t++) if (gen(t + 1).some(e => check(id, e))) ok++; return ok / trials; }

// ---------- 預設狀態 ----------
{
  const p = Page({});
  const hits = new Set();
  all(p.stage(0)).forEach(h => hits.add(h));
  // 預設不會自己播放；就算播放到底，也只有一般任務 1 成立
  all(p.done()).forEach(h => hits.add(h));
  claim([...hits].every(h => h === '1'), '預設（有絲分裂、2 對、時間在開頭）不觸發；按播放到底也只會完成任務 1' + (hits.size ? '：' + [...hits].join('、') : ''));
  const b = Batches(20, 3, [1000], 1);
  claim(all(b[0]).length === 0, '第二部分預設（20 cM、3 對）做 1000 次，不會完成任何任務：' + (all(b[0]).join('、') || '無'));
}

// ---------- 一般任務 ----------
let p = Page({});
claim(check('1', p.done()), '1 有絲分裂播放到底');
p = Page({ n: 2 });
let e = p.stage(p.at('ana', 0.5));
claim(check('2', e), `2 有絲分裂後期暫停：${e.data.cells[0].chrom} 條（4n）、DNA ${e.data.cells[0].dna}C`);
claim(!check('2', p.stage(p.at('meta', 0.5))), '2 對照：中期是 2n，不成立');
p = Page({ mode: 'meiosis' });
claim(check('3', p.done()), '3 減數分裂播放到底，四個配子');
{
  let ok = 0, tot = 0;
  for (let s = 1; s <= 200; s++) { const q = Page({ mode: 'meiosis', n: 2, seed: s }); tot++; if (check('4', q.stage(q.at('meta1', 0.6)))) ok++; }
  claim(ok / tot > 0.9, `4 中期 I 暫停（2 對、有互換）：${pct(ok / tot)} 的分裂至少有一個交叉`);
  claim(!check('4', Page({ mode: 'meiosis', n: 2, xo: false }).stage(Page({ mode: 'meiosis' }).at('meta1', 0.6))), '4 對照：互換關閉不成立');
}
p = Page({ mode: 'meiosis', n: 3 });
e = p.stage(p.at('pro2', 0.5));
claim(check('5', e), `5 前期 II 暫停：每個細胞 ${e.data.cells.map(c => c.chrom + ' 條、' + c.dna + 'C').join('；')}`);
claim(!check('5', p.stage(p.at('meta1', 0.5))) && !check('5', p.stage(p.at('ana2', 0.5))), '5 對照：中期 I（2n、4C）與後期 II（2n、2C）不成立');
claim(rate(400, s => [Page({ mode: 'meiosis', n: 2, seed: s }).done()], '6') > 0.4, `6 一次得到四種配子：每次減數分裂成功 ${pct(rate(400, s => [Page({ mode: 'meiosis', n: 2, seed: s }).done()], '6'))}`);
claim(rate(100, s => [Page({ mode: 'meiosis', n: 2, nd: 1, seed: s }).done()], '7') === 1, '7 第一次分裂不分離（2 對）：每次都做出一母一父的 n+1 配子');
claim(rate(100, s => [Page({ mode: 'meiosis', n: 2, nd: 2, xo: false, seed: s }).done()], '8') === 1, '8 互換關閉、第二次分裂不分離：每次都做出兩條相同的 n+1 配子');
{
  const r9 = rate(200, s => Batches(20, 7, [100, 100, 100, 100, 100], 300 + s), '9');
  claim(r9 > 0.9, `9 n = 7、一次 100 次做五次：500 次內集齊 128 種的機率 ${pct(r9)}`);
  claim(rate(200, s => Batches(20, 7, [100], 300 + s), '9') < 0.15, `9 只做 100 次就集齊不容易（${pct(rate(200, s => Batches(20, 7, [100], 300 + s), '9'))}），要多做幾批`);
  claim(!anyOf(Batches(20, 7, [1000], 3), '9'), '9 對照：一口氣做 1000 次不算（超過 500 次）');
  claim(!anyOf(Batches(20, 6, [100, 100, 100], 3), '9'), '9 對照：n = 6 不算（要 7 對）');
}
{
  const s10 = Batches(5, 1, [1000, 1000], 4);
  const d = s10[1].data;
  claim(anyOf(s10, '10'), `10 5 cM 做 2000 次：r = ${pct(d.r, 2)}、半寬 ${pct(d.half, 2)}、Haldane ${pct(d.haldane, 2)}`);
  claim(rate(40, s => Batches(5, 1, [1000, 1000], 100 + s), '10') > 0.85, `10 5 cM 兩次 1000：成功 ${pct(rate(40, s => Batches(5, 1, [1000, 1000], 100 + s), '10'))}`);
  claim(!anyOf(Batches(0, 1, [1000, 1000], 4), '10'), '10 對照：d = 0（同一個位置）不算，避免和 h2 一起完成');
}
{
  const s11 = Batches(120, 1, [1000, 1000], 5);
  claim(anyOf(s11, '11'), `11 120 cM 做 2000 次：r = ${pct(s11[1].data.r)}、區間 ${pct(s11[1].data.lo)}–${pct(s11[1].data.hi)}、Haldane ${pct(s11[1].data.haldane)}`);
}
{
  const dd = K.haldaneInv(0.25) * 100;
  const s12 = Batches(35, 1, [1000, 1000, 1000], 6);
  claim(anyOf(s12, '12'), `12 r = 25% 要 d = ${dd.toFixed(1)} cM；設 35 cM 做 3000 次：r = ${pct(s12[2].data.r)}、區間 ${pct(s12[2].data.lo)}–${pct(s12[2].data.hi)}`);
  claim(!anyOf(Batches(25, 1, [1000, 1000, 1000], 6), '12'), '12 對照：以為 r = d、設 25 cM 不成立');
  claim(rate(30, s => Batches(35, 1, [1000, 1000, 1000, 1000], 200 + s), '12') > 0.4, `12 35 cM 做到 4000 次之內成功 ${pct(rate(30, s => Batches(35, 1, [1000, 1000, 1000, 1000], 200 + s), '12'))}`);
}

// ---------- 隱藏任務 ----------
p = Page({});
claim(check('h1', p.stage(p.at('S', 0.5))) && !check('h1', p.stage(p.at('S', 0.02))) && !check('h1', p.stage(p.at('S', 0.4))), `h1 S 期剛好複製一半時暫停：DNA ${p.stage(p.at('S', 0.5)).data.cells[0].dna}C（剛開始、或複製到 40% 都不算）`);
{
  let hit = 0; for (let i = 0; i < 1000; i++) if (check('h1', p.stage(p.at('S', i / 1000)))) hit++;
  claim(hit / 1000 < 0.1, `h1 在 S 期隨便停一下就中的機率 ${pct(hit / 1000)}（要刻意對準一半）`);
}
claim(anyOf(Batches(0, 1, [1000, 1000], 7), 'h2') && !anyOf(Batches(0, 1, [1000], 7), 'h2') && !anyOf(Batches(1, 1, [1000, 1000], 7), 'h2'), 'h2 距離 0 cM 做 2000 次：沒有重組型（只做 1000 次不算；1 cM 就會有重組）');
claim(rate(50, s => [Page({ mode: 'meiosis', n: 1, nd: 1, seed: s }).done()], 'h3') === 1, 'h3 只有 1 對、第一次分裂不分離：兩個配子沒有染色體');
{
  const s4 = Batches(200, 1, [1000, 1000, 1000, 1000], 8);
  const d = s4[s4.length - 1].data;
  claim(anyOf(s4, 'h4'), `h4 200 cM 做到 4000 次：r = ${pct(d.r)}、區間上限 ${pct(d.hi)} < 50%（Haldane ${pct(d.haldane)}）`);
  claim(rate(30, s => Batches(200, 1, [1000, 1000, 1000, 1000], 300 + s), 'h4') > 0.6, `h4 4000 次之內成功 ${pct(rate(30, s => Batches(200, 1, [1000, 1000, 1000, 1000], 300 + s), 'h4'))}`);
}
p = Page({ mode: 'meiosis', n: 3 });
e = p.stage(p.at('ana2', 0.5));
claim(check('h5', e), `h5 後期 II 暫停：兩個細胞各 ${e.data.cells[0].chrom} 條（2n）、${e.data.cells[0].dna}C——和 G1 的數字一樣，卻是單倍體`);
claim(!check('h5', p.stage(p.at('G1', 0.5))), 'h5 對照：真正的 G1 不算');
{
  const r6 = rate(400, s => [Page({ mode: 'meiosis', n: 2, nd: 2, seed: s }).done()], 'h6');
  claim(r6 > 0.15, `h6 開著互換、第二次分裂不分離：n+1 配子的兩份第 1 對基因型不同 ${pct(r6)}`);
}
{
  const s7 = Batches(10, 1, [1000, 1000, 1000], 9);
  const d = s7[2].data;
  claim(anyOf(s7, 'h7'), `h7 10 cM 做 3000 次：r = ${pct(d.r, 2)}、上限 ${pct(d.hi, 2)} < d = 10%，Haldane ${pct(d.haldane, 2)} 在區間內`);
  claim(rate(30, s => Batches(10, 1, [1000], 400 + s), 'h7') === 0, 'h7 對照：只做 1000 次不算（要 3000 次以上，避免隨手一按就中）');
  claim(rate(30, s => Batches(12, 1, [1000, 1000, 1000], 400 + s), 'h7') > 0.6, `h7 12 cM 做到 3000 次之內成功 ${pct(rate(30, s => Batches(12, 1, [1000, 1000, 1000], 400 + s), 'h7'))}`);
}
{
  const r8 = rate(800, s => { const q = Page({ mode: 'meiosis', n: 4, xo: false, seed: s }); return [q.stage(q.at('meta1', 0.8))]; }, 'h8');
  claim(Math.abs(r8 - 1 / 8) < 0.04, `h8 4 對、不互換、中期 I：母方全部朝同一極的機率 ${pct(r8)}（理論 2/2⁴ = 12.5%）`.replace('⁴', '^4'));
}
{
  const r9 = rate(60, s => Batches(20, 8, [100, 100, 100, 100, 100, 100], 500 + s), 'h9');
  claim(r9 > 0.1, `h9 8 對、每次 100 做到 600 次之內集齊 256 種：${pct(r9)}（同一次分裂的四個配子兩兩互補，所以平均要約 700 次）`);
  claim(!anyOf(Batches(20, 8, [1000], 9), 'h9'), 'h9 對照：一次做 1000 次就超過 600 次，不算');
}
{
  const r10 = rate(1000, s => [Page({ mode: 'meiosis', n: 1, seed: s }).done()], 'h10');
  claim(r10 > 0.05, `h10 四個配子全是重組型（第 1 對有兩個交叉、分別落在四條不同的分體上）：每次減數分裂 ${pct(r10)}`);
}

// ---------- 互不順手完成 ----------
{
  const pairs = [];
  // 一般任務的典型做法不會完成隱藏任務
  const typical = [
    ['4', () => { const q = Page({ mode: 'meiosis', n: 2 }); return [q.stage(q.at('meta1', 0.6))]; }],
    ['5', () => { const q = Page({ mode: 'meiosis', n: 3 }); return [q.stage(q.at('pro2', 0.5)), q.stage(q.at('meta2', 0.5))]; }],
    ['7', () => [Page({ mode: 'meiosis', n: 2, nd: 1 }).done()]],
    ['8', () => [Page({ mode: 'meiosis', n: 2, nd: 2, xo: false }).done()]],
    ['9', () => Batches(20, 7, [100, 100, 100, 100, 100], 3)],
    ['10', () => Batches(5, 1, [1000, 1000], 4)],
    ['11', () => Batches(120, 1, [1000, 1000, 1000, 1000], 5)],
    ['12', () => Batches(35, 1, [1000, 1000, 1000], 6)]
  ];
  typical.forEach(t => {
    const hid = new Set();
    t[1]().forEach(ev => all(ev).filter(h => /^h/.test(h)).forEach(h => hid.add(h)));
    if (hid.size) pairs.push(t[0] + '→' + [...hid].join(','));
  });
  claim(!pairs.length, '一般任務的典型做法不會順手完成隱藏任務' + (pairs.length ? '：' + pairs.join('；') : ''));
  // 隱藏任務彼此
  const hidden = [
    ['h1', () => { const q = Page({}); return [q.stage(q.at('S', 0.5))]; }],
    ['h2', () => Batches(0, 1, [1000, 1000], 7)],
    ['h3', () => [Page({ mode: 'meiosis', n: 1, nd: 1 }).done()]],
    ['h4', () => Batches(200, 1, [1000, 1000, 1000, 1000], 8)],
    ['h5', () => { const q = Page({ mode: 'meiosis', n: 3 }); return [q.stage(q.at('ana2', 0.5))]; }],
    ['h7', () => Batches(10, 1, [1000, 1000, 1000], 9)],
    ['h9', () => Batches(20, 8, [100, 100, 100, 100, 100, 100], 501)]
  ];
  const cross = [];
  hidden.forEach(t => {
    const hid = new Set();
    t[1]().forEach(ev => all(ev).filter(h => /^h/.test(h) && h !== t[0]).forEach(h => hid.add(h)));
    if (hid.size) cross.push(t[0] + '→' + [...hid].join(','));
  });
  claim(!cross.length, '隱藏任務之間不會完成一個就順便完成另一個' + (cross.length ? '：' + cross.join('；') : ''));
  // h6、h8、h10 是機率性的：檢查它們成立的那一次不會同時完成別的隱藏任務
  const co = new Set();
  for (let s = 1; s <= 400; s++) {
    [Page({ mode: 'meiosis', n: 2, nd: 2, seed: s }).done(), Page({ mode: 'meiosis', n: 1, seed: s }).done()].forEach(ev => {
      const h = all(ev).filter(x => /^h/.test(x)); if (h.length > 1) co.add(h.join('+'));
    });
    const q = Page({ mode: 'meiosis', n: 4, xo: false, seed: s }); const h = all(q.stage(q.at('meta1', 0.8))).filter(x => /^h/.test(x)); if (h.length > 1) co.add(h.join('+'));
  }
  claim(!co.size, 'h6、h8、h10 成立時不會同時完成另一個隱藏任務' + (co.size ? '：' + [...co].join('；') : ''));
}

const stars = defs.reduce((a, m) => a + (m.hidden ? m.level * 2 : m.level), 0);
const lv = defs.filter(m => m.hidden).map(m => m.level);
claim(defs.filter(m => !m.hidden).length === 12 && lv.length === 10 && lv.filter(l => l >= 7).length >= 3 && Math.min(...lv) >= 3, `12 個一般任務、10 個隱藏任務（等級 ${lv.join('、')}；7 級以上 ${lv.filter(l => l >= 7).length} 個），共 ${stars} 顆星`);

console.log(out.join('\n'));
console.log(fail ? `✗ ${fail} 項不成立` : '全部成立');
process.exitCode = fail ? 1 : 0;
