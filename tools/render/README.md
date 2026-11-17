# Path-traced photo shots (title and between floors)

The live game draws top-down. The photo shots are rendered offline from the game's own scene.

1. `node tools/render/export.cjs house.glb "?seed=4242&3d=1&photo=1"` (Playwright; writes house.glb + house.glb.cam.json)
2. Blender 4.2 as a Python module (`pip install bpy==4.2.0` on Python 3.11):
   `python render.py house.glb out.png 1600 1000 200 1300 0.08 0.15 9`
   (size, samples, room-light scale, world strength, f-stop, desk-lamp scale). About 10 minutes on 4 CPU cores.
3. `python3 grain.py out.png out.jpg` (sensor noise, vignette).

Baselines:
- prerender_3 (CH: "looks incredible"): `render.py house.glb out.png 1600 1000 200 1300 0.08 0.15 9`. Gemma blind photo 3/10.
- prerender_6, CURRENT (Gemma blind photo 10/10, no render tells): `render.py house.glb out.png 1600 1000 200 1300 0.08 0.07 6`
  with Poly Haven `plywood` 2K in PLY_DIR (default /tmp/claude-0/ptex/plywood). What changed from 3, and nothing else:
  1. f-stop 0.15 -> 0.07 (shallower macro focus),
  2. scanned plywood grain overlaid (75%) on the frame's drawn laminations, with the scan's roughness (materials named "ply"),
  3. desk lamp 9 -> 6 (a third lower).
- Tried and judged worse: full-detail props (hi=1), light leaking into neighbouring rooms, bowed timbers, 12 bounces.
