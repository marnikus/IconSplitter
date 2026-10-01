// StatusBadge.tsx — review status and file issues as icon + text + colour
// (spec §7, §11): colour alone never carries the meaning, and screen readers
// get the full label.

import type { Decision } from "../lib/reviewfile";
import type { ReviewItem } from "../lib/reviewmerge";
import Glyph, { type GlyphName } from "../ui/Glyph";

export type Issue = "ai-missing" | "source-missing" | "thumbnail-failed";

const STATUS_META: Record<Decision, { label: string; long: string; glyph: GlyphName; cls: string }> = {
  pending: { label: "Pending", long: "Pending review", glyph: "pending", cls: "bg-slate-500/20 text-slate-200" },
  approved: { label: "Approved", long: "Approved", glyph: "approved", cls: "bg-emerald-500/20 text-emerald-200" },
  declined: { label: "Declined", long: "Declined", glyph: "declined", cls: "bg-rose-500/20 text-rose-200" },
};

const ISSUE_META: Record<Issue, string> = {
  "ai-missing": "AI result missing",
  "source-missing": "Original missing",
  "thumbnail-failed": "Thumbnail failed",
};

/** Which file problem a row has, if any; a broken preview wins over a missing side. */
export function issueFor(item: ReviewItem, thumbFailed: boolean): Issue | null {
  if (thumbFailed) return "thumbnail-failed";
  if (item.ai === null) return "ai-missing";
  if (item.source === null) return "source-missing";
  return null;
}

export default function StatusBadge({ status, long = false }: { status: Decision; long?: boolean }) {
  const meta = STATUS_META[status];
  return (
    <span
      data-testid={`status-${status}`}
      data-status={status}
      aria-label={`Review status: ${meta.long}`}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${meta.cls}`}
    >
      <Glyph name={meta.glyph} />
      {long ? meta.long : meta.label}
    </span>
  );
}

export function IssueBadge({ issue }: { issue: Issue }) {
  return (
    <span
      data-testid={`issue-${issue}`}
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-200"
    >
      <Glyph name="warning" />
      {ISSUE_META[issue]}
    </span>
  );
}
