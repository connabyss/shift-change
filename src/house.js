// The rules of the shifting house. No drawing in here.
//
// The house is a grid of rooms. Each room has doors on some of its four sides. You can shove a whole row or column
// of rooms one step: the room pushed off one end comes back in at the other, and anyone inside rides along.
// You can walk to the next room only if both rooms have a door on the shared wall. Something hunts you, one room at
// a time, by the shortest way through the doors. Reach the front door and walk out.

export const N = 1, E = 2, S = 4, W = 8;
export const DIRS = { N: [0, -1, N, S], E: [1, 0, E, W], S: [0, 1, S, N], W: [-1, 0, W, E] };

// key: where the front-door key lies (it rides with its room). No key given: the door is unlocked.
export function makeHouse({ rooms, player, hunter, exit, key = null }) {
  return {
    w: rooms[0].length, h: rooms.length,
    rooms: rooms.map((row) => [...row]),
    player: { ...player }, hunter: { ...hunter }, exit: { ...exit },
    key: key && { ...key }, hasKey: !key,
    over: false, escaped: false, caught: false, moves: 0, shoves: 0,
  };
}

function riders(house) {
  return [house.player, house.hunter, ...(house.key && !house.hasKey ? [house.key] : [])];
}

const wrap = (v, n) => ((v % n) + n) % n;

// Shove row y left (-1) or right (+1). Rooms wrap around; people inside ride along.
export function shoveRow(house, y, dir) {
  if (house.over) return false;
  const row = house.rooms[y];
  house.rooms[y] = row.map((_, x) => row[wrap(x - dir, house.w)]);
  for (const who of riders(house)) if (who.y === y) who.x = wrap(who.x + dir, house.w);
  house.shoves += 1;
  check(house);
  return true;
}

// Shove column x up (-1) or down (+1).
export function shoveCol(house, x, dir) {
  if (house.over) return false;
  const col = house.rooms.map((row) => row[x]);
  col.forEach((_, y) => { house.rooms[y][x] = col[wrap(y - dir, house.h)]; });
  for (const who of riders(house)) if (who.x === x) who.y = wrap(who.y + dir, house.h);
  house.shoves += 1;
  check(house);
  return true;
}

// Can someone in room (x, y) step through the wall on side d ("N", "E", "S" or "W")?
export function open(house, x, y, d) {
  const [dx, dy, mine, theirs] = DIRS[d];
  const nx = x + dx, ny = y + dy;
  if (nx < 0 || ny < 0 || nx >= house.w || ny >= house.h) return false;
  return (house.rooms[y][x] & mine) !== 0 && (house.rooms[ny][nx] & theirs) !== 0;
}

// The way out: the exit is a door in the outer wall, on one side of one edge room.
export function atExit(house) {
  const { x, y, side } = house.exit;
  return house.player.x === x && house.player.y === y && (house.rooms[y][x] & DIRS[side][2]) !== 0;
}

export function walk(house, d) {
  if (house.over) return { kind: "over" };
  const p = house.player;
  if (d === house.exit.side && atExit(house)) {
    if (!house.hasKey) return { kind: "locked" };
    house.over = true; house.escaped = true;
    return { kind: "escaped" };
  }
  if (!open(house, p.x, p.y, d)) return { kind: "wall" };
  p.x += DIRS[d][0]; p.y += DIRS[d][1];
  house.moves += 1;
  check(house);
  if (house.caught) return { kind: "caught" };
  if (!house.hasKey && house.key.x === p.x && house.key.y === p.y) { house.hasKey = true; return { kind: "key" }; }
  return { kind: "moved" };
}

// The shortest way from (x, y) to the player through open doors, as a list of sides. null if there's none.
export function path(house, from) {
  const key = (x, y) => y * house.w + x;
  const seen = new Map([[key(from.x, from.y), null]]);
  const queue = [[from.x, from.y]];
  while (queue.length) {
    const [x, y] = queue.shift();
    if (x === house.player.x && y === house.player.y) {
      const steps = [];
      for (let k = key(x, y); seen.get(k); k = seen.get(k).from) steps.unshift(seen.get(k).d);
      return steps;
    }
    for (const d of ["N", "E", "S", "W"]) {
      if (!open(house, x, y, d)) continue;
      const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
      if (seen.has(key(nx, ny))) continue;
      seen.set(key(nx, ny), { from: key(x, y), d });
      queue.push([nx, ny]);
    }
  }
  return null;
}

// The hunter takes one step toward you. If no door leads to you, it waits and listens.
export function hunterStep(house) {
  if (house.over) return { kind: "over" };
  const steps = path(house, house.hunter);
  if (!steps || !steps.length) return { kind: steps ? "here" : "lost" };
  const [dx, dy] = DIRS[steps[0]];
  house.hunter.x += dx; house.hunter.y += dy;
  check(house);
  return { kind: house.caught ? "caught" : "step", d: steps[0], left: steps.length - 1 };
}

function check(house) {
  if (house.over) return;
  if (house.player.x === house.hunter.x && house.player.y === house.hunter.y) {
    house.over = true; house.caught = true;
  }
}

// When no door leads to you, the shadow wanders: through a random open door, never straight back if it can help it.
export function wander(house, rand, last = null) {
  if (house.over) return { kind: "over" };
  const back = last && { N: "S", S: "N", E: "W", W: "E" }[last];
  let ways = ["N", "E", "S", "W"].filter((d) => open(house, house.hunter.x, house.hunter.y, d));
  if (ways.length > 1 && back) ways = ways.filter((d) => d !== back);
  if (!ways.length) return { kind: "stuck" };
  const d = ways[Math.floor(rand() * ways.length)];
  house.hunter.x += DIRS[d][0]; house.hunter.y += DIRS[d][1];
  check(house);
  return { kind: house.caught ? "caught" : "wander", d };
}

// A shadow doesn't need doors forever. When it has no way to you, it can seep through one wall, toward you.
export function seep(house) {
  if (house.over) return { kind: "over" };
  const h = house.hunter, p = house.player;
  const dx = Math.sign(p.x - h.x), dy = Math.sign(p.y - h.y);
  if (!dx && !dy) return { kind: "here" };
  const d = Math.abs(p.x - h.x) >= Math.abs(p.y - h.y) ? (dx > 0 ? "E" : "W") : (dy > 0 ? "S" : "N");
  h.x += DIRS[d][0]; h.y += DIRS[d][1];
  check(house);
  return { kind: house.caught ? "caught" : "seep", d };
}
