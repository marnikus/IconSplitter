// metaselect.ts — the SELECTION-level metadata entry points (2026-10-08): the
// two global buttons that act on every checked row, the confirmation they open,
// and the guards that decide whether they may start at all.
//
// Split out of `metaactions.ts` (RULE 18), and deliberately not the same jobs:
// * "Generate metadata" (N) pays for every selected icon that has NO metadata
//   text yet. A draft is not re-requested — the row already has an answer.
// * "Export selected" = generate the missing metadata first, then export the
//   WHOLE selection. Answers that pass the policy are accepted as they land
//   (that is what the button promises); a policy-breaking answer stays a draft
//   and that icon exports without metadata, which the confirmation says before
//   anything is paid for.

import { useCallback } from "react";
import type { DirHandleLike } from "../lib/fs";
import type { SentPreview } from "../lib/upload/sentpreview";
import { preparePreviews } from "./metapreview";
import { idsNeedingMetadata, idsWithDraft } from "./rowmodel";
import { runExportBatch } from "./exportactions";
import type { Latest } from "./types";
import type { UploadActions, UploadCtx } from "./actions";

/** The selection buttons' share of the action surface (composition stays typed). */
type SelectionSlice = Pick<UploadActions, "generateMetadataSelected" | "exportSelected">;

/**
 * The two global buttons. Both live here so the "what does selected mean"
 * decisions sit next to each other instead of drifting apart (RULE 3).
 */
export function useMetaSelectionActions(latest: Latest): SelectionSlice {
  const generateMetadataSelected = useCallback((ids: string[]) => {
    const c = latest.current;
    if (ids.length === 0) return c.say("Select at least one icon first", true);
    const needed = idsNeedingMetadata(c.rows, ids);
    const skipped = ids.length - needed.length;
    if (needed.length === 0) return c.say(nothingToGenerate(c, ids));
    if (skipped > 0) c.say(`Generating for ${needed.length} of ${ids.length} — ${skipped} already have metadata (↻ Regenerate on a row replaces one)`);
    openMetaDialog(latest, needed, []);
  }, [latest]);

  const exportSelected = useCallback((ids: string[]) => {
    const c = latest.current;
    const why = exportGuardForSelection(c, ids);
    if (why !== null) return c.say(why, true);
    const needed = idsNeedingMetadata(c.rows, ids);
    if (needed.length > 0) return openMetaDialog(latest, needed, ids);
    // Nothing needs a paid call: export now — and never let a draft slip out
    // silently, so the line names the icons that go without their metadata.
    const drafts = idsWithDraft(c.rows, ids).length;
    if (drafts > 0) c.say(`${drafts} icon${drafts === 1 ? "" : "s"} have an unaccepted draft — accepting on the row includes it; this export runs without`);
    void runExportBatch(latest, ids);
  }, [latest]);

  return { generateMetadataSelected, exportSelected };
}

/**
 * Opens the ONE confirmation: the exact request for `ids` (one paid call each),
 * plus — for "Export selected" — the whole selection to export afterwards.
 */
export function openMetaDialog(latest: Latest, ids: string[], thenExport: string[]): void {
  const c = latest.current;
  const why = metaGuard(c, ids);
  if (why !== null) return c.say(why, true);
  c.dispatch({ type: "dialog", dialog: { kind: "meta", ids, previews: [], preparing: true, thenExport } });
  // The images the request will carry are rendered NOW, so the confirmation
  // shows exactly the bytes that will be sent (design §2.4).
  void fillPreviews(latest, ids);
}

/** What to say when every selected icon already has metadata text. */
function nothingToGenerate(c: UploadCtx, ids: string[]): string {
  const drafts = idsWithDraft(c.rows, ids).length;
  const count = `${ids.length} selected icon${ids.length === 1 ? "" : "s"}`;
  if (drafts > 0) {
    return `All ${count} already have metadata (${drafts} not accepted yet) — ✓ Accept on a row keeps it, ↻ Regenerate replaces it`;
  }
  return `All ${count} already have accepted metadata — ↻ Regenerate on a row replaces one`;
}

/** Why "Export selected" cannot start, or null when it can. */
function exportGuardForSelection(c: UploadCtx, ids: string[]): string | null {
  if (ids.length === 0) return "Select at least one icon first";
  if (c.refs.root.current === null) return "Open a folder first";
  if (c.m.runningExport > 0) return "An export is already in flight — cancel it or wait";
  if (c.m.runningMeta > 0) return "A metadata request is already in flight — cancel it or wait";
  // The button PROMISES metadata, so an icon that needs it and no key that could
  // produce it is named up front instead of exporting a package with none.
  const needed = idsNeedingMetadata(c.rows, ids);
  if (needed.length > 0 && (c.refs.key.current === null || c.refs.key.current.trim() === "")) {
    const icons = `icon${ids.length === 1 ? "" : "s"}`;
    return `${needed.length} of the ${ids.length} selected ${icons} still need metadata — add a Gemini API key, or use ⇪ Export on a row to export without it`;
  }
  return null;
}

/** Why a metadata batch cannot start right now, or null when it can. */
function metaGuard(c: UploadCtx, ids: string[]): string | null {
  if (ids.length === 0) return "Select at least one icon first";
  if (c.refs.root.current === null) return "Open a folder first";
  if (c.refs.key.current === null || c.refs.key.current.trim() === "") return "No Gemini API key — add one in the provider card";
  if (c.m.runningMeta > 0) return "A metadata request is already in flight — cancel it or wait";
  return null;
}

/**
 * Renders the previews for an open confirmation: each selected icon's own
 * approved SVG, bounded, in the selection's order. It lands only on the dialog
 * that asked for it — a dialog the user closed (or reopened for another
 * selection) is never repainted (RULE 24).
 */
async function fillPreviews(latest: Latest, ids: string[]): Promise<void> {
  const c = latest.current;
  const root = c.refs.root.current as DirHandleLike | null;
  if (root === null) return;
  const wanted = new Set(ids);
  const sources = c.rows
    .filter((r) => wanted.has(r.source.id))
    .map((r) => ({ id: r.source.id, svgPath: r.source.svgPath, svgName: r.source.svgName, fingerprint: r.source.fingerprint }));
  const previews: SentPreview[] = await preparePreviews({ root, sources, ids });
  const dialog = latest.current.m.dialog;
  if (dialog === null || dialog.kind !== "meta" || dialog.ids.join("\u0000") !== ids.join("\u0000")) return;
  latest.current.dispatch({ type: "previews", previews, preparing: false });
}
