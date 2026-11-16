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
  checked: number; onRegister: () => void; onStyle: (style: string | null) => void;
}) {
  const { styles, active } = useStylePrefs();
  return <span className="svg-style-bar" data-testid="svg-style-bar">
    <button type="button" className="svg-btn" data-testid="svg-register-styles" disabled={checked === 0} onClick={onRegister}
      title="Look in the selected items' folders for style folders (_colored_wiggle …) with numbered images (_01, _02 …) and register them as that style's variants">
      ◐ Register styles ({checked})</button>
    {styles.length > 0 && <StyleMenu styles={styles} active={active} onStyle={onStyle} />}
  </span>;
}

function StyleMenu({ styles, active, onStyle }: { styles: string[]; active: string | null; onStyle: (style: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);
  const close = useRef(() => setOpen(false)).current;
  useDismiss(box, open, close);
  const pick = (s: string | null) => { setOpen(false); if (s !== active) onStyle(s); };
  return <div className="svg-style-switch" ref={box}>
    <span className="svg-style-label">STYLE</span>
    <button type="button" className={`svg-style-trigger${active === null ? "" : " is-style"}`} data-testid="svg-style-select"
      aria-haspopup="listbox" aria-expanded={open} title="Every item that has this style shows its AI source and SVG in it; the rest stay in the base style"
      onClick={() => setOpen((o) => !o)}>
      <span className="svg-style-dot" aria-hidden="true" />{nameOf(active)}<span className="svg-style-caret" aria-hidden="true">▾</span>
    </button>
    {open && <div className="svg-style-menu" role="listbox" data-testid="svg-style-menu">
      {[null, ...styles].map((s) => <button type="button" role="option" aria-selected={s === active} key={s ?? "base"}
        className={`svg-style-option${s === active ? " is-active" : ""}${s === null ? " is-base" : ""}`} data-testid={`svg-style-opt-${s ?? "base"}`}
        onClick={() => pick(s)}>
        <span className="svg-style-check" aria-hidden="true">{s === active ? "✓" : ""}</span>{nameOf(s)}
      </button>)}
    </div>}
  </div>;
}
