// The house in 3D: a real doll's house at night, built from CC0 scans (Poly Haven models, ambientCG textures; see
// assets/CREDITS.md). It draws only what you see. The game still owns every rule, and tells it what to show each
// frame with render(view). The picture is drawn into the game's canvas where the old flat house used to be, so the
// code page, the pencil marks, the screen break and the ending all work on top of it unchanged.
//
// Units: one room is RW x RH x RD. The camera looks straight at the open front, and its front face lands exactly on
// the game's house box (HX, HY, W*CW, H*CH), so clicks, outlines and arrows still line up with the rooms.
import * as THREE from "three";
import { GLTFLoader } from "../vendor/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "../vendor/addons/libs/meshopt_decoder.module.js";
import { RoundedBoxGeometry } from "../vendor/addons/geometries/RoundedBoxGeometry.js";
import { RGBELoader } from "../vendor/addons/loaders/RGBELoader.js";

let G = null; // layout from the game: { VW, VH, HX, HY, CW, CH, W, H }
let RW, RH, S; // room width/height in metres-ish, and world units per game pixel
const RD = 2.6, T = 0.16, DOOR_Z0 = -0.45, DOOR_Z1 = 0.55, DOOR_H = 1.5, LADDER_X = 0.8;
let PHOTO_ON = false, lampShadows = false;
let renderer, scene, camera, photoCam, root, grid, clip, moon, hemi, key, lantern, porchLight, rt, post;
let ready = false, failed = false, size = [0, 0];
const rooms = new Map(); // room id -> { main, ghost, key }
const M = {}; // shared materials
const models = new Map(); // model name -> gltf scene (cloned per use)
const LAMPS = []; const PARTS = new WeakMap(); // room group -> the parts render() changes (kept out of userData, which clone() copies as JSON)

export const isReady = () => ready;
// quality 0: full; 1: fewer pixels; 2: fewer pixels and no lantern shadows (the game steps down if frames run slow)
let quality = 0;
export function setQuality(q) { quality = q; if (lantern) lantern.castShadow = q < 2; if (key) { key.shadow.mapSize.set(q < 2 ? 2048 : 1024, q < 2 ? 2048 : 1024); if (key.shadow.map) { key.shadow.map.dispose(); key.shadow.map = null; } } if (key) key.shadow.needsUpdate = true; }
export const getQuality = () => quality;
export const hasFailed = () => failed;

// ---------- textures and materials ----------
const TL = new THREE.TextureLoader();
function tex(id, map, rep = [1, 1], srgb = map === "Color") {
  const t = TL.load(`assets/tex/${id}/${map}.jpg`);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function mat(id, rep, tint = 0xffffff, rough = 0.9, noRough = false) {
  const m = new THREE.MeshStandardMaterial({ map: tex(id, "Color", rep), normalMap: tex(id, "NormalGL", rep), color: tint, roughness: rough });
  if (!noRough) m.roughnessMap = tex(id, "Roughness", rep);
  return m;
}
// each room's name asks for its own walls: wallpaper id, tint, repeat
// (soft painted pastels, like the photo still: wallpapers lightly tinted, the side walls a neighbouring pastel)
const PAPER = {
  attic: ["Bricks074", 0xa89080, [2, 2], 0xc8b8a0], nursery: ["Wallpaper001A", 0xf0c8c0, [1.5, 1.5], 0xe0c0c8], study: ["Wallpaper002A", 0xf0c0b4, [1.5, 1.5], 0xe8b0b0],
  chapel: ["ph_painted_plaster_wall", 0xe8b8c0, [1, 1], 0xd8b0c8], parlour: ["Wallpaper002B", 0xf0a8a8, [1.5, 1.5], 0xe0a0b0], library: ["Wallpaper002C", 0xa8a8d8, [1.5, 1.5], 0x9aa0c8],
  gallery: ["Wallpaper001C", 0xf0b8b0, [1.5, 1.5], 0xe0b0b8], bath: ["ph_plastered_wall_02", 0xc0d8d8, [1, 1], 0xb0c8d0], kitchen: ["ph_painted_plaster_wall", 0xe8e0cc, [1, 1], 0xb8c4cc],
  pantry: ["Wallpaper001B", 0xfae8c8, [1.5, 1.5], 0xf0dcc0], cellar: ["Bricks074", 0xc8a898, [2, 2], 0xb89888], hall: ["Wallpaper001A", 0xb8d0e8, [1.5, 1.5], 0xa8c0d8],
};
const NO_WAINSCOT = new Set(["cellar", "attic", "kitchen", "bath"]);
function materials() {
  M.floor = mat("WoodFloor051", [1.5, 1.2], 0xd0bcac, 0.85); M.floor.normalScale.set(1.8, 1.8);
  M.ceil = mat("Plaster001", [1, 1], 0x8a8078);
  M.frame = mat("Wood049", [3, 1], 0xb89a74, 0.7);
  M.trim = mat("PaintedPlaster017", [0.3, 1], 0xc8d0d8, 0.7); // painted door frames, as in the still
  M.slab = mat("Planks021", [2, 1], 0x5a4030, 0.8);
  M.door = mat("Wood049", [1, 2], 0x6a7888, 0.6);
  M.wains = mat("Planks021", [2, 0.5], 0x6a4a36, 0.7);
  M.ladder = mat("Wood049", [0.3, 2], 0xb08a62, 0.7);
  M.hatch = mat("Wood049", [1, 0.3], 0xd8c09a, 0.7);
  M.brick = mat("Bricks074", [6, 0.6], 0x7a6458, 0.95);
  M.porch = mat("Planks037A", [0.5, 1], 0x2a2226, 0.9);
  M.rug = mat("Fabric030", [2, 2], 0x7a2a2a, 1);
  M.siding = new THREE.MeshStandardMaterial({ color: 0x1a1612, roughness: 1 });
  M.tiles = mat("RoofingTiles014A", [0.7, 0.7], 0x5a4a48, 0.85);
  M.ground = mat("WoodFloor041", [6, 3], 0x5a4638, 0.9); M.ground.envMapIntensity = 0.35;
  M.roomWall = mat("Wallpaper002B", [10, 5], 0x3a3438, 0.9);
  M.hole = new THREE.MeshBasicMaterial({ color: 0x020203 });
  M.back = new THREE.MeshStandardMaterial({ color: 0x050507, roughness: 1 });
  M.brass = new THREE.MeshStandardMaterial({ color: 0xc8a050, metalness: 1, roughness: 0.35 });
  M.cord = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
  for (const [name, [id, tint, rep, side]] of Object.entries(PAPER)) { M["wall_" + name] = mat(id, rep, tint, 0.9); M["side_" + name] = /^Bricks/.test(id) ? mat(id, [rep[0] * 0.8, rep[1]], side, 0.9) : mat(name.length % 2 ? "ph_painted_plaster_wall" : "ph_plastered_wall_02", [0.9, 1], new THREE.Color(side).multiplyScalar(1.15).getHex(), 1); } // side walls: photo-scanned painted plaster (Poly Haven), tinted
  for (const k of Object.keys(M)) if (/^(wall|side)_/.test(k)) M[k].normalScale.set(2.2, 2.2); // (old paper over lumpy plaster: the surface catches the light)
  M.shade = new THREE.MeshStandardMaterial({ map: tex("Fabric030", "Color", [2, 1]), normalMap: tex("Fabric030", "NormalGL", [2, 1]), color: 0xe8d8b8, roughness: 0.95, side: THREE.DoubleSide, emissive: 0xffb060, emissiveIntensity: 0 });
  M.shade.emissiveMap = M.shade.map;
  // the cut front edges are raw birch plywood, like a real kit doll's house (two sets: the rooms' posts are clipped
  // at the house's edges when a row slides, the outer frame never is)
  M.plyH = [0, 1, 2, 3].map((i) => ply(false, i)); M.plyV = [0, 1, 2, 3].map((i) => ply(true, i));
  M.plyHo = [0, 1, 2, 3].map((i) => ply(false, i)); M.plyVo = [0, 1, 2, 3].map((i) => ply(true, i));
  M.aoSide = [0, 1, 2, 3, 4, 5].map((i) => grime(101 + i * 7, true));
}

// a plywood edge: seven laminations, grain, knots, nail heads, grubby finger marks (drawn once, no image needed)
function ply(vert, seed = 0) {
  const c = document.createElement("canvas"); c.width = vert ? 64 : 1024; c.height = vert ? 1024 : 64; const x = c.getContext("2d");
  let q = (vert ? 77 : 33) + seed * 101; const rn = () => { q = (q * 16807) % 2147483647; return q / 2147483647; };
  x.fillStyle = ["#b89a74", "#c2a47c", "#ad8f6a", "#bb9c70"][seed % 4]; x.fillRect(0, 0, c.width, c.height); const L = vert ? c.width : c.height, N = vert ? c.height : c.width;
  for (let i = 0; i < 7; i++) { const t = (i + 0.5) / 7 * L + (rn() - 0.5) * 2; x.fillStyle = i % 2 ? "rgba(95,62,32,0.75)" : "rgba(240,215,170,0.45)"; if (vert) x.fillRect(t - 2.5, 0, 5, N); else x.fillRect(0, t - 2.5, N, 5);
    x.fillStyle = "rgba(60,40,20,0.5)"; if (vert) x.fillRect(t + 3, 0, 1.2, N); else x.fillRect(0, t + 3, N, 1.2); }
  for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(${rn() < 0.5 ? "70,45,20" : "235,215,180"},${rn() * 0.12})`; const a = rn() * N, b = rn() * L; if (vert) x.fillRect(b, a, 1 + rn() * 2, 2 + rn() * 30); else x.fillRect(a, b, 2 + rn() * 30, 1 + rn() * 2); }
  for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(30,20,10,${0.05 + rn() * 0.15})`; x.beginPath(); const a = rn() * N, b = rn() * L; x.ellipse(vert ? b : a, vert ? a : b, vert ? 3 + rn() * 8 : 6 + rn() * 20, vert ? 6 + rn() * 20 : 3 + rn() * 8, 0, 0, 7); x.fill(); }
  for (let i = 0; i < 14; i++) { const a = rn() * N; x.strokeStyle = `rgba(80,50,25,${0.25 + rn() * 0.3})`; x.lineWidth = 1.5 + rn() * 2.5; x.beginPath(); if (vert) { x.moveTo(L * rn(), a); x.bezierCurveTo(L * rn(), a + 40, L * rn(), a + 80, L * rn(), a + 140 + rn() * 120); } else { x.moveTo(a, L * rn()); x.bezierCurveTo(a + 40, L * rn(), a + 80, L * rn(), a + 140 + rn() * 120, L * rn()); } x.stroke(); }
  for (let i = 0; i < 3; i++) { const a = rn() * N, b = L * (0.2 + rn() * 0.6), kx = vert ? b : a, ky = vert ? a : b; const kg = x.createRadialGradient(kx, ky, 1, kx, ky, 16 + rn() * 12); kg.addColorStop(0, "rgba(70,40,15,0.75)"); kg.addColorStop(0.5, "rgba(110,70,35,0.35)"); kg.addColorStop(1, "rgba(110,70,35,0)"); x.fillStyle = kg; x.beginPath(); x.ellipse(kx, ky, vert ? 14 : 28, vert ? 28 : 14, 0, 0, 7); x.fill(); }
  for (let i = 0; i < 4; i++) { const a = (i + 0.3 + rn() * 0.4) / 4 * N, b = L * 0.5; x.fillStyle = "rgba(40,30,25,0.9)"; x.beginPath(); x.arc(vert ? b : a, vert ? a : b, 2.2, 0, 7); x.fill(); x.fillStyle = "rgba(150,150,150,0.5)"; x.beginPath(); x.arc((vert ? b : a) - 0.6, (vert ? a : b) - 0.6, 1, 0, 7); x.fill(); }
  for (let i = 0; i < 10; i++) { const a = rn() * N, b = rn() * L; x.fillStyle = `rgba(60,40,25,${0.06 + rn() * 0.08})`; x.beginPath(); x.ellipse(vert ? b : a, vert ? a : b, vert ? 6 + rn() * 10 : 14 + rn() * 20, vert ? 14 + rn() * 20 : 6 + rn() * 10, rn() * 3, 0, 7); x.fill(); }
  for (let i = 0; i < 18; i++) { const a = rn() * N; x.fillStyle = "rgba(235,220,190,0.6)"; const e = rn() < 0.5 ? 0 : L - 3; if (vert) x.fillRect(e, a, 3, 3 + rn() * 10); else x.fillRect(a, e, 3 + rn() * 10, 3); }
  const dg = vert ? x.createLinearGradient(0, 0, 0, N) : x.createLinearGradient(0, 0, N, 0); dg.addColorStop(0, "rgba(40,30,20,0.25)"); dg.addColorStop(0.08, "rgba(40,30,20,0)"); dg.addColorStop(0.92, "rgba(40,30,20,0)"); dg.addColorStop(1, "rgba(40,30,20,0.25)"); x.fillStyle = dg; x.fillRect(0, 0, c.width, c.height);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  const rc = document.createElement("canvas"); rc.width = c.width; rc.height = c.height; const rx = rc.getContext("2d"); rx.fillStyle = "#e6e6e6"; rx.fillRect(0, 0, rc.width, rc.height);
  for (let i = 0; i < 1400; i++) { const v = Math.floor(185 + rn() * 70); rx.fillStyle = `rgb(${v},${v},${v})`; const a = rn() * N, b = rn() * L; if (vert) rx.fillRect(b, a, 0.8 + rn() * 1.5, 4 + rn() * 60); else rx.fillRect(a, b, 4 + rn() * 60, 0.8 + rn() * 1.5); }
  const r = new THREE.CanvasTexture(rc); r.wrapS = r.wrapT = THREE.RepeatWrapping;
  return new THREE.MeshStandardMaterial({ map: t, roughnessMap: r, bumpMap: r, bumpScale: 1.2, roughness: 1.0, color: 0xa89880 });
}
// corner shade plus years of grime on a wall: water stains with dark rims, drips, a dirty band along the skirting,
// finger smudges, scuffs, a pale patch where a picture used to hang. Unlit and see-through, laid just over the wall.
function grime(seed, side) {
  const S2 = 512, c = document.createElement("canvas"); c.width = c.height = S2; const x = c.getContext("2d");
  let q = seed * 7919 % 2147483646 + 1; const rn = () => { q = (q * 16807) % 2147483647; return q / 2147483647; };
  const edges = side ? [[0, 0, 0, 60, 0.4], [0, S2, 0, S2 - 90, 0.55], [0, 0, 200, 0, 0.6]] : [[0, 0, 0, 120, 0.4], [0, S2, 0, S2 - 200, 0.6], [0, 0, 110, 0, 0.5], [S2, 0, S2 - 110, 0, 0.5]];
  for (const [x0, y0, x1, y1, a] of edges) { const g = x.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(0.45, `rgba(0,0,0,${a * 0.3})`); g.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = g; x.fillRect(0, 0, S2, S2); }
  // dirt along the skirting, uneven
  for (let i = 0; i < 60; i++) { const xx = rn() * S2, w = 20 + rn() * 80, hh = 10 + rn() * 40; const g = x.createLinearGradient(0, S2, 0, S2 - hh); g.addColorStop(0, `rgba(40,28,18,${0.15 + rn() * 0.2})`); g.addColorStop(1, "rgba(40,28,18,0)"); x.fillStyle = g; x.fillRect(xx, S2 - hh, w, hh); }
  // water stains: soft brown blotches with a darker tide line
  for (let i = 0; i < 2 + Math.floor(rn() * 3); i++) { const cx = rn() * S2, cy = rn() * S2 * 0.7, r = 18 + rn() * 40;
    x.save(); x.translate(cx, cy); x.scale(1, 0.6 + rn() * 0.8); x.beginPath(); for (let k = 0; k <= 24; k++) { const a = k / 24 * Math.PI * 2, rr = r * (0.7 + rn() * 0.5); x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } x.closePath();
    x.filter = "blur(4px)"; x.fillStyle = `rgba(90,62,30,${0.06 + rn() * 0.08})`; x.fill(); x.filter = "blur(1.5px)"; x.strokeStyle = `rgba(70,45,20,${0.06 + rn() * 0.08})`; x.lineWidth = 1.5 + rn() * 2; x.stroke(); x.filter = "none"; x.restore(); }
  // drips
  for (let i = 0; i < 6 + rn() * 10; i++) { const xx = rn() * S2, y0 = rn() * S2 * 0.6, L = 40 + rn() * 200; const g = x.createLinearGradient(0, y0, 0, y0 + L); g.addColorStop(0, `rgba(50,35,20,${0.12 + rn() * 0.12})`); g.addColorStop(1, "rgba(50,35,20,0)"); x.fillStyle = g; x.fillRect(xx, y0, 1.5 + rn() * 3, L); }
  // smudges and scuffs
  for (let i = 0; i < 18; i++) { const cx = rn() * S2, cy = S2 * (0.45 + rn() * 0.5), r = 6 + rn() * 22; const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, `rgba(30,22,15,${0.08 + rn() * 0.12})`); g.addColorStop(1, "rgba(30,22,15,0)"); x.fillStyle = g; x.fillRect(cx - r, cy - r, r * 2, r * 2); }
  for (let i = 0; i < 25; i++) { x.strokeStyle = `rgba(30,20,10,${0.08 + rn() * 0.15})`; /* (an unlit overlay: pale marks glow in the dark, so dark only) */ x.lineWidth = 0.8 + rn(); x.beginPath(); const xx = rn() * S2, yy = S2 * (0.55 + rn() * 0.45); x.moveTo(xx, yy); x.lineTo(xx + (rn() - 0.5) * 40, yy + (rn() - 0.5) * 8); x.stroke(); }
  // where a picture hung once: a paler rectangle with a dirty outline
  if (!side && rn() < 0.6) { const w = 50 + rn() * 50, hh = 40 + rn() * 50, px = 60 + rn() * (S2 - 180), py = 60 + rn() * 140; x.fillStyle = "rgba(255,245,225,0.07)"; x.fillRect(px, py, w, hh); x.strokeStyle = "rgba(40,30,20,0.14)"; x.lineWidth = 3; x.strokeRect(px, py, w, hh); }
  // the paint itself: uneven coats (big soft blotches lighter and darker), brush streaks, rubbed-thin patches
  for (let i = 0; i < 26; i++) { const cx = rn() * S2, cy = rn() * S2, r = 50 + rn() * 140, g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, `rgba(30,22,14,${0.04 + rn() * 0.1})`); g.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = g; x.fillRect(cx - r, cy - r, 2 * r, 2 * r); }
  for (let i = 0; i < 70; i++) { const xx = rn() * S2, yy = rn() * S2, L = 30 + rn() * 160; x.strokeStyle = `rgba(30,22,14,${0.02 + rn() * 0.035})`; x.lineWidth = 2 + rn() * 6; x.beginPath(); x.moveTo(xx, yy); x.quadraticCurveTo(xx + (rn() - 0.5) * 10, yy + L / 2, xx + (rn() - 0.5) * 14, yy + L); x.stroke(); }
  // fine mottling all over
  for (let i = 0; i < 900; i++) { const cx = rn() * S2, cy = rn() * S2, r = 4 + rn() * 14, g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, `rgba(40,30,20,${rn() * 0.05})`); g.addColorStop(1, "rgba(40,30,20,0)"); x.fillStyle = g; x.fillRect(cx - r, cy - r, 2 * r, 2 * r); } // (soft and dark only: pale specks read as snow)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false });
}
// dust and wear on each floor: grey dust gathered along the skirting and in the corners, a worn path, crumbs, fluff
function dust(seed) {
  const c = document.createElement("canvas"); c.width = 512; c.height = 416; const x = c.getContext("2d");
  let q = seed * 41 + 11; const rn = () => { q = (q * 16807) % 2147483647; return q / 2147483647; };
  let g = x.createLinearGradient(0, 0, 0, 120); g.addColorStop(0, "rgba(190,180,165,0.42)"); g.addColorStop(1, "rgba(190,180,165,0)"); x.fillStyle = g; x.fillRect(0, 0, 512, 120);
  for (const [x0, d] of [[0, 1], [512, -1]]) { g = x.createLinearGradient(x0, 0, x0 + d * 70, 0); g.addColorStop(0, "rgba(190,180,165,0.35)"); g.addColorStop(1, "rgba(190,180,165,0)"); x.fillStyle = g; x.fillRect(Math.min(x0, x0 + d * 70), 0, 70, 416); }
  for (const [x0, d] of [[0, 1], [512, -1]]) { g = x.createLinearGradient(x0, 0, x0 + d * 50, 0); g.addColorStop(0, "rgba(0,0,0,0.35)"); g.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = g; x.fillRect(Math.min(x0, x0 + d * 50), 0, 50, 416); }
  g = x.createLinearGradient(0, 0, 0, 60); g.addColorStop(0, "rgba(0,0,0,0.4)"); g.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = g; x.fillRect(0, 0, 512, 60);
  for (let i = 0; i < 900; i++) { const yy = Math.pow(rn(), 2.2) * 416, xx = rn() * 512; x.fillStyle = `rgba(${200 + rn() * 40},${190 + rn() * 40},${170 + rn() * 40},${0.08 + rn() * 0.25})`; x.fillRect(xx, yy, 0.8 + rn() * 2, 0.8 + rn() * 2); }
  for (let i = 0; i < 10; i++) { x.strokeStyle = `rgba(210,200,185,${0.25 + rn() * 0.3})`; x.lineWidth = 0.6; x.beginPath(); const cx = rn() * 512, cy = rn() * 140; for (let k = 0; k < 8; k++) x.lineTo(cx + (rn() - 0.5) * 14, cy + (rn() - 0.5) * 10); x.stroke(); }
  for (let i = 0; i < 40; i++) { x.strokeStyle = `rgba(${rn() < 0.6 ? "30,20,10" : "230,215,190"},${0.12 + rn() * 0.2})`; x.lineWidth = 0.8 + rn() * 1.5; x.beginPath(); const cx = rn() * 512, cy = 100 + rn() * 316; x.moveTo(cx, cy); x.lineTo(cx + (rn() - 0.5) * 60, cy + (rn() - 0.5) * 12); x.stroke(); }
  for (let i = 0; i < 4; i++) { const cx = rn() * 512, cy = 120 + rn() * 280, r = 12 + rn() * 30; x.save(); x.translate(cx, cy); x.scale(1, 0.5 + rn() * 0.4); x.beginPath(); x.arc(0, 0, r, 0, 7); x.fillStyle = `rgba(60,38,18,${0.1 + rn() * 0.12})`; x.fill(); x.strokeStyle = `rgba(50,30,12,${0.18 + rn() * 0.15})`; x.lineWidth = 1.5; x.stroke(); x.restore(); }
  g = x.createRadialGradient(256, 300, 10, 256, 300, 200); g.addColorStop(0, "rgba(0,0,0,0.10)"); g.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = g; x.fillRect(0, 0, 512, 416);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(RW - T, RD - 0.1), new THREE.MeshStandardMaterial({ map: t, transparent: true, depthWrite: false, roughness: 1 }));
  m.rotation.x = -Math.PI / 2; m.position.set(0, T / 2 + 0.004, 0); m.renderOrder = 2; return m;
}

// ---------- building blocks ----------
// hand-cut wood: no edge dead straight. Every vertex nudged by a smooth noise of where it is (same place, same nudge, so
// faces stay joined), plus the odd chip knocked out of an edge
function roughen(geo, amp = 0.006, chip = 0.012) {
  const p = geo.attributes.position, v = new THREE.Vector3(); geo.computeBoundingBox(); const bb = geo.boundingBox;
  const n = (a, b, c) => Math.sin(a * 7.3 + b * 3.1 + c * 5.7) * 0.5 + Math.sin(a * 17.9 - b * 11.3 + c * 2.9) * 0.3 + Math.sin(a * 41.7 + b * 29.3 - c * 37.1) * 0.2;
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i);
    const onX = Math.min(v.x - bb.min.x, bb.max.x - v.x) < 1e-4, onY = Math.min(v.y - bb.min.y, bb.max.y - v.y) < 1e-4, onZ = Math.min(v.z - bb.min.z, bb.max.z - v.z) < 1e-4;
    const edge = (onX + onY + onZ) >= 2, h = n(v.x * 3, v.y * 3, v.z * 3), k = edge && Math.sin(v.x * 91.7 + v.y * 57.3 + v.z * 33.1) > 0.82 ? chip : 0;
    v.x += (h * amp + (onX ? -Math.sign(v.x - (bb.min.x + bb.max.x) / 2) * k : 0)); v.y += (n(v.y * 3, v.z * 3, v.x * 3) * amp + (onY ? -Math.sign(v.y - (bb.min.y + bb.max.y) / 2) * k : 0)); v.z += (n(v.z * 3, v.x * 3, v.y * 3) * amp + (onZ ? -Math.sign(v.z - (bb.min.z + bb.max.z) / 2) * k : 0));
    p.setXYZ(i, v.x, v.y, v.z); }
  geo.computeVertexNormals(); return geo;
}
function rbox(w, h, d, m, x, y, z, parent) { // a rough-cut box (slabs, posts, the outer frame)
  const g = new THREE.Mesh(roughen(new THREE.BoxGeometry(w, h, d, Math.max(1, Math.round(w * 10)), Math.max(1, Math.round(h * 10)), Math.max(1, Math.round(d * 10)))), m);
  g.position.set(x, y, z); g.castShadow = g.receiveShadow = true; parent.add(g); return g;
}
function box(w, h, d, m, x, y, z, parent, round = false) {
  const g = new THREE.Mesh(round ? new RoundedBoxGeometry(w, h, d, 2, Math.min(0.03, Math.min(w, h, d) * 0.3)) : new THREE.BoxGeometry(w, h, d), m);
  g.position.set(x, y, z); g.castShadow = g.receiveShadow = true; parent.add(g); return g;
}
// a model, scaled to height h, centred on x/z, standing on y (all in the room's own space)
function put(name, parent, { x = 0, y = 0, z = 0, h = 1, ry = 0 } = {}) {
  const src = models.get(name); if (!src) return null;
  // nothing in a real doll's house sits square: every piece a little turned and off its mark (same every load)
  let q = Math.floor(Math.abs(x * 997 + z * 613 + h * 389 + name.length * 31)) % 2147483646 + 1; const rn = () => { q = (q * 16807) % 2147483647; return q / 2147483647 - 0.5; };
  ry += rn() * 0.28; x += rn() * 0.07; z += rn() * 0.06;
  const m = src.clone(true); m.rotation.y = ry; m.updateMatrixWorld(true);
  let bb = new THREE.Box3().setFromObject(m); const k = h / Math.max(1e-6, bb.max.y - bb.min.y); m.scale.setScalar(k); m.updateMatrixWorld(true);
  bb = new THREE.Box3().setFromObject(m);
  m.position.set(x - (bb.min.x + bb.max.x) / 2, y + T / 2 - bb.min.y, z - (bb.min.z + bb.max.z) / 2);
  parent.add(m); return m;
}
// what furnishes each room (positions in the room's own space: x across, z from back -RD/2 to front RD/2)
const FURNISH = {
  attic: [["spinning_wheel_01", { x: -0.55, h: 0.95, z: -0.75, ry: 0.5 }], ["old_bed_frame", { x: 0.2, h: 0.75, z: -0.85 }], ["vintage_suitcase", { x: 0.1, h: 0.22, z: 0.2, ry: 0.3 }], ["vintage_suitcase", { x: 0.15, h: 0.2, y: 0.22, z: 0.2, ry: -0.2 }], ["treasure_chest", { x: -1.1, h: 0.42, z: 0.25, ry: 0.9 }]],
  nursery: [["Rockingchair_01", { x: -0.55, h: 1.0, ry: 0.5 }], ["horse_statue_01", { x: 0.2, h: 0.45, z: -0.6 }], ["carved_wooden_elephant", { x: 0.3, h: 0.22, z: 0.45, ry: -0.7 }], ["painted_wooden_shelves", { x: -1.05, h: 1.2, z: -1.05 }], ["rubber_duck_toy", { x: -1.05, h: 0.1, y: 0.62, z: -1.05 }], ["wicker_basket_01", { x: -0.2, h: 0.28, z: -0.85 }]],
  study: [["ClassicConsole_01", { x: -0.2, h: 0.85 }], ["vintage_oil_lamp", { x: 0.0, h: 0.38, y: 0.86, z: -0.75 }], ["WoodenChair_01", { x: -0.2, h: 0.95, z: -0.05, ry: Math.PI * 0.9 }], ["fancy_picture_frame_01", { x: 0.3, h: 0.7, y: 1.2, z: -1.24 }], ["wooden_bookshelf_worn", { x: -1.05, h: 1.6, z: -1.0 }]],
  chapel: [["brass_candleholders", { x: 0, h: 0.4, z: -0.95 }], ["painted_wooden_bench", { x: -0.6, h: 0.45, z: 0.35, ry: Math.PI }], ["brass_vase_01", { x: -0.6, h: 0.3, z: -1.0 }], ["wooden_candlestick", { x: -1.1, h: 1.2, z: -0.8 }], ["wooden_candlestick", { x: 0.35, h: 1.2, z: -0.8 }]],
  parlour: [["ArmChair_01", { x: -0.9, h: 1.0, ry: 0.4 }], ["gothic_coffee_table", { x: -0.15, h: 0.42, z: 0.2 }], ["tea_set_01", { x: -0.15, h: 0.16, y: 0.42, z: 0.2 }], ["mantel_clock_01", { x: 0.15, h: 0.3, y: 1.08, z: -1.08 }], ["Chandelier_01", { x: -0.3, h: 0.6, y: 0, z: -0.1, hang: true }]],
  library: [["GothicCabinet_01", { x: -0.8, h: 2.0, z: -1.0 }], ["wooden_bookshelf_worn", { x: 0.3, h: 1.9, z: -1.05 }], ["ArmChair_01", { x: 0.3, h: 0.95, ry: -0.6, z: 0.25 }], ["book_encyclopedia_set_01", { x: -0.6, h: 0.2, z: 0.4, ry: 0.4 }]],
  gallery: [["marble_bust_01", { x: -0.6, h: 0.75 }], ["gothic_statue", { x: 0.2, h: 1.0, z: -0.85 }], ["fancy_picture_frame_01", { x: -0.6, h: 0.55, y: 1.45, z: -1.24 }], ["fancy_picture_frame_02", { x: 0.25, h: 0.6, y: 1.6, z: -1.24 }], ["painted_wooden_bench", { x: -0.2, h: 0.45, z: 0.45 }]],
  bath: [["painted_wooden_nightstand", { x: -0.6, h: 0.75, z: -1.0 }], ["wooden_bowl_01", { x: -0.6, h: 0.12, y: 0.75, z: -1.0 }], ["jug_01", { x: -0.35, h: 0.3, y: 0.75, z: -1.0 }], ["ornate_mirror_01", { x: -0.6, h: 0.75, y: 1.15, z: -1.24 }], ["wooden_bucket_01", { x: 0.15, h: 0.45, z: -0.6 }], ["wooden_stool_01", { x: -1.05, h: 0.45, z: 0.1 }], ["rubber_duck_toy", { x: 0.15, h: 0.1, y: 0.45, z: -0.6 }]],
  kitchen: [["scandinavian_masonry_heater", { x: -0.95, h: 1.9, z: -0.9 }], ["WoodenTable_01", { x: 0.0, h: 0.75, z: -0.3 }], ["pot_enamel_01", { x: -0.2, h: 0.18, y: 0.76, z: -0.4 }], ["wooden_bowl_01", { x: 0.25, h: 0.08, y: 0.79, z: -0.4 }], ["WoodenChair_01", { x: -0.1, h: 0.9, z: 0.45, ry: Math.PI }]],
  pantry: [["Shelf_01", { x: -0.5, h: 1.75, z: -1.0 }], ["jug_01", { x: -0.65, h: 0.22, y: 0.83, z: -1.0 }], ["ceramic_vase_01", { x: -0.35, h: 0.2, y: 0.83, z: -1.0 }], ["CheeseBox_01", { x: -0.5, h: 0.12, y: 0.44, z: -1.0 }], ["wicker_basket_01", { x: 0.2, h: 0.3, z: -0.8, ry: 0.4 }], ["food_apple_01", { x: 0.25, h: 0.07, y: 0.3, z: -0.75 }], ["wooden_bucket_01", { x: -1.15, h: 0.35, z: 0.35 }]],
  cellar: [["wine_barrel_01", { x: -0.95, h: 0.85, z: -0.8, ry: 1.57 }], ["wine_barrel_01", { x: -0.1, h: 0.85, z: -0.85, ry: 1.57 }], ["wine_barrel_01", { x: -0.55, h: 0.8, y: 0.86, z: -0.85, ry: 1.57 }], ["wooden_crate_01", { x: 0.35, h: 0.5, z: -0.9 }], ["wine_bottles_01", { x: 0.3, h: 0.3, z: 0.3 }]],
  hall: [["vintage_grandfather_clock_01", { x: 0.15, h: 2.0, z: -1.05 }], ["ornate_mirror_01", { x: -0.6, h: 1.0, y: 0.95, z: -1.24 }], ["ClassicNightstand_01", { x: -0.6, h: 0.7, z: -0.95 }], ["Lantern_01", { x: -0.6, h: 0.3, y: 0.7, z: -0.95 }], ["painted_wooden_bench", { x: -0.9, h: 0.45, z: 0.35, ry: Math.PI / 2 }]],
};
const RUGS = { parlour: [1.9, 1.3, 0x7a2a2a], nursery: [1.4, 1.0, 0x6a7a9a], study: [1.6, 1.1, 0x3a4a3a], library: [1.3, 1.0, 0x5a2a3a], hall: [0.8, 1.6, 0x6a3020] };

// the shell every room keeps (back wall, floor, ceiling, frame, nameplate, lamp) plus its furniture
function buildRoom(room) {
  const g = new THREE.Group(); g.name = "room" + room.id;
  const name = PAPER[room.name] ? room.name : "hall";
  const inner = new THREE.Group(); inner.name = "inner"; g.add(inner); // everything that turns over with the house
  // no two rooms alike, as in a real old doll's house: each its own piece of the paper, hung a little crooked, its own lamp
  let rq = room.id * 48271 % 2147483646 + 7; const rr = () => { rq = (rq * 16807) % 2147483647; return rq / 2147483647; };
  const wm = M["wall_" + name].clone(); if (wm.map) { wm.map = wm.map.clone(); wm.map.offset.set(rr(), rr()); wm.map.needsUpdate = true; } if (wm.normalMap) { wm.normalMap = wm.normalMap.clone(); wm.normalMap.offset.copy(wm.map ? wm.map.offset : new THREE.Vector2()); }
  wm.color.multiplyScalar(0.86 + rr() * 0.24); wm.roughness = Math.min(1, wm.roughness * (0.85 + rr() * 0.3));
  { const bw = box(RW, RH, 0.05, wm, 0, RH / 2, -RD / 2, inner); bw.rotation.y = (rr() - 0.5) * 0.012; bw.rotation.z = (rr() - 0.5) * 0.006; }
  if (!NO_WAINSCOT.has(name)) box(RW, 0.85, 0.06, M.wains, 0, 0.425, -RD / 2 + 0.04, inner);
  box(RW, 0.12, 0.08, M.frame, 0, 0.06 + T / 2, -RD / 2 + 0.07, inner);
  { const ao = new THREE.Mesh(new THREE.PlaneGeometry(RW - T, RH - T), grime(room.id * 17 + 3, false)); ao.position.set(0, RH / 2, -RD / 2 + 0.115); ao.renderOrder = 1; inner.add(ao); }
  inner.add(dust(room.id * 7 + name.length));
  if (RUGS[name]) { const [w, d, tint] = RUGS[name]; const rm = M.rug.clone(); rm.color.setHex(tint); const r = new THREE.Mesh(new THREE.PlaneGeometry(w, d), rm); r.rotation.x = -Math.PI / 2; r.position.set(0, T / 2 + 0.006, 0.05); r.receiveShadow = true; inner.add(r); }
  for (const [n, o] of FURNISH[name] || []) {
    if (o.hang) { const m = put(n, inner, { ...o, y: 0 }); if (m) m.position.y += RH - T - o.h - 0.35; } else put(n, inner, o);
  }
  if (name === "parlour") fireplace(inner);
  // books on the worn bookshelves (board heights measured from the model)
  for (const [n, o] of FURNISH[name] || []) if (n === "wooden_bookshelf_worn") {
    const k = o.h / 2.06; [0.11, 0.39, 0.67, 0.96, 1.28].forEach((by, i) => put("book_encyclopedia_set_01", inner, { x: o.x + ((i % 3) - 1) * 0.1 * k, h: 0.22 * k, y: by * k + 0.005, z: o.z + 0.02, ry: i % 2 ? 0.1 : -0.05 }));
  }
  // the ceiling lamp: a cord and a bulb (on or off with the room's lights)
  // the ceiling lamp: a cord, a fabric shade and a small bulb (on or off with the room's lights)
  const lx = 0.35 + (rr() - 0.5) * 0.5, cl = 0.5 + rr() * 0.32, kind = Math.floor(rr() * 4);
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, cl), M.cord); cord.position.set(lx, RH - T / 2 - cl / 2, 0); inner.add(cord);
  const bulbM = new THREE.MeshStandardMaterial({ color: 0x2a2622, emissive: 0xffc070, emissiveIntensity: 0, roughness: 0.3 });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.04, 16, 12), bulbM); bulb.position.set(lx, RH - T / 2 - cl - 0.03, 0); inner.add(bulb);
  const shadeM = M.shade.clone(); shadeM.color.setHex([0xe8d8b8, 0xc8b88a, 0xd8b0a0, 0xb8c4a8, 0xe0c890][Math.floor(rr() * 5)]);
  // four kinds of shade: a cone, a drum, a fluted bell (turned), a squat coolie; each a little off true
  const sg = kind === 0 ? new THREE.CylinderGeometry(0.07, 0.2, 0.17, 28, 1, true) : kind === 1 ? new THREE.CylinderGeometry(0.13, 0.15, 0.16, 28, 1, true)
    : kind === 2 ? new THREE.LatheGeometry([...Array(9)].map((_, i) => new THREE.Vector2(0.05 + 0.15 * Math.pow(i / 8, 1.6) + 0.008 * Math.sin(i * 2.3), 0.09 - i * 0.022)), 24) : new THREE.CylinderGeometry(0.03, 0.24, 0.1, 28, 1, true);
  const shade = new THREE.Mesh(sg, shadeM); shade.position.set(lx, RH - T / 2 - cl + 0.02, 0); shade.rotation.set((rr() - 0.5) * 0.08, rr() * 6, (rr() - 0.5) * 0.08); shade.scale.setScalar(0.85 + rr() * 0.3); shade.castShadow = true; inner.add(shade);
  // the shade sends its light down: a pool on the floor and the lower walls, the ceiling left in shadow
  const lamp = new THREE.SpotLight([0xffc890, 0xffb878, 0xffd8a8, 0xffa860][Math.floor(rr() * 4)], 0, 4, 1.1 + rr() * 0.3, 0.9, 2); lamp.position.set(lx, RH - T / 2 - cl - 0.06, 0.1); lamp.target.position.set(lx - 0.1 + (rr() - 0.5) * 0.6, 0, 0.1 + (rr() - 0.5) * 0.4); inner.add(lamp, lamp.target);
  lamp.userData.pw = [0.55, 0.8, 1, 1.15, 1.35][Math.floor(rr() * 5)]; LAMPS.push(lamp); lamp.userData.mood = [1.9, 0.35, 0, 1, 0.55, 1.3, 0.12, 0.8, 2.3, 0.45, 1, 0.2][room.id % 12]; lamp.userData.cold = room.id % 12 === 6 || room.id % 12 === 11; lamp.userData.a = lamp.angle; lamp.userData.c = lamp.color.clone(); lamp.userData.pc = new THREE.Color([0xffb070, 0xffd2a0, 0xff9a50, 0xe8e4ff, 0xffc080, 0xfff0d8][room.id % 6]); // (bulbs of different strengths: the light is uneven across the house)
  // floor and ceiling slabs, and the front posts: the room's own, so it carries its frame when it moves
  // (their hidden faces are bare wood: you see them when the house turns over)
  const pk = room.id % 4;
  rbox(RW, T / 2, RD, [M.slab, M.slab, M.floor, M.slab, M.plyH[pk], M.slab], 0, T / 4, 0, g);
  rbox(RW, T / 2, RD, [M.slab, M.slab, M.slab, M.ceil, M.plyH[(pk + 1) % 4], M.slab], 0, RH - T / 4, 0, g);
  for (const sd of [-1, 1]) { const po = rbox(0.14, RH, 0.14, M.plyV[(pk + (sd > 0 ? 2 : 3)) % 4], sd * (RW / 2 - 0.07), RH / 2, RD / 2 + 0.06, g); const k = room.id * 13.7 + sd * 7.1; po.position.z += Math.cos(k * 1.3) * 0.01; po.rotation.z = Math.sin(k * 2.1) * 0.004; }
  g.add(nameplate(room.name));
  // corner shade on the side walls too: darker toward the back corner and along the floor
  for (const sd of [-1, 1]) { const ao = new THREE.Mesh(new THREE.PlaneGeometry(RD - 0.02, RH - T), M.aoSide[(room.id * 2 + (sd > 0 ? 1 : 0)) % 6]); ao.rotation.y = sd < 0 ? Math.PI / 2 : -Math.PI / 2; if (sd > 0) ao.scale.x = -1; ao.position.set(sd * (RW / 2 - T / 2 - 0.006), RH / 2, 0); ao.renderOrder = 1; g.add(ao); }
  const vary = new THREE.Group(); vary.name = "vary"; g.add(vary);
  PARTS.set(g, { inner, vary, bulbM, shadeM, lamp, fire: inner.userData.fire || null, trims: {} }); inner.userData = {};
  return g;
}
function fireplace(parent) {
  const fb = box(1.1, 1.0, 0.5, mat("Bricks074", [2.4, 2.2], 0x9a7a70), 0.6, 0.5 + T / 2, -RD / 2 + 0.25, parent);
  fb.userData.fire = true;
  box(1.3, 0.08, 0.6, M.frame, 0.6, 1.04 + T / 2, -RD / 2 + 0.3, parent);
  const c = document.createElement("canvas"); c.width = 256; c.height = 232; const fx = c.getContext("2d");
  let q = 5; const rn = () => { q = (q * 16807) % 2147483647; return q / 2147483647; };
  let gr = fx.createLinearGradient(0, 0, 0, 232); gr.addColorStop(0, "#0a0605"); gr.addColorStop(0.55, "#1a0c06"); gr.addColorStop(1, "#3a1808"); fx.fillStyle = gr; fx.fillRect(0, 0, 256, 232);
  gr = fx.createRadialGradient(128, 215, 4, 128, 215, 130); gr.addColorStop(0, "rgba(255,170,60,0.95)"); gr.addColorStop(0.35, "rgba(220,90,20,0.55)"); gr.addColorStop(1, "rgba(120,30,5,0)"); fx.fillStyle = gr; fx.fillRect(0, 0, 256, 232);
  for (const [lx, ly, lw, la] of [[70, 196, 120, -0.12], [100, 186, 110, 0.18]]) { fx.save(); fx.translate(lx + lw / 2, ly); fx.rotate(la); fx.fillStyle = "#2a1408"; fx.fillRect(-lw / 2, -9, lw, 18); fx.fillStyle = "rgba(255,120,30,0.6)"; fx.fillRect(-lw / 2, 5, lw, 4); fx.restore(); }
  for (let i = 0; i < 140; i++) { fx.fillStyle = `rgba(255,${120 + rn() * 100},${30 + rn() * 40},${0.3 + rn() * 0.6})`; fx.beginPath(); fx.arc(40 + rn() * 176, 200 + rn() * 30, 0.8 + rn() * 2.4, 0, 7); fx.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const mouth = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.5), new THREE.MeshBasicMaterial({ map: t })); mouth.position.set(0.6, 0.33 + T / 2, -RD / 2 + 0.51); parent.add(mouth);
  const fire = new THREE.PointLight(0xff7a30, 2.5, 2.2, 2); fire.position.set(0.6, 0.45, -RD / 2 + 0.8); parent.add(fire);
  parent.userData.fire = fire;
}
// a brass nameplate on the beam under the room, with stamped letters
const plateGeo = () => new RoundedBoxGeometry(1.1, 0.2, 0.05, 3, 0.018);
function nameplate(name) {
  const c = document.createElement("canvas"); c.width = 512; c.height = 96; const x = c.getContext("2d");
  let q = name.length * 131 + name.charCodeAt(0); const rn = () => { q = (q * 16807) % 2147483647; return q / 2147483647; };
  x.fillStyle = "#9a8452"; x.fillRect(0, 0, 512, 96); x.strokeStyle = "#3a2c18"; x.lineWidth = 6; x.strokeRect(5, 5, 502, 86);
  for (let i = 0; i < 260; i++) { x.fillStyle = `rgba(${rn() < 0.5 ? "40,30,10" : "200,180,120"},${0.05 + rn() * 0.12})`; x.beginPath(); x.arc(rn() * 512, rn() * 96, 1 + rn() * 7, 0, 7); x.fill(); }
  x.font = '64px "IM Fell English SC", Georgia, serif'; x.textAlign = "left"; x.textBaseline = "middle";
  const txt = name.toUpperCase(), ws = [...txt].map((ch) => x.measureText(ch).width + 7); let px = 256 - ws.reduce((a, b) => a + b, 0) / 2;
  [...txt].forEach((ch, i) => { const jy = (rn() - 0.5) * 3, ja = (rn() - 0.5) * 0.05; x.save(); x.translate(px, 52 + jy); x.rotate(ja); x.fillStyle = "rgba(255,240,200,0.25)"; x.fillText(ch, 1, 1.5); x.fillStyle = `rgba(${55 + rn() * 25},${40 + rn() * 15},18,${0.55 + rn() * 0.25})`; x.fillText(ch, 0, 0); x.restore(); px += ws[i]; });
  // stamped by hand and polished by thumbs for years: letters worn through in places, tarnish in the corners, scratches
  x.globalCompositeOperation = "source-atop"; for (let i = 0; i < 70; i++) { x.fillStyle = `rgba(154,132,82,${0.3 + rn() * 0.5})`; x.beginPath(); x.arc(rn() * 512, 30 + rn() * 40, 2 + rn() * 9, 0, 7); x.fill(); } x.globalCompositeOperation = "source-over";
  for (const [cx, cy] of [[0, 0], [512, 0], [0, 96], [512, 96]]) { const tg = x.createRadialGradient(cx, cy, 0, cx, cy, 90); tg.addColorStop(0, "rgba(40,45,25,0.55)"); tg.addColorStop(1, "rgba(40,45,25,0)"); x.fillStyle = tg; x.fillRect(0, 0, 512, 96); }
  for (let i = 0; i < 30; i++) { x.strokeStyle = `rgba(${rn() < 0.5 ? "40,30,10" : "230,210,160"},${0.15 + rn() * 0.25})`; x.lineWidth = 0.8; x.beginPath(); const xx = rn() * 512, yy = rn() * 96; x.moveTo(xx, yy); x.lineTo(xx + (rn() - 0.5) * 80, yy + (rn() - 0.5) * 10); x.stroke(); }
  const gr = x.createRadialGradient(256, 48, 60, 256, 48, 300); gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(1, "rgba(30,20,5,0.55)"); x.fillStyle = gr; x.fillRect(0, 0, 512, 96);
  for (const sx of [22, 490]) { x.fillStyle = "#2a1e10"; x.beginPath(); x.arc(sx, 48, 9, 0, 7); x.fill(); x.fillStyle = "#b8a070"; x.beginPath(); x.arc(sx - 1.5, 46.5, 6, 0, 7); x.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const p = new THREE.Mesh(plateGeo(), new THREE.MeshStandardMaterial({ map: t, color: 0xc8b890, metalness: 0.45, roughness: 0.5, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.03 }));
  p.material.envMapIntensity = 2; p.position.set(0, 0.17, RD / 2 + 0.02); p.rotation.z = ((name.length * 5) % 7 - 3) * 0.012; p.castShadow = true;
  { const h = [...name].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 9973, 7); p.scale.set(0.72 + (h % 5) * 0.08, 0.9 + (h % 3) * 0.08, 1); p.position.x = ((h >> 3) % 9 - 4) * 0.09; p.material.color.setHex([0xc8b890, 0xb8a070, 0xa8a090, 0xd0c0a0][h % 4]); p.material.roughness = 0.4 + (h % 7) * 0.06; } // (not a matched set: each plate bought and fixed on at a different time)
  return p;
}
// the parts that change with the code: side walls (open doorway, shut door or plain wall), the ladder up and its
// hatch, the hole down, the padlock, the torn page. Rebuilt only when one of them changes.
function varyKey(room, v) {
  const door = (s) => room.lines.some((l) => l.kind === "door" && (l.side === "west") === (s === "l"));
  return [room.l, room.r, door("l"), door("r"), room.up, room.down, v.upJoined ? 1 : 0, v.downJoined ? 1 : 0, v.lock ? 1 : 0, v.unlocked ? 1 : 0, v.page ? 1 : 0].join();
}
function buildVary(g, room, v) {
  const P = PARTS.get(g), vary = P.vary; for (const c of [...vary.children]) { vary.remove(c); c.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
  const name = PAPER[room.name] ? room.name : "hall", pm = M["side_" + name];
  const door = (s) => room.lines.some((l) => l.kind === "door" && (l.side === "west") === (s === "l"));
  P.trims = {};
  for (const s of ["l", "r"]) {
    const sd = s === "l" ? -1 : 1, x = sd * (RW / 2 - T / 4);
    if (!room[s] && !door(s)) { box(T / 2, RH, RD, pm, x, RH / 2, 0, vary); continue; }
    box(T / 2, RH, DOOR_Z0 + RD / 2, pm, x, RH / 2, (-RD / 2 + DOOR_Z0) / 2, vary);
    box(T / 2, RH, RD / 2 - DOOR_Z1, pm, x, RH / 2, (DOOR_Z1 + RD / 2) / 2, vary);
    box(T / 2, RH - DOOR_H - T / 2, DOOR_Z1 - DOOR_Z0, pm, x, DOOR_H + T / 2 + (RH - DOOR_H - T / 2) / 2, (DOOR_Z0 + DOOR_Z1) / 2, vary);
    const tm = M.trim.clone(); tm.emissive = new THREE.Color(0); P.trims[s] = tm; // lights up when you point at this door's word
    const tx = x - sd * 0.045, zm = (DOOR_Z0 + DOOR_Z1) / 2, dw = DOOR_Z1 - DOOR_Z0;
    box(0.04, DOOR_H, 0.07, tm, tx, T / 2 + DOOR_H / 2, DOOR_Z0 - 0.035, vary); box(0.04, DOOR_H, 0.07, tm, tx, T / 2 + DOOR_H / 2, DOOR_Z1 + 0.035, vary);
    box(0.04, 0.07, dw + 0.14, tm, tx, T / 2 + DOOR_H + 0.035, zm, vary);
    if (!room[s]) { // shut: a panelled door with a brass knob each side
      box(0.05, DOOR_H - 0.02, dw - 0.02, M.door, x, T / 2 + DOOR_H / 2, zm, vary);
      for (const k of [-1, 1]) { const kn = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), M.brass); kn.position.set(x + k * 0.05, T / 2 + 0.75, DOOR_Z1 - 0.12); vary.add(kn); }
    }
  }
  if (room.up) { // a ladder to a hatch in the ceiling
    const lz = -0.25, top = RH - T / 2;
    for (const k of [-1, 1]) box(0.07, top, 0.06, M.ladder, LADDER_X + k * 0.22, T / 2 + top / 2, lz, vary);
    for (let h = 0.3; h < top; h += 0.3) { const rg = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.44, 10), M.ladder); rg.rotation.z = Math.PI / 2; rg.position.set(LADDER_X, T / 2 + h, lz); rg.castShadow = true; vary.add(rg); }
    box(0.62, T / 2 + 0.01, 0.6, M.hole, LADDER_X, RH - T / 4, lz, vary);
    if (!v.upJoined) boards(vary, RH - T / 2 - 0.03);
  }
  if (room.down) { // a hatch in the floor: dark hole, a pale wooden frame round it, and the top of the ladder poking up
    box(0.62, T / 2 + 0.01, 0.6, M.hole, LADDER_X, T / 4, -0.25, vary);
    for (const [w, d, x, z] of [[0.76, 0.07, 0, -0.335], [0.76, 0.07, 0, 0.335], [0.07, 0.6, -0.345, 0], [0.07, 0.6, 0.345, 0]]) box(w, 0.035, d, M.hatch, LADDER_X + x, T / 2 + 0.017, -0.25 + z, vary);
    if (v.downJoined) {
      for (const k of [-1, 1]) box(0.07, 0.75, 0.06, M.ladder, LADDER_X + k * 0.22, T / 2 + 0.375 - 0.2, -0.25, vary);
      for (const hh of [0.12, 0.42]) { const rg = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.44, 10), M.ladder); rg.rotation.z = Math.PI / 2; rg.position.set(LADDER_X, T / 2 + hh, -0.25); rg.castShadow = true; vary.add(rg); }
    } else boards(vary, T / 2 + 0.02);
  }
  if (v.lock) vary.add(padlock(v.unlocked));
  if (v.page) vary.add(tornPage());
}
// where a hatch meets nothing on the other side, it's boarded over
function boards(parent, y) { for (const dz of [-0.2, 0, 0.2]) { const b = box(0.74, 0.04, 0.17, M.ladder, LADDER_X, y, -0.25 + dz, parent); b.rotation.y = dz * 0.15; } }
// a brass padlock hung on the back wall; its enamel badge is red while locked, green once open
function padlock(open) {
  const g = new THREE.Group();
  const body = box(0.24, 0.2, 0.08, M.brass, 0, 0, 0, g, true);
  const badge = new THREE.Mesh(new THREE.CircleGeometry(0.055, 20), new THREE.MeshStandardMaterial({ color: open ? 0x2f8a3a : 0xb3261e, emissive: open ? 0x2f8a3a : 0xb3261e, emissiveIntensity: 0.6, roughness: 0.3 }));
  badge.position.set(0, 0, 0.041); g.add(badge);
  const sh = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.018, 8, 20, Math.PI), M.brass); sh.position.set(open ? -0.03 : 0, 0.1 + (open ? 0.06 : 0), 0); sh.rotation.y = open ? 0.6 : 0; g.add(sh);
  g.position.set(0.5, 1.15, -RD / 2 + 0.1); g.scale.setScalar(1.6); // low enough to see from above body.castShadow = true;
  return g;
}
function tornPage() {
  const c = document.createElement("canvas"); c.width = 128; c.height = 96; const x = c.getContext("2d");
  x.fillStyle = "#e8dcc0"; x.beginPath(); x.moveTo(4, 10); x.lineTo(118, 4); x.lineTo(124, 70); x.lineTo(96, 80); x.lineTo(84, 92); x.lineTo(8, 88); x.closePath(); x.fill();
  x.strokeStyle = "rgba(60,50,40,0.6)"; x.lineWidth = 2; for (let yy = 26; yy < 80; yy += 12) { x.beginPath(); x.moveTo(18, yy); x.lineTo(100 - (yy % 24), yy); x.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.27), new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.5, roughness: 0.9, emissive: 0xfff0c8, emissiveMap: t, emissiveIntensity: 0.25 }));
  m.rotation.set(-Math.PI / 2, 0, -0.3); m.position.set(-0.55, T / 2 + 0.008, 0.5); m.receiveShadow = true; m.userData.page = true;
  return m;
}

// ---------- the two figures ----------
// a soft dark patch on the floor under a figure, so it stands on the boards instead of floating
function contact(r, a) {
  const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d"); const gr = x.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, "rgba(0,0,0,1)"); gr.addColorStop(0.45, "rgba(0,0,0,0.6)"); gr.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, opacity: a, depthWrite: false, toneMapped: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.006; m.renderOrder = 3; m.userData.op = a; return m;
}
function pegDoll() {
  const g = new THREE.Group(); g.add(contact(0.32, 0.75));
  const prof = [[0, 0], [0.17, 0], [0.19, 0.05], [0.16, 0.45], [0.11, 0.6], [0.09, 0.66], [0.105, 0.7], [0, 0.7]].map(([a, b]) => new THREE.Vector2(a, b));
  // painted wood, like a real peg doll: blue paint over the grain, worn at the edges
  let bodyM = new THREE.MeshStandardMaterial({ map: tex("Fabric030", "Color", [2, 2]), color: 0x6e8c96, roughness: 0.9 });
  if (WOODIMG) { const c = document.createElement("canvas"); c.width = c.height = 512; const px = c.getContext("2d"); px.drawImage(WOODIMG, 0, 0, 512, 512); px.fillStyle = "rgba(78,110,124,0.78)"; px.fillRect(0, 0, 512, 440);
    let q = 13; const rn = () => { q = (q * 16807) % 2147483647; return q / 2147483647; };
    for (let i = 0; i < 500; i++) { px.fillStyle = `rgba(${70 + rn() * 20},${100 + rn() * 25},${115 + rn() * 25},${0.35 + rn() * 0.4})`; px.fillRect(rn() * 512, rn() * 440, 10 + rn() * 40, 2 + rn() * 4); }
    px.fillStyle = "rgba(225,215,195,0.85)"; for (let i = 0; i < 60; i++) px.fillRect(rn() * 512, 400 + rn() * 14, 8 + rn() * 20, 3);
    for (let i = 0; i < 25; i++) { px.fillStyle = "rgba(190,150,110,0.6)"; px.fillRect(rn() * 512, rn() * 440, 2 + rn() * 6, 2 + rn() * 5); }
    const tt = new THREE.CanvasTexture(c); tt.colorSpace = THREE.SRGBColorSpace; bodyM = new THREE.MeshStandardMaterial({ map: tt, roughness: 0.55 }); }
  const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 32), bodyM);
  body.castShadow = true; g.add(body);
  const c = document.createElement("canvas"); c.width = 512; c.height = 256; const x = c.getContext("2d");
  x.fillStyle = "#c09a74"; x.fillRect(0, 0, 512, 256);
  x.fillStyle = "#3a2216"; x.beginPath(); x.moveTo(0, 0); x.lineTo(512, 0); for (let u = 512; u >= 0; u -= 4) { const f = Math.cos((u / 512 - 0.25) * 2 * Math.PI); x.lineTo(u, 115 - 35 * Math.max(0, f) + 4 * Math.sin(u / 11) + (f < 0 ? 45 : 0)); } x.closePath(); x.fill();
  x.fillStyle = "#1a0e08"; for (const s of [-1, 1]) { x.beginPath(); x.ellipse(128 + s * 26, 150, 8, 10, 0, 0, 7); x.fill(); }
  x.fillStyle = "rgba(190,70,60,0.35)"; for (const s of [-1, 1]) { x.beginPath(); x.ellipse(128 + s * 40, 178, 14, 9, 0, 0, 7); x.fill(); }
  x.fillStyle = "#7a2a22"; x.beginPath(); x.ellipse(128, 186, 9, 5, 0, 0, 7); x.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 32, 20), new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 }));
  head.position.y = 0.8; head.castShadow = true; g.add(head);
  // the little lantern you carry
  const lan = new THREE.Group(); lan.position.set(0.2, 0.38, 0.05);
  box(0.07, 0.1, 0.07, new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.6, metalness: 0.4 }), 0, 0, 0, lan);
  const glow = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.075), new THREE.MeshStandardMaterial({ color: 0xffd080, emissive: 0xffb050, emissiveIntensity: 2 })); lan.add(glow);
  g.add(lan); g.userData.lan = lan;
  g.scale.setScalar(1.1);
  return g;
}
function hooded() {
  const g = new THREE.Group(), prof = []; const blob = contact(0.42, 0.8); g.add(blob);
  for (let i = 0; i <= 24; i++) { const t = i / 24, h = t * 1.6; const r = t < 0.08 ? 0.2 + 0.25 * t : t < 0.7 ? 0.22 - 0.07 * (t - 0.08) / 0.62 : t < 0.86 ? 0.15 - 0.02 * (t - 0.7) / 0.16 : Math.max(0.001, 0.13 * Math.cos((t - 0.86) / 0.14 * Math.PI / 2)); prof.push(new THREE.Vector2(r, h)); }
  const geo = new THREE.LatheGeometry(prof, 40), pa = geo.attributes.position;
  for (let i = 0; i < pa.count; i++) { const vx = pa.getX(i), vy = pa.getY(i), vz = pa.getZ(i), ang = Math.atan2(vz, vx); if (vy < 0.35) { const k = (0.35 - vy) / 0.35, w = 1 + k * (0.35 * Math.sin(ang * 5 + 1) + 0.2 * Math.sin(ang * 11)); pa.setXYZ(i, vx * w, vy + k * 0.06 * Math.sin(ang * 7), vz * w); } }
  geo.computeVertexNormals();
  const coreM = new THREE.MeshStandardMaterial({ map: tex("Fabric030", "Color", [3, 3]), color: 0x0a0a0c, roughness: 1, transparent: true });
  const core = new THREE.Mesh(geo, coreM); core.castShadow = true; g.add(core);
  const smokes = [];
  for (const [sc, op] of [[1.08, 0.4], [1.2, 0.18], [1.36, 0.07]]) { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: op, depthWrite: false })); m.scale.set(sc, 1 + (sc - 1) * 0.4, sc); m.position.y = -(sc - 1) * 0.1; m.userData.op = op; g.add(m); smokes.push(m); }
  const eyeM = new THREE.MeshBasicMaterial({ color: 0xff3a22, transparent: true });
  const eyes = [-1, 1].map((sd) => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 8), eyeM); e.position.set(sd * 0.045, 1.42, 0.12); g.add(e); return e; });
  g.userData = { coreM, smokes, eyes, eyeM, blob };
  return g;
}

// ---------- the scene around the house ----------
function surroundings() {
  const HWd = RW * G.W, HHd = RH * G.H;
  // brick plinth, and the case behind the rooms (what you see where a room has slid away)
  box(HWd + 0.6, 0.68, RD + 0.3, M.brick, 0, -0.34, 0, scene);
  box(HWd + 0.3, HHd, 0.1, M.back, 0, HHd / 2, -RD / 2 - 0.12, scene);
  // the outer frame of the house front, and a beam along each floor (rooms slide behind them)
  const fz = RD / 2 + 0.07;
  for (let y = 0; y <= G.H; y++) { const b = rbox(HWd + 0.36, y === 0 || y === G.H ? 0.26 : 0.14, 0.14, M.plyHo[y % 4], 0, y * RH, fz, scene); b.material = M.plyHo[y % 4].clone(); b.material.map = b.material.map.clone(); b.material.map.repeat.set(4, 1); }
  for (const sd of [-1, 1]) rbox(0.22, HHd + 0.26, 0.16, M.plyVo[sd > 0 ? 1 : 2], sd * (HWd / 2 + 0.09), HHd / 2, fz, scene);
  // the house's outer side walls, plain painted boards (seen from the photo camera at the side)
  { const sm = mat("Planks037A", [1, 4], 0x14110e, 1, true); sm.envMapIntensity = 0.3; sm.normalScale.set(0.4, 0.4); /* (the side away from the desk lamp stays dark, as in a real photo) */ for (const sd of [-1, 1]) { const w = box(0.1, HHd + 0.13, RD + 0.1, sm, sd * (HWd / 2 + 0.16), HHd / 2, 0, scene); w.castShadow = w.receiveShadow = true; } }
  // gable roof: real overlapping clapboards on the front (geometry, not a texture), a little window, wooden barge boards
  const gh = 1.35, half = HWd / 2 + 0.45, base = HHd + 0.13, s = new THREE.Shape(); s.moveTo(-half, 0); s.lineTo(0, gh); s.lineTo(half, 0); s.lineTo(-half, 0);
  const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: RD + 0.5, bevelEnabled: false }), [M.siding, M.tiles]);
  roof.position.set(0, base, -RD / 2 - 0.25); roof.castShadow = roof.receiveShadow = true; scene.add(roof);
  { const zf = RD / 2 + 0.25, rowH = 0.2, winY = 0.45; let q = 57; const rn = () => { q = (q * 16807) % 2147483647; return q / 2147483647; };
    const bm = [0xa89478, 0x8a8070, 0xb4a084, 0x7e7468, 0xa08a6c, 0x968c80, 0x6e6458].map((c) => mat("Planks037A", [0.6, 0.12], c, 0.95));
    for (let h = 0.02; h < gh - 0.1; h += rowH) {
      const w = 2 * half * (1 - (h + rowH * 0.5) / gh) - 0.1; if (w < 0.2) break;
      const yy = base + h + rowH / 2, segs = Math.abs(h + rowH / 2 - winY) < 0.3 ? [[-w / 2, -0.32], [0.32, w / 2]] : [[-w / 2, w / 2]];
      for (const [a, b] of segs) { let x0 = a; while (x0 < b - 0.05) { const L = Math.min(b - x0, 0.9 + rn() * 1.8);
        const m = new THREE.Mesh(new THREE.BoxGeometry(L - 0.02 - rn() * 0.05, rowH + 0.05, 0.03 + rn() * 0.015), bm[Math.floor(rn() * bm.length)]);
        m.position.set(x0 + L / 2, yy + (rn() - 0.5) * 0.006, zf + 0.012 + rn() * 0.004); m.rotation.x = -0.17; m.rotation.z = (rn() - 0.5) * 0.006; m.castShadow = m.receiveShadow = true; scene.add(m); x0 += L; } }
    }
    const wy0 = base + winY, wm = mat("Wood049", [1, 1], 0x6a4c34, 0.7);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.42), new THREE.MeshStandardMaterial({ color: 0x0c0e12, roughness: 0.08, metalness: 0.2 })); glass.position.set(0, wy0, zf + 0.01); scene.add(glass);
    for (const [w, h, x, y] of [[0.62, 0.06, 0, 0.24], [0.62, 0.06, 0, -0.24], [0.06, 0.54, -0.28, 0], [0.06, 0.54, 0.28, 0], [0.03, 0.44, 0, 0], [0.5, 0.03, 0, 0]]) box(w, h, 0.05, wm, x, wy0 + y, zf + 0.04, scene);
    const len = Math.hypot(half, gh) + 0.25, ang = Math.atan2(gh, half), tm = mat("Wood049", [3, 0.3], 0x6a4c34, 0.8);
    for (const sd of [-1, 1]) { const tb = new THREE.Mesh(new RoundedBoxGeometry(len, 0.2, 0.07, 2, 0.015), tm); tb.position.set(sd * half / 2, base + gh / 2 - 0.03, zf + 0.06); tb.rotation.z = -sd * ang; tb.castShadow = true; scene.add(tb); } }
  { const cx = HWd * 0.22, ch = box(0.45, 1.0, 0.45, mat("Bricks074", [0.6, 1.4], 0xa07868), cx, HHd + 1.2, -0.3, scene);
    box(0.58, 0.08, 0.58, mat("PaintedPlaster017", [0.5, 0.5], 0x6a6460, 0.95), cx, HHd + 1.74, -0.3, scene); ch.castShadow = true; }
  // the front door, beside the house on the ground floor: a lean-to porch with its own wall, a lamp over the door
  const dx = (27 - (G.HX + G.W * G.CW / 2)) * S - 0.1, dz = RD / 2 + 0.2;
  box(1.1, 1.95, RD + 0.2, M.porch, dx - 0.05, 0.975, 0, scene);
  box(1.3, 0.07, RD + 0.6, mat("Planks037A", [0.3, 0.3], 0x5a4248, 0.8), dx - 0.05, 1.98, 0.2, scene);
  const fr = M.trim.clone(); fr.color.setHex(0x5a5650); box(0.8, 0.1, 0.1, fr, dx, 1.5, dz + 0.02, scene); for (const k of [-1, 1]) box(0.08, 1.48, 0.1, fr, dx + k * 0.36, 0.74, dz + 0.02, scene);
  const dg = new THREE.Group(); dg.position.set(dx - 0.32, 0, dz); scene.add(dg);
  box(0.64, 1.45, 0.06, mat("Wood049", [1, 2], 0x5a1418, 0.45), 0.32, 0.725, 0, dg);
  for (const [a, b] of [[0.18, 0.42], [0.46, 0.42], [0.18, 1.05], [0.46, 1.05]]) box(0.2, 0.45, 0.02, mat("Wood049", [1, 1], 0x4a1014, 0.45), a, b, 0.035, dg);
  const kn = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), M.brass.clone()); kn.position.set(0.55, 0.7, 0.05); dg.add(kn);
  const doorGlow = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 1.45), new THREE.MeshBasicMaterial({ color: 0xcfe0ff, transparent: true, opacity: 0 })); doorGlow.position.set(dx, 0.725, dz - 0.04); scene.add(doorGlow);
  const lampM = new THREE.MeshStandardMaterial({ color: 0x302820, emissive: 0xffb060, emissiveIntensity: 1.2, roughness: 0.5 });
  box(0.1, 0.14, 0.1, lampM, dx, 1.66, dz + 0.08, scene);
  porchLight = new THREE.PointLight(0xffb070, 1, 2.2, 2); porchLight.position.set(dx, 1.55, dz + 0.35); scene.add(porchLight);
  scene.userData.door = { dg, doorGlow };
  // the house stands on old floorboards in a dark room, not in a field
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 30), M.ground); ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.68, 0); ground.receiveShadow = true; scene.add(ground);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(60, 30), M.roomWall); wall.position.set(0, 8, -7); wall.receiveShadow = true; scene.add(wall);
}

// things left on the table and the room behind, seen only in the photo shots: a bowl of apples, a book pile, an oil
// lamp, a picture on the wall, a curtained window with the night outside
function props() {
  const g = new THREE.Group(); g.visible = false; scene.add(g); scene.userData.props = g;
  const on = (n, h, x, z, ry = 0) => { const m = put(n, g, { x, z, h, ry }); if (m) m.position.y += -0.68 - T / 2; return m; };
  on("wooden_bowl_01", 0.55, -8.6, 3.2, 0.5); on("food_apple_01", 0.36, -9.5, 2.6, 1.1); on("food_apple_01", 0.34, -7.7, 3.9, 2.3); on("food_apple_01", 0.33, -8.5, 3.1, 0.4);
  on("book_encyclopedia_set_01", 0.5, 8.6, 2.6, -0.4); on("vintage_oil_lamp", 2.6, 10.2, 0.4, -0.6); on("brass_candleholders", 0.9, -10.4, 0.8, 0.3); on("wooden_candlestick", 1.6, 9.2, 4.2, 0.2);
  on("wooden_candlestick", 1.9, 6.2, 7.6, 0.7); on("book_encyclopedia_set_01", 0.55, 4.6, 8.4, 0.9); on("food_apple_01", 0.34, 5.6, 9.3, 0.2); on("vintage_oil_lamp", 3.2, 8.4, 9.6, 0.4); // (out of focus in front, like a real tabletop shot)
  const fr = models.get("fancy_picture_frame_02"); if (fr) { const m = put("fancy_picture_frame_02", g, { x: -11.5, z: -6.8, h: 3.2 }); if (m) m.position.y += 7.5; }
  const wx0 = 12.5, wy0 = 9.4, wz = -6.95, nc = document.createElement("canvas"); nc.width = 256; nc.height = 320; const nx = nc.getContext("2d");
  let ng = nx.createLinearGradient(0, 0, 0, 320); ng.addColorStop(0, "#1c2c4c"); ng.addColorStop(0.7, "#0c1424"); ng.addColorStop(1, "#05080e"); nx.fillStyle = ng; nx.fillRect(0, 0, 256, 320);
  nx.fillStyle = "#04060a"; nx.beginPath(); nx.moveTo(0, 320); for (let u = 0; u <= 256; u += 8) nx.lineTo(u, 250 + 18 * Math.sin(u * 0.07) + 10 * Math.sin(u * 0.23)); nx.lineTo(256, 320); nx.fill();
  const nt = new THREE.CanvasTexture(nc); nt.colorSpace = THREE.SRGBColorSpace;
  const night = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 5.4), new THREE.MeshStandardMaterial({ color: 0, emissive: 0xffffff, emissiveMap: nt, emissiveIntensity: 0.35, roughness: 0.05 })); night.position.set(wx0, wy0, wz); g.add(night); scene.userData.night = night;
  const wm = mat("Wood049", [1, 1], 0x5a4030, 0.6); for (const [w, h, x, y] of [[4.6, 0.3, 0, 2.85], [4.6, 0.4, 0, -2.85], [0.3, 6, -2.25, 0], [0.3, 6, 2.25, 0], [0.1, 5.4, 0, 0], [4.2, 0.1, 0, 0.9], [4.2, 0.1, 0, -0.9]]) box(w, h, 0.25, wm, wx0 + x, wy0 + y, wz + 0.1, g);
  const cur = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 7.4, 24, 1), new THREE.MeshStandardMaterial({ map: tex("Fabric030", "Color", [2, 4]), normalMap: tex("Fabric030", "NormalGL", [2, 4]), color: 0x6a3a34, roughness: 0.95, side: THREE.DoubleSide }));
  const cp = cur.geometry.attributes.position; for (let i = 0; i < cp.count; i++) cp.setZ(i, 0.18 * Math.sin(cp.getX(i) * 9)); cur.geometry.computeVertexNormals(); cur.position.set(wx0 - 2.6, wy0 - 0.3, wz + 0.35); g.add(cur);
}

// ---------- set-up ----------
export async function init(layout) {
  G = layout; RW = 3.2; S = RW / G.CW; RH = G.CH * S;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  } catch (e) { failed = true; return false; }
  // a software renderer (no graphics card) would take seconds a frame: the flat house is the better game there
  const force = /[?&]3d=1/.test(location.search);
  try { const gl = renderer.getContext(), ext = gl.getExtension("WEBGL_debug_renderer_info"); const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "";
    if (!force && /swiftshader|llvmpipe|software|basic render/i.test(name)) { failed = true; renderer.dispose(); return false; } } catch { /* fine */ }
  renderer.setPixelRatio(1); renderer.outputColorSpace = THREE.SRGBColorSpace;
  // film response like a camera (AgX); the picture goes through one more pass (focus, grain, vignette), see post()
  renderer.toneMapping = THREE.AgXToneMapping; renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; // (with a blur radius: soft edges, like the still's big desk-lamp shadows)
  renderer.localClippingEnabled = true; renderer.setClearColor(0x050506, 1);
  scene = new THREE.Scene(); scene.background = new THREE.Color(0x050506);
  // image-based light from a real photographed room (a Poly Haven HDRI, shrunk), as in the photo still
  try { const hdr = await new RGBELoader().loadAsync("assets/hdr/artist_workshop.hdr"); hdr.mapping = THREE.EquirectangularReflectionMapping;
    const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromEquirectangular(hdr).texture; hdr.dispose(); pm.dispose();
    scene.environmentIntensity = 0.2; scene.environmentRotation = new THREE.Euler(0, 1.2, 0); } catch { /* lit by the lamps alone */ }
  materials();
  // camera: a little right of the house and level with its roof, looking down into every room (so floors, hatches and
  // ladders all read), close in with a wide lens like the still. The
  // lens is shifted (an off-centre frustum) so the house's front face still lands exactly on the game's house box,
  // while you see into each room in depth: side walls, ceilings, the floor running back.
  const HWd = RW * G.W, HHd = RH * G.H, D = 13, C = [3.6, HHd + 0.5], n = 0.3, far = 120;
  camera = new THREE.PerspectiveCamera(45, G.VW / G.VH, n, far);
  camera.position.set(C[0], C[1], RD / 2 + D);
  { const k = n / D; camera.projectionMatrix.makePerspective((wx(0) - C[0]) * k, (wx(G.VW) - C[0]) * k, (wy(0) - C[1]) * k, (wy(G.VH) - C[1]) * k, n, far);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert(); camera.userData.D = D; }
  // the photo camera, for the title and between floors: low and off to the right like a real photo of a real doll's
  // house on a table (rooms partly hidden behind their walls, shallow focus). Play always uses the camera above.
  photoCam = new THREE.PerspectiveCamera(42, G.VW / G.VH, 0.3, far); photoCam.position.set(11.8, 2.0, 12.6); photoCam.lookAt(-0.2, 5.0, 0); photoCam.rotateZ(-0.012);
  photoCam.userData.focus = photoCam.position.distanceTo(new THREE.Vector3(3.2, 4.6, 0.8));
  clip = [new THREE.Plane(new THREE.Vector3(1, 0, 0), HWd / 2), new THREE.Plane(new THREE.Vector3(-1, 0, 0), HWd / 2), new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Plane(new THREE.Vector3(0, -1, 0), HHd)];
  // lights, as in the still: one warm desk lamp in the room, off to the front left, does most of the work (soft
  // shadows); a cool fill from the right; the house's own bulbs are small extras. The lightning is a cold flash.
  hemi = new THREE.HemisphereLight(0xb8b0c0, 0x2a2018, 0.12); scene.add(hemi);
  key = new THREE.SpotLight(0xffe2c0, 1500, 60, 0.85, 1.0, 2); key.position.set(-6.5, 9, 9); key.target.position.set(-1, 5, 0);
  key.castShadow = true; key.shadow.autoUpdate = false; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0006; key.shadow.normalBias = 0.04; key.shadow.radius = 6; scene.add(key, key.target);
  const fill = new THREE.PointLight(0xc8c0d8, 5, 60, 2); fill.position.set(12, 6, 20); scene.add(fill); scene.userData.fill = fill;
  const table = new THREE.PointLight(0x6a5a50, 6, 14, 1.2); table.position.set(1, 1.2, 8); scene.add(table);
  moon = new THREE.DirectionalLight(0xb8c8ff, 0); moon.position.set(-6, 12, 16); scene.add(moon);
  // your lantern throws its light (and the furniture's shadows) onto the walls of the room you're in
  lantern = new THREE.SpotLight(0xffc070, 4, 4.2, 1.05, 0.75, 1.5); lantern.castShadow = true; lantern.shadow.autoUpdate = false; lantern.shadow.mapSize.set(512, 512); lantern.shadow.bias = -0.002; lantern.shadow.radius = 6; lantern.shadow.blurSamples = 8; scene.add(lantern, lantern.target);
  makePost();
  root = new THREE.Group(); scene.add(root); // the room grid: the flip turns this over
  grid = new THREE.Group(); root.add(grid);
  surroundings();
  // models
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  const names = new Set(); for (const list of Object.values(FURNISH)) for (const [n] of list) names.add(n);
  await Promise.all([...names].map((n) => new Promise((ok) => loader.load(`assets/models/${n}.glb`, (g) => {
    g.scene.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } }); models.set(n, g.scene); ok();
  }, undefined, () => ok()))));
  try { await document.fonts.load('64px "IM Fell English SC"'); } catch { /* fine */ }
  await new Promise((ok) => { const im = new Image(); im.onload = () => { WOODIMG = im; ok(); }; im.onerror = ok; im.src = "assets/tex/Wood049/Color.jpg"; });
  props();
  player = pegDoll(); playerTwin = pegDoll(); shadowFig = hooded(); shadowTwin = hooded();
  for (const f of [player, playerTwin, shadowFig, shadowTwin]) { clipAll(f); grid.add(f); }
  ready = true; return true;
}
let lastPhoto = false, player, playerTwin, shadowFig, shadowTwin, lastSig = "", lastFig = "", frameNo = 0, keyAt = 0, WOODIMG = null;
// the last pass, done in one shader at game speed: focus falls off into the room behind the house (and a touch in the
// rooms' depths), film grain, a soft vignette and a hint of lens barrel, as in the still
function makePost() {
  rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
  rt.depthTexture = new THREE.DepthTexture(4, 4); rt.depthTexture.type = THREE.UnsignedIntType;
  const m = new THREE.ShaderMaterial({
    uniforms: { tColor: { value: rt.texture }, tDepth: { value: rt.depthTexture }, res: { value: new THREE.Vector2(4, 4) }, near: { value: camera.near }, far: { value: camera.far },
      focus: { value: camera.userData.D + 1.2 }, t: { value: 0 }, photo: { value: 0 }, vc: { value: new THREE.Vector2(0.36, 0.5) } },
    vertexShader: "varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}",
    fragmentShader: `uniform sampler2D tColor,tDepth;uniform vec2 res,vc;uniform float near,far,focus,t,photo;varying vec2 vUv;
float lin(float d){float z=d*2.0-1.0;return 2.0*near*far/(far+near-z*(far-near));}
float coc(vec2 uv){float z=lin(texture2D(tDepth,uv).x);if(photo>0.5)return clamp(abs(z-focus)*0.3-0.35,0.0,1.0)*5.0;return 0.45+clamp((z-focus)*0.5,0.0,1.0)*1.1+smoothstep(focus+5.0,focus+14.0,z)*4.5;}
float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
void main(){vec2 q0=vUv-0.5;float rr=dot(q0,q0);vec2 uv=0.5+q0*(1.0-0.03*rr);
 float c=coc(uv);vec3 col=texture2D(tColor,uv).rgb;float tw=1.0;
 if(c>0.15){for(int i=0;i<12;i++){float fi=float(i);float r=sqrt((fi+0.5)/12.0)*c;float a=fi*2.39996;vec2 o=vec2(cos(a),sin(a))*r/res*1.6;vec2 su=uv+o;float sc=coc(su);float w=sc>=r*0.6?1.0:0.15;col+=texture2D(tColor,su).rgb*w;tw+=w;}}
 gl_FragColor=vec4(col/tw,1.0);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 vec2 px=floor(uv*res);float fr=floor(t*24.0);float n1=h(px+fr*1.7)-0.5;float n2=h(floor(px/2.0)+7.3+fr)-0.5;float lum=dot(gl_FragColor.rgb,vec3(0.3,0.59,0.11));
 float amp=mix(0.075,0.03,smoothstep(0.0,0.5,lum));gl_FragColor.rgb+=(n1*0.6+n2*0.4)*amp;
 vec2 q=(vUv-vc)*vec2(res.x/res.y,1.0);gl_FragColor.rgb*=clamp(1.0-dot(q,q)*0.45,0.0,1.0);}`,
  });
  post = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m); post.frustumCulled = false;
  post.userData.scene = new THREE.Scene(); post.userData.scene.add(post); post.userData.cam = new THREE.Camera();
}
// for the tests: where a room's 3D copy sits (world x, y), and whether its furniture hangs upside down
export const roomAt = (id) => { const r = rooms.get(id); return r && r.main.visible ? { x: +r.main.position.x.toFixed(3), y: +r.main.position.y.toFixed(3), flipped: PARTS.get(r.main).inner.scale.y < 0, key: r.key } : null; };
let sceneInfo = {}; // what the scene pass drew (the last pass is one full-screen quad)
export const info = () => renderer && { ...sceneInfo, programs: renderer.info.programs.length, textures: renderer.info.memory.textures };
function clipAll(o) { o.traverse((m) => { if (m.material) for (const mm of [].concat(m.material)) { mm.clippingPlanes = clip; mm.clipShadows = true; } }); }

function roomFor(room, v) {
  let r = rooms.get(room.id);
  if (!r) { r = { main: buildRoom(room), ghost: null, key: "" }; clipAll(r.main); grid.add(r.main); rooms.set(room.id, r); }
  const key = varyKey(room, v);
  if (key !== r.key) {
    buildVary(r.main, room, v); clipAll(PARTS.get(r.main).vary); r.key = key;
    if (r.ghost) { grid.remove(r.ghost); r.ghost = null; }
  }
  return r;
}
function ghostOf(r) {
  if (!r.ghost) {
    r.ghost = r.main.clone(true); r.ghost.traverse((o) => { if (o.isLight) o.intensity = 0; }); // lights stay in the real room
    const lamp = []; r.ghost.traverse((o) => { if (o.isLight) lamp.push(o); }); for (const l of lamp) l.parent.remove(l);
    const P = PARTS.get(r.main); PARTS.set(r.ghost, { ...P, inner: r.ghost.getObjectByName("inner"), vary: r.ghost.getObjectByName("vary"), lamp: null, fire: null });
    grid.add(r.ghost);
  }
  return r.ghost;
}

// game pixels -> world, on the house's front plane
const wx = (px) => (px - (G.HX + G.W * G.CW / 2)) * S;
const wy = (py) => (G.HY + G.H * G.CH - py) * S;

// ---------- each frame ----------
// view: { t, flash, flipped, flip (0..1 tumble progress, or null), dim, blackout, unlocked, hoverDoor,
//   rooms: [{ room, at: [[px, py], ...] (top-left of each copy, in game pixels), lit, lock, page, door: {side, open} | null }],
//   player: { x, y, dir, walking }, shadow: { x, y, seen, asleep, near, look }, twin: { player: [x,y] | null, shadow: [x,y] | null } }
export function render(view, w, h) {
  PHOTO_ON = !!view.photo;
  if (!ready) return null;
  if (w !== size[0] || h !== size[1]) { renderer.setSize(w, h, false); rt.setSize(w, h); post.material.uniforms.res.value.set(w, h); size = [w, h]; }
  const t = view.t, seen = new Set();
  for (const rv of view.rooms) {
    const r = roomFor(rv.room, rv); seen.add(rv.room.id);
    const [a, b] = rv.at;
    place(r.main, a, rv, t);
    if (b) { const gh = ghostOf(r); gh.visible = true; place(gh, b, rv, t); } else if (r.ghost) r.ghost.visible = false;
  }
  for (const [id, r] of rooms) if (!seen.has(id)) { r.main.visible = false; if (r.ghost) r.ghost.visible = false; }
  // the flip: the room grid tumbles end over end about the house's middle
  const HHd = RH * G.H;
  grid.position.y = 0; root.position.set(0, HHd / 2, 0); grid.position.set(0, -HHd / 2, 0);
  root.rotation.x = view.flip == null ? 0 : view.flip;
  // figures
  figure(player, view.player, true, t); figure(shadowFig, view.shadow, false, t);
  twin(playerTwin, view.twin && view.twin.player, view.player, true, t); twin(shadowTwin, view.twin && view.twin.shadow, view.shadow, false, t);
  const pl = view.player; lantern.position.set(wx(pl.x) + 0.15 * (pl.dir || 1), wy(pl.y) + 0.75, 1.0); lantern.target.position.set(wx(pl.x), wy(pl.y) + 0.45, -RD / 2);
  lantern.intensity = view.player.hidden ? 0 : 7 * (0.88 + 0.12 * Math.sin(t * 23) * Math.sin(t * 7)) * (view.lantern == null ? 1 : view.lantern);
  // the front door: shut and dark, or open with cold light behind it
  const d = scene.userData.door, open = view.unlocked ? 1 : 0;
  d.dg.rotation.y += ((open ? -1.2 : 0) - d.dg.rotation.y) * 0.12;
  d.doorGlow.material.opacity = open * (0.55 + 0.15 * Math.sin(t * 3)); porchLight.intensity = 1.2 + open * 2;
  // lightning
  const f = view.flash || 0; moon.intensity = 9 * f; hemi.intensity = 0.12 * (view.dim || 1) + 3 * f; key.intensity = 520 * (view.dim || 1) * (view.photo ? 0.3 : 1); key.angle = view.photo ? 0.6 : 0.85; key.target.position.set(view.photo ? 1.0 : -1, view.photo ? 3.8 : 5, 0); // (photo: a narrow desk-lamp cone, its edge falling across the house)
  // shadows are redrawn only when something moved (they're most of the cost of a frame)
  // the desk lamp's big shadow map at once when the rooms move, at most every fourth frame when only a figure moved;
  // the lantern's small one whenever you or it moved
  const roomSig = view.rooms.map((r) => r.at.join() + (r.flipped ? 1 : 0)).join("|") + view.flip, figSig = [pl.x, pl.y, view.shadow.x, view.shadow.y].join();
  frameNo++;
  if (roomSig !== lastSig) { key.shadow.needsUpdate = lantern.shadow.needsUpdate = true; lastSig = roomSig; lastFig = figSig; keyAt = frameNo; }
  else if (figSig !== lastFig) { lantern.shadow.needsUpdate = true; if (frameNo - keyAt >= 4) { key.shadow.needsUpdate = true; keyAt = frameNo; lastFig = figSig; } }
  const PH = !!view.photo, cam = PH ? photoCam : camera, U = post.material.uniforms;
  U.photo.value = PH ? 1 : 0; U.focus.value = PH ? photoCam.userData.focus : camera.userData.D + 1.2; U.vc.value.set(PH ? 0.5 : 0.36, 0.5);
  // the photo: six of the room lamps cast real shadows (chair legs and table edges across the floor). Only there: in play it would cost too much
  if (PH !== lampShadows) { lampShadows = PH; key.shadow.needsUpdate = true; let n = 0; for (const L of LAMPS) { const on = PH && n++ < 6; L.castShadow = on; if (on) { L.shadow.mapSize.set(512, 512); L.shadow.bias = -0.002; L.shadow.radius = 3; L.shadow.camera.near = 0.05; } } }
  scene.userData.props.visible = PH; scene.userData.fill.intensity = PH ? 1.2 : 5; scene.environmentIntensity = PH ? 0.07 : 0.2; // (the photo: almost all the light from the lamps, deep shadow between)
  if (PH !== lastPhoto) { key.shadow.needsUpdate = true; lastPhoto = PH; }
  renderer.setRenderTarget(rt); renderer.render(scene, cam); renderer.setRenderTarget(null); sceneInfo = { ...renderer.info.render };
  post.material.uniforms.t.value = t; renderer.render(post.userData.scene, post.userData.cam);
  return renderer.domElement;
}
function place(g, [px, py], rv, t) {
  g.visible = true;
  g.position.set(wx(px + G.CW / 2), wy(py + G.CH), 0);
  const u = PARTS.get(g);
  // upside down: the furniture hangs from the ceiling (the doll's house was turned over, everything is glued in)
  u.inner.scale.y = rv.flipped ? -1 : 1; u.inner.position.y = rv.flipped ? RH : 0;
  const lit = rv.lit;
    // the photo: no two rooms lit alike. One bright, one dim, one with its lamp off, a couple lit only cold and blue as if by a window
  const md = PHOTO_ON && u.lamp ? u.lamp.userData.mood : 1, bl = lit * Math.min(1, md * 1.4);
  u.bulbM.emissiveIntensity = 3 * bl; u.bulbM.color.setHex(bl > 0.3 ? 0xffe0a0 : 0x2a2622); u.shadeM.emissiveIntensity = 3 * bl;
  if (u.lamp) { const L = u.lamp; L.intensity = (PHOTO_ON ? 34 * md : 16) * lit * (L.userData.pw || 1); L.angle = PHOTO_ON ? 1.45 : L.userData.a; L.penumbra = PHOTO_ON ? 0.6 : 0.9; L.decay = 2; L.distance = PHOTO_ON ? 0 : 4; L.color.copy(PHOTO_ON ? L.userData.pc : L.userData.c); if (PHOTO_ON && L.userData.cold) { L.color.setHex(0x8aa8ff); L.intensity = 14 * lit; L.angle = 0.9; } } // (photo: a tight pool under each shade, dark upper corners, each bulb its own colour)
  if (u.fire) u.fire.intensity = 2.2 + 0.6 * Math.sin(t * 9) * Math.sin(t * 3.7);
  if (u.trims) for (const s of ["l", "r"]) if (u.trims[s]) {
    const on = rv.door && rv.door.side === s ? 0.55 + 0.45 * Math.sin(t * 8) : 0;
    u.trims[s].emissive.setHex(rv.door && rv.door.open ? 0x2f8a3a : 0xb3261e); u.trims[s].emissiveIntensity = on * 1.5;
  }
}
function figure(f, p, isPlayer, t) {
  if (!p || p.hidden) { f.visible = false; return; }
  f.visible = true;
  const walking = p.walking, bob = walking ? Math.abs(Math.sin(t * 16)) * 0.04 : 0;
  f.position.set(wx(p.x), wy(p.y) + T / 2 + bob, isPlayer ? 0.35 : 0.1);
  f.children[0].position.y = 0.006 - bob / f.scale.y; // the floor patch stays on the floor while you bob
  const face = p.climb ? Math.PI : p.dir ? (p.dir > 0 ? Math.PI / 2 : -Math.PI / 2) * 0.8 : 0;
  f.rotation.y += (face - f.rotation.y) * 0.2; f.rotation.z = walking && !p.climb ? Math.sin(t * 16) * 0.06 : 0;
  if (!isPlayer) {
    const u = f.userData, a = p.seen;
    u.coreM.opacity = a * (p.asleep ? 0.8 : 1); u.blob.material.opacity = 0.8 * a; for (const m of u.smokes) m.material.opacity = m.userData.op * a * (1 + 0.3 * Math.sin(t * 2 + m.userData.op * 20));
    f.scale.set(1, 1 + 0.02 * Math.sin(t * 1.4), 1);
    const blink = Math.sin(t * 0.9 + p.x * 0.01) > 0.97;
    u.eyeM.opacity = p.asleep ? 0.2 * (1 - a) : blink ? 0 : 1; for (const e of u.eyes) e.scale.setScalar(p.near <= 1 ? 1.4 : 1);
    f.visible = a > 0.01 || u.eyeM.opacity > 0.01;
  }
}
function twin(f, at, p, isPlayer, t) { if (!at) { f.visible = false; return; } figure(f, { ...p, x: at[0], y: at[1] }, isPlayer, t); }
