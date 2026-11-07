// useBuilderComputed.ts — the read-only projection from scan + config + checked
// ids to the library, layout, repository and the composition that gets exported.
import { useEffect, useMemo } from "react";
import { categoriesOf, filterAssets, profilesOf } from "../lib/svgBuilder/assets";
import { computeLayout } from "../lib/svgBuilder/layout";
import { composeSheet } from "../lib/svgBuilder/compose";
import type { BuilderIconAsset, BuilderProfile, SheetDocument, SheetLayout } from "../lib/svgBuilder/types";
import { builderAuditLine } from "./discovery";
import { createAssetRepository, type AssetRepository } from "./repository";
import type { BuilderModel } from "./model";

export interface BuilderComputed {
  assets: readonly BuilderIconAsset[];
  visibleAssets: readonly BuilderIconAsset[];
  categories: readonly string[];
  profiles: readonly BuilderProfile[];
  layout: SheetLayout;
  repository: AssetRepository | null;
  document: SheetDocument | null;
  auditLine: string;
}

export function useBuilderComputed(
  model: BuilderModel, placedIds: readonly string[], patch: (value: Partial<BuilderModel>) => void,
): BuilderComputed {
  const assets = useMemo(() => model.discovery?.assets ?? [], [model.discovery]);
  const categories = useMemo(() => categoriesOf(assets), [assets]);
  const profiles = useMemo(() => profilesOf(assets), [assets]);
  const visibleAssets = useMemo(() => filterAssets(assets, model.listView.query, model.listView.category),
    [assets, model.listView.query, model.listView.category]);
  const layout = useMemo(() => computeLayout(model.config), [model.config]);
  const repository = useMemo(() => model.root === null ? null : createAssetRepository(model.root, assets),
    [model.root, assets]);
  const needed = useMemo(() => withHero(placedIds, model.config.banner.heroIconId), [placedIds, model.config.banner.heroIconId]);
  useLoadSvgTexts(repository, needed, model.svgTexts, patch);
  const ready = useMemo(() => placedIds.every((id) => model.svgTexts[id] !== undefined),
    [placedIds, model.svgTexts]);
  const document = useMemo(() => repository === null || !ready ? null : composeSheet({
    config: model.config, layout, assets, placedIds, svgTexts: model.svgTexts, metadata: model.metadata,
  }), [repository, ready, model.config, layout, assets, placedIds, model.svgTexts, model.metadata]);
  const auditLine = useMemo(() => model.discovery === null ? "No approved assets scanned yet"
    : builderAuditLine(model.discovery), [model.discovery]);
  return { assets, visibleAssets, categories, profiles, layout, repository, document, auditLine };
}

/** The banner's chosen hero icon is read like a placed icon. */
function withHero(placedIds: readonly string[], heroId: string | null): readonly string[] {
  return heroId === null || placedIds.includes(heroId) ? placedIds : [...placedIds, heroId];
}

function useLoadSvgTexts(
  repository: AssetRepository | null, placedIds: readonly string[],
  texts: Readonly<Record<string, string>>, patch: (value: Partial<BuilderModel>) => void,
): void {
  useEffect(() => {
    if (repository === null) return;
    const missing = placedIds.filter((id) => texts[id] === undefined);
    if (missing.length === 0) return;
    let alive = true;
    void Promise.all(missing.map(async (id) => [id, await repository.readSvg(id) ?? ""] as const))
      .then((entries) => {
        if (!alive) return;
        patch({ svgTexts: { ...texts, ...Object.fromEntries(entries) } });
      });
    return () => { alive = false; };
  }, [repository, placedIds, texts, patch]);
}
