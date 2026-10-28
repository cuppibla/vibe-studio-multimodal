"""`python scripts/post.py` - put tonight's video on the wall, from here.

One multipart POST to the VibeTube room: the same request VibeStudio makes
in session 7b (vibestudio/server/platform/publish.py), sent from the
workbench with what you have made so far. Nothing to deploy first.

    the clip     the render delivered in session 5 (runs/state.json), else the
                 newest clip under runs/media/renders, else an eight-second
                 push-in over the poster, made here by ffmpeg
    the poster   the newest one the image model drew, as the thumbnail (a
                 stand-in poster is never uploaded; the card then shows a frame)
    the title    the script's title, else the direction, else what the agent
                 asked make_poster to draw in session 2

The room, your name and the platform come from .env (VIBETUBE_EVENT,
VIBETUBE_NAME, VIBETUBE_URL); the room keeps one video per project, so
posting again replaces yours. The page's "Post my video" button runs this
command; its record is runs/post.json.

    python scripts/post.py                      post what there is
    python scripts/post.py --title "..."        a title of your own
    python scripts/post.py --event sandbox      another room, just this once
    python scripts/post.py --dry-run            say what would go out, send nothing
    python scripts/post.py --status             the last post, and what VibeTube says now
"""
from __future__ import annotations

import argparse
import pathlib
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from agent.platform import drive  # noqa: E402
from server.services import night  # noqa: E402


def _rel(path: str | None) -> str:
    """A path under the repo, said from the repo: runs/media/posters/…"""
    if not path:
        return ""
    try:
        return str(pathlib.Path(path).resolve().relative_to(ROOT))
    except ValueError:
        return path


def _age(ts: float | None) -> str:
    if not ts:
        return ""
    s = int(time.time() - ts)
    return f"{s}s ago" if s < 120 else f"{s // 60} min ago" if s < 7200 else f"{s // 3600} h ago"


def main() -> int:
    sys.stdout.reconfigure(line_buffering=True)          # the page streams this output
    ap = argparse.ArgumentParser(description="post tonight's video to the VibeTube room, from the workbench")
    ap.add_argument("--title", default="", help="the card's title (default: the script's, the direction's, or the poster's subject)")
    ap.add_argument("--description", default="", help="the card's description")
    ap.add_argument("--event", default="", help="the room's event code (default: VIBETUBE_EVENT in .env)")
    ap.add_argument("--name", default="", help="the name the card credits (default: VIBETUBE_NAME in .env)")
    ap.add_argument("--platform", default="", help="the platform URL (default: VIBETUBE_URL, https://vibetube.dev)")
    ap.add_argument("--dry-run", action="store_true", help="show what would be posted and stop")
    ap.add_argument("--status", action="store_true", help="the last post and what VibeTube says about it now")
    a = ap.parse_args()

    prof = night.profile(event_code=a.event, display_name=a.name, platform_url=a.platform)

    if a.status:
        rec = night.record()
        if not rec:
            print("no post yet: python scripts/post.py posts what there is"); return 0
        print(f"── last post · {rec.get('status')} · {_age(rec.get('at'))} ──")
        print(f"  title     {rec.get('title')}")
        print(f"  room      {rec.get('event_code')} · as {rec.get('display_name')} · project {rec.get('project_id')}")
        print(f"  clip      {_rel(rec.get('clip'))}")
        print(f"  poster    {_rel(rec.get('poster')) or '(none uploaded)'}")
        if rec.get("video_id"):
            print(f"  video id  {rec['video_id']} · {rec.get('url')}")
        if rec.get("detail"):
            print(f"  detail    {rec['detail']}")
        now = night.status_for(rec, None)
        r = now.get("room") or {}
        print(f"  room now  {r.get('code')} · {'open' if r.get('open') else (r.get('reason') or r.get('state') or 'unknown')}")
        v = now.get("video")
        if v:
            print(f"  on wall   {v['status']} · \"{v['title']}\" by {v['channel']}")
            m = now.get("thumbnail_match")
            print("  thumbnail " + ("your poster, byte for byte" if m else "different bytes" if m is False else "could not compare"))
        elif rec.get("video_id"):
            print("  on wall   not listed yet; VibeTube is processing it")
        return 0

    n = drive.run(night.night())
    po, cl = n["poster"], n["clip"]
    title = a.title.strip() or n["title"] or "Tonight on VibeStudio"
    description = a.description.strip() or n["description"] or "Made in the VibeStudio workbench: the poster by the image model, the clip from the media desk."

    print("── tonight, as far as it has got ──")
    if po:
        print(f"  poster   {_rel(po['path'])}  ({_age(po['at'])}; {po['source']})" + ("  · a STAND-IN: not uploaded as the thumbnail" if po["prebaked"] else ""))
    else:
        print("  poster   none yet")
    if cl:
        print(f"  clip     {_rel(cl['path'])}  ({_age(cl['at'])}; {cl['source']})" + ("  · the stand-in render" if cl["prebaked"] else ""))
    else:
        print("  clip     none yet" + (": an eight-second push-in over the poster will be made by ffmpeg" if po and n["ffmpeg"] else ""))
    print(f"  title    {title}  ({n['words_source'] or 'default'})")
    print(f"  room     {prof['event_code'] or '(none: VIBETUBE_EVENT in .env, or --event)'} · as {prof['display_name'] or '(no name)'} · project {prof['project_id']}")

    if not po and not cl:
        print("nothing to post yet: draw the first poster in session 2, then come back")
        return 2
    if not prof["event_code"]:
        print("no room: set VIBETUBE_EVENT in .env (./setup_codelab.sh asks for it) or pass --event")
        return 2
    rm = night.room(prof["event_code"], prof["platform_url"])
    if not rm["open"]:
        print(f"the room {prof['event_code']} is not taking uploads: {rm['reason'] or rm['state'] or 'unknown'} (sandbox always is: --event sandbox)")
        if not a.dry_run:
            return 2
    else:
        print(f"  room     {rm['code']} · {rm['name']} · uploads open")
    if a.dry_run:
        print("dry run: nothing sent")
        return 0

    clip_path = cl["path"] if cl else None
    if not clip_path:
        print("── making the clip: an eight-second push-in over the poster (ffmpeg) ──")
        try:
            clip_path = str(night.push_in(po["path"]))
        except Exception as e:
            print(f"  {e}")
            night._write({"status": "failed", "at": time.time(), "detail": str(e)[:200], "event_code": prof["event_code"],
                          "display_name": prof["display_name"], "platform_url": prof["platform_url"], "project_id": prof["project_id"],
                          "title": title, "clip": "", "poster": po["path"] if po else "", "video_id": "", "url": "", "attempts": 0})
            return 1
        print(f"  {_rel(clip_path)}")
    thumb = po["path"] if po and not po["prebaked"] else None
    rec = night.post(title=title, description=description, clip_path=clip_path, poster_path=thumb, prof=prof,
                     duration_ms=(cl or {}).get("duration_ms"))
    return 0 if rec.get("status") == "done" else 1


if __name__ == "__main__":
    sys.exit(main())
