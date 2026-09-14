// ---------- Professional synthesized audio (WebAudio, zero assets) ----------
// Master chain: [sfx|music] → compressor → soft-clip waveshaper → out
// SFX are multi-layered (sub + body + air) with filter envelopes + reverb send.
// Music is a lookahead-scheduled synthwave sequencer with 3 intensity tiers.

type SFXName =
  | "punch" | "whiff" | "zap" | "dash" | "boom" | "hit" | "explode"
  | "pickup" | "wave" | "over" | "ui" | "roar" | "slam" | "warn"
  | "flurry" | "deflect" | "cyclone" | "wreck" | "grapple" | "charge"
  | "bossroar" | "levelup" | "heartbeat" | "summon" | "beam" | "clang"
  | "meteor" | "chain" | "bubble" | "missile" | "swap" | "skin" | "space" | "rebuild" | "step";

interface ToneOpts {
  t: number; dur: number; f0: number; f1?: number; peak: number;
  type?: OscillatorType; a?: number; detune?: number;
  filter?: { type: BiquadFilterType; f0: number; f1?: number; q?: number };
  send?: number; // reverb send 0..1
  curve?: "exp" | "lin";
}
interface NoiseOpts {
  t: number; dur: number; f0: number; f1?: number; peak: number;
  type?: BiquadFilterType; q?: number; a?: number; send?: number;
}

class AudioEngine {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  comp: DynamicsCompressorNode | null = null;
  sfxBus: GainNode | null = null;
  musicBus: GainNode | null = null;
  reverb: ConvolverNode | null = null;
  reverbSend: GainNode | null = null;
  noiseBuf: AudioBuffer | null = null;
  muted = false;
  private lastPlay: Record<string, number> = {};

  /* ---------------- music sequencer state ---------------- */
  private seqTimer: number | null = null;
  private nextStep = 0;          // absolute ctx time of next 16th
  private step = 0;
  private bpm = 104;
  intensity = 0;                 // 0 calm · 1 combat · 2 boss
  private musicOn = false;
  private musicNodes: AudioNode[] = [];
  private leadDelay: DelayNode | null = null;
  private padGain: GainNode | null = null;

  ensure(): void {
    if (this.ctx) { if (this.ctx.state === "suspended") void this.ctx.resume(); return; }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC({ latencyHint: "interactive" });

    // ---- master chain: compressor → soft clip ----
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.85;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -16;
    this.comp.knee.value = 22;
    this.comp.ratio.value = 7;
    this.comp.attack.value = 0.003;
    this.comp.release.value = 0.22;
    const shaper = ctx.createWaveShaper();
    const n = 1024, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * 1.6) * 0.92; // gentle saturation, keeps transients punchy
    }
    shaper.curve = curve;
    this.comp.connect(shaper); shaper.connect(this.master);
    this.master.connect(ctx.destination);

    // ---- buses ----
    this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = 0.9;
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = 0.3;
    this.sfxBus.connect(this.comp); this.musicBus.connect(this.comp);

    // ---- procedural reverb (2s exponential-decay stereo IR) ----
    this.reverb = ctx.createConvolver();
    const irLen = Math.floor(ctx.sampleRate * 2);
    const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < irLen; i++) {
        const t = i / irLen;
        const decay = Math.pow(1 - t, 2.6);
        d[i] = (Math.random() * 2 - 1) * decay * (i < ctx.sampleRate * 0.01 ? t * 100 : 1);
      }
    }
    this.reverb.buffer = ir;
    this.reverbSend = ctx.createGain(); this.reverbSend.gain.value = 1;
    const wet = ctx.createGain(); wet.gain.value = 0.16;
    this.reverbSend.connect(this.reverb); this.reverb.connect(wet); wet.connect(this.comp);

    // ---- shared noise buffer (2s) ----
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      brown = (brown + 0.02 * w) / 1.02; // pink-ish
      data[i] = w * 0.7 + brown * 2.4;
    }

    this.applyVolumes();
    this.startSequencer();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.applyVolumes();
  }

  /** volume mixer (0..1 each) — persisted by the settings store */
  vol = { master: 0.85, sfx: 1, music: 0.55 };

  setVolumes(v: { master?: number; sfx?: number; music?: number }): void {
    if (v.master !== undefined) this.vol.master = Math.min(1, Math.max(0, v.master));
    if (v.sfx !== undefined) this.vol.sfx = Math.min(1, Math.max(0, v.sfx));
    if (v.music !== undefined) this.vol.music = Math.min(1, Math.max(0, v.music));
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const m = this.muted ? 0 : this.vol.master;
    this.master?.gain.setTargetAtTime(m, t, 0.05);
    this.sfxBus?.gain.setTargetAtTime(0.9 * this.vol.sfx, t, 0.05);
    this.musicBus?.gain.setTargetAtTime(0.3 * this.vol.music, t, 0.08);
  }


  /** 0 = calm flight · 1 = combat · 2 = boss warlord */
  setIntensity(i: number): void {
    if (!this.musicOn) { this.intensity = i; return; }
    if (i === this.intensity) return;
    this.intensity = i;
    this.bpm = i === 2 ? 126 : i === 1 ? 112 : 92;
    if (this.ctx && this.padGain) {
      // boss tier: darker, louder pad
      this.padGain.gain.setTargetAtTime(i === 2 ? 0.16 : 0.1, this.ctx.currentTime, 0.8);
    }
  }

  /* ---------------- low-level voices ---------------- */

  private osc(o: ToneOpts): void {
    const ctx = this.ctx!; const t = o.t;
    const osc = ctx.createOscillator();
    osc.type = o.type ?? "sine";
    osc.frequency.setValueAtTime(o.f0, t);
    if (o.detune) osc.detune.value = o.detune;
    const f1 = Math.max(1, o.f1 ?? o.f0);
    if (o.curve === "lin") osc.frequency.linearRampToValueAtTime(f1, t + o.dur);
    else osc.frequency.exponentialRampToValueAtTime(f1, t + o.dur);
    const g = ctx.createGain();
    const a = o.a ?? 0.004, peak = Math.max(0.0002, o.peak);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    let out: AudioNode = g;
    if (o.filter) {
      const f = ctx.createBiquadFilter();
      f.type = o.filter.type;
      f.frequency.setValueAtTime(o.filter.f0, t);
      if (o.filter.f1) f.frequency.exponentialRampToValueAtTime(Math.max(1, o.filter.f1), t + o.dur);
      f.Q.value = o.filter.q ?? 1;
      osc.connect(f); f.connect(g);
    } else osc.connect(g);
    g.connect(this.sfxBus!);
    if (o.send && this.reverbSend) {
      const s = ctx.createGain(); s.gain.value = o.send * peak;
      out.connect(s); s.connect(this.reverbSend);
    }
    osc.start(t); osc.stop(t + o.dur + 0.05);
  }

  private nz(o: NoiseOpts): void {
    const ctx = this.ctx!; const t = o.t;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf!;
    src.loop = true;
    src.playbackRate.value = 0.85 + Math.random() * 0.3;
    const f = ctx.createBiquadFilter();
    f.type = o.type ?? "bandpass";
    f.frequency.setValueAtTime(o.f0, t);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t + o.dur);
    f.Q.value = o.q ?? 1;
    const g = ctx.createGain();
    const a = o.a ?? 0.005, peak = Math.max(0.0002, o.peak);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(f); f.connect(g); g.connect(this.sfxBus!);
    if (o.send && this.reverbSend) {
      const s = ctx.createGain(); s.gain.value = o.send * peak;
      g.connect(s); s.connect(this.reverbSend);
    }
    src.start(t); src.stop(t + o.dur + 0.05);
  }

  /** momentary master duck — sells heavyweight impacts */
  private duck(amount: number): void {
    if (!this.musicBus || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicBus.gain.cancelScheduledValues(t);
    this.musicBus.gain.setValueAtTime(this.musicBus.gain.value, t);
    this.musicBus.gain.linearRampToValueAtTime(0.3 - amount, t + 0.02);
    this.musicBus.gain.setTargetAtTime(0.3, t + 0.03, 0.18);
  }

  /* ---------------- SFX ---------------- */

  play(name: SFXName, power = 1): void {
    this.ensure();
    if (!this.ctx || this.muted) return;
    const now = performance.now();
    const minGap = name === "zap" ? 55 : name === "punch" ? 45 : 35;
    if (this.lastPlay[name] && now - this.lastPlay[name] < minGap) return;
    this.lastPlay[name] = now;
    const t = this.ctx.currentTime + 0.001;

    switch (name) {
      case "punch": {
        // transient skin click + heavy body thump + air displacement
        this.nz({ t, dur: 0.02, f0: 3800, peak: 0.32 * power, type: "highpass", q: 0.7 });
        this.osc({ t, dur: 0.16, f0: 175, f1: 44, peak: 0.62 * power, type: "sine", a: 0.002 });
        this.osc({ t, dur: 0.09, f0: 95, f1: 38, peak: 0.3 * power, type: "triangle" });
        this.nz({ t, dur: 0.11, f0: 620, f1: 180, peak: 0.24 * power, type: "bandpass", q: 1.1 });
        break;
      }
      case "whiff":
        this.nz({ t, dur: 0.16, f0: 900, f1: 2600, peak: 0.13, type: "bandpass", q: 2.2 });
        break;
      case "flurry":
        this.nz({ t, dur: 0.018, f0: 4200, peak: 0.2 * power, type: "highpass", q: 0.6 });
        this.osc({ t, dur: 0.08, f0: 210, f1: 62, peak: 0.4 * power, type: "sine", a: 0.001 });
        break;
      case "zap": {
        this.osc({ t, dur: 0.1, f0: 1750, f1: 240, peak: 0.17, type: "square", filter: { type: "lowpass", f0: 3400, f1: 700, q: 3 } });
        this.osc({ t, dur: 0.07, f0: 3100, f1: 1100, peak: 0.07, type: "sawtooth" });
        this.nz({ t, dur: 0.05, f0: 5200, peak: 0.06, type: "highpass", q: 1 });
        break;
      }
      case "dash": {
        // doppler whoosh: band sweep up then down + sub rumble
        this.nz({ t, dur: 0.14, f0: 380, f1: 2600, peak: 0.34, type: "bandpass", q: 1.6, send: 0.3 });
        this.nz({ t: t + 0.1, dur: 0.24, f0: 2400, f1: 260, peak: 0.3, type: "bandpass", q: 1.4 });
        this.osc({ t, dur: 0.3, f0: 84, f1: 33, peak: 0.48, type: "sine" });
        break;
      }
      case "boom":
        this.explode(t, 0.9 * power, 0.5);
        break;
      case "slam": {
        this.explode(t, 1.15, 0.75);
        this.duck(0.18);
        break;
      }
      case "hit":
        this.osc({ t, dur: 0.15, f0: 235, f1: 58, peak: 0.42 * power, type: "triangle" });
        this.nz({ t, dur: 0.12, f0: 780, f1: 220, peak: 0.3 * power, type: "bandpass", q: 1.3 });
        break;
      case "clang": {
        // deflected/metallic impact — inharmonic partials
        [1870, 2463, 3141].forEach((f, i) => this.osc({ t, dur: 0.22 - i * 0.05, f0: f, f1: f * 0.98, peak: 0.12 / (i + 1), type: "sine", send: 0.5 }));
        this.nz({ t, dur: 0.05, f0: 5000, peak: 0.14, type: "highpass", q: 1 });
        break;
      }
      case "meteor": {
        // falling fireball: rising roar → massive impact
        this.nz({ t, dur: 0.9, f0: 300, f1: 1400, peak: 0.22, type: "bandpass", q: 0.8, send: 0.4 });
        this.osc({ t, dur: 0.9, f0: 60, f1: 210, peak: 0.14, type: "sawtooth", filter: { type: "lowpass", f0: 400 } });
        const ti = t + 0.88;
        this.explode(ti, 1.15, 0.55);
        this.osc({ t: ti, dur: 0.7, f0: 52, f1: 24, peak: 0.7, type: "sine" });
        this.nz({ t: ti, dur: 0.5, f0: 900, f1: 120, peak: 0.5, type: "lowpass" });
        break;
      }
      case "chain": {
        // crackling chain lightning — cascading zaps
        for (let i = 0; i < 5; i++) {
          const z = t + i * 0.07;
          this.nz({ t: z, dur: 0.06, f0: 5200 - i * 600, f1: 2400, peak: 0.24, type: "bandpass", q: 2, send: 0.45 });
          this.osc({ t: z, dur: 0.1, f0: 1400 + i * 320, f1: 380, peak: 0.1, type: "square", filter: { type: "lowpass", f0: 2600 } });
        }
        break;
      }
      case "bubble": {
        // energy shield bloom — glassy chord swell
        [523, 659, 784, 1046].forEach((f, i) => this.osc({ t: t + i * 0.02, dur: 0.85, f0: f, f1: f * 1.01, peak: 0.09, type: "sine", a: 0.12, send: 0.6 }));
        this.nz({ t, dur: 0.4, f0: 3200, f1: 6400, peak: 0.06, type: "bandpass", q: 3 });
        break;
      }
      case "missile": {
        // launch thump + rocket sizzle
        this.osc({ t, dur: 0.2, f0: 220, f1: 70, peak: 0.4, type: "triangle" });
        this.nz({ t, dur: 0.55, f0: 900, f1: 2400, peak: 0.16, type: "bandpass", q: 0.9, send: 0.3 });
        break;
      }
      case "swap": {
        // loadout swap — slick two-tone blip
        this.osc({ t, dur: 0.09, f0: 620, f1: 1240, peak: 0.16, type: "square", filter: { type: "lowpass", f0: 1800 } });
        this.osc({ t: t + 0.07, dur: 0.12, f0: 1240, f1: 1860, peak: 0.12, type: "sine" });
        break;
      }
      case "skin": {
        // transformation shimmer — ascending arpeggio
        [392, 494, 587, 784, 988].forEach((f, i) =>
          this.osc({ t: t + i * 0.055, dur: 0.3, f0: f, f1: f * 2, peak: 0.1, type: "triangle", a: 0.01, send: 0.5 }));
        break;
      }
      case "space": {
        // entering orbit — deep airy pad + shimmer
        this.osc({ t, dur: 2.2, f0: 110, f1: 165, peak: 0.16, type: "sine", a: 0.5, send: 0.7 });
        this.osc({ t, dur: 2.2, f0: 220, f1: 330, peak: 0.08, type: "sine", a: 0.6, send: 0.7 });
        this.nz({ t, dur: 1.6, f0: 400, f1: 6000, peak: 0.05, type: "bandpass", q: 1.4 });
        break;
      }
      case "step": {
        // footfall: short filtered thud
        this.nz({ t, dur: 0.045, f0: 900, f1: 240, peak: 0.1 * power, type: "lowpass" });
        this.osc({ t, dur: 0.06, f0: 120, f1: 60, peak: 0.08 * power, type: "sine" });
        break;
      }
      case "rebuild": {
        // reconstruction hum — rising synth build
        this.osc({ t, dur: 1.1, f0: 160, f1: 640, peak: 0.13, type: "sawtooth", filter: { type: "lowpass", f0: 900, f1: 2600 }, send: 0.4 });
        [880, 1320].forEach((f, i) => this.osc({ t: t + 0.8 + i * 0.06, dur: 0.25, f0: f, peak: 0.09, type: "sine" }));
        break;
      }
      case "explode": this.explode(t, 0.75 * power, 0.4); break;
      case "wreck": {
        // heavy metal crunch with debris rain
        this.osc({ t, dur: 0.36, f0: 88, f1: 25, peak: 0.6 * power, type: "sine" });
        this.nz({ t, dur: 0.3, f0: 460, f1: 90, peak: 0.5 * power, type: "lowpass", q: 0.7, send: 0.35 });
        this.nz({ t: t + 0.05, dur: 0.5, f0: 1500, f1: 500, peak: 0.16 * power, type: "bandpass", q: 2.4, send: 0.5 });
        for (let i = 0; i < 4; i++) this.nz({ t: t + 0.1 + Math.random() * 0.4, dur: 0.05, f0: 2400 + Math.random() * 2000, peak: 0.06, type: "bandpass", q: 5 });
        break;
      }
      case "pickup":
        this.osc({ t, dur: 0.07, f0: 660, f1: 990, peak: 0.13, type: "sine" });
        this.osc({ t: t + 0.06, dur: 0.11, f0: 990, f1: 1560, peak: 0.13, type: "sine" });
        this.osc({ t: t + 0.06, dur: 0.11, f0: 1980, peak: 0.04, type: "sine" });
        break;
      case "wave":
        this.osc({ t, dur: 0.5, f0: 175, f1: 640, peak: 0.14, type: "sawtooth", filter: { type: "lowpass", f0: 700, f1: 2400, q: 2 }, send: 0.5 });
        this.osc({ t, dur: 0.5, f0: 88, f1: 330, peak: 0.13, type: "triangle", send: 0.4 });
        this.nz({ t, dur: 0.4, f0: 800, f1: 3200, peak: 0.05, type: "bandpass", q: 3 });
        break;
      case "over":
        this.osc({ t, dur: 0.7, f0: 110, f1: 880, peak: 0.24, type: "sawtooth", filter: { type: "lowpass", f0: 500, f1: 3000, q: 3 }, send: 0.6 });
        this.nz({ t, dur: 0.5, f0: 1800, f1: 5000, peak: 0.16, type: "highpass", q: 1, send: 0.6 });
        this.osc({ t: t + 0.5, dur: 0.35, f0: 880, f1: 440, peak: 0.2, type: "square", filter: { type: "lowpass", f0: 2000, q: 1 } });
        break;
      case "levelup": {
        // growth fanfare — rising 5th arpeggio
        [523, 659, 784, 1047].forEach((f, i) => {
          this.osc({ t: t + i * 0.09, dur: 0.4, f0: f, peak: 0.16, type: "triangle", send: 0.6 });
          this.osc({ t: t + i * 0.09, dur: 0.4, f0: f * 2, peak: 0.05, type: "sine", send: 0.6 });
        });
        this.nz({ t, dur: 0.6, f0: 3000, f1: 8000, peak: 0.05, type: "highpass", q: 0.6, send: 0.7 });
        break;
      }
      case "ui":
        this.osc({ t, dur: 0.05, f0: 900, f1: 680, peak: 0.08, type: "sine" });
        break;
      case "roar":
        this.roar(t, 0.55, 90);
        break;
      case "bossroar": {
        // layered viltrumite warlord roar
        this.roar(t, 1, 55);
        this.roar(t + 0.12, 0.6, 47);
        this.nz({ t, dur: 1.2, f0: 240, f1: 90, peak: 0.3, type: "lowpass", q: 1, send: 0.7 });
        this.duck(0.2);
        break;
      }
      case "warn":
        this.osc({ t, dur: 0.14, f0: 540, peak: 0.13, type: "square", filter: { type: "lowpass", f0: 1600, q: 2 } });
        this.osc({ t: t + 0.19, dur: 0.14, f0: 540, peak: 0.13, type: "square", filter: { type: "lowpass", f0: 1600, q: 2 } });
        break;
      case "deflect":
        [2100, 2900].forEach((f, i) => this.osc({ t, dur: 0.15 - i * 0.04, f0: f, f1: f * 0.9, peak: 0.13 / (i + 1), type: "sine", send: 0.45 }));
        this.nz({ t, dur: 0.05, f0: 4600, peak: 0.1, type: "highpass", q: 2 });
        break;
      case "cyclone": {
        this.nz({ t, dur: 0.55, f0: 260, f1: 1800, peak: 0.42, type: "bandpass", q: 1.1, send: 0.4 });
        this.osc({ t, dur: 0.5, f0: 55, f1: 190, peak: 0.3, type: "sawtooth", filter: { type: "lowpass", f0: 300, f1: 1400, q: 4 } });
        this.osc({ t: t + 0.42, dur: 0.26, f0: 200, f1: 58, peak: 0.28, type: "sawtooth", filter: { type: "lowpass", f0: 1500, f1: 260, q: 3 } });
        break;
      }
      case "grapple":
        this.osc({ t, dur: 0.12, f0: 320, f1: 92, peak: 0.26, type: "triangle" });
        this.nz({ t, dur: 0.1, f0: 950, f1: 300, peak: 0.18, type: "bandpass", q: 1.4 });
        break;
      case "charge":
        this.osc({ t, dur: 0.5, f0: 130, f1: 760, peak: 0.16, type: "sawtooth", filter: { type: "lowpass", f0: 400, f1: 2600, q: 6 }, send: 0.4 });
        this.nz({ t, dur: 0.5, f0: 900, f1: 2800, peak: 0.1, type: "bandpass", q: 2.4 });
        break;
      case "heartbeat":
        this.osc({ t, dur: 0.1, f0: 68, f1: 40, peak: 0.34, type: "sine", a: 0.002 });
        this.osc({ t: t + 0.16, dur: 0.12, f0: 58, f1: 34, peak: 0.24, type: "sine", a: 0.002 });
        break;
      case "summon":
        this.osc({ t, dur: 0.35, f0: 880, f1: 220, peak: 0.14, type: "sawtooth", filter: { type: "lowpass", f0: 2600, f1: 400, q: 4 }, send: 0.5 });
        this.nz({ t, dur: 0.3, f0: 2000, f1: 500, peak: 0.1, type: "bandpass", q: 3 });
        break;
      case "beam":
        this.osc({ t, dur: 0.3, f0: 190, f1: 150, peak: 0.18, type: "sawtooth", filter: { type: "bandpass", f0: 900, q: 2 } });
        this.nz({ t, dur: 0.28, f0: 3400, peak: 0.1, type: "highpass", q: 1 });
        break;
    }
  }

  private explode(t: number, power: number, send: number): void {
    // sub-drop core + body + crack + debris tail
    this.osc({ t, dur: 0.55, f0: 95, f1: 21, peak: 0.85 * power, type: "sine", a: 0.002, send });
    this.osc({ t, dur: 0.3, f0: 160, f1: 34, peak: 0.3 * power, type: "triangle" });
    this.nz({ t, dur: 0.45, f0: 700, f1: 90, peak: 0.6 * power, type: "lowpass", q: 0.6, send: send * 1.4 });
    this.nz({ t, dur: 0.12, f0: 2600, f1: 900, peak: 0.24 * power, type: "bandpass", q: 1.2 });
    for (let i = 0; i < 5; i++) {
      this.nz({ t: t + 0.08 + Math.random() * 0.5, dur: 0.04, f0: 1800 + Math.random() * 2600, peak: 0.05 * power, type: "bandpass", q: 5, send: send });
    }
  }

  private roar(t: number, power: number, base: number): void {
    // stacked detuned saws through formant bandpasses + growl AM
    [1, 1.008, 1.49].forEach((m, i) => {
      this.osc({
        t, dur: 1.05, f0: base * m, f1: base * m * 0.72, peak: (0.3 / (i * 0.5 + 1)) * power, type: "sawtooth",
        filter: { type: "bandpass", f0: 260 * m, f1: 130, q: 1.6 }, send: 0.6,
      });
    });
    this.nz({ t, dur: 0.9, f0: 340, f1: 110, peak: 0.26 * power, type: "lowpass", q: 1.4, send: 0.6 });
  }

  /* ---------------- music sequencer ---------------- */

  private startSequencer(): void {
    if (this.seqTimer !== null) return;
    this.nextStep = this.ctx!.currentTime + 0.1;
    this.seqTimer = window.setInterval(() => this.schedule(), 40);
  }

  private schedule(): void {
    if (!this.ctx || !this.musicOn) return;
    const stepDur = 60 / this.bpm / 4; // 16th
    while (this.nextStep < this.ctx.currentTime + 0.18) {
      this.playStep(this.step, this.nextStep, stepDur);
      this.step = (this.step + 1) % 64; // 4 bars
      this.nextStep += stepDur;
    }
  }

  private mNote(t: number, dur: number, f: number, peak: number, type: OscillatorType, filt?: { f0: number; f1?: number; q?: number }, dest?: AudioNode): void {
    if (!Number.isFinite(f) || f <= 0) return;
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type; o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.015);
    g.gain.setTargetAtTime(0.0001, t + dur * 0.6, dur * 0.25);
    let head: AudioNode = o;
    if (filt) {
      const bf = ctx.createBiquadFilter();
      bf.type = "lowpass"; bf.Q.value = filt.q ?? 1;
      bf.frequency.setValueAtTime(filt.f0, t);
      if (filt.f1) bf.frequency.exponentialRampToValueAtTime(filt.f1, t + dur);
      o.connect(bf); head = bf;
    }
    head.connect(g); g.connect(dest ?? this.musicBus!);
    o.start(t); o.stop(t + dur + 0.3);
  }

  private mDrum(t: number, kind: "kick" | "snare" | "hat", peak: number): void {
    const ctx = this.ctx!;
    if (kind === "kick") {
      const o = ctx.createOscillator(); o.type = "sine";
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(38, t + 0.12);
      const g = ctx.createGain();
      g.gain.setValueAtTime(peak, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.connect(g); g.connect(this.musicBus!);
      o.start(t); o.stop(t + 0.3);
    } else {
      const src = ctx.createBufferSource(); src.buffer = this.noiseBuf!; src.loop = true;
      const f = ctx.createBiquadFilter();
      if (kind === "snare") {
        f.type = "bandpass"; f.frequency.value = 1900; f.Q.value = 0.9;
        const o = ctx.createOscillator(); o.type = "triangle"; o.frequency.value = 190;
        const og = ctx.createGain();
        og.gain.setValueAtTime(peak * 0.5, t);
        og.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
        o.connect(og); og.connect(this.musicBus!);
        o.start(t); o.stop(t + 0.15);
      } else {
        f.type = "highpass"; f.frequency.value = 8200;
      }
      const g = ctx.createGain();
      const dur = kind === "snare" ? 0.16 : 0.045;
      g.gain.setValueAtTime(peak, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g); g.connect(this.musicBus!);
      src.start(t); src.stop(t + dur + 0.05);
    }
  }

  /** Am–F–C–G progression, A minor flavour */
  private playStep(s: number, t: number, sd: number): void {
    const tier = this.intensity;
    const bar = Math.floor(s / 16);
    const st = s % 16;
    const chordRoots = [55, 43.65, 65.41, 49];        // A1, F1, C2, G1
    const padChords = [[220, 261.6, 329.6], [174.6, 220, 261.6], [261.6, 329.6, 392], [196, 246.9, 293.7]];
    const arpPat = [0, 7, 12, 7, 0, 7, 12, 16, 0, 7, 12, 7, 19, 12, 7, 3]; // semitone offsets
    const root = chordRoots[bar];

    // pad — always
    if (st === 0) {
      padChords[bar].forEach((f) => {
        this.mNote(t, sd * 16, f, tier === 2 ? 0.028 : 0.02, "sawtooth", { f0: 500, f1: 900, q: 0.8 }, this.padGain ?? undefined);
        this.mNote(t, sd * 16, f * 1.006, (tier === 2 ? 0.028 : 0.02) * 0.7, "sawtooth", { f0: 500, f1: 900, q: 0.8 }, this.padGain ?? undefined);
      });
    }

    // bass arpeggio — calm tier: sparse; combat+: driving
    const bassSteps = tier === 0 ? [0, 8] : [0, 3, 6, 8, 11, 14];
    if (bassSteps.includes(st)) {
      const semis = tier === 0 ? 0 : arpPat[st];
      const f = root * Math.pow(2, semis / 12);
      this.mNote(t, sd * (tier === 0 ? 6 : 2.2), f, tier === 0 ? 0.1 : 0.14, "sawtooth", { f0: 220, f1: 90, q: 4 });
    }

    if (tier >= 1) {
      if (st % 4 === 0) this.mDrum(t, "kick", 0.4);
      if (st % 4 === 2) this.mDrum(t, "hat", 0.05 + (st % 8 === 2 ? 0.03 : 0));
      if (tier === 2) {
        if (st === 4 || st === 12) this.mDrum(t, "snare", 0.16);
        if (st % 2 === 1) this.mDrum(t, "hat", 0.03);
        // warlord lead — heroic minor motif
        const lead = [0, 0, 3, 0, 7, 5, 3, 0, 10, 7, 5, 3, 7, 5, 3, 2];
        if (st % 2 === 0) {
          const base = 440 * Math.pow(2, -1 / 12); // Ab4 flavour
          const idx = ((st / 2 | 0) + bar * 4) % lead.length;
          const f = base * Math.pow(2, lead[idx] / 12);
          this.mNote(t, sd * 1.8, f, 0.05, "square", { f0: 2400, q: 1.5 }, this.leadDelay ?? undefined);
        }
      }
    }
  }

  startMusic(): void {
    this.ensure();
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    const ctx = this.ctx;
    this.padGain = ctx.createGain(); this.padGain.gain.value = 0.1;
    this.padGain.connect(this.musicBus!);
    this.leadDelay = ctx.createDelay(0.6);
    this.leadDelay.delayTime.value = 60 / this.bpm / 2;
    const fb = ctx.createGain(); fb.gain.value = 0.22;
    const dw = ctx.createGain(); dw.gain.value = 0.35;
    this.leadDelay.connect(fb); fb.connect(this.leadDelay);
    this.leadDelay.connect(dw); dw.connect(this.musicBus!);
    this.step = 0;
    this.nextStep = ctx.currentTime + 0.08;
    this.musicNodes.push(this.padGain, this.leadDelay, fb, dw);
  }

  stopMusic(): void {
    if (!this.ctx) return;
    this.musicOn = false;
    const t = this.ctx.currentTime;
    this.musicNodes.forEach((n) => {
      if (n instanceof GainNode) n.gain.setTargetAtTime(0, t, 0.25);
    });
    this.musicNodes = [];
    this.padGain = null;
    this.leadDelay = null;
  }
}

export const audio = new AudioEngine();
