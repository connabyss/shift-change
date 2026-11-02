import { test } from "node:test";
import assert from "node:assert/strict";
import { makeHouse, N, E, S, W } from "../src/house.js";
import { buildTiles, R, FLOOR, WALL, FRONT, WARDROBE, solid, tilePath, canSee, roomOf, roomCenter } from "../src/tiles.js";

const ALL = N | E | S | W;
const two = (left, right, decor = [[1, 1]]) => makeHouse({ rooms: [[left, right]], player: { x: 0, y: 0 }, hunter: { x: 1, y: 0 }, exit: { x: 1, y: 0, side: "E" } });

test("each room is a box of wall with a gap in the middle of each side that has a door", () => {
  const map = buildTiles(two(E, W), [[1, 1]]);
  assert.equal(map.w, 2 * R);
  const m = Math.floor(R / 2);
  assert.equal(map.kind[m][R - 1], FLOOR, "left room's east door");
  assert.equal(map.kind[m][R], FLOOR, "right room's west door");
  assert.equal(map.kind[0][m], WALL, "no north door");
  assert.equal(map.kind[m][2 * R - 1], FRONT, "the front door on the outer east wall");
  assert.ok(tilePath(map, { x: 1.5, y: m + 0.5 }, { x: R + 2.5, y: m + 0.5 }), "you can walk from one room to the other");
});

test("a door only leads somewhere if the room next door has one too", () => {
  const map = buildTiles(two(E, N), [[1, 1]]);
  const m = Math.floor(R / 2);
  assert.equal(map.kind[m][R - 1], FLOOR, "the door is there...");
  assert.equal(map.kind[m][R], WALL, "...and opens onto a blank wall");
  assert.equal(tilePath(map, { x: 1.5, y: m + 0.5 }, { x: R + 2.5, y: m + 0.5 }), null);
});

test("some rooms have a wardrobe in the corner, and it moves with its room", () => {
  const map = buildTiles(two(ALL, ALL), [[3, 1]]);
  assert.equal(map.kind[1][1], WARDROBE);
  assert.equal(map.kind[1][R + 1], FLOOR);
  assert.ok(solid(map, 1.5, 1.5));
});

test("mid-shove, the shoved row is drawn some tiles back from where it lands", () => {
  const h = makeHouse({ rooms: [[E, W | E, W]], player: { x: 0, y: 0 }, hunter: { x: 2, y: 0 }, exit: { x: 2, y: 0, side: "E" } });
  const landed = buildTiles(h, [[1, 1, 1]]);
  const mid = buildTiles(h, [[1, 1, 1]], { axis: "row", i: 0, dir: 1, left: 2 });
  const m = Math.floor(R / 2);
  assert.equal(mid.kind[m][5], landed.kind[m][7], "the row hasn't arrived yet: it's 2 tiles behind");
  assert.deepEqual(buildTiles(h, [[1, 1, 1]], { axis: "row", i: 0, dir: 1, left: 0 }).kind, landed.kind);
});

test("seeing: walls block the view, open doorways don't", () => {
  const map = buildTiles(two(E, W), [[1, 1]]);
  const m = Math.floor(R / 2) + 0.5;
  assert.equal(canSee(map, { x: 1.5, y: m }, { x: R + 3.5, y: m }), true, "straight through both doors");
  assert.equal(canSee(map, { x: 1.5, y: 1.5 }, { x: R + 3.5, y: 1.5 }), false, "through the wall");
  assert.equal(canSee(map, { x: 1.5, y: m }, { x: R + 3.5, y: m }, 3), false, "too far in the dark");
});

test("rooms and their middles", () => {
  assert.deepEqual(roomOf({ x: R + 0.5, y: 2 * R + 4.9 }), { x: 1, y: 2 });
  assert.deepEqual(roomCenter({ x: 1, y: 0 }), { x: R * 1.5, y: R / 2 });
});
