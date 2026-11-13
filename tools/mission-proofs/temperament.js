/* 任務可達成的證明腳本。用法：node tools/mission-proofs/temperament.js
 * 用數學核心證明每個任務在介面的範圍與精度內做得到（事件資料和 js/temperament.js 送出的一樣），
 * 預設狀態不觸發任何任務，而且每個隱藏任務的解不會順便完成另一個隱藏任務。
 * 介面：音律四種、主音 12 個；鍵盤 C4–C5（MIDI 60–72），一次選 1–3 個音；誤差地圖可以選 C4–B4 往上的五度、大三度、小三度（最高到 F♯5 = 78）；
 *       五度收窄 w 是 0–8 音分的滑桿，拖曳間隔 0.01、打字到 0.001；疊疊樂 0–60 個五度。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const TC = require(ROOT + 'js/temperament-core.js');
const missions = [];
global.window = { LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/temperament.js');
const byId = id => missions.find(m => m.id === 'temperament-' + id);

// ---------- 與 js/temperament.js 相同的事件資料 ----------
function analysis(kind, tonic, w, notes, src) {
  const a = TC.analyze(kind, tonic, w, notes);
  return {
    kind: kind, tonic: tonic, w: w, notes: a.notes, freqs: a.freqs, devs: a.devs, count: a.notes.length, src: src || 'keys',
    pairs: a.pairs.map(p => ({ lo: p.lo, hi: p.hi, semis: p.semis, cents: p.cents, dev: p.dev, beat: p.beat, m: p.m, n: p.n }))
  };
}
const sel = (kind, tonic, w, notes, src) => ({ type: 'select', data: analysis(kind, tonic, w, notes, src) });
const listen = (kind, tonic, w, notes) => ({ type: 'listen', data: analysis(kind, tonic, w, notes, 'play') });
function compare(kind, tonic, w, notes) {
  const results = {};
  TC.BASIC.forEach(k => { results[k] = analysis(k, tonic, w, notes, 'compare'); });
  if (kind === 'regular') results.regular = analysis('regular', tonic, w, notes, 'compare');
  return { type: 'compare', data: { kind: kind, notes: notes.slice().sort((a, b) => a - b), tonic: tonic, w: w, count: notes.length, results: results } };
}
function stackListen(kind, w, n) {
  const fifth = TC.stackFifth(kind, w), s = TC.stackPair(n, fifth);
  return { type: 'stackListen', data: { n: n, fifth: fifth, kind: kind, w: w, pure: kind === 'pythagorean' || kind === 'just', offC: s.point.offC, beat: s.beat } };
}
const narrow = w => ({ type: 'narrow', data: Object.assign({}, TC.regular(w)) });
const grid = (v, step) => Math.round(v / step) * step;
const r3 = v => Math.round(v * 1000) / 1000;

let fail = 0;
const found = {};   // 每個任務證明用的解（事件序列）
function expect(id, events, want, note) {
  const m = byId(id); m.mem = {};
  let ok = false;
  events.forEach(e => { ok = ok || !!m.check(e, m.mem); });
  const pass = ok === want;
  if (!pass) fail++;
  if (want && pass && !found[id]) found[id] = events;
  console.log((pass ? '  ✓ ' : '  ✗ ') + String(id).padEnd(4) + (want ? '達成：' : '不觸發：') + note);
}
/** 在介面能做到的所有選音裡，找出讓任務成立的第一個（一個事件就完成的任務） */
function search(id, make, prefix) {
  const m = byId(id);
  for (const ev of make()) { m.mem = {}; (prefix || []).forEach(e => m.check(e, m.mem)); if (m.check(ev, m.mem)) return ev; }
  return null;
}
function* allSelections(kinds, tonics, w, type) {
  for (const kind of kinds) for (const t of tonics) {
    for (let a = 60; a <= 72; a++) for (let b = a + 1; b <= 72; b++) yield (type === 'listen' ? listen : sel)(kind, t, w, [a, b]);
    for (let pc = 0; pc < 12; pc++) for (const iv of [3, 4, 7]) yield (type === 'listen' ? listen : sel)(kind, t, w, [60 + pc, 60 + pc + iv]);
  }
}
const names = (t, notes) => notes.map(m => TC.noteName(t, m)).join('–');
const KN = { pythagorean: '五度相生', just: '純律', equal: '十二平均律', regular: '調和律' };

// ---------- 預設狀態不觸發 ----------
{
  // 預設：五度相生、主音 C、w = 0、選音 C4–E4、疊 0 個五度。頁面載入時不送事件；第一次操作時送出的事件如下：
  const defaults = [
    sel('pythagorean', 0, 0, [60, 64]), listen('pythagorean', 0, 0, [60, 64]),
    stackListen('pythagorean', 0, 0), stackListen('pythagorean', 0, 1), narrow(0), narrow(0.01),
    sel('just', 0, 0, [60, 64], 'tuning'), sel('equal', 0, 0, [60, 64], 'tuning'), sel('regular', 0, 0, [60, 64], 'tuning'),
    listen('pythagorean', 0, 0, [60, 64, 67]), listen('just', 0, 0, [60, 64, 67])
  ];
  for (let t = 0; t < 12; t++) defaults.push(sel('pythagorean', t, 0, [60, 64], 'tonic'));
  const hit = missions.filter(m => m.id !== 'temperament-2').filter(m => { m.mem = {}; return defaults.some(e => m.check(e, m.mem)); }).map(m => m.id);
  if (hit.length) { fail++; console.log('  ✗ 預設狀態觸發了 ' + hit.join('、')); }
  else console.log('  ✓ 預設狀態（五度相生、主音 C、選音 C4–E4、w = 0、疊 0 個）與只換音律、只換主音、預設選音直接播放，都不觸發任何任務');
  // temperament-2 本身就是「按『比較三種音律』」：預設選音剛好是大三度，按一下就完成（這是任務要的操作，不是預設狀態）
}

// ---------- 公開任務 ----------
console.log('\n公開任務');
expect('1', [stackListen('pythagorean', 0, 12)], true, '五度相生疊 12 個純五度，和 C 一起聽（離 C +' + TC.stackPoint(12, TC.PURE5).offC.toFixed(2) + ' 音分、拍頻 ' + TC.stackPair(12, TC.PURE5).beat.toFixed(2) + ' Hz）');
expect('1', [stackListen('just', 0, 12)], true, '純律也疊純五度');
expect('1', [stackListen('pythagorean', 0, 11)], false, '只疊 11 個');
expect('1', [stackListen('equal', 0, 12)], false, '十二平均律的五度不是純五度');
expect('2', [compare('pythagorean', 0, 0, [60, 64])], true, '選 C4–E4，按「比較三種音律」');
expect('2', [compare('pythagorean', 0, 0, [60, 67])], false, '五度不算');
expect('2', [listen('pythagorean', 0, 0, [60, 64])], false, '只按播放不算');
{
  const ev = search('3', () => allSelections(['pythagorean'], [0], 0, 'select'));
  expect('3', [ev], true, '主音 C：' + names(0, ev.data.notes) + '（誤差地圖點 F♯ 的五度；' + ev.data.pairs[0].dev.toFixed(2) + ' 音分）');
  expect('3', [listen('pythagorean', 0, 0, [66, 73])], true, '選好再播放也算');
  expect('3', [sel('pythagorean', 0, 0, [60, 67])], false, 'C–G 是純五度');
  expect('3', [sel('just', 0, 0, [66, 73])], false, '純律的 F♯–C♯ 不是');
  expect('3', [sel('pythagorean', 0, 0, [61, 66, 73])], false, '要只選兩個音');
}
expect('4', [listen('equal', 0, 0, [60, 64]), listen('just', 0, 0, [60, 64])], true, 'C4–E4：平均律拍頻 ' + TC.intervalInfo('equal', 0, 0, 60, 64).beat.toFixed(2) + ' Hz → 純律 0');
expect('4', [listen('just', 0, 0, [60, 64]), listen('equal', 0, 0, [60, 64])], true, '反過來的順序也可以');
expect('4', [listen('equal', 0, 0, [60, 64]), listen('just', 0, 0, [62, 66])], false, '要同樣兩個音');
expect('4', [compare('equal', 0, 0, [60, 64])], false, '「比較」不算，要自己切換');
expect('5', [stackListen('equal', 0, 12)], true, '十二平均律疊 12 個五度：離 C ' + TC.stackPoint(12, 700).offC.toFixed(3) + ' 音分');
expect('5', [stackListen('regular', 1.96, 12)], true, '調和律 w = 1.96：離 C ' + TC.stackPoint(12, TC.PURE5 - 1.96).offC.toFixed(3) + ' 音分');
expect('5', [stackListen('regular', 1.95, 12)], true, '調和律 w = 1.95：離 C ' + TC.stackPoint(12, TC.PURE5 - 1.95).offC.toFixed(3) + ' 音分');
expect('5', [stackListen('regular', 1.97, 12)], false, 'w = 1.97：離 C ' + TC.stackPoint(12, TC.PURE5 - 1.97).offC.toFixed(3));
expect('5', [stackListen('pythagorean', 0, 12)], false, '純五度回不去');
{
  const ev = search('6', () => allSelections(['equal'], [0], 0, 'listen'));
  expect('6', [ev], true, names(0, ev.data.notes) + '：拍頻 ' + ev.data.pairs[0].beat.toFixed(3) + ' Hz');
  expect('6', [listen('equal', 0, 0, [63, 70])], false, 'E♭4–B♭4：' + TC.intervalInfo('equal', 0, 0, 63, 70).beat.toFixed(3) + ' Hz');
}
{
  const ev = search('7', () => allSelections(['just'], [0], 0, 'select'));
  expect('7', [ev], true, '主音 C：' + names(0, ev.data.notes) + '（40/27，' + ev.data.pairs[0].dev.toFixed(3) + ' 音分）');
  expect('7', [sel('just', 0, 0, [70, 77], 'map')], true, '誤差地圖點 B♭ 的五度（B♭4–F5）');
  expect('7', [sel('just', 2, 0, [62, 69])], false, '主音 D 時 D–A 是純五度');
}
{
  const ev = search('8', () => allSelections(['pythagorean'], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 0, 'listen'));
  expect('8', [ev], true, '主音 ' + TC.TONIC_NAMES[ev.data.tonic] + '：' + names(ev.data.tonic, ev.data.notes));
  expect('8', [listen('pythagorean', 7, 0, [61, 68])], true, '主音 G：C♯4–G♯4');
  expect('8', [listen('pythagorean', 1, 0, [67, 74])], false, '主音 D♭：狼五度 G4–D5 超出鍵盤（只能從誤差地圖點）');
  expect('8', [listen('pythagorean', 0, 0, [66, 73])], false, '主音 C 不算');
}
{
  let sol = null;
  for (let i = 0; i <= 800 && !sol; i++) { const w = r3(i * 0.01); const m = byId('9'); m.mem = {}; if (m.check(narrow(w), m.mem)) sol = w; }
  expect('9', [narrow(sol)], true, '拖曳到 w = ' + sol + '（一般大三度誤差 ' + TC.regular(sol).M3.toFixed(4) + ' 音分；同音差/4 = ' + (TC.SYNTONIC / 4).toFixed(4) + '）');
  expect('9', [narrow(5.39)], false, 'w = 5.39（' + TC.regular(5.39).M3.toFixed(3) + '）');
}
{
  const ok = [];
  for (let i = 0; i <= 800; i++) { const w = r3(i * 0.01); const m = byId('10'); m.mem = {}; if (m.check(narrow(w), m.mem)) ok.push(w); }
  expect('10', [narrow(ok[0])], true, '拖曳到 w = ' + ok.join('、') + '（十二個五度比七個八度多 ' + ok.map(w => TC.regular(w).gap12.toFixed(3)).join('、') + ' 音分）');
  expect('10', [narrow(1.97)], false, 'w = 1.97');
}
{
  const ev = [];
  let tonic = null;
  for (let t = 0; t < 12 && tonic == null; t++) {
    const a = listen('just', t, 0, [60, 64, 67]), b = listen('just', t, 0, [62, 66, 69]);
    const m = byId('11'); m.mem = {};
    if (m.check(a, m.mem) || m.check(b, m.mem)) { tonic = t; ev.push(a, b); }
  }
  expect('11', ev, true, '主音 ' + TC.TONIC_NAMES[tonic] + '：C4–E4–G4 與 D4–F♯4–A4 都不拍（G、A、B 都可以）');
  expect('11', [listen('just', 9, 0, [64, 67, 72]), listen('just', 9, 0, [62, 66, 69])], true, '主音 A、C 大三和弦用轉位 E4–G4–C5 也可以');
  expect('11', [listen('just', 2, 0, [60, 64, 67]), listen('just', 2, 0, [62, 66, 69])], false, '主音 D：D 大三和弦純，但 C 大三和弦不純');
  expect('11', [listen('just', 7, 0, [60, 64, 67]), listen('just', 9, 0, [62, 66, 69])], false, '兩個和弦要在同一個主音下');
}
{
  const w = 5.38;
  const ev = search('12', () => allSelections(['regular'], [0], w, 'listen'));
  expect('12', [ev], true, 'w = ' + w + '、主音 C：' + names(0, ev.data.notes) + '（狼五度寬 +' + ev.data.pairs[0].dev.toFixed(2) + ' 音分，誤差地圖點 F♯ 的五度）');
  expect('12', [listen('regular', 7, w, [61, 68])], true, 'w = 5.38、主音 G：C♯4–G♯4 在鍵盤上就彈得到（+' + TC.intervalInfo('regular', 7, w, 61, 68).dev.toFixed(2) + '）');
  expect('12', [listen('regular', 0, 3, [66, 73])], false, 'w = 3 不是中全音律');
  expect('12', [listen('pythagorean', 0, 0, [66, 73])], false, '五度相生的狼是窄的');
}

// ---------- 隱藏任務 ----------
console.log('\n隱藏任務');
expect('h1', [listen('just', 0, 0, [60, 62]), listen('just', 0, 0, [62, 64])], true, '純律 C4–D4（9/8，大全音）與 D4–E4（10/9，小全音）都聽過');
expect('h1', [listen('just', 0, 0, [60, 62]), listen('just', 0, 0, [64, 66])], false, 'E–F♯ 也是 9/8');
expect('h1', [listen('equal', 0, 0, [60, 62]), listen('equal', 0, 0, [62, 64])], false, '平均律的全音一樣大');
expect('h2', [listen('pythagorean', 0, 0, [60, 61]), listen('pythagorean', 0, 0, [61, 62])], true, '五度相生 C4–D♭4（256/243，小半音）與 D♭4–D4（2187/2048，大半音）');
expect('h2', [listen('pythagorean', 0, 0, [60, 61]), listen('pythagorean', 0, 0, [62, 63])], false, 'D–E♭ 也是小半音');
expect('h3', [listen('just', 0, 0, [66, 73])], true, '純律主音 C：F♯4–C♯5（誤差地圖點 F♯ 的五度，+' + TC.intervalInfo('just', 0, 0, 66, 73).dev.toFixed(2) + '）');
expect('h3', [listen('just', 7, 0, [61, 68])], true, '純律主音 G：C♯4–G♯4（鍵盤上）');
expect('h3', [listen('just', 0, 0, [62, 69])], false, 'D–A 是窄的');
{
  const ev = search('h4', () => allSelections(['pythagorean'], [0], 0, 'listen'), [listen('pythagorean', 0, 0, [60, 64])]);
  expect('h4', [listen('pythagorean', 0, 0, [60, 64]), ev], true, '五度相生主音 C：' + names(0, ev.data.notes) + '（跨過狼五度的減四度 8192/6561，' + ev.data.pairs[0].dev.toFixed(3) + ' 音分），之前先聽過 C4–E4（81/64，+21.51）');
  expect('h4', [listen('pythagorean', 0, 0, [60, 64])], false, 'C–E 寬了 21.5 音分');
  expect('h4', [ev], false, '只聽溫柔的那一個、沒聽過一般寬 21.5 音分的大三度');
}
{
  const ok = [];
  for (let i = 0; i <= 800; i++) { const w = r3(i * 0.01); const m = byId('h5'); m.mem = {}; if (m.check(narrow(w), m.mem)) ok.push(w); }
  expect('h5', [narrow(ok[0])], true, 'w = ' + ok.join('、') + '（同音差/3 = ' + (TC.SYNTONIC / 3).toFixed(4) + '；小三度誤差 ' + TC.regular(ok[0]).m3.toFixed(4) + '）');
}
expect('h6', [stackListen('regular', 5.38, 12)], true, '中全音律 w = 5.38 疊 12 個五度：離 C ' + TC.stackPoint(12, TC.PURE5 - 5.38).offC.toFixed(3) + ' 音分（128/125 = −' + TC.DIESIS.toFixed(3) + '）');
expect('h6', [stackListen('regular', 5.43, 12)], false, 'w = 5.43');
{
  const ok = [];
  for (let i = 0; i <= 800; i++) { const w = r3(i * 0.01); const m = byId('h7'); m.mem = {}; if (m.check(narrow(w), m.mem)) ok.push(w); }
  expect('h7', [narrow(ok[0])], true, 'w = ' + ok.join('、') + '（同音差 × 2/7 = ' + (2 * TC.SYNTONIC / 7).toFixed(4) + '；大、小三度都差 ' + TC.regular(ok[0]).M3.toFixed(3) + ' 音分）');
}
expect('h8', [stackListen('pythagorean', 0, 53)], true, '純五度疊 53 個，和 C 一起聽：離 C +' + TC.stackPoint(53, TC.PURE5).offC.toFixed(3) + ' 音分、拍頻 ' + TC.stackPair(53, TC.PURE5).beat.toFixed(3) + ' Hz');
expect('h8', [stackListen('pythagorean', 0, 52), stackListen('pythagorean', 0, 54)], false, '52、54 個');
expect('h8', [stackListen('regular', 0.07, 53)], false, '調和律的五度不是純五度');
{
  const w = 3.58;
  const ev = search('h9', () => {
    const out = [];
    for (let t = 0; t < 12; t++) for (let a = 60; a <= 66; a++) out.push(listen('regular', t, w, [a, a + 6]));
    return out;
  });
  expect('h9', [ev], true, 'w = ' + w + '（同音差/6 = ' + (TC.SYNTONIC / 6).toFixed(4) + '）、主音 ' + TC.TONIC_NAMES[ev.data.tonic] + '：' + names(ev.data.tonic, ev.data.notes) + ' = ' + ev.data.pairs[0].cents.toFixed(3) + ' 音分（45/32 = ' + TC.cents(45 / 32).toFixed(3) + '）');
  expect('h9', [listen('just', 0, 0, [60, 66])], false, '純律的 C–F♯ 本來就是 45/32，不算');
}
{
  const sols = [];
  for (let n = 13; n <= 60; n++) {
    if (n % 12 === 0) continue;
    for (let i = 0; i <= 800; i++) {
      const w = r3(i * 0.01), e = stackListen('regular', w, n);
      const m = byId('h10'); m.mem = {};
      if (m.check(e, m.mem)) { sols.push([n, w, e.data.offC]); break; }
    }
  }
  const pick = sols.find(s => s[0] === 31) || sols[0];
  expect('h10', [stackListen('regular', pick[1], pick[0])], true, '調和律 w = ' + pick[1] + ' 疊 ' + pick[0] + ' 個五度：離 C ' + pick[2].toFixed(3) + ' 音分。其他解：' +
    sols.filter(s => s !== pick).map(s => s[0] + ' 個（w = ' + s[1] + '）').join('、'));
  found.h10 = [stackListen('regular', pick[1], pick[0])];
  expect('h10', [stackListen('regular', 1.955, 24)], false, '24 個（十二平均律的兩圈）不算');
}

// ---------- 隱藏任務兩兩不連帶完成 ----------
console.log('\n隱藏任務的解不會順便完成另一個隱藏任務');
{
  const hidden = missions.filter(m => m.hidden);
  let bad = 0;
  hidden.forEach(h => {
    const evs = found[h.id.replace('temperament-', '')];
    if (!evs) { bad++; console.log('  ✗ ' + h.id + ' 沒有解'); return; }
    // 也把達成這個解之前必須的設定事件算進去（例如調到 w 時會送出 narrow 事件）
    const pre = [];
    evs.forEach(e => { if (e.data && e.data.kind === 'regular' && e.data.w != null) pre.push(narrow(e.data.w)); });
    const others = hidden.filter(o => o !== h).filter(o => { o.mem = {}; return pre.concat(evs).some(e => o.check(e, o.mem)); }).map(o => o.id);
    if (others.length) { bad++; console.log('  ✗ ' + h.id + ' 的解也完成了 ' + others.join('、')); }
    else console.log('  ✓ ' + h.id + ' 的解不會完成其他隱藏任務');
  });
  if (bad) fail++;
}

// ---------- 亂按模擬：隨機操作 2000 回，每回 80 步（不刻意找答案） ----------
console.log('\n亂按模擬（2000 回 × 80 步隨機操作；滑桿隨機拖到 0.01 的格點）');
{
  let seed = 12345;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const pickI = n => Math.floor(rnd() * n);
  const counts = {};
  for (let run = 0; run < 2000; run++) {
    missions.forEach(m => { m.mem = {}; m.doneRun = false; });
    let kind = 'pythagorean', tonic = 0, w = 0, notes = [60, 64], n = 0;
    for (let step = 0; step < 80; step++) {
      const a = pickI(10);
      let ev = null;
      if (a === 0) { kind = TC.KINDS[pickI(4)]; ev = notes.length ? sel(kind, tonic, w, notes, 'tuning') : null; }
      else if (a === 1) { tonic = pickI(12); ev = notes.length ? sel(kind, tonic, w, notes, 'tonic') : null; }
      else if (a === 2 || a === 3) {
        const k = 60 + pickI(13), i = notes.indexOf(k);
        if (i >= 0) notes.splice(i, 1); else { notes.push(k); if (notes.length > 3) notes.shift(); }
        ev = notes.length ? sel(kind, tonic, w, notes, 'keys') : null;
      }
      else if (a === 4) { const pc = pickI(12), iv = [3, 4, 7][pickI(3)]; notes = [60 + pc, 60 + pc + iv]; ev = sel(kind, tonic, w, notes, 'map'); }
      else if (a === 5) ev = notes.length ? listen(kind, tonic, w, notes) : null;
      else if (a === 6) ev = notes.length ? compare(kind, tonic, w, notes) : null;
      else if (a === 7) { n = Math.min(60, n + 1); ev = null; }
      else if (a === 8) ev = stackListen(kind, w, n);
      else { w = r3(pickI(801) * 0.01); kind = 'regular'; ev = narrow(w); }
      if (!ev) continue;
      missions.forEach(m => { if (!m.doneRun && m.check(ev, m.mem)) { m.doneRun = true; counts[m.id] = (counts[m.id] || 0) + 1; } });
    }
  }
  const lines = missions.map(m => m.id + (m.hidden ? '（隱藏 ' : '（') + m.level + ' 級）' + ((counts[m.id] || 0) / 20).toFixed(1) + '%');
  console.log('  ' + lines.join('\n  '));
  const risky = missions.filter(m => m.level >= 6 && (counts[m.id] || 0) / 2000 > 0.05);
  if (risky.length) { fail++; console.log('  ✗ 6 級以上的任務亂按就完成的比例超過 5%：' + risky.map(m => m.id).join('、')); }
  else console.log('  ✓ 6 級以上的任務亂按完成的比例都不到 5%');
}

// ---------- 總覽 ----------
const pub = missions.filter(m => !m.hidden), hid = missions.filter(m => m.hidden);
const starsOf = m => (m.hidden ? 2 : 1) * m.level;
const stars = missions.reduce((s, m) => s + starsOf(m), 0);
console.log(`\n公開 ${pub.length} 個、隱藏 ${hid.length} 個，共 ${stars} 顆星（公開 ${pub.reduce((s, m) => s + m.level, 0)}、隱藏 ${hid.reduce((s, m) => s + starsOf(m), 0)}，隱藏任務是等級 × 2）。`);
if (hid.length !== 10) { fail++; console.log('隱藏任務要 10 個。'); }
if (hid.filter(m => m.level >= 7).length < 3) { fail++; console.log('隱藏任務至少 3 個要在 7 級以上。'); }
if (hid.some(m => m.level < 3 || m.level > 10)) { fail++; console.log('隱藏任務的等級要在 3–10。'); }
if (hid.some(m => starsOf(m) > 20)) { fail++; console.log('隱藏任務超過 20 顆星（規則上限）。'); }
if (pub.length < 10 || pub.length > 12) { fail++; console.log('公開任務要 10–12 個。'); }
if (fail) { console.log(`有 ${fail} 項不符合。`); process.exit(1); }
console.log('全部任務都證明做得到，預設狀態不觸發，隱藏任務之間不連帶完成。');
