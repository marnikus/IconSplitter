// ReviewList.tsx — the scrollable review list (spec §2): thumbnail, filename,
// relative folder, creation date and review status per row. Rows are buttons,
// so every item is reachable and openable from the keyboard (spec §11).

import { displayName, folderLabel, formatStamp } from "../lib/reviewformat";
import type { ReviewItem } from "../lib/reviewmerge";
import Thumb from "../ui/Thumb";
import type { Thumbs } from "../ui/useThumbnails";
import StatusBadge from "./StatusBadge";

export interface ReviewListProps {
  items: ReviewItem[];
  emptyNote: string;
  selection: { id: string | null; thumbs: Thumbs };
  onOpen: (id: string) => void;
}

export default function ReviewList({ items, emptyNote, selection, onOpen }: ReviewListProps) {
  if (items.length === 0) {
    return (
      <p data-testid="review-empty" className="panel grid place-items-center p-8 text-center text-sm text-slate-400">
        {emptyNote}
      </p>
    );
  }
  return (
    <ul data-testid="review-list" className="max-h-[34rem] space-y-1 overflow-y-auto pr-1">
      {items.map((item) => <Row key={item.id} item={item} selection={selection} onOpen={onOpen} />)}
    </ul>
  );
}

function Row({ item, selection, onOpen }: { item: ReviewItem; selection: ReviewListProps["selection"]; onOpen: (id: string) => void }) {
  const thumbPath = item.ai?.relPath ?? item.source?.relPath ?? "";
  return (
    <li>
      <button
        type="button"
        data-testid={`review-row-${item.id}`}
        aria-current={selection.id === item.id ? "true" : undefined}
        onClick={() => onOpen(item.id)}
        className={`flex w-full items-center gap-3 rounded-xl border px-2 py-1.5 text-left transition focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:outline-none ${
          selection.id === item.id ? "border-indigo-400/60 bg-indigo-500/10" : "border-white/5 bg-white/[0.03] hover:bg-white/[0.07]"
        }`}
      >
        <Thumb relPath={thumbPath} thumbs={selection.thumbs} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{displayName(item)}{<SideNotes item={item} />}</span>
          <span className="block truncate text-xs text-slate-400">
            {folderLabel(item)} · {formatStamp(item.createdAt)}
          </span>
        </span>
        <StatusBadge status={item.status} />
      </button>
    </li>
  );
}

/** Unpaired sides are spelled out per row (spec §10), never colour-only. */
function SideNotes({ item }: { item: ReviewItem }) {
  return (
    <>
      {item.ai === null && <span className="ml-2 text-xs font-normal text-amber-300">⚠ AI result missing</span>}
      {item.source === null && <span className="ml-2 text-xs font-normal text-amber-300">⚠ Original missing</span>}
    </>
  );
}
