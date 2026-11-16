// scrollmemory.ts — every tab keeps its scroll position (2026-11-06): saved on
// this device as the user scrolls the shared tab area (app-main), restored after
// a reload and whenever the tab is opened again. The rows load a moment after a
// reload, so the restore keeps trying (briefly) until the list is tall enough;
// it stops the moment the user scrolls, clicks or types. While it tries, its
// own scrolls are not saved (a short list must not overwrite the memory).

import { useEffect, useRef, type RefObject } from "react";
import { readKey, writeKey } from "../state/safestorage";

export const SCROLL_MEMORY_KEY = "iconSplitter.ui.scroll.v1";
const SAVE_MS = 200;
const RETRY_MS = 50;
const RETRY_FOR_MS = 5000;

function readAll(): Record<string, number> {
  try {
    const raw = JSON.parse(readKey(SCROLL_MEMORY_KEY) ?? "{}") as unknown;
    if (typeof raw !== "object" || raw === null) return {};
    return Object.fromEntries(Object.entries(raw).filter(([, v]) => typeof v === "number" && Number.isFinite(v) && v >= 0)) as Record<string, number>;
  } catch {
    return {};
  }
}

function saveOne(tab: string, y: number): void {
  writeKey(SCROLL_MEMORY_KEY, JSON.stringify({ ...readAll(), [tab]: Math.round(y) }));
}

/** Tries to put `el` back at `y` until it gets there, the time is up, or the user takes over. */
function restore(el: HTMLElement, y: number, done: () => void): () => void {
  const started = Date.now();
  let timer = 0;
  const stop = () => { window.clearTimeout(timer); for (const t of USER) el.removeEventListener(t, stop); done(); };
  const USER = ["wheel", "touchstart", "pointerdown", "keydown"] as const;
  for (const t of USER) el.addEventListener(t, stop, { passive: true });
  const tick = () => {
    el.scrollTop = y;
    if (Math.abs(el.scrollTop - y) <= 1 || Date.now() - started > RETRY_FOR_MS) { stop(); return; }
    timer = window.setTimeout(tick, RETRY_MS);
  };
  tick();
  return stop;
}

/** Remembers `main`'s scroll position per `tab` and restores it. */
export function useScrollMemory(main: RefObject<HTMLElement | null>, tab: string): void {
  const restoring = useRef(false);
  useEffect(() => {
    const el = main.current;
    if (el === null) return undefined;
    let timer = 0;
    const onScroll = () => {
      if (restoring.current) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => saveOne(tab, el.scrollTop), SAVE_MS);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    restoring.current = true;
    const stop = restore(el, readAll()[tab] ?? 0, () => { restoring.current = false; });
    return () => { stop(); window.clearTimeout(timer); el.removeEventListener("scroll", onScroll); };
  }, [main, tab]);
}
