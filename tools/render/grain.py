# python3 grain.py in.png out.jpg : sensor noise (luminance + chroma, stronger in shadows), slight vignette, jpeg
import sys, numpy as np; from PIL import Image
a = np.asarray(Image.open(sys.argv[1]).convert('RGB')).astype(np.float32) / 255; h, w, _ = a.shape; rng = np.random.default_rng(7)
lum = a.mean(2, keepdims=True); amt = 0.006 + 0.022 * (1 - lum) ** 2
n = rng.normal(0, 1, (h, w, 1)) * amt + rng.normal(0, 1, (h, w, 3)) * amt * 0.45
y, x = np.mgrid[0:h, 0:w]; v = 1 - 0.28 * (((x - w / 2) / (w / 2)) ** 2 + ((y - h / 2) / (h / 2)) ** 2) / 2
b = np.clip((a + n) * v[..., None], 0, 1)
Image.fromarray((b * 255).astype(np.uint8)).save(sys.argv[2], quality=86)
