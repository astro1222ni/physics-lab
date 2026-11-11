/*
 * 產生 js/hans-map.js：繁體 → 簡體的「逐字」對照表，加上手動整理的物理名詞與用語對照。
 * 字元對照取自 OpenCC（Apache-2.0）的 tw → cn 轉換。
 *
 * 執行（只有修改名詞對照或升級 OpenCC 時才需要）：
 *   npm install --no-save opencc-js@1.0.5 && node tools/build-hans.cjs
 */
const fs = require('fs');
const path = require('path');
const OpenCC = require('opencc-js');

// 臺灣用語 → 大陸用語（長的優先比對）。只放確定正確的對照，避免整句轉換的誤判。
const PHRASES = {
  // 物理名詞
  '電位能': '电势能', '電位差': '电势差', '等位線': '等势线', '等位面': '等势面', '電位': '电势',
  '電力線': '电场线', '位能': '势能', '向量': '矢量', '能階': '能级',
  '等速圓周': '匀速圆周', '等速度': '匀速度', '等加速度': '匀加速度', '等速': '匀速',
  '繞射': '衍射', '雷射': '激光', '介電質': '电介质', '電動勢': '电动势',
  '勞侖茲': '洛伦兹', '羅倫茲': '洛伦兹', '司乃耳': '斯涅耳', '冷次': '楞次',
  '克卜勒': '开普勒', '都卜勒': '多普勒', '波耳': '玻尔', '來曼': '莱曼', '克希荷夫': '基尔霍夫',
  '虎克': '胡克', '波以耳': '玻意耳', '迴旋': '回旋', '簡諧': '简谐',
  // 一般用語
  '方程式': '方程式', '程式': '程序', '登入': '登录', '登出': '退出登录', '搜尋': '搜索', '螢幕': '屏幕',
  '游標': '光标', '預設': '默认', '設定': '设置', '資料庫': '数据库', '資料': '数据', '網路': '网络',
  '字型': '字体', '影片': '视频', '滑鼠': '鼠标', '軟體': '软件', '訊息': '信息', '資訊': '信息',
  '檔案': '文件', '帳號': '账号', '暱稱': '昵称', '身分': '身份', '暱': '昵', '檢舉': '举报', '支援': '支持', '列印': '打印', '解析度': '分辨率',
  '公分': '厘米', '公尺': '米', '公斤': '千克',
  '「': '“', '」': '”', '『': '‘', '』': '’'
};

const conv = OpenCC.Converter({ from: 'tw', to: 'cn' });
const pairs = {};
const ranges = [[0x3400, 0x4dbf], [0x4e00, 0x9fff], [0xf900, 0xfaff]];
for (const [a, b] of ranges) {
  for (let c = a; c <= b; c++) {
    const ch = String.fromCharCode(c);
    const s = conv(ch);
    if (s !== ch && [...s].length === 1) pairs[ch] = s;
  }
}
// 確保轉換結果不會再被轉一次（重複套用時結果不變）
for (const k of Object.keys(pairs)) if (pairs[pairs[k]] && pairs[pairs[k]] !== pairs[k]) delete pairs[k];

const chars = Object.keys(pairs).map(k => k + pairs[k]).join('');
const out = '/* 由 tools/build-hans.cjs 產生，請勿手動修改。字元對照取自 OpenCC（Apache-2.0）。 */\n' +
  'window.LAB_HANS = {\n  chars: ' + JSON.stringify(chars) + ',\n  phrases: ' + JSON.stringify(PHRASES, null, 0) + '\n};\n';
fs.writeFileSync(path.join(__dirname, '..', 'js', 'hans-map.js'), out);
console.log('pairs', Object.keys(pairs).length, 'bytes', Buffer.byteLength(out));
