"""Worker processes: the lab's CLI drivers (`python -m agent.<verb>`), run as
asyncio subprocesses so the API never blocks.

Every button in the frontend maps to exactly one driver invocation, the same
command a student could type in a terminal. Output lines are written to
runs/<verb>_run.log (the file the stage derivation reads) and published on
the event bus, and the exit code lands in runs/ui_last.json so the run view
can blame the right stage after a failure.
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
import time
from dataclasses import dataclass, field

from agent.platform import config

from .events import bus

LAST = config.RUNS / "ui_last.json"


@dataclass
class Proc:
    verb: str
    argv: list[str]
    process: asyncio.subprocess.Process
    started_at: float = field(default_factory=time.time)
    #: Identifies this run to the page that started it. The page cannot compare
    #: timestamps with the server: in Cloud Shell the browser and the server are
    #: two machines with two clocks, and a few seconds of skew is enough to make
    #: a running command look finished. This token is minted here and comes back
    #: in the exit record, so a page can recognise its own run and nothing else.
    run: str = ""


class Workers:
    def __init__(self) -> None:
        self._running: dict[str, Proc] = {}
        self._seq = 0

    # ── queries ────────────────────────────────────────────────────────────
    def busy(self) -> str | None:
        """The verb of the most recently started live worker, or None."""
        live = [p for p in self._running.values() if p.process.returncode is None]
        return max(live, key=lambda p: p.started_at).verb if live else None

    def running(self) -> list[str]:
        return [v for v, p in self._running.items() if p.process.returncode is None]

    def run_id(self, verb: str) -> str | None:
        """The token of the live run of one verb, or None if nothing is live."""
        proc = self._running.get(verb)
        return proc.run if proc and proc.process.returncode is None else None

    @staticmethod
    def last_exit() -> dict | None:
        try:
            return json.loads(LAST.read_text())
        except (OSError, ValueError):
            return None

    # ── control ────────────────────────────────────────────────────────────
    async def start(self, verb: str, *args: str, force: bool = False,
                    exclusive: bool = True) -> tuple[bool, str]:
        """Start `python -m agent.<verb> *args`.

        exclusive: refuse if any worker is live (a second `run` must not
        start under a live one). force: bypass that and also allow a second
        instance of the same verb (Approve / Regenerate must never be
        swallowed by a finish worker that is still polling).
        """
        if not force:
            if exclusive and self.busy():
                return False, f"{self.busy()} is still running"
            if verb in self.running():
                return False, f"{verb} is already running"
        module = f"agent.platform.{verb}" if verb in ("bank", "rag") else f"agent.{verb}"   # deliver stays in agent/
        argv = [sys.executable, "-m", module, *args]
        return await self._spawn(verb, argv)


    async def start_script(self, verb: str, path: str, *args: str) -> tuple[bool, str]:
        """A plain Python script (scripts/reset.py) rather than an agent module."""
        return await self._spawn(verb, [sys.executable, path, *args])

    async def stop_all(self) -> list[str]:
        stopped = []
        for verb, p in list(self._running.items()):
            if p.process.returncode is None:
                p.process.terminate()
                try:
                    await asyncio.wait_for(p.process.wait(), 2.0)
                except asyncio.TimeoutError:
                    p.process.kill()
                stopped.append(verb)
        return stopped

    # ── internals ──────────────────────────────────────────────────────────
    async def _spawn(self, verb: str, argv: list[str]) -> tuple[bool, str]:
        env = {**os.environ, "PYTHONUNBUFFERED": "1",
               "PATH": f"{config.ROOT / '.venv' / 'bin'}:{os.environ.get('PATH', '')}"}
        log_path = config.RUNS / f"{verb}_run.log"
        process = await asyncio.create_subprocess_exec(
            *argv, cwd=str(config.ROOT), env=env,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
        self._seq += 1
        proc = Proc(verb=verb, argv=argv, process=process,
                    run=f"{verb}-{int(time.time() * 1000)}-{self._seq}")
        self._running[verb] = proc
        LAST.unlink(missing_ok=True)           # no stale outcome while this one runs
        bus.publish({"type": "worker", "event": "started", "verb": verb, "at": time.time()})
        bus.mark_dirty()
        asyncio.create_task(self._pump(proc, log_path))
        return True, " ".join(argv[1:])

    async def _pump(self, proc: Proc, log_path) -> None:
        assert proc.process.stdout is not None
        with log_path.open("w") as log:
            async for raw in proc.process.stdout:
                line = raw.decode("utf-8", "replace").rstrip("\n")
                log.write(line + "\n")
                log.flush()
                bus.publish({"type": "log", "verb": proc.verb, "line": line, "at": time.time()})
        code = await proc.process.wait()
        LAST.write_text(json.dumps({"verb": proc.verb, "code": code,
                                    "at": time.time(), "run": proc.run}))
        bus.publish({"type": "worker", "event": "exited", "verb": proc.verb,
                     "code": code, "at": time.time(), "run": proc.run})
        bus.mark_dirty()


workers = Workers()
