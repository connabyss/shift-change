// The page: draws the house, takes keys and taps, makes the noises. The rules live in house.js.
import { shoveRow, shoveCol, walk, path, hunterStep, wander, seep, N, E, S, W as WEST } from "./house.js";
import { floorHouse, LAST_FLOOR } from "./floors.js";
import { rng } from "./rng.js";

export const W = 960, H = 600;
const SHOVE_TIME = 0.32, WALK_TIME = 0.16;

// Where the grid sits on screen for a house of size n.
export function grid(n) {
  const cell = Math.floor(Math.min(470 / n, 112));
  const g = n * cell;
  return { cell, ox: Math.round((W - g) / 2), oy: Math.round(78 + (480 - g) / 2), size: g };
}

// The shove arrows around the outside of the grid: one at each end of every row and column.
export function arrows(n) {
  const { cell, ox, oy, size } = grid(n), out = [];
  for (let i = 0; i < n; i++) {
    out.push({ axis: "row", i, dir: -1, x: ox - 34, y: oy + i * cell + cell / 2 });
    out.push({ axis: "row", i, dir: 1, x: ox + size + 40, y: oy + i * cell + cell / 2 });
    out.push({ axis: "col", i, dir: -1, x: ox + i * cell + cell / 2, y: oy - 30 });
    out.push({ axis: "col", i, dir: 1, x: ox + i * cell + cell / 2, y: oy + size + 30 });
  }
  return out;
}

// What a tap at p means: a shove arrow, or the room next to you (walk there), or the front door.
export function hitTest(house, p) {
  const n = house.w;
  for (const a of arrows(n)) if (Math.hypot(p.x - a.x, p.y - a.y) < 24) return { kind: "shove", axis: a.axis, i: a.i, dir: a.dir };
  const { cell, ox, oy } = grid(n);
  const x = Math.floor((p.x - ox) / cell), y = Math.floor((p.y - oy) / cell);
  const dx = x - house.player.x, dy = y - house.player.y;
  if (Math.abs(dx) + Math.abs(dy) === 1) return { kind: "walk", d: dx === 1 ? "E" : dx === -1 ? "W" : dy === 1 ? "S" : "N" };
  return { kind: "none" };
}

if (typeof document !== "undefined") start();

function start() {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const dark = document.createElement("canvas");
  dark.width = W; dark.height = H;
  const dctx = dark.getContext("2d");
  function fit() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const scale = Math.min(window.innerWidth / W, window.innerHeight / H);
    canvas.style.width = `${W * scale}px`; canvas.style.height = `${H * scale}px`;
    canvas.width = Math.round(W * scale * dpr); canvas.height = Math.round(H * scale * dpr);
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  }
  window.addEventListener("resize", fit);
  fit();

  // ---------- sound: made on the spot, no files ----------
  let audio = null, muted = false;
  function sound(kind) {
    if (muted) return;
    try { audio ??= new AudioContext(); } catch { return; }
    const t = audio.currentTime;
    const tone = (f, d, type = "sine", v = 0.08, f2 = f, at = 0) => {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t + at); o.frequency.exponentialRampToValueAtTime(f2, t + at + d);
      g.gain.setValueAtTime(0.0001, t + at); g.gain.exponentialRampToValueAtTime(v, t + at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + at + d);
      o.connect(g).connect(audio.destination); o.start(t + at); o.stop(t + at + d + 0.02);
    };
    const noise = (d, v, lp, at = 0) => {
      const b = audio.createBuffer(1, Math.ceil(audio.sampleRate * d), audio.sampleRate), ch = b.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * Math.sin((Math.PI * i) / ch.length);
      const s = audio.createBufferSource(), f = audio.createBiquadFilter(), g = audio.createGain();
      f.type = "lowpass"; f.frequency.value = lp; g.gain.value = v;
      s.buffer = b; s.connect(f).connect(g).connect(audio.destination); s.start(t + at);
    };
    if (kind === "shove") { noise(0.34, 0.5, 260); tone(55, 0.3, "sawtooth", 0.05, 40); noise(0.08, 0.6, 500, 0.3); }
    if (kind === "step") noise(0.05, 0.25, 900);
    if (kind === "bump") tone(90, 0.1, "sine", 0.1, 60);
    if (kind === "beat") { tone(60, 0.12, "sine", 0.35, 45); tone(58, 0.12, "sine", 0.25, 44, 0.18); }
    if (kind === "flicker") { tone(1240, 0.5, "sine", 0.025, 1180); noise(0.12, 0.15, 3000); }
    if (kind === "near") tone(110, 0.7, "triangle", 0.05, 104);
    if (kind === "caught") { noise(1.3, 0.8, 900); tone(140, 1.2, "sawtooth", 0.08, 35); }
    if (kind === "key") [880, 1320].forEach((f, i) => tone(f, 0.4, "triangle", 0.05, f, i * 0.08));
    if (kind === "out") [392, 494, 587].forEach((f, i) => tone(f, 0.9, "triangle", 0.05, f, i * 0.12));
  }

  // ---------- game state ----------
  let scene = "title", house = null, floor = 1, seed = 1, decor = null;
  let clock = 0, stepAcc = 0, lastWander = null, lost = 0, hint = "", hintAt = 0, endAt = 0;
  let seenSeep = false, heard = false, slide = null, walkAnim = null, shake = 0, flickerAt = 4, flicker = 0, lastBeat = 0, wanderRand = rng(1);
  const view = { p: { x: 0, y: 0 }, h: { x: 0, y: 0 } };

  function begin(n) {
    floor = n;
    house = floorHouse(n, seed);
    const r = rng(seed * 31 + n);
    decor = house.rooms.map((row) => row.map(() => Math.floor(r() * 7)));
    view.p = { ...house.player }; view.h = { ...house.hunter };
    slide = null; walkAnim = null; stepAcc = -2.5; lastWander = null; lost = 0; flickerAt = clock + 2.5; wanderRand = rng(seed + n * 101);
    scene = "play";
    say(n === 1 ? "Find the key, then the front door.   Walk: arrows/WASD.   Shove your row: SHIFT + arrow.   Or tap."
      : `Floor ${n}. It's quicker now.`);
  }
  function say(t) { hint = t; hintAt = clock; }

  function shove(axis, i, dir) {
    if (scene !== "play" || house.over || slide || walkAnim) return;
    (axis === "row" ? shoveRow : shoveCol)(house, i, dir);
    const wrap = (v, n) => ((v % n) + n) % n;
    if (axis === "row") { const row = decor[i]; decor[i] = row.map((_, x) => row[wrap(x - dir, house.w)]); }
    else { const col = decor.map((r) => r[i]); col.forEach((_, y) => { decor[y][i] = col[wrap(y - dir, house.h)]; }); }
    slide = { axis, i, dir, t0: clock };
    heard = true; // shoving is loud: the shadow takes a step as soon as the rooms settle
    view.p = { ...house.player }; view.h = { ...house.hunter };
    shake = Math.max(shake, 6);
    sound("shove");
    if (floor === 1 && house.shoves === 1) say("The house moved, and you with it. But shoving is loud. It heard that.");
  }

  function step(d) {
    if (scene !== "play" || house.over || slide || walkAnim) return;
    const from = { ...house.player };
    const r = walk(house, d);
    if (r.kind === "wall") { sound("bump"); shake = Math.max(shake, 2); return; }
    if (r.kind === "locked") { sound("bump"); shake = Math.max(shake, 3); say("Locked. The key is in here somewhere. Look for the glint."); return; }
    if (r.kind === "key") { sound("key"); say("You have the key. Now the front door, the glow on the right wall."); }
    sound("step");
    walkAnim = { from, t0: clock, out: r.kind === "escaped" };
  }

  // ---------- input ----------
  const KEYS = { ArrowUp: "N", ArrowRight: "E", ArrowDown: "S", ArrowLeft: "W", w: "N", d: "E", s: "S", a: "W", W: "N", D: "E", S: "S", A: "W" };
  window.addEventListener("keydown", (e) => {
    if (e.key === "m" || e.key === "M") { muted = !muted; return; }
    if (scene !== "play") { if (e.key === "Enter" || e.key === " ") tapAnywhere(); return; }
    const d = KEYS[e.key];
    if (!d) return;
    e.preventDefault();
    if (e.shiftKey) {
      const p = house.player;
      if (d === "E" || d === "W") shove("row", p.y, d === "E" ? 1 : -1);
      else shove("col", p.x, d === "S" ? 1 : -1);
    } else step(d);
  });
  function tapAnywhere() {
    if (scene === "title") { sound("step"); begin(1); return; }
    if (scene === "end" && clock - endAt > 0.8) {
      if (house.escaped && floor === LAST_FLOOR) { scene = "title"; seed += 1; return; }
      begin(house.escaped ? floor + 1 : floor);
    }
  }
  canvas.addEventListener("pointerdown", (e) => {
    if (scene !== "play") { tapAnywhere(); return; }
    const r = canvas.getBoundingClientRect();
    const hit = hitTest(house, { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H });
    if (hit.kind === "shove") shove(hit.axis, hit.i, hit.dir);
    if (hit.kind === "walk") step(hit.d);
  });

  // ---------- drawing ----------
  function text(t, x, y, size, color, font = "IM Fell English", align = "center") {
    ctx.font = `${size}px "${font}", Georgia, serif`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = "middle";
    ctx.fillText(t, x, y);
  }

  function drawRoom(doors, kind, x, y, cell) {
    const wall = Math.max(6, cell * 0.08), gap = cell * 0.36;
    ctx.fillStyle = (kind % 2) ? "#3a2e26" : "#34291f";
    ctx.fillRect(x, y, cell, cell);
    ctx.strokeStyle = "rgba(0,0,0,0.25)"; ctx.lineWidth = 1;
    for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(x, y + (i * cell) / 6); ctx.lineTo(x + cell, y + (i * cell) / 6); ctx.stroke(); }
    furniture(kind, x + cell / 2, y + cell / 2, cell);
    ctx.fillStyle = "#1a1411";
    const side = (isOpen, x1, y1, w1, h1, horiz) => {
      if (!isOpen) { ctx.fillRect(x1, y1, w1, h1); return; }
      const a = ((horiz ? w1 : h1) - gap) / 2;
      if (horiz) { ctx.fillRect(x1, y1, a, h1); ctx.fillRect(x1 + a + gap, y1, a, h1); }
      else { ctx.fillRect(x1, y1, w1, a); ctx.fillRect(x1, y1 + a + gap, w1, a); }
    };
    side(doors & N, x, y, cell, wall, true);
    side(doors & S, x, y + cell - wall, cell, wall, true);
    side(doors & WEST, x, y, wall, cell, false);
    side(doors & E, x + cell - wall, y, wall, cell, false);
  }

  function furniture(kind, cx, cy, cell) {
    ctx.save(); ctx.translate(cx, cy); ctx.scale(cell / 100, cell / 100);
    if (kind === 0) { ctx.fillStyle = "#5a2a2a"; ctx.fillRect(-26, -18, 52, 36); ctx.fillStyle = "#6e3a32"; ctx.fillRect(-20, -12, 40, 24); } // rug
    if (kind === 1) { ctx.fillStyle = "#4a3426"; ctx.fillRect(-18, -12, 36, 24); } // table
    if (kind === 2) { ctx.fillStyle = "#5b5148"; ctx.fillRect(-16, -26, 32, 48); ctx.fillStyle = "#d8cfc0"; ctx.fillRect(-14, -24, 28, 12); } // bed
    if (kind === 3) { ctx.fillStyle = "#3b2a1e"; ctx.fillRect(-6, -30, 12, 34); ctx.fillStyle = "#c9b27a"; ctx.beginPath(); ctx.arc(0, -22, 5, 0, 7); ctx.fill(); } // clock
    if (kind === 4) { ctx.strokeStyle = "#6b5a46"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 16, 0, 7); ctx.stroke(); } // round rug
    if (kind === 5) { ctx.fillStyle = "#2c2a26"; ctx.fillRect(-24, -6, 48, 12); ctx.fillStyle = "#4b4136"; for (let i = -20; i < 20; i += 8) ctx.fillRect(i, -4, 5, 8); } // books
    ctx.restore();
  }

  const cellOf = (v, cell, ox, oy) => ({ x: ox + v.x * cell + cell / 2, y: oy + v.y * cell + cell / 2 });

  // How far a room has still to slide this shove, in cells (0 when no shove is running).
  function slideOff(axis, i) {
    if (!slide || slide.axis !== axis || slide.i !== i) return 0;
    const k = Math.min(1, (clock - slide.t0) / SHOVE_TIME);
    return -slide.dir * (1 - k) ** 3;
  }
  const offsetFor = (v) => ({ x: v.x + slideOff("row", v.y), y: v.y + slideOff("col", v.x) });

  // Each room, drawn where it is mid-slide, plus its wrapped copy coming in from the far end.
  function eachRoom(fn) {
    const n = house.w, { cell, ox, oy, size } = grid(n);
    ctx.save(); ctx.beginPath(); ctx.rect(ox, oy, size, size); ctx.clip();
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const o = offsetFor({ x, y });
      for (const wx of [-n, 0, n]) for (const wy of [-n, 0, n]) {
        if ((wx && o.x === x) || (wy && o.y === y)) continue;
        fn(house.rooms[y][x], decor[y][x], ox + (o.x + wx) * cell, oy + (o.y + wy) * cell, cell);
      }
    }
    ctx.restore();
  }

  function drawHouse() {
    eachRoom(drawRoom);
    const { cell, ox, oy, size } = grid(house.w);
    ctx.strokeStyle = "#0e0a08"; ctx.lineWidth = 10; ctx.strokeRect(ox - 5, oy - 5, size + 10, size + 10);
    const ex = ox + size + 2, ey = oy + house.exit.y * cell + cell * 0.32;
    ctx.fillStyle = "#6b4a2a"; ctx.fillRect(ex - 6, ey, 12, cell * 0.36);
    ctx.fillStyle = `rgba(255,200,120,${0.5 + Math.sin(clock * 2) * 0.2})`; ctx.fillRect(ex + 6, ey, 4, cell * 0.36);
  }

  function personAt() {
    const { cell, ox, oy } = grid(house.w);
    let v = offsetFor(view.p);
    if (walkAnim) {
      const k = Math.min(1, (clock - walkAnim.t0) / WALK_TIME);
      v = walkAnim.out
        ? { x: house.player.x + 0.7 * k, y: house.player.y }
        : { x: walkAnim.from.x + (house.player.x - walkAnim.from.x) * k, y: walkAnim.from.y + (house.player.y - walkAnim.from.y) * k };
    }
    return cellOf(v, cell, ox, oy);
  }

  function drawPerson(p) {
    const { cell } = grid(house.w);
    ctx.save(); ctx.translate(p.x, p.y); ctx.scale(cell / 100, cell / 100);
    ctx.fillStyle = "rgba(0,0,0,0.4)"; ctx.beginPath(); ctx.ellipse(0, 16, 12, 5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#cfc6b8"; ctx.beginPath(); ctx.ellipse(0, 4, 9, 13, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#e9dfcf"; ctx.beginPath(); ctx.arc(0, -12, 7, 0, 7); ctx.fill();
    ctx.fillStyle = "#e8d9a8"; ctx.fillRect(9, -6, 3, 9);
    const fl = 1 + Math.sin(clock * 23) * 0.2 + Math.sin(clock * 7) * 0.15;
    ctx.fillStyle = "#ffcf6a"; ctx.beginPath(); ctx.ellipse(10.5, -10, 2.4 * fl, 4.5 * fl, 0, 0, 7); ctx.fill();
    ctx.restore();
  }

  function drawShadow(alpha) {
    if (alpha <= 0.01) return;
    const { cell, ox, oy } = grid(house.w);
    const p = cellOf(offsetFor(view.h), cell, ox, oy);
    ctx.save(); ctx.translate(p.x + Math.sin(clock * 9) * 1.5, p.y); ctx.scale(cell / 100, cell / 100); ctx.globalAlpha = alpha;
    const g = ctx.createRadialGradient(0, -6, 2, 0, -6, 40);
    g.addColorStop(0, "rgba(0,0,0,1)"); g.addColorStop(0.6, "rgba(5,3,8,0.85)"); g.addColorStop(1, "rgba(5,3,8,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, -6, 26, 40, 0, 0, 7); ctx.fill();
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.beginPath();
      ctx.ellipse(-16 + i * 8 + Math.sin(clock * 5 + i) * 3, 26 + Math.sin(clock * 4 + i * 2) * 4, 4, 10, 0, 0, 7); ctx.fill();
    }
    ctx.fillStyle = "#e6e2ff"; ctx.beginPath(); ctx.ellipse(-7, -20, 2.6, 1.6, 0, 0, 7); ctx.ellipse(7, -20, 2.6, 1.6, 0, 0, 7); ctx.fill();
    ctx.restore();
  }

  function drawDarkness(p, lift) {
    dctx.globalCompositeOperation = "source-over";
    dctx.clearRect(0, 0, W, H);
    dctx.fillStyle = `rgba(4,3,6,${0.94 - lift * 0.75})`;
    dctx.fillRect(0, 0, W, H);
    dctx.globalCompositeOperation = "destination-out";
    const { cell, ox, oy, size } = grid(house.w);
    const r = cell * (1.25 + Math.sin(clock * 11) * 0.03);
    const g = dctx.createRadialGradient(p.x, p.y, r * 0.2, p.x, p.y, r);
    g.addColorStop(0, "rgba(0,0,0,1)"); g.addColorStop(0.7, "rgba(0,0,0,0.75)"); g.addColorStop(1, "rgba(0,0,0,0)");
    dctx.fillStyle = g; dctx.beginPath(); dctx.arc(p.x, p.y, r, 0, 7); dctx.fill();
    const ex = ox + size, ey = oy + house.exit.y * cell + cell / 2;
    const g2 = dctx.createRadialGradient(ex, ey, 2, ex, ey, cell * 0.55);
    g2.addColorStop(0, "rgba(0,0,0,0.8)"); g2.addColorStop(1, "rgba(0,0,0,0)");
    dctx.fillStyle = g2; dctx.beginPath(); dctx.arc(ex, ey, cell * 0.55, 0, 7); dctx.fill();
    ctx.drawImage(dark, 0, 0, W, H);
  }

  // The layout you remember: faint chalk lines for every wall, so you can plan in the dark.
  function drawMemory() {
    ctx.strokeStyle = "rgba(190,180,215,0.22)"; ctx.lineWidth = 2; ctx.lineCap = "round";
    eachRoom((d, _k, X, Y, cell) => {
      const a = cell * 0.32, b = cell - a, m = 5;
      const seg = (x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
      const wall = (has, x1, y1, x2, y2, horiz) => {
        if (!has) { seg(x1, y1, x2, y2); return; }
        if (horiz) { seg(x1, y1, x1 + a, y1); seg(x1 + b, y1, x2, y2); } else { seg(x1, y1, x1, y1 + a); seg(x1, y1 + b, x2, y2); }
      };
      wall(d & N, X + m, Y + m, X + cell - m, Y + m, true);
      wall(d & S, X + m, Y + cell - m, X + cell - m, Y + cell - m, true);
      wall(d & WEST, X + m, Y + m, X + m, Y + cell - m, false);
      wall(d & E, X + cell - m, Y + m, X + cell - m, Y + cell - m, false);
    });
  }

  function drawKey() {
    if (house.hasKey || !house.key) return;
    const { cell, ox, oy } = grid(house.w);
    const p = cellOf(offsetFor(house.key), cell, ox, oy), a = 0.55 + Math.sin(clock * 3) * 0.3;
    const g = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, cell * 0.25);
    g.addColorStop(0, `rgba(255,214,120,${a})`); g.addColorStop(1, "rgba(255,214,120,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, cell * 0.25, 0, 7); ctx.fill();
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(-0.6); ctx.scale(cell / 100, cell / 100);
    ctx.strokeStyle = `rgba(240,200,110,${0.6 + a * 0.4})`; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(-8, 0, 5, 0, 7); ctx.moveTo(-3, 0); ctx.lineTo(12, 0); ctx.moveTo(8, 0); ctx.lineTo(8, 5); ctx.moveTo(12, 0); ctx.lineTo(12, 5); ctx.stroke();
    ctx.restore();
  }

  function drawArrows() {
    for (const a of arrows(house.w)) {
      const mine = (a.axis === "row" && a.i === house.player.y) || (a.axis === "col" && a.i === house.player.x);
      ctx.save(); ctx.translate(a.x, a.y);
      ctx.rotate(a.axis === "row" ? (a.dir === 1 ? 0 : Math.PI) : (a.dir === 1 ? Math.PI / 2 : -Math.PI / 2));
      ctx.fillStyle = mine ? "rgba(240,200,140,0.85)" : "rgba(200,190,220,0.3)";
      ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-7, -10); ctx.lineTo(-7, 10); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }

  function drawHud(near) {
    text(`FLOOR ${floor}`, 34, 52, 26, "#d9cdb8", "IM Fell English SC", "left");
    text(`of ${LAST_FLOOR}`, 36, 78, 14, "#8d8296", "IM Fell English", "left");
    text(house.hasKey ? "key: yes" : "key: not yet", 36, 104, 14, house.hasKey ? "#e8c878" : "#6d6476", "IM Fell English", "left");
    ctx.globalAlpha = Math.min(1, (clock - hintAt) * 3);
    text(hint, W / 2, 22, 15, "#cfc3ae");
    ctx.globalAlpha = 1;
    if (near > 0) {
      const pulse = (Math.sin(clock * 8) * 0.5 + 0.5) * near;
      const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.8);
      g.addColorStop(0, "rgba(80,0,0,0)"); g.addColorStop(1, `rgba(90,0,0,${0.55 * pulse})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
  }

  function drawTitle() {
    ctx.fillStyle = "#0b0909"; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = Math.sin(clock * 3.1) * Math.sin(clock * 7.3) > 0.85 ? 0.4 : 1;
    text("THE SHIFTING", W / 2, 210, 64, "#d9cdb8", "IM Fell English SC");
    text("HOUSE", W / 2, 290, 92, "#b9a37a", "IM Fell English SC");
    ctx.globalAlpha = 1;
    text("The rooms move. So does it.", W / 2, 370, 22, "#8d8296");
    if (Math.sin(clock * 2.4) > -0.4) text("tap, or press Enter, to go inside", W / 2, 460, 18, "#cfc3ae");
    text("M: sound on/off   ·   best with sound", W / 2, 560, 13, "#5d5560");
  }

  function drawEnd() {
    const k = Math.min(1, (clock - endAt) / 0.6);
    ctx.fillStyle = house.escaped ? `rgba(20,16,12,${0.8 * k})` : `rgba(0,0,0,${0.92 * k})`;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = k;
    if (house.escaped) {
      const lastFloor = floor === LAST_FLOOR;
      text(lastFloor ? "YOU GOT OUT" : "YOU FOUND THE DOOR", W / 2, 230, 48, "#e8d9a8", "IM Fell English SC");
      text(lastFloor ? "The house is quiet now. For now." : "But it opens onto another floor.", W / 2, 290, 20, "#a99e8a");
      text(`${house.moves} steps · ${house.shoves} shoves`, W / 2, 340, 16, "#8d8296");
      if (clock - endAt > 0.8) text(lastFloor ? "tap for the title" : "tap to go on", W / 2, 420, 18, "#cfc3ae");
    } else {
      ctx.fillStyle = "#e6e2ff";
      ctx.beginPath(); ctx.ellipse(W / 2 - 60, 220, 16, 7, 0, 0, 7); ctx.ellipse(W / 2 + 60, 220, 16, 7, 0, 0, 7); ctx.fill();
      text("IT FOUND YOU", W / 2, 320, 48, "#b8b0d8", "IM Fell English SC");
      if (clock - endAt > 0.8) text("tap to try this floor again", W / 2, 410, 18, "#8d8296");
    }
    ctx.globalAlpha = 1;
  }

  // ---------- the loop ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now; clock += dt;
    ctx.save();
    if (shake > 0.2) { ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake); shake *= 0.85; }
    if (scene === "title") drawTitle();
    else {
      if (slide && clock - slide.t0 >= SHOVE_TIME) slide = null;
      if (walkAnim && clock - walkAnim.t0 >= WALK_TIME * (walkAnim.out ? 3 : 1)) { view.p = { ...house.player }; walkAnim = null; }
      let near = 0;
      if (scene === "play" && !house.over) {
        stepAcc += dt;
        if (heard && !slide) { heard = false; stepAcc += house.step * 0.5; } // shoving is loud: it comes sooner
        if (stepAcc >= house.step && !slide) {
          stepAcc = 0;
          const way = path(house, house.hunter);
          lost = way ? 0 : lost + 1;
          // walled off: it wanders a little, then seeps through the wall toward you
          const r = way ? hunterStep(house) : lost % 3 ? wander(house, wanderRand, lastWander) : seep(house);
          if (r.kind === "seep") { sound("near"); if (floor === 1 && !seenSeep) { seenSeep = true; say("It doesn't need doors. It's just slower without them."); } }
          lastWander = r.d ?? lastWander;
          view.h = { ...house.hunter };
          if (way && way.length <= 3) sound("near");
        }
        const way = path(house, house.hunter);
        if (way && way.length <= 2) near = (3 - way.length) / 2;
        if (near > 0 && clock - lastBeat > 0.9 - near * 0.4) { sound("beat"); lastBeat = clock; }
        if (clock > flickerAt) { flicker = 1; sound("flicker"); flickerAt = clock + 4 + Math.random() * 5; }
      }
      if (house.over && scene === "play" && !walkAnim) {
        scene = "end"; endAt = clock;
        if (house.escaped) sound("out"); else { sound("caught"); shake = 30; }
      }
      flicker = Math.max(0, flicker - dt * 3);
      const lit = flicker > 0 ? (Math.sin(clock * 60) > 0 ? flicker : flicker * 0.3) : 0;
      ctx.fillStyle = "#08070a"; ctx.fillRect(0, 0, W, H);
      drawHouse();
      const me = personAt();
      const dist = Math.abs(house.hunter.x - house.player.x) + Math.abs(house.hunter.y - house.player.y);
      const seen = Math.max(lit, dist <= 1 ? 0.95 : 0, scene === "end" && house.caught ? 1 : 0);
      drawShadow(seen);
      drawPerson(me);
      drawDarkness(me, lit);
      drawMemory();
      drawShadow(Math.max(lit * 0.9, dist <= 1 ? 0.6 : 0)); // close by or in a flicker, you see it through the dark
      drawKey();
      drawArrows();
      drawHud(near);
      if (scene === "end") drawEnd();
    }
    ctx.restore();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // For the page test: read the state like a player would see it.
  window.__house = { scene: () => scene, house: () => house, floor: () => floor, grid, arrows };
}
