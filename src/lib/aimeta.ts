// aimeta.ts — transitions for AI-source version history stored on PairMeta
// (2026-10-16). Kept in its own file so lib/pairmeta.ts stays at its baseline
// line count (RULE 16 ratchet) while still providing the pair-level helpers
// the img/ pipeline needs. Pure: no IO.

import type { AiVersion } from "./imgmodel";
import type { PairMeta } from "./pairmeta";

/** Append or replace one AI version; identity, faces, decision, SVG history stay. */
export function withAiVersion(meta: PairMeta, rec: AiVersion): PairMeta {
  const rest = meta.aiVersions.filter((v) => v.version !== rec.version);
  return { ...meta, aiVersions: [...rest, rec].sort((a, b) => a.version - b.version) };
}

/** Choose which AI version the row shows (I-74); null = fall back to newest valid. */
export function setAiPreferred(meta: PairMeta, version: number | null): PairMeta {
  return { ...meta, aiPreferred: version };
}
