"""Author-side proof #2: every code block the codelab SHOWS for a registry
hole is byte-identical to the registry snippet (which verify_holes already
proves round-trips). Codelab -> registry -> the tree: one
chain, no drift.

v6 anchor: an invisible HTML comment right before the fence -
    <!-- code: RESUME -->
    ```python
    ...
    ```
Run: python -m checks.verify_pastes"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from checks.holes import HOLES  # noqa: E402

# the twelve holes the codelab shows, in lab order, plus EDGES (shown filled, read-along)
SHOWN_HOLES = {"POSTER_TOOL", "FANOUT", "ROUTER", "INGEST_READERS", "RAG_MEDIA", "GATE", "VIDEO_TOOL", "DELIVER_RESPONSE", "STATE_SHARE", "MEMORY_RECALL", "MEMORY_REMEMBER", "EDGES"}
md = (ROOT / "CODELAB.md").read_text()
pattern = re.compile(
    r"<!-- code: (\w+) -->\s*```(?:python|sql)\n(.*?)```", re.S)

blocks = {}
for m in pattern.finditer(md):
    blocks.setdefault(m.group(1), m.group(2).rstrip("\n"))
fails = []
for name in sorted(SHOWN_HOLES):
    if name not in blocks:
        print(f"  ✗ {name}: no <!-- code: {name} --> block in CODELAB.md")
        fails.append(name)
        continue
    if blocks[name] == HOLES[name][2]:
        print(f"  ✓ {name}: codelab block == registry snippet")
    else:
        print(f"  ✗ {name}: codelab block DIFFERS from registry snippet")
        fails.append(name)

print()
if fails:
    print(f"PASTE VERIFY: {len(fails)} FAILURE(S): {fails}"); sys.exit(1)
print(f"PASTE VERIFY: all {len(SHOWN_HOLES)} shown blocks match the registry")
