// Everything drawn that isn't game logic: the night outside, the roof, wallpaper, the furniture each room's
// name asks for, and the two figures. All of it is drawn with shapes, no image files.
// `L` everywhere is how lit a room is (about 0.17 dark to 1 lit); every colour is multiplied by it.

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const shade = (c, k) => `rgb(${clamp(c[0] * k, 0, 255) | 0},${clamp(c[1] * k, 0, 255) | 0},${clamp(c[2] * k, 0, 255) | 0})`;
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

function poly(ctx, pts, fill) {
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
}

// ---------- outside ----------
// box: the house's frame {x, y, w, h}; flash: lightning, 0..1; bolt: x of the last bolt
export function night(ctx, vw, vh, box, t, flash, bolt, noMoon = false) {
  const sky = ctx.createLinearGradient(0, 0, 0, vh);
  sky.addColorStop(0, "#0c0f22"); sky.addColorStop(0.5, "#08080f"); sky.addColorStop(1, "#050407");
  ctx.fillStyle = sky; ctx.fillRect(0, 0, vw, vh);
  for (let i = 0; i < 70; i++) {
    const x = hash(i) * vw, y = hash(i + 99) * 140, a = 0.25 + 0.5 * Math.abs(Math.sin(t * (0.5 + hash(i + 7)) + i));
    ctx.fillStyle = `rgba(230,230,255,${a * 0.6})`; ctx.fillRect(x, y, 1.2, 1.2);
  }
  // moon, behind drifting cloud (unless someone pressed undo on it)
  const mx = box.x + 150, my = noMoon ? -999 : 30;
  const glow = ctx.createRadialGradient(mx, my, 10, mx, my, 90); glow.addColorStop(0, "rgba(220,225,255,0.25)"); glow.addColorStop(1, "rgba(220,225,255,0)");
  ctx.fillStyle = glow; ctx.fillRect(mx - 90, my - 90, 180, 180);
  ctx.fillStyle = "#e8e3cf"; ctx.beginPath(); ctx.arc(mx, my, 20, 0, 7); ctx.fill();
  ctx.fillStyle = "rgba(160,150,130,0.35)"; for (const [dx, dy, r] of [[-6, -5, 4], [5, 4, 3], [-2, 8, 2.5]]) { ctx.beginPath(); ctx.arc(mx + dx, my + dy, r, 0, 7); ctx.fill(); }
  for (let i = 0; i < 4; i++) {
    const w = 160 + hash(i + 3) * 160, x = ((t * (4 + i * 2) + hash(i) * 2000) % (vw + w)) - w, y = 18 + i * 17;
    ctx.fillStyle = `rgba(10,11,22,${0.75 - i * 0.1})`; ctx.beginPath(); ctx.ellipse(x + w / 2, y, w / 2, 9 + i * 2, 0, 0, 7); ctx.fill();
  }
  if (flash > 0) {
    ctx.fillStyle = `rgba(200,210,255,${flash * 0.35})`; ctx.fillRect(0, 0, vw, vh);
    if (flash > 0.6) {
      ctx.strokeStyle = `rgba(240,245,255,${flash})`; ctx.lineWidth = 2; ctx.beginPath();
      let x = bolt, y = 0; ctx.moveTo(x, y);
      while (y < box.y + 10) { x += (hash(y + bolt) - 0.5) * 30; y += 10 + hash(y * 3 + bolt) * 12; ctx.lineTo(x, y); }
      ctx.stroke();
    }
  }
}
export function rain(ctx, vw, vh, t, up = false) {
  ctx.strokeStyle = "rgba(170,185,230,0.2)"; ctx.lineWidth = 1; ctx.beginPath();
  for (let i = 0; i < 110; i++) {
    const sp = 380 + hash(i) * 200, x = (hash(i + 50) * (vw + 100) + t * 60) % (vw + 100) - 50, y = (hash(i + 20) * vh + t * sp) % (vh + 40) - 20;
    if (up) { ctx.moveTo(x, vh - y); ctx.lineTo(x + 3, vh - y - 11); } else { ctx.moveTo(x, y); ctx.lineTo(x - 3, y + 11); }
  }
  ctx.stroke();
}
// the roof (with tiles, an attic window and a smoking chimney) and the ground
export function roof(ctx, box, t, groundW) {
  const { x, y, w, h } = box, cx = x + w / 2;
  // chimney first, so the roof overlaps its foot
  const chx = x + w * 0.72;
  ctx.fillStyle = "#1a1418"; ctx.fillRect(chx, y - 58, 22, 50); ctx.fillStyle = "#231b20"; ctx.fillRect(chx - 3, y - 62, 28, 6);
  for (let i = 0; i < 7; i++) {
    const k = ((t * 0.25 + i / 7) % 1), px = chx + 11 + Math.sin(t + i * 2) * 6 + k * 40, py = y - 64 - k * 60;
    ctx.fillStyle = `rgba(90,90,105,${0.25 * (1 - k)})`; ctx.beginPath(); ctx.arc(px, py, 5 + k * 14, 0, 7); ctx.fill();
  }
  ctx.fillStyle = "#141017"; ctx.beginPath(); ctx.moveTo(x - 20, y); ctx.lineTo(cx, y - 60); ctx.lineTo(x + w + 20, y); ctx.closePath(); ctx.fill();
  ctx.save(); ctx.clip(); ctx.strokeStyle = "rgba(60,48,58,0.6)"; ctx.lineWidth = 1;
  for (let r = 1; r < 6; r++) { const yy = y - r * 10; ctx.beginPath(); ctx.moveTo(x - 20, yy); ctx.lineTo(x + w + 20, yy); ctx.stroke();
    for (let k = 0; k < 40; k++) { const xx = x - 20 + k * 18 + (r % 2) * 9; ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx, yy + 10); ctx.stroke(); } }
  ctx.restore();
  // attic window: round, faintly lit
  ctx.fillStyle = "#231b20"; ctx.beginPath(); ctx.arc(cx, y - 26, 12, 0, 7); ctx.fill();
  ctx.fillStyle = `rgba(255,190,110,${0.25 + 0.1 * Math.sin(t * 2.3)})`; ctx.beginPath(); ctx.arc(cx, y - 26, 8, 0, 7); ctx.fill();
  ctx.strokeStyle = "#231b20"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx - 8, y - 26); ctx.lineTo(cx + 8, y - 26); ctx.moveTo(cx, y - 34); ctx.lineTo(cx, y - 18); ctx.stroke();
  // the house's outer wall and the ground
  ctx.fillStyle = "#1c1820"; ctx.fillRect(x - 6, y - 4, w + 12, h + 8);
  ctx.fillStyle = "#0b090d"; ctx.fillRect(0, y + h + 4, groundW, 40);
  ctx.strokeStyle = "#0b090d"; ctx.lineWidth = 1.5; ctx.beginPath();
  for (let i = 0; i < 60; i++) { const gx = hash(i + 400) * groundW, gh = 4 + hash(i + 500) * 7; ctx.moveTo(gx, y + h + 5); ctx.lineTo(gx + Math.sin(t + i) * 1.5, y + h + 5 - gh); }
  ctx.stroke();
}

// ---------- inside a room ----------
// back wall pattern and a wainscot panel along its bottom
export function wallpaper(ctx, room, bx, by, bw, bh, L) {
  const c = room.wall, kind = room.id % 3;
  ctx.fillStyle = shade(c, 0.74 * L);
  if (kind === 0) for (let x = bx + 4; x < bx + bw; x += 9) ctx.fillRect(x, by, 2, bh * 0.62);
  else if (kind === 1) {
    for (let yy = by + 6; yy < by + bh * 0.6; yy += 12) for (let x = bx + 6 + ((yy / 12) % 2) * 6; x < bx + bw - 3; x += 12) {
      ctx.beginPath(); ctx.moveTo(x, yy - 3); ctx.lineTo(x + 3, yy); ctx.lineTo(x, yy + 3); ctx.lineTo(x - 3, yy); ctx.closePath(); ctx.fill();
    }
  } else {
    for (let yy = by + 7; yy < by + bh * 0.6; yy += 13) for (let x = bx + 7 + ((yy / 13) % 2) * 7; x < bx + bw - 3; x += 14) {
      ctx.beginPath(); ctx.arc(x, yy, 2.2, 0, 7); ctx.fill(); ctx.fillRect(x - 0.5, yy + 3, 1, 3);
    }
  }
  ctx.fillStyle = shade(c, 0.58 * L); ctx.fillRect(bx, by + bh * 0.64, bw, bh * 0.36);
  ctx.fillStyle = shade(c, 1.05 * L); ctx.fillRect(bx, by + bh * 0.64, bw, 2);
  ctx.strokeStyle = shade(c, 0.5 * L); ctx.lineWidth = 1;
  for (let x = bx + 10; x < bx + bw - 12; x += 22) ctx.strokeRect(x, by + bh * 0.71, 16, bh * 0.22);
}

// dust drifting through the lamplight
export function motes(ctx, room, G, L, t) {
  if (L < 0.5) return;
  for (let i = 0; i < 7; i++) {
    const s = room.id * 13 + i, x = G.bx + (hash(s) * G.bw + Math.sin(t * 0.3 + s) * 10), y = G.by + ((hash(s + 1) * G.bh - t * (3 + hash(s + 2) * 4)) % G.bh + G.bh) % G.bh;
    ctx.fillStyle = `rgba(255,230,180,${0.25 * L * (0.5 + 0.5 * Math.sin(t * 2 + s))})`; ctx.fillRect(x, y, 1.3, 1.3);
  }
}

// G: the room's geometry (bx, by, bw, bh back wall; fl(f, u) a floor point f across, u deep)
// Furniture stands along the back wall, so the figures walk in front of it.
export function furniture(ctx, room, G, L, t) {
  const { bx, by, bw, bh } = G, base = G.fl(0.5, 0.92)[1], s = bh / 80;
  const at = (f) => lerp(bx, bx + bw, f);
  const C = (rgb, k = 1) => shade(rgb, k * L);
  const shadowUnder = (x, w) => { ctx.fillStyle = `rgba(0,0,0,${0.35 * L})`; ctx.beginPath(); ctx.ellipse(x, base + 1, w / 2 + 3, 3, 0, 0, 7); ctx.fill(); };
  const WOOD = [92, 62, 40], DARK = [44, 34, 30], CLOTH = [120, 40, 46], IRON = [40, 40, 46], PALE = [200, 192, 176];
  switch (room.name) {
    case "nursery": {
      const x = at(0.62); shadowUnder(x + 18, 40); ctx.fillStyle = C(WOOD); ctx.fillRect(x, base - 22 * s, 38 * s, 3); ctx.fillRect(x, base - 6, 38 * s, 3);
      for (let k = 0; k <= 8; k++) ctx.fillRect(x + k * 4.6 * s, base - 22 * s, 1.5, 22 * s);
      const hx = at(0.2), rock = Math.sin(t * 1.3) * 0.12; ctx.save(); ctx.translate(hx, base - 2); ctx.rotate(rock);
      ctx.strokeStyle = C(WOOD); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, -40, 40, Math.PI * 0.38, Math.PI * 0.62); ctx.stroke();
      ctx.fillStyle = C(PALE, 0.8); ctx.fillRect(-9, -18, 18, 7); ctx.fillRect(6, -26, 5, 10); ctx.fillRect(-7, -11, 2, 9); ctx.fillRect(5, -11, 2, 9); ctx.restore();
      break;
    }
    case "kitchen": {
      const x = at(0.62); shadowUnder(x + 12, 26); ctx.fillStyle = C(IRON); ctx.fillRect(x, base - 26 * s, 26 * s, 26 * s); ctx.fillRect(x + 8, by - 20, 5, base - 26 * s - by + 20);
      ctx.fillStyle = L > 0.5 ? `rgba(255,120,40,${0.5 + 0.3 * Math.sin(t * 9)})` : C([60, 20, 10]); ctx.fillRect(x + 5, base - 12 * s, 16 * s, 5 * s);
      const tx = at(0.15); shadowUnder(tx + 18, 36); ctx.fillStyle = C(WOOD); ctx.fillRect(tx, base - 16 * s, 36 * s, 3); ctx.fillRect(tx + 3, base - 16 * s, 2, 16 * s); ctx.fillRect(tx + 36 * s - 5, base - 16 * s, 2, 16 * s);
      break;
    }
    case "library": {
      for (const f of [0.08, 0.58]) {
        const x = at(f), w = bw * 0.34, h = bh * 0.86; ctx.fillStyle = C(DARK); ctx.fillRect(x, base - h, w, h);
        for (let sh = 0; sh < 4; sh++) {
          const yy = base - h + 4 + sh * (h / 4); let bxp = x + 3;
          while (bxp < x + w - 4) { const bwid = 2 + hash(bxp + sh + room.id) * 3, bhgt = h / 4 - 6 - hash(bxp * 2) * 4; ctx.fillStyle = shade([[110, 40, 40], [50, 70, 60], [120, 100, 60], [60, 60, 90]][(hash(bxp + sh) * 4) | 0], L); ctx.fillRect(bxp, yy + (h / 4 - 4 - bhgt), bwid, bhgt); bxp += bwid + 0.7; }
          ctx.fillStyle = C(WOOD); ctx.fillRect(x, yy + h / 4 - 4, w, 2);
        }
      }
      break;
    }
    case "bath": {
      const x = at(0.3); shadowUnder(x + 26, 54); ctx.fillStyle = C(PALE, 0.95);
      ctx.beginPath(); ctx.moveTo(x, base - 18 * s); ctx.lineTo(x + 52 * s, base - 18 * s); ctx.quadraticCurveTo(x + 50 * s, base - 4, x + 40 * s, base - 4); ctx.lineTo(x + 10 * s, base - 4); ctx.quadraticCurveTo(x + 2, base - 4, x, base - 18 * s); ctx.fill();
      ctx.fillStyle = C([170, 150, 90]); for (const fx of [x + 9 * s, x + 41 * s]) ctx.fillRect(fx, base - 5, 3, 5);
      ctx.fillStyle = C([60, 70, 80]); ctx.fillRect(x + 4, base - 18 * s, 44 * s, 2);
      break;
    }
    case "chapel": {
      for (const f of [0.18, 0.82]) {
        const x = at(f); ctx.fillStyle = C(IRON); ctx.fillRect(x - 1, base - 34 * s, 2, 34 * s); ctx.fillRect(x - 6, base - 34 * s, 12, 2);
        for (const dx of [-5, 0, 5]) { ctx.fillStyle = C(PALE); ctx.fillRect(x + dx - 1, base - 41 * s, 2.5, 7 * s);
          ctx.fillStyle = `rgba(255,200,90,${0.6 + 0.4 * Math.sin(t * 12 + dx + room.id)})`; ctx.beginPath(); ctx.ellipse(x + dx, base - 43 * s, 1.4, 2.6, 0, 0, 7); ctx.fill(); }
      }
      ctx.fillStyle = C(WOOD); const px = at(0.32); ctx.fillRect(px, base - 12 * s, bw * 0.36, 3); ctx.fillRect(px, base - 20 * s, 3, 20 * s); ctx.fillRect(px + bw * 0.36 - 3, base - 12 * s, 3, 12 * s);
      break;
    }
    case "cellar": {
      for (const [f, k] of [[0.12, 1], [0.32, 0.9], [0.22, 0.85]]) {
        const x = at(f), w = 22 * s * k, h = 26 * s * k, yb = f === 0.22 ? base - 26 * s : base;
        if (f !== 0.22) shadowUnder(x + w / 2, w);
        ctx.fillStyle = C(WOOD, 0.9); ctx.beginPath(); ctx.ellipse(x + w / 2, yb - h / 2, w / 2, h / 2, 0, 0, 7); ctx.fill();
        ctx.strokeStyle = C(IRON, 1.4); ctx.lineWidth = 1.5; for (const yy of [0.3, 0.7]) { ctx.beginPath(); ctx.moveTo(x + 2, yb - h * yy); ctx.lineTo(x + w - 2, yb - h * yy); ctx.stroke(); }
      }
      ctx.fillStyle = C([40, 60, 40], 0.9); ctx.fillRect(at(0.7), base - 22 * s, 3, 22 * s); ctx.fillRect(at(0.85), base - 22 * s, 3, 22 * s); ctx.fillRect(at(0.7), base - 22 * s, bw * 0.15 + 3, 2);
      break;
    }
    case "attic": {
      ctx.fillStyle = C([110, 90, 62]); ctx.fillRect(at(0.08), base - 16 * s, 24 * s, 16 * s); ctx.fillRect(at(0.13), base - 28 * s, 18 * s, 12 * s);
      const x = at(0.62); shadowUnder(x + 14, 32); ctx.fillStyle = C(PALE, 0.85); ctx.beginPath();
      ctx.moveTo(x, base); ctx.quadraticCurveTo(x - 2, base - 30 * s, x + 10 * s, base - 36 * s); ctx.quadraticCurveTo(x + 20 * s, base - 40 * s, x + 26 * s, base - 30 * s);
      ctx.quadraticCurveTo(x + 32 * s + Math.sin(t) * 1.5, base - 10, x + 30 * s, base); ctx.closePath(); ctx.fill();
      break;
    }
    case "study": {
      const x = at(0.42); shadowUnder(x + 22, 44); ctx.fillStyle = C(WOOD); ctx.fillRect(x, base - 20 * s, 44 * s, 4); ctx.fillRect(x + 2, base - 20 * s, 3, 20 * s); ctx.fillRect(x + 44 * s - 14, base - 20 * s, 12, 20 * s);
      ctx.fillStyle = C(PALE); ctx.fillRect(x + 8, base - 22 * s, 10, 2);
      ctx.fillStyle = C([40, 110, 60]); ctx.beginPath(); ctx.moveTo(x + 26 * s, base - 20 * s - 10); ctx.lineTo(x + 34 * s, base - 20 * s - 10); ctx.lineTo(x + 32 * s, base - 20 * s - 15); ctx.lineTo(x + 28 * s, base - 20 * s - 15); ctx.fill();
      if (L > 0.5) { const g = ctx.createRadialGradient(x + 30 * s, base - 20 * s - 6, 1, x + 30 * s, base - 20 * s - 6, 26); g.addColorStop(0, "rgba(190,255,190,0.25)"); g.addColorStop(1, "rgba(190,255,190,0)"); ctx.fillStyle = g; ctx.fillRect(x, base - 60, 70, 60); }
      break;
    }
    case "parlour": {
      const x = at(0.55), w = 34 * s, h = 30 * s; ctx.fillStyle = C([70, 60, 56]); ctx.fillRect(x - 4, base - h - 4, w + 8, 4); ctx.fillRect(x, base - h, w, h);
      ctx.fillStyle = "#050405"; ctx.beginPath(); ctx.moveTo(x + 6, base); ctx.lineTo(x + 6, base - h + 12); ctx.arc(x + w / 2, base - h + 12, w / 2 - 6, Math.PI, 0); ctx.lineTo(x + w - 6, base); ctx.fill();
      for (let k = 0; k < 3; k++) { ctx.fillStyle = `rgba(255,${120 + k * 40},40,${0.7 - k * 0.15})`; ctx.beginPath(); ctx.ellipse(x + w / 2 + Math.sin(t * 7 + k) * 2, base - 5 - k * 3, 7 - k * 2, 6 + Math.sin(t * 11 + k) * 2, 0, 0, 7); ctx.fill(); }
      const ax = at(0.12); shadowUnder(ax + 14, 30); ctx.fillStyle = C(CLOTH); ctx.fillRect(ax, base - 14 * s, 28 * s, 10 * s); ctx.fillRect(ax, base - 28 * s, 6, 24 * s); ctx.fillRect(ax + 28 * s - 6, base - 18 * s, 6, 14 * s);
      break;
    }
    case "gallery": {
      for (const [f, w, h] of [[0.62, 18, 24], [0.82, 14, 18]]) { const x = at(f); ctx.fillStyle = C([120, 92, 50]); ctx.fillRect(x - w / 2, by + bh * 0.2, w, h); ctx.fillStyle = C([30, 30, 40]); ctx.fillRect(x - w / 2 + 2, by + bh * 0.2 + 2, w - 4, h - 4); }
      const px = at(0.5); shadowUnder(px, 14); ctx.fillStyle = C(PALE, 0.8); ctx.fillRect(px - 5, base - 22 * s, 10, 22 * s); ctx.beginPath(); ctx.arc(px, base - 28 * s, 5, 0, 7); ctx.fill(); ctx.fillRect(px - 6, base - 24 * s, 12, 3);
      break;
    }
    case "pantry": {
      const x = at(0.5), w = bw * 0.42;
      for (let k = 0; k < 3; k++) {
        const yy = base - 10 - k * 16 * s; ctx.fillStyle = C(WOOD); ctx.fillRect(x, yy, w, 2);
        for (let j = 0; j < 5; j++) { const jx = x + 4 + j * (w - 8) / 5; ctx.fillStyle = shade([[150, 60, 50], [180, 150, 60], [90, 120, 70]][(hash(j + k * 5 + room.id) * 3) | 0], L * 0.9); ctx.fillRect(jx, yy - 8, 6, 8); ctx.fillStyle = C(PALE, 0.7); ctx.fillRect(jx, yy - 9, 6, 1.5); }
      }
      break;
    }
    case "hall": {
      poly(ctx, [G.fl(0.25, 0.25), G.fl(0.75, 0.25), G.fl(0.72, 0.75), G.fl(0.28, 0.75)], C(CLOTH, 0.7));
      const x = at(0.82); shadowUnder(x, 12); ctx.fillStyle = C(DARK, 1.3); ctx.fillRect(x - 1, base - 44 * s, 3, 44 * s); ctx.fillRect(x - 7, base - 2, 15, 2);
      ctx.fillStyle = C([30, 30, 34], 1.2); ctx.beginPath(); ctx.moveTo(x - 2, base - 42 * s); ctx.quadraticCurveTo(x - 12, base - 26 * s, x - 6, base - 14 * s); ctx.lineTo(x + 2, base - 18 * s); ctx.closePath(); ctx.fill();
      break;
    }
  }
}

// ---------- figures ----------
export function player(ctx, x, y, t, walking) {
  const bob = walking ? Math.abs(Math.sin(t * 16)) * 1.6 : 0; y -= bob;
  const lx = x + 8, ly = y - 15, fl = 0.85 + 0.15 * Math.sin(t * 23) * Math.sin(t * 7);
  const g = ctx.createRadialGradient(lx, ly, 2, lx, ly, 60); g.addColorStop(0, `rgba(255,200,120,${0.32 * fl})`); g.addColorStop(1, "rgba(255,200,120,0)");
  ctx.fillStyle = g; ctx.fillRect(lx - 62, ly - 62, 124, 124);
  ctx.fillStyle = "#cfc3ad"; ctx.beginPath(); ctx.moveTo(x - 6, y - 4); ctx.lineTo(x - 4, y - 22); ctx.lineTo(x + 4, y - 22); ctx.lineTo(x + 6, y - 4); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "#cfc3ad"; ctx.lineWidth = 2; const sw = walking ? Math.sin(t * 16) * 3 : 0;
  ctx.beginPath(); ctx.moveTo(x - 2, y - 5); ctx.lineTo(x - 2 - sw, y); ctx.moveTo(x + 2, y - 5); ctx.lineTo(x + 2 + sw, y); ctx.stroke();
  ctx.fillStyle = "#e9dec8"; ctx.beginPath(); ctx.arc(x, y - 26, 4.5, 0, 7); ctx.fill();
  ctx.fillStyle = "#8a7a64"; ctx.beginPath(); ctx.arc(x, y - 27, 5.5, Math.PI * 1.05, Math.PI * 1.95); ctx.fill(); // hood
  ctx.strokeStyle = "#cfc3ad"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x + 3, y - 17); ctx.lineTo(lx, ly - 4); ctx.stroke();
  ctx.fillStyle = "#3a3026"; ctx.fillRect(lx - 3, ly - 4, 6, 8);
  ctx.fillStyle = `rgba(255,210,110,${fl})`; ctx.fillRect(lx - 1.8, ly - 2, 3.6, 4.5);
}
// o: { asleep, seep, near (rooms away), look (-1..1 toward you) }
export function shadow(ctx, x, y, t, o) {
  ctx.save(); ctx.globalAlpha = o.seep ? 0.45 : o.asleep ? 0.75 : 1;
  const g = ctx.createRadialGradient(x, y - 28, 4, x, y - 28, 56); g.addColorStop(0, "rgba(0,0,0,0.75)"); g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g; ctx.fillRect(x - 60, y - 90, 120, 110);
  // tendrils along the floor
  ctx.strokeStyle = "#040305"; ctx.lineWidth = 2.5; ctx.lineCap = "round";
  for (let i = 0; i < 5; i++) {
    const dir = i - 2, len = 14 + 8 * Math.abs(Math.sin(t * 1.7 + i));
    ctx.beginPath(); ctx.moveTo(x + dir * 3, y - 2);
    ctx.quadraticCurveTo(x + dir * len * 0.6, y + 2 + Math.sin(t * 3 + i) * 2, x + dir * len, y + Math.sin(t * 2 + i * 3) * 2); ctx.stroke();
  }
  // body, ragged and breathing
  ctx.fillStyle = "#040305"; ctx.beginPath(); ctx.moveTo(x - 12, y);
  const tall = 56 + Math.sin(t * 1.4) * 2;
  for (let k = 0; k <= 12; k++) { const a = k / 12, yy = y - a * tall, ww = (1 - a * a) * 12 + 3; ctx.lineTo(x - ww + Math.sin(t * 7 + k) * 1.6, yy); }
  for (let k = 12; k >= 0; k--) { const a = k / 12, yy = y - a * tall, ww = (1 - a * a) * 12 + 3; ctx.lineTo(x + ww + Math.sin(t * 6 + k * 2) * 1.6, yy); }
  ctx.closePath(); ctx.fill();
  // long arms that sway
  ctx.lineWidth = 2; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + s * 8, y - tall * 0.62); ctx.quadraticCurveTo(x + s * 18, y - tall * 0.4, x + s * (14 + Math.sin(t * 2 + s) * 3), y - 10); ctx.stroke(); }
  // smoke rising off it
  for (let i = 0; i < 6; i++) { const k = (t * 0.6 + i / 6) % 1; ctx.fillStyle = `rgba(0,0,0,${0.35 * (1 - k)})`; ctx.beginPath(); ctx.arc(x + Math.sin(t * 2 + i) * 6, y - tall - k * 34, 3 + k * 7, 0, 7); ctx.fill(); }
  const ey = y - tall + 13, lx = (o.look || 0) * 1.5;
  if (o.asleep) { ctx.strokeStyle = "rgba(240,230,210,0.35)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - 5, ey); ctx.lineTo(x - 2, ey); ctx.moveTo(x + 2, ey); ctx.lineTo(x + 5, ey); ctx.stroke(); }
  else { const r = o.near <= 1 ? 3.2 : 2.5; ctx.shadowColor = o.near <= 1 ? "#ff5a4e" : "#fff"; ctx.shadowBlur = o.near <= 1 ? 12 : 6; ctx.fillStyle = "#f3e9d2"; ctx.fillRect(x - 5 + lx, ey, r, r); ctx.fillRect(x + 2.5 + lx, ey, r, r); }
  ctx.restore();
}
