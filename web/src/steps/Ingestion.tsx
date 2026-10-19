import { PartsPage } from "../components/PartsPage";
import { COLORS } from "./colors";
import { TheCorpus, TheReader } from "./Rag";

/** Session 4 · Multimodal ingestion: what the audience sent, read by Gemini
 *  into one corpus (RAG Engine), and the third reader that retrieves by
 *  meaning and hands the media back. 4a the corpus; 4b the reader in the
 *  fan-out (stage5_rag). The audience grid (voice, photos, clips) lands in 4a. */
export function Ingestion() {
  return (
    <PartsPage
      slug="ingestion"
      n={4}
      color={COLORS.purple}
      parts={[
        { id: "a", label: "The corpus", element: <TheCorpus /> },
        { id: "b", label: "The third reader", element: <TheReader /> },
      ]}
    />
  );
}
