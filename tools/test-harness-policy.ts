// One inventory/resource/coverage policy for the isolated full-system test harness.
import { availableParallelism, totalmem } from "node:os";

export const NATIVE_TESTS: string[] = [
  "tests/algo_efficiency.test.ts", "tests/split_speed.test.ts", "tests/batch_perf_regression.test.tsx",
  "tests/real_grid_image.test.ts", "tests/fs.test.ts",
];

/** Avoid Vitest 5's implicit single worker on 2 CPUs without oversubscribing low-memory hosts. */
export function mainWorkerBudget(cpus = availableParallelism(), memoryBytes = totalmem()): number {
  const memorySlots = Math.floor(memoryBytes * 0.75 / (768 * 1024 ** 2));
  return Math.max(1, Math.min(4, cpus, memorySlots));
}

export function harnessProjects() {
  return [
    { extends: true as const, test: { name: "main", include: ["tests/**/*.test.{ts,tsx}"], exclude: NATIVE_TESTS,
      pool: "vmThreads" as const, isolate: true } },
    { extends: true as const, test: { name: "native", include: NATIVE_TESTS, pool: "threads" as const,
      isolate: true, maxWorkers: 1, sequence: { groupOrder: 1 } } },
  ];
}

export const coveragePolicy = {
  provider: "istanbul" as const,
  include: ["src/lib/**"],
  reporter: ["text", "json-summary"],
  thresholds: { lines: 80 },
};
