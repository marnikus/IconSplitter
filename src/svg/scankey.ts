// scankey.ts — the identity of one scan snapshot (design D7).
// Owns: one stable string for "what the panel would show". A finished scan
// whose key equals the committed one commits nothing: no row replacement, no
// root token, no preview reload, no lost row state. Pure and order-aware, so
// two scans of the same unchanged folder cannot produce two different keys.

import type { Discovery } from "./sources";
import type { SvgRow } from "./types";

/** One row: which file, which problems, which sidecar versions, which status. */
function rowKey(row: SvgRow): string {
  const v = row.newest;
  return [
    row.source.id, row.source.relPath, row.source.fingerprint,
    row.source.problems.map((p) => p.kind).join("+"),
    row.corrupt ? "corrupt" : "ok", row.status,
    row.sidecar ? `n${row.sidecar.versions.length}` : "n0",
    v ? `v${v.version}:${v.svgPath}:${v.status}:${v.review}` : "v0",
    row.approved ? `a${row.approved.version}` : "a0",
  ].join("~");
}

/** The whole snapshot: the root, what was discovered, and every built row. */
export function scanKey(rootName: string, discovery: Discovery, rows: SvgRow[]): string {
  const sources = discovery.sources.map((s) => `${s.id}@${s.relPath}@${s.fingerprint}`);
  const problems = discovery.problems.map((p) => `${p.id}:${p.kind}:${p.relPath ?? ""}`);
  const unreadable = discovery.unreadable.map((u) => u.relPath);
  return [
    rootName, discovery.corruptDecisions ? "corrupt" : "ok",
    sources.join("|"), problems.join("|"), unreadable.join("|"),
    rows.map(rowKey).join("|"),
  ].join("#");
}
