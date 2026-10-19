# Vibe Studio, the app

The app on top of the workflow: an idea in, a published clip out, every event
live on the page. Session 7 of the lab.

    vibestudio/
      server/
        main.py        FastAPI: the page, /api, /static
        api.py         the REST surface
        bus.py         the event bus and the SSE stream (/api/events)
        runner.py      one Runner over the complete workflow; folds ADK events into RunState
        publish.py     multipart POST to vibetube.dev, three attempts, then it asks
        avatar.py      a portrait from the creator's description (Gemini image model)
        files.py       the backlog file, the profile, thumbnails
        graphinfo.py   nodes, edges and layers from wf.graph, for the drawing
        agent/         the finished agent, byte-identical to the lab's solution
                       (checks/verify_app.py); only config.py is the app's own
      web/             the React page (Vite); `npm run build` writes web/dist
      Dockerfile       one image: the page built in a stage, the server in the other
      deploy.py        gcloud run deploy, with the env the graph needs
      run.sh           run locally

## Run locally

    vibestudio/run.sh              # builds the page once, serves on http://localhost:4700
    python -m vibestudio           # the same, without the build step

Inside the lab repo the app shares the repo's `.env` and `runs/`: the Memory
Bank and corpus caches from sessions 6 and 4, and the renders. With
`STUDIO_REAL_VIDEO=0` the render is a stand-in that finishes in seconds; with
`ffmpeg` on PATH it is an eight-second push-in over the poster, so there is
still a clip to play and publish.

## Deploy

    python vibestudio/deploy.py    # or the button on session 7a

Reads the project and switches from `.env`, the two resource names from
`runs/memorybank.json` and `runs/ragcorpus.json`, and passes them as env vars
(`STUDIO_MEMORY_BANK`, `STUDIO_RAG_CORPUS`). One instance, session affinity:
the run's state lives in the process.

## The contract with the page

`GET /api/events` is one SSE stream. Every event is
`{type, seq, at, ...data, state}` where `state` is the folded run state after
the event, so a page that connects late is current from its first message.
`GET /api/graph` describes the workflow from `wf.graph`. `POST /api/run`,
`POST /api/run/pick`, `GET|POST|DELETE /api/backlog`, `POST /api/thumbnail`,
`GET|PUT /api/profile`, `POST /api/publish`.
