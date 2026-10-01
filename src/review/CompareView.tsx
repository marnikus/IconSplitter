// CompareView.tsx — the comparison window (spec §5, §6): Original next to the
// AI result, both large and aspect-preserving, each labelled with dimensions,
// format, size and path. Approve / Decline sit above the AI result; A and D are
// the hotkeys; Esc closes and the arrows walk the review list (keyboard first,
// spec §11). The component is presentational — the panel owns the data.

import { useEffect, useRef, type ReactNode, type Ref } from "react";
import { hotkeyAction, type HotkeyAction } from "../lib/reviewkeys";
import { dimensions, displayName, folderLabel, formatBytes, formatStamp } from "../lib/reviewformat";
import type { Decision } from "../lib/reviewfile";
import type { ReviewItem } from "../lib/reviewmerge";
import StatusBadge from "./StatusBadge";

export interface SideInfo {
  relPath: string;
  width: number;
  height: number;
  size: number;
  format: string;
}

/** One side as loaded for the comparison window; null side = missing on disk. */
export interface SideView {
  info: SideInfo | null;
  url: string | null;
  error: string | null;
}

export interface CompareActions {
  decide: (decision: Decision) => void;
  close: () => void;
  prev: () => void;
  next: () => void;
  openPath: (relPath: string) => void;
}

export interface CompareProps {
  item: ReviewItem;
  position: { index: number; total: number; root: string };
  sides: { source: SideView | null; ai: SideView | null; busy: boolean };
  actions: CompareActions;
}

export default function CompareView({ item, position, sides, actions }: CompareProps) {
  const approveRef = useRef<HTMLButtonElement>(null);
  useHotkeys(actions);
  useEffect(() => { approveRef.current?.focus(); }, [item.id]); // keyboard-first window
  return (
    <div data-testid="compare-view" className="fixed inset-0 z-40 grid place-items-center bg-slate-950/70 p-2 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Image comparison"
        className="flex max-h-full w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-2xl"
      >
        <Head item={item} position={position} close={actions.close} />
        <Body item={item} position={position} sides={sides} actions={actions} approveRef={approveRef} />
        <Foot item={item} busy={sides.busy} />
      </div>
    </div>
  );
}

interface BodyProps {
  item: ReviewItem;
  position: CompareProps["position"];
  sides: CompareProps["sides"];
  actions: CompareActions;
  approveRef: Ref<HTMLButtonElement>;
}

/** Original and AI result side by side, both panes the same size (spec §5). */
function Body({ item, position, sides, actions, approveRef }: BodyProps) {
  const shared = { rootName: position.root, openPath: actions.openPath };
  return (
    <div className="grid flex-1 gap-3 overflow-y-auto p-4 lg:grid-cols-2">
      <Pane title="Original" side={sides.source} missingNote="Original missing" {...shared} />
      <Pane
        title="AI result"
        side={sides.ai}
        missingNote="AI result missing"
        header={<DecisionButtons item={item} decide={actions.decide} approveRef={approveRef} />}
        {...shared}
      />
    </div>
  );
}

function Head({ item, position, close }: { item: ReviewItem; position: CompareProps["position"]; close: () => void }) {
  return (
    <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{displayName(item)}</p>
        <p className="truncate text-xs text-slate-400">
          {position.index} / {position.total} · {folderLabel(item)} · {formatStamp(item.createdAt)}
        </p>
      </div>
      <StatusBadge status={item.status} />
      <button type="button" data-testid="compare-close" className="btn-ghost" aria-label="Close comparison" onClick={close}>
        ✕ Close
      </button>
    </header>
  );
}

/** Two clear decisions above the AI result (spec §6); re-deciding is allowed. */
function DecisionButtons({ item, decide, approveRef }: { item: ReviewItem; decide: (decision: Decision) => void; approveRef: Ref<HTMLButtonElement> }) {
  return (
    <div className="ml-auto flex gap-2">
      <button
        type="button"
        ref={approveRef}
        data-testid="review-approve"
        aria-pressed={item.status === "approved"}
        onClick={() => decide("approved")}
        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:outline-none"
      >
        ✓ Approve
      </button>
      <button
        type="button"
        data-testid="review-decline"
        aria-pressed={item.status === "declined"}
        onClick={() => decide("declined")}
        className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-rose-500 focus-visible:ring-2 focus-visible:ring-rose-300 focus-visible:outline-none"
      >
        ✕ Decline
      </button>
    </div>
  );
}

interface PaneProps {
  title: string;
  side: SideView | null;
  missingNote: string;
  rootName: string;
  openPath: (relPath: string) => void;
  header?: ReactNode;
}

function Pane({ title, side, missingNote, rootName, openPath, header }: PaneProps) {
  return (
    <section
      data-testid={title === "Original" ? "compare-original" : "compare-ai"}
      className="flex flex-col rounded-xl border border-white/10 bg-white/[0.03] p-3"
    >
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-xs font-semibold tracking-wide text-slate-300 uppercase">{title}</h3>
        {header}
      </div>
      <div className="grid h-72 place-items-center overflow-hidden rounded-lg bg-slate-950/60 lg:h-96">
        {side?.url
          ? <img src={side.url} alt={`${title} preview`} className="h-full w-full object-contain" />
          : <PaneNote side={side} missingNote={missingNote} />}
      </div>
      {side?.info && <MetaLine info={side.info} rootName={rootName} openPath={openPath} />}
    </section>
  );
}

function PaneNote({ side, missingNote }: { side: SideView | null; missingNote: string }) {
  if (side?.error) return <p className="p-4 text-center text-sm text-rose-300">{side.error}</p>;
  if (!side) return <p className="p-4 text-center text-sm text-amber-300">⚠ {missingNote}</p>;
  return <p className="animate-pulse p-4 text-center text-sm text-slate-400">Loading preview…</p>;
}

function MetaLine({ info, rootName, openPath }: { info: SideInfo; rootName: string; openPath: (relPath: string) => void }) {
  return (
    <div className="mt-2 space-y-1 text-xs text-slate-400">
      <p>{dimensions(info.width, info.height)} · {info.format} · {formatBytes(info.size)}</p>
      <p title={info.relPath} className="truncate">{rootName ? `${rootName}/${info.relPath}` : info.relPath}</p>
      <button
        type="button"
        className="btn-mini"
        title="Opening Explorer is impossible from a browser — this copies the full path"
        onClick={() => openPath(info.relPath)}
      >
        Open in File Explorer
      </button>
    </div>
  );
}

function Foot({ item, busy }: { item: ReviewItem; busy: boolean }) {
  return (
    <footer className="flex flex-wrap items-center gap-3 border-t border-white/10 px-4 py-2 text-xs text-slate-400">
      <StatusBadge status={item.status} />
      <span>A approve · D decline · ← → previous/next · Esc close</span>
      {busy && <span className="ml-auto animate-pulse text-slate-300">Reading image details…</span>}
    </footer>
  );
}

function useHotkeys(actions: CompareActions): void {
  const latest = useRef(actions);
  latest.current = actions;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => runAction(hotkeyAction(e.key, targetTag(e)), e, latest.current);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

function runAction(action: HotkeyAction | null, e: KeyboardEvent, actions: CompareActions): void {
  if (!action) return;
  e.preventDefault();
  if (action === "approve") return actions.decide("approved");
  if (action === "decline") return actions.decide("declined");
  if (action === "next") return actions.next();
  if (action === "prev") return actions.prev();
  actions.close();
}

function targetTag(e: KeyboardEvent): string {
  const target = e.target as HTMLElement | null;
  return target?.tagName ?? "";
}
