/* missions/image-digitization.js — 圖片數位化的任務（一般任務星星 = 等級；隱藏任務 = 等級 × 2）
 * 事件（js/image-digitization.js 發出，都在使用者操作之後；載入與預設值不送）：
 *   'image'：改了原圖、解析度、取樣方式、色彩模式、位元數、「奈奎斯特範圍」或 2D／3D 檢視，重新計算之後。
 *       { src（'scene'、'w'、'h'、'lock'、'method'、'mode'、'b'、'nyq'、'view'）,
 *         scene（'sunset' 山景日落、'checker' 棋盤、'rings' 同心圓、'eyechart' 視力表、'wheel' 色相環）,
 *         w, h（像素）, lock（固定 4:3）, mode（'gray'／'color'）, b（每色版位元數）, bpp（每像素位元數）, method（'center'／'area'）,
 *         bits, bytes（未壓縮的檔案大小）, colors（實際用到的顏色數）, levels（每色版的階數 2^b）, err（平均量化誤差）,
 *         band（山景日落：天空量測線上最長的色帶有幾列；其他圖為 0）, bandPrev（少 1 位元時的最長色帶；b = 1 為 null）, bandRows（天空有幾列）,
 *         uniform（整張圖只剩一種顏色）, faithful（棋盤：像素格剛好對齊方格，數位化後和原圖一模一樣）,
 *         eyeRows（視力表：從最上面起連續幾列 E 的每一條邊都剛好落在像素的格線上）,
 *         view（'2d'／'3d'）, nyq（是否顯示奈奎斯特範圍）,
 *         prev（這次操作之前的 { w, h, bpp, bits, method, mode, b, scene }；第一次操作前也有） }
 *   'probe'：點選（或用方向鍵移動）一個像素之後，以及有選取像素時改了設定之後。
 *       { src（'pick' 點選、'settings' 改設定）, scene, w, h, i, j（像素位置，左上角是 0, 0）, method, mode, b,
 *         key（scene|w|h|i|j|method：同一張圖的同一個像素）, samp（取樣到的 [R, G, B]，0–255）, y（亮度 Y）,
 *         code（代碼：灰階 [Y]、彩色 [R, G, B]）, disp（存下的值，同上）, rgb（顯示的 [R, G, B]）, gray（灰階時存下的值，彩色為 null）,
 *         hue, sat（色相環：像素中心的色相〔度，紅 0、黃 60、綠 120、青 180、藍 240、洋紅 300〕與飽和度 0–1；其他圖為 null） }
 *   'rotate3d'：3D 色立方轉完（拖曳放開、阻尼停下或按方向鍵）之後。{ dir（從立方體中心指向相機的單位向量，[R, G, B] 軸）, scene, mode, b }
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const isImg = function (ev) { return ev.type === 'image'; };
  const isProbe = function (ev) { return ev.type === 'probe'; };
  /** 兩個色相（度）在色相環上相差幾度（0–180） */
  const hueGap = function (a, b) { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
  /** 色相環邊緣（飽和度高）的黃色段或藍色段 */
  const edgeBand = function (d) {
    if (d.scene !== 'wheel' || d.hue == null || !(d.sat >= 0.8)) return null;
    if (hueGap(d.hue, 60) <= 12) return 'Y';
    if (hueGap(d.hue, 240) <= 12) return 'B';
    return null;
  };
  /** 記錄看過的「寬|高|每像素位元數」（含這次操作之前的狀態），最多 400 筆 */
  function remember(mem, d) {
    mem.seen = mem.seen || {};
    mem.n = mem.n || 0;
    [d.prev, d].forEach(function (s) {
      if (!s) return;
      const k = s.w + '|' + s.h + '|' + s.bpp;
      if (!mem.seen[k] && mem.n < 400) { mem.seen[k] = true; mem.n++; }
    });
  }

  LabMission.register('image-digitization', [
    {
      id: 'image-digitization-1', level: 1,
      title: { zh: '只剩黑與白', en: 'Only black and white' },
      desc: { zh: '按「灰階」，把「位元數 b」調到 1：每個像素只用 1 個位元。', en: 'Choose “Grayscale” and set “Bits b” to 1: each pixel uses just 1 bit.' },
      check: function (ev) { return isImg(ev) && ev.data.mode === 'gray' && ev.data.b === 1; }
    },
    {
      id: 'image-digitization-2', level: 2,
      title: { zh: '最紅的紅', en: 'The reddest red' },
      desc: { zh: '在「彩色」模式點圖上的像素，找到一個存下的值是純紅 (R, G, B) = (255, 0, 0) 的像素。', en: 'In “Color” mode, tap pixels in the image and find one whose stored value is pure red, (R, G, B) = (255, 0, 0).' },
      check: function (ev) { const d = ev.data; return isProbe(ev) && d.mode === 'color' && d.rgb && d.rgb[0] === 255 && d.rgb[1] === 0 && d.rgb[2] === 0; }
    },
    {
      id: 'image-digitization-3', level: 2,
      title: { zh: '八種顏色', en: 'Eight colors' },
      desc: { zh: '按「彩色」，把「位元數 b」調到 1，讓圖上剛好用到 8 種顏色。', en: 'Choose “Color” and set “Bits b” to 1 so that the picture uses exactly 8 colors.' },
      check: function (ev) { const d = ev.data; return isImg(ev) && d.mode === 'color' && d.b === 1 && d.colors === 8; }
    },
    {
      id: 'image-digitization-4', level: 3,
      title: { zh: '立方體裡的格點', en: 'A lattice inside the cube' },
      desc: { zh: '按「3D 色立方」，在「彩色」模式把「位元數 b」調到 2，看看 4 × 4 × 4 = 64 個格點。', en: 'Open the “3D color cube” and, in “Color” mode, set “Bits b” to 2 to see the 4 × 4 × 4 = 64 lattice points.' },
      check: function (ev) { const d = ev.data; return isImg(ev) && d.view === '3d' && d.mode === 'color' && d.b === 2; }
    },
    {
      id: 'image-digitization-5', level: 3,
      title: { zh: '兩倍的寬與高', en: 'Twice as wide, twice as tall' },
      desc: { zh: '色深不變，把「寬 w」和「高 h」都變成原來的 2 倍。檔案變成幾倍？', en: 'Keep the color depth and make both “Width w” and “Height h” twice as large. How many times bigger is the file?' },
      check: function (ev, mem) {
        if (!isImg(ev)) return false;
        const d = ev.data;
        remember(mem, d);
        return d.w % 2 === 0 && d.h % 2 === 0 && !!mem.seen[(d.w / 2) + '|' + (d.h / 2) + '|' + d.bpp];
      }
    },
    {
      id: 'image-digitization-6', level: 4,
      title: { zh: '剛好 1 KiB', en: 'Exactly 1 KiB' },
      desc: { zh: '調整解析度與色深，讓檔案剛好是 1 KiB = 1024 位元組。（提示：可能要取消「固定 4:3」。）', en: 'Change the resolution and the color depth so that the file is exactly 1 KiB = 1024 bytes. (Hint: you may need to untick “Keep 4:3”.)' },
      check: function (ev) { return isImg(ev) && ev.data.bits === 8192; }
    },
    {
      id: 'image-digitization-7', level: 4,
      title: { zh: '假的圓圈', en: 'Fake rings' },
      desc: { zh: '在「同心圓」用「取每格中心點」，把「寬 w」調到 80 以下，找到原圖沒有的圓圈；再按「整格平均」，看它們怎麼了。', en: 'In “Rings” with “Center of each pixel”, make “Width w” 80 or less and find rings that are not in the original; then press “Average over each pixel” and see what happens to them.' },
      check: function (ev) {
        const d = ev.data;
        return isImg(ev) && d.src === 'method' && d.scene === 'rings' && d.method === 'area' && d.w <= 80 &&
          !!d.prev && d.prev.method === 'center' && d.prev.w === d.w && d.prev.h === d.h && d.prev.scene === 'rings';
      }
    },
    {
      id: 'image-digitization-8', level: 5,
      title: { zh: '同樣大小，不同取捨', en: 'Same size, different trade-off' },
      desc: { zh: '找出兩組檔案大小完全相同、像素數卻相差 4 倍以上的設定：一組像素多，一組每個像素的位元多。', en: 'Find two settings with exactly the same file size but at least 4 times as many pixels in one of them: one with more pixels, the other with more bits per pixel.' },
      check: function (ev, mem) {
        if (!isImg(ev)) return false;
        const d = ev.data;
        mem.px = mem.px || {};
        mem.n = mem.n || 0;
        [d.prev, d].forEach(function (s) {
          if (!s) return;
          const p = s.w * s.h, r = mem.px[s.bits];
          if (r) { r.lo = Math.min(r.lo, p); r.hi = Math.max(r.hi, p); }
          else if (mem.n < 600) { mem.px[s.bits] = { lo: p, hi: p }; mem.n++; }
        });
        const r = mem.px[d.bits];
        return !!r && r.hi >= 4 * r.lo;
      }
    },
    {
      id: 'image-digitization-9', level: 5,
      title: { zh: '奈奎斯特範圍', en: 'The Nyquist limit' },
      desc: { zh: '在「同心圓」勾選「奈奎斯特範圍」，調整「寬 w」，讓虛線框的左右兩邊剛好碰到圖的左右邊緣。', en: 'In “Rings”, tick “Nyquist limit” and change “Width w” until the left and right sides of the dashed box just touch the left and right edges of the picture.' },
      check: function (ev) { const d = ev.data; return isImg(ev) && d.scene === 'rings' && d.nyq && d.w === 256; }
    },
    {
      id: 'image-digitization-10', level: 6,
      title: { zh: '色帶消失', en: 'No more banding' },
      desc: { zh: '在「山景日落」用「彩色」、「高 h」至少 120：找出讓天空最長的色帶只剩 1 列的最少位元數（少 1 位元就會出現色帶）。', en: 'In “Mountain sunset” with “Color” and “Height h” at least 120, find the fewest bits that bring the longest band in the sky down to 1 row (one bit fewer and banding appears).' },
      check: function (ev) { const d = ev.data; return isImg(ev) && d.scene === 'sunset' && d.mode === 'color' && d.h >= 120 && d.band === 1 && d.bandPrev > 1; }
    },
    {
      id: 'image-digitization-11', level: 6,
      title: { zh: '最省的清楚字', en: 'Crisp letters, fewest bytes' },
      desc: { zh: '在「視力表」讓第三列 E 的每一筆剛好 1 個像素寬、1 個像素高，再用最少的位元存成黑白圖。', en: 'In “Eye chart”, make every stroke of the E’s in the third row exactly 1 pixel wide and 1 pixel tall, then store it as a black-and-white image with the fewest bits.' },
      check: function (ev) { const d = ev.data; return isImg(ev) && d.scene === 'eyechart' && d.w === 100 && d.h === 75 && d.bpp === 1; }
    },
    {
      id: 'image-digitization-12', level: 7,
      title: { zh: '一格不差的棋盤', en: 'A perfect checkerboard' },
      desc: { zh: '讓數位化的「棋盤」和原圖一模一樣：每個像素都只蓋住一個方格，沒有一格是灰的、也沒有一格放錯。', en: 'Make the digitized “Checkerboard” identical to the original: every pixel covers just one square, with no grey pixel and no pixel in the wrong place.' },
      check: function (ev) { return isImg(ev) && ev.data.faithful === true; }
    },

    // ---------------- 隱藏任務 ----------------
    {
      id: 'image-digitization-h1', level: 3, hidden: true,
      riddle: { zh: '彩虹褪成了黑白照片：最耀眼的那一段、最黯淡的那一段，你都找得到嗎？', en: 'The rainbow has faded into a black-and-white photo. Can you find both its brightest stretch and its dimmest one?' },
      check: function (ev, mem) {
        if (!isProbe(ev)) return false;
        const d = ev.data, band = d.mode === 'gray' ? edgeBand(d) : null;
        const last = mem.last;
        mem.last = band;
        return !!band && !!last && band !== last;   // 連續兩次讀到的像素：一個在黃色段、一個在藍色段
      }
    },
    {
      id: 'image-digitization-h2', level: 4, hidden: true,
      riddle: { zh: '兩種截然不同的顏色，脫下彩衣以後，竟然分不出誰是誰。', en: 'Two utterly different colors: take off their coats of paint, and you can no longer tell which is which.' },
      check: function (ev, mem) {
        if (!isProbe(ev) || ev.data.src !== 'pick') return false;
        const d = ev.data;
        const ok = d.scene === 'wheel' && d.mode === 'gray' && d.b === 8 && d.hue != null && d.sat >= 0.8;
        const last = mem.last;
        mem.last = ok ? { g: d.gray, hue: d.hue } : null;
        return ok && !!last && last.g === d.gray && hueGap(last.hue, d.hue) >= 90;
      }
    },
    {
      id: 'image-digitization-h3', level: 5, hidden: true,
      riddle: { zh: '世界只剩兩種顏色時，就用最少的位元、最少的格子，把它一格不差地記下來。', en: 'When the world has only two colors, record it perfectly with the fewest bits and the fewest cells.' },
      check: function (ev) { const d = ev.data; return isImg(ev) && d.scene === 'checker' && d.faithful && d.mode === 'gray' && d.b === 1 && d.w === 48 && d.h === 36; }
    },
    {
      id: 'image-digitization-h4', level: 6, hidden: true,
      riddle: { zh: '一九八九年，一台灰綠色的掌上遊戲機紅遍全世界——照它那片小小螢幕的格子與色階，重做一次。', en: 'In 1989 a grey-green handheld game console swept the world. Rebuild its tiny screen: its grid and its shades.' },
      check: function (ev) { const d = ev.data; return isImg(ev) && d.w === 160 && d.h === 144 && d.mode === 'gray' && d.b === 2; }
    },
    {
      id: 'image-digitization-h5', level: 7, hidden: true,
      riddle: { zh: '棋子還沒落下，棋盤就不見了；換一種看法，它還是不見。', en: 'The board vanished before a single piece was played — and looked at another way, it is still gone.' },
      check: function (ev, mem) {
        // 同一個解析度（至少 100 個像素）下，「取每格中心點」與「整格平均」都讓整張棋盤只剩一種顏色（全白與全灰）
        if (!isImg(ev)) return false;
        const d = ev.data;
        if (d.scene !== 'checker' || d.w * d.h < 100 || !d.uniform) return false;
        const k = d.w + '|' + d.h;
        mem.c = mem.c || {}; mem.a = mem.a || {};
        if (d.method === 'center') mem.c[k] = true; else mem.a[k] = true;
        return !!(mem.c[k] && mem.a[k]);
      }
    },
    {
      id: 'image-digitization-h6', level: 8, hidden: true,
      riddle: { zh: '一九八七年問世的一種畫面，養大了一整個世代的電腦遊戲：每一點恰好一個位元組，整個畫面差一點點就塞滿一段記憶體。', en: 'A screen mode born in 1987 raised a whole generation of computer games: exactly one byte per dot, and the whole screen only just fits in one segment of memory.' },
      check: function (ev) { const d = ev.data; return isImg(ev) && d.w === 320 && d.h === 200 && d.bpp === 8; }
    },
    {
      id: 'image-digitization-h7', level: 8, hidden: true,
      riddle: { zh: '從最亮的角望向最暗的角，方盒子就成了一圈彩虹。', en: 'Look from the brightest corner towards the darkest one, and the box turns into a ring of rainbow.' },
      check: function (ev) {
        if (ev.type !== 'rotate3d') return false;
        const d = ev.data, v = d.dir;
        if (d.scene !== 'wheel' || d.mode !== 'color' || !v) return false;
        const n = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
        return n > 0 && (v[0] + v[1] + v[2]) / (n * Math.sqrt(3)) >= Math.cos(4 * Math.PI / 180);
      }
    },
    {
      id: 'image-digitization-h8', level: 9, hidden: true,
      riddle: { zh: '字越小越難寫；讓最多行的字，每一筆都恰好落進格子裡——連一點灰邊都不留。', en: 'The smaller the letters, the harder they are to draw. Make as many rows as possible fall exactly into the grid, without a single grey edge.' },
      check: function (ev) { const d = ev.data; return isImg(ev) && d.scene === 'eyechart' && d.method === 'area' && d.eyeRows >= 4; }
    },
    {
      id: 'image-digitization-h9', level: 9, hidden: true,
      riddle: { zh: '換了三次精細度，它一點也沒變——而它既不是最黑，也不是最白。', en: 'Its precision changed three times and it did not change at all — and it is neither the blackest nor the whitest.' },
      check: function (ev, mem) {
        if (!isProbe(ev)) return false;
        const d = ev.data;
        if (d.mode !== 'gray') return false;
        if (mem.key !== d.key) { mem.key = d.key; mem.vals = {}; }
        mem.vals[d.b] = d.gray;
        // 至少三種位元數（其中要有最粗的 2 位元與最細的 8 位元）存下的值都一樣，而且不是 0、255
        const g = mem.vals[2];
        if (g == null || mem.vals[8] !== g || g === 0 || g === 255) return false;
        return Object.keys(mem.vals).filter(function (b) { return mem.vals[b] === g; }).length >= 3;
      }
    },
    {
      id: 'image-digitization-h10', level: 10, hidden: true,
      riddle: { zh: '池心只投下一顆石子；把相機調好，讓憑空多出來的漣漪，中心剛好都落在四面的岸邊。', en: 'Only one stone fell into the middle of the pond. Set up the camera so that the ripples that appear from nowhere are all centred exactly on the shore, on all four sides.' },
      // 同心圓取每格中心點：寬 128 時假的圓心在左右兩邊（x = ±128 ÷ 256 = ±0.5 個畫面寬），高 72 時也在上下兩邊（y = ±72 ÷ 0.75 ÷ 256 = ±0.375）
      check: function (ev) { const d = ev.data; return isImg(ev) && d.scene === 'rings' && d.method === 'center' && d.w === 128 && d.h === 72; }
    }
  ]);
})();
