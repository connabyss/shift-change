// Look prototypes (?look=page|tube|brass). Each one dresses the same game: the code panel's material and type,
// the doll's-house frame, the moonlit dark rooms, and where the floor/moves line sits.
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

function woodFrame(ctx, x, y, w, h, t = 16, tone = [74, 46, 28]) {
  const [r, g, b] = tone;
  const grad = (x0, y0, x1, y1) => { const q = ctx.createLinearGradient(x0, y0, x1, y1); q.addColorStop(0, `rgb(${r * 1.25 | 0},${g * 1.25 | 0},${b * 1.25 | 0})`); q.addColorStop(0.5, `rgb(${r},${g},${b})`); q.addColorStop(1, `rgb(${r * 0.6 | 0},${g * 0.6 | 0},${b * 0.6 | 0})`); return q; };
  ctx.fillStyle = grad(0, y - t, 0, y); ctx.fillRect(x - t, y - t, w + 2 * t, t);
  ctx.fillStyle = grad(0, y + h, 0, y + h + t); ctx.fillRect(x - t, y + h, w + 2 * t, t);
  ctx.fillStyle = grad(x - t, 0, x, 0); ctx.fillRect(x - t, y, t, h);
  ctx.fillStyle = grad(x + w, 0, x + w + t, 0); ctx.fillRect(x + w, y, t, h);
  // grain + a bead of light along the inner edge
  ctx.strokeStyle = "rgba(0,0,0,0.25)"; ctx.lineWidth = 1;
  for (let i = 0; i < 6; i++) { const k = (i + 0.5) / 6; ctx.beginPath(); ctx.moveTo(x - t, y - t + k * t); ctx.bezierCurveTo(x + w * 0.3, y - t + k * t + 1.5, x + w * 0.7, y - t + k * t - 1.5, x + w + t, y - t + k * t); ctx.stroke(); }
  ctx.strokeStyle = "rgba(255,220,170,0.18)"; ctx.strokeRect(x - 1.5, y - 1.5, w + 3, h + 3);
  ctx.strokeStyle = "rgba(0,0,0,0.6)"; ctx.strokeRect(x - t + 0.5, y - t + 0.5, w + 2 * t - 1, h + 2 * t - 1);
}
function beam(ctx, x, y, w, h) { const q = ctx.createLinearGradient(x, y, x + (w < h ? w : 0), y + (w < h ? 0 : h)); q.addColorStop(0, "#5a3a24"); q.addColorStop(0.5, "#3b2516"); q.addColorStop(1, "#22150c"); ctx.fillStyle = q; ctx.fillRect(x, y, w, h); }

// The paper: an aged typewriter sheet with a deckled edge, specks, a darker rim, a red margin rule and
// (optionally) a coffee ring and a brass clip. Used for the code panel, the title card and the floor cards.
export function paper(ctx, x, y, w, h, o = {}) {
  ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.7)"; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8;
  ctx.beginPath(); ctx.moveTo(x, y); for (let i = 0; i <= 20; i++) ctx.lineTo(x + (w * i) / 20, y + (hash(i + (o.seed || 0)) - 0.5) * 3);
  ctx.lineTo(x + w, y + h); for (let i = 20; i >= 0; i--) ctx.lineTo(x + (w * i) / 20, y + h + (hash(i + 40 + (o.seed || 0)) - 0.5) * 4); ctx.closePath();
  const p = ctx.createLinearGradient(x, y, x + w, y + h); p.addColorStop(0, "#efe4c8"); p.addColorStop(0.6, "#e6d6b2"); p.addColorStop(1, "#d6c196");
  ctx.fillStyle = p; ctx.fill(); ctx.restore();
  for (let i = 0; i < (w * h) / 600; i++) { ctx.fillStyle = `rgba(90,60,30,${hash(i + 3) * 0.08})`; ctx.fillRect(x + hash(i) * w, y + hash(i + 9) * h, 1.5, 1.5); }
  const ed = ctx.createRadialGradient(x + w / 2, y + h / 2, Math.min(w, h) * 0.3, x + w / 2, y + h / 2, Math.max(w, h) * 0.75); ed.addColorStop(0, "rgba(120,80,30,0)"); ed.addColorStop(1, "rgba(120,80,30,0.22)"); ctx.fillStyle = ed; ctx.fillRect(x, y, w, h);
  if (o.ring) { ctx.strokeStyle = "rgba(120,72,30,0.18)"; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(o.ring[0], o.ring[1], 30, 0.4, 5.6); ctx.stroke(); }
  if (o.margin !== false) { ctx.fillStyle = "rgba(178,40,30,0.35)"; ctx.fillRect(x + 22, y + 6, 1, h - 12); }
  if (o.clip !== false) { const cx = x + w / 2; ctx.fillStyle = "#8a6a32"; ctx.fillRect(cx - 30, y - 10, 60, 18); ctx.fillStyle = "#c9a45a"; ctx.fillRect(cx - 30, y - 10, 60, 4); ctx.fillStyle = "#4a3818"; ctx.fillRect(cx - 22, y + 4, 44, 3); }
}
// red pencil loop around a word (r: the word's box)
export function pencil(ctx, r, hot) {
  ctx.save(); ctx.strokeStyle = hot ? "rgba(178,30,24,0.95)" : "rgba(178,30,24,0.55)"; ctx.lineWidth = hot ? 2.2 : 1.6;
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2 + 1; ctx.beginPath(); ctx.ellipse(cx, cy, r.w / 2 - 1, r.h / 2 + 1, -0.04, 0.3, Math.PI * 2 + 0.6); ctx.stroke();
  if (hot) { ctx.fillStyle = "rgba(178,30,24,0.10)"; ctx.beginPath(); ctx.ellipse(cx, cy, r.w / 2 - 1, r.h / 2 + 1, -0.04, 0, 7); ctx.fill(); }
  ctx.restore();
}
// The game's look: the house's source is a typewritten page clipped beside it; choices are circled in red pencil.
export const LOOK = {
  mono: '"Special Elite", "Courier New", monospace', title: '"IM Fell English SC", "IM Fell English", serif',
  // ink on paper (the panel and the cards); GRN is a dark green that still reads on cream
  panel: { INK: "#2a2118", DIM: "rgba(60,46,34,0.6)", YEL: "#a3261b", RED: "#b3261e", GRN: "#2f6b32" },
  panelBg(ctx, x, y, w, h) { paper(ctx, x, y, w, h, { ring: [x + w - 46, y + h - 70] }); },
  mark(ctx, r, hot) { pencil(ctx, r, hot); },
};
export { woodFrame, beam };
