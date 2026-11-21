'use strict';
const assert=require('node:assert/strict');
const C=require('../js/exam/114-core'), engine=require('../js/learn');
(async()=>{
  const low=C.orbit(420), high=C.orbit(35800);
  assert.ok(Math.abs(low.radius/6.79e6-1)<.001 && Math.abs(high.radius/4.22e7-1)<.001);
  assert.ok(Math.abs(high.period/86400-1)<.01 && low.speed>high.speed && low.acceleration>high.acceleration);
  assert.equal(C.orbit(420,3).speed,low.speed);
  assert.ok(Math.abs(low.speed**2/2+low.potential-low.energy)<1e-6);
  assert.equal(C.frequencyRatio(0),1);
  assert.ok(Math.abs(C.frequencyRatio(.00001)-(1-.00001))<1e-10);
  assert.equal(C.flight(3,true).ratio,1);
  for(const t of [.3,1.5,2.8])assert.ok(C.flight(t,true).ratio<1);
  assert.equal(C.flight(1,false).ratio,C.flight(2,false).ratio);
  const fit=C.fit(C.samples);
  assert.ok(fit.voltage>=45 && fit.voltage<=55 && fit.resistance>=125 && fit.resistance<=175);
  assert.ok(Math.abs(fit.current(fit.voltage))<1e-12);
  assert.equal(C.measure(fit,10,10).resistance,null);
  assert.ok(Math.abs(C.measure(fit,40,-20).resistance-fit.resistance)<1e-10);
  for(let bits=0;bits<32;bits++){
    const selected=[...'ABCDE'].filter((_,i)=>bits & (1<<i)).join('');
    const errors=[...'ABCDE'].filter(x=>selected.includes(x)!=='DE'.includes(x)).length;
    assert.equal(C.multiple(selected,'DE').score,selected ? [2,1.2,.4,0,0,0][errors] : 0);
  }
  const grade=(a,u,b,v)=>C.gradeChannel([{value:a,unit:u},{value:b,unit:v}],engine);
  for(const [v,r] of [['.045','.125'],['.055','.175'],['５×１０＾－２','3/20']])
    assert.equal((await grade(v,'V',r,'kΩ')).score,4);
  assert.equal((await grade('50','','150','Ω')).score,2);
  assert.equal((await grade('44','mV','176','Ω')).score,0);
  assert.equal((await grade('50mV','V','150','V')).score,0);
  // 其餘 11 題
  const Q=4.3e17;
  assert.equal(C.single('B','B').score,2);assert.equal(C.single('C','B').score,0);
  const m=C.melt(Q);assert.equal(m.latent,3.2e5);assert.ok(Math.abs(m.mass/1.34e12-1)<.01);assert.equal(C.magnitude(m.mass),12);
  assert.equal(C.magnitude(Q/80),16);                          // 錯選 C：大卡沒換焦耳
  const L=C.lift(Q);assert.equal(L.perReservoir,3.2e15);assert.ok(Math.abs(L.count-134.4)<.1);assert.equal(C.magnitude(L.count),2);
  assert.equal(C.magnitude(Q/(8e7*10*4000)),5);                  // 錯選 B：立方公尺當公斤
  const tr=C.trip();assert.equal(tr.distance,1.8e11);assert.ok(Math.abs(tr.speed-1.0417e4)<1);assert.equal(C.magnitude(tr.speed),4);
  assert.equal(C.magnitude(1.8e11/(200*1440)),6);                // 錯選 D：只換到分鐘
  assert.equal(C.level(1),-13.6);assert.ok(Math.abs(C.emission(3,2).wavelength-656.3)<1.5);
  assert.ok(C.emission(3,1).wavelength<C.emission(2,1).wavelength&&C.emission(3,2).wavelength>C.emission(2,1).wavelength);
  assert.equal(C.slit(0),1);assert.ok(C.slit(.5)<1e-12&&C.slit(1)>.85);
  const hits=C.electrons(4000,7),bright=hits.filter(([u])=>Math.abs(u-Math.round(u))<.15).length,dark=hits.filter(([u])=>Math.abs(u-Math.round(u)-.5)<.15||Math.abs(u-Math.round(u)+.5)<.15).length;
  assert.ok(bright>8*dark);assert.deepEqual(C.electrons(5,3),C.electrons(5,3));
  assert.equal(C.induction(.3,{ac:false}).emf,0);assert.ok(Math.abs(C.induction(0,{freq:2}).emf+4*Math.PI)<1e-9);
  assert.ok(Math.abs(C.induction(.25,{freq:1}).emf)<1e-9);       // 電流最大時 dI/dt＝0
  assert.ok(C.isEnergy([['e',1],['E',1]])&&C.isEnergy([['alpha',1],['T',1]]));
  assert.ok(!C.isEnergy([['T',1]])&&!C.isEnergy([['alpha',1],['e',-1]])&&!C.isEnergy([['T',1],['e',-1]]));
  assert.ok(Math.abs(C.voltageRatio(27,17)-300.15/290.15)<1e-12&&Math.abs(C.voltageRatio(27,17)-300/290)<.001);
  assert.ok(Math.abs(C.cutoff(3.2)-388.5)<.5&&Math.abs(C.photonEV(400)-3.0996)<.001&&C.photonEV(400)<3.2);
  const cat=(v,u,r,w)=>C.gradeCatalyst([{value:v,unit:u},{value:r},{value:w}],engine);
  assert.equal((await cat('388','nm','<','longer')).score,4);assert.equal((await cat('3.9×10^-7','m','<','longer')).score,4);
  assert.equal((await cat('388','','<','shorter')).score,0);assert.equal((await cat('0.39','μm','>','longer')).score,2);
  console.log('114 GSAT physics and grading passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
