// Elapsed.tsx — the ticking elapsed time (prompt 2026-10-05, D7), shared by
// the run strip and the bulk bar so both show the SAME number for the same
// request. A generation may legitimately take an hour; a screen that does not
// move is what makes a healthy long request look dead, so this re-renders once
// a second while the request is in flight and freezes at its final value when
// it ends. The time is computed from `startedAt`, never accumulated from ticks,
// so a throttled background tab still reports the truth when it wakes up.

import { useEffect, useReducer } from "react";
import { fmtElapsed } from "../lib/svgclock";

/** Re-renders the caller once a second while `running` (a no-op otherwise). */
export function useTick(running: boolean): void {
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(tick, 1_000);
    return () => window.clearInterval(timer);
  }, [running]);
}

export default function Elapsed({ startedAt, running, testid }: {
  startedAt: number;
  running: boolean;
  testid: string;
}) {
  useTick(running);
  return (
    <span className="svg-elapsed" data-testid={testid}>
      elapsed {fmtElapsed(Date.now() - startedAt)}{running ? "" : " (ended)"}
    </span>
  );
}
