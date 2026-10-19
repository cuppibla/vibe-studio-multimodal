# Starter files

The four files students edit during the lab, exactly as they receive them:
every hands-on hole carved out, everything else filled.

    stage0_prompt/agent.py      step 3c   tools=[]            (TOOLS)
    stage1_fanout/agent.py      step 4b   join + edges        (FANOUT_JOIN, FANOUT_EDGES)
    stage2_direction/agent.py   step 4c/4d chain              (PROPOSER, STAGE2_EDGES)
    stage3_router/agent.py      step 5a/5b/5c                 (QUARANTINE, ROUTER_EDGES)
    stage4_memory/agent.py      step 6b                       (MEMORY_RECALL, MEMORY_REMEMBER)
    stage5_rag/agent.py         step 7b   the third reader    (RAG_NODE)
    stage6_video/agent.py       step 8a/8b the render desk    (VIDEO_TOOL, VIDEO_EDGES)
    agent/deliver.py            step 8a   the function_response  (DELIVER_RESPONSE)
    agent/graph.py              step 4d   RequestInput yield  (GATE_INPUT); step 5a the state write (PERSIST_STATE); step 5b the router's return (POLICY_ROUTE)

Reset after a rehearsal (server stopped):

    scripts/starter.sh

Keep this folder in sync when a hole changes: `checks/verify_holes.py` must
pass on the files here, which `scripts/starter.sh` checks after copying.
