/* 任務可達成的證明腳本（從製作時的暫存資料夾保存下來的快照）。用法：node tools/mission-proofs/slit-interference.js
 * 修改物理核心或任務條件後重跑，確認每個任務仍然做得到、預設狀態不會觸發任務。 */
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
// 用物理核心證明每個任務都做得到（數值都在滑桿範圍與打字精度內：λ 整數 nm、a/d 到 0.1 μm、L 到 0.01 m）
const SC = require(__ROOT + 'js/slit-interference-core.js');
const SPEC = SC.whiteSpectrum(75, 380, 750, 6500);
const NM = 1e-9, UM = 1e-6, MM = 1e-3;
let list = null;
global.LabMission = { register: (m, l) => { list = l; } }; global.window = { LabMission: global.LabMission };
require(__ROOT + 'js/missions/slit-interference.js');
const mems = {};
const reset = () => { list.forEach(m => mems[m.id] = {}); };
reset();
// 與頁面 scheduleMission 相同的資料（cursor：以 d sinθ = pdTarget·λ 或指定 y 放游標）
function ev(st) {
  const s = Object.assign({ mode: 'double', N: 5, lam: 550, white: false, a: 40, d: 120, L: 1, y: null }, st);
  const N = s.mode === 'single' ? 1 : s.mode === 'double' ? 2 : s.N;
  const p = { N, a: s.a * UM, d: s.d * UM, lambda: (s.white ? 550 : s.lam) * NM, L: s.L };
  const pi = SC.patternInfo(p), mm = m => m / MM;
  const data = { mode: s.mode, N, white: s.white, lam: s.white ? NaN : s.lam, a: s.a, d: N > 1 ? s.d : NaN, L: s.L,
    dy: mm(pi.dy), y1: mm(pi.y1), W: mm(pi.W), k: pi.k, nCentral: pi.nCentral, y400: mm(pi.y400), y700: mm(pi.y700), cursor: s.y !== null };
  if (data.cursor) {
    const c = SC.pointInfo(p, s.y, s.white ? SPEC : null);
    Object.assign(data, { y: mm(s.y), theta: c.theta * 180 / Math.PI, pathD: c.pathD / NM, pathA: c.pathA / NM, pd: c.pd, pa: c.pa, I: c.I, R: c.R, G: c.G, B: c.B });
  }
  return { type: 'setup', data };
}
/** 游標位置：程差 pathNm（nm）→ y（m），再四捨五入到像素格（模擬螢幕：顯示範圍 ±zoom mm、寬 PW 像素） */
function yAt(pathNm, d, L, zoom, PW) {
  const s = pathNm * NM / (d * UM);
  let y = L * s / Math.sqrt(1 - s * s);
  if (zoom) { const px = 2 * zoom * MM / PW; y = Math.round(y / px) * px; }
  return y;
}
function passing(st, keep) { const e = ev(st); const out = list.filter(m => m.check(e, mems[m.id])).map(m => m.id); return { e: e.data, out }; }
let bad = 0;
function expect(id, steps, note) {
  reset(); let r;
  steps.forEach(st => { r = passing(st); });
  const ok = r.out.includes(id); if (!ok) bad++;
  const e = r.e;
  console.log((ok ? 'OK  ' : 'FAIL ') + id.padEnd(22), note, '|', ['dy', 'W', 'k', 'nCentral', 'y400', 'y700', 'y', 'pd', 'pathD', 'I'].filter(k => e[k] !== undefined && !Number.isNaN(e[k])).map(k => k + '=' + (typeof e[k] === 'number' ? +e[k].toFixed(4) : e[k])).join(' '), '| also:', r.out.filter(x => x !== id).join(','));
}
function expectNot(id, steps, note) { reset(); let r; steps.forEach(st => { r = passing(st); }); const ok = !r.out.includes(id); if (!ok) bad++; console.log((ok ? 'OK  ' : 'FAIL ') + ('not ' + id).padEnd(26), note); }
// 預設狀態（雙狹縫、550 nm、a 40、d 120、L 1）與切換模式、白光：不應完成任何任務
for (const st of [{}, { mode: 'single' }, { mode: 'grating' }, { white: true }, { mode: 'grating', white: true }, { mode: 'single', white: true }]) {
  reset(); const r = passing(st); console.log('預設', JSON.stringify(st), '→', JSON.stringify(r.out)); if (r.out.length) bad++;
}
expect('slit-interference-1', [{ mode: 'single', a: 10 }], 'a = 10 μm（滑桿）');
expectNot('slit-interference-1', [{ mode: 'single', a: 10, white: true }], '白光不算');
expect('slit-interference-2', [{ lam: 600 }], 'λ = 600 nm（滑桿）');
expect('slit-interference-2', [{ lam: 650, d: 130 }], 'λ = 650、d = 130');
const yW = (path, d) => yAt(path, d, 1, 30, 700);
expect('slit-interference-3', [{ white: true, y: 0 }, { white: true, y: yW(700, 120) }], '白光：游標 0 → d sinθ = 700 nm（y ≈ 5.83 mm）');
expect('slit-interference-3', [{ white: true, y: yW(10, 120) }, { white: true, y: yW(650, 120) }], '白光：游標 → 650 nm');
expectNot('slit-interference-3', [{ white: true, y: yW(700, 120) }], '沒有先放在中央不算');
expectNot('slit-interference-3', [{ white: true, y: 0 }, { white: true, y: yW(600, 120) }], '600 nm 處偏黃不算');
for (let pth = 500; pth <= 900; pth += 20) { reset(); passing({ white: true, y: 0 }); const r = passing({ white: true, y: yW(pth, 120) }); if (r.out.includes('slit-interference-3')) process.stdout.write(pth + ' '); }
console.log(' ← 紅邊可以通過的程差（nm）');
expect('slit-interference-4', [{ a: 30 }], 'a = 30、d = 120');
expect('slit-interference-4', [{ mode: 'grating', a: 25, d: 100, N: 6 }], '光柵 a = 25、d = 100');
expect('slit-interference-5', [{ mode: 'single', lam: 650, a: 32.5 }], 'a = 32.5 μm（打字）、L = 1');
expect('slit-interference-5', [{ mode: 'single', lam: 650, a: 26, L: 0.8 }], 'a = 26、L = 0.80（滑桿）');
expectNot('slit-interference-5', [{ mode: 'single', lam: 650, a: 33 }], 'a = 33 → 19.70 mm');
expect('slit-interference-6', [{ mode: 'grating', white: true, d: 20, L: 2 }], 'd = 20 μm、L = 2.00 m');
expect('slit-interference-6', [{ mode: 'grating', white: true, d: 10, L: 1, a: 5 }], 'd = 10 μm、L = 1.00 m');
expect('slit-interference-7', [{ y: yAt(3 * 550, 120, 1, 30, 700) }], '預設：游標放在第 3 級（缺級）');
expect('slit-interference-7', [{ y: yAt(3.04 * 550, 120, 1, 30, 700) }], '預設：程差 3.04λ 也仍然全暗');
expectNot('slit-interference-7', [{ y: yAt(2 * 550, 120, 1, 30, 700) }], '第 2 級是亮的');
expect('slit-interference-8', [{ mode: 'single', lam: 650, a: 65 }, { mode: 'single', lam: 405, a: 40.5 }], '650 nm a = 65 → 405 nm a = 40.5（打字）');
expect('slit-interference-8', [{ mode: 'single', lam: 650, a: 40, L: 1 }, { mode: 'single', lam: 405, a: 40, L: 1.6 }], '650 nm L = 1 → 405 nm L = 1.60（滑桿）');
expectNot('slit-interference-8', [{ mode: 'single', lam: 650, a: 40 }, { mode: 'single', lam: 550, a: 34 }], '差 100 nm 不夠');
const y9 = yAt(1800, 120, 1, 30, 700);
expect('slit-interference-9', [{ a: 10, lam: 600, y: y9 }, { a: 10, lam: 450, y: y9 }], 'a = 10、d = 120：600 nm 第 3 級 → 450 nm 第 4 級');
expectNot('slit-interference-9', [{ lam: 600, y: y9 }, { lam: 450, y: y9 }], '預設 a = 40（d/a = 3，第 3 級缺級）不算');
const y10 = yAt(5500, 200, 1, 30, 700);
expect('slit-interference-10', [{ a: 5, d: 200, y: y10 }], 'a = 5、d = 200、550 nm');
expectNot('slit-interference-10', [{ a: 40, d: 200, y: y10 }], 'a = 40 時第 10 級缺級');
const y11 = yAt(5 * 650, 200, 2, 50, 700);
expect('slit-interference-11', [{ lam: 650, L: 2, d: 200, a: 40, y: y11 }], '650 nm、L = 2.00、d = 200、a = 40，游標放在 y ≈ 32.5 mm');
expectNot('slit-interference-11', [{ lam: 650, L: 2, d: 200, a: 42, y: y11 }], 'a = 42：d/a 不是整數');
const y12 = yAt(3000, 100, 1, 30, 700);
expect('slit-interference-12', [{ a: 5, d: 100, lam: 750, y: y12 }, { a: 5, d: 100, lam: 600, y: y12 }, { a: 5, d: 100, lam: 500, y: y12 }], 'a = 5、d = 100：750（4 級）→ 600（5 級）→ 500（6 級）');
const y12b = yAt(2400, 120, 1, 30, 700);
expect('slit-interference-12', [{ a: 6, d: 120, lam: 600, y: y12b }, { a: 6, d: 120, lam: 480, y: y12b }, { a: 6, d: 120, lam: 400, y: y12b }], 'a = 6、d = 120：600 → 480 → 400');
expectNot('slit-interference-12', [{ a: 20, d: 100, lam: 750, y: y12 }, { a: 20, d: 100, lam: 600, y: y12 }, { a: 20, d: 100, lam: 500, y: y12 }], 'a = 20 時高級亮紋太暗');
expect('slit-interference-h1', [{ a: 60 }], 'a = 60、d = 120');
expect('slit-interference-h2', [{ mode: 'grating', N: 6, white: true, a: 5, d: 50, y: yAt(1300, 50, 1, 50, 700) }], '光柵 N = 6、a 5、d 50，游標在 d sinθ = 1300 nm');
expect('slit-interference-h2', [{ mode: 'grating', N: 5, white: true, a: 10, d: 40, y: yAt(1200, 40, 1, 50, 700) }], '光柵 N = 5、a 10、d 40，1200 nm');
expectNot('slit-interference-h2', [{ mode: 'grating', N: 6, white: true, a: 5, d: 50, y: yAt(900, 50, 1, 50, 700) }], '只有第 2 級的地方不算');
expect('slit-interference-h3', [{ white: true, a: 5, d: 400, y: yAt(5000, 400, 1, 30, 700) }], 'a = 5、d = 400，游標在 d sinθ = 5 μm（y ≈ 12.5 mm）');
expectNot('slit-interference-h3', [{ white: true, a: 40, d: 120, y: yAt(5000, 120, 1, 50, 700) }], '預設縫寬太寬：高級條紋太暗');
console.log(bad ? '\n有 ' + bad + ' 項不符' : '\n全部符合');
