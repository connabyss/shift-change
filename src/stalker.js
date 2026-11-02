// The shadow's mind, in tiles. It hunts by sight, searches where it lost you, follows noise,
// sometimes waits silently by a doorway near you, and sometimes freezes before it lunges.
import { canSee, tilePath, roomOf, roomCenter, R, FLOOR } from "./tiles.js";

export const SPEED = { wander: 1.0, search: 1.7, sneak: 1.4, hunt: 2.6, lunge: 4.4, pause: 0, lurk: 0, look: 0, stunned: 0, seep: 0.7 };
export const SIGHT = 9;

export function makeShadow(p) {
  return { x: p.x, y: p.y, mode: "wander", target: null, lastSeen: null, timer: 0, stuck: 0, path: null, pathAge: 9, silent: false };
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function go(sh, mode, target, timer = 0) {
  sh.mode = mode; sh.target = target && { x: target.x, y: target.y }; sh.timer = timer; sh.path = null; sh.pathAge = 9; sh.stuck = 0;
  sh.silent = mode === "lurk" || mode === "pause" || mode === "sneak";
}

// A doorway tile near the player that the shadow can stand in without being seen: a place to wait.
export function lurkSpot(map, player, rand) {
  const spots = [];
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
    if (map.kind[y][x] !== FLOOR) continue;
    const inDoor = (x % R === 0 || x % R === R - 1 || y % R === 0 || y % R === R - 1);
    const p = { x: x + 0.5, y: y + 0.5 }, d = dist(p, player);
    if (inDoor && d > 3 && d < 8 && !canSee(map, p, player, SIGHT)) spots.push(p);
  }
  return spots.length ? spots[Math.floor(rand() * spots.length)] : null;
}

// Did a slide cut it off from you? Its way to you is gone, or got much longer.
// before/after: tilePath results (an array of steps, or null for no way at all).
export function cutOff(before, after) {
  if (!before) return false; // it couldn't reach you anyway
  return after === null || after.length >= before.length + 6;
}

// You cut it off: it shrieks and stands confused for a few seconds, then comes looking.
export function stun(sh, secs = 4) { go(sh, "stunned", null, secs); }

// One tick. world: { map, player: {x, y, hidden}, sawHide, noise: {x, y} | null }. Returns what happened.
export function think(sh, world, dt, rand) {
  const { map, player } = world, events = [];
  if (sh.mode === "stunned") { // it can't see, hear or catch you; when it wakes it heads for you
    sh.timer -= dt;
    if (sh.timer <= 0) { go(sh, "search", player); events.push({ kind: "recover" }); }
    return events;
  }
  const seesYou = (!player.hidden || world.sawHide) && canSee(map, sh, player, SIGHT);
  if (seesYou) {
    sh.lastSeen = { x: player.x, y: player.y };
    if (!["hunt", "lunge", "pause"].includes(sh.mode)) {
      events.push({ kind: "spotted" });
      if (dist(sh, player) < 5 && rand() < 0.45) go(sh, "pause", player, 0.7); // goes still... then comes
      else go(sh, "hunt", player);
    } else sh.target = { x: player.x, y: player.y };
  } else if (sh.mode === "hunt" || sh.mode === "lunge") {
    events.push({ kind: "lost" });
    go(sh, "search", sh.lastSeen);
  }
  if (world.noise && !seesYou && !["hunt", "lunge", "pause"].includes(sh.mode)) {
    events.push({ kind: "heard" });
    go(sh, "search", world.noise);
  }

  if (!sh.target && sh.mode === "wander") nextMove(sh, world, rand, events); // nowhere to go: pick somewhere

  // timed modes
  if (sh.timer > 0) {
    sh.timer -= dt;
    if (sh.timer <= 0) {
      if (sh.mode === "pause") { go(sh, "lunge", player, 1.4); events.push({ kind: "lunge" }); }
      else if (sh.mode === "lunge") go(sh, "hunt", player);
      else if (sh.mode === "look" || sh.mode === "lurk") nextMove(sh, world, rand, events);
    }
  }

  // move
  if (sh.target && SPEED[sh.mode] > 0) {
    const speed = SPEED[sh.mode] * (world.pace ?? 1) * dt; // pace: slower on the first floors
    sh.pathAge += dt;
    if (!sh.path || sh.pathAge > 0.35) { sh.path = tilePath(map, sh, sh.target); sh.pathAge = 0; }
    if (sh.path === null) {
      sh.stuck += dt;
      if (sh.stuck > 2.5) { // shut out: it seeps through the walls instead, slowly
        if (sh.stuck - dt <= 2.5) events.push({ kind: "seep" });
        step(sh, sh.target, SPEED.seep * dt);
      }
    } else {
      sh.stuck = 0;
      const next = sh.path.length > 1 ? { x: sh.path[0].x + 0.5, y: sh.path[0].y + 0.5 } : sh.target;
      if (step(sh, next, speed) && sh.path.length) sh.path.shift();
    }
    if (dist(sh, sh.target) < 0.3 && sh.mode !== "hunt" && sh.mode !== "lunge") {
      if (sh.mode === "search") go(sh, "look", null, 2.2);
      else if (sh.mode === "sneak") { go(sh, "lurk", null, 5); events.push({ kind: "lurk" }); }
      else nextMove(sh, world, rand, events);
    }
  }

  // caught?
  const reach = player.hidden ? (world.sawHide ? 1.4 : 0) : 0.55;
  if (reach && dist(sh, player) < reach) events.push({ kind: "caught" });
  return events;
}

function step(sh, p, amount) {
  const d = dist(sh, p);
  if (d <= amount || d === 0) { sh.x = p.x; sh.y = p.y; return true; }
  sh.x += ((p.x - sh.x) / d) * amount; sh.y += ((p.y - sh.y) / d) * amount;
  return false;
}

// After looking around or waiting: lurk by a doorway near you, or drift toward your room, or wander.
function nextMove(sh, world, rand, events) {
  const r = rand();
  if (r < 0.35) {
    const spot = lurkSpot(world.map, world.player, rand);
    if (spot) { go(sh, "sneak", spot); return; }
  }
  if (r < 0.75) { go(sh, "wander", roomCenter(roomOf(world.player))); return; } // it has a feeling where you are
  const w = world.map.w / R, h = world.map.h / R;
  go(sh, "wander", roomCenter({ x: Math.floor(rand() * w), y: Math.floor(rand() * h) }));
  events.push({ kind: "wander" });
}
