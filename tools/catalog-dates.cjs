/* 從全部本機 Git 歷史追溯新增與搬檔；不採用上次產生的 l 快取。 */
'use strict';
const path=require('path'),{execFileSync}=require('child_process');
const {ROOT}=require('./home-data.cjs');
function historyDates(slugs) {
  const src=execFileSync('git',['log','--all','--format=@@%H %cs','--name-status','--find-renames','--diff-filter=AR','--','*.html'],{cwd:ROOT,encoding:'utf8',windowsHide:true,maxBuffer:64<<20,stdio:['ignore','pipe','pipe']});
  const parent=new Map(),adds=[],files=[];
  const find=x=>{if(!parent.has(x))parent.set(x,x);const p=parent.get(x);if(p!==x)parent.set(x,find(p));return parent.get(x);};
  const join=(a,b)=>parent.set(find(a),find(b));
  let commit='',date='';
  for(const line of src.split(/\r?\n/)) {
    if(line.startsWith('@@')){[commit,date]=line.slice(2).split(' ');continue;}
    const p=line.split('\t');
    if(p[0]==='A'&&p[1]){adds.push({path:p[1],date,commit});files.push(p[1]);}
    else if(/^R\d+$/.test(p[0])&&p[2]){join(p[1],p[2]);files.push(p[1],p[2]);}
  }
  // 目錄搬動但檔名不變，仍是同一個不可更動的實驗 slug。
  for(const slug of slugs)for(const f of files)if(path.posix.basename(f)===slug+'.html')join(slug+'.html',f);
  const earliest=new Map();
  for(const a of adds){const k=find(a.path),old=earliest.get(k);if(!old||a.date<old.date||(a.date===old.date&&a.commit<old.commit))earliest.set(k,a);}
  return Object.fromEntries(slugs.map(s=>[s,earliest.get(find(s+'.html'))||null]));
}
function freshSummary(list,today,cohort={}) {
  const out={};
  for(const x of list){const o=out[x.d]||(out[x.d]={total:0,recent:[],incremental:[],initial:[]});o.total++;
    const age=(Date.parse(today)-Date.parse(x.l))/86400000;
    if(age>=0&&age<7){o.recent.push(x.s);if(cohort[x.s]===x.l)o.initial.push(x.s);else o.incremental.push(x.s);}
  }
  return out;
}
function checkFresh(list,today,cohort={}) {
  const summary=freshSummary(list,today,cohort), bad=Object.entries(summary).filter(([,x])=>x.incremental.length>x.total*.3);
  if(bad.length)throw new Error('七日內新增超過該科 30%：\n'+bad.map(([d,x])=>d+' '+x.incremental.length+'/'+x.total+'：'+x.incremental.join(', ')).join('\n'));
  return summary;
}
module.exports={historyDates,freshSummary,checkFresh};
