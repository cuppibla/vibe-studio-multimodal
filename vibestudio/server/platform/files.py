"""The files the app owns: the backlog the graph reads, the creator's
profile, and the thumbnails the page captures."""
from __future__ import annotations

import base64
import json
import pathlib
import re

from ..agent.platform import config
from ..agent.graph import BACKLOG_FILE

PROFILE = config.RUNS / "profile.json"
THUMBS = config.MEDIA / "thumbs"


# ── the backlog: agent/backlog.txt, one idea per line, comments kept ─────────

def backlog() -> list[str]:
    return [l.strip() for l in BACKLOG_FILE.read_text().splitlines()
            if l.strip() and not l.startswith("#")]


def _write_backlog(ideas: list[str]) -> None:
    head = [l for l in BACKLOG_FILE.read_text().splitlines() if l.startswith("#")]
    BACKLOG_FILE.write_text("\n".join(head + [""] + ideas) + "\n")


def backlog_add(text: str) -> list[str]:
    text = " ".join(text.split())
    ideas = backlog()
    if text and text not in ideas:
        ideas.append(text)
        _write_backlog(ideas)
    return ideas


def backlog_remove(text: str) -> list[str]:
    ideas = [i for i in backlog() if i != text]
    _write_backlog(ideas)
    return ideas


# ── the profile ─────────────────────────────────────────────────────────────

DEFAULT_PROFILE = {
    "display_name": "",
    "description": "",
    "platform_url": "https://vibetube.dev",
    "event_code": "",
    "avatar_url": "",
    "project_id": "",
}


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def profile() -> dict:
    data = dict(DEFAULT_PROFILE)
    import os
    data["display_name"] = os.environ.get("VIBETUBE_NAME", "") or data["display_name"]
    data["platform_url"] = os.environ.get("VIBETUBE_URL", "") or data["platform_url"]
    data["event_code"] = os.environ.get("VIBETUBE_EVENT", "") or data["event_code"]
    if PROFILE.exists():
        try:
            data.update({k: v for k, v in json.loads(PROFILE.read_text()).items() if k in data})
        except ValueError:
            pass
    # The platform keeps one video per project and room, and the project it
    # means is this Google Cloud project: publishing again replaces the earlier
    # video instead of adding one. An id derived from a name would let one
    # project publish twice under two names, so the cloud project is the answer
    # and the slug is only a last resort when nothing names it.
    data["project_id"] = (os.environ.get("VIBETUBE_PROJECT", "")
                          or os.environ.get("STUDIO_GCP_PROJECT", "")
                          or os.environ.get("GOOGLE_CLOUD_PROJECT", "")
                          or f"{_slug(data['display_name']) or 'creator'}-{_slug(data['event_code']) or 'room'}")
    return data


def save_profile(**fields) -> dict:
    data = profile()
    for k, v in fields.items():
        if k in data and v is not None:
            data[k] = v.strip() if isinstance(v, str) else v
    data["platform_url"] = data["platform_url"].rstrip("/") or DEFAULT_PROFILE["platform_url"]
    PROFILE.write_text(json.dumps(data, indent=2))
    return data


# ── thumbnails: a PNG the page drew from the clip's frame at 2 s ────────────

def save_thumbnail(run_id: str, data_url: str) -> str:
    m = re.match(r"data:image/png;base64,(.+)$", data_url, re.S)
    if not m:
        raise ValueError("expected a PNG data URL")
    path = THUMBS / f"{run_id}.png"
    path.write_bytes(base64.b64decode(m.group(1)))
    return f"/static/thumbs/{path.name}"


# ── history: every finished run, newest first ───────────────────────────────

HISTORY = config.RUNS / "history.json"


def history() -> list[dict]:
    if not HISTORY.exists():
        return []
    try:
        return json.loads(HISTORY.read_text())
    except ValueError:
        return []


def history_upsert(item: dict) -> list[dict]:
    """Add or update one run's record (matched by run_id)."""
    items = [i for i in history() if i.get("run_id") != item.get("run_id")]
    prev = next((i for i in history() if i.get("run_id") == item.get("run_id")), {})
    items.insert(0, {**prev, **item})
    items.sort(key=lambda i: i.get("at", 0), reverse=True)
    del items[200:]
    HISTORY.write_text(json.dumps(items, indent=1, ensure_ascii=False))
    return items
