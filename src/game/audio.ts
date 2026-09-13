// ---------- Synthesized SFX + ambient music (WebAudio, zero assets) ----------

type SFXName =
  | "punch" | "whiff" | "zap" | "dash" | "boom" | "hit" | "explode"
  | "pickup" | "wave" | "over" | "ui" | "roar" | "slam" | "warn"
  | "flurry" | "deflect" | "cyclone" | "wreck" | "grapple" | "charge";

class AudioEngine {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  sfxBus: GainNode | null = null;
  musicBus: GainNode | null = null;
  noiseBuf: AudioBuffer | null = null;
  muted = false;
  musicNodes: AudioNode[] = [];
  musicOn = false;
  lastPlay: Record<string, number> = {};

  ensure(): void {
    if (this.ctx) { if (this.ctx.state === "suspended") void this.ctx.resume(); return; }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(this.ctx.destination);
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = 0.9;
    this.sfxBus.connect(this.master);
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 0.16;
    this.musicBus.connect(this.master);

    // shared noise buffer
    const len = this.ctx.sampleRate * 1.2;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
    }
  }

  private env(g: GainNode, t: number, a: number, peak: number, dur: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  private noise(t: number, dur: number, freq: number, q: number, peak: number, type: BiquadFilterType): void {
    if (!this.ctx || !this.sfxBus || !this.noiseBuf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    const g = this.ctx.createGain();
    this.env(g, t, 0.005, peak, dur);
    src.connect(f); f.connect(g); g.connect(this.sfxBus);
    src.start(t); src.stop(t + dur + 0.05);
  }

  private tone(t: number, dur: number, f0: number, f1: number, peak: number, type: OscillatorType): void {
    if (!this.ctx || !this.sfxBus) return;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = this.ctx.createGain();
    this.env(g, t, 0.004, peak, dur);
    o.connect(g); g.connect(this.sfxBus);
    o.start(t); o.stop(t + dur + 0.05);
  }

  play(name: SFXName, power = 1): void {
    this.ensure();
    if (!this.ctx || this.muted) return;
    const now = performance.now();
    const minGap = name === "zap" ? 60 : 40;
    if (this.lastPlay[name] && now - this.lastPlay[name] < minGap) return;
    this.lastPlay[name] = now;
    const t = this.ctx.currentTime;

    switch (name) {
      case "punch":
        this.tone(t, 0.13, 160, 40, 0.55 * power, "sine");
        this.noise(t, 0.09, 900, 1, 0.3 * power, "bandpass");
        break;
      case "whiff":
        this.noise(t, 0.14, 1600, 2, 0.14, "bandpass");
        break;
      case "zap":
        this.tone(t, 0.11, 1400, 220, 0.16, "square");
        this.tone(t, 0.08, 2800, 900, 0.07, "sawtooth");
        break;
      case "dash":
        this.noise(t, 0.3, 400, 0.6, 0.5, "lowpass");
        this.noise(t, 0.22, 3500, 1, 0.28, "highpass");
        this.tone(t, 0.28, 90, 34, 0.5, "sine");
        break;
      case "boom":
        this.tone(t, 0.5, 70, 22, 0.9, "sine");
        this.noise(t, 0.42, 240, 0.5, 0.6, "lowpass");
        this.noise(t, 0.16, 2400, 0.8, 0.22, "bandpass");
        break;
      case "slam":
        this.tone(t, 0.55, 55, 18, 1.0, "sine");
        this.noise(t, 0.5, 160, 0.4, 0.7, "lowpass");
        this.noise(t, 0.2, 1200, 0.7, 0.3, "lowpass");
        break;
      case "hit":
        this.tone(t, 0.16, 220, 60, 0.45, "triangle");
        this.noise(t, 0.14, 700, 1.2, 0.32, "bandpass");
        break;
      case "explode":
        this.tone(t, 0.4, 90, 26, 0.55 * power, "sine");
        this.noise(t, 0.38, 500, 0.5, 0.45 * power, "lowpass");
        this.noise(t, 0.12, 2800, 1, 0.18, "bandpass");
        break;
      case "pickup":
        this.tone(t, 0.07, 620, 930, 0.16, "sine");
        this.tone(t + 0.07, 0.1, 930, 1400, 0.16, "sine");
        break;
      case "wave":
        this.tone(t, 0.5, 180, 660, 0.18, "sawtooth");
        this.tone(t, 0.5, 90, 330, 0.15, "triangle");
        break;
      case "over":
        this.tone(t, 0.7, 110, 880, 0.3, "sawtooth");
        this.noise(t, 0.5, 2000, 2, 0.2, "highpass");
        this.tone(t + 0.5, 0.3, 880, 440, 0.22, "square");
        break;
      case "ui":
        this.tone(t, 0.06, 880, 660, 0.1, "sine");
        break;
      case "roar":
        this.tone(t, 0.9, 75, 40, 0.5, "sawtooth");
        this.tone(t, 0.9, 112, 55, 0.4, "sawtooth");
        this.noise(t, 0.8, 300, 0.6, 0.3, "lowpass");
        break;
      case "warn":
        this.tone(t, 0.16, 520, 520, 0.16, "square");
        this.tone(t + 0.2, 0.16, 520, 520, 0.16, "square");
        break;
      case "flurry":
        // rapid lightweight jab — tight thump + airy snap
        this.tone(t, 0.07, 220, 70, 0.4 * power, "sine");
        this.noise(t, 0.05, 1300, 1.4, 0.22 * power, "bandpass");
        break;
      case "deflect":
        // metallic ping
        this.tone(t, 0.16, 1900, 900, 0.2, "square");
        this.tone(t, 0.1, 2800, 2100, 0.1, "sine");
        this.noise(t, 0.06, 4200, 3, 0.1, "highpass");
        break;
      case "cyclone":
        // rising whoosh
        this.noise(t, 0.55, 300, 0.8, 0.5, "bandpass");
        this.tone(t, 0.5, 60, 190, 0.35, "sawtooth");
        this.tone(t + 0.45, 0.25, 190, 60, 0.3, "sawtooth");
        break;
      case "wreck":
        // heavy metal crunch on wreck impact
        this.tone(t, 0.4, 85, 26, 0.7, "sine");
        this.noise(t, 0.34, 420, 0.6, 0.55, "lowpass");
        this.noise(t, 0.14, 2600, 1.6, 0.24, "bandpass");
        break;
      case "grapple":
        this.tone(t, 0.12, 300, 90, 0.3, "triangle");
        this.noise(t, 0.1, 900, 1.2, 0.2, "bandpass");
        break;
      case "charge":
        this.tone(t, 0.5, 130, 720, 0.2, "sawtooth");
        this.noise(t, 0.5, 900, 1.4, 0.12, "bandpass");
        break;
    }
  }

  startMusic(): void {
    this.ensure();
    if (!this.ctx || !this.musicBus || this.musicOn) return;
    this.musicOn = true;
    const t = this.ctx.currentTime;
    const freqs = [55, 82.4, 110, 164.8];
    const gains = [0.5, 0.35, 0.28, 0.14];
    freqs.forEach((f, i) => {
      const o = this.ctx!.createOscillator();
      o.type = i < 2 ? "triangle" : "sawtooth";
      o.frequency.value = f;
      const g = this.ctx!.createGain();
      g.gain.value = 0;
      g.gain.setTargetAtTime(gains[i] * 0.16, t, 1.5);
      const flt = this.ctx!.createBiquadFilter();
      flt.type = "lowpass";
      flt.frequency.value = 500;
      const lfo = this.ctx!.createOscillator();
      lfo.frequency.value = 0.06 + i * 0.017;
      const lfoG = this.ctx!.createGain();
      lfoG.gain.value = 220;
      lfo.connect(lfoG); lfoG.connect(flt.frequency);
      o.connect(flt); flt.connect(g); g.connect(this.musicBus!);
      o.start(t); lfo.start(t);
      this.musicNodes.push(o, lfo, g, flt);
    });
  }

  stopMusic(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicNodes.forEach((n) => {
      if (n instanceof OscillatorNode) { try { n.stop(t + 0.4); } catch { /* noop */ } }
      if (n instanceof GainNode) n.gain.setTargetAtTime(0, t, 0.2);
    });
    this.musicNodes = [];
    this.musicOn = false;
  }
}

export const audio = new AudioEngine();
