// builtin.ts — the built-in PostScript-subset + native Illustrator 10 vector
// EPS writer behind the common converter contract. Always available, 100% pure
// browser TypeScript, zero external binaries, zero raster elements allowed.

import { verifyEps, writeEps } from "../eps";
import type { ConvertResult, EpsConverter, EpsConvertInput } from "./types";

export const BUILTIN_WRITER = "builtin-subset-6";

export const builtinConverter: EpsConverter = {
  id: "builtin",
  label: "Built-in (PostScript subset)",
  probe: async () => ({ ok: true, version: BUILTIN_WRITER }),
  convert: async (input: EpsConvertInput): Promise<ConvertResult> => {
    const out = writeEps(input.svg, input.background, {
      title: input.title, ...(input.createdAt === undefined ? {} : { createdAt: input.createdAt }),
    });
    if (!out.ok) return { ok: false, reason: out.reason };
    const verdict = verifyEps(out.eps);
    if (!verdict.ok) return { ok: false, reason: `the EPS is not executable: ${verdict.errors[0]}` };
    return { ok: true, eps: out.eps, writer: BUILTIN_WRITER, fixes: out.fixes };
  },
};
