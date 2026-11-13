// autoupdate.mjs — the helper's two update watchers (2026-11-13), out of server.mjs.
//
// * Helper code (tools/bridge): once the change is committed and quiet
//   (updategate.mjs), the NEW code must load in a self-test child process
//   before this helper hands over (exit RESTART_CODE → supervise.mjs). Code that
//   does not load is reported once and this helper keeps serving — a broken
//   commit can no longer crash-loop the window.
// * App code (src/, index.html): once committed and quiet, the bundle is built
//   in a staging folder and swapped into dist/ only when complete (appbuild.mjs);
//   the open page's /health poll sees the new stamp and reloads itself.
//
// Never during an upload, never during a build; a failure is retried when the
// code changes again or after a back-off, so a passing hiccup heals by itself.

import { spawn } from "node:child_process";
import path from "node:path";
import { appBuildRunning, buildAppStaged } from "./appbuild.mjs";
import { computeSrcFingerprint, isDistStale } from "./distfresh.mjs";
import { createUpdateGate, waitingNote } from "./updategate.mjs";
import { RESTART_CODE, helperCodeStamp, readCommit, restartNote } from "./updatewatch.mjs";

const SELF_TEST_TIMEOUT_MS = 30_000;
/** A failure is tried again after this long even when nothing changed (a passing lock, a sync). */
export const RETRY_BACKOFF_MS = 2 * 60_000;

/** Runs the new helper code in a child: it must load all its modules and exit 0. */
export function selfTestHelper(script, timeoutMs = SELF_TEST_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, "--self-test"], {
      stdio: ["ignore", "ignore", "pipe"], windowsHide: true,
      env: { ...process.env, BRIDGE_SELF_TEST: "1" },
    });
    let stderr = "";
    child.stderr.on("data", (c) => { stderr = (stderr + c.toString("utf8")).slice(-4_000); });
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("error", (err) => { clearTimeout(timer); resolve({ ok: false, reason: err.message }); });
    child.on("close", (code) => {
      clearTimeout(timer);
      const first = stderr.split(/\r?\n/).map((l) => l.trim()).find((l) => /error/i.test(l)) ?? stderr.trim().split(/\r?\n/)[0] ?? "";
      resolve(code === 0 ? { ok: true } : { ok: false, reason: first || `it exited ${code}` });
    });
  });
}

/** Remembers a failure for one stamp; asks again when the stamp moves or the back-off ends. */
function createFailureMemo(now = Date.now) {
  let failed = null;
  return {
    blocks(stamp) { return failed !== null && failed.stamp === stamp && now() - failed.at < RETRY_BACKOFF_MS; },
    fail(stamp) { failed = { stamp, at: now() }; },
    clear() { failed = null; },
  };
}

/** Says a waiting reason once per stamp, so the window is not flooded every tick. */
function createNoteOnce(log) {
  let said = "";
  return (stamp, line) => {
    if (line === null || said === `${stamp}\0${line}`) return;
    said = `${stamp}\0${line}`;
    log(line);
  };
}

/**
 * Helper code watcher. `ctx`: { config, repoRoot, busy(), release(), exit(code), log, error }.
 */
export function watchOwnCode(ctx) {
  const { config } = ctx;
  if (!config.updateWatch) return null;
  const started = helperCodeStamp(config.watchDirs);
  const gate = createUpdateGate({ paths: config.watchDirs, quietMs: config.updateQuietMs });
  const memo = createFailureMemo();
  const note = createNoteOnce(ctx.log);
  let checking = false;
  const tick = async () => {
    if (checking) return;
    checking = true;
    try { await checkOwnCode(); } catch (err) { ctx.error(`helper update check failed: ${err.message}`); } finally { checking = false; }
  };
  const checkOwnCode = async () => {
    const current = helperCodeStamp(config.watchDirs);
    if (current === started || memo.blocks(current)) return;
    const decision = await gate.check(current);
    if (!decision.ready) { note(current, waitingNote("helper code", decision)); return; }
    if (ctx.busy() || appBuildRunning()) { note(current, "helper code changed — restarting when this run finishes"); return; }
    const test = await selfTestHelper(config.selfTestScript);
    if (!test.ok) {
      memo.fail(current);
      ctx.error(`new helper code does not load (${test.reason}) — keeping this helper running; fix and commit, it retries by itself`);
      return;
    }
    if (ctx.busy() || appBuildRunning()) return; // an upload started during the self-test
    clearInterval(timer);
    ctx.log(restartNote({ commit: readCommit(ctx.repoRoot), restarts: config.restarts + 1 }));
    ctx.log("the new code passed its self-test — the launcher starts it with this window's flags");
    const released = ctx.release();
    if (released > 0) ctx.log(`closed ${released} idle Getty browser session(s) before the restart`);
    setTimeout(() => ctx.exit(RESTART_CODE), 50);
  };
  const timer = setInterval(() => { void tick(); }, config.updateCheckMs);
  timer.unref();
  return timer;
}

/**
 * App code watcher. `ctx`: { config, repoRoot, log, error }. Starts with an
 * immediate check: a stale bundle at boot is rebuilt without waiting a tick.
 */
export function watchAppSources(ctx) {
  const { config } = ctx;
  if (!config.updateWatch || !config.appWatch || config.appDirs.length === 0) return null;
  const distIndex = path.join(config.dist, "index.html");
  const gate = createUpdateGate({ paths: config.appDirs, quietMs: config.updateQuietMs });
  const memo = createFailureMemo();
  const note = createNoteOnce(ctx.log);
  let checking = false;
  const checkApp = async () => {
    const current = computeSrcFingerprint(config.appDirs);
    if (memo.blocks(current) || !isDistStale(distIndex, config.appDirs)) return;
    const decision = await gate.check(current);
    if (!decision.ready) { note(current, waitingNote("app code", decision)); return; }
    ctx.log(`app source changed (${readCommit(ctx.repoRoot) ?? "local changes"}) — rebuilding the bundle so the open page picks it up`);
    const startedAt = Date.now();
    const built = await buildAppStaged({ cmd: config.buildCmd, cwd: config.buildCwd, dist: config.dist, appDirs: config.appDirs });
    const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    if (built.ok) { memo.clear(); ctx.log(`app bundle rebuilt in ${seconds}s — the open page reloads itself onto it`); return; }
    if (!built.retry) memo.fail(current);
    ctx.error(`App rebuild failed (${built.reason}) — serving the previous bundle; it retries by itself`);
  };
  const tick = async () => {
    if (checking) return;
    checking = true;
    try { await checkApp(); } catch (err) { ctx.error(`app update check failed: ${err.message}`); } finally { checking = false; }
  };
  const timer = setInterval(() => { void tick(); }, config.updateCheckMs);
  timer.unref();
  void tick();
  return timer;
}
