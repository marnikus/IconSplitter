// updategate.mjs — when the helper may update itself (2026-11-13).
// The helper used to rebuild the app and restart itself from whatever bytes were
// on disk every 10 s: a half-written edit, a `git pull` still writing files, a
// file imported before it existed. That broke builds and crash-looped helpers.
// An update now waits until the watched files are
//   1. quiet — the same stamp for a whole quiet window (no edit in progress),
//   2. not mid git operation (index.lock, merge, rebase, cherry-pick, revert),
//   3. committed — `git status` lists no uncommitted or untracked file there.
// Outside a git checkout (git cannot say), the quiet window alone decides.
// `BRIDGE_UPDATE_ON=save` keeps the old "any saved change" behaviour (still quiet-gated).

import { execFile } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import path from "node:path";

/** Files git keeps while an operation is half done: never update in between. */
const GIT_BUSY = ["index.lock", "MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "rebase-merge", "rebase-apply"];

/** Tracks one stamp: true once it has stayed the same for `quietMs`. */
export function createSettle(quietMs, now = Date.now) {
  let stamp = null;
  let since = 0;
  return {
    observe(next) {
      const t = now();
      if (next !== stamp) {
        stamp = next;
        since = t;
        return false;
      }
      return t - since >= quietMs;
    },
  };
}

/** The decision, pure: `dirty` is null when git cannot say (no checkout, no git). */
export function gateDecision({ settled, gitBusy, dirty, mode = "commit" }) {
  if (!settled) return { ready: false, reason: "settling" };
  if (gitBusy) return { ready: false, reason: "git-busy" };
  if (mode !== "save" && Array.isArray(dirty) && dirty.length > 0) return { ready: false, reason: "uncommitted", dirty };
  return { ready: true, reason: "ok" };
}

function gitOut(cwd, args) {
  return new Promise((resolve) => {
    execFile("git", args, { cwd, timeout: 15_000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      resolve(err ? null : String(stdout));
    });
  });
}

/** Where git runs for one watched path, and what it is asked about. */
function gitTarget(watched) {
  const resolved = path.resolve(watched);
  const isDir = existsSync(resolved) && statSync(resolved).isDirectory();
  return isDir ? { cwd: resolved, rel: "." } : { cwd: path.dirname(resolved), rel: path.basename(resolved) };
}

/**
 * Uncommitted (modified, staged, deleted or untracked) files under the watched
 * paths, as git names them; `[]` when everything is committed; `null` when git
 * cannot say (not a checkout, git missing).
 */
export async function uncommittedUnder(watchedPaths) {
  const out = [];
  for (const watched of watchedPaths) {
    const { cwd, rel } = gitTarget(watched);
    if (!existsSync(cwd)) continue;
    const status = await gitOut(cwd, ["status", "--porcelain", "--untracked-files=all", "--", rel]);
    if (status === null) return null;
    out.push(...status.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
  }
  return out;
}

/** True while git is half way through an operation in the checkout holding `watched`. */
export async function gitOperationInProgress(watched) {
  const { cwd } = gitTarget(watched);
  const gitDir = existsSync(cwd) ? await gitOut(cwd, ["rev-parse", "--absolute-git-dir"]) : null;
  if (gitDir === null) return false;
  const dir = gitDir.trim();
  return GIT_BUSY.some((name) => existsSync(path.join(dir, name)));
}

/** The mode from the environment: "commit" (default) or "save". */
export function updateMode(env = process.env) {
  return env.BRIDGE_UPDATE_ON === "save" ? "save" : "commit";
}

/**
 * One gate per watched set. `check(stamp)` answers `{ ready, reason }`; git is
 * only asked once the stamp is quiet, so an edit in progress costs nothing.
 */
export function createUpdateGate({ paths, quietMs, mode = updateMode(), now = Date.now }) {
  const settle = createSettle(quietMs, now);
  return {
    async check(stamp) {
      const settled = settle.observe(stamp);
      if (!settled) return gateDecision({ settled, gitBusy: false, dirty: [], mode });
      const gitBusy = paths.length > 0 && await gitOperationInProgress(paths[0]);
      const dirty = mode === "save" ? [] : await uncommittedUnder(paths);
      return gateDecision({ settled, gitBusy, dirty, mode });
    },
  };
}

/** The one line the window shows while an update waits, once per stamp and reason. */
export function waitingNote(what, decision) {
  if (decision.reason === "uncommitted") {
    const first = decision.dirty?.[0] ?? "";
    const more = (decision.dirty?.length ?? 0) > 1 ? ` (+${decision.dirty.length - 1} more)` : "";
    return `${what} changed but is not committed yet (${first}${more}) — it updates once the change is committed`;
  }
  if (decision.reason === "git-busy") return `${what} changed while a git operation is running — it updates once git is done`;
  return null;
}
