# bpyenv/bin/python render.py house.glb out.png W H samples [lightscale]
import bpy, sys, json, math, mathutils, time, os
glb, out, W, H, S = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])
LS = float(sys.argv[6]) if len(sys.argv) > 6 else 1.0
WS = float(sys.argv[7]) if len(sys.argv) > 7 else 0.25
FS = float(sys.argv[8]) if len(sys.argv) > 8 else 0.15
DN = (sys.argv[10] != '0') if len(sys.argv) > 10 else True
cam = json.load(open(glb + '.cam.json'))
bpy.ops.wm.read_factory_settings(use_empty=True)
t0 = time.time(); bpy.ops.import_scene.gltf(filepath=glb); print('import', round(time.time() - t0), 's', flush=True)
sc = bpy.context.scene
nl = 0
for o in sc.objects:
    if o.type == 'LIGHT':
        o.data.energy *= LS; nl += 1
        o.data.shadow_soft_size = 0.05 if o.data.type != 'SUN' else o.data.shadow_soft_size
print('lights', nl, flush=True)
def aim(o, tx, ty, tz):  # target in three.js coords
    t = mathutils.Vector((tx, -tz, ty)); d = t - o.matrix_world.translation
    o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = d.to_track_quat('-Z', 'Y')
KEYS = float(sys.argv[9]) if len(sys.argv) > 9 else 3.0
for o in sc.objects:
    if o.type != 'LIGHT': continue
    tp = o.matrix_world.translation
    if o.data.type == 'SPOT' and tp.x < -6 and tp.x > -10:   # the desk lamp
        aim(o, 1.6, 2.5, 0); o.data.energy *= KEYS; o.data.spot_size = 1.3; o.data.spot_blend = 0.6; o.data.shadow_soft_size = 0.15
    if o.data.type == 'SPOT' and tp.x < -20:                  # the window's daylight
        aim(o, -8, -0.5, 4); o.data.shadow_soft_size = 1.5
# camera: three.js (y up) -> blender (z up): (x, y, z) -> (x, -z, y)
p = cam['pos']; q = cam['quat']
c = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(c); sc.camera = c
c.location = (p[0], -p[2], p[1])
qt = mathutils.Quaternion((q[3], q[0], q[1], q[2])); conv = mathutils.Matrix.Rotation(math.pi / 2, 4, 'X')
c.matrix_world = conv @ (mathutils.Matrix.Translation((p[0], p[1], p[2])) @ qt.to_matrix().to_4x4())
if os.environ.get('CAM'):  # another shot of the same house: CAM="px,py,pz,tx,ty,tz,fov,focusdist" in three.js coords
    v = [float(x) for x in os.environ['CAM'].split(',')]
    c.location = (v[0], -v[2], v[1]); d = mathutils.Vector((v[3], -v[5], v[4])) - c.location
    c.rotation_mode = 'QUATERNION'; c.rotation_quaternion = d.to_track_quat('-Z', 'Y'); cam['fov'] = v[6]; cam['focus'] = v[7] if v[7] > 0 else d.length
c.data.sensor_fit = 'VERTICAL'; c.data.angle = math.radians(cam['fov'])
c.data.dof.use_dof = True; c.data.dof.focus_distance = cam['focus']; c.data.dof.aperture_fstop = FS
# world: the photographed workshop
if os.environ.get('ORTHO'):  # the game's own straight-on view: ORTHO="cx,cy,width" (three.js units), all in focus
    v = [float(x) for x in os.environ['ORTHO'].split(',')]
    c.data.type = 'ORTHO'; c.data.ortho_scale = v[2]; c.data.sensor_fit = 'HORIZONTAL'; c.data.dof.use_dof = False
    c.rotation_mode = 'XYZ'; c.rotation_euler = (math.pi / 2, 0, 0); c.location = (v[0], -40, v[1]); c.data.clip_end = 200
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; nt = w.node_tree
env = nt.nodes.new('ShaderNodeTexEnvironment'); env.image = bpy.data.images.load('/home/user/shift-change/assets/hdr/artist_workshop.hdr')
bg = nt.nodes['Background']; bg.inputs['Strength'].default_value = WS; nt.links.new(env.outputs['Color'], bg.inputs['Color'])
# real wear: every surface gets dust settling on what faces up, blotchy roughness, slight colour unevenness (no two spots alike)
for m in bpy.data.materials:
    if not m.use_nodes: continue
    nt2 = m.node_tree; bs = next((n for n in nt2.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if not bs: continue
    N = nt2.nodes; L = nt2.links
    tc = N.new('ShaderNodeTexCoord'); nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 9; nz.inputs['Detail'].default_value = 8; L.new(tc.outputs['Object'], nz.inputs['Vector'])
    nf = N.new('ShaderNodeTexNoise'); nf.inputs['Scale'].default_value = 140; nf.inputs['Detail'].default_value = 4; L.new(tc.outputs['Object'], nf.inputs['Vector'])
    geo = N.new('ShaderNodeNewGeometry'); sep = N.new('ShaderNodeSeparateXYZ'); L.new(geo.outputs['Normal'], sep.inputs['Vector'])
    up = N.new('ShaderNodeMapRange'); up.inputs['From Min'].default_value = 0.5; up.inputs['From Max'].default_value = 1.0; L.new(sep.outputs['Z'], up.inputs['Value'])
    mk = N.new('ShaderNodeMath'); mk.operation = 'MULTIPLY'; L.new(up.outputs['Result'], mk.inputs[0]); L.new(nz.outputs['Fac'], mk.inputs[1])
    mk2 = N.new('ShaderNodeMath'); mk2.operation = 'MULTIPLY'; mk2.inputs[1].default_value = 0.55; L.new(mk.outputs['Value'], mk2.inputs[0])
    bc = bs.inputs['Base Color']; src = bc.links[0].from_socket if bc.links else None
    dark = N.new('ShaderNodeMix'); dark.data_type = 'RGBA'; dark.blend_type = 'MULTIPLY'; dark.inputs['Factor'].default_value = 0.35
    if src: L.new(src, dark.inputs['A'])
    else: dark.inputs['A'].default_value = bc.default_value
    rmp = N.new('ShaderNodeValToRGB'); rmp.color_ramp.elements[0].color = (0.6, 0.55, 0.5, 1); rmp.color_ramp.elements[1].color = (1, 1, 1, 1); L.new(nz.outputs['Fac'], rmp.inputs['Fac']); L.new(rmp.outputs['Color'], dark.inputs['B'])
    dust = N.new('ShaderNodeMix'); dust.data_type = 'RGBA'; L.new(mk2.outputs['Value'], dust.inputs['Factor']); L.new(dark.outputs['Result'], dust.inputs['A']); dust.inputs['B'].default_value = (0.42, 0.40, 0.37, 1)
    L.new(dust.outputs['Result'], bc)
    rr = bs.inputs['Roughness']; rsrc = rr.links[0].from_socket if rr.links else None
    radd = N.new('ShaderNodeMath'); radd.operation = 'ADD'; radd.use_clamp = True
    if rsrc: L.new(rsrc, radd.inputs[0])
    else: radd.inputs[0].default_value = rr.default_value
    rj = N.new('ShaderNodeMath'); rj.operation = 'MULTIPLY_ADD'; rj.inputs[1].default_value = 0.35; rj.inputs[2].default_value = -0.12; L.new(nf.outputs['Fac'], rj.inputs[0]); L.new(rj.outputs['Value'], radd.inputs[1])
    L.new(radd.outputs['Value'], rr)
PLY = os.environ.get('PLY_DIR', '/tmp/claude-0/ptex/plywood')
for m in bpy.data.materials:
    if not m.name.startswith('ply') or not m.use_nodes: continue
    N = m.node_tree.nodes; L = m.node_tree.links; bs = next((n for n in N if n.type == 'BSDF_PRINCIPLED'), None)
    if not bs or not bs.inputs['Base Color'].links: continue
    tc = N.new('ShaderNodeTexCoord'); mp = N.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (0.35, 0.35, 0.35); L.new(tc.outputs['Object'], mp.inputs['Vector'])
    im = N.new('ShaderNodeTexImage'); im.image = bpy.data.images.load(PLY + '/Color.jpg'); im.projection = 'BOX'; im.projection_blend = 0.3; L.new(mp.outputs['Vector'], im.inputs['Vector'])
    src = bs.inputs['Base Color'].links[0].from_socket
    mx = N.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'OVERLAY'; mx.inputs['Factor'].default_value = 0.75; L.new(src, mx.inputs['A']); L.new(im.outputs['Color'], mx.inputs['B'])
    L.new(mx.outputs['Result'], bs.inputs['Base Color'])
    rim = N.new('ShaderNodeTexImage'); rim.image = bpy.data.images.load(PLY + '/Roughness.jpg'); rim.image.colorspace_settings.name = 'Non-Color'; rim.projection = 'BOX'; L.new(mp.outputs['Vector'], rim.inputs['Vector'])
    L.new(rim.outputs['Color'], bs.inputs['Roughness'])
# no glow: emissive shades, bulbs and the window give light, not a halo
for m in bpy.data.materials:
    if m.use_nodes:
        for n in m.node_tree.nodes:
            if n.type == 'BSDF_PRINCIPLED' and 'Emission Strength' in n.inputs: n.inputs['Emission Strength'].default_value *= 0.3
# nothing dead straight: big flat parts (walls, slabs, frame) get a gentle warp and sit a hair crooked
import random
rnd = random.Random(11); nw = 0
for o in list(sc.objects):
    if o.type != 'MESH': continue
    d = o.dimensions
    if max(d) > 0.9 and len(o.data.vertices) < 400:
        sub = o.modifiers.new('sub', 'SUBSURF'); sub.subdivision_type = 'SIMPLE'; sub.levels = sub.render_levels = 3
        tx = bpy.data.textures.new('warp%d' % nw, 'CLOUDS'); tx.noise_scale = 0.9 + rnd.random() * 0.6
        dm = o.modifiers.new('warp', 'DISPLACE'); dm.texture = tx; dm.strength = 0.012; dm.mid_level = 0.5; dm.texture_coords = 'GLOBAL'
        o.rotation_mode = 'XYZ'; o.rotation_euler.x += (rnd.random() - 0.5) * 0.008; o.rotation_euler.y += (rnd.random() - 0.5) * 0.008; nw += 1
print('warped', nw, flush=True)
# each room its own brightness: some bulbs dim, some bright, some off (positions hashed, so the same every render)
import hashlib
for o in sc.objects:
    if o.type == 'LIGHT' and o.data.type in ('POINT', 'SPOT') and abs(o.matrix_world.translation.x) < 7 and -2 < o.matrix_world.translation.z < 11:
        h = int(hashlib.md5(('%.1f%.1f' % (o.matrix_world.translation.x, o.matrix_world.translation.z)).encode()).hexdigest(), 16)
        o.data.energy *= float(os.environ['EVEN']) if os.environ.get('EVEN') else [float(x) for x in os.environ.get('MOOD', '0.08,0.3,0.6,1,1.6,2.6,0,0.45').split(',')][h % 8]  # EVEN=k: every room lit the same, for play
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = S; sc.cycles.use_denoising = DN
sc.cycles.max_bounces = 6; sc.render.resolution_x = W; sc.render.resolution_y = H; sc.render.resolution_percentage = 100
sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Medium High Contrast'; sc.view_settings.exposure = 0
sc.render.filepath = out; sc.render.threads_mode = 'AUTO'
t0 = time.time(); bpy.ops.render.render(write_still=True); print('render', round(time.time() - t0), 's', flush=True)
