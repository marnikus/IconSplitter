// settingsfield.tsx — what every row of the export settings dialog shares
// (2026-10-08): the dialog's props, the inherited/overridden marker, and the
// ONE write path a field change takes — the global defaults in the global
// scope, the icon's override (live, one undoable gesture) in the icon scope.
// Owned here so the number/toggle rows (UploadSettingsDialog) and the paint
// rows (UploadPaintSettings) cannot drift apart.

import type { SettingsOverrides, UploadSettings } from "../lib/upload/settings";

export interface UploadSettingsDialogProps {
  /** null = the global defaults; else the icon's file name. */
  scope: string | null;
  /** null = the global scope; else the pair id whose override is edited. */
  id: string | null;
  defaults: UploadSettings;
  /** The icon's current override ({} in the global scope). */
  overrides: SettingsOverrides;
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

/** The marker a field carries in the icon scope: pinned, or inherited. */
export function markerOf(p: UploadSettingsDialogProps, field: keyof UploadSettings): string | null {
  if (p.id === null) return null;
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
