(function () {
  'use strict';
  const C = window.SupplyDemandCore, D = window.LabDraw;
  const { t: T } = window.LabSettings, N = window.LabNum;
  const $ = id => document.getElementById(id);
  const canvas = $('cv'), ctx = canvas.getContext('2d');
  const fields = ['a', 'b', 'c', 'd', 'price'];
  const font = D.FONT, c = D.c;
  const format = (n, digits = 1) => Number(n.toFixed(digits)).toString();
  const cups = n => format(n, 2) + T(' 杯', ' cups');
  const money = n => n === null ? '—' : T(format(n, 2) + ' 元', 'NT$' + format(n, 2));
  const rule = k => ({ free: T('自由市場', 'Free market'), ceiling: T('價格上限', 'Price ceiling'), floor: T('價格下限', 'Price floor') })[k];
  let policy = 'free', state, previous = null, records = [], guidedReading = null, lastEdit = null, refreshGuide;
  let axes, scale, gesture = null, hover = '', scene = null, version = 0;
  let priceHandle = null, ends = {}, frame = 0, crowd = [], crowdTimer = 0;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function readingRows(items) {
    $('readout').replaceChildren(...items.flatMap(([k, v]) => {
      const dt = document.createElement('dt'), dd = document.createElement('dd');
      dt.textContent = k; dd.textContent = v;
      return [dt, dd];
    }));
  }
  function history() {
    $('referenceNote').textContent = previous
      ? T('比較基準', 'Reference') + ' · ' + rule(previous.policy) + ' · ' + money(previous.actualPrice) + ' · ' + cups(previous.traded)
      : T('可用「保留基準」記住一個市場，再比較下一筆。這裡保留最近六筆讀數。', 'Keep a reference to compare two markets. The six most recent readings appear here.');
    $('history').replaceChildren(...records.map(r => {
      const tr = document.createElement('tr');
      [rule(r.policy), r.actualPrice === null ? '—' : format(r.actualPrice, 2), format(r.traded, 2), format(r.loss, 2)].forEach(v => {
        const cell = document.createElement('td'); cell.textContent = v; tr.append(cell);
      });
      return tr;
    }));
    $('releaseReference').hidden = !previous;
    $('clearReference').disabled = !previous && !records.length;
  }
  function showAmount(field, value) {
    const number = document.createElement('span'), unit = document.createElement('span');
    const english = LabSettings.lang === 'en';
    number.textContent = format(value,2);
    unit.className = 'currency'; unit.textContent = T('元','NT$');
    field.replaceChildren(...(english ? [unit,number] : [number,unit]));
    field.setAttribute('aria-label',money(value));
  }
  function output() {
    const s = state;
    const noMarket = s.equilibriumPrice === null;
    $('noMarket').hidden = !noMarket;
    $('zeroContact').hidden = s.a !== s.c;
    $('priceRow').hidden = policy === 'free';
    fields.forEach(id => {
      const out = $(id + 'o');
      if (!out.dataset.editing) out.textContent = ['a', 'c', 'price'].includes(id) ? money(s[id]) : format(s[id], 2);
    });
    $('posted').textContent = money(s.actualPrice);
    $('compactQuote').textContent = money(s.actualPrice) + T('／杯','/cup');
    for (const key of ['consume','produce','loss']) {
      showAmount($(key),s[key]);
      const ref = $('ref-' + key);
      ref.hidden = !previous;
      if (previous) ref.textContent = T('基準 ', 'Ref. ') + money(previous[key]);
    }
    $('totals').replaceChildren();
    const totals = [[T('總剩餘 ', 'Total surplus '), s.surplus], [T('自由市場 ', 'Free market '), s.freeSurplus]];
    if (previous) totals.push([T('基準總剩餘 ', 'Reference total '), previous.surplus]);
    totals.forEach(([label, value], i) => {
      const n = document.createElement('b'); n.textContent = money(value);
      $('totals').append((i ? '　·　' : '') + label, n);
    });
    $('stallLegend').hidden = !scene;
    $('wanted').textContent = cups(s.demand);
    $('stock').textContent = cups(s.supply);
    $('sold').textContent = cups(s.traded);
    const guide = noMarket ? T('提高起始願付價格，或降低起始願售價格，就有機會成交。', 'Raise the starting bid or lower the starting offer to make trade possible.')
      : s.shortage > 0 ? T('買不到的有 ', 'Unfilled demand: ') + cups(s.shortage)
      : s.excess > 0 ? T('賣不掉的有 ', 'Unsold supply: ') + cups(s.excess)
      : s.traded === 0 ? T('沒有一杯能同時滿足買賣雙方的出價。', 'No positive quantity works for both buyers and sellers.')
      : T('備貨剛好賣完，每位想買的人都拿到飲料。', 'The stall sells out and every willing buyer gets a drink.');
    $('policyHint').textContent = guide + (policy === 'free' || noMarket ? '' : s.binding
      ? T('　管制生效。', ' · The rule binds.') : T('　管制未改變成交量。', ' · The rule leaves trade unchanged.'));
    $('stageHint').textContent = scene
      ? T('每位客人或每個杯子代表兩杯，最後一組可以不足兩杯。', 'Each guest or cup represents two drinks. The last group can represent less.')
      : T('需求用實線圓點，供給用虛線方點。拖線身平移，拖端點改斜率。', 'Demand has a solid line and round end. Supply has a dashed line and square end. Drag a line to shift it or its end to change slope.')
        + (policy !== 'free' ? T('拖虛線上的價籤改價。', ' Drag the dashed price tag to change the limit.') : '')
        + (previous ? T('灰虛線是基準曲線。', ' Gray dashes show the reference curves.') : '')
        + (previous?.traded > 0 ? T('菱形標出基準成交點。', ' A diamond marks the reference trade.') : '');
    readingRows([
      [T('自由均衡價', 'Free-market price'), money(s.equilibriumPrice)], [T('自由成交量', 'Free-market trade'), cups(s.equilibriumQty)],
      [T('短缺', 'Shortage'), cups(s.shortage)], [T('剩餘供給', 'Excess supply'), cups(s.excess)],
      [T('攤位營收', 'Stall revenue'), money(s.revenue)],
      [T('消費者剩餘', 'Consumer surplus'), money(s.consume)], [T('生產者剩餘', 'Producer surplus'), money(s.produce)],
      [T('無謂損失', 'Deadweight loss'), money(s.loss)], [T('總剩餘', 'Total surplus'), money(s.surplus)],
      [T('自由市場總剩餘', 'Free-market surplus'), money(s.freeSurplus)],
      ...(previous ? [[T('成交量較基準增減', 'Trade change'), cups(s.traded - previous.traded)],
        [T('營收較基準增減', 'Revenue change'), money(s.revenue - previous.revenue)],
        [T('消費者剩餘較基準增減', 'Consumer surplus change'), money(s.consume - previous.consume)],
        [T('無謂損失較基準增減', 'Loss change'), money(s.loss - previous.loss)]] : [])
    ]);
  }
  function emit(type, data = {...state, prior:previous, edit:lastEdit}) {
    window.LabMission?.emit(type, data);
    refreshGuide?.();
  }
  function feedback(message) { $('feedback').textContent = message; $('feedback').hidden = !message; }

  // Short, overlapping voiced murmurs and filtered breaths. The physical shortage sets the gain.
  function quiet() {
    clearTimeout(crowdTimer); crowdTimer = 0;
    crowd.forEach(v => v.stop(.18)); crowd = [];
  }
  function hum() {
    if (!window.LabSound.enabled() || document.hidden || !state.shortage) { quiet(); return; }
    if (crowdTimer) return;
    const gain = .12 * state.shortage / 200;
    if (!crowd.length) crowd = [290, 365, 440].map(freq => LabSound.voice({ freq, gain: .0002, type: 'triangle' }));
    crowd.forEach((v, i) => v.set({ freq: 270 + i * 79 + 47 * Math.random(), gain: gain * (.5 + .5 * Math.random()) }, .34));
    LabSound.noise({ dur: .27, attack: .11, gain: gain * 1.4, filter: 850 + 200 * Math.random(), q: 1.4 });
    crowdTimer = setTimeout(()=>{ crowdTimer=0; hum(); }, 420);
  }
  function soundButton() {
    const on = LabSound.enabled();
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效開', 'Sound on') : T('音效關', 'Sound off');
    if (on) hum(); else quiet();
  }
  function hasFreeReference() {
    return previous?.policy === 'free' && previous.traded > 0 && ['a','b','c','d'].every(k => previous[k] === state[k]);
  }
  function comparingCeiling() {
    return hasFreeReference() && state.policy === 'ceiling' && state.binding;
  }
  function record() {
    if (comparingCeiling()) guidedReading = state;
    const reading={...state, prior:previous, edit:lastEdit};
    const data=window.SupplyDemandEvidence?.record(reading) || reading;
    records = [state, ...records].slice(0, 6); history();
    const share = state.freeSurplus > 0 ? format(100 * state.loss / state.freeSurplus, 1) + '%' : '—';
    feedback(T('已記錄', 'Recorded') + ' · ' + rule(policy) + ' · ' + cups(state.traded)
      + ' · ' + T('損失占自由市場總剩餘 ', 'Loss as a share of free-market surplus ') + share
      + (data.usedForAnother ? T('。這個市場已用於另一題。調整曲線、價格制度或管制價，再做一次比較。',' · This market already counted for another mission. Change a curve, the pricing rule or the price limit and try the comparison again.') : ''));
    emit('recorded',data);
  }

  function measure(userAction) {
    const settings = Object.fromEntries(fields.map(id => [id, N.value($(id))]));
    settings.policy = policy;
    const lastTrade = state?.traded;
    if (userAction) lastEdit = C.marketEdit(state,settings) || lastEdit;
    state = { ...settings, ...C.market(settings) };
    feedback(''); output();
    if (scene) scene.update(state); else schedule();
    if (userAction) {
      if (LabSound.enabled() && lastTrade !== undefined && Math.abs(lastTrade - state.traded) > 1e-8) {
        const freq = 360 + 8 * state.traded;
        LabSound.tone({freq, dur:.24, gain:.15});
        LabSound.tone({freq:freq * 2, dur:.09, gain:.04});
      }
      hum(); emit('marketChanged');
    }
  }

  function line(points, color, width = 1, dash = []) {
    ctx.beginPath();
    points.forEach(([x,y], i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y));
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash); ctx.stroke(); ctx.setLineDash([]);
  }
  // The shared setter applies part of the font preference. Complete the requested scale on this graph.
  function chartFont(size, weight='600') {
    const fs = Number(LabSettings.get('fs')) || 1;
    return weight + ' ' + (size * fs / (1 + .7 * (fs - 1))) + 'px ' + font;
  }
  function halo(word, x, y, ink, align = 'left', size = 13) {
    D.haloText(ctx, word, x, y, ink, align, 'middle', chartFont(size));
  }
  function niceStep(limit) {
    const base = 10 ** Math.floor(Math.log10(limit / 4));
    return ([1, 2, 2.5, 5, 10].find(n => n * base >= limit / 4 - 1e-8) || 10) * base;
  }
  function limits() {
    const list = previous ? [state, previous] : [state];
    const key=list.map(r=>[r.a,r.b,r.c,r.d].join('/')).join('|');
    const maxQ = Math.max(16, ...list.map(r => Math.max(r.supply, r.demand, r.equilibriumQty * 1.9)));
    const maxP = Math.max(30, ...list.map(r => Math.max(r.a, r.c, r.policy === 'free' ? 0 : r.price) * 1.11));
    // A price change moves the points along the existing curves. Keep the axes still unless a new point falls outside.
    const qLimit=Math.max(maxQ,scale?.key===key ? scale.q : 0);
    const pLimit=Math.max(maxP,scale?.key===key ? scale.p : 0);
    const dq=niceStep(qLimit), dp=niceStep(pLimit);
    scale={key,q:dq*Math.ceil(qLimit/dq),p:dp*Math.ceil(pLimit/dp),dq,dp};
    return scale;
  }
  function geometry(w, h) {
    const {q,p,dq,dp} = gesture?.domain || limits();
    const fs = Number(LabSettings.get('fs')) || 1;
    const railInset = w < 430 ? 32 + Math.max(0, canvas.getBoundingClientRect().right - (innerWidth - 44)) : 0;
    const left = Math.ceil((w < 430 ? 41 : 51) * fs), right = w - Math.max(railInset,Math.ceil(27 * Math.max(1, fs)));
    const top = Math.ceil(29 * fs), bottom = h - Math.ceil((h < 300 ? 51 : 61) * fs);
    return { q,p,dq,dp,left,right,top,bottom, x: v => left + v / q * (right - left), y: v => bottom - v / p * (bottom - top) };
  }
  function plotGrid(g) {
    for (let q = 0; q <= g.q + .001; q += g.dq / 2) {
      const x = g.x(q), major = Number.isInteger(Math.round(q / g.dq * 2) / 2);
      line([[x,g.top],[x,g.bottom]], D.alpha(c.muted,major ? .22 : .08));
      if (major) halo(format(q), x, g.bottom + 13, c.muted, 'center', 13);
    }
    for (let p = 0; p <= g.p + .001; p += g.dp / 2) {
      const y = g.y(p), major = Number.isInteger(Math.round(p / g.dp * 2) / 2);
      line([[g.left,y],[g.right,y]], D.alpha(c.muted,major ? .22 : .08));
      if (major) halo(format(p), g.left - 7, y, c.muted, 'right', 13);
    }
    line([[g.left,g.top],[g.left,g.bottom],[g.right,g.bottom]], c.muted, 1.3);
  }
  function polygon(g, points, ink, hatch) {
    ctx.save(); ctx.beginPath();
    points.forEach(([q,p],i) => i ? ctx.lineTo(g.x(q),g.y(p)) : ctx.moveTo(g.x(q),g.y(p)));
    ctx.closePath(); ctx.clip();
    const wash = ctx.createLinearGradient(0,g.top,0,g.bottom);
    wash.addColorStop(0,D.alpha(ink,.34)); wash.addColorStop(1,D.alpha(ink,.16));
    ctx.fillStyle = wash; ctx.fillRect(g.left,g.top,g.right-g.left,g.bottom-g.top);
    if (hatch) for (let x = g.left - (g.bottom-g.top); x < g.right; x += 8) {
      line([[x,g.bottom],[x+g.bottom-g.top,g.top]], D.alpha(ink,.45));
    }
    ctx.restore();
  }
  // 放不下金額的窄面積：只畫和上方讀數卡圖例同形狀的記號（● 消費者、■ 生產者、▲ 無謂損失）。
  // 11/20 試玩：原本拉虛線引線到圖外，窄圖時會穿過座標軸標題與曲線名稱，看起來像畫錯，所以拿掉引線。
  function areaAmount(g, left, right, upper, lower, amount, ink, column) {
    if (!(amount > 0) || right <= left) return;
    const q = left + (right-left)/3, x = g.x(q), label = money(amount);
    const y = (g.y(upper(q)) + g.y(lower(q))) / 2;
    ctx.font = chartFont(15);
    const half = ctx.measureText(label).width/2 + 6, dq = half*g.q/(g.right-g.left);
    const top = Math.max(g.y(upper(q-dq)), g.y(upper(q+dq)));
    const bottom = Math.min(g.y(lower(q-dq)), g.y(lower(q+dq)));
    if (q-dq>left && q+dq<right && bottom-top>34*(Number(LabSettings.get('fs'))||1)
      && (policy==='free' || Math.abs(y-g.y(state.price))>19)) {
      halo(label,x,(top+bottom)/2,ink,'center',15); return;
    }
    ctx.beginPath();
    if (column===0) ctx.arc(x,y,5,0,2*Math.PI);
    else if (column===1) ctx.rect(x-4.5,y-4.5,9,9);
    else {ctx.moveTo(x,y-6); ctx.lineTo(x+5.5,y+4); ctx.lineTo(x-5.5,y+4); ctx.closePath();}
    ctx.fillStyle=ink; ctx.strokeStyle=c['canvas-bg']; ctx.lineWidth=2; ctx.stroke(); ctx.fill();
  }
  function segment(g, s, key) {
    const down = key === 'a', start = down ? s.a : s.c, slope = down ? -s.b : s.d;
    const end = Math.min(g.q, (down ? -start : g.p - start) / slope);
    return { x0: g.left, y0: g.y(start), x: g.x(end), y: g.y(start + slope * end), q: end, p: start + slope * end };
  }
  function curves(g, s, ghost) {
    for (const key of ['a','c']) {
      const end = segment(g,s,key), ink = key === 'a' ? c.neg : c.pos, handle = key === 'a' ? 'b' : 'd';
      const pts = [[end.x0,end.y0],[end.x,end.y]];
      if (ghost) { line(pts,D.alpha(c.muted,.6),1.7,[5,5]); continue; }
      ends[key] = end;
      line(pts,D.alpha(c['canvas-bg'],.85),6);
      line(pts,ink,hover === key ? 4.5 : 3,key === 'c' ? [11,5] : []);
      const ratio = key === 'a' ? .18 : .24;
      const x = end.x0 + (end.x-end.x0) * ratio, y = end.y0 + (end.y-end.y0) * ratio;
      const name = key === 'a' ? T('需求','Demand') : T('供給','Supply');
      const nearOther = Math.abs(g.y(s.a-s.b*(x-g.left)*g.q/(g.right-g.left)) - g.y(s.c+s.d*(x-g.left)*g.q/(g.right-g.left))) < 28;
      halo(name,x,clamp(y + (key === 'a' ? -12 : nearOther ? 16 : 13),g.top+9,g.bottom-10),ink,'center');
      const size = hover === handle ? 8 : 6;
      ctx.beginPath();
      if (key === 'a') ctx.arc(end.x,end.y,size,0,Math.PI*2);
      else ctx.rect(end.x-size,end.y-size,2*size,2*size);
      ctx.fillStyle = c['canvas-bg']; ctx.strokeStyle = ink; ctx.lineWidth = 2.5; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(end.x,end.y,2,0,Math.PI*2); ctx.fillStyle=ink; ctx.fill();
    }
  }
  function cup(x, y, width, ink, empty) {
    const h = Math.min(13,width*1.35);
    ctx.beginPath(); ctx.moveTo(x-width/2,y-h/2); ctx.lineTo(x+width/2,y-h/2);
    ctx.lineTo(x+width*.32,y+h/2); ctx.lineTo(x-width*.32,y+h/2); ctx.closePath();
    if (!empty) {
      const glaze=ctx.createLinearGradient(x-width/2,0,x+width/2,0);
      glaze.addColorStop(0,D.shade(ink,.22)); glaze.addColorStop(.45,ink); glaze.addColorStop(1,D.shade(ink,-.16));
      ctx.fillStyle=glaze; ctx.fill();
    }
    ctx.setLineDash(empty ? [2,2] : []); ctx.strokeStyle = ink; ctx.lineWidth = 1.2; ctx.stroke(); ctx.setLineDash([]);
    line([[x-width*.54,y-h/2-1],[x+width*.54,y-h/2-1]],ink);
    if (!empty && width>5) line([[x-width*.31,y],[x+width*.31,y]],D.alpha(c['canvas-bg'],.78),1.3);
  }
  function cupRow(left,right,y,quantity,ink,empty) {
    const width=right-left;
    if (width<2 || quantity<=0) return;
    const n=Math.max(1,Math.min(Math.ceil(quantity/C.cupsPerGroup),Math.floor(width/12)));
    for (let i=0; i<n; i++) cup(left+(i+.5)*width/n,y-2,Math.min(9,width/n*.75),ink,empty);
  }
  function quantityGap(g, h) {
    const s = state, gap = s.shortage || s.excess;
    const y = g.bottom + (h < 300 ? 29 : 32), ink = s.shortage ? c.neg : c.pos;
    cupRow(g.left,g.x(s.traded),y,s.traded,c.probe,false);
    if (gap > 1e-8) {
      const left = g.x(s.traded), right = g.x(Math.max(s.demand,s.supply));
      line([[left,y-5],[left,y+7],[right,y+7],[right,y-5]],D.alpha(ink,.65),1);
      cupRow(left,right,y,gap,ink,!!s.shortage);
    }
    const result = gap > 1e-8 ? (s.shortage ? T('短缺 ','Short ') : T('剩餘 ','Unsold '))+cups(gap)
      : s.traded > 0 ? T('供需相等','Market clears') : T('零成交','No trade');
    const quantity = T('數量（杯）','Quantity (cups)');
    ctx.font=chartFont(15);
    const resultWidth=ctx.measureText(result).width;
    ctx.font=chartFont(13);
    const stacked = resultWidth + ctx.measureText(quantity).width + 12 > g.right-g.left;
    const yAxis = h-11, yResult = stacked ? yAxis - 17*(Number(LabSettings.get('fs'))||1) : yAxis;
    halo(result,g.left,yResult,gap>1e-8?ink:c.probe,'left',15);
    halo(quantity,g.right,yAxis,c.muted,'right');
  }
  function draw() {
    frame = 0;
    if (scene || !state) return;
    const {width:w,height:h} = canvas.getBoundingClientRect();
    if (!w || !h) return;
    const dpr = Math.min(devicePixelRatio || 1,2);
    if (canvas.width !== Math.round(w*dpr) || canvas.height !== Math.round(h*dpr)) {
      canvas.width = Math.round(w*dpr); canvas.height = Math.round(h*dpr);
    }
    ctx.setTransform(dpr,0,0,dpr,0,0); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    D.backdrop(ctx,w,h);
    const g = axes = geometry(w,h), s = state, q = s.traded;
    plotGrid(g);
    ctx.save(); ctx.beginPath(); ctx.rect(g.left,g.top,g.right-g.left,g.bottom-g.top); ctx.clip();
    if (q > 0) {
      polygon(g,[[0,s.a],[q,s.a-s.b*q],[q,s.actualPrice],[0,s.actualPrice]],c.neg,false);
      polygon(g,[[0,s.c],[q,s.c+s.d*q],[q,s.actualPrice],[0,s.actualPrice]],c.pos,false);
    }
    if (s.loss > 0) polygon(g,[[q,s.a-s.b*q],[s.equilibriumQty,s.equilibriumPrice],[q,s.c+s.d*q]],c.equi,true);
    if (previous) curves(g,previous,true);
    if (q > 0) line([[g.x(q),g.bottom],[g.x(q),g.y(s.actualPrice)],[g.left,g.y(s.actualPrice)]],c.probe,1.4,[3,4]);
    ctx.restore();
    curves(g,s,false);
    const demandAt=n=>s.a-s.b*n, supplyAt=n=>s.c+s.d*n, paid=()=>s.actualPrice;
    areaAmount(g,0,q,demandAt,paid,s.consume,c.neg,0);
    areaAmount(g,0,q,paid,supplyAt,s.produce,c.pos,1);
    areaAmount(g,q,s.equilibriumQty,demandAt,supplyAt,s.loss,c.equi,2);
    halo(T('價格（元／杯）','Price (NT$/cup)'),g.left,g.top-14,c.muted);
    priceHandle = null;
    if (policy !== 'free') {
      const y = g.y(s.price);
      line([[g.left,y],[g.right,y]],c.equi,hover === 'price' ? 3 : 1.8,[7,4]);
      const name = (policy === 'ceiling' ? T('上限','Cap') : T('下限','Floor')) + ' ' + money(s.price);
      priceHandle = D.pill(ctx,name,g.right-6,y-3,c.equi,'right',chartFont(15,'bold'));
    }
    if (s.equilibriumQty > 0) {
      const x = g.x(s.equilibriumQty), y = g.y(s.equilibriumPrice);
      D.ball(ctx,x,y,5,c.probe);
      if (!s.binding && (policy === 'free' || Math.abs(g.y(s.price)-y) > 27)) {
        D.pill(ctx,T('均衡','Equilibrium'),x+8,y-7,c.probe,'left',chartFont(13));
      }
    }
    if (s.binding && q > 0) D.ball(ctx,g.x(q),g.y(s.actualPrice),5,c.probe);
    if (previous && previous.traded > 0) {
      const x=g.x(previous.traded), y=g.y(previous.actualPrice), k=6;
      line([[x,y-k],[x+k,y],[x,y+k],[x-k,y],[x,y-k]],c.muted,1.5);
    }
    quantityGap(g,h);
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(draw); }

  function local(event) { const r=canvas.getBoundingClientRect(); return {x:event.clientX-r.left,y:event.clientY-r.top}; }
  function hit(pt) {
    if (!axes) return '';
    const {x,y} = pt, g=axes;
    const dist = (px,py) => Math.hypot(px-x,py-y);
    const handles = ['a','c'].map(key => ({ key, e:ends[key] })).filter(v => v.e);
    const endpoint = handles.filter(({e}) => Math.abs(e.x-x)<=24 && Math.abs(e.y-y)<=24)
      .sort((a,b)=>dist(a.e.x,a.e.y)-dist(b.e.x,b.e.y))[0];
    if (endpoint) return endpoint.key==='a'?'b':'d';
    if (priceHandle && x >= priceHandle.x-6 && x <= priceHandle.x+priceHandle.w+4 &&
        Math.abs(y-(priceHandle.y+priceHandle.h/2)) <= 22) return 'price';
    if (x < g.left-12 || x > g.right+12 || y < g.top-12 || y > g.bottom+12) return '';
    const candidates = handles.map(({key,e}) => {
      const dx=e.x-e.x0, dy=e.y-e.y0, len=dx*dx+dy*dy;
      const k=clamp(((x-e.x0)*dx+(y-e.y0)*dy)/(len||1),0,1);
      return {key,d:dist(e.x0+k*dx,e.y0+k*dy)};
    });
    if (policy!=='free') candidates.push({key:'price',d:Math.abs(g.y(state.price)-y)});
    const best=candidates.sort((a,b)=>a.d-b.d)[0];
    return best && best.d <= 22 ? best.key : '';
  }
  function setHover(key) {
    if (hover !== key) { hover=key; schedule(); }
    canvas.style.cursor=gesture ? 'grabbing' : key ? 'grab' : 'default';
  }
  canvas.addEventListener('pointerdown',e=>{
    if (gesture || e.button !== 0) return;
    const pt=local(e), key=hit(pt); if (!key) return;
    e.preventDefault(); canvas.setPointerCapture(e.pointerId);
    gesture={key,id:e.pointerId,pt,start:state,domain:axes,end:ends[key==='b'?'a':'c']}; setHover(key);
  });
  canvas.addEventListener('pointermove',e=>{
    const pt=local(e);
    if (!gesture) { setHover(hit(pt)); return; }
    if (e.pointerId!==gesture.id) return;
    const {key,start,domain:g,end} = gesture;
    const dp=-(pt.y-gesture.pt.y)*g.p/(g.bottom-g.top), dq=(pt.x-gesture.pt.x)*g.q/(g.right-g.left);
    let value=start[key]+dp;
    if (key==='b' || key==='d') {
      const q=Math.max(.01,end.q+dq);
      value=key==='b' ? (start.a-end.p-dp)/q : (end.p+dp-start.c)/q;
    }
    const el=$(key), dec=Number(el.dataset.decimals);
    value=Number(clamp(value,Number(el.min),Number(el.max)).toFixed(dec));
    if (value!==N.value(el)) N.set(el,value);
  });
  function release(e) {
    if (gesture?.id !== e.pointerId) return;
    gesture=null; setHover(''); schedule();
  }
  canvas.addEventListener('pointerup',release); canvas.addEventListener('lostpointercapture',release);
  canvas.addEventListener('pointercancel',release);
  canvas.addEventListener('pointerleave',()=>{ if (!gesture) setHover(''); });

  function view2(message='') {
    version++; scene?.dispose(); scene=null; $('view3').replaceChildren();
    $('view2').hidden=false; $('view3').hidden=true; $('stallTools').hidden=true; $('cameraControls').hidden=true;
    $('view2d').setAttribute('aria-pressed','true'); $('view3d').setAttribute('aria-pressed','false');
    $('viewMsg').textContent=message; $('viewMsg').hidden=!message; output(); schedule();
  }
  function preset(which) {
    scene?.preset(which);
    $('resetCam').setAttribute('aria-pressed',String(which==='front'));
    $('lineCam').setAttribute('aria-pressed',String(which==='queue'));
  }
  async function view3() {
    if (scene) return;
    const request=++version;
    $('viewMsg').textContent=T('載入攤位中…','Opening the stall…'); $('viewMsg').hidden=false;
    try {
      const [{createStall}, THREE, {OrbitControls}] = await Promise.all([
        import('./supply-demand-3d.js'), import('../vendor/three/three.module.min.js'), import('../vendor/three/OrbitControls.js')
      ]);
      if (request!==version) return;
      $('view2').hidden=true; $('view3').hidden=false;
      scene=createStall({THREE,OrbitControls,host:$('view3'),navHost:$('stallNav'),T,reduced,
        onLost:()=>view2(T('立體畫面中斷，已回到供需圖。','The 3D context was lost. The graph is available.'))});
      $('view2d').setAttribute('aria-pressed','false'); $('view3d').setAttribute('aria-pressed','true');
      $('stallTools').hidden=false; $('cameraControls').hidden=false; $('viewMsg').hidden=true;
      scene.update(state); preset('front'); output();
    } catch (err) {
      if (request===version) view2(T('目前無法開啟立體攤位，已回到供需圖。','3D is unavailable. The supply and demand graph is ready.'));
    }
  }
  fields.forEach(id => $(id).addEventListener('input',()=>measure(true)));
  document.querySelectorAll('#modes button').forEach(button=>button.addEventListener('click',()=>{
    policy=button.dataset.mode;
    document.querySelectorAll('#modes button').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
    measure(true);
  }));
  $('record').addEventListener('click',record);
  $('reference').addEventListener('click',()=>{
    previous=state; guidedReading=false; history(); output(); schedule(); emit('marketChanged');
    feedback(T('已保留比較基準','Reference saved')+' · '+rule(policy)+' · '+money(state.actualPrice)+' · '+cups(state.traded));
  });
  $('releaseReference').addEventListener('click',()=>{
    previous=null; guidedReading=false; history(); output(); schedule(); emit('marketChanged');
    feedback(T('已解除基準，最近讀數仍可查看。','Reference released. Recent readings are still available.'));
  });
  $('clearReference').addEventListener('click',()=>{
    previous=null; records=[]; guidedReading=false; history(); output(); schedule(); emit('marketChanged'); feedback(T('讀數與基準已清除。','Readings and reference cleared.'));
  });
  $('view3d').addEventListener('click',view3); $('view2d').addEventListener('click',()=>view2());
  $('resetCam').addEventListener('click',()=>preset('front')); $('lineCam').addEventListener('click',()=>preset('queue'));
  $('soundBtn').addEventListener('click',()=>LabSettings.set('sound',!LabSound.enabled()));
  window.addEventListener('lab:settingschange',e=>{ if (e.detail?.name==='sound') soundButton(); if (e.detail?.name==='fs') { schedule(); scene?.theme(); } });
  document.addEventListener('visibilitychange',()=>document.hidden ? quiet() : hum());
  window.addEventListener('pagehide',quiet);
  window.addEventListener('lab:themechange',()=>{ output(); history(); scene?.theme(); schedule(); });
  new ResizeObserver(schedule).observe(canvas);
  document.addEventListener('DOMContentLoaded', () => {
    const actions = $('actions'), home = $('actionsHome');
    function placeActions() {
      const drawer = document.querySelector('.labdeck');
      if ((LabDeck.mode==='drawer' || LabDeck.mode==='stack') && drawer) {
        if (actions.parentElement!==drawer) drawer.prepend(actions);
      } else if (actions.previousElementSibling!==home) home.after(actions);
    }
    placeActions(); window.addEventListener('resize',placeActions);
    const key='supply-demand';
    const controls = [
      {target:'#modes [data-mode="free"]',hint:['自由市場','Free market']},
      {target:'#a',hint:['起始最高願付價格','Starting willingness to pay'],action:'drag'},
      {target:'#reference',hint:['保留基準','Keep reference']},
      {target:'#modes [data-mode="ceiling"]',hint:['價格上限','Price ceiling']},
      {target:'#price',hint:['管制價格','Controlled price'],action:'drag'},
      {target:'#record',hint:['記錄讀數','Record readings']}
    ];
    const instructions = [
      ['先觀察自由市場，再保留一筆基準。','Observe the free market and keep it as a reference.'],
      ['沿用這組曲線，設一個生效的價格上限，觀察誰買得到。','Keep the same curves and set a binding price ceiling. Watch who gets a drink.'],
      ['對照三項福利金額，記錄這次改價的結果。','Compare the three welfare amounts and record the new outcome.']
    ];
    function procedure() {
      const saved=hasFreeReference(), capped=comparingCeiling();
      const recorded=!!(capped && guidedReading && !C.marketEdit(guidedReading,state));
      const next=!saved ? policy!=='free' ? 0 : state.traded<=0 ? 1 : 2
        : policy!=='ceiling' ? 3 : !capped ? 4 : !recorded ? 5 : -1;
      const action=next>=0 ? [null,'下一個控制是「'+controls[next].hint[0]+'」。','Next control: '+controls[next].hint[1]+'.'] : null;
      const baseline=previous ? rule(previous.policy)+' · '+cups(previous.traded) : T('尚未保留','none saved');
      const observed = saved ? previous : state;
      const observedData = saved ? T('基準為', 'Reference: ') : T('目前為', 'Current market: ');
      const done=[saved,capped,recorded], current=done.indexOf(false);
      const needs=[
        [[observed.policy==='free','觀察自由市場。'+observedData+rule(observed.policy)+'。','Observe a free market. '+observedData+rule(observed.policy)+'.'],
         [observed.policy==='free' && observed.traded>0,'自由市場須有成交。'+observedData+cups(observed.traded)+'。','The free market must trade. '+observedData+cups(observed.traded)+'.'],
         [saved,'保留同組曲線的自由市場。基準為'+baseline+'。','Keep a free market with these curves. Reference: '+baseline+'.']],
        [[saved,'要有同組曲線的自由市場基準。目前為'+baseline+'。','Use a free-market reference with these curves. Reference: '+baseline+'.'],
         [policy==='ceiling','制度選價格上限。目前為'+rule(policy)+'。','Select a price ceiling. Current rule: '+rule(policy)+'.'],
         [capped,'上限要低於均衡價。目前管制價 '+money(state.price)+'，均衡價 '+money(state.equilibriumPrice)+'。','Set the ceiling below equilibrium. Limit: '+money(state.price)+'. Equilibrium: '+money(state.equilibriumPrice)+'.']],
        [[capped,'比較生效上限與自由市場。目前成交 '+cups(state.traded)+'，無謂損失 '+money(state.loss)+'。','Compare the binding ceiling with the free market. Sales: '+cups(state.traded)+'. Deadweight loss: '+money(state.loss)+'.'],
         [recorded,recorded?'這筆比較已記錄。':'這筆比較尚未記錄。',recorded?'This comparison is recorded.':'This comparison is awaiting a reading.']]
      ];
      return {next,steps:instructions.map(([zh,en],i)=>({html:T(zh,en),done:done[i],current:i===current,
        need:!done[i] && action ? [...needs[i],action] : needs[i]}))};
    }
    LabStepGuide.define(controls,{key});
    function showNext(stepIndex) {
      const {next}=procedure();
      let idx = next;
      if (typeof stepIndex === 'number' && stepIndex >= 0) {
        if (stepIndex === 0) idx = policy !== 'free' ? 0 : state.traded <= 0 ? 1 : 2;
        else if (stepIndex === 1) idx = policy !== 'ceiling' ? 3 : 4;
        else if (stepIndex === 2) idx = 5;
      }
      LabSide.instance?.close();
      if (idx<0) { LabStepGuide.hide(); return; }
      LabDeck.reveal(document.querySelector(controls[idx].target));
      LabStepGuide.show(idx,{key});
    }
    LabSide.mount({module:key,steps:()=>procedure().steps,guide:i=>showNext(i)});
    document.addEventListener('click',e=>{
      if (e.target.closest('.labside-guide-head .sg-toggle')) showNext();
    });
    refreshGuide=()=>{
      const {next}=procedure();
      if (next<0) LabStepGuide.hide(); else LabStepGuide.update(next,{key,auto:true});
      LabSide.instance?.refresh();
    };
    refreshGuide();
  });
  measure(false); history(); soundButton();
})();
