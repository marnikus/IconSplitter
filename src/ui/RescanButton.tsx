// RescanButton.tsx — the one Rescan button every folder tab shares (2026-11-28).
// After a reload the browser hands a remembered folder back without read
// access; only a click may ask for it. So the same button turns into
// "🔓 Restore access" while the folder is locked, in every tab alike — the
// tab's rescan action asks the browser first (state/tabroot `openTabRoot`).

import { useEffect, useState, useSyncExternalStore } from "react";
import type { DirHandleLike } from "../lib/fs";
import { rootAccess, rootAccessRevision, subscribeRootAccess } from "../state/tabroot";

/**
 * Is the folder waiting for the browser's OK? Checked again whenever the folder,
 * the busy text or `signal` changes, and whenever any tab asked the browser for access.
 */
export function useRootLocked(root: DirHandleLike | null, busy: string | null, signal?: unknown): boolean {
  const [locked, setLocked] = useState(false);
  const asked = useSyncExternalStore(subscribeRootAccess, rootAccessRevision, rootAccessRevision);
  useEffect(() => {
    let alive = true;
    if (root === null) { setLocked(false); return; }
    void rootAccess(root).then((access) => { if (alive) setLocked(access === "locked"); });
    return () => { alive = false; };
  }, [root, busy, signal, asked]);
  return locked;
}

export interface RescanButtonProps {
  root: DirHandleLike | null;
  /** The running scan's text (shown on the button, which is then disabled), or null. */
  busy: string | null;
  onClick: () => void;
  testid: string;
  /** The idle label; "↻ Rescan" unless the tab names what it rescans. */
  label?: string;
  className?: string;
  /** Anything whose change may mean the access changed (a scan result). */
  signal?: unknown;
}

const LOCKED_TITLE = "The browser re-opens a remembered folder only after a click — this asks it, then scans";

export default function RescanButton({ root, busy, onClick, testid, label = "↻ Rescan", className = "svg-btn", signal }: RescanButtonProps) {
  const locked = useRootLocked(root, busy, signal);
  const text = busy !== null ? busy : locked ? "🔓 Restore access" : label;
  const cls = locked && !className.includes("primary") ? `${className} primary` : className;
  return (
    <button type="button" className={cls} data-testid={testid} data-locked={locked ? "true" : undefined}
      disabled={busy !== null} onClick={onClick} title={locked ? LOCKED_TITLE : undefined}>
      {text}
    </button>
  );
}
