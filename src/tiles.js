// The house as tiles you can walk around in first person.
//
// Every room is R x R tiles. Its border is wall, with a one-tile gap in the middle of each side that has a door.
// Two rooms next to each other each have their own wall, so you only get through when BOTH rooms have a door there.
// A door that opens onto the next room's blank wall is a door to nowhere. The front door is a special wall tile.

import { N, E, S, W } from "./house.js";

export const R = 5;
export const FLOOR = 0, WALL = 1, FRONT = 2, WARDROBE = 3, CODE = 4;
// Where a room's line of code is written: on its north wall, just right of the doorway.
export const CODE_AT = { x: 3, y: 0 };
export const LOCK_LOOK = 100; // the lock's line is drawn in red

// decor[y][x] is each room's look (wallpaper, whether it has a wardrobe). It moves with its room.
export const hasWardrobe = (decor) => decor % 3 === 0;

// Tiles for the whole house. slide (optional): a shove in progress, the band still `left` tiles from where it lands.
// codes (optional): each room's line of code (code.js); a room with one gets a CODE wall tile.
export function buildTiles(house, decor, slide = null, codes = null) {
  const w = house.w * R, h = house.h * R;
  const kind = Array.from({ length: h }, () => new Array(w).fill(FLOOR));
  const look = Array.from({ length: h }, () => new Array(w).fill(0));
  for (let ry = 0; ry < house.h; ry++) for (let rx = 0; rx < house.w; rx++) {
    const d = house.rooms[ry][rx], m = Math.floor(R / 2);
    for (let ty = 0; ty < R; ty++) for (let tx = 0; tx < R; tx++) {
      let t = FLOOR;
      const edge = ty === 0 ? N : ty === R - 1 ? S : tx === 0 ? W : tx === R - 1 ? E : 0;
      if (edge) {
        const mid = (edge === N || edge === S) ? tx === m : ty === m;
        const corner = (tx === 0 || tx === R - 1) && (ty === 0 || ty === R - 1);
        t = mid && !corner && (d & edge) ? FLOOR : WALL;
        if (t === WALL && codes?.[ry][rx] && tx === CODE_AT.x && ty === CODE_AT.y) t = CODE;
      } else if (hasWardrobe(decor[ry][rx]) && tx === 1 && ty === 1) t = WARDROBE;
      kind[ry * R + ty][rx * R + tx] = t;
      look[ry * R + ty][rx * R + tx] = t === CODE && codes[ry][rx].kind === "lock" ? LOCK_LOOK : decor[ry][rx];
    }
  }
  const ex = house.exit;
  kind[ex.y * R + Math.floor(R / 2)][ex.x * R + R - 1] = FRONT;
  if (slide && slide.left) {
    const shift = -slide.dir * slide.left; // where the band is drawn right now, in tiles
    for (const grid of [kind, look]) {
      if (slide.axis === "row") for (let ty = slide.i * R; ty < slide.i * R + R; ty++) {
        const row = grid[ty]; grid[ty] = row.map((_, x) => row[((x - shift) % w + w) % w]);
      } else for (let tx = slide.i * R; tx < slide.i * R + R; tx++) {
        const col = grid.map((r) => r[tx]); col.forEach((_, y) => { grid[y][tx] = col[((y - shift) % h + h) % h]; });
      }
    }
  }
  return { w, h, kind, look };
}

export const solid = (map, x, y) => {
  const tx = Math.floor(x), ty = Math.floor(y);
  if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return true;
  return map.kind[ty][tx] !== FLOOR;
};

// Move a round body of radius r by (dx, dy), stopping at walls. Catching a doorway's edge doesn't stop you:
// you slip sideways toward the middle of the gap, so walking through doors feels smooth.
export function move(map, p, dx, dy, r) {
  const free = (x, y) => !solid(map, x - r, y - r) && !solid(map, x + r, y - r) && !solid(map, x - r, y + r) && !solid(map, x + r, y + r);
  const out = { x: p.x, y: p.y };
  for (const [ax, d] of [["x", dx], ["y", dy]]) {
    if (!d) continue;
    const other = ax === "x" ? "y" : "x";
    const to = { ...out, [ax]: out[ax] + d };
    if (free(to.x, to.y)) { out[ax] = to[ax]; continue; }
    // blocked: is the tile straight ahead open? then slide toward the middle of our lane
    const ahead = { ...out, [ax]: out[ax] + Math.sign(d) * (r + 0.05) };
    if (solid(map, ahead.x, ahead.y)) continue;
    const mid = Math.floor(out[other]) + 0.5, gap = mid - out[other];
    const nudge = Math.sign(gap) * Math.min(Math.abs(gap), Math.abs(d));
    const slid = { ...out, [other]: out[other] + nudge };
    if (nudge && free(slid.x, slid.y)) out[other] = slid[other];
  }
  return out;
}

// Which way to go to reach a place: the direction (radians) of the path a few steps ahead,
// or of a straight line if there's no way through (blocked: true, so slide the rooms).
export function guide(map, from, to) {
  const path = tilePath(map, from, to);
  if (!path) return { angle: Math.atan2(to.y - from.y, to.x - from.x), blocked: true };
  const step = path[Math.min(2, path.length - 1)] ?? { x: Math.floor(to.x), y: Math.floor(to.y) };
  return { angle: Math.atan2(step.y + 0.5 - from.y, step.x + 0.5 - from.x), blocked: false, steps: path.length };
}

// The room a tile position is in.
export const roomOf = (p) => ({ x: Math.floor(p.x / R), y: Math.floor(p.y / R) });
// The middle of a room, in tiles.
export const roomCenter = (r) => ({ x: r.x * R + R / 2, y: r.y * R + R / 2 });

// Shortest walk on tiles from a to b (tile coords), as a list of tiles to step to. null if there's no way.
export function tilePath(map, a, b) {
  const sx = Math.floor(a.x), sy = Math.floor(a.y), gx = Math.floor(b.x), gy = Math.floor(b.y);
  const key = (x, y) => y * map.w + x, prev = new Map([[key(sx, sy), -1]]);
  const q = [[sx, sy]];
  for (let qi = 0; qi < q.length; qi++) {
    const [x, y] = q[qi];
    if (x === gx && y === gy) {
      const out = [];
      for (let k = key(x, y); prev.get(k) !== -1; k = prev.get(k)) out.unshift({ x: k % map.w, y: Math.floor(k / map.w) });
      return out;
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h || map.kind[ny][nx] !== FLOOR || prev.has(key(nx, ny))) continue;
      prev.set(key(nx, ny), key(x, y));
      q.push([nx, ny]);
    }
  }
  return null;
}

// Can a see b? A straight line between them that crosses no wall.
export function canSee(map, a, b, range = 12) {
  const dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy);
  if (dist > range) return false;
  const steps = Math.ceil(dist * 4);
  for (let i = 1; i < steps; i++) if (solid(map, a.x + (dx * i) / steps, a.y + (dy * i) / steps)) return false;
  return true;
}
