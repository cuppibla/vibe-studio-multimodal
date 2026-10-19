"""Stage 3 - the structures: a router, a loop inside a node, a loop in the graph.

Stage 1 plus a stand-in for the human door and everything after it:
  choose_direction  a stand-in gate: picks the candidate whose number ends
                    tonight's idea ("..., pick 4"), else the first. The real
                    door, a form that suspends the run, is built in step 4.
  policy_check      the ROUTER: reads agent/policy_words.txt at decision time
                    and routes the direction to OK or BLOCK before any script
                    is written or any money is spent.
  quarantine        a loop INSIDE a node: a task-mode agent that replaces the
                    refused words with its tools until find_policy_hits comes
                    back clean, then hands the cleaned direction to the scripter
                    (the way back is wired in 3c, with the loop below; in 3b the
                    placeholder ends the run).
  script_check      a loop IN the graph: a second router after the scripter,
                    with a back-edge. A refused word in the script sends it back
                    with a note, at most twice (a counter in state), then through.

scripter and quarantine are defined here, in the sandbox, so you write both
nodes yourself; the instructions and the tools they use live in agent/.
"""
import re

from google.adk import Agent, Event, Workflow
from google.adk.workflow import START, JoinNode

from agent.platform import config
from agent.cleanup_tools import find_policy_hits, suggest_replacement
from agent.graph import (PROPOSE_INSTRUCTION, QUARANTINE_INSTRUCTION,
                         SCRIPT_INSTRUCTION, policy_check, read_backlog,
                         scan_trends, script_check, script_ready)
from agent.schemas import CleanedDirection, Directions, Script

join_research = JoinNode(name="join_research")

propose_directions = Agent(
    name="propose_directions",
    model=config.MODEL,
    instruction=PROPOSE_INSTRUCTION,
    output_schema=Directions)


def choose_direction(node_input: Directions, idea: str = ""):
    """The stand-in for the human door. `idea` is bound from shared state
    (read_backlog wrote it there); a trailing "pick N" chooses candidate N,
    anything else chooses candidate 1. Candidate 4 is the one the gate refuses."""
    cands = [c.model_dump() for c in node_input.candidates]
    m = re.search(r"\bpick\s*([1-4])\b", idea or "", re.I)
    i = int(m.group(1)) - 1 if m else 0
    chosen = cands[max(0, min(len(cands) - 1, i))] if cands else {"title": "untitled", "angle": "", "evidence": []}
    hook = chosen.get("hook") or " ".join(chosen["title"].split()[:4])
    yield Event(output=chosen,
                state={"direction": chosen["title"], "angle": chosen.get("angle", ""), "hook": hook},
                message=f"stand-in gate: candidate {i + 1}, {chosen['title']}")


scripter = Agent(
    name="scripter",
    model=config.MODEL,
    instruction=SCRIPT_INSTRUCTION,
    output_schema=Script)

def quarantine(node_input):  # TODO: QUARANTINE - 3c replaces this placeholder with the task agent
    return Event(output={"blocked": True, "title": node_input.get("title", "")},
                 message="blocked: the channel's policy refused this direction")

LOOP_EDGES = []  # TODO: REVISE_LOOP - the way back from quarantine, then the back-edge: [(quarantine, scripter), (scripter, script_check), (script_check, {"REVISE": scripter, "OK": script_ready})]

root_agent = Workflow(
    name="stage3_router",
    description="research -> a stand-in pick -> the policy gate -> a script, checked in a loop",
    edges=[(START, scan_trends, join_research),
           (START, read_backlog, join_research),
           (join_research, propose_directions, choose_direction)]  # TODO: ROUTER_EDGES - append policy_check, then its two exits: (policy_check, {"OK": scripter, "BLOCK": quarantine})
    + LOOP_EDGES)
