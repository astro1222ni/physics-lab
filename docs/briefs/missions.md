# 任務模式（倪的星星）製作說明

> 給製作任務的助手。保留英文原文。

New site-wide requirement from the site owner (add to your module before you finish): MISSION MODE with "倪的星星" (Ni stars).

Read: js/missions.js (header comment), the pilot js/missions/projectile.js, how js/projectile.js calls LabMission.emit('landed', …) inside land(), and the updated section in CLAUDE.md.

Do:
1. Create js/missions/<your-slug>.js calling LabMission.register('<your-slug>', [...]) with about 8–12 missions spread over difficulty levels 1–10 (stars = level; ids '<slug>-1' … '<slug>-N'), each with zh/en title + desc, plus 10 HIDDEN missions (site owner 11/12: every experiment gets ten; ids '<slug>-h1'…'<slug>-h10', hidden: true, levels spread over 3–10 with at least three at 7+, each with real scientific meaning — never 'click N times'; already-live hidden ids, levels and checks never change, new ones continue the numbering; a cryptic poetic riddle in zh/en that only hints, never states the condition; the check should not be obvious from the riddle). Missions must be achieved by operating the experiment to a specific standard (e.g. two settings giving equal results, hitting a target value within a tolerance, discovering a special condition) and teach real physics; low levels easy, high levels genuinely demanding. Use the physics core in Node to PROVE every mission is achievable with the slider ranges/precision (report the solutions you found).
2. In your page script, call `if (window.LabMission) LabMission.emit('<event>', {…all relevant physical quantities…})` at the key moments (e.g. after a run ends, when a measurement is taken, on parameter change if a mission depends on a static configuration — be careful that static-configuration missions can't be satisfied accidentally by the default state; require deliberate action).
3. In your HTML, after js/firebase-config.js and before js/stats.js add:
   <script src="js/missions.js" data-module="<slug>"></script>
   <script src="js/missions/<slug>.js"></script>
   (Do NOT edit js/missions/index.js — the lead adds your module there.)
4. Verify in Playwright with a mock backend: set window.LAB_MISSIONS_BACKEND and window.LAB_COMMENTS_BACKEND via an init script (see the mock in tools/mock-backend.js — it needs missionDefs: pre-seed localStorage 'mdb' missionDefs with your ids → levels, or extend the mock), turn on mission mode, perform at least 3 missions including a hidden one, confirm the celebration appears once and repeats don't award again. English: mission texts in en mode have no CJK.
Report the mission list (id, level, title, condition, and the proven solution) in your final report.

## Saving CPU (site owner, 2026-11-11)
Any Playwright script you write must launch Chromium with `const { launch } = require('G:/physics-lab/tools/browser.cjs'); const browser = await launch();` (same options as chromium.launch). It renders on the Intel iGPU — never the RTX 4070, which is reserved for video — at below-normal priority; plain chromium.launch() falls back to SwiftShader and burns CPU. Still block every non-local request. `npm run check`, `npm run shots`, `npm run verify` already use it.
