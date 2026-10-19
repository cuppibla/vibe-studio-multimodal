"""The session helpers the lab shares: one session service per event loop,
and a sync bridge for the console commands."""
import asyncio

from google.adk.sessions import DatabaseSessionService

from . import config

# One session service - and therefore ONE SQLAlchemy async engine - per event
# loop. run() below disposes it before the loop closes.
_svc_by_loop: dict = {}


def svc() -> DatabaseSessionService:
    """The session service for the loop we are on, made once and reused.

    run() below disposes it before the loop closes. Called with no loop running
    (a caller driving its own asyncio), you get a fresh one and you own it."""
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return DatabaseSessionService(db_url=config.DB_URL)
    service = _svc_by_loop.get(loop)
    if service is None:
        service = _svc_by_loop[loop] = DatabaseSessionService(db_url=config.DB_URL)
    return service


def run(coro):
    """Sync bridge - every console command calls this.

    asyncio.run() builds a FRESH loop each time and closes it on the way out,
    so the engine svc() made inside must be disposed before that happens.
    Without this, aiosqlite's worker threads outlive their loop and every later
    callback raises `RuntimeError: Event loop is closed`."""
    async def _disposing():
        try:
            return await coro
        finally:
            service = _svc_by_loop.pop(asyncio.get_running_loop(), None)
            if service is not None:
                await service.close()   # DatabaseSessionService.close() -> db_engine.dispose()
    return asyncio.run(_disposing())


def users(app_name: str) -> list[str]:
    """Every user id that has a session for this app, adk web's "user" first.

    DatabaseSessionService can only list sessions one user at a time, so the
    store itself is asked which users exist. A run driven through the API
    under another id is then as visible to the delivery and the verify
    panels as one made in the dev UI."""
    found: list[str] = []
    try:
        import sqlite3
        db = config.RUNS / "sessions.db"
        if db.exists():
            with sqlite3.connect(db) as con:
                found = [r[0] for r in con.execute(
                    "select distinct user_id from sessions where app_name = ? order by update_time desc",
                    (app_name,))]
    except Exception:
        found = []
    order = ["user", config.USER, *found]
    return list(dict.fromkeys(u for u in order if u))
