"""Session 3a - the research department, drawn. The FRONT of the real graph.

Nothing here is a copy: the two readers are imported from agent/graph.py,
the exact functions the finished channel runs. This app declares a SUBSET
of the final edge list, so you can run the front of the graph on its own,
today, with nothing else built.

A Workflow is an edge list. Each tuple is a chain: START -> a reader -> the
join. Two chains that end at the same JoinNode are a fan-out: both readers
run at once, and the join waits for both before anything after it starts.
The fan-out GROWS later: what the audience sent joins in the ingestion
session as a third reader - one more chain, and the map grows a node.
"""
from google.adk import Workflow
from google.adk.workflow import START, JoinNode

from agent.graph import read_backlog, scan_trends

join_research = JoinNode(name="join_research")      # the barrier both readers meet at
EDGES = []  # TODO: FANOUT - the two chains into the join (see the hint)

root_agent = Workflow(
    name="stage1_fanout",
    description="2 real readers -> join -> one research dict",
    edges=EDGES)
