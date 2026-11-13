// imgjournal.ts — metadata-only evidence of sent image-edit requests.
// A reload cannot recover provider bytes, so an unknown outcome needs a new
// explicit confirmation before any retry; no image, prompt or key is persisted.

import { readKey, writeKey } from "../state/safestorage";

export const IMAGE_JOURNAL_KEY = "iconSplitter.svg.imageInflight.v1";
export interface ImageRequestEvidence {
  id: string;
  ids: string[];
  status: "sent" | "review";
  at: number;
  model: string;
  provider: string;
  requestId: string | null;
}
export interface ImageJournal { entries: ImageRequestEvidence[]; warning: boolean }
const MAX_ENTRIES = 50;

export function loadImageJournal(): ImageJournal {
  const text = readKey(IMAGE_JOURNAL_KEY);
  if (text === null) return { entries: [], warning: false };
  try {
    const parsed = JSON.parse(text) as { v?: unknown; entries?: unknown };
    if (parsed?.v !== 1 || !Array.isArray(parsed.entries) || parsed.entries.length > MAX_ENTRIES || !parsed.entries.every(validEntry)) {
      return { entries: [], warning: true };
    }
    return { entries: (parsed.entries as ImageRequestEvidence[]).map(evidenceOf), warning: false };
  } catch {
    return { entries: [], warning: true };
  }
}

function validEntry(value: unknown): value is ImageRequestEvidence {
  if (typeof value !== "object" || value === null) return false;
  const e = value as Partial<ImageRequestEvidence>;
  return validLabel(e.id) && validIds(e.ids) && validStage(e.status, e.at)
    && validLabel(e.model) && validLabel(e.provider) && validRequestId(e.requestId);
}

function validLabel(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 160;
}

function validIds(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 16 && value.every(validLabel);
}

function validStage(status: unknown, at: unknown): boolean {
  return (status === "sent" || status === "review") && typeof at === "number" && Number.isFinite(at) && at >= 0;
}

function validRequestId(value: unknown): boolean {
  return value === null || (typeof value === "string" && value.length <= 160);
}

/** Only these metadata fields may ever be persisted, even from a foreign object. */
function evidenceOf(entry: ImageRequestEvidence): ImageRequestEvidence {
  const { id, ids, status, at, model, provider, requestId } = entry;
  return { id, ids: [...ids], status, at, model, provider, requestId };
}

export function saveImageJournal(entries: readonly ImageRequestEvidence[]): void {
  writeKey(IMAGE_JOURNAL_KEY, JSON.stringify({ v: 1, entries: entries.slice(-MAX_ENTRIES).map(evidenceOf) }));
}

export function upsertImageRequest(entries: readonly ImageRequestEvidence[], next: ImageRequestEvidence): ImageRequestEvidence[] {
  return [...entries.filter((item) => item.id !== next.id), evidenceOf(next)].slice(-MAX_ENTRIES);
}

export function removeImageRequest(entries: readonly ImageRequestEvidence[], id: string): ImageRequestEvidence[] {
  return entries.filter((entry) => entry.id !== id);
}
