/* 任務可達成的證明腳本。用法：node tools/mission-proofs/gene-expression.js
 * 用核心（js/gene-expression-core.js）照頁面的做法算出 'gene'、'translate'、'ms-spin'、'ms-elim' 事件（與 js/gene-expression.js 相同的計算），
 * 再用任務檔（js/missions/gene-expression.js）同一份 check 函式判定。每個任務都給出一組做得到的操作、對照組，並檢查預設狀態不會誤觸高等級任務。
 * 修改核心、頁面的事件或任務條件後重跑。 */
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..', '..') + '/';
const G = require(ROOT + 'js/gene-expression-core.js');

const defs = [];
const fakeLM = { register: function (id, list) { list.forEach(m => defs.push(Object.assign({ mem: {} }, m))); } };
new Function('window', 'LabMission', fs.readFileSync(ROOT + 'js/missions/gene-expression.js', 'utf8'))({ LabMission: fakeLM }, fakeLM);
const byId = {};
defs.forEach(m => { byId[m.id.replace('gene-expression-', '')] = m; });
const check = (id, ev) => byId[id].check(ev, byId[id].mem);
const all = ev => defs.filter(m => m.check(ev, {})).map(m => m.id.replace('gene-expression-', ''));

const out = [];
let fail = 0;
function claim(ok, msg) { out.push((ok ? '✓ ' : '✗ ') + msg); if (!ok) fail++; }

// ---------- 與 js/gene-expression.js 相同的狀態與事件 ----------
const PRESET = { hbb: G.HBB, demo: G.DEMO };
function Lab(preset, custom) {
  const ref = preset === 'custom' ? G.clean(custom) : PRESET[preset];
  const st = { preset: preset, ref: ref, seq: ref, src: ref.split('').map((_, i) => i), tSeed: 1 };
  function info() {
    const edits = G.editsFromMap(st.ref, st.seq, st.src);
    const c = G.classify(st.ref, st.seq, edits);
    const o = G.orf(st.seq);
    const both = G.bothStrands(st.seq);
    let insPos = -1, delPos = -1;
    edits.forEach(e => { if (e.kind === 'ins') insPos = e.pos; if (e.kind === 'del') delPos = e.pos; });
    const pMut = o ? o.protein : '';
    return {
      preset: st.preset, seq: st.seq, len: st.seq.length, kind: c.kind, nEdits: edits.length,
      nSub: edits.filter(e => e.kind === 'sub').length, hasIns: edits.some(e => e.kind === 'ins'), hasDel: edits.some(e => e.kind === 'del'),
      idGap: insPos >= 0 && delPos >= 0 ? Math.abs(insPos - delPos) : -1, editKinds: edits.map(e => e.kind),
      delLen: edits.reduce((s, e) => s + (e.kind === 'del' ? e.len : 0), 0),
      pRef: c.pRef, pMut: pMut, dAA: c.dAA, stopped: !!(o && o.stopped), fwd: both.fwd, rev: both.rev,
      pal: G.isPalindrome(st.seq), oneDel: G.oneAAdeleted(c.pRef, pMut), hasOrf: !!o
    };
  }
  const ev = () => ({ type: 'gene', data: info() });
  return {
    st: st, info: info, ev: ev,
    sub(i, b) { st.seq = st.seq.slice(0, i) + b + st.seq.slice(i + 1); return ev(); },
    ins(i, b) { st.seq = st.seq.slice(0, i) + b + st.seq.slice(i); st.src.splice(i, 0, -1); return ev(); },
    del(i) { st.seq = st.seq.slice(0, i) + st.seq.slice(i + 1); st.src.splice(i, 1); return ev(); },
    translate() {
      const f = info(), tgt = G.target(st.tSeed, 5);
      return { type: 'translate', data: { preset: f.preset, seq: f.seq, protein: f.pMut, stopped: f.stopped, hasOrf: f.hasOrf, kind: f.kind, target: tgt, match: f.stopped && f.pMut === tgt } };
    }
  };
}
function MS() {
  const obs = [], elim = { semi: false, cons: false, disp: false };
  return {
    spin(n, denat) { obs.push({ n: n, denat: !!denat }); return { type: 'ms-spin', data: { n: n, denat: !!denat } }; },
    elim(model) {
      const ok = G.canEliminate(model, obs);
      if (ok) elim[model] = true;
      return { type: 'ms-elim', data: { model: model, valid: ok, obs: obs.slice(), elim: Object.assign({}, elim) } };
    }
  };
}
const C7 = 12 + 18;   // β 血紅素第 7 個密碼子 GAG 的第一個鹼基

// ---------- 預設狀態 ----------
{
  const L = Lab('hbb');
  const t = L.translate();
  claim(check('1', t), '1 第一條蛋白質：預設 β 血紅素按「轉錄＋轉譯」→ ' + t.data.protein.length + ' 個胺基酸、有終止');
  const hit = all(t).concat(all(L.ev()));
  claim(hit.every(id => id === '1'), '預設狀態只完成 1 號（實際：' + (hit.join('、') || '無') + '）');
  const L2 = Lab('custom', 'GGGCCCAAATTT');
  claim(!check('1', L2.translate()), '1 對照：沒有 ATG 的序列不算');
}
// ---------- 2、3、4 ----------
{
  const L = Lab('hbb');
  const e = L.sub(12 + 5, 'C');      // GTG → GTC
  claim(check('2', e), '2 同義突變：第 2 個密碼子 GTG → GTC，仍是 Val（' + e.data.kind + '）');
  const L2 = Lab('hbb'), e2 = L2.sub(5, 'G');
  claim(!check('2', e2), '2 對照：改在 5′ 非轉譯區（' + e2.data.kind + '）不算');
}
{
  const L = Lab('hbb');
  const e = L.sub(C7 + 1, 'T');
  claim(check('3', e), '3 鐮刀型：第 7 個密碼子 GAG → GTG，第 7 個胺基酸 ' + e.data.pRef[6] + ' → ' + e.data.pMut[6]);
  const L2 = Lab('hbb'), e2 = L2.sub(C7 + 1, 'C');
  claim(!check('3', e2), '3 對照：GAG → GCG（Ala）不算');
  const L3 = Lab('hbb'); L3.sub(C7 + 1, 'T'); const e3 = L3.sub(12 + 5, 'C');
  claim(!check('3', e3), '3 對照：多改了一個同義的鹼基（共兩個）不算');
}
{
  const L = Lab('hbb');
  const e = L.sub(12 + 24, 'T');      // AAG → TAG
  claim(check('4', e), '4 無意義：第 9 個密碼子 AAG → TAG，蛋白質剩 ' + e.data.pMut.length + ' 個');
  const L2 = Lab('hbb'), e2 = L2.sub(12 + 31 * 3, 'C');
  claim(!check('4', e2) && e2.data.kind === 'readthrough', '4 對照：把終止密碼子改掉是讀過頭（readthrough），不算');
}
// ---------- 5、7、9 ----------
{
  const L = Lab('hbb');
  const e = L.ins(12 + 12, 'A');
  claim(check('5', e), '5 移碼：第 5 個密碼子前插入 A，' + e.data.dAA + ' 個胺基酸不同');
  const L2 = Lab('hbb'); L2.ins(12 + 12, 'A'); L2.ins(12 + 12, 'A'); const e2 = L2.ins(12 + 12, 'A');
  claim(!check('5', e2) && e2.data.kind === 'inframe', '5 對照：一次插入三個鹼基是框內插入（' + e2.data.kind + '），不算移碼');
}
{
  const L = Lab('hbb');
  L.del(12 + 15); L.del(12 + 15); const e = L.del(12 + 15);
  claim(check('7', e), '7 框內缺失：刪掉第 6 個密碼子 CCT，蛋白質 ' + e.data.pRef.length + ' → ' + e.data.pMut.length + ' 個');
  const L2 = Lab('hbb'); L2.del(12 + 16); L2.del(12 + 16); const e2 = L2.del(12 + 16);
  out.push('  7 參考：錯開一格刪三個（跨兩個密碼子）時，剛好少一個胺基酸嗎？' + (e2.data.oneDel ? '是' : '不是（' + e2.data.dAA + ' 個不同）') + '，所以要對準密碼子刪');
  const L3 = Lab('hbb'); L3.del(12 + 15); const e3 = L3.del(12 + 15);
  claim(!check('7', e3), '7 對照：只刪兩個是移碼');
}
{
  const L = Lab('hbb');
  L.ins(12 + 9, 'G'); const e = L.del(12 + 16);
  claim(check('9', e), '9 Crick：第 4 個密碼子插入 G、後面 6 個鹼基處刪一個 → ' + e.data.dAA + ' 個胺基酸不同、相隔 ' + e.data.idGap);
  const L2 = Lab('hbb'); L2.ins(12 + 9, 'G'); const e2 = L2.del(12 + 60);
  claim(!check('9', e2), '9 對照：相隔太遠，' + e2.data.dAA + ' 個胺基酸不同');
  const L3 = Lab('hbb'); L3.del(12 + 9); const e3 = L3.ins(12 + 9, 'C');
  claim(!check('9', e3), '9 對照：刪掉再在同一處插入（等於替換）不算');
}
// ---------- 8 ----------
{
  const L = Lab('hbb');
  const tgt = G.target(1, 5);
  const L2 = Lab('custom', G.encode(tgt));
  const t = L2.translate();
  claim(check('8', t), '8 照單訂做：目標 ' + tgt + '，輸入 ' + G.encode(tgt) + ' 後轉譯');
  claim(!check('8', L.translate()), '8 對照：β 血紅素不是目標');
  const L3 = Lab('custom', G.encode(tgt).slice(0, -3) + 'GCA');
  claim(!check('8', L3.translate()), '8 對照：沒有終止密碼子不算');
}
// ---------- 12 ----------
{
  const s = 'GTTATGTTGGTGCTGGAGACATAG';
  const L = Lab('custom', s), e = L.ev();
  claim(check('12', e), '12 兩股都有基因：' + s + ' → ' + e.data.fwd + '／' + e.data.rev);
  const L2 = Lab('custom', 'CTATGACTCTGGGACCATAGA'), e2 = L2.ev();
  claim(!check('12', e2), '12 對照：' + e2.data.fwd + '／' + e2.data.rev + '（只有 5 個）不算');
}
// ---------- Meselson–Stahl ----------
{
  const M = MS();
  claim(!check('6', M.elim('cons')), '6 對照：還沒離心就排除不算');
  M.spin(0); claim(!check('6', M.elim('cons')), '6 對照：只看第 0 代不能排除');
  M.spin(1); const e = M.elim('cons');
  claim(check('6', e), '6 全保留：第 1 代只有一條中間帶 → 排除');
  const e2 = M.elim('disp');
  claim(!check('10', e2), '10 對照：只看雙股第 1 代不能排除分散');
  M.spin(2); const e3 = M.elim('disp');
  claim(check('10', e3), '10 分散：第 2 代出現中、輕兩條帶 → 排除');
  claim(!check('11', e3), '11 對照：用到第 2 代就不算');
  claim(!M.elim('semi').data.valid, '半保留永遠排除不了');
}
{
  const M = MS();
  M.spin(1); M.elim('cons'); M.spin(1, true); const e = M.elim('disp');
  claim(check('11', e) && check('10', e), '11 一代就夠：第 1 代雙股排除全保留、第 1 代單股（重、輕各一條）排除分散');
  const M2 = MS(); M2.spin(1, true); claim(!M2.elim('cons').data.valid, '11 參考：單股時全保留和半保留一樣，排除不了');
}
// ---------- 隱藏 ----------
{
  const L = Lab('hbb'), e = L.sub(13, 'C');
  claim(check('h1', e), 'h1 起始密碼子壞了：ATG → ACG（' + e.data.kind + '，從後面的 ATG 讀出 ' + e.data.pMut.length + ' 個）');
  const L1 = Lab('hbb'); L1.del(13); const e1 = L1.del(13);
  claim(!check('h1', e1), 'h1 對照：用刪除把 ATG 弄壞（' + e1.data.kind + '）不算，要替換一個鹼基');
  const L2 = Lab('custom', 'ATGCTGATCTTTGAGTAA'), e2 = L2.ev();
  claim(check('h2', e2), 'h2 生命：ATG CTG ATC TTT GAG TAA → ' + e2.data.pMut);
  const L3 = Lab('custom', 'GAATTCGAATTC'), e3 = L3.ev();
  claim(check('h3', e3), 'h3 迴文：GAATTCGAATTC（兩個 EcoRI 切位）');
  const L4 = Lab('custom', 'GAATTC'), e4 = L4.ev();
  claim(!check('h3', e4), 'h3 對照：只有 6 個鹼基不算');
  claim(!all(Lab('hbb').sub(C7 + 1, 'T')).some(id => /^h/.test(id)), '鐮刀型突變不會誤觸隱藏任務');
}

// ---------- 星星 ----------
const stars = m => m.hidden ? m.level * 2 : m.level;
const pub = defs.filter(m => !m.hidden), hid = defs.filter(m => m.hidden);
out.push(`任務 ${defs.length} 個（公開 ${pub.length}、隱藏 ${hid.length}），共 ${defs.reduce((a, m) => a + stars(m), 0)} 顆星（公開 ${pub.reduce((a, m) => a + stars(m), 0)}，隱藏 ${hid.reduce((a, m) => a + stars(m), 0)}）`);
console.log(out.join('\n'));
if (fail) { console.error(fail + ' 項不成立'); process.exitCode = 1; }
