// SvgConfirmFullPrompt.tsx — shows the COMPLETE prompt that will be sent
// for the current request page (2026-10-10, extended from 2026-10-09 preview).
// - Generation: full prompt = batchPrompt/singlePrompt with manifest + main prompt
// - Regeneration: full prompt = currentSvgPrompt(presetText, stem, code) with
//   title detection line + current SVG code verbatim.
// The code is read from disk via readSvgText, so the preview is the exact
// text the runner will send (RULE 8 — honest preview).

import { useEffect, useMemo, useState } from "react";
import type { BatchPlan } from "../lib/svgbatch";
import { batchPrompt, singlePrompt } from "../lib/svgprompt";
import { currentSvgPrompt, type RegenPlan } from "../lib/svgregen";
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
  sourceId: string;
  stem: string;
  code: string | null;
  path: string | null;
}

export function FullPromptPreview(p: Props) {
  const { operation, prompt, presets, selected, active, picked, rootRef } = p;
  const selectedPreset = useMemo(() => presets.find((pr) => pr.name === selected) ?? null, [presets, selected]);
  const generationFull = useGenerationFull(operation, active, prompt, picked);
  const { codes, loading } = useRegenCodes(operation, active, picked, rootRef);
  if (operation === "generate") return <GenerationPreview full={generationFull} requestId={active?.id ?? ""} />;
  if (active === null || presets.length === 0 || selectedPreset === null) return null;
  return <RegenPreview preset={selectedPreset} active={active} codes={codes} loading={loading} selected={selected} />;
}

function useGenerationFull(operation: SvgOperation, active: BatchPlan | null, prompt: string, picked: SvgRow[]) {
  return useMemo(() => {
    if (operation !== "generate" || active === null) return null;
    const items = active.items;
    if (items.length === 1) {
      const row = picked.find((r) => r.source.id === items[0].sourceId);
      const stem = row?.source.stem ?? items[0].name.replace(/_AI$/, "");
      return singlePrompt(prompt, stem);
    }
    return batchPrompt(prompt, items);
  }, [operation, active, prompt, picked]);
}

function useRegenCodes(operation: SvgOperation, active: BatchPlan | null, picked: SvgRow[], rootRef: Props["rootRef"]) {
  const [codes, setCodes] = useState<LoadedCode[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (operation !== "regenerate" || active === null) { setCodes([]); return; }
    const root = rootRef.current;
    if (root === null) {
      setCodes(active.items.map((it) => {
        const row = picked.find((r) => r.source.id === it.sourceId);
        return { sourceId: it.sourceId, stem: row?.source.stem ?? it.name, code: null, path: null };
      }));
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
    loaded.push({ sourceId: item.sourceId, stem: row?.source.stem ?? item.name.replace(/_AI$/, ""), code, path });
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
        Complete text sent with the image(s) above — manifest + response contract + your main prompt.
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
  return (
    <section className="svg-confirm-prompt" aria-label="Full regeneration prompts">
      <div className="svg-field-label">Full prompt that will be sent — {active.items.length} icon(s) in this request, each with its own SVG</div>
      {loading && <p className="svg-note" data-testid="svg-confirm-full-prompt-loading">Loading current SVG code…</p>}
      {!loading && codes.map((c) => <OneRegen key={c.sourceId} code={c} presetText={preset.text} />)}
      <small className="svg-note" data-testid="svg-confirm-full-prompt-note">
        Each prompt = your selected preset “{selected}” + Icon name line (title detection) + Current SVG code verbatim. One request per icon.
      </small>
    </section>
  );
}

function OneRegen({ code, presetText }: { code: LoadedCode; presetText: string }) {
  const full = code.code ? currentSvgPrompt(presetText, code.stem, code.code) : `(SVG code not readable — will fall back to main prompt for ${code.stem})`;
  return (
    <div className="svg-confirm-full-one" data-testid={`svg-confirm-full-prompt-${code.sourceId}`}>
      <div className="svg-field-label" style={{ marginTop: 8 }}>{code.stem} — {code.path ?? "no SVG yet"}</div>
      <pre data-testid="svg-confirm-full-prompt" className="svg-code" style={{ maxHeight: 320, overflow: "auto", whiteSpace: "pre-wrap" }}>{full}</pre>
    </div>
  );
}
