(function () {
  'use strict';
  const slug = 'supply-demand';
  const near = (a,b,tolerance=1e-6) => Math.abs(a-b) <= tolerance;
  const sameCurves = (s,p) => !!p && ['a','b','c','d'].every(k => near(s[k],p[k]));
  const inMarket = mode => s => s.policy === mode;
  const savedFree = (s,p) => p?.policy === 'free' && p.traded > 0 && sameCurves(s,p);
  const free = ['使用自由市場。','Use a free market.',inMarket('free')];
  const ceiling = ['使用生效的價格上限。','Use a binding price ceiling.',s => s.policy === 'ceiling' && s.binding];
  const floor = ['使用生效的價格下限。','Use a binding price floor.',s => s.policy === 'floor' && s.binding];
  const reference = ['保留相同曲線的自由市場作基準，基準要有成交。','Save a trading free market as the reference and keep its curves.',savedFree];
  const single = ['使用單筆觀察，已有基準可在最近讀數解除。','Use a single reading. Release any reference under Recent readings.',(s,p)=>!p];
  const kept = ['保留一個有成交的自由市場。','Save a free market with positive trade.',(s,p) => p?.policy === 'free' && p.traded > 0];
  const fmt = n => Number(n.toFixed(2)).toString();
  const percent = (x,y) => y > 0 ? fmt(100*x/y)+'%' : '—';
  const last = ctx => ctx.seq('marketChanged') > ctx.seq('recorded') ? ctx.last('marketChanged') : ctx.last('recorded');
  function normal(n, zh, en, descZh, descEn, steps) {
    return { id: slug+'-'+n, level:n, title:{zh,en}, desc:{zh:descZh,en:descEn}, needOn:['recorded'],
      check: ev => ev.type === 'recorded' && steps.every(step => step[2](ev.data,ev.data.prior)),
      need(ctx) {
        const s=last(ctx);
        const out=steps.map(([z,e,test,metric])=>{
          const value=s && metric ? ' ('+metric(s,s.prior)+')' : '';
          return [s ? !!test(s,s.prior) : false,z+value,e+value];
        });
        out.push([null,'用「記錄讀數」核對這一筆。','Select Record readings to check this market.']); return out;
      }
    };
  }
  function hidden(n,level,zh,en,test) {
    return {id:slug+'-h'+n,level,hidden:true,riddle:{zh,en},
      check:ev=>ev.type==='recorded' && !!ev.data.prior && test(ev.data,ev.data.prior),
      need(ctx) { const s=last(ctx); return [[!!s?.prior,'留下一個可比較的市場。','Keep a market for comparison.'],[null,zh,en]]; }
    };
  }
  const tasks = [
    normal(1,'剛好三十杯','Thirty cups sold','單筆自由市場，兩方剩餘相等，成交 30 杯。','In one free market, balance buyer and seller surplus and sell 30 cups.',[
      single,free,['比較兩方剩餘。','Compare the two surpluses.',s=>s.traded>0 && near(s.b,s.d),s=>fmt(s.consume-s.produce)],
      ['查看成交杯數。','Check the number sold.',s=>near(s.traded,30,.05),s=>fmt(s.traded)]
    ]),
    normal(2,'隊尾的十二杯','Twelve cups short','觀察一個攤位的供需曲線。最後只調整價格上限，讓隊尾有 12 杯買不到，再記錄這一筆。','Observe the stall’s supply and demand curves. For your last change, set or adjust the price ceiling to leave 12 cups unfilled, then record a single reading.',[
      single,ceiling,['維持曲線，最後選擇或調整價格上限。','Keep the curves in place and make the ceiling your last change.',s=>s.edit==='rule' || s.edit==='price'],
      ['查看未能買到的杯數。','Check the unfilled quantity.',s=>near(s.shortage,12,.05),s=>fmt(s.shortage)]
    ]),
    normal(3,'打烊剩八杯','Eight cups left','單筆觀察，在下限下賣掉至少三分之二的備貨，側桌剛好留下 8 杯。','In one market with a price floor, sell at least two thirds of the stock and leave exactly 8 cups.',[
      single,floor,['比較已售與備貨的比例。','Compare sales with stock.',s=>s.supply>0 && s.traded/s.supply>=2/3-1e-9,s=>percent(s.traded,s.supply)],
      ['查看未售杯數。','Check the unsold quantity.',s=>near(s.excess,8,.05),s=>fmt(s.excess)]
    ]),
    normal(4,'攤主多一份','Twice the gains','單筆自由市場，讓生產者剩餘達到消費者剩餘的兩倍。','In one free market, make producer surplus twice consumer surplus.',[
      single,free,['比較賣方與買方剩餘的比值。','Compare seller surplus with buyer surplus.',s=>s.consume>0 && near(s.produce/s.consume,2,.01),s=>s.consume?fmt(s.produce/s.consume):'—']
    ]),
    normal(5,'備兩杯，賣一杯','Sell half the stock','單筆觀察，找出能賣掉一半備貨的價格下限。','In one market, find a price floor at which half the stock sells.',[
      single,floor,['查看備貨中已成交的比例。','Check the fraction of stock sold.',s=>s.supply>0 && near(s.traded/s.supply,.5,.005),s=>percent(s.traded,s.supply)]
    ]),
    normal(6,'同價，多做生意','More sales at the same price','保留有成交的自由市場。兩條曲線各自向右平移，維持均衡價，讓成交至少增加四分之一。','Keep a trading free market. Shift both curves outward without changing their slopes. Keep the equilibrium price and increase trade by at least a quarter.',[
      kept,free,['兩條曲線向右平移，維持各自斜率。','Shift both curves outward, keeping their slopes.',(s,p)=>!!p && s.a>p.a && s.c<p.c && near(s.b,p.b) && near(s.d,p.d)],
      ['比較兩次均衡價。','Compare the two equilibrium prices.',(s,p)=>s.traded>0 && p?.traded>0 && near(s.equilibriumPrice,p.equilibriumPrice,.05)],
      ['查看相對於基準的成交量。','Check trade relative to the reference.',(s,p)=>!!p && p.traded>0 && s.traded>=1.25*p.traded-1e-8,(s,p)=>percent(s.traded,p?.traded)]
    ]),
    normal(7,'降價卻少了好處','Cheaper drinks, smaller gains','保留自由市場。只設價格上限，讓飲料仍有成交，買家省下的總金額卻比原來少。','Keep a free market. Apply only a ceiling. Drinks must still sell, but consumer surplus must fall.',[
      reference,ceiling,['至少有一部分飲料成交。','Keep some trade.',s=>s.traded>0],
      ['消費者剩餘低於自由市場。','Bring consumer surplus below the free-market level.',s=>s.consume<s.freeConsume-1e-7,s=>percent(s.consume,s.freeConsume)]
    ]),
    normal(8,'少賣一半，少掉多少福利？','Half the sales, how much lost?','保留自由市場。只設價格下限，讓成交剩一半，看看無謂損失占原本總剩餘多少。','Keep a free market and apply only a floor. Halve trade and check the share of free-market surplus that is lost.',[
      reference,floor,['比較目前與原本的成交量。','Compare current and original sales.',s=>s.equilibriumQty>0 && near(s.traded/s.equilibriumQty,.5,.005),s=>percent(s.traded,s.equilibriumQty)],
      ['比較無謂損失與自由市場總剩餘。','Compare deadweight loss with free-market total surplus.',s=>s.freeSurplus>0 && near(s.loss/s.freeSurplus,.25,.005)]
    ]),
    normal(9,'留下一半總剩餘','Keep half the surplus','保留有成交的自由市場。只設價格上限，使總剩餘剩一半，同時讓買方獲得至少和原來一樣多的剩餘。','Keep a trading free market. Apply only a ceiling. Retain half the total surplus while keeping consumer surplus at or above its original level.',[
      reference,ceiling,['維持買方原有的剩餘。','Preserve the original buyer surplus.',s=>s.traded>0 && s.consume>=s.freeConsume-1e-7,s=>percent(s.consume,s.freeConsume)],
      ['比較兩次的總剩餘。','Compare total surplus with the reference.',s=>s.freeSurplus>0 && near(s.surplus/s.freeSurplus,.5,.005),s=>percent(s.surplus,s.freeSurplus)]
    ]),
    normal(10,'兩張價籤，同一塊損失','Two rules, one loss','保留一個有成交且造成短缺的上限。曲線不動，改用下限，讓攤位賣出一部分、剩下一部分，無謂損失和上限一樣大。','Keep a ceiling with sales and a shortage. Keep the curves and find a floor where some drinks sell, some are left over and the deadweight loss matches.',[
      ['保留生效且仍有成交的上限，維持同一組曲線。','Save a binding ceiling with sales and keep the same curves.',(s,p)=>p?.policy==='ceiling' && p.shortage>0 && p.traded>0 && sameCurves(s,p)],floor,
      ['確認有成交，比較兩次的無謂損失。','Check for sales and compare the two losses.',(s,p)=>s.traded>0 && s.loss>0 && !!p && near(s.loss,p.loss,.05),(s,p)=>p?fmt(s.loss-p.loss):'—']
    ]),
    hidden(1,3,'價籤懸在杯緣上方，隊尾靜得像昨天。','A price tag hovers just above the rim. The end of the line is quiet as yesterday.',
      (s,p)=>savedFree(s,p) && s.policy==='ceiling' && !s.binding &&
        s.price>s.equilibriumPrice+1e-9 && near(s.price,s.equilibriumPrice,1+1e-9) && near(s.traded,p.traded)),
    hidden(2,4,'兩張價籤昨天在櫃角碰面，今天各站一邊。','Two price tags met at the counter’s edge yesterday. Today they stand apart.',
      (s,p)=>p.policy==='free' && s.policy==='free' && p.a===p.c && s.a<s.c && s.equilibriumPrice===null &&
        near(s.b,p.b) && near(s.d,p.d) && (near(s.a,p.a) || near(s.c,p.c))),
    hidden(3,5,'兩疊原先高低不一的收據，終於齊了邊。','Two uneven stacks of receipts finally line up.',
      (s,p)=>p.policy==='free' && s.policy==='free' && near(p.a,s.a) && near(p.c,s.c) &&
        p.traded>0 && !near(p.consume,p.produce) && s.a>s.c && s.traded>0 && near(s.b,s.d) && near(s.consume,s.produce)),
    hidden(4,5,'門檻兩側只隔一步，最後一位客人留在了門外。','A single step across the threshold leaves the last buyer outside.',
      (s,p)=>p.policy==='floor' && p.binding && p.traded>0 && s.policy==='floor' && s.binding && sameCurves(s,p) &&
        p.price<s.a && near(p.price,s.a,1+1e-9) && s.price>=s.a && near(s.price,s.a,1+1e-9) &&
        s.traded===0 && s.excess>0),
    hidden(5,6,'水龍頭恰在第一滴將落之處停住。','The tap stops at the very lip of its first drop.',
      (s,p)=>p.policy==='ceiling' && p.shortage>0 && p.traded>0 && s.policy==='ceiling' && sameCurves(s,p) &&
        s.shortage>0 && s.supply===0 && s.traded===0 && near(s.actualPrice,s.c)),
    hidden(6,7,'招牌換了位置，兩本帳簿卻像昨天的複本。','The sign has moved. Both ledgers look like yesterday’s copies.',
      (s,p)=>p.policy==='free' && s.policy==='free' && p.traded>0 && s.traded>0 && s.a>p.a && s.c>p.c && near(s.b,p.b) && near(s.d,p.d) && s.actualPrice>p.actualPrice &&
        near(s.traded,p.traded) && near(s.consume,p.consume) && near(s.produce,p.produce)),
    hidden(7,8,'人潮漸疏，收銀的回聲依然如昨。','The queue thins, but the till’s echo stays the same.',
      (s,p)=>p.policy==='floor' && s.policy==='floor' && p.binding && s.binding && sameCurves(s,p) &&
        s.price>=1.1*p.price-1e-9 && s.traded>0 && s.traded<p.traded && near(s.revenue,p.revenue,.05)),
    hidden(8,8,'隊尾多了幾張新面孔，櫃前的杯影像昨天。','New faces gather at the back. The cups at the counter cast yesterday’s shadows.',
      (s,p)=>s.edit==='demand' && p.policy==='ceiling' && s.policy==='ceiling' && p.shortage>0 && s.shortage>p.shortage &&
        near(s.actualPrice,p.actualPrice) && near(s.c,p.c) && near(s.d,p.d) && near(s.b,p.b) &&
        s.traded>0 && near(s.traded,p.traded) && s.consume>p.consume),
    hidden(9,9,'兩本帳簿交換封面，杯子的腳步沒有停頓。','Two ledgers change covers without disturbing a single cup.',
      (s,p)=>p.policy==='free' && s.policy==='free' && s.traded>0 && near(s.a,p.a) && near(s.c,p.c) &&
        p.traded>0 && !near(p.consume,p.produce) && !near(s.consume,s.produce) && near(s.traded,p.traded) && near(s.consume,p.produce) && near(s.produce,p.consume)),
    hidden(10,10,'兩張帳頁各缺一角，桌上的杯排卻對不齊隊尾。','Two ledger pages have matching corners missing. The cups do not line up with the queue.',
      (s,p)=>p.policy==='floor' && p.excess>0 && s.policy==='ceiling' && s.shortage>0 && sameCurves(s,p) &&
        s.traded>0 && p.traded>0 && near(s.loss,p.loss,.05) && !near(s.shortage,p.excess,.05))
  ];
  // Compare the economic conditions independently. A reference, camera, or inactive price
  // does not turn a market that already qualified into a second piece of mission evidence.
  for (const task of tasks) {
    const matches = task.check;
    task.check = (event, memory) => (!event.data.recordedFor || event.data.recordedFor === task.id) && matches(event,memory);
  }
  function createRecorder(storage) {
    const slot = 'supply-demand:recorded-markets:1';
    let book = new Map();
    try { if (storage) book = new Map(JSON.parse(storage.getItem(slot) || '[]')); } catch (_) { /* In-memory use is sufficient. */ }
    return reading => {
      const key = [reading.a,reading.b,reading.c,reading.d,reading.policy,reading.policy === 'free' ? '' : reading.price].join('/');
      const candidate = tasks.find(task => task.check({type:'recorded',data:reading}));
      const first = book.get(key);
      if (candidate && !first) {
        book.set(key,candidate.id);
        try { storage?.setItem(slot,JSON.stringify(Array.from(book))); } catch (_) { /* Keep the tab's book in memory. */ }
      }
      return {...reading, recordedFor:first || candidate?.id, usedForAnother:!!(first && candidate && first !== candidate.id)};
    };
  }
  let storage;
  try { storage = window.sessionStorage; } catch (_) { /* Storage can be disabled. */ }
  const recordMarket = createRecorder(storage);
  window.SupplyDemandEvidence = {createRecorder, record(reading) {
    const blocker = window.LabMission.blocker?.();
    // A practice reading can show a hint without reserving this market for a mission.
    return blocker === 'off' || blocker === 'login' ? reading : recordMarket(reading);
  }};
  window.LabMission.register(slug,tasks);
})();
