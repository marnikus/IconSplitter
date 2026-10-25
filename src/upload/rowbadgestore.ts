// rowbadgestore.ts — localStorage IO for SVG-to-upload row badges (I-79).
// Parsing lives in lib/upload/rowbadge; this module is the one writer.

import { EMPTY_ROW_BADGES, parseRowBadgeState, type RowBadgeState } from "../lib/upload/rowbadge";
import { readKey, writeKey } from "../state/safestorage";

export const ROW_BADGES_KEY = "iconSplitter.upload.rowBadges.v1";

const listeners = new Set<() => void>();
let state: RowBadgeState = readState();

export function getRowBadgeState(): RowBadgeState {
  return state;
}

export function subscribeRowBadges(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function setRowBadgeState(next: RowBadgeState): void {
  state = next;
  writeKey(ROW_BADGES_KEY, JSON.stringify(next));
  for (const listener of listeners) listener();
}

export function loadRowBadges(): RowBadgeState {
  state = readState();
  return state;
}

export function resetRowBadges(): void {
  state = EMPTY_ROW_BADGES;
  for (const listener of listeners) listener();
}

function readState(): RowBadgeState {
  const text = readKey(ROW_BADGES_KEY);
  if (!text) return EMPTY_ROW_BADGES;
  try {
    return parseRowBadgeState(JSON.parse(text));
  } catch {
    return EMPTY_ROW_BADGES;
  }
}
