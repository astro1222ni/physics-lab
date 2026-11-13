/*
 * music-audio.js — 音樂科共用的聲音引擎（Web Audio 即時合成，不用任何錄音檔）
 *
 * 和全站的 js/sound.js 分開：sound.js 是給小喇叭的短音效（有 5.5 倍補償增益），
 * 音樂實驗要長時間、多聲部地聽，所以這裡的訊號鏈刻意溫和，而且有聽力保護。
 *
 * 聽力保護與課堂規則（音樂科一定遵守）：
 *   - 全站「音效」開關關閉時什麼都不發聲（頁面照常跑畫面）；音量跟著齒輪設定的小／中／大。
 *   - 每個聲音都有淡入淡出（起音 ≥ 15 ms、釋音 ≥ 30 ms），不會突然大聲。
 *   - 主音量約 −13 dBFS，再經過高頻降低（8 kHz 以上 −9 dB）與限幅器（峰值不超過約 −9 dBFS）。
 *   - 8 kHz 以上的泛音另外依頻率衰減；超過取樣率 0.45 倍的成分直接丟掉（不產生混疊）。
 *   - 單一純音最長 4 秒（4 kHz 以上最長 2 秒）；持續音預設最長 12 秒，時間到自動淡出。
 *   - 分頁切到背景、關掉音效、按 Esc、離開頁面時，全部停止。
 *
 * 用法（頁面程式）：
 *   MusicAudio.tone({ f0: 220, partials: [1, 0.5, 0.33], dur: 1.2 })      // 加法合成的一個音
 *   MusicAudio.tone({ f0, partials: [{ k: 1, a: 1, p: 0 }, { k: 3, a: 0.3 }] })
 *   MusicAudio.modal({ modes: [{ f: 200, a: 1, tau: 0.8 }, { f: 319, a: 0.5, tau: 0.4 }] }) // 鼓、鐘：每個成分各自衰減
 *   const v = MusicAudio.sustain({ f0, partials }); v.set({ f0: 330 }, 0.05); v.stop();      // 持續音
 *   MusicAudio.hit({ at, gain: 0.5, filter: 2500, dur: 0.08 })                             // 打擊（濾波雜訊）
 *   const seq = MusicAudio.sequencer({ tick: function (t0, t1, start) { … 在 [t0, t1) 之間排程 … } });
 *   seq.begin(delay); seq.stop(); seq.elapsed();   // begin 回傳起點時刻；第一次 tick 在 begin 裡同步呼叫
 *   （音訊環境晚一步才開始跑時，排程器自動把起點與游標平移到音訊時鐘，可選 onRebase(delta, start) 通知頁面）
 *   const rv = MusicAudio.reverb({ t60: 1.5, wet: 0.35 }); MusicAudio.tone({ …, reverb: rv });
 *   MusicAudio.stopAll(); MusicAudio.onChange(function (n) { 停止鍵.disabled = n === 0; });
 *   if (!MusicAudio.enabled()) status.textContent = MusicAudio.offHint();
 * 時間單位都是秒；at 是音訊時間（MusicAudio.now()），省略就是「現在」。
 */
(function () {
  'use strict';

  const BUS = 0.22;          // 主音量（約 −13 dBFS）
  const MIN_ATTACK = 0.015;
  const MIN_RELEASE = 0.03;
  const PURE_MAX = 4;        // 純音最長秒數
  const PURE_HIGH_MAX = 2;   // 4 kHz 以上的純音
  const SUSTAIN_MAX = 12;    // 持續音預設最長秒數
  const HF_CORNER = 8000;    // 這個頻率以上的成分額外衰減
  const MAX_VOICES = 32;

  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  let ctx = null, bus = null, out = null;
  const voices = [];
  const listeners = [];

  function available() { return !!(window.AudioContext || window.webkitAudioContext); }
  function enabled() { return !!(window.LabSettings && window.LabSettings.get && window.LabSettings.get('sound')); }
  function volume() {
    const v = window.LabSettings && window.LabSettings.get && window.LabSettings.get('volume');
    return typeof v === 'number' ? v : 1;
  }

  /** 取得音訊環境（音效關閉或不支援時傳回 null）；第一次要在使用者按下按鈕時呼叫 */
  function context() {
    if (!enabled() || !available()) return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      bus = ctx.createGain();
      bus.gain.value = BUS;
      const shelf = ctx.createBiquadFilter();
      shelf.type = 'highshelf';
      shelf.frequency.value = HF_CORNER;
      shelf.gain.value = -9;
      const lim = ctx.createDynamicsCompressor();
      lim.threshold.value = -9;
      lim.knee.value = 0;
      lim.ratio.value = 20;
      lim.attack.value = 0.002;
      lim.release.value = 0.12;
      out = ctx.createGain();
      out.gain.value = volume();
      bus.connect(shelf); shelf.connect(lim); lim.connect(out); out.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  /** 目前的音訊時間（秒）；還沒有音訊環境時用頁面時鐘，畫面同步照樣可用 */
  function now() { return isAudioClock() ? ctx.currentTime : performance.now() / 1000; }
  function isAudioClock() { return !!(ctx && ctx.state === 'running'); }

  function notify() {
    const n = voices.length + (anyRunning() ? 1 : 0);
    listeners.forEach(function (f) { try { f(n); } catch (e) { /* 忽略 */ } });
  }
  function onChange(f) { listeners.push(f); }
  function playing() { return voices.length > 0; }

  function addVoice(h) {
    voices.push(h);
    while (voices.length > MAX_VOICES) voices[0].stop(0.05);
    notify();
  }
  function removeVoice(h) {
    const i = voices.indexOf(h);
    if (i >= 0) { voices.splice(i, 1); notify(); }
  }

  /** 高頻成分的額外衰減：8 kHz 以上依頻率反比降低；接近取樣率一半的丟掉 */
  function hfWeight(f) {
    if (!ctx || f >= 0.45 * ctx.sampleRate) return 0;
    return f > HF_CORNER ? HF_CORNER / f : 1;
  }

  /** 泛音參數 → PeriodicWave。partials 可以是 [a1, a2, …] 或 [{ k, a, p }]（p 是相位，弧度，正弦相位） */
  function periodicWave(f0, partials, normalize) {
    const list = (partials || [1]).map(function (x, i) {
      return typeof x === 'number' ? { k: i + 1, a: x, p: 0 } : { k: x.k || i + 1, a: x.a == null ? 1 : x.a, p: x.p || 0 };
    });
    const N = list.reduce(function (m, x) { return Math.max(m, x.k); }, 1) + 1;
    const real = new Float32Array(N), imag = new Float32Array(N);
    let sum = 0, count = 0;
    list.forEach(function (x) {
      const a = Math.abs(x.a) * hfWeight(x.k * f0) * Math.sign(x.a || 0);
      if (!a) return;
      // a·sin(kωt + p) = a·cos p · sin(kωt) + a·sin p · cos(kωt)
      imag[x.k] += a * Math.cos(x.p);
      real[x.k] += a * Math.sin(x.p);
      sum += Math.abs(a); count++;
    });
    if (!count) imag[1] = 1e-6;
    if (normalize === false && sum > 1) { for (let k = 0; k < N; k++) { real[k] /= sum; imag[k] /= sum; } }
    return { wave: ctx.createPeriodicWave(real, imag, { disableNormalization: normalize === false }), pure: count <= 1, top: list.reduce(function (m, x) { return x.a ? Math.max(m, x.k * f0) : m; }, f0) };
  }

  function clampGain(g) { return Math.max(0.0001, Math.min(1, g == null ? 0.7 : g)); }

  /** 輸出端：可選左右聲像與迴響（乾聲＋濕聲） */
  function route(node, o) {
    let last = node;
    if (o.pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, o.pan));
      last.connect(p); last = p;
    }
    if (o.reverb && o.reverb.input) {
      const dry = ctx.createGain(), wet = ctx.createGain();
      dry.gain.value = 1 - o.reverb.wet; wet.gain.value = o.reverb.wet;
      last.connect(dry); last.connect(wet);
      dry.connect(bus); wet.connect(o.reverb.input);
      return;
    }
    last.connect(bus);
  }

  /** 標準的包絡：起音 → 衰減到延持 → 釋音（全部指數或線性平滑，不會喀一聲） */
  function envelope(g, t0, o, dur) {
    const A = Math.max(MIN_ATTACK, o.attack || 0.02);
    const D = Math.max(0.01, o.decay == null ? 0.12 : o.decay);
    const S = Math.max(0, Math.min(1, o.sustain == null ? 0.8 : o.sustain));
    const R = Math.max(MIN_RELEASE, o.release || 0.12);
    const peak = clampGain(o.gain);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + A);
    g.gain.setTargetAtTime(Math.max(0.0001, peak * S), t0 + A, D / 3);
    const tr = t0 + Math.max(A + 0.01, dur);
    g.gain.setTargetAtTime(0.0001, tr, R / 4);
    return tr + R + 0.05;
  }

  function makeHandle(nodes, gainNode, tEnd) {
    const h = {
      playing: true, t0: now(), t1: tEnd,
      stop: function (fade) {
        if (!h.playing) return;
        h.playing = false;
        const t = ctx.currentTime, r = Math.max(MIN_RELEASE, fade == null ? 0.08 : fade);
        try {
          gainNode.gain.cancelScheduledValues(t);
          gainNode.gain.setValueAtTime(Math.max(0.0001, gainNode.gain.value), t);
          gainNode.gain.setTargetAtTime(0.0001, t, r / 4);
          nodes.forEach(function (n) { try { n.stop(t + r + 0.05); } catch (e) { /* 已停 */ } });
        } catch (e) { /* 忽略 */ }
        removeVoice(h);
      }
    };
    nodes[0].onended = function () { if (h.playing) { h.playing = false; removeVoice(h); } };
    return h;
  }

  /** 播放一個加法合成的音（同一個週期波形）。傳回控制物件；音效關閉時傳回 null */
  function tone(o) {
    o = o || {};
    if (!context()) return null;
    const f0 = Math.max(20, o.f0 || 440);
    const pw = periodicWave(f0, o.partials, o.normalize);
    const t0 = Math.max(ctx.currentTime, o.at || 0);
    let dur = o.dur == null ? 1 : o.dur;
    if (pw.pure) dur = Math.min(dur, pw.top >= 4000 ? PURE_HIGH_MAX : PURE_MAX);
    const osc = ctx.createOscillator();
    osc.setPeriodicWave(pw.wave);
    osc.frequency.setValueAtTime(f0, t0);
    if (o.detune) osc.detune.setValueAtTime(o.detune, t0);
    const g = ctx.createGain();
    const tEnd = envelope(g, t0, o, dur);
    osc.connect(g); route(g, o);
    osc.start(t0); osc.stop(tEnd);
    const h = makeHandle([osc], g, tEnd);
    addVoice(h);
    return h;
  }

  /**
   * 模態合成：每個成分有自己的頻率、振幅與衰減時間 tau（振幅降到 1/e 的秒數），
   * 適合鼓、鐘、撥弦、木琴這類泛音不一定是整數倍、高頻衰減較快的聲音。
   */
  function modal(o) {
    o = o || {};
    if (!context()) return null;
    const modes = (o.modes || []).filter(function (m) { return m.f > 20 && hfWeight(m.f) > 0 && m.a; }).slice(0, 24);
    if (!modes.length) return null;
    const t0 = Math.max(ctx.currentTime, o.at || 0);
    const A = Math.max(0.004, o.attack || 0.006); // 打擊的起音可以較快，但仍是平滑上升
    const sumA = modes.reduce(function (s, m) { return s + Math.abs(m.a) * hfWeight(m.f); }, 0) || 1;
    const longest = modes.reduce(function (s, m) { return Math.max(s, m.tau || 1); }, 0);
    const dur = Math.min(o.dur || longest * 5, modes.length === 1 ? PURE_MAX : 10);
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, t0);
    master.gain.linearRampToValueAtTime(clampGain(o.gain), t0 + A);
    master.gain.setTargetAtTime(0.0001, t0 + dur, 0.03);
    const nodes = [];
    modes.forEach(function (m) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(m.f, t0);
      const g = ctx.createGain();
      const amp = Math.abs(m.a) * hfWeight(m.f) / sumA;
      g.gain.setValueAtTime(amp, t0);
      g.gain.setTargetAtTime(0.00001, t0 + A, Math.max(0.01, m.tau || 1));
      osc.connect(g); g.connect(master);
      osc.start(t0); osc.stop(t0 + dur + 0.2);
      nodes.push(osc);
    });
    route(master, o);
    const h = makeHandle(nodes, master, t0 + dur + 0.2);
    addVoice(h);
    return h;
  }

  /** 持續音：可以即時改頻率、泛音與音量；最長 maxDur 秒後自動淡出（o.onEnd 會被呼叫） */
  function sustain(o) {
    o = o || {};
    if (!context()) return null;
    let f0 = Math.max(20, o.f0 || 440);
    let pw = periodicWave(f0, o.partials, o.normalize);
    const osc = ctx.createOscillator();
    osc.setPeriodicWave(pw.wave);
    osc.frequency.value = f0;
    const g = ctx.createGain();
    const t0 = ctx.currentTime;
    const A = Math.max(MIN_ATTACK, o.attack || 0.05);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(clampGain(o.gain), t0 + A);
    osc.connect(g); route(g, o);
    osc.start(t0);
    const h = makeHandle([osc], g, Infinity);
    let partials = o.partials;
    function limit() { return pw.pure ? (pw.top >= 4000 ? PURE_HIGH_MAX : PURE_MAX) : (o.maxDur || SUSTAIN_MAX); }
    let timer = setTimeout(timeUp, limit() * 1000);
    function timeUp() { if (h.playing) { h.stop(0.3); if (o.onEnd) o.onEnd('time'); } }
    h.set = function (p, ramp) {
      if (!h.playing) return;
      const t = ctx.currentTime, tc = Math.max(0.005, (ramp == null ? 0.03 : ramp) / 3);
      if (p.f0 != null) { f0 = Math.max(20, p.f0); osc.frequency.setTargetAtTime(f0, t, tc); }
      if (p.partials) partials = p.partials;
      if (p.partials || p.f0 != null) {
        const wasPure = pw.pure;
        pw = periodicWave(f0, partials, o.normalize);
        if (p.partials) osc.setPeriodicWave(pw.wave);
        if (pw.pure !== wasPure) { clearTimeout(timer); timer = setTimeout(timeUp, limit() * 1000); }
      }
      if (p.gain != null) g.gain.setTargetAtTime(clampGain(p.gain), t, tc);
    };
    const baseStop = h.stop;
    h.stop = function (fade) { clearTimeout(timer); baseStop(fade); };
    addVoice(h);
    return h;
  }

  let noiseBuf = null;
  /** 打擊：濾波後的雜訊短音，可加一個往下滑的音高成分（例如大鼓） */
  function hit(o) {
    o = o || {};
    if (!context()) return null;
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      let s = 12345;
      for (let i = 0; i < d.length; i++) { s = (s * 16807) % 2147483647; d[i] = s / 1073741823.5 - 1; }
    }
    const t0 = Math.max(ctx.currentTime, o.at || 0);
    const dur = Math.min(2, o.dur || 0.1);
    const g = ctx.createGain();
    const peak = clampGain(o.gain == null ? 0.5 : o.gain);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + 0.003);
    g.gain.setTargetAtTime(0.0001, t0 + 0.003, dur / 3);
    const nodes = [];
    if (o.noise !== 0) {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = o.type || 'bandpass';
      f.frequency.value = Math.min(o.filter || 2000, HF_CORNER);
      f.Q.value = o.q || 1;
      const ng = ctx.createGain();
      ng.gain.value = o.noise == null ? 1 : o.noise;
      src.connect(f); f.connect(ng); ng.connect(g);
      src.start(t0, Math.random() * 0.5); src.stop(t0 + dur * 4 + 0.05);
      nodes.push(src);
    }
    if (o.tone) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(o.tone, t0);
      if (o.toneTo) osc.frequency.exponentialRampToValueAtTime(o.toneTo, t0 + dur);
      const tg = ctx.createGain();
      tg.gain.value = o.toneGain == null ? 1 : o.toneGain;
      osc.connect(tg); tg.connect(g);
      osc.start(t0); osc.stop(t0 + dur * 4 + 0.05);
      nodes.push(osc);
    }
    if (!nodes.length) return null;
    route(g, o);
    const h = makeHandle(nodes, g, t0 + dur * 4);
    addVoice(h);
    return h;
  }

  /**
   * 迴響：用指數衰減的雜訊當脈衝響應（左右聲道不同，聽起來有空間感），衰減 60 dB 的時間 = t60。
   * 傳回 { input, wet, set(t60, wet) }，交給 tone/modal/hit 的 reverb 參數。音效關閉時傳回 null。
   */
  function reverb(o) {
    o = o || {};
    if (!context()) return null;
    const conv = ctx.createConvolver();
    const out = ctx.createGain();
    out.gain.value = 1;
    conv.connect(out); out.connect(bus);
    const rv = { input: conv, wet: Math.max(0, Math.min(1, o.wet == null ? 0.3 : o.wet)), t60: 0 };
    rv.set = function (t60, wet) {
      if (wet != null) rv.wet = Math.max(0, Math.min(1, wet));
      if (t60 != null && Math.abs(t60 - rv.t60) > 1e-3) {
        rv.t60 = Math.max(0.05, Math.min(8, t60));
        conv.buffer = impulse(rv.t60, o.predelay || 0.01);
      }
    };
    rv.set(o.t60 == null ? 1.2 : o.t60);
    return rv;
  }
  /** 脈衝響應：振幅 e^(−6.91 t / T60)（6.91 = ln 1000，振幅降到千分之一 = −60 dB） */
  function impulse(t60, pre) {
    const sr = ctx.sampleRate;
    const len = Math.max(1, Math.floor(sr * Math.min(8, t60 * 1.1 + pre)));
    const buf = ctx.createBuffer(2, len, sr);
    const k = 6.907755 / t60;
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let s = ch ? 987654 : 13579;
      const p0 = Math.floor(pre * sr);
      for (let i = p0; i < len; i++) {
        s = (s * 16807) % 2147483647;
        const t = (i - p0) / sr;
        d[i] = (s / 1073741823.5 - 1) * Math.exp(-k * t);
      }
    }
    // 能量正規化：讓不同 T60 的迴響聽起來差不多大聲
    let e = 0;
    const d0 = buf.getChannelData(0);
    for (let i = 0; i < len; i++) e += d0[i] * d0[i];
    const scale = 1 / Math.sqrt(Math.max(1e-9, e / sr) * 4);
    for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < len; i++) d[i] *= scale; }
    return buf;
  }

  /**
   * 排程器（節奏、音階、和弦進行）：每 25 ms 呼叫一次 tick(t0, t1)，頁面在 [t0, t1) 之間的時刻排出聲音。
   * 音效關閉時時鐘照跑（tick 照樣被呼叫、畫面照樣同步），只是排出去的聲音不會發聲。
   */
  function sequencer(o) {
    const look = o.lookahead || 0.12;
    let timer = null, cursor = 0, audioClock = false;
    const s = {
      running: false, start: 0,
      begin: function (delay) {
        s.stop();
        context();
        s.running = true;
        audioClock = isAudioClock();
        s.start = now() + (delay == null ? 0.06 : delay);
        cursor = s.start;
        timer = setInterval(step, 25);
        step();
        notifySeq();
        return s.start;
      },
      stop: function () {
        if (timer) clearInterval(timer);
        timer = null;
        if (s.running) { s.running = false; notifySeq(); }
      },
      /** 從開始到現在經過的秒數（畫面同步用） */
      elapsed: function () { return s.running ? now() - s.start : 0; }
    };
    function step() {
      // 開始時音訊環境還沒跑（用頁面時鐘），之後才跑起來：把起點與游標平移到音訊時鐘，節奏不中斷、不重複
      if (!audioClock && isAudioClock()) {
        const delta = ctx.currentTime - performance.now() / 1000;
        audioClock = true;
        s.start += delta;
        cursor += delta;
        if (o.onRebase) { try { o.onRebase(delta, s.start); } catch (e) { /* 忽略 */ } }
      }
      const t1 = now() + look;
      if (t1 <= cursor) return;
      try { o.tick(cursor, t1, s.start); } catch (e) { s.stop(); throw e; }
      cursor = t1;
    }
    sequencers.push(s);
    return s;
  }
  const sequencers = [];
  function notifySeq() { notify(); }
  function anyRunning() { return sequencers.some(function (s) { return s.running; }); }

  /** 全部停止（淡出） */
  function stopAll(fade) {
    sequencers.forEach(function (s) { s.stop(); });
    voices.slice().forEach(function (v) { v.stop(fade == null ? 0.08 : fade); });
    notify();
  }

  /** 音效關閉時的提示句 */
  function offHint() {
    return T('音效是關的：按「音效」開關打開就聽得到（畫面照常顯示）。', 'Sound is off: switch on “Sound” to hear it (the pictures work either way).');
  }
  /** 讓頁面上的音效開關閃一下，告訴學生在哪裡打開 */
  function flashSoundButton(btn) {
    btn = btn || document.getElementById('soundBtn');
    if (!btn) return;
    btn.classList.remove('mu-flash');
    void btn.offsetWidth;
    btn.classList.add('mu-flash');
    setTimeout(function () { btn.classList.remove('mu-flash'); }, 1600);
  }
  (function injectStyle() {
    const css = '@keyframes mu-flash{0%,100%{box-shadow:0 0 0 0 transparent}30%,70%{box-shadow:0 0 0 4px var(--accent)}}' +
      '.mu-flash{animation:mu-flash .8s ease-in-out 2}' +
      '@media (prefers-reduced-motion: reduce){.mu-flash{animation:none;outline:3px solid var(--accent)}}';
    const st = document.createElement('style');
    st.textContent = css;
    (document.head || document.documentElement).appendChild(st);
  })();

  // ---------- 自動停止：背景分頁、關音效、Esc、離開頁面 ----------
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') stopAll(0.05); });
  window.addEventListener('pagehide', function () { stopAll(0.03); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && (voices.length || anyRunning())) stopAll(0.1); });
  window.addEventListener('lab:settingschange', function (e) {
    if (!e.detail) return;
    if (e.detail.name === 'sound' && !e.detail.value) stopAll(0.05);
    if (e.detail.name === 'volume' && out) out.gain.setTargetAtTime(volume(), ctx.currentTime, 0.05);
  });

  window.MusicAudio = {
    available: available, enabled: enabled, context: context, now: now,
    tone: tone, modal: modal, sustain: sustain, hit: hit, reverb: reverb, sequencer: sequencer,
    stopAll: stopAll, playing: function () { return playing() || anyRunning(); }, onChange: onChange,
    offHint: offHint, flashSoundButton: flashSoundButton,
    LIMITS: { BUS: BUS, PURE_MAX: PURE_MAX, PURE_HIGH_MAX: PURE_HIGH_MAX, SUSTAIN_MAX: SUSTAIN_MAX, HF_CORNER: HF_CORNER, MIN_ATTACK: MIN_ATTACK, MIN_RELEASE: MIN_RELEASE }
  };
})();
