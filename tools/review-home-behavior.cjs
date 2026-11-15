#!/usr/bin/env node
/* 修改清單的帳號、每日、導覽與可操作性驗收；僅用假後端、僅允許本機請求。 */
'use strict';
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),H=require('./home-browser.cjs');
const SKELETON=process.argv.includes('--skeleton'),OUT=path.join(__dirname,'../.shots/home-v2-r2/'+(SKELETON?'skeleton.json':'behavior.json'));
async function main(){
  const {srv,base}=await H.server(),browser=await require('G:/physics-lab/tools/browser.cjs').launch(),checks=[];
  const pass=(name,data=true)=>{checks.push({name,data});console.log('✓ '+name);};
  async function visit(opts={}){const ctx=await H.context(browser,base,opts),page=await ctx.newPage();if(opts.clock)await page.clock.install({time:new Date()});await page.goto(base+'index.html');await H.ready(page,'index');return{ctx,page};}
  try{
    if(SKELETON){
      const cases=[];checks.push({name:'骨架逐組量測',data:cases});
      for(const w of [390,720,1280])for(const theme of ['light','dark'])for(const lang of ['zh-Hant','zh-Hans','en'])for(const fs of [1,1.3])for(const state of ['guest','history','member','admin','member-empty']){
        const opts={w,theme,lang,fs,state:state==='member-empty'?'member':state,noHistory:state==='member-empty'}, {ctx,page}=await visit(opts),r=await H.inspect(page);
        const shift=Math.abs(r.statusHeight-r.beforeHeight),dailyShift=Math.abs(r.dailyHeight-r.beforeDailyHeight),label=JSON.stringify(opts);
        cases.push({opts,shift,dailyShift,status:r.statusHeight});
        assert(shift<1,label+' 狀態骨架高度差 '+shift);assert(dailyShift<1,label+' 每日骨架高度差 '+dailyShift);assert.equal(r.sw,r.vw,label+' 橫向溢出');
        if(w===390&&fs===1){assert(r.statusHeight<=(state==='member'||state==='admin'||state==='member-empty'?270:210),label+' 狀態過高');assert(r.cards[0].y<844,label+' 首屏未見按鍵');}
        await ctx.close();
        if(cases.length%30===0)console.log('骨架 '+cases.length+'/180 組通過');
      }
      pass('骨架與實際內容：三寬×深淺×三語×兩字級×五種紀錄狀態，180組高度穩定',{n:cases.length,maxShift:Math.max(...cases.map(x=>x.shift)),maxDailyShift:Math.max(...cases.map(x=>x.dailyShift))});return;
    }
    for(const destination of ['leaderboard','daily'])for(const flow of ['popup','redirect']){
      const {ctx,page}=await visit();
      if(flow==='redirect')await page.evaluate(()=>{LAB_COMMENTS_BACKEND.signIn=()=>Promise.resolve();});
      await page.locator(destination==='daily'?'.daily-primary':'.status-primary').click();
      if(flow==='redirect'){
        assert.equal(await page.evaluate(()=>sessionStorage.getItem('labAfterLogin')),destination);
        await page.evaluate(()=>localStorage.setItem('mockuser','u1'));await page.reload();
      }
      await page.waitForURL('**/'+destination+'.html');
      assert.equal(await page.evaluate(()=>sessionStorage.getItem('labAfterLogin')),null);
      pass('登入 '+flow+' → '+destination+'，清除目的地後跳頁');await ctx.close();
    }
    {
      const {ctx,page}=await visit();
      await page.evaluate(()=>{LAB_COMMENTS_BACKEND.signIn=()=>Promise.reject({code:'auth/popup-closed-by-user'});});
      await page.locator('.status-primary').click();await page.waitForFunction(()=>!sessionStorage.getItem('labAfterLogin'));
      assert.equal(page.url(),base+'index.html');pass('取消登入留首頁且清除目的地');await ctx.close();
    }
    {
      const {ctx,page}=await visit();await page.locator('.lab-account').click();await page.waitForFunction(()=>document.querySelector('.status-nickname'));
      assert.equal(page.url(),base+'index.html');assert.equal(await page.evaluate(()=>sessionStorage.getItem('labAfterLogin')),null);
      const r=await H.inspect(page);assert.equal(r.account.length,5);assert(r.account.every(p=>/^(profiles|scores|daily|completions|bag)\/u1$/.test(p)));assert.deepEqual(r.privilege,['admins/u1']);
      pass('一般右上登入留首頁；只讀五個個人節點＋admins',r.account);
      assert.deepEqual(await page.locator('.treasure-count > span').allTextContents(),['13','5','2','1','0']);assert.equal(await page.locator('.status-summary a').count(),0);
      assert.equal(await page.locator('.treasure-count.is-zero').count(),1);pass('五寶物顯示剩餘數、零也顯示；摘要單一連結');
      assert.equal(await page.locator('script[src*="daily-core"]').count(),0);pass('首頁不載入整支 daily-core');await ctx.close();
    }
    {
      const {ctx,page}=await visit({state:'member',lang:'en'});
      await page.evaluate(()=>localStorage.setItem('labRank:u1',JSON.stringify({rank:99,at:Date.now()-8*86400000})));await page.reload();await H.ready(page,'index');
      assert.equal(await page.locator('.rank-cache').innerText(),'See my rank');pass('八天舊名次不顯示數字');await ctx.close();
    }
    {
      const {ctx,page}=await visit();await page.clock.install({time:new Date()});
      await page.evaluate(()=>{
        const record=(nickname,n)=>({profile:{nickname},score:{stars:136},daily:{d:LabHomeCore.dayNumber(Date.now()),n},bag:{},done:{}});
        let release;LabAccount.readHome=uid=>uid==='slow'?new Promise(resolve=>release=resolve):Promise.resolve(record('Current user',4));
        dispatchEvent(new CustomEvent('lab:account',{detail:{user:{uid:'slow'},ready:true}}));dispatchEvent(new CustomEvent('lab:account',{detail:{user:{uid:'fast'},ready:true}}));
        window.__releasePrevious=()=>release(record('Previous user',9));
      });
      await page.waitForFunction(()=>document.querySelector('.status-nickname')?.textContent==='Current user');await page.evaluate(()=>window.__releasePrevious());
      await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
      assert((await page.locator('#daily-content').innerText()).includes('4/10'));assert.equal(await page.locator('.status-nickname').innerText(),'Current user');
      pass('切換帳號時，舊請求晚回來也不覆蓋目前進度');await ctx.close();
    }
    {
      const {ctx,page}=await visit({state:'member',clock:true});
      await page.evaluate(()=>{const n=Date.now(),next=(Math.floor((n+8*3600000)/86400000)+1)*86400000-8*3600000;localStorage.setItem('mockoffset',next-n-30000);dispatchEvent(new StorageEvent('storage',{key:'mockoffset'}));});
      assert((await page.locator('#daily-content').innerText()).includes('4/10'));
      await page.clock.fastForward(60000);assert((await page.locator('#daily-content').innerText()).includes('0/10'));assert.equal(await page.locator('.daily-dots .done').count(),0);
      pass('mockoffset 跨臺灣00:00，分鐘更新歸零');
      await page.evaluate(async()=>{const d=await LabAccount.readHome('u1');d.daily={d:LabHomeCore.dayNumber(Date.now()+(+localStorage.mockoffset||0)),n:10};document.dispatchEvent(new Event('visibilitychange'));});
      assert((await page.locator('#daily-content').innerText()).includes('今天全部完成！明天 00:00 再來。'));pass('全部十個完成的文案正確');await ctx.close();
    }
    {
      const {ctx,page}=await visit();await page.locator('.subject-card').first().focus();
      assert.equal(await page.locator('.subject-card').first().evaluate(e=>getComputedStyle(e).outlineWidth),'3px');
      await page.keyboard.press('Enter');await page.waitForURL('**/physics.html');await H.ready(page,'physics');pass('科目按鍵可用Tab焦點與Enter開啟');
      const fade=async(sel,end)=>page.locator(sel).evaluate((e,end)=>{e.scrollLeft=end?e.scrollWidth:0;e.dispatchEvent(new Event('scroll'));return {left:e.parentElement.classList.contains('can-left'),right:e.parentElement.classList.contains('can-right')};},end);
      assert.deepEqual(await fade('.subject-switch',false),{left:false,right:true});assert.deepEqual(await fade('.subject-switch',true),{left:true,right:false});
      await page.locator('#ch-newton').scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.querySelector('.subjbar.show'));
      assert(await page.locator('.subjbar').evaluate(e=>getComputedStyle(e).position==='fixed'&&Math.abs(e.getBoundingClientRect().top)<2));
      assert.deepEqual(await fade('.subjbar-in',false),{left:false,right:true});assert.deepEqual(await fade('.subjbar-in',true),{left:true,right:false});pass('兩列24 px漸層依可滑方向出現／消失');
      const top=await page.locator('.to-top').boundingBox();assert.equal(top.width,44);assert.equal(top.height,44);assert.equal(await page.locator('.to-top').innerText(),'↑');
      assert.equal(await page.locator('.wrap').evaluate(e=>getComputedStyle(e).paddingBottom),'72px');await page.locator('.to-top').click();await page.waitForFunction(()=>scrollY===0);pass('44 px圓形回頂端與72 px頁底留白');await ctx.close();
    }
    // 所有科目與首頁都量特大字，三語、兩寬、深淺色，不把實驗頁當入口頁試玩。
    for(const slug of ['index',...H.subjects.map(s=>s.page)])for(const w of [390,1280])for(const theme of ['light','dark'])for(const lang of ['zh-Hant','zh-Hans','en']){
      const ctx=await H.context(browser,base,{w,theme,lang,fs:1.3}),p=await ctx.newPage();await p.goto(base+slug+'.html');await H.ready(p,slug);const r=await H.inspect(p);assert.equal(r.sw,r.vw,slug+' '+w+' '+theme+' '+lang+' 特大溢出');assert.equal(r.cjk.length,0);await ctx.close();
    }
    pass('首頁＋八科特大字108組：三語×兩寬×深淺，零橫向溢出、英文零中文');
  }finally{await browser.close();srv.close();fs.mkdirSync(path.dirname(OUT),{recursive:true});fs.writeFileSync(OUT,JSON.stringify({at:new Date().toISOString(),checks},null,1));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
