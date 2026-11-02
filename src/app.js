// The page: draws the factory, takes taps and keys, and makes noise. The rules live in factory.js.
import { makeNight, pullLever, stamp, tick, report, brokenCount, PRESSURE_MAX } from "./factory.js";
import { nightSpec, LAST_NIGHT } from "./nights.js";

export const W = 960, H = 600;
const FLOOR = { x: 60, y: 120, w: 840, h: 470 };

// Where a machine and its parts sit on screen. Shared by drawing and tapping, so they can't disagree.
export function layout(m) {
  const cx = FLOOR.x + m.x * FLOOR.w, cy = FLOOR.y + m.y * FLOOR.h;
  return {
    cx, cy,
    body: { x: cx - 70, y: cy - 20, w: 130, h: 85 },
    machine: { x: cx - 70, y: cy - 56, w: 130, h: 121 }, // the body plus the moving part on top: tap anywhere on it
    lever: { x: cx + 60, y: cy - 30, w: 40, h: 100 },
    note: { x: cx - 78, y: cy - 124, w: 120, h: 58 },
    liar: { x: cx - 80, y: cy - 60, w: 76, h: 40 },
    truth: { x: cx + 4, y: cy - 60, w: 76, h: 40 },
  };
}

const inside = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

// What a tap at p means, given which note's stamp menu is open.
export function hitTest(state, p, menu) {
  if (menu) {
    const m = state.machines.find((x) => x.id === menu), L = layout(m);
    if (inside(p, L.liar)) return { kind: "stamp", id: menu, verdict: "LIAR" };
    if (inside(p, L.truth)) return { kind: "stamp", id: menu, verdict: "TRUE" };
  }
  for (const m of state.machines) {
    const L = layout(m);
    if (inside(p, L.note) && !m.stamp) return { kind: "note", id: m.id };
    if (inside(p, L.lever) || inside(p, L.machine)) return { kind: "lever", id: m.id };
  }
  return { kind: "none" };
}

if (typeof document !== "undefined") start();

function start() {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  let scale = 1;
  function fit() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    scale = Math.min(window.innerWidth / W, window.innerHeight / H);
    canvas.style.width = `${W * scale}px`;
    canvas.style.height = `${H * scale}px`;
    canvas.width = Math.round(W * scale * dpr);
    canvas.height = Math.round(H * scale * dpr);
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  }
  window.addEventListener("resize", fit);
  fit();

  // ---------- sound: tiny bleeps made on the spot, no files ----------
  let audio = null, muted = false;
  function sound(kind) {
    if (muted) return;
    try { audio ??= new AudioContext(); } catch { return; }
    const t = audio.currentTime;
    const tone = (f, d, type = "square", v = 0.08, f2 = f) => {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f2, t + d);
      g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g).connect(audio.destination); o.start(t); o.stop(t + d);
    };
    const noise = (d, v = 0.25, lp = 900) => {
      const b = audio.createBuffer(1, audio.sampleRate * d, audio.sampleRate), ch = b.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / ch.length) ** 2;
      const s = audio.createBufferSource(), f = audio.createBiquadFilter(), g = audio.createGain();
      f.type = "lowpass"; f.frequency.value = lp; g.gain.value = v;
      s.buffer = b; s.connect(f).connect(g).connect(audio.destination); s.start(t);
    };
    if (kind === "lever") tone(140, 0.12, "square", 0.06, 70);
    if (kind === "broke") { noise(0.5, 0.3, 1400); tone(220, 0.4, "sawtooth", 0.06, 55); }
    if (kind === "fine") { tone(660, 0.08, "triangle", 0.07); setTimeout(() => sound("ding2"), 90); }
    if (kind === "ding2") tone(990, 0.12, "triangle", 0.07);
    if (kind === "stamp") { noise(0.12, 0.5, 400); tone(90, 0.15, "sine", 0.2, 40); }
    if (kind === "wrong") tone(160, 0.5, "sawtooth", 0.08, 80);
    if (kind === "tick") tone(1800, 0.03, "square", 0.03);
    if (kind === "boom") { noise(1.6, 0.6, 600); tone(80, 1.2, "sine", 0.3, 25); }
    if (kind === "win") [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.18, "triangle", 0.07), i * 110));
  }

  // ---------- game state ----------
  let scene = "title", night = 1, state = null, menu = null, hint = "", hintFor = 0, endShown = 0;
  let shake = 0, flash = 0, clock = 0, lastTick = 0;
  const parts = [], words = [], lever = {}, stampAnim = {}, wobble = {};

  function begin(n) {
    night = n;
    state = makeNight(nightSpec(n));
    menu = null; parts.length = 0; words.length = 0;
    for (const m of state.machines) { lever[m.id] = 0; wobble[m.id] = 0; delete stampAnim[m.id]; }
    scene = "play";
    say(n === 1
      ? "The day shift left notes. Tap a LEVER to put that machine back the old way."
      : `Night ${n}: ${state.machines.length} machines. Some of these notes are lying.`);
  }
  function say(text) { hint = text; hintFor = clock; }

  function act(hit) {
    if (scene !== "play" || state.over) return;
    if (hit.kind === "none") { menu = null; return; }
    const m = state.machines.find((x) => x.id === hit.id), L = layout(m);
    if (hit.kind === "note") { menu = menu === m.id ? null : m.id; sound("lever"); return; }
    if (hit.kind === "lever") {
      menu = null;
      const r = pullLever(state, m.id);
      sound("lever");
      if (r.kind === "broke") {
        sound("broke"); shake = Math.max(shake, 14); wobble[m.id] = 1;
        burst(L.cx, L.cy + 10, 26, "spark"); burst(L.cx, L.cy - 10, 10, "smoke");
        pop(L.cx, L.cy - 100, "CLUNK!", "#ff6b4a");
        say(night === 1 ? "It broke! So the fix was REAL. Pull the lever back, quick, then tap the note and stamp TRUE."
          : `${m.name} broke the old way. That fix was real. Put it back!`);
      } else if (r.kind === "fine") {
        sound("fine");
        burst(L.cx, L.cy - 10, 8, "puff");
        pop(L.cx, L.cy - 100, "still runs fine...", "#9be37a");
        say(night === 1 ? "Still running fine the old way. So the \"fix\" did nothing. Tap the note and stamp it LIAR."
          : `${m.name} runs fine without the fix. Hmm.`);
      } else if (r.kind === "fixed") {
        burst(L.cx, L.cy, 8, "puff");
        say(night === 1 && !m.stamp ? `Phew. Now tap the ${m.name.toLowerCase()}'s note and stamp it TRUE.` : "Back the new way. Phew.");
      }
      return;
    }
    if (hit.kind === "stamp") {
      menu = null;
      const r = stamp(state, m.id, hit.verdict);
      if (r.kind === "already") return;
      stampAnim[m.id] = clock;
      sound("stamp"); shake = Math.max(shake, 9);
      if (r.kind === "right") {
        pop(L.cx, L.cy - 110, hit.verdict === "LIAR" ? "CAUGHT!" : "TRUE.", hit.verdict === "LIAR" ? "#ff4a3d" : "#7ee081");
        if (hit.verdict === "LIAR") burst(L.note.x + 60, L.note.y + 30, 18, "paper");
        const left = state.machines.filter((x) => !x.stamp).length;
        if (left && night === 1) say(`Good. ${left} note${left > 1 ? "s" : ""} to go. Test before you stamp.`);
      } else {
        sound("wrong"); shake = Math.max(shake, 16); flash = 0.35;
        pop(L.cx, L.cy - 110, "WRONG! +pressure", "#ffb02e");
        say(m.lies ? `That note was a lie, and you believed it.` : `That fix was real. You called the day shift a liar.`);
      }
    }
  }

  function burst(x, y, n, kind) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = kind === "spark" ? 120 + Math.random() * 260 : 20 + Math.random() * 60;
      parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - (kind === "spark" ? 80 : 30), life: 1,
        max: kind === "spark" ? 0.5 + Math.random() * 0.4 : 1 + Math.random(), kind, r: Math.random() });
    }
  }
  function pop(x, y, text, color) { words.push({ x, y, text, color, t: clock }); }

  // ---------- input ----------
  function toGame(e) {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  }
  canvas.addEventListener("pointerdown", (e) => {
    const p = toGame(e);
    if (scene === "title") { sound("lever"); begin(1); return; }
    if (scene === "end") {
      if (clock - endShown < 0.6) return;
      if (state.won && night === LAST_NIGHT) { scene = "title"; return; }
      begin(state.won ? night + 1 : night);
      return;
    }
    act(hitTest(state, p, menu));
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "m" || e.key === "M") { muted = !muted; return; }
    if (scene !== "play") { if (e.key === "Enter" || e.key === " ") canvas.dispatchEvent(new PointerEvent("pointerdown")); return; }
    const n = Number(e.code.replace("Digit", "")) - 1;
    const m = state.machines[n];
    if (m && e.shiftKey) { menu = m.id; return; } // SHIFT + number: open that machine's note
    if (m) { act({ kind: "lever", id: m.id }); return; }
    if (menu && (e.key === "l" || e.key === "L")) act({ kind: "stamp", id: menu, verdict: "LIAR" });
    if (menu && (e.key === "t" || e.key === "T")) act({ kind: "stamp", id: menu, verdict: "TRUE" });
    if (e.key === "Escape") menu = null;
  });

  // ---------- drawing ----------
  function rect(r, fill) { ctx.fillStyle = fill; ctx.fillRect(r.x, r.y, r.w, r.h); }
  function text(t, x, y, size, color, font = "Martian Mono", align = "center") {
    ctx.font = `${size}px "${font}", monospace`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = "middle";
    ctx.fillText(t, x, y);
  }

  function drawFloor() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#1d1814"); g.addColorStop(1, "#2a221b");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(255,220,170,0.05)"; ctx.lineWidth = 1;
    for (let x = 0; x <= W; x += 48) { ctx.beginPath(); ctx.moveTo(x, 106); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 106; y <= H; y += 48) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    // hazard stripe along the top
    for (let x = -40; x < W + 40; x += 40) {
      ctx.fillStyle = "#e0a526"; ctx.beginPath();
      ctx.moveTo(x, 96); ctx.lineTo(x + 20, 96); ctx.lineTo(x + 40, 106); ctx.lineTo(x + 20, 106); ctx.fill();
    }
    ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(0, 0, W, 96);
  }

  function drawMachine(m) {
    const L = layout(m), broken = m.broken, t = clock;
    const jx = broken ? (Math.random() - 0.5) * 5 : 0, jy = broken ? (Math.random() - 0.5) * 4 : 0;
    ctx.save(); ctx.translate(jx, jy);
    const b = L.body;
    ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.beginPath(); ctx.ellipse(L.cx - 5, b.y + b.h + 6, 78, 10, 0, 0, 7); ctx.fill();
    // base
    ctx.fillStyle = broken ? "#5a3a33" : "#4a5560"; roundRect(b.x, b.y + 40, b.w, b.h - 40, 6); ctx.fill();
    ctx.fillStyle = broken ? "#6e463c" : "#5d6b78"; roundRect(b.x + 4, b.y + 44, b.w - 8, 10, 3); ctx.fill();
    // status lamp
    const on = broken ? Math.sin(t * 18) > 0 : true;
    ctx.fillStyle = broken ? (on ? "#ff3b2f" : "#5a1a16") : m.lever === "old" ? "#9be37a" : "#ffd36b";
    ctx.beginPath(); ctx.arc(b.x + 14, b.y + 68, 6, 0, 7); ctx.fill();
    if (broken && on) { ctx.fillStyle = "rgba(255,60,40,0.25)"; ctx.beginPath(); ctx.arc(b.x + 14, b.y + 68, 16, 0, 7); ctx.fill(); }
    text(m.name.toUpperCase(), L.cx - 5, b.y + 68, 10, "#d9d0c0");
    const run = broken ? 0 : 1;
    drawKind(m.id, L.cx - 5, b.y + 20, t, run, broken);
    ctx.restore();
    drawLever(m, L);
    drawNote(m, L);
    // number key, small, under the machine
    text(String(state.machines.indexOf(m) + 1), b.x + b.w - 8, b.y + b.h + 12, 10, "rgba(255,240,220,0.35)");
  }

  function drawKind(id, x, y, t, run, broken) {
    ctx.lineWidth = 3; ctx.strokeStyle = "#2a2f35";
    const metal = broken ? "#8a6a60" : "#9fb0bf", dark = "#36404a";
    if (id === "boiler") {
      ctx.fillStyle = metal; roundRect(x - 34, y - 26, 68, 48, 18); ctx.fill(); ctx.stroke();
      ctx.fillStyle = dark; ctx.fillRect(x + 14, y - 52, 12, 28);
      if (run && Math.random() < 0.15) parts.push({ x: x + 20, y: y - 52, vx: (Math.random() - 0.5) * 10, vy: -40, life: 1, max: 1.2, kind: "puff", r: Math.random() });
      if (broken && Math.random() < 0.4) parts.push({ x: x + 20, y: y - 52, vx: (Math.random() - 0.5) * 30, vy: -60, life: 1, max: 1.6, kind: "smoke", r: Math.random() });
    } else if (id === "belt") {
      ctx.fillStyle = dark; roundRect(x - 50, y + 4, 100, 16, 8); ctx.fill();
      for (let i = 0; i < 5; i++) { ctx.fillStyle = "#777"; ctx.beginPath(); ctx.arc(x - 40 + i * 20, y + 12, 5, 0, 7); ctx.fill(); }
      const off = run ? (t * 30) % 34 : 6;
      for (let i = 0; i < 3; i++) {
        const bx = x - 50 + ((i * 34 + off) % 100);
        ctx.fillStyle = "#c8955a"; ctx.fillRect(bx, y - 12 - (broken && i === 1 ? 14 : 0), 18, 16);
      }
    } else if (id === "press") {
      ctx.fillStyle = dark; ctx.fillRect(x - 40, y - 46, 10, 68); ctx.fillRect(x + 30, y - 46, 10, 68); ctx.fillRect(x - 40, y - 50, 80, 10);
      const drop = run ? (Math.sin(t * 4) * 0.5 + 0.5) * 30 : 30;
      ctx.fillStyle = metal; ctx.fillRect(x - 24, y - 40 + drop, 48, 14);
      ctx.fillStyle = "#7a8a99"; ctx.fillRect(x - 3, y - 40, 6, drop);
    } else if (id === "fan") {
      ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(x, y - 6, 30, 0, 7); ctx.fill();
      const a = run ? t * 12 : 0.4 + Math.sin(t * 30) * 0.15;
      ctx.fillStyle = metal;
      for (let i = 0; i < 4; i++) {
        ctx.save(); ctx.translate(x, y - 6); ctx.rotate(a + i * Math.PI / 2);
        ctx.beginPath(); ctx.ellipse(14, 0, 14, 6, 0, 0, 7); ctx.fill(); ctx.restore();
      }
    } else if (id === "bell") {
      const sw = run ? Math.sin(t * 3) * 0.25 : 0.6;
      ctx.save(); ctx.translate(x, y - 44); ctx.rotate(sw);
      ctx.fillStyle = "#d7a94a"; ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.lineTo(22, 40); ctx.lineTo(-22, 40); ctx.closePath(); ctx.fill();
      ctx.restore(); ctx.fillStyle = dark; ctx.fillRect(x - 30, y - 50, 60, 6);
    } else if (id === "kettle") {
      ctx.fillStyle = broken ? "#8a6a60" : "#c46a4a"; ctx.beginPath(); ctx.ellipse(x, y, 30, 22, 0, 0, 7); ctx.fill();
      ctx.fillRect(x + 22, y - 12, 22, 6);
      if (run && Math.random() < 0.2) parts.push({ x: x + 46, y: y - 12, vx: 20, vy: -30, life: 1, max: 1, kind: "puff", r: Math.random() });
    } else if (id === "pump") {
      ctx.fillStyle = metal; ctx.fillRect(x - 16, y - 30, 32, 52);
      const up = run ? Math.sin(t * 5) * 12 : 12;
      ctx.strokeStyle = dark; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(x, y - 30); ctx.lineTo(x + 34, y - 44 + up); ctx.stroke();
      ctx.fillStyle = "#4aa3d8"; if (run) ctx.fillRect(x + 18, y + 4, 8, 18 * (Math.sin(t * 5) * 0.5 + 0.5));
    } else if (id === "crane") {
      ctx.fillStyle = dark; ctx.fillRect(x - 40, y - 50, 8, 72); ctx.fillRect(x - 40, y - 50, 80, 8);
      const drop = run ? 14 + Math.sin(t * 2) * 12 : 34;
      ctx.strokeStyle = "#aaa"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 24, y - 42); ctx.lineTo(x + 24, y - 42 + drop); ctx.stroke();
      ctx.fillStyle = metal; ctx.fillRect(x + 14, y - 42 + drop, 20, 8);
      const open = broken ? 10 : 4;
      ctx.fillRect(x + 12 - open, y - 34 + drop, 5, 12); ctx.fillRect(x + 31 + open, y - 34 + drop, 5, 12);
    }
    if (broken && Math.random() < 0.25) {
      for (let i = 0; i < 3; i++) parts.push({ x: x + (Math.random() - 0.5) * 60, y: y + (Math.random() - 0.5) * 30,
        vx: (Math.random() - 0.5) * 300, vy: -Math.random() * 200, life: 1, max: 0.4, kind: "spark", r: Math.random() });
    }
  }

  function drawLever(m, L) {
    const target = m.lever === "old" ? 1 : 0;
    lever[m.id] += (target - lever[m.id]) * 0.3;
    const r = L.lever, px = r.x + r.w / 2, py = r.y + r.h - 22;
    ctx.fillStyle = "#2b3138"; roundRect(r.x + 6, py - 6, r.w - 12, 30, 4); ctx.fill();
    const a = -Math.PI / 2 - 0.6 + lever[m.id] * 1.2 + (lever[m.id] > 0.5 ? 0.8 : 0) * lever[m.id];
    const hx = px + Math.cos(a) * 52, hy = py + Math.sin(a) * 52;
    ctx.strokeStyle = "#b9c2cb"; ctx.lineWidth = 5; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.fillStyle = "#e0402f"; ctx.beginPath(); ctx.arc(hx, hy, 9, 0, 7); ctx.fill();
    text(m.lever === "old" ? "OLD" : "NEW", px, py + 14, 9, m.lever === "old" ? "#ffb02e" : "#c9d4de");
  }

  function drawNote(m, L) {
    const n = L.note, tilt = ((m.id.charCodeAt(0) % 5) - 2) * 0.03;
    ctx.save(); ctx.translate(n.x + n.w / 2, n.y + n.h / 2); ctx.rotate(tilt);
    const hover = menu === m.id;
    ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.fillRect(-n.w / 2 + 3, -n.h / 2 + 4, n.w, n.h);
    ctx.fillStyle = hover ? "#fff59a" : "#f7e36a"; ctx.fillRect(-n.w / 2, -n.h / 2, n.w, n.h);
    ctx.fillStyle = "rgba(0,0,0,0.08)"; ctx.fillRect(-n.w / 2, -n.h / 2, n.w, 9);
    const words = m.note.split(" ");
    const mid = Math.ceil(words.length / 2);
    text(words.slice(0, mid).join(" "), 0, -9, 12, "#2a2550", "Permanent Marker");
    text(words.slice(mid).join(" "), 0, 7, 12, "#2a2550", "Permanent Marker");
    text("- day shift", n.w / 2 - 32, 22, 8, "#6a6390", "Martian Mono");
    if (m.stamp) {
      const age = clock - (stampAnim[m.id] ?? -9), k = Math.max(1, 2.4 - age * 9);
      ctx.save(); ctx.rotate(-0.22); ctx.scale(k, k);
      const c = m.stamp === "LIAR" ? "#d8231a" : "#1e8a3a";
      ctx.globalAlpha = Math.min(1, age * 8);
      ctx.strokeStyle = c; ctx.lineWidth = 3; ctx.strokeRect(-44, -15, 88, 30);
      text(m.stamp, 0, 1, 20, c, "Rubik Mono One");
      ctx.restore();
    }
    ctx.restore();
  }

  function drawMenu() {
    if (!menu) return;
    const L = layout(state.machines.find((x) => x.id === menu));
    button(L.liar, "LIAR", "#d8231a");
    button(L.truth, "TRUE", "#1e8a3a");
  }

  function button(r, label, color) {
    ctx.fillStyle = "rgba(0,0,0,0.5)"; roundRect(r.x + 2, r.y + 3, r.w, r.h, 6); ctx.fill();
    ctx.fillStyle = color; roundRect(r.x, r.y, r.w, r.h, 6); ctx.fill();
    text(label, r.x + r.w / 2, r.y + r.h / 2 + 1, 13, "#fff", "Rubik Mono One");
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function drawGauge() {
    const x = 880, y = 60, r = 42, p = state.pressure / PRESSURE_MAX;
    ctx.fillStyle = "#2b2622"; ctx.beginPath(); ctx.arc(x, y, r + 6, 0, 7); ctx.fill();
    ctx.fillStyle = "#efe6d4"; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    ctx.lineWidth = 7;
    ctx.strokeStyle = "#7ac06a"; ctx.beginPath(); ctx.arc(x, y, r - 8, a0, a0 + (a1 - a0) * 0.6); ctx.stroke();
    ctx.strokeStyle = "#f0a52a"; ctx.beginPath(); ctx.arc(x, y, r - 8, a0 + (a1 - a0) * 0.6, a0 + (a1 - a0) * 0.82); ctx.stroke();
    ctx.strokeStyle = "#d8231a"; ctx.beginPath(); ctx.arc(x, y, r - 8, a0 + (a1 - a0) * 0.82, a1); ctx.stroke();
    const shiver = p > 0.75 ? (Math.random() - 0.5) * 0.08 : 0;
    const a = a0 + (a1 - a0) * p + shiver;
    ctx.strokeStyle = "#222"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * (r - 6), y + Math.sin(a) * (r - 6)); ctx.stroke();
    ctx.fillStyle = "#222"; ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fill();
    text("PRESSURE", x, y + 28, 8, "#5a4f44");
    if (p > 0.75 && Math.sin(clock * 14) > 0) text("!", x - r - 18, y, 28, "#ff3b2f", "Rubik Mono One");
  }

  function drawHud() {
    text(`NIGHT ${night}`, 30, 38, 26, "#f1e6d2", "Rubik Mono One", "left");
    text(`of ${LAST_NIGHT}`, 32, 66, 11, "#a89a86", "Martian Mono", "left");
    const left = state.machines.filter((m) => !m.stamp).length;
    text(`${left} note${left === 1 ? "" : "s"} to stamp`, 32, 88, 11, "#a89a86", "Martian Mono", "left");
    text("SHIFT CHANGE", 480, 36, 14, "rgba(241,230,210,0.35)", "Rubik Mono One");
    // hint bar
    const age = clock - hintFor;
    ctx.globalAlpha = Math.min(1, age * 4);
    ctx.fillStyle = "rgba(10,8,6,0.82)"; roundRect(20, 560, 920, 32, 8); ctx.fill();
    text(hint, 480, 576, 12, "#f6ead2");
    ctx.globalAlpha = 1;
  }

  function drawParts(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt / p.max;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.kind === "spark") { p.vy += 600 * dt; ctx.fillStyle = `rgba(255,${180 + p.r * 70 | 0},80,${p.life})`; ctx.fillRect(p.x, p.y, 3, 3); }
      else if (p.kind === "paper") { p.vy += 300 * dt; ctx.fillStyle = `rgba(247,227,106,${p.life})`; ctx.fillRect(p.x, p.y, 6, 4); }
      else {
        const big = (1 - p.life) * (p.kind === "smoke" ? 26 : 14) + 4;
        ctx.fillStyle = p.kind === "smoke" ? `rgba(40,36,34,${p.life * 0.7})` : `rgba(235,235,235,${p.life * 0.4})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, big, 0, 7); ctx.fill();
      }
    }
    for (let i = words.length - 1; i >= 0; i--) {
      const w = words[i], age = clock - w.t;
      if (age > 1.4) { words.splice(i, 1); continue; }
      ctx.globalAlpha = Math.min(1, (1.4 - age) * 2);
      text(w.text, w.x, w.y - age * 30, 16, w.color, "Rubik Mono One");
      ctx.globalAlpha = 1;
    }
  }

  function drawTitle() {
    drawFloor();
    text("SHIFT", 480, 200, 86, "#f1e6d2", "Rubik Mono One");
    text("CHANGE", 480, 290, 86, "#e0a526", "Rubik Mono One");
    text("You're the night shift. The day shift says they fixed everything.", 480, 370, 14, "#d8ccb8");
    text("Some of them are lying.", 480, 396, 14, "#ff6b4a");
    if (Math.sin(clock * 4) > -0.3) text("tap to clock in", 480, 470, 16, "#f6ead2", "Rubik Mono One");
    text("M: sound on/off", 480, 560, 10, "rgba(241,230,210,0.4)");
  }

  function drawEnd() {
    const r = report(state);
    ctx.fillStyle = "rgba(8,6,4,0.78)"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#231d17"; roundRect(250, 130, 460, 340, 14); ctx.fill();
    const lastWin = r.won && night === LAST_NIGHT;
    text(r.won ? (lastWin ? "WEEK SURVIVED" : "CLOCKED OUT") : "KA-BOOM", 480, 190, 34, r.won ? "#7ee081" : "#ff4a3d", "Rubik Mono One");
    const lines = [
      `Liars caught: ${r.caught} of ${r.liars}`,
      `Wrong stamps: ${r.wrong}`,
      `Stamped without testing: ${r.guessed}`,
      `Pressure peaked at ${r.peak}%`,
    ];
    lines.forEach((l, i) => text(l, 480, 250 + i * 30, 14, "#e8dcc6"));
    const verdict = !r.won ? "The gauge blew. Test faster, or trust less."
      : r.wrong === 0 && r.guessed === 0 ? "Not one note got past you." : r.wrong === 0 ? "Clean, but you took some guesses." : "You made it. Barely honest.";
    text(verdict, 480, 384, 12, "#b5a68f");
    if (clock - endShown > 0.6 && Math.sin(clock * 4) > -0.3)
      text(lastWin ? "tap for the title" : r.won ? "tap for the next night" : "tap to try again", 480, 432, 15, "#f6ead2", "Rubik Mono One");
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now; clock += dt;
    ctx.save();
    if (shake > 0.2) { ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake); shake *= 0.86; }
    if (scene === "title") drawTitle();
    else {
      if (scene === "play") {
        tick(state, dt);
        if (state.pressure / PRESSURE_MAX > 0.75 && clock - lastTick > 0.25) { sound("tick"); lastTick = clock; }
        if (state.over) { // a stamp can end the night too, not just the gauge, so check every frame
          scene = "end"; endShown = clock + (state.won ? 0 : 0.8);
          if (state.won) sound("win");
          else { sound("boom"); shake = 40; flash = 1; for (const m of state.machines) { const L = layout(m); burst(L.cx, L.cy, 30, "spark"); burst(L.cx, L.cy, 12, "smoke"); } }
        }
      }
      drawFloor();
      for (const m of state.machines) drawMachine(m);
      drawParts(dt);
      drawMenu();
      drawGauge();
      drawHud();
      if (scene === "end" && clock > endShown) drawEnd();
    }
    ctx.restore();
    if (flash > 0) { ctx.fillStyle = `rgba(255,240,220,${flash})`; ctx.fillRect(0, 0, W, H); flash = Math.max(0, flash - dt * 2); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // For the page test: read the state and tap like a player would.
  window.__shift = { scene: () => scene, state: () => state, night: () => night, layout, menu: () => menu };
}
