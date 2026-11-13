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

const LOOKS = {
  // A. typed on paper: the house's source is a typewritten page clipped beside it; choices are circled in red pencil
  page: {
    name: "Typewritten page",
    mono: '"Special Elite", "Courier New", monospace', title: '"IM Fell English SC", "IM Fell English", serif',
    panel: { INK: "#2a2118", DIM: "rgba(60,46,34,0.55)", YEL: "#a3261b", RED: "#b3261e" },
    panelBg(ctx, x, y, w, h) {
      ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.7)"; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8;
      ctx.beginPath(); ctx.moveTo(x, y); for (let i = 0; i <= 20; i++) ctx.lineTo(x + (w * i) / 20, y + (hash(i) - 0.5) * 3);
      ctx.lineTo(x + w, y + h); for (let i = 20; i >= 0; i--) ctx.lineTo(x + (w * i) / 20, y + h + (hash(i + 40) - 0.5) * 4); ctx.closePath();
      const p = ctx.createLinearGradient(x, y, x + w, y + h); p.addColorStop(0, "#efe4c8"); p.addColorStop(0.6, "#e6d6b2"); p.addColorStop(1, "#d6c196");
      ctx.fillStyle = p; ctx.fill(); ctx.restore();
      ctx.save();
      for (let i = 0; i < 260; i++) { ctx.fillStyle = `rgba(90,60,30,${hash(i + 3) * 0.08})`; ctx.fillRect(x + hash(i) * w, y + hash(i + 9) * h, 1.5, 1.5); }
      const ed = ctx.createRadialGradient(x + w / 2, y + h / 2, h * 0.3, x + w / 2, y + h / 2, h * 0.75); ed.addColorStop(0, "rgba(120,80,30,0)"); ed.addColorStop(1, "rgba(120,80,30,0.22)"); ctx.fillStyle = ed; ctx.fillRect(x, y, w, h);
      // coffee ring
      ctx.strokeStyle = "rgba(120,72,30,0.18)"; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(x + w - 46, y + h - 70, 30, 0.4, 5.6); ctx.stroke();
      // red margin rule
      ctx.fillStyle = "rgba(178,40,30,0.35)"; ctx.fillRect(x + 22, y + 6, 1, h - 12);
      ctx.restore();
      // brass clip
      const cx = x + w / 2; ctx.fillStyle = "#8a6a32"; ctx.fillRect(cx - 30, y - 10, 60, 18); ctx.fillStyle = "#c9a45a"; ctx.fillRect(cx - 30, y - 10, 60, 4); ctx.fillStyle = "#4a3818"; ctx.fillRect(cx - 22, y + 4, 44, 3);
    },
    mark(ctx, r, hot, t) { // red pencil loop around the word
      ctx.save(); ctx.strokeStyle = hot ? "rgba(178,30,24,0.95)" : "rgba(178,30,24,0.55)"; ctx.lineWidth = hot ? 2.2 : 1.6;
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2 + 1; ctx.beginPath(); ctx.ellipse(cx, cy, r.w / 2 - 1, r.h / 2 + 1, -0.04, 0.3, Math.PI * 2 + 0.6); ctx.stroke();
      if (hot) { ctx.fillStyle = "rgba(178,30,24,0.10)"; ctx.beginPath(); ctx.ellipse(cx, cy, r.w / 2 - 1, r.h / 2 + 1, -0.04, 0, 7); ctx.fill(); }
      ctx.restore();
    },
    scan: false,
  },
  // B. a tube terminal: amber phosphor in a walnut cabinet, the choice words lit as inverse blocks
  tube: {
    name: "Amber terminal",
    mono: '"IBM Plex Mono", "Courier New", monospace', title: '"IM Fell English SC", "IM Fell English", serif',
    panel: { INK: "#ffc36b", DIM: "rgba(255,176,80,0.45)", YEL: "#ffe3a8", RED: "#ff6a4a" },
    panelBg(ctx, x, y, w, h) {
      woodFrame(ctx, x + 10, y + 10, w - 20, h - 20, 14, [70, 40, 22]);
      ctx.fillStyle = "#120a04"; ctx.fillRect(x + 10, y + 10, w - 20, h - 20);
      const g = ctx.createRadialGradient(x + w / 2, y + h / 2, 30, x + w / 2, y + h / 2, h * 0.7); g.addColorStop(0, "rgba(255,150,40,0.10)"); g.addColorStop(1, "rgba(0,0,0,0.5)"); ctx.fillStyle = g; ctx.fillRect(x + 10, y + 10, w - 20, h - 20);
      ctx.strokeStyle = "rgba(255,200,120,0.08)"; ctx.lineWidth = 6; ctx.beginPath(); ctx.roundRect(x + 14, y + 14, w - 28, h - 28, 18); ctx.stroke();
      // brass badge
      ctx.fillStyle = "#b8924a"; ctx.fillRect(x + w / 2 - 34, y + h - 3, 68, 9); ctx.fillStyle = "#3a2810"; ctx.font = '7px "IBM Plex Mono", monospace'; ctx.textAlign = "center"; ctx.fillText("HOUSE · MODEL 1", x + w / 2, y + h + 4); ctx.textAlign = "left";
    },
    mark(ctx, r, hot) { ctx.fillStyle = hot ? "rgba(255,200,110,0.95)" : "rgba(255,170,70,0.28)"; ctx.fillRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4); },
    markInk: (hot) => hot ? "#140a02" : null,
    glow: "rgba(255,160,60,0.8)",
    scan: true,
  },
  // C. brass and leather: the code is engraved in a brass plate set into oxblood leather, like a ship's instrument
  brass: {
    name: "Brass plate",
    mono: '"Courier Prime", "Courier New", monospace', title: '"IM Fell English SC", "IM Fell English", serif',
    panel: { INK: "#24170a", DIM: "rgba(52,34,14,0.78)", YEL: "#7a1410", RED: "#8a1a12" },
    panelBg(ctx, x, y, w, h) {
      const lt = ctx.createLinearGradient(x, y, x + w, y + h); lt.addColorStop(0, "#4a1612"); lt.addColorStop(1, "#2a0b09"); ctx.fillStyle = lt; ctx.fillRect(x, y, w, h);
      for (let i = 0; i < 400; i++) { ctx.fillStyle = `rgba(0,0,0,${hash(i) * 0.25})`; ctx.fillRect(x + hash(i + 1) * w, y + hash(i + 2) * h, 2, 1); }
      // stitching
      ctx.setLineDash([5, 4]); ctx.strokeStyle = "rgba(220,190,140,0.45)"; ctx.lineWidth = 1; ctx.strokeRect(x + 7, y + 7, w - 14, h - 14); ctx.setLineDash([]);
      const px = x + 14, py = y + 14, pw = w - 28, ph = h - 28;
      const b = ctx.createLinearGradient(px, py, px + pw * 0.4, py + ph); b.addColorStop(0, "#e9cf8e"); b.addColorStop(0.35, "#c9a253"); b.addColorStop(0.6, "#e2c07a"); b.addColorStop(1, "#9c7834"); ctx.fillStyle = b;
      ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 6); ctx.fill();
      ctx.strokeStyle = "rgba(255,240,200,0.6)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(px + 1, py + 1, pw - 2, ph - 2, 6); ctx.stroke();
      ctx.strokeStyle = "rgba(70,46,14,0.07)"; for (let i = 0; i < 40; i++) { const yy = py + hash(i + 70) * ph; ctx.beginPath(); ctx.moveTo(px + 4, yy); ctx.lineTo(px + pw - 4, yy + (hash(i) - 0.5) * 2); ctx.stroke(); }
      for (const [sx, sy] of [[px + 9, py + 9], [px + pw - 9, py + 9], [px + 9, py + ph - 9], [px + pw - 9, py + ph - 9]]) { ctx.fillStyle = "#7a5a24"; ctx.beginPath(); ctx.arc(sx, sy, 4, 0, 7); ctx.fill(); ctx.strokeStyle = "#3a2810"; ctx.beginPath(); ctx.moveTo(sx - 3, sy); ctx.lineTo(sx + 3, sy); ctx.stroke(); }
    },
    mark(ctx, r, hot) { ctx.fillStyle = hot ? "rgba(122,20,16,0.22)" : "rgba(60,30,10,0.10)"; ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2); ctx.strokeStyle = hot ? "rgba(122,20,16,0.9)" : "rgba(90,50,16,0.5)"; ctx.lineWidth = 1.2; ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2); },
    engrave: true,
    scan: false,
  },
};

export function pickLook() {
  try { const k = new URLSearchParams(location.search).get("look"); return LOOKS[k] || null; } catch { return null; }
}
export { woodFrame, beam };
