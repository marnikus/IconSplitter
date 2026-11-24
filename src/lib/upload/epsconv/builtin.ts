// builtin.ts — the built-in PostScript-subset writer as a converter (2026-10-09):
// `writeEps` behind the common contract. Always available; the writer id tracks
// output changes so the planner can refresh stale EPS files selectively.

import { verifyEps, writeEps, writeEpsFromRoot } from "../eps";
import type { ConvertResult, EpsConverter, EpsConvertInput } from "./types";

// -5 (2026-11-24): no %%Title / %AI comments — older EPS files are rebuilt by the planner.
export const BUILTIN_WRITER = "builtin-vector-5";

export const builtinConverter: EpsConverter = {
  id: "builtin",
  label: "Built-in (vector gradients, Level 3)",
  probe: async () => ({ ok: true, version: BUILTIN_WRITER }),
  convert: async (input: EpsConvertInput): Promise<ConvertResult> => {
    const opts = input.createdAt === undefined ? {} : { createdAt: input.createdAt };
    const out = input.svgRoot !== undefined
      ? writeEpsFromRoot(input.svgRoot, input.svg, input.background, opts)
      : writeEps(input.svg, input.background, opts);
    if (!out.ok) return { ok: false, reason: out.reason };
    // The program is checked before it is answered (I-61): a document the
    // interpreter would stop in is an honest stage failure, never a file.
    const verdict = verifyEps(out.eps);
    if (!verdict.ok) return { ok: false, reason: `the EPS is not executable: ${verdict.errors[0]}` };
    return { ok: true, eps: out.eps, writer: BUILTIN_WRITER, fixes: out.fixes };
  },
};
