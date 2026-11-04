// The finale's screen break. The last lock opens and the game shrinks into a window on a desktop. The house's rooms
// tear out through the window frame and hang over the desktop. A "not responding" box comes up, and the house
// rewrites its button. Then the rooms slam back in and the chase starts. It's all drawn on the game's own canvas from
// a copy of the frame: no new mechanics, and nothing to click (a click skips ahead).
import { lerp, clamp, shadow } from "./art.js";

// seconds: cracks, zoom out, rooms tear out, it shifts your desktop, the shadow rises, rooms slam back, zoom in
export const TEAR = { crack: 0.6, out: 1.5, tear: 2.7, shift: 3.1, rise: 3.5, hold: 5.2, slam: 5.8, len: 6.6 };
const ease = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeIn = (t) => t * t * t;
const rnd = (i) => { const v = Math.sin(i * 12.9898 + 4.1) * 43758.5453; return v - Math.floor(v); };
const SANS = 'system-ui, "Segoe UI", Arial, sans-serif';

// how far out the window is (0 = the game fills the screen, 1 = a window on the desktop)
export function zoom(t) {
  if (t < TEAR.crack) return 0;
  if (t < TEAR.out) return ease((t - TEAR.crack) / (TEAR.out - TEAR.crack));
  if (t < TEAR.slam) return 1;
  return 1 - ease(clamp((t - TEAR.slam) / (TEAR.len - TEAR.slam), 0, 1));
}
// how far piece i is out of the window (0 = home, 1 = on the desktop)
export function outK(t, i) {
  if (t >= TEAR.hold) return 1 - easeIn(clamp((t - TEAR.hold) / (TEAR.slam - TEAR.hold), 0, 1));
  return easeOut(clamp((t - TEAR.out - i * 0.07) / 0.8, 0, 1));
}
// what the window is called, as the house takes it over
export function windowTitle(t) { return t < TEAR.out + 0.4 ? "house.js - The Shifting House" : "you.js (Not Responding)"; }

// cracks in the glass: a few jagged lines out from where it hit (in game coordinates)
let cracks = null;
function makeCracks(cx, cy) {
  const out = [];
  for (let i = 0; i < 11; i++) {
    let a = (i / 11) * Math.PI * 2 + rnd(i) * 0.5, x = cx, y = cy; const pts = [[x, y]], n = 5 + ((rnd(i + 30) * 4) | 0);
    for (let j = 0; j < n; j++) { a += (rnd(i * 7 + j) - 0.5) * 0.7; const d = 30 + rnd(i * 13 + j) * 70; x += Math.cos(a) * d; y += Math.sin(a) * d; pts.push([x, y]); }
    out.push(pts);
  }
  return out;
}
export function drawCracks(ctx, G, k, map, alpha) {
  if (!cracks) cracks = makeCracks(G.HX + G.CW * 0.5, G.HY + G.HH - G.CH * 0.5);
  ctx.save(); ctx.lineJoin = "round";
  for (const [li, pts] of cracks.entries()) {
    const shown = Math.floor(pts.length * clamp(k * 1.4 - li * 0.03, 0, 1)); if (shown < 2) continue;
    for (const [w, col] of [[3, `rgba(0,0,0,${0.5 * alpha})`], [1.2, `rgba(235,240,255,${0.8 * alpha})`]]) {
      ctx.beginPath(); ctx.lineWidth = w; ctx.strokeStyle = col;
      pts.slice(0, shown).forEach(([x, y], j) => { const [px, py] = map(x, y); j ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
      ctx.stroke();
    }
  }
  ctx.restore();
}

// the pieces: the roof, then every room (in game coordinates), each with a torn edge and a place to fly to
let pieces = null;
function makePieces(G) {
  const list = [{ x: G.HX - 30, y: G.HY - 70, w: G.HW + 60, h: 70 }];
  for (let y = 0; y < G.H; y++) for (let x = 0; x < G.W; x++) list.push({ x: G.HX + x * G.CW, y: G.HY + y * G.CH, w: G.CW, h: G.CH });
  const cx = G.HX + G.HW / 2, cy = G.HY + G.HH / 2;
  return list.map((p, i) => {
    const mx = p.x + p.w / 2, my = p.y + p.h / 2, dx = mx - cx, dy = my - cy - 40, d = Math.hypot(dx, dy) || 1;
    const far = 150 + rnd(i + 5) * 110;
    // a jagged outline, so each piece looks torn out rather than cut
    const edge = [], jag = (j) => (rnd(i * 31 + j) - 0.5) * 9;
    for (let s = 0; s <= 6; s++) edge.push([-p.w / 2 + (p.w * s) / 6, -p.h / 2 + jag(s)]);
    for (let s = 1; s <= 6; s++) edge.push([p.w / 2 + jag(s + 10), -p.h / 2 + (p.h * s) / 6]);
    for (let s = 5; s >= 0; s--) edge.push([-p.w / 2 + (p.w * s) / 6, p.h / 2 + jag(s + 20)]);
    for (let s = 5; s >= 1; s--) edge.push([-p.w / 2 + jag(s + 30), -p.h / 2 + (p.h * s) / 6]);
    return { ...p, i, dx: (dx / d) * far * 1.25, dy: (dy / d) * far - 30, rot: (rnd(i + 9) - 0.5) * 0.8, edge };
  });
}

export function draw(ctx, src, t, G) {
  if (!pieces) pieces = makePieces(G);
  const { VW, VH, DPR } = G, z = zoom(t);
  const slamFlash = t >= TEAR.slam && t < TEAR.slam + 0.12;
  const shake = t < TEAR.crack ? 1 - t / TEAR.crack : Math.max(0, 1 - Math.abs(t - TEAR.slam) / 0.35);
  ctx.save();
  if (shake > 0) ctx.translate((rnd(t * 97) - 0.5) * 16 * shake, (rnd(t * 89) - 0.5) * 16 * shake);

  // the desktop behind the game, and then the house does to it what it does to its rooms: it shifts the rows
  shiftedDesktop(ctx, G, z, t);
  // the window: the game, scaled down, with a title bar
  const s = lerp(1, 0.56, z), cw = VW * s, chh = VH * s, x0 = lerp(0, VW / 2 + 40 - cw / 2, z), y0 = lerp(0, 92, z);
  const map = (x, y) => [x0 + x * s, y0 + y * s];
  if (z > 0) {
    ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.7)"; ctx.shadowBlur = 40 * z; ctx.shadowOffsetY = 12 * z;
    ctx.fillStyle = "#1c1d24"; ctx.fillRect(x0 - 1, y0 - 27 * z, cw + 2, chh + 27 * z + 1); ctx.restore();
    ctx.globalAlpha = z; ctx.fillStyle = "#2a2b33"; ctx.fillRect(x0, y0 - 26, cw, 26);
    const stuck = t >= TEAR.out + 0.4;
    ctx.font = `13px ${SANS}`; ctx.fillStyle = stuck ? "#ff8f84" : "#d8d8de"; ctx.fillText(windowTitle(t), x0 + 10, y0 - 9);
    ctx.fillStyle = "#b9bac2"; ctx.font = `14px ${SANS}`; ["–", "□", "×"].forEach((g, j) => ctx.fillText(g, x0 + cw - 74 + j * 26, y0 - 8));
    if (stuck) { ctx.fillStyle = "rgba(255,255,255,0.18)"; ctx.fillRect(x0, y0, cw, chh); } // "not responding" goes pale
    ctx.globalAlpha = 1;
  }
  ctx.drawImage(src, 0, 0, src.width, src.height, x0, y0, cw, chh);
  if (t >= TEAR.out + 0.4 && t < TEAR.slam) { ctx.fillStyle = "rgba(235,235,240,0.22)"; ctx.fillRect(x0, y0, cw, chh); }

  // where the rooms were: nothing, and the house's word for it
  for (const p of pieces) {
    if (outK(t, p.i) < 0.03) continue;
    const [hx, hy] = map(p.x, p.y), w = p.w * s, h = p.h * s;
    ctx.fillStyle = "#020203"; ctx.fillRect(hx, hy, w, h);
    ctx.strokeStyle = "rgba(255,90,78,0.35)"; ctx.setLineDash([3, 4]); ctx.lineWidth = 1; ctx.strokeRect(hx + 2, hy + 2, w - 4, h - 4); ctx.setLineDash([]);
    if (p.i) { ctx.font = `${Math.round(13 * s / 0.56)}px ${G.MONO}`; ctx.fillStyle = "rgba(255,90,78,0.55)"; ctx.textAlign = "center"; ctx.fillText("undefined", hx + w / 2, hy + h / 2 + 4); ctx.textAlign = "left"; }
  }
  drawCracks(ctx, G, clamp(t / TEAR.crack, 0, 1), map, 1);

  // the rooms, out over the desktop
  for (const p of pieces) {
    const k = outK(t, p.i); if (k < 0.03) continue;
    const [hx, hy] = map(p.x + p.w / 2, p.y + p.h / 2), bob = t < TEAR.hold ? Math.sin(t * 2.6 + p.i) * 3 * k : 0;
    const sc = s * lerp(1, 1.2, k), px = hx + p.dx * k, py = hy + p.dy * k + bob;
    ctx.save(); ctx.translate(px, py); ctx.rotate(p.rot * k); ctx.scale(sc, sc);
    ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.75)"; ctx.shadowBlur = 30 * k; ctx.shadowOffsetX = 10 * k; ctx.shadowOffsetY = 18 * k;
    outline(ctx, p.edge); ctx.fillStyle = "#0b0a0c"; ctx.fill(); ctx.restore();
    ctx.save(); outline(ctx, p.edge); ctx.clip(); ctx.filter = "brightness(1.35) saturate(1.3)"; // out here, in the light
    ctx.drawImage(src, p.x * DPR, p.y * DPR, p.w * DPR, p.h * DPR, -p.w / 2 - 1, -p.h / 2 - 1, p.w + 2, p.h + 2); ctx.restore();
    outline(ctx, p.edge); ctx.strokeStyle = "rgba(232,220,192,0.75)"; ctx.lineWidth = 2.2 / sc; ctx.stroke();
    ctx.restore();
  }

  // the shadow climbs out after them: you.copy(), as tall as your screen
  if (t > TEAR.rise && t < TEAR.slam + 0.1) {
    const k = easeOut(clamp((t - TEAR.rise) / 1.1, 0, 1)), sink = t > TEAR.hold ? easeIn(clamp((t - TEAR.hold) / (TEAR.slam - TEAR.hold), 0, 1)) : 0;
    ctx.save(); ctx.translate(VW - 150, VH - 30 + lerp(330, 0, k) + sink * 360); ctx.scale(5.2, 5.2);
    shadow(ctx, 0, 0, t, { asleep: false, seep: false, near: 0, look: -1 }); ctx.restore();
  }
  // the house's own line, typed over your desktop
  if (t > TEAR.shift - 0.4 && t < TEAR.slam) {
    const line = SHIFT_LINE, n = Math.floor(clamp((t - TEAR.shift + 0.4) * 34, 0, line.length));
    ctx.font = `30px ${G.MONO}`; const tw = ctx.measureText(line).width, lx = VW / 2 + 40 - tw / 2;
    ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(lx - 14, 14, tw + 28, 42);
    ctx.fillStyle = "#ff5a4e"; ctx.fillText(line.slice(0, n), lx, 45);
  }
  // "not responding", and the house changes the button
  if (t > TEAR.tear - 0.3 && t < TEAR.slam + 0.1) dialog(ctx, G, t);
  ctx.restore();
  if (slamFlash) { ctx.fillStyle = "rgba(255,245,235,0.55)"; ctx.fillRect(0, 0, VW, VH); }
}

function outline(ctx, edge) { ctx.beginPath(); edge.forEach(([x, y], j) => j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); }

export const SHIFT_LINE = "desktop.row.shift(east);  // yours too";
// The desktop is drawn once per frame off screen, then cut into rows that slide and wrap round, like the house's rows.
let deskCv = null;
function shiftedDesktop(ctx, G, z, t) {
  const { VW, VH, DPR } = G;
  if (!deskCv) { deskCv = document.createElement("canvas"); deskCv.width = VW * DPR; deskCv.height = VH * DPR; }
  const d = deskCv.getContext("2d"); d.setTransform(DPR, 0, 0, DPR, 0, 0); desktop(d, G);
  const k = ease(clamp((t - TEAR.shift) / 0.7, 0, 1)), back = t > TEAR.hold ? ease(clamp((t - TEAR.hold) / 0.5, 0, 1)) : 0;
  const bands = [[0, 140, 1], [140, 280, -1], [280, VH - 34, 1], [VH - 34, VH, -1]];
  for (const [y1, y2, dir] of bands) {
    const off = (((dir * 190 * (k - back)) % VW) + VW) % VW;
    for (const ox of [off - VW, off]) ctx.drawImage(deskCv, 0, y1 * DPR, VW * DPR, (y2 - y1) * DPR, ox, y1, VW, y2 - y1);
    if (k > 0 && k < 1) { ctx.fillStyle = "rgba(255,90,78,0.5)"; ctx.fillRect(0, y2 - 1, VW, 2); } // the seams show as it moves
  }
  if (z < 1) { ctx.fillStyle = `rgba(0,0,0,${(1 - z) * 0.6})`; ctx.fillRect(0, 0, VW, VH); }
}
export const ICONS = [["house.js", "#ffd36a"], ["you.js", "#ff5a4e"], ["notes.txt", "#e8e4dc"], ["shadow.js", "#5d5a66"], ["Bin", "#9aa3ad"]];
export const iconAt = (j) => ({ x: 26, y: 22 + j * 82, w: 50, h: 70 });
export function fileIcon(ctx, x, y, col, k = 1) {
  ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
  ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(30, 0); ctx.lineTo(40, 10); ctx.lineTo(40, 48); ctx.lineTo(8, 48); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fillRect(13, 20, 22, 2); ctx.fillRect(13, 27, 18, 2); ctx.fillRect(13, 34, 20, 2);
  ctx.restore();
}
export function label(ctx, text, x, y) {
  ctx.font = `12px ${SANS}`; ctx.textAlign = "center"; ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillText(text, x + 1, y + 1); ctx.fillStyle = "#f2f2f4"; ctx.fillText(text, x, y); ctx.textAlign = "left";
}
export function desktop(ctx, G, app = "house.js") {
  const { VW, VH } = G;
  const wall = ctx.createLinearGradient(0, 0, VW, VH); wall.addColorStop(0, "#14304a"); wall.addColorStop(0.55, "#1d2440"); wall.addColorStop(1, "#2c1830");
  ctx.fillStyle = wall; ctx.fillRect(-20, -20, VW + 40, VH + 40);
  const glow = ctx.createRadialGradient(VW * 0.7, VH * 0.25, 20, VW * 0.7, VH * 0.25, 520); glow.addColorStop(0, "rgba(120,170,230,0.22)"); glow.addColorStop(1, "rgba(120,170,230,0)");
  ctx.fillStyle = glow; ctx.fillRect(0, 0, VW, VH);
  // the icons down the left: the house knows what's on your desktop
  ICONS.forEach(([name, col], j) => { const { x, y } = iconAt(j); fileIcon(ctx, x, y, col); label(ctx, name, x + 24, y + 63); });
  // the taskbar, with today's real time on it
  const ty = VH - 34; ctx.fillStyle = "rgba(10,12,18,0.92)"; ctx.fillRect(0, ty, VW, 34);
  ctx.fillStyle = "#8fb8e8"; ctx.beginPath(); ctx.arc(22, ty + 17, 9, 0, 7); ctx.fill();
  if (app) { ctx.fillStyle = "rgba(255,255,255,0.12)"; ctx.fillRect(46, ty + 4, 120, 26); ctx.fillStyle = "#ffd36a"; ctx.fillRect(46, ty + 30, 120, 2); }
  ctx.font = `13px ${SANS}`; ctx.fillStyle = "#e6e6ea"; if (app) ctx.fillText(app, 58, ty + 22);
  ctx.textAlign = "right"; ctx.fillText(G.clock[0], VW - 14, ty + 15); ctx.fillStyle = "#a9adb8"; ctx.fillText(G.clock[1], VW - 14, ty + 29); ctx.textAlign = "left";
}

export { SANS };
export const DIALOG = { title: "you.js", text: "you.js is not responding.", sub: "If you close it, it keeps what it has of you.", wait: "Wait", close: "Close the program", stay: "Stay" };
function dialog(ctx, G, t) {
  const pop = easeOut(clamp((t - (TEAR.tear - 0.3)) / 0.25, 0, 1)), crush = t > TEAR.slam - 0.12 ? clamp((t - (TEAR.slam - 0.12)) / 0.2, 0, 1) : 0;
  const w = 372, h = 150, x = G.VW / 2 + 40 - w / 2, y = 300;
  ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.scale(lerp(0.9, 1, pop), lerp(0.9, 1, pop) * (1 - crush)); ctx.globalAlpha = pop; ctx.translate(-w / 2, -h / 2);
  ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 26; ctx.shadowOffsetY = 8; ctx.fillStyle = "#f1f1f3"; ctx.fillRect(0, 0, w, h); ctx.restore();
  ctx.fillStyle = "#dcdce2"; ctx.fillRect(0, 0, w, 26); ctx.font = `13px ${SANS}`; ctx.fillStyle = "#222"; ctx.fillText(DIALOG.title, 10, 17); ctx.fillText("×", w - 20, 18);
  ctx.fillStyle = "#e8a320"; ctx.beginPath(); ctx.moveTo(34, 42); ctx.lineTo(52, 74); ctx.lineTo(16, 74); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#fff"; ctx.font = `bold 18px ${SANS}`; ctx.fillText("!", 31, 70);
  ctx.fillStyle = "#111"; ctx.font = `15px ${SANS}`; ctx.fillText(DIALOG.text, 66, 54); ctx.fillStyle = "#555"; ctx.font = `13px ${SANS}`; ctx.fillText(DIALOG.sub, 66, 76);
  // the house rewrites its own button: "Close the program" backspaces away, and it types "Stay"
  const k = t - (TEAR.tear + 0.5), close = DIALOG.close, del = Math.floor(clamp(k * 22, 0, close.length)), typed = Math.floor(clamp((k - close.length / 22 - 0.15) * 9, 0, DIALOG.stay.length));
  const label = del < close.length ? close.slice(0, close.length - del) : DIALOG.stay.slice(0, typed), rewritten = del >= close.length;
  for (const [bx, text, hot] of [[w - 292, DIALOG.wait, false], [w - 148, label, rewritten]]) {
    ctx.fillStyle = hot ? "rgba(255,211,106,0.25)" : "#e4e4e9"; ctx.fillRect(bx, h - 44, 136, 30);
    ctx.strokeStyle = hot ? "#c99a2e" : "#aeb0b8"; ctx.lineWidth = 1; ctx.strokeRect(bx + 0.5, h - 43.5, 135, 29);
    ctx.font = hot ? `20px ${G.MONO}` : `13px ${SANS}`; ctx.fillStyle = hot ? "#b5410f" : "#222"; ctx.textAlign = "center";
    ctx.fillText(text + (hot && typed < DIALOG.stay.length && Math.sin(t * 20) > 0 ? "_" : ""), bx + 68, h - 24); ctx.textAlign = "left";
  }
  ctx.restore();
}

// Press Shift five times and the house answers with its own Sticky Keys box. Drawn in the game, so it looks the same
// on Windows, Mac and Linux, and it turns nothing on: both buttons say yes, and any click closes it.
export const STICKY = { title: "Sticky Keys", text: "Turn on Sticky Keys?", sub: "Everything in this house sticks. You did.", yes: "Yes" };
export function drawSticky(ctx, G, t) {
  const pop = easeOut(clamp(t / 0.2, 0, 1)), w = 360, h = 140, x = G.VW / 2 - w / 2, y = G.VH / 2 - h / 2;
  ctx.save(); ctx.globalAlpha = pop; ctx.translate(x + w / 2, y + h / 2); ctx.scale(lerp(0.9, 1, pop), lerp(0.9, 1, pop)); ctx.translate(-w / 2, -h / 2);
  ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.7)"; ctx.shadowBlur = 26; ctx.shadowOffsetY = 8; ctx.fillStyle = "#f1f1f3"; ctx.fillRect(0, 0, w, h); ctx.restore();
  ctx.fillStyle = "#dcdce2"; ctx.fillRect(0, 0, w, 26); ctx.font = `13px ${SANS}`; ctx.fillStyle = "#222"; ctx.fillText(STICKY.title, 10, 17);
  ctx.fillStyle = "#111"; ctx.font = `15px ${SANS}`; ctx.fillText(STICKY.text, 20, 54); ctx.fillStyle = "#8a2a20"; ctx.font = `italic 14px ${SANS}`; ctx.fillText(STICKY.sub, 20, 78);
  for (const bx of [w - 232, w - 116]) {
    ctx.fillStyle = "rgba(255,211,106,0.25)"; ctx.fillRect(bx, h - 42, 100, 28); ctx.strokeStyle = "#c99a2e"; ctx.lineWidth = 1; ctx.strokeRect(bx + 0.5, h - 41.5, 99, 27);
    ctx.font = `20px ${G.MONO}`; ctx.fillStyle = "#b5410f"; ctx.textAlign = "center"; ctx.fillText(STICKY.yes, bx + 50, h - 22); ctx.textAlign = "left";
  }
  ctx.restore();
}
