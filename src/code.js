// The house is written in code. Some walls carry one line of it, and you can change ONE word.
// Each room's line moves with its room. The lock's line sits in the lock's room (house.key).
//
// A line: { kind: "shift", axis: "row" | "col", dir: 1 | -1 }  this.row.shift(east)   E: the row slides, the word flips
//         { kind: "lights", on: true }                          this.lights = on       E: on/off. In the dark it can't see far.
//         { kind: "sleep", used: false }                        shadow.awake = true    E: it sleeps a while. Once.
//         { kind: "lock" }                                      frontDoor.locked = true  E: the front door opens.
//         { kind: "lock", trap: true }   (the last floor)       you.trapped = true

const DIR = { row: { 1: "east", [-1]: "west" }, col: { 1: "south", [-1]: "north" } };

// The line as three parts, so the word you can change can be drawn on its own.
export function line(c) {
  if (!c) return null;
  if (c.kind === "shift") return { pre: `this.${c.axis === "row" ? "row" : "column"}.shift(`, word: DIR[c.axis][c.dir], post: ")" };
  if (c.kind === "lights") return { pre: "this.lights = ", word: c.on ? "on" : "off", post: ";" };
  if (c.kind === "sleep") return { pre: "shadow.awake = ", word: c.used ? "false" : "true", post: ";", spent: c.used };
  if (c.kind === "lock") return { pre: c.trap ? "you.trapped = " : "frontDoor.locked = ", word: c.open ? "false" : "true", post: ";", spent: c.open };
  return null;
}

// What pressing E does: the change to make in the world, and the line as it reads afterwards.
// A shift runs the way the word says, then the word turns round, so pressing again puts it back.
export function edit(c) {
  if (c.kind === "shift") return { effect: { shift: c.axis, dir: c.dir }, next: { ...c, dir: -c.dir } };
  if (c.kind === "lights") return { effect: { lights: !c.on }, next: { ...c, on: !c.on } };
  if (c.kind === "sleep") return c.used ? { effect: null, next: c } : { effect: { sleep: 8 }, next: { ...c, used: true } };
  if (c.kind === "lock") return c.open ? { effect: null, next: c } : { effect: { unlock: true }, next: { ...c, open: true } };
  return { effect: null, next: c };
}

// Lines for a floor's rooms, seeded. Most rooms can slide their row or column; some have a light switch;
// floors 2 and 3 hide one line that puts the shadow to sleep. Your starting room always slides its row.
// lock: the room whose line locks the front door.
export function floorCodes(w, h, rand, n, start, lock = null) {
  const codes = Array.from({ length: h }, () => Array.from({ length: w }, () => {
    const r = rand();
    if (r < 0.55) return { kind: "shift", axis: rand() < 0.5 ? "row" : "col", dir: rand() < 0.5 ? 1 : -1 };
    if (r < 0.75) return { kind: "lights", on: true };
    return null;
  }));
  codes[start.y][start.x] = { kind: "shift", axis: "row", dir: 1 };
  if (n >= 2) {
    let x, y;
    do { x = Math.floor(rand() * w); y = Math.floor(rand() * h); } while ((x === start.x && y === start.y) || (lock && x === lock.x && y === lock.y));
    codes[y][x] = { kind: "sleep", used: false };
  }
  if (lock) codes[lock.y][lock.x] = { kind: "lock" };
  return codes;
}

// Move a grid that rides with the rooms (decor, codes) the way a shove moved them.
export function shiftGrid(grid, axis, i, dir) {
  const wrap = (v, n) => ((v % n) + n) % n;
  if (axis === "row") { const row = grid[i]; grid[i] = row.map((_, x) => row[wrap(x - dir, row.length)]); }
  else { const col = grid.map((r) => r[i]); col.forEach((_, y) => { grid[y][i] = col[wrap(y - dir, grid.length)]; }); }
}
