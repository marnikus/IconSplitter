// metaactions.ts — the metadata-generation actions and their batch runner
// (design §3.2): request (guarded, confirmed against the exact request),
// confirm/cancel, accept (re-validates, persists via the embed commit) and edit.
// The batch runs with bounded concurrency, per-item isolation and an abort the
// cancel action owns; in-flight requests are journalled, so a restart reports
// them interrupted and never resends them (I-20). The SELECTION-level buttons
// ("Generate metadata", "Regenerate metadata", "Export selected") and their
// confirmation live in `metaselect.ts`.

import { useCallback, useRef } from "react";
import { log } from "../log/logstore";
import { cleanMetadata, validateMetadata, type IconMetadata } from "../lib/upload/meta";
import { rememberMeta } from "./metacache";
import { idsWithMetadata } from "./rowmodel";
import { namedSpec } from "./uploadlog";
import type { Latest, UploadMetaState } from "./types";
import type { UploadActions, UploadCtx } from "./actions";
import { refOf, runMetadataBatch } from "./metabatch";
import { rowOf, runExportBatch } from "./exportactions";
import { openMetaDialog, useMetaSelectionActions } from "./metaselect";

/** The metadata hooks' share of the action surface (composition stays typed). */
type MetaSlice = Pick<UploadActions,
  "requestMetadata" | "generateMetadataSelected" | "regenerateMetadataSelected" | "exportSelected"
  | "confirmMetadata" | "cancelMetadata" | "acceptMetadata" | "editMetadata">;

export function useMetaActions(ctx: UploadCtx): MetaSlice {
  const latest = useRef(ctx);
  latest.current = ctx;
  return { ...useMetaRequestActions(latest), ...useMetaSelectionActions(latest), ...useMetaEditActions(latest) };
}

// --- request + cancel ------------------------------------------------------------

function useMetaRequestActions(latest: Latest): Pick<MetaSlice,
  "requestMetadata" | "confirmMetadata" | "cancelMetadata"> {
  const requestMetadata = useCallback((ids: string[]) => {
    const existing = idsWithMetadata(latest.current.rows, ids).length === ids.length;
    openMetaDialog(latest, ids, [], existing ? "regenerate" : "generate");
  }, [latest]);
  const confirmMetadata = useCallback(() => {
    const c = latest.current;
    const dialog = c.m.dialog;
    if (dialog === null || dialog.kind !== "meta") return;
    const previews = dialog.previews;
    const thenExport = dialog.thenExport;
    c.dispatch({ type: "dialog", dialog: null });
    void runMetadataBatch(latest, dialog.ids, previews, { acceptValid: thenExport.length > 0, thenExport });
  }, [latest]);
  const cancelMetadata = useCallback(() => {
    const c = latest.current;
    if (c.refs.abortMeta.current === null) return;
    c.refs.abortMeta.current.abort();
    c.say("Cancelling — finished results are kept");
  }, [latest]);
  return { requestMetadata, confirmMetadata, cancelMetadata };
}

// --- accept + edit ----------------------------------------------------------------

function useMetaEditActions(latest: Latest): Pick<MetaSlice, "acceptMetadata" | "editMetadata"> {
  const acceptMetadata = useCallback((id: string) => acceptOne(latest, id), [latest]);
  const editMetadata = useCallback((id: string, patch: Partial<IconMetadata>) => {
    const c = latest.current;
    const row = rowOf(c, id);
    if (row === null || row.meta.metadata === null) return;
    c.dispatch({ type: "meta", id, meta: { ...row.meta, metadata: { ...row.meta.metadata, ...patch }, edited: true } });
  }, [latest]);
  return { acceptMetadata, editMetadata };
}

/** The accept gate: title and description become ONE clean phrase each (stock review, 2026-10-08), then validate, remember, re-embed. */
// ideal-size: 22 lines reason=one gate in its documented order (clean → validate → dispatch → remember → re-export); splitting would hide the order
function acceptOne(latest: Latest, id: string): void {
  const c = latest.current;
  const row = rowOf(c, id);
  if (row === null || row.meta.metadata === null) return c.say("Nothing to accept — generate metadata first", true);
  const metadata = cleanMetadata(row.meta.metadata);
  const validation = validateMetadata(metadata);
  if (!validation.ok) {
    c.dispatch({ type: "meta", id, meta: { ...row.meta, validation } });
    return c.say(validation.errors.join("; "), true);
  }
  const accepted: UploadMetaState = { ...row.meta, metadata, state: "accepted", validation, edited: false };
  c.dispatch({ type: "meta", id, meta: accepted });
  // Accepted here, remembered for the fingerprint: the next session (or a
  // crash) never pays for this source again (CP-15).
  rememberMeta(row.sourceHash ?? "", { state: "accepted", meta: metadata });
  log(namedSpec({ ...refOf(row), model: c.m.gemini.model, tags: metadata.tags.length }));
  c.say("Metadata accepted");
  // The acceptance persists in export.json: a committed record re-embeds (no
  // AI, no render); a never-exported row keeps it until its first export. The
  // accepted state travels with the call — React has not re-rendered yet.
  if (row.record !== null) void runExportBatch(latest, [id], new Map([[id, accepted]]));
}
