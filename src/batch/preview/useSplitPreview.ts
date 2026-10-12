// useSplitPreview.ts — the React side of a preview session (design D3/D9/D10).
// Owns: when a session opens, what triggers a (debounced) replan, the near-viewport
// window, and a throttled progress snapshot. Everything else — the queue, the cache,
// the per-row states, the generations — is lib/previewsession, which knows no React.
// Leaving the Batch tab closes the session and revokes its URLs (D9/RULE 20).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPreviewSession, type SessionSpec } from "../../lib/previewsession";
import { PROGRESS_MS, REPLAN_MS } from "../../lib/previewlimits";
import type { Progress } from "../../lib/previewqueue";
import type { RowStates } from "../../lib/previewstate";
import type { DirHandleLike } from "../../lib/fs";
import type { SplitSettings } from "../../lib/presets";
import type { PreviewDeps } from "./previewdeps";
import { useRowWindow } from "./useRowWindow";

/** What the session needs to know about a row (a subset of the Batch row). */
export interface PreviewableRow {
  relPath: string;
  name: string;
  status: string;
}

export interface PreviewInput {
  /** Visible rows, in the user's own order (filters and sort included). */
  rows: PreviewableRow[];
  /** Checked row ids, lower case, as the Batch selection stores them. */
  checked: string[];
  root: DirHandleLike | null;
  split: SplitSettings;
  deps: PreviewDeps;
}

export interface SplitPreview {
  /** Strips are shown (a session exists; it may have been stopped). */
  open: boolean;
  /** The queue is working right now. */
  running: boolean;
  progress: Progress;
  states: RowStates;
  /** Ids of the rows this session is about (lower case). A row that leaves the
   *  selection loses its strip at once, even before the debounced replan lands. */
  planned: Set<string>;
  start(): void;
  stop(): void;
}

const IDLE: Progress = { done: 0, total: 0, icons: 0 };

export function useSplitPreview(input: PreviewInput): SplitPreview {
  const { rows, checked, root, split, deps } = input;
  const [open, setOpen] = useState(false);
  const [snap, setSnap] = useState<{ running: boolean; progress: Progress }>({ running: false, progress: IDLE });
  const session = useMemo(() => createPreviewSession(deps), [deps]);
  const isNear = useRowWindow(open);
  const selected = useMemo(() => rows.filter((r) => isEligible(r) && isChecked(checked, r)), [rows, checked]);
  const spec = useRef<SessionSpec>({ rows: selected, root, split, near: isNear });
  spec.current = { rows: selected, root, split, near: isNear }; // render-mirror (RULE 24)
  const planKey = `${root?.name ?? ""}#${fingerprintOf(split)}#${selected.map((r) => r.relPath.toLowerCase()).join("\u0000")}`;

  useSnapshot(session, setSnap);
  useLeaving(session);
  usePins(open, session, isNear);
  usePlan(open, planKey, session, spec);
  return {
    open,
    running: snap.running,
    progress: snap.progress,
    states: session.states,
    planned: useMemo(() => new Set(selected.map((r) => r.relPath.toLowerCase())), [selected]),
    start: useCallback(() => setOpen(true), []),
    stop: useCallback(() => session.stop(), [session]),
  };
}

type Session = ReturnType<typeof createPreviewSession>;

/** Progress updates are throttled: a 1000-row run must not re-render per row. */
function useSnapshot(session: Session, setSnap: (s: { running: boolean; progress: Progress }) => void): void {
  useEffect(() => {
    let last = 0;
    let timer = 0;
    const push = () => {
      last = Date.now();
      setSnap({ running: session.isRunning(), progress: session.progress() });
    };
    const off = session.onChange(() => {
      const wait = PROGRESS_MS - (Date.now() - last);
      if (wait <= 0) return push();
      if (!timer) timer = window.setTimeout(() => ((timer = 0), push()), wait);
    });
    return () => {
      off();
      if (timer) window.clearTimeout(timer);
    };
  }, [session, setSnap]);
}

/** Leaving the tab (or the panel) closes the session: strips die with their URLs. */
function useLeaving(session: Session): void {
  useEffect(() => () => session.close(), [session]);
}

/** The viewport moved: only pinning changes, so the results already drawn survive. */
function usePins(open: boolean, session: Session, isNear: (index: number) => boolean): void {
  useEffect(() => {
    if (open) session.setNear(isNear);
  }, [open, session, isNear]);
}

/** A plan change stops the old generation at once and replans after a short pause. */
function usePlan(open: boolean, planKey: string, session: Session, spec: { current: SessionSpec }): void {
  const started = useRef(false);
  useEffect(() => {
    if (!open) {
      started.current = false;
      return;
    }
    if (!started.current) {
      started.current = true;
      session.start(spec.current);
      return;
    }
    const timer = window.setTimeout(() => session.start(spec.current), REPLAN_MS);
    return () => window.clearTimeout(timer);
    // planKey carries rows + settings + root; spec is a live mirror on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, planKey, session]);
}

function fingerprintOf(split: SplitSettings): string {
  return `${split.mergeFrac ?? "auto"}|${split.padding}|${split.size}|${split.transparent}`;
}

function isEligible(r: PreviewableRow): boolean {
  return r.status !== "missing" && r.status !== "deleted";
}

function isChecked(checked: string[], r: PreviewableRow): boolean {
  const id = r.relPath.toLowerCase();
  return checked.some((c) => c.toLowerCase() === id);
}
