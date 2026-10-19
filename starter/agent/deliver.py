"""`python -m agent.deliver` - deliver the pending render to the workflow.

  python -m agent.deliver            find the pending render, wait for Veo, answer it by id
  python -m agent.deliver status     list the pending renders, newest first

The workflow suspended at render_desk with a pending long-running call whose
receipt names a Veo operation. This command reads that receipt from the
session store (no process kept it: the server may have restarted since),
polls Veo until the clip exists, writes the result to runs/state.json, and
resumes the SAME session with a function_response carrying the call's id.
That answer completes the desk's node and the graph continues to store_video,
which reads the result from runs/state.json.

Every Veo call retries videogen.RETRIES times, videogen.INTERVAL_S apart.
"""
from __future__ import annotations

import os
import sys
import time

from google.adk import Runner
from google.genai.types import Content, FunctionResponse, Part

from .platform import config, drive, state, videogen

APP = os.environ.get("STUDIO_VIDEO_APP", "stage6_video")
POLL_S = 10.0


async def _pending(session) -> list[tuple[str, str, dict, float]]:
    """Long-running calls in one session whose latest response still says
    pending, with the time the call was made."""
    lr, latest, when = set(), {}, {}
    for ev in session.events:
        if getattr(ev, "long_running_tool_ids", None):
            lr |= set(ev.long_running_tool_ids)
        for f in ev.get_function_calls() or []:
            when[f.id] = getattr(ev, "timestamp", 0) or 0
        for r in ev.get_function_responses() or []:
            latest[r.id] = (r.name, r.response)
    out = []
    for cid in lr:
        if cid in latest:
            name, resp = latest[cid]
            if isinstance(resp, dict) and resp.get("status") == "pending":
                out.append((cid, name, resp, when.get(cid, 0)))
    return out


async def find_pending() -> list[dict]:
    """Every pending render in the app's sessions, newest session first."""
    svc = drive.svc()
    rows = []
    for user in drive.users(APP):
        try:
            resp = await svc.list_sessions(app_name=APP, user_id=user)
        except Exception:
            continue
        for meta in resp.sessions:
            s = await svc.get_session(app_name=APP, user_id=user, session_id=meta.id)
            if s is None:
                continue
            for cid, name, r, at in await _pending(s):
                rows.append({"user": user, "session": s.id, "call_id": cid, "name": name,
                             "operation": r.get("operation", ""), "prompt": r.get("prompt", ""),
                             "submitted_at": at, "updated": getattr(s, "last_update_time", 0) or 0})
    rows.sort(key=lambda r: r["updated"], reverse=True)
    return rows


async def _answer(row: dict, response: dict) -> list[str]:
    """Resume the session with a function_response for the pending call. The
    Runner drives the stage app's Workflow; the events are what the graph did
    next. Returns those events as one line each."""
    import importlib
    root = importlib.import_module(f"{APP}.agent").root_agent
    runner = Runner(app_name=APP, agent=root, session_service=drive.svc())
    part = Part(function_response=None)  # TODO: DELIVER_RESPONSE - FunctionResponse(id=row["call_id"], name=row["name"], response=response)
    if part.function_response is None:
        raise SystemExit("the delivery cannot answer the call yet: the FunctionResponse is not built "
                         "(agent/deliver.py, _answer). Do step 8a, edit 2, or use the catch-up card on 8b, "
                         "then run python -m agent.deliver again; the pending call is still in the session.")
    lines = []
    async for ev in runner.run_async(user_id=row["user"], session_id=row["session"],
                                     new_message=Content(role="user", parts=[part])):
        info = getattr(ev, "node_info", None)
        path = getattr(info, "path", "") if info is not None else ""
        node = path.rsplit("/", 1)[-1].split("@")[0] if path else getattr(ev, "author", "")
        def _text(content) -> str:
            parts = getattr(content, "parts", None) or []
            return " ".join(p.text for p in parts if getattr(p, "text", None)).strip()
        said = _text(getattr(ev, "message", None)) or _text(getattr(ev, "content", None))[:120]
        if node or said:
            lines.append(f"  {node or '?'}: {said}" if said else f"  {node}")
    return lines


def _ago(ts: float) -> str:
    if not ts:
        return "unknown time"
    secs = max(0, int(time.time() - ts))
    return f"{secs} s ago" if secs < 90 else f"{secs // 60} min ago"


def _span(secs: float) -> str:
    secs = int(secs)
    return f"{secs} s" if secs < 90 else f"{secs // 60} min {secs % 60:02d} s"


def _describe(row: dict) -> None:
    """The pending call, in words a person can act on."""
    op = row["operation"]
    short = op.rsplit("/", 1)[-1] if "/" in op else op
    print(f"  session   {row['session']}  (app {APP}, user {row['user']})")
    print(f"  call      {row['call_id']}  ·  submitted {_ago(row['submitted_at'])}")
    print(f"  prompt    \"{row['prompt'][:110].strip()}{'…' if len(row['prompt']) > 110 else ''}\"")
    if op.startswith("prebaked:"):
        print(f"  render    stand-in (STUDIO_REAL_VIDEO=0): finishes a few seconds after submit, no file")
    else:
        print(f"  render    Veo operation {short}")
        print(f"            (the id videogen.check asks Veo about; the clip is not on disk until a check says done)")


def deliver() -> int:
    rows = drive.run(find_pending())
    if not rows:
        print(f"no pending render in any {APP} session. Run the workflow in adk web first: it stops at render_desk with a pending call.")
        return 1
    row = rows[0]
    print("── pending render found in the session store ──")
    _describe(row)
    if len(rows) > 1:
        print(f"  ({len(rows) - 1} older pending render(s) left alone; the newest is delivered)")
    t0 = time.time()
    print(f"── waiting for Veo · one check every {POLL_S:.0f} s · each check retries "
          f"{videogen.RETRIES}x, {videogen.INTERVAL_S:.0f} s apart · giving up after {_span(videogen.TIMEOUT_S)} ──")
    deadline = t0 + videogen.TIMEOUT_S
    status = {"done": False}
    n = 0
    earlier = (state.load().get("render") or {})
    if earlier.get("operation") == row["operation"] and earlier.get("status") == "done" and (earlier.get("path") or earlier.get("prebaked")):
        # an earlier delivery already fetched this clip and stopped before answering; reuse it
        status = {"done": True, "path": earlier.get("path"), "url": earlier.get("url"),
                  "prebaked": bool(earlier.get("prebaked")), "duration_ms": earlier.get("duration_ms")}
        print("  (already fetched by an earlier delivery; not downloading again)")
    while not status["done"] and time.time() < deadline:
        n += 1
        status = videogen.check(row["operation"])
        if status["done"]:
            break
        print(f"  check {n}: not yet · {_span(time.time() - t0)} waiting · {_span(time.time() - (row['submitted_at'] or t0))} since submit")
        time.sleep(POLL_S)
    if not status["done"]:
        status = {"done": True, "error": f"no result after {int(videogen.TIMEOUT_S)}s"}
    st = state.load()
    if "error" in status:
        print(f"── render failed: {status['error']} ──")
        print("  the call is answered with status failed; store_video records it and the run ends without a clip")
        st["render"] = {"status": "failed", "reason": status["error"], "operation": row["operation"], "prompt": row["prompt"]}
        state.save(st)
        response = {"status": "failed", "reason": status["error"]}
    else:
        print(f"── clip ready · {_span(time.time() - (row['submitted_at'] or t0))} after submit ──")
        if status.get("path"):
            size = os.path.getsize(status["path"]) if os.path.exists(status["path"]) else 0
            print(f"  file      {status['path']}  ({size / 1e6:.1f} MB, {int((status.get('duration_ms') or 0) / 1000)} s)")
            print(f"  url       {status.get('url')}  (served by the lab server and the app)")
        else:
            print("  stand-in render: no file to play; the run continues the same way")
        st["render"] = {"status": "done", "url": status.get("url"), "path": status.get("path"),
                        "prebaked": bool(status.get("prebaked")), "operation": row["operation"],
                        "prompt": row["prompt"], "duration_ms": status.get("duration_ms")}
        state.save(st)
        print("  written to runs/state.json, where store_video reads it")
        response = {"status": "done", "url": status.get("url") or "(prebaked stand-in)"}
    print(f"── answering call {row['call_id']} in session {row['session'][:8]} with a function_response (status {response['status']}) ──")
    for line in drive.run(_answer(row, response)):
        print(line)
    print("delivered · the run is complete. Reopen the session in adk web to see the events after the pending call, and the State tab for render_url.")
    return 0


def status() -> None:
    rows = drive.run(find_pending())
    if not rows:
        print(f"no pending render in any {APP} session. Run the workflow in adk web first: it stops at render_desk with a pending call.")
        return
    print(f"── {len(rows)} pending render{'s' if len(rows) != 1 else ''} in {APP}, newest first ──")
    for r in rows:
        _describe(r)
        print()
    print("next: python -m agent.deliver   (waits for the newest one, then resumes its run)")


def main(argv=None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    cmd = argv[0] if argv else ""
    if cmd == "":
        return deliver()
    if cmd == "status":
        status(); return 0
    print(__doc__); return 0


if __name__ == "__main__":
    raise SystemExit(main())
