// repository.ts — one read-only, fingerprint-aware repository over the approved
// asset rows. SVG text and sanitised previews are cached by stable asset id and
// invalidated when a new root/scan is committed.
import { buildSvgPreview, type SvgPreview } from "../lib/svgpreview";
import { validateSvg } from "../lib/svgvalidate";
import type { BuilderIconAsset } from "../lib/svgBuilder/types";
import type { DirHandleLike } from "../lib/fs";
import { readSvgText } from "../svg/svgfiles";

export interface AssetRender {
  ok: boolean; html: string; viewBox: string; ratio: number; error: string | null;
}

export interface AssetRepository {
  list(): readonly BuilderIconAsset[];
  byId(id: string): BuilderIconAsset | null;
  fingerprintOf(id: string): string | null;
  readSvg(id: string): Promise<string | null>;
  render(id: string): Promise<AssetRender>;
  invalidate(): void;
}

export function createAssetRepository(root: DirHandleLike, assets: readonly BuilderIconAsset[]): AssetRepository {
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const texts = new Map<string, string>();
  const previews = new Map<string, SvgPreview>();
  return {
    list: () => assets,
    byId: (id) => byId.get(id) ?? null,
    fingerprintOf: (id) => byId.get(id)?.fingerprint ?? null,
    readSvg: (id) => readText(root, byId.get(id), texts),
    render: (id) => renderAsset(root, byId.get(id), texts, previews),
    invalidate: () => { texts.clear(); previews.clear(); },
  };
}

async function readText(
  root: DirHandleLike, asset: BuilderIconAsset | undefined, cache: Map<string, string>,
): Promise<string | null> {
  if (asset === undefined) return null;
  const hit = cache.get(asset.id);
  if (hit !== undefined) return hit;
  const code = await readSvgText(root, asset.svgPath);
  if (code === null || !validateSvg(code).ok) return null;
  cache.set(asset.id, code);
  return code;
}

async function renderAsset(
  root: DirHandleLike, asset: BuilderIconAsset | undefined,
  texts: Map<string, string>, previews: Map<string, SvgPreview>,
): Promise<AssetRender> {
  if (asset === undefined) return failed("approved asset is no longer in this scan");
  const hit = previews.get(asset.id);
  if (hit !== undefined) return previewResult(hit);
  const code = await readText(root, asset, texts);
  if (code === null) return failed("approved SVG could not be read or validated");
  const preview = buildSvgPreview(code);
  previews.set(asset.id, preview);
  return previewResult(preview);
}

function previewResult(preview: SvgPreview): AssetRender {
  return { ok: preview.ok, html: preview.html, viewBox: preview.viewBox, ratio: preview.ratio, error: preview.error };
}

function failed(error: string): AssetRender {
  return { ok: false, html: "", viewBox: "", ratio: 1, error };
}
