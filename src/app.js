// The game: first person inside the shifting house. Rules: house.js (rooms), tiles.js (walls), stalker.js (the shadow).
import { shoveRow, shoveCol } from "./house.js";
import { floorHouse, LAST_FLOOR, PLAYER_SPEED, shadowPace, headStart, quakeEvery } from "./floors.js";
import { rng } from "./rng.js";
import { buildTiles, move, guide, roomOf, roomCenter, canSee, tilePath, R, FRONT, WARDROBE, CODE, CODE_AT } from "./tiles.js";
import { line, edit, shiftGrid } from "./code.js";
import { makeShadow, think, cutOff, stun, thought } from "./stalker.js";
import { makeView, render, present, RW, RH } from "./view.js";

export const W = 960, H = 600;
const MOVE = PLAYER_SPEED, TURN = 2.3, SLIDE_STEP = 0.075, RADIUS = 0.2;

// Which way you face, as a side of the compass: 0 east, 1 south, 2 west, 3 north.
export function facing(a) { return ((Math.round(a / (Math.PI / 2)) % 4) + 4) % 4; }

if (typeof document !== "undefined") start();

function start() {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  function fit() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const scale = Math.min(window.innerWidth / W, window.innerHeight / H);
    canvas.style.width = `${W * scale}px`; canvas.style.height = `${H * scale}px`;
    canvas.width = Math.round(W * scale * dpr); canvas.height = Math.round(H * scale * dpr);
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  }
  window.addEventListener("resize", fit);
  fit();
  const view = makeView(), img = new ImageData(RW, RH);

  // ---------- sound: made on the spot, no files ----------
  let audio = null, muted = false;
  function ac() { if (muted) return null; try { audio ??= new AudioContext(); } catch { return null; } return audio; }
  function tone(f, d, type = "sine", v = 0.08, f2 = f, at = 0, pan = 0) {
    const a = ac(); if (!a) return;
    const t = a.currentTime + at, o = a.createOscillator(), g = a.createGain(), p = a.createStereoPanner();
    o.type = type; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f2, t + d);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    p.pan.value = pan; o.connect(g).connect(p).connect(a.destination); o.start(t); o.stop(t + d + 0.02);
  }
  function noise(d, v, lp, at = 0, pan = 0) {
    const a = ac(); if (!a) return;
    const b = a.createBuffer(1, Math.ceil(a.sampleRate * d), a.sampleRate), ch = b.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * Math.sin((Math.PI * i) / ch.length);
    const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(), p = a.createStereoPanner();
    f.type = "lowpass"; f.frequency.value = lp; g.gain.value = v; p.pan.value = pan;
    s.buffer = b; s.connect(f).connect(g).connect(p).connect(a.destination); s.start(a.currentTime + at);
  }

  // ---------- state ----------
  let scene = "title", floor = 1, seed = 1, house, decor, codes, map, me, sh, slide = null, band = [], edits = 0, blackout = 0, blackedOut = false, glitch = 0, grabs = 0, lair = null, answer = null;
  let clock = 0, hint = "", hintAt = 0, endAt = 0, shake = 0, flash = 0, hidden = false, sawHide = false, hasKey = false;
  let mind = null, minds = 0, way = null, wayAt = 0, nextQuake = Infinity, warned = false, before = null, wakeAt = 0, awake = false, noiseAt = null, lastStep = 0, lastBeat = 0, lastMyStep = 0, seenOnce = false, caught = false, escaped = false;
  const keys = new Set();

  function begin(n) {
    floor = n;
    house = floorHouse(n, seed);
    const r = rng(seed * 31 + n);
    decor = house.rooms.map((row) => row.map(() => Math.floor(r() * 7)));
    decor[house.player.y][house.player.x] = 3; // a wardrobe right where you start, so you learn to hide
    const start = roomCenter(house.player);
    me = { x: start.x, y: start.y + 0.6, a: -Math.PI / 2 };
    lair = roomCenter(house.hunter);
    sh = makeShadow(lair); grabs = 0;
    house.hunter = { x: -99, y: -99 }; // the shadow lives in tiles now; the room rules only move rooms
    codes = house.codes.map((row) => row.map((c) => c && { ...c }));
    edits = 0; blackout = 0; blackedOut = false;
    map = tiles();
    wakeAt = clock + headStart(n); awake = false; way = null; wayAt = 0; mind = null;
    nextQuake = quakeEvery(n) ? clock + headStart(n) + quakeEvery(n) : Infinity; warned = false;
    slide = null; hidden = false; sawHide = false; hasKey = !house.key; caught = false; escaped = false; seenOnce = false;
    scene = "play";
    say(n === 1 ? "You wrote this house. Now it won't let you leave. Walk up to the writing on the wall and press E."
      : n === LAST_FLOOR ? "The last floor. The house rewrites itself here. Somewhere it says you.trapped = true."
      : "Your old code is still in these walls. One line puts IT to sleep. Dark rooms hide you, and hide your way.");
  }
  function say(t) { hint = t; hintAt = clock; }
  function inDark() { const r = roomOf(me); return codes[r.y]?.[r.x]?.kind === "lights" && !codes[r.y][r.x].on; }
  // The line you're looking at, big enough to read, with the word you can change lit up.
  function drawLine() {
    const f = facingCode(); if (!f) return;
    const back = answer && clock - answer.at < 1.8 && answer.c === f.c;
    const l = back ? { pre: "house.watch(", word: "you", post: ");", spent: true } : line(f.c), y = H / 2 + 120;
    ctx.font = '30px "VT323", "Courier New", monospace'; ctx.textBaseline = "middle";
    const wPre = ctx.measureText(l.pre).width, wWord = ctx.measureText(l.word).width, wPost = ctx.measureText(l.post).width;
    const total = wPre + wWord + wPost, x0 = W / 2 - total / 2;
    ctx.fillStyle = "rgba(8,10,9,0.82)"; ctx.fillRect(x0 - 18, y - 26, total + 36, 74);
    ctx.textAlign = "left";
    ctx.fillStyle = "#c9d6c0"; ctx.fillText(l.pre, x0, y);
    const lock = f.c.kind === "lock";
    ctx.fillStyle = back ? "#ff5040" : l.spent ? "#6c7268" : lock ? "#ff8a70" : "#ffe08a";
    if (!l.spent && Math.sin(clock * 6) > -0.2) ctx.fillRect(x0 + wPre - 2, y + 15, wWord + 4, 2);
    ctx.fillText(l.word, x0 + wPre, y);
    ctx.fillStyle = "#c9d6c0"; ctx.fillText(l.post, x0 + wPre + wWord, y);
    text(back ? "the house wrote back" : l.spent ? "already changed" : "E: change it", W / 2, y + 32, 14, back ? "rgba(255,110,90,0.8)" : "rgba(217,205,184,0.7)");
  }
  // the shadow's mind changes: show its line of code
  function think$(kind) { const t = thought(kind, minds); if (t) { mind = { text: t, at: clock }; minds++; } }
  // It types itself in, flickers, and fades. A wrong character now and then.
  function drawMind() {
    if (!mind) return;
    const age = clock - mind.at; if (age > 4.5) return;
    const shown = Math.min(mind.text.length, Math.floor(age * 38));
    let t = mind.text.slice(0, shown);
    if (Math.random() < 0.12 && t.length) { const i = Math.floor(Math.random() * t.length); t = t.slice(0, i) + "▓#%&"[Math.floor(Math.random() * 4)] + t.slice(i + 1); }
    const alpha = (age < 3.5 ? 1 : 1 - (age - 3.5)) * (Math.random() < 0.06 ? 0.3 : 0.85);
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.font = '19px "VT323", "Courier New", monospace'; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(170,40,30,0.5)"; ctx.fillText("> " + t, 27, 91); // a red ghost, a pixel off
    ctx.fillStyle = "#c9d6c0"; ctx.fillText("> " + t + (shown < mind.text.length || Math.sin(clock * 9) > 0 ? "▌" : ""), 26, 90);
    ctx.globalAlpha = 1;
  }

  const tiles = (sl = null) => buildTiles(house, decor, sl, codes);
  // Where the lock's line is written, and where you'd stand to read it.
  function lockSpot() {
    for (let y = 0; y < house.h; y++) for (let x = 0; x < house.w; x++) if (codes[y][x]?.kind === "lock" && !codes[y][x].open) return { x: x * R + CODE_AT.x + 0.5, y: y * R + CODE_AT.y + 1.5 };
    return null;
  }

  // The line of code you're looking at (close enough to read), and its room.
  function facingCode() {
    if (hidden || slide) return null;
    for (const d of [0.6, 1.0, 1.4]) {
      const fx = me.x + Math.cos(me.a) * d, fy = me.y + Math.sin(me.a) * d;
      const kind = map.kind[Math.floor(fy)]?.[Math.floor(fx)];
      if (kind === CODE) { const room = roomOf({ x: fx, y: fy }); return { room, c: codes[room.y][room.x] }; }
      if (kind !== 0) return null;
    }
    return null;
  }

  // E on a line: change its one word, and the house changes with it. Every edit is loud: the house tells the shadow.
  function rewrite(f) {
    const { effect, next } = edit(f.c);
    if (!effect) { say("The house won't let you change that twice."); tone(90, 0.15, "square", 0.04, 70); return; }
    codes[f.room.y][f.room.x] = next; edits++; glitch = 0.45; shake = Math.max(shake, 7);
    tone(520, 0.08, "square", 0.03); tone(260, 0.25, "square", 0.025, 130, 0.06); // a typewriter clack
    if (effect.shift) shove({ axis: effect.shift, i: effect.shift === "row" ? f.room.y : f.room.x, dir: effect.dir });
    else { noiseAt = { x: me.x, y: me.y }; map = tiles(); }
    if (effect.lights === false) { say("The room goes dark. In the dark it can't see you... unless it's close."); think$("dark"); }
    if (effect.lights === true) say("Lights on.");
    if (effect.sleep) { stun(sh, effect.sleep); think$("sleep"); say("Somewhere, it slumps. Not for long."); }
    if (effect.unlock && floor === LAST_FLOOR) { hasKey = true; tone(660, 1.2, "triangle", 0.06, 990); say("you.trapped = false. The front door is open. Go."); }
    else if (effect.unlock) { hasKey = true; tone(880, 0.5, "triangle", 0.06); tone(1320, 0.6, "triangle", 0.05, 1320, 0.08); say("Something clicks far away. The front door is open. Follow the arrow."); }
    if (!effect.sleep) { think$("watch"); answer = { room: { ...f.room }, at: clock, c: next }; } // the house writes back on its wall
    if (floor === 1 && edits === 1 && effect.shift) say("You changed one word, and the whole row of rooms moved, with you in it. The house heard.");
  }

  // forced: the house moving on its own (last floor). It moves any row or column, and it makes no noise where you are.
  function shove(s, forced = false) {
    if (scene !== "play" || slide || !s || (hidden && !forced)) return;
    // to check afterwards whether this slide cut the shadow off from you
    const shRides = (s.axis === "row" ? roomOf(sh).y : roomOf(sh).x) === s.i;
    before = awake && sh.mode !== "stunned" && !shRides ? tilePath(map, sh, me) : null;
    house.player = roomOf(me);
    (s.axis === "row" ? shoveRow : shoveCol)(house, s.i, s.dir);
    shiftGrid(decor, s.axis, s.i, s.dir); shiftGrid(codes, s.axis, s.i, s.dir);
    // who rides along: anyone whose room is in the shoved band
    const inBand = (p) => (s.axis === "row" ? roomOf(p).y : roomOf(p).x) === s.i;
    band = [me, sh].filter(inBand);
    slide = { ...s, left: R, next: clock + SLIDE_STEP };
    map = tiles(slide);
    if (!forced) noiseAt = { x: me.x, y: me.y };
    shake = 5; noise(0.9, 0.6, 220); tone(48, 0.9, "sawtooth", 0.05, 36);
  }

  function slideTick() {
    if (!slide || clock < slide.next) return;
    slide.left -= 1; slide.next = clock + SLIDE_STEP;
    const mw = house.w * R, mh = house.h * R;
    for (const p of band) {
      if (slide.axis === "row") p.x = ((p.x + slide.dir) % mw + mw) % mw;
      else p.y = ((p.y + slide.dir) % mh + mh) % mh;
    }
    noise(0.07, 0.35, 400);
    map = tiles(slide.left ? slide : null);
    if (!slide.left) {
      slide = null; shake = 8; noise(0.15, 0.8, 300);
      if (before && cutOff(before, tilePath(map, sh, me))) { // you cut it off: it shrieks and loses its way
        stun(sh, 4); noiseAt = null; flash = 0.3; think$("cut");
        tone(900, 0.9, "sawtooth", 0.05, 300); noise(0.8, 0.4, 3500);
        say("You cut it off. It's lost... for now.");
      }
      before = null;
    }
  }

  function tryMove(dx, dy) {
    const nx = me.x + dx, ny = me.y + dy;
    const bump = (x, y) => map.kind[Math.floor(y)]?.[Math.floor(x)];
    for (const [px, py] of [[nx + Math.sign(dx) * (RADIUS + 0.05), me.y], [me.x, ny + Math.sign(dy) * (RADIUS + 0.05)]]) {
      if (bump(px, py) === FRONT) {
        if (hasKey) { escaped = true; return; }
        if (clock - hintAt > 2) { say("Locked. Somewhere a line of red code says so. Follow the arrow."); tone(90, 0.12, "sine", 0.12, 60); }
      }
    }
    const to = move(map, me, dx, dy, RADIUS);
    me.x = to.x; me.y = to.y;
  }

  function facingTile() {
    const fx = me.x + Math.cos(me.a) * 0.9, fy = me.y + Math.sin(me.a) * 0.9;
    return map.kind[Math.floor(fy)]?.[Math.floor(fx)];
  }

  function interact() {
    if (scene !== "play" || slide) return;
    const f = facingCode();
    if (f && !hidden) { rewrite(f); return; }
    if (hidden) { hidden = false; sawHide = false; me.a += Math.PI; tone(180, 0.2, "triangle", 0.05, 120); say("You step out."); return; }
    if (facingTile() === WARDROBE) {
      hidden = true;
      sawHide = canSee(map, sh, me, 9);
      me.a += Math.PI; // inside, you turn round and watch the room through the crack
      noise(0.25, 0.4, 700);
      say(sawHide ? "It saw you get in." : "Hold your breath. Press E to come out.");
    }
  }

  // ---------- input ----------
  window.addEventListener("keydown", (e) => {
    if (e.key === "m" || e.key === "M") { muted = !muted; return; }
    if (scene !== "play") { if (e.key === "Enter" || e.key === " ") next(); return; }
    if (e.key.startsWith("Arrow") || e.key === " " || e.key === "Tab") e.preventDefault();
    // Two hands: WASD + mouse. E (or Space, or right-click) changes the line you're looking at, or hides you.
    const k = e.key.toLowerCase();
    if (k === "e" || e.key === " ") { if (!e.repeat) interact(); return; }
    keys.add(k);
  });
  window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
  window.addEventListener("blur", () => keys.clear());
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener("pointerdown", (e) => {
    if (scene !== "play") { next(); return; }
    if (e.button === 2) { interact(); return; }
    if (document.pointerLockElement !== canvas) canvas.requestPointerLock?.()?.catch?.(() => {});
  });
  document.addEventListener("mousemove", (e) => { if (document.pointerLockElement === canvas && scene === "play" && !hidden) me.a += e.movementX * 0.0035; });
  // Caught isn't game over: it drags you back to your first room. Your changes to the house stay.
  function dragBack() {
    const start = { x: R / 2, y: (house.h - 1) * R + R / 2 + 0.6 }; // your first room, bottom-left
    me = { x: start.x, y: start.y, a: -Math.PI / 2 };
    // it goes back to the far corner, away from the door, and waits a while; and every time it catches you it gets slower,
    // so everyone gets to see the ending
    Object.assign(sh, makeShadow(roomCenter({ x: 0, y: 0 })), { mode: "look", timer: 10 });
    caught = false; hidden = false; sawHide = false; scene = "play"; grabs++; blackout = 0;
    say(grabs === 1 ? "It dragged you back to where you started. Everything you changed is still changed." : "Back where you started. Again.");
    think$("recover");
  }
  function next() {
    if (scene === "title") { ac(); begin(1); canvas.requestPointerLock?.()?.catch?.(() => {}); return; }
    if (scene === "end" && clock - endAt > (escaped && floor === LAST_FLOOR ? 7 : 1)) {
      if (escaped && floor === LAST_FLOOR) { scene = "title"; seed += 1; return; }
      if (escaped) begin(floor + 1);
    }
  }

  // ---------- drawing ----------
  function text(t, x, y, size, color, font = "IM Fell English", align = "center") {
    ctx.font = `${size}px "${font}", Georgia, serif`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = "middle";
    ctx.fillText(t, x, y);
  }

  // Your map turns with you: the way you face is always up.
  function drawMap() {
    const s = 22, n = house.w, size = n * s, pad = 10;
    const cx = W - size / 2 - 30, cy = H - size / 2 - 34;
    const face = facing(me.a), rot = -(face + 1) * Math.PI / 2;
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(rot); ctx.translate(-size / 2, -size / 2);
    ctx.fillStyle = "rgba(205,190,160,0.86)"; ctx.fillRect(-pad, -pad, size + pad * 2, size + pad * 2);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { // rooms with writing: a chalk mark (red: the lock)
      const c = codes[y][x]; if (!c) continue;
      ctx.fillStyle = c.kind === "lock" && !c.open ? "rgba(190,60,40,0.9)" : "rgba(60,70,60,0.45)";
      ctx.fillRect(x * s + s * 0.55, y * s + 3, s * 0.3, 2.5);
    }
    ctx.strokeStyle = "rgba(60,40,30,0.8)"; ctx.lineWidth = 1.4;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const d = house.rooms[y][x], X = x * s, Y = y * s, a = s * 0.3, b = s - a;
      const seg = (x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
      const wall = (has, x1, y1, x2, y2, horiz) => { if (!has) seg(x1, y1, x2, y2); else if (horiz) { seg(x1, y1, x1 + a, y1); seg(x1 + b, y1, x2, y2); } else { seg(x1, y1, x1, y1 + a); seg(x1, y1 + b, x2, y2); } };
      wall(d & 1, X + 1, Y + 1, X + s - 1, Y + 1, true); wall(d & 4, X + 1, Y + s - 1, X + s - 1, Y + s - 1, true);
      wall(d & 8, X + 1, Y + 1, X + 1, Y + s - 1, false); wall(d & 2, X + s - 1, Y + 1, X + s - 1, Y + s - 1, false);
    }
    ctx.fillStyle = hasKey ? "#c8501e" : "#7a2a1a"; ctx.fillRect(size - 1, house.exit.y * s + 3, 4, s - 6); // the front door
    // you can feel it when it's near: a dark smudge on your map
    const shd = Math.hypot(sh.x - me.x, sh.y - me.y);
    if (awake && shd < 10) {
      const gx = (sh.x / R) * s, gy = (sh.y / R) * s, gr = s * 0.45;
      const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
      const a = (sh.mode === "stunned" ? 0.35 : 0.85) * Math.min(1, (10 - shd) / 4);
      g.addColorStop(0, `rgba(10,5,10,${a})`); g.addColorStop(1, "rgba(10,5,10,0)");
      ctx.fillStyle = g; ctx.fillRect(gx - gr, gy - gr, gr * 2, gr * 2);
    }
    const px = (me.x / R) * s, py = (me.y / R) * s, r = 6;
    ctx.fillStyle = "#3a1e10"; ctx.beginPath();
    ctx.moveTo(px + Math.cos(me.a) * r, py + Math.sin(me.a) * r);
    ctx.lineTo(px + Math.cos(me.a + 2.5) * r * 0.8, py + Math.sin(me.a + 2.5) * r * 0.8);
    ctx.lineTo(px + Math.cos(me.a - 2.5) * r * 0.8, py + Math.sin(me.a - 2.5) * r * 0.8); ctx.fill();
    ctx.restore();
    // N for north, kept upright, on whichever edge north is now
    const D = size / 2 + pad + 9, nx = cx + Math.sin(rot) * D, ny = cy - Math.cos(rot) * D;
    text("N", nx, ny, 13, "rgba(205,190,160,0.8)", "IM Fell English SC");
    text("map: up is the way you face", W - 24, cy - size / 2 - pad - 30, 12, "rgba(205,190,160,0.7)", "IM Fell English", "right");
  }

  // The arrow at the top: which way to the key (then the door), following the halls.
  function drawGuide() {
    if (hidden) return;
    if (inDark()) { text("too dark to see the way", W / 2, 70, 14, "rgba(160,150,170,0.5)"); return; } // the price of hiding in the dark
    if (!way || clock - wayAt > 0.25) {
      const k = lockSpot(), goal = k ?? { x: house.exit.x * R + R - 1.5, y: house.exit.y * R + R / 2 };
      way = { ...guide(map, me, goal), what: k ? (floor === LAST_FLOOR ? "the line that traps you" : "the lock's code") : "the door" }; wayAt = clock;
    }
    const rel = way.angle - me.a, x = W / 2, y = 44;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rel + Math.PI / 2);
    ctx.fillStyle = way.blocked ? "rgba(200,90,60,0.9)" : "rgba(232,217,168,0.85)";
    ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(10, 8); ctx.lineTo(0, 3); ctx.lineTo(-10, 8); ctx.fill();
    ctx.restore();
    text(way.blocked ? `no way through to ${way.what}: change a line that moves rooms` : way.what, x, y + 26, 14, way.blocked ? "rgba(220,120,90,0.9)" : "rgba(217,205,184,0.7)");
  }

  function drawTitle() {
    ctx.fillStyle = "#0b0909"; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = Math.sin(clock * 3.1) * Math.sin(clock * 7.3) > 0.85 ? 0.4 : 1;
    text("THE SHIFTING", W / 2, 200, 64, "#d9cdb8", "IM Fell English SC");
    text("HOUSE", W / 2, 280, 92, "#b9a37a", "IM Fell English SC");
    ctx.globalAlpha = 1;
    text("The rooms move. So does it.", W / 2, 360, 22, "#8d8296");
    if (Math.sin(clock * 2.4) > -0.4) text("click, or press Enter, to go inside", W / 2, 450, 18, "#cfc3ae");
    text("headphones on · WASD + mouse · SPACE slides rooms · M: sound", W / 2, 560, 13, "#5d5560");
  }

  function drawEnd() {
    const k = Math.min(1, (clock - endAt) / 0.8);
    ctx.fillStyle = escaped ? `rgba(20,16,12,${0.85 * k})` : "#000"; // caught: the dark is instant
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = k;
    if (escaped) {
      const last = floor === LAST_FLOOR, t = clock - endAt;
      text(last ? "YOU GOT OUT" : "THE DOOR OPENS", W / 2, last ? 170 : 230, 48, "#e8d9a8", "IM Fell English SC");
      if (!last) text("...onto another floor of the same house.", W / 2, 290, 20, "#a99e8a");
      else { // the twist: what the house kept of you
        const said = "shadow = you.copy();   // what the house kept of you";
        ctx.font = '26px "VT323", "Courier New", monospace'; ctx.textAlign = "center"; ctx.fillStyle = "#ff6a50";
        if (t > 1.5) ctx.fillText(said.slice(0, Math.floor((t - 1.5) * 26)) + (Math.sin(clock * 9) > 0 ? "▌" : ""), W / 2, 250);
        if (t > 4) text("Behind you, the front door opens again.", W / 2, 300, 20, "#a99e8a");
        if (t > 5.5) { ctx.fillStyle = "#e6e2ff"; const a = Math.min(1, (t - 5.5) / 1.5); ctx.globalAlpha = a; ctx.beginPath(); ctx.ellipse(W / 2 - 12, 460, 5, 1.5, 0, 0, 7); ctx.ellipse(W / 2 + 12, 460, 5, 1.5, 0, 0, 7); ctx.fill(); ctx.globalAlpha = k; }
      }
      if (!last) text(`${edits} ${edits === 1 ? "word" : "words"} changed · caught ${grabs} ${grabs === 1 ? "time" : "times"}`, W / 2, 340, 16, "#8d8296");
      else if (t > 7) text(`${edits} ${edits === 1 ? "word" : "words"} changed · caught ${grabs} ${grabs === 1 ? "time" : "times"}`, W / 2, 360, 16, "#8d8296");
      if (clock - endAt > (last ? 7 : 1)) text(last ? "click for the title" : "click to go on", W / 2, last ? 540 : 420, 18, "#cfc3ae");
    } else {
      const t = clock - endAt, close = Math.max(0, 1 - t / 1.2); // its face, right up against yours, then gone
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#e6e2ff";
      const ew = 18 + close * 60, eh = 3 + close * 7, gap = 70 + close * 130, j = () => (Math.random() - 0.5) * 4 * close;
      ctx.beginPath(); ctx.ellipse(W / 2 - gap / 2 + j(), 200 + j(), ew, eh, 0.05, 0, 7); ctx.ellipse(W / 2 + gap / 2 + j(), 200 + j(), ew, eh, -0.05, 0, 7); ctx.fill();
      ctx.globalAlpha = Math.min(1, t / 1.2);
      text("IT FOUND YOU", W / 2, 320, 52, "#b8b0d8", "IM Fell English SC");
      if (t > 1.2) text("...and drags you back", W / 2, 380, 20, "#8d8296");
    }
    ctx.globalAlpha = 1;
  }

  // ---------- the loop ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now; clock += dt;
    if (scene === "title") { drawTitle(); requestAnimationFrame(frame); return; }
    if (scene === "end" && caught && clock - endAt > 2.6) dragBack();
    if (scene === "play") {
      slideTick();
      // you
      if (!slide && !hidden) {
        // with the mouse, A/D step sideways (the mouse turns you); without it, A/D turn
        const side = (keys.has("a") ? -1 : 0) + (keys.has("d") ? 1 : 0);
        const fwd = (keys.has("w") ? 1 : 0) - (keys.has("s") ? 1 : 0);
        const mouse = document.pointerLockElement === canvas;
        if (!mouse) me.a += side * TURN * dt;
        const strafe = mouse ? side : 0;
        if (fwd || strafe) {
          const len = Math.hypot(fwd, strafe) || 1;
          const mx = (Math.cos(me.a) * fwd - Math.sin(me.a) * strafe) / len, my = (Math.sin(me.a) * fwd + Math.cos(me.a) * strafe) / len;
          tryMove(mx * MOVE * dt, my * MOVE * dt);
          if (clock - lastMyStep > 0.42) { noise(0.04, 0.12, 700); lastMyStep = clock; }
        }
      }
      // the shadow
      // the last floor: the house moves on its own, with a groan first
      if (clock > nextQuake - 2.5 && !warned) { warned = true; tone(40, 2.5, "sawtooth", 0.07, 30); noise(2.4, 0.3, 160); say("The house groans. Something is about to move."); }
      if (clock >= nextQuake && !slide) {
        const r = Math.random(), axis = r < 0.5 ? "row" : "col", i = Math.floor(Math.random() * house.w), dir = Math.random() < 0.5 ? 1 : -1;
        shove({ axis, i, dir }, true);
        mind = { text: `house.${axis === "row" ? "row" : "column"}[${i}].shift(${axis === "row" ? (dir > 0 ? "east" : "west") : (dir > 0 ? "south" : "north")});  // not you`, at: clock };
        glitch = 0.3;
        nextQuake = clock + quakeEvery(floor); warned = false;
      }
      if (!awake && (clock >= wakeAt || hasKey)) {
        awake = true; tone(52, 2.2, "sawtooth", 0.06, 40); noise(1.4, 0.25, 260);
        say(floor === 1 ? "Somewhere in the house, something wakes up." : "It's moving."); think$("wake");
        Object.assign(sh, { mode: "look", timer: 2.5, target: null }); // it wakes slowly: it looks around first
      }
      const events = slide || !awake ? [] : think(sh, { map, player: { x: me.x, y: me.y, hidden }, dark: inDark(), sawHide, noise: noiseAt, pace: shadowPace(floor) * Math.max(0.55, 1 - 0.12 * grabs) }, dt, Math.random);
      if (!slide) noiseAt = null; // a shove's noise waits until the rooms stop, then it hears it
      const dx = sh.x - me.x, dy = sh.y - me.y, dist = Math.hypot(dx, dy);
      const rel = Math.atan2(dy, dx) - me.a, pan = Math.max(-1, Math.min(1, Math.sin(rel)));
      for (const e of events) think$(e.kind === "spotted" && sh.mode === "pause" ? "freeze" : e.kind);
      for (const e of events) {
        if (e.kind === "spotted") {
          flash = 0.5; shake = 6; noise(0.5, 0.5, 2400); tone(220, 1.2, "sawtooth", 0.05, 207);
          if (!seenOnce) { seenOnce = true; say("RUN. Or hide. It can't see you in a wardrobe... if it didn't watch you climb in."); }
        }
        if (e.kind === "lunge") { tone(90, 0.6, "sawtooth", 0.12, 400); noise(0.4, 0.8, 3000); shake = 10; }
        if (e.kind === "lost" && floor === 1) say("It lost you. It will look where it last saw you.");
        if (e.kind === "heard") tone(70, 0.8, "sine", 0.05, 60, 0, pan);
        if (e.kind === "seep") { say("It's coming through the wall."); noise(1.2, 0.3, 500, 0, pan); }
        if (e.kind === "caught") caught = true;
        if (e.kind === "recover") { say("It found its way again."); tone(110, 0.6, "sawtooth", 0.04, 140, 0, pan); }
      }
      if (!sh.silent && SPEEDY(sh) && clock - lastStep > (sh.mode === "hunt" || sh.mode === "lunge" ? 0.28 : 0.6)) {
        lastStep = clock; noise(0.06, Math.min(0.5, 2.2 / (1 + dist)), 500, 0, pan);
      }
      if (!blackedOut && awake && dist < 6 && sh.mode !== "stunned") { blackedOut = true; blackout = 1.6; noise(0.3, 0.6, 90); tone(30, 1.6, "sine", 0.2, 25); think$("dark"); }
      if (dist < 7 && clock - lastBeat > 0.35 + dist * 0.09) { lastBeat = clock; tone(60, 0.12, "sine", 0.4 - dist * 0.04, 45); tone(58, 0.12, "sine", 0.3 - dist * 0.03, 44, 0.16); }
      if (caught || escaped) {
        scene = "end"; endAt = clock;
        if (caught) { noise(1.6, 0.9, 1200); tone(150, 1.4, "sawtooth", 0.1, 30); flash = 1; shake = 30; }
        else [392, 494, 587].forEach((f, i) => tone(f, 1, "triangle", 0.05, f, i * 0.12));
      }
    }

    // draw the world
    ctx.save();
    if (shake > 0.3) { ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake); shake *= 0.86; }
    const flick = 1 + Math.sin(clock * 17) * 0.04 + Math.sin(clock * 5.3) * 0.05;
    const dist = Math.hypot(sh.x - me.x, sh.y - me.y);
    const dread = Math.max(0, 1 - dist / 6); // your candle gutters when it's near
    if (blackout > 0) blackout -= dt;
    const light = blackout > 0 ? 0.04 : (hidden ? 0.75 : 1.05) * (inDark() ? 0.38 : 1) * flick * (1 - dread * 0.45 * (Math.sin(clock * 31) > 0 ? 1 : 0.3));
    const sprites = [{ x: sh.x, y: sh.y, kind: "shadow" }];
    render(view, map, me, light, sprites, hasKey, clock);
    present(view, img, ctx, 0, 0, W, H);
    ctx.restore();
    if (glitch > 0) { // reality tears for a moment when you rewrite it: slices of the picture jump sideways, red and green ghosts
      glitch -= dt;
      for (let i = 0; i < 9; i++) {
        const y = Math.random() * H, h = 6 + Math.random() * 40, off = (Math.random() - 0.5) * 120 * (glitch / 0.45);
        ctx.drawImage(canvas, 0, y * (canvas.height / H), canvas.width, h * (canvas.height / H), off, y, W, h);
      }
      ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.25 * (glitch / 0.45);
      ctx.fillStyle = "#ff2040"; ctx.fillRect(-4, 0, W, H); ctx.fillStyle = "#20ff90"; ctx.fillRect(4, 0, W, H);
      ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
    }

    // wardrobe: you see the room through a crack between the doors
    if (hidden) {
      ctx.fillStyle = "#050404";
      ctx.fillRect(0, 0, W / 2 - 14, H); ctx.fillRect(W / 2 + 14, 0, W / 2, H);
      ctx.fillStyle = "rgba(40,24,16,0.9)"; ctx.fillRect(W / 2 - 16, 0, 4, H); ctx.fillRect(W / 2 + 12, 0, 4, H);
    }
    // vignette, darker as it gets closer
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.85);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, `rgba(${Math.round(30 * dread)},0,0,${0.75 + dread * 0.2})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    if (flash > 0) { ctx.fillStyle = `rgba(220,215,255,${flash * 0.5})`; ctx.fillRect(0, 0, W, H); flash = Math.max(0, flash - dt * 2.5); }

    // hud
    if (scene === "end") { drawEnd(); requestAnimationFrame(frame); return; }
    text(`FLOOR ${floor} of ${LAST_FLOOR}`, 26, 28, 18, "rgba(217,205,184,0.75)", "IM Fell English SC", "left");
    text(hasKey ? "front door: unlocked" : "front door: locked", 26, 52, 15, hasKey ? "#e8c878" : "rgba(170,160,180,0.6)", "IM Fell English", "left");
    ctx.globalAlpha = Math.min(1, (clock - hintAt) * 3) * (clock - hintAt < 9 ? 1 : Math.max(0.35, 1 - (clock - hintAt - 9) / 3));
    text(hint, W / 2, H - 22, 16, "#d9cdb8");
    ctx.globalAlpha = 1;
    drawMap();
    if (scene === "play") { drawGuide(); drawLine(); }
    drawMind();
    if (scene === "end") drawEnd();
    requestAnimationFrame(frame);
  }
  const SPEEDY = (s) => s.mode !== "look" && s.mode !== "lurk" && s.mode !== "pause" && s.mode !== "stunned";
  requestAnimationFrame(frame);

  // For the page test: read the state, and hold keys like a player.
  window.__fp = { grabs: () => grabs, codes: () => codes, facingCode: () => facingCode(), mind: () => mind, begin: (n) => begin(n), quakeSoon: () => { nextQuake = clock + 0.1; }, quake: () => nextQuake, way: () => way, awake: () => awake, scene: () => scene, me: () => me, shadow: () => sh, house: () => house, map: () => map, hidden: () => hidden, hasKey: () => hasKey };
}
