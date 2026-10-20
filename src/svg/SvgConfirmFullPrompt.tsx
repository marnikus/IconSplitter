// SvgConfirmFullPrompt.tsx — shows the exact prompt payload sent for the active
// request page (generation: singlePrompt/batchPrompt; regeneration: single-icon
// currentSvgPrompt or multi-icon batchRegenPrompt with all batch SVG codes).

import { useEffect, useMemo, useState } from "react";
import type { BatchPlan } from "../lib/svgbatch";
import { batchPrompt, singlePrompt } from "../lib/svgprompt";
import { batchRegenPrompt, currentSvgPrompt, type RegenPlan } from "../lib/svgregen";
import type { DirHandleLike } from "../lib/fs";
import { readSvgText } from "./svgfiles";
import { previewTargetOf } from "./rowmodel";
import { inIdOrder } from "../lib/selectionorder";
import type { PromptPreset } from "../lib/promptpresets";
import type { SvgOperation, SvgRow } from "./types";

interface Props {
  operation: SvgOperation;
  prompt: string;
  presets: PromptPreset[];
  selected: string;
  regen: RegenPlan | null;
  active: BatchPlan | null;
  picked: SvgRow[];
  rootRef: { current: DirHandleLike | null };
}

interface LoadedCode {
  position: number;
  sourceId: string;
  name: string;
  code: string | null;
  path: string | null;
}

export function FullPromptPreview(p: Props) {
  const { operation, prompt, presets, selected, active, picked, rootRef } = p;
  const selectedPreset = useMemo(() => presets.find((pr) => pr.name === selected) ?? null, [presets, selected]);
  const generationFull = useGenerationFull(operation, active, prompt);
  const { codes, loading } = useRegenCodes(operation, active, picked, rootRef);
  if (operation === "generate") return <GenerationPreview full={generationFull} requestId={active?.id ?? ""} />;
  if (active === null || presets.length === 0 || selectedPreset === null) return null;
  return <RegenPreview preset={selectedPreset} active={active} codes={codes} loading={loading} selected={selected} />;
}

function useGenerationFull(operation: SvgOperation, active: BatchPlan | null, prompt: string) {
  return useMemo(() => {
    if (operation !== "generate" || active === null) return null;
    if (active.items.length === 1) return singlePrompt(prompt, active.items[0].name);
    return batchPrompt(prompt, active.items);
  }, [operation, active, prompt]);
}

function useRegenCodes(operation: SvgOperation, active: BatchPlan | null, picked: SvgRow[], rootRef: Props["rootRef"]) {
  const [codes, setCodes] = useState<LoadedCode[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (operation !== "regenerate" || active === null) { setCodes([]); return; }
    const root = rootRef.current;
    if (root === null) {
      setCodes(active.items.map((it) => ({
        position: it.position, sourceId: it.sourceId, name: it.name, code: null, path: null,
      })));
      return;
    }
    setLoading(true);
    let live = true;
    void loadCodes(active, picked, root, (loaded) => {
      if (live) { setCodes(loaded); setLoading(false); }
    });
    return () => { live = false; };
  }, [operation, active, picked, rootRef]);
  return { codes, loading };
}

async function loadCodes(active: BatchPlan, picked: SvgRow[], root: DirHandleLike, done: (c: LoadedCode[]) => void) {
  const loaded: LoadedCode[] = [];
  for (const item of active.items) {
    const row = inIdOrder(picked, [item.sourceId], (r) => r.source.id)[0];
    const target = row ? previewTargetOf(row) : null;
    const path = target?.svgPath ?? null;
    const code = path ? await readSvgText(root, path) : null;
    loaded.push({ position: item.position, sourceId: item.sourceId, name: item.name, code, path });
  }
  done(loaded);
}

function GenerationPreview({ full, requestId }: { full: string | null; requestId: string }) {
  if (full === null) return null;
  return (
    <section className="svg-confirm-prompt" aria-label="Full generation prompt">
      <div className="svg-field-label">Full prompt that will be sent — Request {requestId}</div>
      <pre data-testid="svg-confirm-full-prompt" className="svg-code" style={{ maxHeight: 320, overflow: "auto", whiteSpace: "pre-wrap" }}>{full}</pre>
      <small className="svg-note" data-testid="svg-confirm-full-prompt-note">
        Complete text sent with the image(s) above — manifest + response contract + your selected prompt.
      </small>
    </section>
  );
}

function RegenPreview({
  preset, active, codes, loading, selected,
}: {
  preset: PromptPreset;
  active: BatchPlan;
  codes: LoadedCode[];
  loading: boolean;
  selected: string;
}) {
  const isBatch = active.items.length > 1;
  return (
    <section className="svg-confirm-prompt" aria-label="Full regeneration prompts">
      <div className="svg-field-label">
        Full prompt that will be sent — Request {active.id} ({active.items.length} icon(s) in this request)
      </div>
      {loading && <p className="svg-note" data-testid="svg-confirm-full-prompt-loading">Loading current SVG code…</p>}
      {!loading && isBatch && <BatchRegenBody codes={codes} presetText={preset.text} requestId={active.id} />}
      {!loading && !isBatch && codes[0] && <OneRegen code={codes[0]} presetText={preset.text} />}
      <small className="svg-note" data-testid="svg-confirm-full-prompt-note">
        Preset “{selected}” + strict &lt;title&gt; mapping + current SVG code(s) verbatim for all {active.items.length} icon(s) in this request.
      </small>
    </section>
  );
}

function BatchRegenBody({ codes, presetText, requestId }: { codes: LoadedCode[]; presetText: string; requestId: string }) {
  const full = batchRegenPrompt(presetText, codes.map((c) => ({
    position: c.position,
    name: c.name,
    code: c.code ?? `(SVG file unreadable for ${c.name})`,
  })));
  return (
    <div className="svg-confirm-full-one" data-testid={`svg-confirm-full-batch-${requestId}`}>
      <pre data-testid="svg-confirm-full-prompt" className="svg-code" style={{ maxHeight: 320, overflow: "auto", whiteSpace: "pre-wrap" }}>{full}</pre>
    </div>
  );
}

function OneRegen({ code, presetText }: { code: LoadedCode; presetText: string }) {
  const full = code.code
    ? currentSvgPrompt(presetText, code.name, code.code)
    : `(SVG code not readable — will fall back to main prompt for ${code.name})`;
  return (
    <div className="svg-confirm-full-one" data-testid={`svg-confirm-full-prompt-${code.sourceId}`}>
      <div className="svg-field-label" style={{ marginTop: 8 }}>{code.name} — {code.path ?? "no SVG yet"}</div>
      <pre data-testid="svg-confirm-full-prompt" className="svg-code" style={{ maxHeight: 320, overflow: "auto", whiteSpace: "pre-wrap" }}>{full}</pre>
    </div>
  );
}
