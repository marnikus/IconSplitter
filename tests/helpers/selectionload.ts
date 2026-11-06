// Representative, deterministic real-list data shared by Chromium benchmarks and work regressions.
import { parseAiName } from "../../src/lib/naming";
import type { ViewPair } from "../../src/lib/reviewfilter";
import type { Row } from "../../src/batch/useBatch";
import type { UploadRow } from "../../src/upload/types";
import type { DirHandleLike } from "../../src/lib/fs";
import { EMPTY_META } from "../../src/upload/types";
import { toRow } from "../../src/svg/rowmodel";
import { pairMetaFor, svgSource, svgVersion } from "./svgpair";

export const LOAD_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><defs><linearGradient id="g"><stop stop-color="#346abc"/><stop offset="1" stop-color="#88bbee"/></linearGradient></defs><g fill="url(#g)" stroke="#132639" stroke-width="2">${Array.from({ length: 12 }, (_, i) => `<path d="M${8 + i * 8} 12v88q4 16 8 0V12z"/>`).join("")}</g></svg>`;
export const LOAD_IMAGE = `data:image/svg+xml,${encodeURIComponent(LOAD_SVG)}`;
export const loadThumb = async () => LOAD_IMAGE;
export const noop = () => {};

export function selectionLoad(count: number) {
  const sources = Array.from({ length: count }, (_, i) => svgSource(`item-${String(i).padStart(4, "0")}`));
  const svg = sources.map((source) => toRow(source, pairMetaFor(source, [svgVersion(`${source.dirPath}/${source.stem}.svg`)]), false));
  const pairs: ViewPair[] = sources.map((s) => ({ pairId: s.id, base: s.base, suffix: "", relDir: s.dirPath,
    source: { relPath: s.sourcePath!, size: 25000, mtime: 1700000000000, error: null },
    ai: { relPath: s.relPath, size: 35000, mtime: 1700000001000, error: null },
    created: 1700000000000, generated: 1700000001000, decision: "pending", reviewedAt: null }));
  const batch: Row[] = sources.map((s) => ({ name: s.name, relPath: s.relPath, refRelPath: s.sourcePath,
    ai: parseAiName(s.name)!, dirPath: s.dirPath, error: null, size: 35000, mtime: 1700000001000, status: "unprocessed", review: "pending", selected: false }));
  const upload: UploadRow[] = sources.map((s) => ({ source: { id: s.id, base: s.base, suffix: "", dirPath: s.dirPath,
    version: 1, svgPath: `${s.dirPath}/${s.stem}.svg`, svgName: `${s.stem}.svg`, fingerprint: "500:1700000001000",
    aiPath: s.relPath, metaPath: s.metaPath, approvedValid: 1 }, record: null, sourceHash: null,
    status: "stale", stage: null, running: null, meta: EMPTY_META, error: "", note: "", stale: false }));
  return { svg, pairs, batch, upload, ids: sources.map((s) => s.id) };
}

/** Local File API stand-in: no provider/network, real SVG text, File/Blob and preview algorithms. */
export function loadRoot(): DirHandleLike {
  const root: DirHandleLike = {
    kind: "directory", name: "fixture",
    getDirectoryHandle: async () => root,
    entries: async function* () { yield* []; },
    getFileHandle: async (name: string) => ({ kind: "file", name, createWritable: async () => { throw new Error("Read-only benchmark fixture"); }, getFile: async () => new File([LOAD_SVG], name, { type: "image/svg+xml" }) }),
  };
  return root;
}
