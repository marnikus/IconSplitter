// One endpoint policy shared by global defaults and direct row edits.
import { parseStrokeLinecap } from "../lib/upload/strokecaps";
import { change, Marker, type SettingsFieldProps } from "./settingsfield";

export default function UploadStrokeCapsSetting({ p, effective }: SettingsFieldProps) {
  return (
    <div className="svg-field up-set-field">
      <label className="svg-label" htmlFor="upload-set-linecap">Stroke endpoints<Marker p={p} field="strokeLinecap" testid="linecap" /></label>
      <select id="upload-set-linecap" className="svg-input" data-testid="upload-set-linecap" value={effective.strokeLinecap}
        onChange={(e) => {
          const cap = parseStrokeLinecap(e.target.value);
          if (cap !== null) change(p, "strokeLinecap", cap);
        }}>
        <option value="source">Keep source</option>
        <option value="butt">Cut (butt)</option>
        <option value="round">Rounded</option>
      </select>
      <small className="up-hint">All strokes in the preview, SVG, JPEG and EPS, including decorations; applied before stroke expansion.</small>
    </div>
  );
}
