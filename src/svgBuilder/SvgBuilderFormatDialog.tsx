// SvgBuilderFormatDialog.tsx — the builder's Export settings POPUP (2026-11-17,
// fixed 2026-11-19): the SAME row groups the upload dialog renders
// (ui/exportrows.tsx), over the builder's own persisted options
// (formatstore). Every gesture saves at once (RULE 24); the stock package and
// its JPEG/EPS stages read exactly these options (sheetpackage.ts).
//
// 2026-11-19: it is a real modal now — `.bld-backdrop` + `role="dialog"`, with
// Escape and a backdrop press closing it. Before this it was a `position:
// static` section appended at the bottom of the builder's grid, so pressing
// "Export settings…" appeared to do nothing until the page was scrolled past
// the sticky header. The JPEG hint also names the exact px the artboard, the
// rescale and the MP choice spell out.
import { useEffect } from "react";
import { formatSummary, rescaledArtboard, type ArtboardBox, type ExportFormatOptions } from "../lib/exportformats";
import { FormatDeliveryRows, FormatJpegRows, FormatOffWarning, FormatTransformRows } from "../ui/exportrows";
import { useBuilderFormats } from "./formatstore";
import type { BuilderApi } from "./useSvgBuilder";

export interface BuilderFormatSettingsProps {
  value: ExportFormatOptions;
  onPatch: (patch: Partial<ExportFormatOptions>) => void;
  onClose: () => void;
  /** The composed sheet's own px, so the JPEG hints name the real file. */
  artboard: ArtboardBox;
}

/** The popup's rows, as pure props: the mounted dialog and the tests share one markup. */
export function BuilderFormatSettings({ value, onPatch, onClose, artboard }: BuilderFormatSettingsProps) {
  const wiring = { prefix: "bld-set" as const, value, onChange: onPatch };
  const scaled = rescaledArtboard(artboard.width, artboard.height, value);
  return (
    <section className="bld-modal bld-format-dialog" role="dialog" aria-modal="true" aria-label="Export settings" data-testid="builder-format-dialog">
      <header className="bld-modal-head">
        <div>
          <span className="bld-eyebrow">EXPORT SETTINGS · {formatSummary(value).toUpperCase()}</span>
          <h3>The next exported package</h3>
        </div>
        <button type="button" className="svg-btn tiny" data-testid="builder-format-close" onClick={onClose}>Close</button>
      </header>
      <p className="bld-hint" data-testid="builder-format-summary">
        Artboard {scaled.width}×{scaled.height} px{value.rescaleArtboard ? ` (rescaled from ${artboard.width}×${artboard.height})` : ""} —
        the sheet's own look only; nothing from another tab shapes it.
      </p>
      <div className="up-set-grid">
        <FormatDeliveryRows w={wiring} />
        <FormatJpegRows w={wiring} artboard={artboard} />
        <FormatTransformRows w={wiring} />
        <FormatOffWarning w={wiring} />
      </div>
    </section>
  );
}

/** The mounted popup: one backdrop, Escape / backdrop press, and the stored options. */
export default function SvgBuilderFormatDialog({ b }: { b: BuilderApi }) {
  const { value, patch } = useBuilderFormats();
  const close = b.actions.closeDialog;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);
  const { width, height } = b.config.artboard;
  return <div className="bld-backdrop" role="presentation" data-testid="builder-format-backdrop"
    onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
    <BuilderFormatSettings value={value} onPatch={patch} onClose={close} artboard={{ width, height }} />
  </div>;
}
