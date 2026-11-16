/*
 * modegate.js — 實驗模式／學習模式分開的入口（站長 11/16）
 *
 * 站長原話：「我覺得實驗模式與學習模式還是要分開，在不同的頁面跟介面。……當我們點進去這個等電位的實驗的時候，
 * 它會先出現一個很乾淨的畫面。直視的話，就是上下分列：一個是實驗模式，另外一個則是學習模式。……如果是橫式的話，就是左右分列。
 * ……你點實驗模式，那它就是原本我們那些實驗的狀態跟模式。如果你點到另外一個是學習模式的話，就會有學生的自學，還有老師的上課模式。」
 * 「同一個實驗的實驗模式跟學習模式的星星數是統一計算，但是要賺取星星，要各自到這兩個不同的界面去賺取。」
 *
 * 網址約定（每個實驗都一樣）：
 *   代號.html                       入口選擇畫面（實驗模式｜學習模式）
 *   代號.html?mode=lab              實驗模式：原本的實驗，沒有範例鈕、沒有「學習說明」側板；#s= 分享設定、?embed=1 嵌入也直接進實驗模式
 *   代號.html?ex=N                  範例屬於學習模式：轉到 ?mode=learn&study=1&seg=6&ex=N
 *   代號.html?mode=learn            學習模式選單（學生自學｜老師上課）
 *   代號.html?mode=learn&study=1    學生自學（各實驗的自學程式讀 study=1，可加 &seg=N&step=M）
 *   代號.html?mode=learn&study=1&class=1  老師上課（一進來就開上課模式）
 * 結果寫在 <html data-lab-mode="choose|lab|learn">：
 *   - js/missions.js 依此分開判定：實驗模式只算一般與隱藏任務，學習模式只算自學任務（study: true），入口畫面都不算。
 *   - 實驗模式藏起頁面裡標 data-learn-entry 的元素（原本的「🎓 自學模式」入口），lab.css 另外藏起範例鈕 .ex-bar 與學習說明側板 .lp-*。
 *
 * 用法：在 <head> 的 settings.js 後面放
 *   <script src="js/modegate.js?v=…" data-lab="實驗模式重點｜…" data-lab-en="…|…" data-learn="學習模式重點｜…" data-learn-en="…|…"></script>
 *   重點用「｜」（英文用 |）分隔，每點一行。要在 <head> 同步載入：任務判定前就要知道模式。
 */
(function () {
  'use strict';
  if (window.LabModeGate) return;
  const me = document.currentScript;
  const S = window.LabSettings;
  const T = function (zh, en) { return S ? S.t(zh, en) : zh; };
  const q = new URLSearchParams(location.search);
  let mode = q.get('mode');
  // 範例屬於學習模式（站長 11/16：「實驗模式不會有範例，實驗模式也不會有學習說明的側版」）：
  // 分享出去的 ?ex=N 改進學習模式的範例段；明寫 ?mode=lab 的就把 ex 拿掉，留在實驗模式
  if (q.has('ex') && q.get('study') !== '1') {
    if (mode !== 'lab') {
      const u = new URL(location.href); const n = q.get('ex');
      ['mode', 'study', 'class', 'seg', 'step', 'ex'].forEach(function (k) { u.searchParams.delete(k); });
      u.searchParams.set('mode', 'learn'); u.searchParams.set('study', '1'); u.searchParams.set('seg', '6'); u.searchParams.set('ex', n);
      location.replace(u.href); return;
    }
    q.delete('ex'); const u = new URL(location.href); u.searchParams.delete('ex'); history.replaceState(null, '', u.href);
  }
  if (q.get('study') === '1') mode = 'learn';
  else if (mode !== 'lab' && mode !== 'learn') {
    // 分享設定、嵌入：別人給的連結是要直接看實驗
    mode = (/(^|[#&])s=/.test(location.hash.slice(1)) || q.get('embed') === '1') ? 'lab' : 'choose';
  }
  const studying = mode === 'learn' && q.get('study') === '1';
  const html = document.documentElement;
  html.setAttribute('data-lab-mode', mode);
  if (mode === 'choose' || (mode === 'learn' && !studying)) html.classList.add('mg-open');

  const attr = function (n) { return (me && me.getAttribute(n)) || ''; };
  const points = function (zh, en) {
    const a = T(attr(zh), attr(en));
    return a ? a.split(/[｜|]/).map(function (s) { return s.trim(); }).filter(Boolean) : [];
  };
  /** 同一頁、換模式的網址：保留語言等其他參數，拿掉模式相關的 */
  function url(params) {
    const u = new URL(location.href);
    ['mode', 'study', 'class', 'seg', 'step', 'ex'].forEach(function (k) { u.searchParams.delete(k); });
    Object.keys(params || {}).forEach(function (k) { u.searchParams.set(k, params[k]); });
    u.hash = '';
    return u.pathname.split('/').pop() + u.search;
  }

  const ICON = {
    lab: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M19 6h10M21 6v13L10 38a4 4 0 0 0 3.5 6h21a4 4 0 0 0 3.5-6L27 19V6" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/><path d="M14.5 32h19" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle cx="21" cy="37" r="2" fill="currentColor"/><circle cx="28" cy="38.5" r="1.5" fill="currentColor"/></svg>',
    learn: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M4 18 24 9l20 9-20 9Z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M12 22v10c0 3 5.5 6 12 6s12-3 12-6V22M44 18v12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    student: '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="14" r="7" fill="none" stroke="currentColor" stroke-width="3"/><path d="M10 42c1.5-9 7-14 14-14s12.5 5 14 14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
    teacher: '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="5" y="6" width="38" height="24" rx="2.5" fill="none" stroke="currentColor" stroke-width="3"/><path d="M12 16h14M12 22h20M24 30v6M16 42l8-6 8 6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };

  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function card(kind, href, title, list, go, stars) {
    const a = el('a', 'mg-card mg-' + kind); a.href = href;
    const ic = el('span', 'mg-icon'); ic.innerHTML = ICON[kind]; a.appendChild(ic);
    const body = el('span', 'mg-body');
    body.appendChild(el('span', 'mg-name', title));
    if (list.length) { const ul = el('ul', 'mg-points'); list.forEach(function (t) { ul.appendChild(el('li', null, t)); }); body.appendChild(ul); }
    if (stars) { const s = el('span', 'mg-stars', stars); s.setAttribute('data-mg-stars', kind); body.appendChild(s); }
    body.appendChild(el('span', 'mg-go', go));
    a.appendChild(body);
    return a;
  }

  /** 入口或學習模式選單（蓋住整頁、自己捲動） */
  function gate() {
    const h1 = document.querySelector('header h1, h1');
    const name = h1 ? h1.textContent.trim() : document.title;
    const box = el('div', 'mg-gate'); box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'mg-title');
    const inner = el('div', 'mg-in');
    const top = el('div', 'mg-top');
    const crumbs = document.querySelectorAll('header .crumbs a');
    const back = el('a', 'mg-back');
    if (mode === 'learn') { back.href = url(); back.textContent = T('← 選擇模式', '← Choose a mode'); }
    else { const c = crumbs[crumbs.length > 1 ? 1 : 0]; back.href = c ? c.getAttribute('href') : 'index.html'; back.textContent = '← ' + (c ? c.textContent.trim() : T('首頁', 'Home')); }
    top.appendChild(back);
    inner.appendChild(top);
    inner.appendChild(el('p', 'mg-kicker', mode === 'learn' ? T('學習模式', 'Learning mode') : T('選擇模式', 'Choose a mode')));
    const t = el('h2', 'mg-title', name); t.id = 'mg-title'; inner.appendChild(t);
    const cards = el('div', 'mg-cards');
    if (mode === 'learn') {
      cards.appendChild(card('student', url({ mode: 'learn', study: '1' }), T('學生自學', 'Student self-study'), [
        T('八段自學：先預測，再動手量，最後和理論比對', 'Eight sections: predict, measure, then compare with theory'),
        T('步驟指引會指出要按哪顆鈕；進度記在這台裝置', 'Step guides point to the button to press; progress is saved on this device'),
        T('完成段落與條件就得自學星星', 'Finish sections and conditions to earn self-study stars')
      ], T('開始自學 →', 'Start →'), T('★ 自學任務的星星在這裡賺', '★ Self-study stars are earned here')));
      cards.appendChild(card('teacher', url({ mode: 'learn', study: '1', class: '1' }), T('老師上課', 'Teacher: class mode'), [
        T('大字投影給全班看，方向鍵翻頁', 'Large type for the projector; arrow keys turn pages'),
        T('預測題先讓大家選，再按「公布答案」；可以舉手計票', 'Let everyone choose, then reveal the answer; count raised hands'),
        T('上課時不改學生自己的進度', 'Class mode does not change a student’s own progress')
      ], T('開始上課 →', 'Start class →'), ''));
    } else {
      cards.appendChild(card('lab', url({ mode: 'lab' }), T('實驗模式', 'Lab mode'), points('data-lab', 'data-lab-en'), T('進入實驗 →', 'Open the lab →'), T('★ 一般任務、隱藏任務的星星在這裡賺', '★ Mission and hidden-mission stars are earned here')));
      cards.appendChild(card('learn', url({ mode: 'learn' }), T('學習模式', 'Learning mode'), points('data-learn', 'data-learn-en'), T('學生自學／老師上課 →', 'Self-study / class mode →'), T('★ 自學任務的星星在這裡賺', '★ Self-study stars are earned here')));
    }
    inner.appendChild(cards);
    inner.appendChild(el('p', 'mg-foot', T('兩種模式的星星合計在同一個實驗；之後隨時可以從頁面上方換模式。', 'Stars from both modes add up for this lab; switch modes any time from the top of the page.')));
    box.appendChild(inner);
    document.body.appendChild(box);
    starsSoon();
  }

  /** 實驗頁上方的模式列：現在是哪個模式＋換到另一個 */
  function bar() {
    const head = document.querySelector('header.top') || document.querySelector('header');
    const nav = el('nav', 'mg-bar'); nav.setAttribute('aria-label', T('模式', 'Mode'));
    const cur = el('span', 'mg-cur');
    cur.innerHTML = ICON[mode === 'lab' ? 'lab' : (q.get('class') === '1' ? 'teacher' : 'student')];
    cur.appendChild(document.createTextNode(mode === 'lab' ? T('實驗模式', 'Lab mode') : (q.get('class') === '1' ? T('學習模式・老師上課', 'Learning mode · class') : T('學習模式・學生自學', 'Learning mode · self-study'))));
    nav.appendChild(cur);
    const sw = el('a', 'mg-switch', mode === 'lab' ? T('換到學習模式 →', 'Switch to Learning mode →') : T('換到實驗模式 →', 'Switch to Lab mode →'));
    sw.href = mode === 'lab' ? url({ mode: 'learn' }) : url({ mode: 'lab' });
    nav.appendChild(sw);
    const home = el('a', 'mg-home', T('選擇模式', 'Choose a mode')); home.href = url(); nav.appendChild(home);
    if (head && head.parentNode) head.parentNode.insertBefore(nav, head.nextSibling); else document.body.insertBefore(nav, document.body.firstChild);
  }

  /** 卡片上的星星進度（登入後才有）：這個實驗各模式已得／全部 */
  function starsNow() {
    const M = window.LabMission; if (!M || !M._state) return;
    const st = M._state, slugEl = document.querySelector('script[data-module]');
    const list = ((M.all() || {})[slugEl ? slugEl.getAttribute('data-module') : st.module] || []);
    if (!list.length) return;
    const sum = function (f) {
      const xs = list.filter(f);
      return [xs.reduce(function (a, m) { return a + (st.done && st.done[m.id] ? (st.done[m.id].stars || 0) : 0); }, 0), xs.length];
    };
    const lab = sum(function (m) { return !m.study; }), learn = sum(function (m) { return m.study; });
    document.querySelectorAll('[data-mg-stars]').forEach(function (s) {
      const k = s.getAttribute('data-mg-stars'), v = k === 'lab' ? lab : learn;
      if (!v[1]) return;
      const done = list.filter(function (m) { return (k === 'lab' ? !m.study : m.study) && st.done && st.done[m.id]; }).length;
      s.textContent = (k === 'lab' ? T('★ 一般＋隱藏任務 ', '★ Missions ') : T('★ 自學任務 ', '★ Self-study ')) + done + ' / ' + v[1] + T(' 個・已得 ', ' done · ') + v[0] + T(' 顆星', ' stars');
    });
  }
  function starsSoon() {
    let n = 0; const id = setInterval(function () { starsNow(); if (++n > 20 || !document.querySelector('.mg-gate')) clearInterval(id); }, 600);
    ['ready', 'synced'].forEach(function (ev) { try { window.LabMission && LabMission.on(ev, starsNow); } catch (e) { /* 任務程式還沒載入 */ } });
  }

  function start() {
    if (html.classList.contains('mg-open')) gate();
    else bar();
    if (mode === 'lab') document.querySelectorAll('[data-learn-entry]').forEach(function (e) { e.hidden = true; });
  }
  window.LabModeGate = { mode: mode, studying: studying, classMode: q.get('class') === '1', url: url };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
