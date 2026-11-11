> 給替既有實驗補上任務的助手。保留英文原文。

# Adding mission mode (倪的星星) to an EXISTING, already-live module

The module is live and polished. Your job is to add missions WITHOUT changing its physics, visuals or behaviour.

## Read first
- CLAUDE.md (project rules; mission-mode section).
- docs/briefs/missions.md — follow it exactly (8–12 missions over levels 1–10 + 2–3 VERY cryptic hidden missions; prove every mission achievable with the physics core in Node; default state must not trigger anything; Playwright test with the mock backend).
- A finished example of exactly this task (missions added to an existing module): `git show 39a6183 -- electric-field.html js/electric-field.js js/field-core.js js/missions/electric-field.js tests/field-core.test.js`. Other finished mission files: js/missions/collision.js, js/missions/magnetic-particle.js, js/missions/projectile.js.

## Files you may touch (ONLY these)
- <slug>.html — only insert, after js/firebase-config.js and before js/stats.js:
    <script src="js/missions.js" data-module="<slug>"></script>
    <script src="js/missions/<slug>.js"></script>
  (keep the existing ?v= query strings of other tags untouched; add none to the new tags)
- js/<slug>.js — only add `if (window.LabMission) LabMission.emit('<event>', {…})` calls and the minimal bookkeeping they need (e.g. a flag that the user has interacted). No changes to physics, drawing, layout or existing behaviour.
- js/<core>.js (the module's physics core) — ADDITIONS ONLY (new pure helper functions the missions need), with new Node tests appended to the module's existing test file; all existing tests must still pass.
- Create js/missions/<slug>.js.
Do NOT edit js/missions/index.js, index.html, leaderboard.html, js/missions.js, lab.css, CLAUDE.md or any other module. Other agents are editing other modules at the same time.

## Rules
- Missions must be reached by operating the experiment to a specific standard and must teach real physics; low levels easy, high levels genuinely demanding; respect slider ranges and typed precision (data-decimals).
- Never use Unicode superscript digit characters (⁰⁴⁵⁶⁷⁸⁹⁻) in mission texts; write 10^14 style or rephrase.
- Hidden riddles: poetic, must not state or obviously paraphrase the condition.
- Verify: all tests pass (`npm test`); Playwright with mock backend (complete ≥ 3 missions incl. a hidden one; celebration once; repeats give nothing; English mode has no CJK in mission texts; no page errors; the page otherwise behaves exactly as before).
- Serve with `npm run serve` (or let `npm run check -- <slug>` serve itself). Never write test data to the real Firebase database — use tools/mock-backend.js. Scratch only in <系統暫存資料夾>（不要放在專案裡）
- No git commit/push, no tools/stamp.py.

## Report (concise, Traditional Chinese)
Files changed (with what changed), events emitted, mission table (id, level, title, condition, proven solution), hidden riddles, tests, verification, uncertainties.
