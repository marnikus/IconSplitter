// rowgesture.ts — one guard for checkable-list rows and their nested controls.

import type { MouseEvent } from "react";

const CONTROL = "button, input, select, textarea, a, label, summary, [contenteditable], [role=button], [role=checkbox]";

/** A row gesture starts on its content, never on a child control. */
export function isRowGestureClick(e: MouseEvent<Element>): boolean {
  return e.target instanceof Element && e.target.closest(CONTROL) === null;
}

/** Arrow and Space keys stay native when a nested control owns focus. */
export function isNativeListKeyTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(CONTROL) !== null;
}
