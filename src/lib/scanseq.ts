// scanseq.ts — which scan may commit (design D6).
// Owns: the monotonic ticket a scan takes before it may touch any state.
// Overlapping scans are harmless without cancelling the filesystem iteration: a
// scan that is no longer the newest commits nothing at all — no rows, no
// discovery, no checked-id pruning, no index write, no busy flag, no toast.

export interface ScanSeq {
  /** How many scans have started in this panel. */
  started: number;
  /** The newest ticket — the only one allowed to commit. */
  latest: number;
}

export const SCAN_IDLE: ScanSeq = { started: 0, latest: 0 };

/** Takes the next ticket: it is now the newest, any older scan is superseded. */
export function beginScan(s: ScanSeq): { seq: ScanSeq; id: number } {
  const id = s.started + 1;
  return { seq: { started: id, latest: id }, id };
}

/** True while this ticket is still the newest — the permission to commit. */
export function isCurrent(s: ScanSeq, id: number): boolean {
  return id === s.latest;
}
