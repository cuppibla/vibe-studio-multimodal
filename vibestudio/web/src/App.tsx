import { useCallback, useEffect, useState } from "react";
import { GraphView } from "./GraphView";
import { History } from "./History";
import { Backlog, EventFeed, IdeaForm } from "./Panels";
import { ProfileDrawer } from "./ProfileDrawer";
import { Stage } from "./Stage";
import { api, useStudio } from "./lib/api";
import type { Profile } from "./lib/types";

const EMPTY: Profile = { display_name: "", description: "", platform_url: "https://vibetube.dev", event_code: "", avatar_url: "", project_id: "" };
const THEME_KEY = "vibe-studio-theme";

function useTheme() {
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    try {
      const stored = window.localStorage.getItem(THEME_KEY);
      if (stored === "light" || stored === "dark") return stored;
    } catch {
      /* no storage */
    }
    return "light";   // the Haunted Edition opens at dusk, the hero art's mood
  });
  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
    try {
      window.localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* no storage */
    }
  }, [theme]);
  return { theme, toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")) };
}

const Sun = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);
const Moon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--purple)" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </svg>
);

export function App() {
  const { state, feed, connected, last } = useStudio();
  const { theme, toggle } = useTheme();
  const [profile, setProfile] = useState<Profile>(EMPTY);
  const [drawer, setDrawer] = useState(false);
  const [tab, setTab] = useState<"studio" | "history">("studio");
  const [toast, setToast] = useState("");
  useEffect(() => {
    api.profile().then(setProfile).catch(() => {});
  }, []);
  useEffect(() => {
    if (last?.type === "profile.saved" || last?.type === "avatar.ready") api.profile().then(setProfile).catch(() => {});
  }, [last]);
  // A retry in progress: the step, the attempt that failed, and when the next try starts.
  const [retry, setRetry] = useState<{ step: string; attempt: number; of: number; deadline: number; detail: string } | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!last) return;
    if (last.type === "retry") {
      const d = last as Record<string, unknown>;
      setRetry({ step: String(d.step), attempt: Number(d.attempt), of: Number(d.of), deadline: Date.now() + Number(d.wait_s) * 1000, detail: String(d.detail ?? "") });
    } else {
      setRetry(null);
    }
  }, [last]);
  useEffect(() => {
    if (!retry) return;
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [retry]);
  const onError = useCallback((m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(""), 5000);
  }, []);
  const busy = state.status === "running" || state.status === "waiting_pick" || state.status === "rendering";
  const worker = (() => {
    switch (state.status) {
      case "running":
        return (
          <span className="worker">
            {state.active ?? "…"} · <span className="dots"><b /><b /><b /></span> working
          </span>
        );
      case "waiting_pick":
        return <span className="worker amber">direction_gate · waiting for you</span>;
      case "rendering":
        return (
          <span className="worker">
            render_desk · Veo · <span className="dots"><b /><b /><b /></span> check {state.render.checks ?? 0}
          </span>
        );
      case "done":
        return <span className="worker green">run complete · {state.finished_at && state.started_at ? `${Math.round(state.finished_at - state.started_at)} s` : ""}</span>;
      case "failed":
        return <span className="worker red">stopped · {state.active}</span>;
      default:
        return <span className="worker mute">idle</span>;
    }
  })();

  return (
    <>
      <div className="ambience" aria-hidden="true">
        <i className="a" />
        <i className="b" />
        <i className="fog" />
        <i className="bats" />
      </div>
      <div className="frame">
        <header className="bar">
          <div className="row" style={{ gap: 18 }}>
            <div className="brand">
              <img src={theme === "dark" ? "/logo-dark.svg" : "/logo.svg"} alt="VibeStudio, Haunted Edition" />
            </div>
            <div className="tabs" role="tablist">
              <button role="tab" aria-selected={tab === "studio"} className={tab === "studio" ? "on" : ""} onClick={() => setTab("studio")}>
                Studio
              </button>
              <button role="tab" aria-selected={tab === "history"} className={tab === "history" ? "on" : ""} onClick={() => setTab("history")}>
                History
              </button>
            </div>
          </div>
          <div className="row">
            <span className="chip plain">
              <span className={`dot ${busy ? "busy" : connected ? "on" : ""}`} /> {connected ? (busy ? "live · running" : "live") : "reconnecting…"}
            </span>
            <button className="chip" onClick={() => setDrawer(true)} title="profile, avatar, publish target">
              {profile.avatar_url ? <img className="av" src={profile.avatar_url} alt="" /> : <span className="av" />}
              {profile.display_name || "Your profile"}
              {profile.event_code ? (
                <>
                  {" "}
                  · <span className="mono">{profile.event_code}</span>
                </>
              ) : null}
            </button>
            <button className="iconbtn" onClick={toggle} aria-label="Toggle theme" title={theme === "dark" ? "Switch to dusk" : "Switch to night"}>
              {theme === "dark" ? <Sun /> : <Moon />}
            </button>
          </div>
        </header>
        {retry && (
          <div className="retrybar" role="status">
            <span className="clock" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18">
                <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" />
                <line x1="12" y1="12" x2="12" y2="6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <line x1="12" y1="12" x2="16" y2="12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" style={{ transformOrigin: "12px 12px", transform: `rotate(${((now / 1000) % 60) * 6}deg)` }} />
              </svg>
            </span>
            <span>
              <b>{retry.step}</b> failed on attempt {retry.attempt} of {retry.of}. Waiting{" "}
              <span className="mono">{Math.max(0, Math.ceil((retry.deadline - now) / 1000))}s</span> to re-submit
              {retry.attempt + 1 <= retry.of ? ` (attempt ${retry.attempt + 1} of ${retry.of})` : ""}.
              {retry.detail ? <span className="note"> {retry.detail}</span> : null}
            </span>
          </div>
        )}
        {tab === "studio" ? (
          <div className="grid">
            <aside className="side">
              <IdeaForm state={state} onError={onError} />
              <Backlog last={last} />
            </aside>
            <main className="main">
              <div className="card canvas">
                <div className="head">
                  <div className="eyebrow">
                    The workflow · from <span className="mono">wf.graph.edges</span>
                  </div>
                  {worker}
                </div>
                <GraphView state={state} />
              </div>
              <div className="lower">
                <EventFeed feed={feed} start={state.started_at} />
                <Stage state={state} profile={profile} onError={onError} />
              </div>
            </main>
          </div>
        ) : (
          <main className="main" style={{ padding: 22 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div>
                <div className="eyebrow">History</div>
                <h2>Every clip this studio made.</h2>
              </div>
            </div>
            <div className="notice">
              This is a demonstration deployment. Clips and thumbnails are kept on the service's local storage and are cleared whenever the Cloud Run instance
              restarts. Download anything you want to keep.
            </div>
            <History last={last} />
          </main>
        )}
        {drawer && <ProfileDrawer profile={profile} last={last} onSaved={setProfile} onClose={() => setDrawer(false)} />}
        {toast && (
          <div className="modal" style={{ alignItems: "flex-end", background: "transparent", backdropFilter: "none", pointerEvents: "none" }}>
            <div className="dialog" style={{ marginBottom: 20, borderColor: "var(--red)" }}>
              <span className="err">{toast}</span>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
