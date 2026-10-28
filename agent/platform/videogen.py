"""videogen: one script in, one Veo video out, in two calls.

    receipt = videogen.start(script)            # {"operation": ..., "prompt": ...}, at once
    status  = videogen.check(receipt["operation"])   # {"done": False} or {"done": True, "path": ..., "url": ...}

start submits the render and returns the operation name; check asks Veo about
it and writes the mp4 to disk once it exists. That split is what the render
desk needs: an agent's turn must not block on a render (agent/desk.py), and a
later process delivers the clip by id (agent/deliver.py). Every network step
retries with a configurable count and interval.

Configuration, all optional, from the environment:
    STUDIO_VEO_MODEL      veo-3.1-fast-generate-001 on Vertex, -preview on AI Studio
    STUDIO_VEO_LOCATION   region for Vertex (default us-central1)
    STUDIO_VIDEO_RETRIES  attempts per network step (default 8)
    STUDIO_VIDEO_INTERVAL seconds between attempts (default 70)
    STUDIO_VIDEO_TIMEOUT  seconds a delivery waits for one render (default 600)
    STUDIO_VIDEO_DIR      where mp4 files land (default runs/media/renders, served at /static/renders)
    STUDIO_REAL_VIDEO=0   no Veo, no cost: the render "finishes" after a few seconds; the stand-in
                          is an eight-second push-in over tonight's poster, so the clip can still be
                          played and published (no poster: no file). ffmpeg comes with the lab:
                          imageio-ffmpeg carries a static build, so a machine without one (Cloud
                          Shell) still makes the push-in; a system ffmpeg on PATH is used first.
"""
from __future__ import annotations

import os
import pathlib
import re
import time
from typing import Any

from . import config

MODEL = os.environ.get("STUDIO_VEO_MODEL") or (
    "veo-3.1-fast-generate-001" if config.VERTEX else "veo-3.1-fast-generate-preview")
LOCATION = os.environ.get("STUDIO_VEO_LOCATION", "us-central1")
ON_RETRY = None    # an app may set this to be told about retries (step, attempt, of, wait_s, detail); the lab prints
RETRIES = int(os.environ.get("STUDIO_VIDEO_RETRIES", "8"))
INTERVAL_S = float(os.environ.get("STUDIO_VIDEO_INTERVAL", "70"))
TIMEOUT_S = float(os.environ.get("STUDIO_VIDEO_TIMEOUT", "600"))
VIDEO_DIR = pathlib.Path(os.environ.get("STUDIO_VIDEO_DIR") or (config.RUNS / "media" / "renders"))
WEB_PREFIX = "/static/renders"
CLIP_MS = 8000                      # a Veo 3.1 clip is eight seconds
PREBAKED_S = 5.0                    # how long a stand-in "render" takes

NO_TEXT = "One continuous take, no on-screen text, no captions."

_client = None


class VideoError(RuntimeError):
    """Raised when every attempt failed. The message says what Veo said."""


# ── prompt ──────────────────────────────────────────────────────────────────

#: The channel's look, said once at the end of every render prompt, after the
#: shots (the script's own `style` line rides a trend; this is the house).
HALLOWEEN_LOOK = ("Cute low-poly 3D animation, faceted shapes with soft flat shading, cozy Halloween at "
                  "dusk: pumpkin orange and candlelight cream against midnight plum, paper bats, a "
                  "friendly sheet ghost, gentle camera drift, soft candle flicker. No gore, no jump scares.")


def build_prompt(script: Any) -> str:
    """The whole script as one prompt. Accepts the Script model or its dict."""
    s = script.model_dump() if hasattr(script, "model_dump") else dict(script)
    shots = [sh.get("description", "") if isinstance(sh, dict) else str(sh) for sh in s.get("shots", [])]
    parts = [f"Title: {s.get('title', '')}."]
    if s.get("description"):
        parts.append(s["description"])
    if s.get("opening_line"):
        parts.append(f"It opens with: {s['opening_line']}")
    if shots:
        parts.append("The video, in order: " + " Then ".join(sh.rstrip(".") + "." for sh in shots))
    if s.get("style"):
        parts.append(f"Look: {s['style']}.")
    parts.append(HALLOWEEN_LOOK)
    parts.append(NO_TEXT)
    return " ".join(p.strip() for p in parts if p.strip())


# ── client ──────────────────────────────────────────────────────────────────

def client():
    """Vertex via ADC when STUDIO_VERTEX=1 (Veo is served from a region, not
    the global endpoint Gemini uses), otherwise an AI Studio key."""
    global _client
    if _client is None:
        from google import genai
        if config.VERTEX:
            _client = genai.Client(vertexai=True, project=os.environ.get("GOOGLE_CLOUD_PROJECT"),
                                   location=LOCATION)
        else:
            _client = genai.Client()
    return _client


def _retry(step: str, fn, retries: int, interval_s: float):
    """Call fn() up to `retries` times, `interval_s` apart. Raises VideoError
    with the last message when every attempt failed."""
    last = ""
    for attempt in range(1, retries + 1):
        try:
            return fn()
        except Exception as e:
            global _client
            _client = None                       # a client built against a bad env stays bad
            last = f"{type(e).__name__}: {str(e)[:160]}"
            print(f"  [videogen] {step} attempt {attempt}/{retries} failed: {last}")
            if attempt < retries:
                if ON_RETRY:
                    ON_RETRY(step=f"Veo {step}", attempt=attempt, of=retries, wait_s=interval_s, detail=last)
                time.sleep(interval_s)
    raise VideoError(f"{step} failed after {retries} attempts ({last})")


# ── the two network steps ─────────────────────────────────────────────────

def start(script: Any, *, retries: int = RETRIES, interval_s: float = INTERVAL_S) -> dict:
    """Submit one render. Returns at once with the operation name; that string
    is all a later process needs to find the work again."""
    from google.genai import types as gt
    prompt = build_prompt(script) if not isinstance(script, str) else script

    def submit():
        return client().models.generate_videos(
            model=MODEL, prompt=prompt,
            config=gt.GenerateVideosConfig(
                aspect_ratio="16:9", resolution="720p", number_of_videos=1,
                negative_prompt="text, subtitles, captions, watermark, logo"))

    if not config.REAL_VIDEO:
        return {"operation": f"prebaked:{int(time.time())}", "model": "prebaked", "prompt": prompt,
                "submitted_at": time.time()}
    op = _retry("submit", submit, retries, interval_s)
    return {"operation": op.name, "model": MODEL, "prompt": prompt, "submitted_at": time.time()}


def _aspect_of_png(data: bytes) -> str:
    """"9:16" for a portrait PNG (the lab's posters), "16:9" otherwise."""
    import struct
    if data[:8] == b"\x89PNG\r\n\x1a\n" and len(data) >= 24:
        w, h = struct.unpack(">II", data[16:24])
        if h > w:
            return "9:16"
    return "16:9"


def start_from_poster(poster: str, script: Any, *, retries: int = RETRIES, interval_s: float = INTERVAL_S) -> dict:
    """Submit one render that starts from the poster: Veo's image-to-video,
    the poster as the first frame, the script as the prompt, the clip in the
    poster's aspect (a 9:16 poster, a 9:16 short). The same receipt start()
    returns, so check() delivers it the same way. This is how Post my video
    makes a clip before session 5 has rendered one: the poster comes alive."""
    from google.genai import types as gt
    prompt = build_prompt(script) if not isinstance(script, str) else script
    data = pathlib.Path(poster).read_bytes()
    aspect = _aspect_of_png(data)

    def submit():
        return client().models.generate_videos(
            model=MODEL, prompt=prompt, image=gt.Image(image_bytes=data, mime_type="image/png"),
            config=gt.GenerateVideosConfig(
                aspect_ratio=aspect, resolution="720p", number_of_videos=1,
                negative_prompt="text, subtitles, captions, watermark, logo"))

    if not config.REAL_VIDEO:
        return {"operation": f"prebaked:{int(time.time())}", "model": "prebaked", "prompt": prompt,
                "submitted_at": time.time(), "from_poster": poster, "aspect": aspect}
    op = _retry("submit", submit, retries, interval_s)
    return {"operation": op.name, "model": MODEL, "prompt": prompt, "submitted_at": time.time(), "from_poster": poster, "aspect": aspect}


def check(operation: str, *, retries: int = RETRIES, interval_s: float = INTERVAL_S) -> dict:
    """Ask Veo about one operation. {"done": False} while it renders;
    {"done": True, "path": ..., "url": ...} once the mp4 is on disk;
    {"done": True, "error": ...} when Veo refused or filtered the render."""
    if operation.startswith("prebaked:"):
        started = float(operation.split(":", 1)[1])
        if time.time() - started < PREBAKED_S:
            return {"done": False, "operation": operation}
        clip = _standin_clip(operation) or {}
        return {"done": True, "operation": operation, "path": clip.get("path"), "url": clip.get("url"),
                "prebaked": True, "duration_ms": CLIP_MS}
    from google.genai import types as gt
    op = _retry("check", lambda: client().operations.get(gt.GenerateVideosOperation(name=operation)),
                retries, interval_s)
    if not op.done:
        return {"done": False, "operation": operation}
    err = getattr(op, "error", None)
    resp = getattr(op, "response", None) or getattr(op, "result", None)
    vids = (getattr(resp, "generated_videos", None) or []) if resp else []
    if err or not vids:
        return {"done": True, "operation": operation,
                "error": str(err)[:200] if err else "the model returned no video (filtered or empty)"}
    video = vids[0].video
    data = getattr(video, "video_bytes", None)                  # Vertex hands the bytes back inline
    if not data:
        data = _retry("download", lambda: client().files.download(file=video), retries, interval_s)
    if not data:
        return {"done": True, "operation": operation, "error": "download returned nothing"}
    VIDEO_DIR.mkdir(parents=True, exist_ok=True)
    path = VIDEO_DIR / f"{_slug(operation)}.mp4"
    path.write_bytes(data)
    return {"done": True, "operation": operation, "path": str(path), "url": web_ref(path),
            "bytes": len(data), "duration_ms": CLIP_MS}


def ffmpeg_path() -> str | None:
    """ffmpeg: the system's, when PATH has one; else the static build the
    imageio-ffmpeg package carries (a dependency of the lab and of the app,
    because Cloud Shell ships without ffmpeg). None only when neither is there."""
    import shutil
    found = shutil.which("ffmpeg")
    if found:
        return found
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return None


def push_in(poster: str, out) -> pathlib.Path | None:
    """An eight-second, silent, 1280x720 push-in over a poster: the stand-in
    clip, made in a few seconds, so a night with a poster and no render still
    ends in a file that plays and publishes. None when there is no ffmpeg, no
    poster, or ffmpeg fails."""
    import subprocess
    ff = ffmpeg_path()
    if not ff or not poster or not os.path.exists(poster):
        return None
    out = pathlib.Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    frames = CLIP_MS // 40                                          # 25 fps
    cmd = [ff, "-y", "-nostdin", "-loglevel", "error", "-loop", "1", "-i", poster,
           "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
           "-filter_complex",
           "[0:v]scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,boxblur=24[bg];"
           "[0:v]scale=-2:720[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,"
           f"zoompan=z='min(zoom+0.0006,1.1)':d={frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1280x720:fps=25[v]",
           "-map", "[v]", "-map", "1:a", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac",
           "-t", str(CLIP_MS // 1000), "-shortest", str(out)]
    try:
        # -nostdin and a closed stdin: ffmpeg otherwise reads the terminal for its
        # interactive keys, and a run in the background of a shell is stopped by SIGTTIN
        subprocess.run(cmd, check=True, timeout=180, capture_output=True, stdin=subprocess.DEVNULL)
    except (subprocess.SubprocessError, OSError):
        return None
    return out if out.exists() else None


def _standin_clip(operation: str) -> dict | None:
    """STUDIO_REAL_VIDEO=0: the push-in over tonight's poster (runs/state.json,
    written by make_poster). No poster, or ffmpeg fails: None, and the stand-in
    has no file."""
    from . import state
    poster = (state.load().get("poster") or {}).get("path") or ""
    path = push_in(poster, VIDEO_DIR / f"standin_{_slug(operation)}.mp4")
    return {"path": str(path), "url": web_ref(path)} if path else None


def web_ref(path) -> str:
    """The URL the app serves a rendered file at."""
    return f"{WEB_PREFIX}/{pathlib.Path(path).name}"


def _slug(operation: str) -> str:
    tail = operation.rsplit("/", 1)[-1]
    return re.sub(r"[^A-Za-z0-9_-]+", "-", tail)[:60] + f"_{int(time.time())}"
