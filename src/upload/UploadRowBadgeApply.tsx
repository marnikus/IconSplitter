// UploadRowBadgeApply.tsx — bulk apply a catalog badge to the selection (I-79).
import { useState } from "react";
import { badgesOf, type RowBadge, type RowBadgeState } from "../lib/upload/rowbadge";

export interface BadgeApplyProps {
  state: RowBadgeState;
  ids: string[];
  onApply: (ids: string[], badgeId: string) => void;
}

export default function UploadRowBadgeApply({ state, ids, onApply }: BadgeApplyProps) {
  const [open, setOpen] = useState(false);
  const disabled = ids.length === 0 || state.catalog.length === 0;
  return (
    <div className="up-rowbadge-apply">
      <button type="button" className="svg-btn" data-testid="upload-rowbadge-apply" disabled={disabled}
        aria-expanded={open}
        title={titleOf(ids.length, state.catalog.length)}
        onClick={() => setOpen((v) => !v)}>
        Apply badges
      </button>
      {open && !disabled && (
        <ul className="up-rowbadge-pop" data-testid="upload-rowbadge-apply-list">
          {state.catalog.map((badge) => (
            <li key={badge.id}>
              <button type="button" className="up-rowbadge-option" style={chipStyle(badge)}
                data-testid={`upload-rowbadge-apply-${badge.id}`}
                onClick={() => { onApply(ids, badge.id); setOpen(false); }}>
                {badge.name}{mark(state, ids, badge.id)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function titleOf(selected: number, catalog: number): string {
  if (catalog === 0) return "Add badges in Badge settings first";
  if (selected === 0) return "Select icons first";
  return `Toggle a badge on ${selected} selected icon${selected === 1 ? "" : "s"}`;
}

function mark(state: RowBadgeState, ids: string[], badgeId: string): string {
  const n = ids.filter((id) => badgesOf(state, id).includes(badgeId)).length;
  if (n === 0) return "";
  if (n === ids.length) return " · all";
  return " · mixed";
}

function chipStyle(badge: RowBadge): { background: string; borderColor: string } {
  return { background: badge.color + "33", borderColor: badge.color };
}
