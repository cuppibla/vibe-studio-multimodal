import { useCallback, useEffect, useState } from "react";
import { Check, FastForward, RefreshCw, Undo2 } from "lucide-react";
import { api } from "../lib/api";
import { STEPS } from "../steps/registry";
import { tint } from "../steps/colors";

/** At the top of every page: the edits every earlier page asked for, and one
 *  button that writes the answers into the files and hands them to adk web.
 *  The pages are the registry's order; the holes and their pages come from
 *  the registry on the server, so nothing here has to be kept in step.
 *
 *  It also watches THIS page's own edits: the nine hands-on files are not in
 *  git and never overwritten by a pull or a start, so a student can arrive
 *  and find the answer already in the file (the button below on a later
 *  page, scripts/rescue.py, a file left from an earlier run). When that
 *  happens the bar says so and offers to put the TODO line back, so the
 *  edit can be made by hand. */
type Plan = { name: string; page: string; label: string; state: string };

function pageIndex(page: string): number {
  const [slug, part] = page.split("/");
  let i = 0;
  for (const s of STEPS) {
    const parts = s.parts?.map((p) => p.id) ?? [""];
    for (const p of parts) {
      // a step opened at its slug alone is on its first part
      if (s.slug === slug && (!part || p === part)) return i;
      i++;
    }
  }
  return -1;
}

export function CatchUp({ page, color }: { page: string; color: string }) {
  const [plan, setPlan] = useState<Plan[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [filled, setFilled] = useState<string[] | null>(null);
  const [carved, setCarved] = useState<string[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setPlan(await api.holesPlan());
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    setFilled(null);
    setCarved(null);
    load();
  }, [load, page]);

  const here = pageIndex(page);
  const earlier = (plan ?? []).filter((h) => pageIndex(h.page) < here).sort((a, b) => pageIndex(a.page) - pageIndex(b.page));
  const open = earlier.filter((h) => h.state === "open");
  // this page's own edits, found already done before the student touched them
  const doneHere = (plan ?? []).filter((h) => pageIndex(h.page) === here && h.state === "filled" && !carved?.includes(h.name));
  if (here < 0 || (earlier.length === 0 && doneHere.length === 0)) return null;

  const fill = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await api.fillHoles(open.map((h) => h.name));
      setFilled(r.filled);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const carve = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await api.carveHoles(doneHere.map((h) => h.name));
      setCarved(r.carved);
      await load();
      window.dispatchEvent(new Event("vibe:sync"));   // the editors on the page re-read their files
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const tone = open.length > 0 ? color : "var(--vibe-green)";
  return (
    <section className="mb-8 rounded-2xl border px-5 py-4" style={{ borderColor: tint(tone, 0.4), background: tint(tone, 0.05) }}>
      {earlier.length > 0 && (
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <p className="font-mono text-[11px] uppercase tracking-[0.3em]" style={{ color: tone }}>
              Earlier steps
            </p>
            {open.length > 0 ? (
              <>
                <p className="mt-1 text-sm text-fg">
                  {open.length} of the {earlier.length} edits from earlier steps {open.length === 1 ? "is" : "are"} still open. One click writes the answers into the files and adk web picks them up.
                </p>
                <ul className="mt-2 grid gap-x-6 gap-y-0.5 font-mono text-[11px] text-fg-muted md:grid-cols-2">
                  {open.map((h) => (
                    <li key={h.name}>
                      {h.page} · {h.label}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="mt-1 text-sm text-fg-muted">
                {filled ? `Filled ${filled.length} edit${filled.length === 1 ? "" : "s"}; adk web has them. ` : ""}
                All {earlier.length} edits from earlier steps are in place.
              </p>
            )}
          </div>
          {open.length > 0 ? (
            <button onClick={fill} disabled={busy} className="flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60" style={{ background: color }}>
              {busy ? <RefreshCw size={15} className="animate-spin" /> : <FastForward size={15} />}
              Fill in every earlier step
            </button>
          ) : (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: tint(tone, 0.2), color: tone }}>
              <Check size={16} />
            </span>
          )}
        </div>
      )}
      {doneHere.length > 0 && (
        <div className={`flex flex-col gap-3 md:flex-row md:items-center md:justify-between ${earlier.length > 0 ? "mt-4 border-t border-hairline pt-4" : ""}`}>
          <div className="min-w-0">
            <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-fg-muted">This step</p>
            <p className="mt-1 text-sm text-fg-muted">
              {doneHere.length === 1 ? "This step's edit is" : `${doneHere.length} of this step's edits are`} already in the file: {doneHere.map((h) => h.label).join(", ")}. The files you edit
              are yours, not git's: a pull or a restart never resets them, so this came from an earlier run, the hint button's "Write the answer", the catch-up button on a later
              page, or scripts/rescue.py. To make the edit yourself, put the TODO back.
            </p>
          </div>
          <button onClick={carve} disabled={busy} className="flex shrink-0 items-center gap-2 rounded-xl border border-hairline bg-card px-4 py-2.5 text-sm font-semibold text-fg disabled:opacity-60 hover:border-fg-muted">
            {busy ? <RefreshCw size={15} className="animate-spin" /> : <Undo2 size={15} />}
            Put the TODO back
          </button>
        </div>
      )}
      {carved && carved.length > 0 && doneHere.length === 0 && (
        <p className={`text-sm text-fg-muted ${earlier.length > 0 ? "mt-4 border-t border-hairline pt-4" : ""}`}>
          The TODO line is back in the file; adk web runs the shipped version again. Make the edit above.
        </p>
      )}
      {error && <p className="mt-1 font-mono text-[11px]" style={{ color: "var(--vibe-red)" }}>{error}</p>}
    </section>
  );
}
