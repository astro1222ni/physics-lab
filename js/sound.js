/*
 * sound.js — 共用音效工具（Web Audio API 即時合成，不需要音檔）
 *
 * 音效預設關閉，由齒輪設定的「音效」開關控制（LabSettings.sound）。
 * 瀏覽器規定使用者要先點一下頁面才能出聲，這裡會在第一次點擊時自動解鎖。
 *
 * 用法（各模組）：
 *   LabSound.tone({ freq: 660, dur: 0.12, type: 'sine', gain: 0.3 })
 *   LabSound.noise({ dur: 0.08, gain: 0.4, filter: 1800, q: 1.2 })   // 撞擊、摩擦等
 *   LabSound.sweep({ from: 300, to: 900, dur: 0.25 })                 // 咻
 *   LabSound.enabled()  → 目前是否開啟
 * 所有函式在音效關閉時什麼都不做，可放心呼叫。
 * gain 是 0–1 的相對音量；輸出端有壓縮器避免爆音。
 * 手機與平板的小喇叭幾乎播不出 200 Hz 以下的聲音，主要頻率請放在 250 Hz 以上。
 */
(function () {
  'use strict';

  const MASTER = 1.0;
  let ctx = null;
  let master = null;

  function enabled() {
    return !!(window.LabSettings && window.LabSettings.get && window.LabSettings.get('sound'));
  }

  function audio() {
    if (!enabled()) return null;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) {
      ctx = new AC();
      // 壓縮器：讓整體夠大聲，又不會在多個聲音疊加時爆音
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -12;
      comp.knee.value = 8;
      comp.ratio.value = 4;
      comp.attack.value = 0.002;
      comp.release.value = 0.15;
      const makeup = ctx.createGain(); // 壓縮後補回音量（約 +7 dB），峰值仍低於 0 dBFS
      makeup.gain.value = 2.2;
      master = ctx.createGain();
      master.gain.value = MASTER;
      master.connect(comp);
      comp.connect(makeup);
      makeup.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // 第一次點擊／按鍵時解鎖音訊（行動裝置必須在使用者操作中啟動）
  function unlock() {
    if (enabled()) audio();
  }
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (t) {
    document.addEventListener(t, unlock, { capture: true, passive: true });
  });

  function env(g, t0, gain, attack, dur) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + dur);
  }
  function clamp01(x) { return Math.max(0, Math.min(1, x)); }

  function tone(o) {
    const a = audio(); if (!a) return;
    o = o || {};
    const t0 = a.currentTime + (o.delay || 0);
    const osc = a.createOscillator();
    const g = a.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.freq || 440, t0);
    env(g, t0, clamp01(o.gain == null ? 0.3 : o.gain), o.attack || 0.005, o.dur || 0.15);
    osc.connect(g); g.connect(master);
    osc.start(t0);
    osc.stop(t0 + (o.attack || 0.005) + (o.dur || 0.15) + 0.05);
  }

  function sweep(o) {
    const a = audio(); if (!a) return;
    o = o || {};
    const t0 = a.currentTime + (o.delay || 0);
    const dur = o.dur || 0.25;
    const osc = a.createOscillator();
    const g = a.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.from || 300, t0);
    osc.frequency.exponentialRampToValueAtTime(o.to || 900, t0 + dur);
    env(g, t0, clamp01(o.gain == null ? 0.25 : o.gain), o.attack || 0.01, dur);
    osc.connect(g); g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.1);
  }

  let noiseBuf = null;
  function noise(o) {
    const a = audio(); if (!a) return;
    o = o || {};
    if (!noiseBuf) {
      noiseBuf = a.createBuffer(1, a.sampleRate, a.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t0 = a.currentTime + (o.delay || 0);
    const src = a.createBufferSource();
    src.buffer = noiseBuf;
    const f = a.createBiquadFilter();
    f.type = o.filterType || 'bandpass';
    f.frequency.value = o.filter || 1500;
    f.Q.value = o.q || 1;
    const g = a.createGain();
    env(g, t0, clamp01(o.gain == null ? 0.4 : o.gain), o.attack || 0.002, o.dur || 0.1);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0);
    src.stop(t0 + (o.attack || 0.002) + (o.dur || 0.1) + 0.05);
  }

  window.LabSound = { enabled: enabled, tone: tone, sweep: sweep, noise: noise };

  // 從設定打開音效時，播放一聲提示音
  window.addEventListener('lab:settingschange', function (e) {
    if (e.detail && e.detail.name === 'sound' && e.detail.value) {
      tone({ freq: 880, dur: 0.12, gain: 0.25 });
      tone({ freq: 1320, dur: 0.15, gain: 0.2, delay: 0.1 });
    }
  });
})();
