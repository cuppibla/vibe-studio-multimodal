import { useEffect, useRef, useState, type ReactNode } from "react";

/** An explanation paragraph that shows its first two lines and folds the
 *  rest behind "more". Nothing is cut: the text is the page's own, and one
 *  click opens it where it was. Used wherever a page explained something in
 *  a paragraph, so the page reads headline → one line → the thing itself. */
export function Lede({ className = "", children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [over, setOver] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setOver(el.scrollHeight > el.clientHeight + 2);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);
  return (
    <div className="lede">
      <p ref={ref} className={`${className}${open ? "" : " lede-clamp"}`}>
        {children}
      </p>
      {(over || open) && (
        <button type="button" onClick={() => setOpen((o) => !o)} className="lede-more">
          {open ? "less ▴" : "more ▾"}
        </button>
      )}
    </div>
  );
}
