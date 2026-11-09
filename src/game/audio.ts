// Arcade sound effects synthesised with the Web Audio API: no sample files, nothing to
// load. Browsers only allow audio after a user gesture, so `unlock()` is called from the
// first keydown and every effect is a no-op until then. 'M' toggles mute (remembered).

const MUTE_KEY = "tezinvaders.muted";
const STEP_NOTES = [55, 49, 46.25, 41.2]; // the four-note bass march, A1 G#1 F#1 E1
const MIN_STEP_GAP_MS = 90; // the formation can step every tick near the end; don't machine-gun the bass

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private saucer: { osc: OscillatorNode; lfo: OscillatorNode; gain: GainNode } | null = null;
  private stepIndex = 0;
  private lastStepAt = 0;
  muted = false;

  constructor() {
    try { this.muted = localStorage.getItem(MUTE_KEY) === "1"; } catch { /* storage unavailable */ }
  }

  /** Create or resume the context. Safe to call on every key press. */
  unlock(): void {
    if (typeof AudioContext === "undefined") return;
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      this.noise = this.makeNoise(this.ctx);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    try { localStorage.setItem(MUTE_KEY, this.muted ? "1" : "0"); } catch { /* ignore */ }
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.5, this.ctx.currentTime, 0.01);
    return this.muted;
  }

  /** The player's laser: a quick downward zap. */
  shoot(): void {
    this.tone("square", 900, 240, 0.12, 0.25);
  }

  /** An invader dies: a short crunch of noise with a falling tone under it. */
  kill(): void {
    this.burst(0.15, 1800, 0.3);
    this.tone("sawtooth", 420, 70, 0.18, 0.2);
  }

  /** The bank is hit: a bright rising arpeggio. */
  bank(): void {
    const live = this.live();
    if (!live) return;
    [660, 880, 1100, 1320, 1760].forEach((f, i) => this.tone("square", f, f, 0.08, 0.2, i * 0.06));
  }

  /** The player is hit: a long rumbling explosion. */
  hit(): void {
    this.burst(0.7, 900, 0.5);
    this.tone("sawtooth", 160, 30, 0.6, 0.25);
  }

  /** One formation step: the next note of the four-note march. */
  step(): void {
    const now = performance.now();
    if (now - this.lastStepAt < MIN_STEP_GAP_MS) return;
    this.lastStepAt = now;
    const f = STEP_NOTES[this.stepIndex++ % STEP_NOTES.length] ?? 55;
    this.tone("triangle", f, f, 0.14, 0.6);
    this.tone("square", f * 2, f * 2, 0.08, 0.12);
  }

  /** A wave is cleared: a little ascending fanfare. */
  wave(): void {
    [523, 659, 784, 1047].forEach((f, i) => this.tone("square", f, f, 0.12, 0.2, i * 0.11));
    this.tone("square", 1319, 1319, 0.35, 0.2, 0.44);
  }

  /** Game over: three sinking notes. */
  gameover(): void {
    [392, 311, 233].forEach((f, i) => this.tone("sawtooth", f, f * 0.94, 0.3, 0.2, i * 0.3));
  }

  /** Keep the saucer's warble running while the bank is on screen. */
  setSaucer(on: boolean): void {
    const live = this.live();
    if (!live) return;
    if (on && !this.saucer) {
      const osc = live.ctx.createOscillator();
      osc.type = "square";
      osc.frequency.value = 520;
      const lfo = live.ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 7;
      const depth = live.ctx.createGain();
      depth.gain.value = 180;
      lfo.connect(depth).connect(osc.frequency);
      const gain = live.ctx.createGain();
      gain.gain.value = 0.08;
      osc.connect(gain).connect(live.master);
      osc.start();
      lfo.start();
      this.saucer = { osc, lfo, gain };
    } else if (!on && this.saucer) {
      const { osc, lfo, gain } = this.saucer;
      this.saucer = null;
      const t = live.ctx.currentTime;
      gain.gain.setTargetAtTime(0, t, 0.03);
      osc.stop(t + 0.2);
      lfo.stop(t + 0.2);
    }
  }

  private live(): { ctx: AudioContext; master: GainNode } | null {
    return this.ctx && this.master && this.ctx.state === "running" ? { ctx: this.ctx, master: this.master } : null;
  }

  /** A single oscillator sweeping `from` → `to` Hz over `dur` seconds with a quick decay envelope. */
  private tone(type: OscillatorType, from: number, to: number, dur: number, vol: number, delay = 0): void {
    const live = this.live();
    if (!live) return;
    const t = live.ctx.currentTime + delay;
    const osc = live.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
    const gain = live.ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(live.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** White noise through a low-pass filter whose cutoff falls over the burst. */
  private burst(dur: number, cutoff: number, vol: number): void {
    const live = this.live();
    if (!live || !this.noise) return;
    const t = live.ctx.currentTime;
    const src = live.ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = live.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(cutoff, t);
    filter.frequency.exponentialRampToValueAtTime(80, t + dur);
    const gain = live.ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(gain).connect(live.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  private makeNoise(ctx: AudioContext): AudioBuffer {
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }
}
