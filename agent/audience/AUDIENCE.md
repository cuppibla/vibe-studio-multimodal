# What the audience sent

Forty things in four kinds, all about the channel's six Halloween videos. Each kind has a reader in
`agent/platform/audience.py` that turns it into one line of text for the corpus; the manifest is `manifest.json`.

| kind | count | how |
|---|---|---|
| comments | 12 | agent/comments.md, written for the six videos |
| voice notes | 8 | Gemini TTS (gemini-2.5-flash-preview-tts), one voice each |
| photos | 14 | Nano Banana, the channel's low-poly look, a viewer's point of view |
| clips | 6 | ffmpeg: a slow push-in over a photo with the viewer's voice |

Regenerate: `python scripts/make_audience.py --force`.
