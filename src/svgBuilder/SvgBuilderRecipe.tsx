// SvgBuilderRecipe.tsx — the reference "Selection recipe" card: Similar /
// Random / Filtered, the mode's own controls, "Reshuffle N icons" and its caption.
import { RANGES } from "../lib/svgBuilder/ranges";
import { profileOf, recipeCaption } from "../lib/svgBuilder/selection";
import type { SelectionMode } from "../lib/svgBuilder/types";
import { Field, Segmented, Slider, type SegOption } from "./SvgBuilderFields";
import type { BuilderApi } from "./useSvgBuilder";

const MODES: readonly SegOption<SelectionMode>[] = [
  { value: "similar", label: "⁂ Similar" }, { value: "random", label: "⤨ Random" }, { value: "filtered", label: "▽ Filtered" },
];

export default function SvgBuilderRecipe({ b }: { b: BuilderApi }) {
  return <section className="bld-recipe" data-testid="builder-recipe" aria-label="Selection recipe">
    <div className="svg-field-label"><span>Selection recipe</span></div>
    <Segmented label="Selection mode" value={b.recipe.mode} testid="builder-recipe-mode" options={MODES}
      onChange={(mode) => b.actions.setRecipe({ mode })} />
    {b.recipe.mode === "similar" && <SimilarPane b={b} />}
    {b.recipe.mode === "filtered" && <FilteredPane b={b} />}
    {b.recipe.mode === "random" && <p className="bld-hint" data-testid="builder-random-note">
      A seeded draw from all {b.assets.length} glyphs. Same seed, same sheet.</p>}
    <button type="button" className="svg-btn primary bld-wide" data-testid="builder-reshuffle-recipe" disabled={b.assets.length === 0}
      onClick={b.actions.reshuffle}>↻ Reshuffle {b.layout.capacity} icons</button>
    <p className="bld-caption" data-testid="builder-recipe-caption">{recipeCaption(b.recipe, b.profiles)}</p>
  </section>;
}

function SimilarPane({ b }: { b: BuilderApi }) {
  const profile = profileOf(b.profiles, b.recipe);
  return <>
    <Field label="Metadata profile">
      <select className="svg-input" data-testid="builder-recipe-profile" aria-label="Metadata profile" value={profile?.id ?? ""}
        onChange={(e) => b.actions.setRecipe({ profileId: e.target.value })}>
        {b.profiles.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select>
    </Field>
    <Slider label="Match threshold" value={b.recipe.threshold} range={RANGES.threshold} testid="builder-threshold"
      display={`≥ ${b.recipe.threshold}%`} onChange={(threshold) => b.actions.setRecipe({ threshold })} />
    <p className="bld-tags" data-testid="builder-profile-tags">{(profile?.tags ?? []).map((t) => `#${t}`).join("  ")}</p>
  </>;
}

function FilteredPane({ b }: { b: BuilderApi }) {
  return <>
    <CategoryChips b={b} testid="builder-recipe-category" />
    <p className="bld-hint">Empties — fill from full library</p>
  </>;
}

/** All + every category; shared by the Filtered recipe and the library filter. */
export function CategoryChips({ b, testid }: { b: BuilderApi; testid: string }) {
  const current = b.listView.category;
  return <div className="bld-chips" data-testid={testid} role="radiogroup" aria-label="Category">
    {b.categories.map((c) => <button type="button" key={c} role="radio" aria-checked={c === current}
      className={`bld-chip${c === current ? " is-on" : ""}`} data-testid={`${testid}-${c}`} onClick={() => b.actions.setCategory(c)}>{c}</button>)}
  </div>;
}
