import { test } from "node:test";
import assert from "node:assert/strict";
import { makeHouse, N, E, S, W } from "../src/house.js";
import { buildTiles, R } from "../src/tiles.js";
import { makeShadow, think, lurkSpot, cutOff, stun } from "../src/stalker.js";
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

test("with nowhere to go yet, it picks somewhere and starts moving", () => {
  const map = hall(), sh = makeShadow({ x: 2 * R + 2.5, y: 1.5 });
  think(sh, { map, player: { x: 1.5, y: 1.5, hidden: true }, sawHide: false }, 0.05, () => 0.5);
  assert.ok(sh.target, "it has somewhere to go");
  const before = { x: sh.x, y: sh.y };
  for (let i = 0; i < 20; i++) think(sh, { map, player: { x: 1.5, y: 1.5, hidden: true }, sawHide: false }, 0.05, () => 0.5);
  assert.notDeepEqual({ x: sh.x, y: sh.y }, before);
});

test("on an early floor it moves slower (pace), so a first-timer can outrun a wander", () => {
  const a = makeShadow({ x: 2 * R + 2.5, y: 1.5 }), b = makeShadow({ x: 2 * R + 2.5, y: 1.5 });
  const world = (pace) => ({ map: hall(), player: { x: 1.5, y: 1.5, hidden: true }, sawHide: false, pace });
  const wa = world(0.5), wb = world(1);
  for (let i = 0; i < 10; i++) { think(a, wa, 0.05, () => 0.5); think(b, wb, 0.05, () => 0.5); }
  const moved = (s) => Math.hypot(s.x - (2 * R + 2.5), s.y - 1.5);
  assert.ok(moved(a) < moved(b) * 0.7, `${moved(a)} vs ${moved(b)}`);
});

test("a slide that takes away its way to you, or makes it much longer, cuts it off", () => {
  const steps = (n) => Array.from({ length: n }, () => ({ x: 0, y: 0 }));
  assert.equal(cutOff(steps(8), null), true, "no way at all");
  assert.equal(cutOff(steps(8), steps(20)), true, "the long way round");
  assert.equal(cutOff(steps(8), steps(10)), false, "a little longer is not cut off");
  assert.equal(cutOff(null, null), false, "it couldn't reach you before either");
});

test("stunned, it can't see you or catch you; then it comes looking", () => {
  const map = hall(), sh = makeShadow({ x: 1.5, y: 1.5 }), world = { map, player: { x: 1.9, y: 1.5, hidden: false }, sawHide: false, noise: null };
  stun(sh, 1);
  const x0 = sh.x;
  for (let t = 0; t < 0.9; t += 0.1) assert.deepEqual(think(sh, world, 0.1, rng(1)), [], "right next to you and nothing happens");
  assert.equal(sh.x, x0);
  const ev = think(sh, world, 0.3, rng(1));
  assert.ok(ev.some((e) => e.kind === "recover"));
  assert.equal(sh.mode, "search");
});
