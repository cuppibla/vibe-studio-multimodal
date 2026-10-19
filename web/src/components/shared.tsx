import { motion } from "framer-motion";
import type { ReactNode } from "react";

/** Fade-and-rise a block in on mount. */
export function In({
  delay = 0,
  y = 18,
  className = "",
  children,
}: {
  delay?: number;
  y?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

/** Small uppercase label above a heading. */
export function Kicker({ children, color = "var(--color-vibe-cyan)" }: { children: ReactNode; color?: string }) {
  return (
    <p className="font-mono text-[11px] uppercase tracking-[0.35em]" style={{ color }}>
      {children}
    </p>
  );
}

/** Standard page header used by every step. With `art`, a picture sits
 *  beside the title (the haunted hero on the first page, a poster later). */
export function StepHeader({
  kicker,
  title,
  blurb,
  color,
  art,
}: {
  kicker: string;
  title: string;
  blurb?: ReactNode;
  color?: string;
  art?: ReactNode;
}) {
  if (art) {
    return (
      <In className="mx-auto grid max-w-5xl items-center gap-8 md:grid-cols-[1.15fr_1fr]">
        <div>
          <Kicker color={color}>{kicker}</Kicker>
          <h1 className="font-display text-balance mt-3 text-3xl leading-tight md:text-5xl">{title}</h1>
          {blurb && <p className="mt-4 max-w-2xl text-balance text-base text-fg-muted md:text-lg">{blurb}</p>}
        </div>
        <div className="haunted-art">{art}</div>
      </In>
    );
  }
  return (
    <In className="mx-auto max-w-3xl text-center">
      <Kicker color={color}>{kicker}</Kicker>
      <h1 className="font-display text-balance mt-3 text-3xl leading-tight md:text-5xl">{title}</h1>
      {blurb && <p className="mx-auto mt-4 max-w-2xl text-balance text-base text-fg-muted md:text-lg">{blurb}</p>}
    </In>
  );
}

/** A section's heading inside a page: the same kicker and title as a page
 *  header, left-aligned and one size down, for a part that shares a page. */
export function SectionHead({ kicker, title, blurb, color }: { kicker: string; title: string; blurb?: ReactNode; color?: string }) {
  return (
    <In>
      <Kicker color={color}>{kicker}</Kicker>
      <h2 className="font-display text-balance mt-2 text-2xl md:text-3xl">{title}</h2>
      {blurb && <p className="mt-3 max-w-3xl text-sm text-fg-muted md:text-base">{blurb}</p>}
    </In>
  );
}

/** Placeholder for a step that is not built yet. */
export function StubScene({ kicker, title, blurb }: { kicker: string; title: string; blurb: string }) {
  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <StepHeader kicker={kicker} title={title} blurb={blurb} />
      <In delay={0.25} className="mt-10">
        <div className="inline-flex items-center gap-2 rounded-full border border-hairline bg-card px-5 py-2 font-mono text-xs text-fg-muted">
          <span className="h-2 w-2 rounded-full bg-vibe-amber" />
          This step is being built
        </div>
      </In>
    </div>
  );
}
