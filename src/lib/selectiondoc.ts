// selectiondoc.ts — the selection document (2026-11-08): the ONE owner of what
// is checked, kept in its own storage key.
//
// Why a second key. The session snapshot is written by every page that knows
// about it — including pages still running an older build, which keep their
// whole checked set in that snapshot. A tab left open overnight flushes its
// snapshot on hide/pagehide, and its copy still carried the 100 checks it booted
// with, so a newer selection made in another tab was replaced by the old ones on
// the next reload. The selection document did not exist in those builds, so no
// older page can write it: the newest pick can no longer be resurrected over.
// The same split keeps the session snapshot small (no id lists) and lets a
// gesture write just the slice that changed.

import { isRecord } from "./isrecord";
import {
  DEFAULT_BATCH, DEFAULT_BUILDER, DEFAULT_STOCK_UPLOAD, DEFAULT_SVG, DEFAULT_UPLOAD,
  parseBatchSlice, parseBuilderSlice, parseUploadSlice, parseV2,
  type SessionBatch, type SessionBuilder, type SessionState, type SessionStockUpload,
  type SessionSvg, type SessionUpload, type SessionV2,
} from "./session";

export const SELECTION_VERSION = 1;

/** Every checked row, per tab, in one document. */
export interface SelectionDoc {
  upload: SessionUpload;
  stockUpload: SessionStockUpload;
  svg: SessionSvg;
  builder: SessionBuilder;
  batch: SessionBatch;
  v2: SessionV2;
}

export const EMPTY_SELECTION_DOC: SelectionDoc = {
  upload: DEFAULT_UPLOAD,
  stockUpload: DEFAULT_STOCK_UPLOAD,
  svg: DEFAULT_SVG,
  builder: DEFAULT_BUILDER,
  batch: DEFAULT_BATCH,
  v2: { checked: [], scrollY: 0, anchorId: null },
};

/** The slices the app store holds right now — what the next write must contain. */
export function selectionDocOf(s: SessionState): SelectionDoc {
  return {
    upload: s.upload,
    stockUpload: s.stockUpload ?? DEFAULT_STOCK_UPLOAD,
    svg: s.svg,
    builder: s.builder,
    batch: s.batch,
    v2: s.selectionV2,
  };
}

/**
 * Stored document → slices. `null` means "there is no usable document": a first
 * run, a cleared storage, or a corrupt payload (costs one ignored load, never a
 * broken startup — RULE 13). A present document with a missing slice restores
 * that slice as empty, which is the honest reading of "nothing was checked".
 */
export function parseSelectionDoc(text: string | null): SelectionDoc | null {
  if (!text) return null;
  try {
    const raw: unknown = JSON.parse(text);
    if (!isRecord(raw)) return null;
    return {
      upload: parseUploadSlice(raw.upload),
      stockUpload: parseUploadSlice(raw.stockUpload),
      svg: parseUploadSlice(raw.svg),
      builder: parseBuilderSlice(raw.builder),
      batch: parseBatchSlice(raw.batch),
      v2: parseV2(raw.v2),
    };
  } catch {
    return null;
  }
}

export function serializeSelectionDoc(doc: SelectionDoc, nowIso: string): string {
  return JSON.stringify({ v: SELECTION_VERSION, savedAt: nowIso, ...doc });
}

/** The session with this document's selections in place of whatever it carried. */
export function withSelectionDoc(s: SessionState, doc: SelectionDoc): SessionState {
  return {
    ...s,
    upload: doc.upload,
    stockUpload: doc.stockUpload,
    svg: doc.svg,
    builder: doc.builder,
    batch: doc.batch,
    selectionV2: doc.v2,
  };
}

/**
 * The session as the session snapshot stores it: the selections emptied, because
 * the selection document owns them. Keeping a second copy is exactly the two
 * writers that can disagree this change exists to remove.
 */
export function clearSelectionOf(s: SessionState): SessionState {
  return withSelectionDoc(s, EMPTY_SELECTION_DOC);
}
