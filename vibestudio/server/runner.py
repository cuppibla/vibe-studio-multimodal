"""The Studio: one Runner over the complete workflow, one run at a time.

Everything the page shows comes from here. The Runner drives `wf` (the app's
own copy of the graph) on a worker thread with its own event loop, so a slow
node never stalls the server; every ADK event is folded into RunState and
published on the bus as one app event.

Three ways a run moves:
  start(idea)   a new session, the first leg: research -> propose -> the gate
  pick(n)       the gate's answer, by the call's id: persist -> policy -> script
                -> the desk submits the render and the run suspends again
  the poller    waits for Veo, then answers the desk's call by id: join_media
                releases (the poster branch finished long ago) and store_release
                keeps the clip and the poster together
"""
from __future__ import annotations

import asyncio
import json
import threading
import time
from dataclasses import asdict, dataclass, field
from typing import Any

from google.adk import Runner
from google.adk.sessions import DatabaseSessionService
from google.genai.types import Content, FunctionResponse, Part

from .agent.platform import config, state as run_file
from .agent.platform import videogen
from .agent.graph import wf
from .platform.bus import bus

POLL_S = 10.0
GATE = "adk_request_input"


class Busy(RuntimeError):
    pass


@dataclass
class RunState:
    status: str = "idle"            # idle | running | waiting_pick | rendering | done | failed
    run_id: str | None = None
    idea: str = ""
    started_at: float | None = None
    finished_at: float | None = None
    nodes_seen: list[str] = field(default_factory=list)   # in the order the run reached them
    active: str | None = None
    research: dict = field(default_factory=dict)          # trends count, backlog count, feedback passages
    memory_facts: int = 0
    candidates: list[dict] = field(default_factory=list)
    gate_call_id: str | None = None
    pick: str | None = None
    direction: dict = field(default_factory=dict)         # title, angle, hook
    route: str | None = None                              # OK | BLOCK
    cleaned: dict = field(default_factory=dict)
    script: dict = field(default_factory=dict)            # title, description, opening_line, shots, tags
    render: dict = field(default_factory=dict)            # call_id, operation, status, url, checks, started_at
    thumbnail_url: str = ""
    poster: dict = field(default_factory=dict)            # url, path, prebaked, subject: from make_poster
    publish: dict = field(default_factory=dict)           # status, attempts, url, detail
    error: str = ""

    def as_dict(self) -> dict:
        d = asdict(self)
        d.pop("gate_call_id", None)
        return d


def _node_of(ev) -> str | None:
    info = getattr(ev, "node_info", None)
    path = getattr(info, "path", None) if info is not None else None
    if not path:
        return None
    return path.rsplit("/", 1)[-1].split("@")[0]


def _texts(content) -> list[str]:
    parts = getattr(content, "parts", None) or []
    return [p.text for p in parts if getattr(p, "text", None)]


class Studio:
    def __init__(self) -> None:
        self.state = RunState()
        self._lock = threading.Lock()
        self._loop: asyncio.AbstractEventLoop | None = None
        self._runner: Runner | None = None
        self._svc: DatabaseSessionService | None = None
        self._thread = threading.Thread(target=self._worker, name="studio-runner", daemon=True)
        self._ready = threading.Event()
        self._thread.start()
        self._ready.wait(10)

    # ── the worker thread: its own loop, its own session service ──────────
    def _worker(self) -> None:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        self._loop = loop
        self._svc = DatabaseSessionService(db_url=config.DB_URL)
        self._runner = Runner(app_name=config.APP, agent=wf, session_service=self._svc)
        self._ready.set()
        loop.run_forever()

    def _submit(self, coro) -> None:
        assert self._loop is not None
        asyncio.run_coroutine_threadsafe(coro, self._loop)

    # ── what the page asks ─────────────────────────────────────────────────
    def snapshot(self) -> dict:
        return self.state.as_dict()

    def start(self, idea: str) -> str:
        with self._lock:
            if self.state.status in ("running", "waiting_pick", "rendering"):
                raise Busy(f"a run is {self.state.status.replace('_', ' ')}; one at a time")
            run_id = f"run_{int(time.time())}"
            self.state = RunState(status="running", run_id=run_id, idea=idea.strip(), started_at=time.time())
        run_file.save({"run_id": run_id, "hint": idea.strip(),
                       "lineage": {"evidence": [], "gates": {}}})
        bus.publish("run.start", run_id=run_id, idea=idea.strip())
        text = idea.strip() or " "
        self._submit(self._leg(Content(role="user", parts=[Part(text=text)]), fresh=True))
        return run_id

    def pick(self, pick: str) -> None:
        st = self.state
        if st.status != "waiting_pick" or not st.gate_call_id:
            raise Busy("no pick is pending")
        st.status = "running"
        st.pick = pick
        bus.publish("gate.answered", pick=pick)
        part = Part(function_response=FunctionResponse(
            id=st.gate_call_id, name=GATE, response={"pick": pick}))
        self._submit(self._leg(Content(role="user", parts=[part])))

    # ── one leg of the run: drive until the graph stops ────────────────────
    async def _leg(self, message: Content, fresh: bool = False) -> None:
        st = self.state
        assert self._runner and self._svc
        try:
            if fresh:
                await self._svc.create_session(app_name=config.APP, user_id=config.USER, session_id=st.run_id)
            async for ev in self._runner.run_async(user_id=config.USER, session_id=st.run_id, new_message=message):
                self._absorb(ev)
        except Exception as e:
            st.status = "failed"
            st.error = f"{type(e).__name__}: {str(e)[:300]}"
            st.active = None
            bus.publish("error", detail=st.error)
            return
        self._settle()

    def _settle(self) -> None:
        st = self.state
        if st.status == "waiting_pick" or st.status == "rendering":
            return
        st.status = "done"
        st.finished_at = time.time()
        st.active = None
        from .platform.files import history_upsert
        history_upsert(self.record())
        bus.publish("run.done", seconds=round(st.finished_at - (st.started_at or st.finished_at)),
                    render=st.render, script_title=st.script.get("title", ""))

    def record(self) -> dict:
        """The run as the history keeps it."""
        st = self.state
        return {"run_id": st.run_id, "at": st.finished_at or time.time(), "idea": st.idea,
                "title": st.script.get("title") or st.direction.get("title") or "",
                "direction": st.direction.get("title", ""), "hook": st.direction.get("hook", ""),
                "video_url": st.render.get("url") or "", "video_path": st.render.get("path") or "",
                "render_status": st.render.get("status", ""), "prebaked": bool(st.render.get("prebaked")),
                "duration_ms": st.render.get("duration_ms"), "thumbnail_url": st.thumbnail_url,
                "poster_url": st.poster.get("url", ""), "poster_prebaked": bool(st.poster.get("prebaked")),
                "publish_url": st.publish.get("url", ""),
                "seconds": round((st.finished_at or time.time()) - (st.started_at or time.time()))}

    # ── fold one ADK event into the state ──────────────────────────────────
    def _absorb(self, ev) -> None:
        st = self.state
        node = _node_of(ev)
        if node and node not in st.nodes_seen:
            st.nodes_seen.append(node)
            st.active = node
            if node == "scripter" and st.route is None and "policy_check" in st.nodes_seen:
                st.route = "OK"
                bus.publish("route", node="policy_check", route="OK")
            if node == "quarantine":
                st.route = "BLOCK"
                bus.publish("route", node="policy_check", route="BLOCK")
            bus.publish("node.start", node=node)
        out = getattr(ev, "output", None)
        delta = dict((getattr(ev, "actions", None) and ev.actions.state_delta) or {})
        texts = _texts(getattr(ev, "content", None)) + _texts(getattr(ev, "message", None))

        if node in ("scan_trends", "read_backlog", "read_feedback") and isinstance(out, dict):
            if node == "scan_trends":
                st.research["trends"] = [t.get("topic", "") for t in out.get("trends", [])][:5]
            if node == "read_backlog":
                st.research["backlog"] = len(out.get("backlog") or [])
            if node == "read_feedback":
                st.research["feedback"] = [p[:140] for p in (out.get("feedback") or [])][:3]
                st.research["feedback_query"] = out.get("query", "")
            bus.publish("node.end", node=node, summary=self._summary(node, out))
        elif node == "join_research" and isinstance(out, dict):
            bus.publish("node.end", node=node, summary=f"bundle: {', '.join(out.keys())}")
        if "memory_facts" in delta:
            st.memory_facts = len(delta.get("memory_facts") or [])
            bus.publish("memory.recalled", facts=st.memory_facts)
        if node == "propose_directions":
            for t in texts:
                try:
                    cands = json.loads(t).get("candidates") or []
                except (ValueError, AttributeError):
                    continue
                if st.candidates:
                    continue
                st.candidates = [{"title": c.get("title", ""), "angle": c.get("angle", ""), "hook": c.get("hook", ""), "style": c.get("style", ""),
                                  "sources": sorted({e.get("source", "") for e in (c.get("evidence") or []) if isinstance(e, dict)})}
                                 for c in cands if isinstance(c, dict)]
                bus.publish("node.end", node=node, summary=f"{len(st.candidates)} candidates")
        for f in ev.get_function_calls() or []:
            if f.name == GATE:
                args = f.args or {}
                payload = args.get("payload") or {}
                if payload.get("candidates"):
                    st.candidates = [{"title": c.get("title", ""), "angle": c.get("angle", ""), "hook": c.get("hook", ""), "style": c.get("style", ""),
                                      "sources": sorted({e.get("source", "") for e in (c.get("evidence") or []) if isinstance(e, dict)})}
                                     for c in payload["candidates"]]
                st.gate_call_id = f.id
                st.status = "waiting_pick"
                bus.publish("gate.open", message=args.get("message", ""), candidates=st.candidates, call_id=f.id)
            if f.name == "render_submit":
                st.render = {"call_id": f.id, "prompt": (f.args or {}).get("prompt", ""), "status": "submitting",
                             "checks": 0, "started_at": time.time()}
        for r in ev.get_function_responses() or []:
            if r.name == "render_submit" and isinstance(r.response, dict) and r.response.get("status") == "pending":
                st.render.update(operation=r.response.get("operation", ""), status="pending")
                st.status = "rendering"
                bus.publish("render.pending", operation=st.render["operation"], real=config.REAL_VIDEO)
                self._submit(self._poll_render(st.render["call_id"], st.render["operation"]))
        if "direction" in delta:
            st.direction = {"title": delta.get("direction", ""), "angle": delta.get("angle", ""), "hook": delta.get("hook", "")}
            bus.publish("direction", **st.direction)
        if node == "quarantine" and isinstance(out, dict) and out.get("title"):
            st.cleaned = {"title": out.get("title", ""), "angle": out.get("angle", "")}
            bus.publish("node.end", node=node, summary=f"cleaned: {st.cleaned['title']}")
        if node == "scripter":
            for t in texts:
                try:
                    s = json.loads(t)
                except ValueError:
                    continue
                if isinstance(s, dict) and s.get("title") and "shots" in s and not st.script:
                    st.script = {"title": s.get("title", ""), "description": s.get("description", ""),
                                 "opening_line": s.get("opening_line", ""), "tags": s.get("tags", []), "style": s.get("style", ""),
                                 "shots": [sh.get("description", "") if isinstance(sh, dict) else str(sh) for sh in s.get("shots", [])]}
                    bus.publish("node.end", node=node, summary=f"\"{st.script['title']}\" · {len(st.script['shots'])} shots")
        if "memory_written" in delta:
            flags = delta.get("memory_written") or []
            bus.publish("memory.written", actions=[f.get("action", "") for f in flags if isinstance(f, dict)])
        if node == "make_poster" and isinstance(out, dict) and out.get("url"):
            st.poster = {"url": out.get("url", ""), "path": out.get("path", ""), "prebaked": bool(out.get("prebaked")),
                         "subject": out.get("subject", "")}
            # a real poster is the clip's thumbnail on the platform; a stand-in is
            # not, so the page still captures a frame for that
            if not st.poster["prebaked"] and not st.thumbnail_url:
                st.thumbnail_url = st.poster["url"]
            bus.publish("poster.ready", url=st.poster["url"], prebaked=st.poster["prebaked"], subject=st.poster["subject"])
            bus.publish("node.end", node=node, summary=f"poster: {st.poster['subject'][:60] or st.poster['url']}")
        elif node == "join_media" and isinstance(out, dict):
            bus.publish("node.end", node=node, summary=f"both branches in: {', '.join(out.keys())}")
        elif node in ("script_check", "script_ready") and out is not None:
            route = getattr(getattr(ev, "actions", None), "route", None)
            bus.publish("node.end", node=node, summary=f"route {route}" if route else "ready")
        elif node == "store_release" and isinstance(out, dict):
            st.render.update(status=out.get("status", st.render.get("status")), url=out.get("url") or st.render.get("url", ""))
            if out.get("poster_url") and not st.poster.get("url"):
                st.poster["url"] = out["poster_url"]
            bus.publish("node.end", node=node, summary=f"render {st.render.get('status')} · poster {'yes' if st.poster.get('url') else 'none'}")
        elif node in ("persist_direction", "policy_check") and out is not None:
            bus.publish("node.end", node=node, summary=self._summary(node, out))

    @staticmethod
    def _summary(node: str, out: Any) -> str:
        if node == "scan_trends":
            return f"{len(out.get('trends', []))} topics"
        if node == "read_backlog":
            return f"{len(out.get('backlog') or [])} notes" + (" · tonight's idea" if out.get("idea") else "")
        if node == "read_feedback":
            n = len(out.get("feedback") or [])
            return f"{n} passages" if n else (out.get("note") or "no passages")
        if node == "persist_direction" and isinstance(out, dict):
            return out.get("title", "")
        if node == "policy_check":
            return "checked"
        return ""

    # ── the render: wait for Veo, answer the desk by id ────────────────────
    async def _poll_render(self, call_id: str, operation: str) -> None:
        st = self.state
        t0 = time.time()
        deadline = t0 + videogen.TIMEOUT_S
        status: dict = {"done": False}
        while time.time() < deadline:
            status = await asyncio.to_thread(videogen.check, operation)
            st.render["checks"] = st.render.get("checks", 0) + 1
            if status.get("done"):
                break
            bus.publish("render.check", n=st.render["checks"], elapsed=round(time.time() - t0))
            await asyncio.sleep(POLL_S)
        if not status.get("done"):
            status = {"done": True, "error": f"no result after {int(videogen.TIMEOUT_S)}s"}
        rec = run_file.load()
        if "error" in status:
            st.render.update(status="failed", reason=status["error"])
            rec["render"] = {"status": "failed", "reason": status["error"], "operation": operation, "prompt": st.render.get("prompt", "")}
            run_file.save(rec)
            bus.publish("render.failed", reason=status["error"], seconds=round(time.time() - t0))
            response = {"status": "failed", "reason": status["error"]}
        else:
            st.render.update(status="done", url=status.get("url") or "", path=status.get("path") or "",
                             prebaked=bool(status.get("prebaked")), seconds=round(time.time() - t0),
                             duration_ms=status.get("duration_ms") or videogen.CLIP_MS)
            rec["render"] = {"status": "done", "url": status.get("url"), "path": status.get("path"),
                             "prebaked": bool(status.get("prebaked")), "operation": operation,
                             "prompt": st.render.get("prompt", ""), "duration_ms": status.get("duration_ms")}
            run_file.save(rec)
            bus.publish("render.done", url=st.render["url"], prebaked=st.render["prebaked"], seconds=st.render["seconds"])
            response = {"status": "done", "url": status.get("url") or "(prebaked stand-in)"}
        st.status = "running"
        part = Part(function_response=FunctionResponse(id=call_id, name="render_submit", response=response))
        await self._leg(Content(role="user", parts=[part]))


studio = Studio()
