// useListScroll.ts — restores and records a scrollable list position
// (request §1 "active list and scroll position where practical"). The value is
// memoised and debounced in `scrollmemo.ts`; this hook only binds a DOM node.

import { useCallback, useRef } from "react";
import { getListScroll, setListScroll } from "./scrollmemo";

export interface ListScroll {
  ref: (el: HTMLElement | null) => void;
  onScroll: (e: React.UIEvent<HTMLElement>) => void;
}

export function useListScroll(surface: string): ListScroll {
  const restored = useRef(false);
  const ref = useCallback((el: HTMLElement | null) => {
    if (!el || restored.current) return;
    const top = getListScroll(surface);
    if (top > 0) {
      el.scrollTop = top;
      restored.current = true;
    }
  }, [surface]);
  const onScroll = useCallback((e: React.UIEvent<HTMLElement>) => {
    setListScroll(surface, e.currentTarget.scrollTop);
  }, [surface]);
  return { ref, onScroll };
}
