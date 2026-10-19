import type { ReactNode } from "react";

/** Everything that used to be a paragraph: a one-line title, closed by
 *  default. The page reads headline → figure → action; the explanation is a
 *  click away, where it was before. */
export function Fold({ title, kicker, open = false, children }: { title: ReactNode; kicker?: string; open?: boolean; children: ReactNode }) {
  return (
    <details open={open} className="group rounded-3xl border border-hairline bg-card px-6">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 [&::-webkit-details-marker]:hidden">
        <span className="font-display text-[22px] leading-tight">{title}</span>
        <span className="flex shrink-0 items-center gap-3 font-mono text-[11px] uppercase tracking-[0.2em] text-fg-muted">
          {kicker}
          <span className="inline-block transition-transform group-open:rotate-90">▶</span>
        </span>
      </summary>
      <div className="pb-6 text-[16.5px] leading-relaxed text-fg-muted [&_b]:text-fg [&_code]:font-mono [&_code]:text-fg">{children}</div>
    </details>
  );
}
