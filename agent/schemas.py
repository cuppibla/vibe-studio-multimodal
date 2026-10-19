"""Typed contracts between nodes - the workflow passes OBJECTS, not vibes."""
from pydantic import BaseModel


class Evidence(BaseModel):
    claim: str
    source: str          # "trends" | "backlog" | "feedback" | "memory"


class Direction(BaseModel):
    title: str           # <=60 chars, filmable, characterful
    angle: str           # the twist, one line
    hook: str = ""       # 2-4 words, the video's sticker line
    style: str = ""      # the look, one line, borrowed from the trend it rides
    poster_idea: str = ""   # the one image that sells it, one line, no text in the picture
    evidence: list[Evidence]


class Directions(BaseModel):
    candidates: list[Direction]   # exactly 4: three publishable, the fourth off-policy on purpose


class CleanedDirection(BaseModel):
    """What quarantine hands to finish_task: the fields the
    scripter reads, with every refused word replaced."""
    title: str
    angle: str
    hook: str = ""
    style: str = ""
    poster_idea: str = ""


class Shot(BaseModel):
    description: str


class Script(BaseModel):
    title: str
    description: str
    tags: list[str]
    opening_line: str
    conclusion_first: bool   # true ONLY if opening_line states the outcome outright
    shots: list[Shot]
    style: str = ""          # the look of the whole clip, from the direction
    poster_idea: str = ""    # carried through from the direction; make_poster draws it
