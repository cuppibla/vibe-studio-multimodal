import { PartsPage } from "../components/PartsPage";
import { COLORS } from "./colors";
import { TheDesk, TheTool } from "./Video";

/** Step 6: the media desk. 6a Veo as a long-running tool and the delivery by
 *  id; 6b the desk in the graph: two branches out of script_ready, the clip
 *  and the poster, meeting at a join. Both in stage6_video. */
export function MediaDesk() {
  return (
    <PartsPage
      slug="media-desk"
      n={6}
      color={COLORS.cyan}
      parts={[
        { id: "a", label: "A long-running tool", element: <TheTool /> },
        { id: "b", label: "The desk in the graph", element: <TheDesk /> },
      ]}
    />
  );
}
