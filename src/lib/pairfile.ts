// pairfile.ts — reading a pair file (I-41/I-42). A v2 file as it is, a legacy
// v1 sidecar as this pair's file (its versions kept, the AI face taken from the
// stored source, the identity derived from that path). A file that is not either
// shape is refused; a half-damaged version list keeps every record that still
// parses (RULE 13). Pure: text in, a meta or a refusal out (RULE 3).

import { isRecord } from "./isrecord";
import { parseAiName } from "./naming";
import { pairId } from "./pairing";
import { baseName, dirOf, PAIR_META_VERSION, type PairMeta, type PairSide } from "./pairmeta";
import type { Decision } from "./reviewfilter";
import { svgStem } from "./svgfile";
import { parseVersion } from "./svgmodel";

const LEGACY_VERSION = 1;

export type MetaParse = { ok: true; meta: PairMeta } | { ok: false };

/**
 * Reads a pair file: v2 as it is, a legacy v1 sidecar as this pair's file (its
 * versions kept, the AI face taken from the stored source, the identity derived
 * from that path). A file that is not either shape is refused; a half-damaged
 * version list keeps every record that still parses (RULE 13).
 */
export function parsePairMeta(text: string): MetaParse {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false };
  }
  if (!isRecord(raw) || !Array.isArray(raw.versions)) return { ok: false };
  if (raw.v === LEGACY_VERSION) return pairMetaFromLegacy(raw);
  if (raw.v !== PAIR_META_VERSION || !isRecord(raw.pair)) return { ok: false };
  return readV2(raw);
}

function readV2(raw: Record<string, unknown>): MetaParse {
  const pair = raw.pair as Record<string, unknown>;
  const id = str(pair.id);
  const base = str(pair.base);
  if (id === "" || base === "") return { ok: false };
  return {
    ok: true,
    meta: {
      v: PAIR_META_VERSION, id, base, suffix: str(pair.suffix), dirPath: str(pair.dir),
      ai: toSide(raw.ai),
      source: isRecord(raw.source) ? toSide(raw.source) : null,
      decision: toDecision(raw.decision),
      reviewedAt: nullableStr(raw.reviewedAt),
      versions: (raw.versions as unknown[]).flatMap((v) => parseVersion(v) ?? []),
    },
  };
}

/** v1 -> v2: the old file's `source` WAS the AI image (design §2.1). */
export function pairMetaFromLegacy(raw: Record<string, unknown>): MetaParse {
  const ai = toSide(raw.source);
  if (ai.relPath === "") return { ok: false };
  const dirPath = dirOf(ai.relPath);
  const named = nameParts(ai.relPath);
  return {
    ok: true,
    meta: {
      v: PAIR_META_VERSION,
      id: pairId(dirPath, named.base, named.suffix),
      ...named, dirPath,
      ai, source: null, decision: null, reviewedAt: null,
      versions: (raw.versions as unknown[]).flatMap((v) => parseVersion(v) ?? []),
    },
  };
}

/** The pair's base and suffix, read from the AI image's own name. */
function nameParts(aiRelPath: string): { base: string; suffix: string } {
  const name = baseName(aiRelPath);
  const parsed = parseAiName(name);
  return { base: parsed?.base ?? svgStem(name), suffix: parsed?.suffix ?? "" };
}

function toSide(raw: unknown): PairSide {
  const r = isRecord(raw) ? raw : {};
  return { relPath: str(r.relPath), name: str(r.name), fingerprint: str(r.fingerprint) };
}

function toDecision(value: unknown): Decision | null {
  return value === "pending" || value === "approved" || value === "declined" ? value : null;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function nullableStr(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
