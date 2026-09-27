/* ============================================================
 * Web Audio 音效引擎（全部程序化合成，无外部资源）
 * ============================================================ */
const SFX = (() => {
  let ctx = null;
  let master = null;
  let muted = false;
  let lastShot = 0;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
    } catch (e) { return false; }
    return true;
  }

  function resume() {
    if (ensure() && ctx.state === 'suspended') ctx.resume();
  }

  /* 基础发声：振荡器 + 音量包络 */
  function tone({ freq = 440, freqEnd = null, type = 'sine', dur = 0.15, vol = 0.5, delay = 0, attack = 0.005 }) {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(master);
    osc.start(t0); osc.stop(t0 + dur + 0.05);
  }

  /* 噪声爆发（击杀/爆炸） */
  function noise({ dur = 0.2, vol = 0.4, delay = 0, freq = 1000 }) {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(filter); filter.connect(g); g.connect(master);
    src.start(t0);
  }

  const api = {
    resume,
    get muted() { return muted; },
    toggleMute() { muted = !muted; return muted; },

    click()   { tone({ freq: 660, freqEnd: 440, type: 'triangle', dur: 0.08, vol: 0.3 }); },
    tick()    { tone({ freq: 1200, freqEnd: 900, type: 'square', dur: 0.035, vol: 0.16 }); },
    coin()    { tone({ freq: 988, type: 'square', dur: 0.07, vol: 0.25 });
                tone({ freq: 1319, type: 'square', dur: 0.12, vol: 0.25, delay: 0.07 }); },
    levelUp() { [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.14, vol: 0.3, delay: i * 0.07 })); },
    shoot()   {
      const now = performance.now();
      if (now - lastShot < 70) return;
      lastShot = now;
      tone({ freq: 520, freqEnd: 220, type: 'sawtooth', dur: 0.07, vol: 0.10 });
    },
    kill()    { noise({ dur: 0.18, vol: 0.35, freq: 1400 }); tone({ freq: 300, freqEnd: 60, type: 'sawtooth', dur: 0.2, vol: 0.3 }); },
    escape()  { tone({ freq: 220, freqEnd: 110, type: 'sawtooth', dur: 0.25, vol: 0.2 }); },
    wave()    { tone({ freq: 160, freqEnd: 320, type: 'sawtooth', dur: 0.5, vol: 0.28 });
                tone({ freq: 80,  type: 'sine', dur: 0.6, vol: 0.3 }); },
    bossWave(){ tone({ freq: 110, freqEnd: 55, type: 'sawtooth', dur: 0.9, vol: 0.4 });
                noise({ dur: 0.6, vol: 0.3, freq: 400 }); },

    /* 抽奖中奖：按奖品等级递增华丽度 */
    win(tier) {
      const base = [523, 659, 784, 1047];
      const seqs = [
        [523, 659],
        [523, 659, 784],
        [523, 659, 784, 1047, 784, 1047],
        [523, 659, 784, 1047, 1319, 1047, 1319, 1568],
      ];
      const seq = seqs[Math.min(tier, 3)];
      seq.forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.16, vol: 0.32, delay: i * 0.09 }));
      if (tier >= 3) noise({ dur: 0.5, vol: 0.2, freq: 3000, });
    },
    spinStart() { tone({ freq: 220, freqEnd: 880, type: 'sawtooth', dur: 0.4, vol: 0.2 }); },
    gameEnd() {
      [784, 784, 784, 659, 784, 1047].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.22, vol: 0.3, delay: i * 0.18 }));
    },
  };
  return api;
})();
if (typeof module !== 'undefined' && module.exports) { module.exports = { SFX }; }
