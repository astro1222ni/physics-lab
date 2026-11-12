/*
 * 產生 img/qr-site.svg：本站網址的 QR code（首頁「上課工具列」的 QR 按鈕會放大顯示）。
 * 網址改了才需要重做：
 *   npm install --no-save qrcode@1.5.4 && node tools/make-qr.cjs [網址]
 * 預設網址取自 tools/seo.cjs 的 SITE。容錯等級 M，四周留 4 格白邊（QR 規格要求的安靜區）。
 */
const fs = require('fs');
const path = require('path');
const QR = require('qrcode');

const seo = fs.readFileSync(path.join(__dirname, 'seo.cjs'), 'utf8');
const m = seo.match(/const SITE = '([^']+)'/);
const url = process.argv[2] || (m && m[1]);
if (!url) throw new Error('找不到網址：請在指令後面加上網址');

const qr = QR.create(url, { errorCorrectionLevel: 'M' });
const n = qr.modules.size, data = qr.modules.data, M = 4, S = n + 2 * M;
// 同一列連續的黑格合併成一段，檔案比較小
let d = '';
for (let y = 0; y < n; y++) {
  for (let x = 0; x < n; ) {
    if (!data[y * n + x]) { x++; continue; }
    let w = 1;
    while (x + w < n && data[y * n + x + w]) w++;
    d += 'M' + (x + M) + ' ' + (y + M) + 'h' + w + 'v1h-' + w + 'z';
    x += w;
  }
}
const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + S + ' ' + S + '" shape-rendering="crispEdges">' +
  '<rect width="100%" height="100%" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>\n';
fs.writeFileSync(path.join(__dirname, '..', 'img', 'qr-site.svg'), svg);
console.log('img/qr-site.svg：' + url + '（' + n + '×' + n + ' 格，版本 ' + qr.version + '）');
