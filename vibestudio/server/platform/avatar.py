"""The creator's avatar: a portrait from their own description, generated
in the background by a Gemini image model and kept under runs/media.
Optional: with no description there is no avatar, and a failed generation
leaves the default and says so."""
from __future__ import annotations

import asyncio
import os

from ..agent.platform import config
from .bus import bus
from .files import save_profile

AVATAR = config.MEDIA / "avatar.png"
AVATAR_URL = "/static/avatar.png"


def _prompt(description: str) -> str:
    return ("A friendly square avatar portrait of a video creator, described as: "
            f"{description.strip()}. Flat illustration, warm pastel palette, soft studio "
            "lighting, centered face and shoulders, plain background, no text, no logo.")


def _generate(description: str) -> bytes:
    from google import genai
    from google.genai import types as gt
    client = genai.Client(vertexai=True, project=os.environ.get("GOOGLE_CLOUD_PROJECT"),
                          location="global") if config.VERTEX else genai.Client()
    resp = client.models.generate_content(
        model=config.IMAGE_MODEL, contents=_prompt(description),
        config=gt.GenerateContentConfig(response_modalities=["IMAGE", "TEXT"]))
    for cand in resp.candidates or []:
        for part in (cand.content.parts if cand.content else []) or []:
            blob = getattr(part, "inline_data", None)
            if blob is not None and getattr(blob, "data", None):
                return blob.data
    raise RuntimeError("the model returned no image")


async def generate(description: str) -> None:
    bus.publish("avatar.started")
    try:
        data = await asyncio.to_thread(_generate, description)
        AVATAR.write_bytes(data)
        save_profile(avatar_url=f"{AVATAR_URL}?v={int(AVATAR.stat().st_mtime)}")
        bus.publish("avatar.ready", url=f"{AVATAR_URL}?v={int(AVATAR.stat().st_mtime)}")
    except Exception as e:
        bus.publish("avatar.failed", detail=f"{type(e).__name__}: {str(e)[:160]}")
