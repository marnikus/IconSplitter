// filetransfers.ts — one target's files, one upload at a time. The Getty ESP target
// sends one icon per request. FTPS/SFTP sites (Shutterstock, Adobe Stock) take one
// file per request, walked **100 icons per batch**; both sites list a folder by
// name, so the run follows the number every export carries (0001, 0002, 0003 …)
// and sends the real names — the order the user planned, not the folder order and
// never a rank this run invents.

import { uploadBridgeFtps, type BridgeUploadResult } from "../lib/stockupload/bridgeclient";
import type { FtpCredentials } from "../lib/stockupload/credvault";
import { numericIconOrder } from "../lib/stockupload/fileorder";
import { gettyWebBatchLabel } from "../lib/stockupload/gettyweb";
import { planIconBatches } from "../lib/stockupload/iconbatches";
import type { PlannedTransfer, StockUploadPlan } from "../lib/stockupload/plan";
import type { ExportedItem, StockFtpPreset } from "../lib/stockupload/types";
import type { ItemTracker, NetworkCtx, RunCounters, UploadBatchDeps } from "./batchtypes";
import { groupEspTasks, uploadEspGroup } from "./esptransfer";
import { markUploadInFlight } from "./journal";
import { flushTargetStatuses, recordTaskResult, reportNetworkCertificate } from "./statusflush";
import { resolveTransferBytes } from "./transferpayload";

interface TaskCtx {
  target: StockFtpPreset;
  creds: FtpCredentials;
  sessionKey: string;
  combine: boolean;
  itemsById: ReadonlyMap<string, ExportedItem>;
  deps: UploadBatchDeps;
}

/** One file on the wire; `fileName` may be the shuffled one the site receives. */
async function runSingleTask(
  task: PlannedTransfer, ctx: TaskCtx, fileName: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const item = ctx.itemsById.get(task.itemId);
  if (!item) return { ok: false, reason: "item no longer present" };
  const payload = await resolveTransferBytes(ctx.deps.root, item, task, ctx.combine);
  if (!payload.ok) return payload;
  const upload = ctx.deps.uploadFn ?? uploadBridgeFtps;
  const res = await upload({
    bridgeUrl: ctx.deps.bridgeUrl, preset: ctx.target, creds: ctx.creds,
    fileName, bytes: payload.bytes, sessionKey: ctx.sessionKey, signal: ctx.deps.signal,
  });
  if (res.ok) return { ok: true };
  if (res.code === "cert" && res.serverCertSha256) ctx.deps.onCertWarning?.(ctx.target.id, res.serverCertSha256);
  return { ok: false, reason: res.reason };
}

type UploadResult = BridgeUploadResult | { ok: true } | { ok: false; reason: string };

type GroupRun = Pick<NetworkCtx, "plan" | "target" | "deps" | "creds" | "sessionKey" | "itemsById">
  & { tasks: PlannedTransfer[] };

/** One group = one icon for the Getty ESP API, one file for every other stock. */
function uploadGroup(run: GroupRun): Promise<UploadResult> {
  const { plan, target, tasks, deps, creds, sessionKey, itemsById } = run;
  const item = itemsById.get(tasks[0].itemId);
  if (target.protocol === "esp-https") {
    return uploadEspGroup({ tasks, missing: plan.skippedMissing, root: deps.root, bridgeUrl: deps.bridgeUrl,
      target, creds, sessionKey, signal: deps.signal, uploadFn: deps.uploadFn, item, combine: plan.combineTitleDescription });
  }
  return runSingleTask(tasks[0], { target, creds, sessionKey, itemsById, deps, combine: plan.combineTitleDescription }, tasks[0].fileName);
}

function groupUploadTasks(target: StockFtpPreset, targetTasks: PlannedTransfer[]): PlannedTransfer[][] {
  return target.protocol === "esp-https" ? groupEspTasks(targetTasks) : targetTasks.map((task) => [task]);
}

/** One tracker per icon of a target, counting the files that icon should send. */
export function buildTrackers(plan: StockUploadPlan, targetTasks: readonly PlannedTransfer[]): Map<string, ItemTracker> {
  const map = new Map<string, ItemTracker>();
  for (const task of targetTasks) {
    const missingCount = plan.skippedMissing.filter((m) => m.itemId === task.itemId).length;
    const prev = map.get(task.itemId) ?? { expected: 0, succeeded: [], missingCount, lastError: null };
    prev.expected += 1;
    map.set(task.itemId, prev);
  }
  return map;
}

/** The local ESP stage is not an upload: every file of that target says so. */
export function rejectLocalEspStage(
  plan: StockUploadPlan, target: StockFtpPreset, deps: UploadBatchDeps, counters: RunCounters,
): void {
  const tasks = plan.tasks.filter((task) => task.targetId === target.id);
  const trackers = buildTrackers(plan, tasks);
  const result = { ok: false as const, reason: "Local staging is not an upload. Select the Getty ESP API connection." };
  for (const task of tasks) recordTaskResult(task, result, { target, trackers, counters, deps });
  flushTargetStatuses(target.id, trackers);
}

/** The Getty ESP target: one icon (JPEG plus its EPS) per request. */
export async function runNetworkGroups(ctx: NetworkCtx): Promise<number> {
  const { plan, target, targetTasks, deps, counters, trackers, creds, sessionKey, itemsById } = ctx;
  let uploaded = 0;
  for (const tasks of groupUploadTasks(target, targetTasks)) {
    if (deps.signal.aborted) break;
    markUploadInFlight(tasks[0].itemId, target.id);
    const res = await uploadGroup({ plan, target, tasks, deps, creds, sessionKey, itemsById });
    if (!res.ok) reportNetworkCertificate(res, target, deps);
    else uploaded += 1;
    for (const task of tasks) recordTaskResult(task, res, { target, trackers, counters, deps });
  }
  return uploaded;
}

/** One file of one batch, with the name it travels under and the batch it belongs to. */
interface BatchFile { task: PlannedTransfer; fileName: string; batch: string }

/**
 * Every file the target sends, in the order the names carry: numbered icons
 * ascending (0001 → 0002 → 0003 …), the rest by name, cut into batches of at most
 * 100 icons. The wire name is the real name, so the site's own sort matches the
 * plan and a re-upload replaces the same file.
 */
function batchFiles(ctx: NetworkCtx): BatchFile[] {
  const icons = groupEspTasks(ctx.targetTasks);
  const order = numericIconOrder(icons.map((tasks) => tasks[0]?.fileName ?? ""));
  const batches = planIconBatches(order.length, { maxIcons: ctx.deps.ftpMaxIcons });
  const files: BatchFile[] = [];
  batches.forEach((batch, position) => {
    const label = gettyWebBatchLabel({ index: position + 1, total: batches.length });
    for (const slot of batch) {
      for (const task of icons[order[slot]]) files.push({ task, fileName: task.fileName, batch: label });
    }
  });
  return files;
}

/**
 * The FTPS/SFTP target: one file per request, walked as 100-icon batches in the
 * order the file names carry. The name on the wire is the real one, so the row,
 * the log and the site all speak the name the user planned.
 */
export async function runFileBatches(ctx: NetworkCtx): Promise<number> {
  const { target, deps, counters, trackers, creds, sessionKey, itemsById } = ctx;
  const taskCtx: TaskCtx = { target, creds, sessionKey, itemsById, deps, combine: ctx.plan.combineTitleDescription };
  let uploaded = 0;
  for (const entry of batchFiles(ctx)) {
    if (deps.signal.aborted) break;
    markUploadInFlight(entry.task.itemId, target.id);
    const res = await runSingleTask(entry.task, taskCtx, entry.fileName);
    if (!res.ok) reportNetworkCertificate(res, target, deps);
    else uploaded += 1;
    recordTaskResult(entry.task, res, { target, trackers, counters, deps, batch: entry.batch });
  }
  return uploaded;
}
