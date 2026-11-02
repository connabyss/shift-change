import { test } from "node:test";
import assert from "node:assert/strict";
import { floorSpec, floorHouse, LAST_FLOOR, PLAYER_SPEED, shadowPace, headStart, quakeEvery } from "../src/floors.js";
import { SPEED } from "../src/stalker.js";
import { rng } from "../src/rng.js";
import { E } from "../src/house.js";

test("every room has at least two doors, and the front door's room opens onto it", () => {
  for (let n = 1; n <= LAST_FLOOR; n++) {
    const f = floorSpec(n);
    for (const row of f.rooms) for (const r of row) assert.ok(((r & 1) + ((r >> 1) & 1) + ((r >> 2) & 1) + ((r >> 3) & 1)) >= 2);
    assert.ok(f.rooms[f.exit.y][f.exit.x] & E);
    assert.equal(f.exit.x, f.rooms.length - 1);
  }
});

test("floors get bigger and the shadow gets faster", () => {
  assert.equal(floorSpec(1).rooms.length, 4);
  assert.equal(floorSpec(LAST_FLOOR).rooms.length, 5);
  assert.ok(floorSpec(LAST_FLOOR).step < floorSpec(1).step);
  assert.throws(() => floorSpec(LAST_FLOOR + 1));
});

test("you and the shadow start in different rooms", () => {
  for (let n = 1; n <= LAST_FLOOR; n++) {
    const h = floorHouse(n);
    assert.notDeepEqual(h.player, h.hunter);
    assert.equal(h.floor, n);
  }
});

test("the same floor and seed always builds the same house", () => {
  assert.deepEqual(floorSpec(3, 42), floorSpec(3, 42));
  assert.notDeepEqual(floorSpec(3, 42).rooms, floorSpec(3, 43).rooms);
  const a = rng(5), b = rng(5);
  for (let i = 0; i < 50; i++) { const x = a(); assert.ok(x >= 0 && x < 1); assert.equal(x, b()); }
});

test("every floor has a key, away from the front door and the shadow", () => {
  for (let n = 1; n <= LAST_FLOOR; n++) for (const seed of [1, 2, 3, 9]) {
    const f = floorSpec(n, seed);
    assert.ok(f.key);
    assert.notDeepEqual(f.key, { x: f.exit.x, y: f.exit.y });
    assert.notDeepEqual(f.key, f.hunter);
    assert.equal(floorHouse(n, seed).hasKey, false);
  }
});

test("you can outrun it even when it hunts, and it gives you a head start", () => {
  assert.ok(SPEED.hunt * shadowPace(1) < PLAYER_SPEED);
  assert.ok(SPEED.hunt * shadowPace(2) < PLAYER_SPEED);
  assert.ok(SPEED.hunt * shadowPace(LAST_FLOOR) < PLAYER_SPEED, "on every floor you can outrun its hunt");
  for (let n = 1; n < LAST_FLOOR; n++) assert.ok(shadowPace(n) <= shadowPace(n + 1) && headStart(n) >= headStart(n + 1));
  assert.ok(headStart(1) >= 10);
});

test("three short floors, and only the last one moves on its own", () => {
  assert.equal(LAST_FLOOR, 3);
  assert.equal(quakeEvery(1), 0); assert.equal(quakeEvery(2), 0);
  assert.ok(quakeEvery(LAST_FLOOR) > 0);
});

test("floor 1 teaches the hook: the lock is out of reach until you change your first room's line once; floor 2 you can walk to it", async () => {
  const { makeHouse, path, shoveRow } = await import("../src/house.js");
  for (let seed = 1; seed <= 60; seed++) {
    const f = floorSpec(1, seed), h = makeHouse(f);
    assert.equal(path(h, h.key), null, `floor 1 seed ${seed}: out of reach at first`);
    assert.deepEqual(f.codes[f.player.y][f.player.x], { kind: "shift", axis: "row", dir: 1 }, "your first room's line: this.row.shift(east)");
    shoveRow(h, f.player.y, 1);
    assert.ok(path(h, h.key) !== null, `floor 1 seed ${seed}: in reach after one edit`);
    const g = floorSpec(2, seed);
    assert.ok(path(makeHouse({ ...g, player: g.key }), g.player) !== null, `floor 2 seed ${seed}`);
    assert.equal(g.codes[g.key.y][g.key.x].kind, "lock");
    assert.ok(g.codes.flat().some((c) => c?.kind === "sleep"), "floor 2 hides a line that puts it to sleep");
  }
});

test("the last floor's lock reads you.trapped = true; the earlier ones are the front door's", () => {
  for (let seed = 1; seed <= 20; seed++) {
    const last = floorSpec(LAST_FLOOR, seed);
    assert.equal(last.codes[last.key.y][last.key.x].trap, true);
    const first = floorSpec(1, seed);
    assert.ok(!first.codes[first.key.y][first.key.x].trap);
  }
});
