import { PartsPage } from "../components/PartsPage";
import { COLORS } from "./colors";
import { TheBank, TheCallbacks } from "./Memory";

/** Session 6 · Memory: what the channel remembers between nights. 6a Memory
 *  Bank; 6b the two lifecycle callbacks that read it before the model and
 *  write to it after the agent (stage4_memory). */
export function MemoryPage() {
  return (
    <PartsPage
      slug="memory"
      n={6}
      color={COLORS.red}
      parts={[
        { id: "a", label: "Memory Bank", element: <TheBank /> },
        { id: "b", label: "Callbacks", element: <TheCallbacks /> },
      ]}
    />
  );
}
