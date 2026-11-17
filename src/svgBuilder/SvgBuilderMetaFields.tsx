// SvgBuilderMetaFields.tsx — the current sheet's metadata (2026-11-14): the SAME
// editor as the SVG to upload tab (Title, Description, Tags, each copiable;
// ✓ Accept re-validates with the upload rules; ↻ Regenerate opens the exact
// request). On an open artboard the edits are part of its draft (✓ Save artboard).
import UploadMetaFields from "../upload/UploadMetaFields";
import type { UploadMetaState } from "../upload/types";
import type { SheetMetadata } from "../lib/svgBuilder/types";
import type { BuilderApi } from "./useSvgBuilder";

const STATE: Record<SheetMetadata["state"], UploadMetaState["state"]> = {
  empty: "empty", draft: "generated", invalid: "invalid", accepted: "accepted", edited: "accepted",
};

/** The builder's metadata in the upload editor's shape. */
export function uploadMetaOf(m: SheetMetadata | null): UploadMetaState {
  return {
    state: m === null ? "empty" : STATE[m.state],
    metadata: m === null ? null : { title: m.title, description: m.description, tags: [...m.tags] },
    validation: m?.validation == null ? null : { ok: m.validation.ok, errors: [...m.validation.errors], warnings: [...m.validation.warnings] }, usage: { input: null, output: null, total: null }, detail: "", edited: m?.state === "edited",
  };
}

export default function SvgBuilderMetaFields({ b }: { b: BuilderApi }) {
  const copy = (field: "title" | "description" | "tags") => {
    const m = b.metadata;
    if (m === null) return;
    void navigator.clipboard?.writeText(field === "tags" ? m.tags.join(", ") : m[field]);
  };
  return <section className="up-prompt-panel bld-meta-fields" data-testid="builder-meta-fields" aria-label="This sheet's metadata">
    <span className="bld-eyebrow">{b.editingArtboardId !== null ? "THIS ARTBOARD'S METADATA" : "THIS SHEET'S METADATA"}</span>
    <UploadMetaFields id="builder" meta={uploadMetaOf(b.metadata)} showName={false}
      onEdit={(patch) => b.actions.editMetadata({ ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}), ...(patch.tags !== undefined ? { tags: patch.tags } : {}) })}
      onAccept={b.actions.acceptMetadata} onCopy={copy} onRegenerate={b.actions.generateMetadata} />
  </section>;
}
