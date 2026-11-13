// SvgBuilderTemplates.tsx — the saved templates window under the builder
// (2026-11-13). "Save template" keeps the sheet's look (grid, icon style, banner
// and text style) as a compact block: a live picture of that look on the current
// sheet, an editable generated name, ✎ Edit (opens it on the sheet; the next
// Save template writes back to it) and ✕ remove. Styles: app theme (`bld-*`).
import { memo, useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent } from "react";
import { checkState, nextVisibleId, selectIntent } from "../lib/reviewselect";
import { isNativeListKeyTarget, isRowGestureClick } from "../ui/rowgesture";
import { templateFacts, templatePreviewSvg, type SheetTemplate } from "../lib/svgBuilder/templates";
import ZoomSliderBase from "../ui/ZoomSliderBase";
import type { BuilderApi } from "./useSvgBuilder";

export default function SvgBuilderTemplates({ b }: { b: BuilderApi }) {
  const editing = b.templates.find((t) => t.id === b.editingTemplateId) ?? null;
  return <section className="bld-templates" data-testid="builder-templates" aria-label="Saved templates">
    <div className="bld-templates-head">
      <TemplateCheckAll b={b} />
      <h3>Saved templates <span className="bld-count">{b.templates.length}</span></h3>
      {editing !== null && <span className="bld-templates-editing" data-testid="builder-template-editing">
        Editing <b>{editing.name}</b></span>}
      {b.templates.length > 0 && <ZoomSliderBase id="builder-template-zoom" testid="builder-template-zoom" label="PREVIEW"
        value={b.prefs.templateZoom} onChange={b.actions.setTemplateZoom} />}
      <div className="bld-templates-actions">
        <button type="button" className="svg-btn tiny primary" data-testid="builder-template-save" onClick={b.actions.saveTemplate}
          title={editing === null ? "Save the sheet's grid, icon, banner and text style as a new template" : `Write the sheet's look back into “${editing.name}”`}>
          {editing === null ? "＋ Save template" : "✓ Save template"}</button>
        {editing !== null && <>
          <button type="button" className="svg-btn tiny" data-testid="builder-template-save-new" onClick={b.actions.saveTemplateAsNew}>Save as new</button>
          <button type="button" className="svg-btn tiny" data-testid="builder-template-stop" onClick={b.actions.stopEditingTemplate}>Done editing</button>
        </>}
      </div>
    </div>
    {b.templates.length === 0
      ? <p className="bld-templates-empty" data-testid="builder-templates-empty">No templates yet — style the sheet, then ＋ Save template.</p>
      : <div className="bld-templates-grid" style={{ ["--tpl-h" as string]: `${b.prefs.templateZoom}px` }}
        tabIndex={0} data-testid="builder-templates-grid" onKeyDown={(e) => onTemplateKeys(e, b)}>
        {b.templates.map((t) => <TemplateBlock key={t.id} b={b} template={t} />)}</div>}
  </section>;
}

/** The header checkbox (RULE 25): tri-state over the templates; checked ones show their artboards together. */
function TemplateCheckAll({ b }: { b: BuilderApi }) {
  const ids = b.templates.map((t) => t.id);
  if (ids.length === 0) return null;
  const state = checkState(ids, b.templateSel.checked);
  return <input type="checkbox" data-testid="builder-templates-check-all" aria-label="Select all templates"
    checked={state === "all"} ref={(el) => { if (el) el.indeterminate = state === "some"; }}
    onChange={(e) => b.actions.setTemplateChecks(ids, e.target.checked)} />;
}

/** Up/Down (and Left/Right) move the active template; E/Q check/uncheck it (all/none without one). */
function onTemplateKeys(e: KeyboardEvent<HTMLDivElement>, b: BuilderApi): void {
  if (isNativeListKeyTarget(e.target)) return;
  const ids = b.templates.map((t) => t.id);
  const k = e.key.toLowerCase();
  if (["arrowdown", "arrowup", "arrowright", "arrowleft"].includes(k)) {
    const next = nextVisibleId(ids, b.templateSel.active, k === "arrowdown" || k === "arrowright" ? 1 : -1);
    if (next) b.actions.templateGesture(next, "replace");
  } else if (k === "e" || k === "q") {
    b.actions.setTemplateChecks(b.templateSel.active ? [b.templateSel.active] : ids, k === "e");
  } else return;
  e.preventDefault();
}

function TemplateBlock({ b, template }: { b: BuilderApi; template: SheetTemplate }) {
  const editing = b.editingTemplateId === template.id;
  const active = b.templateSel.active === template.id;
  const checked = b.templateSel.checked.includes(template.id);
  const count = b.artboards.filter((a) => a.templateId === template.id).length;
  const onClick = (e: MouseEvent<HTMLElement>) => { if (isRowGestureClick(e)) b.actions.templateGesture(template.id, selectIntent(e)); };
  const { width, height } = template.config.artboard;
  return <article className={`bld-template${editing ? " is-editing" : ""}${active ? " is-active" : ""}${checked ? " is-checked" : ""}`}
    data-testid={`builder-template-${template.id}`} aria-selected={active} onClick={onClick}
    style={{ ["--tpl-ratio" as string]: String(width / height) }}>
    <TemplateTop b={b} template={template} checked={checked} count={count} />
    <div className="bld-template-pic" data-testid={`builder-template-open-${template.id}`}
      title={`Select “${template.name}” to see its final artboards · ✎ edits its design`}>
      <TemplatePreview b={b} template={template} />
    </div>
    <TemplateName name={template.name} id={template.id} onRename={b.actions.renameTemplate} />
    <div className="bld-template-foot">
      <span className="bld-template-facts">{templateFacts(template.config)}</span>
      <button type="button" className="svg-btn tiny" data-testid={`builder-template-edit-${template.id}`}
        onClick={() => b.actions.editTemplate(template.id)} aria-label={`Edit ${template.name}`}>✎</button>
      <button type="button" className="svg-btn tiny" data-testid={`builder-template-remove-${template.id}`}
        onClick={() => b.actions.removeTemplate(template.id)} aria-label={`Remove ${template.name}`} title="Remove this template">✕</button>
    </div>
  </article>;
}

/** The block's top line: its checkbox, its artboard count and "+ Artboard". */
function TemplateTop({ b, template, checked, count }: { b: BuilderApi; template: SheetTemplate; checked: boolean; count: number }) {
  return <div className="bld-template-top">
    <input type="checkbox" data-testid={`builder-template-check-${template.id}`} aria-label={`Select ${template.name}`}
      checked={checked} onChange={() => b.actions.toggleTemplateCheck(template.id)} />
    <span className="bld-template-count" data-testid={`builder-template-artboards-${template.id}`}>{count} artboard{count === 1 ? "" : "s"}</span>
    <button type="button" className="svg-btn tiny primary" data-testid={`builder-template-add-artboard-${template.id}`}
      onClick={() => b.actions.addArtboard(template.id)} title="Add a final artboard with this design, then pick its icons">＋ Artboard</button>
  </div>;
}

/** The name: edited in place, saved on Enter or when the field is left; Escape puts it back. */
function TemplateName({ name, id, onRename }: { name: string; id: string; onRename: (id: string, name: string) => void }) {
  const [text, setText] = useState(name);
  useEffect(() => { setText(name); }, [name]);
  return <input className="svg-input bld-template-name" data-testid={`builder-template-name-${id}`} value={text}
    aria-label="Template name" maxLength={60} onChange={(e) => setText(e.target.value)}
    onBlur={() => onRename(id, text)}
    onKeyDown={(e) => {
      if (e.key === "Enter") e.currentTarget.blur();
      if (e.key === "Escape") { setText(name); e.currentTarget.blur(); }
    }} />;
}

/** The look on the current sheet, as an <img> (no script runs from an SVG drawn this way). */
const TemplatePreview = memo(function TemplatePreview({ b, template }: { b: BuilderApi; template: SheetTemplate }) {
  const src = useMemo(() => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(templatePreviewSvg({
    template, assets: b.assets, placedIds: b.checked, svgTexts: b.svgTexts,
  }))}`, [template, b.assets, b.checked, b.svgTexts]);
  return <img src={src} alt={`Preview of ${template.name}`} data-testid={`builder-template-preview-${template.id}`} />;
});
