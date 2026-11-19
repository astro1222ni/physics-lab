/*
 * search.js — 首頁的實驗搜尋
 *
 * 首次聚焦或帶 ?q= 時載入 build-catalog 產生的 search-index.js。
 * 首頁搜尋全科；科目頁以 data-scope 篩選，保留中英、簡體與各科同義詞。
 */
(function () {
  'use strict';

  const input = document.getElementById('q');
  const list = document.getElementById('search-results');
  const status = document.getElementById('search-status');
  if (!input || !list) return;
  const { render: renderFormula, plain } = window.LabCatalogText;

  // ---------- 文字正規化：全形轉半形、小寫、常見簡體字轉繁體 ----------
  const S2T = {};
  ('电電 场場 动動 运運 带帶 双雙 缝縫 单單 抛拋 体體 线線 势勢 热熱 学學 声聲 镜鏡 变變 频頻 圆圓 摆擺 弹彈 万萬 气氣 压壓 温溫 ' +
   '应應 谱譜 级級 惯慣 质質 迹跡 轨軌 碰碰 撞撞 衍衍 射射 观觀 测測 实實 验驗 种種 为為 与與 发發 现現 头頭 ' +
   '强強 长長 宽寬 们們 阻阻 荷荷 极極 绕繞 涉涉 柵柵 栅柵 栏欄 宇宇 宙宙 星星 卫衛 轮輪 摩摩 擦擦 冲衝 量量 ' +
   '库庫 仑侖 劳勞 伦倫 兹茲 罗羅 斯斯 尔爾 楞楞 次次 欧歐 姆姆 联聯 并並 池池 络絡 纳納 杨楊 氏氏 光光 纤纖 ' +
   '临臨 界界 焦焦 虚虛 像像 凸凸 凹凹 镜鏡 门門 槛檻 衰衰 期期 爱愛 因因 坦坦 普普 朗朗 克克 层層 跃躍 迁遷 ' +
   '态態 温溫 热熱 传傳 导導 节節 腹腹 绳繩 簧簧 钟鐘 弧弧 转轉 周週 加加 速速 选選 择擇 器器 漂漂 移移 ' +
   '感感 应應 磁磁 铁鐵 圈圈 电電 容容 板板 储儲 存存 电電 压壓 场場 偶偶 静靜 试試 探探 能能 阶階 级級')
    .split(' ').forEach(function (p) { if (p.length === 2) S2T[p[0]] = p[1]; });

  function norm(s) {
    s = (s || '').normalize('NFKC').toLowerCase();
    // 簡體模式：兩邊都轉成簡體（含物理名詞，例如 電位→电势、勞侖茲→洛伦兹）再比對
    const toHans = window.LabSettings && window.LabSettings.toHans;
    if (toHans) return toHans(s).replace(/\\[()[\]]/g, ' ').replace(/[\\{}^_$]/g, '');
    let out = '';
    for (const ch of s) out += S2T[ch] || ch;
    return out.replace(/\\[()[\]]/g, ' ').replace(/[\\{}^_$]/g, '');
  }

  // 搜尋資料按需載入；首頁和科目頁共用，避免首次開啟就下載全站文字。
  const EN = window.LabSettings && window.LabSettings.lang === 'en';
  const scope = input.dataset.scope;
  const items = [];
  let loading;
  function ensureIndex() {
    if (loading) return loading;
    loading = new Promise(function (resolve, reject) {
      function ready() {
        (window.LAB_SEARCH_INDEX || []).filter(function (x) { return !scope || x.d === scope; }).forEach(function (x) {
          const sb = (window.LAB_SUBJECTS || []).find(function (s) { return s.dom === x.d; });
          items.push({ title: EN ? x.en : x.zh, branch: EN ? x.ben : x.bzh, topic: EN ? x.cen : x.czh,
            desc: EN ? x.den : x.dzh, subject: sb ? (EN ? sb.en : sb.zh) : '', subjectId: sb ? sb.id : '',
            keywords: (x.keywords || '').split(/\s+/).concat([x.zh, x.en, x.czh, x.cen]),
            href: x.live ? x.s + '.html' : null,
            color: 'var(--d-' + (sb && sb.id === 'phy' ? 'phys' : sb && sb.id || 'phys') + ')',
            raw: { title: EN ? x.en : x.zh, branch: (x.bzh || '') + ' ' + (x.ben || '') + ' ' + (sb ? sb.zh + ' ' + sb.en : ''), topic: (x.czh || '') + ' ' + (x.cen || ''), desc: (x.dzh || '') + ' ' + (x.den || '') }
          });
        });
        items.forEach(buildNorm); resolve();
      }
      if (window.LAB_SEARCH_INDEX) { ready(); return; }
      const script = document.createElement('script'); script.src = 'js/search-index.js?v=home-v2'; script.onload = ready; script.onerror = reject; document.head.appendChild(script);
    });
    return loading;
  }
  input.addEventListener('focus', function () { ensureIndex().catch(function () {}); }, { once: true });
  function buildNorm(it) {
    const hans = window.LabSettings && window.LabSettings.toHans;
    const variant = function (s) { const text = plain(s); return norm(text + (hans ? ' ' + hans(text, it.subjectId) : '')); };
    it.searchKeywords = it.keywords.slice();
    if (hans) it.searchKeywords = it.searchKeywords.concat(it.keywords.map(function (s) { return hans(s, it.subjectId); }));
    it.n = {
      title: variant(it.raw.title),
      branch: variant(it.raw.branch),
      topic: variant(it.raw.topic),
      desc: variant(it.raw.desc),
      keywords: it.searchKeywords.map(function (s) { return norm(plain(s)); })
    };
  }
  items.forEach(buildNorm);

  // ---------- 比對與排序 ----------
  function score(item, terms) {
    let total = 0;
    const hits = [];
    for (let i = 0; i < terms.length; i++) {
      const t = terms[i];
      let s = 0;
      if (item.n.title.indexOf(t) === 0) s = 30;
      else if (item.n.title.indexOf(t) > 0) s = 20;
      const kw = item.n.keywords.findIndex(function (k) { return k.indexOf(t) >= 0; });
      if (kw >= 0) {
        s = Math.max(s, item.n.keywords[kw] === t ? 16 : 12);
        if (item.n.title.indexOf(t) < 0) hits.push(item.searchKeywords[kw]);
      }
      if (item.n.topic.indexOf(t) >= 0 || item.n.branch.indexOf(t) >= 0) s = Math.max(s, 8);
      if (item.n.desc.indexOf(t) >= 0) s = Math.max(s, 4);
      if (s === 0) return null; // 每個關鍵字都要符合
      total += s;
    }
    return { item: item, score: total, hits: hits, live: item.href ? 1 : 0 };
  }

  function highlight(el, value, terms) {
    renderFormula(el, value);
    // 用純文字找位置，再逐文字節點上色，保留跨上下標的命中。
    const text = el.textContent;
    const n = norm(text);
    if (n.length !== text.length) return;
    const marks = new Array(text.length).fill(false);
    terms.forEach(function (t) {
      let i = n.indexOf(t);
      while (t && i >= 0) { for (let k = i; k < i + t.length; k++) marks[k] = true; i = n.indexOf(t, i + 1); }
    });
    if (!marks.includes(true)) return;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    let offset = 0;
    nodes.forEach(function (node) {
      const end = offset + node.length, parts = document.createDocumentFragment();
      for (let i = offset; i < end;) {
        let j = i + 1;
        while (j < end && marks[j] === marks[i]) j++;
        const part = text.slice(i, j);
        if (marks[i]) { const m = document.createElement('mark'); m.textContent = part; parts.appendChild(m); }
        else parts.appendChild(document.createTextNode(part));
        i = j;
      }
      node.replaceWith(parts);
      offset = end;
    });
  }

  const SUGGEST = EN ? ['field', 'momentum', 'light', 'wave', 'magnetic'] : ['電場', '動量', '折射', '干涉', '磁場', '波'];

  // 簡體對照表在頁面載入後才到，第一次搜尋時再用它重建索引
  let indexedHans = false;
  function reindex() {
    if (indexedHans || !(window.LabSettings && window.LabSettings.toHans)) return;
    items.forEach(buildNorm);
    indexedHans = true;
  }

  let renderSeq = 0;
  async function render() {
    const seq = ++renderSeq;
    if (input.value.trim()) { try { await ensureIndex(); } catch (e) { status.textContent = EN ? "Search could not load. Try again later." : "搜尋暫時無法載入，請稍後再試。"; return; } }
    if (seq !== renderSeq) return;
    reindex();
    const raw = input.value.trim();
    list.innerHTML = '';
    const all = document.getElementById('search-all');
    if (all) { all.replaceChildren(); all.hidden = !raw; if (raw) { const a = document.createElement('a'); a.href = 'index.html?q=' + encodeURIComponent(raw); a.textContent = EN ? 'Search all subjects for “' + raw + '” →' : '到全科搜尋「' + raw + '」→'; all.appendChild(a); } }
    if (!raw) { list.hidden = true; status.textContent = ''; return; }
    const terms = norm(raw).split(/\s+/).filter(Boolean);
    const results = items.map(function (it) { return score(it, terms); })
      .filter(Boolean)
      .sort(function (a, b) { return (b.live - a.live) || (b.score - a.score); }); // 已上線的排前面

    if (!results.length) {
      list.hidden = true;
      status.textContent = '';
      status.appendChild(document.createTextNode(EN ? 'No experiments match "' + raw + '". Try: ' : '找不到「' + raw + '」相關的實驗。試試：'));
      SUGGEST.forEach(function (w) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'search-suggest';
        b.textContent = w;
        b.addEventListener('click', function () { input.value = w; render(); input.focus(); });
        status.appendChild(b);
      });
      return;
    }

    const live = results.filter(function (r) { return r.item.href; }).length;
    status.textContent = EN
      ? results.length + (results.length === 1 ? ' experiment found' : ' experiments found') + (live ? ' (' + live + ' live)' : ' (all still planned)')
      : '找到 ' + results.length + ' 個實驗' + (live ? '（' + live + ' 個已上線）' : '（都還在規劃中）');

    results.forEach(function (r) {
      const it = r.item;
      const li = document.createElement('li');
      const box = document.createElement(it.href ? 'a' : 'div');
      box.className = 'search-item' + (it.href ? '' : ' soon');
      box.dataset.hansSubject = it.subjectId;
      if (it.href) box.href = it.href;
      if (it.color) box.style.setProperty('--c', it.color);

      const meta = document.createElement('span');
      meta.className = 'search-meta';
      renderFormula(meta, it.branch + (it.topic && it.topic !== it.branch ? (EN ? ' · ' : '・') + it.topic : ''));
      const tag = document.createElement('span');
      tag.className = 'tag' + (it.href ? '' : ' soon');
      tag.textContent = it.href ? (EN ? 'Live' : '已上線') : (EN ? 'Planned' : '規劃中');
      const head = document.createElement('span');
      head.className = 'search-head';
      const subject = document.createElement('span'); subject.className = 'search-subject'; subject.textContent = it.subject; head.appendChild(subject);
      head.appendChild(meta);
      head.appendChild(tag);

      const title = document.createElement('span');
      title.className = 'search-title';
      const toHans = LabSettings.lang === 'zh-Hans' && LabSettings.toHans;
      highlight(title, toHans ? toHans(it.title, it.subjectId) : it.title, terms);

      box.appendChild(head);
      box.appendChild(title);
      let shownDesc = '';
      if (it.desc && terms.some(function (t) { return it.n.desc.includes(t); })) {
        const desc = document.createElement('span');
        desc.className = 'search-why search-desc';
        shownDesc = toHans ? toHans(it.desc, it.subjectId) : it.desc;
        highlight(desc, shownDesc, terms);
        box.appendChild(desc);
      }
      const descText = norm(plain(shownDesc));
      const hits = [...new Set(r.hits)].filter(function (h) { return !descText.includes(norm(plain(h))); });
      if (hits.length) {
        const why = document.createElement('span');
        why.className = 'search-why';
        renderFormula(why, (EN ? 'Matches: ' : '相關：') + hits.join('、'));
        box.appendChild(why);
      }
      li.appendChild(box);
      list.appendChild(li);
    });
    list.hidden = false;
  }

  input.addEventListener('input', render);

  // Enter：直接進入第一個已上線的結果；方向鍵：在結果之間移動
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      const first = list.querySelector('a.search-item');
      if (first) { e.preventDefault(); location.href = first.href; }
    } else if (e.key === 'ArrowDown') {
      const first = list.querySelector('a.search-item');
      if (first) { e.preventDefault(); first.focus(); }
    } else if (e.key === 'Escape') {
      input.value = '';
      render();
    }
  });
  list.addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const links = Array.prototype.slice.call(list.querySelectorAll('a.search-item'));
    const i = links.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    if (e.key === 'ArrowDown' && i < links.length - 1) links[i + 1].focus();
    else if (e.key === 'ArrowUp') (i > 0 ? links[i - 1] : input).focus();
  });

  // 電腦上按「/」直接跳到搜尋框
  document.addEventListener('keydown', function (e) {
    if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement.tagName)) {
      e.preventDefault();
      input.focus();
    }
  });

  // 支援 ?q=關鍵字 的網址（例如從影片說明欄直接連到搜尋結果）
  try {
    const q = new URLSearchParams(location.search).get('q');
    if (q) { input.value = q; render(); }
  } catch (err) { /* 舊瀏覽器忽略 */ }
})();
