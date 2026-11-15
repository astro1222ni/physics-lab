/* C4-04-1 初稿。source 是審稿出處，不當作額外指令。所有畫面物理交給 InclineCore。 */
(function(root){
  'use strict';
  const S={script:'課程講稿',lecture:'課堂講法',warning:'上限提醒',formula:'範例解法',design:'單元自編'};
  const videos={
    lecture:{time:'17:21',href:'https://youtu.be/IVTzpNB02hI?t=1041'},
    warning:{time:'13:56',href:'https://youtu.be/IVTzpNB02hI?t=836'},
    formula:{time:'19:41',href:'https://youtu.be/IVTzpNB02hI?t=1181'}
  };
  const step=(cap,body,source,extra)=>Object.assign({cap,body,source,videoKeys:Object.keys(videos).filter(k=>source.includes(S[k]))},extra || {});
  const board=[['未滑動：f = F，大小相等、方向相反。','At rest: f = F, equal magnitudes and opposite directions.'],['恰滑動：靜摩擦力剛好到達上限。','At the threshold: static friction has just reached its limit.'],['已滑動：換成動摩擦力，這裡是 19.6 N。','Sliding: friction is kinetic; here its magnitude is 19.6 N.']];
  const data={id:'c4-04-1',title:['靜摩擦力會跟著外力變','Static friction follows the pull'],board,videos,
    shortBoard:[['未滑動：f = F','At rest: f = F'],['恰滑動：f = 最大靜摩擦力','Threshold: f = static limit'],['已滑動：f = 動摩擦力','Sliding: f = kinetic friction']],
    photo:{kind:'illustration',alt:['手正在水平推一個三層落地書櫃，書櫃沒有滑動','A hand pushes a three-shelf bookcase horizontally; the bookcase stays at rest'],credit:['自製器材示意插畫','Original apparatus illustration'],context:['先觀察手和書櫃的接觸點，再想想誰在平衡推力。','Look at where the hand touches the bookcase. What balances the push?']},
    sections:[
      {title:['引起動機','Get curious'],kind:'photo',steps:[
        step(["你推一個書櫃，推不動。你推大一點……","You push a bookcase. It won't budge. So you push harder…"],['搬家時，先別急著用更大的力。我們先問：沒推動，就代表沒有摩擦力嗎？','When moving furniture, pause before pushing harder. Does staying still mean that there is no friction?'],S.script+' 3-6；情境自編'),
        step(['明明有推，為什麼還不動？','You are pushing. Why is it still at rest?'],['這支箭頭只表示你的水平推力。還有誰在平衡它？先保留你的直覺。','The arrow represents your horizontal push. What balances it? Keep your first guess for now.'],S.design),
        step(['是書櫃比你大力嗎？','Is the bookcase stronger than you?'],['書櫃沒有在跟你比腕力。下一段先猜一猜，等等讓實驗說話。','The bookcase is not arm-wrestling you. Make a prediction, then let the experiment speak.'],S.design)
      ]},
      {title:['先預測','Predict first'],kind:'prediction',steps:[
        step(['先猜，不用怕錯。','Make a guess. It is fine to be wrong.'],['物理這個東西不能投票表決啦，但是可以先舉手。先選你現在認為的答案，對答案那一段再回頭看。','Physics is not decided by a vote, but we can raise our hands first. Choose what you think now; we will return to it after experimenting.'],S.script+' 0-3', {question:'p1'}),
        step(['你猜 f–F 圖會長什麼樣？','What shape do you predict for the f–F graph?'],['橫軸是拉力 F 的大小，縱軸是摩擦力 f 的大小。慢慢加力，從還沒滑到已經在滑，選一條你認為合理的線。','The horizontal axis is pull magnitude F; the vertical axis is friction magnitude f. Choose a curve for increasing pull, from rest to sliding.'],S.design,{question:'p2'}),
        step(['答案先鎖住，我們來看它怎麼變。',"Answers locked. Let's see what happens."],['不是考你背圖。接下來每按一步，只看一個變化；你隨時可以退回去重看。','This is not a test of memorising a graph. Reveal one change at a time; you can always step back.'],S.design)
      ]},
      {title:['觀念講解','Build the idea'],kind:'scene',steps:[
        step(['沒拉：F = 0，f 也等於 0。','No pull: F = 0, and f = 0.'],['這裡是水平桌面，木塊 5 kg。沒有水平外力，也沒有想滑的趨勢，所以不需要摩擦力。','A 5 kg block rests on a horizontal table. With no horizontal pull or tendency to slip, no friction is needed.'],S.design,{F:0}),
        step(['拉 5 N，它就擋 5 N。','Pull with 5 N; friction balances 5 N.'],['木塊想往右滑，靜摩擦力朝左。大小一樣，合力是零，所以木塊繼續不動。注意：趨勢不等於已經滑動。','The block tends to slip right, so static friction acts left. Equal magnitudes give zero net force. A tendency is not actual sliding.'],S.lecture,{F:5}),
        step(['拉 15 N，它就跟著變成 15 N。','Increase the pull to 15 N; friction follows.'],['這個施力變大一點，這個靜摩擦力就跟著大一點。它沒有固定要出幾牛頓；它是被動地平衡其他的力。','Increase the applied force a little and static friction increases with it. It has no single preset value; it adjusts to balance the other forces.'],S.lecture,{F:15}),
        step(['需要多少，就給多少；還沒到頂。','It supplies what is needed, up to a limit.'],['特別注意，特別注意，特別注意。靜摩擦力它有一個上限。不是每一次靜止都頂在上限喔。','Pay attention — really, pay attention: static friction has a limit. Being at rest does not mean it is at the limit.'],S.script+' 3-7；'+S.warning,{F:15}),
        step(['24.5 N：跟到最大，恰滑動。','24.5 N: maxed out — on the verge of slipping.'],['它就跟到最大、最大、最大。這時候叫「恰滑動」：剛好到上限，仍然能保持靜止；再多一點才開始滑。','It follows up to its maximum. At this threshold it can still remain at rest. A slightly greater pull starts the slide.'],S.lecture,{F:24.5}),
        step(["實在是跟不住了，滑了！f 掉到 19.6 N。","It just can't keep up — it slips! f drops to 19.6 N."],['接觸面開始滑動，換成動摩擦力。這組器材量到 19.6 N，比剛才的上限小一點。','Once the surfaces slip, friction becomes kinetic. For these surfaces we measure 19.6 N, slightly below the static limit.'],S.design,{F:25,sliding:true}),
        step(['繼續加力，動摩擦力沒有跟著長。','Pull harder; kinetic friction does not grow.'],['同一接觸面、相同正向力下，這個模型的動摩擦力維持 19.6 N。滑得更快，不會讓它自己變小。','For the same surfaces and normal force, kinetic friction stays at 19.6 N in this model. Sliding faster does not make it smaller.'],S.design+'；〔40〕授課觀念（速度迷思）',{F:40,sliding:true}),
        step(['未滑動、恰滑動、已滑動，分清楚。','At rest, on the verge, sliding: tell them apart.'],['靜摩擦還是動摩擦，看接觸面有沒有滑。這三行先帶走，先判斷狀態，再談大小。','Static or kinetic? Check whether the surfaces slip. Keep these three lines: identify the state before finding the magnitude.'],S.lecture+'；'+S.script+' 9-3',{F:40,sliding:true,board:true})
      ]},
      {title:['動手實驗','Try it yourself'],kind:'experiment',steps:[
        step(['先輕輕拉，不要一下拉爆。','Pull gently. Do not yank it straight to the limit.'],["用手指拖拉環就好。先輕輕拉，不要一下拉爆，木塊沒有欠你錢。放手，拉力就歸零；也能拖圖上的點，或用方向鍵每次調 0.5 N、Shift 每次調 5 N。打開「步驟」，跟著做。","Just drag the ring. Start gently — no need to yank it, the block didn't do anything to you. Releasing sets the pull to zero. You can also drag the graph point, or use arrow keys for 0.5 N steps and Shift for 5 N. Open Steps to follow along."],S.design)
      ]},
      {title:['對答案','Compare your prediction'],kind:'compare',steps:[
        step(['先看讀數：沒動，不代表沒有摩擦力。','Check the reading: at rest does not mean no friction.'],['10 N 拉不動，表示水平合力是零，所以摩擦力是 10 N，方向與拉力相反。它不是比較大，也不一定已經到上限。','A 10 N pull with no motion means zero horizontal net force. Friction is 10 N in the opposite direction, not a larger force or necessarily the maximum.'],S.design,{question:'p1'}),
        step(['把你的草圖，和剛才量到的曲線疊起來。','Overlay your sketch on the curve you measured.'],['選水平線的同學，你很正常，國中那張圖大家都只背了形狀。現在分清楚：靜摩擦跟著變，動摩擦才在這裡變平。灰色寬帶是你的預測。','Picked the flat line? Totally normal — most of us only memorised the shape of that graph. Static friction adjusts; kinetic friction is flat here. The grey band shows your prediction.'],S.script+' 0-4 仿寫（新）；'+S.design)
      ]},
      {title:['範例','Worked examples'],kind:'examples',steps:[
        step(['先看狀態和趨勢，再看需要多少。','Find the state and tendency, then the friction needed.'],["只要看到靜摩擦力就代公式，那是不對的。很多同學在這裡亂代公式，那就是傷害了。先讀側板的題目，再切換範例，想好才按「看解答」。","Plugging into a formula the moment you see static friction? That's wrong. That's exactly where the damage happens. Read the question, switch examples, then reveal the solution when you are ready."],S.script+' 8-8；'+S.formula)
      ]},
      {title:['隨堂三題','Three quick checks'],kind:'quiz',steps:[
        step(['沒推動，先用合力是零來想。','If it stays at rest, start with zero net force.'],["先自己選，錯了再選，這裡不扣分。推不動不是摩擦力打贏你，是它剛好跟你打平。","Choose first; you can try again, no penalty. It's not that friction beats you — it exactly ties with you."],S.design,{question:'q1'}),
        step(['已經在滑，現在是哪一種摩擦力？','It is already sliding. Which kind of friction applies?'],['接觸面和正向力都沒改變。先分辨靜摩擦和動摩擦，再看拉力變了會不會影響摩擦力。','The surfaces and normal force are unchanged. Distinguish static from kinetic friction before deciding what the changed pull does.'],S.design,{question:'q2'}),
        step(['還沒開始滑，要跟哪個上限比？','Starting from rest: which limit matters?'],['同一箱子現在重新靜止。不要拿已滑動時的讀數，判斷它會不會開始滑。','The same box is now at rest again. Do not use the sliding-friction reading to decide when it starts to slip.'],S.design,{question:'q3'})
      ]},
      {title:['小結','Take it with you'],kind:'summary',steps:[
        step(['未滑動：需要多少，就給多少。','At rest: friction supplies what is needed.'],['先看接觸面有沒有滑，再用平衡找需要的摩擦力。這一頁說的 f 和 F 都是大小。','First check for slip, then use equilibrium to find the friction needed. Here f and F denote magnitudes.'],S.script+' 3-7、9-3'),
        step(['恰滑動：剛好到上限。','At the threshold: just at the limit.'],['到上限還是靜摩擦；比上限再大一點，靜摩擦才撐不住。','At the limit friction is still static. A slightly greater demand exceeds what static friction can supply.'],S.lecture),
        step(['已滑動：換成動摩擦力。','Sliding: friction is now kinetic.'],['這組接觸面與正向力不變時，動摩擦力大小幾乎固定，方向與相對滑動相反。','With the same surfaces and normal force, kinetic friction is approximately constant and opposes relative sliding.'],S.design),
        step(['推多少擋多少，擋到上限為止。','Push more, it resists more — until it hits the limit.'],['靜摩擦力是被動的：大小、方向都跟著需要變。上限有多大？下一單元接著看。','Static friction responds to what is needed, in magnitude and direction. How big is the limit? That is next.'],S.script+' 3-6、3-7；下單元預告')
      ]}
    ],
    questions:{
      p1:{q:['用 10 N 水平拉木塊，木塊沒有動。摩擦力的大小是？','Pull a block horizontally with 10 N. It stays at rest. What is the friction magnitude?'],correct:1,options:[['0 N','0 N'],['10 N','10 N'],['24.5 N','24.5 N'],['目前不知道','I am not sure yet']],misconceptions:['M1',null,'M3','M1/M3'],feedback:[
        ['M1｜沒動不代表沒有摩擦力。10 N 拉力需要 10 N 靜摩擦力來平衡。','M1 | Staying still does not mean no friction. A 10 N pull needs 10 N of static friction to balance it.'],
        ['✓ 沒滑、合力為零，所以 f = 10 N；方向和拉力相反。','✓ No slip and zero net force: f = 10 N, opposite to the pull.'],
        ['M3｜24.5 N 是上限，不是隨時的大小。這一刻只需要 10 N。','M3 | 24.5 N is the limit, not the value at every moment. Only 10 N is needed now.'],
        ['先找合力：木塊沒動，水平合力是零。因此 f = 10 N。','Start with the net force: the block stays at rest, so the horizontal net force is zero. Thus f = 10 N.']]},
      p2:{q:['慢慢把拉力加大，從沒滑到開始滑，f–F 圖是哪一張？','Increase the pull slowly from rest into sliding. Which f–F graph fits?'],correct:2,graph:true,options:[['一路水平','Flat throughout'],['一路斜上','Rising throughout'],['斜上到頂，掉一點，再變平','Rise to a peak, drop, then stay flat']],misconceptions:['M3','M4',null],feedback:[
        ['M3｜靜摩擦力不是固定值。未滑動時跟著拉力變，直到上限。','M3 | Static friction is not constant. Before slipping it follows the pull up to its limit.'],
        ['M4｜已滑動後，摩擦力不再一路跟著長；在這個模型裡維持 19.6 N。','M4 | Once sliding begins, friction stops rising with the pull; here it stays at 19.6 N.'],
        ['✓ 靜摩擦跟著變到上限；滑動後換成較小的動摩擦力。','✓ Static friction adjusts to its limit; sliding then brings the smaller kinetic friction.']]},
      q1:{q:['用 15 N 水平推書桌，書桌沒動。地板給書桌的摩擦力是？','Push a desk horizontally with 15 N. It stays at rest. What friction does the floor exert?'],correct:0,options:[['15 N，方向和推力相反','15 N, opposite to the push'],['0 N','0 N'],['小於 15 N，推力贏一點點','Less than 15 N; the push wins slightly'],['大於 15 N，所以推不動','More than 15 N; that is why it stays still']],misconceptions:[null,'M1','M2','M2'],feedback:[
        ['✓ 沒滑、水平合力為零，f = 15 N，方向和推力相反。','✓ No slip and zero horizontal net force: f = 15 N, opposite to the push.'],
        ['M1｜沒動不是沒摩擦。要平衡 15 N 推力，就需要 15 N 摩擦力。','M1 | Still does not mean frictionless. Balancing a 15 N push requires 15 N of friction.'],
        ['M2｜如果推力贏一點點，就有合力，書桌會加速。沒動表示兩力平衡。','M2 | If the push won, a net force would accelerate the desk. Rest means the two horizontal forces balance.'],
        ['M2｜摩擦力更大也會有合力。書桌沒動，表示摩擦力剛好等於 15 N。','M2 | Larger friction would also give a net force. At rest, friction is exactly 15 N.']]},
      q2:{q:['箱子的最大靜摩擦力是 30 N，動摩擦力是 24 N。箱子已在滑，把拉力從 35 N 降到 26 N，摩擦力多大？','A box has a static-friction limit of 30 N and kinetic friction of 24 N. It is sliding. Reduce the pull from 35 N to 26 N. What is the friction?'],correct:0,options:[['24 N','24 N'],['26 N','26 N'],['30 N','30 N'],['小於 24 N，越滑越快摩擦越小','Less than 24 N; faster sliding means less friction']],misconceptions:[null,'M4','M3','M6'],feedback:[
        ['✓ 已經在滑，接觸條件沒變，動摩擦力仍是 24 N。','✓ It is sliding and the contact conditions are unchanged, so kinetic friction remains 24 N.'],
        ['M4｜f 跟著 F 變，是還沒滑的平衡情況。現在在滑，f = 24 N。','M4 | f follows F in equilibrium before slipping. It is sliding now, so f = 24 N.'],
        ['M3｜30 N 是靜摩擦的上限。已滑動要看動摩擦力，這裡是 24 N。','M3 | 30 N is the static limit. During sliding use the kinetic value: 24 N.'],
        ['M6｜這個模型的動摩擦力不會因滑得更快就變小。接觸條件相同，仍是 24 N。','M6 | Kinetic friction in this model does not shrink as speed rises. With the same contact conditions it remains 24 N.']]},
      q3:{q:['同一個箱子現在重新靜止：最大靜摩擦力 30 N、動摩擦力 24 N。用 25 N 水平推，會怎樣？','The same box is at rest again: static limit 30 N, kinetic friction 24 N. What happens with a horizontal 25 N push?'],correct:0,options:[['不動，f = 25 N','It stays at rest; f = 25 N'],['會滑，因為 25 N 大於 24 N','It slips because 25 N is greater than 24 N'],['不動，f = 30 N','It stays at rest; f = 30 N'],['不動，f = 24 N','It stays at rest; f = 24 N']],misconceptions:[null,'M5','M3','M3/M5'],feedback:[
        ['✓ 25 N 還沒超過 30 N 上限，靜摩擦撐得住；需要多少給多少，f = 25 N。','✓ 25 N is below the 30 N static limit, so friction can hold it at rest and supplies the needed 25 N.'],
        ['M5｜會不會開始滑，要和靜摩擦的上限比。25 N 小於 30 N，所以沒滑。','M5 | Starting to slip depends on the static limit. Since 25 N is below 30 N, it stays at rest.'],
        ['M3｜上限 30 N 不代表現在就是 30 N。平衡 25 N 推力，只需要 25 N。','M3 | A 30 N limit does not mean friction is 30 N now. Only 25 N is needed to balance the push.'],
        ['M3／M5｜24 N 是已滑動的數值。現在沒滑，靜摩擦會調成 25 N。','M3/M5 | 24 N is the sliding value. At rest, static friction adjusts to 25 N.']]}
    },
    experimentSteps:[
      {t:['輕輕拉到 5 N，木塊不動','Gently reach 5 N without sliding'],detail:['維持 1 秒。先輕輕拉，不要一下拉爆。','Hold for 1 second. Start gently, without a sudden yank.'],check:s=>Math.abs(s.F-5)<.5&&!s.moving,hold:1},
      {t:['看摩擦力也是 5 N，朝左','See 5 N of friction acting left'],detail:['看箭頭 2 秒，或按「看到了」。','Watch the arrow for 2 seconds, or press “I see it”.'],check:s=>Math.abs(s.F-5)<.5&&s.f>0&&!s.moving,hold:2,ack:true},
      {t:['拉到 15 N，看兩支箭頭一起變長','Reach 15 N; see both arrows grow'],check:s=>Math.abs(s.F-15)<.5&&!s.moving,hold:.5},
      {t:['慢慢加力直到滑動，讀紅指針','Increase the pull to slipping; read the red marker'],detail:['紅色指針記住拉力計的最大讀數。剛開始滑時記下讀數；若再繼續加力，最大讀數也會更新。','The red marker retains the highest scale reading. Note the reading when slipping starts; pulling harder afterwards also raises this marker.'],check:s=>s.type==='slip',hold:0},
      {t:['滑動中，把讀數維持在 20 N 左右 1 秒，看它慢慢加速','While sliding, keep the reading near 20 N for 1 s and watch it slowly accelerate'],detail:['用預設桌面，先拉超過上限讓木塊向右滑，再把讀數調到 20 N 左右。讀數恰為 20 N 時，動摩擦力為 19.6 N，合力 \\(20-19.6=0.4\\ \\mathrm{N}\\) 向右。5 kg 木塊的 \\(a=\\frac{0.4}{5}=0.08\\ \\mathrm{m/s^2}\\)，正在加速。要等速，拉力必須剛好是 19.6 N；小於 19.6 N 會減速。從靜止直接拉 20 N，不會讓它自己滑起來。','Use the default table. First pull past the limit to start the block sliding right, then adjust to about 20 N. At exactly 20 N, kinetic friction is 19.6 N, so the net force is \\(20-19.6=0.4\\ \\mathrm{N}\\) to the right. The 5 kg block has \\(a=\\frac{0.4}{5}=0.08\\ \\mathrm{m/s^2}\\): it is accelerating. Constant speed requires exactly 19.6 N; below 19.6 N it slows down. A 20 N pull will not start it sliding from rest.'],check:s=>s.moving&&s.F>19.6&&s.F<=20.6&&s.f>0&&s.net<0,hold:1},
      {t:['放手等停下，換邊輕拉，看方向翻轉','Release, wait for rest, then pull gently from the other side'],detail:['在「觀念」下方的設定勾「換邊拉」。朝左拉超過 3 N，保持靜止。','In the settings under Concept, enable “Pull from the other side”. Pull left above 3 N while remaining at rest.'],check:s=>s.F< -3&&!s.moving,hold:.5}
    ]
  };
  // 固定課堂選項次序：正解依序 C、B、D，迷思與回饋同時搬移。
  [['q1',[1,2,0,3]],['q2',[1,0,2,3]],['q3',[1,2,3,0]]].forEach(([id,order])=>{
    const q=data.questions[id],old=q.correct;['options','feedback','misconceptions'].forEach(k=>{q[k]=order.map(i=>q[k][i]);});q.correct=order.indexOf(old);
  });
  data.misconceptionLabels={
    M1:['沒動＝沒摩擦？','No motion, no friction?'],M2:['推不動＝摩擦比較大？',"Can't move it, so friction is bigger?"],
    M3:['靜摩擦＝固定值？','Static friction is a fixed value?'],M4:['滑了還跟著拉力變？','Still follows the pull while sliding?'],
    M5:['拿動摩擦判斷會不會滑？','Using kinetic friction to predict slipping?'],M6:['越快摩擦越小？','Faster means less friction?'],M7:['摩擦力方向固定？','Friction always points one way?']
  };
  if(typeof module!=='undefined'&&module.exports)module.exports=data;
  else {root.StudyUnit=data;root.Study.mount(data);}
})(typeof window!=='undefined'?window:this);
