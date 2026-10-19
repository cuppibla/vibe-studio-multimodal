import { PartsPage } from "../components/PartsPage";
import { COLORS } from "./colors";
import { Deploy } from "./Deploy";
import { Summary } from "./Summary";

/** Step 7: release the bats. 7a the graph inside an app, deployed to Cloud
 *  Run; 7b the whole workflow and everything it taught. */
export function Release() {
  return (
    <PartsPage
      slug="release"
      n={7}
      color={COLORS.green}
      parts={[
        { id: "a", label: "Deploy VibeStudio", element: <Deploy /> },
        { id: "b", label: "What you built", element: <Summary /> },
      ]}
    />
  );
}
