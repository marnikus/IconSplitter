// SvgBuilderEditingLabel.tsx — what the stage edits now (2026-11-14): a final
// artboard (and the template it comes from) or a template. Shown at the stage's
// top-left so a selected template and a selected row are never confused.
import type { BuilderApi } from "./useSvgBuilder";

export default function SvgBuilderEditingLabel({ b }: { b: BuilderApi }) {
  const artboard = b.artboards.find((a) => a.id === b.editingArtboardId);
  const template = b.templates.find((t) => t.id === (artboard?.templateId ?? b.editingTemplateId));
  if (artboard !== undefined) {
    return <div className="bld-editing-bar">
      <div className="bld-editing is-artboard" data-testid="builder-editing" data-kind="artboard" role="status">
        <span className="bld-editing-kind">EDITING ARTBOARD</span><b>{artboard.name}</b>
        {template !== undefined && <span className="bld-editing-of">of template {template.name}</span>}
      </div>
      {template !== undefined && <AddArtboard b={b} templateId={template.id} />}
    </div>;
  }
  if (template === undefined) return null;
  return <div className="bld-editing-bar">
    <div className="bld-editing is-template" data-testid="builder-editing" data-kind="template" role="status">
      <span className="bld-editing-kind">EDITING TEMPLATE</span><b>{template.name}</b>
    </div>
    <AddArtboard b={b} templateId={template.id} />
  </div>;
}

/** ＋ Artboard beside the label (2026-11-16): a new artboard of the template being worked on. */
function AddArtboard({ b, templateId }: { b: BuilderApi; templateId: string }) {
  return <button type="button" className="svg-btn bld-editing-add" data-testid="builder-editing-add-artboard"
    title="Add a new artboard of this template and open it" onClick={() => b.actions.addArtboard(templateId)}>＋ Artboard</button>;
}
