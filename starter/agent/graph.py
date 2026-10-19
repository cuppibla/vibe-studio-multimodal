"""THE workflow - an idea in, a policy-cleared clip and its poster out, one human door.

  trends + backlog + feedback -> join -> propose_directions (4 candidates)
                          -> direction_gate (pick 1-4)
                          -> persist_direction -> policy_check (OK/BLOCK)
                          -> scripter -> script_check (OK/REVISE: back to the scripter, twice at most)
                                                   |   quarantine -> scripter
                          -> script_ready -> render_desk (Veo, a long-running tool) -+-> join_media -> store_release
                                          -> make_poster (the image model, seconds) -+

The graph pauses for PEOPLE (the form), refuses with a ROUTER (the policy)
BEFORE any money is spent, and LOOPS in two ways: quarantine is a task-mode
agent that iterates with tools inside one node; script_check sends a script
back to the scripter on a back-edge, at most MAX_SCRIPT_PASSES times. Memory
(step 5) is not a node: it is two callbacks on the agents, in
agent/platform/memory.py.
"""
import json
import pathlib
import re

from google.adk import Agent, Event, Workflow
from google.adk.events.request_input import RequestInput
from google.adk.workflow import START, JoinNode

from .platform import config, images, state
from .cleanup_tools import find_policy_hits, suggest_replacement
from .desk import render_desk
from .schemas import CleanedDirection, Directions, Script


def _as_dict(node_input) -> dict:
    """A node's input as a plain dict, whether the node before it emitted a
    dict, a pydantic model (an agent with an output_schema), or nothing."""
    if hasattr(node_input, "model_dump"):
        return node_input.model_dump()
    return dict(node_input) if isinstance(node_input, dict) else {}


# ── research fan-out (pure compute + reads; it grows chapter by chapter) ────
def scan_trends(node_input):
    from .trends import sample_trends
    return Event(output={"trends": sample_trends()})


BACKLOG_FILE = pathlib.Path(__file__).parent / "backlog.txt"


def backlog_notes() -> list[str]:
    """The creator's backlog: one idea per line, comments skipped."""
    return [l.strip() for l in BACKLOG_FILE.read_text().splitlines()
            if l.strip() and not l.startswith("#")]


def idea_text(node_input) -> str:
    """Tonight's idea: the text of the message that started the run."""
    parts = getattr(node_input, "parts", None)
    if parts:
        return " ".join(p.text for p in parts if getattr(p, "text", None)).strip()
    if isinstance(node_input, str):
        return node_input.strip()
    return state.load().get("hint", "") or ""


def read_backlog(node_input):
    idea = idea_text(node_input)
    return Event(output={"backlog": backlog_notes(), "idea": idea}, state={"idea": idea})


def read_feedback(node_input):
    """The third reader (step 5): what the audience wrote under past videos,
    the passages nearest to tonight's idea, and the posters those passages
    came with. Retrieval, not a model call."""
    from .platform import rag
    idea = idea_text(node_input)
    query = idea or "what viewers liked and what they complained about"
    try:
        hits = rag.retrieve(query)
    except Exception as e:
        print(f"  [rag] feedback unavailable ({str(e)[:80]})")
        return Event(output={"query": query, "feedback": [], "posters": [],
                             "note": "no corpus connected - run: python -m agent.platform.rag"})
    return Event(output={"query": query, "feedback": [h["text"] for h in hits]})  # TODO: RAG_CAPTION - also hand back the posters the passages came with: "posters": rag.posters_in(hits)


join_research = JoinNode(name="join_research")



# ── the proposer · a workflow node, so it decides in ONE call ───────────────
PROPOSE_INSTRUCTION = (
    "You are the night producer of the creator's VibeTube channel, which posts "
    "one cozy-spooky short every evening until Halloween. The message you "
    "received is tonight's research bundle as JSON, one key per reader node: "
    "scan_trends holds ten trends right now, each a format paired with a look (a "
    "visual style), never a subject, each with a heat score; read_backlog holds "
    "the creator's own notes, ideas they want to make someday, and tonight's "
    "idea from the creator, which may be empty; read_feedback, when present, "
    "holds what the audience wrote under past videos, the passages nearest to "
    "tonight's idea, and the posters of the videos they were reacting to.\n"
    "Work like this. If the creator gave an idea tonight, that idea is the "
    "brief and candidates 1 to 3 are three versions of IT: the same subject "
    "and the same premise in every one, the creator's own nouns kept, never "
    "replaced by a trend or a backlog note. The research adds elements to the "
    "idea, it never overwrites it: a trend lends its format and its look, and "
    "a backlog note lends a detail or a setting. Say in the angle which trend "
    "and which note each candidate borrowed. Only when there "
    "is no idea tonight do you build from the backlog: merge the notes that "
    "fit together best, then find the trending topic each merged idea can "
    "ride, preferring higher heat. Either way a candidate is one filmable "
    "scene, cozy-spooky: a creak where a scream would be, a pumpkin where a "
    "blade would be, and it ends on the candy, never on the scare. If there is "
    "feedback, let it steer candidates 1 to 3: lean into what viewers praised, "
    "avoid what they complained about, and name the comment in the angle.\n"
    "PITCH exactly FOUR candidate directions for the next <=20s video. Each "
    "candidate: a title (<=60 chars, a concrete filmable characterful scene - "
    "never a meta content-strategy topic), an angle (the twist, one line), "
    "a hook: 2-4 punchy Title Case words, the video's sticker line "
    "- the feeling of the moment, no punctuation, no emoji, a style: the "
    "look of the clip in one line, taken from the trend the candidate rides "
    "(its text after 'look:'), so the four candidates differ in look as well "
    "as in twist, and a poster_idea: the single image that sells the video, "
    "one line, one subject, no text in the picture.\n"
    "Candidates 1 to 3 are publishable and each cites at least one backlog note "
    "and one trend.\n"
    "Candidate 4 is the outrage-bait direction the channel must never publish, "
    "pitched the way a rival channel would. Its title MUST contain at least one "
    "of these words, spelled exactly: competitor, scam, revenge, humiliate, "
    "fake, dangerous stunt. Its hook is provocative too. It exists so the "
    "policy gate has something to refuse.\n"
    "Every evidence entry must cite a REAL source: 'trends', 'backlog', "
    "'feedback', or 'memory' (only when a MEMORY section is present). Empty or "
    "absent sections are never cited - never invent evidence.\n"
    "If the MEMORY section contains CHANNEL_RULES, candidates 1 to 3 MUST "
    "honor them. If it contains VISUAL_STYLE, let the poster ideas lean that way.")

propose_directions = Agent(
    name="propose_directions",
    model=config.MODEL,
    instruction=PROPOSE_INSTRUCTION,
    output_schema=Directions)


# ── the human door · pick a direction (RequestInput: one small form) ────────
def direction_gate(node_input: Directions):
    cands = [c.model_dump() for c in node_input.candidates]
    yield Event(state={"candidates": cands})
    # TODO: GATE_INPUT - suspend the graph here: yield a RequestInput with a message,
    # a response_schema (the form: one field, pick) and payload={"candidates": cands}


def persist_direction(node_input, candidates: list = []):
    """Resolve the human's pick into THE direction, and write it to shared state.

    `candidates` is not passed by anyone: ADK binds it from shared state
    because the parameter name matches a state key. The pick comes
    in as node_input, the gate's answer. A human door must degrade to a
    sensible choice, never raise: a null, missing, blank, or out-of-range pick
    resolves to candidate 1."""
    ni = node_input if isinstance(node_input, dict) else {}
    raw = ni.get("pick")
    pick = str(raw).strip() if raw is not None else ""
    if candidates:
        i = int(pick) - 1 if pick.isdigit() else 0
        chosen = candidates[max(0, min(len(candidates) - 1, i))]
    else:
        chosen = {"title": "untitled", "angle": "", "evidence": []}
    hook = chosen.get("hook") or " ".join(chosen["title"].split()[:4])
    # TODO: PERSIST_STATE - yield an Event whose state holds direction, angle, hook, and user:prefs
    yield Event(output=chosen)


# ── the policy gate · a deterministic router, BEFORE any money is spent ─────
# Policy is DATA, not code: the words live in policy_words.txt beside this
# file, and policy_check reads them at DECISION time - edit the file, and
# the very next run enforces it. No restart, no redeploy.
POLICY_FILE = pathlib.Path(__file__).parent / "policy_words.txt"


def policy_words() -> list[str]:
    return [w.strip().lower() for w in POLICY_FILE.read_text().splitlines()
            if w.strip() and not w.strip().startswith("#")]


def policy_hits(text: str) -> list[str]:
    low = text.lower()
    return [w for w in policy_words() if re.search(rf"\b{re.escape(w)}\b", low)]


def policy_check(node_input):
    """One node, one decision: `route` names the edge to take next."""
    node_input = _as_dict(node_input)
    text = f"{node_input.get('title', '')} {node_input.get('angle', '')}"
    bad = policy_hits(text)
    st = state.load()
    lin = st.setdefault("lineage", {"evidence": [], "gates": {}})
    lin.setdefault("gates", {})["policy"] = {"ok": not bad, "hits": bad}
    state.save(st)
    # TODO: POLICY_ROUTE - return an Event whose output is node_input and whose route is "BLOCK" if bad else "OK"




# ── pure production: script the cleared direction (runs quietly) ────────────
SCRIPT_INSTRUCTION = (
    "Write the production script for the approved video direction: a cozy-spooky "
    "short for the channel's Halloween nights. The message you received is the "
    "direction as JSON: title, angle, hook, style, poster_idea. If it also carries "
    "a revise_note, a previous draft used refused words; keep the scene and write "
    "around them.\n"
    "Deliver: title (<=60 chars, honoring the direction), description "
    "(1-2 sentences), 3-5 tags, an opening_line (the hook: something is slightly "
    "wrong in a cozy room), EXACTLY 3 shots (each one visual sentence for a render "
    "model, written in the direction's style; the last shot ends on the candy, "
    "never on the scare; no gore, no real weapons, no strobe), style: the "
    "direction's style, copied through, or a fitting look of your own if the "
    "direction has none, and poster_idea: the direction's poster_idea, copied "
    "through, or the single image that sells the video if it has none.\n"
    "Set conclusion_first=true only when the opening_line states the final "
    "outcome outright, never for a teaser or a question.")

scripter = Agent(
    name="scripter",
    model=config.MODEL,
    instruction=SCRIPT_INSTRUCTION,
    output_schema=Script)

# the quarantine node of step 3c: a task-mode agent, assembled by the student
# in stage3_router/agent.py from this instruction and agent/cleanup_tools.py
QUARANTINE_INSTRUCTION = (
    "The channel's policy refused the direction you received. The message is "
    "the direction as JSON: title, angle, hook, style, poster_idea. Make it "
    "publishable without changing the scene: cozy-spooky, a pumpkin where there "
    "was a blade, a creak where there was a scream.\n"
    "1. Call find_policy_hits with the title, and again with the angle, to "
    "learn which words are refused.\n"
    "2. For every refused word call suggest_replacement and rewrite the text "
    "with the suggestion (or a gentle synonym if none is listed).\n"
    "3. Call find_policy_hits again on the rewritten title and angle. Repeat "
    "steps 2 and 3 until both come back clean.\n"
    "4. Only then call finish_task with the cleaned title, angle and hook, "
    "and the style and poster_idea unchanged.")

quarantine = Agent(
    name="quarantine",
    model=config.MODEL,
    mode="task",
    instruction=QUARANTINE_INSTRUCTION,
    tools=[find_policy_hits, suggest_replacement],
    output_schema=CleanedDirection)


# ── the script loop · a router with a back-edge, bounded by a counter ───────
# A loop IN the graph: script_check reads the policy words against the script
# the scripter just wrote, and when a refused word slipped in it sends the
# script BACK to the scripter with a note. The counter lives in shared state
# (`script_passes` is bound from it, the way `candidates` is above), so the
# loop runs at most MAX_SCRIPT_PASSES times and then lets the script through,
# recording the unresolved hits in the lineage. Compare quarantine: a loop
# INSIDE one node, where the model calls tools until it decides it is done.
MAX_SCRIPT_PASSES = 2


def script_check(node_input, script_passes: int = 0):
    script = _as_dict(node_input)
    shots = " ".join(s.get("description", "") if isinstance(s, dict) else str(s) for s in script.get("shots", []))
    text = " ".join([script.get("title", ""), script.get("description", ""), script.get("opening_line", ""), shots])
    bad = policy_hits(text)
    st = state.load()
    lin = st.setdefault("lineage", {"evidence": [], "gates": {}})
    lin.setdefault("gates", {})["script"] = {"ok": not bad, "hits": bad, "pass": script_passes + 1}
    state.save(st)
    again = bool(bad) and script_passes < MAX_SCRIPT_PASSES
    out = {**script, "revise_note": f"refused words in the last draft: {', '.join(bad)}"} if again else script
    return Event(output=out, route="REVISE" if again else "OK",
                 state={"script_passes": script_passes + 1 if again else 0})


def script_ready(node_input):
    """The cleared script, handed to both branches of the media desk at once."""
    script = _as_dict(node_input)
    script.pop("revise_note", None)
    return Event(output=script, state={"script_title": script.get("title", "")})


# ── the media desk · two branches, one join ─────────────────────────────────
def make_poster(node_input, memory_facts: list = []):
    """The poster branch (step 6): the image model draws the script's poster
    idea in the channel's style, in seconds, while Veo renders the clip. What
    Memory Bank knows about the creator's taste in posters is bound from state
    (recall_taste puts it there) and goes into the prompt."""
    script = _as_dict(node_input)
    subject = script.get("poster_idea") or f"{script.get('title', '')} - {script.get('style', '')}"
    taste = "; ".join(f["fact"] for f in memory_facts if isinstance(f, dict) and f.get("topic") == "VISUAL_STYLE")
    rec = images.generate(subject, taste, name="poster")
    st = state.load()
    st["poster"] = {k: rec.get(k, "") for k in ("status", "path", "url", "prompt", "prebaked", "note")}
    state.save(st)
    said = rec.get("url") or rec.get("note") or "no poster"
    yield Event(output={"status": rec.get("status", ""), "url": rec.get("url", ""), "path": rec.get("path", ""),
                        "prebaked": bool(rec.get("prebaked")), "subject": subject},
                state={"poster_url": rec.get("url", ""), "poster_path": rec.get("path", "")},
                message=f"poster: {said}")


join_media = JoinNode(name="join_media")


def store_release(node_input, poster_url: str = "", poster_path: str = ""):
    """After the desk (step 6): the delivered render, from runs/state.json
    where deliver wrote it, and the poster from the join, into shared state
    and the run's output. If a real poster was drawn, one sentence about it
    goes to Memory Bank as the creator's visual taste."""
    render = state.load().get("render") or {}
    url = render.get("url") or ""
    status = render.get("status", "")
    if not render:
        # nothing was delivered: the run never paused at render_desk, which
        # happens when render_submit is a plain tool, not a LongRunningFunctionTool
        status = "not delivered"
        said = ("no render was delivered: the run did not pause at render_desk. "
                "Is render_submit wrapped in LongRunningFunctionTool? (step 6a, edit 1)")
    elif status == "done":
        said = url or "prebaked stand-in, no file"
    else:
        said = f"failed: {render.get('reason', '')}"
    bundle = _as_dict(node_input)
    poster = bundle.get("make_poster") if isinstance(bundle.get("make_poster"), dict) else {}
    poster_url = poster.get("url") or poster_url
    poster_path = poster.get("path") or poster_path
    if poster_path and not poster.get("prebaked"):
        _remember_poster(poster_path)
    yield Event(output={"status": status, "url": url, "operation": render.get("operation", ""),
                        "poster_url": poster_url},
                state={"render_url": url, "render_status": status, "poster_url": poster_url},
                message=f"video: {said} · poster: {poster_url or 'none'}")


def _remember_poster(path: str) -> None:
    from .platform import memory
    try:
        desc = images.describe(path)
        if desc:
            memory.remember(f"The creator shipped a poster that looks like this: {desc} "
                            f"Treat this as the kind of poster the creator approves of.")
    except Exception as e:
        print(f"  [memory] poster not remembered ({str(e)[:80]})")


wf = Workflow(
    name="lap",
    description="research (trends, backlog, feedback) -> the human door -> the policy gate -> script -> clip + poster",
    edges=[
        (START, scan_trends, join_research),
        (START, read_backlog, join_research),
        (START, read_feedback, join_research),
        (join_research, propose_directions, direction_gate,
         persist_direction, policy_check),
        (policy_check, {"OK": scripter, "BLOCK": quarantine}),
        (quarantine, scripter),
        (scripter, script_check),
        (script_check, {"REVISE": scripter, "OK": script_ready}),
        (script_ready, render_desk, join_media),
        (script_ready, make_poster, join_media),
        (join_media, store_release),
    ])
# NOTE: while the EDGES hole is open, wf has no edges. Importing this module
# stays legal (the stage apps borrow its nodes); only RUNNING a lap trips the
# guard - see lap.start_lap.
