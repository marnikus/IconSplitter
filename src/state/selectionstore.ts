// selectionstore.ts — localStorage IO for the selection document (2026-11-08).
//
// Its own key, and that is the point: pages still running an older build know
// only `iconSplitter.session.v1` and can therefore never write this document, so
// their stale 100 checks can no longer come back over a newer pick. Validation
// lives in lib/selectiondoc; a corrupt payload is one ignored load (RULE 13).

import {
  parseSelectionDoc, serializeSelectionDoc, type SelectionDoc,
} from "../lib/selectiondoc";
import { readKey, readSavedAt, writeVerified } from "./safestorage";

export const SELECTION_KEY = "iconSplitter.selection.v1";

/** The stored document, or null on a first run / cleared storage / corrupt text. */
export function loadSelectionDoc(): SelectionDoc | null {
  return parseSelectionDoc(readKey(SELECTION_KEY));
}

/** The stamp of the stored document — this page's guard against a newer pick. */
export function readSelectionStamp(): string | null {
  return readSavedAt(SELECTION_KEY);
}

/** Writes the document and proves it landed; true when storage holds it now. */
export function saveSelectionDoc(doc: SelectionDoc, nowIso: string): boolean {
  return writeVerified(SELECTION_KEY, serializeSelectionDoc(doc, nowIso));
}
