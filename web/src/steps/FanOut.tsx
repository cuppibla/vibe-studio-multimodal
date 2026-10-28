import { Lede } from "../components/Lede";
import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy, ExternalLink, Eye, EyeOff, Lightbulb, PenLine, Play, RefreshCw, TerminalSquare, X } from "lucide-react";
import { CodeEditor } from "../components/CodeEditor";
import { In, SectionHead, StepHeader } from "../components/shared";
import { LoadCheck } from "../components/LoadCheck";
import { LoadedBadge } from "../components/LoadedBadge";
import { api, useRunEvents } from "../lib/api";
import type { InspectorStatus, SentRun, Stage1Status } from "../lib/types";
import { COLORS, tint } from "./colors";

/*
 * Session 3a, composed by steps/Workflows.tsx:
 *   GraphIntro       the ADK graph: nodes, edges, the edge grammar, and a
 *                    write-the-edges exercise on the stage 1 graph
 *   DeclareFanOut    declare the fan-out (FANOUT) in stage1_fanout/agent.py, run, verify
 * The shared panels every session uses (EditPanel, RunPanel, VerifyPanel, CheckRow)
 * live at the end. The gate (RequestInput) is Session 5a's: steps/Suspension.tsx.
 */

const AMBER = COLORS.amber;
const BLUE = COLORS.blue;
const PURPLE = COLORS.purple;
const CYAN = COLORS.cyan;
const GREEN = COLORS.green;
const RED = COLORS.red;

/* ───────────────────────── 3a · the graph ───────────────────────── */

const NODE_KINDS = [
  { name: "Function node", color: "var(--fg)", code: "def scan_trends(node_input): ...", note: "Plain Python. Returns Event(output=...) and may write shared state with Event(state=...)." },
  { name: "Agent node", color: PURPLE, code: "propose_directions = Agent(...)", note: "An LLM call. Used as a node it runs in single_turn mode: one call, structured output, no conversation." },
  { name: "JoinNode", color: CYAN, code: 'JoinNode(name="join_research")', note: "Waits until every incoming branch has reported, then passes all their outputs on as one dict." },
  { name: "Router", color: RED, code: 'return Event(output=..., route="OK")', note: "A function node whose return names the outgoing edge. The edge list maps each route name to a destination." },
  { name: "Human input node", color: AMBER, code: "yield RequestInput(response_schema=...)", note: "Suspends the graph until a person answers. The schema is what a frontend renders as a form." },
];

const EDGE_GRAMMAR = `edges=[
    (START, scan_trends, join_research),        # a chain: START, then scan_trends, then the join
    (START, read_backlog, join_research),       # a second chain from START: the readers fan out
    (START, read_feedback, join_research),      # a third reader, added in session 4
    (join_research, propose_directions,         # the chains arrive at the JoinNode: it waits for all
     direction_gate, persist_direction,         # the door (session 5) and the state write
     policy_check),
    (policy_check, {"OK": scripter,             # a dict target: the router's route name picks the edge
                    "BLOCK": quarantine}),
    (quarantine, scripter),                     # the cleaned direction rejoins the main line
    (scripter, script_ready),                   # the cleared script, handed to the desk
    (script_ready, render_desk, join_media),    # two branches leave script_ready: Veo, minutes
    (script_ready, make_poster, join_media),    # and the poster, seconds; they meet at a join
    (join_media, store_release),                # the release: the clip and its poster
]`;

export function GraphIntro() {
  return (
    <div className="space-y-12">
      <StepHeader
        kicker="Session 3a · Fan-out and join"
        color={AMBER}
        title="Nodes, edges, and the first graph."
        blurb="The one-prompt agent did six jobs in one breath. An ADK Workflow does them as a drawn graph: nodes do the work, edges say what runs after what, and the model is called only inside the nodes that need it. Here are the node kinds, the edge grammar, and the first graph you build: two readers fanning out of START and meeting at a join."
      />

      <In delay={0.1}>
        <section className="grid gap-4 lg:grid-cols-[1fr_1.15fr]">
          <div className="rounded-3xl border border-hairline bg-card p-6">
            <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-fg-muted">Node kinds in this lab</p>
            <ul className="mt-4 space-y-3">
              {NODE_KINDS.map((k, i) => (
                <motion.li key={k.name} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 + i * 0.07 }} className="rounded-2xl border border-hairline bg-overlay p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold" style={{ color: k.color }}>
                      {k.name}
                    </span>
                    <code className="truncate font-mono text-[10.5px] text-fg-muted">{k.code}</code>
                  </div>
                  <p className="mt-1 text-xs text-fg-muted">{k.note}</p>
                </motion.li>
              ))}
            </ul>
          </div>

          <div className="overflow-hidden rounded-3xl border border-hairline bg-card">
            <div className="border-b border-hairline bg-overlay px-4 py-2 font-mono text-[11px] text-fg-muted">agent/graph.py · the production edge list, annotated</div>
            <pre className="overflow-x-auto px-4 py-3 font-mono text-[11.5px] leading-relaxed text-fg">
              <code>{EDGE_GRAMMAR}</code>
            </pre>
            <div className="overflow-x-auto border-t border-hairline px-4 py-3">
              <EdgeShapesFigure />
            </div>
            <div className="border-t border-hairline px-4 py-3 text-xs text-fg-muted">
              <p>Workflows declare the edge topology in code. The ADK runtime traverses the graph, coordinates concurrent branch execution, and persists each node's output event into the session journal.</p>
            </div>
          </div>
        </section>
      </In>

      <In delay={0.35}>
        <EdgesExercise />
      </In>
    </div>
  );
}

/* the four shapes an edge entry can take, drawn from the production list */
function EdgeShapesFigure() {
  const box = { fill: "var(--overlay)", stroke: "var(--hairline)" };
  const mono = { fontFamily: "var(--font-mono)" } as const;
  const node = (x: number, y: number, w: number, label: string, color?: string) => (
    <g>
      <rect x={x} y={y} width={w} height={22} rx={7} fill={color ? tint(color, 0.1) : box.fill} stroke={color ?? box.stroke} strokeWidth={color ? 1.3 : 1} />
      <text x={x + w / 2} y={y + 15} fontSize="9" style={mono} textAnchor="middle" fill={color ?? "currentColor"}>{label}</text>
    </g>
  );
  const arrow = (x1: number, y1: number, x2: number, y2: number, color = "currentColor") => (
    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="1.1" markerEnd="url(#eg-arrow)" />
  );
  const entry = (x: number, y: number, text: string) => (
    <text x={x} y={y} fontSize="8.5" style={mono} fill="currentColor" opacity="0.75">{text}</text>
  );
  const caption = (x: number, y: number, text: string, color?: string) => (
    <text x={x} y={y} fontSize="8.5" style={mono} fill={color ?? "currentColor"} opacity={color ? 1 : 0.7}>{text}</text>
  );
  return (
    <figure className="m-0 min-w-[520px]">
      <svg viewBox="0 0 640 330" role="img" aria-label="The four shapes an edge entry takes. A chain: START, scan_trends, join_research run in that order. Two entries from the same source: scan_trends and read_backlog both start when START finishes, at the same time. Two chains arriving at a JoinNode: join_research waits for both, then one chain continues. A dictionary target: policy_check's route name, OK or BLOCK, picks which edge is taken." className="h-auto w-full text-fg">
        <defs>
          <marker id="eg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="currentColor" />
          </marker>
        </defs>
        <line x1="320" y1="8" x2="320" y2="322" stroke="var(--hairline)" />
        <line x1="10" y1="166" x2="630" y2="166" stroke="var(--hairline)" />

        {/* 1 · a chain */}
        {entry(12, 22, "(START, scan_trends, join_research)")}
        {node(12, 66, 50, "START")}
        {arrow(62, 77, 96, 77)}
        {node(98, 66, 92, "scan_trends")}
        {arrow(190, 77, 224, 77)}
        {node(226, 66, 84, "join_research", CYAN)}
        {caption(12, 116, "one entry, left to right:")}
        {caption(12, 128, "each node starts when the one before it is done")}

        {/* 2 · two entries from one source */}
        {entry(332, 22, "(START, scan_trends, …)")}
        {entry(332, 34, "(START, read_backlog, …)")}
        {node(332, 66, 50, "START")}
        <path d="M382 77 C 404 77, 404 55, 424 55" fill="none" stroke="currentColor" strokeWidth="1.1" markerEnd="url(#eg-arrow)" />
        <path d="M382 77 C 404 77, 404 99, 424 99" fill="none" stroke="currentColor" strokeWidth="1.1" markerEnd="url(#eg-arrow)" />
        {node(426, 44, 92, "scan_trends")}
        {node(426, 88, 92, "read_backlog")}
        {caption(332, 128, "the same source in two entries:")}
        {caption(332, 140, "both start the moment START is done, at the same time", GREEN)}

        {/* 3 · arriving at a JoinNode */}
        {entry(12, 186, "(START, scan_trends, join_research)")}
        {entry(12, 198, "(START, read_backlog, join_research)")}
        {entry(12, 210, "(join_research, propose_directions, …)")}
        {node(12, 226, 72, "scan_trends")}
        {node(12, 264, 72, "read_backlog")}
        <path d="M84 237 C 100 237, 100 256, 108 256" fill="none" stroke="currentColor" strokeWidth="1.1" markerEnd="url(#eg-arrow)" />
        <path d="M84 275 C 100 275, 100 256, 108 256" fill="none" stroke="currentColor" strokeWidth="1.1" markerEnd="url(#eg-arrow)" />
        {node(110, 245, 82, "join_research", CYAN)}
        {arrow(192, 256, 210, 256, CYAN)}
        {node(212, 245, 102, "propose_directions", PURPLE)}
        {caption(12, 308, "the join waits for every entry that ends in it,", CYAN)}
        {caption(12, 320, "then the entry that starts from it continues")}

        {/* 4 · a dict target */}
        {entry(332, 186, "(policy_check, {\"OK\": scripter,")}
        {entry(412, 198, "\"BLOCK\": quarantine})")}
        {node(332, 245, 84, "policy_check", RED)}
        <path d="M416 256 C 440 256, 440 234, 462 234" fill="none" stroke={GREEN} strokeWidth="1.1" markerEnd="url(#eg-arrow)" />
        <path d="M416 256 C 440 256, 440 278, 462 278" fill="none" stroke={RED} strokeWidth="1.1" markerEnd="url(#eg-arrow)" />
        <text x="440" y="230" fontSize="8" style={mono} fill={GREEN} textAnchor="middle">"OK"</text>
        <text x="440" y="292" fontSize="8" style={mono} fill={RED} textAnchor="middle">"BLOCK"</text>
        {node(464, 223, 72, "scripter", PURPLE)}
        {node(464, 267, 72, "quarantine", PURPLE)}
        {caption(332, 308, "the router returns a route name;")}
        {caption(332, 320, "the dict says which edge that name takes", RED)}
      </svg>
    </figure>
  );
}

/* the write-the-edges exercise: the stage 1 graph */

interface GNode {
  id: string;
  label: string;
  color: string;
  x: number;
  y: number;
  sub?: string;
}
const GNODES: GNode[] = [
  { id: "START", label: "START", color: "var(--fg-muted)", x: 10, y: 50 },
  { id: "scan_trends", label: "scan_trends", color: "var(--fg)", x: 42, y: 22, sub: "function node" },
  { id: "read_backlog", label: "read_backlog", color: "var(--fg)", x: 42, y: 78, sub: "function node" },
  { id: "join_research", label: "join_research", color: CYAN, x: 78, y: 50, sub: "JoinNode" },
];
const GEDGES: [string, string][] = [
  ["START", "scan_trends"],
  ["START", "read_backlog"],
  ["scan_trends", "join_research"],
  ["read_backlog", "join_research"],
];

interface Cand {
  id: string;
  code: string;
  correct: boolean;
  why: string;
}
const CANDS: Cand[] = [
  { id: "c1", code: "(START, scan_trends, join_research)", correct: true, why: "One chain: START, then scan_trends, then the join." },
  { id: "c2", code: "(START, read_backlog, join_research)", correct: true, why: "A second chain from START. Two chains leaving START run in parallel." },
  { id: "d1", code: "(START, scan_trends, read_backlog, join_research)", correct: false, why: "One chain runs its nodes in order. This makes the readers sequential; the graph runs them in parallel." },
  { id: "d2", code: "(join_research, scan_trends)", correct: false, why: "Reversed. Edges run left to right; a reader reports to the join, it does not run after it." },
  { id: "d3", code: "(START, join_research)", correct: false, why: "The join has nothing to wait for. The readers never run." },
  { id: "d5", code: "(START, scan_trends)", correct: false, why: "Half a chain. scan_trends would finish and nothing would carry its output into the join." },
];
const CORRECT = CANDS.filter((c) => c.correct).length;

function shuffled<T>(a: T[]): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

function EdgesExercise() {
  const [deck] = useState(() => shuffled(CANDS));
  const [placed, setPlaced] = useState<string[]>([]);
  const [rejected, setRejected] = useState<string | null>(null);
  const done = placed.length === CORRECT;
  const pool = deck.filter((c) => !placed.includes(c.id));

  const pick = (c: Cand) => {
    if (c.correct) {
      setPlaced((p) => [...p, c.id]);
      setRejected(null);
    } else {
      setRejected(c.id);
    }
  };

  const W = 720;
  const H = 210;
  const pos = (id: string) => {
    const n = GNODES.find((g) => g.id === id)!;
    return { x: (n.x / 100) * W, y: (n.y / 100) * H };
  };

  return (
    <section className="rounded-3xl border p-6" style={{ borderColor: tint(AMBER, 0.4), background: tint(AMBER, 0.04) }}>
      <p className="font-mono text-[11px] uppercase tracking-[0.3em]" style={{ color: AMBER }}>
        Exercise
      </p>
      <h2 className="font-display mt-2 text-2xl">Write the edges.</h2>
      <Lede className="mt-2 max-w-2xl text-sm text-fg-muted">
        Read the stage 1 graph, then click the {CORRECT} entries that describe it. {CANDS.length - CORRECT} of the options
        describe a different graph; each one explains what it would change.
      </Lede>

      <div className="mt-5 overflow-x-auto rounded-2xl border border-hairline bg-card">
        <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto block w-full max-w-[720px]" role="img" aria-label="START fans out to scan_trends and read_backlog, both join at join_research">
          <defs>
            <marker id="fo-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
              <path d="M0,0 L10,5 L0,10 z" fill="var(--fg-muted)" />
            </marker>
          </defs>
          {GEDGES.map(([a, b]) => {
            const p = pos(a);
            const q = pos(b);
            const x1 = p.x + 62;
            const x2 = q.x - 62;
            const mx = (x1 + x2) / 2;
            return <path key={`${a}-${b}`} d={`M${x1},${p.y} C${mx},${p.y} ${mx},${q.y} ${x2},${q.y}`} fill="none" stroke="var(--fg-muted)" strokeWidth="1.5" markerEnd="url(#fo-arrow)" />;
          })}
          {GNODES.map((n) => {
            const p = pos(n.id);
            const start = n.id === "START";
            return (
              <g key={n.id}>
                {start ? (
                  <circle cx={p.x} cy={p.y} r="24" fill="var(--overlay)" stroke="var(--fg-muted)" strokeWidth="1.5" />
                ) : (
                  <rect x={p.x - 62} y={p.y - 22} width="124" height="44" rx="10" fill={n.id === "join_research" ? tint(CYAN, 0.09) : "var(--overlay)"} stroke={n.id === "join_research" ? CYAN : "var(--hairline)"} strokeWidth="1.5" />
                )}
                <text x={p.x} y={p.y + (n.sub ? -1 : 4)} textAnchor="middle" fontSize="11.5" fontFamily="var(--font-mono)" fill={n.color}>
                  {n.label}
                </text>
                {n.sub && (
                  <text x={p.x} y={p.y + 13} textAnchor="middle" fontSize="9" fill="var(--fg-muted)">
                    {n.sub}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border-2 border-dashed" style={{ borderColor: done ? GREEN : "var(--hairline)", background: "var(--card)" }}>
          <p className="border-b border-hairline bg-overlay px-3 py-1.5 font-mono text-[10px] text-fg-muted">stage1_fanout/agent.py · edges</p>
          <div className="px-3 py-2.5 font-mono text-[11.5px] leading-relaxed">
            <p>edges=[</p>
            {placed.map((id) => {
              const c = CANDS.find((x) => x.id === id)!;
              return (
                <motion.div key={id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="pl-4">
                  <span style={{ color: GREEN }}>{c.code},</span>
                  <span className="ml-2 font-sans text-[10px] text-fg-muted">{c.why}</span>
                </motion.div>
              );
            })}
            {Array.from({ length: CORRECT - placed.length }).map((_, i) => (
              <p key={i} className="pl-4 text-fg-muted opacity-40">
                …
              </p>
            ))}
            <p>]</p>
          </div>
          {done && (
            <p className="border-t border-hairline px-3 py-2 text-xs" style={{ color: GREEN }}>
              Complete. The section below writes them into stage1_fanout/agent.py and runs it.
            </p>
          )}
        </div>

        <div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-fg-muted">
            candidates · click the right ones ({placed.length}/{CORRECT})
          </p>
          <div className="mt-2 flex flex-col gap-1.5">
            {pool.map((c) => (
              <button
                key={c.id}
                onClick={() => pick(c)}
                className="rounded-lg border px-2.5 py-1.5 text-left font-mono text-[11.5px] transition-colors hover:bg-overlay"
                style={{ borderColor: rejected === c.id ? RED : "var(--hairline)", color: rejected === c.id ? RED : "var(--fg)", background: "var(--card)" }}
              >
                {c.code}
              </button>
            ))}
          </div>
          <AnimatePresence>
            {rejected && (
              <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-2 text-[11.5px] leading-snug" style={{ color: RED }}>
                {CANDS.find((c) => c.id === rejected)!.why}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── 3a · the fan-out ───────────────────────── */

export const DEFAULT_IDEA = "a tiny ghost learning to haunt a sock drawer";   // the same idea session 2 starts with: every run of the lab is a Halloween night

const READER_CODE = `# agent/graph.py
def scan_trends(node_input):
    from .trends import sample_trends
    return Event(output={"trends": sample_trends()})     # ten of 250, at random


def read_backlog(node_input):
    return Event(output={"backlog": backlog_notes(),      # agent/backlog.txt, 15 notes
                         "idea": idea_text(node_input)})  # tonight's idea, from your message`;

const JOIN_CODE = `from google.adk.workflow import JoinNode

# defined, not written: a JoinNode has no body
join_research = JoinNode(name="join_research")

# its output, once both readers have reported,
# is one dict keyed by node name:
# {"scan_trends":  {"trends": [...10 topics...]},
#  "read_backlog": {"backlog": [...15 notes...], "idea": "..."}}`;

const STAGE1_NODES = [
  { name: "scan_trends", kind: "function node", color: "var(--fg)", what: "Reads what is trending: ten of 250 trends, each a format paired with a look, with a heat score. A different ten every run." },
  { name: "read_backlog", kind: "function node", color: "var(--fg)", what: "Reads the creator's backlog, fifteen ideas in agent/backlog.txt, and takes tonight's idea from your message. Both travel together into the join." },
  { name: "join_research", kind: "JoinNode", color: CYAN, what: "Built into ADK. Waits until every incoming branch has reported, then passes all of their outputs on as one dict." },
];

/** The stage 1 graph as a static picture: what 4b builds. */
function Stage1Graph() {
  const W = 640;
  const H = 190;
  const pos = (id: string) => {
    const n = GNODES.find((g) => g.id === id)!;
    return { x: (n.x / 100) * W, y: (n.y / 100) * H };
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto block w-full max-w-[640px]" role="img" aria-label="START fans out to scan_trends and read_backlog, two function nodes; both feed join_research, a JoinNode.">
      <defs>
        <marker id="s1-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--fg-muted)" />
        </marker>
      </defs>
      {GEDGES.map(([a, b]) => {
        const p = pos(a);
        const q = pos(b);
        const x1 = p.x + (a === "START" ? 26 : 66);
        const x2 = q.x - 66;
        const mx = (x1 + x2) / 2;
        return <path key={`${a}-${b}`} d={`M${x1},${p.y} C${mx},${p.y} ${mx},${q.y} ${x2},${q.y}`} fill="none" stroke="var(--fg-muted)" strokeWidth="1.5" markerEnd="url(#s1-arrow)" />;
      })}
      {GNODES.map((n) => {
        const p = pos(n.id);
        if (n.id === "START")
          return (
            <g key={n.id}>
              <circle cx={p.x} cy={p.y} r="24" fill="var(--overlay)" stroke="var(--fg-muted)" strokeWidth="1.5" />
              <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize="10" fontFamily="var(--font-mono)" fill="var(--fg-muted)">START</text>
            </g>
          );
        const join = n.id === "join_research";
        return (
          <g key={n.id}>
            <rect x={p.x - 66} y={p.y - 24} width="132" height="48" rx="10" fill={join ? tint(CYAN, 0.09) : "var(--overlay)"} stroke={join ? CYAN : "var(--hairline)"} strokeWidth="1.5" />
            <text x={p.x} y={p.y - 2} textAnchor="middle" fontSize="11" fontFamily="var(--font-mono)" fill={n.color}>{n.label}</text>
            <text x={p.x} y={p.y + 14} textAnchor="middle" fontSize="9" fontFamily="var(--font-mono)" fill="var(--fg-muted)">{n.sub}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function DeclareFanOut() {
  const [idea, setIdea] = useState(DEFAULT_IDEA);
  const [open, setOpen] = useState(false);
  const [hintB, setHintB] = useState(0);
  const [status, setStatus] = useState<Stage1Status | null>(null);
  const [checking, setChecking] = useState(false);
  const { snapshot } = useRunEvents();

  const check = useCallback(async () => {
    setChecking(true);
    try {
      setStatus(await api.labStage1());
    } finally {
      setChecking(false);
    }
  }, []);
  useEffect(() => {
    check();
  }, [check]);
  useEffect(() => {
    if (snapshot) check();
  }, [snapshot?.updated_at, check]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    // the dev UI writes to sessions.db outside this server's run loop; poll
    // while it is open so the verify rows follow the student's run
    if (!open) return;
    const t = setInterval(check, 4000);
    return () => clearInterval(t);
  }, [open, check]);

  const joinOk = status?.join_defined ?? false;
  const wired = status?.edges_complete ?? false;

  return (
    <div className="space-y-12">
      <SectionHead
        kicker="Your turn · stage1_fanout"
        color={AMBER}
        title="Build the research fan-out."
        blurb="The two readers of the image session as function nodes, run in parallel, and a JoinNode that waits for both and hands their outputs on as one research dict. Read the join, declare the two chains, run it, read the join's output."
      />

      <In delay={0.1}>
        <section className="rounded-3xl border border-hairline bg-card p-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-fg-muted">The graph to build</p>
          <h2 className="font-display mt-2 text-2xl">Both readers run, then the join releases.</h2>
          <Lede className="mt-2 max-w-3xl text-sm text-fg-muted">
            The graph enforces deterministic research retrieval. Both reader chains originate at START, ensuring both
            execute concurrently on every run. The join barrier synchronizes the branches and passes an aggregated
            dictionary to downstream nodes.
          </Lede>
          <div className="mt-4 overflow-x-auto rounded-2xl border border-hairline bg-overlay py-2">
            <Stage1Graph />
          </div>
        </section>
      </In>

      <In delay={0.2}>
        <section className="rounded-3xl border border-hairline bg-card p-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-fg-muted">The nodes</p>
          <h2 className="font-display mt-2 text-2xl">Function nodes and a join.</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {STAGE1_NODES.map((n) => (
              <div key={n.name} className="rounded-2xl border border-hairline bg-overlay p-4">
                <div className="font-mono text-sm font-semibold" style={{ color: n.color }}>
                  {n.name}
                </div>
                <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-fg-muted">{n.kind}</div>
                <p className="mt-2 text-xs text-fg-muted">{n.what}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="overflow-hidden rounded-2xl border border-hairline bg-input">
              <div className="border-b border-hairline px-4 py-1.5 font-mono text-[10px] uppercase tracking-wider text-fg-muted">The readers · function nodes</div>
              <pre className="overflow-x-auto px-4 py-3 font-mono text-[11.5px] leading-relaxed text-fg">
                <code>{READER_CODE}</code>
              </pre>
            </div>
            <div className="overflow-hidden rounded-2xl border border-hairline bg-input">
              <div className="border-b border-hairline px-4 py-1.5 font-mono text-[10px] uppercase tracking-wider text-fg-muted">Defining a JoinNode</div>
              <pre className="overflow-x-auto px-4 py-3 font-mono text-[11.5px] leading-relaxed text-fg">
                <code>{JOIN_CODE}</code>
              </pre>
            </div>
          </div>
          <Lede className="mt-4 max-w-3xl text-sm text-fg-muted">
            Nothing reformats the join's dict. The node after it, in 3b, is an agent, and an agent node receives its{" "}
            <code className="font-mono text-fg">node_input</code> as its message: a dict arrives as JSON, which the model reads directly.
          </Lede>
        </section>
      </In>

      <In delay={0.35}>
        <EditPanel
          label="Your edit"
          title="Declare the two chains into the join."
          intro={
            <>
              Only <code className="font-mono text-fg">EDGES</code> is shown; the join is defined on the line above it and the{" "}
              <code className="font-mono text-fg">Workflow</code> below reads this list. Each chain is a tuple of nodes that run in order;
              two chains leaving <code className="font-mono text-fg">START</code> run in parallel, and both end at the join.
            </>
          }
          pill={status ? (wired ? "edges complete ✓" : `edges found: ${status.edges.length}`) : "…"}
          ok={wired}
          hint={hintB}
          setHint={setHintB}
          hint1={
            <>
              Two tuples inside the list. Both start with <code className="font-mono">START</code> and end at{" "}
              <code className="font-mono">join_research</code>; one goes through each reader.
            </>
          }
          hint2={`EDGES = [(START, scan_trends, join_research),
         (START, read_backlog, join_research)]`}
          path="stage1_fanout/agent.py"
          symbol="EDGES"
          pattern={/TODO: FANOUT|^\s*EDGES = /}
          onSaved={check}
        />
      </In>

      <In delay={0.35}>
        <LoadCheck app="stage1_fanout" intro="Save the edit, then click the button. It loads stage1_fanout the way adk web will and tells you either that it loads or what ADK objects to." />
      </In>

      <In delay={0.4}>
        <RunPanel
          app="stage1_fanout"
          open={open}
          setOpen={setOpen}
          title="Run the workflow in adk web."
          intro="The dev UI opens with stage1_fanout selected. It draws the graph from your edge list, and each node's output arrives as its own event. No model call in this stage."
          idea={idea}
          setIdea={setIdea}
          steps={[
            "Two nodes light together on the map, then the join.",
            "Open join_research's event. Its output is one dict: a scan_trends key with ten trending topics, and a read_backlog key with the fifteen backlog notes and your idea.",
          ]}
        />
      </In>

      <In delay={0.5}>
        <VerifyPanel checking={checking} onCheck={check} intro="Read from the file and the stage1_fanout sessions in runs/sessions.db. Every node's output is an event; these rows count them.">
          <CheckRow ok={joinOk} label="join_research is a JoinNode">
            {status ? (joinOk ? "JoinNode(name=...) found in the file." : "Edit 1 above.") : "…"}
          </CheckRow>
          <CheckRow ok={wired} label="The two edges are in the file">
            {status ? (wired ? "START → both readers → join_research" : "Edit 2 above.") : "…"}
          </CheckRow>
          <CheckRow ok={!!status && status.runs > 0} label="The workflow ran">
            {status ? `${status.runs} run${status.runs === 1 ? "" : "s"} reached the join` : "…"}
          </CheckRow>
          <CheckRow ok={!!status?.readers_ran} label="Both readers ran">
            {status?.nodes_ran.length ? `events from: ${status.nodes_ran.join(", ")}` : "No node events yet."}
          </CheckRow>
          <CheckRow ok={!!status?.joined} label="The join fired once with both outputs">
            {status ? (status.joined ? "join_research produced its dict." : "Not yet.") : "…"}
          </CheckRow>
          <CheckRow ok={(status?.backlog_count ?? 0) > 0} label="The backlog reached the join">
            {status?.backlog_count == null ? "Run first." : `${status.backlog_count} notes from agent/backlog.txt, with your idea`}
          </CheckRow>
          {status?.bundle ? (
            <li className="md:col-span-2 overflow-hidden rounded-2xl border border-hairline bg-overlay">
              <p className="border-b border-hairline px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-fg-muted">join_research output · the research dict</p>
              <pre className="max-h-64 overflow-auto px-3 py-2 font-mono text-[11px] leading-relaxed text-fg">{status.bundle}</pre>
            </li>
          ) : null}
        </VerifyPanel>
      </In>
    </div>
  );
}

/* ───────────────────────── 4b · the door and the state ───────────────────────── */

/* ───────────────────────── the shared panels ───────────────────────── */

export function EditPanel({
  label = "Your edit",
  title,
  intro,
  pill,
  ok,
  hint,
  setHint,
  hint1,
  hint2,
  path,
  symbol,
  pattern,
  onSaved,
  extra,
}: {
  label?: string;
  title: string;
  intro: React.ReactNode;
  /** Shown between the intro and the editor: figures, code to read, a helper button. */
  extra?: React.ReactNode;
  pill: string;
  ok: boolean;
  hint: number;
  setHint: (f: (h: number) => number) => void;
  hint1: React.ReactNode;
  hint2: string;
  path: string;
  symbol?: string;
  pattern: RegExp;
  onSaved: () => void;
}) {
  // The hint is always in view: it is a nudge, not the answer. The answer
  // itself is one click to read ("Show the answer") and one obvious button to
  // have written into the file ("Write the answer for me"): over whatever the
  // editor holds, saved, and reloaded by adk web. `hint` keeps its old
  // meaning for the pages, which still own it: 2 means the answer is shown.
  const [writing, setWriting] = useState(false);
  const [written, setWritten] = useState<{ ok: boolean; text: string } | null>(null);
  const shown = hint >= 2;
  const writeAnswer = async () => {
    if (!symbol) return;
    setWriting(true);
    setHint(() => 2);
    try {
      const d = await api.answer({ path, symbol, text: hint2 });
      window.dispatchEvent(new CustomEvent("vibe:adopt", { detail: { path } }));
      const err = d.validation.import_error;
      setWritten(err ? { ok: false, text: `Written to ${path}, but the file does not import: ${err}` } : { ok: true, text: `Written to ${path} and saved; adk web has it.` });
      onSaved();
    } catch (e) {
      setWritten({ ok: false, text: (e as Error).message });
    } finally {
      setWriting(false);
    }
  };
  return (
    <section className="rounded-3xl border p-6" style={{ borderColor: tint(AMBER, 0.4), background: tint(AMBER, 0.04) }}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.3em]" style={{ color: AMBER }}>
            {label}
          </p>
          <h2 className="font-display mt-2 text-2xl">{title}</h2>
          <p className="mt-2 max-w-2xl text-sm text-fg-muted">{intro}</p>
        </div>
        <span className="shrink-0 rounded-full border px-3 py-1 font-mono text-[11px]" style={ok ? { borderColor: tint(GREEN, 0.4), color: GREEN, background: tint(GREEN, 0.08) } : { borderColor: "var(--hairline)", color: "var(--fg-muted)" }}>
          {pill}
        </span>
      </div>
      <div className="mt-4 rounded-2xl border border-hairline bg-card p-4 text-sm text-fg-muted">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <p className="min-w-0">
            <Lightbulb size={14} className="mr-1.5 inline-block align-[-2px]" style={{ color: AMBER }} />
            <b className="text-fg">Hint.</b> {hint1}
          </p>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button onClick={() => setHint(() => (shown ? 1 : 2))} className="flex items-center gap-1.5 rounded-full border border-hairline bg-overlay px-3 py-1.5 font-mono text-[11px] text-fg-muted hover:text-fg">
              {shown ? <EyeOff size={13} /> : <Eye size={13} />} {shown ? "Hide the answer" : "Show the answer"}
            </button>
            <button
              onClick={() => void writeAnswer()}
              disabled={writing || !symbol}
              title={`Replace ${symbol || "the TODO line"} in ${path} with the answer, save, and hand it to adk web`}
              className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold text-white transition-transform hover:scale-[1.03] disabled:opacity-50"
              style={{ background: AMBER }}
            >
              {writing ? <RefreshCw size={14} className="animate-spin" /> : <PenLine size={14} />}
              {writing ? "Writing…" : written?.ok ? "Write it again" : "Write the answer for me"}
            </button>
          </div>
        </div>
        {shown && <pre className="mt-3 overflow-x-auto rounded-lg bg-overlay px-3 py-2 font-mono text-[11.5px] text-fg">{hint2}</pre>}
        {written || writing ? (
          <p className="mt-2 font-mono text-[11.5px]" style={{ color: written ? (written.ok ? GREEN : RED) : "var(--fg-muted)" }}>
            {written ? written.text : "writing…"}
          </p>
        ) : null}
      </div>
      {extra && <div className="mt-4">{extra}</div>}
      <div className="mt-4">
        <CodeEditor path={path} symbol={symbol} accent={AMBER} highlightPattern={pattern} onSaved={onSaved} />
      </div>
    </section>
  );
}

export function RunPanel({
  app,
  open,
  setOpen,
  title,
  intro,
  idea,
  setIdea,
  steps,
  stepTitles,
  frame,
  figure,
  copy2,
  sends,
  onSent,
}: {
  app: string;
  open: boolean;
  setOpen: (f: (o: boolean) => boolean) => void;
  title: string;
  intro: string;
  idea: string;
  setIdea: (v: string) => void;
  steps: [string, string];
  /** Titles for the two instruction cards after the idea; default "Watch the run" and "Then". */
  stepTitles?: [string, string];
  /** A session to open instead of the app's start page, and a counter that
   *  reloads the frame each time it changes (the dev UI never re-reads a
   *  session on its own). */
  frame?: { url: string; n: number } | null;
  /** A picture of this run, drawn between the intro and the instructions. */
  figure?: React.ReactNode;
  /** A second message to send, under the third card, with its own copy button (the BLOCK run of 3b). */
  copy2?: string;
  /** Buttons that send a message for the student, the way adk web does, each in a new session. */
  sends?: { label: string; message: string }[];
  /** Called as a sent run progresses and when it ends: the page re-reads its verify rows. */
  onSent?: () => void;
}) {
  const [inspector, setInspector] = useState<InspectorStatus | null>(null);
  useEffect(() => {
    api.labInspector().then(setInspector).catch(() => setInspector({ up: false, url: "/inspector/dev-ui/", apps: [] }));
  }, []);
  // A message sent by a button: the run as it goes, and the session it opened,
  // which the frame shows instead of the app's start page.
  const [sent, setSent] = useState<SentRun | null>(null);
  const [sendError, setSendError] = useState("");
  const sending = sent?.status === "running";
  useEffect(() => {
    if (!sent || sent.status !== "running") return;
    const t = setInterval(async () => {
      try {
        const r = await api.sent(sent.run);
        setSent(r);
        onSent?.();
      } catch (e) {
        setSendError((e as Error).message);
      }
    }, 2500);
    return () => clearInterval(t);
  }, [sent?.run, sent?.status]); // eslint-disable-line react-hooks/exhaustive-deps
  const send = async (message: string) => {
    setSendError("");
    setOpen(() => true);
    try {
      setSent(await api.send(app, message));
    } catch (e) {
      setSendError((e as Error).message);
    }
  };
  const sentUrl = sent ? `/inspector/dev-ui/?app=${app}&userId=${encodeURIComponent(sent.user)}&session=${encodeURIComponent(sent.session)}` : null;
  const url = sentUrl ?? frame?.url ?? `/inspector/dev-ui/?app=${app}`;
  // the badge reloads the frame when the student asks it to; a sent run reloads
  // it when it starts and once more when it ends (the dev UI never re-reads a session on its own)
  const [reloadN, setReloadN] = useState(0);
  const frameKey = `${frame?.n ?? 0}:${reloadN}:${sent ? `${sent.run}:${sent.status}` : ""}`;
  return (
    <section id={`run-${app}`} className="rounded-3xl border p-6" style={{ borderColor: tint(BLUE, 0.33), background: tint(BLUE, 0.04) }}>
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.3em]" style={{ color: BLUE }}>
            Run it
          </p>
          <h2 className="font-display mt-2 text-2xl">{title}</h2>
          <p className="mt-2 max-w-2xl text-sm text-fg-muted">{intro}</p>
        </div>
        <div className="flex items-center gap-2">
          {inspector && (
            <span className="rounded-full border border-hairline bg-card px-3 py-1 font-mono text-[11px] text-fg-muted">
              <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${inspector.up ? "bg-vibe-green" : "bg-vibe-red"}`} />
              {inspector.up ? "adk web ready" : "adk web unavailable"}
            </span>
          )}
          <button onClick={() => { window.dispatchEvent(new Event("vibe:sync")); setOpen((o) => !o); }} className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white transition-transform hover:scale-[1.03]" style={{ background: BLUE }}>
            <TerminalSquare size={16} />
            {open ? "Hide adk web" : "Open adk web"}
          </button>
        </div>
      </div>

      {figure && <div className="mt-5 overflow-x-auto rounded-2xl border border-hairline bg-card p-4">{figure}</div>}

      <ol className="mt-5 grid gap-3 md:grid-cols-3">
        <Instruction n={1} title="Send your idea in the chat box">
          <input value={idea} onChange={(e) => setIdea(e.target.value)} className="mt-2 w-full rounded-lg border border-hairline bg-input px-3 py-2 font-mono text-xs text-fg" placeholder={DEFAULT_IDEA} />
          <CopyLine text={idea.trim() || DEFAULT_IDEA} />
        </Instruction>
        <Instruction n={2} title={stepTitles?.[0] ?? "Watch the run"}>
          <p className="mt-2 text-xs text-fg-muted">{steps[0]}</p>
        </Instruction>
        <Instruction n={3} title={stepTitles?.[1] ?? "Then"}>
          <p className="mt-2 text-xs text-fg-muted">{steps[1]}</p>
          {copy2 && <CopyLine text={copy2} />}
        </Instruction>
      </ol>

      {sends && sends.length > 0 && (
        <div className="mt-4 rounded-2xl border border-hairline bg-card p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-fg-muted">
              Or let the page send it: each button opens a <b className="text-fg">new session</b> in adk web and sends the message exactly as you would type it.
            </p>
            <div className="flex shrink-0 flex-wrap gap-2">
              {sends.map((sd) => (
                <button
                  key={sd.label}
                  onClick={() => send(sd.message)}
                  disabled={sending || !(inspector?.up ?? true)}
                  className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold text-white transition-transform hover:scale-[1.03] disabled:opacity-60 disabled:hover:scale-100"
                  style={{ background: BLUE }}
                  title={sd.message}
                >
                  {sending ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
                  {sd.label}
                </button>
              ))}
            </div>
          </div>
          {(sent || sendError) && (
            <p className="mt-3 break-words font-mono text-[11px]" style={{ color: sendError || sent?.status === "error" ? "var(--vibe-red)" : sent?.status === "done" ? GREEN : "var(--fg-muted)" }}>
              {sendError ? sendError : sent ? (
                <>
                  {sent.status === "running" ? "running" : sent.status} · "{sent.message}" · session {sent.session.slice(0, 8)}
                  {sent.trail.length ? ` · ${sent.trail.join(" → ")}` : ""}
                  {sent.routes.length ? ` · ${sent.routes.join(", ")}` : ""}
                  {sent.error ? ` · ${sent.error}` : ""}
                  {sent.status === "done" ? " · the verify rows below have it" : ""}
                </>
              ) : null}
            </p>
          )}
        </div>
      )}

      {open && (
        <div className="mt-5 overflow-hidden rounded-2xl border border-hairline bg-card">
          <div className="flex items-center justify-between gap-4 border-b border-hairline bg-overlay px-3 py-1.5 font-mono text-[11px] text-fg-muted">
            <div className="flex min-w-0 items-center gap-3">
              <span className="shrink-0">{url}</span>
              <span className="shrink-0 opacity-50">·</span>
              <LoadedBadge key={frameKey} app={app} onReload={() => setReloadN((n) => n + 1)} />
            </div>
            <a href={url} target="_blank" rel="noreferrer" className="flex shrink-0 items-center gap-1 hover:text-fg">
              open in a new tab <ExternalLink size={12} />
            </a>
          </div>
          <iframe
            key={frameKey}
            title="adk web"
            src={url}
            className="h-[680px] w-full bg-[#1e1e1e]"
            onLoad={() => {
              // A reloaded frame: the dev UI focuses its chat box while it boots, and the
              // browser scrolls this page to it. Wait for that scroll (or four seconds),
              // then put the panel back at the top of the view.
              if (!frame) return;
              const y0 = window.scrollY;
              const t0 = Date.now();
              const id = setInterval(() => {
                if (Math.abs(window.scrollY - y0) < 40 && Date.now() - t0 < 4000) return;
                clearInterval(id);
                const el = document.getElementById(`run-${app}`);
                if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 170 });
              }, 100);
            }}
          />
        </div>
      )}
    </section>
  );
}

export function VerifyPanel({ checking, onCheck, intro, title = "Execution verification.", children }: { checking: boolean; onCheck: () => void; intro: string; title?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-hairline bg-card p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-fg-muted">Verify</p>
          <h2 className="font-display mt-2 text-2xl">{title}</h2>
          <p className="mt-2 max-w-2xl text-sm text-fg-muted">{intro}</p>
        </div>
        <button onClick={onCheck} className="flex items-center gap-2 rounded-xl border border-hairline bg-overlay px-4 py-2 font-mono text-xs text-fg-muted hover:text-fg">
          <RefreshCw size={13} className={checking ? "animate-spin" : ""} /> Check again
        </button>
      </div>
      <ul className="mt-5 grid gap-2 md:grid-cols-2">{children}</ul>
    </section>
  );
}


function Instruction({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="rounded-2xl border border-hairline bg-card p-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span className="flex h-6 w-6 items-center justify-center rounded-full font-mono text-[11px] font-bold text-white" style={{ background: BLUE }}>
          {n}
        </span>
        {title}
      </div>
      {children}
    </li>
  );
}

function CopyLine({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      className="mt-2 flex w-full items-center justify-between gap-2 rounded-lg border border-hairline bg-input px-3 py-2 text-left font-mono text-xs text-fg hover:border-vibe-cyan/60"
      title="Copy"
    >
      <span className="truncate">{text}</span>
      {copied ? <Check size={13} className="shrink-0 text-vibe-green" /> : <Copy size={13} className="shrink-0 text-fg-muted" />}
    </button>
  );
}

export function CheckRow({ ok, label, tone = "good", children }: { ok: boolean; label: string; tone?: "good" | "warn"; children: React.ReactNode }) {
  const color = ok ? (tone === "warn" ? AMBER : GREEN) : "var(--fg-muted)";
  return (
    <li className="flex items-start gap-3 rounded-2xl border border-hairline bg-overlay p-3">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border" style={{ borderColor: color, color, background: ok ? tint(color, 0.1) : "transparent" }}>
        {ok ? <Check size={13} /> : <X size={12} className="opacity-40" />}
      </span>
      <div>
        <div className="text-sm font-semibold">{label}</div>
        <div className="text-xs text-fg-muted">{children}</div>
      </div>
    </li>
  );
}
