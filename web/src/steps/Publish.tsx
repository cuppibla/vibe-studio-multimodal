import { useCallback, useEffect, useState } from "react";
import { ExternalLink, RefreshCw, Send } from "lucide-react";
import { Fold } from "../components/Fold";
import { In, StepHeader } from "../components/shared";
import { api } from "../lib/api";
import type { PublishStatus } from "../lib/types";
import { COLORS, tint } from "./colors";
import { CheckRow, VerifyPanel } from "./FanOut";

/*
 * Session 7b · Publish (steps/Release.tsx): the deployed VibeStudio posts the
 * night's clip and its poster to a VibeTube room in one multipart request; the
 * room's code is the one thing the creator types (PUBLISH, a configuration
 * step, not a code hole). The lab server relays the page's clicks to the app
 * (server/api/lab.py · publish) and reads the result back from the app and
 * from VibeTube.
 */

const GREEN = COLORS.green;
const AMBER = COLORS.amber;
const CYAN = COLORS.cyan;
const RED = COLORS.red;
const mono = { fontFamily: "var(--font-mono)" } as const;

const CODE_PUBLISH = `# vibestudio/server/platform/publish.py
url = f"{prof['platform_url']}/api/events/{prof['event_code']}/videos"
data = {"title": state.script["title"], "description": state.script["description"],
        "duration": "0:08", "displayName": prof["display_name"],
        "projectId": prof["project_id"]}        # one video per project and room: publishing again replaces it
files = {"videoFile": (clip.name, clip.open("rb"), "video/mp4"),
         "thumbnailFile": (poster.name, poster.open("rb"), "image/png")}   # the poster, not a frame
r = httpx.post(url, data=data, files=files, timeout=120)
video_id = r.json()["id"]                       # watch it at {platform}/e/{event}?v={video_id}`;

/** One request: the app, the two files, the room, the card on the wall. */
function PublishFigure() {
  const box = (x: number, y: number, w: number, h: number, color: string) => (
    <rect x={x} y={y} width={w} height={h} rx={12} fill={tint(color, 0.07)} stroke={color} strokeOpacity="0.8" />
  );
  return (
    <figure className="m-0 mt-4">
      <svg viewBox="0 0 760 210" className="h-auto w-full text-fg" role="img" aria-label="VibeStudio on Cloud Run holds the clip and the poster; one multipart POST to the VibeTube event's videos endpoint; the wall shows a card whose thumbnail is the poster">
        <defs>
          <marker id="pb-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="currentColor" />
          </marker>
        </defs>
        {box(10, 30, 230, 150, GREEN)}
        <text x="125" y="52" textAnchor="middle" fontSize="10.5" style={mono} fill={GREEN}>VibeStudio · Cloud Run</text>
        <rect x="26" y="66" width="96" height="54" rx="8" fill="var(--card)" stroke={CYAN} strokeOpacity="0.8" />
        <text x="74" y="89" textAnchor="middle" fontSize="9.5" style={mono} fill={CYAN}>the clip</text>
        <text x="74" y="104" textAnchor="middle" fontSize="8" style={mono} fill="currentColor" opacity="0.65">renders/*.mp4</text>
        <rect x="132" y="66" width="92" height="54" rx="8" fill="var(--card)" stroke={AMBER} strokeOpacity="0.8" />
        <text x="178" y="89" textAnchor="middle" fontSize="9.5" style={mono} fill={AMBER}>the poster</text>
        <text x="178" y="104" textAnchor="middle" fontSize="8" style={mono} fill="currentColor" opacity="0.65">posters/*.png</text>
        <text x="125" y="146" textAnchor="middle" fontSize="8.5" style={mono} fill="currentColor" opacity="0.7">profile: platform · event code · name</text>
        <text x="125" y="162" textAnchor="middle" fontSize="8.5" style={mono} fill="currentColor" opacity="0.7">projectId = your Google Cloud project</text>
        <line x1="240" y1="105" x2="300" y2="105" stroke="currentColor" strokeOpacity="0.6" strokeWidth="1.3" markerEnd="url(#pb-arrow)" />
        <text x="270" y="94" textAnchor="middle" fontSize="8.5" style={mono} fill="currentColor" opacity="0.8">POST · multipart</text>
        {box(302, 30, 206, 150, CYAN)}
        <text x="405" y="52" textAnchor="middle" fontSize="10.5" style={mono} fill={CYAN}>VibeTube · vibetube.dev</text>
        <text x="405" y="78" textAnchor="middle" fontSize="8.5" style={mono} fill="currentColor" opacity="0.85">/api/events/{"{code}"}/videos</text>
        <text x="405" y="100" textAnchor="middle" fontSize="8.5" style={mono} fill="currentColor" opacity="0.7">videoFile · thumbnailFile</text>
        <text x="405" y="116" textAnchor="middle" fontSize="8.5" style={mono} fill="currentColor" opacity="0.7">title · duration · displayName · projectId</text>
        <text x="405" y="146" textAnchor="middle" fontSize="8.5" style={mono} fill={GREEN}>200 · {"{"}"id": "v_…"{"}"}</text>
        <text x="405" y="162" textAnchor="middle" fontSize="8" style={mono} fill="currentColor" opacity="0.6">processing → ready, a minute or three</text>
        <line x1="508" y1="105" x2="568" y2="105" stroke="currentColor" strokeOpacity="0.6" strokeWidth="1.3" markerEnd="url(#pb-arrow)" />
        {box(570, 30, 180, 150, AMBER)}
        <text x="660" y="52" textAnchor="middle" fontSize="10.5" style={mono} fill={AMBER}>the wall · /e/{"{code}"}</text>
        <rect x="596" y="64" width="128" height="72" rx="8" fill="var(--card)" stroke={AMBER} strokeOpacity="0.8" />
        <rect x="604" y="72" width="112" height="44" rx="5" fill={tint(AMBER, 0.25)} />
        <text x="660" y="98" textAnchor="middle" fontSize="8.5" style={mono} fill={AMBER}>your poster</text>
        <text x="660" y="130" textAnchor="middle" fontSize="8" style={mono} fill="currentColor" opacity="0.8">the title · your name</text>
        <text x="660" y="162" textAnchor="middle" fontSize="8" style={mono} fill="currentColor" opacity="0.6">the thumbnail is the poster</text>
        <text x="380" y="200" textAnchor="middle" fontSize="9" style={mono} fill="currentColor" opacity="0.6">the app does the posting; this page only tells it the room and presses the button</text>
      </svg>
    </figure>
  );
}

function Field({ label, value, onChange, placeholder, mono: isMono = true }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean }) {
  return (
    <label className="block min-w-0">
      <span className="font-mono text-[10px] uppercase tracking-wider text-fg-muted">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`mt-1 w-full rounded-lg border border-hairline bg-input px-3 py-2 text-sm text-fg outline-none focus:border-vibe-cyan/60 ${isMono ? "font-mono" : ""}`}
      />
    </label>
  );
}

export function Publish() {
  const [status, setStatus] = useState<PublishStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [appUrl, setAppUrl] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [seeded, setSeeded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const check = useCallback(
    async (url?: string) => {
      setChecking(true);
      try {
        const st = await api.publishStatus(url);
        setStatus(st);
        if (!seeded) {
          setAppUrl(st.app_url);
          if (st.profile) {
            setCode(st.profile.event_code);
            setName(st.profile.display_name);
          }
          setSeeded(true);
        }
      } catch (e) {
        setNote(`could not reach the learning center: ${(e as Error).message}`);
      } finally {
        setChecking(false);
      }
    },
    [seeded],
  );
  useEffect(() => {
    check();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const publishing = status?.publish?.status === "publishing";
  useEffect(() => {
    // while the app posts, follow it; the result lands in its publish record
    if (!publishing) return;
    const t = setInterval(() => check(appUrl), 3000);
    return () => clearInterval(t);
  }, [publishing, appUrl, check]);
  const videoProcessing = status?.video?.status === "processing";
  useEffect(() => {
    if (!videoProcessing) return;
    const t = setInterval(() => check(appUrl), 10000);
    return () => clearInterval(t);
  }, [videoProcessing, appUrl, check]);

  const publish = async () => {
    setBusy(true);
    setNote("");
    try {
      const r = await api.publishRun({ url: appUrl, event_code: code.trim(), display_name: name.trim() });
      setNote(r.detail);
      if (r.ok) setTimeout(() => check(appUrl), 2500);
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const night = status?.night ?? null;
  const room = status?.room ?? null;
  const pub = status?.publish ?? {};
  const video = status?.video ?? null;
  const reachable = status?.reachable ?? false;
  const nightReady = !!night && night.status === "done" && night.clip && night.poster;
  const posterReal = !!night && night.poster && !night.poster_prebaked;
  const done = pub.status === "done" && !!pub.video_id;
  const posterSrc = night?.poster_url && appUrl ? `${appUrl}${night.poster_url}` : "";

  return (
    <div className="space-y-12">
      <StepHeader
        kicker="Session 7b · Publish"
        color={GREEN}
        title="Your video on the wall, the poster as its thumbnail."
        blurb="VibeStudio posts the clip and the poster to a VibeTube room in one request. The room's code is the one thing you type; the app does the rest."
      />

      <In delay={0.1}>
        <section className="rounded-3xl border border-hairline bg-card p-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-fg-muted">How it goes out</p>
          <h2 className="font-display mt-2 text-2xl">One multipart POST.</h2>
          <p className="mt-2 max-w-3xl text-sm text-fg-muted">
            The clip is the video, the poster is the thumbnail, the profile names the room and you. VibeTube answers with a video id and shows the card once it has processed the file.
          </p>
          <PublishFigure />
          <div className="mt-4 overflow-hidden rounded-2xl border border-hairline bg-input">
            <div className="border-b border-hairline px-4 py-1.5 font-mono text-[10px] uppercase tracking-wider text-fg-muted">vibestudio/server/platform/publish.py · the request</div>
            <pre className="overflow-x-auto px-4 py-3 font-mono text-[11px] leading-relaxed text-fg">
              <code>{CODE_PUBLISH}</code>
            </pre>
          </div>
        </section>
      </In>

      <Fold title="One video per project and room" kicker="reference">
        <p>
          VibeTube keeps one video per <code>projectId</code> and room, and the project the app sends is your Google Cloud project (<code>VIBETUBE_PROJECT</code>, else{" "}
          <code>GOOGLE_CLOUD_PROJECT</code>). Publishing again replaces your video instead of adding one, so a second night does not crowd the wall. Three attempts, a few
          seconds apart; when the platform is still processing your previous upload it answers 409 and the app waits twenty seconds. A stand-in poster is never uploaded:
          a prebaked run publishes the clip without a thumbnail.
        </p>
      </Fold>

      <In delay={0.2}>
        <section className="rounded-3xl border p-6" style={{ borderColor: tint(AMBER, 0.4), background: tint(AMBER, 0.04) }}>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.3em]" style={{ color: AMBER }}>Your edit · PUBLISH</p>
              <h2 className="font-display mt-2 text-2xl">Name the room, press publish.</h2>
            </div>
            <span className="rounded-full border px-3 py-1 font-mono text-[11px]" style={{ borderColor: tint(done ? GREEN : AMBER, 0.5), color: done ? GREEN : AMBER }}>
              {done ? `published · ${pub.video_id}` : publishing ? "publishing…" : nightReady ? "a night is ready to publish" : "no finished night yet"}
            </span>
          </div>
          <ol className="mt-3 grid gap-2 text-sm text-fg-muted md:grid-cols-3">
            <li className="rounded-2xl border border-hairline bg-card px-4 py-3">
              <span className="font-mono text-[10px] uppercase tracking-wider text-fg-muted">1 · in the app</span>
              <p className="mt-1">
                Open VibeStudio and run a night: an idea, a pick, wait for the clip and the poster.
                {appUrl ? (
                  <>
                    {" "}
                    <a href={appUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-fg underline decoration-hairline underline-offset-4">
                      open it <ExternalLink size={11} />
                    </a>
                  </>
                ) : null}
              </p>
            </li>
            <li className="rounded-2xl border border-hairline bg-card px-4 py-3">
              <span className="font-mono text-[10px] uppercase tracking-wider text-fg-muted">2 · here</span>
              <p className="mt-1">Type the room's event code, exactly as VibeTube spells it, and your name.</p>
            </li>
            <li className="rounded-2xl border border-hairline bg-card px-4 py-3">
              <span className="font-mono text-[10px] uppercase tracking-wider text-fg-muted">3 · publish</span>
              <p className="mt-1">Press publish. The app posts the clip with the poster as its thumbnail; the rows below read the result.</p>
            </li>
          </ol>
          <div className="mt-4 grid gap-3 md:grid-cols-[1.4fr_1fr_1fr]">
            <Field label="VibeStudio URL · from 7a's deploy, or a running app" value={appUrl} onChange={setAppUrl} placeholder="https://vibestudio-….run.app" />
            <Field label="event code · case-sensitive" value={code} onChange={setCode} placeholder="your room" />
            <Field label="your name on the card" value={name} onChange={setName} placeholder="Vibe Studio creator" mono={false} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button onClick={() => check(appUrl)} disabled={checking} className="flex items-center gap-2 rounded-xl border border-hairline bg-card px-4 py-2 font-mono text-xs text-fg-muted hover:text-fg disabled:opacity-50">
              <RefreshCw size={13} className={checking ? "animate-spin" : ""} /> Check the app and the room
            </button>
            <button
              onClick={publish}
              disabled={busy || publishing || !nightReady || !code.trim()}
              className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white transition-transform hover:scale-[1.03] disabled:opacity-50"
              style={{ background: GREEN }}
            >
              <Send size={15} /> {publishing ? "Publishing…" : done ? "Publish again" : "Publish to VibeTube"}
            </button>
            {night ? (
              <span className="font-mono text-[11px] text-fg-muted">
                {night.title ? `“${night.title}”` : "no night"} · clip {night.clip ? "✓" : "—"}
                {night.clip_prebaked ? " (stand-in)" : ""} · poster {night.poster ? "✓" : "—"}
                {night.poster && night.poster_prebaked ? " (stand-in: not uploaded)" : ""}
              </span>
            ) : null}
          </div>
          {note ? <p className="mt-3 font-mono text-xs text-fg-muted">{note}</p> : null}
          {pub.status && pub.status !== "done" && pub.detail ? (
            <p className="mt-2 font-mono text-xs" style={{ color: pub.status === "publishing" ? AMBER : RED }}>
              {pub.status} · {pub.detail}
            </p>
          ) : null}
          {done ? (
            <div className="mt-4 overflow-hidden rounded-2xl border border-hairline bg-card">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-4 py-2">
                <span className="font-mono text-[11px]" style={{ color: GREEN }}>
                  video {pub.video_id} · {video?.status || "listed"}
                </span>
                {pub.url ? (
                  <a href={pub.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono text-xs font-bold text-white" style={{ background: GREEN }}>
                    Watch it on VibeTube <ExternalLink size={12} />
                  </a>
                ) : null}
              </div>
              <div className="grid gap-4 p-4 md:grid-cols-2">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-fg-muted">the thumbnail on VibeTube</p>
                  {video?.thumbnail_url ? (
                    <img src={video.thumbnail_url} alt="" className="mt-2 max-h-72 rounded-xl border border-hairline bg-card object-contain" />
                  ) : (
                    <p className="mt-2 text-xs text-fg-muted">{videoProcessing ? "still processing; this page checks again every ten seconds" : "not listed yet"}</p>
                  )}
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-fg-muted">your poster, in the app</p>
                  {posterSrc ? <img src={posterSrc} alt="" className="mt-2 max-h-72 rounded-xl border border-hairline bg-card object-contain" /> : <p className="mt-2 text-xs text-fg-muted">no poster</p>}
                </div>
              </div>
            </div>
          ) : null}
        </section>
      </In>

      <In delay={0.3}>
        <VerifyPanel checking={checking} onCheck={() => check(appUrl)} title="On the wall." intro="Read from the app's /api/state and /api/profile, and from VibeTube's event and video lists.">
          <CheckRow ok={reachable} label="VibeStudio answers">
            {status ? (reachable ? status.app_url : status.app_url ? `${status.app_url} · ${status.error || "no answer"}` : "No URL: deploy on 7a, or paste the URL of a running app.") : "…"}
          </CheckRow>
          <CheckRow ok={nightReady && posterReal} label="a finished night, with a real poster" tone={nightReady && !posterReal ? "warn" : "good"}>
            {night ? (nightReady ? (posterReal ? `“${night.title}” · clip and poster on disk.` : "Clip and a stand-in poster: the thumbnail would be a frame, not your poster.") : `The app's run is ${night.status}. Run a night there first.`) : "…"}
          </CheckRow>
          <CheckRow ok={!!room && room.open} label="the event code names an open room">
            {room ? (room.open ? `${room.code} · ${room.name} · uploads open` : `${room.code} · ${room.name || "no such room"} · ${room.reason || room.state}`) : "Type an event code and check."}
          </CheckRow>
          <CheckRow ok={done} label="VibeTube returned a video id">
            {done ? `${pub.video_id} · ${pub.url}` : pub.status ? `${pub.status}${pub.detail ? ` · ${pub.detail}` : ""}` : "Press publish."}
          </CheckRow>
          <CheckRow ok={!!video && video.status === "ready"} label="the video is on the wall" tone={videoProcessing ? "warn" : "good"}>
            {video ? `${video.status} · “${video.title}” by ${video.channel}` : done ? "Not listed yet; VibeTube is processing it." : "After publish."}
          </CheckRow>
          <CheckRow ok={status?.thumbnail_match === true} label="its thumbnail is your poster">
            {status?.thumbnail_match === true ? "The same bytes on VibeTube and in the app." : status?.thumbnail_match === false ? "Different bytes: VibeTube re-encoded it, or the poster changed since." : video ? "Could not compare yet." : "After publish."}
          </CheckRow>
        </VerifyPanel>
      </In>
    </div>
  );
}
