import { DEFAULT_SHADOW_TEMPLATE, SHADOW_TEMPLATE_MAX_LENGTH, validateShadowTemplate } from "../lib/upload/shadowtemplate";
import UploadTemplateDialog, { type TemplateCheck, type TemplateKind } from "./UploadTemplateDialog";

interface EditorProps { source: string; scope: string | null; onClose: () => void; onApply: (svg: string) => void }

function check(code: string): TemplateCheck {
  const result = validateShadowTemplate(code);
  return result.ok
    ? { ok: true, svg: result.svg, summary: `Valid vector SVG · ${result.bounds.width} × ${result.bounds.height}. Changes are saved only when applied.` }
    : { ok: false, detail: result.detail.includes("userSpaceOnUse") ? `${result.detail} Use a flat fill or a bounding-box gradient (gradientUnits="objectBoundingBox", the default).` : result.detail };
}

/** The shadow's words, default graphic and validator on the shared template editor. */
const SHADOW: TemplateKind = {
  kind: "shadow", heading: "Shadow SVG template", previewAlt: "Shadow template preview",
  note: "Paste a complete vector SVG with a viewBox. Paths, basic shapes, groups and supported gradients are preserved. "
    + "The shadow is scaled to the shadow width % of the icon, keeping its proportions, and placed centred below the icon at the gap %. "
    + "Outline text first; images, scripts, external resources and unsupported effects cannot be used. Applying a template never turns a shadow on.",
  defaultSvg: DEFAULT_SHADOW_TEMPLATE, maxLength: SHADOW_TEMPLATE_MAX_LENGTH, validate: check,
};

export default function UploadShadowTemplateDialog(p: EditorProps) {
  return <UploadTemplateDialog {...p} spec={SHADOW} />;
}
