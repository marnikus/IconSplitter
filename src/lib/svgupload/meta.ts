// meta.ts — the accepted metadata, its store, and the rules for an EDIT (design
// §5/§8/§10). The panel needs three things from one place:
//   · what is stored for an icon, and whether it still describes the source;
//   · how a store payload survives a round trip through localStorage (junk is
//     dropped record by record, never all-or-nothing);
//   · what an edited answer is — an edit is validated by the SAME policy that
//     judges a provider answer, so hand-editing cannot smuggle in a title with
//     four words or a tag list with 39 entries. An invalid edit is kept as a
//     DRAFT (status "rejected") and can never be exported; the last accepted
//     values stay in the record for comparison.

import { isRecord } from "../isrecord";
import {
  DEFAULT_UPLOAD_PROMPT, parseMetaRecord, validateMetadata, restrictedWarnings, type MetaRecord, type MetaText,
} from "./metaprompt";

export interface MetaStore {
  /** Keyed by pair id — the same identity the settings overrides use. */
  records: Record<string, MetaRecord>;
  /** The editable prompt template (the exact prompt is recorded per record). */
  prompt: string;
  /** The model the user chose; "" means "ask the provider catalog". */
  model: string;
}

export const EMPTY_META_STORE: MetaStore = { records: {}, prompt: DEFAULT_UPLOAD_PROMPT, model: "" };

export function parseMetaStore(raw: unknown): MetaStore {
  if (!isRecord(raw)) return { ...EMPTY_META_STORE };
  const records: Record<string, MetaRecord> = {};
  if (isRecord(raw.records)) {
    for (const [id, value] of Object.entries(raw.records)) {
      const record = parseMetaRecord(value);
      if (record !== null && record.pairId === id) records[id] = record;
    }
  }
  return {
    records,
    prompt: typeof raw.prompt === "string" && raw.prompt.trim() !== "" ? raw.prompt : DEFAULT_UPLOAD_PROMPT,
    model: typeof raw.model === "string" ? raw.model : "",
  };
}

/** Stores one record for its own icon — never replacing another icon's answer. */
export function putRecord(store: MetaStore, record: MetaRecord): MetaStore {
  return { ...store, records: { ...store.records, [record.pairId]: record } };
}

export function recordFor(store: MetaStore, id: string): MetaRecord | null {
  return store.records[id] ?? null;
}

/** True when the stored answer was made from THIS source fingerprint. */
export function isFresh(record: MetaRecord | null, fingerprint: string): boolean {
  if (record === null) return false;
  return fingerprint === "" || record.sourceFingerprint === fingerprint;
}

/** Which of the four states a row's metadata is in, in the words the UI shows. */
export type MetaState = "none" | "accepted" | "stale" | "rejected" | "interrupted";

export function metaStateOf(record: MetaRecord | null, fingerprint: string): MetaState {
  if (record === null || record.status === "pending") return "none";
  if (record.status === "interrupted") return "interrupted";
  if (record.status === "rejected") return "rejected";
  return isFresh(record, fingerprint) ? "accepted" : "stale";
}

export const META_STATE_TEXT: Record<MetaState, string> = {
  none: "Metadata: not generated yet",
  accepted: "Metadata: accepted — embedded in the SVG and the JPEG",
  stale: "Metadata: stale — the source changed, so this text no longer describes it",
  rejected: "Metadata: needs review — the stored answer did not pass the policy",
  interrupted: "Metadata: interrupted — the request was never confirmed",
};

/** A hand edit: the fields change, the policy decides whether it is accepted. */
export function editRecord(record: MetaRecord, patch: Partial<MetaText>, at: string): MetaRecord {
  const meta: MetaText = {
    title: patch.title ?? record.title,
    description: patch.description ?? record.description,
    tags: patch.tags ?? record.tags,
  };
  const errors = validateMetadata(meta);
  const warnings = restrictedWarnings(meta);
  if (errors.length === 0) return { ...record, ...meta, status: "accepted", errors, warnings, at, requestId: null };
  return { ...record, ...meta, status: "rejected", errors, warnings, at };
}

/** What the panel shows for a hand edit: the policy's own words, or "fine". */
export function editVerdict(record: MetaRecord): { ok: boolean; lines: string[] } {
  if (record.status === "accepted") return { ok: true, lines: record.warnings };
  return { ok: false, lines: record.errors };
}

/** The prompt one request would send — the exact text recorded with the answer. */
export function promptFor(store: MetaStore, iconName: string): string {
  return store.prompt.includes("{icon}") ? store.prompt.split("{icon}").join(iconName) : `${store.prompt}\n\nIcon file name: ${iconName}`;
}
