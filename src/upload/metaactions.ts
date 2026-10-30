// metaactions.ts — the metadata-generation actions and their batch runner
// (design §3.2): request (guarded, confirmed against the exact request),
// confirm/cancel, accept (re-validates, persists via the embed commit) and edit.
// The batch runs with bounded concurrency, per-item isolation and an abort the
// cancel action owns; in-flight requests are journalled, so a restart reports
// them interrupted and never resends them (I-20). The SELECTION-level buttons
// ("Generate metadata", "Regenerate metadata", "Export selected") and their
// confirmation live in `metaselect.ts`.

import { useCallback, useRef } from "react";
import type { IconMetadata } from "../lib/upload/meta";
import { acceptMetadataRow, acceptSelectedMetadata } from "./metaaccept";
import { idsWithMetadata } from "./rowmodel";
import type { Latest } from "./types";
import type { UploadActions, UploadCtx } from "./actions";
import { runMetadataBatch } from "./metabatch";
import { rowOf, runExportBatch } from "./exportactions";
import { openMetaDialog, useMetaSelectionActions } from "./metaselect";

/** The metadata hooks' share of the action surface (composition stays typed). */
type MetaSlice = Pick<UploadActions,
  "requestMetadata" | "generateMetadataSelected" | "regenerateMetadataSelected" | "exportSelected"
  | "confirmMetadata" | "cancelMetadata" | "acceptMetadata" | "acceptMetadataSelected" | "editMetadata">;

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
    void runMetadataBatch(latest, dialog.ids, previews, { thenExport });
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

function useMetaEditActions(latest: Latest): Pick<MetaSlice, "acceptMetadata" | "acceptMetadataSelected" | "editMetadata"> {
  const acceptMetadata = useCallback((id: string) => acceptOne(latest, id), [latest]);
  const acceptMetadataSelected = useCallback((ids: string[]) => { void acceptSelectedMetadata(latest, ids); }, [latest]);
  const editMetadata = useCallback((id: string, patch: Partial<IconMetadata>) => {
    const c = latest.current;
    const row = rowOf(c, id);
    if (row === null || row.meta.metadata === null) return;
    c.dispatch({ type: "meta", id, meta: { ...row.meta, metadata: { ...row.meta.metadata, ...patch }, edited: true } });
  }, [latest]);
  return { acceptMetadata, acceptMetadataSelected, editMetadata };
}

/** Row Accept uses exactly the same validation/persistence gate as bulk Accept. */
function acceptOne(latest: Latest, id: string): void {
  const c = latest.current;
  const row = rowOf(c, id);
  if (row === null) return c.say("Nothing to accept — generate metadata first", true);
  const accepted = acceptMetadataRow(c, row);
  if (accepted === null) return;
  c.say("Metadata accepted");
  if (row.record !== null) void runExportBatch(latest, [id], new Map([[id, accepted]]));
}
