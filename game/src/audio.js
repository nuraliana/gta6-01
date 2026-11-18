// MARISOL HEAT — audio.js
// One job: all sound is WebAudio synthesis — no audio files. Engine hum,
// siren, gunshots, and a 3-station radio (each car remembers its station;
// R cycles). setMuted is fixed: it stores the master gain and restores it,
// never zeroes the destination permanently.
import { CONFIG } from "./config.js";

export function createAudio() {
  let ctx = null, master = null, musicGain = null, sfxGain = null;
  let muted = false, savedGain = 0.8;
  let radioTimer = null, radioStation = 0, radioOn = true, radioStep = 0;
  let engineOsc = null, engineGain = null, sirenOsc = null, sirenGain = null;

  function ensure() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = savedGain; master.connect(ctx.destination);
    musicGain = ctx.createGain(); musicGain.gain.value = 0.32; musicGain.connect(master);
    sfxGain = ctx.createGain(); sfxGain.gain.value = 0.9; sfxGain.connect(master);
    // engine drone
    engineOsc = ctx.createOscillator(); engineOsc.type = "sawtooth"; engineOsc.frequency.value = 55;
    engineGain = ctx.createGain(); engineGain.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 320;
    engineOsc.connect(lp); lp.connect(engineGain); engineGain.connect(sfxGain);
    engineOsc.start();
    // two-tone siren
    sirenOsc = ctx.createOscillator(); sirenOsc.type = "sine"; sirenOsc.frequency.value = 700;
    sirenGain = ctx.createGain(); sirenGain.gain.value = 0;
    sirenOsc.connect(sirenGain); sirenGain.connect(sfxGain);
    sirenOsc.start();
  }

  function tone(freq, dur, type, vol, when = 0, slideTo = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(sfxGain);
    o.start(t); o.stop(t + dur + 0.02);
  }

  // Radio: a tiny step sequencer per station. WAVE 88 = synthwave arpeggio,
  // FUEGO 101 = latin montuno, TALK BAY = low talk-bed pulses.
  const PATTERNS = [
    { wave: "square", seq: [0, 3, 7, 10, 12, 10, 7, 3], base: 110 },
    { wave: "triangle", seq: [0, 0, 7, 0, 10, 0, 7, 5], base: 130 },
    { wave: "sine", seq: [0, 0, 0, 7, 0, 0, 5, 0], base: 98 },
  ];
  function radioTick() {
    if (!ctx || !radioOn) return;
    const st = CONFIG.STATIONS[radioStation];
    const pat = PATTERNS[radioStation];
    const note = pat.seq[radioStep % pat.seq.length];
    const freq = pat.base * Math.pow(2, note / 12);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = pat.wave; o.frequency.value = freq;
    g.gain.setValueAtTime(0.14, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
    o.connect(g); g.connect(musicGain);
    o.start(); o.stop(ctx.currentTime + 0.24);
    if (radioStep % 4 === 0) tone(48, 0.12, "sine", 0.25); // kick-ish thump
    radioStep++;
    radioTimer = setTimeout(radioTick, 60000 / st.bpm / 2);
  }

  return {
    unlock() { ensure(); if (ctx && ctx.state === "suspended") ctx.resume(); },
    startRadio() {
      ensure();
      if (radioTimer) return;
      radioTimer = setTimeout(radioTick, 100);
    },
    stopRadio() { if (radioTimer) { clearTimeout(radioTimer); radioTimer = null; } },
    setStation(i) { radioStation = ((i % 3) + 3) % 3; radioStep = 0; return CONFIG.STATIONS[radioStation].name; },
    station() { return CONFIG.STATIONS[radioStation].name; },
    setRadioOn(on) { radioOn = on; if (!on) this.stopRadio(); else this.startRadio(); },
    setEngine(rpm, on) {
      if (!ctx) return;
      engineGain.gain.value = on ? 0.05 + rpm * 0.06 : 0;
      engineOsc.frequency.value = 50 + rpm * 90;
    },
    setSiren(on, wanted) {
      if (!ctx) return;
      sirenGain.gain.value = on ? 0.045 + wanted * 0.008 : 0;
      if (on) sirenOsc.frequency.value = 650 + Math.sin(performance.now() / 380) * 220;
    },
    shoot() { tone(180, 0.12, "square", 0.5, 0, 60); tone(1200, 0.05, "sawtooth", 0.3); },
    punch() { tone(120, 0.08, "sine", 0.5, 0, 50); },
    pickup() { tone(660, 0.09, "sine", 0.35); tone(990, 0.12, "sine", 0.35, 0.09); },
    crash() { tone(90, 0.3, "sawtooth", 0.5, 0, 40); },
    sirenBlip() { tone(880, 0.15, "sine", 0.3, 0, 660); },
    missionDone() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, "triangle", 0.35, i * 0.11)); },
    busted() { tone(220, 0.5, "sawtooth", 0.4, 0, 110); },
    cash() { tone(1320, 0.1, "sine", 0.3); tone(1760, 0.14, "sine", 0.3, 0.08); },
    // FIXED (round-1 bug): mute stores the gain and restores it; never
    // writes 0 into the destination with no way back.
    setMuted(m) {
      muted = m;
      if (!ctx) return;
      if (m) { savedGain = master.gain.value; master.gain.value = 0; }
      else { master.gain.value = savedGain || 0.8; }
    },
    isMuted() { return muted; },
  };
}
