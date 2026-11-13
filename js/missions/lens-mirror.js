/* missions/lens-mirror.js — 透鏡與面鏡成像的任務（星星數 = 等級 1–10）
 * 事件：'image'（使用者調整後、設定停止變動約 0.3 s 時回報一次）
 *   data = { element, kind, f（帶正負號）, fAbs, p, h, q, m, hImg, real, upright, size, atInfinity, case, fan, rays }
 */
(function () {
  'use strict';
  if (!window.LabMission) return;

  const near = function (a, b, tol) { return isFinite(a) && Math.abs(a - b) <= tol; };
  const same = function (a, b) { return Math.abs(a - b) < 1e-6; };
  // 記錄最近幾次成像，供「兩種設定比較」的任務使用
  const remember = function (mem, d, n) {
    const list = mem.list = mem.list || [];
    const last = list[list.length - 1];
    if (!last || last.element !== d.element || !same(last.fAbs, d.fAbs) || !same(last.p, d.p) || !same(last.h, d.h)) list.push(d);
    if (list.length > (n || 16)) list.shift();
    return list;
  };
  const img = function (ev, el) { return ev.type === 'image' && (!el || ev.data.element === el); };

  LabMission.register('lens-mirror', [
    {
      id: 'lens-mirror-1', level: 1,
      title: { zh: '一樣大的自己', en: 'Same size' },
      desc: { zh: '用凸透鏡成一個倒立、與物體等大的實像。', en: 'Use a convex lens to form a real, inverted image exactly the same size as the object.' },
      check: function (ev) { const d = ev.data; return img(ev, 'convex-lens') && d.real && d.size === 'same'; }
    },
    {
      id: 'lens-mirror-2', level: 2,
      title: { zh: '放大鏡', en: 'Magnifying glass' },
      desc: { zh: '用凸透鏡得到正立的虛像，而且放大率至少 3 倍（m ≥ 3）。', en: 'Use a convex lens to get an upright virtual image magnified at least 3 times (m ≥ 3).' },
      check: function (ev) { const d = ev.data; return img(ev, 'convex-lens') && !d.real && !d.atInfinity && d.m >= 3; }
    },
    {
      id: 'lens-mirror-3', level: 3,
      title: { zh: '探照燈', en: 'Searchlight' },
      desc: { zh: '讓凹面鏡的反射光全部互相平行（不成像，像在無窮遠）。', en: 'Make all the light reflected by a concave mirror leave parallel (no image — it is at infinity).' },
      check: function (ev) { return img(ev, 'concave-mirror') && ev.data.atInfinity; }
    },
    {
      id: 'lens-mirror-4', level: 4,
      title: { zh: '路口的反光鏡', en: 'Mirror at the corner' },
      desc: { zh: '用凸面鏡成像，讓像高恰好是物高的一半（m = 0.500，誤差 ±0.005）。', en: 'With a convex mirror, make the image exactly half as tall as the object (m = 0.500 ± 0.005).' },
      check: function (ev) { return img(ev, 'convex-mirror') && near(ev.data.m, 0.5, 0.005); }
    },
    {
      id: 'lens-mirror-5', level: 5,
      title: { zh: '投影機', en: 'Projector' },
      desc: { zh: '用凸透鏡把放大至少 2 倍的實像投在透鏡另一側 40.0 cm 處的屏幕上（q = 40.0 ± 0.2 cm）。', en: 'With a convex lens, project a real image magnified at least 2 times onto a screen 40.0 cm behind the lens (q = 40.0 ± 0.2 cm).' },
      check: function (ev) { const d = ev.data; return img(ev, 'convex-lens') && d.real && near(d.q, 40, 0.2) && d.m <= -2; }
    },
    {
      id: 'lens-mirror-6', level: 6,
      title: { zh: '共軛位置', en: 'Conjugate positions' },
      desc: { zh: '凸透鏡焦距不變，物體與屏幕相距 45.0 cm（p + q = 45.0 ± 0.2 cm）。找出兩個相差至少 5 cm 的物距，都能在屏幕上成實像。', en: 'Keep the focal length of a convex lens fixed with object and screen 45.0 cm apart (p + q = 45.0 ± 0.2 cm). Find two object distances at least 5 cm apart that both give a real image on the screen.' },
      check: function (ev, mem) {
        if (!img(ev, 'convex-lens')) return false;
        const d = ev.data;
        if (!d.real || !near(d.p + d.q, 45, 0.2)) return false;
        return remember(mem, d).some(function (o) {
          return o !== d && o.element === 'convex-lens' && o.real && same(o.fAbs, d.fAbs) && near(o.p + o.q, 45, 0.2) && Math.abs(o.p - d.p) >= 5;
        });
      }
    },
    {
      id: 'lens-mirror-7', level: 7,
      title: { zh: '兩種兩倍', en: 'Two kinds of double' },
      desc: { zh: '同一面凹面鏡（焦距不變），找出兩個物距，讓像都放大 2 倍（|m| = 2.00 ± 0.02）：一次是實像，一次是虛像。', en: 'With the same concave mirror (fixed focal length), find two object distances that both give an image magnified 2 times (|m| = 2.00 ± 0.02): one real, one virtual.' },
      check: function (ev, mem) {
        if (!img(ev, 'concave-mirror')) return false;
        const d = ev.data;
        if (d.atInfinity || !near(Math.abs(d.m), 2, 0.02)) return false;
        return remember(mem, d).some(function (o) {
          return o !== d && o.element === 'concave-mirror' && !o.atInfinity && same(o.fAbs, d.fAbs) && near(Math.abs(o.m), 2, 0.02) && o.real !== d.real;
        });
      }
    },
    {
      id: 'lens-mirror-8', level: 8,
      title: { zh: '凹透鏡的謎題', en: 'Concave-lens puzzle' },
      desc: { zh: '用凹透鏡得到放大率 m = 0.250（±0.003）、像距 q = −6.00 cm（±0.05 cm）的虛像。焦距和物距都要算出來。', en: 'With a concave lens, get a virtual image with m = 0.250 (±0.003) and q = −6.00 cm (±0.05 cm). Work out both the focal length and the object distance.' },
      check: function (ev) { const d = ev.data; return img(ev, 'concave-lens') && near(d.m, 0.25, 0.003) && near(d.q, -6, 0.05); }
    },
    {
      id: 'lens-mirror-9', level: 9,
      title: { zh: '明視距離', en: 'Near point' },
      desc: { zh: '設計一個放大鏡：用凸透鏡讓虛像落在透鏡前 25.0 cm（q = −25.0 ± 0.1 cm，人眼的明視距離），且放大率 m = 5.00（±0.02）。', en: 'Design a magnifier: with a convex lens, put the virtual image 25.0 cm in front of the lens (q = −25.0 ± 0.1 cm, the eye’s near point) with magnification m = 5.00 (±0.02).' },
      check: function (ev) { const d = ev.data; return img(ev, 'convex-lens') && !d.real && near(d.q, -25, 0.1) && near(d.m, 5, 0.02); }
    },
    {
      id: 'lens-mirror-10', level: 10,
      title: { zh: '大師：完美投影', en: 'Master: perfect projection' },
      desc: { zh: '用凸透鏡在另一側 36.00 cm 處（±0.05 cm）成倒立實像，放大率恰為 m = −3.00（±0.01），像高恰為 15.00 cm（|h′| 誤差 ±0.05 cm）。焦距、物距、物高三者都要算對。', en: 'With a convex lens, form an inverted real image 36.00 cm behind the lens (±0.05 cm) with magnification exactly −3.00 (±0.01) and an image exactly 15.00 cm tall (|h′| ± 0.05 cm). Focal length, object distance and object height must all be right.' },
      check: function (ev) {
        const d = ev.data;
        return img(ev, 'convex-lens') && d.real && near(d.q, 36, 0.05) && near(d.m, -3, 0.01) && near(Math.abs(d.hImg), 15, 0.05);
      }
    },
    // ---------- 隱藏任務：只給隱晦的提示 ----------
    {
      id: 'lens-mirror-h1', level: 4, hidden: true,
      riddle: { zh: '站在它夢裡那個完整的圓的心上，你會遇見一個頭下腳上、卻和你一樣高的人。', en: 'Stand at the heart of the whole circle it dreams of, and you will meet someone upside down, yet exactly as tall as you.' },
      check: function (ev) { return img(ev, 'concave-mirror') && ev.data.case === 'at2F'; }
    },
    {
      id: 'lens-mirror-h2', level: 6, hidden: true,
      riddle: { zh: '千絲萬縷，終歸一點；那一點，比源頭還要巨大。', en: 'A thousand threads gather into one point — and that point is greater than where they began.' },
      check: function (ev) { const d = ev.data; return ev.type === 'image' && d.fan && d.real && d.m <= -4 + 1e-9; }
    },
    {
      id: 'lens-mirror-h3', level: 8, hidden: true,
      riddle: { zh: '穿過玻璃的光，從此再也不相見。', en: 'Light that passes through the glass will never meet again.' },
      check: function (ev) { const d = ev.data; return img(ev, 'convex-lens') && d.atInfinity && d.fan; }
    }
  ]);
})();
