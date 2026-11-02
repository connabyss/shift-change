import { test } from "node:test";
import assert from "node:assert/strict";
import { nightSpec, rng, LAST_NIGHT, MACHINES } from "../src/nights.js";

test("night 1 is 3 machines with 1 liar", () => {
  const n = nightSpec(1);
  assert.equal(n.machines.length, 3);
  assert.equal(n.machines.filter((m) => m.lies).length, 1);
});

test("every night has at least one liar and at least one true note, and gets bigger", () => {
  let last = 0;
  for (let night = 1; night <= LAST_NIGHT; night++) {
    for (const seed of [1, 2, 3, 1337, 99999]) {
      const n = nightSpec(night, seed);
      const liars = n.machines.filter((m) => m.lies).length;
      assert.ok(liars >= 1 && liars < n.machines.length, `night ${night} seed ${seed}: ${liars} liars`);
      assert.equal(new Set(n.machines.map((m) => m.id)).size, n.machines.length, "no machine twice");
    }
    const count = nightSpec(night).machines.length;
    assert.ok(count > last);
    last = count;
  }
  assert.ok(nightSpec(LAST_NIGHT).rise > nightSpec(1).rise, "the gauge climbs faster on later nights");
});

test("the same night and seed always plays the same", () => {
  assert.deepEqual(nightSpec(3, 42), nightSpec(3, 42));
});

test("the floor shifts: machines stand in different spots from night to night", () => {
  const spots = (night) => nightSpec(night).machines.map((m) => `${m.x},${m.y}`);
  const moved = [2, 3, 4, 5].filter((n) => spots(n).slice(0, 3).join() !== spots(n - 1).slice(0, 3).join());
  assert.ok(moved.length >= 3);
  for (let night = 1; night <= LAST_NIGHT; night++) {
    const s = spots(night);
    assert.equal(new Set(s).size, s.length, "two machines on one spot");
  }
});

test("the seeded dice stay between 0 and 1 and repeat for one seed", () => {
  const a = rng(7), b = rng(7);
  for (let i = 0; i < 100; i++) {
    const x = a();
    assert.ok(x >= 0 && x < 1);
    assert.equal(x, b());
  }
});

test("there are enough machines for the last night", () => {
  assert.ok(MACHINES.length >= LAST_NIGHT + 2);
  assert.throws(() => nightSpec(LAST_NIGHT + 1));
});
