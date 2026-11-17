// InvertButton.tsx — "⇄ Invert" for every list tab's bulk bar (2026-11-06): one
// look per theme, one handle pattern (`<prefix>-invert-selection`). The rule
// itself lives in lib/reviewselect `invertChecked`.

export default function InvertButton({ prefix, look = "svg", onClick }: { prefix: string; look?: "svg" | "v2"; onClick: () => void }) {
  return (
    <button type="button" className={`${look}-btn`} data-testid={`${prefix}-invert-selection`} onClick={onClick}
      title="Invert the selection: every visible row flips (checked ↔ unchecked); checks hidden by filters stay. One undo step.">
      ⇄ Invert
    </button>
  );
}
