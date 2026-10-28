"""Post my video, end to end, against a VibeTube of our own: a poster and no
clip becomes a push-in and one multipart POST; the record, the room, the card
and the thumbnail check read back what the fake received. No network, no
model, nothing written under runs/ (the module's paths are pointed at a
temporary folder for the run).

    python checks/verify_post.py
"""
from __future__ import annotations

import hashlib
import json
import os
import pathlib
import shutil
import struct
import sys
import tempfile
import threading
import zlib
from email.parser import BytesParser
from email.policy import default as email_default
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
os.environ.setdefault("STUDIO_VERTEX", "1")

from server.services import night  # noqa: E402

ok = True


def tick(name, cond, hint=""):
    global ok
    print(("  ✓ " if cond else "  ✗ ") + name + ("" if cond else f"   → {hint}"))
    ok = ok and bool(cond)


def png(w: int, h: int, rgb=(240, 120, 20)) -> bytes:
    """A solid PNG, so ffmpeg has a real picture to push into."""
    raw = b"".join(b"\x00" + bytes(rgb) * w for _ in range(h))

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


class FakeVibeTube(BaseHTTPRequestHandler):
    """The three routes the lab uses: the room, its videos, and the upload."""
    received: list[dict] = []
    room_open = True

    def log_message(self, *a):            # quiet
        pass

    def _send(self, code, body):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path.startswith("/api/events/") and self.path.endswith("/videos"):
            code = self.path.split("/")[3]
            rows = [{"id": r["id"], "eventId": code, "title": r["title"], "status": "ready", "channelName": r["displayName"],
                     "projectId": r["projectId"], "thumbnailUrl": f"/thumbs/{r['id']}.png" if r.get("thumb") else ""}
                    for r in self.received if r["event"] == code]
            return self._send(200, rows)
        if self.path.startswith("/thumbs/"):
            vid = self.path.split("/")[-1].removesuffix(".png")
            r = next((x for x in self.received if x["id"] == vid), None)
            if r is None or not r.get("thumb"):
                return self._send(404, {"detail": "no thumbnail"})
            self.send_response(200)
            self.send_header("Content-Type", "image/png")
            self.send_header("Content-Length", str(len(r["thumb"])))
            self.end_headers()
            self.wfile.write(r["thumb"])
            return
        if self.path.startswith("/api/events/"):
            code = self.path.split("/")[3]
            if code == "nowhere":
                return self._send(404, {"detail": "event not found"})
            return self._send(200, {"code": code, "name": code.title(), "uploadOpen": self.room_open,
                                    "uploadState": "open" if self.room_open else "closed",
                                    "reason": None if self.room_open else "The upload window for this showroom has closed."})
        self._send(404, {"detail": "nope"})

    def do_POST(self):
        if not (self.path.startswith("/api/events/") and self.path.endswith("/videos")):
            return self._send(404, {"detail": "nope"})
        code = self.path.split("/")[3]
        if code == "nowhere":
            return self._send(404, {"detail": "event not found"})
        if not self.room_open:
            return self._send(403, {"detail": "uploads are closed"})
        body = self.rfile.read(int(self.headers.get("Content-Length", "0")))
        msg = BytesParser(policy=email_default).parsebytes(b"Content-Type: " + self.headers.get("Content-Type", "").encode() + b"\r\n\r\n" + body)
        form = {part.get_param("name", header="content-disposition"): part.get_payload(decode=True) for part in msg.iter_parts()}
        text = lambda k: (form.get(k) or b"").decode()  # noqa: E731
        rec = {"id": f"v_{len(self.received) + 1:04d}", "event": code,
               "title": text("title"), "description": text("description"), "duration": text("duration"),
               "displayName": text("displayName"), "projectId": text("projectId"),
               "video": form.get("videoFile") or b"", "thumb": form.get("thumbnailFile") or b""}
        # one video per project and room: a new post replaces the old one
        self.received[:] = [r for r in self.received if not (r["event"] == code and r["projectId"] == rec["projectId"])]
        self.received.append(rec)
        self._send(200, {"id": rec["id"], "status": "processing"})


def main() -> int:
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="vibe-post-"))
    srv = ThreadingHTTPServer(("127.0.0.1", 0), FakeVibeTube)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    platform = f"http://127.0.0.1:{srv.server_port}"
    # point the module at the sandbox folder, so nothing under runs/ is touched
    night.RENDERS = tmp / "renders"
    night.RECORD = tmp / "post.json"
    poster = tmp / "poster.png"
    poster.write_bytes(png(90, 160))
    said: list[str] = []
    try:
        tick("ffmpeg on PATH (the push-in needs it; Cloud Shell has it)", bool(shutil.which("ffmpeg")), "apt install ffmpeg")
        tick("the stand-in poster is told by its bytes", night.is_standin_poster(night.STANDIN_POSTER) and not night.is_standin_poster(poster))

        # the room
        r = night.room("sandbox", platform)
        tick("the room answers: open", r["open"] and r["name"] == "Sandbox")
        r = night.room("nowhere", platform)
        tick("a wrong code is a 404 with a hint", not r["open"] and r["state"] == "404" and "case-sensitive" in r["reason"])

        # a poster and no clip: the push-in
        clip = night.push_in(str(poster), out=tmp / "renders" / "post-test.mp4")
        tick(f"push_in made an mp4 ({clip.stat().st_size // 1000} kB)", clip.exists() and clip.stat().st_size > 10_000)

        # the request
        prof = night.profile(platform_url=platform, event_code="sandbox", display_name="Verify Bot")
        prof["project_id"] = "verify-project"
        rec = night.post(title="Verify night", description="a check", clip_path=str(clip), poster_path=str(poster), prof=prof, say=said.append)
        tick("post() returned done with a video id", rec["status"] == "done" and rec["video_id"] == "v_0001", json.dumps(rec)[:200])
        tick("the record is on disk", json.loads(night.RECORD.read_text())["video_id"] == "v_0001")
        got = FakeVibeTube.received[-1]
        tick("the fake received the clip's bytes", got["video"] == clip.read_bytes())
        tick("…and the poster as thumbnailFile", got["thumb"] == poster.read_bytes())
        tick("…title, duration 0:08, displayName, projectId", (got["title"], got["duration"], got["displayName"], got["projectId"]) == ("Verify night", "0:08", "Verify Bot", "verify-project"), str({k: got[k] for k in ("title", "duration", "displayName", "projectId")}))
        tick("the watch URL names the room and the id", rec["url"] == f"{platform}/e/sandbox?v=v_0001")

        # reading it back: the card and the thumbnail bytes
        v = night.video("sandbox", "v_0001", platform)
        tick("video() finds the card", bool(v) and v["status"] == "ready" and v["channel"] == "Verify Bot")
        tick("thumbnail_matches: the same bytes", night.thumbnail_matches(v["thumbnail_url"], str(poster)) is True)
        other = tmp / "other.png"
        other.write_bytes(png(90, 160, (10, 10, 200)))
        tick("thumbnail_matches: different bytes", night.thumbnail_matches(v["thumbnail_url"], str(other)) is False)

        # a stand-in poster is never uploaded
        rec = night.post(title="No thumb", description="", clip_path=str(clip), poster_path=None, prof=prof, say=said.append)
        tick("without a real poster the POST has no thumbnailFile", rec["status"] == "done" and FakeVibeTube.received[-1]["thumb"] == b"")
        tick("one video per project and room: the new post replaced the old", len([r for r in FakeVibeTube.received if r["event"] == "sandbox"]) == 1)

        # a closed room, and a room that does not exist
        FakeVibeTube.room_open = False
        rec = night.post(title="x", description="", clip_path=str(clip), poster_path=None, prof=prof, say=said.append, attempts=1)
        tick("a closed room: failed, with the platform's reason", rec["status"] == "failed" and rec["detail"].startswith("403"), rec["detail"])
        FakeVibeTube.room_open = True
        prof2 = dict(prof, event_code="nowhere")
        rec = night.post(title="x", description="", clip_path=str(clip), poster_path=None, prof=prof2, say=said.append, attempts=1)
        tick("a wrong code: 404, and the hint to check it", rec["status"] == "failed" and "check the event code" in rec["detail"], rec["detail"])

        # the profile: .env, then the last post, then what was typed
        os.environ["VIBETUBE_EVENT"] = "fromenv"
        os.environ["VIBETUBE_NAME"] = "Env Name"
        os.environ["VIBETUBE_PROJECT"] = "env-project"
        night.RECORD.unlink(missing_ok=True)
        p = night.profile()
        tick("profile() reads .env", (p["event_code"], p["display_name"], p["project_id"]) == ("fromenv", "Env Name", "env-project"))
        night.RECORD.write_text(json.dumps({"event_code": "lastroom", "display_name": "Last Name"}))
        p = night.profile()
        tick("…the last post's room and name win over .env", (p["event_code"], p["display_name"]) == ("lastroom", "Last Name"))
        p = night.profile(event_code="  typed  ", display_name="")
        tick("…and what was typed wins over both; blanks are ignored", (p["event_code"], p["display_name"]) == ("typed", "Last Name"))
        tick("the script's own output is readable", any(line.startswith("── POST") for line in said) and any("on the wall" in line for line in said))
    finally:
        srv.shutdown()
        shutil.rmtree(tmp, ignore_errors=True)
    print("\nPOST VERIFY: " + ("the post goes out as the app sends it, and reads back" if ok else "NOT OK - see the ✗ lines"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
