/* 從目前分支（HEAD）的 Git 歷史追溯新增與搬檔；不採用上次產生的 l 快取。
   只看 HEAD：其他分支（例如 Codex 試作分支）較早加入同名檔，不可把上架日提前；新實驗以進入主線的那次 commit 為上架日。 */
'use strict';
const path=require('path'),{execFileSync}=require('child_process');
const {ROOT}=require('./home-data.cjs');
function historyDates(slugs) {
  const src=execFileSync('git',['log','HEAD','--format=@@%H %cs','--name-status','--find-renames','--diff-filter=AR','--','*.html'],{cwd:ROOT,encoding:'utf8',windowsHide:true,maxBuffer:64<<20,stdio:['ignore','pipe','pipe']});
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
function launchCohorts(launch, originalCatalog, currentCatalog, firstDates) {
  const originalLabs = new Set(originalCatalog.map(lab => lab.s));
  const originalSubjects = new Set(originalCatalog.map(lab => lab.d));
  const currentSubjects = new Map(currentCatalog.map(lab => [lab.s, lab.d]));
  function verifyHistory(slug, proof) {
    const found = firstDates[slug];
    if (!found || found.path !== proof.path || found.date !== proof.date || found.commit !== proof.commit) {
      throw new Error('上架批次的 Git 歷史證據不符：' + slug);
    }
  }
  const siteDates = {};
  for (const [slug, proof] of Object.entries(launch.modules)) {
    if (!originalLabs.has(slug)) throw new Error('首次建站批次不可加入後續實驗：' + slug);
    verifyHistory(slug, proof);
    siteDates[slug] = proof.date;
  }
  const subjectLaunches = launch.subjectLaunches || {};
  const firstBatch = {};
  for (const [slug, proof] of Object.entries(subjectLaunches)) {
    if (originalLabs.has(slug) || originalSubjects.has(proof.subject) ||
        !currentSubjects.has(slug) || currentSubjects.get(slug) !== proof.subject) {
      throw new Error('新科目首批清單與科目目錄不符：' + slug);
    }
    // 首站的上架日就是進入主線那天：不寫死日期與 commit，從 HEAD 歷史取；還沒 commit 時為 null（上線當天）。
    const found = firstDates[slug];
    if (proof.path !== slug + '.html' || (found && found.path !== proof.path)) throw new Error('新科目首批的檔案路徑不符：' + slug);
    firstBatch[slug] = { subject: proof.subject, path: proof.path, date: found ? found.date : null };
  }
  return { siteDates, subjectLaunches: firstBatch };
}

function freshSummary(list, today, siteDates = {}, subjectLaunches = {}) {
  const summary = {};
  for (const { s: slug, d: subject, l: date } of list) {
    const group = summary[subject] ||= { total: 0, recent: [], initial: [], incremental: [], counted: [] };
    group.total++;
    const age = (Date.parse(today) - Date.parse(date)) / 86400000;
    if (!(age >= 0 && age < 7)) continue;
    group.recent.push(slug);
    if (siteDates[slug] === date) {
      group.initial.push(slug);
      continue;
    }
    group.incremental.push(slug); // 首頁「新 +N」也包含新科目的首批實驗。
    const first = subjectLaunches[slug];
    if (!first || first.subject !== subject || (first.date && first.date !== date)) group.counted.push(slug);
  }
  return summary;
}

function checkFresh(list, today, siteDates = {}, subjectLaunches = {}) {
  const summary = freshSummary(list, today, siteDates, subjectLaunches);
  // 每科七日內最多新增 30%（取整數）；小科（總數 3 站以下）至少允許 1 站，否則新科目永遠加不了第二站。
  const allowed = total => Math.max(1, Math.floor(total * 3 / 10));
  const overLimit = Object.entries(summary).filter(([, group]) => group.counted.length > allowed(group.total));
  if (overLimit.length) {
    const counts = overLimit.map(([subject, group]) =>
      subject + ' ' + group.counted.length + '/' + group.total + '：' + group.counted.join(', '));
    throw new Error('七日內新增超過該科 30%：\n' + counts.join('\n'));
  }
  return summary;
}
module.exports = { historyDates, launchCohorts, freshSummary, checkFresh };
