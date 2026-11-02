// The floors of the house. Each is seeded: the same floor number always builds the same rooms.
import { rng } from "./rng.js";
import { makeHouse, N, E, S, W } from "./house.js";

export const LAST_FLOOR = 5;

// Room shapes, by their doors. No dead-end closets: every room has at least two ways in.
const SHAPES = [N | S, E | W, N | E, E | S, S | W, W | N, N | E | S, E | S | W, S | W | N, W | N | E, N | E | S | W];

export function floorSpec(n, seed = 1) {
  if (n < 1 || n > LAST_FLOOR) throw new Error(`no floor ${n}`);
  const rand = rng(seed * 7919 + n);
  const size = n <= 2 ? 4 : 5;
  const rooms = Array.from({ length: size }, () => Array.from({ length: size }, () => SHAPES[Math.floor(rand() * SHAPES.length)]));
  // You start bottom-left. The shadow starts in the far corner, top-right, near the front door on the east wall.
  const player = { x: 0, y: size - 1 };
  const hunter = { x: size - 1, y: 0 };
  const exit = { x: size - 1, y: 1 + Math.floor(rand() * Math.floor(size / 2)), side: "E" };
  rooms[exit.y][exit.x] |= E; // the front door's own room always opens onto it
  // The front door is locked. The key lies somewhere in the far half of the house from you.
  let key;
  do key = { x: Math.floor(size / 2) + Math.floor(rand() * Math.ceil(size / 2)), y: Math.floor(rand() * size) };
  while ((key.x === exit.x && key.y === exit.y) || (key.x === hunter.x && key.y === hunter.y));
  return {
    floor: n,
    rooms, player, hunter, exit, key,
    step: n === 1 ? 2.4 : Math.max(0.8, 2.0 - 0.25 * (n - 1)), // seconds between the shadow's steps
  };
}

export function floorHouse(n, seed) {
  const spec = floorSpec(n, seed);
  return Object.assign(makeHouse(spec), { floor: n, step: spec.step });
}
