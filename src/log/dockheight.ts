// dockheight.ts — the ONE number the app's floating chrome needs (design
// D-log-2). The log dock is a row of the app shell, so it takes its space from
// the layout; the app's `position: fixed` toasts cannot read a flex row, so the
// dock publishes its own height as `--app-dock-h` and they position themselves
// above it (`.svg-toast`, `.svg-busy`, `.toast-above-dock`). One writer, one
// value: minimize/restore moves them with the dock instead of hiding them
// behind it (RULE 10).

/** The header row: the count, the follow state and the four controls. */
export const LOG_DOCK_HEAD_PX = 36;
/** The scrolling body, so the dock never grows with the log. */
export const LOG_DOCK_BODY_PX = 200;
/** The custom property the fixed floats read; 0 px means "no dock yet". */
export const DOCK_HEIGHT_VAR = "--app-dock-h";

/** What the dock occupies on screen right now. */
export function dockHeightPx(minimized: boolean): number {
  return LOG_DOCK_HEAD_PX + (minimized ? 0 : LOG_DOCK_BODY_PX);
}

/** Publishes the height for the CSS that needs it (idempotent). */
export function setDockHeight(px: number): void {
  const value = Math.max(0, Math.round(px));
  document.documentElement.style.setProperty(DOCK_HEIGHT_VAR, `${value}px`);
}
