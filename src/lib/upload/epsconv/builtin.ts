// builtin.ts — the built-in PostScript-subset writer as a converter (2026-10-09):
// `writeEps` unchanged behind the common contract. Always available; its
// writer id is the one every pre-2026-10-09 package already carries.

import { verifyEps, writeEps } from "../eps";
import type { ConvertResult, EpsConverter, EpsConvertInput } from "./types";

export const BUILTIN_WRITER = "builtin-subset-1";

export const builtinConverter: EpsConverter = {
  id: "builtin",
  label: "Built-in (PostScript subset)",
  probe: async () => ({ ok: true, version: BUILTIN_WRITER }),
  convert: async (input: EpsConvertInput): Promise<ConvertResult> => {
    const out = writeEps(input.svg, input.background, {
      title: input.title, ...(input.createdAt === undefined ? {} : { createdAt: input.createdAt }),
    });
    if (!out.ok) return { ok: false, reason: out.reason };
    // The program is checked before it is answered (I-61): a document the
    // interpreter would stop in is an honest stage failure, never a file.
    const verdict = verifyEps(out.eps);
    if (!verdict.ok) return { ok: false, reason: `the EPS is not executable: ${verdict.errors[0]}` };
    return { ok: true, eps: out.eps, writer: BUILTIN_WRITER, fixes: out.fixes };
  },
};
