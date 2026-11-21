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
// Frozen digest of all eight continuous fields on all 181 published dates.
const continuous=over.points.map(({counts,...p})=>p);
assert.equal(require('node:crypto').createHash('sha256').update(JSON.stringify(continuous)).digest('hex'),
  '196ba26869ecd868f050fa41ae8c5aa4b3a83c7f68430c6f72dd65c5a29443b7');
assert.deepEqual(C.school().sizes,Array(10).fill(40));
for(const classes of [4,9,16]) for(const size of [20,32,45]) {
  assert.equal(C.school({classes,size}).total,classes*size);
  for(const seed of [0,1,1121,4294967295]) {
    const cfg={classes,size,varied:true,seed}, layout=C.school(cfg);
    assert.deepEqual(C.school(cfg),layout);
    assert.ok(layout.sizes.every(n=>n>=Math.max(15,Math.round(size*.75)) && n<=Math.min(50,Math.round(size*1.25))));
    assert.equal(layout.total,layout.sizes.reduce((a,b)=>a+b));
    const seats=layout.sizes.flatMap((n,j)=>Array.from({length:n},(_,k)=>C.seatAt(layout,j,k)));
    assert.equal(new Set(seats.map(v=>v.row*20+v.col)).size,layout.total);
    assert.deepEqual(seats.map(v=>v.seat),seats.map((_,i)=>i));
  }
}
assert.notDeepEqual(C.school({varied:true,seed:1}).sizes,C.school({varied:true,seed:2}).sizes);
for(const n of [15,30,137,274,400,548,800]) {
  for(let r=0;r<=n;r++) {
    const count={s:n-r,i:0,r};
    assert.equal(Array.from({length:n},(_,k)=>C.groupAt(k,count,n)).filter(v=>v==='r').length,r);
  }
}

const variedCfg={...base,school:{classes:12,size:38,varied:true,seed:1121}};
const varied=C.simulate(variedCfg), {sizes,total}=varied.campus;
const small=C.simulate({...base,school:{classes:4,size:40}}), big=C.simulate({...base,school:{classes:16,size:40}});
const eighty=C.simulate({...base,school:{classes:4,size:20}});
assert.equal(eighty.points[0].counts.i,1); // 0.8 students rounds once for the whole school.
assert.equal(eighty.points[0].classCounts.reduce((sum,c)=>sum+c.i,0),1);
assert.ok(big.schoolR0>small.schoolR0 && big.points[10].i>small.points[10].i);
near(big.schoolR0,base.basic*((1-C.MIXING)+C.MIXING*Math.sqrt(640/400)));
const largeClass=sizes.indexOf(Math.max(...sizes)), smallClass=sizes.indexOf(Math.min(...sizes));
const top=j=>varied.points.reduce((best,p)=>p.groups[j].i>best.groups[j].i?p:best);
assert.ok(top(largeClass).groups[largeClass].i>top(smallClass).groups[smallClass].i && top(largeClass).day<top(smallClass).day);
assert.ok(Math.abs(varied.peakDay-varied.reCrossDay)>.1);near(varied.crossing.re,1,1e-10);

const singleSeed={...variedCfg,origin:2}, isolated=C.simulate({...singleSeed,mixing:0}), mixed=C.simulate(singleSeed);
near(isolated.points[0].i,.01);
for(const p of isolated.points) for(const [j,g] of p.groups.entries()) if(j!==2) {
  assert.equal(g.i,0); assert.equal(g.s,1); assert.equal(isolated.finalByClass[j],0);
}
assert.ok(mixed.points[10].groups.every(g=>g.i>0));
for(const immune of [.03,.25,.9]) {
  const closed=C.simulate({...base,immune,school:{classes:16,size:35,varied:true,seed:2},origin:0,mixing:0});
  for(const p of closed.points) assert.deepEqual(p.classCounts.slice(1),closed.points[0].classCounts.slice(1));
  assert.ok(closed.points[0].classCounts.slice(1).every(c=>c.i===0));
}
for(const cfg of [variedCfg,singleSeed,{...singleSeed,immune:.9,seed:1}]) {
  const run=C.simulate(cfg), start=run.points[0], z=run.finalInfected, w=n=>n/total;
  near(z,run.finalByClass.reduce((sum,a,j)=>sum+w(sizes[j])*a,0));
  for(let j=0;j<sizes.length;j++) {
    const f=run.finalByClass[j], g=start.groups[j];
    const hazard=base.basic*((1-C.MIXING)*Math.sqrt(sizes[j]/40)*f+C.MIXING*Math.sqrt(total/400)*z);
    near(g.s+g.i-f,g.s*Math.exp(-hazard),2e-12);
  }
  // Independent dense-matrix power iteration at several dates.
  for(const day of [0,10,43,180]) {
    const p=run.points[day], matrix=p.groups.map((g,j)=>sizes.map((n,k)=>base.basic*g.s*
      ((j===k?(1-C.MIXING)*Math.sqrt(n/40):0)+C.MIXING*Math.sqrt(total/400)*w(n))));
    let vector=sizes.map(()=>1), eig=0;
    for(let k=0;k<1600;k++) {
      const next=matrix.map(row=>row.reduce((sum,t,j)=>sum+t*vector[j],0));
      eig=Math.max(...next);if(!eig) break; vector=next.map(v=>v/eig);
    }
    near(p.re,eig,1e-9);
  }
}
// Published per-seat colours are an independent golden fixture, including the
// two dates where independently rounded rolls conflict with monotonicity.
// 11/21 起點名一律單調取整：舊版獨立取整的座位仍逐座比對舊指紋，新版只在第 56、57 天各差兩席。
const seatRows=counts=>over.points.map(p=>over.campus.sizes.flatMap((n,j)=>
  Array.from({length:n},(_,k)=>C.seatGroup({...p,counts:counts(p),campus:over.campus,legacy:true},j,k))).join(''));
const publishedSeats=seatRows(p=>C.population({s:p.s,i:p.i,r:p.r}));
assert.equal(require('node:crypto').createHash('sha256').update(publishedSeats.join('\n')).digest('hex'),
  '67d140b2ef972aea8e9d1357377768b153d718d98df72b7b41b967f8a06e5023');
seatRows(p=>p.counts).forEach((row,d)=>{
  const diff=[...row].filter((c,k)=>c!==publishedSeats[d][k]).length;
  assert.equal(diff,d===56||d===57?2:0,'第 '+d+' 天點名差異');
});
for(const run of [over,small,big,varied,isolated,mixed]) {
  const cam=run.campus;
  let last=null;
  for(const p of run.points) {
    let s=0,i=0,r=0;
    const d=C.measurement(base,run,p.day);
    const actual=cam.sizes.map((n,j)=>{
      const g=p.groups?.[j]||p;near(g.s+g.i+g.r,1);
      if(p.day) assert.ok(g.s<=(run.points[p.day-1].groups?.[j]||run.points[p.day-1]).s+1e-14);
      s+=n*g.s/cam.total;i+=n*g.i/cam.total;r+=n*g.r/cam.total;
      const counts={s:0,i:0,r:0};
      for(let k=0;k<n;k++) counts[C.seatGroup(d,j,k)]++;
      if(last) {assert.ok(counts.s<=last[j].s);assert.ok(counts.r>=last[j].r);}
      return counts;
    });
    near(p.s,s);near(p.i,i);near(p.r,r);
    for(const key of ['s','i','r']) assert.ok(Math.abs(p.counts[key]-p[key]*cam.total)<=1.5);
    for(const name of ['s','i','r']) assert.equal(p.counts[name],actual.reduce((sum,c)=>sum+c[name],0));
    last=actual;
  }
}
assert.deepEqual(over.points.slice(57,59).map(p=>p.counts.i),[1,0]);
for(const cfg of [{school:{classes:6}},{school:{size:39}},{school:{varied:true}},{school:{seed:9}},{mixing:0},{origin:0}]) {
  assert.notEqual(C.scenarioKey({...base,...cfg}),C.scenarioKey(base));
  assert.equal(book.owner({...onset,...cfg}),null);
}
console.log('SIR 核心通過：181 天逐點舊曲線、逐班守恆與點名單調、座位排列、密度與跨班接觸、譜半徑、最終規模及情境記錄。');
