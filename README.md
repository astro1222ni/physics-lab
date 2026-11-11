# Astro Ni 物理實驗室

純前端的高中物理互動模擬。所有運算都在觀眾的瀏覽器中進行，不需伺服器、不呼叫任何 AI API。

由 GitHub Pages 免費託管，網址為
`https://astro1222ni.github.io/physics-lab/`

## 結構

| 檔案 | 用途 |
| --- | --- |
| `index.html` | 實驗室首頁（模組列表） |
| `electric-field.html` | 模組：電場與等位線 |
| `js/field-core.js` | 靜電場物理核心（純計算，與畫面無關） |
| `js/electric-field.js` | 該模組的繪圖與互動 |
| `lab.css` | 共用樣式（含深色模式） |
| `tests/` | 物理核心的單元測試 |

## 測試

```sh
node tests/field-core.test.js
```

測試內容包括：點電荷公式、疊加原理、E = −∇V、電力線起訖、等位線形狀，以及試探電荷運動時力學能守恆。

## 新增模組的原則

1. 物理計算放在獨立的 `js/*-core.js`，先寫測試（解析解、極限情況、守恆量）。
2. 畫面程式只負責繪圖與互動。
3. 不使用建置工具；直接用瀏覽器開啟或任何靜態網站託管即可運作。
