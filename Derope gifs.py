"""
Remove the clothesline / rope from the background of GIFs.

Usage:  python derope_gifs.py  [folder]
        (defaults to the folder this script sits in)

Reads every *.gif in the folder, writes cleaned copies to a "cleaned"
subfolder. Originals are never touched.
"""

import os, sys, glob, shutil, subprocess, tempfile

import numpy as np
import cv2
from PIL import Image

# ---------------------------------------------------------------- tuning ----
D          = 6      # px above/below used to sample the background
SMOOTH     = 31     # horizontal reinforcement window
BAND       = 7      # half-height of the search band around the fitted line
RATIO      = 0.22   # sensitivity: lower = catches fainter rope, riskier
BRIDGE     = 220    # max gap (px) to bridge across plain background
DILATE     = 9      # thickness of the final repaint band
LOSSY      = 60     # gifsicle --lossy level (only if gifsicle is available)
# -----------------------------------------------------------------------------


def ridge(bgr):
    """High response on thin, near-horizontal structures."""
    g = cv2.GaussianBlur(cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY), (3, 3), 0).astype(np.float32)
    r = np.abs(g - 0.5 * (np.roll(g, -D, 0) + np.roll(g, D, 0)))
    r = cv2.blur(r, (SMOOTH, 1))
    r[:D + 3, :] = 0
    r[-(D + 3):, :] = 0
    return r


def colour_symmetric(bgr, tol=30):
    """True where the colour above matches the colour below -> plain background."""
    f = cv2.blur(bgr.astype(np.float32), (25, 5))
    return (np.abs(np.roll(f, -12, 0) - np.roll(f, 12, 0)).max(2) < tol)


def fit_line(pts, iters=400, tol=2.5):
    """RANSAC fit of y = a*x + b."""
    if len(pts) < 80:
        return None
    rng = np.random.default_rng(0)
    x, y = pts[:, 0].astype(np.float32), pts[:, 1].astype(np.float32)
    best = None
    for _ in range(iters):
        i, j = rng.integers(0, len(pts), 2)
        if abs(x[i] - x[j]) < 200:
            continue
        a = (y[j] - y[i]) / (x[j] - x[i])
        if abs(a) > 0.35:
            continue
        b = y[i] - a * x[i]
        inl = np.abs(y - (a * x + b)) < tol
        n = int(inl.sum())
        if best is None or n > best[0]:
            xs = x[inl]
            best = (n, float(xs.max() - xs.min()) if n else 0.0, inl)
    if best is None:
        return None
    n, span, inl = best
    if n < 150 or span < 350:
        return None
    a, b = np.polyfit(x[inl], y[inl], 1)
    return float(a), float(b)


def frame_line(bgr):
    r = ridge(bgr)
    thr = max(9.0, float(np.percentile(r, 99.5)))
    strong = (r > thr) & colour_symmetric(bgr)
    ys, xs = np.nonzero(strong)
    if len(xs) == 0:
        return None
    return fit_line(np.stack([xs, ys], 1))


def build_mask(bgr, a, b):
    r = ridge(bgr)
    thr = max(8.0, float(np.percentile(r, 99.5))) * RATIO
    H, W = r.shape
    m = np.zeros((H, W), np.uint8)
    xs = np.arange(W)
    yline = a * xs + b
    for dy in range(-BAND, BAND + 1):
        yy = np.round(yline + dy).astype(int)
        ok = (yy >= 0) & (yy < H)
        sel = r[yy[ok], xs[ok]] > thr
        m[yy[ok][sel], xs[ok][sel]] = 255

    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE,
                         cv2.getStructuringElement(cv2.MORPH_RECT, (41, 3)))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m, 8)
    out = np.zeros_like(m)
    for i in range(1, n):
        if st[i][2] >= 45:
            out[lab == i] = 255

    # bridge faint gaps, but only across plain background (never over a person)
    sym = colour_symmetric(bgr)
    det = out.max(0) > 0
    yy = np.clip(np.round(yline).astype(int), 0, H - 1)
    onbg = sym[yy, xs]
    idx = np.nonzero(det)[0]
    if len(idx) > 1:
        for p, q in zip(idx[:-1], idx[1:]):
            if 1 < q - p <= BRIDGE and onbg[p + 1:q].all():
                for dy in range(-3, 4):
                    out[np.clip(yy[p + 1:q] + dy, 0, H - 1), xs[p + 1:q]] = 255

    return cv2.dilate(out, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (DILATE, DILATE)))


def read_gif(path):
    im = Image.open(path)
    frames, durs = [], []
    try:
        while True:
            frames.append(cv2.cvtColor(np.asarray(im.convert("RGB")), cv2.COLOR_RGB2BGR))
            durs.append(im.info.get("duration", 70))
            im.seek(im.tell() + 1)
    except EOFError:
        pass
    return frames, durs


def which(name):
    return shutil.which(name) or shutil.which(name + ".exe")


def ffmpeg_exe():
    p = which("ffmpeg")
    if p:
        return p
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return None


def write_gif(frames, durs, out_path):
    delay = max(2, round(sum(durs) / len(durs) / 10))   # centiseconds
    fps = 100.0 / delay
    ff = ffmpeg_exe()

    if ff:
        tmp = tempfile.mkdtemp()
        try:
            for i, f in enumerate(frames):
                cv2.imwrite(os.path.join(tmp, "f_%04d.png" % i), f)
            vf = ("split[a][b];[a]palettegen=stats_mode=diff[p];"
                  "[b][p]paletteuse=dither=none:diff_mode=rectangle")
            subprocess.run([ff, "-y", "-v", "error", "-framerate", str(fps),
                            "-i", os.path.join(tmp, "f_%04d.png"),
                            "-vf", vf, "-loop", "0", out_path], check=True)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

        gs = which("gifsicle") or which(os.path.join(os.path.dirname(
            os.path.abspath(__file__)), "gifsicle"))
        if gs:
            subprocess.run([gs, "-O3", "--lossy=%d" % LOSSY, out_path,
                            "-o", out_path], check=False)
        return

    # ---- fallback: Pillow only (larger files, no external tools needed) ----
    imgs = [Image.fromarray(cv2.cvtColor(f, cv2.COLOR_BGR2RGB)) for f in frames]
    step = max(1, len(imgs) // 8)
    comp = Image.fromarray(np.vstack([np.asarray(s) for s in imgs[::step]]))
    pal = comp.quantize(colors=256, method=Image.MEDIANCUT)
    q = [i.quantize(palette=pal, dither=Image.NONE) for i in imgs]
    q[0].save(out_path, save_all=True, append_images=q[1:],
              duration=durs, loop=0, optimize=True)


def process(path, out_path):
    frames, durs = read_gif(path)
    if not frames:
        return "unreadable"

    fits = [frame_line(f) for f in frames]
    good = [f for f in fits if f]
    if not good:
        shutil.copy2(path, out_path)
        return "no rope found - copied as is"

    a_med = float(np.median([g[0] for g in good]))
    W = frames[0].shape[1]
    bs = np.array([(f[1] + (f[0] - a_med) * W / 2) if f else np.nan for f in fits], float)
    idx = np.arange(len(bs)); ok = ~np.isnan(bs)
    bs = np.full_like(bs, np.nanmedian(bs)) if ok.sum() < 2 else np.interp(idx, idx[ok], bs[ok])

    hit = 0
    for i, (f, b) in enumerate(zip(frames, bs)):
        m = build_mask(f, a_med, b)
        if m.any():
            frames[i] = cv2.inpaint(f, m, 5, cv2.INPAINT_TELEA)
            hit += 1

    write_gif(frames, durs, out_path)
    return "rope removed on %d/%d frames" % (hit, len(frames))


def main():
    folder = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))
    gifs = sorted(glob.glob(os.path.join(folder, "*.gif")))
    if not gifs:
        print("No .gif files found in:", folder)
        return
    out_dir = os.path.join(folder, "cleaned")
    os.makedirs(out_dir, exist_ok=True)

    if not ffmpeg_exe():
        print("! ffmpeg not found - using the built-in encoder (files will be larger)\n")
    elif not (which("gifsicle") or which(os.path.join(folder, "gifsicle"))):
        print("! gifsicle not found - output will be larger than the originals\n")

    print("Cleaning %d file(s) -> %s\n" % (len(gifs), out_dir))
    for n, g in enumerate(gifs, 1):
        name = os.path.basename(g)
        print("[%2d/%d] %-34s " % (n, len(gifs), name[:34]), end="", flush=True)
        try:
            print(process(g, os.path.join(out_dir, name)))
        except Exception as e:
            print("FAILED:", e)
    print("\nDone. Check the 'cleaned' folder, then replace the originals yourself if happy.")


if __name__ == "__main__":
    main()