"""What the audience sent - every format they sent it in, read into one shape.

RAG Engine retrieves TEXT. A voice note, a photo or a clip joins the corpus the
way the past posters did (rag.caption_posters): a model turns it into a line of
text that names its file, the line becomes a passage, and when the passage
comes back the file comes back with it (rag.media_in). One reader per kind:

    read_comments      agent/comments.md                 -> the lines are already text
    transcribe_voice   agent/audience/voice/*.mp3         -> voice/transcripts.md   Gemini listens
    caption_photos     agent/audience/photo/*.jpg         -> photo/captions.md      Gemini looks
    watch_clips        agent/audience/clip/*.mp4          -> clip/notes.md          Gemini watches, and hears the soundtrack

Every reader writes the same line shape, so chunking, embedding and retrieval
never know which kind a passage came from:

    - voice: note-03.mp3 — "I want a whole series of the cat judging costumes …" mood: delighted
    - photo: photo-01-ghost-drawer.jpg — A cream wooden drawer, striped socks, a paper-cup ghost … tags: drawer, socks, cozy
    - clip: clip-05.mp4 — A hallway floor, a snail in a sheet and a round vacuum … heard: "The snail won …"

READERS is the list the ingestion runs (python -m agent.platform.rag load --audience).
As shipped only the comments are read; the other three sit behind one "# ".
"""
from __future__ import annotations

import pathlib

from . import config, images

AUDIENCE = pathlib.Path(__file__).resolve().parents[1] / "audience"
COMMENTS_FILE = pathlib.Path(__file__).resolve().parents[1] / "comments.md"
WEB = "/static/audience"                      # the lab server and the app serve AUDIENCE here

VOICE_PROMPT = ("Transcribe this voice note word for word inside double quotes. Then add: mood: and one word. "
                "Plain text on one line, nothing else.")
PHOTO_PROMPT = ("Two sentences: what is in the picture, the palette, the mood. Then: tags: and three short tags. "
                "Plain text on one line, no headings, no markdown.")
CLIP_PROMPT = ("Describe the shots in two sentences, then quote what you HEAR on the soundtrack as: heard: \"...\". "
               "Plain text on one line, no headings, no markdown.")


def _ask(path: pathlib.Path, mime: str, prompt: str) -> str:
    """One media file in, one line of text out."""
    from google.genai import types as gt
    client = images._client()                  # a local name: a temporary Client is closed mid-request
    resp = client.models.generate_content(
        model=config.MODEL,
        contents=[gt.Part.from_bytes(data=path.read_bytes(), mime_type=mime), prompt],
        config=gt.GenerateContentConfig(automatic_function_calling=gt.AutomaticFunctionCallingConfig(disable=True)))
    return " ".join((resp.text or "").split())


def _write(out: pathlib.Path, kind: str, title: str, lines: list[str]) -> pathlib.Path:
    out.parent.mkdir(parents=True, exist_ok=True)
    head = [f"# {title}", "", f"One line per file: `- {kind}: <file> — <what the model heard or saw>`. Each line becomes a passage",
            "in the RAG corpus beside the comments; read_feedback hands the file back as a URL under",
            f"{WEB}/{kind}/. Regenerate with: python -m agent.platform.rag load --audience", ""]
    out.write_text("\n".join(head + lines) + "\n")
    return out


def read_comments() -> pathlib.Path:
    """The comments are text already: the file itself is the passage source."""
    return COMMENTS_FILE


def transcribe_voice() -> pathlib.Path:
    """voice note -> text: Gemini listens."""
    files = sorted((AUDIENCE / "voice").glob("*.mp3"))
    lines = []
    for p in files:
        said = _ask(p, "audio/mpeg", VOICE_PROMPT)
        lines.append(f"- voice: {p.name} — {said}")
        print(f"  heard {p.name}: {said[:90]}")
    return _write(AUDIENCE / "voice" / "transcripts.md", "voice", "What Gemini heard in the audience's voice notes", lines)


def caption_photos() -> pathlib.Path:
    """photo -> text: Gemini looks, the posters' prompt shape."""
    files = sorted((AUDIENCE / "photo").glob("*.jpg"))
    lines = []
    for p in files:
        seen = _ask(p, "image/jpeg", PHOTO_PROMPT)
        lines.append(f"- photo: {p.name} — {seen}")
        print(f"  saw {p.name}: {seen[:90]}")
    return _write(AUDIENCE / "photo" / "captions.md", "photo", "What Gemini saw in the audience's photos", lines)


def watch_clips() -> pathlib.Path:
    """clip -> text: Gemini watches the picture AND hears the soundtrack."""
    files = sorted((AUDIENCE / "clip").glob("*.mp4"))
    lines = []
    for p in files:
        seen = _ask(p, "video/mp4", CLIP_PROMPT)
        lines.append(f"- clip: {p.name} — {seen}")
        print(f"  watched {p.name}: {seen[:90]}")
    return _write(AUDIENCE / "clip" / "notes.md", "clip", "What Gemini saw and heard in the audience's clips", lines)


READERS = [
    read_comments,
    transcribe_voice, caption_photos, watch_clips,
]

KINDS = {"comments": ("comments", COMMENTS_FILE), "voice": ("voice", AUDIENCE / "voice" / "transcripts.md"),
         "photo": ("photo", AUDIENCE / "photo" / "captions.md"), "clip": ("clip", AUDIENCE / "clip" / "notes.md")}


def wired() -> list[str]:
    """The kinds READERS reads right now, by function name."""
    names = {read_comments: "comments", transcribe_voice: "voice", caption_photos: "photo", watch_clips: "clip"}
    return [names[r] for r in READERS if r in names]


def lines(kind: str) -> dict[str, str]:
    """The reader's line for every file of a kind, keyed by file name; empty
    before the reader has run."""
    _, path = KINDS[kind]
    out: dict[str, str] = {}
    try:
        text = path.read_text()
    except OSError:
        return out
    for l in text.splitlines():
        if l.startswith(f"- {kind}: "):
            body = l[len(f"- {kind}: "):]
            name, _, said = body.partition(" — ")
            out[name.strip()] = said.strip()
    return out


def items() -> list[dict]:
    """Every thing the audience sent, with its URL and the reader's line when
    there is one: what the page shows as the grid."""
    out: list[dict] = []
    for kind, folder, exts, mime in (("voice", "voice", (".mp3",), "audio/mpeg"), ("photo", "photo", (".jpg", ".png"), "image/jpeg"),
                                     ("clip", "clip", (".mp4",), "video/mp4")):
        said = lines(kind)
        d = AUDIENCE / folder
        for p in sorted(d.glob("*")) if d.exists() else []:
            if p.suffix.lower() in exts:
                out.append({"kind": kind, "file": p.name, "url": f"{WEB}/{folder}/{p.name}", "mime": mime, "line": said.get(p.name, "")})
    return out
