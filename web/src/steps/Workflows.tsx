import { PartsPage } from "../components/PartsPage";
import { COLORS } from "./colors";
import { DeclareFanOut, GraphIntro } from "./FanOut";
import { RouterNode } from "./PolicyGate";

/** Session 3 · Workflows: the structures a graph is made of, each built in a
 *  sandbox app. 3a nodes, edges, the fan-out and the join (stage1_fanout);
 *  3b the router that names its own exit, and the one loop: quarantine, a
 *  task-mode agent, with the edge back to the scripter (stage3_router). */
export function Workflows() {
  return (
    <PartsPage
      slug="workflows"
      n={3}
      color={COLORS.amber}
      parts={[
        {
          id: "a",
          label: "Fan-out and join",
          element: (
            <div className="space-y-16">
              <GraphIntro />
              <DeclareFanOut />
            </div>
          ),
        },
        { id: "b", label: "The router and the loop", element: <RouterNode /> },
      ]}
    />
  );
}
