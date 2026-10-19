import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Download, RefreshCw } from "lucide-react";
import { In, StepHeader } from "../components/shared";
import { DoneBanner } from "../components/DoneBanner";
import { LoadCheck } from "../components/LoadCheck";
import { api, useRunEvents } from "../lib/api";
import type { Stage6Status } from "../lib/types";
import { COLORS, tint } from "./colors";
import { CheckRow, EditPanel, RunPanel, VerifyPanel } from "./FanOut";

/*
 * Step 6a and 6b, composed by steps/MediaDesk.tsx:
 *   TheTool  6a  Veo as a long-running tool: the pending receipt, LongRunningFunctionTool,
 *                a workflow suspended at an agent node, resume by id; wrap the tool
 *   TheDesk  6b  the desk in the graph: two branches out of script_ready, the clip
 *                (minutes) and the poster (seconds), meeting at join_media; run until
 *                it suspends, deliver from the console, watch the join release
 */

const AMBER = COLORS.amber;
const PURPLE = COLORS.purple;
const CYAN = COLORS.cyan;
const GREEN = COLORS.green;
const RED = COLORS.red;
const mono = { fontFamily: "var(--font-mono)" } as const;

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

function useStage6() {
  const [status, setStatus] = useState<Stage6Status | null>(null);
  const [checking, setChecking] = useState(false);
  const [open, setOpen] = useState(false);
  const { snapshot } = useRunEvents();
  const check = useCallback(async () => {
    setChecking(true);
    try {
      setStatus(await api.labStage6());
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


/* ───────────────────────── the timeline figure ───────────────────────── */

/** Two lanes over time: the workflow's session and Veo. The gap in the middle
 *  is the lesson: the session holds a receipt, and nothing runs. */
function TimelineFigure() {
  const loop = { repeat: Infinity, repeatDelay: 1.0 };
  const box = (x: number, y: number, w: number, label: string, sub: string, color: string, lit = false) => (
    <g key={label + x}>
      <rect x={x} y={y} width={w} height={40} rx={9} fill={lit ? tint(color, 0.15) : "var(--overlay)"} stroke={color === "currentColor" ? "var(--hairline)" : color} strokeWidth={lit ? 1.6 : 1.1} />
      <text x={x + w / 2} y={y + 17} textAnchor="middle" fontSize="9.5" style={mono} fill={color === "currentColor" ? "currentColor" : color}>{label}</text>
      <text x={x + w / 2} y={y + 31} textAnchor="middle" fontSize="8" style={mono} fill="currentColor" opacity="0.6">{sub}</text>
    </g>
  );
  return (
    <figure className="m-0 mt-4">
      <div className="overflow-x-auto">
        <svg viewBox="0 0 960 330" className="h-auto w-full min-w-[720px] text-fg" role="img" aria-label="Timeline illustrating workflow execution where the scripter runs, render_desk calls render_submit and receives a pending receipt, the workflow suspends with the call id in the session; meanwhile Veo renders; later deliver polls Veo, answers the call by id, the call closes and store_release runs.">
          <defs>
            <marker id="tl-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" fill="currentColor" />
            </marker>
          </defs>
          <text x="14" y="22" fontSize="9" letterSpacing="2" style={mono} fill="currentColor" opacity="0.6">TIME →</text>
          <line x1="14" y1="30" x2="946" y2="30" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1" markerEnd="url(#tl-arrow)" />

          {/* lane 1: the workflow */}
          <text x="14" y="62" fontSize="9" style={mono} fill={AMBER}>the workflow · one session</text>
          {box(14, 72, 90, "scripter", "the script", PURPLE)}
          <line x1="104" y1="92" x2="122" y2="92" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.2" markerEnd="url(#tl-arrow)" />
          {box(124, 72, 150, "render_desk", "render_submit(prompt)", AMBER, true)}
          <line x1="274" y1="92" x2="292" y2="92" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.2" markerEnd="url(#tl-arrow)" />
          {box(294, 72, 130, "pending receipt", "{status, operation}", AMBER)}
          <motion.rect x="430" y="70" width="230" height="44" rx="9" fill="none" stroke={AMBER} strokeOpacity="0.6" strokeDasharray="5 4" initial={{ strokeOpacity: 0.3 }} animate={{ strokeOpacity: [0.3, 0.8, 0.3] }} transition={{ duration: 2.6, ...loop }} />
          <text x="545" y="88" textAnchor="middle" fontSize="9.5" style={mono} fill={AMBER}>suspended · call id in the session</text>
          <text x="545" y="103" textAnchor="middle" fontSize="8" style={mono} fill="currentColor" opacity="0.6">minutes · nothing waiting · restarts survive</text>
          <line x1="662" y1="92" x2="680" y2="92" stroke={CYAN} strokeOpacity="0.9" strokeWidth="1.4" markerEnd="url(#tl-arrow)" />
          {box(682, 72, 118, "render_desk", "the call closes", AMBER, true)}
          <line x1="800" y1="92" x2="818" y2="92" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.2" markerEnd="url(#tl-arrow)" />
          {box(820, 72, 120, "store_release", "render_url → state", "currentColor")}

          {/* lane 2: the delivery, another process */}
          <text x="14" y="164" fontSize="9" style={mono} fill={CYAN}>python -m agent.deliver · another process, later</text>
          {box(430, 176, 110, "find the receipt", "in the session", CYAN)}
          <line x1="540" y1="196" x2="558" y2="196" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.2" markerEnd="url(#tl-arrow)" />
          {box(560, 176, 100, "wait for Veo", "check() · retries", CYAN)}
          <motion.path d="M660 196 L 672 196 L 672 116" fill="none" stroke={CYAN} strokeOpacity="0.9" strokeWidth="1.4" markerEnd="url(#tl-arrow)" initial={{ pathLength: 0 }} animate={{ pathLength: [0, 1, 1] }} transition={{ duration: 2.6, ...loop }} />
          <text x="684" y="160" fontSize="8.5" style={mono} fill={CYAN}>function_response(id, url)</text>

          {/* lane 3: Veo */}
          <text x="14" y="268" fontSize="9" style={mono} fill={GREEN}>Veo · in Google Cloud</text>
          <line x1="294" y1="114" x2="294" y2="256" stroke={GREEN} strokeOpacity="0.5" strokeWidth="1" strokeDasharray="3 3" />
          <text x="300" y="254" fontSize="8" style={mono} fill={GREEN} opacity="0.8">generate_videos → operation</text>
          <motion.rect x="294" y="262" height="8" rx="4" fill={GREEN} initial={{ width: 0 }} animate={{ width: [0, 300, 300] }} transition={{ duration: 2.6, ...loop }} />
          <rect x="294" y="262" width="300" height="8" rx="4" fill="none" stroke={GREEN} strokeOpacity="0.5" />
          <text x="602" y="270" fontSize="8.5" style={mono} fill={GREEN}>done · the mp4</text>
          {[0, 1, 2, 3].map((k) => (
            <line key={k} x1={575 + k * 24} y1={216} x2={575 + k * 24} y2={258} stroke={CYAN} strokeOpacity="0.5" strokeWidth="1" strokeDasharray="2 3" />
          ))}
          <text x="611" y="300" textAnchor="middle" fontSize="8" style={mono} fill={CYAN} opacity="0.9">operations.get, every ten seconds</text>
        </svg>
      </div>
      <figcaption className="mt-2 text-xs text-fg-muted">The workflow keeps the operation id, not a wait. The delivery answers that id from wherever it runs, even after a restart.</figcaption>
    </figure>
  );
}


/** Two processes and the session store between them: the paused workflow on
 *  the left, the delivery loop on the right, Veo below the loop. */
function PollerFigure() {
  const loop = { repeat: Infinity, repeatDelay: 0.6 };
  const box = (x: number, y: number, w: number, h: number, label: string, sub: string, color: string, dashed = false) => (
    <g key={label + x}>
      <rect x={x} y={y} width={w} height={h} rx={11} fill={tint(color, 0.08)} stroke={color} strokeOpacity="0.8" strokeDasharray={dashed ? "5 4" : undefined} />
      <text x={x + w / 2} y={y + 21} textAnchor="middle" fontSize="10.5" style={mono} fill={color}>{label}</text>
      <text x={x + w / 2} y={y + 37} textAnchor="middle" fontSize="8.5" style={mono} fill="currentColor" opacity="0.7">{sub}</text>
    </g>
  );
  return (
    <figure className="m-0 mt-4">
      <div className="overflow-x-auto">
        <svg viewBox="0 0 900 330" className="h-auto w-full min-w-[720px] text-fg" role="img" aria-label="Two processes where the workflow process is paused at render_desk with the pending call in the session store; the delivery process reads that call, polls Veo every ten seconds, and when the clip is done sends a function_response into the session, which restarts the workflow at store_release.">
          <defs>
            <marker id="pf-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" fill="currentColor" />
            </marker>
          </defs>

          {/* process 1: the workflow */}
          <rect x="14" y="14" width="300" height="230" rx="16" fill="var(--overlay)" stroke={AMBER} strokeOpacity="0.5" />
          <text x="30" y="36" fontSize="9.5" style={mono} fill={AMBER}>process 1 · the workflow (its Runner)</text>
          {box(30, 52, 268, 46, "scripter", "done", PURPLE)}
          <line x1="164" y1="98" x2="164" y2="112" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.2" markerEnd="url(#pf-arrow)" />
          {box(30, 114, 268, 46, "render_desk", "render_submit → pending · the run pauses here", AMBER, true)}
          <line x1="164" y1="160" x2="164" y2="174" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.2" markerEnd="url(#pf-arrow)" />
          {box(30, 176, 268, 46, "store_release", "runs only after the resume", "currentColor")}
          <text x="164" y="238" textAnchor="middle" fontSize="8.5" style={mono} fill="currentColor" opacity="0.6">idle while paused · may even be restarted</text>

          {/* the session store, between them */}
          <rect x="350" y="86" width="200" height="86" rx="12" fill="var(--card)" stroke="currentColor" strokeOpacity="0.5" />
          <text x="450" y="108" textAnchor="middle" fontSize="10" style={mono} fill="currentColor">the session store</text>
          <text x="450" y="124" textAnchor="middle" fontSize="8.5" style={mono} fill="currentColor" opacity="0.65">runs/sessions.db</text>
          <rect x="358" y="136" width="184" height="24" rx="6" fill={tint(AMBER, 0.12)} stroke={AMBER} strokeOpacity="0.8" />
          <text x="450" y="152" textAnchor="middle" fontSize="8.5" style={mono} fill={AMBER}>pending call · id · operation</text>
          <line x1="298" y1="137" x2="348" y2="137" stroke={AMBER} strokeOpacity="0.9" strokeWidth="1.3" markerEnd="url(#pf-arrow)" />
          <text x="323" y="130" textAnchor="middle" fontSize="8" style={mono} fill={AMBER}>writes</text>

          {/* process 2: the delivery */}
          <rect x="586" y="14" width="300" height="230" rx="16" fill="var(--overlay)" stroke={CYAN} strokeOpacity="0.5" />
          <text x="602" y="36" fontSize="9.5" style={mono} fill={CYAN}>process 2 · python -m agent.deliver</text>
          {box(602, 52, 268, 46, "find the pending call", "from the session store", CYAN)}
          <line x1="552" y1="137" x2="600" y2="137" stroke={CYAN} strokeOpacity="0.9" strokeWidth="1.3" markerEnd="url(#pf-arrow)" />
          <text x="576" y="130" textAnchor="middle" fontSize="8" style={mono} fill={CYAN}>reads</text>
          <line x1="736" y1="98" x2="736" y2="112" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.2" markerEnd="url(#pf-arrow)" />
          {box(602, 114, 268, 46, "videogen.check(operation)", "every ten seconds, until done", CYAN)}
          <motion.path d="M870 128 C 890 128, 890 152, 870 152" fill="none" stroke={CYAN} strokeWidth="1.3" markerEnd="url(#pf-arrow)" initial={{ pathLength: 0 }} animate={{ pathLength: [0, 1, 1] }} transition={{ duration: 1.6, ...loop }} />
          <line x1="736" y1="160" x2="736" y2="174" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.2" markerEnd="url(#pf-arrow)" />
          {box(602, 176, 268, 46, "function_response(id, url)", "sent into the same session", GREEN)}

          {/* the resume: back through the session into the workflow */}
          <motion.path d="M602 199 L 450 199 L 450 172" fill="none" stroke={GREEN} strokeWidth="1.4" markerEnd="url(#pf-arrow)" initial={{ pathLength: 0 }} animate={{ pathLength: [0, 1, 1] }} transition={{ duration: 2.2, delay: 0.8, ...loop }} />
          <motion.path d="M350 137 L 314 137 L 314 199 L 298 199" fill="none" stroke={GREEN} strokeWidth="1.4" markerEnd="url(#pf-arrow)" initial={{ pathLength: 0 }} animate={{ pathLength: [0, 1, 1] }} transition={{ duration: 2.2, delay: 1.6, ...loop }} />
          <text x="450" y="216" textAnchor="middle" fontSize="8.5" style={mono} fill={GREEN}>the call is answered · the run continues at store_release</text>

          {/* Veo */}
          <rect x="586" y="262" width="300" height="52" rx="12" fill={tint(GREEN, 0.06)} stroke={GREEN} strokeOpacity="0.6" />
          <text x="736" y="284" textAnchor="middle" fontSize="10" style={mono} fill={GREEN}>Veo · in Google Cloud</text>
          <text x="736" y="300" textAnchor="middle" fontSize="8.5" style={mono} fill="currentColor" opacity="0.65">operations.get answers with not yet, not yet, or done</text>
          <line x1="736" y1="222" x2="736" y2="260" stroke={GREEN} strokeOpacity="0.6" strokeWidth="1.2" strokeDasharray="3 3" />
        </svg>
      </div>
      <figcaption className="mt-2 text-xs text-fg-muted">The workflow process writes the pending call and stops. The delivery process reads it, polls Veo, and answers it; the answer restarts the workflow.</figcaption>
    </figure>
  );
}

/* ───────────────────────── 6a · the tool ───────────────────────── */

const CODE_VIDEOGEN = `# agent/platform/videogen.py
def start(script, *, retries=RETRIES, interval_s=INTERVAL_S) -> dict:
    """Submit one render. Returns at once with the operation name; that string
    is all a later process needs to find the work again."""
    ...
    op = _retry("submit", submit, retries, interval_s)
    return {"operation": op.name, "model": MODEL, "prompt": prompt, "submitted_at": time.time()}

def check(operation, *, retries=RETRIES, interval_s=INTERVAL_S) -> dict:
    """{"done": False} while it renders; {"done": True, "path": ..., "url": ...}
    once the mp4 is on disk; {"done": True, "error": ...} when Veo refused."""
    op = _retry("check", lambda: client().operations.get(gt.GenerateVideosOperation(name=operation)),
                retries, interval_s)
    if not op.done:
        return {"done": False, "operation": operation}
    ...`;

const CODE_SUBMIT = `# agent/desk.py
def render_submit(prompt: str) -> dict:
    """Submit one Veo render of \`prompt\`. Returns at once with a pending
    receipt; the clip is delivered later, to this call, by id."""
    receipt = videogen.start(f"{prompt} {videogen.NO_TEXT}")
    return {"status": "pending", "operation": receipt["operation"], "prompt": receipt["prompt"]}`;

const CODE_DELIVER = `# agent/deliver.py · the loop that polls Veo
row = drive.run(find_pending())[0]            # the pending call, read from the session store
deadline = time.time() + videogen.TIMEOUT_S
while time.time() < deadline:
    status = videogen.check(row["operation"])  # one operations.get, with retries
    if status["done"]:
        break
    time.sleep(POLL_S)                         # ten seconds, then ask again
# then: write the result to runs/state.json, and restart the run by sending
# the paused session a function_response with the pending call's id
part = Part(function_response=FunctionResponse(
    id=row["call_id"], name="render_submit", response={"status": "done", "url": url}))
async for ev in runner.run_async(user_id=row["user"], session_id=row["session"],
                                 new_message=Content(role="user", parts=[part])):
    ...                                        # render_desk completes, store_release runs`;

export function TheTool() {
  const [hint, setHint] = useState(0);
  const [hint2, setHint2] = useState(0);
  const { status, check } = useStage6();
  const wrapped = status?.tool_wrapped ?? false;
  return (
    <div className="space-y-12">
      <StepHeader
        kicker="Step 6a · A long-running tool"
        color={CYAN}
        title="A tool that answers later."
        blurb="Long-running operations such as media synthesis should not block graph worker processes synchronously. Wrapping tool functions in LongRunningFunctionTool allows the node to submit jobs, record pending receipts in session storage, and suspend execution safely until asynchronous workers complete."
      />

      <In delay={0.1}>
        <section className="rounded-3xl border border-hairline bg-card p-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-fg-muted">How it moves</p>
          <h2 className="font-display mt-2 text-2xl">Decoupled asynchronous processing lifecycle.</h2>
          <p className="mt-2 max-w-3xl text-sm text-fg-muted">
            The <code className="font-mono text-fg">render_desk</code> agent submits the video generation job to Veo and receives a pending receipt. The workflow execution immediately suspends, persisting the open call identifier to session state. An external poller independently tracks generation progress and resumes execution once the asset is ready.
          </p>
          <TimelineFigure />
        </section>
      </In>

      <In delay={0.3}>
        <EditPanel
          label="Edit 1 of 2"
          title="Wrap render_submit as a LongRunningFunctionTool."
          intro={
            <>
              <code className="font-mono text-fg">render_desk</code> receives the structured script, formats the video prompt, and invokes <code className="font-mono text-fg">render_submit</code>. In <code className="font-mono text-fg">stage6_video/agent.py</code>, wrap <code className="font-mono text-fg">render_submit</code> with <code className="font-mono text-fg">LongRunningFunctionTool(render_submit)</code>. Wrapping converts the tool into an asynchronous handler, ensuring that returning a pending receipt suspends the workflow at this node rather than blocking the worker process.
            </>
          }
          pill={status ? (wrapped ? "LongRunningFunctionTool ✓" : status.tool === "plain" ? "a plain function tool" : "render_submit not in tools") : "…"}
          ok={wrapped}
          hint={hint}
          setHint={setHint}
          hint1={<>The tools list holds the wrapper, and the wrapper holds the function.</>}
          hint2={`    tools=[LongRunningFunctionTool(render_submit)])`}
          path="stage6_video/agent.py"
          symbol="render_desk"
          pattern={/TODO: VIDEO_TOOL|LongRunningFunctionTool\(render_submit\)/}
          onSaved={check}
        />
      </In>

      <In delay={0.4}>
        <section className="rounded-3xl border border-hairline bg-card p-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-fg-muted">The tool</p>
          <h2 className="font-display mt-2 text-2xl">Pending receipts and session suspension mechanics.</h2>
          <p className="mt-2 max-w-3xl text-sm text-fg-muted">
            <code className="font-mono text-fg">render_submit</code> calls <code className="font-mono text-fg">videogen.start</code>, which initiates the generation operation on GEAP and returns the operation identifier immediately. The tool returns a dictionary with <code className="font-mono text-fg">status</code> set to <code className="font-mono text-fg">"pending"</code>. Because the tool is wrapped in <code className="font-mono text-fg">LongRunningFunctionTool</code>, ADK interprets the pending status as an interrupted call. The turn completes, execution suspends, and the session records the pending call ID and operation name.
          </p>
          <div className="mt-4 grid gap-4">
            <div className="overflow-hidden rounded-2xl border border-hairline bg-input">
              <div className="border-b border-hairline px-4 py-1.5 font-mono text-[10px] uppercase tracking-wider text-fg-muted">agent/desk.py · render_submit</div>
              <pre className="overflow-x-auto px-4 py-3 font-mono text-[11px] leading-relaxed text-fg">
                <code>{CODE_SUBMIT}</code>
              </pre>
            </div>
            <div className="overflow-hidden rounded-2xl border border-hairline bg-input">
              <div className="border-b border-hairline px-4 py-1.5 font-mono text-[10px] uppercase tracking-wider text-fg-muted">agent/platform/videogen.py · start and check</div>
              <pre className="max-h-80 overflow-auto px-4 py-3 font-mono text-[11px] leading-relaxed text-fg">
                <code>{CODE_VIDEOGEN}</code>
              </pre>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-hairline bg-overlay p-4 text-sm">
              <p className="font-mono text-[10px] uppercase tracking-wider text-fg-muted">retries</p>
              <p className="mt-1 text-fg-muted">
                Eight attempts, seventy seconds apart, across submit, check, and download operations for Veo. <code className="font-mono text-fg">STUDIO_VIDEO_RETRIES</code>{" "}
                and <code className="font-mono text-fg">STUDIO_VIDEO_INTERVAL</code> in <code className="font-mono text-fg">.env</code> configure these intervals.
              </p>
            </div>
            <div className="rounded-2xl border border-hairline bg-overlay p-4 text-sm">
              <p className="font-mono text-[10px] uppercase tracking-wider text-fg-muted">cost</p>
              <p className="mt-1 text-fg-muted">
                One Veo clip per run{status ? (status.real_video ? ", and this server renders for real" : ", and this server uses STUDIO_REAL_VIDEO=0 with a stand-in receipt that finishes in five seconds without generating media") : ""}.
                Set <code className="font-mono text-fg">STUDIO_REAL_VIDEO=0</code> in <code className="font-mono text-fg">.env</code> to take the same path at no cost.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <SourceToggle path="agent/platform/videogen.py" label="agent/platform/videogen.py · Veo, with retries" />
            <SourceToggle path="agent/desk.py" label="agent/desk.py · render_desk and its tool" />
          </div>
        </section>
      </In>

      <In delay={0.5}>
        <section className="rounded-3xl border border-hairline bg-card p-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-fg-muted">Who polls Veo</p>
          <h2 className="font-display mt-2 text-2xl">External worker polling and session resumption.</h2>
          <p className="mt-2 max-w-3xl text-sm text-fg-muted">
            While the workflow is suspended, no compute resources or threads are held open waiting for the render. An independent delivery worker (<code className="font-mono text-fg">agent.deliver</code>) queries the session store for pending calls and periodically polls Veo via <code className="font-mono text-fg">videogen.check</code> until completion.
          </p>
          <p className="mt-2 max-w-3xl text-sm text-fg-muted">
            Upon completion, the worker records the artifact URL to <code className="font-mono text-fg">runs/state.json</code> and dispatches a <code className="font-mono text-fg">function_response</code> message targeted to the pending call's ID. ADK matches the response to the suspended tool call, resumes workflow execution from the exact point of suspension, and routes forward to <code className="font-mono text-fg">store_release</code>. In the production app, the server handles this lifecycle automatically in background threads.
          </p>
          <PollerFigure />
          <div className="mt-4 overflow-hidden rounded-2xl border border-hairline bg-input">
            <div className="border-b border-hairline px-4 py-1.5 font-mono text-[10px] uppercase tracking-wider text-fg-muted">agent/deliver.py · the polling loop</div>
            <pre className="overflow-x-auto px-4 py-3 font-mono text-[11px] leading-relaxed text-fg">
              <code>{CODE_DELIVER}</code>
            </pre>
          </div>
        </section>
      </In>

      <In delay={0.55}>
        <EditPanel
          label="Edit 2 of 2"
          title="Construct FunctionResponse to resume execution."
          intro={
            <>
              In <code className="font-mono text-fg">agent/deliver.py</code>, complete <code className="font-mono text-fg">_answer</code> to construct the resumption event. Replace the TODO line with a <code className="font-mono text-fg">Part(function_response=FunctionResponse(...))</code> carrying <code className="font-mono text-fg">id=row["call_id"]</code>, <code className="font-mono text-fg">name=row["name"]</code>, and <code className="font-mono text-fg">response=response</code>. Dispatching this part resolves the pending tool call and resumes workflow execution.
            </>
          }
          pill={status ? (status.deliver_wired ? "FunctionResponse built ✓" : "the TODO line is still there") : "…"}
          ok={status?.deliver_wired ?? false}
          hint={hint2}
          setHint={setHint2}
          hint1={<>Construct a <code className="font-mono">Part(function_response=FunctionResponse(...))</code> with <code className="font-mono">id=row["call_id"]</code>, <code className="font-mono">name=row["name"]</code>, and <code className="font-mono">response=response</code>.</>}
          hint2={`    part = Part(function_response=FunctionResponse(
        id=row["call_id"], name=row["name"], response=response))`}
          path="agent/deliver.py"
          symbol="_answer"
          pattern={/TODO: DELIVER_RESPONSE|function_response=FunctionResponse\(/}
          onSaved={check}
        />
      </In>

      <In delay={0.6}>
        <section className="rounded-3xl border border-hairline bg-card p-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-fg-muted">Next</p>
          <p className="mt-1 max-w-3xl text-sm text-fg-muted">
            render_desk is defined, its tool is long-running, and the delivery knows how to answer the call. The node is not in the graph yet. 6b adds the
            last chain, runs the workflow until it pauses, and delivers the clip from the console.
          </p>
        </section>
      </In>
    </div>
  );
}

/* ───────────────────────── 6b · the desk ───────────────────────── */

const CODE_STORE = `# agent/graph.py
join_media = JoinNode(name="join_media")      # waits for the clip AND the poster

def store_release(node_input, poster_url: str = "", poster_path: str = ""):
    """After the join: the delivered render, from runs/state.json where deliver
    wrote it, and the poster from the join, into shared state and the run's output.
    A real poster is described in one sentence and remembered as the creator's
    visual taste (Memory Bank, VISUAL_STYLE)."""
    render = state.load().get("render") or {}
    url, status = render.get("url") or "", render.get("status", "")
    bundle = _as_dict(node_input)                      # {"render_desk": ..., "make_poster": {...}}
    poster = bundle.get("make_poster") or {}
    poster_url = poster.get("url") or poster_url
    if poster.get("path") and not poster.get("prebaked"):
        _remember_poster(poster["path"])
    yield Event(output={"status": status, "url": url, "poster_url": poster_url},
                state={"render_url": url, "render_status": status, "poster_url": poster_url},
                message=f"video: {url or status} · poster: {poster_url or 'none'}")`;

const DEFAULT_VIDEO_IDEA = "a tiny dragon guards the last Halloween cookie";

function WorkflowFigure() {
  const node = (cx: number, cy: number, label: string, kind: "func" | "join" | "agent" | "human" | "router" | "task" | "new" | "newfunc" | "newjoin") => {
    const color = kind === "agent" || kind === "task" ? PURPLE : kind === "join" ? CYAN : kind === "human" ? AMBER : kind === "router" ? RED : kind === "new" || kind === "newfunc" || kind === "newjoin" ? AMBER : "currentColor";
    const lit = kind === "new" || kind === "newfunc" || kind === "newjoin";
    return (
      <g key={label}>
        {lit && <rect x={cx - 58} y={cy - 19} width="116" height="38" rx="11" fill="none" stroke={AMBER} strokeOpacity="0.35" strokeWidth="6" />}
        <rect x={cx - 52} y={cy - 13} width="104" height="26" rx="8" fill={lit ? tint(AMBER, 0.15) : kind === "func" ? "var(--overlay)" : tint(color, 0.08)} stroke={lit ? AMBER : kind === "func" ? "var(--hairline)" : color} strokeWidth={lit ? 1.6 : 1.1} />
        <text x={cx} y={cy + 4} fontSize="9" style={mono} textAnchor="middle" fill={lit ? AMBER : kind === "func" ? "currentColor" : color}>{label}</text>
      </g>
    );
  };
  const edge = (x1: number, y1: number, x2: number, y2: number, color = "currentColor", dashed = false) => <line key={`${x1}${y1}${x2}${y2}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeOpacity={color === "currentColor" ? 0.55 : 0.9} strokeWidth={color === AMBER ? 1.8 : 1.2} strokeDasharray={dashed ? "4 3" : undefined} markerEnd="url(#wf8-arrow)" />;
  return (
    <figure className="m-0 mt-4">
      <div className="overflow-x-auto">
        <svg viewBox="0 0 1180 330" className="h-auto w-full min-w-[900px] text-fg" role="img" aria-label="The whole workflow. After the script loop, script_ready fans out to render_desk, the long-running Veo tool, and make_poster, the image model; both meet at join_media, and store_release ends the run.">
          <defs>
            <marker id="wf8-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" fill="currentColor" />
            </marker>
          </defs>
          <circle cx="28" cy="120" r="12" fill="var(--overlay)" stroke="currentColor" strokeOpacity="0.6" />
          <text x="28" y="124" fontSize="8.5" style={mono} textAnchor="middle" fill="currentColor">START</text>
          {node(110, 60, "scan_trends", "func")}
          {node(110, 120, "read_backlog", "func")}
          {node(110, 190, "read_feedback", "func")}
          {node(228, 120, "join_research", "join")}
          {node(348, 120, "propose_directions", "agent")}
          {node(468, 120, "direction_gate", "human")}
          {node(588, 120, "persist_direction", "func")}
          {node(708, 120, "policy_check", "router")}
          {node(840, 65, "scripter", "agent")}
          {node(840, 195, "quarantine", "task")}
          {node(960, 65, "script_check", "router")}
          {node(1080, 65, "script_ready", "func")}
          {node(1080, 180, "render_desk", "new")}
          {node(900, 290, "make_poster", "newfunc")}
          {node(1080, 290, "join_media", "newjoin")}
          {node(960, 180, "store_release", "newfunc")}
          {edge(40, 114, 58, 66)}
          {edge(40, 120, 58, 120)}
          {edge(40, 126, 58, 184)}
          {edge(162, 60, 176, 114)}
          {edge(162, 120, 176, 120)}
          {edge(162, 190, 176, 126)}
          {edge(280, 120, 296, 120)}
          {edge(400, 120, 416, 120)}
          {edge(520, 120, 536, 120)}
          {edge(640, 120, 656, 120)}
          {edge(760, 112, 788, 70, GREEN)}
          <text x="770" y="84" fontSize="8.5" style={mono} fill={GREEN}>OK</text>
          {edge(760, 128, 788, 190, RED)}
          <text x="764" y="170" fontSize="8.5" style={mono} fill={RED}>BLOCK</text>
          <path d="M892 195 C 915 195, 915 65, 894 65" fill="none" stroke={PURPLE} strokeOpacity="0.8" strokeWidth="1.2" strokeDasharray="4 3" markerEnd="url(#wf8-arrow)" />
          {edge(892, 65, 906, 65)}
          <path d="M960 52 C 960 20, 840 20, 840 50" fill="none" stroke={AMBER} strokeOpacity="0.8" strokeWidth="1.2" strokeDasharray="4 3" markerEnd="url(#wf8-arrow)" />
          <text x="900" y="18" fontSize="8.5" style={mono} textAnchor="middle" fill={AMBER}>REVISE</text>
          {edge(1012, 65, 1026, 65, GREEN)}
          <text x="1019" y="56" fontSize="8.5" style={mono} textAnchor="middle" fill={GREEN}>OK</text>
          {edge(1080, 78, 1080, 165, AMBER)}
          <path d="M1040 78 C 980 120, 900 200, 900 275" fill="none" stroke={AMBER} strokeOpacity="0.9" strokeWidth="1.8" markerEnd="url(#wf8-arrow)" />
          {edge(1080, 193, 1080, 275, AMBER)}
          {edge(952, 290, 1026, 290, AMBER)}
          <path d="M1028 283 C 1000 260, 990 220, 980 195" fill="none" stroke={AMBER} strokeOpacity="0.9" strokeWidth="1.8" markerEnd="url(#wf8-arrow)" />
          <text x="1140" y="130" fontSize="8.5" style={mono} textAnchor="middle" fill={AMBER}>minutes</text>
          <text x="1140" y="142" fontSize="8.5" style={mono} textAnchor="middle" fill={AMBER}>suspends, pending</text>
          <text x="960" y="236" fontSize="8.5" style={mono} textAnchor="middle" fill={AMBER}>seconds</text>
          <text x="1080" y="318" fontSize="8.5" style={mono} textAnchor="middle" fill={AMBER}>waits for the slow one</text>
          <text x="960" y="212" fontSize="8.5" style={mono} textAnchor="middle" fill={AMBER}>runs on delivery</text>
        </svg>
      </div>
      <figcaption className="mt-2 text-xs text-fg-muted">Two branches leave script_ready at once. make_poster finishes in seconds; render_desk submits to Veo and the run stops inside it, the session keeping the receipt. join_media waits for both; store_release runs when the delivery resumes the session.</figcaption>
    </figure>
  );
}

type VideoCmd = "deliver" | "status";
const VIDEO_COMMANDS: { cmd: VideoCmd; line: string; what: string }[] = [
  { cmd: "status", line: "python -m agent.deliver status", what: "Lists the pending renders across stage6_video sessions, showing session, call id, and operation." },
  { cmd: "deliver", line: "python -m agent.deliver", what: "Takes the newest pending render, polls Veo until the clip exists, writes the result to runs/state.json, and resumes the session with a function_response for the call's id. The graph continues; the nodes it runs print here." },
];

function DeliverRunner({ onDone, onShow }: { onDone: () => void; onShow: () => void }) {
  const [lines, setLines] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState<VideoCmd | null>(null);
  const [exit, setExit] = useState<number | null>(null);
  const runId = useRef<string | null>(null);  // the token the server minted for this run
  const waitedFor = useRef(0);        // polls spent without the server admitting to a run
  const seenRunning = useRef(false);  // the worker was observed live at least once
  const [overlay, setOverlay] = useState(false);
  const lastCmd = useRef<VideoCmd>("deliver");
  useRunEvents((verb, line) => {
    if (verb === "deliver") setLines((l) => [...l.slice(-199), line]);
  });
  useEffect(() => {
    api.videoStatus().then((st) => {
      if (st.running) {
        // a command started elsewhere: any exit that follows is its own
        runId.current = null;
        seenRunning.current = true;
        setRunning(true);
        setLines(["a deliver command is already running on this server; its remaining output appears here"]);
      }
    });
  }, []);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(async () => {
      const st = await api.videoStatus();
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
            setLines((l) => [...l, `lost track of the command · read runs/deliver_run.log`]);
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
        const log = await api.workerLog("deliver");
        if (log.lines.length) setLines(log.lines);
      } catch {
        /* the live lines are all there is */
      }
      onDone();
    }, 1500);
    return () => clearInterval(t);
  }, [running, onDone]);
  const run = async (cmd: VideoCmd) => {
    setLines([]);
    setExit(null);
    lastCmd.current = cmd;
    setOverlay(true);  // every command opens a window: a click has to show something
    let r: { ok: boolean; detail: string; run?: string };
    try {
      r = (await api.videoRun(cmd)) as { ok: boolean; detail: string; run?: string };
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
  return (
    <>
      {overlay && (
        <DeliverOverlay
          cmd={lastCmd.current}
          lines={lines}
          running={running}
          exit={exit}
          onClose={() => setOverlay(false)}
          onShow={() => {
            setOverlay(false);
            onShow();
          }}
        />
      )}
      <ol className="mt-4 grid gap-3 md:grid-cols-2">
        {VIDEO_COMMANDS.map((c) => (
          <li key={c.cmd} className="rounded-2xl border border-hairline bg-overlay p-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(c.line);
                  setCopied(c.cmd);
                  setTimeout(() => setCopied(null), 1200);
                }}
                className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-lg border border-hairline bg-input px-3 py-2 text-left font-mono text-xs text-fg hover:border-vibe-cyan/60"
                title="copy for a terminal"
              >
                <span className="truncate">{c.line}</span>
                <span className="shrink-0 text-[10px] text-fg-muted">{copied === c.cmd ? "copied" : "copy"}</span>
              </button>
              <button onClick={() => run(c.cmd)} disabled={running} className="shrink-0 rounded-lg px-3 py-2 font-mono text-xs font-bold text-white disabled:opacity-40" style={{ background: AMBER }}>
                run
              </button>
            </div>
            <p className="mt-2 text-xs text-fg-muted">{c.what}</p>
          </li>
        ))}
      </ol>
      {(lines.length > 0 || running) && (
        <div className="mt-4 overflow-hidden rounded-2xl border border-hairline bg-input">
          <div className="flex items-center justify-between border-b border-hairline px-4 py-1.5 font-mono text-[10px] uppercase tracking-wider text-fg-muted">
            <span>python -m agent.deliver · output</span>
            <span>{running ? "running…" : exit === 0 ? "done" : exit === null ? "" : `exit ${exit}`}</span>
          </div>
          {!running && exit === 0 && (
            <div className="flex flex-col gap-3 border-b border-hairline px-4 py-3 md:flex-row md:items-center md:justify-between">
              <p className="text-xs text-fg-muted">
                Delivered. adk web does not re-read a session on its own, so the frame above still shows the run ending at the receipt.
              </p>
              <button onClick={onShow} className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 font-mono text-xs font-bold text-white" style={{ background: AMBER }}>
                <RefreshCw size={13} /> Refresh adk web
              </button>
            </div>
          )}
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap px-4 py-3 font-mono text-[11px] leading-relaxed text-fg">
            {lines.filter((l) => !/Warning|warn\(/.test(l)).join("\n") || (running ? "starting…" : "")}
          </pre>
        </div>
      )}
    </>
  );
}

/** The delivery, as a modal: find the receipt, wait for Veo, answer by id,
 *  the graph continues. Progress follows the output lines. */
function DeliverOverlay({ cmd, lines, running, exit, onClose, onShow }: { cmd: VideoCmd; lines: string[]; running: boolean; exit: number | null; onClose: () => void; onShow: () => void }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  const clean = lines.filter((l) => !/Warning|warn\(/.test(l));
  const text = clean.join("\n");
  const done = !running && exit !== null;
  const failed = done && exit !== 0;
  const found = /pending render found/.test(text);
  const checks = clean.filter((l) => /check \d+:/.test(l)).length;
  const ready = /clip ready|render failed/.test(text);
  const answered = /answering call/.test(text);
  const continued = /store_release|join_media/.test(text) || /delivered/.test(text);
  const stage = continued ? 4 : answered ? 3 : ready ? 3 : found ? 2 : 1;
  const loop = done ? { repeat: 0 } : { repeat: Infinity };
  const steps = [
    { name: "find the receipt", sub: "in the session store", color: CYAN },
    { name: "wait for Veo", sub: checks ? `check ${checks} · 10 s apart` : "operations.get", color: GREEN },
    { name: "answer by id", sub: "function_response", color: AMBER },
    { name: "the graph continues", sub: "join_media → store_release", color: PURPLE },
  ];
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)" }} role="dialog" aria-modal="true" aria-label="Delivering the render">
      <motion.div initial={{ y: 16, scale: 0.98 }} animate={{ y: 0, scale: 1 }} className="w-full max-w-3xl overflow-hidden rounded-3xl border border-hairline bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-hairline px-5 py-3">
          <div className="flex items-center gap-3">
            {!done && <RefreshCw size={14} className="animate-spin" style={{ color: AMBER }} />}
            <span className="font-mono text-xs text-fg">python -m agent.deliver</span>
          </div>
          <span className="font-mono text-[11px]" style={{ color: failed ? RED : done ? GREEN : "var(--fg-muted)" }}>
            {done ? (failed ? `exited with ${exit}` : "done") : "running on this server…"}
          </span>
        </div>
        <div className="p-5">
          <p className="text-sm text-fg-muted">
            {cmd === "deliver"
              ? "Another process reads the pending call from the session store, waits for Veo, and resumes the same session with a function_response for that call's id. With a real render this takes a minute or three; the stand-in finishes in seconds."
              : "Every pending render this server can find in the stage6_video sessions, showing the session, the call id, and the Veo operation the delivery would ask about."}
          </p>
          {cmd === "deliver" && (
          <svg viewBox="0 0 620 130" className="mt-3 h-auto w-full text-fg" role="img" aria-label="Four stages showing find the receipt, wait for Veo, answer by id, and the graph continues.">
            {steps.map((s, i) => {
              const x = 14 + i * 150;
              const active = stage === i + 1 && !done;
              const past = stage > i + 1 || done;
              return (
                <g key={s.name}>
                  <motion.rect x={x} y={20} width={136} height={70} rx={12} fill={past || active ? tint(s.color, 0.1) : "var(--overlay)"} stroke={past || active ? s.color : "var(--hairline)"} strokeWidth={active ? 1.8 : 1.2} initial={{ strokeOpacity: 0.6 }} animate={active ? { strokeOpacity: [0.4, 1, 0.4] } : { strokeOpacity: past ? 1 : 0.6 }} transition={{ duration: 1.4, ...loop }} />
                  <text x={x + 68} y={48} textAnchor="middle" fontSize="11" style={mono} fill={past || active ? s.color : "currentColor"}>{s.name}</text>
                  <text x={x + 68} y={66} textAnchor="middle" fontSize="8.5" style={mono} fill="currentColor" opacity="0.65">{s.sub}</text>
                  <text x={x + 68} y={82} textAnchor="middle" fontSize="8.5" style={mono} fill={past ? GREEN : "currentColor"} opacity={past ? 1 : 0.5}>{past ? "done" : active ? "working…" : "waiting"}</text>
                  {i < 3 && <line x1={x + 138} y1={55} x2={x + 162} y2={55} stroke="currentColor" strokeOpacity="0.4" strokeWidth="1.2" />}
                </g>
              );
            })}
            <rect x="14" y="110" width="592" height="8" rx="4" fill="var(--overlay)" stroke="var(--hairline)" />
            <motion.rect x="14" y="110" height="8" rx="4" fill={AMBER} initial={{ width: 0 }} animate={{ width: (592 * (done ? 4 : stage - 1 + 0.5)) / 4 }} transition={{ duration: 0.6 }} />
          </svg>
          )}
        </div>
        <div className="border-t border-hairline bg-input">
          <div className="flex items-center justify-between border-b border-hairline px-4 py-1.5 font-mono text-[10px] uppercase tracking-wider text-fg-muted">
            <span>output</span>
            <span className="normal-case tracking-normal">the whole run is in runs/deliver_run.log</span>
          </div>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap px-4 py-3 font-mono text-[11px] leading-relaxed text-fg">{clean.slice(-30).join("\n") || "starting… finding the pending render in the session store"}</pre>
        </div>
        {done ? (
          <DoneBanner
            failed={failed}
            exit={exit}
            onClose={onClose}
            message={cmd === "deliver"
              ? "The clip was delivered to the pending call and the run finished. adk web still shows the run ending at the receipt until the session is reloaded."
              : "That is every pending render in the session store. Run the delivery to answer the newest one."}
            extra={cmd !== "deliver" ? null : (
              <button onClick={onShow} className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white" style={{ background: AMBER }}>
                <RefreshCw size={14} /> Refresh adk web
              </button>
            )}
          />
        ) : (
          <div className="flex items-center justify-end gap-3 border-t border-hairline px-5 py-3">
            <span className="text-xs text-fg-muted">The page is locked until the command finishes.</span>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

export function TheDesk() {
  const [idea, setIdea] = useState(DEFAULT_VIDEO_IDEA);
  const [hint, setHint] = useState(0);
  const [hint2, setHint2] = useState(0);
  const { status, checking, check, open, setOpen } = useStage6();
  const [frame, setFrame] = useState<{ url: string; n: number } | null>(null);
  /** Reload the embedded dev UI on the latest session, so the events the
   *  delivery wrote from another process are on screen. */
  const showInAdkWeb = useCallback(async () => {
    const st = await api.labStage6();
    const sess = st.session;
    const url = sess ? `/inspector/dev-ui/?app=stage6_video&userId=${encodeURIComponent(sess.user)}&session=${encodeURIComponent(sess.id)}` : `/inspector/dev-ui/?app=stage6_video`;
    setFrame((f) => ({ url, n: (f?.n ?? 0) + 1 }));
    setOpen(() => true);
  }, [setOpen]);
  const wired = status?.chain_wired ?? false;
  const mediaOk = status?.media_wired ?? false;
  const wrapped = status?.tool_wrapped ?? false;
  const pending = status?.pending ?? null;
  const submitted = status?.submitted ?? null;
  const delivered = status?.delivered ?? false;
  return (
    <div className="space-y-12">
      <StepHeader
        kicker="Step 6b · The desk in the graph"
        color={CYAN}
        title="The clip and the poster, side by side."
        blurb="The media desk is a fan-out and a join, the structure of 3a, with a long-running branch. script_ready sends the script to render_desk (Veo, minutes, the run suspends) and to make_poster (the image model, seconds). join_media waits for the slow one; store_release keeps the pair and remembers the poster as the creator's taste."
      />

      <In delay={0.2}>
        <section className="rounded-3xl border border-hairline bg-card p-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-fg-muted">The nodes after the desk</p>
          <h2 className="font-display mt-2 text-2xl">A join that waits for the slow branch, and a release.</h2>
          <p className="mt-2 max-w-3xl text-sm text-fg-muted">
            <code className="font-mono text-fg">make_poster</code> is the step 2 tool as a node: the script's poster idea, the channel's style, and what
            Memory Bank knows about the creator's taste in posters (bound from state as <code className="font-mono text-fg">memory_facts</code>). It
            returns in seconds. <code className="font-mono text-fg">render_desk</code> returns a receipt and the run suspends. The delivery writes the clip
            to <code className="font-mono text-fg">runs/state.json</code> and resumes the session; <code className="font-mono text-fg">join_media</code> releases,
            and <code className="font-mono text-fg">store_release</code> writes <code className="font-mono text-fg">render_url</code> and{" "}
            <code className="font-mono text-fg">poster_url</code> to state.
          </p>
          <div className="mt-4 overflow-hidden rounded-2xl border border-hairline bg-input">
            <div className="border-b border-hairline px-4 py-1.5 font-mono text-[10px] uppercase tracking-wider text-fg-muted">agent/graph.py · join_media and store_release</div>
            <pre className="overflow-x-auto px-4 py-3 font-mono text-[11px] leading-relaxed text-fg">
              <code>{CODE_STORE}</code>
            </pre>
          </div>
          <WorkflowFigure />
        </section>
      </In>

      <In delay={0.3}>
        <EditPanel
          label="Edit 1 of 2"
          title="Send the script to the desk, and on to the join."
          intro={
            <>
              Only the <code className="font-mono text-fg">Workflow</code> is shown. After the script loop, add the desk's branch:{" "}
              <code className="font-mono text-fg">(script_ready, render_desk, join_media)</code>. join_media is a JoinNode defined above the Workflow; it
              waits for this branch and for the poster's.
            </>
          }
          pill={status ? (wired ? "script_ready → render_desk → join_media ✓" : "the graph ends at script_ready") : "…"}
          ok={wired}
          hint={hint}
          setHint={setHint}
          hint1={<>One more tuple at the end of the list, with the same shape as the fan-out chains: it starts at <code className="font-mono">script_ready</code>.</>}
          hint2={`    edges=[(START, scan_trends, join_research),
           (START, read_backlog, join_research),
           (START, read_feedback, join_research),
           (join_research, propose_directions, direction_gate,
            persist_direction, policy_check),
           (policy_check, {"OK": scripter, "BLOCK": quarantine}),
           (quarantine, scripter),
           (scripter, script_check),
           (script_check, {"REVISE": scripter, "OK": script_ready}),
           (script_ready, render_desk, join_media)]`}
          path="stage6_video/agent.py"
          symbol="root_agent"
          pattern={/TODO: VIDEO_EDGES|render_desk, join_media\)/}
          onSaved={check}
        />
      </In>

      <In delay={0.32}>
        <EditPanel
          label="Edit 2 of 2"
          title="The poster's branch, and the join's exit."
          intro={
            <>
              Only <code className="font-mono text-fg">MEDIA_EDGES</code> is shown; the Workflow adds it to its edge list. Two tuples: the poster's branch,{" "}
              <code className="font-mono text-fg">(script_ready, make_poster, join_media)</code>, and the join's exit,{" "}
              <code className="font-mono text-fg">(join_media, store_release)</code>. Both branches leave script_ready at once; the join waits for the slow one.
            </>
          }
          pill={status ? (mediaOk ? "both branches meet at join_media ✓" : "MEDIA_EDGES is empty") : "…"}
          ok={mediaOk}
          hint={hint2}
          setHint={setHint2}
          hint1={<>A list of two tuples. The first looks like edit 1 with <code className="font-mono">make_poster</code> in the middle; the second is two names.</>}
          hint2={`MEDIA_EDGES = [(script_ready, make_poster, join_media), (join_media, store_release)]`}
          path="stage6_video/agent.py"
          symbol="MEDIA_EDGES"
          pattern={/TODO: MEDIA_JOIN|MEDIA_EDGES = /}
          onSaved={check}
        />
      </In>

      <In delay={0.35}>
        <LoadCheck app="stage6_video" intro="Save, then verify module loading to confirm the completed pipeline edges import cleanly without errors." />
      </In>

      <In delay={0.4}>
        <RunPanel
          app="stage6_video"
          open={open}
          setOpen={setOpen}
          title="Run it until it suspends."
          intro={`Send an idea and pick a direction. After the script loop, two branches light together: make_poster returns a poster in seconds, render_desk submits the clip and the run stops on the pending receipt.${status && !status.real_video ? " With STUDIO_REAL_VIDEO=0 the receipt is a stand-in, instant and free." : status?.real_video ? " With real video on, Veo takes one to three minutes." : ""}`}
          idea={idea}
          setIdea={setIdea}
          frame={frame}
          steps={[
            "After script_ready, open make_poster's event: a URL under /static/posters, drawn from the script's poster_idea. Open render_desk's events: the function call to render_submit, the pending receipt, the WAITING reply. The run ends here; join_media has one of two.",
            "Run the delivery below. When it finishes, click Refresh adk web to reopen the session: the function_response follows the pending call, join_media releases, and store_release writes render_url and poster_url to state.",
          ]}
        />
      </In>

      <In delay={0.45}>
        <section className="rounded-3xl border border-hairline bg-card p-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em]" style={{ color: AMBER }}>
            Console
          </p>
          <h2 className="font-display mt-2 text-2xl">Deliver completed asset and resume execution.</h2>
          <p className="mt-2 max-w-3xl text-sm text-fg-muted">
            Trigger the delivery worker below to locate the pending call in session storage, poll the operation until finished, and transmit the resumption FunctionResponse to complete the pipeline.
          </p>
          <DeliverRunner onDone={check} onShow={showInAdkWeb} />
          <div className="flex flex-wrap gap-3">
            <SourceToggle path="agent/deliver.py" label="agent/deliver.py · find, wait, answer by id" />
          </div>
        </section>
      </In>

      <In delay={0.5}>
        <VerifyPanel checking={checking} onCheck={check} intro="Read from this step's app file, the latest stage6_video session's events and state, and runs/state.json.">
          <CheckRow ok={wrapped} label="render_submit is a LongRunningFunctionTool">
            {status ? (wrapped ? "Wrapped, in stage6_video/agent.py." : "6a, edit 1.") : "…"}
          </CheckRow>
          <CheckRow ok={status?.deliver_wired ?? false} label="the delivery builds the FunctionResponse">
            {status ? (status.deliver_wired ? "In agent/deliver.py." : "6a, edit 2.") : "…"}
          </CheckRow>
          <CheckRow ok={wired} label="script_ready → render_desk → join_media">
            {status ? (wired ? "In the edge list." : "Edit 1 above.") : "…"}
          </CheckRow>
          <CheckRow ok={mediaOk} label="the poster's branch and the join's exit">
            {status ? (mediaOk ? "In MEDIA_EDGES." : "Edit 2 above.") : "…"}
          </CheckRow>
          <CheckRow ok={!!submitted} label="render_desk submitted a render">
            {submitted ? `call ${submitted.call_id.slice(0, 8)} · ${submitted.operation || "(operation in the receipt)"} · ${submitted.prompt.slice(0, 80)}…` : "No run reached the desk yet."}
          </CheckRow>
          <CheckRow ok={!!pending || delivered} label={pending ? "the workflow is suspended on the receipt" : "the receipt was answered"}>
            {pending ? "Pending. The run ended here; deliver below." : delivered ? `Delivered · render_status ${status?.render_status}${status?.render_url ? ` · ${status.render_url}` : " · stand-in, no file"}` : submitted ? "Answered, but store_release has not written state." : "Nothing pending."}
          </CheckRow>
          <CheckRow ok={status?.poster_ran ?? false} label="make_poster drew the poster on the other branch" tone={status?.poster_prebaked ? "warn" : "good"}>
            {status?.poster_ran ? (status.poster_prebaked ? "Ran; the stand-in poster, no image model reachable." : "Ran; a poster from the image model, in seconds.") : "Runs beside render_desk, right after script_ready."}
          </CheckRow>
          <CheckRow ok={status?.join_ran ?? false} label="join_media released">
            {status?.join_ran ? "Both branches reported; the join passed them on as one dict." : pending ? "Waiting for the clip." : "Not yet."}
          </CheckRow>
          <CheckRow ok={status?.released ?? false} label="store_release ran">
            {status?.released ? "render_url and poster_url are in the State tab." : "Runs when the delivery resumes the session."}
          </CheckRow>
          {status?.render_url || status?.poster_url ? (
            <li className="md:col-span-2 overflow-hidden rounded-2xl border border-hairline bg-overlay">
              <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-1.5 font-mono text-[10px] uppercase tracking-wider text-fg-muted">
                <span className="truncate">{status.render_url || "no clip file: a stand-in render"}{status.poster_url ? ` · ${status.poster_url}` : ""}</span>
                {status.render_url && (
                  <a href={status.render_url} download={status.render_url.split("/").pop() || "render.mp4"} className="flex shrink-0 items-center gap-1.5 rounded-md border border-hairline bg-card px-2.5 py-1 normal-case tracking-normal text-fg hover:border-vibe-amber/60">
                    <Download size={12} /> Download the clip
                  </a>
                )}
              </div>
              <div className="flex flex-col gap-4 p-4 md:flex-row md:items-start">
                {status.render_url ? <video src={status.render_url} controls className="max-h-[420px] min-w-0 flex-1 rounded-xl bg-black" /> : null}
                {status.poster_url ? <img src={status.poster_url} alt="The poster drawn for this clip" className="h-[420px] w-auto shrink-0 rounded-xl border border-hairline bg-card object-cover" style={{ aspectRatio: "9 / 16" }} /> : null}
              </div>
            </li>
          ) : null}
        </VerifyPanel>
      </In>
    </div>
  );
}
