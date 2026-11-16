// upload_assemble_perf.test.ts — SVG to upload's row assembly ≥ 80 % quicker
// (2026-11-06). After discovery the tab read every pair's export.json and every
// source SVG and hashed it, ONE ROW AT A TIME, each lookup resolved from the
// root again — and again after every restart. Now rows assemble in parallel,
// folder lookups are shared inside one assembly, and source hashes are kept by
// (SVG path, size:mtime fingerprint) across restarts, so an unchanged SVG is
// never read or hashed again. Same rows as before, measured on a slow drive.
import { beforeEach, describe, expect, it } from "vitest";
import { readBytesAt } from "../src/lib/fs";
import { sha256HexText } from "../src/lib/upload/hash";
import { exportDirOf, newExportRecord, parseExportRecord, serializeExportRecord } from "../src/lib/upload/export";
import { DEFAULT_UPLOAD_SETTINGS } from "../src/lib/upload/settings";
import { assembleRows } from "../src/upload/rowmodel";
import { forgetSourceHashesInMemory, SOURCE_HASH_KEY } from "../src/upload/rowreads";
import type { UploadRowSource } from "../src/upload/discovery";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { meter, perOpMs, slow, timed } from "./helpers/slowfs";

const OPTS = { defaults: DEFAULT_UPLOAD_SETTINGS, overrides: {}, interrupted: new Set<string>() };

function child(parent: FakeDir, name: string): FakeDir {
  const found = parent.children.get(name);
  if (found instanceof FakeDir) return found;
  const dir = new FakeDir(name);
  parent.children.set(name, dir);
  return dir;
}

/** `n` pairs: a source SVG each, and an export.json for every second one. */
function workspace(n: number): { root: FakeDir; sources: UploadRowSource[] } {
  const root = new FakeDir("ws");
  const sources: UploadRowSource[] = [];
  for (let i = 0; i < n; i += 1) {
    const dirPath = `cat_${i % 8}/pair_${i}`;
    const dir = child(child(root, `cat_${i % 8}`), `pair_${i}`);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M${i} 0h10"/></svg>`;
    const svgName = `icon_${i}_AI_v1.svg`;
    dir.children.set(svgName, new FakeFile(svgName, svg.length, 7000 + i, svg));
    if (i % 2 === 0) {
      const rec = newExportRecord({
        pair: { id: `p${i}`, base: `icon_${i}`, suffix: "", dir: dirPath },
        source: { svgPath: `${dirPath}/${svgName}`, version: 1, approval: "approved", fingerprint: `${svg.length}:${7000 + i}` },
        settings: { defaults: DEFAULT_UPLOAD_SETTINGS, overrides: {}, effective: DEFAULT_UPLOAD_SETTINGS, fingerprint: "f" },
        svgo: { enabled: true, version: "3", config: "default", beforeBytes: 1, afterBytes: 1, beforeHash: "0", afterHash: "0" },
        epsEnabled: true, now: "2026-11-01T10:00:00.000Z",
      });
      const json = serializeExportRecord(rec);
      child(dir, "export").children.set("export.json", new FakeFile("export.json", json.length, 8000 + i, json));
    }
    sources.push({
      id: `p${i}`, base: `icon_${i}`, suffix: "", dirPath, version: 1, svgPath: `${dirPath}/${svgName}`, svgName,
      fingerprint: `${svg.length}:${7000 + i}`, aiPath: `${dirPath}/icon_${i}_AI.png`, metaPath: `${dirPath}/icon_${i}_AI.svg.json`, approvedValid: 1,
    });
  }
  return { root, sources };
}

/** The old assembly, one row at a time, every lookup from the root — the reference. */
async function oldReads(root: FakeDir, sources: readonly UploadRowSource[]) {
  const out: { record: unknown; sourceHash: string | null }[] = [];
  for (const s of sources) {
    const recBytes = await readBytesAt(root, `${exportDirOf(s.dirPath)}/export.json`);
    const record = (() => {
      try { return recBytes === null ? null : parseExportRecord(JSON.parse(new TextDecoder().decode(recBytes))); } catch { return null; }
    })();
    const svgBytes = await readBytesAt(root, s.svgPath);
    out.push({ record, sourceHash: svgBytes === null ? null : `sha256:${await sha256HexText(new TextDecoder().decode(svgBytes))}` });
  }
  return out;
}

beforeEach(() => { localStorage.removeItem(SOURCE_HASH_KEY); forgetSourceHashesInMemory(); });

describe("SVG to upload row assembly", () => {
  it("assembles exactly the rows the old one-row-at-a-time reads gave", { timeout: 60_000 }, async () => {
    const { root, sources } = workspace(12);
    const rows = await assembleRows(root, sources, OPTS);
    const reference = await oldReads(root, sources);
    expect(rows.map((r) => ({ record: r.record, sourceHash: r.sourceHash }))).toEqual(reference);
    expect(rows.map((r) => r.source.id)).toEqual(sources.map((s) => s.id));
  });

  it("is ≥ 80 % quicker than the old reads on a slow drive, even with nothing remembered", { timeout: 120_000 }, async () => {
    const m = meter();
    const { root, sources } = workspace(60);
    slow(root, m);
    const before = m.ops;
    await oldReads(root, sources);
    const oldOps = m.ops - before;
    const oldMs = oldOps * (await perOpMs());
    const fresh = await timed(() => assembleRows(root, sources, OPTS));
    expect(fresh.ms).toBeLessThan(oldMs * 0.2);
    expect(m.peak).toBeLessThanOrEqual(24);
  });

  it("after a restart, reads and hashes no unchanged SVG — only a changed one", { timeout: 60_000 }, async () => {
    const m = meter();
    const { root, sources } = workspace(20);
    slow(root, m, [".svg"]);
    const first = await assembleRows(root, sources, OPTS);
    expect(m.reads[".svg"]).toBe(20);
    forgetSourceHashesInMemory(); // a restart: only what was stored survives
    const again = await assembleRows(root, sources, OPTS);
    expect(m.reads[".svg"]).toBe(20); // none read again
    expect(again.map((r) => r.sourceHash)).toEqual(first.map((r) => r.sourceHash));
    const changed = sources.map((s, i) => (i === 3 ? { ...s, fingerprint: "999:1" } : s));
    await assembleRows(root, changed, OPTS);
    expect(m.reads[".svg"]).toBe(21); // only the changed SVG
  });

  it("stores the hashes validated on read: a damaged store is simply empty", async () => {
    localStorage.setItem(SOURCE_HASH_KEY, "{not json");
    const { root, sources } = workspace(2);
    const rows = await assembleRows(root, sources, OPTS);
    expect(rows.every((r) => r.sourceHash?.startsWith("sha256:"))).toBe(true);
    expect(JSON.parse(localStorage.getItem(SOURCE_HASH_KEY) ?? "{}").v).toBe(1);
  });
});
