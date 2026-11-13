// SvgBuilderArtboards.tsx — the final artboards list under the templates
// (2026-11-13). Shows the artboards of the CHECKED templates (else of the active
// one), grouped by template. RULE 25 gestures, as in every other list: a plain
// click activates a row — and opens it on the stage — the checkbox / Ctrl / Shift
// check rows, Up/Down move, E/Q check; the bulk bar acts on the checked rows.
import { memo, useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent } from "react";
import { checkState, checkedInView, nextVisibleId, selectIntent } from "../lib/reviewselect";
import { artboardIcons, artboardPreviewSvg, type FinalArtboard } from "../lib/svgBuilder/artboards";
import type { SheetTemplate } from "../lib/svgBuilder/templates";
import { isNativeListKeyTarget, isRowGestureClick } from "../ui/rowgesture";
import { artboardGroups, visibleArtboards } from "./artboardview";
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
      <button type="button" className="svg-btn tiny danger" data-testid="builder-artboards-remove" disabled={scope.length === 0}
        onClick={() => b.actions.removeArtboards(scope)}>✕ Remove ({scope.length})</button>
      {b.editingArtboardId !== null && <button type="button" className="svg-btn tiny" data-testid="builder-artboard-close"
        onClick={b.actions.closeArtboard} title="Stop writing stage edits into the open artboard">Done</button>}
    </div>
  </div>;
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
    {artboards.map((a) => <ArtboardRow key={a.id} b={b} template={template} artboard={a} />)}
  </div>;
}

function ArtboardRow({ b, template, artboard }: { b: BuilderApi; template: SheetTemplate; artboard: FinalArtboard }) {
  const active = b.artboardSel.active === artboard.id;
  const checked = b.artboardSel.checked.includes(artboard.id);
  const open = b.editingArtboardId === artboard.id;
  const cells = template.config.grid.columns * template.config.grid.rows;
  const onClick = (e: MouseEvent<HTMLDivElement>) => { if (isRowGestureClick(e)) b.actions.artboardGesture(artboard.id, selectIntent(e)); };
  return <div className={`bld-artboard-row${active ? " is-active" : ""}${open ? " is-open" : ""}`} data-testid={`builder-artboard-${artboard.id}`}
    aria-selected={active} onClick={onClick}>
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
    {artboard.exportedAt !== null && <span className="v2-chip approved" data-testid={`builder-artboard-exported-${artboard.id}`}>exported</span>}
    <button type="button" className="svg-btn tiny" data-testid={`builder-artboard-remove-${artboard.id}`} aria-label={`Remove ${artboard.name}`}
      onClick={() => b.actions.removeArtboards([artboard.id])}>✕</button>
  </div>;
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

const ArtboardPreview = memo(function ArtboardPreview({ b, template, artboard }: { b: BuilderApi; template: SheetTemplate; artboard: FinalArtboard }) {
  const src = useMemo(() => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(artboardPreviewSvg({
    template, artboard, assets: b.assets, svgTexts: b.svgTexts,
  }))}`, [template, artboard, b.assets, b.svgTexts]);
  return <img className="bld-artboard-pic" src={src} alt={`Preview of ${artboard.name}`} data-testid={`builder-artboard-preview-${artboard.id}`}
    style={{ aspectRatio: String(template.config.artboard.width / template.config.artboard.height) }} />;
});
