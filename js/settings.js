/*
 * settings.js — 齒輪設定：語言（繁體／简体／English）、字體大小、外觀（淺色／深色）
 *
 * 放在每頁 <head> 裡（不要加 defer），才能在畫面出現前套用設定，避免閃爍。
 * 設定存在瀏覽器的 localStorage，換頁、下次再來都會保留。
 *
 * 語言：
 *   繁體中文 ── 原文。
 *   简体中文 ── 載入 js/hans-map.js，把頁面文字、之後更新的文字與畫布文字逐字轉成簡體，並套用物理名詞對照。
 *   English ── 元素上有 data-en（文字）、data-en-html（含公式的 HTML）、data-en-placeholder、
 *              data-en-aria-label、data-en-title 屬性時替換成英文。
 *              <body data-en-ready> 表示這頁已完整翻譯；否則在頁首顯示「尚未翻譯」提示。
 * 其他程式可用 LabSettings.lang 判斷語言、LabSettings.t('中文', 'English') 取得字串。
 */
(function () {
  'use strict';

  const KEY = 'lab-settings';
  const DEFAULTS = { lang: 'zh-Hant', theme: 'auto', fs: 1, sound: false, volume: 1 };
  const FONT_STEPS = [
    { v: 0.9, zh: '小', en: 'S' },
    { v: 1, zh: '標準', en: 'M' },
    { v: 1.15, zh: '大', en: 'L' },
    { v: 1.3, zh: '特大', en: 'XL' }
  ];
  const html = document.documentElement;

  function load() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { s = {}; }
    const out = Object.assign({}, DEFAULTS, s);
    if (['zh-Hant', 'zh-Hans', 'en'].indexOf(out.lang) < 0) out.lang = DEFAULTS.lang;
    if (['auto', 'light', 'dark'].indexOf(out.theme) < 0) out.theme = DEFAULTS.theme;
    if (!FONT_STEPS.some(function (f) { return f.v === out.fs; })) out.fs = DEFAULTS.fs;
    out.sound = out.sound === true;
    if ([0.3, 0.6, 1].indexOf(out.volume) < 0) out.volume = DEFAULTS.volume;
    return out;
  }
  function save() {
    // 網址指定的語言（?lang=）只在這次瀏覽套用，不蓋掉使用者自己存的語言
    const o = Object.assign({}, st, urlLang && st.lang === urlLang && hadStored ? { lang: savedLang } : {});
    try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { /* 私密瀏覽等情況忽略 */ }
  }

  const st = load();
  // 可分享的語言網址：?lang=en、?lang=zh-Hans、?lang=zh-Hant（國外老師、搜尋引擎直接看到 English 版）
  let hadStored = false;
  try { hadStored = !!localStorage.getItem(KEY); } catch (e) { /* 忽略 */ }
  const savedLang = st.lang;
  const urlLang = (function () {
    let v = null;
    try { v = new URLSearchParams(location.search).get('lang'); } catch (e) { return null; }
    if (!v) return null;
    v = v.toLowerCase();
    if (v === 'en' || v.indexOf('en-') === 0) return 'en';
    if (v === 'zh-hans' || v === 'zh-cn' || v === 'zh-sg') return 'zh-Hans';
    if (v === 'zh-hant' || v === 'zh-tw' || v === 'zh-hk' || v === 'zh') return 'zh-Hant';
    return null;
  })();
  if (urlLang) {
    st.lang = urlLang;
    if (!hadStored) save(); // 第一次來的訪客：照網址的語言記住，換頁也維持
  }

  // ---------- 立即套用（在畫面出現前） ----------
  function applyTheme() {
    if (st.theme === 'auto') html.removeAttribute('data-theme');
    else html.setAttribute('data-theme', st.theme);
  }
  function applyFont() { html.style.setProperty('--fs', String(st.fs)); }
  applyTheme();
  applyFont();
  html.lang = st.lang;
  if (st.lang === 'zh-Hans') html.classList.add('lab-converting'); // 轉換完成前先隱藏，避免繁簡閃爍

  const isEn = st.lang === 'en';
  function notify(name, value) {
    let ev;
    try { ev = new CustomEvent('lab:settingschange', { detail: { name: name, value: value } }); }
    catch (e) { ev = document.createEvent('CustomEvent'); ev.initCustomEvent('lab:settingschange', false, false, { name: name, value: value }); }
    window.dispatchEvent(ev);
  }
  window.LabSettings = {
    lang: st.lang,
    t: function (zh, en) { return isEn && typeof en === 'string' ? en : zh; }, // 英文可以是空字串
    get: function (name) { return st[name]; },
    // 目前只開放模組頁面直接切換音效（例如頁面上的喇叭按鈕）
    set: function (name, value) {
      if (name !== 'sound') return;
      st.sound = !!value;
      save();
      document.querySelectorAll('[data-set="sound"]').forEach(function (x) {
        x.setAttribute('aria-pressed', String(x.getAttribute('data-val') === String(st.sound)));
      });
      notify('sound', st.sound);
    }
  };

  // ---------- 畫布文字：隨字體大小縮放；簡體模式下轉成簡體 ----------
  function canvasScale() { return 1 + (st.fs - 1) * 0.7; }
  let toHans = null; // 簡體對照載入後才會有
  (function patchCanvas() {
    const P = window.CanvasRenderingContext2D && CanvasRenderingContext2D.prototype;
    if (!P) return;
    const desc = Object.getOwnPropertyDescriptor(P, 'font');
    if (desc && desc.set) {
      const original = new WeakMap();
      Object.defineProperty(P, 'font', {
        configurable: true,
        get: function () { return original.has(this) ? original.get(this) : desc.get.call(this); },
        set: function (v) {
          original.set(this, v);
          const k = canvasScale();
          desc.set.call(this, k === 1 ? v : String(v).replace(/(\d+(?:\.\d+)?)px/, function (m, n) {
            return (n * k).toFixed(1) + 'px';
          }));
        }
      });
    }
    ['fillText', 'strokeText', 'measureText'].forEach(function (name) {
      const fn = P[name];
      P[name] = function (text) {
        if (toHans && typeof text === 'string') {
          const args = Array.prototype.slice.call(arguments);
          args[0] = toHans(text);
          return fn.apply(this, args);
        }
        return fn.apply(this, arguments);
      };
    });
  })();

  // ---------- 簡體轉換 ----------
  function buildHans(data) {
    const map = {};
    const chars = Array.from(data.chars);
    for (let i = 0; i + 1 < chars.length; i += 2) map[chars[i]] = chars[i + 1];
    const keys = Object.keys(data.phrases).sort(function (a, b) { return b.length - a.length; });
    const re = new RegExp(keys.map(function (k) { return k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|'), 'g');
    const hasHan = /[㐀-鿿豈-﫿「」『』]/;
    return function (s) {
      if (!s || !hasHan.test(s)) return s;
      s = s.replace(re, function (m) { return data.phrases[m]; });
      let out = '';
      for (const ch of s) out += map[ch] || ch;
      return out;
    };
  }

  const SKIP = /^(SCRIPT|STYLE|TEXTAREA|CODE|PRE|NOSCRIPT)$/;
  const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
  function convertTree(root) {
    if (root.nodeType === 3) {
      const v = toHans(root.nodeValue);
      if (v !== root.nodeValue) root.nodeValue = v;
      return;
    }
    if (root.nodeType !== 1 || SKIP.test(root.tagName) || root.closest('[data-no-convert]')) return;
    ATTRS.forEach(function (a) {
      if (root.hasAttribute(a)) {
        const v = toHans(root.getAttribute(a));
        if (v !== root.getAttribute(a)) root.setAttribute(a, v);
      }
    });
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode: function (n) {
        if (n.nodeType === 1) return SKIP.test(n.tagName) || n.hasAttribute('data-no-convert') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let n;
    while ((n = walker.nextNode())) {
      const v = toHans(n.nodeValue);
      if (v !== n.nodeValue) n.nodeValue = v;
    }
    root.querySelectorAll('[' + ATTRS.join('],[') + ']').forEach(function (el) {
      ATTRS.forEach(function (a) {
        if (el.hasAttribute(a)) {
          const v = toHans(el.getAttribute(a));
          if (v !== el.getAttribute(a)) el.setAttribute(a, v);
        }
      });
    });
  }

  // 簡體對照表沿用本檔的版本號（?v=…），更新對照表後不會讀到舊快取
  const HANS_VER = (((document.currentScript || {}).src || '').match(/\?v=\d+/) || [''])[0];
  function startHans() {
    const done = function () { html.classList.remove('lab-converting'); };
    setTimeout(done, 2500); // 萬一對照表載入失敗，也不要讓畫面一直隱藏
    const s = document.createElement('script');
    s.src = 'js/hans-map.js' + HANS_VER;
    s.onerror = done;
    s.onload = function () {
      if (!window.LAB_HANS) { done(); return; }
      toHans = buildHans(window.LAB_HANS);
      window.LabSettings.toHans = toHans;
      document.title = toHans(document.title);
      convertTree(document.body);
      new MutationObserver(function (records) {
        records.forEach(function (r) {
          if (r.type === 'characterData') convertTree(r.target);
          else if (r.type === 'attributes') convertTree(r.target);
          else r.addedNodes.forEach(convertTree);
        });
      }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
      window.dispatchEvent(new Event('lab:themechange')); // 讓畫布用簡體重畫
      done();
    };
    document.head.appendChild(s);
  }

  // ---------- 英文 ----------
  function applyEnglish() {
    document.querySelectorAll('[data-en]').forEach(function (el) { el.textContent = el.getAttribute('data-en'); });
    document.querySelectorAll('[data-en-html]').forEach(function (el) { el.innerHTML = el.getAttribute('data-en-html'); });
    ['placeholder', 'aria-label', 'title'].forEach(function (a) {
      document.querySelectorAll('[data-en-' + a + ']').forEach(function (el) { el.setAttribute(a, el.getAttribute('data-en-' + a)); });
    });
    if (window.renderMathInElement) {
      document.querySelectorAll('[data-en-html]').forEach(function (el) {
        window.renderMathInElement(el, { delimiters: [{ left: '\\[', right: '\\]', display: true }, { left: '\\(', right: '\\)', display: false }], throwOnError: false });
      });
    }
    if (!document.body.hasAttribute('data-en-ready')) {
      const note = document.createElement('div');
      note.className = 'lab-en-note';
      note.textContent = 'This experiment has not been translated into English yet — the controls below are in Chinese. The English version is on its way.';
      const top = document.querySelector('header.top');
      if (top) top.insertAdjacentElement('afterend', note);
    }
  }

  // ---------- 齒輪按鈕與設定面板 ----------
  const T = isEn ? {
    gear: 'Settings', title: 'Settings', lang: 'Language', font: 'Text size', theme: 'Appearance',
    auto: 'System', light: 'Light', dark: 'Dark', reset: 'Reset to defaults', close: 'Close', preview: 'Sample text 物理',
    sound: 'Sound effects', on: 'On', off: 'Off', volume: 'Volume', vS: 'Low', vM: 'Medium', vL: 'High'
  } : {
    gear: '設定', title: '設定', lang: '語言 Language', font: '字體大小', theme: '外觀',
    auto: '跟隨系統', light: '淺色', dark: '深色', reset: '恢復預設值', close: '關閉', preview: '範例文字 Physics',
    sound: '音效', on: '開', off: '關', volume: '音量', vS: '小', vM: '中', vL: '大'
  };

  const GEAR_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19.14 12.94a7.6 7.6 0 0 0 .05-.94 7.6 7.6 0 0 0-.05-.94l2.03-1.58a.5.5 0 0 0 .12-.63l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.1 7.1 0 0 0-1.62-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.49.42l-.36 2.54a7.4 7.4 0 0 0-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.67 8.85a.5.5 0 0 0 .12.63l2.03 1.58a7.8 7.8 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.63l1.92 3.32c.13.22.39.3.6.22l2.39-.96c.5.38 1.04.7 1.63.94l.36 2.54c.04.24.25.42.49.42h3.84c.25 0 .46-.18.5-.42l.36-2.54a7.1 7.1 0 0 0 1.62-.94l2.39.96c.22.08.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.63l-2.03-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z"/></svg>';

  function group(label, name, options, current) {
    return '<fieldset class="lab-set-group"><legend>' + label + '</legend><div class="lab-seg">' +
      options.map(function (o) {
        return '<button type="button" data-set="' + name + '" data-val="' + o.v + '" aria-pressed="' + (String(o.v) === String(current)) + '"' +
          (o.lang ? ' lang="' + o.lang + '" data-no-convert' : '') + '>' + o.label + '</button>';
      }).join('') + '</div></fieldset>';
  }

  function buildUI() {
    const wrap = document.querySelector('.wrap') || document.body;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lab-gear';
    btn.setAttribute('aria-label', T.gear);
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', 'lab-settings');
    btn.innerHTML = GEAR_SVG;

    const panel = document.createElement('div');
    panel.id = 'lab-settings';
    panel.className = 'lab-settings';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', T.title);
    panel.hidden = true;
    panel.innerHTML =
      '<div class="lab-set-head"><strong>' + T.title + '</strong><button type="button" class="lab-set-close" aria-label="' + T.close + '">✕</button></div>' +
      group(T.lang, 'lang', [
        { v: 'zh-Hant', label: '繁體中文', lang: 'zh-Hant' },
        { v: 'zh-Hans', label: '简体中文', lang: 'zh-Hans' },
        { v: 'en', label: 'English', lang: 'en' }
      ], st.lang) +
      group(T.font, 'fs', FONT_STEPS.map(function (f) { return { v: f.v, label: isEn ? f.en : f.zh }; }), st.fs) +
      '<p class="lab-set-preview">' + T.preview + '</p>' +
      group(T.theme, 'theme', [
        { v: 'auto', label: T.auto }, { v: 'light', label: T.light }, { v: 'dark', label: T.dark }
      ], st.theme) +
      group(T.sound, 'sound', [{ v: false, label: T.off }, { v: true, label: T.on }], st.sound) +
      group(T.volume, 'volume', [{ v: 0.3, label: T.vS }, { v: 0.6, label: T.vM }, { v: 1, label: T.vL }], st.volume) +
      '<button type="button" class="lab-set-reset">' + T.reset + '</button>';

    wrap.appendChild(btn);
    wrap.appendChild(panel);

    function open(show) {
      panel.hidden = !show;
      btn.setAttribute('aria-expanded', String(show));
      if (show) { const first = panel.querySelector('[aria-pressed="true"]'); if (first) first.focus(); }
    }
    btn.addEventListener('click', function () { open(panel.hidden); });
    panel.querySelector('.lab-set-close').addEventListener('click', function () { open(false); btn.focus(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hidden) { open(false); btn.focus(); } });
    document.addEventListener('pointerdown', function (e) {
      if (!panel.hidden && !panel.contains(e.target) && !btn.contains(e.target)) open(false);
    });

    panel.addEventListener('click', function (e) {
      const b = e.target.closest('[data-set]');
      if (b) {
        const name = b.getAttribute('data-set');
        const raw = b.getAttribute('data-val');
        const val = (name === 'fs' || name === 'volume') ? parseFloat(raw) : name === 'sound' ? raw === 'true' : raw;
        if (st[name] === val) return;
        st[name] = val;
        save();
        panel.querySelectorAll('[data-set="' + name + '"]').forEach(function (x) {
          x.setAttribute('aria-pressed', String(x === b));
        });
        if (name === 'lang') { // 語言切換重新載入，確保每段文字都正確；網址帶 ?lang= 時拿掉，改用剛選的語言
          if (urlLang) {
            try { const u = new URL(location.href); u.searchParams.delete('lang'); location.replace(u.href); return; } catch (e) { /* 舊瀏覽器 */ }
          }
          location.reload(); return;
        }
        if (name === 'theme') applyTheme();
        if (name === 'fs') applyFont();
        notify(name, val);
        if (name === 'sound' || name === 'volume') return;
        window.dispatchEvent(new Event('lab:themechange')); // 畫布重畫
        window.dispatchEvent(new Event('resize'));
      } else if (e.target.closest('.lab-set-reset')) {
        Object.assign(st, DEFAULTS);
        save();
        location.reload();
      }
    });
  }

  function onReady() {
    if (st.lang === 'en') applyEnglish();
    buildUI();
    if (st.lang === 'zh-Hans') startHans();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onReady);
  else onReady();
})();
