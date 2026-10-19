import { PartsPage } from "../components/PartsPage";
import { COLORS } from "./colors";
import { HumanInTheLoop } from "./FanOut";
import { TheDesk, TheTool } from "./Video";

/** Session 5 · Video generation: two kinds of suspension, one mechanism.
 *  5a for a person (direction_gate's RequestInput) and for a slow tool
 *  (Veo behind LongRunningFunctionTool, delivered by id from another
 *  process); 5b what the two branches share by name in state, and the desk:
 *  the clip and the poster meeting at a join. All in stage6_video. */
export function VideoGen() {
  return (
    <PartsPage
      slug="video"
      n={5}
      color={COLORS.cyan}
      parts={[
        {
          id: "a",
          label: "Two kinds of suspension",
          element: (
            <div className="space-y-16">
              <HumanInTheLoop />
              <TheTool />
            </div>
          ),
        },
        { id: "b", label: "State and the desk", element: <TheDesk /> },
      ]}
    />
  );
}
