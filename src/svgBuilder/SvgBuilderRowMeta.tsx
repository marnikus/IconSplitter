// SvgBuilderRowMeta.tsx — the active artboard row's metadata (2026-11-15): the
// SVG to upload tab's editor (Title, Description, Tags, Copy, ✓ Accept,
// ↻ Regenerate), saved into that artboard (actions/artboardmetaedit.ts).
import UploadMetaFields from "../upload/UploadMetaFields";
import { useUploadNames } from "../upload/uploadnamestore";
import type { FinalArtboard } from "../lib/svgBuilder/artboards";
import { artboardWorkName } from "./actions/artboardrename";
import { uploadMetaOf } from "./SvgBuilderMetaFields";
import type { BuilderApi } from "./useSvgBuilder";

export default function SvgBuilderRowMeta({ b, artboard }: { b: BuilderApi; artboard: FinalArtboard }) {
  const names = useUploadNames();
  const workName = artboardWorkName(artboard, b.artboards, b.templates);
  const uploadName = artboard.uploadName ?? names[artboard.id] ?? null;
  const copy = (field: "title" | "description" | "tags") => {
    const m = artboard.metadata;
    if (m !== null) void navigator.clipboard?.writeText(field === "tags" ? m.tags.join(", ") : m[field]);
  };
  return <div className="bld-row-meta" data-testid={`builder-artboard-meta-fields-${artboard.id}`}>
    <UploadMetaFields id={artboard.id} meta={uploadMetaOf(artboard.metadata)} showName={false}
      rename={{ workName, uploadName, onApply: (next) => b.actions.setArtboardUploadName(artboard.id, next) }}
      onEdit={(patch) => b.actions.editArtboardMetadata(artboard.id, {
        ...(patch.title !== undefined ? { title: patch.title } : {}), ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.tags !== undefined ? { tags: patch.tags } : {}) })}
      onAccept={() => b.actions.acceptArtboardMetadata(artboard.id)} onCopy={copy}
      onRegenerate={() => b.actions.generateArtboardsMetadata([artboard.id])} />
  </div>;
}
