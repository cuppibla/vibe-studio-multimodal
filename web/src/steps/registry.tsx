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
        { text: "Send one line in adk web", where: "run" },
        { text: "A poster lands in the first reply. Six checks go green.", where: "verify" },
      ],
    },
  },
  {
    slug: "workflows", dense: true,
    header: {
      title: "The night, drawn as a graph.",
      one: "A Workflow is an edge list: two readers fan out and join, a router names its exit, one loop cleans a refused direction.",
      does: [
        { text: <>Declare the two chains into the join (<code>EDGES</code>)</>, where: "editor" },
        { text: <>Put <code>policy_check</code> between the pick and the scripter, with its exits and the way back</>, where: "editor" },
        { text: "Run the OK route and the BLOCK route; watch quarantine clean the direction", where: "run" },
      ],
    },
    art: "/haunted/scenes/scene-3-workflows.jpg",
    label: "Workflows",
    color: COLORS.amber,
    element: <Workflows />,
    parts: [
      { id: "a", label: "Fan-out and join" },
      { id: "b", label: "The router and the loop" },
    ],
  },
  {
    slug: "ingestion", dense: true,
    header: {
      title: "What the audience sent, read into one corpus.",
      one: "Comments, voice notes, photos and clips: one reader per kind, one passage shape, one RAG Engine corpus the third reader searches by meaning.",
      does: [
        { text: "Ingest once as shipped: only the comments are read", where: "run" },
        { text: <>Two edits: delete one <code>#</code> in <code>READERS</code>; add <code>"media"</code> to <code>read_feedback</code></>, where: "editor" },
        { text: "Ingest again, run: 8 voice · 14 photos · 6 clips read, and the media comes back with the passages", where: "verify" },
      ],
    },
    art: "/haunted/scenes/scene-4-ingestion.jpg",
    label: "Multimodal ingestion",
    color: COLORS.purple,
    element: <Ingestion />,
    parts: [
      { id: "a", label: "The corpus" },
      { id: "b", label: "The third reader" },
    ],
  },
  {
    slug: "video", dense: true,
    header: {
      title: "Two kinds of suspension, one mechanism.",
      one: "A run stops for a person and for a slow tool; both live in the session store and resume by id; the two branches share what they made by name, in state.",
      does: [
        { text: <>Edit <code>direction_gate</code>: yield a RequestInput, then pick a card</>, where: "editor" },
        { text: <>Wrap <code>render_submit</code> in LongRunningFunctionTool; deliver the clip by id from another process</>, where: "editor" },
        { text: <>Edit <code>make_poster</code>: write <code>poster_url</code> to state; the release binds it by name</>, where: "editor" },
      ],
    },
    art: "/haunted/scenes/scene-5-video.jpg",
    label: "Video generation",
    color: COLORS.cyan,
    element: <VideoGen />,
    parts: [
      { id: "a", label: "Two kinds of suspension" },
      { id: "b", label: "State and the desk" },
    ],
  },
  {
    slug: "memory", dense: true,
    header: {
      title: "What the channel remembers between nights.",
      one: "Two lifecycle callbacks: before the model reads, recall the creator's taste from Memory Bank; after the agent, remember tonight's pick.",
      does: [
        { text: "Create the Memory Bank in your project", where: "run" },
        { text: <>Edit the two callbacks on <code>propose_directions</code> and the scripter</>, where: "editor" },
        { text: "Run twice: the second night remembers the first", where: "verify" },
      ],
    },
    art: "/haunted/scenes/scene-6-memory.jpg",
    label: "Memory",
    color: COLORS.red,
    element: <MemoryPage />,
    parts: [
      { id: "a", label: "Memory Bank" },
      { id: "b", label: "Callbacks" },
    ],
  },
  {
    slug: "release", dense: true,
    header: {
      title: "The night, on VibeTube.",
      one: "VibeStudio runs the finished graph with a Runner and streams it to a page; setup put it on Cloud Run while you read. Open it, run a night, and publish the clip with its poster as the thumbnail.",
      does: [
        { text: "Open the VibeStudio setup deployed and run a night in it (nothing to deploy again)", where: "run" },
        { text: "Set your VibeTube event code and press publish", where: "run" },
        { text: "Your video is on the wall, the poster as its thumbnail", where: "verify" },
      ],
    },
    art: "/haunted/scenes/scene-7-publish.jpg",
    label: "Deploy and publish",
    color: COLORS.green,
    element: <Release />,
    parts: [
      { id: "a", label: "Deploy VibeStudio" },
      { id: "b", label: "Publish" },
    ],
  },
];
