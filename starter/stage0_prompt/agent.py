"""Stage 0 - the whole channel as ONE prompt, plus one picture.

Every sentence of the instruction below is a JOB. Over the next steps, each
job becomes a NODE in a drawn graph - the codelab's replacement table maps
sentence -> node, one by one. The tools here call the same sources the
graph's research nodes read; only the shape differs. The third tool draws
tonight's poster with the channel's image model, so the very first message
ends with a picture: the same call the graph makes in the video session, as
a node.

Run it and watch what you get: research folded into prose you must re-read,
an "agree with the creator" sentence the model satisfies by asking and
carrying on in the same breath, and a blacklist the model certifies for
itself. Nothing here is checkable.
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


async def show_poster(tool, args, tool_context, tool_response):
    """Read-along, not a hole: an after_tool_callback. ADK calls it after every
    tool; when make_poster has landed a PNG, the file goes to the session as an
    ARTIFACT, so adk web shows the picture itself (the Artifacts tab), not just
    the path in the function_response."""
    if tool.name == "make_poster" and isinstance(tool_response, dict) and tool_response.get("path"):
        from agent.platform import images
        await images.attach(tool_response, tool_context)


root_agent = Agent(
    name="solo_channel", model=config.MODEL,
    tools=[check_trends, read_backlog, make_poster],
    after_tool_callback=show_poster,
    instruction=(
        "You run the creator's cozy-spooky short-video channel, alone, every "
        "night until Halloween.\n"
        "When the creator gives you an idea (or nothing), do ALL of this, in ONE "
        "reply, never stopping to wait for an answer:\n"
        "check what is trending. look at your backlog of ideas. propose a "
        "direction and agree on it with the creator: the creator's idea if there "
        "is one, riding one of tonight's trends and borrowing one detail from a "
        "backlog note. refuse blacklisted subjects (competitor, hateful, gore). "
        "then describe the video you would make: a title (<=60 chars) and 3 "
        "shots, one visual sentence each. then draw its poster: call make_poster "
        "once with one line that names the single image that sells the video, "
        "and tell the creator where the poster is.\n"
        "Every scene is a Halloween scene, cozy and never scary: a sheet ghost, a "
        "jack-o'-lantern, a witch's cat, a bat, candy, a full moon, a haunted "
        "household thing. The star is always one of those; never a robot or a "
        "gadget.\n"
        "Close by asking whether to keep this direction or try another."))
