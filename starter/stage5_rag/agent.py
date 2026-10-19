"""Session 4b - the third reader. The Session 3 graph plus one more reader.

RAG Engine is not a callback and not a tool: it is a third source in the
research fan-out. read_feedback (agent/graph.py) asks the corpus for the
passages nearest to tonight's idea, and the join hands them to the proposer
with the trends and the backlog. The corpus holds what the audience sent -
comments, and what Gemini heard and saw in their voice notes, photos and
clips - plus the channel's past posters, captioned; every passage that came
from a file names it, so the file can come back with the passage (RAG_MEDIA).
The edge (START, read_feedback, join_research) ships; the edit is in the node.
"""
from google.adk import Agent, Workflow
from google.adk.workflow import START, JoinNode

from agent.platform import config
from agent.cleanup_tools import find_policy_hits, suggest_replacement
from agent.graph import (PROPOSE_INSTRUCTION, QUARANTINE_INSTRUCTION,
                         SCRIPT_INSTRUCTION, direction_gate, persist_direction,
                         policy_check, read_backlog, read_feedback, scan_trends,
                         script_ready)
from agent.schemas import CleanedDirection, Directions, Script

join_research = JoinNode(name="join_research")

propose_directions = Agent(
    name="propose_directions",
    model=config.MODEL,
    instruction=PROPOSE_INSTRUCTION,
    output_schema=Directions)

scripter = Agent(
    name="scripter",
    model=config.MODEL,
    instruction=SCRIPT_INSTRUCTION,
    output_schema=Script)

quarantine = Agent(
    name="quarantine",
    model=config.MODEL,
    mode="task",
    instruction=QUARANTINE_INSTRUCTION,
    tools=[find_policy_hits, suggest_replacement],
    output_schema=CleanedDirection)

root_agent = Workflow(
    name="stage5_rag",
    description="trends + backlog + what the audience sent (with its media) -> you -> the router -> a script",
    edges=[(START, scan_trends, join_research),
           (START, read_backlog, join_research),
           (START, read_feedback, join_research),
           (join_research, propose_directions, direction_gate,
            persist_direction, policy_check),
           (policy_check, {"OK": scripter, "BLOCK": quarantine}),
           (quarantine, scripter),
           (scripter, script_ready)])
