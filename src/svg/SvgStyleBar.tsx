// SvgStyleBar.tsx — image styles in the pinned bar (2026-11-16, styles.ts):
// "Register styles" for the selected rows, and — once any style is known — the
// one switch between the base line-stroke style and every registered style.
// The switch is the app's own dark menu (like the list filters), never the
// browser's white native list. Handles: `svg-style-select` (button),
// `svg-style-menu`, `svg-style-opt-<style>` (`svg-style-opt-base`).
import { useRef, useState } from "react";
import { useDismiss } from "../ui/usedismiss";
import { useStylePrefs } from "./styles";

const nameOf = (s: string | null) => (s === null ? "Base · line stroke" : s.replace(/_/g, " "));

export default function SvgStyleBar({ checked, onRegister, onStyle }: {
  checked: number; onRegister: () => void; onStyle: (style: string | null, showAll?: boolean) => void;
}) {
  const { styles, active, showAll } = useStylePrefs();
  return <span className="svg-style-bar" data-testid="svg-style-bar">
    <button type="button" className="svg-btn" data-testid="svg-register-styles" disabled={checked === 0} onClick={onRegister}
      title="Look in the selected items' folders for style folders (_colored_wiggle …) with numbered images (_01, _02 …) and register them as that style's variants">
      ◐ Register styles ({checked})</button>
    {styles.length > 0 && <StyleMenu styles={styles} active={active} showAll={showAll} onStyle={onStyle} />}
  </span>;
}

function StyleMenu({ styles, active, showAll, onStyle }: { styles: string[]; active: string | null; showAll: boolean; onStyle: (style: string | null, showAll?: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);
  const close = useRef(() => setOpen(false)).current;
  useDismiss(box, open, close);
  const pick = (s: string | null, allStyles = false) => { setOpen(false); if (allStyles !== showAll || s !== active) onStyle(s, allStyles); };
  return <div className="svg-style-switch" ref={box}>
    <span className="svg-style-label">STYLE</span>
    <button type="button" className={`svg-style-trigger${active !== null || showAll ? " is-style" : ""}`} data-testid="svg-style-select"
      aria-haspopup="listbox" aria-expanded={open} title="Review each style separately, or show only the selected style"
      onClick={() => setOpen((o) => !o)}>
      <span className="svg-style-dot" aria-hidden="true" />{showAll ? "All styles · separate rows" : nameOf(active)}<span className="svg-style-caret" aria-hidden="true">▾</span>
    </button>
    {open && <div className="svg-style-menu" role="listbox" data-testid="svg-style-menu">
      <button type="button" role="option" aria-selected={showAll} key="all"
        className={`svg-style-option${showAll ? " is-active" : ""}`} data-testid="svg-style-opt-all" onClick={() => pick(active, true)}>
        <span className="svg-style-check" aria-hidden="true">{showAll ? "✓" : ""}</span>All styles · separate rows
      </button>
      {[null, ...styles].map((s) => <button type="button" role="option" aria-selected={!showAll && s === active} key={s ?? "base"}
        className={`svg-style-option${!showAll && s === active ? " is-active" : ""}${s === null ? " is-base" : ""}`} data-testid={`svg-style-opt-${s ?? "base"}`}
        onClick={() => pick(s)}>
        <span className="svg-style-check" aria-hidden="true">{!showAll && s === active ? "✓" : ""}</span>{nameOf(s)}
      </button>)}
    </div>}
  </div>;
}
