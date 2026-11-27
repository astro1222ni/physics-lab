'use strict';
const assert=require('node:assert/strict');
const K=require('../js/sexagenary-cycle-core');
let groups=0;
function test(name,run){run();groups++;console.log('✓ '+name);}
function near(a,b,tol=1e-9){assert.ok(Math.abs(a-b)<tol,a+' ≠ '+b);}
test('官方對照年份、查表端點與生肖',()=>{
  for(const [year,name,animal,roc] of [[1894,'甲午','馬',-18],[1895,'乙未','羊',-17],[1898,'戊戌','狗',-14],
    [1911,'辛亥','豬',-1],[1912,'壬子','鼠',1],[1924,'甲子','鼠',13],[1983,'癸亥','豬',72],[1984,'甲子','鼠',73],[2031,'辛亥','豬',120]]){
    const d=K.describe(year);assert.deepEqual([d.name,d.animal,d.roc],[name,animal,roc]);}
});
test('完整六十甲子與地支生肖順序依香港天文台',()=>{
  const table=('甲子乙丑丙寅丁卯戊辰己巳庚午辛未壬申癸酉甲戌乙亥'+
    '丙子丁丑戊寅己卯庚辰辛巳壬午癸未甲申乙酉丙戌丁亥'+
    '戊子己丑庚寅辛卯壬辰癸巳甲午乙未丙申丁酉戊戌己亥'+
    '庚子辛丑壬寅癸卯甲辰乙巳丙午丁未戊申己酉庚戌辛亥'+
    '壬子癸丑甲寅乙卯丙辰丁巳戊午己未庚申辛酉壬戌癸亥').match(/../gu);
  assert.deepEqual(Array.from({length:60},(_,i)=>K.describe(1984+i).name),table);
  assert.equal(K.branches.map((b,i)=>b+K.animals[i]).join(' '),'子鼠 丑牛 寅虎 卯兔 辰龍 巳蛇 午馬 未羊 申猴 酉雞 戌狗 亥豬');
  assert.equal(new Set(table).size,60);
});
test('西元前後沒有零年，跨界兩側互逆',()=>{
  assert.deepEqual([-2,-1,1,2].map(K.serial),[-1,0,1,2]);assert.deepEqual([-1,0,1,2].map(K.civil),[-2,-1,1,2]);
  assert.equal(K.shift(-1,1),1);assert.equal(K.shift(1,-1),-1);assert.equal(K.distance(-3,3),5);
  assert.deepEqual([-2,-1,1,2].map(y=>K.describe(y).name),['己未','庚申','辛酉','壬戌']);
  assert.equal(K.describe(-1).roc,-1912);assert.equal(K.describe(1).roc,-1911);
  for(const v of [0,NaN,12.2,Infinity])assert.throws(()=>K.describe(v),RangeError);
});
test('四種輸入系統每個可選年份都能往返，民國零年無效',()=>{
  for(let a=K.serial(K.first);a<=K.serial(K.last);a++){
    const y=K.civil(a),d=K.describe(y);
    assert.equal(K.readYear(y<0?'bc':'ad',Math.abs(y)),y);
    assert.equal(K.readYear(d.roc<0?'before':'roc',Math.abs(d.roc)),y);
    assert.equal(K.civil(K.serial(y)),y);assert.notEqual(d.roc,0);
  }
  for(const era of ['ad','bc','roc','before','other']){
    for(const v of [0,-1,3.5,NaN,Infinity,Number.MAX_SAFE_INTEGER])assert.equal(K.readYear(era,v),null);}
  assert.equal(K.readYear('other',1),null);assert.equal(K.readYear('ad',3001),null);
  assert.equal(K.readYear('before',4911),-3000);assert.equal(K.readYear('roc',1089),3000);
});
test('120 種候選只有 60 種可達，同序位奇偶為充分必要條件',()=>{
  let count=0;
  for(let s=0;s<10;s++)for(let b=0;b<12;b++){
    const p=K.inspectPair(s,b);assert.equal(p.possible,(s-b)%2===0);
    assert.equal(p.matches.length,p.possible?1:0);
    if(p.possible){const d=K.describe(1984+p.matches[0]);assert.deepEqual([d.s,d.b],[s,b]);count++;}
  }
  assert.equal(count,60);assert.deepEqual(K.inspectPair(0,1).matches,[]);
  for(const [s,b] of [[-1,0],[10,0],[0,12],[1.5,1]])assert.throws(()=>K.inspectPair(s,b));
});
test('負年、最小正週期、嚴格搜尋下一次與逆向位移',()=>{
  for(let a=K.serial(K.first);a<=K.serial(K.last);a++){
    const y=K.civil(a),d=K.describe(y);
    assert.equal(K.distance(y,K.shift(y,60)),60);assert.equal(K.describe(K.shift(y,60)).k,d.k);
    assert.equal(K.nextOccurrence(y,d.k),K.shift(y,60));
    for(const i of [0,17,30,47,59]){
      const next=K.nextOccurrence(y,i),gap=K.distance(y,next);
      assert.ok(gap>=1&&gap<=60);assert.equal(K.describe(next).k,i);
      assert.equal(K.shift(next,-gap),y);
    }
  }
  for(let n=1;n<60;n++)assert.notEqual(K.describe(1984+n).name,'甲子');
  assert.throws(()=>K.nextOccurrence(1984,60));
});
test('年距預測、年號與史料辨識',()=>{
  const c=K.compare(1894,1898,4);assert.ok(c.correct&&c.sameReign&&c.twoEvents&&!c.samePair);
  assert.equal(K.compare(1894,1911,17).sameReign,false);assert.equal(K.compare(1894,1896,2).twoEvents,false);
  assert.ok(K.compare(1911,1912,1).crossROC);assert.ok(K.compare(1911,1971,60).samePair);
  assert.ok(K.compare(1,-1,1).crossBC);assert.equal(K.compare(1,-1,1).delta,-1);
  assert.equal(K.compare(1,-1,2).correct,false);assert.equal(K.compare(1,1,null).correct,false);
  assert.equal(K.compare(1894,1894,0).twoEvents,false);
});
test('相嚙的角速度、接點齒隙、指標下兩字與第幾格一致',()=>{
  for(let i=-60;i<=60;i++){
    const a=K.angles(i),b=K.angles(i+1),k=K.mod(i,60);
    near((b.stem-a.stem)*5+(b.branch-a.branch)*6,0);near(a.stem*10+a.branch*12,Math.PI);
    for(const [theta,n,idx] of [[a.stem,10,k%10],[a.branch,12,k%12]]){
      const ang=theta+K.labelAngle(n,idx);near(Math.cos(ang),0);near(Math.sin(ang),1);}
    near(Math.cos(Math.PI/2+k*K.TAU/60+a.dial),0);near(Math.sin(Math.PI/2+k*K.TAU/60+a.dial),1);
  }
});
function rotatedBoundary(points, angle, centerX) {
  const c=Math.cos(angle), s=Math.sin(angle);
  return points.map(([x,y])=>[centerX+x*c-y*s, x*s+y*c]);
}
function distanceToSegment(p,a,b) {
  const dx=b[0]-a[0], dy=b[1]-a[1];
  const t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy)));
  return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);
}
function meshClearance(n,m,phases) {
  const first=K.gearOutline(n,m), second=K.gearOutline(m,n), distance=(n+m)/2;
  const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  // A boundary farther than .30 from the other gear's bounding box cannot
  // give the minimum: every phase below must exhibit a gap smaller than .15.
  function nearby(points,keep) {
    return points.map((p,i)=>[p,points[(i+1)%points.length]]).filter(([a,b])=>keep(a[0],b[0]));
  }
  let min=Infinity, max=0;
  for(let i=0;i<=phases;i++){
    const t=i/phases, left=rotatedBoundary(first,K.TAU*t/n,0);
    const right=rotatedBoundary(second,Math.PI/m-K.TAU*t/m,distance);
    const A=nearby(left,(x,y)=>Math.max(x,y)>=n/2-1-.3);
    const B=nearby(right,(x,y)=>Math.min(x,y)<=n/2+1+.3);
    let gap=Infinity;
    for(const [a,b] of A)for(const [c,d] of B){
      if(Math.min(c[1],d[1])>Math.max(a[1],b[1])+.3 || Math.min(a[1],b[1])>Math.max(c[1],d[1])+.3)continue;
      const crossed=cross(a,b,c)*cross(a,b,d)<0 && cross(c,d,a)*cross(c,d,b)<0;
      assert.ok(!crossed,'crossing '+n+'/'+m+' at '+t);
      gap=Math.min(gap,distanceToSegment(a,c,d),distanceToSegment(b,c,d),distanceToSegment(c,a,b),distanceToSegment(d,a,b));
    }
    assert.ok(gap>0 && gap<.15,'clearance '+gap+' at '+t);
    min=Math.min(min,gap);max=Math.max(max,gap);
  }
  // From each unsampled instant to its closest sample, neither boundary
  // can move farther than its tip speed times half a sampling interval.
  const drift=((n/2+1)*K.TAU/n+(m/2+1)*K.TAU/m)/(2*phases);
  assert.ok(min-drift>0,'uncertified gap between phases');
  console.log('  '+n+'/'+m+'，'+(phases+1)+' 相位，最小間隙 '+min.toFixed(5)+' m，最大最近間隙 '+max.toFixed(5)+' m，連續下界 '+(min-drift).toFixed(5)+' m（m 為該對輪模數）');
}
test('木鐘平齒頂、圓齒根、2.25 模數齒高與節圓齒厚',()=>{
  for(const [n,m] of [[10,12],[12,10],[10,60],[60,10]]){
    const p=K.gearOutline(n,m), pitch=n/2, top=pitch+1, perTooth=p.length/n;
    const radii=p.map(([x,y])=>Math.hypot(x,y));
    near(Math.max(...radii)-Math.min(...radii),2.25);
    assert.equal(radii.filter((r,i)=>Math.abs(r-top)<1e-8&&Math.abs(radii[(i+radii.length-1)%radii.length]-top)>1e-8).length,n);
    const tooth=p.slice(0,perTooth),land=tooth.filter(([x,y])=>Math.abs(Math.hypot(x,y)-top)<1e-8);
    assert.equal(land.length,2);near(land[0][0],land[1][0]);assert.ok(land[1][1]-land[0][1]>.70);
    const edges=tooth.filter(([x,y])=>Math.abs(Math.hypot(x,y)-pitch)<1e-8);
    assert.equal(edges.length,2);
    near(pitch*(Math.atan2(edges[1][1],edges[1][0])-Math.atan2(edges[0][1],edges[0][0])),Math.PI/2-.052);
    assert.ok(tooth.filter(([x,y])=>Math.hypot(x,y)>pitch-1.24999 && Math.hypot(x,y)<pitch-1.08).length>=6);
  }
  const access=(r,s)=>s*Math.acos(((r+s)**2+s*s-(r+1)**2)/(2*(r+s)*s));
  assert.ok((access(5,3)+access(6,2.5))/Math.PI>1);
});
test('兩個主輪整個齒距的邊界無交叉、最小間隙為正',()=>meshClearance(10,12,360));
test('連桿、十齒小輪與六十齒盤的間隙、定位及六比一傳動',()=>{
  const d=K.drive, m=d.module;
  near(d.dialX-d.pinionX,(d.pinionTeeth+d.ringTeeth)*m/2);
  const length=Math.hypot(d.pinionX-d.stemX,d.dialY-d.stemY);
  for(let j=-120;j<=120;j++){
    const turn=j/7, p=K.drivePose(turn), a=K.angles(turn);
    near(p.pinion,a.stem);near(p.rim,a.dial+Math.PI/60);
    near(p.pinion*10+p.rim*60,Math.PI);near(Math.hypot(p.dx,p.dy),d.crank);
    near(Math.hypot((d.pinionX+p.dx)-(d.stemX+p.dx),(d.dialY+p.dy)-(d.stemY+p.dy)),length);
  }
  near(K.drivePose(10).rim-K.drivePose(0).rim,-K.TAU/6);
  meshClearance(10,60,360);
});
test('事件逐筆綁定公開來源，史事與算術基準分列',()=>{
  assert.deepEqual(K.events.map(x=>x.year),[1894,1895,1898,1911]);
  K.events.forEach(item=>{assert.ok(item.title.every(Boolean)&&item.era.every(Boolean));assert.match(K.sources[item.source][2],/^https:/);});
  assert.equal(K.describe(1984).record,null);assert.equal(K.describe(1).record,null);
});
console.log(groups+' 組通過，0 組失敗');
