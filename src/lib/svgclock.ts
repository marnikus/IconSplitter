// svgclock.ts — how long something has been running, said plainly (prompt
// 2026-10-05, D7). A generation may legitimately take an hour, so the UI must
// show a moving number: a frozen screen is what makes a healthy long request
// look like a dead one. Seconds-only until a minute has passed, then m:ss, then
// h:mm:ss; never a negative or rounded-up lie about the elapsed time.

/** 7s -> "7s", 72s -> "1:12", 3 725s -> "1:02:05". */
export function fmtElapsed(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes < 60) return `${minutes}:${pad(seconds)}`;
  return `${Math.floor(minutes / 60)}:${pad(minutes % 60)}:${pad(seconds)}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
