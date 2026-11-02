// All the sound is made here, from oscillators and noise: no sound files.
// Nothing plays until init() runs from the player's first click (browsers block sound before that).
// Ambience: wind, rain, a low organ drone and a music box that plays a slow, wrong little tune.

let AC = null, out = null, verb = null, muted = false, boxT = 2, boxStep = 0, whisperT = 3, beatT = 0;
try { muted = localStorage.getItem("shift-muted") === "1"; } catch { /* no storage: sound on */ }

export function init() {
  if (AC) return;
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    out = AC.createGain(); out.gain.value = muted ? 0 : 0.6; out.connect(AC.destination);
    // a cheap echo for the music box and whispers
    verb = AC.createDelay(1); verb.delayTime.value = 0.31; const fb = AC.createGain(); fb.gain.value = 0.38;
    const wet = AC.createGain(); wet.gain.value = 0.5; verb.connect(fb); fb.connect(verb); verb.connect(wet); wet.connect(out);
    ambience();
  } catch { AC = null; }
}
export const isMuted = () => muted;
export function toggleMute() {
  muted = !muted;
  try { localStorage.setItem("shift-muted", muted ? "1" : "0"); } catch { /* fine */ }
  if (out) out.gain.setTargetAtTime(muted ? 0 : 0.6, AC.currentTime, 0.05);
  return muted;
}

function noiseBuffer(sec) {
  const b = AC.createBuffer(1, Math.floor(AC.sampleRate * sec), AC.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}
function loopNoise(type, freq, vol, q = 0.7) {
  const n = AC.createBufferSource(); n.buffer = noiseBuffer(3); n.loop = true;
  const f = AC.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = AC.createGain(); g.gain.value = vol; n.connect(f); f.connect(g); g.connect(out); n.start();
  return { f, g };
}
function ambience() {
  // wind: band of noise that swells slowly
  const wind = loopNoise("bandpass", 380, 0.05, 0.9);
  const lfo = AC.createOscillator(), lg = AC.createGain(); lfo.frequency.value = 0.07; lg.gain.value = 0.035;
  lfo.connect(lg); lg.connect(wind.g.gain); lfo.start();
  const lfo2 = AC.createOscillator(), lg2 = AC.createGain(); lfo2.frequency.value = 0.11; lg2.gain.value = 160;
  lfo2.connect(lg2); lg2.connect(wind.f.frequency); lfo2.start();
  // rain on the roof
  loopNoise("highpass", 2600, 0.028);
  // a low organ: A minor, through a dark filter
  const lp = AC.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 520; lp.connect(out);
  for (const [f, v] of [[55, 0.05], [110.4, 0.02], [130.8, 0.014], [164.8, 0.012]]) {
    const o = AC.createOscillator(), g = AC.createGain(); o.type = "sawtooth"; o.frequency.value = f; g.gain.value = v;
    o.connect(g); g.connect(lp); o.start();
  }
}

function tone(type, f1, f2, dur, vol, delay = 0, toVerb = false) {
  if (!AC) return;
  const t0 = AC.currentTime + delay, o = AC.createOscillator(), g = AC.createGain(); o.type = type;
  o.frequency.setValueAtTime(f1, t0); o.frequency.exponentialRampToValueAtTime(Math.max(1, f2), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(out); if (toVerb) g.connect(verb); o.start(t0); o.stop(t0 + dur + 0.05);
}
function burst(dur, vol, type, f1, f2 = f1, delay = 0, q = 0.8) {
  if (!AC) return;
  const t0 = AC.currentTime + delay, n = AC.createBufferSource(); n.buffer = noiseBuffer(dur + 0.05);
  const f = AC.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f1, t0); f.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
  const g = AC.createGain(); g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  n.connect(f); f.connect(g); g.connect(out); n.start(t0); n.stop(t0 + dur + 0.05);
}

// ---- things that happen
export function step() { burst(0.07, 0.12, "lowpass", 260); }
export function slide() { tone("triangle", 90, 28, 0.8, 0.4); burst(0.8, 0.3, "lowpass", 500, 160); creak(0.25); }
export function swap() { burst(0.6, 0.25, "bandpass", 300, 1800, 0, 1.2); tone("sine", 140, 70, 0.6, 0.15); }
export function flip() { tone("sine", 60, 24, 1.8, 0.55); burst(1.4, 0.35, "lowpass", 200, 2000); burst(0.5, 0.3, "lowpass", 900, 80, 1.1); }
export function doorOpen() { creak(0.5); }
export function doorShut() { burst(0.12, 0.45, "lowpass", 900, 200); tone("sine", 90, 50, 0.25, 0.3); }
export function lights(on) { tone("square", 1800, 1700, 0.02, 0.06); if (on) tone("sawtooth", 120, 120, 0.25, 0.02, 0.03); }
export function unlock() { tone("sine", 660, 990, 0.25, 0.12, 0, true); tone("sine", 990, 1320, 0.3, 0.08, 0.12, true); burst(0.05, 0.2, "highpass", 3000); }
export function frontDoor() { creak(1.2); burst(1.6, 0.18, "bandpass", 700, 300); tone("sine", 220, 110, 2, 0.08, 0, true); }
export function creak(vol = 0.3) { tone("sawtooth", 210 + Math.random() * 60, 140, 0.55, 0.05 * vol / 0.3); burst(0.5, 0.1 * vol / 0.3, "bandpass", 900, 500, 0, 4); }
export function caught() { tone("sawtooth", 220, 55, 1, 0.3); burst(0.7, 0.4, "bandpass", 3000, 400); tone("sine", 40, 30, 1.2, 0.5); }
export function breakOut() { burst(0.4, 0.5, "lowpass", 1400, 200); tone("square", 70, 40, 0.4, 0.15); }
export function trapped() { creak(0.4); tone("sine", 330, 300, 0.4, 0.05, 0.1, true); }
export function thunder(delay = 0) { burst(2.4, 0.5, "lowpass", 600, 60, delay); tone("sine", 45, 30, 2.2, 0.35, delay); }
export function hint() { tone("sine", 880, 880, 0.18, 0.06, 0, true); tone("sine", 1320, 1320, 0.25, 0.05, 0.12, true); }
export function whisper() {
  for (let i = 0; i < 3; i++) { const f = 900 + Math.random() * 1600; burst(0.18 + Math.random() * 0.2, 0.05, "bandpass", f, f * 0.8, i * 0.17, 9); }
}

// A music box, slightly out of tune, slower when the shadow is far, silent when it's on you.
const TUNE = [880, 659.3, 523.3, 659.3, 493.9, 659.3, 440, 0, 523.3, 493.9, 440, 415.3, 440, 0, 0, 0];
// near: rooms between you and the shadow (0 = same room; Infinity = asleep or no way)
export function update(dt, near) {
  if (!AC || muted) return;
  boxT -= dt;
  if (boxT <= 0) {
    const f = TUNE[boxStep++ % TUNE.length];
    if (f && near > 1) tone("sine", f * (0.996 + Math.random() * 0.008), f, 1.4, 0.035, 0, true);
    boxT = near <= 2 ? 0.42 : 0.62;
  }
  if (near <= 1) { whisperT -= dt; if (whisperT <= 0) { whisper(); whisperT = 1.2 + Math.random() * 1.5; } }
  if (near <= 2) { beatT -= dt; if (beatT <= 0) { beatT = near <= 1 ? 0.62 : 1.0; tone("sine", 62, 40, 0.15, 0.45); tone("sine", 58, 38, 0.15, 0.32, 0.18); } }
}
