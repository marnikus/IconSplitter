// SvgBuilderLibrary.tsx — left column "Icon library N · STROKE ONLY": the
// selection recipe, search, category chips, a 6-column icon grid (click to add
// / remove, selected check, Similar-match dot) and the "N of C cells" footer.
import { iconText } from "../lib/iconIndex/record";
import { placedOnly } from "../lib/svgBuilder/slots";
import type { BuilderIconAsset } from "../lib/svgBuilder/types";
import SvgBuilderAssetThumb from "./SvgBuilderAssetThumb";
import GetDataButton from "../ui/GetDataButton";
import { builderDataRows } from "./getdatarows";
import SvgBuilderRecipe, { CategoryChips } from "./SvgBuilderRecipe";
import type { BuilderApi } from "./useSvgBuilder";

const MAX_TILES = 480;

export default function SvgBuilderLibrary({ b }: { b: BuilderApi }) {
  return <aside className="bld-col bld-library" data-testid="builder-library" aria-label="Icon library">
    <div className="bld-col-head">
      <h3>Icon library <span className="bld-count" data-testid="builder-library-count">{b.assets.length}</span></h3>
      <span className="bld-eyebrow">STROKE ONLY</span>
      <GetDataButton testid="builder" count={b.checked.length} rows={() => builderDataRows(b.assets, b.checked)} />
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

/** Every flag a library tile shows, in one place. */
function tileFlags(b: BuilderApi, asset: BuilderIconAsset) {
  const placed = b.checked.includes(asset.id);
  const raw = b.scoreOf(asset);
  const score = raw === null ? null : Math.round(raw * 100);
  return { placed, score, match: !placed && b.recipe.mode === "similar" && score !== null && score >= b.recipe.threshold,
    unindexed: b.indexStates.get(asset.id) !== "ok", noMeta: iconText(asset) === "", excluded: b.excludedIds.includes(asset.id) };
}

function IconTile({ b, asset }: { b: BuilderApi; asset: BuilderIconAsset }) {
  const { placed, score, match, unindexed, noMeta, excluded } = tileFlags(b, asset);
  const used = b.discovery?.usage.get(asset.id)?.used ?? 0;
  const pending = b.pendingUse.get(asset.id) ?? 0;
  return <button type="button" data-testid={`builder-asset-${asset.id}`} data-asset-id={asset.id} data-selected={placed}
    data-unindexed={unindexed} data-nometa={noMeta} data-excluded={excluded} aria-pressed={placed}
    className={`bld-tile${placed ? " is-on" : ""}${noMeta ? " is-nometa" : ""}${excluded ? " is-excluded" : ""}`}
    title={tileTitle({ asset, score, placed, unindexed, noMeta, used, pending })} onClick={() => b.actions.toggleAsset(asset.id)}>
    <SvgBuilderAssetThumb asset={asset} repository={b.repository} />
    <TileBadges id={asset.id} flags={{ placed, match, excluded, unindexed }} />
    <UseBadge id={asset.id} used={used} pending={pending} />
  </button>;
}

function TileBadges({ id, flags }: { id: string; flags: { placed: boolean; match: boolean; excluded: boolean; unindexed: boolean } }) {
  return <>
    {flags.placed && <span className="bld-tile-check" aria-hidden="true">✓</span>}
    {flags.match && <span className="bld-tile-dot" data-testid={`builder-match-${id}`} aria-hidden="true" />}
    {flags.excluded && <span className="bld-tile-excluded" aria-hidden="true">⊘</span>}
    {flags.unindexed && <span className="bld-tile-warn" data-testid={`builder-unindexed-${id}`} aria-hidden="true">⚠</span>}
  </>;
}

/** ×N saved use (exported artboards) · +M on artboards whose use is not saved yet (2026-11-13). */
function UseBadge({ id, used, pending }: { id: string; used: number; pending: number }) {
  return <span className={`bld-tile-used${used === 0 && pending === 0 ? " is-zero" : ""}`} data-testid={`builder-used-${id}`} aria-hidden="true">
    ×{used}{pending > 0 ? ` +${pending}` : ""}</span>;
}

interface TileInfo { asset: BuilderIconAsset; score: number | null; placed: boolean; unindexed: boolean; noMeta: boolean; used: number; pending: number }

/** Tooltip: name · similarity · in sheet, the metadata, and why a tile is marked. */
function tileTitle(t: TileInfo): string {
  const lines = [`${t.asset.label}${t.score === null ? "" : ` · ${t.score}% similar`}${t.placed ? " · in sheet" : ""}`];
  if (t.asset.description) lines.push(t.asset.description);
  if (t.asset.keywords && t.asset.keywords.length > 0) lines.push(`#${t.asset.keywords.join(" #")}`);
  const use = usageLine(t.used, t.pending);
  if (use !== null) lines.push(use);
  if (t.unindexed) lines.push("⚠ Not indexed yet — run Icons indexing");
  if (t.noMeta) lines.push("No name / metadata — only its image can be indexed (export it from SVG to upload for title, description and tags)");
  return lines.join("\n");
}

function usageLine(used: number, pending: number): string | null {
  if (used === 0 && pending === 0) return null;
  return `Used in ${used} exported artboard(s)${pending > 0 ? ` · on ${pending} more not exported yet` : ""}`;
}

function ExcludedPill({ b }: { b: BuilderApi }) {
  const n = b.excludedIds.length;
  if (n === 0) return null;
  return <>
    <span className="bld-pill" data-testid="builder-excluded-count">{n} excluded</span>
    <button type="button" className="svg-link" data-testid="builder-excluded-restore" title="Let excluded icons be picked again"
      onClick={b.actions.restoreExcluded}>restore</button>
  </>;
}

function LibraryFooter({ b }: { b: BuilderApi }) {
  const used = Math.min(placedOnly(b.checked).length, b.layout.capacity);
  const locked = b.lockedIds.length;
  return <div className="bld-col-foot" data-testid="builder-library-footer">
    <div className="bld-foot-row">
      <span data-testid="builder-cells"><b>{used}</b> of {b.layout.capacity} cells</span>
      {locked > 0 && <span className="bld-pill" data-testid="builder-locked-count">{locked} locked</span>}
      <ExcludedPill b={b} />
      <button type="button" className="svg-btn ghost tiny" data-testid="builder-clear" disabled={b.checked.length === 0}
        onClick={b.actions.clearSelection}>CLEAR</button>
    </div>
    <div className="bld-progress"><span style={{ width: `${b.layout.capacity === 0 ? 0 : (used / b.layout.capacity) * 100}%` }} /></div>
  </div>;
}
