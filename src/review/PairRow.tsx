// PairRow.tsx — one review row: thumbnail, file name, relative folder,
// creation date and the status or file-issue badge (spec §2, §10). The row is a
// button, so the whole list is keyboard reachable (spec §11).

import { formatShortDate } from "../lib/reviewformat";
import { displayName, folderLabel } from "../lib/reviewformat";
import type { ReviewItem } from "../lib/reviewmerge";
import Thumb from "../ui/Thumb";
import type { Thumbs } from "../ui/useThumbnails";
import StatusBadge, { IssueBadge, issueFor } from "./StatusBadge";

export interface PairRowProps {
  item: ReviewItem;
  thumbs: Thumbs;
  selected: boolean;
  onOpen: (id: string) => void;
}

export default function PairRow({ item, thumbs, selected, onOpen }: PairRowProps) {
  const thumbPath = item.ai?.relPath ?? item.source?.relPath ?? "";
  const issue = issueFor(item, thumbs.errorFor(thumbPath));
  return (
    <li>
      <button
        type="button"
        data-testid={`review-row-${item.id}`}
        aria-current={selected ? "true" : undefined}
        onClick={() => onOpen(item.id)}
        className={`flex w-full items-center gap-3 rounded-xl border px-2 py-2 text-left transition focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:outline-none ${
          selected ? "border-indigo-400/60 bg-indigo-500/15" : "border-transparent hover:bg-white/[0.06]"
        }`}
      >
        <Thumb relPath={thumbPath} thumbs={thumbs} className="h-11 w-11" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{displayName(item)}</span>
          <span className="block truncate text-xs text-slate-400">{folderLabel(item)}</span>
          <span className="block text-xs text-slate-500">{formatShortDate(item.createdAt)}</span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          {issue ? <IssueBadge issue={issue} /> : <StatusBadge status={item.status} />}
          {issue && item.status !== "pending" && <StatusBadge status={item.status} />}
        </span>
      </button>
    </li>
  );
}
