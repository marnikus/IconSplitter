// BuilderPresets.tsx — the whole sheet design, saved and restored (design §4.2).
//
// A preset is the sheet's *design plus its selection*: the config, the slot ids,
// the locks and the seed. Saving one is the only way to keep a sheet you like
// without exporting it, and applying one is a deliberate act — it replaces the
// sheet on screen, so the button says which preset it is about to apply.
//
// The shipped presets are the reference layouts; they are always listed first and
// cannot be deleted. A user preset over the cap drops the OLDEST, because losing a
// preset you just named would be the worse surprise.

import type { BuilderPreset } from "../lib/builder/preset";
import type { BuilderConfig } from "../lib/builder/defaults";

export interface BuilderPresetsProps {
  builtin: readonly BuilderPreset[];
  user: readonly BuilderPreset[];
  /** The name in the save box. */
  name: string;
  onName: (name: string) => void;
  onSave: () => void;
  onApply: (preset: BuilderPreset) => void;
  onDelete: (name: string) => void;
  /** What the current sheet is called, if it came from a preset. */
  current: string;
  config: BuilderConfig;
}

export default function BuilderPresets(p: BuilderPresetsProps) {
  return (
    <section className="bld-controls" data-testid="builder-presets" aria-label="Saved sheets">
      <h3 className="bld-group-title">Saved sheets</h3>
      <div className="bld-group" data-testid="builder-preset-save">
        <label className="bld-field">
          <span className="bld-label">Save the current sheet as</span>
          <input className="bld-input" data-testid="builder-preset-name" value={p.name} spellCheck={false}
            placeholder="A name you will recognise" onChange={(e) => p.onName(e.target.value)} />
        </label>
        <button type="button" className="svg-btn" data-testid="builder-preset-save-button"
          disabled={p.name.trim() === ""} onClick={p.onSave}>Save</button>
      </div>
      <ul className="bld-list" data-testid="builder-preset-list">
        {[...p.builtin, ...p.user].map((preset) => (
          <PresetRow key={preset.name} preset={preset} current={p.current === preset.name}
            onApply={() => p.onApply(preset)} onDelete={() => p.onDelete(preset.name)} />
        ))}
      </ul>
      <p className="bld-note" data-testid="builder-preset-note">
        A preset keeps the design, the locks and the seed — so applying it brings back the same sheet, not a new one.
      </p>
    </section>
  );
}

/** One preset: what it holds, and the two things you can do with it. */
function PresetRow({ preset, current, onApply, onDelete }: {
  preset: BuilderPreset; current: boolean; onApply: () => void; onDelete: () => void;
}) {
  const a = preset.config.artboard;
  const g = preset.config.grid;
  return (
    <li className="bld-row" data-testid="builder-preset" data-preset={preset.name} data-current={current ? "true" : "false"}>
      <span className="bld-row-name" data-testid="builder-preset-label">{preset.name}</span>
      <span className="bld-row-folder">{a.width}×{a.height} · {g.columns}×{g.rows}</span>
      <button type="button" className="bld-link" data-testid="builder-preset-apply" onClick={onApply}>Apply</button>
      {!preset.builtin && (
        <button type="button" className="bld-link" data-testid="builder-preset-delete"
          aria-label={`Delete ${preset.name}`} onClick={onDelete}>Delete</button>
      )}
    </li>
  );
}
