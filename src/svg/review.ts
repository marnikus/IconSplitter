// review.ts — per-version review writes and history re-application. Each source
// keeps its own sidecar; a failed bulk write rolls already-written files back.

import { loadHandles } from "../batch/store";
import type { DirHandleLike } from "../lib/fs";
import { SELECTION_HANDLE_KEY } from "../selection/offline";
import { notifySvgChanges } from "./events";
import { isSvgSourceRunning } from "./run/registry";
import { loadSidecar, saveSidecar } from "./sidecar";
import type { SvgReviewDecision } from "./types";

export interface SvgReviewChange {
  sourceId: string;
  sourcePath: string;
  version: number;
  before: SvgReviewDecision;
  beforeAt: string | null;
  after: SvgReviewDecision;
  afterAt: string | null;
}

interface SidecarBackup {
  sourceId: string;
  sourcePath: string;
  value: NonNullable<Awaited<ReturnType<typeof loadSidecar>>["value"]>;
}

export async function writeSvgReviewChanges(root: DirHandleLike, changes: SvgReviewChange[], side: "before" | "after"): Promise<boolean> {
  const groups = groupChanges(changes);
  const backups: SidecarBackup[] = [];
  for (const group of groups) {
    if (isSvgSourceRunning(group.sourceId)) return rollback(root, backups);
    const loaded = await loadSidecar(root, group.sourceId, group.sourcePath);
    if (loaded.state !== "ok" || !loaded.value) return rollback(root, backups);
    const updated = changeVersions(loaded.value, group.changes, side);
    if (!updated || isSvgSourceRunning(group.sourceId)) return rollback(root, backups);
    backups.push({ sourceId: group.sourceId, sourcePath: group.sourcePath, value: loaded.value });
    try {
      await saveSidecar(root, updated);
    } catch {
      return rollback(root, backups);
    }
  }
  notifySvgChanges();
  return true;
}

export async function applySvgReviewHistory(raw: unknown): Promise<boolean> {
  const side = historySide(raw);
  const changes = parseChanges(raw);
  const root = (await loadHandles(SELECTION_HANDLE_KEY))?.source ?? null;
  if (!root || !changes || !side) return false;
  return writeSvgReviewChanges(root, changes, side);
}

function targetReview(change: SvgReviewChange, side: "before" | "after"): { decision: SvgReviewDecision; at: string | null } {
  return side === "before" ? { decision: change.before, at: change.beforeAt }
    : { decision: change.after, at: change.afterAt };
}

interface Group {
  sourceId: string;
  sourcePath: string;
  changes: SvgReviewChange[];
}

function groupChanges(changes: SvgReviewChange[]): Group[] {
  const groups = new Map<string, Group>();
  for (const change of changes) {
    const key = `${change.sourceId}\u0000${change.sourcePath}`;
    const group = groups.get(key) ?? { sourceId: change.sourceId, sourcePath: change.sourcePath, changes: [] };
    group.changes.push(change);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function changeVersions(sidecar: SidecarBackup["value"], changes: SvgReviewChange[], side: "before" | "after") {
  const byVersion = new Map(changes.map((change) => [change.version, targetReview(change, side)]));
  let applied = 0;
  const versions = sidecar.versions.map((version) => {
    const target = byVersion.get(version.version);
    if (!target) return version;
    applied++;
    return { ...version, review: target.decision, reviewedAt: target.at };
  });
  return applied === changes.length ? { ...sidecar, versions, updatedAt: new Date().toISOString() } : null;
}

async function rollback(root: DirHandleLike, backups: SidecarBackup[]): Promise<boolean> {
  let restored = true;
  for (const backup of backups.reverse()) {
    try { await saveSidecar(root, backup.value); } catch { restored = false; }
  }
  if (!restored) notifySvgChanges();
  return false;
}

function historySide(raw: unknown): "before" | "after" | null {
  if (typeof raw !== "object" || raw === null) return null;
  const side = (raw as { side?: unknown }).side;
  return side === "before" || side === "after" ? side : null;
}

function parseChanges(raw: unknown): SvgReviewChange[] | null {
  if (typeof raw !== "object" || raw === null || !Array.isArray((raw as { changes?: unknown }).changes)) return null;
  const changes = (raw as { changes: unknown[] }).changes.map(toChange);
  return changes.some((change) => change === null) ? null : changes as SvgReviewChange[];
}

function toChange(raw: unknown): SvgReviewChange | null {
  if (typeof raw !== "object" || raw === null) return null;
  const item = raw as Record<string, unknown>;
  const decisions = ["pending", "approved", "declined"];
  if (typeof item.sourceId !== "string" || typeof item.sourcePath !== "string" || !Number.isInteger(item.version)) return null;
  if (!decisions.includes(String(item.before)) || !decisions.includes(String(item.after))) return null;
  return {
    sourceId: item.sourceId, sourcePath: item.sourcePath, version: Number(item.version),
    before: item.before as SvgReviewDecision, beforeAt: nullableIso(item.beforeAt),
    after: item.after as SvgReviewDecision, afterAt: nullableIso(item.afterAt),
  };
}

function nullableIso(value: unknown): string | null {
  return value === null || typeof value === "string" ? value : null;
}
