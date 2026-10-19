import { AdkGlance } from "./AdkGlance";
import { Fold } from "../components/Fold";
import { TheAgent, ToolsEditRun } from "./SinglePrompt";

/** Session 2 · Image generation, one page: one agent, the image model as a
 *  tool, the run that ends with tonight's poster, and what an ADK agent is
 *  made of, as a reference. The two research tools ship on the agent; the
 *  one edit is the image model call inside make_poster. */
export function ImageGen() {
  return (
    <div className="space-y-16">
      <TheAgent />
      <ToolsEditRun />
      <Fold title="What an ADK agent is made of" kicker="reference">
        <AdkGlance embedded />
      </Fold>
    </div>
  );
}
