"""`python -m vibestudio` - start the app on port 4700 (or $PORT)."""
import sys

import uvicorn

from .server.agent.platform import config


def main() -> int:
    from .server.agent.platform import memory, rag
    missing = []
    if not memory.engine_name():
        missing.append("Memory Bank   -> python -m agent.platform.bank        (or set STUDIO_MEMORY_BANK)")
    if not rag.corpus_name():
        missing.append("RAG corpus    -> python -m agent.platform.rag         (or set STUDIO_RAG_CORPUS)")
    if missing:
        print("Vibe Studio needs the two resources the lab creates:\n  " + "\n  ".join(missing)
              + "\nStarting anyway: the graph degrades without them (no memory, no feedback).")
    print(f"Vibe Studio on http://localhost:{config.PORT}  ·  runs in {config.RUNS}  ·  "
          f"{'real Veo' if config.REAL_VIDEO else 'stand-in renders (STUDIO_REAL_VIDEO=0)'}")
    uvicorn.run("vibestudio.server.main:app", host="0.0.0.0", port=config.PORT, log_level="warning")
    return 0


if __name__ == "__main__":
    sys.exit(main())
