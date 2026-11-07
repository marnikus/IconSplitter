// SvgBuilderLibrary.tsx — approved assets only. Search, category, recipe,
// locks and click-to-place cards; no unapproved file can enter the sheet.
import type { BuilderIconAsset, SelectionRecipe } from "../lib/svgBuilder/types";
import SvgBuilderAssetThumb from "./SvgBuilderAssetThumb";
import type { BuilderApi } from "./useSvgBuilder";

const MODES: readonly SelectionRecipe["mode"][] = ["random", "similar", "filtered"];
const MAX_CARDS = 240;

export default function SvgBuilderLibrary({ b }: { b: BuilderApi }) {
  return <aside className="builder-library" data-testid="builder-library" aria-label="Approved SVG library">
    <LibraryHeader b={b} />
    <LibraryControls b={b} />
    <LibraryActions b={b} />
    <LibraryNotes b={b} />
    <LibraryCards b={b} />
  </aside>;
}

function LibraryHeader({ b }: { b: BuilderApi }) {
  return <div className="builder-card-head"><div><span className="builder-eyebrow">LIBRARY</span><h3>Approved icons</h3></div>
    <span className="builder-counter" data-testid="builder-library-count">{b.visibleAssets.length}/{b.assets.length}</span></div>;
}

function LibraryControls({ b }: { b: BuilderApi }) {
  return <div className="builder-library-controls">
    <label className="builder-field">SEARCH <input data-testid="builder-search" value={b.listView.query}
      placeholder="name / path / category" onChange={(e) => b.actions.setSearch(e.target.value)} /></label>
    <label className="builder-field">CATEGORY <select data-testid="builder-category" value={b.listView.category}
      onChange={(e) => b.actions.setCategory(e.target.value)}>
      {b.categories.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
    <label className="builder-field">RECIPE <select data-testid="builder-recipe-mode" value={b.recipe.mode}
      onChange={(e) => b.actions.setRecipe({ ...b.recipe, mode: e.target.value as SelectionRecipe["mode"] })}>
      {MODES.map((m) => <option key={m} value={m}>{m.replace(/-/g, " ")}</option>)}</select></label>
    <label className="builder-field">PROFILE <select data-testid="builder-recipe-profile" value={b.recipe.profileId}
      onChange={(e) => b.actions.setRecipe({ ...b.recipe, profileId: e.target.value })}>
      {b.profiles.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
    <label className="builder-field">SIMILARITY (0–100) <input type="number" min="0" max="100" data-testid="builder-threshold"
      value={b.recipe.threshold}
      onChange={(e) => b.actions.setRecipe({ ...b.recipe, threshold: Number(e.target.value) })} /></label>
    <label className="builder-field">SEED <input type="number" min="0" data-testid="builder-seed" value={b.seed}
      onChange={(e) => b.actions.setSeed(Number(e.target.value))} /></label>
    <label className="builder-check"><input type="checkbox" data-testid="builder-fill-library" checked={b.recipe.fillFromFullLibrary}
      onChange={(e) => b.actions.setRecipe({ ...b.recipe, fillFromFullLibrary: e.target.checked })} /> Fill unused cells from the full approved library</label>
  </div>;
}

function LibraryActions({ b }: { b: BuilderApi }) {
  return <div className="builder-library-actions">
    <button type="button" className="builder-btn accent" data-testid="builder-apply-recipe"
      onClick={() => b.actions.setRecipe({ ...b.recipe, count: b.layout.capacity })}>Apply recipe</button>
    <button type="button" className="builder-btn" data-testid="builder-shuffle" onClick={b.actions.shuffle}>⤨ Shuffle</button>
    <button type="button" className="builder-btn" data-testid="builder-clear" onClick={b.actions.clearSelection}>Clear</button>
  </div>;
}

function LibraryNotes({ b }: { b: BuilderApi }) {
  const hidden = Math.max(0, b.visibleAssets.length - MAX_CARDS);
  return <>
    {b.assets.length === 0 && <p className="builder-empty" data-testid="builder-library-empty">Open a folder with `.svg.json` approved pairs. Nothing is generated here.</p>}
    {hidden > 0 && <p className="builder-note" data-testid="builder-library-more">Showing the first {MAX_CARDS}; narrow the search for {hidden} more.</p>}
  </>;
}

function LibraryCards({ b }: { b: BuilderApi }) {
  return <div className="builder-asset-grid">
    {b.visibleAssets.slice(0, MAX_CARDS).map((asset) => <AssetCard key={asset.id} b={b} asset={asset} />)}
  </div>;
}

function AssetCard({ b, asset }: { b: BuilderApi; asset: BuilderIconAsset }) {
  const placed = b.checked.includes(asset.id);
  const locked = b.lockedIds.includes(asset.id);
  return <button type="button" data-testid={`builder-asset-${asset.id}`}
    data-asset-id={asset.id} data-selected={placed} data-locked={locked}
    className={`builder-asset-card${placed ? " is-placed" : ""}${locked ? " is-locked" : ""}`}
    aria-pressed={placed} title={`${asset.label} · ${asset.svgPath} · ${asset.version}`}
    onClick={() => b.actions.toggleAsset(asset.id)}>
    <SvgBuilderAssetThumb asset={asset} repository={b.repository} />
    <span className="builder-asset-label">{asset.label}</span>
    <span className="builder-asset-meta">{asset.category} · {asset.version}</span>
    <span className="builder-lock" role="button" tabIndex={0} data-testid={`builder-lock-${asset.id}`}
      aria-label={locked ? "Unlock asset" : "Lock asset"}
      onClick={(e) => { e.stopPropagation(); b.actions.toggleLock(asset.id); }}
      onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); b.actions.toggleLock(asset.id); } }}>{locked ? "🔒" : "☆"}</span>
  </button>;
}
