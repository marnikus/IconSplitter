// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { coveragePolicy, harnessProjects, mainWorkerBudget, NATIVE_TESTS, GEOMETRY_TESTS } from "../tools/test-harness-policy";

describe('resource-aware, isolated harness policy', () => {
  it('uses both available sandbox CPUs, caps large hosts and respects memory/single-core limits', () => {
    expect(mainWorkerBudget(2, 4 * 1024 ** 3)).toBe(2);
    expect(mainWorkerBudget(64, 64 * 1024 ** 3)).toBe(4);
    expect(mainWorkerBudget(8, 1024 ** 3)).toBe(1);
    expect(mainWorkerBudget(1, 4 * 1024 ** 3)).toBe(1);
    expect(mainWorkerBudget()).toBeGreaterThanOrEqual(1);
  });

  it('keeps the native set exclusive and every discovered test in exactly one project', () => {
    const projects = harnessProjects();
    const main = projects[0].test, geometry = projects[1].test, native = projects[2].test;
    expect(projects).toHaveLength(3);
    expect(main.name).toBe('main');
    expect(main.pool).toBe('vmThreads');
    expect(main.include).toEqual(['tests/**/*.test.{ts,tsx}']);
    expect(NATIVE_TESTS).toEqual(['tests/algo_efficiency.test.ts', 'tests/split_speed.test.ts',
      'tests/batch_perf_regression.test.tsx', 'tests/real_grid_image.test.ts', 'tests/fs.test.ts']);
    expect(main.isolate).toBe(true);
    expect(main.exclude).toEqual([...NATIVE_TESTS, ...GEOMETRY_TESTS]);
    expect(geometry).toMatchObject({ name: 'geometry', pool: 'threads', isolate: true, sequence: { groupOrder: 1 } });
    expect(geometry.include).toEqual(GEOMETRY_TESTS);
    expect(GEOMETRY_TESTS).toEqual(['tests/upload_centred_fit.test.ts', 'tests/upload_auto_repair.test.ts',
      'tests/harness_geometry_isolation_a.test.ts', 'tests/harness_geometry_isolation_b.test.ts']);
    expect(native).toMatchObject({ name: 'native', pool: 'threads', isolate: true, maxWorkers: 1, sequence: { groupOrder: 2 } });
    expect(native.include).toEqual(NATIVE_TESTS);
    const files = readdirSync('tests', { recursive: true, encoding: 'utf8' }).filter((name) => /\.test\.tsx?$/.test(name)).map((name) => `tests/${name.replace(/\\/g, "/")}`);
    expect(files.length).toBeGreaterThanOrEqual(237);
    expect([...NATIVE_TESTS, ...GEOMETRY_TESTS].every((name) => files.includes(name))).toBe(true);
    for (const file of files) {
      const matched = [!main.exclude!.includes(file), native.include.includes(file), geometry.include.includes(file)].filter(Boolean);
      expect(matched, file).toHaveLength(1);
    }
  });

  it('instruments the complete existing lib scope without changing thresholds or removing V8 audits', () => {
    expect(coveragePolicy).toEqual({ provider: 'istanbul', include: ['src/lib/**'], reporter: ['text', 'json-summary'], thresholds: { lines: 80 } });
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(pkg.devDependencies['@vitest/coverage-istanbul']).toBe('5.0.3');
    expect(pkg.devDependencies['@vitest/coverage-v8']).toBeDefined();
  });
});

it('gives the measured geometry hot files a distinct isolated native-realm project', () => {
  const geometry = harnessProjects().find((p) => p.test.name === 'geometry');
  expect(geometry?.test.pool).toBe('threads');
  expect(geometry?.test.isolate).toBe(true);
  expect(geometry?.test.include).toContain('tests/upload_centred_fit.test.ts');
  expect(geometry?.test.include).toContain('tests/upload_auto_repair.test.ts');
});
