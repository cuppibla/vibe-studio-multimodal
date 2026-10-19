#!/usr/bin/env python3
"""Generate the VibeStudio Haunted Edition art with Nano Banana.

Drop this file into scripts/ of gca-americas/vibetube-studio and run it from
the repo root. It uses the same client setup as the lab's avatar generator
(vibestudio/server/platform/avatar.py): Vertex through ADC when STUDIO_VERTEX=1
in .env (the Cloud Shell default), otherwise GOOGLE_API_KEY.

    python scripts/gen_halloween_art.py --dry-run          # print every prompt, call nothing
    python scripts/gen_halloween_art.py --only hero        # one asset
    python scripts/gen_halloween_art.py --takes 3          # three takes per asset, pick by eye
    python scripts/gen_halloween_art.py --pro              # Nano Banana Pro for the hero (2K)

Every asset is generated from a reference image so the robot and the set stay
the ones in today's hero: frame 0 of img/hero.gif for the night hero, then the
night hero for everything else. Output goes to img/haunted/<name>-<take>.png,
and the prompt that produced each file is appended to img/haunted/PROMPTS.md.
"""
from __future__ import annotations

import argparse
import io
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "img" / "haunted"
HERO_GIF = ROOT / "img" / "hero.gif"

FLASH = os.environ.get("STUDIO_IMAGE_MODEL", "gemini-2.5-flash-image")   # Nano Banana
PRO = os.environ.get("STUDIO_IMAGE_MODEL_PRO", "gemini-3-pro-image-preview")  # Nano Banana Pro

STYLE = (
    "Cozy low-poly 3D render, faceted flat-shaded polygons with soft rounded forms, clean geometric "
    "facets like a stylized Blender game asset, three-quarter isometric camera, the scene standing "
    "on a floating square tile. Pastel dusk palette: cream to peach to lavender sky (#fbf3ea, #f6e3d6, "
    "#efd9e6), pastel pumpkin orange (#ffa45c), lavender (#b9a3e8), mint (#b9e4c9), butter yellow "
    "(#ffd27a), bone white (#fbf8ff), warm honey wood. Soft studio lighting, gentle contact shadows, "
    "subtle glow from the lit props, faceted clouds. No text, no letters, no logos, no watermark."
)
CHARACTER = (
    "Keep the robot from the reference image exactly: a small, friendly robot with a smooth white "
    "faceted body, a round head with a dark visor and two glowing eyes, a tiny antenna, short arms, "
    "seated at its desk. Same proportions, same materials, same camera. Only the lighting, the props "
    "and the costume change."
)

POSTER = (
    "Vertical poster for a short video, one clear subject centered, calm pastel dusk background, same "
    "low-poly world as the reference: "
)

MASCOT = (
    "Square portrait, the robot alone on a small floating tile, plain cream-to-lavender background, "
    "witch hat on, "
)

# name -> (aspect ratio, reference, subject prompt)
ASSETS: dict[str, tuple[str, str, str]] = {
    "hero": ("16:9", "today", (
        "Re-dress this exact scene for a cozy Halloween at dusk, keeping its cream daylight feel. The "
        "lamp is now a carved jack-o'-lantern on the same stand, softly lit from inside in butter "
        "yellow. The robot wears a slightly floppy lavender witch hat with a pastel orange band. The "
        "three jars on the shelf are candy jars in butter yellow, pastel orange and mint, glowing "
        "gently. The nine monitors show soft peach, lavender and mint. A small white low-poly ghost "
        "floats beside the monitor wall. Two small pastel pumpkins sit on the floor tile. The faceted "
        "clouds stay; add a few small muted bats in the sky and a thin cobweb in one upper corner. "
        "Keep the desk, keyboard, chair, shelf and orange cable where they are.")),
    "hero-night": ("16:9", "hero", (
        "The same scene after dark: a soft plum night sky with a faceted crescent moon and a few "
        "stars, the jack-o'-lantern and the candy jars now the main light sources, the monitors "
        "glowing, the clouds dim lilac, a little fog along the base of the tile. Keep it gentle and "
        "cozy, not spooky.")),
    "share": ("16:9", "hero", (
        "A wider framing of the same dusk studio with calm empty sky on the left third, the robot and "
        "the jack-o'-lantern on the right two thirds, clouds high right. Composition for a social "
        "preview card; nothing in the left third.")),
    "m02-poster": ("1:1", "hero", MASCOT + "holding up a small freshly painted poster, a paint brush in the other hand."),
    "m03-structures": ("1:1", "hero", MASCOT + "stirring a bubbling mint cauldron beside a small iron gate, a coil of rope at its feet."),
    "m04-seance": ("1:1", "hero", MASCOT + "seated in a circle of candles with four small cards laid out, holding one up."),
    "m05-ghost-whispers": ("1:1", "hero", MASCOT + "reading a book while a small white ghost reads over its shoulder, a stack of posters at its side."),
    "m06-media-desk": ("1:1", "hero", MASCOT + "at a candle-lit desk holding a film clapperboard, a small poster drying on a line."),
    "m07-release": ("1:1", "hero", MASCOT + "opening a small belfry door as a few bats fly out into a dawn sky."),
    # R1: six "past posters" that seed the RAG corpus (step 5b), one per backlog idea
    "r1-sock-dragon": ("9:16", "hero", POSTER + "a sock drawer opened to reveal a small sleeping dragon on a hoard of socks."),
    "r1-fridge-heist": ("9:16", "hero", POSTER + "a fridge at midnight, its door ajar, light spilling, a tiny masked raccoon mid-heist."),
    "r1-desk-toys": ("9:16", "hero", POSTER + "desk toys come alive after midnight, a wind-up pumpkin leading them."),
    "r1-cat-judge": ("9:16", "hero", POSTER + "a cat on a kitchen counter judging a row of gadgets, one a jack-o'-lantern."),
    "r1-plant-doc": ("9:16", "hero", POSTER + "a houseplant in a tiny explorer hat, filmed like a survival documentary, a candle beside it."),
    "r1-snail-race": ("9:16", "hero", POSTER + "a snail racing a robot vacuum down a hallway lit by paper lanterns."),
}


def load_env() -> None:
    """The lab's .env, the way agent/platform/config.py reads it."""
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text().splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())


def client():
    from google import genai
    vertex = os.environ.get("STUDIO_VERTEX", "").lower() in ("1", "true")
    if vertex:
        return genai.Client(vertexai=True, project=os.environ.get("GOOGLE_CLOUD_PROJECT"), location="global")
    return genai.Client()   # GOOGLE_API_KEY


def reference(name: str, takes: dict[str, Path]):
    from PIL import Image
    if name == "today":
        im = Image.open(HERO_GIF)
        im.seek(0)
        return im.convert("RGB")
    if name in takes:
        return Image.open(takes[name]).convert("RGB")
    picked = sorted(OUT.glob(f"{name}-*.png"))
    if not picked:
        sys.exit(f"{name} has no take yet: run --only {name} first, or pass a picked file as img/haunted/{name}-1.png")
    return Image.open(picked[0]).convert("RGB")


def generate(cl, model: str, prompt: str, ref, aspect: str, pro: bool) -> bytes:
    from google.genai import types as gt
    cfg = dict(response_modalities=["IMAGE"], image_config=gt.ImageConfig(aspect_ratio=aspect))
    if pro:
        cfg["image_config"] = gt.ImageConfig(aspect_ratio=aspect, image_size="2K")
    resp = cl.models.generate_content(model=model, contents=[prompt, ref], config=gt.GenerateContentConfig(**cfg))
    for cand in resp.candidates or []:
        for part in (cand.content.parts if cand.content else []) or []:
            blob = getattr(part, "inline_data", None)
            if blob is not None and getattr(blob, "data", None):
                return blob.data
    raise RuntimeError("the model returned no image")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", nargs="*", help="asset names (default: all, in order)")
    ap.add_argument("--takes", type=int, default=2, help="takes per asset")
    ap.add_argument("--pro", action="store_true", help="use Nano Banana Pro at 2K for the hero")
    ap.add_argument("--dry-run", action="store_true", help="print the prompts and stop")
    a = ap.parse_args()

    load_env()
    names = a.only or list(ASSETS)
    unknown = [n for n in names if n not in ASSETS]
    if unknown:
        sys.exit(f"unknown asset(s): {', '.join(unknown)}; choose from {', '.join(ASSETS)}")

    OUT.mkdir(parents=True, exist_ok=True)
    log = OUT / "PROMPTS.md"
    takes: dict[str, Path] = {}
    cl = None if a.dry_run else client()

    for name in names:
        aspect, ref_name, subject = ASSETS[name]
        prompt = f"{STYLE}\n\n{CHARACTER}\n\n{subject}"
        model = PRO if (a.pro and name == "hero") else FLASH
        print(f"\n== {name}  ({aspect}, {model}, ref: {ref_name})")
        if a.dry_run:
            print(prompt)
            continue
        ref = reference(ref_name, takes)
        for t in range(1, a.takes + 1):
            path = OUT / f"{name}-{t}.png"
            data = generate(cl, model, prompt, ref, aspect, a.pro and name == "hero")
            path.write_bytes(data)
            takes.setdefault(name, path)
            with log.open("a") as f:
                f.write(f"\n## {path.name}\nmodel: {model} · aspect: {aspect} · reference: {ref_name}\n\n{prompt}\n")
            print(f"   wrote {path.relative_to(ROOT)}")

    if not a.dry_run:
        print(f"\nDone. Pick one take per asset, rename it to <name>.png, and record the pick in {log.relative_to(ROOT)}.")


if __name__ == "__main__":
    main()
