"""`python -m agent.platform.bank` - the creator's Memory Bank, from the console.

  python -m agent.platform.bank            create the bank in your project (once), or connect
  python -m agent.platform.bank load       seed the creator's history: three eras of picks
  python -m agent.platform.bank list       what the bank holds, oldest first
  python -m agent.platform.bank forget ID  delete one memory
  python -m agent.platform.bank reset      delete every memory in the creator's scope

The bank lives on an Agent Engine resource in your project. Its name is cached
in runs/memorybank.json; that file is the connection.
"""
import sys
import time
import warnings

from . import config, memory

warnings.filterwarnings("ignore", category=FutureWarning)   # SDK rename notices are not the lesson

# The creator's history, as the conversations Memory Bank extracts from. Three
# eras, oldest first: the taste moved from animals to gadgets to fantasy. Each
# entry is one past session: what was offered, what the creator picked.
HISTORY = [
    # era 1 · animals (two sessions, and the one rule)
    ("Month one, session 1. Offered: a tiny robot folding laundry; my cat judging the new "
     "kitchen gadgets; desk toys after midnight; a competitor scam expose. The creator picked "
     "'my cat judging the new kitchen gadgets' and said: I love filming the cat, anything with "
     "an animal in it is a yes."),
    ("Month one, session 2. The creator said: keep every video filmable in one room, and never "
     "put text on the screen. Offered: a golden retriever taste-tests treats like a food critic; a "
     "midnight fridge raid; the slowest morning routine; a revenge prank. The creator picked the "
     "golden retriever taste test."),
    # era 2 · gadgets
    ("Month two, session 3. Offered: my cat and the air fryer; a robot vacuum vs the new smart "
     "appliance; a paper plane across the apartment; a humiliate-the-rival stunt. The creator "
     "picked 'a robot vacuum vs the new smart appliance' and said: gadgets are what I want to "
     "film now, the channel is turning into a gadget channel."),
    # era 3 · fantasy
    ("This month, session 4. Offered: the sock drawer is a dragon's hoard; a robot vacuum "
     "review; a cat and the toaster; a fake stunt. The creator picked 'the sock drawer is a "
     "dragon's hoard' and said: I want to try fantasy, small magic in ordinary rooms. Fantasy "
     "is the direction of the channel now."),
]


def _print(rows):
    if not rows:
        print("  (no memories yet)")
    for m in rows:
        print(f"  memory#{m['id'][:8]} [{m['topic']}] {m['fact'][:110]}")


def connect():
    cached = memory.engine_name()
    if cached:
        print(f"connected (runs/memorybank.json):\n  {cached}")
    else:
        print("no bank cached - looking for one in your project, and creating it if there is none (~30s)…")
        print(f"── ready ──\n  {memory.engine_name(create=True)}")
    print(f"scope: app_name={config.APP} · user_id={config.USER}")
    print(f"topics: {' · '.join(memory.TOPICS)}")
    rows = memory.list_all()
    print(f"the bank holds {len(rows)} memory(ies)")
    _print(rows)


def load():
    if not memory.engine_name():
        print("no Memory Bank yet - run: python -m agent.platform.bank"); return
    print(f"── loading {len(HISTORY)} past sessions, oldest first (each is one generate call) ──")
    failed = []
    for i, text in enumerate(HISTORY, 1):
        try:
            flags = memory.remember(text)
        except Exception as e:
            failed.append(i)
            print(f"  session {i:2}: FAILED ({str(e)[:70]})")
            continue
        acts = ", ".join(f"{f['action']}" for f in flags) or "nothing new"
        print(f"  session {i:2}: {acts}")
        time.sleep(2)                     # the service dislikes back-to-back generates
    print("── consolidated ──")
    _print(memory.list_all())
    if failed:
        print(f"sessions that did not load: {failed} - run `python -m agent.platform.bank load` again "
              "later; consolidation makes repeats harmless")


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    cmd = argv[0] if argv else ""
    if cmd == "":
        connect()
    elif cmd == "load":
        load()
    elif cmd == "list":
        _print(memory.list_all())
    elif cmd == "forget" and len(argv) > 1:
        memory.forget(argv[1]); print(f"forgot {argv[1]}")
    elif cmd == "reset":
        print(f"deleted {memory.reset()} memory(ies)")
    else:
        print(__doc__)


if __name__ == "__main__":
    main()
