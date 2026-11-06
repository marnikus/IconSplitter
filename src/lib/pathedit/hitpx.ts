// hitpx.ts — the edit mode's hit and chrome sizes in SCREEN pixels (shared by
// the gesture rules, the box targeting and the overlay; 2026-11-06).

/** Generous anchors and handles, a 6 px band around a segment, the box and its rotate zones. */
export const HIT_PX = {
  anchor: 9, handle: 9, segment: 6, snap: 8, pull: 3, pick: 14,
  scalePad: 8, scaleHandle: 6, rotateStem: 24, rotateReach: 20,
};
