// The Shifting House: a doll's house cut open. Click a room to walk there; click a word in the house's code
// to change the house. Two locks, a front door, and a shadow that hunts you through the rooms.
import { W, H, FLOOR, shiftRow, byId, find, nbrs, path, reach, clone, applyEdit, edits, solve, pickHouse, pageRoom, houseMoves, steps, NEW_WORD, NAMES } from "./house.js";
import { COMMITS, PAGES, VOICE, ENDING, HOUSE_LINES, FINALE, JOKES, HOLD, AWAY, CREDITS } from "./story.js";
import * as sfx from "./sound.js";
import * as art from "./art.js";
import * as tear from "./tear.js";
import * as desk from "./desk.js";
import { LOOK, woodFrame, beam, paper, pencil } from "./look.js";
import * as dh from "./dollhouse.js";


// ---------- layout ----------
const VW = 960, VH = 600, DPR = 2;
const CW = 150, CH = 146, HX = 44, HY = 74, HW = W * CW, HH = H * CH;
const HCX = HX + HW / 2, HCY = HY + HH / 2, PX = 664, PW = 278;
const cv = document.getElementById("game"), ctx = cv.getContext("2d");
// The house is a real 3D doll's house (src/dollhouse.js) once its models load; until then, or with ?flat=1, or where
// WebGL isn't there, it's drawn flat like before.
const FLAT = /[?&]flat=1/.test(location.search); const PHOTO = /[?&]photo=1/.test(location.search); // (photo=1: the photo camera all the time, for stills)
if (!FLAT) dh.init({ VW: 960, VH: 600, HX, HY, CW, CH, W, H }).catch((e) => console.warn("3D house unavailable:", e));
const in3d = () => !FLAT && dh.isReady();
// Play uses path-traced pictures (tools/render): each room photographed straight from the side, lights on and off, and
// the empty house around them. The game slides and turns those pictures over; doors, ladders and the figures go on top.
// The title and the shots between floors stay the live 3D photo camera. ?plates=0 turns the pictures off.
const PL = { on: !FLAT && !PHOTO && !/[?&]plates=0/.test(location.search), ready: false, img: {} };
if (PL.on) {
  const want = ["shell", "wood", "lock_shut", "lock_open", ...NAMES.flatMap((n) => [n + "_lit", n + "_dark", n + "_plate_lit", n + "_plate_dark", n + "_ladder_lit", n + "_ladder_dark"])]; let left = want.length;
  for (const k of want) { const im = new Image(); im.onload = () => { if (--left === 0) PL.ready = true; }; im.onerror = () => { PL.on = false; }; im.src = k === "wood" ? "assets/tex/Wood049/Color.jpg" : `assets/plates/${k}.${/plate_|lock_|ladder_/.test(k) ? "png" : "jpg"}`; PL.img[k] = im; }
}
const plates = () => PL.on && PL.ready && st.scene !== "title" && st.scene !== "floor";
cv.width = VW * DPR; cv.height = VH * DPR;
const MONO = LOOK.mono, SERIF = '"IM Fell English", Georgia, serif', TITLE = LOOK.title;
let INK = "#d6ccb6", DIM = "rgba(214,204,182,0.45)", YEL = "#ffd36a", RED = "#ff5a4e", GRN = "#f0d9a4";
const LAMP = "#f0d9a4"; // (marks on the house: never swapped for the paper's ink, which drew them dark green)
// draw fn in ink on paper: the panel's colors stand in for the night's while it runs
function inInk(fn) { const keep = [INK, DIM, YEL, RED, GRN]; ({ INK, DIM, YEL, RED, GRN } = LOOK.panel); try { fn(); } finally { [INK, DIM, YEL, RED, GRN] = keep; } }

// ---------- helpers ----------
const { lerp, clamp, shade } = art;
const ease = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
function poly(pts, fill) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); }

// ---------- game state ----------
let st;
const FLOORS = 3, PACE = [92, 104, 116], TRAPS = [10, 9, 8];
let runSeed = 0;
function newGame(seed, floor = 1, carry = null, house = null) {
  const h = house || pickHouse(floor, seed); if (floor === 1 && !house) runSeed = seed;
  paused = false;
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
    sheets: carry && carry.sheets ? carry.sheets : [],
    voice: null, pageShow: null, started: false, blackout: 0, faceBolt: false, faced: false, typed: null, ending: null, endT2: 0, idleSaid: false,
  };
  st.g0 = clone(h.g); // the floor as it began, in case the house ever leaves no way out (and for Restart)
  st.carry0 = carry && { grabs: carry.grabs, total: { ...carry.total }, bolt: carry.bolt, pages: carry.pages, found: [...carry.found], said: new Set(carry.said), used: new Set(carry.used), sheets: [...(carry.sheets || [])] };
  if (carry) { st.grabs = carry.grabs; st.scene = "play"; st.shadow.mode = "sleep"; }
  setTitle("The Shifting House");
}
// ---------- pause and restart ----------
// Restart puts this floor back exactly as it began: same house, same rooms, moves back to 0. Pages and grabs from
// earlier floors stay; anything picked up on this floor is put back.
let paused = false;
function restartFloor() {
  if (!(st.scene === "play" || st.scene === "caught")) return;
  const c = st.carry0 || { grabs: 0, total: { moves: 0, par: 0, hints: 0 }, bolt: st.bolt, pages: 0, found: [], used: new Set() };
  const house = { ...st.h, g: clone(st.g0) };
  newGame(null, st.floor, { ...c, total: { ...c.total }, found: [...c.found], used: new Set(c.used), said: st.said, sheets: [...(c.sheets || [])] }, house);
  sfx.reset(); sfx.duck(false); sfx.slide(); st.shake = 0.4;
  const [x, y] = walkerPos(st.player); float(x - 30, y - 50, "Floor started over.", YEL);
}
function setPaused(on) {
  if (on && st.scene !== "play") return;
  paused = on; sfx.duck(on); if (on) { st.hover = null; refreshPreview(); }
}
function setTitle(t) { try { document.title = t; } catch { /* fine */ } }
function nextFloor() {
  const carry = { grabs: st.grabs, total: st.total, bolt: st.bolt, pages: st.pages, found: st.found, said: st.said, used: st.used, sheets: st.sheets };
  newGame(st.floor + 1 === 3 ? null : (Math.random() * 1e9) | 0, st.floor + 1, carry);
}
// the page as you leave a floor, stains and all: the ending lays the three side by side
function keepSheet() {
  try {
    const x = (PX - 22) * DPR, y = 14 * DPR, w = (PW + 38) * DPR, h = (VH - 28) * DPR, c = document.createElement("canvas");
    c.width = Math.round(w / 2); c.height = Math.round(h / 2); c.getContext("2d").drawImage(cv, x, y, w, h, 0, 0, c.width, c.height);
    st.sheets = [...(st.sheets || []), c].slice(-FLOORS);
  } catch { /* (no canvas: a test) */ }
}
function floorDone() {
  // the chase: the front door holds shut until the house lets you go (about half a minute)
  if (st.finale && !st.finale.giveUp) {
    st.player.fx = 0.15; st.player.way = null; // pushed back in off the doorstep, where the shadow can still get at you
    if (!(st.finale.bounced > st.finale.t - 1.5)) { st.finale.bounced = st.finale.t; float(HX + 150, HY + HH - 50, "frontDoor.open = \"not yet\";", RED); if (!st.finale.saidNo) { st.finale.saidNo = true; sayLine(FINALE.notYet[0]); } sfx.doorShut(); st.shake = 0.5; }
    return;
  }
  st.total.moves += st.moves; st.total.par += st.h.par;
  st.wantSheet = true;
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
const FEET_PHOTO = 7; // feet above the room's bottom edge in the photographed rooms: the floor's middle depth there
function screenPos(id, fx) {
  const p = find(st.g, id), off = bandOffset(p);
  return [HX + p.x * CW + off[0] + 8 + fx * (CW - 16), HY + p.y * CH + off[1] + CH - (plates() ? FEET_PHOTO : 22)]; // (photographed rooms: on the floor at mid-depth, CH 11-19 "floating above floor")
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
  st.said.add(key); sayLine(text);
}
function lastEnding() { try { return localStorage.getItem("shift-ending"); } catch { return null; } }
// a few words that rise and fade where something happened. They stay inside the house's side of the screen and
// stack instead of printing over each other (testers: two at once came out as one smudge)
function float(x, y, text, color) {
  ctx.save(); ctx.font = `20px ${MONO}`; const w = ctx.measureText(text).width; ctx.restore();
  let left = Math.max(HX, Math.min(x - 40, SX - 10 - w));
  for (let n = 0; n < 6; n++) {
    const hit = st.floats.find((f) => Math.abs(y - (f.y - f.t * 30)) < 22 && left < f.x - 40 + (f.w || 200) && f.x - 40 < left + w);
    if (!hit) break; y = hit.y - hit.t * 30 - 24;
  }
  st.floats.push({ x: left + 40, y, w, text, color, t: 0 });
}
function walkTo(id, exit, mx, my) {
  const w = st.player;
  if (w.way) { w.pending = { id, exit }; return; }
  const p = path(st.g, w.id, id);
  if (!p) {
    if (!mx && !my) [mx, my] = walkerPos(w); // a queued walk that failed: say it over you, not off the screen
    if (exit) { float(Math.max(mx, HX + 40), my - 20, "no way to the door yet", RED); st.doorNag = 3; }
    else float(mx, my, "no way there", RED);
    st.reachFlash = 1.2; sfx.doorShut(); return;
  }
  if (p.length === 1 && !exit) { w.way = { pts: [{ id: w.id, fx: w.fx }, { id, fx: 0.5 }], seg: 0, t: 0 }; return; }
  w.way = buildWay(w, p, exit ? { id, fx: -0.32, exit: true } : null);
  w.way.exit = !!exit;
}
function doEdit(li, dir = 1) {
  if (st.scene !== "play") return;
  if (st.anim) { // clicked mid-move: it happens when the rooms settle
    // ...unless it's the second half of a double-click on the word that just moved them (that would undo or repeat it)
    if (st.lastEdit && st.lastEdit.li === li && st.lastEdit.dir === dir && st.t - st.lastEdit.t < 0.4) return;
    st.queued = { li, dir, id: st.player.id }; return;
  }
  st.lastEdit = { li, dir, t: st.t };
  { const r = st.wordRects.find((w) => w.li === li && w.dir === dir), ly = st.lineYs && st.lineYs[li];
    if (r && ly != null) { // the old word's ink runs off the page into the margin by its line number, and dries there
      st.smear = { x: r.x, y: r.y, w: r.w, h: r.h, t: 0 };
      st.stains = (st.stains || []).slice(-23); { const h = (k) => hash01(st.t * k + ly); st.stains.push({ x: PX - 9 + (h(1) - 0.5) * 4, y: ly + 9 + h(2) * 3, t: 0, seed: (st.t * 1000) | 0, r: 4.5 + h(3) * 2.5, tall: 1.3 + h(7) * 1.2, run: h(11) < 0.4 ? 0 : 6 + h(13) * 22, rough: 0.25 + h(17) * 0.5, n: 12 + ((h(19) * 16) | 0) }); }
      st.total.retyped = (st.total.retyped || 0) + 1; st.retype = { li, t: 0, n: 0, len: st.total.retyped <= 3 ? 0.4 : 0.2 }; } }
  st.queued = null; st.houseIdle = 0;
  const room = byId(st.g, st.player.id), c = room.lines[li];
  if (c.kind === "lock" && st.unlocked) return;
  st.used.add(c.kind);
  const res = performEdit(room.id, li, dir, false);
  // you did what the hint said: the house lets that one go (testers lost the hinted room to its very next reply)
  const followed = st.hint && st.hint.id === room.id && st.hint.li === li && st.hint.dir === dir;
  void followed; // (following a hint used to spare you the house's turn; with hints back to back the house never moved: CH 11-19)
  st.edits++; st.hint = null; if (res.kind !== "lights" && res.kind !== "lock") st.moves++;
  st.writeBack = { li, t: 0 };
  if (res.kind === "lock") {
    float(HX + 60, HY + HH - 90, "the front door is open", GRN); sfx.unlock(); st.unlockAt = st.floorT;
    say("unlock"); // on the last floor the finale starts once the front door is in reach (finaleWatch)
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
  if (st.shadow.mode !== "sleep" && !path(st.g, st.shadow.id, st.player.id) && st.shadow.noPath === 0) { trapped(!byHouse); st.shadow.noPath = st.floorT - (st.shadow.freedAt ?? -99) < 30 ? Math.max(0.01, st.shadow.lastNoPath || 0) : 0.01; }
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
  if (st.finale || st.scene !== "play" || st.floor === 1) return; // floor 1 is calm: it starts fighting back on floor 2
  st.playerEdits++; st.houseIdle = 0; st.hintAt = null; // your move ends the hint's hold
  // on floor 2 it answers every other move (round-2 testers who read slowly said the house rearranged faster than
  // they could read); on floor 3 it answers every move
  if (st.floor === 2 && st.playerEdits % 2 === 0) return; // (it answers your 1st, 3rd, 5th move...)
  st.houseNext = { t: -HOUSE_WAIT, move: null };
}
function pickHouseMove(force = false) {
  // a hint you asked for holds: the house waits until you've made that move (or half a minute), so it can't undo it
  // (both blind testers quit floor 2 after the house's next move made the hint wrong)
  if (!force && hintHolds()) { think("house.wait();  // go on, then"); return null; }
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
    // and no cheap grabs: it never slides the shadow right next to you (a grab ~1.5 s after its move felt unfair)
    if (sh.mode !== "sleep" && steps(path(m.g, sh.id, me)) <= 1 && steps(path(m.g, sh.id, me)) < steps(path(st.g, sh.id, me))) continue;
    return m;
  }
  return null;
}
function houseCode(m) {
  const room = byId(st.g, m.id), c = room.lines[m.li], parts = lineParts(room, c, false);
  const w = c.kind === "door" ? (room[c.side === "west" ? "l" : "r"] ? "shut" : "open") : parts[1].find((x) => (x.dir ?? 1) === m.dir).text;
  return parts[0] + w + parts[2];
}
const HINT_HOLD = 8;
function hintHolds() { return !!(st.hint && st.hint.text && st.hint.text.startsWith("Hint:") && st.hintAt != null && st.floorT - st.hintAt < HINT_HOLD); }
const HOUSE_IDLE = [14, 16, 10]; // and if you sit still too long, it moves anyway
function houseUpdate(dt) {
  if (!st.houseNext && !st.finale && st.shadow.mode !== "sleep") {
    if (!st.hover) st.houseIdle = (st.houseIdle || 0) + dt; // reading a word or a room isn't sitting still
    if (st.houseIdle > HOUSE_IDLE[st.floor - 1]) { st.houseIdle = 0; st.houseNext = { t: 0, move: null }; }
  }
  const hn = st.houseNext; if (!hn) return;
  hn.t += dt;
  if (hn.t >= 0 && !hn.move) {
    const m = pickHouseMove(); if (!m) { st.houseNext = null; return; }
    hn.move = m; hn.code = houseCode(m); hn.typed = 0; sfx.creak(0.35);
  }
  if (hn.move) { const n = Math.floor(clamp(hn.t * 40, 0, hn.code.length)); while (hn.typed < n) { const ch = hn.code[hn.typed++]; if (ch !== " ") { sfx.clack(0.8 + Math.random() * 0.3); st.jolt = 1; } } }
  // reading a word or a room on the page: it waits a little longer, so the page doesn't change under your click
  const reading = st.hover && (st.hover.type === "word" || st.hover.type === "room");
  if (hn.move && hn.t >= HOUSE_WARN && !(reading && hn.t < HOUSE_WARN + 2.5)) {
    const m = hn.move, room = byId(st.g, m.id); st.houseNext = null;
    if (!room || !room.lines[m.li] || st.player.id === m.id) return;
    const still = houseMoves(st.g, st.player.id, st.shadow.id, false).find((x) => x.id === m.id && x.li === m.li && x.dir === m.dir);
    if (!still || !solve(still.g, st.player.id, st.h.lockIds, st.unlocked, 3)) return; // you moved first: it lets it go
    const c = room.lines[m.li], wasOpen = c.kind === "door" && room[c.side === "west" ? "l" : "r"];
    st.slip = { e: errata(m), at: st.floorT }; st.lastHouse = houseCode(m); st.houseLog = [st.lastHouse, ...(st.houseLog || [])].slice(0, 4); performEdit(m.id, m.li, m.dir, true); st.total.house = (st.total.house || 0) + 1;
    const lines = m.reuse ? HOUSE_LINES.reuse : c.kind === "door" ? HOUSE_LINES.door[wasOpen ? "shut" : "open"] : HOUSE_LINES[c.kind];
    if (!st.voice && !jokeDue()) sayLine(pick(lines)); think(`house.${c.kind === "door" ? (wasOpen ? "shut" : "open") : "move"}(${room.name});`);
  }
}
// One line at a time, each up long enough to read. Lines that come while one is showing wait their turn
// (CH: "I don't want the jokes happening so fast that they're hard to catch"). The chase and a grab speak at once.
function voiceLen(text) { return Math.max(5, 3 + text.length * 0.07); } // (testers: lines went before they could be read)
function sayLine(text, now = st.scene === "caught") {
  st.voiceQ = st.voiceQ || [];
  if (st.voice && !now) { if (st.voice.text !== text && !st.voiceQ.includes(text) && st.voiceQ.length < 2) st.voiceQ.push(text); return; }
  if (now) { st.voiceQ.length = 0;
    // an urgent line cuts in, but a line cut off before it could be read comes back after it (testers: lines lost mid-read)
    const v = st.voice; if (v && v.text !== text && v.t < v.len * 0.6 && st.scene !== "caught") st.voiceQ.push(v.text); }
  st.voice = { text, t: 0, len: voiceLen(text) }; st.quiet = 0; sfx.voice();
}
// the screen has been free of house lines and jokes for a while: room for the next joke
// the house's chatter after its own moves is optional: it stays quiet when a line is up or a floor joke is due
function jokeDue() { return !st.gag && ((st.floor === 1 && st.sinceStart > 9) || (st.floor === 2 && st.sinceStart > 5)); }
function quietFor(s) { return !st.voice && !(st.voiceQ || []).length && !st.sign && !st.sticker && st.quiet >= s; }

// ---------- the finale ----------
// The last front door is unlocked: the house stops taking turns and slides its own rows every few seconds while the
// shadow runs you down. One way to the door always stays open, and it's lit.
function startFinale() {
  st.finale = { t: 0, next: 3.4, n: 0, lost: 0 }; st.houseNext = null; sayLine(FINALE.tear, true); setTitle(FINALE.title);
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
// the chase: a slide about every 4 s, so you can follow each one, and a few lines said once each
// (the critic counted 23 slides and 21 lines in one run before)
const doorRoom = () => st.g[H - 1][0].id, FINALE_GIVE_UP = 30, FINALE_SLIDE = 4, FINALE_TALK = 3;
function finaleUpdate(dt) {
  const f = st.finale; f.t += dt; f.next -= dt;
  // until it gives up, the door is out of reach and you run from the shadow through the rooms you can reach (lit);
  // then it opens a way to the door and lights that
  st.finalePath = f.giveUp ? path(st.g, st.player.id, doorRoom()) : [...reach(st.g, st.player.id)];
  if (f.giveUp && !st.finalePath && !st.anim) { f.lost += dt; if (f.lost > 4) { f.lost = 0; carve(); } } else f.lost = 0;
  // about half a minute in, it stops sliding and lets you go (the whole chase runs about 35 seconds)
  if (!f.giveUp && f.t > FINALE_GIVE_UP && !st.anim) { f.giveUp = true; if (!path(st.g, st.player.id, doorRoom())) carve(); sayLine(FINALE.giveUp, true); think("house.let(you).go();  // fine"); }
  if (f.giveUp || f.next > 0 || st.anim) return;
  f.next = FINALE_SLIDE; const me = st.player.id, pm = find(st.g, me), opts = [];
  for (let y = 0; y < H; y++) for (const dir of [-1, 1]) {
    // in the chase it breaks its own rule and slides your row too, carrying you away from the door ("Every room is mine.")
    if (y === pm.y && f.giveUp) continue; const g2 = clone(st.g); g2[y] = g2[y].map((_, x) => g2[y][(x - dir + W * 2) % W]);
    // keep the door out of reach for now, then bring the shadow closer
    const open = path(g2, me, g2[H - 1][0].id) ? 0 : 10;
    opts.push({ y, dir, score: open + steps(path(st.g, st.shadow.id, me)) - steps(path(g2, st.shadow.id, me)) + Math.random() });
  }
  opts.sort((a, b) => b.score - a.score); const o = opts[0];
  if (!o) return;
  settle(st.player); settle(st.shadow); st.player.pending = null;
  const row = st.g[o.y]; st.g[o.y] = row.map((_, x) => row[(x - o.dir + W * 2) % W]);
  st.anim = { kind: "row", i: o.y, dir: o.dir, t: 0 }; sfx.slide(); dustBurst(st.anim); st.shake = 0.7;
  const k = f.n++; if (k % 2 === 0 && k / 2 < FINALE_TALK) sayLine(FINALE.lines[k / 2]);
}

// While the house is out of its window nothing else moves. Sounds land on the beats; then it says "Then run."
function tearUpdate(dt) {
  const t0 = st.tear.t, t1 = (st.tear.t += dt), T = tear.TEAR, at = (k) => t0 < k && t1 >= k;
  if (at(T.out)) { sfx.slide(); sfx.creak(0.6); }
  if (at(T.out + 0.4)) setTitle(tear.windowTitle(t1));
  if (at(T.slam)) { sfx.doorShut(); sfx.breakOut(); sfx.thunder(0.1); }
  if (t1 >= T.len) { st.tear = null; setTitle(FINALE.title); sayLine(FINALE.start, true); farShadow(2.5); st.graceUntil = st.floorT + 4; } // (a head start: a tester was thrown back right after "Then run.")
}

// Last floor: the lock is open, but the chase only starts once you've got the front door in reach, so the floor's
// own puzzle (and its new word, the flip) still has to be solved
function finaleWatch() {
  if (st.floor === FLOORS && st.unlocked && !st.finale && !st.anim && reach(st.g, st.player.id).has(doorRoom())) startFinale();
}
// One absurd moment per floor, early, and on floor 1 a nudge so nobody sits stuck
function gags() {
  if (st.finale) return;
  if (st.floor === 1 && !st.gag && st.sinceStart > 12 && quietFor(3)) { st.gag = true; st.shake = 0.9; dustBurst({ kind: "row", i: 0 }); dustBurst({ kind: "row", i: 2 }); sfx.breakOut(); sayLine(JOKES.sneeze); }
  // floor 1: lost, whether sitting still or clicking around? It points the way (and keeps doing it)
  if (st.floor === 1 && !st.unlocked) {
    const nz = st.nudge || (st.nudge = { at: 0, moves: 0, n: 0 }), since = st.sinceStart - nz.at, R = reach(st.g, st.player.id);
    const lost = !st.h.lockIds.some((l) => R.has(l));
    if (lost && quietFor(4) && ((nz.n === 0 && st.sinceStart > 30 && st.moves === 0) || (nz.n === 0 && st.moves >= st.h.par + 4 && st.sinceStart > 10) || (nz.n > 0 && (since > 25 || (st.moves - nz.moves >= 4 && since > 8))))) {
      nz.at = st.sinceStart; nz.moves = st.moves; nz.n++; st.nudged = true; doHint(false); sayLine(JOKES.nudges[Math.min(nz.n, JOKES.nudges.length) - 1]);
    }
  }
  if (st.floor === 2 && !st.gag && st.sinceStart > 8 && st.shadow.mode !== "sleep" && quietFor(2.5)) { st.gag = true; st.sign = { t: 0 }; }
}
// house.hint(): the next word of the shortest way out
function doHint(asked = true) {
  const plan = solve(st.g, st.player.id, st.h.lockIds, st.unlocked, 4);
  if (asked) { st.total.hints++; sfx.hint(); st.hintAt = st.floorT; }
  if (!plan) st.hint = { text: "Hint: even the house is lost. Try sliding a row back the way it came." };
  else if (!plan.length) st.hint = { text: tapWords(st.unlocked ? "Hint: the way is open. Click the front door, bottom left." : "Hint: a red lock is in reach. Walk there and tick UNLOCK.") };
  else {
    const m = plan[0], room = byId(st.g, m.id), c = room.lines[m.li], word = stepWord(room, c, m.dir), no = STEP_NO(room, m.li);
    st.hint = { ...m, text: m.id === st.player.id ? `Hint: tick ${word} on step ${no} (${stepView(room, c).lead.toLowerCase()}).` : `Hint: walk to the ${room.name} (the lit frame), then tick ${word} on its step ${no}.` };
  }
  // the hint only knows the house: if the shadow is close to where it sends you, it says so
  const sh = st.shadow, dest = st.hint.id != null ? st.hint.id : st.unlocked ? doorRoom() : null;
  if (dest != null && sh.mode !== "sleep" && !st.finale) {
    const toDest = steps(path(st.g, sh.id, dest)), toMe = steps(path(st.g, sh.id, st.player.id));
    if ((toDest != null && toDest <= 1) || (toMe != null && toMe <= 1)) st.hint.text += " Careful: it's close. Let it pass, or shut a door on it.";
  }
  // it runs out of patience before it runs out of hints (the real hint still follows)
  if (asked && st.total.hints === 5) st.hint.text = `${JOKES.hint5} ${JOKES.fine} ${st.hint.text.replace(/^Hint: /, "")}`;
  if (asked && st.total.hints === 7) { st.hint.text = `${JOKES.hint7} ${JOKES.fine} ${st.hint.text.replace(/^Hint: /, "")}`; st.crayon = { t: 0 }; }
  st.hint.t = 0; st.hint.at = st.player.id;
}
// a hint is worded for the room you were in: when you walk to another room it's reworded (a tester got "tick DOWN on
// step 1 (slide this column)" in a room whose step 1 was a row)
function freshenHint() {
  const h = st.hint; if (!h || !h.text || !h.text.startsWith("Hint:") || h.at === st.player.id || st.player.way || st.scene !== "play") return;
  const t = h.t, at = st.hintAt; doHint(false); st.hint.t = t; st.hintAt = at;
}


// ---------- update ----------
function update(dt) {
  freshenHint();
  if (paused) return; // everything holds still: the house, the shadow, the rain
  weather(dt);
  st.t += dt; st.thought.t += dt; st.glitch = Math.max(0, st.glitch - dt); st.shake = Math.max(0, st.shake - dt);
  st.reachFlash = Math.max(0, st.reachFlash - dt); st.blackout = Math.max(0, st.blackout - dt);
  st.quiet = (st.quiet || 0) + dt; st.voiceQ = st.voiceQ || [];
  if (st.voice) { st.quiet = 0; st.voice.t += dt; if (st.voice.t > st.voice.len) st.voice = null; }
  else if (st.voiceQ.length && st.quiet > 0.7) sayLine(st.voiceQ.shift());
  if (st.pageShow) { st.pageShow.t += dt; if (st.pageShow.t > 10) st.pageShow = null; }
  if (st.typed) st.typed.t += dt;
  if (st.faceBolt && st.bolt.t > 1.2) st.faceBolt = false;
  if (st.writeBack) { st.writeBack.t += dt; if (st.writeBack.t > 2.2) st.writeBack = null; }
  if (st.crayon && (st.crayon.t += dt) > 9) st.crayon = null;
  if (st.note && (st.note.t += dt) > 6) st.note = null;
  if (st.sign && (st.sign.t += dt) > 6) st.sign = null;
  if (st.sticker && (st.sticker.t += dt) > 7) st.sticker = null;
  if (st.desk) { st.desk.t += dt; if (st.desk.bin != null) st.desk.bin += dt; }
  st.floats = st.floats.filter((f) => (f.t += dt) < 1.4);
  for (const sn of st.stains || []) sn.t += dt;
  if (st.smear && (st.smear.t += dt) > 0.6) st.smear = null;
  if (st.retype) { const R = st.retype; R.t += dt; const n = Math.floor(R.t / R.len * 12); while (R.n < Math.min(n, 12)) { R.n++; sfx.clack(0.5 + Math.random() * 0.4); } if (R.t > R.len + 0.05) st.retype = null; }
  st.jolt = Math.max(0, (st.jolt || 0) - dt * 14);
  pageInk(dt);
  st.dust = st.dust.filter((d) => { d.t += dt; d.x += d.vx * dt; d.y += d.vy * dt; d.vy += (d.up ? -6 : 40) * dt; return d.t < d.life; });
  gravity(dt);
  if (st.scene === "caught") { st.caughtT += dt; if (st.caughtT > 2.4) dragBack(); return; }
  if (st.scene === "desk") return;
  if (st.scene === "sheets") { st.sheetT += dt; if (st.sheetT > SHEETS_LEN + 0.8) { st.scene = "credits"; st.credT = 0; sfx.doorShut(); } return; }
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
  gags(); finaleWatch();
  if (st.anim) { st.anim.t += dt / (st.anim.slow ? 1.3 : 0.7); if (st.anim.t >= 1) st.anim = null; else return; }
  if (st.queued) { const q = st.queued; st.queued = null; if (q.id === st.player.id && byId(st.g, q.id).lines[q.li]) doEdit(q.li, q.dir); }
  st.doorNag = Math.max(0, (st.doorNag || 0) - dt);

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

  const sh = st.shadow, speed = PACE[st.floor - 1] / (1 + 0.08 * st.grabs) * (st.finale ? (st.finale.giveUp ? 0.6 : 1.3) : 1);
  if (sh.mode === "sleep") {
    if (st.sinceStart > 8) wake();
  } else if (sh.lunge > 0) { sh.lunge -= dt; if (sh.lunge <= 0) sh.dash = 1.1; } // the tell: it stops dead and crouches, then comes fast
  else if (sh.way) advance(sh, dt, (sh.seep ? speed * 0.5 : speed) * (sh.dash > 0 ? 1.7 : 1), () => { sh.seep = false; });
  else if ((sh.timer -= dt) <= 0) planShadow();
  if (sh.dash > 0) sh.dash -= dt; if (sh.lungeCool > 0) sh.lungeCool -= dt;

  const pp = walkerPos(st.player), sp = walkerPos(sh), dist = Math.hypot(pp[0] - sp[0], pp[1] - sp[1]);
  // a few safe seconds right after you unlock, and after every grab (testers were grabbed again and again, every
  // 4-5 s, and quit: a grab should sting once, then give you room to think)
  const safe = st.floorT - (st.unlockAt ?? -99) < 3 || st.floorT < (st.graceUntil ?? -99);
  if (sh.mode !== "sleep" && !safe && dist < 90 && !(sh.lunge > 0) && !(sh.dash > 0) && !(sh.lungeCool > 0) && !st.anim) { sh.lunge = 0.75; sh.lungeCool = 3; sfx.creak(0.7); st.shake = Math.max(st.shake || 0, 0.25); }
  if (sh.mode !== "sleep" && !safe && dist < 24) { if (st.finale) shoved(); else { st.scene = "caught"; st.caughtT = 0; think("found(you);"); sfx.caught(); say("caught"); } }
  // it's one room away: say so, once each time it closes in (testers were grabbed without seeing it coming)
  const near = nearness(); if (near === 1 && (st.lastNear ?? 9) > 1 && sh.mode !== "sleep") { float(pp[0] - 40, pp[1] - 64, "it's in the next room", RED); st.shake = Math.max(st.shake || 0, 0.15); }
  st.lastNear = near;
  sfx.update(dt, near);
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
    if (sh.noPath === 0) { trapped(false); if (st.floorT - (sh.freedAt ?? -99) < 30) sh.noPath = sh.lastNoPath || 0; } // shut in again soon: the count picks up where it was (testers saw it jump 4, 8, 1, 8)
    sh.noPath += 0.5; sh.timer = 0.5;
    if (sh.noPath >= TRAPS[st.floor - 1]) breakOut();
    return;
  }
  if (sh.noPath > 0) { sh.lastNoPath = sh.noPath; sh.freedAt = st.floorT; }
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
// put the shadow in the room farthest from you, and give it a moment before it moves
function farShadow(wait) {
  const sh = st.shadow, b = find(st.g, st.player.id); let best = null, bd = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const r = st.g[y][x]; if (r.id === st.player.id) continue;
    // far away, but somewhere it can get to you from, so it's never shut in for the whole chase
    const d = Math.abs(x - b.x) + Math.abs(y - b.y) + Math.random() * 0.5 + (path(st.g, r.id, st.player.id) ? 10 : 0); if (d > bd) { bd = d; best = r; }
  }
  sh.way = null; sh.id = best.id; sh.fx = 0.5; sh.timer = wait; sh.noPath = 0; sh.mode = "hunt"; // never sits out the chase shut in
}
// In the finale it doesn't drag you back: it grabs, lets go, and is flung to the far side of the house
function shoved() { // in the finale it doesn't drag you to a card: it grabs, and the house rewrites a step against you
  st.shake = 1; st.blackout = 0.25; sfx.caught(); grabCost();
  if (!st.finale.saidNo) { st.finale.saidNo = true; sayLine(FINALE.shoved); }
}
// What a grab costs: the house rewrites one step against you (an errata slip), you're flung a room or two away
// from it, and it's thrown to the far side of the house. Never back to the start, never a game over (CH 11-19:
// "it just let me go... no real danger", but he hates harsh loss penalties).
function grabCost() {
  st.grabs++; st.total.caught = (st.total.caught || 0) + 1;
  const me = st.player, sh = st.shadow; me.way = null; me.pending = null; me.fx = 0.5;
  // in the chase the house already slides a row every few seconds, so a grab doesn't add a slide of its own (two
  // slides close together can't be followed): it throws you back from the door instead
  // a second grab soon after the first costs no extra rewrite (it was snowballing into an unwinnable mess)
  const again = st.floorT - (st.lastGrabAt ?? -99) < 20; st.lastGrabAt = st.floorT; st.graceUntil = st.floorT + (st.finale ? 3 : 6);
  const m = st.finale || again ? null : pickHouseMove(true);
  if (m) { st.slip = { e: errata(m), at: st.floorT }; st.lastHouse = houseCode(m); st.houseLog = [st.lastHouse, ...(st.houseLog || [])].slice(0, 4); performEdit(m.id, m.li, m.dir, true); st.total.house = (st.total.house || 0) + 1; }
  // flung: the room you can reach that's farthest from it (by steps), else you stay put
  const R = [...reach(st.g, me.id)]; let best = me.id, bd = -1;
  const door = st.finale ? doorRoom() : null;
  // (before the chase: a nearby room at least two rooms from it, not the far end of the house; testers lost track
  // of the house when every grab sent them somewhere new)
  for (const id of R) { const fromIt = steps(path(st.g, sh.id, id)) ?? 9, d = door ? (steps(path(st.g, id, door)) ?? 9) * 2 + fromIt : (fromIt >= 2 ? 20 : fromIt) - (steps(path(st.g, me.id, id)) ?? 9); if (id !== sh.id && d > bd) { bd = d; best = id; } }
  me.id = best;
  // never a dead floor: if no way out is left within a few steps, the house opens one
  if (!solve(st.g, me.id, st.h.lockIds, st.unlocked, 4)) { if (st.unlocked) carve(); else { st.g = clone(st.g0); st.flipped = false; } }
  farShadow(st.finale ? 2 : 6);
  st.houseNext = null; st.houseIdle = 0;
  if (st.hint && st.hint.text && st.hint.text.startsWith("Hint:")) { const t = st.hint.t, at = st.hintAt; doHint(false); st.hint.t = t; st.hintAt = at; }
  unseal(); const p = screenPos(me.id, 0.5); float(Math.min(p[0] - 30, PX - 330), p[1] - 50, m ? "it caught you: the house changed a step" : st.finale ? "it caught you: thrown back from the door" : "it caught you", RED);
}
function dragBack() { st.scene = "play"; grabCost(); }

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
  if (st.finale && st.scene === "play") lit = room.id === st.player.id || (st.finalePath && st.finalePath.includes(room.id)) ? 1 : 0;
  let L = lerp(0.3, 1, lit) * (0.95 + 0.05 * Math.sin(st.t * 11 + room.id * 7) * Math.sin(st.t * 3.3 + room.id));
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
      ctx.save(); ctx.globalAlpha = 0.55 + 0.45 * Math.sin(st.t * 8); ctx.strokeStyle = o.door.open ? LAMP : RED; ctx.lineWidth = 2.5;
      ctx.beginPath(); q.forEach((pt, i) => i ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1])); ctx.closePath(); ctx.stroke(); ctx.restore();
    }
  }
  // ladders, hatches and the room's name are its "bones", drawn over the dark in lampLight (bones())
  // the lock
  if (room.lines.some((l) => l.kind === "lock")) {
    const lx = bx + bw * 0.7, ly = by + bh * 0.42, col = st.unlocked ? LAMP : RED;
    glows.push(() => padlock(lx, ly, col, 8 + 4 * Math.sin(st.t * 4)));
    padlock(lx, ly, col, 6);
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
  if (lit < 0.5) { ctx.save(); ctx.globalCompositeOperation = "multiply"; ctx.fillStyle = "rgba(120,150,220,1)"; ctx.fillRect(ox, oy, ow, oh); ctx.restore(); ctx.save(); ctx.globalCompositeOperation = "lighter"; const mg = ctx.createLinearGradient(ox + ow, oy, ox, oy + oh); mg.addColorStop(0, "rgba(90,120,200,0.16)"); mg.addColorStop(1, "rgba(90,120,200,0)"); ctx.fillStyle = mg; ctx.fillRect(ox, oy, ow, oh); ctx.restore(); }
}
// ---------- the photographed rooms ----------
// One room's picture, lit or dark (cross-faded), turned over with the house; then what changes with the code, drawn
// where the 3D house has it: doorways in the side posts, the ladder up and its hatch, the hole down, the lock, the page.
const PS = 3.2 / 150, PLATEH = 20, POST = 0.14 / PS, SLAB = 0.08 / PS, DOORH = 1.5 / PS, LADX = 0.8 / PS;
function drawPlate(room, cx, cy, o, gx, gy) {
  const lit = roomLit(room, o), shHere = st.shadow.mode !== "sleep" && st.shadow.id === room.id;
  ctx.save(); ctx.beginPath(); ctx.rect(cx, cy, CW, CH); ctx.clip();
  if (st.flipped) { ctx.translate(0, 2 * cy + CH); ctx.scale(1, -1); }
  ctx.drawImage(PL.img[room.name + "_dark"], cx, cy, CW, CH);
  if (lit > 0) { ctx.globalAlpha = lit; ctx.drawImage(PL.img[room.name + "_lit"], cx, cy, CW, CH); ctx.globalAlpha = 1; }
  ctx.restore();
  ctx.save(); ctx.beginPath(); ctx.rect(cx, cy, CW, CH); ctx.clip();
  if (shHere && Math.random() < 0.18) { ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(cx, cy, CW, CH); } // (its bulb stutters when the thing is in the room)
  const fy = cy + CH - SLAB, cyT = cy + SLAB, L = 0.35 + 0.65 * lit;
  // doorways: an open one is a dark gap in the post with the next room's light at its edge, a shut one a panelled door
  for (const s of ["l", "r"]) {
    const hasLine = room.lines.some((l) => l.kind === "door" && (l.side === "west") === (s === "l"));
    const x0 = s === "l" ? cx : cx + CW - POST, y0 = fy - DOORH;
    if (room[s]) {
      // open: the post's lower half falls into the doorway's shadow, and the next room's lamp spills across the floor
      const nb = st.g[gy] && st.g[gy][gx + (s === "l" ? -1 : 1)], nl = nb ? roomLit(nb, {}) : 0, inX = s === "l" ? x0 + POST : x0;
      const d = ctx.createLinearGradient(0, y0 - 6, 0, y0 + 10); d.addColorStop(0, "rgba(0,0,0,0)"); d.addColorStop(1, "rgba(0,0,0,0.5)"); ctx.fillStyle = d; ctx.fillRect(x0, y0 - 6, POST, DOORH + 6);
      if (nl > 0) { const g = ctx.createRadialGradient(inX, fy, 1, inX, fy, 34); g.addColorStop(0, `rgba(255,186,110,${0.2 * nl})`); g.addColorStop(1, "rgba(255,186,110,0)");
        ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(inX, fy, 34, 30, 0, Math.PI, 0); ctx.fill(); ctx.restore();
        ctx.fillStyle = `rgba(255,196,130,${0.22 * nl})`; ctx.fillRect(s === "l" ? x0 + POST - 1 : x0, y0 + 4, 1, DOORH - 4); } // (light round the door frame's edge)
    } else if (hasLine) {
      // shut, but it can open: the door's edge shows in the post, with its brass knob
      ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(x0 + POST / 2 - 0.5, y0, 1, DOORH); ctx.fillRect(x0, y0, POST, 1);
      ctx.fillStyle = `rgba(214,180,96,${0.45 + 0.4 * L})`; ctx.beginPath(); ctx.arc(x0 + POST / 2, fy - DOORH * 0.48, 1.5, 0, 7); ctx.fill();
      ctx.fillStyle = "rgba(255,240,200,0.35)"; ctx.fillRect(x0 + POST / 2 - 0.9, fy - DOORH * 0.48 - 1, 0.8, 0.8);
    }
    if (o.door && o.door.side === s) {
      ctx.save(); ctx.globalAlpha = 0.55 + 0.45 * Math.sin(st.t * 8); ctx.strokeStyle = o.door.open ? LAMP : RED; ctx.lineWidth = 2.5; ctx.strokeRect(x0 - 1, y0 - 1, POST + 2, DOORH + 2); ctx.restore();
    }
  }
  // the ladder up to a hatch; where nothing meets it above, the hatch is boarded over. A hole down shows the ladder below's top
  const lx = cx + CW / 2 + LADX, up = room.up, upJ = up && gy > 0 && st.g[gy - 1][gx].down, downJ = room.down && gy + 1 < H && st.g[gy + 1][gx].up;
  // (the ladder is the 3D house's own, path-traced in this room's light and cut out: lit and dark, cross-faded)
  const lad = (sy, sh, dy, dh) => { const a = PL.img[room.name + "_ladder_dark"], b = PL.img[room.name + "_ladder_lit"]; ctx.drawImage(a, 0, sy * 2, 66, sh * 2, lx - 16.5, dy, 33, dh); if (lit > 0) { ctx.globalAlpha = lit; ctx.drawImage(b, 0, sy * 2, 66, sh * 2, lx - 16.5, dy, 33, dh); ctx.globalAlpha = 1; } };
  if (up) { lad(0, CH, cy, CH); if (!upJ) planks(lx, cyT + 1, L); else { ctx.fillStyle = "rgba(4,3,6,0.85)"; ctx.fillRect(lx - 14, cy - 1, 28, SLAB + 1); } }
  if (room.down) { ctx.fillStyle = "rgba(4,3,6,0.85)"; ctx.fillRect(lx - 14, fy, 28, SLAB + 1); if (downJ) lad(SLAB, 18, fy - 18, 18); else planks(lx, fy - 3, L); }
  ctx.restore();
  // the brass name plate on the floor's front edge: the 3D house's own, path-traced and cut out, lit by its room
  // (it stays put when the room turns over)
  ctx.drawImage(PL.img[room.name + "_plate_dark"], cx, cy + CH - PLATEH, CW, PLATEH);
  if (lit > 0) { ctx.globalAlpha = lit; ctx.drawImage(PL.img[room.name + "_plate_lit"], cx, cy + CH - PLATEH, CW, PLATEH); ctx.globalAlpha = 1; }
  if (room.lines.some((l) => l.kind === "lock")) { // the 3D house's brass padlock on the back wall (path-traced), with its enamel's glow
    const op = st.unlocked, px = cx + CW / 2 + 0.5 / PS, py = cy + CH - (op ? 1.273 : 1.225) / PS, w = 0.7 / PS, col = op ? "120,230,140" : "255,80,64";
    ctx.save(); ctx.globalCompositeOperation = "lighter"; const g = ctx.createRadialGradient(px, py, 2, px, py, 26); g.addColorStop(0, `rgba(${col},${0.35 + 0.15 * Math.sin(st.t * 4)})`); g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g; ctx.fillRect(px - 28, py - 28, 56, 56); ctx.restore();
    // hung on an iron hasp screwed to the wall, casting its own shadow there (so it's an object in the room, not a
    // sticker on the picture)
    ctx.save(); ctx.fillStyle = "#1b1612"; ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 3; ctx.shadowOffsetY = 1;
    ctx.fillRect(px - w * 0.13, py - w * 0.62, w * 0.26, w * 0.34); ctx.restore();
    ctx.fillStyle = "#5a4c3e"; for (const dy of [0.56, 0.36]) { ctx.beginPath(); ctx.arc(px, py - w * dy, 0.9, 0, 7); ctx.fill(); }
    const im = PL.img[op ? "lock_open" : "lock_shut"], sw = Math.sin(st.t * 1.7) * 0.03;
    ctx.save(); ctx.globalAlpha = 0.55; ctx.filter = "blur(2.5px) brightness(0)"; ctx.drawImage(im, px - w / 2 + 3, py - w / 2 + 4, w, w); ctx.restore();
    ctx.save(); ctx.translate(px, py - w * 0.42); ctx.rotate(sw); ctx.drawImage(im, -w / 2, -w / 2 + w * 0.42, w, w); ctx.restore();
  }
  if (st.page.id === room.id && !st.page.got) {
    const px = cx + CW * 0.36, py = fy - 4, k = 0.6 + 0.4 * Math.sin(st.t * 3 + 1);
    ctx.save(); ctx.globalCompositeOperation = "lighter"; const pg = ctx.createRadialGradient(px, py, 1, px, py, 26);
    pg.addColorStop(0, `rgba(255,240,200,${0.35 * k})`); pg.addColorStop(1, "rgba(255,240,200,0)"); ctx.fillStyle = pg; ctx.fillRect(px - 28, py - 28, 56, 56); ctx.restore();
    ctx.save(); ctx.translate(px, py); ctx.rotate(-0.08); ctx.fillStyle = shade([232, 220, 192], Math.max(L, 0.6));
    ctx.beginPath(); ctx.moveTo(-9, -2); ctx.lineTo(8, -3); ctx.lineTo(9, 1.5); ctx.lineTo(-8, 2); ctx.closePath(); ctx.fill(); ctx.restore();
  }
}
let woodP = null;
const woodPat = () => woodP || (woodP = ctx.createPattern(PL.img.wood, "repeat"));
// wood (the 3D house's ladder and door texture) in a shape, darkened to the room's light (ctx.filter isn't everywhere)
function woodRects(rects, k, tint = "#b08a62") {
  ctx.save(); ctx.beginPath(); for (const r of rects) ctx.rect(...r); ctx.clip();
  ctx.fillStyle = woodPat(); for (const r of rects) ctx.fillRect(...r);
  ctx.globalCompositeOperation = "multiply"; ctx.fillStyle = tint; for (const r of rects) ctx.fillRect(...r); // (the 3D house's stain on the bare wood)
  ctx.globalCompositeOperation = "source-over"; ctx.fillStyle = `rgba(8,5,3,${clamp(1 - k, 0, 1)})`; for (const r of rects) ctx.fillRect(...r); ctx.restore();
}
function planks(x, y, L) {
  woodRects([[x - 17, y, 34, 3]], 0.3 + 0.45 * L);
  ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(x - 17, y + 3, 34, 1); ctx.fillStyle = "rgba(20,14,10,0.8)"; for (const dx of [-12, 12]) ctx.fillRect(x + dx, y + 1, 1.2, 1.2);
}
// over the photographed house: lightning, and your own little lamp's warm light where you stand
function plateLight() {
  const pp = walkerPos(st.player), px = pp[0], py = pp[1] - 30, hot = HOT[st.floor] || HOT[1], f = flash();
  ctx.save(); ctx.globalCompositeOperation = "lighter";
  if (st.scene !== "end") { const g = ctx.createRadialGradient(px, py, 0, px, py, 90); g.addColorStop(0, `rgba(${hot},0.32)`); g.addColorStop(1, `rgba(${hot},0)`); ctx.fillStyle = g; ctx.fillRect(px - 100, py - 100, 200, 200); }
  if (f > 0) { ctx.fillStyle = `rgba(170,190,240,${0.35 * f})`; ctx.fillRect(HX, HY, HW, HH); }
  ctx.restore();
  // the lens: corners a little darker, as in the photographed still (the room pictures are cut without it)
  const v = ctx.createRadialGradient(HCX, HCY, 120, HCX, HCY, 520); v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,0.32)"); ctx.fillStyle = v; ctx.fillRect(HX, HY, HW, HH);
}
// a padlock hanging on the back wall: shackle, body, keyhole. Open (green) lifts its shackle.
function padlock(x, y, col, blur) {
  const up = st.unlocked ? 5 : 0;
  ctx.save(); ctx.shadowColor = col; ctx.shadowBlur = blur;
  ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(x - 5, y - 2 - up); ctx.lineTo(x - 5, y - 6 - up); ctx.arc(x, y - 6 - up, 5, Math.PI, 0); ctx.lineTo(x + 5, y - 2 - (st.unlocked ? 9 : 0)); ctx.stroke();
  ctx.fillStyle = col; ctx.beginPath(); ctx.roundRect(x - 8, y - 3, 16, 13, 2.5); ctx.fill();
  ctx.shadowBlur = 0; ctx.fillStyle = "rgba(20,6,6,0.85)"; ctx.beginPath(); ctx.arc(x, y + 2.5, 2, 0, 7); ctx.fill(); ctx.fillRect(x - 0.9, y + 3, 1.8, 4);
  ctx.fillStyle = "rgba(255,255,255,0.22)"; ctx.fillRect(x - 6.5, y - 1.5, 13, 1.5);
  ctx.restore();
}

const drawPlayer = (x, y) => plates() && DOLL.ok === 4 ? dollSprite(x, y) : art.player(ctx, x, y, st.t, !!st.player.way);
// the 3D house's peg doll, path-traced and cut out (tools/render/render.py SPRITE=1): straight on, turned each way, from behind
const DOLL = { ok: 0 }, DOLLW = 1.8 / PS; // (a little larger than true scale, so you can find yourself at a glance)
if (PL.on) for (const k of ["front", "right", "left", "back"]) { const im = new Image(); im.onload = () => DOLL.ok++; im.src = `assets/plates/doll_${k}.png`; DOLL[k] = im; }
function dollSprite(x, y) {
  const w = walkerInfo(st.player), walking = w.walking, bob = walking ? Math.abs(Math.sin(st.t * 16)) * 0.04 / PS : 0;
  const im = DOLL[w.climb ? "back" : w.dir > 0 ? "right" : w.dir < 0 ? "left" : "front"];
  ctx.save(); ctx.fillStyle = "rgba(0,0,0,0.4)"; ctx.beginPath(); ctx.ellipse(x, y, 9, 2.2, 0, 0, 7); ctx.fill(); // (where it stands)
  ctx.translate(x, y - bob); if (walking && !w.climb) ctx.rotate(Math.sin(st.t * 16) * 0.06);
  ctx.drawImage(im, -DOLLW / 2, -DOLLW + 0.05 / PS, DOLLW, DOLLW); ctx.restore();
}
function drawShadow(x, y) {
  const sh = st.shadow, pp = walkerPos(st.player), end = st.scene === "end";
  // in the dark you only see it when it is in your light, or when lightning shows it
  // awake, it never goes fully out: a faint shape stays (testers lost it in dark rooms and felt grabbed from nowhere)
  const seen = end ? 1 : Math.max(clamp(1.5 - Math.hypot(pp[0] - x, pp[1] - y) / 110, 0, 1), flash() * 0.9, sh.mode === "sleep" ? 0 : 0.3);
  // its cracks' red light shows on the floor even where it's too dark to see it
  if (!end && sh.mode !== "sleep" && seen < 1) art.emberGlow(ctx, x, y, st.t, (1 - seen) * (nearness() <= 1 ? 1 : 0.6));
  if (seen > 0) { ctx.save(); ctx.globalAlpha = seen; art.shadow(ctx, x, y, st.t, { asleep: sh.mode === "sleep", seep: sh.seep, near: nearness(), look: clamp((pp[0] - x) / 60, -1, 1), crouch: sh.lunge > 0, embers: sh.mode === "sleep" ? 0.2 : Math.max(seen, nearness() <= 1 ? 1 : 0.75) }); ctx.restore(); }
  if (end || sh.seep || art.twinReady()) return; // (the burnt twin has its own eyes; the red dots below are the old blob's)
  // two red eyes in the dark: shut while it sleeps, wider the closer it gets
  const ey = y - 44 + Math.sin(st.t * 1.4) * 2, lx = clamp((pp[0] - x) / 60, -1, 1) * 1.5, blink = Math.sin(st.t * 0.9 + x * 0.01) > 0.97;
  ctx.save(); ctx.shadowColor = "#ff2a1e";
  if (sh.mode === "sleep") { ctx.globalAlpha = 0.35 * (1 - seen); ctx.fillStyle = "#ff3b2e"; ctx.fillRect(x - 6 + lx, ey + 1, 4, 1); ctx.fillRect(x + 2 + lx, ey + 1, 4, 1); }
  else if (!blink) { const n = nearness(), r = n <= 1 ? 6 : 5; ctx.shadowBlur = n <= 1 ? 22 : 16;
    const hg = ctx.createRadialGradient(x + lx, ey + 2, 2, x + lx, ey + 2, 30); hg.addColorStop(0, `rgba(255,40,30,${n <= 1 ? 0.35 : 0.22})`); hg.addColorStop(1, "rgba(255,40,30,0)"); ctx.fillStyle = hg; ctx.fillRect(x + lx - 30, ey - 28, 60, 60); ctx.fillStyle = "#ff3b2e"; ctx.fillRect(x - 3 - r + lx, ey, r, r - 1); ctx.fillRect(x + 2.5 + lx, ey, r, r - 1); }
  ctx.restore();
}
// the ways you can walk, drawn on the house: open doorways glow, ladders and floor holes get arrows
// (testers couldn't tell an open doorway or which way a ladder went in the photographed rooms)
function drawWays() {
  const me = st.player.id, rs = reach(st.g, me), seen = new Set(), pulse = 0.5 + 0.5 * Math.sin(st.t * 4);
  for (const id of rs) {
    const a = find(st.g, id), here = id === me;
    for (const [nx, ny] of nbrs(st.g, a.x, a.y)) {
      const key = [a.x, a.y, nx, ny].sort().join(); if (seen.has(key)) continue; seen.add(key);
      const near = here || st.g[ny][nx].id === me, al = near ? 0.55 + 0.35 * pulse : 0.28;
      ctx.save(); ctx.globalAlpha = al; ctx.fillStyle = "#ffdca0"; ctx.strokeStyle = "#ffdca0"; ctx.lineWidth = 3;
      if (ny === a.y) { // an open doorway: lamplight spilling through it onto the floor on both sides (not a lit bar
        // standing in the wall: the critic read that as a UI pillar)
        const wx = HX + Math.max(a.x, nx) * CW, fy = HY + a.y * CH + CH - 12;
        ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = al * 0.8;
        const gl = ctx.createRadialGradient(wx, fy, 2, wx, fy, 46); gl.addColorStop(0, "rgba(255,196,120,0.75)"); gl.addColorStop(0.5, "rgba(255,170,90,0.25)"); gl.addColorStop(1, "rgba(255,170,90,0)");
        ctx.save(); ctx.translate(wx, fy); ctx.scale(1, 0.32); ctx.translate(-wx, -fy); ctx.fillStyle = gl; ctx.fillRect(wx - 48, fy - 48, 96, 96); ctx.restore();
        const sl = ctx.createLinearGradient(0, fy - CH * 0.45, 0, fy); sl.addColorStop(0, "rgba(255,200,130,0)"); sl.addColorStop(1, "rgba(255,200,130,0.35)"); ctx.fillStyle = sl; ctx.fillRect(wx - 3, fy - CH * 0.45, 6, CH * 0.45);
      } else { // a ladder or a hole: an arrow across the floor line, pointing the way it goes from where you are
        const up = ny < a.y, fx = HX + a.x * CW + CW * 0.78, fy = HY + Math.max(a.y, ny) * CH;
        const dir = here ? (up ? -1 : 1) : st.g[ny][nx].id === me ? (up ? 1 : -1) : 0;
        const tri = (cy, d) => { ctx.beginPath(); ctx.moveTo(fx, cy + d * 9); ctx.lineTo(fx - 9, cy - d * 5); ctx.lineTo(fx + 9, cy - d * 5); ctx.closePath(); ctx.fill(); };
        ctx.fillStyle = "rgba(10,6,8,0.6)"; ctx.beginPath(); ctx.arc(fx, fy, 15, 0, 7); ctx.fill(); ctx.fillStyle = "#ffdca0";
        if (dir) tri(fy + dir * 2, dir); else { tri(fy - 6, -1); tri(fy + 6, 1); }
      }
      ctx.restore();
    }
  }
}
// why you can't walk to a room: the closest you can get, and the wall, floor or ceiling in the way
function whyNoWay(fromId, toId) {
  const t = find(st.g, toId); let best = null, bd = 1e9;
  for (const id of reach(st.g, fromId)) { const p = find(st.g, id), d = Math.abs(p.x - t.x) + Math.abs(p.y - t.y); if (d < bd) { bd = d; best = p; } }
  const a = st.g[best.y][best.x], from = best.x === find(st.g, fromId).x && best.y === find(st.g, fromId).y ? "this room" : `the ${a.name}`;
  let why;
  if (best.x !== t.x) { const d = Math.sign(t.x - best.x), b = st.g[best.y][best.x + d], side = d > 0 ? "east" : "west", far = d > 0 ? "west" : "east";
    why = !(d > 0 ? a.r : a.l) ? `${from} has its ${side} door shut` : `the ${b.name} next to it has a wall on its ${far} side`;
  } else { const d = Math.sign(t.y - best.y), b = st.g[best.y + d][best.x];
    why = d < 0 ? (!a.up ? `${from} has no ladder up` : `the ${b.name} above has no hole in its floor`) : (!a.down ? `${from} has no hole in its floor` : `the ${b.name} below has no ladder up`);
  }
  return `No way there yet: ${why}. Change a step to open it.`;
}
// a hint stays in sight while the page is showing something else
function drawHintBanner() {
  ctx.save(); ctx.font = `italic 15px ${SERIF}`; const lines = [], words = st.hint.text.split(" "); let line = "";
  for (const w of words) { const t = line ? line + " " + w : w; if (ctx.measureText(t).width > HW - 30 && line) { lines.push(line); line = w; } else line = t; } if (line) lines.push(line);
  const h = lines.length * 18 + 10, y = HY - h - 4;
  ctx.fillStyle = "rgba(10,6,8,0.85)"; ctx.fillRect(HX, y, HW, h); ctx.fillStyle = YEL; lines.forEach((l, i) => ctx.fillText(l, HX + 15, y + 18 + i * 18)); ctx.restore();
}
// how many rooms the shadow is from you along open ways (Infinity: asleep, or no way through)
function nearness() {
  if (st.shadow.mode === "sleep") return Infinity;
  const p = path(st.g, st.shadow.id, st.player.id); return p ? p.length - 1 : Infinity;
}

// One way to mark a room, everywhere: its light warms from inside, and a soft hand-drawn line goes round it (not a
// hard UI rectangle: the critics read three different box styles as web-app chrome). dash: a lighter, broken line.
function outlineSlot(x, y, color, dash) {
  const x0 = HX + x * CW + 6, y0 = HY + y * CH + 6, w = CW - 12, h = CH - 12;
  ctx.save(); ctx.globalCompositeOperation = "lighter";
  const g = ctx.createRadialGradient(x0 + w / 2, y0 + h * 0.6, 10, x0 + w / 2, y0 + h * 0.6, w * 0.7); g.addColorStop(0, dash ? "rgba(255,200,130,0.10)" : "rgba(255,200,130,0.2)"); g.addColorStop(1, "rgba(255,200,130,0)");
  ctx.fillStyle = g; ctx.fillRect(x0, y0, w, h); ctx.restore();
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = dash ? 1.4 : 2; ctx.lineCap = ctx.lineJoin = "round"; ctx.shadowColor = color; ctx.shadowBlur = 6;
  if (dash) ctx.setLineDash([10, 7]);
  let q = (x * 7 + y * 13 + 1) * 2654435761 % 2147483647; const j = () => { q = (q * 16807) % 2147483647; return (q / 2147483647 - 0.5) * 2.2; };
  ctx.beginPath(); const pts = [[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]];
  pts.forEach(([px, py], i) => { const [nx, ny] = pts[(i + 1) % 4]; if (!i) ctx.moveTo(px + j(), py + j()); for (let k = 1; k <= 4; k++) ctx.lineTo(px + (nx - px) * k / 4 + j(), py + (ny - py) * k / 4 + j()); });
  ctx.stroke(); ctx.restore();
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
// Pointing at the flip shows the house as it would be after it, so the green frames sit on the right rooms
// (a fresh player couldn't picture where they'd land from outlines on the house as it is)
const flipPeek = () => { const pv = st.preview; return pv && pv.g && pv.band && pv.band.kind === "flip" && !st.anim && st.scene === "play" ? pv.g : null; };
function drawHouse() {
  drawHouseNow();
  const hid = st.hover && (st.hover.type === "word" || (st.hover.type === "room" && st.hover.id !== st.player.id));
  if (st.hint && hid && st.scene === "play" && !flipPeek()) drawHintBanner();
  if (!flipPeek()) return;
  ctx.save(); ctx.font = `15px ${MONO}`; ctx.textAlign = "center"; const t = "upside down: where you'd be";
  const w = ctx.measureText(t).width + 16; ctx.fillStyle = "rgba(10,6,8,0.85)"; ctx.fillRect(HCX - w / 2, HY - 30, w, 22);
  ctx.fillStyle = YEL; ctx.fillText(t, HCX, HY - 14); ctx.restore();
}
function drawHouseNow() {
  const P = plates(), D3 = !P && in3d() && draw3d();
  if (P) ctx.drawImage(PL.img.shell, 0, 0, VW, VH);
  if (!D3 && !P) art.roof(ctx, { x: HX, y: HY, w: HW, h: HH }, st.t, HX + HW + 8);
  if (!D3 && !P && st.scene !== "end") { ctx.save(); ctx.fillStyle = `rgba(2,5,16,${0.8 - 0.5 * flash()})`; ctx.beginPath(); ctx.moveTo(HX - 22, HY); ctx.lineTo(HCX, HY - 62); ctx.lineTo(HX + HW + 22, HY); ctx.closePath(); ctx.fill();
    ctx.fillRect(HX + HW * 0.72 - 4, HY - 64, 32, 64); ctx.restore(); }
  ctx.save(); ctx.beginPath(); ctx.rect(HX, HY, HW, HH); ctx.clip();
  const pv = st.preview;
  // the flip: the house turns over (drawn as the new house, squashed from upside down to upright)
  let sy = 1;
  if (st.anim && st.anim.kind === "flip") sy = -Math.cos(Math.PI * ease(st.anim.t));
  else if (pv && pv.band && pv.band.kind === "flip") sy = 1 - 0.08 * (0.5 + 0.5 * Math.sin(st.t * 6));
  if (sy !== 1 && !D3) { ctx.translate(0, HCY); ctx.scale(1, sy); ctx.translate(0, -HCY); }
  if (!D3) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const room = st.g[y][x], o = {};
    if (pv && pv.roomId === room.id) { if (pv.door) o.door = pv.door; if (pv.light) o.lightPreview = 0.5 + 0.5 * Math.sin(st.t * 5); }
    for (const [cx, cy] of drawPositions({ x, y })) (P ? drawPlate : drawRoom)(room, cx, cy, o, x, y);
  }
  if (P) plateLight();
  else if (!D3) lampLight();
  // reach outlines
  // rooms you could walk to after the word: dashed. A lock in reach gets a solid double frame and a tag, so it
  // reads without telling red from green (about 1 in 12 men can't)
  if (pv && pv.reach) for (const id of pv.reach) {
    const p = find(pv.g, id), lock = st.h.lockIds.includes(id) && !st.unlocked;
    if (!lock) { outlineSlot(p.x, p.y, LAMP, true); continue; }
    outlineSlot(p.x, p.y, RED, false); ctx.save(); // (the paper tag below says it in words, so it doesn't rest on red alone)
    const tx = HX + p.x * CW + CW / 2, ty = HY + p.y * CH + CH - 22, bob = Math.sin(st.t * 6) * 2;
    // a little paper tag, like the sheet's own print
    ctx.font = `700 13px ${ROK}`; ctx.textAlign = "center"; const w = ctx.measureText("LOCK IN REACH").width + 16;
    ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 6; ctx.fillStyle = "#e9dcc0"; ctx.fillRect(tx - w / 2, ty - 14 + bob, w, 20); ctx.shadowBlur = 0;
    ctx.fillStyle = "#a3261b"; ctx.fillText("LOCK IN REACH", tx, ty + 1 + bob); ctx.textAlign = "left"; ctx.restore();
  }
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
  // the door is open but out of reach: its room pulses so you know where you need a way to (always, after a failed click: brighter)
  if (st.scene === "play" && st.unlocked && !st.finale && !reach(st.g, st.player.id).has(doorRoom())) outlineSlot(0, H - 1, `rgba(240,217,164,${(st.doorNag > 0 ? 0.6 : 0.25) + 0.3 * Math.sin(st.t * 6)})`, false);
  if (st.hint && st.hint.id != null) { const p = find(st.g, st.hint.id); outlineSlot(p.x, p.y, `rgba(255,211,106,${0.5 + 0.4 * Math.sin(st.t * 6)})`, false); }
  // shut in: its room gets a red frame and a bar that drains until it claws out
  if (st.scene === "play" && st.shadow.mode !== "sleep" && st.shadow.noPath > 0 && !st.shadow.way) {
    const p = find(st.g, st.shadow.id), k = 1 - st.shadow.noPath / TRAPS[st.floor - 1];
    outlineSlot(p.x, p.y, `rgba(240,217,164,${0.5 + 0.3 * Math.sin(st.t * 8)})`, true);
    void k; // (its countdown is typed on the page now: clawCount())
  }
  if (st.scene === "play" && !st.anim && !flipPeek()) drawWays();
  // figures
  const freed = st.scene === "end" && st.ending === "free";
  for (const [w, draw] of freed || D3 ? [] : [[st.shadow, drawShadow], [st.player, drawPlayer]]) {
    const p = walkerPos(w); draw(p[0], p[1]);
    const a = find(st.g, w.id), pos = drawPositions(a);
    if (pos.length > 1 && !w.way) { const d = [pos[1][0] - pos[0][0], pos[1][1] - pos[0][1]]; draw(p[0] + d[0], p[1] + d[1]); }
  }
  for (const d of st.dust) { ctx.fillStyle = `rgba(200,185,160,${0.6 * (1 - d.t / d.life)})`; ctx.fillRect(d.x, d.y, 2, 2); }
  // big chalk arrow for a slide preview
  if (pv && pv.band && (pv.band.kind === "row" || pv.band.kind === "col")) chalkArrow(pv.band, YEL);
  ctx.restore();
  // beams between rooms
  drawLookFrame(D3 || P);
  // front door, in the house's frame (bottom left)
  const fx = HX - 30, fy = HY + HH - 64, hov = st.hover && st.hover.type === "door";
  if (D3 || P) { // the door itself is in the 3D porch (or its picture); under the pointer it gets a frame
    if (P && st.unlocked) { ctx.save(); ctx.globalCompositeOperation = "lighter"; const g = ctx.createRadialGradient(fx + 13, fy + 30, 4, fx + 13, fy + 30, 60);
      g.addColorStop(0, `rgba(190,215,255,${0.45 + 0.1 * Math.sin(st.t * 3)})`); g.addColorStop(1, "rgba(190,215,255,0)"); ctx.fillStyle = g; ctx.fillRect(fx - 50, fy - 30, 126, 120); ctx.restore(); }
    if (hov) { ctx.save(); ctx.strokeStyle = st.unlocked ? "#ffdca0" : RED; ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 8; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.roundRect(fx - 3, fy - 3, 32, 66, 3); ctx.stroke(); ctx.restore(); }
  } else {
  ctx.fillStyle = "#1c1820"; ctx.fillRect(fx - 4, fy - 4, 34, 68);
  if (st.unlocked) {
    const g = ctx.createLinearGradient(fx, 0, fx + 26, 0); g.addColorStop(0, "rgba(220,230,255,0.9)"); g.addColorStop(1, "rgba(150,170,210,0.4)");
    ctx.fillStyle = g; ctx.fillRect(fx, fy, 26, 60);
    ctx.save(); ctx.shadowColor = "#cfe0ff"; ctx.shadowBlur = 18 + 8 * Math.sin(st.t * 3); ctx.strokeStyle = hov ? "#fff" : "rgba(220,230,255,0.8)"; ctx.lineWidth = 2; ctx.strokeRect(fx, fy, 26, 60); ctx.restore();
  } else {
    ctx.fillStyle = "#3a1e1a"; ctx.fillRect(fx, fy, 26, 60); ctx.fillStyle = "#b08a40"; ctx.fillRect(fx + 19, fy + 32, 3, 3);
    ctx.strokeStyle = hov ? RED : "rgba(255,90,78,0.4)"; ctx.lineWidth = 1.5; ctx.strokeRect(fx, fy, 26, 60);
  }
  }
  // an engraved brass plate over the door (not a floating neon label), brighter once it's open
  const bw = 66, bh = 15, bx = Math.max(fx + 13, bw / 2 + 4), by = fy - 15; // (kept inside the screen)
  ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.7)"; ctx.shadowBlur = 4; ctx.shadowOffsetY = 1;
  const bg = ctx.createLinearGradient(0, by - bh / 2, 0, by + bh / 2); const k = st.unlocked ? 1 : 0.62;
  bg.addColorStop(0, `rgb(${217 * k | 0},${184 * k | 0},${108 * k | 0})`); bg.addColorStop(1, `rgb(${142 * k | 0},${106 * k | 0},${44 * k | 0})`);
  ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(bx - bw / 2, by - bh / 2, bw, bh, 2); ctx.fill(); ctx.restore();
  ctx.fillStyle = "rgba(40,26,8,0.6)"; for (const sx2 of [-1, 1]) { ctx.beginPath(); ctx.arc(bx + sx2 * (bw / 2 - 4), by, 1.1, 0, 7); ctx.fill(); }
  ctx.font = `700 9px ${ROK}`; ctx.textAlign = "center"; if ("letterSpacing" in ctx) ctx.letterSpacing = "0.6px";
  ctx.fillStyle = "rgba(255,240,200,0.35)"; ctx.fillText("FRONT DOOR", bx, by + 3.6); ctx.fillStyle = "#2b1c08"; ctx.fillText("FRONT DOOR", bx, by + 3);
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px"; ctx.textAlign = "left";
}

// ---------- the 3D house ----------
// Tells src/dollhouse.js what to show this frame (the same things the flat drawing reads) and draws its picture
// into the canvas. Returns false if it couldn't, so the flat house draws instead.
function roomLit(room, o) {
  let lit = room.lights ? 1 : 0;
  if (o.lightPreview) lit = lerp(lit, 1 - lit, o.lightPreview);
  if (st.finale && st.scene === "play") lit = room.id === st.player.id || (st.finalePath && st.finalePath.includes(room.id)) ? 1 : 0;
  if (st.blackout > 0) lit *= st.blackout > 0.4 ? 0.1 : lerp(1, 0.1, st.blackout / 0.4);
  return lit;
}
function walkerInfo(w) {
  const [x, y] = walkerPos(w); let dir = 0, climb = false;
  if (w.way) { const a = w.way.pts[w.way.seg], b = w.way.pts[w.way.seg + 1]; const pa = screenPos(a.id, a.fx), pb = screenPos(b.id, b.fx); dir = Math.sign(pb[0] - pa[0]); climb = !!(a.v && b.v && a.id !== b.id); }
  return { x, y, dir, climb, walking: !!w.way };
}
function twinAt(w) {
  const a = find(st.g, w.id); if (!a || w.way) return null; const pos = drawPositions(a); if (pos.length < 2) return null;
  const p = walkerPos(w); return [p[0] + pos[1][0] - pos[0][0], p[1] + pos[1][1] - pos[0][1]];
}
function draw3d() {
  const pv = st.preview, rooms = [];
  // the flip tumbles the house end over end: the first half shows the house as it was, the second as it is now
  let flip = null, before = false;
  if (st.anim && st.anim.kind === "flip") { const a = Math.PI * ease(st.anim.t); before = a < Math.PI / 2; flip = before ? a : a - Math.PI; }
  else if (pv && pv.band && pv.band.kind === "flip") flip = 0.05 * (0.5 + 0.5 * Math.sin(st.t * 6));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const src = before ? st.g[H - 1 - y][x] : st.g[y][x], o = {};
    const room = before ? { ...src, up: src.down, down: src.up } : src;
    if (pv && pv.roomId === room.id) { if (pv.door) o.door = pv.door; if (pv.light) o.lightPreview = 0.5 + 0.5 * Math.sin(st.t * 5); }
    const ry = before ? H - 1 - y : y, above = y > 0 ? (before ? st.g[H - y][x] : st.g[y - 1][x]) : null, below = y + 1 < H ? (before ? st.g[H - 2 - y][x] : st.g[y + 1][x]) : null;
    rooms.push({ room, at: drawPositions({ x, y: before ? y : ry }), lit: roomLit(room, o), door: o.door || null, flipped: before ? !st.flipped : st.flipped,
      lock: room.lines.some((l) => l.kind === "lock"), unlocked: st.unlocked, page: st.page.id === room.id && !st.page.got,
      upJoined: !!(room.up && above && (before ? above.up : above.down)), downJoined: !!(room.down && below && (before ? below.down : below.up)) });
  }
  const freed = st.scene === "end" && st.ending === "free", pl = walkerInfo(st.player), sh = walkerInfo(st.shadow);
  const seen = st.scene === "end" ? 1 : Math.max(clamp(1.5 - Math.hypot(pl.x - sh.x, pl.y - sh.y) / 110, 0, 1), flash() * 0.9);
  const view = {
    t: st.t, flash: flash(), flip, dim: st.scene === "title" ? 0.8 : 1, photo: PHOTO || st.scene === "title" || st.scene === "floor", unlocked: st.unlocked, rooms,
    player: { ...pl, hidden: freed || (flip != null && Math.abs(flip) > 0.1) },
    shadow: { ...sh, hidden: freed || st.shadow.seep || (flip != null && Math.abs(flip) > 0.1), seen, asleep: st.shadow.mode === "sleep", near: nearness() },
    twin: { player: twinAt(st.player), shadow: twinAt(st.shadow) },
  };
  // no more pixels than the screen shows; fewer when frames run slow (see frame())
  const r = cv.getBoundingClientRect(), k = [1, 0.75, 0.6][dh.getQuality()], dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(320, Math.round(Math.min(cv.width, r.width * dpr) * k)), h = Math.round(w * VH / VW);
  const img = dh.render(view, w, h); if (!img) return false;
  ctx.drawImage(img, 0, 0, VW, VH);
  return true;
}
// look prototypes: wooden doll's-house frame, beams, and one brass plaque under the house for floor/moves/pages
function drawLookFrame(D3) {
  if (!D3) {
    for (let x = 1; x < W; x++) beam(ctx, HX + x * CW - 3, HY, 6, HH);
    for (let y = 1; y < H; y++) beam(ctx, HX, HY + y * CH - 3, HW, 6);
    woodFrame(ctx, HX, HY, HW, HH, 14);
  }
  if (st.scene === "end") return; // (the plaque leaves with the sheet: the ending has its own words)
  const txt = `Floor ${st.floor} of ${FLOORS}   ·   steps changed ${st.moves} (fewest ${st.h.par})   ·   torn pages ${st.pages} of 3`;
  // it steps aside while the house is talking (the house's line is typed in the same spot)
  const v = st.voice, talk = v && (st.scene === "play" || st.scene === "caught") ? clamp(Math.min(v.t * 4, (v.len - v.t) / 0.6), 0, 1) : 0;
  if (talk >= 1) return;
  ctx.save(); ctx.globalAlpha = 1 - talk;
  // (Caslon: its 0 is a zero; the old face's 0 read as the letter o)
  ctx.font = `italic 15px ${CAS}`; const tw = ctx.measureText(txt).width + 40, px = HCX - tw / 2, py = HY + HH + 18;
  const b = ctx.createLinearGradient(0, py, 0, py + 24); b.addColorStop(0, "#d9b86c"); b.addColorStop(1, "#8e6a2c"); ctx.fillStyle = b; ctx.beginPath(); ctx.roundRect(px, py, tw, 24, 4); ctx.fill();
  ctx.strokeStyle = "rgba(60,40,10,0.7)"; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = "#2b1c08"; ctx.textAlign = "center"; ctx.fillText(txt, HCX, py + 17); ctx.textAlign = "left";
  ctx.restore();
}
// ---------- the code panel ----------
const DIR = { row: { 1: "east", [-1]: "west" }, col: { 1: "down", [-1]: "up" } };
// a line: [before, words, after]; each word {text, dir}
function lineParts(room, c, self) {
  const who = self ? "this" : room.name;
  if (c.kind === "row") return [`${who}.row.shift(`, [{ text: "west", dir: -1 }, { text: "east", dir: 1 }], ")"];
  if (c.kind === "col") return [`${who}.column.shift(`, [{ text: "up", dir: -1 }, { text: "down", dir: 1 }], ")"];
  // doors and lights read like the other lines: both words typed, and the one that's true now is plain ink (not a choice)
  if (c.kind === "door") { const o = room[c.side === "west" ? "l" : "r"]; return [`${who}.door.${c.side} = `, [{ text: "open", dir: o ? 0 : 1, cur: o }, { text: "shut", dir: o ? 1 : 0, cur: !o }], ";"]; }
  if (c.kind === "swap") return [`${who}.swap(`, [{ text: "west", dir: -1 }, { text: "east", dir: 1 }], ")"];
  if (c.kind === "flip") { const o = st.flipped; return ["house.upsideDown = ", [{ text: "true", dir: o ? 0 : 1, cur: o }, { text: "false", dir: o ? 1 : 0, cur: !o }], ";"]; }
  if (c.kind === "lights") { const o = room.lights; return [`${who}.lights = `, [{ text: "on", dir: o ? 0 : 1, cur: o }, { text: "off", dir: o ? 1 : 0, cur: !o }], ";"]; }
  if (c.kind === "lock") return ["frontDoor.locked = ", [{ text: st.unlocked ? "false" : "true" }], ";"];
}
const flat = (parts) => parts[0] + parts[1].map((w) => w.text).join("|") + parts[2];
function plain(room, c, dir) {
  if (c.kind === "row") return `Slides this whole row of rooms one step ${DIR.row[dir]}. You ride along. The lit frames show the rooms you could walk to after.`;
  if (c.kind === "col") return `Slides this whole column of rooms one step ${DIR.col[dir]}. You ride along. The lit frames show the rooms you could walk to after.`;
  if (c.kind === "door") return room[c.side === "west" ? "l" : "r"] ? `Shuts this room's ${c.side} door. Nothing gets through a shut door: not you, not it. Shut it in and it has to claw its way out.` : `Opens this room's ${c.side} door.`;
  if (c.kind === "swap") return `Trades this room with the one to its ${DIR.row[dir]} (wrapping round the ends). You move with it. The lit frames show the rooms you could walk to after.`;
  if (c.kind === "flip") return "Turns the whole house over. The top floor goes to the bottom, and ladders become holes in the floor. The lit frames show the rooms you could walk to after.";
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
// The living page. Everything here is ink on the paper, drawn under the typed text (multiplied in), so the circled
// words always sit sharp on top.
// - a stain in the left margin by the line you changed: wet black ink spreading along the grain, drying to brown with a
//   darker tide ring, and it stays all floor (one more each time you change that line)
// - while the shadow is near, wet ink drips straight down from the letters: none 3+ rooms away, a few at 2, many at 1;
//   when it backs off they stop and dry to brown streaks that stay until the next floor
function blob(cx, cy, r, seed, n = 22, rough = 0.42) {
  ctx.beginPath();
  for (let i = 0; i <= n; i++) { const a = (i / n) * 6.283, k = 1 - rough * 0.66 + rough * hash01(seed + (i % n) * 13.7) + 0.12 * Math.sin(a * 3 + seed); ctx.lineTo(cx + Math.cos(a) * r * k * 1.15, cy + Math.sin(a) * r * k * 0.85); }
  ctx.closePath();
}
function drawStains() {
  ctx.save(); ctx.beginPath(); ctx.rect(PX - 16, 22, 15, VH - 44); ctx.clip(); // the margin only: never on the words
  for (const sn of st.stains || []) {
    const k = 1 - Math.pow(1 - clamp(sn.t / 0.35, 0, 1), 3), wet = clamp(1 - (sn.t - 0.3) / 1.8, 0, 1), r = sn.r * (0.3 + 0.7 * k), tall = sn.tall || 1;
    const col = (a) => `rgba(${Math.round(24 + 86 * (1 - wet))},${Math.round(16 + 44 * (1 - wet))},${Math.round(12 + 14 * (1 - wet))},${a})`;
    ctx.save(); ctx.translate(sn.x, sn.y); ctx.scale(1, tall);
    const ro = sn.rough ?? 0.42, nn = sn.n || 22;
    ctx.fillStyle = col(0.22 + 0.2 * wet); blob(0.8, 0.6, r * 1.45, sn.seed + 5, nn, ro * 1.3); ctx.fill(); // it feathers out into the paper
    ctx.fillStyle = col(0.55 + 0.35 * wet); blob(0, 0, r, sn.seed, nn, ro); ctx.fill();
    ctx.strokeStyle = col(0.5 + 0.4 * (1 - wet)); ctx.lineWidth = 1.3 / tall; blob(0, 0, r * 1.03, sn.seed, nn, ro); ctx.stroke(); // the tide line, darkest once dry
    ctx.restore();
    for (let i = 0; i < 3; i++) if (hash01(sn.seed + i * 7) < 0.6) { const a = hash01(sn.seed + i * 5) * 6.283, d = r * (1.5 + hash01(sn.seed + i) * 1.4); ctx.fillStyle = col(0.5 + 0.3 * wet); ctx.beginPath(); ctx.arc(sn.x + Math.cos(a) * d * 0.6, sn.y + Math.sin(a) * d * tall, 0.5 + hash01(sn.seed + i * 3) * 1.3, 0, 7); ctx.fill(); } // flecks thrown off
    // what didn't soak in runs a little way down the margin, and dries there
    const rl = (sn.run || 0) * clamp((sn.t - 0.2) / 1.2, 0, 1), rx = sn.x + (hash01(sn.seed) - 0.5) * r;
    if (rl > 1) { const y0 = sn.y + r * tall * 0.7, w = 1.6 + hash01(sn.seed + 2) * 1.4; ctx.fillStyle = col(0.6 + 0.3 * wet); ctx.beginPath(); ctx.moveTo(rx - w / 2, y0); ctx.lineTo(rx + w / 2, y0); ctx.lineTo(rx + w * 0.3, y0 + rl); ctx.lineTo(rx - w * 0.3, y0 + rl); ctx.fill(); ctx.beginPath(); ctx.ellipse(rx, y0 + rl, w * 0.75, w, 0, 0, 7); ctx.fill(); }
  }
  ctx.restore();
  // the clicked word's own ink, wet for a moment before the line types itself clean again
  const sm = st.smear; if (sm) { const a = 0.5 * (1 - sm.t / 0.6); ctx.fillStyle = `rgba(30,22,18,${a})`; blob(sm.x + sm.w / 2, sm.y + sm.h * 0.55, sm.w * 0.5, 77); ctx.fill(); }
}
const DRIP_MAX = 32;
function dripLevel() { if (st.scene !== "play" || st.shadow.mode === "sleep") return 0; const n = nearness(); return n <= 1 ? 1 : n === 2 ? 0.3 : 0; }
function pageInk(dt) {
  if (!st.drips) st.drips = [];
  const lvl = dripLevel(); st.dripK = (st.dripK || 0) + (lvl - (st.dripK || 0)) * Math.min(1, dt * 2.5);
  // new drips start at the bottom of a typed letter in one of your room's lines
  if (lvl > 0 && st.lineBoxes && st.lineBoxes.length && st.drips.length < DRIP_MAX && Math.random() < dt * 4.5 * lvl) {
    const gl = st.glyphs && st.glyphs.length ? st.glyphs[(Math.random() * st.glyphs.length) | 0] : null, L = st.lineBoxes[(Math.random() * st.lineBoxes.length) | 0];
    const r = Math.random(); // mostly thin runs, now and then a heavy one
    const x0 = gl ? gl.x + (Math.random() - 0.5) * gl.w * 0.5 : L.x + 4 + Math.random() * (L.w - 24), y0 = gl ? gl.y + 2 : L.y + 2;
    const below = (st.textBands || []).filter((b) => b.top > y0 + 4).map((b) => b.top).sort((a, b) => a - b)[0]; // the next line of type down
    st.drips.push({ x: x0, y: y0, stopAt: below != null ? below - y0 - 4 : null, // it never runs through another line: it gathers on top of it
       len: 0, max: 8 + Math.pow(Math.random(), 1.4) * 230, w: 1 + r * r * 5.5, pool: 0.6 + Math.random() * 1.6, seed: (Math.random() * 1e4) | 0, sp: 10 + Math.random() * 34, wet: 1, ph: Math.random() * 6 });
  }
  for (const d of st.drips) {
    if (d.stopAt != null) d.max = Math.min(d.max, d.stopAt); // it gathers on top of the next line of type
    if (lvl > 0 && d.len < d.max) d.len = Math.min(d.max, d.len + d.sp * dt * (0.4 + 0.6 * st.dripK));
    d.wet = lvl > 0 ? Math.min(1, d.wet + dt) : Math.max(0, d.wet - dt / 3);
    d.len = Math.min(d.len, VH - 30 - d.y); // it stops at the bottom of the sheet
  }
}
function drawDrips() {
  if (!(st.drips || []).length) return;
  // the words you can click stay clear: the ink runs behind them, never over them
  ctx.save(); ctx.beginPath(); ctx.rect(PX - 16, 22, PW + 26, VH - 44);
  for (const r of st.clearRects || st.wordRects || []) ctx.rect(r.x + r.w + 3, r.y - 3, -(r.w + 6), r.h + 6); // (wound the other way: a hole)
  ctx.clip("nonzero");
  for (const d of st.drips) {
    if (d.len < 1) continue;
    const col = (a) => `rgba(${Math.round(96 + 18 * (1 - d.wet))},${Math.round(10 + 64 * (1 - d.wet))},${Math.round(10 + 34 * (1 - d.wet))},${a})`; // oxblood wet, brown once dry
    const n = Math.max(2, Math.ceil(d.len / 4)), pts = [];
    for (let i = 0; i <= n; i++) { const t = i / n, y = d.y + d.len * t; pts.push([d.x + Math.sin(d.ph + y / 37) * 0.9 + Math.sin(d.ph * 2 + y / 11) * 0.3, y, d.w * (0.45 + 0.55 * Math.min(1, t * 2.5)) * (1 - 0.25 * t) * (0.8 + 0.2 * Math.sin(d.ph + y / 6) + 0.12 * Math.sin(d.ph * 3 + y / 2.3))]); }
    const shape = (grow) => { ctx.beginPath(); pts.forEach(([x, y, w], i) => (i ? ctx.lineTo(x + w * grow / 2, y) : ctx.moveTo(x + w * grow / 2, y))); for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(pts[i][0] - pts[i][2] * grow / 2, pts[i][1]); ctx.fill(); };
    const dry = 1 - d.wet, g = 1 - 0.14 * dry; // drying, it shrinks back a little and leaves a darker edge
    ctx.fillStyle = col(0.08 + 0.08 * d.wet); shape(2.4 * g); // it soaks sideways into the fibres
    ctx.fillStyle = col(0.45 + 0.4 * d.wet - 0.12 * dry); shape(g);
    if (dry > 0.3) { ctx.strokeStyle = col(0.35 * dry); ctx.lineWidth = 0.5; ctx.beginPath(); pts.forEach(([x, y, w], i) => (i ? ctx.lineTo(x + w * g / 2, y) : ctx.moveTo(x + w * g / 2, y))); ctx.stroke(); ctx.beginPath(); pts.forEach(([x, y, w], i) => (i ? ctx.lineTo(x - w * g / 2, y) : ctx.moveTo(x - w * g / 2, y))); ctx.stroke(); } // the tide line down each side
    const [ex, ey, ew] = pts[pts.length - 1], pooled = d.stopAt != null && d.len >= d.stopAt - 0.5, sd = d.seed || 3;
    if (pooled) { // it gathers along the top of the next line of type: a flat little puddle, wider than the run
      const pw = Math.max(3, d.w * (1.6 + (d.pool || 1))), ph = Math.max(1.6, d.w * 0.7);
      ctx.save(); ctx.translate(ex, ey - ph * 0.3); ctx.scale(1, 0.5); ctx.fillStyle = col(0.08); blob(0, 0, pw * 1.3 * g, sd + 1, 16, 0.5); ctx.fill(); ctx.restore();
      ctx.save(); ctx.translate(ex, ey - ph * 0.5); ctx.scale(1, ph / pw); ctx.fillStyle = col(0.5 + 0.4 * d.wet - 0.1 * dry); blob(0, 0, pw * g, sd, 16, 0.35); ctx.fill(); ctx.restore();
    } else { // a drop hangs at the tip, heavier once it stops
      const b = ew * (d.len >= d.max ? 1.5 : 1.15) * g;
      ctx.save(); ctx.translate(ex, ey + b * 0.2); ctx.scale(0.85, 1.15); ctx.fillStyle = col(0.5 + 0.4 * d.wet - 0.1 * dry); blob(0, 0, b, sd, 12, 0.22); ctx.fill(); ctx.restore();
      if (d.wet > 0.5) { ctx.fillStyle = `rgba(255,250,235,${0.22 * d.wet})`; ctx.beginPath(); ctx.ellipse(ex - b * 0.3, ey, b * 0.22, b * 0.32, 0, 0, 7); ctx.fill(); } // wet ink catches the light
    }
  }
  ctx.restore();
}
// the sheet's outer edges darken as the shadow closes in
function drawEdgeDark() {
  const k = st.dripK || 0; if (k < 0.02) return;
  const x = PX - 16, y = 22, w = PW + 26, h = VH - 44, g = ctx.createRadialGradient(x + w / 2, y + h / 2, Math.min(w, h) * 0.32, x + w / 2, y + h / 2, Math.max(w, h) * 0.62);
  g.addColorStop(0, "rgba(60,36,20,0)"); g.addColorStop(1, `rgba(60,36,20,${0.55 * k})`); ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
}
const hash01 = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
// The sheet beside the house: the doll's house's own assembly instructions, printed in black and one red, folded,
// taped to the desk. The paper is a photograph (assets/sheet/, path-traced in Blender); everything printed on it is
// drawn here, so it can change. Each step in your room is a choice: tick a box to change the house.
const SX = PX - 16, SY = 22, SHW = PW + 26, SHH = VH - 44; // the sheet's rect (304 x 556)
const TITLE_IMG = { im: new Image(), ok: false }; TITLE_IMG.im.onload = () => { TITLE_IMG.ok = true; }; TITLE_IMG.im.src = "assets/title/house.jpg";
const SHEET = { img: {}, ok: {} };
for (const k of ["blank", "slip", "plain"]) { const im = new Image(); im.onload = () => { SHEET.ok[k] = true; }; im.src = `assets/sheet/${k}.png`; SHEET.img[k] = im; }
const sheetReady = (k = "blank") => !!SHEET.ok[k];
const PRINT = { K: "#1f1914", R: "#a3261b", DIM: "rgba(40,30,22,0.55)", PENCIL: "rgba(62,58,54,0.85)" };
const ROK = '"Rokkitt", Georgia, serif', CAS = '"Libre Caslon Text", Georgia, serif', HAND = '"Caveat", "Comic Sans MS", cursive';
const sx = (x) => SX + x, sy = (y) => SY + y;
function pfont(f, track = 0) { ctx.font = f; if ("letterSpacing" in ctx) ctx.letterSpacing = `${track}px`; }
const STEP_NO = (room, li) => li + 1; // (numbered from 1 in each room: "19, 20" read as unexplained codes)
// a step, in words: its lead, and its boxes (cur: what's true now, ticked in pencil, not a choice)
function stepView(room, c) {
  const S = (s) => s[0].toUpperCase() + s.slice(1);
  if (c.kind === "row") return { lead: "Slide this row", ch: [{ t: "WEST", dir: -1 }, { t: "EAST", dir: 1 }] };
  if (c.kind === "col") return { lead: "Slide this column", ch: [{ t: "UP", dir: -1 }, { t: "DOWN", dir: 1 }] };
  if (c.kind === "door") { const o = room[c.side === "west" ? "l" : "r"]; return { lead: `${S(c.side)} door`, ch: [{ t: "OPEN", dir: o ? 0 : 1, cur: o }, { t: "SHUT", dir: o ? 1 : 0, cur: !o }] }; }
  if (c.kind === "swap") return { lead: "Swap rooms with", ch: [{ t: "WEST", dir: -1 }, { t: "EAST", dir: 1 }] };
  if (c.kind === "flip") { const o = st.flipped; return { lead: "The house stands", ch: [{ t: "UPRIGHT", dir: o ? 1 : 0, cur: !o }, { t: "UPSIDE DOWN", dir: o ? 0 : 1, cur: o }] }; }
  if (c.kind === "lights") { const o = room.lights; return { lead: "Lights", ch: [{ t: "ON", dir: o ? 0 : 1, cur: o }, { t: "OFF", dir: o ? 1 : 0, cur: !o }] }; }
  if (c.kind === "lock") return { lead: "Front door", red: true, ch: [{ t: st.unlocked ? "UNLOCKED" : "UNLOCK", dir: 1, cur: st.unlocked }] };
}
const stepWord = (room, c, dir) => { const v = stepView(room, c), w = v.ch.find((x) => !x.cur && (x.dir ?? 1) === dir) || v.ch.find((x) => (x.dir ?? 1) === dir); return w ? w.t : ""; };
// what the house changed, as an erratum: "Step 20, Kitchen west door: now SHUT"
function errata(m) {
  const room = byId(st.g, m.id); if (!room || !room.lines[m.li]) return null;
  const c = room.lines[m.li], v = stepView(room, c);
  const w = c.kind === "door" ? (room[c.side === "west" ? "l" : "r"] ? "SHUT" : "OPEN") : stepWord(room, c, m.dir);
  const lead = c.kind === "door" ? `${room.name[0].toUpperCase() + room.name.slice(1)}, ${c.side} door` : `${room.name[0].toUpperCase() + room.name.slice(1)}: ${v.lead.toLowerCase()}`;
  return { no: STEP_NO(room, m.li), lead, w };
}
let NATIVE_FILL = CanvasRenderingContext2D.prototype.fillText;
let typedTap = null; // (checks read the page's lines from here)
function printed(text, x, y) { text = String(text); if (typedTap) typedTap.push(text); NATIVE_FILL.call(ctx, text, x, y); }
function pwrap(text, x, y, maxW, lh, bottom = 1e9, narrowFrom = 1e9, narrowW = maxW) {
  // lay the words out first; if the last line would fall past the bottom, step the type down until it all fits,
  // so a line is never silently dropped (CH 11-20 saw "You go with" cut off mid-sentence)
  const lay = (lh2) => { const out = []; let line = "", yy = y; const mw = () => (yy > narrowFrom ? narrowW : maxW);
    for (const w of text.split(" ")) { const t = line ? line + " " + w : w; if (ctx.measureText(t).width > mw() && line) { out.push([line, yy]); yy += lh2; line = w; } else line = t; }
    if (line) out.push([line, yy]); return out; };
  const font0 = ctx.font, m = /(\d+(?:\.\d+)?)px/.exec(font0); let size = m ? +m[1] : 0, l2 = lh, out = lay(l2);
  while (size > 9 && out.length && out[out.length - 1][1] > bottom) { size -= 0.5; l2 = lh * size / +m[1]; ctx.font = font0.replace(m[0], size + "px"); out = lay(l2); }
  for (const [t, yy] of out) ctx.fillText(t, x, yy);
  ctx.font = font0; return (out.length ? out[out.length - 1][1] : y - l2) + l2;
}
function rule(y, w = 1, x0 = 16, x1 = SHW - 16) { ctx.fillRect(sx(x0), sy(y) - w / 2, x1 - x0, w); }
function pencilTick(x, y, a = 1) { // a quick graphite tick in a box whose bottom-left is (x, y)
  ctx.save(); ctx.strokeStyle = PRINT.PENCIL; ctx.globalAlpha *= a; ctx.lineWidth = 1.5; ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.beginPath(); ctx.moveTo(x + 1.5, y - 4.5); ctx.quadraticCurveTo(x + 3, y - 2, x + 4, y - 0.5); ctx.quadraticCurveTo(x + 7, y - 7, x + 11.5, y - 12.5); ctx.stroke(); ctx.restore();
}
function diagram(kind, y) { // the little printed figure beside a step
  ctx.save(); ctx.strokeStyle = PRINT.K; ctx.fillStyle = PRINT.K; ctx.lineWidth = 0.8;
  const arrow = (x0, y0, x1, y1) => { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); const a = Math.atan2(y1 - y0, x1 - x0); ctx.beginPath(); ctx.moveTo(x1 + Math.cos(a) * 2, y1 + Math.sin(a) * 2); ctx.lineTo(x1 - Math.cos(a - 0.45) * 6, y1 - Math.sin(a - 0.45) * 6); ctx.lineTo(x1 - Math.cos(a + 0.45) * 6, y1 - Math.sin(a + 0.45) * 6); ctx.fill(); };
  if (kind === "row" || kind === "swap") {
    const x0 = sx(234);
    if (kind === "row") { for (let k = 0; k < 3; k++) ctx.strokeRect(x0 + k * 15, y + 2, 13, 11); arrow(x0 + 20, y + 7.5, x0 - 10, y + 7.5); arrow(x0 + 24, y + 7.5, x0 + 56, y + 7.5); }
    else { ctx.strokeRect(x0 + 6, y + 2, 15, 11); ctx.strokeRect(x0 + 25, y + 2, 15, 11); ctx.beginPath(); ctx.arc(x0 + 23, y + 3, 10, Math.PI * 1.12, Math.PI * 1.88); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x0 + 13, y - 2); ctx.lineTo(x0 + 11, y + 2.5); ctx.lineTo(x0 + 16.5, y + 0.5); ctx.fill(); ctx.beginPath(); ctx.moveTo(x0 + 33, y - 2); ctx.lineTo(x0 + 35, y + 2.5); ctx.lineTo(x0 + 29.5, y + 0.5); ctx.fill(); }
  } else if (kind === "col") {
    const x0 = sx(252); for (let k = 0; k < 3; k++) ctx.strokeRect(x0, y - 14 + k * 10, 14, 9); arrow(x0 + 20, y + 1, x0 + 20, y - 18); arrow(x0 + 20, y + 3, x0 + 20, y + 22);
  } else if (kind === "door") {
    const x0 = sx(250); ctx.strokeRect(x0, y - 4, 26, 20); ctx.beginPath(); ctx.arc(x0, y + 16, 12, -Math.PI / 2, 0); ctx.setLineDash([2, 2]); ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.restore();
}
function drawPanel() {
  const jy = (st.jolt || 0) * 1.6; ctx.save(); ctx.translate(0, jy); // the sheet jumps when the house strikes
  if (sheetReady()) ctx.drawImage(SHEET.img.blank, SX - 6, SY - 8, SHW + 12, SHH + 16); else LOOK.panelBg(ctx, SX, SY, SHW, SHH);
  ctx.save(); ctx.globalCompositeOperation = "multiply"; drawEdgeDark(); drawStains(); drawDrips(); ctx.restore();
  ctx.fillText = printed; // (only while the sheet prints: an own property over the prototype's, deleted after)
  try { ctx.save(); ctx.globalCompositeOperation = "multiply"; panelBody(); ctx.restore(); }
  finally { delete ctx.fillText; if ("letterSpacing" in ctx) ctx.letterSpacing = "0px"; }
  ctx.restore();
}
// shut in: how long until it claws out (the number goes down a second at a time)
// on a phone there's no pointer to hover with: the first tap on a box previews it and a second tap ticks it,
// so the sheet's words say tap instead of point and click
let touchy = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
function tapWords(s) {
  if (!touchy) return s;
  return s.replace(/Point at a box\. The house shows what it would do/, "Tap a box once. The house shows what it would do")
    .replace(/Point at a box:/, "Tap a box once:").replace(/Click to tick it\./, "Tap it again to tick it.")
    .replace(/\bClick\b/g, "Tap").replace(/\bclick\b/g, "tap");
}
function coachLine(room) { return tapWords(coachText(room)); }
function coachText(room) {
  if (st.unlocked) return reach(st.g, room.id).has(doorRoom()) ? "Last thing: click the front door, bottom left." : "The door's open. Now get a way into the bottom-left room. Point at a box: dashed rooms are where you could walk.";
  if (room.lines.some((l) => l.kind === "lock")) return "This is a red-lock room. Tick its UNLOCK box.";
  const lockNear = st.h.lockIds.find((id) => reach(st.g, room.id).has(id));
  if (lockNear != null) return `A red-lock room is in reach: the ${byId(st.g, lockNear).name}. Click it to walk there.`;
  if (st.edits === 0) return "Point at a box. The house shows what it would do: dashed rooms are where you could walk after. Click to tick it.";
  return "Look for red dots on the little plan: those are the locks. Tick boxes until a lock room is in reach, then walk.";
}
function clawCount() {
  const sh = st.shadow; if (st.scene !== "play" || sh.mode === "sleep" || !(sh.noPath > 0) || sh.way || path(st.g, sh.id, st.player.id)) return "";
  { const n = Math.max(0, Math.ceil(TRAPS[st.floor - 1] - sh.noPath)); return `It is shut in. It claws out in ${n} second${n === 1 ? "" : "s"}.`; }
}
function slipShown() {
  const hn = st.houseNext && st.houseNext.move ? st.houseNext : null;
  if (hn) return { e: errata(hn.move), k: clamp(hn.t * 5, 0, 1), wet: true };
  if (st.slip && st.floorT - st.slip.at < 7) return { e: st.slip.e, k: 1 };
  return null;
}
function panelBody() {
  const room = byId(st.g, st.player.id), L = 16, R = SHW - 16;
  // header
  const yours = !!st.finale || (st.scene === "end" && st.floor === FLOORS);
  ctx.fillStyle = PRINT.K; pfont(`700 20px ${ROK}`, 0.4); ctx.fillText(glitchText("THE SHIFTING HOUSE", st.glitch * 0.3), sx(L), sy(36));
  ctx.textAlign = "right"; pfont(`600 11px ${ROK}`, 0.3); ctx.fillStyle = yours ? PRINT.R : PRINT.K;
  ctx.fillText(yours ? glitchText("YOURS", st.finale && st.finale.t < 1 ? 0.6 : 0) : "No. 7", sx(R), sy(36)); ctx.textAlign = "left";
  ctx.fillStyle = PRINT.K; pfont(`400 10.5px ${ROK}`, 0.2); ctx.fillText(`Assembly instructions · Floor ${st.floor} of ${FLOORS}`, sx(L), sy(50));
  rule(58, 1.6); rule(61.5, 0.5);
  // where you are, and a little plan of the house with your room filled in (red dots: the locks)
  pfont(`600 10.5px ${ROK}`, 0.8); ctx.fillText("YOU ARE IN", sx(L), sy(86));
  let ns = 19; const nm = `THE ${room.name.toUpperCase()}`; pfont(`700 ${ns}px ${ROK}`, 0.6); while (ctx.measureText(nm).width > 170 && ns > 13) pfont(`700 ${--ns}px ${ROK}`, 0.6);
  ctx.fillText(nm, sx(L), sy(106));
  const gx = sx(196), gy = sy(74), cw = 22, chh = 13, me = find(st.g, st.player.id);
  ctx.strokeStyle = PRINT.K; ctx.lineWidth = 0.8;
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    if (r === me.y && c === me.x) { ctx.fillStyle = "rgba(30,24,20,0.82)"; ctx.fillRect(gx + c * cw, gy + r * chh, cw, chh); }
    ctx.strokeRect(gx + c * cw, gy + r * chh, cw, chh);
    if (!st.unlocked && st.h.lockIds.includes(st.g[r][c].id)) { ctx.fillStyle = PRINT.R; ctx.beginPath(); ctx.arc(gx + c * cw + cw / 2, gy + r * chh + chh / 2, 2.4, 0, 7); ctx.fill(); }
  }
  ctx.fillStyle = PRINT.K; rule(124, 0.5);
  // the steps: your room's choices
  st.wordRects = []; st.clearRects = []; st.lineYs = []; st.lineBoxes = []; st.textBands = []; st.glyphs = [];
  const n = room.lines.length, sp = n > 3 ? 45 : 54; let y = sy(152);
  room.lines.forEach((c, li) => {
    const v = stepView(room, c), spent = c.kind === "lock" && st.unlocked;
    const typing = st.retype && st.retype.li === li && st.retype.t < st.retype.len;
    if (typing) { ctx.save(); ctx.beginPath(); ctx.rect(sx(0), y - 18, SHW * clamp(st.retype.t / st.retype.len, 0, 1), 44); ctx.clip(); }
    // the number in a black disc, then the lead in book type
    ctx.fillStyle = v.red ? PRINT.R : PRINT.K; ctx.beginPath(); ctx.arc(sx(L + 7.5), y - 5.5, 7.5, 0, 7); ctx.fill();
    ctx.save(); ctx.globalCompositeOperation = "source-over"; ctx.fillStyle = "#e9dcc0"; pfont(`700 10px ${ROK}`); ctx.textAlign = "center"; ctx.fillText(String(STEP_NO(room, li)), sx(L + 7.5), y - 2); ctx.restore(); ctx.textAlign = "left";
    ctx.fillStyle = v.red ? PRINT.R : PRINT.K; pfont(`400 14px ${CAS}`); const lead = v.red ? "Front door  (the red lock)" : v.lead;
    ctx.fillText(glitchText(lead, st.glitch * 0.3), sx(L + 22), y - 1); const lw = ctx.measureText(lead).width;
    for (let k = 0; k < 6; k++) st.glyphs.push({ x: sx(L + 22) + lw * (k + 0.5) / 6, y, w: lw / 7 });
    st.lineYs[li] = y; st.lineBoxes.push({ x: sx(L + 22), y, w: lw + 20 }); st.textBands.push({ x: sx(L), w: SHW - 32, top: y - 12, bot: y + 24 });
    // the boxes
    const yy = y + 19; let cx = sx(L + 22);
    v.ch.forEach((w, i) => {
      if (i) cx = sx(168);
      const dir = w.dir ?? 1, hot = !w.cur && ((st.hover && st.hover.type === "word" && st.hover.li === li && st.hover.dir === dir) ||
        (st.hint && st.hint.id === room.id && st.hint.li === li && st.hint.dir === dir && Math.sin(st.t * 6) > 0));
      ctx.strokeStyle = v.red && !spent ? PRINT.R : PRINT.K; ctx.lineWidth = hot ? 1.6 : 1.1; ctx.strokeRect(cx + 0.5, yy - 9.5, 9, 9);
      if (w.cur) pencilTick(cx, yy); else if (hot) pencilTick(cx, yy, 0.35);
      pfont(`700 14px ${ROK}`, 0.6); ctx.fillStyle = spent ? PRINT.DIM : v.red ? PRINT.R : PRINT.K; ctx.fillText(w.t, cx + 14, yy);
      const tw = ctx.measureText(w.t).width;
      if (hot) { ctx.fillRect(cx + 14, yy + 2.5, tw, 1); }
      if (!w.cur && !spent) st.wordRects.push({ x: cx - 4, y: yy - 14, w: tw + 22, h: 19, dir, li });
      st.clearRects.push({ x: cx - 4, y: yy - 14, w: tw + 22, h: 19 }); // (every word, ticked or not, stays clear of the drips)
    });
    diagram(c.kind, y);
    if (typing) ctx.restore();
    y += sp;
  });
  const stepsEnd = y - sp + 30;
  // the errata slip, pasted on when the house changes a step
  // (while you point at something or have a hint, the notes need the space: the slip steps aside rather than cover
  // them. A tester couldn't read "No way there yet..." under it.)
  const busy = (st.hover && (st.hover.type === "word" || (st.hover.type === "room" && st.hover.id !== room.id))) || !!st.hint;
  const slip = busy ? null : slipShown(); st.slipOn = !!slip;
  if (slip && slip.e) {
    ctx.save(); ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = slip.k;
    if (sheetReady("slip")) ctx.drawImage(SHEET.img.slip, SX - 6 + 30, SY - 8 + 326, 268, 70);
    ctx.translate(sx(152), sy(365)); ctx.rotate(-2.2 * Math.PI / 180); ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = PRINT.R; pfont(`700 11px ${ROK}`, 1.2); ctx.fillText("ERRATA", -94, -8); const ew = ctx.measureText("ERRATA").width;
    pfont(`italic 400 9px ${CAS}`); ctx.fillText("issued after printing", -94 + ew + 8, -8);
    pfont(`400 11.5px ${CAS}`); const s1 = `Step ${slip.e.no}, ${slip.e.lead}: now `; let fs = 11.5; while (ctx.measureText(s1).width > 150 && fs > 8.5) pfont(`400 ${fs -= 0.5}px ${CAS}`);
    ctx.fillText(s1, -94, 11); const w1 = ctx.measureText(s1).width; pfont(`700 ${fs + 1.5}px ${ROK}`, 0.6); ctx.fillText(slip.e.w, -94 + w1, 11);
    ctx.restore();
  }
  // notes: what the pointed-at box or room does, the hint, the countdown
  let ny = Math.max(stepsEnd + 18, sy(292)); const nb = slip ? sy(336) : sy(452), nW = SHW - 32;
  const cc = clawCount(); if (cc) { ctx.fillStyle = PRINT.R; pfont(`700 12px ${ROK}`, 0.4); ctx.fillText(cc, sx(L), ny); ny += 17; }
  const hw = st.hover && st.hover.type === "word" ? room.lines[st.hover.li] : null;
  const hv = st.hover && st.hover.type === "room" && st.hover.id !== room.id ? byId(st.g, st.hover.id) : null;
  ctx.fillStyle = PRINT.K; pfont(`italic 400 12.5px ${CAS}`);
  if (hw) pwrap(plain(room, hw, st.hover.dir), sx(L), ny, nW, 16, nb, sy(380), 186);
  else if (hv) {
    pfont(`700 12px ${ROK}`, 0.6); ctx.fillText(`THE ${hv.name.toUpperCase()}`, sx(L), ny);
    pfont(`400 11.5px ${CAS}`); ctx.fillStyle = PRINT.DIM; const steps_ = hv.lines.map((c) => { const v = stepView(hv, c), cur = v.ch.find((x) => x.cur); return cur ? `${v.lead.toLowerCase()} ${cur.t.toLowerCase()}` : v.lead.toLowerCase(); });
    let yy = pwrap(`Its steps: ${steps_.join(" · ")}.`, sx(L), ny + 16, nW, 15, nb, sy(380), 186);
    ctx.fillStyle = PRINT.K; pfont(`italic 400 12.5px ${CAS}`);
    pwrap(reach(st.g, room.id).has(hv.id) ? tapWords("Click the room to walk there.") : whyNoWay(room.id, hv.id), sx(L), yy + 2, nW, 16, nb, sy(380), 186);
  } else if (st.hint) { ctx.fillStyle = PRINT.R; pwrap(st.hint.text, sx(L), ny, nW, 16, nb, sy(380), 186); }
  else if (st.scene === "play" && (st.floor === 1 || st.edits === 0)) {
    // floor 1 teaches as you go, in the builder's pencil: one next thing at a time (CH 11-19 found floor 1 hard to read)
    const coach = st.floor === 1 ? coachLine(room) : null, nw = NEW_WORD[st.floor];
    if (coach) { ctx.save(); ctx.globalCompositeOperation = "source-over"; ctx.fillStyle = PRINT.PENCIL; pfont(`500 18px ${HAND}`); pwrap(coach, sx(L), ny + 4, nW, 19, nb, sy(380), 186); ctx.restore(); }
    else if (nw) pwrap(`New on this floor: ${nw.step}. It ${nw.text}`, sx(L), ny, nW, 16, nb, sy(380), 186);
  }
  // the seal: press it for a hint
  const sealHot = st.hover && st.hover.type === "hint";
  st.hintRect = st.scene === "play" ? { x: sx(220), y: sy(393), w: 48, h: 48 } : null;
  ctx.fillStyle = sealHot ? PRINT.R : PRINT.K; pfont(`italic 500 10.5px ${CAS}`); ctx.textAlign = "right"; ctx.fillText("Stuck? Press the seal.", sx(214), sy(421)); ctx.textAlign = "left";
  if (sealHot) { ctx.save(); ctx.globalCompositeOperation = "source-over"; ctx.strokeStyle = "rgba(163,38,27,0.55)"; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.ellipse(sx(244), sy(417), 24, 23, -0.1, 0.25, Math.PI * 2 + 0.5); ctx.stroke(); ctx.restore(); }
  // the final step
  ctx.fillStyle = PRINT.K; rule(470, 1.4); rule(473.5, 0.5);
  pfont(`600 10.5px ${ROK}`, 0.8); ctx.fillText("FINAL STEP", sx(L), sy(492));
  pfont(`400 15px ${CAS}`); ctx.fillText("Front door:", sx(L), sy(513)); const fw = ctx.measureText("Front door:  ").width;
  pfont(`700 17px ${ROK}`, 0.8); ctx.fillStyle = st.unlocked ? PRINT.K : PRINT.R; ctx.fillText(st.unlocked ? "UNLOCKED" : "LOCKED", sx(L) + fw, sy(513));
  ctx.fillStyle = PRINT.K; pfont(`italic 500 12.5px ${CAS}`);
  const atDoor = st.unlocked && reach(st.g, st.player.id).has(doorRoom());
  pwrap(tapWords(!st.unlocked ? "Find a room with a red lock, and tick its UNLOCK box." : atDoor || st.finale ? "The front door is open. Click it, bottom left." : "Open, but no way leads to it yet. Get a way into the bottom-left room."), sx(L), sy(533), nW, 16);
}

// A page of the same assembly sheet, held up in the middle of the screen: the end-of-floor card and the pause page.
const CX0 = (VW - SHW) / 2, CY0 = SY; // (the same 304 x 556 page as the sheet beside the house)
const cx_ = (x) => CX0 + x, cy_ = (y) => CY0 + y;
function cardPage() {
  if (sheetReady("plain")) ctx.drawImage(SHEET.img.plain, CX0 - 6, CY0 - 8, SHW + 12, SHH + 16); else paper(ctx, CX0, CY0, SHW, SHH, { clip: false, margin: false });
}
function cardRule(y, w = 1, x0 = 16, x1 = SHW - 16) { ctx.fillRect(cx_(x0), cy_(y) - w / 2, x1 - x0, w); }
function cardHeader(sub) {
  ctx.fillStyle = PRINT.K; pfont(`700 20px ${ROK}`, 0.4); ctx.fillText("THE SHIFTING HOUSE", cx_(16), cy_(36));
  ctx.textAlign = "right"; pfont(`600 11px ${ROK}`, 0.3); ctx.fillText("No. 7", cx_(SHW - 16), cy_(36)); ctx.textAlign = "left";
  pfont(`400 10.5px ${ROK}`, 0.2); ctx.fillText(sub, cx_(16), cy_(50)); cardRule(58, 1.6); cardRule(61.5, 0.5);
}
function cardWrap(text, x, y, w, lh) { return pwrap(text, cx_(x), cy_(y), w, lh) - CY0; }
// the new step, printed the way the sheet prints steps
function cardStep(y, nw) {
  ctx.fillStyle = PRINT.R; ctx.beginPath(); ctx.arc(cx_(23.5), cy_(y - 5.5), 7.5, 0, 7); ctx.fill();
  ctx.save(); ctx.globalCompositeOperation = "source-over"; ctx.fillStyle = "#e9dcc0"; pfont(`700 8px ${ROK}`); ctx.textAlign = "center"; ctx.fillText("NEW", cx_(23.5), cy_(y - 3)); ctx.restore(); ctx.textAlign = "left";
  ctx.fillStyle = PRINT.K; pfont(`400 14px ${CAS}`); ctx.fillText(nw.lead, cx_(38), cy_(y - 1));
  nw.ch.forEach((t, i) => { const bx = cx_(i ? 168 : 38), by = cy_(y + 19); ctx.strokeStyle = PRINT.K; ctx.lineWidth = 1.1; ctx.strokeRect(bx + 0.5, by - 9.5, 9, 9); pfont(`700 14px ${ROK}`, 0.6); ctx.fillText(t, bx + 14, by); });
}
const NEXT_STEP = { 2: { lead: "Swap rooms with", ch: ["WEST", "EAST"] }, 3: { lead: "The house stands", ch: ["UPRIGHT", "UPSIDE DOWN"] } };
function drawFloorCard(k) {
  ctx.fillStyle = `rgba(0,0,0,${Math.min(0.88, k * 1.5)})`; ctx.fillRect(0, 0, VW, VH);
  if (k <= 0.4) return;
  const a = clamp((k - 0.4) * 3, 0, 1); ctx.save(); ctx.globalAlpha = a; ctx.translate(0, (1 - a) * 18);
  cardPage();
  ctx.save(); ctx.globalCompositeOperation = "multiply"; ctx.fillText = printed;
  try {
    cardHeader(`Assembly instructions · Floor ${st.floor} of ${FLOORS}`);
    ctx.fillStyle = PRINT.K; pfont(`700 28px ${ROK}`, 0.8); ctx.fillText(`FLOOR ${st.floor}`, cx_(16), cy_(100));
    const fw = ctx.measureText(`FLOOR ${st.floor}  `).width; ctx.fillStyle = PRINT.R; pfont(`700 28px ${ROK}`, 0.8); ctx.fillText("DONE", cx_(16) + fw, cy_(100));
    // steps changed against the fewest it can be done in
    const best = st.moves <= st.h.par;
    ctx.fillStyle = PRINT.K; pfont(`400 14px ${CAS}`); ctx.fillText(`Steps changed: ${st.moves}`, cx_(16), cy_(128));
    ctx.textAlign = "right"; ctx.fillText(`Fewest possible: ${st.h.par}`, cx_(SHW - 16), cy_(128)); ctx.textAlign = "left";
    pfont(`italic 400 12px ${CAS}`); let y = cardWrap(`${st.moves < st.h.par ? JOKES.beatPar : best ? "You matched it." : "It can be done in fewer."} Walking, ladders and UNLOCK are free; only ticked boxes count.`, 16, 146, SHW - 32, 15);
    // the torn page: read now, between floors, not while it's hunting you
    ctx.fillStyle = PRINT.K; cardRule(y + 2, 0.5); pfont(`600 10.5px ${ROK}`, 0.8); ctx.fillText(`TORN PAGE  ·  ${st.pages} OF 3 FOUND`, cx_(16), cy_(y + 22));
    if (st.page.got) { pfont(`italic 400 13px ${CAS}`); y = cardWrap(`“${PAGES[st.floor]}”`, 16, y + 42, SHW - 32, 17); }
    else { ctx.fillStyle = PRINT.DIM; pfont(`italic 400 12.5px ${CAS}`); y = cardWrap("Not found on this floor. Each floor hides one torn page in a room on the way out. Walk into its room to pick it up. Find all three and the ending changes.", 16, y + 42, SHW - 32, 16); }
    // the builder's note, pencilled in the margin, written out as you watch
    const [, msg] = COMMITS[st.floor + 1] || ["", ""], n = Math.floor(clamp((k - 0.6) * 30, 0, msg.length));
    if (msg) { ctx.save(); ctx.translate(cx_(20), cy_(y + 18)); ctx.rotate(-0.025); ctx.fillStyle = PRINT.PENCIL; pfont(`500 19px ${HAND}`); const lines = pwrap(msg, 0, 0, SHW - 44, 21, -1); pwrap(msg.slice(0, n), 0, 0, SHW - 44, 21); ctx.restore(); y += 18 + lines; }
    // next floor, and its new step
    ctx.fillStyle = PRINT.K; const ny = Math.max(y + 14, 400); cardRule(ny, 1.4); cardRule(ny + 3.5, 0.5);
    pfont(`600 10.5px ${ROK}`, 0.8); ctx.fillText(`NEXT  ·  FLOOR ${st.floor + 1} OF ${FLOORS}`, cx_(16), cy_(ny + 22));
    pfont(`400 14px ${CAS}`); ctx.fillText(st.floor === 1 ? "The shadow wakes up." : "The last one.", cx_(16), cy_(ny + 42));
    const nw = NEXT_STEP[st.floor + 1]; if (nw) cardStep(ny + 72, nw);
    if (k > 1.2) { ctx.fillStyle = PRINT.R; ctx.globalAlpha = a * (0.6 + 0.4 * Math.sin(st.t * 3)); pfont(`italic 500 16px ${CAS}`); ctx.textAlign = "center"; ctx.fillText(tapWords("Click to go down"), cx_(SHW / 2), cy_(540)); ctx.textAlign = "left"; }
  } finally { delete ctx.fillText; if ("letterSpacing" in ctx) ctx.letterSpacing = "0px"; ctx.restore(); }
  ctx.restore();
}

function drawOverlay() {
  // closeness: darker edges as it nears
  const a = find(st.g, st.player.id), b = find(st.g, st.shadow.id), d = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  const k = st.shadow.mode === "sleep" ? 0.35 : [0.75, 0.58, 0.45][d] ?? 0.35;
  const g = ctx.createRadialGradient(VW / 2, VH / 2, 220, VW / 2, VH / 2, 620); g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, `rgba(0,0,0,${k})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
  if (st.finale && st.scene === "play") { const r = ctx.createRadialGradient(VW / 2, VH / 2, 260, VW / 2, VH / 2, 640); r.addColorStop(0, "rgba(120,0,0,0)"); r.addColorStop(1, `rgba(150,10,10,${0.25 + 0.15 * Math.sin(st.t * 7)})`); ctx.fillStyle = r; ctx.fillRect(0, 0, VW, VH); }
  if (st.shadow.lunge > 0 && st.scene === "play") { const r = ctx.createRadialGradient(VW / 2, VH / 2, 200, VW / 2, VH / 2, 620); r.addColorStop(0, "rgba(140,0,0,0)"); r.addColorStop(1, `rgba(170,12,8,${0.45 * Math.min(1, st.shadow.lunge * 4)})`); ctx.fillStyle = r; ctx.fillRect(0, 0, VW, VH); } // its tell: the room goes red at the edges as it crouches to lunge
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
    // first in the sheet's empty place beside the house (never over it), then under the pulled-back desk
    const col = SX + SHW / 2, cw = SHW - 20;
    if (1 - z > 0.01) {
      ctx.globalAlpha = 1 - z; textX = col; let y = 190;
      if (k2 > 0.4) { for (const part of l1.split(/\s+(?=\/\/)/)) y = centerWrap(part, y, cw, 30, e === "free" ? `22px ${MONO}` : `italic 24px ${SERIF}`, e === "free" ? GRN : INK); y += 22; } // (a code comment gets its own line)
      else y += 52;
      if (k2 > 2) y = centerWrap(l2, y, cw, 27, `italic 20px ${SERIF}`, e === "free" ? INK : DIM) + 26;
      else y += 80;
      endStats(k2 - PULL[e] - 1.5, y, cw);
      textX = VW / 2;
    }
    if (z > 0.01) {
      ctx.globalAlpha = z;
      if (k2 > 0.4) centerText(l1, 508, e === "free" ? `24px ${MONO}` : `italic 24px ${SERIF}`, e === "free" ? GRN : INK);
      if (k2 > 2) centerText(l2, 538, `italic 21px ${SERIF}`, e === "free" ? INK : DIM);
      endStats(k2 - PULL[e] - 1.5, 566, 900);
    }
    ctx.globalAlpha = 1; return;
  }
  if (st.page.got && st.floor === FLOORS) { ctx.globalAlpha = clamp(k, 0, 1) * 0.85; centerText(`a torn page (${st.pages} of 3)`, 96, `18px ${MONO}`, "#e8dcc0"); centerWrap(PAGES[FLOORS], 128, 640, 26, `italic 21px ${SERIF}`, "#e8dcc0"); ctx.globalAlpha = 1; }
  const line = ENDING.line, n = Math.floor(clamp((k - 1) * 18, 0, line.length));
  if (k > 1) centerText(line.slice(0, n), VH / 2 - 60, `26px ${MONO}`, n < line.length ? INK : RED);
  if (k > 4.4) {
    const [pre, words, post] = ENDING.choice, open = st.pages >= 3;
    ctx.font = `34px ${MONO}`; const shown = open ? words : [words[0]];
    const full = pre + shown.join(open ? " | " : "|") + post; let cx = VW / 2 - ctx.measureText(full).width / 2; const y = VH / 2 + 10; const keepInk = [INK, DIM, YEL, RED, GRN]; if (open) { paper(ctx, VW / 2 - 300, y - 56, 600, 136, { seed: 5, clip: false, margin: false }); ({ INK, DIM, YEL, RED, GRN } = LOOK.panel); }
    ctx.fillStyle = INK; ctx.fillText(pre, cx, y); cx += ctx.measureText(pre).width;
    shown.forEach((w, i) => {
      if (i) { const pad = open ? 9 : 0; cx += pad; ctx.fillStyle = DIM; ctx.fillText("|", cx, y); cx += ctx.measureText("|").width + pad; }
      const ww = ctx.measureText(w).width, hot = st.hover && st.hover.type === "choice" && st.hover.word === w;
      if (open) pencil(ctx, { x: cx - 6, y: y - 30, w: ww + 12, h: 38 }, hot);
      ctx.fillStyle = open ? YEL : DIM; ctx.fillText(w, cx, y); choiceRects.push({ x: cx - 5, y: y - 30, w: ww + 10, h: 40, word: w }); cx += ww;
    });
    ctx.fillStyle = INK; ctx.fillText(post, cx, y);
    if (open) {
      centerText("One word left, and all three pages say it's yours to change.", y + 44, `italic 20px ${SERIF}`, INK);
      const left = clamp((16.5 - k) / 12, 0, 1); ctx.fillStyle = DIM; ctx.fillRect(VW / 2 - 120, y + 64, 240 * left, 3);
      if (left < 1) centerText(`choose, or the house keeps it (${Math.max(0, Math.ceil(16.5 - k))})`, y + 84, `italic 16px ${SERIF}`, DIM);
    } else { centerText(`${ENDING.locked} You found ${st.pages}.`, y + 44, `italic 19px ${CAS}`, DIM); choiceRects = []; }
    [INK, DIM, YEL, RED, GRN] = keepInk;
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
function endStats(k, y, maxW) {
  const c = st.total.caught || 0, h = st.total.house || 0;
  const lines = [`3 floors, ${st.total.moves} steps changed (fewest possible: ${st.total.par})`,
    `${c} grab${c === 1 ? "" : "s"}, ${h} change${h === 1 ? "" : "s"} by the house, ${st.total.hints || 0} hint${st.total.hints === 1 ? "" : "s"}, ${st.pages} of 3 torn pages`];
  if (k > 0) for (const l of lines) y = centerWrap(l, y, maxW, 22, `16px ${ROK}`, INK);
  if (k > 1) centerText(tapWords(st.ending === "free" ? "Click to close the house." : "Click to close the house. It'll wait."), y + 12, `italic 17px ${SERIF}`, DIM);
}
function centerWrap(text, y, maxW, lh, font, color) {
  ctx.font = font; const words = text.split(" "), lines = []; let line = "";
  for (const w of words) { const t = line ? line + " " + w : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
  if (line) lines.push(line); lines.forEach((l, i) => centerText(l, y + i * lh, font, color));
  return y + lines.length * lh; // (where the next line goes)
}
let textX = 480; // (where centerText centres: the screen's middle, or the sheet's place at the end)
function centerText(text, y, font, color) { ctx.font = font; ctx.fillStyle = color; ctx.textAlign = "center"; ctx.fillText(text, textX, y); ctx.textAlign = "left"; }
function drawScenes() {
  if (st.scene === "title") {
    // the title: the doll's house photographed on its desk at night (assets/title/, path-traced), the name over it
    const back = lastEnding(), k = clamp(st.t / 1.6, 0, 1);
    if (TITLE_IMG.ok) { ctx.drawImage(TITLE_IMG.im, 0, 0, VW, VH); } else { ctx.fillStyle = "#050407"; ctx.fillRect(0, 0, VW, VH); } // (until the photo loads: plain dark, not the unfinished house showing through)
    const g = ctx.createLinearGradient(0, 0, 0, 170); g.addColorStop(0, "rgba(4,3,5,0.75)"); g.addColorStop(1, "rgba(4,3,5,0)"); ctx.fillStyle = g; ctx.fillRect(0, 0, VW, 170);
    const g2 = ctx.createLinearGradient(0, VH - 150, 0, VH); g2.addColorStop(0, "rgba(4,3,5,0)"); g2.addColorStop(1, "rgba(4,3,5,0.85)"); ctx.fillStyle = g2; ctx.fillRect(0, VH - 150, VW, 150);
    ctx.save(); ctx.globalAlpha = k; ctx.shadowColor = "rgba(0,0,0,0.85)"; ctx.shadowBlur = 14;
    centerText("The Shifting House", 80, `60px ${TITLE}`, "#efe3c8");
    const tag = awayLine || (back === "free" ? "Nobody home. Or so it says." : back === "keep" ? "Welcome back. It kept your room just as you left it." : "You built this house. It never let you leave.");
    centerText(tag, 118, `italic 20px ${SERIF}`, "#e0917c");
    ctx.globalAlpha = k * clamp((st.t - 1) / 1, 0, 1);
    centerText(tapWords("Click a room to walk there. Tick a box on the sheet to change the house."), VH - 74, `italic 17px ${SERIF}`, "rgba(239,227,200,0.82)");
    ctx.globalAlpha = k * (0.55 + 0.45 * Math.sin(st.t * 2.4));
    centerText(tapWords("click anywhere to begin"), VH - 42, `italic 22px ${SERIF}`, "#efe3c8");
    ctx.globalAlpha = k * 0.5; if (!touchy) centerText("P pause  ·  R restart floor  ·  M sound", VH - 16, `13px ${SERIF}`, "#efe3c8");
    ctx.restore();
  } else if (st.scene === "caught") {
    const k = st.caughtT;
    ctx.fillStyle = k < 0.15 ? "rgba(160,20,20,0.6)" : `rgba(0,0,0,${Math.min(0.94, k * 1.5)})`; ctx.fillRect(0, 0, VW, VH);
    if (k > 0.3) { const sk = clamp((k - 0.3) / 0.12, 0, 1); ctx.save(); ctx.translate(VW / 2, VH / 2 - 10); ctx.rotate(-0.06); ctx.scale(1.6 - 0.6 * sk, 1.6 - 0.6 * sk); ctx.globalAlpha = sk; // stamped on, like the sheet's red
      pfont(`700 64px ${ROK}`, 6); ctx.fillStyle = "#c2301f"; ctx.textAlign = "center"; ctx.fillText("FOUND", 0, 20); ctx.strokeStyle = "#c2301f"; ctx.lineWidth = 3; const fw = ctx.measureText("FOUND").width; ctx.strokeRect(-fw / 2 - 18, -40, fw + 36, 76); ctx.textAlign = "left"; if ("letterSpacing" in ctx) ctx.letterSpacing = "0px"; ctx.restore(); }
    if (k > 1.1) centerText("It throws you clear. The house changes a step.", VH / 2 + 66, `italic 18px ${CAS}`, "rgba(230,215,190,0.8)");
  } else if (st.scene === "floor") {
    drawFloorCard(st.endT);
  } else if (st.scene === "end") drawEnd();
}

function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  // The screen break: nothing in the house moves while it's out of its window, so it draws the game once into a
  // snapshot (again a few times while the house's line types out) instead of every frame. That keeps the WOW
  // moment smooth on slow machines (the critic measured ~83 ms a frame before).
  if (st.tear && st.finale && st.scene === "play" && st.tear.snap && !(st.tear.t < 1.4 && (st.tear.n = (st.tear.n || 0) + 1) % 4 === 0)) { drawTear(false); drawSticky(); return; }
  if (st.scene === "sheets") { drawSheets(st.sheetT); drawSticky(); return; }
  if (st.scene === "credits") { drawCredits(st.credT); drawSticky(); return; }
  if (st.scene === "desk") { deskClock(); desk.drawDesk(ctx, TG, st.desk, st.found.map((f) => PAGES[f]), JOKES); drawSticky(); return; }
  const z = pullK();
  if (z > 0) {
    drawRealRoom(z); ctx.save(); const T = toDesk(z);
    ctx.translate(T.X(0), T.Y(0)); ctx.scale(T.sc, T.sc); clipFrame();
  }
  // the flip preview: the whole night (house, lamp, you) is drawn as it would be after the flip, then put back
  const peekG = flipPeek(), realG = st.g; if (peekG) st.g = peekG;
  try { drawWorld(); } finally { st.g = realG; }
  slideRows(st.scene === "title" ? shuffleOffsets() : shiftK > 0 ? st.g.map(() => CW * ease(shiftK)) : null);
  if (st.scene === "end") endWorld();
  if (z > 0) { ctx.restore(); drawLaptop(z); }
  drawVoice(); drawScenes(); drawHud(); drawPause();
  if (st.finale && st.scene === "play") {
    if (st.tear) drawTear(); else tear.drawCracks(ctx, TG, 1, (x, y) => [x, y], 0.3); // the glass stays cracked
  }
  drawSticky();
}
function drawSticky() { if (sticky) { ctx.setTransform(DPR, 0, 0, DPR, 0, 0); tear.drawSticky(ctx, TG, sticky.t); } }
function deskClock() { const now = new Date(); TG.clock = [now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }), now.toLocaleDateString()]; }
function openDesk() { st.scene = "desk"; st.desk = { t: 0, open: null, bin: null }; setTitle("Desktop"); }
// Ctrl+Z (Cmd+Z on a Mac): there's no undo in here, so it undoes the moon, then gravity, then your undo
// Each step holds for a moment before the next press counts, so you can see what it did.
// Gravity: the house lifts off and bobs, loose things drift up out of the rooms, the rain falls up.
// The third press drops it all back with a thump.
let undone = 0, undoAt = -1e9, grav = 0, junk = [];
const JUNK = ["#8a5a3a", "#c9b48a", "#6d7a8a", "#a33f3f", "#d9cfb8", "#4f6b4a"];
function undo() {
  const now = performance.now(); if (now - undoAt < 2200) return; undoAt = now;
  undone = (undone + 1) % 3; sfx.lights(undone === 0);
  if (!st) return;
  sayLine(JOKES.undo[(undone + 2) % 3], true);
  if (undone === 2) junk = Array.from({ length: 9 }, (_, i) => ({ x: HX + 30 + Math.random() * (HW - 60), y: HY + CH * (1 + (i % 3)) - 12, w: 8 + Math.random() * 14, h: 6 + Math.random() * 10, c: JUNK[i % JUNK.length], vy: -(14 + Math.random() * 16), vx: (Math.random() - 0.5) * 10, r: 0, vr: (Math.random() - 0.5) * 1.6, d: i * 0.25 }));
  if (undone === 0) { junk = []; st.shake = 0.8; sfx.doorShut(); dustBurst({ kind: "row", i: 3 }); }
}
function gravity(dt) {
  grav = undone === 2 ? Math.min(1, grav + dt / 1.2) : Math.max(0, grav - dt * 6);
  for (const j of junk) { if ((j.d -= dt) > 0) continue; j.x += j.vx * dt; j.y += j.vy * dt; j.r += j.vr * dt; }
  junk = junk.filter((j) => j.y > -40);
  if (grav > 0.5 && Math.random() < dt * 14) st.dust.push({ x: HX + Math.random() * HW, y: HY + HH - Math.random() * HH, vx: (Math.random() - 0.5) * 8, vy: -20 - Math.random() * 20, up: true, t: 0, life: 2.5 });
}
function lift() { return grav <= 0 ? 0 : grav * grav * (22 + Math.sin(st.t * 1.7) * 8); }
function drawJunk() {
  for (const j of junk) { if (j.d > 0) continue; ctx.save(); ctx.translate(j.x, j.y - lift()); ctx.rotate(j.r); ctx.fillStyle = j.c; ctx.fillRect(-j.w / 2, -j.h / 2, j.w, j.h); ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fillRect(-j.w / 2, j.h / 2 - 2, j.w, 2); ctx.restore(); }
}
// Shift five times: the house's own Sticky Keys box (src/tear.js). It pauses nothing and turns nothing on.
let sticky = null, shifts = [];
function stickyKey(e) {
  if (e.key !== "Shift" || e.repeat) return;
  const now = performance.now(); shifts = shifts.filter((s) => now - s < 3000); shifts.push(now);
  if (shifts.length >= 5) { shifts = []; sticky = { t: 0 }; sfx.lights(true); }
}
// the screen break works on a copy of the frame just drawn
const tearCv = document.createElement("canvas"), TG = { VW, VH, DPR, HX, HY, CW, CH, HW, HH, W, H, MONO, clock: ["", ""], get wall() { return TITLE_IMG.ok ? TITLE_IMG.im : null; } };
function drawTear(snap = true) {
  if (tearCv.width !== cv.width) { tearCv.width = cv.width; tearCv.height = cv.height; }
  if (snap) { const b = tearCv.getContext("2d"); b.setTransform(1, 0, 0, 1, 0, 0); b.clearRect(0, 0, cv.width, cv.height); b.drawImage(cv, 0, 0); st.tear.snap = true; }
  deskClock();
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, VW, VH); tear.draw(ctx, tearCv, st.tear.t, TG);
}
function drawWorld() {
  art.night(ctx, VW, VH, { x: HX, y: HY, w: HW, h: HH }, st.t, flash(), st.bolt.x, undone >= 1);
  if (st.faceBolt && flash() > 0.1) drawWatcher(flash());
  const dry = st.ending === "free" ? clamp((st.endT2 - 1) / 3, 0, 1) : 0;
  if (dry < 1) { ctx.globalAlpha = 1 - dry; art.rain(ctx, VW, VH, st.t, undone >= 2); ctx.globalAlpha = 1; }
  ctx.save();
  if (st.shake > 0 && !CALM) ctx.translate((Math.random() - 0.5) * 12 * st.shake, (Math.random() - 0.5) * 12 * st.shake);
  const L = lift(); if (L) { ctx.translate(HCX, HY + HH); ctx.rotate(Math.sin(st.t * 1.1) * 0.012 * grav); ctx.translate(-HCX, -(HY + HH) - L); }
  drawHouse(); ctx.restore(); if (junk.length) drawJunk();
  const f = flash(); if (f > 0) { ctx.fillStyle = `rgba(210,220,255,${f * 0.22})`; ctx.fillRect(0, 0, PX - 14, VH); }
  // at the end the sheet slides off the table to the right, so the ending's words get its place (not over the house)
  const off = st.scene === "end" ? ease(clamp(st.endT / 1.2, 0, 1)) * (VW - SX + 30) : 0;
  if (off < VW - SX + 20) { ctx.save(); ctx.translate(off, 0); drawPanel(); ctx.restore(); }
  if (st.wantSheet) { st.wantSheet = false; keepSheet(); } // (the page alone, before anything is laid over it)
  drawOverlay();
  if (st.scene === "play") { if (st.crayon) drawCrayonDoor(st.crayon.t); if (st.note) drawNote(st.note.t); if (st.floorT < 4) drawYou(st.floorT); if (st.sign) drawSign(st.sign.t); if (st.sticker) drawSticker(st.sticker.t); }
}
// the first few seconds of each floor: a marker over you, so you can find yourself
function drawYou(t) {
  const [x, y] = walkerPos(st.player), a = Math.min(1, t * 3, (4 - t) / 0.6), bob = Math.sin(t * 6) * 3;
  ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = YEL; ctx.strokeStyle = "rgba(0,0,0,0.7)"; ctx.lineWidth = 3;
  ctx.fillStyle = "#f1e4c6"; ctx.font = `italic 20px ${SERIF}`; ctx.textAlign = "center"; ctx.strokeText("you", x, y - 62 + bob); ctx.fillText("you", x, y - 62 + bob);
  ctx.beginPath(); ctx.moveTo(x - 7, y - 54 + bob); ctx.lineTo(x + 7, y - 54 + bob); ctx.lineTo(x, y - 44 + bob); ctx.closePath(); ctx.fill();
  ctx.textAlign = "left"; ctx.restore();
}
// floor 2: the shadow, newly awake, holds up a little sign
function drawSign(t) {
  const [x, y] = walkerPos(st.shadow), a = Math.min(1, t * 3, (6 - t) / 0.5), up = Math.min(1, t * 2.5) * 16;
  ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = "#040305"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 10, y - 30); ctx.lineTo(x + 14, y - 52 - up); ctx.stroke();
  ctx.translate(x + 14, y - 70 - up); ctx.rotate(0.06); ctx.fillStyle = "#efe6cf"; ctx.fillRect(-26, -16, 52, 26);
  ctx.fillStyle = "#2b2119"; ctx.font = `italic 18px ${SERIF}`; ctx.textAlign = "center"; ctx.fillText(JOKES.sign, 0, 3); ctx.textAlign = "left"; ctx.restore();
}
// floor 3: the first time you turn it over, a shipping sticker, now upside down
function drawSticker(t) {
  const a = Math.min(1, t * 3, (7 - t) / 0.6);
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
// Your lamp is the only warm thing. It changes color as the house takes you: amber, then cold, then red.
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
  if (st.scene === "end") { glows.length = 0; bones(0, null, 0, 0); return; }
  const hot = HOT[st.floor] || HOT[1], L = PX - 14, fear = lampFear(), fl = lampFlicker(fear), bolt = st.tear ? 0.95 : flash(); // torn out of its window, the house is in the light
  const pp = walkerPos(st.player), px = pp[0], py = pp[1] - 32;
  // 1. drain the color out of the house
  ctx.save(); ctx.globalCompositeOperation = "saturation"; ctx.fillStyle = "#808080"; ctx.globalAlpha = 0.7; ctx.fillRect(0, 0, L, VH); ctx.restore();
  // 2. the dark, with a hole where your lamp is (lightning thins it for a moment)
  if (!lampCv) { lampCv = document.createElement("canvas"); lampCv.width = VW * DPR; lampCv.height = VH * DPR; }
  const c = lampCv.getContext("2d"); c.setTransform(DPR, 0, 0, DPR, 0, 0); c.clearRect(0, 0, VW, VH);
  c.globalCompositeOperation = "source-over"; c.fillStyle = `rgba(2,5,16,${0.84 - 0.55 * bolt})`; c.fillRect(0, 0, L, VH);
  c.globalCompositeOperation = "destination-out";
  const R = 128 * fl;
  let g = c.createRadialGradient(px, py, 6, px, py, R); g.addColorStop(0, "rgba(0,0,0,1)"); g.addColorStop(0.45, "rgba(0,0,0,0.9)"); g.addColorStop(1, "rgba(0,0,0,0)");
  c.fillStyle = g; c.fillRect(0, 0, L, VH);
  // the rooms you can walk to right now stay dimly visible, so you can see where to go
  const near = st.scene === "play" ? [...reach(st.g, st.player.id)] : [];
  c.fillStyle = "rgba(0,0,0,0.5)";
  for (const id of near) { if (id === st.player.id) continue; const p = find(st.g, id); for (const [x, y] of drawPositions(p)) c.fillRect(x + 2, y + 2, CW - 4, CH - 4); }
  // pointing at a word lights every room it would move, and the rooms you could walk to after it
  const lit = previewLit();
  if (lit.size) { c.fillStyle = `rgba(0,0,0,${0.55 + 0.15 * Math.sin(st.t * 5)})`; for (const id of lit) { if (id === st.player.id) continue; for (const [x, y] of drawPositions(find(st.g, id))) c.fillRect(x + 2, y + 2, CW - 4, CH - 4); } }
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(lampCv, 0, 0); ctx.restore();
  bones(bolt, new Set([...near, ...lit]), px, py);
  // 3. the flame's color on everything it reaches
  ctx.save(); ctx.globalCompositeOperation = "lighter";
  g = ctx.createRadialGradient(px, py, 0, px, py, 105 * fl); g.addColorStop(0, `rgba(${hot},${0.55 * fl})`); g.addColorStop(1, `rgba(${hot},0)`);
  ctx.fillStyle = g; ctx.fillRect(px - 120, py - 120, 240, 240); ctx.restore();
  // 4. the room frames, barely there, so the puzzle still reads
  ctx.save(); ctx.strokeStyle = `rgba(214,190,150,${0.08 + 0.25 * bolt})`; // (warm, like the house's own wood) ctx.lineWidth = 1.5;
  for (let y = 0; y < st.g.length; y++) for (let x = 0; x < st.g[y].length; x++) ctx.strokeRect(HX + x * CW + 3, HY + y * CH + 3, CW - 6, CH - 6);
  ctx.restore();
  ctx.save(); ctx.strokeStyle = `rgba(${hot},0.4)`; ctx.lineWidth = 1.5;
  for (const id of near) { if (id === st.player.id) continue; const p = find(st.g, id); for (const [x, y] of drawPositions(p)) ctx.strokeRect(x + 3, y + 3, CW - 6, CH - 6); }
  ctx.restore();
  for (const g2 of glows) g2(); glows.length = 0;
  // 5. it is near: the dark closes in at the edges
  if (fear > 0.3) { ctx.save(); const v = ctx.createRadialGradient(px, py, 60, px, py, 520); v.addColorStop(0, "rgba(40,0,0,0)"); v.addColorStop(1, `rgba(40,0,0,${0.5 * fear})`); ctx.fillStyle = v; ctx.fillRect(0, 0, L, VH); ctx.restore(); }
}
// Every room's bones, drawn once and in the room's own perspective: doorways, ladders, hatches and its name.
// In your light (and in rooms you can reach) they're plain wood; out in the dark the moon picks them out, so you
// can still plan a move. (They used to be a second, flat outline drawing pasted over the room, a few pixels off:
// doubled names, ladders through the ceiling, red X marks. CH: "super unpolished".)
// seen: rooms that are lit for you anyway; null = all of them (the ending)
function bones(bolt, seen, px, py) {
  for (let y = 0; y < st.g.length; y++) for (let x = 0; x < st.g[y].length; x++) {
    const room = st.g[y][x];
    for (const [cx, cy] of drawPositions({ x, y })) {
      const vis = !seen || room.id === st.player.id || seen.has(room.id) || (st.finale && st.finalePath && st.finalePath.includes(room.id)) || Math.hypot(cx + CW / 2 - px, cy + CH / 2 - py) < 120;
      roomBones(room, x, y, cx, cy, vis, bolt);
    }
  }
}
function roomBones(room, gx, gy, cx, cy, vis, bolt) {
  const G = roomGeo(cx, cy), m = 0.38 + 0.3 * bolt, MOON = `rgba(168,190,236,${m})`;
  const WOOD = vis ? "#8d6a45" : MOON, HOLE = "rgba(4,3,6,0.96)";
  const quad = (pts, fill, stroke) => { ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); } };
  ctx.save(); ctx.lineJoin = "round"; ctx.lineCap = "round";
  // doorways: in the dark, an open one shows its frame; a shut door (one you can change) its slab
  for (const s of ["l", "r"]) {
    const q = [G.side(s, 0.22, 0), G.side(s, 0.68, 0), G.side(s, 0.68, 0.68), G.side(s, 0.22, 0.68)];
    if (room[s]) {
      if (!vis) { ctx.lineWidth = 1.5; ctx.strokeStyle = MOON; ctx.beginPath(); ctx.moveTo(...q[0]); ctx.lineTo(...q[3]); ctx.lineTo(...q[2]); ctx.lineTo(...q[1]); ctx.stroke(); }
    } else if (!vis && room.lines.some((l) => l.kind === "door" && (l.side === "west") === (s === "l"))) { ctx.lineWidth = 1; quad(q, `rgba(168,190,236,${m * 0.25})`, MOON); }
  }
  // hatches: a ladder up meets a hole in the ceiling, a hole down shows the top of the ladder below.
  // Where nothing lines up on the other side, the hatch is boarded over.
  const hatch = (at, u0, u1) => [at(0.7, u0), at(0.86, u0), at(0.86, u1), at(0.7, u1)];
  const boards = (at) => { for (const u of [0.17, 0.31, 0.45]) { quad([at(0.67, u - 0.055), at(0.89, u - 0.055), at(0.89, u + 0.045), at(0.67, u + 0.045)], vis ? "#5e4128" : `rgba(120,135,170,${m + 0.1})`, "rgba(0,0,0,0.5)"); ctx.fillStyle = "rgba(0,0,0,0.55)"; for (const f of [0.7, 0.86]) { const n = at(f, u); ctx.fillRect(n[0] - 0.8, n[1] - 0.8, 1.6, 1.6); } } };
  const ce = (f, u) => G.ce(f, u), fl = (f, u) => G.fl(f, u);
  ctx.lineWidth = 1;
  if (room.up) {
    const joined = gy > 0 && st.g[gy - 1][gx].down;
    quad(hatch(ce, 0.12, 0.5), HOLE, WOOD); if (!joined) boards(ce);
    const b1 = fl(0.72, 0.32), b2 = fl(0.84, 0.32), t1 = ce(0.72, joined ? 0.32 : 0.5), t2 = ce(0.84, joined ? 0.32 : 0.5);
    ctx.strokeStyle = WOOD; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(...b1); ctx.lineTo(...t1); ctx.moveTo(...b2); ctx.lineTo(...t2);
    for (let k = 0.1; k < 0.98; k += 0.12) { const yy = lerp(b1[1], t1[1], k); ctx.moveTo(lerp(b1[0], t1[0], k), yy); ctx.lineTo(lerp(b2[0], t2[0], k), yy); } ctx.stroke();
  }
  if (room.down) {
    const joined = gy + 1 < H && st.g[gy + 1][gx].up;
    ctx.lineWidth = 1; quad(hatch(fl, 0.12, 0.5), HOLE, WOOD);
    if (joined) { const a = fl(0.72, 0.32), b = fl(0.84, 0.32); ctx.strokeStyle = WOOD; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(a[0], a[1] + 3); ctx.lineTo(a[0], a[1] - 5); ctx.moveTo(b[0], b[1] + 3); ctx.lineTo(b[0], b[1] - 5); ctx.moveTo(a[0], a[1] - 1); ctx.lineTo(b[0], b[1] - 1); ctx.stroke(); }
    else boards(fl);
  }
  // the name, once, on the ceiling's front edge
  ctx.font = `16px ${TITLE}`; ctx.textAlign = "left"; ctx.fillStyle = vis ? "rgba(244,230,204,0.92)" : `rgba(200,216,248,${m + 0.32})`;
  ctx.fillText(room.name, cx + 14, cy + 18); ctx.restore(); // top left: ladders and hatches keep to the right
}
function previewLit() {
  const pv = st.preview, out = new Set(); if (!pv || !pv.g || st.scene !== "play") return out;
  for (const row of st.g) for (const r of row) { const a = find(st.g, r.id), b = find(pv.g, r.id); if (a.x !== b.x || a.y !== b.y) out.add(r.id); }
  for (const id of pv.reach || []) out.add(id);
  return out;
}
// something enormous stands behind the house: only the lightning shows it
function drawWatcher(f) { // in the lightning, the burnt twin stands behind the whole house, as tall as the sky
  const im = art.twinImage(); if (!im) return;
  const w = 760, x0 = HCX - w / 2, y0 = HY + HH * 0.55 - w;
  if (!watchCv.width) { watchCv.width = watchCv.height = 256; const c = watchCv.getContext("2d"); c.drawImage(im, 0, 0, 256, 256); c.globalCompositeOperation = "source-atop"; c.fillStyle = "#07060a"; c.fillRect(0, 0, 256, 256); }
  ctx.save(); ctx.globalAlpha = Math.min(1, f * 1.3); ctx.drawImage(watchCv, x0, y0, w, w);
  ctx.shadowColor = "#ffcf90"; ctx.shadowBlur = 12; ctx.fillStyle = "rgba(255,226,180,0.95)";
  for (const u of [0.469, 0.527]) { ctx.beginPath(); ctx.arc(x0 + u * w, y0 + 0.381 * w, 4.5, 0, 7); ctx.fill(); }
  ctx.restore();
}
const watchCv = document.createElement("canvas");
// what the house says, typed out under it
function drawVoice() {
  const v = st.voice; if (!v || (st.scene !== "play" && st.scene !== "caught")) return;
  const n = Math.floor(clamp(v.t * 32, 0, v.text.length)), a = clamp(Math.min(v.t * 4, (v.len - v.t) / 0.6), 0, 1);
  // the house's voice is typed on a torn strip of paper pinned under the house, in oxblood ribbon ink (not pink
  // screen text: one voice, one look, the same paper as the sheet)
  ctx.font = `17px "Special Elite", "Courier New", monospace`; const tw = ctx.measureText(v.text).width, w = tw + 34, h = 28, cx = HCX, cy = VH - 47;
  let q = v.text.length * 977 + 13; const rn = () => { q = (q * 16807) % 2147483647; return q / 2147483647; };
  ctx.save(); ctx.globalAlpha = a; ctx.translate(cx, cy + (1 - a) * 8); ctx.rotate((rn() - 0.5) * 0.025);
  ctx.shadowColor = "rgba(0,0,0,0.65)"; ctx.shadowBlur = 8; ctx.shadowOffsetY = 2; ctx.fillStyle = "#e6d8bb";
  ctx.beginPath(); ctx.moveTo(-w / 2, -h / 2); for (let x = -w / 2; x < w / 2; x += 14) ctx.lineTo(x + 7, -h / 2 + (rn() - 0.5) * 1.2);
  ctx.lineTo(w / 2, -h / 2); for (let y = -h / 2; y < h / 2; y += 4) ctx.lineTo(w / 2 + (rn() - 0.5) * 4, y); ctx.lineTo(w / 2, h / 2);
  for (let x = w / 2; x > -w / 2; x -= 14) ctx.lineTo(x - 7, h / 2 + (rn() - 0.5) * 1.2); for (let y = h / 2; y > -h / 2; y -= 4) ctx.lineTo(-w / 2 + (rn() - 0.5) * 4, y); ctx.closePath(); ctx.fill();
  ctx.shadowColor = "transparent"; const gr = ctx.createLinearGradient(0, -h / 2, 0, h / 2); gr.addColorStop(0, "rgba(120,90,50,0.10)"); gr.addColorStop(1, "rgba(80,50,20,0.22)"); ctx.fillStyle = gr; ctx.fill();
  ctx.fillStyle = "#8a1f1a"; ctx.textAlign = "left"; ctx.fillText(v.text.slice(0, n), -tw / 2, 6); ctx.restore(); ctx.textAlign = "left";
}
// lightning: a double flash, then thunder a moment later
// "Reduce motion" on: no screen shake, and lightning is a soft single glow instead of a hard double flash.
const CALM = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
function flash() { const k = st.bolt.t; if (CALM) return Math.max(0, 0.6 - k); return k < 0.07 ? 1 : k < 0.15 ? 0.15 : k < 0.22 ? 0.85 : Math.max(0, 0.5 - k); }
function weather(dt) {
  st.bolt.t += dt; st.bolt.next -= dt;
  if (st.bolt.next <= 0) { st.bolt = { t: 0, next: 16 + Math.random() * 22, x: 60 + Math.random() * 520 }; sfx.thunder(0.5 + Math.random() * 0.8); }
}
// ---------- the buttons under the house ----------
// Small brass-edged plates with their key beside them. They're always there in play, so nobody has to know the keys.
let hudRects = [];
const HUD = () => [
  { id: "pause", label: paused ? "Resume" : "Pause", key: "P" },
  { id: "restart", label: "Restart floor", key: "R" },
  { id: "hint", label: "Hint", key: "H" },
  { id: "mute", label: sfx.isMuted() ? "Sound off" : "Sound on", key: "M" },
];
function hudButton(b, x, y, hot) { // printed labels under the house, in the sheet's type: no buttons, no boxes
  pfont(`600 12px ${ROK}`, 1); const lab = b.label.toUpperCase(), tw = ctx.measureText(lab).width;
  pfont(`400 11px ${ROK}`, 0.5); const kw = ctx.measureText(b.key).width, w = tw + kw + 14, h = 24;
  pfont(`600 12px ${ROK}`, 1); ctx.fillStyle = hot ? "#f1e4c6" : "rgba(214,200,170,0.72)"; ctx.fillText(lab, x, y + 16);
  if (hot) { ctx.fillStyle = "rgba(220,90,70,0.9)"; ctx.fillRect(x, y + 19, tw, 1.2); }
  pfont(`400 11px ${ROK}`, 0.5); ctx.fillStyle = "rgba(214,200,170,0.42)"; ctx.fillText(b.key, x + tw + 7, y + 16);
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  return { id: b.id, x: x - 4, y, w: w + 8, h };
}
function drawHud() {
  hudRects = [];
  if (!(st.scene === "play" || st.scene === "caught") || st.tear) return;
  let x = HX - 30; const y = VH - 30;
  for (const b of HUD()) { const r = hudButton(b, x, y, st.hover && st.hover.type === "hud" && st.hover.id === b.id); hudRects.push(r); x += r.w + 18; }
}
function hudPress(id) {
  if (id === "pause") setPaused(!paused);
  else if (id === "restart") restartFloor();
  else if (id === "hint" && !paused) doHint();
  else if (id === "mute") sfx.toggleMute();
}
// paused: a typed card over the house, with its choices circled like the code's words
let pauseRects = [];
function drawPause() { // a page of the sheet: its choices are boxes, like the steps
  pauseRects = []; if (!paused) return;
  ctx.fillStyle = "rgba(4,3,6,0.7)"; ctx.fillRect(0, 0, VW, VH);
  cardPage();
  ctx.save(); ctx.globalCompositeOperation = "multiply"; ctx.fillText = printed;
  try {
    cardHeader(`Assembly instructions · Floor ${st.floor} of ${FLOORS}`);
    ctx.fillStyle = PRINT.K; pfont(`700 28px ${ROK}`, 0.8); ctx.fillText("PAUSED", cx_(16), cy_(100));
    pfont(`italic 400 13px ${CAS}`); ctx.fillText("The house is holding its breath.", cx_(16), cy_(122));
    cardRule(140, 0.5);
    const items = [["resume", "RESUME", "P"], ["restart", "RESTART THIS FLOOR", "R"], ["mute", sfx.isMuted() ? "SOUND: OFF" : "SOUND: ON", "M"]];
    items.forEach(([id, label, key], i) => {
      const yy = cy_(178 + i * 40), bx = cx_(24), hot = st.hover && st.hover.type === "pause" && st.hover.id === id;
      ctx.strokeStyle = PRINT.K; ctx.lineWidth = hot ? 1.6 : 1.1; ctx.strokeRect(bx + 0.5, yy - 10.5, 11, 11); if (hot) pencilTick(bx + 1, yy + 1, 0.6);
      ctx.fillStyle = hot ? PRINT.R : PRINT.K; pfont(`700 16px ${ROK}`, 0.8); ctx.fillText(label, bx + 20, yy); const tw = ctx.measureText(label).width;
      ctx.fillStyle = PRINT.DIM; pfont(`400 12px ${ROK}`); ctx.fillText(key, bx + 30 + tw, yy);
      pauseRects.push({ id, x: bx - 6, y: yy - 20, w: tw + 60, h: 30 });
    });
  } finally { delete ctx.fillText; if ("letterSpacing" in ctx) ctx.letterSpacing = "0px"; ctx.restore(); }
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
  for (const r of hudRects) if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return { type: "hud", id: r.id };
  const hr = st.hintRect; if (hr && x >= hr.x && x <= hr.x + hr.w && y >= hr.y && y <= hr.y + hr.h) return { type: "hint" };
  if (x >= HX - 34 && x <= HX - 0 && y >= HY + HH - 68 && y <= HY + HH) return { type: "door" };
  if (x >= HX && x < HX + HW && y >= HY && y < HY + HH) return { type: "room", id: st.g[Math.floor((y - HY) / CH)][Math.floor((x - HX) / CW)].id };
  return null;
}
cv.addEventListener("pointermove", (e) => {
  const [x, y] = toView(e);
  if (paused) { st.hover = pauseAt(x, y) || hudAt(x, y); return; }
  st.hover = st.scene === "play" ? hitTest(x, y) : st.scene === "caught" ? hudAt(x, y) : st.scene === "end" ? choiceAt(x, y) : null; refreshPreview();
});
const inR = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
function pauseAt(x, y) { const r = pauseRects.find((q) => inR(q, x, y)); return r ? { type: "pause", id: r.id } : null; }
function hudAt(x, y) { const r = hudRects.find((q) => inR(q, x, y)); return r ? { type: "hud", id: r.id } : null; }
function choiceAt(x, y) { for (const r of choiceRects) if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return { type: "choice", word: r.word }; return null; }
cv.addEventListener("pointerdown", (e) => {
  touchy = e.pointerType === "touch"; // (the sheet's words follow the last thing that pressed: finger or mouse)
  sfx.init();
  if (sticky) { sticky = null; return; } // any click closes the Sticky Keys box
  const [x, y] = toView(e);
  if (paused) { const p = pauseAt(x, y) || hudAt(x, y); if (p) { if (p.id === "resume") setPaused(false); else hudPress(p.id); } return; }
  if (st.scene === "caught") { const b = hudAt(x, y); if (b) hudPress(b.id); return; }
  if (st.scene === "title") { begin(); return; }
  if (st.scene === "end") {
    if (!st.ending) { const c = choiceAt(...toView(e)); if (c) choose(c.word === "nobody" ? "free" : "keep"); return; }
    if (st.endT2 > PULL[st.ending] + 2.5) toCredits();
    return;
  }
  if (st.scene === "sheets") { st.sheetT = Math.max(st.sheetT, SHEETS_LEN); return; }
  if (st.scene === "credits") { if (st.credT > CRED_READ) openDesk(); return; }
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
  else if (h.type === "hud") hudPress(h.id);
  else if (h.type === "door") { if (st.unlocked) walkTo(st.g[H - 1][0].id, true, x, y); else float(x + 50, y, "Locked. Open the padlocks first.", RED); }
  else walkTo(h.id, false, x, y);
  refreshPreview();
});
addEventListener("keydown", (e) => {
  if (e.key === "Enter" && st.scene === "title") { sfx.init(); begin(); }
  if (e.key === "m" || e.key === "M") sfx.toggleMute();
  if (e.key === "Escape" || e.key === "p" || e.key === "P") setPaused(!paused);
  if (e.key === "r" || e.key === "R") restartFloor();
  if ((e.key === "h" || e.key === "H") && st.scene === "play" && !paused) doHint();
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
document.addEventListener("visibilitychange", () => { if (document.hidden) { remember(); if (st.scene === "play" && !st.tear) setPaused(true); } });
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
  if (on && shiftK > 0.5 && !holdSaid) { holdSaid = true; sayLine(pick(HOLD), true); sfx.slide(); }
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
const CRED_LEN = 14, SHEETS_LEN = 5.5, CRED_READ = 11.5; // (CH 11-20: the reveal went by too fast, so it takes its time and a click waits for it)
function toCredits() {
  if ((st.sheets || []).length) { st.scene = "sheets"; st.sheetT = 0; sfx.page(); } else { st.scene = "credits"; st.credT = 0; sfx.doorShut(); }
}
// the three pages you leave behind, laid down one after another on the dark, slightly askew
function drawSheets(t) {
  ctx.fillStyle = "#050407"; ctx.fillRect(0, 0, VW, VH);
  const lamp = ctx.createRadialGradient(VW / 2, VH * 0.42, 40, VW / 2, VH * 0.45, VW * 0.62); // one lamp over the table
  lamp.addColorStop(0, "rgba(120,92,58,0.55)"); lamp.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = lamp; ctx.fillRect(0, 0, VW, VH);
  const sh = st.sheets, n = sh.length, H2 = VH - 120, W2 = H2 * (sh[0].width / sh[0].height), gap = 26, x0 = VW / 2 - (n * W2 + (n - 1) * gap) / 2;
  sh.forEach((c, i) => {
    const k = clamp((t - 0.3 - i * 0.7) / 0.5, 0, 1); if (!k) return;
    ctx.save(); ctx.globalAlpha = k; ctx.translate(x0 + i * (W2 + gap) + W2 / 2, 60 + H2 / 2 + (1 - k) * 18); ctx.rotate([-0.035, 0.02, -0.012][i % 3]);
    ctx.shadowColor = "rgba(0,0,0,0.8)"; ctx.shadowBlur = 24; ctx.drawImage(c, -W2 / 2, -H2 / 2, W2, H2); ctx.shadowColor = "transparent";
    ctx.globalCompositeOperation = "soft-light"; ctx.fillStyle = "rgba(255,236,200,0.35)"; ctx.fillRect(-W2 / 2, -H2 / 2, W2, H2); ctx.restore(); // in the lamp's light
  });
  const a = clamp((t - 0.3 - n * 0.7) / 0.6, 0, 1);
  if (a) { ctx.globalAlpha = a; centerText("house.js, floors 1 to " + n + ". Typed by you, and by it.", VH - 30, `italic 18px ${SERIF}`, "#d6ccb6"); ctx.globalAlpha = 1; }
}
function retype(a, b, k) { return k < 0.5 ? a.slice(0, Math.round(a.length * (1 - 2 * k))) : b.slice(0, Math.round(b.length * (2 * k - 1))); }
function stepText(list, t, at, len = 0.7) {
  let i = 0; for (const a of at) if (t >= a) i++;
  const k = i < at.length ? clamp((t - (at[i] - len)) / len, 0, 1) : 1, cur = list[i] ?? list[list.length - 1];
  return { i, text: i < at.length && k > 0 ? retype(cur, list[i + 1], k) : cur, editing: i < at.length && k > 0 && k < 1 };
}
function drawCredits(t) {
  ctx.fillStyle = "#050407"; ctx.fillRect(0, 0, VW, VH);
  const a = clamp(t * 2, 0, 1); ctx.globalAlpha = a;
  centerText(CREDITS.title, 150, `56px ${TITLE}`, INK);
  // the shadow edits its own line (slowly, so you see each keystroke), holds it, then shrinks yours
  const sh = stepText(CREDITS.shadow, t, [3.6, 6.4], 1.6), yo = stepText(CREDITS.you, t, [9.0, 10.8], 1.4);
  const ss = [24, 38, 64][Math.min(2, sh.i)], ys = [24, 18, 15][Math.min(2, yo.i)];
  centerText(yo.text + (yo.editing ? "_" : ""), 230, `${ys}px ${MONO}`, sh.i ? DIM : INK);
  centerText(sh.text + (sh.editing ? "_" : ""), 240 + 30 + ss * 0.6, `${ss}px ${MONO}`, sh.i ? RED : INK);
  if (t > 12) centerText(CREDITS.real, VH - 60, `italic 18px ${SERIF}`, DIM);
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
// a phone held upright shows the "turn me sideways" card (index.html), and the house waits for you
const upright = typeof matchMedia === "function" ? matchMedia("(orientation: portrait) and (max-width: 600px) and (pointer: coarse)") : { matches: false };
// If the 3D house runs slow on this machine, it steps down to fewer pixels, then drops the lantern's shadows.
let slowT = 0, slowN = 0;
function pace(raw) {
  if (!in3d() || dh.getQuality() >= 2 || document.hidden || raw > 0.5) return;
  slowT += raw; slowN++;
  if (slowN >= 90) { if (slowT / slowN > 0.026) dh.setQuality(dh.getQuality() + 1); slowT = 0; slowN = 0; }
}
function frame(now) { if (upright.matches) { last = now; requestAnimationFrame(frame); return; } pace((now - last) / 1000); const dt = Math.min(0.05, (now - last) / 1000); last = now; if (sticky && (sticky.t += dt) > 6) sticky = null; update(dt); render(); requestAnimationFrame(frame); }
requestAnimationFrame(frame);

// hooks for automated checks
window.__dh = {
  screenPos: (id, fx) => screenPos(id, fx),
  pickHouseMove: () => pickHouseMove(), houseMove: (m) => performEdit(m.id, m.li, m.dir, true), houseMoves, st: () => st, begin: () => { st.scene = "play"; }, choose: (w) => choose(w), say: (k) => say(k), choiceRects: () => choiceRects, nextFloor: () => nextFloor(), solve, hint: () => doHint(), edit: (li, d) => doEdit(li, d), edits, path, walk: (id, exit) => walkTo(id, exit, 0, 0),
  reach, find, byId, clone, applyEdit, newGame, muted: () => sfx.isMuted(), sticky: () => sticky, gag: () => ({ gag: !!st.gag, nudged: !!st.nudged, sign: !!st.sign, sticker: !!st.sticker }), undone: () => undone, undo: () => undo(), line: (t) => sayLine(t), float: (x, y, t) => float(x, y, t, RED), touchy: (on) => { touchy = on; }, tapWords: (t) => tapWords(t), hush: () => { st.voice = null; st.voiceQ = []; st.quiet = 99; st.sign = st.sticker = null; }, lift: () => lift(), junk: () => junk.length, tick: (dt, n) => { for (let i = 0; i < n; i++) update(dt); }, render: () => render(), upright: () => upright.matches, dragBack: () => dragBack(), previewLit: () => [...previewLit()], deskHit: desk.deskHit, shiftK: () => shiftK, goneFor, openDesk: () => openDesk(), trapped: (b) => trapped(b), awayLine: () => awayLine, calm: () => CALM, flash: () => flash(),
  plates: () => plates(), in3d: () => in3d(), info3d: () => dh.info(), roomAt3d: (id) => dh.roomAt(id), draw3d: () => draw3d(), scene3d: () => dh.forExport(), // (stills: the 3D picture alone, no page or buttons on top)
  tapTyped: (on) => { const t = typedTap || []; typedTap = on ? [] : null; return t; }, keepSheet: () => keepSheet(), toCredits: () => toCredits(), pageInk: (dt) => pageInk(dt),
  whyNoWay: (a, b) => whyNoWay(a, b), hintHolds: () => hintHolds(), houseTick: (dt) => houseUpdate(dt),
  paused: () => paused, restart: () => restartFloor(), hudRects: () => hudRects, pauseRects: () => pauseRects, roomGeo: (x, y) => roomGeo(x, y),
};
