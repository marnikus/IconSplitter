// recorddraft.ts — metadata export.json saved without accepting it (2026-11-13).
// A title, description and keywords with no Icon Name used to be dropped by the
// export ("metadata": null). It is saved now, with its state; on reload it comes
// back into the row as a draft, re-validated, so only the missing field is left
// to fill before Accept. Accepted blocks are `metaFromRecord`'s, not this one's.

import type { ExportRecord } from "../lib/upload/export";
import type { GeminiUsage } from "../lib/upload/gemini";
import { cleanMetadata, metadataFingerprint, validateUploadMetadata, type IconMetadata, type MetadataValidation } from "../lib/upload/meta";
import { metadataRights } from "../lib/upload/rights";
import { EMPTY_META, type UploadMetaState } from "./types";

/** A draft the export saves: the text, its state and where it came from. */
export interface SavedMetadata {
  metadata: IconMetadata;
  state: "generated" | "invalid";
  info: {
    prompt: string; response?: string; provider: string; model: string; requestId: string | null;
    usage: GeminiUsage; validation: MetadataValidation;
  };
}

/** The saved draft of a record as the row's editable state, or empty. */
export function draftFromRecord(record: Pick<ExportRecord, "metadata"> | null): UploadMetaState {
  const block = record?.metadata ?? null;
  if (block === null || block.state === "accepted") return EMPTY_META;
  const metadata = cleanMetadata({
    title: block.title, description: block.description, tags: [...block.tags], name: block.name, ...metadataRights(block),
  });
  if (metadata === null) return EMPTY_META;
  const validation = validateUploadMetadata(metadata);
  return {
    ...EMPTY_META,
    // Valid text that was never accepted stays a draft awaiting Accept.
    state: validation.ok ? "generated" : "invalid",
    metadata,
    validation,
    usage: block.usage,
    ...(block.response ? { response: block.response } : {}),
    detail: validation.ok ? "" : "saved in export.json without being accepted — fill the missing field and accept",
  };
}

/**
 * True while export.json does not hold the row's current DRAFT (unaccepted text):
 * the row reads stale so an export saves it. Accepted text is `metadataMoved`'s.
 */
export function savedMetadataMoved(record: Pick<ExportRecord, "metadata">, meta: UploadMetaState): boolean {
  const draft = meta.metadata !== null && meta.state !== "accepted" ? metadataFingerprint(meta.metadata) : "";
  const block = record.metadata;
  const saved = block !== null && block.state !== "accepted" ? block.fingerprint : "";
  return draft !== saved;
}
