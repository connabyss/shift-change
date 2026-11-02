import { test } from "node:test";
import assert from "node:assert/strict";
import { makeHouse, N, E, S, W } from "../src/house.js";
import { buildTiles, R } from "../src/tiles.js";
import { makeShadow, think, lurkSpot } from "../src/stalker.js";
import { rng } from "../src/rng.js";

const ALL = N | E | S | W;
const m = Math.floor(R / 2) + 0.5;
// three rooms in a row, all doors lined up: a long hallway
const hall = () => buildTiles(makeHouse({ rooms: [[ALL, ALL, ALL]], player: { x: 0, y: 0 }, hunter: { x: 2, y: 0 }, exit: { x: 2, y: 0, side: "E" } }), [[1, 1, 1]]);
const never = () => 0.99; // never pauses, never lurks

function run(sh, world, seconds, rand = never) {
  const all = [];
  for (let t = 0; t < seconds; t += 0.05) { all.push(...think(sh, world, 0.05, rand)); if (all.some((e) => e.kind === "caught")) break; }
  return all.map((e) => e.kind);
}

test("it sees you down the hall, hunts you, and catches you", () => {
  const map = hall(), sh = makeShadow({ x: 2 * R - 0.5, y: m });
  const ev = run(sh, { map, player: { x: 1.5, y: m } }, 10);
  assert.equal(ev[0], "spotted");
  assert.ok(ev.includes("caught"));
});

test("hidden in a wardrobe, unseen, it walks right past you", () => {
  const map = hall(), sh = makeShadow({ x: 2 * R - 0.5, y: m });
  const ev = run(sh, { map, player: { x: 1.5, y: m, hidden: true }, sawHide: false }, 6);
  assert.ok(!ev.includes("spotted"));
  assert.ok(!ev.includes("caught"));
});

test("but if it saw you climb in, it opens the wardrobe", () => {
  const map = hall(), sh = makeShadow({ x: 2 * R - 0.5, y: m });
  const ev = run(sh, { map, player: { x: 1.5, y: m, hidden: true }, sawHide: true }, 10);
  assert.ok(ev.includes("caught"));
});

test("when it loses sight of you it searches where it last saw you", () => {
  const map = hall(), sh = makeShadow({ x: 2 * R - 0.5, y: m });
  const world = { map, player: { x: 1.5, y: m } };
  think(sh, world, 0.05, never);
  assert.equal(sh.mode, "hunt");
  world.player = { x: 1.5, y: 1.5, hidden: true }; // ducked out of sight
  const ev = think(sh, world, 0.05, never).map((e) => e.kind);
  assert.ok(ev.includes("lost"));
  assert.equal(sh.mode, "search");
  assert.deepEqual(sh.target, { x: 1.5, y: m });
});

test("a noise sends it to look", () => {
  const map = hall(), sh = makeShadow({ x: 2 * R + 2.5, y: 1.5 });
  const ev = think(sh, { map, player: { x: 1.5, y: 1.5 }, noise: { x: 2.5, y: m } }, 0.05, never).map((e) => e.kind);
  assert.ok(ev.includes("heard"));
  assert.equal(sh.mode, "search");
});

test("close up, it sometimes goes still and silent... then lunges", () => {
  const map = hall(), sh = makeShadow({ x: R + 0.5, y: m });
  const world = { map, player: { x: 1.5, y: m } };
  think(sh, world, 0.05, () => 0.1);
  assert.equal(sh.mode, "pause");
  assert.equal(sh.silent, true);
  const before = { x: sh.x, y: sh.y };
  const ev = [];
  for (let i = 0; i < 16; i++) ev.push(...think(sh, world, 0.05, () => 0.1).map((e) => e.kind));
  assert.ok(ev.includes("lunge"));
  assert.notDeepEqual({ x: sh.x, y: sh.y }, before);
});

test("shut out by walls, it seeps through them, slowly", () => {
  const sealed = buildTiles(makeHouse({ rooms: [[E, N]], player: { x: 0, y: 0 }, hunter: { x: 1, y: 0 }, exit: { x: 1, y: 0, side: "E" } }), [[1, 1]]);
  const sh = makeShadow({ x: R + 2.5, y: m });
  const ev = run(sh, { map: sealed, player: { x: 2.5, y: m }, noise: null }, 0.1);
  sh.mode = "search"; sh.target = { x: 2.5, y: m }; sh.path = null;
  const later = run(sh, { map: sealed, player: { x: 2.5, y: 1.5, hidden: true }, sawHide: false }, 6);
  assert.ok(later.includes("seep"), JSON.stringify(ev.concat(later)));
  assert.ok(sh.x < R + 2.5, "it came through the wall toward you");
});

test("a lurking spot is a doorway near you, out of your sight", () => {
  const map = hall();
  const spot = lurkSpot(map, { x: 2.5, y: 1.5 }, rng(3));
  assert.ok(spot);
  const d = Math.hypot(spot.x - 2.5, spot.y - 1.5);
  assert.ok(d > 3 && d < 8);
});
