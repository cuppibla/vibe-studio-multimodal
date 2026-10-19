"""The trend feed: what is trending on the platform right now.

A trend is a FORMAT paired with a LOOK, never a subject: the creator's idea
supplies the subject, and a trend is something that idea can ride, drawn in
that look. The pool is fifty formats, each in five looks, a quarter of them the channel's own cozy low-poly in its variants; every run draws a random ten, each with a
heat score, hottest first. It lives beside the graph so scan_trends reads it
wherever the graph runs: a stage app in adk web, the lab server, or the app
on Cloud Run.
"""
import random

FORMATS = [
    "one continuous take, no cuts",
    "nature-documentary narration over an ordinary room",
    "whisper narration, ASMR pacing",
    "POV: you are the object",
    "the wait-for-it payoff in the last second",
    "told in reverse, ending at the beginning",
    "before and after in a single cut",
    "sports commentary over a small task",
    "true-crime narration over something harmless",
    "a weather report for one room",
    "product review scored one to five",
    "the loop that ends exactly where it began",
    "split screen: expectation versus reality",
    "a two-line musical number",
    "courtroom drama over a tiny dispute",
    "auction house bidding on junk",
    "museum audio guide for household objects",
    "cooking show where the ingredient talks back",
    "one wrong thing in an otherwise normal routine",
    "the last one: the final cookie, slice, or sock",
    "a heist for something worthless",
    "guard duty: one creature protects one object",
    "small magic in one room",
    "creatures the size of a teacup",
    "a training montage for a chore",
    "the unboxing that goes wrong",
    "midnight timelapse, the house asleep",
    "a recipe format for something that is not food",
    "a tour guide voice through a hallway",
    "silent film with piano and title cards",
    "found footage from the shelf camera",
    "mockumentary interview with the culprit",
    "a job interview for a pet or an appliance",
    "the slowest morning, sped up",
    "speedrun with a spoken countdown",
    "a rivalry between two things that cannot move",
    "the object narrates its own day",
    "an apology video from an appliance",
    "a breakup between two kitchen items",
    "a retirement ceremony for a worn-out thing",
    "the dramatic zoom that reveals nothing",
    "a prophecy read over breakfast",
    "the quest for a lost item, three rooms long",
    "a boss fight against a chore",
    "hidden camera on the house at 3 a.m.",
    "an origin story for a household habit",
    "a farewell tour before the trash day",
    "the shortest documentary ever made",
    "a duet between a pet and a machine",
    "cozy low-poly, warm pastel, soft light",
]
# The look a trend carries: the visual style the render should take. Every
# trend pairs a format with one look. A quarter of the pool is the channel's
# home look, cozy low-poly, in its variants; the rest ranges wide, so the
# clips stop looking alike and the creator's pick decides the medium.
LOWPOLY_LOOKS = [
    "cozy low-poly faceted 3D, warm pastels of cream and terracotta, soft studio light",
    "low-poly night scene, one warm lamp, deep blue shadows, slow dolly in",
    "isometric low-poly diorama, the room as a tiny stage, top-down tilt",
    "low-poly with felt and knit textures, stop-motion stutter, cozy handmade feel",
    "low-poly sunrise, long soft shadows, sage and sky-blue palette, gentle camera drift",
]
OTHER_LOOKS = [
    "claymation with visible thumbprints and a wobbly stop-motion rhythm",
    "hand-painted watercolor, soft bleeding edges, paper texture showing through",
    "1990s VHS home video, tracking lines, warm date-stamp glow, handheld",
    "film noir in black and white, hard shadows, a single lamp, rain on the window",
    "macro live action, shallow depth of field, dust motes in a shaft of light",
    "16-bit pixel art with a chunky dithered palette and side-scrolling framing",
    "paper cut-out stop motion, layered card, drop shadows, a diorama stage",
    "neon cyberpunk, wet reflections, magenta and teal, slow tracking shots",
    "vintage nature documentary on 16mm film, grain, golden hour, long lens",
    "ink and brush animation, sumi-e strokes, lots of white space, one accent color",
    "1950s technicolor musical, saturated primaries, a spotlight, a wide stage",
    "security-camera footage, fisheye corner view, timestamp flicker, grey light",
    "children's picture-book illustration, crayon texture, flat shapes, bright and simple",
    "Wes-Anderson symmetry, centered frames, pastel walls, deadpan whip pans",
    "oil painting come alive, thick impasto strokes, museum lighting, slow zoom",
    "silent-film sepia, iris wipes, hand-cranked flicker, exaggerated gestures",
    "cel-shaded anime, speed lines, dramatic close-ups, a sunset gradient sky",
    "cardboard-and-tape puppetry, googly eyes, a visible hand now and then",
    "infrared thermal camera look, false-color heat blooms, glowing outlines",
    "Polaroid stills strung into a flipbook, white borders, faded warm tones",
]


def _look(i: int, j: int) -> str:
    """One look per (format, slot): every fourth slot is a low-poly variant,
    the rest walk the wide list, so no two slots of a format share a look."""
    k = i * 5 + j
    if k % 4 == 0:
        return LOWPOLY_LOOKS[(k // 4) % len(LOWPOLY_LOOKS)]
    return OTHER_LOOKS[(k - k // 4) % len(OTHER_LOOKS)]


TREND_POOL = [f"{fmt} · look: {_look(i, j)}" for i, fmt in enumerate(FORMATS) for j in range(5)]


def sample_trends(n: int = 10) -> list[dict]:
    """Ten formats trending right now: a random draw from the pool, each with a
    heat score, hottest first. Every run sees a different ten."""
    picks = random.sample(TREND_POOL, n)
    heats = sorted(random.sample(range(40, 100), n), reverse=True)
    return [{"topic": t, "heat": h} for t, h in zip(picks, heats)]
