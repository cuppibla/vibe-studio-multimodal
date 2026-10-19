/** Mirrors RunState in server/runner.py: the folded state every event carries. */
export type Status = "idle" | "running" | "waiting_pick" | "rendering" | "done" | "failed";

export interface Candidate {
  title: string;
  angle: string;
  hook: string;
  style: string;
  sources: string[];
}

export interface RunState {
  status: Status;
  run_id: string | null;
  idea: string;
  started_at: number | null;
  finished_at: number | null;
  nodes_seen: string[];
  active: string | null;
  research: { trends?: string[]; backlog?: number; feedback?: string[]; feedback_query?: string };
  memory_facts: number;
  candidates: Candidate[];
  pick: string | null;
  direction: { title?: string; angle?: string; hook?: string };
  route: string | null;
  cleaned: { title?: string; angle?: string };
  script: { title?: string; description?: string; opening_line?: string; tags?: string[]; shots?: string[]; style?: string };
  render: {
    call_id?: string;
    operation?: string;
    status?: string;
    url?: string;
    checks?: number;
    started_at?: number;
    prompt?: string;
    prebaked?: boolean;
    seconds?: number;
    reason?: string;
    duration_ms?: number;
  };
  thumbnail_url: string;
  poster: { url?: string; path?: string; prebaked?: boolean; subject?: string };
  publish: { status?: string; attempts?: number; url?: string; detail?: string; platform?: string; event?: string; video_id?: string };
  error: string;
}

export interface StudioEvent {
  type: string;
  seq: number;
  at: number;
  state: RunState;
  replay?: StudioEvent[];
  [k: string]: unknown;
}

export interface GraphNode {
  name: string;
  kind: "start" | "function" | "join" | "agent" | "task" | "human" | "router" | "desk" | "poster";
  layer: number;
  row: number;
  rows: number;
}

export interface GraphInfo {
  name: string;
  description: string;
  nodes: GraphNode[];
  edges: { from: string; to: string; route: string | null }[];
  layers: number;
}

export interface Profile {
  display_name: string;
  description: string;
  platform_url: string;
  event_code: string;
  avatar_url: string;
  project_id: string;
}

export const IDLE: RunState = {
  status: "idle",
  run_id: null,
  idea: "",
  started_at: null,
  finished_at: null,
  nodes_seen: [],
  active: null,
  research: {},
  memory_facts: 0,
  candidates: [],
  pick: null,
  direction: {},
  route: null,
  cleaned: {},
  script: {},
  render: {},
  thumbnail_url: "",
  poster: {},
  publish: {},
  error: "",
};

export interface HistoryItem {
  run_id: string;
  at: number;
  idea: string;
  title: string;
  direction: string;
  hook: string;
  video_url: string;
  video_path: string;
  render_status: string;
  prebaked: boolean;
  duration_ms: number | null;
  thumbnail_url: string;
  poster_url?: string;
  poster_prebaked?: boolean;
  publish_url: string;
  seconds: number;
}
