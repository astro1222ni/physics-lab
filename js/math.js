/* math.js — 用 KaTeX 排版頁面中以 \( … \)、\[ … \] 標記的公式 */
(function () {
  'use strict';
  function render() {
    if (!window.renderMathInElement) return; // KaTeX 載入失敗時保留原始 TeX 文字
    window.renderMathInElement(document.body, {
      delimiters: [
        { left: '\\[', right: '\\]', display: true },
        { left: '\\(', right: '\\)', display: false }
      ],
      throwOnError: false
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();
})();
