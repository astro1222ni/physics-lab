'use strict';
const assert=require('node:assert/strict');
const K=require('../js/han-character-formation-core.js');
const S=require('../js/data/han-character-formation-sources.js');
const tests=[];
function test(label,fn){fn();tests.push(label);console.log('✓ '+label);}
test('80 個唯一字頭、逐條典號與帶調讀音',()=>{
  assert.equal(K.words.length,80);
  for(const k of ['char','source','moe'])assert.equal(new Set(K.words.map(w=>w[k])).size,80);
  for(const w of K.words){assert.ok(w.quote&&w.example&&w.gloss&&w.head);assert.ok(Number.isInteger(w.source)&&w.source>0&&Number.isInteger(w.moe)&&w.moe>0);
    assert.equal(w.parts.length,w.role.length);assert.ok(K.readingParts(w.reading).tone>=1);}
  assert.equal(K.get('日').moe,9199);assert.equal(K.get('月').moe,11753);assert.equal(K.get('炮').moe,676);
});
test('以原典區分同外形、不同作用，保留異字頭',()=>{
  assert.deepEqual(K.get('等').role,['meaning','meaning']);assert.equal(K.get('等').type,'M');
  assert.deepEqual(K.get('詩').role,['meaning','sound']);assert.equal(K.get('功').role[1],'both');assert.equal(K.get('鈴').role[1],'both');
  assert.equal(K.get('上').head,'丄');assert.equal(K.get('下').head,'丅');
  assert.equal(K.get('木').role[0],'whole');assert.deepEqual(K.get('本').role,['meaning','mark']);
});
test('每筆字可手組、交換字框仍正確、答案與槽位一致',()=>{
  for(const w of K.words){for(const f of [w.parts.slice(),w.parts.slice().reverse()]){
    assert.equal(K.assemble(f),w);assert.ok(K.classify(f,w.type,w.phonetic?String(f.indexOf(w.phonetic)):'none'));
    assert.equal(K.classify(f,'?', 'none'),false);assert.equal(K.classify(f,w.type,''),false);
    if(w.phonetic)assert.equal(K.classify(f,w.type,'none'),false);
  }}
  assert.equal(K.assemble(['','木']).char,'木');assert.equal(K.assemble(['木','木']).char,'林');
  assert.equal(K.assemble(['氵','工']).char,'江');assert.equal(K.assemble(['木','上標']).char,'末');assert.equal(K.assemble(['木','下標']).char,'本');
  for(const f of [[],['',''],['氵','馬'],['木','木','木'],null])assert.equal(K.assemble(f),null);
});
test('國語聲韻調包含介音、第一聲與無單列韻符',()=>{
  assert.deepEqual(K.readingParts('ㄐㄧㄤ'),{onset:'ㄐ',rime:'ㄧㄤ',tone:1});
  assert.deepEqual(K.readingParts('ㄩㄝˋ'),{onset:'',rime:'ㄩㄝ',tone:4});
  assert.deepEqual(K.readingParts('ㄕˊ'),{onset:'ㄕ',rime:'',tone:2});
  assert.equal(K.readingParts('˙ㄇㄚ').tone,5);assert.throws(()=>K.readingParts(''));
  assert.deepEqual([1,2,3,4,5].map(t=>K.toneName(t)),['一聲','二聲','三聲','四聲','輕聲']);
  assert.deepEqual([1,2,3,4,5].map(t=>K.toneName(t,true)),['Tone 1','Tone 2','Tone 3','Tone 4','Tone 5']);
  assert.deepEqual(K.compare('ㄙˋ','ㄕˊ').flags,[false,null,false]);
  assert.deepEqual(K.compare('ㄍㄨㄥ','ㄐㄧㄤ').flags,[false,false,true]);
  assert.deepEqual(K.compare('ㄑㄧㄥ','ㄑㄧㄥˊ').flags,[true,true,false]);
});
test('六個聲符家族只收原典指明的聲符，含亦聲',()=>{
  assert.deepEqual(K.families.map(x=>K.members(x).length),[6,8,8,10,9,7]);
  for(const f of K.families){for(const w of K.members(f)){
    assert.ok(w.quote.includes(f+'聲')||w.quote.includes(f+'亦聲'));
    const m=K.compare(K.get(f).reading,w.reading).mask;
    for(let guess=0;guess<8;guess++)assert.equal(K.matchSound(f,w.char,guess),guess===m);
  }}
  assert.ok(!K.members('寺').some(w=>w.char==='等'));assert.equal(K.matchSound('工','詩',0),false);
});
test('筆記去重、重設與同形旁跨聲符的證據',()=>{
  let book=K.start();for(const c of '清江泡清')book=K.record(book,'build',c);
  for(const c of '清江清')book=K.record(book,'compare',c);
  assert.equal(book.built.length,3);assert.equal(book.heard.length,2);
  assert.equal(K.snapshot(book,'build','江').sharedChecked,2);
  assert.equal(K.record(book,'compare','等'),book);
  assert.deepEqual(K.start(),{built:[],heard:[]});
});
test('坊間依《重編》比音，新附字與校記對應正確字頭',()=>{
  const w=K.get('坊');
  assert.deepEqual([w.example,w.gloss,w.reading],['坊間','in bookshops','ㄈㄤ']);
  assert.equal(S.entries.坊.exampleReading,'ㄈㄤ ㄐㄧㄢ');
  assert.equal(S.entries.坊.exampleReading.split(' ')[0],w.reading);
  assert.deepEqual(K.compare(K.get('方').reading,w.reading).flags,[true,true,true]);
  assert.ok(K.matchSound('方','坊',7));assert.equal(K.matchSound('方','坊',6),false);
  const marked=K.words.filter(w=>S.entries[w.char]?.supplement).map(w=>w.char);
  assert.deepEqual(marked,['坊','齡']);
  const variants=K.words.filter(w=>S.entries[w.char]?.collation).map(w=>w.char);
  assert.deepEqual(variants,['月','青']);
  for(const [ch,quoted,variant,page] of [['月','大陰','太陰',98],['青','言象然','言必然',145]]){
    const note=S.entries[ch].collation;
    assert.ok(K.get(ch).quote.includes(quoted)&&!K.get(ch).quote.includes(variant));
    assert.deepEqual([note.transcription,note.facsimile],[quoted,variant]);
    assert.ok(note.scan.endsWith('#page='+page));
  }
});
test('每字獨立預測；讀原典、錯答與看答案均保留正確作答的界線',()=>{
  const practice=K.constructionPractice(),river=['氵','工'],tree=['木',''];
  assert.equal(practice.visible('江'),false);assert.equal(practice.reveal('江'),false);
  for(const [type,role] of [['','0'],['S',''],['?', 'none']])assert.equal(practice.submit(river,type,role),'incomplete');
  assert.equal(practice.submit(['',''],'S','1'),'incomplete');assert.equal(practice.state('江'),'new');
  assert.equal(practice.submit(river,'P','none'),'wrong');assert.equal(practice.reveal('江'),false);
  assert.equal(practice.submit(tree,'P','none'),'solved');assert.ok(practice.visible('木'));
  assert.equal(practice.submit([...river].reverse(),'S','1'),'wrong');assert.equal(practice.state('江'),'eligible');
  assert.equal(practice.visible('江'),false);assert.equal(practice.reveal('木'),false);
  assert.ok(practice.reveal('江'));assert.equal(practice.submit(river,'S','1'),'shown');
  assert.equal(practice.state('江'),'shown');assert.ok(practice.visible('江'));
  const independent=K.constructionPractice();
  assert.equal(independent.submit(river,'S','0'),'wrong');assert.equal(independent.submit(river,'M','1'),'wrong');
  assert.equal(independent.submit([...river].reverse(),'S','0'),'solved');assert.equal(independent.reveal('江'),false);
});
console.log(tests.length+' 組檢驗通過');
