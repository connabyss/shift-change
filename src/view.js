// The first-person view: a small raycaster that draws the house into a low-resolution pixel buffer.
// Walls get procedural wallpaper, the floor gets planks, and everything fades into the dark past your candle.
import { WALL, FRONT, WARDROBE, CODE, LOCK_LOOK } from "./tiles.js";

export const RW = 320, RH = 200, TEX = 32;

// ---------- textures, made once from a few lines of code ----------
function makeTex(fn) {
  const t = new Uint8ClampedArray(TEX * TEX * 3);
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    const [r, g, b] = fn(x, y);
    const i = (y * TEX + x) * 3; t[i] = r; t[i + 1] = g; t[i + 2] = b;
  }
  return t;
}
const PAPERS = [
  [[92, 58, 52], [70, 40, 38]], [[60, 72, 58], [44, 54, 42]], [[78, 70, 54], [58, 50, 38]],
  [[58, 56, 76], [42, 40, 58]], [[86, 64, 44], [64, 46, 30]], [[70, 70, 66], [50, 50, 48]], [[66, 48, 60], [48, 34, 44]],
];
export const WALLPAPER = PAPERS.map(([a, b], k) => makeTex((x, y) => {
  if (y > 26) return y === 27 ? [40, 30, 24] : [58, 44, 34]; // skirting board
  const stripe = k % 2 ? ((x >> 2) % 2 === 0) : (((x + y) >> 3) % 2 === 0 && ((x - y + 64) >> 3) % 2 === 0);
  const dot = k % 3 === 2 && (x % 8 === 3) && (y % 8 === 3);
  const c = stripe || dot ? a : b;
  const stain = Math.sin(x * 0.7 + k) * Math.cos(y * 0.4) > 0.92 ? -14 : 0;
  return [c[0] + stain, c[1] + stain, c[2] + stain];
}));
export const WARDROBE_TEX = makeTex((x, y) => {
  const edge = x < 2 || x > 29 || y < 2 || y > 29, split = x === 15 || x === 16;
  const knob = (x === 13 || x === 18) && y >= 14 && y <= 16;
  if (knob) return [190, 160, 90];
  if (edge || split) return [42, 28, 20];
  const grain = (Math.sin(y * 0.9 + Math.sin(x * 0.3) * 2) * 8) | 0;
  return [86 + grain, 58 + grain, 38 + grain];
});
export const DOOR_TEX = makeTex((x, y) => {
  if (x < 3 || x > 28) return [36, 26, 20];
  if ((x === 23 || x === 24) && (y === 16 || y === 17)) return [210, 175, 90];
  const panel = (y > 4 && y < 14) || (y > 18 && y < 28);
  const inPanel = panel && x > 6 && x < 25;
  const g = (Math.sin(y * 1.3 + x * 0.1) * 6) | 0;
  return inPanel ? [96 + g, 62 + g, 36] : [76 + g, 48 + g, 28];
});

// A wall with the house's code chalked on it: indented lines of different lengths, like a program.
const chalk = (ink) => makeTex((x, y) => {
  const lines = [[3, 4, 20], [6, 6, 26], [9, 6, 14], [12, 9, 28], [15, 9, 22], [18, 6, 18], [21, 4, 10], [24, 4, 24]];
  const g = (Math.sin(x * 1.7 + y * 0.9) * 4) | 0;
  // thin strokes broken into letters, with a space between words now and then
  for (const [ly, a, b] of lines) if (y === ly && x >= a && x <= b && x % 2 === 0 && ((x * 7 + ly) % 9 !== 0)) return ink;
  for (const [ly, a, b] of lines) if (y === ly + 1 && x >= a && x <= b && (x * 5 + ly) % 3 === 0 && ((x * 7 + ly) % 9 !== 0)) return ink;
  if (y > 27) return [40, 34, 30];
  return [30 + g, 34 + g, 32 + g];
});
export const CODE_TEX = chalk([200, 214, 190]);
export const LOCK_TEX = chalk([230, 110, 90]);

// The shadow: a tall dark shape with two pale eyes. Alpha 0 = see-through.
export const SHADOW_W = 32, SHADOW_H = 64;
export const SHADOW_TEX = (() => {
  const t = new Uint8ClampedArray(SHADOW_W * SHADOW_H * 4);
  for (let y = 0; y < SHADOW_H; y++) for (let x = 0; x < SHADOW_W; x++) {
    const cx = (x - SHADOW_W / 2) / (SHADOW_W / 2);
    const head = Math.hypot(cx * 1.6, (y - 14) / 9) < 1;
    const body = y > 18 && Math.abs(cx) < 0.55 + (y - 18) / 70 + Math.sin(y * 0.8 + x) * 0.04;
    const fringe = false;
    const i = (y * SHADOW_W + x) * 4;
    const eye = y >= 12 && y <= 13 && (x === 12 || x === 13 || x === 18 || x === 19);
    if (eye) { t[i] = 230; t[i + 1] = 226; t[i + 2] = 255; t[i + 3] = 255; continue; }
    if ((head || body) && !(y > 58 && fringe)) { t[i] = 4; t[i + 1] = 3; t[i + 2] = 7; t[i + 3] = 255; }
  }
  return t;
})();

// ---------- the renderer ----------
export function makeView() {
  return { buf: new Uint8ClampedArray(RW * RH * 4), z: new Float32Array(RW) };
}

// cam: {x, y, a}; light: candle strength (0..1.2); sprites: [{x, y, kind, glow}]
export function render(view, map, cam, light, sprites, hasKey, time = 0) {
  const { buf, z } = view;
  const dirX = Math.cos(cam.a), dirY = Math.sin(cam.a);
  const fov = 0.66, plX = -dirY * fov, plY = dirX * fov;
  const fall = (d) => Math.min(1.25, light / (1 + d * d * 0.11));
  // floor and ceiling, row by row
  for (let y = RH / 2; y < RH; y++) {
    const rowDist = (RH / 2) / (y - RH / 2 + 0.5);
    const lx = dirX - plX, ly = dirY - plY, rx = dirX + plX, ry = dirY + plY;
    let fx = cam.x + rowDist * lx, fy = cam.y + rowDist * ly;
    const sx = (rowDist * (rx - lx)) / RW, sy = (rowDist * (ry - ly)) / RW;
    const b = fall(rowDist);
    for (let x = 0; x < RW; x++, fx += sx, fy += sy) {
      const plank = (Math.floor(fy * 4) + (Math.floor(fx) % 2) * 2) % 4;
      const seam = (fy * 4) % 1 < 0.08;
      const base = seam ? 18 : 44 + plank * 4;
      let i = (y * RW + x) * 4;
      buf[i] = base * 1.15 * b; buf[i + 1] = base * 0.8 * b; buf[i + 2] = base * 0.55 * b; buf[i + 3] = 255;
      i = ((RH - y - 1) * RW + x) * 4; // ceiling: plain, darker
      buf[i] = 26 * b; buf[i + 1] = 22 * b; buf[i + 2] = 22 * b; buf[i + 3] = 255;
    }
  }
  // walls, column by column
  for (let x = 0; x < RW; x++) {
    const camX = (2 * x) / RW - 1, rdx = dirX + plX * camX, rdy = dirY + plY * camX;
    let mx = Math.floor(cam.x), my = Math.floor(cam.y);
    const ddx = Math.abs(1 / rdx), ddy = Math.abs(1 / rdy);
    const stepX = rdx < 0 ? -1 : 1, stepY = rdy < 0 ? -1 : 1;
    let sdx = rdx < 0 ? (cam.x - mx) * ddx : (mx + 1 - cam.x) * ddx;
    let sdy = rdy < 0 ? (cam.y - my) * ddy : (my + 1 - cam.y) * ddy;
    let side = 0, kind = WALL, hit = false;
    for (let n = 0; n < 64 && !hit; n++) {
      if (sdx < sdy) { sdx += ddx; mx += stepX; side = 0; } else { sdy += ddy; my += stepY; side = 1; }
      if (mx < 0 || my < 0 || mx >= map.w || my >= map.h) { hit = true; kind = WALL; break; }
      kind = map.kind[my][mx];
      if (kind !== 0) hit = true;
    }
    const perp = side === 0 ? sdx - ddx : sdy - ddy;
    z[x] = perp;
    const lineH = Math.floor(RH / Math.max(perp, 0.01));
    const top = Math.floor(RH / 2 - lineH / 2);
    let wx = side === 0 ? cam.y + perp * rdy : cam.x + perp * rdx;
    wx -= Math.floor(wx);
    const tx = Math.min(TEX - 1, Math.floor(wx * TEX));
    const look = mx >= 0 && my >= 0 && mx < map.w && my < map.h ? map.look[my][mx] : 0;
    const tex = kind === FRONT ? DOOR_TEX : kind === WARDROBE ? WARDROBE_TEX : kind === CODE ? (look === LOCK_LOOK ? LOCK_TEX : CODE_TEX) : WALLPAPER[look % WALLPAPER.length];
    let b = fall(perp) * (side ? 0.78 : 1);
    if (kind === CODE) b = Math.max(b, 0.42 + Math.sin(time * 2 + x * 0.02) * 0.06); // chalk catches what light there is
    if (kind === FRONT && hasKey) b = Math.max(b, 0.5); // the front door glows once you have the key
    for (let y = Math.max(0, top); y < Math.min(RH, top + lineH); y++) {
      const ty = Math.min(TEX - 1, Math.floor(((y - top) / lineH) * TEX));
      const t = (ty * TEX + tx) * 3, i = (y * RW + x) * 4;
      buf[i] = tex[t] * b; buf[i + 1] = tex[t + 1] * b; buf[i + 2] = tex[t + 2] * b;
    }
  }
  // sprites, far to near
  const order = sprites.map((s) => ({ ...s, d: (s.x - cam.x) ** 2 + (s.y - cam.y) ** 2 })).sort((a, b) => b.d - a.d);
  const inv = 1 / (plX * dirY - dirX * plY);
  for (const s of order) {
    const rx = s.x - cam.x, ry = s.y - cam.y;
    const tX = inv * (dirY * rx - dirX * ry), tY = inv * (-plY * rx + plX * ry);
    if (tY <= 0.1) continue;
    const sx = Math.floor((RW / 2) * (1 + tX / tY));
    const shadow = s.kind === "shadow";
    const h = Math.abs(Math.floor((RH / tY) * (shadow ? 1.22 : 0.25))), w = shadow ? h * 0.42 : h;
    const floorY = Math.floor(RH / 2 + (RH / tY) / 2);
    const top = floorY - h;
    const b = shadow ? 1 : Math.max(fall(Math.sqrt(s.d)), s.glow || 0);
    for (let x = Math.max(0, Math.floor(sx - w / 2)); x < Math.min(RW, sx + w / 2); x++) {
      if (tY >= z[x]) continue;
      const u = (x - (sx - w / 2)) / w;
      for (let y = Math.max(0, top); y < Math.min(RH, floorY); y++) {
        const v = (y - top) / h, i = (y * RW + x) * 4;
        if (shadow) {
          // ragged, smoky edges that never sit still
          const wob = Math.sin(v * 23 + time * 7 + s.x) * 0.05 + Math.sin(v * 51 - time * 11) * 0.03;
          const uu = Math.min(0.999, Math.max(0, (u - 0.5) * (1 + wob * 2) + 0.5));
          const t = (Math.floor(v * SHADOW_H) * SHADOW_W + Math.floor(uu * SHADOW_W)) * 4;
          if (!SHADOW_TEX[t + 3]) continue;
          if (v > 0.8 && Math.sin(u * 40 + time * 9 + v * 30) > (1 - v) * 6 - 0.4) continue; // it trails off into smoke
          const eye = SHADOW_TEX[t] > 100;
          const fade = Math.min(1, 1.6 / (1 + tY * 0.15)); // eyes stay bright: they glow in the dark
          buf[i] = eye ? SHADOW_TEX[t] * fade : 3; buf[i + 1] = eye ? SHADOW_TEX[t + 1] * fade : 2; buf[i + 2] = eye ? SHADOW_TEX[t + 2] * fade : 5;
        } else if (s.kind === "key") {
          const cx = u - 0.5, cy = v - 0.5, ring = Math.abs(Math.hypot(cx + 0.18, cy) - 0.12) < 0.05;
          const shaft = Math.abs(cy) < 0.04 && cx > -0.06 && cx < 0.3, tooth = cx > 0.18 && cx < 0.26 && cy > 0 && cy < 0.14;
          if (!(ring || shaft || tooth)) continue;
          buf[i] = 240 * b; buf[i + 1] = 200 * b; buf[i + 2] = 110 * b;
        }
      }
    }
  }
}

// Copy the buffer to the screen canvas, big and chunky, with a candle-colored tint.
export function present(view, img, ctx, x, y, w, h) {
  img.data.set(view.buf);
  const small = present.small ??= Object.assign(document.createElement("canvas"), { width: RW, height: RH });
  small.getContext("2d").putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, x, y, w, h);
}
