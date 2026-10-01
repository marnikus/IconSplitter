// useTick.ts — a slow clock for relative times ("Last rescan: 24 seconds ago").
// One interval per consumer keeps the status bar honest without re-rendering
// the whole tree on a timer.

import { useEffect, useState } from "react";

export function useTick(everyMs = 5000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}
