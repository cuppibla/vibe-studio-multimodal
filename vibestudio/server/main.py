"""Vibe Studio, the app: one process, one port.

    /              the React page (web/dist)
    /api/...       the REST surface and the SSE stream (server/api.py)
    /static/...    renders, thumbnails, the avatar (runs/media)

Run:  python -m vibestudio            (port 4700, or $PORT)
"""
from __future__ import annotations

import asyncio
import contextlib
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles

from .agent.platform import config, memory, videogen
from .api import router
from .platform.bus import bus
from .runner import studio
from .platform.telemetry import setup_tracing

DIST = Path(__file__).resolve().parent.parent / "web" / "dist"


def _retry_hook(**info) -> None:
    """A retry in the agent code becomes an event the page shows with a clock."""
    bus.publish("retry", **info)


def create_app() -> FastAPI:
    print(f"  {setup_tracing()}")
    videogen.ON_RETRY = _retry_hook
    memory.ON_RETRY = _retry_hook

    @contextlib.asynccontextmanager
    async def lifespan(app: FastAPI):
        bus.attach(asyncio.get_running_loop(), studio.snapshot)
        yield

    app = FastAPI(title="Vibe Studio", lifespan=lifespan)
    app.include_router(router)
    past = Path(__file__).resolve().parent / "agent" / "media" / "past"
    if past.exists():
        app.mount("/static/past", StaticFiles(directory=past), name="past")
    app.mount("/static", StaticFiles(directory=config.MEDIA), name="media")

    if (DIST / "index.html").exists():
        app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

        @app.get("/{path:path}", include_in_schema=False)
        async def spa(path: str):
            candidate = DIST / path
            if path and candidate.is_file():
                return FileResponse(candidate)
            return FileResponse(DIST / "index.html")
    else:
        @app.get("/", include_in_schema=False)
        async def no_build():
            return PlainTextResponse("the page is not built: cd vibestudio/web && npm install && npm run build",
                                     status_code=503)
    return app


app = create_app()
