(function () {
  'use strict';
  const K=window.HanFormation,S=window.HanSources,D=window.LabDraw,slug='han-character-formation';
  const $=id=>document.getElementById(id),T=(zh,en)=>LabSettings.t(zh,en),english=LabSettings.lang==='en';
  const el=(tag,cls)=>{const n=document.createElement(tag);if(cls)n.className=cls;return n;};
  // The site's converter sees newly inserted text nodes individually. Insert a complete
  // marked element so a quoted graph never changes, even after a live catalog selection.
  const original=(node,text)=>{
    node.lang='zh-Hant';node.dataset.noConvert='';
    const span=el('span');span.lang='zh-Hant';span.dataset.noConvert='';span.textContent=text;
    node.replaceChildren(span);return node;
  };
  const glyph=(text,tag='span')=>original(el(tag,'glyph'),text);
  const txt=(node,s)=>{node.textContent=s;};
  const option=(value,text)=>new Option(text,value);
  const partName=p=>K.markers[p]?T(...K.markers[p]):p||'—';
  const typeName=w=>T(...K.types[w.type]);
  const roleName=r=>T(...K.roles[r]);
  const theory=['P','I','M','S'];
  const features=[['聲母','Initial'],['韻母','Final'],['聲調','Tone']];
  function toneName(tone){return T(K.toneName(tone),K.toneName(tone,true));}
  function tonePair(w){
    const from=K.readingParts(K.get(w.phonetic).reading),to=K.readingParts(w.reading);
    return toneName(from.tone)+' → '+toneName(to.tone);
  }
  function appendExampleReading(node,w){
    const reading=S.entries[w.char]?.exampleReading;
    if(reading)node.append(' · ',glyph(w.example),' '+reading);
  }
  function appendSupplement(node,w){
    if(!S.entries[w.char]?.supplement)return;
    const label=el('small','edition-tag');
    txt(label,T('大徐本新附','Added in Xu Xuan’s edition'));
    node.append(label);
  }
  const art={木:['wood','樹冠與根分向上下伸展。留意早期字形裡的枝與根。','Compare the branching crown and roots on either side of the trunk.'],
    山:['mountain','找找並列的山峰，對照各時期峰頂與下緣的形狀。','Trace the peaks and compare how the lower edge connects them.'],
    月:['moon','觀察外側的弧線與裡面的筆畫，各時期怎麼安排？','Compare the outer curve and the strokes inside it at each stage.']};
  const initials=['氵','工','日','寺','木','言','亻','忄','青','包'];
  const traditionalParts={'氵':'水','忄':'心','亻':'人','扌':'手','艹':'艸','犭':'犬','衤':'衣','攵':'攴','阝':'𨸏','冫':'仌'};
  const meaningNames={'氵':['水','water'],'忄':['心','heart'],'亻':['人','person'],'扌':['手','hand'],'艹':['草木','plants'],'衤':['衣','clothing'],'糸':['絲','silk'],'言':['言語','speech'],'虫':['蟲','creature'],'木':['樹木','tree'],'日':['太陽','sun'],'耳':['耳','ear'],'雨':['雨','rain'],'女':['女','woman'],'口':['口','mouth'],'金':['金屬','metal'],'力':['力','strength'],'頁':['頭','head'],'土':['土','earth'],'米':['米','rice'],'火':['火','fire'],'肉':['肉','flesh'],'竹':['竹','bamboo'],'犭':['犬','dog'],'山':['山','mountain'],'齒':['牙齒','teeth'],'玉':['玉','jade'],'缶':['陶器','earthenware'],'阝':['阜','mound'],'冫':['冰','ice'],'穴':['洞穴','cavity'],'食':['食物','food'],'戶':['門戶','door'],'貝':['貝','shell']};
  let view='build',frame=['氵','工'],target=0,family='寺',member='時',specimen='木',book=K.start();
  const practice=K.constructionPractice();
  let soundResult=false,progress=[false,false,false,false,false],model=null,sceneToken=0,drawFrame=0,activeDrag=null,suppressClick=false;
  let turned=false,specimenChanged=false;
  function asset(key,stage){return 'img/han-character-formation/'+key+'-'+stage+(key==='wood'&&stage==='oracle'?'.svg':'.png');}
  function word(){return view==='family'?K.get(member):view==='shell'?K.get(specimen):K.assemble(frame);}
  function feedback(message=''){$('feedback').hidden=!message;txt($('feedback'),message);}
  function chime(freq){if(LabSound.enabled())LabSound.tone({freq,dur:.16,gain:.17,type:'triangle'});}
  function step(i){progress[i]=true;const next=progress.indexOf(false);LabStepGuide.update(next<0?progress.length:next,{key:slug,auto:true});}
  function newGuess(){
    $('typeGuess').value='';$('roleGuess').value='';
    document.querySelectorAll('#flags input').forEach(n=>{n.checked=false;});
    soundResult=false;feedback();
  }
  function put(p,where=target){
    frame[where]=p;target=1-where;if(p)step(0);newGuess();render();if(K.assemble(frame))chime(392);
  }
  function loadWord(char){
    const w=K.get(char);if(!w)return;
    // Keep the lead phonetic in front when the customary square form puts it there.
    frame=w.parts.slice();if('功攻項貢放'.includes(char))frame.reverse();
    if(frame.length===1)frame.push('');target=0;newGuess();render();step(0);
  }
  function record(kind,char){
    book=K.record(book,kind,char);const ev=K.snapshot(book,kind,char);
    if(window.LabMission)LabMission.emit('han-evidence',ev);
    updateBook();chime(523);
  }
  function metric(label,value){
    const box=el('div','metric');const caption=el('span'),num=el('strong');
    txt(caption,label);if(value instanceof Node)num.append(value);else txt(num,value);
    box.append(caption,num);return box;
  }
  function buildPanel(){
    const w=K.assemble(frame);
    frame.forEach((p,i)=>{const b=$('slot'+i);b.classList.toggle('chosen',i===target);b.setAttribute('aria-pressed',String(i===target));
      const g=b.querySelector('.glyph');original(g,partName(p));g.classList.toggle('markword',!!K.markers[p]);
      b.setAttribute('aria-label',T('選字框 ','Select frame ')+(i?'B':'A'));});
    const big=$('bigChar');original(big,w?w.char:'—');big.classList.toggle('missing',!w);
    txt($('bigTone'),w?.reading||'');
    if(w&&!english)$('bigGloss').replaceChildren(glyph(w.example));else txt($('bigGloss'),w?w.gloss:T('字庫未收此組合','No entry in this collection'));
    const status=practice.state(w?.char),shown=practice.visible(w?.char);
    $('catalog').value=w?.char||'';$('allParts').value='';
    $('buildCheck').disabled=!w||status==='shown';
    $('showAnswer').hidden=!w||status!=='eligible';
    const unknown=w?T('？','?'):'—';
    const vals=frame.map(p=>shown?(p?roleName(w.role[w.parts.indexOf(p)]):'—'):unknown);
    $('metrics').replaceChildren(metric(T('造字法','Construction'),shown?typeName(w):unknown),metric(T('A 框角色','Role of A'),vals[0]),metric(T('B 框角色','Role of B'),vals[1]));
    if(!w)txt($('stageHint'),T('換一個部件，或從字庫載入一個字。','Swap a component or load a character.'));
    else if(!shown)txt($('stageHint'),T('先在「我的判讀」選答案，按「核對構形」。','Make a prediction under Your analysis, then choose Check construction.'));
    else if(status==='shown')txt($('stageHint'),T('已看答案。本字不列入構形筆記，也不計構形任務。','Answer viewed. This character earns no construction notebook entry or mission credit.'));
    else txt($('stageHint'),T('判讀正確。對照兩框，看看每個部件的作用。','Correct. Compare the roles of the two frames.'));
  }
  function positions(index,total){
    const angle=-Math.PI/2+index*2*Math.PI/total;return {x:50+36*Math.cos(angle),y:50+37*Math.sin(angle)};
  }
  function chooseMember(c){member=c;newGuess();render();}
  function familyPanel(){
    const head=K.get(family),w=K.get(member),diff=K.compare(head.reading,w.reading);
    original($('hubChar'),family);txt($('hubTone'),head.reading);
    const group=K.members(family);const nodes=group.map((a,i)=>{const b=el('button','ring-node');original(b,a.char);b.dataset.char=a.char;
      const pos=positions(i,group.length);b.style.left=pos.x+'%';b.style.top=pos.y+'%';
      b.setAttribute('aria-pressed',String(a.char===member));b.setAttribute('aria-label',T('選字','Select')+' '+a.char+' '+a.reading);
      b.addEventListener('click',()=>chooseMember(a.char));return b;});
    $('ringNodes').replaceChildren(...nodes);
    const pair=$('soundPair');pair.replaceChildren(glyph(family),document.createTextNode(' '+head.reading+' → '),glyph(member),document.createTextNode(' '+w.reading));
    appendExampleReading(pair,w);
    const empty=T('未另標','unmarked');
    $('metrics').replaceChildren(...['onset','rime','tone'].map((k,i)=>{
      const a=k==='tone'?toneName(diff.a.tone):diff.a[k]||empty,b=k==='tone'?toneName(diff.b.tone):diff.b[k]||empty;
      const mark=soundResult?(diff.flags[i]===null?' · —':diff.flags[i]?' · ✓':' · ≠'):'';
      return metric(T(...features[i]),a+' → '+b+mark);
    }));
    txt($('stageHint'),T('圓心是聲符。點外圈的字，比較兩個注音。','Select a graph on the rim and compare its reading with the central sound component.'));
  }
  function shellPanel(){
    const [key,zh,en]=art[specimen];$('oracleImg').src=asset(key,'oracle');$('sealImg').src=asset(key,'seal');
    $('shellFallback').src=asset(key,'oracle');original($('modernGlyph'),specimen);txt($('glyphNote'),T(zh,en));
    for(const stage of ['oracle','seal']){
      $(stage+'Link').href='https://commons.wikimedia.org/wiki/File:'+encodeURIComponent(specimen+'-'+stage+'.svg');
      txt($(stage+'Credit'),T(...S.glyphCredits[specimen][stage]));
    }
    $('metrics').replaceChildren(metric(T('展字','Specimen'),glyph(specimen)),metric(T('國語注音','Reading'),K.get(specimen).reading),metric(T('器物','Object'),T('龜腹甲','Plastron')));
    txt($('stageHint'),T('拖曳可轉動龜甲。切到平移可移動觀察位置。','Drag to rotate the shell. Switch to Pan to move the viewing position.'));
  }
  const link=(url,label)=>{const a=el('a');a.href=url;a.target='_blank';a.rel='noopener';txt(a,label);return a;};
  function entry(){
    const w=word(),dst=$('entryBody'),previous=dst.querySelector('.source-quote');
    const keepOpen=previous?.open&&previous.dataset.char===w?.char;
    dst.replaceChildren();
    if(!w){txt(dst,T('先組出字庫中的字，就能查閱該字說解。','Assemble a listed character to read its source entry.'));return;}
    const heading=el('p');heading.append(glyph(w.char,'strong'),document.createTextNode('　'+w.reading+'　'),
      english?document.createTextNode(w.gloss):glyph(w.example));
    const revealed=practice.visible(w.char);
    if(revealed)heading.append(' · '+typeName(w));
    if(w.head!==w.char)heading.append(document.createTextNode('　'+T('《說文》字頭 ','Original headword ')),glyph(w.head));
    appendSupplement(heading,w);
    const quote=el('details','source-quote'),summary=el('summary');
    quote.dataset.char=w.char;quote.open=Boolean(keepOpen);
    txt(summary,T('卡住了？讀《說文》原文','Need a clue? Read the Shuowen entry'));
    quote.append(summary,original(el('blockquote'),w.quote));
    const list=el('p');
    w.parts.forEach((p,i)=>{if(i)list.append(document.createTextNode('　/　'));
      list.append(glyph(partName(p)));
      if(traditionalParts[p])list.append(document.createTextNode(' ('),glyph(traditionalParts[p]),document.createTextNode(')'));
      list.append(document.createTextNode(' · '+roleName(w.role[i])));
      if(meaningNames[p]&&['meaning','whole'].includes(w.role[i]))list.append(document.createTextNode(' · '+T(...meaningNames[p])));
    });
    const links=el('div','links');links.append(link('https://www.shuowen.org/view/'+w.source,T('《說文》原條','Shuowen entry')),
      link('https://dict.revised.moe.edu.tw/dictView.jsp?ID='+w.moe+'&la=0&powerMode=0',T('教育部字音與字義','MOE reading and meanings')));
    const ref=S.entries[w.char];
    dst.append(heading,quote);
    if(ref?.collation){
      const v=ref.collation,note=el('p','collation'),label=el('strong');
      txt(label,T('校記','Edition note'));
      note.append(label,'　',T('本站數位轉錄作「','The transcription used here reads “'),glyph(v.transcription),
        T('」，四庫本作「','” and the Siku edition reads “'),glyph(v.facsimile),T('」。','”.'));
      quote.append(note);
      links.append(link(S.digitalEdition+w.source+'.json',T('本站所據數位轉錄','Transcription used here')),
        link(v.scan,T('四庫本','Siku facsimile, ')+T(...v.location)));
    }
    if(ref?.supplement)links.append(link(ref.supplement,T('教育部新附字考據','MOE evidence for the added entry')));
    if(ref?.exampleReading){
      const example=el('p');
      example.append(T('例詞讀音　','Example reading　'),glyph(w.example),' '+ref.exampleReading);
      dst.append(example);
      links.append(link(ref.exampleSource,T('教育部例詞讀音','MOE reading of the example')));
    }
    if(revealed)dst.append(list);
    dst.append(links);
    if(revealed&&w.type==='S'){
      const relatives=K.words.filter(x=>x!==w&&x.type==='S'&&x.parts[0]===w.parts[0]);
      if(relatives.length){
        const line=el('div','relatives');line.append(document.createTextNode(T('換聲符，保留形旁','Keep the meaning component')));
        for(const relative of relatives){const b=original(el('button','glyph'),relative.char);
          b.onclick=()=>{changeView('build');loadWord(relative.char);$('scene').scrollIntoView({block:'center',behavior:'instant'});};line.append(b);}
        dst.append(line);
      }
    }
  }
  const uses={
    old:{prompt:['《說文》以「老」解「考」，又以「考」解「老」。這對字用哪個術語說明？','One entry defines old age with the other, and the second refers back to the first. Which term did Xu Shen use for this pair?'],
      reason:['考、老在〈敘〉成對舉例，兩條說解可以互相參讀。','The postface pairs these graphs, and each entry glosses the other.'],sources:[['考','First entry',5359],['老','Second entry',5351]]},
    wheat:{prompt:['《說文》說「來」的字形象麥，這個字又用來寫往來的「來」。同一字形記另一個詞，屬於哪種用法？','A graph depicting wheat also writes the verb meaning to come. Which term describes using that graph for another word?'],
      reason:['原字形記麥，借它的音來寫另一個詞。','The graph for wheat was borrowed for another word on the basis of sound.'],sources:[['來','Entry for the wheat graph',3331]]}
  };
  function updateUse(){
    const a=uses[$('useCase').value];txt($('caseText'),T(...a.prompt));txt($('caseFeedback'),'');
    $('caseLinks').replaceChildren(...a.sources.map(([zh,en,id])=>link('https://www.shuowen.org/view/'+id,T('《說文》'+zh,en))));
  }
  $('useCase').onchange=updateUse;
  document.querySelectorAll('[data-case-guess]').forEach(b=>{b.onclick=()=>{const ok=b.dataset.caseGuess===$('useCase').value;
    txt($('caseFeedback'),(ok?T('答對了。','Correct. '):T('再比讀。','Read the entries again. '))+T(...uses[$('useCase').value].reason));};});
  function updateBook(){
    const lines=[['已判讀','Construction',book.built],['已比音','Readings',book.heard]];
    $('notebook').replaceChildren(...lines.map(([zh,en,items])=>{
      const p=el('p');p.append(T(zh,en)+' · '+items.length+'　');
      if(!items.length)p.append('—');
      items.forEach((ch,i)=>{
        const w=K.get(ch),item=el('span','book-entry');
        if(i)p.append(' / ');
        item.append(glyph(ch));
        if(items===book.heard)item.append(' ('+tonePair(w)+')');
        appendSupplement(item,w);p.append(item);
      });
      return p;
    }));
  }
  function draw(){
    drawFrame=0;if(view==='shell'||document.hidden)return;
    const cv=$('cv'),w=cv.clientWidth,h=cv.clientHeight;if(!w||!h)return;
    const dpr=Math.min(devicePixelRatio||1,2);cv.width=Math.round(w*dpr);cv.height=Math.round(h*dpr);
    const g=cv.getContext('2d');g.setTransform(dpr,0,0,dpr,0,0);D.backdrop(g,w,h);
    const c=D.c;const wash=g.createLinearGradient(0,0,w,h);wash.addColorStop(0,D.alpha(c.equi,.065));wash.addColorStop(1,D.alpha(c.equi,.17));g.fillStyle=wash;g.fillRect(0,0,w,h);
    // Paper fibers, ruled edge and register marks stay fixed while letters move.
    g.lineWidth=1;g.strokeStyle=D.alpha(c.equi,.035);
    for(let i=0;i<h;i+=4){g.beginPath();g.moveTo(0,i+.5);g.lineTo(w,i+Math.sin(i)*.65);g.stroke();}
    g.strokeStyle=D.alpha(c.equi,.32);g.strokeRect(10.5,10.5,w-21,h-21);
    if(view==='family'){
      const group=K.members(family);g.strokeStyle=D.alpha(c.accent,.39);g.setLineDash([3,5]);g.beginPath();g.ellipse(w*.5,h*.5,w*.36,h*.37,0,0,2*Math.PI);g.stroke();g.setLineDash([]);
      group.forEach((a,i)=>{const pos=positions(i,group.length);g.strokeStyle=D.alpha(a.char===member?c.pos:c.accent,a.char===member?.72:.20);g.lineWidth=a.char===member?2.6:1;g.beginPath();g.moveTo(w*.5,h*.5);g.lineTo(w*pos.x/100,h*pos.y/100);g.stroke();});
    }else{
      // The ruled result square is independent of the component placement on the left.
      const box=Math.min(w*.42,h*.60),x=w*.70-box/2,y=h*.48-box/2;
      g.fillStyle=D.alpha(c['canvas-bg'],.5);g.fillRect(x,y,box,box);g.strokeStyle=D.alpha(c.pos,.38);g.lineWidth=1.3;g.strokeRect(x,y,box,box);
      g.strokeStyle=D.alpha(c.pos,.2);g.setLineDash([4,6]);g.beginPath();g.moveTo(x,y+box/2);g.lineTo(x+box,y+box/2);g.moveTo(x+box/2,y);g.lineTo(x+box/2,y+box);g.moveTo(x,y);g.lineTo(x+box,y+box);g.moveTo(x+box,y);g.lineTo(x,y+box);g.stroke();g.setLineDash([]);
      g.strokeStyle=D.alpha(c.accent,.60);g.lineWidth=2;g.beginPath();g.moveTo(w*.36,h*.375);g.lineTo(w*.398,h*.375);g.lineTo(w*.425,h*.522);g.lineTo(w*.465,h*.522);g.moveTo(w*.36,h*.695);g.lineTo(w*.398,h*.695);g.lineTo(w*.425,h*.522);g.moveTo(w*.451,h*.502);g.lineTo(w*.466,h*.522);g.lineTo(w*.451,h*.542);g.stroke();
    }
  }
  function requestDraw(){if(!drawFrame)drawFrame=requestAnimationFrame(draw);}
  function render(){
    for(const mode of ['build','family','shell']){$(mode+'View').setAttribute('aria-pressed',String(view===mode));$(mode+'Tools').hidden=view!==mode;}
    $('buildLayer').hidden=view!=='build';$('familyLayer').hidden=view!=='family';$('shellHost').hidden=view!=='shell';$('cv').hidden=view==='shell';$('home3d').hidden=view!=='shell';$('shellNav').hidden=view!=='shell';
    if(view==='build')buildPanel();else if(view==='family')familyPanel();else shellPanel();
    entry();requestDraw();txt($('soundBtn'),LabSound.enabled()?T('音效開','Sound on'):T('音效關','Sound off'));
    $('soundBtn').setAttribute('aria-pressed',String(LabSound.enabled()));
  }
  async function openShell(){
    const token=++sceneToken;
    const buttons=$('shellViews').querySelectorAll('button');
    buttons.forEach(b=>{b.disabled=true;b.setAttribute('aria-pressed',String(b.dataset.pose==='front'));});
    try{
      const m=await HanShell.create($('shellHost'),T,pose=>{
        buttons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.pose===pose)));
        if(pose!=='front'){turned=true;if(specimenChanged)step(4);}
      },$('shellNav'));
      if(token!==sceneToken){m.dispose();return;}
      model=m;await m.exhibit(art[specimen][0]);if(token===sceneToken)buttons.forEach(b=>{b.disabled=false;});
    }catch(e){
      if(token!==sceneToken)return;
      if(model){model.dispose();model=null;}
      $('shellFallback').hidden=false;feedback(T('此裝置未能顯示立體龜甲，可繼續對照三種字形。','3D is unavailable on this device. The three forms can still be compared.'));
    }
  }
  function changeView(v){
    if(v===view)return;
    ++sceneToken;if(model){model.dispose();model=null;}
    $('shellFallback').hidden=true;view=v;newGuess();render();
    if(v==='shell')openShell();
    if(v==='family')step(2);
  }
  function selectOptions(id,items){$(id).replaceChildren(...items.map(([value,s])=>option(value,s)));}
  selectOptions('allParts',[['',T('選部件放入框','Add a part…')],...K.parts.map(p=>[p,partName(p)])]);
  selectOptions('catalog',[['',T('選擇字例','Choose an entry')],...K.words.map(w=>[w.char,w.char+'　'+w.reading+'　'+T(w.example,w.gloss)])]);
  selectOptions('family',K.families.map(f=>[f,f+'　'+K.get(f).reading+'　('+K.members(f).length+')']));
  selectOptions('specimen',Object.entries(art).map(([f,[key]])=>[f,f+'　'+T(K.get(f).example,key)]));
  selectOptions('typeGuess',[['',T('選擇類別','Choose type')],...theory.map(t=>[t,T(...K.types[t])])]);
  selectOptions('roleGuess',[['',T('選擇角色','Choose role')],['0',T('A 框','Frame A')],['1',T('B 框','Frame B')],['none',T('沒有聲符','No sound component')]]);
  features.forEach(([zh,en],i)=>{const label=el('label','flag'),input=el('input');input.type='checkbox';input.value=[4,2,1][i];label.append(input,document.createTextNode(T(zh,en)));$('flags').append(label);});
  function finishDrag(e,cancel=false){
    if(!activeDrag||activeDrag.id!==e.pointerId)return;
    const d=activeDrag;activeDrag=null;d.copy?.remove();document.querySelectorAll('.frame.over').forEach(b=>b.classList.remove('over'));
    if(!d.drag)return;
    suppressClick=true;setTimeout(()=>{suppressClick=false;},0);
    const slot=!cancel&&document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-target]');
    if(slot)put(d.p,Number(slot.dataset.target));
  }
  initials.forEach(p=>{const b=el('button');original(b,p);b.dataset.part=p;
    b.addEventListener('click',()=>{if(!suppressClick)put(p);});
    b.addEventListener('pointerdown',e=>{if(e.button!==0||activeDrag)return;activeDrag={id:e.pointerId,p,x:e.clientX,y:e.clientY,drag:false};b.setPointerCapture(e.pointerId);});
    b.addEventListener('pointermove',e=>{const d=activeDrag;if(!d||d.id!==e.pointerId)return;
      if(!d.drag&&Math.hypot(e.clientX-d.x,e.clientY-d.y)<5)return;
      if(!d.drag){d.drag=true;d.copy=original(el('span','dragcopy'),p);$('scene').closest('main').append(d.copy);}
      d.copy.style.left=(e.clientX+8)+'px';d.copy.style.top=(e.clientY+8)+'px';
      const over=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-target]');
      [$('slot0'),$('slot1')].forEach(s=>s.classList.toggle('over',s===over));});
    b.addEventListener('pointerup',finishDrag);b.addEventListener('pointercancel',e=>finishDrag(e,true));$('tray').append(b);
  });
  for(const v of ['build','family','shell'])$(v+'View').addEventListener('click',()=>changeView(v));
  for(let i=0;i<2;i++)$('slot'+i).addEventListener('click',()=>{target=i;render();});
  $('allParts').onchange=e=>{if(e.target.value)put(e.target.value);};
  $('catalog').onchange=e=>loadWord(e.target.value);
  $('emptySlot').onclick=()=>put('');$('swap').onclick=()=>{frame.reverse();newGuess();step(0);render();};
  $('buildCheck').onclick=()=>{
    const w=K.assemble(frame);if(!w)return;
    const result=practice.submit(frame,$('typeGuess').value,$('roleGuess').value);
    if(result==='incomplete'){feedback(T('請先選造字法和提示讀音的一框。','Choose a construction and a sound frame first.'));return;}
    if(result==='wrong'){
      buildPanel();
      if(practice.state(w.char)==='eligible')feedback(T('可以再試，也可以按「看答案」。查看後本字不計構形任務。','Try again or choose Show answer. Viewing it gives no construction credit for this character.'));
      else feedback(T('再想想部件的作用，也可以展開下方的《說文》原文找線索。','Try again. You can open the Shuowen entry below for a clue.'));
      return;
    }
    if(result==='solved'){record('build',w.char);step(1);render();feedback(T('判讀相符，已收入筆記。','Construction verified and recorded.'));}
  };
  $('showAnswer').onclick=()=>{
    if(!practice.reveal(K.assemble(frame)?.char))return;
    render();feedback($('stageHint').textContent);
  };
  $('family').onchange=e=>{family=e.target.value;chooseMember(K.members(family)[0].char);};
  $('compareCheck').onclick=()=>{
    const guess=[...document.querySelectorAll('#flags input:checked')].reduce((n,v)=>n+Number(v.value),0);
    soundResult=true;familyPanel();
    const w=K.get(member),tones=' '+tonePair(w);
    if(K.matchSound(family,member,guess)){record('compare',member);step(3);feedback(T('比對正確，已收入筆記。','Reading comparison verified and recorded.')+tones);}
    else feedback(T('再試一次。✓ 表示明示且相同，≠ 表示相異，— 表示沒有另標。','Try again. A tick means a written match, ≠ a difference, and — an unmarked feature.')+tones);
    appendExampleReading($('feedback'),w);
  };
  $('specimen').onchange=async e=>{specimen=e.target.value;specimenChanged=true;render();if(model)await model.exhibit(art[specimen][0]);
    if(turned||!$('shellFallback').hidden)step(4);};
  $('shellViews').querySelectorAll('button').forEach(b=>{b.onclick=()=>model?.setView(b.dataset.pose);});
  $('home3d').onclick=()=>model?.home();$('soundBtn').onclick=()=>LabSettings.set('sound',!LabSound.enabled());
  $('clearBook').onclick=()=>{book=K.start();progress=progress.map(()=>false);turned=false;specimenChanged=false;feedback();updateBook();LabStepGuide.update(0,{key:slug,auto:true});};
  const instructions=[
    ['在操作頁拖一塊部件到字框，或載入一個字例。','On Operate, drag a component into a frame or load a character.','catalog'],
    ['選擇造字法與聲符，按核對構形。','Choose the construction and sound frame, then check the construction.','buildCheck'],
    ['打開聲符家族，觀察圓心與外圈的字。','Open Sound families and compare the center and rim.','familyView'],
    ['勾出共同的讀音線索，再按核對讀音。','Select the matching features, then check the reading.','compareCheck'],
    ['打開龜甲展台，轉動模型並比較三種字形。','Open the 3D shell, turn the model and compare the three forms.','shellView']
  ];
  function guideTarget(i){if(i===4&&view==='shell')return $(turned||!$('shellFallback').hidden?'specimen':'turnShell');return $(instructions[i][2]);}
  function guide(i){if(i<=1)changeView('build');else if(i===3)changeView('family');window.LabDeck?.reveal(guideTarget(i));LabStepGuide.show(i,{key:slug});}
  LabStepGuide.define(instructions.map(([zh,en],i)=>({hint:[zh,en],action:'tap',target:()=>guideTarget(i)})),{key:slug});
  LabSide.mount({module:slug,guide,steps:()=>instructions.map(([zh,en],i)=>({html:T(zh,en),done:progress[i],current:i===progress.indexOf(false),need:[[progress[i],zh,en]]}))});
  new ResizeObserver(requestDraw).observe($('scene'));
  window.addEventListener('lab:themechange',()=>{D.refresh();model?.theme();requestDraw();});
  window.addEventListener('lab:settingschange',()=>{render();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)requestDraw();});
  window.addEventListener('pagehide',()=>{++sceneToken;if(model){model.dispose();model=null;}});
  window.addEventListener('pageshow',e=>{if(e.persisted&&view==='shell'&&!model)openShell();});
  updateUse();updateBook();render();LabStepGuide.update(0,{key:slug,auto:true});
})();
