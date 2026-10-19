"""THE HOLE REGISTRY - single source of truth for every hole in the lab.

Every hole is UNCOMMENT-style: the carved starter carries a TODO line (or a
loud raise) plus the real solution commented out right below it. The student
deletes the TODO/raise line and uncomments the block - no copy-paste.

Each hole: file · anchor (what the CARVED starter contains) · snippet (the
filled lines). Consumed by:
  scripts/carve.py    filled -> carved   (ships the starter)
  scripts/rescue.py   carved -> filled   (one hole at a time, for the stuck)
  checks/verify_holes.py  proves every hole round-trips and starter/ is in sync
  checks/verify_pastes.py additionally proves CODELAB.md code blocks == snippets

Haunted Edition (v2): seven steps, nineteen holes. The lab order is SHIP_HOLES in
scripts/carve.py; the page each hole is made on is PAGE below.
"""

HOLES = {
    # Step 2 · the single-prompt agent gets its two research tools and the poster tool
    "TOOLS": ("stage0_prompt/agent.py",
              '''    tools=[],  # TODO: TOOLS - add the two research tools and the poster tool''',
              '''    tools=[check_trends, read_backlog, make_poster],'''),
    "POSTER_TOOL": ("stage0_prompt/agent.py",
                    '''    return {"status": "skipped", "note": "the poster tool is not wired yet"}  # TODO: POSTER_TOOL - call the image model: from agent.platform import images; return images.generate(subject, name="solo")''',
                    '''    from agent.platform import images
    return images.generate(subject, name="solo")'''),

    # Step 3a · the stage 1 sandbox gets its edge list
    "FANOUT_JOIN": ("stage1_fanout/agent.py",
                    '''join_research = None  # TODO: FANOUT_JOIN - define the JoinNode that waits for both readers''',
                    '''join_research = JoinNode(name="join_research")'''),
    "FANOUT_EDGES": ("stage1_fanout/agent.py",
                     '''    edges=[])  # TODO: FANOUT_EDGES - declare the edges: two readers into the join''',
                     '''    edges=[(START, scan_trends, join_research),
           (START, read_backlog, join_research)])'''),

    # Step 3b · the router's return line, and the router's edges in the sandbox
    "POLICY_ROUTE": ("agent/graph.py",
                     '''    # TODO: POLICY_ROUTE - return an Event whose output is node_input and whose route is "BLOCK" if bad else "OK"''',
                     '''    return Event(output=node_input, route="BLOCK" if bad else "OK")'''),
    "ROUTER_EDGES": ("stage3_router/agent.py",
                     '''           (join_research, propose_directions, choose_direction)]  # TODO: ROUTER_EDGES - append policy_check, then its two exits: (policy_check, {"OK": scripter, "BLOCK": quarantine})''',
                     '''           (join_research, propose_directions, choose_direction, policy_check),
           (policy_check, {"OK": scripter, "BLOCK": quarantine})]'''),

    # Step 3c · two loops: the task agent (a loop inside a node) and the back-edge (a loop in the graph)
    "QUARANTINE": ("stage3_router/agent.py",
                   '''def quarantine(node_input):  # TODO: QUARANTINE - 3c replaces this placeholder with the task agent
    return Event(output={"blocked": True, "title": node_input.get("title", "")},
                 message="blocked: the channel's policy refused this direction")''',
                   '''quarantine = Agent(
    name="quarantine",
    model=config.MODEL,
    instruction=QUARANTINE_INSTRUCTION,
    mode="task",
    tools=[find_policy_hits, suggest_replacement],
    output_schema=CleanedDirection,
)'''),
    "REVISE_LOOP": ("stage3_router/agent.py",
                    '''LOOP_EDGES = []  # TODO: REVISE_LOOP - the way back from quarantine, then the back-edge: [(quarantine, scripter), (scripter, script_check), (script_check, {"REVISE": scripter, "OK": script_ready})]''',
                    '''LOOP_EDGES = [(quarantine, scripter), (scripter, script_check), (script_check, {"REVISE": scripter, "OK": script_ready})]'''),

    # Step 4a · the stage 2 sandbox: the student defines the agent node and the chain through the gate
    "PROPOSER": ("stage2_direction/agent.py",
                 '''propose_directions = None  # TODO: PROPOSER - define the agent node: Agent(name, model, instruction, output_schema)''',
                 '''propose_directions = Agent(
    name="propose_directions",
    model=config.MODEL,
    instruction=PROPOSE_INSTRUCTION,
    output_schema=Directions)'''),
    "STAGE2_EDGES": ("stage2_direction/agent.py",
                     '''    edges=[(START, scan_trends, join_research),
           (START, read_backlog, join_research)])  # TODO: STAGE2_EDGES - add the third chain, from the join through the gate to persist_direction''',
                     '''    edges=[(START, scan_trends, join_research),
           (START, read_backlog, join_research),
           (join_research, propose_directions, direction_gate, persist_direction)])'''),

    # Step 4b · the human door suspends the run, and the pick is written to state
    "GATE_INPUT": ("agent/graph.py",
                   '''    # TODO: GATE_INPUT - suspend the graph here: yield a RequestInput with a message,
    # a response_schema (the form: one field, pick) and payload={"candidates": cands}''',
                   '''    yield RequestInput(
        message="Pick tonight's direction: 1, 2, 3 or 4.",
        response_schema={
            "type": "object",
            "properties": {
                "pick": {"type": "string", "enum": ["1", "2", "3", "4"]}}},
        payload={"candidates": cands})'''),
    "PERSIST_STATE": ("agent/graph.py",
                      '''    # TODO: PERSIST_STATE - yield an Event whose state holds direction, angle, hook, and user:prefs''',
                      '''    yield Event(state={"direction": chosen["title"], "angle": chosen.get("angle", ""),
                       "hook": hook, "user:prefs": {"last_direction": chosen["title"]}})'''),

    # Step 5a · memory as two callbacks on the step 4 graph
    "MEMORY_RECALL": ("stage4_memory/agent.py",
                      '''    output_schema=Directions)  # TODO: MEMORY_RECALL - add before_model_callback=recall_taste''',
                      '''    output_schema=Directions,
    before_model_callback=recall_taste)'''),
    "MEMORY_REMEMBER": ("stage4_memory/agent.py",
                        '''    output_schema=Script)  # TODO: MEMORY_REMEMBER - add after_agent_callback=remember_pick''',
                        '''    output_schema=Script,
    after_agent_callback=remember_pick)'''),

    # Step 5b · the third reader joins the fan-out, and hands back the posters with the passages
    "RAG_NODE": ("stage5_rag/agent.py",
                 '''           (START, read_backlog, join_research),  # TODO: RAG_NODE - add the third reader into the join: (START, read_feedback, join_research)''',
                 '''           (START, read_backlog, join_research),
           (START, read_feedback, join_research),'''),
    "RAG_CAPTION": ("agent/graph.py",
                    '''    return Event(output={"query": query, "feedback": [h["text"] for h in hits]})  # TODO: RAG_CAPTION - also hand back the posters the passages came with: "posters": rag.posters_in(hits)''',
                    '''    return Event(output={"query": query, "feedback": [h["text"] for h in hits],
                         "posters": rag.posters_in(hits)})'''),

    # Step 6 · Veo as a long-running tool (6a), the delivery by id (6a), and the media desk (6b)
    "VIDEO_TOOL": ("stage6_video/agent.py",
                   '''    tools=[render_submit])  # TODO: VIDEO_TOOL - wrap it: LongRunningFunctionTool(render_submit)''',
                   '''    tools=[LongRunningFunctionTool(render_submit)])'''),
    "DELIVER_RESPONSE": ("agent/deliver.py",
                         '''    part = Part(function_response=None)  # TODO: DELIVER_RESPONSE - FunctionResponse(id=row["call_id"], name=row["name"], response=response)''',
                         '''    part = Part(function_response=FunctionResponse(
        id=row["call_id"], name=row["name"], response=response))'''),
    "VIDEO_EDGES": ("stage6_video/agent.py",
                    '''           (script_check, {"REVISE": scripter, "OK": script_ready})]  # TODO: VIDEO_EDGES - add the desk's branch: (script_ready, render_desk, join_media)''',
                    '''           (script_check, {"REVISE": scripter, "OK": script_ready}),
           (script_ready, render_desk, join_media)]'''),
    "MEDIA_JOIN": ("stage6_video/agent.py",
                   '''MEDIA_EDGES = []  # TODO: MEDIA_JOIN - the poster's branch and the join's exit: [(script_ready, make_poster, join_media), (join_media, store_release)]''',
                   '''MEDIA_EDGES = [(script_ready, make_poster, join_media), (join_media, store_release)]'''),

    # Step 7 · the full graph, drawn by you (ships FILLED: students read the edge list, they do not type it)
    "EDGES": ("agent/graph.py",
              '''        # TODO: EDGES — delete me, uncomment the base graph below (Codelab: the release step, the EDGES hole)
        # (START, scan_trends, join_research),
        # (START, read_backlog, join_research),
        # (START, read_feedback, join_research),
        # (join_research, propose_directions, direction_gate,
        #  persist_direction, policy_check),
        # (policy_check, {"OK": scripter, "BLOCK": quarantine}),
        # (quarantine, scripter),
        # (scripter, script_check),
        # (script_check, {"REVISE": scripter, "OK": script_ready}),
        # (script_ready, render_desk, join_media),
        # (script_ready, make_poster, join_media),
        # (join_media, store_release),''',
              '''        (START, scan_trends, join_research),
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
        (join_media, store_release),'''),
}

# codelab section aliases for rescue
SECTIONS = {"s2": ["TOOLS", "POSTER_TOOL"],
            "s3a": ["FANOUT_JOIN", "FANOUT_EDGES"], "s3b": ["POLICY_ROUTE", "ROUTER_EDGES"], "s3c": ["QUARANTINE", "REVISE_LOOP"],
            "s3": ["FANOUT_JOIN", "FANOUT_EDGES", "POLICY_ROUTE", "ROUTER_EDGES", "QUARANTINE", "REVISE_LOOP"],
            "s4a": ["PROPOSER", "STAGE2_EDGES"], "s4b": ["GATE_INPUT", "PERSIST_STATE"],
            "s4": ["PROPOSER", "STAGE2_EDGES", "GATE_INPUT", "PERSIST_STATE"],
            "s5": ["MEMORY_RECALL", "MEMORY_REMEMBER", "RAG_NODE", "RAG_CAPTION"],
            "s6": ["VIDEO_TOOL", "DELIVER_RESPONSE", "VIDEO_EDGES", "MEDIA_JOIN"],
            "s7": ["EDGES"]}


# The page each shipped hole is made on, as slug/part of the workbench, and a
# short name for it. The catch-up bar at the top of every page fills the holes
# of every earlier page from this; carve.py's SHIP_HOLES is the order.
PAGE = {
    "TOOLS": "poster", "POSTER_TOOL": "poster",
    "FANOUT_JOIN": "structures/a", "FANOUT_EDGES": "structures/a",
    "POLICY_ROUTE": "structures/b", "ROUTER_EDGES": "structures/b",
    "QUARANTINE": "structures/c", "REVISE_LOOP": "structures/c",
    "PROPOSER": "seance/a", "STAGE2_EDGES": "seance/a",
    "GATE_INPUT": "seance/b", "PERSIST_STATE": "seance/b",
    "MEMORY_RECALL": "ghost-whispers/b", "MEMORY_REMEMBER": "ghost-whispers/b",
    "RAG_NODE": "ghost-whispers/d", "RAG_CAPTION": "ghost-whispers/d",
    "VIDEO_TOOL": "media-desk/a", "DELIVER_RESPONSE": "media-desk/a",
    "VIDEO_EDGES": "media-desk/b", "MEDIA_JOIN": "media-desk/b",
}
LABEL = {
    "TOOLS": "the three tools on the agent", "POSTER_TOOL": "the image model call in make_poster",
    "FANOUT_JOIN": "the JoinNode", "FANOUT_EDGES": "the two reader chains",
    "POLICY_ROUTE": "the route in policy_check", "ROUTER_EDGES": "the router and its two exits",
    "QUARANTINE": "the quarantine task agent", "REVISE_LOOP": "the way back from quarantine and the back-edge from script_check",
    "PROPOSER": "the propose_directions agent", "STAGE2_EDGES": "the chain from the join through the gate",
    "GATE_INPUT": "the RequestInput in direction_gate", "PERSIST_STATE": "the state write in persist_direction",
    "MEMORY_RECALL": "before_model_callback on propose_directions", "MEMORY_REMEMBER": "after_agent_callback on the scripter",
    "RAG_NODE": "read_feedback in the fan-out", "RAG_CAPTION": "the posters handed back with the passages",
    "VIDEO_TOOL": "the LongRunningFunctionTool wrapper", "DELIVER_RESPONSE": "the FunctionResponse in agent/deliver.py",
    "VIDEO_EDGES": "the desk's branch into join_media", "MEDIA_JOIN": "the poster's branch and the join's exit",
}
