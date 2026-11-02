// The game: first person inside the shifting house. Rules: house.js (rooms), tiles.js (walls), stalker.js (the shadow).
import { shoveRow, shoveCol } from "./house.js";
import { floorHouse, LAST_FLOOR } from "./floors.js";
import { rng } from "./rng.js";
import { buildTiles, solid, roomOf, roomCenter, canSee, R, FRONT, WARDROBE } from "./tiles.js";
import { makeShadow, think } from "./stalker.js";
import { makeView, render, present, RW, RH } from "./view.js";

export const W = 960, H = 600;
const MOVE = 2.1, TURN = 2.3, SLIDE_STEP = 0.075, RADIUS = 0.22;

// Which way you face, as a side of the compass: 0 east, 1 south, 2 west, 3 north.
export function facing(a) { return ((Math.round(a / (Math.PI / 2)) % 4) + 4) % 4; }

// SHIFT + arrow: shove your own row or column, relative to where you're looking.
// up = the way you face, down = behind you, left/right = to your sides.
export function shoveFor(face, key, room) {
  const turn = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3 }[key];
  if (turn === undefined) return null;
  const d = (face + turn) % 4; // 0 E, 1 S, 2 W, 3 N
  return d === 0 ? { axis: "row", i: room.y, dir: 1 } : d === 2 ? { axis: "row", i: room.y, dir: -1 }
    : d === 1 ? { axis: "col", i: room.x, dir: 1 } : { axis: "col", i: room.x, dir: -1 };
}

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
  let scene = "title", floor = 1, seed = 1, house, decor, map, me, sh, slide = null, band = [];
  let clock = 0, hint = "", hintAt = 0, endAt = 0, shake = 0, flash = 0, hidden = false, sawHide = false, hasKey = false;
  let noiseAt = null, lastStep = 0, lastBeat = 0, lastMyStep = 0, seenOnce = false, caught = false, escaped = false;
  const keys = new Set();

  function begin(n) {
    floor = n;
    house = floorHouse(n, seed);
    const r = rng(seed * 31 + n);
    decor = house.rooms.map((row) => row.map(() => Math.floor(r() * 7)));
    decor[house.player.y][house.player.x] = 3; // a wardrobe right where you start, so you learn to hide
    const start = roomCenter(house.player);
    me = { x: start.x, y: start.y + 0.6, a: -Math.PI / 2 };
    sh = makeShadow(roomCenter(house.hunter));
    house.hunter = { x: -99, y: -99 }; // the shadow lives in tiles now; the room rules only move rooms
    map = buildTiles(house, decor);
    slide = null; hidden = false; sawHide = false; hasKey = !house.key; caught = false; escaped = false; seenOnce = false;
    scene = "play";
    say(n === 1 ? "Find the key. Then the front door.   W/S walk, A/D turn.   E: hide in a wardrobe.   SHIFT + arrow: shove your room."
      : `Floor ${n}. It's learning.`);
  }
  function say(t) { hint = t; hintAt = clock; }

  function keyPos() { return house.key && !hasKey ? roomCenter(house.key) : null; }

  function shove(s) {
    if (scene !== "play" || slide || hidden || !s) return;
    house.player = roomOf(me);
    (s.axis === "row" ? shoveRow : shoveCol)(house, s.i, s.dir);
    const wrap = (v, n) => ((v % n) + n) % n;
    if (s.axis === "row") { const row = decor[s.i]; decor[s.i] = row.map((_, x) => row[wrap(x - s.dir, house.w)]); }
    else { const col = decor.map((rr) => rr[s.i]); col.forEach((_, y) => { decor[y][s.i] = col[wrap(y - s.dir, house.h)]; }); }
    // who rides along: anyone whose room is in the shoved band
    const inBand = (p) => (s.axis === "row" ? roomOf(p).y : roomOf(p).x) === s.i;
    band = [me, sh].filter(inBand);
    slide = { ...s, left: R, next: clock + SLIDE_STEP };
    map = buildTiles(house, decor, slide);
    noiseAt = { x: me.x, y: me.y };
    shake = 5; noise(0.9, 0.6, 220); tone(48, 0.9, "sawtooth", 0.05, 36);
    if (floor === 1 && house.shoves === 1) say("The whole row of rooms moved, with you in it. That was loud. It heard.");
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
    map = buildTiles(house, decor, slide.left ? slide : null);
    if (!slide.left) { slide = null; shake = 8; noise(0.15, 0.8, 300); }
  }

  function tryMove(dx, dy) {
    const nx = me.x + dx, ny = me.y + dy;
    const bump = (x, y) => map.kind[Math.floor(y)]?.[Math.floor(x)];
    for (const [px, py] of [[nx + Math.sign(dx) * RADIUS, me.y], [me.x, ny + Math.sign(dy) * RADIUS]]) {
      if (bump(px, py) === FRONT) {
        if (hasKey) { escaped = true; return; }
        if (clock - hintAt > 2) { say("Locked. The key is somewhere in this house."); tone(90, 0.12, "sine", 0.12, 60); }
      }
    }
    if (!solid(map, nx + Math.sign(dx) * RADIUS, me.y)) me.x = nx;
    if (!solid(map, me.x, ny + Math.sign(dy) * RADIUS)) me.y = ny;
  }

  function facingTile() {
    const fx = me.x + Math.cos(me.a) * 0.9, fy = me.y + Math.sin(me.a) * 0.9;
    return map.kind[Math.floor(fy)]?.[Math.floor(fx)];
  }

  function interact() {
    if (scene !== "play" || slide) return;
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
    if (e.shiftKey && e.key.startsWith("Arrow")) { shove(shoveFor(facing(me.a), e.key, roomOf(me))); return; }
    if (e.key === "e" || e.key === "E" || e.key === " ") { interact(); return; }
    keys.add(e.key.toLowerCase());
  });
  window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
  window.addEventListener("blur", () => keys.clear());
  canvas.addEventListener("pointerdown", (e) => {
    if (scene !== "play") { next(); return; }
    if (document.pointerLockElement !== canvas) canvas.requestPointerLock?.()?.catch?.(() => {});
  });
  document.addEventListener("mousemove", (e) => { if (document.pointerLockElement === canvas && scene === "play" && !hidden) me.a += e.movementX * 0.0035; });
  function next() {
    if (scene === "title") { ac(); begin(1); return; }
    if (scene === "end" && clock - endAt > 1) {
      if (escaped && floor === LAST_FLOOR) { scene = "title"; seed += 1; return; }
      begin(escaped ? floor + 1 : floor);
    }
  }

  // ---------- drawing ----------
  function text(t, x, y, size, color, font = "IM Fell English", align = "center") {
    ctx.font = `${size}px "${font}", Georgia, serif`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = "middle";
    ctx.fillText(t, x, y);
  }

  function drawMap() {
    const s = 11, n = house.w, x0 = W - n * s - 26, y0 = H - n * s - 26;
    ctx.fillStyle = "rgba(205,190,160,0.82)"; ctx.fillRect(x0 - 8, y0 - 8, n * s + 16, n * s + 16);
    ctx.strokeStyle = "rgba(60,40,30,0.75)"; ctx.lineWidth = 1.2;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const d = house.rooms[y][x], X = x0 + x * s, Y = y0 + y * s, a = s * 0.3, b = s - a;
      const seg = (x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
      const wall = (has, x1, y1, x2, y2, horiz) => { if (!has) seg(x1, y1, x2, y2); else if (horiz) { seg(x1, y1, x1 + a, y1); seg(x1 + b, y1, x2, y2); } else { seg(x1, y1, x1, y1 + a); seg(x1, y1 + b, x2, y2); } };
      wall(d & 1, X + 1, Y + 1, X + s - 1, Y + 1, true); wall(d & 4, X + 1, Y + s - 1, X + s - 1, Y + s - 1, true);
      wall(d & 8, X + 1, Y + 1, X + 1, Y + s - 1, false); wall(d & 2, X + s - 1, Y + 1, X + s - 1, Y + s - 1, false);
    }
    ctx.fillStyle = "#7a2a1a"; ctx.fillRect(x0 + n * s - 1, y0 + house.exit.y * s + 3, 3, s - 6);
    const px = x0 + (me.x / R) * s, py = y0 + (me.y / R) * s;
    ctx.fillStyle = "#3a1e10"; ctx.beginPath();
    ctx.moveTo(px + Math.cos(me.a) * 5, py + Math.sin(me.a) * 5);
    ctx.lineTo(px + Math.cos(me.a + 2.5) * 4, py + Math.sin(me.a + 2.5) * 4);
    ctx.lineTo(px + Math.cos(me.a - 2.5) * 4, py + Math.sin(me.a - 2.5) * 4); ctx.fill();
    text("your map", x0 + (n * s) / 2, y0 - 16, 12, "rgba(205,190,160,0.7)");
  }

  function drawTitle() {
    ctx.fillStyle = "#0b0909"; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = Math.sin(clock * 3.1) * Math.sin(clock * 7.3) > 0.85 ? 0.4 : 1;
    text("THE SHIFTING", W / 2, 200, 64, "#d9cdb8", "IM Fell English SC");
    text("HOUSE", W / 2, 280, 92, "#b9a37a", "IM Fell English SC");
    ctx.globalAlpha = 1;
    text("The rooms move. So does it.", W / 2, 360, 22, "#8d8296");
    if (Math.sin(clock * 2.4) > -0.4) text("click, or press Enter, to go inside", W / 2, 450, 18, "#cfc3ae");
    text("headphones on · M: sound on/off · click the house to look around with the mouse", W / 2, 560, 13, "#5d5560");
  }

  function drawEnd() {
    const k = Math.min(1, (clock - endAt) / 0.8);
    ctx.fillStyle = escaped ? `rgba(20,16,12,${0.85 * k})` : "#000"; // caught: the dark is instant
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = k;
    if (escaped) {
      const last = floor === LAST_FLOOR;
      text(last ? "YOU GOT OUT" : "THE DOOR OPENS", W / 2, 230, 48, "#e8d9a8", "IM Fell English SC");
      text(last ? "Behind you, the house goes quiet. For now." : "...onto another floor of the same house.", W / 2, 290, 20, "#a99e8a");
      text(`${house.shoves} shoves`, W / 2, 340, 16, "#8d8296");
      if (clock - endAt > 1) text(last ? "click for the title" : "click to go on", W / 2, 420, 18, "#cfc3ae");
    } else {
      const t = clock - endAt, close = Math.max(0, 1 - t / 1.2); // its face, right up against yours, then gone
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#e6e2ff";
      const ew = 18 + close * 60, eh = 3 + close * 7, gap = 70 + close * 130, j = () => (Math.random() - 0.5) * 4 * close;
      ctx.beginPath(); ctx.ellipse(W / 2 - gap / 2 + j(), 200 + j(), ew, eh, 0.05, 0, 7); ctx.ellipse(W / 2 + gap / 2 + j(), 200 + j(), ew, eh, -0.05, 0, 7); ctx.fill();
      ctx.globalAlpha = Math.min(1, t / 1.2);
      text("IT FOUND YOU", W / 2, 320, 52, "#b8b0d8", "IM Fell English SC");
      if (clock - endAt > 1) text("click to try this floor again", W / 2, 400, 18, "#8d8296");
    }
    ctx.globalAlpha = 1;
  }

  // ---------- the loop ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now; clock += dt;
    if (scene === "title") { drawTitle(); requestAnimationFrame(frame); return; }
    if (scene === "play") {
      slideTick();
      // you
      if (!slide && !hidden) {
        const turn = (keys.has("a") || keys.has("arrowleft") ? -1 : 0) + (keys.has("d") || keys.has("arrowright") ? 1 : 0);
        const fwd = (keys.has("w") || keys.has("arrowup") ? 1 : 0) - (keys.has("s") || keys.has("arrowdown") ? 1 : 0);
        me.a += turn * TURN * dt;
        if (fwd) {
          tryMove(Math.cos(me.a) * fwd * MOVE * dt, Math.sin(me.a) * fwd * MOVE * dt);
          if (clock - lastMyStep > 0.42) { noise(0.04, 0.12, 700); lastMyStep = clock; }
        }
      }
      const k = keyPos();
      if (k && Math.hypot(k.x - me.x, k.y - me.y) < 0.8) {
        hasKey = true; tone(880, 0.5, "triangle", 0.06); tone(1320, 0.6, "triangle", 0.05, 1320, 0.08);
        say("The key. Now the front door, on the east side. It's marked on your map.");
      }
      // the shadow
      const events = slide ? [] : think(sh, { map, player: { x: me.x, y: me.y, hidden }, sawHide, noise: noiseAt, pace: 0.85 + 0.07 * (floor - 1) }, dt, Math.random);
      if (!slide) noiseAt = null; // a shove's noise waits until the rooms stop, then it hears it
      const dx = sh.x - me.x, dy = sh.y - me.y, dist = Math.hypot(dx, dy);
      const rel = Math.atan2(dy, dx) - me.a, pan = Math.max(-1, Math.min(1, Math.sin(rel)));
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
      }
      if (!sh.silent && SPEEDY(sh) && clock - lastStep > (sh.mode === "hunt" || sh.mode === "lunge" ? 0.28 : 0.6)) {
        lastStep = clock; noise(0.06, Math.min(0.5, 2.2 / (1 + dist)), 500, 0, pan);
      }
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
    const light = (hidden ? 0.75 : 1.05) * flick * (1 - dread * 0.45 * (Math.sin(clock * 31) > 0 ? 1 : 0.3));
    const sprites = [{ x: sh.x, y: sh.y, kind: "shadow" }];
    const k = keyPos();
    if (k) sprites.push({ x: k.x, y: k.y, kind: "key", glow: 0.35 + Math.sin(clock * 3) * 0.2 });
    render(view, map, me, light, sprites, hasKey, clock);
    present(view, img, ctx, 0, 0, W, H);
    ctx.restore();

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
    text(`FLOOR ${floor} of ${LAST_FLOOR}`, 26, 28, 18, "rgba(217,205,184,0.75)", "IM Fell English SC", "left");
    text(hasKey ? "key: yes" : "key: not yet", 26, 52, 15, hasKey ? "#e8c878" : "rgba(170,160,180,0.6)", "IM Fell English", "left");
    ctx.globalAlpha = Math.min(1, (clock - hintAt) * 3) * (clock - hintAt < 9 ? 1 : Math.max(0.35, 1 - (clock - hintAt - 9) / 3));
    text(hint, W / 2, H - 22, 16, "#d9cdb8");
    ctx.globalAlpha = 1;
    drawMap();
    if (scene === "end") drawEnd();
    requestAnimationFrame(frame);
  }
  const SPEEDY = (s) => s.mode !== "look" && s.mode !== "lurk" && s.mode !== "pause";
  requestAnimationFrame(frame);

  // For the page test: read the state, and hold keys like a player.
  window.__fp = { scene: () => scene, me: () => me, shadow: () => sh, house: () => house, map: () => map, hidden: () => hidden, hasKey: () => hasKey };
}
