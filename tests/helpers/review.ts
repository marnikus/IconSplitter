// Shared review fixtures (RULE 8): pairs and items built from an id so tests
// read like the on-disk tree they describe.
import type { PairKind, PairSide, ReviewPair } from "../../src/lib/review";
import type { ReviewItem } from "../../src/lib/reviewmerge";
import type { Decision } from "../../src/lib/reviewfile";

export interface PairOpts {
  mtime?: number;
  size?: number;
  source?: boolean;
  ai?: boolean;
}

export function pair(id: string, o: PairOpts = {}): ReviewPair {
  const [path, variantText] = id.split("#");
  const variant = variantText === undefined ? null : Number(variantText);
  const cut = path.lastIndexOf("/");
  const dirPath = cut < 0 ? "" : path.slice(0, cut);
  const base = cut < 0 ? path : path.slice(cut + 1);
  const mtime = o.mtime ?? 0;
  const side = (relPath: string): PairSide => ({
    relPath, name: relPath.split("/").pop()!, size: o.size ?? 10, mtime,
  });
  const source = o.source === false ? null : side(`${path}.png`);
  const ai = o.ai === false ? null : side(`${path}_AI${variant === null ? "" : `_${variant}`}.png`);
  const kind: PairKind = source !== null && ai !== null ? "paired" : ai !== null ? "ai-only" : "source-only";
  return { id, dirPath, base, variant, kind, source, ai, createdAt: mtime };
}

export function item(id: string, status: Decision, o: PairOpts = {}): ReviewItem {
  return {
    ...pair(id, o),
    status,
    reviewedAt: status === "pending" ? null : "2026-10-01T10:00:00.000Z",
  };
}
