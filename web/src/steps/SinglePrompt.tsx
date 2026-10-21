import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Check, Copy, ExternalLink, RefreshCw, TerminalSquare, X } from "lucide-react";
import { In, SectionHead } from "../components/shared";
import { Fold } from "../components/Fold";
import { LoadCheck } from "../components/LoadCheck";
import { LoadedBadge } from "../components/LoadedBadge";
import { api, useRunEvents } from "../lib/api";
import type { InspectorStatus, Stage0Status } from "../lib/types";
import { COLORS, tint } from "./colors";
import { EditPanel } from "./FanOut";

/*
 * Step 2, one page (steps/Poster.tsx composes it):
 *   TheAgent      the whole channel as one prompt in stage0_prompt/agent.py:
 *                 model, instruction, tools
 *   ToolsEditRun  where the research comes from, then the hands-on edits: the
 *                 three tools on the agent and the image model call inside
 *                 make_poster; run the agent in adk web; verify from the
 *                 session store, with tonight's poster beside the rows
 */

const BLUE = COLORS.blue;
const PURPLE = COLORS.purple;
const CYAN = COLORS.cyan;
const AMBER = COLORS.amber;
const GREEN = COLORS.green;

/* ───────────────────────── the agent ───────────────────────── */

const JOBS = [
  "check what is trending",
  "look at your backlog of ideas",
  "propose a direction and agree on it with the creator",
  "refuse blacklisted subjects (competitor, hateful, gore)",
  "describe the video: a title and 3 shots",
  "draw its poster: one call to make_poster",
];

const CODE_AGENT = `# stage0_prompt/agent.py
from google.adk import Agent
from agent.platform import config

root_agent = Agent(
    name="solo_channel", model=config.MODEL,     # model: gemini-3-flash-preview
    tools=[check_trends, read_backlog, make_poster],   # tools: two readers, one that draws
    after_tool_callback=show_poster,             # the PNG into adk web's Artifacts tab (read-along)
    instruction=(                                # instruction: the pipeline as prose
        "You run the creator's cozy-spooky short-video channel, alone, every "
        "night until Halloween.\n"
        "When the creator gives you an idea (or nothing), do ALL of this, in ONE "
        "reply, never stopping to wait for an answer:\n"
        "check what is trending. look at your backlog of ideas. propose a "
        "direction and agree on it with the creator: the creator's idea if there "
        "is one, riding one of tonight's trends and borrowing one detail from a "
        "backlog note. refuse blacklisted subjects (competitor, hateful, gore). "
        "then describe the video you would make: a title (<=60 chars) and 3 "
        "shots, one visual sentence each. then draw its poster: call make_poster "
        "once with one line that names the single image that sells the video, "
        "and tell the creator where the poster is.\n"
        "Every scene is a Halloween scene, cozy and never scary: a sheet ghost, a "
        "jack-o'-lantern, a witch's cat, a bat, candy, a full moon, a haunted "
        "household thing. The star is always one of those; never a robot or a "
        "gadget.\n"
        "Close by asking whether to keep this direction or try another."))`;

export function TheAgent() {
  return (
    <div className="space-y-10">
      <In delay={0.1}>
        <section className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
          <div className="space-y-3">
            <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-fg-muted">The agent · stage0_prompt/agent.py</p>
            <h2 className="font-display text-2xl">Model, instruction, tools.</h2>
            <Label name="model" color={CYAN}>gemini-3-flash-preview, from <code className="font-mono">config.MODEL</code></Label>
            <Label name="instruction" color={BLUE}>the whole night as prose: six jobs in one paragraph</Label>
            <Label name="tools" color={PURPLE}>two readers and one that draws; ADK turns each function into a tool from its signature and docstring</Label>
            <Fold title="The six jobs in the instruction" kicker="read">
              <ol className="list-decimal space-y-1 pl-5">
                {JOBS.map((j) => (
                  <li key={j} className="italic">{j}</li>
                ))}
              </ol>
              <p className="mt-3">The third job says "agree on it with the creator". It is prompt text, not a gate: the model asks and carries on in the same reply, through the script and the poster, and nothing stops the run to hear you. The real door, a form that suspends the run, is built in the video generation session.</p>
            </Fold>
          </div>

          <div className="overflow-hidden rounded-3xl border border-hairline bg-card">
            <div className="border-b border-hairline bg-overlay px-4 py-2 font-mono text-[11px] text-fg-muted">
              stage0_prompt/agent.py
            </div>
            <pre className="overflow-x-auto px-4 py-3 font-mono text-[11.5px] leading-relaxed text-fg">
              <code>{CODE_AGENT}</code>
            </pre>
          </div>
        </section>
      </In>

      <In delay={0.3}>
        <Sources />
      </In>
    </div>
  );
}

/** The two research sources the whole lab reads: the creator's backlog and
 *  what is trending. Live from this server, so what you see is what the
 *  agent will get. */
function Sources() {
  const [backlog, setBacklog] = useState<string[] | null>(null);
  const [trends, setTrends] = useState<{ topic: string; heat: number }[] | null>(null);
  const loadTrends = useCallback(async () => {
    try {
      const r = await fetch("/api/lab/trends");
      setTrends(((await r.json()) as { trends: { topic: string; heat: number }[] }).trends);
    } catch {
      setTrends([]);
    }
  }, []);
  useEffect(() => {
    api.getCode("agent/backlog.txt").then((f) => setBacklog(f.content.split("\n").filter((l: string) => l.trim() && !l.startsWith("#")))).catch(() => setBacklog([]));
    loadTrends();
  }, [loadTrends]);
  return (
    <section className="rounded-3xl border border-hairline bg-card p-6">
      <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-fg-muted">The sources</p>
      <h2 className="font-display mt-2 text-2xl">The backlog, and what is trending.</h2>
      <p className="mt-2 max-w-3xl text-sm text-fg-muted">
        Two live sources: the creator's backlog, one idea per line, and ten of 250 platform trends with a heat score each.
      </p>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-hairline bg-input">
          <div className="border-b border-hairline px-4 py-1.5 font-mono text-[10px] uppercase tracking-wider text-fg-muted">agent/backlog.txt · the creator's notes</div>
          <ol className="max-h-80 overflow-auto px-4 py-3 text-sm">
            {(backlog ?? []).map((n, i) => (
              <li key={n} className="flex gap-3 py-1">
                <span className="w-5 shrink-0 text-right font-mono text-[10px] text-fg-muted">{i + 1}</span>
                <span>{n}</span>
              </li>
            ))}
            {backlog === null && <li className="text-fg-muted">…</li>}
          </ol>
        </div>
        <div className="overflow-hidden rounded-2xl border border-hairline bg-input">
          <div className="flex items-center justify-between border-b border-hairline px-4 py-1.5">
            <span className="font-mono text-[10px] uppercase tracking-wider text-fg-muted">GET /api/lab/trends · ten right now</span>
            <button onClick={loadTrends} className="font-mono text-[11px] text-fg-muted hover:text-fg">
              another ten
            </button>
          </div>
          <ol className="max-h-80 overflow-auto px-4 py-3 text-sm">
            {(trends ?? []).map((t) => (
              <li key={t.topic} className="flex items-center gap-3 py-1">
                <span className="w-7 shrink-0 rounded px-1 text-center font-mono text-[10px]" style={{ background: tint(AMBER, 0.13), color: AMBER }}>
                  {t.heat}
                </span>
                <span>{t.topic}</span>
              </li>
            ))}
            {trends === null && <li className="text-fg-muted">…</li>}
          </ol>
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── the tools ───────────────────────── */

const CODE_PLATFORM = `# agent/trends.py
FORMATS = [ "one continuous take, no cuts", "a heist for something worthless", ... ]   # fifty
LOWPOLY_LOOKS = [ "cozy low-poly faceted 3D, warm pastels ...", ... ]                  # the channel's own look
OTHER_LOOKS = [ "claymation with visible thumbprints ...", "1990s VHS home video ...", ... ]
TREND_POOL = [f"{fmt} · look: {_look(i, j)}" for i, fmt in enumerate(FORMATS) for j in range(5)]   # 250

def sample_trends(n=10) -> list[dict]:
    picks = random.sample(TREND_POOL, n)          # a different ten every call
    heats = sorted(random.sample(range(40, 100), n), reverse=True)
    return [{"topic": t, "heat": h} for t, h in zip(picks, heats)]

# agent/graph.py
def backlog_notes() -> list[str]:
    return [l.strip() for l in BACKLOG_FILE.read_text().splitlines()
            if l.strip() and not l.startswith("#")]      # agent/backlog.txt`;

const DEFAULT_IDEA = "a tiny ghost learning to haunt a sock drawer";
const INSPECTOR_URL = "/inspector/dev-ui/?app=stage0_prompt";

const CODE_IMAGES = `# agent/platform/images.py
MODEL = os.environ.get("STUDIO_IMAGE_MODEL", "gemini-2.5-flash-image")   # Nano Banana
ASPECT = "9:16"                      # a VibeTube short is vertical, and so is its poster
STYLE = ("Cozy low-poly 3D render, faceted flat-shaded polygons ... pastel dusk "
         "palette ... Vertical poster for a short video: one clear subject centered ...")

def generate(subject: str, visual_style: str = "", name: str | None = None) -> dict:
    """One poster for \`subject\`. Returns where it landed: status, path, url,
    prompt, and prebaked=True when the stand-in was used instead of the model."""
    ...
    data = _call(prompt)             # generate_content(model=MODEL, config=ImageConfig(aspect_ratio="9:16"))
    path.write_bytes(data)
    return {"status": "done", "path": str(path), "url": f"{WEB_PREFIX}/{path.name}", ...}`;

const ANSWER_POSTER_TOOL = `def make_poster(subject: str) -> dict:
    """Draw tonight's poster: one image of \`subject\` in the channel's cozy
    low-poly style. Returns where the PNG landed (path, url) in a few seconds."""
    from agent.platform import images
    return images.generate(subject, name="solo")`;

export function ToolsEditRun() {
  const [idea, setIdea] = useState(DEFAULT_IDEA);
  const [open, setOpen] = useState(false);
  const [reloadN, setReloadN] = useState(0);   // the badge reloads the frame on request
  const [hintB, setHintB] = useState(0);
  const [inspector, setInspector] = useState<InspectorStatus | null>(null);
  const [status, setStatus] = useState<Stage0Status | null>(null);
  const [checking, setChecking] = useState(false);
  const { snapshot } = useRunEvents();

  const check = useCallback(async () => {
    setChecking(true);
    try {
      setStatus(await api.labStage0());
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    api.labInspector().then(setInspector).catch(() => setInspector({ up: false, url: "/inspector/dev-ui/", apps: [] }));
    check();
  }, [check]);

  // sessions.db changes publish a snapshot; re-read the evidence then.
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

  const prompt = `tonight's idea: ${idea.trim() || DEFAULT_IDEA}`;
  const wired = status?.tools_complete ?? false;
  const posterWired = status?.poster_wired ?? false;
  const poster = status?.poster ?? null;
  const calls = status?.tool_calls ?? {};
  const n = (k: string) => calls[k] ?? 0;
  const s = (k: number) => (k === 1 ? "" : "s");

  return (
    <div className="space-y-12">
      <SectionHead
        kicker="The tools"
        color={BLUE}
        title="Three functions. One of them draws."
        blurb="Two read the research; the third asks the image model for a poster."
      />

      {/* where the research comes from */}
      <In delay={0.1}>
        <section className="rounded-3xl border border-hairline bg-card p-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-fg-muted">How a tool call works</p>
          <p className="mt-2 max-w-3xl text-sm text-fg-muted">
            The model emits a <code className="font-mono text-fg">function_call</code>; the runtime runs the Python and writes the{" "}
            <code className="font-mono text-fg">function_response</code> back.
          </p>

          <div className="mt-6 grid items-stretch gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr]">
            <FlowBox color={CYAN} title="Gemini" sub="the model, inside the agent">
              decides a tool is needed, emits a <b>function_call</b>
            </FlowBox>
            <Arrow label="function_call" />
            <FlowBox color={PURPLE} title="the tools" sub="stage0_prompt/agent.py">
              <b>check_trends()</b>
              <br />
              <b>read_backlog()</b>
              <br />
              <b>make_poster(subject)</b>
            </FlowBox>
            <Arrow label="Python call" />
            <FlowBox color={BLUE} title="the sources" sub="beside the graph">
              250 trends · the backlog file · the image model
            </FlowBox>
            <Arrow label="returns" />
            <FlowBox color={GREEN} title="the data" sub="a function_response each">
              ten trends · fifteen notes · one PNG and its URL
            </FlowBox>
          </div>

          <div className="mt-5">
          <Fold title="Where the research comes from" kicker="reference">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="overflow-hidden rounded-2xl border border-hairline">
              <div className="border-b border-hairline bg-overlay px-4 py-2 font-mono text-[11px] text-fg-muted">agent/trends.py · agent/graph.py</div>
              <pre className="overflow-x-auto px-4 py-3 font-mono text-[11.5px] leading-relaxed text-fg">
                <code>{CODE_PLATFORM}</code>
              </pre>
            </div>
            <div className="overflow-hidden rounded-2xl border border-hairline">
              <div className="border-b border-hairline bg-overlay px-4 py-2 font-mono text-[11px] text-fg-muted">agent/platform/images.py · abridged</div>
              <pre className="overflow-x-auto px-4 py-3 font-mono text-[11.5px] leading-relaxed text-fg">
                <code>{CODE_IMAGES}</code>
              </pre>
            </div>
          </div>
          <ul className="mt-4 grid gap-3 text-sm text-fg-muted md:grid-cols-3">
            <li>
              <b className="text-fg">Platform trends</b>: a pool of 250 formats paired with a look. Each call samples ten with a heat score.
            </li>
            <li>
              <b className="text-fg">Creator backlog</b>: raw ideas in <code className="font-mono text-fg">agent/backlog.txt</code>, one per line. Edit the file and the next call sees it.
            </li>
            <li>
              <b className="text-fg">The image model</b>: a house style prefix, the subject, a vertical frame. With no key or{" "}
              <code className="font-mono text-fg">STUDIO_REAL_IMAGES=0</code> a stand-in pumpkin poster is copied instead, flagged{" "}
              <code className="font-mono text-fg">prebaked</code>, so the lab runs anywhere.
            </li>
          </ul>
          </Fold>
          </div>
        </section>
      </In>

      <In delay={0.25}>
        <EditPanel
          label="Your edit"
          title="Make make_poster call the image model."
          intro={
            <>
              Only <code className="font-mono text-fg">make_poster</code> is shown. Replace the TODO line with two lines; the dict it returns is what the model reads back.
            </>
          }
          pill={status ? (posterWired ? "poster tool wired ✓" : "make_poster is skipped") : "…"}
          ok={posterWired}
          hint={hintB}
          setHint={setHintB}
          hint1={
            <>
              Two lines in place of the TODO: <code className="font-mono">from agent.platform import images</code>, then{" "}
              <code className="font-mono">return images.generate(subject, name="solo")</code>. Keep the function body's indentation.
            </>
          }
          hint2={ANSWER_POSTER_TOOL}
          path="stage0_prompt/agent.py"
          symbol="make_poster"
          pattern={/TODO: POSTER_TOOL|images\.generate|from agent\.platform import images/}
          onSaved={check}
        />
      </In>

      <In delay={0.3}>
        <LoadCheck app="stage0_prompt" intro="Save the edit, then click: it loads stage0_prompt the way adk web will." />
      </In>

      {/* run it */}
      <In delay={0.35}>
        <section className="rounded-3xl border p-6" style={{ borderColor: tint(BLUE, 0.33), background: tint(BLUE, 0.04) }}>
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.3em]" style={{ color: BLUE }}>
                Run it
              </p>
              <h2 className="font-display mt-2 text-2xl">Open adk web. Send one line.</h2>
              <p className="mt-2 max-w-2xl text-sm text-fg-muted">
                ADK's dev UI, mounted at <code className="font-mono">/inspector</code>, reading the same session store the checks read. One message: the agent researches, proposes, scripts and draws in a single reply.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {inspector && (
                <span className="rounded-full border border-hairline bg-card px-3 py-1 font-mono text-[11px] text-fg-muted">
                  <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${inspector.up ? "bg-vibe-green" : "bg-vibe-red"}`} />
                  {inspector.up ? `adk web ready · ${inspector.apps.length} apps` : "adk web unavailable"}
                </span>
              )}
              <button
                onClick={() => { window.dispatchEvent(new Event("vibe:sync")); setOpen((o) => !o); }}
                className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white transition-transform hover:scale-[1.03]"
                style={{ background: BLUE }}
              >
                <TerminalSquare size={16} />
                {open ? "Hide adk web" : "Open adk web"}
              </button>
            </div>
          </div>

          <ol className="mt-5 grid gap-3 md:grid-cols-3">
            <Instruction n={1} title="Your idea">
              <input
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                className="mt-2 w-full rounded-lg border border-hairline bg-input px-3 py-2 font-mono text-xs text-fg"
                placeholder={DEFAULT_IDEA}
              />
            </Instruction>
            <Instruction n={2} title="Send this in the chat box">
              <CopyLine text={prompt} />
            </Instruction>
            <Instruction n={3} title="Watch the reply">
              <p className="mt-2 text-xs text-fg-muted">
                Two tool calls fan out (check_trends, read_backlog), a third draws (make_poster), then the prose: the direction, three shots, where the poster landed. The picture is in the Artifacts tab, and below, beside the checks.
              </p>
            </Instruction>
          </ol>

          {open && (
            <div className="mt-5 overflow-hidden rounded-2xl border border-hairline bg-card">
              <div className="flex items-center justify-between gap-4 border-b border-hairline bg-overlay px-3 py-1.5 font-mono text-[11px] text-fg-muted">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="shrink-0">{INSPECTOR_URL}</span>
                  <span className="shrink-0 opacity-50">·</span>
                  <LoadedBadge key={reloadN} app="stage0_prompt" onReload={() => setReloadN((n) => n + 1)} />
                </div>
                <a href={INSPECTOR_URL} target="_blank" rel="noreferrer" className="flex shrink-0 items-center gap-1 hover:text-fg">
                  open in a new tab <ExternalLink size={12} />
                </a>
              </div>
              <iframe key={reloadN} title="adk web" src={INSPECTOR_URL} className="h-[680px] w-full bg-[#1e1e1e]" />
            </div>
          )}
        </section>
      </In>

      {/* verify */}
      <In delay={0.4}>
        <section className="rounded-3xl border border-hairline bg-card p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-fg-muted">Verify</p>
              <h2 className="font-display mt-2 text-2xl">What the session store says.</h2>
              <p className="mt-2 max-w-2xl text-sm text-fg-muted">
                Read from the file and from runs/sessions.db; the rows update as you send messages.
              </p>
            </div>
            <button onClick={check} className="flex items-center gap-2 rounded-xl border border-hairline bg-overlay px-4 py-2 font-mono text-xs text-fg-muted hover:text-fg">
              <RefreshCw size={13} className={checking ? "animate-spin" : ""} /> Check again
            </button>
          </div>

          <ul className="mt-5 grid gap-2 md:grid-cols-2">
            <CheckRow ok={wired} label="The three tools are on the agent">
              {status ? (wired ? "tools=[check_trends, read_backlog, make_poster]" : "Edit 1 above.") : "…"}
            </CheckRow>
            <CheckRow ok={posterWired} label="make_poster calls the image model">
              {status ? (posterWired ? "images.generate(subject, name=\"solo\") in the file." : "Edit 2 above.") : "…"}
            </CheckRow>
            <CheckRow ok={!!status && status.sessions > 0} label="The agent ran">
              {status ? `${status.sessions} session${s(status.sessions)}, ${status.turns} message${s(status.turns)} from you` : "…"}
            </CheckRow>
            <CheckRow ok={!!status?.called_trends && !!status?.called_backlog} label="Both readers were called">
              {status ? `check_trends ×${n("check_trends")} · read_backlog ×${n("read_backlog")}` : "…"}
            </CheckRow>
            <CheckRow ok={!!status?.called_poster} label="make_poster was called">
              {status ? (status.called_poster ? `${n("make_poster")} call${s(n("make_poster"))} · the model wrote the subject line itself` : status.sessions ? "Not in any run yet. Is make_poster wired (edit above) and is adk web running your save? Then NEW SESSION and send the idea again." : "Not yet: send the idea above.") : "…"}
            </CheckRow>
            <CheckRow ok={!!poster?.url} label="A poster landed" tone={poster?.prebaked ? "warn" : "good"}>
              {poster?.url ? (poster.prebaked ? `the stand-in: ${poster.note || "no image model reachable"}` : `drawn by ${poster.model}`) : "No poster in the latest session yet."}
            </CheckRow>
            {poster?.url ? (
              <li className="md:col-span-2 overflow-hidden rounded-2xl border border-hairline bg-overlay">
                <div className="flex flex-col gap-4 p-4 md:flex-row md:items-start">
                  <img src={poster.url} alt="Tonight's poster, drawn by the image model" className="poster-9x16 w-44 shrink-0 rounded-xl border border-hairline bg-card object-cover" />
                  <div className="min-w-0 text-sm text-fg-muted">
                    <p className="font-mono text-[10px] uppercase tracking-wider text-fg-muted">tonight's poster · 9:16</p>
                    <p className="mt-2">
                      The same function returns a dict to the model and a PNG to disk. In the video session this call is a node beside the Veo render.
                    </p>
                    <p className="mt-2 break-all font-mono text-[11px]">{poster.url}</p>
                  </div>
                </div>
              </li>
            ) : null}
          </ul>

          {status?.last_reply && (
            <div className="mt-5 rounded-2xl border border-hairline bg-overlay p-4">
              <p className="font-mono text-[10px] uppercase tracking-wider text-fg-muted">Latest reply</p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-fg-muted">{status.last_reply}</p>
            </div>
          )}

          <div className="mt-5">
            <Fold title="What a single prompt cannot promise" kicker="read · 1 min">
              <ul className="space-y-1.5">
                <li>
                  <b>Research you must re-read</b>: trends and notes are folded into prose, so nothing can say which source a claim came from.
                </li>
                <li>
                  <b>A blacklist the model certifies for itself</b>: no code checked the direction against the channel's policy before the poster was paid for.
                </li>
                <li>
                  <b>An agreement nobody waited for</b>: "agree on it with the creator" became a question at the end of a reply that had already scripted the video and paid for the poster. Prompt text is not a gate.
                </li>
              </ul>
              <p className="mt-3">Good for a prototype, not for a channel. The next session takes the six jobs apart into a drawn graph: readers that fan out and join, a router that refuses before money is spent, a door that really stops, a desk where the poster and the clip are made side by side.</p>
            </Fold>
          </div>
        </section>
      </In>
    </div>
  );
}

/* ───────────────────────── bits ───────────────────────── */

function Label({ name, color, children }: { name: string; color: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-hairline bg-card px-4 py-3">
      <div className="font-mono text-[13px] font-medium" style={{ color }}>{name}</div>
      <div className="mt-1 text-sm text-fg-muted">{children}</div>
    </div>
  );
}

function FlowBox({ color, title, sub, children }: { color: string; title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: tint(color, 0.4), background: tint(color, 0.06) }}>
      <div className="text-sm font-semibold" style={{ color }}>
        {title}
      </div>
      <div className="font-mono text-[10px] text-fg-muted">{sub}</div>
      <div className="mt-2 text-xs leading-relaxed text-fg-muted [&_b]:font-mono [&_b]:text-fg">{children}</div>
    </div>
  );
}

function Arrow({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 px-1 text-fg-muted">
      <ArrowRight size={16} className="rotate-90 md:rotate-0" />
      <span className="font-mono text-[9px] uppercase tracking-wider">{label}</span>
    </div>
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

function CheckRow({ ok, label, tone = "good", children }: { ok: boolean; label: string; tone?: "good" | "warn"; children: React.ReactNode }) {
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
