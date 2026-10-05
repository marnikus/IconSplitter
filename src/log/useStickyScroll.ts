// useStickyScroll.ts — the DOM glue of the follow-scroll machine (log-panel.md
// §4). The rules are lib/logscroll's pure functions; this hook only reads
// geometry, listens for the user's intent, remembers where the user was, and
// pins the view to the bottom when the machine says so. It lives in the dock —
// which never unmounts — so the count survives minimising even though the list
// itself is gone. The scroll container is attached with a callback ref.

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { LogEntry } from "../lib/logentry";
import {
  FOLLOWING, appendedSince, onAppend, onIntentUp, onJump, onRestore, onUserScroll, type Follow, type Geometry, type Move,
} from "../lib/logscroll";

export interface Sticky {
  follow: Follow;
  /** The ref callback for the scroll container. */
  bind: (el: HTMLDivElement | null) => void;
  /** "Jump to latest". */
  jump: () => void;
}

interface Live {
  follow: Follow;
  el: HTMLDivElement | null;
  /** Where the user was, kept so a paused place can be re-applied after minimising. */
  top: number;
  lastId: string | null;
  started: boolean;
}

/** What every part of the glue shares: the live values and the one way to change the view. */
interface Ctl {
  live: { current: Live };
  apply: (move: Move) => void;
}

const geometry = (el: HTMLElement): Geometry => ({ top: el.scrollTop, height: el.scrollHeight, client: el.clientHeight });
const same = (a: Follow, b: Follow): boolean => a.following === b.following && a.unseen === b.unseen && a.unseenErrors === b.unseenErrors;
/** The keys that mean "I am going back up". */
const UP_KEYS = new Set(["PageUp", "ArrowUp", "Home"]);

export function useStickyScroll(entries: readonly LogEntry[], visible: boolean): Sticky {
  const [follow, setFollow] = useState<Follow>(FOLLOWING);
  const live = useRef<Live>({ follow: FOLLOWING, el: null, top: 0, lastId: null, started: false });
  const commit = useCallback((next: Follow, pin: boolean) => {
    const s = live.current;
    if (!same(s.follow, next)) {
      s.follow = next;
      setFollow(next);
    }
    if (pin && s.el !== null) s.el.scrollTop = s.el.scrollHeight;
  }, []);
  const apply = useCallback((move: Move) => commit(move.follow, move.pin), [commit]);
  const ctl = useMemo<Ctl>(() => ({ live, apply }), [apply]);
  const bind = useBind(ctl);
  useAppended(ctl, entries, visible);
  useRestored(ctl, visible);
  return { follow, bind, jump: useCallback(() => apply(onJump()), [apply]) };
}

function useBind(ctl: Ctl) {
  return useCallback((el: HTMLDivElement | null) => {
    ctl.live.current.el = el;
    return el === null ? undefined : listen(el, ctl);
  }, [ctl]);
}

/** Listens on the container for what the user does; a scroll position is the only decision. Returns the way to stop. */
function listen(el: HTMLDivElement, { live, apply }: Ctl): () => void {
  const intentUp = () => apply({ follow: onIntentUp(live.current.follow), pin: false });
  const onScroll = () => {
    live.current.top = el.scrollTop;
    apply({ follow: onUserScroll(live.current.follow, geometry(el)), pin: false });
  };
  const onWheel = (e: WheelEvent) => { if (e.deltaY < 0) intentUp(); };
  const onKey = (e: KeyboardEvent) => {
    if (UP_KEYS.has(e.key)) intentUp();
    if (e.key === "End") apply(onJump());
  };
  el.addEventListener("scroll", onScroll);
  el.addEventListener("wheel", onWheel, { passive: true });
  el.addEventListener("keydown", onKey);
  return () => {
    el.removeEventListener("scroll", onScroll);
    el.removeEventListener("wheel", onWheel);
    el.removeEventListener("keydown", onKey);
    if (live.current.el === el) live.current.el = null;
  };
}

/**
 * What the view does about the entries since it last looked: start at the bottom
 * on the first render (nothing is "unseen" in a restored log), pin or count new
 * entries, and start over when the log was cleared. Null = nothing to do.
 */
function nextMove(s: Live, entries: readonly LogEntry[], visible: boolean): Move | null {
  const newest = entries[entries.length - 1]?.id ?? null;
  if (!s.started) {
    s.started = true;
    s.lastId = newest;
    return { follow: s.follow, pin: visible };
  }
  if (newest === s.lastId) return null;
  const { added, replaced } = appendedSince(entries, s.lastId);
  s.lastId = newest;
  const move = replaced ? onJump() : onAppend(s.follow, added.map((e) => e.level), visible);
  return { follow: move.follow, pin: move.pin && visible };
}

function useAppended({ live, apply }: Ctl, entries: readonly LogEntry[], visible: boolean): void {
  useLayoutEffect(() => {
    const move = nextMove(live.current, entries, visible);
    if (move !== null) apply(move);
  }, [entries, visible, live, apply]);
}

/** Restoring the dock: following pins; paused keeps its place. */
function useRestored({ live, apply }: Ctl, visible: boolean): void {
  const was = useRef(visible);
  useLayoutEffect(() => {
    if (visible && !was.current) {
      const move = onRestore(live.current.follow);
      apply(move);
      const el = live.current.el;
      if (!move.pin && el !== null) el.scrollTop = Math.min(live.current.top, Math.max(0, el.scrollHeight - el.clientHeight));
    }
    was.current = visible;
  }, [visible, live, apply]);
}
