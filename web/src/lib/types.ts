/**
 * Wire types shared with the backend. The Python side of this contract is
 * server/api/lab.py (the stage endpoints); keep the two in sync by hand.
 */

export type StageStatus =
  | "idle"
  | "now"
  | "pass"
  | "fail"
  | "retry"
  | "degraded"
  | "blocked"
  | "skip"
  | "stall"
  | "wait";

export interface WorkerExit {
  verb: string;
  code: number;
  at: number;
}

export interface RunSnapshot {
  /** Verb of a worker currently running, or null. */
  busy: string | null;
  last_exit: WorkerExit | null;
  updated_at: number;
}

export type RunEvent =
  | { type: "snapshot"; data: RunSnapshot }
  | { type: "log"; verb: string; line: string; at: number }
  | { type: "worker"; event: "started" | "exited"; verb: string; code?: number; at: number };

export interface InspectorStatus {
  up: boolean;
  url: string;
  apps: string[];
}

/** A poster the image model drew, as the tool or the node returned it. */
export interface PosterRecord {
  status: string;
  url: string;
  prebaked: boolean;
  note: string;
  model: string;
}

/** Evidence for step 2, read from stage0_prompt/agent.py and its sessions. */
export interface Stage0Status {
  tools_wired: string[];
  tools_complete: boolean;
  poster_wired: boolean;
  sessions: number;
  latest_session_id: string | null;
  tool_calls: Record<string, number>;
  called_trends: boolean;
  called_backlog: boolean;
  called_poster: boolean;
  poster: PosterRecord | null;
  turns: number;
  last_reply: string;
}

/** Evidence for step 3a, from stage1_fanout/agent.py and its sessions. */
export interface Stage1Status {
  edges: string[][];
  edges_complete: boolean;
  join_defined: boolean;
  sessions: number;
  runs: number;
  nodes_ran: string[];
  readers_ran: boolean;
  joined: boolean;
  backlog_count: number | null;
  bundle: string;
}

/** Evidence for steps 3b and 3c, from stage3_router/agent.py, agent/graph.py and the sessions. */
export interface Stage3Status {
  edges: string[][];
  chain: string[];
  pick_wired: boolean;
  router_wired: boolean;
  routes_wired: boolean;
  reroute_wired: boolean;
  loop_wired: boolean;
  scripter_defined: boolean;
  policy_route_wired: boolean;
  quarantine_kind: string | null;
  sessions: number;
  nodes_ran: string[];
  routes: string[];
  ok_runs: number;
  block_runs: number;
  /** The last run, as the student saw it: the idea sent, what the stand-in gate took and why,
   *  the exit the router named, the words that decided it, and the nodes that ran. */
  last_run?: { idea: string; gate: string; route: string; hits: string[]; nodes: string[]; picked_4: boolean };
  script_routes: string[];
  revise_runs: number;
  revise_notes: string[];
  script_check_ran: boolean;
  script_passes: number | null;
  tool_calls: Record<string, number>;
  cleaned: { title: string; angle: string; hook: string } | null;
  cleaned_script_title: string;
  blocked_message: string;
  script_title: string;
  direction: string | null;
  angle: string | null;
  hook: string | null;
  state_keys: string[];
}

/** A message the page sent to a stage app for the student (the Run panel's buttons):
 *  the session it opened under adk web's user, and the run as it goes. */
export interface SentRun {
  run: string;
  app: string;
  user: string;
  session: string;
  message: string;
  status: "running" | "done" | "error";
  trail: string[];
  routes: string[];
  events: number;
  error: string;
}

/** Evidence for step 5b: the two memory callbacks in stage4_memory/agent.py, the bank, and the latest run. */
export interface Stage4Status {
  bank_connected: boolean;
  recall_wired: boolean;
  remember_wired: boolean;
  recall_kw: string | null;
  remember_kw: string | null;
  sessions: number;
  nodes_ran: string[];
  proposed_titles: string[];
  memory_facts: { id: string; topic: string; fact: string; updated: string }[];
  memory_written: { action: string; id?: string; fact?: string }[];
  direction: string | null;
}

export interface MemoryBank {
  connected: boolean;
  engine: string | null;
  memories: { id: string; topic: string; fact: string; updated: string }[];
  error?: string;
}

/** Evidence for step 5d: the third reader's edge, the posters it hands back, and the latest run. */
export interface Stage5Status {
  corpus_blocked?: string;
  corpus_connected: boolean;
  feedback_wired: boolean;
  edges: string[][];
  sessions: number;
  nodes_ran: string[];
  feedback_ran: boolean;
  feedback_query: string | null;
  feedback_passages: string[];
  feedback_note: string | null;
  feedback_posters: string[];
  feedback_media: { kind: string; url: string }[];
  posters_wired: boolean;
  media_wired: boolean;
  captions: number;
  posters: number;
  proposed: { title: string; angle: string; sources: string[] }[];
  cited_feedback: boolean;
}

/** One thing the audience sent (session 4a): the file, where it is served, and the reader's line once read. */
export interface AudienceItem {
  kind: "voice" | "photo" | "clip";
  file: string;
  url: string;
  mime: string;
  line: string;
}

export interface AudienceGrid {
  items: AudienceItem[];
  counts: { comments: number; voice: number; photo: number; clip: number };
  read: { voice: number; photo: number; clip: number };
  wired: string[];
  readers_wired: boolean;
}

export interface RagCorpus {
  blocked?: string;
  connected: boolean;
  corpus: string | null;
  files: { id: string; display_name: string; description: string }[];
  comments: number;
  captions: number;
  posters: number;
  error?: string;
}

/** Evidence for step 6: the wrapper, the two branches and the join in stage6_video/agent.py, and the latest run. */
export interface Stage6Status {
  tool: string | null;
  tool_wrapped: boolean;
  gate_has_request_input: boolean;
  asked: number;
  answered: number;
  state_share_wired: boolean;
  poster_in_state: boolean;
  release_poster: string | null;
  state_keys: string[];
  deliver_wired: boolean;
  chain_wired: boolean;
  media_wired: boolean;
  sessions: number;
  session: { id: string; user: string } | null;
  nodes_ran: string[];
  desk_ran: boolean;
  poster_ran: boolean;
  join_ran: boolean;
  released: boolean;
  submitted: { call_id: string; prompt: string; operation: string } | null;
  pending: { call_id: string; prompt: string; operation: string } | null;
  delivered: boolean;
  render_url: string;
  render_status: string;
  poster_url: string;
  poster_prebaked: boolean;
  render_file: { status?: string; url?: string; path?: string; prebaked?: boolean; operation?: string; prompt?: string; reason?: string };
  real_video: boolean;
}

export interface DeployStatus {
  running: boolean;
  last_exit: { code: number; at: number } | null;
  url: string;
  service: string;
  project: string;
  region: string;
  at: number | null;
  gcloud_project: string;
  app_built: boolean;
}

/** Session 7b: what the deployed app holds, the room, and the video on VibeTube. */
export interface PublishStatus {
  app_url: string;
  reachable: boolean;
  error?: string;
  night: { status: string; title: string; clip: boolean; clip_url: string; clip_prebaked: boolean; poster: boolean; poster_prebaked: boolean; poster_url: string } | null;
  profile: { platform_url: string; event_code: string; display_name: string; project_id: string } | null;
  publish: { status?: string | null; video_id?: string | null; url?: string | null; detail?: string | null; attempts?: number | null; event?: string | null };
  room: { code: string; name: string; open: boolean; state: string; reason: string; url: string } | null;
  video: { id: string; status: string; title: string; channel: string; thumbnail_url: string; watch_url: string; project_id: string } | null;
  thumbnail_match: boolean | null;
  thumbnail_bytes?: number[];
  video_error?: string;
}
