// supervise.mjs — the launcher's loop, one process above the helper. It runs
// `server.mjs` and starts it again when the helper asked for a restart (exit code
// 75: its own code changed under it) or when it crashed, with a stop so a broken
// build cannot restart forever. Everything it does not consume goes to the helper.
//
//   node tools/bridge/supervise.mjs [--child <script>] [--max-restarts <n>] [--once]
//                                   [--build] [--build-cmd <command>] [helper args]

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RESTART_CODE } from "./updatewatch.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const QUICK_MS = 60_000;

const REPO_ROOT = path.resolve(HERE, "..", "..");
const BUILD_TIMEOUT_MS = 5 * 60_000;

/** Split the loop's own flags from the helper's arguments. */
function parseArgs(argv) {
  const own = {
    child: path.join(HERE, "server.mjs"), maxRestarts: 10, once: false, delayMs: 400,
    // A restart is the whole launcher again, build included: a pull brings both
    // helper code and app code, and the page must get the new bundle.
    build: process.env.BRIDGE_REBUILD === "1", buildCmd: "npm run build", cwd: REPO_ROOT,
  };
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = argv[i + 1];
    if (arg === "--once") { own.once = true; continue; }
    if (arg === "--build") { own.build = true; continue; }
    if (arg === "--no-build") { own.build = false; continue; }
    // The command alone does not turn the step on: `--build` does (the launchers pass it).
    if (arg === "--build-cmd") { if (value !== undefined) { own.buildCmd = value; i += 1; } continue; }
    if (arg === "--build-cwd") { if (value !== undefined) { own.cwd = path.resolve(value); i += 1; } continue; }
    if ((arg === "--child" || arg === "--max-restarts") && value !== undefined) {
      if (arg === "--child") own.child = path.resolve(value);
      else own.maxRestarts = Math.max(0, Number(value) || 0);
      i += 1;
      continue;
    }
    rest.push(arg);
  }
  return { own, rest };
}

/**
 * The app bundle, rebuilt before the new helper starts — what `run_ftp_bridge.bat`
 * does on every launch. A failed build is reported and the previous bundle is
 * served: a broken pull must not leave the user with no app at all.
 */
async function rebuildApp(own) {
  const startedAt = Date.now();
  console.log(`supervisor: rebuilding the app bundle (${own.buildCmd}) …`);
  const result = await new Promise((resolve) => {
    // A command line, not an argv: quoted paths survive on both platforms.
    const build = spawn(own.buildCmd, { cwd: own.cwd, shell: true, stdio: "inherit" });
    const timer = setTimeout(() => { build.kill(); }, BUILD_TIMEOUT_MS);
    build.on("error", (err) => { clearTimeout(timer); resolve({ ok: false, reason: err.message }); });
    build.on("close", (code) => {
      clearTimeout(timer);
      resolve(code === 0 ? { ok: true } : { ok: false, reason: `the build exited ${code}` });
    });
  });
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  if (result.ok) console.log(`supervisor: app bundle rebuilt in ${seconds}s — reload the page to pick it up`);
  else console.error(`supervisor: rebuild failed (${result.reason}) — serving the previous bundle`);
  return result;
}

/** What to do after one exit: run it again, or let the window close. */
function planAfterClose(code, signal, state) {
  if (signal !== null) return { again: false, reason: "stopped" };
  if (code === RESTART_CODE) return { again: !state.once, reason: "restart" };
  if (code === 0) return { again: false, reason: "clean exit" };
  return state.crashes < state.maxRestarts ? { again: true, reason: "crash" } : { again: false, reason: "gave up" };
}

/** Why the window is closing, in one line the user can act on. */
function stoppingNote(plan, code) {
  if (plan.reason !== "gave up") return null;
  return `supervisor: the helper stopped (${code}) ${state.crashes} times — stopping after ${state.crashes} restart(s); `
    + "fix the reason above, then start this window again";
}

/** A restart loop is only a loop when it is fast and frequent: that is a bad build. */
function tooManyRestarts(window, max) {
  const now = Date.now();
  window.push(now);
  while (window.length > 0 && now - window[0] >= QUICK_MS) window.shift();
  return window.length > max;
}

const { own, rest } = parseArgs(process.argv.slice(2));
const state = { restarts: 0, crashes: 0, maxRestarts: own.maxRestarts, restartWindow: [], once: own.once };

let child = null;
let stopping = false;

/**
 * A restart is a *full* restart: the app bundle is rebuilt first (that is what the
 * launcher does on every run), then the helper starts on the new code. The first
 * start of the window is not rebuilt — `run_ftp_bridge.bat` just built it.
 */
async function startAfterRebuild() {
  if (own.build) await rebuildApp(own);
  run();
}

function run() {
  child = spawn(process.execPath, [own.child, ...rest], {
    stdio: "inherit",
    env: { ...process.env, BRIDGE_RESTARTS: String(state.restarts) },
  });
  child.on("exit", (code, signal) => {
    child = null;
    if (stopping) return;
    const plan = planAfterClose(code, signal, state);
    if (plan.reason === "restart" && tooManyRestarts(state.restartWindow, state.maxRestarts)) {
      console.error(`supervisor: ${state.restartWindow.length} restarts in under a minute — stopping so a broken build is visible`);
      process.exit(1);
    }
    const note = stoppingNote(plan, code);
    if (note !== null) console.error(note);
    if (plan.reason === "restart") state.restarts += 1;
    if (plan.reason === "crash") state.crashes += 1;
    if (!plan.again) { process.exit(code ?? 0); return; }
    console.log(plan.reason === "restart"
      ? `supervisor: starting the new helper (restart ${state.restarts})`
      : `supervisor: the helper stopped (${code}) — starting it again (try ${state.crashes + 1})`);
    setTimeout(() => { startAfterRebuild(); }, own.delayMs);
  });
}

function stop() {
  stopping = true;
  child?.kill("SIGTERM");
}

process.on("SIGINT", () => { stop(); process.exit(0); });
process.on("SIGTERM", () => { stop(); process.exit(0); });
run();
