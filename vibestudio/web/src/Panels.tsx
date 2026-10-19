import { useEffect, useState } from "react";
import { api, describe } from "./lib/api";
import type { RunState, StudioEvent } from "./lib/types";

const BUSY = new Set(["running", "waiting_pick", "rendering"]);

export function IdeaForm({ state, onError }: { state: RunState; onError: (m: string) => void }) {
  const [idea, setIdea] = useState("");
  const busy = BUSY.has(state.status);
  const kick = async () => {
    try {
      await api.run(idea);
    } catch (e) {
      onError((e as Error).message);
    }
  };
  return (
    <label className="f">
      <div className="eyebrow">Tonight's idea</div>
      <textarea className="txt" value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="a tiny ghost learning to haunt a sock drawer" disabled={busy} />
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn" onClick={kick} disabled={busy}>
          {busy ? "Running…" : state.status === "idle" ? "Kick off" : "Kick off another"}
        </button>
        {!busy && <span className="note">or leave it empty: the graph chooses from the backlog</span>}
      </div>
    </label>
  );
}

export function Backlog({ last }: { last: StudioEvent | null }) {
  const [ideas, setIdeas] = useState<string[]>([]);
  const [path, setPath] = useState("");
  const [text, setText] = useState("");
  const load = () =>
    api
      .backlog()
      .then((r) => {
        setIdeas(r.ideas);
        setPath(r.path);
      })
      .catch(() => {});
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    if (last?.type === "backlog.changed") load();
  }, [last]);
  const add = async () => {
    if (!text.trim()) return;
    setIdeas((await api.backlogAdd(text)).ideas);
    setText("");
  };
  const remove = async (t: string) => setIdeas((await api.backlogRemove(t)).ideas);
  return (
    <div className="backlog">
      <div className="eyebrow">Backlog · {ideas.length} ideas</div>
      <ul>
        {ideas.map((i) => (
          <li key={i}>
            <span>{i}</span>
            <button onClick={() => remove(i)} title="remove" aria-label={`remove ${i}`}>
              ×
            </button>
          </li>
        ))}
        {ideas.length === 0 && <li className="note">Empty. Add an idea for someday.</li>}
      </ul>
      <div className="addrow">
        <input
          className="txt"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
          placeholder="add an idea for someday…"
        />
        <button className="btn ghost" onClick={add}>
          Add
        </button>
      </div>
      <div className="note" title={path}>
        Saved to the file the graph reads, {path.split("/").slice(-2).join("/")}; the next run sees it.
      </div>
    </div>
  );
}

const KIND: Record<string, string> = {
  "gate.open": "g",
  "render.pending": "g",
  "publish.needs_confirm": "g",
  "render.done": "ok",
  "run.done": "ok",
  "publish.done": "ok",
  "thumbnail.saved": "ok",
  "avatar.ready": "ok",
  "render.failed": "bad",
  "publish.failed": "bad",
  "avatar.failed": "bad",
  error: "bad",
};

export function EventFeed({ feed, start }: { feed: StudioEvent[]; start: number | null }) {
  const clock = (at: number) => {
    if (!start) return "—";
    const s = Math.max(0, Math.round(at - start));
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  };
  return (
    <div className="card feed">
      <div className="eyebrow">Events</div>
      <ol>
        {feed.length === 0 && (
          <li>
            <span>—</span>
            <span className="k">ready</span>
            <em>nothing yet: kick off a run</em>
          </li>
        )}
        {feed.map((ev) => (
          <li key={ev.seq}>
            <span>{clock(ev.at)}</span>
            <span className={`k ${KIND[ev.type] ?? ""}`}>{ev.type}</span>
            <em>{describe(ev)}</em>
          </li>
        ))}
      </ol>
    </div>
  );
}
