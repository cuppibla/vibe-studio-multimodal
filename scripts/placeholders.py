"""Stand-in art, drawn with Pillow: the six past posters the RAG corpus is
seeded with, and the poster the image model's stand-in returns when
STUDIO_REAL_IMAGES=0 or no model is reachable.

    python scripts/placeholders.py            # writes agent/media/past/*.png and img/haunted/poster-standin.png

They are flat pastel compositions in the lab's dusk palette, no text. The
real posters come from scripts/gen_halloween_art.py (Nano Banana); this
script exists so the lab runs, the corpus loads and the verify rows pass
without a single image call.
"""
from __future__ import annotations

import math
import pathlib
import random

from PIL import Image, ImageDraw, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parent.parent
PAST = ROOT / "agent" / "media" / "past"
STANDIN = ROOT / "img" / "haunted" / "poster-standin.png"
W, H = 1080, 1920

CREAM, PEACH, LAVENDER = (251, 243, 234), (246, 227, 214), (239, 217, 230)
PUMPKIN, MINT, BUTTER, LILAC, PLUM = (255, 164, 92), (185, 228, 201), (255, 210, 122), (185, 163, 232), (74, 67, 86)

POSTERS = {
    "sock-dragon": dict(seed=1, ground=(230, 205, 190), subject="dragon"),
    "fridge-heist": dict(seed=2, ground=(205, 196, 225), subject="fridge"),
    "desk-toys": dict(seed=3, ground=(214, 190, 170), subject="toys"),
    "cat-judge": dict(seed=4, ground=(220, 232, 226), subject="cat"),
    "plant-doc": dict(seed=5, ground=(228, 216, 236), subject="plant"),
    "snail-race": dict(seed=6, ground=(240, 220, 205), subject="snail"),
}


def sky(draw: ImageDraw.ImageDraw) -> None:
    for y in range(H):
        t = y / H
        c = tuple(int(CREAM[i] * (1 - t) ** 2 + PEACH[i] * 2 * t * (1 - t) + LAVENDER[i] * t ** 2) for i in range(3))
        draw.line([(0, y), (W, y)], fill=c)


def facet(draw, pts, base, light=(-0.4, -0.8)):
    """A low-poly surface: the polygon, triangulated as a fan, each triangle a
    shade of the base color by its orientation."""
    cx = sum(p[0] for p in pts) / len(pts)
    cy = sum(p[1] for p in pts) / len(pts)
    for i in range(len(pts)):
        a, b = pts[i], pts[(i + 1) % len(pts)]
        nx, ny = (a[1] + b[1]) / 2 - cy, cx - (a[0] + b[0]) / 2
        n = math.hypot(nx, ny) or 1
        k = 0.82 + 0.28 * max(0.0, (nx / n) * light[0] + (ny / n) * light[1])
        col = tuple(min(255, int(v * k)) for v in base)
        draw.polygon([a, b, (cx, cy)], fill=col)


def blob(draw, cx, cy, r, base, n=9, squash=1.0, seed=0):
    rnd = random.Random(seed)
    pts = [(cx + r * (1 + 0.08 * rnd.random()) * math.cos(2 * math.pi * i / n),
            cy + r * squash * (1 + 0.08 * rnd.random()) * math.sin(2 * math.pi * i / n)) for i in range(n)]
    facet(draw, pts, base)


def clouds(draw, seed):
    rnd = random.Random(seed)
    for _ in range(3):
        x, y = rnd.randint(120, W - 120), rnd.randint(120, 520)
        for dx, r in ((-70, 70), (0, 95), (80, 65)):
            blob(draw, x + dx, y, r, (255, 255, 255), n=8, squash=0.6, seed=rnd.randint(0, 99))


def tile(draw, ground):
    facet(draw, [(140, 1420), (940, 1360), (1000, 1640), (200, 1720)], ground)


def subject(draw, kind, seed):
    rnd = random.Random(seed)
    cx, cy = W // 2, 1180
    if kind == "dragon":
        facet(draw, [(300, 1250), (780, 1250), (820, 1460), (260, 1460)], (200, 160, 130))      # the drawer
        blob(draw, cx, cy - 20, 150, MINT, n=10, squash=0.8, seed=1)                           # the dragon, asleep
        blob(draw, cx + 150, cy - 70, 70, MINT, n=8, seed=2)
        for i in range(5):
            blob(draw, 330 + i * 110, 1300, 40, [PUMPKIN, BUTTER, LILAC][i % 3], n=7, squash=0.7, seed=i)
    elif kind == "fridge":
        facet(draw, [(360, 760), (720, 760), (720, 1500), (360, 1500)], (236, 238, 245))        # the fridge
        facet(draw, [(720, 760), (860, 700), (860, 1440), (720, 1500)], (210, 212, 226))
        for y in range(820, 1460, 10):
            draw.line([(560, y), (720, y)], fill=(255, 240, 200))                               # the light
        blob(draw, 470, 1260, 95, (120, 110, 130), n=9, seed=3)                                 # the raccoon
        blob(draw, 470, 1200, 60, (245, 240, 250), n=8, seed=4)
    elif kind == "toys":
        facet(draw, [(200, 1240), (880, 1240), (920, 1400), (160, 1400)], (190, 150, 120))      # the desk
        for i, c in enumerate([PUMPKIN, LILAC, MINT, BUTTER, PUMPKIN]):
            blob(draw, 300 + i * 120, 1180 - (i % 2) * 20, 55 + (i == 0) * 25, c, n=8, seed=i)
        blob(draw, 300, 1040, 60, BUTTER, n=12, seed=9)                                          # the lamp's glow
    elif kind == "cat":
        facet(draw, [(140, 1240), (940, 1240), (980, 1360), (100, 1360)], (240, 236, 228))      # the counter
        for i, c in enumerate([LILAC, PUMPKIN, MINT, (200, 200, 210)]):
            facet(draw, [(220 + i * 170, 1120), (340 + i * 170, 1120), (340 + i * 170, 1240), (220 + i * 170, 1240)], c)
        blob(draw, 560, 980, 110, (120, 110, 130), n=10, squash=0.9, seed=5)                    # the cat
        blob(draw, 560, 860, 75, (120, 110, 130), n=9, seed=6)
        facet(draw, [(500, 800), (520, 740), (545, 800)], (120, 110, 130))
        facet(draw, [(575, 800), (600, 740), (620, 800)], (120, 110, 130))
    elif kind == "plant":
        facet(draw, [(440, 1220), (640, 1220), (610, 1460), (470, 1460)], (205, 140, 100))      # the pot
        for i in range(6):
            a = -90 + i * 36 - 90
            blob(draw, 540 + 110 * math.cos(math.radians(a)), 1120 + 60 * math.sin(math.radians(a)), 70, MINT, n=7, squash=0.6, seed=i)
        facet(draw, [(470, 980), (610, 980), (560, 900), (520, 900)], (160, 120, 90))           # the hat
        blob(draw, 760, 1300, 40, BUTTER, n=10, seed=7)                                          # the candle
        facet(draw, [(735, 1320), (785, 1320), (785, 1470), (735, 1470)], (250, 245, 235))
    elif kind == "snail":
        facet(draw, [(100, 1360), (980, 1360), (1080, 1700), (0, 1700)], (235, 210, 190))      # the hallway
        for i in range(4):
            blob(draw, 160 + i * 250, 700 + (i % 2) * 40, 60, [PUMPKIN, MINT][i % 2], n=8, seed=i)   # lanterns
        blob(draw, 420, 1480, 100, PUMPKIN, n=10, seed=8)                                        # the snail's shell
        blob(draw, 320, 1520, 60, MINT, n=8, squash=0.6, seed=9)
        facet(draw, [(600, 1440), (800, 1440), (820, 1540), (580, 1540)], (200, 200, 215))      # the vacuum


def poster(name: str, spec: dict) -> Image.Image:
    im = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(im)
    sky(d)
    clouds(d, spec["seed"])
    tile(d, spec["ground"])
    subject(d, spec["subject"], spec["seed"])
    # a soft pumpkin glow in one corner, the season's signature
    glow = Image.new("RGB", (W, H), (0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([W - 500, H - 700, W + 200, H], fill=(70, 40, 10))
    glow = glow.filter(ImageFilter.GaussianBlur(140))
    return Image.blend(im, Image.eval(glow, lambda v: v), 0.0).convert("RGB") if False else _screen(im, glow)


def _screen(a: Image.Image, b: Image.Image) -> Image.Image:
    from PIL import ImageChops
    return ImageChops.screen(a, b)


def standin() -> Image.Image:
    im = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(im)
    sky(d)
    clouds(d, 42)
    tile(d, (226, 205, 215))
    blob(d, W // 2, 1150, 190, PUMPKIN, n=12, squash=0.8, seed=11)     # a pumpkin, the stand-in's subject
    facet(d, [(W // 2 - 18, 960), (W // 2 + 18, 960), (W // 2 + 10, 900), (W // 2 - 10, 900)], (120, 150, 90))
    for sx in (-70, 70):
        facet(d, [(W // 2 + sx - 35, 1140), (W // 2 + sx + 35, 1140), (W // 2 + sx, 1080)], BUTTER)
    facet(d, [(W // 2 - 110, 1210), (W // 2 - 60, 1250), (W // 2, 1215), (W // 2 + 60, 1250), (W // 2 + 110, 1210), (W // 2 + 100, 1270), (W // 2 - 100, 1270)], BUTTER)
    return im


def main() -> None:
    PAST.mkdir(parents=True, exist_ok=True)
    STANDIN.parent.mkdir(parents=True, exist_ok=True)
    for name, spec in POSTERS.items():
        out = PAST / f"{name}.png"
        poster(name, spec).save(out, optimize=True)
        print(f"  wrote {out.relative_to(ROOT)}")
    standin().save(STANDIN, optimize=True)
    print(f"  wrote {STANDIN.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
