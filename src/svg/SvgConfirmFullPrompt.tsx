// SvgConfirmFullPrompt.tsx — the COMPLETE prompt that will be sent for the
// request page in view (2026-10-10; batch regeneration 2026-10-20).
// - Generation: batchPrompt/singlePrompt built from the CHOSEN prompt (the main
//   one or a saved preset's own text), so a preset batch previews its preset.
// - Regeneration: one text for the whole page — the preset, the manifest, the
//   response contract and every carried icon's current SVG code, built by the
//   SAME function the runner uses, from the SAME frozen codes.

import { useMemo } from "react";
import type { BatchPlan } from "../lib/svgbatch";
import { batchPrompt, singlePrompt } from "../lib/svgprompt";
import { choiceText, type PromptChoice } from "../lib/prompttasks";
import { regenBatchPrompt, type RegenCodeItem } from "../lib/svgregen";
import type { RegenCode } from "./regencodes";
import type { SvgOperation, SvgRow } from "./types";

interface Props {
  operation: SvgOperation;
  prompt: string;
  choice: PromptChoice;
  active: BatchPlan | null;
  picked: SvgRow[];
  codes: ReadonlyMap<string, RegenCode>;
  loading: boolean;
}

export function FullPromptPreview(p: Props) {
  const full = useMemo(() => fullTextOf(p), [p]);
  if (p.loading) return <p className="svg-note" data-testid="svg-confirm-full-prompt-loading">Loading current SVG code…</p>;
  if (full === null) return null;
  return (
    <section className="svg-confirm-prompt" aria-label="Full prompt that will be sent">
      <div className="svg-field-label">
        Full prompt that will be sent — Request {p.active?.id ?? ""}
        {p.operation === "regenerate" ? ` · ${p.active?.items.length ?? 0} icon(s) in this request, each with its own SVG` : ""}
      </div>
      <pre data-testid="svg-confirm-full-prompt" className="svg-code"
        style={{ maxHeight: 320, overflow: "auto", whiteSpace: "pre-wrap" }}>{full}</pre>
      <small className="svg-note" data-testid="svg-confirm-full-prompt-note">
        {p.operation === "regenerate"
          ? "Your selected prompt + the ordered manifest + the current SVG code of every icon in this request. The answer is matched back by SVG <title>."
          : "Complete text sent with the image above — manifest + response contract + your chosen prompt."}
      </small>
    </section>
  );
}

function fullTextOf(p: Props): string | null {
  if (p.active === null) return null;
  if (p.operation === "generate") return generationText(p, p.active);
  return regenerationText(p, p.active);
}

function generationText(p: Props, active: BatchPlan): string {
  const prompt = choiceText(p.choice, p.prompt);
  if (active.items.length === 1) {
    const row = p.picked.find((r) => r.source.id === active.items[0].sourceId);
    return singlePrompt(prompt, row?.source.stem ?? active.items[0].name.replace(/_AI$/, ""));
  }
  return batchPrompt(prompt, active.items);
}

function regenerationText(p: Props, active: BatchPlan): string {
  const presetText = p.choice.kind === "preset" ? p.choice.text : p.prompt;
  return regenBatchPrompt(presetText, codeItemsOf(active, p.codes));
}

/** The page's codes in manifest order; a missing one is named, never invented. */
function codeItemsOf(active: BatchPlan, codes: ReadonlyMap<string, RegenCode>): RegenCodeItem[] {
  return active.items.map((item) => {
    const code = codes.get(item.sourceId);
    return { position: item.position, name: item.name, code: code?.code ?? `(the current SVG of ${item.name} could not be read — it is left out of this batch)` };
  });
}
