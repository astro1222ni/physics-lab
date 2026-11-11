# Astro Ni 物理實驗室

純前端的高中物理互動模擬。所有運算都在觀眾的瀏覽器中進行，不需伺服器、不呼叫任何 AI API。

由 GitHub Pages 免費託管，網址為
`https://astro1222ni.github.io/physics-lab/`

## 結構

| 檔案 | 用途 |
| --- | --- |
| `index.html` | 實驗室首頁，依物理分支分類（力學、熱學、波動與聲音、光學、電磁學、近代物理） |
| `<模組>.html` | 各模組頁面：`electric-field`、`projectile`、`collision`、`slit-interference`、`magnetic-particle` |
| `js/<模組>-core.js` | 各模組的物理核心（純計算，與畫面無關；電場模組為 `field-core.js`） |
| `js/<模組>.js` | 各模組的繪圖與互動 |
| `js/firebase-config.js` | Firebase 設定（資料庫網址、登入用的網頁設定） |
| `js/stats.js` | 瀏覽人次、操作次數、累計操作時間 |
| `js/math.js` | 以 KaTeX 排版頁面中 `\( … \)`、`\[ … \]` 標記的公式 |
| `lab.css` | 共用樣式（含深色模式） |
| `vendor/katex/` | KaTeX 0.16.9（MIT 授權），內建於網站中，不依賴外部 CDN |
| `tests/` | 物理核心的單元測試 |

## 測試

```sh
for t in tests/*.test.js; do node "$t"; done
```

測試內容包括：點電荷公式、疊加原理、E = −∇V、電力線起訖、等位線形狀，以及試探電荷運動時力學能守恆。

## 新增模組的原則

1. 物理計算放在獨立的 `js/*-core.js`，先寫測試（解析解、極限情況、守恆量）。
2. 畫面程式只負責繪圖與互動。
3. 不使用建置工具；直接用瀏覽器開啟或任何靜態網站託管即可運作。
4. 公式一律用 KaTeX 書寫（`\( … \)` 行內、`\[ … \]` 獨立一行），不要用 Unicode 組合字元（例如向量箭頭 U+20D7），部分裝置字型缺字會顯示成方框。
5. 新模組完成後，在 `index.html` 對應的物理分支中，把卡片從「規劃中」改為連結並標示「已上線」。

## 統計（瀏覽人次、操作次數、累計操作時間）

`js/stats.js` 只累計匿名數字，不收集個人資料，資料存放於 Firebase Realtime Database（免費 Spark 方案）。

- 模組頁面：`<script src="js/stats.js" data-module="模組代號"></script>`，在標題下方顯示該模組的數字。
- 首頁：`<script src="js/stats.js" data-summary></script>`，顯示全站累計；卡片加上 `data-module="模組代號"` 會顯示該模組的數字。
- 計算方式：每載入一次頁面瀏覽人次 +1；拖曳畫布、放開滑桿、按按鈕、切換勾選各算一次操作；頁面在前景且最近 30 秒內有操作時才計時。
- 資料庫網址填在 `js/firebase-config.js` 的 `databaseURL`；留空時統計停用、頁面照常運作。
- 資料庫安全規則在 `firebase/database.rules.json`：任何人只能讀取統計、只能「增加」數字，且每次增加有上限，無法竄改或清除。

## 齒輪設定（語言、字體大小、外觀）

`js/settings.js` 放在每頁 `<head>`（緊接在 `<meta charset>` 之後，不加 `defer`），設定存在瀏覽器 localStorage。

- **简体中文**：載入 `js/hans-map.js`，將頁面文字、之後更新的文字與畫布文字轉為簡體，並套用物理名詞對照（電位→电势、向量→矢量、勞侖茲→洛伦兹…）。
  對照表由 `tools/build-hans.cjs` 產生（字元取自 OpenCC），要增修名詞對照請改該檔的 `PHRASES` 後重新執行。
- **English**：元素加上 `data-en`、`data-en-html`（含公式）、`data-en-placeholder`、`data-en-aria-label`；整頁翻譯完成後在 `<body>` 加 `data-en-ready`，否則會顯示「尚未翻譯」提示。程式中的字串用 `LabSettings.t('中文', 'English')`。
- **字體大小**：CSS 一律寫成 `font-size: calc(14px * var(--fs, 1))`；畫布文字會自動縮放。
- **外觀**：切換時發出 `lab:themechange` 事件，各模組收到後重新讀取顏色並重畫。
