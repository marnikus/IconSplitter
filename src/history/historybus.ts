// historybus.ts — the app's ONE history timeline (RULE 12, request §3/§4/§8/§9).
// Module singleton so Undo works from any tab, even while the owning panel is
// not mounted: a mutation path registers an applier, and undo/redo replays an
// entry through that same path. Adapted from
// `Process-Images-in-Areana/app/core/undo_service.py` + `app/persistence/undo_store.py`
// (contracts only; no LICENSE in that repository, so nothing was copied):
// cursor semantics with `-1` = "nothing applied", truncate-on-branch,
// corrupt payload → empty, bounded timeline.
//
// Guarantees:
// * one bulk user command = one entry (features push once per command);
// * an entry whose targets no longer exist is compacted, and the cursor is
//   recomputed by counting survivors, so compaction can never corrupt it;
// * an apply that reports failure leaves the cursor exactly where it was.

import {
  canRedo, canUndo, dropEntries, moveCursor, nextRedo, nextUndo, parseHistory,
  pushEntry, redoLabel, serializeHistory, undoLabel,
  type HistoryDirection, type HistoryDoc, type HistoryEntry,
} from "../lib/history";
import { loadHistoryText, saveHistoryText } from "./historystore";

export interface HistoryApplier {
  /** True while every target of the entry still exists (stale target guard). */
  canApply(entry: HistoryEntry): boolean;
  /** Replays one direction through the canonical mutation path. Atomic. */
  apply(entry: HistoryEntry, dir: HistoryDirection): boolean;
}

export interface HistoryStatus {
  at: number;
  text: string;
  err: boolean;
}

export interface HistorySnapshot {
  doc: HistoryDoc;
  last: HistoryStatus | null;
}

export type HistoryOutcome =
  | { ok: true; entry: HistoryEntry; direction: HistoryDirection; dropped: number }
  | { ok: false; reason: "empty" | "failed"; dropped: number };

const appliers = new Map<string, HistoryApplier>();
const listeners = new Set<() => void>();

let snapshot: HistorySnapshot = { doc: parseHistory(loadHistoryText()), last: null };

export function getHistorySnapshot(): HistorySnapshot {
  return snapshot;
}

export function subscribeHistory(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Features register their applier once, at module load (request §9). */
export function registerApplier(kind: string, applier: HistoryApplier): void {
  appliers.set(kind, applier);
  notify();
}

export function hasApplier(kind: string): boolean {
  return appliers.has(kind);
}

/** Removes an applier (owner unmounted); its entries become compactable. */
export function unregisterApplier(kind: string): void {
  if (appliers.delete(kind)) notify();
}

/** One user command = one call = one entry (bulk rule, request §3). */
export function recordEntry(e: HistoryEntry): void {
  const pruned = compact(snapshot.doc).doc;
  commit({ ...snapshot, doc: pushEntry(pruned, e) });
}

export function undo(): HistoryOutcome {
  return step("undo");
}

export function redo(): HistoryOutcome {
  return step("redo");
}

export function undoEnabled(): boolean {
  return canUndo(snapshot.doc);
}

export function redoEnabled(): boolean {
  return canRedo(snapshot.doc);
}

export function undoText(): string | null {
  return undoLabel(snapshot.doc);
}

export function redoText(): string | null {
  return redoLabel(snapshot.doc);
}

export function nextUndoEntry(): HistoryEntry | null {
  return nextUndo(snapshot.doc);
}

export function nextRedoEntry(): HistoryEntry | null {
  return nextRedo(snapshot.doc);
}

/** Test hook: re-reads storage (registered appliers stay registered). */
export function resetHistoryForTests(): void {
  snapshot = { doc: parseHistory(loadHistoryText()), last: null };
  notify();
}

/** Test hook: forget every registered applier (owner-less entries case). */
export function clearAppliersForTests(): void {
  appliers.clear();
  notify();
}

function step(dir: HistoryDirection): HistoryOutcome {
  const { doc: pruned, dropped } = compact(snapshot.doc);
  const moved = moveCursor(pruned, dir);
  if (!moved) return finish({ ok: false, reason: "empty", dropped }, pruned, dropped, emptyText(dir));
  const applier = appliers.get(moved.entry.kind);
  if (!applier || !applier.apply(moved.entry, dir)) return failed(pruned, dropped, moved.entry);
  return finish({ ok: true, entry: moved.entry, direction: dir, dropped }, moved.doc, dropped, okText(dir, moved.entry));
}

function failed(pruned: HistoryDoc, dropped: number, entry: HistoryEntry): HistoryOutcome {
  // The cursor stays where it was: a failed apply must not shift history (request §4).
  return finish({ ok: false, reason: "failed", dropped }, pruned, dropped, `Could not undo “${entry.label}” — nothing was changed`);
}

function finish(outcome: HistoryOutcome, doc: HistoryDoc, dropped: number, text: string): HistoryOutcome {
  commit({ doc, last: { at: Date.now(), text: dropNote(text, dropped), err: !outcome.ok } });
  return outcome;
}

function commit(next: HistorySnapshot): void {
  snapshot = next;
  saveHistoryText(serializeHistory(snapshot.doc));
  notify();
}

/** Drops entries that can never be applied again and reports how many. */
function compact(doc: HistoryDoc): { doc: HistoryDoc; dropped: number } {
  const stale = doc.entries.filter((e) => !appliers.get(e.kind)?.canApply(e)).map((e) => e.id);
  return stale.length === 0 ? { doc, dropped: 0 } : { doc: dropEntries(doc, stale), dropped: stale.length };
}

function notify(): void {
  listeners.forEach((l) => l());
}

function okText(dir: HistoryDirection, e: HistoryEntry): string {
  return `${dir === "undo" ? "Undid" : "Redid"}: ${e.label}`;
}

function emptyText(dir: HistoryDirection): string {
  return dir === "undo" ? "Nothing to undo" : "Nothing to redo";
}

function dropNote(text: string, dropped: number): string {
  if (dropped === 0) return text;
  const s = dropped === 1 ? "1 older action is" : `${dropped} older actions are`;
  return `${text} · ${s} no longer available`;
}
