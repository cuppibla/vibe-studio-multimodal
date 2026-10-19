import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Check, Copy, ExternalLink, RefreshCw, TerminalSquare, X } from "lucide-react";
import { In, SectionHead, StepHeader } from "../components/shared";
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
    tools=[],  # TODO: TOOLS                     # tools: empty for now (the edit below)
    instruction=(                                # instruction: the pipeline as prose
        "You run the creator's cozy-spooky short-video channel, alone, every "
        "night until Halloween.\n"
        "When the creator gives you an idea (or nothing), do ALL of this:\n"
        "check what is trending. look at your backlog of ideas. propose a "
        "direction and agree on it with the creator. refuse blacklisted "
        "subjects (competitor, hateful, gore). then describe the video you "
        "would make: a title (<=60 chars) and 3 shots, one visual sentence "
        "each. then draw its poster: call make_poster once with one line that "
        "names the single image that sells the video, and tell the creator "
        "where the poster is.\n"
        "Ask the creator to confirm the direction before describing the "
        "video."))`;

export function TheAgent() {
  return (
    <div className="space-y-10">
      <StepHeader
        kicker="Step 2 · One agent, one poster"
        color={BLUE}
        title="The whole channel as one prompt."
        blurb="Before the graph, the simplest thing that could work: one ADK Agent whose instruction is the whole night's pipeline as prose, three Python functions as its hands, and a run that ends with tonight's poster drawn by the image model. Then you look at what a single prompt cannot promise."
      />

      <In delay={0.1}>
        <section className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
          <div className="rounded-3xl border border-hairline bg-card p-6">
            <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-fg-muted">
              stage0_prompt/agent.py · <span style={{ color: BLUE }}>root_agent</span>
            </p>
            <div className="mt-3 flex flex-wrap gap-2 font-mono text-[11px]">
              <Chip color={CYAN}>model = gemini-3-flash-preview</Chip>
              <Chip color={BLUE}>instruction = five jobs, as sentences</Chip>
              <Chip color={PURPLE}>tools = [ ]</Chip>
            </div>
            <p className="mt-5 text-sm text-fg-muted">
              <b className="text-fg">model</b> references the Gemini model defined in{" "}
              <code className="font-mono">agent/platform/config.py</code>. ADK discovers runnable applications by locating
              an <code className="font-mono">agent.py</code> file that exports <code className="font-mono">root_agent</code>,
              using the folder name as the app ID.
            </p>
            <p className="mt-4 text-sm text-fg-muted">
              <b className="text-fg">instruction</b> serves as the system prompt. In this baseline, the prompt packs six
              separate jobs into continuous prose within a single conversation, the last of them a picture:
            </p>
            <ol className="mt-3 space-y-2">
              {JOBS.map((j, i) => (
                <motion.li
                  key={j}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 + i * 0.07 }}
                  className="flex items-start gap-3 rounded-xl border border-hairline bg-overlay px-3 py-2 text-sm"
                >
                  <span className="font-mono text-[10px] text-fg-muted">{i + 1}</span>
                  <span className="italic">{j}</span>
                </motion.li>
              ))}
            </ol>
            <p className="mt-4 text-sm text-fg-muted">
              The final instruction asks the model to confirm the direction with the creator. Because this is prompt
              text rather than a deterministic boundary, the model can easily be steered to bypass human approval.
            </p>
            <p className="mt-4 text-sm text-fg-muted">
              <b className="text-fg">tools</b> is initially empty. Without tools, the model can only talk. Below, you wire
              three Python functions: two that read the research, and one that asks the image model for tonight's poster.
            </p>
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
        The pipeline grounds content generation using two external data sources.{" "}
        <code className="font-mono text-fg">agent/backlog.txt</code> contains the creator's archived concept notes,
        stored one per line. Platform trends are simulated from a catalog of 250 active formats and visual styles,
        sampling ten scored entries per invocation. The agent synthesizes these sources, aligning the creator's backlog
        notes with current platform momentum.
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
  const [hintA, setHintA] = useState(0);
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
        title="Three functions, and one of them draws."
        blurb="Give the agent its hands: two functions that read the research, and one that asks the image model for a poster. Then run it in adk web and read what it did from the session store."
      />

      {/* where the research comes from */}
      <In delay={0.1}>
        <section className="rounded-3xl border border-hairline bg-card p-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-fg-muted">Where the research comes from, and where the poster goes</p>
          <p className="mt-2 max-w-3xl text-sm text-fg-muted">
            The three functions are defined in <code className="font-mono text-fg">stage0_prompt/agent.py</code>. ADK reads the
            functions passed to <code className="font-mono text-fg">tools=[...]</code> and builds a tool declaration from each
            signature and docstring. When the model wants one, it emits a{" "}
            <code className="font-mono text-fg">function_call</code> event; the runtime runs the Python and writes a{" "}
            <code className="font-mono text-fg">function_response</code> event back into the context. The third tool is the
            same call the graph makes in step 6, as a node: one subject in, one PNG out.
          </p>

          <div className="mt-6 grid items-stretch gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr]">
            <FlowBox color={CYAN} title="Gemini" sub="the model, inside the agent">
              decides a tool is needed and emits <b>function_call</b> · reads the <b>function_response</b> and writes prose
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
            <FlowBox color={BLUE} title="the sources" sub="agent/trends.py · agent/backlog.txt · agent/platform/images.py">
              <b>sample_trends()</b>: ten of 250, a format and a look each
              <br />
              <b>backlog_notes()</b>: reads the notes file
              <br />
              <b>images.generate()</b>: the image model, 9:16
            </FlowBox>
            <Arrow label="returns" />
            <FlowBox color={GREEN} title="the data" sub="beside the graph">
              ten trends with a heat score, hottest first
              <br />
              fifteen backlog notes, one per line
              <br />
              one PNG under runs/media/posters, with its URL
            </FlowBox>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
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
        </section>
      </In>

      <In delay={0.2}>
        <EditPanel
          label="Edit 1 of 2"
          title="Put the three tools on the agent."
          intro={
            <>
              Only <code className="font-mono text-fg">root_agent</code> is shown. The highlighted line has an empty{" "}
              <code className="font-mono text-fg">tools=[]</code>. Put the three functions defined above it into that list. Saving writes the
              file; adk web reloads the agent on the next message.
            </>
          }
          pill={status ? (wired ? "tools wired ✓" : `wired: ${status.tools_wired.length ? status.tools_wired.join(", ") : "none"}`) : "…"}
          ok={wired}
          hint={hintA}
          setHint={setHintA}
          hint1={
            <>
              The list takes the function objects themselves, not strings and not calls. Write the three names separated by commas, exactly as
              they are spelled in the <code className="font-mono">def</code> lines above.
            </>
          }
          hint2={`    tools=[check_trends, read_backlog, make_poster],`}
          path="stage0_prompt/agent.py"
          symbol="root_agent"
          pattern={/^\s*tools=\[/}
          onSaved={check}
        />
      </In>

      <In delay={0.25}>
        <EditPanel
          label="Edit 2 of 2"
          title="Make make_poster call the image model."
          intro={
            <>
              Only <code className="font-mono text-fg">make_poster</code> is shown. Today it returns a skipped dict. Replace the TODO line with
              the call: import <code className="font-mono text-fg">images</code> from <code className="font-mono text-fg">agent.platform</code>{" "}
              and return <code className="font-mono text-fg">images.generate(subject, name="solo")</code>. The dict it returns is what the
              model reads back and what the verify rows show.
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
        <LoadCheck app="stage0_prompt" intro="Save both edits, then click the button. It loads stage0_prompt the way adk web will and tells you either that it loads or what ADK objects to." />
      </In>

      {/* run it */}
      <In delay={0.35}>
        <section className="rounded-3xl border p-6" style={{ borderColor: tint(BLUE, 0.33), background: tint(BLUE, 0.04) }}>
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.3em]" style={{ color: BLUE }}>
                Run it
              </p>
              <h2 className="font-display mt-2 text-2xl">Open adk web and talk to the agent.</h2>
              <p className="mt-2 max-w-2xl text-sm text-fg-muted">
                adk web is ADK's development UI. It is mounted inside this app at <code className="font-mono">/inspector</code>{" "}
                and reads the same session store, so it opens here with <code className="font-mono">stage0_prompt</code>{" "}
                preselected.
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
              <p className="mt-1 text-[11px] text-fg-muted">A scene in a few words. It is reused through the lab.</p>
            </Instruction>
            <Instruction n={2} title="Send this in the chat box">
              <CopyLine text={prompt} />
              <p className="mt-1 text-[11px] text-fg-muted">Two tool-call events, then the reply asks you to confirm.</p>
            </Instruction>
            <Instruction n={3} title="Then send this">
              <CopyLine text="skip the questions, describe the video and draw the poster" />
              <p className="mt-1 text-[11px] text-fg-muted">The instruction asked for agreement first. See whether it holds, and watch make_poster fire.</p>
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
                Read from the file and the stage0_prompt sessions in runs/sessions.db: which tools are wired, which were called, and the
                poster the last call drew. The rows update as you send messages.
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
              {status ? (status.called_poster ? `${n("make_poster")} call${s(n("make_poster"))} · the model wrote the subject line itself` : "Not yet. Ask it to draw the poster.") : "…"}
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
                      The same function returns a dict to the model and a PNG to disk. In step 6 this call is a node in the graph, running
                      beside the Veo render; in step 5 the posters the audience reacted to come back out of the RAG corpus with their comments.
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

          <div className="mt-5 rounded-2xl border border-hairline p-4 text-sm text-fg-muted">
            <p className="font-mono text-[10px] uppercase tracking-wider text-fg-muted">What a single prompt cannot promise</p>
            <ul className="mt-2 space-y-1.5">
              <li>
                <b className="text-fg">Research you must re-read</b>: trends and notes are folded into prose, so nothing can say which
                source a claim came from.
              </li>
              <li>
                <b className="text-fg">A blacklist the model certifies for itself</b>: no code checked the direction against the channel's
                policy before the poster was drawn and paid for.
              </li>
              <li>
                <b className="text-fg">An agreement that can be talked past</b>: the second message got the video without your confirmation.
                Prompt text is not a gate.
              </li>
            </ul>
          </div>
        </section>
      </In>

      <In delay={0.55}>
        <div className="mx-auto max-w-3xl rounded-2xl border border-hairline bg-card/60 px-6 py-5 text-center text-sm text-fg-muted">
          Good for a prototype, not for a channel. The rest of the lab takes these six jobs apart into a drawn graph: readers that fan out
          and join, a router that refuses before money is spent, a door that really stops, and a desk where the poster and the clip are
          made side by side.
        </div>
      </In>
    </div>
  );
}

/* ───────────────────────── bits ───────────────────────── */

function Chip({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="rounded-md px-2 py-1" style={{ background: tint(color, 0.1), color, border: `1px solid ${tint(color, 0.27)}` }}>
      {children}
    </span>
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
