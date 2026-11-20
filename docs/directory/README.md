# 各科目錄（分支 → 章 → 實驗）

每科一個目錄檔，檔名沿用分科計分代號。科目頁網址由 `js/missions/index.js` 的 `LAB_SUBJECTS.page` 指定。原八科的目錄檔為 `phy.json`、`chem.json`、`bio.json`、`earth.json`、`math.json`、`info.json`、`geog.json`、`music.json`。

| 新科目 | 目錄 | 科目頁 |
| --- | --- | --- |
| 公民與社會（Civics and Society） | [civ.json](civ.json) | [civics.html](../../civics.html) |
| 健康與護理（Health and Nursing） | [health.json](health.json) | [health.html](../../health.html) |
| 體育（Physical Education） | [pe.json](pe.json) | [physical-education.html](../../physical-education.html) |
| 美術（Visual Arts） | [art.json](art.json) | [visual-arts.html](../../visual-arts.html) |

- 列的是**已上線＋規劃中**的全部實驗。
- 每科自己的科目頁顯示已上線卡片；還沒有實驗的章顯示「製作中」。首頁只放科目入口、最新上架與推薦。
- 改了目錄就跑 `node tools/apply-directory.cjs`（`--check` 只檢查不寫檔）：
  - 依目錄重建各科目頁每個分支的章目錄；科目頁尚未建立時略過；
  - 依目錄重排章節區與卡片。
- 接著跑 `npm run seo`：會一起更新 `js/catalog.js` 與 `js/chapter-map.js`（章制霸用）。
- 科目頁名由 `js/missions/index.js` 的 `LAB_SUBJECTS.page` 決定，`dom` 保留舊科目錨點，`group` 決定首頁分類。`npm run seo` 也產生搜尋索引、首頁數字、最新上架和舊錨點轉址。
- 實驗頁新增或整併後跑 `node tools/fix-crumbs.cjs`，導覽維持「首頁 / 科目 / 分支 / 章」；`--check` 已納入 verify。
- `tools/split-home.cjs` 只供這次搬遷使用，完成後不可再次執行。新增科目要建立自己的科目頁，並從 `LAB_SUBJECT_GROUPS.soon` 移除該科目。

```json
{
  "subject": "chem",
  "updated": "11/12 22:30",
  "branches": [
    {
      "id": "matter", "zh": "物質與結構", "en": "Matter and Structure",
      "chapters": [
        { "id": "ch-atoms", "zh": "原子結構與週期表", "en": "Atomic Structure and the Periodic Table",
          "modules": ["periodic-trends", "flame-test"] }
      ]
    }
  ]
}
```

## 規則

1. **不可改的代號**
   - 分支 `id` 不改：任務、成就 `branch-<id>`、首頁錨點都用它。
   - 已經有實驗上線的章，`id` 不改。
   - 還沒有實驗的章可以改名、合併、拆開、換順序。
2. **每個實驗只出現一次**：已上線的實驗不可換分支，因為任務清單的 `LAB_MODULE_BRANCH` 依賴它。
3. **順序**：分支、章、章裡的實驗，都照高中課綱的學習順序排，不照製作順序。
4. **每章大小**：2–8 個實驗為宜，超過就拆章；只有一章的分支，科目頁不顯示章目錄（例如以前的熱學）。
5. **章名**：不寫「第幾章」，臺灣用語。

工具的安全檢查（有錯就不寫檔）：
- 科目頁每張已上線的卡片都要在目錄裡；
- 已上線的章不可消失；
- 章 id 全站不重複。
