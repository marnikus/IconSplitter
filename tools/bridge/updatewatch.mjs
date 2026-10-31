// updatewatch.mjs — the helper keeps itself current. A `git pull` under a running
// helper used to leave the old code in memory until the window was closed by
// hand; here the helper watches the bytes of its own code and exits with
// RESTART_CODE when they changed, so the launcher (`supervise.mjs`, started by
// run_ftp_bridge.bat) starts the new code in place. Every decision is a pure
// function: the server only supplies the stamp and whether a run is moving.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { computeSrcFingerprint } from "./distfresh.mjs";

/** Exit code the launcher reads as "start me again" (sysexits TEMPFAIL). */
export const RESTART_CODE = 75;

/** One hash over the helper's own files: the same bytes are the same helper. */
export function helperCodeStamp(watchDirs) {
  return computeSrcFingerprint(watchDirs.map((dir) => path.resolve(dir)));
}

/** The commit HEAD points at, short — or `null` outside a git checkout. */
export function readCommit(repoRoot) {
  const gitDir = path.join(path.resolve(repoRoot), ".git");
  if (!existsSync(gitDir)) return null;
  const head = readText(path.join(gitDir, "HEAD")).trim();
  if (head === "") return null;
  // A detached HEAD already holds the commit; a branch names a ref file.
  const sha = head.startsWith("ref: ") ? readText(path.join(gitDir, head.slice(5).trim())).trim() : head;
  return /^[0-9a-f]{7,40}$/i.test(sha) ? sha.slice(0, 7).toLowerCase() : null;
}

function readText(file) {
  try {
    return existsSync(file) ? readFileSync(file, "utf8") : "";
  } catch {
    return "";
  }
}

/**
 * A changed stamp is a new build to run — but never in the middle of an upload:
 * a restart would close the browser mid-batch and lose the run's own state.
 */
export function shouldRestart(previousStamp, currentStamp, state) {
  return previousStamp !== currentStamp && state.busy !== true;
}

/** The one line the helper window shows when it hands over to the new code. */
export function restartNote(state) {
  const where = state.commit === null ? "local changes" : `commit ${state.commit}`;
  const many = state.restarts > 0 ? ` (restart ${state.restarts})` : "";
  return `helper code changed (${where}) — restarting with the new build${many}`;
}
