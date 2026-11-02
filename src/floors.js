// The floors of the house. Each is seeded: the same floor number always builds the same rooms.
import { rng } from "./rng.js";
import { makeHouse, path, shoveRow, N, E, S, W } from "./house.js";
import { floorCodes } from "./code.js";

export const LAST_FLOOR = 3; // short: a jam player finishes in about ten minutes

// Room shapes, by their doors. No dead-end closets: every room has at least two ways in.
const TWO = [N | S, E | W, N | E, E | S, S | W, W | N];
const THREE = [N | E | S, E | S | W, S | W | N, W | N | E];
const FOUR = N | E | S | W;
// How open each floor is: the chance a room has 4 doors, and the chance it has 3 (else 2).
// Open houses mean you can walk most places; sliding is for shortcuts and for cutting the shadow off.
const OPEN = { 1: [0.55, 0.4], 2: [0.25, 0.45], 3: [0.2, 0.5] };

export function floorSpec(n, seed = 1) {
  if (n < 1 || n > LAST_FLOOR) throw new Error(`no floor ${n}`);
  const rand = rng(seed * 7919 + n);
  const size = n <= 2 ? 4 : 5;
  const [four, three] = OPEN[n];
  const shape = () => { const r = rand(); return r < four ? FOUR : r < four + three ? THREE[Math.floor(rand() * 4)] : TWO[Math.floor(rand() * 6)]; };
  let rooms = Array.from({ length: size }, () => Array.from({ length: size }, shape));
  // You start bottom-left. The front door is on the east wall.
  const player = { x: 0, y: size - 1 };
  // Floor 1 it sleeps top-left, away from the lock and the door, while you learn. Later it waits by the door.
  const hunter = n === 1 ? { x: 0, y: 0 } : { x: size - 1, y: 0 };
  const exit = { x: size - 1, y: 1 + Math.floor(rand() * Math.floor(size / 2)), side: "E" };
  rooms[exit.y][exit.x] |= E; // the front door's own room always opens onto it
  // The front door is locked. Its lock's line of code ("key") is somewhere in the far half of the house from you.
  let key;
  do key = { x: Math.floor(size / 2) + Math.floor(rand() * Math.ceil(size / 2)), y: Math.floor(rand() * size) };
  while ((key.x === exit.x && key.y === exit.y) || (key.x === hunter.x && key.y === hunter.y));
  // Floor 1 teaches the hook: the lock is out of reach, until you change the line in your first room
  // (this.row.shift(east)) once. Floor 2: you can walk to the lock. (Room shapes are re-drawn until it's true.)
  const reach = (h) => path(h, h.key) !== null;
  const good = () => {
    const h = makeHouse({ rooms, player, hunter, exit, key });
    if (n === 2) return reach(h);
    if (n !== 1) return true;
    if (reach(h)) return false;
    shoveRow(h, player.y, 1);
    return reach(h);
  };
  for (let tries = 0; tries < 2000 && !good(); tries++) {
    rooms = Array.from({ length: size }, () => Array.from({ length: size }, shape));
    rooms[exit.y][exit.x] |= E;
  }
  const codes = floorCodes(size, size, rand, n, player, key);
  if (n === LAST_FLOOR) codes[key.y][key.x].trap = true; // the last lock is you: you.trapped = true
  return {
    floor: n,
    rooms, player, hunter, exit, key, codes,
    step: n === 1 ? 2.4 : Math.max(0.8, 2.0 - 0.25 * (n - 1)), // seconds between the shadow's steps
  };
}

// Your walking speed, in tiles a second. The shadow's pace multiplies its speeds (stalker.js SPEED).
export const PLAYER_SPEED = 2.1;
// Even hunting, it is slower than you on every floor: running away always works. It's only deadly up close.
export function shadowPace(n) { return n === 1 ? 0.62 : n === 2 ? 0.7 : 0.78; } // a hunt is always a little slower than you
// Seconds before it starts to move. On floor 1 it sleeps until you open the lock, or for 40 seconds: time to learn the hook.
export function headStart(n) { return n === 1 ? 40 : n === 2 ? 8 : 5; }

// The last floor moves on its own: every this many seconds a row or column slides, with a rumble first.
export function quakeEvery(n) { return n === LAST_FLOOR ? 20 : 0; }

export function floorHouse(n, seed) {
  const spec = floorSpec(n, seed);
  return Object.assign(makeHouse(spec), { floor: n, step: spec.step, codes: spec.codes });
}
