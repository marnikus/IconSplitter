// useBarStack.ts — a bar's seat in the one-bar-on-top stack (lib/barstack).
// Registers while mounted (a new run id is a new, newest bar), keeps its title
// and percent current, and says whether this bar is the one to show.
import { useId, useLayoutEffect, useSyncExternalStore } from "react";
import { barStack, type BarEntry } from "../lib/barstack";

export interface BarSeat {
  /** False while another bar is on top: the bar renders hidden, not removed. */
  isMain: boolean;
  /** The other bars, oldest first. */
  others: readonly BarEntry[];
  goPrev: () => void;
  goNext: () => void;
}

export function useBarStack(title: string, percent: number | null, runId?: string): BarSeat {
  const key = useId();
  const view = useSyncExternalStore(barStack.subscribe, barStack.view);
  useLayoutEffect(() => {
    barStack.add(key);
    return () => barStack.remove(key);
  }, [key, runId]);
  useLayoutEffect(() => { barStack.update(key, title, percent); }, [key, runId, title, percent]);
  return {
    isMain: view.main === null || view.main === key,
    others: view.list.filter((e) => e.key !== key),
    goPrev: () => barStack.select(barStack.step(key, -1)),
    goNext: () => barStack.select(barStack.step(key, 1)),
  };
}
