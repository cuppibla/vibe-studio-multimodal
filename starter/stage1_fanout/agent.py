"""Stage 1 - the research department, drawn. The FRONT of the real graph.

Nothing here is a copy: the two readers and the join are
imported from agent/graph.py - the exact functions the finished channel
runs. This app just declares a SUBSET of the final edge list, so you can
run the front of the graph on its own, today, with nothing else built.

Two readers for now. The fan-out GROWS later: the audience's feedback joins
in step 7 as a third reader - one edge, and the map grows a node the moment
you add it.
"""
from google.adk import Workflow
from google.adk.workflow import START, JoinNode

from agent.graph import read_backlog, scan_trends

join_research = None  # TODO: FANOUT_JOIN - define the JoinNode that waits for both readers

root_agent = Workflow(
    name="stage1_fanout",
    description="2 real readers -> join -> one research dict",
    edges=[])  # TODO: FANOUT_EDGES - declare the edges: two readers into the join
