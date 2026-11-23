// SvgBuilderRowMeta.tsx — the active artboard row's metadata (2026-11-15): the
// SVG to upload tab's editor (Title, Description, Tags, Copy, ✓ Accept,
// ↻ Regenerate), saved into that artboard (actions/artboardmetaedit.ts).
import UploadMetaFields from "../upload/UploadMetaFields";
import type { FinalArtboard } from "../lib/svgBuilder/artboards";
import { uploadMetaOf } from "./SvgBuilderMetaFields";
import type { BuilderApi } from "./useSvgBuilder";

export default function SvgBuilderRowMeta({ b, artboard }: { b: BuilderApi; artboard: FinalArtboard }) {
  const copy = (field: "title" | "description" | "tags") => {
    const m = artboard.metadata;
    if (m !== null) void navigator.clipboard?.writeText(field === "tags" ? m.tags.join(", ") : m[field]);
  };
  return <div className="bld-row-meta" data-testid={`builder-artboard-meta-fields-${artboard.id}`}>
    <UploadMetaFields id={artboard.id} meta={uploadMetaOf(artboard.metadata)} showName={false}
      onEdit={(patch) => b.actions.editArtboardMetadata(artboard.id, {
        ...(patch.title !== undefined ? { title: patch.title } : {}), ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.tags !== undefined ? { tags: patch.tags } : {}) })}
      onAccept={() => b.actions.acceptArtboardMetadata(artboard.id)} onCopy={copy}
      onRegenerate={() => b.actions.generateArtboardsMetadata([artboard.id])} />
  </div>;
}
