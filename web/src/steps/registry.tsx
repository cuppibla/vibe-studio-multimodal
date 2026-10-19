import type { ReactNode } from "react";
import { COLORS } from "./colors";
import { Story } from "./Story";
import { ImageGen } from "./ImageGen";
import { Workflows } from "./Workflows";
import { Ingestion } from "./Ingestion";
import { VideoGen } from "./VideoGen";
import { MemoryPage } from "./MemoryPage";
import { Release } from "./Release";
import type { Does } from "../components/SessionHeader";

export { COLORS };

export interface Step {
  slug: string;
  label: string;
  color: string;
  element: ReactNode;
  /** Text on the Next button leading out of this step. */
  nextLabel?: string;
  /** The session's header picture (16:9), under web/public/haunted/scenes. */
  art?: string;
  /** The band at the top: one headline, one sentence, the three things you do here. */
  header?: { title: string; one: ReactNode; does: Does[] };
  /** The dense scale (index.css .lab-dense): bigger type, fewer words on screen. */
  dense?: boolean;
  /** Sub-pages, each at /step/<slug>/<id>; shown as chips in the top bar. */
  parts?: { id: string; label: string }[];
}

/**
 * The multimodal cut, in order: one noun per session, one mechanism at a
 * time. 1 the story, 2 image generation (one agent, the image model as a
 * tool), 3 workflows (fan-out and join, the router and its loop), 4
 * multimodal ingestion (what the audience sent, read by Gemini into one
 * corpus; the third reader), 5 video generation (two kinds of suspension,
 * the session store, state shared by name, the desk), 6 memory (two
 * callbacks, Memory Bank), 7 deploy and publish. The holes the catch-up bar
 * fills are keyed by these slugs and parts (checks/holes.py).
 */
export const STEPS: Step[] = [
  { slug: "story", art: "/haunted/scenes/scene-1-story.jpg", label: "The story", color: COLORS.cyan, element: <Story />, nextLabel: "Generate the first poster" },
  {
    slug: "image", art: "/haunted/scenes/scene-2-image.jpg",
    label: "Image generation",
    color: COLORS.blue,
    element: <ImageGen />,
    nextLabel: "Draw the graph",
    dense: true,
    header: {
      title: "One agent draws the first poster.",
      one: "An ADK Agent is a model, an instruction and tools. Its third tool calls the image model.",
      does: [
        { text: <>Edit <code>make_poster</code>: one call to the image model</>, where: "editor" },
        { text: "Send two lines in adk web", where: "run" },
        { text: "A poster lands. Six checks go green.", where: "verify" },
      ],
    },
  },
  {
    slug: "workflows", art: "/haunted/scenes/scene-3-workflows.jpg",
    label: "Workflows",
    color: COLORS.amber,
    element: <Workflows />,
    parts: [
      { id: "a", label: "Fan-out and join" },
      { id: "b", label: "The router and the loop" },
    ],
  },
  {
    slug: "ingestion", art: "/haunted/scenes/scene-4-ingestion.jpg",
    label: "Multimodal ingestion",
    color: COLORS.purple,
    element: <Ingestion />,
    parts: [
      { id: "a", label: "The corpus" },
      { id: "b", label: "The third reader" },
    ],
  },
  {
    slug: "video", art: "/haunted/scenes/scene-5-video.jpg",
    label: "Video generation",
    color: COLORS.cyan,
    element: <VideoGen />,
    parts: [
      { id: "a", label: "Two kinds of suspension" },
      { id: "b", label: "State and the desk" },
    ],
  },
  {
    slug: "memory", art: "/haunted/scenes/scene-6-memory.jpg",
    label: "Memory",
    color: COLORS.red,
    element: <MemoryPage />,
    parts: [
      { id: "a", label: "Memory Bank" },
      { id: "b", label: "Callbacks" },
    ],
  },
  {
    slug: "release", art: "/haunted/scenes/scene-7-publish.jpg",
    label: "Deploy and publish",
    color: COLORS.green,
    element: <Release />,
    parts: [
      { id: "a", label: "Deploy VibeStudio" },
      { id: "b", label: "What you built" },
    ],
  },
];
