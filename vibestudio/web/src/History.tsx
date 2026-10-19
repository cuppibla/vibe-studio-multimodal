import { useEffect, useState } from "react";
import { api } from "./lib/api";
import type { HistoryItem, StudioEvent } from "./lib/types";

function when(at: number): string {
  return new Date(at * 1000).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Every finished run, newest first: the clip, its thumbnail, where it went. */
export function History({ last }: { last: StudioEvent | null }) {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [playing, setPlaying] = useState<string | null>(null);
  const load = () => api.history().then((r) => setItems(r.items)).catch(() => {});
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    if (last && ["run.done", "thumbnail.saved", "poster.ready", "publish.done"].includes(last.type)) load();
  }, [last]);
  if (items.length === 0) return <div className="card empty">No finished runs yet. Kick one off in the studio.</div>;
  return (
    <div className="history">
      {items.map((it) => (
        <article key={it.run_id} className="hcard">
          <div className="media">
            {it.video_url && playing === it.run_id ? (
              <video src={it.video_url} controls autoPlay playsInline />
            ) : it.poster_url || it.thumbnail_url ? (
              <img src={it.poster_url || it.thumbnail_url} alt={`${it.poster_url ? "poster" : "thumbnail"}: ${it.title}`} onClick={() => it.video_url && setPlaying(it.run_id)} style={{ cursor: it.video_url ? "pointer" : "default" }} />
            ) : (
              <div className="none">{it.video_url ? "no thumbnail" : it.render_status === "done" ? "stand-in render, no file" : `render ${it.render_status || "failed"}`}</div>
            )}
          </div>
          <div className="body">
            <b>{it.title || "Untitled"}</b>
            <span className="meta">
              {when(it.at)} · {it.seconds}s run{it.idea ? ` · idea: ${it.idea}` : ""}
            </span>
            {it.direction && <span className="note">{it.direction}</span>}
            <div className="row">
              {it.video_url && (
                <button className="btn ghost small" onClick={() => setPlaying(playing === it.run_id ? null : it.run_id)}>
                  {playing === it.run_id ? (it.poster_url ? "Show poster" : "Show thumbnail") : "Play"}
                </button>
              )}
              {it.video_url && (
                <a className="btn ghost small" href={`/api/download/${it.run_id}`}>
                  Download
                </a>
              )}
              {it.publish_url && (
                <a className="btn cyan small" href={it.publish_url} target="_blank" rel="noreferrer">
                  Published ↗
                </a>
              )}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
