// SvgBuilderMetaOptions.tsx — the two choices of a metadata confirmation
// (2026-11-23), remembered in the builder prefs: the image sent is the whole
// sheet with its banner or only its icons (the exact images are drawn again at
// once), and the answer's title replaces the banner words or only the metadata
// is filled. Shared by the sheet's and the artboards' confirmations.
import type { BuilderApi } from "./useSvgBuilder";

export default function SvgBuilderMetaOptions({ b, disabled = false }: { b: BuilderApi; disabled?: boolean }) {
  return <div className="bld-meta-options" data-testid="builder-meta-options">
    <label className="bld-meta-option">
      <input type="checkbox" data-testid="builder-meta-full-sheet" checked={b.prefs.metaFullSheet} disabled={disabled}
        onChange={(e) => b.actions.setMetaOptions({ fullSheet: e.target.checked })} />
      Send the whole sheet with its banner <small>(unticked: only the icons)</small>
    </label>
    <label className="bld-meta-option">
      <input type="checkbox" data-testid="builder-meta-title-banner" checked={b.prefs.metaTitleToBanner} disabled={disabled}
        onChange={(e) => b.actions.setMetaOptions({ titleToBanner: e.target.checked })} />
      Put the answer's title on the banner <small>(unticked: only the metadata is filled)</small>
    </label>
  </div>;
}

/** What the image shows, for captions and alt texts. */
export const imageWords = (b: BuilderApi): string => (b.prefs.metaFullSheet ? "whole sheet with its banner" : "icons only, without the banner");
