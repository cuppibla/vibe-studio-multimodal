"""The REST surface. Small on purpose: the page reads state from the SSE
stream and calls these to change something."""
from __future__ import annotations

import asyncio

import re

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

from .platform import avatar, files, graphinfo, publish
from .agent.platform import config
from .platform.bus import bus
from .runner import Busy, studio

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
