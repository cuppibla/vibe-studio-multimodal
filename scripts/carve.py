"""Ship-time tool: turn the FILLED tree into the CARVED starter.
Run: python scripts/carve.py [HOLE …]   (no args = the SHIPPED holes)
       python scripts/carve.py --all    (every registry hole - authoring only)
Inverse of scripts/rescue.py; both read checks/holes.py.

The multimodal cut: ten hand edits over seven sessions; everything else ships
filled and is taught as read-along code."""
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from checks.holes import HOLES  # noqa: E402

# the three spots the student fills: draw the base graph, then wire in a
# new research feed per act - the graph literally grows
SHIP_HOLES = ["POSTER_TOOL", "FANOUT", "ROUTER", "RAG_CAPTION", "GATE", "VIDEO_TOOL", "DELIVER_RESPONSE", "STATE_SHARE", "MEMORY_RECALL", "MEMORY_REMEMBER"]   # EDGES ships FILLED: students read the edge list, they do not type it


def main():
    args = sys.argv[1:]
    names = (list(HOLES) if "--all" in args else
             [a for a in args if a in HOLES] or SHIP_HOLES)
    for name in names:
        rel, anchor, snippet = HOLES[name]
        p = ROOT / rel
        src = p.read_text()
        if anchor in src:
            print(f"  - {name}: already carved")
            continue
        if snippet not in src:
            print(f"  ✗ {name}: snippet not found in {rel} — tree drifted from registry")
            sys.exit(1)
        p.write_text(src.replace(snippet, anchor, 1))
        print(f"  ✓ {name}: carved out of {rel}")


if __name__ == "__main__":
    main()
