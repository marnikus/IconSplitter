// PairedThumbs.tsx — the two previews of one pair, laid out the one way both
// tabs use (I-55). Why shared: the request is explicit that Selection V2 and
// Generate SVG must zoom and preview identically, so the flex row, the labelled
// slots and the box rule live here and nowhere else. What differs per tab is the
// MEDIA inside a slot (an image, or an inline SVG in the user's frame) — never
// the layout.
//
// Every slot has a REAL box (width and height in px, computed by lib/zoom from
// the artwork's own ratio), so a pair at 800 px is drawn at 800 px: nothing is
// cropped by a cap, stretched to a shape it is not, or painted over its
// neighbour. The label is an overlay inside the slot, so it never changes the
// box or pushes the artwork.

import type { ReactNode } from "react";

export interface PreviewSlot {
  /** The label on the slot, e.g. "Original" / "AI source" / "SVG v2". */
  tag: string;
  /** The slot's testid, so a test can read its box and its label. */
  testid?: string;
  /** The box the artwork is drawn in; both from lib/zoom. */
  width: number;
  height: number;
  /** Extra class on the slot (the SVG side carries its preview frame). */
  className?: string;
  /** Colour behind the artwork — the SVG side's chosen background. */
  background?: string;
  /** Extra data attributes on the slot (e.g. the frame's data-bg). */
  attrs?: Record<string, string | undefined>;
  children: ReactNode;
}

export default function PairedThumbs({ slots }: { slots: [PreviewSlot, PreviewSlot] }) {
  return (
    <div className="pair-thumbs">
      <Slot slot={slots[0]} />
      <Slot slot={slots[1]} />
    </div>
  );
}

function Slot({ slot }: { slot: PreviewSlot }) {
  const style = { width: `${slot.width}px`, height: `${slot.height}px`, background: slot.background };
  const className = slot.className ? `pair-thumb ${slot.className}` : "pair-thumb";
  return (
    <span className={className} style={style} data-testid={slot.testid} {...slot.attrs}>
      {slot.children}
      <span className="pair-thumb-tag">{slot.tag}</span>
    </span>
  );
}
