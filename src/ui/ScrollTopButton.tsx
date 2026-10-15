// ScrollTopButton.tsx — the shell's corner "back to top" control: one instance
// next to the scrolling tab area (app-main), so it exists on every tab. Hidden
// while the list is at the top; a click returns it there (feature §scroll-top).

import { useCallback, useEffect, useState } from "react";

/** Scroll position (px) past which the button shows. */
const SHOW_AFTER_PX = 80;

/** Watches `target`'s scroll offset and returns whether the list has left the top. */
function usePastTop(target: React.RefObject<HTMLElement | null>): [boolean, () => void] {
  const [past, setPast] = useState(false);

  useEffect(() => {
    const el = target.current;
    if (!el) return;
    const onScroll = () => setPast(el.scrollTop > SHOW_AFTER_PX);
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [target]);

  const toTop = useCallback(() => {
    const el = target.current;
    if (!el) return;
    if (typeof el.scrollTo === "function") el.scrollTo({ top: 0, behavior: "smooth" });
    else el.scrollTop = 0;
    setPast(false); // the scroll listener refines this as smooth scrolling fires `scroll`
  }, [target]);

  return [past, toTop];
}

export default function ScrollTopButton({ target }: { target: React.RefObject<HTMLElement | null> }): React.ReactNode {
  const [past, toTop] = usePastTop(target);
  return (
    <button
      type="button"
      data-testid="scroll-top-btn"
      onClick={toTop}
      hidden={!past}
      aria-label="Back to top"
      title="Back to top"
      className="toast-above-dock fixed right-4 z-40 rounded-full border border-white/15 bg-slate-800/90 px-3 py-2 text-lg leading-none text-slate-100 shadow-lg hover:bg-slate-700/90"
    >
      ↑
    </button>
  );
}
