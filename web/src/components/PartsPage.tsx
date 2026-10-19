import { useEffect, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowRight } from "lucide-react";

export interface PagePart {
  id: string;
  label: string;
  element: ReactNode;
}

/** A step with parts, each at /step/<slug>/<id>. Renders the current part
 *  and a previous/next pair under it; the chips in the top bar come from
 *  the registry, which lists the same parts. */
export function PartsPage({ slug, n, color, parts }: { slug: string; n: number; color: string; parts: PagePart[] }) {
  const { part } = useParams();
  const idx = Math.max(0, parts.findIndex((p) => p.id === part));
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [idx]);
  const prev = parts[idx - 1];
  const next = parts[idx + 1];
  return (
    <div className="space-y-12">
      {parts[idx].element}
      <div className="flex items-center justify-between border-t border-hairline pt-6">
        {prev ? (
          <Link to={`/step/${slug}/${prev.id}`} className="rounded-full border border-hairline px-4 py-2 text-xs font-semibold text-fg-muted hover:text-fg">
            ← {n}{prev.id} · {prev.label}
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link to={`/step/${slug}/${next.id}`} className="flex items-center gap-2 rounded-full px-5 py-2 text-xs font-bold text-white" style={{ background: color }}>
            Continue to {n}{next.id} · {next.label} <ArrowRight size={14} />
          </Link>
        )}
      </div>
    </div>
  );
}
