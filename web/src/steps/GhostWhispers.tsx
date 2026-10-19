import { PartsPage } from "../components/PartsPage";
import { COLORS } from "./colors";
import { TheBank, TheCallbacks } from "./Memory";
import { TheCorpus, TheReader } from "./Rag";

/** Step 5: what the graph hears from outside the run. 5a Memory Bank and
 *  5b the two callbacks (stage4_memory); 5c RAG Engine over the audience's
 *  comments and past posters, 5d the third reader (stage5_rag). */
export function GhostWhispers() {
  return (
    <PartsPage
      slug="ghost-whispers"
      n={5}
      color={COLORS.purple}
      parts={[
        { id: "a", label: "Memory Bank", element: <TheBank /> },
        { id: "b", label: "Callbacks", element: <TheCallbacks /> },
        { id: "c", label: "RAG Engine", element: <TheCorpus /> },
        { id: "d", label: "The third reader", element: <TheReader /> },
      ]}
    />
  );
}
