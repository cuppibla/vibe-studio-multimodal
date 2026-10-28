import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ExternalLink, RefreshCw, Send, X } from "lucide-react";
import { api, useRunEvents } from "../lib/api";
import type { PostStatus } from "../lib/types";
import { COLORS, tint } from "../steps/colors";
import { CheckRow } from "../steps/FanOut";

/*
 * Post my video: the button on every page, and the drawer behind it.
 *
 * The lab's last step publishes from VibeStudio on Cloud Run (7b). But the
 * wall does not have to wait for the deploy: from session 2 there is a
 * poster, from session 5 a clip, and VibeTube keeps one video per project
 * and room, so each post REPLACES the last. The drawer shows tonight as far
 * as it has got, takes the room and a title, and runs `scripts/post.py` on
 * the lab server - the same multipart request the app sends in 7b, sent from
 * here. The rows under it read VibeTube back.
 *
 * One status for the whole page: the provider polls lightly (the newest
 * poster and clip come from runs/ and the session store), goes live (the
 * room, the card, the thumbnail bytes) when the drawer is open, and follows
 * a post as it goes out.
 */

const GREEN = COLORS.green;
const AMBER = COLORS.amber;
const CYAN = COLORS.cyan;
const RED = COLORS.red;

type Dock = {
  status: PostStatus | null;
  open: boolean;
  setOpen: (o: boolean) => void;
  refresh: (live?: boolean, code?: string) => Promise<void>;
  checking: boolean;
};

const DockContext = createContext<Dock | null>(null);

export function usePostDock(): Dock {
  const d = useContext(DockContext);
  if (!d) throw new Error("usePostDock outside PostDockProvider");
  return d;
}

export function PostDockProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<PostStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const lastLight = useRef(0);
  const refresh = useCallback(async (live = true, code?: string) => {
    setChecking(true);
    try {
      setStatus(await api.postStatus({ live, code }));
    } catch {
      /* the server is away; the button goes quiet */
    } finally {
      setChecking(false);
    }
  }, []);
  // the first read, and a light one whenever the run files change (a poster
  // lands, a clip is delivered), at most every eight seconds
  const { snapshot } = useRunEvents();
  useEffect(() => {
    refresh(false);
  }, [refresh]);
  useEffect(() => {
    if (!snapshot) return;
    const now = Date.now();
    if (now - lastLight.current < 8000) return;
    lastLight.current = now;
    refresh(false);                      // live reads (the room, the card) are the drawer's own, below
  }, [snapshot, refresh]);
  const value = useMemo(() => ({ status, open, setOpen, refresh, checking }), [status, open, refresh, checking]);
  return (
    <DockContext.Provider value={value}>
      {children}
      <PostDrawer />
    </DockContext.Provider>
  );
}

/** What the button and the drawer agree on: is there anything to post, and how did the last post go. */
function summarize(st: PostStatus | null) {
  const poster = st?.night.poster ?? null;
  const clip = st?.night.clip ?? null;
  const last = st?.last ?? {};
  const done = last.status === "done" && !!last.video_id;
  const posting = !!st?.posting || last.status === "posting";
  const have = clip ? "clip" : poster ? "poster" : "nothing";
  const stale = done && ((clip && (clip.at ?? 0) > (last.done_at ?? last.at ?? 0)) || (poster && (poster.at ?? 0) > (last.done_at ?? last.at ?? 0)));
  return { poster, clip, done, posting, have, stale: !!stale, last };
}

/** The button in the top bar. Its dot says where things stand. */
export function PostButton() {
  const { status, setOpen, open } = usePostDock();
  const s = summarize(status);
  const color = s.posting ? CYAN : s.done && !s.stale ? GREEN : s.have === "clip" ? CYAN : s.have === "poster" ? AMBER : "var(--fg-muted)";
  const label = s.posting ? "Posting…" : s.done && !s.stale ? "On the wall" : s.stale ? "Post again" : "Post my video";
  const title =
    s.have === "nothing"
      ? "Nothing to post yet: the first poster is session 2"
      : s.done && !s.stale
        ? `Posted: ${s.last.title || ""} · ${s.last.url || ""}`
        : s.have === "clip"
          ? "A clip and a poster are ready to post"
          : "A poster is ready: post it as an eight-second push-in";
  return (
    <button
      onClick={() => setOpen(!open)}
      title={title}
      aria-expanded={open}
      className="flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-[11px] font-semibold transition-colors hover:bg-overlay"
      style={{ borderColor: tint(color, 0.5), color: s.have === "nothing" && !s.done ? "var(--fg-muted)" : color, background: tint(color, 0.08) }}
    >
      <span className={`h-2 w-2 rounded-full ${s.posting ? "animate-pulse" : ""}`} style={{ background: color }} />
      {s.done && !s.stale ? <Check size={12} /> : <Send size={12} />}
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}

/** A small call to action for the session pages: shown next to a poster or a clip. */
export function PostCta({ children = "Post it to the wall", color = AMBER }: { children?: ReactNode; color?: string }) {
  const { setOpen } = usePostDock();
  return (
    <button
      onClick={() => setOpen(true)}
      className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-mono text-[11px] font-semibold transition-transform hover:scale-[1.03]"
      style={{ borderColor: tint(color, 0.5), color, background: tint(color, 0.08) }}
    >
      <Send size={12} /> {children} →
    </button>
  );
}

function Field({ label, value, onChange, placeholder, mono = true }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean }) {
  return (
    <label className="block min-w-0">
      <span className="font-mono text-[10px] uppercase tracking-wider text-fg-muted">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`mt-1 w-full rounded-lg border border-hairline bg-input px-3 py-2 text-sm text-fg outline-none focus:border-vibe-cyan/60 ${mono ? "font-mono" : ""}`}
      />
    </label>
  );
}

function ago(ts?: number | null): string {
  if (!ts) return "";
  const s = Math.max(0, Math.round(Date.now() / 1000 - ts));
  return s < 90 ? `${s}s ago` : s < 7200 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`;
}

function PostDrawer() {
  const { status, open, setOpen, refresh, checking } = usePostDock();
  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [seeded, setSeeded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<string[]>([]);
  const logRef = useRef<HTMLPreElement>(null);
  const s = summarize(status);

  // the output of scripts/post.py, as it goes
  useRunEvents((verb, line) => {
    if (verb === "post") setLines((l) => [...l.slice(-59), line]);
  });

  // opening: a live read, and the fields seeded once from the server's defaults
  useEffect(() => {
    if (!open) return;
    refresh(true, code || undefined);
    api.workerLog("post").then((r) => setLines(r.lines.slice(-60))).catch(() => {});
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!status || seeded) return;
    setCode(status.profile.event_code);
    setName(status.profile.display_name);
    setSeeded(true);
  }, [status, seeded]);
  useEffect(() => {
    // a title the student has not touched follows the newest run
    if (status && !title) setTitle(status.night.title);
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [lines]);
  // while a post goes out, follow it; while VibeTube processes, look again
  const processing = status?.video?.status === "processing" || (s.done && !status?.video);
  useEffect(() => {
    if (!open || !(s.posting || processing)) return;
    const t = setInterval(() => refresh(true, code || undefined), s.posting ? 3000 : 10000);
    return () => clearInterval(t);
  }, [open, s.posting, processing, code, refresh]);

  const post = async () => {
    setBusy(true);
    setNote("");
    setLines([]);
    try {
      const r = await api.postRun({ title: title.trim(), event_code: code.trim(), display_name: name.trim() });
      setNote(r.ok ? "" : r.detail);
      if (r.ok) setTimeout(() => refresh(true, code || undefined), 1500);
    } catch (e) {
      setNote(`could not reach the learning center: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const night = status?.night;
  const room = status?.room ?? null;
  const video = status?.video ?? null;
  const last = status?.last ?? {};
  const posterReal = !!s.poster && !s.poster.prebaked;
  const canPost = !!(s.poster || s.clip) && !!code.trim() && !s.posting && !busy && (!!s.clip || (night?.ffmpeg ?? false));
  const accent = s.done && !s.stale ? GREEN : s.have === "clip" ? CYAN : AMBER;

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div key="veil" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
          <motion.aside
            key="drawer"
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 40, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            role="dialog"
            aria-label="Post my video"
            className="fixed inset-y-0 right-0 z-[70] flex w-full max-w-[480px] flex-col border-l border-hairline bg-stage text-fg shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-hairline px-6 py-4">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.3em]" style={{ color: accent }}>
                  Post my video
                </p>
                <h2 className="font-display mt-1 text-2xl">Tonight, as far as it has got.</h2>
                <p className="mt-1 text-xs text-fg-muted">
                  The same request session 7 puts inside the app, sent from here. Nothing to deploy; posting again replaces your video on the wall.
                </p>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close" className="rounded-lg p-2 text-fg-muted hover:text-fg">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
              {/* what goes on the wall */}
              <section className="rounded-2xl border border-hairline bg-card p-4">
                <p className="font-mono text-[10px] uppercase tracking-wider text-fg-muted">What goes on the wall</p>
                <div className="mt-3 flex gap-4">
                  {s.poster ? (
                    <img src={s.poster.url} alt="Tonight's poster" className="poster-9x16 w-24 shrink-0 rounded-xl border border-hairline bg-card object-cover" />
                  ) : (
                    <div className="flex w-24 shrink-0 items-center justify-center rounded-xl border border-dashed border-hairline bg-overlay p-2 text-center font-mono text-[10px] text-fg-muted" style={{ aspectRatio: "9 / 16" }}>
                      no poster yet
                    </div>
                  )}
                  <dl className="min-w-0 flex-1 space-y-2 text-xs">
                    <div>
                      <dt className="font-mono text-[10px] uppercase tracking-wider text-fg-muted">the thumbnail · poster</dt>
                      <dd className="mt-0.5 text-fg-muted">
                        {s.poster ? (
                          posterReal ? (
                            <>drawn {ago(s.poster.at)} · <span className="text-fg">{s.poster.source}</span></>
                          ) : (
                            <span style={{ color: AMBER }}>a stand-in poster: the clip goes out, the thumbnail is left to VibeTube</span>
                          )
                        ) : (
                          "Session 2 draws the first one."
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-mono text-[10px] uppercase tracking-wider text-fg-muted">the video · clip</dt>
                      <dd className="mt-0.5 text-fg-muted">
                        {s.clip ? (
                          <>
                            {s.clip.prebaked ? "the stand-in render" : "the render"} · delivered {ago(s.clip.at)} · <span className="text-fg">{s.clip.source}</span>
                          </>
                        ) : s.poster ? (
                          night?.ffmpeg ? (
                            <>No clip until session 5: <span className="text-fg">an eight-second push-in over the poster</span>, made by ffmpeg when you press post.</>
                          ) : (
                            <span style={{ color: RED }}>no clip yet, and no ffmpeg on this machine to make a push-in; session 5 renders one</span>
                          )
                        ) : (
                          "—"
                        )}
                      </dd>
                    </div>
                    {s.clip ? <video src={s.clip.url} controls playsInline className="mt-1 max-h-32 w-full rounded-lg bg-black" /> : null}
                  </dl>
                </div>
                <div className="mt-3">
                  <Field label={night?.words_source && night.words_source !== "default" ? `title · from ${night.words_source}` : "title"} value={title} onChange={setTitle} placeholder="Tonight's title" mono={false} />
                </div>
              </section>

              {/* the room and the button */}
              <section className="rounded-2xl border p-4" style={{ borderColor: tint(accent, 0.4), background: tint(accent, 0.04) }}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="room · event code, case-sensitive" value={code} onChange={setCode} placeholder="sandbox" />
                  <Field label="your name on the card" value={name} onChange={setName} placeholder="Vibe Studio creator" mono={false} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button
                    onClick={post}
                    disabled={!canPost}
                    className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white transition-transform hover:scale-[1.03] disabled:opacity-50"
                    style={{ background: accent }}
                  >
                    {s.posting ? <RefreshCw size={15} className="animate-spin" /> : <Send size={15} />}
                    {s.posting ? "Posting…" : s.done ? "Post again" : s.have === "clip" ? "Post the clip" : "Post the poster"}
                  </button>
                  <button onClick={() => refresh(true, code || undefined)} disabled={checking} className="flex items-center gap-2 rounded-xl border border-hairline bg-card px-3 py-2 font-mono text-xs text-fg-muted hover:text-fg disabled:opacity-50">
                    <RefreshCw size={13} className={checking ? "animate-spin" : ""} /> Check again
                  </button>
                  <span className="font-mono text-[11px] text-fg-muted">
                    {s.have === "nothing" ? "nothing to post yet" : s.posting ? "going out…" : s.done && !s.stale ? `on the wall · ${last.video_id}` : s.stale ? "newer than the last post" : "ready"}
                  </span>
                </div>
                {note ? <p className="mt-2 font-mono text-xs" style={{ color: RED }}>{note}</p> : null}
                {last.status === "failed" && last.detail ? (
                  <p className="mt-2 font-mono text-xs" style={{ color: RED }}>
                    not posted · {last.detail}
                  </p>
                ) : null}
                {lines.length > 0 ? (
                  <pre ref={logRef} className="mt-3 max-h-32 overflow-auto whitespace-pre-wrap rounded-xl border border-hairline bg-input px-3 py-2 font-mono text-[10.5px] leading-relaxed text-fg">{lines.join("\n")}</pre>
                ) : null}
              </section>

              {/* the rows */}
              <section>
                <p className="font-mono text-[10px] uppercase tracking-wider text-fg-muted">Read back from VibeTube</p>
                <ul className="mt-2 grid gap-2">
                  <CheckRow ok={!!s.poster || !!s.clip} label="something to post" tone={s.poster && !posterReal && !s.clip ? "warn" : "good"}>
                    {s.clip ? `a clip${s.poster ? " and a poster" : ""}` : s.poster ? (posterReal ? "a poster; the clip will be a push-in over it" : "a stand-in poster only") : "Draw the first poster in session 2."}
                  </CheckRow>
                  <CheckRow ok={!!room && room.open} label="the event code names an open room">
                    {room ? (room.open ? `${room.code} · ${room.name} · uploads open` : `${room.code} · ${room.name || "no such room"} · ${room.reason || room.state}`) : "Type an event code and check."}
                  </CheckRow>
                  <CheckRow ok={s.done} label="VibeTube returned a video id">
                    {s.done ? `${last.video_id} · ${ago(last.done_at ?? last.at)}` : last.status ? `${last.status}${last.detail ? ` · ${last.detail}` : ""}` : "Press post."}
                  </CheckRow>
                  <CheckRow ok={!!video && video.status === "ready"} label="the video is on the wall" tone={video?.status === "processing" ? "warn" : "good"}>
                    {video ? `${video.status} · “${video.title}” by ${video.channel}` : s.done ? "Not listed yet; VibeTube is processing it (a minute or three)." : "After the post."}
                  </CheckRow>
                  <CheckRow ok={status?.thumbnail_match === true} label="its thumbnail is your poster">
                    {status?.thumbnail_match === true
                      ? "The same bytes on VibeTube and on this disk."
                      : status?.thumbnail_match === false
                        ? "Different bytes: VibeTube re-encoded it, or the poster changed since."
                        : last.status === "done" && !last.poster
                          ? "No poster was uploaded (a stand-in is never sent); VibeTube picked a frame."
                          : video
                            ? "Could not compare yet."
                            : "After the post."}
                  </CheckRow>
                </ul>
                {s.done && last.url ? (
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <a href={last.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono text-xs font-bold text-white" style={{ background: GREEN }}>
                      Watch it on VibeTube <ExternalLink size={12} />
                    </a>
                    {video?.thumbnail_url ? <img src={video.thumbnail_url} alt="" className="h-16 rounded-md border border-hairline object-cover" /> : null}
                  </div>
                ) : null}
              </section>
            </div>

            <div className="border-t border-hairline px-6 py-3 font-mono text-[10.5px] text-fg-muted">
              the same from tab 1: <span className="text-fg">uv run python scripts/post.py</span> · session 7 makes this request from inside VibeStudio on Cloud Run
            </div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}
