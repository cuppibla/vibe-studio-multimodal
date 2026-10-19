import type { ReactNode } from "react";
import { COLORS } from "./colors";
import { Story } from "./Story";
import { Poster } from "./Poster";
import { Structures } from "./Structures";
import { Seance } from "./Seance";
import { GhostWhispers } from "./GhostWhispers";
import { MediaDesk } from "./MediaDesk";
import { Release } from "./Release";

export { COLORS };

export interface Step {
  slug: string;
  label: string;
  color: string;
  element: ReactNode;
  /** Text on the Next button leading out of this step. */
  nextLabel?: string;
  /** Sub-pages, each at /step/<slug>/<id>; shown as chips in the top bar. */
  parts?: { id: string; label: string }[];
}

/**
 * The Haunted Edition, in order. Each entry is a page at /step/<slug>; the
 * numbering matches the codelab: 1 the haunting, 2 one agent and one poster,
 * 3 the structures (fan-out, router, loops), 4 the séance (the agent node,
 * the pause, the state), 5 ghost whispers (Memory Bank, callbacks, RAG
 * Engine, the third reader), 6 the media desk (a long-running tool, the desk
 * in the graph), 7 release the bats (deploy, what you built). The holes the
 * catch-up bar fills are keyed by these slugs and parts (checks/holes.py).
 */
export const STEPS: Step[] = [
  { slug: "story", label: "The haunting", color: COLORS.cyan, element: <Story />, nextLabel: "Enter the haunted studio" },
  { slug: "poster", label: "One agent, one poster", color: COLORS.blue, element: <Poster />, nextLabel: "Draw the graph" },
  {
    slug: "structures",
    label: "The structures",
    color: COLORS.amber,
    element: <Structures />,
    parts: [
      { id: "a", label: "Fan-out and join" },
      { id: "b", label: "The router" },
      { id: "c", label: "Two loops" },
    ],
  },
  {
    slug: "seance",
    label: "The séance",
    color: COLORS.red,
    element: <Seance />,
    parts: [
      { id: "a", label: "The agent node" },
      { id: "b", label: "The pause and the state" },
    ],
  },
  {
    slug: "ghost-whispers",
    label: "Ghost whispers",
    color: COLORS.purple,
    element: <GhostWhispers />,
    parts: [
      { id: "a", label: "Memory Bank" },
      { id: "b", label: "Callbacks" },
      { id: "c", label: "RAG Engine" },
      { id: "d", label: "The third reader" },
    ],
  },
  {
    slug: "media-desk",
    label: "The media desk",
    color: COLORS.cyan,
    element: <MediaDesk />,
    parts: [
      { id: "a", label: "A long-running tool" },
      { id: "b", label: "The desk in the graph" },
    ],
  },
  {
    slug: "release",
    label: "Release the bats",
    color: COLORS.green,
    element: <Release />,
    parts: [
      { id: "a", label: "Deploy VibeStudio" },
      { id: "b", label: "What you built" },
    ],
  },
];
