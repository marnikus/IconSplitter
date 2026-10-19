// imgactions.ts — the AI source image regeneration actions (2026-10-16):
// the guarded request, the confirmed batch (write + pair-file history + main
// pointer), and the main switch. Reuses the SVG side's stores: the pair file
// via loadMetaAt/saveMetaAt (atomic, I-54 additive fields) and the row list.
// The batch itself is pure orchestration below the hook (RULE 18 sizes).

import { useCallback, useRef } from "react";
import type { DirHandleLike } from "../lib/fs";
import { metaPathForAi, type PairMeta } from "../lib/pairmeta";
import { imageRegenFileName, nextImageVersion, type ImageVersion } from "../lib/svgimgreg";
import { loadMetaAt, saveMetaAt } from "../selection/pairstore";
import { log } from "../log/logstore";
import type { SvgCtx, Slice } from "./actions";
import { listRegenNames, writeRegenImage } from "./imgregfiles";
import { runImageBatch } from "./imgrunner";

type ImgSlice = Slice<"requestImageRegen" | "confirmImageRegen" | "setImageVersion">;

/** The active connection record, or null when it is not an image one. */
function activeImageConn(m: SvgCtx["m"]) {
  const conn = m.connections.find((c) => c.id === m.activeConn);
  return conn && conn.kind === "image" ? conn : null;
}

export function useImgRegenActions(ctx: SvgCtx): ImgSlice {
  const latest = useRef(ctx);
  latest.current = ctx;
  const requestImageRegen = useCallback((ids: string[]) => {
    const c = latest.current;
    if (ids.length === 0) return;
    if (activeImageConn(c.m) === null) { c.say("Switch to an image connection to regenerate AI sources", true); return; }
    if (c.refs.key.current === null) { c.say("Add the API key first — it lives only on this device", true); return; }
    c.dispatch({ type: "dialog", dialog: { kind: "image-regen", ids } });
  }, []);
  const confirmImageRegen = useCallback(() => {
    const c = latest.current;
    confirmOf(c).catch((error: unknown) => {
      c.say(`Image regeneration stopped: ${error instanceof Error ? error.message : String(error)}`, true);
    });
  }, []);
  const setImageVersion = useCallback((id: string, version: number | null) => { void mainOf(latest.current, id, version); }, []);
  return { requestImageRegen, confirmImageRegen, setImageVersion };
}

/** Guarded confirm: close the dialog, run the batch, record every result. */
async function confirmOf(c: SvgCtx): Promise<void> {
  const conn = activeImageConn(c.m);
  const dialog = c.m.dialog;
  if (conn === null || dialog === null || dialog.kind !== "image-regen") return;
  const rows = c.rows.filter((r) => dialog.ids.includes(r.source.id));
  c.dispatch({ type: "dialog", dialog: null });
  if (rows.length === 0) return;
  const root = c.refs.root.current as DirHandleLike | null;
  if (root === null) return c.say("The folder is gone — pick it again", true);
  c.say(`Regenerating ${rows.length} AI source image${rows.length === 1 ? "" : "s"}…`);
  const report = await runImageBatch({
    conn, key: c.refs.key.current ?? "", prompt: c.m.prompt,
    items: rows.map((r) => ({ id: r.source.id })),
    concurrency: c.m.config.concurrency, timeoutMs: c.m.config.timeoutMs,
  });
  let done = 0, failed = 0;
  for (let i = 0; i < report.length; i++) {
    const row = rows[i];
    const src = row.source;
    const meta = await recordResult(root, { aiRelPath: src.relPath, dirPath: src.dirPath, stem: src.stem }, report[i], { prompt: c.m.prompt, model: conn.model });
    if (meta === null) { failed += 1; continue; }
    done += 1;
    c.setRowsFn((rs) => rs.map((r) => (r.source.id === row.source.id ? { ...r, meta } : r)));
  }
  log({ feature: "svg", action: "image-regen", detail: `${done} done, ${failed} failed` });
  sayOutcome(c, done, failed);
}

/** The post-run toast: what landed, what did not. */
function sayOutcome(c: SvgCtx, done: number, failed: number): void {
  const ok = done > 0
    ? `Regenerated ${done} AI source${done === 1 ? "" : "s"} — new main version${failed > 0 ? `, ${failed} failed` : ""}`
    : "No AI source was regenerated";
  c.say(ok, failed > 0 || done === 0);
}

/** The main switch: point imagePreferred at a version (or the original). */
async function mainOf(c: SvgCtx, id: string, version: number | null): Promise<void> {
  const root = c.refs.root.current as DirHandleLike | null;
  const row = c.rows.find((r) => r.source.id === id);
  if (root === null || row === undefined) return;
  const metaPath = metaPathForAi(row.source.relPath);
  const read = await loadMetaAt(root, metaPath);
  if (read.meta === null) return c.say("The pair file is gone — rescan the folder", true);
  const meta: PairMeta = { ...read.meta, imagePreferred: version };
  await saveMetaAt(root, metaPath, meta);
  c.setRowsFn((rs) => rs.map((r) => (r.source.id === id ? { ...r, meta } : r)));
  log({ feature: "svg", action: "image-main", detail: `${id} -> ${version ?? "original"}` });
}

/** The request text and model, threaded into every history entry. */
interface RegenReq { prompt: string; model: string }

/** One runner outcome for one row. */
type RegenResult = { status: "done" | "failed"; blob?: Blob; error?: string };

/** The meta after the append (what setRows stores for the row). */
type ImgRecord = PairMeta;

/** Where one result lands: which pair, which folder, which stem. */
interface ResultTarget { aiRelPath: string; dirPath: string; stem: string }

/** A write slot: the open root plus the target inside it. */
interface RegenPlace { root: DirHandleLike; target: ResultTarget }

/** Writes one result and appends it to the pair's image history (null = no pair file). */
async function recordResult(
  root: DirHandleLike, target: ResultTarget,
  result: RegenResult, req: RegenReq,
): Promise<ImgRecord | null> {
  const metaPath = metaPathForAi(target.aiRelPath);
  const prev = (await loadMetaAt(root, metaPath)).meta;
  if (prev === null) return null;
  const meta = await extendedWith({ root, target }, prev, result, req);
  await saveMetaAt(root, metaPath, meta);
  return meta;
}

/** The previous meta extended with this run's entry; the pointer moves on done. */
async function extendedWith(
  at: RegenPlace, prev: PairMeta,
  result: RegenResult, req: RegenReq,
): Promise<PairMeta> {
  const entry = await entryFor(at, prev.imageVersions, result, req);
  const preferred = entry.status === "done" ? entry.version : prev.imagePreferred;
  return { ...prev, imageVersions: [...prev.imageVersions, entry], imagePreferred: preferred };
}

/** One history entry: a written file for a done result, an honest note otherwise. */
async function entryFor(
  at: RegenPlace, history: readonly ImageVersion[],
  result: RegenResult, req: RegenReq,
): Promise<ImageVersion> {
  const now = new Date().toISOString();
  const known = result.status === "done" ? await listRegenNames(at.root, at.target.dirPath) : [];
  const version = nextImageVersion(at.target.stem, history, known);
  const file = imageRegenFileName(at.target.stem, version);
  const ok = result.status === "done" && result.blob !== undefined;
  if (!ok) return { version, file, status: "failed", prompt: req.prompt, model: req.model, requestId: null, error: result.error ?? "unknown", updatedAt: now };
  const stored = await writeRegenImage(at.root, at.target.dirPath, file, result.blob as Blob);
  return { version, file: stored, status: "done", prompt: req.prompt, model: req.model, requestId: null, error: null, updatedAt: now };
}
