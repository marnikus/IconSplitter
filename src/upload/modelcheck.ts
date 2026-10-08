// modelcheck.ts — the provider-verified model check (CP-8): one protected GET
// against the provider's own model list, reported as found / missing / failed.
// The configured id is NEVER substituted from the answer — a human decides —
// and the key travels in the auth header, never in a URL or a log line.

import { useCallback, useRef, type Dispatch } from "react";
import { DEFAULT_MODEL, type GeminiConfig } from "../lib/upload/gemini";
import { listGeminiModels } from "../lib/upload/geminimodels";
import { redact } from "../lib/svgsecret";
import { log } from "../log/logstore";
import type { UploadAction } from "./statemodel";
import { modelCheckedSpec } from "./uploadlog";
import type { ModelCheck } from "./types";

/** The slice of the tab context a model check needs (RULE 16: narrow input). */
export interface ModelCheckCtx {
  m: { gemini: GeminiConfig };
  refs: { key: { current: string | null } };
  dispatch: Dispatch<UploadAction>;
  say: (msg: string, err?: boolean) => void;
}

/** The action hook: ask, report, log — and never touch the configured id. */
export function useModelCheckActions(ctx: ModelCheckCtx): { checkModel: () => void } {
  const latest = useRef(ctx);
  latest.current = ctx;
  const checkModel = useCallback(() => {
    void (async () => {
      const c = latest.current;
      const key = c.refs.key.current;
      const model = c.m.gemini.model || DEFAULT_MODEL;
      if (key === null || key.trim() === "") {
        c.say("Save the Gemini API key first — the check sends it in the auth header", true);
        return;
      }
      c.dispatch({ type: "model-check", check: { state: "checking", detail: "" } });
      const out = await listGeminiModels({ config: c.m.gemini, apiKey: key });
      const check = checkResult(out, model, key);
      c.dispatch({ type: "model-check", check });
      log(modelCheckedSpec({ model, ok: check.state === "found", reason: check.detail }));
      c.say(check.detail, check.state !== "found");
    })();
  }, []);
  return { checkModel };
}

/** The provider's answer → the one line the card shows (never a substitution). */
function checkResult(
  out: Awaited<ReturnType<typeof listGeminiModels>>, model: string, key: string,
): ModelCheck {
  if (!out.ok) {
    return { state: "failed", detail: `the model check failed — ${redact(out.failure.message, key)}` };
  }
  if (out.ids.includes(model)) {
    return { state: "found", detail: `the provider lists ${model} (${out.ids.length} model${out.ids.length === 1 ? "" : "s"} checked)` };
  }
  return {
    state: "missing",
    detail: `the provider does not list ${model} — the model id was NOT changed for you; pick one the provider lists`,
  };
}
