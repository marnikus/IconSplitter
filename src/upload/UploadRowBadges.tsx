// UploadRowBadges.tsx — chips on one upload row plus a per-row toggle menu (I-79).
import { useState, type MouseEvent } from "react";
import { knownBadges, type RowBadge, type RowBadgeState } from "../lib/upload/rowbadge";

export interface RowBadgesProps {
  pairId: string;
  state: RowBadgeState;
  onToggle: (pairId: string, badgeId: string) => void;
  onRemoveSelected: (badgeId: string) => void;
}

export default function UploadRowBadges({ pairId, state, onToggle, onRemoveSelected }: RowBadgesProps) {
  const applied = knownBadges(state, pairId);
  return (
    <div className="up-rowbadges" data-testid={`upload-rowbadges-${pairId}`} onClick={(e) => e.stopPropagation()}>
      {applied.map((badge) => (
        <button key={badge.id} type="button" className="up-rowbadge-chip" style={chipStyle(badge)}
          data-testid={`upload-rowbadge-chip-${pairId}-${badge.id}`}
          title={`Remove ${badge.name}; Ctrl-click removes it from all checked rows`}
          onClick={(event) => handleChipClick(event, { pairId, badgeId: badge.id, onToggle, onRemoveSelected })}>
          {badge.name}
        </button>
      ))}
      {state.catalog.length > 0 && <ToggleMenu pairId={pairId} state={state} onToggle={onToggle} />}
    </div>
  );
}

function ToggleMenu({ pairId, state, onToggle }: Pick<RowBadgesProps, "pairId" | "state" | "onToggle">) {
  const [open, setOpen] = useState(false);
  return (
    <div className="up-rowbadge-menu">
      <button type="button" className="svg-btn tiny" data-testid={`upload-rowbadge-toggle-${pairId}`}
        aria-expanded={open} onClick={() => setOpen((v) => !v)}>+ Badge</button>
      {open && (
        <ul className="up-rowbadge-pop" data-testid={`upload-rowbadge-pop-${pairId}`}>
          {state.catalog.map((badge) => (
            <li key={badge.id}>
              <button type="button" className="up-rowbadge-option" style={chipStyle(badge)}
                data-testid={`upload-rowbadge-option-${pairId}-${badge.id}`}
                aria-pressed={knownBadges(state, pairId).some((b) => b.id === badge.id)}
                onClick={() => onToggle(pairId, badge.id)}>
                {badge.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface ChipClick {
  pairId: string; badgeId: string;
  onToggle: RowBadgesProps["onToggle"]; onRemoveSelected: RowBadgesProps["onRemoveSelected"];
}

function handleChipClick(event: MouseEvent<HTMLButtonElement>, action: ChipClick): void {
  event.stopPropagation();
  if (event.button !== 0) return;
  if (event.ctrlKey) action.onRemoveSelected(action.badgeId);
  else action.onToggle(action.pairId, action.badgeId);
}

function chipStyle(badge: RowBadge): { background: string; borderColor: string } {
  return { background: badge.color + "33", borderColor: badge.color };
}
