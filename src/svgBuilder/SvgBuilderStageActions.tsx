// SvgBuilderStageActions.tsx — the stage's top-right buttons (2026-11-14):
// while a template is edited and its look changed, ✓ Save template and
// ↺ Reset appear beside ↻ Reshuffle (Reset is one undo step). Closing the
// page with unsaved template edits asks the browser's leave question.
import { useEffect } from "react";
import { templateChanged } from "../lib/svgBuilder/templates";
import { editedTemplate } from "./actions/leaveguard";
import type { BuilderApi } from "./useSvgBuilder";

export default function SvgBuilderStageActions({ b }: { b: BuilderApi }) {
  const template = editedTemplate(b);
  const dirty = template !== null && templateChanged(template, b.config);
  useEffect(() => {
    if (!dirty) return undefined;
    const ask = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", ask);
    return () => window.removeEventListener("beforeunload", ask);
  }, [dirty]);
  return <div className="bld-float-actions" data-testid="builder-stage-actions">
    {dirty && <>
      <button type="button" className="svg-btn" data-testid="builder-stage-template-reset" onClick={b.actions.resetTemplate}
        title={`Back to the saved look of “${template.name}” (Undo brings the changes back)`}>↺ Reset</button>
      <button type="button" className="svg-btn primary" data-testid="builder-stage-template-save" onClick={b.actions.saveTemplate}
        title={`Write the changes into “${template.name}” and finish editing`}>✓ Save template</button>
    </>}
    <button type="button" className="svg-btn bld-float-reshuffle" data-testid="builder-reshuffle-stage" disabled={b.assets.length === 0}
      onClick={b.actions.reshuffle}>↻ Reshuffle</button>
  </div>;
}
