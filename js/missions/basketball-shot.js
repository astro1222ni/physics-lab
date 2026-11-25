(function () {
  'use strict';
  const C=window.BasketballShotCore, slug='basketball-shot';
  const near=(a,b,t=.0001)=>Math.abs(a-b)<=t;
  const shot=d=>d?.mode==='shot', toss=d=>d?.mode==='throw';
  const direct=d=>shot(d)&&d.scored&&!d.bank;
  const sameCourt=(a,b)=>shot(a)&&shot(b)&&near(a.height,b.height)&&near(a.distance,b.distance)&&near(a.bearing??0,b.bearing??0)&&a.drag===b.drag;
  const sameThrow=(a,b)=>toss(a)&&toss(b)&&near(a.speed,b.speed)&&near(a.height,b.height);
  const complementary=(a,b)=>sameThrow(a,b)&&!a.drag&&!b.drag&&near(a.angle+b.angle,90,.12)&&Math.abs(a.angle-b.angle)>=12;
  const optimal=d=>d.bestRange!=null&&near(d.R,d.bestRange,.02);
  const value=(v,unit='',digits=2)=>Number.isFinite(v)?v.toFixed(digits)+unit:'—';
  const step=(zh,en,test,read)=>({zh,en,test,read});
  const subject=d=>d.mode==='shot'?['籃球','basketball']:['壘球','softball'];
  const diff=(key,unit,scale=1,digits=2)=>(d,p)=>value(p?(d[key]-p[key])*scale:null,unit,digits);
  function recordedTrial(data,paired){
    if(!data)return false;
    if(!paired)return data.trialRole==='single'&&!data.prior;
    const reference=data.prior;
    if(data.trialRole!=='comparison'||reference?.trialRole!=='reference'||data.mode!==reference.mode)return false;
    return data.drag!==reference.drag||!near(data.speed,reference.speed)||!near(data.angle,reference.angle)||
      !near(data.height,reference.height)||(shot(data)&&(!near(data.distance,reference.distance)||!near(data.bearing??0,reference.bearing??0)));
  }
  const pair=step('兩球的項目、高度和速率','Sport, height and speed of the two releases',sameThrow,(d,p)=>p?value(d.height-p.height,' m')+' / '+value(d.speed-p.speed,' m/s',3):'—');
  const makes=step('同站位、同阻力的兩顆直接進球','Two direct baskets at the same spot and drag setting',(d,p)=>sameCourt(d,p)&&direct(d)&&direct(p),(d,p)=>Number(direct(d))+Number(direct(p))+' / 2');
  function normal(id,title,en,desc,english,paired,steps,level=id){
    return {id:slug+'-'+id,level,title:{zh:title,en},desc:{zh:desc,en:english},
      check:e=>e.type==='recorded'&&recordedTrial(e.data,paired)&&steps.every(s=>s.test(e.data,e.data.prior)),
      need(ctx){
        const d=ctx.last('recorded'),ready=recordedTrial(d,paired);
        const log=paired?['已投基準球，更改條件並記錄比較','A reference was thrown and compared with a changed release']:['已獨立出手並記錄本球','An independent release has been recorded'];
        return [[ready,...log],...steps.map(s=>{
          const reading=ready&&s.read?s.read(d,d.prior):null;
          const [zh,en]=Array.isArray(reading)?reading:[reading,reading];
          return [ready?!!s.test(d,d.prior):null,s.zh+(zh==null?'':' · '+zh),s.en+(en==null?'':' · '+en)];
        })];
      }};
  }
  function hidden(n,level,zh,en,paired,test){
    return {id:slug+'-h'+n,level,hidden:true,riddle:{zh,en},
      check:e=>e.type==='recorded'&&recordedTrial(e.data,paired)&&!!test(e.data,e.data.prior)};
  }
  const original=[
    normal(1,'十公尺落點','The ten-metre mark','用壘球瞄準 10 m 標記，讓落點離標記不超過 10 cm。','Throw a softball within 10 cm of the ten-metre mark.',false,[
      step('運動項目','Sport',toss,subject),step('落點與標記的距離','Distance from the mark',d=>near(d.R,10,.10),d=>value(Math.abs(d.R-10)*100,' cm',1))]),
    normal(2,'就差半顆球','Half a ball short','讓籃球避開器材，最高點落在框高下方一個球半徑以內。','Avoid the equipment and make the basketball peak within one ball radius below hoop height.',false,[
      step('籃球全程避開籃框與籃板','Basketball clears rim and board',d=>shot(d)&&!d.rimHit&&!d.board,d=>d.rimHit||d.board?['接觸','contact']:subject(d)),
      step('最高點至框高的距離','Distance from the apex to hoop height',d=>d.H<C.rimHeight&&C.rimHeight-d.H<=C.ballRadius,d=>value((C.rimHeight-d.H)*100,' cm',1))]),
    normal(3,'留三公分的空心球','Three centimetres to spare','直接投進一球。球面與框緣的最小間隙至少為 3 cm。','Make a direct basket with at least 3 cm between the ball surface and the rim.',false,[
      step('直接進框','Direct basket',direct,d=>direct(d)?['已進','made']:['未達成','pending']),
      step('球面至框緣的間隙','Ball-to-rim clearance',d=>d.margin!=null&&d.margin>=.03,d=>value(d.margin==null?null:d.margin*100,' cm',1))]),
    normal(4,'高弧也會擦邊','A steep but narrow escape','直接投進一球，入框角超過 45°，最小間隙不超過 1 cm。','Make a direct basket at an entry angle above 45° with at most 1 cm of clearance.',false,[
      step('直接進框時的下降角','Descent angle on a direct make',d=>direct(d)&&d.crossing.angle>45,d=>value(direct(d)?d.crossing.angle:null,'°',1)),
      step('球面至框緣的間隙','Ball-to-rim clearance',d=>d.scored&&d.margin<=.01,d=>value(d.margin==null?null:d.margin*100,' cm',1))]),
    normal(5,'借籃板轉彎','Take it off the glass','讓籃球先碰籃板，再順著反彈路徑穿過籃框（含打板擦框進球）。','Send the basketball off the board and through the hoop (including off-the-glass rim-ins).',false,[
      step('打板後進框','Basket after board contact',d=>shot(d)&&(d.bank||(d.firstContact==='board'&&!!d.final?.made)),d=>(d.bank||(d.firstContact==='board'&&!!d.final?.made))?['已進','made']:(d.board||d.firstContact==='board')?['已打板','board hit']:['尚未打板','no board contact'])]),
    normal(6,'把壘球送得更遠','Approach the longest throw','先投一顆較短的壘球作為基準。同速、同高、同阻力再擲，讓第二球比基準多飛逾 2 cm，並落在這組條件的最遠射程 0.05 cm 內。','Throw a shorter softball reference first. At the same speed, height and drag setting, land the second throw more than 2 cm beyond the reference and within 0.05 cm of the maximum range.',true,[
      pair,step('阻力設定相同','Matching drag settings',(d,p)=>d.drag===p.drag,(d,p)=>d.drag===p.drag?['相同','same']:['不同','different']),
      step('本球超越基準落點的距離','Distance gained beyond the reference landing point',(d,p)=>d.R-p.R>.02,diff('R',' cm',100,2)),
      step('距離最遠射程的差距','Shortfall from maximum range',d=>d.bestRange!=null&&near(d.R,d.bestRange,.0005),d=>value(d.bestRange==null?null:(d.bestRange-d.R)*100,' cm',3))]),
    normal(7,'兩條弧線都能進','Two routes to a basket','先直接投進一顆低弧基準球。同站位、同阻力，提高出手角至少 8° 並加速至少 0.30 m/s，讓高弧球也直接進框。','Make a low direct basket as the reference. From the same spot with the same drag, raise the release angle by at least 8° and the speed by at least 0.30 m/s. Make the higher shot directly as well.',true,[
      makes,step('本球相較基準提高的出手角','Rise in angle from the reference',(d,p)=>d.angle-p.angle>=8,diff('angle','°')),
      step('本球相較基準增加的速率','Increase in speed from the reference',(d,p)=>d.speed-p.speed>=.30-1e-8,diff('speed',' m/s',3))]),
    normal(8,'空氣拿走多少射程？','How much range does air take?','用同速、同高、同角的壘球各投一次，只改阻力。讓有阻力的一球少飛至少一成。','Make identical softball releases with and without drag. Let drag cut the range by at least one tenth.',true,[
      pair,step('保持出手角並改變阻力','Same angle, different drag setting',(d,p)=>near(d.angle,p.angle)&&d.drag!==p.drag,diff('angle','°')),
      step('射程損失比例','Fraction of range lost',(d,p)=>(d.drag?d.R:p.R)<=.9*(d.drag?p.R:d.R),(d,p)=>value(100*(1-(d.drag?d.R:p.R)/(d.drag?p.R:d.R)),'%',1))]),
    normal(9,'一高一低，同一落點','Two arcs, one footprint','壘球出手高度設為 0 m，關閉阻力。用同速、相差至少 12° 的互補角各投一次，讓落點相距不到 2 cm。','Release the softball at 0 m with drag off. Use the same speed and complementary angles at least 12° apart. Land less than 2 cm apart.',true,[
      pair,step('兩次都在地面出手、關閉阻力且角度互補','Both releases are level, drag-free and complementary',(d,p)=>complementary(d,p)&&d.height===0&&p.height===0,(d,p)=>value(d.height,' m')+' / '+value(d.angle+p.angle,'°')),
      step('兩個落點相距','Separation of landing points',(d,p)=>Math.abs(d.R-p.R)<.02,diff('R',' cm',100,1))]),
    normal(10,'框心剛進入射程','Bring the centre just within reach','在同一站位關閉阻力。先投一顆沒進的基準球，其速率使任何角度都夠不到框心。再加速不超過 0.12 m/s，讓框心進入可達範圍，球心下降穿越框高時距框心不超過 2 cm。碰框也可以完成。','With drag off, throw a missed reference shot too slow to reach the hoop centre at any angle. From the same spot add at most 0.12 m/s. Bring the centre within reach and cross hoop height on descent within 2 cm of it. A rim hit counts.',true,[
      step('同一站位的兩次無阻力投籃','Two drag-free shots at the same spot',(d,p)=>sameCourt(d,p)&&!d.drag,(d,p)=>value(d.distance-p.distance,' m')+' / '+value(d.height-p.height,' m')),
      step('基準球沒進，且在框心位置可達的最高點低於框高','The reference misses and its envelope stays below the hoop',(d,p)=>p.envelope!=null&&p.envelope<C.rimHeight&&!p.scored,(d,p)=>value(p.envelope==null?null:p.envelope-C.rimHeight,' m',3)),
      step('本球提高速率並使框心進入可達範圍','The speed increase brings the centre within reach',(d,p)=>d.speed>p.speed&&d.speed-p.speed<=.12000001&&d.envelope>=C.rimHeight,diff('speed',' m/s',3)),
      step('球心沿直接路徑下降穿過框心附近','Centre path crosses near the hoop centre on direct descent',d=>d.crossing?.vx>0&&near(d.crossing.x,d.distance,.02),d=>value(d.crossing?(d.crossing.x-d.distance)*100:null,' cm',2))]),
    hidden(1,3,'門心正對著我，肩膀卻過不去。','The doorway faces me squarely. My shoulders disagree.',false,
      d=>shot(d)&&!d.board&&d.rimHit?.side==='front'&&d.rimHit.vy<0&&d.crossing?.vx>0&&Math.abs(d.crossing.x-d.distance)<C.rimRadius-C.ballRadius&&d.opening<2*C.ballRadius),
    hidden(2,4,'遠牆寄來一封回信，落在寄件人的腳邊。','The far wall returns a letter to its sender’s feet.',false,
      d=>shot(d)&&d.board?.vyIn>0&&!d.rimHit&&!d.scored&&Math.abs(d.R)<.085),
    hidden(3,5,'門檻下，最高的願望先碰了頭。','Under the threshold, a wish nearly at its peak bumps its head.',false,
      d=>shot(d)&&!d.board&&d.rimHit?.vy>0&&d.rimHit.vy<.32&&d.rimHit.y<C.rimHeight),
    hidden(4,8,'一張車票，兩條天際線。','One fare buys two skylines.',true,
      (d,p)=>sameCourt(d,p)&&direct(d)&&direct(p)&&near(d.speed,p.speed)&&Math.abs(d.angle-p.angle)>=8),
    hidden(5,9,'直路和折返路，在門口行了同一個禮。','The straight road and the returning road bow alike at the door.',true,
      (d,p)=>sameCourt(d,p)&&direct(p)&&d.bank&&near(d.crossing.angle,p.crossing.angle,.75)),
    hidden(6,7,'同一扇窗前，兩位客人的行囊輕重不同。','Two guests at one window carry different loads.',true,
      (d,p)=>direct(d)&&direct(p)&&d.drag===p.drag&&near(d.distance,p.distance)&&near(d.bearing??0,p.bearing??0)&&near(d.angle,p.angle)&&Math.abs(d.height-p.height)>=.35&&(d.speed-p.speed)*Math.sign(d.height-p.height)<-.12),
    hidden(7,8,'同一條路的兩張地圖，在空氣裡悄悄岔開。','Two maps of the same road quietly part in the air.',true,
      (d,p)=>{if(!sameThrow(d,p)||d.drag===p.drag||!optimal(d)||!optimal(p))return false;
        const [air,vac]=d.drag?[d,p]:[p,d];return air.bestAngle<vac.bestAngle&&air.angle<vac.angle-.65&&air.R<vac.R;}),
    hidden(8,9,'看不見的旅費，換來不變的腳印。','An unseen toll, an unchanged footprint.',true,
      (d,p)=>toss(d)&&toss(p)&&d.drag!==p.drag&&near(d.angle,p.angle)&&near(d.height,p.height)&&(d.speed-p.speed)*(d.drag?1:-1)>.20&&near(d.R,p.R,.025)),
    hidden(9,6,'鏡中的它們都沒走到天邊，後來的影子還落在後頭。','Both reflections fall short of the horizon. The second shadow falls behind the first.',true,
      (d,p)=>complementary(d,p)&&d.height>0&&!optimal(d)&&!optimal(p)&&d.angle>p.angle&&p.R-d.R>.35),
    hidden(10,10,'兩級臺階，共用一把尺。最後一筆正落在方格的對角。','Two steps share one ruler. The last stroke finds the diagonal.',true,
      (d,p)=>toss(d)&&toss(p)&&!d.drag&&!p.drag&&near(d.speed,p.speed)&&near(d.angle,p.angle)&&d.height>p.height&&
        p.vxLand>-p.vyLand+.10&&near(d.vxLand,-d.vyLand,.025)&&d.vLand-d.speed>.45)
  ];
  const extra=[
    normal(11,'從底角也能進','A corner basket','站在三分線外的底角（站位角度絕對值至少 60°，且在 6.75 m 三分弧外或橫距中軸至少 6.60 m）直接投進。若同時符合舊任務，記錄重點選「站位與反彈」。','Make a direct shot from outside the three-point line in the corner (bearing at least 60° and either at least 6.75 m from the hoop or at least 6.60 m laterally from the centre line). To prioritise this observation choose Position and rebound.',false,[
      step('站在三分底角（三分線外）','Outside the three-point corner',d=>shot(d)&&Math.abs(d.bearing)>=60&&(d.distance>=6.75-1e-9||d.distance*Math.sin(Math.abs(d.bearing)*Math.PI/180)>=6.60-1e-9),d=>value(d.distance,' m')+' / '+value(d.bearing,'°',1)),
      step('直接進球','Direct basket',direct,d=>direct(d)?['進球','Made']:['尚未進球','Pending'])],5),
    normal(12,'碰框彈進','In off the rim','讓球先碰前框或後框，再彈進網。若同時符合舊任務，記錄重點選「站位與反彈」。','Hit the front or back rim first and rebound into the basket. To prioritise this observation choose Position and rebound.',false,[
      step('首次碰到框緣','First contact is the rim',d=>shot(d)&&!!d.rimHit&&!d.board&&['front','back'].includes(d.outcome)&&d.firstContact==='rim',d=>d.rimHit&&!d.board?['碰框','Rim']:['尚未達成','Pending']),
      step('反彈後進網','Basket after the rebound',d=>!!d.final?.made,d=>d.final?.made?['進球','Made']:['尚未進球','Pending'])],6)
  ];
  // A single record can match a corner shot and a clearance experiment. The
  // recorder keeps the original award by default and lets the student select the new observation.
  const oldChecks=original.map(m=>m.check), finishChecks=extra.map(m=>m.check);
  for(const m of original){const test=m.check;m.check=(e,c)=>test(e,c)&&(e.data?.focus!=='finish'||!finishChecks.some(check=>check(e,c)));}
  for(const m of extra){
    const test=m.check;
    m.check=(e,c)=>test(e,c)&&(e.data.focus==='finish'||!oldChecks.some(check=>check(e,c)));
  }
  window.LabMission.register(slug,[...original,...extra]);
})();
