"""The app's configuration. Same switches as the lab's agent/platform/config.py, with
one difference: where things are.

The app runs in two places. Inside the lab repo, next to the student's work,
it shares the repo's .env and runs/ (the Memory Bank and corpus caches, the
render files). On Cloud Run it is the whole filesystem, so .env and runs/ are
its own, and the two resource names arrive as STUDIO_MEMORY_BANK and
STUDIO_RAG_CORPUS from deploy.sh.
"""
import os
import pathlib

HERE = pathlib.Path(__file__).resolve().parents[1]      # vibestudio/server/agent
APP_ROOT = HERE.parent.parent                             # vibestudio/
_repo = APP_ROOT.parent
REPO = _repo if (_repo / "agent" / "graph.py").exists() and (_repo / "checks").exists() else None
ROOT = REPO or APP_ROOT
RUNS = (REPO or APP_ROOT) / "runs"
RUNS.mkdir(exist_ok=True)
MEDIA = RUNS / "media"                                    # served at /static
(MEDIA / "renders").mkdir(parents=True, exist_ok=True)
(MEDIA / "thumbs").mkdir(parents=True, exist_ok=True)

for _env in (APP_ROOT / ".env", (REPO / ".env") if REPO else None):
    if _env and _env.exists():
        for line in _env.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())
        break

# Two auth paths, one switch:
#   STUDIO_VERTEX=1  -> Vertex via ADC (Cloud Shell, Cloud Run: zero keys)
#   otherwise        -> AI Studio GOOGLE_API_KEY (laptops)
VERTEX = os.environ.get("STUDIO_VERTEX", "").lower() in ("1", "true")
if VERTEX:
    os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "1")
    os.environ.setdefault("GOOGLE_CLOUD_LOCATION", "global")
    if not os.environ.get("GOOGLE_CLOUD_PROJECT"):
        try:
            import google.auth
            _, _proj = google.auth.default()
            if _proj:
                os.environ["GOOGLE_CLOUD_PROJECT"] = _proj
        except Exception:
            pass
else:
    os.environ.pop("GOOGLE_GENAI_USE_VERTEXAI", None)

MODEL = os.environ.get("STUDIO_MODEL", "gemini-3-flash-preview")
IMAGE_MODEL = os.environ.get("STUDIO_IMAGE_MODEL", "gemini-2.5-flash-image")
APP = "vibestudio"            # the Memory Bank scope: the same creator the lab seeded
USER = "creator"
STATE = RUNS / "state.json"
DB_URL = f"sqlite+aiosqlite:///{RUNS}/vibestudio.db"
PORT = int(os.environ.get("PORT", "4700"))
os.environ.setdefault("STUDIO_VIDEO_DIR", str(MEDIA / "renders"))    # videogen reads this at import
REAL_VIDEO = os.environ.get("STUDIO_REAL_VIDEO", "1").lower() in ("1", "true")
