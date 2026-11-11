---
name: physics-visual-design
description: Visual design standard for every simulation canvas in Astro Ni 物理實驗室 (2D canvas and 3D). Use whenever you create a new module, change how a simulation is drawn, or polish an existing one — physics must stay exact, and the picture must also look refined, have depth, and be a pleasure to watch.
---

# 物理模擬的視覺設計規範

> 站長的要求（2026-11-11）：「就算是 2D 的畫面，圖形的呈現也要更加細緻、有立體感，更加美觀、有設計感。除了兼顧正確的物理，也要兼顧美感以及視覺上的享受。」

優先順序永遠是：**物理正確 → 清楚易讀 → 美觀有質感 → 效能**。
美化不可以改變任何物理量的位置、比例、方向或時間；裝飾效果只能「加在上面」，不能「改掉內容」。

---

## 1. 立體感（2D 畫布也要有深度）

| 物件 | 做法 |
|---|---|
| 球體、粒子、點電荷 | `createRadialGradient`：亮點偏左上（約半徑 30–35% 處），邊緣加深；外加一圈細的亮邊（rim light）。正負電荷用各自的色調，不要純色平塗。 |
| 方塊、車子、板子 | 由上而下的 `createLinearGradient`（上亮下暗 8–15%），頂邊 1 px 高光、底邊 1 px 暗線，圓角 4–8 px。 |
| 接觸地面的物體 | 下方畫柔和的橢圓接觸陰影（radial gradient，透明度 0.15–0.3），物體離地越高陰影越淡、越大。 |
| 浮在背景上的物體 | 輕微投影：`shadowColor` 半透明、`shadowBlur` 6–12、`shadowOffsetY` 2–4。**每一幀大量使用 shadowBlur 很耗效能**，請預先畫成小圖（sprite）重複使用。 |
| 場、波、強度分布 | 用連續色階（漸層、等高色塊）表現強弱，搭配細線（等位線、波前）。暗色背景上的亮場可加極淡的光暈。 |
| 軌道、彈簧、線圈 | 用兩層線條畫出「管狀」：底層較粗較暗，上層較細較亮、略偏上，看起來有圓柱感。彈簧的前後圈可用明暗交替表現纏繞。 |

## 2. 背景與座標

- 背景不要死板的單色：用 `--canvas-bg` 為基底，加非常淡的徑向暈影（中心亮、四角暗 3–6%），或極淡的由上而下漸層。
- 格線分兩級：主格線（每 1 個單位）透明度約 0.10，次格線（每 0.2 個單位）約 0.04；線寬 1 物理像素，座標加 0.5 對齊像素避免糊掉。
- 座標軸、刻度、單位清楚：刻度數字用 `font-variant-numeric: tabular-nums` 的字型設定（canvas 用 `system-ui`），大小 11–13 px。
- 比例尺（例如「1 cm」）放在角落，帶半透明底框。

## 3. 線條、箭頭、標籤

- 所有線條 `lineCap = 'round'`、`lineJoin = 'round'`。
- 向量箭頭：箭身寬度隨畫面大小微調（2–3 px），箭頭為略帶弧度的三角形，箭頭長度約箭身寬度的 4 倍；同一頁所有箭頭幾何一致。顏色用語意色（速度、力、電場各自固定）。
- 軌跡：漸淡的拖尾（越舊越透明、越細），可用分段畫、每段 alpha 遞減；重要的軌跡（例如預測線）用虛線。
- 標籤：放在物體旁，**一定有底**——半透明圓角底框（pill），或 `strokeText` 畫一圈背景色的描邊（halo），確保在任何背景上都看得清楚；不可壓在線條上難以辨識。
- 文字大小跟著字體設定縮放（settings.js 已自動縮放 canvas 的 `ctx.font`），版面要能容納放大 30% 的文字與較長的英文。

## 4. 動態與回饋

- 動畫一律用 `requestAnimationFrame` 與實際經過時間（dt 上限 1/30 s），物理時間與畫面時間的換算要明確（慢動作要標示倍率）。
- 事件要有視覺回饋：碰撞瞬間的短暫閃光或波紋（0.2–0.4 s 淡出）、撞擊點小粒子、達到最大值時的標記點。這些效果不影響物理狀態。
- 介面的過場（展開、切換）可以用緩動（ease-out 150–250 ms）；**物理運動本身絕不加緩動**。
- 尊重 `prefers-reduced-motion`：關掉純裝飾性的動畫（閃光、粒子、背景流動），物理動畫照常但預設暫停。
- 拖曳物體時游標與觸控要有回饋：滑過可拖曳物體時放大 5–10% 或加外框光暈。

## 5. 顏色

- 只用 lab.css 的色彩代號（`--pos`、`--neg`、`--field`、`--probe`、`--accent`…）與各分支色（`--b-mech` 等），由 `getComputedStyle` 讀取，並在 `lab:themechange` 事件後重新讀取、重畫。需要新顏色時，在 lab.css 的淺色與兩個深色區塊同時新增代號，不要在程式裡寫死。
- 漸層與光暈用代號顏色調整明暗或透明度產生（例如 `rgba` 混合），不要另外發明色相。
- 色階（強度、電位、溫度）要「亮度單調」，色盲也能分辨；正負對稱的量用發散型色階（藍－中性－紅）。
- 淺色與深色模式都要好看：深色模式下光暈與發光效果可以稍強，淺色模式下陰影稍強。
- 不只靠顏色傳達資訊：同時用線型（實線／虛線）、形狀、標籤區分。

## 6. 3D 場景（three.js，放在 vendor/three/）

- `MeshStandardMaterial` 或 `MeshPhysicalMaterial`，半球光（HemisphereLight）＋一盞帶陰影的方向光；地面接收柔和陰影。
- 開啟 `antialias`，`renderer.setPixelRatio(Math.min(devicePixelRatio, 2))`。
- 軌跡用漸層顏色或漸淡透明度；向量用 ArrowHelper 或自訂圓錐＋圓柱，顏色與 2D 版一致。
- 相機自動對焦到主要物體，OrbitControls 加 `enableDamping` 讓旋轉有手感。
- 分頁隱藏或切回 2D 時停止繪製並釋放資源。

## 7. 物理誠實（美化不能破壞）

- 位置、長度、角度、時間比例必須與物理計算一致；為了好看而不依比例時，畫面上要標「示意圖（未依比例）」。
- 陰影、光暈不可讓物體看起來比實際大，碰撞判定與繪製邊界要一致。
- 向量長度的比例尺固定且有說明（例如「箭頭長度 ∝ 速度」），不能為了好看任意縮放。

## 8. 效能

- 不變的圖層（背景、格線、場的色階）畫在離屏 canvas，只在參數改變時重算；每一幀只畫動態部分。
- 中階手機每幀繪製預算約 8 ms；`shadowBlur`、大量漸層、`globalCompositeOperation = 'lighter'` 要節制，必要時預先畫成 sprite。
- 畫布尺寸乘以 `devicePixelRatio`（上限 2–3），用 ResizeObserver 跟著容器變化。

## 9. 完成前檢查清單

- [ ] 物理測試全部通過（`for t in tests/*.test.js; do node "$t"; done`）。
- [ ] 截圖並親自看過：手機 390 px 與桌機 1280 px、淺色與深色、繁體／簡體／English、字體「特大」。
- [ ] 前後對照：新畫面比舊畫面更細緻、更有立體感，而且讀數、比例沒有改變。
- [ ] 標籤在任何背景上都清楚，沒有互相重疊或被裁切。
- [ ] 動畫流暢（以 Playwright 量測每幀時間，或在手機模擬下觀察），沒有主控台錯誤。
- [ ] `prefers-reduced-motion` 下沒有多餘的裝飾動畫。
