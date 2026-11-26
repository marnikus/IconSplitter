// SvgBuilderArtboardStrip.tsx — the stage's left strip (2026-11-16): the
// artboards made from the template being worked on (the edited template, or
// the open artboard's). A click opens one for editing at once (a changed
// template / artboard asks Save / Discard first); the open one is marked. The
// wheel scrolls it; with more than four, ▲ / ▼ step through. Thumbnails reuse
// the artboard list's pictures (each composed once, for its own icons).
import { useRef } from "react";
import { ArtboardPreview } from "./SvgBuilderArtboards";
import { stageTemplateId } from "./artboardview";
import type { BuilderApi } from "./useSvgBuilder";

export { stageTemplateId };

const STEP = 132;

export default function SvgBuilderArtboardStrip({ b }: { b: BuilderApi }) {
  const list = useRef<HTMLDivElement | null>(null);
  const templateId = stageTemplateId(b);
  const template = b.templates.find((t) => t.id === templateId);
  const artboards = b.artboards.filter((a) => a.templateId === templateId);
  if (template === undefined || artboards.length === 0) return null;
  const step = (dir: 1 | -1) => list.current?.scrollBy({ top: dir * STEP, behavior: "smooth" });
  return <nav className="bld-strip" data-testid="builder-artboard-strip" aria-label={`Artboards of ${template.name}`}>
    {artboards.length > 4 && <button type="button" className="svg-btn tiny bld-strip-arrow" data-testid="builder-strip-up" aria-label="Previous artboards" onClick={() => step(-1)}>▲</button>}
    <div className="bld-strip-list" ref={list}>
      {artboards.map((a) => {
        const on = a.id === b.editingArtboardId;
        return <button type="button" key={a.id} className={`bld-strip-item${on ? " is-on" : ""}`} data-testid={`builder-strip-${a.id}`} aria-current={on}
          title={`Edit ${a.name}`} onClick={() => b.actions.openArtboard(a.id)}>
          <ArtboardPreview b={b} template={template} artboard={a} />
          <span className="bld-strip-name">{a.name.replace(/^.*— /, "")}</span>
        </button>;
      })}
    </div>
    {artboards.length > 4 && <button type="button" className="svg-btn tiny bld-strip-arrow" data-testid="builder-strip-down" aria-label="Next artboards" onClick={() => step(1)}>▼</button>}
  </nav>;
}
