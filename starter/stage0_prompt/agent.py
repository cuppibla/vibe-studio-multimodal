"""Stage 0 - the whole channel as ONE prompt, plus one picture.

Every sentence of the instruction below is a JOB. Over the next steps, each
job becomes a NODE in a drawn graph - the codelab's replacement table maps
sentence -> node, one by one. The tools here call the same sources the
graph's research nodes read; only the shape differs. The third tool draws
tonight's poster with the channel's image model, so the very first run ends
with a picture: the same call the graph makes in step 6, as a node.

Run it and watch what you get: research folded into prose you must re-read,
an "agree with the creator" sentence that can be talked past, and a
blacklist the model certifies for itself. Nothing here is checkable.
"""
from google.adk import Agent

from agent.platform import config


def check_trends() -> dict:
    """Ten formats trending on the platform right now, with a heat score each."""
    from agent.trends import sample_trends
    return {"trends": sample_trends()}


def read_backlog() -> dict:
    """The creator's backlog: ideas they noted down to make someday."""
    from agent.graph import backlog_notes
    return {"backlog": backlog_notes()}


def make_poster(subject: str) -> dict:
    """Draw tonight's poster: one image of `subject` in the channel's cozy
    low-poly style. Returns where the PNG landed (path, url) in a few seconds."""
    return {"status": "skipped", "note": "the poster tool is not wired yet"}  # TODO: POSTER_TOOL - call the image model: from agent.platform import images; return images.generate(subject, name="solo")


root_agent = Agent(
    name="solo_channel", model=config.MODEL,
    tools=[],  # TODO: TOOLS - add the two research tools and the poster tool
    instruction=(
        "You run the creator's cozy-spooky short-video channel, alone, every "
        "night until Halloween.\n"
        "When the creator gives you an idea (or nothing), do ALL of this:\n"
        "check what is trending. look at your backlog of ideas. propose a "
        "direction and agree on it with the creator. refuse blacklisted "
        "subjects (competitor, hateful, gore). then describe the video you "
        "would make: a title (<=60 chars) and 3 shots, one visual sentence "
        "each. then draw its poster: call make_poster once with one line that "
        "names the single image that sells the video, and tell the creator "
        "where the poster is.\n"
        "Ask the creator to confirm the direction before describing the "
        "video."))
