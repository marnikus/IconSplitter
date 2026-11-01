// supervise.mjs — the launcher's loop, one process above the helper. It runs
// `server.mjs` and starts it again when the helper asked for a restart (exit code
// 75: its own code changed under it) or when it crashed, with a stop so a broken
// build cannot restart forever. Everything it does not consume goes to the helper.
//
//   node tools/bridge/supervise.mjs [--child <script>] [--max-restarts <n>] [--once] [helper args]

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RESTART_CODE } from "./updatewatch.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const QUICK_MS = 60_000;

/** Split the loop's own flags from the helper's arguments. */
function parseArgs(argv) {
  const own = { child: path.join(HERE, "server.mjs"), maxRestarts: 10, once: false, delayMs: 400 };
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--once") { own.once = true; continue; }
    if ((arg === "--child" || arg === "--max-restarts") && argv[i + 1] !== undefined) {
      if (arg === "--child") own.child = path.resolve(argv[i + 1]);
      else own.maxRestarts = Math.max(0, Number(argv[i + 1]) || 0);
      i += 1;
      continue;
    }
    rest.push(arg);
  }
  return { own, rest };
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
    setTimeout(run, own.delayMs);
  });
}

function stop() {
  stopping = true;
  child?.kill("SIGTERM");
}

process.on("SIGINT", () => { stop(); process.exit(0); });
process.on("SIGTERM", () => { stop(); process.exit(0); });
run();
