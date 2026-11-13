// SvgBuilderTemplates.tsx — the saved templates window under the builder
// (2026-11-13). "Save template" keeps the sheet's look (grid, icon style, banner
// and text style) as a compact block: a live picture of that look on the current
// sheet, an editable generated name, ✎ Edit (opens it on the sheet; the next
// Save template writes back to it) and ✕ remove. Styles: app theme (`bld-*`).
import { memo, useEffect, useMemo, useState } from "react";
import { templateFacts, templatePreviewSvg, type SheetTemplate } from "../lib/svgBuilder/templates";
import type { BuilderApi } from "./useSvgBuilder";

export default function SvgBuilderTemplates({ b }: { b: BuilderApi }) {
  const editing = b.templates.find((t) => t.id === b.editingTemplateId) ?? null;
  return <section className="bld-templates" data-testid="builder-templates" aria-label="Saved templates">
    <div className="bld-templates-head">
      <h3>Saved templates <span className="bld-count">{b.templates.length}</span></h3>
      {editing !== null && <span className="bld-templates-editing" data-testid="builder-template-editing">
        Editing <b>{editing.name}</b></span>}
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
      : <div className="bld-templates-grid">{b.templates.map((t) => <TemplateBlock key={t.id} b={b} template={t} />)}</div>}
  </section>;
}

function TemplateBlock({ b, template }: { b: BuilderApi; template: SheetTemplate }) {
  const editing = b.editingTemplateId === template.id;
  return <article className={`bld-template${editing ? " is-editing" : ""}`} data-testid={`builder-template-${template.id}`}>
    <button type="button" className="bld-template-pic" data-testid={`builder-template-open-${template.id}`}
      onClick={() => b.actions.editTemplate(template.id)} title={`Open “${template.name}” on the sheet to edit it`}>
      <TemplatePreview b={b} template={template} />
    </button>
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
    template, current: b.config, assets: b.assets, placedIds: b.checked, svgTexts: b.svgTexts,
  }))}`, [template, b.config, b.assets, b.checked, b.svgTexts]);
  return <img src={src} alt={`Preview of ${template.name}`} data-testid={`builder-template-preview-${template.id}`} />;
});
