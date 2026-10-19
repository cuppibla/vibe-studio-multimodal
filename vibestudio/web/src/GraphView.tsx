import { useEffect, useState } from "react";
import { api } from "./lib/api";
import type { GraphInfo, RunState } from "./lib/types";

// The graph snakes: the first row runs left to right, drops at the gate, the
// second row runs back right to left, and so on. COLS layers per row.
const COLS = 5;
const COL = 200;
const STACK = 84;
const W = 160;
const H = 34;
const PAD = 26;
const KIND_LABEL: Record<string, string> = {
  start: "",
  function: "function",
  join: "join",
  agent: "agent",
  task: "agent (mode: task)",
  human: "your pick",
  router: "router",
  desk: "long-running tool",
  poster: "the image model",
};

/** The workflow, drawn from the server's description of wf.graph. Finished
 *  nodes turn green, the node the Runner is in pulses, a paused node is amber. */
export function GraphView({ state }: { state: RunState }) {
  const [graph, setGraph] = useState<GraphInfo | null>(null);
  useEffect(() => {
    api.graph().then(setGraph).catch(() => setGraph(null));
  }, []);
  if (!graph) return <div className="note">loading the graph…</div>;

  // rows: how tall each snake row is (its tallest stack)
  const rowOf = (layer: number) => Math.floor(layer / COLS);
  const colOf = (layer: number) => (rowOf(layer) % 2 === 0 ? layer % COLS : COLS - 1 - (layer % COLS));
  const rows = Math.max(...graph.nodes.map((n) => rowOf(n.layer))) + 1;
  const stackOf = Array.from({ length: rows }, (_, r) => Math.max(1, ...graph.nodes.filter((n) => rowOf(n.layer) === r).map((n) => n.rows)));
  const rowTop: number[] = [];
  let y = PAD;
  for (let r = 0; r < rows; r++) {
    rowTop.push(y);
    y += stackOf[r] * STACK + 34;
  }
  const height = y;
  const width = PAD * 2 + COLS * COL - (COL - W);
  const pos = new Map<string, { x: number; y: number }>();
  for (const n of graph.nodes) {
    const r = rowOf(n.layer);
    const mid = rowTop[r] + (stackOf[r] * STACK) / 2;
    pos.set(n.name, { x: PAD + W / 2 + colOf(n.layer) * COL, y: mid + (n.row - (n.rows - 1) / 2) * STACK });
  }
  const layerOf = new Map(graph.nodes.map((n) => [n.name, n.layer]));
  const done = new Set(state.nodes_seen.filter((n) => n !== state.active || state.status === "done"));
  const started = state.status !== "idle";
  const paused = state.status === "waiting_pick" || state.status === "rendering";
  const cls = (name: string) => {
    if (state.status === "failed" && name === state.active) return "node failed";
    if (name === state.active && state.status !== "done") return paused ? "node wait" : "node active";
    if (done.has(name) || (name === "__START__" && started)) return "node done";
    return "node";
  };
  const edgeCls = (from: string, to: string) => {
    const a = done.has(from) || (from === "__START__" && started);
    if (a && (done.has(to) || to === state.active)) return "edge done";
    if (a && started) return "edge lit";
    return "edge";
  };
  const edgePath = (from: string, to: string) => {
    const A = pos.get(from)!;
    const B = pos.get(to)!;
    const la = layerOf.get(from)!;
    const lb = layerOf.get(to)!;
    if (lb < la) {
      // a back-edge (script_check's REVISE): over the top of both nodes
      const y1 = A.y - H / 2;
      const y2 = B.y - H / 2;
      const lift = Math.min(y1, y2) - 30;
      return `M${A.x} ${y1} C ${A.x} ${lift}, ${B.x} ${lift}, ${B.x} ${y2}`;
    }
    if (rowOf(la) !== rowOf(lb)) {
      // a row change: leave the bottom of A, arrive at the top of B
      const x1 = A.x;
      const y1 = from === "__START__" ? A.y + 14 : A.y + H / 2;
      const x2 = B.x;
      const y2 = B.y - H / 2;
      return x1 === x2 ? `M${x1} ${y1} L${x2} ${y2}` : `M${x1} ${y1} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}`;
    }
    if (A.x === B.x) {
      // stacked in one column (quarantine below scripter): straight up or down
      const up = B.y < A.y;
      return `M${A.x} ${A.y + (up ? -H / 2 : H / 2)} L${B.x} ${B.y + (up ? H / 2 : -H / 2)}`;
    }
    const dir = rowOf(la) % 2 === 0 ? 1 : -1; // rightward or leftward row
    const x1 = from === "__START__" ? A.x + 14 * dir : A.x + (W / 2) * dir;
    const x2 = B.x - (W / 2) * dir;
    return A.y === B.y ? `M${x1} ${A.y} L${x2} ${B.y}` : `M${x1} ${A.y} C ${x1 + 34 * dir} ${A.y}, ${x2 - 34 * dir} ${B.y}, ${x2} ${B.y}`;
  };
  const edgeLabel = (from: string, route: string | null) => (route ? route : from === "quarantine" ? "cleaned" : "");
  // a node fed from the node below it (scripter, from quarantine) wears its kind label on top
  const labelAbove = new Set(graph.edges.filter((e) => pos.get(e.from)!.x === pos.get(e.to)!.x && pos.get(e.from)!.y > pos.get(e.to)!.y).map((e) => e.to));

  return (
    <div className="scroll">
      <svg className="graph" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`The workflow ${graph.name}: ${graph.nodes.length} nodes, ${graph.edges.length} edges.`}>
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0 0L10 5 0 10z" fill="#7b8794" />
          </marker>
        </defs>
        {graph.edges.map((e) => {
          const A = pos.get(e.from)!;
          const B = pos.get(e.to)!;
          const label = edgeLabel(e.from, e.route);
          const back = layerOf.get(e.from)! > layerOf.get(e.to)!;
          return (
            <g key={`${e.from}-${e.to}`}>
              <path className={edgeCls(e.from, e.to)} d={edgePath(e.from, e.to)} markerEnd="url(#arrow)" strokeDasharray={e.from === "quarantine" || back ? "5 4" : undefined} />
              {label && (
                <text x={(A.x + B.x) / 2 + (A.x === B.x ? 10 : 0)} y={back ? Math.min(A.y, B.y) - H / 2 - 24 : (A.y + B.y) / 2 + (A.x === B.x ? 12 : -7)} fontSize="10" fontFamily="var(--font-mono)" fill={label === "BLOCK" ? "var(--red)" : label === "OK" ? "var(--green)" : label === "REVISE" ? "var(--amber)" : "var(--purple)"} textAnchor={A.x === B.x ? "start" : "middle"}>
                  {label}
                </text>
              )}
            </g>
          );
        })}
        {graph.nodes.map((n) => {
          const p = pos.get(n.name)!;
          const c = cls(n.name);
          const pulsing = c === "node active" || c === "node wait";
          if (n.kind === "start") {
            return (
              <g key={n.name} className={c}>
                <circle cx={p.x} cy={p.y} r={15} fill="var(--overlay)" stroke={started ? "var(--green)" : "var(--fg-muted)"} strokeOpacity={started ? 1 : 0.5} />
                <text x={p.x} y={p.y + 4} textAnchor="middle" style={{ fontSize: 10 }}>
                  START
                </text>
              </g>
            );
          }
          return (
            <g key={n.name} className={c} transform={`translate(${p.x - W / 2} ${p.y - H / 2})`}>
              {pulsing && <rect className={`halo${c === "node wait" ? " amber" : ""}`} x={-4} y={-4} width={W + 8} height={H + 8} rx={12} />}
              <rect width={W} height={H} rx={9} />
              <text x={W / 2} y={20} textAnchor="middle">
                {n.name}
              </text>
              <text className="kind" x={W / 2} y={labelAbove.has(n.name) ? -8 : H + 13} textAnchor="middle">
                {KIND_LABEL[n.kind]}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
