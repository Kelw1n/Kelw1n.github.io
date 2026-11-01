"""Zoom a car photo out to fit a wide 8:3 head-unit screen (1920x720 / 3840x1440).

The photo itself is only scaled (nothing is generated). The empty side strips
are filled with a mirrored, heavily blurred copy of the photo's own edge so
there are no hard black bars; on the head unit they sit under the widgets.

Examples:
  # first photo (16:9), the variants that were sent
  python3 zoom_out.py desert.jpg camry_otdaleno_chut_1920x720.jpg --zoom 1.25
  python3 zoom_out.py desert.jpg camry_otdaleno_silno_3840x1440.jpg --zoom 1.5 --size 3840x1440
  # second photo (3:2): whole photo fits the screen height
  python3 zoom_out.py river.jpg camry_reka_3840x1440.jpg --fit --edge-frac 0.15 --size 3840x1440
"""
import argparse
import numpy as np
from PIL import Image, ImageFilter

ap = argparse.ArgumentParser()
ap.add_argument("src")
ap.add_argument("out")
ap.add_argument("--size", default="1920x720", help="output WxH")
g = ap.add_mutually_exclusive_group(required=True)
g.add_argument("--zoom", type=float, help="1.0 = fill the width (what the unit does by itself), larger = further out")
g.add_argument("--fit", action="store_true", help="scale so the whole photo fits the screen height")
ap.add_argument("--top-share", type=float, default=0.7,
                help="if the photo is still taller than the screen, share of the trim taken from the top")
ap.add_argument("--edge-frac", type=float, default=0,
                help="mirror only this fraction of the photo width at each edge and stretch it over the side "
                     "(keeps the subject out of the fill); 0 = mirror a strip as wide as the side")
args = ap.parse_args()

W, H = (int(v) for v in args.size.split("x"))
K = W / 1920  # blur/feather sizes scale with output size

src = Image.open(args.src).convert("RGB")
sw, sh = src.size

if args.fit:
    fh = H
    fw = round(H * sw / sh)
else:
    fw = round(W / args.zoom)
    fh = round(fw * sh / sw)

fg = src.resize((fw, fh), Image.LANCZOS)
scale = fw / sw
if scale > 1.05:  # upscaling: restore a bit of crispness lost to interpolation
    fg = fg.filter(ImageFilter.UnsharpMask(radius=1.2 * scale, percent=45, threshold=2))
if fh > H:  # still taller than the screen: trim, taking more from the sky than from the ground
    top = round((fh - H) * args.top_share)
    fg = fg.crop((0, top, fw, top + H))
fg_a = np.asarray(fg).astype(np.float32)

side = (W - fw) // 2
side_r = W - fw - side
canvas = np.zeros((H, W, 3), np.float32)
canvas[:, side:side + fw] = fg_a

if side > 0:
    # mirror the edge strips into the empty sides
    if args.edge_frac > 0:
        strip = max(1, min(side, round(fw * args.edge_frac)))

        def stretch(a, width):
            img = Image.fromarray(a.clip(0, 255).astype(np.uint8))
            return np.asarray(img.resize((width, H), Image.LANCZOS)).astype(np.float32)

        canvas[:, :side] = stretch(fg_a[:, :strip][:, ::-1], side)
        canvas[:, side + fw:] = stretch(fg_a[:, -strip:][:, ::-1], side_r)
    else:
        canvas[:, :side] = fg_a[:, :side][:, ::-1]
        canvas[:, side + fw:] = fg_a[:, -side_r:][:, ::-1]

    base = Image.fromarray(canvas.clip(0, 255).astype(np.uint8))
    radii = [0] + [round(r * K) for r in (4, 10, 20, 35, 55)]
    levels = np.stack([
        canvas if r == 0 else np.asarray(base.filter(ImageFilter.GaussianBlur(r))).astype(np.float32)
        for r in radii
    ])

    # blur radius per column: sharp in the middle, growing smoothly from
    # ~80px inside the photo edge to the maximum at the screen edge
    x = np.arange(W, dtype=np.float32)
    dist_out = np.maximum(side - x, x - (side + fw - 1))  # >0 outside the photo
    ramp_in = 80.0 * K
    t = np.clip((dist_out + ramp_in) / (side + ramp_in), 0, 1)
    r_col = radii[-1] * t ** 0.8
    idx = np.interp(r_col, radii, np.arange(len(radii)))
    lo = np.floor(idx).astype(int)
    hi = np.minimum(lo + 1, len(radii) - 1)
    f = (idx - lo)[None, :, None]
    cols = np.arange(W)
    out = levels[lo, :, cols].transpose(1, 0, 2) * (1 - f) + levels[hi, :, cols].transpose(1, 0, 2) * f

    # gentle darkening toward the outer edges so the fill reads as background
    d = np.clip(dist_out / side, 0, 1)
    out *= (1 - 0.3 * d ** 1.5)[None, :, None]
else:
    out = canvas

img = Image.fromarray(out.clip(0, 255).round().astype(np.uint8))
# plain baseline JPEG, quality 95, 4:2:0, keeping the source's colour profile if it has one
img.save(args.out, "JPEG", quality=95, subsampling=2, progressive=False,
         icc_profile=src.info.get("icc_profile"), dpi=(72, 72))
print(args.out, img.size, f"photo {fw}x{fh} (scale {scale:.2f}), sides {side}px")
