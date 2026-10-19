import { useCallback, useEffect, useRef, useState } from "react";
import type { GraphInfo, HistoryItem, Profile, RunState, StudioEvent } from "./types";
import { IDLE } from "./types";

/** The only place the page talks to the server: a few REST calls, and one
 *  SSE stream that carries every event with the folded state after it. */

async function send<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      /* plain */
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export const api = {
  graph: () => send<GraphInfo>("GET", "/api/graph"),
  state: () => send<RunState>("GET", "/api/state"),
  run: (idea: string) => send<{ ok: boolean; run_id: string }>("POST", "/api/run", { idea }),
  pick: (pick: string) => send("POST", "/api/run/pick", { pick }),
  backlog: () => send<{ ideas: string[]; path: string }>("GET", "/api/backlog"),
  backlogAdd: (text: string) => send<{ ideas: string[] }>("POST", "/api/backlog", { text }),
  backlogRemove: (text: string) => send<{ ideas: string[] }>("DELETE", "/api/backlog", { text }),
  thumbnail: (data_url: string) => send<{ url: string }>("POST", "/api/thumbnail", { data_url }),
  profile: () => send<Profile>("GET", "/api/profile"),
  saveProfile: (p: Partial<Profile>) => send<Profile>("PUT", "/api/profile", p),
  history: () => send<{ items: HistoryItem[] }>("GET", "/api/history"),
  publish: (body: { confirm?: boolean; event_code?: string; platform_url?: string } = {}) => send("POST", "/api/publish", body),
};

/** What the feed shows for an event, in words. */
export function describe(ev: StudioEvent): string | null {
  const d = ev as Record<string, unknown>;
  switch (ev.type) {
    case "run.start":
      return `idea: ${d.idea ? `"${d.idea}"` : "(none: the backlog chooses)"}`;
    case "node.start":
      return `${d.node}`;
    case "node.end":
      return `${d.node}${d.summary ? ` · ${d.summary}` : ""}`;
    case "memory.recalled":
      return `Memory Bank · ${d.facts} facts appended to the proposer`;
    case "memory.written":
      return `Memory Bank · ${((d.actions as string[]) || []).join(", ") || "nothing new"}`;
    case "gate.open":
      return `${(d.candidates as unknown[]).length} candidates · waiting for your pick`;
    case "gate.answered":
      return `pick ${d.pick}`;
    case "direction":
      return `direction: ${d.title}`;
    case "route":
      return `policy_check → ${d.route}`;
    case "render.pending":
      return `render_desk · ${d.operation} · ${d.real ? "Veo is rendering" : "stand-in render"} · the run is suspended`;
    case "render.check":
      return `check ${d.n} · ${d.elapsed}s · still rendering`;
    case "render.done":
      return `clip ready after ${d.seconds}s${d.prebaked ? " · stand-in, no file" : ` · ${d.url}`}`;
    case "render.failed":
      return `render failed · ${d.reason}`;
    case "run.done":
      return `run complete · ${d.seconds}s`;
    case "thumbnail.saved":
      return `thumbnail captured at 2 s · ${d.url}`;
    case "publish.attempt":
      return `publish · attempt ${d.n} of ${d.of}${d.project ? ` · project ${d.project}` : ""}`;
    case "retry":
      return `${d.step} · attempt ${d.attempt} of ${d.of} failed · retrying in ${Math.round(Number(d.wait_s))}s${d.detail ? ` · ${d.detail}` : ""}`;
    case "publish.done":
      return `published · ${d.url}`;
    case "publish.needs_confirm":
      return `publish did not go through · ${d.detail || "no event code"}`;
    case "publish.failed":
      return `publish · ${d.detail}`;
    case "avatar.started":
      return "avatar · generating in the background";
    case "avatar.ready":
      return "avatar · ready";
    case "avatar.failed":
      return `avatar · ${d.detail}`;
    case "profile.saved":
      return `profile saved · ${d.display_name || "no name"} · event ${d.event_code || "(none)"}`;
    case "backlog.changed":
      return `backlog · ${d.count} ideas`;
    case "error":
      return `error · ${d.detail}`;
    default:
      return null;
  }
}

/** The live connection: state and the feed, folded from the stream. */
export function useStudio() {
  const [state, setState] = useState<RunState>(IDLE);
  const [feed, setFeed] = useState<StudioEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [last, setLast] = useState<StudioEvent | null>(null);
  const seen = useRef(0);
  useEffect(() => {
    let es: EventSource | null = null;
    let timer: number | undefined;
    const open = () => {
      es = new EventSource("/api/events");
      es.onopen = () => setConnected(true);
      es.onmessage = (m) => {
        const ev = JSON.parse(m.data) as StudioEvent;
        if (ev.type === "snapshot") {
          setState(ev.state);
          setFeed((ev.replay ?? []).filter((e) => describe(e) !== null));
          seen.current = ev.seq;
          return;
        }
        if (ev.seq <= seen.current) return;
        seen.current = ev.seq;
        setState(ev.state);
        setLast(ev);
        if (describe(ev) !== null) setFeed((f) => [...f.slice(-299), ev]);
      };
      es.onerror = () => {
        setConnected(false);
        es?.close();
        timer = window.setTimeout(open, 2000);
      };
    };
    open();
    return () => {
      es?.close();
      window.clearTimeout(timer);
    };
  }, []);
  const refresh = useCallback(async () => setState(await api.state()), []);
  return { state, feed, connected, last, refresh };
}
