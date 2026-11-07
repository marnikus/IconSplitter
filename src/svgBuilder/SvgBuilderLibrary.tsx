// SvgBuilderLibrary.tsx — left column "Icon library N · STROKE ONLY": the
// selection recipe, search, category chips, a 6-column icon grid (click to add
// / remove, selected check, Similar-match dot) and the "N of C cells" footer.
import { scoreOf } from "../lib/svgBuilder/assets";
import { profileOf } from "../lib/svgBuilder/selection";
import type { BuilderIconAsset } from "../lib/svgBuilder/types";
import SvgBuilderAssetThumb from "./SvgBuilderAssetThumb";
import SvgBuilderRecipe, { CategoryChips } from "./SvgBuilderRecipe";
import type { BuilderApi } from "./useSvgBuilder";

const MAX_TILES = 480;

export default function SvgBuilderLibrary({ b }: { b: BuilderApi }) {
  return <aside className="bld-col bld-library" data-testid="builder-library" aria-label="Icon library">
    <div className="bld-col-head">
      <h3>Icon library <span className="bld-count" data-testid="builder-library-count">{b.assets.length}</span></h3>
      <span className="bld-eyebrow">STROKE ONLY</span>
    </div>
    <div className="bld-col-scroll">
      <SvgBuilderRecipe b={b} />
      <SearchBox b={b} />
      <CategoryChips b={b} testid="builder-category" />
      <IconGrid b={b} />
    </div>
    <LibraryFooter b={b} />
  </aside>;
}

function SearchBox({ b }: { b: BuilderApi }) {
  const q = b.listView.query;
  return <div className="bld-search">
    <span aria-hidden="true">⌕</span>
    <input className="svg-input" data-testid="builder-search" aria-label="Search icons" placeholder="Search name or #tag" value={q}
      onChange={(e) => b.actions.setSearch(e.target.value)} />
    {q !== "" && <button type="button" className="svg-btn ghost tiny" data-testid="builder-search-clear" aria-label="Clear search"
      onClick={() => b.actions.setSearch("")}>×</button>}
  </div>;
}

function IconGrid({ b }: { b: BuilderApi }) {
  if (b.assets.length === 0) return <p className="bld-empty-note" data-testid="builder-library-empty">Open a folder with `.svg.json`-approved pairs. Nothing is generated here.</p>;
  if (b.visibleAssets.length === 0) return <p className="bld-empty-note" data-testid="builder-library-nomatch">No icons match that search.</p>;
  const hidden = b.visibleAssets.length - MAX_TILES;
  return <>
    <div className="bld-icon-grid" data-testid="builder-icon-grid">
      {b.visibleAssets.slice(0, MAX_TILES).map((asset) => <IconTile key={asset.id} b={b} asset={asset} />)}
    </div>
    {hidden > 0 && <p className="bld-hint" data-testid="builder-library-more">Showing {MAX_TILES}; narrow the search for {hidden} more.</p>}
  </>;
}

function IconTile({ b, asset }: { b: BuilderApi; asset: BuilderIconAsset }) {
  const placed = b.checked.includes(asset.id);
  const score = Math.round(scoreOf(asset, profileOf(b.profiles, b.recipe)) * 100);
  const match = !placed && b.recipe.mode === "similar" && score >= b.recipe.threshold;
  return <button type="button" data-testid={`builder-asset-${asset.id}`} data-asset-id={asset.id} data-selected={placed}
    className={`bld-tile${placed ? " is-on" : ""}`} aria-pressed={placed}
    title={`${asset.label} · ${score}% tag match${placed ? " · in sheet" : ""}`} onClick={() => b.actions.toggleAsset(asset.id)}>
    <SvgBuilderAssetThumb asset={asset} repository={b.repository} />
    {placed && <span className="bld-tile-check" aria-hidden="true">✓</span>}
    {match && <span className="bld-tile-dot" data-testid={`builder-match-${asset.id}`} aria-hidden="true" />}
  </button>;
}

function LibraryFooter({ b }: { b: BuilderApi }) {
  const used = Math.min(b.checked.length, b.layout.capacity);
  const locked = b.lockedIds.length;
  return <div className="bld-col-foot" data-testid="builder-library-footer">
    <div className="bld-foot-row">
      <span data-testid="builder-cells"><b>{used}</b> of {b.layout.capacity} cells</span>
      {locked > 0 && <span className="bld-pill" data-testid="builder-locked-count">{locked} locked</span>}
      <button type="button" className="svg-btn ghost tiny" data-testid="builder-clear" disabled={b.checked.length === 0}
        onClick={b.actions.clearSelection}>CLEAR</button>
    </div>
    <div className="bld-progress"><span style={{ width: `${b.layout.capacity === 0 ? 0 : (used / b.layout.capacity) * 100}%` }} /></div>
  </div>;
}
