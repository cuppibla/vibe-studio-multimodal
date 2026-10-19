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

The multimodal cut: seven sessions, ten shipped holes (+ EDGES, which ships
filled). One noun per session, one mechanism at a time:
  2 Image generation   POSTER_TOOL
  3 Workflows          FANOUT · ROUTER
  4 Multimodal ingestion   RAG_CAPTION (becomes RAG_MEDIA with the audience readers)
  5 Video generation   GATE · VIDEO_TOOL · DELIVER_RESPONSE · STATE_SHARE
  6 Memory             MEMORY_RECALL · MEMORY_REMEMBER
  7 Deploy and publish EDGES (read), PUBLISH (a configuration step, not a code hole)
The lab order is SHIP_HOLES in scripts/carve.py; the page each hole is made on is PAGE below.
"""

HOLES = {
    # Session 2 · Image generation: make_poster calls the image model
    "POSTER_TOOL": ("stage0_prompt/agent.py",
                    '''    return {"status": "skipped", "note": "the poster tool is not wired yet"}  # TODO: POSTER_TOOL - call the image model: from agent.platform import images; return images.generate(subject, name="solo")''',
                    '''    from agent.platform import images
    return images.generate(subject, name="solo")'''),

    # Session 3a · Workflows: the join both readers meet at, and the two chains into it - one paste
    "FANOUT": ("stage1_fanout/agent.py",
               '''EDGES = []  # TODO: FANOUT - the two chains into the join (see the hint)''',
               '''EDGES = [(START, scan_trends, join_research),
         (START, read_backlog, join_research)]'''),

    # Session 3b · Workflows: the router between the pick and the scripter, its two exits, and the way back
    "ROUTER": ("stage3_router/agent.py",
               '''           (join_research, propose_directions, choose_direction, scripter),  # TODO: ROUTER - put policy_check between the pick and the scripter, with its two exits and the way back from quarantine (see the hint)''',
               '''           (join_research, propose_directions, choose_direction, policy_check),
           (policy_check, {"OK": scripter, "BLOCK": quarantine}),
           (quarantine, scripter),'''),

    # Session 4 · Multimodal ingestion: the third reader hands back the media the passages came with
    "RAG_CAPTION": ("agent/graph.py",
                    '''    return Event(output={"query": query, "feedback": [h["text"] for h in hits]})  # TODO: RAG_CAPTION - also hand back the posters the passages came with: "posters": rag.posters_in(hits)''',
                    '''    return Event(output={"query": query, "feedback": [h["text"] for h in hits],
                         "posters": rag.posters_in(hits)})'''),

    # Session 5a · Video generation: two kinds of suspension - for a person (GATE) and for a slow tool (VIDEO_TOOL)
    "GATE": ("agent/graph.py",
             '''    # TODO: GATE - suspend the graph here: yield a RequestInput with a message,
    # a response_schema (the form: one field, pick) and payload={"candidates": cands}''',
             '''    yield RequestInput(
        message="Pick tonight's direction: 1, 2, 3 or 4.",
        response_schema={
            "type": "object",
            "properties": {
                "pick": {"type": "string", "enum": ["1", "2", "3", "4"]}}},
        payload={"candidates": cands})'''),
    "VIDEO_TOOL": ("stage6_video/agent.py",
                   '''    tools=[render_submit])  # TODO: VIDEO_TOOL - wrap it: LongRunningFunctionTool(render_submit)''',
                   '''    tools=[LongRunningFunctionTool(render_submit)])'''),
    "DELIVER_RESPONSE": ("agent/deliver.py",
                         '''    part = Part(function_response=None)  # TODO: DELIVER_RESPONSE - FunctionResponse(id=row["call_id"], name=row["name"], response=response)''',
                         '''    part = Part(function_response=FunctionResponse(
        id=row["call_id"], name=row["name"], response=response))'''),

    # Session 5b · Video generation: the two branches share what they made by name, in state
    "STATE_SHARE": ("agent/graph.py",
                    '''                message=f"poster: {said}")  # TODO: STATE_SHARE - add state={"poster_url": rec.get("url", ""), "poster_path": rec.get("path", "")} so store_release can bind the poster by name''',
                    '''                state={"poster_url": rec.get("url", ""), "poster_path": rec.get("path", "")},
                message=f"poster: {said}")'''),

    # Session 6 · Memory: two callbacks, a read before the model and a write after the agent
    "MEMORY_RECALL": ("stage4_memory/agent.py",
                      '''    output_schema=Directions)  # TODO: MEMORY_RECALL - add before_model_callback=recall_taste''',
                      '''    output_schema=Directions,
    before_model_callback=recall_taste)'''),
    "MEMORY_REMEMBER": ("stage4_memory/agent.py",
                        '''    output_schema=Script)  # TODO: MEMORY_REMEMBER - add after_agent_callback=remember_pick''',
                        '''    output_schema=Script,
    after_agent_callback=remember_pick)'''),

    # Session 7 · the full graph, drawn by you (ships FILLED: students read the edge list, they do not type it)
    "EDGES": ("agent/graph.py",
              '''        # TODO: EDGES — delete me, uncomment the base graph below (Codelab: the release step, the EDGES hole)
        # (START, scan_trends, join_research),
        # (START, read_backlog, join_research),
        # (START, read_feedback, join_research),
        # (join_research, propose_directions, direction_gate,
        #  persist_direction, policy_check),
        # (policy_check, {"OK": scripter, "BLOCK": quarantine}),
        # (quarantine, scripter),
        # (scripter, script_ready),
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
        (scripter, script_ready),
        (script_ready, render_desk, join_media),
        (script_ready, make_poster, join_media),
        (join_media, store_release),'''),
}

# codelab section aliases for rescue
SECTIONS = {"s2": ["POSTER_TOOL"],
            "s3": ["FANOUT", "ROUTER"], "s3a": ["FANOUT"], "s3b": ["ROUTER"],
            "s4": ["RAG_CAPTION"],
            "s5": ["GATE", "VIDEO_TOOL", "DELIVER_RESPONSE", "STATE_SHARE"],
            "s5a": ["GATE", "VIDEO_TOOL", "DELIVER_RESPONSE"], "s5b": ["STATE_SHARE"],
            "s6": ["MEMORY_RECALL", "MEMORY_REMEMBER"],
            "s7": ["EDGES"]}


# The page each shipped hole is made on, as slug/part of the workbench, and a
# short name for it. The catch-up bar at the top of every page fills the holes
# of every earlier page from this; carve.py's SHIP_HOLES is the order.
PAGE = {
    "POSTER_TOOL": "image",
    "FANOUT": "workflows/a", "ROUTER": "workflows/b",
    "RAG_CAPTION": "ingestion/b",
    "GATE": "video/a", "VIDEO_TOOL": "video/a", "DELIVER_RESPONSE": "video/a",
    "STATE_SHARE": "video/b",
    "MEMORY_RECALL": "memory/b", "MEMORY_REMEMBER": "memory/b",
}
LABEL = {
    "POSTER_TOOL": "the image model call in make_poster",
    "FANOUT": "the two reader chains into the join",
    "ROUTER": "the router between the pick and the scripter, with its exits",
    "RAG_CAPTION": "the media handed back with the passages",
    "GATE": "the RequestInput in direction_gate",
    "VIDEO_TOOL": "the LongRunningFunctionTool wrapper",
    "DELIVER_RESPONSE": "the FunctionResponse in agent/deliver.py",
    "STATE_SHARE": "the poster's URL written to state in make_poster",
    "MEMORY_RECALL": "before_model_callback on propose_directions",
    "MEMORY_REMEMBER": "after_agent_callback on the scripter",
}
