import { useEffect, useRef, useState } from "react";
import { api } from "./lib/api";
import type { Profile, RunState } from "./lib/types";

/** The stage card: what the run needs from you, or what it made. */
export function Stage({ state, profile, onError }: { state: RunState; profile: Profile; onError: (m: string) => void }) {
  switch (state.status) {
    case "idle":
      return (
        <div className="card stage">
          <div className="eyebrow">Stage</div>
          <h3>Nothing running.</h3>
          <p className="note">Type tonight's idea or leave it empty, then kick off. The research fan-out runs first, propose_directions pitches four directions, and the graph stops for your pick. After the script, the poster is drawn while Veo renders the clip.</p>
        </div>
      );
    case "running":
      return <Running state={state} />;
    case "waiting_pick":
      return <Pick state={state} onError={onError} />;
    case "rendering":
      return <Rendering state={state} />;
    case "failed":
      return (
        <div className="card stage">
          <div className="eyebrow" style={{ color: "var(--red)" }}>
            The run stopped
          </div>
          <h3>{state.active ? `${state.active} raised` : "An error"}</h3>
          <p className="err mono">{state.error}</p>
          <p className="note">Kick off another run. The event feed on the left has the sequence.</p>
        </div>
      );
    case "done":
      return <Done state={state} profile={profile} onError={onError} />;
  }
}

function Running({ state }: { state: RunState }) {
  const r = state.research;
  const after = state.pick !== null;
  return (
    <div className="card stage">
      <div className="eyebrow">Stage</div>
      <h3>{after ? `Direction ${state.pick}: ${state.direction.title || "…"}` : "Research in, four directions coming."}</h3>
      {!after ? (
        <>
          <p className="note">The readers report to the join; propose_directions writes four candidates from the trends, the backlog, the audience's comments and the posters they came with, and what Memory Bank knows about you.</p>
          <div className="kv">
            <b>trends</b>
            <span>{r.trends?.length ? r.trends.slice(0, 3).join(" · ") : "…"}</span>
            <b>backlog</b>
            <span>{r.backlog !== undefined ? `${r.backlog} notes` : "…"}</span>
            <b>feedback</b>
            <span>{r.feedback?.length ? `${r.feedback.length} passages nearest to "${r.feedback_query}"` : r.feedback ? "no corpus connected" : "…"}</span>
            <b>memory</b>
            <span>{state.memory_facts ? `${state.memory_facts} facts about you` : "…"}</span>
          </div>
        </>
      ) : (
        <>
          <p className="note">
            {state.route === "BLOCK"
              ? `The policy gate refused it; quarantine is replacing the words it caught${state.cleaned.title ? `: "${state.cleaned.title}"` : ""}.`
              : state.route === "OK"
                ? "The policy gate let it through; the scripter is writing."
                : "Persisting the direction, then the policy gate."}
          </p>
          {state.script.title && (
            <div className="kv">
              <b>script</b>
              <span>
                "{state.script.title}" · {state.script.shots?.length ?? 0} shots
              </span>
              <b>opening</b>
              <span>{state.script.opening_line}</span>
              {state.script.style && (
                <>
                  <b>look</b>
                  <span>{state.script.style}</span>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Pick({ state, onError }: { state: RunState; onError: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  const choose = async (n: number) => {
    setBusy(true);
    try {
      await api.pick(String(n));
    } catch (e) {
      onError((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <div className="card stage">
      <div className="eyebrow" style={{ color: "var(--amber)" }}>
        Your pick · the graph is paused
      </div>
      <h3>Pick tonight's direction.</h3>
      <div className="cands">
        {state.candidates.map((c, i) => (
          <button key={i} className={`cand${i === 3 ? " bad" : ""}`} onClick={() => choose(i + 1)} disabled={busy}>
            <span className="n">{i + 1}</span>
            <span className="t">{c.title}</span>
            <span className="a">{c.angle}</span>
            {c.hook && <span className="hook">{c.hook}</span>}
            {c.style && <span className="a">look: {c.style}</span>}
            {i === 3 ? <span className="tag">the policy gate will catch this one</span> : c.sources.length > 0 && <span className="src">{c.sources.join(" · ")}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

function Rendering({ state }: { state: RunState }) {
  const r = state.render;
  const [now, setNow] = useState(Date.now() / 1000);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(t);
  }, []);
  const elapsed = r.started_at ? Math.max(0, Math.round(now - r.started_at)) : 0;
  const clock = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
  return (
    <div className="card stage">
      <div className="eyebrow">Stage</div>
      <h3>Veo is rendering "{state.script.title || state.direction.title}".</h3>
      {state.poster.url && (
        <div className="thumb poster small">
          <img src={state.poster.url} alt={`poster: ${state.poster.subject || ""}`} />
          <div className="cap">{state.poster.prebaked ? "poster · stand-in" : "poster · done in seconds, while Veo renders"}</div>
        </div>
      )}
      <div className="prog">
        <i />
      </div>
      <p className="note">
        <span className="spin" /> operation <span className="mono">{(r.operation || "").split("/").slice(-1)[0].slice(0, 24)}</span> · check {r.checks ?? 0} · {clock} · the graph is suspended on the receipt; the app polls and delivers by id
      </p>
      <div className="kv">
        <b>prompt</b>
        <span>{(r.prompt || "").slice(0, 220)}…</span>
        <b>retries</b>
        <span>8 × 70 s on every Veo call</span>
      </div>
    </div>
  );
}

function Done({ state, profile, onError }: { state: RunState; profile: Profile; onError: (m: string) => void }) {
  const url = state.render.url || "";
  const ok = state.render.status === "done";
  const [confirming, setConfirming] = useState(false);
  const pub = state.publish;
  useEffect(() => {
    if (pub.status === "needs_confirm") setConfirming(true);
  }, [pub.status, pub.attempts]);
  const publish = async (body: { confirm?: boolean; event_code?: string; platform_url?: string } = {}) => {
    try {
      await api.publish(body);
    } catch (e) {
      onError((e as Error).message);
    }
  };
  return (
    <div className="card stage">
      <div className="eyebrow" style={{ color: ok ? "var(--green)" : "var(--red)" }}>
        {ok ? "Done" : "Done, without a clip"}
      </div>
      <h3>{state.script.title || state.direction.title || "Untitled"}</h3>
      <div className="player">
        {url ? <Player url={url} title={state.script.title || ""} runId={state.run_id || ""} have={!!state.thumbnail_url} /> : <div className="novideo note">{state.render.prebaked ? "Stand-in render: STUDIO_REAL_VIDEO=0, so there is no file to play." : `No clip: ${state.render.reason || "the render failed"}.`}</div>}
        {state.poster.url ? (
          <div className="thumb poster">
            <img src={state.poster.url} alt={`poster: ${state.poster.subject || state.script.title}`} />
            <div className="cap">{state.poster.prebaked ? "poster · the stand-in (no image model reachable)" : "poster · the image model, 9:16 · make_poster"}</div>
          </div>
        ) : (
          <div className="thumb">
            {state.thumbnail_url ? <img src={state.thumbnail_url} alt={`thumbnail: ${state.script.title}`} /> : <div className="novideo note">{url ? "capturing the frame at 2 s…" : "no thumbnail without a clip"}</div>}
            <div className="cap">thumbnail · frame at 2 s + title</div>
          </div>
        )}
      </div>
      {url && (
        <div className="pub">
          <a className="btn ghost" href={`/api/download/${state.run_id}`}>
            Download the clip
          </a>
          {pub.status === "done" ? (
            <>
              <a className="btn cyan" href={pub.url} target="_blank" rel="noreferrer">
                Watch it on {profile.platform_url.replace(/^https?:\/\//, "")}
              </a>
              <span className="note ok">published · {pub.attempts} attempt{pub.attempts === 1 ? "" : "s"}</span>
            </>
          ) : pub.status === "publishing" ? (
            <span className="note">
              <span className="spin" /> publishing · attempt {pub.attempts} of 3
            </span>
          ) : (
            <>
              <button className="btn cyan" onClick={() => publish()} disabled={!state.thumbnail_url && !!url && false}>
                Publish to {profile.platform_url.replace(/^https?:\/\//, "")}
              </button>
              <span className="note">
                event <span className="mono">{profile.event_code || "(none yet)"}</span> · as {profile.display_name || "Vibe Studio creator"} · 3 attempts, then it asks
              </span>
            </>
          )}
        </div>
      )}
      {pub.status === "failed" && <p className="err">{pub.detail}</p>}
      {confirming && pub.status === "needs_confirm" && (
        <RetryDialog
          profile={profile}
          detail={pub.detail || ""}
          attempts={pub.attempts || 0}
          onKeep={() => setConfirming(false)}
          onRetry={(event_code, platform_url) => {
            setConfirming(false);
            publish({ confirm: true, event_code, platform_url });
          }}
        />
      )}
    </div>
  );
}

/** The clip, and the thumbnail: the frame at 2 s with the title, drawn once
 *  on a canvas and posted to the server. */
function Player({ url, title, runId, have }: { url: string; title: string; runId: string; have: boolean }) {
  const done = useRef<string | null>(null);
  useEffect(() => {
    if (have || done.current === runId) return;
    done.current = runId;
    const v = document.createElement("video");
    v.src = url;
    v.muted = true;
    v.preload = "auto";
    v.crossOrigin = "anonymous";
    v.addEventListener("loadedmetadata", () => {
      v.currentTime = Math.min(2, Math.max(0, v.duration - 0.05));
    });
    v.addEventListener("seeked", () => {
      const c = document.createElement("canvas");
      c.width = 1280;
      c.height = 720;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(v, 0, 0, c.width, c.height);
      const grad = ctx.createLinearGradient(0, 420, 0, 720);
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(1, "rgba(0,0,0,0.85)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 420, c.width, 300);
      ctx.fillStyle = "#ffffff";
      ctx.font = "700 56px 'Bricolage Grotesque', 'Instrument Sans', sans-serif";
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = 12;
      const lines = wrap(ctx, title || "Untitled", c.width - 120);
      lines.forEach((line, i) => ctx.fillText(line, 60, 640 - (lines.length - 1 - i) * 66));
      api.thumbnail(c.toDataURL("image/png")).catch(() => {
        done.current = null;
      });
    });
    v.addEventListener("error", () => {
      done.current = null;
    });
    v.load();
  }, [url, title, runId, have]);
  return <video className="video" src={url} controls autoPlay muted playsInline />;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(t).width > max && cur) {
      lines.push(cur);
      cur = w;
    } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines.slice(-2);
}

function RetryDialog({ profile, detail, attempts, onKeep, onRetry }: { profile: Profile; detail: string; attempts: number; onKeep: () => void; onRetry: (event: string, platform: string) => void }) {
  const [event, setEvent] = useState(profile.event_code);
  const [platform, setPlatform] = useState(profile.platform_url);
  const none = attempts === 0;
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Publish did not go through">
      <div className="dialog">
        <div className="eyebrow" style={{ color: "var(--red)" }}>
          {none ? "No event code" : "Publish did not go through"}
        </div>
        <h3>{none ? "Which event is this for?" : `${attempts} attempts, ${attempts} refusals.`}</h3>
        <p className="note">
          {none ? "The platform files clips under an event. Your instructor has the code." : <>{profile.platform_url.replace(/^https?:\/\//, "")}: <span className="mono">{detail}</span>. {/cannot reach/.test(detail) ? "The platform URL is the service address your instructor gives, not necessarily vibetube.dev." : "Your instructor has the event code."}</>}
        </p>
        <label className="f" style={{ marginTop: 10 }}>
          <div className="eyebrow">Event code</div>
          <input className="txt" value={event} onChange={(e) => setEvent(e.target.value)} />
        </label>
        <label className="f" style={{ marginTop: 8 }}>
          <div className="eyebrow">Platform</div>
          <input className="txt" value={platform} onChange={(e) => setPlatform(e.target.value)} />
        </label>
        <div className="actions">
          <button className="btn ghost" onClick={onKeep}>
            Keep the clip local
          </button>
          <button className="btn" onClick={() => onRetry(event.trim(), platform.trim())} disabled={!event.trim()}>
            {none ? "Publish with this code" : "Retry with this code"}
          </button>
        </div>
      </div>
    </div>
  );
}
