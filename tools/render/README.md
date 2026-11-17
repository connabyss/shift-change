# Path-traced photo shots (title and between floors)

The live game draws top-down. The photo shots are rendered offline from the game's own scene.

1. `node tools/render/export.cjs house.glb "?seed=4242&3d=1&photo=1"` (Playwright; writes house.glb + house.glb.cam.json)
2. Blender 4.2 as a Python module (`pip install bpy==4.2.0` on Python 3.11):
   `python render.py house.glb out.png 1600 1000 200 1300 0.08 0.15 9`
   (size, samples, room-light scale, world strength, f-stop, desk-lamp scale). About 10 minutes on 4 CPU cores.
3. `python3 grain.py out.png out.jpg` (sensor noise, vignette).

Approved baseline (CH, 11-17): prerender_3, rendered with exactly these settings.
