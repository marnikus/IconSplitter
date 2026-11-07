// BuilderMetaPanel.tsx — the sheet's metadata, and the provider it comes from
// (design §5.6/§5.8, P6).
//
// Two halves, both deliberate:
//
//   1. The prompt and the provider are the "SVG to upload" furniture — the same
//      prompt window, the same masked key slot, and the SAME stored provider config,
//      so a model chosen once is chosen everywhere. One honest line says what the
//      builder discloses instead of an image: the sheet's SVG source.
//   2. The disclosure and the answer. The button never sends on its own: it states
//      the mode, the character count and the icon count, and only a click sends.
//      A record that describes an EARLIER sheet is shown as stale, never as current.
//
// A partial truth here would be the worst kind: the user is told exactly what leaves
// the device, how much of it, and what came back.

import PromptWindow, { type PromptWindowProps } from "../ui/PromptWindow";
import { KeySlot, type KeySlotText } from "../ui/KeySlot";
import type { SheetMetaRecord } from "../lib/builder/metastore";
import type { BuilderMeta } from "./useBuilderMeta";
import type { SheetMetaResult } from "./metarun";
import type { SheetMetaArgs } from "../lib/builder/metarequest";

export interface BuilderMetaPanelProps {
  meta: BuilderMeta;
  /** The sheet as the request would see it (built by the panel from live state). */
  sheetArgs: SheetMetaArgs;
  /** How many cells actually carry an icon — the honest denominator. */
  iconCount: number;
  last: SheetMetaResult | null;
  onGenerate: () => void;
}

const KEY_TEXT: KeySlotText = { testid: "builder", placeholder: "AIza…", ariaLabel: "Gemini API key" };

export default function BuilderMetaPanel(p: BuilderMetaPanelProps) {
  return (
    <section className="bld-controls" data-testid="builder-meta" aria-label="Sheet metadata">
      <h3 className="bld-group-title">Sheet metadata</h3>
      <PromptWindow {...promptPropsOf(p.meta)} />
      <p className="bld-note" data-testid="builder-prompt-honesty">
        The prompt speaks of an icon image; the builder discloses the sheet&apos;s SVG source instead — the
        rules and the validation are identical to SVG to upload.
      </p>
      <Disclosure meta={p.meta} iconCount={p.iconCount} />
      <button type="button" className="svg-btn" data-testid="builder-meta-generate"
        disabled={p.meta.busy !== null} onClick={p.onGenerate}>
        {p.meta.busy ?? "Generate sheet metadata"}
      </button>
      <ProviderFields meta={p.meta} />
      <Record record={p.meta.record} stale={p.meta.stale} last={p.last} />
    </section>
  );
}

/** The prompt window's props: the same window "SVG to upload" renders. */
function promptPropsOf(meta: BuilderMeta): PromptWindowProps {
  return {
    testId: "builder",
    label: "Metadata prompt",
    text: meta.prompt,
    isDefault: meta.isDefault,
    editorClass: "up-prompt-editor",
    presets: meta.presets,
    picked: "",
    onText: meta.setPrompt,
    onReset: meta.resetPrompt,
    onPick: meta.pickPreset,
    onQuickLoad: () => meta.pickPreset(meta.presets[0]?.name ?? ""),
    onDelete: meta.deletePreset,
    onSaveAs: meta.savePreset,
  };
}

/** What the next request would send — stated before anything is sent. */
function Disclosure({ meta, iconCount }: { meta: BuilderMeta; iconCount: number }) {
  return (
    <div className="bld-group" data-testid="builder-meta-disclosure" data-mode={meta.disclosure.mode}>
      <h4 className="bld-group-title">What is sent</h4>
      {meta.disclosure.lines.map((line) => <p key={line} className="bld-note">{line}</p>)}
      <p className="bld-note" data-testid="builder-meta-count">
        {iconCount === 0 ? "No icon is placed yet — a sheet with no icons can still be described, but say so." : `${iconCount} icon${iconCount === 1 ? "" : "s"} placed.`}
      </p>
    </div>
  );
}

/** The provider, shared with SVG to upload — one setup for the whole app. */
function ProviderFields({ meta }: { meta: BuilderMeta }) {
  return (
    <div className="bld-group" data-testid="builder-provider">
      <h4 className="bld-group-title">Gemini · sheet metadata generation</h4>
      <label className="bld-field">
        <span className="bld-label">Model</span>
        <input className="bld-input" data-testid="builder-model" aria-label="Gemini model id" spellCheck={false}
          value={meta.gemini.model} onChange={(e) => meta.setGemini({ model: e.target.value })} />
      </label>
      <label className="bld-field">
        <span className="bld-label">Endpoint</span>
        <input className="bld-input" data-testid="builder-endpoint" aria-label="Gemini base URL" spellCheck={false}
          value={meta.gemini.baseUrl} onChange={(e) => meta.setGemini({ baseUrl: e.target.value })} />
      </label>
      <KeySlot {...KEY_TEXT} keySet={meta.keySet} title="Gemini API key"
        mask={meta.keySet ? "•••••• saved on this device" : "no key yet"}
        note="shared with SVG to upload — stored on this device only"
        onEdit={() => undefined} onForget={meta.forgetKey} />
    </div>
  );
}

/** The answer: what was written, how it was judged, and whether it still applies. */
function Record({ record, stale, last }: { record: SheetMetaRecord | null; stale: boolean; last: SheetMetaResult | null }) {
  return (
    <div className="bld-group" data-testid="builder-meta-result">
      {last !== null && last.outcome !== "generated" && (
        <p className="bld-note" data-testid="builder-meta-outcome" data-outcome={last.outcome}>{last.detail}</p>
      )}
      {record === null ? (
        <p className="bld-note" data-testid="builder-meta-empty">No metadata yet — nothing has been sent.</p>
      ) : (
        <>
          <p className="bld-label" data-testid="builder-meta-state" data-state={record.state}>
            {stateLine(record, stale)}
          </p>
          <p className="bld-note" data-testid="builder-meta-title">{record.title}</p>
          <p className="bld-note" data-testid="builder-meta-description">{record.description}</p>
          <p className="bld-note" data-testid="builder-meta-tags">{record.tags.join(", ")}</p>
          {record.validation.warnings.length > 0 && (
            <p className="bld-note" data-testid="builder-meta-warnings">{record.validation.warnings.join(" · ")}</p>
          )}
        </>
      )}
    </div>
  );
}

/** The record's state in one honest sentence (stale wins over everything). */
function stateLine(record: SheetMetaRecord, stale: boolean): string {
  if (stale) return "Describes an earlier sheet — generate again to make it current.";
  if (record.state === "accepted") return "Accepted.";
  if (record.state === "invalid") return `Not valid: ${record.validation.errors.join("; ")}`;
  return "Generated for this sheet.";
}
