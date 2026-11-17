# python3 grain.py in.png out.jpg [--ca] : sensor noise (luminance + chroma, stronger in shadows), slight vignette, jpeg
import sys, numpy as np; from PIL import Image
a = np.asarray(Image.open(sys.argv[1]).convert('RGB')).astype(np.float32) / 255; h, w, _ = a.shape; rng = np.random.default_rng(7)
if '--ca' in sys.argv:  # lens fringe: red scaled out about 2px at the edges, growing toward the edges
    from PIL import Image as I
    def sc(ch, k):
        im = I.fromarray((ch * 255).astype(np.uint8)); W2, H2 = int(w * k), int(h * k)
        im = im.resize((W2, H2), I.BICUBIC); l, t = (W2 - w) // 2, (H2 - h) // 2
        return np.asarray(im.crop((l, t, l + w, t + h))).astype(np.float32) / 255
    a = np.stack([sc(a[..., 0], 1.002), a[..., 1], a[..., 2]], 2)
lum = a.mean(2, keepdims=True); amt = 0.006 + 0.022 * (1 - lum) ** 2
n = rng.normal(0, 1, (h, w, 1)) * amt + rng.normal(0, 1, (h, w, 3)) * amt * 0.45
y, x = np.mgrid[0:h, 0:w]; v = 1 - 0.28 * (((x - w / 2) / (w / 2)) ** 2 + ((y - h / 2) / (h / 2)) ** 2) / 2
b = np.clip((a + n) * v[..., None], 0, 1)
Image.fromarray((b * 255).astype(np.uint8)).save(sys.argv[2], quality=86)
