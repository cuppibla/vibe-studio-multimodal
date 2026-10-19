"""Step 5b - whispers from the audience. The step 5a graph plus one more reader.

RAG Engine is not a callback and not a tool: it is a third source in the
research fan-out. read_feedback (agent/graph.py) embeds tonight's idea,
asks the corpus for the nearest passages of audience comments, and the
join hands them to the proposer with the trends and the backlog. The corpus
is mixed: the comments, and six past posters captioned by Gemini at ingest,
so a passage can come back with the picture it was written under.
"""
from google.adk import Agent, Workflow
from google.adk.workflow import START, JoinNode

from agent.platform import config
from agent.cleanup_tools import find_policy_hits, suggest_replacement
from agent.graph import (PROPOSE_INSTRUCTION, QUARANTINE_INSTRUCTION,
                         SCRIPT_INSTRUCTION, direction_gate, persist_direction,
                         policy_check, read_backlog, read_feedback, scan_trends,
                         script_ready)
from agent.platform.memory import recall_taste, remember_pick
from agent.schemas import CleanedDirection, Directions, Script

join_research = JoinNode(name="join_research")

propose_directions = Agent(
    name="propose_directions",
    model=config.MODEL,
    instruction=PROPOSE_INSTRUCTION,
    output_schema=Directions,
    before_model_callback=recall_taste)

scripter = Agent(
    name="scripter",
    model=config.MODEL,
    instruction=SCRIPT_INSTRUCTION,
    output_schema=Script,
    after_agent_callback=remember_pick)

quarantine = Agent(
    name="quarantine",
    model=config.MODEL,
    mode="task",
    instruction=QUARANTINE_INSTRUCTION,
    tools=[find_policy_hits, suggest_replacement],
    output_schema=CleanedDirection)

root_agent = Workflow(
    name="stage5_rag",
    description="trends + backlog + feedback (with posters) -> you -> the policy gate -> a script in a loop, with memory",
    edges=[(START, scan_trends, join_research),
           (START, read_backlog, join_research),
           (START, read_feedback, join_research),
           (join_research, propose_directions, direction_gate,
            persist_direction, policy_check),
           (policy_check, {"OK": scripter, "BLOCK": quarantine}),
           (quarantine, scripter),
           (scripter, script_ready)])
