import { AdkGlance } from "./AdkGlance";
import { TheAgent, ToolsEditRun } from "./SinglePrompt";

/** Step 2, one page: the whole channel as one prompt, the three tools that
 *  give it hands (two readers and the image model), the run that ends with
 *  tonight's poster, and what an ADK agent is made of, as a reference. */
export function Poster() {
  return (
    <div className="space-y-16">
      <TheAgent />
      <ToolsEditRun />
      <AdkGlance embedded />
    </div>
  );
}
