/* 任務可達成的證明腳本（從製作時的暫存資料夾保存下來的快照）。用法：node tools/mission-proofs/ideal-gas.js
 * 修改物理核心或任務條件後重跑，確認每個任務仍然做得到、預設狀態不會觸發任務。 */
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
// 用物理核心模擬頁面的操作流程，證明每個任務都做得到
const C = require(__ROOT + 'js/ideal-gas-core.js');
const fs = require('fs'), vm = require('vm');
let missions = [];
const LM = { register: (id, list) => { missions = list.map(m => Object.assign({ mem: {} }, m)); } }; const sandbox = { window: { LabMission: LM }, LabMission: LM };
vm.runInNewContext(fs.readFileSync(__ROOT + 'js/missions/ideal-gas.js', 'utf8'), sandbox);
const SP = C.SPECIES, AREA = 400, ALPHA = 0.01;
const kPa = p => C.toSI.pressureKPa(p);

class Page {
  constructor(seed) {
    this.seed = seed || 1;
    Object.assign(this, { mode: 'isothermal', spA: 0, spB: 2, mix: false, frac: 50, N: 200, Tset: 300, Pset: 100,
      epoch: 0, init: 'maxwell', initAt: 0, adStart: null, modeTime: { isothermal: 0, isochoric: 0, isobaric: 0, adiabatic: 0 }, tChanges: 0, Wcum: 0, ffEma: 0, ff: false, done: {}, log: [] });
    this.newGas(300);
  }
  bath() { return this.mode !== 'adiabatic'; }
  sp(k) { return SP[k === 0 ? this.spA : this.spB]; }
  counts() { const nB = this.mix ? Math.max(1, Math.round(this.N * this.frac / 100)) : 0; return [this.N - nB, nB]; }
  heavy() { return this.mix ? Math.max(this.sp(0).m, this.sp(1).m) : this.sp(0).m; }
  newGas(T, init) {
    const old = this.g;
    this.g = C.createGas({ species: [this.sp(0), this.sp(1)], counts: this.counts(), T, Lx: old ? old.Lx : 20, Ly: 20, Lz: 20, LxMin: 10, LxMax: 30, seed: this.seed++, bath: this.bath(), bathT: this.Tset, diffuse: true, init: init || 'maxwell' });
    if (old) { Object.assign(this.g.piston, { mode: old.piston.mode, target: old.piston.target, Pset: old.piston.Pset, pEma: old.piston.pEma }); this.g.t = old.t; }
    this.epoch++; this.init = init || 'maxwell'; this.initAt = this.g.t;
    this.mL = new C.Meter(5); this.mS = new C.Meter(2); this.settle = this.g.t + 60;
  }
  T() { const s = this.mL.blocks.length ? this.mL.stats(1500) : null; return s && s.t >= 20 ? s.T : C.temperature(this.g); }
  mark(settle) { this.mL.reset(); this.settle = this.g.t + (settle == null ? this.settleTime() : settle); }
  settleTime() { if (!this.bath()) return 20; return Math.max(20, Math.min(400, 3 * 12 / C.vmean(Math.max(30, this.Tset), this.heavy()))); }
  setMode(m) {
    const prev = this.mode, Tn = this.T(); this.mode = m;
    if (prev === 'adiabatic') this.Tset = Math.max(50, Math.min(1000, Math.round(Tn * 10) / 10));
    this.g.bath.on = this.bath(); this.g.bath.T = this.Tset;
    if (m === 'isobaric') {
      const s = this.mL.blocks.length ? this.mL.stats(1500) : this.mS.stats(40);
      this.Pset = Math.round(kPa(s.P) * 10) / 10;
      Object.assign(this.g.piston, { mode: 'pressure', Pset: C.fromSI.pressureKPa(this.Pset), pEma: s.P }); this.ffEma = 0; this.ff = false;
    } else { this.g.piston.mode = 'target'; this.g.piston.target = Math.round(this.g.Lx * AREA) / AREA; }
    this.adStart = m === 'adiabatic' ? { T: C.temperature(this.g), V: this.g.Lx * AREA, epoch: this.epoch } : null;
    this.mark();
  }
  setT(T) { this.Tset = T; this.tChanges++; if (this.mode !== 'isobaric') this.g.bath.T = T; this.mark(); }
  setV(V) { this.g.piston.target = V / AREA; }
  setSpecies(a) { this.spA = a; if (this.spB === a) this.spB = a === 2 ? 0 : 2; this.newGas(this.bath() ? this.Tset : this.T()); if (this.mode === 'adiabatic') this.setAd(); }
  setMix(on, b, frac) { this.mix = on; if (b != null) this.spB = b; if (frac != null) this.frac = frac; this.newGas(this.bath() ? this.Tset : this.T()); if (this.mode === 'adiabatic') this.setAd(); }
  setAd() { this.adStart = { T: C.temperature(this.g), V: this.g.Lx * AREA, epoch: this.epoch }; }
  sameSpeed() { C.sameSpeed(this.g); this.init = 'same'; this.initAt = this.g.t; this.epoch++; this.mS.reset(); this.mark(5); if (this.mode === 'adiabatic') this.setAd(); }
  run(ps) {
    const g = this.g;
    for (let k = 0; k < ps; k += 2) {
      const vb = C.vmean(Math.max(30, C.temperature(g)), this.heavy());
      g.piston.vmax = ALPHA * vb; g.piston.tau = 60 / vb;
      let moving;
      if (g.piston.mode === 'target') moving = Math.abs(Math.max(10, Math.min(30, g.piston.target)) - g.Lx) > 1e-7;
      else {
        if (this.ff && Math.abs(this.ffEma) < 0.15) this.ff = false; else if (!this.ff && Math.abs(this.ffEma) > 0.35) this.ff = true;
        if (g.bath.T !== this.Tset) this.ff = true;
        moving = this.ff;
      }
      if (moving || this.wasMoving) this.mark(this.bath() ? Math.max(20, this.settleTime() * 0.6) : 20);
      this.wasMoving = moving;
      if (this.mode === 'isobaric' && g.bath.T !== this.Tset) {
        const f = Math.exp(0.35 * g.piston.vmax / g.Lx * 2), Tb = g.bath.T;
        g.bath.T = this.Tset > Tb ? Math.min(this.Tset, Tb * f) : Math.max(this.Tset, Tb / f);
      }
      C.advance(g, 2);
      if (g.piston.mode === 'pressure') this.ffEma += (2 / 200) * (g.u / g.piston.vmax - this.ffEma);
      const a = C.takeAcc(g), c = C.countBySpecies(g), ms = [this.sp(0).m, this.sp(1).m];
      this.mS.add(a, c, ms);
      if (!moving && g.t >= this.settle) this.mL.add(a, c, ms);
      this.Wcum += a.W;
      this.modeTime[this.mode] += 2;
      if ((k / 2) % 10 === 9) this.emit();
    }
    return this;
  }
  emit() {
    const s = this.mL.blocks.length ? this.mL.stats(1500) : null;
    if (!s || s.t < 60) return;
    const r4 = this.mL.stats(400), c = s.counts, sA = this.sp(0), sB = this.sp(1);
    const d = { mode: this.mode, epoch: this.epoch, init: this.init, sinceInit: this.g.t - this.initAt, t: this.g.t, N: s.N, nA: c[0], nB: c[1], mix: this.mix && c[1] > 0,
      spA: sA.id, spB: this.mix ? sB.id : null, mA: sA.m, mB: this.mix ? sB.m : null, V: s.V, Tset: this.Tset, bath: this.bath(), T: s.T, Terr: s.Terr,
      P: kPa(s.P), Perr: kPa(s.Perr), window: s.t, vrmsA: C.toSI.speed(s.vrms[0]), vrmsB: c[1] ? C.toSI.speed(s.vrms[1]) : null,
      keA: C.toSI.energy(s.KE[0]), keB: c[1] ? C.toSI.energy(s.KE[1]) : null, TA: s.Ts[0], TB: c[1] ? s.Ts[1] : null,
      adStart: this.mode === 'adiabatic' && this.adStart ? Object.assign({ P: kPa(C.idealP(this.g.n, this.adStart.T, this.adStart.V)) }, this.adStart) : null,
      Wcum: C.toSI.energy(this.Wcum), Qcum: 0, Pset: this.mode === 'isobaric' ? this.Pset : null,
      keA4: C.toSI.energy(r4.KE[0]), keB4: c[1] ? C.toSI.energy(r4.KE[1]) : null, modeTime: Object.assign({}, this.modeTime), tChanges: this.tChanges };
    this.last = d;
    missions.forEach(m => { if (!this.done[m.id] && m.check({ type: 'measure', data: d }, m.mem)) { this.done[m.id] = true; this.log.push(m.id + ' @ ' + d.t.toFixed(0) + ' ps'); } });
  }
  until(fn, max) { let t = 0; while (!fn() && t < (max || 20000)) { this.run(20); t += 20; } return t; }
  moveTo(V) { this.setV(V); this.until(() => Math.abs(this.g.Lx * AREA - V) < 1e-4); return this; }
  info(tag) { const d = this.last; console.log('   ', tag, d ? `mode=${d.mode} V=${d.V.toFixed(0)} T=${d.T.toFixed(1)} P=${d.P.toFixed(2)} vrms=${d.vrmsA.toFixed(1)} win=${d.window.toFixed(0)}` : '-'); }
}
function fresh() { missions.forEach(m => m.mem = {}); }
function report(p, ids) { console.log('  done:', ids.map(id => id + (p.done[id] ? ' ✓' : ' ✗')).join('  ')); }

const T0 = Date.now();
let p;
console.log('預設狀態（只播放，不操作）');
fresh(); p = new Page(101); p.run(3000); console.log('  任務觸發：', p.log.length ? p.log : '無');

console.log('任務 1：等溫壓縮到 4000 nm³'); fresh(); p = new Page(102); p.moveTo(4000).run(400); p.info('after'); report(p, ['ideal-gas-1']);
console.log('任務 2：恆溫槽 80 K'); fresh(); p = new Page(103); p.setT(80); p.run(800); p.info('after'); report(p, ['ideal-gas-2']);
console.log('任務 3：氦 → 氙，N、V、T 相同'); fresh(); p = new Page(104); p.setT(300); p.run(1200); p.info('He'); p.setSpecies(4); p.run(1500); p.info('Xe'); report(p, ['ideal-gas-3']);
console.log('任務 4：等溫 8000 → 4000'); fresh(); p = new Page(105); p.setT(300); p.run(800); p.info('8000'); p.moveTo(4000).run(800); p.info('4000'); report(p, ['ideal-gas-4']);
console.log('任務 5：等容 300 → 600 K'); fresh(); p = new Page(106); p.setMode('isochoric'); p.run(800); p.info('300'); p.setT(600); p.run(1000); p.info('600'); report(p, ['ideal-gas-5']);
console.log('任務 6：等壓 300 → 450 K'); fresh(); p = new Page(107); p.moveTo(6000).run(600); p.setMode('isobaric'); p.run(800); p.info('300 K'); p.setT(450); p.run(6000); p.info('450 K'); report(p, ['ideal-gas-6']);
console.log('任務 7：氬 400.4 K → v_rms 500 m/s'); fresh(); p = new Page(108); p.setSpecies(2); p.setT(400.4); p.run(1500); p.info('Ar'); report(p, ['ideal-gas-7']);
console.log('任務 8：氦 60 K 與氬 598.8 K'); fresh(); p = new Page(109); p.setT(60); p.run(1500); p.info('He 60'); p.setSpecies(2); p.setT(598.8); p.run(1500); p.info('Ar 598.8'); report(p, ['ideal-gas-8']);
console.log('任務 9：絕熱壓縮使 T × 1.5'); fresh(); p = new Page(110); p.run(300); p.setMode('adiabatic');
{ const T0a = p.adStart.T; let V = 8000; console.log('    T0 =', T0a.toFixed(1)); while (C.temperature(p.g) / T0a < 1.49 && V > 4000) { V -= 100; p.moveTo(V); } p.run(200); p.info('V=' + V); }
report(p, ['ideal-gas-9']);
console.log('任務 10：絕熱、氦＋氬、同速率'); fresh(); p = new Page(111); p.setMode('adiabatic'); p.setMix(true, 2, 50); p.sameSpeed(); p.run(3000); p.info('mix'); console.log('    keA4/keB4 =', (p.last.keA4 / p.last.keB4).toFixed(3)); report(p, ['ideal-gas-10']);
console.log('任務 11：等容 → 等壓 → 等容 → 等壓 的矩形循環');
fresh(); p = new Page(112); p.moveTo(6000).run(600); p.info('A');
p.setMode('isochoric'); p.setT(600); p.run(900); p.info('B');
p.setMode('isobaric'); p.setT(900); p.run(5000); p.info('C');
p.setMode('isochoric'); p.setT(450); p.run(900); p.info('D');
p.setMode('isobaric'); p.setT(300); p.run(6000); p.info('A\'');
report(p, ['ideal-gas-11']);
console.log('任務 12：卡諾循環（N = 300，900 K ↔ 約 560 K）');
fresh(); p = new Page(113); p.N = 300; p.newGas(300); p.setT(900); p.moveTo(4000).run(800); p.info('A 900K 4000');
p.moveTo(6000).run(400); p.info('B 等溫膨脹');
p.setMode('adiabatic'); p.moveTo(12000).run(200); p.info('C 絕熱膨脹');
p.setMode('isothermal'); { const VD = Math.round(4000 * Math.pow(900 / p.Tset, 1.5) * 1.08 / 10) * 10; console.log('    冷等溫 Tset =', p.Tset, '，壓縮到 V_D =', VD); p.moveTo(VD).run(400); p.info('D 等溫壓縮'); }
p.setMode('adiabatic'); { let V = 8000; while (C.temperature(p.g) < 0.985 * 900 && V > 4000) { V -= 100; p.moveTo(V); } p.run(200); p.info('E 絕熱壓縮到 T≈900'); }
p.setMode('isothermal'); console.log('    熱等溫 Tset =', p.Tset); p.moveTo(4000).run(600); p.info("A' 回到 4000");
report(p, ['ideal-gas-11', 'ideal-gas-12']);
if (process.env.DBG) {
  const m = missions.find(x => x.id === 'ideal-gas-11');
  const L = m.mem.hist || [];
  console.log('hist entries', L.length);
  L.forEach(e => console.log('  ', e.t.toFixed(0), e.V.toFixed(0), e.T.toFixed(1), (e.W * 1e19).toFixed(2), e.epoch, e.N, e.tc));
}
console.log('隱藏 h1：273.2 K、7478 nm³'); fresh(); p = new Page(114); p.setT(273.2); p.moveTo(7478).run(2000); p.info('STP'); report(p, ['ideal-gas-h1']);
console.log('隱藏 h2：4000 → 12000 絕熱膨脹'); fresh(); p = new Page(115); p.moveTo(4000).run(300); p.setMode('adiabatic'); p.moveTo(12000).run(200); p.info('cold'); console.log('    T/T0 =', (p.last.T / p.adStart.T).toFixed(3)); report(p, ['ideal-gas-h2']);
console.log('隱藏 h3：氙 50 K'); fresh(); p = new Page(116); p.setSpecies(4); p.setT(50); p.run(2500); p.info('Xe 50'); report(p, ['ideal-gas-h3']);
console.log('總時間', ((Date.now() - T0) / 1000).toFixed(1), 's');
