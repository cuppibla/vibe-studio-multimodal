import { PartsPage } from "../components/PartsPage";
import { COLORS } from "./colors";
import { DeclareFanOut, GraphIntro } from "./FanOut";
import { RouterNode, TaskNode } from "./PolicyGate";

/** Step 3: the structures a graph is made of, each built in a sandbox app.
 *  3a nodes, edges, the fan-out and the join (stage1_fanout); 3b the router
 *  and its two exits (stage3_router); 3c two loops, one inside a task-mode
 *  agent and one in the graph, a back-edge from a second router. */
export function Structures() {
  return (
    <PartsPage
      slug="structures"
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
        { id: "b", label: "The router", element: <RouterNode /> },
        { id: "c", label: "Two loops", element: <TaskNode /> },
      ]}
    />
  );
}
