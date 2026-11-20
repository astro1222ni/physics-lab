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
  console.log('114 GSAT physics and grading passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
