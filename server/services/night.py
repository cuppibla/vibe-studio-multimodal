"""Tonight's night, as far as it has got: what the student has made so far
that can go on the wall, and the one request that puts it there.

The lab's last step publishes from VibeStudio on Cloud Run (session 7b). But
there is something postable long before that: a poster from session 2, a
clip from session 5. This module reads them back from where the lab leaves
them and nothing else; it never calls a model.

    night()                 -> {"poster": ..., "clip": ..., "title": ..., "description": ...}
    push_in(poster_path)    -> path   an eight-second push-in over the poster, by ffmpeg
    profile(**overrides)    -> the room, the name, the platform, the project id (.env, then runs/post.json)
    post(...)               -> the multipart POST, three attempts; the record lands in runs/post.json
    room(code) · video(code, id) · thumbnail_matches(thumb_url, poster_path)

Where things come from, in order:

    poster    runs/state.json["poster"] (the graph's make_poster node, 5b on) when its
              file exists, else the newest PNG under runs/media/posters (session 2's tool
              and the node both land there). A stand-in poster is recognised by its bytes
              and is never uploaded as a thumbnail - the same rule the app follows.
    clip      runs/state.json["render"] when delivered and on disk (session 5), else the
              newest mp4 under runs/media/renders that this module did not make itself.
              With no clip at all, post() makes a push-in over the poster (post-*.mp4),
              so the first poster can be on the wall before the first render.
    title     script_title in the newest graph session's state (5+), else its direction,
              else the subject the session-2 agent gave make_poster, else the poster's name.
"""
from __future__ import annotations

import hashlib
import json
import os
import pathlib
import re
import shutil
import subprocess
import time
from typing import Any

from agent.platform import config, drive

ROOT = config.ROOT
RUNS = config.RUNS
POSTERS = pathlib.Path(os.environ.get("STUDIO_POSTER_DIR") or (RUNS / "media" / "posters"))
RENDERS = pathlib.Path(os.environ.get("STUDIO_VIDEO_DIR") or (RUNS / "media" / "renders"))
STANDIN_POSTER = ROOT / "img" / "haunted" / "poster-standin.png"
RECORD = RUNS / "post.json"                 # the last post: what went out, what came back
PUSH_IN_PREFIX = "post-"                    # the clips this module makes, never counted as "a clip you made"
CLIP_MS = 8000
ATTEMPTS = 3
PAUSE_S = 4.0
PROCESSING_PAUSE_S = 20.0                   # VibeTube answers 409 while it still processes the previous upload

# the sandbox apps whose sessions can hold a title or a poster, newest-first wins
GRAPH_APPS = ("stage6_video", "stage4_memory", "stage5_rag", "stage3_router")
SOLO_APP = "stage0_prompt"


# ── small readers ───────────────────────────────────────────────────────────

def _json(path: pathlib.Path) -> dict:
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return {}


def _sha(path: pathlib.Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 16), b""):
            h.update(chunk)
    return h.hexdigest()


_standin_sha: str | None = None


def is_standin_poster(path: pathlib.Path) -> bool:
    """The stand-in is a copy of img/haunted/poster-standin.png; its bytes say so."""
    global _standin_sha
    if not STANDIN_POSTER.exists():
        return False
    if _standin_sha is None:
        _standin_sha = _sha(STANDIN_POSTER)
    try:
        return path.stat().st_size == STANDIN_POSTER.stat().st_size and _sha(path) == _standin_sha
    except OSError:
        return False


def _newest(folder: pathlib.Path, pattern: str, skip=lambda p: False) -> pathlib.Path | None:
    try:
        files = [p for p in folder.glob(pattern) if p.is_file() and not skip(p)]
    except OSError:
        return None
    return max(files, key=lambda p: p.stat().st_mtime) if files else None


def _web(path: pathlib.Path) -> str:
    """The URL the lab server serves a file under runs/media at."""
    try:
        rel = path.resolve().relative_to((RUNS / "media").resolve())
    except ValueError:
        return ""
    return "/static/" + rel.as_posix()


# ── the session store: a title, a subject ───────────────────────────────────

async def _newest_session(app: str):
    """The newest session of one sandbox app across every user, or None."""
    svc = drive.svc()
    best = None
    for user in drive.users(app):
        try:
            resp = await svc.list_sessions(app_name=app, user_id=user)
        except Exception:
            continue
        for meta in resp.sessions:
            t = getattr(meta, "last_update_time", 0) or 0
            if best is None or t > best[0]:
                best = (t, user, meta.id)
    if best is None:
        return None
    try:
        return await svc.get_session(app_name=app, user_id=best[1], session_id=best[2])
    except Exception:
        return None


def _node_name(ev) -> str | None:
    info = getattr(ev, "node_info", None)
    path = getattr(info, "path", None) if info is not None else None
    return path.rsplit("/", 1)[-1].split("@")[0] if path else None


async def words() -> dict:
    """A title and a description for the card, from the newest run that has
    one: the graph sessions first (the scripter's title, the direction), then
    session 2's make_poster subject. Each value says where it came from."""
    out = {"title": "", "description": "", "source": ""}
    for app in GRAPH_APPS:
        sess = await _newest_session(app)
        if sess is None:
            continue
        st = dict(getattr(sess, "state", None) or {})
        title = (st.get("script_title") or "").strip()
        description = ""
        for ev in reversed(list(getattr(sess, "events", None) or [])):
            node = _node_name(ev)
            o = getattr(ev, "output", None)
            if node in ("script_ready", "scripter") and isinstance(o, dict) and o.get("description"):
                description = str(o["description"]).strip()
                if not title:
                    title = str(o.get("title") or "").strip()
                break
        if title:
            out.update(title=title, description=description, source=f"{app} · the script")
            return out
        direction = (st.get("direction") or "").strip()
        if direction:
            out.update(title=direction, source=f"{app} · the direction")
            return out
    sess = await _newest_session(SOLO_APP)
    if sess is not None:
        events = list(getattr(sess, "events", None) or [])
        # the agent's reply names the video ("### Video: …", "**Title:** …"); the
        # subject it gave make_poster is a prompt, and only a fallback
        for ev in reversed(events):
            if getattr(ev, "author", "") == "user":
                continue
            msg = getattr(ev, "content", None)
            text = "\n".join(p.text for p in (getattr(msg, "parts", None) or []) if getattr(p, "text", None))
            named = title_from_reply(text)
            if named:
                out.update(title=named, source=f"{SOLO_APP} · the agent's reply")
                return out
        for ev in reversed(events):
            for f in ev.get_function_calls() or []:
                if f.name == "make_poster" and (f.args or {}).get("subject"):
                    subject = re.split(r",| - | – |;", str(f.args["subject"]).strip())[0].strip().rstrip(".")
                    out.update(title=subject[:60].capitalize(), source=f"{SOLO_APP} · the poster's subject")
                    return out
    return out


def title_from_reply(text: str) -> str:
    """The video's title as the session-2 agent wrote it, when it did: a
    "Video:" or "Title:" line (heading, bold, or plain), else a short heading."""
    for line in text.splitlines():
        m = re.match(r"^\s*(?:#+\s*|\*\*)?\s*(?:video\s+title|title|video)\s*:?\s*\*{0,2}\s*:?\s*(.+?)\s*\**\s*$", line, re.I)
        if m:
            t = m.group(1).strip().strip("*\"“”'").strip()
            if 3 <= len(t) <= 80:
                return t
    for line in text.splitlines():
        m = re.match(r"^\s*#{1,4}\s+(.+?)\s*$", line)
        if m:
            t = m.group(1).strip().strip("*\"“”'").strip()
            if 3 <= len(t) <= 60 and not t.lower().startswith(("shot", "the plan", "the direction")):
                return t
    return ""


# ── the poster and the clip ─────────────────────────────────────────────────

def poster() -> dict | None:
    """The poster that would be the thumbnail, or None when nothing was drawn yet."""
    st = _json(config.STATE)
    rec = st.get("poster") or {}
    p = pathlib.Path(rec["path"]) if rec.get("path") else None
    if p is not None and p.exists():
        return {"path": str(p), "url": rec.get("url") or _web(p), "prebaked": bool(rec.get("prebaked")) or is_standin_poster(p),
                "at": p.stat().st_mtime, "source": "runs/state.json · the graph's make_poster node"}
    p = _newest(POSTERS, "*.png")
    if p is None:
        return None
    return {"path": str(p), "url": _web(p), "prebaked": is_standin_poster(p), "at": p.stat().st_mtime,
            "source": f"runs/media/posters · {'session 2, make_poster' if p.name.startswith('solo') else 'the newest poster drawn'}"}


def clip() -> dict | None:
    """The clip that would be the video, or None when post() should make one."""
    st = _json(config.STATE)
    rec = st.get("render") or {}
    p = pathlib.Path(rec["path"]) if rec.get("path") else None
    if rec.get("status") == "done" and p is not None and p.exists():
        return {"path": str(p), "url": rec.get("url") or _web(p), "prebaked": bool(rec.get("prebaked")),
                "duration_ms": rec.get("duration_ms") or CLIP_MS, "at": p.stat().st_mtime,
                "source": "runs/state.json · delivered in session 5"}
    p = _newest(RENDERS, "*.mp4", skip=lambda f: f.name.startswith(PUSH_IN_PREFIX))
    if p is None:
        return None
    return {"path": str(p), "url": _web(p), "prebaked": p.name.startswith("standin_"), "duration_ms": CLIP_MS,
            "at": p.stat().st_mtime, "source": "runs/media/renders · the newest clip"}


async def night() -> dict:
    """Everything the panel shows before the button is pressed."""
    w = await words()
    po = poster()
    cl = clip()
    if not w["title"] and po:
        stem = re.sub(r"-\d{9,}$", "", pathlib.Path(po["path"]).stem)
        named = stem.replace("-", " ").strip().capitalize() if stem not in ("solo", "poster") else ""
        w.update(title=named or "Tonight's poster", source="the poster's file name" if named else "default")
    return {"poster": po, "clip": cl, "title": w["title"], "description": w["description"], "words_source": w["source"],
            "ffmpeg": bool(shutil.which("ffmpeg")), "real_video": config.REAL_VIDEO}


# ── the push-in: a clip from a poster, when there is no clip yet ────────────

def push_in(poster_path: str, out: pathlib.Path | None = None) -> pathlib.Path:
    """An eight-second, silent, 1280x720 push-in over the poster - the same
    stand-in videogen makes when STUDIO_REAL_VIDEO=0 - so a night that has a
    poster and no render yet still has a video to post. Raises if ffmpeg is
    missing or fails."""
    ff = shutil.which("ffmpeg")
    if not ff:
        raise RuntimeError("ffmpeg is not on PATH (Cloud Shell has it); no clip to post until session 5 renders one")
    RENDERS.mkdir(parents=True, exist_ok=True)
    out = out or RENDERS / f"{PUSH_IN_PREFIX}{int(time.time())}.mp4"
    frames = CLIP_MS // 40                                          # 25 fps
    cmd = [ff, "-y", "-loglevel", "error", "-loop", "1", "-i", poster_path,
           "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
           "-filter_complex",
           "[0:v]scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,boxblur=24[bg];"
           "[0:v]scale=-2:720[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,"
           f"zoompan=z='min(zoom+0.0006,1.1)':d={frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1280x720:fps=25[v]",
           "-map", "[v]", "-map", "1:a", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac",
           "-t", str(CLIP_MS // 1000), "-shortest", str(out)]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    if r.returncode != 0 or not out.exists():
        raise RuntimeError(f"ffmpeg could not make the push-in: {(r.stderr or '').strip()[:200]}")
    return out


# ── the room and the profile ────────────────────────────────────────────────

def profile(**overrides: str | None) -> dict:
    """Who posts where: .env (VIBETUBE_*), then what the last post used
    (runs/post.json), then what the caller typed. The project id is the Google
    Cloud project, as the app does it: one video per project and room."""
    rec = _json(RECORD)
    prof = {"platform_url": os.environ.get("VIBETUBE_URL") or "https://vibetube.dev",
            "event_code": rec.get("event_code") or os.environ.get("VIBETUBE_EVENT", ""),
            "display_name": rec.get("display_name") or os.environ.get("VIBETUBE_NAME", ""),
            "project_id": os.environ.get("VIBETUBE_PROJECT") or os.environ.get("STUDIO_GCP_PROJECT") or os.environ.get("GOOGLE_CLOUD_PROJECT", "")}
    for k, v in overrides.items():
        if k in prof and isinstance(v, str) and v.strip():
            prof[k] = v.strip()
    prof["platform_url"] = prof["platform_url"].rstrip("/")
    if not prof["project_id"]:
        prof["project_id"] = re.sub(r"[^a-z0-9]+", "-", f"{prof['display_name'] or 'creator'}-{prof['event_code'] or 'room'}".lower()).strip("-")
    return prof


def room(code: str, platform: str = "https://vibetube.dev") -> dict:
    """Is there a room with this code, and is its upload window open."""
    import httpx
    out = {"code": code, "name": "", "open": False, "state": "", "reason": "", "url": f"{platform}/e/{code}"}
    if not code:
        return out
    try:
        r = httpx.get(f"{platform}/api/events/{code}", timeout=10)
    except Exception as e:
        out.update(state="unreachable", reason=str(e)[:100])
        return out
    if r.status_code != 200:
        out.update(state=str(r.status_code), reason="no room with this code; codes are case-sensitive" if r.status_code == 404 else r.text[:100])
        return out
    ev = r.json()
    out.update(name=ev.get("name", ""), open=bool(ev.get("uploadOpen")), state=ev.get("uploadState") or "", reason=ev.get("reason") or "")
    return out


def video(code: str, video_id: str, platform: str = "https://vibetube.dev") -> dict | None:
    """The card VibeTube lists under this id in this room, or None."""
    import httpx
    if not code or not video_id:
        return None
    try:
        rows = httpx.get(f"{platform}/api/events/{code}/videos", timeout=15).json()
    except Exception:
        return None
    rows = rows if isinstance(rows, list) else rows.get("videos") or []
    v = next((row for row in rows if str(row.get("id")) == str(video_id)), None)
    if not v:
        return None
    thumb = v.get("thumbnailUrl") or ""
    if thumb.startswith("/"):
        thumb = platform + thumb
    return {"id": str(video_id), "status": v.get("status", ""), "title": v.get("title", ""), "channel": v.get("channelName", ""),
            "thumbnail_url": thumb, "watch_url": f"{platform}/e/{code}?v={video_id}", "project_id": v.get("projectId", "")}


_match_cache: dict[tuple, bool] = {}


def thumbnail_matches(thumb_url: str, poster_path: str) -> bool | None:
    """Are the bytes on VibeTube the poster's bytes? None when it cannot be
    told. Remembered per (thumbnail URL, poster file), so a page that asks
    every few seconds downloads the thumbnail once."""
    import httpx
    try:
        p = pathlib.Path(poster_path)
        key = (thumb_url, str(p), p.stat().st_mtime_ns)
        if key in _match_cache:
            return _match_cache[key]
        a = httpx.get(thumb_url, timeout=20, follow_redirects=True).content
        same = hashlib.sha256(a).hexdigest() == _sha(p)
        if len(_match_cache) > 64:
            _match_cache.clear()
        _match_cache[key] = same
        return same
    except Exception:
        return None


# ── the request ─────────────────────────────────────────────────────────────

def _rel(path: str | None) -> str:
    """A path under the repo, said from the repo."""
    if not path:
        return ""
    try:
        return str(pathlib.Path(path).resolve().relative_to(ROOT))
    except ValueError:
        return path


def _duration(ms: int | None) -> str:
    secs = round((ms or CLIP_MS) / 1000)
    return f"{secs // 60}:{secs % 60:02d}"


def _write(rec: dict) -> dict:
    RUNS.mkdir(exist_ok=True)
    RECORD.write_text(json.dumps(rec, indent=2, ensure_ascii=False))
    return rec


def post(*, title: str, description: str, clip_path: str, poster_path: str | None, prof: dict,
         duration_ms: int | None = None, say=print, attempts: int = ATTEMPTS) -> dict:
    """One multipart POST to the room - the request the app makes in session
    7b, sent from here. Three attempts; a 409 "still processing" waits longer.
    The record (status, video id, watch URL, what was sent) is written to
    runs/post.json before, during and after."""
    import httpx
    url = f"{prof['platform_url']}/api/events/{prof['event_code']}/videos"
    data = {"title": title or "Untitled", "description": description or "", "duration": _duration(duration_ms),
            "displayName": prof["display_name"] or "Vibe Studio creator", "projectId": prof["project_id"]}
    rec = {"status": "posting", "at": time.time(), "title": data["title"], "description": data["description"],
           "event_code": prof["event_code"], "display_name": data["displayName"], "platform_url": prof["platform_url"],
           "project_id": prof["project_id"], "clip": clip_path, "poster": poster_path or "", "attempts": 0,
           "video_id": "", "url": "", "detail": ""}
    _write(rec)
    say(f"── POST {url} ──")
    say(f"  title        {data['title']}")
    say(f"  displayName  {data['displayName']} · projectId {data['projectId']}")
    say(f"  videoFile    {_rel(clip_path)}")
    say(f"  thumbnailFile {_rel(poster_path)}" if poster_path else "  thumbnailFile (none: a stand-in poster is never uploaded)")
    last = ""
    for n in range(1, attempts + 1):
        rec["attempts"] = n
        _write(rec)
        files: dict = {"videoFile": (pathlib.Path(clip_path).name, open(clip_path, "rb"), "video/mp4")}
        if poster_path:
            files["thumbnailFile"] = (pathlib.Path(poster_path).name, open(poster_path, "rb"), "image/png")
        try:
            r = httpx.post(url, data=data, files=files, timeout=120)
        except httpx.ConnectError as e:
            ok, detail, vid = False, f"cannot reach the platform ({str(e)[:90]}); check the platform URL", ""
        except httpx.HTTPError as e:
            ok, detail, vid = False, f"{type(e).__name__}: {str(e)[:120]}", ""
        else:
            if r.status_code != 200:
                try:
                    detail = r.json().get("detail", r.text[:120])
                except ValueError:
                    detail = r.text[:120] or r.reason_phrase
                ok, vid = False, ""
                detail = f"{r.status_code} {detail}" + ("; check the event code" if r.status_code == 404 else "")
            else:
                try:
                    vid = str(r.json().get("id", ""))
                except ValueError:
                    vid = ""
                ok, detail = True, ""
        finally:
            for _, (_, fh, _) in files.items():
                fh.close()
        if ok:
            watch = f"{prof['platform_url']}/e/{prof['event_code']}" + (f"?v={vid}" if vid else "")
            rec.update(status="done", video_id=vid, url=watch, detail="", done_at=time.time())
            say(f"  200 · video id {vid or '(none)'} · attempt {n}")
            say(f"── on the wall · {watch} ──")
            say("  VibeTube processes the file for a minute or three; the card shows your poster as its thumbnail once it is ready.")
            return _write(rec)
        last = detail
        rec["detail"] = detail
        say(f"  attempt {n} of {attempts}: {detail}")
        if n < attempts:
            pause = PROCESSING_PAUSE_S if detail.startswith("409") and "processing" in detail else PAUSE_S
            say(f"  waiting {int(pause)}s")
            time.sleep(pause)
    rec.update(status="failed", detail=last)
    say(f"── not posted: {last} ──")
    return _write(rec)


def record() -> dict:
    """The last post, as runs/post.json keeps it."""
    return _json(RECORD)


def status_for(rec: dict, po: dict | None) -> dict[str, Any]:
    """What VibeTube says about the last post: the room now, the card, the
    thumbnail check. Network, so not for every snapshot."""
    out: dict[str, Any] = {"room": None, "video": None, "thumbnail_match": None}
    platform = rec.get("platform_url") or "https://vibetube.dev"
    code = rec.get("event_code") or ""
    if code:
        out["room"] = room(code, platform)
    vid = rec.get("video_id")
    if code and vid:
        out["video"] = video(code, vid, platform)
        thumb = (out["video"] or {}).get("thumbnail_url")
        sent = rec.get("poster") or ""
        if thumb and sent and os.path.exists(sent):
            out["thumbnail_match"] = thumbnail_matches(thumb, sent)
    return out
