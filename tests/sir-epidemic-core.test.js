'use strict';
const assert = require('node:assert/strict');
const C = require('../js/sir-epidemic-core.js');
const base = {basic:2.5,immune:0,mask:0,air:0};
const near = (actual,expected,tol=1e-10) => assert.ok(Math.abs(actual-expected)<tol,actual+' ≠ '+expected);

for(const basic of [.5,1,1.25,2.5,5]) for(const immune of [0,.4,.9]) for(const mask of [0,.3,.8]) {
  const cfg={...base,basic,immune,mask}, r=C.simulate(cfg), first=r.points[0];
  assert.equal(r.points.length,181);
  let daily=0;
  for(const p of r.points) {
    near(p.s+p.i+p.r,1);
    assert.ok([p.s,p.i,p.r].every(k=>k>=0 && k<=1));
    near(p.re,r.effective*p.s);
    near(p.dailyIncidence,C.GAMMA*r.effective*p.s*p.i);
    near(p.s+p.i-Math.log(p.s)/r.effective,first.s+first.i-Math.log(first.s)/r.effective,6e-8);
    if(p.day) {
      const prev=r.points[p.day-1];
      near(p.dailyNew,prev.s-p.s);assert.ok(p.re<=prev.re && p.r>=prev.r);
    }
    daily+=p.dailyNew;near(daily,p.cumulativeInfected);
    const n=C.population(p);
    assert.equal(n.s+n.i+n.r,C.PEOPLE);
    assert.ok(Object.values(n).every(Number.isInteger));
  }
  near(daily,r.newByEnd);
  // Independent analytic peak from the SIR invariant, and final-size residual.
  if(r.initialRe>1) {
    const peak=first.i+first.s-(1+Math.log(r.effective*first.s))/r.effective;
    near(r.peak,peak,6e-8);near(r.crossing.re,1);
    const lo=r.points[Math.floor(r.crossing.day)], hi=r.points[Math.ceil(r.crossing.day)];
    assert.ok(lo.re>=1 && hi.re<=1);
    assert.ok(r.crossing.day>=lo.day && r.crossing.day<=hi.day);
    near(r.reCrossDay,r.crossing.day);near(r.peakDay,r.reCrossDay);near(r.crossing.i,r.peak);
    assert.ok(r.points.every(p=>p.i<=r.peak+1e-12));
    assert.ok(Math.abs(r.points.reduce((a,b)=>a.i>b.i?a:b).day-r.peakDay)<.54);
  } else {
    assert.equal(r.peakDay,0);assert.equal(r.reCrossDay,null);near(r.peak,first.i);
    assert.ok(r.points[1].i<=first.i);
  }
  const sInfinity=first.s+first.i-r.finalInfected;
  near(sInfinity,first.s*Math.exp(-r.effective*r.finalInfected));
  near(r.finalNonSusceptible,1-sInfinity);
  near(r.threshold,Math.max(0,1-1/basic));near(r.effectiveThreshold,Math.max(0,1-1/r.effective));
  assert.ok(r.finalInfected>=r.newByEnd+first.i-1e-11);
}
const empty=C.simulate({...base,seed:0}); assert.equal(empty.peak,0);assert.equal(empty.finalInfected,0);assert.equal(empty.crossing,null);
const noTransmission=C.simulate({...base,mask:1});
for(const p of noTransmission.points) {near(p.s,.99);near(p.i,.01*Math.exp(-C.GAMMA*p.day),2e-11);assert.equal(p.dailyNew,0);}
near(noTransmission.finalInfected,.01);
const atOne=C.simulate({...base,basic:2,immune:.49});
assert.equal(atOne.reCrossDay,null);assert.equal(atOne.peakDay,0);
assert.equal(C.simulate({...base,basic:5,immune:.79}).reCrossDay,null);
const threshold=C.simulate({...base,basic:2,immune:.5});
assert.ok(threshold.initialRe<1 && threshold.points[1].i<threshold.points[0].i);
assert.equal(threshold.crossing,null);
const over=C.simulate(base);assert.ok(over.finalNonSusceptible>over.effectiveThreshold);
const protectedSchool=C.simulate({basic:2,immune:.16,mask:.20,air:.22});
assert.ok(protectedSchool.initialRe>1);
assert.ok(protectedSchool.finalInfected<protectedSchool.effectiveThreshold);
assert.ok(protectedSchool.finalNonSusceptible>protectedSchool.effectiveThreshold);
assert.ok(protectedSchool.finalNonSusceptible<protectedSchool.threshold);
for(const [immune,seed,wantS,wantI,wantR] of [[1,.1,0,0,1],[.98,.1,0,.02,.98],[2,.2,0,0,1],[-.5,-.1,1,0,0],[0,2,0,1,0]]) {
  const r=C.simulate({...base,immune,seed}), p=r.points[0];
  near(p.s,wantS);near(p.i,wantI);near(p.r,wantR);
  near(r.finalInfected,wantI);near(r.finalNonSusceptible,wantR+wantI);
  for(const v of r.points) {
    near(v.s+v.i+v.r,1);assert.ok([v.s,v.i,v.r].every(n=>n>=0 && n<=1));
    assert.equal(v.dailyIncidence,0);assert.equal(v.cumulativeInfected,0);
  }
}

// Integrate dt = -dS/(β S I(S)) from the start to S = 1/k, independently of RK4.
function peakTimeFromSusceptibles(run) {
  const p=run.points[0], k=run.effective, limit=1/k, steps=4096, width=(p.s-limit)/steps;
  function inverseFlow(s) { return 1/(C.GAMMA*k*s*(p.i+p.s-s+Math.log(s/p.s)/k)); }
  let sum=inverseFlow(p.s)+inverseFlow(limit);
  for(let j=1;j<steps;j++) sum+=(j%2?4:2)*inverseFlow(limit+j*width);
  return sum*width/3;
}
const quick=C.simulate({...base,basic:6});
for(const run of [over,quick,protectedSchool]) {
  near(run.peakDay,peakTimeFromSusceptibles(run),2e-5);
  near(run.reCrossDay,peakTimeFromSusceptibles(run),2e-5);
}
assert.equal(quick.points.reduce((a,b)=>a.i>b.i?a:b).day,6);
assert.equal(quick.points.find(p=>p.re<=1).day,7);
near(quick.reCrossDay,6.3749,.0001);
const almostCritical=C.simulate({...base,basic:1.05});
assert.ok(almostCritical.peakDay<C.simulate({...base,basic:1.20}).peakDay);
for(const basic of [1.45,1.55]) {
  const r=C.simulate({...base,basic});assert.ok(r.peakDay>30 && r.peak>.05);
}
const artificial=[0,.2,0].map(dailyIncidence=>({dailyIncidence,cumulativeInfected:99}));
near(C.integrateIncidence(artificial,.5,1.5),.15);
near(C.integrateIncidence(artificial,-1,9),.2);
near(C.integrateIncidence(artificial,.2,1.8),C.integrateIncidence(artificial,.2,1)+C.integrateIncidence(artificial,1,1.8));
near(C.integrateIncidence(noTransmission.points,0,180),0);
assert.ok(over.points[0].dailyIncidence>0 && over.points[0].cumulativeInfected===0);
assert.ok(over.points[180].cumulativeInfected>.8 && C.integrateIncidence(over.points,179,180)<1e-8);
const slow=C.simulate({...base,basic:1.05});assert.ok(slow.finalInfected>slow.newByEnd+.0101);
const pair=C.simulate({...base,basic:4,mask:.5}), other=C.simulate({...base,basic:2});
assert.deepEqual(pair.points,other.points);
assert.deepEqual(C.population({s:.375,i:.375,r:.25},4),{s:2,i:1,r:1});
for(const p of over.points) {
  const counts=C.population(p), seats={s:0,i:0,r:0};
  for(let k=0;k<400;k++) seats[C.groupAt(k,counts)]++;
  assert.deepEqual(seats,counts);assert.deepEqual(C.population(p),counts);
}
const d=C.measurement(base,over,5);near(d.yesterday.i,over.points[4].i);near(d.start.s,.99);

for(const [value,number,side] of [[.949,'0.95',null],[.95,'0.950',-1],[.99952,'1.000',-1],
  [1,'1.000',0],[1.00157,'1.002',1],[1.05,'1.050',1],[1.051,'1.05',null]]) {
  assert.deepEqual(C.reReading(value),{number,side});
}
for(const [basic,immune] of [[2,.49],[2.5,.59]]) {
  const threshold=C.simulate({...base,basic,immune});
  near(threshold.initialRe,1);
  assert.ok(threshold.points[1].i<threshold.points[0].i);
  assert.equal(threshold.reCrossDay,null);
}
near(C.simulate({...base,basic:2,immune:.50}).initialRe,.98);
const narrow=C.simulate({...base,basic:1.02});
assert.ok(narrow.reCrossDay>4 && narrow.reCrossDay<5);
assert.deepEqual(C.reReading(narrow.points[4].re),{number:'1.002',side:1});
assert.deepEqual(C.reReading(narrow.points[5].re),{number:'1.000',side:-1});

// Day one has a real previous day: incidence falls while the infectious share rises.
const onset=C.measurement({...base,basic:1.02},narrow,1);
assert.equal((100*onset.yesterday.dailyIncidence).toFixed(7),'0.2019600');
assert.equal((100*onset.dailyIncidence).toFixed(7),'0.2019019');
assert.ok(onset.i>onset.yesterday.i && onset.day+1<onset.peakDay);
const guarded={...base,mask:.4}, tail=C.measurement(guarded,C.simulate(guarded),40);
assert.equal(tail.counts.i,25);
assert.ok(tail.initialRe>1 && tail.yesterday.day>tail.peakDay && tail.dailyIncidence>0);
assert.equal((100*tail.finalNonSusceptible).toFixed(2),'59.36');
assert.equal((100*tail.effectiveThreshold).toFixed(2),'33.33');
const book=C.casebook();
assert.equal(book.record(onset,[]),null);
assert.equal(book.record(onset,['8','h2']),null);
assert.equal(book.record(onset,['8']),'8');
assert.equal(book.record({...onset,day:5,prior:onset},['h2']),'8');
assert.equal(book.owner({...onset,basic:1.021}),null);
assert.equal(C.casebook(book.entries()).owner(onset),'8');
console.log('SIR 核心通過，含守恆、連續峰時與交點、門檻、即時速率、第 1 天反例、過衝及情境記錄。');
