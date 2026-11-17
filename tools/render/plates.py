# python3 plates.py lit.png dark.png shell.png outdir "name,name,...(12, row by row)"
# Cuts the straight-on renders (ORTHO="2.9,4.52,20.48", 1920x1200: the game's 960x600 canvas at 2x) into one picture
# per room, lights on and off, plus the empty house around them, for the game's play view (src/app.js drawPlate).
import sys, subprocess, os
from PIL import Image
lit, dark, shell, out, names = sys.argv[1:6]; names = names.split(','); os.makedirs(out, exist_ok=True)
G = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'grain.py')
def grain(src, dst, *flags): subprocess.run([sys.executable, G, src, dst, *flags], check=True)
grain(shell, os.path.join(out, 'shell.jpg'), '--ca')
for tag, src in (('lit', lit), ('dark', dark)):
    tmp = os.path.join(out, '_' + tag + '.jpg'); grain(src, tmp, '--novig'); im = Image.open(tmp)
    for i, n in enumerate(names):
        x, y = i % 4, i // 4; x0, y0 = 2 * (44 + x * 150), 2 * (74 + y * 146)
        im.crop((x0, y0, x0 + 300, y0 + 292)).save(os.path.join(out, f'{n}_{tag}.jpg'), quality=88)
    os.remove(tmp)
