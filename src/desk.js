// After the ending, the house's window closes and you're left on the desktop it broke out onto. Click a file to
// open it: notes.txt has the torn pages you found, the Bin has every house you ever threw away, and house.js builds
// a new house. Reading only, like clicking a room: nothing here changes the game.
import { clamp } from "./art.js";
import { desktop, ICONS, iconAt, fileIcon, label, SANS } from "./tear.js";

export const BIN_COUNT = 212; // "commit 212: it moved a room tonight." It has been thrown away that many times.
const rnd = (i) => { const v = Math.sin(i * 78.233 + 1.7) * 43758.5453; return v - Math.floor(v); };
const ease = (t) => 1 - Math.pow(1 - t, 3);

export function deskHit(x, y) {
  for (let j = 0; j < ICONS.length; j++) { const r = iconAt(j); if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return ICONS[j][0]; }
  return null;
}

// d = { t, open: null | "notes.txt", bin: null | seconds since it spilled }, pages = [text, ...], words = story text
export function drawDesk(ctx, G, d, pages, words) {
  const { VW, VH } = G;
  desktop(ctx, G, d.open);
  if (d.bin != null) spill(ctx, G, d.bin);
  if (d.open === "notes.txt") notes(ctx, G, pages, words);
  ctx.font = `italic 19px "IM Fell English", Georgia, serif`; ctx.textAlign = "center"; ctx.fillStyle = `rgba(242,242,244,${0.4 + 0.25 * Math.sin(d.t * 3)})`;
  ctx.fillText(words.desk, VW / 2 + 40, VH - 52); ctx.textAlign = "left";
}

// The Bin spills: every copy of the house comes pouring out across the desktop, and the newest is still warm.
function spill(ctx, G, t) {
  const { VW, VH } = G, bin = iconAt(4), bx = bin.x + 10, by = bin.y + 10;
  for (let i = 0; i < BIN_COUNT; i++) {
    const k = ease(clamp((t - i * 0.009) / 0.7, 0, 1)); if (k <= 0) continue;
    const tx = 110 + rnd(i) * (VW - 170), ty = 20 + Math.pow(rnd(i + 400), 0.6) * (VH - 110);
    const x = bx + (tx - bx) * k, y = by + (ty - by) * k - Math.sin(k * Math.PI) * 120;
    ctx.save(); ctx.translate(x, y); ctx.rotate((rnd(i + 900) - 0.5) * 1.2 * k); fileIcon(ctx, -10, -12, "#ffd36a", 0.5); ctx.restore();
  }
  // the last one, on top
  const k = ease(clamp((t - BIN_COUNT * 0.009 - 0.2) / 0.6, 0, 1));
  if (k > 0) {
    const x = bx + (VW / 2 + 40 - bx) * k, y = by + (VH / 2 - 40 - by) * k - Math.sin(k * Math.PI) * 160;
    ctx.save(); ctx.shadowColor = "#ffd36a"; ctx.shadowBlur = 24; fileIcon(ctx, x - 30, y - 36, "#ffd36a", 1.5); ctx.restore();
    ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillRect(x - 64, y + 42, 128, 22); label(ctx, `house (${BIN_COUNT + 1}).js`, x, y + 58);
  }
}

// notes.txt: the torn pages, in the same lettering as in the game
function notes(ctx, G, pages, words) {
  const { VW } = G, w = 560, h = 330, x = VW / 2 + 40 - w / 2, y = 70;
  ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 30; ctx.shadowOffsetY = 10; ctx.fillStyle = "#e8dcc0"; ctx.fillRect(x, y, w, h); ctx.restore();
  ctx.fillStyle = "#2a2b33"; ctx.fillRect(x, y, w, 26); ctx.font = `13px ${SANS}`; ctx.fillStyle = "#d8d8de"; ctx.fillText("notes.txt", x + 10, y + 17); ctx.fillText("×", x + w - 20, y + 18);
  ctx.font = `italic 19px "IM Fell English", Georgia, serif`; ctx.fillStyle = "#2b2119";
  let yy = y + 60;
  if (!pages.length) { ctx.fillText(words.notesEmpty, x + 26, yy); return; }
  for (const p of pages) {
    let line = "";
    for (const wd of p.split(" ")) { const tt = line ? line + " " + wd : wd; if (ctx.measureText(tt).width > w - 52 && line) { ctx.fillText(line, x + 26, yy); yy += 25; line = wd; } else line = tt; }
    if (line) { ctx.fillText(line, x + 26, yy); yy += 25; }
    yy += 16;
  }
}
