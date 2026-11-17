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
import { RoomEnvironment } from "../vendor/addons/environments/RoomEnvironment.js";

let G = null; // layout from the game: { VW, VH, HX, HY, CW, CH, W, H }
let RW, RH, S; // room width/height in metres-ish, and world units per game pixel
const RD = 2.6, T = 0.16, DOOR_Z0 = -0.45, DOOR_Z1 = 0.55, DOOR_H = 1.5, LADDER_X = 0.8;
let renderer, scene, camera, root, grid, clip, moon, hemi, lantern, porchLight;
let ready = false, failed = false, size = [0, 0];
const rooms = new Map(); // room id -> { main, ghost, key }
const M = {}; // shared materials
const models = new Map(); // model name -> gltf scene (cloned per use)
const PARTS = new WeakMap(); // room group -> the parts render() changes (kept out of userData, which clone() copies as JSON)

export const isReady = () => ready;
// quality 0: full; 1: fewer pixels; 2: fewer pixels and no lantern shadows (the game steps down if frames run slow)
let quality = 0;
export function setQuality(q) { quality = q; if (lantern) lantern.castShadow = q < 2; if (moon) { moon.shadow.mapSize.set(q < 2 ? 2048 : 1024, q < 2 ? 2048 : 1024); if (moon.shadow.map) { moon.shadow.map.dispose(); moon.shadow.map = null; } } if (renderer) renderer.shadowMap.needsUpdate = true; }
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
const PAPER = {
  attic: ["Planks037A", 0xcab8a0, [1, 1]], nursery: ["Wallpaper001A", 0xd8a8a0, [1.5, 1.5]], study: ["Wallpaper002A", 0x9a5a48, [1.5, 1.5]],
  chapel: ["PaintedPlaster017", 0x8a6a88, [1, 1]], parlour: ["Wallpaper002B", 0x8a3a44, [1.5, 1.5]], library: ["Wallpaper002C", 0x6a6a8a, [1.5, 1.5]],
  gallery: ["Wallpaper001C", 0xb06a58, [1.5, 1.5]], bath: ["PaintedPlaster017", 0x9fb3b4, [1, 1]], kitchen: ["PaintedPlaster017", 0xc8b898, [1, 1]],
  pantry: ["Wallpaper001B", 0xe8c68a, [1.5, 1.5]], cellar: ["Bricks074", 0xb0a090, [2, 2]], hall: ["Wallpaper001A", 0x7a8a98, [1.5, 1.5]],
};
const NO_WAINSCOT = new Set(["cellar", "attic", "kitchen", "bath"]);
function materials() {
  M.floor = mat("WoodFloor051", [1.5, 1.2], 0xc8a888, 0.7);
  M.ceil = mat("Plaster001", [1, 1], 0xb8b0a8);
  M.frame = mat("Wood049", [3, 1], 0x4a3020, 0.55);
  M.trim = mat("Wood049", [1, 2], 0x3a2418, 0.5);
  M.door = mat("Wood049", [1, 2], 0x5a2e22, 0.55);
  M.wains = mat("Planks021", [2, 0.5], 0x6a4a36, 0.7);
  M.ladder = mat("Wood049", [0.3, 2], 0x8a6a4a, 0.7);
  M.brick = mat("Bricks074", [6, 0.6], 0x7a6458, 0.95);
  M.porch = mat("Planks037A", [0.5, 1], 0x4a3a40, 0.85);
  M.rug = mat("Fabric030", [2, 2], 0x7a2a2a, 1);
  M.siding = mat("WoodSiding011", [0.55, 0.55], 0xa89888, 0.85, true);
  M.tiles = mat("RoofingTiles014A", [0.7, 0.7], 0x5a4a48, 0.85);
  M.ground = mat("WoodFloor041", [8, 3], 0x2a2a30, 1);
  M.hole = new THREE.MeshBasicMaterial({ color: 0x020203 });
  M.back = new THREE.MeshStandardMaterial({ color: 0x050507, roughness: 1 });
  M.brass = new THREE.MeshStandardMaterial({ color: 0xc8a050, metalness: 1, roughness: 0.35 });
  M.cord = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
  for (const [name, [id, tint, rep]] of Object.entries(PAPER)) { M["wall_" + name] = mat(id, rep, tint, 0.85); M["side_" + name] = mat(id, [rep[0] * 0.8, rep[1]], tint, 0.85); }
}

// ---------- building blocks ----------
function box(w, h, d, m, x, y, z, parent, round = false) {
  const g = new THREE.Mesh(round ? new RoundedBoxGeometry(w, h, d, 2, Math.min(0.03, Math.min(w, h, d) * 0.3)) : new THREE.BoxGeometry(w, h, d), m);
  g.position.set(x, y, z); g.castShadow = g.receiveShadow = true; parent.add(g); return g;
}
// a model, scaled to height h, centred on x/z, standing on y (all in the room's own space)
function put(name, parent, { x = 0, y = 0, z = 0, h = 1, ry = 0 } = {}) {
  const src = models.get(name); if (!src) return null;
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
  box(RW, RH, 0.05, M["wall_" + name], 0, RH / 2, -RD / 2, inner);
  if (!NO_WAINSCOT.has(name)) box(RW, 0.85, 0.06, M.wains, 0, 0.425, -RD / 2 + 0.04, inner);
  box(RW, 0.12, 0.08, M.frame, 0, 0.06 + T / 2, -RD / 2 + 0.07, inner);
  if (RUGS[name]) { const [w, d, tint] = RUGS[name]; const rm = M.rug.clone(); rm.color.setHex(tint); const r = new THREE.Mesh(new THREE.PlaneGeometry(w, d), rm); r.rotation.x = -Math.PI / 2; r.position.set(0, T / 2 + 0.006, 0.05); r.receiveShadow = true; inner.add(r); }
  for (const [n, o] of FURNISH[name] || []) {
    if (o.hang) { const m = put(n, inner, { ...o, y: 0 }); if (m) m.position.y += RH - T - o.h - 0.35; } else put(n, inner, o);
  }
  if (name === "parlour") fireplace(inner);
  // the ceiling lamp: a cord and a bulb (on or off with the room's lights)
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.42), M.cord); cord.position.set(0.35, RH - T / 2 - 0.21, 0); inner.add(cord);
  const bulbM = new THREE.MeshStandardMaterial({ color: 0x2a2622, emissive: 0xffc070, emissiveIntensity: 0, roughness: 0.3 });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), bulbM); bulb.position.set(0.35, RH - T / 2 - 0.46, 0); inner.add(bulb);
  const lamp = new THREE.PointLight(0xffb060, 0, 3.0, 2); lamp.position.set(0.35, RH - 0.75, 0.25); inner.add(lamp);
  // floor and ceiling slabs, and the front posts: the room's own, so it carries its frame when it moves
  box(RW, T / 2, RD, M.floor, 0, T / 4, 0, g);
  box(RW, T / 2, RD, M.ceil, 0, RH - T / 4, 0, g);
  for (const sd of [-1, 1]) box(0.12, RH, 0.14, M.frame, sd * (RW / 2 - 0.06), RH / 2, RD / 2 + 0.06, g, true);
  g.add(nameplate(room.name));
  const vary = new THREE.Group(); vary.name = "vary"; g.add(vary);
  PARTS.set(g, { inner, vary, bulbM, lamp, fire: inner.userData.fire || null, trims: {} }); inner.userData = {};
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
const plateGeo = () => new THREE.BoxGeometry(1.1, 0.2, 0.025);
function nameplate(name) {
  const c = document.createElement("canvas"); c.width = 512; c.height = 96; const x = c.getContext("2d");
  let q = name.length * 131 + name.charCodeAt(0); const rn = () => { q = (q * 16807) % 2147483647; return q / 2147483647; };
  x.fillStyle = "#9a8452"; x.fillRect(0, 0, 512, 96); x.strokeStyle = "#3a2c18"; x.lineWidth = 6; x.strokeRect(5, 5, 502, 86);
  for (let i = 0; i < 260; i++) { x.fillStyle = `rgba(${rn() < 0.5 ? "40,30,10" : "200,180,120"},${0.05 + rn() * 0.12})`; x.beginPath(); x.arc(rn() * 512, rn() * 96, 1 + rn() * 7, 0, 7); x.fill(); }
  x.font = '64px "IM Fell English SC", Georgia, serif'; x.textAlign = "left"; x.textBaseline = "middle";
  const txt = name.toUpperCase(), ws = [...txt].map((ch) => x.measureText(ch).width + 7); let px = 256 - ws.reduce((a, b) => a + b, 0) / 2;
  [...txt].forEach((ch, i) => { const jy = (rn() - 0.5) * 3, ja = (rn() - 0.5) * 0.05; x.save(); x.translate(px, 52 + jy); x.rotate(ja); x.fillStyle = "rgba(255,240,200,0.6)"; x.fillText(ch, 1.5, 2); x.fillStyle = "rgba(20,12,4,0.95)"; x.fillText(ch, -1, -1.2); x.fillStyle = `rgba(${60 + rn() * 30},${42 + rn() * 20},18,1)`; x.fillText(ch, 0, 0); x.restore(); px += ws[i]; });
  const gr = x.createRadialGradient(256, 48, 60, 256, 48, 300); gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(1, "rgba(30,20,5,0.55)"); x.fillStyle = gr; x.fillRect(0, 0, 512, 96);
  for (const sx of [22, 490]) { x.fillStyle = "#2a1e10"; x.beginPath(); x.arc(sx, 48, 9, 0, 7); x.fill(); x.fillStyle = "#b8a070"; x.beginPath(); x.arc(sx - 1.5, 46.5, 6, 0, 7); x.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const p = new THREE.Mesh(plateGeo(), new THREE.MeshStandardMaterial({ map: t, color: 0xc8b890, metalness: 0.35, roughness: 0.45, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.22 }));
  p.material.envMapIntensity = 6; p.position.set(0, 0.17, RD / 2 + 0.02); p.rotation.z = ((name.length * 5) % 7 - 3) * 0.012; p.castShadow = true;
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
  if (room.down) { box(0.62, T / 2 + 0.01, 0.6, M.hole, LADDER_X, T / 4, -0.25, vary); if (!v.downJoined) boards(vary, T / 2 + 0.02); }
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
  g.position.set(0.5, 1.6, -RD / 2 + 0.1); g.scale.setScalar(1.6); body.castShadow = true;
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
function pegDoll() {
  const g = new THREE.Group();
  const prof = [[0, 0], [0.17, 0], [0.19, 0.05], [0.16, 0.45], [0.11, 0.6], [0.09, 0.66], [0.105, 0.7], [0, 0.7]].map(([a, b]) => new THREE.Vector2(a, b));
  const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 32), new THREE.MeshStandardMaterial({ map: tex("Fabric030", "Color", [2, 2]), color: 0x6e8c96, roughness: 0.9 }));
  body.castShadow = true; g.add(body);
  const c = document.createElement("canvas"); c.width = 512; c.height = 256; const x = c.getContext("2d");
  x.fillStyle = "#c09a74"; x.fillRect(0, 0, 512, 256);
  x.fillStyle = "#3a2216"; x.beginPath(); x.moveTo(0, 0); x.lineTo(512, 0); for (let u = 512; u >= 0; u -= 4) { const f = Math.cos((u / 512 - 0.25) * 2 * Math.PI); x.lineTo(u, 115 - 35 * Math.max(0, f) + 4 * Math.sin(u / 11) + (f < 0 ? 45 : 0)); } x.closePath(); x.fill();
  x.fillStyle = "#1a0e08"; for (const s of [-1, 1]) { x.beginPath(); x.ellipse(128 + s * 17, 145, 3, 3.5, 0, 0, 7); x.fill(); }
  x.fillStyle = "rgba(190,70,60,0.22)"; for (const s of [-1, 1]) { x.beginPath(); x.ellipse(128 + s * 27, 162, 8, 5, 0, 0, 7); x.fill(); }
  x.fillStyle = "#7a2a22"; x.beginPath(); x.ellipse(128, 165, 3, 1.8, 0, 0, 7); x.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 32, 20), new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 }));
  head.position.y = 0.8; head.rotation.y = Math.PI / 2; head.castShadow = true; g.add(head);
  // the little lantern you carry
  const lan = new THREE.Group(); lan.position.set(0.2, 0.38, 0.05);
  box(0.07, 0.1, 0.07, new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.6, metalness: 0.4 }), 0, 0, 0, lan);
  const glow = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.075), new THREE.MeshStandardMaterial({ color: 0xffd080, emissive: 0xffb050, emissiveIntensity: 2 })); lan.add(glow);
  g.add(lan); g.userData.lan = lan;
  g.scale.setScalar(1.1);
  return g;
}
function hooded() {
  const g = new THREE.Group(), prof = [];
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
  g.userData = { coreM, smokes, eyes, eyeM };
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
  const frameOut = M.frame.clone();
  for (let y = 0; y <= G.H; y++) box(HWd + 0.36, y === 0 || y === G.H ? 0.26 : 0.14, 0.14, frameOut, 0, y * RH, fz, scene, true);
  for (const sd of [-1, 1]) box(0.22, HHd + 0.26, 0.16, frameOut, sd * (HWd / 2 + 0.09), HHd / 2, fz, scene, true);
  // gable roof with a chimney
  const gh = 1.35, s = new THREE.Shape(); s.moveTo(-HWd / 2 - 0.45, 0); s.lineTo(0, gh); s.lineTo(HWd / 2 + 0.45, 0); s.lineTo(-HWd / 2 - 0.45, 0);
  const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: RD + 0.5, bevelEnabled: false }), [M.siding, M.tiles]);
  roof.position.set(0, HHd + 0.13, -RD / 2 - 0.25); roof.castShadow = roof.receiveShadow = true; scene.add(roof);
  box(0.45, 1.0, 0.45, mat("Bricks074", [0.5, 0.5], 0x8a6a60), HWd * 0.22, HHd + 1.2, -0.3, scene);
  // the front door, beside the house on the ground floor: a lean-to porch with its own wall
  const dx = (27 - (G.HX + G.W * G.CW / 2)) * S;
  box(1.0, 1.9, RD * 0.7, M.porch, dx - 0.1, 0.95, -0.25, scene);
  box(1.15, 0.07, RD * 0.8, mat("Planks037A", [0.3, 0.3], 0x5a4248, 0.8), dx - 0.1, 1.93, -0.2, scene);
  const fr = M.trim.clone(); box(0.72, 0.1, 0.12, fr, dx, 1.46, RD * 0.1 + 0.05, scene); for (const k of [-1, 1]) box(0.08, 1.42, 0.12, fr, dx + k * 0.32, 0.71, RD * 0.1 + 0.05, scene);
  const dg = new THREE.Group(); dg.position.set(dx - 0.28, 0, RD * 0.1 + 0.04); scene.add(dg);
  box(0.56, 1.4, 0.06, mat("Wood049", [1, 2], 0x5a1418, 0.45), 0.28, 0.7, 0, dg);
  const kn = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), M.brass.clone()); kn.position.set(0.48, 0.68, 0.05); dg.add(kn);
  const doorGlow = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 1.4), new THREE.MeshBasicMaterial({ color: 0xcfe0ff, transparent: true, opacity: 0 })); doorGlow.position.set(dx, 0.7, RD * 0.1 + 0.02); scene.add(doorGlow);
  porchLight = new THREE.PointLight(0xa8c0ff, 0, 3, 2); porchLight.position.set(dx + 0.2, 0.9, RD * 0.1 + 0.6); scene.add(porchLight);
  scene.userData.door = { dg, doorGlow };
  // the ground: dark boards stretching away
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 30), M.ground); ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.68, 0); ground.receiveShadow = true; scene.add(ground);
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
  renderer.toneMapping = THREE.AgXToneMapping; renderer.toneMappingExposure = 1.25;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
  renderer.localClippingEnabled = true; renderer.setClearColor(0x000000, 0);
  scene = new THREE.Scene(); scene.fog = new THREE.Fog(0x080a14, 40, 90);
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.06;
  materials();
  // camera: straight at the front, its front face exactly on the game's house box
  const fov = 22, D = (G.VH * S / 2) / Math.tan((fov / 2) * Math.PI / 180), HCX = G.HX + G.W * G.CW / 2, HCY = G.HY + G.H * G.CH / 2;
  camera = new THREE.PerspectiveCamera(fov, G.VW / G.VH, 1, 200);
  camera.position.set((G.VW / 2 - HCX) * S, (HCY - G.VH / 2) * S + RH * G.H / 2, RD / 2 + D);
  // the house box in world space (rooms that slide out of it are cut off at its edges)
  const HWd = RW * G.W, HHd = RH * G.H;
  clip = [new THREE.Plane(new THREE.Vector3(1, 0, 0), HWd / 2), new THREE.Plane(new THREE.Vector3(-1, 0, 0), HWd / 2), new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Plane(new THREE.Vector3(0, -1, 0), HHd)];
  // lights: moonlight from the front left, a dim blue fill, and your lantern
  hemi = new THREE.HemisphereLight(0x6a7ac0, 0x1a1410, 0.55); scene.add(hemi);
  const fill = new THREE.DirectionalLight(0x7484b8, 0.3); fill.position.set(2, 4, 30); scene.add(fill);
  moon = new THREE.DirectionalLight(0x9ab0f0, 1.2); moon.position.set(-8, 12, 16); moon.castShadow = true; moon.shadow.mapSize.set(2048, 2048);
  Object.assign(moon.shadow.camera, { left: -9, right: 9, top: 11, bottom: -2, near: 1, far: 50 }); moon.shadow.bias = -0.0005; scene.add(moon);
  // your lantern throws its light (and the furniture's shadows) onto the walls of the room you're in
  lantern = new THREE.SpotLight(0xffc070, 4, 4.2, 1.05, 0.75, 1.5); lantern.castShadow = true; lantern.shadow.mapSize.set(1024, 1024); lantern.shadow.bias = -0.002; lantern.shadow.radius = 5; scene.add(lantern, lantern.target);
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
  player = pegDoll(); playerTwin = pegDoll(); shadowFig = hooded(); shadowTwin = hooded();
  for (const f of [player, playerTwin, shadowFig, shadowTwin]) { clipAll(f); grid.add(f); }
  ready = true; return true;
}
let player, playerTwin, shadowFig, shadowTwin, lastSig = "";
export const info = () => renderer && { ...renderer.info.render, programs: renderer.info.programs.length, textures: renderer.info.memory.textures };
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
  if (!ready) return null;
  if (w !== size[0] || h !== size[1]) { renderer.setSize(w, h, false); size = [w, h]; }
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
  d.doorGlow.material.opacity = open * (0.55 + 0.15 * Math.sin(t * 3)); porchLight.intensity = 0.8 + open * 3;
  // lightning
  const f = view.flash || 0; moon.intensity = 1.2 + 9 * f; hemi.intensity = 0.55 * (view.dim || 1) + 3 * f;
  // shadows are redrawn only when something moved (they're most of the cost of a frame)
  const sig = view.rooms.map((r) => r.at.join() + (r.flipped ? 1 : 0)).join("|") + [pl.x, pl.y, view.shadow.x, view.shadow.y, view.flip].join();
  if (sig !== lastSig) { renderer.shadowMap.needsUpdate = true; lastSig = sig; }
  renderer.render(scene, camera);
  return renderer.domElement;
}
function place(g, [px, py], rv, t) {
  g.visible = true;
  g.position.set(wx(px + G.CW / 2), wy(py + G.CH), 0);
  const u = PARTS.get(g);
  // upside down: the furniture hangs from the ceiling (the doll's house was turned over, everything is glued in)
  u.inner.scale.y = rv.flipped ? -1 : 1; u.inner.position.y = rv.flipped ? RH : 0;
  const lit = rv.lit;
  u.bulbM.emissiveIntensity = 3 * lit; u.bulbM.color.setHex(lit > 0.5 ? 0xffe0a0 : 0x2a2622);
  if (u.lamp) u.lamp.intensity = 6 * lit;
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
  const face = p.climb ? Math.PI : p.dir ? (p.dir > 0 ? Math.PI / 2 : -Math.PI / 2) * 0.8 : 0;
  f.rotation.y += (face - f.rotation.y) * 0.2; f.rotation.z = walking && !p.climb ? Math.sin(t * 16) * 0.06 : 0;
  if (!isPlayer) {
    const u = f.userData, a = p.seen;
    u.coreM.opacity = a * (p.asleep ? 0.8 : 1); for (const m of u.smokes) m.material.opacity = m.userData.op * a * (1 + 0.3 * Math.sin(t * 2 + m.userData.op * 20));
    f.scale.set(1, 1 + 0.02 * Math.sin(t * 1.4), 1);
    const blink = Math.sin(t * 0.9 + p.x * 0.01) > 0.97;
    u.eyeM.opacity = p.asleep ? 0.2 * (1 - a) : blink ? 0 : 1; for (const e of u.eyes) e.scale.setScalar(p.near <= 1 ? 1.4 : 1);
    f.visible = a > 0.01 || u.eyeM.opacity > 0.01;
  }
}
function twin(f, at, p, isPlayer, t) { if (!at) { f.visible = false; return; } figure(f, { ...p, x: at[0], y: at[1] }, isPlayer, t); }
