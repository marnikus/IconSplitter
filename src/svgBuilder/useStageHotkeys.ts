// useStageHotkeys.ts — the arrow keys walk the stage (2026-11-23): ← / → open
// the previous / next template, ↑ / ↓ the previous / next artboard of the
// template being worked on (stagenav.ts). Only while the builder tab is shown,
// and never while typing (fields, sliders), with a modifier held, in a dialog or
// the icon editor, when a focused list or the text-move frame already used the
// key, or when there is nothing to open — then the page scrolls as usual.
import { useEffect, useRef } from "react";
import { steppedArtboard, steppedTemplate, type Step } from "./stagenav";
import type { BuilderApi } from "./useSvgBuilder";

const KEYS: Readonly<Record<string, { axis: "template" | "artboard"; by: Step }>> = {
  ArrowLeft: { axis: "template", by: -1 }, ArrowRight: { axis: "template", by: 1 },
  ArrowUp: { axis: "artboard", by: -1 }, ArrowDown: { axis: "artboard", by: 1 },
};

const typing = (target: EventTarget | null) => target instanceof Element && target.closest("input, textarea, select, [contenteditable]") !== null;

/** Keys that belong to someone else: a field, a modifier, an open dialog or the icon editor, a list that used it. */
function notOurs(e: KeyboardEvent, b: BuilderApi): boolean {
  return e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || typing(e.target) || b.dialog !== "none" || b.editingIconId !== null;
}

export function useStageHotkeys(b: BuilderApi, active: boolean): void {
  const live = useRef(b);
  live.current = b;
  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e: KeyboardEvent) => {
      const key = KEYS[e.key];
      const now = live.current;
      if (key === undefined || notOurs(e, now)) return;
      const target = key.axis === "template" ? steppedTemplate(now, key.by) : steppedArtboard(now, key.by);
      if (target === null) return;
      e.preventDefault();
      if (key.axis === "template") now.actions.stepTemplate(key.by);
      else now.actions.stepArtboard(key.by);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active]);
}
