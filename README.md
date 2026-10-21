# VibeStudio · Multimodal agentic workflow with ADK, Haunted Edition

The workbench for the **VibeStudio** codelab. You run a cozy-spooky short-video
channel, and over seven sessions you build the workflow that runs it with the
Agent Development Kit: one agent that draws the first poster, a research
fan-out and a router with a task-mode loop behind it, a multimodal ingestion
pipeline (what the audience sent as comments, voice notes, photos and clips,
read by Gemini into one RAG Engine corpus), two kinds of suspension taught as
one mechanism (a human pause and Veo as a long-running tool, both resumed by
id from the session store), memory across nights through two callbacks on
Memory Bank, and the release: the graph inside an app on Cloud Run, the clip
published to VibeTube with the poster as its thumbnail.

The walkthrough is a codelab, kept in its own repository with its figures.
Every edit, its hint and its verify rows are also on the workbench pages, so
the lab runs from them alone: in-page editors, runners and verify panels,
served by `scripts/start.sh` at http://localhost:4600. It is a cut of
[Lin's Haunted Edition](https://github.com/weimeilin79/vibe-studio-lab)
(`haunted-edition-v2`): the same theme, the same graph, re-cut around the
multimodal line and the two kinds of suspension.

## What it teaches

| Session | Concepts | Your edits |
|---|---|---|
| 2 · Image generation | An `Agent` with function tools; `function_call` and `function_response`; the image model as a tool, the poster as an artifact in adk web | `POSTER_TOOL` |
| 3 · Workflows | `Workflow`, `START`, edges as tuples, `JoinNode`; a router that names its edge; policy as data; `mode="task"` with tools and `finish_task` | `FANOUT`, `ROUTER` |
| 4 · Multimodal ingestion | One reader per kind (Gemini listens, looks, watches), one line shape, one RAG Engine corpus; a third reader by meaning that hands the media back | `INGEST_READERS`, `RAG_MEDIA` |
| 5 · Video generation | `RequestInput` for a person, `LongRunningFunctionTool` for Veo, both resumed by `FunctionResponse(id=...)`; the session store; `Event(state=...)` and parameter binding | `GATE`, `VIDEO_TOOL`, `DELIVER_RESPONSE`, `STATE_SHARE` |
| 6 · Memory | Memory Bank: scope, extraction, consolidation, custom topics; `before_model_callback` and `after_agent_callback` | `MEMORY_RECALL`, `MEMORY_REMEMBER` |
| 7 · Deploy and publish | The `Runner`, an app with one event stream, a container on Cloud Run; one multipart POST to a VibeTube room | the room's event code, publish |

## Run it

```bash
git clone https://github.com/cuppibla/vibe-studio-multimodal
cd vibe-studio-multimodal
./setup_project.sh              # a NEW Google Cloud project with billing, recorded in ~/project_id.txt
./setup_codelab.sh              # uv + deps, the APIs, .env, one model call, then the workbench in the background on :4600
```

`setup_project.sh` makes a fresh project on a plain run, as the other Agent Valley labs do: `~/project_id.txt` is shared by every lab, so whatever is in it may belong to another codelab. To continue in an existing project, from an earlier run of this lab or from another lab, ask for it by name: `VIBE_STUDIO_REUSE_PROJECT=1 ./setup_project.sh` takes the ID in `~/project_id.txt`, or scans your account for a `vibe-studio-NNNN`, and only creates something if neither turns up. That is also the flag for any re-run. `setup_codelab.sh` can be run again as it is; it keeps the answers you gave before. It asks for the VibeTube room (the event code; `sandbox` is always open) and your display name, and ends with `python scripts/preflight.py`, whose last line is the link to session 1. `scripts/stop.sh` stops the workbench, `scripts/start.sh` starts it again, and `scripts/restart.sh --pull` does both around a pull.

Sessions 4 to 7 need a Google Cloud project with GEAP enabled (Cloud Shell
already has credentials): RAG Engine, Veo, Memory Bank and Cloud Run.
`STUDIO_REAL_VIDEO=0` in `.env` replaces the Veo render with a stand-in that
finishes in seconds; with `ffmpeg` on PATH (Cloud Shell has it) the stand-in is
an eight-second push-in over tonight's poster, so the clip can still be played
and published. `STUDIO_REAL_IMAGES=0` copies a stand-in poster instead of
drawing one.

## Updating a running lab

`scripts/restart.sh` handles the two things a pull cannot: it runs `uv sync` when the dependency lock changed, and rebuilds the page when its sources changed, because neither the venv nor `web/dist` is in the repository.

```bash
scripts/restart.sh --pull       # git pull, stop, rebuild if needed, start in the background
```

Then reload the browser tab. Without `--pull` it just restarts. It prints the link and leaves the server in the background, with its log in `runs/lab.log`. `scripts/start.sh` is the foreground equivalent, where Ctrl+C stops everything.

The app of session 7 runs on its own:

```bash
vibestudio/run.sh               # the app on http://localhost:4700
python vibestudio/deploy.py     # the same app on Cloud Run (or the button on 7a)
```

The app sends ADK's traces to Cloud Trace in your project (Trace Explorer, service `vibestudio`). `STUDIO_TRACING=0` turns that off.

## Repository layout

```
vibe-studio-multimodal/
├── agent/                          # the workflow and the platform clients
│   ├── graph.py                    # the graph: three readers, the proposer, the gate, the router, the script, the desk
│   ├── desk.py                     # render_desk and render_submit, the LongRunningFunctionTool
│   ├── deliver.py                  # the delivery console: find the pending call, wait for Veo, answer by id
│   ├── schemas.py                  # Direction, Directions, CleanedDirection, Script, each with a poster idea
│   ├── trends.py                   # the trend pool (five Halloween looks) and the sampler
│   ├── backlog.txt                 # the creator's Halloween ideas
│   ├── comments.md                 # twelve audience comments, the text half of what they sent
│   ├── audience/                   # the rest: voice/*.mp3, photo/*.jpg, clip/*.mp4 (scripts/make_audience.py)
│   ├── media/past/                 # six past posters and captions.md, what Gemini sees in each
│   ├── cleanup_tools.py            # find_policy_hits, suggest_replacement: the task agent's tools
│   ├── policy_words.txt            # the policy, as data; policy_replacements.txt, the approved stand-ins
│   └── platform/                   # Google Cloud clients and runtime helpers
│       ├── config.py               # paths, environment, locations, model flags
│       ├── audience.py             # one reader per kind: transcribe_voice, caption_photos, watch_clips
│       ├── rag.py                  # RAG Engine: the corpus, load --audience, retrieve, media_in
│       ├── images.py               # the image model: generate (posters), describe (captions)
│       ├── videogen.py             # Veo: start, check; the stand-in render
│       ├── memory.py               # Memory Bank and the two callbacks
│       ├── state.py                # runs/state.json
│       └── drive.py                # the session service, shared with adk web
├── stage0_prompt/ … stage6_video/  # one sandbox app per session, each a slice of the graph
│   ├── stage0_prompt/agent.py      # session 2: one agent, three tools, the poster
│   ├── stage1_fanout/agent.py      # session 3a: the fan-out and the join
│   ├── stage3_router/agent.py      # session 3b: the router, the scripter, quarantine
│   ├── stage5_rag/agent.py         # session 4b: the third reader in the fan-out
│   ├── stage6_video/agent.py       # session 5: the whole graph, the gate and the desk
│   └── stage4_memory/agent.py      # session 6: the graph with the two callbacks
├── starter/                        # the nine student files with their TODO lines; the live copies are not in git
├── server/ & web/                  # the workbench (FastAPI + React, port 4600)
├── vibestudio/                     # the app deployed in session 7, with its own copy of agent/
│   ├── server/                     # FastAPI: the Runner over the finished graph, the event bus, publish
│   ├── web/                        # the creator's page
│   ├── run.sh                      # the app locally on 4700
│   └── deploy.py                   # gcloud run deploy, with the env the graph needs
├── checks/                         # the hole registry and the verifiers
│   ├── holes.py                    # the twelve holes: file, shipped line, answer
│   ├── verify_holes.py             # every hole round-trips and starter/ is in sync
│   ├── verify_pastes.py            # every <!-- code: HOLE --> block in the codelab equals the registry
│   ├── verify_reload.py            # a save-time reload keeps every schema class and stage app
│   └── verify_app.py               # vibestudio/server/agent/ equals the finished lab agent
├── scripts/                        # setup, start/stop/restart, preflight, starter, rescue/carve, reset,
│                                   # make_audience.py (the fixture), gen_halloween_art.py (the page art)
└── img/                            # hero.gif and haunted/: the hero, the logos, the stand-in poster images.py falls back to
```

## The holes

Every hands-on edit in the lab is a *hole*: a line students see (a `TODO`) and the line they write in its place. `checks/holes.py` is the registry of all twelve, one entry per hole with the file, the shipped line, and the answer; the pages' hints show the same answers, and `EDGES` ships filled as read-along code. Session 7's last edit, the room's event code, is a configuration, not a hole.

| Command | What it does | When |
|---|---|---|
| `scripts/starter.sh` | Copies the nine hands-on files back from `starter/`, wipes local run state and the session store, and verifies. Stop the server first. | Before a class, or after a rehearsal, to reset to what students receive. |
| `python scripts/rescue.py RAG_MEDIA` | Writes one hole's answer into its file. A section name (`s4`) fills one session; no argument fills every hole. | A student stuck on one edit; or a fully worked tree to rehearse a later session. `carve.py` undoes it. |
| `python scripts/carve.py` | Puts the shipped `TODO` lines back (the inverse of rescue). | After a rescue, to return to the student state. |
| `python scripts/reset.py` | Wipes local run state only: `runs/state.json`, the session store, the worker logs. Keeps the `user:` keys unless `--all`. | Between runs, when the session store is confused. |
| `python scripts/make_audience.py` | Regenerates the audience fixture: voice notes with Gemini TTS, clips with ffmpeg (the TTS voices run on the lab's own auth path: `STUDIO_VERTEX=1` with ADC, or an AI Studio key). | Only when the fixture changes; the repo ships it, the six clips included. |
| `scripts/restart.sh [--pull]` | Restarts the workbench in the background, rebuilding the page if its sources changed. | After a `git pull`, or after editing workbench code. |
| `python scripts/preflight.py` | Checks the environment: the SDK, the credentials, the APIs, the stage apps. | Setup, and whenever something stops loading. |

The app in `vibestudio/` carries its own complete copy of the agent, so it works whether or not the holes in the lab are filled.

## For authors

Four checks keep the registry, the pages, the codelab and the app in agreement. Run them after any change to a hole, a stage app, `agent/`, or a code block in the codelab:

```bash
python checks/verify_holes.py    # every hole round-trips (carve then fill) and starter/ is in sync
python checks/verify_reload.py   # a save-time reload keeps every schema class and stage app as it was
python checks/verify_pastes.py   # every <!-- code: HOLE --> block in the codelab equals the registry's answer (CODELAB=path; skips without it)
python checks/verify_app.py      # vibestudio/server/agent/ equals the finished lab agent (--sync to copy)
```

When a hole changes: update `checks/holes.py`, update the codelab block, run `scripts/carve.py`, copy the carved file into `starter/`, run `checks/verify_app.py --sync`, then run the four checks.

The nine files students edit (`agent/graph.py`, `agent/deliver.py`, `agent/platform/audience.py`, `stage*/agent.py`) are listed in `.gitignore` and never committed: setup and `scripts/start.sh` copy them from `starter/` when they are missing and leave existing ones alone, so a tree filled in while testing cannot reach a commit. `starter/` is the file that ships. The readers' output files under `agent/audience/` are ignored the same way; the fixture ships without them.

`scripts/dev.sh` runs the workbench with hot reload (the API on 4600, Vite on 5173). The codelab's figures, their sources and its `claat` build live with the codelab.
