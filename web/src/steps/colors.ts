/** Step accent palette. CSS variables, so the light theme can use darker
 *  shades (see index.css). Use tint(color, alpha) for translucent fills. */
export const COLORS = {
  cyan: "var(--vibe-cyan)",
  purple: "var(--vibe-purple)",
  blue: "var(--vibe-blue)",
  amber: "var(--vibe-amber)",
  green: "var(--vibe-green)",
  red: "var(--vibe-red)",
};

/** A translucent version of an accent (or of currentColor). */
export function tint(color: string, alpha: number): string {
  return `color-mix(in srgb, ${color} ${Math.round(alpha * 100)}%, transparent)`;
}
