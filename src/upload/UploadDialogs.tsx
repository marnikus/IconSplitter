// UploadDialogs.tsx — settings, metadata confirm, and row-badge catalog popups.
import { selectedShadow } from "./shadowselection";
import { selectedBadge } from "./badgeselection";
import { selectedSizeGuide } from "./sizeguideselection";
import UploadMetaDialog from "./UploadMetaDialog";
import UploadSettingsDialog from "./UploadSettingsDialog";
import UploadRowBadgeSettings from "./UploadRowBadgeSettings";
import type { UploadApi } from "./useUpload";

export default function UploadDialogs({ g }: { g: UploadApi }) {
  const dialog = g.dialog;
  return (
    <>
      <SettingsDialog g={g} />
      {dialog !== null && dialog.kind === "meta" && <UploadMetaDialog g={g} dialog={dialog} />}
      {dialog !== null && dialog.kind === "rowBadges" && (
        <UploadRowBadgeSettings state={g.rowBadges} onAdd={g.addRowBadge} onRename={g.renameRowBadge}
          onRecolor={g.recolorRowBadge} onRemove={g.removeRowBadge} onClose={g.dismissDialog} />
      )}
    </>
  );
}

function SettingsDialog({ g }: { g: UploadApi }) {
  const dialog = g.dialog;
  if (dialog === null || dialog.kind !== "settings") return null;
  const id = dialog.id;
  const row = id === null ? null : g.rows.find((r) => r.source.id === id) ?? null;
  return (
    <UploadSettingsDialog
      scope={id === null ? null : row?.source.svgName ?? id}
      id={id}
      defaults={g.defaults}
      overrides={ownMap(g.overrides, id)}
      applied={ownMap(g.applied, id)}
      selectedShadow={selectedShadow(g.checked, g.defaults, g.overrides, g.applied)}
      selectedCount={g.checked.length}
      onSelectedShadowToggle={() => g.toggleShadowSelected(g.checked)}
      onSelectedShadowDimensions={(patch) => g.setShadowSelected(g.checked, patch)}
      selectedBadge={selectedBadge(g.checked, g.defaults, g.overrides, g.applied)}
      onSelectedBadgeToggle={() => g.toggleBadgeSelected(g.checked)}
      selectedSizeGuide={selectedSizeGuide(g.checked, g.defaults, g.overrides, g.applied)}
      onSelectedSizeGuideToggle={() => g.toggleSizeGuideSelected(g.checked)}
      onDefaults={g.setDefaults}
      onOverride={g.setOverride}
      onResetOverride={g.resetOverride}
      onClose={g.dismissDialog} />
  );
}

function ownMap<T>(map: Record<string, T>, id: string | null): Partial<T> {
  return (id === null ? undefined : map[id]) ?? {};
}
