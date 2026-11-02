import { test } from "node:test";
import assert from "node:assert/strict";
import { line, edit, floorCodes, shiftGrid } from "../src/code.js";
import { rng } from "../src/rng.js";

const read = (c) => { const l = line(c); return l.pre + l.word + l.post; };

test("each line reads like code, with one word you can change", () => {
  assert.equal(read({ kind: "shift", axis: "row", dir: 1 }), "this.row.shift(east)");
  assert.equal(read({ kind: "shift", axis: "col", dir: -1 }), "this.column.shift(north)");
  assert.equal(read({ kind: "lights", on: true }), "this.lights = on;");
  assert.equal(read({ kind: "sleep", used: false }), "shadow.awake = true;");
  assert.equal(read({ kind: "lock" }), "frontDoor.locked = true;");
  assert.equal(read({ kind: "lock", trap: true }), "you.trapped = true;", "the last floor's lock is you");
});

test("changing a word: a shift runs the way it says, then turns round so pressing again undoes it", () => {
  const c = { kind: "shift", axis: "row", dir: 1 };
  const a = edit(c);
  assert.deepEqual(a.effect, { shift: "row", dir: 1 });
  assert.equal(read(a.next), "this.row.shift(west)");
  assert.deepEqual(edit(a.next).effect, { shift: "row", dir: -1 });
});

test("lights toggle; the sleep line and the lock work once", () => {
  assert.deepEqual(edit({ kind: "lights", on: true }).effect, { lights: false });
  const s = edit({ kind: "sleep", used: false });
  assert.deepEqual(s.effect, { sleep: 8 });
  assert.equal(edit(s.next).effect, null);
  assert.equal(line(s.next).spent, true);
  const l = edit({ kind: "lock" });
  assert.deepEqual(l.effect, { unlock: true });
  assert.equal(read(l.next), "frontDoor.locked = false;");
  assert.equal(edit(l.next).effect, null);
});

test("a floor's lines: your first room always slides its row; floors 2+ hide one sleep line; lines ride with their rooms", () => {
  const c1 = floorCodes(4, 4, rng(3), 1, { x: 0, y: 3 });
  assert.deepEqual(c1[3][0], { kind: "shift", axis: "row", dir: 1 });
  assert.ok(!c1.flat().some((c) => c?.kind === "sleep"));
  assert.equal(floorCodes(4, 4, rng(3), 2, { x: 0, y: 3 }).flat().filter((c) => c?.kind === "sleep").length, 1);
  const g = [["a", "b", "c"], ["d", "e", "f"]];
  shiftGrid(g, "row", 0, 1); assert.deepEqual(g[0], ["c", "a", "b"]);
  shiftGrid(g, "col", 1, 1); assert.deepEqual(g.map((r) => r[1]), ["e", "a"]);
});
