import { PartsPage } from "../components/PartsPage";
import { Fold } from "../components/Fold";
import { COLORS } from "./colors";
import { Deploy } from "./Deploy";
import { Publish } from "./Publish";
import { Summary } from "./Summary";

/** Session 7 · Deploy and publish: 7a the graph inside an app, deployed to
 *  Cloud Run; 7b the night posted to a VibeTube room, the poster as its
 *  thumbnail, and the finale: the whole graph and everything it taught. */
export function Release() {
  return (
    <PartsPage
      slug="release"
      n={7}
      color={COLORS.green}
      parts={[
        { id: "a", label: "Deploy VibeStudio", element: <Deploy /> },
        {
          id: "b",
          label: "Publish",
          element: (
            <div className="space-y-16">
              <Publish />
              <Fold title="What you built: the whole graph, and everything it taught" kicker="finale">
                <Summary embedded />
              </Fold>
            </div>
          ),
        },
      ]}
    />
  );
}
