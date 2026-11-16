// rowbadgeundo.ts — apply path for `uploadRowBadges` history entries (I-79).
import { applyState, statesEqual } from "../lib/upload/rowbadge";
import { getRowBadgeState, setRowBadgeState } from "./rowbadgestore";

export function applyRowBadgeState(value: unknown): boolean {
  const next = applyState(value);
  if (next === null || statesEqual(getRowBadgeState(), next)) return false;
  setRowBadgeState(next);
  return true;
}
