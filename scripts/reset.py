"""Wipe local run state for a fresh start (never touches Memory Bank or the corpus).
Run: python scripts/reset.py [--all] [--archive]
     --all      also wipes the channel's taste (the `user:` keys) - a factory reset
     --archive  copies what it removes into runs/archive/<stamp>/ first

scripts/starter.sh calls this after restoring the hands-on files.
"""
import json
import pathlib
import shutil
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parent.parent
RUNS = ROOT / "runs"
ARCHIVE = RUNS / "archive"

# What a run leaves on disk. Everything here is written by a run and is stale
# the moment the next one starts:
#   state.json      the run's file outside ADK (the delivered render, the memory flags)
#   sessions.db     the ADK session store the stage apps and adk web write
#   ui_last.json    how the last console worker exited
#   *_run.log       the console workers' output
# runs/memorybank.json, runs/ragcorpus.json and runs/deploy.json stay: they are
# connections to things in your project, not run state. runs/archive/ is where
# the archived copies go.
LAP_FILES = ("state.json", "sessions.db", "ui_last.json")

# ── the half of sessions.db that is NOT this lap's ──────────────────────────
# runs/sessions.db is two stores sharing one file, and only one of them is a
# lap. ADK keeps `user:`-prefixed state in its OWN table - `user_states`, keyed
# (app_name, user_id), the prefix stripped on the way in - with no foreign key
# to `sessions` and no cascade from it (google/adk/sessions/schemas/v1.py:
# StorageUserState vs StorageSession; delete_session() is a single DELETE
# against StorageSession and never mentions user_states). That separation IS
# the lesson the lab teaches: `user:` = this USER, every session.
#
# So the file still goes. A brand-new file is the only clean-slate guarantee
# Restart can make - it is the learner's way out of a session that can never
# resume again (a stored interrupt response that fails re-validation forever),
# and a selective DELETE cannot help you when
# the store is the thing that is broken. The user's half is carried across the
# swap by hand instead: read out before, written back after.
USER_PREFIX = "user:"


def _drive():
    """agent.platform.drive, or None if it will not import.

    Imported HERE and not at module scope for two reasons: app/main.py imports
    this module while the server is booting, and - more to the point - clearing
    a wedged lap must never depend on the ADK being importable. If the SDK is
    missing or broken, the taste is simply not carried and the reset still
    happens. The escape hatch is not allowed to need the thing it escapes.

    ROOT goes on sys.path first, the same way checks/check.py does it. Run as
    `python scripts/reset.py`, sys.path[0] is scripts/ and `agent` is invisible
    - which would leave the CLI quietly carrying nothing while the button
    carried everything. The two must not be able to disagree.
    """
    if str(ROOT) not in sys.path:
        sys.path.insert(0, str(ROOT))
    try:
        from agent.platform import drive
        return drive
    except Exception:
        return None


def read_user_state() -> dict[str, dict]:
    """{user_id: {"user:key": value}} - every user-scoped key in the store now.

    BaseSessionService.get_user_state(app_name=, user_id=) is ADK's public door
    to the user_states row and deliberately needs no session id ("so that
    callers can read user state without holding an active session_id"), which
    is exactly what a store we are about to delete can still answer. It returns
    the row's RAW keys; we put `user:` back so callers see the same spelling
    the agents write and checks/check.py asserts on.

    Whatever the row holds is what comes back - user:prefs from
    graph.persist_direction, and any `user:` key added after this was written.
    There is no list here to forget to update.

    Which users: ADK has a reader per (app_name, user_id) and no way to
    enumerate the user_states table, so the population is config.USER - the one
    identity every call site in this lab defaults to - plus any user_id that
    currently owns a session. Best effort throughout: a store that will not
    open yields {} and the clear goes ahead anyway.
    """
    drive = _drive()
    if drive is None:
        return {}
    from agent.platform import config

    async def _read() -> dict[str, dict]:
        svc = drive.svc()
        users = {config.USER}
        try:
            listed = await svc.list_sessions(app_name=config.APP, user_id=None)
            users |= {s.user_id for s in listed.sessions}
        except Exception:
            pass                      # discovery is a bonus, never a blocker
        out = {}
        for uid in sorted(users):
            try:
                raw = await svc.get_user_state(app_name=config.APP, user_id=uid)
            except Exception:
                continue              # incl. NotImplementedError on other backends
            if raw:
                out[uid] = {USER_PREFIX + k: v for k, v in raw.items()}
        return out

    try:
        return drive.run(_read())
    except Exception:
        return {}


def write_user_state(carried: dict[str, dict]) -> list[str]:
    """Put the carried keys into whatever store exists now. Returns the keys.

    ADK has no set_user_state - BaseSessionService exposes the reader and
    nothing else. The supported write is a state DELTA: every key handed to
    create_session(state=...) goes through _session_util.extract_state_delta(),
    which strips `user:` off the user-scoped ones and merges them into
    `storage_user_state.state | delta` (DatabaseSessionService.create_session).
    So a throwaway session is the courier, and delete_session() then drops it -
    one DELETE against StorageSession, which provably leaves user_states
    standing. That asymmetry is the same one this whole change rests on, used
    here in the other direction.
    """
    drive = _drive()
    if drive is None or not carried:
        return []
    from agent.platform import config

    async def _write() -> list[str]:
        svc = drive.svc()
        written = []
        for uid, keys in carried.items():
            sid = f"_reset_carry_{uid}"
            await svc.create_session(app_name=config.APP, user_id=uid,
                                     session_id=sid, state=dict(keys))
            await svc.delete_session(app_name=config.APP, user_id=uid,
                                     session_id=sid)
            written += list(keys)
        return sorted(set(written))

    try:
        return drive.run(_write())
    except Exception:
        return []


def lap_paths() -> list[pathlib.Path]:
    """Every artifact of the current lap that exists right now."""
    return [p for p in ([RUNS / f for f in LAP_FILES] + sorted(RUNS.glob("*_run.log")))
            if p.exists()]


def clear(all_: bool = False, archive: bool = False,
          keep_user_state: bool | None = None) -> dict:
    """Remove the lap's artifacts. Returns
    {'cleared': [...], 'archive': str|'', 'stuck': [...], 'kept_user_state': [...]}.

    Paths come back repo-relative, because that is how the console and this
    script both talk about them. Never raises on a file that will not budge -
    it reports it instead, so a caller can say so on the page.

    keep_user_state carries the `user:` keys across the sessions.db swap.
    None - the default - means "yes, unless this is a --all factory reset".
    """
    if keep_user_state is None:
        keep_user_state = not all_
    # read BEFORE the file goes; the courier writes into the new one after
    carried = read_user_state() if keep_user_state else {}
    targets = lap_paths()
    into = ""
    if archive and targets:
        stamp = time.strftime("%Y%m%d-%H%M%S")
        dest = ARCHIVE / stamp
        dest.mkdir(parents=True, exist_ok=True)
        for t in targets:
            try:
                shutil.copy2(t, dest / t.name)
            except OSError:
                pass                       # a copy we could not take is not a
        into = str(dest.relative_to(ROOT))  # reason to leave the lap running
    cleared, stuck = [], []
    for t in targets:
        try:
            t.unlink()
            cleared.append(str(t.relative_to(ROOT)))
        except OSError as e:
            stuck.append(f"{t.relative_to(ROOT)} ({e.strerror})")
    # sessions.db comes back holding the taste and nothing else: no lap, no
    # events, and no interrupt response that could still fail re-validation.
    kept_user_state = write_user_state(carried)
    return {"cleared": cleared, "archive": into, "stuck": stuck,
            "kept_user_state": kept_user_state}


def quarantine(*paths: pathlib.Path) -> list[str]:
    """A killed worker can be halfway through a write. Any of these JSON files
    that no longer parses is moved out of runs/ - a truncated state.json is
    read by every page, and one bad byte would 500 the console forever.

    Returns the repo-relative paths that had to be moved.
    """
    moved = []
    for p in paths:
        if not p.exists():
            continue
        try:
            json.loads(p.read_text())
            continue                       # parses - it is somebody's truth
        except (OSError, ValueError):
            pass
        dest = ARCHIVE / time.strftime("%Y%m%d-%H%M%S")
        try:
            dest.mkdir(parents=True, exist_ok=True)
            shutil.move(str(p), str(dest / f"broken-{p.name}"))
            moved.append(str(p.relative_to(ROOT)))
        except OSError:
            try:
                p.unlink()                 # unreadable AND unmovable: it still
                moved.append(str(p.relative_to(ROOT)))   # cannot stay
            except OSError:
                pass
    return moved


if __name__ == "__main__":
    out = clear(all_="--all" in sys.argv, archive="--archive" in sys.argv)
    for p in out["cleared"]:
        print(f"removed {p}")
    for p in out["stuck"]:
        print(f"could not remove {p}")
    if out["kept_user_state"]:
        print("kept (this USER, every session): " + ", ".join(out["kept_user_state"]))
    elif "--all" in sys.argv:
        print("dropped the channel's taste too (--all is a factory reset)")
    else:
        # said out loud on purpose: a carry that silently produced nothing is
        # indistinguishable from the bug this exists to fix
        print("no user: keys to keep (nothing durable had been stored yet)")
    if out["archive"]:
        print(f"archived a copy of each into {out['archive']}")
    print("reset done")
