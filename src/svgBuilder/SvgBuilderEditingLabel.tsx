// SvgBuilderEditingLabel.tsx — what the stage edits now (2026-11-14): a final
// artboard (and the template it comes from) or a template. Shown at the stage's
// top-left so a selected template and a selected row are never confused.
import { steppedTemplate } from "./stagenav";
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
      <Location b={b} />
      <TemplateSteps b={b} />
      <button type="button" className="svg-btn bld-editing-add" data-testid="builder-editing-remove-artboard"
        title="Remove this artboard (Undo brings it back)" onClick={() => b.actions.removeArtboards([artboard.id])}>✕ Remove artboard</button>
    </div>;
  }
  if (template === undefined) return null;
  return <div className="bld-editing-bar">
    <div className="bld-editing is-template" data-testid="builder-editing" data-kind="template" role="status">
      <span className="bld-editing-kind">EDITING TEMPLATE</span><b>{template.name}</b>
    </div>
    <AddArtboard b={b} templateId={template.id} />
    <Location b={b} />
    <TemplateSteps b={b} />
  </div>;
}

/** ◀ ▶ beside 📂 Location (2026-11-23): the previous / next template — also ← → on the keyboard; ↑ ↓ walk its artboards. */
function TemplateSteps({ b }: { b: BuilderApi }) {
  const prev = steppedTemplate(b, -1), next = steppedTemplate(b, 1);
  return <span className="bld-editing-steps" role="group" aria-label="Previous or next template">
    <button type="button" className="svg-btn bld-editing-step" data-testid="builder-editing-prev-template" disabled={prev === null}
      title="Previous template (←) · ↑ ↓ walk its artboards" aria-label="Previous template" onClick={() => b.actions.stepTemplate(-1)}>◀</button>
    <button type="button" className="svg-btn bld-editing-step" data-testid="builder-editing-next-template" disabled={next === null}
      title="Next template (→) · ↑ ↓ walk its artboards" aria-label="Next template" onClick={() => b.actions.stepTemplate(1)}>▶</button>
  </span>;
}

/** 📂 Location (2026-11-16): this artboard's / template's folder in Explorer. */
function Location({ b }: { b: BuilderApi }) {
  return <button type="button" className="svg-btn bld-editing-add" data-testid="builder-editing-location"
    title="Open this artboard's folder (or the template's) in Explorer — through the local helper" onClick={b.actions.openLocation}>📂 Location</button>;
}

/** ＋ Artboard beside the label (2026-11-16): a new artboard of the template being worked on. */
function AddArtboard({ b, templateId }: { b: BuilderApi; templateId: string }) {
  return <button type="button" className="svg-btn bld-editing-add" data-testid="builder-editing-add-artboard"
    title="Add a new artboard of this template and open it" onClick={() => b.actions.addArtboard(templateId)}>＋ Artboard</button>;
}
