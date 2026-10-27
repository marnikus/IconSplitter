import { isRecord } from "../isrecord";
import { STOCK_KINDS, type StockArtifact, type StockPackage, type StockKind } from "./types";
import type { IconMetadata } from "../upload/meta";
import { safeMediaName } from "./safety";

/** Never trust the old export reader's structural cast at a network boundary. */
export function readStockRecord(raw: unknown, dir: string): StockPackage | null {
  if (!committed(raw) || !isRecord(raw.outputs)) return null;
  const outputs = raw.outputs;
  const artifacts = STOCK_KINDS.flatMap((kind) => artifactOf(outputs, kind, dir));
  if (artifacts.length === 0 || new Set(artifacts.map(a => a.name.replace(/\.[^.]+$/, ""))).size !== 1) return null;
  return { id: `${dir}/export.json`, pairId: isRecord(raw.pair) && typeof raw.pair.id === "string" ? raw.pair.id : `${dir}/export.json`, dir, name: artifacts[0].name.replace(/\.[^.]+$/, ""), artifacts,
    metadata: metadataOf(raw.metadata), recordText: JSON.stringify(raw, null, 2), warning: raw.status === "processed" ? "" : "Previously committed partial/stale package" };
}

function committed(raw: unknown): raw is Record<string, unknown> {
  if (!isRecord(raw) || raw.v !== 1 || raw.stage !== "committed") return false;
  if (!["processed", "partial", "stale"].includes(String(raw.status))) return false;
  if (!isRecord(raw.timestamps) || !Number.isFinite(Date.parse(String(raw.timestamps.committedAt)))) return false;
  return isRecord(raw.validation) && raw.validation.json === true && raw.validation.readback === true;
}

function artifactOf(outputs: Record<string, unknown>, kind: StockKind, dir: string): StockArtifact[] {
  const o = outputs[kind];
  if (!isRecord(o) || typeof o.path !== "string" || !safeOutputPath(o.path)) return [];
  const name = o.path.split("/").slice(-1)[0]!;
  if (!safeMediaName(name) || !extensionMatches(name, kind)) return [];
  if (!validOutputSize(o.bytes)) return [];
  if (typeof o.hash !== "string") return [];
  const hash = o.hash.replace(/^sha256:/, "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hash)) return [];
  return [{ kind, name, path: dir === "" ? name : `${dir}/${name}`, bytes: o.bytes, hash }];
}

function safeOutputPath(path: string): boolean {
  const parts = path.split("/");
  return parts.length >= 2 && parts.slice(-2)[0] === "export" && parts.every(p => p !== "" && p !== "." && p !== ".." && !/[\\%:]/.test(p) && Array.from(p).every(c => c.charCodeAt(0) >= 32));
}
function extensionMatches(name: string, kind: StockKind): boolean {
  const ext = name.split(".").slice(-1)[0]!.toLowerCase();
  return kind === "jpg" ? ext === "jpg" || ext === "jpeg" : ext === kind;
}
function metadataOf(raw: unknown): IconMetadata {
  if (!isRecord(raw)) return { title: "", description: "", tags: [] };
  return { title: typeof raw.title === "string" ? raw.title : "", description: typeof raw.description === "string" ? raw.description : "",
    tags: Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === "string") : [],
    creator: typeof raw.creator === "string" ? raw.creator : "", copyright: typeof raw.copyright === "string" ? raw.copyright : "" };
}

function validOutputSize(bytes: unknown): bytes is number {
  return typeof bytes === "number" && Number.isSafeInteger(bytes) && bytes > 0 && bytes <= 100_000_000;
}
