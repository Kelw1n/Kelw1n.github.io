"""Zoom the car photo out to fit a wide 1920x720 head-unit screen.

The photo itself is only scaled down (nothing is generated). The empty side
strips are filled with a mirrored, heavily blurred copy of the photo's own
edge so there are no hard black bars; they sit under the launcher widgets.
"""
import sys
import numpy as np
from PIL import Image, ImageFilter

SRC, OUT_DIR = sys.argv[1], sys.argv[2]
W, H = (int(v) for v in (sys.argv[3] if len(sys.argv) > 3 else "1920x720").split("x"))
K = W / 1920  # blur/feather sizes scale with output size

src = Image.open(SRC).convert("RGB")
sw, sh = src.size


def build(zoom_out, top_share=0.7, name=""):
    """zoom_out: 1.0 = how the unit shows it now (fill width), 1.5 = whole photo fits height."""
    fw = round(W / zoom_out)
    fh = round(fw * sh / sw)
    fg = src.resize((fw, fh), Image.LANCZOS)
    if fh > H:  # still taller than the screen: trim, taking more from the sky than from the ground
        extra = fh - H
        top = round(extra * top_share)
        fg = fg.crop((0, top, fw, top + H))
    fg_a = np.asarray(fg).astype(np.float32)

    side = (W - fw) // 2
    canvas = np.zeros((H, W, 3), np.float32)
    canvas[:, side:side + fw] = fg_a

    if side > 0:
        # mirror the edge strips into the empty sides
        left = fg_a[:, :side][:, ::-1]
        right = fg_a[:, -(W - fw - side):][:, ::-1]
        canvas[:, :side] = left
        canvas[:, side + fw:] = right

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
    path = f"{OUT_DIR}/{name}"
    img.save(path, quality=95, subsampling=0)
    print(path, img.size, f"photo {fw}x{fh}, sides {side}px")
    return img


# what the unit does now: fill the width, crop top/bottom (for comparison only)
now = build(1.0, top_share=0.5, name="_now_preview.jpg")
a = build(1.25, name=f"camry_otdaleno_chut_{W}x{H}.jpg")   # slightly zoomed out
b = build(1.5, name=f"camry_otdaleno_silno_{W}x{H}.jpg")   # whole photo fits
if W != 1920:
    sys.exit()

# side-by-side comparison sheet
gap = 24
sheet = Image.new("RGB", (W, H * 3 + gap * 2), (20, 20, 20))
for i, im in enumerate([now, a, b]):
    sheet.paste(im, (0, i * (H + gap)))
sheet.resize((W // 2, sheet.height // 2), Image.LANCZOS).save(f"{OUT_DIR}/_compare.jpg", quality=90)
