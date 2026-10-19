"""The render desk - Veo as a long-running tool INSIDE the workflow (step 8).

A Veo render takes minutes; an agent's turn takes seconds. render_submit
submits the render and returns at once with a pending receipt: the operation
name. Wrapped in LongRunningFunctionTool, that receipt tells ADK the call is
not finished: the desk's turn ends, the workflow suspends at this node, and
the receipt sits in the session store. Nothing has to stay alive.

Later, `python -m agent.deliver` finds the pending call in the session,
waits for Veo, and answers the call by its id with a function_response. That
answer completes the desk's node; the desk does not speak again, and the
graph continues to store_video, which reads the result from runs/state.json.
"""
from google.adk import Agent
from google.adk.tools import LongRunningFunctionTool

from .platform import config, videogen


def render_submit(prompt: str) -> dict:
    """Submit one Veo render of `prompt`. Returns at once with a pending
    receipt; the clip is delivered later, to this call, by id."""
    receipt = videogen.start(f"{prompt} {videogen.NO_TEXT}")
    return {"status": "pending", "operation": receipt["operation"], "prompt": receipt["prompt"]}


RENDER_INSTRUCTION = (
    "You are the studio's render desk. The message you receive is tonight's "
    "script as JSON. Compose ONE Veo prompt from it: the shots in order as one "
    "continuous scene, in two to four sentences, and the script's style as the "
    "look of the whole clip, stated in a sentence of its own (the style decides "
    "the medium, the palette, the light and the camera; never default to 3D "
    "animation unless the style says so). Call render_submit exactly once with "
    "that prompt. While the call's status is 'pending', reply exactly WAITING and "
    "nothing else; the clip is delivered later. When the call returns status "
    "'done', reply with ONLY the url. When it returns status 'failed', reply "
    "exactly FAILED.")   # after delivery the node completes without another turn

render_desk = Agent(
    name="render_desk",
    model=config.MODEL,
    instruction=RENDER_INSTRUCTION,
    tools=[LongRunningFunctionTool(render_submit)])
