"""Env + paths. Secrets come from ./.env (copy .env.example) or your shell env."""
import os
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]      # agent/platform/config.py -> the repo
RUNS = ROOT / "runs"
RUNS.mkdir(exist_ok=True)

_env = ROOT / ".env"
if _env.exists():
    for line in _env.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())
# Two auth paths, one switch:
#   STUDIO_VERTEX=1  -> Vertex via ADC (Cloud Shell: zero keys)
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

MODEL = os.environ.get("STUDIO_MODEL", "gemini-3-flash-preview")   # same id on Vertex and AI Studio
DB_URL = f"sqlite+aiosqlite:///{RUNS}/sessions.db"
APP = "vibestudio"
USER = "creator"
STATE = RUNS / "state.json"
# the video: ONE real Veo clip per lap by default (a minute or three), or a
# prebaked stand-in (STUDIO_REAL_VIDEO=0) for a no-cost run. Retries, interval
# and timeout live in agent/platform/videogen.py
REAL_VIDEO = os.environ.get("STUDIO_REAL_VIDEO", "1").lower() in ("1", "true")
