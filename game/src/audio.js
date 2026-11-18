// Solmar Bay — all sound is synthesized with WebAudio: engine hum, sirens,
// gunshots, pickup chimes and a lazy sun-soaked chord loop. No audio files.
export class AudioSys {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenOn = false;
    this.musicTimer = 0;
    this.musicStep = 0;
    this.musicNotes = null;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      // Engine: low sawtooth whose pitch follows speed.
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 50;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engineOsc.connect(filter).connect(this.engineGain).connect(this.ctx.destination);
      this.engineOsc.start();
      // Siren: two-tone square wave, gain gated.
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'square';
      this.sirenOsc.frequency.value = 700;
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain).connect(this.ctx.destination);
      this.sirenOsc.start();
      // Music: a slow major-7th pad arpeggio (C - Am - F - G), triangle waves.
      this.musicNotes = [
        [261.6, 329.6, 392.0, 493.9],
        [220.0, 261.6, 329.6, 440.0],
        [174.6, 220.0, 261.6, 349.2],
        [196.0, 246.9, 293.7, 392.0],
      ];
    } catch { this.ctx = null; }
  }

  setMuted(m) {
    this.muted = m;
    if (this.ctx) this.ctx.destination.gain?.setValueAtTime?.(0, 0);
    if (this.engineGain) this.engineGain.gain.value = 0;
    if (this.sirenGain) this.sirenGain.gain.value = 0;
  }

  engine(speed01, inCar) {
    if (!this.ctx || this.muted) return;
    const target = inCar ? 0.035 + speed01 * 0.05 : 0;
    this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
    this.engineOsc.frequency.setTargetAtTime(48 + speed01 * 130, this.ctx.currentTime, 0.1);
  }

  siren(on) {
    if (!this.ctx) return;
    this.sirenOn = on;
    this.sirenGain.gain.setTargetAtTime(on && !this.muted ? 0.02 : 0, this.ctx.currentTime, 0.2);
  }

  update(dt) {
    if (!this.ctx || this.muted) return;
    if (this.sirenOn && this.sirenOsc) {
      const t = this.ctx.currentTime;
      this.sirenOsc.frequency.setTargetAtTime(t % 1 < 0.5 ? 700 : 950, t, 0.05);
    }
    // One soft pad note every 0.55 s, cycling the chord progression.
    this.musicTimer += dt;
    if (this.musicTimer > 0.55) {
      this.musicTimer = 0;
      const chord = this.musicNotes[Math.floor(this.musicStep / 4) % 4];
      const note = chord[this.musicStep % 4];
      this.musicStep++;
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = note;
      const g = this.ctx.createGain();
      const t0 = this.ctx.currentTime;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.035, t0 + 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.6);
      osc.connect(g).connect(this.ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 1.7);
    }
  }

  blip(freq, dur, type = 'sine', vol = 0.08) {
    if (!this.ctx || this.muted) return;
    try {
      const osc = this.ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      const g = this.ctx.createGain();
      const t0 = this.ctx.currentTime;
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g).connect(this.ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch { /* audio is best-effort */ }
  }

  noise(dur, vol = 0.15) {
    if (!this.ctx || this.muted) return;
    try {
      const len = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const g = this.ctx.createGain();
      g.gain.value = vol;
      src.connect(g).connect(this.ctx.destination);
      src.start();
    } catch { /* best-effort */ }
  }

  shot() { this.noise(0.12, 0.22); this.blip(160, 0.1, 'square', 0.06); }
  punch() { this.noise(0.07, 0.12); }
  pickup() { this.blip(660, 0.12); setTimeout(() => this.blip(990, 0.18), 90); }
  cash() { this.blip(880, 0.1); setTimeout(() => this.blip(1174, 0.16), 80); }
  missionDone() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.blip(f, 0.22), i * 110)); }
  busted() { [392, 330, 262].forEach((f, i) => setTimeout(() => this.blip(f, 0.3, 'triangle', 0.09), i * 160)); }
  crash() { this.noise(0.25, 0.18); }
}
