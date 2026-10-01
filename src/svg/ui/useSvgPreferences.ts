// ui/useSvgPreferences.ts — shared React binding for validated SVG settings and
// global undo/redo. Secret credentials never enter this store or its history.

import { useCallback, useSyncExternalStore } from "react";
import { getAppState } from "../../state/appstore";
import { useHistory } from "../../state/HistoryProvider";
import { containsCredential, parseSvgPreferences, type SvgPreferences } from "../prefs";
import { getSvgPreferences, setSvgPreferences, subscribeSvgPreferences } from "../prefsstore";

export type SvgPreferencePatch = Partial<SvgPreferences>;

export function useSvgPreferences() {
  const history = useHistory();
  const prefs = useSyncExternalStore(subscribeSvgPreferences, getSvgPreferences, getSvgPreferences);
  const edit = useCallback((patch: SvgPreferencePatch, label: string, gesture = false): boolean => {
    if (Object.values(patch).some((value) => typeof value === "string" && containsCredential(value))) return false;
    const before = getSvgPreferences();
    const after = parseSvgPreferences({ ...before, ...patch });
    setSvgPreferences(after);
    const entry = { type: "svgPrefs", label, origin: getAppState().tab, ids: Object.keys(patch), before, after };
    if (gesture) history.pushGesture(entry);
    else history.push(entry);
    return true;
  }, [history]);
  return { prefs, edit };
}
