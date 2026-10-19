// listtargets.ts — live source IDs used to validate cross-tab selection undo.

import { pruneRowSelection, sameRowSelection, type RowSelection } from "../lib/reviewselect";

export type CheckableList = "generateSvg" | "upload";

const targets: Record<CheckableList, ReadonlySet<string> | null> = {
  generateSvg: null,
  upload: null,
};

/** A completed scan, including an empty one, replaces the known source set. */
export function rememberListTargets(tab: CheckableList, ids: readonly string[]): void {
  targets[tab] = new Set(ids);
}

/** Before a scan there is no authority; afterwards stale history is refused. */
export function selectionTargetsKnown(tab: CheckableList, selection: RowSelection): boolean {
  const known = targets[tab];
  return known === null || sameRowSelection(selection, pruneRowSelection(selection, known));
}

/** A fresh app session must not inherit a previous root's source set. */
export function resetListTargets(): void {
  targets.generateSvg = null;
  targets.upload = null;
}
