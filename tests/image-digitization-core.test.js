// 以 Node 執行：node tests/image-digitization-core.test.js
'use strict';
const assert = require('assert');
const C = require('../js/image-digitization-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= (eps || 1e-9), (msg || '') + ` 期望 ${b}，得到 ${a}`);
function uniformCount(rgba) { const s = new Set(); for (let k = 0; k < rgba.length; k += 4) s.add(rgba[k] + ',' + rgba[k + 1] + ',' + rgba[k + 2]); return s.size; }

console.log('檔案大小與單位');
test('1920 × 1080 全彩（24 位元）= 6,220,800 B = 6,220.8 KB = 6,075 KiB ≈ 5.93 MiB', () => {
  const f = C.fileSize(1920, 1080, 24);
  assert.strictEqual(f.bits, 49766400);
  assert.strictEqual(f.bytes, 6220800);
  near(f.kB, 6220.8); near(f.KiB, 6075); near(f.MiB, 6220800 / 1048576);
  assert.ok(f.MiB > 5.93 && f.MiB < 5.94);
});
test('位元組 = ⌈位元數 ÷ 8⌉（不滿一個位元組也要占一個）', () => {
  assert.strictEqual(C.fileSize(3, 1, 1).bytes, 1);
  assert.strictEqual(C.fileSize(9, 1, 1).bytes, 2);
  assert.strictEqual(C.fileSize(100, 75, 1).bytes, 938);      // 7500 位元 = 937.5 → 938
  assert.strictEqual(C.fileSize(320, 240, 24).bytes, 230400);
});
test('每像素位元數：灰階 b、彩色 3b；可表示的顏色數 2^bpp', () => {
  assert.strictEqual(C.bppOf('gray', 8), 8);
  assert.strictEqual(C.bppOf('color', 8), 24);
  assert.strictEqual(C.colorsOf('color', 8), 16777216);
  assert.strictEqual(C.colorsOf('color', 1), 8);
  assert.strictEqual(C.colorsOf('gray', 1), 2);
  assert.strictEqual(C.colorsOf('color', 5), 32768);
});
test('剛好 1 KiB（8192 位元）只能用灰階，而且一定要解除 4:3', () => {
  const sols = [];
  for (let w = 1; w <= 320; w++) for (let h = 1; h <= 240; h++) for (const mode of ['gray', 'color']) for (let b = 1; b <= 8; b++) {
    if (w * h * C.bppOf(mode, b) === 8192) sols.push({ w, h, mode, b });
  }
  assert.ok(sols.length > 0);
  assert.ok(sols.every(s => s.mode === 'gray'), '彩色每像素 3b 位元，8192 = 2^13 沒有因數 3');
  assert.ok(sols.every(s => s.h !== C.heightFor(s.w)), '固定 4:3 時做不到');
  assert.ok(sols.some(s => s.w === 32 && s.h === 32 && s.b === 8));
});
test('寬、高 4:3 的換算（四捨五入）', () => {
  assert.strictEqual(C.heightFor(320), 240);
  assert.strictEqual(C.heightFor(64), 48);
  assert.strictEqual(C.heightFor(1), 1);
  assert.strictEqual(C.widthFor(240), 320);
  assert.strictEqual(C.widthFor(150), 200);
});

console.log('量化');
test('8 位元時代碼就是四捨五入的值；1 位元只剩 0 與 255', () => {
  for (let x = 0; x <= 255; x++) assert.strictEqual(C.quantValue(x, 8), x);
  near(C.quantValue(100.4, 8), 100);
  assert.strictEqual(C.quantValue(127.4, 1), 0);
  assert.strictEqual(C.quantValue(127.6, 1), 255);
});
test('b 位元有 2^b 階，相鄰兩階相差 255 ÷ (2^b − 1)，誤差最多半階', () => {
  for (let b = 1; b <= 8; b++) {
    const vals = new Set();
    let maxErr = 0;
    for (let x = 0; x <= 255; x += 0.05) { const v = C.quantValue(x, b); vals.add(v); maxErr = Math.max(maxErr, Math.abs(v - x)); }
    assert.strictEqual(vals.size, Math.pow(2, b), 'b = ' + b);
    const step = 255 / (Math.pow(2, b) - 1);
    assert.ok(maxErr <= step / 2 + 0.5 + 1e-9, 'b = ' + b + ' 最大誤差 ' + maxErr);   // 顯示值再取整數，最多多 0.5
  }
});
test('2、4 位元的代碼放大成 8 位元，等於把位元重複寫（10 → 10101010、1010 → 10101010）', () => {
  for (let q = 0; q < 16; q++) assert.strictEqual(C.binary(C.codeToValue(q, 4), 8), C.binary(q, 4) + C.binary(q, 4));
  for (let q = 0; q < 4; q++) assert.strictEqual(C.binary(C.codeToValue(q, 2), 8), C.binary(q, 2).repeat(4));
  assert.strictEqual(C.codeToValue(2, 2), 170);
  assert.strictEqual(C.codeToValue(10, 4), 170);
});
test('85 與 170 在 2、4、6、8 位元都是一階；2 位元與 8 位元都有的灰（不算 0、255）只有這兩個', () => {
  const levels = b => { const s = new Set(); for (let q = 0; q < (1 << b); q++) s.add(C.codeToValue(q, b)); return s; };
  const L = {}; for (let b = 1; b <= 8; b++) L[b] = levels(b);
  [2, 4, 6, 8].forEach(b => { assert.ok(L[b].has(85) && L[b].has(170), 'b = ' + b); });
  const both = []; for (let v = 1; v < 255; v++) if (L[2].has(v) && L[8].has(v)) both.push(v);
  assert.deepStrictEqual(both, [85, 170]);
  // 8 位元是 85 的像素，換成 2、4、6 位元顯示的還是 85（不論取樣值是 84.5 到 85.5 的哪裡）
  for (let x = 84.5; x < 85.5; x += 0.01) [2, 4, 6, 8].forEach(b => assert.strictEqual(C.quantValue(x, b), 85));
});
test('灰階用 BT.601：Y = 0.299 R + 0.587 G + 0.114 B；黃最亮、藍最暗', () => {
  near(C.luma(255, 255, 255), 255, 1e-9);
  near(C.luma(255, 0, 0), 76.245, 1e-9);
  near(C.luma(0, 255, 0), 149.685, 1e-9);
  near(C.luma(0, 0, 255), 29.07, 1e-9);
  const ys = []; for (let hue = 0; hue < 360; hue++) ys.push(C.luma.apply(null, C.hsv2rgb(hue, 1, 1)));
  assert.strictEqual(ys.indexOf(Math.max.apply(null, ys)), 60);
  assert.strictEqual(ys.indexOf(Math.min.apply(null, ys)), 240);
});

console.log('HSV 色相環');
test('HSV → RGB：紅 0°、綠 120°、藍 240°、黃 60°、青 180°、洋紅 300°；飽和度 0 是白', () => {
  const eq = (a, b) => a.forEach((x, k) => near(x, b[k], 1e-9));
  eq(C.hsv2rgb(0, 1, 1), [255, 0, 0]); eq(C.hsv2rgb(120, 1, 1), [0, 255, 0]); eq(C.hsv2rgb(240, 1, 1), [0, 0, 255]);
  eq(C.hsv2rgb(60, 1, 1), [255, 255, 0]); eq(C.hsv2rgb(180, 1, 1), [0, 255, 255]); eq(C.hsv2rgb(300, 1, 1), [255, 0, 255]);
  eq(C.hsv2rgb(77, 0, 1), [255, 255, 255]);
});
test('V = 1 時最大的色版永遠是 255；色相環彩色 1 位元剛好 8 種顏色（立方體的 8 個角）', () => {
  for (let k = 0; k < 500; k++) { const c = C.hsv2rgb(Math.random() * 360, Math.random(), 1); near(Math.max.apply(null, c), 255, 1e-9); }
  [[8, 6], [64, 48], [320, 240]].forEach(([w, h]) => ['center', 'area'].forEach(m => {
    assert.strictEqual(C.quantize(C.sample('wheel', w, h, m), w, h, 'color', 1).colors, 8, w + '×' + h + ' ' + m);
  }));
});
test('色相環的極座標：右邊是紅（0°）、上面偏右是黃（60°）', () => {
  const p = C.wheelPolar(0.5 + 0.3, 0.5); near(p.hue, 0, 1e-9); near(p.sat, 0.3 / 0.33, 1e-9);
  const q = C.wheelPolar(0.5 + 0.2 * Math.cos(Math.PI / 3), (0.375 - 0.2 * Math.sin(Math.PI / 3)) / 0.75); near(q.hue, 60, 1e-9);
  assert.strictEqual(C.wheelPolar(0.02, 0.02), null);
});

console.log('取樣');
test('整格平均：一整片同色的地方平均後還是那個顏色', () => {
  const s = C.sample('wheel', 40, 30, 'area');
  for (let c = 0; c < 3; c++) near(s[c], C.WHEEL.bg[c], 1e-3);   // 左上角在圓外
});
test('中心點取樣等於原圖在像素中心的顏色', () => {
  ['sunset', 'rings', 'wheel'].forEach(sc => {
    const w = 37, h = 28, s = C.sample(sc, w, h, 'center');
    for (let t = 0; t < 50; t++) {
      const i = Math.floor(Math.random() * w), j = Math.floor(Math.random() * h);
      const p = C.colorAt(sc, (i + 0.5) / w, (j + 0.5) / h);
      for (let c = 0; c < 3; c++) near(s[(j * w + i) * 3 + c], p[c], 1e-3, sc);
    }
  });
});
test('子取樣數：總點數約 26 萬，至少 2 × 2、最多 16 × 16', () => {
  assert.strictEqual(C.subSamples(320, 240), 2);
  assert.strictEqual(C.subSamples(1, 1), 16);
  const s = C.subSamples(64, 48); assert.ok(s * s * 64 * 48 <= 400000 && s * s * 64 * 48 >= 150000);
});

console.log('棋盤：取樣定理與混疊');
test('棋盤的整數取樣與浮點取樣在不靠近格線的點一致', () => {
  for (let t = 0; t < 2000; t++) {
    const w = 1 + Math.floor(Math.random() * 320), h = 1 + Math.floor(Math.random() * 240);
    const i = Math.floor(Math.random() * w), j = Math.floor(Math.random() * h);
    const u = (i + 0.5) / w, v = (j + 0.5) / h;
    const fu = u * 24 + 0.5, fv = v * 18 + 0.5;
    if (Math.abs(fu - Math.round(fu)) < 1e-6 || Math.abs(fv - Math.round(fv)) < 1e-6) continue;
    const g = ((C.checkerCol(i, w) + C.checkerRow(j, h)) % 2 === 0) ? 255 : 0;
    assert.strictEqual(g, C.checkerAt(u, v));
  }
});
test('12 × 9 取中心點：每個點都落在白格上，整片變成白色（取樣頻率等於棋盤頻率 → 混疊成 0 頻）', () => {
  const q = C.quantize(C.sample('checker', 12, 9, 'center'), 12, 9, 'gray', 8);
  assert.strictEqual(q.colors, 1); assert.strictEqual(q.rgba[0], 255);
});
test('12 × 9 整格平均：每格剛好半黑半白，整片是 50% 灰（127.5 → 128）', () => {
  const s = C.sample('checker', 12, 9, 'area');
  for (let k = 0; k < s.length; k++) near(s[k], 127.5, 1e-9);
  assert.strictEqual(C.quantize(s, 12, 9, 'gray', 8).rgba[0], 128);
});
test('至少 100 個像素時，取中心點會變成一整片同色的只有 12 × 9', () => {
  // 顏色 = (欄號 + 列號) 的奇偶，所以整片同色 ⇔ 每一欄中心的欄號奇偶都一樣，而且每一列也一樣
  const same = (n, f) => { const p = f(0) % 2; for (let k = 1; k < n; k++) if (f(k) % 2 !== p) return false; return true; };
  const colOK = [], rowOK = [];
  for (let w = 1; w <= 320; w++) colOK[w] = same(w, i => C.checkerCol(i, w));
  for (let h = 1; h <= 240; h++) rowOK[h] = same(h, j => C.checkerRow(j, h));
  const sols = [];
  for (let w = 1; w <= 320; w++) for (let h = 1; h <= 240; h++) if (w * h >= 100 && colOK[w] && rowOK[h]) sols.push(w + '×' + h);
  assert.deepStrictEqual(sols, ['12×9']);
  // 抽查：這個判斷和真的取樣結果一致
  [[12, 9], [13, 9], [24, 18], [6, 9], [12, 3]].forEach(([w, h]) => {
    const q = C.quantize(C.sample('checker', w, h, 'center'), w, h, 'gray', 1);
    assert.strictEqual(q.colors === 1, colOK[w] && rowOK[h], w + '×' + h);
  });
});
test('48 × 36 起（每格 2 × 2 個像素）兩種取樣都和原圖一模一樣；1 位元灰階就沒有誤差', () => {
  [[48, 36], [96, 72], [240, 180]].forEach(([w, h]) => {
    assert.ok(C.checkerFaithful(w, h));
    ['center', 'area'].forEach(m => {
      const s = C.sample('checker', w, h, m);
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        // 整個像素都在同一格：四個角往內一點的顏色都和中心相同
        const e = 1e-7, us = [i / w + e, (i + 1) / w - e], vs = [j / h + e, (j + 1) / h - e];
        const g = C.checkerAt((i + 0.5) / w, (j + 0.5) / h);
        us.forEach(u => vs.forEach(v => assert.strictEqual(C.checkerAt(u, v), g)));
        near(s[(j * w + i) * 3], g, 1e-9, w + '×' + h + ' ' + m);
      }
      const q = C.quantize(s, w, h, 'gray', 1);
      near(q.err, 0, 1e-9);
    });
  });
  assert.ok(!C.checkerFaithful(24, 18));
  assert.ok(!C.checkerFaithful(47, 36));
  const q = C.quantize(C.sample('checker', 24, 18, 'area'), 24, 18, 'gray', 8);
  assert.ok(q.err > 0 || uniformCount(q.rgba) > 2, '24 × 18 時像素跨在格線上，不會一模一樣');
});
test('方波平均的積分公式與數值積分一致', () => {
  for (let t = 0; t < 200; t++) {
    const a = Math.random(), b = a + Math.random() * 0.2;
    let s = 0; const n = 4000;
    for (let k = 0; k < n; k++) { const x = a + (b - a) * (k + 0.5) / n; s += (Math.floor(x * 24 + 0.5) % 2 === 0) ? 1 : -1; }
    near(C.sqAvg(a, b, 24), s / n, 2e-3);
  }
});

console.log('同心圓：奈奎斯特範圍與假圓圈');
test('奈奎斯特範圍：寬 256 時剛好碰到左右兩邊；320 × 240 時蓋住整個畫面', () => {
  near(C.nyquistBox(256, 192).hx, 0.5);
  const b = C.nyquistBox(320, 240); assert.ok(b.hx >= 0.5 && b.hy >= 0.375);
});
test('寬 128 取中心點：離中心 64 格的地方出現一模一樣（亮暗相反）的第二個圓心——就在畫面左右邊上', () => {
  const w = 128, h = 96, s = C.sample('rings', w, h, 'center');
  for (let j = 0; j < h; j++) for (let i = 64; i < w; i++) near(s[(j * w + i) * 3] + s[(j * w + i - 64) * 3], 255, 1e-3);
  // 寬 127 時就不是
  const w2 = 127, h2 = 95, s2 = C.sample('rings', w2, h2, 'center');
  let dev = 0; for (let j = 0; j < h2; j++) for (let i = 64; i < w2; i++) dev = Math.max(dev, Math.abs(s2[(j * w2 + i) * 3] + s2[(j * w2 + i - 64) * 3] - 255));
  assert.ok(dev > 50);
});
test('同心圓的局部條紋頻率 = K r（數值微分檢查）', () => {
  [0.1, 0.2, 0.4].forEach(r => {
    const ph = x => Math.PI * C.RING_K * x * x;
    const f = (ph(r + 1e-6) - ph(r - 1e-6)) / 2e-6 / (2 * Math.PI);
    near(f, C.RING_K * r, 1e-3);
  });
});

console.log('視力表');
test('E 的 5 × 5 筆畫格：每個 E 的墨水面積 = 邊長² × 17/25（3 橫 + 1 豎，扣掉重疊）', () => {
  C.EROWS.forEach(r => r.rects.forEach(rs => {
    const a = rs.reduce((s, q) => s + (q[2] - q[0]) * (q[3] - q[1]), 0);
    near(a, r.e * r.e * 17 / 25, 1e-9);
  }));
});
test('中心點取樣的整數判斷與浮點判斷一致', () => {
  for (let t = 0; t < 3000; t++) {
    const w = 1 + Math.floor(Math.random() * 320), h = 1 + Math.floor(Math.random() * 240);
    const i = Math.floor(Math.random() * w), j = Math.floor(Math.random() * h);
    const X = 4000 * (i + 0.5) / w, Y = 3000 * (j + 0.5) / h;
    if (Math.abs(X * 4 - Math.round(X * 4)) < 1e-6 || Math.abs(Y * 4 - Math.round(Y * 4)) < 1e-6) continue;   // 可能剛好在邊上
    assert.strictEqual(C.eyeInkCenter(i, j, w, h), C.eyeInkAt(X, Y));
  }
});
test('200 × 150 時前 4 列每一筆都剛好對齊像素：兩種取樣都只有純黑純白；而且只有這個解析度做得到 3 列以上', () => {
  assert.strictEqual(C.eyeRowsExact(200, 150), 4);
  ['center', 'area'].forEach(m => {
    const s = C.sample('eyechart', 200, 150, m);
    const bottom = (C.EROWS[3].y0 + C.EROWS[3].e) / 3000 * 150;
    for (let j = 0; j < bottom; j++) for (let i = 0; i < 200; i++) { const g = s[(j * 200 + i) * 3]; assert.ok(g === 0 || g === 255, m + ' ' + i + ',' + j + ' = ' + g); }
  });
  for (let w = 1; w <= 320; w++) for (let h = 1; h <= 240; h++) if (C.eyeRowsExact(w, h) >= 3) assert.ok(w === 200 && h === 150);
});
test('筆畫寬（像素）= 邊長 ÷ 5 × 寬 ÷ 4000；第 3 列在寬 100 時剛好 1 像素', () => {
  near(C.eyeStrokePx(2, 100), 1); near(C.eyeStrokePx(3, 200), 1); near(C.eyeStrokePx(0, 320), 12.8);
});

console.log('山景日落：色帶');
test('彩色、320 × 240：量測線上 8 位元沒有色帶、7 位元有（解析度越高，越需要更多位元）', () => {
  const s = C.sample('sunset', 320, 240, 'center');
  const r8 = C.skyBand(s, 320, 240, 'color', 8), r7 = C.skyBand(s, 320, 240, 'color', 7);
  assert.ok(r8.rows >= 140);
  assert.strictEqual(r8.band, 1); assert.ok(r7.band > 1); assert.strictEqual(r8.bandPrev, r7.band);
  const s2 = C.sample('sunset', 160, 120, 'center');
  assert.strictEqual(C.skyBand(s2, 160, 120, 'color', 7).band, 1);
  assert.ok(C.skyBand(s2, 160, 120, 'color', 6).band > 1);
});
test('位元越少，色帶越寬（最長色帶隨 b 不增加）', () => {
  [[64, 48], [200, 150]].forEach(([w, h]) => {
    const s = C.sample('sunset', w, h, 'area');
    let prev = Infinity;
    for (let b = 1; b <= 8; b++) { const r = C.skyBand(s, w, h, 'color', b); assert.ok(r.band <= prev + 1, b + ': ' + r.band); prev = r.band; }
  });
});
test('量測線上的天空不碰到山和太陽', () => {
  for (let k = 0; k <= 20; k++) {
    const u = 0.9 + 0.04 * k / 20;
    assert.ok(C.ridgeFar(u) > 0.6 && C.ridgeNear(u) > 0.7);
  }
  assert.ok(C.skyLimit(0.9, 0.95) > 0.6);
});

console.log('量化的統計');
test('量化後用到的顏色數不超過 2^bpp，也不超過像素數；誤差不超過半階', () => {
  C.SCENES.forEach(sc => [[16, 12], [80, 60]].forEach(([w, h]) => ['gray', 'color'].forEach(mode => [1, 3, 8].forEach(b => {
    const q = C.quantize(C.sample(sc, w, h, 'area'), w, h, mode, b);
    assert.ok(q.colors <= Math.min(C.colorsOf(mode, b), w * h));
    assert.ok(q.err <= 255 / (Math.pow(2, b) - 1) / 2 + 0.5);
    assert.strictEqual(uniformCount(q.rgba), q.colors);
  }))));
});
test('原圖點陣：大小正確、不透明', () => {
  C.SCENES.forEach(sc => { const r = C.raster(sc, 40, 30); assert.strictEqual(r.length, 40 * 30 * 4); for (let k = 3; k < r.length; k += 4) assert.strictEqual(r[k], 255); });
});

console.log(`\n${passed} 項通過` + (process.exitCode ? '，有失敗' : ''));
