"""The event bus: every change the app makes is one event, published here,
and /api/events streams the bus to every open page.

An event is {"type", "seq", "at", ...data, "state"}: the state field is the
folded run state after the event, so a page never has to reconstruct it and
a page that connects late is current from its first message. Events may be
published from any thread; they are handed to the server's loop.
"""
from __future__ import annotations

import asyncio
import contextlib
import json
import time
from typing import Any, Callable

HEARTBEAT_S = 15.0
LOG_MAX = 400


class Bus:
    def __init__(self) -> None:
        self._subs: set[asyncio.Queue] = set()
        self._loop: asyncio.AbstractEventLoop | None = None
        self._seq = 0
        self.log: list[dict[str, Any]] = []          # the current run's events, for late pages
        self.state_fn: Callable[[], dict] | None = None

    def attach(self, loop: asyncio.AbstractEventLoop, state_fn: Callable[[], dict]) -> None:
        self._loop = loop
        self.state_fn = state_fn

    # ── publishing, from any thread ────────────────────────────────────────
    def publish(self, type_: str, **data: Any) -> dict:
        ev = {"type": type_, "at": time.time(), **data}
        if self._loop is None or self._loop.is_closed():
            return ev
        if _on_loop(self._loop):
            self._emit(ev)
        else:
            self._loop.call_soon_threadsafe(self._emit, ev)
        return ev

    def _emit(self, ev: dict) -> None:
        self._seq += 1
        ev["seq"] = self._seq
        if self.state_fn is not None:
            ev["state"] = self.state_fn()
        if ev["type"] == "run.start":
            self.log = []
        self.log.append(ev)
        del self.log[:-LOG_MAX]
        for q in list(self._subs):
            try:
                q.put_nowait(ev)
            except asyncio.QueueFull:               # a stalled page: drop its oldest
                with contextlib.suppress(asyncio.QueueEmpty):
                    q.get_nowait()
                with contextlib.suppress(asyncio.QueueFull):
                    q.put_nowait(ev)

    # ── the stream ─────────────────────────────────────────────────────────
    async def stream(self, replay: bool = True):
        q: asyncio.Queue = asyncio.Queue(maxsize=512)
        self._subs.add(q)
        try:
            state = self.state_fn() if self.state_fn else {}
            yield _sse({"type": "snapshot", "at": time.time(), "seq": self._seq, "state": state,
                        "replay": self.log if replay else []})
            while True:
                try:
                    ev = await asyncio.wait_for(q.get(), timeout=HEARTBEAT_S)
                except asyncio.TimeoutError:
                    yield ": keep-alive\n\n"
                    continue
                yield _sse(ev)
        finally:
            self._subs.discard(q)


def _on_loop(loop: asyncio.AbstractEventLoop) -> bool:
    try:
        return asyncio.get_running_loop() is loop
    except RuntimeError:
        return False


def _sse(ev: dict) -> str:
    return f"data: {json.dumps(ev, ensure_ascii=False, default=str)}\n\n"


bus = Bus()
