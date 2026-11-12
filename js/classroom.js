/*
 * classroom.js — 上課好用的共用工具（由 js/settings.js 自動載入，每一頁都有，不必在 HTML 加標籤）
 *
 * 1. 投影模式：實驗頁上方工具列「投影」→ 全螢幕＋放大字、收起留言與頁尾；再按一次或 Esc 離開。
 * 2. 分享目前設定：「分享」→ 把實驗區的滑桿、選單、勾選框、模式按鈕寫進網址 #s=…，
 *    打開這個網址就還原同樣的設定；附 QR code（vendor/qrcode/qrcode.js，按下分享時才載入），可放大投影給全班掃描。
 *    畫布上拖曳的物件等額外狀態：模組可呼叫 LabShare.register({ get: () => 物件, set: (物件) => {} })。
 *    還原期間 LabShare.restoring = true，任務（missions.js）不會因為還原而被判定完成。
 * 3. 試試看：頁面上的 <p class="try-hint" data-en="Try it: …">試試看：…</p>，第一次打開時出現，
 *    可關閉；學生動手操作後自動收起；每頁只出現一次（localStorage 'lab-try:<代號>'）。
 * 4. 首頁：.site-qr（本站網址 QR）點一下放大，方便投影讓全班掃描。
 * 5. 數據表（table.data／.runs／.rec／.picks／.hist／.log／.pts，或加 data-export 屬性；說明區除外，data-export="no" 不加）下方自動加「下載 CSV」（UTF-8 BOM，Excel 開中文不亂碼）與「複製表格」（貼進試算表）。
 * 6. 分享視窗另有 LINE、Google Classroom、嵌入網頁（iframe，網址加 ?embed=1：只留實驗本身，由 settings.js 加上 html.lab-embed）。
 * 7. 相關實驗：實驗頁捲到說明區附近時載入 js/catalog.js，在說明區後面列出 3 個相關實驗（同章 → 同分支 → 首頁相鄰），頁尾加「最後更新」日期。
 * 8. 列印：深色模式自動換成淺色再印（畫布也重畫），頁首多一行班級、座號、姓名、日期的空格（不儲存）。
 */
(function () {
  'use strict';
  const S = window.LabSettings;
  const T = function (zh, en) { return S ? S.t(zh, en) : zh; };
  const ver = (((document.currentScript || {}).src || '').match(/\?v=\d+/) || [''])[0];
  const slugEl = document.querySelector('script[data-module]');
  const SLUG = slugEl ? slugEl.getAttribute('data-module') : (location.pathname.split('/').pop() || 'index').replace(/\.html$/, '') || 'index';
  const store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 私密瀏覽：照常運作，只是不記得 */ } }
  };

  const ICON = {
    projector: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="1.6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 16v3M8 21h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    share: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="2"/><rect x="14" y="3" width="7" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="2"/><rect x="3" y="14" width="7" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="2"/><path d="M14 14h3v3h-3zM18 18h3v3h-3zM18 14h3M14 18v3" stroke="currentColor" stroke-width="2"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>'
  };

  /* ---------------- QR code（延遲載入程式庫） ---------------- */
  let qrLib = null;
  function loadQR() {
    if (window.qrcode) return Promise.resolve(window.qrcode);
    if (qrLib) return qrLib;
    qrLib = new Promise(function (resolve, reject) {
      const s = document.createElement('script');
      s.src = 'vendor/qrcode/qrcode.js' + ver;
      s.onload = function () { resolve(window.qrcode); };
      s.onerror = reject;
      document.head.appendChild(s);
    });
    return qrLib;
  }
  // 產生 QR 的 SVG（黑白、四格留白，任何主題都掃得到）
  function qrSvg(text) {
    return loadQR().then(function (qrcode) {
      const q = qrcode(0, 'M');
      q.addData(text, 'Byte');
      q.make();
      const n = q.getModuleCount(), m = 4, size = n + m * 2;
      let d = '';
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += 'M' + (c + m) + ' ' + (r + m) + 'h1v1h-1z';
      return '<svg viewBox="0 0 ' + size + ' ' + size + '" shape-rendering="crispEdges" role="img" aria-label="' +
        T('QR code：', 'QR code: ') + text.replace(/"/g, '&quot;') + '"><rect width="100%" height="100%" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>';
    });
  }

  /* ---------------- 大 QR（投影給全班掃描） ---------------- */
  function bigQR(text, caption) {
    const box = document.createElement('div');
    box.className = 'lab-bigqr';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', T('放大的 QR code', 'Enlarged QR code'));
    box.innerHTML = '<div class="lab-bigqr-card"><div class="lab-bigqr-code"></div><p class="lab-bigqr-cap"></p>' +
      '<p class="lab-bigqr-url"></p><button type="button" class="lab-tool lab-bigqr-close">' + ICON.close + '<span>' + T('關閉', 'Close') + '</span></button></div>';
    box.querySelector('.lab-bigqr-cap').textContent = caption;
    box.querySelector('.lab-bigqr-url').textContent = text.length > 90 ? text.slice(0, 86) + '…' : text;
    document.body.appendChild(box);
    const prev = document.activeElement;
    function close() { box.remove(); document.removeEventListener('keydown', onKey); if (prev && prev.focus) prev.focus(); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    box.addEventListener('click', function (e) { if (e.target === box || e.target.closest('.lab-bigqr-close')) close(); });
    box.querySelector('.lab-bigqr-close').focus();
    qrSvg(text).then(function (svg) { box.querySelector('.lab-bigqr-code').innerHTML = svg; })
      .catch(function () { box.querySelector('.lab-bigqr-code').textContent = T('QR code 載入失敗', 'Could not load the QR code'); });
  }

  /* ---------------- 首頁：本站 QR ---------------- */
  function initSiteQR() {
    document.querySelectorAll('.site-qr').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        bigQR(el.getAttribute('data-url') || location.href.split('#')[0],
          T('用手機相機掃描，開啟 Astro Ni 物理實驗室', 'Scan with a phone camera to open Astro Ni Physics Lab'));
      });
    });
  }

  /* ---------------- 分享目前設定 ---------------- */
  const extras = [];
  const share = window.LabShare = {
    restoring: false,
    register: function (h) { if (h && typeof h.get === 'function' && typeof h.set === 'function' && extras.indexOf(h) < 0) extras.push(h); },
    url: function (withState) { return location.origin + location.pathname + (withState === false ? '' : '#s=' + encode(capture())); },
    capture: capture,
    restore: restore
  };
  // 頁面程式比 classroom.js 早執行：頁面先寫 (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({ get, set })，
  // 這裡補登記；之後再 push 的也直接登記（分享連結在 load 之後才還原，來得及）
  if (Array.isArray(window.LAB_SHARE_EXTRAS)) window.LAB_SHARE_EXTRAS.forEach(share.register);
  window.LAB_SHARE_EXTRAS = { push: function () { Array.prototype.forEach.call(arguments, share.register); } };
  document.dispatchEvent(new Event('lab:shareready'));
  // 一頁可能有好幾個 .lab（例如上下兩個實驗區），全部都要記
  function labRoots() { const l = document.querySelectorAll('.lab'); return l.length ? Array.prototype.slice.call(l) : [document.querySelector('main') || document.body]; }
  // 音效開關是個人偏好，不放進分享連結
  function skip(el) { return el.closest('.lab-share, .lab-settings, .ms-panel, .ms-overlay, .comments, #comments, #soundBtn, [data-share-skip]'); }
  // 模式按鈕的穩定代號：有 id 用 id；否則用第一個 data-* 屬性（必要時加上群組的 id）
  function btnKey(b) {
    if (b.id) return '#' + b.id;
    const a = Array.prototype.find.call(b.attributes, function (x) { return /^data-/.test(x.name) && x.name !== 'data-en' && !/^data-en-/.test(x.name); });
    if (!a) return null;
    const sel = 'button[' + a.name + '="' + a.value.replace(/"/g, '\\"') + '"]';
    const g = b.parentElement && b.parentElement.closest('[id]');
    const full = (g && g !== document.body ? '#' + g.id + ' ' : '') + sel;
    return document.querySelectorAll(full).length === 1 ? full : (document.querySelectorAll(sel).length === 1 ? sel : null);
  }
  function capture() {
    const st = { i: {}, b: [] };
    labRoots().forEach(function (root) { root.querySelectorAll('input[id], select[id], textarea[id]').forEach(function (el) {
      if (skip(el) || /^(hidden|file|password|search|button|submit)$/.test(el.type)) return;
      if (el.type === 'checkbox' || el.type === 'radio') st.i[el.id] = el.checked ? 1 : 0;
      else if (el.type === 'range' && window.LabNum) st.i[el.id] = +LabNum.value(el);
      else st.i[el.id] = el.value;
    });
    root.querySelectorAll('button[aria-pressed="true"], [role="tab"][aria-selected="true"], [role="radio"][aria-checked="true"]').forEach(function (b) {
      if (skip(b)) return;
      const k = btnKey(b);
      if (k && st.b.indexOf(k) < 0) st.b.push(k);
    }); });
    if (extras.length) st.x = extras.map(function (h) { try { return h.get(); } catch (e) { return null; } });
    return st;
  }
  function encode(st) {
    const json = JSON.stringify(st);
    return btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function decode(code) {
    const b = code.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(escape(atob(b + '==='.slice((b.length + 3) % 4)))));
  }
  function fire(el) {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function pressButtons(list) {
    (list || []).forEach(function (k) {
      let b = null;
      try { b = document.querySelector(k); } catch (e) { b = null; }
      if (!b || b.disabled) return;
      const on = b.getAttribute('aria-pressed') === 'true' || b.getAttribute('aria-selected') === 'true' || b.getAttribute('aria-checked') === 'true';
      if (!on) b.click();
    });
  }
  function restore(st) {
    share.restoring = true;
    try {
      pressButtons(st.b);
      Object.keys(st.i || {}).forEach(function (id) {
        const el = document.getElementById(id);
        if (!el || skip(el)) return;
        const v = st.i[id];
        if (el.type === 'checkbox' || el.type === 'radio') { if (el.checked !== !!v) { el.checked = !!v; fire(el); } }
        else if (el.type === 'range' && window.LabNum) LabNum.set(el, +v);
        else if (String(el.value) !== String(v)) { el.value = v; fire(el); }
      });
      pressButtons(st.b); // 有些模式按鈕會重設滑桿，再確認一次
      if (st.x) st.x.forEach(function (v, i) { if (extras[i] && v != null) { try { extras[i].set(v); } catch (e) { /* 忽略單一模組的錯誤 */ } } });
    } finally {
      setTimeout(function () { share.restoring = false; }, 1500);
    }
  }
  function restoreFromHash() {
    const m = /^#s=([\w-]+)/.exec(window.LAB_SHARE_HASH || location.hash);
    if (!m) return;
    let st = null;
    try { st = decode(m[1]); } catch (e) { st = null; }
    if (!st) return;
    restore(st);
    const note = document.createElement('p');
    note.className = 'lab-restored';
    note.setAttribute('role', 'status');
    note.textContent = T('已套用分享連結裡的設定。', 'Loaded the settings from the shared link.');
    const lab = document.querySelector('.lab');
    if (lab) { lab.parentNode.insertBefore(note, lab); setTimeout(function () { note.classList.add('out'); }, 4000); setTimeout(function () { note.remove(); }, 4800); }
  }

  // 複製輸入框的文字到剪貼簿；瀏覽器不准時，至少選取好讓使用者自己按複製
  function copyText(text, field) {
    if (field) field.select();
    const legacy = function () {
      let tmp = null;
      if (!field) { // 沒有輸入框時，暫時放一個看不見的文字框來複製
        tmp = document.createElement('textarea');
        tmp.value = text; tmp.setAttribute('readonly', ''); tmp.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
        document.body.appendChild(tmp); tmp.select();
      }
      try { return document.execCommand('copy'); } catch (x) { return false; } finally { if (tmp) tmp.remove(); }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return legacy(); });
    return Promise.resolve(legacy());
  }
  function copyFrom(b, field, label) {
    copyText(field.value, field).then(function (ok) {
      if (!ok) return;
      b.textContent = T('已複製', 'Copied');
      setTimeout(function () { b.textContent = label; }, 1600);
    });
  }

  function openShare(btn) {
    const dlg = document.createElement('div');
    dlg.className = 'lab-share';
    dlg.setAttribute('role', 'dialog');
    dlg.setAttribute('aria-modal', 'true');
    dlg.setAttribute('aria-labelledby', 'lab-share-title');
    dlg.innerHTML =
      '<div class="lab-share-card">' +
      '<div class="lab-share-head"><strong id="lab-share-title">' + T('分享這個實驗', 'Share this experiment') + '</strong>' +
      '<button type="button" class="lab-share-x" aria-label="' + T('關閉', 'Close') + '">' + ICON.close + '</button></div>' +
      '<label class="lab-share-opt"><input type="checkbox" checked> <span>' + T('包含目前的設定（滑桿、模式）', 'Include the current settings (sliders, modes)') + '</span></label>' +
      '<div class="lab-share-row"><input class="lab-share-url" type="text" readonly aria-label="' + T('分享網址', 'Link to share') + '">' +
      '<button type="button" class="lab-tool lab-share-copy">' + T('複製', 'Copy') + '</button></div>' +
      '<button type="button" class="lab-share-qr" aria-label="' + T('放大 QR code（投影給全班掃描）', 'Enlarge the QR code (to project for the class)') + '"></button>' +
      '<p class="lab-share-tip">' + T('點 QR code 可以放大投影，學生用手機相機掃描就會打開同樣的設定。', 'Tap the QR code to enlarge it for projection; students scan it with a phone camera to open the same setup.') + '</p>' +
      '<div class="lab-share-to" role="group" aria-label="' + T('傳給學生', 'Send to students') + '">' +
      '<a class="lab-tool" data-to="line" target="_blank" rel="noopener">LINE</a>' +
      '<a class="lab-tool" data-to="classroom" target="_blank" rel="noopener">Google Classroom</a>' +
      '<button type="button" class="lab-tool" data-to="embed" aria-expanded="false">' + T('嵌入網頁', 'Embed') + '</button></div>' +
      '<div class="lab-share-embed" hidden><textarea class="lab-share-code" readonly rows="3" aria-label="' + T('嵌入用的程式碼', 'Embed code') + '"></textarea>' +
      '<button type="button" class="lab-tool lab-share-copy2">' + T('複製程式碼', 'Copy code') + '</button>' +
      '<p class="lab-share-tip">' + T('貼進學校網站、Google 協作平台或 Moodle 等網頁的 HTML，就會顯示只有實驗本身的精簡版。', 'Paste into the HTML of a school site, Google Sites, Moodle and so on to show a compact version with just the experiment.') + '</p></div>' +
      '</div>';
    document.body.appendChild(dlg);
    const opt = dlg.querySelector('.lab-share-opt input');
    const url = dlg.querySelector('.lab-share-url');
    const qr = dlg.querySelector('.lab-share-qr');
    const code = dlg.querySelector('.lab-share-code');
    function refresh() {
      url.value = share.url(opt.checked);
      const enc = encodeURIComponent(url.value);
      dlg.querySelector('[data-to="line"]').href = 'https://social-plugins.line.me/lineit/share?url=' + enc;
      dlg.querySelector('[data-to="classroom"]').href = 'https://classroom.google.com/share?url=' + enc;
      const h1 = document.querySelector('h1');
      const title = (h1 ? h1.textContent.trim() : document.title).replace(/"/g, '&quot;');
      const src = url.value.replace(/(#|$)/, '?embed=1$1');
      code.value = '<iframe src="' + src + '" title="' + title + '" width="100%" height="720" style="border:0;max-width:100%" allow="fullscreen" loading="lazy"></iframe>';
      qr.innerHTML = '';
      qrSvg(url.value).then(function (svg) { qr.innerHTML = svg; })
        .catch(function () { qr.textContent = T('QR code 載入失敗', 'Could not load the QR code'); });
    }
    refresh();
    opt.addEventListener('change', refresh);
    function close() { dlg.remove(); document.removeEventListener('keydown', onKey); if (btn) btn.focus(); }
    function onKey(e) { if (e.key === 'Escape' && !document.querySelector('.lab-bigqr')) close(); }
    document.addEventListener('keydown', onKey);
    dlg.addEventListener('click', function (e) { if (e.target === dlg) close(); });
    dlg.querySelector('.lab-share-x').addEventListener('click', close);
    qr.addEventListener('click', function () { bigQR(url.value, T('用手機相機掃描，打開同樣的實驗設定', 'Scan with a phone camera to open the same setup')); });
    dlg.querySelector('.lab-share-copy').addEventListener('click', function (e) { copyFrom(e.currentTarget, url, T('複製', 'Copy')); });
    dlg.querySelector('.lab-share-copy2').addEventListener('click', function (e) { copyFrom(e.currentTarget, code, T('複製程式碼', 'Copy code')); });
    const emb = dlg.querySelector('[data-to="embed"]');
    emb.addEventListener('click', function () {
      const box = dlg.querySelector('.lab-share-embed');
      box.hidden = !box.hidden;
      emb.setAttribute('aria-expanded', String(!box.hidden));
      if (!box.hidden) code.select();
    });
    opt.focus();
  }

  /* ---------------- 投影模式 ---------------- */
  let projOn = false, fsBefore = null;
  function setProjector(on, btn) {
    if (on === projOn) return;
    projOn = on;
    const html = document.documentElement;
    html.classList.toggle('lab-projector', on);
    if (on) {
      fsBefore = html.style.getPropertyValue('--fs');
      const cur = parseFloat(fsBefore || getComputedStyle(html).getPropertyValue('--fs')) || 1;
      html.style.setProperty('--fs', String(Math.min(1.8, Math.max(1.3, cur * 1.25))));
      if (html.requestFullscreen && !document.fullscreenElement) html.requestFullscreen().catch(function () { /* 不支援全螢幕時照樣放大字 */ });
    } else {
      if (fsBefore) html.style.setProperty('--fs', fsBefore); else html.style.removeProperty('--fs');
      if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () {});
    }
    if (btn) btn.setAttribute('aria-pressed', String(on));
    window.dispatchEvent(new Event('resize'));
    window.dispatchEvent(new Event('lab:themechange'));
    setTimeout(function () { window.dispatchEvent(new Event('resize')); }, 350); // 全螢幕切換完成後再算一次畫布大小
  }

  function initLabTools() {
    const lab = document.querySelector('.lab');
    if (!lab || document.querySelector('.lab-tools')) return;
    const bar = document.createElement('div');
    bar.className = 'lab-tools';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', T('上課工具', 'Classroom tools'));
    bar.innerHTML =
      '<button type="button" class="lab-tool" data-tool="projector" aria-pressed="false" title="' + T('全螢幕、放大字，適合投影（Esc 離開）', 'Full screen with larger text for projection (Esc to exit)') + '">' + ICON.projector + '<span>' + T('投影', 'Project') + '</span></button>' +
      '<button type="button" class="lab-tool" data-tool="share" title="' + T('產生分享網址與 QR code（可包含目前設定）', 'Get a link and QR code (can include the current settings)') + '">' + ICON.share + '<span>' + T('分享', 'Share') + '</span></button>';
    if (document.documentElement.classList.contains('lab-embed')) {
      const full = document.createElement('a');
      full.className = 'lab-tool';
      full.target = '_blank';
      full.rel = 'noopener';
      full.textContent = T('開啟完整版', 'Open full page');
      full.addEventListener('click', function () { full.href = share.url(true); });
      full.href = location.origin + location.pathname;
      bar.appendChild(full);
    }
    lab.parentNode.insertBefore(bar, lab);
    const pBtn = bar.querySelector('[data-tool="projector"]');
    pBtn.addEventListener('click', function () { setProjector(!projOn, pBtn); });
    bar.querySelector('[data-tool="share"]').addEventListener('click', function (e) { openShare(e.currentTarget); });
    document.addEventListener('fullscreenchange', function () { if (!document.fullscreenElement && projOn) setProjector(false, pBtn); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && projOn && !document.fullscreenElement && !document.querySelector('.lab-share, .lab-bigqr')) setProjector(false, pBtn);
    });
  }

  /* ---------------- 試試看 ---------------- */
  function initTryHint() {
    const hint = document.querySelector('.try-hint');
    if (!hint) return;
    const key = 'lab-try:' + SLUG;
    if (store.get(key)) { hint.remove(); return; }
    hint.setAttribute('role', 'note');
    // 提示是一列 flex：文字（含 <sub>、<b>）先包成一塊，才不會被拆成好幾欄
    if (!hint.querySelector(':scope > .try-hint-text')) {
      const txt = document.createElement('span');
      txt.className = 'try-hint-text';
      while (hint.firstChild) txt.appendChild(hint.firstChild);
      hint.appendChild(txt);
    }
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'try-hint-x';
    x.setAttribute('aria-label', T('知道了，關閉提示', 'Got it — close the tip'));
    x.innerHTML = ICON.close;
    hint.appendChild(x);
    hint.classList.add('show');
    function done() { store.set(key, '1'); hint.classList.add('out'); setTimeout(function () { hint.remove(); }, 450); }
    x.addEventListener('click', done);
    const lab = document.querySelector('.lab');
    if (lab) {
      const onUse = function (e) {
        if (!e.isTrusted || hint.contains(e.target)) return;
        lab.removeEventListener('input', onUse, true);
        lab.removeEventListener('pointerdown', onUse, true);
        store.set(key, '1');
        setTimeout(done, 2500); // 動手之後讓提示多停一下再收起
      };
      lab.addEventListener('input', onUse, true);
      lab.addEventListener('pointerdown', onUse, true);
    }
  }

  /* ---------------- 數據表：下載 CSV、複製到試算表 ---------------- */
  // 表格裡的公式（KaTeX）改用 TeX 原文、上下標寫成 ^、_，刪除鈕等按鈕不輸出
  function cellText(td) {
    const c = td.cloneNode(true);
    c.querySelectorAll('.katex').forEach(function (k) {
      const a = k.querySelector('annotation');
      k.replaceWith(document.createTextNode(a ? a.textContent : k.textContent));
    });
    c.querySelectorAll('button, .sr-only, [aria-hidden="true"]').forEach(function (e) { e.remove(); });
    c.querySelectorAll('sup').forEach(function (s) { s.textContent = '^' + s.textContent; });
    c.querySelectorAll('sub').forEach(function (s) { s.textContent = '_' + s.textContent; });
    return c.textContent.replace(/\s+/g, ' ').trim();
  }
  function tableRows(tb) {
    const rows = [];
    tb.querySelectorAll('tr').forEach(function (tr) {
      if (tr.closest('table') !== tb) return;
      const cells = Array.prototype.map.call(tr.children, cellText);
      if (cells.some(function (x) { return x !== ''; })) rows.push(cells);
    });
    return rows;
  }
  function hasData(tb) { return tb.querySelectorAll('tbody tr td, tr td').length > 0; }
  function stamp() {
    const d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
  }
  function initTableExport() {
    const tables = Array.prototype.slice.call(document.querySelectorAll('table.data, table.runs, table.rec, table.picks, table.hist, table.log, table.pts, table[data-export]')).filter(function (t) { return t.getAttribute('data-export') !== 'no' && !t.closest('.notes, .comments, #comments'); });
    tables.forEach(function (tb, i) {
      const host = tb.closest('.tablewrap') || tb;
      if (host.nextElementSibling && host.nextElementSibling.classList.contains('lab-export')) return;
      const bar = document.createElement('div');
      bar.className = 'lab-export';
      bar.setAttribute('data-share-skip', '');
      bar.innerHTML =
        '<button type="button" class="lab-tool lab-export-csv" title="' + T('下載成 CSV 檔，可用 Excel、Google 試算表開啟', 'Download as a CSV file for Excel or Google Sheets') + '">' + T('下載 CSV', 'Download CSV') + '</button>' +
        '<button type="button" class="lab-tool lab-export-copy" title="' + T('複製後可直接貼進試算表', 'Copy, then paste straight into a spreadsheet') + '">' + T('複製表格', 'Copy table') + '</button>' +
        '<span class="lab-export-msg" role="status" aria-live="polite"></span>';
      host.parentNode.insertBefore(bar, host.nextSibling);
      const msg = bar.querySelector('.lab-export-msg');
      const say = function (t) { msg.textContent = t; clearTimeout(say.t); say.t = setTimeout(function () { msg.textContent = ''; }, 2500); };
      const sync = function () {
        const on = hasData(tb);
        bar.hidden = tb.hidden || host.hidden; // 表格藏起來時（例如還沒開始記錄），按鈕也藏起來
        bar.querySelectorAll('button').forEach(function (b) { b.disabled = !on; });
      };
      sync();
      if ('MutationObserver' in window) new MutationObserver(sync).observe(host, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
      bar.querySelector('.lab-export-csv').addEventListener('click', function () {
        const rows = tableRows(tb);
        if (rows.length < 2) { say(T('表格還沒有數據。', 'The table has no data yet.')); return; }
        const csv = rows.map(function (r) {
          return r.map(function (x) { return /[",\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; }).join(',');
        }).join('\r\n');
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }); // 開頭加 BOM，Excel 開中文才不會亂碼
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = SLUG + (tables.length > 1 ? '-' + (tb.id || i + 1) : '') + '-' + stamp() + '.csv';
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        say(T('已下載 ', 'Downloaded ') + (rows.length - 1) + T(' 筆數據。', ' rows.'));
      });
      bar.querySelector('.lab-export-copy').addEventListener('click', function () {
        const rows = tableRows(tb);
        if (rows.length < 2) { say(T('表格還沒有數據。', 'The table has no data yet.')); return; }
        const tsv = rows.map(function (r) { return r.join('\t'); }).join('\n');
        copyText(tsv).then(function (ok) {
          say(ok ? T('已複製，可以貼進試算表。', 'Copied — paste it into a spreadsheet.') : T('瀏覽器不允許複製，請改用「下載 CSV」。', 'The browser blocked copying — use Download CSV instead.'));
        });
      });
    });
  }

  /* ---------------- 相關實驗（每個實驗頁底部；目錄 js/catalog.js 由 tools/build-catalog.cjs 從首頁產生） ---------------- */
  function loadOnce(src, test) {
    if (test()) return Promise.resolve();
    return new Promise(function (resolve) {
      const s = document.createElement('script');
      s.src = src + ver; s.onload = s.onerror = function () { resolve(); };
      document.body.appendChild(s);
    });
  }
  function pickRelated(cat, me) {
    const i = cat.findIndex(function (x) { return x.s === me.s; });
    const out = [];
    const add = function (x) { if (x && x.s !== me.s && out.indexOf(x) < 0 && out.length < 3) out.push(x); };
    cat.filter(function (x) { return x.c === me.c; }).forEach(add);              // 同一章
    // 同一分支：離本實驗在首頁上的位置越近越優先
    cat.filter(function (x) { return x.b === me.b; })
      .sort(function (a, b) { return Math.abs(cat.indexOf(a) - i) - Math.abs(cat.indexOf(b) - i); }).forEach(add);
    for (let k = 1; out.length < 3 && k < cat.length; k++) { add(cat[i + k]); add(cat[i - k]); } // 首頁上前後相鄰
    return out;
  }
  function renderRelated() {
    const cat = window.LAB_CATALOG || [];
    const me = cat.find(function (x) { return x.s === SLUG; });
    const notes = document.querySelector('.notes');
    if (!me || !notes || document.querySelector('.related')) return;
    // 頁尾：這個實驗最後更新的日期
    const foot = document.querySelector('footer.site');
    if (foot && me.u && !foot.querySelector('.updated')) {
      const u = document.createElement('span');
      u.className = 'updated';
      u.textContent = T('　這個實驗最後更新：', ' · Last updated: ') + me.u.replace(/-/g, '/');
      (foot.querySelector('p') || foot).appendChild(u);
    }
    const rel = pickRelated(cat, me);
    if (!rel.length) return;
    const sec = document.createElement('section');
    sec.className = 'related';
    sec.setAttribute('aria-labelledby', 'related-h');
    const h = document.createElement('h2');
    h.id = 'related-h';
    h.textContent = T('相關實驗', 'Related experiments');
    const grid = document.createElement('div');
    grid.className = 'modules';
    rel.forEach(function (x) {
      const a = document.createElement('a');
      a.className = 'module live';
      a.href = x.s + '.html';
      a.style.setProperty('--c', 'var(--b-' + x.b + ')');
      const img = document.createElement('img');
      img.className = 'module-thumb';
      img.setAttribute('data-thumb', x.s);
      img.alt = ''; img.width = 720; img.height = 405; img.loading = 'lazy'; img.decoding = 'async';
      const tag = document.createElement('span');
      tag.className = 'related-tag';
      tag.textContent = (x.d === 'earth' ? T('地球科學・', 'Earth Science · ') : '') + T(x.bzh, x.ben || x.bzh) + (x.czh && x.czh !== x.bzh ? T('・' + x.czh, ' · ' + (x.cen || x.czh)) : '');
      const t = document.createElement('h3');
      t.textContent = T(x.zh, x.en || x.zh);
      const p = document.createElement('p');
      p.textContent = T(x.dzh, x.den || x.dzh);
      a.appendChild(img); a.appendChild(tag); a.appendChild(t); a.appendChild(p);
      grid.appendChild(a);
    });
    sec.appendChild(h);
    sec.appendChild(grid);
    notes.parentNode.insertBefore(sec, notes.nextSibling);
    // 縮圖：沿用首頁的 thumbs.js（依語言與深淺色挑圖）
    if (window.LabThumbs) window.LabThumbs.apply(); else loadOnce('js/thumbs.js', function () { return false; });
  }
  function initRelated() {
    if (!slugEl || document.documentElement.classList.contains('lab-embed')) return;
    const notes = document.querySelector('.notes');
    if (!notes) return;
    const go = function () { loadOnce('js/catalog.js', function () { return !!window.LAB_CATALOG; }).then(renderRelated); };
    if (!('IntersectionObserver' in window)) { go(); return; }
    const io = new IntersectionObserver(function (es) {
      if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); go(); }
    }, { rootMargin: '800px 0px' });
    io.observe(notes);
  }

  /* ---------------- 列印：暫時換成淺色（畫布也重畫成淺色）、頁首留姓名座號欄 ---------------- */
  function initPrint() {
    const html = document.documentElement;
    if (slugEl && document.querySelector('.top h1') && !document.querySelector('.print-name')) {
      const p = document.createElement('p');
      p.className = 'print-only print-name';
      p.textContent = T('班級＿＿＿＿　座號＿＿＿＿　姓名＿＿＿＿＿＿＿＿　日期＿＿＿＿＿＿', 'Class ______   No. ______   Name ________________   Date __________');
      const h1 = document.querySelector('.top h1');
      h1.parentNode.insertBefore(p, h1.nextSibling);
    }
    let prev = null, swapped = false;
    window.addEventListener('beforeprint', function () {
      const dark = html.getAttribute('data-theme') === 'dark' ||
        (!html.hasAttribute('data-theme') && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
      if (!dark) return;
      prev = html.getAttribute('data-theme');
      swapped = true;
      html.setAttribute('data-theme', 'light');
      window.dispatchEvent(new Event('lab:themechange'));
    });
    window.addEventListener('afterprint', function () {
      if (!swapped) return;
      swapped = false;
      if (prev) html.setAttribute('data-theme', prev); else html.removeAttribute('data-theme');
      window.dispatchEvent(new Event('lab:themechange'));
    });
  }

  function start() {
    initPrint();
    initSiteQR();
    initLabTools();
    initTryHint();
    initTableExport();
    initRelated();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
  window.addEventListener('load', initTableExport); // 有些表格是頁面程式後來才建立的
  // 分享連結：等頁面程式都初始化好（load 之後再等兩格畫面）才還原
  function later() { requestAnimationFrame(function () { requestAnimationFrame(restoreFromHash); }); }
  if (document.readyState === 'complete') later();
  else window.addEventListener('load', later);
})();
