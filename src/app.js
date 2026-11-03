// The Shifting House: a doll's house cut open. Click a room to walk there; click a word in the house's code
// to change the house. Two locks, a front door, and a shadow that hunts you through the rooms.
import { W, H, FLOOR, byId, find, nbrs, path, reach, clone, applyEdit, edits, solve, pickHouse, pageRoom, NEW_WORD } from "./house.js";
import { COMMITS, PAGES, VOICE, ENDING } from "./story.js";
import * as sfx from "./sound.js";
import * as art from "./art.js";


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
function newGame(seed, floor = 1, carry = null) {
  const h = pickHouse(floor, seed);
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
    page: { id: pageRoom(h, floor), got: false }, pages: carry ? carry.pages : 0, said: carry ? carry.said : new Set(),
    voice: null, pageShow: null, started: false, blackout: 0, faceBolt: false, faced: false, typed: null, ending: null, endT2: 0, idleSaid: false,
  };
  if (carry) { st.grabs = carry.grabs; st.scene = "play"; st.shadow.mode = "sleep"; }
}
function nextFloor() {
  const carry = { grabs: st.grabs, total: st.total, bolt: st.bolt, pages: st.pages, said: st.said };
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
function say(key) {
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
  settle(st.player); settle(st.shadow); st.player.pending = null;
  const room = byId(st.g, st.player.id), c = room.lines[li];
  if (c.kind === "lock" && st.unlocked) return;
  const res = applyEdit(st.g, room.id, li, st, dir); unseal();
  if (st.shadow.mode !== "sleep" && !path(st.g, st.shadow.id, st.player.id) && st.shadow.noPath === 0) { trapped(true); st.shadow.noPath = 0.01; }
  st.edits++; st.hint = null; if (res.kind !== "lights" && res.kind !== "lock") st.moves++;
  st.glitch = 0.5; st.shake = res.kind === "row" || res.kind === "col" ? 0.6 : 0.25;
  st.writeBack = { li, t: 0 }; st.alert = 4; st.preview = null; st.previewKey = "";
  if (res.kind === "row" || res.kind === "col") { st.anim = { ...res, t: 0 }; sfx.slide(); dustBurst(res); }
  else if (res.kind === "swap") { st.anim = { ...res, t: 0 }; sfx.swap(); }
  else if (res.kind === "flip") { st.anim = { ...res, t: 0, slow: true }; sfx.flip(); st.shake = 1; }
  else if (res.kind === "door") (res.open ? sfx.doorOpen : sfx.doorShut)();
  else if (res.kind === "lights") sfx.lights(res.on);
  if (res.kind === "lock") { float(HX + 60, HY + HH - 90, "the front door is open", GRN); sfx.unlock(); say("unlock"); }
  else if (res.kind === "flip") { say("flip"); if (st.floor === 3 && !st.typed) st.typed = { t: -2.6 }; }
  else say("firstEdit");
  if (st.shadow.mode === "sleep") { wake(); think("shadow.awake = true;   // you made noise"); }
}

// house.hint(): the next word of the shortest way out
function doHint() {
  const plan = solve(st.g, st.player.id, st.h.lockIds, st.unlocked, 4);
  st.total.hints++; sfx.hint();
  if (!plan) st.hint = { text: "Hint: even the house is lost. Try sliding a row back the way it came." };
  else if (!plan.length) st.hint = { text: st.unlocked ? "Hint: the way is open. Click the front door, bottom left." : "Hint: a red lock is in reach. Walk there and click true." };
  else {
    const m = plan[0], room = byId(st.g, m.id), word = lineParts(room, room.lines[m.li], true)[1].find((w) => (w.dir ?? 1) === m.dir).text;
    st.hint = { ...m, text: m.id === st.player.id ? `Hint: click "${word}" in this room's code.` : `Hint: walk to the ${room.name} (yellow frame), then click "${word}" in its code.` };
  }
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
  st.floats = st.floats.filter((f) => (f.t += dt) < 1.4);
  st.dust = st.dust.filter((d) => { d.t += dt; d.x += d.vx * dt; d.y += d.vy * dt; d.vy += 40 * dt; return d.t < d.life; });
  if (st.scene === "caught") { st.caughtT += dt; if (st.caughtT > 2.4) dragBack(); return; }
  if (st.scene === "end") { st.endT += dt; if (st.ending) endingUpdate(dt); else if (st.endT > (st.pages >= 3 ? 16.5 : 8)) choose("keep"); return; }
  if (st.scene === "floor") { st.endT += dt; return; }
  if (st.scene !== "play") return;
  if (!st.started) { st.started = true; say(st.floor === 1 ? (lastEnding() ? "start1again" : "start1") : `start${st.floor}`); }
  if (st.floorT > 45 && st.edits > 0 && !st.idleSaid) { st.idleSaid = true; say("idle"); }
  // floor 3: lightning, and for a moment something enormous behind the house
  if (st.floor === 3 && !st.faced && st.sinceStart > 7) { st.faced = true; st.faceBolt = true; st.bolt = { t: 0, next: 20, x: HCX }; sfx.thunder(0.7); say("face"); }
  st.sinceStart += dt; st.floorT += dt; st.alert = Math.max(0, st.alert - dt);
  if (st.anim) { st.anim.t += dt / (st.anim.slow ? 1.3 : 0.7); if (st.anim.t >= 1) st.anim = null; else return; }

  advance(st.player, dt, 250, (way, pending) => {
    st.walked++;
    if (way && way.exit) floorDone();
    if (pending) walkTo(pending.id, pending.exit, 0, 0);
  });
  if (st.page.id != null && !st.page.got && st.player.id === st.page.id) {
    st.page.got = true; st.pages++; st.pageShow = { t: 0, n: st.floor }; sfx.page(); say("page");
    const p = walkerPos(st.player); float(p[0] - 10, p[1] - 50, `a torn page (${st.pages} of 3)`, "#e8dcc0");
  }

  const sh = st.shadow, speed = PACE[st.floor - 1] / (1 + 0.22 * st.grabs);
  if (sh.mode === "sleep") {
    if (st.sinceStart > (st.floor === 1 ? 30 : 8)) { wake(); think("shadow.awake = true;"); }
  } else if (sh.way) advance(sh, dt, sh.seep ? speed * 0.5 : speed, () => { sh.seep = false; });
  else if ((sh.timer -= dt) <= 0) planShadow();

  const pp = walkerPos(st.player), sp = walkerPos(sh);
  if (sh.mode !== "sleep" && Math.hypot(pp[0] - sp[0], pp[1] - sp[1]) < 24) { st.scene = "caught"; st.caughtT = 0; think("found(you);"); sfx.caught(); say("caught"); }
  sfx.update(dt, nearness());
  if (st.player.way && (st.stepT -= dt) <= 0) { sfx.step(); st.stepT = 0.27; }
}
// it wakes. On floor 2 every lamp in the house dies with it, for a moment.
function wake() {
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
  if (byYou) { st.traps++; const sp = walkerPos(st.shadow); float(sp[0] + 20, sp[1] - 60, "you shut it in", GRN); say("trap"); }
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
    ctx.save(); ctx.shadowColor = col; ctx.shadowBlur = 12 + 6 * Math.sin(st.t * 4); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(lx, ly - 4 - (st.unlocked ? 5 : 0), 6, Math.PI, 0); ctx.stroke(); ctx.fillRect(lx - 8, ly - 3, 16, 12); ctx.restore();
  }
  art.furniture(ctx, room, G, L, st.t);
  // a torn page on the floor, glowing faintly
  if (st.page.id === room.id && !st.page.got) {
    const [px, py] = G.fl(0.3, 0.25), k = 0.6 + 0.4 * Math.sin(st.t * 3 + 1);
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
  const sh = st.shadow, pp = walkerPos(st.player);
  art.shadow(ctx, x, y, st.t, { asleep: sh.mode === "sleep", seep: sh.seep, near: nearness(), look: clamp((pp[0] - x) / 60, -1, 1) });
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

function drawHouse() {
  art.roof(ctx, { x: HX, y: HY, w: HW, h: HH }, st.t, HX + HW + 8);
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
  // reach outlines
  if (pv && pv.reach) for (const id of pv.reach) { const p = find(pv.g, id); outlineSlot(p.x, p.y, st.h.lockIds.includes(id) && !st.unlocked ? RED : GRN, true); }
  if (st.reachFlash > 0) { ctx.save(); ctx.globalAlpha = Math.min(1, st.reachFlash); for (const id of reach(st.g, st.player.id)) { const p = find(st.g, id); outlineSlot(p.x, p.y, "rgba(240,230,210,0.7)", true); } ctx.restore(); }
  if (st.hover && st.hover.type === "room" && !pv && st.scene === "play") {
    const p = find(st.g, st.hover.id), ok = reach(st.g, st.player.id).has(st.hover.id);
    outlineSlot(p.x, p.y, ok ? "rgba(240,230,210,0.55)" : "rgba(255,90,78,0.6)", false);
  }
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
  if (pv && pv.band && (pv.band.kind === "row" || pv.band.kind === "col")) {
    const b = pv.band, a = 0.5 + 0.4 * Math.sin(st.t * 6); ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = YEL; ctx.fillStyle = YEL; ctx.lineWidth = 4;
    let x1, y1, x2, y2;
    if (b.kind === "row") { const yy = HY + b.i * CH + CH * 0.5; x1 = HX + 60; x2 = HX + HW - 60; y1 = y2 = yy; if (b.dir < 0) [x1, x2] = [x2, x1]; }
    else { const xx = HX + b.i * CW + CW * 0.5; y1 = HY + 40; y2 = HY + HH - 40; x1 = x2 = xx; if (b.dir < 0) [y1, y2] = [y2, y1]; }
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    const ang = Math.atan2(y2 - y1, x2 - x1); ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - 18 * Math.cos(ang - 0.5), y2 - 18 * Math.sin(ang - 0.5)); ctx.lineTo(x2 - 18 * Math.cos(ang + 0.5), y2 - 18 * Math.sin(ang + 0.5)); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
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
  ctx.font = `15px ${MONO}`; ctx.fillStyle = YEL; ctx.fillText("● house.js", x - 4, 13);
  // the shadow's thought
  ctx.font = `16px ${MONO}`; ctx.fillStyle = DIM; ctx.fillText("// it thinks", x, 42);
  const th = st.thought.t < 0.25 ? glitchText(st.thought.text, 0.7) : st.thought.text;
  const s0 = fitFont(th, w, 24); ctx.fillStyle = RED; ctx.fillText(th, x, 68);
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
  if (st.writeBack) {
    ctx.font = `20px ${MONO}`; ctx.fillStyle = `rgba(255,90,78,${Math.min(1, 2.2 - st.writeBack.t)})`;
    ctx.fillText(glitchText("house.watch(you);", Math.max(0, 0.4 - st.writeBack.t)), x, y - 8);
  }
  // floor 3, after the flip: the house writes a line of its own, then thinks better of it
  if (st.typed && st.typed.t > 0 && st.typed.t < 6.5 && !st.writeBack) {
    const full = "you.trapped = true;", note = "  // not yet", k = st.typed.t;
    const txt = k < 2 ? full.slice(0, Math.floor(k * 11)) : k < 3.2 ? full : full + note.slice(0, Math.floor((k - 3.2) * 14));
    ctx.font = `20px ${MONO}`; ctx.fillStyle = `rgba(255,90,78,${Math.min(1, 6.5 - k)})`;
    ctx.fillText(txt + (Math.sin(st.t * 10) > 0 ? "_" : ""), x, y - 8);
  }
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
  } else if (st.pageShow && !hw) {
    ctx.font = `16px ${MONO}`; ctx.fillStyle = "#e8dcc0"; ctx.fillText(`// a torn page (${st.pages} of 3)`, x, sep + 22);
    ctx.font = `italic 16px ${SERIF}`; ctx.fillStyle = `rgba(232,220,192,${Math.min(1, 10 - st.pageShow.t)})`; wrap(PAGES[st.pageShow.n], x, sep + 48, w, 19);
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
  for (let i = 0; i < 140; i++) { ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`; ctx.fillRect(Math.random() * VW, Math.random() * VH, 1, 1); }
  for (const f of st.floats) { ctx.font = `20px ${MONO}`; ctx.fillStyle = f.color; ctx.globalAlpha = 1 - f.t / 1.4; ctx.fillText(f.text, f.x - 40, f.y - f.t * 30); ctx.globalAlpha = 1; }
}
// commit 212  "it moved a room tonight..."  (typed: n letters of the message)
function commitText(floor, n) { const [c, msg] = COMMITS[floor]; return `${c}   "${msg.slice(0, Math.max(0, Math.floor(n)))}"`; }
let choiceRects = [];
function drawEnd() {
  const k = st.endT, e = st.ending, k2 = st.endT2; choiceRects = [];
  const dark = e === "free" ? Math.max(0.3, 0.9 - k2 * 0.25) : Math.min(0.9, k * 1.2);
  ctx.fillStyle = `rgba(0,0,0,${dark})`; ctx.fillRect(0, 0, VW, VH);
  if (e === "free") return drawFreed();
  const line = ENDING.line, n = Math.floor(clamp((k - 1) * 18, 0, line.length));
  if (k > 1) centerText(line.slice(0, n), VH / 2 - 60, `26px ${MONO}`, n < line.length ? INK : RED);
  if (!e && k > 4.4) {
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
  if (e === "keep") {
    if (k2 > 0.4) centerText(ENDING.keep[0], VH / 2 + 10, `italic 22px ${SERIF}`, INK);
    if (k2 > 1.8) centerText(ENDING.keep[1], VH / 2 + 42, `italic 22px ${SERIF}`, DIM);
    if (k2 > 2.6) { ctx.fillStyle = "#f3e9d2"; const fx = HX - 17, fy = HY + HH - 44; ctx.fillRect(fx - 5, fy, 3, 3); ctx.fillRect(fx + 3, fy, 3, 3); }
    endStats(k2, VH - 90, VH - 52);
  }
}
// free: two of you walk out, the rain stops, the house goes dark room by room
function drawFreed() {
  const k2 = st.endT2, gy = HY + HH + 30, walk = Math.min(1, Math.max(0, k2 - 2.2) / 9) * 260;
  const x1 = HX - 16 + walk, x2 = HX - 40 + walk * 0.96;
  drawPlayer(x1, gy);
  if (k2 < 1.6) art.shadow(ctx, x2, gy, st.t, { asleep: false, seep: false, near: 3, look: -1 });
  else { ctx.globalAlpha = clamp((k2 - 1.6) / 0.8, 0, 1); art.player(ctx, x2, gy, st.t, walk > 0); ctx.globalAlpha = 1; }
  ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(0, 0, VW, 150);
  if (k2 > 0.4) centerText(ENDING.free[0], 52, `28px ${MONO}`, GRN);
  if (k2 > 2) centerText(ENDING.free[1], 86, `italic 21px ${SERIF}`, INK);
  endStats(k2 + 1, 116, 140);
}
function endStats(k2, y1, y2) {
  if (k2 > 3.4) centerText(`3 floors in ${st.total.moves} moves (the house's best: ${st.total.par}), ${st.grabs} grab${st.grabs === 1 ? "" : "s"}, ${st.total.hints} hint${st.total.hints === 1 ? "" : "s"}, ${st.pages} of 3 pages.`, y1, `20px ${MONO}`, INK);
  if (k2 > 4.4) centerText(st.ending === "free" ? "Click to build a new house." : "Click to try again. It's waiting.", y2, `20px ${MONO}`, DIM);
}
function centerText(text, y, font, color) { ctx.font = font; ctx.fillStyle = color; ctx.textAlign = "center"; ctx.fillText(text, VW / 2, y); ctx.textAlign = "left"; }
function drawScenes() {
  if (st.scene === "title") {
    ctx.fillStyle = "rgba(5,4,7,0.72)"; ctx.fillRect(0, 0, VW, VH);
    const back = lastEnding();
    centerText(commitText(1, 99), 120, `20px ${MONO}`, DIM);
    centerText("THE SHIFTING HOUSE", 210, `64px ${MONO}`, INK);
    centerText(back === "free" ? "Nobody home. Or so it says." : back === "keep" ? "Welcome back. It kept your room just as you left it." : "You wrote this house. It never let you leave.", 248, `italic 20px ${SERIF}`, back ? RED : DIM);
    centerText("Mouse only, three floors. Click a room to walk there.", 318, `22px ${SERIF}`, INK);
    centerText("The house's code is on the right. Every yellow word changes the house.", 348, `22px ${SERIF}`, INK);
    centerText("Something is asleep downstairs. Shut it in a room, and it has to claw its way out.", 378, `22px ${SERIF}`, INK);
    centerText("Click to begin", 450, `30px ${MONO}`, Math.sin(st.t * 3) > -0.3 ? YEL : DIM);
  } else if (st.scene === "caught") {
    const k = st.caughtT;
    ctx.fillStyle = k < 0.15 ? "rgba(160,20,20,0.6)" : `rgba(0,0,0,${Math.min(0.94, k * 1.5)})`; ctx.fillRect(0, 0, VW, VH);
    if (k > 0.3) centerText(glitchText("found(you);", Math.max(0, 0.8 - k)), VH / 2, `48px ${MONO}`, RED);
    if (k > 1.1) centerText("It drags you back. It's slower now.", VH / 2 + 44, `italic 20px ${SERIF}`, DIM);
  } else if (st.scene === "floor") {
    const k = st.endT; ctx.fillStyle = `rgba(0,0,0,${Math.min(0.92, k * 1.5)})`; ctx.fillRect(0, 0, VW, VH);
    if (k > 0.4) {
      centerText(commitText(st.floor + 1, (k - 0.4) * 30), 150, `20px ${MONO}`, DIM);
      centerText(`Floor ${st.floor} of ${FLOORS}: out.`, 220, `44px ${MONO}`, INK);
      const best = st.moves <= st.h.par;
      centerText(`You used ${st.moves} move${st.moves === 1 ? "" : "s"}. The house's best: ${st.h.par}.`, 276, `24px ${MONO}`, best ? GRN : INK);
      if (best) centerText("You matched the house.", 306, `italic 20px ${SERIF}`, GRN);
      centerText(`The front door opens onto stairs going down. Floor ${st.floor + 1} needs ${st.floor + 1} moves, and it's faster down there.`, 360, `italic 19px ${SERIF}`, DIM);
      const nw = NEW_WORD[st.floor + 1]; if (nw) centerText(`New word: ${nw.code}`, 396, `24px ${MONO}`, YEL);
      if (k > 1.2) centerText("Click to go down", 440, `28px ${MONO}`, Math.sin(st.t * 3) > -0.3 ? YEL : DIM);
    }
  } else if (st.scene === "end") drawEnd();
}

function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  art.night(ctx, VW, VH, { x: HX, y: HY, w: HW, h: HH }, st.t, flash(), st.bolt.x);
  if (st.faceBolt && flash() > 0.1) drawWatcher(flash());
  const dry = st.ending === "free" ? clamp((st.endT2 - 1) / 3, 0, 1) : 0;
  if (dry < 1) { ctx.globalAlpha = 1 - dry; art.rain(ctx, VW, VH, st.t); ctx.globalAlpha = 1; }
  ctx.save();
  if (st.shake > 0) ctx.translate((Math.random() - 0.5) * 12 * st.shake, (Math.random() - 0.5) * 12 * st.shake);
  drawHouse(); ctx.restore();
  const f = flash(); if (f > 0) { ctx.fillStyle = `rgba(210,220,255,${f * 0.22})`; ctx.fillRect(0, 0, PX - 14, VH); }
  drawPanel(); scanlines(); drawOverlay(); drawVoice(); drawScenes(); drawMute();
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
  const [x, y] = toView(e);
  if (st.scene === "title") { st.scene = "play"; return; }
  if (st.scene === "end") {
    if (!st.ending) { const c = choiceAt(...toView(e)); if (c) choose(c.word === "nobody" ? "free" : "keep"); return; }
    if (st.endT2 > (st.ending === "free" ? 3.4 : 4.4)) { sfx.reset(); newGame((Math.random() * 1e9) | 0); }
    return;
  }
  if (st.scene === "floor") { if (st.endT > 1.2) nextFloor(); return; }
  if (st.scene !== "play") return;
  const h = hitTest(x, y); st.hover = h;
  if (!h) return;
  if (h.type === "word") doEdit(h.li, h.dir);
  else if (h.type === "hint") doHint();
  else if (h.type === "mute") sfx.toggleMute();
  else if (h.type === "door") { if (st.unlocked) walkTo(st.g[H - 1][0].id, true, x, y); else float(x + 50, y, "frontDoor.locked = true;", RED); }
  else walkTo(h.id, false, x, y);
  refreshPreview();
});
addEventListener("keydown", (e) => {
  if (e.key === "Enter" && st.scene === "title") { sfx.init(); st.scene = "play"; }
  if (e.key === "m" || e.key === "M") sfx.toggleMute();
});

function dustBurst(res) {
  for (let i = 0; i < 70; i++) {
    let x, y; if (res.kind === "row") { x = HX + Math.random() * HW; y = HY + res.i * CH + (Math.random() < 0.5 ? 0 : CH); } else { x = HX + res.i * CW + (Math.random() < 0.5 ? 0 : CW); y = HY + Math.random() * HH; }
    st.dust.push({ x, y, vx: (Math.random() - 0.5) * 40, vy: -Math.random() * 30, t: 0, life: 0.8 + Math.random() * 0.8 });
  }
}

// ---------- loop ----------
newGame(Number(new URLSearchParams(location.search).get("seed")) || ((Math.random() * 1e9) | 0));
let last = performance.now();
function frame(now) { const dt = Math.min(0.05, (now - last) / 1000); last = now; update(dt); render(); requestAnimationFrame(frame); }
requestAnimationFrame(frame);

// hooks for automated checks
window.__dh = {
  st: () => st, begin: () => { st.scene = "play"; }, choose: (w) => choose(w), say: (k) => say(k), choiceRects: () => choiceRects, nextFloor: () => nextFloor(), solve, hint: () => doHint(), edit: (li, d) => doEdit(li, d), edits, path, walk: (id, exit) => walkTo(id, exit, 0, 0),
  reach, find, byId, clone, applyEdit, newGame, muted: () => sfx.isMuted(),
};
