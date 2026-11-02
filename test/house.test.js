import { test } from "node:test";
import assert from "node:assert/strict";
import { makeHouse, shoveRow, shoveCol, open, walk, path, hunterStep, wander, seep, N, E, S, W } from "../src/house.js";

const ALL = N | E | S | W;
// 3 x 3. Middle row is a corridor (E-W doors only). Exit: out the east side of the top-right room.
const plan = () => makeHouse({
  rooms: [
    [ALL, ALL, ALL],
    [E, E | W, W],
    [ALL, ALL, ALL],
  ],
  player: { x: 0, y: 1 }, hunter: { x: 2, y: 2 }, exit: { x: 2, y: 0, side: "E" },
});

test("shoving a row slides every room in it one step, and the end one wraps around", () => {
  const h = plan();
  shoveRow(h, 1, 1);
  assert.deepEqual(h.rooms[1], [W, E, E | W]);
  shoveRow(h, 1, -1);
  assert.deepEqual(h.rooms[1], [E, E | W, W]);
});

test("you ride along with the room you're in, and so does the hunter", () => {
  const h = plan();
  shoveRow(h, 1, -1);
  assert.deepEqual(h.player, { x: 2, y: 1 }, "wrapped from the left edge to the right edge");
  shoveCol(h, 2, 1);
  assert.deepEqual(h.player, { x: 2, y: 2 });
  assert.deepEqual(h.hunter, { x: 2, y: 0 }, "the hunter was in that column too");
  assert.equal(h.shoves, 2);
});

test("shoving a column moves its rooms up or down", () => {
  const h = plan();
  shoveCol(h, 0, -1);
  assert.deepEqual(h.rooms.map((r) => r[0]), [E, ALL, ALL]);
});

test("a door only works if both rooms have one on that wall", () => {
  const h = plan();
  assert.equal(open(h, 0, 0, "S"), false, "the corridor room below has no north door");
  assert.equal(open(h, 0, 0, "E"), true);
  assert.equal(open(h, 0, 0, "W"), false, "outer wall");
  assert.equal(walk(h, "N").kind, "wall");
  assert.equal(walk(h, "E").kind, "moved");
  assert.deepEqual(h.player, { x: 1, y: 1 });
});

test("the hunter takes the shortest way through doors, one room per step", () => {
  const h = plan();
  // from (2,2) the corridor has no south doors, so it must go round: there is no way in except through the ends
  assert.equal(path(h, h.hunter), null, "the corridor is sealed from below");
  assert.equal(hunterStep(h).kind, "lost");
  shoveRow(h, 1, 1); // now (0,1) holds W, (1,1) holds E: still no N/S doors, still sealed
  assert.equal(path(h, h.hunter), null);
  const open2 = makeHouse({ rooms: [[ALL, ALL, ALL], [ALL, ALL, ALL], [ALL, ALL, ALL]], player: { x: 0, y: 0 }, hunter: { x: 2, y: 2 }, exit: { x: 2, y: 0, side: "E" } });
  assert.equal(path(open2, open2.hunter).length, 4);
  assert.equal(hunterStep(open2).left, 3);
});

test("if the hunter reaches your room you're caught, and that's the end", () => {
  const h = makeHouse({ rooms: [[ALL, ALL]], player: { x: 0, y: 0 }, hunter: { x: 1, y: 0 }, exit: { x: 1, y: 0, side: "E" } });
  assert.equal(hunterStep(h).kind, "caught");
  assert.equal(h.over, true);
  assert.equal(walk(h, "E").kind, "over");
});

test("walking into the hunter's room counts as caught too", () => {
  const h = makeHouse({ rooms: [[ALL, ALL]], player: { x: 0, y: 0 }, hunter: { x: 1, y: 0 }, exit: { x: 1, y: 0, side: "E" } });
  assert.equal(walk(h, "E").kind, "caught");
});

test("a shove never drops you onto the hunter: if you share a row or column, you both ride", () => {
  const h = makeHouse({ rooms: [[ALL, ALL, ALL], [ALL, ALL, ALL]], player: { x: 0, y: 0 }, hunter: { x: 1, y: 1 }, exit: { x: 2, y: 0, side: "E" } });
  for (let i = 0; i < 30; i++) {
    if (i % 2) shoveRow(h, i % 2, i % 3 ? 1 : -1); else shoveCol(h, i % 3, i % 4 ? 1 : -1);
    assert.equal(h.caught, false);
  }
  shoveRow(h, h.player.y, 1);
  assert.notDeepEqual(h.player, h.hunter);
});

test("you escape by walking out the front door, if your room has a door on that side", () => {
  const h = plan();
  walk(h, "E"); walk(h, "E");
  assert.deepEqual(h.player, { x: 2, y: 1 });
  shoveCol(h, 2, -1); // ride up to the exit room... and the corridor room (W only) is now at the top right
  assert.deepEqual(h.player, { x: 2, y: 0 });
  assert.equal(walk(h, "E").kind, "wall", "this room has no east door");
  shoveCol(h, 2, 1); shoveCol(h, 2, 1); shoveCol(h, 2, 1); // all the way round: you're back on top, in the same room
  assert.equal(walk(h, "E").kind, "wall");
  const g = plan();
  walk(g, "E");
  shoveCol(g, 1, -1); // ride up into the top row, in the corridor room
  shoveRow(g, 0, 1); // ride right to (2,0) in the corridor room (E|W)
  assert.deepEqual(g.player, { x: 2, y: 0 });
  assert.equal(walk(g, "E").kind, "escaped");
  assert.equal(g.escaped, true);
});

test("with no way to you, the shadow wanders through an open door and avoids turning straight back", () => {
  const h = makeHouse({ rooms: [[E, E | W | S, W], [0, N, 0]], player: { x: 0, y: 1 }, hunter: { x: 1, y: 0 }, exit: { x: 2, y: 0, side: "E" } });
  const r = wander(h, () => 0.99, "E"); // came in heading east: going back west is the last resort
  assert.equal(r.kind, "wander");
  assert.notEqual(r.d, "W");
  const stuck = makeHouse({ rooms: [[0, 0]], player: { x: 0, y: 0 }, hunter: { x: 1, y: 0 }, exit: { x: 1, y: 0, side: "E" } });
  assert.equal(wander(stuck, () => 0.5).kind, "stuck");
});

test("walled off, the shadow seeps through a wall toward you, one room at a time", () => {
  const h = makeHouse({ rooms: [[0, 0, 0], [0, 0, 0]], player: { x: 2, y: 1 }, hunter: { x: 0, y: 0 }, exit: { x: 2, y: 0, side: "E" } });
  assert.equal(path(h, h.hunter), null);
  assert.deepEqual(seep(h), { kind: "seep", d: "E" });
  assert.deepEqual(h.hunter, { x: 1, y: 0 });
  seep(h);
  assert.deepEqual(h.hunter, { x: 2, y: 0 }, "the longer way first");
  assert.equal(seep(h).kind, "caught");
});

test("the front door stays locked until you pick up the key, and the key rides with its room", () => {
  const h = makeHouse({ rooms: [[ALL, ALL, ALL]], player: { x: 1, y: 0 }, hunter: { x: 0, y: 0 }, exit: { x: 2, y: 0, side: "E" }, key: { x: 0, y: 0 } });
  shoveRow(h, 0, 1); // everyone rides: you to (2,0), the hunter and the key to (1,0)
  assert.deepEqual(h.key, { x: 1, y: 0 });
  assert.equal(walk(h, "E").kind, "locked");
  assert.equal(h.over, false);
  const k = makeHouse({ rooms: [[ALL, ALL, ALL]], player: { x: 0, y: 0 }, hunter: { x: 0, y: 0 }, exit: { x: 2, y: 0, side: "E" }, key: { x: 1, y: 0 } });
  k.hunter = { x: 9, y: 9 };
  assert.equal(walk(k, "E").kind, "key");
  assert.equal(k.hasKey, true);
  shoveRow(k, 0, -1); // the key is in your pocket now: it doesn't ride with the room any more
  assert.deepEqual(k.key, { x: 1, y: 0 });
  walk(k, "E"); walk(k, "E");
  assert.deepEqual(k.player, { x: 2, y: 0 });
  assert.equal(walk(k, "E").kind, "escaped");
});
