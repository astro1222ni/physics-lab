/* SI units except where the graph explicitly uses mV and mA. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ExamPhysics = api;
})(globalThis, function () {
  'use strict';
  const earthRadius = 6371000, mu = 3.986e14;
  function orbit(heightKm, mass = 1) {
    const radius = earthRadius + heightKm * 1000;
    const speed = Math.sqrt(mu / radius);
    return {radius, speed, period: 2 * Math.PI * radius / speed, acceleration: mu / radius ** 2,
      potential: -mu * mass / radius, energy: -mu * mass / (2 * radius)};
  }
  function frequencyRatio(beta) { return Math.sqrt((1 - beta) / (1 + beta)); }
  // Equal schematic stage durations. Integrated speed gives continuous position.
  function flight(t, real) {
    const time = Math.max(0, Math.min(3,t)), maxBeta = real ? 0.0001 : 0.32;
    const ramp = Math.min(time,1,3-time);
    const distance = time <= 1 ? time*time/2 : time <= 2 ? time-.5 : 2-(3-time)**2/2;
    return {beta:maxBeta*ramp, ratio:frequencyRatio(maxBeta*ramp), distance:distance/2};
  }
  const samples = [[-80,-.89],[-60,-.756],[-40,-.621],[-20,-.478],[0,-.335],[20,-.204],[40,-.07],[60,.07]];
  function fit(points) {
    const mean = axis => points.reduce((s,p)=>s+p[axis],0)/points.length;
    const x=mean(0), y=mean(1);
    const slope=points.reduce((s,p)=>s+(p[0]-x)*(p[1]-y),0)/points.reduce((s,p)=>s+(p[0]-x)**2,0);
    const intercept=y-slope*x;
    return {slope,intercept,voltage:-intercept/slope,resistance:1/slope,current:v=>slope*v+intercept};
  }
  function measure(line, a, b) {
    const voltage=b-a, current=line.current(b)-line.current(a);
    return {voltage,current,resistance:current ? voltage/current : null};
  }
  function multiple(selected, key) {
    const errors=[...'ABCDE'].filter(letter=>selected.includes(letter)!==key.includes(letter)).length;
    return {errors,score:selected.length ? Math.max(0,2*(5-2*errors)/5) : 0};
  }
  async function gradeChannel(fields, engine) {
    const limits=[[50,5,{mV:1,V:1000}],[150,25,{'Ω':1,'kΩ':1000}]];
    const parts=await Promise.all(limits.map(([center,tol,units],i)=>{
      const {value,unit}=fields[i], parsed=engine.numeric(value);
      if (!Object.hasOwn(units,unit)||!parsed||parsed.unit) return false;
      return engine.gradeNumber(String(parsed.value*units[unit]),center,{absolute:tol,relative:0});
    }));
    return {parts,score:parts.filter(Boolean).length*2};
  }
  return {earthRadius,mu,orbit,frequencyRatio,flight,samples,fit,measure,multiple,gradeChannel};
});
