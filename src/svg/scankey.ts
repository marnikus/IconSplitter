// scankey.ts — the identity of one scan snapshot (design D7).
// Owns: one stable string for "what the panel would show". A finished scan
// whose key equals the committed one commits nothing: no row replacement, no
// root token, no preview reload, no lost row state. Pure and order-aware, so
// two scans of the same unchanged folder cannot produce two different keys.

import type { Discovery } from "./sources";
import type { ScanAudit } from "./sourcelist";
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

/** The audit numbers as one string — a changed count is a changed snapshot. */
function auditKey(a: ScanAudit): string {
  return `${a.files}/${a.aiSources}/${a.references}/${a.missing}/${a.duplicates}/${a.rows}`;
}

/** The whole snapshot: the root, what was discovered, and every built row. */
export function scanKey(rootName: string, discovery: Discovery, rows: SvgRow[]): string {
  const sources = discovery.sources.map((s) => `${s.id}@${s.relPath}@${s.fingerprint}`);
  const problems = discovery.problems.map((p) => `${p.id}:${p.kind}:${p.relPath ?? ""}`);
  const unreadable = discovery.unreadable.map((u) => u.relPath);
  const excluded = discovery.excluded.map((e) => `${e.id}:${e.kind}:${e.relPath ?? ""}`);
  return [
    rootName, discovery.corruptDecisions ? "corrupt" : "ok",
    sources.join("|"), problems.join("|"), excluded.join("|"), auditKey(discovery.audit), unreadable.join("|"),
    rows.map(rowKey).join("|"),
  ].join("#");
}
