import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { In, StepHeader } from "../components/shared";
import { COLORS, tint } from "./colors";
import { SnakeGraph } from "./Overview";

/*
 * Step 7b: the whole workflow, and every concept it carries. Hover a node
 * for what it taught and where; the pulse walks the graph the way a run does.
 */

const PURPLE = COLORS.purple;
const AMBER = COLORS.amber;
const CYAN = COLORS.cyan;
const GREEN = COLORS.green;
const RED = COLORS.red;
const BLUE = COLORS.blue;
const mono = { fontFamily: "var(--font-mono)" } as const;

/* ── the design rules, each with a picture ─────────────────────────────── */

const box = (x: number, y: number, w: number, label: string, color?: string, dashed = false, h = 22) => (
  <g>
    <rect x={x} y={y} width={w} height={h} rx={7} fill={color ? tint(color, 0.1) : "var(--overlay)"} stroke={color ?? "var(--hairline)"} strokeWidth={color ? 1.3 : 1} strokeDasharray={dashed ? "4 3" : undefined} />
    <text x={x + w / 2} y={y + h / 2 + 3.5} fontSize="8.5" style={mono} textAnchor="middle" fill={color ?? "currentColor"}>{label}</text>
  </g>
);
const arrow = (x1: number, y1: number, x2: number, y2: number, color = "currentColor", dashed = false) => (
  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="1.1" strokeDasharray={dashed ? "4 3" : undefined} markerEnd="url(#rule-arrow)" />
);
const note = (x: number, y: number, text: string, color?: string, anchor: "start" | "middle" | "end" = "start") => (
  <text x={x} y={y} fontSize="7.5" style={mono} textAnchor={anchor} fill={color ?? "currentColor"} opacity={color ? 1 : 0.7}>{text}</text>
);
const person = (cx: number, cy: number, color = BLUE) => (
  <g>
    <circle cx={cx} cy={cy} r="4.5" fill={tint(color, 0.15)} stroke={color} strokeWidth="1.2" />
    <path d={`M${cx - 8} ${cy + 16} a8 8 0 0 1 16 0`} fill={tint(color, 0.15)} stroke={color} strokeWidth="1.2" />
  </g>
);

function RuleFigure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 320 118" role="img" aria-label={label} className="h-auto w-full text-fg">
      <defs>
        <marker id="rule-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill="context-stroke" />
        </marker>
      </defs>
      {children}
    </svg>
  );
}

const RULES: { text: string; figure: React.ReactNode }[] = [
  {
    text: "Graphs pause for people and for receipts, never for a wait. RequestInput and the pending tool call both suspend the run; nothing stays alive on a timer.",
    figure: (
      <RuleFigure label="Two paused nodes: direction_gate, resumed by a person's answer, and render_desk, resumed by the receipt of the render. A clock, struck out: nothing waits on a timer.">
        {person(60, 14)}
        {note(60, 46, "a person answers", BLUE, "middle")}
        {arrow(60, 50, 60, 62, BLUE)}
        {box(16, 64, 88, "direction_gate", AMBER)}
        <rect x="186" y="8" width="26" height="30" rx="3" fill="var(--overlay)" stroke={AMBER} strokeWidth="1.1" />
        <line x1="191" y1="16" x2="207" y2="16" stroke={AMBER} strokeWidth="1" /><line x1="191" y1="22" x2="207" y2="22" stroke={AMBER} strokeWidth="1" /><line x1="191" y1="28" x2="203" y2="28" stroke={AMBER} strokeWidth="1" />
        {note(199, 50, "the render's receipt", AMBER, "middle")}
        {arrow(199, 54, 199, 62, AMBER)}
        {box(155, 64, 88, "render_desk", AMBER)}
        {note(60, 100, "paused, on disk", undefined, "middle")}
        {note(199, 100, "paused, on disk", undefined, "middle")}
        <circle cx="290" cy="75" r="11" fill="none" stroke={RED} strokeWidth="1.2" />
        <line x1="290" y1="75" x2="290" y2="68" stroke={RED} strokeWidth="1.2" /><line x1="290" y1="75" x2="295" y2="78" stroke={RED} strokeWidth="1.2" />
        <line x1="280" y1="86" x2="300" y2="64" stroke={RED} strokeWidth="1.6" />
        {note(290, 100, "never a wait", RED, "middle")}
      </RuleFigure>
    ),
  },
  {
    text: "Every resume is one function_response carrying the call's id, whoever sends it: a page, a console, another process, after a restart.",
    figure: (
      <RuleFigure label="Three senders, a page, a console and another process after a restart, each sending the same function_response with the call's id into the one open call.">
        {box(8, 8, 92, "the page", BLUE)}
        {box(8, 42, 92, "a console", BLUE)}
        {box(8, 76, 92, "another process", BLUE)}
        {note(54, 112, "even after a restart", undefined, "middle")}
        <path d="M100 19 C 140 19, 150 53, 186 53" fill="none" stroke="currentColor" strokeWidth="1.1" markerEnd="url(#rule-arrow)" />
        <path d="M100 53 L 186 53" fill="none" stroke="currentColor" strokeWidth="1.1" markerEnd="url(#rule-arrow)" />
        <path d="M100 87 C 140 87, 150 53, 186 53" fill="none" stroke="currentColor" strokeWidth="1.1" markerEnd="url(#rule-arrow)" />
        {note(143, 86, "function_response(id)", undefined, "middle")}
        {box(188, 40, 124, "the open call", AMBER, true, 26)}
        {note(250, 82, "id call_3719769", AMBER, "middle")}
        {note(250, 96, "one id, one answer, one resume", undefined, "middle")}
      </RuleFigure>
    ),
  },
  {
    text: "Nodes share state by key name. candidates, direction, render_url move through the graph without being passed between nodes.",
    figure: (
      <RuleFigure label="A state store in the middle with three keys. propose_directions writes candidates and persist_direction reads it; persist_direction writes direction and scripter reads it; store_release writes render_url and the app reads it. No edge carries any of them.">
        <rect x="110" y="6" width="100" height="106" rx="9" fill={tint(GREEN, 0.06)} stroke={GREEN} strokeWidth="1.1" />
        {note(160, 20, "state", GREEN, "middle")}
        {["candidates", "direction", "render_url"].map((k, i) => (
          <g key={k}>
            <rect x="118" y={30 + i * 26} width="84" height="18" rx="4" fill="var(--overlay)" stroke="var(--hairline)" />
            <text x="160" y={42 + i * 26} fontSize="8" style={mono} textAnchor="middle" fill="currentColor">{k}</text>
          </g>
        ))}
        {["propose_directions", "persist_direction", "store_release"].map((n, i) => (
          <g key={n}>
            <text x="100" y={42 + i * 26} fontSize="7.5" style={mono} textAnchor="end" fill="currentColor">{n}</text>
            {arrow(102, 39 + i * 26, 116, 39 + i * 26, GREEN)}
          </g>
        ))}
        {["persist_direction", "scripter", "the app"].map((n, i) => (
          <g key={n}>
            {arrow(204, 39 + i * 26, 218, 39 + i * 26, GREEN)}
            <text x="222" y={42 + i * 26} fontSize="7.5" style={mono} fill="currentColor">{n}</text>
          </g>
        ))}
        {note(6, 108, "writes by key")}
        {note(314, 108, "reads by key", undefined, "end")}
      </RuleFigure>
    ),
  },
  {
    text: "Routing is plain code and policy is data. The gate is a function and a text file, decided before any money is spent.",
    figure: (
      <RuleFigure label="policy_check, a plain function, reads policy_words.txt, a text file, and routes OK to the scripter or BLOCK to quarantine, before the render that costs money.">
        <rect x="6" y="10" width="88" height="34" rx="4" fill="var(--overlay)" stroke="currentColor" strokeOpacity="0.5" />
        <path d="M84 10 L 94 20 L 84 20 Z" fill="var(--overlay)" stroke="currentColor" strokeOpacity="0.5" />
        {note(50, 26, "policy_words.txt", undefined, "middle")}
        {note(50, 37, "data", RED, "middle")}
        {arrow(50, 46, 50, 62)}
        {box(8, 64, 84, "policy_check", RED)}
        {note(50, 100, "a function · code", RED, "middle")}
        <path d="M92 70 C 118 70, 118 44, 140 44" fill="none" stroke={GREEN} strokeWidth="1.1" markerEnd="url(#rule-arrow)" />
        <path d="M92 80 C 118 80, 118 100, 140 100" fill="none" stroke={RED} strokeWidth="1.1" markerEnd="url(#rule-arrow)" />
        {note(116, 40, '"OK"', GREEN, "middle")}
        {note(116, 112, '"BLOCK"', RED, "middle")}
        {box(142, 33, 66, "scripter", PURPLE)}
        {box(142, 89, 66, "quarantine", PURPLE)}
        {arrow(208, 44, 232, 44)}
        {box(234, 33, 78, "render_desk", AMBER, true)}
        {note(273, 70, "Veo · costs money", AMBER, "middle")}
        {note(273, 82, "decided before this", undefined, "middle")}
      </RuleFigure>
    ),
  },
  {
    text: "Context that belongs to one agent rides a callback on that agent. Research that produces data before the model runs is a node in the fan-out.",
    figure: (
      <RuleFigure label="Left: propose_directions with a before_model_callback that reads Memory Bank, the creator's taste, context for that one agent. Right: read_feedback, a node in the fan-out beside the other readers, that reads the RAG corpus and hands data to the join before any model runs.">
        <line x1="164" y1="8" x2="164" y2="110" stroke="var(--hairline)" />
        {box(32, 40, 100, "propose_directions", PURPLE)}
        <rect x="30" y="10" width="104" height="18" rx="9" fill={tint(CYAN, 0.12)} stroke={CYAN} strokeWidth="1" />
        <text x="82" y="22" fontSize="7.5" style={mono} textAnchor="middle" fill={CYAN}>before_model_callback</text>
        {arrow(82, 28, 82, 38, CYAN)}
        {note(82, 78, "Memory Bank · the creator's taste", CYAN, "middle")}
        {note(82, 92, "one agent's context", undefined, "middle")}
        {note(82, 104, "rides that agent", undefined, "middle")}
        {box(172, 12, 72, "scan_trends")}
        {box(172, 40, 72, "read_backlog")}
        {box(172, 68, 72, "read_feedback", CYAN)}
        {arrow(244, 23, 268, 46)}
        {arrow(244, 51, 268, 51)}
        {arrow(244, 79, 268, 56)}
        {box(270, 40, 44, "join", CYAN)}
        {note(208, 96, "RAG Engine · the comments", CYAN, "middle")}
        {note(244, 108, "data, before any model: a node", undefined, "middle")}
      </RuleFigure>
    ),
  },
  {
    text: "The app owns the loop, not the graph: a Runner drives it, an event stream shows it, the graph itself does not know a page exists.",
    figure: (
      <RuleFigure label="The app, holding the page, a Runner and an event stream, drives the graph and shows its events. The graph, in its own box, has no arrow back to the page.">
        <rect x="8" y="8" width="150" height="104" rx="10" fill={tint(BLUE, 0.05)} stroke={BLUE} strokeWidth="1.1" />
        {note(83, 22, "the app", BLUE, "middle")}
        {box(18, 30, 60, "the page", BLUE)}
        {box(88, 30, 60, "Runner", BLUE)}
        {box(18, 82, 130, "event stream", BLUE)}
        {arrow(48, 52, 48, 80, BLUE)}
        {note(52, 68, "shows", BLUE)}
        <rect x="186" y="8" width="126" height="104" rx="10" fill="var(--overlay)" stroke="var(--hairline)" />
        {note(249, 22, "the graph", undefined, "middle")}
        {box(196, 32, 50, "join")}
        {box(256, 32, 48, "propose")}
        {box(196, 62, 50, "gate", AMBER)}
        {box(256, 62, 48, "desk", AMBER)}
        {arrow(148, 41, 184, 41, BLUE)}
        {note(166, 36, "runs", BLUE, "middle")}
        <path d="M186 90 L 150 90" fill="none" stroke={BLUE} strokeWidth="1.1" markerEnd="url(#rule-arrow)" />
        {note(166, 100, "events", BLUE, "middle")}
        {note(249, 104, "knows no page", undefined, "middle")}
      </RuleFigure>
    ),
  },
];

/* ── share the video ────────────────────────────────────────────────────── */

/** The screenshot slot: web/public/share.png when it exists, a marked space until then. */

type Kind = "start" | "func" | "join" | "agent" | "human" | "router" | "task" | "desk" | "poster";

interface NodeInfo {
  name: string;
  kind: Kind;
  step: string;
  to: string;
  concepts: string[];
}

const NODES: NodeInfo[] = [
  {
    name: "START",
    kind: "start",
    step: "Session 3a · Fan-out and join",
    to: "/step/workflows/a",
    concepts: ["A Workflow is an edge list; START is where the chains begin", "Two chains leaving START run in parallel", "A chain is a tuple of nodes that run in order"],
  },
  {
    name: "scan_trends",
    kind: "func",
    step: "Session 3a · Fan-out and join",
    to: "/step/workflows/a",
    concepts: ["A function node: node_input in, Event(output=...) out", "Plain Python, no model call", "Ten of 250 trends, a format and a look each"],
  },
  {
    name: "read_backlog",
    kind: "func",
    step: "Session 3a · Fan-out and join",
    to: "/step/workflows/a",
    concepts: ["Reads the creator's backlog file and tonight's idea", "Writes the idea to shared state with Event(state=...)", "The same node in the sandbox and in production"],
  },
  {
    name: "read_feedback",
    kind: "func",
    step: "Session 4b · The third reader",
    to: "/step/ingestion/b",
    concepts: ["RAG Engine: the passages nearest to tonight's idea", "A mixed corpus: comments, and posters captioned by Gemini", "Hands back the posters the passages came with"],
  },
  {
    name: "join_research",
    kind: "join",
    step: "Session 3a · Fan-out and join",
    to: "/step/workflows/a",
    concepts: ["A JoinNode waits for every incoming branch", "Its output is one dict keyed by node name", "A new reader is one more edge into it"],
  },
  {
    name: "propose_directions",
    kind: "agent",
    step: "Session 3b · an agent as a node (read)",
    to: "/step/workflows/b",
    concepts: ["An Agent as a node: single_turn, one model call", "output_schema: four typed candidates, each with a poster idea", "before_model_callback reads Memory Bank into the request (5b)"],
  },
  {
    name: "direction_gate",
    kind: "human",
    step: "Session 5a · Two kinds of suspension",
    to: "/step/video/a",
    concepts: ["yield RequestInput suspends the run on a form", "message, response_schema, payload, and an interrupt_id", "Resumed by a function_response carrying that id"],
  },
  {
    name: "persist_direction",
    kind: "func",
    step: "Session 5a · Two kinds of suspension",
    to: "/step/video/a",
    concepts: ["candidates bound from shared state by parameter name", "Event(state=...) writes direction, angle, hook, user:prefs", "A door must degrade: a missing pick resolves to candidate 1"],
  },
  {
    name: "policy_check",
    kind: "router",
    step: "Session 3b · The router and the loop",
    to: "/step/workflows/b",
    concepts: ["A router returns Event(route=...); the edge dict maps it", "Policy as data: the word list is read at decision time", "Refuses before any script is written or money is spent"],
  },
  {
    name: "scripter",
    kind: "agent",
    step: "Session 3b · The router and the loop",
    to: "/step/workflows/b",
    concepts: ["The OK route: a structured Script with shots and a poster idea", "after_agent_callback writes the pick to Memory Bank (session 6)", "Runs again after quarantine, with the cleaned direction"],
  },
  {
    name: "quarantine",
    kind: "task",
    step: "Session 3b · The router and the loop",
    to: "/step/workflows/b",
    concepts: ["mode=\"task\": a loop of tool calls inside one node", "find_policy_hits and suggest_replacement until clean", "finish_task carries a typed CleanedDirection back to the scripter"],
  },
  {
    name: "script_ready",
    kind: "func",
    step: "Session 3b · The router and the loop",
    to: "/step/workflows/b",
    concepts: ["After the scripter: the cleared script", "Writes script_title to state", "The fan-out point of the media desk"],
  },
  {
    name: "render_desk",
    kind: "desk",
    step: "Session 5a · Two kinds of suspension",
    to: "/step/video/a",
    concepts: ["LongRunningFunctionTool: a pending receipt suspends the run", "Nothing stays alive while Veo renders", "Resumed by call id from another process"],
  },
  {
    name: "make_poster",
    kind: "poster",
    step: "Session 5b · State and the desk",
    to: "/step/video/b",
    concepts: ["The session 2 tool as a node: the image model, 9:16, seconds", "memory_facts bound from state: the creator's taste in posters", "Runs beside the render, not after it"],
  },
  {
    name: "join_media",
    kind: "join",
    step: "Session 5b · State and the desk",
    to: "/step/video/b",
    concepts: ["The structure of 3a again: a fan-out and a join", "Waits for the slow branch", "Its output carries both the receipt's answer and the poster"],
  },
  {
    name: "store_release",
    kind: "func",
    step: "Session 5b · State and the desk",
    to: "/step/video/b",
    concepts: ["poster_url bound from state by name (STATE_SHARE); render_url from the delivery", "A real poster is described and remembered as VISUAL_STYLE", "The last node: the record of the run"],
  },
];

const KIND_LABEL: Record<Kind, string> = {
  start: "entry sentinel",
  func: "function node",
  join: "join barrier",
  agent: "agent node",
  human: "human-in-the-loop gate",
  router: "conditional router",
  task: "task-mode agent",
  desk: "long-running tool",
  poster: "the image model",
};

const STEP_ROWS = [
  { step: "Step 2 · One agent, one poster", covered: "An ADK Agent: model, instruction, tools; function_call and function_response; the image model as a tool, so the first run ends with a 9:16 poster; what a single prompt cannot promise" },
  { step: "Step 3 · The structures", covered: "Workflow, edge tuples, START, JoinNode; a router that names its edge and a dict target; a loop inside a node (task mode, finish_task) and a loop in the graph (a routed back-edge, a counter in state)" },
  { step: "Step 4 · The séance", covered: "An Agent as a node with output_schema; RequestInput: message, response_schema, payload, interrupt_id, resume by function_response; Event(state=...) and parameter binding; user-scoped keys" },
  { step: "Step 5 · Ghost whispers", covered: "Memory Bank: scope, extraction, consolidation, three topics including the creator's taste in posters; before_model and after_agent callbacks; RAG Engine over a mixed corpus of comments and captioned posters; a third reader into the join" },
  { step: "Step 6 · The media desk", covered: "LongRunningFunctionTool and the pending receipt; the delivery answers by call id from another process; the desk as a fan-out and a join with the poster branch beside Veo; the release remembers the poster" },
  { step: "Step 7 · Release the bats", covered: "The Runner over the finished graph; a FastAPI server with Server-Sent Events; the clip and its poster published; Cloud Run with session affinity" },
];

export function Summary({ embedded = false }: { embedded?: boolean }) {
  const [hover, setHover] = useState<string | null>(null);
  const node = NODES.find((n) => n.name === hover) ?? null;
  return (
    <div className="space-y-12">
      {!embedded && (
        <StepHeader
          kicker="Session 7b · What you built"
          color={GREEN}
          title="The whole graph, and everything it taught."
          blurb="Thirteen nodes from an idea to a clip and its poster. Hover a node for what it does, what it taught, and the page that built it; the pulse walks the graph the way a run does."
        />
      )}

      <In delay={0.1}>
        <section className="rounded-3xl border border-hairline bg-card p-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-fg-muted">Workflow Topology</p>
          <SnakeGraph hover={hover === "START" ? "__START__" : hover} onHover={(n) => setHover(n === "__START__" ? "START" : n)} label="Hands the cleared script to script_ready" />
          <div className="mt-4 min-h-[112px] rounded-2xl border border-hairline bg-overlay p-4">
            {node ? (
              <motion.div key={node.name} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-mono text-sm text-fg">
                    {node.name} <span className="text-fg-muted">· {KIND_LABEL[node.kind] || "entry sentinel"}</span>
                  </p>
                  <Link to={node.to} className="font-mono text-[11px] text-vibe-cyan hover:underline">
                    {node.step} →
                  </Link>
                </div>
                <ul className="mt-2 grid gap-1 text-sm text-fg-muted md:grid-cols-3">
                  {node.concepts.map((c) => (
                    <li key={c} className="rounded-xl border border-hairline bg-card px-3 py-2">
                      {c}
                    </li>
                  ))}
                </ul>
              </motion.div>
            ) : (
              <p className="text-sm text-fg-muted">Select or hover a node to inspect its architectural pattern, implementation details, and learning module.</p>
            )}
          </div>
        </section>
      </In>

      <In delay={0.2}>
        <section className="rounded-3xl border border-hairline bg-card p-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-fg-muted">Curriculum Overview</p>
          <h2 className="font-display mt-2 text-2xl">Core architectural concepts by module.</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left font-mono text-[10px] uppercase tracking-wider text-fg-muted">
                  <th className="pb-2 pr-4">Step</th>
                  <th className="pb-2">Concepts</th>
                </tr>
              </thead>
              <tbody>
                {STEP_ROWS.map((r) => (
                  <tr key={r.step} className="border-t border-hairline align-top">
                    <td className="py-2 pr-4 font-semibold text-fg">{r.step}</td>
                    <td className="py-2 text-fg-muted">{r.covered}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </In>

      <In delay={0.3}>
        <section className="rounded-3xl border border-hairline bg-card p-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-fg-muted">Design rules the graph follows</p>
          <ul className="mt-3 grid gap-3 md:grid-cols-2">
            {RULES.map((r) => (
              <li key={r.text} className="rounded-2xl border border-hairline bg-overlay p-3">
                <div className="rounded-xl bg-card p-2">{r.figure}</div>
                <p className="mt-3 text-sm text-fg-muted">{r.text}</p>
              </li>
            ))}
          </ul>
        </section>
      </In>

    </div>
  );
}
