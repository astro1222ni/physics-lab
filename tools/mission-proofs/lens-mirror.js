/* 任務可達成的證明腳本（從製作時的暫存資料夾保存下來的快照）。用法：node tools/mission-proofs/lens-mirror.js
 * 修改物理核心或任務條件後重跑，確認每個任務仍然做得到、預設狀態不會觸發任務。 */
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const LM = require(__ROOT + 'js/lens-mirror-core.js');
const S = (el, f, p, h = 6) => LM.solve(el, f, p, h);
const show = (n, s) => console.log(n, s.element.id, 'f', s.f, 'p', s.p, 'h', s.h, 'q', s.q.toFixed(4), 'm', s.m.toFixed(4), 'h′', (s.hImg||0).toFixed(4), s.real, s.upright, s.size, s.case);
show('1 等大實像', S('convex-lens', 10, 20));
show('2 放大鏡 m≥3', S('convex-lens', 10, 7));
show('3 探照燈', S('concave-mirror', 10, 10));
show('4 凸面鏡 m=0.5', S('convex-mirror', 10, 10));
show('5 投影機', S('convex-lens', 10, 13.33));
show('6a 共軛', S('convex-lens', 10, 15)); show('6b 共軛', S('convex-lens', 10, 30));
show('7a |m|=2 real', S('concave-mirror', 10, 15)); show('7b |m|=2 virtual', S('concave-mirror', 10, 5));
show('8 凹透鏡', S('concave-lens', 8, 24));
show('9 明視距離', S('convex-lens', 6.25, 5));
show('10 完美投影', S('convex-lens', 9, 12, 5));
show('h1 at C', S('concave-mirror', 10, 20));
show('h2 fan |m|>=4', S('convex-lens', 10, 12.5));
show('h3 lens at F', S('convex-lens', 10, 10));
// 精度：只用滑桿刻度（0.5 cm）能否達成 5、9、10？列出所有可達解
const grid = []; for (let f = 5; f <= 20; f += 0.5) for (let p = 1; p <= 45; p += 0.5) grid.push([f, p]);
const c5 = grid.filter(([f, p]) => { const s = S('convex-lens', f, p); return s.real && Math.abs(s.q - 40) <= 0.2 && s.m <= -2; });
console.log('5 slider-grid solutions', c5.length, JSON.stringify(c5.slice(0, 6)));
const c8 = []; for (let f = 5; f <= 20; f += 0.01) for (let p = 1; p <= 45; p += 0.01) { const s = S('concave-lens', +f.toFixed(2), +p.toFixed(2)); if (Math.abs(s.m - 0.25) <= 0.003 && Math.abs(s.q + 6) <= 0.05) { c8.push([+f.toFixed(2), +p.toFixed(2)]); } }
console.log('8 typed solutions (0.01 grid)', c8.length, JSON.stringify(c8.slice(0, 3)), '...');
const c9 = grid.filter(([f, p]) => { const s = S('convex-lens', f, p); return !s.real && Math.abs(s.q + 25) <= 0.1 && Math.abs(s.m - 5) <= 0.02; });
console.log('9 slider-grid solutions (should need typing):', c9.length);
// 6: 確認 D=45 需 f ≤ 11.25
const c6 = grid.filter(([f, p]) => { const s = S('convex-lens', f, p); return s.real && Math.abs(p + s.q - 45) <= 0.2; });
console.log('6 grid pairs by f:', [...new Set(c6.map(x => x[0]))].join(','));
