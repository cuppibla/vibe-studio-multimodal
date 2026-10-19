# VibeStudio · Haunted Edition

The Halloween re-cut of the lab: seven steps instead of ten, the same ADK
constructs taught in a tighter order, and the image model (Nano Banana,
`gemini-2.5-flash-image`) in the loop twice. Everything here is on the
`haunted-edition-v2` branch.

## The seven steps

| # | Slug | What it teaches | Sandbox | Holes |
|---|---|---|---|---|
| 1 | `story` | The haunting: the scenario, the finished graph, what you learn | – | – |
| 2 | `poster` | One agent, one poster: model, instruction, three tools, the image model as a tool | `stage0_prompt` | TOOLS, POSTER_TOOL |
| 3 | `structures` | a fan-out and join · b the router (a stand-in gate) · c two loops: task mode, a routed back-edge | `stage1_fanout`, `stage3_router` | FANOUT_JOIN, FANOUT_EDGES, POLICY_ROUTE, ROUTER_EDGES, QUARANTINE, REVISE_LOOP |
| 4 | `seance` | a the agent node and the chain through the door · b RequestInput and the state write | `stage2_direction` | PROPOSER, STAGE2_EDGES, GATE_INPUT, PERSIST_STATE |
| 5 | `ghost-whispers` | a Memory Bank (three topics) · b callbacks · c RAG Engine over comments and captioned posters · d the third reader hands back posters | `stage4_memory`, `stage5_rag` | MEMORY_RECALL, MEMORY_REMEMBER, RAG_NODE, RAG_CAPTION |
| 6 | `media-desk` | a LongRunningFunctionTool and the delivery by id · b the desk: Veo and the poster in parallel, a join, the release | `stage6_video` | VIDEO_TOOL, DELIVER_RESPONSE, VIDEO_EDGES, MEDIA_JOIN |
| 7 | `release` | a deploy VibeStudio · b what you built | – | EDGES (ships filled) |

`checks/holes.py` is the registry (21 holes); `PAGE` there maps each hole to a
workbench page, and `CODELAB.md` shows every snippet under a
`<!-- code: NAME -->` anchor. The four checks stay the proof:

    python checks/verify_holes.py      # every hole round-trips; starter/ in sync
    python checks/verify_reload.py     # the seven stage apps build after every reload
    python -m checks.verify_pastes     # CODELAB.md blocks == registry snippets
    python checks/verify_app.py --sync # vibestudio/server/agent == agent/

## What the image model does

* `agent/platform/images.py`: `images.generate(subject, visual_style, name)` → one 9:16 PNG
  under `runs/media/posters`, served at `/static/posters`. `STUDIO_REAL_IMAGES=0`, or no
  credentials, copies `img/haunted/poster-standin.png` instead and flags `prebaked`.
* Step 2: `make_poster` is a tool on the single-prompt agent.
* Step 5: the RAG corpus is `agent/comments.md` plus `agent/media/past/captions.md`
  (six past posters, captioned by Gemini at `python -m agent.platform.rag load --caption`);
  `rag.posters_in(hits)` hands the posters back with the passages.
* Step 6: `make_poster` is a node beside `render_desk`; `join_media` waits for both;
  `store_release` keeps the pair and remembers a real poster under Memory Bank's
  `VISUAL_STYLE` topic, which `make_poster` reads on the next run.
* The app (`vibestudio/`) shows the poster beside the clip and sends it to VibeTube as the
  clip's thumbnail.

## The art

The hero, the share image and the six past posters are meant to come from Nano Banana:

    python scripts/gen_halloween_art.py --dry-run     # every prompt, no calls
    python scripts/gen_halloween_art.py               # needs GOOGLE_API_KEY or STUDIO_VERTEX=1 + ADC
    python scripts/placeholders.py                    # the Pillow stand-ins the lab ships with

Until the real art is generated, `img/haunted/hero.png` and `hero.gif` are the approved
pastel-dusk comps (direction A), the six past posters are Pillow placeholders, and
`web/public/share.png` is unchanged.

## Skin

Both pages carry the skin in CSS tokens only. The workbench sets
`data-skin="haunted"` on `<html>` (`web/src/main.tsx`; `VITE_SKIN=` builds the base
look); "light" is dusk, the default, and "dark" is night. The fog and the bats live in
`Ambience.tsx` and `index.css`; the wordmark tag uses the Creepster font.
