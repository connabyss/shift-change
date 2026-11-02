// The house: a doll's house of rooms, W across and H floors high, and the lines of code that move them.
// Pure logic, no drawing: the game, the hint and the tests all use it.
//
// A room: { id, name, l, r, up, down, lights, wall, decor, lines }
//   l / r: an opening in its west / east wall. Two rooms side by side connect when both face each other open.
//   up / down: a ladder up through its ceiling / a hole in its floor. A room connects to the one above when
//   it has up and that one has down.
// A line of code: { kind }  row | col (slides, two words: west|east, up|down), swap (west|east),
//   door (side west/east), lights, lock (opens the front door), flip (the whole house turns over).
import { rng } from "./rng.js";

export const W = 4, H = 3;
export const NAMES = ["attic", "nursery", "study", "chapel", "parlour", "library", "gallery", "bath", "kitchen", "pantry", "cellar", "hall"];
export const PAL = [[96, 60, 54], [58, 74, 60], [88, 74, 46], [54, 60, 82], [82, 52, 66], [70, 64, 54]];
export const FLOOR = [70, 50, 36];

export function byId(g, id) { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[y][x].id === id) return g[y][x]; return null; }
export function find(g, id) { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[y][x].id === id) return { x, y }; return null; }
export function nbrs(g, x, y) {
  const out = [], r = g[y][x];
  if (x + 1 < W && r.r && g[y][x + 1].l) out.push([x + 1, y]);
  if (x > 0 && r.l && g[y][x - 1].r) out.push([x - 1, y]);
  if (y + 1 < H && r.down && g[y + 1][x].up) out.push([x, y + 1]);
  if (y > 0 && r.up && g[y - 1][x].down) out.push([x, y - 1]);
  return out;
}
export function path(g, fromId, toId) {
  const s = find(g, fromId); if (!s) return null;
  const prev = new Map([[fromId, null]]), q = [s];
  while (q.length) {
    const { x, y } = q.shift(), id = g[y][x].id;
    if (id === toId) { const out = []; let k = id; while (k !== null) { out.unshift(k); k = prev.get(k); } return out; }
    for (const [nx, ny] of nbrs(g, x, y)) { const n = g[ny][nx].id; if (!prev.has(n)) { prev.set(n, id); q.push({ x: nx, y: ny }); } }
  }
  return null;
}
export function reach(g, fromId) {
  const s = find(g, fromId), seen = new Set([fromId]), q = [s];
  while (q.length) { const { x, y } = q.shift(); for (const [nx, ny] of nbrs(g, x, y)) { const n = g[ny][nx].id; if (!seen.has(n)) { seen.add(n); q.push({ x: nx, y: ny }); } } }
  return seen;
}
export function shiftRow(g, y, d) { const row = g[y]; g[y] = row.map((_, x) => row[(x - d + W * 2) % W]); }
export function shiftCol(g, x, d) { const col = g.map((r) => r[x]); for (let y = 0; y < H; y++) g[y][x] = col[(y - d + H * 2) % H]; }
export const clone = (g) => g.map((row) => row.map((r) => ({ ...r, lines: r.lines.map((l) => ({ ...l })) })));

// Change one word. Returns what happened, for animation.
// dir: for a slide, which of its two words you picked (-1 = west/up, 1 = east/down)
export function applyEdit(g, id, li, world, dir = 1) {
  const p = find(g, id), room = g[p.y][p.x], c = room.lines[li];
  if (c.kind === "row") { shiftRow(g, p.y, dir); return { kind: "row", i: p.y, dir }; }
  if (c.kind === "col") { shiftCol(g, p.x, dir); return { kind: "col", i: p.x, dir }; }
  if (c.kind === "door") {
    const west = c.side === "west", k = west ? "l" : "r", v = !room[k]; room[k] = v;
    const nx = p.x + (west ? -1 : 1); if (nx >= 0 && nx < W) g[p.y][nx][west ? "r" : "l"] = v;
    return { kind: "door", open: v };
  }
  if (c.kind === "swap") { // trade places with the room next door (wrapping round the row)
    const nx = (p.x + dir + W) % W; [g[p.y][p.x], g[p.y][nx]] = [g[p.y][nx], g[p.y][p.x]];
    return { kind: "swap", y: p.y, a: p.x, b: nx };
  }
  if (c.kind === "flip") { // the whole house turns upside down: floors change places, ladders become holes
    g.reverse(); for (const row of g) for (const r of row) [r.up, r.down] = [r.down, r.up];
    if (world) world.flipped = !world.flipped; return { kind: "flip" };
  }
  if (c.kind === "lights") { room.lights = !room.lights; return { kind: "lights", on: room.lights }; }
  if (c.kind === "lock") { if (world) world.unlocked = true; return { kind: "lock" }; }
  return null;
}

export function makeHouse(seed, floor = 1) {
  const R = rng(seed), names = [...NAMES];
  for (let i = names.length - 1; i > 0; i--) { const j = (R() * (i + 1)) | 0; [names[i], names[j]] = [names[j], names[i]]; }
  let id = 0; const g = [];
  for (let y = 0; y < H; y++) { g.push([]); for (let x = 0; x < W; x++) g[y].push({ id: id, name: names[id++], l: R() < 0.62, r: R() < 0.62, up: false, down: false, lights: true, wall: PAL[(R() * PAL.length) | 0], decor: (R() * 4) | 0, lines: [] }); }
  for (let y = 0; y < H - 1; y++) {
    const c = (R() * W) | 0; g[y][c].down = true; g[y + 1][c].up = true;
    g[y][(R() * W) | 0].down = true; g[y + 1][(R() * W) | 0].up = true;
  }
  // every room gets 2 or 3 words: one slide, plus doors or lights
  for (const row of g) for (const room of row) {
    const pool = [R() < 0.62 || floor === 3 ? { kind: "row" } : { kind: "col" }]; // floor 3: only the flip moves rooms up and down
    const extra = [{ kind: "door", side: "west" }, { kind: "door", side: "east" }, { kind: "lights" }];
    for (let i = extra.length - 1; i > 0; i--) { const j = (R() * (i + 1)) | 0; [extra[i], extra[j]] = [extra[j], extra[i]]; }
    pool.push(...extra.slice(0, R() < 0.45 ? 2 : 1));
    room.lines = pool;
    if (!room.l && !room.r) room[R() < 0.5 ? "l" : "r"] = true;
  }
  const start = g[0][W - 1]; start.l = start.r = true;
  start.lines = [{ kind: "row" }, { kind: "door", side: "west" }];
  // two rooms hold the lock: either one opens the front door
  const locks = [];
  while (locks.length < 2) {
    const r = g[(R() * H) | 0][(R() * W) | 0];
    if (r !== start && r !== g[H - 1][0] && !locks.includes(r) && !(locks[0] && find(g, locks[0].id).y === find(g, r.id).y && Math.abs(find(g, locks[0].id).x - find(g, r.id).x) < 2)) locks.push(r);
  }
  for (const r of locks) r.lines = [{ kind: "lock" }, r.lines[0]];
  // floor 2 brings swap, floor 3 the flip
  if (floor >= 2) for (const row of g) for (const r of row) if (R() < (floor === 2 ? 0.4 : 0.22)) {
    const sw = { kind: "swap" }; if (r.lines.length >= 3) r.lines[2] = sw; else r.lines.push(sw);
  }
  if (floor >= 3) {
    let r; do { r = g[(R() * H) | 0][(R() * W) | 0]; } while (r === start);
    if (r.lines.length >= 3) r.lines[r.lines.length - 1] = { kind: "flip" }; else r.lines.push({ kind: "flip" });
  }
  // the new word is always in your first room, so you meet it at once
  if (floor === 2) start.lines.push({ kind: "swap" });
  if (floor === 3) start.lines.push({ kind: "flip" });
  return { g, startId: start.id, lockIds: locks.map((r) => r.id), shadowId: g[H - 1][0].id };
}
// every edit you could make in a room: [line index, direction]
export function edits(room) { const out = []; room.lines.forEach((c, li) => { if (c.kind === "row" || c.kind === "col" || c.kind === "swap") out.push([li, -1], [li, 1]); else if (c.kind !== "lock") out.push([li, 1]); }); return out; }
// Good first floor: you can walk a bit, the lock is out of reach, and ONE word in reach brings it (and then the door) within reach.
// The fewest words to change (slides and doors) until a lock, and the door after it, are in reach.
// Returns the plan [{id, li, dir}] or null if it takes more than maxDepth.
export function solve(g0, me0, lockIds, unlocked, maxDepth = 3, without = null) {
  const exitOk = (g, R) => unlocked ? R.has(g[H - 1][0].id) : lockIds.some((l) => R.has(l) && reach(g, l).has(g[H - 1][0].id));
  const key = (g, R) => g.map((r) => r.map((x) => x.id + (x.l ? "L" : "") + (x.r ? "R" : "")).join(",")).join("/") + "@" + [...R].sort((a, b) => a - b).join(",");
  const R0 = reach(g0, me0);
  let frontier = [{ g: g0, R: R0, plan: [] }]; const seen = new Set([key(g0, R0)]);
  for (let d = 0; d <= maxDepth; d++) {
    const next = [];
    for (const st0 of frontier) {
      if (exitOk(st0.g, st0.R)) return st0.plan;
      if (d === maxDepth) continue;
      for (const id of st0.R) for (const [li, dir] of edits(byId(st0.g, id))) {
        const kd = byId(st0.g, id).lines[li].kind; if (kd === "lights" || kd === without) continue;
        const c = clone(st0.g); applyEdit(c, id, li, null, dir); const R = reach(c, id), k = key(c, R);
        if (seen.has(k)) continue; seen.add(k); next.push({ g: c, R, plan: [...st0.plan, { id, li, dir }] });
      }
    }
    frontier = next;
  }
  return null;
}
// Good floor N: the locks start out of reach, the shadow can't reach you at once, and the fewest moves is exactly N.
// Floor 1 also needs at least two different winning first words, so it's a choice.
export function goodHouse(h, floor) {
  const r0 = reach(h.g, h.startId);
  if (h.lockIds.some((l) => r0.has(l)) || r0.size < 2 || r0.has(h.shadowId)) return false;
  const plan = solve(h.g, h.startId, h.lockIds, false, floor);
  if (!plan || plan.length !== floor) return false;
  // the floor's new word must be part of every shortest way out
  // and there's no way out at all without it, even a long one (checked up to EXTRA moves past the best)
  const fresh = NEW_WORD[floor]; if (fresh && solve(h.g, h.startId, h.lockIds, false, floor + EXTRA, fresh.kind)) return false;
  if (floor === 1) {
    let ways = 0;
    for (const id of r0) for (const [li, d] of edits(byId(h.g, id))) {
      if (byId(h.g, id).lines[li].kind === "lights") continue;
      const c = clone(h.g); applyEdit(c, id, li, null, d); const rr = reach(c, id);
      if (h.lockIds.some((l) => rr.has(l) && reach(c, l).has(c[H - 1][0].id))) ways++;
    }
    if (ways < 2) return false;
  }
  h.par = plan.length; return true;
}
// Tries seeds from the given one until a house is right for this floor (a few dozen tries, well under a second).
export const EXTRA = 4;
export const NEW_WORD = {
  2: { kind: "swap", code: "this.swap(east)", text: "trades this room with the one next to it. You go with it." },
  3: { kind: "flip", code: "house.upsideDown = true", text: "turns the whole house over. Floors change places, and ladders become holes." },
};
// Floor 3 houses are slow to check (no way out without the flip, up to 7 moves), so these seeds were checked ahead of time.
export const FLOOR3 = [596, 998, 1167, 1208, 1341, 1805, 2267, 2513, 2657, 3092, 3292, 3461, 3725, 4106, 4446, 4698, 4868, 5121, 5256, 5844, 6243, 6692, 6760, 6993, 7148, 7530, 7830, 7864, 8391, 8455];
export function pickHouse(floor, seed) {
  if (floor === 3 && seed == null) { const h = makeHouse(FLOOR3[(Math.random() * FLOOR3.length) | 0], 3); h.par = solve(h.g, h.startId, h.lockIds, false, 3).length; return h; }
  for (let s = seed; ; s++) { const h = makeHouse(s, floor); if (goodHouse(h, floor)) { h.seed = s; return h; } } }
