import { PartsPage } from "../components/PartsPage";
import { COLORS } from "./colors";
import { AgentNode, HumanInTheLoop } from "./FanOut";

/** Step 4: the séance circle. 4a the first agent node and the chain through
 *  the door; 4b the door suspends the run on a form, and the pick is written
 *  to shared state. Both in stage2_direction. */
export function Seance() {
  return (
    <PartsPage
      slug="seance"
      n={4}
      color={COLORS.red}
      parts={[
        { id: "a", label: "The agent node", element: <AgentNode /> },
        { id: "b", label: "The pause and the state", element: <HumanInTheLoop /> },
      ]}
    />
  );
}
