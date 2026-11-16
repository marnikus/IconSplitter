// Resource-bounded verification: native alarms alone, then one static queue
// alongside one complete coverage run. Serial fallback retains canonical order.
import { spawn, spawnSync } from "node:child_process";
import { availableParallelism, totalmem } from "node:os";

export function canOverlapVerification(cpus = availableParallelism(), memoryBytes = Math.min(totalmem(), process.constrainedMemory?.() || totalmem())) {
  return cpus >= 2 && memoryBytes >= 3 * 1024 ** 3;
}

function terminateTree(child) {
  if (!child.pid || child.exitCode !== null) return;
  try {
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
    else process.kill(-child.pid, "SIGKILL");
  } catch { /* The child may already have exited. */ }
}

function runLane(lane, root, signal) {
  if (signal?.aborted) return Promise.resolve(false);
  console.log(`\n=== ${lane.name} (${lane.cmd} ${lane.args.join(" ")}) ===`);
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(lane.cmd, lane.args, { cwd: root, stdio: "inherit", shell: process.platform === "win32",
      detached: process.platform !== "win32", env: { ...process.env, ...lane.env } });
    const cancel = () => terminateTree(child);
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) cancel();
    child.once("error", error => console.error(`${lane.name}: ${error.message}`));
    child.once("close", code => {
      signal?.removeEventListener("abort", cancel);
      const passed = code === 0 && !signal?.aborted;
      console.log(`=== ${lane.name}: ${passed ? "PASS" : "FAIL"} (${((Date.now() - started) / 1000).toFixed(1)}s) ===`);
      resolve(passed);
    });
  });
}

export async function runVerification(lanes, root, overlap, signal) {
  if (lanes.some(lane => !["native", "static", "suite"].includes(lane.executionGroup))) {
    throw new Error("Unknown verification execution group; refusing to omit a lane.");
  }
  let failed = 0;
  const queue = async (selected) => {
    for (const lane of selected) if (!await runLane(lane, root, signal)) failed++;
  };
  if (!overlap) await queue(lanes);
  else {
    await queue(lanes.filter(lane => lane.executionGroup === "native"));
    await Promise.all([
      queue(lanes.filter(lane => lane.executionGroup === "static")),
      queue(lanes.filter(lane => lane.executionGroup === "suite")),
    ]);
  }
  return failed;
}
