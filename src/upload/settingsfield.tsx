// settingsfield.tsx — what every row of the export settings dialog shares
// (2026-10-08): the dialog's props, the inherited/overridden marker, and the
// ONE write path a field change takes — the global defaults in the global
// scope, the icon's override (live, one undoable gesture) in the icon scope.
// Owned here so the number/toggle rows (UploadSettingsDialog) and the paint
// rows (UploadPaintSettings) cannot drift apart.

import { decorationOf, isApplied, type AppliedDecorations } from "../lib/upload/decorations";
import type { SettingsOverrides, UploadSettings } from "../lib/upload/settings";
import type { SelectedShadow } from "./shadowselection";
import type { SelectedBadge } from "./badgeselection";
import type { SelectedSizeGuide } from "./sizeguideselection";

export interface UploadSettingsDialogProps {
  /** null = the global defaults; else the icon's file name. */
  scope: string | null;
  /** null = the global scope; else the pair id whose override is edited. */
  id: string | null;
  defaults: UploadSettings;
  /** The icon's current override ({} in the global scope). */
  overrides: SettingsOverrides;
  /** Decorations the checked-set control applied to this icon ({} in the global scope). */
  applied: AppliedDecorations;
  selectedShadow: SelectedShadow;
  selectedCount: number;
  onSelectedShadowToggle: () => void;
  onSelectedShadowDimensions: (patch: Partial<Pick<UploadSettings, "shadowWidthPct" | "shadowGapPct">>) => void;
  selectedBadge: SelectedBadge;
  onSelectedBadgeToggle: () => void;
  selectedSizeGuide: SelectedSizeGuide;
  onSelectedSizeGuideToggle: () => void;
  onDefaults: (patch: Partial<UploadSettings>) => void;
  onOverride: (id: string, patch: SettingsOverrides) => void;
  onResetOverride: (id: string) => void;
  onClose: () => void;
}

/** What one field row needs: the dialog props and the effective settings. */
export interface SettingsFieldProps {
  p: UploadSettingsDialogProps;
  effective: UploadSettings;
}

/**
 * The marker a field carries in the icon scope: pinned, or inherited. A
 * decoration the checked-set control applied is NOT a pin — the icon got it
 * from the selection, not from its own dialog (2026-10-21).
 */
export function markerOf(p: UploadSettingsDialogProps, field: keyof UploadSettings): string | null {
  if (p.id === null) return null;
  const key = decorationOf(field);
  if (key !== null && isApplied(p.applied, key)) return "inherited";
  return p.overrides[field] !== undefined ? "overridden" : "inherited";
}

export function Marker({ p, field, testid }: { p: UploadSettingsDialogProps; field: keyof UploadSettings; testid: string }) {
  const marker = markerOf(p, field);
  if (marker === null) return null;
  return <em className={`up-marker ${marker}`} data-testid={`upload-set-marker-${testid}`}>{marker}</em>;
}

/** One field change → the global defaults or the icon's override (live). */
export function change<K extends keyof UploadSettings>(p: UploadSettingsDialogProps, field: K, value: UploadSettings[K]): void {
  changeMany(p, { [field]: value });
}

/** Several fields at once — one gesture, one undoable override entry. */
export function changeMany(p: UploadSettingsDialogProps, patch: Partial<UploadSettings>): void {
  if (p.id === null) {
    p.onDefaults(patch);
    return;
  }
  p.onOverride(p.id, { ...p.overrides, ...patch });
}
