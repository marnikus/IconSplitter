// actions/artboardmetaedit.ts — an artboard row's own metadata editor
// (2026-11-15, the upload tab's fields): edits and ✓ Accept are written into
// that artboard at once; an artboard open on the stage gets the same metadata
// there, so it shows no unsaved change.
import { acceptSheetMetadata, editSheetMetadata } from "../../lib/svgBuilder/metadata";
import type { SheetMetadata } from "../../lib/svgBuilder/types";
import type { BuilderActionContext, BuilderActions } from "../actiontypes";
import { saveArtboards } from "../artboardstore";

export function artboardMetaEditActions(get: () => BuilderActionContext): Pick<BuilderActions, "editArtboardMetadata" | "acceptArtboardMetadata"> {
  return {
    editArtboardMetadata: (id, patch) => {
      const c = get();
      setMetadata(c, id, editSheetMetadata(c.model.artboards.find((a) => a.id === id)?.metadata ?? null, patch));
    },
    acceptArtboardMetadata: (id) => acceptOne(get(), id),
  };
}

function setMetadata(ctx: BuilderActionContext, id: string, metadata: SheetMetadata): void {
  const artboards = ctx.model.artboards.map((a) => (a.id === id ? { ...a, metadata, updated: new Date().toISOString() } : a));
  ctx.dispatch({ artboards, ...(ctx.model.editingArtboardId === id ? { metadata } : {}) });
  saveArtboards(artboards);
}

function acceptOne(ctx: BuilderActionContext, id: string): void {
  const artboard = ctx.model.artboards.find((a) => a.id === id);
  if (artboard?.metadata == null) return ctx.say("No metadata to accept", true);
  const accepted = acceptSheetMetadata(artboard.metadata);
  setMetadata(ctx, id, accepted);
  ctx.say(accepted.state === "accepted" ? `Metadata of “${artboard.name}” accepted` : `Metadata is invalid — ${accepted.validation?.errors.join("; ")}`, accepted.state !== "accepted");
}
