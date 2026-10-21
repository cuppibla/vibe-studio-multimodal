import { Lede } from "../components/Lede";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Play, RefreshCw } from "lucide-react";
import { In, StepHeader } from "../components/shared";
import { DoneBanner } from "../components/DoneBanner";
import { LoadCheck } from "../components/LoadCheck";
import { api, useRunEvents } from "../lib/api";
import type { AudienceGrid, AudienceItem, RagCorpus, Stage5Status } from "../lib/types";
import { Fold } from "../components/Fold";
import { COLORS, tint } from "./colors";
import { CheckRow, EditPanel, RunPanel, VerifyPanel } from "./FanOut";

/*
 * Session 4a and 4b, composed by steps/Ingestion.tsx:
 *   TheCorpus  4a  what the audience sent (comments, voice notes, photos, clips) as a
 *                  grid; one reader per kind turns each file into one line of text;
 *                  the ingest command; the INGEST_READERS edit; RAG Engine as the
 *                  reference (meaning in, meaning out; the three stores; the platform)
 *   TheReader  4b  the third reader: read_feedback is already in the fan-out; the one
 *                  edit hands the media back with the passages (RAG_MEDIA); run, and
 *                  watch the candidates cite things that were heard or seen
 */

const CYAN = COLORS.cyan;
const PURPLE = COLORS.purple;
const AMBER = COLORS.amber;
const GREEN = COLORS.green;
const RED = COLORS.red;

function SourceToggle({ path, label }: { path: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const toggle = async () => {
    if (!open && code === null) {
      try {
        setCode((await api.getCode(path)).content);
      } catch {
        setCode(`could not read ${path}`);
      }
    }
    setOpen((o) => !o);
  };
  return (
    <div className="mt-4 min-w-0 flex-1 basis-[320px]">
      <button onClick={toggle} className="rounded-xl border border-hairline bg-overlay px-4 py-2 text-left font-mono text-xs text-fg-muted hover:text-fg">
        {open ? "Hide the code" : "Show the code"} · {label}
      </button>
      {open && (
        <div className="mt-3 overflow-hidden rounded-2xl border border-hairline bg-input">
          <div className="border-b border-hairline px-4 py-1.5 font-mono text-[10px] uppercase tracking-wider text-fg-muted">{label}</div>
          <pre className="max-h-[520px] overflow-auto px-4 py-3 font-mono text-[11px] leading-relaxed text-fg">
            <code>{code ?? "…"}</code>
          </pre>
        </div>
      )}
    </div>
  );
}

const mono = { fontFamily: "var(--font-mono)" } as const;

/* ───────────────────────── the figure: meaning in, meaning out ───────────────────────── */

const STAGES = [
  { key: "docs", title: "the lines", sub: "comments · voice · photos · clips", color: AMBER },
  { key: "chunk", title: "chunk", sub: "into passages", color: "currentColor" },
  { key: "embed", title: "the model", sub: "text-embedding-005", color: PURPLE },
  { key: "store", title: "vector store", sub: "nearby = similar meaning", color: GREEN },
];
const ARROWS = ["split", "embed", "store"];
// the store's dots: three loose clusters (animals, gadgets, fantasy) and a few strays
const DOTS: { x: number; y: number; c: string }[] = [
  { x: 24, y: 30, c: AMBER }, { x: 34, y: 22, c: AMBER }, { x: 40, y: 36, c: AMBER }, { x: 28, y: 42, c: AMBER },
  { x: 92, y: 24, c: PURPLE }, { x: 104, y: 30, c: PURPLE }, { x: 98, y: 40, c: PURPLE },
  { x: 62, y: 66, c: GREEN }, { x: 74, y: 60, c: GREEN }, { x: 70, y: 74, c: GREEN }, { x: 82, y: 70, c: GREEN },
  { x: 116, y: 62, c: "currentColor" }, { x: 46, y: 58, c: "currentColor" }, { x: 12, y: 70, c: "currentColor" },
];
const QUERY = "cozy little hauntings at home";
const NEAREST = ["small magic in small rooms, please more", "the bat hugging the bulb like a pillow", "heard: \"the ghost is a paper cup\""];

/** Indexing: a document is split into passages, each passage is embedded into a
 *  vector, the vectors land in the store. Asking: the question takes the same
 *  path and comes back with the passages whose vectors sit nearest to it. */
function MeaningFigure() {
  const [asking, setAsking] = useState(false);
  const loop = { repeat: Infinity, repeatDelay: 0.8 };
  const tileX = (i: number) => 20 + i * 190;
  return (
    <figure className="m-0">
      <div className="overflow-x-auto">
        <svg viewBox="0 0 760 330" className="h-auto w-full min-w-[640px] text-fg" role="img" aria-label="The docs are split into passages, each passage is embedded into a vector by text-embedding-005 and stored; a question is embedded the same way and the nearest passages come back.">
          <defs>
            <marker id="rag-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" fill="currentColor" />
            </marker>
          </defs>
          <text x="380" y="18" textAnchor="middle" fontSize="9.5" letterSpacing="3" style={mono} fill={CYAN}>RAG · MEANING IN, MEANING OUT</text>
          {STAGES.map((s, i) => {
            const x = tileX(i);
            return (
              <g key={s.key}>
                <motion.rect x={x} y={36} width={150} height={112} rx={14} fill="var(--overlay)" stroke={s.color === "currentColor" ? "var(--hairline)" : s.color} strokeWidth={1.3} initial={{ strokeOpacity: 0.5 }} animate={asking ? { strokeOpacity: 0.5 } : { strokeOpacity: [0.5, 1, 0.5] }} transition={{ duration: 3.2, delay: i * 0.8, ...loop }} />
                {s.key === "docs" && (
                  <g transform={`translate(${x + 45} 56)`}>
                    <rect width="60" height="70" rx="6" fill="var(--card)" stroke="currentColor" strokeOpacity="0.45" />
                    {[0, 1, 2, 3, 4].map((k) => <rect key={k} x="10" y={12 + k * 11} width={k === 4 ? 24 : 40} height="3" rx="1.5" fill={AMBER} opacity="0.7" />)}
                  </g>
                )}
                {s.key === "chunk" && (
                  <g transform={`translate(${x + 25} 58)`}>
                    {[0, 1, 2].map((k) => (
                      <motion.g key={k} initial={{ opacity: 0.35 }} animate={asking ? { opacity: 0.9 } : { opacity: [0.35, 1, 0.35] }} transition={{ duration: 3.2, delay: 0.8 + k * 0.25, ...loop }}>
                        <rect y={k * 24} width="100" height="18" rx="5" fill="var(--card)" stroke="currentColor" strokeOpacity="0.45" />
                        <rect x="8" y={k * 24 + 7} width={64 - k * 12} height="3" rx="1.5" fill="currentColor" opacity="0.5" />
                      </motion.g>
                    ))}
                  </g>
                )}
                {s.key === "embed" && (
                  <g transform={`translate(${x + 75} 96)`}>
                    <text textAnchor="middle" y="-16" fontSize="11" style={mono} fill={PURPLE}>[0.12, −0.44, …]</text>
                    {[0, 1, 2, 3, 4, 5, 6].map((k) => (
                      <motion.rect key={k} x={-24 + k * 8} width="5" rx="1.5" fill={PURPLE} initial={{ y: -2, height: 6 }} animate={asking ? { y: -6 - (k % 3) * 3, height: 12 + (k % 3) * 4 } : { y: [-2, -8 - (k % 3) * 3, -2], height: [6, 16 + (k % 3) * 4, 6] }} transition={{ duration: 1.4, delay: 1.7 + k * 0.08, ...loop }} />
                    ))}
                    <text textAnchor="middle" y="38" fontSize="8.5" style={mono} fill="currentColor" opacity="0.6">one vector per passage</text>
                  </g>
                )}
                {s.key === "store" && (
                  <g transform={`translate(${x + 10} 50)`}>
                    <polygon points="10,80 60,10 130,10 80,80" fill={tint(GREEN, 0.05)} stroke={GREEN} strokeOpacity="0.4" />
                    <path d="M28 55 L 100 55 M45 32 L 115 32 M38 10 L 60 80 M88 10 L 110 80" stroke={GREEN} strokeOpacity="0.2" strokeWidth="0.8" />
                    {DOTS.map((d, k) => {
                      const near = asking && k >= 7 && k <= 10;
                      return <motion.circle key={k} cx={d.x} cy={d.y} r={near ? 4 : 3} fill={d.c} initial={{ opacity: 0.5 }} animate={asking ? { opacity: near ? 1 : 0.3 } : { opacity: [0.5, 0.95, 0.5] }} transition={{ duration: 2.4, delay: 2.4 + k * 0.05, ...loop }} />;
                    })}
                    {asking && (
                      <g>
                        {[7, 8, 9].map((k) => <motion.line key={k} x1={72} y1={68} x2={DOTS[k].x} y2={DOTS[k].y} stroke={CYAN} strokeWidth="1" initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 0.9 }} transition={{ duration: 0.5, delay: 2.2 + (k - 7) * 0.15 }} />)}
                        <motion.circle cx={72} cy={68} r={5} fill={CYAN} stroke="var(--card)" strokeWidth="1.5" initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 2.0, duration: 0.4 }} style={{ transformOrigin: "72px 68px" }} />
                      </g>
                    )}
                  </g>
                )}
                <text x={x + 75} y={168} textAnchor="middle" fontSize="11.5" fontWeight="600" style={mono} fill={s.color === "currentColor" ? "currentColor" : s.color}>{s.title}</text>
                <text x={x + 75} y={183} textAnchor="middle" fontSize="9" style={mono} fill="currentColor" opacity="0.6">{s.sub}</text>
                {i < 3 && (
                  <g>
                    <line x1={x + 154} y1={92} x2={x + 186} y2={92} stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.2" markerEnd="url(#rag-arrow)" />
                    <text x={x + 170} y={84} textAnchor="middle" fontSize="8.5" style={mono} fill="currentColor" opacity="0.7">{ARROWS[i]}</text>
                  </g>
                )}
              </g>
            );
          })}
          {!asking && <motion.circle r="5" fill={CYAN} initial={{ cx: 95, cy: 92, opacity: 0 }} animate={{ cx: [95, 170, 285, 360, 475, 550, 665], opacity: [0, 1, 1, 1, 1, 1, 0] }} transition={{ duration: 3.2, ease: "easeInOut", ...loop }} />}

          {/* asking: the question takes the same path */}
          <AnimatePresence>
            {asking && (
              <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <rect x="20" y="214" width="720" height="100" rx="14" fill={tint(CYAN, 0.05)} stroke={CYAN} strokeOpacity="0.35" />
                <text x="36" y="232" fontSize="9" letterSpacing="2" style={mono} fill={CYAN}>ASK IT SOMETHING</text>
                <motion.g initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
                  <rect x="36" y="244" width="200" height="28" rx="14" fill="var(--card)" stroke={CYAN} strokeOpacity="0.6" />
                  <text x="136" y="262" textAnchor="middle" fontSize="10.5" style={mono} fill="currentColor">“{QUERY}”</text>
                </motion.g>
                <motion.line x1="240" y1="258" x2="272" y2="258" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.2" markerEnd="url(#rag-arrow)" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.6, duration: 0.4 }} />
                <text x="256" y="250" textAnchor="middle" fontSize="8.5" style={mono} fill="currentColor" opacity="0.7">embed</text>
                <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.0 }}>
                  <rect x="276" y="244" width="120" height="28" rx="8" fill="var(--card)" stroke={PURPLE} strokeOpacity="0.6" />
                  <text x="336" y="262" textAnchor="middle" fontSize="10" style={mono} fill={PURPLE}>[0.10, −0.41, …]</text>
                </motion.g>
                <motion.line x1="400" y1="258" x2="432" y2="258" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.2" markerEnd="url(#rag-arrow)" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 1.5, duration: 0.4 }} />
                <text x="416" y="250" textAnchor="middle" fontSize="8.5" style={mono} fill="currentColor" opacity="0.7">nearest</text>
                <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.0 }}>
                  <text x="440" y="250" fontSize="9.5" style={mono} fill={GREEN}>Three passages, by distance</text>
                  {NEAREST.map((t, k) => (
                    <motion.text key={t} x="440" y={266 + k * 15} fontSize="10" style={mono} fill="currentColor" initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 2.3 + k * 0.25 }}>
                      <tspan fill={GREEN}>✓ </tspan>{t}
                    </motion.text>
                  ))}
                </motion.g>
              </motion.g>
            )}
          </AnimatePresence>
        </svg>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button onClick={() => setAsking((a) => !a)} className="rounded-full border px-4 py-1.5 font-mono text-xs" style={{ borderColor: tint(CYAN, 0.53), color: CYAN, background: asking ? tint(CYAN, 0.09) : "transparent" }}>
          {asking ? "◼ Back to indexing" : "▶ Ask it something"}
        </button>
        <figcaption className="text-xs text-fg-muted">
          {asking
            ? "Nearby vectors mean similar meaning, so the sock-drawer comment comes back for a question that never says sock or drawer."
            : "Indexing splits the file into passages, embeds each passage into a vector, and stores the vectors. Vector proximity corresponds to semantic similarity."}
        </figcaption>
      </div>
    </figure>
  );
}

/* ───────────────────────── the console runner ───────────────────────── */

type RagCmd = "connect" | "audience" | "query";
const RAG_LINE: Record<RagCmd, string> = {
  connect: "python -m agent.platform.rag",
  audience: "python -m agent.platform.rag load --audience",
  query: "python -m agent.platform.rag query",
};
/** What each command left behind, said when it finishes; the ingest reads its own output. */
function ragDone(cmd: RagCmd, lines: string[]): string {
  if (cmd === "connect") return "The corpus exists in your project and this lab is connected to it. Next, ingest what the audience sent.";
  if (cmd === "query") return "Those are the passages nearest to your question, closest first. A line that names a file is a voice note, a photo, a clip or a poster.";
  const text = lines.join("\n");
  if (/not read \(no reader wired/.test(text)) {
    return "Only the comments and the posters' captions went in: voice, photo and clip have no reader wired. Delete the \"# \" in READERS (the edit below) and ingest again.";
  }
  return "Every kind was read into the same line shape and indexed. Scroll up: each card shows what Gemini heard or saw. Then ask the corpus a question.";
}

const RAG_COMMANDS: { cmd: RagCmd; line: string; what: string }[] = [
  { cmd: "connect", line: RAG_LINE.connect, what: "Creates the corpus in your project, once, with text-embedding-005 as its embedding model. Runs again as connect." },
  { cmd: "audience", line: RAG_LINE.audience, what: "Runs every reader in audience.READERS, then uploads what they wrote with the comments and the posters' captions. Each file is split into passages, embedded and stored. As shipped only the comments are read." },
  { cmd: "query", line: `${RAG_LINE.query} "${QUERY}"`, what: "Embeds the question and returns the five passages nearest to it, with their distance. Lower is closer." },
];

/** "Ingest again", placed where the student is when they need it (after the edit,
 *  in a verify row): asks the console above to run the audience command. */
function IngestButton({ label = "Ingest again", small = false }: { label?: string; small?: boolean }) {
  return (
    <button
      onClick={() => window.dispatchEvent(new CustomEvent("vibe:rag", { detail: { cmd: "audience" } }))}
      className={small
        ? "ml-1 inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[10px] font-bold text-white align-middle"
        : "flex shrink-0 items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white transition-transform hover:scale-[1.03]"}
      style={{ background: CYAN }}
    >
      <Play size={small ? 10 : 15} />
      {label}
    </button>
  );
}

/** The corpus commands, run here as the same `python -m agent.platform.rag` process a
 *  terminal would start. Output streams in as it is printed. */
function RagRunner({ onDone }: { onDone: () => void }) {
  const [lines, setLines] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState<RagCmd | null>(null);
  const [exit, setExit] = useState<number | null>(null);
  const runId = useRef<string | null>(null);  // the token the server minted for this run
  const waitedFor = useRef(0);        // polls spent without the server admitting to a run
  const seenRunning = useRef(false);  // the worker was observed live at least once
  const [overlay, setOverlay] = useState<RagCmd | null>(null);
  const [query, setQuery] = useState(QUERY);
  useRunEvents((verb, line) => {
    if (verb === "rag") setLines((l) => [...l.slice(-199), line]);
  });
  useEffect(() => {
    api.ragStatus().then((st) => {
      if (st.running) {
        // a command started elsewhere: any exit that follows is its own
        runId.current = null;
        seenRunning.current = true;
        setRunning(true);
        setLines(["a rag command is already running on this server; its remaining output appears here"]);
      }
    });
  }, []);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(async () => {
      const st = await api.ragStatus();
      if (st.running) {
        seenRunning.current = true;
        waitedFor.current = 0;
        return;
      }
      // Finish on the server's own word, never on a clock. The page's clock and
      // the server's are two different machines in Cloud Shell, so a comparison
      // of timestamps calls a running command finished. The exit record has to
      // name the run this page started.
      const mine = runId.current;
      if (mine) {
        if (st.last_exit?.run !== mine) {
          // Either the worker has not registered yet or it is still going.
          if (++waitedFor.current > 120) {
            setRunning(false);
            setLines((l) => [...l, `lost track of the command · read runs/rag_run.log`]);
          }
          return;
        }
      } else if (!seenRunning.current) {
        return;                                    // watching someone else's run
      }
      setRunning(false);
      setExit(st.last_exit?.code ?? null);
      // The stream can be held back by a proxy, so take the whole output from
      // the log the worker wrote rather than trusting what arrived live.
      try {
        const log = await api.workerLog("rag");
        if (log.lines.length) setLines(log.lines);
      } catch {
        /* the live lines are all there is */
      }
      onDone();
    }, 1500);
    return () => clearInterval(t);
  }, [running, onDone]);
  const run = async (cmd: RagCmd) => {
    setLines([]);
    setExit(null);
    setOverlay(cmd);   // every command opens a window: a click has to show something
    let r: { ok: boolean; detail: string; run?: string };
    try {
      r = (await api.ragRun(cmd, cmd === "query" ? query : undefined)) as { ok: boolean; detail: string; run?: string };
    } catch (e) {
      // a failed request used to reject inside the click handler, so the page
      // showed nothing at all and the button looked dead
      setLines([`could not reach the learning center: ${(e as Error).message}`,
                "Is it still running? Its log is runs/lab.log; scripts/start.sh starts it again."]);
      setExit(1);
      setRunning(false);
      return;
    }
    if (!r.ok) {
      setLines([`could not start: ${r.detail}. Wait for it to finish; the buttons enable again when it exits.`]);
      // refused because another worker is live: watch that one instead
      runId.current = null;
      seenRunning.current = true;
      setRunning(true);
      return;
    }
    runId.current = r.run ?? null;
    seenRunning.current = false;
    waitedFor.current = 0;
    setRunning(true);
  };
  // Buttons elsewhere on the page (after the edit, in the verify rows) ask for a
  // command by name; the console scrolls into view and runs it as its own click would.
  useEffect(() => {
    const onAsk = (ev: Event) => {
      const cmd = (ev as CustomEvent<{ cmd: RagCmd }>).detail?.cmd;
      if (!cmd || running) return;
      document.getElementById("rag-console")?.scrollIntoView({ behavior: "smooth", block: "center" });
      void run(cmd);
    };
    window.addEventListener("vibe:rag", onAsk);
    return () => window.removeEventListener("vibe:rag", onAsk);
  }, [running, query]); // eslint-disable-line react-hooks/exhaustive-deps
  const lineFor = (c: (typeof RAG_COMMANDS)[number]) => (c.cmd === "query" ? `python -m agent.platform.rag query "${query}"` : c.line);
  return (
    <>
        {overlay && <RagOverlay cmd={overlay} lines={lines} running={running} exit={exit} onClose={() => setOverlay(null)} />}
      <ol id="rag-console" className="mt-4 grid gap-3 md:grid-cols-3">
        {RAG_COMMANDS.map((c) => (
          <li key={c.cmd} className="rounded-2xl border border-hairline bg-overlay p-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(lineFor(c));
                  setCopied(c.cmd);
                  setTimeout(() => setCopied(null), 1200);
                }}
                className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-lg border border-hairline bg-input px-3 py-2 text-left font-mono text-xs text-fg hover:border-vibe-cyan/60"
                title="copy for a terminal"
              >
                <span className="truncate">{lineFor(c)}</span>
                <span className="shrink-0 text-[10px] text-fg-muted">{copied === c.cmd ? "copied" : "copy"}</span>
              </button>
              <button onClick={() => run(c.cmd)} disabled={running} className="shrink-0 rounded-lg px-3 py-2 font-mono text-xs font-bold text-white disabled:opacity-40" style={{ background: CYAN }}>
                run
              </button>
            </div>
            {c.cmd === "query" && (
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="mt-2 w-full rounded-lg border border-hairline bg-input px-3 py-1.5 font-mono text-xs text-fg outline-none focus:border-vibe-cyan/60"
                placeholder="a question for the corpus"
                aria-label="query text"
              />
            )}
            <p className="mt-2 text-xs text-fg-muted">{c.what}</p>
          </li>
        ))}
      </ol>
      {(lines.length > 0 || running) && (
        <div className="mt-4 overflow-hidden rounded-2xl border border-hairline bg-input">
          <div className="flex items-center justify-between border-b border-hairline px-4 py-1.5 font-mono text-[10px] uppercase tracking-wider text-fg-muted">
            <span>python -m agent.platform.rag · output</span>
            <span>{running ? "running…" : exit === 0 ? "done" : exit === null ? "" : `exit ${exit}`}</span>
          </div>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap px-4 py-3 font-mono text-[11px] leading-relaxed text-fg">
            {lines.filter((l) => !/Warning|warn\(/.test(l)).join("\n") || (running ? "starting…" : "")}
          </pre>
        </div>
      )}
    </>
  );
}

/** A full-screen modal for the two long commands: the page stays put, the
 *  output streams in, and the animation shows what the command is doing on
 *  Google Cloud. Closes only once the process has exited. */
function RagOverlay({ cmd, lines, running, exit, onClose }: { cmd: RagCmd; lines: string[]; running: boolean; exit: number | null; onClose: () => void }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  const clean = lines.filter((l) => !/Warning|warn\(|automatic function calling/.test(l));
  const done = !running && exit !== null;
  const failed = done && exit !== 0;
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)" }} role="dialog" aria-modal="true" aria-label={cmd === "connect" ? "Creating the corpus" : "Loading the comments"}>
      <motion.div initial={{ y: 16, scale: 0.98 }} animate={{ y: 0, scale: 1 }} className="w-full max-w-3xl overflow-hidden rounded-3xl border border-hairline bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-hairline px-5 py-3">
          <div className="flex items-center gap-3">
            {!done && <RefreshCw size={14} className="animate-spin" style={{ color: CYAN }} />}
            <span className="font-mono text-xs text-fg">{RAG_LINE[cmd]}</span>
          </div>
          <span className="font-mono text-[11px]" style={{ color: failed ? RED : done ? GREEN : "var(--fg-muted)" }}>
            {done ? (failed ? `exited with ${exit}` : "done") : "running on this server…"}
          </span>
        </div>
        <div className="p-5">
          {cmd === "connect" ? (
            <CreateAnimation lines={clean} done={done} />
          ) : cmd === "audience" ? (
            <LoadAnimation lines={clean} done={done} />
          ) : (
            <Lede className="text-sm text-fg-muted">
              The question is embedded with the same model the passages were, and the nearest passages come back with their distance. The results panel below keeps them once you close this.
            </Lede>
          )}
        </div>
        <div className="border-t border-hairline bg-input">
          <div className="flex items-center justify-between border-b border-hairline px-4 py-1.5 font-mono text-[10px] uppercase tracking-wider text-fg-muted">
            <span>output</span>
            <span className="normal-case tracking-normal">the whole run is in runs/rag_run.log</span>
          </div>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap px-4 py-3 font-mono text-[11px] leading-relaxed text-fg">{clean.slice(-30).join("\n") || "starting… the first call to your project can take a few seconds"}</pre>
        </div>
        {done ? (
          <DoneBanner failed={failed} exit={exit} onClose={onClose} message={ragDone(cmd, clean)} />
        ) : (
          <div className="flex items-center justify-end gap-3 border-t border-hairline px-5 py-3">
            <span className="text-xs text-fg-muted">The page is locked until the command finishes.</span>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

/** `python -m agent.platform.rag`: a RAG Engine corpus appears in the project with an
 *  embedding model attached. The motion repeats while the command runs. */
function CreateAnimation({ lines, done }: { lines: string[]; done: boolean }) {
  const text = lines.join("\n");
  const created = /created|connected/.test(text);
  const serverless = /serverless/.test(text);
  const loop = done ? { repeat: 0 } : { repeat: Infinity, repeatDelay: 1.2 };
  return (
    <div>
      <Lede className="text-sm text-fg-muted">
        Creating a RAG Engine corpus in your project, with <code className="font-mono text-fg">text-embedding-005</code> as the model that turns
        passages and questions into vectors. The managed vector database is set to serverless first; a fresh project defaults to a provisioned mode
        that some regions cannot allocate. The first run takes about twenty seconds; every later run reconnects to the cached resource.
      </Lede>
      <svg viewBox="0 0 620 180" className="mt-3 h-auto w-full text-fg" role="img" aria-label="A RAG Engine corpus is created in the project and the text-embedding-005 model is attached to it.">
        <rect x="10" y="14" width="600" height="156" rx="16" fill="var(--overlay)" stroke="var(--hairline)" />
        <text x="26" y="36" fontSize="10" style={mono} fill="currentColor" opacity="0.6">GOOGLE CLOUD · your project · us-central1</text>
        <motion.g initial={{ opacity: 0.2, scale: 0.9 }} animate={done ? { opacity: 1, scale: 1 } : { opacity: [0.2, 1, 1, 0.2], scale: [0.9, 1, 1, 0.9] }} transition={{ duration: 3.6, ...loop }} style={{ transformOrigin: "140px 92px" }}>
          <rect x="40" y="52" width="200" height="80" rx="14" fill={tint(CYAN, 0.12)} stroke={created ? CYAN : "var(--hairline)"} strokeWidth={1.6} />
          <text x="140" y="80" textAnchor="middle" fontSize="12" style={mono} fill={CYAN}>RAG Engine · corpus</text>
          <text x="140" y="98" textAnchor="middle" fontSize="10" style={mono} fill="currentColor" opacity="0.7">{created ? "vibestudio-feedback" : "creating…"}</text>
          <text x="140" y="116" textAnchor="middle" fontSize="9" style={mono} fill="currentColor" opacity="0.55">{serverless ? "managed vector db · serverless" : "managed vector db"}</text>
        </motion.g>
        <motion.path d="M240 92 L 300 92" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.2" strokeDasharray="4 3" initial={{ pathLength: 0 }} animate={done ? { pathLength: 1 } : { pathLength: [0, 1, 1, 0] }} transition={{ duration: 3.6, delay: 0.6, ...loop }} />
        <motion.g initial={{ opacity: 0.2, y: 8 }} animate={done ? { opacity: 1, y: 0 } : { opacity: [0.2, 1, 1, 0.2], y: [8, 0, 0, 8] }} transition={{ duration: 3.6, delay: 1.0, ...loop }}>
          <rect x="304" y="66" width="200" height="52" rx="12" fill={tint(PURPLE, 0.12)} stroke={created ? PURPLE : "var(--hairline)"} strokeWidth={1.4} />
          <text x="404" y="87" textAnchor="middle" fontSize="11" style={mono} fill={PURPLE}>text-embedding-005</text>
          <text x="404" y="104" textAnchor="middle" fontSize="9" style={mono} fill="currentColor" opacity="0.6">embedding model · 768 dimensions</text>
        </motion.g>
        <text x="404" y="140" textAnchor="middle" fontSize="9.5" style={mono} fill="currentColor" opacity="0.6">the same model embeds every passage and every question</text>
      </svg>
    </div>
  );
}

/** `python -m agent.platform.rag load --audience`: every reader in READERS turns its
 *  kind into lines (Gemini listens, looks, watches), then each file is uploaded, split
 *  into passages, embedded and stored, and a probe query proves the index answers.
 *  Progress follows the output lines. */
function LoadAnimation({ lines, done }: { lines: string[]; done: boolean }) {
  const text = lines.join("\n");
  const m = text.match(/uploading comments\.md: (\d+) comments/);
  const n = m ? Number(m[1]) : 12;
  const heard = lines.filter((l) => /^\s*heard /.test(l)).length;
  const saw = lines.filter((l) => /^\s*saw /.test(l)).length;
  const watched = lines.filter((l) => /^\s*watched /.test(l)).length;
  const skipped = text.match(/not read \(no reader wired[^)]*\): ([a-z, ]+)/);
  const reading = /reading the audience's/.test(text);
  const uploading = /uploading/.test(text);
  const indexing = /indexing/.test(text);
  const indexed = /indexed:/.test(text) || /still building/.test(text);
  const replaced = /replaced the previous/.test(text);
  const stage = indexed ? 5 : indexing ? 4 : uploading ? 3 : reading ? 2 : 1;
  const loop = done ? { repeat: 0 } : { repeat: Infinity };
  const readSub = heard + saw + watched ? `heard ${heard} · saw ${saw} · watched ${watched}` : skipped ? `not read: ${skipped[1].trim()}` : "Gemini listens, looks, watches";
  const steps = [
    { name: "read", sub: readSub, color: skipped && !(heard + saw + watched) ? AMBER : PURPLE },
    { name: "upload", sub: `${n} comments + the lines`, color: AMBER },
    { name: "split", sub: "~120-token passages", color: "currentColor" },
    { name: "embed", sub: "text-embedding-005", color: PURPLE },
    { name: "store", sub: "nearby = similar", color: GREEN },
  ];
  return (
    <div>
      <Lede className="text-sm text-fg-muted">
        The readers run first: one line of text per voice note, photo and clip, each naming its file. Then one{" "}
        <code className="font-mono text-fg">upload_file</code> call per file. RAG Engine splits each into passages, embeds every passage with the corpus's
        model, and stores the vectors. The index answers a few seconds to two minutes after the upload; the command probes it with a query until it does.
        {replaced ? " A previous copy of each file was deleted first, so the passages are replaced, not doubled." : ""}
      </Lede>
      <svg viewBox="0 0 760 200" className="mt-3 h-auto w-full text-fg" role="img" aria-label="The readers turn voice, photos and clips into lines; the files are uploaded, split into passages, embedded and stored; a probe query proves the index answers">
        {steps.map((st, i) => {
          const x = 10 + i * 150;
          const active = stage === i + 1 && !done;
          const past = stage > i + 1 || done;
          const color = st.color === "currentColor" ? "currentColor" : st.color;
          return (
            <g key={st.name}>
              <motion.rect x={x} y={30} width={140} height={70} rx={12} fill={past || active ? tint(st.color, 0.1) : "var(--overlay)"} stroke={past || active ? color : "var(--hairline)"} strokeWidth={active ? 1.8 : 1.2} initial={{ opacity: 0.8 }} animate={active ? { opacity: [0.8, 1, 0.8] } : { opacity: 1 }} transition={{ duration: 1.4, ...loop }} />
              <text x={x + 70} y={56} textAnchor="middle" fontSize="12" style={mono} fill={past || active ? color : "currentColor"}>{st.name}</text>
              <text x={x + 70} y={74} textAnchor="middle" fontSize="8.5" style={mono} fill="currentColor" opacity="0.7">{st.sub}</text>
              <text x={x + 70} y={91} textAnchor="middle" fontSize="8.5" style={mono} fill={past ? GREEN : "currentColor"} opacity={past ? 1 : 0.5}>{past ? "done" : active ? "now" : "waiting"}</text>
              {i < 4 && <line x1={x + 142} y1={65} x2={x + 158} y2={65} stroke="currentColor" strokeOpacity="0.4" strokeWidth="1.2" />}
            </g>
          );
        })}
        {!done && <motion.circle r="4" fill={CYAN} initial={{ cx: 80, cy: 65, opacity: 0 }} animate={{ cx: [80, 230, 380, 530, 680], opacity: [0, 1, 1, 1, 0] }} transition={{ duration: 3.2, ease: "linear", repeat: Infinity, repeatDelay: 0.3 }} />}
        <text x="14" y="134" fontSize="10" style={mono} fill="currentColor" opacity="0.6">the probe query, until the index answers</text>
        <rect x="14" y="144" width="732" height="26" rx="8" fill="var(--overlay)" stroke="var(--hairline)" />
        <text x="26" y="161" fontSize="10" style={mono} fill="currentColor">“what viewers liked and what they complained about”</text>
        <text x="734" y="161" textAnchor="end" fontSize="10" style={mono} fill={indexed ? GREEN : "currentColor"} opacity={indexed ? 1 : 0.5}>{indexed ? "answered ✓" : "…"}</text>
        <rect x="14" y="184" width="732" height="8" rx="4" fill="var(--overlay)" stroke="var(--hairline)" />
        <motion.rect x="14" y="184" height="8" rx="4" fill={CYAN} initial={{ width: 0 }} animate={{ width: (732 * (done ? 5 : stage - 1 + 0.5)) / 5 }} transition={{ duration: 0.6 }} />
      </svg>
    </div>
  );
}

/** The corpus, fetched on demand: connected or not, and its files. */
function CorpusLedger({ refreshKey = 0 }: { refreshKey?: number }) {
  const [corpus, setCorpus] = useState<RagCorpus | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setFailed("");
    try {
      setCorpus(await api.labRag());
    } catch (e) {
      // a server error answers in plain text, so this used to leave the panel blank
      let why = (e as Error).message;
      try {
        const v = await api.version();
        if (v.stale) why += ` · this server is running ${v.running} but the checkout is at ${v.head}: run scripts/restart.sh`;
      } catch {
        /* the message stands on its own */
      }
      setFailed(why);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();          // on arrival too: a panel that says what is there must not start blank
  }, [refreshKey, load]);
  return (
    <section className="rounded-3xl border border-hairline bg-card p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-fg-muted">The corpus</p>
          <h2 className="font-display mt-2 text-2xl">What the corpus holds.</h2>
          <Lede className="mt-1 max-w-2xl text-sm text-fg-muted">Reads the corpus in your project, displaying the resource name and the files in it. Passages are not listed by the API; the query command shows them.</Lede>
        </div>
        <button onClick={load} className="flex items-center gap-2 rounded-xl border border-hairline bg-overlay px-4 py-2 font-mono text-xs text-fg-muted hover:text-fg">
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Show the corpus
        </button>
      </div>
      {failed && (
        <div className="mt-4 rounded-xl border p-3 font-mono text-[11.5px]" style={{ borderColor: tint(RED, 0.4), color: RED, background: tint(RED, 0.06) }}>
          {failed}
          <span className="mt-1 block opacity-80">the learning center's log is runs/lab.log</span>
        </div>
      )}
      {corpus && !failed && (
        <div className="mt-4 rounded-2xl border border-hairline bg-overlay p-4">
          {!corpus.connected ? (
            corpus.blocked ? (
              <p className="text-sm" style={{ color: AMBER }}>
                RAG Engine could not provision a corpus for this project right now: {corpus.blocked.split("\n")[0]}. The lab continues without audience feedback;
                run the first command again later.
              </p>
            ) : (
              <p className="text-sm text-fg-muted">No corpus yet. Run the first command above.</p>
            )
          ) : corpus.error ? (
            <p className="font-mono text-xs" style={{ color: RED }}>{corpus.error}</p>
          ) : (
            <>
              <p className="font-mono text-[11px] text-fg-muted">
                ragCorpora/{corpus.corpus?.split("/").slice(-1)[0]} · {corpus.files.length} file{corpus.files.length === 1 ? "" : "s"} · agent/comments.md has {corpus.comments} comments · {corpus.posters} past posters, {corpus.captions} captioned
              </p>
              <ul className="mt-3 space-y-2">
                {corpus.files.map((f) => (
                  <li key={f.id} className="text-sm">
                    <span className="rounded px-1.5 py-0.5 font-mono text-[10px]" style={{ background: tint(CYAN, 0.13), color: CYAN }}>
                      ragFile {f.id}
                    </span>
                    <span className="ml-2 font-mono text-xs">{f.display_name}</span>
                    {f.description && <span className="ml-2 text-fg-muted">{f.description}</span>}
                  </li>
                ))}
                {corpus.files.length === 0 && <li className="text-sm text-fg-muted">Empty. Run the load command.</li>}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}

/* ───────────────────────── 5c · the corpus ───────────────────────── */

const CODE_CORPUS = `# agent/platform/rag.py
corpus = rag.create_corpus(
    display_name="vibestudio-feedback",
    description="Vibe Studio: what the audience wrote under the channel's past videos.",
    backend_config=rag.RagVectorDbConfig(
        rag_embedding_model_config=rag.RagEmbeddingModelConfig(
            vertex_prediction_endpoint=rag.VertexPredictionEndpoint(
                publisher_model="publishers/google/models/text-embedding-005"))))

rag.upload_file(
    corpus_name=corpus.name, path="agent/comments.md", display_name="comments.md",
    transformation_config=rag.TransformationConfig(
        chunking_config=rag.ChunkingConfig(chunk_size=120, chunk_overlap=20)))`;

const CODE_RETRIEVE = `# agent/platform/rag.py
def retrieve(query: str, k: int = TOP_K) -> list[dict]:
    """The k passages nearest to \`query\`: embed the question, find the nearest
    vectors, return their text. Each row: text, score, source."""
    name = corpus_name()
    if not name:
        raise RuntimeError("no corpus connected - run: python -m agent.platform.rag")
    rag = _rag()
    resp = rag.retrieval_query(
        rag_resources=[rag.RagResource(rag_corpus=name)], text=query,
        rag_retrieval_config=rag.RagRetrievalConfig(top_k=k))
    rows = []
    for c in resp.contexts.contexts:
        rows.append({"text": c.text.strip(), "score": round(float(c.score), 3),
                     "source": c.source_display_name})
    return rows`;


/** Three places a run can draw context from, and what each one holds. */
function StoresFigure() {
  const col = (x: number, title: string, holds: string, shape: string, color: string, lines: string[]) => (
    <g key={title}>
      <rect x={x} y={26} width={220} height={150} rx={16} fill={tint(color, 0.06)} stroke={color} strokeOpacity="0.7" />
      <text x={x + 110} y={50} textAnchor="middle" fontSize="12" fontWeight="600" style={mono} fill={color}>{title}</text>
      <text x={x + 110} y={68} textAnchor="middle" fontSize="9.5" style={mono} fill="currentColor" opacity="0.65">{holds}</text>
      {lines.map((l, i) => (
        <g key={l}>
          <rect x={x + 12} y={84 + i * 22} width={196} height={16} rx={5} fill="var(--card)" stroke={color} strokeOpacity="0.35" />
          <text x={x + 20} y={95 + i * 22} fontSize="8.5" style={mono} fill="currentColor" opacity="0.8">{l}</text>
        </g>
      ))}
      <text x={x + 110} y={166} textAnchor="middle" fontSize="9" style={mono} fill="currentColor" opacity="0.55">{shape}</text>
    </g>
  );
  return (
    <figure className="m-0 mt-4">
      <svg viewBox="0 0 740 190" className="h-auto w-full text-fg" role="img" aria-label="Three stores where session state holds what one run knows, Memory Bank holds consolidated facts about a person, and RAG Engine holds what people wrote, verbatim, searchable by meaning.">
        {col(10, "State", "what one run knows", "keys, for this run", PURPLE, ["direction: \"cat vs the air fryer\"", "candidates: [ ...four... ]", "render_url: /static/renders/..."])}
        {col(260, "Memory Bank", "facts about a person, consolidated", "one fact per memory, per creator", AMBER, ["[TASTE] prefers fantasy lately", "[RULES] one room, no captions", "(three sessions became one fact)"])}
        {col(510, "RAG Engine", "what people wrote, verbatim", "passages, found by meaning", CYAN, ["\"Small magic in small rooms, please more.\"", "\"Too dark in the first five seconds.\"", "heard: \"The snail won.\""])}
      </svg>
      <figcaption className="mt-2 text-xs text-fg-muted">State lives and dies with the run. Memory Bank rewrites facts as it learns. RAG Engine keeps the text as written and finds the passages that fit a question.</figcaption>
    </figure>
  );
}

/** Retrieval over documents: not the whole pile, only the passages that fit. */
function RetrievalFigure() {
  const docs = [0, 1, 2, 3, 4];
  return (
    <figure className="m-0">
      <svg viewBox="0 0 360 230" className="h-auto w-full text-fg" role="img" aria-label="A question goes to a corpus of documents; only the few passages that fit come back and the model reads those.">
        <defs>
          <marker id="ret-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="currentColor" />
          </marker>
        </defs>
        <rect x="14" y="20" width="150" height="190" rx="14" fill="var(--overlay)" stroke={CYAN} strokeOpacity="0.6" />
        <text x="89" y="40" textAnchor="middle" fontSize="10" style={mono} fill={CYAN}>the corpus</text>
        {docs.map((d) => (
          <g key={d} transform={`translate(${28 + (d % 2) * 64} ${52 + Math.floor(d / 2) * 50})`}>
            <rect width="56" height="40" rx="5" fill="var(--card)" stroke="currentColor" strokeOpacity="0.4" />
            {[0, 1, 2, 3].map((k) => (
              <rect key={k} x="7" y={8 + k * 8} width={k === 3 ? 22 : 40} height="3" rx="1.5" fill={d === 1 && k === 1 ? GREEN : d === 3 && k === 2 ? GREEN : "currentColor"} opacity={d === 1 && k === 1 ? 1 : d === 3 && k === 2 ? 1 : 0.35} />
            ))}
          </g>
        ))}
        <rect x="210" y="40" width="136" height="36" rx="10" fill="var(--card)" stroke={AMBER} strokeOpacity="0.8" />
        <text x="278" y="62" textAnchor="middle" fontSize="9.5" style={mono} fill={AMBER}>“small magic?”</text>
        <line x1="210" y1="58" x2="168" y2="58" stroke="currentColor" strokeOpacity="0.6" strokeWidth="1.2" markerEnd="url(#ret-arrow)" />
        <line x1="168" y1="150" x2="210" y2="150" stroke={GREEN} strokeWidth="1.4" markerEnd="url(#ret-arrow)" />
        <rect x="210" y="118" width="136" height="64" rx="10" fill={tint(GREEN, 0.07)} stroke={GREEN} strokeOpacity="0.8" />
        <text x="278" y="138" textAnchor="middle" fontSize="9.5" style={mono} fill={GREEN}>two passages</text>
        <rect x="224" y="148" width="108" height="8" rx="3" fill={GREEN} opacity="0.7" />
        <rect x="224" y="162" width="108" height="8" rx="3" fill={GREEN} opacity="0.7" />
        <text x="278" y="206" textAnchor="middle" fontSize="8.5" style={mono} fill="currentColor" opacity="0.65">the model reads these</text>
      </svg>
    </figure>
  );
}

/** RAG Engine as a GEAP service: a corpus, and the sources that can be imported into it. */
function PlatformFigure() {
  const sources = ["local files (upload_file)", "Cloud Storage", "Google Drive", "Slack", "Jira", "SharePoint"];
  return (
    <figure className="m-0 mt-4">
      <svg viewBox="0 0 760 250" className="h-auto w-full text-fg" role="img" aria-label="RAG Engine runs on GEAP with a corpus containing an embedding model and a vector store, alongside files imported from local disk, Cloud Storage, Google Drive, Slack, Jira, or SharePoint.">
        <defs>
          <marker id="plat-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="currentColor" />
          </marker>
        </defs>
        <rect x="250" y="14" width="496" height="222" rx="18" fill="var(--overlay)" stroke="var(--hairline)" />
        <text x="266" y="36" fontSize="10" style={mono} fill="currentColor" opacity="0.6">GOOGLE CLOUD · GEAP · your project · us-central1</text>
        <rect x="266" y="48" width="464" height="170" rx="14" fill={tint(CYAN, 0.05)} stroke={CYAN} strokeOpacity="0.6" />
        <text x="282" y="70" fontSize="11" style={mono} fill={CYAN}>RAG Engine</text>
        <rect x="282" y="84" width="432" height="118" rx="12" fill="var(--card)" stroke={CYAN} strokeOpacity="0.8" />
        <text x="498" y="106" textAnchor="middle" fontSize="11.5" fontWeight="600" style={mono} fill={CYAN}>corpus · vibestudio-feedback</text>
        <rect x="300" y="120" width="190" height="64" rx="10" fill={tint(PURPLE, 0.08)} stroke={PURPLE} strokeOpacity="0.8" />
        <text x="395" y="144" textAnchor="middle" fontSize="10" style={mono} fill={PURPLE}>embedding model</text>
        <text x="395" y="162" textAnchor="middle" fontSize="9" style={mono} fill="currentColor" opacity="0.7">text-embedding-005</text>
        <rect x="506" y="120" width="190" height="64" rx="10" fill={tint(GREEN, 0.08)} stroke={GREEN} strokeOpacity="0.8" />
        <text x="601" y="144" textAnchor="middle" fontSize="10" style={mono} fill={GREEN}>vector store</text>
        <text x="601" y="162" textAnchor="middle" fontSize="9" style={mono} fill="currentColor" opacity="0.7">files → passages → vectors</text>
        <text x="14" y="36" fontSize="10" style={mono} fill="currentColor" opacity="0.6">what can be imported</text>
        {sources.map((src, i) => (
          <g key={src}>
            <rect x="14" y={48 + i * 30} width="170" height="22" rx="7" fill="var(--card)" stroke={i === 0 ? AMBER : "var(--hairline)"} />
            <text x="24" y={63 + i * 30} fontSize="9.5" style={mono} fill={i === 0 ? AMBER : "currentColor"}>{src}</text>
            <line x1="184" y1={59 + i * 30} x2="262" y2="143" stroke="currentColor" strokeOpacity={i === 0 ? 0.8 : 0.3} strokeWidth={i === 0 ? 1.4 : 1} markerEnd="url(#plat-arrow)" />
          </g>
        ))}
        <text x="99" y="240" textAnchor="middle" fontSize="9" style={mono} fill={AMBER}>this lab · comments · voice · photos · clips</text>
      </svg>
    </figure>
  );
}

/** Retrieval, step by step: the question is embedded, the nearest passages come back. */
function RetrieveFigure() {
  const step = (x: number, label: string, sub: string, color: string) => (
    <g key={label}>
      <rect x={x} y={30} width={168} height={56} rx={12} fill={tint(color, 0.07)} stroke={color} strokeOpacity="0.8" />
      <text x={x + 84} y={53} textAnchor="middle" fontSize="10.5" style={mono} fill={color}>{label}</text>
      <text x={x + 84} y={71} textAnchor="middle" fontSize="8.5" style={mono} fill="currentColor" opacity="0.7">{sub}</text>
    </g>
  );
  return (
    <figure className="m-0 mt-4">
      <svg viewBox="0 0 760 116" className="h-auto w-full text-fg" role="img" aria-label="retrieval_query embeds the question with the corpus model, finds the nearest vectors, and returns their passages with an associated distance.">
        <defs>
          <marker id="rq-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="currentColor" />
          </marker>
        </defs>
        {step(6, "the question", "“small magic in the kitchen”", AMBER)}
        <line x1="174" y1="58" x2="196" y2="58" stroke="currentColor" strokeOpacity="0.6" strokeWidth="1.2" markerEnd="url(#rq-arrow)" />
        {step(198, "embed", "the passages' own model", PURPLE)}
        <line x1="366" y1="58" x2="388" y2="58" stroke="currentColor" strokeOpacity="0.6" strokeWidth="1.2" markerEnd="url(#rq-arrow)" />
        {step(390, "nearest vectors", "top_k = 5", GREEN)}
        <line x1="558" y1="58" x2="580" y2="58" stroke="currentColor" strokeOpacity="0.6" strokeWidth="1.2" markerEnd="url(#rq-arrow)" />
        {step(582, "passages back", "text, with a distance each", CYAN)}
        <text x="375" y="104" textAnchor="middle" fontSize="9" style={mono} fill="currentColor" opacity="0.6">one retrieval_query call · no model writes anything · the passages are the comments as written</text>
      </svg>
    </figure>
  );
}

/* ───────────────────────── 4a · what the audience sent ───────────────────────── */

type AudienceKind = "voice" | "photo" | "clip";
const KIND_META: Record<AudienceKind, { title: string; reader: string; verb: string; out: string; color: string }> = {
  voice: { title: "voice notes", reader: "transcribe_voice", verb: "heard", out: "voice/transcripts.md", color: AMBER },
  photo: { title: "photos", reader: "caption_photos", verb: "saw", out: "photo/captions.md", color: PURPLE },
  clip: { title: "clips", reader: "watch_clips", verb: "watched", out: "clip/notes.md", color: CYAN },
};
const KIND_COLS: Record<AudienceKind, string> = { voice: "grid-cols-2 md:grid-cols-4", photo: "grid-cols-4 md:grid-cols-7", clip: "grid-cols-2 md:grid-cols-3" };

/** What the audience sent and which readers are wired, from the file on disk;
 *  refetched when a run writes to the log, so the cards fill in as the ingest reads. */
function useAudience(refreshKey = 0) {
  const [grid, setGrid] = useState<AudienceGrid | null>(null);
  const [failed, setFailed] = useState("");
  const { snapshot } = useRunEvents();
  const load = useCallback(async () => {
    try {
      setGrid(await api.labAudience());
      setFailed("");
    } catch (e) {
      setFailed((e as Error).message);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load, refreshKey]);
  useEffect(() => {
    if (snapshot) load();
  }, [snapshot?.updated_at, load]); // eslint-disable-line react-hooks/exhaustive-deps
  return { grid, failed, load };
}

/** One thing the audience sent: the media itself, playable, and the reader's line once it has been read. */
function AudienceCard({ item }: { item: AudienceItem }) {
  const meta = KIND_META[item.kind];
  return (
    <li className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-hairline bg-overlay">
      {item.kind === "photo" && <img src={item.url} alt="" loading="lazy" className="aspect-square w-full object-cover" />}
      {item.kind === "clip" && <video src={item.url} controls preload="metadata" playsInline className="aspect-square w-full bg-black object-cover" />}
      {item.kind === "voice" && (
        <div className="px-3 pt-3">
          <audio src={item.url} controls preload="none" className="h-8 w-full" />
        </div>
      )}
      <div className="px-3 py-2">
        <p className="truncate font-mono text-[10px] text-fg-muted" title={item.file}>{item.file}</p>
        {item.line ? (
          <p className="mt-1 line-clamp-3 text-xs text-fg" title={item.line}>
            <span className="font-mono text-[10px]" style={{ color: meta.color }}>{meta.verb} · </span>
            {item.line}
          </p>
        ) : (
          <p className="mt-1 text-xs text-fg-muted">not read yet</p>
        )}
      </div>
    </li>
  );
}

/** The grid: every voice note, photo and clip the audience sent, grouped by kind,
 *  with what the reader wrote for it. The multimodal part of the lab is on screen here. */
function AudienceGridSection({ grid, failed }: { grid: AudienceGrid | null; failed: string }) {
  const kinds: AudienceKind[] = ["voice", "photo", "clip"];
  return (
    <section className="rounded-3xl border border-hairline bg-card p-6">
      <p className="font-mono text-[11px] uppercase tracking-[0.3em]" style={{ color: PURPLE }}>What the audience sent</p>
      <h2 className="font-display mt-2 text-2xl">Four kinds of thing, one corpus.</h2>
      <p className="mt-2 max-w-3xl text-sm text-fg-muted">
        {grid ? `${grid.counts.comments} comments, ${grid.counts.voice} voice notes, ${grid.counts.photo} photos, ${grid.counts.clip} clips. ` : ""}
        A reader per kind turns each file into one line of text; a card shows its line once the ingest has read it.
      </p>
      {failed && <p className="mt-3 font-mono text-xs" style={{ color: RED }}>{failed}</p>}
      {grid &&
        kinds.map((k) => {
          const items = grid.items.filter((i) => i.kind === k);
          const meta = KIND_META[k];
          const wired = grid.wired.includes(k);
          const read = grid.read[k];
          return (
            <div key={k} className="mt-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-mono text-xs" style={{ color: meta.color }}>
                  {items.length} {meta.title} <span className="text-fg-muted">· {meta.reader}() → {meta.out}</span>
                </h3>
                <span className="font-mono text-[10px]" style={{ color: read ? GREEN : wired ? AMBER : "var(--fg-muted)" }}>
                  {read ? `${read} of ${items.length} ${meta.verb}` : wired ? "reader wired · ingest to read them" : "no reader wired · the edit below"}
                </span>
              </div>
              <ul className={`mt-2 grid gap-2 ${KIND_COLS[k]}`}>
                {items.map((i) => (
                  <AudienceCard key={i.file} item={i} />
                ))}
              </ul>
            </div>
          );
        })}
    </section>
  );
}

/** One reader per kind: each format the audience used becomes the same line shape,
 *  and only then does the corpus see it. Lanes without a reader wired are dimmed. */
function ReadersFigure({ wired }: { wired: string[] }) {
  const lanes = [
    { kind: "comments", file: "comments.md", reader: "read_comments", does: "text already", color: GREEN },
    { kind: "voice", file: "voice/*.mp3", reader: "transcribe_voice", does: "Gemini listens", color: AMBER },
    { kind: "photo", file: "photo/*.jpg", reader: "caption_photos", does: "Gemini looks", color: PURPLE },
    { kind: "clip", file: "clip/*.mp4", reader: "watch_clips", does: "Gemini watches, and hears", color: CYAN },
  ];
  return (
    <figure className="m-0 mt-4">
      <svg viewBox="0 0 760 236" className="h-auto w-full text-fg" role="img" aria-label="Comments, voice notes, photos and clips each go through their own reader into one line shape, and the lines go into RAG Engine">
        <defs>
          <marker id="rd-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="currentColor" />
          </marker>
        </defs>
        {lanes.map((l, i) => {
          const y = 22 + i * 50;
          const on = l.kind === "comments" || wired.includes(l.kind);
          return (
            <g key={l.kind} opacity={on ? 1 : 0.45}>
              <rect x="8" y={y} width="130" height="36" rx="9" fill={tint(l.color, 0.08)} stroke={l.color} strokeOpacity="0.8" />
              <text x="73" y={y + 15} textAnchor="middle" fontSize="10" style={mono} fill={l.color}>{l.kind}</text>
              <text x="73" y={y + 29} textAnchor="middle" fontSize="8.5" style={mono} fill="currentColor" opacity="0.7">{l.file}</text>
              <line x1="138" y1={y + 18} x2="176" y2={y + 18} stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.2" markerEnd="url(#rd-arrow)" strokeDasharray={on ? undefined : "3 3"} />
              <rect x="178" y={y} width="176" height="36" rx="9" fill="var(--overlay)" stroke={on ? l.color : "var(--hairline)"} strokeOpacity="0.7" />
              <text x="266" y={y + 15} textAnchor="middle" fontSize="10" style={mono} fill={on ? l.color : "currentColor"}>{l.reader}()</text>
              <text x="266" y={y + 29} textAnchor="middle" fontSize="8.5" style={mono} fill="currentColor" opacity="0.7">{on ? l.does : "not wired · the edit below"}</text>
              <line x1="354" y1={y + 18} x2="402" y2="118" stroke={on ? l.color : "currentColor"} strokeOpacity={on ? 0.7 : 0.25} strokeWidth="1.2" />
            </g>
          );
        })}
        <rect x="404" y="86" width="186" height="64" rx="12" fill={tint(GREEN, 0.07)} stroke={GREEN} strokeOpacity="0.8" />
        <text x="497" y="107" textAnchor="middle" fontSize="10.5" style={mono} fill={GREEN}>one line shape</text>
        <text x="497" y="123" textAnchor="middle" fontSize="8.5" style={mono} fill="currentColor" opacity="0.85">- kind: file — what it heard or saw</text>
        <text x="497" y="139" textAnchor="middle" fontSize="8" style={mono} fill="currentColor" opacity="0.55">the file's name travels inside the passage</text>
        <line x1="590" y1="118" x2="618" y2="118" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.2" markerEnd="url(#rd-arrow)" />
        <rect x="620" y="78" width="132" height="80" rx="12" fill={tint(CYAN, 0.06)} stroke={CYAN} strokeOpacity="0.7" />
        <text x="686" y="100" textAnchor="middle" fontSize="10" style={mono} fill={CYAN}>RAG Engine</text>
        <text x="686" y="117" textAnchor="middle" fontSize="8.5" style={mono} fill="currentColor" opacity="0.7">chunk → embed → store</text>
        <text x="686" y="134" textAnchor="middle" fontSize="8.5" style={mono} fill="currentColor" opacity="0.7">text-embedding-005</text>
        <text x="686" y="150" textAnchor="middle" fontSize="8" style={mono} fill="currentColor" opacity="0.5">never knows the kind</text>
        <text x="380" y="226" textAnchor="middle" fontSize="9" style={mono} fill="currentColor" opacity="0.6">retrieval returns the line · media_in reads the file name out of it · the file comes back with the passage</text>
      </svg>
      <figcaption className="mt-2 text-xs text-fg-muted">RAG Engine retrieves text. Everything that is not text is read into text first, by a model, and the file's name rides inside the line so the file can come back.</figcaption>
    </figure>
  );
}

const CODE_READERS = `# agent/platform/audience.py
def _ask(path, mime, prompt):
    """One media file in, one line of text out."""
    client = images._client()
    resp = client.models.generate_content(
        model=config.MODEL,
        contents=[gt.Part.from_bytes(data=path.read_bytes(), mime_type=mime), prompt])
    return " ".join((resp.text or "").split())

def transcribe_voice():
    """voice note -> text: Gemini listens."""
    lines = []
    for p in sorted((AUDIENCE / "voice").glob("*.mp3")):
        said = _ask(p, "audio/mpeg", VOICE_PROMPT)
        lines.append(f"- voice: {p.name} — {said}")
    return _write(AUDIENCE / "voice" / "transcripts.md", "voice", ..., lines)

# caption_photos: "image/jpeg", PHOTO_PROMPT  ->  photo/captions.md
# watch_clips:    "video/mp4",  CLIP_PROMPT   ->  clip/notes.md

READERS = [
    read_comments,
    # transcribe_voice, caption_photos, watch_clips,   # TODO: INGEST_READERS
]`;

/** The three prompts in agent/platform/audience.py: what Gemini is asked to do with each kind of file. */
const PROMPTS = [
  { kind: "voice", mime: "audio/mpeg", name: "VOICE_PROMPT · Gemini listens", color: AMBER, text: "Transcribe this voice note word for word inside double quotes. Then add: mood: and one word. Plain text on one line, nothing else." },
  { kind: "photo", mime: "image/jpeg", name: "PHOTO_PROMPT · Gemini looks", color: PURPLE, text: "Two sentences: what is in the picture, the palette, the mood. Then: tags: and three short tags. Plain text on one line, no headings, no markdown." },
  { kind: "clip", mime: "video/mp4", name: "CLIP_PROMPT · Gemini watches, and hears", color: CYAN, text: "Describe the shots in two sentences, then quote what you HEAR on the soundtrack as: heard: \"...\". Plain text on one line, no headings, no markdown." },
];

const ANSWER_READERS = `READERS = [
    read_comments,
    transcribe_voice, caption_photos, watch_clips,
]`;

const LINE_SHAPE = `- voice: note-03.mp3 — "I want a whole series of the cat judging costumes …" mood: delighted
- photo: photo-01-ghost-drawer.jpg — A cream wooden drawer, striped socks, a paper-cup ghost … tags: drawer, socks, cozy
- clip:  clip-05.mp4 — A hallway floor, a snail in a sheet and a round vacuum … heard: "The snail won."
- poster: sock-ghost.png — A sheet ghost one inch above a striped sock …`;

/** The checks for 4a: the readers in the file, what they read, what the corpus holds. */
function CorpusVerify({ grid, refreshKey }: { grid: AudienceGrid | null; refreshKey: number }) {
  const [corpus, setCorpus] = useState<RagCorpus | null>(null);
  const [checking, setChecking] = useState(false);
  const check = useCallback(async () => {
    setChecking(true);
    try {
      setCorpus(await api.labRag());
    } catch {
      setCorpus(null);
    } finally {
      setChecking(false);
    }
  }, []);
  useEffect(() => {
    check();
  }, [check, refreshKey]);
  const names = new Set((corpus?.files ?? []).map((f) => f.display_name));
  const audienceFiles = ["voice-transcripts.md", "photo-captions.md", "clip-notes.md"];
  const inCorpus = audienceFiles.filter((n) => names.has(n));
  const kinds: AudienceKind[] = ["voice", "photo", "clip"];
  return (
    <VerifyPanel checking={checking} onCheck={check} title="What was read, and what the corpus holds." intro="Read from agent/platform/audience.py, the readers' files on disk, and the corpus in your project.">
      <CheckRow ok={(corpus?.connected ?? false) || !!corpus?.blocked} label={corpus?.blocked && !corpus.connected ? "no corpus: RAG Engine had no capacity for this project" : "a corpus is connected"}>
        {corpus ? (corpus.connected ? "runs/ragcorpus.json names it." : corpus.blocked ? "The lab continues without audience feedback. Run connect again later." : "Run connect above.") : "…"}
      </CheckRow>
      <CheckRow ok={grid?.readers_wired ?? false} label="four readers wired">
        {grid ? (grid.readers_wired ? "READERS holds read_comments, transcribe_voice, caption_photos and watch_clips." : `READERS holds ${grid.wired.join(", ")} only. The edit above.`) : "…"}
      </CheckRow>
      {kinds.map((k) => {
        const meta = KIND_META[k];
        const n = grid?.counts[k] ?? 0;
        const read = grid?.read[k] ?? 0;
        return (
          <CheckRow key={k} ok={n > 0 && read === n} label={`${n} ${meta.title} ${meta.verb}`}>
            {grid ? (read ? `${read} of ${n} · one line each in agent/audience/${meta.out}` : n === 0 ? `No ${meta.title} under agent/audience/${k}/ (the fixture ships them; git pull?)` : grid.wired.includes(k) ? <>The reader is wired; ingest to run it. <IngestButton small /></> : "No reader wired, so nothing was read.") : "…"}
          </CheckRow>
        );
      })}
      <CheckRow ok={inCorpus.length === audienceFiles.length} label="the corpus holds what the audience sent">
        {corpus ? (inCorpus.length === audienceFiles.length ? `${corpus.files.length} files: comments.md, captions.md, ${inCorpus.join(", ")}.` : inCorpus.length ? <>{inCorpus.join(", ")} only. Ingest again after the edit. <IngestButton small /></> : corpus.files.length ? <>{corpus.files.map((f) => f.display_name).join(", ")}. The readers' files are not in yet. <IngestButton small /></> : <>Empty. <IngestButton small label="Ingest" /></>) : "…"}
      </CheckRow>
    </VerifyPanel>
  );
}

export function TheCorpus() {
  const [tick, setTick] = useState(0);
  const [hint, setHint] = useState(0);
  const { grid, failed, load } = useAudience(tick);
  const readersOk = grid?.readers_wired ?? false;
  const onDone = useCallback(() => {
    setTick((t) => t + 1);
    load();
  }, [load]);
  return (
    <div className="space-y-12">
      <StepHeader
        kicker="Session 4a · The corpus"
        color={PURPLE}
        title="What the audience sent, read into one corpus."
        blurb="Comments, voice notes, photos and clips. RAG Engine retrieves text, so one reader per kind turns each file into one line that names it; the line is the passage, and the file comes back with it."
      />

      <In delay={0.1}>
        <AudienceGridSection grid={grid} failed={failed} />
      </In>

      <In delay={0.15}>
        <section className="rounded-3xl border border-hairline bg-card p-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-fg-muted">One reader per kind</p>
          <h2 className="font-display mt-2 text-2xl">Read everything into the same line shape.</h2>
          <p className="mt-2 max-w-3xl text-sm text-fg-muted">
            Each reader sends one file and one prompt to Gemini and writes one line per file. Chunking, embedding and retrieval never know which kind a passage came from.
          </p>
          <p className="mt-2 max-w-3xl text-sm text-fg-muted">
            This is where the multimodal analysis happens, and it is one call: the raw bytes of the mp3, the jpg or the mp4 go to Gemini as a{" "}
            <code className="font-mono text-fg">Part</code> next to a prompt, and the same model that writes the script listens, looks or watches, and answers in
            text. No speech-to-text service, no vision API, no frame sampling: the model is the reader. What changes per kind is only the prompt.
          </p>
          <ReadersFigure wired={grid?.wired ?? ["comments"]} />
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {PROMPTS.map((p) => (
              <div key={p.kind} className="rounded-2xl border border-hairline bg-input px-4 py-3">
                <div className="font-mono text-[11px] font-medium" style={{ color: p.color }}>{p.kind} · {p.mime}</div>
                <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-fg-muted">{p.name}</div>
                <p className="mt-1.5 text-xs text-fg-muted">{p.text}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="overflow-hidden rounded-2xl border border-hairline bg-input">
              <div className="border-b border-hairline px-4 py-1.5 font-mono text-[10px] uppercase tracking-wider text-fg-muted">agent/platform/audience.py · the readers</div>
              <pre className="max-h-96 overflow-auto px-4 py-3 font-mono text-[11px] leading-relaxed text-fg">
                <code>{CODE_READERS}</code>
              </pre>
            </div>
            <div className="overflow-hidden rounded-2xl border border-hairline bg-input">
              <div className="border-b border-hairline px-4 py-1.5 font-mono text-[10px] uppercase tracking-wider text-fg-muted">the line shape · one passage each, the file's name inside</div>
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap px-4 py-3 font-mono text-[11px] leading-relaxed text-fg">
                <code>{LINE_SHAPE}</code>
              </pre>
              <p className="border-t border-hairline px-4 py-2 text-xs text-fg-muted">
                The posters took the same road in Session 2's past: <code className="font-mono text-fg">rag.caption_posters</code> wrote one line per PNG.
              </p>
            </div>
          </div>
        </section>
      </In>

      <In delay={0.2}>
        <section className="rounded-3xl border border-hairline bg-card p-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-fg-muted">How the search works</p>
          <h2 className="font-display mt-2 text-2xl">Meaning in, meaning out.</h2>
          <p className="mt-2 max-w-3xl text-sm text-fg-muted">
            Every line becomes a vector; a question becomes one too; the nearest vectors are the passages that mean the same thing, whatever words they used.
          </p>
          <div className="mt-4">
            <MeaningFigure />
          </div>
        </section>
      </In>

      <In delay={0.25}>
        <section className="rounded-3xl border border-hairline bg-card p-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em]" style={{ color: CYAN }}>
            Console
          </p>
          <h2 className="font-display mt-2 text-2xl">Connect, ingest, ask.</h2>
          <p className="mt-2 max-w-3xl text-sm text-fg-muted">
            Run the ingest once as shipped: the output says which kinds were not read. Make the edit below, run it again, and the cards above fill in.
          </p>
          <RagRunner onDone={onDone} />
          <div className="flex flex-wrap gap-3">
            <SourceToggle path="agent/platform/rag.py" label="agent/platform/rag.py · the client and the console" />
            <SourceToggle path="agent/comments.md" label="agent/comments.md · the twelve comments" />
          </div>
        </section>
      </In>

      <In delay={0.3}>
        <EditPanel
          label="Your edit"
          title="Wire the three media readers."
          intro={
            <>
              As shipped, <code className="font-mono text-fg">READERS</code> in agent/platform/audience.py holds <code className="font-mono text-fg">read_comments</code> only;
              the three other readers sit behind one <code className="font-mono text-fg">#</code>. Delete it, save, and ingest again.
            </>
          }
          pill={grid ? (readersOk ? "four readers ✓" : "comments only") : "…"}
          ok={readersOk}
          hint={hint}
          setHint={setHint}
          hint1={<>One <code className="font-mono">#</code> and the space after it, at the start of the second line inside the list. The three names are already there.</>}
          hint2={ANSWER_READERS}
          path="agent/platform/audience.py"
          symbol="READERS"
          pattern={/TODO: INGEST_READERS|transcribe_voice, caption_photos, watch_clips/}
          onSaved={load}
        />
      </In>

      <In delay={0.32}>
        <section className="rounded-3xl border p-6" style={{ borderColor: tint(CYAN, 0.4), background: tint(CYAN, 0.05) }}>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.3em]" style={{ color: CYAN }}>Then</p>
              <h2 className="font-display mt-2 text-2xl">{readersOk ? "Ingest again: now Gemini reads." : "Wire the readers, then ingest again."}</h2>
              <p className="mt-2 max-w-3xl text-sm text-fg-muted">
                Saving the edit changes nothing by itself: <code className="font-mono text-fg">READERS</code> is a list the ingest command walks. Run{" "}
                <code className="font-mono text-fg">load --audience</code> once more and the three readers go first, one Gemini call per file ({grid ? `${grid.counts.voice} voice notes, ${grid.counts.photo} photos, ${grid.counts.clip} clips` : "voice notes, photos, clips"}; a minute or three),
                then their three files are uploaded into the corpus beside the comments, split, embedded and indexed. The cards above fill in, and the rows below go green.
              </p>
            </div>
            <IngestButton label={readersOk ? "Ingest again" : "Ingest (comments only, as wired)"} />
          </div>
        </section>
      </In>

      <In delay={0.35}>
        <CorpusVerify grid={grid} refreshKey={tick} />
      </In>

      <In delay={0.4}>
        <CorpusLedger refreshKey={tick} />
      </In>

      <div className="space-y-4">
        <Fold title="Three stores: State, Memory Bank, RAG Engine" kicker="reference">
          <p>
            Session State holds what one run knows. Memory Bank holds facts about a person, consolidated. RAG Engine holds what people sent, verbatim, found by meaning.
          </p>
          <StoresFigure />
        </Fold>
        <Fold title="Retrieval over documents: not the whole pile, only the passages that fit" kicker="reference">
          <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr] lg:items-center">
            <p>
              Injecting every document into the prompt degrades the answers and costs tokens. RAG decouples indexing from inference: files are chunked and embedded once, and each question pulls only the few passages nearest to it.
            </p>
            <RetrievalFigure />
          </div>
        </Fold>
        <Fold title="RAG Engine on Google Cloud: the corpus, the embedding model, the vector store" kicker="reference">
          <p>
            A corpus names its embedding model once; every passage and every question goes through it. <code>upload_file</code> takes a local path and a chunking config, about 120 tokens per passage. The corpus name is cached in <code>runs/ragcorpus.json</code>.
          </p>
          <PlatformFigure />
          <div className="mt-4 overflow-hidden rounded-2xl border border-hairline bg-input">
            <div className="border-b border-hairline px-4 py-1.5 font-mono text-[10px] uppercase tracking-wider text-fg-muted">agent/platform/rag.py · create the corpus, upload a file</div>
            <pre className="overflow-x-auto px-4 py-3 font-mono text-[11px] leading-relaxed text-fg">
              <code>{CODE_CORPUS}</code>
            </pre>
          </div>
        </Fold>
        <Fold title="Retrieve, step by step" kicker="reference">
          <p>
            <code>retrieve</code> embeds the question with the corpus's own model, finds the nearest vectors, and returns their passages with a distance each. No model writes anything.
          </p>
          <RetrieveFigure />
          <div className="mt-4 overflow-hidden rounded-2xl border border-hairline bg-input">
            <div className="border-b border-hairline px-4 py-1.5 font-mono text-[10px] uppercase tracking-wider text-fg-muted">agent/platform/rag.py · retrieve</div>
            <pre className="max-h-72 overflow-auto px-4 py-3 font-mono text-[11px] leading-relaxed text-fg">
              <code>{CODE_RETRIEVE}</code>
            </pre>
          </div>
        </Fold>
      </div>
    </div>
  );
}

/* ───────────────────────── 4b · the third reader ───────────────────────── */

const CODE_READ_FEEDBACK = `# agent/graph.py · as shipped
def read_feedback(node_input):
    """The third reader: what the audience sent - comments, and what Gemini
    heard and saw in their voice notes, photos and clips - the passages
    nearest to tonight's idea, and the media those passages came with.
    Retrieval, not a model call."""
    from .platform import rag
    idea = idea_text(node_input)
    query = idea or "what viewers liked and what they complained about"
    try:
        hits = rag.retrieve(query)
    except Exception as e:
        print(f"  [rag] feedback unavailable ({str(e)[:80]})")
        return Event(output={"query": query, "feedback": [], "media": [],
                             "note": "no corpus connected - run: python -m agent.platform.rag"})
    return Event(output={"query": query, "feedback": [h["text"] for h in hits]})  # TODO: RAG_MEDIA`;

const CODE_MEDIA_IN = `# agent/platform/rag.py
MEDIA_WEB = {"poster": "/static/past", "voice": "/static/audience/voice",
             "photo": "/static/audience/photo", "clip": "/static/audience/clip"}

def media_in(hits):
    """The files the retrieved passages name, as [{kind, url}]: a caption
    line carries 'poster: x.png', a reader's line 'voice: note-03.mp3' ..."""
    out, seen = [], set()
    for h in hits:
        for kind, name in re.findall(r"\\b(poster|voice|photo|clip):\\s*([\\w.-]+\\.(?:png|jpg|jpeg|mp3|mp4))", h["text"]):
            url = f"{MEDIA_WEB[kind]}/{name}"
            if url not in seen:
                seen.add(url); out.append({"kind": kind, "url": url})
    return out`;

const CODE_INSTRUCTION = `# agent/graph.py · PROPOSE_INSTRUCTION, the lines about the third key
"... read_feedback, when present, holds what the audience wrote under past "
"videos, the passages nearest to tonight's idea.\\n"
...
"If there is feedback, let it steer candidates 1 to 3: lean into what viewers "
"praised, avoid what they complained about, and name the comment in the angle.\\n"
...
"Every evidence entry must cite a REAL source: 'trends', 'backlog', 'feedback', ..."`;

const DEFAULT_RAG_IDEA = "a ghost learning to haunt the fridge light";

const ANSWER_READ_FEEDBACK = `def read_feedback(node_input):
    """The third reader: what the audience sent - comments, and what Gemini
    heard and saw in their voice notes, photos and clips - the passages
    nearest to tonight's idea, and the media those passages came with.
    Retrieval, not a model call."""
    from .platform import rag
    idea = idea_text(node_input)
    query = idea or "what viewers liked and what they complained about"
    try:
        hits = rag.retrieve(query)
    except Exception as e:
        print(f"  [rag] feedback unavailable ({str(e)[:80]})")
        return Event(output={"query": query, "feedback": [], "media": [],
                             "note": "no corpus connected - run: python -m agent.platform.rag"})
    return Event(output={"query": query, "feedback": [h["text"] for h in hits],
                         "media": rag.media_in(hits)})`;

/** The graph through 5d. The new reader is highlighted; the rest is step 4 and 5b. */
function WorkflowFigure() {
  const node = (cx: number, cy: number, label: string, kind: "func" | "join" | "agent" | "human" | "router" | "task" | "new") => {
    const color = kind === "agent" || kind === "task" ? PURPLE : kind === "join" ? CYAN : kind === "human" ? AMBER : kind === "router" ? RED : kind === "new" ? CYAN : "currentColor";
    const lit = kind === "new";
    return (
      <g key={label}>
        {lit && <rect x={cx - 62} y={cy - 19} width="124" height="38" rx="11" fill="none" stroke={CYAN} strokeOpacity="0.35" strokeWidth="6" />}
        <rect x={cx - 56} y={cy - 13} width="112" height="26" rx="8" fill={lit ? tint(CYAN, 0.15) : kind === "func" ? "var(--overlay)" : tint(color, 0.08)} stroke={lit ? CYAN : kind === "func" ? "var(--hairline)" : color} strokeWidth={lit ? 1.6 : 1.1} />
        <text x={cx} y={cy + 4} fontSize="9.5" style={mono} textAnchor="middle" fill={lit ? CYAN : kind === "func" ? "currentColor" : color}>{label}</text>
      </g>
    );
  };
  const edge = (x1: number, y1: number, x2: number, y2: number, color = "currentColor") => <line key={`${x1}${y1}${x2}${y2}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeOpacity={color === "currentColor" ? 0.55 : 0.9} strokeWidth={color === CYAN ? 1.8 : 1.2} markerEnd="url(#wf7-arrow)" />;
  return (
    <figure className="m-0 mt-4">
      <svg viewBox="0 0 1016 260" className="h-auto w-full text-fg" role="img" aria-label="The workflow with audience feedback retrieval where START fans out to scan_trends, read_backlog and the new read_feedback, all into join_research, then propose_directions, direction_gate, persist_direction, policy_check routing OK to scripter and BLOCK to quarantine, which continues to scripter.">
        <defs>
          <marker id="wf7-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="currentColor" />
          </marker>
        </defs>
        <circle cx="30" cy="120" r="12" fill="var(--overlay)" stroke="currentColor" strokeOpacity="0.6" />
        <text x="30" y="124" fontSize="8.5" style={mono} textAnchor="middle" fill="currentColor">START</text>
        {node(120, 60, "scan_trends", "func")}
        {node(120, 120, "read_backlog", "func")}
        {node(120, 190, "read_feedback", "new")}
        {node(245, 120, "join_research", "join")}
        {node(375, 120, "propose_directions", "agent")}
        {node(505, 120, "direction_gate", "human")}
        {node(635, 120, "persist_direction", "func")}
        {node(765, 120, "policy_check", "router")}
        {node(910, 65, "scripter", "agent")}
        {node(910, 195, "quarantine", "task")}
        {edge(42, 114, 62, 66)}
        {edge(42, 120, 62, 120)}
        {edge(42, 126, 62, 184, CYAN)}
        {edge(176, 60, 187, 114)}
        {edge(176, 120, 187, 120)}
        {edge(176, 190, 187, 126, CYAN)}
        {edge(301, 120, 317, 120)}
        {edge(431, 120, 447, 120)}
        {edge(561, 120, 577, 120)}
        {edge(691, 120, 707, 120)}
        {edge(821, 112, 852, 70, GREEN)}
        <text x="836" y="84" fontSize="8.5" style={mono} fill={GREEN}>OK</text>
        {edge(821, 128, 852, 190, RED)}
        <text x="828" y="170" fontSize="8.5" style={mono} fill={RED}>BLOCK</text>
        <path d="M966 195 C 995 195, 995 65, 968 65" fill="none" stroke={PURPLE} strokeOpacity="0.8" strokeWidth="1.2" strokeDasharray="4 3" markerEnd="url(#wf7-arrow)" />
        <text x="996" y="130" fontSize="8" style={mono} fill={PURPLE} textAnchor="middle" transform="rotate(90 996 130)">cleaned</text>
        <text x="120" y="232" fontSize="9" style={mono} textAnchor="middle" fill={CYAN}>the corpus, asked with tonight's idea</text>
        <text x="245" y="160" fontSize="8.5" style={mono} textAnchor="middle" fill="currentColor" opacity="0.6">waits for three</text>
      </svg>
      <figcaption className="mt-2 text-xs text-fg-muted">START to read_feedback to the join: the third reader's edge ships in stage5_rag/agent.py. The join waits for three.</figcaption>
    </figure>
  );
}

function useStage5() {
  const [status, setStatus] = useState<Stage5Status | null>(null);
  const [checking, setChecking] = useState(false);
  const [open, setOpen] = useState(false);
  const { snapshot } = useRunEvents();
  const check = useCallback(async () => {
    setChecking(true);
    try {
      setStatus(await api.labStage5());
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
    if (!open) return;
    const t = setInterval(check, 4000);
    return () => clearInterval(t);
  }, [open, check]);
  return { status, checking, check, open, setOpen };
}



/** The node at work: the idea goes to the corpus, the nearest passages come back into the bundle. */
function NodeRetrievalFigure() {
  const box = (x: number, y: number, w: number, h: number, label: string, sub: string, color: string) => (
    <g key={label}>
      <rect x={x} y={y} width={w} height={h} rx={12} fill={tint(color, 0.07)} stroke={color} strokeOpacity="0.8" />
      <text x={x + w / 2} y={y + 22} textAnchor="middle" fontSize="11" style={mono} fill={color}>{label}</text>
      <text x={x + w / 2} y={y + 39} textAnchor="middle" fontSize="8.5" style={mono} fill="currentColor" opacity="0.7">{sub}</text>
    </g>
  );
  return (
    <figure className="m-0 mt-4">
      <svg viewBox="0 0 760 214" className="h-auto w-full text-fg" role="img" aria-label="read_feedback takes tonight's idea, calls rag.retrieve, the corpus returns the nearest passages, and the node hands them to the join as the feedback key.">
        <defs>
          <marker id="nr-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="currentColor" />
          </marker>
        </defs>
        {box(6, 24, 176, 56, "tonight's idea", "“a ghost in the fridge light”", AMBER)}
        <line x1="182" y1="52" x2="248" y2="52" stroke="currentColor" strokeOpacity="0.6" strokeWidth="1.2" markerEnd="url(#nr-arrow)" />
        <text x="215" y="44" textAnchor="middle" fontSize="8" style={mono} fill="currentColor" opacity="0.6">node_input</text>
        {box(250, 24, 156, 56, "read_feedback", "a function node", CYAN)}
        <line x1="406" y1="44" x2="516" y2="44" stroke={CYAN} strokeWidth="1.4" markerEnd="url(#nr-arrow)" />
        <text x="461" y="36" textAnchor="middle" fontSize="8.5" style={mono} fill={CYAN}>rag.retrieve(query)</text>
        <line x1="516" y1="62" x2="406" y2="62" stroke={GREEN} strokeWidth="1.4" markerEnd="url(#nr-arrow)" />
        <text x="461" y="76" textAnchor="middle" fontSize="8.5" style={mono} fill={GREEN}>Five passages</text>
        <rect x="518" y="10" width="236" height="88" rx="14" fill="var(--overlay)" stroke={CYAN} strokeOpacity="0.5" />
        <text x="636" y="30" textAnchor="middle" fontSize="9.5" style={mono} fill={CYAN}>RAG Engine · vibestudio-feedback</text>
        {[0, 1, 2, 3, 4].map((k) => (
          <rect key={k} x={531 + k * 42} y={44} width={34} height={22} rx={5} fill="var(--card)" stroke={k === 1 || k === 3 ? GREEN : "var(--hairline)"} strokeWidth={k === 1 || k === 3 ? 1.4 : 1} />
        ))}
        <text x="636" y="86" textAnchor="middle" fontSize="8.5" style={mono} fill="currentColor" opacity="0.65">passages, found by meaning</text>
        <path d="M326 80 L 326 118" fill="none" stroke="currentColor" strokeOpacity="0.6" strokeWidth="1.2" markerEnd="url(#nr-arrow)" />
        <text x="338" y="104" fontSize="8" style={mono} fill="currentColor" opacity="0.6">Event(output=...)</text>
        {box(190, 120, 274, 56, "join_research", "{ scan_trends, read_backlog, read_feedback }", PURPLE)}
        <line x1="464" y1="148" x2="514" y2="148" stroke="currentColor" strokeOpacity="0.6" strokeWidth="1.2" markerEnd="url(#nr-arrow)" />
        {box(516, 120, 176, 56, "propose_directions", "reads all three keys", PURPLE)}
        <text x="380" y="204" textAnchor="middle" fontSize="9" style={mono} fill="currentColor" opacity="0.6">the passages arrive as text in the bundle, cited as 'feedback'; the media they came with as URLs</text>
      </svg>
    </figure>
  );
}

export function TheReader() {
  const [idea, setIdea] = useState(DEFAULT_RAG_IDEA);
  const [hint, setHint] = useState(0);
  const { status, checking, check, open, setOpen } = useStage5();
  const wired = status?.feedback_wired ?? false;
  const mediaOk = status?.media_wired ?? false;
  const media = status?.feedback_media ?? [];
  const ran = status?.feedback_ran ?? false;
  const passages = status?.feedback_passages ?? [];
  const proposed = status?.proposed ?? [];
  return (
    <div className="space-y-12">
      <StepHeader
        kicker="Session 4b · The third reader"
        color={PURPLE}
        title="What the audience said, and the things they said it with."
        blurb="RAG Engine is not a callback and not a tool: it is a third reader in the research fan-out. read_feedback asks the corpus for the passages nearest to tonight's idea, and the join hands them to the proposer with the trends and the backlog. A passage that came from a voice note, a photo, a clip or a poster names its file, so the file can come back with it."
      />

      <In delay={0.1}>
        <section className="rounded-3xl border border-hairline bg-card p-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-fg-muted">The graph</p>
          <h2 className="font-display mt-2 text-2xl">Three readers into one join; the edge ships.</h2>
          <p className="mt-2 max-w-3xl text-sm text-fg-muted">
            <code className="font-mono text-fg">(START, read_feedback, join_research)</code> is already in stage5_rag/agent.py, the shape Session 3 taught. Your edit is inside the node: what it hands back.
          </p>
          <WorkflowFigure />
        </section>
      </In>

      <In delay={0.2}>
        <section className="rounded-3xl border border-hairline bg-card p-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-fg-muted">The node</p>
          <h2 className="font-display mt-2 text-2xl">A function node that retrieves.</h2>
          <p className="mt-2 max-w-3xl text-sm text-fg-muted">
            <code className="font-mono text-fg">read_feedback</code> takes the idea, calls <code className="font-mono text-fg">rag.retrieve</code>, and emits the five nearest passages. No corpus: an empty list and a note, never an abort.
          </p>
          <NodeRetrievalFigure />
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="overflow-hidden rounded-2xl border border-hairline bg-input">
              <div className="border-b border-hairline px-4 py-1.5 font-mono text-[10px] uppercase tracking-wider text-fg-muted">agent/graph.py · read_feedback</div>
              <pre className="overflow-x-auto px-4 py-3 font-mono text-[11px] leading-relaxed text-fg">
                <code>{CODE_READ_FEEDBACK}</code>
              </pre>
            </div>
            <div className="overflow-hidden rounded-2xl border border-hairline bg-input">
              <div className="border-b border-hairline px-4 py-1.5 font-mono text-[10px] uppercase tracking-wider text-fg-muted">agent/platform/rag.py · media_in, what your edit calls</div>
              <pre className="max-h-80 overflow-auto px-4 py-3 font-mono text-[11px] leading-relaxed text-fg">
                <code>{CODE_MEDIA_IN}</code>
              </pre>
            </div>
          </div>
          <div className="mt-4 overflow-hidden rounded-2xl border border-hairline bg-input">
            <div className="border-b border-hairline px-4 py-1.5 font-mono text-[10px] uppercase tracking-wider text-fg-muted">agent/graph.py · what propose_directions is told about the new key</div>
            <pre className="overflow-x-auto px-4 py-3 font-mono text-[11px] leading-relaxed text-fg">
              <code>{CODE_INSTRUCTION}</code>
            </pre>
          </div>
        </section>
      </In>

      <In delay={0.32}>
        <EditPanel
          label="Your edit"
          title="Hand back the media with the passages."
          intro={
            <>
              Only <code className="font-mono text-fg">read_feedback</code> in agent/graph.py is shown. Every line in the corpus that came from a voice note, a photo,
              a clip or a poster names its file. Add <code className="font-mono text-fg">"media": rag.media_in(hits)</code> to the output beside the passages, so the
              things the audience sent travel with what they said.
            </>
          }
          pill={status ? (mediaOk ? "media travels with the passages ✓" : "text only") : "…"}
          ok={mediaOk}
          hint={hint}
          setHint={setHint}
          hint1={<>One more key in the dict the last line returns. <code className="font-mono">rag.media_in(hits)</code> reads the file names out of the passages and turns them into URLs this page can show and play.</>}
          hint2={ANSWER_READ_FEEDBACK}
          path="agent/graph.py"
          symbol="read_feedback"
          pattern={/TODO: RAG_MEDIA|media_in\(/}
          onSaved={check}
        />
      </In>

      <In delay={0.35}>
        <LoadCheck app="stage5_rag" intro="Save, then verify module loading to confirm the updated edge list and reader imports compile cleanly." />
      </In>

      <In delay={0.4}>
        <RunPanel
          app="stage5_rag"
          open={open}
          setOpen={setOpen}
          title="Execute workflow and inspect multi-source research."
          intro="Send an idea. Three readers run at once; the join hands the proposer the trends, the backlog and what the audience sent, with the media it came with."
          idea={idea}
          setIdea={setIdea}
          steps={[
            "Open the read_feedback event: the query is your idea, the output holds the five nearest passages and, after your edit, a media list with a URL per file. Open join_research: the bundle has the third key. Then propose_directions: candidates 1 to 3 cite 'feedback'.",
            "Pick one candidate and let the run finish. Then submit the same idea again to compare. The retrieved passages remain identical while the proposed candidates vary, demonstrating deterministic retrieval paired with probabilistic generation.",
          ]}
        />
      </In>

      <In delay={0.5}>
        <VerifyPanel checking={checking} onCheck={check} intro="Read from runs/ragcorpus.json, this step's app file, and the latest stage5_rag session's events.">
          <CheckRow ok={(status?.corpus_connected ?? false) || !!status?.corpus_blocked} label={status?.corpus_blocked && !status.corpus_connected ? "no corpus: RAG Engine had no capacity for this project" : "a corpus is connected"}>
            {status ? (status.corpus_connected ? "runs/ragcorpus.json names it." : status.corpus_blocked ? "The lab continues without audience feedback. Run 5c's first command again later." : "Run the first command in 5c.") : "…"}
          </CheckRow>
          <CheckRow ok={wired} label="read_feedback enters the join">
            {status ? (wired ? "(START, read_feedback, join_research) is in the edge list, as shipped." : "The edge is missing from stage5_rag/agent.py; scripts/rescue.py puts it back.") : "…"}
          </CheckRow>
          <CheckRow ok={mediaOk} label="read_feedback hands back the media">
            {status ? (mediaOk ? "rag.media_in(hits) is in agent/graph.py." : "The edit above.") : "…"}
          </CheckRow>
          <CheckRow ok={ran && (passages.length > 0 || !!status?.corpus_blocked)} label={status?.corpus_blocked && ran && !passages.length ? "read_feedback ran; no corpus, so no passages" : "read_feedback ran and retrieved passages"}>
            {ran ? (passages.length ? `query · ${status?.feedback_query} · ${passages.length} passages · first · ${passages[0].slice(0, 90)}…` : status?.feedback_note || "ran, but no passages came back") : "No run yet."}
          </CheckRow>
          <CheckRow ok={(status?.cited_feedback ?? false) || !!status?.corpus_blocked} label={status?.corpus_blocked && !status?.cited_feedback ? "no feedback to cite without a corpus" : "a candidate cites feedback"}>
            {proposed.length ? (status?.cited_feedback ? "Yes. The model chose how; another run may cite it elsewhere." : "Not in this run. The model is not obliged to; run again.") : "No candidates yet."}
          </CheckRow>
          {media.length ? (
            <li className="md:col-span-2 rounded-2xl border border-hairline bg-overlay p-3 text-xs">
              <p className="font-mono text-[10px] uppercase tracking-wider text-fg-muted">what it looked at · the media the retrieved passages came with</p>
              <div className="mt-2 flex flex-wrap items-start gap-2">
                {media.map((m) =>
                  m.kind === "poster" ? (
                    <img key={m.url} src={m.url} alt="" className="h-36 rounded-lg border border-hairline bg-card object-cover" style={{ aspectRatio: "9 / 16" }} />
                  ) : m.kind === "photo" ? (
                    <img key={m.url} src={m.url} alt="" className="h-36 w-36 rounded-lg border border-hairline bg-card object-cover" />
                  ) : m.kind === "clip" ? (
                    <video key={m.url} src={m.url} controls preload="metadata" playsInline className="h-36 w-36 rounded-lg border border-hairline bg-black object-cover" />
                  ) : (
                    <div key={m.url} className="flex h-36 w-56 flex-col justify-between rounded-lg border border-hairline bg-card p-2">
                      <span className="font-mono text-[10px]" style={{ color: AMBER }}>voice · {m.url.split("/").slice(-1)[0]}</span>
                      <audio src={m.url} controls preload="none" className="h-8 w-full" />
                    </div>
                  ),
                )}
              </div>
            </li>
          ) : null}
          {proposed.length ? (
            <li className="md:col-span-2 rounded-2xl border border-hairline bg-overlay p-3 text-xs">
              <p className="font-mono text-[10px] uppercase tracking-wider text-fg-muted">the latest candidates and their sources</p>
              <ol className="mt-2 space-y-1.5">
                {proposed.map((c, i) => (
                  <li key={`${c.title}-${i}`} className="flex flex-wrap items-baseline gap-2">
                    <span className="font-mono text-fg-muted">{i + 1}.</span>
                    <span className="text-fg">{c.title}</span>
                    <span className="font-mono text-[10px] text-fg-muted">{c.sources.join(" · ") || "no evidence"}</span>
                  </li>
                ))}
              </ol>
            </li>
          ) : null}
        </VerifyPanel>
      </In>
    </div>
  );
}
