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
import { useTextSubset } from "./textsubset";

/** How many library icons the template pictures draw from. */
const TEMPLATE_SAMPLE = 64;
import { artboardIcons, pendingUse as pendingOf } from "../lib/svgBuilder/artboards";

export interface BuilderComputed extends IconIndexView {
  /** Icons on artboards whose use is not saved yet, per icon (artboards.ts `pendingUse`). */
  pendingUse: ReadonlyMap<string, number>;
  /** The library icons every template picture draws (a stable sample, 2026-11-15). */
  templateSampleIds: readonly string[];
  /** Every library icon id (pictures wait only for icons the library has). */
  knownIds: ReadonlySet<string>;
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
  const { document, templateSampleIds } = useStageDocument({ model, placedIds, patch, assets, layout, repository });
  const auditLine = useMemo(() => model.discovery === null ? "No approved assets scanned yet"
    : builderAuditLine(model.discovery), [model.discovery]);
  const indexView = useIconIndex(assets, model.discovery?.index, { placed: placedIds, locked: model.lockedIds, textWeight: model.recipe.textWeight });
  // The open artboard counts with what its stage shows now, saved or not (2026-11-14: edits are a draft until saved).
  const pendingUse = useMemo(() => pendingOf(model.artboards.map((a) => (a.id === model.editingArtboardId ? { ...a, placedIds: [...placedIds] } : a))),
    [model.artboards, model.editingArtboardId, placedIds]);
  const knownIds = useMemo(() => new Set(assets.map((a) => a.id)), [assets]);
  return { assets, visibleAssets, categories, profiles, layout, repository, document, auditLine, pendingUse, templateSampleIds, knownIds, ...indexView };
}

interface StageArgs {
  model: BuilderModel; placedIds: readonly string[]; patch: (value: Partial<BuilderModel>) => void;
  assets: readonly BuilderIconAsset[]; layout: SheetLayout; repository: AssetRepository | null;
}

/**
 * The icon texts to load (the stage's, the listed artboards' and the template
 * sample's) and the stage's composed sheet — recomposed only when the stage's
 * own icons change (2026-11-15, performance).
 */
function useStageDocument({ model, placedIds, patch, assets, layout, repository }: StageArgs) {
  const realIds = useMemo(() => placedOnly(placedIds), [placedIds]);
  const shownIcons = useMemo(() => visibleArtboards(model).flatMap(artboardIcons), [model.templates, model.templateSel, model.artboards]); // eslint-disable-line react-hooks/exhaustive-deps
  // Template pictures draw a STABLE sample of the library: changing the stage's icons never redraws them all.
  const templateSampleIds = useMemo(() => (model.templates.length === 0 ? [] : assets.slice(0, TEMPLATE_SAMPLE).map((a) => a.id)), [assets, model.templates.length]);
  const stageIds = useMemo(() => withHero(realIds, model.config.banner.heroIconId), [realIds, model.config.banner.heroIconId]);
  const needed = useMemo(() => [...new Set([...stageIds, ...shownIcons, ...templateSampleIds])], [stageIds, shownIcons, templateSampleIds]);
  useLoadSvgTexts(repository, needed, model.svgTexts, patch);
  const stageTexts = useTextSubset(stageIds, model.svgTexts);
  const ready = realIds.every((id) => stageTexts[id] !== undefined);
  const document = useMemo(() => repository === null || !ready ? null : composeSheet({
    config: model.config, layout, assets, placedIds, svgTexts: stageTexts, metadata: model.metadata,
  }), [repository, ready, model.config, layout, assets, placedIds, stageTexts, model.metadata]);
  return { document, templateSampleIds };
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
