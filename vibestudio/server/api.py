"""The REST surface. Small on purpose: the page reads state from the SSE
stream and calls these to change something."""
from __future__ import annotations

import asyncio
import os
import pathlib
import re
import time

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

from .platform import avatar, files, graphinfo, publish
from .agent.platform import config, videogen
from .platform.bus import bus
from .runner import Busy, RunState, studio

router = APIRouter(prefix="/api")


class Idea(BaseModel):
    idea: str = ""


class Pick(BaseModel):
    pick: str


class BacklogItem(BaseModel):
    text: str


class Thumbnail(BaseModel):
    data_url: str


class Profile(BaseModel):
    display_name: str | None = None
    description: str | None = None
    platform_url: str | None = None
    event_code: str | None = None


class PublishRequest(BaseModel):
    confirm: bool = False
    event_code: str | None = None
    platform_url: str | None = None


class Night(BaseModel):
    idea: str = ""
    publish: bool = True
    event_code: str | None = None
    display_name: str | None = None


@router.get("/events")
async def events():
    return StreamingResponse(bus.stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.get("/state")
async def state():
    return studio.snapshot()


@router.get("/graph")
async def graph():
    return graphinfo.describe()


@router.get("/health")
async def health():
    from .agent.platform import memory, rag
    return {"ok": True, "real_video": config.REAL_VIDEO, "model": config.MODEL,
            "memory_bank": bool(memory.engine_name()), "rag_corpus": bool(rag.corpus_name()),
            "runs_dir": str(config.RUNS)}


@router.post("/run")
async def run(body: Idea):
    try:
        run_id = studio.start(body.idea)
    except Busy as e:
        raise HTTPException(409, str(e))
    return {"ok": True, "run_id": run_id}


@router.post("/run/pick")
async def run_pick(body: Pick):
    if body.pick not in {str(i + 1) for i in range(max(1, len(studio.state.candidates)))}:
        raise HTTPException(400, f"pick must be one of 1..{len(studio.state.candidates)}")
    try:
        studio.pick(body.pick)
    except Busy as e:
        raise HTTPException(409, str(e))
    return {"ok": True}


@router.get("/backlog")
async def backlog():
    return {"ideas": files.backlog(), "path": str(files.BACKLOG_FILE)}


@router.post("/backlog")
async def backlog_add(body: BacklogItem):
    ideas = files.backlog_add(body.text)
    bus.publish("backlog.changed", count=len(ideas))
    return {"ideas": ideas}


@router.delete("/backlog")
async def backlog_remove(body: BacklogItem):
    ideas = files.backlog_remove(body.text)
    bus.publish("backlog.changed", count=len(ideas))
    return {"ideas": ideas}


@router.post("/thumbnail")
async def thumbnail(body: Thumbnail):
    st = studio.state
    if not st.run_id:
        raise HTTPException(409, "no run")
    try:
        st.thumbnail_url = files.save_thumbnail(st.run_id, body.data_url)
    except ValueError as e:
        raise HTTPException(400, str(e))
    if st.status == "done":
        files.history_upsert(studio.record())
    bus.publish("thumbnail.saved", url=st.thumbnail_url)
    return {"url": st.thumbnail_url}


@router.get("/profile")
async def profile():
    return files.profile()


@router.put("/profile")
async def profile_put(body: Profile):
    before = files.profile()
    prof = files.save_profile(**body.model_dump())
    bus.publish("profile.saved", display_name=prof["display_name"], event_code=prof["event_code"])
    if body.description is not None and body.description.strip() and body.description.strip() != before["description"]:
        asyncio.create_task(avatar.generate(body.description))
    return prof


@router.post("/publish")
async def do_publish(body: PublishRequest):
    st = studio.state
    if st.status != "done" or st.render.get("status") != "done":
        raise HTTPException(409, "nothing finished to publish")
    if st.publish.get("status") == "publishing":
        raise HTTPException(409, "a publish is in progress")
    if body.event_code is not None or body.platform_url is not None:
        files.save_profile(event_code=body.event_code, platform_url=body.platform_url)
    asyncio.create_task(publish.publish(st, confirmed=body.confirm))
    return {"ok": True}


IMPORT_MAX_BYTES = 200 * 1024 * 1024


@router.post("/night/import")
async def night_import(clip: UploadFile | None = File(None), poster: UploadFile | None = File(None),
                       title: str = Form("Untitled"), description: str = Form(""), source: str = Form("the workbench"),
                       duration_ms: int = Form(8000)):
    """A night made elsewhere, handed to the app as finished: the clip (and
    the poster, when a real one was drawn) are written where the app's own
    renders land, the run state becomes a done night, and publish can post it.
    A poster alone is a night too: the studio makes the eight-second push-in
    over it, the stand-in clip the lab uses before the first render.

    The lab's workbench uses this from session 2 on (its Post my video
    button): the sandbox sessions make the poster and the clip, the app on
    Cloud Run is the publisher, and the request to the room is the same one
    either way. Refused while a run is in progress or a publish is going out."""
    st = studio.state
    if st.status in ("running", "waiting_pick", "rendering"):
        raise HTTPException(409, f"a run is {st.status.replace('_', ' ')}; one at a time")
    if st.publish.get("status") == "publishing":
        raise HTTPException(409, "a publish is in progress")
    run_id = f"import_{int(time.time())}"
    renders = config.MEDIA / "renders"
    posters = config.MEDIA / "posters"
    renders.mkdir(parents=True, exist_ok=True)
    posters.mkdir(parents=True, exist_ok=True)
    poster_rec: dict = {}
    poster_path = None
    if poster is not None:
        pdata = await poster.read(IMPORT_MAX_BYTES + 1)
        if pdata:
            poster_path = posters / f"{run_id}.png"
            poster_path.write_bytes(pdata)
            poster_rec = {"url": f"/static/posters/{poster_path.name}", "path": str(poster_path), "prebaked": False, "subject": title}
    clip_path = renders / f"{run_id}.mp4"
    standin = False
    data = await clip.read(IMPORT_MAX_BYTES + 1) if clip is not None else b""
    if data:
        if len(data) > IMPORT_MAX_BYTES:
            raise HTTPException(413, "the clip is larger than 200 MB")
        clip_path.write_bytes(data)
    elif poster_path is not None:
        made = await asyncio.to_thread(videogen.push_in, str(poster_path), clip_path)
        if made is None:
            raise HTTPException(422, "no clip, and the studio could not make a push-in over the poster (no ffmpeg here)")
        standin = True
        duration_ms = videogen.CLIP_MS
    else:
        raise HTTPException(422, "a night needs a clip, or at least a poster to make one from")
    render = {"status": "done", "url": f"/static/renders/{clip_path.name}", "path": str(clip_path), "prebaked": False,
              "standin": standin, "duration_ms": int(duration_ms) if duration_ms else 8000, "imported": True, "seconds": 0, "checks": 0}
    now = time.time()
    title = " ".join(title.split()) or "Untitled"
    with studio._lock:
        studio.state = RunState(status="done", run_id=run_id, idea=f"a night made in {source}", started_at=now, finished_at=now,
                                nodes_seen=["import"], active=None, direction={"title": title, "angle": "", "hook": ""},
                                script={"title": title, "description": description.strip(), "shots": [], "tags": []},
                                render=render, poster=poster_rec, thumbnail_url=poster_rec.get("url", ""))
    files.history_upsert(studio.record())
    bus.publish("run.start", run_id=run_id, idea=studio.state.idea)
    bus.publish("night.imported", run_id=run_id, title=title, source=source, poster=bool(poster_rec), standin=standin)
    bus.publish("run.done", seconds=0, render=render, script_title=title)
    return {"ok": True, "run_id": run_id, "title": title, "render": render, "poster": poster_rec}


# ── the whole night, unattended ─────────────────────────────────────────────
# What the lab's Post my video button runs from session 2 on: one idea in, the
# card on the wall out. The same Runner and the same graph as a night run by
# hand on the app's page; the one difference is the gate, answered here with
# its first direction instead of waiting for a person, and the publish,
# pressed as soon as the night is released.

AUTO: dict[str, dict] = {}


@router.post("/night/auto")
async def night_auto(body: Night):
    if body.event_code is not None or body.display_name is not None:
        files.save_profile(event_code=body.event_code, display_name=body.display_name)
    try:
        run_id = studio.start(body.idea)
    except Busy as e:
        raise HTTPException(409, str(e))
    AUTO[run_id] = {"run_id": run_id, "stage": "running", "picked": "", "detail": "", "video_id": "", "url": "", "publish": body.publish, "at": time.time()}
    asyncio.create_task(_auto_night(run_id, body.publish))
    bus.publish("night.auto", run_id=run_id, idea=body.idea.strip())
    return {"ok": True, "run_id": run_id}


@router.get("/night/auto/{run_id}")
async def night_auto_status(run_id: str):
    rec = AUTO.get(run_id)
    if rec is None:
        raise HTTPException(404, "no such unattended night (the app restarted?)")
    return rec


async def _auto_night(run_id: str, do_publish: bool, timeout_s: float = 1200) -> None:
    rec = AUTO[run_id]
    t0 = time.time()
    while time.time() - t0 < timeout_s:
        await asyncio.sleep(2)
        st = studio.state
        if st.run_id != run_id:
            rec.update(stage="superseded", detail="another run started in the app")
            return
        if st.status == "waiting_pick" and not rec["picked"]:
            first = st.candidates[0] if st.candidates else {}
            try:
                studio.pick("1")
            except Busy:
                continue
            rec.update(picked=first.get("title") or "the first", stage="picked")
            bus.publish("gate.auto", pick="1", title=first.get("title", ""), of=len(st.candidates))
        elif st.status == "failed":
            rec.update(stage="failed", detail=st.error or "the run failed")
            return
        elif st.status == "done":
            if st.render.get("status") != "done" or not st.render.get("url"):
                # the render did not deliver (refused, timed out, a stand-in with no file):
                # a push-in over the poster, when a real one was drawn, so the night still has a clip
                poster = (st.poster or {}).get("path") or ""
                if poster and os.path.exists(poster) and not st.poster.get("prebaked"):
                    out = config.MEDIA / "renders" / f"{run_id}_pushin.mp4"
                    made = await asyncio.to_thread(videogen.push_in, poster, out)
                    if made:
                        st.render.update(status="done", url=f"/static/renders/{out.name}", path=str(out), standin=True,
                                         duration_ms=videogen.CLIP_MS, reason="")
                        files.history_upsert(studio.record())
                        bus.publish("render.standin", url=st.render["url"], reason="the render did not deliver; a push-in over the poster instead")
            if st.render.get("status") != "done" or not st.render.get("url"):
                rec.update(stage="failed", detail=f"no clip: {st.render.get('reason') or 'the render did not deliver'}")
                return
            if not do_publish:
                rec.update(stage="done")
                return
            rec.update(stage="publishing")
            await publish.publish(st)
            pub = st.publish
            rec.update(stage="published" if pub.get("status") == "done" else "failed",
                       detail=pub.get("detail", ""), video_id=str(pub.get("video_id") or ""), url=pub.get("url", ""))
            return
    rec.update(stage="failed", detail="the night did not finish in twenty minutes")


@router.get("/history")
async def history():
    return {"items": files.history()}


@router.get("/download/{run_id}")
async def download(run_id: str):
    """The clip as a download, named after its title."""
    item = next((i for i in files.history() if i.get("run_id") == run_id), None)
    if item is None and studio.state.run_id == run_id:
        item = studio.record()
    if not item or not item.get("video_path"):
        raise HTTPException(404, "no clip for that run")
    path = files.pathlib.Path(item["video_path"])
    if not path.exists():
        raise HTTPException(404, "the clip file is gone")
    slug = re.sub(r"[^A-Za-z0-9]+", "-", item.get("title") or run_id).strip("-").lower() or run_id
    return FileResponse(path, media_type="video/mp4", filename=f"{slug}.mp4")
