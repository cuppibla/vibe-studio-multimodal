"""Posters - Gemini's image model as a plain function, the way videogen wraps Veo.

    rec = images.generate("a sock drawer opened to reveal a tiny dragon")
    # {"status": "done", "path": ".../runs/media/posters/poster-1729..png", "url": "/static/posters/...", ...}

Two callers, two steps of the lab:
  step 2  make_poster is a TOOL on the single-prompt agent (stage0_prompt/agent.py):
          the model decides to call it, and the first run ends with a picture.
  step 6  make_poster is a NODE in the graph (agent/graph.py): the poster branch
          of the media desk, seconds long, beside the minutes-long Veo branch.

Configuration, all optional, from the environment:
    STUDIO_IMAGE_MODEL     gemini-2.5-flash-image (the same model avatar.py uses)
    STUDIO_REAL_IMAGES=0   no model call, no cost: the stand-in poster is copied instead
    STUDIO_POSTER_DIR      where PNGs land (default runs/media/posters, served at /static/posters)
"""
from __future__ import annotations

import os
import pathlib
import re
import shutil
import time

from . import config

MODEL = os.environ.get("STUDIO_IMAGE_MODEL", "gemini-2.5-flash-image")
REAL = os.environ.get("STUDIO_REAL_IMAGES", "1").lower() in ("1", "true")
POSTER_DIR = pathlib.Path(os.environ.get("STUDIO_POSTER_DIR") or (config.RUNS / "media" / "posters"))
WEB_PREFIX = "/static/posters"
STANDIN = config.ROOT / "img" / "haunted" / "poster-standin.png"
ASPECT = "9:16"                      # a VibeTube short is vertical, and so is its poster

# The look of every poster the channel draws: the lab's own cozy low-poly
# Halloween world. Tested 2026-10-18: a sheet ghost over a sock drawer, 8 s. Subject and taste are appended per call.
STYLE = ("Cute low-poly 3D render: faceted geometric shapes with soft flat shading, round friendly "
         "characters with big glossy eyes, a tiny cozy Halloween scene at dusk - a faceted "
         "jack-o'-lantern with warm candlelight, a friendly sheet ghost, paper bats, soft cobweb "
         "corners, candy corn, a big pale full moon - in pumpkin orange, candlelight cream, midnight "
         "plum, bone white, mint and lavender, soft studio light, gentle contact shadows. Vertical "
         "poster for a short video: one clear subject centered, the rest calm. Cozy, never scary. "
         "No text, no letters, no logos, no watermark.")


def poster_prompt(subject: str, visual_style: str = "") -> str:
    """The full prompt: the house style, the subject, and what Memory Bank
    knows the creator likes in a poster (may be empty)."""
    parts = [STYLE, f"Subject: {subject.strip() or 'the channel at dusk'}"]
    if visual_style.strip():
        parts.append(f"Creator's taste (from memory): {visual_style.strip()}")
    return "\n\n".join(parts)


def _client():
    from google import genai
    if config.VERTEX:
        return genai.Client(vertexai=True, project=os.environ.get("GOOGLE_CLOUD_PROJECT"), location="global")
    return genai.Client()


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:40] or "poster"


def generate(subject: str, visual_style: str = "", name: str | None = None) -> dict:
    """One poster for `subject`. Returns where it landed: status, path, url,
    prompt, and prebaked=True when the stand-in was used instead of the model."""
    POSTER_DIR.mkdir(parents=True, exist_ok=True)
    stem = f"{name or _slug(subject)}-{int(time.time())}"
    path = POSTER_DIR / f"{stem}.png"
    prompt = poster_prompt(subject, visual_style)
    if not REAL:
        return _standin(path, prompt, "STUDIO_REAL_IMAGES=0")
    try:
        data = _call(prompt)
    except Exception as e:                       # no credentials, a refused prompt, a quota: the lab goes on
        return _standin(path, prompt, f"{type(e).__name__}: {str(e)[:120]}")
    path.write_bytes(data)
    return {"status": "done", "path": str(path), "url": f"{WEB_PREFIX}/{path.name}",
            "prompt": prompt, "model": MODEL, "prebaked": False}


def _standin(path: pathlib.Path, prompt: str, why: str) -> dict:
    if STANDIN.exists():
        shutil.copyfile(STANDIN, path)
        return {"status": "done", "path": str(path), "url": f"{WEB_PREFIX}/{path.name}",
                "prompt": prompt, "model": "stand-in", "prebaked": True, "note": why}
    return {"status": "failed", "path": "", "url": "", "prompt": prompt, "model": "stand-in",
            "prebaked": True, "note": f"{why}; and no stand-in at {STANDIN}"}


def _call(prompt: str) -> bytes:
    from google.genai import types as gt
    cfg = {"response_modalities": ["IMAGE", "TEXT"]}
    try:
        cfg["image_config"] = gt.ImageConfig(aspect_ratio=ASPECT)
    except (AttributeError, TypeError):           # an older SDK: the model picks the shape
        pass
    client = _client()                           # keep a reference: a temporary Client is closed mid-request
    resp = client.models.generate_content(model=MODEL, contents=prompt,
                                          config=gt.GenerateContentConfig(**cfg))
    for cand in resp.candidates or []:
        for part in (cand.content.parts if cand.content else []) or []:
            blob = getattr(part, "inline_data", None)
            if blob is not None and getattr(blob, "data", None):
                return blob.data
    raise RuntimeError("the model returned no image")


def describe(path: str) -> str:
    """One sentence about a poster's palette, framing and mood, for Memory
    Bank. Empty when the model is unavailable or the file is a stand-in."""
    p = pathlib.Path(path)
    if not p.exists() or not REAL:
        return ""
    try:
        from google.genai import types as gt
        client = _client()
        resp = client.models.generate_content(
            model=config.MODEL,
            contents=[gt.Part.from_bytes(data=p.read_bytes(), mime_type="image/png"),
                      "In one sentence, describe this poster's palette, framing and mood so a "
                      "producer could ask for more like it. Plain text."])
        return (resp.text or "").strip()[:300]
    except Exception as e:
        print(f"  [images] describe unavailable ({str(e)[:80]})")
        return ""
