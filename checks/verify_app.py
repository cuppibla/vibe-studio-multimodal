"""Author-side proof: the app's agent (vibestudio/server/agent/) is the
finished lab agent, byte for byte. The finished agent is the live agent/ tree
with every hole filled from the registry; only config.py is the app's own.
Run: python checks/verify_app.py [--sync]   (--sync copies the files over)"""
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from checks.holes import HOLES  # noqa: E402

COPIED = ["graph.py", "desk.py", "schemas.py", "cleanup_tools.py", "trends.py", "policy_words.txt", "policy_replacements.txt", "comments.md", "backlog.txt",
          "platform/__init__.py", "platform/memory.py", "platform/rag.py", "platform/videogen.py", "platform/state.py", "platform/images.py"]   # platform/config.py is the app's own
APP = ROOT / "vibestudio" / "server" / "agent"


def finished(name: str) -> bytes:
    """agent/<name> with every registry hole filled."""
    rel = f"agent/{name}"
    p = ROOT / rel
    if not p.exists():                 # not in git; a fresh clone has only starter/
        p = ROOT / "starter" / rel
    src = p.read_text()
    for _, (r, anchor, snippet) in HOLES.items():
        if r == rel:
            src = src.replace(anchor, snippet, 1)
    return src.encode()


def main() -> int:
    sync = "--sync" in sys.argv
    bad = []
    for name in COPIED:
        want, dst = finished(name), APP / name
        same = dst.exists() and dst.read_bytes() == want
        if not same and sync:
            dst.parent.mkdir(parents=True, exist_ok=True)
            dst.write_bytes(want)
            print(f"  ~ {name}: written from the finished agent/{name}")
        elif same:
            print(f"  \u2713 {name}")
        else:
            print(f"  \u2717 {name}: differs from the finished agent/{name}")
            bad.append(name)
    print("APP VERIFY: " + ("the app's agent is the finished lab agent" if not bad else f"{len(bad)} file(s) drifted; run with --sync"))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
