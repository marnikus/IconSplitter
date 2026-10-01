// StatusBadge.tsx — review status as text + icon + colour (spec §7, §11):
// colour alone never carries the meaning, and screen readers get the label.

import type { Decision } from "../lib/reviewfile";

const STATUS_META: Record<Decision, { label: string; icon: string; cls: string }> = {
  pending: { label: "Pending", icon: "○", cls: "bg-slate-500/20 text-slate-200" },
  approved: { label: "Approved", icon: "✓", cls: "bg-emerald-500/20 text-emerald-200" },
  declined: { label: "Declined", icon: "✕", cls: "bg-rose-500/20 text-rose-200" },
};

export default function StatusBadge({ status }: { status: Decision }) {
  const meta = STATUS_META[status];
  return (
    <span
      data-testid={`status-${status}`}
      data-status={status}
      aria-label={`Review status: ${meta.label}`}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${meta.cls}`}
    >
      <span aria-hidden="true">{meta.icon}</span>
      {meta.label}
    </span>
  );
}
