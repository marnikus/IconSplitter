// Four independent margins share the existing padding-group inheritance/pin.
import { compactPadding, paddingSides, PADDING_SIDES, type PaddingSide } from "../lib/upload/padding";
import { clampPaddingPct, PADDING_DEFAULT, PADDING_MAX, PADDING_MIN } from "../lib/upload/settings";
import { change, Marker, type SettingsFieldProps } from "./settingsfield";

export default function UploadPaddingSetting({ p, effective }: SettingsFieldProps) {
  const value = effective.paddingPct;
  const sides = paddingSides(value ?? PADDING_DEFAULT);
  const edit = (side: PaddingSide, raw: string) => change(p, "paddingPct", compactPadding({ ...sides, [side]: clampPaddingPct(Number(raw)) }));
  return (
    <div className="svg-field up-set-field" data-testid="upload-set-padding-group">
      <span className="svg-label">Padding %<Marker p={p} field="paddingPct" testid="padding" /></span>
      <button type="button" className={`svg-btn tiny up-default-btn${value === null ? " on" : ""}`} data-testid="upload-set-padding-default"
        aria-pressed={value === null} onClick={() => change(p, "paddingPct", value === null ? PADDING_DEFAULT : null)}>Default</button>
      <div className="up-padding-sides">
        {PADDING_SIDES.map((side) => {
          const label = side[0].toUpperCase() + side.slice(1);
          const id = `upload-set-padding-${side}`;
          return <label className="svg-field" htmlFor={id} key={side}>
            <span className="svg-label">{label}</span>
            <input id={id} className="svg-input" data-testid={id} type="number" aria-label={`${label} padding %`}
              min={PADDING_MIN} max={PADDING_MAX} step={1} value={value === null ? "" : sides[side]} placeholder="default"
              onChange={(e) => edit(side, e.target.value)} />
          </label>;
        })}
      </div>
      <small className="up-hint">{value === null ? "default — the SVG's own margins; editing a side starts the others at 8%"
        : "each side: % of the artwork's largest side, or the artboard's largest side when pinned"}</small>
    </div>
  );
}
