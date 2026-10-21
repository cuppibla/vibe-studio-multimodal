"""Make the audience fixture: what viewers sent in, in every format they sent it.

    python scripts/make_audience.py            everything missing under agent/audience/
    python scripts/make_audience.py --force    regenerate even what exists

Four kinds, forty things, all about the channel's six past Halloween videos:
  comments   12 lines  agent/comments.md (the file the lab always read; rewritten here once)
  voice       8 mp3    Gemini TTS, a different voice each, the viewer talking
  photo      14 jpg    the viewer's own room: a sock drawer, a porch bucket, a carving night …
                       (drawn once with the lab's image model in the channel's look; copied in)
  clip        6 mp4    a slow pan over one of the photos with the viewer's voice over it (ffmpeg)

AUDIENCE.md lists every item and how it was made. The readers in
agent/platform/audience.py turn each kind into one line of text for the corpus.

Needs ffmpeg on PATH, and one of the lab's two auth paths for the TTS voices:
STUDIO_VERTEX=1 (Cloud Shell: the project's ADC, the global endpoint) or
GOOGLE_API_KEY in .env (AI Studio).
"""
from __future__ import annotations

import json
import os
import pathlib
import shutil
import subprocess
import sys
import wave

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from agent.platform import config  # noqa: E402  (loads .env)

AUD = ROOT / "agent" / "audience"
PHOTO_SRC = pathlib.Path(os.environ.get("AUDIENCE_PHOTO_SRC", str(pathlib.Path.home() / "Documents/creator-space/Topics/vibestudio-multimodal/_preview/art/batch")))
TTS_MODEL = os.environ.get("STUDIO_TTS_MODEL", "gemini-2.5-flash-preview-tts")
FORCE = "--force" in sys.argv

COMMENTS = """# Audience comments on past videos

What viewers wrote under the channel's last six videos, the Halloween ones.
Twelve comments, good and bad, in no particular order. This file is one of the
four kinds of thing in the corpus (agent/audience/): `python -m agent.platform.rag
load --audience` uploads it with the voice notes, photos and clips the readers
turned into text, and `read_feedback` retrieves the passages closest to tonight's idea.

- "A tiny ghost learning to haunt a sock drawer" — @lena.draws: The sock floating up one inch at a time is perfect. Small magic in small rooms, please more.
- "Candy bowl heist, filmed like a bank job" — @quietquinn: Way too dark in the first five seconds. I could not see the raccoon's cape.
- "My cat judging this year's costumes" — @mira_k: The slow blink at the pumpkin costume is the funniest thing I have seen all week.
- "A tiny ghost carving its first pumpkin" — @dev_tomas: Honestly this one felt like an ad for the carving kit. Less product, more ghost getting it wrong.
- "A bat moves into the desk lamp" — @nightowl_ari: The bat hugging the bulb like a pillow. I replayed it nine times.
- "The skeleton in the closet just wants a sweater" — @fantasyfern: Did not expect to tear up at a skeleton. The ending where it is finally warm, chef's kiss.
- "A tiny ghost learning to haunt a sock drawer" — @roro_h: Captions covered the ghost's face for the whole second half. Move the text or drop it.
- "My cat judging this year's costumes" — @bakerstreet22: Under twenty seconds and it still told a story. Keep them this short.
- "Candy bowl heist, filmed like a bank job" — @jjthebuilder: The fridge light as the spotlight was the only good part. Cut the rest.
- "The skeleton in the closet just wants a sweater" — @knitwit: The sweater texture in low-poly looked like actual wool. How?
- "A bat moves into the desk lamp" — @sleepy.sam: The ending was too fast. Let the bat settle in for one more second.
- "A tiny ghost carving its first pumpkin" — @pumpkinpat: The crooked face at the end. I want that as the poster.
"""

VOICE_NOTES = [
    ("note-01", "Kore", "The sock ghost one made my kid laugh so hard. Please do more small magic in small rooms."),
    ("note-02", "Puck", "Candy heist was perfect, but it was way too dark at the start. I couldn't see the raccoon."),
    ("note-03", "Zephyr", "I want a whole series of the cat judging costumes. The slow blink at the pumpkin costume. Chef's kiss."),
    ("note-04", "Charon", "The pumpkin ghost felt like an ad for the carving kit. Less product, more ghost being bad at it."),
    ("note-05", "Fenrir", "The bat in the lamp was so cozy. Can you do one where it moves into the fridge light next?"),
    ("note-06", "Aoede", "Skeleton sweater made me tear up. The ending where it finally gets warm. More endings like that."),
    ("note-07", "Leda", "The captions covered the ghost's face for the whole second half. Move the text, or drop it."),
    ("note-08", "Orus", "Idea for you: the doorbell that only rings for ghosts. Filmed like a security camera."),
]

PHOTOS = ["ghost-drawer", "costume-cat", "desk-pumpkin", "candy-heist", "porch-bucket", "ghost-sheet-kid", "bat-lamp",
          "pumpkin-carving", "haunted-plant", "skeleton-closet", "fridge-midnight", "desk-toys-party", "snail-ghost", "doorbell-ghost"]

CLIPS = [
    ("clip-01", "photo-01-ghost-drawer", "Kore", "Look, I set up my own sock drawer like the video. The ghost is a paper cup."),
    ("clip-02", "photo-05-porch-bucket", "Puck", "Our porch tonight. The bucket is already half empty, and it's only seven."),
    ("clip-03", "photo-08-pumpkin-carving", "Zephyr", "Carving night. My cat is supervising. She does not approve of the face."),
    ("clip-04", "photo-11-fridge-midnight", "Charon", "Midnight fridge check. Something moved the candy bowl to the top shelf. Not me."),
    ("clip-05", "photo-13-snail-ghost", "Fenrir", "The snail won. The vacuum gave up at the rug. Best three minutes of my week."),
    ("clip-06", "photo-14-doorbell-ghost", "Aoede", "Our doorbell rang twice tonight, and nobody was there. I love it."),
]


def _client():
    """The TTS client, on the lab's own auth path: Vertex through ADC when
    STUDIO_VERTEX=1 (the TTS models live on the global endpoint), else an AI
    Studio key."""
    from google import genai
    if config.VERTEX:
        return genai.Client(vertexai=True, project=os.environ.get("GOOGLE_CLOUD_PROJECT"), location="global")
    os.environ.pop("GOOGLE_GENAI_USE_VERTEXAI", None)
    key = os.environ.get("GOOGLE_API_KEY")
    if not key:
        raise SystemExit("the TTS voices need STUDIO_VERTEX=1 (ADC) or GOOGLE_API_KEY (AI Studio) in .env")
    return genai.Client(api_key=key)


def say(client, text: str, voice: str, wav: pathlib.Path) -> None:
    """One voice note: Gemini TTS -> 24 kHz PCM -> wav."""
    from google.genai import types as gt
    resp = client.models.generate_content(
        model=TTS_MODEL, contents=text,
        config=gt.GenerateContentConfig(
            response_modalities=["AUDIO"],
            speech_config=gt.SpeechConfig(voice_config=gt.VoiceConfig(prebuilt_voice_config=gt.PrebuiltVoiceConfig(voice_name=voice)))))
    data = next((p.inline_data.data for c in resp.candidates or [] for p in (c.content.parts or []) if getattr(p, "inline_data", None) and p.inline_data.data), None)
    if not data:
        raise RuntimeError(f"no audio for {wav.name}: {(resp.text or '')[:80]}")
    with wave.open(str(wav), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(24000); w.writeframes(data)


def ff(*args: str) -> None:
    # -nostdin: ffmpeg otherwise reads the terminal for keypresses, and a run in
    # the background (a job, a worker) is stopped by the shell the moment it tries
    subprocess.run(["ffmpeg", "-y", "-nostdin", "-loglevel", "error", *args], check=True, stdin=subprocess.DEVNULL)


def main() -> None:
    made = {"comments": 0, "voice": 0, "photo": 0, "clip": 0}
    for d in ("voice", "photo", "clip"):
        (AUD / d).mkdir(parents=True, exist_ok=True)
    tmp = AUD / "_tmp"; tmp.mkdir(exist_ok=True)

    comments = ROOT / "agent" / "comments.md"
    if FORCE or "Halloween ones" not in comments.read_text():
        comments.write_text(COMMENTS); made["comments"] = 12
        print("  comments.md: 12 Halloween comments")

    client = None
    for name, voice, text in VOICE_NOTES:
        mp3 = AUD / "voice" / f"{name}.mp3"
        if mp3.exists() and not FORCE:
            continue
        client = client or _client()
        wav = tmp / f"{name}.wav"; say(client, text, voice, wav)
        ff("-i", str(wav), "-codec:a", "libmp3lame", "-q:a", "4", str(mp3)); made["voice"] += 1
        print(f"  voice {mp3.name} ({voice})")

    for i, n in enumerate(PHOTOS, 1):
        dst = AUD / "photo" / f"photo-{i:02d}-{n}.jpg"
        src = PHOTO_SRC / f"photo-{i:02d}-{n}.jpg"
        if dst.exists() and not FORCE:
            continue
        if not src.exists():
            print(f"  ! photo source missing: {src}"); continue
        shutil.copyfile(src, dst); made["photo"] += 1

    for name, photo, voice, text in CLIPS:
        mp4 = AUD / "clip" / f"{name}.mp4"
        if mp4.exists() and not FORCE:
            continue
        client = client or _client()
        wav = tmp / f"{name}.wav"; say(client, text, voice, wav)
        still = AUD / "photo" / f"{photo}.jpg"
        # a slow push-in over the photo, the voice over it, 8 seconds, 720p square
        ff("-loop", "1", "-i", str(still), "-i", str(wav),
           "-filter_complex", "[0:v]scale=1440:1440,zoompan=z='min(zoom+0.0012,1.25)':d=200:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=720x720:fps=25[v]",
           "-map", "[v]", "-map", "1:a", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-t", "8", "-shortest", str(mp4))
        made["clip"] += 1
        print(f"  clip {mp4.name} ({photo}, {voice})")

    shutil.rmtree(tmp, ignore_errors=True)
    manifest = {
        "comments": {"file": "agent/comments.md", "count": 12, "how": "written for the six Halloween videos"},
        "voice": [{"file": f"voice/{n}.mp3", "voice": v, "text": t, "how": f"Gemini TTS ({TTS_MODEL})"} for n, v, t in VOICE_NOTES],
        "photo": [{"file": f"photo/photo-{i:02d}-{n}.jpg", "how": "Nano Banana, the channel's low-poly look, a viewer's point of view"} for i, n in enumerate(PHOTOS, 1)],
        "clip": [{"file": f"clip/{n}.mp4", "over": f"photo/{p}.jpg", "voice": v, "text": t, "how": "ffmpeg: a slow push-in over the photo, the voice over it"} for n, p, v, t in CLIPS],
    }
    (AUD / "manifest.json").write_text(json.dumps(manifest, indent=1))
    lines = ["# What the audience sent", "", "Forty things in four kinds, all about the channel's six Halloween videos. Each kind has a reader in",
             "`agent/platform/audience.py` that turns it into one line of text for the corpus; the manifest is `manifest.json`.", "",
             "| kind | count | how |", "|---|---|---|", "| comments | 12 | agent/comments.md, written for the six videos |",
             f"| voice notes | {len(VOICE_NOTES)} | Gemini TTS ({TTS_MODEL}), one voice each |",
             f"| photos | {len(PHOTOS)} | Nano Banana, the channel's low-poly look, a viewer's point of view |",
             f"| clips | {len(CLIPS)} | ffmpeg: a slow push-in over a photo with the viewer's voice |", "",
             "Regenerate: `python scripts/make_audience.py --force`."]
    (AUD / "AUDIENCE.md").write_text("\n".join(lines) + "\n")
    print("done:", made, "·", AUD)


if __name__ == "__main__":
    main()
