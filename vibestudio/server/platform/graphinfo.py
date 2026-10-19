"""The graph, as the page draws it: read from the Workflow itself.

wf.graph holds the nodes and the edges ADK validated. This module adds what
the drawing needs: a kind per node (function, join, agent, task, human,
router, desk) and a layer per node (longest path from START), so the page
lays the graph out left to right without a copy of the edge list anywhere
in the frontend. Change the workflow and the picture follows.
"""
from __future__ import annotations

from functools import lru_cache

# What a node IS, beyond its Python class: the roles the lab taught.
ROLES = {
    "direction_gate": "human",      # RequestInput: the run pauses for a person
    "policy_check": "router",       # its return value picks the edge
    "quarantine": "task",           # a task-mode agent with tools
    "script_check": "router",       # the loop's router: REVISE sends the script back
    "render_desk": "desk",          # an agent with a long-running tool
}
START = "__START__"


def _kind(node) -> str:
    name = node.name
    if name == START:
        return "start"
    if name in ROLES:
        return ROLES[name]
    cls = type(node).__name__
    if cls == "JoinNode":
        return "join"
    if cls in ("LlmAgent", "Agent"):
        return "agent"
    return "function"


@lru_cache(maxsize=1)
def describe() -> dict:
    from ..agent.graph import wf
    g = wf.graph
    nodes = [{"name": n.name, "kind": _kind(n)} for n in g.nodes]
    edges = [{"from": e.from_node.name, "to": e.to_node.name, "route": e.route} for e in g.edges]
    # layers: longest path from START (the graph is a DAG). An edge between two
    # targets of the same router (quarantine -> scripter) is a merge back into
    # the main line, not a step forward: it does not push its target's layer.
    preds: dict[str, set[str]] = {n["name"]: set() for n in nodes}
    for e in edges:
        preds[e["to"]].add(e["from"])
    succ: dict[str, list[str]] = {n["name"]: [] for n in nodes}
    for e in edges:
        if preds[e["from"]] & preds[e["to"]]:
            continue
        succ[e["from"]].append(e["to"])
    # the script loop's back-edge (script_check -> scripter) closes a cycle: it
    # does not push the scripter's layer either, or nothing after it would layer
    for a, b in _back_edges(succ):
        succ[a].remove(b)
    layer = {START: 0}
    order = _topo(succ)
    for name in order:
        for nxt in succ.get(name, []):
            layer[nxt] = max(layer.get(nxt, 0), layer.get(name, 0) + 1)
    by_layer: dict[int, list[str]] = {}
    for n in nodes:
        by_layer.setdefault(layer.get(n["name"], 0), []).append(n["name"])
    for n in nodes:
        col = layer.get(n["name"], 0)
        n["layer"] = col
        n["row"] = by_layer[col].index(n["name"])
        n["rows"] = len(by_layer[col])
    return {"name": wf.name, "description": wf.description, "nodes": nodes, "edges": edges,
            "layers": max(layer.values()) + 1}


def _back_edges(succ: dict[str, list[str]]) -> set[tuple[str, str]]:
    """The edges that close a cycle, found by a depth-first walk from START:
    an edge to a node still on the walk's stack is a back-edge."""
    on: set[str] = set()
    seen: set[str] = set()
    back: set[tuple[str, str]] = set()

    def walk(n: str) -> None:
        on.add(n)
        seen.add(n)
        for o in succ.get(n, []):
            if o in on:
                back.add((n, o))
            elif o not in seen:
                walk(o)
        on.discard(n)

    walk(START)
    return back


def _topo(succ: dict[str, list[str]]) -> list[str]:
    indeg = {n: 0 for n in succ}
    for n, outs in succ.items():
        for o in outs:
            indeg[o] = indeg.get(o, 0) + 1
    ready = [n for n, d in indeg.items() if d == 0]
    out = []
    while ready:
        n = ready.pop(0)
        out.append(n)
        for o in succ.get(n, []):
            indeg[o] -= 1
            if indeg[o] == 0:
                ready.append(o)
    return out
