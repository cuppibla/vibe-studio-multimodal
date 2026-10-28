"""Tonight's night, as far as it has got: what the student has made so far
that can go on the wall, and the way it gets there - through VibeStudio.

The lab's last step publishes from VibeStudio on Cloud Run (session 7b), and
setup now deploys that app in the background, so it is live from session 1
or 2. There is something postable long before session 7: a poster from
session 2, a clip from session 5. This module reads them back from where the
lab leaves them, hands them to the app as a finished night (the app's
POST /api/night/import), and presses publish there: the app does the one
request to the room, exactly as 7b teaches. Nothing here calls a model.

    night()                 -> {"poster": ..., "clip": ..., "title": ..., "description": ...}
    push_in(poster_path)    -> path   an eight-second push-in over the poster, by ffmpeg
    profile(**overrides)    -> the room, the name, the platform, the project id (.env, then runs/post.json)
    studio()                -> where the app is: runs/deploy.json, and whether it answers
    hand_over(app, ...)     -> the night into the app
    press_publish(app, ...) -> the app's publish, followed until it is done; the record lands in runs/post.json
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
DEPLOY_RECORD = RUNS / "deploy.json"        # where the app is (vibestudio/deploy.py writes it)
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
    """A title, a description and the shots for the card and for a render,
    from the newest run that has them: the graph sessions first (the
    scripter's title and shots, the direction), then session 2's reply (the
    title it named, the three shots it described) and its make_poster
    subject. Each value says where it came from."""
    out = {"title": "", "description": "", "shots": [], "source": ""}
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
                out["shots"] = [str(sh.get("description", "") if isinstance(sh, dict) else sh).strip() for sh in (o.get("shots") or [])][:3]
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
                out.update(title=named, shots=shots_from_reply(text), source=f"{SOLO_APP} · the agent's reply")
                return out
        for ev in reversed(events):
            for f in ev.get_function_calls() or []:
                if f.name == "make_poster" and (f.args or {}).get("subject"):
                    subject = re.split(r",| - | – |;", str(f.args["subject"]).strip())[0].strip().rstrip(".")
                    out.update(title=subject[:60].capitalize(), source=f"{SOLO_APP} · the poster's subject")
                    return out
    return out


async def last_idea() -> str:
    """The idea the student gave the session-2 agent, as the default for an
    unattended night; "" when there was none."""
    sess = await _newest_session(SOLO_APP)
    if sess is None:
        return ""
    for ev in reversed(list(getattr(sess, "events", None) or [])):
        if getattr(ev, "author", "") != "user":
            continue
        msg = getattr(ev, "content", None)
        text = " ".join(p.text for p in (getattr(msg, "parts", None) or []) if getattr(p, "text", None)).strip()
        if text:
            return text[:300]
    return ""


def shots_from_reply(text: str) -> list[str]:
    """The shots as the session-2 agent described them ("**Shot 1:** …"), up
    to three, for the render's prompt."""
    shots: list[str] = []
    for line in text.splitlines():
        m = re.match(r"^\s*(?:[-*•]\s*)?\**\s*shot\s*\d+\s*\**\s*[:.\-–]\s*\**\s*(.+?)\s*\**\s*$", line, re.I)
        if m and len(m.group(1)) > 8:
            shots.append(m.group(1).strip())
    return shots[:3]


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
    idea = await last_idea()
    po = poster()
    cl = clip()
    if not w["title"] and po:
        stem = re.sub(r"-\d{9,}$", "", pathlib.Path(po["path"]).stem)
        named = stem.replace("-", " ").strip().capitalize() if stem not in ("solo", "poster") else ""
        w.update(title=named or "Tonight's poster", source="the poster's file name" if named else "default")
    from agent.platform import videogen
    return {"poster": po, "clip": cl, "title": w["title"], "description": w["description"], "shots": w["shots"], "words_source": w["source"],
            "idea": idea, "ffmpeg": bool(videogen.ffmpeg_path()), "real_video": config.REAL_VIDEO, "veo_model": videogen.MODEL}


# ── the push-in: a clip from a poster, when there is no clip yet ────────────

def push_in(poster_path: str, out: pathlib.Path | None = None) -> pathlib.Path:
    """An eight-second, silent, 1280x720 push-in over the poster - the same
    stand-in videogen makes when STUDIO_REAL_VIDEO=0 - so a night that has a
    poster and no render yet still has a video to post. ffmpeg comes with the
    lab (imageio-ffmpeg), so this works on a machine without one; raises when
    even that is missing or ffmpeg fails."""
    from agent.platform import videogen
    RENDERS.mkdir(parents=True, exist_ok=True)
    out = out or RENDERS / f"{PUSH_IN_PREFIX}{int(time.time())}.mp4"
    made = videogen.push_in(poster_path, out)
    if made is None:
        raise RuntimeError("could not make the push-in here (no ffmpeg, not even the bundled one); the studio makes it instead")
    return made


def render_from_poster(poster_path: str, *, title: str, description: str, shots: list[str], say=print,
                       timeout_s: float = 420, poll_s: float = 15) -> tuple[str, int | None]:
    """Tonight's clip, rendered by Veo from the poster: the poster is the first
    frame, the title and the shots the prompt - the render step of the
    pipeline, before the pipeline exists. Polls Veo the way agent/deliver.py
    does, a line per check, and returns the clip's path and duration. Raises
    when Veo refuses, errs out, or runs past the timeout; the caller then
    makes the push-in instead."""
    from agent.platform import videogen
    script = {"title": title, "description": description, "shots": shots or [f"{title}: the scene of the poster comes alive, one slow camera move"]}
    rec = videogen.start_from_poster(poster_path, script, retries=3, interval_s=20)
    say(f"  {rec.get('model')} · {rec.get('aspect', '')} · from {_rel(poster_path)}")
    say(f"  prompt: {rec.get('prompt', '')[:160]}…")
    say(f"  operation {rec['operation'][-40:]} · a minute or three; this line is the receipt, as in session 5")
    t0 = time.time()
    n = 0
    st: dict = {"done": False}
    while time.time() - t0 < timeout_s:
        time.sleep(poll_s)
        n += 1
        st = videogen.check(rec["operation"], retries=3, interval_s=20)
        if st.get("done"):
            break
        say(f"  check {n}: not yet · {int(time.time() - t0)}s")
    if not st.get("done"):
        raise RuntimeError(f"Veo has not finished after {int(timeout_s)}s")
    if st.get("error"):
        raise RuntimeError(f"Veo did not render it: {st['error']}")
    if not st.get("path"):
        raise RuntimeError("Veo returned no file")
    say(f"  clip ready · {_rel(st['path'])} · {int(time.time() - t0)}s")
    return st["path"], st.get("duration_ms")


def run_night(app: str, idea: str, prof: dict, *, say=print, timeout_s: float = 1200, poll_s: float = 3) -> dict:
    """One idea in, the card on the wall out: the app runs the whole night
    (POST /api/night/auto - the same graph and Runner as a night run by hand,
    the gate answered with its first direction, the publish pressed when the
    night is released) and this follows it from here, a line per step, until
    the card is on the wall. The record is runs/post.json."""
    import httpx
    rec = {"status": "posting", "at": time.time(), "app_url": app, "title": "", "idea": idea, "event_code": prof["event_code"],
           "display_name": prof["display_name"], "platform_url": prof["platform_url"], "project_id": prof["project_id"],
           "clip": "", "poster": "", "attempts": 0, "video_id": "", "url": "", "detail": "", "night": "app"}
    _write(rec)
    say(f"── the whole night, in VibeStudio · {app} ──")
    say(f"  idea     {idea or '(none: the graph picks from the trends and the backlog)'}")
    say(f"  room     {prof['event_code']} · as {prof['display_name'] or 'Vibe Studio creator'}")
    try:
        with httpx.Client(timeout=30, follow_redirects=True) as c:
            r = c.post(f"{app}/api/night/auto", json={"idea": idea, "publish": True, "event_code": prof["event_code"], "display_name": prof["display_name"]})
            if r.status_code == 404:
                raise RuntimeError("this VibeStudio cannot run a night unattended: it was deployed before this change; deploy again (7a, or python vibestudio/deploy.py)")
            if r.status_code != 200:
                try:
                    detail = r.json().get("detail", r.text[:160])
                except ValueError:
                    detail = r.text[:160]
                raise RuntimeError(f"the app did not start the night: {r.status_code} {detail}")
            run_id = r.json()["run_id"]
            say(f"  run {run_id} started; the readers go first")
            t0 = time.time()
            seen: set[str] = set()
            last_line = ""
            checks = 0
            while time.time() - t0 < timeout_s:
                time.sleep(poll_s)
                st = c.get(f"{app}/api/state").json()
                auto = c.get(f"{app}/api/night/auto/{run_id}").json() if True else {}
                if st.get("run_id") != run_id:
                    raise RuntimeError("another run took over the app")
                for node in st.get("nodes_seen") or []:
                    if node not in seen:
                        seen.add(node)
                        extra = ""
                        if node == "propose_directions" and st.get("candidates"):
                            extra = f" · {len(st['candidates'])} directions"
                        if node == "policy_check" and st.get("route"):
                            extra = f" · {st['route']}" + (" → quarantine cleans it" if st["route"] == "BLOCK" else "")
                        if node == "scripter" and (st.get("script") or {}).get("title"):
                            extra = f" · \"{st['script']['title']}\""
                        if node == "make_poster" and (st.get("poster") or {}).get("url"):
                            extra = f" · {st['poster']['url']}" + (" (stand-in)" if st["poster"].get("prebaked") else "")
                        say(f"  · {node}{extra}")
                if auto.get("picked") and "picked" not in seen:
                    seen.add("picked")
                    say(f"── the gate: {len(st.get('candidates') or [])} directions; the first is taken for you: \"{auto['picked']}\" ──")
                if st.get("status") == "rendering":
                    n = (st.get("render") or {}).get("checks") or 0
                    if n != checks:
                        checks = n
                        line = f"  rendering · Veo · check {n} · {int(time.time() - t0)}s"
                        if line != last_line:
                            say(line); last_line = line
                stage = auto.get("stage", "")
                if st.get("status") == "failed" or stage == "failed":
                    detail = st.get("error") or auto.get("detail") or "the night failed"
                    rec.update(status="failed", detail=detail[:200], title=(st.get("script") or {}).get("title", ""))
                    say(f"── not posted: {detail[:200]} ──")
                    return _write(rec)
                if stage == "superseded":
                    raise RuntimeError("another run took over the app")
                if st.get("status") == "done" and "released" not in seen:
                    seen.add("released")
                    render = st.get("render") or {}
                    say(f"── released · clip {render.get('url', '')}{' (a push-in over the poster)' if render.get('standin') else ''} · poster {(st.get('poster') or {}).get('url') or 'none'} ──")
                    rec.update(title=(st.get("script") or {}).get("title") or (st.get("direction") or {}).get("title") or "",
                               clip=f"{app}{render.get('url', '')}" if render.get("url") else "",
                               poster=f"{app}{st['poster']['url']}" if (st.get("poster") or {}).get("url") and not st["poster"].get("prebaked") else "")
                    _write(rec)
                if stage == "publishing" and "publishing" not in seen:
                    seen.add("publishing")
                    say(f"── publish, in the app · room {prof['event_code']} ──")
                pub = st.get("publish") or {}
                rec["attempts"] = pub.get("attempts") or rec["attempts"]
                if stage == "published":
                    rec.update(status="done", video_id=str(auto.get("video_id") or pub.get("video_id") or ""), url=auto.get("url") or pub.get("url") or "",
                               detail="", done_at=time.time())
                    say(f"  200 · video id {rec['video_id'] or '(none)'} · attempt {rec['attempts'] or 1}")
                    say(f"── on the wall · {rec['url']} ──")
                    say("  VibeTube processes the file for a minute or three; the card shows the poster as its thumbnail once it is ready.")
                    return _write(rec)
                if stage == "done":
                    rec.update(status="done", detail="the night is released in the app (not published)", done_at=time.time())
                    return _write(rec)
    except RuntimeError:
        raise
    except Exception as e:
        rec.update(status="failed", detail=f"{type(e).__name__}: {str(e)[:160]}")
        say(f"── not posted: {rec['detail']} ──")
        return _write(rec)
    rec.update(status="failed", detail=f"the night is still going after {int(timeout_s)}s; the app's page shows where it is")
    say(f"── {rec['detail']} ──")
    return _write(rec)


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
    told. The poster is a file here, or - for a night the app made - its URL
    on the app. Remembered per (thumbnail URL, poster), so a page that asks
    every few seconds downloads them once."""
    import httpx
    try:
        if poster_path.startswith(("http://", "https://")):
            key = (thumb_url, poster_path)
            if key in _match_cache:
                return _match_cache[key]
            a = httpx.get(thumb_url, timeout=20, follow_redirects=True).content
            b = httpx.get(poster_path, timeout=20, follow_redirects=True).content
            same = hashlib.sha256(a).hexdigest() == hashlib.sha256(b).hexdigest()
            _match_cache[key] = same
            return same
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


# ── the studio: where the app is ────────────────────────────────────────────

def studio(given: str | None = None) -> dict:
    """The VibeStudio the night goes through: the URL given, else the last one
    used, else the deploy's (runs/deploy.json), else STUDIO_APP_URL; and what
    the deploy record says - deploying since when, done, failed."""
    dep = _json(DEPLOY_RECORD)
    rec = _json(RECORD)
    url = ((given or "").strip() or rec.get("app_url") or dep.get("url") or os.environ.get("STUDIO_APP_URL", "")).rstrip("/")
    status = dep.get("status") or ("done" if dep.get("url") else "")
    try:
        from agent.platform.memory import creation_in_progress
        deploying = creation_in_progress("deploy")
    except Exception:
        deploying = False
    if deploying and status != "deploying":
        status = "deploying"
    if status == "deploying" and not deploying and dep.get("status") == "deploying":
        status = "interrupted"                       # the lock is gone but the record never ended: the process died
    return {"url": url, "status": status, "by": dep.get("by", ""), "started_at": dep.get("started_at"), "at": dep.get("at"),
            "detail": dep.get("detail", ""), "project": dep.get("project", ""), "region": dep.get("region", "")}


def app_state(app: str, timeout: float = 20) -> dict | None:
    """The app's /api/state, or None when it does not answer."""
    import httpx
    try:
        r = httpx.get(f"{app}/api/state", timeout=timeout, follow_redirects=True)
        r.raise_for_status()
        return r.json()
    except Exception:
        return None


# ── the hand-over and the publish, through the app ──────────────────────────

def _rel(path: str | None) -> str:
    """A path under the repo, said from the repo."""
    if not path:
        return ""
    try:
        return str(pathlib.Path(path).resolve().relative_to(ROOT))
    except ValueError:
        return path


def _write(rec: dict) -> dict:
    RUNS.mkdir(exist_ok=True)
    RECORD.write_text(json.dumps(rec, indent=2, ensure_ascii=False))
    return rec


def hand_over(app: str, *, title: str, description: str, clip_path: str | None, poster_path: str | None,
              duration_ms: int | None = None, say=print) -> dict:
    """The night into the app: one multipart POST to {app}/api/night/import
    with the clip, the poster (a real one), the title. The app writes the
    files where its own renders land and its run state becomes a done night.
    With no clip, the poster goes alone and the app makes the push-in."""
    import httpx
    say(f"── handing the night to VibeStudio · {app} ──")
    say(f"  title        {title}")
    say(f"  clip         {_rel(clip_path)}" if clip_path else "  clip         (none: the studio makes an eight-second push-in over the poster)")
    say(f"  poster       {_rel(poster_path)}" if poster_path else "  poster       (none: a stand-in poster is never uploaded)")
    if not clip_path and not poster_path:
        raise RuntimeError("nothing to hand over: no clip and no real poster")
    files: dict = {}
    if clip_path:
        files["clip"] = (pathlib.Path(clip_path).name, open(clip_path, "rb"), "video/mp4")
    if poster_path:
        files["poster"] = (pathlib.Path(poster_path).name, open(poster_path, "rb"), "image/png")
    data = {"title": title, "description": description, "source": "the workbench", "duration_ms": str(duration_ms or CLIP_MS)}
    try:
        r = httpx.post(f"{app}/api/night/import", data=data, files=files, timeout=180, follow_redirects=True)
    except httpx.HTTPError as e:
        raise RuntimeError(f"cannot reach VibeStudio at {app}: {type(e).__name__}: {str(e)[:120]}") from e
    finally:
        for _, (_, fh, _) in files.items():
            fh.close()
    if r.status_code == 404:
        raise RuntimeError("this VibeStudio has no /api/night/import: it was deployed before this change; deploy again (7a, or python vibestudio/deploy.py)")
    if r.status_code == 422 and not clip_path:
        raise RuntimeError("this VibeStudio wants a clip with the poster: it was deployed before the studio could make the push-in; deploy again (7a), or run session 5 for a clip")
    if r.status_code != 200:
        try:
            detail = r.json().get("detail", r.text[:160])
        except ValueError:
            detail = r.text[:160]
        raise RuntimeError(f"the app refused the night: {r.status_code} {detail}")
    out = r.json()
    say(f"  the app took it as run {out.get('run_id')} · clip {out.get('render', {}).get('url')} · poster {out.get('poster', {}).get('url') or 'none'}")
    return out


def press_publish(app: str, prof: dict, *, title: str, clip_path: str, poster_path: str | None,
                  say=print, wait_s: float = 150) -> dict:
    """Set the app's profile (the room, the name) and press publish there, then
    follow its publish record until it is done, needs confirming, or failed.
    The app does the request to the room; this only watches. The record of
    what was sent and what came back is runs/post.json."""
    import httpx
    rec = {"status": "posting", "at": time.time(), "app_url": app, "title": title, "event_code": prof["event_code"],
           "display_name": prof["display_name"], "platform_url": prof["platform_url"], "project_id": prof["project_id"],
           "clip": clip_path, "poster": poster_path or "", "attempts": 0, "video_id": "", "url": "", "detail": ""}
    _write(rec)
    say(f"── publish, in the app · room {prof['event_code']} · as {prof['display_name'] or 'Vibe Studio creator'} ──")
    try:
        with httpx.Client(timeout=30, follow_redirects=True) as c:
            r = c.put(f"{app}/api/profile", json={"event_code": prof["event_code"], "display_name": prof["display_name"], "platform_url": prof["platform_url"]})
            if r.status_code != 200:
                raise RuntimeError(f"the app refused the profile: {r.status_code} {r.text[:120]}")
            r = c.post(f"{app}/api/publish", json={"confirm": False})
            if r.status_code != 200:
                try:
                    detail = r.json().get("detail", r.text[:160])
                except ValueError:
                    detail = r.text[:160]
                raise RuntimeError(f"the app did not start the publish: {r.status_code} {detail}")
            say("  the app is posting the clip, the poster as its thumbnail")
            t0 = time.time()
            pub: dict = {}
            while time.time() - t0 < wait_s:
                time.sleep(3)
                st = c.get(f"{app}/api/state").json()
                pub = st.get("publish") or {}
                rec["attempts"] = pub.get("attempts") or rec["attempts"]
                if pub.get("status") in ("done", "failed", "needs_confirm"):
                    break
                if pub.get("detail") and pub.get("detail") != rec.get("detail"):
                    rec["detail"] = pub["detail"]
                    say(f"  {pub['detail']}")
                _write(rec)
    except RuntimeError:
        raise
    except Exception as e:
        rec.update(status="failed", detail=f"{type(e).__name__}: {str(e)[:160]}")
        say(f"── not posted: {rec['detail']} ──")
        return _write(rec)
    if pub.get("status") == "done":
        rec.update(status="done", video_id=str(pub.get("video_id") or ""), url=pub.get("url") or "", detail="", done_at=time.time())
        say(f"  200 · video id {rec['video_id'] or '(none)'} · attempt {rec['attempts'] or 1}")
        say(f"── on the wall · {rec['url']} ──")
        say("  VibeTube processes the file for a minute or three; the card shows your poster as its thumbnail once it is ready.")
    elif pub.get("status") in ("failed", "needs_confirm"):
        rec.update(status="failed", detail=pub.get("detail") or pub.get("status"))
        say(f"── not posted: {rec['detail']} ──")
    else:
        rec.update(status="failed", detail=f"the app is still publishing after {int(wait_s)}s; check again in a moment")
        say(f"── {rec['detail']} ──")
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
