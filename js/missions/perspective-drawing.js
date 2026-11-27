(function () {
  'use strict';
  const slug='perspective-drawing';
  const near=(a,b,tol=1e-6)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=tol;
  const samePoint=(a,b)=>a && b?near(a[0],b[0])&&near(a[1],b[1]):a===b;
  const sameDirections=(d,p)=>!!p && d.vanishing.every((v,i)=>samePoint(v,p.vanishing[i]));
  const sameLens=(d,p)=>p && near(d.fov,p.fov);
  const sameScene=(d,p)=>p && ['x','z','size'].every(k=>near(d[k],p[k]));
  const changedSide=(d,p)=>p && sameDirections(d,p) && sameLens(d,p) && near(d.z,p.z) && near(d.size,p.size)
    && d.anchor && p.anchor && Math.abs(d.anchor[0]-p.anchor[0])>.08;
  const levelView=d=>d.vanishing[1]===null;
  // 正面或斜向平視皆可。中心線上的零橫距也可直接用同一相似條件檢驗。
  const scaledOffset=(d,p,factor)=>p && near(d.x,p.x*factor,.011);
  const projectedRatio=(d,p)=>p?.apparent>0 && d.apparent!=null ? d.apparent/p.apparent : null;
  const balanced=d=>d.vanishing[0] && d.vanishing[2] && near(d.vanishing[0][0],-d.vanishing[2][0],.012);
  const offsetGap=d=>Math.abs(Math.abs(d.vanishing[0][0])-Math.abs(d.vanishing[2][0]));
  const sameSide=(d,p)=>p && d.x*p.x>0;
  const openedCorner=(d,p)=>p && sameScene(d,p) && near(d.yaw,p.yaw) && near(d.pitch,p.pitch) && d.fov>p.fov &&
    d.trace.shared && d.trace.onPaper && (Math.abs(d.trace.uv[0])>Math.tan(p.fov*Math.PI/360)+1e-6 || Math.abs(d.trace.uv[1])>p.halfHeight+1e-6);
  const mirrored=(d,p)=>p && sameScene(d,p) && sameLens(d,p) && d.vanishing[1] && p.vanishing[1] &&
    Number.isFinite(p.horizon) && near(d.horizon,-p.horizon,.006) && near(d.vanishing[1][1],-p.vanishing[1][1],.035) &&
    d.vanishing[2] && p.vanishing[2] && near(d.vanishing[2][0],p.vanishing[2][0],.003);
  const lineFamily=(d,k)=>d.trace?.axis===k;
  const step=(zh,en,test)=>({zh,en,test});
  const fresh=step('從未疊上基準的畫紙開始。','Start with a sheet without a reference.',d=>!d.prior);
  const reading=(v,p=2)=>Number.isFinite(v)?String(+v.toFixed(p)):'—';
  const readOnlyTasks=[3,7,8,9,10];
  const noStrokes=step('清空目前這一對描線，讀取牆高與取景。','Clear the selected trace pair and read the heights and framing.',d=>!d.trace);
  function currentValue(n,i,d,en){
    if(!d)return '';
    const p=d.prior,word=(zh,english)=>en?english:zh;
    const trace=d.trace?word('已描','traced')+' '+d.trace.owners.map(k=>k==='street'?word('路緣','curb'):k).join(' + '):word('未描','no pair'),vp=word('有限點 ','finite points ')+d.count;
    if(i===0)return ' · '+word('基準','reference')+' '+(p?'✓':'—');
    if(n===4)return ' · '+word('紙內水平點 ','horizontal points ')+d.horizontalInterior+' · '+word('左右距離差 ','offset difference ')+reading(d.horizontalInterior===2?offsetGap(d):null,3)+' · '+word('已描方向 ','traced ')+(d.families||[]).map(k=>k===0?word('寬','width'):word('深','depth')).join(' / ');
    if([1,2,5].includes(n))return ' · '+vp+' · '+word('紙內水平點 ','horizontal points on paper ')+d.horizontalInside+' · '+trace;
    if(n===10)return ' · '+word('仰俯 ','tilt ')+reading(p?.pitch)+'° → '+reading(d.pitch)+'°';
    if(n===6)return ' · Δu '+reading(d.anchor&&p?.anchor?Math.abs(d.anchor[0]-p.anchor[0]):null,3)+' · '+trace;
    if(n===8 && i!==4)return ' · '+word('底寬／縱深比例 ','width / depth scales ')+reading(p?d.size/p.size:null)+' / '+reading(p?d.z/p.z:null);
    return ' · A/B '+reading(d.heightRatio)+' · A/A′ '+reading(projectedRatio(d,p));
  }
  const saved=step('先保留一張比較基準。','Save a reference sketch.',d=>!!d.prior);
  function visible(n,title,enTitle,desc,enDesc,steps) {
    if(readOnlyTasks.includes(n)){
      desc+=' 以讀數記錄，若有選邊可先按「重描兩線」。';
      enDesc+=' Record the readings with the trace pair cleared (New pair).';
      steps.push(noStrokes);
    }
    return {id:slug+'-'+n,level:n===3?8:n===8?3:n,title:{zh:title,en:enTitle},desc:{zh:desc,en:enDesc},needOn:['recorded'],
      check:e=>e.type==='recorded' && steps.every(s=>s.test(e.data,e.data.prior)),
      need(ctx){
        const event=['recorded','preview','traced'].reduce((last,type)=>ctx.seq(type)>ctx.seq(last)?type:last);
        const d=ctx.last(event);
        return [...steps.map((s,i)=>[!!(d && s.test(d,d.prior)),s.zh+currentValue(n,i,d,false),s.en+currentValue(n,i,d,true)]),
          [null,'按畫紙下方的「記錄讀數」。','Record the readings below the paper.']];
      }};
  }
  function secret(n,level,zh,en,rule) {
    return { id:slug+'-h'+n,level,hidden:true,riddle:{zh,en},
      check:e=>e.type==='traced' && !!e.data.trace && !!rule(e.data,e.data.prior),
      need:()=>[[null,zh,en]] };
  }
  window.LabMission.register(slug,[
    visible(1,'轉過街角','Turn the corner','清除基準後，平視轉過街角，讓寬、深都有消失點，只有一個落在紙內。用描圖找出紙內的水平消失點，再記錄。','Start without a reference and turn while looking level. Put just one horizontal vanishing point on the paper. Trace two parallel horizontal edges to locate it, then record.',[
      fresh,step('讓兩組水平邊各自會聚，垂直邊仍平行。','Make both horizontal families converge while the uprights stay parallel.',d=>levelView(d)&&d.count===2),
      step('觀察水平消失點落在紙內的數目。','Check how many horizontal vanishing points are on the paper.',d=>d.horizontalInside===1),
      step('描同方向的兩條水平邊，找到紙內交點。','Trace two horizontal edges of one family that meet on the sheet.',d=>d.trace?.onPaper && [0,2].includes(d.trace.axis))]),
    visible(2,'抬頭看屋頂','Look up at the roof','從沒有基準的畫紙斜看街景並抬頭。描兩條直立牆角，找出紙張上緣之外的交點，再記錄。','Start without a reference. Turn to an oblique view and look up. Trace two uprights, find their crossing above the paper, then record.',[
      fresh,step('檢查這個取景的有限消失點。','Check the finite vanishing points in this view.',d=>d.count===3),
      step('描兩條直邊，使交點高過紙張上緣。','Trace two uprights that meet above the paper.',d=>lineFamily(d,1) && d.trace.kind==='finite' && d.trace.uv[1]>d.halfHeight)]),
    visible(3,'隔街比身高','Match across the street','保留兩棟紙上高度相差超過 3% 的基準。同取景、同橫距，將畫室沿街移近；實際樓高至少相差 B 高的一成，紙上 A/B 卻落在 0.97 到 1.03。','Save a reference with projected heights more than 3% apart. Move the studio closer along the street with its height, lateral position and framing fixed. Match A/B within 3% of one even though actual heights differ by at least a tenth of B’s height.',[
      saved,step('檢查基準的紙高差、取景及移動方向。','Check the initial difference, framing and direction of travel.',(d,p)=>p&&p.heightRatio>0&&!near(p.heightRatio,1,.030001)&&sameDirections(d,p)&&sameLens(d,p)&&near(p.size,d.size)&&near(p.x,d.x)&&d.z<p.z),
      step('比較兩棟的實際高度。','Compare the two actual heights.',d=>Math.abs(d.realHeight/d.fixedHeight-1)>=.10),
      step('比對目前紙上的樓高。','Compare the current heights on paper.',d=>near(d.heightRatio,1,.030001))]),
    visible(4,'比較遠點離中線的距離','Compare the offsets of the two points','從沒有基準的畫紙平視街角。把兩個水平消失點都放進紙內，一個靠近中線，另一個較遠。兩點到中線的距離至少相差 0.08 個單位焦距。先描寬邊，再描深邊，記錄比較。','Start without a reference and look level. Fit both horizontal vanishing points strictly inside the sheet, one nearer the centerline than the other. Make their distances from the centerline differ by at least 0.08 unit focal lengths. Trace the width edges, then the depth edges, and record.',[
      fresh,step('檢查直立牆角與兩組水平消失點的位置。','Check the uprights and the locations of the horizontal points.',d=>levelView(d)&&d.horizontalInterior===2),
      step('比較兩點離紙張中線的距離，距離差至少 0.08。','Compare the offsets from the centerline. Their difference must reach 0.08.',d=>d.horizontalInterior===2&&offsetGap(d)>=.08-1e-8),
      step('檢查這張紙是否已描過兩個水平方向。','Check which horizontal families have been traced on this sheet.',d=>lineFamily(d,2)&&d.trace.onPaper&&[0,2].every(k=>d.families?.includes(k)))]),
    visible(5,'找到第三點','Find the third point','從沒有基準的畫紙取景，使寬、高、深皆有有限消失點。描兩條直立邊，讓垂直消失點落在紙內或紙邊，再記錄。','Start without a reference. Find three finite vanishing points, trace two uprights and place their crossing on the paper or its edge, then record.',[
      fresh,step('核對各方向的消失點。','Check each family’s vanishing point.',d=>d.count===3),
      step('讓垂直消失點入框。','Fit the vertical vanishing point on the paper.',d=>d.verticalInside&&lineFamily(d,1)&&d.trace.onPaper)]),
    visible(6,'房子搬了，遠方沒搬','Move the house, keep its vanishing points','保留基準後，把畫室沿街道同一側左右移動。讓牆腳橫移超過 0.08 個單位焦距。描一條 A 的水平邊與另一條同方向邊，檢查紙內交點是否還在基準的消失點，再記錄。','Save a reference and move the studio sideways on its original side of the street. Shift its projected corner by over 0.08 unit focal lengths. Trace a horizontal edge of A and another parallel edge, compare the on-paper crossing with the reference vanishing point, then record.',[
      saved,step('檢查畫室是否仍在原側，並比較牆腳橫移量。','Check the studio stays on its original side and compare the corner shift.',(d,p)=>sameSide(d,p)&&changedSide(d,p)),
      step('檢查各方向不變，再用兩條水平邊描回一個基準消失點。','Preserve all vanishing directions and trace two horizontal edges to recover a reference vanishing point.',
        (d,p)=>sameDirections(d,p) && d.trace?.kind==='finite' && d.trace.owners.includes('A') && d.trace.onPaper && [0,2].includes(d.trace.axis) && samePoint(d.trace.uv,p.vanishing[d.trace.axis]))]),
    visible(7,'退遠，畫高減半','Halve the projected height','保留基準，沿同一條街把相同的畫室往遠處移，讓紙上牆高剩一半。比例容許相差 0.02。','Save a reference. Move the same studio farther down the street until its projected wall height is half the original, within 0.02 in ratio.',[
      saved,step('保持取景、實際樓高和橫向位置，只增加街道縱深。','Keep the framing, actual height and lateral position, then increase street depth.',(d,p)=>p&&sameDirections(d,p)&&sameLens(d,p)&&near(d.size,p.size)&&near(d.x,p.x)&&d.z>p.z),
      step('比對紙上牆高的前後比值。','Compare the current and reference projected heights.',(d,p)=>near(projectedRatio(d,p),.5,.020001))]),
    visible(8,'袖珍畫室填回原高','Half-size studio, full-size image','平視保留基準（縱深最低 4 m、底寬最低 0.8 m，所以基準要先選縱深至少 8 m、底寬至少 1.6 m），把畫室底寬、街道縱深與橫向距離都減半。原本在中線上的畫室要留在中線。維持取景，比較前後紙上牆高，容許相差 2%。','Save a level reference (depth goes down to 4 m and width to 0.8 m, so start from at least 8 m deep and 1.6 m wide). Halve the studio’s width, street depth and sideways offset. If it starts on the centerline, keep it there. Preserve the framing and match the projected wall height within 2%.',[
      saved,step('兩張都平視，保持方位與視野。','Keep both views level with the same bearing and lens.',(d,p)=>p&&levelView(d)&&levelView(p)&&sameDirections(d,p)&&sameLens(d,p)),
      step('比較實高與縱深的縮尺。','Compare the scale of the actual height and street depth.',(d,p)=>p&&near(d.realHeight/p.realHeight,.5,.006)&&near(d.z/p.z,.5,.006)),
      step('核對橫向位置與街景縮尺。','Check the lateral offset against the studio scale.',(d,p)=>scaledOffset(d,p,.5)),
      step('比對前後兩張的紙上牆高。','Compare the two projected wall heights.',(d,p)=>near(projectedRatio(d,p),1,.020001))]),
    visible(9,'小屋反超書店','Make the shorter house overtake','保留一張 A 實際較矮、紙上也較矮的基準。維持兩棟樓的實際高度與取景，固定橫距，把 A 沿街移近，使紙上 A/B 達到或超過 1.30。','Save a sketch where A is shorter than B both on paper and in reality. Keep the framing and heights. Keep the lateral offset fixed and bring A closer until its projected A/B ratio can reach or exceed 1.30.',[
      saved,step('基準的 A 在實景與紙上都比 B 矮。','Start with A shorter than B in reality and on paper.',(d,p)=>p&&p.realHeight<p.fixedHeight&&p.heightRatio>0&&p.heightRatio<1),
      step('核對縱深的改變、實際高度及紙上樓高比。','Check the change in depth, actual heights and projected height ratio.',(d,p)=>p&&sameDirections(d,p)&&sameLens(d,p)&&near(d.size,p.size)&&near(d.x,p.x)&&d.z<p.z&&d.heightRatio>=1.30)]),
    visible(10,'天與地的倒影','Reflect the whole horizon','保留一張抬頭的基準，再用相同的街景和視野低頭。讓第三消失點與視平線各自映到紙張中心的另一側，兩張都有三個消失點。','Save an upward-looking reference. Look down at the same scene with the same lens. Reflect both the vertical vanishing point and the horizon across the paper center, with three vanishing points in both views.',[
      saved,step('兩張都斜看街角，基準抬頭，目前低頭。','Use two oblique views, first looking up and then down.',(d,p)=>p&&p.count===3&&d.count===3&&p.vanishing[1][1]>0&&d.vanishing[1][1]<0),
      step('保持取景方位與街景，讓視平線和第三點成鏡像。','Keep the street and horizontal bearing fixed and mirror both heights.',mirrored)]),
    secret(1,3,'畫室搬過街，兩邊的柱子仍各走各的路。','The studio crosses the street, yet the pillars on either side never shake hands.',
      (d,p)=>levelView(d)&&lineFamily(d,1)&&d.trace.kind==='parallel'&&new Set(d.trace.owners).size===2&&changedSide(d,p)&&p.x*d.x<0),
    secret(2,4,'兩條街都有盡頭，這張紙卻都走不到。','Both streets have a meeting place beyond the edge of this sheet.',
      d=>!d.prior&&d.count===2&&d.horizontalInside===0&&lineFamily(d,2)&&d.trace.kind==='finite'&&!d.trace.onPaper&&levelView(d)),
    secret(3,4,'直立的城，把約會留在紙的腳下。','The standing city keeps its rendezvous below the page.',
      d=>!d.prior&&d.count===3&&lineFamily(d,1)&&d.trace.kind==='finite'&&d.horizon>0&&d.trace.uv[1]<-d.halfHeight),
    secret(4,5,'塔尖寄出的信，這一頁收得到。','The spires send a letter that lands on this very leaf.',
      d=>!d.prior&&!d.vanishing[0]&&d.count===2&&lineFamily(d,1)&&d.trace.onPaper&&d.trace.uv[1]>0),
    secret(5,6,'兩扇遠門，對著摺痕招手。','Two distant gates wave across a fold.',
      d=>!d.prior&&lineFamily(d,0)&&d.trace.kind==='finite'&&levelView(d)&&d.horizontalInside===2&&balanced(d)),
    secret(6,6,'畫紙的視野寬了，木匠的接縫才露面。','A wider view brings the joiner’s missing corner onto the paper.',
      (d,p)=>d.trace.kind==='finite'&&d.trace.axis===null&&d.count===3&&openedCorner(d,p)),
    secret(7,7,'兩扇遠門交換了彼此在鏡裡的地址。','Two distant gates trade addresses in the mirror.',
      (d,p)=>lineFamily(d,0)&&d.trace.kind==='finite'&&p&&levelView(d)&&levelView(p)&&sameScene(d,p)&&sameLens(d,p)&&
        d.vanishing[0]&&p.vanishing[2]&&p.vanishing[0]&&!balanced(d)&&
        near(d.vanishing[0][0],-p.vanishing[2][0],.012)&&near(d.vanishing[2][0],-p.vanishing[0][0],.012)&&
        Math.abs(d.vanishing[0][0]-p.vanishing[0][0])>.2),
    secret(8,8,'塔身已經鞠躬，橫梁依舊互不相識。','The tower bows while its crossbeams remain strangers.',
      d=>!d.prior&&!d.verticalInside&&lineFamily(d,0)&&d.trace.kind==='parallel'&&d.vanishing[1]&&d.vanishing[2]),
    secret(9,9,'視平線越過紙心，畫外的牆角也從另一端回信。','The horizon crosses the center of the sheet. Beyond the edge, the uprights answer from the other side.',
      (d,p)=>lineFamily(d,1)&&d.trace.kind==='finite'&&d.trace.uv[1]>d.halfHeight&&mirrored(d,p)),
    secret(10,10,'縮小的城市，仍容得下遠方。','A little city still holds the distant street.',
      (d,p)=>lineFamily(d,2)&&d.trace.owners.includes('A')&&d.trace.onPaper&&p&&sameDirections(d,p)&&sameLens(d,p)&&
        levelView(p)&&levelView(d)&&d.realHeight/p.realHeight>=.60-1e-8&&d.realHeight/p.realHeight<=.80+1e-8&&scaledOffset(d,p,d.realHeight/p.realHeight)&&near(d.realHeight/p.realHeight,d.z/p.z,.008)&&near(projectedRatio(d,p),1,.015))
  ]);
})();
