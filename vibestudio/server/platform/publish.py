"""Publishing: one multipart POST to the event on vibetube.dev.

    POST {platform}/api/events/{event}/videos
      title, description, duration ("m:ss"), displayName, projectId, videoFile,
      (projectId is stable per creator and room, so publishing again replaces the video)
      thumbnailFile (if the page captured one), avatarFile (if the creator has one)

Three attempts, a few seconds apart; twenty seconds when the platform says
it is still processing the project's previous upload (409). Connection errors
and any non-200 answer count as failures. After the third, the app stops and asks the
creator to confirm the event code and the platform URL; a confirmed retry
starts a fresh three.
"""
from __future__ import annotations

import asyncio
import time

import httpx

from ..agent.platform import config
from .bus import bus
from .files import profile

ATTEMPTS = 3
PAUSE_S = 4.0
PROCESSING_PAUSE_S = 20.0    # the platform answers 409 while it still processes the previous upload for the project


def _duration(ms: int | None) -> str:
    secs = round((ms or 8000) / 1000)
    return f"{secs // 60}:{secs % 60:02d}"


def _file(url: str):
    """A /static/... URL back to the file under runs/media."""
    if not url or not url.startswith("/static/"):
        return None
    path = config.MEDIA / url.split("?", 1)[0].removeprefix("/static/")   # the avatar URL carries ?v=<mtime> for the browser cache
    return path if path.exists() else None


async def publish(state, confirmed: bool = False) -> dict:
    """Runs the attempts on a thread; publishes publish.attempt per try and
    ends with publish.done or publish.needs_confirm. Returns the final record."""
    prof = profile()
    rec = state.publish
    rec.update(status="publishing", platform=prof["platform_url"], event=prof["event_code"], detail="")
    clip = _file(state.render.get("url", ""))
    if clip is None:
        rec.update(status="failed", detail="no rendered clip to publish (a prebaked run has no file)")
        bus.publish("publish.failed", detail=rec["detail"])
        return rec
    if not prof["event_code"]:
        rec.update(status="needs_confirm", detail="no event code yet", attempts=0)
        bus.publish("publish.needs_confirm", detail=rec["detail"], attempts=0)
        return rec
    poster = getattr(state, "poster", None) or {}
    thumb = (_file(poster.get("url", "")) if poster.get("url") and not poster.get("prebaked") else None) or _file(state.thumbnail_url)
    avatar = _file(prof.get("avatar_url", ""))
    url = f"{prof['platform_url']}/api/events/{prof['event_code']}/videos"
    data = {"title": state.script.get("title") or state.direction.get("title") or "Untitled",
            "description": state.script.get("description", ""),
            "duration": _duration(state.render.get("duration_ms")),
            "displayName": prof["display_name"] or "Vibe Studio creator",
            "projectId": prof["project_id"]}             # one project per creator and room: a new publish replaces the video
    last = ""
    for n in range(1, ATTEMPTS + 1):
        rec["attempts"] = n
        bus.publish("publish.attempt", n=n, of=ATTEMPTS, url=url, project=prof["project_id"])
        ok, detail, vid = await asyncio.to_thread(_post, url, data, clip, thumb, avatar)
        if ok:
            watch = f"{prof['platform_url']}/e/{prof['event_code']}" + (f"?v={vid}" if vid else "")
            rec.update(status="done", url=watch, video_id=vid, detail="")
            from .files import history_upsert
            from ..runner import studio
            if studio.state is state:
                history_upsert(studio.record())
            bus.publish("publish.done", url=watch, video_id=vid, attempts=n)
            return rec
        last = detail
        rec["detail"] = detail
        if n < ATTEMPTS:
            pause = PROCESSING_PAUSE_S if detail.startswith("409") and "processing" in detail else PAUSE_S
            bus.publish("retry", step="publish", attempt=n, of=ATTEMPTS, wait_s=pause, detail=detail)
            await asyncio.sleep(pause)
    rec.update(status="needs_confirm", detail=last)
    bus.publish("publish.needs_confirm", detail=last, attempts=ATTEMPTS, confirmed_before=confirmed)
    return rec


def _post(url: str, data: dict, clip, thumb, avatar) -> tuple[bool, str, str]:
    files = {"videoFile": (clip.name, clip.open("rb"), "video/mp4")}
    if thumb is not None:
        files["thumbnailFile"] = (thumb.name, thumb.open("rb"), "image/png")
    if avatar is not None:
        files["avatarFile"] = (avatar.name, avatar.open("rb"), "image/png")
    try:
        r = httpx.post(url, data=data, files=files, timeout=120)
    except httpx.ConnectError as e:
        return False, f"cannot reach the platform ({str(e)[:90]}); check the platform URL", ""
    except httpx.HTTPError as e:
        return False, f"{type(e).__name__}: {str(e)[:120]}", ""
    finally:
        for _, (_, fh, _) in files.items():
            fh.close()
    if r.status_code != 200:
        try:
            detail = r.json().get("detail", r.text[:120])
        except ValueError:
            detail = r.text[:120] or r.reason_phrase
        hint = "; check the event code" if r.status_code == 404 else ""
        return False, f"{r.status_code} {detail}{hint}", ""
    try:
        vid = str(r.json().get("id", ""))
    except ValueError:
        vid = ""
    return True, "", vid
