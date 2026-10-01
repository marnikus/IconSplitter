// SegButton.tsx — the one segmented-control button of the V2 design system.
// The layout switch and the date-mode tabs are the same control, so they share
// one owner instead of two copies (RULE 16.4 — no duplicated logic).

export interface SegButtonProps {
  active: boolean;
  label: string;
  testid: string;
  onClick: () => void;
}

export default function SegButton(p: SegButtonProps) {
  return (
    <button type="button" data-testid={p.testid} onClick={p.onClick} aria-pressed={p.active}
      className={p.active ? "active" : undefined}>
      {p.label}
    </button>
  );
}
