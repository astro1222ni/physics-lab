/* Editorial notes shared by the lab and its source inventory. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HanSources = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const digitalEdition = 'https://github.com/shuowenjiezi/shuowen/blob/6553a350763ce4feca2c5d1cc2cad7e594dc2975/data/';
  const entries = {
    坊: {
      supplement: 'https://dict.variants.moe.edu.tw/dictView.jsp?educode=A00747',
      exampleReading: 'ㄈㄤ ㄐㄧㄢ',
      exampleSource: 'https://dict.revised.moe.edu.tw/dictView.jsp?ID=36229&la=0&powerMode=0'
    },
    齡: {supplement: 'https://dict.variants.moe.edu.tw/dictView.jsp?ID=53714&la=0'},
    月: {collation: {
      transcription: '大陰', facsimile: '太陰',
      location: ['卷七上，影本第 98 頁', 'vol. 7a, scan p. 98'],
      scan: 'https://archive.org/download/06050618.cn/06050618.cn.pdf#page=98'
    }},
    青: {collation: {
      transcription: '言象然', facsimile: '言必然',
      location: ['卷五下，影本第 145 頁', 'vol. 5b, scan p. 145'],
      scan: 'https://archive.org/download/06050617.cn/06050617.cn.pdf#page=145'
    }}
  };
  const glyphCredits = {
    木: {
      oracle: ['底圖 Richard Sears（j14138）；向量檔 Chanueting、Yug。',
        'Source drawing by Richard Sears (j14138). Vector by Chanueting and Yug.'],
      seal: ['底圖來源 Richard Sears（s03946）、中央研究院小學堂（27.6728，CC0）；向量檔 Chanueting、Wargaz。',
        'Source drawings from Richard Sears (s03946) and Academia Sinica’s Xiaoxuetang (27.6728, CC0). Vector by Chanueting and Wargaz.']
    },
    山: {
      oracle: ['《甲骨文合集》5431；向量檔 Yug、Wargaz。',
        'Jiaguwen Heji, inscription 5431. Vector by Yug and Wargaz.'],
      seal: ['底圖來源 Richard Sears（s06639）、中央研究院小學堂（27.5C71，CC0）；向量檔 Erin Silversmith、Wargaz。',
        'Source drawings from Richard Sears (s06639) and Academia Sinica’s Xiaoxuetang (27.5C71, CC0). Vector by Erin Silversmith and Wargaz.']
    },
    月: {
      oracle: ['中央研究院小學堂（42.EEB0，CC0），《甲骨文合集》33694；向量檔 Chanueting、Wargaz。',
        'Academia Sinica’s Xiaoxuetang (42.EEB0, CC0), Jiaguwen Heji inscription 33694. Vector by Chanueting and Wargaz.'],
      seal: ['底圖來源 Richard Sears（s04916）；2015 年版本另據小學堂；向量檔 Chanueting、VulpesVulpes42、Yug。',
        'Source drawing from Richard Sears (s04916). The 2015 version also cites Xiaoxuetang. Vector by Chanueting, VulpesVulpes42 and Yug.']
    }
  };
  return {digitalEdition, entries, glyphCredits};
});
