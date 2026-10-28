"""Post my video, end to end, through a VibeStudio of our own and against a
VibeTube of our own: a poster and no clip becomes a push-in; the night is
handed to the app (POST /api/night/import); publish is pressed there; the
app makes the one request to the room; the record, the room, the card and
the thumbnail check read back what the fake received. No network, no model,
nothing written under runs/ (the app runs from a copy in a temporary folder
and the module's paths point there too).

    python checks/verify_post.py
"""
from __future__ import annotations

import hashlib
import json
import os
import pathlib
import shutil
import socket
import struct
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
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


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def get_json(url: str, timeout: float = 10):
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return json.loads(r.read())


def start_app(tmp: pathlib.Path, platform: str) -> tuple[subprocess.Popen, str]:
    """A VibeStudio of our own: the app copied to a temporary folder (so its
    runs/ is there, not the repo's), pointed at the fake VibeTube, no tracing,
    the two resource names given so nothing is looked up."""
    src = ROOT / "vibestudio"
    dst = tmp / "vibestudio"
    shutil.copytree(src, dst, ignore=shutil.ignore_patterns("node_modules", "dist", "runs", "__pycache__", "*.pyc", ".env"))
    port = free_port()
    env = {**os.environ, "STUDIO_VERTEX": "1", "STUDIO_TRACING": "0", "STUDIO_REAL_VIDEO": "0", "STUDIO_REAL_IMAGES": "0",
           "GOOGLE_CLOUD_PROJECT": "verify-project", "STUDIO_GCP_PROJECT": "verify-project", "VIBETUBE_PROJECT": "verify-project",
           "STUDIO_MEMORY_BANK": "projects/verify-project/locations/us-central1/reasoningEngines/1",
           "STUDIO_RAG_CORPUS": "projects/verify-project/locations/us-central1/ragCorpora/1",
           "VIBETUBE_URL": platform, "VIBETUBE_EVENT": "sandbox", "VIBETUBE_NAME": "Verify Bot", "PORT": str(port),
           "PYTHONPATH": str(tmp)}
    for k in ("GOOGLE_API_KEY",):
        env.pop(k, None)
    log = (tmp / "app.log").open("w")
    proc = subprocess.Popen([sys.executable, "-m", "uvicorn", "vibestudio.server.main:app", "--host", "127.0.0.1", "--port", str(port), "--log-level", "warning"],
                            cwd=str(tmp), env=env, stdout=log, stderr=subprocess.STDOUT)
    url = f"http://127.0.0.1:{port}"
    for _ in range(120):
        if proc.poll() is not None:
            break
        try:
            get_json(f"{url}/api/state", timeout=2)
            return proc, url
        except Exception:
            time.sleep(0.5)
    proc.terminate()
    raise RuntimeError("the app did not come up: " + (tmp / "app.log").read_text()[-1500:])


PATH_BEFORE = os.environ.get("PATH", "")


def main() -> int:
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="vibe-post-"))
    srv = ThreadingHTTPServer(("127.0.0.1", 0), FakeVibeTube)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    platform = f"http://127.0.0.1:{srv.server_port}"
    # point the module at the sandbox folder, so nothing under runs/ is touched
    night.RENDERS = tmp / "renders"
    night.RECORD = tmp / "post.json"
    night.DEPLOY_RECORD = tmp / "deploy.json"
    poster = tmp / "poster.png"
    poster.write_bytes(png(90, 160))
    said: list[str] = []
    proc = None
    try:
        from agent.platform import videogen
        tick("ffmpeg comes with the lab: found with PATH emptied (imageio-ffmpeg's static build)",
             bool((lambda: (os.environ.__setitem__("PATH", "/nonexistent"), videogen.ffmpeg_path())[1])()), "uv sync")
        os.environ["PATH"] = PATH_BEFORE
        tick("the stand-in poster is told by its bytes", night.is_standin_poster(night.STANDIN_POSTER) and not night.is_standin_poster(poster))

        # where the app is: the deploy record
        tick("studio(): nothing deployed yet", night.studio()["url"] == "" and night.studio()["status"] == "")
        night.DEPLOY_RECORD.write_text(json.dumps({"status": "deploying", "by": "setup", "started_at": time.time()}))
        tick("studio(): a deploying record with no lock holder is 'interrupted'", night.studio()["status"] == "interrupted")
        night.DEPLOY_RECORD.write_text(json.dumps({"status": "done", "by": "setup", "url": "https://vibestudio-x.run.app", "at": time.time()}))
        st = night.studio()
        tick("studio(): a done record names the app", st["url"] == "https://vibestudio-x.run.app" and st["status"] == "done" and st["by"] == "setup")
        tick("studio(): a URL given wins", night.studio("http://127.0.0.1:1/")["url"] == "http://127.0.0.1:1")
        tick("app_state(): no app there is None", night.app_state("http://127.0.0.1:9", timeout=2) is None)

        # the room, and the push-in
        r = night.room("sandbox", platform)
        tick("the room answers: open", r["open"] and r["name"] == "Sandbox")
        clip = night.push_in(str(poster), out=tmp / "renders" / "post-test.mp4")
        tick(f"push_in made an mp4 ({clip.stat().st_size // 1000} kB)", clip.exists() and clip.stat().st_size > 10_000)

        # a VibeStudio of our own
        proc, app = start_app(tmp, platform)
        tick(f"a VibeStudio of our own answers at {app}", night.app_state(app) is not None)
        tick("…and starts idle", (night.app_state(app) or {}).get("status") == "idle")

        # the hand-over
        out = night.hand_over(app, title="Verify night", description="a check", clip_path=str(clip), poster_path=str(poster), say=said.append)
        tick("hand_over(): the app took the night", out.get("ok") and out["run_id"].startswith("import_"), json.dumps(out)[:200])
        st = night.app_state(app) or {}
        tick("…its run is done, with the title", st.get("status") == "done" and st.get("script", {}).get("title") == "Verify night", json.dumps(st)[:300])
        tick("…the render is on its disk and served", st.get("render", {}).get("status") == "done"
             and urllib.request.urlopen(app + st["render"]["url"], timeout=10).read() == clip.read_bytes())
        tick("…the poster too, as a real one", st.get("poster", {}).get("url", "").startswith("/static/posters/") and not st["poster"].get("prebaked")
             and urllib.request.urlopen(app + st["poster"]["url"], timeout=10).read() == poster.read_bytes())
        tick("…and it is in the app's history", any(i.get("title") == "Verify night" for i in get_json(f"{app}/api/history")["items"]))

        # the publish, pressed in the app; the app makes the request
        prof = night.profile(platform_url=platform, event_code="sandbox", display_name="Verify Bot")
        prof["project_id"] = "verify-project"
        rec = night.press_publish(app, prof, title="Verify night", clip_path=str(clip), poster_path=str(poster), say=said.append)
        tick("press_publish(): done with a video id", rec["status"] == "done" and rec["video_id"] == "v_0001", json.dumps(rec)[:200])
        tick("the record is on disk and names the app", json.loads(night.RECORD.read_text())["app_url"] == app)
        got = FakeVibeTube.received[-1]
        tick("the fake received the clip's bytes, from the app", got["video"] == clip.read_bytes())
        tick("…and the poster as thumbnailFile", got["thumb"] == poster.read_bytes())
        tick("…title, duration 0:08, displayName, projectId", (got["title"], got["duration"], got["displayName"], got["projectId"]) == ("Verify night", "0:08", "Verify Bot", "verify-project"), str({k: got[k] for k in ("title", "duration", "displayName", "projectId")}))
        st = night.app_state(app) or {}
        tick("the app's own publish record says done", (st.get("publish") or {}).get("status") == "done" and str(st["publish"].get("video_id")) == "v_0001")
        tick("the watch URL names the room and the id", rec["url"] == f"{platform}/e/sandbox?v=v_0001")

        # reading it back: the card and the thumbnail bytes
        v = night.video("sandbox", "v_0001", platform)
        tick("video() finds the card", bool(v) and v["status"] == "ready" and v["channel"] == "Verify Bot")
        tick("thumbnail_matches: the same bytes", night.thumbnail_matches(v["thumbnail_url"], str(poster)) is True)

        # the render from the poster: Veo stubbed - a receipt, two "not yet", then a file; and a refusal
        from agent.platform import videogen as vg
        calls = {"start": 0, "check": 0}
        real_start, real_check = vg.start_from_poster, vg.check
        fake_clip = tmp / "renders" / "veo-fake.mp4"
        fake_clip.write_bytes(clip.read_bytes())

        def fake_start(poster_path, script, **kw):
            calls["start"] += 1
            assert pathlib.Path(poster_path).exists() and "Title: " in vg.build_prompt(script)
            return {"operation": "projects/x/operations/op-1", "model": "veo-fake", "prompt": vg.build_prompt(script), "aspect": "9:16"}

        def fake_check(op, **kw):
            calls["check"] += 1
            if calls["check"] < 3:
                return {"done": False, "operation": op}
            return {"done": True, "operation": op, "path": str(fake_clip), "url": "/static/renders/veo-fake.mp4", "duration_ms": 8000}
        vg.start_from_poster, vg.check = fake_start, fake_check
        try:
            said_r: list[str] = []
            path, dur = night.render_from_poster(str(poster), title="Verify night", description="", shots=["a", "b"], say=said_r.append, poll_s=0.01)
            tick("render_from_poster(): the receipt, the checks, then the clip", path == str(fake_clip) and dur == 8000 and calls == {"start": 1, "check": 3}, str(calls))
            tick("…and it says what it does, a line per check", any("check 1: not yet" in l for l in said_r) and any("clip ready" in l for l in said_r))
            vg.check = lambda op, **kw: {"done": True, "operation": op, "error": "the model returned no video (filtered or empty)"}
            try:
                night.render_from_poster(str(poster), title="x", description="", shots=[], say=said_r.append, poll_s=0.01)
                refused = ""
            except RuntimeError as e:
                refused = str(e)
            tick("a refusal raises with Veo's reason (the script then makes the push-in)", "did not render" in refused, refused)
            tick("the aspect follows the poster: a portrait PNG is 9:16", vg._aspect_of_png(poster.read_bytes()) == "9:16" and vg._aspect_of_png(png(160, 90)) == "16:9")
            tick("shots_from_reply(): the three shots of a session-2 reply", night.shots_from_reply("**Shot 1:** a drawer.\n* **Shot 2:** it opens slowly.\n- Shot 3: the ghost waves hello.\nShot 4: dropped") == ["a drawer.", "it opens slowly.", "the ghost waves hello."])
        finally:
            vg.start_from_poster, vg.check = real_start, real_check

        # the whole night, unattended, followed from here: a fake app scripts the states
        class FakeNight(BaseHTTPRequestHandler):
            steps = [
                {"status": "running", "run_id": "run_7", "nodes_seen": ["scan_trends", "read_backlog", "read_feedback"], "active": "join_research", "candidates": [], "render": {}, "poster": {}, "publish": {}, "script": {}},
                {"status": "waiting_pick", "run_id": "run_7", "nodes_seen": ["scan_trends", "read_backlog", "read_feedback", "join_research", "propose_directions"], "active": None,
                 "candidates": [{"title": "The Polite Resident"}, {"title": "B"}, {"title": "C"}, {"title": "D"}], "render": {}, "poster": {}, "publish": {}, "script": {}},
                {"status": "running", "run_id": "run_7", "nodes_seen": ["scan_trends", "read_backlog", "read_feedback", "join_research", "propose_directions", "direction_gate", "policy_check", "scripter"], "active": "render_desk",
                 "candidates": [{"title": "The Polite Resident"}], "route": "OK", "script": {"title": "The Polite Resident"}, "render": {}, "poster": {}, "publish": {}},
                {"status": "rendering", "run_id": "run_7", "nodes_seen": ["scan_trends", "read_backlog", "read_feedback", "join_research", "propose_directions", "direction_gate", "policy_check", "scripter", "render_desk", "make_poster"], "active": None,
                 "candidates": [{"title": "The Polite Resident"}], "script": {"title": "The Polite Resident"}, "render": {"status": "pending", "checks": 2}, "poster": {"url": "/static/posters/p.png", "prebaked": False}, "publish": {}},
                {"status": "done", "run_id": "run_7", "nodes_seen": ["scan_trends", "read_backlog", "read_feedback", "join_research", "propose_directions", "direction_gate", "policy_check", "scripter", "render_desk", "make_poster", "join_media", "store_release"], "active": None,
                 "candidates": [{"title": "The Polite Resident"}], "script": {"title": "The Polite Resident"}, "render": {"status": "done", "url": "/static/renders/r.mp4", "checks": 3}, "poster": {"url": "/static/posters/p.png", "prebaked": False}, "publish": {"status": "publishing", "attempts": 1}},
                {"status": "done", "run_id": "run_7", "nodes_seen": [], "active": None, "candidates": [], "script": {"title": "The Polite Resident"}, "render": {"status": "done", "url": "/static/renders/r.mp4"}, "poster": {"url": "/static/posters/p.png", "prebaked": False},
                 "publish": {"status": "done", "video_id": "v_night", "url": f"{platform}/e/sandbox?v=v_night", "attempts": 1}},
            ]
            stages = ["running", "running", "picked", "picked", "publishing", "published"]
            n = 0
            posted: list[dict] = []

            def log_message(self, *a):
                pass

            def _send(self, code, body):
                data = json.dumps(body).encode()
                self.send_response(code); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(data))); self.end_headers(); self.wfile.write(data)

            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", "0"))) or b"{}")
                if self.path == "/api/night/auto":
                    FakeNight.posted.append(body)
                    return self._send(200, {"ok": True, "run_id": "run_7"})
                self._send(404, {"detail": "nope"})

            def do_GET(self):
                if self.path == "/api/state":
                    i = min(FakeNight.n, len(FakeNight.steps) - 1)
                    FakeNight.n += 1
                    return self._send(200, FakeNight.steps[i])
                if self.path.startswith("/api/night/auto/"):
                    i = min(max(FakeNight.n - 1, 0), len(FakeNight.stages) - 1)
                    st = FakeNight.stages[i]
                    return self._send(200, {"run_id": "run_7", "stage": st, "picked": "The Polite Resident" if i >= 2 else "", "video_id": "v_night" if st == "published" else "", "url": f"{platform}/e/sandbox?v=v_night" if st == "published" else ""})
                self._send(404, {"detail": "nope"})
        fake_app = ThreadingHTTPServer(("127.0.0.1", 0), FakeNight)
        threading.Thread(target=fake_app.serve_forever, daemon=True).start()
        fapp = f"http://127.0.0.1:{fake_app.server_port}"
        said_n: list[str] = []
        try:
            rec = night.run_night(fapp, "a knitted ghost", prof, say=said_n.append, poll_s=0.01)
            tick("run_night(): started the night in the app with the idea and the room", FakeNight.posted and FakeNight.posted[0]["idea"] == "a knitted ghost" and FakeNight.posted[0]["event_code"] == "sandbox")
            tick("…followed it to the wall: done, with the video id and the title", rec["status"] == "done" and rec["video_id"] == "v_night" and rec["title"] == "The Polite Resident" and rec["night"] == "app", json.dumps(rec)[:200])
            tick("…and said the steps: the readers, the gate taken for you, the render, the release, the publish",
                 any("· scan_trends" in l for l in said_n) and any("the first is taken for you" in l and "The Polite Resident" in l for l in said_n)
                 and any("rendering · Veo · check" in l for l in said_n) and any("── released" in l for l in said_n) and any("on the wall" in l for l in said_n), "\n".join(said_n)[:600])
            tick("…the record points at the app's poster, for the thumbnail check", rec["poster"] == f"{fapp}/static/posters/p.png")
            tick("the whole-night record names the app", json.loads(night.RECORD.read_text())["app_url"] == fapp)
        finally:
            fake_app.shutdown()

        # a poster alone: the studio makes the push-in
        out = night.hand_over(app, title="Poster only", description="", clip_path=None, poster_path=str(poster), say=said.append)
        st = night.app_state(app) or {}
        tick("hand_over() with no clip: the app made the push-in over the poster", out.get("ok") and st.get("render", {}).get("standin") is True
             and len(urllib.request.urlopen(app + st["render"]["url"], timeout=10).read()) > 10_000, json.dumps(st.get("render"))[:200])
        rec = night.press_publish(app, prof, title="Poster only", clip_path="(made by the studio)", poster_path=str(poster), say=said.append)
        tick("…and published it, the poster as the thumbnail", rec["status"] == "done" and FakeVibeTube.received[-1]["thumb"] == poster.read_bytes() and len(FakeVibeTube.received[-1]["video"]) > 10_000)

        # a stand-in poster is never uploaded; the app replaces its night
        out = night.hand_over(app, title="No thumb", description="", clip_path=str(clip), poster_path=None, say=said.append)
        st = night.app_state(app) or {}
        tick("a second hand-over replaces the night (no poster this time)", st.get("script", {}).get("title") == "No thumb" and not st.get("poster"))
        rec = night.press_publish(app, prof, title="No thumb", clip_path=str(clip), poster_path=None, say=said.append)
        tick("without a real poster the POST has no thumbnailFile", rec["status"] == "done" and FakeVibeTube.received[-1]["thumb"] == b"")
        tick("one video per project and room: the new post replaced the old", len([r for r in FakeVibeTube.received if r["event"] == "sandbox"]) == 1)

        # what the app refuses
        try:
            urllib.request.urlopen(urllib.request.Request(f"{app}/api/night/import", method="POST", data=b"", headers={"Content-Type": "multipart/form-data; boundary=x"}), timeout=10)
            code = 200
        except urllib.error.HTTPError as e:
            code = e.code
        tick("an import with neither clip nor poster is refused (422)", code == 422, str(code))

        # a closed room: the app's three attempts fail, the record says why
        FakeVibeTube.room_open = False
        rec = night.press_publish(app, prof, title="x", clip_path=str(clip), poster_path=None, say=said.append)
        tick("a closed room: failed, with the platform's reason", rec["status"] == "failed" and "403" in rec["detail"], rec["detail"])
        FakeVibeTube.room_open = True
        prof2 = dict(prof, event_code="nowhere")
        rec = night.press_publish(app, prof2, title="x", clip_path=str(clip), poster_path=None, say=said.append)
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
        tick("the script's own output is readable", any(line.startswith("── handing the night") for line in said) and any("on the wall" in line for line in said))
    finally:
        if proc is not None:
            proc.terminate()
            try:
                proc.wait(5)
            except subprocess.TimeoutExpired:
                proc.kill()
        srv.shutdown()
        shutil.rmtree(tmp, ignore_errors=True)
    print("\nPOST VERIFY: " + ("the night goes through the app, the app posts it as 7b teaches, and it reads back" if ok else "NOT OK - see the ✗ lines"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
