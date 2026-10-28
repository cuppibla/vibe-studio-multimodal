"""/api/lab: verification for the hands-on steps.

Each endpoint reads the same ADK session store the dev UI writes to and
answers a concrete question the step asked the student to produce evidence
for. Nothing here greps source or trusts the page; it reads events.
"""
from __future__ import annotations

import ast
import asyncio
import json
import os
import re
import subprocess
import sys
import time
import uuid
from collections import Counter

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from agent.platform import config, drive

from ..services.workers import workers

ROOT = config.ROOT
router = APIRouter(prefix="/api/lab", tags=["lab"])

STAGE_APPS = ["stage0_prompt", "stage1_fanout", "stage3_router", "stage4_memory", "stage5_rag", "stage6_video"]


@router.get("/events")
async def events():
    """The lab's SSE stream: a snapshot on connect, worker log lines, and a
    fresh snapshot whenever a watched file changes."""
    from ..services.events import stream
    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.get("/trends")
def trends():
    """The trend feed the step 3b page shows: the same pool scan_trends draws from."""
    from agent.trends import sample_trends
    return {"trends": sample_trends()}


@router.get("/inspector")
async def inspector():
    """Is the mounted ADK dev UI ready, and which apps will it list."""
    apps = [a for a in STAGE_APPS if (ROOT / a / "agent.py").exists()]
    return {"up": True, "url": "/inspector/dev-ui/", "apps": apps}


def _texts(ev) -> list[str]:
    msg = getattr(ev, "message", None) or getattr(ev, "content", None)
    return [p.text for p in (getattr(msg, "parts", None) or []) if getattr(p, "text", None)]


async def _sessions(app_name: str):
    svc = drive.svc()
    out = []
    for user in drive.users(app_name):
        try:
            resp = await svc.list_sessions(app_name=app_name, user_id=user)
        except Exception:
            continue
        for meta in resp.sessions:
            s = await svc.get_session(app_name=app_name, user_id=user, session_id=meta.id)
            if s is not None:
                out.append((user, s))
    out.sort(key=lambda us: getattr(us[1], "last_update_time", 0) or 0)
    return out


def tools_wired(path=ROOT / "stage0_prompt" / "agent.py") -> list[str]:
    """Names in the `tools=[...]` list of the Agent(...) call, read from the
    file on disk. This is what the student edits in step 3."""
    try:
        tree = ast.parse(path.read_text())
    except (OSError, SyntaxError):
        return []
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and getattr(node.func, "id", "") == "Agent":
            for kw in node.keywords:
                if kw.arg == "tools" and isinstance(kw.value, ast.List):
                    return [e.id for e in kw.value.elts if isinstance(e, ast.Name)]
    return []


def poster_wired(path=ROOT / "stage0_prompt" / "agent.py") -> bool:
    """Does make_poster call the image model (images.generate) in the file on disk."""
    try:
        tree = ast.parse(path.read_text())
    except (OSError, SyntaxError):
        return False
    for node in tree.body:
        if isinstance(node, ast.FunctionDef) and node.name == "make_poster":
            return "images.generate(" in ast.unparse(node)
    return False


@router.get("/stage0")
async def stage0():
    """Evidence for step 2, read from the file and the session store: which
    tools are wired, whether the agent ran, which tools it called, and the
    poster the last call drew."""
    sessions = await _sessions("stage0_prompt")
    calls: Counter = Counter()
    user_msgs: list[str] = []
    replies: list[str] = []
    poster: dict | None = None
    for _, s in sessions:
        for ev in s.events:
            for f in ev.get_function_calls() or []:
                calls[f.name] += 1
            for r in ev.get_function_responses() or []:
                if r.name == "make_poster" and isinstance(r.response, dict) and r.response.get("url"):
                    poster = {k: r.response.get(k, "") for k in ("status", "url", "prebaked", "note", "model")}
            if getattr(ev, "author", "") == "user":
                user_msgs += _texts(ev)
            else:
                replies += _texts(ev)
    last_reply = replies[-1] if replies else ""
    wired = tools_wired()
    return {
        "tools_wired": wired,
        "tools_complete": {"check_trends", "read_backlog", "make_poster"} <= set(wired),
        "poster_wired": poster_wired(),
        "sessions": len(sessions),
        "latest_session_id": sessions[-1][1].id if sessions else None,
        "tool_calls": dict(calls),
        "called_trends": calls.get("check_trends", 0) > 0,
        "called_backlog": calls.get("read_backlog", 0) > 0,
        "called_poster": calls.get("make_poster", 0) > 0,
        "poster": poster,
        "turns": len(user_msgs),
        "last_reply": last_reply[:1200],
    }


EXPECTED_FANOUT = {("START", "scan_trends", "join_research"),
                   ("START", "read_backlog", "join_research")}


def join_defined(path=ROOT / "stage1_fanout" / "agent.py") -> bool:
    """Is join_research assigned a JoinNode(...) call in the file on disk."""
    try:
        tree = ast.parse(path.read_text())
    except (OSError, SyntaxError):
        return False
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "join_research" for t in node.targets):
            call = node.value
            if isinstance(call, ast.Call):
                fn = call.func
                name = fn.id if isinstance(fn, ast.Name) else getattr(fn, "attr", "")
                return name == "JoinNode"
    return False


def _list_items(expr, tree) -> list:
    """The elements of an edges expression: a list literal, or a list literal
    plus a module-level NAME bound to a list (edges=[...] + LOOP_EDGES, the
    shape the loop and media-desk holes use)."""
    if isinstance(expr, ast.List):
        return list(expr.elts)
    if isinstance(expr, ast.BinOp) and isinstance(expr.op, ast.Add):
        return _list_items(expr.left, tree) + _list_items(expr.right, tree)
    if isinstance(expr, ast.Name):
        for node in tree.body:
            if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == expr.id for t in node.targets):
                return _list_items(node.value, tree)
    return []


def workflow_edges(path) -> list[tuple[str, ...]]:
    """The chains in the `edges=[...]` list of the Workflow(...) call, as
    tuples of names. Dict targets (routers) are rendered as 'route:{...}'."""
    try:
        tree = ast.parse(path.read_text())
    except (OSError, SyntaxError):
        return []
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and getattr(node.func, "id", "") == "Workflow":
            for kw in node.keywords:
                if kw.arg == "edges":
                    out = []
                    for el in _list_items(kw.value, tree):
                        if isinstance(el, ast.Tuple):
                            names = []
                            for e in el.elts:
                                if isinstance(e, ast.Name):
                                    names.append(e.id)
                                elif isinstance(e, ast.Dict):
                                    names.append("route:{" + ", ".join(
                                        getattr(k, "value", "?") for k in e.keys) + "}")
                            out.append(tuple(names))
                    return out
    return []


def _node_name(ev) -> str | None:
    info = getattr(ev, "node_info", None)
    path = getattr(info, "path", None) if info is not None else None
    if not path and isinstance(info, dict):
        path = info.get("path")
    if not path:
        return None
    return path.rsplit("/", 1)[-1].split("@")[0]


@router.get("/stage1")
async def stage1():
    """Evidence for step 4b: the edge list in stage1_fanout/agent.py, and what
    the workflow's sessions show about which nodes ran and what they output."""
    edges = workflow_edges(ROOT / "stage1_fanout" / "agent.py")
    sessions = await _sessions("stage1_fanout")
    nodes: list[str] = []
    bundle = ""
    backlog_count = None
    runs = 0
    for _, sess in sessions:
        for ev in sess.events:
            name = _node_name(ev)
            if not name:
                continue
            if name == "stage1_fanout":
                continue
            if name not in nodes:
                nodes.append(name)
            out = getattr(ev, "output", None)
            if name == "join_research" and isinstance(out, dict):
                bundle = json.dumps(out, ensure_ascii=False, indent=1)
                runs += 1
            if name == "read_backlog" and isinstance(out, dict):
                backlog_count = len(out.get("backlog") or [])
    return {
        "edges": [list(e) for e in edges],
        "edges_complete": set(edges) == EXPECTED_FANOUT,
        "join_defined": join_defined(),
        "sessions": len(sessions),
        "runs": runs,
        "nodes_ran": nodes,
        "readers_ran": {"scan_trends", "read_backlog"} <= set(nodes),
        "joined": "join_research" in nodes,
        "backlog_count": backlog_count,
        "bundle": bundle[:2000],
    }


def gate_has_request_input(path=ROOT / "agent" / "graph.py") -> bool:
    """Does direction_gate yield a RequestInput(...)? Read from the AST."""
    try:
        tree = ast.parse(path.read_text())
    except (OSError, SyntaxError):
        return False
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef) and node.name == "direction_gate":
            for sub in ast.walk(node):
                if isinstance(sub, ast.Yield) and isinstance(sub.value, ast.Call) \
                        and getattr(sub.value.func, "id", "") == "RequestInput":
                    return True
    return False


@router.get("/stage3/load")
async def stage3_load():
    return await _load_app("stage3_router")


@router.get("/stage4/load")
async def stage4_load():
    return await _load_app("stage4_memory")


@router.get("/stage5/load")
async def stage5_load():
    return await _load_app("stage5_rag")


@router.get("/stage6/load")
async def stage6_load():
    return await _load_app("stage6_video")


@router.get("/loaded/{app}")
async def loaded(app: str):
    """Is adk web running the code on disk for this app? current, fresh or
    stale, with when the files were saved and when the Runner was built."""
    if app not in STAGE_APPS:
        raise HTTPException(404, f"unknown app {app!r}")
    from ..services import reload as agent_reload
    return agent_reload.status(app)


@router.post("/loaded/{app}/refresh")
async def refresh_loaded(app: str):
    """Make adk web current for this app: reload the agent modules in place
    and drop the cached Runner, then report as /loaded does."""
    if app not in STAGE_APPS:
        raise HTTPException(404, f"unknown app {app!r}")
    from ..services import reload as agent_reload
    return agent_reload.refresh(app)


@router.get("/load/{app}")
async def any_load(app: str):
    """Load any stage app in a fresh interpreter: the check every run panel offers."""
    if app not in STAGE_APPS:
        raise HTTPException(404, f"unknown app {app!r}")
    return await _load_app(app)


async def _load_app(app: str):
    """Import a stage app in a fresh interpreter and report whether the
    Workflow accepts it. Anything ADK refuses shows up here as the same
    validation error adk web would raise."""
    import asyncio
    proc = await asyncio.create_subprocess_exec(
        sys.executable, "-c",
        # ADK leaves .graph as None on a Workflow whose edge list is still empty,
        # so an app with no edges yet must not be reported as an agent.
        f"import {app}.agent as m; r = m.root_agent; g = getattr(r, 'graph', None); "
        f"print(len(g.edges) if g is not None else "
        f"('0' if type(r).__name__ == 'Workflow' else 'agent:' + str(len(getattr(r, 'tools', []) or []))))",
        cwd=str(ROOT), stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"})
    try:
        out, err = await asyncio.wait_for(proc.communicate(), timeout=90)
    except asyncio.TimeoutError:
        proc.kill()
        return {"ok": False, "error": "import timed out"}
    if proc.returncode == 0:
        said = out.decode().strip()
        if said.startswith("agent:"):
            return {"ok": True, "edges": None, "tools": int(said[6:] or 0), "error": ""}
        return {"ok": True, "edges": int(said or 0), "error": ""}
    text = err.decode(errors="replace")
    lines = [l.strip() for l in text.strip().splitlines() if l.strip()]
    # pydantic prints the ADK message on a "Value error, ..." line and then a
    # docs footer; the message is the part worth showing.
    said = [l for l in lines if l.startswith("Value error,")]
    meaningful = [l for l in lines if not l.startswith("For further information visit")]
    msg = said[-1].removeprefix("Value error,").strip() if said else (meaningful[-1] if meaningful else text)
    return {"ok": False, "error": msg[:600]}


def _assigned_call(path, name: str) -> str | None:
    """For `name = Something(...)` at module level, the callee's name; for
    `def name(...)`, "def"; None when neither is present."""
    try:
        tree = ast.parse(path.read_text())
    except (OSError, SyntaxError):
        return None
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == name:
            return "def"
        if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == name for t in node.targets):
            call = node.value
            if isinstance(call, ast.Call):
                fn = call.func
                return fn.id if isinstance(fn, ast.Name) else getattr(fn, "attr", None)
            return None
    return None


def _mode_kw(path, name: str) -> str | None:
    try:
        tree = ast.parse(path.read_text())
    except (OSError, SyntaxError):
        return None
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == name for t in node.targets) and isinstance(node.value, ast.Call):
            for kw in node.value.keywords:
                if kw.arg == "mode" and isinstance(kw.value, ast.Constant):
                    return str(kw.value.value)
    return None


def _policy_hits(text: str) -> list[str]:
    """The refused words in `text`, the way policy_check finds them: whole
    words from agent/policy_words.txt. Read here, not imported from the
    student's agent/graph.py, so a half-edited file cannot take the server down."""
    try:
        words = [w.strip().lower() for w in (ROOT / "agent" / "policy_words.txt").read_text().splitlines()
                 if w.strip() and not w.strip().startswith("#")]
    except OSError:
        return []
    low = text.lower()
    return [w for w in words if re.search(rf"\b{re.escape(w)}\b", low)]


def policy_route_wired(path=ROOT / "agent" / "graph.py") -> bool:
    """Does policy_check end in `return Event(..., route=...)`."""
    try:
        tree = ast.parse(path.read_text())
    except (OSError, SyntaxError):
        return False
    for node in tree.body:
        if isinstance(node, ast.FunctionDef) and node.name == "policy_check":
            for sub in ast.walk(node):
                if isinstance(sub, ast.Return) and isinstance(sub.value, ast.Call):
                    fn = sub.value.func
                    name = fn.id if isinstance(fn, ast.Name) else getattr(fn, "attr", "")
                    if name == "Event" and any(kw.arg == "route" for kw in sub.value.keywords):
                        return True
    return False


@router.get("/stage3")
async def stage3():
    """Evidence for session 3b: what stage3_router/agent.py wires (the router,
    its two exits, the way back from quarantine) and what its sessions show:
    routes taken, quarantine's tool calls, the cleaned direction, the script."""
    path = ROOT / "stage3_router" / "agent.py"
    edges = workflow_edges(path)
    tail = next((e for e in edges if e and e[0] == "join_research"), ())
    route_edge = next((e for e in edges if e and e[0] == "policy_check" and len(e) > 1 and e[1].startswith("route:")), ())
    scripter_call = _assigned_call(path, "scripter")
    quarantine_call = _assigned_call(path, "quarantine")
    quarantine_mode = _mode_kw(path, "quarantine")
    if quarantine_call == "def":
        quarantine_kind = "function"
    elif quarantine_call in ("Agent", "LlmAgent"):
        quarantine_kind = "task agent" if quarantine_mode == "task" else f"agent ({quarantine_mode or 'single_turn'})"
    else:
        quarantine_kind = None

    sessions = await _sessions("stage3_router")
    state: dict = dict(sessions[-1][1].state or {}) if sessions else {}
    nodes: list[str] = []
    routes: list[str] = []
    tool_calls: dict[str, int] = {}
    cleaned: dict | None = None            # from the latest session where quarantine finished a task
    cleaned_script_title = ""              # the script written in that same session, after the cleanup
    blocked_message = ""
    script_title = ""
    # the last run, as the student saw it: what the stand-in gate took and why,
    # which exit the router named, and the words that decided it. The BLOCK
    # row reads these to say what to change when no run has been refused yet.
    last_idea = ""
    last_gate = ""
    last_route = ""
    last_hits: list[str] = []
    last_run_nodes: list[str] = []
    for _, sess in sessions:
        finished_task = False
        sess_cleaned: dict | None = None
        sess_script = ""
        for ev in sess.events:
            name = _node_name(ev)
            if name and name != "stage3_router" and name not in nodes:
                nodes.append(name)
            if getattr(ev, "author", "") == "user":            # a new run starts: the last-run record starts over
                texts = _texts(ev)
                last_idea, last_gate, last_route, last_hits, last_run_nodes = (texts[0] if texts else ""), "", "", [], []
            if name and name != "stage3_router" and name not in last_run_nodes:
                last_run_nodes.append(name)
            route = getattr(getattr(ev, "actions", None), "route", None)
            if name == "choose_direction":
                for text in _texts(ev):
                    if text.startswith("stand-in gate"):
                        last_gate = text[:200]
            if name == "policy_check" and route:
                routes.append(route)
                last_route = route
                out = getattr(ev, "output", None)
                out = out.model_dump() if hasattr(out, "model_dump") else (out if isinstance(out, dict) else {})
                last_hits = _policy_hits(f"{out.get('title', '')} {out.get('angle', '')}")
            if name == "quarantine":
                for f in ev.get_function_calls() or []:
                    tool_calls[f.name] = tool_calls.get(f.name, 0) + 1
                    if f.name == "finish_task":
                        finished_task = True
                out = getattr(ev, "output", None)
                # the 3b placeholder also outputs a dict with a title, flagged blocked; only a
                # task agent's finish_task output counts as a cleaned direction
                if finished_task and isinstance(out, dict) and out.get("title") and not out.get("blocked"):
                    sess_cleaned = {k: out.get(k, "") for k in ("title", "angle", "hook")}
                for text in _texts(ev):
                    if "blocked" in text.lower():
                        blocked_message = text[:200]
            if name == "scripter":
                for text in _texts(ev):
                    try:
                        title = json.loads(text).get("title", "")
                    except (ValueError, AttributeError):
                        continue
                    if title:
                        script_title = title
                        if sess_cleaned:
                            sess_script = title
        if sess_cleaned:
            cleaned, cleaned_script_title = sess_cleaned, sess_script
    return {
        "edges": [list(e) for e in edges],
        "chain": list(tail),
        "pick_wired": "choose_direction" in tail,
        "router_wired": bool(tail) and tail[-1] == "policy_check",
        "routes_wired": bool(route_edge) and "OK" in route_edge[1] and "BLOCK" in route_edge[1],
        "reroute_wired": any(tuple(e[:2]) == ("quarantine", "scripter") for e in edges),
        "script_wired": any(tuple(e[:2]) == ("scripter", "script_ready") for e in edges),
        "scripter_defined": scripter_call in ("Agent", "LlmAgent"),
        "policy_route_wired": policy_route_wired(),
        "quarantine_kind": quarantine_kind,
        "sessions": len(sessions),
        "nodes_ran": nodes,
        "routes": routes,
        "ok_runs": routes.count("OK"),
        "block_runs": routes.count("BLOCK"),
        "last_run": {"idea": last_idea[:200], "gate": last_gate, "route": last_route, "hits": last_hits,
                     "nodes": last_run_nodes, "picked_4": "candidate 4" in last_gate},
        "tool_calls": tool_calls,
        "cleaned": cleaned,
        "cleaned_script_title": cleaned_script_title,
        "blocked_message": blocked_message,
        "script_title": script_title,
        "direction": state.get("direction"),
        "angle": state.get("angle"),
        "hook": state.get("hook"),
        "state_keys": sorted(k for k in state.keys() if not k.startswith("_")),
    }


def _callback_kw(path, agent_name: str, kw: str) -> str | None:
    """The name passed as `kw=` on `agent_name = Agent(...)`, or None."""
    try:
        tree = ast.parse(path.read_text())
    except (OSError, SyntaxError):
        return None
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == agent_name for t in node.targets) and isinstance(node.value, ast.Call):
            for k in node.value.keywords:
                if k.arg == kw:
                    return k.value.id if isinstance(k.value, ast.Name) else ast.unparse(k.value)
    return None


@router.get("/memory")
async def memory_bank():
    """The bank itself: connected or not, and everything it holds for the
    creator's scope. One network call; the page asks on a click."""
    from agent.platform import memory
    engine = memory.engine_name()
    if not engine:
        return {"connected": False, "engine": None, "memories": []}
    import asyncio
    try:
        rows = await asyncio.to_thread(memory.list_all)
    except Exception as e:
        return {"connected": True, "engine": engine, "memories": [], "error": str(e)[:200]}
    return {"connected": True, "engine": engine, "memories": rows}


@router.get("/stage4")
async def stage4():
    """Evidence for step 6: the two callbacks in stage4_memory/agent.py, the
    bank connection, and what the latest run read and wrote."""
    from agent.platform import memory
    path = ROOT / "stage4_memory" / "agent.py"
    recall = _callback_kw(path, "propose_directions", "before_model_callback")
    remember = _callback_kw(path, "scripter", "after_agent_callback")
    sessions = await _sessions("stage4_memory")
    nodes: list[str] = []
    proposed: list[str] = []
    state: dict = {}
    for _, sess in sessions:
        for ev in sess.events:
            name = _node_name(ev)
            if name and name != "stage4_memory" and name not in nodes:
                nodes.append(name)
            if name == "propose_directions":
                for text in _texts(ev):
                    try:
                        cands = json.loads(text).get("candidates") or []
                    except (ValueError, AttributeError):
                        continue
                    proposed = [c.get("title", "") for c in cands if isinstance(c, dict)]
    if sessions:
        state = dict(sessions[-1][1].state or {})
    facts = state.get("memory_facts") or []
    return {
        "bank_connected": bool(memory.engine_name()),
        "recall_wired": recall == "recall_taste",
        "remember_wired": remember == "remember_pick",
        "recall_kw": recall,
        "remember_kw": remember,
        "sessions": len(sessions),
        "nodes_ran": nodes,
        "proposed_titles": proposed,
        "memory_facts": facts,
        "memory_written": state.get("memory_written") or [],
        "direction": state.get("direction"),
    }


BANK_CMDS = {"connect": [], "load": ["load"], "list": ["list"], "reset": ["reset"]}


@router.post("/bank/{cmd}")
async def bank_run(cmd: str):
    """Run `python -m agent.platform.bank <cmd>` as a worker. Its output streams on the
    event bus as log lines with verb "bank"; the page shows them live."""
    from ..services.workers import workers
    if cmd not in BANK_CMDS:
        raise HTTPException(404, f"unknown bank command {cmd!r}")
    if "bank" in workers.running():
        return {"ok": False, "detail": "a bank command is still running"}
    ok, detail = await workers.start("bank", *BANK_CMDS[cmd], exclusive=False)
    return {"ok": ok, "detail": detail, "cmd": cmd, "run": workers.run_id("bank")}


@router.get("/bank/status")
async def bank_status():
    from ..services.workers import workers
    last = workers.last_exit() or {}
    return {"running": "bank" in workers.running(),
            "run": workers.run_id("bank"),
            "last_exit": last if last.get("verb") == "bank" else None}


# ── step 7 · RAG Engine ──────────────────────────────────────────────────────

@router.get("/rag")
async def rag_corpus():
    """The corpus: connected or not, and the files it holds. One network
    call; the page asks on a click."""
    from agent.platform import rag
    name = rag.corpus_name()
    if not name:
        return {"connected": False, "corpus": None, "files": [], "comments": len(rag.comments()), "captions": len(rag.captions()), "posters": len(rag.posters()), "blocked": rag.blocked_reason()}
    import asyncio
    try:
        files = await asyncio.to_thread(rag.list_files)
    except Exception as e:
        return {"connected": True, "corpus": name, "files": [], "comments": len(rag.comments()), "captions": len(rag.captions()), "posters": len(rag.posters()), "error": str(e)[:200]}
    return {"connected": True, "corpus": name, "files": files, "comments": len(rag.comments()), "captions": len(rag.captions()), "posters": len(rag.posters())}


FEEDBACK_EDGE = ("START", "read_feedback", "join_research")


def posters_wired(path=ROOT / "agent" / "graph.py") -> bool:
    """Does read_feedback hand back the media with the passages (media_in in its return)."""
    try:
        tree = ast.parse(path.read_text())
    except (OSError, SyntaxError):
        return False
    for node in tree.body:
        if isinstance(node, ast.FunctionDef) and node.name == "read_feedback":
            return "media_in(" in ast.unparse(node)
    return False


@router.get("/stage5")
async def stage5():
    """Evidence for step 7b: the third reader's edge in stage5_rag/agent.py,
    the corpus connection, and what the latest run retrieved and proposed."""
    from agent.platform import rag
    edges = workflow_edges(ROOT / "stage5_rag" / "agent.py")
    sessions = await _sessions("stage5_rag")
    nodes: list[str] = []
    proposed: list[dict] = []
    feedback: dict = {}
    for _, sess in sessions:
        for ev in sess.events:
            name = _node_name(ev)
            if name and name != "stage5_rag" and name not in nodes:
                nodes.append(name)
            out = getattr(ev, "output", None)
            if name == "read_feedback" and isinstance(out, dict):
                feedback = out
            if name == "propose_directions":
                for text in _texts(ev):
                    try:
                        cands = json.loads(text).get("candidates") or []
                    except (ValueError, AttributeError):
                        continue
                    proposed = [{"title": c.get("title", ""), "angle": c.get("angle", ""),
                                 "sources": sorted({e.get("source", "") for e in (c.get("evidence") or []) if isinstance(e, dict)})}
                                for c in cands if isinstance(c, dict)]
    return {
        "corpus_connected": bool(rag.corpus_name()),
        "corpus_blocked": rag.blocked_reason(),
        "feedback_wired": FEEDBACK_EDGE in edges,
        "edges": [list(e) for e in edges],
        "sessions": len(sessions),
        "nodes_ran": nodes,
        "feedback_ran": "read_feedback" in nodes,
        "feedback_query": feedback.get("query"),
        "feedback_passages": feedback.get("feedback") or [],
        "feedback_note": feedback.get("note"),
        "feedback_posters": [m["url"] for m in (feedback.get("media") or []) if isinstance(m, dict) and m.get("kind") == "poster"],
        "feedback_media": feedback.get("media") or [],
        "posters_wired": posters_wired(),
        "media_wired": posters_wired(),
        "captions": len(rag.captions()),
        "posters": len(rag.posters()),
        "proposed": proposed,
        "cited_feedback": any("feedback" in c["sources"] for c in proposed),
    }


RAG_CMDS = {"connect": [], "load": ["load"], "audience": ["load", "--audience"], "list": ["list"], "reset": ["reset"], "query": ["query"]}


@router.get("/audience")
async def audience():
    """What the audience sent, for the grid on session 4a: every file with its
    URL and the reader's line once the ingest has read it; which readers are
    wired in audience.READERS (read from the file on disk, not the import)."""
    from agent.platform import audience as aud
    src = (ROOT / "agent" / "platform" / "audience.py").read_text()
    m = re.search(r"READERS = \[(.*?)\]", src, re.S)
    body = m.group(1) if m else ""
    live = [l.split("#", 1)[0] for l in body.splitlines()]              # the names on uncommented lines
    wired = ["comments"] + [k for k, fn in (("voice", "transcribe_voice"), ("photo", "caption_photos"), ("clip", "watch_clips"))
                             if any(fn in l for l in live)]
    items = aud.items()
    counts = {k: sum(1 for i in items if i["kind"] == k) for k in ("voice", "photo", "clip")}
    read = {k: sum(1 for i in items if i["kind"] == k and i["line"]) for k in ("voice", "photo", "clip")}
    try:
        comments = sum(1 for l in (ROOT / "agent" / "comments.md").read_text().splitlines() if l.startswith("- "))
    except OSError:
        comments = 0
    return {"items": items, "counts": {"comments": comments, **counts}, "read": read, "wired": wired,
            "readers_wired": {"voice", "photo", "clip"} <= set(wired)}


@router.post("/rag/{cmd}")
async def rag_run(cmd: str, body: dict | None = None):
    """Run `python -m agent.platform.rag <cmd>` as a worker. Output streams on the event
    bus as log lines with verb "rag". `query` takes {"text": ...}."""
    from ..services.workers import workers
    if cmd not in RAG_CMDS:
        raise HTTPException(404, f"unknown rag command {cmd!r}")
    args = list(RAG_CMDS[cmd])
    if cmd == "query":
        text = ((body or {}).get("text") or "").strip()
        if not text:
            raise HTTPException(400, "query needs text")
        args.append(text)
    if "rag" in workers.running():
        return {"ok": False, "detail": "a rag command is still running"}
    ok, detail = await workers.start("rag", *args, exclusive=False)
    return {"ok": ok, "detail": detail, "cmd": cmd, "run": workers.run_id("rag")}


@router.get("/rag/status")
async def rag_status():
    from ..services.workers import workers
    last = workers.last_exit() or {}
    return {"running": "rag" in workers.running(),
            "run": workers.run_id("rag"),
            "last_exit": last if last.get("verb") == "rag" else None}


# ── step 8 · the video ───────────────────────────────────────────────────────

def state_share_wired(path=ROOT / "agent" / "graph.py") -> bool:
    """Does make_poster yield Event(..., state={... "poster_url": ...}) - the STATE_SHARE edit."""
    try:
        tree = ast.parse(path.read_text())
    except (OSError, SyntaxError):
        return False
    for node in tree.body:
        if isinstance(node, ast.FunctionDef) and node.name == "make_poster":
            for sub in ast.walk(node):
                if isinstance(sub, ast.Yield) and isinstance(sub.value, ast.Call):
                    fn = sub.value.func
                    name = fn.id if isinstance(fn, ast.Name) else getattr(fn, "attr", "")
                    if name == "Event" and any(kw.arg == "state" and "poster_url" in ast.unparse(kw.value) for kw in sub.value.keywords):
                        return True
    return False


def tool_wrapped(path, agent_name: str, tool_fn: str) -> str | None:
    """How `tool_fn` appears in the tools=[...] of the Agent assigned to
    `agent_name`: "LongRunningFunctionTool" when wrapped, "plain" when bare,
    None when absent."""
    try:
        tree = ast.parse(path.read_text())
    except (OSError, SyntaxError):
        return None
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == agent_name for t in node.targets) and isinstance(node.value, ast.Call):
            for kw in node.value.keywords:
                if kw.arg == "tools" and isinstance(kw.value, ast.List):
                    for el in kw.value.elts:
                        if isinstance(el, ast.Name) and el.id == tool_fn:
                            return "plain"
                        if isinstance(el, ast.Call) and any(isinstance(a, ast.Name) and a.id == tool_fn for a in el.args):
                            return getattr(el.func, "id", None) or ast.unparse(el.func)
    return None


RENDER_CHAIN = ("script_ready", "render_desk", "join_media")
POSTER_CHAIN = ("script_ready", "make_poster", "join_media")
RELEASE_EDGE = ("join_media", "store_release")


@router.get("/stage6")
async def stage6():
    """Evidence for step 6: the wrapper and the two branches in stage6_video/agent.py,
    and the latest session's render: pending (a call with no final response),
    delivered (render_url in state), or not started; and the poster beside it."""
    from agent.platform import state as run_state
    path = ROOT / "stage6_video" / "agent.py"
    wrapped = tool_wrapped(path, "render_desk", "render_submit")
    edges = workflow_edges(path)
    from checks.holes import HOLES
    _, d_anchor, d_snippet = HOLES["DELIVER_RESPONSE"]
    deliver_src = (ROOT / "agent" / "deliver.py").read_text()
    deliver_wired = d_anchor not in deliver_src and "function_response=FunctionResponse(" in deliver_src and "function_response=None" not in deliver_src
    sessions = await _sessions("stage6_video")
    nodes: list[str] = []
    pending: dict | None = None
    submitted: dict | None = None
    st: dict = {}
    session: dict | None = None
    asked = answered = 0                      # the gate: adk_request_input calls and their answers, this session
    release_poster: str | None = None         # store_release's poster_url: None until it ran, "" when the poster was not in state
    if sessions:
        user, sess = sessions[-1]
        session = {"id": sess.id, "user": user}
        st = dict(sess.state or {})
        lr, calls, receipts, latest = set(), {}, {}, {}
        for ev in sess.events:
            name = _node_name(ev)
            if name and name != "stage6_video" and name not in nodes:
                nodes.append(name)
            if getattr(ev, "long_running_tool_ids", None):
                lr |= set(ev.long_running_tool_ids)
            for f in ev.get_function_calls() or []:
                calls[f.id] = (f.name, dict(f.args or {}))
                if f.name == "adk_request_input":
                    asked += 1
            for r in ev.get_function_responses() or []:
                resp = r.response if isinstance(r.response, dict) else {}
                latest[r.id] = resp
                if r.name == "adk_request_input":
                    answered += 1
                if resp.get("status") == "pending":
                    receipts[r.id] = resp                  # the receipt: the tool's own return value
            out = getattr(ev, "output", None)
            if name == "store_release" and isinstance(out, dict):
                release_poster = out.get("poster_url") or ""
        for cid in lr:
            name, args = calls.get(cid, ("", {}))
            if name != "render_submit":
                continue
            submitted = {"call_id": cid, "prompt": (args.get("prompt") or "")[:300],
                         "operation": receipts.get(cid, {}).get("operation", ""),
                         "final": latest.get(cid, {}).get("status", "")}
            if latest.get(cid, {}).get("status") == "pending":
                pending = submitted
    run = run_state.load()
    render = run.get("render") or {}
    poster = run.get("poster") or {}
    return {
        "tool": wrapped,                          # "LongRunningFunctionTool" | "plain" | None
        "tool_wrapped": wrapped == "LongRunningFunctionTool",
        "gate_has_request_input": gate_has_request_input(),
        "asked": asked,
        "answered": answered,
        "state_share_wired": state_share_wired(),
        "poster_in_state": bool(st.get("poster_url")),
        "release_poster": release_poster,
        "state_keys": sorted(k for k in st.keys() if not k.startswith("_")),
        "deliver_wired": deliver_wired,
        "chain_wired": RENDER_CHAIN in edges,
        "media_wired": POSTER_CHAIN in edges and RELEASE_EDGE in edges,
        "sessions": len(sessions),
        "session": session,                       # the latest session: the dev UI opens it by id
        "nodes_ran": nodes,
        "desk_ran": "render_desk" in nodes,
        "poster_ran": "make_poster" in nodes,
        "join_ran": "join_media" in nodes,
        "released": "store_release" in nodes,
        "submitted": submitted,
        "pending": pending,
        "delivered": "render_url" in st,
        "render_url": st.get("render_url") or "",
        "render_status": st.get("render_status") or "",
        "poster_url": st.get("poster_url") or poster.get("url") or "",
        "poster_prebaked": bool(poster.get("prebaked")),
        "render_file": render if render.get("operation") == (submitted or {}).get("operation") else {},
        "real_video": config.REAL_VIDEO,
    }


VIDEO_CMDS = {"deliver": [], "status": ["status"]}


@router.post("/video/{cmd}")
async def video_run(cmd: str):
    """Run `python -m agent.deliver [status]` as a worker; output streams on
    the event bus with verb "deliver"."""
    from ..services.workers import workers
    if cmd not in VIDEO_CMDS:
        raise HTTPException(404, f"unknown video command {cmd!r}")
    if "deliver" in workers.running():
        return {"ok": False, "detail": "a deliver command is still running"}
    ok, detail = await workers.start("deliver", *VIDEO_CMDS[cmd], exclusive=False)
    return {"ok": ok, "detail": detail, "cmd": cmd, "run": workers.run_id("deliver")}


@router.get("/video/status")
async def video_status():
    from ..services.workers import workers
    last = workers.last_exit() or {}
    return {"running": "deliver" in workers.running(),
            "run": workers.run_id("deliver"),
            "last_exit": last if last.get("verb") == "deliver" else None}


# ── step 9 · deploy the app ──────────────────────────────────────────────────
# Setup starts the deploy in the background (nohup vibestudio/deploy.py --by
# setup), so by the time the page asks, the app is usually being built or
# already live. deploy.py holds runs/.deploy.lock for its whole run and keeps
# runs/deploy.json current (deploying · done · failed), whoever started it.

DEPLOY_SCRIPT = ROOT / "vibestudio" / "deploy.py"
DEPLOY_RECORD = config.RUNS / "deploy.json"
DEPLOY_SETUP_LOG = config.RUNS / "deploy_setup.log"


def _deploying() -> bool:
    try:
        from agent.platform.memory import creation_in_progress
        return creation_in_progress("deploy")
    except Exception:
        return False


@router.post("/deploy")
async def deploy_run():
    """Run `python vibestudio/deploy.py --by page` as a worker; its output
    streams on the event bus with verb "deploy". The service URL lands in
    runs/deploy.json. One deploy at a time: setup's, in the background, counts."""
    from ..services.workers import workers
    if "deploy" in workers.running():
        return {"ok": False, "detail": "a deploy is still running"}
    if _deploying():
        return {"ok": False, "detail": "setup's deploy is still running in the background (runs/deploy_setup.log); wait for it"}
    ok, detail = await workers.start_script("deploy", str(DEPLOY_SCRIPT), "--by", "page")
    return {"ok": ok, "detail": detail}


def _tail(path, n: int = 12) -> list[str]:
    try:
        lines = [l for l in path.read_text(errors="replace").splitlines() if l.strip() and not re.search(r"Warning|warn\(", l)]
    except OSError:
        return []
    return lines[-n:]


@router.get("/deploy/status")
async def deploy_status(probe: bool = False):
    """Where the deploy stands, whoever started it: the record, the lock, the
    log's tail; with probe=1, whether the service answers /api/health."""
    from ..services.workers import workers
    last = workers.last_exit() or {}
    record = _read_json(DEPLOY_RECORD)
    worker_live = "deploy" in workers.running()
    in_progress = worker_live or _deploying()
    status = record.get("status") or ("done" if record.get("url") else "")
    if in_progress:
        status = "deploying"
    elif status == "deploying":
        status = "interrupted"                 # the record never ended and nothing holds the lock: the process died
    by = record.get("by", "") or ("page" if worker_live else "")
    log = DEPLOY_SETUP_LOG if by == "setup" else config.RUNS / "deploy_run.log"
    reachable = None
    if probe and record.get("url"):
        import httpx
        try:
            async with httpx.AsyncClient(timeout=6, follow_redirects=True) as c:
                reachable = (await c.get(f"{record['url']}/api/health")).status_code == 200
        except Exception:
            reachable = False
    return {"running": in_progress, "worker": worker_live, "status": status, "by": by,
            "started_at": record.get("started_at"), "detail": record.get("detail", ""), "seconds": record.get("seconds"),
            "last_exit": last if last.get("verb") == "deploy" else None,
            "url": record.get("url", ""), "service": record.get("service", ""), "project": record.get("project", ""),
            "region": record.get("region", ""), "at": record.get("at"), "reachable": reachable,
            "log_tail": _tail(log) if (in_progress or status in ("failed", "interrupted")) else [],
            "gcloud_project": os.environ.get("GOOGLE_CLOUD_PROJECT", ""),
            "app_built": (ROOT / "vibestudio" / "web" / "dist" / "index.html").exists()}


# ── session 7b · publish: the deployed app posts the night to VibeTube ──────
# Nothing runs here: VibeStudio (on Cloud Run, or wherever the page points) holds
# the night, its profile names the room, and its publish.py does the POST. This
# server only relays the page's clicks and reads the result back, because a page
# served from one origin cannot ask another origin's API directly.

PUBLISH_RECORD = config.RUNS / "publish.json"       # the app URL the page last used


def _read_json(path) -> dict:
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return {}


def _app_url(given: str | None = None) -> str:
    """The VibeStudio the page talks to: the URL it gave, else the one it used
    last, else the deploy's, else STUDIO_APP_URL."""
    url = (given or "").strip() or _read_json(PUBLISH_RECORD).get("app_url") or _read_json(DEPLOY_RECORD).get("url") or os.environ.get("STUDIO_APP_URL", "")
    return url.rstrip("/")


@router.get("/publish/status")
async def publish_status(url: str | None = None):
    """What the app holds (its last night, its profile, its publish record), the
    room the event code names, the video VibeTube lists under that id, and
    whether its thumbnail is the poster, byte for byte."""
    import hashlib
    import httpx
    app = _app_url(url)
    out: dict = {"app_url": app, "reachable": False, "night": None, "profile": None, "publish": {}, "room": None, "video": None, "thumbnail_match": None}
    if not app:
        return out
    async with httpx.AsyncClient(timeout=25, follow_redirects=True) as c:
        try:
            r = await c.get(f"{app}/api/state")
            r.raise_for_status()
            st = r.json()
            out["reachable"] = True
        except Exception as e:
            out["error"] = f"{type(e).__name__}: {str(e)[:140]}"
            return out
        try:
            prof = (await c.get(f"{app}/api/profile")).json()
        except Exception:
            prof = {}
        render = st.get("render") or {}
        poster = st.get("poster") or {}
        pub = st.get("publish") or {}
        out["night"] = {"status": st.get("status") or "idle",
                        "title": (st.get("script") or {}).get("title") or (st.get("direction") or {}).get("title") or "",
                        "clip": render.get("status") == "done" and bool(render.get("url")),
                        "clip_url": render.get("url") or "", "clip_prebaked": bool(render.get("prebaked")),
                        "poster": bool(poster.get("url")), "poster_prebaked": bool(poster.get("prebaked")),
                        "poster_url": poster.get("url") or ""}
        out["profile"] = {k: prof.get(k, "") for k in ("platform_url", "event_code", "display_name", "project_id")}
        out["publish"] = {k: pub.get(k) for k in ("status", "video_id", "url", "detail", "attempts", "event")}
        platform = (prof.get("platform_url") or "https://vibetube.dev").rstrip("/")
        code = (prof.get("event_code") or "").strip()
        if code:
            room = {"code": code, "name": "", "open": False, "state": "", "reason": "", "url": f"{platform}/e/{code}"}
            try:
                r = await c.get(f"{platform}/api/events/{code}")
                if r.status_code == 200:
                    ev = r.json()
                    room.update(name=ev.get("name", ""), open=bool(ev.get("uploadOpen")), state=ev.get("uploadState") or "", reason=ev.get("reason") or "")
                else:
                    room.update(state=str(r.status_code), reason="no room with this code; codes are case-sensitive" if r.status_code == 404 else r.text[:100])
            except Exception as e:
                room.update(state="unreachable", reason=str(e)[:100])
            out["room"] = room
        vid = pub.get("video_id")
        if code and vid:
            try:
                rows = (await c.get(f"{platform}/api/events/{code}/videos")).json()
                rows = rows if isinstance(rows, list) else rows.get("videos") or []
                v = next((row for row in rows if str(row.get("id")) == str(vid)), None)
                if v:
                    thumb = v.get("thumbnailUrl") or ""
                    if thumb.startswith("/"):
                        thumb = platform + thumb
                    out["video"] = {"id": str(vid), "status": v.get("status", ""), "title": v.get("title", ""), "channel": v.get("channelName", ""),
                                    "thumbnail_url": thumb, "watch_url": f"{platform}/e/{code}?v={vid}", "project_id": v.get("projectId", "")}
                    if thumb and poster.get("url") and not poster.get("prebaked"):
                        try:
                            a = (await c.get(thumb)).content
                            b = (await c.get(f"{app}{poster['url']}")).content
                            out["thumbnail_match"] = hashlib.sha256(a).hexdigest() == hashlib.sha256(b).hexdigest()
                            out["thumbnail_bytes"] = [len(a), len(b)]
                        except Exception:
                            out["thumbnail_match"] = None
            except Exception as e:
                out["video_error"] = str(e)[:100]
    if url:
        PUBLISH_RECORD.write_text(json.dumps({**_read_json(PUBLISH_RECORD), "app_url": app}))
    return out


@router.post("/publish")
async def publish_run(body: dict | None = None):
    """Set the app's profile (the room, the name) and press publish there. The
    app answers at once; its publish record says how it went (publish/status)."""
    import httpx
    body = body or {}
    app = _app_url(body.get("url"))
    if not app:
        return {"ok": False, "detail": "no VibeStudio URL: deploy on 7a, or paste the URL of a running app"}
    fields = {k: body[k] for k in ("event_code", "display_name", "platform_url") if isinstance(body.get(k), str)}
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as c:
        try:
            if fields:
                r = await c.put(f"{app}/api/profile", json=fields)
                if r.status_code != 200:
                    return {"ok": False, "detail": f"the app refused the profile: {r.status_code} {r.text[:120]}"}
            r = await c.post(f"{app}/api/publish", json={"confirm": bool(body.get("confirm"))})
        except Exception as e:
            return {"ok": False, "detail": f"cannot reach {app}: {type(e).__name__}: {str(e)[:120]}"}
    if r.status_code != 200:
        try:
            detail = r.json().get("detail", r.text[:160])
        except ValueError:
            detail = r.text[:160]
        return {"ok": False, "detail": f"{r.status_code} {detail}"}
    PUBLISH_RECORD.write_text(json.dumps({**_read_json(PUBLISH_RECORD), "app_url": app, "event_code": fields.get("event_code", ""), "at": time.time()}))
    return {"ok": True, "detail": "publishing: the app posts the clip with the poster as its thumbnail; check again in a few seconds"}


# ── Post my video · tonight, as far as it has got, through the studio ────────
# The button on every page (web/src/components/PostDock.tsx). Setup deployed
# VibeStudio in the background; from then on scripts/post.py hands the app the
# newest poster and clip the sessions left in runs/ (or a push-in over the
# poster, when no clip exists yet) as a finished night, and presses publish
# there - the app makes the one request to the room, as 7b teaches. This
# server says what there is to post and where the app is, runs the script as a
# worker so its output streams, and reads VibeTube back for the verify rows.
# server/services/night.py has the reading; the record is runs/post.json.

POST_SCRIPT = ROOT / "scripts" / "post.py"


@router.get("/post/status")
async def post_status(code: str | None = None, live: bool = True):
    """What would go out (the poster, the clip, the title), who posts where,
    the studio (the deploy's state, and - live - whether it answers), the last
    post's record, and - live - the room's window now, the card VibeTube lists,
    and whether its thumbnail is the poster, byte for byte."""
    from ..services import night
    from ..services.workers import workers
    n = await night.night()
    prof = night.profile()
    rec = night.record()
    stu = night.studio()
    stu["deploying"] = stu["status"] == "deploying"
    stu["reachable"] = None
    out: dict = {"night": n, "profile": prof, "studio": stu, "last": rec, "posting": "post" in workers.running(),
                 "run": workers.run_id("post"), "room": None, "video": None, "thumbnail_match": None}
    if not live:
        return out
    if stu["url"]:
        state = await asyncio.to_thread(night.app_state, stu["url"], 8)
        stu["reachable"] = state is not None
        stu["run_status"] = (state or {}).get("status", "")
        stu["active"] = (state or {}).get("active") or ""
        stu["nodes_seen"] = (state or {}).get("nodes_seen") or []
        stu["render_checks"] = ((state or {}).get("render") or {}).get("checks") or 0
        stu["run_title"] = ((state or {}).get("script") or {}).get("title") or ""
        stu["publish"] = {k: ((state or {}).get("publish") or {}).get(k) for k in ("status", "video_id", "url", "detail", "attempts")}
    probe = (code or prof["event_code"] or "").strip()
    if probe:
        out["room"] = await asyncio.to_thread(night.room, probe, prof["platform_url"])
    if rec.get("video_id") and rec.get("event_code"):
        v = await asyncio.to_thread(night.video, rec["event_code"], rec["video_id"], rec.get("platform_url") or prof["platform_url"])
        out["video"] = v
        sent = rec.get("poster") or ""
        if v and v.get("thumbnail_url") and sent and (sent.startswith(("http://", "https://")) or os.path.exists(sent)):
            out["thumbnail_match"] = await asyncio.to_thread(night.thumbnail_matches, v["thumbnail_url"], sent)
    return out


@router.post("/post")
async def post_run(body: dict | None = None):
    """Run `python scripts/post.py` as a worker (verb "post"); its output
    streams on the event bus and the result lands in runs/post.json."""
    from ..services.workers import workers
    body = body or {}
    if "post" in workers.running():
        return {"ok": False, "detail": "a post is still going out"}
    args: list[str] = []
    for key, flag in (("title", "--title"), ("description", "--description"), ("event_code", "--event"), ("display_name", "--name"), ("app", "--app")):
        val = body.get(key)
        if isinstance(val, str) and val.strip():
            args += [flag, val.strip()]
    if body.get("push_in"):
        args.append("--push-in")
    if isinstance(body.get("night"), str):
        args += ["--night", body["night"].strip()]
    ok, detail = await workers.start_script("post", str(POST_SCRIPT), *args)
    return {"ok": ok, "detail": detail, "run": workers.run_id("post")}


# ── jumping between steps: the registry, from the page ──────────────────────

# ── a message the page sends for the student ────────────────────────────────
# The Run panel's buttons ("Run the OK route", "Run the BLOCK route"): one
# message to a stage app, sent the way adk web sends it - a NEW session under
# adk web's own user id, on the dev UI's own Runner (the same caches a save
# evicts, the same session store the verify rows read). The run goes on in
# the background; the page follows it at /sent/{run} and opens the session
# in the adk web frame, so what the student sees is what typing would show.
SENT: dict[str, dict] = {}
SENT_USER = "user"                       # the id the dev UI runs under


@router.post("/send/{app}")
async def send_message(app: str, body: dict):
    from ..services import reload as agent_reload
    if app not in STAGE_APPS:
        raise HTTPException(404, f"unknown app {app!r}")
    srv = agent_reload.handle.server
    if srv is None:
        raise HTTPException(503, "adk web is not attached to this server; type the message in adk web")
    message = str(body.get("message") or "").strip()
    if not message:
        raise HTTPException(400, "the message is empty")
    runner = await srv.get_runner_async(app)                     # what adk web would run right now
    session = await srv.session_service.create_session(app_name=app, user_id=SENT_USER)
    rec = SENT[session.id] = {
        "run": session.id, "app": app, "user": SENT_USER, "session": session.id, "message": message,
        "status": "running", "trail": [], "routes": [], "events": 0, "error": "",
        "started": time.time(), "ended": None,
    }
    asyncio.create_task(_drive_sent(rec, runner))
    return rec


async def _drive_sent(rec: dict, runner) -> None:
    from google.genai import types as gt
    from ..services.events import bus
    try:
        msg = gt.Content(role="user", parts=[gt.Part(text=rec["message"])])
        async for ev in runner.run_async(user_id=rec["user"], session_id=rec["session"], new_message=msg):
            rec["events"] += 1
            name = _node_name(ev)
            if name and name != rec["app"] and (not rec["trail"] or rec["trail"][-1] != name):
                rec["trail"].append(name)
            route = getattr(getattr(ev, "actions", None), "route", None)
            if name and route:
                rec["routes"].append(f"{name} → {route}")
        rec["status"] = "done"
    except Exception as e:  # the page shows it; the session keeps what ran
        rec["status"] = "error"
        rec["error"] = f"{type(e).__name__}: {e}"[:300]
    finally:
        rec["ended"] = time.time()
        bus.mark_dirty()                      # the verify rows re-read sessions.db


@router.get("/sent/{run}")
async def sent_status(run: str):
    rec = SENT.get(run)
    if rec is None:
        raise HTTPException(404, "no such run (the server restarted?)")
    return rec


@router.get("/holes")
async def holes_status():
    """Every registered hole: "open" while its TODO line is in the file,
    "filled" once the answer is."""
    from checks.holes import HOLES
    out = {}
    for name, (rel, anchor, snippet) in HOLES.items():
        try:
            src = (ROOT / rel).read_text()
        except OSError:
            out[name] = "missing"
            continue
        first = snippet.splitlines()[0].strip()
        out[name] = "open" if anchor in src else "filled" if (snippet in src or first in src) else "unknown"
    return out


def _git(*args: str) -> str:
    import subprocess
    try:
        r = subprocess.run(["git", *args], cwd=config.ROOT, capture_output=True,
                           text=True, timeout=5)
        return r.stdout.strip()
    except Exception:
        return ""


#: The commit this process loaded its code from. A pull moves the checkout but
#: not a running interpreter, so this is the only honest answer to "does the
#: server have the fix I just pulled".
RUNNING_COMMIT = _git("rev-parse", "--short", "HEAD")


@router.get("/version")
async def version():
    """What this server is running, and whether the checkout has moved since."""
    head = _git("rev-parse", "--short", "HEAD")
    return {"running": RUNNING_COMMIT, "head": head,
            "stale": bool(head and RUNNING_COMMIT and head != RUNNING_COMMIT),
            "subject": _git("log", "-1", "--format=%s")}


WORKER_VERBS = ("bank", "rag", "deliver", "deploy", "post")


@router.get("/worker/{verb}/log")
async def worker_log(verb: str):
    """The whole output of the last run of one console command, from
    runs/<verb>_run.log. The page reads this when a command finishes, because
    a proxy that buffers the event stream can hold the live lines back."""
    if verb not in WORKER_VERBS:
        raise HTTPException(404, f"unknown worker {verb!r}")
    path = config.RUNS / f"{verb}_run.log"
    if not path.exists():
        return {"verb": verb, "lines": []}
    text = path.read_text(errors="replace")
    return {"verb": verb, "lines": [l for l in text.splitlines() if l.strip()]}


@router.get("/holes/plan")
async def holes_plan():
    """Every shipped hole in lab order, with the page it belongs to, its
    name for a person, and whether it is open or filled. The catch-up bar
    at the top of each page fills the ones from earlier pages."""
    from checks.holes import HOLES, LABEL, PAGE
    from scripts.carve import SHIP_HOLES
    state = await holes_status()
    return [{"name": n, "page": PAGE[n], "label": LABEL[n], "state": state.get(n, "unknown")}
            for n in SHIP_HOLES if n in HOLES]


@router.post("/holes/fill")
async def holes_fill(body: dict):
    """Write the registry's answer into the file for each named hole: what
    scripts/rescue.py does, for a student who jumps in at a later step."""
    from checks.holes import HOLES
    from ..services import reload as agent_reload
    from ..services.events import bus
    from .code import _write
    names = [n for n in (body.get("names") or []) if n in HOLES]
    filled = []
    for name in names:
        rel, anchor, snippet = HOLES[name]
        p = ROOT / rel
        src = p.read_text()
        if anchor not in src:
            continue
        _write(p, src.replace(anchor, snippet, 1))
        err = agent_reload.after_save_report(rel)
        filled.append(name + (f" (saved, but {err})" if err else ""))
    bus.mark_dirty()
    return {"filled": filled}


@router.post("/holes/carve")
async def holes_carve(body: dict):
    """The inverse of /holes/fill, one hole at a time: put the shipped TODO
    line back where the answer is, so a student who finds a step already
    done (the catch-up button, scripts/rescue.py, a file left over from an
    earlier run) can make the edit themselves. Only shipped holes."""
    from checks.holes import HOLES
    from scripts.carve import SHIP_HOLES
    from ..services import reload as agent_reload
    from ..services.events import bus
    from .code import _write
    names = [n for n in (body.get("names") or []) if n in HOLES and n in SHIP_HOLES]
    carved = []
    for name in names:
        rel, anchor, snippet = HOLES[name]
        p = ROOT / rel
        src = p.read_text()
        if snippet not in src:
            continue
        _write(p, src.replace(snippet, anchor, 1))
        err = agent_reload.after_save_report(rel)
        carved.append(name + (f" (saved, but {err})" if err else ""))
    bus.mark_dirty()
    return {"carved": carved}
