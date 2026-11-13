/* 任務可達成的證明腳本。用法：node tools/mission-proofs/string-instrument.js
 * 用物理核心（js/string-instrument-core.js 的 analyze）模擬頁面發出的事件（格式與 js/string-instrument.js 相同），證明：
 *   1. 每個任務在滑桿範圍與精度內做得到（印出找到的解）；
 *   2. 預設狀態（每把琴、每條弦直接撥、輕觸預設的第 12 品、拉弓、轉一下弦鈕）不觸發任何任務；
 *   3. 隱藏任務兩兩不連帶：做某個隱藏任務的完整步驟，不會順便完成其他隱藏任務。
 * 滑桿精度（點數字打字）：弦長 0.001 m、張力 0.01 N、μ 0.001 g/m、直徑 0.001 mm、手指 0.001 半音、輕觸位置 0.0001、撥弦位置 0.001。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const S = require(ROOT + 'js/string-instrument-core.js');
const missions = [];
global.window = { LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/string-instrument.js');
const byId = id => missions.find(m => m.id === 'string-instrument-' + id);
const cents = r => 1200 * Math.log2(r);
const grid = (v, step) => Math.round(Math.round(v / step) * step * 1e6) / 1e6;

// ---------- 和頁面相同的狀態與事件 ----------
function Sim() {
  const st = { inst: 'guitar', insts: {}, hand: 'press', fret: 0, finger: 0, touch: S.fretXi(12), rule: 'et', beta: 0.2, bowN: 0, play: null };
  S.INST_IDS.forEach(id => { st.insts[id] = S.presetInstrument(id); });
  const ev = [];
  const cur = () => st.insts[st.inst];
  const str = () => cur().strings[cur().si];
  const cfg = bow => ({ inst: st.inst, L: cur().L, strings: cur().strings, si: cur().si, hand: st.hand, fret: st.fret, finger: st.finger, rule: st.rule, touch: st.touch, beta: st.beta, bow: !!bow });
  const info = bow => JSON.parse(JSON.stringify(S.analyze(cfg(bow))));
  const prev = () => { const i = info(false); return { inst: st.inst, si: cur().si, L: i.L, T: i.T, mu: i.mu, fOpen: i.fOpen, mode: i.mode, mat: i.mat, d: i.d }; };
  const api = {
    st, ev, info,
    pick(inst, si) { st.inst = inst; if (si != null) cur().si = si; st.play = null; return api; },
    /** 調弦：field = 'L' | 'T' | 'mu' | 'd' | 'mat' | 'mode'（和頁面一樣，改完發一個 'tune'） */
    tune(field, v) {
      const p = prev();
      const s = str();
      if (field === 'L') cur().L = grid(v, 0.001);
      else if (field === 'T') s.T = grid(v, 0.01);
      else if (field === 'mu') s.muG = grid(v, 0.001);
      else if (field === 'd') s.d = grid(v, 0.001);
      else if (field === 'mat') { s.mat = v; const R = S.MATERIALS[v].d; s.d = Math.max(R[0], Math.min(R[1], s.d)); }
      else if (field === 'mode') { s.mode = v; if (v === 'mat') { const R = S.MATERIALS[s.mat].d; s.d = Math.max(R[0], Math.min(R[1], s.d)); } }
      ev.push({ type: 'tune', data: Object.assign({ changed: field, prev: p }, info(false)) });
      return api;
    },
    /** 左手、右手（不發事件） */
    set(o) { Object.assign(st, o); if (o.touch != null) st.touch = o.touch; return api; },
    pluck(via) { st.play = null; ev.push({ type: 'pluck', data: Object.assign({ via: via || 'button' }, info(false)) }); return api; },
    bow() { const i = info(true); st.play = { bowId: ++st.bowN, sMin: st.finger, sMax: st.finger, lastS: st.finger, maxStep: 0 }; ev.push({ type: 'bow', data: Object.assign({ via: 'button', bowId: st.play.bowId }, i) }); return api; },
    /** 拉弓中移動手指（每一步發一個 'slide'） */
    slide(to, step) {
      const p = st.play;
      const n = Math.max(1, Math.round(Math.abs(to - st.finger) / step));
      const from = st.finger;
      for (let k = 1; k <= n; k++) {
        st.finger = grid(from + (to - from) * k / n, 0.001);
        const i = info(true);
        p.maxStep = Math.max(p.maxStep, Math.abs(st.finger - p.lastS)); p.lastS = st.finger;
        p.sMin = Math.min(p.sMin, st.finger); p.sMax = Math.max(p.sMax, st.finger);
        ev.push({ type: 'slide', data: { inst: st.inst, si: cur().si, bowId: p.bowId, s: st.finger, sMin: p.sMin, sMax: p.sMax, maxStep: p.maxStep, f1: i.f1, fOpen: i.fOpen } });
      }
      return api;
    }
  };
  return api;
}

let fail = 0;
/** 跑一串事件，傳回完成了哪些任務（每個任務的 mem 從空的開始） */
function run(events, list) {
  return (list || missions).filter(m => { m.mem = {}; return events.some(e => { try { return !!m.check(e, m.mem); } catch (err) { return false; } }); }).map(m => m.id);
}
const short = id => id.replace('string-instrument-', '');
function prove(id, sim, note) {
  const done = run(sim.ev);
  const ok = done.includes('string-instrument-' + id);
  if (!ok) fail++;
  let extra = '';
  if (/^h/.test(id)) {
    const others = done.filter(x => /-h\d+$/.test(x) && x !== 'string-instrument-' + id);
    if (others.length) { fail++; extra = '  ✗ 連帶完成了隱藏任務 ' + others.map(short).join('、'); }
  }
  const m = byId(id);
  console.log((ok ? '  ✓ ' : '  ✗ ') + String(id).padEnd(4) + '（等級 ' + m.level + '）' + note + extra);
}

console.log('弦樂器任務證明\n');

// ---------- 預設狀態不觸發 ----------
{
  const sim = Sim();
  S.INST_IDS.forEach(id => {
    sim.pick(id);
    S.INSTRUMENTS[id].strings.forEach((_, i) => {
      sim.pick(id, i).set({ hand: 'press' }).pluck('button').pluck('canvas');
      sim.set({ hand: 'touch' }).pluck('button');          // 輕觸預設的第 12 品
      sim.set({ hand: 'press' });
      if (!S.INSTRUMENTS[id].frets) sim.bow();
      sim.tune('T', sim.st.insts[id].strings[i].T + 0.1).tune('T', sim.st.insts[id].strings[i].T - 0.1);  // 轉一下弦鈕又轉回來
    });
    sim.st.insts[id] = S.presetInstrument(id);
  });
  const hit = run(sim.ev);
  if (hit.length) { fail++; console.log('  ✗ 預設狀態觸發了 ' + hit.map(short).join('、')); }
  else console.log('  ✓ 預設狀態不觸發任何任務：三把琴的每條弦都撥（按鈕、畫布）、輕觸預設的第 12 品、拉弓、弦鈕 ±0.1 N（共 ' + sim.ev.length + ' 個事件）');
  // 預設的調弦：每條弦都偏 10 音分以上
  const devs = S.INST_IDS.map(id => S.analyze(Object.assign({ inst: id, hand: 'press', fret: 0, finger: 0, rule: 'et', touch: 0.5, beta: 0.2 }, S.presetInstrument(id))).devs);
  const minDev = Math.min.apply(null, devs.flat().map(Math.abs));
  console.log('    （預設「剛從琴盒拿出來」：每條弦離目標至少 ' + minDev.toFixed(1) + ' 音分）');
}
console.log('');

// ---------- 公開任務 ----------
const E2 = S.freqOf(40), A4 = 440;
{ const s = Sim().set({ fret: 12 }).pluck(); const d = s.ev[0].data;
  prove('1', s, '吉他第 5 弦按第 12 品撥：' + d.f1.toFixed(2) + ' Hz ÷ 空弦 ' + d.fOpen.toFixed(2) + ' Hz = ' + (d.f1 / d.fOpen).toFixed(4)); }
{ const s = Sim().set({ hand: 'touch', touch: S.fretXi(7) }).pluck(); const d = s.ev[0].data;
  prove('2', s, '輕觸第 7 品（ξ = ' + d.touch.toFixed(4) + '）撥：最低泛音 n = ' + d.lowest + '，' + d.fSound.toFixed(2) + ' Hz'); }
{ const s = Sim().set({ beta: 0.33 }).pluck(); const d = s.ev[0].data;
  prove('3', s, '撥弦位置 0.33（滑桿可以直接拉到）：第 3 泛音只剩 ' + (d.A[2] * 100).toFixed(2) + '%'); }
{ const s = Sim().pick('violin', 2); const T = S.tensionFor(440, 0.328, s.st.insts.violin.strings[2].muG / 1000);
  s.tune('T', T); const d = s.ev[0].data;
  prove('4', s, '小提琴 A 弦張力 ' + d.prev.T + ' → ' + grid(T, 0.01) + ' N：' + d.fOpen.toFixed(3) + ' Hz');
  // 試玩時亂按曾經「改線密度剛好碰到 440 Hz」：改 μ、或目標不是 A4 的弦，都不算
  const s2 = Sim().pick('violin', 2); s2.tune('mu', S.muFor(440, 0.328, s2.st.insts.violin.strings[2].T) * 1000);
  const s3 = Sim().pick('violin', 1); s3.tune('T', S.tensionFor(440, 0.328, s3.st.insts.violin.strings[1].muG / 1000));
  const bad = run(s2.ev.concat(s3.ev)).includes('string-instrument-4');
  if (bad) fail++;
  console.log((bad ? '  ✗ ' : '  ✓ ') + '     改線密度碰到 440 Hz（' + s2.ev[0].data.fOpen.toFixed(2) + ' Hz）、D 弦調到 440 Hz（' + s3.ev[0].data.fOpen.toFixed(2) + ' Hz）都不算'); }
{ const s = Sim().pick('erhu', 0); const T0 = s.st.insts.erhu.strings[0].T; s.tune('T', 4 * T0); const d = s.ev[0].data;
  prove('5', s, '二胡內弦張力 ' + T0 + ' → ' + d.T + ' N（4 倍）：升 ' + cents(d.fOpen / d.prev.fOpen).toFixed(2) + ' 音分'); }
{ const s = Sim().pick('erhu', 1).bow().slide(12, 0.01);
  prove('6', s, '二胡外弦拉弓，手指從 0 拖到 12（滑桿每步 0.01）：' + s.ev.length + ' 個事件，最後 sMax = ' + s.ev[s.ev.length - 1].data.sMax);
  const t = Sim().pick('erhu', 1).bow().slide(12, 12);
  const hit = run(t.ev).includes('string-instrument-6');
  if (hit) fail++;
  console.log('  ' + (hit ? '✗' : '✓') + '      打字一次跳到 12 不算滑音（單次跳動 12 半音 > 3）'); }
{ const s = Sim().pick('guitar', 0).tune('mode', 'mat').tune('mat', 'nylon').tune('T', 70);
  const d = S.diameterFor(S.muFor(E2, 0.65, 70), 1140); s.tune('d', d); const last = s.ev[s.ev.length - 1].data;
  prove('7', s, '第 6 弦實心尼龍、70 N：直徑 ' + grid(d, 0.001) + ' mm（μ ' + last.muG.toFixed(2) + ' g/m），偏差 ' + last.devs[0].toFixed(2) + ' 音分（纏繞弦只要 1.09 mm）'); }
{ const s = Sim();
  const Ts = S.INSTRUMENTS.guitar.strings.map((_, i) => grid(S.inTuneTension('guitar', i), 0.01));
  Ts.forEach((T, i) => s.pick('guitar', i).tune('T', T));
  const d = s.ev[s.ev.length - 1].data;
  prove('8', s, '六條弦張力 ' + Ts.join('、') + ' N：偏差 ' + d.devs.map(c => c.toFixed(2)).join('、') + ' 音分'); }
{ const s = Sim().pick('guitar', 1).tune('mode', 'mat').tune('d', 0.6).tune('mat', 'nylon').tune('T', 20);
  const fN = s.ev[s.ev.length - 1].data.fOpen;
  const Ts = S.tensionFor(fN, 0.65, S.muWire(7850, 0.6));
  s.tune('mat', 'steel').tune('T', Ts);
  const d = s.ev[s.ev.length - 1].data;
  prove('9', s, '直徑 0.6 mm、弦長 0.65 m：尼龍 20 N → ' + fN.toFixed(2) + ' Hz；鋼 ' + grid(Ts, 0.01) + ' N → ' + d.fOpen.toFixed(2) + ' Hz（張力比 ' + (grid(Ts, 0.01) / 20).toFixed(3) + ' = 密度比 ' + (7850 / 1140).toFixed(3) + '）'); }
{ const s = Sim(); const f = [A4 * 4 / 9, A4 * 2 / 3, A4, A4 * 3 / 2];
  const Ts = f.map((x, i) => grid(S.tensionFor(x, 0.328, s.st.insts.violin.strings[i].muG / 1000), 0.01));
  Ts.forEach((T, i) => s.pick('violin', i).tune('T', T));
  const d = s.ev[s.ev.length - 1].data;
  prove('10', s, '小提琴 G D A E = ' + d.opens.map(x => x.toFixed(2)).join('、') + ' Hz（張力 ' + Ts.join('、') + ' N），五度 ' +
    [0, 1, 2].map(k => cents(d.opens[k + 1] / d.opens[k]).toFixed(2)).join('、') + ' 音分'); }
{ const s = Sim();
  // 先把第 6 弦調準，再用泛音把第 5 弦對到它
  s.pick('guitar', 0).tune('T', S.inTuneTension('guitar', 0));
  s.set({ hand: 'touch', touch: S.fretXi(5) }).pluck();
  const f6 = s.ev[s.ev.length - 1].data.fSound;
  const T5 = S.tensionFor(f6 / 3, 0.65, s.st.insts.guitar.strings[1].muG / 1000);
  s.pick('guitar', 1).tune('T', T5).set({ touch: S.fretXi(7) }).pluck();
  const d = s.ev[s.ev.length - 1].data;
  prove('11', s, '第 6 弦第 5 品泛音（n = 4）' + f6.toFixed(3) + ' Hz；第 5 弦張力 ' + grid(T5, 0.01) + ' N、第 7 品泛音（n = 3）' + d.fSound.toFixed(3) +
    ' Hz，差 ' + cents(d.fSound / f6).toFixed(3) + ' 音分（兩弦成純四度 4:3，比平均律寬 1.96 音分）'); }
{ const s = Sim();
  S.INSTRUMENTS.guitar.strings.forEach((_, i) => s.pick('guitar', i).tune('T', S.inTuneTension('guitar', i)));
  const plan = [[0, 'touch', S.fretXi(5)], [1, 'press', 19], [2, 'press', 14], [3, 'press', 9], [4, 'press', 5], [5, 'press', 0]];
  const got = [];
  plan.forEach(p => {
    s.pick('guitar', p[0]);
    if (p[1] === 'touch') s.set({ hand: 'touch', touch: p[2] }); else s.set({ hand: 'press', fret: p[2] });
    s.pluck();
    const d = s.ev[s.ev.length - 1].data;
    got.push('第 ' + S.INSTRUMENTS.guitar.strings[p[0]].label + ' 弦' + (p[1] === 'touch' ? '第 5 品泛音' : p[2] ? '第 ' + p[2] + ' 品' : '空弦') + ' ' + d.fSound.toFixed(2));
  });
  prove('12', s, '標準調弦後：' + got.join('、') + ' Hz'); }
console.log('');

// ---------- 隱藏任務（每個都從預設開始，事件包含所有前置步驟） ----------
{ const s = Sim().set({ fret: 12 }).pluck().set({ hand: 'touch', touch: S.fretXi(12) }).pluck();
  prove('h1', s, '吉他第 5 弦：按第 12 品撥，再輕觸第 12 品撥，兩次都是 ' + s.ev[1].data.fSound.toFixed(2) + ' Hz'); }
{ const s = Sim().pick('guitar', 1).tune('L', 0.6).tune('L', 0.4); const d = s.ev[1].data;
  prove('h2', s, '弦長 0.65 → 0.600 m（不算）→ 0.400 m：升 ' + cents(d.fOpen / d.prev.fOpen).toFixed(3) + ' 音分（純五度 701.955）'); }
{ const s = Sim().pick('erhu', 0); const T0 = s.st.insts.erhu.strings[0].T; s.tune('T', 2 * T0); const d = s.ev[0].data;
  prove('h3', s, '二胡內弦張力 ' + T0 + ' → ' + d.T + ' N：升 ' + cents(d.fOpen / d.prev.fOpen).toFixed(2) + ' 音分（三全音）'); }
{ const s = Sim().pick('violin', 2).set({ finger: 3.863 }).pluck(); const d = s.ev[0].data;
  prove('h4', s, '小提琴手指 3.863 半音：弦剩 ' + (d.Leff / d.L).toFixed(5) + '，升 ' + cents(d.f1 / d.fOpen).toFixed(3) + ' 音分（純大三度 386.314）');
  const t = Sim().pick('violin', 2).set({ finger: 4 }).pluck();
  const hit = run(t.ev).includes('string-instrument-h4');
  if (hit) fail++;
  console.log('  ' + (hit ? '✗' : '✓') + '      平均律的 4 半音（400 音分）不算'); }
{ const s = Sim().set({ hand: 'touch', touch: 0.75 }).pluck(); const d = s.ev[0].data;
  prove('h5', s, '吉他輕觸 0.75（第 24 品的位置）：最低泛音 n = ' + d.lowest + '，' + d.fSound.toFixed(2) + ' Hz'); }
{ const s = Sim().set({ hand: 'touch', touch: S.fretXi(7), beta: 0.333 }).pluck(); const d = s.ev[0].data;
  prove('h6', s, '輕觸第 7 品、撥弦位置 0.333：最強成分只剩 ' + (d.peak * 100).toFixed(2) + '%（< 3% → 幾乎無聲）');
  const t = Sim().set({ hand: 'touch', touch: 0.5, beta: 0.5 }).pluck();
  console.log('         （輕觸 1/2 又撥 1/2 也會無聲，但撥弦位置的最大值很容易被亂按到，所以不算）');
  if (run(t.ev).includes('string-instrument-h6')) { fail++; console.log('  ✗ 1/2 + 1/2 被算成完成'); } }
{ const s = Sim();
  const T6 = S.tensionFor(E2, 0.65, 5.92e-3);
  s.pick('guitar', 1).tune('mu', 5.92 / 4).tune('T', T6 / 4).pick('guitar', 0).tune('T', T6);
  const d = s.ev[s.ev.length - 1].data;
  prove('h7', s, '吉他第 5 弦 μ 改成 ' + grid(5.92 / 4, 0.001) + ' g/m（第 6 弦的 1/4）：兩弦都調到 E2，張力 ' + d.Ts[0] + ' N 與 ' + d.Ts[1] + ' N，比 ' + (d.Ts[0] / d.Ts[1]).toFixed(3)); }
{ const s = Sim().set({ fret: 19 }).pluck().set({ hand: 'touch', touch: S.fretXi(19) }).pluck();
  prove('h8', s, '吉他按第 19 品撥（' + s.ev[0].data.fSound.toFixed(2) + ' Hz），再輕觸同一位置 ξ = ' + S.fretXi(19).toFixed(4) + '（第 3 泛音 ' + s.ev[1].data.fSound.toFixed(2) + ' Hz），差 ' +
    cents(s.ev[1].data.fSound / s.ev[0].data.fSound).toFixed(2) + ' 音分'); }
{ const s = Sim().set({ fret: 17 }).pluck().set({ rule: 'r18' }).pluck();
  prove('h9', s, '第 17 品（18 法則最差的一品，L = 0.65 m 時差 ' + (S.rule18Gap(17, 0.65) * 1000).toFixed(2) + ' mm）：2^(1/12) ' + s.ev[0].data.fSound.toFixed(2) + ' Hz、18 法則 ' + s.ev[1].data.fSound.toFixed(2) + ' Hz'); }
{ const s = Sim(); const r = [1, 4 / 3, 16 / 9, 64 / 27, 80 / 27, 320 / 81];
  const Ts = r.map((k, i) => grid(S.tensionFor(E2 * k, 0.65, s.st.insts.guitar.strings[i].muG / 1000), 0.01));
  Ts.forEach((T, i) => s.pick('guitar', i).tune('T', T));
  const d = s.ev[s.ev.length - 1].data;
  prove('h10', s, '吉他相鄰音程 ' + [0, 1, 2, 3, 4].map(k => cents(d.opens[k + 1] / d.opens[k]).toFixed(2)).join('、') + ' 音分（張力 ' + Ts.join('、') + ' N）：兩條 E 弦差 ' +
    cents(d.opens[5] / d.opens[0]).toFixed(2) + ' 音分，比兩個八度少 ' + (2400 - cents(d.opens[5] / d.opens[0])).toFixed(2)); }

// ---------- 等級分布 ----------
{
  const pub = missions.filter(m => !m.hidden), hid = missions.filter(m => m.hidden);
  const lv = list => list.map(m => m.level).sort((a, b) => a - b).join(' ');
  console.log('\n公開 ' + pub.length + ' 個（等級 ' + lv(pub) + '）、隱藏 ' + hid.length + ' 個（等級 ' + lv(hid) + '，7 級以上 ' + hid.filter(m => m.level >= 7).length + ' 個）');
  if (pub.length < 10 || pub.length > 12 || hid.length !== 10 || hid.some(m => m.level < 3) || hid.filter(m => m.level >= 7).length < 3) { fail++; console.log('  ✗ 任務數量或等級不符合規格'); }
  const ids = new Set(); missions.forEach(m => { if (ids.has(m.id)) { fail++; console.log('  ✗ 任務代號重複 ' + m.id); } ids.add(m.id); });
}

console.log(fail ? '\n有 ' + fail + ' 項沒有通過' : '\n全部通過');
process.exit(fail ? 1 : 0);
