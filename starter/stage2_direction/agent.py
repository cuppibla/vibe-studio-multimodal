"""Stage 2 - the séance circle: the agent node, the pause, and the state.
Stage 1 plus propose_directions, direction_gate and persist_direction.

propose_directions is defined here, in the sandbox, so you write the agent
node yourself; agent/graph.py holds the identical definition the production
graph runs. It turns the join's research dict into FOUR typed candidates,
each with a poster idea. direction_gate suspends the run on a small form: a
RequestInput node. persist_direction resolves your pick and writes it to
shared state, where every later node can read it.

The kill test lives here: suspend at the form, Ctrl+C the server, restart,
reopen the session - the form is still standing, because a pause is a row,
not a thread.
"""
from google.adk import Agent, Workflow
from google.adk.workflow import START, JoinNode

from agent.platform import config
from agent.graph import (PROPOSE_INSTRUCTION, direction_gate, persist_direction,
                         read_backlog, scan_trends)
from agent.schemas import Directions

join_research = JoinNode(name="join_research")

propose_directions = None  # TODO: PROPOSER - define the agent node: Agent(name, model, instruction, output_schema)

root_agent = Workflow(
    name="stage2_direction",
    description="research -> 4 candidates -> the human door -> the pick in state",
    edges=[(START, scan_trends, join_research),
           (START, read_backlog, join_research)])  # TODO: STAGE2_EDGES - add the third chain, from the join through the gate to persist_direction
