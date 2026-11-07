// BuilderRecipe.tsx — how the sheet picks its icons (design §5.3): the mode, the
// filters that mode uses, the threshold, the seed, and the two actions that make a
// sheet — re-roll and clear.
//
// The copy is honest about what the numbers mean: a shortfall says how many cells
// could not be filled, a stale lock is named, and the "repeat icons" switch is a
// deliberate opt-in because a repeated glyph is a design decision, not a fallback
// the app may take on its own.

import type { BuilderIcon } from "../lib/builder/rows";
import type { SessionBuilderRecipe } from "../lib/session";
import type { SelectionResult } from "../lib/builder/select";

export interface BuilderRecipeProps {
  recipe: SessionBuilderRecipe;
  seed: number;
  /** The last result, so the copy can report a shortfall or a stale lock. */
  result: SelectionResult | null;
  /** Every icon the library has, for the folder/tag choices. */
  folders: readonly string[];
  tags: readonly string[];
  onChange: (patch: Partial<SessionBuilderRecipe>) => void;
  onReroll: () => void;
  onClear: () => void;
  onSeed: (seed: number) => void;
}

const MODES = [
  { value: "similar", text: "Similar to a reference", hint: "Ranks by shared tags" },
  { value: "filtered", text: "Filtered", hint: "One folder and/or tag" },
  { value: "random", text: "Random", hint: "Seed decides" },
] as const;

export default function BuilderRecipe(p: BuilderRecipeProps) {
  return (
    <section className="bld-controls" data-testid="builder-recipe" aria-label="Icon recipe">
      <div className="bld-group" data-testid="builder-recipe-mode-group">
        <h3 className="bld-group-title">Recipe</h3>
        <label className="bld-field bld-field-wide">
          <span className="bld-label">Mode</span>
          <select className="bld-input" data-testid="builder-recipe-mode" value={p.recipe.mode}
            onChange={(e) => p.onChange({ mode: e.target.value as SessionBuilderRecipe["mode"] })}>
            {MODES.map((m) => <option key={m.value} value={m.value}>{m.text}</option>)}
          </select>
        </label>
        <ModeFields {...p} />
        <Num id="builder-seed" label="Seed" value={p.seed} min={1} max={MAX_SEED}
          onChange={(seed) => p.onSeed(Math.max(1, seed))} />
      </div>
      <div className="bld-recipe-actions">
        <button type="button" className="svg-btn" data-testid="builder-reroll" onClick={p.onReroll}>
          ↻ New sheet
        </button>
        <button type="button" className="bld-link" data-testid="builder-clear" onClick={p.onClear}>
          Clear cells
        </button>
      </div>
      <RecipeNote result={p.result} mode={p.recipe.mode} />
    </section>
  );
}

/** The fields the chosen mode actually uses — nothing is shown that does nothing. */
function ModeFields(p: BuilderRecipeProps) {
  if (p.recipe.mode === "similar") {
    return <Num id="builder-threshold" label="Match %" value={p.recipe.threshold} min={0} max={100}
      onChange={(threshold) => p.onChange({ threshold })} />;
  }
  if (p.recipe.mode !== "filtered") return null;
  return (
    <>
      <Pick id="builder-recipe-folder" label="Folder" value={p.recipe.folder}
        options={[{ value: "", text: "All folders" }, ...p.folders.map((f) => ({ value: f, text: f === "" ? "root" : f }))]}
        onChange={(folder) => p.onChange({ folder })} />
      <Pick id="builder-recipe-tag" label="Tag" value={p.recipe.tag}
        options={[{ value: "", text: "All tags" }, ...p.tags.map((t) => ({ value: t, text: t }))]}
        onChange={(tag) => p.onChange({ tag })} />
    </>
  );
}

/** What the last selection actually achieved — said, not implied. */
function RecipeNote({ result, mode }: { result: SelectionResult | null; mode: SessionBuilderRecipe["mode"] }) {
  if (result === null) {
    return <p className="bld-note" data-testid="builder-recipe-note">Press “New sheet” to fill the cells.</p>;
  }
  return (
    <p className="bld-note" data-testid="builder-recipe-note">
      {noteText(result, mode)}
    </p>
  );
}

/** One sentence: shortfall, repetition, stale locks and the scoring basis. */
function noteText(result: SelectionResult, mode: SessionBuilderRecipe["mode"]): string {
  const parts: string[] = [];
  if (result.shortfall > 0) parts.push(`${result.shortfall} cell${result.shortfall === 1 ? "" : "s"} could not be filled — the library is smaller than the sheet`);
  else parts.push("Every cell is filled");
  if (result.repeated) parts.push("icons repeat to fill the sheet");
  if (result.staleLocks.length > 0) parts.push(`${result.staleLocks.length} lock${result.staleLocks.length === 1 ? "" : "s"} no longer in the library`);
  if (mode === "similar") parts.push(result.basis === "none" ? "no tags to compare" : `scored on ${result.basis} tags`);
  return `${parts.join(" · ")}.`;
}

/** A numeric control kept inside its own range (the reader clamps again). */
function Num({ id, label, value, min, max, onChange }: {
  id: string; label: string; value: number; min: number; max: number; onChange: (n: number) => void;
}) {
  return (
    <label className="bld-field">
      <span className="bld-label">{label}</span>
      <input className="bld-input" data-testid={id} type="number" value={value} min={min} max={max}
        onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

/** One closed-set control. */
function Pick({ id, label, value, options, onChange }: {
  id: string; label: string; value: string; options: readonly { value: string; text: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="bld-field">
      <span className="bld-label">{label}</span>
      <select className="bld-input" data-testid={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.text}</option>)}
      </select>
    </label>
  );
}

/** The largest seed the field accepts (it is a positive 32-bit integer). */
const MAX_SEED = 0x7fffffff;

export type { BuilderIcon };
