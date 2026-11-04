// The Shifting House: a doll's house cut open. Click a room to walk there; click a word in the house's code
// to change the house. Two locks, a front door, and a shadow that hunts you through the rooms.
import { W, H, FLOOR, shiftRow, byId, find, nbrs, path, reach, clone, applyEdit, edits, solve, pickHouse, pageRoom, houseMoves, steps, NEW_WORD } from "./house.js";
import { COMMITS, PAGES, VOICE, ENDING, HOUSE_LINES, FINALE, JOKES, HOLD, AWAY, CREDITS } from "./story.js";
import * as sfx from "./sound.js";
import * as art from "./art.js";
import * as tear from "./tear.js";
import * as desk from "./desk.js";


// ---------- layout ----------
const VW = 960, VH = 600, DPR = 2;
const CW = 150, CH = 146, HX = 44, HY = 74, HW = W * CW, HH = H * CH;
const HCX = HX + HW / 2, HCY = HY + HH / 2, PX = 664, PW = 278;
const cv = document.getElementById("game"), ctx = cv.getContext("2d");
cv.width = VW * DPR; cv.height = VH * DPR;
const MONO = 'VT323, "Courier New", monospace', SERIF = '"IM Fell English", Georgia, serif';
const INK = "#d6ccb6", DIM = "rgba(214,204,182,0.45)", YEL = "#ffd36a", RED = "#ff5a4e", GRN = "#8fe39a";

// ---------- helpers ----------
const { lerp, clamp, shade } = art;
const ease = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
function poly(pts, fill) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); }

// ---------- game state ----------
let st;
const FLOORS = 3, PACE = [92, 104, 116], TRAPS = [10, 9, 8];
let runSeed = 0;
function newGame(seed, floor = 1, carry = null) {
  const h = pickHouse(floor, seed); if (floor === 1) runSeed = seed;
  st = {
    floor, moves: 0, hint: null, hintRect: null, floorT: 0, total: carry ? carry.total : { moves: 0, par: 0, hints: 0 },
    scene: "title", g: h.g, h, unlocked: false, t: 0, anim: null, shake: 0, glitch: 0, edits: 0,
    player: { id: h.startId, fx: 0.5, way: null, pending: null },
    shadow: { id: h.shadowId, fx: 0.5, way: null, mode: "sleep", timer: 0, noPath: 0, seep: false },
    alert: 0, thought: { text: "shadow.awake = false;  // for now", t: 0 }, writeBack: null,
    floats: [], hover: null, reachFlash: 0, wordRects: [], grabs: 0, walked: 0, caughtT: 0, endT: 0, sinceStart: 0,
    preview: null, previewKey: "", dust: [], traps: 0, flipped: false,
    bolt: carry && carry.bolt ? carry.bolt : { t: 99, next: 9, x: 300 }, stepT: 0,
    // story
    page: { id: pageRoom(h, floor), got: false }, pages: carry ? carry.pages : 0, found: carry ? carry.found : [], said: carry ? carry.said : new Set(),
    used: carry ? carry.used : new Set(), playerEdits: 0, houseNext: null, finale: null, finalePath: null,
    voice: null, pageShow: null, started: false, blackout: 0, faceBolt: false, faced: false, typed: null, ending: null, endT2: 0, idleSaid: false,
  };
  if (carry) { st.grabs = carry.grabs; st.scene = "play"; st.shadow.mode = "sleep"; }
  setTitle("The Shifting House");
}
function setTitle(t) { try { document.title = t; } catch { /* fine */ } }
function nextFloor() {
  const carry = { grabs: st.grabs, total: st.total, bolt: st.bolt, pages: st.pages, found: st.found, said: st.said, used: st.used };
  newGame(st.floor + 1 === 3 ? null : (Math.random() * 1e9) | 0, st.floor + 1, carry);
}
function floorDone() {
  st.total.moves += st.moves; st.total.par += st.h.par;
  if (st.floor < FLOORS) { st.scene = "floor"; st.endT = 0; } else { st.scene = "end"; st.endT = 0; }
  sfx.frontDoor();
}

// the last word: keep the shadow, or keep nobody (only with all three pages)
function choose(which) {
  if (st.ending) return; st.ending = which; st.endT2 = 0;
  try { localStorage.setItem("shift-ending", which); } catch { /* fine */ }
  setTitle(which === "free" ? "nobody home" : FINALE.title);
  (which === "free" ? sfx.endingFree : sfx.endingKeep)();
}
function endingUpdate(dt) {
  st.endT2 += dt;
  if (st.ending === "free") { const rooms = st.g.flat(); rooms.forEach((r, i) => { if (st.endT2 > 2.4 + i * 0.32) r.lights = false; }); }
}

// walkers: a list of waypoints {id, fx}; fx is across the room's floor (0 = left wall, 1 = right wall)
function stepPts(g, aId, bId) {
  const a = find(g, aId), b = find(g, bId);
  if (b.x > a.x) return [{ id: aId, fx: 0.94 }, { id: bId, fx: 0.06 }];
  if (b.x < a.x) return [{ id: aId, fx: 0.06 }, { id: bId, fx: 0.94 }];
  return [{ id: aId, fx: 0.78, v: true }, { id: bId, fx: 0.78, v: true }];
}
function buildWay(w, ids, end) {
  const pts = [{ id: w.id, fx: w.fx }];
  for (let i = 0; i + 1 < ids.length; i++) pts.push(...stepPts(st.g, ids[i], ids[i + 1]));
  pts.push(end || { id: ids[ids.length - 1], fx: 0.5 });
  return { pts, seg: 0, t: 0 };
}
function screenPos(id, fx) {
  const p = find(st.g, id), off = bandOffset(p);
  return [HX + p.x * CW + off[0] + 8 + fx * (CW - 16), HY + p.y * CH + off[1] + CH - 13];
}
function walkerPos(w) {
  if (!w.way) return screenPos(w.id, w.fx);
  const a = w.way.pts[w.way.seg], b = w.way.pts[w.way.seg + 1];
  const pa = screenPos(a.id, a.fx), pb = screenPos(b.id, b.fx), k = w.way.t;
  return [lerp(pa[0], pb[0], k), lerp(pa[1], pb[1], k)];
}
function advance(w, dt, speed, onArrive) {
  const way = w.way; if (!way) return;
  const a = way.pts[way.seg], b = way.pts[way.seg + 1];
  const pa = screenPos(a.id, a.fx), pb = screenPos(b.id, b.fx);
  const dist = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]), climb = a.v && b.v && a.id !== b.id;
  way.t += dt * speed * (climb ? 0.55 : 1) / Math.max(8, dist);
  if (way.t >= 1) {
    way.seg++; way.t = 0; w.id = b.id; w.fx = b.fx;
    if (way.seg >= way.pts.length - 1) { w.way = null; onArrive && onArrive(way); }
    else if (w.pending) { const p = w.pending; w.pending = null; w.way = null; onArrive && onArrive(null, p); }
  }
}
function settle(w) { if (w.way) { const a = w.way.pts[w.way.seg]; w.id = a.id; w.fx = a.fx; w.way = null; } }

// ---------- actions ----------
function think(text) { if (st.thought.text !== text) st.thought = { text, t: 0 }; }
// the house talks back, typed out under the house; most lines only once a game
// Only these speak during play now (CH: "a lot going on"); the house's own moves speak for it the rest of the time.
const SPOKEN = new Set(["start1", "start1again", "start2", "start3", "caught"]);
function say(key) {
  if (!SPOKEN.has(key)) return;
  const v = VOICE[key], text = typeof v === "string" ? v : v.text;
  if (st.said.has(key) && !(v && v.again)) return;
  st.said.add(key); st.voice = { text, t: 0 }; sfx.voice();
}
function lastEnding() { try { return localStorage.getItem("shift-ending"); } catch { return null; } }
function float(x, y, text, color) { st.floats.push({ x, y, text, color, t: 0 }); }
function walkTo(id, exit, mx, my) {
  const w = st.player;
  if (w.way) { w.pending = { id, exit }; return; }
  const p = path(st.g, w.id, id);
  if (!p) { float(mx, my, "no way there", RED); st.reachFlash = 1.2; return; }
  if (p.length === 1 && !exit) { w.way = { pts: [{ id: w.id, fx: w.fx }, { id, fx: 0.5 }], seg: 0, t: 0 }; return; }
  w.way = buildWay(w, p, exit ? { id, fx: -0.32, exit: true } : null);
  w.way.exit = !!exit;
}
function doEdit(li, dir = 1) {
  if (st.anim || st.scene !== "play") return;
  const room = byId(st.g, st.player.id), c = room.lines[li];
  if (c.kind === "lock" && st.unlocked) return;
  st.used.add(c.kind);
  const res = performEdit(room.id, li, dir, false);
  st.edits++; st.hint = null; if (res.kind !== "lights" && res.kind !== "lock") st.moves++;
  st.writeBack = { li, t: 0 };
  if (res.kind === "lock") {
    float(HX + 60, HY + HH - 90, "the front door is open", GRN); sfx.unlock();
    if (st.floor === FLOORS) startFinale(); else say("unlock");
  }
  else if (res.kind === "flip") say("flip");
  else say("firstEdit");
  if (st.shadow.mode === "sleep") wake();
  if (res.kind !== "lights" && res.kind !== "lock") houseTurn();
}
// one word changes, by you or by the house: the rooms move, with sound, dust and a shake
function performEdit(id, li, dir, byHouse) {
  settle(st.player); settle(st.shadow); st.player.pending = null;
  const res = applyEdit(st.g, id, li, st, dir); unseal();
  if (byHouse && st.hint && st.hint.text && st.hint.text.startsWith("Hint:")) { const t = st.hint.t; doHint(false); st.hint.t = t; } // the house moved: the hint follows
  if (st.shadow.mode !== "sleep" && !path(st.g, st.shadow.id, st.player.id) && st.shadow.noPath === 0) { trapped(!byHouse); st.shadow.noPath = 0.01; }
  st.glitch = 0.5; st.shake = res.kind === "row" || res.kind === "col" ? 0.6 : 0.25;
  st.alert = 4; st.preview = null; st.previewKey = "";
  if (res.kind === "row" || res.kind === "col") { st.anim = { ...res, t: 0 }; sfx.slide(); dustBurst(res); }
  else if (res.kind === "swap") { st.anim = { ...res, t: 0 }; sfx.swap(); }
  else if (res.kind === "flip") { st.anim = { ...res, t: 0, slow: true }; sfx.flip(); st.shake = 1; if (!byHouse && !st.gag) { st.gag = true; st.sticker = { t: 0 }; } }
  else if (res.kind === "door") (res.open ? sfx.doorOpen : sfx.doorShut)();
  else if (res.kind === "lights") sfx.lights(res.on);
  return res;
}

// ---------- the house plays back ----------
// After your move the house makes one of its own: it picks the nastiest word it can find in another room (bring
// the shadow closer, cut down where you can go), but never one that leaves no way out. It warns you first, in red.
const HOUSE_WAIT = 0.6, HOUSE_WARN = 1.5;
const pick = (a) => a[(Math.random() * a.length) | 0];
function houseTurn() {
  if (st.finale || st.scene !== "play") return;
  st.playerEdits++; st.houseIdle = 0;
  st.houseNext = { t: -HOUSE_WAIT, move: null };
}
function pickHouseMove() {
  const me = st.player.id, sh = st.shadow;
  const moves = houseMoves(st.g, me, sh.id, sh.mode !== "sleep");
  for (const m of moves) { m.reuse = st.floor > 1 && st.used.has(m.kind); m.score += (m.reuse ? 1.5 : 0) + Math.random() * 0.9; }
  moves.sort((a, b) => b.score - a.score);
  // It never shuts you in, and never hands you the exit: no move of its own may make your way out shorter, or let you
  // skip this floor's new word.
  const L = st.h.lockIds, U = st.unlocked, base = solve(st.g, me, L, U, 3), need = base ? base.length : 4;
  const nw = NEW_WORD[st.floor] && NEW_WORD[st.floor].kind, guarded = nw && base && need > 0 && !solve(st.g, me, L, U, need, nw);
  for (const m of moves.slice(0, 6)) {
    const p = solve(m.g, me, L, U, 3);
    if (!p || p.length < need) continue;
    if (guarded && solve(m.g, me, L, U, p.length, nw)) continue;
    return m;
  }
  return null;
}
function houseCode(m) {
  const room = byId(st.g, m.id), c = room.lines[m.li], parts = lineParts(room, c, false);
  const w = c.kind === "door" ? (room[c.side === "west" ? "l" : "r"] ? "shut" : "open") : parts[1].find((x) => (x.dir ?? 1) === m.dir).text;
  return parts[0] + w + parts[2];
}
const HOUSE_IDLE = [14, 10, 8]; // and if you sit still too long, it moves anyway
function houseUpdate(dt) {
  if (!st.houseNext && !st.finale && st.shadow.mode !== "sleep") {
    st.houseIdle = (st.houseIdle || 0) + dt;
    if (st.houseIdle > HOUSE_IDLE[st.floor - 1]) { st.houseIdle = 0; st.houseNext = { t: 0, move: null }; }
  }
  const hn = st.houseNext; if (!hn) return;
  hn.t += dt;
  if (hn.t >= 0 && !hn.move) {
    const m = pickHouseMove(); if (!m) { st.houseNext = null; return; }
    hn.move = m; hn.code = houseCode(m); sfx.creak(0.35);
  }
  if (hn.move && hn.t >= HOUSE_WARN) {
    const m = hn.move, room = byId(st.g, m.id); st.houseNext = null;
    if (!room || !room.lines[m.li] || st.player.id === m.id) return;
    const still = houseMoves(st.g, st.player.id, st.shadow.id, false).find((x) => x.id === m.id && x.li === m.li && x.dir === m.dir);
    if (!still || !solve(still.g, st.player.id, st.h.lockIds, st.unlocked, 3)) return; // you moved first: it lets it go
    const c = room.lines[m.li], wasOpen = c.kind === "door" && room[c.side === "west" ? "l" : "r"];
    st.lastHouse = houseCode(m); performEdit(m.id, m.li, m.dir, true); st.total.house = (st.total.house || 0) + 1;
    const lines = m.reuse ? HOUSE_LINES.reuse : c.kind === "door" ? HOUSE_LINES.door[wasOpen ? "shut" : "open"] : HOUSE_LINES[c.kind];
    sayLine(pick(lines)); think(`house.${c.kind === "door" ? (wasOpen ? "shut" : "open") : "move"}(${room.name});`);
  }
}
function sayLine(text) { st.voice = { text, t: 0 }; sfx.voice(); }

// ---------- the finale ----------
// The last front door is unlocked: the house stops taking turns and slides its own rows every few seconds while the
// shadow runs you down. One way to the door always stays open, and it's lit.
function startFinale() {
  st.finale = { t: 0, next: 3.4, n: 0, lost: 0 }; st.houseNext = null; sayLine(FINALE.tear); setTitle(FINALE.title);
  st.tear = { t: 0 }; st.floats = []; sfx.thunder(); // the screen break: the house tears out of its window first (src/tear.js)
  if (st.shadow.mode === "sleep") wake();
  // the house turns itself over, so the front door is as far away as it can make it
  settle(st.player); settle(st.shadow); st.player.pending = null;
  if (find(st.g, st.player.id).y > 0) {
    st.g.reverse(); for (const row of st.g) for (const r of row) [r.up, r.down] = [r.down, r.up];
    st.flipped = !st.flipped; st.anim = { kind: "flip", t: 0, slow: true }; sfx.flip();
  } else sfx.breakOut();
  st.shake = 1;
  if (!path(st.g, st.player.id, doorRoom())) carve();
}
// It wants the chase, so it never shuts you in: if there's no way to the door, it opens one (down, then west).
function carve() {
  let p = find(st.g, st.player.id);
  while (p.y < H - 1) { const a = st.g[p.y][p.x], b = st.g[p.y + 1][p.x]; a.down = true; b.up = true; p = { x: p.x, y: p.y + 1 }; }
  while (p.x > 0) { const a = st.g[p.y][p.x], b = st.g[p.y][p.x - 1]; a.l = true; b.r = true; p = { x: p.x - 1, y: p.y }; }
  think("house.open(a.way);  // run");
}
const doorRoom = () => st.g[H - 1][0].id;
function finaleUpdate(dt) {
  const f = st.finale; f.t += dt; f.next -= dt;
  st.finalePath = path(st.g, st.player.id, doorRoom());
  if (!st.finalePath && !st.anim) { f.lost += dt; if (f.lost > 4) { f.lost = 0; carve(); } } else f.lost = 0;
  if (f.next > 0 || st.anim) return;
  f.next = 3.2; const me = st.player.id, pm = find(st.g, me), opts = [];
  for (let y = 0; y < H; y++) for (const dir of [-1, 1]) {
    if (y === pm.y) continue; const g2 = clone(st.g); g2[y] = g2[y].map((_, x) => g2[y][(x - dir + W * 2) % W]);
    // keep a way to the door open (or make one, if there isn't one), then bring the shadow closer
    const open = path(g2, me, g2[H - 1][0].id) ? 10 : 0;
    opts.push({ y, dir, score: open + steps(path(st.g, st.shadow.id, me)) - steps(path(g2, st.shadow.id, me)) + Math.random() });
  }
  opts.sort((a, b) => b.score - a.score); const o = opts[0];
  if (!o) return;
  settle(st.player); settle(st.shadow); st.player.pending = null;
  const row = st.g[o.y]; st.g[o.y] = row.map((_, x) => row[(x - o.dir + W * 2) % W]);
  st.anim = { kind: "row", i: o.y, dir: o.dir, t: 0 }; sfx.slide(); dustBurst(st.anim); st.shake = 0.7;
  if (!path(st.g, me, doorRoom())) carve(); // every slide would cut you off: it slides anyway, and opens a new way
  if (f.n++ % 2 === 0) sayLine(FINALE.lines[(f.n / 2 | 0) % FINALE.lines.length]);
}

// While the house is out of its window nothing else moves. Sounds land on the beats; then it says "Then run."
function tearUpdate(dt) {
  const t0 = st.tear.t, t1 = (st.tear.t += dt), T = tear.TEAR, at = (k) => t0 < k && t1 >= k;
  if (at(T.out)) { sfx.slide(); sfx.creak(0.6); }
  if (at(T.out + 0.4)) setTitle(tear.windowTitle(t1));
  if (at(T.slam)) { sfx.doorShut(); sfx.breakOut(); sfx.thunder(0.1); }
  if (t1 >= T.len) { st.tear = null; setTitle(FINALE.title); sayLine(FINALE.start); }
}

// One absurd moment per floor, early, and on floor 1 a nudge so nobody sits stuck
function gags() {
  if (st.finale) return;
  if (st.floor === 1 && !st.gag && st.sinceStart > 12) { st.gag = true; st.shake = 0.9; dustBurst({ kind: "row", i: 0 }); dustBurst({ kind: "row", i: 2 }); sfx.breakOut(); sayLine(JOKES.sneeze); }
  // floor 1: lost, whether sitting still or clicking around? It points the way (and keeps doing it)
  if (st.floor === 1 && !st.unlocked) {
    const nz = st.nudge || (st.nudge = { at: 0, moves: 0, n: 0 }), since = st.sinceStart - nz.at, R = reach(st.g, st.player.id);
    const lost = !st.h.lockIds.some((l) => R.has(l));
    if (lost && ((nz.n === 0 && st.sinceStart > 30 && st.moves === 0) || (nz.n === 0 && st.moves >= st.h.par + 4 && st.sinceStart > 10) || (nz.n > 0 && (since > 25 || (st.moves - nz.moves >= 4 && since > 8))))) {
      nz.at = st.sinceStart; nz.moves = st.moves; nz.n++; st.nudged = true; doHint(false); sayLine(JOKES.nudges[Math.min(nz.n, JOKES.nudges.length) - 1]);
    }
  }
  if (st.floor === 2 && !st.gag && st.sinceStart > 8 && st.shadow.mode !== "sleep") { st.gag = true; st.sign = { t: 0 }; }
}
// house.hint(): the next word of the shortest way out
function doHint(asked = true) {
  const plan = solve(st.g, st.player.id, st.h.lockIds, st.unlocked, 4);
  if (asked) { st.total.hints++; sfx.hint(); }
  if (!plan) st.hint = { text: "Hint: even the house is lost. Try sliding a row back the way it came." };
  else if (!plan.length) st.hint = { text: st.unlocked ? "Hint: the way is open. Click the front door, bottom left." : "Hint: a red lock is in reach. Walk there and click true." };
  else {
    const m = plan[0], room = byId(st.g, m.id), word = lineParts(room, room.lines[m.li], true)[1].find((w) => (w.dir ?? 1) === m.dir).text;
    st.hint = { ...m, text: m.id === st.player.id ? `Hint: click "${word}" in this room's code.` : `Hint: walk to the ${room.name} (yellow frame), then click "${word}" in its code.` };
  }
  // it runs out of patience before it runs out of hints (the real hint still follows)
  if (asked && st.total.hints === 5) st.hint.text = `${JOKES.hint5} ${JOKES.fine} ${st.hint.text.replace(/^Hint: /, "")}`;
  if (asked && st.total.hints === 7) { st.hint.text = `${JOKES.hint7} ${JOKES.fine} ${st.hint.text.replace(/^Hint: /, "")}`; st.crayon = { t: 0 }; }
  st.hint.t = 0;
}

// ---------- update ----------
function update(dt) {
  weather(dt);
  st.t += dt; st.thought.t += dt; st.glitch = Math.max(0, st.glitch - dt); st.shake = Math.max(0, st.shake - dt);
  st.reachFlash = Math.max(0, st.reachFlash - dt); st.blackout = Math.max(0, st.blackout - dt);
  if (st.voice) { st.voice.t += dt; if (st.voice.t > 6) st.voice = null; }
  if (st.pageShow) { st.pageShow.t += dt; if (st.pageShow.t > 10) st.pageShow = null; }
  if (st.typed) st.typed.t += dt;
  if (st.faceBolt && st.bolt.t > 1.2) st.faceBolt = false;
  if (st.writeBack) { st.writeBack.t += dt; if (st.writeBack.t > 2.2) st.writeBack = null; }
  if (st.crayon && (st.crayon.t += dt) > 9) st.crayon = null;
  if (st.note && (st.note.t += dt) > 6) st.note = null;
  if (st.sign && (st.sign.t += dt) > 4) st.sign = null;
  if (st.sticker && (st.sticker.t += dt) > 5) st.sticker = null;
  if (st.desk) { st.desk.t += dt; if (st.desk.bin != null) st.desk.bin += dt; }
  st.floats = st.floats.filter((f) => (f.t += dt) < 1.4);
  st.dust = st.dust.filter((d) => { d.t += dt; d.x += d.vx * dt; d.y += d.vy * dt; d.vy += 40 * dt; return d.t < d.life; });
  if (st.scene === "caught") { st.caughtT += dt; if (st.caughtT > 2.4) dragBack(); return; }
  if (st.scene === "desk") return;
  if (st.scene === "credits") { st.credT += dt; if (st.credT > CRED_LEN + 1.5) openDesk(); return; }
  if (st.scene === "title") shuffleUpdate(dt);
  holdUpdate(dt);
  if (st.scene === "end") { st.endT += dt; if (st.ending) endingUpdate(dt); else if (st.endT > (st.pages >= 3 ? 16.5 : 8)) choose("keep"); return; }
  if (st.scene === "floor") { st.endT += dt; return; }
  if (st.scene !== "play") return;
  if (st.tear) { tearUpdate(dt); if (st.tear) return; }
  if (!st.started) { st.started = true; say(st.floor === 1 ? (lastEnding() ? "start1again" : "start1") : `start${st.floor}`); }
  if (st.floorT > 45 && st.edits > 0 && !st.idleSaid) { st.idleSaid = true; say("idle"); }
  // floor 3: lightning, and for a moment something enormous behind the house
  if (st.floor === 3 && !st.faced && st.sinceStart > 7) { st.faced = true; st.faceBolt = true; st.bolt = { t: 0, next: 20, x: HCX }; sfx.thunder(0.7); say("face"); }
  st.sinceStart += dt; st.floorT += dt; st.alert = Math.max(0, st.alert - dt);
  gags();
  if (st.anim) { st.anim.t += dt / (st.anim.slow ? 1.3 : 0.7); if (st.anim.t >= 1) st.anim = null; else return; }

  houseUpdate(dt);
  if (st.finale) finaleUpdate(dt);
  advance(st.player, dt, 250, (way, pending) => {
    st.walked++;
    if (way && way.exit) floorDone();
    if (pending) walkTo(pending.id, pending.exit, 0, 0);
  });
  if (st.page.id != null && !st.page.got && st.player.id === st.page.id) {
    st.page.got = true; st.pages++; st.found.push(st.floor); sfx.page(); // you read it between floors
    const p = walkerPos(st.player); float(p[0] - 10, p[1] - 50, `a torn page (${st.pages} of 3)`, "#e8dcc0");
  }

  const sh = st.shadow, speed = PACE[st.floor - 1] / (1 + 0.22 * st.grabs) * (st.finale ? 1.3 : 1);
  if (sh.mode === "sleep") {
    if (st.sinceStart > 8) wake();
  } else if (sh.way) advance(sh, dt, sh.seep ? speed * 0.5 : speed, () => { sh.seep = false; });
  else if ((sh.timer -= dt) <= 0) planShadow();

  const pp = walkerPos(st.player), sp = walkerPos(sh);
  if (sh.mode !== "sleep" && Math.hypot(pp[0] - sp[0], pp[1] - sp[1]) < 24) { st.scene = "caught"; st.caughtT = 0; think("found(you);"); sfx.caught(); say("caught"); }
  sfx.update(dt, nearness());
  if (st.player.way && (st.stepT -= dt) <= 0) { sfx.step(); st.stepT = 0.27; }
}
// it wakes. On floor 2 every lamp in the house dies with it, for a moment.
function wake() {
  if (st.floor === 1) return; // floor 1 is just you and the house; it sleeps through it
  const sh = st.shadow; sh.mode = "hunt"; sh.timer = 1.2;
  if (st.floor === 2 && !st.said.has("blackout")) { st.blackout = 1.8; sfx.blackout(); say("blackout"); }
}
function planShadow() {
  const sh = st.shadow, me = st.player, here = byId(st.g, me.id);
  const p = path(st.g, sh.id, me.id), dark = !here.lights && st.alert <= 0;
  if (!p) {
    if (sh.noPath === 0) trapped(false);
    sh.noPath += 0.5; sh.timer = 0.5;
    if (sh.noPath >= TRAPS[st.floor - 1]) breakOut();
    return;
  }
  sh.noPath = 0;
  if (dark && p.length > 2) {
    const a = find(st.g, sh.id), n = nbrs(st.g, a.x, a.y);
    if (n.length) { const [x, y] = n[(Math.random() * n.length) | 0]; sh.way = buildWay(sh, [sh.id, st.g[y][x].id]); }
    think("where(you) == undefined;"); sh.timer = 0.9; return;
  }
  if (p.length > 1) { sh.way = buildWay(sh, [p[0], p[1]]); think(p.length <= 2 ? "you.distance = 1;" : "shadow.moveTo(you);"); sh.timer = 0.45; }
}
// Shut in: no way from it to you. It claws through a wall after TRAPS[floor] seconds.
function trapped(byYou) {
  think("shadow.trapped = true;  // for now"); sfx.trapped();
  if (byYou) {
    st.traps++; const sp = walkerPos(st.shadow); float(sp[0] + 20, sp[1] - 60, "you shut it in", GRN); say("trap");
    if (!st.noteShown) { st.noteShown = true; st.note = { t: 0 }; } // it slides a note under the wall
  }
}
function breakOut() {
  const sh = st.shadow, a = find(st.g, sh.id), b = find(st.g, st.player.id);
  const nx = a.x + Math.sign(b.x - a.x), ny = a.y + (nx === a.x ? Math.sign(b.y - a.y) : 0);
  if (nx !== a.x || ny !== a.y) { sh.way = buildWay(sh, [sh.id, st.g[ny][nx].id]); sh.seep = true; }
  sh.noPath = 0; st.shake = 0.6; think("wall.break();  // here i come"); sfx.breakOut();
}
// Never trap the player for good: if no word in reach can ever get you out of this room, the house opens its walls.
function unseal() {
  const me = st.player.id; if (reach(st.g, me).size > 1) return;
  const room = byId(st.g, me);
  for (let li = 0; li < room.lines.length; li++) {
    for (const d of [-1, 1]) { const c = clone(st.g); for (let k = 0; k < 4; k++) { applyEdit(c, me, li, null, d); if (reach(c, me).size > 1) return; } }
  }
  const p = find(st.g, me); room.l = room.r = true;
  if (p.x > 0) st.g[p.y][p.x - 1].r = true; if (p.x < W - 1) st.g[p.y][p.x + 1].l = true;
  think("house.open(this);  // not yet");
}
function dragBack() {
  st.grabs++; st.scene = "play";
  const me = st.player, sh = st.shadow; me.way = null; me.pending = null; me.id = st.h.startId; me.fx = 0.5;
  const b = find(st.g, me.id); let best = null, bd = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { if (x <= 1 && y === H - 1) continue; const d = Math.abs(x - b.x) + Math.abs(y - b.y) + Math.random() * 0.5; if (d > bd) { bd = d; best = st.g[y][x]; } }
  sh.way = null; sh.id = best.id; sh.fx = 0.5; sh.mode = "hunt"; sh.timer = 5; sh.noPath = 0;
  unseal(); think("house.return(you);  // again"); float(screenPos(me.id, 0.5)[0], screenPos(me.id, 0.5)[1] - 50, "back where you started", RED);
}

// ---------- drawing ----------
// where a room is drawn this frame: the slide animation and the hover preview move whole rows/columns
function bandOffset(p) {
  const sw = st.anim && st.anim.kind === "swap" ? { ...st.anim, k: 1 - ease(st.anim.t) } : st.preview && st.preview.band && st.preview.band.kind === "swap" ? { ...st.preview.band, k: -0.12 * (0.5 + 0.5 * Math.sin(st.t * 6)) } : null;
  if (sw && p.y === sw.y && (p.x === sw.a || p.x === sw.b)) {
    const from = p.x === sw.a ? sw.b : sw.a, lift = st.anim ? Math.sin(Math.PI * ease(st.anim.t)) * 22 : 0;
    return [(from - p.x) * CW * sw.k, p.x === sw.a ? -lift : lift];
  }
  let ax = null, i = -1, d = 0;
  if (st.anim) { ax = st.anim.kind; i = st.anim.i; d = -st.anim.dir * (1 - ease(st.anim.t)); }
  else if (st.preview && st.preview.band) { ax = st.preview.band.kind; i = st.preview.band.i; d = st.preview.band.dir * 0.13 * (0.5 + 0.5 * Math.sin(st.t * 6)); }
  if (ax === "row" && p.y === i) return [d * CW, 0];
  if (ax === "col" && p.x === i) return [0, d * CH];
  return [0, 0];
}
function drawPositions(p) {
  const off = bandOffset(p), x = HX + p.x * CW + off[0], y = HY + p.y * CH + off[1], out = [[x, y]];
  if (x < HX - 1) out.push([x + HW, y]); else if (x + CW > HX + HW + 1) out.push([x - HW, y]);
  if (y < HY - 1) out.push([x, y + HH]); else if (y + CH > HY + HH + 1) out.push([x, y - HH]);
  return out;
}

function roomGeo(cx, cy) {
  const ox = cx + 4, oy = cy + 4, ow = CW - 8, oh = CH - 8, mx = cx + CW / 2, my = cy + CH / 2;
  const sx = (HCX - mx) * 0.04, sy = (HCY - my) * 0.035;
  const bx = ox + 22 + sx, by = oy + 14 + sy, bw = ow - 44, bh = oh - 40;
  const side = (s, u, v) => { const fx = s === "l" ? lerp(ox, bx, u) : lerp(ox + ow, bx + bw, u); const yb = lerp(oy + oh, by + bh, u), yt = lerp(oy, by, u); return [fx, lerp(yb, yt, v)]; };
  const fl = (f, u) => [lerp(ox + f * ow, bx + f * bw, u), lerp(oy + oh, by + bh, u)];
  const ce = (f, u) => [lerp(ox + f * ow, bx + f * bw, u), lerp(oy, by, u)];
  return { ox, oy, ow, oh, bx, by, bw, bh, side, fl, ce };
}

function drawRoom(room, cx, cy, o) {
  const G = roomGeo(cx, cy), { ox, oy, ow, oh, bx, by, bw, bh } = G, c = room.wall;
  const shHere = st.shadow.mode !== "sleep" && st.shadow.id === room.id;
  let lit = room.lights ? 1 : 0;
  if (o.lightPreview) lit = lerp(lit, 1 - lit, o.lightPreview);
  if (st.finale && st.scene === "play") lit = st.finalePath && st.finalePath.includes(room.id) ? 1 : 0;
  let L = lerp(0.17, 1, lit) * (0.95 + 0.05 * Math.sin(st.t * 11 + room.id * 7) * Math.sin(st.t * 3.3 + room.id));
  if (shHere && Math.random() < 0.18) L *= 0.55;
  if (st.scene === "title") L *= 0.55;
  if (st.blackout > 0) L *= st.blackout > 0.4 ? 0.12 : lerp(1, 0.12, st.blackout / 0.4);
  poly([[ox, oy], [ox + ow, oy], [bx + bw, by], [bx, by]], shade(c, 0.42 * L));
  poly([[ox, oy + oh], [ox + ow, oy + oh], [bx + bw, by + bh], [bx, by + bh]], shade(FLOOR, 0.8 * L));
  poly([[ox, oy], [bx, by], [bx, by + bh], [ox, oy + oh]], shade(c, 0.6 * L));
  poly([[ox + ow, oy], [bx + bw, by], [bx + bw, by + bh], [ox + ow, oy + oh]], shade(c, 0.6 * L));
  ctx.fillStyle = shade(c, 0.86 * L); ctx.fillRect(bx, by, bw, bh);
  // wallpaper and floorboards
  art.wallpaper(ctx, room, bx, by, bw, bh, L);
  ctx.strokeStyle = shade(FLOOR, 0.55 * L); ctx.lineWidth = 1;
  for (let f = 0.1; f < 1; f += 0.15) { const a = G.fl(f, 0), b = G.fl(f, 1); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
  // decor on the back wall
  const dx = bx + bw * 0.32, dy = by + bh * 0.2;
  if (room.decor === 0) {
    ctx.fillStyle = shade([120, 92, 50], L); ctx.fillRect(dx - 13, dy, 26, 32);
    ctx.fillStyle = shade([30, 26, 24], L); ctx.fillRect(dx - 10, dy + 3, 20, 26);
    const pp = walkerPos(st.player), look = Math.sign(pp[0] - dx) * 1.2;
    ctx.fillStyle = `rgba(230,220,200,${0.5 * L})`; ctx.fillRect(dx - 4 + look, dy + 11, 2, 2); ctx.fillRect(dx + 2 + look, dy + 11, 2, 2);
  } else if (room.decor === 1) {
    const g = ctx.createLinearGradient(0, dy, 0, dy + 34); g.addColorStop(0, "#2a3b62"); g.addColorStop(1, "#121a2c");
    ctx.fillStyle = g; ctx.fillRect(dx - 13, dy, 26, 34);
    ctx.fillStyle = "rgba(230,235,255,0.55)"; ctx.beginPath(); ctx.arc(dx + 5, dy + 9, 3.5, 0, 7); ctx.fill();
    ctx.fillStyle = shade([40, 30, 26], Math.max(L, 0.5)); ctx.fillRect(dx - 1, dy, 2, 34); ctx.fillRect(dx - 13, dy + 16, 26, 2);
  } else if (room.decor === 2) {
    ctx.fillStyle = shade([200, 186, 150], L); ctx.beginPath(); ctx.arc(dx, dy + 14, 11, 0, 7); ctx.fill();
    ctx.strokeStyle = shade([30, 24, 20], 1); ctx.lineWidth = 1.5; ctx.beginPath();
    const a1 = st.t * 0.6 + room.id, a2 = st.t * 0.05;
    ctx.moveTo(dx, dy + 14); ctx.lineTo(dx + Math.cos(a1) * 8, dy + 14 + Math.sin(a1) * 8);
    ctx.moveTo(dx, dy + 14); ctx.lineTo(dx + Math.cos(a2) * 5, dy + 14 + Math.sin(a2) * 5); ctx.stroke();
  } else {
    ctx.save(); ctx.translate(dx, dy + 16); ctx.rotate(0.14); ctx.strokeStyle = shade([120, 92, 50], L); ctx.lineWidth = 3; ctx.strokeRect(-12, -14, 24, 28); ctx.restore();
  }
  // side doors
  for (const s of ["l", "r"]) {
    const hasLine = room.lines.some((l) => l.kind === "door" && (l.side === "west") === (s === "l"));
    const q = [G.side(s, 0.22, 0), G.side(s, 0.68, 0), G.side(s, 0.68, 0.68), G.side(s, 0.22, 0.68)];
    if (room[s]) poly(q, "rgba(6,5,8,0.92)");
    else if (hasLine) { poly(q, shade([92, 60, 36], L)); const k = G.side(s, 0.6, 0.32); ctx.fillStyle = shade([210, 180, 90], L); ctx.fillRect(k[0] - 1, k[1] - 1, 2.5, 2.5); }
    if (o.door && o.door.side === s) {
      ctx.save(); ctx.globalAlpha = 0.55 + 0.45 * Math.sin(st.t * 8); ctx.strokeStyle = o.door.open ? GRN : RED; ctx.lineWidth = 2.5;
      ctx.beginPath(); q.forEach((pt, i) => i ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1])); ctx.closePath(); ctx.stroke(); ctx.restore();
    }
  }
  // ladders and hatches
  if (room.down) poly([G.fl(0.7, 0.12), G.fl(0.86, 0.12), G.fl(0.86, 0.5), G.fl(0.7, 0.5)], "rgba(4,3,6,0.95)");
  if (room.up) {
    poly([G.ce(0.7, 0.12), G.ce(0.86, 0.12), G.ce(0.86, 0.5), G.ce(0.7, 0.5)], "rgba(4,3,6,0.95)");
    const b1 = G.fl(0.72, 0.32), b2 = G.fl(0.84, 0.32), t1 = G.ce(0.72, 0.32), t2 = G.ce(0.84, 0.32);
    ctx.strokeStyle = shade([150, 110, 70], Math.max(L, 0.35)); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(b1[0], b1[1]); ctx.lineTo(t1[0], t1[1] - 4); ctx.moveTo(b2[0], b2[1]); ctx.lineTo(t2[0], t2[1] - 4);
    for (let k = 0.1; k < 1; k += 0.15) { const y = lerp(b1[1], t1[1], k); ctx.moveTo(b1[0], y); ctx.lineTo(b2[0], y); } ctx.stroke();
  }
  // the lock
  if (room.lines.some((l) => l.kind === "lock")) {
    const lx = bx + bw * 0.7, ly = by + bh * 0.42, col = st.unlocked ? GRN : RED;
    glows.push(() => { ctx.save(); ctx.shadowColor = col; ctx.shadowBlur = 16 + 6 * Math.sin(st.t * 4); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(lx, ly - 4 - (st.unlocked ? 5 : 0), 6, Math.PI, 0); ctx.stroke(); ctx.fillRect(lx - 8, ly - 3, 16, 12); ctx.restore(); });
    ctx.save(); ctx.shadowColor = col; ctx.shadowBlur = 12 + 6 * Math.sin(st.t * 4); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(lx, ly - 4 - (st.unlocked ? 5 : 0), 6, Math.PI, 0); ctx.stroke(); ctx.fillRect(lx - 8, ly - 3, 16, 12); ctx.restore();
  }
  art.furniture(ctx, room, G, L, st.t);
  // a torn page on the floor, glowing faintly
  if (st.page.id === room.id && !st.page.got) {
    const [px, py] = G.fl(0.3, 0.25), k = 0.6 + 0.4 * Math.sin(st.t * 3 + 1);
    glows.push(() => { ctx.save(); ctx.globalCompositeOperation = "lighter"; const pg2 = ctx.createRadialGradient(px, py, 1, px, py, 22);
      pg2.addColorStop(0, `rgba(255,240,200,${0.5 * k})`); pg2.addColorStop(1, "rgba(255,240,200,0)"); ctx.fillStyle = pg2; ctx.fillRect(px - 24, py - 24, 48, 48); ctx.restore(); });
    ctx.save(); ctx.globalCompositeOperation = "lighter"; const pg = ctx.createRadialGradient(px, py, 1, px, py, 26);
    pg.addColorStop(0, `rgba(255,240,200,${0.35 * k})`); pg.addColorStop(1, "rgba(255,240,200,0)"); ctx.fillStyle = pg; ctx.fillRect(px - 28, py - 28, 56, 56); ctx.restore();
    ctx.save(); ctx.translate(px, py); ctx.rotate(-0.25); ctx.fillStyle = shade([232, 220, 192], Math.max(L, 0.6));
    ctx.beginPath(); ctx.moveTo(-9, -5); ctx.lineTo(8, -6); ctx.lineTo(9, 3); ctx.lineTo(4, 5); ctx.lineTo(-8, 6); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(60,50,40,0.6)"; ctx.lineWidth = 0.8; ctx.beginPath(); for (const yy of [-2, 1, 4]) { ctx.moveTo(-6, yy); ctx.lineTo(5, yy); } ctx.stroke(); ctx.restore();
  }
  // lamp
  const lp = G.ce(0.5, 0.55);
  ctx.strokeStyle = "rgba(20,16,14,0.9)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(lp[0], lp[1]); ctx.lineTo(lp[0], lp[1] + 16); ctx.stroke();
  ctx.fillStyle = lit > 0.5 ? `rgba(255,214,150,${0.9 * L})` : "rgba(60,56,52,0.9)"; ctx.beginPath(); ctx.arc(lp[0], lp[1] + 19, 3.5, 0, 7); ctx.fill();
  if (lit > 0.05) {
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    const gl = ctx.createRadialGradient(lp[0], lp[1] + 19, 2, lp[0], lp[1] + 19, 105);
    gl.addColorStop(0, `rgba(255,180,100,${0.2 * L * lit})`); gl.addColorStop(1, "rgba(255,180,100,0)");
    ctx.fillStyle = gl; ctx.fillRect(ox, oy, ow, oh); ctx.restore();
  }
  art.motes(ctx, room, G, L, st.t);
  // corners fall into shadow
  const vg = ctx.createRadialGradient(cx + CW / 2, cy + CH * 0.45, CW * 0.25, cx + CW / 2, cy + CH * 0.45, CW * 0.8);
  vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.45)"); ctx.fillStyle = vg; ctx.fillRect(ox, oy, ow, oh);
  // name on the ceiling's front edge
  ctx.font = `14px ${MONO}`; ctx.textAlign = "center"; ctx.fillStyle = `rgba(235,215,185,${0.28 + 0.3 * lit})`; ctx.fillText(room.name, cx + CW / 2, oy + 11);
  ctx.textAlign = "left";
}

const drawPlayer = (x, y) => art.player(ctx, x, y, st.t, !!st.player.way);
function drawShadow(x, y) {
  const sh = st.shadow, pp = walkerPos(st.player), end = st.scene === "end";
  // in the dark you only see it when it is in your light, or when lightning shows it
  const seen = end ? 1 : Math.max(clamp(1.5 - Math.hypot(pp[0] - x, pp[1] - y) / 110, 0, 1), flash() * 0.9);
  if (seen > 0) { ctx.save(); ctx.globalAlpha = seen; art.shadow(ctx, x, y, st.t, { asleep: sh.mode === "sleep", seep: sh.seep, near: nearness(), look: clamp((pp[0] - x) / 60, -1, 1) }); ctx.restore(); }
  if (end || sh.seep) return;
  // two red eyes in the dark: shut while it sleeps, wider the closer it gets
  const ey = y - 44 + Math.sin(st.t * 1.4) * 2, lx = clamp((pp[0] - x) / 60, -1, 1) * 1.5, blink = Math.sin(st.t * 0.9 + x * 0.01) > 0.97;
  ctx.save(); ctx.shadowColor = "#ff2a1e";
  if (sh.mode === "sleep") { ctx.globalAlpha = 0.35 * (1 - seen); ctx.fillStyle = "#ff3b2e"; ctx.fillRect(x - 6 + lx, ey + 1, 4, 1); ctx.fillRect(x + 2 + lx, ey + 1, 4, 1); }
  else if (!blink) { const n = nearness(), r = n <= 1 ? 4 : 3; ctx.shadowBlur = n <= 1 ? 16 : 10; ctx.fillStyle = "#ff3b2e"; ctx.fillRect(x - 6 + lx, ey, r, r - 1); ctx.fillRect(x + 2.5 + lx, ey, r, r - 1); }
  ctx.restore();
}
// how many rooms the shadow is from you along open ways (Infinity: asleep, or no way through)
function nearness() {
  if (st.shadow.mode === "sleep") return Infinity;
  const p = path(st.g, st.shadow.id, st.player.id); return p ? p.length - 1 : Infinity;
}

function outlineSlot(x, y, color, dash) {
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 2; if (dash) ctx.setLineDash([6, 5]);
  ctx.strokeRect(HX + x * CW + 5, HY + y * CH + 5, CW - 10, CH - 10); ctx.restore();
}

// a big chalk arrow along a row or column (short: just from one room to the next, for a swap)
function chalkArrow(b, color) {
  const a = 0.5 + 0.4 * Math.sin(st.t * 6); ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 4;
  let x1, y1, x2, y2;
  if (b.kind === "row" && b.short != null) { const yy = HY + b.i * CH + CH * 0.3, cx = HX + b.short * CW + CW / 2; x1 = cx; x2 = cx + b.dir * CW * 0.8; y1 = y2 = yy; }
  else if (b.kind === "row") { const yy = HY + b.i * CH + CH * 0.5; x1 = HX + 60; x2 = HX + HW - 60; y1 = y2 = yy; if (b.dir < 0) [x1, x2] = [x2, x1]; }
  else { const xx = HX + b.i * CW + CW * 0.5; y1 = HY + 40; y2 = HY + HH - 40; x1 = x2 = xx; if (b.dir < 0) [y1, y2] = [y2, y1]; }
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  const ang = Math.atan2(y2 - y1, x2 - x1); ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - 18 * Math.cos(ang - 0.5), y2 - 18 * Math.sin(ang - 0.5)); ctx.lineTo(x2 - 18 * Math.cos(ang + 0.5), y2 - 18 * Math.sin(ang + 0.5)); ctx.closePath(); ctx.fill();
  ctx.restore();
}
function drawHouse() {
  art.roof(ctx, { x: HX, y: HY, w: HW, h: HH }, st.t, HX + HW + 8);
  if (st.scene !== "end") { ctx.save(); ctx.fillStyle = `rgba(2,5,16,${0.8 - 0.5 * flash()})`; ctx.beginPath(); ctx.moveTo(HX - 22, HY); ctx.lineTo(HCX, HY - 62); ctx.lineTo(HX + HW + 22, HY); ctx.closePath(); ctx.fill();
    ctx.fillRect(HX + HW * 0.72 - 4, HY - 64, 32, 64); ctx.restore(); }
  ctx.save(); ctx.beginPath(); ctx.rect(HX, HY, HW, HH); ctx.clip();
  const pv = st.preview;
  // the flip: the house turns over (drawn as the new house, squashed from upside down to upright)
  let sy = 1;
  if (st.anim && st.anim.kind === "flip") sy = -Math.cos(Math.PI * ease(st.anim.t));
  else if (pv && pv.band && pv.band.kind === "flip") sy = 1 - 0.08 * (0.5 + 0.5 * Math.sin(st.t * 6));
  if (sy !== 1) { ctx.translate(0, HCY); ctx.scale(1, sy); ctx.translate(0, -HCY); }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const room = st.g[y][x], o = {};
    if (pv && pv.roomId === room.id) { if (pv.door) o.door = pv.door; if (pv.light) o.lightPreview = 0.5 + 0.5 * Math.sin(st.t * 5); }
    for (const [cx, cy] of drawPositions({ x, y })) drawRoom(room, cx, cy, o);
  }
  lampLight();
  // reach outlines
  if (pv && pv.reach) for (const id of pv.reach) { const p = find(pv.g, id); outlineSlot(p.x, p.y, st.h.lockIds.includes(id) && !st.unlocked ? RED : GRN, true); }
  if (st.reachFlash > 0) { ctx.save(); ctx.globalAlpha = Math.min(1, st.reachFlash); for (const id of reach(st.g, st.player.id)) { const p = find(st.g, id); outlineSlot(p.x, p.y, "rgba(240,230,210,0.7)", true); } ctx.restore(); }
  if (st.hover && st.hover.type === "room" && !pv && st.scene === "play") {
    const p = find(st.g, st.hover.id), ok = reach(st.g, st.player.id).has(st.hover.id);
    outlineSlot(p.x, p.y, ok ? "rgba(240,230,210,0.55)" : "rgba(255,90,78,0.6)", false);
  }
  if (st.houseNext && st.houseNext.move) {
    const m = st.houseNext.move, p = find(st.g, m.id);
    if (p) {
      outlineSlot(p.x, p.y, `rgba(255,90,78,${0.55 + 0.4 * Math.sin(st.t * 10)})`, false);
      if (m.kind === "row" || m.kind === "col" || m.kind === "swap") chalkArrow(m.kind === "col" ? { kind: "col", i: p.x, dir: m.dir } : m.kind === "row" ? { kind: "row", i: p.y, dir: m.dir } : { kind: "row", i: p.y, dir: m.dir, short: p.x }, RED);
    }
  }
  if (st.finale && st.finalePath && st.scene === "play") for (const id of st.finalePath) { const p = find(st.g, id); outlineSlot(p.x, p.y, `rgba(207,224,255,${0.35 + 0.25 * Math.sin(st.t * 5)})`, true); }
  if (st.hint && st.hint.id != null) { const p = find(st.g, st.hint.id); outlineSlot(p.x, p.y, `rgba(255,211,106,${0.5 + 0.4 * Math.sin(st.t * 6)})`, false); }
  // shut in: its room gets a red frame and a bar that drains until it claws out
  if (st.scene === "play" && st.shadow.mode !== "sleep" && st.shadow.noPath > 0 && !st.shadow.way) {
    const p = find(st.g, st.shadow.id), k = 1 - st.shadow.noPath / TRAPS[st.floor - 1];
    outlineSlot(p.x, p.y, `rgba(143,227,154,${0.5 + 0.3 * Math.sin(st.t * 8)})`, true);
    ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(HX + p.x * CW + 20, HY + p.y * CH + 22, CW - 40, 6);
    ctx.fillStyle = k > 0.3 ? GRN : RED; ctx.fillRect(HX + p.x * CW + 20, HY + p.y * CH + 22, (CW - 40) * k, 6);
  }
  // figures
  const freed = st.scene === "end" && st.ending === "free";
  for (const [w, draw] of freed ? [] : [[st.shadow, drawShadow], [st.player, drawPlayer]]) {
    const p = walkerPos(w); draw(p[0], p[1]);
    const a = find(st.g, w.id), pos = drawPositions(a);
    if (pos.length > 1 && !w.way) { const d = [pos[1][0] - pos[0][0], pos[1][1] - pos[0][1]]; draw(p[0] + d[0], p[1] + d[1]); }
  }
  for (const d of st.dust) { ctx.fillStyle = `rgba(200,185,160,${0.6 * (1 - d.t / d.life)})`; ctx.fillRect(d.x, d.y, 2, 2); }
  // big chalk arrow for a slide preview
  if (pv && pv.band && (pv.band.kind === "row" || pv.band.kind === "col")) chalkArrow(pv.band, YEL);
  ctx.restore();
  // beams between rooms
  ctx.fillStyle = "#17131a";
  for (let x = 0; x <= W; x++) ctx.fillRect(HX + x * CW - 2, HY, 4, HH);
  for (let y = 0; y <= H; y++) ctx.fillRect(HX, HY + y * CH - 2, HW, 4);
  ctx.font = `20px ${MONO}`; ctx.fillStyle = DIM; ctx.fillText(`floor ${st.floor} of ${FLOORS}`, HX - 30, 32);
  ctx.font = `16px ${MONO}`; ctx.fillStyle = st.pages ? "#e8dcc0" : DIM; ctx.fillText(`torn pages ${st.pages} of 3`, HX + 110, VH - 12);
  ctx.textAlign = "right"; ctx.fillStyle = st.moves > st.h.par ? DIM : GRN; ctx.fillText(`moves ${st.moves}   house's best ${st.h.par}`, HX + HW + 10, 32); ctx.textAlign = "left";
  // front door, in the house's frame (bottom left)
  const fx = HX - 30, fy = HY + HH - 64, hov = st.hover && st.hover.type === "door";
  ctx.fillStyle = "#1c1820"; ctx.fillRect(fx - 4, fy - 4, 34, 68);
  if (st.unlocked) {
    const g = ctx.createLinearGradient(fx, 0, fx + 26, 0); g.addColorStop(0, "rgba(220,230,255,0.9)"); g.addColorStop(1, "rgba(150,170,210,0.4)");
    ctx.fillStyle = g; ctx.fillRect(fx, fy, 26, 60);
    ctx.save(); ctx.shadowColor = "#cfe0ff"; ctx.shadowBlur = 18 + 8 * Math.sin(st.t * 3); ctx.strokeStyle = hov ? "#fff" : "rgba(220,230,255,0.8)"; ctx.lineWidth = 2; ctx.strokeRect(fx, fy, 26, 60); ctx.restore();
  } else {
    ctx.fillStyle = "#3a1e1a"; ctx.fillRect(fx, fy, 26, 60); ctx.fillStyle = "#b08a40"; ctx.fillRect(fx + 19, fy + 32, 3, 3);
    ctx.strokeStyle = hov ? RED : "rgba(255,90,78,0.4)"; ctx.lineWidth = 1.5; ctx.strokeRect(fx, fy, 26, 60);
  }
  ctx.font = `13px ${MONO}`; ctx.fillStyle = st.unlocked ? "#cfe0ff" : "rgba(255,90,78,0.7)"; ctx.textAlign = "center";
  ctx.fillText("front", fx + 13, fy - 18); ctx.fillText("door", fx + 13, fy - 7); ctx.textAlign = "left";
}

// ---------- the code panel ----------
const DIR = { row: { 1: "east", [-1]: "west" }, col: { 1: "down", [-1]: "up" } };
// a line: [before, words, after]; each word {text, dir}
function lineParts(room, c, self) {
  const who = self ? "this" : room.name;
  if (c.kind === "row") return [`${who}.row.shift(`, [{ text: "west", dir: -1 }, { text: "east", dir: 1 }], ")"];
  if (c.kind === "col") return [`${who}.column.shift(`, [{ text: "up", dir: -1 }, { text: "down", dir: 1 }], ")"];
  if (c.kind === "door") return [`${who}.door.${c.side} = `, [{ text: room[c.side === "west" ? "l" : "r"] ? "open" : "shut" }], ";"];
  if (c.kind === "swap") return [`${who}.swap(`, [{ text: "west", dir: -1 }, { text: "east", dir: 1 }], ")"];
  if (c.kind === "flip") return ["house.upsideDown = ", [{ text: st.flipped ? "true" : "false" }], ";"];
  if (c.kind === "lights") return [`${who}.lights = `, [{ text: room.lights ? "on" : "off" }], ";"];
  if (c.kind === "lock") return ["frontDoor.locked = ", [{ text: st.unlocked ? "false" : "true" }], ";"];
}
const flat = (parts) => parts[0] + parts[1].map((w) => w.text).join("|") + parts[2];
function plain(room, c, dir) {
  if (c.kind === "row") return `Slides this whole row of rooms one step ${DIR.row[dir]}. You ride along. Green: rooms you could walk to after.`;
  if (c.kind === "col") return `Slides this whole column of rooms one step ${DIR.col[dir]}. You ride along. Green: rooms you could walk to after.`;
  if (c.kind === "door") return room[c.side === "west" ? "l" : "r"] ? `Shuts this room's ${c.side} door. Nothing gets through a shut door: not you, not it. Shut it in and it has to claw its way out.` : `Opens this room's ${c.side} door.`;
  if (c.kind === "swap") return `Trades this room with the one to its ${DIR.row[dir]} (wrapping round the ends). You go with it. Green: rooms you could walk to after.`;
  if (c.kind === "flip") return "Turns the whole house over. The top floor goes to the bottom, and ladders become holes in the floor. Green: rooms you could walk to after.";
  if (c.kind === "lights") return room.lights ? "Turns the lights off. In the dark it can't see you, but it may still stumble in." : "Turns the lights back on.";
  if (c.kind === "lock") return st.unlocked ? "Already open. Get to the front door, bottom left." : "Unlocks the front door. Then get to it, bottom left. (Two rooms have this lock. Either one works.)";
}
const GLY = "#%&@$!?/\\|<>{}[]=+*";
function glitchText(s, k) { if (k <= 0) return s; let o = ""; for (const ch of s) o += ch !== " " && Math.random() < k * 0.6 ? GLY[(Math.random() * GLY.length) | 0] : ch; return o; }
function fitFont(text, maxW, size) { ctx.font = `${size}px ${MONO}`; while (ctx.measureText(text).width > maxW && size > 11) { size--; ctx.font = `${size}px ${MONO}`; } return size; }
function wrap(text, x, y, maxW, lh) {
  const words = text.split(" "); let line = "";
  for (const w of words) { const t = line ? line + " " + w : w; if (ctx.measureText(t).width > maxW && line) { ctx.fillText(line, x, y); y += lh; line = w; } else line = t; }
  if (line) ctx.fillText(line, x, y); return y + lh;
}
// draws a line; returns a box for each of its words, for clicks
function codeLine(parts, x, y, size, opts) {
  const [pre, words, post] = parts, g = st.glitch, rects = [];
  ctx.font = `${size}px ${MONO}`; ctx.fillStyle = opts.dim ? DIM : INK; ctx.fillText(glitchText(pre, g), x, y);
  let cx = x + ctx.measureText(pre).width;
  words.forEach((w, i) => {
    if (i) { ctx.fillStyle = DIM; ctx.fillText("|", cx, y); cx += ctx.measureText("|").width; }
    const ww = ctx.measureText(w.text).width, hot = opts.hot && opts.hot(w);
    if (opts.click) {
      ctx.fillStyle = hot ? "rgba(255,211,106,0.28)" : "rgba(255,211,106,0.1)"; ctx.fillRect(cx - 2, y - size * 0.78, ww + 4, size * 0.98);
      ctx.strokeStyle = hot ? YEL : "rgba(255,211,106,0.55)"; ctx.lineWidth = 1.5; ctx.strokeRect(cx - 2, y - size * 0.78, ww + 4, size * 0.98);
    }
    ctx.fillStyle = opts.spent ? DIM : opts.click ? YEL : opts.dim ? "rgba(255,211,106,0.5)" : YEL; ctx.fillText(glitchText(w.text, g), cx, y);
    rects.push({ x: cx - 4, y: y - size * 0.85, w: ww + 8, h: size * 1.15, dir: w.dir ?? 1 });
    cx += ww;
  });
  ctx.fillStyle = opts.dim ? DIM : INK; ctx.fillText(post, cx, y);
  return rects;
}
function drawPanel() {
  const x = PX, w = PW - 6;
  ctx.fillStyle = "#0e0c12"; ctx.fillRect(x - 12, 16, w + 24, VH - 32);
  ctx.strokeStyle = "rgba(214,204,182,0.12)"; ctx.lineWidth = 1; ctx.strokeRect(x - 12, 16, w + 24, VH - 32);
  // an editor tab: this is the house's source file
  ctx.fillStyle = "#0e0c12"; ctx.fillRect(x - 12, 0, 92, 17); ctx.strokeRect(x - 12, 0, 92, 17);
  const yours = !!st.finale || (st.scene === "end" && st.floor === FLOORS);
  ctx.font = `15px ${MONO}`; ctx.fillStyle = yours ? RED : YEL; ctx.fillText(yours ? glitchText("● you.js", st.finale && st.finale.t < 1 ? 0.6 : 0) : "● house.js", x - 4, 13);
  // the shadow's thought
  const hn = st.houseNext && st.houseNext.move ? st.houseNext : null;
  if (hn) {
    // the house's next move, typed out in red before it happens
    const k = hn.t, n = Math.floor(clamp(k * 40, 0, hn.code.length)), blink = Math.sin(st.t * 14) > 0;
    ctx.fillStyle = `rgba(255,90,78,${0.12 + 0.08 * Math.sin(st.t * 10)})`; ctx.fillRect(x - 6, 24, w + 12, 54);
    ctx.font = `16px ${MONO}`; ctx.fillStyle = RED; ctx.fillText("// the house writes", x, 42);
    fitFont(hn.code, w - 10, 24); ctx.fillStyle = RED; ctx.fillText(hn.code.slice(0, n) + (blink ? "_" : ""), x, 68);
  } else {
    // between its moves: the house's last move, faded
    ctx.font = `16px ${MONO}`; ctx.fillStyle = DIM; ctx.fillText("// the house", x, 42);
    if (st.lastHouse) { fitFont(st.lastHouse, w, 22); ctx.fillStyle = "rgba(255,90,78,0.35)"; ctx.fillText(st.lastHouse, x, 68); }
  }
  // your room
  const room = byId(st.g, st.player.id);
  ctx.font = `16px ${MONO}`; ctx.fillStyle = DIM; ctx.fillText(`// you are in the ${room.name}`, x, 112);
  st.wordRects = [];
  let y = 144;
  room.lines.forEach((c, li) => {
    const parts = lineParts(room, c, true), size = fitFont(flat(parts), w, 28);
    const spent = c.kind === "lock" && st.unlocked;
    const hot = (wd) => (st.hover && st.hover.type === "word" && st.hover.li === li && st.hover.dir === (wd.dir ?? 1)) ||
      (st.hint && st.hint.id === room.id && st.hint.li === li && st.hint.dir === (wd.dir ?? 1) && Math.sin(st.t * 6) > 0);
    ctx.font = `11px ${MONO}`; ctx.fillStyle = "rgba(214,204,182,0.3)"; ctx.textAlign = "right"; ctx.fillText(String(room.id * 4 + li + 7), x - 2, y); ctx.textAlign = "left";
    const rs = codeLine(parts, x, y, size, { click: !spent, hot, spent }); if (!spent) for (const r of rs) st.wordRects.push({ ...r, li });
    y += room.lines.length > 3 ? 33 : 38;
  });
  y += 16;
  // what the hovered word does, in plain words
  // what the pointed-at word does, in plain words; or, before your first move, what this floor is about
  const hw = st.hover && st.hover.type === "word" ? room.lines[st.hover.li] : null;
  const hv = st.hover && st.hover.type === "room" && st.hover.id !== room.id ? byId(st.g, st.hover.id) : null;
  ctx.font = `italic 15px ${SERIF}`; ctx.fillStyle = INK; let ty = y;
  if (hw) ty = wrap(plain(room, hw, st.hover.dir), x, y, w, 18);
  else if (!hv && st.edits === 0 && st.scene === "play") {
    ctx.fillStyle = YEL; const nw = NEW_WORD[st.floor];
    ty = wrap(nw ? `New on this floor: ${nw.code} ${nw.text} The house's best way out uses it.` : "Every yellow word is a choice. Point at one to see what it does. Click it to change the house.", x, y, w, 18);
  }
  // below: the room you're pointing at, or the hint
  const sep = Math.max(330, ty + 2);
  ctx.fillStyle = "rgba(214,204,182,0.12)"; ctx.fillRect(x, sep, w, 1);
  st.hintRect = null;
  if (hv) {
    ctx.font = `16px ${MONO}`; ctx.fillStyle = DIM; ctx.fillText(`// the ${hv.name}`, x, sep + 22);
    let yy = sep + 46; for (const c of hv.lines) { const parts = lineParts(hv, c, false); codeLine(parts, x, yy, fitFont(flat(parts), w, 22), { dim: true }); yy += 23; }
    ctx.font = `italic 15px ${SERIF}`; ctx.fillStyle = DIM;
    ctx.fillText(reach(st.g, room.id).has(hv.id) ? "Click the room to walk there." : "No way there right now.", x, yy);
  } else if (st.hint && !hw) {
    ctx.font = `italic 16px ${SERIF}`; ctx.fillStyle = YEL; wrap(st.hint.text, x, sep + 24, w, 19);
  } else if (!hw) {
    ctx.font = `16px ${MONO}`; ctx.fillStyle = "rgba(214,204,182,0.25)"; ctx.fillText("// point at a room to read it", x, sep + 22);
    if (st.floorT > 20 && st.scene === "play") {
      ctx.font = `22px ${MONO}`; const hot = st.hover && st.hover.type === "hint";
      ctx.fillStyle = hot ? YEL : "rgba(255,211,106,0.6)"; ctx.fillText("house.hint();", x, sep + 60);
      ctx.font = `italic 15px ${SERIF}`; ctx.fillStyle = DIM; ctx.fillText("stuck? click it", x + 130, sep + 58);
      st.hintRect = { x: x - 4, y: sep + 40, w: 128, h: 26 };
    }
  }
  // goal
  ctx.fillStyle = "rgba(214,204,182,0.12)"; ctx.fillRect(x, 470, w, 1);
  ctx.font = `16px ${MONO}`; ctx.fillStyle = DIM; ctx.fillText("// to leave", x, 494);
  codeLine(["frontDoor.locked = ", [{ text: st.unlocked ? "false" : "true" }], ";"], x, 524, fitFont("frontDoor.locked = false;", w, 26), { dim: !st.unlocked });
  ctx.font = `italic 16px ${SERIF}`; ctx.fillStyle = st.unlocked ? "#cfe0ff" : INK;
  wrap(st.unlocked ? "The front door is open. Click it, bottom left." : "Reach either room with a red lock and change its word.", x, 552, w, 19);
}

function scanlines() { ctx.fillStyle = "rgba(0,0,0,0.16)"; for (let yy = 18; yy < VH - 16; yy += 3) ctx.fillRect(PX - 11, yy, PW + 16, 1); }
function drawOverlay() {
  // closeness: darker edges as it nears
  const a = find(st.g, st.player.id), b = find(st.g, st.shadow.id), d = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  const k = st.shadow.mode === "sleep" ? 0.35 : [0.75, 0.58, 0.45][d] ?? 0.35;
  const g = ctx.createRadialGradient(VW / 2, VH / 2, 220, VW / 2, VH / 2, 620); g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, `rgba(0,0,0,${k})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
  if (st.finale && st.scene === "play") { const r = ctx.createRadialGradient(VW / 2, VH / 2, 260, VW / 2, VH / 2, 640); r.addColorStop(0, "rgba(120,0,0,0)"); r.addColorStop(1, `rgba(150,10,10,${0.25 + 0.15 * Math.sin(st.t * 7)})`); ctx.fillStyle = r; ctx.fillRect(0, 0, VW, VH); }
  for (let i = 0; i < 140; i++) { ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`; ctx.fillRect(Math.random() * VW, Math.random() * VH, 1, 1); }
  for (const f of st.floats) { ctx.font = `20px ${MONO}`; ctx.fillStyle = f.color; ctx.globalAlpha = 1 - f.t / 1.4; ctx.fillText(f.text, f.x - 40, f.y - f.t * 30); ctx.globalAlpha = 1; }
}
// commit 212  "it moved a room tonight..."  (typed: n letters of the message)
function commitText(floor, n) { const [c, msg] = COMMITS[floor]; return `${c}   "${msg.slice(0, Math.max(0, Math.floor(n)))}"`; }
let choiceRects = [];
// The end has two layers: the world (the house, darkened, and anyone walking out) and the words on top.
// After the last word the camera pulls back: the house is a doll's house on a desk, beside the laptop it was written on.
const PULL = { free: 6.5, keep: 5 };
function pullK() { if (st.scene !== "end" || !st.ending) return 0; return ease(clamp((st.endT2 - PULL[st.ending]) / 3.5, 0, 1)); }
function endWorld() {
  const k = st.endT, e = st.ending, k2 = st.endT2, z = pullK();
  const dark = e === "free" ? Math.max(0.3, 0.9 - k2 * 0.25) : e === "keep" ? lerp(0.9, 0.5, z) : Math.min(0.9, k * 1.2);
  ctx.fillStyle = `rgba(0,0,0,${dark})`; ctx.fillRect(0, 0, VW, VH);
  if (e === "free") {
    const gy = HY + HH + 30, walk = Math.min(1, Math.max(0, k2 - 2.2) / 9) * 260, x1 = HX - 16 + walk, x2 = HX - 40 + walk * 0.96;
    drawPlayer(x1, gy);
    if (k2 < 1.6) art.shadow(ctx, x2, gy, st.t, { asleep: false, seep: false, near: 3, look: -1 });
    else { ctx.globalAlpha = clamp((k2 - 1.6) / 0.8, 0, 1); art.player(ctx, x2, gy, st.t, walk > 0); ctx.globalAlpha = 1; }
  }
  if (e === "keep" && k2 > 2.6) { ctx.fillStyle = "#f3e9d2"; const fx = HX - 17, fy = HY + HH - 44; ctx.fillRect(fx - 5, fy, 3, 3); ctx.fillRect(fx + 3, fy, 3, 3); }
}
function drawEnd() {
  const k = st.endT, e = st.ending, k2 = st.endT2; choiceRects = [];
  if (e) {
    // the words sit at the top, then slide down onto the desk as the camera pulls back
    const z = pullK(), [l1, l2] = e === "free" ? ENDING.free : ENDING.keep;
    for (const [alpha, ys] of [[1 - z, [52, 86, 116, 140]], [z, [508, 538, 566, 590]]]) {
      if (alpha <= 0.01) continue; ctx.globalAlpha = alpha;
      if (ys[0] < 200) { ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(0, 0, VW, 150); }
      if (k2 > 0.4) centerText(l1, ys[0], e === "free" ? `28px ${MONO}` : `italic 24px ${SERIF}`, e === "free" ? GRN : INK);
      if (k2 > 2) centerText(l2, ys[1], `italic 21px ${SERIF}`, e === "free" ? INK : DIM);
      endStats(k2 - PULL[e] - 1.5, ys[2], ys[3]);
    }
    ctx.globalAlpha = 1; return;
  }
  if (st.page.got && st.floor === FLOORS) { ctx.globalAlpha = clamp(k, 0, 1) * 0.85; centerText(`a torn page (${st.pages} of 3)`, 96, `18px ${MONO}`, "#e8dcc0"); centerWrap(PAGES[FLOORS], 128, 640, 26, `italic 21px ${SERIF}`, "#e8dcc0"); ctx.globalAlpha = 1; }
  const line = ENDING.line, n = Math.floor(clamp((k - 1) * 18, 0, line.length));
  if (k > 1) centerText(line.slice(0, n), VH / 2 - 60, `26px ${MONO}`, n < line.length ? INK : RED);
  if (k > 4.4) {
    const [pre, words, post] = ENDING.choice, open = st.pages >= 3;
    ctx.font = `34px ${MONO}`; const shown = open ? words : [words[0]];
    const full = pre + shown.join("|") + post; let cx = VW / 2 - ctx.measureText(full).width / 2; const y = VH / 2 + 10;
    ctx.fillStyle = INK; ctx.fillText(pre, cx, y); cx += ctx.measureText(pre).width;
    shown.forEach((w, i) => {
      if (i) { ctx.fillStyle = DIM; ctx.fillText("|", cx, y); cx += ctx.measureText("|").width; }
      const ww = ctx.measureText(w).width, hot = st.hover && st.hover.type === "choice" && st.hover.word === w;
      if (open) { ctx.fillStyle = hot ? "rgba(255,211,106,0.28)" : "rgba(255,211,106,0.1)"; ctx.fillRect(cx - 3, y - 27, ww + 6, 34); ctx.strokeStyle = hot ? YEL : "rgba(255,211,106,0.55)"; ctx.lineWidth = 1.5; ctx.strokeRect(cx - 3, y - 27, ww + 6, 34); }
      ctx.fillStyle = open ? YEL : DIM; ctx.fillText(w, cx, y); choiceRects.push({ x: cx - 5, y: y - 30, w: ww + 10, h: 40, word: w }); cx += ww;
    });
    ctx.fillStyle = INK; ctx.fillText(post, cx, y);
    if (open) {
      centerText("One word left, and all three pages say it's yours to change.", y + 44, `italic 20px ${SERIF}`, INK);
      const left = clamp((16.5 - k) / 12, 0, 1); ctx.fillStyle = "rgba(214,204,182,0.25)"; ctx.fillRect(VW / 2 - 120, y + 64, 240 * left, 3);
    } else { centerText(`${ENDING.locked} You found ${st.pages}.`, y + 44, `italic 20px ${SERIF}`, DIM); choiceRects = []; }
  }
}
// the room around the doll's house: a wall, a desk lamp, the desk, and who (if anyone) is sitting there
const DESK = 470, BASE = HY + HH + 44;
const toDesk = (z) => { const sc = 1 - 0.5 * z, dy = lerp(BASE, DESK, z); return { sc, X: (x) => VW / 2 + (x - VW / 2) * sc, Y: (y) => dy + (y - BASE) * sc }; };
function drawRealRoom(z) {
  const T = toDesk(z), dy = T.Y(BASE);
  const wall = ctx.createLinearGradient(0, 0, 0, dy); wall.addColorStop(0, "#0d0a0c"); wall.addColorStop(1, "#1d1517"); ctx.fillStyle = wall; ctx.fillRect(0, 0, VW, VH);
  const lamp = ctx.createRadialGradient(120, 90, 10, 120, 90, 520); lamp.addColorStop(0, "rgba(255,200,130,0.28)"); lamp.addColorStop(1, "rgba(255,200,130,0)"); ctx.fillStyle = lamp; ctx.fillRect(0, 0, VW, VH);
  // who sits at the desk: you, still (the house kept you), or nobody
  const hx = T.X(HCX), hy = T.Y(HY - 130);
  if (st.ending === "keep") {
    ctx.fillStyle = "#050405"; ctx.beginPath(); ctx.ellipse(hx, hy, 78 * T.sc * 1.6, 92 * T.sc * 1.6, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(hx, hy + 210 * T.sc, 260 * T.sc, 130 * T.sc, 0, Math.PI, 0); ctx.fill();
    ctx.save(); ctx.shadowColor = "#fff0dc"; ctx.shadowBlur = 8; ctx.fillStyle = "rgba(245,238,224,0.9)";
    ctx.fillRect(hx - 30 * T.sc - 4, hy - 6, 8, 4); ctx.fillRect(hx + 30 * T.sc - 4, hy - 6, 8, 4); ctx.restore();
  } else {
    ctx.fillStyle = "#140e0f"; ctx.fillRect(hx - 120 * T.sc, hy - 40 * T.sc, 240 * T.sc, 260 * T.sc); // an empty chair's back
    ctx.strokeStyle = "#241a1b"; ctx.lineWidth = 3; ctx.strokeRect(hx - 120 * T.sc, hy - 40 * T.sc, 240 * T.sc, 260 * T.sc);
  }
  const desk = ctx.createLinearGradient(0, dy, 0, VH); desk.addColorStop(0, "#4a3020"); desk.addColorStop(1, "#22150d");
  ctx.fillStyle = desk; ctx.fillRect(0, dy, VW, VH - dy); ctx.fillStyle = "rgba(255,210,150,0.18)"; ctx.fillRect(0, dy, VW, 2);
}
// the code panel, now a laptop screen
function drawLaptop(z) {
  const T = toDesk(z), x1 = T.X(PX - 16), x2 = T.X(PX + PW + 16), y1 = T.Y(-4), y2 = T.Y(VH - 10);
  ctx.globalAlpha = z; ctx.strokeStyle = "#2b2a30"; ctx.lineWidth = 7 * T.sc + 2; ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
  ctx.fillStyle = "#3a3940"; ctx.beginPath(); ctx.moveTo(x1 - 6, y2 + 3); ctx.lineTo(x2 + 6, y2 + 3); ctx.lineTo(x2 + 26, y2 + 16); ctx.lineTo(x1 - 26, y2 + 16); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;
}
function clipFrame() {
  ctx.beginPath();
  ctx.moveTo(HX - 22, HY + 1); ctx.lineTo(HCX, HY - 62); ctx.lineTo(HX + HW + 22, HY + 1); ctx.closePath();
  ctx.rect(HX + HW * 0.72 - 4, HY - 66, 32, 66); ctx.rect(HX - 38, HY - 4, HW + 50, BASE - HY + 4); ctx.rect(PX - 16, -4, PW + 32, VH - 6);
  ctx.clip();
}
function endStats(k, y1, y2) {
  if (k > 0) centerText(`3 floors in ${st.total.moves} moves (the house's best: ${st.total.par}), ${st.grabs} grab${st.grabs === 1 ? "" : "s"}, ${st.total.house || 0} move${st.total.house === 1 ? "" : "s"} by the house, ${st.pages} of 3 pages.`, y1, `18px ${MONO}`, INK);
  if (k > 1) centerText(st.ending === "free" ? "Click to close the house." : "Click to close the house. It'll wait.", y2, `18px ${MONO}`, DIM);
}
function centerWrap(text, y, maxW, lh, font, color) {
  ctx.font = font; const words = text.split(" "), lines = []; let line = "";
  for (const w of words) { const t = line ? line + " " + w : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
  if (line) lines.push(line); lines.forEach((l, i) => centerText(l, y + i * lh, font, color));
}
function centerText(text, y, font, color) { ctx.font = font; ctx.fillStyle = color; ctx.textAlign = "center"; ctx.fillText(text, VW / 2, y); ctx.textAlign = "left"; }
function drawScenes() {
  if (st.scene === "title") {
    ctx.fillStyle = "rgba(5,4,7,0.72)"; ctx.fillRect(0, 0, VW, VH);
    const back = lastEnding();
    centerText(commitText(1, 99), 120, `20px ${MONO}`, DIM);
    centerText("THE SHIFTING HOUSE", 210, `64px ${MONO}`, INK);
    if (awayLine) centerText(awayLine, 248, `italic 20px ${SERIF}`, RED); else centerText(back === "free" ? "Nobody home. Or so it says." : back === "keep" ? "Welcome back. It kept your room just as you left it." : "You wrote this house. It never let you leave.", 248, `italic 20px ${SERIF}`, back ? RED : DIM);
    centerText("Mouse only, three floors. Click a room to walk there.", 318, `22px ${SERIF}`, INK);
    centerText("The house's code is on the right. Every yellow word changes the house.", 348, `22px ${SERIF}`, INK);
    centerText("Then the house changes something back. Watch for its move in red.", 378, `22px ${SERIF}`, INK);
    centerText("Click to begin", 450, `30px ${MONO}`, Math.sin(st.t * 3) > -0.3 ? YEL : DIM);
  } else if (st.scene === "caught") {
    const k = st.caughtT;
    ctx.fillStyle = k < 0.15 ? "rgba(160,20,20,0.6)" : `rgba(0,0,0,${Math.min(0.94, k * 1.5)})`; ctx.fillRect(0, 0, VW, VH);
    if (k > 0.3) centerText(glitchText("found(you);", Math.max(0, 0.8 - k)), VH / 2, `48px ${MONO}`, RED);
    if (k > 1.1) centerText("It drags you back. It's slower now.", VH / 2 + 44, `italic 20px ${SERIF}`, DIM);
  } else if (st.scene === "floor") {
    const k = st.endT; ctx.fillStyle = `rgba(0,0,0,${Math.min(0.92, k * 1.5)})`; ctx.fillRect(0, 0, VW, VH);
    if (k > 0.4) {
      centerText(`Floor ${st.floor} of ${FLOORS}: out.`, 120, `44px ${MONO}`, INK);
      const best = st.moves <= st.h.par;
      centerText(`You used ${st.moves} move${st.moves === 1 ? "" : "s"}. The house's best: ${st.h.par}.${st.moves < st.h.par ? " " + JOKES.beatPar : best ? " You matched it." : ""}`, 164, `22px ${MONO}`, best ? GRN : INK);
      // the page you found on this floor, read now, between floors, not while it's hunting you
      if (st.page.got) { centerText(`a torn page (${st.pages} of 3)`, 230, `18px ${MONO}`, "#e8dcc0"); centerWrap(PAGES[st.floor], 262, 620, 26, `italic 21px ${SERIF}`, "#e8dcc0"); }
      else centerText("You didn't find this floor's torn page.", 246, `italic 19px ${SERIF}`, DIM);
      centerText(commitText(st.floor + 1, (k - 0.4) * 30), 352, `18px ${MONO}`, DIM);
      const nw = NEW_WORD[st.floor + 1];
      centerText(st.floor === 1 ? "Next floor: the shadow wakes up." : "Next floor: the last one.", 396, `22px ${SERIF}`, INK);
      if (nw) centerText(`New word: ${nw.code}`, 428, `24px ${MONO}`, YEL);
      if (k > 1.2) centerText("Click to go down", 478, `28px ${MONO}`, Math.sin(st.t * 3) > -0.3 ? YEL : DIM);
    }
  } else if (st.scene === "end") drawEnd();
}

function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (st.scene === "credits") { drawCredits(st.credT); drawSticky(); return; }
  if (st.scene === "desk") { deskClock(); desk.drawDesk(ctx, TG, st.desk, st.found.map((f) => PAGES[f]), JOKES); drawSticky(); return; }
  const z = pullK();
  if (z > 0) {
    drawRealRoom(z); ctx.save(); const T = toDesk(z);
    ctx.translate(T.X(0), T.Y(0)); ctx.scale(T.sc, T.sc); clipFrame();
  }
  drawWorld();
  slideRows(st.scene === "title" ? shuffleOffsets() : shiftK > 0 ? st.g.map(() => CW * ease(shiftK)) : null);
  if (st.scene === "end") endWorld();
  if (z > 0) { ctx.restore(); drawLaptop(z); }
  drawVoice(); drawScenes(); if (st.scene !== "end") drawMute();
  if (st.finale && st.scene === "play") {
    if (st.tear) drawTear(); else tear.drawCracks(ctx, TG, 1, (x, y) => [x, y], 0.3); // the glass stays cracked
  }
  drawSticky();
}
function drawSticky() { if (sticky) { ctx.setTransform(DPR, 0, 0, DPR, 0, 0); tear.drawSticky(ctx, TG, sticky.t); } }
function deskClock() { const now = new Date(); TG.clock = [now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }), now.toLocaleDateString()]; }
function openDesk() { st.scene = "desk"; st.desk = { t: 0, open: null, bin: null }; setTitle("Desktop"); }
// Ctrl+Z (Cmd+Z on a Mac): there's no undo in here, so it undoes the moon, then gravity, then your undo
let undone = 0;
function undo() { undone = (undone + 1) % 3; sfx.lights(undone === 0); if (st) sayLine(JOKES.undo[(undone + 2) % 3]); }
// Shift five times: the house's own Sticky Keys box (src/tear.js). It pauses nothing and turns nothing on.
let sticky = null, shifts = [];
function stickyKey(e) {
  if (e.key !== "Shift" || e.repeat) return;
  const now = performance.now(); shifts = shifts.filter((s) => now - s < 3000); shifts.push(now);
  if (shifts.length >= 5) { shifts = []; sticky = { t: 0 }; sfx.lights(true); }
}
// the screen break works on a copy of the frame just drawn
const tearCv = document.createElement("canvas"), TG = { VW, VH, DPR, HX, HY, CW, CH, HW, HH, W, H, MONO, clock: ["", ""] };
function drawTear() {
  if (tearCv.width !== cv.width) { tearCv.width = cv.width; tearCv.height = cv.height; }
  const b = tearCv.getContext("2d"); b.setTransform(1, 0, 0, 1, 0, 0); b.clearRect(0, 0, cv.width, cv.height); b.drawImage(cv, 0, 0);
  deskClock();
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, VW, VH); tear.draw(ctx, tearCv, st.tear.t, TG);
}
function drawWorld() {
  art.night(ctx, VW, VH, { x: HX, y: HY, w: HW, h: HH }, st.t, flash(), st.bolt.x, undone >= 1);
  if (st.faceBolt && flash() > 0.1) drawWatcher(flash());
  const dry = st.ending === "free" ? clamp((st.endT2 - 1) / 3, 0, 1) : 0;
  if (dry < 1) { ctx.globalAlpha = 1 - dry; art.rain(ctx, VW, VH, st.t, undone >= 2); ctx.globalAlpha = 1; }
  ctx.save();
  if (st.shake > 0) ctx.translate((Math.random() - 0.5) * 12 * st.shake, (Math.random() - 0.5) * 12 * st.shake);
  drawHouse(); ctx.restore();
  const f = flash(); if (f > 0) { ctx.fillStyle = `rgba(210,220,255,${f * 0.22})`; ctx.fillRect(0, 0, PX - 14, VH); }
  drawPanel(); scanlines(); drawOverlay();
  if (st.scene === "play") { if (st.crayon) drawCrayonDoor(st.crayon.t); if (st.note) drawNote(st.note.t); if (st.floorT < 4) drawYou(st.floorT); if (st.sign) drawSign(st.sign.t); if (st.sticker) drawSticker(st.sticker.t); }
}
// the first few seconds of each floor: a marker over you, so you can find yourself
function drawYou(t) {
  const [x, y] = walkerPos(st.player), a = Math.min(1, t * 3, (4 - t) / 0.6), bob = Math.sin(t * 6) * 3;
  ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = YEL; ctx.strokeStyle = "rgba(0,0,0,0.7)"; ctx.lineWidth = 3;
  ctx.font = `22px ${MONO}`; ctx.textAlign = "center"; ctx.strokeText("you", x, y - 62 + bob); ctx.fillText("you", x, y - 62 + bob);
  ctx.beginPath(); ctx.moveTo(x - 7, y - 54 + bob); ctx.lineTo(x + 7, y - 54 + bob); ctx.lineTo(x, y - 44 + bob); ctx.closePath(); ctx.fill();
  ctx.textAlign = "left"; ctx.restore();
}
// floor 2: the shadow, newly awake, holds up a little sign
function drawSign(t) {
  const [x, y] = walkerPos(st.shadow), a = Math.min(1, t * 3, (4 - t) / 0.5), up = Math.min(1, t * 2.5) * 16;
  ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = "#040305"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 10, y - 30); ctx.lineTo(x + 14, y - 52 - up); ctx.stroke();
  ctx.translate(x + 14, y - 70 - up); ctx.rotate(0.06); ctx.fillStyle = "#efe6cf"; ctx.fillRect(-26, -16, 52, 26);
  ctx.fillStyle = "#2b2119"; ctx.font = `italic 18px ${SERIF}`; ctx.textAlign = "center"; ctx.fillText(JOKES.sign, 0, 3); ctx.textAlign = "left"; ctx.restore();
}
// floor 3: the first time you turn it over, a shipping sticker, now upside down
function drawSticker(t) {
  const a = Math.min(1, t * 3, (5 - t) / 0.6);
  ctx.save(); ctx.globalAlpha = a; ctx.translate(HX + 130, HY - 14); ctx.rotate(Math.PI - 0.12); // on the roof
  ctx.fillStyle = "#e8c35a"; ctx.fillRect(-82, -20, 164, 40); ctx.strokeStyle = "#7a4a10"; ctx.lineWidth = 2; ctx.strokeRect(-78, -16, 156, 32);
  ctx.fillStyle = "#5a3208"; ctx.font = `22px ${MONO}`; ctx.textAlign = "center"; ctx.fillText(JOKES.sticker, 0, 7); ctx.textAlign = "left"; ctx.restore();
}
// Hint 7: a terrible crayon drawing of a door, next to the real one
function drawCrayonDoor(t) {
  const a = Math.min(1, t * 2, (9 - t) / 0.6), x = HX + 26, y = HY + HH - 128, j = (i) => Math.sin(i * 12.3 + Math.floor(st.t * 6)) * 1.6;
  ctx.save(); ctx.globalAlpha = a; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#ff9a3c"; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(x + j(1), y + 118); ctx.lineTo(x + 4 + j(2), y + 6); ctx.lineTo(x + 66 + j(3), y + 14); ctx.lineTo(x + 60 + j(4), y + 120); ctx.stroke();
  ctx.fillStyle = "#ffd36a"; ctx.beginPath(); ctx.arc(x + 50 + j(5), y + 68, 5, 0, 7); ctx.fill();
  ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + 112, y + 40); ctx.quadraticCurveTo(x + 96, y + 52, x + 74 + j(6), y + 62); ctx.moveTo(x + 82, y + 52); ctx.lineTo(x + 74, y + 62); ctx.lineTo(x + 86, y + 66); ctx.stroke();
  ctx.font = `22px ${MONO}`; ctx.fillStyle = "#ff9a3c"; ctx.fillText("door", x + 112, y + 38); ctx.font = `15px ${MONO}`; ctx.fillText("(probably)", x + 104, y + 54);
  ctx.restore();
}
// The shadow, shut in, slides a note under the wall
function drawNote(t) {
  const sp = walkerPos(st.shadow), a = Math.min(1, t * 3, (6 - t) / 0.5), slide = Math.min(1, t * 2.5);
  // beside it, clear of the "you shut it in" words (which rise on its right) and of the line along the bottom
  const [l1, ...boxes] = JOKES.note, left = sp[0] > HX + 140, x = left ? sp[0] - 136 - slide * 12 : sp[0] + 24 + slide * 12;
  const y = Math.min(left ? sp[1] - 96 : sp[1] - 24, VH - 172);
  ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y); ctx.rotate(-0.08);
  ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 10; ctx.fillStyle = "#efe6cf"; ctx.fillRect(0, 0, 118, 92); ctx.shadowBlur = 0;
  ctx.fillStyle = "#2b2119"; ctx.font = `italic 17px ${SERIF}`; ctx.fillText(l1, 9, 22);
  ctx.font = `15px ${SERIF}`; ctx.strokeStyle = "#2b2119"; ctx.lineWidth = 1.2;
  boxes.forEach((b, i) => { ctx.strokeRect(12, 32 + i * 18, 11, 11); ctx.fillText(b, 30, 42 + i * 18); });
  ctx.restore();
}
// ---------- lamp light: the house is dark, you are the light ----------
// Your lamp is the only warm thing. It changes colour as the house takes you: amber, then cold, then red.
// The dark hides the rooms but not the puzzle: room frames, locks and the torn page show through, and
// lightning lights the whole house for a moment. When it is close, your lamp gutters.
const HOT = [null, [255, 170, 80], [150, 205, 255], [255, 64, 52]];
let lampCv = null; const glows = [];
function lampFear() { const n = nearness(); return n === Infinity ? 0 : n <= 0 ? 1 : n === 1 ? 0.75 : n === 2 ? 0.4 : 0.12; }
function lampFlicker(fear) {
  const t = st.t, base = 1 + Math.sin(t * 11) * 0.02 + Math.sin(t * 3.7) * 0.03;
  // it is near: the flame stutters and nearly goes out
  const gutter = fear > 0.3 && Math.sin(t * 23) * Math.sin(t * 7.3) > 0.55 ? 0.55 : 1;
  return base * gutter * (1 - 0.18 * fear);
}
function lampLight() {
  if (st.scene === "end") { glows.length = 0; return; }
  const hot = HOT[st.floor] || HOT[1], L = PX - 14, fear = lampFear(), fl = lampFlicker(fear), bolt = st.tear ? 0.95 : flash(); // torn out of its window, the house is in the light
  const pp = walkerPos(st.player), px = pp[0], py = pp[1] - 32;
  // 1. drain the colour out of the house
  ctx.save(); ctx.globalCompositeOperation = "saturation"; ctx.fillStyle = "#808080"; ctx.globalAlpha = 0.7; ctx.fillRect(0, 0, L, VH); ctx.restore();
  // 2. the dark, with a hole where your lamp is (lightning thins it for a moment)
  if (!lampCv) { lampCv = document.createElement("canvas"); lampCv.width = VW * DPR; lampCv.height = VH * DPR; }
  const c = lampCv.getContext("2d"); c.setTransform(DPR, 0, 0, DPR, 0, 0); c.clearRect(0, 0, VW, VH);
  c.globalCompositeOperation = "source-over"; c.fillStyle = `rgba(2,5,16,${0.965 - 0.55 * bolt})`; c.fillRect(0, 0, L, VH);
  c.globalCompositeOperation = "destination-out";
  const R = 128 * fl;
  let g = c.createRadialGradient(px, py, 6, px, py, R); g.addColorStop(0, "rgba(0,0,0,1)"); g.addColorStop(0.45, "rgba(0,0,0,0.9)"); g.addColorStop(1, "rgba(0,0,0,0)");
  c.fillStyle = g; c.fillRect(0, 0, L, VH);
  // the rooms you can walk to right now stay dimly visible, so you can see where to go
  const near = st.scene === "play" ? [...reach(st.g, st.player.id)] : [];
  c.fillStyle = "rgba(0,0,0,0.5)";
  for (const id of near) { if (id === st.player.id) continue; const p = find(st.g, id); for (const [x, y] of drawPositions(p)) c.fillRect(x + 2, y + 2, CW - 4, CH - 4); }
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(lampCv, 0, 0); ctx.restore();
  // 3. the flame's colour on everything it reaches
  ctx.save(); ctx.globalCompositeOperation = "lighter";
  g = ctx.createRadialGradient(px, py, 0, px, py, 105 * fl); g.addColorStop(0, `rgba(${hot},${0.55 * fl})`); g.addColorStop(1, `rgba(${hot},0)`);
  ctx.fillStyle = g; ctx.fillRect(px - 120, py - 120, 240, 240); ctx.restore();
  // 4. the room frames, barely there, so the puzzle still reads
  ctx.save(); ctx.strokeStyle = `rgba(110,150,240,${0.13 + 0.25 * bolt})`; ctx.lineWidth = 1.5;
  for (let y = 0; y < st.g.length; y++) for (let x = 0; x < st.g[y].length; x++) ctx.strokeRect(HX + x * CW + 3, HY + y * CH + 3, CW - 6, CH - 6);
  ctx.restore();
  ctx.save(); ctx.strokeStyle = `rgba(${hot},0.4)`; ctx.lineWidth = 1.5;
  for (const id of near) { if (id === st.player.id) continue; const p = find(st.g, id); for (const [x, y] of drawPositions(p)) ctx.strokeRect(x + 3, y + 3, CW - 6, CH - 6); }
  ctx.restore();
  for (const g2 of glows) g2(); glows.length = 0;
  // 5. it is near: the dark closes in at the edges
  if (fear > 0.3) { ctx.save(); const v = ctx.createRadialGradient(px, py, 60, px, py, 520); v.addColorStop(0, "rgba(40,0,0,0)"); v.addColorStop(1, `rgba(40,0,0,${0.5 * fear})`); ctx.fillStyle = v; ctx.fillRect(0, 0, L, VH); ctx.restore(); }
}
// something enormous stands behind the house: only the lightning shows it
function drawWatcher(f) {
  ctx.save(); ctx.globalAlpha = Math.min(1, f * 1.3); ctx.fillStyle = "#07060a";
  ctx.beginPath(); ctx.ellipse(HCX, HY - 40, 150, 120, 0, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.ellipse(HCX, HY + 120, 330, 150, 0, Math.PI, 0); ctx.fill();
  ctx.shadowColor = "#fff4e0"; ctx.shadowBlur = 10; ctx.fillStyle = "rgba(245,240,228,0.95)"; ctx.fillRect(HCX - 56, HY - 72, 10, 5); ctx.fillRect(HCX + 46, HY - 72, 10, 5); ctx.restore();
}
// what the house says, typed out under it
function drawVoice() {
  const v = st.voice; if (!v || (st.scene !== "play" && st.scene !== "caught")) return;
  const n = Math.floor(clamp(v.t * 32, 0, v.text.length)), a = Math.min(1, 6 - v.t);
  ctx.font = `italic 20px ${SERIF}`; ctx.textAlign = "center"; ctx.fillStyle = `rgba(0,0,0,${0.5 * a})`;
  const tw = ctx.measureText(v.text).width; ctx.fillRect(HCX - tw / 2 - 12, VH - 62, tw + 24, 30);
  ctx.fillStyle = `rgba(255,140,120,${a})`; ctx.fillText(v.text.slice(0, n), HCX, VH - 41); ctx.textAlign = "left";
}
// lightning: a double flash, then thunder a moment later
function flash() { const k = st.bolt.t; return k < 0.07 ? 1 : k < 0.15 ? 0.15 : k < 0.22 ? 0.85 : Math.max(0, 0.5 - k); }
function weather(dt) {
  st.bolt.t += dt; st.bolt.next -= dt;
  if (st.bolt.next <= 0) { st.bolt = { t: 0, next: 16 + Math.random() * 22, x: 60 + Math.random() * 520 }; sfx.thunder(0.5 + Math.random() * 0.8); }
}
let muteRect = null;
function drawMute() {
  ctx.font = `16px ${MONO}`; ctx.fillStyle = st.hover && st.hover.type === "mute" ? INK : DIM;
  const text = sfx.isMuted() ? "[M] sound off" : "[M] sound on"; ctx.fillText(text, HX - 30, VH - 12);
  muteRect = { x: HX - 34, y: VH - 28, w: ctx.measureText(text).width + 8, h: 22 };
}

// ---------- preview (what a word would do) ----------
function refreshPreview() {
  const hv = st.hover, key = hv && hv.type === "word" ? `${st.player.id}:${hv.li}:${hv.dir}:${st.edits}` : "";
  if (key === st.previewKey) return; st.previewKey = key; st.preview = null;
  if (!key || st.anim) return;
  const room = byId(st.g, st.player.id), c = room.lines[hv.li]; if (!c) return;
  const pv = { roomId: room.id };
  if (c.kind === "row" || c.kind === "col") { const p = find(st.g, room.id); pv.band = { kind: c.kind, i: c.kind === "row" ? p.y : p.x, dir: hv.dir }; }
  if (c.kind === "swap") { const p = find(st.g, room.id); pv.band = { kind: "swap", y: p.y, a: p.x, b: (p.x + hv.dir + W) % W }; }
  if (c.kind === "flip") pv.band = { kind: "flip" };
  if (c.kind === "door") pv.door = { side: c.side === "west" ? "l" : "r", open: !room[c.side === "west" ? "l" : "r"] };
  if (c.kind === "lights") pv.light = true;
  if (c.kind !== "lights" && c.kind !== "lock") { const g2 = clone(st.g); applyEdit(g2, room.id, hv.li, null, hv.dir); pv.g = g2; pv.reach = reach(g2, room.id); }
  st.preview = pv;
}

// ---------- input ----------
function toView(e) { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * VW / r.width, (e.clientY - r.top) * VH / r.height]; }
function hitTest(x, y) {
  for (const r of st.wordRects) if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return { type: "word", li: r.li, dir: r.dir };
  const m = muteRect; if (m && x >= m.x && x <= m.x + m.w && y >= m.y && y <= m.y + m.h) return { type: "mute" };
  const hr = st.hintRect; if (hr && x >= hr.x && x <= hr.x + hr.w && y >= hr.y && y <= hr.y + hr.h) return { type: "hint" };
  if (x >= HX - 34 && x <= HX - 0 && y >= HY + HH - 68 && y <= HY + HH) return { type: "door" };
  if (x >= HX && x < HX + HW && y >= HY && y < HY + HH) return { type: "room", id: st.g[Math.floor((y - HY) / CH)][Math.floor((x - HX) / CW)].id };
  return null;
}
cv.addEventListener("pointermove", (e) => {
  const [x, y] = toView(e);
  st.hover = st.scene === "play" ? hitTest(x, y) : st.scene === "end" ? choiceAt(x, y) : null; refreshPreview();
});
function choiceAt(x, y) { for (const r of choiceRects) if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return { type: "choice", word: r.word }; return null; }
cv.addEventListener("pointerdown", (e) => {
  sfx.init();
  if (sticky) { sticky = null; return; } // any click closes the Sticky Keys box
  const [x, y] = toView(e);
  if (st.scene === "title") { begin(); return; }
  if (st.scene === "end") {
    if (!st.ending) { const c = choiceAt(...toView(e)); if (c) choose(c.word === "nobody" ? "free" : "keep"); return; }
    if (st.endT2 > PULL[st.ending] + 2.5) { st.scene = "credits"; st.credT = 0; sfx.doorShut(); }
    return;
  }
  if (st.scene === "credits") { openDesk(); return; }
  if (st.scene === "desk") {
    const d = st.desk, f = desk.deskHit(x, y);
    if (f === "house.js") { sfx.reset(); newGame((Math.random() * 1e9) | 0); }
    else if (f === "notes.txt") { d.open = d.open ? null : "notes.txt"; sfx.page(); }
    else if (f === "Bin") { d.bin = 0; d.open = null; sfx.slide(); }
    else d.open = null;
    return;
  }
  if (st.scene === "floor") { if (st.endT > 1.2) nextFloor(); return; }
  if (st.scene !== "play") return;
  if (st.tear) { st.tear.t = Math.max(st.tear.t, tear.TEAR.hold); return; } // a click skips to the slam
  if (shiftK > 0) return; // while you hold the house over, clicks would land in the wrong room
  const prev = st.hover, h = hitTest(x, y);
  // a finger can't point, so on touch the first tap on a word previews it and a second tap changes it
  if (e.pointerType === "touch" && h && h.type === "word" && !(prev && prev.type === "word" && prev.li === h.li && prev.dir === h.dir)) { st.hover = h; refreshPreview(); return; }
  st.hover = h;
  if (!h) return;
  if (h.type === "word") doEdit(h.li, h.dir);
  else if (h.type === "hint") doHint();
  else if (h.type === "mute") sfx.toggleMute();
  else if (h.type === "door") { if (st.unlocked) walkTo(st.g[H - 1][0].id, true, x, y); else float(x + 50, y, "frontDoor.locked = true;", RED); }
  else walkTo(h.id, false, x, y);
  refreshPreview();
});
addEventListener("keydown", (e) => {
  if (e.key === "Enter" && st.scene === "title") { sfx.init(); begin(); }
  if (e.key === "m" || e.key === "M") sfx.toggleMute();
  stickyKey(e);
  if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) { e.preventDefault(); undo(); }
});

function dustBurst(res) {
  for (let i = 0; i < 70; i++) {
    let x, y; if (res.kind === "row") { x = HX + Math.random() * HW; y = HY + res.i * CH + (Math.random() < 0.5 ? 0 : CH); } else { x = HX + res.i * CW + (Math.random() < 0.5 ? 0 : CW); y = HY + Math.random() * HH; }
    st.dust.push({ x, y, vx: (Math.random() - 0.5) * 40, vy: -Math.random() * 30, t: 0, life: 0.8 + Math.random() * 0.8 });
  }
}

// The title after you've been away shows the house you left; you play a fresh one
function begin() { awayLine = null; if (st.decor) newGame((Math.random() * 1e9) | 0); st.scene = "play"; }

// ---------- the house remembers you ----------
// Only a time and the seed of the house you were in are kept (in this browser): nothing about you.
const AWAY_KEY = "shift-left";
function remember() { try { localStorage.setItem(AWAY_KEY, JSON.stringify({ t: Date.now(), seed: runSeed })); } catch { /* fine */ } }
function lastVisit() { try { const v = JSON.parse(localStorage.getItem(AWAY_KEY)); return v && v.t ? v : null; } catch { return null; } }
function goneFor(ms) {
  const s = Math.max(1, Math.round(ms / 1000)), m = Math.floor(s / 60), h = Math.floor(m / 60), d = Math.floor(h / 24);
  const n = (k, w) => `${k} ${w}${k === 1 ? "" : "s"}`;
  if (d) return `${n(d, "day")}, ${n(h % 24, "hour")}`;
  if (h) return `${n(h, "hour")}, ${n(m % 60, "minute")}`;
  if (m) return `${n(m, "minute")}, ${n(s % 60, "second")}`;
  return n(s, "second");
}
addEventListener("pagehide", remember);
document.addEventListener("visibilitychange", () => { if (document.hidden) remember(); });
// on the title: the rows of the house you left slide, one each way, while you weren't looking
function shuffleOffsets() {
  const sh = st.shuffle; if (!sh || sh.done) return null;
  return st.g.map((_, i) => (i % 2 ? -1 : 1) * CW * ease(clamp((sh.t - 1.4 - i * 0.3) / 0.8, 0, 1)));
}
function shuffleUpdate(dt) {
  const sh = st.shuffle; if (!sh || sh.done) return;
  const t0 = sh.t; sh.t += dt; if (t0 < 1.4 && sh.t >= 1.4) sfx.slide();
  if (sh.t > 1.4 + (st.g.length - 1) * 0.3 + 0.85) { st.g.forEach((_, i) => shiftRow(st.g, i, i % 2 ? -1 : 1)); sh.done = true; }
}

// ---------- hold Shift: the house slides over a room ----------
// Only how it's drawn: the rooms, doors and puzzle don't change, and it snaps back when you let go.
let shiftAt = null, shiftK = 0, holdSaid = false;
addEventListener("keydown", (e) => { if (e.key === "Shift" && shiftAt == null) shiftAt = performance.now(); });
addEventListener("keyup", (e) => { if (e.key === "Shift") { shiftAt = null; holdSaid = false; } });
addEventListener("blur", () => { shiftAt = null; });
function holdUpdate(dt) {
  const on = shiftAt != null && performance.now() - shiftAt > 300 && st.scene === "play" && !st.tear;
  shiftK = clamp(shiftK + (on ? dt / 0.35 : -dt / 0.2), 0, 1);
  if (on && shiftK > 0.5 && !holdSaid) { holdSaid = true; sayLine(pick(HOLD)); sfx.slide(); }
}
const rowCv = document.createElement("canvas");
function slideRows(offs) {
  if (!offs || !offs.some((o) => Math.abs(o) > 0.5)) return;
  if (rowCv.width !== cv.width) { rowCv.width = cv.width; rowCv.height = cv.height; }
  const b = rowCv.getContext("2d"); b.setTransform(1, 0, 0, 1, 0, 0); b.clearRect(0, 0, cv.width, cv.height); b.drawImage(cv, 0, 0);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  offs.forEach((o, i) => {
    const sx = HX * DPR, sy = (HY + i * CH) * DPR, sw = HW * DPR, sh = CH * DPR, d = (((o % HW) + HW) % HW) * DPR;
    ctx.save(); ctx.beginPath(); ctx.rect(sx, sy, sw, sh); ctx.clip();
    ctx.drawImage(rowCv, sx, sy, sw, sh, sx + d, sy, sw, sh); ctx.drawImage(rowCv, sx, sy, sw, sh, sx + d - sw, sy, sw, sh); ctx.restore();
  });
  ctx.restore();
}

// ---------- the credits ----------
// The shadow is listed as co-author. Then it edits its own line, twice, and shrinks yours.
const CRED_LEN = 9;
function retype(a, b, k) { return k < 0.5 ? a.slice(0, Math.round(a.length * (1 - 2 * k))) : b.slice(0, Math.round(b.length * (2 * k - 1))); }
function stepText(list, t, at) {
  let i = 0; for (const a of at) if (t >= a) i++;
  const k = i < at.length ? clamp((t - (at[i] - 0.7)) / 0.7, 0, 1) : 1, cur = list[i] ?? list[list.length - 1];
  return { i, text: i < at.length && k > 0 ? retype(cur, list[i + 1], k) : cur, editing: i < at.length && k > 0 && k < 1 };
}
function drawCredits(t) {
  ctx.fillStyle = "#050407"; ctx.fillRect(0, 0, VW, VH);
  const a = clamp(t * 2, 0, 1); ctx.globalAlpha = a;
  centerText(CREDITS.title, 150, `52px ${MONO}`, INK);
  const sh = stepText(CREDITS.shadow, t, [2.6, 4.0]), yo = stepText(CREDITS.you, t, [5.4, 6.6]);
  const ss = [24, 38, 64][Math.min(2, sh.i)], ys = [24, 17, 12][Math.min(2, yo.i)];
  centerText(yo.text + (yo.editing ? "_" : ""), 230, `${ys}px ${MONO}`, sh.i ? DIM : INK);
  centerText(sh.text + (sh.editing ? "_" : ""), 240 + 30 + ss * 0.6, `${ss}px ${MONO}`, sh.i ? RED : INK);
  if (t > 7.4) centerText(CREDITS.real, VH - 60, `italic 18px ${SERIF}`, DIM);
  ctx.globalAlpha = 1;
}

// ---------- loop ----------
// for anyone who opens the browser's developer console
console.log(`%c${JOKES.console}`, "color:#ff5a4e;font:20px monospace");
const urlSeed = Number(new URLSearchParams(location.search).get("seed")), visit = urlSeed ? null : lastVisit();
let awayLine = null;
if (visit && visit.seed && Date.now() - visit.t >= 60e3) { /* a reload isn't leaving */ newGame(visit.seed); st.decor = true; st.shuffle = { t: 0, done: false }; awayLine = AWAY(goneFor(Date.now() - visit.t)); }
else newGame(urlSeed || ((Math.random() * 1e9) | 0));
let last = performance.now();
function frame(now) { const dt = Math.min(0.05, (now - last) / 1000); last = now; if (sticky && (sticky.t += dt) > 6) sticky = null; update(dt); render(); requestAnimationFrame(frame); }
requestAnimationFrame(frame);

// hooks for automated checks
window.__dh = {
  pickHouseMove: () => pickHouseMove(), houseMove: (m) => performEdit(m.id, m.li, m.dir, true), houseMoves, st: () => st, begin: () => { st.scene = "play"; }, choose: (w) => choose(w), say: (k) => say(k), choiceRects: () => choiceRects, nextFloor: () => nextFloor(), solve, hint: () => doHint(), edit: (li, d) => doEdit(li, d), edits, path, walk: (id, exit) => walkTo(id, exit, 0, 0),
  reach, find, byId, clone, applyEdit, newGame, muted: () => sfx.isMuted(), sticky: () => sticky, gag: () => ({ gag: !!st.gag, nudged: !!st.nudged, sign: !!st.sign, sticker: !!st.sticker }), undone: () => undone, undo: () => undo(), deskHit: desk.deskHit, shiftK: () => shiftK, goneFor, openDesk: () => openDesk(), trapped: (b) => trapped(b), awayLine: () => awayLine,
};
