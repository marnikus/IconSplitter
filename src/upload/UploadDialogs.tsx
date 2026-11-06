// UploadDialogs.tsx — settings, metadata confirm, and row-badge catalog popups.
import { useMemo } from "react";
import { selectedDecorations } from "./decorationselection";
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
  return <OpenSettingsDialog g={g} id={dialog.id} />;
}

function OpenSettingsDialog({ g, id }: { g: UploadApi; id: string | null }) {
  const selected = useMemo(() => selectedDecorations(g.checked, g.defaults, g.overrides, g.applied),
    [g.checked, g.defaults, g.overrides, g.applied]);
  const row = id === null ? null : g.rows.find((r) => r.source.id === id) ?? null;
  return (
    <UploadSettingsDialog
      scope={id === null ? null : row?.source.svgName ?? id}
      id={id} defaults={g.defaults} overrides={ownMap(g.overrides, id)} applied={ownMap(g.applied, id)}
      selectedShadow={selected.shadow}
      selectedCount={g.checked.length}
      onSelectedShadowToggle={() => g.toggleShadowSelected(g.checked)}
      onSelectedShadowDimensions={(patch) => g.setShadowSelected(g.checked, patch)}
      selectedBadge={selected.badge}
      onSelectedBadgeToggle={() => g.toggleBadgeSelected(g.checked)}
      selectedSizeGuide={selected.sizeGuide}
      onSelectedSizeGuideToggle={() => g.toggleSizeGuideSelected(g.checked)}
      onApplyLocal={() => g.applySettingsSelected(g.checked)}
      onDefaults={g.setDefaults} onOverride={g.setOverride}
      onResetOverride={g.resetOverride} onClose={g.dismissDialog} />
  );
}

function ownMap<T>(map: Record<string, T>, id: string | null): Partial<T> {
  return (id === null ? undefined : map[id]) ?? {};
}
