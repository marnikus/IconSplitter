// recovery.ts — what the last session left in flight (prompt 2026-10-05, D6).
// The journal (svg/journal) records every request that had no confirmed outcome
// when the tab was closed, the machine slept or the connection died. This hook
// turns that note into honest UI state: the affected rows come back as
// "unknown" (never as failures — the provider may still be working), together
// with the request id and how long ago it started, and the panel offers ONE
// explicit action: retry those sources through the normal confirmation.
// Nothing is ever resent automatically — a duplicate submission is a duplicate
// charge (RULE 4/23).

import { useCallback, useEffect, useRef, useState } from "react";
import { clearInflight, inflightSummary, loadInflight, type InflightRequest } from "./journal";
import type { SvgRow } from "./types";

export interface Recovery {
  /** Requests still without a confirmed outcome, as the journal left them. */
  requests: InflightRequest[];
  /** The honest one-line note, ids included. */
  note: string;
  /** Source ids the user may deliberately regenerate. */
  ids: string[];
  /** Forgets the note (the user acknowledged it; the provider is not asked). */
  dismiss: () => void;
  /** Opens the normal confirmation for exactly those sources. */
  retry: () => void;
}

/**
 * Reads the journal once and paints its rows. Painted rows keep their status
 * until a rescan rebuilds the row — the banner stays visible either way, so the
 * fact is never silently lost.
 */
export function useInflightRecovery(
  rows: SvgRow[],
  setRowsFn: (fn: (rows: SvgRow[]) => SvgRow[]) => void,
  generate: (ids: string[]) => void,
): Recovery {
  const [requests, setRequests] = useState<InflightRequest[]>(() => loadInflight());
  const latest = useRef({ requests });
  latest.current = { requests };
  usePaintUnknown(rows, requests, setRowsFn);
  return {
    requests,
    note: inflightSummary(requests),
    ids: uniqueIds(requests),
    dismiss: useCallback(() => {
      clearInflight();
      setRequests([]);
    }, []),
    retry: useCallback(() => {
      const ids = uniqueIds(latest.current.requests);
      if (ids.length > 0) generate(ids);
    }, [generate]),
  };
}

/**
 * Marks every row the journal names as unknown. It repaints only while a named
 * row does NOT already say so — which also heals a rescan that rebuilt the row
 * from its sidecar — and then stops, so it can never loop.
 */
function usePaintUnknown(rows: SvgRow[], requests: readonly InflightRequest[], setRowsFn: (fn: (rows: SvgRow[]) => SvgRow[]) => void): void {
  useEffect(() => {
    if (requests.length === 0 || !needsPaint(rows, requests)) return;
    setRowsFn((current) => markUnknown(current, requests));
  }, [rows, requests, setRowsFn]);
}

/** True while any named row has not been told yet that its outcome is unknown. */
function needsPaint(rows: readonly SvgRow[], requests: readonly InflightRequest[]): boolean {
  const named = new Set(uniqueIds(requests));
  return rows.some((row) => named.has(row.source.id) && (row.status !== "unknown" || row.running));
}

/** The affected rows say outcome unknown — never "failed". Pure, so tested. */
export function markUnknown(rows: SvgRow[], requests: readonly InflightRequest[]): SvgRow[] {
  const bySource = new Map<string, InflightRequest>();
  for (const entry of requests) {
    for (const id of entry.sourceIds) if (!bySource.has(id)) bySource.set(id, entry);
  }
  return rows.map((row) => {
    const entry = bySource.get(row.source.id);
    return entry === undefined ? row : { ...row, status: "unknown", running: false, error: unknownNote(entry) };
  });
}

/** One row's honest note: what we do not know, and what was NOT done. */
export function unknownNote(entry: InflightRequest): string {
  const id = entry.requestId ?? "no request id";
  const started = Date.parse(entry.startedAt);
  const ago = Number.isFinite(started) ? ` started ${Math.max(0, Math.round((Date.now() - started) / 1000))}s ago` : "";
  return `outcome unknown — request ${id}${ago}; it has not been resent.`;
}

function uniqueIds(requests: readonly InflightRequest[]): string[] {
  return [...new Set(requests.flatMap((r) => r.sourceIds))];
}
