// SvgBuilderEditingLabel.tsx — what the stage edits now (2026-11-14): a final
// artboard (and the template it comes from) or a template. Shown at the stage's
// top-left so a selected template and a selected row are never confused.
import type { BuilderApi } from "./useSvgBuilder";

export default function SvgBuilderEditingLabel({ b }: { b: BuilderApi }) {
  const artboard = b.artboards.find((a) => a.id === b.editingArtboardId);
  const template = b.templates.find((t) => t.id === (artboard?.templateId ?? b.editingTemplateId));
  if (artboard !== undefined) {
    return <div className="bld-editing is-artboard" data-testid="builder-editing" data-kind="artboard" role="status">
      <span className="bld-editing-kind">EDITING ARTBOARD</span><b>{artboard.name}</b>
      {template !== undefined && <span className="bld-editing-of">of template {template.name}</span>}
    </div>;
  }
  if (template === undefined) return null;
  return <div className="bld-editing is-template" data-testid="builder-editing" data-kind="template" role="status">
    <span className="bld-editing-kind">EDITING TEMPLATE</span><b>{template.name}</b>
  </div>;
}
