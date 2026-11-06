/** Exit code the launcher reads as "start me again" (sysexits TEMPFAIL). */
export const RESTART_CODE: 75;

/** One hash over the helper's own files: the same bytes are the same helper. */
export function helperCodeStamp(watchDirs: readonly string[]): string;

/** The commit HEAD points at, short — or `null` outside a git checkout. */
export function readCommit(repoRoot: string): string | null;

/** A changed stamp is a new build to run — but never while an upload is moving. */
export function shouldRestart(
  previousStamp: string,
  currentStamp: string,
  state: { busy: boolean },
): boolean;

/** The one line the helper window shows when it hands over to the new code. */
export function restartNote(state: { commit: string | null; restarts: number }): string;
