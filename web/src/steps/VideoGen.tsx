import { PartsPage } from "../components/PartsPage";
import { COLORS } from "./colors";
import { Suspension } from "./Suspension";
import { TheDesk } from "./Video";

/** Session 5 · Video generation: two kinds of suspension, one mechanism.
 *  5a for a person (direction_gate's RequestInput) and for a slow tool
 *  (Veo behind LongRunningFunctionTool, delivered by id from another
 *  process); 5b what the two branches share by name in state, and this
 *  run's session. All in stage6_video. */
export function VideoGen() {
  return (
    <PartsPage
      slug="video"
      n={5}
      color={COLORS.cyan}
      parts={[
        { id: "a", label: "Two kinds of suspension", element: <Suspension /> },
        { id: "b", label: "State and the desk", element: <TheDesk /> },
      ]}
    />
  );
}
