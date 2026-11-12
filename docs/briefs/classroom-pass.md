# 逐頁整修：試試看、參考資料、鍵盤操作、讀數播報、分享狀態、2D 精修

> 2026-11-12 站長：「自動優化清單……改成你現在就開始做，不要停，每項一步一步把它做完。」
> 共用的部分主工作串已經做好（`js/classroom.js` 由 settings.js 自動載入：投影模式、分享目前設定與 QR code、試試看的顯示與收起；`js/keys.js`：畫布鍵盤操作）。你負責把它們套到指定的幾個實驗頁上。

## 先讀
`CLAUDE.md`、`js/classroom.js`、`js/keys.js` 的開頭說明、`.claude/skills/physics-visual-design/SKILL.md`；要做 2D 精修的另讀 `docs/briefs/visual-polish.md`。

## 每個指定的實驗都要做
1. **試試看**：在 `<div class="lab">` 正前方加一行
   `<p class="try-hint" data-en="Try it: …">試試看：……</p>`
   一句話（中文 40 字內），寫這個實驗**最值得先做的一個動作和要注意看什麼**，用頁面上真實的控制項名稱（例如「把發射角拉到 45°，按『發射』，再改成 30° 和 60° 比比看射程」）。顯示、關閉、只出現一次都由 classroom.js 處理，不要自己寫程式。
2. **參考資料**：在 `.notes` 最後加
   `<h3 data-en="References">參考資料</h3><ul>…</ul>`，內容：
   - 課綱對應：「選修物理Ⅱ・功與能量」這種寫法（冊別＋章名，**不寫第幾章**）。冊別：Ⅰ＝測量與不確定度、直線運動、平面運動、牛頓運動定律、週期運動、萬有引力；Ⅱ＝靜力平衡、動量與角動量、功與能量、碰撞、熱學；Ⅲ＝波動、聲波、幾何光學、物理光學；Ⅳ＝靜電學、電流的磁效應、電磁感應；Ⅴ＝電路學、量子現象、原子結構。章名照首頁該卡片所在的章。
   - 常數與數據：頁面用到的常數寫來源（SI 定義值、CODATA 2022／NIST：https://physics.nist.gov/cuu/Constants/ ）；材料數據（折射率、比熱、功函數等）寫出處。
   - 延伸閱讀 1–2 個可靠連結（例如 OpenStax、HyperPhysics、NASA、NIST）。**只放你實際打開確認過存在、內容相符的網址**；確認不了就不要放。
   英文版：每個 `<li>` 加 `data-en` 或 `data-en-html`。
3. **鍵盤操作**：畫布上有可拖曳的物件時，在頁面程式前載入 `js/keys.js`，用 `LabKeys.attach(canvas, { label, items, onChange })` 讓每個可拖曳物件都能用鍵盤選取、移動（步長合理、Shift 大步、限制與拖曳完全相同、觸發與拖曳相同的任務事件與重畫），並在被選取的物件周圍畫焦點框（`kb.focused() && kb.index() === i` 時，用 `--accent` 色虛線圓角框）。沒有可拖曳物件的畫布：加 `role="img"` 與描述畫面的 `aria-label`（中英文，參數改變時可更新）。
4. **讀數播報**：最重要的結果（例如射程、週期、測得的 g）在**離散事件**時（一次發射結束、按下記錄、改參數後）寫進一個 `aria-live="polite"` 的元素；每格動畫都在變的讀數不要設 aria-live，改用另外的 `.sr-only` 狀態列，至少間隔 1 秒才更新。
5. **分享狀態**：classroom.js 已自動記錄滑桿、選單、勾選框與按下的模式按鈕。如果實驗還有「畫布上拖曳出來的狀態」（電荷位置、大頭針、透鏡位置、軌道控制點……）會影響結果，就呼叫 `LabShare.register({ get: () => 可 JSON 的物件, set: (物件) => { 套用並重畫 } })`，讓分享連結也能還原；`set` 要能處理缺欄位與超出範圍的值。
   - **登記要用佇列寫法**：頁面程式執行時 classroom.js 還沒載入（它在 DOMContentLoaded 之後才由 settings.js 載入），所以寫 `(window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({ get, set })`；classroom.js 載入時會補登記，之後再 push 也會直接登記。分享連結在 load 之後才還原，來得及。不要寫 `if (window.LabShare) LabShare.register(…)`（永遠不會執行）。
   - 音效開關 `#soundBtn` 已自動排除在分享之外，不必再加 `data-share-skip`；一頁有好幾個 `.lab` 時全部都會記錄。
   - 分享只會「按下」模式按鈕，不會把已按下的切換鈕放開；這種切換鈕（例如「反向」）請在 get/set 裡自己記。
6. **2D 精修**（只對指派時標明「要精修」的實驗）：照 `docs/briefs/visual-polish.md`，改用 `js/drawkit.js`（立體球、木塊、陰影、標籤底框、箭頭、格線、背景），深淺色都要細緻、有立體感；**物理量一個都不能變**；修改前後各截圖對照。

## 規則
- 只改指派給你的實驗的 `<slug>.html` 與 `js/<slug>.js`（必要時 `js/<slug>-3d.js`）。不改物理核心、測試、任務定義（除非鍵盤操作需要任務事件，那就照拖曳時的事件呼叫同一個 emit，不改任務條件）、lab.css、index.html、共用 js、tools。需要改共用檔就寫在報告裡。其他助手同時在改別的實驗。
- 不要 git commit／push、不要跑 tools/stamp.py、不要建立或刪除 `.editing`。暫存放你自己的系統暫存資料夾。
- Playwright 一律 `require('G:/physics-lab/tools/browser.cjs').launch()`（Intel 內顯、低優先權），擋掉所有對外連線、用 `tools/mock-backend.js`；這台電腦連得到正式 Firebase，絕不能寫入。不准用 RTX 4070。
- 不可用 Unicode 上下標字元；英文模式不能有中文。

## 驗證（每個實驗）
`npm test`、`node tools/mission-proofs/<slug>.js`（有的話）、`npm run check -- <slug> <slug>`（空格或逗號分開都可以；找不到的頁面會直接報錯）、`npm run shots -- <slug>` 親眼看截圖（試試看那一行在 390 px 不能擠壞版面）；自己寫 Playwright：聚焦畫布、按 Enter 與方向鍵、確認物件真的移動且讀數改變；若有 `LabShare.register`，用 `LabShare.url()` 開新分頁確認還原。

## 報告（繁體中文、精簡）
每個實驗：試試看的句子（中英）、參考資料清單、鍵盤可操作的物件與步長、aria-live 放在哪、有沒有 LabShare.register、（精修的）前後截圖路徑、檢查結果、未解問題。

## 共用檔補充（11/12 更新）

- **英文的動態說明**：程式改 `aria-label` 時用 `LabSettings.t('中文', 'English')`；`settings.js` 套用英文時會用 HTML 裡的 `data-en-aria-label` 蓋掉，所以會被程式改的 `aria-label` 不要寫 `data-en-aria-label`（或改程式時一起更新它）。`npm run check` 現在也檢查英文模式的 `aria-label`、`title`、`placeholder`、`alt` 不可有中文。
- **試試看**的句子可以含 `<sub>`、`<b>`：classroom.js 會先把文字包成一塊，不會被拆成好幾欄。
- **簡體**：「游標尺／游標卡尺」→「游标卡尺」、「震央」→「震中」已加進對照表；其他名詞若被轉錯（例如「游標」會轉成「光标」），寫在報告裡。
