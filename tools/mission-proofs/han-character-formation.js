'use strict';
const assert=require('node:assert/strict');
const K=require('../../js/han-character-formation-core.js');
const defs=require('../../js/missions/han-character-formation.js');
const phon=K.families.flatMap(f=>K.members(f));
const steps=s=>s.trim().split(/\s+/).filter(Boolean);
// B = submit the correct construction and frame. R = compare actual written sounds.
function play(book,move,wrong=false){
  const [code,char]=[...move],w=K.get(char);
  assert.ok(w && ['B','R'].includes(code));
  const act=code==='B'?'build':'compare';
  let correct=false;
  if(code==='B'){
    const f=w.parts.slice().reverse(),pos=w.phonetic?String(f.indexOf(w.phonetic)):'none';
    correct=K.classify(f,wrong?'?':w.type,pos);
  }else if(w.phonetic && K.families.includes(w.phonetic)){
    const answer=K.compare(K.get(w.phonetic).reading,w.reading).mask;
    correct=K.matchSound(w.phonetic,char,wrong?(answer^1):answer);
  }
  if(!correct)return {book,event:null};
  const next=K.record(book,act,char);
  return {book:next,event:{type:'han-evidence',data:K.snapshot(next,act,char)}};
}
// The browser verifier calls this witness through the same controls as a student.
async function proveAnswerGate(page,peek,capture){
  const metrics=page.locator('#metrics strong'),card=page.locator('#entryBody');
  const reveal=page.locator('#showAnswer'),check=page.locator('#buildCheck');
  const text=()=>metrics.allTextContents();
  await page.evaluate(()=>{
    const emit=LabMission.emit.bind(LabMission);window.constructionEvents=[];
    LabMission.emit=(type,data)=>{if(type==='han-evidence')window.constructionEvents.push(data);return emit(type,data);};
  });
  const initial=await text();
  assert.deepEqual(initial,['？','？','？']);assert.doesNotMatch(await page.locator('#metrics').innerText(),/形聲|表意|表音/);
  assert.doesNotMatch(await card.innerText(),/形聲|表意|表音/);assert.match(await card.innerText(),/江水/);
  assert.equal(await card.locator('blockquote').isVisible(),false);assert.equal(await reveal.isVisible(),false);
  if(!peek)await capture('default');
  await card.locator('summary').click();assert.equal(await card.locator('blockquote').isVisible(),true);
  assert.deepEqual(await text(),initial);await card.locator('summary').click();
  await check.click();assert.equal(await reveal.isVisible(),false);
  await page.locator('#typeGuess').selectOption(peek?'M':'S');await page.locator('#roleGuess').selectOption('1');
  await check.click();
  if(peek){
    assert.equal(await reveal.isVisible(),false);
    await page.locator('#catalog').selectOption('林');await page.locator('#catalog').selectOption('江');
    await page.locator('#typeGuess').selectOption('M');await page.locator('#roleGuess').selectOption('1');await check.click();
    assert.equal(await reveal.isVisible(),true);assert.deepEqual(await text(),initial);
    await reveal.click();assert.equal(await check.isDisabled(),true);
  }
  const after=await text();assert.deepEqual(after,['形聲','表意','表音']);
  assert.match(await card.innerText(),/形聲/);assert.match(await card.innerText(),/表音/);
  if(!peek)await page.evaluate(()=>document.querySelectorAll('.ms-celebrate:not(.out)').forEach(n=>n.click()));
  await capture(peek?'viewed':'correct');
  await page.locator('#catalog').selectOption('林');assert.deepEqual(await text(),initial);
  await page.locator('#catalog').selectOption('江');assert.deepEqual(await text(),after);
  await page.locator('#swap').click();assert.deepEqual(await text(),['形聲','表音','表意']);
  await page.locator('#labdeck-tab-1').click();const book=await page.locator('#notebook').innerText();
  const events=await page.evaluate(()=>window.constructionEvents.map(d=>[d.act,d.char]));
  if(peek){
    assert.doesNotMatch(book,/江/);assert.deepEqual(events,[]);
    await page.locator('#clearBook').click();await page.locator('#labdeck-tab-0').click();assert.equal(await check.isDisabled(),true);
    const awards=await page.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('mdb')).completions.u1||{}));
    assert.deepEqual(awards,[]);
  }else{assert.match(book,/江/);assert.deepEqual(events,[['build','江']]);}
  return {initial,after,events,book};
}
module.exports={proveAnswerGate};
if(require.main===module){
const solutions=[
 'B日','B木 B本','B林 B休','R清','B詩 B請','R清 R情','B木 B本 B林 B時',
 'R清 R江 R雹','B江 B清 B泡 R江 R清','B木 B本 B信 B時 R清 R江 R雹 R冷',
 'B江 R紅 R江','B詩 R侍 R詩','B待 B詩 B等','B本 B上 B末','B休 B木 B林','B精 R清 R情 R精',
 'B攻 R功 B功','B清 B江 R泡 B泡','B冷 R領 R聆 R冷','B猜 R靖 R清 R猜'
];
const secret=defs.filter(d=>d.hidden);
const hits=(d,e)=>!!e&&d.check(e);
const initial={type:'han-evidence',data:K.snapshot(K.start(),'','')};
assert.ok(defs.every(d=>!d.check(initial)));
assert.ok(defs.every(d=>!d.check({type:'load',data:{}})));
const evidence=[];
for(const [i,d] of defs.entries()){
  const seq=steps(solutions[i]);let book=K.start(),prev=null,terminal;
  for(const s of seq){prev=terminal;const pass=play(book,s);assert.ok(pass.event);book=pass.book;terminal=pass.event;}
  assert.ok(hits(d,terminal),d.id);
  assert.ok(!hits(d,prev||initial),'missing last step '+d.id);
  if(d.hidden)assert.deepEqual(secret.filter(m=>hits(m,terminal)).map(m=>m.id),[d.id]);
  else assert.equal(d.need({last:()=>terminal.data})[0][0],true);
  const no=play(book,seq.at(-1),true);assert.equal(no.event,null);assert.equal(no.book,book);
  evidence.push({id:d.id,level:d.level,witness:seq,negative:seq.slice(0,-1),final:terminal.data.char});
}
let seed=11202026;function rnd(n){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return Math.floor(seed/4294967296*n);}
const anyMove=()=>rnd(2)?'B'+K.words[rnd(K.words.length)].char:'R'+phon[rnd(phon.length)].char;
let max=0;
for(let i=0;i<24000;i++){
  const pool={built:K.words.filter(()=>rnd(4)<2).map(w=>w.char),heard:phon.filter(()=>rnd(4)<2).map(w=>w.char)};
  const {event}=play(pool,anyMove());const count=secret.filter(d=>hits(d,event)).length;max=Math.max(max,count);assert.ok(count<=1);
}
// Exhaust all possible terminal actions with every prerequisite satisfied.
const full={built:K.words.map(w=>w.char),heard:phon.map(w=>w.char)};
for(const mv of [...full.built.map(c=>'B'+c),...full.heard.map(c=>'R'+c)]){
  const {event}=play(full,mv);assert.ok(secret.filter(d=>hits(d,event)).length<=1);
}
const accidental=Object.fromEntries(secret.map(d=>[d.id,0]));
for(let round=0;round<150;round++){
  let book=K.start();const won=new Set();
  for(let j=0;j<20;j++){
    // Stress model: even random submissions know the correct answer every time.
    const turn=play(book,anyMove());book=turn.book;
    secret.forEach(d=>{if(hits(d,turn.event))won.add(d.id);});
  }
  won.forEach(id=>accidental[id]++);
}
assert.ok(Object.values(accidental).every(n=>n/150<.02));
const practice=K.constructionPractice(),frame=['氵','工'];
assert.equal(practice.visible('江'),false);
assert.equal(practice.submit(frame,'S','1'),'solved');assert.equal(practice.visible('江'),true);
const prediction={initial:'masked',independent:'solved'};
const receiptOption=process.argv.indexOf('--dom-receipt');
if(receiptOption!==-1){
  const qa=JSON.parse(require('node:fs').readFileSync(process.argv[receiptOption+1],'utf8'));
  assert.equal(qa.pass,true);
  for(const run of ['correct','viewed']){
    const evidence=qa.answerGate[run];assert.deepEqual(evidence.initial,['？','？','？']);
    assert.deepEqual(evidence.after,['形聲','表意','表音']);
  }
  assert.deepEqual(qa.answerGate.viewed.events,[]);assert.deepEqual(qa.answerGate.correct.events,[['build','江']]);
  prediction.metricsDOM=qa.answerGate;
}
console.log(JSON.stringify({missions:evidence,seed:11202026,states:24000,maxSimultaneousHidden:max,terminalActions:full.built.length+full.heard.length,
  rounds:150,stepsPerRound:20,accidental,prediction},null,2));
}

