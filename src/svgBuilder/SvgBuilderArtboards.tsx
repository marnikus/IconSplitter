// SvgBuilderArtboards.tsx — the final artboards list under the templates
// (2026-11-13). Shows the artboards of the CHECKED templates (else of the active
// one), grouped by template. RULE 25 gestures, as in every other list: a plain
// click activates a row — and opens it on the stage — the checkbox / Ctrl / Shift
// check rows, Up/Down move, E/Q check; the bulk bar acts on the checked rows.
import { Fragment, memo, useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent } from "react";
import { checkState, checkedInView, nextVisibleId, selectIntent } from "../lib/reviewselect";
import { artboardConfig, artboardIcons, artboardPreviewSvg, type FinalArtboard } from "../lib/svgBuilder/artboards";
import { overrideCount } from "../lib/svgBuilder/lookoverrides";
import type { SheetTemplate } from "../lib/svgBuilder/templates";
import { isNativeListKeyTarget, isRowGestureClick } from "../ui/rowgesture";
import { artboardGroups, visibleArtboards } from "./artboardview";
import SvgBuilderRowMeta from "./SvgBuilderRowMeta";
import { pictureReady, useTextSubset } from "./textsubset";
import type { BuilderIconAsset } from "../lib/svgBuilder/types";
import type { BuilderApi } from "./useSvgBuilder";

export default function SvgBuilderArtboards({ b }: { b: BuilderApi }) {
  if (b.templates.length === 0) return null;
  const groups = artboardGroups(b);
  const ids = visibleArtboards(b).map((a) => a.id);
  return <section className="bld-artboards" data-testid="builder-artboards" aria-label="Final artboards">
    <ArtboardsHead b={b} ids={ids} />
    {groups.length === 0
      ? <p className="bld-templates-empty" data-testid="builder-artboards-hint">Select one or more templates above to see their final artboards.</p>
      : <div className="bld-artboard-list" tabIndex={0} data-testid="builder-artboard-list" onKeyDown={(e) => onListKeys(e, b, ids)}>
        {groups.map((g) => <ArtboardGroupView key={g.template.id} b={b} template={g.template} artboards={g.artboards} />)}
      </div>}
  </section>;
}

function ArtboardsHead({ b, ids }: { b: BuilderApi; ids: string[] }) {
  const state = checkState(ids, b.artboardSel.checked);
  const scope = checkedInView(ids, b.artboardSel.checked);
  return <div className="bld-templates-head">
    {ids.length > 0 && <input type="checkbox" data-testid="builder-artboards-check-all" aria-label="Select all shown artboards"
      checked={state === "all"} ref={(el) => { if (el) el.indeterminate = state === "some"; }}
      onChange={(e) => b.actions.setArtboardChecks(ids, e.target.checked)} />}
    <h3>Final artboards <span className="bld-count">{ids.length}</span></h3>
    <span className="bld-templates-editing" data-testid="builder-artboards-checked">{scope.length} checked</span>
    <div className="bld-templates-actions">
      <button type="button" className="svg-btn tiny" data-testid="builder-artboards-metadata" disabled={scope.length === 0}
        onClick={() => b.actions.generateArtboardsMetadata(scope)} title="One sheet-metadata request per checked artboard, after you confirm the exact requests">
        ✦ Generate metadata ({scope.length})</button>
      <ResetLooks b={b} scope={scope} />
      <button type="button" className="svg-btn tiny danger" data-testid="builder-artboards-remove" disabled={scope.length === 0}
        onClick={() => b.actions.removeArtboards(scope)}>✕ Remove ({scope.length})</button>
      {b.editingArtboardId !== null && <button type="button" className="svg-btn tiny" data-testid="builder-artboard-close"
        onClick={b.actions.closeArtboard} title="Stop writing stage edits into the open artboard">Done</button>}
    </div>
  </div>;
}

/** ↺ Template (N) (2026-11-23): the checked artboards in view that changed their own look follow their templates again. */
function ResetLooks({ b, scope }: { b: BuilderApi; scope: readonly string[] }) {
  const own = b.artboards.filter((a) => scope.includes(a.id) && overrideCount(a.overrides) > 0).map((a) => a.id);
  return <button type="button" className="svg-btn tiny" data-testid="builder-artboards-reset-look" disabled={own.length === 0}
    title="The checked artboards follow their template in everything again — their own look changes go (one Undo brings them back)"
    onClick={() => b.actions.resetArtboardLooks(own)}>↺ Template ({own.length})</button>;
}

function onListKeys(e: KeyboardEvent<HTMLDivElement>, b: BuilderApi, ids: string[]): void {
  if (isNativeListKeyTarget(e.target)) return;
  const k = e.key.toLowerCase();
  if (k === "arrowdown" || k === "arrowup") {
    const next = nextVisibleId(ids, b.artboardSel.active, k === "arrowdown" ? 1 : -1);
    if (next) b.actions.artboardGesture(next, "replace");
  } else if (k === "e" || k === "q") {
    b.actions.setArtboardChecks(b.artboardSel.active ? [b.artboardSel.active] : ids, k === "e");
  } else return;
  e.preventDefault();
}

function ArtboardGroupView({ b, template, artboards }: { b: BuilderApi; template: SheetTemplate; artboards: FinalArtboard[] }) {
  return <div className="bld-artboard-group" data-testid={`builder-artboard-group-${template.id}`}>
    <div className="bld-artboard-group-head">
      <b>{template.name}</b><span>{artboards.length} artboard{artboards.length === 1 ? "" : "s"}</span>
      <button type="button" className="svg-btn tiny" data-testid={`builder-artboard-add-${template.id}`} onClick={() => b.actions.addArtboard(template.id)}>＋ Add artboard</button>
    </div>
    {artboards.length === 0 && <p className="bld-templates-empty">No artboards yet — ＋ Add artboard, then pick its icons.</p>}
    {artboards.map((a) => <Fragment key={a.id}>
      <ArtboardRow b={b} template={template} artboard={a} />
      {b.artboardSel.active === a.id && <SvgBuilderRowMeta b={b} artboard={a} />}
    </Fragment>)}
  </div>;
}

function ArtboardRow({ b, template, artboard }: { b: BuilderApi; template: SheetTemplate; artboard: FinalArtboard }) {
  const active = b.artboardSel.active === artboard.id;
  const checked = b.artboardSel.checked.includes(artboard.id);
  const open = b.editingArtboardId === artboard.id;
  const look = artboardConfig(template, artboard);
  const cells = look.grid.columns * look.grid.rows;
  const own = overrideCount(artboard.overrides);
  const onClick = (e: MouseEvent<HTMLDivElement>) => { if (isRowGestureClick(e)) b.actions.artboardGesture(artboard.id, selectIntent(e)); };
  return <div className={`bld-artboard-row${active ? " is-active" : ""}${open ? " is-open" : ""}`} data-testid={`builder-artboard-${artboard.id}`}
    aria-selected={active} onClick={onClick} onDoubleClick={(e) => { if (isRowGestureClick(e)) b.actions.openArtboard(artboard.id); }}>
    <input type="checkbox" data-testid={`builder-artboard-check-${artboard.id}`} aria-label={`Select ${artboard.name}`}
      checked={checked} onChange={() => b.actions.toggleArtboardCheck(artboard.id)} />
    <ArtboardPreview b={b} template={template} artboard={artboard} />
    <div className="bld-artboard-main">
      <ArtboardName artboard={artboard} onRename={b.actions.renameArtboard} />
      <span className="bld-artboard-facts">
        <code data-testid={`builder-artboard-id-${artboard.id}`}>{artboard.id}</code>
        {` · ${artboardIcons(artboard).length}/${cells} icons · ${artboard.title === "" ? "no title yet" : artboard.title}`}
      </span>
    </div>
    <span className="bld-meta-state" data-state={artboard.metadata?.state ?? "empty"} data-testid={`builder-artboard-meta-${artboard.id}`}>
      {artboard.metadata === null ? "no metadata" : `metadata ${artboard.metadata.state}`}</span>
    <RowActions b={b} artboard={artboard} own={own} />
  </div>;
}

/** The row's end: exported chip, ↺ Template (own look changes), ↻ Metadata, ✕. */
function RowActions({ b, artboard, own }: { b: BuilderApi; artboard: FinalArtboard; own: number }) {
  return <>
    {artboard.exportedAt !== null && <span className="v2-chip approved" data-testid={`builder-artboard-exported-${artboard.id}`}>exported</span>}
    {own > 0 && <button type="button" className="svg-btn tiny" data-testid={`builder-artboard-reset-${artboard.id}`}
      title={`${own} setting${own === 1 ? "" : "s"} changed on this artboard. Reset: follow the template in everything again`}
      onClick={() => b.actions.resetArtboardLook(artboard.id)}>↺ Template <small>{own}</small></button>}
    <button type="button" className="svg-btn tiny" data-testid={`builder-artboard-regen-${artboard.id}`} title="Generate this artboard's metadata again (the exact request is shown first)"
      onClick={() => b.actions.generateArtboardsMetadata([artboard.id])}>↻ Metadata</button>
    <button type="button" className="svg-btn tiny" data-testid={`builder-artboard-remove-${artboard.id}`} aria-label={`Remove ${artboard.name}`}
      onClick={() => b.actions.removeArtboards([artboard.id])}>✕</button>
  </>;
}

function ArtboardName({ artboard, onRename }: { artboard: FinalArtboard; onRename: (id: string, name: string) => void }) {
  const [text, setText] = useState(artboard.name);
  useEffect(() => { setText(artboard.name); }, [artboard.name]);
  return <input className="svg-input bld-artboard-name" data-testid={`builder-artboard-name-${artboard.id}`} value={text} maxLength={60}
    aria-label="Artboard name" onChange={(e) => setText(e.target.value)} onBlur={() => onRename(artboard.id, text)}
    onKeyDown={(e) => {
      if (e.key === "Enter") e.currentTarget.blur();
      if (e.key === "Escape") { setText(artboard.name); e.currentTarget.blur(); }
    }} />;
}

interface PictureArgs { template: SheetTemplate; artboard: FinalArtboard; assets: readonly BuilderIconAsset[]; texts: Readonly<Record<string, string>> }
const PICTURES = new WeakMap<FinalArtboard, PictureArgs & { src: string }>();

const sameTexts = (x: Readonly<Record<string, string>>, y: Readonly<Record<string, string>>) => {
  const keys = Object.keys(x);
  return keys.length === Object.keys(y).length && keys.every((k) => x[k] === y[k]);
};

/** One composed picture per artboard state, shared by the list and the stage strip (2026-11-16): never composed twice. */
function artboardPicture(p: PictureArgs): string {
  const hit = PICTURES.get(p.artboard);
  if (hit !== undefined && hit.template === p.template && hit.assets === p.assets && sameTexts(hit.texts, p.texts)) return hit.src;
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(artboardPreviewSvg({ template: p.template, artboard: p.artboard, assets: p.assets, svgTexts: p.texts }))}`;
  PICTURES.set(p.artboard, { ...p, src });
  return src;
}

/** An artboard's picture (also the stage strip's thumbnails, 2026-11-16). */
export const ArtboardPreview = memo(function ArtboardPreview({ b, template, artboard }: { b: BuilderApi; template: SheetTemplate; artboard: FinalArtboard }) {
  const texts = useTextSubset(artboard.placedIds, b.svgTexts); // recomposed only when its own icons change (2026-11-15)
  const ready = pictureReady({ root: b.root, scanned: b.discovery !== null, known: b.knownIds, booting: b.booting }, artboard.placedIds, texts);
  const src = useMemo(() => (!ready ? null : artboardPicture({ template, artboard, assets: b.assets, texts })), [ready, template, artboard, b.assets, texts]);
  if (src === null) return <span className="bld-artboard-pic bld-pic-loading" data-testid={`builder-artboard-preview-${artboard.id}`} aria-label="Loading the preview" />;
  return <img className="bld-artboard-pic" src={src} alt={`Preview of ${artboard.name}`} data-testid={`builder-artboard-preview-${artboard.id}`}
    style={{ aspectRatio: String(template.config.artboard.width / template.config.artboard.height) }} />;
});
