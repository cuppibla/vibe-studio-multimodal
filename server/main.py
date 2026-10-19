"""Vibe Studio: one server, one port.

    /                 the React frontend (web/dist), SPA fallback
    /api/code/...     read/write the lab's editable files   (server/api/code.py)
    /api/lab/...      evidence checks, the SSE stream, the console workers (server/api/lab.py)
    /static/...       generated media: renders, art
    /inspector/...    the ADK dev UI and API, mounted with url_prefix

Run:  uvicorn server.main:app --port 4600
Dev:  scripts/dev.sh  (this server + the Vite dev server on 5173)
"""
from __future__ import annotations

import asyncio
import contextlib
import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from agent.platform import config  # noqa: E402
from server.api import code, lab  # noqa: E402
from server.services.events import snapshot, watcher  # noqa: E402
from server.services.workers import workers  # noqa: E402

DIST = ROOT / "web" / "dist"
MEDIA = config.RUNS / "media"          # renders and art the lab generates, served at /static


def build_inspector() -> FastAPI:
    """The ADK dev UI + API as a sub-application. url_prefix tells the Angular
    bundle where its backend lives once it is mounted under /inspector."""
    from google.adk.cli import fast_api as adk_fast_api

    from .services import reload as agent_reload

    # With web=True, get_fast_api_app does `from .dev_server import DevServer`
    # at call time and builds that; replacing fast_api.ApiServer reaches nothing,
    # and a save then never evicts the dev UI's caches. Subclass the class it
    # really instantiates, in the module it imports it from. Older or trimmed
    # builds without dev_server fall back to ApiServer in fast_api itself.
    try:
        from google.adk.cli import dev_server as _home
        base = _home.DevServer
    except (ImportError, AttributeError):
        _home = adk_fast_api
        base = getattr(adk_fast_api, "ApiServer", None) or adk_fast_api.DevServer
    name = base.__name__

    class _CapturingServer(base):  # type: ignore[misc, valid-type]
        """Same server; we only keep a handle so a save can evict its caches."""

        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            agent_reload.handle.server = self

        async def get_runner_async(self, app_name: str):
            # Every run passes through here. A Runner seen for the first time was
            # just built, and gets stamped with the sources it was built from, so
            # the page can say whether adk web is running the student's save.
            runner = await super().get_runner_async(app_name)
            agent_reload.note_runner(app_name, runner)
            return runner

    setattr(_home, name, _CapturingServer)
    return adk_fast_api.get_fast_api_app(
        agents_dir=str(ROOT),
        session_service_uri=config.DB_URL,
        allow_origins=["*"],
        web=True,
        url_prefix="/inspector",
        reload_agents=True,
    )


def create_app() -> FastAPI:
    inspector = build_inspector()

    @contextlib.asynccontextmanager
    async def lifespan(app: FastAPI):
        task = asyncio.create_task(watcher(snapshot))
        # Starlette does not run a mounted app's lifespan; run the inspector's
        # explicitly so its own startup/shutdown hooks fire.
        async with inspector.router.lifespan_context(inspector):
            try:
                yield
            finally:
                task.cancel()
                await workers.stop_all()

    app = FastAPI(title="Vibe Studio", lifespan=lifespan)

    @app.middleware("http")
    async def never_cache_the_api(request, call_next):
        """Every /api answer describes the state of this moment. Cloud Shell
        reaches the server through a proxy, and a status served from a cache
        is a command that looks finished, or output that looks empty."""
        response = await call_next(request)
        if request.url.path.startswith("/api"):
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
            response.headers["Pragma"] = "no-cache"
        return response

    app.include_router(code.router)
    app.include_router(lab.router)
    app.mount("/inspector", inspector)
    MEDIA.mkdir(parents=True, exist_ok=True)
    PAST = ROOT / "agent" / "media" / "past"
    if PAST.exists():                         # the channel's past posters: the corpus's picture half (step 5b)
        app.mount("/static/past", StaticFiles(directory=PAST), name="past")
    app.mount("/static", StaticFiles(directory=MEDIA), name="media")

    if (DIST / "index.html").exists():
        app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

        @app.get("/{path:path}", include_in_schema=False)
        async def spa(path: str):
            candidate = DIST / path
            if path and candidate.is_file():
                return FileResponse(candidate)
            return FileResponse(DIST / "index.html", headers={"Cache-Control": "no-cache, no-store, must-revalidate"})
    else:
        @app.get("/", include_in_schema=False)
        async def no_build():
            return PlainTextResponse(
                "Frontend not built. Run `cd web && npm run build` for one port, "
                "or `scripts/dev.sh` to use the Vite dev server on :5173.\n"
                "API is up at /api/run; ADK dev UI at /inspector/dev-ui/.")

    return app


app = create_app()
