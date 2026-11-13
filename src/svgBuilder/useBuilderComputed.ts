// useBuilderComputed.ts — the read-only projection from scan + config + checked
// ids to the library, layout, repository and the composition that gets exported.
import { useEffect, useMemo } from "react";
import { categoriesOf, filterAssets, profilesOf } from "../lib/svgBuilder/assets";
import { computeLayout } from "../lib/svgBuilder/layout";
import { composeSheet } from "../lib/svgBuilder/compose";
import type { BuilderIconAsset, BuilderProfile, SheetDocument, SheetLayout } from "../lib/svgBuilder/types";
import { builderAuditLine } from "./discovery";
import { createAssetRepository, type AssetRepository } from "./repository";
import { useIconIndex, type IconIndexView } from "./useIconIndex";
import { placedOnly } from "../lib/svgBuilder/slots";
import type { BuilderModel } from "./model";
import { visibleArtboards } from "./artboardview";
import { artboardIcons, pendingUse as pendingOf } from "../lib/svgBuilder/artboards";

export interface BuilderComputed extends IconIndexView {
  /** Icons on artboards whose use is not saved yet, per icon (artboards.ts `pendingUse`). */
  pendingUse: ReadonlyMap<string, number>;
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
  const realIds = useMemo(() => placedOnly(placedIds), [placedIds]);
  // The icons the stage needs, plus those of the artboards the list shows (their row previews).
  const shownIcons = useMemo(() => visibleArtboards(model).flatMap(artboardIcons), [model.templates, model.templateSel, model.artboards]); // eslint-disable-line react-hooks/exhaustive-deps
  const needed = useMemo(() => [...new Set([...withHero(realIds, model.config.banner.heroIconId), ...shownIcons])],
    [realIds, model.config.banner.heroIconId, shownIcons]);
  useLoadSvgTexts(repository, needed, model.svgTexts, patch);
  const ready = useMemo(() => realIds.every((id) => model.svgTexts[id] !== undefined),
    [realIds, model.svgTexts]);
  const document = useMemo(() => repository === null || !ready ? null : composeSheet({
    config: model.config, layout, assets, placedIds, svgTexts: model.svgTexts, metadata: model.metadata,
  }), [repository, ready, model.config, layout, assets, placedIds, model.svgTexts, model.metadata]);
  const auditLine = useMemo(() => model.discovery === null ? "No approved assets scanned yet"
    : builderAuditLine(model.discovery), [model.discovery]);
  const indexView = useIconIndex(assets, model.discovery?.index, { placed: placedIds, locked: model.lockedIds, textWeight: model.recipe.textWeight });
  const pendingUse = useMemo(() => pendingOf(model.artboards), [model.artboards]);
  return { assets, visibleAssets, categories, profiles, layout, repository, document, auditLine, pendingUse, ...indexView };
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
