import { BADGE_TEMPLATE_MAX_LENGTH, DEFAULT_BADGE_TEMPLATE, validateBadgeTemplate } from "../lib/upload/badgetemplate";
import UploadTemplateDialog, { type TemplateCheck, type TemplateKind } from "./UploadTemplateDialog";

interface EditorProps { source: string; scope: string | null; onClose: () => void; onApply: (svg: string) => void }

function check(code: string): TemplateCheck {
  const result = validateBadgeTemplate(code);
  return result.ok
    ? { ok: true, svg: result.svg, summary: `Valid vector SVG · ${result.bounds.width} × ${result.bounds.height}. Changes are saved only when applied.` }
    : result;
}

/** The badge's words, default graphic and validator on the shared template editor. */
const BADGE: TemplateKind = {
  kind: "badge", heading: "Badge SVG template", previewAlt: "Badge template preview",
  note: "Paste a complete vector SVG with a viewBox. Paths, basic shapes, groups and supported gradients are preserved. "
    + "Outline text first; images, scripts, external resources and unsupported effects cannot be used. Applying a template never turns a badge on.",
  defaultSvg: DEFAULT_BADGE_TEMPLATE, maxLength: BADGE_TEMPLATE_MAX_LENGTH, validate: check,
};

export default function UploadBadgeTemplateDialog(p: EditorProps) {
  return <UploadTemplateDialog {...p} spec={BADGE} />;
}
