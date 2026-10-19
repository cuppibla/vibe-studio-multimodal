"""Step 5a - the ghost remembers. The step 4 graph, unchanged, plus two callbacks.

Memory is not a node. propose_directions reads the creator's memories before
its model call (before_model_callback) and scripter writes what the creator
picked after its turn (after_agent_callback). Both live in agent/platform/memory.py.
The bank has three topics: CREATOR_TASTE, CHANNEL_RULES, and VISUAL_STYLE,
what the creator approves in a poster; make_poster reads that one in step 6.
"""
from google.adk import Agent, Workflow
from google.adk.workflow import START, JoinNode

from agent.platform import config
from agent.cleanup_tools import find_policy_hits, suggest_replacement
from agent.graph import (PROPOSE_INSTRUCTION, QUARANTINE_INSTRUCTION,
                         SCRIPT_INSTRUCTION, direction_gate, persist_direction,
                         policy_check, read_backlog, scan_trends, script_ready)
from agent.platform.memory import recall_taste, remember_pick
from agent.schemas import CleanedDirection, Directions, Script

join_research = JoinNode(name="join_research")

propose_directions = Agent(
    name="propose_directions",
    model=config.MODEL,
    instruction=PROPOSE_INSTRUCTION,
    output_schema=Directions)  # TODO: MEMORY_RECALL - add before_model_callback=recall_taste

scripter = Agent(
    name="scripter",
    model=config.MODEL,
    instruction=SCRIPT_INSTRUCTION,
    output_schema=Script)  # TODO: MEMORY_REMEMBER - add after_agent_callback=remember_pick

quarantine = Agent(
    name="quarantine",
    model=config.MODEL,
    mode="task",
    instruction=QUARANTINE_INSTRUCTION,
    tools=[find_policy_hits, suggest_replacement],
    output_schema=CleanedDirection)

root_agent = Workflow(
    name="stage4_memory",
    description="research -> you -> the policy gate -> a script in a loop, with memory on both agents",
    edges=[(START, scan_trends, join_research),
           (START, read_backlog, join_research),
           (join_research, propose_directions, direction_gate,
            persist_direction, policy_check),
           (policy_check, {"OK": scripter, "BLOCK": quarantine}),
           (quarantine, scripter),
           (scripter, script_ready)])
