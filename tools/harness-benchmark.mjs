#!/usr/bin/env node
// Record real command wall time; compare only successful, same-machine evidence.
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { availableParallelism, cpus, hostname, release, totalmem } from "node:os";
import { dirname } from "node:path";
import { performance } from "node:perf_hooks";

function environment() {
  return { node: process.version, platform: process.platform, arch: process.arch, cpus: availableParallelism(),
    cpuModel: cpus()[0]?.model ?? "unknown", memoryBytes: totalmem(), kernel: release(), host: hostname() };
}

function record(args) {
  const separator = args.indexOf("--");
  const output = args[args.indexOf("--output") + 1];
  if (!args.includes("--output") || separator < 0 || separator === args.length - 1) {
    throw new Error("Use --output report.json [--label name] -- command arguments");
  }
  const command = args.slice(separator + 1);
  const started = performance.now();
  const run = spawnSync(command[0], command.slice(1), { stdio: "inherit", shell: process.platform === "win32" && /^(npm|npx)(\.cmd)?$|\.(cmd|bat)$/i.test(command[0]) });
  const report = {
    schema: 1, label: args.includes("--label") ? args[args.indexOf("--label") + 1] : "measurement",
    command, environment: environment(), seconds: (performance.now() - started) / 1000,
    exitCode: run.status ?? 1, signal: run.signal,
  };
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
  console.log(`Measurement: ${report.seconds.toFixed(2)}s; exit ${report.exitCode}; ${output}`);
  return report.exitCode;
}

function readEvidence(path) {
  const report = JSON.parse(readFileSync(path, "utf8"));
  if (report.schema !== 1 || report.exitCode !== 0 || !Number.isFinite(report.seconds) || report.seconds <= 0) {
    throw new Error(`Invalid or failed measurement: ${path}`);
  }
  const env = report.environment;
  if (!env || !["node", "platform", "arch", "cpuModel", "kernel", "host"].every((key) => typeof env[key] === "string" && env[key])
    || !Number.isInteger(env.cpus) || env.cpus <= 0 || !Number.isFinite(env.memoryBytes) || env.memoryBytes <= 0) {
    throw new Error(`Missing measurement environment: ${path}`);
  }
  return report;
}

function compare(args) {
  const targetIndex = args.indexOf("--required-reduction");
  const required = targetIndex < 0 ? 60 : Number(args[targetIndex + 1]);
  if (!Number.isFinite(required) || required <= 0 || required >= 100) {
    throw new Error("Required reduction must be a finite percentage strictly between 0 and 100.");
  }
  const paths = args.filter((_, index) => targetIndex < 0 || (index !== targetIndex && index !== targetIndex + 1));
  if (paths.length < 2) throw new Error("Use --compare baseline.json candidate.json [candidate2.json ...]");
  const [baseline, ...candidates] = paths.map(readEvidence);
  if (candidates.some((r) => Object.keys(baseline.environment).some((key) => r.environment[key] !== baseline.environment[key]))) {
    throw new Error("Measurements must use the same Node/platform/CPU environment.");
  }
  const sorted = candidates.map((r) => r.seconds).sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const after = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  const passed = after <= baseline.seconds * (1 - required / 100);
  console.log(JSON.stringify({ beforeSeconds: baseline.seconds, afterSeconds: after,
    reductionPct: (1 - after / baseline.seconds) * 100, requiredReductionPct: required, passed }, null, 2));
  return passed ? 0 : 1;
}

try {
  const args = process.argv.slice(2);
  process.exitCode = args[0] === "--compare" ? compare(args.slice(1)) : record(args);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
