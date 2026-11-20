'use strict';
// 單元改版、總頁數 n 變少時：頁數夾到 ≤ n；夾完不比雲端原始值大就不寫雲端，只存本機。
const assert=require('node:assert/strict');
const tick=()=>new Promise(r=>setTimeout(r,5));
(async()=>{
  const store={};
  globalThis.localStorage={getItem:k=>k in store?store[k]:null,setItem:(k,v)=>{store[k]=String(v);}};
  function setup(cloudSeq){
    const writes=[];let authCb,calls=0;
    const api={
      onAuth:cb=>{authCb=cb;},
      get:async()=>cloudSeq[Math.min(calls++,cloudSeq.length-1)],
      update:async o=>{writes.push(o);},now:()=>0,
      advanceLearn:async(uid,unit,p,n)=>{writes.push({uid,unit,p,n});}
    };
    globalThis.window={LabMission:{_ready:()=>Promise.resolve(api)}};
    return {writes,auth:u=>authCb(u)};
  }
  const E=require('../js/learn');

  // 1. 登入時雲端還沒資料，之後別台裝置寫了舊版的 31 頁；新版只剩 25 頁。
  let t=setup([null,{p:31,n:31,at:1}]);
  let pr=E.progress('unit-a',25,()=>{});
  await tick();await t.auth({uid:'u1'});await tick();
  pr.visit(20);await tick();await tick();
  assert.deepEqual(t.writes,[],'雲端 31 > 新總頁數 25：不可寫入');
  assert.equal(pr.get(),25,'本機夾到 25');
  pr.visit(40);await tick();await tick();
  assert.deepEqual(t.writes,[],'超過總頁數的頁碼也不寫');
  assert.equal(pr.get(),25);

  // 2. 登入時雲端就是舊版 31 頁：直接夾成 25，不寫。
  t=setup([{p:31,n:31,at:1}]);
  pr=E.progress('unit-b',25,()=>{});
  await tick();await t.auth({uid:'u2'});await tick();
  pr.visit(25);await tick();await tick();
  assert.deepEqual(t.writes,[]);assert.equal(pr.get(),25);

  // 3. 雲端比較小：照常寫入，且 p ≤ n。
  t=setup([{p:10,n:31,at:1}]);
  pr=E.progress('unit-c',25,()=>{});
  await tick();await t.auth({uid:'u3'});await tick();
  pr.visit(30);await tick();await tick();
  assert.equal(t.writes.length,1);assert.deepEqual(t.writes[0],{uid:'u3',unit:'unit-c',p:25,n:25});
  console.log('learn-progress-clamp ok');
  process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
