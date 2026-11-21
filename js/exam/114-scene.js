/* All diagrams share the same physics functions, including the printed figure. */
window.ExamScene=(()=>{
  'use strict';
  const C=ExamPhysics, lineFit=C.fit(C.samples);
  const T=(zh,en)=>LabSettings.t(zh,en);
  const teal='#8ae6d7', gold='#ffd17e', white='#eef5f6', faint='#92aeba';
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function surface(canvas,paint){
    function render(){
      const rect=canvas.getBoundingClientRect();
      if(!rect.width||!rect.height)return;
      const dpr=Math.min(devicePixelRatio||1,2);
      const w=Math.round(rect.width*dpr), h=Math.round(rect.height*dpr);
      if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
      const g=canvas.getContext('2d');
      g.setTransform(1,0,0,1,0,0);g.fillStyle='#0c2535';g.fillRect(0,0,w,h);
      const scale=Math.min(w/460,h/250);
      g.setTransform(scale,0,0,scale,(w-460*scale)/2,(h-250*scale)/2);
      const bg=g.createLinearGradient(0,0,450,250);
      bg.addColorStop(0,'#132e43');bg.addColorStop(1,'#081c2c');
      g.fillStyle=bg;g.fillRect(0,0,460,250);
      paint(g);
    }
    new ResizeObserver(render).observe(canvas);render();return render;
  }
  function label(g,s,x,y,color=white,size=16,align='left'){
    g.font='600 '+size+'px system-ui,sans-serif';g.textAlign=align;g.fillStyle=color;const scripts={'\u2080':['0',1],'\u2081':['1',1],'\u2082':['2',1],'²':['2',-1]};
    if(!/[\u2080\u2081\u2082²]/.test(s)){g.fillText(s,x,y);return;}
    const parts=String(s).split(/([\u2080\u2081\u2082²])/).filter(Boolean);
    const font=g.font, metrics=parts.map(part=>{g.font=scripts[part]?'600 '+(size*.68)+'px system-ui,sans-serif':font;return g.measureText(scripts[part]?.[0]||part).width;});
    const width=metrics.reduce((a,b)=>a+b,0);let pos=x-(align==='right'?width:align==='center'?width/2:0);
    g.textAlign='left';parts.forEach((part,i)=>{const script=scripts[part];g.font=script?'600 '+(size*.68)+'px system-ui,sans-serif':font;g.fillText(script?.[0]||part,pos,y+(script?script[1]*size*.23:0));pos+=metrics[i];});
  }
  function line(g,x,y,X,Y,color,width=1,dash=[]){
    g.beginPath();g.setLineDash(dash);g.strokeStyle=color;g.lineWidth=width;g.moveTo(x,y);g.lineTo(X,Y);g.stroke();g.setLineDash([]);
  }
  function dot(g,x,y,r,color){g.beginPath();g.fillStyle=color;g.arc(x,y,r,0,2*Math.PI);g.fill();}
  function stars(g){
    for(let i=1;i<115;i++)dot(g,(i*197+11)%459,(i*i*13+i*7)%248,i%9===0?1.1:.6,i%4?'#587687':'#c1d5dc');
  }
  function earth(g,x,y,r){
    g.save();g.translate(x,y);g.scale(r,r);g.beginPath();g.arc(0,0,1,0,Math.PI*2);g.clip();
    const ocean=g.createRadialGradient(-.45,-.46,.05,.18,.19,1.2);
    ocean.addColorStop(0,'#9ee2e4');ocean.addColorStop(.48,'#367ea6');ocean.addColorStop(1,'#0a253b');
    g.fillStyle=ocean;g.fillRect(-1,-1,2,2);
    for(const shape of [[[-.98,-.52],[-.63,-.77],[-.39,-.7],[-.23,-.48],[-.42,-.37],[-.46,-.19],[-.64,-.18],[-.58,.02],[-.74,-.08]], [[-.57,.01],[-.34,.08],[-.17,.26],[-.31,.48],[-.52,.79],[-.5,.44]],[[.04,-.44],[.3,-.75],[.7,-.61],[.98,-.46],[.93,-.14],[.64,-.19],[.49,.03],[.3,-.15],[.13,-.08],[.35,.19],[.16,.56],[-.02,.34],[-.13,-.14]]]){
      g.beginPath();shape.forEach(([a,b],i)=>i?g.lineTo(a,b):g.moveTo(a,b));g.closePath();g.fillStyle='#7db89c';g.fill();
    }
    const shade=g.createLinearGradient(-1,-.4,1,.3);shade.addColorStop(0,'#ecfff01a');shade.addColorStop(.5,'#06374c00');shade.addColorStop(1,'#031627db');g.fillStyle=shade;g.fillRect(-1,-1,2,2);
    g.restore();g.strokeStyle='#a6ecf4';g.lineWidth=1;g.beginPath();g.arc(x,y,r,0,Math.PI*2);g.stroke();
  }
  function orbit(g,s){
    stars(g);const current=C.orbit(s.height),geo=C.orbit(35800), scale=108*s.zoom/geo.radius, x=133,y=126;
    g.save();g.beginPath();g.rect(0,0,265,250);g.clip();
    for(const [r,color,dash] of [[geo.radius,gold,[4,4]],[current.radius,teal,[]]]){
      g.beginPath();g.setLineDash(dash);g.strokeStyle=color;g.lineWidth=1.5;g.arc(x,y,r*scale,0,Math.PI*2);g.stroke();
    }
    g.setLineDash([]);earth(g,x,y,C.earthRadius*scale);
    for(const [r,a,color] of [[geo.radius,1.02+s.angle*.06,gold],[current.radius,-.73+s.angle,teal]]){
      const px=x+r*scale*Math.cos(a),py=y+r*scale*Math.sin(a);
      dot(g,px,py,4,color);line(g,px-7,py-3,px+7,py+3,color,2);
    }g.restore();
    line(g,266,30,266,220,'#35505f');
    if(s.energy){
      label(g,T('兩顆衛星','Two satellites'),282,48,gold,17);
      label(g,s.unknown?'m\u2081 ≠ m\u2082':'m\u2081 = m\u2082',282,95,white,22);
      label(g,s.unknown?'U\u2081 ? U\u2082':'U\u2081 < U\u2082',282,134,teal,22);
      label(g,s.unknown?'E\u2081 ? E\u2082':'E\u2081 < E\u2082',282,170,teal,22);
      label(g,T('1 近地  ·  2 同步','1 Low  ·  2 Sync'),282,215,faint,16);
      return;
    }
    if(s.radius){
      label(g,T('距地心  r = R + h','From center: r = R + h'),277,46,white,15);
      label(g,'ISS',282,91,teal,17);label(g,(current.radius/1000).toLocaleString('en-US')+' km',282,118,white,22);
      label(g,T('同步衛星','Synchronous'),282,168,gold,17);label(g,(geo.radius/1000).toLocaleString('en-US')+' km',282,196,white,22);
      return;
    }
    if(s.motion){
      label(g,T('近地軌道','Low Earth orbit'),282,51,teal,17);
      label(g,'v = '+(current.speed/1000).toFixed(2)+' km/s',282,95,white,18);
      label(g,'a = '+current.acceleration.toFixed(2)+' m/s²',282,125,white,18);
      label(g,T('同步軌道','Synchronous orbit'),282,171,gold,17);
      label(g,'v = '+(geo.speed/1000).toFixed(2)+' km/s',282,201,white,18);
      label(g,'a = '+geo.acceleration.toFixed(2)+' m/s²',282,226,white,18);
      return;
    }
    label(g,T('同步軌道','Synchronous orbit'),282,51,gold,17);
    label(g,'35,800 km',282,76,white,20);
    label(g,s.height===420?'ISS':T('可調軌道','Variable orbit'),282,120,teal,17);
    label(g,Math.round(s.height).toLocaleString('en-US')+' km',282,149,white,23);
    label(g,T('距地表的高度 h','Altitude above Earth'),282,176,faint,14);
    label(g,T('軌道半徑同尺度','Radii to scale'),282,219,faint,15);
  }
  function spacecraft(g,x,y){
    g.save();g.translate(x,y);g.rotate(-.14);
    g.fillStyle='#486b95';g.fillRect(-15,-12,14,7);g.fillRect(0,6,14,7);
    for(let i=0;i<3;i++){line(g,-13+i*4,-12,-13+i*4,-5,'#9bbdd5');line(g,2+i*4,6,2+i*4,13,'#9bbdd5');}
    line(g,-7,-7,7,9,'#c4d9db',2);g.fillStyle='#dbb880';g.fillRect(-7,-4,17,8);
    g.beginPath();g.arc(9,-3,8,Math.PI*.09,Math.PI*.99);g.fillStyle='#e2edf0';g.fill();g.restore();
  }
  function doppler(g,s){
    stars(g);const {ratio,distance,beta}=C.flight(s.t,s.real),x=97+distance*315;
    label(g,T('地球接收站','Earth receiver'),13,27,teal,15);
    label(g,s.real?T('真實速度・縱軸放大','True speed · magnified f axis'):T('速度放大示意','Speed exaggerated'),447,27,gold,16,'right');
    earth(g,28,73,21);
    // Instantaneous receiver-side wave train: spacing scales as 1 / observed frequency.
    const spacing=24/ratio,offset=(s.phase%1)*spacing;
    g.save();g.beginPath();g.rect(50,42,Math.max(0,x-53),64);g.clip();
    for(let k=-1;k<20;k++){const p=51+k*spacing-offset;
      g.beginPath();g.moveTo(p+4,50);g.quadraticCurveTo(p-5,73,p+4,96);g.strokeStyle='#93dcd7';g.lineWidth=1.5;g.stroke();}
    g.restore();spacecraft(g,x,72);
    const arrow=20*beta/(s.real?.0001:.32);
    if(arrow>1){const end=x+14+arrow;line(g,x+14,72,end,72,gold,2);line(g,end,72,end-Math.min(5,arrow/2),69,gold,2);}
    if(s.redshift){
      const strip=g.createLinearGradient(198,0,409,0);
      ['#6762c1','#609ac8','#54bdb5','#e6d567','#ed9a5d','#df695b'].forEach((c,i)=>strip.addColorStop(i/5,c));
      g.fillStyle=strip;g.fillRect(198,103,211,9);
      const rest=287,observed=rest+68*(1/ratio-1);
      line(g,rest,100,rest,116,white,2);line(g,observed,100,observed,116,'#351917',3);
      label(g,T('紅移','Redshift'),140,113,gold,14);
    }
    const left=63,right=437,top=132,bottom=217;
    const low=C.frequencyRatio(s.real?.0001:.32),Y=r=>top+(1-r)/(1-low)*(bottom-top-8);
    line(g,left,top,right,top,faint,1,[5,4]);line(g,left,top-11,left,bottom,white);line(g,left,bottom,right,bottom,white);
    label(g,low.toFixed(s.real?5:2),left-4,bottom-4,faint,s.real?11:13,'right');
    label(g,'1.0',left-8,top+4,white,14,'right');label(g,'f / f\u2080',10,113,white,15);
    [0,1,2].forEach(i=>{
      const X=u=>left+(i+u)*(right-left)/3;
      if(i)line(g,X(0),top,X(0),bottom,'#476474',1,[3,4]);
      const extent=Math.max(s.extent[i],s.scrub?clamp(s.t-i,0,1):0);if(extent>0){g.beginPath();for(let j=0;j<=48;j++){
        const u=j*extent/48,y=Y(C.flight(i+u,s.real).ratio);if(!j)g.moveTo(X(u),y);else g.lineTo(X(u),y);
      }g.strokeStyle=teal;g.lineWidth=3;g.stroke();}
      label(g,[T('加速','Accelerate'),T('等速','Cruise'),T('減速','Slow down')][i],X(.5),239,faint,14,'center');
    });
    dot(g,left+s.t*(right-left)/3,Y(ratio),4,gold);label(g,'t',447,bottom+3,white,15);
  }
  const PX=v=>59+(v+100)*376/160,PY=i=>28+(.4-i)*181/1.6;
  function channel(g,s){
    for(let v=-100;v<=60;v+=20){
      line(g,PX(v),28,PX(v),209,'#4d6978',1,[3,4]);label(g,String(v),PX(v),228,faint,14,'center');
    }
    for(let j=-3;j<=1;j++){const i=j*.4;line(g,59,PY(i),435,PY(i),i===0?white:'#4d6978',1,i===0?[]:[3,4]);label(g,i.toFixed(1),52,PY(i)+5,white,14,'right');}
    label(g,'I',14,18,white,16);label(g,'Na',20,22,white,10);label(g,'(mA)',40,18,white,14);
    label(g,'V (mV)',435,246,white,15,'right');
    const end=s.trace??60;line(g,PX(-100),PY(lineFit.current(-100)),PX(end),PY(lineFit.current(end)),teal,2);
    for(const [v,i] of C.samples)dot(g,PX(v),PY(i),4,white);
    if(s.triangle){
      const currents=s.approx||s.points.map(v=>lineFit.current(v));
      const [a,b]=s.points,[ax,bx]=s.points.map(PX),[ay,by]=currents.map(PY);
      if(s.approx)label(g,T('A、B 為旁白約讀值','A and B: approximate readings'),434,18,gold,14,'right');
      g.beginPath();g.moveTo(ax,ay);g.lineTo(bx,ay);g.lineTo(bx,by);g.closePath();g.fillStyle='#ffd17e24';g.fill();
      line(g,ax,ay,bx,ay,gold,2,[4,3]);line(g,bx,ay,bx,by,gold,2,[4,3]);
      if(Math.abs(b-a)>27){label(g,'ΔV',(ax+bx)/2,ay+17,gold,14,'center');const right=bx<418 && bx>ax;label(g,'ΔI',bx+(right?6:-6),(ay+by)/2+2,gold,14,right?'left':'right');}
      for(const [i,v] of s.points.entries()){
        const x=PX(v),y=PY(currents[i]);dot(g,x,y,7,gold);dot(g,x,y,3,'#253345');
        const shift=Math.abs(ax-bx)<22?(i?11:-11):0;label(g,i?'B':'A',x+shift,y-10,gold,15,'center');
      }
    }
    if(s.probe!=null){
      const x=PX(s.probe),y=PY(lineFit.current(s.probe));dot(g,x,y,7,'#8ae6d744');dot(g,x,y,3,teal);
    }
    if(s.battery!=null){
      g.strokeStyle=gold;g.lineWidth=1.5;g.strokeRect(361,6,54,14);g.fillStyle=gold;g.fillRect(416,10,3,6);
      for(let i=0;i<Math.ceil(5*(1-s.battery));i++)g.fillRect(364+10*i,9,7,8);
    }
    if(s.zero){const x=PX(lineFit.voltage),y=PY(0);dot(g,x,y,7,'#ff9c96');label(g,lineFit.voltage.toFixed(1)+' mV',x-9,y-12,'#ffb5ab',16,'right');}
  }
  const defaults=()=>({height:420,mass:1,zoom:1,angle:0,different:false,t:0,real:false,phase:0,extent:[0,0,0],points:[-80,-20],triangle:false,zero:false});
  const painter={19:orbit,23:doppler,49:channel}, extra={};
  // 其餘題目：ExamScene.add(N,{state(),paint(g,s),preview(g,s)?,lesson(s,p,part,t),interactive(api)})
  function add(q,def){extra[q]=def;}
  // ── 其餘 11 題共用的畫法（11/21）
  // sci：畫布上的數學字。^{…} 或 ^x 是上標、_{…} 或 _x 是下標（畫布不能用 KaTeX，也不准用 ⁴⁵ 這類字元）。
  function sci(g,s,x,y,color=white,size=16,align='left',weight=600){
    const parts=[],re=/([\^_])(\{[^}]*\}|[^\s×·÷/()=,，]+)/g;let last=0,m;
    while((m=re.exec(s))){if(m.index>last)parts.push([s.slice(last,m.index),0]);parts.push([m[2].replace(/^\{|\}$/g,''),m[1]==='^'?-1:1]);last=re.lastIndex;}
    if(last<s.length)parts.push([s.slice(last),0]);
    const font=k=>weight+' '+(k?size*.64:size)+'px system-ui,sans-serif';
    const widths=parts.map(([t,k])=>{g.font=font(k);return g.measureText(t).width;}),total=widths.reduce((a,b)=>a+b,0);
    let pos=x-(align==='right'?total:align==='center'?total/2:0);g.textAlign='left';g.fillStyle=color;
    parts.forEach(([t,k],i)=>{g.font=font(k);g.fillText(t,pos,y+(k<0?-size*.4:k>0?size*.24:0));pos+=widths[i];});
    return total;
  }
  function arrow(g,x,y,X,Y,color,width=2,head=8){
    const a=Math.atan2(Y-y,X-x);line(g,x,y,X-Math.cos(a)*head*.6,Y-Math.sin(a)*head*.6,color,width);
    g.beginPath();g.moveTo(X,Y);g.lineTo(X-head*Math.cos(a-.42),Y-head*Math.sin(a-.42));g.lineTo(X-head*Math.cos(a+.42),Y-head*Math.sin(a+.42));g.closePath();g.fillStyle=color;g.fill();
  }
  function box(g,x,y,w,h,r,fill,stroke,width=1.5){
    g.beginPath();g.roundRect(x,y,w,h,r);if(fill){g.fillStyle=fill;g.fill();}if(stroke){g.strokeStyle=stroke;g.lineWidth=width;g.stroke();}
  }
  // 打勾或打叉
  function mark(g,x,y,ok,size=12){
    g.save();g.lineCap='round';g.lineJoin='round';g.lineWidth=size/4;g.strokeStyle=ok?'#6fe0a8':'#ff8a80';g.beginPath();
    if(ok){g.moveTo(x-size,y);g.lineTo(x-size*.3,y+size*.7);g.lineTo(x+size,y-size*.8);}else{g.moveTo(x-size*.8,y-size*.8);g.lineTo(x+size*.8,y+size*.8);g.moveTo(x+size*.8,y-size*.8);g.lineTo(x-size*.8,y+size*.8);}
    g.stroke();g.restore();
  }
  // 斜投影的立方體（冰塊、水塊）：x、y 是正面左下角
  function cube(g,x,y,a,front,top,side,edge='#ffffff55'){
    const d=a*.42;
    g.beginPath();g.moveTo(x,y-a);g.lineTo(x+d,y-a-d*.7);g.lineTo(x+a+d,y-a-d*.7);g.lineTo(x+a,y-a);g.closePath();g.fillStyle=top;g.fill();
    g.beginPath();g.moveTo(x+a,y);g.lineTo(x+a+d,y-d*.7);g.lineTo(x+a+d,y-a-d*.7);g.lineTo(x+a,y-a);g.closePath();g.fillStyle=side;g.fill();
    g.fillStyle=front;g.fillRect(x,y-a,a,a);g.strokeStyle=edge;g.lineWidth=1;g.strokeRect(x,y-a,a,a);
  }
  const ease=t=>t<=0?0:t>=1?1:t*t*(3-2*t), seg=(t,a,b)=>ease((t-a)/(b-a));
  // 科學記號：sciText 給畫布（^{}），sciHTML 給讀數（<sup>）
  const sciParts=(x,d=1)=>{if(!x)return ['0',0];let e=Math.floor(Math.log10(Math.abs(x))),m=(x/10**e).toFixed(d);if(Math.abs(+m)>=10){e++;m=(x/10**e).toFixed(d);}return [m,e];};
  const sciText=(x,d=1)=>{const [m,e]=sciParts(x,d);return e===0?m:m+'×10^{'+String(e).replace('-','−')+'}';};
  const sciHTML=(x,d=1)=>{const [m,e]=sciParts(x,d);return e===0?m:m+'×10<sup>'+String(e).replace('-','−')+'</sup>';};
  const kit={surface,label,line,dot,stars,earth,spacecraft,clamp,T,sci,arrow,box,mark,cube,ease,seg,sciParts,sciText,sciHTML,colors:{teal,gold,white,faint,red:'#ff8a80',green:'#6fe0a8',blue:'#7fb6ff',violet:'#c7a4ff'}};
  function lesson(canvas,q){
    if(extra[q]){const d=extra[q],s=d.state();const redraw=surface(canvas,g=>d.paint(g,s));
      return {colors:{},reset(){},render(p,t,tm){d.lesson(s,p,Math.min(1,t/tm.dur),t);redraw();}};}
    let s=defaults();const redraw=surface(canvas,g=>painter[q](g,s));
    return {colors:{},reset(){},render(p,t,tm){
      const part=Math.min(1,t/tm.dur);
      if(q===19){s.energy=['flip','flip2','alt'].includes(p.row);s.unknown=p.row==='flip2';s.motion=['solve','judge'].includes(p.row);s.radius=['radius','kepler'].includes(p.row);
        s.height=420;s.angle=.7*part;s.zoom=1;}
      if(q===23){s.redshift=p.row==='redshift';const stage=p.row==='wrong'?1:p.row==='judge'?(p.id.endsWith('21')?2:1):null;
        s.t=stage===null?3*part:stage+part;s.phase=t*1.5;s.extent=[0,1,2].map(i=>clamp(s.t-i,0,1));}
      if(q===49){s.battery=p.row==='joke'?part:null;s.probe=['solveA','solveB','alt','trick'].includes(p.row)?-80+part*(p.row==='solveA'?80+lineFit.voltage:140):null;
        s.trace=p.row==='wrong'?-60+120*part:60;s.triangle=['solveB','alt','trick'].includes(p.row);s.zero=['solveA','grade','trick'].includes(p.row);s.points=p.row==='alt'?[-60,60]:[-80,-20];s.approx=p.row==='alt'?[-.75,.07]:p.row==='solveB'?[-.9,-.5]:null;}
      redraw();
    }};
  }
  function interactive(root,q,complete){
    const def=extra[q], s=def?def.state():defaults(), canvas=document.createElement('canvas'), controls=document.createElement('div'), readings=document.createElement('div');
    canvas.className='exam-canvas';canvas.setAttribute('role','img');canvas.setAttribute('aria-label',T(...Exam114.question.hands));
    controls.className='sim-controls';readings.className='sim-readings';root.append(canvas,controls,readings);
    const redraw=surface(canvas,g=>(def?def.paint:painter[q])(g,s));
    const output=document.createElement('output');readings.append(output);
    let additions=()=>{}, frame=0, generation=0;
    function render(){
      redraw();
      if(def){def.read?.(s,output);}
      else if(q===19){
        const o=C.orbit(s.height,s.mass),geo=C.orbit(35800,s.mass);
        output.innerHTML='r = R + h = <b>'+(o.radius/1000).toLocaleString('en-US')+' km</b><br>T <b>'+(o.period/3600).toFixed(2)+' h</b> · v <b>'+(o.speed/1000).toFixed(2)+' km/s</b> · a <b>'+o.acceleration.toFixed(3)+' m/s<sup>2</sup></b>';
        additions(o,geo);
      }else if(q===23){
        const f=C.flight(s.t,s.real);
        output.innerHTML='v/c = '+f.beta.toFixed(5)+'　 f/f<sub>0</sub> = '+f.ratio.toFixed(6)+'　 '+T('波峰間隔','Crest interval')+' = '+(1/f.ratio).toFixed(6)+' T<sub>0</sub>';
      }else{
        const {voltage:dv,current:di,resistance}=C.measure(lineFit,...s.points);
        output.textContent='ΔV = '+dv+' mV　 ΔI = '+di.toFixed(3)+' mA　 ΔV/ΔI = '+(resistance===null?'—':resistance.toFixed(1)+' Ω');
      }
    }
    function range(name,min,max,value,change){
      const row=document.createElement('label'),span=document.createElement('span'),input=document.createElement('input'),val=document.createElement('output');
      row.className='sim-range';span.textContent=name;input.type='range';input.min=min;input.max=max;input.value=value;input.setAttribute('aria-label',name);
      val.textContent=value;input.oninput=()=>{val.textContent=input.value;change(+input.value);render();};
      row.append(span,input,val);controls.append(row);return {input,val};
    }
    function btn(name,click){const b=document.createElement('button');b.type='button';b.textContent=name;b.onclick=()=>{click(b);render();};controls.append(b);return b;}
    function toggle(z,e,cb){const b=btn(T(z,e),b=>{const on=b.getAttribute('aria-pressed')!=='true';b.setAttribute('aria-pressed',on);cb(on);});b.setAttribute('aria-pressed','false');return b;}
    if(q===19){
      range(T('高度 (km)','Altitude (km)'),420,35800,420,v=>{s.height=v;if(Math.abs(C.orbit(v).period/86400-1)<=.01)complete();});
      range(T('衛星質量 (kg)','Satellite mass (kg)'),1,100,1,v=>s.mass=v);
      toggle('兩顆質量不同','Different masses',v=>s.different=v);
      toggle('放大近地軌道','Zoom near Earth',v=>s.zoom=v?3:1);
      const energy=document.createElement('p'),note=document.createElement('small');
      note.textContent=T('題幹週期取 90 分鐘。模擬以地球平均半徑 6371 km 與指定高度計算圓軌道。','The question rounds the period to 90 minutes. The model uses a mean Earth radius of 6371 km and the selected altitude.');
      readings.append(energy,note);
      additions=(o,geo)=>{energy.classList.toggle('uncertain',s.different);
        energy.textContent=s.different?T('U、E：質量不知道，比不了','U and E: unknown masses prevent a ranking'):
          T('兩顆等質量','Equal masses')+' · U = '+(o.potential/1e6).toFixed(2)+' MJ · E = '+(o.energy/1e6).toFixed(2)+' MJ　'+T('同步軌道','Synchronous')+' U = '+(geo.potential/1e6).toFixed(2)+' MJ · E = '+(geo.energy/1e6).toFixed(2)+' MJ';};
    }
    let move, hit;
    if(def){const r=def.interactive({s,canvas,controls,readings,output,range,btn,toggle,complete,render:()=>render(),root})||{};hit=r.hit;move=r.move;}
    if(q===23){
      const stageButtons=[];let scrubControl;
      const stop=()=>{generation++;cancelAnimationFrame(frame);};
      function stage(i){
        stop();const token=generation;let previous;
        s.scrub=false;s.t=i;stageButtons.forEach((b,j)=>b.setAttribute('aria-pressed',j===i));
        function tick(now){
          if(token!==generation||document.hidden||!root.closest('details').open)return;
          const dt=previous===undefined?0:Math.min(.1,(now-previous)/1000);previous=now;
          s.t=Math.min(i+1,s.t+dt/2);syncScrubber();s.phase+=dt*1.5;s.extent[i]=Math.max(s.extent[i],s.t-i);render();
          if(s.t<i+1)frame=requestAnimationFrame(tick);else if(s.extent.every(x=>x>=1))complete();
        }frame=requestAnimationFrame(tick);
      }
      ['加速','等速','減速'].forEach((z,i)=>stageButtons.push(btn(T(z,['Accelerate','Cruise','Slow down'][i]),()=>stage(i))));
      function syncScrubber(){
        if(!scrubControl)return;
        const percent=Math.round(s.t*100/3);scrubControl.input.value=percent;scrubControl.val.textContent=percent+'%';
      }
      function scrub(t){
        stop();s.scrub=true;s.t=t;s.phase=t*2;syncScrubber();
        stageButtons.forEach(b=>b.setAttribute('aria-pressed','false'));
      }
      scrubControl=range(T('飛行進度','Flight progress'),0,100,0,v=>scrub(v*3/100));
      syncScrubber();
      toggle('真實比例','True speed scale',v=>s.real=v);
      const guide=document.createElement('small');guide.textContent=T('按三段按鈕畫完整曲線，或拖太空船查看途中讀數。','Play each stage to trace its curve, or drag the spacecraft to inspect a moment.');controls.append(guide);
      hit=(x,y)=>Math.hypot(x-(97+C.flight(s.t,s.real).distance*315),y-72)<32?0:null;
      move=(_,x)=>{const d=clamp((x-97)/315,0,1)*2;scrub(d<.5?Math.sqrt(2*d):d<1.5?d+.5:3-Math.sqrt(2*(2-d)));render();};
      addEventListener('pagehide',stop);document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
    }
    if(q===49){
      s.triangle=true;const touched=new Set(),ranges=[];
      function set(i,v){
        v=clamp(Math.round(v),-100,60);
        if(s.points[i]!==v)touched.add(i);
        s.points[i]=v;ranges[i].input.value=v;ranges[i].val.textContent=v;
        const {resistance}=C.measure(lineFit,...s.points);
        if(touched.size===2 && resistance>=125 && resistance<=175)complete();
      }
      ['A','B'].forEach((n,i)=>ranges.push(range(n+' (mV)',-100,60,s.points[i],v=>set(i,v))));
      const zero=toggle('點亮零電流交點','Mark zero current',v=>s.zero=v);
      hit=(x,y)=>{const ds=s.points.map(v=>Math.hypot(PX(v)-x,PY(lineFit.current(v))-y));if(Math.min(...ds)<=25)return ds.indexOf(Math.min(...ds));
        if(Math.hypot(x-PX(lineFit.voltage),y-PY(0))<20)zero.click();return null;};
      move=(i,x)=>{set(i,(x-59)*160/376-100);render();};
    }
    if(move){
      let active=null;
      const point=e=>{const r=canvas.getBoundingClientRect(),k=Math.min(r.width/460,r.height/250);return [(e.clientX-r.left-(r.width-460*k)/2)/k,(e.clientY-r.top-(r.height-250*k)/2)/k];};
      canvas.onpointerdown=e=>{active=hit(...point(e));if(active!==null){canvas.setPointerCapture(e.pointerId);e.preventDefault();}};
      canvas.onpointermove=e=>{if(active!==null)move(active,...point(e));};
      canvas.onlostpointercapture=()=>active=null;
    }
    render();return render;
  }
  function preview(canvas,q){
    if(extra[q]){const d=extra[q],s=d.state();return surface(canvas,g=>(d.preview||d.paint)(g,s));}
    const s=defaults();
    if(q===49)return surface(canvas,g=>channel(g,s));
    return surface(canvas,g=>{
      stars(g);earth(g,77,125,47);
      if(q===19){
        label(g,T('已知的繞行週期','Given orbital periods'),162,57,white,18);
        label(g,'ISS',162,105,teal,18);label(g,'90 min',307,105,white,23);
        line(g,162,125,420,125,'#486372');
        label(g,T('同步衛星','Synchronous'),162,157,gold,17);label(g,'24 h',307,157,white,23);
        label(g,T('兩條軌道都近似圓形','Both orbits are approximately circular'),162,208,faint,14);
      }else{
        spacecraft(g,324,105);line(g,145,126,358,126,gold,2);line(g,358,126,348,120,gold,2);
        label(g,T('太空船持續遠離地球','The spacecraft keeps receding'),141,61,white,16);
        label(g,T('地球接收站','Earth receiver'),76,203,teal,15,'center');
        label(g,T('加速 → 等速 → 減速','Accelerate → Cruise → Slow down'),146,183,gold,16);
      }
    });
  }
  return {interactive,lesson,preview,add,kit};
})();
