// The house's rules: how each word changes the rooms, and that every floor can be solved, and needs its new word.
import { test } from "node:test";
import assert from "node:assert/strict";
import { W, H, makeHouse, pickHouse, pageRoom, houseMoves, path, applyEdit, solve, reach, clone, find, byId, goodHouse, FLOOR3, EXTRA, NEW_WORD } from "../src/house.js";
import { PAGES, COMMITS } from "../src/story.js";

const ids = (g) => g.map((row) => row.map((r) => r.id));
const roomWith = (g, kind) => g.flat().find((r) => r.lines.some((l) => l.kind === kind));
const lineOf = (r, kind) => r.lines.findIndex((l) => l.kind === kind);
// After following a plan (walk to each room, change its word), is a lock in reach with the door beyond it?
function escapes(h, plan) {
  const g = clone(h.g); let me = h.startId;
  for (const m of plan) { assert.ok(reach(g, me).has(m.id), "each step's room is in reach"); applyEdit(g, m.id, m.li, null, m.dir); me = m.id; }
  const R = reach(g, me), door = g[H - 1][0].id;
  return h.lockIds.some((l) => R.has(l) && reach(g, l).has(door));
}

test("a house: 12 rooms with different names, two locks, and your first room can slide its row", () => {
  const h = makeHouse(7, 1), rooms = h.g.flat();
  assert.equal(rooms.length, W * H);
  assert.equal(new Set(rooms.map((r) => r.name)).size, W * H);
  assert.equal(h.lockIds.length, 2);
  const start = byId(h.g, h.startId);
  assert.ok(start.lines.some((l) => l.kind === "row"));
});

test("row.shift slides the whole row and wraps round; the other word puts it back", () => {
  const h = makeHouse(3, 1), g = clone(h.g), before = ids(g);
  const r = g[1][2]; r.lines = [{ kind: "row" }];
  applyEdit(g, r.id, 0, null, 1);
  assert.deepEqual(ids(g)[1], [before[1][3], before[1][0], before[1][1], before[1][2]]);
  assert.deepEqual(ids(g)[0], before[0], "other rows stay");
  applyEdit(g, r.id, 0, null, -1);
  assert.deepEqual(ids(g), before);
});

test("swap trades a room with its neighbour, wrapping at the end of the row", () => {
  const h = makeHouse(5, 2), g = clone(h.g), before = ids(g);
  const r = g[0][3]; r.lines = [{ kind: "swap" }];
  applyEdit(g, r.id, 0, null, 1); // east of the last room is the first room
  assert.deepEqual(ids(g)[0], [before[0][3], before[0][1], before[0][2], before[0][0]]);
});

test("the flip turns the house over: floors reverse, ladders become holes, and flipping again undoes it", () => {
  const h = makeHouse(11, 3), g = clone(h.g), before = clone(g), world = { flipped: false };
  const r = g[1][1]; r.lines = [{ kind: "flip" }];
  applyEdit(g, r.id, 0, world);
  assert.equal(world.flipped, true);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const was = before[H - 1 - y][x], now = g[y][x];
    assert.equal(now.id, was.id); assert.equal(now.up, was.down); assert.equal(now.down, was.up);
  }
  applyEdit(g, r.id, 0, world);
  assert.deepEqual(ids(g), ids(before));
  assert.deepEqual(g.flat().map((x) => [x.up, x.down]), before.flat().map((x) => [x.up, x.down]));
});

test("a door line opens or shuts the wall between two rooms, on both sides", () => {
  const h = makeHouse(9, 1), g = clone(h.g), a = g[2][1], b = g[2][2];
  a.lines = [{ kind: "door", side: "east" }]; a.r = false; b.l = false;
  applyEdit(g, a.id, 0);
  assert.equal(a.r && b.l, true);
  assert.ok(reach(g, a.id).has(b.id));
  applyEdit(g, a.id, 0);
  assert.equal(a.r || b.l, false);
});

for (const floor of [1, 2]) {
  test(`floor ${floor}: the locks start out of reach, the fewest moves is ${floor}, and that plan gets you out`, () => {
    for (const seed of [1, 1000, 5000, 77777]) {
      const h = pickHouse(floor, seed);
      assert.ok(!h.lockIds.some((l) => reach(h.g, h.startId).has(l)), "no lock in reach at the start");
      const plan = solve(h.g, h.startId, h.lockIds, false, 4);
      assert.equal(plan.length, floor);
      assert.equal(h.par, floor);
      assert.ok(escapes(h, plan));
    }
  });
}

test("floor 2 needs swap: no way out without it, even a long one", () => {
  for (const seed of [1, 1000, 5000]) {
    const h = pickHouse(2, seed);
    assert.ok(lineOf(byId(h.g, h.startId), "swap") >= 0, "swap is in your first room");
    assert.equal(solve(h.g, h.startId, h.lockIds, false, 2 + EXTRA, "swap"), null);
  }
});

// The bug CH found: floor 3 could be beaten without ever flipping the house.
test("floor 3 needs the flip: your first room has it, and no way out skips it within 7 moves", () => {
  for (const seed of FLOOR3.slice(0, 6)) {
    const h = makeHouse(seed, 3);
    assert.ok(lineOf(byId(h.g, h.startId), "flip") >= 0, "the flip is in your first room");
    assert.ok(!h.g.flat().some((r) => r.lines.some((l) => l.kind === "col")), "nothing else moves rooms up or down");
    assert.equal(solve(h.g, h.startId, h.lockIds, false, 3 + EXTRA, "flip"), null, `seed ${seed}: escaped without the flip`);
    const plan = solve(h.g, h.startId, h.lockIds, false, 3);
    assert.equal(plan.length, 3); assert.ok(escapes(h, plan));
  }
});

test("every floor 3 house on the list passes the full check", () => {
  for (const seed of FLOOR3) assert.ok(goodHouse(makeHouse(seed, 3), 3), `seed ${seed}`);
});

test("each new word is described for the floor that brings it", () => {
  assert.equal(NEW_WORD[2].kind, "swap"); assert.equal(NEW_WORD[3].kind, "flip");
  const h = makeHouse(FLOOR3[0], 3), r = roomWith(h.g, "flip");
  assert.ok(find(h.g, r.id));
});

// A torn page must always be findable: in a room you can reach somewhere along the best way out.
test("each floor's torn page lies in a room you can reach on the way out, not your first room or a lock room", () => {
  const houses = [1, 1000, 5000].flatMap((s) => [[pickHouse(1, s), 1], [pickHouse(2, s), 2]]).concat(FLOOR3.slice(0, 4).map((s) => { const h = makeHouse(s, 3); h.seed = s; return [h, 3]; }));
  for (const [h, floor] of houses) {
    const id = pageRoom(h, floor);
    assert.notEqual(id, null); assert.notEqual(id, h.startId); assert.ok(!h.lockIds.includes(id));
    const g = clone(h.g); let me = h.startId, seen = reach(g, me).has(id);
    for (const m of solve(h.g, h.startId, h.lockIds, false, floor)) { applyEdit(g, m.id, m.li, null, m.dir); me = m.id; seen = seen || reach(g, me).has(id); }
    assert.ok(seen, `floor ${floor}: page room ${id} is never in reach`);
  }
  for (const f of [1, 2, 3]) { assert.ok(PAGES[f]); assert.ok(COMMITS[f]); }
});

// The house plays back, but never by carrying you off: its moves are in other rooms, and never slide your row,
// your column, or swap your room. Its favourite moves bring the shadow closer.
test("the house's own moves never move the room you're in, and the best ones bring the shadow closer", () => {
  for (const [floor, seed] of [[1, 1], [2, 1000], [2, 5000]]) {
    const h = pickHouse(floor, seed), me = h.startId, pm = find(h.g, me), moves = houseMoves(h.g, me, h.shadowId, true);
    assert.ok(moves.length > 0);
    for (const m of moves) {
      assert.notEqual(m.id, me);
      assert.deepEqual(find(m.g, me), pm, `${m.kind} in room ${m.id} moved you`);
    }
    const best = moves.reduce((a, b) => (b.score > a.score ? b : a));
    const before = path(h.g, h.shadowId, me), after = path(best.g, h.shadowId, me);
    assert.ok((after ? after.length : 99) <= (before ? before.length : 99), "its best move doesn't push the shadow away");
  }
});

test("no room lists the same swap or flip line twice (a fresh player read the double swap as a bug)", () => {
  for (const floor of [2, 3]) for (let seed = 1; seed <= 300; seed++) {
    for (const r of makeHouse(seed, floor).g.flat()) for (const k of ["swap", "flip"]) {
      assert.ok(r.lines.filter((l) => l.kind === k).length <= 1, `floor ${floor} seed ${seed}: ${r.name} has two ${k} lines`);
    }
  }
});
