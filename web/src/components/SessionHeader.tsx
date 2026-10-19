import type { ReactNode } from "react";
import { In } from "./shared";
import { tint } from "../steps/colors";

export type Does = { text: ReactNode; where: "editor" | "run" | "verify" | "read" };

/** The band at the top of a session: the scene, one sentence, and the three
 *  things you do on this page. It is the first thing on screen, so the page
 *  says what it wants before it explains anything. */
export function SessionHeader({ kicker, title, one, art, color, does }: { kicker: string; title: string; one: ReactNode; art?: string; color: string; does: Does[] }) {
  return (
    <In className="mb-10 overflow-hidden rounded-[28px] border border-hairline bg-card">
      <div className="grid items-center gap-7 p-6 md:grid-cols-[1.1fr_1fr] md:p-7">
        {art && <img src={art} alt="" className="block aspect-[16/9] w-full rounded-2xl object-cover" />}
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.3em]" style={{ color }}>
            {kicker}
          </p>
          <h1 className="font-display mt-3 text-balance text-4xl leading-[1.02] tracking-tight md:text-[52px]">{title}</h1>
          <p className="mt-4 max-w-[54ch] text-balance text-[19px] leading-snug text-fg-muted">{one}</p>
          <ol className="mt-6 grid gap-2.5">
            {does.map((d, i) => (
              <li key={i} className="grid grid-cols-[40px_1fr_auto] items-center gap-3.5 rounded-2xl border border-hairline bg-input px-4 py-3 text-[18px] font-semibold">
                <span className="flex h-9 w-9 items-center justify-center rounded-full font-mono text-sm text-white" style={{ background: color }}>
                  {i + 1}
                </span>
                <span className="[&_code]:font-mono [&_code]:text-[16px]">{d.text}</span>
                <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-fg-muted" style={{ color: tint(color, 0.9) }}>
                  {d.where}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </In>
  );
}
