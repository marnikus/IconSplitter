// useAutoScroll.ts — the follow/pause behaviour of the log list (feature §2).
// The reader owns the scroll position: while they are at the bottom the list
// follows the tail, the moment they scroll up it stops, and it resumes only
// when they come back to the bottom. `follow` is returned so the header can
// say which of the two states is active (RULE 24 — visible, not guessed).

import { useCallback, useEffect, useRef, useState } from "react";
import { isAtBottom, type ScrollMetrics } from "./scroll";

export interface AutoScroll {
  /** True while new entries scroll into view. */
  follow: boolean;
  /** Attach to the scrolling element. */
  attach: (el: HTMLDivElement | null) => void;
}

export function useAutoScroll(count: number): AutoScroll {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const follow = useRef(true);
  const [following, setFollowing] = useState(true);

  useEffect(() => {
    if (el === null) return;
    const onScroll = () => {
      follow.current = isAtBottom(metricsOf(el));
      setFollowing(follow.current);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener("scroll", onScroll);
  }, [el]);

  useEffect(() => {
    if (el !== null && follow.current) el.scrollTop = el.scrollHeight;
  }, [el, count]);

  const attach = useCallback((node: HTMLDivElement | null) => setEl(node), []);
  return { follow: following, attach };
}

function metricsOf(el: HTMLElement): ScrollMetrics {
  return { scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight };
}
