"""Session 3b - the router, and the one loop.

Session 3a's fan-out plus a stand-in for the human door and everything after it:
  choose_direction  a stand-in gate: picks the candidate whose number ends
                    tonight's idea ("..., pick 4"), else the first. The real
                    door, a form that suspends the run, is built in the video
                    generation session (it is the same mechanism as the render).
  policy_check      the ROUTER: reads agent/policy_words.txt at decision time
                    and names its own exit - OK or BLOCK - before any script
                    is written or any money is spent.
  quarantine        the LOOP: a task-mode agent that replaces the refused words
                    with its tools until find_policy_hits comes back clean, then
                    hands the cleaned direction to the scripter. A loop inside
                    one node; the edge back to the scripter closes it.

scripter and quarantine are defined here, in the sandbox, so you can read
both nodes next to the edges that use them; the instructions and the tools
they use live in agent/.
"""
import re

from google.adk import Agent, Event, Workflow
from google.adk.workflow import START, JoinNode

from agent.platform import config
from agent.cleanup_tools import find_policy_hits, suggest_replacement
from agent.graph import (PROPOSE_INSTRUCTION, QUARANTINE_INSTRUCTION,
                         SCRIPT_INSTRUCTION, policy_check, read_backlog,
                         scan_trends, script_ready)
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
    anything else chooses candidate 1. Candidate 4 is the one the gate refuses.
    The message says which it took and why, so a run that went the other
    way than you meant explains itself in adk web."""
    cands = [c.model_dump() for c in node_input.candidates]
    m = re.search(r"\bpick\s*(?:#|no\.?\s*|number\s*)?([1-4])\b", idea or "", re.I)
    i = int(m.group(1)) - 1 if m else 0
    chosen = cands[max(0, min(len(cands) - 1, i))] if cands else {"title": "untitled", "angle": "", "evidence": []}
    hook = chosen.get("hook") or " ".join(chosen["title"].split()[:4])
    why = f"'{m.group(0)}' in the idea" if m else "no 'pick N' at the end of the idea"
    yield Event(output=chosen,
                state={"direction": chosen["title"], "angle": chosen.get("angle", ""), "hook": hook},
                message=f"stand-in gate: candidate {i + 1} ({why}), {chosen['title']}")


scripter = Agent(
    name="scripter",
    model=config.MODEL,
    instruction=SCRIPT_INSTRUCTION,
    output_schema=Script)

# the loop: a task-mode agent. The model calls its two tools, in a loop of its
# own inside this one node, until find_policy_hits comes back clean, then
# calls finish_task with the cleaned direction.
quarantine = Agent(
    name="quarantine",
    model=config.MODEL,
    instruction=QUARANTINE_INSTRUCTION,
    mode="task",
    tools=[find_policy_hits, suggest_replacement],
    output_schema=CleanedDirection,
)

root_agent = Workflow(
    name="stage3_router",
    description="research -> a stand-in pick -> the policy gate -> a cleaned direction -> a script",
    edges=[(START, scan_trends, join_research),
           (START, read_backlog, join_research),
           (join_research, propose_directions, choose_direction, scripter),  # TODO: ROUTER - put policy_check between the pick and the scripter, with its two exits and the way back from quarantine (see the hint)
           (scripter, script_ready)])
