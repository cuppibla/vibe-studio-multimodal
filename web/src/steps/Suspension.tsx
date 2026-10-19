import { useCallback, useState } from "react";
import { Fold } from "../components/Fold";
import { In, StepHeader } from "../components/shared";
import { LoadCheck } from "../components/LoadCheck";
import { api } from "../lib/api";
import { COLORS, tint } from "./colors";
import { CheckRow, EditPanel, RunPanel, VerifyPanel } from "./FanOut";
import { CODE_DELIVER, CODE_SUBMIT, CODE_VIDEOGEN, DeliverRunner, PollerFigure, TimelineFigure, useStage6 } from "./Video";

/*
 * Session 5a · Two kinds of suspension, one mechanism (steps/VideoGen.tsx):
 *   for a person    direction_gate yields a RequestInput: the run stops on a form,
 *                   an open adk_request_input call waits in the session, your pick
 *                   is the function_response that resumes it            (GATE)
 *   for a slow tool render_submit returns a pending receipt; wrapped in
 *                   LongRunningFunctionTool the receipt stops the run at render_desk
 *                   with the call's id in the session                    (VIDEO_TOOL)
 *                   python -m agent.deliver answers that id from another process,
 *                   later, with a FunctionResponse                       (DELIVER_RESPONSE)
 * Everything runs in stage6_video, the whole graph.
 */

const AMBER = COLORS.amber;
const CYAN = COLORS.cyan;
const GREEN = COLORS.green;
const mono = { fontFamily: "var(--font-mono)" } as const;

const DEFAULT_SUSPEND_IDEA = "a bat moves into the desk lamp";

/** The one table of the session: the same mechanism, twice. */
const ROWS: { what: string; person: string; tool: string }[] = [
  { what: "who stops the run", person: "direction_gate yields a RequestInput", tool: "render_submit returns {status: pending}; LongRunningFunctionTool makes that a stop" },
  { what: "what it waits for", person: "a person: one of four cards", tool: "a slow job: Veo's operation, minutes" },
  { what: "what sits in the session", person: "an open adk_request_input call: the message, the form, the payload", tool: "an open render_submit call: the receipt with the operation name" },
  { what: "how it resumes", person: "a function_response with that call's id, carrying your pick", tool: "a function_response with that call's id, carrying the clip's URL" },
  { what: "who sends it", person: "adk web, when you submit the form", tool: "python -m agent.deliver, from another process, later" },
  { what: "where it lives meanwhile", person: "runs/sessions.db · one session id · nothing runs", tool: "the same row, the same id · nothing runs" },
];

const CODE_GATE = `# agent/graph.py · direction_gate, as shipped
def direction_gate(node_input: Directions):
    cands = [c.model_dump() for c in node_input.candidates]
    yield Event(state={"candidates": cands})
    # TODO: GATE - suspend the graph here: yield a RequestInput with a message,
    # a response_schema (the form: one field, pick) and payload={"candidates": cands}`;

const ANSWER_GATE = `    yield RequestInput(
        message="Pick tonight's direction: 1, 2, 3 or 4.",
        response_schema={
            "type": "object",
            "properties": {
                "pick": {"type": "string", "enum": ["1", "2", "3", "4"]}}},
        payload={"candidates": cands})`;

const CODE_REQUEST_INPUT_SAMPLE = `yield RequestInput(
    # what the person reads
    message="Approve this thumbnail?",
    # the form, and the contract for the next node
    response_schema={
        "type": "object",
        "properties": {
            "approve": {"type": "string", "enum": ["yes", "no"]},
            "note": {"type": "string"}}},
    # data for a frontend to show
    payload={"thumbnail_url": url})`;

const REQUEST_INPUT_FIELDS = [
  { f: "message", what: "The prompt shown to the person." },
  { f: "response_schema", what: "A JSON schema. adk web renders it as the form, and ADK validates the answer against it before the graph resumes. Here one field, pick." },
  { f: "payload", what: "Data that travels with the request for a frontend to display. Here the candidates. adk web ignores it; VibeStudio draws the four cards from it." },
  { f: "interrupt_id", what: "ADK assigns it when the yield runs: the id the answer has to carry." },
];

/** The chain stops at direction_gate, holding an open call until a function_response arrives. */
function PausedGraphFigure() {
  const node = (cx: number, cy: number, label: string, accent = false, dashed = false) => (
    <g key={label}>
      <rect x={cx - 54} y={cy - 13} width="108" height="26" rx="8" fill={accent ? tint(AMBER, 0.12) : "var(--overlay)"} stroke={accent ? AMBER : "var(--hairline)"} strokeDasharray={dashed ? "4 3" : undefined} />
      <text x={cx} y={cy + 4} fontSize="9.5" style={mono} textAnchor="middle" fill={accent ? AMBER : "currentColor"} opacity={dashed ? 0.6 : 1}>
        {label}
      </text>
    </g>
  );
  const edge = (x1: number, y1: number, x2: number, y2: number) => <line key={`${x1}-${y1}-${x2}-${y2}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth="1.2" markerEnd="url(#pg-arrow)" />;
  return (
    <figure className="m-0 mt-4">
      <svg viewBox="0 0 580 200" className="h-auto w-full text-fg" role="img" aria-label="The chain runs from START through the readers, the join and propose_directions to direction_gate, where the run stops holding an open adk_request_input call until a function_response with that id resumes it at persist_direction">
        <defs>
          <marker id="pg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="currentColor" />
          </marker>
        </defs>
        <circle cx="30" cy="85" r="12" fill="var(--overlay)" stroke="currentColor" strokeOpacity="0.6" />
        <text x="30" y="89" fontSize="8.5" style={mono} textAnchor="middle" fill="currentColor">START</text>
        {node(120, 45, "scan_trends")}
        {node(120, 125, "read_backlog")}
        {node(242, 85, "join_research")}
        {node(364, 85, "propose_directions")}
        {node(486, 85, "direction_gate", true)}
        {node(486, 165, "persist_direction", false, true)}
        {edge(42, 80, 64, 50)}
        {edge(42, 90, 64, 120)}
        {edge(174, 45, 187, 80)}
        {edge(174, 125, 187, 90)}
        {edge(296, 85, 308, 85)}
        {edge(418, 85, 430, 85)}
        <line x1="486" y1="98" x2="486" y2="150" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.2" strokeDasharray="4 3" markerEnd="url(#pg-arrow)" />
        <text x="494" y="128" fontSize="9" style={mono} fill="currentColor" opacity="0.6">after your pick</text>
        <text x="418" y="118" fontSize="9.5" style={mono} fill={AMBER} textAnchor="end">stopped here</text>
        <text x="418" y="131" fontSize="9.5" style={mono} fill="currentColor" opacity="0.7" textAnchor="end">an open adk_request_input call</text>
        <text x="418" y="144" fontSize="9.5" style={mono} fill="currentColor" opacity="0.7" textAnchor="end">resumes on function_response(interrupt_id)</text>
      </svg>
      <figcaption className="mt-2 text-xs text-fg-muted">The run ends when the yield runs. No thread waits: the open call is a row in the session, and only an answer with its id continues the graph.</figcaption>
    </figure>
  );
}

/** The response_schema as a picture: the property, the form it becomes, the answer it validates. */
function SchemaFigure() {
  const box = { fill: "var(--overlay)", stroke: "var(--hairline)" };
  return (
    <figure className="m-0">
      <svg viewBox="0 0 620 250" className="h-auto w-full text-fg" role="img" aria-label="response_schema has one property, pick; adk web renders it as a form; the validated answer is a dict with the same key, which persist_direction reads by name">
        <defs>
          <marker id="rs-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="currentColor" />
          </marker>
        </defs>
        <rect x="8" y="20" width="196" height="118" rx="12" {...box} />
        <text x="20" y="42" fontSize="11" style={mono} fill={AMBER}>response_schema</text>
        <text x="20" y="60" fontSize="10.5" style={mono} fill="currentColor" opacity="0.7">"type": "object"</text>
        <rect x="20" y="70" width="172" height="26" rx="6" fill="none" stroke={AMBER} strokeOpacity="0.6" />
        <text x="28" y="87" fontSize="10.5" style={mono} fill="currentColor">pick: 1 | 2 | 3 | 4</text>
        <text x="20" y="122" fontSize="9.5" style={mono} fill="currentColor" opacity="0.6">not required; blank means 1</text>
        <rect x="256" y="20" width="160" height="118" rx="12" {...box} />
        <text x="268" y="42" fontSize="11" style={mono} fill="currentColor" opacity="0.8">the form in adk web</text>
        <text x="268" y="66" fontSize="10.5" style={mono} fill="currentColor" opacity="0.7">pick</text>
        <rect x="268" y="72" width="136" height="20" rx="4" fill="none" stroke="currentColor" strokeOpacity="0.4" />
        <text x="276" y="86" fontSize="10.5" style={mono} fill="currentColor">2</text>
        <rect x="268" y="108" width="52" height="20" rx="4" fill="currentColor" fillOpacity="0.12" stroke="currentColor" strokeOpacity="0.4" />
        <text x="294" y="122" fontSize="9.5" style={mono} fill="currentColor" textAnchor="middle">Submit</text>
        <rect x="468" y="20" width="144" height="118" rx="12" {...box} />
        <text x="480" y="42" fontSize="11" style={mono} fill="currentColor" opacity="0.8">the answer</text>
        <text x="480" y="84" fontSize="10.5" style={mono} fill="currentColor">{"{"}"pick": "2"{"}"}</text>
        <line x1="204" y1="79" x2="254" y2="79" stroke="currentColor" strokeWidth="1.2" markerEnd="url(#rs-arrow)" />
        <text x="229" y="70" fontSize="9.5" style={mono} fill="currentColor" opacity="0.7" textAnchor="middle">renders</text>
        <line x1="416" y1="79" x2="466" y2="79" stroke="currentColor" strokeWidth="1.2" markerEnd="url(#rs-arrow)" />
        <text x="441" y="70" fontSize="9.5" style={mono} fill="currentColor" opacity="0.7" textAnchor="middle">submit</text>
        <path d="M540 138 L540 176" stroke={AMBER} strokeWidth="1.2" markerEnd="url(#rs-arrow)" fill="none" />
        <text x="548" y="160" fontSize="9.5" style={mono} fill={AMBER}>validated</text>
        <rect x="256" y="180" width="356" height="50" rx="12" {...box} />
        <text x="268" y="200" fontSize="11" style={mono} fill="currentColor" opacity="0.8">persist_direction(node_input, ...)</text>
        <text x="268" y="219" fontSize="10.5" style={mono} fill="currentColor">reads "pick" by name</text>
        <text x="8" y="205" fontSize="10.5" style={mono} fill="currentColor" opacity="0.7">downstream node</text>
        <line x1="132" y1="201" x2="254" y2="201" stroke="currentColor" strokeOpacity="0.4" strokeWidth="1" strokeDasharray="3 3" />
      </svg>
      <figcaption className="mt-2 text-xs text-fg-muted">The schema is rendered as the form, the answer is validated against it, and the next node reads the same key.</figcaption>
    </figure>
  );
}

/** The one table: two stops, the same five facts. */
function SuspensionTable() {
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[720px] border-separate border-spacing-0 text-sm">
        <thead>
          <tr className="text-left font-mono text-[11px] uppercase tracking-[0.2em]">
            <th className="border-b border-hairline pb-2 pr-4 text-fg-muted"> </th>
            <th className="border-b border-hairline pb-2 pr-4" style={{ color: AMBER }}>for a person · direction_gate</th>
            <th className="border-b border-hairline pb-2" style={{ color: CYAN }}>for a slow tool · render_desk</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r) => (
            <tr key={r.what} className="align-top">
              <td className="border-b border-hairline py-2.5 pr-4 font-mono text-xs text-fg-muted">{r.what}</td>
              <td className="border-b border-hairline py-2.5 pr-4 text-fg">{r.person}</td>
              <td className="border-b border-hairline py-2.5 text-fg">{r.tool}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Suspension() {
  const [idea, setIdea] = useState(DEFAULT_SUSPEND_IDEA);
  const [hintGate, setHintGate] = useState(0);
  const [hintTool, setHintTool] = useState(0);
  const [hintDeliver, setHintDeliver] = useState(0);
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
  const hasInput = status?.gate_has_request_input ?? false;
  const wrapped = status?.tool_wrapped ?? false;
  const deliverOk = status?.deliver_wired ?? false;
  const asked = status?.asked ?? 0;
  const answered = status?.answered ?? 0;
  const submitted = status?.submitted ?? null;
  const pending = status?.pending ?? null;
  const delivered = status?.delivered ?? false;
  return (
    <div className="space-y-12">
      <StepHeader
        kicker="Session 5a · Two kinds of suspension"
        color={CYAN}
        title="A run that stops twice."
        blurb="direction_gate stops it for you; render_desk stops it for Veo. Both leave one open call in the session store, and both resume when an answer arrives with that call's id."
      />

      <In delay={0.1}>
        <section className="rounded-3xl border border-hairline bg-card p-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-fg-muted">One mechanism</p>
          <h2 className="font-display mt-2 text-2xl">Suspend, keep a row, resume by id.</h2>
          <p className="mt-2 max-w-3xl text-sm text-fg-muted">
            Nothing waits. The run writes an open call into its session and ends; whoever answers that call, a person or a process, continues it.
          </p>
          <SuspensionTable />
        </section>
      </In>

      <In delay={0.15}>
        <section className="rounded-3xl border border-hairline bg-card p-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em]" style={{ color: AMBER }}>For a person</p>
          <h2 className="font-display mt-2 text-2xl">direction_gate yields a RequestInput.</h2>
          <p className="mt-2 max-w-3xl text-sm text-fg-muted">
            The four candidates go to state and into the payload; the yield stops the run; adk web draws the form; your pick is the function_response that resumes it.
          </p>
          <PausedGraphFigure />
          <div className="mt-4 overflow-hidden rounded-2xl border border-hairline bg-input">
            <div className="border-b border-hairline px-4 py-1.5 font-mono text-[10px] uppercase tracking-wider text-fg-muted">agent/graph.py · direction_gate</div>
            <pre className="overflow-x-auto px-4 py-3 font-mono text-[11px] leading-relaxed text-fg">
              <code>{CODE_GATE}</code>
            </pre>
          </div>
        </section>
      </In>

      <In delay={0.2}>
        <EditPanel
          label="Edit 1 of 3"
          title="Make direction_gate wait for a person."
          intro={
            <>
              Only <code className="font-mono text-fg">direction_gate</code> is shown. Replace the two TODO lines with{" "}
              <code className="font-mono text-fg">yield RequestInput(...)</code>: a <code className="font-mono text-fg">message</code>, a{" "}
              <code className="font-mono text-fg">response_schema</code> with one property, <code className="font-mono text-fg">pick</code>, and a{" "}
              <code className="font-mono text-fg">payload</code> with the candidates.
            </>
          }
          pill={status ? (hasInput ? "RequestInput in place ✓" : "no RequestInput yield yet") : "…"}
          ok={hasInput}
          hint={hintGate}
          setHint={setHintGate}
          hint1={
            <>
              Three keyword arguments. <code className="font-mono">response_schema</code> is a dict with <code className="font-mono">"type": "object"</code> and a{" "}
              <code className="font-mono">"properties"</code> block whose one key is <code className="font-mono">pick</code>, an enum of "1" to "4".{" "}
              <code className="font-mono">payload</code> is <code className="font-mono">{"{"}"candidates": cands{"}"}</code>.
            </>
          }
          hint2={ANSWER_GATE}
          path="agent/graph.py"
          symbol="direction_gate"
          pattern={/TODO: GATE\b|yield RequestInput|"pick": \{|payload=/}
          onSaved={check}
        />
      </In>

      <Fold title="What goes in a RequestInput, and why the answer has a shape" kicker="reference">
        <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
          <ul className="space-y-2.5">
            {REQUEST_INPUT_FIELDS.map((r) => (
              <li key={r.f} className="text-sm">
                <code className="font-mono" style={{ color: AMBER }}>
                  {r.f}
                </code>
                <span className="ml-2 text-fg-muted">{r.what}</span>
              </li>
            ))}
          </ul>
          <div className="overflow-hidden rounded-2xl border border-hairline bg-input">
            <div className="border-b border-hairline px-4 py-1.5 font-mono text-[10px] uppercase tracking-wider text-fg-muted">a RequestInput, for comparison</div>
            <pre className="overflow-x-auto px-4 py-3 font-mono text-[11.5px] leading-relaxed text-fg">
              <code>{CODE_REQUEST_INPUT_SAMPLE}</code>
            </pre>
          </div>
        </div>
        <p className="mt-4">
          The answer becomes the next node's <code>node_input</code>, and that node is code, not a model: <code>persist_direction</code> reads{" "}
          <code>pick</code> by name. The schema settles the shape once, at the stop, and ADK validates the answer against it before the graph resumes.
          The same schema is a frontend contract: adk web renders it as a form; VibeStudio renders it as four cards; a phone app could render it without
          touching the graph.
        </p>
        <div className="mt-4">
          <SchemaFigure />
        </div>
      </Fold>

      <In delay={0.25}>
        <section className="rounded-3xl border border-hairline bg-card p-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em]" style={{ color: CYAN }}>For a slow tool</p>
          <h2 className="font-display mt-2 text-2xl">render_submit returns a receipt; wrapped, the receipt stops the run.</h2>
          <p className="mt-2 max-w-3xl text-sm text-fg-muted">
            A Veo render takes minutes and an agent's turn takes seconds. The tool submits and returns at once; LongRunningFunctionTool tells ADK the call is not finished, so the run stops at render_desk with the call's id.
          </p>
          <TimelineFigure />
          <div className="mt-4 overflow-hidden rounded-2xl border border-hairline bg-input">
            <div className="border-b border-hairline px-4 py-1.5 font-mono text-[10px] uppercase tracking-wider text-fg-muted">agent/desk.py · render_submit</div>
            <pre className="overflow-x-auto px-4 py-3 font-mono text-[11px] leading-relaxed text-fg">
              <code>{CODE_SUBMIT}</code>
            </pre>
          </div>
        </section>
      </In>

      <In delay={0.3}>
        <EditPanel
          label="Edit 2 of 3"
          title="Wrap render_submit as a LongRunningFunctionTool."
          intro={
            <>
              Only <code className="font-mono text-fg">render_desk</code> is shown. Its tools list holds the plain function; wrap it, so the pending
              receipt suspends the workflow instead of ending the agent's turn.
            </>
          }
          pill={status ? (wrapped ? "LongRunningFunctionTool ✓" : status.tool === "plain" ? "a plain function tool" : "render_submit not in tools") : "…"}
          ok={wrapped}
          hint={hintTool}
          setHint={setHintTool}
          hint1={<>The tools list holds the wrapper, and the wrapper holds the function.</>}
          hint2={`    tools=[LongRunningFunctionTool(render_submit)])`}
          path="stage6_video/agent.py"
          symbol="render_desk"
          pattern={/TODO: VIDEO_TOOL|LongRunningFunctionTool\(render_submit\)/}
          onSaved={check}
        />
      </In>

      <Fold title="videogen.start and check, the retries, the cost" kicker="reference">
        <p>
          <code>start</code> submits the render and returns the operation name; <code>check</code> asks Veo about it and writes the mp4 to disk once it
          exists. Every network step retries: eight attempts, seventy seconds apart, set by <code>STUDIO_VIDEO_RETRIES</code> and{" "}
          <code>STUDIO_VIDEO_INTERVAL</code>. One Veo clip per run
          {status ? (status.real_video ? "; this server renders for real." : "; this server has STUDIO_REAL_VIDEO=0, a stand-in receipt that finishes in five seconds and, when ffmpeg is installed, an eight-second push-in over the poster instead of a Veo clip.") : "."}
        </p>
        <div className="mt-4 overflow-hidden rounded-2xl border border-hairline bg-input">
          <div className="border-b border-hairline px-4 py-1.5 font-mono text-[10px] uppercase tracking-wider text-fg-muted">agent/platform/videogen.py · start and check</div>
          <pre className="max-h-80 overflow-auto px-4 py-3 font-mono text-[11px] leading-relaxed text-fg">
            <code>{CODE_VIDEOGEN}</code>
          </pre>
        </div>
      </Fold>

      <In delay={0.35}>
        <section className="rounded-3xl border border-hairline bg-card p-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em]" style={{ color: GREEN }}>Resume by id</p>
          <h2 className="font-display mt-2 text-2xl">Another process answers the call.</h2>
          <p className="mt-2 max-w-3xl text-sm text-fg-muted">
            python -m agent.deliver reads the open call from the session store, polls Veo until the clip exists, and sends the same session a function_response with that call's id. The graph continues at join_media.
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

      <In delay={0.4}>
        <EditPanel
          label="Edit 3 of 3"
          title="Build the FunctionResponse that resumes the run."
          intro={
            <>
              Only <code className="font-mono text-fg">_answer</code> in agent/deliver.py is shown. Replace the TODO line with a{" "}
              <code className="font-mono text-fg">Part(function_response=FunctionResponse(...))</code> carrying the call's id, the tool's name and the
              response the delivery built.
            </>
          }
          pill={status ? (deliverOk ? "FunctionResponse built ✓" : "the TODO line is still there") : "…"}
          ok={deliverOk}
          hint={hintDeliver}
          setHint={setHintDeliver}
          hint1={
            <>
              <code className="font-mono">id=row["call_id"]</code>, <code className="font-mono">name=row["name"]</code>,{" "}
              <code className="font-mono">response=response</code>. The id is what makes it an answer and not a new message.
            </>
          }
          hint2={`    part = Part(function_response=FunctionResponse(
        id=row["call_id"], name=row["name"], response=response))`}
          path="agent/deliver.py"
          symbol="_answer"
          pattern={/TODO: DELIVER_RESPONSE|function_response=FunctionResponse\(/}
          onSaved={check}
        />
      </In>

      <In delay={0.45}>
        <LoadCheck app="stage6_video" intro="Save, then load stage6_video the way adk web will: the whole graph, with the gate and the desk." />
      </In>

      <In delay={0.5}>
        <RunPanel
          app="stage6_video"
          open={open}
          setOpen={setOpen}
          title="Run until it stops twice."
          intro="Send an idea. The run stops on a form: pick a card. It runs on to the desk and stops again on the receipt; deliver below, and it finishes."
          idea={idea}
          setIdea={setIdea}
          frame={frame}
          steps={[
            "Stop one: an adk_request_input event with a form built from your schema, the four candidates in its payload. Type 2 in pick and submit. The graph resumes at persist_direction. The kill test works here: restart the server while the form waits, reopen the session, submit.",
            "Stop two: after script_ready, render_desk calls render_submit, gets {status: pending}, replies WAITING, and the run ends; the session keeps the call id. Run the delivery below, then Refresh adk web: the function_response follows the call, join_media releases, store_release runs.",
          ]}
        />
      </In>

      <In delay={0.55}>
        <section className="rounded-3xl border border-hairline bg-card p-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em]" style={{ color: AMBER }}>
            Console
          </p>
          <h2 className="font-display mt-2 text-2xl">Deliver the clip to the open call.</h2>
          <p className="mt-2 max-w-3xl text-sm text-fg-muted">
            The same command a terminal would run, as a process on this server: find the receipt, wait for Veo, answer by id.
          </p>
          <DeliverRunner onDone={check} onShow={showInAdkWeb} />
        </section>
      </In>

      <In delay={0.6}>
        <VerifyPanel checking={checking} onCheck={check} intro="Read from agent/graph.py, stage6_video/agent.py, agent/deliver.py and the latest stage6_video session in runs/sessions.db.">
          <CheckRow ok={hasInput} label="direction_gate yields a RequestInput">
            {status ? (hasInput ? "Found in the function body." : "Edit 1 above.") : "…"}
          </CheckRow>
          <CheckRow ok={asked > 0} label="the run stopped for you">
            {status ? (asked ? `${asked} adk_request_input call${asked === 1 ? "" : "s"} in the session` : "No stop yet: run after edit 1.") : "…"}
          </CheckRow>
          <CheckRow ok={answered > 0} label="you answered by function_response">
            {status ? (answered ? `${answered} answer${answered === 1 ? "" : "s"} carrying the call id` : "Submit the form in adk web.") : "…"}
          </CheckRow>
          <CheckRow ok={wrapped} label="render_submit is a LongRunningFunctionTool">
            {status ? (wrapped ? "Wrapped, in stage6_video/agent.py." : "Edit 2 above.") : "…"}
          </CheckRow>
          <CheckRow ok={deliverOk} label="the delivery builds the FunctionResponse">
            {status ? (deliverOk ? "In agent/deliver.py." : "Edit 3 above.") : "…"}
          </CheckRow>
          <CheckRow ok={!!submitted} label="render_desk submitted a render">
            {submitted ? `call ${submitted.call_id.slice(0, 8)} · ${submitted.operation || "(operation in the receipt)"} · ${submitted.prompt.slice(0, 80)}…` : "No run reached the desk yet."}
          </CheckRow>
          <CheckRow ok={!!pending || delivered} label={pending ? "the run stopped on the receipt" : "the receipt was answered by id"}>
            {pending ? "Pending. The run ended here; deliver above." : delivered ? `Delivered · render_status ${status?.render_status}${status?.render_url ? ` · ${status.render_url}` : " · stand-in, no file"}` : submitted ? "An answer landed, but no render_url is in state yet." : "Runs when the delivery resumes the session."}
          </CheckRow>
          <CheckRow ok={status?.released ?? false} label="store_release ran after the resume">
            {status?.released ? "The graph continued past the desk. 5b looks at what it found in state." : "Runs when the delivery resumes the session."}
          </CheckRow>
        </VerifyPanel>
      </In>
    </div>
  );
}
