// pairmetalegacy.ts — reading the v1 pair file (design §2.1, I-42).
// The old shape had no `pair` block and its `source` field WAS the AI image, so
// this module REBUILDS what the old file meant: the pair's identity from the AI
// path, both faces as they can be recovered, and the versions it listed, exactly
// as they were. Extracted from pairmeta.ts (RULE 18) so the v2/v3 shape stays
// the main file's single subject; nothing here writes anything.

import { isRecord } from "./isrecord";
import { parseAiName } from "./naming";
import { pairId } from "./pairing";
import { svgStem } from "./svgfile";
import { parseVersion } from "./svgmodel";
import type { MetaParse, PairMeta } from "./pairmeta";

/** The stored shape that predates the `pair` block (2026-10-05). */
export const LEGACY_VERSION = 1;

/** v1 -> current: the old file's `source` WAS the AI image (design §2.1). */
export function pairMetaFromLegacy(raw: Record<string, unknown>): MetaParse {
  const ai = toSide(raw.source);
  if (ai.relPath === "") return { ok: false };
  const dirPath = dirOf(ai.relPath);
  const named = nameParts(ai.relPath);
  return {
    ok: true,
    meta: {
      v: 3,
      id: pairId(dirPath, named.base, named.suffix),
      ...named, dirPath,
      ai, source: null, decision: null, reviewedAt: null, preferredVersion: null,
      versions: (raw.versions as unknown[]).flatMap((v) => parseVersion(v) ?? []),
    },
  };
}

/** The pair's base and suffix, read from the AI image's own name. */
function nameParts(aiRelPath: string): { base: string; suffix: string } {
  const name = aiRelPath.split("/").pop() ?? "";
  const parsed = parseAiName(name);
  return { base: parsed?.base ?? svgStem(name), suffix: parsed?.suffix ?? "" };
}

function toSide(raw: unknown): PairMeta["ai"] {
  const r = isRecord(raw) ? raw : {};
  return { relPath: str(r.relPath), name: str(r.name), fingerprint: str(r.fingerprint) };
}

function dirOf(relPath: string): string {
  const at = relPath.lastIndexOf("/");
  return at < 0 ? "" : relPath.slice(0, at);
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}
