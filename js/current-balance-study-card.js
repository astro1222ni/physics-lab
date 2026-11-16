/* 只使用學生自己的實測點；預覽、取消分享都不領星。 */
(function () {
  'use strict';
  const T=(a,b)=>LabSettings.t(a,b),D=LabDraw,E=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;};
  const URL='https://lab.astroni.org/current-balance.html?mode=learn&study=1';
  let dialog,canvas,blob,loading;
  function qr(){if(window.qrcode)return Promise.resolve();return loading||(loading=new Promise((resolve,reject)=>{const s=E('script');s.src='vendor/qrcode/qrcode.js';s.onload=resolve;s.onerror=()=>reject(new Error(T('QR 套件載入失敗','QR library failed to load')));document.head.append(s);}));}
  function draw(project){const c=canvas.getContext('2d'),C=CurrentBalanceCore,rows=project.rows.filter(r=>!r.given&&r.part===1),a=C.analyze(rows.map(r=>({...r,m:r.m*1e-6}))).p1;
    c.fillStyle=D.c.bg;c.fillRect(0,0,1080,1350);c.fillStyle=D.c.accent;c.fillRect(0,0,1080,16);c.textAlign='left';
    const text=(t,x,y,size=42,color=D.c.text)=>{c.fillStyle=color;c.font='700 '+size+'px '+D.FONT;c.fillText(t,x,y);};
    text(T('讓倪動手⚡','Astro Ni Lab ⚡'),70,95,60);text(T('我量出的磁導率','My measured permeability'),70,181,62);
    text('μ',70,260,66);text('0',112,277,40);const formula='= '+(a.mu0*1e7).toFixed(3)+' × 10';text(formula,150,260,49);const exponentX=150+c.measureText(formula).width+3;text('−7',exponentX,238,40);text('T·m/A',exponentX+66,260,40);
    const x=130,y=370,w=850,h=480,maxX=Math.max(...rows.map(r=>r.I2))*1.18,maxY=Math.max(...rows.map(r=>r.m*1e-6*C.G/(r.I1*C.APP.L)*1000))*1.2,X=v=>x+v/maxX*w,Y=v=>y+h-v/maxY*h;
    c.strokeStyle=D.alpha(D.c.muted,.2);c.lineWidth=2;for(let i=0;i<=5;i++){c.beginPath();c.moveTo(x+i*w/5,y);c.lineTo(x+i*w/5,y+h);c.stroke();c.beginPath();c.moveTo(x,y+i*h/5);c.lineTo(x+w,y+i*h/5);c.stroke();text((i*maxX/5).toFixed(1),x+i*w/5-16,y+h+54,40,D.c.muted);text((i*maxY/5).toFixed(1),25,Y(i*maxY/5)+13,40,D.c.muted);}
    c.strokeStyle=D.c.text;c.lineWidth=3;c.beginPath();c.moveTo(x,y);c.lineTo(x,y+h);c.lineTo(x+w,y+h);c.stroke();c.strokeStyle=D.c.accent;c.lineWidth=5;c.beginPath();c.moveTo(X(0),Y(0));c.lineTo(X(maxX),Y(a.fit.slope*1000*maxX));c.stroke();
    for(const r of rows){c.fillStyle=D.c.pos;c.beginPath();c.arc(X(r.I2),Y(r.m*1e-6*C.G/(r.I1*C.APP.L)*1000),10,0,Math.PI*2);c.fill();}
    text('B (mT)',80,y-24,40);text('I',860,y+h+110,45);text('2',877,y+h+121,40);text('(A)',919,y+h+110,40);
    text(T('斜率 ','Slope ')+(a.fit.slope*1000).toFixed(3)+' mT/A',70,1010,44);text(T('誤差 ','Error ')+(a.err*100).toFixed(2)+' % · '+rows.length+T(' 筆自己的量測',' own measurements'),70,1070,40);
    const defs=LabMission.all()['current-balance']||[],done=LabMission._state?.done||{},stars=defs.filter(m=>m.study&&done[m.id]).reduce((sum,m)=>sum+m.level,0);text(T('自學星星 ','Study stars ')+stars+'/78',70,1145,44);
    const code=qrcode(0,'M');code.addData(URL,'Byte');code.make();const count=code.getModuleCount(),size=210,unit=size/(count+8),qx=800,qy=1110;c.fillStyle='#fff';c.fillRect(qx,qy,size,size);c.fillStyle='#000';for(let r=0;r<count;r++)for(let col=0;col<count;col++)if(code.isDark(r,col))c.fillRect(qx+(col+4)*unit,qy+(r+4)*unit,Math.ceil(unit),Math.ceil(unit));
    text('lab.astroni.org',70,1220,42,D.c.accent);text(T('掃碼，換你來量。','Scan and measure yours.'),70,1290,40);canvas.dataset.qr=URL;canvas.dataset.ownRows=rows.length;
    return new Promise(resolve=>canvas.toBlob(b=>{blob=b;resolve(b);},'image/png'));
  }
  async function open(){const project=CurrentBalanceStudy.shareProject(),C=CurrentBalanceCore,rows=project?.rows||[],p=C.analyze(rows.map(r=>({...r,m:r.m*1e-6}))).p1;if(!(p.n>=5&&p.distinctM>=5&&p.I1spread<=.011)){CurrentBalanceStudy.notify(T('先在動手實驗量五筆、五種質量，再做成果圖卡。','First measure five different masses in the hands-on section.'));return;}
    try{await qr();if(!dialog){dialog=E('dialog');dialog.className='cb-share-dialog';dialog.id='cb-share-dialog';document.body.append(dialog);}dialog.replaceChildren(E('h2',T('我量出的磁導率','My measured permeability')));canvas=E('canvas');canvas.id='cb-share-canvas';canvas.width=1080;canvas.height=1350;canvas.setAttribute('aria-label',T('實測 B–I2 圖、斜率與誤差的分享圖卡','Share card with measured B–I2 data, slope and error'));dialog.append(canvas);const status=E('p',T('只放自己的數據，不含姓名。預覽不領分享星星。','Only your own data, with no name. Previewing earns no sharing stars.'));dialog.append(status);const actions=E('div');actions.className='cb-share-actions';const button=(text,fn)=>{const b=E('button',text);b.type='button';b.onclick=fn;actions.append(b);return b;};
      button(T('存成圖片','Save image'),async()=>{await draw(project);if(!blob)return;const href=window.URL.createObjectURL(blob),a=E('a');a.href=href;a.download='current-balance-mu0.png';document.body.append(a);a.click();a.remove();setTimeout(()=>window.URL.revokeObjectURL(href),1000);CurrentBalanceStudy.exported('download');status.textContent=T('已存出成果圖卡。','Your card has been saved.');});
      const share=button(T('分享圖片','Share image'),async()=>{await draw(project);if(!blob)return;const file=new File([blob],'current-balance-mu0.png',{type:'image/png'});if(!navigator.canShare?.({files:[file]})){status.textContent=T('此瀏覽器可先存成圖片，再用通訊軟體分享。','Save the image, then share it with your preferred app.');return;}try{await navigator.share({files:[file],title:T('我量出的磁導率','My measured permeability')});CurrentBalanceStudy.exported('share');status.textContent=T('分享完成。','Shared.');}catch(e){status.textContent=e.name==='AbortError'?T('已取消，沒有領分享星星。','Canceled; no sharing stars awarded.'):T('分享未完成，可改存圖片。','Sharing failed; you can save the image.');}});share.disabled=!navigator.share;
      button(T('關閉','Close'),()=>dialog.close());dialog.append(actions);await draw(project);dialog.showModal();
    }catch(e){CurrentBalanceStudy.notify(T('圖卡未完成：','Card failed: ')+e.message);}
  }
  window.CurrentBalanceStudyCard={open};
})();
