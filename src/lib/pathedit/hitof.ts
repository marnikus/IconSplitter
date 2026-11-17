// hitof.ts — what is under the pointer (2026-11-06; own file 2026-11-10): the
// hit radii are SCREEN pixels turned into path units, and only the SELECTED
// objects are editable (the others are only snappable). One lookup for the
// gesture rules (gesture.ts) and the line gestures (linegesture.ts).

import { hitTest, type Hit, type HitRadii } from "./hit";
import { HIT_PX } from "./hitpx";
import type { AnchorRef } from "./model";
import { editableSub, type EditSession } from "./session";
import type { PointerInput } from "./gesture";

export function radii(u: number): HitRadii {
  return { anchor: HIT_PX.anchor * u, handle: HIT_PX.handle * u, segment: HIT_PX.segment * u };
}

/** What is under the pointer among the SELECTED objects (others are not editable, only snappable). */
export function hitOf(s: EditSession, input: PointerInput, selection: readonly AnchorRef[] = s.selection): Hit {
  return hitTest(s.model, input.p, { radii: radii(input.unitsPerPx), selected: selection, editable: (sub) => editableSub(s, sub) });
}
