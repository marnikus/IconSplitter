// SvgStyleBar.tsx — image styles in the pinned bar (2026-11-16, styles.ts):
// "Register styles" for the selected rows, and — once any style is known — the
// one switch between the base line-stroke style and every registered style.
import { useStylePrefs } from "./styles";

export default function SvgStyleBar({ checked, onRegister, onStyle }: {
  checked: number; onRegister: () => void; onStyle: (style: string | null) => void;
}) {
  const { styles, active } = useStylePrefs();
  return <div className="svg-bulk-row" data-testid="svg-style-bar">
    <button type="button" className="svg-btn" data-testid="svg-register-styles" disabled={checked === 0} onClick={onRegister}
      title="Look in the selected items' folders for style folders (_colored_wiggle …) with numbered images (_01, _02 …) and register them as that style's variants">
      ◐ Register styles ({checked})</button>
    {styles.length > 0 && <label className="svg-style-switch">STYLE{" "}
      <select data-testid="svg-style-select" value={active ?? ""} onChange={(e) => onStyle(e.target.value === "" ? null : e.target.value)}
        title="Every item that has this style shows its AI source and SVG in it; the rest stay in the base style">
        <option value="">Base · line stroke</option>
        {styles.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
      </select></label>}
  </div>;
}
